# B23 — Plan de ejecución: proxy HTTPS local y primera conexión controlada (PLAN; NADA instalado ni ejecutado)

Fecha: 2026-11-01. **No se descargó ni instaló el proxy; no se creó ningún certificado, clave ni CA; no se tocó el almacén de certificados de Windows (comprobado: 0 certificados «Two Sides» en `CurrentUser\Root`); no se activó Express `main` ni se conectó Atlas (0 procesos `node.exe`, `caddy.exe`, 0 puertos 3000/8443 en escucha); no se ejecutó Godot ni se creó `override.cfg`; no se tocaron SQLite ni partidas, `.env`/respaldos, JWT, contraseñas, ACL, colecciones, C2Runtime, C.2/F.2; sin commits ni `push`.** La línea base de integridad (3 168 archivos, `126a6cee…e433`) **sigue válida**: no se modificó ningún archivo de `src/`, `scripts/` ni de dependencias. Se añadieron solo plantillas en `backend/docs/local-https/`, una prueba offline y este informe. **B00 sigue pendiente.**

## 1. Revisión previa (B22 y código de Godot)

- Godot (`SyncMainMode`/`SyncHttpOptions`): HTTPS obligatorio, sin credenciales/consulta/fragmento, ruta `/`; validación de certificados del sistema (almacén de Windows, `HttpClient`/SChannel); sin proxy, redirecciones ni cookies; 3 s de conexión, 10 s por solicitud; ningún código propio puede ignorar errores de certificado. La URL viene de `two_sides/sync/main_api_url` (ausente en `project.godot`).
- Datos locales reales: `%APPDATA%\Godot\app_userdata\TwoSides\` → `local-progress\two-sides.sqlite3`, `pending-operations\`, `logs\` y, cuando existe sincronización `main`, `sync-credentials-main-v2\<SHA-256 de la URL>` (DPAPI). El modo `--two-sides-test-storage=sandbox` **no** sirve para esta prueba: solo se combina con el indicador HTTP local (`--two-sides-sync-local-test`), y desactiva el modo `main`.
- Express `main`: HTTP en `127.0.0.1:3000`, sin TLS, `trust proxy` desactivado.

## 2. Proxy recomendado y justificación

**Caddy v2.11.7** (último estable al consultar GitHub el 2026-11-01; publicado `2026-10-03T05:58:33Z`; confirmar de nuevo al instalar).

| Criterio | Caddy | Alternativas descartadas |
|---|---|---|
| Distribución | Un ejecutable estático (Go), sin instalador, sin servicio ni administrador | nginx para Windows: binarios no oficiales; stunnel: solo TCP, sin control HTTP; IIS/ARR: pesado y con administrador; proxy propio en Node: más código nuestro y cubierto por el manifiesto |
| Escucha | `bind 127.0.0.1` y `default_bind 127.0.0.1`; sin puerto 80 con `auto_https off` | — |
| Cabeceras | Descarta las `X-Forwarded-*` entrantes y pone las suyas (sin `trusted_proxies` nadie es de confianza) — exactamente lo que necesita un Express con `trust proxy` apagado o limitado a loopback | — |
| Controles HTTP | Filtro por ruta (`/api/*`), por `Host`, tamaño de cuerpo, tiempos, versiones HTTP | — |
| Procedencia | Releases de `github.com/caddyserver/caddy` con `checksums.txt` firmado (Sigstore/cosign) | — |

**Procedencia e integridad (no hecho):**
1. Origen único: `https://github.com/caddyserver/caddy/releases/tag/v2.11.7`. Archivo esperado `caddy_2.11.7_windows_amd64.zip` (el nombre exacto debe confirmarse en *Assets*; en el listado consultado se vieron `…windows_amd64.pem` y `.sbom`, no el `.zip`), más `caddy_2.11.7_checksums.txt`, `.sig` y `.pem`. No usar gestores de paquetes comunitarios (Chocolatey/Scoop/Webi).
2. Descargar a una carpeta propia (no a `Downloads`/OneDrive) y comprobar `Get-FileHash -Algorithm SHA256` contra la línea del `zip` en `checksums.txt`.
3. **Verificar la firma del `checksums.txt`** con `cosign verify-blob` fijando identidad: SAN `https://github.com/caddyserver/caddy/.github/workflows/release.yml@refs/tags/v2.11.7` y emisor OIDC `https://token.actions.githubusercontent.com` (Caddy documenta estos valores; la sintaxis de `cosign` varía por versión: usar `--certificate`, `--signature`, `--certificate-identity`, `--certificate-oidc-issuer`). `cosign` **no está instalado**: obtenerlo es otro paso de confianza (descargarlo de su release oficial y verificar su suma). Si no se usa `cosign`, la garantía es **reducida** (solo suma de comprobación del mismo origen): anotar el SHA-256 del zip en un segundo lugar.
4. Tras extraer: `caddy version` (debe decir `v2.11.7`), `caddy validate --config <Caddyfile>`; guardar el SHA-256 de `caddy.exe` en el registro de la prueba. Caddy **no** entra en el manifiesto de integridad (vive fuera de `backend/`).

## 3. Disposición local y permisos

`%LOCALAPPDATA%\TwoSidesLocalProxy\` (fuera de OneDrive y del repositorio), creada con la **misma receta de DACL protegido de B13** (solo `luis2`, `SYSTEM`, `Administradores`; sin herencia; sin DENY):
```
bin\caddy.exe
tls\            localhost.crt, localhost.key, ca.crt        (la clave de la CA NO se conserva)
pki-work\       solo durante la creación de certificados; se borra
config\ data\   XDG_CONFIG_HOME / XDG_DATA_HOME de Caddy (autoguardado, bloqueos)
godot-profile\  perfil desechable de Godot (§6)
Caddyfile       copia de la plantilla
probe-main-https.ps1
```
Se comprueba con `check-main-secrets-acl.ps1 -Directory "%LOCALAPPDATA%\TwoSidesLocalProxy"` (solo lectura). Ningún componente necesita administrador ni escribe en `LocalMachine`.

## 4. Configuración exacta del proxy (Windows)

Plantilla versionada: `backend/docs/local-https/Caddyfile.template` (reemplazar `@@TLS_DIR@@` por `C:/Users/luis2/AppData/Local/TwoSidesLocalProxy/tls`).
- Global: `admin off`, `auto_https off` (sin ACME, sin redirecciones, sin puerto 80), `skip_install_trust` (Caddy no toca ningún almacén), `persist_config off`, `default_bind 127.0.0.1`, `log { level ERROR }` (sin registro de accesos: las cabeceras `Authorization` nunca se escriben), `protocols h1 h2`, tiempos acotados.
- Sitio `https://localhost:8443` con `bind 127.0.0.1`, certificado **explícito** (`tls <crt> <key>`; nunca `tls internal`), `request_body max_size 2MB`, `Host` distinto de `localhost` → 421, ruta fuera de `/api/*` → 404, y `reverse_proxy 127.0.0.1:3000` con `dial_timeout 3s` y `response_header_timeout 15s`.
- Sin `trusted_proxies`: Caddy ignora `X-Forwarded-*` entrantes y envía `X-Forwarded-For` con la dirección real del cliente (aquí, loopback). `Host` llega a Express como `localhost:8443`; Express no lo usa. **No hace falta tocar `trust proxy`** en la primera prueba (todos los clientes comparten el cupo por IP `127.0.0.1`, inocuo con un solo jugador). Una futura opción `trustProxy: 'loopback'` (B22 §5) cambiaría archivos cubiertos y requeriría aprobar una línea base nueva: **no se hace en esta etapa**.
- Arranque (consola en primer plano, usuario `luis2`, sin servicio):
```powershell
$base = "$env:LOCALAPPDATA\TwoSidesLocalProxy"
$env:XDG_CONFIG_HOME = "$base\config"; $env:XDG_DATA_HOME = "$base\data"
& "$base\bin\caddy.exe" validate --config "$base\Caddyfile"
& "$base\bin\caddy.exe" run      --config "$base\Caddyfile"
```
- **Verificación obligatoria tras arrancar:** `Get-NetTCPConnection -State Listen -LocalPort 8443,3000` debe mostrar **solo** `127.0.0.1`; `80`/`443`/`2019` sin escucha; `netsh advfirewall firewall show rule name=all | findstr /i caddy` sin reglas. No se crea ninguna regla de firewall: un escucha solo en loopback no la necesita; si Windows mostrara un aviso de firewall, **Cancelar** y detener (significaría que escucha donde no debe).
- Las directivas de la plantilla (orden/sintaxis) están contrastadas con la documentación de Caddy pero **no ejecutadas** (Caddy no está instalado): `caddy validate` y las sondas negativas del §7 son la prueba.

## 5. Certificados locales (CA de pruebas con alcance mínimo)

Plantillas: `ca.cnf.template`, `leaf.cnf.template`, `leaf.ext.template`. Herramienta: `openssl` 3.5.6 de Git for Windows (`C:\Program Files\Git\usr\bin\openssl.exe`, ya instalado).

**Diseño de alcance mínimo (probado offline, LP02):** la CA lleva `nameConstraints` críticos que solo permiten `DNS:localhost` e `IP:127.0.0.1`, `pathlen:0` (no puede crear sub-CA) y 30 días de vida; la hoja es solo `localhost`, 14 días, `serverAuth`. Una hoja firmada por esa CA para `evil.invalid`, `example.com`, `10.0.0.1` o mezclada **es rechazada** (`permitted subtree violation`). Tras firmar, **se elimina la clave de la CA** (queda únicamente el certificado público, sin capacidad de emitir nada más). Límite: Node/OpenSSL aplica `nameConstraints`; que SChannel/.NET en Windows los aplique igual es lo habitual pero **no se ha podido probar aquí**; la sonda del §7 (paso 4 negativo) lo comprobará.

Procedimiento (no ejecutar sin autorización):
```powershell
$base = "$env:LOCALAPPDATA\TwoSidesLocalProxy"; $w = "$base\pki-work"; $t = "$base\tls"
$ossl = 'C:\Program Files\Git\usr\bin\openssl.exe'
# plantillas -> $w\ca.cnf, leaf.cnf, leaf.ext (copiar sin cambios)
Set-Location $w
& $ossl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt -days 30 -config ca.cnf
& $ossl req -newkey rsa:2048 -nodes -keyout localhost.key -out localhost.csr -config leaf.cnf
& $ossl x509 -req -in localhost.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out localhost.crt -days 14 -extfile leaf.ext
& $ossl verify -CAfile ca.crt localhost.crt                     # debe decir OK
& $ossl x509 -in ca.crt -noout -subject -dates -fingerprint -sha256   # anotar la huella SHA-256
Copy-Item ca.crt, localhost.crt, localhost.key $t               # ca.key NO se copia
Remove-Item ca.key, ca.srl, localhost.csr -Force                # se destruye la clave de la CA
```
(La eliminación en SSD no garantiza borrado físico; con nameConstraints + 30 días el riesgo residual es bajo y está acotado a `localhost`.)

**Instalación de la CA (solo `CurrentUser`, nunca `LocalMachine`):** comparar primero la huella del archivo con la anotada y luego `certutil -user -addstore Root "$t\ca.crt"` (Windows puede mostrar un aviso de seguridad: aceptar solo si la huella coincide). No usar `caddy trust`. Comprobación: `certutil -user -store Root | findstr /i "Two Sides"` → una entrada.

**Retirada de la CA tras las pruebas (obligatoria):** `certutil -user -delstore Root "<huella o número de serie>"` o `Remove-Item Cert:\CurrentUser\Root\<huella SHA-1>`; comprobar que `certutil -user -store Root` ya no contiene «Two Sides». Aunque se olvidara, la CA caduca a los 30 días y no puede emitir más.

## 6. Configuración de Godot y aislamiento de las partidas

**URL (sin tocar `project.godot`):** copiar `backend/docs/local-https/override.cfg.template` a `<proyecto>\override.cfg` (ya ignorado por Git). Contenido: `[two_sides]` + `sync/main_api_url="https://localhost:8443/"` (cumple las reglas del juego, probado en LP03; confirmar el formato de `override.cfg` en la documentación de Godot 4.6 al hacerlo). No añadir argumentos `--two-sides-sync*` ni `--two-sides-test-storage*` (desactivan el modo `main`). El juego **no** puede cambiar a HTTP ni ignorar el certificado.

**Perfil desechable (la partida real no se usa nunca):** Godot resuelve `user://` desde `%APPDATA%`. Se lanza el juego desde una consola cuya variable `APPDATA` apunta a un directorio de prueba:
```powershell
$test = "$env:LOCALAPPDATA\TwoSidesLocalProxy\godot-profile"
New-Item -ItemType Directory -Force "$test\Roaming" | Out-Null
$env:APPDATA = "$test\Roaming"            # solo en ESTA consola
& 'C:\Users\luis2\OneDrive\Desktop\Godot_v4.6.1-stable_mono_win64\Godot_v4.6.1-stable_mono_win64_console.exe' --path 'C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA'
```
(`--path` ejecuta el proyecto, no el editor.) El perfil nuevo empieza **vacío**: no se copia historial real (copiarlo enviaría datos reales a Atlas). La base, las operaciones pendientes y las credenciales DPAPI nacen dentro de `$test`.

**Cómo se comprueba que solo se usó la base de prueba** (antes y después):
1. Antes: registrar nombre, tamaño, fecha y SHA-256 de `%APPDATA%\Godot\app_userdata\TwoSides\local-progress\two-sides.sqlite3` (hoy 139 264 B, 2026-10-16) y un listado (nombres/tamaños/fechas) de toda la carpeta `TwoSides`.
2. Después: ese listado y esos hashes **idénticos**; en `$test\Roaming\Godot\app_userdata\TwoSides\` existen `local-progress\two-sides.sqlite3` nuevo y `sync-credentials-main-v2\…`.
3. El registro de Godot del perfil de prueba (`logs\godot.log`) debe contener `[Sync] Main synchronization configured (HTTPS).`
4. Si, tras una primera ejecución *en seco* (abrir y cerrar el juego sin jugar), el perfil de prueba no se crea o la partida real cambia, **abortar**: la hipótesis del `APPDATA` no se cumple.

## 7. Prueba de conexión HTTPS y autenticación (mínima escritura remota)

Sonda: `backend/docs/local-https/probe-main-https.ps1.template` (copiar a `TwoSidesLocalProxy`, fuera del proyecto; probada solo como plantilla: sin desactivar validación, sin imprimir credenciales/JWT, PowerShell 5.1 válido). `Invoke-WebRequest` valida con el almacén de Windows (el mismo mecanismo que el juego).

| Nivel | Qué hace | Escritura remota |
|---|---|---|
| 1 | `GET /api/health` por TLS validado → 200 | Ninguna |
| 2 | `GET /api/v2/technical/me` sin token y con token falso → 401 | Ninguna |
| 3 | Rutas fuera de `/api` → 404 (proxy); `Host` distinto → 421; HTTP plano en 8443 → fallo; sin la CA instalada → fallo TLS; nombre `127.0.0.1` en la URL → fallo de nombre | Ninguna |
| 4 (`-WriteSynthetic`) | 1 cuenta técnica **sintética** (UUID aleatorios) + 1 sesión; comprueba cabecera del JWT `RS256`/`at+jwt`/`kid main-2026-11` y una llamada autenticada → 200 | Mínima: registros de identidad/sesión en `main_v2_*` en Atlas |
| 5 (opcional, segunda autorización) | Partida breve en el perfil desechable (cuenta técnica y operaciones del propio juego) | Pequeña (Outbox del perfil de prueba) |

Los registros sintéticos se identifican por el `registrationId` y `technicalAccountId` que imprime la sonda (no son secretos). Limpieza opcional en Atlas: **manual, por el propietario, en Compass, eliminando solo esos documentos**; ninguna herramienta del proyecto borra. Si no se limpian son inertes (la credencial sintética no se guarda).

## 8. Arranque de Express `main` (cuando se autorice)

Con el lanzador y su guardia (B16/B21), sin cambios de código:
```powershell
.\scripts\run-main-backend.ps1 -EnableMain -SigningKeyFile "$env:LOCALAPPDATA\TwoSidesMainSecrets\keys\main-jwt.pem" -KeyId main-2026-11 -Port 3000 `
  -IntegrityManifest "$env:LOCALAPPDATA\TwoSidesMainIntegrity\backend-integrity-manifest.json" `
  -ExpectedTreeDigest 126a6ceee2713eb3ac5455f3f670295c40d43568b88eb7f093cf0059b6a0e433 -ExpectedKeyFingerprint 811cd75bcf98dcb88c766f369431e3886f75188ad3fec59d8bbbbe0eab9d8aec
```
Pide la contraseña con entrada oculta; abre la conexión TLS estricta a Atlas; escucha en `127.0.0.1:3000`. **Los valores del ancla deben coincidir con los anotados fuera del equipo.** Detener con Ctrl+C (cierre ordenado).

## 9. Criterios de éxito

1. Descarga verificada (suma + firma) y `caddy version` = v2.11.7; `caddy validate` sin errores.
2. Solo `127.0.0.1:8443` y `127.0.0.1:3000` en escucha; ninguna regla de firewall nueva; 0 certificados fuera de `CurrentUser\Root` modificados; `LocalMachine` intacto.
3. Niveles 1–3 del §7 con los resultados esperados, incluyendo los **negativos** (sin CA, nombre incorrecto, HTTP plano, `Host` ajeno, ruta fuera de `/api`).
4. Nivel 4: 201 → 200 → JWT `RS256 at+jwt main-2026-11` → 200 autenticado; sin credenciales ni tokens en pantalla, registros o informes.
5. Atlas (inspección de solo lectura con autorización nueva): `ready`, `writes: 0`, colecciones históricas conservadas; los recuentos de `main_v2_*` suben solo en las colecciones de identidad/sesión esperadas respecto a una inspección previa.
6. Godot (si se hace el nivel 5): partida real idéntica antes/después; el juego sigue jugable con el proxy o Express apagados (operaciones `retryable_failure`, sin pérdida).
7. Limpieza completa (§11) y `backend-integrity.js verify` + `main-preflight.js` en `ok` al terminar (nada en `backend/` cambió).

## 10. Registros y secretos

- Caddy: nivel `ERROR`, sin registro de accesos ni `debug`; la salida se queda en la consola (no redirigir a archivos de OneDrive).
- Express `main`: solo escribe líneas de arranque; sin cabeceras ni cuerpos.
- Sonda/PowerShell: sin `Start-Transcript`, `-Verbose`, `curl -v/--trace` ni `Write-Host` de variables sensibles; el token solo se usa como argumento y se decodifica la **cabecera** pública; `Remove-Variable` al final.
- Godot: sus registros no deben contener `eyJ`, `Bearer` ni `BEGIN`; comprobar con `Select-String -Quiet` y registrar solo el resultado (sí/no).
- Nada de esto se pega en el chat o en informes salvo códigos de estado y el resultado de las comprobaciones. Las claves privadas (`localhost.key`) nunca se muestran ni copian.

## 11. Apagado y limpieza (en este orden)

1. Cerrar Godot; restaurar `APPDATA` cerrando esa consola.
2. Detener Express (Ctrl+C) y Caddy (Ctrl+C); comprobar que no hay escuchas en 3000/8443 ni procesos `node.exe`/`caddy.exe`.
3. Borrar `<proyecto>\override.cfg`.
4. Retirar la CA de `CurrentUser\Root` (§5) y comprobar que no queda.
5. Eliminar `%LOCALAPPDATA%\TwoSidesLocalProxy` (certificados, claves, `caddy.exe`, perfil de prueba) tras copiar, si se desea, solo los resultados de la prueba; vaciar la papelera si se usó.
6. Opcional: retirar manualmente en Compass los registros sintéticos.
7. Verificar: `backend-integrity.js verify` (ok), `main-preflight.js` (ok), listado de la partida real sin cambios, `git status` sin archivos nuevos en `backend/src` ni `scripts`.

## 12. Cambios de código y línea base

**No se necesita ningún cambio en `src/`, `scripts/` ni dependencias para esta prueba.** Las plantillas y esta documentación viven en `backend/docs/` (fuera del inventario). Si más adelante se implementa `trustProxy` o el diagnóstico TLS del cliente (B22 §5), cambiarían exactamente: `src/app.js`, `src/composition/backend.js`, `src/config/env.js`, `src/main/runtime.js`, `scripts/run-main-backend.ps1` (y, en el cliente, `local-persistence/sync-http/SyncHttpTransport.cs.txt` y su copia de juego); entonces la línea base `126a6cee…e433` dejaría de coincidir y habría que aprobar una nueva (B20 §6). No se regenera automáticamente.

## 13. Pruebas de esta etapa (offline, `main-local-https-plan.test.js`, 6/6)

| # | Cubre |
|---|---|
| LP01 | La plantilla de Caddyfile: solo `127.0.0.1:8443`→`127.0.0.1:3000`, solo `/api/*`, sin admin/ACME/puerto 80/redirecciones, sin `tls internal`, sin `trusted_proxies`, sin `skip_verify`, sin registro de accesos |
| LP02 | La CA de pruebas con `nameConstraints`: la hoja `localhost` valida; `evil.invalid`, `example.com`, IP ajena y mezclas se rechazan; `pathlen:0`; 30/14 días; la app Express real responde por TLS y el cliente rechaza otro nombre o la ausencia de la CA |
| LP03 | `override.cfg` cumple las reglas de URL del juego y `project.godot` no cambia |
| LP04 | La sonda no desactiva validación, no imprime credenciales ni tokens, solo apunta a `https://localhost:8443`, la escritura remota exige `-WriteSynthetic` |
| LP05 | La sonda es PowerShell 5.1 válido (solo análisis) |
| LP06 | Las plantillas quedan fuera del inventario; el manifiesto sigue con 3 168 archivos |

Resultado: **6/6**. Suite completa `run-backend-regression.js`: **730 + 9 aprobadas, 15 + 1 omitidas, 0 fallos**; legacy **39/39**; escáner de secretos **clean** (0 hallazgos); `backend-integrity.js verify` **ok** (3 168 coincidentes, 0 diferencias); `main-preflight.js` **ok**; índice de Git vacío y 12 commits sin cambios.

## 14. Riesgos

- **B00 abierto:** mismo usuario; copias antiguas de `.env`/`PRUEBA.rar` en OneDrive; ancla externa del digest.
- Instalar una CA en `CurrentUser\Root` amplía la confianza: mitigado con `nameConstraints`, `pathlen:0`, 30 días, clave destruida y retirada obligatoria; no mitigable al 100 % (borrado en SSD, aviso del sistema, otros programas del usuario que usen ese almacén).
- Caddy es una dependencia externa no cubierta por el manifiesto; sin `cosign` la verificación es reducida.
- Hipótesis sin probar aquí: sintaxis exacta de la plantilla con Caddy 2.11.7; aplicación de `nameConstraints` por SChannel; que `APPDATA` reubique `user://` en Godot 4.6 (hay comprobación previa en seco).
- Un fallo TLS en el juego se ve como «sin conexión» (no hay diagnóstico propio).
- El nivel 4/5 deja registros en Atlas que solo el propietario puede retirar manualmente.
- Pendientes de `main`: SCRAM-SHA-256, rol más estrecho que `readWrite`, cuotas, `Died`/`RequestRestart`.

## 15. Acciones que requieren autorización posterior

| Acción | Notas |
|---|---|
| Crear `TwoSidesLocalProxy` con DACL protegido | Escribe en `%LOCALAPPDATA%` |
| Descargar y verificar Caddy (y, opcionalmente, `cosign`) | Conexión de red; ejecutable nuevo |
| Generar la CA/hoja de pruebas e **instalar la CA en `CurrentUser\Root`** | Cambia el almacén de certificados del usuario |
| Arrancar Caddy (escucha en 8443) y Express `main` (contraseña por prompt, conexión a Atlas) | Primer arranque real |
| Ejecutar la sonda con `-WriteSynthetic` (escritura mínima en Atlas) | Escritura remota |
| Crear `override.cfg` y ejecutar Godot con el perfil desechable | Prueba de juego |
| Inspección de solo lectura de Atlas (antes/después) | Autorización de un solo uso nueva |
| Limpieza final, retirada de la CA y borrado de la carpeta de prueba | Elimina archivos propios de la prueba |
| Cualquier cambio en `src/`/`scripts/` y nueva línea base | Fuera de esta prueba |

Detenido antes de instalar o ejecutar cualquier componente.
