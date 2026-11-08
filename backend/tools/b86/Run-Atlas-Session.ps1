# B86 - runs ONE Atlas statistics session. FOR THE OWNER ONLY, AFTER the manual Atlas steps of docs/B86_GUIA_RAPIDA_ATLAS.md.
# Claude Code must NOT run this script. ASCII only.
#   .\tools\b86\Run-Atlas-Session.ps1 -Identity reader -Action preflight -AtlasHost <cluster>.<id>.mongodb.net
# What it does: asks for the database user's password with a HIDDEN prompt, sets the non-secret STATISTICS_* variables for THIS process only,
# feeds the credentials to node through stdin (never arguments, never a file, never the environment) and clears them afterwards.
[CmdletBinding(PositionalBinding=$false)]
param(
  [Parameter(Mandatory=$true)][ValidateSet('ingest','schema','publisher','reader')][string]$Identity,
  [Parameter(Mandatory=$true)][ValidateSet('preflight','provision','seed','publish','read')][string]$Action,
  [Parameter(Mandatory=$true)][string]$AtlasHost
)
$ErrorActionPreference='Stop'
$map=@{ingest='seed';schema='provision';publisher='publish';reader='read'}
if($Action -ne 'preflight' -and $map[$Identity] -ne $Action){ Write-Host "Action $Action does not match identity $Identity."; exit 1 }
Write-Host 'This connects to MongoDB ATLAS and uses the synthetic databases twosides_statistics_demo and twosides_statistics_analytics_demo.'
$phrase=Read-Host 'Type the authorization phrase exactly (see the quick guide) or press Enter to cancel'
if([string]::IsNullOrWhiteSpace($phrase)){ Write-Host 'Cancelled. Nothing was contacted.'; exit 0 }
$secure=Read-Host "Password for twosides_statistics_${Identity}_v1 (hidden)" -AsSecureString
$bstr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try{
  $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  $env:STATISTICS_ENABLE='true'; $env:STATISTICS_STORAGE='atlas-test'; $env:STATISTICS_ATLAS_AUTHORIZATION=$phrase
  $env:STATISTICS_ATLAS_HOST=$AtlasHost; $env:STATISTICS_DATABASE='twosides_statistics_demo'; $env:STATISTICS_ANALYTICS_DATABASE='twosides_statistics_analytics_demo'; $env:STATISTICS_POLICY_VERSION='b82-run-hybrid-v1'
  $env:STATISTICS_SERVICE_USER="twosides_statistics_${Identity}_v1"
  $json=(@{username="twosides_statistics_${Identity}_v1";password=$plain}|ConvertTo-Json -Compress)
  $backend=Resolve-Path (Join-Path $PSScriptRoot '..\..')
  Push-Location $backend
  try{ $json | & node tools/b86/atlas-session.mjs --action $Action } finally { Pop-Location }
  $code=$LASTEXITCODE
} finally {
  if($bstr -ne [IntPtr]::Zero){ [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  $plain=$null; $json=$null
  Remove-Item Env:STATISTICS_* -ErrorAction SilentlyContinue
}
if($null -eq $code){ $code=0 }
exit $code
