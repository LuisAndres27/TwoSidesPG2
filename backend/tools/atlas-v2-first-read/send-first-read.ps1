# B64 template. Deploy and authorize separately; never run from the workspace.
param(
 [switch]$AuthorizedFirstRead,
 [Parameter(Mandatory=$true)][string]$PrivateDirectory,
 [Parameter(Mandatory=$true)][string]$AuthorizationSha256,
 [Parameter(Mandatory=$true)][string]$ReceiverSha256,
 [Parameter(Mandatory=$true)][string]$GateSha256,
 [Parameter(Mandatory=$true)][string]$ProbeSha256,
 [Parameter(Mandatory=$true)][string]$SenderSha256,
 [Parameter(Mandatory=$true)][string]$NodePath,
 [Parameter(Mandatory=$true)][string]$NodeSha256
)
$ErrorActionPreference='Stop'
$locks=New-Object 'System.Collections.Generic.List[System.IDisposable]'
$secure=$null;$bstr=[IntPtr]::Zero;$chars=$null;$bytes=$null;$frame=$null;$child=$null
try {
 if(!$AuthorizedFirstRead){throw 'Blocked'}
 $dir=[IO.Path]::GetFullPath($PrivateDirectory);$runId=Split-Path $dir -Leaf
 $local=[Environment]::GetFolderPath('LocalApplicationData')
 if($runId -cnotmatch '^[a-f0-9]{32}$' -or $dir -ine (Join-Path $local ('TwoSides\AtlasV2FirstRead\'+$runId)) -or $PSScriptRoot -ine $dir){throw 'Blocked'}
 $me=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 $allowed=@($me,'S-1-5-18','S-1-5-32-544')
 # Read-only checks, limited to the NEW execution directory and its files. No historic ACL helper.
 function Assert-PrivateObject([string]$p,[bool]$isDirectory){
  $item=Get-Item -LiteralPath $p -Force
  if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.PSIsContainer -ne $isDirectory){throw 'Blocked'}
  $acl=Get-Acl -LiteralPath $p
  if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $allowed){throw 'Blocked'}
  if($isDirectory -and !$acl.AreAccessRulesProtected){throw 'Blocked'}
  foreach($ace in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
   if($ace.AccessControlType -eq 'Allow' -and $ace.IdentityReference.Value -notin $allowed -and [int64]$ace.FileSystemRights -ne 0){throw 'Blocked'}
  }
 }
 $ancestor=Get-Item -LiteralPath $dir -Force
 while($ancestor){if($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Blocked'};$ancestor=$ancestor.Parent}
 Assert-PrivateObject $dir $true
 foreach($name in @('used.json','result.json')){if(Test-Path -LiteralPath (Join-Path $dir $name)){throw 'Blocked'}}
 $expected=@{'receiver.mjs'=$ReceiverSha256;'gate.mjs'=$GateSha256;'probe.mjs'=$ProbeSha256;'send-first-read.ps1'=$SenderSha256;'authorization.json'=$AuthorizationSha256}
 foreach($name in $expected.Keys){
  if($expected[$name] -cnotmatch '^[a-f0-9]{64}$'){throw 'Blocked'}
  $p=Join-Path $dir $name;Assert-PrivateObject $p $false
  $locks.Add([IO.File]::Open($p,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read))
  if((Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expected[$name]){throw 'Blocked'}
 }
 if(![IO.Path]::IsPathRooted($NodePath) -or $NodePath.Contains('"') -or $NodeSha256 -cnotmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $NodePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $NodeSha256){throw 'Blocked'}
 $locks.Add([IO.File]::Open($NodePath,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read))
 $active=Join-Path $local 'TwoSidesMainIntegrity\backend-integrity-manifest.json'
 Assert-PrivateObject $active $false
 $locks.Add([IO.File]::Open($active,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read))
 function New-ReceiverInfo([string]$mode){
  $i=New-Object Diagnostics.ProcessStartInfo;$i.FileName=$NodePath;$i.UseShellExecute=$false;$i.CreateNoWindow=$true;$i.WorkingDirectory=$dir
  $i.Arguments='"'+(Join-Path $dir 'receiver.mjs')+'" '+$mode+' '+$AuthorizationSha256
  $i.RedirectStandardInput=$true;$i.RedirectStandardOutput=$true;$i.RedirectStandardError=$true
  $i.EnvironmentVariables.Clear();$win=[Environment]::GetFolderPath('Windows')
  $i.EnvironmentVariables['SystemRoot']=$win;$i.EnvironmentVariables['windir']=$win;$i.EnvironmentVariables['PATH']=Join-Path $win 'System32';$i.EnvironmentVariables['LOCALAPPDATA']=$local
  return $i
 }
 function Start-Receiver([string]$mode){
  $encoding=[Console]::InputEncoding
  try{if($encoding.GetPreamble().Length -gt 0){[Console]::InputEncoding=[Text.Encoding]::GetEncoding(1252)};return [Diagnostics.Process]::Start((New-ReceiverInfo $mode))}
  finally{[Console]::InputEncoding=$encoding}
 }
 $child=Start-Receiver '--preflight-only';$child.StandardInput.Close()
 if(!$child.WaitForExit(60000)){$child.Kill();throw 'Blocked'}
 if($child.ExitCode -ne 0){throw 'Blocked'}
 $child.Dispose();$child=$null
 # Only after tool hashes, privacy checks and complete active-v5 verification succeeded.
 $secure=Read-Host 'Atlas v2 password (hidden; one read-only attempt)' -AsSecureString
 $bstr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 $chars=New-Object 'char[]' $secure.Length
 for($j=0;$j -lt $chars.Length;$j++){$chars[$j]=[char]([Runtime.InteropServices.Marshal]::ReadInt16($bstr,2*$j) -band 0xffff)}
 $bytes=(New-Object Text.UTF8Encoding($false,$true)).GetBytes($chars)
 if($bytes.Length -lt 1 -or $bytes.Length -gt 1024 -or $chars -contains [char]0 -or $chars -contains [char]13 -or $chars -contains [char]10){throw 'Blocked'}
 $frame=New-Object 'byte[]' (4+$bytes.Length)
 $frame[0]=($bytes.Length -shr 24) -band 255;$frame[1]=($bytes.Length -shr 16) -band 255;$frame[2]=($bytes.Length -shr 8) -band 255;$frame[3]=$bytes.Length -band 255
 [Array]::Copy($bytes,0,$frame,4,$bytes.Length)
 # B66: once framed, no native/plain conversion copy is needed while the receiver runs.
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr);$bstr=[IntPtr]::Zero
 $secure.Dispose();$secure=$null
 [Array]::Clear($bytes,0,$bytes.Length);[Array]::Clear($chars,0,$chars.Length)
 $child=Start-Receiver '--authorized-first-read'
 $child.StandardInput.BaseStream.Write($frame,0,$frame.Length);$child.StandardInput.BaseStream.Flush();$child.StandardInput.Close()
 [Array]::Clear($frame,0,$frame.Length);[Array]::Clear($bytes,0,$bytes.Length);[Array]::Clear($chars,0,$chars.Length)
 if(!$child.WaitForExit(150000)){$child.Kill();throw 'Blocked'}
 if($child.ExitCode -ne 0){throw 'Blocked'}
 Write-Host 'Read-only attempt completed; inspect sanitized result. Do not repeat.'
} catch { Write-Error 'First-read unavailable. No details or credentials shown. Do not repeat.';exit 1 }
finally {
 if($child){if(!$child.HasExited){$child.Kill()};$child.Dispose()}
 if($bstr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)}
 if($secure){$secure.Dispose()}
 if($frame){[Array]::Clear($frame,0,$frame.Length)};if($bytes){[Array]::Clear($bytes,0,$bytes.Length)};if($chars){[Array]::Clear($chars,0,$chars.Length)}
 foreach($handle in $locks){$handle.Dispose()}
}
