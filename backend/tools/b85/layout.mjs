import {api,session} from './runtime.mjs';
import {readFile,writeFile} from 'node:fs/promises';
const objects=JSON.parse(await readFile('.work/b85/metabase-objects.json','utf8')),sid=await session();
const sections={A:'A · Resumen general',B:'B · Tiempo de juego',C:'C · Biomas',D:'D · Decisiones ambientales',E:'E · Finales',F:'F · Tendencias UTC',G:'G · Estado de demostración'};
let id=-1,row=0;const dashcards=[];
function text(content,height=2){dashcards.push({id:id--,card_id:null,row,col:0,size_x:24,size_y:height,series:[],parameter_mappings:[],visualization_settings:{virtual_card:{name:null,display:'text',visualization_settings:{},dataset_query:{},archived:false},text:content}});row+=height;}
text('# DEMOSTRACIÓN — DATOS SINTÉTICOS\nMongoDB local · No son estadísticas reales de usuarios · Atlas pendiente',3);
for(const [section,title] of Object.entries(sections)){
 text('## '+title);
 const cards=objects.cards.filter(c=>c.section===section);let col=0,lineHeight=0;
 for(const c of cards){const scalar=c.display==='scalar',w=scalar?8:12,h=scalar?4:7;if(col+w>24){row+=lineHeight;col=0;lineHeight=0;}dashcards.push({id:id--,card_id:c.id,row,col,size_x:w,size_y:h,series:[],parameter_mappings:[],visualization_settings:{}});col+=w;lineHeight=Math.max(lineHeight,h);}row+=lineHeight;
 if(section==='A')text('Período demo completo: 21 oct–3 nov 2026 (UTC). Porcentaje = completadas / iniciadas en este conjunto sintético. No es una tasa de cohorte de producción.',2);
 if(section==='B')text('Tiempo efectivo: intervalos activos capturados, sin pausas. Promedio = minutos capturados / 84 sesiones iniciadas; incluye sesiones interrumpidas. No significa duración de una sesión completada.',2);
 if(section==='G')text('**Datos ficticios y agregados de B84, copiados mediante snapshot de solo lectura.** Sin PlayerData, partidas individuales, tokens, recibos, deduplicación ni cuotas. 293 duplicados no vuelven a contabilizarse. Actualización de esta demostración: snapshot fijo; B00 y retención de producción pendientes.',3);
}
const result=await api('/dashboard/'+objects.dashboardId,{method:'PUT',session:sid,body:{dashcards}});
await writeFile('.work/b85/layout-result.json',JSON.stringify({dashboardId:result.id,cards:result.dashcards?.length},null,2));
console.log(JSON.stringify({layout:true,cards:result.dashcards?.length}));
