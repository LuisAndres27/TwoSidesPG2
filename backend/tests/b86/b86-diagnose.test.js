// B86.4: the one-off reader diagnostic must work as designed and must never leak the URI, user, password, host, phrase, full paths or a stack.
import {describe,it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {preparedConfiguration,LOCAL_RBAC,ATLAS_AUTHORIZATION_PHRASE} from '../../src/modules/statistics/atlas-policy.js';
import {sanitizeText,firstFrame,describeError,runDiagnostics as realRun,formatReport,optionGroups,parseVariants,formatSessionFailure} from '../../tools/b86/diagnose.js';
import {buildClientOptions,classifyConnectionError,DIAGNOSTIC_SOURCE,StatisticsConnectionError} from '../../src/modules/statistics/atlas-connector.js';

// Variant F normally loads session.js (and, through it, the B80 isolation guard). Tests inject a flow instead; the real one is characterised in the B86.6 block.
const okFlow=async()=>({privileges:'exact-match',authenticatedUser:'matches-identity',transactions:'supported',authMechanism:'SCRAM-SHA-1'});
const runDiagnostics=options=>realRun({flow:okFlow,...options});

const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const HOST='cluster0.abcde.mongodb.net',PASSWORD='Zq9-secret-Pass_'+'x'.repeat(10),USER='twosides_statistics_reader_v1';
const atlas=()=>preparedConfiguration({kind:'atlas',host:HOST,database:'twosides_statistics_demo',analyticsDatabase:'twosides_statistics_analytics_demo',identity:'reader'});
const creds={username:USER,password:PASSWORD};
const LEAK=new RegExp([PASSWORD,'cluster0\\.abcde','abcde','mongodb\\+srv://','twosides_statistics_reader_v1','B86_OWNER_AUTHORIZES','C:\\\\Users','luis2','\\n\\s+at '].map(x=>x).join('|'),'i');
const nasty=`connect to mongodb+srv://${USER}:${PASSWORD}@${HOST}/ failed (${PASSWORD}) at C:\\Users\\luis2\\Secret Dir\\node_modules\\x.js 10.1.2.3 /home/luis2/proj/a.js`;
function withStack(error){error.stack=`${error.name}: ${error.message}\n    at hostileFn (C:\\Users\\luis2\\OneDrive\\Desktop\\proj\\node_modules\\@mongodb-js\\saslprep\\dist\\index.js:40:15)\n    at second (C:\\Users\\luis2\\x.js:1:1)`;return error;}

// Fake driver client: behaviour chosen per construction from the options it receives.
const makeClient=behave=>class{constructor(uri,options){this.uri=uri;this.options=options;this.behave=behave;}
 async connect(){const e=this.behave(this.options,'connect');if(e)throw e;}
 db(){return {command:async cmd=>{const e=this.behave(this.options,Object.keys(cmd)[0]);if(e)throw e;return 'hello' in cmd?{ok:1,setName:'atlas-x-shard-0',isWritablePrimary:true,maxWireVersion:25}:{ok:1,authInfo:{authenticatedUsers:[{user:USER,db:'admin'}],authenticatedUserRoles:[{role:'r',db:'admin'}]}};}};}
 async close(){}};

describe('B86.4 sanitising and frame extraction',()=>{
 it('replaces host, user, password, URI, hosts, IPs and paths, and cuts length',()=>{
  const out=sanitizeText(nasty,{host:HOST,user:USER,password:PASSWORD});
  expect(out).not.toMatch(LEAK);expect(out).not.toMatch(/10\.1\.2\.3|\/home\/|Secret Dir|node_modules|x\.js|\\/);expect(out).toContain('<password>');expect(sanitizeText('x'.repeat(5000)).length).toBeLessThanOrEqual(240);
 });
 it('the first frame is "function @ base file" with no directory',()=>{
  expect(firstFrame(withStack(new Error('x')))).toBe('hostileFn @ index.js');
  expect(firstFrame({stack:'Error: x\n    at C:\\Users\\luis2\\a.js:3:4'})).toBe('<anonymous> @ a.js');
  expect(firstFrame({stack:'Error: x\n    at async Connection.connect (node:internal/streams/x.js:1:1)'})).toBe('Connection.connect @ x.js');
  expect(firstFrame({})).toBe('none');expect(firstFrame({stack:'Error: x\n    at we ird*name (/tmp/a b/c.js:1:1)'})).toBe('other @ c.js');
 });
 it('name, code and codeName pass only as plain tokens; server errors never show their message',()=>{
  const d=describeError(Object.assign(new Error('x'),{name:`${HOST} ${USER}`,code:'a b',codeName:'AuthenticationFailed'}),{host:HOST,user:USER,password:PASSWORD});
  expect([d.name,d.code,d.codeName]).toEqual(['other','other','AuthenticationFailed']);
  const server=describeError(Object.assign(new Error('Authentication failed for '+USER),{name:'MongoServerError',code:18,codeName:'AuthenticationFailed'}),{host:HOST,user:USER,password:PASSWORD});
  expect(server.message).toBe('Authentication failed for <user>');expect(server.code).toBe('18');expect(server.authFailure).toBe(true);
 });
});

describe('B86.4 variants A and B and the option bisection',()=>{
 it('A to F all work: six variants, exit-style summary says the options are not the cause',async()=>{
  const r=await runDiagnostics({config:atlas(),credentials:creds,ClientImpl:makeClient(()=>undefined)});
  expect(r.results.map(x=>x.ok)).toEqual([true,true,true,true,true,true]);expect(r.aOk&&r.bOk&&r.eOk&&r.fOk).toBe(true);expect(r.results[0].hello).toMatchObject({ok:true,replicaSet:true,maxWireVersion:25});expect(r.results[0].auth.userMatches).toBe(true);
  expect(formatReport(r)).toContain('the options are not the cause');
 });
 it('A works and B fails because of ONE option group: the groups identify it',async()=>{
  const r=await runDiagnostics({config:atlas(),credentials:creds,ClientImpl:makeClient(o=>('timeoutMS' in o?Object.assign(new Error('timeoutMS rejected'),{name:'MongoInvalidArgumentError'}):undefined))});
  expect(r.aOk).toBe(true);expect(r.bOk).toBe(false);
  const names=['tls+retry','timeouts','timeoutMS','pool','appName'];
  for(const base of ['A','C']){const groups=r.results.filter(x=>x.label.startsWith(base+' + group '));expect(groups.map(x=>x.label.replace(base+' + group ',''))).toEqual(names);expect(groups.filter(x=>!x.ok).map(x=>x.label)).toEqual([base+' + group timeoutMS']);}   // B fails on SHA-256 + all options, E on SHA-1 + all options: both bisected
  expect(formatReport(r)).toContain('A works and B fails');
 });
 it('A fails: B to E are still tried, F runs the injected flow, groups are not tried, and the conclusion points to credentials',async()=>{
  const r=await runDiagnostics({config:atlas(),credentials:creds,ClientImpl:makeClient(()=>withStack(Object.assign(new Error(nasty),{code:'ECONNRESET'})))});
  expect(r.aOk).toBe(false);expect(r.results).toHaveLength(6);expect(r.results.filter(x=>/group/.test(x.label))).toHaveLength(0);expect(formatReport(r)).toContain('A, B, C and D all fail');
 });
 it('groups cover exactly the options of buildClientOptions (nothing forgotten, nothing added)',()=>{
  const names=optionGroups({tls:true,retryWrites:false,retryReads:false,serverSelectionTimeoutMS:1,connectTimeoutMS:1,socketTimeoutMS:1,timeoutMS:1,maxPoolSize:1,minPoolSize:0,appName:'x'}).flatMap(([,g])=>Object.keys(g)).sort();
  expect(names).toEqual(['appName','connectTimeoutMS','maxPoolSize','minPoolSize','retryReads','retryWrites','serverSelectionTimeoutMS','socketTimeoutMS','timeoutMS','tls']);
 });
 it('variant A carries only SCRAM-SHA-256 and authSource admin; B adds all connector options with SHA-256; E is exactly the connector options (SHA-1, TLS on)',async()=>{
  const seen=[];await runDiagnostics({config:atlas(),credentials:creds,ClientImpl:makeClient(o=>{if(!seen.includes(o))seen.push(o);})});
  expect(Object.keys(seen[0]).sort()).toEqual(['auth','authMechanism','authSource']);expect([seen[0].authMechanism,seen[0].authSource]).toEqual(['SCRAM-SHA-256','admin']);
  expect(seen[1]).toMatchObject({tls:true,authMechanism:'SCRAM-SHA-256',authSource:'admin',retryWrites:false});expect(seen[1]).toEqual({...buildClientOptions(atlas(),creds),authMechanism:'SCRAM-SHA-256'});
  expect(Object.keys(seen[2]).sort()).toEqual(['auth','authMechanism','authSource']);expect(seen[2].authMechanism).toBe('SCRAM-SHA-1');expect(seen[2].authSource).toBe('admin');
  expect(Object.keys(seen[3]).sort()).toEqual(['auth','authSource']);expect('authMechanism' in seen[3]).toBe(false);
  expect(seen[4]).toEqual(buildClientOptions(atlas(),creds));expect(seen[4]).toMatchObject({authMechanism:'SCRAM-SHA-1',tls:true,authSource:'admin'});expect(seen).toHaveLength(5);
 });
 it('only connect, hello and connectionStatus run, and connectionStatus is not asked for privileges',async()=>{
  const cmds=[];await runDiagnostics({config:atlas(),credentials:creds,ClientImpl:makeClient((o,c)=>{cmds.push(c);})});
  expect([...new Set(cmds)].sort()).toEqual(['connect','connectionStatus','hello']);
 });
 it('refuses any identity other than reader and any other user name',async()=>{
  const ingest=preparedConfiguration({kind:'atlas',host:HOST,database:'twosides_statistics_demo',identity:'ingest'});
  await expect(runDiagnostics({config:ingest,credentials:{username:ingest.user,password:PASSWORD},ClientImpl:makeClient(()=>undefined)})).rejects.toThrow();
  await expect(runDiagnostics({config:atlas(),credentials:{username:'someone_else',password:PASSWORD},ClientImpl:makeClient(()=>undefined)})).rejects.toThrow();
 });
});

describe('B86.4 mechanism variants C and D and the authentication verdict',()=>{
 const rejected=()=>Object.assign(new Error('bad auth : authentication failed'),{name:'MongoServerError',code:8000,codeName:'AtlasError'});
 it('if only the forced SCRAM-SHA-256 is rejected, C and D work and the conclusion blames the mechanism',async()=>{
  const r=await runDiagnostics({config:atlas(),credentials:creds,ClientImpl:makeClient(o=>(o.authMechanism==='SCRAM-SHA-256'?rejected():undefined))});
  expect([r.aOk,r.bOk,r.cOk,r.dOk,r.eOk,r.fOk]).toEqual([false,false,true,true,true,true]);expect(r.results).toHaveLength(6);
  const text=formatReport(r);expect(text).toContain('C or D works, so the password works');expect(text).toContain('forced SCRAM-SHA-256 mechanism is the problem');
 });
 it('if only the negotiated variant works (D), the same conclusion applies',async()=>{
  const r=await runDiagnostics({config:atlas(),credentials:creds,ClientImpl:makeClient(o=>('authMechanism' in o?rejected():undefined))});
  expect([r.aOk,r.cOk,r.dOk]).toEqual([false,false,true]);expect(formatReport(r)).toContain('C or D works');
 });
 it('A to E all rejected with code 8000: authFailure=yes on each and the conclusion points at password, user or real error',async()=>{
  const r=await runDiagnostics({config:atlas(),credentials:creds,ClientImpl:makeClient(()=>rejected())}),text=formatReport(r);
  expect(r.results.slice(0,5).every(x=>!x.ok&&x.stage==='connect'&&x.error.authFailure===true&&x.error.code==='8000'&&x.error.codeName==='AtlasError')).toBe(true);
  expect(text.match(/authFailure=yes/g)).toHaveLength(5);expect(text).toContain('A, B, C and D all fail');expect(text).toContain('password');expect(text).toContain('message="bad auth : authentication failed"');expect(text).not.toMatch(LEAK);
 });
 it('authFailure is "no" for code 8000 outside the connect stage, for non-server errors and for other server codes',async()=>{
  const lateAuth=await runDiagnostics({config:atlas(),credentials:creds,ClientImpl:makeClient((o,c)=>(c==='hello'?rejected():undefined))});
  expect(lateAuth.results.slice(0,5).every(x=>x.stage==='hello'&&x.error.authFailure===false)).toBe(true);
  const network=await runDiagnostics({config:atlas(),credentials:creds,ClientImpl:makeClient(()=>Object.assign(new Error('x'),{code:8000}))});expect(network.results.slice(0,5).every(x=>x.error.authFailure===false)).toBe(true);
  const other=await runDiagnostics({config:atlas(),credentials:creds,ClientImpl:makeClient(()=>Object.assign(new Error('x'),{name:'MongoServerError',code:13}))});expect(other.results.slice(0,5).every(x=>x.error.authFailure===false)).toBe(true);
 });
 it('each variant opens at most one connection; with A to E failing no option group is tried',async()=>{
  let clients=0;const Base=makeClient(()=>rejected());class Counting extends Base{constructor(...a){super(...a);clients++;}}
  await runDiagnostics({config:atlas(),credentials:creds,ClientImpl:Counting});expect(clients).toBe(5);
  clients=0;await runDiagnostics({config:atlas(),credentials:creds,ClientImpl:Counting.prototype.constructor===Counting?class extends makeClient(()=>undefined){constructor(...a){super(...a);clients++;}}:Counting});expect(clients).toBe(5);
 });
 it('exit semantics stay: only variant A decides (C or D working does not turn a failing A into success)',async()=>{
  const r=await runDiagnostics({config:atlas(),credentials:creds,ClientImpl:makeClient(o=>(o.authMechanism==='SCRAM-SHA-256'?rejected():undefined))});expect(r.aOk).toBe(false);
 });
});

describe('B86.4 nothing sensitive reaches the output',()=>{
 const failures=[
  withStack(Object.assign(new Error(nasty),{code:'ECONNRESET'})),withStack(Object.assign(new Error(nasty),{name:'MongoServerError',code:18,codeName:'AuthenticationFailed'})),
  withStack(Object.assign(new Error(nasty),{cause:Object.assign(new Error(nasty),{code:'EPROTO'})})),withStack(Object.assign(new AggregateError([new Error(nasty)],nasty),{code:'ETIMEDOUT'})),
  withStack(new TypeError(nasty)),Object.assign(new Error(nasty),{stack:nasty}),Object.assign(new Error(nasty),{code:PASSWORD,codeName:HOST,name:USER}),
 ];
 it('no failure shape leaks any secret, path or stack line in the printed report',async()=>{
  for(const error of failures){
   const r=await runDiagnostics({config:atlas(),credentials:creds,ClientImpl:makeClient(()=>error)}),text=formatReport(r)+JSON.stringify(r);
   expect(text).not.toMatch(LEAK);expect(text).not.toMatch(/10\.1\.2\.3|\/home\/|Secret Dir|node_modules|x\.js/);
  }
 });
 it('a harmless message is shown after sanitising; a server-originated one only when no secret survives',async()=>{
  const plain=await runDiagnostics({config:atlas(),credentials:creds,ClientImpl:makeClient(()=>Object.assign(new Error('Prohibited character, see rfc4013 for '+USER),{code:undefined}))});
  expect(formatReport(plain)).toContain('Prohibited character');expect(formatReport(plain)).toContain('<user>');expect(formatReport(plain)).not.toContain(USER);
  const server=await runDiagnostics({config:atlas(),credentials:creds,ClientImpl:makeClient(()=>Object.assign(new Error('bad auth for '+USER),{name:'MongoServerError',code:18}))});
  expect(formatReport(server)).toContain('message="bad auth for <user>"');expect(formatReport(server)).not.toContain(USER);
  const upperHost=await runDiagnostics({config:atlas(),credentials:creds,ClientImpl:makeClient(()=>Object.assign(new Error('bad auth for '+HOST.toUpperCase()),{name:'MongoServerError',code:8000}))});
  expect(formatReport(upperHost)).toContain('message="bad auth for <host>"');expect(formatReport(upperHost)).not.toMatch(LEAK);
  const multi=await runDiagnostics({config:atlas(),credentials:creds,ClientImpl:makeClient(()=>Object.assign(new Error('bad auth '+String.fromCharCode(10)+'  at '+String.fromCharCode(67,58,92)+'Users'+String.fromCharCode(92)+'x.js:1:1'),{name:'MongoServerError',code:8000}))});
  expect(formatReport(multi)).toContain('message="bad auth at <path>"');expect(formatReport(multi)+JSON.stringify(multi)).not.toMatch(LEAK);
  for(const echo of ['bad auth for '+USER.toUpperCase(),'bad auth, password '+PASSWORD.toLowerCase(),'bad auth for user@host://x']){
   const hostile=await runDiagnostics({config:atlas(),credentials:creds,ClientImpl:makeClient(()=>Object.assign(new Error(echo),{name:'MongoServerError',code:8000,codeName:'AtlasError'}))});
   expect(formatReport(hostile)).not.toContain('message=');expect(formatReport(hostile)+JSON.stringify(hostile)).not.toMatch(LEAK);
  }
 });
 it('the command line is refused (exit 2) while Atlas is not explicitly enabled, and prints no secret',()=>{
  const run=spawnSync(process.execPath,['tools/b86/atlas-diagnose.mjs'],{cwd:backend,input:JSON.stringify(creds),encoding:'utf8',env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot}});
  expect(run.status).toBe(2);expect(run.stdout+run.stderr).not.toMatch(LEAK);
  const wrongPhrase=spawnSync(process.execPath,['tools/b86/atlas-diagnose.mjs'],{cwd:backend,input:JSON.stringify(creds),encoding:'utf8',env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,STATISTICS_ENABLE:'true',STATISTICS_STORAGE:'atlas-test',STATISTICS_ATLAS_AUTHORIZATION:'wrong',STATISTICS_ATLAS_HOST:HOST}});
  expect(wrongPhrase.status).toBe(2);expect(wrongPhrase.stderr).toContain('owner_authorization_missing');expect(wrongPhrase.stdout+wrongPhrase.stderr).not.toMatch(LEAK);
 });
 it('the command line refuses a non-reader identity and a terminal stdin, before any connection',()=>{
  const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,STATISTICS_ENABLE:'true',STATISTICS_STORAGE:'atlas-test',STATISTICS_ATLAS_AUTHORIZATION:ATLAS_AUTHORIZATION_PHRASE,STATISTICS_ATLAS_HOST:HOST,STATISTICS_DATABASE:'twosides_statistics_demo',STATISTICS_ANALYTICS_DATABASE:'twosides_statistics_analytics_demo',STATISTICS_POLICY_VERSION:'b82-run-hybrid-v1',STATISTICS_SERVICE_USER:'twosides_statistics_ingest_v1'};
  const run=spawnSync(process.execPath,['tools/b86/atlas-diagnose.mjs'],{cwd:backend,input:JSON.stringify({username:'twosides_statistics_ingest_v1',password:PASSWORD}),encoding:'utf8',env});
  expect(run.status).toBe(2);expect(run.stderr).toContain('reader');expect(run.stdout+run.stderr).not.toMatch(LEAK);
 });
 it('the PowerShell wrapper is ASCII, uses hidden prompts and stdin, and has no password parameter or file',()=>{
  const text=fs.readFileSync(path.join(backend,'tools/b86/Run-Atlas-Diagnose.ps1'),'utf8');
  expect(/^[\x00-\x7f]*$/.test(text)).toBe(true);expect((text.match(/-AsSecureString/g)??[]).length).toBe(2);expect(text).toContain('| & node tools/b86/atlas-diagnose.mjs');
  expect(text).not.toMatch(/\[string\]\$Password|-Password\b|Set-Content|Out-File|\.env|Write-Host \$plain|Write-Host \$phrase/);expect(text).toContain("twosides_statistics_reader_v1");expect(text).not.toMatch(/ingest_v1|schema_v1|publisher_v1/);
 });
});

describe('B86.4 a real client against a closed local port (no Atlas)',()=>{
 it('reports FAIL for A to E with safe facts and no secret',async()=>{
  const database=LOCAL_RBAC.databasePrefix+'0123456789abcdef',analytics=LOCAL_RBAC.databasePrefix+'fedcba9876543210';
  const config=preparedConfiguration({kind:'local-rbac',host:LOCAL_RBAC.host,database,analyticsDatabase:analytics,identity:'reader'});
  const r=await runDiagnostics({config,credentials:{username:config.user,password:PASSWORD},variantTimeoutMs:8000,variants:['A','B','C','D','E']}),text=formatReport(r);
  expect(r.aOk).toBe(false);expect(r.results).toHaveLength(5);expect(r.results.every(x=>!x.ok&&x.stage==='connect'&&x.error.authFailure===false)).toBe(true);expect(text).not.toMatch(/Zq9-secret|127\.0\.0\.1|twosides_statistics|C:\\Users|\n\s+at /i);
  console.log(text);
 },60000);
});
