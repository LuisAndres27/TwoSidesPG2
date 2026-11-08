// Wiring: state machine login -> loading -> ready | error. No inline scripts or styles (strict CSP).
import {toDom,h} from './vdom.js';
import {createApi} from './api.js';
import {buildLogin,buildDashboard,buildStatus} from './view.js';

export function startApp({doc=document,storage=null,fetchImpl}={}){
 const api=createApi({storage,fetchImpl}),root=doc.getElementById('app'),shell=doc.getElementById('shell'),banner=doc.getElementById('mode-banner'),refreshButton=doc.getElementById('refresh'),logoutButton=doc.getElementById('logout');
 const state={phase:api.authenticated?'loading':'login',data:null,error:null,busy:false};
 const mount=node=>{root.replaceChildren(toDom(node,doc));};
 function render(){
  shell.hidden=state.phase==='login';
  refreshButton.disabled=state.phase==='loading';
  if(state.phase==='login')return mount(buildLogin({error:state.error,busy:state.busy,onSubmit:onLogin}));
  const body=[];
  if(state.phase==='loading'&&!state.data)body.push(h('div',{className:'loading',role:'status'},'Cargando estadísticas…'));
  if(state.data)body.push(buildDashboard(state.data));
  body.push(buildStatus({data:state.data,state:state.phase,error:state.error}));
  mount(h('div',{},body));
 }
 async function refresh(){
  state.phase='loading';state.error=null;render();
  try{state.data=await api.loadAll(30);state.phase='ready';}
  catch(error){
   if(error.kind==='expired'){state.phase='login';state.data=null;state.error=error.message;}
   else{state.phase='error';state.error=error.message;}
  }
  render();
 }
 async function onLogin(event){
  event.preventDefault();const form=event.target;state.busy=true;state.error=null;render();
  const account=form.elements.account?.value,credential=form.elements.credential?.value;
  try{await api.login(account,credential);state.busy=false;await refresh();}
  catch(error){state.busy=false;state.error=error.message;state.phase='login';render();}
 }
 refreshButton.addEventListener('click',()=>{if(state.phase!=='loading')refresh();});
 logoutButton.addEventListener('click',async()=>{await api.logout();state.phase='login';state.data=null;state.error=null;render();});
 banner.textContent='MODO DEMOSTRACIÓN · datos sintéticos, no son jugadores reales';
 render();if(state.phase==='loading')refresh();
 return {state,refresh};
}
if(typeof document!=='undefined'&&document.getElementById('app')){
 let storage=null;try{storage=window.sessionStorage;}catch{storage=null;}
 startApp({storage});
}
