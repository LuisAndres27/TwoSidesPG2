import {describe,it,expect} from 'vitest';
import {h,findAll,textOf} from '../../dashboard/js/vdom.js';
import {formatDuration,formatPercent,formatInt,minutes} from '../../dashboard/js/format.js';
import {groupedBars,donut,lineChart,legend,PALETTE} from '../../dashboard/js/charts.js';
import {buildDashboard,buildLogin,buildStatus} from '../../dashboard/js/view.js';
import {createApi,DashboardError} from '../../dashboard/js/api.js';
import {overviewView,biomesView,decisionsView,endingsView,timeseriesView} from '../../src/modules/statistics/admin-statistics.js';
import {generateDemoEvents,expectedTotals} from '../../tools/b84/generator.js';
import {projectStatistics} from '../../src/modules/statistics/projection.js';
import {validateEvent} from '../../src/modules/statistics/contract.js';

// Build the data the dashboard consumes from real projections of generated events (no HTTP needed here).
function dataset(){
 const {events}=generateDemoEvents({installations:5,days:4,anchor:'2026-11-04'}),counts={},now=Date.parse('2026-11-04T12:00:00Z');
 for(const x of events){const v=validateEvent({EventJson:x.canonical,PayloadHash:x.payloadHash},x.installationId,now);for(const i of projectStatistics(v).increments)counts[i.period+'|'+i.key]=(counts[i.period+'|'+i.key]??0)+i.amount;}
 const mode={demo:true,label:'MODO DEMOSTRACIÓN: datos sintéticos, no son jugadores reales'};
 return {counts,expected:expectedTotals(events),data:{overview:overviewView(counts),biomes:biomesView(counts),decisions:decisionsView(counts),endings:endingsView(counts),timeseries:timeseriesView(counts,{days:7,nowMs:now}),
  status:{query:'ok',storage:'mongodb-local-replica-set',retention:'experimental-not-approved-for-production'},mode,generatedAt:'2026-11-04T12:00:00.000Z'}};
}

describe('B84 formatting',()=>{
 it('formats durations, percentages and empty values',()=>{
  expect(formatDuration(0)).toBe('0 s');expect(formatDuration(65000)).toBe('1 min 05 s');expect(formatDuration(3723000)).toBe('1 h 02 min');expect(formatDuration(null)).toBe('—');
  expect(formatPercent(0.5)).toBe('50.0 %'.replace('.',(0.5).toLocaleString('es-MX').includes(',')?',':'.'));expect(formatPercent(null)).toBe('—');expect(formatInt(undefined)).toBe('—');expect(minutes(90000)).toBe(1.5);
 });
});

describe('B84 charts (virtual tree)',()=>{
 it('grouped bars: one rect and one value label per series per category, accessible name and tooltips',()=>{
  const tree=groupedBars({title:'T',categories:[{label:'A'},{label:'B'},{label:'C'}],series:[{name:'S1',color:PALETTE.teal,values:[1,2,3]},{name:'S2',color:PALETTE.orange,values:[0,5,7]}]});
  expect(findAll(tree,n=>n.tag==='rect')).toHaveLength(6);expect(tree.attrs['aria-label']).toBe('T');expect(tree.attrs.role).toBe('img');
  expect(findAll(tree,n=>n.tag==='title').some(n=>textOf(n)==='C · S2: 7')).toBe(true);
  const heights=findAll(tree,n=>n.tag==='rect').map(n=>n.attrs.height);expect(heights[5]).toBeGreaterThan(heights[3]);   // 7 taller than 5
  expect(heights[1]).toBe(0);expect(heights[0]).toBeGreaterThan(0);   // a zero value draws no bar; a non-zero one does
 });
 it('donut: arcs are proportional and the centre shows the total; empty data draws no arc',()=>{
  const tree=donut({title:'D',slices:[{label:'a',value:1,color:'#000'},{label:'b',value:3,color:'#111'}]});
  const arcs=findAll(tree,n=>n.tag==='circle'&&n.attrs['stroke-dasharray']);expect(arcs).toHaveLength(2);
  const len=a=>Number(a.attrs['stroke-dasharray'].split(' ')[0])+2;expect(len(arcs[1])/len(arcs[0])).toBeCloseTo(3,5);expect(textOf(tree)).toContain('4');
  expect(findAll(donut({title:'E',slices:[{label:'a',value:0,color:'#000'}]}),n=>n.attrs['stroke-dasharray'])).toHaveLength(0);
 });
 it('line chart: one polyline per series and one marker per point; the last x label never collides',()=>{
  const labels=Array.from({length:30},(_,i)=>String(i+1)),tree=lineChart({title:'L',labels,series:[{name:'a',color:PALETTE.teal,values:labels.map((_,i)=>i)},{name:'b',color:PALETTE.orange,values:labels.map(()=>3)}]});
  expect(findAll(tree,n=>n.tag==='polyline')).toHaveLength(2);expect(findAll(tree,n=>n.tag==='circle')).toHaveLength(60);
  const xs=findAll(tree,n=>n.tag==='text'&&n.attrs['text-anchor']==='middle').map(n=>n.attrs.x);expect(xs.at(-1)-xs.at(-2)).toBeGreaterThan(25);
 });
 it('legend uses classes, never inline styles',()=>{expect(JSON.stringify(legend([{name:'x',color:PALETTE.teal}]))).not.toContain('style');});
});

describe('B84 dashboard view',()=>{
 it('shows exactly the accepted numbers: cards, biomes, decisions, endings and trends',()=>{
  const {data,expected}=dataset(),tree=buildDashboard(data),text=textOf(tree);
  for(const label of ['Instalaciones','Partidas iniciadas','Partidas completadas','Tasa de finalización','Tiempo efectivo total','Sesiones'])expect(text).toContain(label);
  const cards=findAll(tree,n=>n.attrs.className==='card').map(n=>[textOf(n.children[0]),textOf(n.children[1])]);
  const byLabel=Object.fromEntries(cards);expect(byLabel['Instalaciones']).toBe(formatInt(expected.installations));expect(byLabel['Partidas iniciadas']).toBe(formatInt(expected.gamesStarted));expect(byLabel['Partidas completadas']).toBe(formatInt(expected.gamesCompleted));
  expect(byLabel['Tasa de finalización']).toBe(formatPercent(expected.gamesCompleted/expected.gamesStarted));expect(byLabel['Tiempo efectivo total']).toBe(formatDuration(expected.effectiveMs));
  for(const name of ['Océano','Selva','Desierto','Bosque','Tundra'])expect(text).toContain(name);
  for(const name of ['Final bueno','Final medio','Final malo'])expect(text).toContain(name);
  expect(findAll(tree,n=>n.tag==='svg')).toHaveLength(7);   // 2 biome bars + 2 decision bars + donut + 2 line charts
 });
 it('empty database shows an empty state instead of charts',()=>{
  const {data}=dataset();const empty={...data,overview:{...data.overview,events:0}};const tree=buildDashboard(empty);
  expect(textOf(tree)).toContain('Aún no hay estadísticas');expect(findAll(tree,n=>n.tag==='svg')).toHaveLength(0);
 });
 it('hostile strings from the API are only ever text nodes (no markup, no attributes injected)',()=>{
  const {data}=dataset();data.mode={demo:true,label:'<img src=x onerror=alert(1)>'};data.status={...data.status};
  const tree=buildStatus({data,state:'ready'}),json=JSON.stringify(tree);
  expect(findAll(tree,n=>n.tag==='img')).toHaveLength(0);expect(textOf(tree)).toContain('<img src=x onerror=alert(1)>');expect(json).not.toContain('"onerror"');
 });
 it('login form: submit handler, password field, error and busy states',()=>{
  const calls=[],tree=buildLogin({error:'Credenciales no válidas.',busy:true,onSubmit:e=>calls.push(e)});
  expect(findAll(tree,n=>n.tag==='input'&&n.attrs.type==='password')).toHaveLength(1);expect(textOf(tree)).toContain('Credenciales no válidas.');
  expect(findAll(tree,n=>n.tag==='button')[0].attrs.disabled).toBe(true);expect(findAll(tree,n=>n.tag==='form')[0].attrs.onsubmit).toBeTypeOf('function');
  expect(textOf(tree)).toContain('datos sintéticos');
 });
 it('system status panel: demo mode, last update, query state and a readable error',()=>{
  const {data}=dataset(),ok=textOf(buildStatus({data,state:'ready'})),failed=textOf(buildStatus({data:null,state:'error',error:'La base de estadísticas no está disponible en este momento.'}));
  expect(ok).toContain('MODO DEMOSTRACIÓN');expect(ok).toContain('Correcta');expect(ok).toContain('no aprobada para producción');expect(failed).toContain('no está disponible');expect(failed).toContain('Error');
 });
});

function fakeFetch(routes){const log=[];const f=async(url,options)=>{log.push({url,options});const r=routes(url,options);if(r instanceof Error)throw r;return {ok:r.status>=200&&r.status<300,status:r.status,json:async()=>r.body};};f.log=log;return f;}
const memoryStorage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),m};};

describe('B84 API client',()=>{
 it('login stores the token, sends it as a Bearer header and never as URL or body; logout clears it',async()=>{
  const storage=memoryStorage(),f=fakeFetch((url,o)=>url.endsWith('/session')?{status:200,body:{accessToken:'tok.en.value',expiresIn:900}}:url.endsWith('/logout')?{status:200,body:{}}:{status:200,body:{data:{},mode:{demo:true}}});
  const api=createApi({fetchImpl:f,storage});expect(api.authenticated).toBe(false);
  await api.login(' acc ',' secret ');expect(api.authenticated).toBe(true);expect(storage.m.size).toBe(1);
  expect(JSON.parse(f.log[0].options.body)).toEqual({schemaVersion:1,technicalAccountId:'acc',credential:'secret'});expect(f.log[0].options.headers.Authorization).toBeUndefined();
  await api.loadAll(30);for(const call of f.log.slice(1)){expect(call.options.headers.Authorization).toBe('Bearer tok.en.value');expect(call.url).not.toContain('tok.en');expect(call.options.credentials).toBe('omit');}
  await api.logout();expect(api.authenticated).toBe(false);expect(storage.m.size).toBe(0);
 });
 it('an expired session (401) clears the token and reports "expired"',async()=>{
  const storage=memoryStorage();storage.setItem('b84.admin.session','old');const api=createApi({fetchImpl:fakeFetch(()=>({status:401,body:{}})),storage});
  expect(api.authenticated).toBe(true);await expect(api.loadAll()).rejects.toMatchObject({kind:'expired'});expect(api.authenticated).toBe(false);expect(storage.m.size).toBe(0);
 });
 it('maps network failure, 403, 429 and 503 to readable messages',async()=>{
  const cases=[[new Error('down'),'network','No se pudo conectar'],[{status:403,body:{}},'forbidden','permiso'],[{status:429,body:{}},'rate','Demasiados'],[{status:503,body:{}},'unavailable','no está disponible']];
  for(const [response,kind,text] of cases){
   const storage=memoryStorage();storage.setItem('b84.admin.session','t');const api=createApi({fetchImpl:fakeFetch(()=>response),storage});
   const error=await api.loadAll().catch(e=>e);expect(error).toBeInstanceOf(DashboardError);expect(error.kind).toBe(kind);expect(error.message).toContain(text);
  }
 });
 it('wrong login credentials say so without revealing which part failed',async()=>{
  const api=createApi({fetchImpl:fakeFetch(()=>({status:401,body:{}})),storage:memoryStorage()});
  await expect(api.login('a','b')).rejects.toMatchObject({kind:'credentials',message:'Credenciales no válidas.'});expect(api.authenticated).toBe(false);
 });
 it('works when browser storage is unavailable',async()=>{
  const broken={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
  const api=createApi({fetchImpl:fakeFetch(()=>({status:200,body:{accessToken:'t'}})),storage:broken});await api.login('a','b');expect(api.authenticated).toBe(true);
 });
 it('loadAll asks for the five views plus status in parallel with a bounded window',async()=>{
  const f=fakeFetch(()=>({status:200,body:{data:{},mode:{}}})),storage=memoryStorage();storage.setItem('b84.admin.session','t');await createApi({fetchImpl:f,storage}).loadAll(14);
  expect(f.log.map(c=>c.url).sort()).toEqual(['/api/v1/admin/statistics/biomes','/api/v1/admin/statistics/decisions','/api/v1/admin/statistics/endings','/api/v1/admin/statistics/overview','/api/v1/admin/statistics/status','/api/v1/admin/statistics/timeseries?days=14']);
 });
});
