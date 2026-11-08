import {biomes,WINDOW_MS,FUTURE_MS} from './contract.js';
export const eventTypes=Object.freeze(['installation_registered','session_started','session_ended','game_started','game_completed','biome_entered','biome_completed','environmental_decision','playtime_interval']);
export function projectStatistics(value){
 const {event:e,data:d,at}=value;
 if(!eventTypes.includes(e?.Type)||!Number.isFinite(at))throw Error('Validated statistics required');
 const date=new Date(at).toISOString().slice(0,10),periods=['all','day:'+date,'month:'+date.slice(0,7)],increments=[];
 const add=(period,key,amount=1)=>{if(!Number.isSafeInteger(amount)||amount<=0)throw Error('Invalid contribution');increments.push(Object.freeze({period,key,amount}));};
 for(const period of periods){
  add(period,'events');add(period,'type:'+e.Type);
  if(e.Type==='installation_registered')add(period,'installations_registered');
  if(e.Type==='session_started')add(period,'sessions_started');
  if(e.Type==='session_ended')add(period,d.status==='closed'?'sessions_closed':'sessions_interrupted');
  if(e.Type==='game_started')add(period,'games_started');
  if(e.Type==='game_completed'){add(period,'games_completed');add(period,'ending:'+d.ending);}
  if(e.Type==='biome_entered')add(period,'visits:'+e.BiomeId);
  if(e.Type==='biome_completed')add(period,'completions:'+e.BiomeId);
  if(e.Type==='environmental_decision'){add(period,'decision:'+e.BiomeId+':'+d.option);add(period,'environment:'+e.BiomeId+':'+d.state);}
  if(e.Type==='playtime_interval'){if(!biomes.includes(e.BiomeId)||e.DurationMs!==d.endMs-d.startMs||e.DurationMs>60000)throw Error('Invalid interval');add(period,'effective_ms',e.DurationMs);add(period,'time:'+e.BiomeId,e.DurationMs);}
 }
 const distinct=periods.filter(p=>p!=='all').map(period=>Object.freeze({period,expires:(period.startsWith('day:')?Date.parse(date+'T00:00:00.000Z')+86400000:Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7)),1))+WINDOW_MS+FUTURE_MS}));
 return Object.freeze({increments:Object.freeze(increments),distinct:Object.freeze(distinct)});
}
export function assertAggregateInvariants(counts){
 const periods=new Set();
 const metrics=new Set(['events','active_installations','installations_registered','sessions_started','sessions_closed','sessions_interrupted','games_started','games_completed','effective_ms',...eventTypes.map(t=>'type:'+t),...['good','medium','bad'].map(x=>'ending:'+x),...biomes.flatMap(b=>['visits:'+b,'completions:'+b,'time:'+b,'decision:'+b+':approve','decision:'+b+':reject','environment:'+b+':healthy','environment:'+b+':degraded'])]);
 for(const [key,n] of Object.entries(counts)){const parts=key.split('|');if(parts.length!==2||!metrics.has(parts[1])||! /^(all|day:\d{4}-\d{2}-\d{2}|month:\d{4}-\d{2})$/.test(parts[0])||!Number.isSafeInteger(n)||n<0)throw Error('Invalid aggregate');periods.add(parts[0]);}
 for(const p of periods){
  const n=key=>counts[p+'|'+key]??0;
  if(n('effective_ms')!==biomes.reduce((sum,b)=>sum+n('time:'+b),0)||n('games_completed')!==['good','medium','bad'].reduce((sum,e)=>sum+n('ending:'+e),0)||n('events')!==eventTypes.reduce((sum,t)=>sum+n('type:'+t),0))throw Error('Aggregate invariant failed');
  for(const b of biomes)if(n('decision:'+b+':reject')!==n('environment:'+b+':healthy')||n('decision:'+b+':approve')!==n('environment:'+b+':degraded'))throw Error('Environmental invariant failed');
  if(n('sessions_closed')+n('sessions_interrupted')>n('type:session_ended')||n('sessions_started')>n('type:session_started'))throw Error('Session coverage invariant failed');
 }
 // The reference store retains its complete daily history. Distinct installations are non-additive.
 for(const key of metrics)if(key!=='active_installations'){
  const daily=[...periods].filter(p=>p.startsWith('day:'));
  if((counts['all|'+key]??0)!==daily.reduce((sum,p)=>sum+(counts[p+'|'+key]??0),0))throw Error('Daily coverage invariant failed');
  for(const month of [...periods].filter(p=>p.startsWith('month:')))if((counts[month+'|'+key]??0)!==daily.filter(p=>p.slice(4,11)===month.slice(6)).reduce((sum,p)=>sum+(counts[p+'|'+key]??0),0))throw Error('Monthly coverage invariant failed');
 }
 return true;
}
