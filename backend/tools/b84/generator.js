// B84 — reproducible SYNTHETIC data for the demonstration. Fully deterministic (seeded PRNG, hash-derived identifiers) so running it
// twice produces byte-identical events: replays are recognised as duplicates by EventId and never double-count.
// It reads nothing from disk, never touches PlayerData / SQLite, and every identifier is derived from the public label below.
import {createHash} from 'node:crypto';
import {biomes,decisionKeys,hash} from '../../src/modules/statistics/contract.js';

export const DEMO_SEED='twosides-b84-synthetic-demo-v1';
const DAY=86400000;
const digest=text=>createHash('sha256').update(text,'utf8').digest();
export const uuidFor=(label,seed=DEMO_SEED)=>{const b=digest(seed+'|'+label).subarray(0,16);b[6]=(b[6]&0x0f)|0x40;b[8]=(b[8]&0x3f)|0x80;const h=b.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
const hex32=(label,seed)=>uuidFor(label,seed).replaceAll('-','');
function prng(label,seed=DEMO_SEED){let a=digest(seed+'|rng|'+label).readUInt32LE(0);return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

// Builds the ordered list of canonical events. `anchor` is a UTC date (YYYY-MM-DD); events fall on the `days` days BEFORE it,
// so none lies in the future of a real clock that is already on/after the anchor date.
export function generateDemoEvents({installations=30,days=14,anchor='2026-11-04',seed=DEMO_SEED}={}){
 if(typeof seed!=='string'||!/^[a-z0-9-]{8,80}$/.test(seed))throw Error('Invalid demo seed');
 const uuid=l=>uuidFor(l,seed),hex=l=>hex32(l,seed),rng=l=>prng(l,seed);
 if(!/^\d{4}-\d\d-\d\d$/.test(anchor)||!Number.isInteger(installations)||installations<1||installations>200||!Number.isInteger(days)||days<1||days>60)throw Error('Invalid demo parameters');
 const anchorMs=Date.parse(anchor+'T00:00:00.000Z'),events=[],installationIds=[];
 for(let i=0;i<installations;i++){
  const rnd=rng('installation:'+i),installationId=uuid('installation:'+i);installationIds.push(installationId);
  const firstDay=Math.floor(rnd()*days*0.8);let sequence=0;
  const emit=(sessionId,type,at,{gameId=null,biome=null,duration=null,data={}}={})=>{
   const event={EventId:uuid(`event:${i}:${sequence++}`),SchemaVersion:1,InstallationId:installationId,SessionId:sessionId,Type:type,OccurredAtUtc:new Date(at).toISOString(),GameId:gameId,BiomeId:biome,DurationMs:duration,Data:JSON.stringify(data)};
   const canonical=JSON.stringify(event);events.push({installationId,event,canonical,payloadHash:hash(canonical)});};
  let clock=anchorMs-(days-firstDay)*DAY+Math.floor(rnd()*6*3600000);
  emit(uuid(`session:${i}:reg`),'installation_registered',clock);
  const sessions=1+Math.floor(rnd()*5);
  for(let s=0;s<sessions;s++){
   clock+=Math.floor((0.3+rnd()*((days-firstDay)/sessions)*0.9)*DAY);if(clock>=anchorMs-3600000)break;
   const sessionId=uuid(`session:${i}:${s}`);emit(sessionId,'session_started',clock,{data:{status:'open'}});
   const games=rnd()<0.2?0:1+Math.floor(rnd()*2);let interrupted=false;
   for(let g=0;g<games&&clock<anchorMs-3600000;g++){
    const gameId=hex(`game:${i}:${s}:${g}`);clock+=1000+Math.floor(rnd()*60000);emit(sessionId,'game_started',clock,{gameId});
    const complete=rnd()<0.6,reach=complete?5:1+Math.floor(rnd()*5);let good=0,finished=true;
    for(let b=0;b<reach;b++){
     const biome=biomes[b];clock+=2000;emit(sessionId,'biome_entered',clock,{gameId,biome});
     let offset=0;const intervals=2+Math.floor(rnd()*3);
     for(let k=0;k<intervals;k++){const length=15000+Math.floor(rnd()*45001);clock+=length;emit(sessionId,'playtime_interval',clock,{gameId,biome,duration:length,data:{state:rnd()<0.5?'ActiveHuman':'ActiveAnimal',startMs:offset,endMs:offset+length,active:true,excluded:false}});offset+=length;}
     if(b===reach-1&&!complete){finished=false;break;}   // an incomplete game stops mid-biome, before the decision
     const option=rnd()<0.42?'approve':'reject';clock+=3000;
     emit(sessionId,'environmental_decision',clock,{gameId,biome,data:{decisionKey:decisionKeys[biome],option,state:option==='reject'?'healthy':'degraded'}});
     clock+=1000;emit(sessionId,'biome_completed',clock,{gameId,biome,data:{result:option==='reject'?'good':'bad'}});if(option==='reject')good++;
    }
    if(finished){clock+=2000;emit(sessionId,'game_completed',clock,{gameId,data:{ending:good>=4?'good':good>=2?'medium':'bad'}});}
    else{interrupted=true;break;}   // the player left without finishing: the session ends as interrupted
   }
   clock+=1000;emit(sessionId,'session_ended',clock,{data:{status:interrupted||rnd()>=0.85?'interrupted':'closed'}});
  }
 }
 events.sort((a,b)=>a.event.OccurredAtUtc<b.event.OccurredAtUtc?-1:a.event.OccurredAtUtc>b.event.OccurredAtUtc?1:0);
 return {events,installationIds,anchor,days};
}

// Independent oracle: counts the generated events directly (it does NOT import projection.js), so the totals it returns can be
// compared against what Express->MongoDB->API actually report. Counts each distinct EventId once, like the idempotent store.
export function expectedTotals(events){
 const seen=new Set(),t={installations:0,gamesStarted:0,gamesCompleted:0,effectiveMs:0,sessionsStarted:0,sessionsClosed:0,sessionsInterrupted:0,events:0,
  endings:{good:0,medium:0,bad:0},biomes:Object.fromEntries(biomes.map(b=>[b,{visits:0,completions:0,effectiveMs:0,approve:0,reject:0,healthy:0,degraded:0}])),days:{}};
 for(const {event:e} of events){
  if(seen.has(e.EventId))continue;seen.add(e.EventId);const d=JSON.parse(e.Data),day=e.OccurredAtUtc.slice(0,10),x=t.days[day]??={gamesStarted:0,gamesCompleted:0,effectiveMs:0,sessionsStarted:0,installationsRegistered:0};
  t.events++;
  switch(e.Type){
   case 'installation_registered':t.installations++;x.installationsRegistered++;break;
   case 'session_started':t.sessionsStarted++;x.sessionsStarted++;break;
   case 'session_ended':if(d.status==='closed')t.sessionsClosed++;else t.sessionsInterrupted++;break;
   case 'game_started':t.gamesStarted++;x.gamesStarted++;break;
   case 'game_completed':t.gamesCompleted++;x.gamesCompleted++;t.endings[d.ending]++;break;
   case 'biome_entered':t.biomes[e.BiomeId].visits++;break;
   case 'biome_completed':t.biomes[e.BiomeId].completions++;break;
   case 'environmental_decision':t.biomes[e.BiomeId][d.option]++;t.biomes[e.BiomeId][d.state]++;break;
   case 'playtime_interval':t.effectiveMs+=e.DurationMs;x.effectiveMs+=e.DurationMs;t.biomes[e.BiomeId].effectiveMs+=e.DurationMs;break;
  }
 }
 return t;
}
export const toEnvelope=items=>({Contract:'statistics-only-v1',Events:items.map(x=>({EventJson:x.canonical,PayloadHash:x.payloadHash}))});
