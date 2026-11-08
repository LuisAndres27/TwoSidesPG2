# B84 - starts the LOCAL demonstration (loopback only). ASCII only.
#   .\tools\b84\Start-B84-Demo.ps1           start the server on http://127.0.0.1:4184/dashboard/
#   .\tools\b84\Start-B84-Demo.ps1 -Seed     also load the synthetic data first (idempotent: running it twice does not double count)
[CmdletBinding(PositionalBinding=$false)]
param([switch]$Seed,[int]$Port=4184)
$ErrorActionPreference='Stop'
$backend=Resolve-Path (Join-Path $PSScriptRoot '..\..')
$state=(& docker inspect -f '{{.State.Running}} {{.Config.Image}}' twosides-b811-mongo) 2>$null
if($state -ne 'true mongo:8.0'){ Write-Host 'The container twosides-b811-mongo (mongo:8.0) is not running. Start it first (docker start twosides-b811-mongo).'; exit 1 }
Push-Location $backend
try{
  $args=@('tools/b84/demo-server.mjs','--port',"$Port"); if($Seed){ $args+='--seed' }
  & node @args
} finally { Pop-Location }
exit 0
