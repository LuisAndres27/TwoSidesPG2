// B86.4 — one-off connection diagnostic for the READER identity. Separate from the connector and the preflight: it changes neither.
// Runs only connect, hello and connectionStatus (no showPrivileges, no collection access). Prints OK/FAIL per variant with sanitised error facts.
// It never prints the URI, user, password, host, full paths or a stack. Importing this module opens nothing.
import path from 'node:path';
import {MongoClient} from 'mongodb';
import {buildClientOptions,connectionUri,DIAGNOSTIC_SOURCE} from '../../src/modules/statistics/atlas-connector.js';

const TOKEN=/^[A-Za-z0-9_$.\-]{1,60}$/;
const hasSecret=(text,{host,user,password}={})=>[host,user,password].some(v=>typeof v==='string'&&v.length>0&&(text.includes(v)||v.includes(text)));
const token=(v,secrets)=>{const s=typeof v==='number'?String(v):v;return typeof s==='string'&&TOKEN.test(s)&&!hasSecret(s,secrets)?s:'other';};   // a name or code equal to (or part of) a secret is never shown

// Replace host, user and password by markers, then URIs, any *.mongodb.net name, IPs and paths. The result is only shown when no secret survives.
export function sanitizeText(text,{host,user,password}={}){
 let s=String(text??'');
 for(const [value,marker] of [[password,'<password>'],[user,'<user>'],[host,'<host>']])if(typeof value==='string'&&value.length>0)s=s.split(value).join(marker);
 return s.replace(/mongodb(\+srv)?:\/\/\S*/gi,'<uri>').replace(/[\w.-]+\.mongodb\.net/gi,'<host>').replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g,'<ip>')
  .replace(/[A-Za-z]:[\\/][^\s'"),;]*|(?:\/[\w.@~+-]+){2,}/g,'<path>').replace(/\S*[\\/]\S*/g,'<path>').replace(/\s+/g,' ').trim().slice(0,240);
}
const PLAIN=/^[\w :.,'<>()-]{1,240}$/;
const leaksAnyCase=(text,secrets)=>[secrets.host,secrets.user,secrets.password].some(v=>typeof v==='string'&&v.length>0&&text.toLowerCase().includes(v.toLowerCase()));
const leaks=(text,secrets)=>[secrets.host,secrets.user,secrets.password].some(v=>typeof v==='string'&&v.length>0&&text.includes(v));

// First stack frame reduced to "function @ base-file". The directory part (which may hold a user name) is dropped.
export function firstFrame(error){
 const line=String(error?.stack??'').split('\n').slice(1).map(l=>l.trim()).find(l=>l.startsWith('at '));if(!line)return 'none';
 const m=/^at\s+(?:(.*?)\s+\()?(.*?)(?::\d+)?(?::\d+)?\)?$/.exec(line);if(!m)return 'other';
 const fn=(m[1]??'<anonymous>').replace(/^async\s+/,''),file=path.basename(String(m[2]).replace(/\?.*$/,'').replace(/^file:\/\/\//,''));
 return (TOKEN.test(fn.replace(/[ <>]/g,''))?fn:'other')+' @ '+(TOKEN.test(file)?file:'other');
}

export function describeError(error,secrets){
 const own=error&&typeof error==='object'?error:{},causes=[];
 for(let e=own.cause,i=0;e&&typeof e==='object'&&i<3;e=e.cause,i++)causes.push(token(e.name,secrets)+'/'+token(e.code,secrets));
 if(Array.isArray(own.errors))for(const e of own.errors.slice(0,3))causes.push(token(e?.name,secrets)+'/'+token(e?.code,secrets));
 const server=own.name==='MongoServerError',authFailure=server&&(own.code===8000||own.code===18||own.codeName==='AuthenticationFailed');
 // A server message is shown only when, after sanitising, it is plain text and no secret survives even ignoring case; driver messages follow the normal rule.
 const sanitized=sanitizeText(own.message,secrets),message=server&&!(PLAIN.test(sanitized)&&!leaksAnyCase(sanitized,secrets))?undefined:sanitized;
 return {name:token(own.name,secrets),code:token(own.code,secrets),codeName:token(own.codeName,secrets),frame:firstFrame(own),causes,authFailure,message:message&&!leaks(message,secrets)?message:undefined};
}

const withTimeout=(promise,ms)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('variant timed out'),{name:'VariantTimeout'})),ms);})]).finally(()=>clearTimeout(timer));};

// One variant: fresh client, connect + hello + connectionStatus (no showPrivileges), always closed.
export async function runVariant({label,uri,options,identityUser,ClientImpl=MongoClient,secrets,variantTimeoutMs=40000}){
 let stage='connect',client;
 try{
  client=new ClientImpl(uri,options);
  await withTimeout(client.connect(),variantTimeoutMs);
  stage='hello';const hello=await withTimeout(client.db('admin').command({hello:1}),variantTimeoutMs);
  stage='connectionStatus';const status=await withTimeout(client.db('admin').command({connectionStatus:1}),variantTimeoutMs);
  const users=status?.authInfo?.authenticatedUsers??[],roles=status?.authInfo?.authenticatedUserRoles??[];
  return {label,ok:true,hello:{ok:hello?.ok===1,replicaSet:Boolean(hello?.setName),writablePrimary:hello?.isWritablePrimary===true,maxWireVersion:Number.isInteger(hello?.maxWireVersion)?hello.maxWireVersion:null},
   auth:{users:users.length,roles:roles.length,userMatches:users.length===1&&users[0].user===identityUser}};
 }catch(error){const d=describeError(error,secrets);return {label,ok:false,stage,error:{...d,authFailure:stage==='connect'&&d.authFailure}};}
 finally{try{await client?.close();}catch{/* closing never masks the result */}}
}

// Option groups for B-minus-A bisection (each is added alone to variant A).
export function optionGroups(full){
 const pick=(...keys)=>Object.fromEntries(keys.filter(k=>k in full).map(k=>[k,full[k]]));
 return [['tls+retry',pick('tls','retryWrites','retryReads')],['timeouts',pick('serverSelectionTimeoutMS','connectTimeoutMS','socketTimeoutMS')],['timeoutMS',pick('timeoutMS')],['pool',pick('maxPoolSize','minPoolSize')],['appName',pick('appName')]];
}

export const VARIANT_KEYS=Object.freeze(['A','B','C','D','E','F']);
export function parseVariants(value){
 if(value===undefined||value==='all')return [...VARIANT_KEYS];
 const list=Array.isArray(value)?value:String(value).split(',');
 if(list.length===0||list.some(v=>!VARIANT_KEYS.includes(v))||new Set(list).size!==list.length)throw Object.assign(new Error('Variants must be "all" or a list of distinct letters A-F'),{name:'DiagnosticRefused'});
 return VARIANT_KEYS.filter(v=>list.includes(v));
}

// Variant F = the real preflight flow: it loads tools/b86/session.js (with every module that file imports, exactly as atlas-session.mjs does) and runs
// its read-only preflight action (connect, hello, connectionStatus with showPrivileges). Loaded lazily and only here, so variants A-E run in a clean process.
export const defaultFlow=async({config,credentials,ClientImpl})=>{const {runPreparedSession}=await import('./session.js');return runPreparedSession({config,credentials,action:'preflight',ClientImpl});};

async function runFlow({label,flow,config,credentials,ClientImpl,secrets}){
 try{
  const report=await flow({config,credentials,ClientImpl});
  return {label,ok:true,flow:{privilegesExact:report?.privileges==='exact-match',userMatches:report?.authenticatedUser==='matches-identity',transactions:report?.transactions==='supported',mechanism:report?.authMechanism==='SCRAM-SHA-1'||report?.authMechanism==='SCRAM-SHA-256'?report.authMechanism:'other'}};
 }catch(error){
  const d=describeError(error?.[DIAGNOSTIC_SOURCE]??error,secrets),category=typeof error?.category==='string'&&TOKEN.test(error.category)?error.category:'other',stage=typeof error?.stage==='string'&&TOKEN.test(error.stage)?error.stage:'flow';
  return {label,ok:false,stage,error:{...d,category,authFailure:stage==='connect'&&d.authFailure}};
 }
}

export async function runDiagnostics({config,credentials,ClientImpl=MongoClient,variantTimeoutMs,variants,flow=defaultFlow}){
 if(config?.identity!=='reader'||credentials?.username!==config.user)throw Object.assign(new Error('Diagnostic is limited to the reader identity'),{name:'DiagnosticRefused'});
 const want=parseVariants(variants),secrets={host:config.host,user:config.user,password:credentials.password},uri=connectionUri(config),common={ClientImpl,identityUser:config.user,secrets,variantTimeoutMs};
 const full=buildClientOptions(config,credentials),authOnly={auth:{username:credentials.username,password:credentials.password},authMechanism:'SCRAM-SHA-256',authSource:'admin'};
 const {authMechanism:_forced,...negotiated}=authOnly,results=[],R={};
 const run=async(key,label,options)=>{if(want.includes(key)){R[key]=await runVariant({...common,label,uri,options});results.push(R[key]);}};
 await run('A','A minimal (SCRAM-SHA-256, authSource admin)',{...authOnly});
 await run('B','B A + all buildClientOptions (SCRAM-SHA-256)',{...full,authMechanism:'SCRAM-SHA-256'});
 await run('C','C as A but SCRAM-SHA-1',{...authOnly,authMechanism:'SCRAM-SHA-1'});
 await run('D','D as A but no authMechanism (driver negotiates)',negotiated);
 await run('E','E C + all buildClientOptions (SCRAM-SHA-1)',{...full,authMechanism:'SCRAM-SHA-1'});
 if(R.A?.ok&&R.B&&!R.B.ok)for(const [name,group] of optionGroups(full))results.push(await runVariant({...common,label:'A + group '+name,uri,options:{...authOnly,...group}}));
 if(R.C?.ok&&R.E&&!R.E.ok)for(const [name,group] of optionGroups(full))results.push(await runVariant({...common,label:'C + group '+name,uri,options:{...authOnly,authMechanism:'SCRAM-SHA-1',...group}}));
 if(want.includes('F')){R.F=await runFlow({label:'F real preflight flow (session.js, connectPrepared, showPrivileges)',flow,config,credentials,ClientImpl,secrets});results.push(R.F);}
 const ok=key=>R[key]?.ok;
 return {results,ran:want,aOk:ok('A'),bOk:ok('B'),cOk:ok('C'),dOk:ok('D'),eOk:ok('E'),fOk:ok('F')};
}

const failText=r=>`FAIL stage=${r.stage} ${r.error.category?`category=${r.error.category} `:''}name=${r.error.name} code=${r.error.code} codeName=${r.error.codeName} authFailure=${r.error.authFailure?'yes':'no'} frame=${r.error.frame}`+(r.error.causes.length?` causes=${r.error.causes.join(',')}`:'')+(r.error.message?` message="${r.error.message}"`:'');
export function formatReport({results,aOk,bOk,cOk,dOk,eOk,fOk}){
 const lines=[];
 for(const r of results){
  if(!r.ok)lines.push(`${r.label}: ${failText(r)}`);
  else if(r.flow)lines.push(`${r.label}: OK privileges=${r.flow.privilegesExact?'exact-match':'not-confirmed'} user=${r.flow.userMatches?'matches':'not-confirmed'} transactions=${r.flow.transactions?'supported':'not-confirmed'} mechanism=${r.flow.mechanism}`);
  else lines.push(`${r.label}: OK hello(ok=${r.hello.ok}, replicaSet=${r.hello.replicaSet}, writablePrimary=${r.hello.writablePrimary}, maxWireVersion=${r.hello.maxWireVersion}) auth(users=${r.auth.users}, roles=${r.auth.roles}, userMatches=${r.auth.userMatches})`);
 }
 if(aOk!==undefined)lines.push(aOk?(bOk?'Conclusion: A and B work; the options are not the cause.':'Conclusion: A works and B fails; see the groups above.'):(cOk||dOk?'Conclusion: C or D works, so the password works; the forced SCRAM-SHA-256 mechanism is the problem.':'Conclusion: A, B, C and D all fail; check the password, the user (and its restriction to this cluster) or the real error above. The extra options are not the cause.'));
 if(eOk===true&&fOk===false)lines.push('Conclusion E/F: E works but the real connector flow (F) fails; the cause is in what the preflight process loads or does, not in the credentials, the mechanism or the options.');
 else if(eOk===true&&fOk===true)lines.push('Conclusion E/F: E and F work; the real preflight flow should work.');
 else if(eOk===false&&cOk===true)lines.push('Conclusion E: C works but E fails; one of the connector options is the cause (see the groups).');
 else if(eOk===false)lines.push('Conclusion E: SCRAM-SHA-1 with all connector options fails; see the error above.');
 else if(fOk===false&&eOk===undefined)lines.push('Conclusion F: the real connector flow fails; run E as well to separate the flow from credentials and options.');
 return lines.join('\n');
}

// Failure line(s) for atlas-session.mjs: category/stage first (as before), then sanitised facts of the ORIGINAL error. Nothing else is printed.
export function formatSessionFailure(error,secrets){
 const d=describeError(error?.[DIAGNOSTIC_SOURCE]??error,secrets),category=typeof error?.category==='string'&&TOKEN.test(error.category)?error.category:undefined,stage=typeof error?.stage==='string'&&TOKEN.test(error.stage)?error.stage:'other';
 const head=category?`Session failed: ${category} (${stage})`+(error.errorName?` [error=${token(error.errorName,secrets)}, code=${token(error.code,secrets)}]`:''):'Session failed: unexpected error';
 return head+`\n  detail: name=${d.name} code=${d.code} codeName=${d.codeName} frame=${d.frame}`+(d.causes.length?` causes=${d.causes.join(',')}`:'')+(d.message?` message="${d.message}"`:'');
}
