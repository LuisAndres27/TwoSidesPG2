# B86.4 - ONE-OFF connection diagnostic for the READER identity. FOR THE OWNER ONLY. Claude Code must NOT run this script. ASCII only.
#   .\tools\b86\Run-Atlas-Diagnose.ps1 -AtlasHost <cluster>.<id>.mongodb.net [-Variants E,F]   (default: all of A-F; A-D are already known)
# Asks the authorization phrase and the reader password with HIDDEN prompts, sets the non-secret STATISTICS_* variables for THIS process only,
# feeds the credentials to node through stdin (never arguments, never a file, never the environment) and clears them afterwards.
[CmdletBinding(PositionalBinding=$false)]
param(
  [Parameter(Mandatory=$true)][string]$AtlasHost,
  [ValidatePattern('^(all|[A-F](,[A-F])*)$')][string]$Variants='all'
)
$ErrorActionPreference='Stop'
Write-Host 'This connects to MongoDB ATLAS ONCE with twosides_statistics_reader_v1 (connect, hello, connectionStatus only; no data is read or written).'
$secPhrase=Read-Host 'Authorization phrase (hidden) or press Enter to cancel' -AsSecureString
$phraseBstr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secPhrase)
$phrase=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($phraseBstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($phraseBstr)
if([string]::IsNullOrWhiteSpace($phrase)){ Write-Host 'Cancelled. Nothing was contacted.'; exit 0 }
$secure=Read-Host 'Password for twosides_statistics_reader_v1 (hidden)' -AsSecureString
$bstr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try{
  $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  $env:STATISTICS_ENABLE='true'; $env:STATISTICS_STORAGE='atlas-test'; $env:STATISTICS_ATLAS_AUTHORIZATION=$phrase
  $env:STATISTICS_ATLAS_HOST=$AtlasHost; $env:STATISTICS_DATABASE='twosides_statistics_demo'; $env:STATISTICS_ANALYTICS_DATABASE='twosides_statistics_analytics_demo'; $env:STATISTICS_POLICY_VERSION='b82-run-hybrid-v1'
  $env:STATISTICS_SERVICE_USER='twosides_statistics_reader_v1'
  $json=(@{username='twosides_statistics_reader_v1';password=$plain}|ConvertTo-Json -Compress)
  $backend=Resolve-Path (Join-Path $PSScriptRoot '..\..')
  Push-Location $backend
  try{ $json | & node tools/b86/atlas-diagnose.mjs --variants $Variants } finally { Pop-Location }
  $code=$LASTEXITCODE
} finally {
  if($bstr -ne [IntPtr]::Zero){ [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  $plain=$null; $json=$null; $phrase=$null
  Remove-Item Env:STATISTICS_* -ErrorAction SilentlyContinue
}
if($null -eq $code){ $code=0 }
exit $code
