import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
const check=value=>{
  const p=value instanceof URL?fileURLToPath(value):Buffer.isBuffer(value)?value.toString():value;
  if(typeof p==='string' && (/\.sqlite3(?:-|$)/i.test(p)||/(^|[\\/])\.env(?:\.|$)/i.test(p)))throw new Error('Protected data access blocked in sync tests');
};
for(const name of ['readFileSync','readFile','openSync','open','createReadStream']){const original=fs[name];fs[name]=function(file,...args){check(file);return original.call(this,file,...args);};}
for(const name of ['readFile','open']){const original=fs.promises[name];fs.promises[name]=function(file,...args){check(file);return original.call(this,file,...args);};}
syncBuiltinESMExports();
