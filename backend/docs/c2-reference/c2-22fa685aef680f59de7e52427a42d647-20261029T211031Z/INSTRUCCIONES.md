# Referencia de la nueva release C.2 bloqueada

Generación: 2026-10-29T21:10:31.418Z. Este paquete es **local**, pendiente de conservación y recuperación externa. No autoriza conexiones ni activación. B00 continúa pendiente.

Contiene cinco archivos: manifest.json, manifest.sha256.txt, verifier.sha256.txt, reference.json e INSTRUCCIONES.md. No contiene contraseñas, .env, bases de datos, claves privadas ni receptor ejecutable. El manifiesto incluye inventario y metadatos de control sin contenidos de secretos.

Release:

```text
C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\c2-22fa685aef680f59de7e52427a42d647
```

SHA-256 del manifiesto:

```text
0A8C7D973CE35BFD31D697C5E87B9432D7AC591D1BFBE93E3DCD882F83AA7579
```

SHA-256 del verificador scripts/c2-activatable-verify-reference.ps1:

```text
8613935B3C844AAEB0840BC4CB41EE2B1DFE4D95BE0C860E12B98FA3FA1D8504
```

## Conservación externa manual

1. Subir los cinco archivos a una carpeta nueva en almacenamiento bajo control del usuario. Conservar los paquetes anteriores sin sobrescribirlos. No se realizó ninguna subida automática.
2. Conservar la versión/fecha externa. Una carpeta sincronizada con escritura desde la misma cuenta Windows no garantiza independencia frente a esa cuenta; mantener historial y un control de acceso separado mejora esa garantía.
3. Recuperar los cinco archivos desde la interfaz del servicio a una carpeta nueva. No usar una copia tomada del proyecto ni C:\TwoSides_Backup_Integridad como sustituto. Comparar inventario exacto y hashes de los cinco archivos con el paquete original.
4. Tomar el digest del manifest.sha256.txt recuperado para verificar la release. No obtenerlo automáticamente del manifiesto de la propia release para autorizarla.

## Verificación de lectura, sin activación

Tras descargar, ajustar solo la primera línea:

```powershell
$referenceDownload = 'C:\RUTA\DE\LA\DESCARGA_NUEVA'
$releaseDirectory = 'C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\c2-22fa685aef680f59de7e52427a42d647'
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

Los verificadores c2-verify-reference.ps1 y c2-final-verify-reference.ps1 pertenecen a versiones anteriores y no sirven para validar el nuevo formato bloqueado. Se conservan sin cambios en las releases anteriores.

La vinculación usa el hash de un inventario ordenado de rutas y SHA-256; el hash externo del manifiesto vincula esos datos y el estado de activación. No es una firma de procedencia histórica ni certifica privacidad, independencia o resolución de B00.

El manifiesto de esta release tiene version=2, mode=c2-blocked, remoteEnabled=false y activation=null. La plantilla incluida está incompleta y no puede activar. Una futura activación requeriría autorización expresa, un manifiesto distinto con run/ventana, nuevo digest y nueva verificación externa. No rellenar ni ejecutar automáticamente la plantilla, ni solicitar contraseñas o conectar Atlas como parte de esta verificación.
