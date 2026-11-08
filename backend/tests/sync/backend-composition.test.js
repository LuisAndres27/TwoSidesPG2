import './support/isolation-guard.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import net from 'node:net';
import dns from 'node:dns';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { SignJWT, decodeJwt, decodeProtectedHeader } from 'jose';
import { createBackend, ROUTES, CompositionError } from '../../src/composition/backend.js';
import { startServer, StartupError } from '../../src/composition/lifecycle.js';
import { offlineStack, stacks, JWT_ISSUER, JWT_AUDIENCE } from './support/offline-stack.js';
import { vectors, batch, clone, mutate, envelope } from './support/fixture.js';

// B05.5 stage 1: the real composition root with simulated dependencies. Synthetic data only; loopback only; no Atlas.
const connects = [], lookups = [];
let consoleSeen;
beforeEach(() => {
  connects.length = 0; lookups.length = 0; consoleSeen = [];
  const connect = net.Socket.prototype.connect;
  vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(function (...args) { connects.push(args[0]); return connect.apply(this, args); });
  const lookup = dns.lookup;
  vi.spyOn(dns, 'lookup').mockImplementation(function (host, ...rest) { lookups.push(host); return lookup.call(this, host, ...rest); });
  for (const name of ['log', 'info', 'warn', 'error']) vi.spyOn(console, name).mockImplementation((...a) => { consoleSeen.push(a.map(String).join(' ')); });
});
afterEach(async () => {
  for (const s of stacks.splice(0)) await s.backend.close({ graceMs: 100 }).catch(() => {});
  vi.restoreAllMocks();
});
const first = () => clone(vectors.operations[0]);
const A = { installationId: vectors.installationId, localPlayerId: vectors.localPlayerId, bindingGeneration: 1 };
const B = { installationId: randomUUID(), localPlayerId: randomUUID(), bindingGeneration: 1 };
const tamper = token => token.slice(0, -4) + (token.endsWith('AAAA') ? 'BBBB' : 'AAAA');

it('BC01 the composition starts Express on loopback and serves /api/health with the security headers',async()=>{
  const s=await offlineStack();await s.listen();
  expect(s.base).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  const r=await s.call('/api/health');
  expect(r.status).toBe(200);expect(r.json).toEqual({status:'ok',service:'two-sides-backend'});
  expect(r.headers.get('x-content-type-options')).toBe('nosniff');expect(r.headers.get('cache-control')).toBe('no-store');expect(r.headers.get('x-powered-by')).toBeNull();
});

it('BC02 exactly the documented routes exist; the legacy opaque-token and v1 JWT routes are not mounted',async()=>{
  const s=await offlineStack();await s.listen();
  expect(ROUTES.map(r=>r.method+' '+r.path)).toEqual(['GET /api/health','POST /api/v2/technical/registrations','POST /api/v2/technical/sessions','GET /api/v2/technical/me','GET /api/v2/players/:id','POST /api/v2/sync/batches','POST /api/v2/sync/receipts/query']);
  for(const [method,p] of [['POST','/api/identity/register'],['POST','/api/auth/session'],['GET','/api/identity/me'],['POST','/api/v1/technical/registrations'],['POST','/api/v1/technical/sessions'],['GET','/api/v1/technical/me'],['GET','/api/v1/admin/status'],['GET','/api/v2/admin/status'],['GET','/api/unknown']]){
    const r=await s.call(p,{method,body:method==='POST'?{}:undefined});expect(r.status,method+' '+p).toBe(404);expect(r.json.error).toBe('not_found');
  }
  const player=await s.player(A);
  for(const route of ROUTES.filter(r=>r.auth!=='none')){
    const p=route.path.replace(':id',player.accountId),r=await s.call(p,{method:route.method,body:route.method==='POST'?{}:undefined});
    expect(r.status,route.path).toBe(401);
  }
});

it('BC03 registration and session issue RS256 JWT v2 that the same composition validates',async()=>{
  const s=await offlineStack();await s.listen();const p=await s.player(A);
  expect(p.register.status).toBe(201);expect(p.register.json).toMatchObject({schemaVersion:2,registrationStatus:'REGISTERED',installationId:A.installationId,localPlayerId:A.localPlayerId,bindingGeneration:1});
  const header=decodeProtectedHeader(p.token),claims=decodeJwt(p.token);
  expect(header).toEqual({alg:'RS256',typ:'at+jwt',kid:'composition-offline'});
  expect(claims).toMatchObject({iss:JWT_ISSUER,aud:JWT_AUDIENCE,sub:p.accountId,ver:2,role:'player',installationId:A.installationId,localPlayerId:A.localPlayerId,bindingGeneration:1});
  expect(claims.exp-claims.iat).toBe(900);
  const me=await s.call('/api/v2/technical/me',{token:p.token});
  expect(me.status).toBe(200);expect(me.json).toEqual({schemaVersion:2,technicalAccountId:p.accountId,role:'player'});
  // The opaque credential is never echoed.
  expect(JSON.stringify(p.register.json)).not.toContain(p.credential);
});

it('BC04 requests without valid authentication are rejected on every protected route',async()=>{
  const s=await offlineStack();await s.listen();const p=await s.player(A);
  const bad=[undefined,'not-a-token',tamper(p.token),await new SignJWT({role:'player',ver:2}).setProtectedHeader({alg:'HS256',typ:'at+jwt'}).sign(new TextEncoder().encode('x'.repeat(32)))];
  for(const token of bad){
    for(const [m,pathName] of [['GET','/api/v2/technical/me'],['GET','/api/v2/players/'+p.accountId],['POST','/api/v2/sync/batches']]){
      const r=await s.call(pathName,{method:m,token,body:m==='POST'?batch([first()]):undefined});expect(r.status,String(token).slice(0,12)+' '+pathName).toBe(401);
      expect(r.headers.get('www-authenticate')).toBe('Bearer');
    }
  }
  expect((await s.repository.snapshot()).operations).toHaveLength(0);
  s.clock.value+=900_000;expect((await s.call('/api/v2/technical/me',{token:p.token})).status).toBe(401);          // expired exactly at exp
  s.clock.value-=900_000;const fresh=await p.login();expect((await s.call('/api/v2/technical/me',{token:fresh})).status).toBe(200);
  await s.identity.revokeIdentity(p.accountId);expect((await s.call('/api/v2/technical/me',{token:fresh})).status).toBe(401);       // revoked identity
});

it('BC05 an authenticated player cannot read or write another player\'s data',async()=>{
  const s=await offlineStack();await s.listen();const a=await s.player(A),b=await s.player(B);
  expect((await s.call('/api/v2/players/'+a.accountId,{token:a.token})).status).toBe(200);
  expect((await s.call('/api/v2/players/'+b.accountId,{token:a.token})).status).toBe(403);
  expect((await s.call('/api/v2/players/'+a.accountId,{token:b.token})).status).toBe(403);
  // B's token carrying A's operations (A's binding) is refused as foreign and writes nothing.
  const foreign=await s.call('/api/v2/sync/batches',{method:'POST',token:b.token,body:batch([first()])});
  expect(foreign.status).toBe(403);expect((await s.repository.snapshot()).operations).toHaveLength(0);
  // A's own token and binding are accepted, and the receipt carries A's authenticated identity, not a claimed one.
  const own=await s.call('/api/v2/sync/batches',{method:'POST',token:a.token,body:batch([first()])});
  expect(own.status).toBe(200);expect(own.json.results[0].receipt).toMatchObject({technicalAccountId:a.accountId,localPlayerId:A.localPlayerId});
  // An envelope that names another local player is rejected even with a valid token.
  const spoof=mutate(first(),e=>{e.localPlayerId=B.localPlayerId;},{newId:true});
  expect((await s.call('/api/v2/sync/batches',{method:'POST',token:a.token,body:batch([spoof])})).status).toBe(403);
  // Role escalation through the body or the registration is refused.
  expect((await s.call('/api/v2/sync/batches',{method:'POST',token:a.token,body:{...batch([first()]),role:'admin'}})).status).toBe(400);
  expect((await s.call('/api/v2/technical/registrations',{method:'POST',body:{schemaVersion:2,registrationId:randomUUID(),credential:randomBytes(32).toString('base64url'),...B,role:'admin'}})).status).toBe(400);
  expect((await s.repository.snapshot()).operations).toHaveLength(1);
});

it('BC06 sync input validation: strict envelope, size, media type, query string and duplicates',async()=>{
  const s=await offlineStack();await s.listen();const p=await s.player(A);const post=(body,o={})=>s.call('/api/v2/sync/batches',{method:'POST',token:p.token,body,...o});
  expect((await post(batch([]))).status).toBe(400);
  expect((await post(null,{raw:'{"schemaVersion":2,"schemaVersion":2}'})).status).toBe(400);
  expect((await post(null,{raw:'{not json'})).status).toBe(400);
  expect((await post(batch(Array.from({length:101},first)))).status).toBe(413);
  expect((await post(null,{raw:' '.repeat(256*1024+1)})).status).toBe(413);
  expect((await s.call('/api/v2/sync/batches?x=1',{method:'POST',token:p.token,body:batch([first()])})).status).toBe(400);
  expect((await s.call('/api/v2/sync/batches',{method:'POST',token:p.token,raw:'x',headers:{'content-type':'text/plain'}})).status).toBe(415);
  const op=first();expect((await post(batch([op,op]))).status).toBe(400);
  const badOp=mutate(first(),e=>{e.schemaVersion=99;},{newId:true});
  const rejected=await post(batch([badOp]));expect(rejected.status).toBe(422);expect(rejected.json.results[0].status).not.toBe('committed');
  expect((await s.repository.snapshot()).operations).toHaveLength(0);
});

it('BC07 sync responses: full C# batch, idempotent repeat, partial success and receipt query',async()=>{
  const s=await offlineStack();await s.listen();const p=await s.player(A);const post=body=>s.call('/api/v2/sync/batches',{method:'POST',token:p.token,body});
  const full=await post(batch(vectors.operations));
  expect(full.status).toBe(200);expect(full.json.counters.committed).toBe(vectors.operations.length);
  const again=await post(batch(vectors.operations));
  expect(again.status).toBe(200);expect(again.json.results.every(r=>r.status==='duplicate')).toBe(true);
  expect((await s.repository.snapshot()).operations).toHaveLength(vectors.operations.length);
  const bad=mutate(vectors.operations.find(o=>envelope(o).type==='game.report'),e=>{e.payload.rulesVersion='unknown';},{newId:true});
  const mixed=await post(batch([first(),bad]));expect(mixed.status).toBe(207);expect(mixed.json.results).toHaveLength(2);
  const query=await s.call('/api/v2/sync/receipts/query',{method:'POST',token:p.token,body:{schemaVersion:2,attempts:[{operationId:first().operationId,payloadHash:first().payloadHash,leaseId:randomUUID(),attempt:1}]}});
  expect(query.status).toBe(200);expect(JSON.stringify(query.json)).toContain(first().operationId);
});

it('BC08 errors are sanitized: no stack, secret, token or repository detail reaches the client',async()=>{
  const marker='composition-private-error-marker';let fail=true;
  const s=await offlineStack({repositoryOptions:{beforeCommit:async()=>{if(fail)throw new Error(marker);}}});await s.listen();const p=await s.player(A);
  const r=await s.call('/api/v2/sync/batches',{method:'POST',token:p.token,body:batch([first()])});
  expect([500,503]).toContain(r.status);expect(r.json).not.toBeNull();expect(JSON.stringify(r.json)).toContain('retryable');
  for(const needle of [marker,'Error:',' at ',p.token,p.credential,'node_modules'])expect(r.text,needle).not.toContain(needle);
  expect((await s.repository.snapshot()).operations).toHaveLength(0);
  fail=false;expect((await s.call('/api/v2/sync/batches',{method:'POST',token:p.token,body:batch([first()])})).status).toBe(200);   // retry with unchanged ids
  const bad=await s.call('/api/v2/sync/batches',{method:'POST',token:p.token,raw:'{"schemaVersion":'});expect(bad.status).toBe(400);expect(bad.json.error.code).toBe('invalid_request');
  const login=await s.call('/api/v2/technical/sessions',{method:'POST',body:{schemaVersion:2,technicalAccountId:p.accountId,credential:randomBytes(32).toString('base64url'),installationId:A.installationId,localPlayerId:A.localPlayerId}});
  expect([400,401]).toContain(login.status);expect(login.text).not.toContain(p.credential);
});

it('BC09 shutdown is orderly: in-flight work finishes, new connections are refused, resources close once in reverse order',async()=>{
  let reached,release;const hold=new Promise(r=>{release=r;}),arrived=new Promise(r=>{reached=r;});
  const s=await offlineStack({repositoryOptions:{beforeCommit:async()=>{reached();await hold;}}});await s.listen();const p=await s.player(A);
  const inflight=s.call('/api/v2/sync/batches',{method:'POST',token:p.token,body:batch([first()])});
  await arrived;
  let closed=false;const closing=s.backend.close({graceMs:5000}).then(v=>{closed=true;return v;});
  await new Promise(r=>setTimeout(r,100));
  expect(closed).toBe(false);                                           // waits for the request in flight
  await expect(fetch(s.base+'/api/health')).rejects.toThrow();            // no new connection is accepted
  release();
  const response=await inflight;expect(response.status).toBe(200);
  const summary=await closing;expect(summary).toEqual({closed:true,forced:false,resourceErrors:0});
  expect(s.closed).toEqual(['ingestion','identity']);
  const again=await s.backend.close();expect(again).toBe(summary);expect(s.closed).toHaveLength(2);   // idempotent
});

it('BC10 a request that outlives the grace period is cut; a failing resource does not stop the others',async()=>{
  let reached,release;const hold=new Promise(r=>{release=r;}),arrived=new Promise(r=>{reached=r;});
  const s=await offlineStack({repositoryOptions:{beforeCommit:async()=>{reached();await hold;}}});await s.listen();const p=await s.player(A);
  const inflight=s.call('/api/v2/sync/batches',{method:'POST',token:p.token,body:batch([first()])}).catch(e=>e);
  await arrived;
  const summary=await s.backend.close({graceMs:60});
  expect(summary).toMatchObject({closed:true,forced:true,resourceErrors:0});expect(s.closed).toEqual(['ingestion','identity']);
  expect(await inflight).toBeInstanceOf(Error);release();
  // Lifecycle alone: a failing resource is counted, the next one still closes.
  const app=(await offlineStack()).backend.app,order=[];
  const handle=await startServer(app,{resources:[{name:'a',close:async()=>{order.push('a');}},{name:'b',close:async()=>{throw new Error('boom');}},{name:'c',close:async()=>{order.push('c');}}]});
  expect(await handle.close()).toEqual({closed:true,forced:false,resourceErrors:1});expect(order).toEqual(['c','a']);
});

it('BC11 close before start only releases resources; start twice, non-loopback hosts and bad resources are refused',async()=>{
  const s=await offlineStack();
  expect(await s.backend.close()).toEqual({closed:true,forced:false,resourceErrors:0});expect(s.closed).toEqual(['ingestion','identity']);
  await expect(s.backend.start()).rejects.toMatchObject({code:'ALREADY_STARTED'});
  const t=await offlineStack();await t.listen();await expect(t.backend.start()).rejects.toMatchObject({code:'ALREADY_STARTED'});
  const u=await offlineStack();
  for(const host of ['0.0.0.0','::','192.168.1.10','twosidescluster.fxqeo8o.mongodb.net'])await expect(u.backend.start({host})).rejects.toBeInstanceOf(StartupError);
  await expect(u.backend.start({port:70000})).rejects.toMatchObject({code:'PORT_REJECTED'});
  expect(()=>startServer(u.backend.app,{resources:[{name:'x'}]})).toThrow(StartupError);
  expect(()=>startServer(()=>{},{host:'0.0.0.0'})).toThrow(StartupError);
});

it('BC12 profiles are separate: integration and main are reserved and fail closed; unsafe dependencies are refused',async()=>{
  const ok=await offlineStack();const base={jwtConfig:ok.jwtConfig,identityRepository:ok.identity,ingestionRepository:ok.repository};
  const code=options=>{try{createBackend(options);return 'created';}catch(e){return e instanceof CompositionError?e.code:'other:'+e.message;}};
  expect(code({profile:'integration',...base})).toBe('PROFILE_UNAVAILABLE');
  expect(code({profile:'main',...base})).toBe('PROFILE_UNAVAILABLE');
  expect(code({profile:'staging',...base})).toBe('PROFILE_UNKNOWN');
  expect(code({...base})).toBe('PROFILE_UNKNOWN');
  expect(code({profile:'offline-test'})).toBe('JWT_CONFIG_REJECTED');
  expect(code({profile:'offline-test',...base,jwtConfig:{...ok.jwtConfig,issuer:'https://real.example.com'}})).toBe('JWT_CONFIG_REJECTED');
  expect(code({profile:'offline-test',...base,jwtConfig:{...ok.jwtConfig,mode:'production'}})).toBe('JWT_CONFIG_REJECTED');
  expect(code({profile:'offline-test',...base,identityRepository:{}})).toBe('REPOSITORY_REJECTED');
  expect(code({profile:'offline-test',...base,ingestionRepository:{...ok.repository,identityRepository:null}})).toBe('REPOSITORY_REJECTED');
  const real=Object.create(ok.repository);Object.defineProperty(real,'synthetic',{value:false});
  expect(code({profile:'offline-test',...base,ingestionRepository:real})).toBe('REPOSITORY_NOT_SYNTHETIC');
  expect(code({profile:'offline-test',...base,resources:[{name:'x'}]})).toBe('RESOURCES_REJECTED');
  vi.stubEnv('NODE_ENV','production');expect(code({profile:'offline-test',...base})).toBe('PRODUCTION_REFUSED');vi.unstubAllEnvs();
  expect(code({profile:'offline-test',...base})).toBe('created');
});

it('BC13 no external connection is made: only loopback sockets, no DNS, no Mongoose or MongoDB client',async()=>{
  const createConnection=vi.spyOn(mongoose,'createConnection'),connect=vi.spyOn(mongoose,'connect'),client=vi.spyOn(mongoose.mongo.MongoClient.prototype,'connect');
  const s=await offlineStack();await s.listen();const p=await s.player(A);
  await s.call('/api/health');await s.call('/api/v2/technical/me',{token:p.token});await s.call('/api/v2/sync/batches',{method:'POST',token:p.token,body:batch(vectors.operations)});
  await s.backend.close();
  expect(connects.length).toBeGreaterThan(0);
  const targets=connects.map(a=>Array.isArray(a)?a[0]?.host??'localhost':typeof a==='object'&&a?(a.path?'ipc':a.host??'localhost'):'localhost');
  for(const t of targets)expect(['127.0.0.1','localhost','::1','::ffff:127.0.0.1']).toContain(t);
  expect(lookups.filter(h=>!['127.0.0.1','localhost','::1'].includes(h))).toEqual([]);
  expect(createConnection).not.toHaveBeenCalled();expect(connect).not.toHaveBeenCalled();expect(client).not.toHaveBeenCalled();
});

it('BC14 nothing is logged: no token, credential or request content reaches the console',async()=>{
  const s=await offlineStack();await s.listen();const p=await s.player(A);
  await s.call('/api/v2/sync/batches',{method:'POST',token:p.token,body:batch(vectors.operations)});
  await s.call('/api/v2/technical/me',{token:tamper(p.token)});await s.backend.close();
  const text=consoleSeen.join('\n');
  for(const secret of [p.token,p.credential,vectors.operations[0].operationId,p.accountId])expect(text).not.toContain(secret);
});

it('BC15 the composition sources do not reach Atlas, Mongoose, the C.2 harness, the environment or .env',()=>{
  const dir=path.dirname(fileURLToPath(new URL('../../src/composition/backend.js',import.meta.url)));
  const files=fs.readdirSync(dir).filter(f=>f.endsWith('.js'));expect(files.sort()).toEqual(['backend.js','lifecycle.js']);
  for(const f of files){
    const text=fs.readFileSync(path.join(dir,f),'utf8').split(String.fromCharCode(10)).filter(l=>!l.trim().startsWith('//')).join(' '),imports=[...text.matchAll(/from\s+'([^']+)'/g)].map(m=>m[1]);
    for(const i of imports)expect(i,f).not.toMatch(/mongoose|mongodb|atlas|scripts\/|c2-|durable-revocation|dotenv|mongo-/i);
    expect(text,f).not.toMatch(/process\.env|\.env\b|console\.|require\(/);
  }
  const server=fs.readFileSync(new URL('../../src/server.js',import.meta.url),'utf8');
  expect(server).not.toMatch(/mongoose|atlas|dotenv|c2-/i);
});
