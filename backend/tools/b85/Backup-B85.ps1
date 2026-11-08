$ErrorActionPreference='Stop'
# Manual, consistent cold backup of ONLY B85 volumes. Never touches original Mongo.
$stamp=Get-Date -Format 'yyyyMMddTHHmmssfff'
$backup='twosides-b85-backup-'+$stamp
$names=@(& docker volume ls --format '{{.Name}}')
if ($LASTEXITCODE -ne 0 -or $names -contains $backup) { throw 'No se puede crear un respaldo nuevo.' }
foreach ($name in @('twosides-b85-metabase','twosides-b85-analytics')) {
 $info=(& docker inspect $name | ConvertFrom-Json)[0]
 if ($LASTEXITCODE -ne 0 -or $info.Name -ne ('/'+$name)) { throw 'Falta un contenedor B85.' }
}
& docker stop --timeout 30 twosides-b85-metabase twosides-b85-analytics
if ($LASTEXITCODE -ne 0) { throw 'Detención incompleta: no se respaldará una base activa.' }
& docker volume create $backup
if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el volumen de respaldo.' }
& docker run --rm --pull=never --network=none --mount type=volume,src=twosides-b85-metabase-data,dst=/source/app,readonly --mount type=volume,src=twosides-b85-mongo-data,dst=/source/mongo,readonly --mount type=volume,src=twosides-b85-private,dst=/source/private,readonly --mount "type=volume,src=$backup,dst=/backup" --entrypoint sh mongo:8.0 -c 'umask 077; tar -czf /backup/b85-volumes.tgz -C /source . && sha256sum /backup/b85-volumes.tgz > /backup/b85-volumes.sha256'
if ($LASTEXITCODE -ne 0) { throw 'Respaldo incompleto; conservar originales y revisar.' }
Write-Host "Respaldo privado local creado: $backup (contiene secretos sintéticos; no compartir)."
Write-Host 'B85 quedó detenido. Iniciar con tools\b85\Start-B85.ps1 cuando corresponda.'
