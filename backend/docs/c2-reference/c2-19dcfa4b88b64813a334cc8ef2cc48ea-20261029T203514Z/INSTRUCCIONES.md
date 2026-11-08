# Referencia C.2 para conservación externa

Generación: 2026-10-29T20:35:14.271Z. Este paquete es local hasta que el usuario lo guarde y recupere desde un almacenamiento externo bajo su control. No autoriza C.2 ni certifica procedencia histórica. B00 continúa pendiente.

Contiene solamente manifest.json, dos archivos de hashes completos, reference.json y estas instrucciones. No contiene un receptor ejecutable, contraseñas, .env, bases de datos o claves privadas. El manifiesto contiene nombres y hashes de archivos, dependencias y metadatos de control del entorno; no contiene sus contenidos.

## Guardar manualmente

1. Subir estos cinco archivos a una carpeta dedicada de almacenamiento en la nube bajo control del usuario. No se ha realizado ninguna subida automática.
2. Conservar la versión original, idealmente con historial de versiones y protección de la cuenta. Evitar que una carpeta sincronizada con permiso de escritura del mismo proceso Windows sea la única referencia: ese proceso podría sustituir también la copia externa. Una cuenta o acceso separado ofrece mayor independencia.
3. Descargar nuevamente los cinco archivos mediante la interfaz del almacenamiento, a una carpeta diferente. Comparar sus hashes con este paquete antes de considerar conservada la referencia. Retener la fecha/versión de la subida. C:\TwoSides_Backup_Integridad no sustituye este paso.

SHA-256 del manifiesto:

```text
D4A5ED8A8C0C61FFD59F60B30EEB4B678BBA3FCC7A9B3E42651A8B0727AD2AF8
```

SHA-256 del verificador nuevo:

```text
9A9BE545381CBFF315317CBA3769077BB2ADFE9C48EF572A178C28EA5796C77E
```

## Verificar con el digest recuperado

El script histórico **c2-verify-reference.ps1** está fijado a la release anterior c2-67d957…; no admite seleccionar esta candidata. No se modificó. Para esta release se utiliza su sucesor ya preparado **c2-final-verify-reference.ps1**, cuyo hash figura en este paquete.

Después de recuperar la copia externa, ajustar solamente la ruta de la primera línea. Este comando compara referencias y ejecuta exclusivamente el verificador de lectura; no activa el receptor ni conecta Atlas:

```powershell
$referenceDownload = 'C:\RUTA\DE\LA\COPIA_DESCARGADA'
$releaseDirectory = 'C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\c2-19dcfa4b88b64813a334cc8ef2cc48ea'
$verifierPath = Join-Path $releaseDirectory 'package\scripts\c2-final-verify-reference.ps1'
$manifestDigest = (Get-Content -LiteralPath (Join-Path $referenceDownload 'manifest.sha256.txt') -Raw).Trim()
$verifierDigest = (Get-Content -LiteralPath (Join-Path $referenceDownload 'verifier.sha256.txt') -Raw).Trim()
if ($manifestDigest -cnotmatch '^[A-F0-9]{64}$' -or $verifierDigest -cnotmatch '^[A-F0-9]{64}$') { throw 'Referencia invalida' }
if ((Get-FileHash -LiteralPath (Join-Path $referenceDownload 'manifest.json') -Algorithm SHA256).Hash -cne $manifestDigest) { throw 'Manifiesto externo distinto' }
if ((Get-FileHash -LiteralPath $verifierPath -Algorithm SHA256).Hash -cne $verifierDigest) { throw 'Verificador distinto' }
& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -File $verifierPath -ReleaseDirectory $releaseDirectory -ExpectedManifestSha256 $manifestDigest
if ($LASTEXITCODE -ne 0) { throw 'Verificacion rechazada' }
```

Resultado esperado: `C2_FINAL_REFERENCE_CHECK=PASS files=1895 mode=offline-only`. Un fallo detiene el procedimiento; no reparar automáticamente, sustituir referencias ni activar nada.

PASS acredita coincidencia con la referencia aportada, no privacidad absoluta, procedencia histórica, ausencia de malware o resolución de B00. La referencia empieza a acreditar continuidad desde su conservación independiente. Modificar el manifiesto para una futura activación cambiaría su hash y exigiría una revisión y referencia nuevas; este digest offline no autoriza esa modificación.

No enviar contraseñas por chat. No ejecutar C.2/F.2 ni preparar activación hasta una autorización independiente.
