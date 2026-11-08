// B87 real test: runs tools/b87/metabase-provision.mjs against a DISPOSABLE local Metabase + MongoDB (tests/b87/stack.js). Opt-in: B87_REAL_TESTS=1.
// Never Atlas, never AWS, never B85's data or containers.
import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {spawn,spawnSync,execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {startStack,removeStack,NAMES,READER,ANALYTICS_DB,HARDENED_ENV,REQUIRED_CAPS} from './stack.js';
import {OWNER_TITLE,CONNECTION_NAME} from '../../tools/b87/metabase-lib.mjs';

const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const OWNER_CONTAINERS=['twosides-b811-mongo','twosides-b85-metabase','twosides-b85-analytics'];
const dockerEnv=Object.fromEntries(['SystemRoot','PATH','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramData','ProgramFiles','TEMP','TMP'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
const ownerState=()=>execFileSync('docker',['ps','-a','--format','{{.Names}}|{{.ID}}|{{.State}}|{{.CreatedAt}}'],{encoding:'utf8',env:dockerEnv}).split('\n').filter(l=>OWNER_CONTAINERS.some(n=>l.startsWith(n+'|'))).sort().join('\n');
const logsOf=name=>execFileSync('docker',['logs',name],{encoding:'utf8',maxBuffer:1<<26,env:dockerEnv,stdio:['ignore','pipe','pipe']});
const logsBoth=name=>{const r=spawnSync('docker',['logs',name],{encoding:'utf8',maxBuffer:1<<26,env:dockerEnv});return (r.stdout??'')+(r.stderr??'');};

let stack,before,run1,run2,summary,adminApi,adminEmail,adminPassword,viewerEmail,viewerPassword,viewerApi;
const api=baseUrl=>{let session;const call=async(p,{method='GET',body}={})=>{const r=await fetch(baseUrl+'/api'+p,{method,headers:{'Content-Type':'application/json',...(session?{'X-Metabase-Session':session}:{})},body:body===undefined?undefined:JSON.stringify(body)});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return {status:r.status,body:j};};call.login=async(username,password)=>{const r=await call('/session',{method:'POST',body:{username,password}});session=r.body.id;return r;};return call;};
// ASYNCHRONOUS on purpose: the proxy stand-in lives in this very process, and spawnSync would block the event loop that has to answer the child.
const provisionCli=(input,env={})=>new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,['tools/b87/metabase-provision.mjs'],{cwd:backend,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,B87_REAL_TESTS:'1',...env}});
 let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();reject(Error('provisioning timed out'));},240000);
 child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);child.on('error',reject);
 child.on('close',status=>{clearTimeout(timer);resolve({status,stdout,stderr});});child.stdin.end(JSON.stringify(input));
});
const result=async(id)=>{const r=await adminApi('/card/'+id+'/query',{method:'POST'});expect(r.status).toBe(202);expect(r.body.status).toBe('completed');return r.body.data;};
const rows=async(id)=>(await result(id)).rows;
// Columns are matched BY NAME (Metabase may order them differently from the pipeline).
const table=async(id)=>{const data=await result(id),names=data.cols.map(c=>c.name);return data.rows.map(r=>Object.fromEntries(names.map((n,i)=>[n,r[i]])));};
const off=body=>body===false||body===''||body===null;   // Metabase answers 204/empty for a setting that is off

beforeAll(async()=>{
 before=ownerState();
 stack=await startStack();
 adminEmail='owner@example.test';adminPassword='Admin-'+Math.random().toString(36).slice(2)+'-Xk9!';viewerEmail='evaluator@example.test';viewerPassword='Viewer-'+Math.random().toString(36).slice(2)+'-Qz7!';
 const input={metabaseUrl:stack.baseUrl,admin:{email:adminEmail,password:adminPassword},mode:'local-test',host:stack.mongoHost,readerPassword:stack.readerPassword,viewer:{email:viewerEmail,password:viewerPassword}};
 run1=await provisionCli(input);summary=run1.status===0?JSON.parse(run1.stdout):undefined;
 run2=await provisionCli(input);
 adminApi=api(stack.baseUrl);await adminApi.login(adminEmail,adminPassword);
},900000);
afterAll(async()=>{await (stack?stack.stop():removeStack());});   // also when the stack failed to start

describe('B87 provisioning on a disposable Metabase',()=>{
 it('the first run succeeds: connection, collection, dashboard, 15 questions, all of them executed',()=>{
  expect(run1.status,run1.stderr).toBe(0);
  expect(summary).toMatchObject({mode:'setup',cards:expect.any(Array),cardsRun:15,cardsCompleted:15,queryCaching:false,publicSharing:false});
  expect(summary.cards).toHaveLength(15);expect(summary.dashcards).toBeGreaterThanOrEqual(15);
 });
 it('titles: collection and dashboard are "Datos de prueba del propietario"; no question or text card says sintético/demostración',async()=>{
  const collections=(await adminApi('/collection')).body;expect(collections.some(c=>c.name===OWNER_TITLE)).toBe(true);
  const dashboard=(await adminApi('/dashboard/'+summary.dashboardId)).body;expect(dashboard.name).toBe(OWNER_TITLE);
  const names=dashboard.dashcards.filter(d=>d.card_id).map(d=>d.card.name);expect(names).toHaveLength(15);
  const texts=dashboard.dashcards.filter(d=>!d.card_id).map(d=>d.visualization_settings?.text??'');expect(texts.length).toBeGreaterThanOrEqual(8);
  expect(JSON.stringify([names,texts,dashboard.description])).not.toMatch(/sint[eé]tic|demostraci[oó]n|\bdemo\b|B84|B85/i);
  expect(texts[0]).toContain(OWNER_TITLE);
 });
 it('the query cache is off everywhere and nothing is shared publicly',async()=>{
  expect(off((await adminApi('/setting/enable-query-caching')).body)).toBe(true);
  const strategy=(await adminApi('/cache')).body.data;expect(strategy).toEqual([{model:'root',model_id:0,strategy:{type:'nocache'}}]);   // the instance-wide strategy is "no cache"
  expect(off((await adminApi('/setting/enable-public-sharing')).body)).toBe(true);expect(off((await adminApi('/setting/enable-embedding-static')).body)).toBe(true);
  const databases=(await adminApi('/database')).body,list=Array.isArray(databases)?databases:databases.data;expect(list.map(d=>d.name)).toEqual([CONNECTION_NAME]);   // the Sample Database is gone
  for(const c of summary.cards.slice(0,3)){const card=(await adminApi('/card/'+c.id)).body;expect(card.cache_ttl??null).toBeNull();}
  const database=(await adminApi('/database/'+summary.databaseId)).body;expect(database.name).toBe(CONNECTION_NAME);expect(database.cache_ttl??null).toBeNull();
 });
 it('the 15 questions equal the independent oracle (same dataset as the Atlas seed)',async()=>{
  const o=stack.oracle,by=Object.fromEntries(summary.cards.map(c=>[c.key,c.id])),scalar=async key=>(await rows(by[key]))[0][0];
  expect(await scalar('installations')).toBe(o.installations);expect(await scalar('started')).toBe(o.gamesStarted);expect(await scalar('completed')).toBe(o.gamesCompleted);
  expect(await scalar('sessions')).toBe(o.sessionsStarted);expect(await scalar('events')).toBe(o.events);
  expect(await scalar('hours')).toBeCloseTo(o.effectiveMs/3600000,6);expect(await scalar('completion')).toBeCloseTo(100*o.gamesCompleted/o.gamesStarted,6);expect(await scalar('minutes_session')).toBeCloseTo(o.effectiveMs/(60000*o.sessionsStarted),6);
  const order=['ocean','jungle','desert','forest','tundra'];
  const labels=['Océano','Selva','Desierto','Bosque','Tundra'],mine=async key=>{const t=await table(by[key]);expect(t.map(r=>r.bioma)).toEqual(labels);return t;};
  expect((await mine('biome_time')).map(r=>r.minutos)).toEqual(order.map(b=>o.biomes[b].effectiveMs/60000));
  expect((await mine('biomes')).map(r=>[r.visitas,r.finalizaciones])).toEqual(order.map(b=>[o.biomes[b].visits,o.biomes[b].completions]));
  expect((await mine('decisions')).map(r=>[r.approve,r.reject])).toEqual(order.map(b=>[o.biomes[b].approve,o.biomes[b].reject]));
  expect((await mine('environment')).map(r=>[r.healthy,r.degraded])).toEqual(order.map(b=>[o.biomes[b].healthy,o.biomes[b].degraded]));
  expect(Object.fromEntries((await table(by.endings)).map(r=>[r.final,r.partidas]))).toEqual(o.endings);
  const days=Object.keys(o.days).sort(),games=await table(by.daily_games),time=await table(by.daily_time);
  expect(games.map(r=>[String(r.fecha).slice(0,10),r.iniciadas,r.completadas])).toEqual(days.map(d=>[d,o.days[d].gamesStarted,o.days[d].gamesCompleted]));
  expect(time.map(r=>[String(r.fecha).slice(0,10),r.minutos])).toEqual(days.map(d=>[d,o.days[d].effectiveMs/60000]));
 });
 it('the connection really authenticates with SCRAM-SHA-1 (the reader exists ONLY with SHA-1, so SHA-256 would have been refused)',()=>{
  const lines=logsBoth(NAMES.mongo).split('\n').map(l=>{try{return JSON.parse(l);}catch{return null;}}).filter(x=>x?.msg==='Successfully authenticated'&&x.attr?.user===READER);
  const mechs=new Set(lines.map(x=>x.attr.mechanism));expect(lines.length).toBeGreaterThan(0);expect([...mechs]).toEqual(['SCRAM-SHA-1']);
 });
 it('no secret reaches the command output, the Metabase logs or the MongoDB logs',()=>{
  const secrets=[stack.readerPassword,adminPassword,viewerPassword,stack.rootPassword];
  const text=[run1.stdout,run1.stderr,run2.stdout,run2.stderr,logsBoth(NAMES.metabase),logsBoth(NAMES.mongo)].join('\n');
  for(const secret of secrets)expect(text.includes(secret),'a secret is present in outputs/logs').toBe(false);
  expect(text).not.toMatch(/mongodb(\+srv)?:\/\/[^\s"']*:[^\s"'@]+@/);
 });
 it('a second run is refused without duplicating anything',async()=>{
  expect(run2.status).toBe(4);expect(run2.stderr).toContain('already_provisioned');
  const collections=(await adminApi('/collection')).body.filter(c=>c.name===OWNER_TITLE);expect(collections).toHaveLength(1);
  const databases=(await adminApi('/database')).body,list=Array.isArray(databases)?databases:databases.data;expect(list.filter(d=>d.name===CONNECTION_NAME)).toHaveLength(1);
 });
 it('the evaluator account is not an administrator and can only view the dashboard and run its saved questions',async()=>{
  viewerApi=api(stack.baseUrl);const login=await viewerApi.login(viewerEmail,viewerPassword);expect(login.status).toBe(200);
  const me=(await viewerApi('/user/current')).body;expect(me.is_superuser).toBe(false);
  const dash=await viewerApi('/dashboard/'+summary.dashboardId);expect(dash.status).toBe(200);
  const card=await viewerApi('/card/'+summary.cards[0].id+'/query',{method:'POST'});expect(card.status).toBe(202);expect(card.body.status).toBe('completed');
  const denied={
   settings:await viewerApi('/setting'),users:await viewerApi('/user'),createCard:await viewerApi('/card',{method:'POST',body:{name:'x',display:'scalar',dataset_query:{database:summary.databaseId,type:'native',native:{collection:'stats_v1_counters',query:'[{"$match":{}}]'}},visualization_settings:{}}}),
   adhocNative:await viewerApi('/dataset',{method:'POST',body:{database:summary.databaseId,type:'native',native:{collection:'stats_v1_counters',query:'[{"$match":{}}]'}}}),
   editDashboard:await viewerApi('/dashboard/'+summary.dashboardId,{method:'PUT',body:{name:'hack'}}),createDatabase:await viewerApi('/database',{method:'POST',body:{engine:'mongo',name:'x',details:{}}}),permissions:await viewerApi('/permissions/graph'),
  };
  for(const [name,r] of Object.entries(denied))expect([401,403],name+' -> '+r.status).toContain(r.status);
 });
 it('hardened server: the security headers are present; the server does NOT validate password strength for users created by an administrator (the tool and the procedure do)',async()=>{
  // Documented limitation of Metabase 0.65.2: no server-side strength rule for admin-created accounts, so provisioning enforces 15+ characters itself (offline tests).
  const weak=await adminApi('/user',{method:'POST',body:{first_name:'x',last_name:'y',email:'common@example.test',password:'Abcd1234'}});console.log('B87 finding: weak password accepted by the server for an admin-created user =',weak.status===200);
  const strong=await adminApi('/user',{method:'POST',body:{first_name:'x',last_name:'y',email:'strong@example.test',password:'Strong-Pass-2026-Zq!x9'}});expect(strong.status).toBe(200);
  const headers=(await fetch(stack.baseUrl+'/')).headers;expect(headers.get('strict-transport-security')).toMatch(/max-age=\d{7,}/);expect(headers.get('x-frame-options')).toBe('DENY');expect(headers.get('x-content-type-options')).toBe('nosniff');expect(headers.get('content-security-policy')).toContain('script-src');
  expect(HARDENED_ENV.join(' ')).not.toMatch(/MB_PASSWORD_(LENGTH|COMPLEXITY)/);   // tested: not enforced, so not claimed
 });
 it('the container is published only on loopback and runs without capabilities or privilege escalation',()=>{
  const inspect=JSON.parse(execFileSync('docker',['inspect',NAMES.metabase],{encoding:'utf8',env:dockerEnv}))[0];
  const bindings=inspect.HostConfig.PortBindings['3000/tcp'];expect(bindings).toEqual([{HostIp:'127.0.0.1',HostPort:expect.any(String)}]);
  expect(inspect.HostConfig.CapDrop).toContain('ALL');expect(inspect.HostConfig.CapAdd.map(c=>c.replace(/^CAP_/,'')).sort()).toEqual([...REQUIRED_CAPS].sort());expect(inspect.Mounts.some(m=>m.Destination==='/metabase-data')).toBe(true);expect(inspect.HostConfig.SecurityOpt).toContain('no-new-privileges:true');expect(inspect.HostConfig.PidsLimit).toBe(512);expect(inspect.HostConfig.Privileged).toBe(false);
  expect(inspect.Config.Env.some(v=>v.startsWith('MB_SESSION_SECRET_KEY='))&&inspect.Config.Env.some(v=>v.startsWith('MB_ENCRYPTION_SECRET_KEY='))).toBe(true);
 });
 it('the owner\'s containers and B85 files are untouched',()=>{
  expect(ownerState()).toBe(before);
  const pins={'tools/b85/questions.mjs':'d5e40df8594b8db51fc1a8315517fd1e664e69fb13b253f200932e6e9ce56e49','tools/b85/configure.mjs':'e61b7c773e115c6fb33023d0a2ae0abdb14d5006c8f18e9e81ef529b714eb648','tools/b85/layout.mjs':'cc9b3fff17969208492f4dbb9d82975ac17e2ed03728be4e4c15ff671bde375a','tools/b85/runtime.mjs':'7754bc7f678dfdf02575741e94fc38f41240414b2ffb0e922e306a5641c8097e'};
  for(const [file,hash] of Object.entries(pins))expect(createHash('sha256').update(fs.readFileSync(path.join(backend,file))).digest('hex'),file).toBe(hash);
 });
});
