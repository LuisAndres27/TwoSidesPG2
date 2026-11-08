import express from 'express';
import { randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { authenticate } from '../../middleware/authentication.js';
import { authorize } from '../../middleware/authorization.js';
import { syncAuthContext } from '../../middleware/sync-auth-context.js';
import { ApiError } from '../../utils/errors.js';
import { IngestionError } from './errors.js';
import { parseStrict } from './canonical-envelope.js';
import { IngestionService } from './ingestion-service.js';
import {isMainRepository} from '../../main/policy.js';

export function createSyncRouter({jwtService,identityRepository,repository,limiter,now,operationBudgetMs,batchBudgetMs}) {
  if(repository?.synthetic!==true&&!isMainRepository(repository))throw new Error('Verified sync repository required');
  const service=new IngestionService({repository,identityRepository,operationBudgetMs,batchBudgetMs});
  const router=express.Router();
  router.use((req,_res,next)=>{
    if(req.originalUrl.includes('?'))return next(new IngestionError(400,'invalid_request'));
    if(!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(req.headers['content-type']??'') ||
       !['identity',undefined].includes(req.headers['content-encoding']))return next(new IngestionError(415,'unsupported_media_type'));
    if(Number(req.headers['content-length']??0)>256*1024)return next(new IngestionError(413,'payload_too_large'));
    try{limiter.check('sync-ip:'+req.ip,60,60000);next();}catch(error){next(error);}
  });
  const verify=authenticate(jwtService);
  router.use((req,res,next)=>verify(req,res,error=>{
    if(error){try{limiter.consume('sync-ip:'+req.ip,60,60000);}catch(quota){return next(quota);}}
    next(error);
  }),authorize('player'),syncAuthContext(identityRepository,now));
  router.use((req,_res,next)=>{try{limiter.consume('sync-owner:'+req.syncContext.technicalAccountId,120,60000);next();}catch(e){next(e);}});
  router.use(express.raw({limit:256*1024,type:'application/json',inflate:false}));
  router.use((req,_res,next)=>{
    try{if(!Buffer.isBuffer(req.body))throw new IngestionError(400,'invalid_request');
      req.body=parseStrict(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(req.body));next();
    }catch{next(new IngestionError(400,'invalid_request'));}
  });
  router.post('/batches',async(req,res)=>{
    const result=await service.batches(req.syncContext,req.body);
    if([429,503].includes(result.status))res.set('Retry-After','1');
    if(result.status===401)res.set('WWW-Authenticate','Bearer');
    res.status(result.status).json(result.body);
  });
  router.post('/receipts/query',async(req,res)=>res.json(await service.receipts(req.syncContext,req.body)));
  router.use((error,_req,res,_next)=>{
    if(res.headersSent){res.destroy();return;}
    const known=error instanceof IngestionError||error instanceof ApiError;
    const malformed=['request.aborted','request.size.invalid','entity.parse.failed'].includes(error.type);
    const status=error.type==='entity.too.large'?413:malformed?400:known?(error.httpStatus??error.status):['encoding.unsupported','charset.unsupported'].includes(error.type)?415:500;
    const code=error.type==='entity.too.large'?'payload_too_large':malformed?'invalid_request':known?error.code:'internal_error';
    const retryable=[429,500,503].includes(status);
    if(retryable)res.set('Retry-After','1');if(status===401)res.set('WWW-Authenticate','Bearer');
    res.status(status).json({schemaVersion:2,error:{code,message:'Sync request unavailable.',retryable},requestId:randomUUID()});
  });
  return router;
}
