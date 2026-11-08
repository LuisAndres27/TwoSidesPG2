import './support/isolation-guard.js';
import { expect,it } from 'vitest';
import { mkdtempSync,writeFileSync,rmSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { temporaryAtlasCredential,consumeAtlasCredential } from '../../src/modules/sync/atlas-credentials.js';
import { saslprep } from '@mongodb-js/saslprep';
import { MongoClient } from 'mongodb';
import { ATLAS_TARGET,ATLAS_URI } from '../../src/modules/sync/atlas-policy.js';

// Generated fixtures only. Never invoke the remote receiver or private credential sender.
const samples=[
  ['ASCII', 'synthetic-channel-check'],
  ['URI reserved characters', ':/?#[]@!$&\'()*+,;=%\\"`'],
  ['leading and trailing whitespace', '  synthetic\tvalue  '],
  ['Unicode and combining marks', '\u00f1\u00e9e\u0301\u4e2d\ud83d\udd12'],
  ['leading Unicode BOM character', '\ufeffsynthetic'],
  ['embedded Unicode BOM character', 'syn\ufeffthetic'],
  ['percent sequences remain literal', '%40%25%2F%3A+'],
  ['maximum UTF8 payload', 'x'.repeat(1024)],
];

it('C01 credential decoding preserves every synthetic Unicode code point',()=>{
  for(const [,value]of samples){
    const input=Buffer.from(value,'utf8'),handle=temporaryAtlasCredential(input);
    // Boolean comparison prevents Vitest from printing fixture values on failure.
    expect(consumeAtlasCredential(handle)===value).toBe(true);
    expect(input.every(byte=>byte===0)).toBe(true);
  }
});

it.skipIf(process.platform!=='win32')('C02 actual PowerShell conversion/framing and Node driver preserve synthetic inputs offline',()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'two-sides-channel-offline-'));
  try{
    const moduleURL=relative=>pathToFileURL(path.resolve(relative)).href;
    writeFileSync(path.join(directory,'samples.json'),JSON.stringify(samples.map(([,value])=>value)));
    writeFileSync(path.join(directory,'worker.mjs'),`
      import ${JSON.stringify(moduleURL('tests/sync/support/isolation-guard.js'))};
      import net from 'node:net';
      import dns from 'node:dns';
      import {readFileSync} from 'node:fs';
      import {receiveAtlasCredential} from ${JSON.stringify(moduleURL('src/modules/sync/atlas-credentials.js'))};
      import {openAtlasIntegration} from ${JSON.stringify(moduleURL('src/modules/sync/atlas-integration.js'))};
      import {ATLAS_TARGET,ATLAS_URI} from ${JSON.stringify(moduleURL('src/modules/sync/atlas-policy.js'))};
      import mongoose from ${JSON.stringify(moduleURL('node_modules/mongoose/index.js'))};
      import {diagnosticReadonlyConnector} from ${JSON.stringify(moduleURL('src/modules/sync/atlas-readonly-connector.js'))};
      net.Socket.prototype.connect=()=>{throw new Error('Offline only');};
      dns.resolveSrv=dns.resolveTxt=dns.lookup=()=>{throw new Error('Offline only');};
      dns.promises.resolveSrv=dns.promises.resolveTxt=dns.promises.lookup=async()=>{throw new Error('Offline only');};
      try{
        const expected=JSON.parse(readFileSync(new URL('./samples.json',import.meta.url)))[Number(process.argv[2])];
        const credential=await receiveAtlasCredential(process.stdin,{timeoutMs:5000});
        let verified=false;
        mongoose.mongo.MongoClient.prototype.connect=async function(){
          const c=this.options.credentials;
          verified=c.password===expected&&c.username==='twosides_integration_test'&&c.source==='admin'&&c.mechanism==='SCRAM-SHA-256';
          // Stop at the native connect boundary: no DNS, sockets, or authentication.
          throw new Error('End of offline inspection');
        };
        const inspectedConnector=diagnosticReadonlyConnector(mongoose,()=>{});
        try{await openAtlasIntegration({config:{mode:'atlas-integration-test',authorized:true,uri:ATLAS_URI,...ATLAS_TARGET,tls:true,runId:'a'.repeat(32),allowWrites:false},credential,
          connector:async(uri,options)=>{
            if(options.pass!==expected)throw new Error('Synthetic channel mismatch');
            return inspectedConnector(uri,options);
          }});}catch{}
        process.exitCode=verified?0:2;
      }catch{process.exitCode=3;}
    `);
    const quote=value=>"'"+value.replaceAll("'","''")+"'";
    const sender=path.resolve('scripts/send-atlas-test-credential.ps1');
    // Extract the production blocks rather than duplicating the transformations under test.
    const source=readFileSync(sender,'utf8');
    const conversion=source.slice(source.indexOf('  $secure=Read-Host'),source.indexOf('  $process=New-Object Diagnostics.Process;'));
    const framing=source.slice(source.indexOf('  $length=[BitConverter]'),source.indexOf('  if(!$process.WaitForExit'));
    expect(conversion.includes('SecureStringToBSTR')&&framing.includes('BaseStream.Write')).toBe(true);
    writeFileSync(path.join(directory,'probe.ps1'),`
      $ErrorActionPreference='Stop'
      $samples=ConvertFrom-Json ([IO.File]::ReadAllText(${quote(path.join(directory,'samples.json'))},[Text.Encoding]::UTF8))
      function Read-Host { param($Prompt,[switch]$AsSecureString); ConvertTo-SecureString -String $script:sample -AsPlainText -Force }
      for($case=0;$case -lt $samples.Count;$case++){
        $script:sample=$samples[$case];$ptr=[IntPtr]::Zero;$bytes=$null;$secure=$null;$process=$null
        try{
          ${conversion}
          $info=New-Object Diagnostics.ProcessStartInfo
          $info.FileName=${quote(process.execPath)}
          $info.Arguments='"'+${quote(path.join(directory,'worker.mjs'))}+'" '+$case
          $info.WorkingDirectory=${quote(directory)};$info.UseShellExecute=$false;$info.CreateNoWindow=$true
          $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
          $info.EnvironmentVariables.Clear();$info.EnvironmentVariables['SystemRoot']=$env:SystemRoot;$info.EnvironmentVariables['LOCALAPPDATA']=$env:LOCALAPPDATA;$info.EnvironmentVariables['NODE_ENV']='test'
          $process=New-Object Diagnostics.Process;$process.StartInfo=$info
          if(!$process.Start()){exit 10}
          $out=$process.StandardOutput.ReadToEndAsync();$err=$process.StandardError.ReadToEndAsync()
          ${framing}
          if(!$process.WaitForExit(10000)){ $process.Kill();exit 11 }
          if($process.ExitCode -ne 0 -or $out.Result.Length -ne 0 -or $err.Result.Length -ne 0){exit (20+$case)}
        }finally{
          if($bytes){[Array]::Clear($bytes,0,$bytes.Length)}
          if($ptr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
          if($secure){$secure.Dispose()};if($process){if(!$process.HasExited){$process.Kill()};$process.Dispose()}
          $plain=$null
        }
      }
      exit 0
    `);
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(directory,'probe.ps1')],{timeout:25000,encoding:'utf8',windowsHide:true});
    expect(result.status).toBe(0);
    expect(result.stdout.length).toBe(0);expect(result.stderr.length).toBe(0);
  }finally{
    const resolved=path.resolve(directory);
    if(path.dirname(resolved)!==path.resolve(tmpdir())||!path.basename(resolved).startsWith('two-sides-channel-offline-'))throw new Error('Unexpected cleanup target');
    rmSync(resolved,{recursive:true,force:true});
  }
},30000);

it('C03 SCRAM-SHA-256 preparation makes the reproduced BOM loss inconclusive as an authentication cause',()=>{
  const synthetic='synthetic-channel-check';
  expect(saslprep('\ufeff'+synthetic)===saslprep(synthetic)).toBe(true);
});

it('C04 installed driver resolves DEFAULT using synthetic supported mechanisms without authentication',()=>{
  const client=new MongoClient(ATLAS_URI,{auth:{username:ATLAS_TARGET.user,password:'synthetic-only'},authSource:'admin'});
  const original=client.options.credentials;
  expect(original.mechanism).toBe('DEFAULT');
  for(const [hello,expected]of [
    [{saslSupportedMechs:['SCRAM-SHA-1','SCRAM-SHA-256']},'SCRAM-SHA-256'],
    [{saslSupportedMechs:['SCRAM-SHA-1']},'SCRAM-SHA-1'],
    [{},'SCRAM-SHA-256'],
  ]){
    const resolved=original.resolveAuthMechanism(hello);
    expect(resolved.mechanism).toBe(expected);
    expect(resolved.username).toBe('twosides_integration_test');
    expect(resolved.source).toBe('admin');
    expect(resolved.password===original.password).toBe(true);
  }
});

it('C05 explicit SCRAM-SHA-256 stays fixed even if synthetic server advertises SHA-1 only',()=>{
  const client=new MongoClient(ATLAS_URI,{auth:{username:ATLAS_TARGET.user,password:'synthetic-only'},authSource:'admin',authMechanism:'SCRAM-SHA-256'});
  const original=client.options.credentials;
  expect(original.resolveAuthMechanism({saslSupportedMechs:['SCRAM-SHA-1']})).toBe(original);
  expect(original.mechanism).toBe('SCRAM-SHA-256');
});
