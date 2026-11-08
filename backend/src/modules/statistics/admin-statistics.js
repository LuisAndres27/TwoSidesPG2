// B84 — read-only administrative views over the aggregate counters. It never receives or returns a document, an identifier,
// an EventId, an installation or a game: only totals derived from `repository.aggregates()`.
import express from 'express';
import {biomes} from './contract.js';
import {ApiError,unavailable} from '../../utils/errors.js';
import {rejectQuery,requireEmptyRequest} from '../../middleware/security.js';

export const ENDINGS=Object.freeze(['good','medium','bad']);
const DAY=86400000,MAX_DAYS=90,DEFAULT_DAYS=30;
const ratio=(a,b)=>b>0?a/b:null;
const reader=counts=>(period,key)=>counts[period+'|'+key]??0;

export function overviewView(counts){
 const n=reader(counts),p='all',started=n(p,'games_started'),completed=n(p,'games_completed'),installations=n(p,'installations_registered'),effective=n(p,'effective_ms');
 return {installations,gamesStarted:started,gamesCompleted:completed,completionRate:ratio(completed,started),effectiveMs:effective,
  sessionsStarted:n(p,'sessions_started'),sessionsClosed:n(p,'sessions_closed'),sessionsInterrupted:n(p,'sessions_interrupted'),events:n(p,'events'),
  averages:{effectiveMsPerGameStarted:ratio(effective,started),effectiveMsPerInstallation:ratio(effective,installations),
   gamesStartedPerInstallation:ratio(started,installations),sessionsPerInstallation:ratio(n(p,'sessions_started'),installations)}};
}
export function biomesView(counts){
 const n=reader(counts);
 return {biomes:biomes.map(id=>({id,visits:n('all','visits:'+id),completions:n('all','completions:'+id),effectiveMs:n('all','time:'+id),
  decisions:{approve:n('all','decision:'+id+':approve'),reject:n('all','decision:'+id+':reject')},
  environment:{healthy:n('all','environment:'+id+':healthy'),degraded:n('all','environment:'+id+':degraded')}}))};
}
export function decisionsView(counts){
 const rows=biomesView(counts).biomes,sum=pick=>rows.reduce((total,row)=>total+pick(row),0);
 return {totals:{approve:sum(r=>r.decisions.approve),reject:sum(r=>r.decisions.reject),healthy:sum(r=>r.environment.healthy),degraded:sum(r=>r.environment.degraded)},
  byBiome:rows.map(r=>({id:r.id,approve:r.decisions.approve,reject:r.decisions.reject,healthy:r.environment.healthy,degraded:r.environment.degraded}))};
}
export function endingsView(counts){
 const n=reader(counts),values=Object.fromEntries(ENDINGS.map(e=>[e,n('all','ending:'+e)])),total=n('all','games_completed');
 return {...values,total,shares:Object.fromEntries(ENDINGS.map(e=>[e,ratio(values[e],total)]))};
}
export const utcDay=ms=>new Date(ms).toISOString().slice(0,10);
export function timeseriesView(counts,{days=DEFAULT_DAYS,nowMs}={}){
 if(!Number.isInteger(days)||days<1||days>MAX_DAYS||!Number.isFinite(nowMs))throw Error('Timeseries query rejected');
 const n=reader(counts),end=Date.parse(utcDay(nowMs)+'T00:00:00.000Z'),points=[];
 for(let i=days-1;i>=0;i--){const date=utcDay(end-i*DAY),p='day:'+date;
  points.push({date,gamesStarted:n(p,'games_started'),gamesCompleted:n(p,'games_completed'),effectiveMs:n(p,'effective_ms'),sessionsStarted:n(p,'sessions_started'),installationsRegistered:n(p,'installations_registered')});}
 const total=key=>points.reduce((sum,x)=>sum+x[key],0);
 return {days,from:points[0].date,to:points[points.length-1].date,points,totals:{gamesStarted:total('gamesStarted'),gamesCompleted:total('gamesCompleted'),effectiveMs:total('effectiveMs'),sessionsStarted:total('sessionsStarted')}};
}

// `guards` run before every route (authentication + admin authorization). `mode` is shown in every response.
export function createAdminStatisticsRouter({repository,guards,now=Date.now,mode}){
 if(typeof repository?.aggregates!=='function'||!Array.isArray(guards)||guards.length===0||mode?.demo!==true)throw Error('Administrative statistics require guards and an explicit demo mode');
 const router=express.Router(),wrap=build=>async(request,response,next)=>{
  let counts;try{counts=await repository.aggregates();}catch{return next(unavailable());}
  try{response.json({schemaVersion:1,generatedAt:new Date(now()).toISOString(),mode,data:build(counts,request)});}catch{next(new ApiError(500,'internal_error'));}
 };
 router.get('/overview',...guards,rejectQuery,requireEmptyRequest,wrap(overviewView));
 router.get('/biomes',...guards,rejectQuery,requireEmptyRequest,wrap(biomesView));
 router.get('/decisions',...guards,rejectQuery,requireEmptyRequest,wrap(decisionsView));
 router.get('/endings',...guards,rejectQuery,requireEmptyRequest,wrap(endingsView));
 // Only one optional numeric window (?days=N). No identifier, installation, game or free-form filter exists.
 router.get('/timeseries',...guards,requireEmptyRequest,(request,response,next)=>{
  const keys=Object.keys(request.query);
  if(keys.some(k=>k!=='days')||(keys.length&&!/^\d{1,2}$/.test(String(request.query.days))))return next(new ApiError(400,'invalid_request'));
  const days=keys.length?Number(request.query.days):DEFAULT_DAYS;if(days<1||days>MAX_DAYS)return next(new ApiError(400,'invalid_request'));
  request.statisticsDays=days;next();
 },wrap((counts,request)=>timeseriesView(counts,{days:request.statisticsDays,nowMs:now()})));
 router.get('/status',...guards,rejectQuery,requireEmptyRequest,async(_request,response,next)=>{
  try{await repository.aggregates();}catch{return next(unavailable());}
  response.json({schemaVersion:1,generatedAt:new Date(now()).toISOString(),mode,data:{query:'ok',storage:'mongodb-local-replica-set',retention:'experimental-not-approved-for-production'}});
 });
 return router;
}
