# B38 — F2.5: auditoría de integración cliente ↔ servidor y preparación de la prueba real contra Atlas

Fecha: 2026-11-02. **Solo lectura, análisis y documentación.** No se modificó `src/`, `scripts/`, `tests/`, archivos de Godot, SQLite, Outbox ni manifiestos; no se conectó Atlas; no se arrancó Express ni Caddy; no se ejecutó Godot ni las pruebas de .NET; no se instalaron certificados; no hubo F3, commits ni push. Manifiesto vigente: v4 (`treeDigest aea04105…e27e`, SHA-256 `7DEC55E3…3E8B`).

Convención de evidencia: **[I]** implementado (se leyó el código), **[P]** probado (existe una prueba o evidencia registrada que lo cubre; no se re-ejecutó aquí), **[S]** suposición (no verificado).

## 0. Hallazgo principal

El proyecto contiene **dos pilas de red distintas** en el cliente C#, y solo una es compatible con el backend `main`:

| Pila | Ubicación | Transporte | API | ¿Compatible con Express `main`? |
|---|---|---|---|---|
| **Sync v2 (Outbox)** | `local-persistence/sync-http/*.cs.txt` + `local-persistence/src/*.cs.txt` (proyectos referenciados por `TwoSides.csproj`), anfitrión en `integration/sqlite/GameSyncHost.cs` | `System.Net.Http.HttpClient` (`SocketsHttpHandler`), fuera del hilo principal | `/api/v2/technical/*`, `/api/v2/sync/batches`, `/api/v2/sync/receipts/query` | **Sí** (los contratos coinciden) |
| **Red v1 (autoload)** | `scripts/network/*.cs` (`GameApplicationContext`, `ApiClient`, `ConnectivitySupervisor`, servicios) | `Godot.HttpRequest` | `/api/v1/auth/*`, `/api/v1/me/games/*`, `/api/health` | **No**: `main` solo monta `/api/health` y `/api/v2/*`; las rutas v1 contestan 404 («legacy opaque-token routes are not mounted», `composition/backend.js`) |

Lo que se pidió auditar como «`ApiClient.cs` / `Configuration.TimeoutSeconds`» pertenece a la pila v1. El cliente que envía la Outbox al endpoint v2 es `SyncHttpTransport`/`SyncOutboxDispatcher`; su tiempo de espera es `SyncHttpOptions.RequestTimeout`.

## 1. Arquitectura encontrada

```
Godot (GameApplicationContext autoload)
 ├─ GameSyncHost (hijo del autoload; Tick cada 2 s; trabajo fuera del hilo principal)
 │    └─ SyncWorkerLifecycle (como máximo 1 worker) ─ SyncOutboxWorker (bucle 15 s inactivo / 5 s tras fallo)
 │         └─ SyncOutboxDispatcher.RunPassAsync ─ SyncSessionManager (registro único + login JWT v2) ─ SyncHttpTransport (HttpClient)
 │              └─ SyncOutboxService ─ SQLite (tabla sync_outbox, sync_dependencies; PRAGMA synchronous=FULL, journal_mode=DELETE)
 │    └─ LocalOutboxScheduler/LocalOutboxPump: proyecta el estado ya guardado en SQLite a filas de Outbox (idempotente por source_key)
 └─ scripts/network (ApiClient v1, ConnectivitySupervisor, PendingOperationStore en JSON): API v1, NO usada por el worker v2
→ HTTPS → Caddy (127.0.0.1:8443, Host=localhost) → Express main (127.0.0.1:3000) → MongoDB Atlas (main_v2_*)
```

Activación (GameSyncHost.Bind): **desactivada por defecto**. (a) Normal: solo con `ProjectSettings two_sides/sync/main_api_url` = URL `https://` sin credenciales/ruta (`SyncMainMode`); **`project.godot` no contiene esa clave** [I]. (b) Prueba local: argumentos exactos `--two-sides-sync-local-test` (HTTP a `http://127.0.0.1:3000`, nunca otro host/puerto) y opcionalmente `--two-sides-test-storage=sandbox` (BD desechable) [I]. Cualquier otro `--two-sides-sync*` la desactiva [I][P].

## 2. Archivos relevantes

Cliente: `local-persistence/sync-http/{SyncHttpTransport,SyncOutboxDispatcher,SyncSessionManager,SyncWorkerLifecycle,DpapiSyncSecretStore}.cs.txt`; `local-persistence/src/{SyncOutboxService,SyncOutboxModels,SyncOutboxSchema,SyncOutboxProjection,LocalOutboxPump,LocalOutboxScheduler,SyntheticOutboxReconciler,OwnedCopyDatabase,SchemaManager}.cs.txt`; `integration/sqlite/{GameSyncHost,GamePersistenceAdapter,GamePersistenceContext}.cs`; `scripts/network/{ApiConfiguration,ApiClient,ApiProtocol,PendingOperationStore,PendingReconciliation,ConnectivitySupervisor}.cs`; pruebas del cliente: `local-persistence/sync-http-tests/SyncHttpChecks.cs.txt` (188 comprobaciones, ≈ 35 casos con nombre). Servidor: `backend/src/modules/sync/{ingestion-service,budget,mongo-ingestion-repository,schemas,routes}.js`, `src/composition/backend.js`, `src/main/profile.js`.

## 3. Estado real de integración (respuestas a las 10 preguntas)

| # | Pregunta | Respuesta | Evidencia |
|---|---|---|---|
| 1 | ¿`operationId` se conserva al reenviar? | **Sí.** El id se asigna al capturar el hecho en la Outbox; `Reserve` solo cambia estado, `attempts` y `lease`; el dispatcher envía `o.OperationId` y `payloadHash` inmutables. «Identifiers never change, nothing is deleted» | [I] `SyncOutboxService.Reserve/Retry`, `SyncOutboxDispatcher`; [P] casos «the same operation ids are delivered once», «sending the same operationId again returns the original receipt» |
| 2 | `batchId` | **Cambia en cada pasada** (`Guid.NewGuid()`). El servidor solo lo valida (uuid) y lo **devuelve como eco**; no participa en la idempotencia (ni se persiste). Consecuencia: no hay deduplicación a nivel de lote; la deduplicación es por operación (suficiente). No es un riesgo; sí implica que `batchId` no sirve para correlacionar reintentos en los registros | [I] dispatcher; `ingestion-service.js:67` |
| 3 | ¿Un 503 conserva la operación en SQLite? | **Sí.** Nunca se borra ni se marca `confirmed` sin recibo coincidente. Un 503 con cuerpo `results` se interpreta por operación (`deferred` → `Retry`, con `retryAfterSeconds`); un 503 sin `results` → `FailureRemaining` → `Retry` de todas. El estado pasa a `retryable_failure` con retroceso 0,5–900 s | [I]; [P] «HTTP interruption keeps every pending operation unchanged… ends as retryable» |
| 4 | ¿`deferred` se reintenta bien? | **Sí.** `RetryCode`: `dependency_missing`→igual, `quota_exceeded`/`rate_limited`→`rate_limited`, resto→`remote_unavailable`; códigos desconocidos nunca se convierten en rechazo permanente. Las hijas esperan a que la madre esté `confirmed` (`Reserve`). Esto cubre también las operaciones «no iniciadas» tras un resultado desconocido de F2 (D3), que llegan como `deferred`/`storage_unavailable` | [I]; [P] «dependent operations wait for their parent» |
| 5 | ¿Soporta `duplicate` y el `receiptId` original? | **Sí.** `committed`/`duplicate`/`superseded` se aceptan solo si el recibo coincide exactamente (operationId, payloadHash, installationId, localPlayerId, bindingGeneration, receiptId, committedAtUtc, acceptedAs); `Confirm` guarda el recibo. Si la fila ya está `confirmed`, exige JSON idéntico (`RECEIPT_CONFLICT` si difiere: incluye `leaseId` y `attempt` del intento, por lo que **no** debe reconfirmarse una operación ya confirmada) | [I]; [P] «a server receipt that does not match… is never accepted» |
| 6 | ¿Pérdida de respuesta tras commit ⇒ reenvío seguro? | **Sí, por diseño.** Una operación con `Attempts>1` se consulta primero en `/api/v2/sync/receipts/query`; las encontradas se confirman (`Reconciled`) y no se reenvían; las demás se reenvían con el mismo id (el servidor devuelve `duplicate` con el recibo original aunque la consulta falle) | [I]; [P] «a response lost after the server committed is reconciled with the receipt query…» (contra un servidor simulado) |
| 7 | ¿Se pueden perder operaciones al cerrar Godot de forma inesperada? | **No se encontró vía de pérdida.** Los hechos nacen del estado ya guardado en SQLite (la `Pump` los proyecta, idempotente por `source_key`); `Reserve/Confirm/Retry` son transacciones SQLite con `synchronous=FULL`; tras un corte quedan filas `in_flight` con lease de 30 s que `RecoverExpired` devuelve a `retryable_failure`. Un corte entre «servidor confirmó» y «`Confirm` local» se resuelve con la consulta de recibos | [I]; [P] «closing the game during an in-flight batch leaves a consistent Outbox and the next run finishes the job»; **[S]** fiabilidad de `FULL` + `journal_mode=DELETE` en el disco real del jugador |
| 8 | ¿Riesgos de concurrencia entre sincronizaciones? | **Bajos.** Un solo worker (`SyncWorkerLifecycle` bajo semáforo), un `SemaphoreSlim` por pasada, leases por operación y verificación de lease en `Retry/Reject/Confirm`. Residual: la `Pump` (proyección) y el dispatcher usan conexiones SQLite distintas; el contrato dice que el llamante las serializa **[S]** que `GamePersistenceAdapter` lo haga siempre | [I]; [P] «the worker starts once… repeated ticks and scene changes never create a second one» |
| 9 | Timeout real configurado en C# | **Sync v2: 10 s por petición** (`SyncHttpOptions`, defecto `TimeSpan.FromSeconds(10)`, permitido 0,1–60 s; cubre cabeceras **y** lectura del cuerpo; `ConnectTimeout` 3 s). Pila v1: 10 s (`ApiConfiguration.RequestTimeoutSeconds`). Lote: **25 operaciones** (`SyncHttpOptions`/dispatcher; máx. 100) | [I] |
| 10 | ¿Permite esperar la gracia de commit de F2? | **Solo en parte.** El servidor limita un lote a `batchBudgetMs = 10 000 ms` y la gracia de F2 no puede sobrepasar ese final (D2). El cliente cancela a los **10 s** de su propio reloj, que arranca **antes** (conexión, TLS, subida). Resultado: si el servidor agota su presupuesto de lote, **el cliente abandona antes de recibir la respuesta**. Los commits ya hechos no se pierden (se reconcilian por recibos), pero la gracia solo es útil por completo cuando el lote termina por debajo de ≈ 9 s | [I] cifras de ambos lados; **[S]** latencia real de cada operación en Atlas |

### Matriz de dimensionado (estimación, **no medida en Atlas**; 1 viaje = 49,5 ms de RTT medio de `hello`, mínimo físico)

| Escenario | Viajes/op (modelo) | Tiempo/op | Ops que caben en 9 s |
|---|---|---|---|
| Caché caliente, operación nueva | 14 | ≈ 0,7 s | ≈ 12 |
| Reenvío idéntico | 9 | ≈ 0,45 s | ≈ 20 |
| Primera operación en frío | 21 (+ conexión ≈ 0,46 s) | ≈ 1,5 s | 1 |

Un lote de 25 operaciones nuevas necesita ≈ 17 s en el mejor caso ⇒ **supera el presupuesto de lote (10 s) y el tiempo de espera del cliente (10 s)**.

## 4. Auditoría del backend frente a los contratos del cliente

| Aspecto | Cliente (emisor) | Servidor (receptor) | Estado |
|---|---|---|---|
| Registro | `POST /api/v2/technical/registrations {schemaVersion:2, registrationId, credential, installationId, localPlayerId, bindingGeneration:1}`; `registrationId` persistente para reintentar sin crear 2 cuentas | misma ruta; clave idempotente de registro | [I][P] |
| Sesión | `POST …/sessions`; un nuevo registro automático si el login da 401 (servidor reiniciado vacío) | JWT v2 `main`; ruta `live` (sin caché) | [I][P] |
| Lote | `{schemaVersion:2, batchId, operations:[{operationId, payloadHash, leaseId, attempt, canonicalEnvelope, dependencies}]}` | `batchSchema`/`operationSchema` estrictos (`uuid`, hash hex-64, `attempt` positivo, `canonicalEnvelope` ≤ 16 384, ≤ 16 dependencias, ≤ 100 operaciones) | [I]; los 63 vectores del diferencial **provienen del generador C#** |
| Consulta de recibos | `{schemaVersion:2, attempts:[{operationId, payloadHash, leaseId, attempt}]}` | `querySchema` (1–100); **no es de solo lectura** (transacción que sube guardián y fence); pasa por la compuerta de F2 | [I][P] |
| Resultados | `status` ∈ committed/duplicate/superseded/deferred/conflict/rejected + `receipt` + `error{code,retryable,retryAfterSeconds}` | idéntico | [I] |
| Estados HTTP | lee el cuerpo `results` también en 4xx/5xx; `>=500` = `ServerUnavailable` | 200/207/401/403/409/422/429/503 con cuerpo `results` | [I] |
| Recibo | exige `committedAtUtc` canónico (`SyncOutboxProjection.Utc`) | `toISOString()` | [P] en el simulador; **[S]** en Atlas real |
| Compatibilidad con F2 | `deferred`/`storage_unavailable` y «no iniciadas» se tratan como reintento; `commitOutcome` interno nunca se serializa | contrato público sin cambios (D1) | [I] ambos lados; **[S]** no hay prueba cliente-contra-backend-F2 |
| Errores de conexión | `NetworkUnavailable`/`Timeout` ⇒ `Retry` (nunca rechazo permanente) | — | [I][P] |

Autenticación: el token JWT nunca sale del `SyncSessionManager`; un 401 provoca un único re-login transparente y reintenta la misma petición [I][P]. La credencial de cuenta se guarda con DPAPI por (jugador, instalación, URL de destino) [I][P].

## 5. Hallazgos y riesgos (con gravedad)

| ID | Gravedad | Hallazgo | Evidencia técnica | Efecto |
|---|---|---|---|---|
| H1 | **Alto** | Tiempo de espera del cliente (10 s) = presupuesto de lote del servidor (10 s) y lote de 25 > capacidad (≈ 12 operaciones/9 s con 14 viajes) | `SyncHttpOptions` (10 s, 25), `ingestion-service.js` (`batchBudgetMs=10000`), modelo B34 | Un lote grande se cobra por entero: el servidor confirma las primeras ≈ 12–14, difiere el resto y la respuesta llega tras el abandono del cliente. Sin pérdida de datos (recibos), pero cada pasada gasta consultas de recibos + reenvíos y puede entrar en bucle de 10 s mientras haya cola. La «Pump» genera `historical_import` (cola grande al primer uso). La gracia de F2 no aporta en ese régimen |
| H2 | **Alto** (para el juego completo; **no** para la sync) | La pila v1 de Godot (`/api/v1/*`, `ConnectivitySupervisor` a `http://127.0.0.1:3000/api/health`) apunta a rutas que `main` no monta (404) | `composition/backend.js` (lista cerrada de rutas); `scripts/network/*` | Login/progreso por la pila v1 no puede funcionar contra `main`; la sincronización v2 es independiente, pero una prueba «de extremo a extremo con el juego» exige decidir qué pila gobierna la identidad |
| H3 | **Medio** | La sync normal está desactivada: falta `two_sides/sync/main_api_url` en `project.godot` (y exige `https://`); el modo local usa HTTP directo a Express (sin Caddy) | `SyncMainMode`, `GameSyncHost.Bind`, `project.godot` | Para pasar por Caddy hace falta editar un ajuste del proyecto (no autorizado aquí) y usar `https://localhost:8443/` (Caddy responde 421 si `Host`≠`localhost`) |
| H4 | **Medio** | HTTPS con `HttpClient` contra Caddy/CA de pruebas no está probado: el cliente solo se probó contra servidores HTTP simulados; la verificación TLS usa el almacén de Windows (CA de prueba, restricción de nombres `localhost`/`127.0.0.1`) | `B05_5_GODOT_HTTP_OFFLINE_RESULT` §«no se probó contra un servidor TLS»; B26/B28 probó curl/PowerShell, no .NET | Posible fallo de cadena (revocación, restricción de nombres) que no sería un defecto del backend |
| H5 | **Medio** | Bloqueo `SYNC_DESTINATION_MIGRATION_REQUIRED`: con destino `main` y sin cuenta guardada, si la Outbox ya tiene filas `confirmed` de otra integración, la sync no arranca | `SyncWorkerLifecycle.TickAsync` | Una BD de juego real usada en pruebas anteriores no sirve para esta prueba; usar BD desechable (`sandbox`) o nueva |
| H6 | **Medio** | Un pase puede superar el lease de 30 s (login ≤ 10 s + consulta ≤ 10 s + lote ≤ 10 s) | `Reserve` (30 s), `CurrentAttempt` exige lease vigente | `Confirm` puede fallar con `LEASE_CONFLICT` ⇒ la operación vuelve a `retryable_failure`, se reconcilia por recibos. Seguro, pero ruidoso |
| H7 | **Medio** | Latencia real de transacción en Atlas desconocida (solo `hello` = mínimo): 14 viajes con `w:majority,j:true` pueden costar el doble | B33 §3 | Los cálculos de §3 son optimistas |
| H8 | **Bajo** | `batchId` nuevo en cada pasada y solo eco | dispatcher / `ingestion-service.js` | Sin impacto en datos; limita la correlación en registros |
| H9 | **Bajo** | `receipts/query` escribe guardián/fence (+1 por consulta) y compite por el guardián con los lotes del mismo propietario | `ingestion-engine`/`transaction()` | Seguro (un worker secuencial); coste extra de ≈ 1 transacción por pasada con reintentos |
| H10 | **Bajo** | La reconfirmación de una operación ya confirmada compara JSON con `leaseId`/`attempt` ⇒ `RECEIPT_CONFLICT` | `SyncOutboxService.Confirm` | No ocurre en el flujo normal (las confirmadas no se reenvían) |
| H11 | **Bajo** | Restos de la pila v1 y su `PendingOperationStore` (JSON) conviven con la Outbox SQLite | `scripts/network/*` | Duplicidad conceptual de «operaciones pendientes»; dos mecanismos de reintento distintos si ambas se activaran |
| H12 | **Medio** (operativo) | Dependencias de la ruta HTTPS: Caddy 2.11.7 sin servicio, CA de prueba que caduca 2026-12-02 (certificado de servidor 2026-11-16), instalación/retirada manual de la CA, contraseña de Atlas por prompt oculto | B26–B28 | La prueba depende del propietario; ventana de validez de certificados |
| H13 | **Medio** (seguridad B00) | B00 abierto: manifiesto y código bajo el mismo usuario; copias antiguas de `.env`/`PRUEBA.rar` pendientes de eliminar; rol `readWrite` amplio; sin cuotas/telemetría; `commitStats()` solo en memoria; Atlas ya contiene documentos sintéticos de la prueba anterior | B15/B21/B37 | No bloquea la prueba, pero impide declarar el sistema «listo para producción» |
| H14 | **Bajo** | No hay prueba automatizada de «cliente .NET real ↔ backend con F2» (el cliente se probó contra un simulador y el backend contra dobles) | `sync-http-tests`, `backend/tests` | Riesgo de incompatibilidad residual en detalles de formato (fechas, cabeceras) |

No se encontró ningún hallazgo **crítico** (pérdida o duplicación de datos): la idempotencia por operación, el orden por dependencias y la reconciliación de recibos cubren los casos de 503, tiempo agotado, resultado desconocido y respuesta perdida. Lo no verificado en Atlas queda como suposición explícita.

## 6. Plan de la prueba real (NO ejecutado; cada paso requiere autorización explícita)

Principios: datos 100 % sintéticos con **identificadores nuevos** (cuenta, instalación, jugador, registro, operaciones); sin tocar colecciones históricas; sin borrados; sin secretos en evidencias; parada inmediata ante cualquier discrepancia; sin reintentos automáticos.

**Ruta A (recomendada, igual que E33 pero con F1+F2): guiones controlados, sin Godot.**
0. **Autorización explícita** del propietario para acceder a Atlas, indicando la ruta (A) y la ventana.
1. Preflight sin red: manifiesto v4 `verify` ok; preflight con el digest v4 anotado por el propietario; ACL; escáner de secretos; `node`/`caddy` = 0; puertos 3000/8443 libres; respaldos pre-F1/pre-F2 intactos.
2. Inspección **solo lectura** previa (herramienta de inspección con autorización de un solo uso): recuentos por colección `main_v2_*` y huella de la prueba anterior (T=`5e05a972-…`, op `64ad5b53-…`): **línea base documentada para no confundirla** con la nueva. Se identificará la nueva prueba solo por sus ids nuevos y por *deltas*.
3. El propietario instala la CA temporal (CurrentUser\Root) y confirma huella SHA-1 `F2BF0E8D…12A7`; arranca Caddy y Express `main` con el lanzador (contraseña por prompt oculto). Solo entonces: `GET /api/health` por HTTPS.
4. Registro + sesión con ids nuevos (hash Argon2id por servidor; credencial generada localmente, no se imprime).
5. **P1** lote de 1 operación (cuerpo fijo guardado en disco local): esperado 200 `committed`, recibo; tiempos cliente medidos (inicio→fin). Registrar `commitStats()` no está expuesto por HTTP: solo se podrá inferir por tiempos y resultados.
6. **Verificación directa de solo lectura** (guion B31) por `technicalAccountId` nuevo: 1 operación, 1 hecho, recibo coincidente, `consistent`.
7. **P2 idempotencia**: reenviar el **mismo cuerpo** (mismo `operationId`, `payloadHash`): esperado `duplicate`, **mismo `receiptId`/`committedAtUtc`/`payloadHash`**, sin filas nuevas (recuentos iguales a P1).
8. **P3 `receipts/query`**: esperado `found` con el mismo recibo; un id inexistente ⇒ `not_found`.
9. **P4 pérdida de respuesta controlada**: lote de 1 operación **nueva** con tiempo de espera del cliente deliberadamente corto (p. ej. 0,3 s, solo en el guion) para abandonar la respuesta; esperar; consultar recibos / reenviar: esperado `found`/`duplicate`, 1 fila. (Una respuesta *tardía forzada del servidor* no puede inducirse en Atlas sin cambiar código; queda cubierta solo offline: F2-T1…T22.)
10. **P5 lote pequeño** de 5 operaciones con dependencias válidas (vectores C#): esperado todas `committed` en una sola respuesta; medir tiempo por operación y compararlo con el modelo (14 viajes).
11. Verificación de solo lectura posterior: deltas exactos esperados = operaciones/hechos enviados (1 + 5), 0 duplicados, `identities +1`, `identitySessions +1`, guardianes/fences consistentes.
12. Parada ordenada: Express (Ctrl+C), Caddy, retirada manual de la CA por el propietario; comprobar 44 certificados, 0 de Two Sides, 0 procesos, puertos libres.
13. Informe con evidencias sin secretos (ids sintéticos y hashes, recuentos, tiempos, códigos).

**Ruta B (después, con autorización aparte): cliente en el bucle.** Godot con BD desechable (`--two-sides-sync-local-test --two-sides-test-storage=sandbox`, HTTP directo a `127.0.0.1:3000`, sin Caddy ni CA), o bien con `main_api_url` HTTPS (requiere editar `project.godot` y probar `HttpClient`+CA, H3/H4). Observar `[Sync-Test]` (códigos y recuentos). Exige ejecutar Godot (no autorizado en esta etapa).

**Recuperación ante errores:** ante cualquier respuesta distinta de la esperada ⇒ detener; no reenviar a ciegas; verificar por lectura qué persistió (recuentos y recibos por id); un 503/timeout se resuelve **solo** con `receipts/query` o reenvío idéntico (nunca con un cuerpo nuevo); si el backend queda inestable ⇒ detener Express, conservar los datos sintéticos (no se borra nada sin autorización separada). Un fallo de TLS se diagnostica con el mismo procedimiento de E30/E32 antes de culpar al backend.

## 7. Criterios de aceptación

1. Preflight y manifiesto v4 correctos antes de arrancar; ninguna conexión a Atlas sin la autorización de §6.0.
2. P1: HTTP 200, `committed`, recibo con `operationId`/`payloadHash`/`installationId`/`localPlayerId`/`bindingGeneration` coincidentes; ni 503 ni `deferred`.
3. Verificación de solo lectura: exactamente 1 operación y 1 hecho nuevos de la cuenta nueva; recibo coincidente; veredicto `consistent`.
4. P2: `duplicate`, **mismo `receiptId`**, recuentos sin cambios (0 operaciones/hechos nuevos).
5. P3: `found` con recibo idéntico; `not_found` para id desconocido.
6. P4: tras abandono de la respuesta, el estado final es **una** fila y el reenvío/consulta devuelve el mismo recibo.
7. P5: 5/5 `committed` (o, si algún enlace lento defiere operaciones, los ids deferidos se resuelven en el reenvío idéntico sin duplicados).
8. Invariante global: ningún 503 con fila **seguida de un recibo distinto**; ningún ACK sin fila; ningún documento fuera de los ids nuevos; colecciones históricas sin cambios (recuentos previos intactos).
9. Tiempos: registrados por operación; criterio informativo (no de aprobación) frente al modelo: 14 viajes ≈ 0,7–1,5 s.
10. Limpieza completa y sin secretos en los informes.

## 8. Cambios recomendados (NO implementados)

1. **Cliente (alta prioridad, H1):** reducir `batchSize` de 25 a ≤ 8 (o sensible al tiempo) y/o subir `RequestTimeout` por encima del presupuesto de lote del servidor (p. ej. 15 s con servidor 10 s), de modo que el servidor siempre conteste antes del abandono. Es F3 (presupuestos y cliente coherentes).
2. **Servidor (F3):** presupuesto de lote < tiempo de espera del cliente menos margen; opcionalmente devolver la respuesta parcial en cuanto se agote el presupuesto con las operaciones restantes `deferred` (ya ocurre) para que el cliente avance más rápido.
3. **Cliente:** ampliar el lease (≥ 45–60 s) o renovarlo, o acortar los tiempos por paso (H6).
4. **Proyecto:** decidir la pila de identidad (v1 vs v2) y retirar o desactivar la pila v1 para `main` (H2/H11); añadir `two_sides/sync/main_api_url` solo en la configuración de despliegue de pruebas (H3).
5. **Pruebas:** una prueba .NET de «cliente ↔ backend F2» contra el servidor Express offline en loopback (H14) y un caso de 503-con-`results` + operaciones «no iniciadas» tras desconocido.
6. **Observabilidad:** exponer `commitStats()` únicamente en un canal local de diagnóstico (decisión D5 de F2 la dejó solo en memoria) para poder correlacionar la prueba real.
7. **Operación:** renovar la CA/certificados antes de 2026-11-16/2026-12-02 si se alarga el calendario; completar B00 (limpieza de copias antiguas, rol más estrecho).

## 9. Decisiones que requieren autorización

- **A1:** autorizar la **Ruta A** (Atlas real, guiones, datos sintéticos nuevos) y fijar fecha/ventana, o preferir primero cambios de cliente (§8.1).
- **A2:** ¿se hace antes F3 mínima (lote ≤ 8 y timeout del cliente > presupuesto del servidor) o se prueba primero con el cliente actual para medir H1 con datos reales?
- **A3:** autorizar la **Ruta B** (ejecutar Godot con BD desechable) y, si procede, editar `project.godot` solo para esa prueba.
- **A4:** instalar/retirar la CA y arrancar Caddy/Express (acciones del propietario o delegadas con permiso explícito), y la contraseña por prompt oculto.
- **A5:** autorizar una inspección de solo lectura previa de Atlas para fijar la línea base de la prueba anterior.
- **A6:** definir si P4 (abandono de respuesta con espera corta del cliente) se hace dentro de la Ruta A.
- **A7:** decidir sobre la pila v1 de Godot (H2) y la retirada de `PendingOperationStore`.

Detenido tras entregar B38. No se implementó nada ni se inició ninguna prueba real.
