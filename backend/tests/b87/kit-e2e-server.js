// B87 fixture ONLY (used by local-persistence/statistics-kit-tests). A real startKitExpress over a disposable synthetic store, on 127.0.0.1, no Atlas.
// argv: <storeDirectory twosides-b79-*> <kitDirectory>.  stdout: one JSON line {port}; stdin commands: "summary" | "close".
import '../statistics/b80-isolation-guard.js';
import readline from 'node:readline';
import {SyntheticStatisticsStore} from '../../src/modules/statistics/synthetic-store.js';
import {B84_KEY} from '../../tools/b84/demo-key.js';
import {startKitExpress} from '../../tools/b87/express-atlas-lib.mjs';
const [directory,kitDir]=process.argv.slice(2);
const store=new SyntheticStatisticsStore({directory,key:B84_KEY});
let express;for(let attempt=0;attempt<30&&!express;attempt++){try{express=await startKitExpress({store,profile:'statistics-offline-test',kitDir,port:20000+Math.floor(Math.random()*40000),pollEveryMs:100});}catch(e){if(e?.code!=='EADDRINUSE')throw e;}}
if(!express)throw Error('no free port');
process.stdout.write(JSON.stringify({port:express.port})+'\n');
const lines=readline.createInterface({input:process.stdin});let closed=false;
async function close(){if(closed)return;closed=true;await express.close();await store.close();process.exitCode=0;}
lines.on('line',async line=>{if(line==='summary')process.stdout.write(JSON.stringify(await store.aggregates())+'\n');else if(line==='close'){await close();lines.close();}});
lines.on('close',()=>{void close();});
