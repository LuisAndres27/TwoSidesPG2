import {z} from 'zod';
import {createHash} from 'node:crypto';
import {parseStrict} from '../sync/canonical-envelope.js';

export const CONTRACT='statistics-only-v1', MAX_BATCH=5, MAX_BODY=32768, WINDOW_MS=90*86400000, FUTURE_MS=300000;
export const uuid=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
export const biomes=['ocean','jungle','desert','forest','tundra'];
export const decisionKeys={ocean:'ocean_waste_disposal',jungle:'jungle_transport_route',desert:'desert_cat_abandonment',forest:'forest_industrial_pesticides',tundra:'tundra_fossil_extraction'};
const types=['installation_registered','session_started','session_ended','game_started','game_completed','biome_entered','biome_completed','environmental_decision','playtime_interval'];
const event=z.object({EventId:uuid,SchemaVersion:z.literal(1),InstallationId:uuid,SessionId:uuid,Type:z.enum(types),
 // B77 has both gameplay UTC milliseconds and domain DateTimeOffset "O" (7 digits, +00:00).
 OccurredAtUtc:z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3}Z|\.\d{7}\+00:00)$/),GameId:z.string().regex(/^[0-9a-f]{32}$/).nullable(),
 BiomeId:z.enum(biomes).nullable(),DurationMs:z.number().int().min(0).max(60000).nullable(),Data:z.string().max(1024)}).strict();
const empty=z.object({}).strict();
const data={installation_registered:empty,game_started:empty,biome_entered:empty,
 game_completed:z.object({ending:z.enum(['good','medium','bad'])}).strict(),biome_completed:z.object({result:z.enum(['good','bad'])}).strict(),
 environmental_decision:z.object({decisionKey:z.enum(Object.values(decisionKeys)),option:z.enum(['approve','reject']),state:z.enum(['healthy','degraded'])}).strict(),
 session_started:z.object({status:z.literal('open')}).strict(),session_ended:z.object({status:z.enum(['closed','interrupted'])}).strict(),
 playtime_interval:z.object({state:z.enum(['ActiveHuman','ActiveAnimal']),startMs:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),endMs:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),excluded:z.literal(false),active:z.literal(true)}).strict()};
export const batchSchema=z.object({Contract:z.literal(CONTRACT),Events:z.array(z.object({EventJson:z.string().max(4096),PayloadHash:z.string().regex(/^[0-9a-f]{64}$/)}).strict()).min(1).max(MAX_BATCH)}).strict();
export const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
export function validateEvent(item,installation,now){
 let raw;try{raw=parseStrict(item.EventJson);}catch{return {error:'invalid_event'};}
 const id=uuid.safeParse(raw?.EventId);if(!id.success)return {error:'invalid_event'};
 const reject=code=>({id:id.data,error:code,hash:item.PayloadHash});
 if(hash(item.EventJson)!==item.PayloadHash)return reject('hash_mismatch');
 if(raw.SchemaVersion!==1)return reject('unsupported_version');
 const parsed=event.safeParse(raw);if(!parsed.success)return reject('invalid_event');const e=parsed.data;
 if(e.InstallationId!==installation)return {forbidden:true};
 let d;try{d=data[e.Type].parse(parseStrict(e.Data));}catch{return reject('invalid_event');}
 const at=Date.parse(e.OccurredAtUtc);
 const normalized=e.OccurredAtUtc.replace(/(\.\d{3})\d{4}\+00:00$/,'$1Z');
 if(!Number.isFinite(at)||new Date(at).toISOString()!==normalized||at>now+FUTURE_MS)return reject('invalid_time');
 if(at<now-WINDOW_MS)return reject('event_expired');
 const game=e.Type.startsWith('game_')||e.Type.startsWith('biome_')||e.Type==='environmental_decision'||e.Type==='playtime_interval';
 const biome=e.Type.startsWith('biome_')||e.Type==='environmental_decision'||e.Type==='playtime_interval';
 if(game!==(e.GameId!==null)||biome!==(e.BiomeId!==null))return reject('invalid_event');
 if(e.Type==='environmental_decision'&&(d.decisionKey!==decisionKeys[e.BiomeId]||d.state!==(d.option==='reject'?'healthy':'degraded')))return reject('invalid_event');
 if(e.Type==='playtime_interval'?(e.DurationMs===null||e.DurationMs<=0||d.endMs-d.startMs!==e.DurationMs):e.DurationMs!==null)return reject('invalid_event');
 return {id:e.EventId,hash:item.PayloadHash,event:e,data:d,at,canonical:item.EventJson};
}
