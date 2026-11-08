# Referencia de la release C.2 bloqueada corregida

Generación: 2026-10-29T22:00:11.870Z. Este paquete es **local**, pendiente de conservación y recuperación externa. No autoriza conexiones ni activación. B00 continúa pendiente.

Sustituye a la referencia de c2-22fa685aef680f59de7e52427a42d647 (digest 0A8C7D97…7579), que se conserva sin cambios y NO debe reutilizarse para esta release.

Contiene cinco archivos: manifest.json, manifest.sha256.txt, verifier.sha256.txt, reference.json e INSTRUCCIONES.md. No contiene contraseñas, .env, bases de datos, claves privadas ni receptor ejecutable.

Release:

```text
C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\c2-ba006dea951a180aabf7561b028ee1cb
```

SHA-256 del manifiesto:

```text
A24EDEE0CED4D6548AEEDCF5F72B8C2E689D31ABDEFA97B054A90538F5FD57A8
```

SHA-256 del verificador scripts/c2-activatable-verify-reference.ps1:

```text
EFA7AD7C88168EF25A0BCCE23C82262D9BB7D2DC82B3F0DC1B32A071272EE0E7
```

## Conservación externa manual

1. Subir los cinco archivos a una carpeta NUEVA en almacenamiento bajo control del usuario. Conservar los paquetes anteriores sin sobrescribirlos. No se realizó ninguna subida automática.
2. Conservar la versión/fecha externa. Una carpeta sincronizada con escritura desde la misma cuenta Windows no garantiza independencia frente a esa cuenta.
3. Recuperar los cinco archivos desde la interfaz del servicio a una carpeta nueva. No usar una copia tomada del proyecto ni de C:\TwoSides_Backup_Integridad como sustituto. Comparar inventario exacto y hashes de los cinco archivos con el paquete original.
4. Tomar el digest del manifest.sha256.txt recuperado para verificar la release. No obtenerlo automáticamente del manifiesto de la propia release para autorizarla.

## Verificación de lectura, sin activación

Tras descargar, ajustar solo la primera línea:

```powershell
$referenceDownload = 'C:\RUTA\DE\LA\DESCARGA_NUEVA'
$releaseDirectory = 'C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\c2-ba006dea951a180aabf7561b028ee1cb'
$verifierPath = Join-Path $releaseDirectory 'package\scripts\c2-activatable-verify-reference.ps1'
$manifestDigest = (Get-Content -LiteralPath (Join-Path $referenceDownload 'manifest.sha256.txt') -Raw).Trim()
$verifierDigest = (Get-Content -LiteralPath (Join-Path $referenceDownload 'verifier.sha256.txt') -Raw).Trim()
if ($manifestDigest -cnotmatch '^[A-F0-9]{64}$' -or $verifierDigest -cnotmatch '^[A-F0-9]{64}$') { throw 'Referencia invalida' }
if ((Get-FileHash -LiteralPath (Join-Path $referenceDownload 'manifest.json') -Algorithm SHA256).Hash -cne $manifestDigest) { throw 'Manifiesto externo distinto' }
if ((Get-FileHash -LiteralPath $verifierPath -Algorithm SHA256).Hash -cne $verifierDigest) { throw 'Verificador distinto' }
& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -File $verifierPath -ReleaseDirectory $releaseDirectory -ExpectedManifestSha256 $manifestDigest -ExpectedMode c2-blocked
if ($LASTEXITCODE -ne 0) { throw 'Verificacion rechazada' }
```

Resultado esperado: `C2_ACTIVATABLE_REFERENCE_CHECK=PASS files=1894 mode=c2-blocked`. Un fallo detiene sin reparar archivos, cambiar permisos o reemplazar la referencia.

El verificador de esta release rechaza además una release ya consumida: falla si existe %LOCALAPPDATA%\TwoSides\C2Runtime\consumed\<releaseId>.json.

El manifiesto de esta release tiene version=2, mode=c2-blocked, remoteEnabled=false y activation=null. Una futura activación requeriría autorización expresa, un manifiesto distinto con executionId (distinto del identificador de esquema C.2A) y ventana, un nuevo digest y una nueva verificación externa. No rellenar ni ejecutar automáticamente la plantilla, ni solicitar contraseñas o conectar Atlas como parte de esta verificación.
