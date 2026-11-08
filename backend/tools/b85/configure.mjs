import {api,privateData,session,names} from './runtime.mjs';
import {questions,settings} from './questions.mjs';
import {writeFile,access} from 'node:fs/promises';
let alreadyConfigured=false;try{await access('.work/b85/metabase-objects.json');alreadyConfigured=true;}catch{}if(alreadyConfigured)throw Error('B85_ALREADY_CONFIGURED_USE_EXISTING_DASHBOARD');
const c=await privateData();
const properties=await api('/session/properties');
let sid;
if(properties['setup-token']){
 const result=await api('/setup',{method:'POST',body:{token:properties['setup-token'],prefs:{site_name:'Two Sides — DEMOSTRACIÓN',site_locale:'es',allow_tracking:false},user:{first_name:'Two Sides',last_name:'Demo',email:c.metabaseEmail,password:c.metabasePassword}}});sid=result.id;
}else sid=await session();
for(const key of ['enable-public-sharing','enable-embedding-static','anon-tracking-enabled'])await api('/setting/'+key,{method:'PUT',session:sid,body:{value:false}});
// This driver applies connection-string options BEFORE injecting user/pass. Putting
// authMechanism in that credential-free intermediate URI fails with username=null.
// Server-side reader identity permits ONLY SCRAM-SHA-256; negotiation cannot use SHA-1.
const db=await api('/database',{method:'POST',session:sid,body:{engine:'mongo',name:'B85 — agregados sintéticos (solo lectura)',is_full_sync:true,auto_run_queries:true,details:{host:names.mongo,port:27017,dbname:names.db,user:c.readerUser,pass:c.readerPassword,authdb:names.db,ssl:false,'additional-options':'directConnection=true'}}});
const collection=await api('/collection',{method:'POST',session:sid,body:{name:'Two Sides',description:'Solo agregados sintéticos B84; MongoDB local. Atlas pendiente.'}});
const dashboard=await api('/dashboard',{method:'POST',session:sid,body:{name:'TWO SIDES — ESTADÍSTICAS GENERALES',description:'DEMOSTRACIÓN · Datos sintéticos · MongoDB local · Atlas pendiente',collection_id:collection.id}});
const cards=[];
for(const q of questions){const card=await api('/card',{method:'POST',session:sid,body:{name:q.name,description:'B85 / '+q.key+' — agregado sintético B84; sin datos individuales.',collection_id:collection.id,display:q.display,visualization_settings:settings(q),dataset_query:{database:db.id,type:'native',native:{collection:names.collection,query:JSON.stringify(q.query),'template-tags':{}}}}});cards.push({key:q.key,id:card.id,name:q.name,display:q.display,section:q.section});}
await writeFile('.work/b85/metabase-objects.json',JSON.stringify({databaseId:db.id,collectionId:collection.id,dashboardId:dashboard.id,cards},null,2));
console.log(JSON.stringify({configured:true,databaseId:db.id,dashboardId:dashboard.id,cards:cards.length}));
