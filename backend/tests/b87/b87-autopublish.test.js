// B87 offline: the automatic local publisher (tools/b87/auto-publish*.mjs/.ps1). Fake fingerprint/publish functions with real (short) timers: no Atlas, no network.
import {describe,it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createAutoPublisher,MIN_INTERVAL_MS} from '../../tools/b87/auto-publish-lib.mjs';
import {importGraph,forbidden} from '../b86/import-graph.js';

const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const make=(options={})=>{const lines=[];const p=createAutoPublisher({minIntervalMs:10,intervalMs:40,backoffBaseMs:20,backoffMaxMs:80,log:l=>lines.push(l),...options});return {p,lines};};
const SECRET='Sup3r-Secret-Pass-9999';

describe('B87 automatic publisher: scheduling core',()=>{
 it('runs the first cycle at once and then at the interval (start-to-start)',async()=>{
  let n=0;const times=[];const {p}=make({fingerprint:async()=>'f'+(n++),publish:async()=>{times.push(Date.now());return {documents:3};}});
  p.start();await pause(260);await p.stop();
  expect(times.length).toBeGreaterThanOrEqual(4);expect(times.length).toBeLessThanOrEqual(8);
  for(let i=1;i<times.length;i++)expect(times[i]-times[i-1]).toBeGreaterThanOrEqual(30);
 });
 it('publishes only when the fingerprint changes since the last successful publish',async()=>{
  let fp='a',published=0;const {p,lines}=make({fingerprint:async()=>fp,publish:async()=>{published++;return {documents:3};}});
  p.start();await pause(150);expect(published).toBe(1);expect(p.state.skipped).toBeGreaterThanOrEqual(2);
  fp='b';await pause(120);expect(published).toBe(2);await p.stop();
  expect(lines.some(l=>/sin cambios/.test(l))).toBe(true);expect(lines.some(l=>/publicado: 3 documentos/.test(l))).toBe(true);
 });
 it('never overlaps: a slow publish delays the next cycle',async()=>{
  let active=0,max=0,runs=0;const {p}=make({intervalMs:20,fingerprint:async()=>'f'+runs,publish:async()=>{active++;max=Math.max(max,active);runs++;await pause(120);active--;return {documents:1};}});
  p.start();await pause(450);await p.stop();
  expect(max).toBe(1);expect(runs).toBeGreaterThanOrEqual(2);expect(runs).toBeLessThanOrEqual(4);
 });
 it('failures never close it: sanitized line, growing backoff, then recovery, and a failed publish is retried even with an unchanged fingerprint',async()=>{
  let calls=0;const stamps=[];
  const {p,lines}=make({fingerprint:async()=>'same',publish:async()=>{stamps.push(Date.now());if(++calls<=3)throw Error('boom '+SECRET+' mongodb+srv://u:'+SECRET+'@h');return {documents:2};},
   describeError:e=>String(e.message).split(SECRET).join('[x]').replace(/mongodb\+srv:\/\/\S+/g,'[uri]')});
  p.start();await pause(450);await p.stop();
  expect(calls).toBeGreaterThanOrEqual(4);expect(p.state.failures).toBe(3);
  const gaps=stamps.slice(1,4).map((t,i)=>t-stamps[i]);expect(gaps[1]).toBeGreaterThan(gaps[0]);
  expect(lines.filter(l=>/error:/.test(l)).length).toBe(3);expect(lines.join('\n')).not.toContain(SECRET);expect(lines.join('\n')).not.toMatch(/mongodb\+srv/);
  expect(lines.some(l=>/publicado: 2 documentos/.test(l))).toBe(true);expect(lines.some(l=>/reintento en/.test(l))).toBe(true);
 });
 it('a failing fingerprint (connection lost) is also survived',async()=>{
  let n=0,published=0;const {p}=make({fingerprint:async()=>{if(++n<=2)throw Error('net');return 'f';},publish:async()=>{published++;return {documents:1};}});
  p.start();await pause(300);await p.stop();expect(published).toBe(1);expect(p.state.failures).toBe(2);
 });
 it('stop(): immediate while sleeping; waits for the cycle in flight; starts nothing afterwards',async()=>{
  const a=make({intervalMs:5000,minIntervalMs:10,fingerprint:async()=>'x',publish:async()=>({documents:1})});
  a.p.start();await pause(50);const t0=Date.now();await a.p.stop();expect(Date.now()-t0).toBeLessThan(500);
  let finished=false,calls=0;
  const b=make({fingerprint:async()=>'y'+calls,publish:async()=>{calls++;await pause(150);finished=true;return {documents:1};}});
  b.p.start();await pause(30);await b.p.stop();expect(finished).toBe(true);const after=calls;await pause(150);expect(calls).toBe(after);
 });
 it('rejects an interval below the minimum (1 minute by default)',()=>{
  expect(MIN_INTERVAL_MS).toBe(60000);
  expect(()=>createAutoPublisher({fingerprint:async()=>1,publish:async()=>({}),intervalMs:30000})).toThrow(/minimum/);
  expect(()=>createAutoPublisher({fingerprint:async()=>1,publish:async()=>({}),intervalMs:60000})).not.toThrow();
 });
 it('every log line is "HH:MM:SS <state>" with no extra fields',async()=>{
  const {p,lines}=make({fingerprint:async()=>'z',publish:async()=>({documents:3,secret:SECRET})});
  p.start();await pause(120);await p.stop();
  expect(lines.length).toBeGreaterThan(0);
  for(const l of lines)expect(l).toMatch(/^\d\d:\d\d:\d\d (publicado: \d+ documentos|sin cambios \(no se publica\)|error: .*|reintento en \d+ s)$/);
  expect(lines.join('')).not.toContain(SECRET);
 });
});

describe('B87 auto-publish.mjs / PowerShell wrappers',()=>{
 const run=(argv,env,input)=>spawnSync(process.execPath,['tools/b87/auto-publish.mjs',...argv],{cwd:backend,input,encoding:'utf8',timeout:30000,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,...env}});
 const FULL={STATISTICS_ENABLE:'true',STATISTICS_STORAGE:'atlas-test',STATISTICS_ATLAS_AUTHORIZATION:'wrong',STATISTICS_ATLAS_HOST:'cluster0.abcde.mongodb.net',STATISTICS_DATABASE:'twosides_statistics_demo',STATISTICS_ANALYTICS_DATABASE:'twosides_statistics_analytics_demo',STATISTICS_POLICY_VERSION:'b82-run-hybrid-v1',STATISTICS_SERVICE_USER:'twosides_statistics_publisher_v1'};
 it('exit 2 (nothing contacted) without authorization, with a bad interval or the wrong identity, before reading any credential',()=>{
  const none=run([],{},JSON.stringify({username:'u',password:SECRET}));expect(none.status).toBe(2);expect(none.stdout+none.stderr).not.toContain(SECRET);
  for(const bad of ['0','0.5','abc','2000'])expect(run(['--interval-minutes',bad],FULL,'{}').status,bad).toBe(2);
  const wrong=run([],{...FULL,STATISTICS_SERVICE_USER:'twosides_statistics_reader_v1'},'{}');expect(wrong.status).toBe(2);
 });
 it('its import graph never reaches tests/ or the B80 guard; it reuses the existing publish action and never writes by itself; publish stays one snapshot transaction',()=>{
  for(const entry of ['tools/b87/auto-publish.mjs','tools/b87/auto-publish-lib.mjs']){const g=importGraph(path.join(backend,entry),{backend});expect(g.files.filter(forbidden),entry).toEqual([]);}
  const src=fs.readFileSync(path.join(backend,'tools/b87/auto-publish.mjs'),'utf8');
  expect(src).toContain("action:'publish'");expect(src).toContain("config.identity!=='publisher'");expect(src).not.toMatch(/insertMany|deleteMany|updateOne|createCollection/);
  const session=fs.readFileSync(path.join(backend,'tools/b86/session.js'),'utf8');
  expect(session).toMatch(/startTransaction\(\{readConcern:\{level:'snapshot'\},writeConcern:\{w:'majority',j:true\}\}\)/);
  expect(session).toMatch(/deleteMany\(\{\},\{session\}\)[\s\S]{0,200}insertMany\(source,\{session\}\)[\s\S]{0,80}commitTransaction/);
 });
 it('PowerShell wrappers: one hidden prompt, stdin, cleared variables, ASCII; the launcher only opens the two scripts',()=>{
  const ps=fs.readFileSync(path.join(backend,'tools/b87/Run-Atlas-AutoPublish.ps1'),'utf8');
  expect(ps).toContain('-AsSecureString');expect((ps.match(/Read-Host 'Password/g)??[]).length).toBe(1);expect(ps).toContain('| & node tools/b87/auto-publish.mjs');expect(ps).toContain('Remove-Item Env:STATISTICS_*');
  expect(ps).toContain('twosides_statistics_publisher_v1');expect(ps).toContain('ValidateRange(1,1440)');expect(ps).not.toMatch(/password\s*=\s*['"][^'"]+['"]/i);expect(/[^\x00-\x7f]/.test(ps)).toBe(false);
  const launcher=fs.readFileSync(path.join(backend,'tools/b87/Start-StatsDemo-Local.ps1'),'utf8');
  expect((launcher.match(/Start-Process powershell\.exe/g)??[]).length).toBe(2);expect(launcher).toContain('Run-Atlas-Express.ps1');expect(launcher).toContain('Run-Atlas-AutoPublish.ps1');
  expect(launcher).not.toMatch(/Read-Host|SecureString|password|Bypass/i);expect(/[^\x00-\x7f]/.test(launcher)).toBe(false);
 });
});
