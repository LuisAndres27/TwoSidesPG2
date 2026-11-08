// B86 — command line for ONE future, owner-authorized Atlas session. Claude Code never runs it against Atlas.
//   Exit 2: storage mode is not Atlas / not authorized (nothing was contacted).  Exit 3: credentials were not supplied through stdin.
//   Exit 4: the session failed (only a safe category is printed).                 Exit 0: report printed (no secrets).
// Credentials: ONE JSON line on stdin {"username":"...","password":"..."} (the Run-Atlas-Session.ps1 wrapper feeds it from a hidden prompt).
// Never arguments, never environment variables, never files, never the URI.
import fs from 'node:fs';
import {resolveStatisticsStorage,StatisticsConfigError} from '../../src/modules/statistics/atlas-policy.js';
import {runPreparedSession} from './session.js';
import {formatSessionFailure} from './diagnose.js';

const args=process.argv.slice(2),action=args[args.indexOf('--action')+1];
const fail=(code,message)=>{process.stderr.write(message+'\n');process.exit(code);};
if(!['preflight','provision','seed','publish','read'].includes(action))fail(2,'Usage: atlas-session.mjs --action preflight|provision|seed|publish|read');
let config;
try{config=resolveStatisticsStorage(process.env);}catch(e){fail(2,'Statistics storage not authorized: '+(e instanceof StatisticsConfigError?e.code:'configuration_rejected'));}
if(config.mode!=='atlas-test')fail(2,'Statistics storage is disabled for Atlas (mode '+config.mode+'). Nothing was contacted.');
const required={preflight:null,provision:'schema',seed:'ingest',publish:'publisher',read:'reader'}[action];
if(required&&config.identity!==required)fail(2,'This action needs the '+required+' identity.');
if(process.stdin.isTTY)fail(3,'Credentials must arrive through stdin (use Run-Atlas-Session.ps1).');
let raw='';
for await(const chunk of process.stdin)raw+=chunk;
let credentials;try{credentials=JSON.parse(raw.trim());}catch{fail(3,'Credentials not supplied.');}
raw='';
// B86.6: the B80 test-isolation guard patches net/tls/dns to refuse every non-loopback host. If this process carries it (session.js reaches it through tools/b84/demo-store.js
// and tests/statistics/b81-container-instance.js), Atlas cannot be contacted: stop BEFORE connecting instead of failing later with an opaque error.
if(fs[Symbol.for('twosides.b80.fs.guard')])fail(2,'The B80 test-isolation guard is active in this process: it refuses every non-loopback connection, so Atlas cannot be reached from here. Nothing was contacted.');
try{
 const report=await runPreparedSession({config,credentials,action});
 process.stdout.write(JSON.stringify(report,null,2)+'\n');process.exit(0);
}catch(e){fail(4,formatSessionFailure(e,{host:config.host,user:config.user,password:credentials.password}));}
