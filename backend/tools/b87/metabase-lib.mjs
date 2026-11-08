// B87 — provisioning of a NEW Metabase instance (AWS, or a disposable local one for tests) that reads the Atlas ANALYTICAL database with the reader identity.
// Pure library: nothing runs on import. It reuses the 15 question definitions of B85 (tools/b85/questions.mjs, unmodified) and never imports anything from tests/
// (so it cannot load the B80 test-isolation guard). No secret is ever returned, logged or written: callers get ids and booleans only.
import {questions as b85Questions,settings} from '../b85/questions.mjs';

export const OWNER_TITLE='Datos de prueba del propietario';
export const ATLAS_ANALYTICS_DATABASE='twosides_statistics_analytics_demo',COUNTERS_COLLECTION='stats_v1_counters',READER_USER='twosides_statistics_reader_v1';
export const CONNECTION_NAME='Atlas analítico — Two Sides (solo lectura)';
export const TEST_MONGO_HOST='twosides-b87-test-mongo';   // the ONLY non-Atlas host the provisioner accepts, and only in the explicit local-test mode
const ATLAS_HOST=/^[a-z0-9][a-z0-9-]{0,62}\.[a-z0-9]{3,12}\.mongodb\.net$/;
const LOOPBACK=new Set(['127.0.0.1','localhost','[::1]']);

export class ProvisionError extends Error{constructor(code,detail){super('Provisioning failed: '+code);this.name='ProvisionError';this.code=code;this.detail=detail;}}

// ---- policy -------------------------------------------------------------------------------------------------------------------------------------------
// Credentials (admin and reader) travel in these requests: plain HTTP is accepted only on loopback (tests, or an SSH/SSM tunnel); anything else needs HTTPS.
export function validateMetabaseUrl(value){
 let url;try{url=new URL(value);}catch{throw new ProvisionError('metabase_url_rejected');}
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new ProvisionError('metabase_url_rejected');
 if(url.protocol==='https:')return url.origin;
 if(url.protocol==='http:'&&LOOPBACK.has(url.hostname))return url.origin;
 throw new ProvisionError('metabase_url_needs_https');
}
// Userinfo must be percent-encoded, including the characters encodeURIComponent leaves alone.
const encodeUserinfo=text=>encodeURIComponent(text).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
const SAFE_PASSWORD=/^[\x21-\x7e]{8,128}$/;
// The Metabase MongoDB driver only honours authMechanism in a connection string that already carries the credentials ("username can not be null" otherwise).
// Verified on Metabase v0.65.2: with the mechanism in the URI SCRAM-SHA-256 is refused for a SHA-1-only user and SCRAM-SHA-1 works.
export function atlasConnectionDetails({host,password}){
 if(!ATLAS_HOST.test(host??''))throw new ProvisionError('atlas_host_rejected');
 if(typeof password!=='string'||!SAFE_PASSWORD.test(password))throw new ProvisionError('reader_password_rejected');
 return {'use-conn-uri':true,'conn-uri':`mongodb+srv://${encodeUserinfo(READER_USER)}:${encodeUserinfo(password)}@${host}/${ATLAS_ANALYTICS_DATABASE}?authSource=admin&tls=true&authMechanism=SCRAM-SHA-1`};
}
export function localTestConnectionDetails({host,password}){
 if(host!==TEST_MONGO_HOST)throw new ProvisionError('test_host_rejected');
 if(typeof password!=='string'||!SAFE_PASSWORD.test(password))throw new ProvisionError('reader_password_rejected');
 return {'use-conn-uri':true,'conn-uri':`mongodb://${encodeUserinfo(READER_USER)}:${encodeUserinfo(password)}@${host}:27017/${ATLAS_ANALYTICS_DATABASE}?authSource=admin&authMechanism=SCRAM-SHA-1`};
}

// ---- titles and questions ------------------------------------------------------------------------------------------------------------------------------
const rename=name=>name.replace(/Instalaciones sintéticas/,'Instalaciones registradas').replace(/ — demo/g,'').replace(/ sintéticas?/gi,'');
export function ownerQuestions(){
 const result=b85Questions.map(q=>({...q,name:rename(q.name)}));
 if(result.length!==15||result.some(q=>/sint[eé]tic|demo|prueba/i.test(q.name)))throw new ProvisionError('question_titles_rejected');
 return result;
}
export const SECTIONS=Object.freeze({A:'A · Resumen general',B:'B · Tiempo de juego',C:'C · Biomas',D:'D · Decisiones ambientales',E:'E · Finales',F:'F · Tendencias UTC',G:'G · Estado y límites'});
export function dashboardLayout(cards){
 let id=-1,row=0;const dashcards=[];
 const text=(content,height=2)=>{dashcards.push({id:id--,card_id:null,row,col:0,size_x:24,size_y:height,series:[],parameter_mappings:[],visualization_settings:{virtual_card:{name:null,display:'text',visualization_settings:{},dataset_query:{},archived:false},text:content}});row+=height;};
 text('# '+OWNER_TITLE+'\nEstadísticas agregadas generadas por el propietario con un ejecutable y un perfil de prueba nuevos. Fuente: MongoDB Atlas (base analítica, solo lectura). No hay jugadores externos.',3);
 for(const [section,title] of Object.entries(SECTIONS)){
  text('## '+title);
  let col=0,lineHeight=0;
  for(const c of cards.filter(x=>x.section===section)){const scalar=c.display==='scalar',w=scalar?8:12,h=scalar?4:7;if(col+w>24){row+=lineHeight;col=0;lineHeight=0;}dashcards.push({id:id--,card_id:c.id,row,col,size_x:w,size_y:h,series:[],parameter_mappings:[],visualization_settings:{}});col+=w;lineHeight=Math.max(lineHeight,h);}
  row+=lineHeight;
  if(section==='A')text('Porcentaje = completadas / iniciadas en este conjunto de datos de prueba. No es una tasa de cohorte de producción.',2);
  if(section==='B')text('Tiempo efectivo: intervalos activos capturados, sin pausas. El promedio por sesión incluye sesiones interrumpidas; no es la duración de una sesión completada.',2);
  if(section==='G')text('**Datos agregados del propietario, copiados a la base analítica mediante «publish» manual: el panel no se actualiza solo.** Sin PlayerData, partidas individuales, tokens, recibos, deduplicación ni cuotas. Retención de producción y B00 pendientes.',3);
 }
 return dashcards;
}

// ---- Metabase HTTP client ------------------------------------------------------------------------------------------------------------------------------
export class MetabaseClient{
 constructor({baseUrl,fetchImpl=globalThis.fetch,timeoutMs=90000}){this.baseUrl=validateMetabaseUrl(baseUrl);this.fetch=fetchImpl;this.timeoutMs=timeoutMs;this.session=undefined;}
 async request(path,{method='GET',body}={}){
  let response;
  try{response=await this.fetch(this.baseUrl+'/api'+path,{method,redirect:'error',signal:AbortSignal.timeout(this.timeoutMs),headers:{'Content-Type':'application/json',...(this.session?{'X-Metabase-Session':this.session}:{})},body:body===undefined?undefined:JSON.stringify(body)});}
  catch{throw new ProvisionError('metabase_unreachable');}
  const text=await response.text();let data;try{data=text?JSON.parse(text):null;}catch{data=text;}
  if(!response.ok)throw new ProvisionError('metabase_http_'+response.status,typeof data==='object'&&data?.message?String(data.message):typeof data==='string'?data:undefined);
  return data;
 }
}

// ---- provisioning -------------------------------------------------------------------------------------------------------------------------------------
async function authenticate(client,{email,password}){
 const properties=await client.request('/session/properties');
 if(properties['setup-token']){
  const result=await client.request('/setup',{method:'POST',body:{token:properties['setup-token'],prefs:{site_name:'Two Sides — '+OWNER_TITLE,site_locale:'es',allow_tracking:false},user:{first_name:'Two Sides',last_name:'Propietario',email,password}}});
  client.session=result.id;return 'setup';
 }
 const result=await client.request('/session',{method:'POST',body:{username:email,password}});client.session=result.id;return 'login';
}
const SETTINGS_OFF=['enable-public-sharing','enable-embedding-static','enable-embedding-interactive','anon-tracking-enabled','check-for-updates'];
async function applySettings(client){
 for(const key of SETTINGS_OFF){try{await client.request('/setting/'+key,{method:'PUT',body:{value:false}});}catch(e){if(key==='enable-embedding-interactive'||key==='check-for-updates')continue;throw e;}}   // not present in every edition
 // Query caching. On Metabase v0.65.2 `enable-query-caching` is READ-ONLY (it reports false/empty and refuses to be written), so it is only written when it reports true.
 // The instance-wide strategy is then set to "no cache" through the cache API and checked: neither a stale snapshot nor a cached answer can survive a `publish`.
 if((await client.request('/setting/enable-query-caching'))===true){   // false or empty (204) = not enabled
  await client.request('/setting/enable-query-caching',{method:'PUT',body:{value:false}});
  if((await client.request('/setting/enable-query-caching'))===true)throw new ProvisionError('query_caching_not_disabled');
 }
 await client.request('/cache',{method:'PUT',body:{model:'root',model_id:0,strategy:{type:'nocache'}}});
 const configured=(await client.request('/cache'))?.data??[];
 if(configured.some(entry=>entry.model==='root'&&entry.strategy?.type!=='nocache'))throw new ProvisionError('query_caching_not_disabled');
}
export async function provision({client,admin,connection,viewer}){
 if(!connection||typeof connection!=='object')throw new ProvisionError('connection_missing');
 const mode=await authenticate(client,admin);
 await applySettings(client);
 const existing=await client.request('/database'),databases=Array.isArray(existing)?existing:existing?.data??[];
 if(databases.some(d=>d.name===CONNECTION_NAME))throw new ProvisionError('already_provisioned');
 // A new Metabase ships with a Sample Database that every account could query: remove it so the Atlas connection is the only data source.
 for(const sample of databases.filter(d=>d.is_sample===true))await client.request('/database/'+sample.id,{method:'DELETE'});
 const collections=await client.request('/collection');
 if(collections.some(c=>c.name===OWNER_TITLE))throw new ProvisionError('already_provisioned');
 const database=await client.request('/database',{method:'POST',body:{engine:'mongo',name:CONNECTION_NAME,is_full_sync:false,is_on_demand:false,auto_run_queries:true,cache_ttl:null,details:connection}});
 await client.request('/database/'+database.id+'/sync_schema',{method:'POST'}).catch(()=>{});
 const collection=await client.request('/collection',{method:'POST',body:{name:OWNER_TITLE,description:'Estadísticas agregadas del propietario (MongoDB Atlas, solo lectura).'}});
 const dashboard=await client.request('/dashboard',{method:'POST',body:{name:OWNER_TITLE,description:OWNER_TITLE+' · agregados · Atlas (solo lectura) · actualización manual',collection_id:collection.id,cache_ttl:null}});
 const cards=[];
 for(const q of ownerQuestions()){
  const card=await client.request('/card',{method:'POST',body:{name:q.name,description:'Agregado de estadísticas (sin datos individuales) · '+q.key,collection_id:collection.id,display:q.display,cache_ttl:null,visualization_settings:settings(q),dataset_query:{database:database.id,type:'native',native:{collection:COUNTERS_COLLECTION,query:JSON.stringify(q.query),'template-tags':{}}}}});
  cards.push({key:q.key,id:card.id,name:q.name,display:q.display,section:q.section});
 }
 const laid=await client.request('/dashboard/'+dashboard.id,{method:'PUT',body:{dashcards:dashboardLayout(cards)}});
 const run=[];
 for(const c of cards){const result=await client.request('/card/'+c.id+'/query',{method:'POST'});run.push({key:c.key,status:result.status,rows:result.data?.rows?.length??0,error:result.error?true:false});}
 const summary={mode,databaseId:database.id,collectionId:collection.id,dashboardId:dashboard.id,cards:cards.map(({key,id})=>({key,id})),dashcards:laid.dashcards?.length??0,cardsRun:run.length,cardsCompleted:run.filter(r=>r.status==='completed'&&!r.error).length,queryCaching:false,publicSharing:false};
 if(viewer)summary.viewer=await createViewer(client,{viewer,databaseId:database.id,collectionId:collection.id});
 return {summary,cards,run};
}

// ---- evaluator account (variant B): no admin rights, read-only access to ONE collection --------------------------------------------------------------
export async function createViewer(client,{viewer,databaseId,collectionId}){
 if(!viewer?.email||typeof viewer.password!=='string'||viewer.password.length<15)throw new ProvisionError('viewer_rejected');
 const group=await client.request('/permissions/group',{method:'POST',body:{name:'Evaluadores'}});
 const user=await client.request('/user',{method:'POST',body:{first_name:'Evaluador',last_name:'Solo lectura',email:viewer.email,password:viewer.password}});
 await client.request('/permissions/membership',{method:'POST',body:{group_id:group.id,user_id:user.id}});
 const groups=await client.request('/permissions/group'),everyone=groups.find(g=>g.name==='All Users');
 const graph=await client.request('/collection/graph');
 for(const gid of [String(everyone.id),String(group.id)]){graph.groups[gid]??={};graph.groups[gid].root='none';graph.groups[gid][String(collectionId)]=gid===String(group.id)?'read':'none';}
 await client.request('/collection/graph',{method:'PUT',body:graph});
 const data=await client.request('/permissions/graph');
 for(const gid of [String(everyone.id),String(group.id)]){data.groups[gid]??={};data.groups[gid][String(databaseId)]={'view-data':'unrestricted','create-queries':'no','download-results':{schemas:'none'}};}
 await client.request('/permissions/graph',{method:'PUT',body:data});
 return {userId:user.id,groupId:group.id,isAdmin:false,collectionAccess:'read',databaseAccess:'saved-questions-only'};
}

// Sanitised description of a failure for the command line: every secret value is replaced by a marker, then URIs, Atlas names, IPs and paths; bounded length.
// The text is dropped altogether if any secret still shows up when case is ignored.
export function sanitizeDetail(text,secrets=[]){
 let s=String(text??'');
 const values=secrets.filter(v=>typeof v==='string'&&v.length>0).sort((a,b)=>b.length-a.length);
 for(const v of values)s=s.split(v).join('<secret>');
 s=s.replace(/mongodb(\+srv)?:\/\/\S*/gi,'<uri>').replace(/[\w.-]+\.mongodb\.net/gi,'<host>').replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g,'<ip>').replace(/\S*[\\/]\S*/g,'<path>').replace(/\s+/g,' ').trim().slice(0,240);
 return values.some(v=>s.toLowerCase().includes(v.toLowerCase()))?undefined:s;
}
export function describeProvisionError(error,secrets=[]){
 if(error instanceof ProvisionError)return {code:error.code,detail:error.detail?sanitizeDetail(error.detail,secrets):undefined};
 return {code:'unexpected_error'};
}
