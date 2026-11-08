// Private diagnostics ONLY: never copy messages, stacks, URIs, hosts, credentials or error objects.
const classes=new Set(['Error','TypeError','AggregateError','MongoError','MongoServerError','MongoAPIError','MongoParseError',
  'MongoInvalidArgumentError','MongoServerSelectionError','MongooseServerSelectionError','MongoNetworkError','MongoNetworkTimeoutError',
  'MongoTopologyClosedError','MongoServerClosedError','MongoPoolClosedError','AtlasIntegrationError']);
const codes=new Set(['ENOTFOUND','ENODATA','ECONNREFUSED','ECONNRESET','ETIMEDOUT','ETIMEOUT','ESERVFAIL','EAI_AGAIN','EPROTO',
  'ERR_TLS_CERT_ALTNAME_INVALID','CERT_HAS_EXPIRED','CERT_NOT_YET_VALID','UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR','ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE','ERR_SSL_WRONG_VERSION_NUMBER',
  'ERR_SSL_UNSUPPORTED_PROTOCOL','ERR_TLS_HANDSHAKE_TIMEOUT']);
const numbers=new Set([6,7,13,18,50,89,91,189,262,8000,11600,11602,13435]);
const stages=new Set(['configuration','mongoose-connect','permission-inspection','list-collections','diagnostic','close','dns-srv','dns-host','tcp','tls']);
const priority=['CERTIFICATE_VALIDATION_FAILURE','TLS_HANDSHAKE_FAILURE','AUTHENTICATION_FAILURE','AUTHORIZATION_FAILURE',
  'UNSUPPORTED_METADATA_FILTER','UNSUPPORTED_METADATA_COMMAND','INVALID_CONNECTION_OPTIONS','DNS_SRV_FAILURE','DNS_HOST_FAILURE','NETWORK_REFUSED','NETWORK_RESET','NETWORK_TIMEOUT','CLUSTER_UNAVAILABLE',
  'SERVER_SELECTION_TIMEOUT','SERVER_SELECTION_FAILURE','UNKNOWN_CONNECTION_FAILURE'];
// Read data properties only, without invoking getters or user-defined toString/JSON hooks.
function get(value,key){try{for(let o=value,n=0;o&&n<6;o=Object.getPrototypeOf(o),n++){const d=Object.getOwnPropertyDescriptor(o,key);if(d)return 'value'in d?d.value:undefined;}}catch{}return undefined;}
function errorClass(error){
  const own=get(error,'name');if(classes.has(own))return own;
  const ctor=get(error,'constructor'),name=get(ctor,'name');return classes.has(name)?name:'UnknownError';
}
function classify(name,code,syscall,stage,codeName,atlasAuthRejected,selectionTimedOut){
  if(typeof code==='string' && /CERT|SELF_SIGNED|ISSUER|LEAF_SIGNATURE/.test(code))return 'CERTIFICATE_VALIDATION_FAILURE';
  if(typeof code==='string' && (/^(ERR_SSL_|ERR_TLS_HANDSHAKE)/.test(code)||code==='EPROTO'&&stage==='tls'))return 'TLS_HANDSHAKE_FAILURE';
  if(code===18||codeName==='AuthenticationFailed'||atlasAuthRejected)return 'AUTHENTICATION_FAILURE';
  if(code===13||codeName==='Unauthorized')return 'AUTHORIZATION_FAILURE';
  if(['MongoAPIError','MongoParseError','MongoInvalidArgumentError'].includes(name))return 'INVALID_CONNECTION_OPTIONS';
  if(['ENOTFOUND','ENODATA','ECONNREFUSED','ETIMEOUT','ETIMEDOUT','ESERVFAIL','EAI_AGAIN'].includes(code)&&
    (syscall==='querySrv'||stage==='dns-srv'))return 'DNS_SRV_FAILURE';
  if(['ENOTFOUND','ENODATA','ESERVFAIL','EAI_AGAIN'].includes(code))return 'DNS_HOST_FAILURE';
  if(code==='ECONNREFUSED')return 'NETWORK_REFUSED';
  if(code==='ECONNRESET')return 'NETWORK_RESET';
  if(['ETIMEDOUT','ETIMEOUT'].includes(code)||name==='MongoNetworkTimeoutError')return 'NETWORK_TIMEOUT';
  if([91,11600,11602].includes(code)||['MongoTopologyClosedError','MongoServerClosedError','MongoPoolClosedError'].includes(name))return 'CLUSTER_UNAVAILABLE';
  if(['MongoServerSelectionError','MongooseServerSelectionError'].includes(name))return selectionTimedOut?'SERVER_SELECTION_TIMEOUT':'SERVER_SELECTION_FAILURE';
  return 'UNKNOWN_CONNECTION_FAILURE';
}
export function classifyAtlasError(error,{stage='mongoose-connect',durationMs,cleanup='unknown',close='unknown'}={}){
  stage=stages.has(stage)?stage:'diagnostic';
  const evidence=[],seen=new WeakSet();let visited=0,truncated=false;
  function visit(value,depth,origin){
    if(!value||typeof value!=='object')return;
    if(depth>5||visited>=32){truncated=true;return;}if(seen.has(value))return;seen.add(value);visited++;
    const name=errorClass(value),raw=get(value,'code'),code=codes.has(raw)||numbers.has(raw)?raw:null;
    const cn=get(value,'codeName'),codeName=['AuthenticationFailed','Unauthorized','AtlasError'].includes(cn)?cn:null;
    const call=get(value,'syscall'),syscall=['querySrv','getaddrinfo','queryA','queryAAAA','connect','read','write'].includes(call)?call:null;
    // Inspect fixed signatures only; never retain/return a message or substring.
    const message=get(value,'message');
    const atlasAuthRejected=code===8000&&typeof message==='string'&&message.length<=4096&&/^bad auth\s*:\s*authentication failed\b/i.test(message);
    const selectionTimedOut=typeof message==='string'&&message.length<=4096&&/^server selection timed out after \d{1,6} ms\b/i.test(message);
    let category=classify(name,code,syscall,stage,codeName,atlasAuthRejected,selectionTimedOut);
    if(stage==='list-collections'&&code===8000&&typeof message==='string'&&message.length<=4096){
      if(/^unsupported type in filter(?:$|[\s:])/i.test(message)||/^can't get regex from filter doc\b/i.test(message))category='UNSUPPORTED_METADATA_FILTER';
      else if(/^command listCollections is not allowed\b/i.test(message))category='UNSUPPORTED_METADATA_COMMAND';
      else if(/^not authorized on two_sides_integration_test to execute command\b/i.test(message))category='AUTHORIZATION_FAILURE';
    }
    if(name!=='UnknownError'||code!==null||codeName!==null)evidence.push(Object.freeze({category,errorClass:name,code,codeName,origin}));
    for(const key of ['cause','error','reason'])visit(get(value,key),depth+1,key==='reason'?'reason':'cause');
    const servers=get(value,'servers');
    if(servers instanceof Map)try{let n=0;for(const item of Map.prototype.values.call(servers)){if(n++>=16){truncated=true;break;}visit(get(item,'error'),depth+1,'server-error');}}catch{}
    const errors=get(value,'errors');if(Array.isArray(errors))for(let i=0;i<Math.min(errors.length,16);i++)visit(errors[i],depth+1,'aggregate');
  }
  try{visit(error,0,'root');}catch{truncated=true;}
  const selected=priority.find(c=>evidence.some(e=>e.category===c))??'UNKNOWN_CONNECTION_FAILURE';
  const status=v=>['completed','failed','not-needed','unknown'].includes(v)?v:'unknown';
  return Object.freeze({schemaVersion:1,category:selected,errorClass:evidence[0]?.errorClass??'UnknownError',
    code:evidence.find(e=>e.category===selected)?.code??null,stage,
    approximateDurationMs:Number.isFinite(durationMs)?Math.round(Math.min(120000,Math.max(0,durationMs))/100)*100:null,
    cleanup:status(cleanup),close:status(close),evidence:Object.freeze(evidence),truncated});
}
