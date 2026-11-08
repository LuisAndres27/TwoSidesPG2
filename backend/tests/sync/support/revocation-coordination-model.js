// Test-only optimistic transaction MODEL. No MongoDB, files, keys, tokens or production adapter.
// Its atomic CAS and durable-image assumptions are exactly what future Mongo tests must prove.
const copy=value=>structuredClone(value);
export class ModelError extends Error{constructor(code){super(code);this.code=code;}}
const fail=code=>{throw new ModelError(code);};
export class RevocationModel{
  constructor(image){
    this.now=1000;this.sequence=image?.sequence??0;this.audit=copy(image?.audit??[]);
    this.guards=new Map(copy(image?.guards??[]));this.operations=new Map(copy(image?.operations??[]));
  }
  addOwner(owner){this.guards.set(owner,{owner,revision:0,active:true,role:'player',installationId:'install-'+owner,
    localPlayerId:'profile-'+owner,bindingGeneration:1,authzVersion:1,credentialVersion:1,
    session:{id:'session-'+owner,active:true,expiresAt:10000}});}
  context(owner){const g=this.guards.get(owner);return {owner,role:'player',installationId:g.installationId,
    localPlayerId:g.localPlayerId,bindingGeneration:g.bindingGeneration,authzVersion:g.authzVersion,
    credentialVersion:g.credentialVersion,sessionId:g.session.id,expiresAt:g.session.expiresAt};}
  begin(){return {snapshot:new Map(copy([...this.guards])),versions:new Map([...this.guards].map(([k,g])=>[k,g.revision])),
    touched:new Set(),pending:[],revocations:[],closed:false};}
  authorize(tx,c){
    const g=tx.snapshot.get(c.owner);
    if(!g||!g.active||g.role!=='player'||c.role!=='player'||!g.session.active||g.session.id!==c.sessionId||
      this.now>=Math.min(c.expiresAt,g.session.expiresAt)||['installationId','localPlayerId','bindingGeneration','authzVersion','credentialVersion'].some(k=>g[k]!==c[k]))fail('unauthorized');
    return g;
  }
  stageOperation(tx,c,id,payload,{touch=true}={}){
    const g=this.authorize(tx,c);if(touch)tx.touched.add(c.owner);
    tx.pending.push({owner:c.owner,id,payload,context:copy(c),guarded:touch});
    return g.revision;
  }
  stageRevocation(tx,owner,kind='identity'){
    const g=tx.snapshot.get(owner);if(!g)fail('unknown-owner');
    tx.touched.add(owner);tx.revocations.push({owner,kind});
    if(kind==='identity'){g.active=false;g.authzVersion++;}
    else if(kind==='session')g.session.active=false;
    else if(kind==='unlink'){g.installationId='unlinked';g.bindingGeneration++;}
    else if(kind==='generation')g.authzVersion++;
    else if(kind==='credential')g.credentialVersion++;
    else fail('invalid-kind');
  }
  commit(tx,{failure}={}){
    if(tx.closed)fail('transaction-closed');
    for(const owner of tx.touched)if(this.guards.get(owner)?.revision!==tx.versions.get(owner)){tx.closed=true;fail('write-conflict');}
    // Expiry is checked at this MODEL's atomic logical point, not an HTTP response time.
    for(const p of tx.pending)if(p.guarded)this.authorize(tx,p.context);
    for(const p of tx.pending){const old=this.operations.get(p.owner+':'+p.id);if(old&&old.payload!==p.payload){tx.closed=true;fail('idempotency-conflict');}}
    if(failure==='before'){tx.closed=true;fail('storage-unavailable');}
    const sequence=++this.sequence,receipts=[];
    for(const owner of tx.touched){const g=copy(tx.snapshot.get(owner));g.revision=this.guards.get(owner).revision+1;this.guards.set(owner,g);}
    for(const p of tx.pending){
      const key=p.owner+':'+p.id,old=this.operations.get(key);
      if(old)receipts.push(copy(old.receipt));else{
        const receipt={owner:p.owner,id:p.id,serial:sequence};this.operations.set(key,{owner:p.owner,id:p.id,payload:p.payload,receipt});receipts.push(copy(receipt));
        this.audit.push({kind:'operation',owner:p.owner,id:p.id,sequence});
      }
    }
    for(const r of tx.revocations)this.audit.push({kind:'revocation',owner:r.owner,sequence});
    tx.closed=true;if(failure==='unknown-after')fail('unknown-commit');return receipts;
  }
  abort(tx){tx.closed=true;}
  receipt(owner,id){return copy(this.operations.get(owner+':'+id)?.receipt??null);}
  image(){return copy({guards:[...this.guards],operations:[...this.operations],audit:this.audit,sequence:this.sequence});}
  retry(work,{attempts=2}={}){
    if(!Number.isInteger(attempts)||attempts<1||attempts>3)fail('invalid-budget');
    for(let i=0;i<attempts;i++)try{return work(this.begin(),i);}catch(e){if(e.code!=='write-conflict'||i===attempts-1)throw e;}
  }
}
