import './isolation-guard.js';
import { importJWK, jwtVerify } from 'jose';
import { mongoDouble } from './mongo-double.js';
import { resolveSyncContext } from '../../../src/middleware/sync-auth-context.js';

// Isolated child exercises the REAL repository on an IPC snapshot double.
// Parent publishes the resulting image before its held commit CAS. No Mongo/socket/files.
process.once('message',async input=>{
  try {
    const db=mongoDouble();db.rows=input.rows;
    const now=()=>input.now,identity=db.identityFactory({now});
    const {payload}=await jwtVerify(input.token,await importJWK(input.publicKey,'RS256'),{
      algorithms:['RS256'],issuer:input.issuer,audience:input.audience,currentDate:new Date(input.now)});
    const ctx=await resolveSyncContext({id:payload.sub,role:payload.role,sessionId:payload.jti},input.token,identity,now);
    await identity.revoke(ctx,{commandId:input.commandId});
    process.send({ok:true,rows:db.rows},()=>process.disconnect());
  }catch{process.send({ok:false},()=>process.disconnect());}
});
