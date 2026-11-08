// B86 — DISPOSABLE authenticated + TLS MongoDB replica set used only to exercise the exact privilege matrix and the Atlas-style connection rules
// locally. It is a NEW container (name twosides-b86-rbac, label twosides.b86.disposable) from the already-present mongo:8.0 image, published only on
// 127.0.0.1:27086, with its own throw-away CA, keyfile and random synthetic passwords generated in memory (never printed, never written to the repo).
// The owner's containers (twosides-b811-mongo, B85 Metabase/analytics) are never touched. Opt-in: B86_REAL_TESTS=1.
import '../statistics/b80-isolation-guard.js';
import {execFile,spawn} from 'node:child_process';import {randomBytes} from 'node:crypto';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {MongoClient} from 'mongodb';
import {LOCAL_RBAC as L,STATISTICS_IDENTITIES as I,preparedConfiguration} from '../../src/modules/statistics/atlas-policy.js';
import {mongoRoleSpec,PRIVILEGE_MATRIX} from '../../src/modules/statistics/atlas-privileges.js';
const NAME=L.container,pause=ms=>new Promise(r=>setTimeout(r,ms));
const dockerEnv=()=>Object.fromEntries(['SystemRoot','PATH','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramData','ProgramFiles','TEMP','TMP'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
const docker=(...args)=>new Promise((resolve,reject)=>execFile('docker',args,{windowsHide:true,timeout:120000,maxBuffer:1<<20,env:dockerEnv()},(e,out)=>e?reject(Error('docker command failed')):resolve(out)));
const dockerStdin=(args,input)=>new Promise((resolve,reject)=>{const p=spawn('docker',args,{windowsHide:true,env:dockerEnv()});let out='';p.stdout.on('data',d=>out+=d);p.on('error',()=>reject(Error('docker stdin failed')));p.on('close',c=>c===0?resolve(out):reject(Error('docker stdin command failed')));p.stdin.end(input);});
const password=()=>randomBytes(24).toString('base64url');

const SERVER_SCRIPT=`set -e
mkdir -p /tmp/pki /tmp/db && cd /tmp/pki
# idempotent: a restart (docker stop/start) must keep the same CA, certificate and keyfile
if [ ! -f /tmp/pki/server.pem ]; then
openssl rand -base64 756 > keyfile && chmod 400 keyfile
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt -days 2 -subj "/CN=TwoSidesB86TestCA" 2>/dev/null
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj "/CN=localhost" 2>/dev/null
printf "subjectAltName=DNS:localhost,IP:127.0.0.1" > ext.cnf
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 2 -extfile ext.cnf 2>/dev/null
cat server.crt server.key > server.pem
# a SECOND, unrelated CA used only to prove that a certificate chain that is not trusted is refused
openssl req -x509 -newkey rsa:2048 -nodes -keyout other.key -out other-ca.crt -days 2 -subj "/CN=UnrelatedCA" 2>/dev/null
fi
chown -R mongodb:mongodb /tmp/pki /tmp/db
exec setpriv --reuid=mongodb --regid=mongodb --clear-groups mongod --dbpath /tmp/db --port ${L.port} --replSet ${L.replicaSet} --keyFile /tmp/pki/keyfile --auth --bind_ip_all --tlsMode requireTLS --tlsCertificateKeyFile /tmp/pki/server.pem --tlsCAFile /tmp/pki/ca.crt --tlsAllowConnectionsWithoutCertificates
`;

export async function startRbacServer(){
 if(process.env.B86_REAL_TESTS!=='1')throw Error('B86 real tests disabled');
 // Only our own disposable container may be replaced.
 try{const labels=JSON.parse(await docker('inspect',NAME))[0]?.Config?.Labels??{};if(labels['twosides.b86.disposable']!=='true')throw Error('foreign container with the disposable name');await docker('rm','-f',NAME);}catch(e){if(e.message==='foreign container with the disposable name')throw e;}
 await docker('run','-d','--name',NAME,'--label','twosides.b86.disposable=true','--memory','512m','--cpus','1','-p',`${L.host}:${L.port}:${L.port}`,'--entrypoint','bash','mongo:8.0','-c',SERVER_SCRIPT);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'twosides-b86-')),caFile=path.join(dir,'ca.crt'),otherCaFile=path.join(dir,'other-ca.crt');
 for(let i=0;;i++){try{await docker('cp',`${NAME}:/tmp/pki/ca.crt`,caFile);await docker('cp',`${NAME}:/tmp/pki/other-ca.crt`,otherCaFile);if(fs.statSync(caFile).size>0)break;}catch{}if(i>40)throw Error('B86 test server did not start');await pause(500);}
 const tlsFlags=['--quiet','--tls','--tlsCAFile','/tmp/pki/ca.crt','--host','localhost','--port',String(L.port)];
 const adminPassword=password();
 for(let i=0;;i++){try{await dockerStdin(['exec','-i',NAME,'mongosh',...tlsFlags],`rs.initiate({_id:'${L.replicaSet}',members:[{_id:0,host:'${L.host}:${L.port}'}]})`);break;}catch{if(i>40)throw Error('B86 replica set did not initiate');await pause(1000);}}
 for(let i=0;;i++){try{const out=await dockerStdin(['exec','-i',NAME,'mongosh',...tlsFlags],`print(db.hello().isWritablePrimary)`);if(out.includes('true'))break;}catch{}if(i>40)throw Error('B86 primary not elected');await pause(1000);}
 // localhost exception: the very first user (synthetic administrator of the DISPOSABLE server) is created without authentication.
 await dockerStdin(['exec','-i',NAME,'mongosh',...tlsFlags],`db.getSiblingDB('admin').createUser({user:'b86_root',pwd:${JSON.stringify(adminPassword)},roles:[{role:'root',db:'admin'}]})`);
 const fresh=()=>L.databasePrefix+randomBytes(8).toString('hex');let databaseName=fresh(),analyticsName=fresh();const created=[databaseName,analyticsName],specFor=identity=>mongoRoleSpec(identity,databaseName,PRIVILEGE_MATRIX[identity].analytics?analyticsName:undefined),credentials=Object.fromEntries(Object.keys(I).map(k=>[k,{username:I[k].user,password:password()}]));
 const rootClient=()=>new MongoClient(`mongodb://${L.host}:${L.port}/`,{directConnection:true,replicaSet:L.replicaSet,tls:true,tlsCAFile:caFile,auth:{username:'b86_root',password:adminPassword},authSource:'admin',authMechanism:'SCRAM-SHA-256',serverSelectionTimeoutMS:8000});
 const root=rootClient();await root.connect();const admin=root.db('admin');
 const createIdentity=async(identity,spec=specFor(identity))=>{
  await admin.command({createRole:spec.role,privileges:spec.privileges,roles:[]});
  await admin.command({createUser:I[identity].user,pwd:credentials[identity].password,roles:[{role:spec.role,db:'admin'}],mechanisms:['SCRAM-SHA-256']});
 };
 for(const identity of Object.keys(I))await createIdentity(identity);
 const config=identity=>preparedConfiguration({kind:'local-rbac',host:L.host,database:databaseName,analyticsDatabase:PRIVILEGE_MATRIX[identity].analytics?analyticsName:undefined,identity});
 return {get database(){return databaseName;},get analyticsDatabase(){return analyticsName;},caFile,otherCaFile,credentials,config,rootClient,
  // Replaces the role of one identity with a custom privilege list (used for the per-action necessity probes).
  async replaceRole(identity,privileges){await admin.command({updateRole:I[identity].role,privileges,roles:[]});},
  async restoreRole(identity){const spec=specFor(identity);await admin.command({updateRole:spec.role,privileges:spec.privileges,roles:[]});},
  // Re-points the three roles to a brand-new database name (a fresh namespace for tests that need exact totals). Provision it again afterwards.
  async useFreshDatabase(){databaseName=fresh();analyticsName=fresh();created.push(databaseName,analyticsName);for(const identity of Object.keys(I)){const spec=specFor(identity);await admin.command({updateRole:spec.role,privileges:spec.privileges,roles:[]});}return databaseName;},
  async dropDatabase(){for(const name of created)await root.db(name).dropDatabase();},
  async stop(){await docker('stop','-t','5',NAME);},async start(){await docker('start',NAME);for(let i=0;;i++){try{const c=rootClient();await c.connect();await c.db('admin').command({ping:1});await c.close();return;}catch{if(i>40)throw Error('B86 test server did not return');await pause(1000);}}},
  async close(){try{await root.close();}catch{}try{await docker('rm','-f',NAME);}finally{fs.rmSync(dir,{recursive:true,force:true});}}};
}
