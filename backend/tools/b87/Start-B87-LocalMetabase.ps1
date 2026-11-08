# B87 - starts (or restarts) the LOCAL hardened Metabase 0.65.3.4 for the owner's real test data. 127.0.0.1 only, no Caddy, no AWS. ASCII only.
#   .\tools\b87\Start-B87-LocalMetabase.ps1 [-Port 4387]
# State: container twosides-b87-owner-metabase, named volume twosides-b87-owner-metabase-data (H2 application database), secret keys in
# %LOCALAPPDATA%\TwoSidesB87\metabase.env (generated here, never printed, outside OneDrive). Does not touch the B85 containers.
[CmdletBinding(PositionalBinding=$false)]
param([ValidateRange(1024,65535)][int]$Port=4387)
$ErrorActionPreference='Stop'
if($Port -eq 4185){ throw 'Port 4185 belongs to B85.' }
$image='metabase/metabase@sha256:e8f38a6d846accfdd44cf8f31d9fb50648162ddf22daf469dac3a1e4727a7657'   # v0.65.3.4
$name='twosides-b87-owner-metabase'; $volume='twosides-b87-owner-metabase-data'
$dir=Join-Path $env:LOCALAPPDATA 'TwoSidesB87'; $envFile=Join-Path $dir 'metabase.env'
New-Item -ItemType Directory -Force $dir | Out-Null
function New-Key { $b=New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b) }
if(-not (Test-Path $envFile)){ Set-Content $envFile @("MB_ENCRYPTION_SECRET_KEY=$(New-Key)","MB_SESSION_SECRET_KEY=$(New-Key)") -Encoding ascii }
if(docker ps -a --filter "name=^/$name$" --format '{{.Names}}'){ docker rm -f $name | Out-Null }
docker volume create $volume | Out-Null
docker run -d --name $name --label twosides.b87.owner=true --memory 1536m --cpus 2 -p "127.0.0.1:${Port}:3000" -v "${volume}:/metabase-data" --env-file $envFile `
  -e MB_DB_FILE=/metabase-data/metabase -e JAVA_OPTS=-Xmx1024m -e MB_ANON_TRACKING_ENABLED=false -e MB_CHECK_FOR_UPDATES=false `
  -e MB_DISABLE_LEGACY_STARTUP_ENCRYPTION=true -e "MB_SITE_URL=http://127.0.0.1:$Port" -e MB_ENABLE_PUBLIC_SHARING=false -e MB_ENABLE_EMBEDDING=false `
  --cap-drop=ALL --cap-add=CHOWN --cap-add=SETUID --cap-add=SETGID --cap-add=DAC_OVERRIDE --cap-add=FOWNER --security-opt=no-new-privileges:true --pids-limit=512 `
  --log-driver json-file --log-opt max-size=10m --log-opt max-file=3 $image | Out-Null
Write-Host "Metabase starting on http://127.0.0.1:$Port (first start takes about a minute)."
for($i=0;$i -lt 90;$i++){ try{ $r=Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 3; if($r.status -eq 'ok'){ Write-Host 'Ready.'; exit 0 } }catch{}; Start-Sleep 3 }
Write-Host 'Not ready after 270 s: check "docker logs twosides-b87-owner-metabase".'; exit 1
