param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9A-Fa-f]{64}$')][string]$ExpectedManifestSha256
)
# Read-only comparison of the sealed C2Runtime release with a digest supplied from an
# independent medium. It writes nothing, reads no credentials/.env/SQLite, opens no
# network connection and executes nothing from the release. Output: fixed codes and counts only.
$ErrorActionPreference='Stop'
$release='c2-67d95728399e4e30a406eba7301979fd'
$expectedNode='C:\Program Files\nodejs\node.exe'
function Stop-Check([string]$code){Write-Output "C2_REFERENCE_CHECK=FAIL code=$code";exit 1}
try{
  $local=[Environment]::GetFolderPath('LocalApplicationData')
  $chain=@((Join-Path $local 'TwoSides'),(Join-Path $local 'TwoSides\C2Runtime'),(Join-Path $local "TwoSides\C2Runtime\$release"))
  foreach($dir in $chain){
    if(!(Test-Path -LiteralPath $dir -PathType Container)){Stop-Check 'path_missing'}
    if((Get-Item -LiteralPath $dir -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){Stop-Check 'path_redirected'}
  }
  $root=$chain[2]
  $manifestFile=Join-Path $root 'manifest.json'
  if(!(Test-Path -LiteralPath $manifestFile -PathType Leaf)){Stop-Check 'manifest_missing'}
  $actualManifest=(Get-FileHash -LiteralPath $manifestFile -Algorithm SHA256).Hash
  if($actualManifest -ne $ExpectedManifestSha256.ToUpperInvariant()){Stop-Check 'manifest_differs_from_reference'}
  $manifest=Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
  if($manifest.releaseId -cne $release -or $manifest.remoteEnabled -ne $false){Stop-Check 'manifest_unexpected_content'}
  $package=Join-Path $root 'package'
  $names=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  foreach($item in Get-ChildItem -LiteralPath $package -Recurse -Force){
    if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){Stop-Check 'link_in_package'}
    if(!$item.PSIsContainer){[void]$names.Add($item.FullName.Substring($package.Length+1).Replace('\','/'))}
  }
  $listed=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  foreach($entry in $manifest.files){[void]$listed.Add([string]$entry.path)}
  if($names.Count -ne $listed.Count -or !$names.SetEquals($listed)){Stop-Check 'file_set_differs'}
  $bad=0
  foreach($entry in $manifest.files){
    $file=Join-Path $package ($entry.path.Replace('/','\'))
    if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne ([string]$entry.sha256).ToUpperInvariant()){$bad++}
  }
  if($bad){Stop-Check 'file_hash_differs'}
  if((Get-FileHash -LiteralPath $expectedNode -Algorithm SHA256).Hash -ne ([string]$manifest.node.sha256).ToUpperInvariant()){Stop-Check 'node_hash_differs'}
  if((Get-AuthenticodeSignature -LiteralPath $expectedNode).Status -ne 'Valid'){Stop-Check 'node_signature_invalid'}
  Write-Output "C2_REFERENCE_CHECK=PASS files=$($listed.Count) release=$release"
  Write-Output 'NOTE: PASS only means the release equals the supplied digest; it does not prove the digest is independent or that B00 is resolved.'
  exit 0
}catch{Stop-Check 'check_error'}
