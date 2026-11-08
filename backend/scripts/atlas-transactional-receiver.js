// Private D.2E receiver; manually activated once. No worker processes or concurrency suite.
(async()=>{
  const fs=await import('node:fs/promises'),path=await import('node:path'),{pathToFileURL}=await import('node:url'),{createHash}=await import('node:crypto');
  const project=String.raw`C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA`;
  let claimed=false,resultPath;
  try{
    const cwd=process.cwd(),match=/^b054c2c-([0-9a-f]{32})$/.exec(path.basename(cwd));
    if(process.argv.length!==2||!match||path.dirname(path.resolve(process.argv[1]))!==cwd||/[\\/]OneDrive[^\\/]*[\\/]/i.test(cwd))throw new Error();
    resultPath=path.join(cwd,'transactional-result.json');
    try{await fs.access(resultPath);throw new Error();}catch(e){if(e.code!=='ENOENT')throw e;}
    const marker=await fs.open(path.join(cwd,'transactional-attempt.started'),'wx');claimed=true;await marker.close();
    const manifest=JSON.parse(await fs.readFile(path.join(cwd,'preflight-manifest.json'),'utf8'));
    if(manifest.Phase!=='B05.4C.2D.2E'||manifest.RunId!==match[1]||manifest.AuthenticationMechanism!=='DEFAULT'||manifest.AllowWrites!==true||
      manifest.TlsValidationRequired!==true||manifest.MaxProcedureInvocations!==1||manifest.ConcurrencyAllowed!==false||!Array.isArray(manifest.Dependencies))throw new Error();
    const digest=async p=>createHash('sha256').update(await fs.readFile(p)).digest('hex').toUpperCase();
    if(await digest(process.argv[1])!==manifest.ReceiverSha256)throw new Error();
    const seen=new Set();
    for(const row of manifest.Dependencies){
      if(typeof row.Relative!=='string'||!/^backend\/(src\/.*\.js|scripts\/atlas-transactional-suite\.js|tests\/(sync\/support\/.*\.(js|json)|identity-persistence\/support\/.*\.js|jwt\/env-guard\.js)|package-lock\.json)$/.test(row.Relative)||row.Relative.includes('..')||seen.has(row.Relative))throw new Error();
      seen.add(row.Relative);if(await digest(path.join(project,row.Relative))!==row.SHA256)throw new Error();
    }
    for(const required of ['backend/src/modules/sync/atlas-policy.js','backend/src/modules/sync/atlas-integration.js','backend/src/modules/sync/atlas-credentials.js',
      'backend/src/modules/sync/mongo-models.js','backend/src/modules/sync/mongo-ingestion-repository.js','backend/scripts/atlas-transactional-suite.js',
      'backend/tests/sync/support/fixture.js','backend/tests/sync/support/csharp-vectors.json','backend/tests/jwt/env-guard.js','backend/package-lock.json'])if(!seen.has(required))throw new Error();
    await import(pathToFileURL(path.join(project,'backend/tests/jwt/env-guard.js')).href);
    const {receiveAtlasCredential,destroyAtlasCredential}=await import(pathToFileURL(path.join(project,'backend/src/modules/sync/atlas-credentials.js')).href);
    const {ATLAS_TARGET,ATLAS_URI}=await import(pathToFileURL(path.join(project,'backend/src/modules/sync/atlas-policy.js')).href);
    const {diagnosticReadonlyConnector}=await import(pathToFileURL(path.join(project,'backend/src/modules/sync/atlas-readonly-connector.js')).href);
    const {classifyAtlasError}=await import(pathToFileURL(path.join(project,'backend/src/modules/sync/atlas-error-diagnostic.js')).href);
    const {transactionalAtlasTest}=await import(pathToFileURL(path.join(project,'backend/scripts/atlas-transactional-suite.js')).href);
    const {default:mongoose}=await import(pathToFileURL(path.join(project,'backend/node_modules/mongoose/index.js')).href);
    const credential=await receiveAtlasCredential(process.stdin,{timeoutMs:10000});
    const report={phase:'B05.4C.2D.2E',runId:match[1],status:'blocked',stage:'private-preflight',authenticationMechanismRequested:'DEFAULT',concurrencyExecuted:false};
    try{
      await transactionalAtlasTest({config:{mode:'atlas-integration-test',authorized:true,...ATLAS_TARGET,uri:ATLAS_URI,tls:true,
        runId:match[1],authMechanism:'DEFAULT',allowWrites:true,persistenceTest:'B05.4C.2D.2E'},credential,
        connector:diagnosticReadonlyConnector(mongoose,d=>{report.connectionDiagnostic=d;}),manifestPath:path.join(cwd,'synthetic-manifest.json'),report});
      report.status=report.closed?'completed':'partial';
    }catch(error){
      report.diagnostic=classifyAtlasError(error,{stage:report.stage==='metadata-preflight'?'list-collections':'diagnostic',close:report.closed?'completed':'failed'});
      report.safeServerCode=[13,18,20,50,112,251,263,303,8000,11000,40573].includes(error.code)?error.code:null;
      report.cleanup='not-completed-preserve-owned-data';
    }finally{destroyAtlasCredential(credential);}
    report.recordedAtUtc=new Date().toISOString();await fs.writeFile(resultPath,JSON.stringify(report,null,2),{flag:'wx',encoding:'utf8'});
  }catch{
    if(claimed&&resultPath)try{await fs.writeFile(resultPath,JSON.stringify({phase:'B05.4C.2D.2E',status:'blocked',category:'PRIVATE_CHANNEL_FAILURE'}),{flag:'wx',encoding:'utf8'});}catch{}
    process.exitCode=1;
  }
})().catch(()=>{process.exitCode=1;});
