// API client. The bearer token lives in memory (and sessionStorage, per tab, so a reload keeps the session). It is never logged and
// the browser never talks to MongoDB: only to the Express backend of the same origin.
const KEY='b84.admin.session';
export class DashboardError extends Error{constructor(kind,message,status){super(message);this.kind=kind;this.status=status;}}
const MESSAGES={
 network:'No se pudo conectar con el servidor de estadísticas. Comprueba que el backend local esté en ejecución.',
 credentials:'Credenciales no válidas.',expired:'Tu sesión expiró. Inicia sesión de nuevo.',forbidden:'Esta cuenta no tiene permiso de administrador.',
 rate:'Demasiados intentos. Espera un minuto e inténtalo de nuevo.',unavailable:'La base de estadísticas no está disponible en este momento.',
 invalid:'Solicitud no válida.',server:'El servidor devolvió un error inesperado.'};
export const ENDPOINTS=Object.freeze({overview:'/api/v1/admin/statistics/overview',biomes:'/api/v1/admin/statistics/biomes',decisions:'/api/v1/admin/statistics/decisions',
 endings:'/api/v1/admin/statistics/endings',timeseries:'/api/v1/admin/statistics/timeseries',status:'/api/v1/admin/statistics/status'});

export function createApi({fetchImpl=(...a)=>globalThis.fetch(...a),storage=null,base=''}={}){
 let token=null;
 try{token=storage?.getItem(KEY)||null;}catch{token=null;}
 const remember=value=>{token=value;try{if(value)storage?.setItem(KEY,value);else storage?.removeItem(KEY);}catch{/* storage is only a convenience */}};
 const classify=(status,context)=>status===401?(context==='login'?'credentials':'expired'):status===403?'forbidden':status===429?'rate':status===503?'unavailable':status===400?'invalid':'server';
 async function call(method,path,{body,context='resource'}={}){
  let response;
  try{response=await fetchImpl(base+path,{method,headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...(token&&context!=='login'?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'omit'});}
  catch{throw new DashboardError('network',MESSAGES.network);}
  if(!response.ok){const kind=classify(response.status,context);if(kind==='expired')remember(null);throw new DashboardError(kind,MESSAGES[kind],response.status);}
  try{return await response.json();}catch{throw new DashboardError('server',MESSAGES.server,response.status);}
 }
 return {
  get authenticated(){return token!==null;},
  async login(technicalAccountId,credential){
   const result=await call('POST','/api/v1/admin/session',{context:'login',body:{schemaVersion:1,technicalAccountId:String(technicalAccountId).trim(),credential:String(credential).trim()}});
   if(typeof result.accessToken!=='string')throw new DashboardError('server',MESSAGES.server);
   remember(result.accessToken);return {expiresIn:result.expiresIn};
  },
  async logout(){try{if(token)await call('POST','/api/v1/admin/logout');}catch{/* the local session is discarded either way */}remember(null);},
  async loadAll(days=30){
   const [overview,biomes,decisions,endings,timeseries,status]=await Promise.all([
    call('GET',ENDPOINTS.overview),call('GET',ENDPOINTS.biomes),call('GET',ENDPOINTS.decisions),call('GET',ENDPOINTS.endings),call('GET',ENDPOINTS.timeseries+'?days='+days),call('GET',ENDPOINTS.status)]);
   return {overview:overview.data,biomes:biomes.data,decisions:decisions.data,endings:endings.data,timeseries:timeseries.data,status:status.data,mode:overview.mode,generatedAt:overview.generatedAt};
  },
 };
}
