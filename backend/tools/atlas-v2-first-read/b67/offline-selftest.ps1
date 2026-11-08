# B67 synthetic-only prompt. Never type an Atlas password here.
param(
 [Parameter(Mandatory=$true)][ValidateSet('Accept','Cancel')][string]$Mode,
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$DeploymentSha256,
 [switch]$Automation
)
$ErrorActionPreference='Stop'
$locks=New-Object 'System.Collections.Generic.List[System.IDisposable]'
$secure=$null;$bstr=[IntPtr]::Zero;$chars=$null;$bytes=$null;$frame=$null;$child=$null;$passed=$false;$accepted=$false
$dir=$PSScriptRoot;$node=$null;$local=[Environment]::GetFolderPath('LocalApplicationData')
try {
 $id=Split-Path $dir -Leaf
 if($id -cnotmatch '^[a-f0-9]{32}$' -or $dir -ine (Join-Path $local ('TwoSides\AtlasV2FirstRead\'+$id))){throw 'Blocked'}
 $me=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;$allowed=@($me,'S-1-5-18','S-1-5-32-544')
 function Check-Private([string]$p,[bool]$directory){
  $item=Get-Item -LiteralPath $p -Force
  if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.PSIsContainer -ne $directory){throw 'Blocked'}
  $acl=Get-Acl -LiteralPath $p
  if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $allowed -or ($directory -and !$acl.AreAccessRulesProtected)){throw 'Blocked'}
  foreach($a in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($a.AccessControlType -eq 'Allow' -and $a.IdentityReference.Value -notin $allowed -and [int64]$a.FileSystemRights -ne 0){throw 'Blocked'}}
 }
 Check-Private $dir $true
 $ancestor=Get-Item -LiteralPath $dir -Force;while($ancestor){if($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Blocked'};$ancestor=$ancestor.Parent}
 $seal=Join-Path $dir 'deployment.json';Check-Private $seal $false
 $locks.Add([IO.File]::Open($seal,'Open','Read','Read'))
 if((Get-FileHash -LiteralPath $seal -Algorithm SHA256).Hash.ToLowerInvariant() -cne $DeploymentSha256){throw 'Blocked'}
 $d=Get-Content -LiteralPath $seal -Raw | ConvertFrom-Json
 if($d.kind -cne 'two-sides-b67-offline-only' -or $d.remoteEnabled -ne $false -or $d.runId -cne $id){throw 'Blocked'}
 $names=@('gate.mjs','probe.mjs','receiver.mjs','send-first-read.ps1','offline-receiver.mjs','offline-selftest.ps1','v5-reference.json')
 if(@($d.files.PSObject.Properties).Count -ne $names.Count){throw 'Blocked'}
 foreach($name in $names){$p=Join-Path $dir $name;Check-Private $p $false;$locks.Add([IO.File]::Open($p,'Open','Read','Read'));if((Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() -cne $d.files.$name){throw 'Blocked'}}
 $node=$d.nodePath
 if($node -cne 'C:\Program Files\nodejs\node.exe' -or (Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash.ToLowerInvariant() -cne $d.nodeSha256){throw 'Blocked'}
 $locks.Add([IO.File]::Open($node,'Open','Read','Read'))
 function Start-Offline([string]$stage){
  $i=New-Object Diagnostics.ProcessStartInfo;$i.FileName=$node;$i.Arguments='"'+(Join-Path $dir 'offline-receiver.mjs')+'" '+$stage+' '+$DeploymentSha256
  $i.WorkingDirectory=$dir;$i.UseShellExecute=$false;$i.CreateNoWindow=$true;$i.RedirectStandardInput=$true;$i.RedirectStandardOutput=$true;$i.RedirectStandardError=$true
  $i.EnvironmentVariables.Clear();$win=[Environment]::GetFolderPath('Windows');$i.EnvironmentVariables['SystemRoot']=$win;$i.EnvironmentVariables['windir']=$win;$i.EnvironmentVariables['PATH']=Join-Path $win 'System32';$i.EnvironmentVariables['LOCALAPPDATA']=$local
  $encoding=[Console]::InputEncoding
  try{if($encoding.GetPreamble().Length -gt 0){[Console]::InputEncoding=[Text.Encoding]::GetEncoding(1252)};return [Diagnostics.Process]::Start($i)}finally{[Console]::InputEncoding=$encoding}
 }
 # All integrity checks and the complete backend candidate verification precede even synthetic input.
 $child=Start-Offline '--preflight';$child.StandardInput.Close()
 if(!$child.WaitForExit(60000)){$child.Kill();throw 'Blocked'}
 $preflight=$child.StandardOutput.ReadToEnd();[void]$child.StandardError.ReadToEnd()
 if($child.ExitCode -ne 0 -or ($preflight|ConvertFrom-Json).ok -ne $true){throw 'Blocked'}
 $child.Dispose();$child=$null
 if($Automation){if($Mode -eq 'Accept'){$secure=ConvertTo-SecureString 'B67-ONLY-FAKE-2026!' -AsPlainText -Force}else{$secure=New-Object Security.SecureString}}
 else{
  if($Mode -eq 'Accept'){Write-Host 'SYNTHETIC ONLY: type B67-ONLY-FAKE-2026! at the hidden prompt. Never use a real password.'}
  else{Write-Host 'SYNTHETIC CANCEL: press Enter without typing anything. Never use a real password.'}
  $secure=Read-Host 'B67 synthetic input (hidden)' -AsSecureString
 }
 if($Mode -eq 'Cancel'){if($secure.Length -ne 0){throw 'Blocked'};$passed=$true}
 else {
  $bstr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);$chars=New-Object 'char[]' $secure.Length
  for($j=0;$j -lt $chars.Length;$j++){$chars[$j]=[char]([Runtime.InteropServices.Marshal]::ReadInt16($bstr,2*$j) -band 0xffff)}
  # Compare code units, without creating another plaintext string. Only the public sentinel is supported.
  $expected=[char[]]'B67-ONLY-FAKE-2026!';if($chars.Length -ne $expected.Length){throw 'Blocked'}
  for($j=0;$j -lt $expected.Length;$j++){if($chars[$j] -cne $expected[$j]){throw 'Blocked'}}
  $bytes=(New-Object Text.UTF8Encoding($false,$true)).GetBytes($chars);$frame=New-Object 'byte[]' (4+$bytes.Length)
  $frame[0]=($bytes.Length -shr 24) -band 255;$frame[1]=($bytes.Length -shr 16) -band 255;$frame[2]=($bytes.Length -shr 8) -band 255;$frame[3]=$bytes.Length -band 255;[Array]::Copy($bytes,0,$frame,4,$bytes.Length)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr);$bstr=[IntPtr]::Zero;$secure.Dispose();$secure=$null
  [Array]::Clear($chars,0,$chars.Length);[Array]::Clear($bytes,0,$bytes.Length)
  $child=Start-Offline '--receive-synthetic';$accepted=$true
  $child.StandardInput.BaseStream.Write($frame,0,$frame.Length);$child.StandardInput.BaseStream.Flush();$child.StandardInput.Close();[Array]::Clear($frame,0,$frame.Length)
  if(!$child.WaitForExit(60000)){$child.Kill();throw 'Blocked'}
  $out=$child.StandardOutput.ReadToEnd();[void]$child.StandardError.ReadToEnd();if($child.ExitCode -ne 0){throw 'Blocked'};$r=$out|ConvertFrom-Json
  if($r.ok -ne $true -or $r.exact -ne $true -or $r.argvLeak -ne $false -or $r.envLeak -ne $false -or $r.networkAttempts -ne 0 -or $r.remoteEnabled -ne $false){throw 'Blocked'};$passed=$true
 }
}catch{Write-Host 'B67_SELFTEST=FAIL no details or input shown'}
finally{
 if($child){if(!$child.HasExited){$child.Kill();$passed=$false};$child.Dispose()}
 if($bstr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)};if($secure){$secure.Dispose()}
 if($frame){[Array]::Clear($frame,0,$frame.Length)};if($bytes){[Array]::Clear($bytes,0,$bytes.Length)};if($chars){[Array]::Clear($chars,0,$chars.Length)}
 foreach($handle in $locks){$handle.Dispose()}
}
if($passed){Write-Host ('B67_SELFTEST=PASS mode='+$Mode+' syntheticOnly=True cleanup=True');exit 0}else{exit 1}
