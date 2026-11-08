# B39 — Plan operativo de la prueba real F1 + F2 contra MongoDB Atlas (SOLO PREPARACIÓN, nada ejecutado)

Fecha: 2026-11-02. **Esta etapa no ejecutó la prueba.** Solo lecturas locales de comprobación (sin red, sin servidores): no se conectó Atlas, no se arrancó Express ni Caddy, no se ejecutó Godot, no se modificó `src/`, `scripts/`, `tests/`, SQLite, Outbox, manifiestos, anclas, claves ni respaldos, no se instalaron certificados, no se cambió ningún timeout, no se implementó F3, no hubo commits ni push. Base documental: B30, B31, B32, B33, B34, B36, B37, B38 y las plantillas de `docs/main-sync-test/` y `docs/local-https/`.

## 1. Precheck local realizado ahora (sin servidores)

| Comprobación | Resultado |
|---|---|
| Manifiesto v4 | `verify` ok: 3169 esperados, 0 añadidos/eliminados/modificados; SHA-256 del archivo `7DEC55E3…3E8B` |
| Ancla y preflight | `main-preflight.js` con `treeDigest` v4 `aea04105…e27e`, huella JWT `811cd75b…9d8aec`, `main-2026-11`: **ok** (5 comprobaciones) |
| ACL | carpeta de secretos y de integridad: `conforming`; carpeta `TwoSidesLocalProxy\tls`: solo SYSTEM, Administradores y `luis2` |
| Escáner de secretos | `clean`, 0 hallazgos |
| Procesos / puertos | 0 `node`/`caddy`/`Godot`; escuchas en 3000, 3001, 8443, 2019, 80, 443: 0 |
| Conexiones a Atlas existentes | las establece **MongoDB Compass** (PID 3192) del propietario; no son nuestras (ver riesgo R6) |
| Almacén de certificados | `CurrentUser\Root`: 44 certificados, 0 de Two Sides (la CA de prueba **no** está instalada) |
| Material de la CA | `ca.crt` SHA-1 `F2BF0E8D…D412A7` (caduca 2026-12-02); `localhost.crt` caduca **2026-11-16** (14 días); `localhost.key` presente (ACL ok); clave de la CA destruida |
| Caddy | `caddy.exe` SHA-256 `5F93A9BD…C9DB2A` = el verificado; `Caddyfile` sha `A7BAA861…`; `admin off`, `auto_https off`, sitio `https://:8443`, 421 si Host≠localhost, 404 fuera de `/api/*`, `reverse_proxy 127.0.0.1:3000` |
| Configuración requerida | clave JWT (2484 B, fuera de OneDrive), carpetas `TwoSidesInspection` y `TwoSidesSyntheticRun` (con `build.mjs`, `verify.mjs`, lanzadores), 4 autorizaciones de inspección **ya consumidas** (no reutilizables). Ningún secreto se mostró |
| Datos de partidas reales | la prueba **no usa** SQLite, Godot, `user://` ni ningún archivo de partida: solo ids aleatorios generados por `build.mjs`, que no lee ningún archivo del jugador |
| Respaldos | pre-F1 117/117 y pre-F2 118/118 coinciden (verificados en las etapas previas; no tocados) |

## 2. Precondiciones (inventario)

Código y evidencia: manifiesto v4 vigente y digest v4 anotado **fuera del equipo** por el propietario (P1); F1+F2 verdes (826/0/17, legacy 39/39); `run-main-backend.ps1` y herramientas de inspección sin cambios.
Entorno: Windows 11, usuario `luis2`, sin elevar; Node `C:\Program Files\nodejs\node.exe`; sin otros procesos en 3000/8443; Compass sin sesiones de escritura (P2).
Credenciales: contraseña de `twosides_backend` solo mediante **prompt oculto** que escribe el propietario (nunca el asistente); sin credenciales nuevas.
Ventana de certificados: hoy 2026-11-02; la prueba debe completarse **antes del 2026-11-16** (certificado de servidor); si se retrasa, regenerar con el procedimiento B23/B25 (requiere autorización).
Nuevos artefactos locales (a crear **antes** de la ejecución, fuera del proyecto, sin red y probados offline; hoy no existen): (a) `sync-test-staged.ps1` (variante por etapas de `sync-test.ps1.template`, §5.C-E); (b) `build-second-op.mjs` solo para la etapa F. Ambos serían plantillas en `docs/main-sync-test/` con pruebas sobre un `HttpListener` local (como SW01–SW05), y entrarían en una etapa B40 aparte.

## 3. Timeouts y límites (documentados; ninguno se cambia)

| Capa | Valor | Observación |
|---|---|---|
| Presupuesto de operación (servidor) | **2000 ms** (tope fijo) | rige hasta el punto de commit; si vence antes, 503 sin persistir |
| Gracia de commit (F2) | **≤ 3000 ms** desde el punto de commit, acotada por el fin del lote | si se agota: resultado desconocido, 503 `storage_unavailable` sin recibo |
| Presupuesto de lote (servidor) | **10 000 ms** (tope 10 s) | un lote de 1 operación no lo roza |
| Driver Mongo (main) | `serverSelection 10 s`, `connect 10 s`, `socket 10 s`, `waitQueue 2 s`, transacción `maxCommitTimeMS 1000`, `timeoutMS 10 000`, pool ≤ 5 | |
| Caddy | `read_header 10 s`, `read_body 30 s`, `write 30 s`, `idle 60 s`; proxy `dial 3 s`, `response_header_timeout 15 s`; `max_size 2 MB` | peor caso de una operación ≈ 2 s + 3 s < 15 s |
| Guion `sync-test.ps1` | `Invoke-WebRequest -TimeoutSec 20` | mayor que Caddy (15 s) y que el caso máximo del servidor |
| Cliente real `HttpClient` (SyncHttp) | **10 s** por petición, `ConnectTimeout 3 s`, lote 25 | no interviene en la Ruta A (sin Godot); condiciona la Ruta B (B38 H1) |
| Cliente Godot v1 `HttpRequest` | 10 s | pila no compatible con `main` (B38 H2) |
| Argon2id / registro | no medido en Atlas; el registro y la sesión usan verificación `live` (no caché) | la primera petición de registro puede tardar más que las siguientes |
| Limitador de tasa (servidor) | 5 altas por IP/hora, 100 globales/hora, 20 registros/min, 30 sesiones/5 min | un registro fallido cuenta; reiniciar Express reinicia el contador |

## 4. Prueba inicial mínima (diseño)

**Identidad y datos nuevos** (`build.mjs <backend> <carpeta nueva y vacía fuera del proyecto>`; ver comprobación de no reutilización en §5.C): `runId`, `registrationId`, `installationId`, `localPlayerId`, `sessionId`, `operationId`, `leaseId`, `batchId` aleatorios (UUID v4); una operación `session.report` fase `open` (`sourceKey = session:<sessionId>:open`), validada con el validador real del backend. Se guardan `run-ids.json`, `batch.json` y `receipts-query.json` (sin secretos).

**Secuencia con una sola sesión** (un único proceso; la credencial de la cuenta es sintética, de 43 caracteres, solo en memoria):

| # | Acción | Esperado |
|---|---|---|
| 1 | `GET /api/health` por HTTPS | 200 |
| 2 | `POST /api/v2/technical/registrations` (1 vez) | 201 → `technicalAccountId` T |
| 3 | `POST /api/v2/technical/sessions` | 200 + token |
| 4 | `POST /api/v2/sync/batches` (lote de **1** operación, bytes fijos) | 200, `all_accepted`, `committed`, `httpStatus 201`, **sin 503/deferred** |
| 5 | verificación directa de solo lectura | `consistent` |
| 6 | reenvío de los **mismos bytes** (mismo `operationId`/`payloadHash`) | 200, `duplicate`, **mismo `receiptId`/`committedAtUtc`/`payloadHash`** |
| 7 | `POST /api/v2/sync/receipts/query` | 200, `found`, mismo recibo |
| 8 | verificación directa final | `consistent`; sin duplicados |

**Deltas esperados** (por documento, para T): `identities +1`, `ownerGuards +1`, `identitySessions +1`, `operations +1`, `facts +1`, `fences +1` (`ingestion-v1:T`), `revocations 0`. Contadores (informativos, derivados de B31/T18; una desviación se investiga antes de seguir, no se corrige): tras el paso 4 `guard 2 / fence 1`; tras el 6 `guard 3 / fence 2`; tras el 7 `guard 4 / fence 3` (reenvío y consulta suben +1 por transacción sin crear documentos).

## 5. Etapas, comandos propuestos y puntos de autorización

Variables comunes (PowerShell): `$B='C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend'`, `$L=$env:LOCALAPPDATA`, `$V4='aea04105001d5ca324f817602e781cf5118789f9187c8424c204551ac800e27e'`, `$FP='811cd75bcf98dcb88c766f369431e3886f75188ad3fec59d8bbbbe0eab9d8aec'`, `$KEY="$L\TwoSidesMainSecrets\keys\main-jwt.pem"`, `$MAN="$L\TwoSidesMainIntegrity\backend-integrity-manifest.json"`.

**Regla general:** cada etapa exige **autorización explícita nueva** del propietario en el chat; no se pasa a la siguiente si la anterior terminó con un error sin diagnosticar. Los comandos de abajo son propuestas: **no se ejecutaron**.

### ETAPA A — Entorno local e integridad (sin red; ya pre-verificada en §1, se repite el mismo día de la prueba)
```powershell
node "$B\scripts\backend-integrity.js" verify $MAN
node "$B\scripts\main-preflight.js" --manifest $MAN --anchor $V4 --key-file $KEY --key-id main-2026-11 --expected-key-id main-2026-11 --key-fingerprint $FP
node "$B\scripts\scan-secrets.js"
powershell -NoProfile -File "$B\scripts\check-main-secrets-acl.ps1"
powershell -NoProfile -File "$B\scripts\check-main-secrets-acl.ps1" -Directory "$L\TwoSidesMainIntegrity"
Get-Process node,caddy,Godot* -ErrorAction SilentlyContinue ; Get-NetTCPConnection -State Listen | ? LocalPort -in 3000,8443
(Get-ChildItem Cert:\CurrentUser\Root).Count                       # 44
(Get-FileHash "$L\TwoSidesLocalProxy\bin\caddy.exe").Hash          # 5F93A9BD…C9DB2A
```
**Parada** si: `verify`/preflight ≠ ok; cualquier ACL ≠ `conforming`; escáner ≠ `clean`; proceso o puerto ocupado; `CurrentUser\Root` ≠ 44; hash de Caddy distinto; el digest v4 del propietario (anotado fuera del equipo) ≠ `$V4`.

### ETAPA B — Conexión autorizada a Atlas y línea base (solo lectura)
Requiere autorización: «B autorizada». Se crea **una** autorización de inspección de un solo uso (60 min) y el propietario escribe la contraseña en el prompt oculto:
```powershell
node "$B\scripts\new-main-inspection-authorization.js" "$L\TwoSidesInspection" rotated-backend
& "$B\scripts\run-main-inspection.ps1" -Enable -Authorization "$L\TwoSidesInspection\main-inspection-authorization-<executionId>.json"
```
Registrar: veredicto `ready`, `writes 0`, `closed true`, **recuentos de todas las colecciones**. Línea base esperada (cierre de B30/B31): `main_v2_identities 1 · ownerGuards 1 · identitySessions 1 · operations 1 · facts 1 · fences 2 · revocations 0`; históricas `users 2 · decisions 7 · gameevents 13 · gameprogresses 2 · statisticevents 14 · statisticsummaries 2 · syncidentities 1`. Los datos de la prueba anterior (T=`5e05a972-98ef-447a-9579-ba4d0e20a4b8`, operación `64ad5b53-…`) se **excluyen por identificador**; la prueba nueva se identifica solo por sus ids nuevos y por deltas. **Parada** si los recuentos difieren de lo esperado sin explicación (alguien o algo escribió), si `verdict ≠ ready` o hay error de TLS/autenticación de la inspección.

### ETAPA C — Primera escritura sintética (1 operación)
Requiere autorización: «C autorizada». Preparación sin red (antes): carpeta **nueva y vacía** fuera del proyecto y generación de ids:
```powershell
$RUN="$L\TwoSidesSyntheticRun\run-$(Get-Date -Format yyyyMMdd-HHmmss)"
node "$L\TwoSidesSyntheticRun\build.mjs" $B $RUN
# comprobación de no reutilización: ningún id de run-ids.json existe en el run-ids.json anterior (run-20261102-110352)
```
Servicios (acciones del propietario o delegadas con permiso explícito, ver §9):
1. Propietario instala la CA temporal: `certutil -user -addstore Root "$L\TwoSidesLocalProxy\tls\ca.crt"` (Windows muestra un aviso; acepta). Se comprueba: 45 certificados y huella `F2BF0E8D…D412A7`.
2. Caddy: `$env:XDG_DATA_HOME="$L\TwoSidesLocalProxy\data"; $env:XDG_CONFIG_HOME="$L\TwoSidesLocalProxy\config"; Start-Process "$L\TwoSidesLocalProxy\bin\caddy.exe" -ArgumentList 'run','--config',"$L\TwoSidesLocalProxy\Caddyfile" -WindowStyle Hidden -PassThru` (sin `--watch`; única escucha `127.0.0.1:8443`).
3. Express (propietario, consola propia, **prompt oculto**):
```powershell
& "$B\scripts\run-main-backend.ps1" -EnableMain -SigningKeyFile $KEY -KeyId main-2026-11 -IntegrityManifest $MAN -ExpectedTreeDigest $V4 -ExpectedKeyFingerprint $FP
```
   El arranque ejecuta ahora el **calentamiento de F1** (verificación de despliegue de ambos repositorios) antes de escuchar: si falla, Express **no arranca** (señal de diagnóstico útil, sin escrituras). Listo cuando `https://localhost:8443/api/health` responde 200.
4. Guion por etapas (a crear, ver §2) con el mismo contenido que `sync-test.ps1.template` hasta el paso 4: salud → registro → sesión → `me` → **un** lote. El proceso conserva la credencial **solo en memoria** y queda esperando un archivo de continuación (`go-D`, `go-E`) que se crea tras cada autorización; si el proceso muere, se aplica el procedimiento de §7.
Registrar (públicos): `runId`, `registrationId`, `technicalAccountId`, `installationId`, `localPlayerId`, `sessionId`, `operationId`, `payloadHash`, `batchId`, `receiptId`, `committedAtUtc`, estado HTTP y **tiempo total de cada petición (ms)**.
**Criterios:** registro 201; sesión 200; lote 200 `all_accepted/committed/201`. **Parada inmediata y sin reenviar** si: registro ≠ 201; sesión ≠ 200; lote ≠ 200, 5xx, cuerpo ilegible o sin `results` (ver §6). Express/Caddy siguen activos para D/E.

### ETAPA D — Verificación directa y reenvío idempotente
Requiere autorización: «D autorizada». 
1. Verificación de solo lectura **antes** del reenvío (crea otra autorización de un solo uso y otro prompt oculto):
```powershell
node "$B\scripts\new-main-inspection-authorization.js" "$L\TwoSidesInspection" rotated-backend
& "$L\TwoSidesSyntheticRun\run-verify-synthetic.ps1" -Enable -Authorization <nueva.json> -RunDir $RUN -Account <technicalAccountId> -Verifier "$L\TwoSidesSyntheticRun\verify.mjs"
```
   Esperado: `writes 0`, `verdict consistent` (20 comprobaciones), conteos `{identities 1, ownerGuards 1, identitySessions 1, operations 1, facts 1, fences 1, revocations 0}` para T.
2. Solo si `consistent`: se crea `go-D` y el guion reenvía **los mismos bytes** de `batch.json`. Esperado: 200, `duplicate`, `sameReceiptId = True`, mismo `committedAtUtc`/`payloadHash`, ningún documento nuevo (se confirma en la verificación de E).
**Parada** si la verificación es `inconsistent`, si el reenvío da `committed` (señal de que el primero no persistió), recibo distinto, 409, o error de transporte (ver §6).

### ETAPA E — `receipts/query`
Requiere autorización: «E autorizada». `go-E`: `POST /api/v2/sync/receipts/query` con `receipts-query.json` (+ un id inexistente opcional en una **consulta aparte** para confirmar `not_found`). Esperado: 200, `found`, mismo `receiptId`. Después, verificación de solo lectura final (otra autorización de un solo uso): `consistent`, conteos del paso anterior sin cambios y `ownerGuards`/`fences` con las revisiones esperadas. Comparar con la línea base de B: **deltas exactos** `+1 identities, +1 ownerGuards, +1 identitySessions, +1 operations, +1 facts, +1 fences, 0 revocations`; históricas sin cambios.

### ETAPA F — Pérdida controlada de respuesta (solo con autorización adicional separada)
Requiere «F autorizada» y que A–E hayan sido correctas. Es la única etapa con una segunda operación. Se genera con `build-second-op.mjs` (a crear; **misma** `installationId`/`localPlayerId`, nuevo `operationId`/`sessionId`/`sourceKey`) y se envía en un lote de 1 operación con tiempo de espera de **0,3 s** solo en el guion (abandona la respuesta). Luego: **no se genera ninguna operación nueva**; se consulta `receipts/query` del mismo `operationId` y, si procede, se reenvía el mismo cuerpo. Esperado: estado final de **una** fila y mismo recibo. Una respuesta tardía forzada desde el servidor no se puede provocar en Atlas sin cambiar código; esa parte queda cubierta por F2-T1…T22. Si el abandono ocurre antes de que el servidor termine, el desenlace puede ser `committed`, `duplicate` (si ya había commit) o 503: todos son aceptables y se resuelven por el mismo `operationId`.

### ETAPA G — Cierre de servicios y retirada de la CA
Requiere autorización: «G autorizada» (o se ejecuta siempre al terminar o ante una parada).
1. Express: el propietario pulsa **Ctrl+C** en la consola del lanzador (cierre ordenado: `backend.close`, pool cerrado). Si no responde en ≈ 10 s: `Stop-Process -Id <PID>` y **se documenta** como cierre forzado.
2. Caddy: `Stop-Process -Id <PID>` (con `admin off` no hay cierre ordenado; es un proxy sin estado).
3. El propietario retira la CA: `certutil -user -delstore Root F2BF0E8DC06AC9C4F12F27ECD6841438A5D412A7`.
4. Comprobación de que nada queda activo (§10).
5. Informe con evidencias sin secretos (§8).

## 6. Manejo de errores (matriz de decisión)

Regla de oro: **ante un resultado desconocido nunca se crea otra operación con ids nuevos ni se reenvía a ciegas**; se resuelve por el **mismo `operationId`** (consulta de recibos o reenvío idéntico). No hay borrados.

| Evento | Qué significa | Acción |
|---|---|---|
| Error de TLS (cadena, nombre, expirado, 421) | el cliente no confía en la CA o Host≠localhost | Parar. No tocar `-k`/desactivar validación. Verificar huella de la CA instalada, `localhost.crt` vigente (≤ 2026-11-16), URL `https://localhost:8443`, Caddy escuchando. Nada llegó a Express ⇒ **sin escrituras**; reintentar la etapa tras corregir |
| Error de autenticación (401 en sesión; credencial inválida) | cuenta/credencial no coincide | Parar. Si fue el registro (≠ 201): no repetir con otra credencial; comprobar si la cuenta existe por lectura (§B31). La cuenta huérfana queda registrada como sintética |
| Fallo de preflight/guardia de Express | árbol o ancla no coinciden | Parar antes de pedir contraseña. No relajar controles. Diagnosticar con `verify` (nombres ≤ 20) |
| Express no arranca (calentamiento F1 falló) | verificación de despliegue/primario/índices falló | Sin escrituras. Diagnosticar por lectura (inspección). No reintentar en bucle |
| HTTP 503 **antes del commit** (`deferred`, `storage_unavailable`, sin recibo; 0 filas) | plazo de 2 s vencido o aborto confirmado | Verificar por lectura (sin crear sesión): 0 filas ⇒ reenviar **el mismo cuerpo** una vez en la misma sesión. Si se repite, parar |
| Commit de resultado **desconocido** (503 sin recibo; puede haber fila) | la gracia de F2 se agotó o error tras el commit | Verificación de solo lectura: si hay fila ⇒ el siguiente envío debe dar `duplicate` con ese recibo; si no ⇒ `committed`. **Mismo `operationId`**. Registrar `unknown` |
| **Confirmación tardía** (200 `committed` con latencia > 2 s) | comportamiento esperado de F2 | Éxito. Registrar la latencia; no es un fallo |
| Timeout del cliente (script 20 s, Caddy 15 s) | respuesta perdida | No crear nada nuevo. Consultar `receipts/query` o reenviar el mismo cuerpo; verificar por lectura |
| Pérdida de la respuesta tras el commit | cliente no ve el 200 | Igual que el anterior; esperado `duplicate` con el recibo original |
| Fallo de la lectura de verificación (TLS Atlas, autenticación, autorización caducada) | no se puede confirmar el estado | Parar; generar una autorización nueva (las usadas son de un solo uso); no continuar escribiendo mientras no se pueda verificar |
| Interrupción de Express | proceso caído | Sin reenvío automático; reiniciar solo con autorización (nuevo prompt de contraseña); como el limitador y los tokens están en memoria, el guion necesita nueva sesión: **la credencial se perdió si el guion también murió** ⇒ la cuenta T no puede iniciar sesión; se verifica por lectura y se decide (crear otra identidad sintética nueva **solo** con autorización y registrando que la anterior queda huérfana) |
| Interrupción de Caddy | sin HTTPS | Reiniciar Caddy; reintentar la última petición con el mismo cuerpo solo si no hay respuesta registrada |
| Discrepancia de recuentos | escritura inesperada | Parar todo; ninguna acción correctiva automática; informe |

## 7. Protección de los datos existentes

1. Las colecciones históricas (`users`, `decisions`, `gameevents`, `gameprogresses`, `statisticevents`, `statisticsummaries`, `syncidentities`) no se leen ni escriben; las herramientas usadas tienen listas blancas (el verificador solo lee `main_v2_*` por un único filtro de identificador, máx. 5 filas, proyecciones sin campos secretos).
2. Los ids de la prueba anterior no se reutilizan (comprobación explícita en C); el verificador filtra por el `technicalAccountId` nuevo.
3. Línea base de conteos antes (B) y después (E) y registro de cada documento sintético nuevo con su id.
4. **Ninguna eliminación**, ni automática ni manual; cualquier limpieza futura requiere autorización separada.
5. La inspección/verificación no crea sesiones ni modifica guardianes (no usa la API HTTP).
6. Los pasos de lectura y escritura usan procesos y credenciales separados; el propietario introduce la contraseña solo en prompts ocultos.

## 8. Evidencias a registrar (sin secretos)

Por etapa: hora, comando lógico (sin contraseñas), código de salida, estado HTTP, tiempos (ms), ids públicos (`runId`, `registrationId`, `technicalAccountId`, `installationId`, `localPlayerId`, `sessionId`, `operationId`, `batchId`, `receiptId`), `payloadHash`, `factDigest`, `committedAtUtc`, recuentos antes/después, veredicto del verificador, PID de Express/Caddy y método de cierre, estado del almacén de certificados. **Prohibido registrar**: contraseña de Atlas, credencial de la cuenta, tokens JWT, `credentialVerifier`/`tokenHash`, contenido del `.env`, clave privada.

## 9. Intervención manual del usuario

Instalar y retirar la CA (Windows muestra un aviso que no puede automatizarse); escribir la contraseña de Atlas en cada prompt oculto (Express; cada inspección/verificación: previsiblemente **4 veces**: B, tras C, tras D/E y, si se hace F, tras F); arrancar Express en su consola y cerrarlo con Ctrl+C; anotar fuera del equipo el digest v4; autorizar por mensaje cada etapa; cerrar o dejar en solo lectura MongoDB Compass durante la prueba (R6).

## 10. Comprobación de que no queda nada activo (tras G o ante una parada)

```powershell
Get-Process node,caddy,Godot,certutil -ErrorAction SilentlyContinue            # 0
Get-NetTCPConnection -State Listen | ? LocalPort -in 3000,3001,8443,2019,80,443  # 0
Get-ChildItem Cert:\CurrentUser\Root | Measure-Object | % Count                 # 44
Get-ChildItem Cert:\CurrentUser\Root | ? { $_.Thumbprint -eq 'F2BF0E8DC06AC9C4F12F27ECD6841438A5D412A7' -or $_.Subject -match 'Two Sides' }   # vacío
Get-ChildItem Cert:\LocalMachine\Root | ? { $_.Subject -match 'Two Sides' }      # vacío
node "$B\scripts\backend-integrity.js" verify $MAN ; node "$B\scripts\scan-secrets.js"
```
Además: ningún archivo con la credencial de la cuenta en disco (solo `run-ids.json`, `batch.json`, `receipts-query.json`); autorizaciones de inspección usadas marcadas como consumidas; conexiones a Atlas solo las de Compass.

## 11. Criterios de aceptación y de detención

**Éxito de la prueba mínima:** Etapas A–E completas: registro 201, sesión 200; primer lote 200 con `committed`/201 y **sin 503**; verificación `consistent`; reenvío `duplicate` con el **mismo `receiptId`**; `receipts/query` `found` con el mismo recibo; deltas exactos `+1` en las seis colecciones y `0` en revocaciones e históricas; **0 duplicados**; ningún ACK sin fila; limpieza completa (G) y sin secretos en los informes. Latencias registradas, solo informativas frente al modelo (14 viajes ≈ 0,7–1,5 s).
**Parada** en cualquier criterio de §5 o de §6 marcado «Parar»; no se pasa a la etapa siguiente con un error sin diagnosticar; sin reintentos automáticos.
**Aceptación específica F2:** si algún envío tarda > 2 s y aun así devuelve `committed`, se anota como evidencia directa de la compuerta; si devuelve 503 con fila, se anota como **fallo de F2** (con el `operationId`) y se detiene toda escritura.

## 12. Riesgos y medidas

| ID | Riesgo | Medida |
|---|---|---|
| R1 | Credencial sintética perdida si el guion muere entre etapas | proceso único con archivos de continuación; alternativa (decisión D2) almacén protegido con DPAPI por cuenta; sin credencial no hay segundo login |
| R2 | Certificado de servidor caduca el 2026-11-16 | completar antes; si no, regenerar con autorización |
| R3 | Latencia real de transacciones en Atlas desconocida (14 viajes con `w:majority,j:true`) | registrar tiempos; la operación única cabe con holgura en 2 s + 3 s de gracia |
| R4 | Documentos sintéticos de la prueba anterior ya presentes | línea base y filtros por id nuevos (B/E) |
| R5 | Cierre forzado de Express (precedente B27/B28) | usar Ctrl+C; documentar el método |
| R6 | MongoDB Compass del propietario con sesiones abiertas a Atlas | cerrar o usarlo solo en lectura; cualquier cambio manual invalidaría los deltas |
| R7 | Límite de altas por IP/hora y cuenta huérfana si el registro falla | no repetir en bucle; un registro cuenta aunque falle |
| R8 | Fallo de TLS del cliente .NET real (no probado con la CA de prueba) | no interviene en la Ruta A; documentado para la Ruta B (B38 H4) |
| R9 | B00 abierto (mismo usuario del manifiesto, copias antiguas de `.env`, rol amplio) | no se agrava: sin nuevas credenciales; se mantienen las anclas fuera del equipo |
| R10 | Los scripts por etapas son nuevos y no están probados contra Atlas | probarlos antes en offline con un `HttpListener` y el doble de Mongo (etapa B40) |

## 13. Decisiones que requieren autorización

- **D1:** aprobar la creación y prueba offline de `sync-test-staged.ps1` y `build-second-op.mjs` (plantillas en `docs/main-sync-test/`, sin tocar `src/`, `scripts/` ni `tests/` de producción).
- **D2:** credencial en memoria con archivos de continuación (por defecto) o almacén protegido DPAPI de la cuenta sintética.
- **D3:** si la etapa F (abandono de respuesta) forma parte de esta campaña o queda para otra.
- **D4:** fecha/ventana de ejecución (antes del 2026-11-16) y quién arranca Caddy/Express (propietario o asistente con su permiso explícito).
- **D5:** cada etapa B–G requiere su autorización de ejecución separada; esta no autoriza ninguna.

Detenido tras entregar B39. No se inició ninguna conexión, lectura ni escritura real.
