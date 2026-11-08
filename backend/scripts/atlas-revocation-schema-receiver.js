// Private schema-only receiver. Import/check does not connect; manual stdin activation required.
(async()=>{
  const fs=await import('node:fs/promises'),path=await import('node:path'),{pathToFileURL}=await import('node:url'),{createHash}=await import('node:crypto');
  const project=String.raw`C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA`;
  const phase='B05.4C.2F.1C.2A',runId='10ef4f6d653f4ee4a1d1b2e6591013c2';
  let claimed=false,resultPath,progressHandle,credential,destroy;
  try{
    const directory=process.cwd(),base=path.join(process.env.LOCALAPPDATA??'','TwoSides','AtlasIntegrationTests');
    if(process.argv.length!==2||path.dirname(directory)!==base||path.basename(directory)!=='b054c2c-'+runId||
      path.dirname(path.resolve(process.argv[1]))!==directory||/[\\/]OneDrive[^\\/]*[\\/]/i.test(directory))throw new Error();
    resultPath=path.join(directory,'schema-result.json');
    for(const name of ['schema-result.json','schema-attempt.started','schema-progress.jsonl','schema-supervisor.json']){
      try{await fs.lstat(path.join(directory,name));throw new Error();}catch(e){if(e.code!=='ENOENT')throw e;}
    }
    const marker=await fs.open(path.join(directory,'schema-attempt.started'),'wx');claimed=true;await marker.close();
    const manifest=JSON.parse(await fs.readFile(path.join(directory,'schema-preflight-manifest.json'),'utf8'));
    if(manifest.Phase!==phase||manifest.RunId!==runId||manifest.MaxInvocations!==1||manifest.SchemaOnly!==true||
      manifest.RacesAllowed!==false||manifest.AclAccessAllowed!==false||!Array.isArray(manifest.Dependencies))throw new Error();
    const digest=async file=>{const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw new Error();
      return createHash('sha256').update(await fs.readFile(file)).digest('hex').toUpperCase();};
    if(await digest(process.argv[1])!==manifest.ReceiverSha256||
      await digest(path.join(directory,'send-atlas-schema-credential.ps1'))!==manifest.SenderSha256)throw new Error();
    const seen=new Set();
    for(const row of manifest.Dependencies){
      if(typeof row.Relative!=='string'||row.Relative.includes('..')||seen.has(row.Relative)||
        !/^backend\/(src\/[^:]*\.js|scripts\/atlas-revocation-schema-suite\.js|tests\/jwt\/env-guard\.js|package(?:-lock)?\.json)$/.test(row.Relative))throw new Error();
      seen.add(row.Relative);if(await digest(path.join(project,row.Relative))!==row.SHA256)throw new Error();
    }
    for(const name of ['backend/src/modules/sync/atlas-policy.js','backend/src/modules/sync/atlas-integration.js',
      'backend/src/modules/sync/atlas-credentials.js','backend/scripts/atlas-revocation-schema-suite.js','backend/tests/jwt/env-guard.js',
      'backend/package.json','backend/package-lock.json'])if(!seen.has(name))throw new Error();
    await import(pathToFileURL(path.join(project,'backend/tests/jwt/env-guard.js')).href);
    const {receiveAtlasCredential,destroyAtlasCredential}=await import(pathToFileURL(path.join(project,'backend/src/modules/sync/atlas-credentials.js')).href);destroy=destroyAtlasCredential;
    const {schemaInventory,provisionRevocationSchema}=await import(pathToFileURL(path.join(project,'backend/scripts/atlas-revocation-schema-suite.js')).href);
    if(JSON.stringify(schemaInventory)!==JSON.stringify(manifest.Inventory))throw new Error();
    const {diagnosticReadonlyConnector}=await import(pathToFileURL(path.join(project,'backend/src/modules/sync/atlas-readonly-connector.js')).href);
    const {default:mongoose}=await import(pathToFileURL(path.join(project,'backend/node_modules/mongoose/index.js')).href);
    progressHandle=await fs.open(path.join(directory,'schema-progress.jsonl'),'wx');
    credential=await receiveAtlasCredential(process.stdin,{timeoutMs:10000});
    const report={manualChannelActivated:true,aclInspected:false};
    await provisionRevocationSchema({credential,report,connector:diagnosticReadonlyConnector(mongoose,d=>{report.connectionDiagnostic=d;}),
      onProgress:async entry=>{await progressHandle.write(JSON.stringify(entry)+'\n');await progressHandle.sync();}});
    report.recordedAtUtc=new Date().toISOString();await fs.writeFile(resultPath,JSON.stringify(report,null,2),{flag:'wx',encoding:'utf8'});
  }catch{
    if(claimed&&resultPath)try{await fs.writeFile(resultPath,JSON.stringify({phase,runId,status:'blocked',category:'PRIVATE_CHANNEL_FAILURE',remoteOutcome:'not-certified'}),{flag:'wx',encoding:'utf8'});}catch{}
    process.exitCode=1;
  }finally{if(credential&&destroy)destroy(credential);if(progressHandle)await progressHandle.close().catch(()=>{});}
})().catch(()=>{process.exitCode=1;});
