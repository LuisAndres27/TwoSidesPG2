import './support/isolation-guard.js';
import {it,expect} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

// B66: exercise the EXISTING B64 transport/finally on a disposable copy.
// No real authorization, ACL helper, deployed receiver, integrity bypass for real use or network.
const source=fs.readFileSync(fileURLToPath(new URL('../../tools/atlas-v2-first-read/send-first-read.ps1',import.meta.url)),'utf8');
const functions=source.slice(source.indexOf(' function New-ReceiverInfo'),source.indexOf(" $child=Start-Receiver '--preflight-only'"));
const transport=source.slice(source.indexOf(" $secure=Read-Host"));
const quote=s=>s.replaceAll("'","''");
const fake=' FAKE-B66-\uFEFF-ñ-密碼-🔐-:@/%?#+ ';
function runFixture(mode){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'two-sides-b66-fake-'));
 const receiver=path.join(directory,'receiver.mjs'),runner=path.join(directory,'fixture.ps1');
 const receipt=path.join(directory,'receipt.json'),audit=path.join(directory,'cleanup.json');
 try{
  const credentialModule=new URL('../../src/modules/sync/atlas-credentials.js',import.meta.url).href;
  fs.writeFileSync(receiver,`
import fs from 'node:fs';import net from 'node:net';import dns from 'node:dns';
net.Socket.prototype.connect=()=>{throw new Error('OFFLINE_ONLY')};
for(const name of ['lookup','resolve','resolveSrv','resolveTxt','resolve4','resolve6'])dns[name]=()=>{throw new Error('OFFLINE_ONLY')};
import {receiveAtlasCredential,consumeAtlasCredential,destroyAtlasCredential} from '${credentialModule}';
let handle;try{handle=await receiveAtlasCredential(process.stdin,{timeoutMs:2000});const value=consumeAtlasCredential(handle);
fs.writeFileSync(${JSON.stringify(receipt)},JSON.stringify({exact:value===${JSON.stringify(fake)},argvLeak:process.argv.some(v=>v.includes(value)),envLeak:Object.values(process.env).some(v=>v.includes(value))}));
process.exitCode=${mode==='receiverError'?1:0};}finally{destroyAtlasCredential(handle);}
`);
  const setup=`$ErrorActionPreference='Stop'
$dir='${quote(directory)}';$local='${quote(os.tmpdir())}';$NodePath='${quote(process.execPath)}';$AuthorizationSha256='${'0'.repeat(64)}'
$fake=-join([char[]]@(${fake.split('').map(c=>c.charCodeAt(0)).join(',')}))
$locks=New-Object 'System.Collections.Generic.List[System.IDisposable]'
$secure=$null;$bstr=[IntPtr]::Zero;$chars=$null;$bytes=$null;$frame=$null;$child=$null
${functions}
function Read-Host {param([string]$Prompt,[switch]$AsSecureString)
 if(!$AsSecureString){throw 'Hidden input required'}
 ${mode==='cancel'?'throw [OperationCanceledException]::new("SYNTHETIC_CANCEL")':mode==='empty'?"return New-Object Security.SecureString":"return ConvertTo-SecureString $fake -AsPlainText -Force"}
}
function Test-Cleared($value){if($null -eq $value){return $true};foreach($x in $value){if([int]$x -ne 0){return $false}};return $true}
$script:nativeReleasedBeforeChild=$null
$originalStart=\${function:Start-Receiver}
function Start-Receiver([string]$mode){
 $script:nativeReleasedBeforeChild=($bstr -eq [IntPtr]::Zero -and $null -eq $secure -and (Test-Cleared $bytes) -and (Test-Cleared $chars))
 ${mode==='startError'?"throw ('Synthetic start failure '+$fake)":'& $originalStart $mode'}
}
try {
 try {
${transport}
} finally {
 $disposed=$true;if($secure){try{$probeCopy=$secure.Copy();$probeCopy.Dispose();$disposed=$false}catch{}}
 $summary=@{cleanupRan=$true;frameCleared=(Test-Cleared $frame);bytesCleared=(Test-Cleared $bytes);charsCleared=(Test-Cleared $chars);secureDisposed=$disposed;nativeReleasedBeforeChild=$script:nativeReleasedBeforeChild}
 [IO.File]::WriteAllText('${quote(audit)}',($summary|ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($false)))
}
`;
  fs.writeFileSync(runner,setup);
  const r=spawnSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoProfile','-NonInteractive','-File',runner],{encoding:'utf8',timeout:10000,windowsHide:true});
  const safe={status:r.status,stdout:r.stdout??'',stderr:r.stderr??'',audit:fs.existsSync(audit)?JSON.parse(fs.readFileSync(audit)):null,receipt:fs.existsSync(receipt)?JSON.parse(fs.readFileSync(receipt)):null};
  return safe;
 }finally{
  // Only the four exact synthetic files created above; no recursive deletion or real paths.
  for(const file of [receiver,runner,receipt,audit])if(fs.existsSync(file))fs.unlinkSync(file);
  fs.rmdirSync(directory);
 }
}
it.each(['accept','cancel','empty','startError','receiverError'])('B66 existing hidden-input transport: %s; synthetic only',mode=>{
 const r=runFixture(mode);
 expect(r.status,r.stderr).toBe(mode==='accept'?0:1);
 expect(r.stdout+r.stderr).not.toContain(fake);
 expect(r.audit,r.stderr).toEqual({cleanupRan:true,frameCleared:true,bytesCleared:true,charsCleared:true,secureDisposed:true,nativeReleasedBeforeChild:['cancel','empty'].includes(mode)?null:true});
 if(['accept','receiverError'].includes(mode))expect(r.receipt).toEqual({exact:true,argvLeak:false,envLeak:false});
 else expect(r.receipt).toBeNull();
});
