// Pure builders: data in -> virtual SVG/HTML tree out (testable without a browser). Palette validated with the dataviz validator
// (categorical, light surface): teal / orange / purple. Every chart has a legend (>=2 series), direct value labels and a table view.
// CSP forbids inline style attributes, so legend swatches use classes (c-teal / c-orange / c-purple) and SVG marks use presentation attributes.
import {h} from './vdom.js';
import {formatInt} from './format.js';
export const PALETTE=Object.freeze({teal:'#0b8a7a',orange:'#c25a14',purple:'#5e4aa8'});
const INK='#1c2b2a',MUTED='#5b6b69',GRID='#dfe6e4',SURFACE='#fcfcfb';
const niceMax=v=>{if(v<=0)return 1;const p=10**Math.floor(Math.log10(v)),f=v/p;return(f<=1?1:f<=2?2:f<=5?5:10)*p;};
const gridTicks=(max,y,left,right,format)=>[0,1,2,3,4].map(i=>{const t=max*i/4;return h('g',{},
 h('line',{x1:left,x2:right,y1:y(t),y2:y(t),stroke:GRID,'stroke-width':1}),
 h('text',{x:left-6,y:y(t)+4,'text-anchor':'end','font-size':11,fill:MUTED},format(Math.round(t*10)/10)));});

export const legend=series=>h('ul',{className:'legend'},series.map(s=>h('li',{},h('span',{className:'swatch c-'+Object.keys(PALETTE).find(k=>PALETTE[k]===s.color)}),s.name)));

export function groupedBars({title,categories,series,format=formatInt,width=640,height=300}){
 const m={l:48,r:12,t:22,b:40},w=width-m.l-m.r,hh=height-m.t-m.b,max=niceMax(Math.max(0,...series.flatMap(s=>s.values))),y=v=>m.t+hh-(v/max)*hh;
 const groupW=w/categories.length,gap=6,barW=Math.max(6,Math.min(36,(groupW-12-gap*(series.length-1))/series.length));
 const nodes=[h('title',{},title),...gridTicks(max,y,m.l,width-m.r,format)];
 categories.forEach((c,i)=>{
  const x0=m.l+i*groupW+(groupW-(barW*series.length+gap*(series.length-1)))/2;
  series.forEach((s,j)=>{
   const v=s.values[i],x=x0+j*(barW+gap),bh=Math.max(v>0?2:0,m.t+hh-y(v));
   nodes.push(h('g',{className:'bar'},h('title',{},`${c.label} · ${s.name}: ${format(v)}`),
    h('rect',{x,y:m.t+hh-bh,width:barW,height:bh,rx:4,fill:s.color}),
    h('text',{x:x+barW/2,y:m.t+hh-bh-5,'text-anchor':'middle','font-size':11,fill:INK},format(v))));
  });
  nodes.push(h('text',{x:m.l+i*groupW+groupW/2,y:height-14,'text-anchor':'middle','font-size':12,fill:INK},c.label));
 });
 nodes.push(h('line',{x1:m.l,x2:width-m.r,y1:m.t+hh,y2:m.t+hh,stroke:MUTED,'stroke-width':1}));
 return h('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':title,className:'chart'},nodes);
}

export function donut({title,slices,size=220,format=formatInt}){
 const total=slices.reduce((a,s)=>a+s.value,0),cx=size/2,cy=size/2,r=size*0.38,sw=size*0.16,C=2*Math.PI*r;
 const nodes=[h('title',{},title),h('circle',{cx,cy,r,fill:'none',stroke:GRID,'stroke-width':sw})];
 let acc=0;
 if(total>0)for(const s of slices){
  if(s.value<=0)continue;const len=C*s.value/total,dash=Math.max(0,len-2);
  nodes.push(h('circle',{cx,cy,r,fill:'none',stroke:s.color,'stroke-width':sw,'stroke-dasharray':`${dash} ${C-dash}`,'stroke-dashoffset':-acc,transform:`rotate(-90 ${cx} ${cy})`},
   h('title',{},`${s.label}: ${format(s.value)} (${(s.value/total*100).toFixed(1)} %)`)));acc+=len;
 }
 nodes.push(h('text',{x:cx,y:cy-2,'text-anchor':'middle','font-size':26,'font-weight':700,fill:INK},format(total)),
  h('text',{x:cx,y:cy+18,'text-anchor':'middle','font-size':12,fill:MUTED},'partidas terminadas'));
 return h('svg',{viewBox:`0 0 ${size} ${size}`,role:'img','aria-label':title,className:'chart donut'},nodes);
}

export function lineChart({title,labels,series,format=formatInt,width=640,height=260}){
 const m={l:48,r:16,t:20,b:36},w=width-m.l-m.r,hh=height-m.t-m.b,max=niceMax(Math.max(0,...series.flatMap(s=>s.values))),n=labels.length;
 const x=i=>m.l+(n<=1?w/2:i*w/(n-1)),y=v=>m.t+hh-(v/max)*hh,step=Math.max(1,Math.ceil(n/8));
 const nodes=[h('title',{},title),...gridTicks(max,y,m.l,width-m.r,format)];
 labels.forEach((l,i)=>{if(i===n-1||(i%step===0&&n-1-i>=Math.ceil(step/2)))nodes.push(h('text',{x:x(i),y:height-12,'text-anchor':'middle','font-size':11,fill:MUTED},l));});
 for(const s of series){
  nodes.push(h('polyline',{points:s.values.map((v,i)=>`${x(i)},${y(v)}`).join(' '),fill:'none',stroke:s.color,'stroke-width':2,'stroke-linejoin':'round','stroke-linecap':'round'}));
  s.values.forEach((v,i)=>nodes.push(h('circle',{cx:x(i),cy:y(v),r:n>20?2.5:4,fill:s.color,stroke:SURFACE,'stroke-width':2},h('title',{},`${labels[i]} · ${s.name}: ${format(v)}`))));
 }
 return h('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':title,className:'chart'},nodes);
}

export const dataTable=({caption,columns,rows})=>h('details',{className:'table-view'},h('summary',{},'Ver tabla de datos'),
 h('div',{className:'table-wrap'},h('table',{},h('caption',{},caption),h('thead',{},h('tr',{},columns.map(c=>h('th',{scope:'col'},c)))),
  h('tbody',{},rows.map(r=>h('tr',{},r.map((c,i)=>i===0?h('th',{scope:'row'},c):h('td',{},c))))))));
