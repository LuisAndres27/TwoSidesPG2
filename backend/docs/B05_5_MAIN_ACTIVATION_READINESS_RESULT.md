# B05.5 Etapa 9 — Preparación final del backend `main` para MongoDB Atlas (`two_sides_db`)

Fecha: 2026-10-30. **Veredicto: NO está listo para sincronizar acciones reales con `two_sides_db`.** El perfil `main`, el cliente de Godot y la cadena de recibos están implementados y comprobados **offline**; faltan decisiones y recursos operativos (esquema remoto, credencial rotada, clave JWT, HTTPS, B00) y hay dos lagunas de producto (eventos de muerte/reinicio sin conectar; sin estadísticas ni restauración en el servidor). No se conectó a Atlas, no se escribió en `two_sides_db`, no se leyó `backend/.env`, no se ejecutó C.2/F.2, no se tocaron ACL, C2Runtime ni partidas SQLite reales. **B00 sigue pendiente.**

## 1. Estado del perfil `main`

| Requisito | Estado | Evidencia |
|---|---|---|
| Independiente de `integration` y `offline-test` | Cumplido | Ámbito, bundle, issuer/audience y prefijo propios; ningún archivo de `src/main`, `database.js`, `env.js` cita integración (MR02); el validador de integración rechaza la configuración main |
| Solo `two_sides_db`, usuario `twosides_backend` | Cumplido (fijado en código) | `MAIN_TARGET`; el conector rechaza otra URI, base o usuario; MP02, MP09 |
| TLS estricto, SCRAM-SHA-256, `authSource` admin | Cumplido | `assertMainConnection` + opciones del conector; MR03 prohíbe en el código cualquier bypass |
| JWT v2 | Reutilizado | RS256, 900 s, ámbito `urn:two-sides:main` / `two-sides-main-api` |
| Autorización por propietario | Reutilizada | Guard durable por cuenta + binding instalación/jugador (MP03/MP04) |
| Repositorios durables, transacciones, idempotencia | Reutilizados | Mismos que integración, con `fenceMode:'owner'`, lecturas acotadas y delta (etapa de escalabilidad) |
| Recibos compatibles con Godot | Cumplido offline | MP04 con los vectores C#; 36 comprobaciones C# |
| Credenciales de integración en `main` | Ninguna | Prueba MR02; el usuario/clave de integración no aparecen en `src/main` |

Pendiente de verificación remota: privilegios reales de `twosides_backend` (el perfil exige **exactamente** un rol `readWrite` sobre `two_sides_db`; cualquier rol extra detiene el arranque), réplica set con primario escribible, y el contenido real de la base.

## 2. Archivos revisados y modificados

Revisados: `B05_5_MAIN_BACKEND_PREPARATION_RESULT.md`, `composition/backend.js` y `lifecycle.js`, `config/{database,env,jwt}.js`, `server.js`, `src/main/{policy,profile,runtime}.js`, `integration/profile.js`, `atlas-policy.js`, repositorios Mongo de identidad e ingesta, `scripts/run-main-backend.ps1`, `GameSyncHost.cs`, `SyncWorkerLifecycle`, `SyncHttpTransport`, `SyncFactInventory`, `LocalGameState`, `LocalGameplayObserver`, `GamePersistenceContext`, escenas/scripts que invocan la persistencia.

Añadidos en esta etapa (solo offline, sin tocar lo que ya funciona): `backend/src/main/schema-inventory.js` (datos puros), `backend/tests/sync/main-readiness.test.js` (MR01–MR08) y este informe. No se modificó ningún archivo existente, ni Godot, ni escenas.

## 3. Esquema requerido en `two_sides_db` (namespace `main_v2`)

Verificado contra los modelos Mongoose reales (MR01). Siete colecciones y cinco índices únicos, más `_id_`:

| Colección | Propósito | Índices únicos |
|---|---|---|
| `main_v2_operations` | operaciones aceptadas, recibos y decisión de autorización | `owner_operation_unique {technicalAccountId, operationId}` |
| `main_v2_facts` | snapshots de partida, sesiones, eventos e intervalos | `scope_source_unique {scope, sourceKey}` |
| `main_v2_fences` | semilla `ingestion-v1` (`revision` ≥ 0) + un documento por propietario | — |
| `main_v2_identities` | cuentas técnicas (verificador Argon2id, binding) | `identity_registration_unique {registrationId}`, `identity_binding_unique {installationId, localPlayerId}` |
| `main_v2_ownerGuards` | revisión por cuenta (guard de autorización) | — |
| `main_v2_identitySessions` | sesiones tras los JWT (hash del token) | `identity_token_unique {tokenHash}` |
| `main_v2_revocations` | revocaciones idempotentes | — |

No se crea `main_v2_authorization` (modelo sin uso). El perfil rechaza índices adicionales, sparse, parciales, hidden, TTL o collation no simple.

**Estado remoto: DESCONOCIDO.** No hay evidencia local del contenido de `two_sides_db` (no hay modelos legacy en el repositorio; `src/database/mongodb` está vacío). No se asume que esté vacía ni se tocan colecciones previas: el namespace `main_v2` es disjunto de `integration_v2_*`, `b054c2c_*` y de cualquier formato histórico. **Pendiente de inspección autorizada de solo lectura.**

**Laguna encontrada:** `main` exige que las siete colecciones, los índices y la semilla existan **antes** de arrancar (no crea nada) y **no existe herramienta** para crearlos en `two_sides_db` (integración tenía `prepareIntegrationCollections`; `main` no). Hay que diseñar, probar offline y autorizar aparte un bootstrap de `main_v2` antes de poder activar.

## 4. Credenciales y configuración

| Elemento | Mecanismo | Estado |
|---|---|---|
| Contraseña de `twosides_backend` | Entrada oculta en `run-main-backend.ps1` → trama binaria por stdin; sin variable de entorno, argumento, URI ni archivo; `proveedor de secretos` inyectable para servicio | Mecanismo listo; la contraseña real **no existe en el repositorio y no se pidió**. Debe rotarse antes (B00) |
| Clave de firma JWT | Archivo PKCS#8 RSA ≥ 2048 bits **fuera** del proyecto, de OneDrive y de `.env`, sin enlaces; `MAIN_JWT_PRIVATE_KEY_FILE` + `MAIN_JWT_KEY_ID` | Mecanismo listo y probado (MR05: mismas claves tras reinicio, rutas inseguras rechazadas). **No hay clave generada**; debe crearla el operador y fijarse permisos (no se tocan ACL) |
| Activación | `TWOSIDES_PROFILE=main` + `MAIN_ENABLE=true` + `-EnableMain` + stdin tubería; `NODE_ENV=production` lo fija el lanzador | MR04: producción sola, perfil solo, valores `TRUE`/`1`, puertos inválidos → rechazados. `npm start` sigue arrancando el servidor local de pruebas |
| Escucha | Siempre `127.0.0.1`; `0.0.0.0`, `::`, IP o nombre → rechazados (MR06) | `trust proxy` desactivado |
| Credenciales MongoDB en Godot | Ninguna | MR07 recorre `scripts/`, `integration/`, `sync-http` y `project.godot` |

## 5. HTTPS

- **Cliente (Godot):** `two_sides/sync/main_api_url` debe ser una raíz `https://` sin credenciales, query ni ruta; si falta o no es HTTPS, la sincronización normal queda **desactivada**. `project.godot` **no** contiene ese ajuste hoy. El transporte usa `HttpClient` con la validación de certificados por defecto de .NET (no hay callbacks permisivos, MR07); HTTP solo se admite en loopback y de forma explícita (`allowLoopbackHttp`, banderas de prueba). Fallos de conexión, timeouts y apagados no borran la Outbox (comprobaciones C#).
- **Servidor:** **no existe** servidor/proxy HTTPS. Express escucha HTTP en loopback; la terminación TLS debe hacerse delante (proxy inverso con certificado válido para un dominio estable). Contrato por definir al desplegar: dominio, certificado y renovación, reenvío solo a `127.0.0.1:<puerto>`, tamaño de cuerpo ≤ 256 KiB, y tratamiento de IP real (hoy `trust proxy` está apagado, por lo que tras un proxy todo el tráfico aparecería con la IP del proxy y los límites por IP del registro/sesión actuarían de forma global). No se publicó nada en internet.

## 6. Integración con Godot

| Aspecto | Estado |
|---|---|
| Inicio del `GameSyncHost` | Autoload; vinculado a `GamePersistenceContext` al arrancar |
| Activación normal | Solo con `main_api_url` HTTPS; **no depende** de `--two-sides-sync-local-test` (esa bandera, si está, tiene prioridad y desactiva el modo main) |
| Identidad (DPAPI) | `user://sync-credentials-main-v2/<hash de la URL>`, por jugador e instalación; no reutiliza la identidad de integración |
| Outbox → envío → recibos | Un worker; reintenta con los mismos IDs; concilia respuesta perdida; solo marca confirmada con recibo coincidente |
| Reconexión | Probado (servidor apagado/encendido, vacío tras reinicio) |
| Cambio de escena | Sin workers duplicados |
| Logout / reanudar | Detiene y reanuda con una sola sesión; la identidad protegida se conserva |
| Cierre ordenado | El worker se detiene antes de cerrar SQLite; lo pendiente se conserva |
| Historial de otro destino | Si hay operaciones `confirmed` y no hay cuenta protegida para este destino, **no registra** (`SYNC_DESTINATION_MIGRATION_REQUIRED`); la migración no está diseñada |

## 7. Eventos del juego (qué está realmente conectado)

Leyenda: G = Godot lo detecta · S = se guarda en SQLite · O = genera operación Outbox · E = contrato en Express · M = Mongo puede persistirlo (verificado solo con doble) · R = se recupera tras reiniciar (Outbox/SQLite).

| Evento | G | S | O | E | M | R | Nota |
|---|---|---|---|---|---|---|---|
| Registro de perfil local (`CreateProfileAsync`) | Sí | Sí | **No** (el perfil no es un hecho sincronizable) | — | — | Local | Solo se registra la cuenta técnica; el nombre no se envía |
| Registro de cuenta técnica | Sí (worker) | credencial DPAPI | — | Sí | Sí | Sí | Automático al primer sync |
| Inicio de partida (`NewGameAsync`) | Sí | Sí | Sí `game.report` | Sí | Sí | Sí | |
| Confirmación de decisión ambiental (`RecordDecisionAsync`) | Sí | Sí | Sí (revisión de `game.report`, `decisions[]` ≤ 5) | Sí | Sí | Sí | |
| Cambio de estado ambiental | Sí (en la decisión) | Sí | Indirecto: `stateKind` de la decisión y `result` del bioma | Sí | Sí | Sí | `UpdateEnvironment` no la invoca ninguna escena; no hay hecho propio |
| Fin de segmento animal (`CompleteAnimalAsync`/`CompletionConfirmed`) | Sí | Sí | Sí: `game.report` + `ANIMAL_SEGMENT_COMPLETED` | Sí | Sí | Sí | |
| Entrada al segmento animal | Sí (`AnimalStarted`) | Sí | Sí `gameplay.event` | Sí | Sí | Sí | |
| Salida del segmento (`Leave`) | Sí | Sí | Sí `ANIMAL_SEGMENT_EXITED` | Sí | Sí | Sí | |
| Fin de bioma (`CompleteBiome`) | Sí | Sí | Sí `game.report` | Sí | Sí | Sí | |
| Fin de partida / final obtenido (`PrepareFinal`/`CloseFinal`) | Sí | Sí | Sí (`ending`, `status`) | Sí | Sí | Sí | |
| Sesiones e intervalos de tiempo (`Observe`, pausa, foco, carga) | Sí | Sí | Sí `session.report`, `gameplay.interval` | Sí | Sí | Sí | |
| **Muerte del animal (`Died`)** | **No: nada en `scripts/` ni `integration/` lo invoca** | — | No | Sí (contrato) | Sí | — | Evento definido y probado, **sin conectar** |
| **Reinicio / reintento (`RequestRestart`)** | **No: sin invocadores** | — | No | Sí (contrato) | Sí | — | Ídem |
| Estadísticas | Locales (SQLite) | Sí | Solo la telemetría anterior | **No hay módulo de estadísticas en el servidor** | — | — | Sin agregación ni consulta remota |
| Descarga/restauración Mongo → SQLite | — | — | — | No | — | — | Solo subida y recibos |

MR08 deja registrado el estado de los invocadores (si alguien conecta `Died`/`RequestRestart`, la prueba falla y obliga a actualizar este informe). Conectarlos exige cambiar scripts de jugadores/escenas en Godot; no se hizo (fuera del alcance y hay cambios sin confirmar del usuario en esos archivos).

## 8. Pruebas

| Suite | Resultado |
|---|---|
| Vitest (regresión completa, `run-backend-regression.js`) | **653 + 9 aprobadas, 15 + 1 omitidas, 0 fallos** (38 + 2 archivos) |
| Nuevas MR01–MR08 | 8 aprobadas |
| Legacy (`test:legacy`) | 39/39 |
| C# sync HTTP (Express offline-test + SQLite desechable) | 36/36 |
| C# persistencia local SQLite | 43/43, 0 archivos sintéticos restantes |
| Compilación del proyecto Godot (C#) | 0 errores, 0 advertencias en esta compilación |
| Suite histórica `GameSave.Checks` (`-Mode Test`) | **No ejecutable**: está deshabilitada por diseño ("protected store"); termina con código 1 sin ejecutar casos. No se probó con `--progress` para no tocar almacenes protegidos |

Cobertura de lo pedido en §8: composición y separación de bases (MR02), credenciales ausentes/inválidas (MR04, MP07–MP09, MC01/02), JWT persistente (MR05), propietarios, contratos HTTP, idempotencia, recibos, rollback (MP03–MP06), Outbox, reconexión y cierre ordenado (C#), compatibilidad con Godot (C# + MR07). Todo con dobles; **ningún** resultado describe a Atlas.

## 9. Riesgos pendientes

1. **B00 abierto**: credencial potencialmente expuesta y entorno de ejecución; rotar antes de usar.
2. Esquema remoto desconocido y sin bootstrap (bloqueante).
3. Cuota por jugador de **1.000 operaciones** (global 50.000) frente a una telemetría de intervalos que crece con el juego: al llegar al tope la sincronización recibe 429 reintentable y se estanca. Dimensionar con datos reales o decidir retención/archivo antes de abrir a jugadores.
4. `Died` y `RequestRestart` sin conectar; sin estadísticas ni restauración en el servidor.
5. HTTPS/proxy inexistente; `trust proxy` apagado afecta límites por IP; limitador en memoria (un solo proceso).
6. Privilegios de `twosides_backend` (readWrite más amplio de lo necesario; cualquier rol adicional bloquea el arranque).
7. Migración de historial confirmado de otro destino sin diseñar; migración de datos antiguos de `two_sides_db` inexistente.
8. Rendimiento y comportamiento con Mongoose/Atlas real **no medidos** (`$in`, `countDocuments`, transacciones multi-documento).
9. Una prueba C2 preexistente (`SU03`) es intermitente por azar del digest; no afecta a `main`.

## 10. Pasos exactos para activar `main` (en este orden, cada uno con su autorización)

1. Resolver/aceptar B00 y **rotar** la contraseña de `twosides_backend`; confirmar su rol (solo `readWrite` sobre `two_sides_db`).
2. Primera **inspección de solo lectura** (§11), sin HTTP.
3. Diseñar y probar offline el bootstrap `main_v2`; autorizarlo por separado; crear colecciones, índices y semilla.
4. Generar la clave RSA de firma fuera del proyecto/OneDrive; fijar `MAIN_JWT_KEY_ID`.
5. Desplegar el proxy HTTPS con certificado válido y reglas de red; decidir tratamiento de IP real.
6. Primera escritura controlada (§12) con jugadores y bases locales sintéticos.
7. Configurar `two_sides/sync/main_api_url` en una versión del juego decidida aparte; probar con una instalación nueva y sandbox.
8. Dimensionar cuotas/retención y decidir los eventos pendientes.

## 11. Propuesta de primera inspección de solo lectura a Atlas

Un lanzador acotado equivalente a `-AuthCheck` de integración, **para main**, aún por implementar y probar offline: autorización de un solo uso (1 h), contraseña por entrada oculta, sin HTTP, sin `listen`. Autentica; verifica usuario efectivo, SCRAM, TLS y que los roles sean exactamente `readWrite` sobre `two_sides_db`; ejecuta `listCollections` (solo nombres) y `listIndexes` de las colecciones `main_v2_*` si existen; comprueba la semilla y el primario del replica set; **no** lee documentos de usuarios ni otras colecciones, **no** crea nada y cierra. Salida: JSON sin secretos con el inventario (cuántas colecciones, nombres de las desconocidas como recuento, índices correctos o no), código/etapa/categoría en errores.

## 12. Criterios para autorizar la primera escritura

- Inspección de solo lectura completada y revisada; ninguna colección `main_v2_*` incompatible.
- Bootstrap probado offline y autorizado por separado; copia/estrategia de reversión definida.
- Contraseña rotada; B00 aceptado o mitigado por escrito; clave JWT externa creada.
- Ventana ≤ 1 h; una sola cuenta sintética; lotes ≤ 10 operaciones; limpieza dirigida por identificadores (nunca filtros vacíos); sin tocar documentos ajenos; sin C.2/F.2.
- Sincronización de Godot **no** activada en jugadores reales (sin `main_api_url`).
