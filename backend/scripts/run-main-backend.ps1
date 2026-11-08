# Main runtime only. Never integration, synthetic scenarios, schema preparation or .env.
# Prepared for a later explicitly authorized connection. Do not run as part of offline preparation.
param([switch]$EnableMain,[string]$SigningKeyFile,[string]$KeyId,[ValidateRange(1,65535)][int]$Port=3000,
  [string]$IntegrityManifest,[string]$ExpectedTreeDigest,[string]$ExpectedKeyFingerprint,[string]$ExpectedKeyId='main-2026-11')
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if(!$EnableMain){Write-Error 'Main backend disabled.';exit 1}
$node='C:\Program Files\nodejs\node.exe'
$backend=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$projectRoot=Split-Path -Parent $backend
if(!$SigningKeyFile -or ![IO.Path]::IsPathRooted($SigningKeyFile) -or $SigningKeyFile -match '["\r\n]' -or $KeyId -cnotmatch '^[A-Za-z0-9_-]{1,64}$'){throw 'Invalid main runtime configuration.'}
$keyPath=[IO.Path]::GetFullPath($SigningKeyFile)
if($keyPath.StartsWith($projectRoot+'\',[StringComparison]::OrdinalIgnoreCase) -or $keyPath -match '\\OneDrive[^\\]*\\|(^|\\)\.env(\.|$)'){throw 'Signing key must be outside the project and OneDrive.'}
$key=Get-Item -LiteralPath $keyPath
if($key.PSIsContainer -or ($key.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $key.Length -gt 32768){throw 'Invalid signing key file.'}
# --- Optional integrity guard. Runs BEFORE the password prompt and before any connection; any failure stops here with a fixed message and no secret.
# The manifest is trusted only at its protected location AND only when its tree digest equals the anchor recorded outside the machine (-ExpectedTreeDigest).
# It is a tripwire, not protection against a process running as the same user (see B16).
if($IntegrityManifest -or $ExpectedTreeDigest -or $ExpectedKeyFingerprint){
  $stop={param($reason) Write-Error ('Integrity guard failed: '+$reason); exit 1}
  if(!$IntegrityManifest -or $ExpectedTreeDigest -cnotmatch '^[0-9a-f]{64}$' -or $ExpectedKeyFingerprint -cnotmatch '^[0-9a-f]{64}$' -or $ExpectedKeyId -cnotmatch '^[A-Za-z0-9_-]{1,64}$'){& $stop 'manifest, tree digest anchor and key fingerprint anchor are all required'}
  $localApp=[Environment]::GetFolderPath('LocalApplicationData')
  $secretsDir=Join-Path $localApp 'TwoSidesMainSecrets';$integrityDir=Join-Path $localApp 'TwoSidesMainIntegrity'
  $fixedKey=Join-Path $secretsDir 'keys\main-jwt.pem';$fixedManifest=Join-Path $integrityDir 'backend-integrity-manifest.json'
  if($keyPath -ine $fixedKey){& $stop 'the signing key is not at the protected location'}
  if([IO.Path]::GetFullPath($IntegrityManifest) -ine $fixedManifest){& $stop 'the manifest is not at the protected location'}
  if($KeyId -cne $ExpectedKeyId){& $stop 'the key id differs from the pinned id'}
  . (Join-Path $PSScriptRoot 'main-secrets-acl-lib.ps1')
  $me=[Security.Principal.WindowsIdentity]::GetCurrent().User
  foreach($t in @(@($secretsDir,$true,$true),@((Join-Path $secretsDir 'keys'),$true,$true),@($fixedKey,$false,$false),@($integrityDir,$true,$true),@($fixedManifest,$false,$false))){
    if(!(Test-Path -LiteralPath $t[0])){& $stop 'a protected path is missing'}
    if((Get-Item -LiteralPath $t[0] -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){& $stop 'a protected path is a link'}
    if(@(Get-SecretsAclFailures -Security (Get-Acl -LiteralPath $t[0]) -UserSid $me -IsDirectory $t[1] -ExpectProtected $t[2]).Count -gt 0){& $stop 'the permissions of a protected path are not conforming'}
  }
  $pf=New-Object Diagnostics.ProcessStartInfo;$pf.FileName=$node;$pf.WorkingDirectory=$backend;$pf.UseShellExecute=$false;$pf.CreateNoWindow=$true
  $pf.RedirectStandardOutput=$true;$pf.RedirectStandardError=$true
  $pf.Arguments='"'+(Join-Path $backend 'scripts\main-preflight.js')+'" --manifest "'+$fixedManifest+'" --anchor '+$ExpectedTreeDigest+' --key-file "'+$keyPath+'" --key-id '+$KeyId+' --expected-key-id '+$ExpectedKeyId+' --key-fingerprint '+$ExpectedKeyFingerprint
  $pf.Environment.Clear();$wd=[Environment]::GetFolderPath('Windows');$pf.Environment['SystemRoot']=$wd;$pf.Environment['windir']=$wd;$pf.Environment['PATH']=Join-Path $wd 'System32'
  $pp=[Diagnostics.Process]::Start($pf);$pfOut=$pp.StandardOutput.ReadToEnd();$pfErr=$pp.StandardError.ReadToEnd();$pp.WaitForExit()
  if($pp.ExitCode -ne 0){& $stop ('pre-start checks did not pass '+$pfErr.Trim())}
  Write-Host ('Integrity guard passed: '+$pfOut.Trim())
}else{Write-Error 'Integrity guard failed: manifest and external anchors are required.';exit 1}
$secure=Read-Host -Prompt 'Main database password (hidden input)' -AsSecureString
$bstr=[IntPtr]::Zero;$chars=$null;$bytes=$null;$frame=$null;$process=$null;$consoleInput=$null
try{
  $bstr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $chars=New-Object 'char[]' $secure.Length
  for($i=0;$i -lt $chars.Length;$i++){$chars[$i]=[char]([Runtime.InteropServices.Marshal]::ReadInt16($bstr,2*$i) -band 0xFFFF)}
  $bytes=(New-Object Text.UTF8Encoding($false,$true)).GetBytes($chars)
  if($bytes.Length -lt 1 -or $bytes.Length -gt 1024 -or $chars -contains [char]0 -or $chars -contains [char]13 -or $chars -contains [char]10){throw 'Invalid credential.'}
  $frame=New-Object 'byte[]' (4+$bytes.Length)
  $frame[0]=($bytes.Length -shr 24) -band 255;$frame[1]=($bytes.Length -shr 16) -band 255;$frame[2]=($bytes.Length -shr 8) -band 255;$frame[3]=$bytes.Length -band 255
  [Array]::Copy($bytes,0,$frame,4,$bytes.Length)
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName=$node;$info.Arguments='"'+(Join-Path $backend 'src\server.js')+'"';$info.WorkingDirectory=$backend
  $info.UseShellExecute=$false;$info.RedirectStandardInput=$true;$info.CreateNoWindow=$true
  $info.Environment.Clear();$windows=[Environment]::GetFolderPath('Windows')
  $info.Environment['SystemRoot']=$windows;$info.Environment['windir']=$windows;$info.Environment['PATH']=Join-Path $windows 'System32'
  $info.Environment['NODE_ENV']='production';$info.Environment['TWOSIDES_PROFILE']='main';$info.Environment['MAIN_ENABLE']='true'
  $info.Environment['MAIN_JWT_PRIVATE_KEY_FILE']=$keyPath;$info.Environment['MAIN_JWT_KEY_ID']=$KeyId;$info.Environment['PORT']=[string]$Port
  $info.Environment['MAIN_INTEGRITY_MANIFEST']=$IntegrityManifest;$info.Environment['MAIN_INTEGRITY_ANCHOR']=$ExpectedTreeDigest
  $info.Environment['MAIN_KEY_FINGERPRINT']=$ExpectedKeyFingerprint;$info.Environment['MAIN_EXPECTED_KEY_ID']=$ExpectedKeyId
  $consoleInput=[Console]::InputEncoding
  if($consoleInput.GetPreamble().Length -gt 0){[Console]::InputEncoding=[Text.Encoding]::GetEncoding(1252)}else{$consoleInput=$null}
  try{$process=[Diagnostics.Process]::Start($info)}finally{if($consoleInput){[Console]::InputEncoding=$consoleInput;$consoleInput=$null}}
  $process.StandardInput.BaseStream.Write($frame,0,$frame.Length);$process.StandardInput.BaseStream.Flush();$process.StandardInput.Close()
  [Array]::Clear($frame,0,$frame.Length);[Array]::Clear($bytes,0,$bytes.Length);[Array]::Clear($chars,0,$chars.Length)
  $process.WaitForExit();exit $process.ExitCode
}finally{
  if($bstr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)}
  if($secure){$secure.Dispose()}
  foreach($buffer in @($frame,$bytes,$chars)){if($buffer){[Array]::Clear($buffer,0,$buffer.Length)}}
  if($process -and !$process.HasExited){if(!$process.WaitForExit(10000)){$process.Kill()}}
}
