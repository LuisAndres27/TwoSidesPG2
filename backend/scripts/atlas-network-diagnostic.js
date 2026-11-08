import dns from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { ATLAS_TARGET } from '../src/modules/sync/atlas-policy.js';
import { classifyAtlasError } from '../src/modules/sync/atlas-error-diagnostic.js';

// Network-only probes. Never import Mongoose, receive credentials, send MongoDB commands or change system settings.
function socketProbe(host,port,secure){
  return new Promise(resolve=>{
    const started=performance.now();let socket,answer;
    const finish=(ok,error)=>{
      if(answer)return;
      answer={status:ok?'ok':'failed',certificateValidated:secure&&ok,
        diagnostic:error?classifyAtlasError(error,{stage:secure?'tls':'tcp',durationMs:performance.now()-started,cleanup:'completed',close:'completed'}):null};
      socket?.destroy();
    };
    try{
      socket=secure?tls.connect({host,port,servername:host,rejectUnauthorized:true}):net.createConnection({host,port});
      socket.once(secure?'secureConnect':'connect',()=>finish(!secure||socket.authorized));
      socket.once('error',error=>finish(false,error));
      socket.setTimeout(5000,()=>finish(false,Object.assign(new Error(),{code:'ETIMEDOUT'})));
      socket.once('close',()=>resolve({...answer,closed:true}));
    }catch(error){resolve({status:'failed',certificateValidated:false,closed:!socket,
      diagnostic:classifyAtlasError(error,{stage:secure?'tls':'tcp',durationMs:performance.now()-started,cleanup:'unknown',close:socket?'unknown':'not-needed'})});socket?.destroy();}
  });
}
export async function diagnosticAtlasNetwork(){
  const resolver=new dns.Resolver({timeout:2500,tries:1});
  const report={schemaVersion:1,phase:'B05.4C.2D.1A',kind:'no-credentials-network-only',
    host:ATLAS_TARGET.host,nodeVersion:process.version,resolverCount:resolver.getServers().length,
    dnsResultOrder:dns.getDefaultResultOrder(),tlsValidationRequired:true,
    srv:null,txt:null,nodes:[],mongoAuthenticationAttempted:false,remoteDocumentWrites:0};
  let records;
  try{
    records=await resolver.resolveSrv('_mongodb._tcp.'+ATLAS_TARGET.host);
    if(!records.length||records.length>3||records.some(r=>r.port!==27017||!/^[a-z0-9.-]+$/i.test(r.name)||!r.name.endsWith('.fxqeo8o.mongodb.net'))){
      report.srv={status:'blocked',reason:'DESTINATION_UNVERIFIED'};return report;
    }
    report.srv={status:'ok',records:records.length,authorizedSuffixesOnly:true};
  }catch(error){report.srv={status:'failed',diagnostic:classifyAtlasError(error,{stage:'dns-srv'})};return report;}
  try{
    const rows=await resolver.resolveTxt(ATLAS_TARGET.host);
    const options=new URLSearchParams(rows.flat().join('&'));
    report.txt={status:'ok',records:rows.length,authSourceAdmin:options.get('authSource')==='admin',
      replicaSetPresent:options.has('replicaSet'),unrecognizedOptions:[...options.keys()].some(k=>!['authSource','replicaSet','loadBalanced'].includes(k))};
  }catch(error){report.txt={status:'failed',diagnostic:classifyAtlasError(error,{stage:'dns-srv'})};}
  for(const [index,row]of records.entries()){
    const item={nodeIndex:index+1,dns:null,tcp:null,tls:null};
    try{
      const addresses=await resolver.resolve4(row.name);
      const lookup=await dns.lookup(row.name,{all:true});
      item.dns={status:'ok',ipv4Records:addresses.length,lookupIpv4:lookup.filter(a=>a.family===4).length,lookupIpv6:lookup.filter(a=>a.family===6).length};
    }catch(error){item.dns={status:'failed',diagnostic:classifyAtlasError(error,{stage:'dns-host'})};report.nodes.push(item);continue;}
    item.tcp=await socketProbe(row.name,row.port,false);
    item.tls=await socketProbe(row.name,row.port,true);
    report.nodes.push(item);
  }
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  diagnosticAtlasNetwork().then(r=>process.stdout.write(JSON.stringify(r)))
    .catch(()=>{process.stdout.write(JSON.stringify({kind:'no-credentials-network-only',status:'DIAGNOSTIC_UNAVAILABLE'}));process.exitCode=1;});
}
