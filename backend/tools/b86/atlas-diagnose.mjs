// B86.4 — command line of the one-off READER diagnostic. Owner only. Credentials: ONE JSON line on stdin (never arguments, variables, files or the URI).
//   Exit 0: variant A works.  Exit 1: variant A fails.  Exit 2: not authorized/disabled (nothing contacted).  Exit 3: credentials not supplied.
import {resolveStatisticsStorage,StatisticsConfigError} from '../../src/modules/statistics/atlas-policy.js';
import {runDiagnostics,formatReport,parseVariants} from './diagnose.js';

const fail=(code,message)=>{process.stderr.write(message+'\n');process.exit(code);};
let config;
try{config=resolveStatisticsStorage(process.env);}catch(e){fail(2,'Statistics storage not authorized: '+(e instanceof StatisticsConfigError?e.code:'configuration_rejected'));}
if(config.mode!=='atlas-test')fail(2,'Atlas is disabled (mode '+config.mode+'). Nothing was contacted.');
if(config.identity!=='reader')fail(2,'This diagnostic is limited to the reader identity.');
if(process.stdin.isTTY)fail(3,'Credentials must arrive through stdin (use Run-Atlas-Diagnose.ps1).');
let variants;try{const i=process.argv.indexOf('--variants');variants=parseVariants(i>=0?process.argv[i+1]:undefined);}catch{fail(2,'Usage: atlas-diagnose.mjs [--variants all|A,B,C,D,E,F]');}
let raw='';for await(const chunk of process.stdin)raw+=chunk;
let credentials;try{credentials=JSON.parse(raw.trim());}catch{fail(3,'Credentials not supplied.');}
raw='';
let report;
try{report=await runDiagnostics({config,credentials,variants});}catch(e){fail(1,'Diagnostic could not start: '+(e?.name==='StatisticsConnectionError'||e?.name==='DiagnosticRefused'?(e.category??e.name):'configuration_rejected'));}
process.stdout.write(formatReport(report)+'\n');
process.exit(report.aOk===undefined?(report.results.every(r=>r.ok)?0:1):(report.aOk?0:1));   // A decides when it ran; otherwise every requested variant must work
