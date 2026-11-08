// Minimal virtual tree: nothing is ever parsed as HTML, so server data can never become markup (no innerHTML anywhere).
const SVG_NS='http://www.w3.org/2000/svg',HTML_NS='http://www.w3.org/1999/xhtml';
export const h=(tag,attrs,...children)=>({tag,attrs:attrs??{},children:children.flat(Infinity).filter(c=>c!==null&&c!==undefined&&c!==false)});
export function toDom(node,doc=document,inSvg=false){
 if(typeof node==='string'||typeof node==='number')return doc.createTextNode(String(node));
 const svg=inSvg||node.tag==='svg',el=doc.createElementNS(svg?SVG_NS:HTML_NS,node.tag);
 for(const [key,value] of Object.entries(node.attrs)){
  if(value===null||value===undefined||value===false)continue;
  if(key.startsWith('on')&&typeof value==='function')el.addEventListener(key.slice(2),value);
  else el.setAttribute(key==='className'?'class':key,value===true?'':String(value));
 }
 for(const child of node.children)el.appendChild(toDom(child,doc,svg));
 return el;
}
// Test helper: flat text of a tree.
export const textOf=node=>typeof node==='object'?node.children.map(textOf).join(' '):String(node);
export const findAll=(node,predicate,out=[])=>{if(typeof node!=='object')return out;if(predicate(node))out.push(node);for(const c of node.children)findAll(c,predicate,out);return out;};
