// Real Edge/CDP verification. Fresh disposable profile; never an owner's browser profile.
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {privateData} from './runtime.mjs';
const root=path.resolve('.work/b85'),profile=path.join(root,'edge-profile-'+Date.now());await mkdir(profile,{recursive:true});
let healthy=false;for(let i=0;i<90;i++){try{const r=await fetch('http://127.0.0.1:4185/api/health',{signal:AbortSignal.timeout(3000)});if(r.ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,2000));}if(!healthy)throw Error('B85_METABASE_UNAVAILABLE');
const c=await privateData(),objects=JSON.parse(await readFile(path.join(root,'metabase-objects.json'),'utf8'));
const port=19385,origin='http://127.0.0.1:4185';let ws,edge;
const pause=ms=>new Promise(r=>setTimeout(r,ms)),pending=new Map();let next=0;const network={queries:0,errors:[],blocked:[]};
try{
 edge=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check','--disable-sync','--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let target;for(let i=0;i<40;i++){try{const a=await(await fetch('http://127.0.0.1:'+port+'/json')).json();target=a.find(t=>t.type==='page');if(target)break;}catch{}await pause(500);}if(!target)throw Error('B85_EDGE_START_FAILED');
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 function call(method,params={}){return new Promise((resolve,reject)=>{const id=++next,t=setTimeout(()=>{pending.delete(id);reject(Error('CDP_TIMEOUT_'+method));},90000);pending.set(id,{resolve:v=>{clearTimeout(t);resolve(v);},reject});ws.send(JSON.stringify({id,method,params}));});}
 ws.onmessage=async event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error('CDP_'+m.error.code)):p.resolve(m.result);}return;}
  if(m.method==='Fetch.requestPaused'){const u=m.params.request.url;const allowed=u.startsWith(origin+'/')||u.startsWith('data:')||u.startsWith('blob:'+origin);if(!allowed){network.blocked.push(new URL(u).hostname);await call('Fetch.failRequest',{requestId:m.params.requestId,errorReason:'BlockedByClient'});}else await call('Fetch.continueRequest',{requestId:m.params.requestId});}
  if(m.method==='Network.responseReceived'){const r=m.params.response;if(/\/api\/.*query/.test(r.url))network.queries++;if(r.status>=400)network.errors.push({path:new URL(r.url).pathname,status:r.status});}
 };
 await call('Page.enable');await call('Runtime.enable');await call('Network.enable');await call('Fetch.enable',{patterns:[{urlPattern:'*'}]});await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
 const evalJs=async expression=>(await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value;
 await call('Page.navigate',{url:origin+'/auth/login'});let login=false;for(let i=0;i<90;i++){if(await evalJs('Boolean(document.querySelector("input[type=password]"))')){login=true;break;}await pause(1000);}if(!login)throw Error('B85_LOGIN_UI_NOT_LOADED');
 // Credentials sent in browser request body/RAM, never arguments, logs or screenshot.
 const logged=await evalJs(`(async()=>{const r=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:${JSON.stringify(c.metabaseEmail)},password:${JSON.stringify(c.metabasePassword)}})});return r.status===200;})()`);if(!logged)throw Error('B85_BROWSER_LOGIN_FAILED');
 await call('Page.navigate',{url:origin+'/dashboard/'+objects.dashboardId});
 for(let i=0;i<120;i++){const text=await evalJs('document.body.innerText');if(text?.includes('DEMOSTRACIÓN')&&text.includes('Instalaciones sintéticas'))break;await pause(1000);}
 await pause(15000);
 const scroll=async where=>evalJs(`(()=>{const elements=[document.scrollingElement,...document.querySelectorAll('*')].filter(e=>e&&e.scrollHeight>e.clientHeight+500&&e.clientHeight>200);for(const e of elements)e.scrollTop=${where==='bottom'?'e.scrollHeight':where==='middle'?'e.scrollHeight/2':'0'};return elements.length;})()`);
 for(const position of ['top','middle','bottom','top']){await scroll(position);await pause(6000);const screenshot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(root,'dashboard-'+position+'.png'),Buffer.from(screenshot.data,'base64'));}
 const text=await evalJs('document.body.innerText');
 const result={browser:'Microsoft Edge headless (real Chromium)',loginUi:true,login:true,syntheticBanner:text.includes('DEMOSTRACIÓN'),fiveBiomes:['Océano','Selva','Desierto','Bosque','Tundra'].every(x=>text.includes(x)),charts:await evalJs('document.querySelectorAll("svg").length'),cardQueries:network.queries,errors:network.errors,blockedExternalHosts:[...new Set(network.blocked)],renderedText:text};
 await writeFile(path.join(root,'browser-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,renderedText:undefined}));
 await call('Browser.close').catch(()=>{});
}finally{try{ws?.close();}catch{}if(edge){await pause(1500);if(edge.exitCode===null)edge.kill();}await pause(1000);if(profile.startsWith(root+path.sep))await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:500}).catch(()=>{});}
