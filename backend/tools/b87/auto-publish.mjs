// B87 — automatic local publisher (identity "publisher" only) as a process SEPARATE from Express. Claude Code never runs this against Atlas.
// Every N minutes it runs the EXISTING publish action (tools/b86/session.js, unchanged: one transaction delete+insert, snapshot read concern, majority write concern),
// but only when the source counters changed since the last successful publish (a read-only fingerprint with the publisher's own `find` privilege).
//   Usage (through Run-Atlas-AutoPublish.ps1):  node tools/b87/auto-publish.mjs [--interval-minutes 2]
//   Exit 2: not authorized / not the publisher identity / bad interval / guard present (nothing contacted).  Exit 3: credentials not on stdin.  Exit 0: stopped with Ctrl+C.
// Credentials: ONE JSON line on stdin {"username","password"}; the password lives only in memory. Output: time, documents and state only, never secrets.
import fs from 'node:fs';import {createHash} from 'node:crypto';
import {resolveStatisticsStorage,StatisticsConfigError} from '../../src/modules/statistics/atlas-policy.js';
import {connectPrepared} from '../../src/modules/statistics/atlas-connector.js';
import {MONGO_STATISTICS_COLLECTIONS as names} from '../../src/modules/statistics/mongo-schema.js';
import {runPreparedSession} from '../b86/session.js';
import {formatSessionFailure} from '../b86/diagnose.js';
import {createAutoPublisher,MIN_INTERVAL_MS} from './auto-publish-lib.mjs';

const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
const fail=(code,message)=>{process.stderr.write(message+'\n');process.exit(code);};
const minutes=Number(option('--interval-minutes')??2);
if(!Number.isFinite(minutes)||minutes*60000<MIN_INTERVAL_MS||minutes>1440)fail(2,'--interval-minutes must be between 1 and 1440.');
let config;
try{config=resolveStatisticsStorage(process.env);}catch(e){fail(2,'Statistics storage not authorized: '+(e instanceof StatisticsConfigError?e.code:'configuration_rejected'));}
if(config.mode!=='atlas-test')fail(2,'Statistics storage is disabled for Atlas (mode '+config.mode+'). Nothing was contacted.');
if(config.identity!=='publisher')fail(2,'This process needs the publisher identity.');
if(process.stdin.isTTY)fail(3,'Credentials must arrive through stdin (use Run-Atlas-AutoPublish.ps1).');
let raw='';for await(const chunk of process.stdin)raw+=chunk;
let credentials;try{credentials=JSON.parse(raw.trim());}catch{fail(3,'Credentials not supplied.');}
raw='';
if(fs[Symbol.for('twosides.b80.fs.guard')])fail(2,'The B80 test-isolation guard is active in this process: it refuses every non-loopback connection. Nothing was contacted.');

// Fingerprint: read-only, over a connection that is opened lazily and dropped after any failure (the next cycle reconnects).
let connection;
async function fingerprint(){
 try{
  connection??=await connectPrepared(config,credentials);
  const docs=await connection.db.collection(names.counts).find({}).toArray();
  const hash=createHash('sha256');
  for(const d of docs.sort((a,b)=>String(a._id).localeCompare(String(b._id))))hash.update(JSON.stringify([d._id,Object.entries(d.values??{}).sort(([a],[b])=>a.localeCompare(b))]));
  return hash.digest('hex');
 }catch(error){try{await connection?.client.close();}catch{/* see above */}connection=undefined;throw error;}
}
const secrets=()=>({host:config.host,user:config.user,password:credentials.password});
const publisher=createAutoPublisher({
 intervalMs:Math.round(minutes*60000),
 fingerprint,
 publish:async()=>{const report=await runPreparedSession({config,credentials,action:'publish'});return {documents:report.documents};},
 describeError:error=>formatSessionFailure(error,secrets()),
 log:text=>console.log(text)});
console.log(`Automatic publisher started: every ${minutes} min, only when the counters change. Ctrl+C to stop.`);
publisher.start();
let closing=false;
const shutdown=async()=>{if(closing)return;closing=true;console.log('Stopping (waiting for the cycle in progress)...');await publisher.stop();try{await connection?.client.close();}catch{}credentials.password='';console.log('Stopped.');process.exit(0);};
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
