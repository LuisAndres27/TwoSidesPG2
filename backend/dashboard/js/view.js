// Page builders (pure: data -> virtual tree). Every string coming from the API is inserted as a text node.
import {h} from './vdom.js';
import {PALETTE,groupedBars,donut,lineChart,legend,dataTable} from './charts.js';
import {BIOME_LABELS,ENDING_LABELS,formatInt,formatPercent,formatDuration,formatDay,formatClock,minutes} from './format.js';

export const card=(label,value,hint)=>h('div',{className:'card'},h('div',{className:'card-label'},label),h('div',{className:'card-value'},value),hint?h('div',{className:'card-hint'},hint):null);
const section=(id,title,subtitle,...body)=>h('section',{id,className:'panel'},h('h2',{},title),subtitle?h('p',{className:'subtitle'},subtitle):null,...body);

export function buildLogin({error,busy,onSubmit}){
 return h('div',{className:'login-wrap'},h('form',{className:'login',autocomplete:'off',onsubmit:onSubmit},
  h('h1',{},'Two Sides · Panel de estadísticas'),
  h('p',{className:'demo-note'},'Demostración local con datos sintéticos. No es un acceso de producción.'),
  h('label',{for:'account'},'Identificador de cuenta administradora'),h('input',{id:'account',name:'account',type:'text',required:true,autocomplete:'off',spellcheck:'false'}),
  h('label',{for:'credential'},'Credencial'),h('input',{id:'credential',name:'credential',type:'password',required:true,autocomplete:'off'}),
  error?h('p',{className:'error',role:'alert'},error):null,
  h('button',{type:'submit',disabled:busy},busy?'Verificando…':'Entrar'),
  h('p',{className:'hint'},'Las credenciales ficticias se generan en cada arranque del servidor demo (ver documentación B84).')));
}

export function buildDashboard(data){
 const {overview:o,biomes:b,decisions:d,endings:e,timeseries:t}=data;
 if(o.events===0)return h('div',{className:'empty',role:'status'},h('h2',{},'Aún no hay estadísticas'),h('p',{},'La base de demostración está vacía. Ejecuta el servidor demo con --seed para cargar los datos sintéticos.'));
 const cards=h('div',{className:'cards'},
  card('Instalaciones',formatInt(o.installations)),card('Partidas iniciadas',formatInt(o.gamesStarted)),card('Partidas completadas',formatInt(o.gamesCompleted)),
  card('Tasa de finalización',formatPercent(o.completionRate),'completadas ÷ iniciadas'),card('Tiempo efectivo total',formatDuration(o.effectiveMs)),
  card('Sesiones',formatInt(o.sessionsStarted),`${formatInt(o.sessionsClosed)} cerradas · ${formatInt(o.sessionsInterrupted)} interrumpidas`),
  card('Tiempo medio por partida iniciada',formatDuration(o.averages.effectiveMsPerGameStarted),'incluye partidas incompletas'));
 const cats=b.biomes.map(x=>({label:BIOME_LABELS[x.id]??x.id}));
 const visitSeries=[{name:'Visitas',color:PALETTE.teal,values:b.biomes.map(x=>x.visits)},{name:'Finalizaciones',color:PALETTE.orange,values:b.biomes.map(x=>x.completions)}];
 const decisionSeries=[{name:'Aprobar',color:PALETTE.orange,values:d.byBiome.map(x=>x.approve)},{name:'Rechazar',color:PALETTE.teal,values:d.byBiome.map(x=>x.reject)}];
 const stateSeries=[{name:'Saludable',color:PALETTE.teal,values:d.byBiome.map(x=>x.healthy)},{name:'Degradado',color:PALETTE.purple,values:d.byBiome.map(x=>x.degraded)}];
 const endingSlices=['good','medium','bad'].map((k,i)=>({label:ENDING_LABELS[k],value:e[k],color:[PALETTE.teal,PALETTE.orange,PALETTE.purple][i]}));
 const days=t.points.map(p=>formatDay(p.date));
 return h('div',{},
  section('resumen','Resumen general','Totales acumulados de la base de demostración.',cards),
  section('biomas','Estadísticas por bioma','Visitas y finalizaciones, tiempo jugado y decisiones en cada uno de los cinco biomas.',
   h('div',{className:'grid-2'},
    h('figure',{},h('figcaption',{},'Visitas y finalizaciones por bioma'),legend(visitSeries),groupedBars({title:'Visitas y finalizaciones por bioma',categories:cats,series:visitSeries})),
    h('figure',{},h('figcaption',{},'Tiempo jugado por bioma (minutos)'),groupedBars({title:'Tiempo jugado por bioma en minutos',categories:cats,series:[{name:'Minutos',color:PALETTE.teal,values:b.biomes.map(x=>minutes(x.effectiveMs))}],format:v=>(Math.round(v*10)/10).toLocaleString('es-MX')}))),
   dataTable({caption:'Estadísticas por bioma',columns:['Bioma','Visitas','Finalizaciones','Tiempo jugado','Aprobar','Rechazar','Saludable','Degradado'],
    rows:b.biomes.map(x=>[BIOME_LABELS[x.id]??x.id,formatInt(x.visits),formatInt(x.completions),formatDuration(x.effectiveMs),formatInt(x.decisions.approve),formatInt(x.decisions.reject),formatInt(x.environment.healthy),formatInt(x.environment.degraded)])})),
  section('decisiones','Decisiones ambientales','Aprobar degrada el entorno; rechazar lo mantiene saludable.',
   h('div',{className:'cards small'},card('Aprobar',formatInt(d.totals.approve)),card('Rechazar',formatInt(d.totals.reject)),card('Saludable',formatInt(d.totals.healthy)),card('Degradado',formatInt(d.totals.degraded))),
   h('div',{className:'grid-2'},
    h('figure',{},h('figcaption',{},'Aprobar vs. rechazar por bioma'),legend(decisionSeries),groupedBars({title:'Decisiones aprobar y rechazar por bioma',categories:cats,series:decisionSeries})),
    h('figure',{},h('figcaption',{},'Estado saludable vs. degradado por bioma'),legend(stateSeries),groupedBars({title:'Estados saludable y degradado por bioma',categories:cats,series:stateSeries})))),
  section('finales','Finales','Distribución de las partidas terminadas.',
   h('div',{className:'ending-layout'},donut({title:'Distribución de finales',slices:endingSlices}),
    h('ul',{className:'ending-list'},endingSlices.map(s=>h('li',{},h('span',{className:'swatch c-'+Object.keys(PALETTE).find(k=>PALETTE[k]===s.color)}),`${s.label}: ${formatInt(s.value)} (${formatPercent(e.total?s.value/e.total:null)})`)),h('li',{className:'total'},`Total de partidas terminadas: ${formatInt(e.total)}`)))),
  section('tendencias','Tendencias diarias (UTC)',`Últimos ${t.days} días, del ${t.from} al ${t.to}.`,
   h('div',{className:'grid-2'},
    h('figure',{},h('figcaption',{},'Partidas iniciadas y completadas por día'),legend([{name:'Iniciadas',color:PALETTE.teal},{name:'Completadas',color:PALETTE.orange}]),
     lineChart({title:'Partidas iniciadas y completadas por día',labels:days,series:[{name:'Iniciadas',color:PALETTE.teal,values:t.points.map(p=>p.gamesStarted)},{name:'Completadas',color:PALETTE.orange,values:t.points.map(p=>p.gamesCompleted)}]})),
    h('figure',{},h('figcaption',{},'Tiempo efectivo por día (minutos)'),lineChart({title:'Tiempo efectivo por día en minutos',labels:days,series:[{name:'Minutos',color:PALETTE.purple,values:t.points.map(p=>minutes(p.effectiveMs))}]}))),
   dataTable({caption:'Tendencias diarias',columns:['Día (UTC)','Iniciadas','Completadas','Tiempo efectivo'],rows:t.points.map(p=>[p.date,formatInt(p.gamesStarted),formatInt(p.gamesCompleted),formatDuration(p.effectiveMs)])})));
}

export function buildStatus({data,state,error}){
 const rows=[['Modo',data?.mode?.label??'—'],['Última actualización',data?.generatedAt?formatClock(data.generatedAt):'—'],['Estado de consulta',state==='loading'?'Consultando…':state==='error'?'Error':'Correcta'],
  ['Almacenamiento',data?.status?.storage==='mongodb-local-replica-set'?'MongoDB local (conjunto de réplicas)':'—'],['Retención',data?.status?.retention==='experimental-not-approved-for-production'?'Experimental · no aprobada para producción':'—']];
 return section('sistema','Estado del sistema',null,error?h('p',{className:'error',role:'alert'},error):null,h('dl',{className:'status'},rows.map(([k,v])=>[h('dt',{},k),h('dd',{},v)])));
}
