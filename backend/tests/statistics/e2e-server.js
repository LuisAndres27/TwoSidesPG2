// B79 fixture ONLY. Parent receives synthetic bootstrap over redirected pipes, never a public enrollment route.
import './b80-isolation-guard.js';
import fs from 'node:fs';import readline from 'node:readline';import http from 'node:http';import {createHash} from 'node:crypto';
import {SyntheticStatisticsIdentity} from '../../src/modules/statistics/synthetic-identity.js';
import {SyntheticStatisticsStore} from '../../src/modules/statistics/synthetic-store.js';
import {createStatisticsOfflineApp} from '../../src/modules/statistics/offline-app.js';
const [directory,installation,mode]=process.argv.slice(2);
const lines=readline.createInterface({input:process.stdin});
let bootstrap;try{bootstrap=JSON.parse(await new Promise((resolve,reject)=>{lines.once('line',resolve);lines.once('close',()=>reject(Error('Synthetic bootstrap closed')));}));}catch{throw Error('Synthetic bootstrap rejected');}
if(typeof bootstrap?.token!=='string'||Object.keys(bootstrap).join(',')!=='token')throw Error('Synthetic bootstrap rejected');
const store=new SyntheticStatisticsStore({directory,key:createHash('sha256').update('PUBLIC SYNTHETIC B79 KEY NOT A PRODUCTION SECRET').digest()});
const identities=new SyntheticStatisticsIdentity();identities.issueSynthetic({installationId:installation,authorizedSyntheticToken:bootstrap.token});
const app=createStatisticsOfflineApp({profile:'statistics-offline-test',identities,store});let drop=mode==='drop-once';
const server=http.createServer((req,res)=>{const end=res.end;res.end=function(...args){if(drop){drop=false;res.destroy();return res;}return end.apply(this,args);};app(req,res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const maintenance=setInterval(()=>{void store.maintenance().catch(()=>{});},900000);maintenance.unref();
process.stdout.write(JSON.stringify({port:server.address().port})+'\n');
let closed=false;async function close(){if(closed)return;closed=true;clearInterval(maintenance);await new Promise(r=>server.close(r));await store.close();process.exitCode=0;}
lines.on('line',async line=>{if(line==='summary')process.stdout.write(JSON.stringify(await store.aggregates())+'\n');else if(line==='close'){await close();lines.close();}});
lines.on('close',()=>{void close();});
