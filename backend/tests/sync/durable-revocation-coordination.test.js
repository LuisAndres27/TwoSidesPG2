import './support/isolation-guard.js';
import {afterEach,expect,it} from 'vitest';
import {spawn} from 'node:child_process';
import {RevocationModel} from './support/revocation-coordination-model.js';
import {fixture,resources} from './support/fixture.js';
afterEach(async()=>{for(const f of resources.splice(0))await f.close();});
function setup(){const m=new RevocationModel();m.addOwner('alice');m.addOwner('bob');return {m,c:m.context('alice')};}
const commitOp=(m,c,id='op')=>{const tx=m.begin();m.stageOperation(tx,c,id,'payload');return m.commit(tx)[0];};
const revoke=(m,kind='identity',owner='alice')=>{const tx=m.begin();m.stageRevocation(tx,owner,kind);return m.commit(tx);};
const rejects=(fn,code)=>{try{fn();throw new Error('Expected model rejection');}catch(e){expect(e.code).toBe(code);}};
it('RVC01 authorized operation commits receipt in MODEL',()=>{const {m,c}=setup();expect(commitOp(m,c)).toEqual(m.receipt('alice','op'));});
it('RVC02 revocation before authorization rejects and produces no receipt',()=>{const {m,c}=setup();revoke(m);rejects(()=>commitOp(m,c),'unauthorized');expect(m.receipt('alice','op')).toBeNull();});
it('RVC03 revocation after snapshot before staging cannot commit a stale guarded operation',()=>{const {m,c}=setup(),tx=m.begin();revoke(m);m.stageOperation(tx,c,'op','payload');rejects(()=>m.commit(tx),'write-conflict');expect(m.receipt('alice','op')).toBeNull();});
it('RVC04 revocation after staging before commit conflicts and retry revalidates',()=>{const {m,c}=setup(),tx=m.begin();m.stageOperation(tx,c,'op','payload');revoke(m);rejects(()=>m.commit(tx),'write-conflict');rejects(()=>commitOp(m,c),'unauthorized');});
it('RVC05 operation first remains committed after revocation; no retroactive deletion',()=>{const {m,c}=setup(),receipt=commitOp(m,c);revoke(m);expect(m.receipt('alice','op')).toEqual(receipt);expect(m.audit.map(e=>e.kind)).toEqual(['operation','revocation']);});
it('RVC06 two operations share a guard; loser retries against fresh revision',()=>{const {m,c}=setup(),a=m.begin(),b=m.begin();m.stageOperation(a,c,'a','payload');m.stageOperation(b,c,'b','payload');m.commit(a);rejects(()=>m.commit(b),'write-conflict');commitOp(m,c,'b');expect(m.operations.size).toBe(2);});
it('RVC07 revocation racing two staged operations prevents both stale commits',()=>{const {m,c}=setup(),a=m.begin(),b=m.begin();m.stageOperation(a,c,'a','payload');m.stageOperation(b,c,'b','payload');revoke(m);for(const tx of [a,b])rejects(()=>m.commit(tx),'write-conflict');expect(m.operations.size).toBe(0);});
it('RVC08 restart from committed image preserves revocation, not just signing keys (MODEL)',()=>{const {m,c}=setup();revoke(m);const restarted=new RevocationModel(m.image());rejects(()=>commitOp(restarted,c),'unauthorized');});
it('RVC09 real JWT-v2 issued before identity revoke is rejected by existing auth service',async()=>{const f=await fixture();await f.identity.revokeIdentity(f.accountId);await expect(f.auth.authenticate(f.token)).rejects.toMatchObject({status:401});});
it('RVC10 real JWT expiration remains enforced by existing auth service',async()=>{const f=await fixture();f.clock.value+=900001;await expect(f.auth.authenticate(f.token)).rejects.toMatchObject({status:401});});
it('RVC11 unlink invalidates old installation/profile generation',()=>{const {m,c}=setup();revoke(m,'unlink');rejects(()=>commitOp(m,c),'unauthorized');});
it('RVC12 generation change rejects old context, fresh context can act',()=>{const {m,c}=setup();revoke(m,'generation');rejects(()=>commitOp(m,c),'unauthorized');expect(commitOp(m,m.context('alice'))).toBeTruthy();});
it('RVC13 transaction error leaves no operation, receipt, or guard change',()=>{const {m,c}=setup(),image=m.image(),tx=m.begin();m.stageOperation(tx,c,'op','payload');rejects(()=>m.commit(tx,{failure:'before'}),'storage-unavailable');expect(m.image()).toEqual(image);});
it('RVC14 stale revision write-conflict is observable, not a committed ACK',()=>{const {m,c}=setup(),tx=m.begin();m.stageOperation(tx,c,'op','payload');commitOp(m,c,'other');rejects(()=>m.commit(tx),'write-conflict');expect(m.receipt('alice','op')).toBeNull();});
it('RVC15 retries are bounded and exhausted conflicts do not loop',()=>{const {m,c}=setup();let calls=0;rejects(()=>m.retry(tx=>{calls++;m.stageOperation(tx,c,'op','payload');commitOp(m,c,'contender-'+calls);return m.commit(tx);},{attempts:2}),'write-conflict');expect(calls).toBe(2);expect(m.receipt('alice','op')).toBeNull();});
it('RVC16 unknown-after-commit preserves receipt; no inference of rollback',()=>{const {m,c}=setup(),tx=m.begin();m.stageOperation(tx,c,'op','payload');rejects(()=>m.commit(tx,{failure:'unknown-after'}),'unknown-commit');const receipt=m.receipt('alice','op');expect(receipt).not.toBeNull();expect(commitOp(m,c)).toEqual(receipt);});
it('RVC17 committed receipt survives revocation and image restart, without disclosure to revoked caller',()=>{const {m,c}=setup(),receipt=commitOp(m,c);revoke(m);const next=new RevocationModel(m.image());expect(next.receipt('alice','op')).toEqual(receipt);rejects(()=>commitOp(next,c),'unauthorized');});
it('RVC18 explicit abort changes neither authorization revision nor receipt',()=>{const {m,c}=setup(),image=m.image(),tx=m.begin();m.stageOperation(tx,c,'op','payload');m.abort(tx);expect(m.image()).toEqual(image);rejects(()=>m.commit(tx),'transaction-closed');});
it('RVC19 owners use independent guards and receipts; admin escalation is rejected',()=>{const {m,c}=setup(),a=m.begin(),b=m.begin();m.stageOperation(a,c,'same','a');m.stageOperation(b,m.context('bob'),'same','b');m.commit(a);m.commit(b);expect(m.receipt('alice','same').owner).toBe('alice');expect(m.receipt('bob','same').owner).toBe('bob');rejects(()=>commitOp(m,{...c,role:'admin'}),'unauthorized');});
it('RVC20 revocation request from another OS process wins over staged operation in central MODEL',async()=>{
  const {m,c}=setup(),tx=m.begin();m.stageOperation(tx,c,'op','payload');
  // The child requests a revocation over IPC. The central double owns atomic state;
  // this proves process message ordering, NOT shared Mongo locks or disk durability.
  const script="process.send({kind:'revoke',owner:'alice'});process.on('message',m=>{if(m.kind==='confirmed')process.disconnect();});";
  const child=spawn(process.execPath,['-e',script],{windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});let output=false;child.stdout.on('data',()=>{output=true;});child.stderr.on('data',()=>{output=true;});
  try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('Synthetic IPC timeout'));},5000);
    child.on('message',message=>{if(message.kind==='revoke'&&message.owner==='alice'){revoke(m);child.send({kind:'confirmed'});}});
    child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('Synthetic child failure'));});});
    expect(output).toBe(false);rejects(()=>m.commit(tx),'write-conflict');expect(m.receipt('alice','op')).toBeNull();
  }finally{if(child.exitCode===null)child.kill();}
});
it('RVC21 snapshot read without shared write permits the original anomaly (negative control)',()=>{const {m,c}=setup(),tx=m.begin();m.stageOperation(tx,c,'op','payload',{touch:false});revoke(m);expect(m.commit(tx)[0]).toBeTruthy();expect(m.audit.map(e=>e.kind)).toEqual(['revocation','operation']);});
it('RVC22 stale revocation cannot overwrite an earlier committed operation guard; retries preserve receipt',()=>{const {m,c}=setup(),r=m.begin();m.stageRevocation(r,'alice');const receipt=commitOp(m,c);rejects(()=>m.commit(r),'write-conflict');revoke(m);expect(m.receipt('alice','op')).toEqual(receipt);});
it('RVC23 session and credential revocation participate in the same shared write domain',()=>{for(const kind of ['session','credential']){const {m,c}=setup(),tx=m.begin();m.stageOperation(tx,c,'op','payload');revoke(m,kind);rejects(()=>m.commit(tx),'write-conflict');rejects(()=>commitOp(m,c),'unauthorized');}});
it('RVC24 expired context before logical MODEL commit cannot produce a receipt',()=>{const {m,c}=setup(),tx=m.begin();m.stageOperation(tx,c,'op','payload');m.now=10000;rejects(()=>m.commit(tx),'unauthorized');expect(m.receipt('alice','op')).toBeNull();});
function interleave(a,b){if(!a.length)return [b];if(!b.length)return [a];return [...interleave(a.slice(1),b).map(t=>[a[0],...t]),...interleave(a,b.slice(1)).map(t=>[b[0],...t])];}
const schedules=interleave(['ob','os','oc'],['rb','rs','rc']);
for(const [index,schedule]of schedules.entries())it('RVC-S'+String(index+1).padStart(2,'0')+' explores '+schedule.join('/'),()=>{
  const {m,c}=setup();let o,r,operationFailed=false,revocationFailed=false;
  for(const step of schedule){try{
    if(step==='ob')o=m.begin();if(step==='os')m.stageOperation(o,c,'op','payload');if(step==='oc'&&!operationFailed)m.commit(o);
    if(step==='rb')r=m.begin();if(step==='rs')m.stageRevocation(r,'alice');if(step==='rc')m.commit(r);
  }catch(e){expect(['unauthorized','write-conflict']).toContain(e.code);if(step[0]==='o')operationFailed=true;else revocationFailed=true;}}
  // Complete failed revocation using a fresh transaction; never reuse a stale snapshot.
  if(revocationFailed)revoke(m);
  const rev=m.audit.find(e=>e.kind==='revocation'),op=m.audit.find(e=>e.kind==='operation');
  expect(rev).toBeTruthy();if(op)expect(op.sequence).toBeLessThan(rev.sequence);
  else expect(m.receipt('alice','op')).toBeNull();
});
