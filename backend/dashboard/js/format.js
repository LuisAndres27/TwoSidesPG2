export const BIOME_LABELS=Object.freeze({ocean:'Océano',jungle:'Selva',desert:'Desierto',forest:'Bosque',tundra:'Tundra'});
export const ENDING_LABELS=Object.freeze({good:'Final bueno',medium:'Final medio',bad:'Final malo'});
export const COLORS=Object.freeze({teal:'#0b8a7a',orange:'#c25a14',purple:'#5e4aa8'});
const nf=new Intl.NumberFormat('es-MX');
export const formatInt=n=>Number.isFinite(n)?nf.format(n):'—';
export const formatPercent=r=>Number.isFinite(r)?(r*100).toLocaleString('es-MX',{maximumFractionDigits:1,minimumFractionDigits:1})+' %':'—';
export function formatDuration(ms){
 if(!Number.isFinite(ms))return '—';
 const total=Math.round(ms/1000),h=Math.floor(total/3600),m=Math.floor(total%3600/60),s=total%60;
 return h>0?`${h} h ${String(m).padStart(2,'0')} min`:m>0?`${m} min ${String(s).padStart(2,'0')} s`:`${s} s`;
}
export const minutes=ms=>Math.round(ms/60000*10)/10;
export const formatDay=iso=>{const [,m,d]=iso.split('-');return `${d}/${m}`;};
export const formatClock=iso=>{const d=new Date(iso);return Number.isNaN(d.getTime())?'—':d.toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'medium'});};
