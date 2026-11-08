# B29 — Plan operativo de la primera escritura sintética real en Atlas (Etapa 33)

Fecha: 2026-11-02. **Solo preparación.** No se arrancó Express ni Caddy, no se conectó Atlas, no se instaló ningún certificado, no se escribió nada, no se ejecutó Godot ni se tocó SQLite, no se modificó `src/`, `scripts/`, claves, contraseñas ni el manifiesto (integridad `ok`, 3 168 archivos), no se ejecutó bootstrap, C.2 ni F.2; sin commits ni `push`. B00 sigue pendiente.

Añadido (solo `docs/` y `tests/`, fuera del inventario de integridad): `docs/main-sync-test/build-synthetic-run.mjs.template`, `docs/main-sync-test/sync-test.ps1.template` y `tests/sync/main-sync-write-plan.test.js` (SW01–SW04, 4/4). El constructor se probó sin conexión contra el validador real del backend (`validateOperation`): la operación es aceptada.

## 1. Contrato real (leído en el código)

| Paso | Endpoint | Auth | Escribe | Notas |
|---|---|---|---|---|
| Registrar identidad técnica | `POST /api/v2/technical/registrations` | no | sí | cuerpo `{schemaVersion:2, registrationId, credential(43), installationId, localPlayerId, bindingGeneration:1}`; **201** creada, repetida con el mismo `registrationId` devuelve la existente sin documento nuevo |
| Sesión (JWT RS256, 900 s) | `POST /api/v2/technical/sessions` | credencial | sí | devuelve `accessToken`; el binding (installation/localPlayer) debe coincidir con el registrado |
| Comprobar identidad | `GET /api/v2/technical/me` | Bearer | no | 200 |
| Enviar operaciones | `POST /api/v2/sync/batches` | Bearer | sí | `{schemaVersion:2, batchId, operations[1..100]}`; cada operación `{operationId, payloadHash, leaseId, attempt, canonicalEnvelope, dependencies}`; `Content-Type: application/json`, ≤256 KiB, sin query |
| Consultar recibos | `POST /api/v2/sync/receipts/query` | Bearer | no | `{schemaVersion:2, attempts:[{operationId,payloadHash,leaseId,attempt}]}` |

`canonicalEnvelope` es JSON canónico (claves ordenadas, solo ASCII imprimible, ≤16 128 B) y `payloadHash` su SHA-256: **debe enviarse byte a byte**, por eso `batch.json` lo escribe Node y PowerShell lo envía sin re-serializar (SW04).

## 2. La operación sintética (una sola)

`session.report`, fase `open`: es el tipo más pequeño (no necesita partida ni dependencias). Contenido: `sessionId` aleatorio, `status:"open"`, `endedAtUtc:null`, `endOffsetMs:null`, `coverage {origin:"live_capture", historicalCoverageUnknown:true, incomplete:true}`, `sourceKey = "session:<sessionId>:open"`, `bindingGeneration:1`, `gameId:null`, `dependencies:[]`, todos los UUID v4 aleatorios, ninguno derivado de un jugador, instalación o partida reales. **Sin datos de juego** (ni partidas, decisiones, eventos ni intervalos).

### Documentos que debe crear (todos en `main_v2_*` de `two_sides_db`)

| Colección | Origen | Documento | Δ esperado |
|---|---|---|---|
| `main_v2_identities` | registro | `_id = technicalAccountId` (UUID generado por el servidor) con verificador Argon2id (nunca la credencial) | +1 |
| `main_v2_ownerGuards` | registro | `_id = technicalAccountId`, `revision` 0, luego +1 por sesión y +1 por cada transacción de sync (incluidas las re-emisiones) | +1 |
| `main_v2_identitySessions` | sesión | `_id = sessionId` del servidor, hash del token (nunca el token) | +1 |
| `main_v2_operations` | batch | `_id = "<technicalAccountId>:<operationId>"` con `record` y recibo (`acceptedAs: committed`) y `authorizationDecision` | +1 |
| `main_v2_facts` | batch | `_id = "<account>:<installation>:<localPlayer>:1\|session:<sessionId>:open"` con el payload canónico | +1 |
| `main_v2_fences` | batch | `_id = "ingestion-v1:<technicalAccountId>"` (`revision` incrementada en cada transacción); **el semilla `ingestion-v1` no se escribe** (`fenceMode:'owner'`) | +1 |
| `main_v2_revocations` | — | — | 0 |
| 7 colecciones históricas (`otherCollections`) y `main_v2_authorization` | — | — | **0 / no existe** |

Total: **6 documentos nuevos** (más 3 actualizaciones de `ownerGuards`/`fences` sobre documentos propios de la prueba). Respuesta esperada del primer envío: HTTP 200, `outcome: all_accepted`, `counters.committed = 1`, `results[0].status = committed`, `httpStatus = 201`, `receipt.acceptedAs = committed`.

## 3. Idempotencia

Reenviar **exactamente los mismos bytes** (mismo `operationId`, `payloadHash`, `batchId` puede repetirse): el motor encuentra la operación por `_id` y devuelve el **mismo recibo** (`receiptId` idéntico) con `status: duplicate`, `httpStatus: 200`, **sin documento nuevo**. Sí se incrementan `ownerGuards.revision` y el fence del propietario (la transacción empieza siempre), por lo que el contador de `estimatedCount` de **todas** las colecciones debe seguir igual. Comprobaciones: (a) segunda emisión → `duplicate` y mismo `receiptId`; (b) `receipts/query` devuelve el recibo; (c) la inspección «después» muestra +1 exacto por colección, no +2. (No se prueba un cambio de contenido bajo el mismo `operationId`: sería una escritura rechazada adicional y no aporta a esta prueba.)

## 4. Identificación inequívoca de lo sintético

El perfil `main` **no añade marcador de limpieza** (`integrationRunId`/`syntheticOwnerId` existen solo en el perfil de integración D.2). La identificación se hace por identificadores aleatorios de un solo uso, guardados en `run-ids.json` (sin secretos): `registrationId`, `installationId`, `localPlayerId`, `sessionId`, `operationId`, `batchId`, `runId` y el `technicalAccountId` que devuelve el registro. Filtros exactos para auditar/borrar (siempre con ese `technicalAccountId`, `T`):
- `identities`: `_id = T` · `ownerGuards`: `_id = T` · `identitySessions`: `technicalAccountId = T` · `operations`: `technicalAccountId = T` · `facts`: `scope` empieza por `T:` · `fences`: `_id = "ingestion-v1:" + T`.
- **Nunca** tocar `_id = "ingestion-v1"` (semilla) ni ningún documento con otro `T`.

## 5. Inspección de solo lectura antes/después

Herramienta existente: `scripts/run-main-inspection.ps1` (una ejecución por autorización, ventana ≤60 min, un solo uso). Operaciones permitidas: `connectionStatus`, `hello`, `listCollections`, `listIndexes`, `estimatedDocumentCount`, `findOne` de la semilla; no lee documentos. Limitaciones: `estimatedDocumentCount` es un contador de metadatos (suficiente para +1 exacto en una base sin otros escritores; no demuestra el contenido), y de la semilla solo informa existencia/validez, no su valor.

Cada inspección necesita **su propia autorización** (nueva, generada justo antes) y **una entrada de contraseña**:
```powershell
cd "C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend"
node scripts\new-main-inspection-authorization.js "$env:LOCALAPPDATA\TwoSidesInspection" rotated-backend    # sin red; escribe un JSON sin secretos
.\scripts\run-main-inspection.ps1 -Enable -Authorization "<ruta que imprime el comando anterior>"       # pide la contraseña oculta
```
Resultado esperado «antes» (de la última inspección real): `verdict: ready`, 7 `requiredCollections` presentes, `otherCollections` = las colecciones históricas con sus `estimatedCount`. Se guardan esos números. «Después»: ver §2 (Δ) y **todas las demás colecciones iguales**.

## 6. Atomicidad y errores parciales

- Registro, sesión y batch son **transacciones independientes**. Dentro del batch, fence + guard + fact + operation van en **una** transacción Mongo (`withTransaction`): o se confirma todo o nada. Con una sola operación no existe «batch parcial» (`207`).
- Fallo en el registro (no 201): se detiene; nada más se envía.
- Registro OK pero sesión fallida: queda una **identidad huérfana** (identities+1, ownerGuards+1) con ids registrados; se informa, no se reintenta solo.
- Sesión OK pero batch con error: 503/`deferred` (reintentable) → **no reenviar a ciegas**: primero `receipts/query` con el mismo `operationId`; si no hay recibo, el commit no ocurrió y el reenvío del mismo cuerpo es seguro (mismo `operationId`); si hay recibo, ya está confirmado. 4xx/`rejected`: no se reintenta. Resultado desconocido (timeout): igual, consultar recibo antes.
- Los reenvíos son seguros solo con los **mismos bytes** y el mismo `operationId`; nunca se genera otra operación para «arreglar» una.
- Cualquier fallo: detener Caddy/Express, hacer igualmente la limpieza (§8) y documentar; sin reintentos automáticos.

## 7. Secuencia en una única sesión (con roles)

| # | Quién | Acción / comando | Resultado esperado |
|---|---|---|---|
| 0 | Claude | Preflight de B28 (integridad, ACL, clave, procesos, puertos, certificados, Caddyfile) y construcción **sin red** de los ficheros: `New-Item` de `%LOCALAPPDATA%\TwoSidesSyntheticRun`; `node build.mjs "<backend>" "%LOCALAPPDATA%\TwoSidesSyntheticRun\<fecha>"` | `built:true, validatedByBackendSchema:true`; 3 JSON sin secretos; 44 certificados |
| 1 | Claude | genera la autorización de inspección «antes» | ruta + `executionId` |
| 2 | **Propietario** | `run-main-inspection.ps1 -Enable …` («antes», contraseña #1) y pega la salida | `verdict: ready`; conteos base |
| 3 | **Propietario** | instala la CA: `certutil -user -addstore Root "%LOCALAPPDATA%\TwoSidesLocalProxy\tls\ca.crt"` (huella SHA-1 `F2BF0E8D…D412A7`) | 45 certificados |
| 4 | **Propietario** | arranca Express con el lanzador (contraseña #2, comando de B27) | `…listening on loopback` en `127.0.0.1:3000` |
| 5 | Claude | arranca Caddy (`127.0.0.1:8443`) y comprueba escuchas; `sync-test.ps1 -RunDir … -ConfirmSyntheticWrites` | §2 y §3: registro 201, sesión 200, `me` 200, batch `committed`, reenvío `duplicate` con el mismo recibo, consulta de recibo 200 |
| 6 | Claude | detiene Caddy | 8443 libre |
| 7 | **Propietario** | **Ctrl+C** en Express; retira la CA: `certutil -user -delstore Root F2BF0E8DC06AC9C4F12F27ECD6841438A5D412A7` | 44 certificados; 3000 libre |
| 8 | Claude/Propietario | nueva autorización y `run-main-inspection.ps1` («después», contraseña #3) | Δ de §2, resto igual |
| 9 | Claude | verifica limpieza, borra `TwoSidesSyntheticRun` (solo ids públicos; no hay credencial ni token en disco) o lo conserva para la auditoría, y escribe `B30_…` | informe |

Total: **3 introducciones de contraseña** (2 inspecciones + Express) y 2 avisos de Windows (instalar/retirar CA). La credencial sintética existe solo en memoria de PowerShell durante el paso 5.

## 8. Limpieza

Ordinaria: parar Caddy (`Stop-Process`; con `admin off` no hay cierre ordenado), **Ctrl+C** en Express, retirar la CA (comando del paso 7), comprobar 44 certificados, 3000/8443/2019/80/443 libres, sin `node`/`caddy`, `tls\` conservado, integridad/escáner `ok`.

**Datos sintéticos en Atlas: no se pueden retirar con el código actual** (el backend no tiene ninguna ruta de borrado y no se modifica código). Los 6 documentos permanecen hasta que el propietario decida: (a) conservarlos como huella de prueba, o (b) borrarlos a mano en Atlas (Data Explorer/Compass, con un usuario administrador) usando solo los filtros de §4. El borrado exigiría una autorización aparte y una inspección posterior que confirme el −1 por colección.

## 9. Riesgos y condiciones

- La escritura en Atlas es **persistente**: la prueba deja 6 documentos (identidad técnica sintética con su verificador Argon2id).
- `twosides_backend` tiene `readWrite` sobre toda la base (más amplio que lo necesario, B00); el control real es que el código solo escribe en `main_v2_*`.
- `trust proxy` desactivado: Express ve todas las peticiones como `127.0.0.1` (límites de tasa compartidos; irrelevante para 6 llamadas).
- La CA vuelve a estar en `CurrentUser\Root` durante la sesión; el certificado del servidor caduca el 2026-11-16 (la prueba debe hacerse antes).
- Express se detiene con Ctrl+C (cierre ordenado); si no, anotar el método (B28 lo dejó sin documentar).
- `estimatedDocumentCount` es metadato: confirma conteos, no contenido.
- Sin cambios en código, claves, contraseñas ni manifiesto; el constructor y el script viven fuera del proyecto durante la ejecución.
- Godot, SQLite, partidas, C2Runtime, C.2 y F.2 quedan fuera. B00 abierto.

## 10. Autorización necesaria

Para ejecutar este plan hacen falta **tu autorización explícita** de: (1) las escrituras sintéticas en Atlas descritas en §2 (6 documentos persistentes), (2) las dos inspecciones de solo lectura (§5), (3) la instalación temporal de la CA en `CurrentUser\Root` y su retirada, (4) la creación de `%LOCALAPPDATA%\TwoSidesSyntheticRun` y `…\TwoSidesInspection`, y (5) la decisión sobre los documentos sintéticos tras la prueba (§8).
