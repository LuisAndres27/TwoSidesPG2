import { TextDecoder } from 'node:util';
import { AtlasIntegrationError } from './atlas-policy.js';
const secrets=new WeakMap();
// A credential is data, not a text document: preserve an initial U+FEFF too.
const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
export function temporaryAtlasCredential(bytes){
  if(!Buffer.isBuffer(bytes))throw new AtlasIntegrationError('atlas_credential_required');
  try{
    if(!bytes.length||bytes.length>1024||/[\r\n\0]/.test(decoder.decode(bytes)))throw new Error();
    const handle=Object.freeze(Object.create(null));secrets.set(handle,Buffer.from(bytes));return handle;
  }catch{throw new AtlasIntegrationError('atlas_credential_required');}
  finally{bytes.fill(0);}
}
export function consumeAtlasCredential(handle){
  const bytes=secrets.get(handle);if(!bytes)throw new AtlasIntegrationError('atlas_credential_required');
  try{return decoder.decode(bytes);}finally{bytes.fill(0);secrets.delete(handle);}
}
export function destroyAtlasCredential(handle){const b=secrets.get(handle);if(b)b.fill(0);secrets.delete(handle);}

// Future manual launcher supplies ONLY a dedicated anonymous stdin/IPC stream, not argv/env.
// Wire format: 4-byte unsigned big-endian length + UTF-8 bytes. No delimiter/JSON logging.
export async function receiveAtlasCredential(stream,{timeoutMs=30000}={}){
  if(!stream||typeof stream.on!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw new AtlasIntegrationError('atlas_credential_required');
  return new Promise((resolve,reject)=>{
    let chunks=[],size=0,finished=false;
    const fail=()=>finish(new AtlasIntegrationError('atlas_credential_required'));
    const timer=setTimeout(fail,timeoutMs);
    function finish(error,handle){if(finished)return;finished=true;clearTimeout(timer);stream.removeListener('data',data);stream.removeListener('end',end);stream.removeListener('error',fail);for(const c of chunks)c.fill(0);chunks=[];if(error)reject(error);else resolve(handle);}
    function data(chunk){
      if(!Buffer.isBuffer(chunk)){fail();return;}
      size+=chunk.length;if(size>1028){chunk.fill(0);fail();return;}
      chunks.push(Buffer.from(chunk));chunk.fill(0);
    }
    function end(){let frame;try{frame=Buffer.concat(chunks);if(frame.length<5||frame.readUInt32BE(0)!==frame.length-4)throw new Error();finish(null,temporaryAtlasCredential(frame.subarray(4)));}catch{fail();}finally{frame?.fill(0);}}
    stream.on('data',data);stream.once('end',end);stream.once('error',fail);
  });
}
