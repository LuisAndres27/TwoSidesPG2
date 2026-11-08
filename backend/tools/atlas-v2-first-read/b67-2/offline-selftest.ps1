# B67.2 synthetic-only prompt with fixed public diagnostics. Never type an Atlas password here.
param(
 [Parameter(Mandatory=$true)][ValidateSet('Accept','Cancel','Check')][string]$Mode,
 [Parameter(Mandatory=$true)][ValidatePattern('\A[a-fA-F0-9]{64}\z')][string]$DeploymentSha256,
 [switch]$Automation
)
# A SHA-256 digest is case-insensitive hex (Get-FileHash prints it in capitals). It is accepted in either case and normalized once to the
# canonical lowercase form, which is then compared exactly (-cne) and passed to the receiver. Nothing else is relaxed.
$DeploymentSha256=$DeploymentSha256.ToLowerInvariant()
$ErrorActionPreference='Stop'
$locks=New-Object 'System.Collections.Generic.List[System.IDisposable]'
$secure=$null;$bstr=[IntPtr]::Zero;$chars=$null;$bytes=$null;$frame=$null;$child=$null;$passed=$false;$accepted=$false
$dir=$PSScriptRoot;$node=$null;$local=[Environment]::GetFolderPath('LocalApplicationData')
# Public diagnostics: only these fixed stage names and codes are ever printed. Exception text, input, lengths and hashes never are.
$stage='integrity';$code='UNEXPECTED';$failed=$false;$cleanupFailed=$false
$codes=@('INTEGRITY_LOCATION','INTEGRITY_PATH','INTEGRITY_ACL','INTEGRITY_LOCK','INTEGRITY_SEAL_ARG','INTEGRITY_SEAL','INTEGRITY_FILE_MISSING','INTEGRITY_FILE_HASH','INTEGRITY_NODE',
 'PREFLIGHT_START','PREFLIGHT_TIMEOUT','PREFLIGHT_REJECTED','INPUT_READ_FAILED','INPUT_EMPTY','INPUT_MISMATCH','CANCEL_INPUT_NOT_EMPTY','COMPARE_CONVERT_FAILED','FRAME_FAILED',
 'RECEIVER_START','TRANSPORT_WRITE','RECEIVER_TIMEOUT','RECEIVER_REJECTED','RECEIVER_EXIT','RECEIVER_CONTRACT')
function Fail([string]$c){$script:code=$c;throw 'B67'}
function Mark([string]$name,[string]$state){Write-Host ('B67_STAGE='+$name+' '+$state)}
function Check-Private([string]$p,[bool]$directory){
 $item=Get-Item -LiteralPath $p -Force
 if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.PSIsContainer -ne $directory){Fail 'INTEGRITY_PATH'}
 $acl=Get-Acl -LiteralPath $p
 if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $allowed -or ($directory -and !$acl.AreAccessRulesProtected)){Fail 'INTEGRITY_ACL'}
 foreach($a in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($a.AccessControlType -eq 'Allow' -and $a.IdentityReference.Value -notin $allowed -and [int64]$a.FileSystemRights -ne 0){Fail 'INTEGRITY_ACL'}}
}
function Start-Offline([string]$stageArg){
 $i=New-Object Diagnostics.ProcessStartInfo;$i.FileName=$node;$i.Arguments='"'+(Join-Path $dir 'offline-receiver.mjs')+'" '+$stageArg+' '+$DeploymentSha256
 $i.WorkingDirectory=$dir;$i.UseShellExecute=$false;$i.CreateNoWindow=$true;$i.RedirectStandardInput=$true;$i.RedirectStandardOutput=$true;$i.RedirectStandardError=$true
 $i.EnvironmentVariables.Clear();$win=[Environment]::GetFolderPath('Windows');$i.EnvironmentVariables['SystemRoot']=$win;$i.EnvironmentVariables['windir']=$win;$i.EnvironmentVariables['PATH']=Join-Path $win 'System32';$i.EnvironmentVariables['LOCALAPPDATA']=$local
 $encoding=[Console]::InputEncoding
 try{if($encoding.GetPreamble().Length -gt 0){[Console]::InputEncoding=[Text.Encoding]::GetEncoding(1252)};return [Diagnostics.Process]::Start($i)}finally{[Console]::InputEncoding=$encoding}
}
try {
 $id=Split-Path $dir -Leaf
 if($id -cnotmatch '^[a-f0-9]{32}$' -or $dir -ine (Join-Path $local ('TwoSides\AtlasV2FirstRead\'+$id))){Fail 'INTEGRITY_LOCATION'}
 $me=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;$allowed=@($me,'S-1-5-18','S-1-5-32-544')
 Check-Private $dir $true
 $ancestor=Get-Item -LiteralPath $dir -Force;while($ancestor){if($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint){Fail 'INTEGRITY_PATH'};$ancestor=$ancestor.Parent}
 $seal=Join-Path $dir 'deployment.json';if(!(Test-Path -LiteralPath $seal -PathType Leaf)){Fail 'INTEGRITY_SEAL'};Check-Private $seal $false
 try{$locks.Add([IO.File]::Open($seal,'Open','Read','Read'))}catch{Fail 'INTEGRITY_LOCK'}
 if((Get-FileHash -LiteralPath $seal -Algorithm SHA256).Hash.ToLowerInvariant() -cne $DeploymentSha256){Fail 'INTEGRITY_SEAL_ARG'}
 $d=Get-Content -LiteralPath $seal -Raw | ConvertFrom-Json
 if($d.kind -cne 'two-sides-b67-offline-only' -or $d.remoteEnabled -ne $false -or $d.runId -cne $id){Fail 'INTEGRITY_SEAL'}
 $names=@('gate.mjs','probe.mjs','receiver.mjs','send-first-read.ps1','offline-receiver.mjs','offline-selftest.ps1','v5-reference.json')
 if(@($d.files.PSObject.Properties).Count -ne $names.Count){Fail 'INTEGRITY_SEAL'}
 foreach($name in $names){
  $p=Join-Path $dir $name;if(!(Test-Path -LiteralPath $p -PathType Leaf)){Fail 'INTEGRITY_FILE_MISSING'}
  Check-Private $p $false
  try{$locks.Add([IO.File]::Open($p,'Open','Read','Read'))}catch{Fail 'INTEGRITY_LOCK'}
  if((Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() -cne $d.files.$name){Fail 'INTEGRITY_FILE_HASH'}
 }
 $node=$d.nodePath
 if($node -cne 'C:\Program Files\nodejs\node.exe' -or !(Test-Path -LiteralPath $node -PathType Leaf)){Fail 'INTEGRITY_NODE'}
 if((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash.ToLowerInvariant() -cne $d.nodeSha256){Fail 'INTEGRITY_NODE'}
 try{$locks.Add([IO.File]::Open($node,'Open','Read','Read'))}catch{Fail 'INTEGRITY_LOCK'}
 Mark 'integrity' 'ok'
 # All integrity checks and the complete backend candidate verification precede even synthetic input.
 $stage='preflight'
 try{$child=Start-Offline '--preflight'}catch{Fail 'PREFLIGHT_START'}
 $child.StandardInput.Close()
 if(!$child.WaitForExit(60000)){$child.Kill();[void]$child.WaitForExit(5000);Fail 'PREFLIGHT_TIMEOUT'}
 $preflight=$child.StandardOutput.ReadToEnd();[void]$child.StandardError.ReadToEnd()
 $preflightOk=$false;try{$preflightOk=($child.ExitCode -eq 0 -and ($preflight|ConvertFrom-Json).ok -eq $true)}catch{}
 if(!$preflightOk){Fail 'PREFLIGHT_REJECTED'}
 $child.Dispose();$child=$null
 Mark 'preflight' 'ok'
 if($Mode -eq 'Check'){$passed=$true}
 else{
 $stage='input'
 if($Automation){if($Mode -eq 'Accept'){$secure=ConvertTo-SecureString 'B67-ONLY-FAKE-2026!' -AsPlainText -Force}else{$secure=New-Object Security.SecureString}}
 else{
  if($Mode -eq 'Accept'){Write-Host 'SYNTHETIC ONLY: type B67-ONLY-FAKE-2026! at the hidden prompt. Never use a real password.'}
  else{Write-Host 'SYNTHETIC CANCEL: press Enter without typing anything. Never use a real password.'}
  Mark 'input' 'waiting'
  try{$secure=Read-Host 'B67 synthetic input (hidden)' -AsSecureString}catch{Fail 'INPUT_READ_FAILED'}
 }
 Mark 'input' 'received'
 $stage='compare'
 if($Mode -eq 'Cancel'){if($secure.Length -ne 0){Fail 'CANCEL_INPUT_NOT_EMPTY'};$passed=$true}
 else {
  if($secure.Length -eq 0){Fail 'INPUT_EMPTY'}
  try{
   $bstr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);$chars=New-Object 'char[]' $secure.Length
   for($j=0;$j -lt $chars.Length;$j++){$chars[$j]=[char]([Runtime.InteropServices.Marshal]::ReadInt16($bstr,2*$j) -band 0xffff)}
  }catch{Fail 'COMPARE_CONVERT_FAILED'}
  # Compare code units, without creating another plaintext string. Only the public sentinel is supported.
  $expected=[char[]]'B67-ONLY-FAKE-2026!';if($chars.Length -ne $expected.Length){Fail 'INPUT_MISMATCH'}
  for($j=0;$j -lt $expected.Length;$j++){if($chars[$j] -cne $expected[$j]){Fail 'INPUT_MISMATCH'}}
  Mark 'compare' 'ok'
  try{
   $bytes=(New-Object Text.UTF8Encoding($false,$true)).GetBytes($chars);$frame=New-Object 'byte[]' (4+$bytes.Length)
   $frame[0]=($bytes.Length -shr 24) -band 255;$frame[1]=($bytes.Length -shr 16) -band 255;$frame[2]=($bytes.Length -shr 8) -band 255;$frame[3]=$bytes.Length -band 255;[Array]::Copy($bytes,0,$frame,4,$bytes.Length)
  }catch{Fail 'FRAME_FAILED'}
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr);$bstr=[IntPtr]::Zero;$secure.Dispose();$secure=$null
  [Array]::Clear($chars,0,$chars.Length);[Array]::Clear($bytes,0,$bytes.Length)
  $stage='receiver'
  try{$child=Start-Offline '--receive-synthetic'}catch{Fail 'RECEIVER_START'};$accepted=$true
  try{$child.StandardInput.BaseStream.Write($frame,0,$frame.Length);$child.StandardInput.BaseStream.Flush();$child.StandardInput.Close()}catch{Fail 'TRANSPORT_WRITE'}
  [Array]::Clear($frame,0,$frame.Length)
  if(!$child.WaitForExit(60000)){$child.Kill();[void]$child.WaitForExit(5000);Fail 'RECEIVER_TIMEOUT'}
  $out=$child.StandardOutput.ReadToEnd();[void]$child.StandardError.ReadToEnd()
  $r=$null;try{$r=$out|ConvertFrom-Json}catch{}
  if($child.ExitCode -ne 0){if($r -and $r.code -ceq 'b67_offline_rejected'){Fail 'RECEIVER_REJECTED'};Fail 'RECEIVER_EXIT'}
  if(!$r -or $r.ok -ne $true -or $r.exact -ne $true -or $r.argvLeak -ne $false -or $r.envLeak -ne $false -or $r.networkAttempts -ne 0 -or $r.remoteEnabled -ne $false){Fail 'RECEIVER_CONTRACT'}
  Mark 'receiver' 'ok'
  $passed=$true
 }
 }
}catch{$failed=$true;if($codes -cnotcontains $code){$code='UNEXPECTED'}}
finally{
 # A receiver still alive after an earlier failure is expected; killing it is the cleanup. Only a kill that fails or does not finish is a cleanup failure.
 try{if($child){if(!$child.HasExited){$child.Kill();if(!$child.WaitForExit(5000)){$cleanupFailed=$true};if($passed){$passed=$false;$cleanupFailed=$true}};$child.Dispose()}}catch{$cleanupFailed=$true}
 try{if($bstr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)};if($secure){$secure.Dispose()}}catch{$cleanupFailed=$true}
 try{if($frame){[Array]::Clear($frame,0,$frame.Length)};if($bytes){[Array]::Clear($bytes,0,$bytes.Length)};if($chars){[Array]::Clear($chars,0,$chars.Length)}}catch{$cleanupFailed=$true}
 foreach($handle in $locks){try{$handle.Dispose()}catch{$cleanupFailed=$true}}
}
if($passed -and !$failed -and !$cleanupFailed){Mark 'cleanup' 'ok';Write-Host ('B67_SELFTEST=PASS mode='+$Mode+' syntheticOnly=True cleanup=True');exit 0}
if($failed){Write-Host ('B67_SELFTEST=FAIL mode='+$Mode+' stage='+$stage+' code='+$code+' cleanup='+$(if($cleanupFailed){'failed'}else{'ok'}))}
else{Write-Host ('B67_SELFTEST=FAIL mode='+$Mode+' stage=cleanup code=CLEANUP_FAILED cleanup=failed')}
exit 1
