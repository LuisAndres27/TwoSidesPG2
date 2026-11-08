// Reviewed private D.2 orchestrator/worker. No app/server imports and no connection on import.
(async()=>{
  const fs=await import('node:fs/promises'),path=await import('node:path'),{pathToFileURL}=await import('node:url');
  const {createHash}=await import('node:crypto');
  const project=String.raw`C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA`;
  const cwd=process.cwd(),worker=path.basename(process.argv[1]??'')==='atlas-persistence-worker.js';
  const stage=worker?Number(process.argv[2]):0;
  let claimed=false,resultPath,credential,pass;
  const report={phase:'B05.4C.2D.2',status:'blocked',stage:'private-preflight',closed:false};
  try{
    const match=/^b054c2c-([0-9a-f]{32})$/.exec(path.basename(cwd));
    if(!match||path.dirname(path.resolve(process.argv[1]))!==cwd||/[\\/]OneDrive[^\\/]*[\\/]/i.test(cwd)||
      (worker?process.argv.length!==3||![1,2].includes(stage):process.argv.length!==2))throw new Error();
    const name=worker?'worker-'+stage:'persistence';
    resultPath=path.join(cwd,name+'-result.json');
    try{await fs.access(resultPath);throw new Error();}catch(e){if(e.code!=='ENOENT')throw e;}
    const claim=await fs.open(path.join(cwd,name+'-attempt.started'),'wx');claimed=true;await claim.close();
    const manifest=JSON.parse(await fs.readFile(path.join(cwd,'preflight-manifest.json'),'utf8'));
    if(manifest.Phase!=='B05.4C.2D.2'||manifest.RunId!==match[1]||manifest.AuthenticationMechanism!=='DEFAULT'||manifest.AllowWrites!==true||
      manifest.TlsValidationRequired!==true||manifest.MaxProcedureInvocations!==1||manifest.MaxWorkerStages!==2||!Array.isArray(manifest.Dependencies))throw new Error();
    const digest=async p=>createHash('sha256').update(await fs.readFile(p)).digest('hex').toUpperCase();
    if(await digest(process.argv[1])!==(worker?manifest.WorkerSha256:manifest.ReceiverSha256))throw new Error();
    const seen=new Set();
    for(const row of manifest.Dependencies){
      if(typeof row.Relative!=='string'||!/^backend\/(src\/.*\.js|scripts\/atlas-persistence-suite\.js|tests\/(sync\/support\/.*\.(js|json)|identity-persistence\/support\/.*\.js|jwt\/env-guard\.js)|package-lock\.json)$/.test(row.Relative)||
        row.Relative.includes('..')||seen.has(row.Relative))throw new Error();
      seen.add(row.Relative);if(await digest(path.join(project,row.Relative))!==row.SHA256)throw new Error();
    }
    for(const required of ['backend/src/modules/sync/atlas-policy.js','backend/src/modules/sync/atlas-integration.js','backend/src/modules/sync/atlas-credentials.js',
      'backend/src/modules/sync/mongo-models.js','backend/src/modules/sync/mongo-ingestion-repository.js','backend/scripts/atlas-persistence-suite.js',
      'backend/tests/sync/support/fixture.js','backend/tests/sync/support/csharp-vectors.json','backend/tests/jwt/env-guard.js','backend/package-lock.json'])if(!seen.has(required))throw new Error();
    await import(pathToFileURL(path.join(project,'backend/tests/jwt/env-guard.js')).href);
    const credentials=await import(pathToFileURL(path.join(project,'backend/src/modules/sync/atlas-credentials.js')).href);
    credential=await credentials.receiveAtlasCredential(process.stdin,{timeoutMs:10000});
    report.runId=match[1];report.authenticationMechanismRequested='DEFAULT';
    if(worker){
      const {default:mongoose}=await import(pathToFileURL(path.join(project,'backend/node_modules/mongoose/index.js')).href);
      const {ATLAS_TARGET,ATLAS_URI}=await import(pathToFileURL(path.join(project,'backend/src/modules/sync/atlas-policy.js')).href);
      const {diagnosticReadonlyConnector}=await import(pathToFileURL(path.join(project,'backend/src/modules/sync/atlas-readonly-connector.js')).href);
      const {persistenceStage}=await import(pathToFileURL(path.join(project,'backend/scripts/atlas-persistence-suite.js')).href);
      try{
        await persistenceStage({stage,config:{mode:'atlas-integration-test',authorized:true,...ATLAS_TARGET,uri:ATLAS_URI,tls:true,
          runId:match[1],authMechanism:'DEFAULT',allowWrites:true,persistenceTest:'B05.4C.2D.2'},credential,
          connector:diagnosticReadonlyConnector(mongoose,d=>{report.connectionDiagnostic=d;}),checkpointPath:path.join(cwd,'synthetic-manifest.json'),report});
        report.status=report.closed?'completed':'partial';
      }catch(error){
        const {classifyAtlasError}=await import(pathToFileURL(path.join(project,'backend/src/modules/sync/atlas-error-diagnostic.js')).href);
        report.failure=classifyAtlasError(error,{stage:'diagnostic',close:report.closed?'completed':'failed'});
        report.safeServerCode=[13,18,20,50,112,251,263,303,8000,11000,40573].includes(error.code)?error.code:null;
        report.status='blocked';
      }finally{credentials.destroyAtlasCredential(credential);}
    }else{
      pass=credentials.consumeAtlasCredential(credential);
      const {spawn}=await import('node:child_process');
      report.workers=[];report.stage='worker-one';
      for(const n of [1,2]){
        if(await digest(path.join(cwd,'atlas-persistence-worker.js'))!==manifest.WorkerSha256)throw new Error();
        const bytes=Buffer.from(pass,'utf8'),length=Buffer.alloc(4);length.writeUInt32BE(bytes.length);
        const child=spawn(process.execPath,[path.join(cwd,'atlas-persistence-worker.js'),String(n)],{cwd,windowsHide:true,
          env:{SystemRoot:process.env.SystemRoot,LOCALAPPDATA:process.env.LOCALAPPDATA,NODE_ENV:'test'},stdio:['pipe','pipe','pipe']});
        let output=false;child.stdout.on('data',b=>{output=true;b.fill(0);});child.stderr.on('data',b=>{output=true;b.fill(0);});
        child.stdin.on('error',()=>{});
        const exit=new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();},65000);child.once('error',()=>{clearTimeout(timer);resolve(-1);});child.once('close',code=>{clearTimeout(timer);resolve(code);});});
        child.stdin.write(length);child.stdin.end(bytes,()=>bytes.fill(0));
        const code=await exit;bytes.fill(0);length.fill(0);
        if(code!==0||output)throw new Error();
        const result=JSON.parse(await fs.readFile(path.join(cwd,'worker-'+n+'-result.json'),'utf8'));
        report.workers.push(result);
        if(result.runId!==match[1]||result.status!=='completed'||result.closed!==true){report.stage='worker-'+n+'-stopped';break;}
        report.stage=n===1?'worker-two':'completed';
      }
      report.closed=report.workers.every(r=>r.closed===true);report.status=report.stage==='completed'?'completed':'blocked';
      report.credentialsPersisted=false;report.remoteCleanup=report.workers[1]?.cleanup??'not-executed';pass=null;
    }
    report.recordedAtUtc=new Date().toISOString();await fs.writeFile(resultPath,JSON.stringify(report,null,2),{flag:'wx',encoding:'utf8'});
  }catch{
    pass=null;if(claimed&&resultPath)try{await fs.writeFile(resultPath,JSON.stringify({phase:'B05.4C.2D.2',status:'blocked',stage:'private-channel',category:'PRIVATE_CHANNEL_FAILURE'}),{flag:'wx',encoding:'utf8'});}catch{}
    process.exitCode=1;
  }
})().catch(()=>{process.exitCode=1;});
