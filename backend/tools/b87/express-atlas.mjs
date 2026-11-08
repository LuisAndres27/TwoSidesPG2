// B87 — command line of the persistent LOCAL Express that stores the statistics of ONE authorized test game in MongoDB Atlas (identity "ingest" only).
// Claude Code never runs this against Atlas. Listens on 127.0.0.1 only. Usage (through Run-Atlas-Express.ps1):  node tools/b87/express-atlas.mjs --kit-dir C:\TwoSidesStatsKit\hand-over [--port 4187]
//   Exit 2: storage not authorized / not the ingest identity / guard present (nothing was contacted).  Exit 3: credentials not supplied through stdin.  Exit 4: could not start.
// Credentials: ONE JSON line on stdin {"username":"...","password":"..."} (never arguments, environment variables, files or the URI).
import fs from 'node:fs';
import {resolveStatisticsStorage,StatisticsConfigError} from '../../src/modules/statistics/atlas-policy.js';
import {openPreparedIngestRepository} from '../../src/modules/statistics/atlas-connector.js';
import {B84_KEY} from '../b84/demo-key.js';   // neutral module: demo-store.js would load the B80 guard
import {formatSessionFailure} from '../b86/diagnose.js';
import {startKitExpress,ExpressKitError} from './express-atlas-lib.mjs';

const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
const fail=(code,message)=>{process.stderr.write(message+'\n');process.exit(code);};
const kitDir=option('--kit-dir'),port=Number(option('--port')??4187);
if(!kitDir)fail(2,'Usage: express-atlas.mjs --kit-dir <absolute folder> [--port 4187]');
let config;
try{config=resolveStatisticsStorage(process.env);}catch(e){fail(2,'Statistics storage not authorized: '+(e instanceof StatisticsConfigError?e.code:'configuration_rejected'));}
if(config.mode!=='atlas-test')fail(2,'Statistics storage is disabled for Atlas (mode '+config.mode+'). Nothing was contacted.');
if(config.identity!=='ingest')fail(2,'This server needs the ingest identity.');
if(process.stdin.isTTY)fail(3,'Credentials must arrive through stdin (use Run-Atlas-Express.ps1).');
let raw='';for await(const chunk of process.stdin)raw+=chunk;
let credentials;try{credentials=JSON.parse(raw.trim());}catch{fail(3,'Credentials not supplied.');}
raw='';
if(fs[Symbol.for('twosides.b80.fs.guard')])fail(2,'The B80 test-isolation guard is active in this process: it refuses every non-loopback connection. Nothing was contacted.');
let repository,express;
try{
 repository=await openPreparedIngestRepository({config,credentials,key:B84_KEY});
 express=await startKitExpress({store:repository.repository,kitDir,port});
}catch(e){
 try{await repository?.close();}catch{/* see above */}
 fail(4,e instanceof ExpressKitError?'Could not start: '+e.code:formatSessionFailure(e,{host:config.host,user:config.user,password:credentials.password}));
}
credentials.password='';
console.log('Statistics Express listening on '+express.audience+' (loopback only). Atlas database: '+config.database+'.');
console.log('Waiting for the game to write installation.json in '+kitDir+' ... (Ctrl+C to stop; kit.json is deleted on exit)');
let lastReport='';
const report=setInterval(()=>{
 const metrics={...express.app.locals.statisticsMetrics},line=JSON.stringify({bound:express.state.installationId!==null,tokensIssued:express.state.issued,ignoredOtherInstallations:express.state.ignoredOtherInstallations,http:metrics});
 if(line!==lastReport){lastReport=line;console.log('[status] '+line);}   // counts only: no ids, no tokens, no payloads
},30000);report.unref();
let closing=false;
const shutdown=async()=>{if(closing)return;closing=true;clearInterval(report);try{await express.close();}catch{}try{await repository.close();}catch{}console.log('Stopped. kit.json removed.');process.exit(0);};
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
