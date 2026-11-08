// Test-process guard installed before modules: reject PlayerData metadata/content and environment files.
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {fileURLToPath} from 'node:url';
import net from 'node:net';import tls from 'node:tls';import dns from 'node:dns';
const marker=Symbol.for('twosides.b80.fs.guard');
export function assertIsolatedPath(value){
 const name=value instanceof URL?fileURLToPath(value):Buffer.isBuffer(value)?value.toString():value;
 if(typeof name==='string'&&(/(^|[\\/])PlayerData(?:[\\/]|$)/i.test(name)||/(^|[\\/])\.env(?:\.|$)/i.test(name)||/[\\/]\.work[\\/]runtime-game(?:[\\/]|$)/i.test(name)||/[\\/]ReconstructionTests(?:[\\/]|$)/i.test(name)))
  throw Error('B80_PROTECTED_PATH_REFUSED_BEFORE_IO');
}
if(!fs[marker]){
 for(const method of ['existsSync','statSync','lstatSync','accessSync','readFileSync','openSync','readdirSync','opendirSync','readlinkSync','realpathSync','createReadStream','writeFileSync','appendFileSync','mkdirSync','unlinkSync','rmSync','rmdirSync','watch','watchFile','stat','lstat','access','readFile','open','readdir','opendir','readlink','realpath','writeFile','appendFile','mkdir','unlink','rm','rmdir']){
  const original=fs[method];if(typeof original!=='function')continue;
  const wrapped=function(file,...args){assertIsolatedPath(file);return original.call(this,file,...args);};
  if(original.native)wrapped.native=function(file,...args){assertIsolatedPath(file);return original.native.call(this,file,...args);};
  fs[method]=wrapped;
 }
 for(const method of ['renameSync','copyFileSync','cpSync','rename','copyFile','cp']){const original=fs[method];if(!original)continue;fs[method]=function(from,to,...args){assertIsolatedPath(from);assertIsolatedPath(to);return original.call(this,from,to,...args);};}
 for(const method of ['stat','lstat','access','readFile','open','readdir','opendir','readlink','realpath','writeFile','appendFile','mkdir','unlink','rm','rmdir']){const original=fs.promises[method];if(!original)continue;fs.promises[method]=function(file,...args){assertIsolatedPath(file);return original.call(this,file,...args);};}
 for(const method of ['rename','copyFile','cp']){const original=fs.promises[method];if(!original)continue;fs.promises[method]=function(from,to,...args){assertIsolatedPath(from);assertIsolatedPath(to);return original.call(this,from,to,...args);};}
 const loopback=host=>['127.0.0.1','::1','::ffff:127.0.0.1','localhost'].includes(String(host).toLowerCase());
 const target=args=>{const first=Array.isArray(args[0])?args[0][0]:args[0];if(typeof first==='object'&&first!==null)return first;return typeof first==='string'&&!/^\d+$/.test(first)?{path:first}:{port:first,host:typeof args[1]==='string'?args[1]:undefined};};
 const connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){const o=target(args);if(!o.path&&o.host!==undefined&&!loopback(o.host))throw Error('B80_EXTERNAL_NETWORK_REFUSED');return connect.apply(this,args);};
 const listen=net.Server.prototype.listen;net.Server.prototype.listen=function(...args){const o=target(args);if(!o.path&&!loopback(o.host))throw Error('B80_PUBLIC_LISTENER_REFUSED');return listen.apply(this,args);};
 const secure=tls.connect;tls.connect=function(...args){const o=target(args);if(!o.path&&o.host!==undefined&&!loopback(o.host))throw Error('B80_EXTERNAL_NETWORK_REFUSED');return secure.apply(this,args);};
 for(const method of ['lookup','resolve','resolve4','resolve6','resolveSrv','resolveTxt','resolveCname']){const original=dns[method];dns[method]=function(host,...args){if(!loopback(host))throw Error('B80_EXTERNAL_DNS_REFUSED');return original.call(this,host,...args);};const promise=dns.promises[method];if(promise)dns.promises[method]=function(host,...args){if(!loopback(host))throw Error('B80_EXTERNAL_DNS_REFUSED');return promise.call(this,host,...args);};}
 fs[marker]=true;syncBuiltinESMExports();
}
