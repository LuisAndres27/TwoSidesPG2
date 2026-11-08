# B05.5 — Etapa 2: cliente HTTP de Godot contra Express offline

Fecha: 2026-10-29 (America/Guatemala). **COMPLETADA EN MODO OFFLINE: el cliente C# se comunica por HTTP con la composición Express `offline-test` (loopback, almacenes simulados), registra y autentica un jugador sintético y sincroniza su Outbox con recibos reales del servidor simulado.** No se conectó MongoDB Atlas, no se usó `twosides_integration_test`, no se ejecutó C.2 ni F.2, no se leyó ni modificó `backend/.env`, y no se tocaron las partidas SQLite reales, las ACL, los propietarios ni las releases de `C2Runtime`. B00 sigue pendiente. La rotación de la contraseña de integración sigue sin confirmarse.

**El cliente todavía no está conectado a ninguna escena ni a la jugabilidad:** nada del juego lo instancia. Es una biblioteca verificada, lista para cablear en una etapa posterior. No se abrió el editor de Godot; el proyecto C# del juego compila con la nueva referencia.

## 1. Revisión inicial

| Pregunta | Hallazgo |
|---|---|
| Proyecto Godot real | `Two-Sides PRUEBA/` (`project.godot`, `TwoSides.csproj`, Godot 4.6.1, .NET 8). Referencia `local-persistence/src/TwoSides.LocalPersistence.csproj` |
| SQLite y Outbox | `local-persistence/src` (`SyncOutboxService`, `SyncOutboxSchema`, `SyncOutboxProjection`, `LocalOutboxScheduler/Pump`, `SyntheticOutboxReconciler`) y adaptadores del juego en `integration/sqlite`. El Outbox ya sabe capturar, reservar con *lease*, reintentar con espera exponencial, rechazar y confirmar con recibo, y **no tenía ninguna dependencia HTTP, por diseño** |
| Contratos JSON del backend | `POST /api/v2/technical/registrations`, `POST /api/v2/technical/sessions`, `GET /api/v2/technical/me`, `POST /api/v2/sync/batches`, `POST /api/v2/sync/receipts/query` (esquemas `zod` en `backend/src/modules/auth/jwt-schemas.js` y `modules/sync/schemas.js`). Los bytes que genera C# ya los valida el backend (vectores C#↔Node) |
| Autenticación de un jugador técnico | El cliente crea un secreto aleatorio de 32 bytes, registra `registrationId + credential + installationId + localPlayerId + generación 1`, y abre sesión con `technicalAccountId + credential + installationId + localPlayerId`. Recibe un JWT RS256 de 900 s |
| Eventos que ya genera el juego | Reportes de partida (`game.report`), de sesión (`session.report`) y eventos/intervalos de juego (`gameplay.event`, `gameplay.interval`) mediante `LocalGameplayObserver` y `GameSaveService`; el Outbox los proyecta con identificadores y *hash* estables |
| Consumo de recibos | `SyncOutboxService.Confirm(SimulatedSyncReceipt)` ya existía; solo faltaba un puente que entregue el recibo del servidor |
| Capa de red anterior del juego | `scripts/network` (`ApiClient`, `PersistentApiClient`, servicios `/api/v1/...`) usa `HttpRequest` de Godot para un contrato **anterior** (`/api/v1/auth/*`, `/api/v1/me/games/*`) que la composición nueva no monta. **No se tocó ni se reutilizó**: es otra generación de la API y no habla con el Outbox v2 |

No se duplicó ningún módulo. No se modificaron reglas ambientales, niveles ni progreso de biomas.

## 2. Arquitectura de comunicación

```
 jugabilidad ──► SQLite local (partidas, progreso)  ──captura──►  SyncOutboxService (Outbox existente, sin cambios de esquema)
                                                                       │ Reserve / Retry / Reject / Confirm   (SQLite síncrono, hilo de fondo)
                                                                       ▼
   TwoSides.SyncHttp (biblioteca nueva)   SyncOutboxDispatcher ──► SyncSessionManager ──► SyncHttpTransport (HttpClient, loopback/HTTPS)
        SyncOutboxWorker (bucle opcional)                         JWT solo en memoria        timeouts, límites, sin redirecciones
                                                                       │
                                                  HTTP  127.0.0.1:3000 ▼
                      backend/scripts/run-offline-backend.js ─► createBackend({profile:'offline-test'}) ─► almacenes simulados en memoria
```

**Elección de transporte: `System.Net.Http.HttpClient`, no el nodo `HttpRequest` de Godot.** `HttpRequest` es un `Node` que debe estar en el árbol de escenas y manejarse desde el hilo principal: ataría la sincronización al estado de las escenas y no se puede ejercitar sin el motor (el repositorio no tiene arnés del motor). `HttpClient` es asíncrono, cancelable, tiene temporizadores exactos, corre fuera del hilo principal —igual que debe hacerlo el SQLite síncrono del Outbox— y se prueba en consola. No usa tipos de Godot. La biblioteca vive en un proyecto aparte, fuera de `TwoSides.LocalPersistence`, porque dos comprobaciones existentes (`library contains no HTTP…` y la del observador de juego) exigen que esos ensamblados no referencien `System.Net.Http`; las dos siguen pasando.

### Piezas (todas en `local-persistence/sync-http/`, extensión `.cs.txt` como el resto de la biblioteca)

| Clase | Responsabilidad |
|---|---|
| `SyncHttpOptions` | URL base: HTTPS, o HTTP **solo si** se pide explícitamente y es *loopback*; sin credenciales, consulta, fragmento ni prefijo; límites de tiempo (100 ms–60 s), de lote (≤ 100) y de respuesta (≤ 4 MiB) |
| `SyncHttpTransport` | `HttpClient` sin redirecciones, sin *proxy*, sin cookies. Solo rutas `/api/…` sin `?`, `#` ni `\`. Temporizador por solicitud, lectura con límite de bytes, y clasificación de fallos (`NetworkUnavailable`, `Timeout`, `Unauthorized`, `Forbidden`, `RateLimited`, `ServerUnavailable`, `Rejected`, `InvalidResponse`, `Canceled`). No registra nada |
| `SyncSessionManager` | Registro (una vez) y sesión JWT v2. El secreto de la cuenta y el JWT viven **solo en memoria** (`ISyncSecretStore`, por defecto en memoria). Un único acceso al token: `SendAsync`, que lo adjunta sin devolverlo y repite una vez tras un 401 (servidor reiniciado). `ProbeAsync` comprueba la sesión |
| `SyncOutboxDispatcher` | Un pase: recuperar *leases* vencidos → reservar → autenticar → **consultar recibos de lo ya enviado antes** → enviar el lote → aplicar cada resultado con el Outbox existente |
| `SyncOutboxWorker` | Bucle de fondo **opcional** (nadie lo crea todavía): se despierta con `Request()`, espera tras los fallos, se cancela y cierra con `DisposeAsync` |

Único cambio en la biblioteca de persistencia: `SyncOutboxService.Dependencies(owner, operationId)`, un método de solo lectura que devuelve las dependencias guardadas (el servidor las exige exactas). No cambia el esquema ni el comportamiento existente.

### Lanzador Express offline (desarrollo)

`backend/scripts/run-offline-backend.js` — usa `createBackend({profile:'offline-test'})` con los repositorios sintéticos en memoria, un par RSA generado por arranque y la configuración JWT de pruebas. Escucha **solo en 127.0.0.1** (puerto por `--port`, 3000 por defecto), no lee entorno ni `.env`, no importa Mongoose/Atlas/C.2, no acepta *host*, URI, usuario, base ni perfil, rechaza `NODE_ENV=production` y se detiene en orden con `SIGINT`/`SIGTERM` o, con `--exit-on-stdin-close`, cuando su entrada se cierra o recibe `shutdown`. `npm start` **no cambió** (`node src/server.js`).

## 3. Contratos HTTP utilizados

| Solicitud | Cuerpo | Respuesta que el cliente interpreta |
|---|---|---|
| `POST /api/v2/technical/registrations` | `{schemaVersion:2, registrationId, credential, installationId, localPlayerId, bindingGeneration:1}` | 200/201 con `technicalAccountId` |
| `POST /api/v2/technical/sessions` | `{schemaVersion:2, technicalAccountId, credential, installationId, localPlayerId}` | `accessToken` (RS256, `ver 2`) y `expiresIn` 900; renueva 30 s antes |
| `GET /api/v2/technical/me` (con `Authorization: Bearer`) | — | `{schemaVersion:2, role:'player'}` (prueba de sesión) |
| `POST /api/v2/sync/batches` | `{schemaVersion:2, batchId, operations:[{operationId, payloadHash, leaseId, attempt, canonicalEnvelope, dependencies}]}` | `results[]` con `status` (`committed`/`duplicate`/`superseded`/`deferred`/`conflict`/`rejected`), `receipt`, `error{code,retryable,retryAfterSeconds}`; HTTP 200, 207, 409, 422, 429, 503 |
| `POST /api/v2/sync/receipts/query` | `{schemaVersion:2, attempts:[{operationId, payloadHash, leaseId, attempt}]}` | `results[]` con `found` + `receipt`, o `not_found` |

**No se cambió ningún contrato del backend.** Los *bytes* enviados son exactamente `canonicalEnvelope` y `payloadHash` guardados en el Outbox.

### Interpretación de respuestas

| Resultado del servidor | Efecto en el Outbox local |
|---|---|
| `committed` / `duplicate` / `superseded` con un recibo que coincide en operación, *hash*, instalación, jugador y generación | `Confirm` (confirmada) |
| Recibo ausente o que no coincide | **No se confirma**; reintento (`remote_unavailable`) y, luego, reconciliación por recibos |
| `deferred` (`dependency_missing`, `storage_unavailable`, `quota_exceeded`) | `Retry` con el código equivalente y el `Retry-After` del servidor |
| `rejected` / `conflict` con código permanente conocido | `Reject` → `permanent_failure` (la operación se **conserva**) |
| Código desconocido | **Nunca** se convierte en rechazo permanente: `Retry` |
| Sin red, *timeout*, 5xx, 429, JSON inválido | `Retry` de todas las operaciones del lote (`network_unavailable`, `timeout`, `remote_unavailable`, `rate_limited`) |
| 401 | Un único re-login (y, si la cuenta no existe en el servidor, un nuevo registro) y un reintento de la misma solicitud |
| Cancelación | Las operaciones quedan en vuelo; el *lease* vence y `RecoverExpired` las devuelve a reintento. No se pierde nada |

## 4. Pruebas completadas

Todas con bases SQLite **desechables** (`SyntheticSandbox`, creadas y borradas por el propio arnés), el **Express offline real** como proceso hijo y sin Atlas. Ejecutor: `local-persistence/run-sync-http-checks.ps1` (14 comprobaciones).

| # pedido | Comprobación | Resultado |
|---|---|---|
| 1, 2 | Registro y autenticación de un jugador sintético; JWT v2; sondeo autenticado | **Aprobada** |
| 3 | Solicitud sin token y con token falso → 401 | **Aprobada** |
| 4 | Lote válido (2 reportes de partida, 1 sesión abierta, 1 intervalo dependiente): confirmado solo con recibos; el hijo espera a su padre | **Aprobada** |
| 5 | Consulta de recibos: `found` para lo confirmado, `not_found` para lo desconocido | **Aprobada** |
| 6 | Reenvío del mismo `operationId` → `duplicate` con el recibo original; el recibo local no cambia | **Aprobada** |
| 7 | Interrupción HTTP: servidor caído y servidor mudo (*timeout* de 400 ms); todo queda `retryable_failure`, mismos identificadores y *hash*, ninguna operación perdida ni progreso tocado | **Aprobada** |
| 8 | Reconexión: se entregan las mismas operaciones una vez; consulta previa de recibos (`not_found`) y luego envío | **Aprobada** |
| 9 | Conservación de pendientes ante *timeout*; el jugador sigue guardando y capturando localmente; la sincronización no cambia la partida ni el progreso de biomas | **Aprobada** |
| 10 | Cierre ordenado del servidor (código de salida 0, sin errores) y reinicio con estado vacío: lo confirmado **no** se reenvía, lo nuevo sí, la sesión se restablece (re-login fallido → nuevo registro) y los recibos antiguos quedan intactos | **Aprobada** |
| extra | Respuesta perdida *después* de que el servidor confirmó: se reconcilia con la consulta de recibos **sin reenviar** el lote (1 lote, 1 consulta) | **Aprobada** |
| extra | Recibo que no coincide → nunca se acepta; luego se reconcilia con el recibo real | **Aprobada** |
| extra | Rechazo permanente del servidor → `permanent_failure`, sobres intactos, no se reenvía y el dependiente espera | **Aprobada** |
| extra | Ningún secreto en la base de datos, en diagnósticos ni en archivos nuevos | **Aprobada** |
| extra | `SyncOutboxWorker`: drena el Outbox en segundo plano y se cierra en < 5 s aunque el servidor desaparezca | **Aprobada** |
| extra | Validación de opciones: HTTPS o *loopback* explícito; rechaza credenciales, consulta, prefijo, HTTP no *loopback*, rutas peligrosas | **Aprobada** |

Regresiones:

| Ejecución | Resultado |
|---|---|
| Servidor: `tests/sync/offline-launcher.test.js` (OL01–OL04) | 4 aprobadas |
| Servidor: todo vitest (29 archivos) | **575 aprobadas, 16 omitidas, 0 fallos** (las omitidas son las ya conocidas con entorno propio) |
| Servidor: pruebas heredadas de Node | 39 aprobadas |
| Persistencia/Outbox existentes: `--outbox` 64, `--outbox-activation` 28, `--outbox-bounded-close` 26, `--outbox-shutdown-recovery` 24, `--reconciliation` 51, `--gameplay-events` 41, `--gameplay-observer` 31, `--statistics-screen` 24, `--local-statistics` 39, `--game-over-navigation` 19, `--local-finals` 126, `--biome-completion` 54, `--activity-statistics` 23 | **todas aprobadas** |
| Biblioteca de persistencia (`run-checks.ps1`) | 43 aprobadas, 0 bases sintéticas restantes |
| Proyecto Godot C# (`TwoSides.csproj`) con la nueva referencia | **Compila: 0 errores** (las 63 advertencias `ParallaxBackground` son preexistentes) |

## 5. Errores y hallazgos identificados

1. **Mi primera ubicación del cliente rompió dos comprobaciones existentes** (el ensamblado de persistencia y el del observador no deben referenciar `System.Net.Http`). Lo detecté con la regresión y reorganicé el cliente en su propio proyecto; ahora ambas pasan.
2. **Dos restos de ejecuciones interrumpidas** de esa fase (un directorio de base sintética vacío y una base de 0 bytes en `local-persistence/.work/databases`) hicieron fallar el conteo «bases sintéticas restantes». Eran artefactos de pruebas míos, de 0 bytes; los eliminé tras comprobar su contenido y la ruta.
3. **La capa de red anterior (`scripts/network`) usa un contrato diferente** (`/api/v1/...`, identificadores de Mongo) y no sirve para el Outbox v2. Debe retirarse o sustituirse al cablear; hoy ninguna de las dos está conectada a la jugabilidad.
4. **El secreto de la cuenta no se persiste.** Un servidor real exige unicidad por (instalación, jugador): si el juego se reinicia y pierde el secreto, no podría volver a abrir sesión ni registrarse otra vez. Falta un almacén protegido por usuario de Windows (por ejemplo DPAPI) antes de cualquier uso real. No se escribe en ningún archivo de texto.
5. El servidor offline guarda todo en memoria: al reiniciarlo se pierde el estado. El cliente lo tolera (re-registro y reenvío de lo pendiente); un servidor con datos persistentes requerirá otro perfil.
6. Las comprobaciones llegaron a 14 aprobadas a la primera, así que verifiqué que no fueran vacuosas: los casos de rechazo, pérdida de respuesta y recibo alterado alteran bytes reales en vuelo y exigen estados concretos del Outbox.

## 6. Limitaciones

- **No está cableado a la jugabilidad.** Nadie llama a `SyncOutboxDispatcher` ni a `SyncOutboxWorker`; el juego se comporta como antes y sigue funcionando sin internet. No se abrió el editor ni se probó en el motor.
- Solo contra servidor simulado en *loopback* con HTTP; HTTPS está soportado por las opciones pero no se probó contra un servidor TLS.
- El SQLite del Outbox es síncrono: el dispatcher debe ejecutarse en un hilo de fondo (el worker lo hace), nunca en el hilo de fotogramas.
- Sin persistencia de credencial (ver 5.4), sin cola de actividad por escena y sin interfaz de estado de sincronización.
- Un resultado `forbidden` del servidor se trata como conflicto permanente de la operación (el vocabulario local de rechazos es fijo); no hay un estado específico de «identidad no autorizada».
- Los límites del Outbox (16 KiB por operación, 100 por lote, 256 KiB por lote) y los del servidor se heredan sin cambios.

## 7. Estado del Outbox

- Sin cambios de esquema, de versión ni de reglas. Todas las operaciones de prueba vivieron en bases sintéticas ya eliminadas.
- Garantías verificadas: los identificadores y *hashes* nunca cambian; un fallo HTTP solo mueve operaciones a `retryable_failure`; nada se borra por *timeout*; solo se confirma con un recibo válido; un resultado incierto se reconcilia con la consulta de recibos; los rechazos permanentes se conservan.
- **Las partidas SQLite reales del jugador no se abrieron.**

## 8. Archivos creados y modificados

| Archivo | Cambio |
|---|---|
| `backend/scripts/run-offline-backend.js` | **Nuevo.** Lanzador de desarrollo |
| `backend/tests/sync/offline-launcher.test.js` | **Nuevo.** OL01–OL04 |
| `local-persistence/sync-http/` (`TwoSides.SyncHttp.csproj`, `SyncHttpTransport.cs.txt`, `SyncSessionManager.cs.txt`, `SyncOutboxDispatcher.cs.txt`, `packages.lock.json`) | **Nuevo.** Cliente HTTP |
| `local-persistence/sync-http-tests/` (`SyncHttp.Checks.csproj`, `Program.cs.txt`, `SyncHttpChecks.cs.txt`, `packages.lock.json`) | **Nuevo.** Ejecutor de 14 comprobaciones |
| `local-persistence/run-sync-http-checks.ps1` | **Nuevo.** `-Restore` y ejecución |
| `local-persistence/src/SyncOutboxService.cs.txt` | **Un método añadido:** `Dependencies(...)` (solo lectura) |
| `TwoSides.csproj` | **Una línea:** `ProjectReference` a `local-persistence/sync-http/TwoSides.SyncHttp.csproj` |
| `.godot/mono/temp/…` | Artefactos de compilación regenerados por la propia compilación |
| `backend/docs/B05_5_GODOT_HTTP_OFFLINE_RESULT.md` | Este informe |

No se modificaron `backend/src` (salvo lo ya hecho en la etapa 1), `package.json`, `project.godot`, escenas, scripts de juego, `backend/.env`, SQLite protegido, ACL ni propietarios.

## 9. Qué falta para usar Atlas real

1. **Confirmar la rotación** de la contraseña de `twosides_integration_test` (pendiente desde C.2) y una autorización expresa para cualquier conexión.
2. **Perfil `integration` del backend:** hoy está reservado y falla cerrado. Necesita su fábrica de dependencias con MongoDB (repositorios de identidad e ingesta de integración, ámbito propio de colecciones, índices y *fence*), una gestión real de claves JWT y una política de producción. El router de sincronización exige hoy un repositorio sintético y el JWT solo admite la configuración aislada.
3. **Credencial del cliente:** almacén protegido por usuario de Windows para el secreto de la cuenta y reglas para recuperar una cuenta perdida.
4. **TLS y despliegue:** HTTPS delante del backend; el cliente ya lo exige fuera de *loopback*.
5. **Cableado en el juego (decisión aparte):** un coordinador que cree el `SyncOutboxWorker` tras el arranque local y lo detenga al cerrar, enlazado con el `LocalOutboxScheduler` ya existente, y una indicación mínima de estado. Debe mantener que fallar la red no impida jugar.
6. **Validación posterior contra Atlas** con los mismos 14 casos, ya autorizada y con la cuenta rotada.

**Entrega:** Godot (por su biblioteca C#) puede comunicarse con Express por HTTP local, autenticar un jugador sintético y sincronizar operaciones de prueba con repositorios simulados; el videojuego sigue funcionando sin internet; la sincronización con MongoDB Atlas sigue deshabilitada. Detenido.
