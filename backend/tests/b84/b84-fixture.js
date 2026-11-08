import '../statistics/b80-isolation-guard.js';
import path from 'node:path';import {fileURLToPath} from 'node:url';import {randomUUID} from 'node:crypto';
import {createB84DemoApp,provisionDemoAdmin} from '../../src/modules/statistics/demo-app.js';
import {SyntheticStatisticsIdentity} from '../../src/modules/statistics/synthetic-identity.js';
import {generateCredential} from '../../src/modules/identity/identity.js';
import {seedThroughHttp} from '../../tools/b84/seed.js';
export const dashboardDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../dashboard');
const noLimit={consume(){}};

// Starts the full B84 composition on 127.0.0.1:<ephemeral> over ANY statistics store (driver double offline, real MongoDB in the real test).
export async function startDemo({store,now=Date.now,ingestLimiter=noLimit,limiter}){
 const identities=new SyntheticStatisticsIdentity(),admin=await provisionDemoAdmin({now});
 const app=await createB84DemoApp({store,identities,admin,dashboardDir,now,ingestLimiter,...(limiter?{limiter}:{})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const url='http://127.0.0.1:'+server.address().port;
 const call=async(method,route,{token,body,headers={}}={})=>{
  const response=await fetch(url+route,{method,redirect:'manual',headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});
  const text=await response.text();let json=null;try{json=JSON.parse(text);}catch{/* static asset */}
  return {status:response.status,headers:response.headers,text,json};
 };
 const login=async(technicalAccountId=admin.technicalAccountId,credential=admin.credential)=>call('POST','/api/v1/admin/session',{body:{schemaVersion:1,technicalAccountId,credential}});
 const adminToken=async()=>(await login()).json.accessToken;
 // A real player account (role 'player') in the same in-memory identity store.
 const playerId=randomUUID(),playerSecret=generateCredential();
 admin.repository.seedSyntheticAccount(playerId,await admin.hasher.hash(playerSecret),'player');
 return {url,server,admin,identities,call,login,adminToken,player:{id:playerId,credential:playerSecret},
  seed:(events,issueNow=now())=>seedThroughHttp({baseUrl:url,events,issue:installationId=>identities.issueSynthetic({installationId,now:issueNow,lifetimeMs:3600000})}),
  async close(){await new Promise(r=>{server.close(r);server.closeAllConnections?.();});}};
}
