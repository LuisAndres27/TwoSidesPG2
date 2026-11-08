// B87 — DISPOSABLE local check of the Caddy block that the AWS guide prescribes for the unauthenticated password-reset endpoints (CVE-2026-72898 workaround).
// The Caddyfile under test is EXTRACTED FROM THE GUIDE (docs/B87_GUIA_AWS_METABASE.md), with only three local substitutions: no TLS/domain, plain :8080, upstream = the disposable container.
// Opt-in: B87_REAL_TESTS=1. Never Atlas, never AWS, never B85, never the owner's containers.
import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFile} from 'node:child_process';import {randomBytes} from 'node:crypto';
import {HARDENED_ENV,HARDENED_FLAGS} from './hardening.js';

const enabled=process.env.B87_REAL_TESTS==='1';
const IMAGE=process.env.B87_METABASE_IMAGE??'metabase/metabase@sha256:b62ac14872e9992d28218a2264d99484e0707064aae9fb594d8fbb3bc1518a9e';
const CADDY_IMAGE=process.env.B87_CADDY_IMAGE??'caddy:2';
const N={net:'twosides-b87-caddy-net',mb:'twosides-b87-caddy-mb',caddy:'twosides-b87-caddy-proxy',vol:'twosides-b87-caddy-mbdata'};const LABEL=['--label','twosides.b87.disposable=true'];
const env=()=>Object.fromEntries(['SystemRoot','PATH','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramData','ProgramFiles','TEMP','TMP'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
const docker=(...a)=>new Promise((res,rej)=>execFile('docker',a,{windowsHide:true,timeout:180000,env:env()},(e,out)=>e?rej(Error('docker failed: '+a.slice(0,2).join(' '))):res(out.trim())));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const guide=fs.readFileSync(new URL('../../docs/B87_GUIA_AWS_METABASE.md',import.meta.url),'utf8');
export function guideCaddyfile(){const m=guide.match(/\*\*6\.4 Caddy[\s\S]*?```\n([\s\S]*?)\n```/);if(!m)throw Error('Caddyfile not found in the guide');return m[1];}
export function localCaddyfile(upstream){
 let c=guideCaddyfile();
 c=c.replace('auto_https disable_redirects','auto_https off\n\tadmin off').replace('NOMBRE {',':8080 {').replace(/\ttls \{[\s\S]*?\n\t\}\n/,'').replace('127.0.0.1:3000',upstream+':3000');
 if(/NOMBRE|issuer|disable_http_challenge/.test(c))throw Error('local Caddyfile substitution failed');return c;
}
async function cleanup(){
 for(const n of [N.caddy,N.mb]){try{const l=JSON.parse(await docker('inspect',n))[0].Config.Labels;if(l?.['twosides.b87.disposable']==='true')await docker('rm','-f','-v',n);}catch{}}
 try{const l=JSON.parse(await docker('volume','inspect',N.vol))[0].Labels;if(l?.['twosides.b87.disposable']==='true')await docker('volume','rm','-f',N.vol);}catch{}
 try{const l=JSON.parse(await docker('network','inspect',N.net))[0].Labels;if(l?.['twosides.b87.disposable']==='true')await docker('network','rm',N.net);}catch{}
}
const raw=(port,pathAndQuery,{method='GET',body,headers={}}={})=>new Promise((resolve,reject)=>{   // raw request line: no client-side path normalisation
 import('node:net').then(({default:net})=>{
  const s=net.connect(port,'127.0.0.1'),b=body===undefined?'':JSON.stringify(body);let data='';
  s.on('connect',()=>s.write(`${method} ${pathAndQuery} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n${b?`Content-Type: application/json\r\nContent-Length: ${Buffer.byteLength(b)}\r\n`:''}${Object.entries(headers).map(([k,v])=>`${k}: ${v}\r\n`).join('')}\r\n${b}`));
  s.on('data',d=>data+=d);s.on('error',reject);s.on('close',()=>{const i=data.indexOf('\r\n\r\n'),head=data.slice(0,i),status=Number(head.split(' ')[1]);resolve({status,head,body:data.slice(i+4)});});
 });
});
const PORT=4390,ADMIN_PW='Caddy-Test-'+randomBytes(12).toString('base64url');

describe.skipIf(!enabled)('B87 Caddy block for the password-reset endpoints (disposable, local)',()=>{
 let direct;
 beforeAll(async()=>{
  await cleanup();
  fs.mkdirSync(path.join(os.tmpdir(),'b87-caddy'),{recursive:true});
  const file=path.join(os.tmpdir(),'b87-caddy','Caddyfile');fs.writeFileSync(file,localCaddyfile(N.mb));
  await docker('network','create',...LABEL,N.net);await docker('volume','create',...LABEL,N.vol);
  await docker('run','-d','--name',N.mb,...LABEL,'--network',N.net,'--memory','1536m','--cpus','2','-p','127.0.0.1:4391:3000','-v',N.vol+':/metabase-data','-e','MB_DB_FILE=/metabase-data/metabase','-e','JAVA_OPTS=-Xmx1024m','-e','MB_ANON_TRACKING_ENABLED=false','-e','MB_CHECK_FOR_UPDATES=false',
   ...HARDENED_FLAGS,'-e','MB_ENCRYPTION_SECRET_KEY='+randomBytes(32).toString('base64'),'-e','MB_SESSION_SECRET_KEY='+randomBytes(32).toString('base64'),...HARDENED_ENV.flatMap(v=>['-e',v]),IMAGE);
  await docker('run','-d','--name',N.caddy,...LABEL,'--network',N.net,'--cap-drop=ALL','--security-opt','no-new-privileges:true','-p',`127.0.0.1:${PORT}:8080`,'-v',file+':/etc/caddy/Caddyfile:ro',CADDY_IMAGE);
  for(let i=0;;i++){try{const r=await fetch('http://127.0.0.1:4391/api/health',{headers:{'X-Forwarded-Proto':'https'},redirect:'manual'});if(r.ok)break;}catch{}if(i>180)throw Error('Metabase did not start');await pause(2000);}
  direct=async(p,o)=>raw(4391,p,{...o,headers:{'X-Forwarded-Proto':'https',...(o?.headers??{})}});
 },900000);
 afterAll(async()=>{await cleanup();},120000);

 it('the Caddyfile taken from the guide validates (caddy validate)',async()=>{
  const out=await docker('run','--rm','-v',path.join(os.tmpdir(),'b87-caddy','Caddyfile')+':/etc/caddy/Caddyfile:ro',CADDY_IMAGE,'caddy','validate','--config','/etc/caddy/Caddyfile','--adapter','caddyfile').catch(e=>e.message);
  expect(String(out)).not.toMatch(/failed/i);
 });
 it('login and the dashboard API keep working through Caddy; the reset endpoints are blocked (also with case, encoding and slash tricks)',async()=>{
  const props=await raw(PORT,'/api/session/properties');expect(props.status).toBe(200);
  const token=JSON.parse(props.body.slice(props.body.indexOf('{'),props.body.lastIndexOf('}')+1))['setup-token'];expect(token).toBeTruthy();
  const setup=await raw(PORT,'/api/setup',{method:'POST',body:{token,user:{first_name:'Admin',last_name:'Test',email:'admin@example.test',password:ADMIN_PW},prefs:{site_name:'t',allow_tracking:false}}});expect(setup.status).toBe(200);
  const login=await raw(PORT,'/api/session',{method:'POST',body:{username:'admin@example.test',password:ADMIN_PW}});expect(login.status).toBe(200);
  const sid=JSON.parse(login.body.slice(login.body.indexOf('{'),login.body.lastIndexOf('}')+1)).id;expect(sid).toBeTruthy();
  const dash=await raw(PORT,'/api/dashboard',{headers:{'X-Metabase-Session':sid}});expect(dash.status).toBe(200);
  const home=await raw(PORT,'/');expect([200,302]).toContain(home.status);
  // Through Caddy the reset endpoints never reach Metabase.
  const attempts=['/api/session/reset_password','/api/session/forgot_password','/api/session/reset_password/','/api/session/reset_password?token=x','/API/SESSION/RESET_PASSWORD','/api/session/Reset_Password',
   '/api/session/%72eset_password','/api/session/forgot%5Fpassword','//api/session/reset_password','/api//session//reset_password','/api/session/./reset_password','/api/x/../session/reset_password'];
  const seen=[];
  for(const method of ['POST','GET']){for(const p of attempts){const r=await raw(PORT,p,{method,body:method==='POST'?{token:'x',password:'y'}:undefined});seen.push([method,p,r.status]);}}
  // Anything answered by Metabase would be 400/401/404 with a Metabase body or 200; a block is 404 with Caddy's text. Compare with direct access for the exact endpoint to prove the difference.
  for(const [method,p,status] of seen)expect([200,400],`${method} ${p} reached Metabase`).not.toContain(status);
  const viaCaddy=await raw(PORT,'/api/session/reset_password',{method:'POST',body:{token:'x',password:'y'}});expect(viaCaddy.status).toBe(404);expect(viaCaddy.body).toContain('Not found');
  const viaDirect=await direct('/api/session/reset_password',{method:'POST',body:{token:'x',password:'y'}});
  console.log('B87 Caddy block: direct status',viaDirect.status,'| via Caddy',viaCaddy.status);
  expect(viaDirect.body).not.toBe(viaCaddy.body);   // the direct endpoint does answer (400 invalid token): so the 404 above is Caddy's, not Metabase's
  fs.writeFileSync(path.join(os.tmpdir(),'b87-caddy','observed.json'),JSON.stringify({direct:[viaDirect.status,viaDirect.body.slice(0,120)],caddy:[viaCaddy.status,viaCaddy.body.slice(0,40)],attempts:seen}));console.log('B87 Caddy block attempts:',JSON.stringify(seen.filter(x=>x[0]==='POST').map(x=>x[2])));
 },300000);
});
