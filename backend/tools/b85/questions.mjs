// Native Metabase MongoDB questions over existing aggregate counters, not raw events.
export const biomes=[['ocean','Océano'],['jungle','Selva'],['desert','Desierto'],['forest','Bosque'],['tundra','Tundra']];
const value=k=>({$ifNull:['$values.'+k,0]});
const scalar=(key,name,expression)=>({key,name,display:'scalar',section:'A',query:[{$match:{_id:'all'}},{$project:{_id:0,valor:expression}}]});
const biomeRows=fields=>[{$match:{_id:'all'}},{$project:{_id:0,rows:biomes.map(([id,label])=>({bioma:{$literal:label},...Object.fromEntries(Object.entries(fields).map(([name,field])=>[name,field(id)]))}))}},{$unwind:'$rows'},{$replaceRoot:{newRoot:'$rows'}}];
const daily=[{$match:{_id:{$regex:'^day:'}}},{$project:{_id:0,fecha:{$dateFromString:{dateString:{$substrBytes:['$_id',4,10]},timezone:'UTC'}},iniciadas:value('games_started'),completadas:value('games_completed'),minutos:{$divide:[value('effective_ms'),60000]}}},{$sort:{fecha:1}}];
export const questions=[
 scalar('installations','Instalaciones sintéticas',value('installations_registered')),
 scalar('started','Partidas iniciadas',value('games_started')),
 scalar('completed','Partidas completadas',value('games_completed')),
 scalar('completion','Completadas / iniciadas — demo (%)',{$cond:[{$gt:[value('games_started'),0]},{$multiply:[100,{$divide:[value('games_completed'),value('games_started')]}]},null]}),
 scalar('sessions','Sesiones iniciadas',value('sessions_started')),
 scalar('hours','Tiempo efectivo total (horas)',{$divide:[value('effective_ms'),3600000]}),
 {...scalar('minutes_session','Minutos capturados / sesión iniciada — demo',{$cond:[{$gt:[value('sessions_started'),0]},{$divide:[value('effective_ms'),{$multiply:[60000,value('sessions_started')]}]},null]}),section:'B'},
 {...scalar('events','Eventos únicos aceptados',value('events')),section:'B'},
 {key:'biome_time',section:'B',name:'Tiempo efectivo por bioma (minutos)',display:'bar',query:biomeRows({minutos:id=>({$divide:[value('time:'+id),60000]})})},
 {key:'biomes',section:'C',name:'Visitas y finalizaciones por bioma',display:'bar',query:biomeRows({visitas:id=>value('visits:'+id),finalizaciones:id=>value('completions:'+id)})},
 {key:'decisions',section:'D',name:'Decisiones ambientales por bioma',display:'bar',query:biomeRows({approve:id=>value('decision:'+id+':approve'),reject:id=>value('decision:'+id+':reject')})},
 {key:'environment',section:'D',name:'Ambiente confirmado por bioma',display:'bar',query:biomeRows({healthy:id=>value('environment:'+id+':healthy'),degraded:id=>value('environment:'+id+':degraded')})},
 {key:'endings',section:'E',name:'Distribución de finales',display:'pie',query:[{$match:{_id:'all'}},{$project:{_id:0,rows:['good','medium','bad'].map(id=>({final:{$literal:id},partidas:value('ending:'+id)}))}},{$unwind:'$rows'},{$replaceRoot:{newRoot:'$rows'}}]},
 {key:'daily_games',section:'F',name:'Partidas por día (UTC)',display:'line',query:[...daily,{$project:{fecha:1,iniciadas:1,completadas:1}}]},
 {key:'daily_time',section:'F',name:'Tiempo efectivo por día (minutos, UTC)',display:'line',query:[...daily,{$project:{fecha:1,minutos:1}}]}
];
export function settings(q){if(q.display==='scalar')return {'scalar.decimals':q.key==='completion'||q.key==='hours'||q.key==='minutes_session'?2:0};const cols=q.key==='endings'?['final','partidas']:q.key.startsWith('daily')?['fecha',...(q.key==='daily_games'?['iniciadas','completadas']:['minutos'])]:q.key==='biome_time'?['bioma','minutos']:q.key==='biomes'?['bioma','visitas','finalizaciones']:q.key==='decisions'?['bioma','approve','reject']:['bioma','healthy','degraded'];return q.display==='pie'?{'pie.dimension':cols[0],'pie.metric':cols[1],'pie.colors':['#509E2F','#F9D45C','#EF8C8C']}:{'graph.dimensions':[cols[0]],'graph.metrics':cols.slice(1),'graph.colors':['#509E2F','#88BF4D'],'graph.show_values':q.display==='bar','graph.y_axis.title_text':q.key.includes('time')?'Minutos':'Cantidad'};}
