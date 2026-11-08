// B84 — local demonstration server. Listens ONLY on 127.0.0.1. Usage: node tools/b84/demo-server.mjs [--seed] [--port 4184]
// MongoDB: the owner's container twosides-b811-mongo (verified before any write). Atlas is never contacted; MONGODB_URI is never read.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {openB84Store,DEMO_DATABASE} from './demo-store.js';
import {createB84DemoApp,provisionDemoAdmin} from '../../src/modules/statistics/demo-app.js';
import {SyntheticStatisticsIdentity} from '../../src/modules/statistics/synthetic-identity.js';
import {RateLimiter} from '../../src/middleware/rate-limiter.js';
import {generateDemoEvents,expectedTotals} from './generator.js';
import {seedThroughHttp} from './seed.js';
import {overviewView,biomesView,endingsView} from '../../src/modules/statistics/admin-statistics.js';

const args=process.argv.slice(2),flag=name=>args.includes(name),option=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
const port=Number(option('--port')??4184);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');
const here=path.dirname(fileURLToPath(import.meta.url));
const dashboardDir=path.resolve(here,'../../dashboard');
const credentialDir=path.join(process.env.LOCALAPPDATA??path.resolve(here,'../../.b84-local'),'TwoSidesB84Demo');

const store=await openB84Store({kind:'demo'});
const identities=new SyntheticStatisticsIdentity(),admin=await provisionDemoAdmin();
let bypass=false;const realLimiter=new RateLimiter(),ingestLimiter={consume:(...a)=>bypass?undefined:realLimiter.consume(...a)};
const app=await createB84DemoApp({store:store.repository,identities,admin,dashboardDir,ingestLimiter});
const server=app.listen(port,'127.0.0.1');
await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
// Administrator credentials: written to a private local file, never printed. They change on every start (in-memory account).
fs.mkdirSync(credentialDir,{recursive:true});
const credentialFile=path.join(credentialDir,'demo-admin.json');
fs.writeFileSync(credentialFile,JSON.stringify({note:'Credenciales ficticias de la demostracion B84. Cambian en cada arranque. No usar en ningun otro sitio.',technicalAccountId:admin.technicalAccountId,credential:admin.credential},null,2));
console.log('B84 demo server listening on http://127.0.0.1:'+port+'/dashboard/  (loopback only)');
console.log('MongoDB: container twosides-b811-mongo, database '+DEMO_DATABASE+' (synthetic, kept)');
console.log('Administrator credentials (fictitious, regenerated at each start): '+credentialFile);
if(flag('--seed')){
 const {events}=generateDemoEvents();bypass=true;
 const result=await seedThroughHttp({baseUrl:'http://127.0.0.1:'+port,issue:installationId=>identities.issueSynthetic({installationId,lifetimeMs:3600000}),events,onProgress:p=>console.log('  seeded batches:',p.batches)});
 bypass=false;
 const counts=await store.repository.aggregates(),expected=expectedTotals(events),overview=overviewView(counts),biomes=biomesView(counts),endings=endingsView(counts);
 const same=overview.installations===expected.installations&&overview.gamesStarted===expected.gamesStarted&&overview.gamesCompleted===expected.gamesCompleted&&overview.effectiveMs===expected.effectiveMs&&
  overview.events===expected.events&&['good','medium','bad'].every(k=>endings[k]===expected.endings[k])&&biomes.biomes.every(b=>b.visits===expected.biomes[b.id].visits&&b.effectiveMs===expected.biomes[b.id].effectiveMs);
 console.log('Seed result:',JSON.stringify(result.tally));
 console.log('Aggregate vs independent oracle:',same?'MATCH':'MISMATCH',JSON.stringify({events:overview.events,gamesStarted:overview.gamesStarted,gamesCompleted:overview.gamesCompleted}));
}
let closing=false;
const shutdown=async()=>{if(closing)return;closing=true;await new Promise(r=>{server.close(r);server.closeAllConnections?.();});try{await store.close();}catch{}process.exit(0);};
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
