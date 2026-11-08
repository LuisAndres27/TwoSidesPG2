import {describe,it,expect} from 'vitest';
import {value} from './b80-fixture.js';
// Reusable semantic contract. Future adapters supply a disposable factory with the same methods.
export function statisticsRepositoryContract(name,factory){
 describe(name,()=>{
  it('commits contributions and one reconstructible receipt',async()=>{const f=await factory();try{const v=value();expect((await f.repository.commit(v)).status).toBe('accepted');expect((await f.repository.commit(v)).status).toBe('duplicate');const s=await f.adapter.readCommitted();expect(s.counts['all|events']).toBe(1);expect(Object.keys(s.receipts)).toHaveLength(1);expect(Object.values(s.receipts)[0].hash).toBe(v.hash);}finally{await f.close();}});
  it('does not lose 100 concurrent increments of the same total',async()=>{const f=await factory();try{const vv=Array.from({length:100},()=>value());const r=await Promise.all(vv.map(v=>f.repository.commit(v)));expect(r.every(x=>x.status==='accepted')).toBe(true);const s=await f.adapter.readCommitted();expect(s.counts['all|events']).toBe(100);expect(s.counts['all|effective_ms']).toBe(3000000);expect(Object.keys(s.receipts)).toHaveLength(100);}finally{await f.close();}});
  it('serializes two copies without double counting',async()=>{const f=await factory();try{const v=value();const r=await Promise.all([f.repository.commit(v),f.repository.commit(v)]);expect(r.map(x=>x.status).sort()).toEqual(['accepted','duplicate']);expect((await f.repository.aggregates())['all|events']).toBe(1);}finally{await f.close();}});
  it('does not expose mutable committed state',async()=>{const f=await factory();try{await f.repository.commit(value());const a=await f.adapter.readCommitted();a.counts['all|events']=999;expect((await f.repository.aggregates())['all|events']).toBe(1);}finally{await f.close();}});
  it('rejects an inconsistent multi-counter transaction atomically',async()=>{const f=await factory();try{await expect(f.adapter.runAtomic(tx=>tx.increment('all','games_completed',1))).rejects.toThrow();const s=await f.adapter.readCommitted();expect(s.counts).toEqual({});expect(Object.keys(s.receipts)).toHaveLength(0);}finally{await f.close();}});
 });
}
