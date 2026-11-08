// B86.6/B86.7: why the real preflight (atlas-session.mjs -> session.js) failed with "unknown (connect) [error=Error, code=other]" while the diagnostic (diagnose.js) connected,
// plus the variants E/F, the sanitised session failure and the abort-before-contact check. No Atlas, no credentials, no network.
import {describe,it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import os from 'node:os';import {createHash} from 'node:crypto';
import {importGraph,forbidden} from './import-graph.js';
import {preparedConfiguration,ATLAS_AUTHORIZATION_PHRASE,STATISTICS_IDENTITIES} from '../../src/modules/statistics/atlas-policy.js';
import {buildClientOptions,classifyConnectionError,DIAGNOSTIC_SOURCE,StatisticsConnectionError} from '../../src/modules/statistics/atlas-connector.js';
import {runDiagnostics,formatReport,parseVariants,formatSessionFailure} from '../../tools/b86/diagnose.js';

const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),url=rel=>pathToFileURL(path.join(backend,rel)).href;
const HOST='cluster0.abcde.mongodb.net',PASSWORD='Zq9-secret-Pass_'+'x'.repeat(10),USER='twosides_statistics_reader_v1';
const config=preparedConfiguration({kind:'atlas',host:HOST,database:'twosides_statistics_demo',analyticsDatabase:'twosides_statistics_analytics_demo',identity:'reader'});
const creds={username:USER,password:PASSWORD},secrets={host:HOST,user:USER,password:PASSWORD};
const LEAK=new RegExp([PASSWORD,'cluster0\\.abcde','abcde','mongodb\\+srv://',USER,'B86_OWNER_AUTHORIZES','C:\\\\Users','luis2','\\n\\s+at '].join('|'),'i');
const okClient=class{constructor(uri,options){this.options=options;}async connect(){}db(){return {command:async c=>('hello' in c?{ok:1,setName:'rs',isWritablePrimary:true,maxWireVersion:25}:{ok:1,authInfo:{authenticatedUsers:[{user:USER,db:'admin'}],authenticatedUserRoles:[{role:'r',db:'admin'}]}})};}async close(){}};
const nasty=`connect to mongodb+srv://${USER}:${PASSWORD}@${HOST}/ failed at C:\\Users\\luis2\\x\\node_modules\\a.js`;
const stackOf=error=>{error.stack=`${error.name}: ${error.message}\n    at hostileFn (C:\\Users\\luis2\\OneDrive\\proj\\node_modules\\pkg\\file.js:1:2)`;return error;};
const childEnv={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot};

describe('B86.6 variants E and F and their selection',()=>{
 it('parseVariants accepts "all" or distinct letters A-F and refuses everything else',()=>{
  expect(parseVariants(undefined)).toEqual(['A','B','C','D','E','F']);expect(parseVariants('all')).toEqual(['A','B','C','D','E','F']);expect(parseVariants('F,E')).toEqual(['E','F']);expect(parseVariants(['E'])).toEqual(['E']);
  for(const bad of ['G','A;B','A,A','','a','E F','A,,B','all,A',null])expect(()=>parseVariants(bad),String(bad)).toThrow();
 });
 it('"E,F" opens exactly one client (E) and runs the flow once (F); A to D are not repeated',async()=>{
  let clients=0,flows=0;class Counting extends okClient{constructor(...a){super(...a);clients++;}}
  const r=await runDiagnostics({config,credentials:creds,ClientImpl:Counting,variants:['E','F'],flow:async()=>{flows++;return {privileges:'exact-match',authenticatedUser:'matches-identity',transactions:'supported',authMechanism:'SCRAM-SHA-1'};}});
  expect([clients,flows,r.results.length,r.aOk,r.eOk,r.fOk]).toEqual([1,1,2,undefined,true,true]);
  const text=formatReport(r);expect(text).toContain('F real preflight flow');expect(text).toContain('privileges=exact-match user=matches transactions=supported mechanism=SCRAM-SHA-1');expect(text).toContain('E and F work');expect(text).not.toContain('A, B, C and D');
 });
 it('F receives the prepared configuration and the real credentials, and nothing else is opened by the harness',async()=>{
  let received;await runDiagnostics({config,credentials:creds,ClientImpl:okClient,variants:['F'],flow:async args=>{received=args;return {};}});
  expect(received.config).toBe(config);expect(received.credentials).toBe(creds);expect(Object.keys(received).sort()).toEqual(['ClientImpl','config','credentials']);
 });
 it('E works but F fails: the conclusion blames the process, and the failure shows only sanitised facts of the ORIGINAL error',async()=>{
  const raw=stackOf(Object.assign(new Error('B80_EXTERNAL_NETWORK_REFUSED'),{}));
  const r=await runDiagnostics({config,credentials:creds,ClientImpl:okClient,variants:['E','F'],flow:async()=>{throw classifyConnectionError(raw,'connect');}}),text=formatReport(r);
  expect([r.eOk,r.fOk]).toEqual([true,false]);
  expect(text).toMatch(/F real preflight flow[^\n]*FAIL stage=connect category=unknown name=Error code=other[^\n]*frame=hostileFn @ file\.js[^\n]*message="B80_EXTERNAL_NETWORK_REFUSED"/);
  expect(text).toContain('Conclusion E/F: E works but the real connector flow (F) fails');expect(text).not.toMatch(LEAK);
 });
 it('F failures with hostile content never leak (message, causes, stack, URI, user, password, host)',async()=>{
  for(const raw of [stackOf(new Error(nasty)),Object.assign(new Error(nasty),{cause:new TypeError(nasty)}),new AggregateError([new Error(nasty)],nasty),stackOf(Object.assign(new Error(nasty),{code:PASSWORD,name:USER,codeName:HOST}))]){
   const r=await runDiagnostics({config,credentials:creds,ClientImpl:okClient,variants:['F'],flow:async()=>{throw classifyConnectionError(raw,'connect');}});
   expect(formatReport(r)+JSON.stringify(r)).not.toMatch(LEAK);
  }
 });
 it('F failure that is not a classified error (plain Error from the flow) is also sanitised and reported with stage "flow"',async()=>{
  const r=await runDiagnostics({config,credentials:creds,ClientImpl:okClient,variants:['F'],flow:async()=>{throw stackOf(new Error(nasty));}}),text=formatReport(r);
  expect(r.results[0]).toMatchObject({ok:false,stage:'flow'});expect(text).not.toMatch(LEAK);expect(text).toContain('Conclusion F');
 });
 it('C works but E fails: the groups are run on the SCRAM-SHA-1 base and E is blamed on the options',async()=>{
  const bad=class extends okClient{async connect(){if('timeoutMS' in this.options&&this.options.authMechanism==='SCRAM-SHA-1')throw Object.assign(new Error('x'),{name:'MongoInvalidArgumentError'});}};
  const r=await runDiagnostics({config,credentials:creds,ClientImpl:bad,variants:['C','E'],flow:async()=>({})});
  expect([r.cOk,r.eOk]).toEqual([true,false]);expect(r.results.filter(x=>x.label.startsWith('C + group ')).map(x=>[x.label.slice(10),x.ok])).toEqual([['tls+retry',true],['timeouts',true],['timeoutMS',false],['pool',true],['appName',true]]);
  expect(formatReport(r)).toContain('Conclusion E: C works but E fails');
 });
 it('diagnose.js does not load session.js (or the B80 guard) unless variant F runs',()=>{
  const text=fs.readFileSync(path.join(backend,'tools/b86/diagnose.js'),'utf8');
  expect(text).not.toMatch(/^import[^\n]*session\.js/m);expect(text).toMatch(/await import\('\.\/session\.js'\)/);
 });
 it('the wrapper takes -Variants (validated) and passes it to the tool; it stays ASCII with hidden prompts',()=>{
  const text=fs.readFileSync(path.join(backend,'tools/b86/Run-Atlas-Diagnose.ps1'),'utf8');
  expect(/^[\x00-\x7f]*$/.test(text)).toBe(true);expect(text).toContain("[ValidatePattern('^(all|[A-F](,[A-F])*)$')][string]$Variants='all'");expect(text).toContain('atlas-diagnose.mjs --variants $Variants');expect((text.match(/-AsSecureString/g)??[]).length).toBe(2);
 });
});

describe('B86.6 the original error rides on the classified one without being visible',()=>{
 it('DIAGNOSTIC_SOURCE is non-enumerable and absent from JSON, keys, message, stack and string forms',()=>{
  const raw=stackOf(new Error(nasty)),e=classifyConnectionError(raw,'connect');
  expect(e[DIAGNOSTIC_SOURCE]).toBe(raw);expect(Object.keys(e).sort()).toEqual(['category','code','errorName','name','stage']);expect(Object.getOwnPropertySymbols(e)).toContain(DIAGNOSTIC_SOURCE);
  expect(Object.getOwnPropertyDescriptor(e,DIAGNOSTIC_SOURCE).enumerable).toBe(false);
  const shown=[JSON.stringify(e),e.message,e.stack.split(String.fromCharCode(10))[0],String(e),JSON.stringify({...e}),JSON.stringify(Object.assign({},e))].join('|');expect(shown).not.toMatch(LEAK);expect(shown).not.toContain('hostileFn');
 });
 it('errors thrown by the connector itself carry no source and are still described safely',()=>{
  const e=new StatisticsConnectionError('privilege_mismatch','privileges');expect(e[DIAGNOSTIC_SOURCE]).toBeUndefined();
  expect(formatSessionFailure(e,secrets)).toMatch(/^Session failed: privilege_mismatch \(privileges\)/);
 });
});

describe('B86.6 the session failure printed by atlas-session.mjs',()=>{
 it('keeps the first line of before and adds the sanitised detail of the original error',()=>{
  const raw=stackOf(new Error('B80_EXTERNAL_NETWORK_REFUSED')),text=formatSessionFailure(classifyConnectionError(raw,'connect'),secrets);
  expect(text.split('\n')[0]).toBe('Session failed: unknown (connect) [error=Error, code=other]');
  expect(text).toContain('detail: name=Error code=other codeName=other frame=hostileFn @ file.js message="B80_EXTERNAL_NETWORK_REFUSED"');
 });
 it('shows name, code, codeName, frame, causes and message for a driver-like error, with no secret',()=>{
  const server=Object.assign(new Error('bad auth : authentication failed'),{name:'MongoServerError',code:8000,codeName:'AtlasError',cause:Object.assign(new Error(nasty),{code:'ECONNRESET'})});
  const text=formatSessionFailure(classifyConnectionError(stackOf(server),'connect'),secrets);
  expect(text.split('\n')[0]).toBe('Session failed: authentication (connect) [error=MongoServerError, code=8000]');expect(text).toContain('codeName=AtlasError');expect(text).toContain('causes=Error/ECONNRESET');expect(text).toContain('message="bad auth : authentication failed"');expect(text).not.toMatch(LEAK);
 });
 it('hostile errors of every shape (including non-Error throws) print no secret, path or stack line',()=>{
  const shapes=[stackOf(new Error(nasty)),Object.assign(new Error(nasty),{cause:new Error(nasty)}),new AggregateError([new Error(nasty)],nasty),stackOf(Object.assign(new Error(nasty),{name:USER,code:PASSWORD,codeName:HOST})),nasty,{message:nasty},42,undefined,null];
  for(const raw of shapes){
   for(const error of [classifyConnectionError(raw,'connect'),raw]){const text=formatSessionFailure(error,secrets);expect(text,String(raw)).not.toMatch(LEAK);expect(text).not.toMatch(/\n\s+at /);}
  }
 });
 it('an unclassified error (a bug in the session code) prints "unexpected error" plus the sanitised detail',()=>{
  const text=formatSessionFailure(stackOf(new TypeError(nasty)),secrets);expect(text.split('\n')[0]).toBe('Session failed: unexpected error');expect(text).toContain('name=TypeError');expect(text).not.toMatch(LEAK);
 });
});

describe('B86.7 no Atlas action can load the B80 test-isolation guard (it used to arrive through session.js -> demo-store.js -> tests/)',()=>{
 const probe=rel=>{
  const code=`import fs from 'node:fs';import tls from 'node:tls';await import(${JSON.stringify(url(rel))});const installed=Boolean(fs[Symbol.for('twosides.b80.fs.guard')]);let refused='-';if(installed){try{tls.connect({host:'cluster0.abcde.mongodb.net',port:27017});refused='not refused';}catch(e){refused=e.message;}}console.log(JSON.stringify({installed,refused}));process.exit(0);`;
  const run=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:backend,encoding:'utf8',env:childEnv,timeout:60000});expect(run.status,run.stderr).toBe(0);return JSON.parse(run.stdout.trim().split('\n').pop());
 };
 const ATLAS_ENTRIES=['tools/b86/atlas-session.mjs','tools/b86/session.js','tools/b86/diagnose.js','tools/b86/atlas-diagnose.mjs','src/modules/statistics/atlas-connector.js','src/modules/statistics/atlas-policy.js','tools/b86/deployment-plan.mjs'];
 const ACTIONS=['preflight','provision','seed','publish','read'];

 it('the import graph (static, re-export, side-effect and dynamic) of every Atlas entry contains nothing from tests/ and not the guard',()=>{
  for(const entry of ATLAS_ENTRIES){
   const graph=importGraph(path.join(backend,entry),{backend});
   expect(graph.files.length,entry).toBeGreaterThanOrEqual(entry.endsWith('atlas-policy.js')?1:3);   // the walk really followed imports (atlas-policy.js has no relative imports)
   if(/atlas-session\.mjs|session\.js/.test(entry))expect(graph.files.length,entry).toBeGreaterThan(20);
   expect(graph.files.filter(forbidden),entry).toEqual([]);
   expect(graph.files.some(f=>/b80-isolation-guard|b81-container-instance|tools\/b84\/demo-store/.test(f)),entry).toBe(false);
  }
 });
 it.each(ACTIONS)('action "%s": the code that serves it is reachable only through atlas-session.mjs -> session.js, whose graph is clean and has no deferred import at all',action=>{
  const session=fs.readFileSync(path.join(backend,'tools/b86/session.js'),'utf8'),cli=fs.readFileSync(path.join(backend,'tools/b86/atlas-session.mjs'),'utf8');
  expect(session).toContain(`action==='${action}'`);expect(cli).toContain(`'${action}'`);
  expect(session).not.toMatch(/\bimport\s*\(/);expect(cli).not.toMatch(/\bimport\s*\(/);   // nothing is loaded later, in any action
  for(const entry of ['tools/b86/atlas-session.mjs','tools/b86/session.js']){const graph=importGraph(path.join(backend,entry),{backend});expect(graph.files.filter(forbidden)).toEqual([]);expect(graph.files).toContain('tools/b86/session.js');expect(graph.files).toContain('tools/b84/demo-key.js');}
 });
 it('a real process that loads session.js (as atlas-session.mjs does) has NO guard installed, as does everything else Atlas uses',()=>{
  for(const rel of ['tools/b86/session.js','tools/b86/diagnose.js','src/modules/statistics/atlas-connector.js','src/modules/statistics/atlas-policy.js','tools/b86/deployment-plan.mjs'])expect(probe(rel),rel).toEqual({installed:false,refused:'-'});
 });
 it('the guard is unchanged and still protects local tests and demonstrations: demo-store.js still installs it and it still refuses non-loopback hosts',()=>{
  const guard=fs.readFileSync(path.join(backend,'tests/statistics/b80-isolation-guard.js'));
  expect(createHash('sha256').update(guard).digest('hex')).toBe('cf5c17bcb0ac12a1cce0f5528ef035c8a0b6d472adaf9bf749c33bbbcccfc464');   // byte-identical to the file as it was before B86.7
  expect(guard.toString('utf8')).not.toMatch(/process\.env/);   // no variable can switch it off
  expect(fs.readFileSync(path.join(backend,'tools/b84/demo-store.js'),'utf8')).toMatch(/^import '\.\.\/\.\.\/tests\/statistics\/b80-isolation-guard\.js';/m);
  expect(probe('tools/b84/demo-store.js')).toEqual({installed:true,refused:'B80_EXTERNAL_NETWORK_REFUSED'});
 });
 it('the key and its check are the same values as before: demo-key.js is the single source and demo-store.js re-exports it',async()=>{
  const key=await import('../../tools/b84/demo-key.js'),store=await import('../../tools/b84/demo-store.js');
  expect(store.B84_KEY).toBe(key.B84_KEY);expect(store.B84_KEY_CHECK).toBe(key.B84_KEY_CHECK);
  expect(createHash('sha256').update('PUBLIC B84 SYNTHETIC DEMO KEY').digest().equals(key.B84_KEY)).toBe(true);expect(key.B84_KEY_CHECK).toMatch(/^[0-9a-f]{64}$/);
  const text=fs.readFileSync(path.join(backend,'tools/b84/demo-key.js'),'utf8');expect(text).not.toMatch(/\bfrom\s+['"](?!node:crypto)/);   // node:crypto only
 });
 it('atlas-session.mjs still stops BEFORE connecting if a guard shows up in an Atlas process (guard preloaded by --import), and says so without secrets',()=>{
  const env={...childEnv,STATISTICS_ENABLE:'true',STATISTICS_STORAGE:'atlas-test',STATISTICS_ATLAS_AUTHORIZATION:ATLAS_AUTHORIZATION_PHRASE,STATISTICS_ATLAS_HOST:HOST,STATISTICS_DATABASE:'twosides_statistics_demo',STATISTICS_ANALYTICS_DATABASE:'twosides_statistics_analytics_demo',STATISTICS_POLICY_VERSION:'b82-run-hybrid-v1',STATISTICS_SERVICE_USER:STATISTICS_IDENTITIES.reader.user};
  const guard=pathToFileURL(path.join(backend,'tests/statistics/b80-isolation-guard.js')).href;
  const t0=Date.now(),run=spawnSync(process.execPath,['--import',guard,'tools/b86/atlas-session.mjs','--action','preflight'],{cwd:backend,input:JSON.stringify(creds),encoding:'utf8',env,timeout:30000});
  expect(run.status).toBe(2);expect(run.stderr).toContain('isolation guard');expect(run.stderr).toContain('Nothing was contacted');expect(run.stdout+run.stderr).not.toMatch(LEAK);expect(Date.now()-t0).toBeLessThan(25000);
 });
});

describe('B86.7 the import-graph detector itself (positive controls, so a clean result means something)',()=>{
 const fixture=(files)=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'b86-graph-'));
  for(const [name,text] of Object.entries(files)){const file=path.join(dir,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}
  return dir;
 };
 const cases={
  'static import':"import '../tests/guard.js';",
  'named import':"import {x} from '../tests/guard.js';export const y=x;",
  're-export':"export * from '../tests/guard.js';",
  'side-effect import':"import   '../tests/guard.js'",
  'dynamic import':"export const load=()=>import('../tests/guard.js');",
  'dynamic import, double quotes, spaced':'await import( "../tests/guard.js" );',
  'transitive':"import './mid.js';",
 };
 it.each(Object.entries(cases))('finds a forbidden module behind a %s',(label,text)=>{
  const dir=fixture({'tools/entry.js':text,'tools/mid.js':"import '../tests/guard.js';",'tests/guard.js':'export const x=1;'});
  try{const graph=importGraph(path.join(dir,'tools/entry.js'),{backend:dir});expect(graph.files.filter(forbidden),label).toEqual(['tests/guard.js']);}finally{fs.rmSync(dir,{recursive:true,force:true});}
 });
 it('ignores forbidden-looking text in comments and reports no false positive for a clean tree',()=>{
  const dir=fixture({'tools/entry.js':"// import '../tests/guard.js';\n/* import('../tests/guard.js') */\nimport './ok.js';",'tools/ok.js':'export const ok=1;','tests/guard.js':'export const x=1;'});
  try{const graph=importGraph(path.join(dir,'tools/entry.js'),{backend:dir});expect(graph.files).toEqual(['tools/entry.js','tools/ok.js']);expect(graph.files.filter(forbidden)).toEqual([]);}finally{fs.rmSync(dir,{recursive:true,force:true});}
 });
 it('flags the PREVIOUS wiring: tools/b84/demo-store.js still reaches tests/ and the guard (so the check would have caught the defect)',()=>{
  const graph=importGraph(path.join(backend,'tools/b84/demo-store.js'),{backend});
  expect(graph.files.filter(forbidden)).toEqual(['tests/statistics/b80-isolation-guard.js','tests/statistics/b81-container-instance.js']);
 });
});
