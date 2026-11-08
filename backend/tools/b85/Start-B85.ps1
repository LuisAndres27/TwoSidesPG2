$ErrorActionPreference='Stop'
# Starts only existing B85-owned containers, never downloads or recreates anything.
$analytics=(& docker inspect twosides-b85-analytics | ConvertFrom-Json)[0]
$metabase=(& docker inspect twosides-b85-metabase | ConvertFrom-Json)[0]
if ($LASTEXITCODE -ne 0 -or $analytics.Name -ne '/twosides-b85-analytics' -or $metabase.Name -ne '/twosides-b85-metabase') { throw 'Contenedores B85 ausentes.' }
if ($metabase.Config.Image -ne 'metabase/metabase@sha256:b62ac14872e9992d28218a2264d99484e0707064aae9fb594d8fbb3bc1518a9e') { throw 'Imagen B85 inesperada.' }
if ($metabase.HostConfig.PortBindings.'3000/tcp'[0].HostIp -ne '127.0.0.1' -or $metabase.HostConfig.PortBindings.'3000/tcp'[0].HostPort -ne '4185') { throw 'Publicación B85 inesperada.' }
& docker start twosides-b85-analytics twosides-b85-metabase
if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar B85.' }
Write-Host 'Metabase: http://127.0.0.1:4185/dashboard/2 (esperar hasta 2 minutos).'
Write-Host 'Acceso privado: .\tools\b85\Open-B85.ps1'
