// B84 — local demonstration composition: statistics ingestion + admin login + protected aggregate queries + static dashboard.
// MVP LOCAL ONLY. It is explicitly flagged as demo mode in every administrative response. Credentials/keys live only in memory.
import express from 'express';
import {randomUUID} from 'node:crypto';
import {generateKeyPair} from 'jose';
import {securityHeaders,rejectQuery,requireJson,parseJson,requireEmptyRequest,errorHandler} from '../../middleware/security.js';
import {RateLimiter,RATE_POLICY} from '../../middleware/rate-limiter.js';
import {authenticate} from '../../middleware/authentication.js';
import {authorize} from '../../middleware/authorization.js';
import {MemoryRepository} from '../auth/memory-repository.js';
import {CredentialHasher} from '../auth/credential-hasher.js';
import {JwtService} from '../auth/jwt-service.js';
import {sessionSchema,validateJwtBody} from '../auth/jwt-schemas.js';
import {generateCredential} from '../identity/identity.js';
import {ISOLATED_JWT} from '../../config/jwt.js';
import {ApiError} from '../../utils/errors.js';
import {createStatisticsOfflineApp} from './offline-app.js';
import {createAdminStatisticsRouter} from './admin-statistics.js';

export const DEMO_MODE=Object.freeze({demo:true,dataset:'b84-synthetic-v1',label:'MODO DEMOSTRACIÓN: datos sintéticos, no son jugadores reales'});
export const DASHBOARD_CSP="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

// An in-memory administrator for the local demonstration. The secret is generated here and returned ONCE to the caller (the launcher writes it to
// a private local file); it is never hard-coded and never logged. Tokens/keys disappear when the process ends.
export async function provisionDemoAdmin({hasher=new CredentialHasher(),now=Date.now}={}){
 const repository=new MemoryRepository({now,includeInternalEmail:false,allowSyntheticFixtures:true});
 const technicalAccountId=randomUUID(),credential=generateCredential();
 repository.seedSyntheticAccount(technicalAccountId,await hasher.hash(credential),'admin');
 return {repository,hasher,technicalAccountId,credential};
}

export async function createB84DemoApp({profile='statistics-b81-local-test',store,identities,admin,dashboardDir,now=Date.now,limiter=new RateLimiter({now}),ingestLimiter,policy=RATE_POLICY}){
 if(!admin?.repository||!admin?.hasher)throw Error('B84 requires an administrator composition');
 const pair=await generateKeyPair('RS256',{modulusLength:2048}),jwtService=new JwtService({config:{...pair,...ISOLATED_JWT,algorithm:'RS256',keyId:'b84-demo-'+randomUUID().slice(0,8)},
  repository:admin.repository,hasher:admin.hasher,limiter,policy,now});
 const app=express();app.disable('x-powered-by');app.set('trust proxy',false);app.use(securityHeaders);
 const attempts=(prefix,limit,window)=>(request,_response,next)=>{limiter.consume(prefix+':'+request.ip,limit,window);next();};
 app.get('/api/health',(_request,response)=>response.json({status:'ok',service:'two-sides-backend',mode:'demo'}));
 app.get('/api/v1/admin/mode',rejectQuery,(_request,response)=>response.json({schemaVersion:1,mode:DEMO_MODE}));
 app.post('/api/v1/admin/session',rejectQuery,attempts('b84-session',policy.sessionAttempts,policy.sessionWindow),requireJson,parseJson,async(request,response)=>{
  const result=await jwtService.session(validateJwtBody(sessionSchema,request.body),request.ip);
  // A player credential must not obtain a usable administrative session.
  const principal=await jwtService.authenticate(result.accessToken);
  if(principal.role!=='admin'){admin.repository.revokeSession(principal.sessionId);throw new ApiError(403,'forbidden');}
  response.json({schemaVersion:1,tokenType:result.tokenType,accessToken:result.accessToken,expiresIn:result.expiresIn,role:'admin',mode:DEMO_MODE});
 });
 const guards=[attempts('b84-resource',policy.meAttempts,policy.meWindow),authenticate(jwtService),authorize('admin')];
 app.post('/api/v1/admin/logout',rejectQuery,requireEmptyRequest,...guards,(request,response)=>{admin.repository.revokeSession(request.principal.sessionId);response.json({schemaVersion:1,status:'logged_out'});});
 app.use('/api/v1/admin/statistics',createAdminStatisticsRouter({repository:store,guards,now,mode:DEMO_MODE}));
 if(dashboardDir){
  app.get('/',(_request,response)=>response.redirect(302,'/dashboard/'));
  app.use('/dashboard',(_request,response,next)=>{response.set({'Content-Security-Policy':DASHBOARD_CSP,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'});next();},
   express.static(dashboardDir,{index:'index.html',dotfiles:'ignore',etag:false,redirect:true}),(_request,response)=>response.status(404).json({schemaVersion:1,error:{code:'not_found'}}));
 }
 app.use(errorHandler);
 // Ingestion keeps the unchanged B79/B81 endpoint and its own 404/error envelope (statistics-only-v1).
 app.use(createStatisticsOfflineApp({profile,identities,store,now,...(ingestLimiter?{limiter:ingestLimiter}:{})}));
 return app;
}
