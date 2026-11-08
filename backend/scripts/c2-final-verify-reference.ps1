param([string]$ReleaseDirectory,[string]$ExpectedManifestSha256)
# Read-only final-release checker. No receiver, credential input, ACL changes or network.
$ErrorActionPreference='Stop'
try{
  if($args.Count -or $ExpectedManifestSha256 -notmatch '^[A-Fa-f0-9]{64}$'){throw 'args'}
  $base=[IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'TwoSides\C2Runtime')).TrimEnd('\')
  $root=[IO.Path]::GetFullPath($ReleaseDirectory).TrimEnd('\')
  if([IO.Path]::GetDirectoryName($root) -cne $base -or [IO.Path]::GetFileName($root) -notmatch '^c2-[a-f0-9]{32}$'){throw 'path'}
  $cursor=$root
  while($cursor){$i=Get-Item -LiteralPath $cursor -Force;if(!$i.PSIsContainer -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'path'};$cursor=[IO.Path]::GetDirectoryName($cursor)}
  $manifestFile=Join-Path $root 'manifest.json'
  if((Get-Item -LiteralPath $manifestFile -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'link'}
  if((Get-FileHash -LiteralPath $manifestFile -Algorithm SHA256).Hash -cne $ExpectedManifestSha256.ToUpperInvariant()){throw 'hash'}
  $manifest=Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8|ConvertFrom-Json
  if($manifest.releaseId -cne [IO.Path]::GetFileName($root) -or $manifest.mode -cne 'offline-only' -or $manifest.remoteEnabled -ne $false){throw 'mode'}
  foreach($i in Get-ChildItem -LiteralPath $root -Force){if(@('package','manifest.json','runs','temp') -cnotcontains $i.Name){throw 'layout'}}
  foreach($name in @('temp','runs')){$p=Join-Path $root $name;$i=Get-Item -LiteralPath $p -Force;if(!$i.PSIsContainer -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -or @(Get-ChildItem -LiteralPath $p -Force).Count){throw 'mutable-state'}}
  $package=Join-Path $root 'package';$files=@{}
  $pending=New-Object 'System.Collections.Generic.Stack[string]';$pending.Push($package)
  while($pending.Count){$p=$pending.Pop();$i=Get-Item -LiteralPath $p -Force;if($i.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'link'}
    if($i.PSIsContainer){foreach($child in Get-ChildItem -LiteralPath $p -Force){$pending.Push($child.FullName)}}
    else{$relative=$p.Substring($package.Length+1).Replace('\','/');$files[$relative]=$p}}
  if($files.Count -ne @($manifest.files).Count){throw 'inventory'}
  $seen=@{}
  foreach($entry in $manifest.files){if($seen.ContainsKey($entry.path) -or !$files.ContainsKey($entry.path) -or $entry.path -match '(^|/)\.\.?(/|$)|[:\\]'){throw 'inventory'};$seen[$entry.path]=$true
    if((Get-FileHash -LiteralPath $files[$entry.path] -Algorithm SHA256).Hash -cne $entry.sha256){throw 'file-hash'}}
  if((Get-FileHash -LiteralPath 'C:\Program Files\nodejs\node.exe' -Algorithm SHA256).Hash -cne $manifest.node.sha256){throw 'node'}
  Write-Output ('C2_FINAL_REFERENCE_CHECK=PASS files='+$files.Count+' mode=offline-only')
  Write-Output 'Coincidencia con el digest aportado; no certifica independencia, B00 ni autorizacion remota.'
}catch{Write-Output 'C2_FINAL_REFERENCE_CHECK=FAIL';exit 1}
