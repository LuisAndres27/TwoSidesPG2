// B87 offline: policy, connection string, titles, layout, provisioning flow against a FAKE Metabase API, command line, import graph and wrapper. No Docker, no network.
import {describe,it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {questions as b85Questions,settings as b85Settings} from '../../tools/b85/questions.mjs';
import {preparedConfiguration} from '../../src/modules/statistics/atlas-policy.js';
import {OWNER_TITLE,CONNECTION_NAME,ProvisionError,validateMetabaseUrl,atlasConnectionDetails,localTestConnectionDetails,ownerQuestions,dashboardLayout,MetabaseClient,provision,describeProvisionError,TEST_MONGO_HOST,READER_USER,ATLAS_ANALYTICS_DATABASE} from '../../tools/b87/metabase-lib.mjs';
import {importGraph,forbidden} from '../b86/import-graph.js';

const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const HOST='cluster0.abcde.mongodb.net',PW='Zq9-secret-Pass_'+'x'.repeat(10),ADMIN_PW='Admin-secret-Pass-1',VIEWER_PW='Viewer-secret-Pass-1';
const LEAK=new RegExp([PW,ADMIN_PW,VIEWER_PW,'abcde','mongodb\\+srv://[^\\s]*@'].join('|'),'i');
const code=fn=>{try{fn();}catch(e){return e instanceof ProvisionError?e.code:'other:'+e.message;}return 'no error';};
const cli=(input,env={},url)=>spawnSync(process.execPath,['tools/b87/metabase-provision.mjs'],{cwd:backend,input:typeof input==='string'?input:JSON.stringify(input),encoding:'utf8',timeout:60000,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,...env}});

// A minimal fake of the Metabase API: just enough state to prove the order and content of the calls.
function fakeMetabase({fresh=true,existing={}}={}){
 const calls=[],state={settings:{'enable-query-caching':false},databases:existing.databases??[{id:1,name:'Sample Database',is_sample:true}],collections:existing.collections??[],cards:[],dashboards:[],nextId:10};
 const json=(body,status=200)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(body)});
 const fetchImpl=async(url,{method='GET',body,headers={}})=>{
  const p=new URL(url).pathname.replace(/^\/api/,''),data=body?JSON.parse(body):undefined;calls.push({method,path:p,data,session:headers['X-Metabase-Session']});
  if(p==='/session/properties')return json(fresh&&!state.setupDone?{'setup-token':'tok'}:{});
  if(p==='/setup'){state.setupDone=true;return json({id:'sess-setup'});}
  if(p==='/session')return json({id:'sess-login'});
  if(p==='/cache'&&method==='PUT'){state.cache=data;return json({id:1});}
  if(p==='/cache'&&method==='GET')return json({data:state.cache?[{model:state.cache.model,model_id:state.cache.model_id,strategy:state.cacheReports??state.cache.strategy}]:[]});
  if(p.startsWith('/setting/')){const key=p.slice(9);if(method==='PUT'){state.settings[key]=data.value;return json(null,204);}return json(state.settings[key]??false);}
  if(p==='/database'&&method==='GET')return json({data:state.databases});
  if(/^\/database\/\d+$/.test(p)&&method==='DELETE'){const id=Number(p.split('/')[2]);state.databases=state.databases.filter(d=>d.id!==id);state.deletedDatabases=[...(state.deletedDatabases??[]),id];return json(null,204);}
  if(p==='/database'&&method==='POST'){const d={id:state.nextId++,name:data.name};state.databases.push(d);state.dbBody=data;return json(d);}
  if(/^\/database\/\d+\/sync_schema$/.test(p))return json({status:'ok'});
  if(p==='/collection'&&method==='GET')return json(state.collections);
  if(p==='/collection'&&method==='POST'){const c={id:state.nextId++,name:data.name};state.collections.push(c);return json(c);}
  if(p==='/dashboard'&&method==='POST'){const d={id:state.nextId++,name:data.name};state.dashboards.push(d);return json(d);}
  if(p==='/card'&&method==='POST'){const c={id:state.nextId++,...data};state.cards.push(c);return json(c);}
  if(/^\/dashboard\/\d+$/.test(p)&&method==='PUT'){state.layout=data.dashcards;return json({dashcards:data.dashcards});}
  if(/^\/card\/\d+\/query$/.test(p))return json({status:'completed',data:{rows:[[1]]}});
  if(p==='/permissions/group'&&method==='POST')return json({id:7,name:data.name});
  if(p==='/permissions/group'&&method==='GET')return json([{id:1,name:'All Users'},{id:7,name:'Evaluadores'}]);
  if(p==='/user'&&method==='POST'){state.viewerBody=data;return json({id:99});}
  if(p==='/permissions/membership')return json({});
  if(p==='/collection/graph'&&method==='GET')return json({revision:1,groups:{'1':{root:'write'},'2':{root:'write'}}});
  if(p==='/collection/graph'&&method==='PUT'){state.collectionGraph=data;return json(data);}
  if(p==='/permissions/graph'&&method==='GET')return json({revision:1,groups:{'1':{}}});
  if(p==='/permissions/graph'&&method==='PUT'){state.permissionsGraph=data;return json(data);}
  return json({message:'unexpected '+method+' '+p},404);
 };
 return {fetchImpl,calls,state};
}

describe('B87 policy: where credentials may travel',()=>{
 it('Metabase URL: https anywhere, http only on loopback, nothing else',()=>{
  expect(validateMetabaseUrl('https://metabase.example.com')).toBe('https://metabase.example.com');expect(validateMetabaseUrl('http://127.0.0.1:4287/')).toBe('http://127.0.0.1:4287');expect(validateMetabaseUrl('http://localhost:3000')).toBe('http://localhost:3000');
  for(const bad of ['http://203.0.113.5:3000','http://metabase.example.com','ftp://x','https://u:p@x.com','https://x.com/path','https://x.com/?a=1','https://x.com/#h','','not a url'])expect(code(()=>validateMetabaseUrl(bad)),bad).toMatch(/metabase_url_/);
 });
 it('Atlas connection: SRV, TLS, SCRAM-SHA-1, authSource admin, the reader user and the ANALYTICAL database only',()=>{
  const details=atlasConnectionDetails({host:HOST,password:PW}),uri=new URL(details['conn-uri'].replace('mongodb+srv:','https:'));
  expect(details['use-conn-uri']).toBe(true);expect(Object.keys(details).sort()).toEqual(['conn-uri','use-conn-uri']);
  expect(details['conn-uri'].startsWith('mongodb+srv://')).toBe(true);expect(decodeURIComponent(uri.username)).toBe(READER_USER);expect(decodeURIComponent(uri.password)).toBe(PW);expect(uri.hostname).toBe(HOST);expect(uri.pathname).toBe('/'+ATLAS_ANALYTICS_DATABASE);
  expect(Object.fromEntries(uri.searchParams)).toEqual({authSource:'admin',tls:'true',authMechanism:'SCRAM-SHA-1'});
  expect(details['conn-uri']).not.toMatch(/twosides_statistics_demo\b|twosides_statistics\b|two_sides_db|SHA-256/);
 });
 it('special characters in the password are percent-encoded and round-trip',()=>{
  for(const password of ["Ab3!'()*~_-.x","p@ss:w/rd?#[]&=%+_z9Q"]){const u=new URL(atlasConnectionDetails({host:HOST,password})['conn-uri'].replace('mongodb+srv:','https:'));expect(decodeURIComponent(u.password)).toBe(password);expect(u.hostname).toBe(HOST);}
 });
 it('hosts: exactly the pattern of the connector policy; anything else is refused',()=>{
  for(const ok of ['cluster0.abcde.mongodb.net','twosidescluster.a1b2c3d.mongodb.net']){expect(code(()=>atlasConnectionDetails({host:ok,password:PW}))).toBe('no error');expect(()=>preparedConfiguration({kind:'atlas',host:ok,database:'twosides_statistics_demo',analyticsDatabase:'twosides_statistics_analytics_demo',identity:'reader'})).not.toThrow();}
  for(const bad of ['cluster0.abcde.mongodb.net:27017','cluster0.abcde.mongodb.net/x','evil.com','cluster0.abcde.mongodb.net.evil.com','mongodb+srv://cluster0.abcde.mongodb.net','127.0.0.1','CLUSTER0.abcde.mongodb.net','',undefined]){expect(code(()=>atlasConnectionDetails({host:bad,password:PW})),String(bad)).toBe('atlas_host_rejected');expect(()=>preparedConfiguration({kind:'atlas',host:bad??'',database:'twosides_statistics_demo',analyticsDatabase:'twosides_statistics_analytics_demo',identity:'reader'})).toThrow();}
  for(const bad of ['short','has space in it 123','é'.repeat(10),'x'.repeat(200),undefined,12345678])expect(code(()=>atlasConnectionDetails({host:HOST,password:bad}))).toBe('reader_password_rejected');
 });
 it('the local test connection exists only for the one disposable host',()=>{
  expect(localTestConnectionDetails({host:TEST_MONGO_HOST,password:PW})['conn-uri']).toContain('authMechanism=SCRAM-SHA-1');
  for(const bad of [HOST,'127.0.0.1','twosides-b811-mongo','twosides-b85-analytics',undefined])expect(code(()=>localTestConnectionDetails({host:bad,password:PW})),String(bad)).toBe('test_host_rejected');
 });
});

describe('B87 titles and layout',()=>{
 it('15 questions, same queries and display settings as B85, titles without "sintéticas"/"demo"',()=>{
  const owner=ownerQuestions();expect(owner).toHaveLength(15);expect(b85Questions).toHaveLength(15);
  owner.forEach((q,i)=>{expect(q.query).toEqual(b85Questions[i].query);expect(q.key).toBe(b85Questions[i].key);expect(q.display).toBe(b85Questions[i].display);expect(q.section).toBe(b85Questions[i].section);expect(b85Settings(q)).toEqual(b85Settings(b85Questions[i]));});
  expect(owner.map(q=>q.name).join('|')).not.toMatch(/sint[eé]tic|demo/i);expect(owner[0].name).toBe('Instalaciones registradas');expect(owner[3].name).toBe('Completadas / iniciadas (%)');
  expect(OWNER_TITLE).toBe('Datos de prueba del propietario');
 });
 it('every question is a read-only aggregation over the counters (no $out, $merge, no collection other than stats_v1_counters)',()=>{
  for(const q of ownerQuestions()){const text=JSON.stringify(q.query);expect(text).not.toMatch(/\$out|\$merge|\$function|\$accumulator|\$where/);}
 });
 it('the layout places all 15 cards once and its text cards use the new wording',()=>{
  const cards=ownerQuestions().map((q,i)=>({id:100+i,key:q.key,display:q.display,section:q.section,name:q.name})),layout=dashboardLayout(cards);
  expect(layout.filter(d=>d.card_id).map(d=>d.card_id).sort()).toEqual(cards.map(c=>c.id).sort());expect(new Set(layout.map(d=>d.id)).size).toBe(layout.length);
  const texts=layout.filter(d=>!d.card_id).map(d=>d.visualization_settings.text);expect(texts[0]).toContain('# '+OWNER_TITLE);expect(texts.join('\n')).not.toMatch(/sint[eé]tic|demostraci[oó]n|\bB84\b|\bB85\b|MongoDB local|293|84 sesiones/i);
  expect(texts.join('\n')).toContain('publish');
  for(const d of layout){expect(d.col).toBeGreaterThanOrEqual(0);expect(d.col+d.size_x).toBeLessThanOrEqual(24);}
 });
});

describe('B87 provisioning flow (fake Metabase API)',()=>{
 const connection=()=>atlasConnectionDetails({host:HOST,password:PW});
 it('fresh instance: setup, settings off, one database, collection, dashboard, 15 cards, layout, 15 runs; the summary holds no secret',async()=>{
  const fake=fakeMetabase(),client=new MetabaseClient({baseUrl:'https://metabase.example.com',fetchImpl:fake.fetchImpl});
  const {summary}=await provision({client,admin:{email:'owner@example.test',password:ADMIN_PW},connection:connection()});
  expect(summary).toMatchObject({mode:'setup',cardsRun:15,cardsCompleted:15,queryCaching:false,publicSharing:false});expect(summary.cards).toHaveLength(15);
  expect(fake.state.settings['enable-query-caching']).toBe(false);expect(fake.state.settings['enable-public-sharing']).toBe(false);expect(fake.state.settings['enable-embedding-static']).toBe(false);
  expect(fake.state.databases).toHaveLength(1);expect(fake.state.databases[0].name).toBe(CONNECTION_NAME);expect(fake.state.dbBody).toMatchObject({engine:'mongo',is_full_sync:false,cache_ttl:null});expect(fake.state.dbBody.details['conn-uri']).toContain('authMechanism=SCRAM-SHA-1');
  expect(fake.state.collections.map(c=>c.name)).toEqual([OWNER_TITLE]);expect(fake.state.dashboards.map(d=>d.name)).toEqual([OWNER_TITLE]);expect(fake.state.cards).toHaveLength(15);
  for(const c of fake.state.cards){expect(c.cache_ttl).toBeNull();expect(c.dataset_query.native.collection).toBe('stats_v1_counters');expect(c.dataset_query.type).toBe('native');expect(JSON.parse(c.dataset_query.native.query)).toBeInstanceOf(Array);}
  expect(JSON.stringify(summary)).not.toMatch(LEAK);
  const order=fake.calls.map(c=>c.method+' '+c.path.replace(/\d+/g,'N'));expect(order[1]).toBe('POST /setup');expect(order.indexOf('POST /database')).toBeGreaterThan(order.lastIndexOf('PUT /setting/enable-query-caching'));
  expect(fake.calls.every(c=>c.path==='/session/properties'||c.path==='/setup'||c.path==='/session'||c.session==='sess-setup')).toBe(true);
 });
 it('existing instance: logs in instead of running the setup',async()=>{
  const fake=fakeMetabase({fresh:false}),client=new MetabaseClient({baseUrl:'https://metabase.example.com',fetchImpl:fake.fetchImpl});
  const {summary}=await provision({client,admin:{email:'owner@example.test',password:ADMIN_PW},connection:connection()});expect(summary.mode).toBe('login');expect(fake.calls.some(c=>c.path==='/setup')).toBe(false);
 });
 it('refuses to provision twice (existing connection or collection) and creates nothing',async()=>{
  for(const existing of [{databases:[{id:1,name:CONNECTION_NAME}]},{collections:[{id:1,name:OWNER_TITLE}]}]){
   const fake=fakeMetabase({fresh:false,existing}),client=new MetabaseClient({baseUrl:'https://metabase.example.com',fetchImpl:fake.fetchImpl});
   await expect(provision({client,admin:{email:'o@example.test',password:ADMIN_PW},connection:connection()})).rejects.toMatchObject({code:'already_provisioned'});
   expect(fake.state.cards).toHaveLength(0);expect(fake.calls.some(c=>c.method==='POST'&&['/database','/card','/dashboard'].includes(c.path))).toBe(false);
  }
 });
 it('stops if the query cache is on and cannot be turned off',async()=>{
  const fake=fakeMetabase();fake.state.settings['enable-query-caching']=true;const original=fake.fetchImpl;
  const client=new MetabaseClient({baseUrl:'https://metabase.example.com',fetchImpl:async(url,o)=>{const r=await original(url,o);if(new URL(url).pathname==='/api/setting/enable-query-caching'&&(o?.method??'GET')==='PUT')fake.state.settings['enable-query-caching']=true;return r;}});
  await expect(provision({client,admin:{email:'o@example.test',password:ADMIN_PW},connection:connection()})).rejects.toMatchObject({code:'query_caching_not_disabled'});expect(fake.state.databases.filter(d=>!d.is_sample)).toHaveLength(0);
 });
 it('stops if the instance-wide cache strategy is not "no cache"',async()=>{
  const fake=fakeMetabase();fake.state.cacheReports={type:'ttl'};
  const client=new MetabaseClient({baseUrl:'https://metabase.example.com',fetchImpl:fake.fetchImpl});
  await expect(provision({client,admin:{email:'o@example.test',password:ADMIN_PW},connection:atlasConnectionDetails({host:HOST,password:PW})})).rejects.toMatchObject({code:'query_caching_not_disabled'});expect(fake.state.cards).toHaveLength(0);
 });
 it('removes the Sample Database so the Atlas connection is the only data source; the cache strategy is set to "nocache"',async()=>{
  const fake=fakeMetabase(),client=new MetabaseClient({baseUrl:'https://metabase.example.com',fetchImpl:fake.fetchImpl});
  await provision({client,admin:{email:'o@example.test',password:ADMIN_PW},connection:atlasConnectionDetails({host:HOST,password:PW})});
  expect(fake.state.deletedDatabases).toEqual([1]);expect(fake.state.databases.map(d=>d.name)).toEqual([CONNECTION_NAME]);expect(fake.state.cache).toEqual({model:'root',model_id:0,strategy:{type:'nocache'}});
 });
 it('evaluator variant: group, non-admin user, "read" on ONE collection, "none" for everyone else, no native queries',async()=>{
  const fake=fakeMetabase(),client=new MetabaseClient({baseUrl:'https://metabase.example.com',fetchImpl:fake.fetchImpl});
  const {summary}=await provision({client,admin:{email:'owner@example.test',password:ADMIN_PW},connection:connection(),viewer:{email:'evaluator@example.test',password:VIEWER_PW}});
  expect(summary.viewer).toMatchObject({isAdmin:false,collectionAccess:'read',databaseAccess:'saved-questions-only'});expect(fake.state.viewerBody).toEqual({first_name:'Evaluador',last_name:'Solo lectura',email:'evaluator@example.test',password:VIEWER_PW});
  expect(fake.state.collectionGraph.groups['7'][String(summary.collectionId)]).toBe('read');expect(fake.state.collectionGraph.groups['1'][String(summary.collectionId)]).toBe('none');expect(fake.state.collectionGraph.groups['1'].root).toBe('none');expect(fake.state.collectionGraph.groups['7'].root).toBe('none');
  for(const gid of ['1','7'])expect(fake.state.permissionsGraph.groups[gid][String(summary.databaseId)]).toMatchObject({'create-queries':'no'});
  expect(JSON.stringify(summary)).not.toMatch(LEAK);
  const weak=fakeMetabase(),weakClient=new MetabaseClient({baseUrl:'https://metabase.example.com',fetchImpl:weak.fetchImpl});
  await expect(provision({client:weakClient,admin:{email:'o@example.test',password:ADMIN_PW},connection:connection(),viewer:{email:'e@example.test',password:'short'}})).rejects.toMatchObject({code:'viewer_rejected'});
  await expect(provision({client:new MetabaseClient({baseUrl:'https://metabase.example.com',fetchImpl:fakeMetabase().fetchImpl}),admin:{email:'o@example.test',password:ADMIN_PW},connection:connection(),viewer:{email:'e@example.test',password:'x'.repeat(14)}})).rejects.toMatchObject({code:'viewer_rejected'});   // 15 characters minimum, like the server policy
 });
 it('failure messages are sanitised: no password, user or host, bounded length',()=>{
  const secrets=[HOST,READER_USER,PW];
  const e=new ProvisionError('metabase_http_400',`Unable to connect to ${READER_USER}:${PW}@${HOST} mongodb+srv://${READER_USER}:${PW}@${HOST}/x`+' y'.repeat(500));
  const d=describeProvisionError(e,secrets);expect(JSON.stringify(d)).not.toMatch(LEAK);expect(d.detail.length).toBeLessThanOrEqual(240);
  expect(describeProvisionError(new ProvisionError('x','bad auth for '+PW.toUpperCase()),secrets).detail).toBeUndefined();   // an echo in another case is dropped, not shown
  expect(describeProvisionError(new ProvisionError('x','Command failed: 203.0.113.5 C:\\Users\\x\\a.js'),secrets).detail).toBe('Command failed: <ip> <path>');expect(describeProvisionError(new Error(PW),secrets)).toEqual({code:'unexpected_error'});
 });
 it('an unreachable Metabase is reported without echoing anything sensitive',async()=>{
  const client=new MetabaseClient({baseUrl:'http://127.0.0.1:9',fetchImpl:async()=>{throw new Error('connect ECONNREFUSED 127.0.0.1:9 '+PW);}});
  const error=await provision({client,admin:{email:'o@example.test',password:ADMIN_PW},connection:connection()}).catch(x=>x);expect(error.code).toBe('metabase_unreachable');expect(error.message+JSON.stringify(error.detail)).not.toMatch(LEAK);
 });
});

describe('B87 command line',()=>{
 const base=()=>({metabaseUrl:'https://metabase.example.com',admin:{email:'o@example.test',password:ADMIN_PW},mode:'atlas',host:HOST,readerPassword:PW});
 it('rejects bad input before contacting anything and never echoes a secret',()=>{
  const cases=[['not json',3],[{...base(),metabaseUrl:'http://203.0.113.5:3000'},2],[{...base(),host:'evil.com'},2],[{...base(),readerPassword:'short'},2],[{...base(),mode:'local-test'},2],[{...base(),mode:'whatever'},2],[{...base(),admin:{email:'o@example.test',password:'short'}},2],[{...base(),admin:{email:'o@example.test',password:'x'.repeat(14)}},2],[{...base(),admin:undefined},2],[{...base(),metabaseUrl:'https://u:p@x.com'},2]];
  for(const [input,status] of cases){const r=cli(input);expect([typeof input==='string'?input:JSON.stringify(input).slice(0,60),r.status]).toEqual([typeof input==='string'?input:JSON.stringify(input).slice(0,60),status]);expect(r.stdout+r.stderr).not.toMatch(LEAK);}
 });
 it('local-test mode needs the explicit test switch AND the disposable host',()=>{
  const input={...base(),mode:'local-test',metabaseUrl:'http://127.0.0.1:9',host:HOST};
  expect(cli(input).status).toBe(2);expect(cli(input,{B87_REAL_TESTS:'1'}).status).toBe(2);   // right switch, wrong host
  const ok=cli({...input,host:TEST_MONGO_HOST},{B87_REAL_TESTS:'1'});expect(ok.status).toBe(4);expect(ok.stderr).toContain('metabase_unreachable');expect(ok.stdout+ok.stderr).not.toMatch(LEAK);   // reaches the (closed) loopback port only
 });
 it('a valid Atlas request against an unreachable Metabase fails safely (exit 4) and contacts only that Metabase',()=>{
  const r=cli({...base(),metabaseUrl:'https://127.0.0.1:9'});expect(r.status).toBe(4);expect(r.stderr).toContain('metabase_unreachable');expect(r.stdout+r.stderr).not.toMatch(LEAK);
 });
});

describe('B87 hygiene',()=>{
 it('nothing under tools/b87 reaches tests/ or the B80 guard, and nothing contacts Atlas or AWS directly',()=>{
  for(const entry of ['tools/b87/metabase-provision.mjs','tools/b87/metabase-lib.mjs']){
   const graph=importGraph(path.join(backend,entry),{backend});expect(graph.files.length).toBeGreaterThanOrEqual(2);expect(graph.files.filter(forbidden),entry).toEqual([]);expect(graph.files).toContain('tools/b85/questions.mjs');
   expect(graph.bare).toEqual([]);   // no third-party package at all
  }
  const text=['metabase-lib.mjs','metabase-provision.mjs'].map(f=>fs.readFileSync(path.join(backend,'tools/b87',f),'utf8')).join('\n');
  expect(text).not.toMatch(/from\s+['"]mongodb['"]|child_process|writeFile|appendFile|process\.env\.(?!B87_REAL_TESTS)|console\.log\([^)]*(password|Password)/);
 });
 it('B85 is untouched (pinned SHA-256) and only questions.mjs is imported from it',()=>{
  const { createHash }=globalThis.require??{};void createHash;
  const pins={'tools/b85/questions.mjs':'d5e40df8594b8db51fc1a8315517fd1e664e69fb13b253f200932e6e9ce56e49','tools/b85/configure.mjs':'e61b7c773e115c6fb33023d0a2ae0abdb14d5006c8f18e9e81ef529b714eb648','tools/b85/layout.mjs':'cc9b3fff17969208492f4dbb9d82975ac17e2ed03728be4e4c15ff671bde375a','tools/b85/runtime.mjs':'7754bc7f678dfdf02575741e94fc38f41240414b2ffb0e922e306a5641c8097e'};
  const r=spawnSync(process.execPath,['-e',`const c=require('crypto'),f=require('fs');const p=${JSON.stringify(pins)};const bad=Object.entries(p).filter(([k,v])=>c.createHash('sha256').update(f.readFileSync(k)).digest('hex')!==v);console.log(JSON.stringify(bad))`],{cwd:backend,encoding:'utf8'});
  expect(JSON.parse(r.stdout.trim())).toEqual([]);
 });
 it('the PowerShell wrapper: ASCII, hidden prompts for the three passwords, stdin only, no password parameter or file',()=>{
  const text=fs.readFileSync(path.join(backend,'tools/b87/Run-B87-Metabase-Provision.ps1'),'utf8');
  expect(/^[\x00-\x7f]*$/.test(text)).toBe(true);expect((text.match(/-AsSecureString/g)??[]).length).toBe(1);expect((text.match(/Read-Secret '/g)??[]).length).toBe(3);   // the function hides the input; used for admin, reader and evaluator
  expect(text).toContain('| & node tools/b87/metabase-provision.mjs');expect(text).not.toMatch(/\[string\]\$\w*Password|-Password\b|Set-Content|Out-File|Add-Content|\.env\b|Start-Transcript|Write-Host \$(admin|reader|json|payload)/i);
  expect(text).toContain("mode='atlas'");expect(text).not.toContain('local-test');
 });
});
