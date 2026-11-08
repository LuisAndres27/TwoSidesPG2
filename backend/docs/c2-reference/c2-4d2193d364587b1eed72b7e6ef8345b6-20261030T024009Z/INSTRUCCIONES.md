# Referencia de la release C.2 ACTIVABLE (un solo uso)

Generación: 2026-10-30T02:40:09.521Z. Paquete **local**, pendiente de conservación y recuperación externa. **Este paquete no autoriza conexiones ni ejecución.** La ejecución real requiere una autorización posterior, expresa y separada. B00 continúa pendiente.

Release (copia nueva, distinta de la bloqueada `c2-ba006dea951a180aabf7561b028ee1cb`, que se conserva intacta):

```text
C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\c2-4d2193d364587b1eed72b7e6ef8345b6
```

| Dato | Valor |
|---|---|
| Release | `c2-4d2193d364587b1eed72b7e6ef8345b6` |
| executionId | `2c541441db11c34b6807a21f4794c30b` |
| Ventana de validez (UTC) | `2026-10-30T02:39:39.489Z` → `2026-10-30T06:39:39.489Z` (4 h) |
| mode / remoteEnabled | `c2-remote-once` / `true` |
| Archivos | 1894 |

SHA-256 del manifiesto (**este es el digest que debe obtenerse de la copia recuperada**):

```text
47F4250BFA0DF6A052BC7E616961B28ABF7C63F1C40629B68CFF5AF176762BDD
```

SHA-256 del verificador scripts/c2-activatable-verify-reference.ps1:

```text
EFA7AD7C88168EF25A0BCCE23C82262D9BB7D2DC82B3F0DC1B32A071272EE0E7
```

Este digest es **distinto** del de la release bloqueada (`A24EDEE0CED4D6548AEEDCF5F72B8C2E689D31ABDEFA97B054A90538F5FD57A8`), que no vale para esta release. Payload idéntico al de esa release (`35502ABC9C42F00E474259267E7A08594AFD643627806B4C36E3022030A0CBC7`).

## Conservación externa manual (dentro de la ventana de 4 horas)

1. Subir los cinco archivos de este paquete a una carpeta **NUEVA** de Google Drive. No sobrescribir paquetes anteriores. No se subió nada automáticamente.
2. Descargar esa carpeta desde la interfaz de Drive a otra ubicación nueva y comunicar la ruta. No usar una copia del proyecto, de C2Runtime ni de C:\TwoSides_Backup_Integridad como sustituto.
3. Comparar inventario exacto y los cinco SHA-256 con este paquete.
4. Tomar el digest del `manifest.sha256.txt` **recuperado**. No obtenerlo del manifiesto de la propia release ni de `reference.json` para autorizarla.

## Verificación de lectura, sin activación ni contraseña

Tras descargar, ajustar solo la primera línea:

```powershell
$referenceDownload = 'C:\RUTA\DE\LA\DESCARGA_NUEVA'
$releaseDirectory = 'C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\c2-4d2193d364587b1eed72b7e6ef8345b6'
$verifierPath = Join-Path $releaseDirectory 'package\scripts\c2-activatable-verify-reference.ps1'
$manifestDigest = (Get-Content -LiteralPath (Join-Path $referenceDownload 'manifest.sha256.txt') -Raw).Trim()
$verifierDigest = (Get-Content -LiteralPath (Join-Path $referenceDownload 'verifier.sha256.txt') -Raw).Trim()
if ($manifestDigest -cnotmatch '^[A-F0-9]{64}$' -or $verifierDigest -cnotmatch '^[A-F0-9]{64}$') { throw 'Referencia invalida' }
if ((Get-FileHash -LiteralPath (Join-Path $referenceDownload 'manifest.json') -Algorithm SHA256).Hash -cne $manifestDigest) { throw 'Manifiesto externo distinto' }
if ((Get-FileHash -LiteralPath $verifierPath -Algorithm SHA256).Hash -cne $verifierDigest) { throw 'Verificador distinto' }
& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -File $verifierPath -ReleaseDirectory $releaseDirectory -ExpectedManifestSha256 $manifestDigest -ExpectedMode c2-remote-once
if ($LASTEXITCODE -ne 0) { throw 'Verificacion rechazada' }
```

Resultado esperado: `C2_ACTIVATABLE_REFERENCE_CHECK=PASS files=1894 mode=c2-remote-once`. **Nota:** a diferencia de la release bloqueada, este verificador usa `-ExpectedMode c2-remote-once`, y además comprueba que la ventana siga vigente, el destino, los escenarios A/B/C y que el `executionId` no sea el identificador de esquema. Si la ventana venció o la release ya fue consumida (existe `%LOCALAPPDATA%\TwoSides\C2Runtime\consumed\c2-4d2193d364587b1eed72b7e6ef8345b6.json`), devuelve FAIL y no debe repararse a mano: se prepara una release nueva.

Un fallo detiene el proceso sin reparar archivos, cambiar permisos ni reemplazar la referencia.

## Alcance

Una única ejecución sintética A/B/C contra `twosides_integration_test` / `two_sides_integration_test` / TwoSidesCluster (host <cluster>.<id>.mongodb.net, authSource admin, DEFAULT, TLS estricto); máximo tres clientes, ocho envíos, limpieza condicional de hasta 16 documentos sintéticos propios, fence C.2A protegido, rotación manual de la contraseña después de cualquier intento. Nunca `twosides_backend` ni `two_sides_db`.

Este documento no contiene ningún comando que active la ejecución.
