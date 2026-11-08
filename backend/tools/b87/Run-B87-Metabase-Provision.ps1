# B87 - creates the Atlas connection, the collection and the dashboard "Datos de prueba del propietario" on a NEW Metabase. FOR THE OWNER ONLY. ASCII only.
# Claude Code must NOT run this script.
#   .\tools\b87\Run-B87-Metabase-Provision.ps1 -MetabaseUrl https://<host> -AtlasHost <cluster>.<id>.mongodb.net [-WithEvaluator]
# Asks, with HIDDEN prompts, the Metabase administrator password, the Atlas reader password and (optionally) the evaluator password. Nothing secret is taken from
# arguments, files or the environment: the data goes to node through stdin and is cleared afterwards. Use http://127.0.0.1:<port> only through an SSH/SSM tunnel.
[CmdletBinding(PositionalBinding=$false)]
param(
  [Parameter(Mandatory=$true)][string]$MetabaseUrl,
  [Parameter(Mandatory=$true)][string]$AtlasHost,
  [switch]$WithEvaluator
)
$ErrorActionPreference='Stop'
function Read-Secret([string]$prompt){
  $secure=Read-Host $prompt -AsSecureString
  $bstr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try{ return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
Write-Host 'This configures a NEW Metabase and gives it read-only access to the Atlas analytical database (user twosides_statistics_reader_v1).'
$adminEmail=Read-Host 'Metabase administrator e-mail (will be created if the instance is new)'
$adminPassword=Read-Secret 'Metabase administrator password (hidden, at least 15 characters)'
$readerPassword=Read-Secret 'Atlas password of twosides_statistics_reader_v1 (hidden)'
$payload=@{metabaseUrl=$MetabaseUrl;admin=@{email=$adminEmail;password=$adminPassword};mode='atlas';host=$AtlasHost;readerPassword=$readerPassword}
if($WithEvaluator){
  $payload.viewer=@{email=(Read-Host 'Evaluator e-mail');password=(Read-Secret 'Evaluator password (hidden, at least 15 characters)')}
}
try{
  $json=($payload|ConvertTo-Json -Compress -Depth 5)
  $backend=Resolve-Path (Join-Path $PSScriptRoot '..\..')
  Push-Location $backend
  try{ $json | & node tools/b87/metabase-provision.mjs } finally { Pop-Location }
  $code=$LASTEXITCODE
} finally {
  $json=$null;$adminPassword=$null;$readerPassword=$null;$payload=$null
}
if($null -eq $code){ $code=0 }
exit $code
