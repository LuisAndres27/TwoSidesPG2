// B86.7: transitive module graph of an entry point (static imports, re-exports, side-effect imports AND dynamic import() of relative specifiers).
// Used to prove that no Atlas action can reach tests/ or the B80 isolation guard, even through a deferred import. Reads source files only; nothing is executed.
import fs from 'node:fs';import path from 'node:path';

const FROM=/(?:^|[;\n}])\s*(?:import|export)\s*(?:[^'"`;]*?\sfrom\s*)?['"]([^'"]+)['"]/g;
const SIDE=/(?:^|[;\n}])\s*import\s*['"]([^'"]+)['"]/g;
const DYNAMIC=/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const stripComments=text=>text.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:'"`\\])\/\/[^\n]*/g,'$1');

export function importGraph(entry,{backend}={}){
 const root=backend??path.resolve(path.dirname(entry),'../..'),files=new Map(),bare=new Set();
 const resolve=(from,spec)=>{const base=path.resolve(path.dirname(from),spec);if(path.extname(base))return base;for(const ext of ['.js','.mjs','/index.js'])if(fs.existsSync(base+ext))return base+ext;return base;};
 const visit=(file,parent,dynamic)=>{
  const key=path.relative(root,file).replace(/\\/g,'/');
  if(files.has(key)){if(!dynamic)files.get(key).dynamic=false;return;}
  files.set(key,{parent:parent&&path.relative(root,parent).replace(/\\/g,'/'),dynamic});
  let text;try{text=stripComments(fs.readFileSync(file,'utf8'));}catch{return;}
  for(const [re,isDynamic] of [[FROM,false],[SIDE,false],[DYNAMIC,true]]){
   re.lastIndex=0;let m;
   while((m=re.exec(text))){const spec=m[1];if(spec.startsWith('.'))visit(resolve(file,spec),file,isDynamic||dynamic);else if(!spec.startsWith('node:'))bare.add(spec);}
  }
 };
 visit(path.resolve(entry),null,false);
 return {files:[...files.keys()].sort(),entries:Object.fromEntries(files),bare:[...bare].sort()};
}
export const forbidden=file=>/(^|\/)tests\//.test(file)||/b80-isolation-guard|b81-container-instance/.test(file);
