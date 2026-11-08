# B87 - starts the persistent LOCAL Express (127.0.0.1 only) that stores the statistics of ONE authorized test game in MongoDB ATLAS (ingest identity).
# FOR THE OWNER ONLY, after authorizing it. Claude Code must NOT run this script. ASCII only.
#   .\tools\b87\Run-Atlas-Express.ps1 -AtlasHost <cluster>.<id>.mongodb.net [-KitDir C:\TwoSidesStatsKit\hand-over] [-Port 4187]
# It asks (hidden prompt) for the password of twosides_statistics_ingest_v1, sets the non-secret STATISTICS_* variables for THIS process only, feeds the credentials
# to node through stdin (never arguments, files or the environment) and clears them afterwards. Leave the window open while the game is used; Ctrl+C stops it.
[CmdletBinding(PositionalBinding=$false)]
param(
  [Parameter(Mandatory=$true)][string]$AtlasHost,
  [string]$KitDir='C:\TwoSidesStatsKit\hand-over',
  [ValidateRange(1024,65535)][int]$Port=4187
)
$ErrorActionPreference='Stop'
if(-not [IO.Path]::IsPathRooted($KitDir)){ Write-Host 'KitDir must be an absolute path.'; exit 1 }
Write-Host 'This connects to MongoDB ATLAS (database twosides_statistics_demo) and accepts events ONLY from the local test game, on 127.0.0.1.'
$phrase=Read-Host 'Type the authorization phrase exactly (see the quick guide) or press Enter to cancel'
if([string]::IsNullOrWhiteSpace($phrase)){ Write-Host 'Cancelled. Nothing was contacted.'; exit 0 }
$secure=Read-Host 'Password for twosides_statistics_ingest_v1 (hidden)' -AsSecureString
$bstr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try{
  $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  $env:STATISTICS_ENABLE='true'; $env:STATISTICS_STORAGE='atlas-test'; $env:STATISTICS_ATLAS_AUTHORIZATION=$phrase
  $env:STATISTICS_ATLAS_HOST=$AtlasHost; $env:STATISTICS_DATABASE='twosides_statistics_demo'; $env:STATISTICS_ANALYTICS_DATABASE='twosides_statistics_analytics_demo'; $env:STATISTICS_POLICY_VERSION='b82-run-hybrid-v1'
  $env:STATISTICS_SERVICE_USER='twosides_statistics_ingest_v1'
  $json=(@{username='twosides_statistics_ingest_v1';password=$plain}|ConvertTo-Json -Compress)
  $backend=Resolve-Path (Join-Path $PSScriptRoot '..\..')
  Push-Location $backend
  try{ $json | & node tools/b87/express-atlas.mjs --kit-dir $KitDir --port $Port } finally { Pop-Location }
  $code=$LASTEXITCODE
} finally {
  if($bstr -ne [IntPtr]::Zero){ [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  $plain=$null; $json=$null
  Remove-Item Env:STATISTICS_* -ErrorAction SilentlyContinue
}
if($null -eq $code){ $code=0 }
exit $code
