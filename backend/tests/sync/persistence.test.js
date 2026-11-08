import './support/isolation-guard.js';
import { expect,it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { batch,clone,vectors } from './support/fixture.js';
import { persistentFixture,runChild } from './support/persistence-fixture.js';

it('T15 encrypted receipt survives independent HTTP receiver processes',async()=>{
  const f=await persistentFixture();try{
    const body=batch([vectors.operations[0]]);
    const first=await runChild({...f.input,body});expect(first.status).toBe(200);
    const again=await runChild({...f.input,body});expect(again.status).toBe(200);
    expect(again.body.results[0].receipt).toEqual(first.body.results[0].receipt);expect(again.facts).toBe(1);expect(again.operations).toBe(1);
  }finally{f.close();}
},60000);
it('D01 lost ACK plus fresh receiver preserves exactly the committed receipt',async()=>{
  const f=await persistentFixture();try{
    let lost=true;f.repository.afterCommit=async()=>{if(lost){lost=false;throw new Error('lost response');}};
    const body=batch([vectors.operations[0]]);expect((await f.service.batches(f.context,body)).status).toBe(503);
    const core=(await f.repository.snapshot()).operations[0].receipt;
    const response=await runChild({...f.input,body});expect(response.status).toBe(200);expect(response.body.results[0].receipt).toEqual(core);expect(response.facts).toBe(1);
  }finally{f.close();}
},60000);
it('D02 concurrent durable processes serialize or retry without duplicated effects',async()=>{
  const f=await persistentFixture();try{
    const body=batch([vectors.operations[0]]);const results=await Promise.all([runChild({...f.input,body}),runChild({...f.input,body})]);
    expect(results.every(r=>[200,503].includes(r.status))).toBe(true);
    // The fail-closed file adapter may reject BOTH contenders. The contract permits
    // a stable retry; it does not promise a winner in every initial overlap.
    const accepted=results.filter(r=>r.status===200);
    if(!accepted.length){const retry=await runChild({...f.input,body});expect(retry.status).toBe(200);accepted.push(retry);}
    const confirmed=await runChild({...f.input,body});expect(confirmed.status).toBe(200);
    expect(confirmed.operations).toBe(1);expect(confirmed.facts).toBe(1);
    for(const response of accepted)expect(response.body.results[0].receipt).toEqual(confirmed.body.results[0].receipt);
  }finally{f.close();}
},60000);
it('D03 encrypted snapshot corruption fails closed without replacement',async()=>{
  const f=await persistentFixture();try{
    const file=path.join(f.directory,'ingestion.bin');await fs.writeFile(file,'synthetic corrupted ciphertext');
    const before=await fs.readFile(file);await expect(f.repository.snapshot()).rejects.toMatchObject({httpStatus:503});expect(await fs.readFile(file)).toEqual(before);
  }finally{f.close();}
},60000);
it('D04 private synthetic store rejects project and runtime paths before opening',async()=>{
  const f=await persistentFixture();try{
    const {EncryptedStore}=await import('../identity-persistence/support/encrypted-store.js');
    for(const directory of [process.cwd(),path.resolve('../local-persistence/.work/runtime-game')])expect(()=>new EncryptedStore({directory,name:'ingestion',masterKey:f.masterKey,synthetic:true})).toThrow();
    const raw=await fs.readFile(path.join(f.directory,'ingestion.bin'),'utf8');expect(raw).not.toContain(f.token);expect(raw).not.toContain(f.accountId);
  }finally{f.close();}
},60000);
it('D05 precommit process crash preserves prior snapshot and residual lock blocks writes',async()=>{
  const f=await persistentFixture();try{
    const before=await f.repository.snapshot();const body=batch([vectors.operations[0]]);
    expect((await runChild({...f.input,body,mode:'crash-before-commit'})).exit).toBe(74);
    expect(await f.repository.snapshot()).toEqual(before);
    const later=await f.service.batches(f.context,body);expect(later.status).toBe(503);expect(await f.repository.snapshot()).toEqual(before);
  }finally{f.close();}
},60000);
it('D06 postcommit crash retains receipt and fails closed until explicit lock recovery',async()=>{
  const f=await persistentFixture();try{
    const body=batch([vectors.operations[0]]);expect((await runChild({...f.input,body,mode:'crash-after-commit'})).exit).toBe(74);
    const snapshot=await f.repository.snapshot();expect(snapshot.operations).toHaveLength(1);expect(snapshot.facts).toHaveLength(1);
    expect((await f.service.batches(f.context,body)).status).toBe(503);expect(await f.repository.snapshot()).toEqual(snapshot);
  }finally{f.close();}
},60000);
it('D07 revocation persists and a new HTTP process cannot reuse its JWT',async()=>{
  const f=await persistentFixture();try{
    const body=batch([vectors.operations[0]]);expect((await runChild({...f.input,body})).status).toBe(200);
    await f.identity.revokeIdentity(f.accountId);const after=await runChild({...f.input,body});expect(after.status).toBe(401);expect(after.operations).toBe(1);
  }finally{f.close();}
},60000);
