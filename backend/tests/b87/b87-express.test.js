// B87 offline: the persistent local Express for the authorized test game (tools/b87/express-atlas*.mjs/.ps1). Disposable synthetic store on disk, loopback only. No Atlas, no Docker.
import {describe,it,expect,afterEach} from 'vitest';
import {spawnSync} from 'node:child_process';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {SyntheticStatisticsStore,newSyntheticDirectory} from '../../src/modules/statistics/synthetic-store.js';
import {B84_KEY} from '../../tools/b84/demo-key.js';
import {generateDemoEvents,toEnvelope} from '../../tools/b84/generator.js';
import {startKitExpress,ExpressKitError,KIT_FILES,TOKEN_LIFETIME_MS} from '../../tools/b87/express-atlas-lib.mjs';
import {importGraph,forbidden} from '../b86/import-graph.js';

const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const base=Date.parse('2026-11-05T12:00:00.000Z'),t0=Date.now(),clock=()=>base+(Date.now()-t0);
const {events}=generateDemoEvents({installations:2,days:3});
const ids=[...new Set(events.map(e=>e.installationId))],mine=events.filter(e=>e.installationId===ids[0]),other=events.filter(e=>e.installationId===ids[1]);
let port=45000+Math.floor(Math.random()*10000);const nextPort=()=>port++;
const cleanup=[];afterEach(async()=>{while(cleanup.length)await cleanup.pop()();});
async function start(options={}){
 const directory=newSyntheticDirectory(),kitDir=path.join(os.tmpdir(),'b87-kit-'+Math.random().toString(36).slice(2));
 const store=new SyntheticStatisticsStore({directory,key:B84_KEY,now:clock});
 const express=await startKitExpress({store,profile:'statistics-offline-test',kitDir,port:nextPort(),now:clock,pollEveryMs:40,...options});
 cleanup.push(async()=>{await express.close();try{await store.close?.();}catch{}fs.rmSync(directory,{recursive:true,force:true});fs.rmSync(kitDir,{recursive:true,force:true});});
 return {express,kitDir,store,kitFile:path.join(kitDir,KIT_FILES.credential),installationFile:path.join(kitDir,KIT_FILES.installation)};
}
const writeInstallation=(file,id)=>fs.writeFileSync(file,JSON.stringify({schema:1,installationId:id}));
const waitFor=async(fn,ms=3000)=>{const end=Date.now()+ms;for(;;){const v=fn();if(v)return v;if(Date.now()>end)throw Error('timeout');await pause(25);}};
const readKit=file=>()=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}};
const post=(audience,token,items)=>fetch(audience+'/api/v1/statistics/events',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(toEnvelope(items))});

describe('B87 persistent local Express (kit hand-over)',()=>{
 it('serves 127.0.0.1 only and issues nothing until the game announces its installation',async()=>{
  const k=await start();expect(k.express.audience).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  await pause(150);expect(fs.existsSync(k.kitFile)).toBe(false);
  const r=await post(k.express.audience,'A'.repeat(43),mine.slice(0,1));expect(r.status).toBe(401);
 });
 it('the game announces its id -> kit.json appears with a 43-character token; events are accepted, then recognised as duplicates',async()=>{
  const k=await start();writeInstallation(k.installationFile,ids[0]);
  const kit=await waitFor(readKit(k.kitFile));
  expect(kit).toMatchObject({schema:1,audience:k.express.audience,installationId:ids[0]});expect(kit.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(kit.expiresAtMs-clock()).toBeGreaterThan(TOKEN_LIFETIME_MS-5000);expect(kit.expiresAtMs-clock()).toBeLessThanOrEqual(TOKEN_LIFETIME_MS);
  const first=await post(kit.audience,kit.token,mine.slice(0,3)),body1=await first.json();
  expect(first.status).toBe(200);expect(body1.Receipts.map(r=>r.Status)).toEqual(['accepted','accepted','accepted']);
  const again=await (await post(kit.audience,kit.token,mine.slice(0,3))).json();expect(again.Receipts.map(r=>r.Status)).toEqual(['duplicate','duplicate','duplicate']);
 });
 it('binds the FIRST installation only: another id is ignored and its events are forbidden',async()=>{
  const k=await start();writeInstallation(k.installationFile,ids[0]);const kit=await waitFor(readKit(k.kitFile));
  writeInstallation(k.installationFile,ids[1]);await waitFor(()=>k.express.state.ignoredOtherInstallations>0);
  expect(readKit(k.kitFile)().installationId).toBe(ids[0]);expect(k.express.state.installationId).toBe(ids[0]);
  const r=await post(kit.audience,kit.token,other.slice(0,1));expect(r.status).toBe(403);
 });
 it('malformed or oversized installation.json is ignored',async()=>{
  const k=await start();fs.writeFileSync(k.installationFile,'{not json');await pause(150);expect(fs.existsSync(k.kitFile)).toBe(false);
  fs.writeFileSync(k.installationFile,JSON.stringify({schema:1,installationId:'not-a-uuid'}));await pause(150);expect(fs.existsSync(k.kitFile)).toBe(false);
  fs.writeFileSync(k.installationFile,JSON.stringify({schema:1,installationId:ids[0],padding:'x'.repeat(600)}));await pause(150);expect(fs.existsSync(k.kitFile)).toBe(false);
  writeInstallation(k.installationFile,ids[0]);await waitFor(readKit(k.kitFile));
 });
 it('renews the credential before it expires (same token, later expiry) and a stale kit.json from a previous run is removed at start',async()=>{
  const kitDir=path.join(os.tmpdir(),'b87-kit-stale-'+Math.random().toString(36).slice(2));fs.mkdirSync(kitDir,{recursive:true});fs.writeFileSync(path.join(kitDir,KIT_FILES.credential),'{"token":"stale"}');
  const directory=newSyntheticDirectory(),store=new SyntheticStatisticsStore({directory,key:B84_KEY,now:clock});
  const express=await startKitExpress({store,profile:'statistics-offline-test',kitDir,port:nextPort(),now:clock,pollEveryMs:40,tokenLifetimeMs:10000,renewEveryMs:1000});
  cleanup.push(async()=>{await express.close();fs.rmSync(directory,{recursive:true,force:true});fs.rmSync(kitDir,{recursive:true,force:true});});
  expect(fs.existsSync(path.join(kitDir,KIT_FILES.credential))).toBe(false);
  writeInstallation(path.join(kitDir,KIT_FILES.installation),ids[0]);const first=await waitFor(readKit(path.join(kitDir,KIT_FILES.credential)));
  const second=await waitFor(()=>{const k=readKit(path.join(kitDir,KIT_FILES.credential))();return k&&k.expiresAtMs>first.expiresAtMs?k:null;},4000);
  expect(second.token).toBe(first.token);expect(express.state.issued).toBeGreaterThanOrEqual(2);
 });
 it('close() deletes kit.json and the token stops working',async()=>{
  const k=await start();writeInstallation(k.installationFile,ids[0]);const kit=await waitFor(readKit(k.kitFile));
  await k.express.close();expect(fs.existsSync(k.kitFile)).toBe(false);
  await expect(post(kit.audience,kit.token,mine.slice(0,1))).rejects.toThrow();
 });
 it('rejects a relative kit folder, a privileged port and an unsafe lifetime',async()=>{
  const store={};
  await expect(startKitExpress({store,profile:'statistics-offline-test',kitDir:'relative',port:4999})).rejects.toBeInstanceOf(ExpressKitError);
  await expect(startKitExpress({store,profile:'statistics-offline-test',kitDir:os.tmpdir(),port:80})).rejects.toBeInstanceOf(ExpressKitError);
  await expect(startKitExpress({store,profile:'statistics-offline-test',kitDir:os.tmpdir(),port:4999,tokenLifetimeMs:7200000})).rejects.toBeInstanceOf(ExpressKitError);
 });
});

describe('B87 express-atlas.mjs / Run-Atlas-Express.ps1',()=>{
 const run=(env,input)=>spawnSync(process.execPath,['tools/b87/express-atlas.mjs','--kit-dir',path.join(os.tmpdir(),'b87-kit-cli')],{cwd:backend,input,encoding:'utf8',timeout:30000,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,...env}});
 it('refuses to start (exit 2, nothing contacted) without the Atlas authorization variables, and never echoes credentials',()=>{
  const r=run({},JSON.stringify({username:'u',password:'Secret-Pass-123456'}));expect(r.status).toBe(2);expect(r.stdout+r.stderr).not.toContain('Secret-Pass-123456');
  const off=run({STATISTICS_ENABLE:'false'},'{}');expect(off.status).toBe(2);
 });
 it('only the ingest identity may run it',()=>{
  const env={STATISTICS_ENABLE:'true',STATISTICS_STORAGE:'atlas-test',STATISTICS_ATLAS_AUTHORIZATION:'wrong',STATISTICS_ATLAS_HOST:'cluster0.abcde.mongodb.net',STATISTICS_DATABASE:'twosides_statistics_demo',STATISTICS_ANALYTICS_DATABASE:'twosides_statistics_analytics_demo',STATISTICS_POLICY_VERSION:'b82-run-hybrid-v1',STATISTICS_SERVICE_USER:'twosides_statistics_reader_v1'};
  const r=run(env,'{}');expect(r.status).toBe(2);
 });
 it('the Atlas entry points never reach tests/ or the B80 guard, and only the ingest connector code is used',()=>{
  for(const entry of ['tools/b87/express-atlas.mjs','tools/b87/express-atlas-lib.mjs']){
   const graph=importGraph(path.join(backend,entry),{backend});expect(graph.files.filter(forbidden),entry).toEqual([]);
  }
 });
 it('the PowerShell wrapper uses hidden prompts, stdin, loopback and clears the variables',()=>{
  const ps=fs.readFileSync(path.join(backend,'tools/b87/Run-Atlas-Express.ps1'),'utf8');
  expect(ps).toContain('-AsSecureString');expect(ps).toContain('| & node tools/b87/express-atlas.mjs');expect(ps).toContain('Remove-Item Env:STATISTICS_*');
  expect(ps).toContain("twosides_statistics_ingest_v1");expect(ps).not.toMatch(/password\s*=\s*['"][^'"]+['"]/i);expect(ps).not.toMatch(/0\.0\.0\.0/);
  expect(ps).not.toMatch(/\$env:\w*PASS/i);expect(/[^\x00-\x7f]/.test(ps)).toBe(false);
 });
});
