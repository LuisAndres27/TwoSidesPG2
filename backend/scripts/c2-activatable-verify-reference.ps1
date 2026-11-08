param(
  [Parameter(Mandatory=$true)][string]$ReleaseDirectory,
  [Parameter(Mandatory=$true)][ValidatePattern('^[A-Fa-f0-9]{64}$')][string]$ExpectedManifestSha256,
  [ValidateSet('c2-blocked','c2-remote-once')][string]$ExpectedMode='c2-blocked'
)
# Read-only verification. Never prompt, create a run, receive credentials or connect.
# Expected digest must be recovered from the external reference, not auto-discovered here.
$ErrorActionPreference='Stop'
try{
  if($args.Count){throw 'args'}
  $base=[IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'TwoSides\C2Runtime')).TrimEnd('\')
  $root=[IO.Path]::GetFullPath($ReleaseDirectory).TrimEnd('\')
  if([IO.Path]::GetDirectoryName($root) -cne $base -or [IO.Path]::GetFileName($root) -cnotmatch '^c2-[a-f0-9]{32}$'){throw 'path'}
  $cursor=$root
  while($cursor){$i=Get-Item -LiteralPath $cursor -Force;if(!$i.PSIsContainer -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'path'};$cursor=[IO.Path]::GetDirectoryName($cursor)}
  foreach($i in Get-ChildItem -LiteralPath $root -Force){if(@('package','manifest.json','runs','temp') -cnotcontains $i.Name -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'layout'}}
  foreach($name in @('runs','temp')){$i=Get-Item -LiteralPath (Join-Path $root $name) -Force;if(!$i.PSIsContainer -or @(Get-ChildItem -LiteralPath $i.FullName -Force).Count){throw 'mutable-state'}}
  if(Test-Path -LiteralPath (Join-Path (Join-Path $base 'consumed') ([IO.Path]::GetFileName($root)+'.json'))){throw 'consumed'}
  $manifestFile=Join-Path $root 'manifest.json'
  if((Get-FileHash -LiteralPath $manifestFile -Algorithm SHA256).Hash -cne $ExpectedManifestSha256.ToUpperInvariant()){throw 'manifest-hash'}
  $manifest=Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
  if($manifest.version -ne 2 -or $manifest.releaseId -cne [IO.Path]::GetFileName($root) -or $manifest.mode -cne $ExpectedMode){throw 'mode'}
  if($ExpectedMode -ceq 'c2-blocked' -and ($manifest.remoteEnabled -ne $false -or $null -ne $manifest.activation)){throw 'blocked-state'}
  $package=Join-Path $root 'package';$pending=New-Object 'System.Collections.Generic.Stack[string]';$pending.Push($package);$files=@{}
  while($pending.Count){$p=$pending.Pop();$i=Get-Item -LiteralPath $p -Force;if($i.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'link'}
    if($i.PSIsContainer){foreach($child in Get-ChildItem -LiteralPath $p -Force){$pending.Push($child.FullName)}}
    else{$relative=$p.Substring($package.Length+1).Replace('\','/');$files[$relative]=$p}}
  if($files.Count -ne @($manifest.files).Count){throw 'inventory'}
  $seen=@{}
  foreach($entry in $manifest.files){if($seen.ContainsKey($entry.path) -or !$files.ContainsKey($entry.path) -or $entry.path -match '(^|/)\.\.?(/|$)|[:\\\x00\r\n]|^/|//' -or $entry.sha256 -cnotmatch '^[A-F0-9]{64}$'){throw 'inventory'};$seen[$entry.path]=$true
    if((Get-FileHash -LiteralPath $files[$entry.path] -Algorithm SHA256).Hash -cne $entry.sha256){throw 'payload-hash'}}
  if(!$files.ContainsKey('scripts/c2-receiver.ps1')){throw 'launcher'}
  # Dot-source only after verifying all bytes against the externally supplied manifest digest.
  . $files['scripts/c2-receiver.ps1']
  Test-C2PayloadBinding $manifest ([IO.Path]::GetFileName($root))
  $t=$manifest.target
  if($t.host -cne $script:C2Fixed.AtlasHost -or $t.user -cne $script:C2Fixed.User -or $t.database -cne $script:C2Fixed.Database -or $t.authSource -cne 'admin' -or $t.authMechanism -cne 'DEFAULT' -or $t.tls -ne $true){throw 'target'}
  if($ExpectedMode -ceq 'c2-remote-once'){Test-C2Activation $manifest ([string]$manifest.activation.executionId) ([datetime]::UtcNow)}
  if((Get-FileHash -LiteralPath $script:C2Node -Algorithm SHA256).Hash -cne $manifest.node.sha256){throw 'node'}
  Write-Output ('C2_ACTIVATABLE_REFERENCE_CHECK=PASS files='+$files.Count+' mode='+$ExpectedMode)
  Write-Output 'Digest comparison only; B00 and external provenance are not certified. No activation performed.'
}catch{Write-Output 'C2_ACTIVATABLE_REFERENCE_CHECK=FAIL';exit 1}
