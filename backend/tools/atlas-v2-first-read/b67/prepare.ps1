# Create NEW directories with their initial private DACL. Never alter an existing object's ACL.
param()
$ErrorActionPreference='Stop'
$workspace=Split-Path (Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent) -Parent
$tools=Join-Path $workspace 'backend\tools\atlas-v2-first-read'
$download=Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\TwoSides_B66_Referencia'
$local=[Environment]::GetFolderPath('LocalApplicationData');$parent=Join-Path $local 'TwoSides';$base=Join-Path $parent 'AtlasV2FirstRead'
$runId=[Guid]::NewGuid().ToString('N');$run=Join-Path $base $runId
$me=[Security.Principal.WindowsIdentity]::GetCurrent().User;$allowed=@($me.Value,'S-1-5-18','S-1-5-32-544')
$approved=@{'gate.mjs'='e1fa695193bb716dc45db24dc27f9b36625cbb5e1313391d87071040d3f8a695';'probe.mjs'='fb7b63c429c3cde1055561038173068e0525f247f70ee064b8d248832b032080';'receiver.mjs'='11fc67bc135ef4ccac0a8623ec5529818a400829fe12d428da68ae3473c13354';'send-first-read.ps1'='21ab67270d8eb7f6ee50b06b38298ec6db9628e70ec1377d073f8c0ded7ebbde';'backend-integrity-manifest.v5-B62.json'='2a4956e951217dff2501d3ffbd35c9024554166e9126ad0134d8fb58c77ad726'}
function Check-Existing([string]$p){
 $item=Get-Item -LiteralPath $p -Force;if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Link rejected'}
 $acl=Get-Acl -LiteralPath $p
 if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $allowed){throw 'Owner rejected'}
 foreach($a in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
  if($a.AccessControlType -eq 'Allow' -and $a.IdentityReference.Value -notin $allowed -and -not ($a.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly)){
   $writeMask=2 -bor 4 -bor 16 -bor 64 -bor 256 -bor 65536 -bor 262144 -bor 524288
   if(([int64]$a.FileSystemRights -band $writeMask) -ne 0){throw 'Additional write access rejected'}
  }
 }
}
foreach($p in @($parent,$local,(Split-Path $local -Parent),(Split-Path (Split-Path $local -Parent) -Parent))){Check-Existing $p}
foreach($name in $approved.Keys){$p=Join-Path $download $name;if((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Link rejected'};if((Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() -cne $approved[$name]){throw 'External reference mismatch'}}
function New-Private([string]$p){
 if(Test-Path -LiteralPath $p){throw 'Existing path rejected'}
 $s=New-Object Security.AccessControl.DirectorySecurity;$s.SetOwner($me);$s.SetAccessRuleProtection($true,$false)
 foreach($sid in $allowed){$identity=New-Object Security.Principal.SecurityIdentifier($sid);$rule=New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$s.AddAccessRule($rule)}
 [void][IO.Directory]::CreateDirectory($p,$s);Check-Existing $p
 if(!(Get-Acl -LiteralPath $p).AreAccessRulesProtected){throw 'New directory not protected'}
}
if(!(Test-Path -LiteralPath $base)){New-Private $base}else{Check-Existing $base}
New-Private $run
$files=[ordered]@{}
foreach($name in @('gate.mjs','probe.mjs','receiver.mjs','send-first-read.ps1')){[IO.File]::Copy((Join-Path $download $name),(Join-Path $run $name),$false);$files[$name]=$approved[$name]}
foreach($name in @('offline-receiver.mjs','offline-selftest.ps1')){[IO.File]::Copy((Join-Path $PSScriptRoot $name),(Join-Path $run $name),$false);$files[$name]=(Get-FileHash -LiteralPath (Join-Path $run $name) -Algorithm SHA256).Hash.ToLowerInvariant()}
[IO.File]::Copy((Join-Path $download 'backend-integrity-manifest.v5-B62.json'),(Join-Path $run 'v5-reference.json'),$false);$files['v5-reference.json']=$approved['backend-integrity-manifest.v5-B62.json']
$node='C:\Program Files\nodejs\node.exe';Check-Existing $node;Check-Existing (Split-Path $node -Parent)
foreach($name in $files.Keys){$p=Join-Path $run $name;Check-Existing $p;if((Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() -cne $files[$name]){throw 'Copy mismatch'}}
$d=[ordered]@{kind='two-sides-b67-offline-only';runId=$runId;remoteEnabled=$false;backendRoot=(Join-Path $workspace 'backend');createdAt=[DateTime]::UtcNow.ToString('o');nodePath=$node;nodeSha256=(Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash.ToLowerInvariant();files=$files}
$seal=Join-Path $run 'deployment.json';$bytes=(New-Object Text.UTF8Encoding($false)).GetBytes(($d|ConvertTo-Json -Depth 6 -Compress));$stream=[IO.File]::Open($seal,'CreateNew','Write','None');try{$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
Check-Existing $seal
[PSCustomObject]@{runDirectory=$run;deploymentSha256=(Get-FileHash -LiteralPath $seal -Algorithm SHA256).Hash.ToLowerInvariant();selftestSha256=$files['offline-selftest.ps1'];remoteEnabled=$false;files=$files}|ConvertTo-Json -Depth 6 -Compress
