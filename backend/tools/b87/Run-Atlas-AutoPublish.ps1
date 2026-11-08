# B87 - starts the AUTOMATIC local publisher (identity publisher only), a process separate from Express. FOR THE OWNER ONLY, after authorizing it.
# Claude Code must NOT run this script. ASCII only.
#   .\tools\b87\Run-Atlas-AutoPublish.ps1 -AtlasHost <cluster>.<id>.mongodb.net [-IntervalMinutes 2]
# Asks ONCE (hidden prompt) for the password of twosides_statistics_publisher_v1, sets the non-secret STATISTICS_* variables for THIS process only, feeds the
# credentials to node through stdin (never arguments, files or the environment) and clears them afterwards. The password lives only in memory while it runs.
[CmdletBinding(PositionalBinding=$false)]
param(
  [Parameter(Mandatory=$true)][string]$AtlasHost,
  [ValidateRange(1,1440)][double]$IntervalMinutes=2
)
$ErrorActionPreference='Stop'
Write-Host 'This connects to MongoDB ATLAS and periodically copies the aggregate counters of twosides_statistics_demo into twosides_statistics_analytics_demo (only when they change).'
$phrase=Read-Host 'Type the authorization phrase exactly (see the quick guide) or press Enter to cancel'
if([string]::IsNullOrWhiteSpace($phrase)){ Write-Host 'Cancelled. Nothing was contacted.'; exit 0 }
$secure=Read-Host 'Password for twosides_statistics_publisher_v1 (hidden)' -AsSecureString
$bstr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try{
  $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  $env:STATISTICS_ENABLE='true'; $env:STATISTICS_STORAGE='atlas-test'; $env:STATISTICS_ATLAS_AUTHORIZATION=$phrase
  $env:STATISTICS_ATLAS_HOST=$AtlasHost; $env:STATISTICS_DATABASE='twosides_statistics_demo'; $env:STATISTICS_ANALYTICS_DATABASE='twosides_statistics_analytics_demo'; $env:STATISTICS_POLICY_VERSION='b82-run-hybrid-v1'
  $env:STATISTICS_SERVICE_USER='twosides_statistics_publisher_v1'
  $json=(@{username='twosides_statistics_publisher_v1';password=$plain}|ConvertTo-Json -Compress)
  $backend=Resolve-Path (Join-Path $PSScriptRoot '..\..')
  Push-Location $backend
  try{ $json | & node tools/b87/auto-publish.mjs --interval-minutes ([string]::Format([Globalization.CultureInfo]::InvariantCulture,'{0}',$IntervalMinutes)) } finally { Pop-Location }
  $code=$LASTEXITCODE
} finally {
  if($bstr -ne [IntPtr]::Zero){ [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  $plain=$null; $json=$null
  Remove-Item Env:STATISTICS_* -ErrorAction SilentlyContinue
}
if($null -eq $code){ $code=0 }
exit $code
