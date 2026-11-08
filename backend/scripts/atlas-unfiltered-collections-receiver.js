// Audited artifact copied to the private channel directory; no auto-launch from app/server.
// Dynamic imports keep this entrypoint usable as .js both inside and outside package type=module.
(async()=>{
  const path=await import('node:path'),fs=await import('node:fs/promises'),{pathToFileURL}=await import('node:url');
  const project=String.raw`C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA`;
  let reportPath,ownsAttempt=false;
  try{
    const cwd=process.cwd(),match=/^b054c2c-([0-9a-f]{32})$/.exec(path.basename(cwd));
    if(process.argv.length!==2 || !match || path.dirname(path.resolve(process.argv[1]))!==cwd || /[\\/]OneDrive[^\\/]*[\\/]/i.test(cwd))throw new Error();
    reportPath=path.join(cwd,'readonly-result.json');
    try{await fs.access(reportPath);throw new Error();}catch(error){if(error.code!=='ENOENT')throw error;}
    // At-most-one procedure invocation for this private run, even with concurrent/repeated launches.
    const claim=await fs.open(path.join(cwd,'readonly-attempt.started'),'wx');
    ownsAttempt=true;
    await claim.close();
    // Verify the private manifest before loading project code or consuming the credential frame.
    const {createHash}=await import('node:crypto');
    const manifest=JSON.parse(await fs.readFile(path.join(cwd,'preflight-manifest.json'),'utf8'));
    const expected=['backend/src/modules/sync/atlas-integration.js','backend/src/modules/sync/atlas-policy.js',
      'backend/src/modules/sync/atlas-unfiltered-collections-probe.js','backend/src/modules/sync/atlas-namespace-preflight.js',
      'backend/src/modules/sync/atlas-readonly-connector.js',
      'backend/src/modules/sync/atlas-error-diagnostic.js','backend/src/modules/sync/atlas-credentials.js',
      'backend/tests/jwt/env-guard.js','backend/package-lock.json'];
    if(manifest.Phase!=='B05.4C.2D.2C'||manifest.Strategy!=='unfiltered-command'||manifest.RetryReads!==false||manifest.MaxListCollectionsInvocations!==1||manifest.AuthenticationMechanism!=='DEFAULT'||manifest.RunId!==match[1]||manifest.AllowWrites!==false||manifest.TlsValidationRequired!==true||manifest.MaxProcedureInvocations!==1||
      !Array.isArray(manifest.Dependencies)||manifest.Dependencies.length!==expected.length)throw new Error();
    const digest=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex').toUpperCase();
    if(await digest(process.argv[1])!==manifest.ReceiverSha256)throw new Error();
    for(const [index,relative]of expected.entries()){
      const row=manifest.Dependencies[index],file=path.join(project,relative);
      if(typeof row.Path!=='string'||path.resolve(row.Path).toLowerCase()!==file.toLowerCase()||await digest(file)!==row.SHA256)throw new Error();
    }
    await import(pathToFileURL(path.join(project,'backend/tests/jwt/env-guard.js')).href);
    const {receiveAtlasCredential}=await import(pathToFileURL(path.join(project,'backend/src/modules/sync/atlas-credentials.js')).href);
    const {probeAtlasUnfilteredCollections}=await import(pathToFileURL(path.join(project,'backend/src/modules/sync/atlas-unfiltered-collections-probe.js')).href);
    const {ATLAS_TARGET,ATLAS_URI}=await import(pathToFileURL(path.join(project,'backend/src/modules/sync/atlas-policy.js')).href);
    const {diagnosticReadonlyConnector}=await import(pathToFileURL(path.join(project,'backend/src/modules/sync/atlas-readonly-connector.js')).href);
    const {default:mongoose}=await import(pathToFileURL(path.join(project,'backend/node_modules/mongoose/index.js')).href);
    const credential=await receiveAtlasCredential(process.stdin,{timeoutMs:10000});
    let privateDiagnostic=null;
    const result=await probeAtlasUnfilteredCollections({config:{mode:'atlas-integration-test',authorized:true,uri:ATLAS_URI,...ATLAS_TARGET,
      tls:true,runId:match[1],allowWrites:false,authMechanism:'DEFAULT'},credential,
      connector:diagnosticReadonlyConnector(mongoose,diagnostic=>{privateDiagnostic=diagnostic;})});
    result.privateDiagnostic=privateDiagnostic;
    if(privateDiagnostic&&result.diagnostic?.errorClass==='AtlasIntegrationError')result.diagnostic=privateDiagnostic;
    result.subphase='B05.4C.2D.2C';
    if(privateDiagnostic?.close==='failed'){result.closed=false;result.status='partial';}
    result.runId=match[1];result.recordedAtUtc=new Date().toISOString();
    await fs.writeFile(reportPath,JSON.stringify(result,null,2),{encoding:'utf8',flag:'wx'});
    // Even a connection/permission failure is a sanitized probe result; sender success is not Atlas success.
  }catch{
    if(reportPath&&ownsAttempt)try{await fs.writeFile(reportPath,JSON.stringify({schemaVersion:1,phase:'B05.4C.2D.2C',status:'blocked',errorCode:'readonly_receiver_unavailable',remoteDocumentWrites:0}),{encoding:'utf8',flag:'wx'});}catch{}
    process.exitCode=1;
  }
})().catch(()=>{process.exitCode=1;});
