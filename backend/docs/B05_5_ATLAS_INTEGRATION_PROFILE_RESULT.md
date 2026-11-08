# B05.5 Etapa 6 — Perfil `integration` de Express con MongoDB Atlas (preparado, sin conexión)

Continúa `B05_5_BACKEND_COMPOSITION_RESULT.md`, `B05_5_GODOT_HTTP_OFFLINE_RESULT.md`, `B05_5_GODOT_RUNTIME_VALIDATION_RESULT.md`, `B05_5_WINDOWS_CREDENTIAL_STORE_RESULT.md` y `B05_C2_REAL_ATLAS_EXECUTION_RESULT.md`.

**Estado:** el perfil existe, está **deshabilitado por defecto** y se probó únicamente contra un **doble de MongoDB** (sin sockets a Atlas). **No se conectó Atlas, no se pidió ni usó ninguna contraseña, no se leyó `backend/.env`, no se ejecutó C.2 ni F.2, no se tocó Godot ni partidas SQLite, ACL, propietarios ni C2Runtime.** `npm start` no cambió. B00 continúa pendiente.

## 1. Arquitectura de composición

```
(futuro lanzador manual)            src/integration/profile.js                 src/composition/backend.js
 credencial one-use (stdin) ──►  openIntegrationProfile({activation,    ──►  createBackend({profile:'integration',
 + connector (mongoose)            credential, connector, now})                jwtConfig, integration: bundle})
                                   │  conexión fija + verificación             │  acepta SOLO un bundle auténtico
                                   │  de privilegios (solo lectura)            │  (registro WeakSet en config/)
                                   ▼                                           ▼
                        MongoIdentityRepository + MongoIngestionRepository   mismas rutas v2, JWT v2, rate limits,
                        (existentes, sin cambios de lógica)                  inicio/cierre ordenados (lifecycle)
```

- **Deshabilitado por defecto, tres candados:** (1) `openIntegrationProfile` rechaza sin la frase exacta `ENABLE_ATLAS_INTEGRATION_PROFILE_V2`, sin `connector` y sin credencial de un solo uso; (2) `createBackend({profile:'integration'})` rechaza (`PROFILE_UNAVAILABLE`) si no recibe un bundle emitido por ese opener, si se le pasan repositorios aparte, o si `NODE_ENV=production`; (3) nada en `src/server.js`, `npm start`, el lanzador offline ni la composición importa el opener (verificado por prueba). `main` sigue reservado y falla cerrado.
- **Destino fijo (constante, no parámetro):** host `<cluster>.<id>.mongodb.net`, base `two_sides_integration_test`, usuario `twosides_integration_test`, `authSource=admin`, SCRAM-SHA-256, TLS estricto (sin certificados/hosts inválidos, sin `directConnection`). Cualquier opción adicional (`host`, `database`, `user`, `uri`, `tls`, `authMechanism`, `config`, `profile`…) → `integration_option_rejected` sin llamar al conector. Tras conectar se verifica la conexión (nombre, SRV, usuario, mecanismo, TLS) y, en modo **solo lectura**, que el usuario autenticado tenga exactamente el rol `readWrite` sobre esa base; si algo difiere se cierra y se rechaza.
- **Sin `twosides_backend`, `two_sides_db`, `backend/.env` ni arnés C.2:** el código del perfil no contiene esos nombres, no lee entorno ni archivos y no importa nada de `scripts/` ni `c2-*` (comprobado estáticamente). Se reutilizan `atlas-credentials.js` (contenedor one-use de contraseña) y las primitivas de `atlas-policy.js`, que son política compartida, no el arnés.
- **Colecciones propias del perfil** (no las `b054c2c_<run>_*` de C.2): `integration_v2_operations|facts|fences|authorization` e `integration_v2_identities|ownerGuards|identitySessions|revocations`.
- **Separación de las restricciones de C.2:** los repositorios Mongo ya eran reutilizables; lo específico de C.2 eran la configuración por *fases* (`persistenceTest`, `runId` fijo, `allowWrites` opcional, nombres con `runId`). Se añadió un modo de configuración `atlas-integration-profile` (sin `runId`, `allowWrites` siempre verdadero, solo SCRAM, prefijo fijo) **sin alterar** los modos de C.2 (sus 487 pruebas siguen verdes). **No se usa el *fence* de C.2A** (`fenceAuthorization`): la autorización de cada commit la hace la guarda durable del repositorio de identidad (propietario, revisión, sesión, revocación), que es la barrera real; el *fence* de C.2A es un control de ejecución única del arnés y no se justifica como mecanismo general.
- **No se quitó ningún control:** transacciones *snapshot* con `w:majority, j:true`, guarda de propietario, índices únicos verificados antes de cada transacción, contexto de sincronización y presupuestos permanecen.

### JWT v2 de integración
Reino de tokens separado del sintético: `mode=integration-test`, emisor `https://two-sides.integration.invalid`, audiencia `two-sides-integration-api`. El perfil `integration` solo acepta ese reino y `offline-test` solo el suyo (un token de uno es rechazado por el otro; ambos configuraciones se rechazan cruzadas en `createBackend`). Las claves RS256 se **generan en memoria al arrancar** (`createIntegrationJwtConfig()`); no hay claves ni contraseñas en el repositorio. Se mantienen firma, emisor, audiencia, expiración (900 s exactos), `kid`, `typ`, claims de vínculo y autorización por propietario. No se registran tokens ni secretos (los errores son genéricos).

## 2. Archivos

| Archivo | Cambio |
|---|---|
| `backend/src/integration/profile.js` | **Nuevo.** `openIntegrationProfile`, `integrationConnector(mongoose)`, `createIntegrationJwtConfig`, `prepareIntegrationCollections` (confirmación explícita, nunca automática). |
| `backend/src/config/integration-profile.js` | **Nuevo.** Registro de bundles auténticos (sin imports, sin configuración). |
| `backend/src/composition/backend.js` | Perfil `integration` disponible solo con bundle; `main` reservado; reinos JWT separados. Sigue sin importar drivers ni Atlas. |
| `backend/src/config/jwt.js` | Acepta dos reinos (aislado e integración); constantes `ISOLATED_JWT`, `INTEGRATION_JWT`. |
| `backend/src/modules/sync/atlas-policy.js` | Modo `atlas-integration-profile`, `INTEGRATION_PROFILE_CONFIG`, `isIntegrationProfileScope`; `prefix` en el alcance. Modos de C.2 intactos. |
| `backend/src/modules/sync/mongo-models.js`, `src/modules/auth/mongo-identity-models.js` | Nombre de modelo/colección a partir del prefijo del alcance (mismos valores para C.2). |
| `backend/tests/sync/integration-profile.test.js`, `tests/sync/support/integration-double.js` | **Nuevos.** 12 pruebas y doble. |

No se modificaron: Godot, SQLite, `backend/.env`, `package.json`, `src/server.js`, `src/app.js`, rutas, repositorios Mongo, lanzador offline, C.2.

## 3. Dependencias
Sin paquetes nuevos (`jose`, `mongoose`, `zod` ya existían). El opener no importa `mongoose`: el conector se inyecta (`integrationConnector(mongoose)` recibe la instancia como argumento).

## 4. Contratos
Se mantienen exactamente los endpoints que el cliente Godot ya usa: `POST /api/v2/technical/registrations`, `POST /api/v2/technical/sessions`, `GET /api/v2/technical/me`, `GET /api/v2/players/:id`, `POST /api/v2/sync/batches`, `POST /api/v2/sync/receipts/query` (+ `GET /api/health`). *Nota:* la solicitud nombraba `/technical/register` y `/technical/login`; los reales son `registrations` y `sessions`, y no se renombraron para no romper al cliente. El mismo router, esquemas y servicio que el perfil offline sirven los lotes, por lo que los vectores generados por el cliente C# (`csharp-vectors.json`) se aceptan, se responden igual (committed/duplicate/207) y las respuestas de registro/sesión (`accessToken`, `expiresIn=900`) son idénticas. **No existe refresh token y no se inventó** (la renovación sigue siendo login con credencial).

## 5. Pruebas aprobadas (12 nuevas, offline, doble de MongoDB; vitest completo 584 aprobadas)

| # | Requisito | Prueba |
|---|---|---|
| 1 | Deshabilitado sin activación | IP01: sin frase/conector/bundle, producción, bundle falso, repositorios junto al bundle, `main`, cruce de perfiles; `npm start` y fuentes sin opener |
| 2 | Destino fijo | IP02: URI y opciones de conexión exactas; 9 opciones externas rechazadas sin llamar al conector; 9 configs inválidas rechazadas; 8 conexiones incorrectas cerradas y rechazadas |
| 3 | Credenciales inválidas | IP03: credencial ausente/vacía/con salto/ya usada; error del conector sin filtrar la contraseña; 5 privilegios incorrectos rechazados y conexión cerrada |
| 4 | JWT | IP04: firma, emisor, audiencia, `kid`, exp, token manipulado, token de otro reino, expiración tras 15 min, reino cruzado en la composición |
| 5 | Propietario | IP05: lectura/escritura cruzada 403, suplantación de `localPlayerId` 403, escalada de rol 400, solo filas propias |
| 6 | Transacción | IP06: rollback sin filas, commit desconocido sin ACK y reintento sin duplicar, opciones snapshot/majority/j, fence de Mongo dentro de la transacción |
| 7 | Idempotencia | IP07: mismos recibos, una sola fila por `operationId` |
| 8 | Recibos | IP08: found/not_found, sin recibos ajenos |
| 9 | Revocación | IP09: sesión y identidad revocadas se rechazan al instante; otros jugadores intactos; sin login posterior |
| 10 | Cierre ordenado | IP10: listener primero, conexión Atlas cerrada una vez, idempotente, también sin arrancar |
| 11 | Fallos de conexión | IP11: fallo de conexión inicial, conexión perdida, primario no disponible → 5xx sin fugas, salud OK, recuperación sin pérdida |
| 12 | Sin base principal | IP12: solo colecciones `integration_v2_*`, sin `two_sides_db`/`twosides_backend`/`b054c2c`/`.env`, solo comando de inspección de privilegios, sin sockets externos, preparación de colecciones protegida |

Regresiones: vitest completo 584 aprobadas / 16 omitidas; fallan solo los 3 que exigen `C2_FINAL_TEST_ROOT` (pasan con él: 9/9); legacy 39/39; 33 comprobaciones C# del cliente HTTP contra el Express offline (la composición no cambió su comportamiento). BC12 (integración reservada sin bundle) y BC15 (la composición no importa Atlas/Mongoose) siguen verdes sin modificar. *Nota de entorno:* con `C2_FINAL_TEST_ROOT` definido a la vez, 6 pruebas de PowerShell de C.2 cambian de ruta y fallan; es un artefacto de la variable, no del código (sin ella pasan).

## 6. Configuración requerida (no existe todavía)
- **Lanzador manual** del perfil (no creado a propósito): leer la contraseña por un canal anónimo (`receiveAtlasCredential`, stdin/IPC, nunca argv/env), `mongoose`+`integrationConnector`, frase de activación explícita, `createIntegrationJwtConfig()`, `createBackend`, `backend.start({host:'127.0.0.1'})` y cierre ordenado con SIGINT.
- Decidir si las claves JWT son efímeras (actual) o provistas de forma segura.
- Preparación de colecciones/índices con `prepareIntegrationCollections(bundle,{confirm:'CREATE_INTEGRATION_COLLECTIONS'})` (escritura en la base de integración; requiere autorización propia).

## 7. Condiciones pendientes para la conexión real
1. Confirmar la rotación de la contraseña de `twosides_integration_test` (sigue sin confirmarse).
2. Autorización expresa y acotada (ventana, alcance, límites) para conectar y para crear colecciones/índices.
3. Escribir y revisar el lanzador manual; prueba del conector real **sin escrituras** primero.
4. Política de datos: retención/limpieza de lo que se escriba en `two_sides_integration_test` (no hay borrado automático).
5. Contratos de backend faltantes (ya documentados en la etapa 5): refresco de sesión, recuperación/rotación de credencial, revocación expuesta al cliente, y confirmar en Atlas la idempotencia del registro por `registrationId`.
6. Validación manual Godot → Express integration (almacenamiento y carpeta de credenciales desechables).

## 8. Limitaciones
- Solo se probó con un doble; no hay evidencia de latencia, límites del clúster, transacciones reales, índices ni comportamiento de `retryWrites` en Atlas.
- `verifyDeployment` exige `hello.setName` (conjunto de réplicas) y los índices únicos; si las colecciones no existen, el perfil responde 503 hasta que se preparen.
- JWT efímero: reiniciar el backend invalida los tokens activos (los clientes inician sesión de nuevo).
- Los repositorios conservan el indicador `synthetic:true` (significa "datos de prueba", no "datos en memoria"): aquí describe una base de integración, nunca la principal.
- El perfil sigue escuchando solo en loopback (el juego habla con un Express local que habla con Atlas).

## 9. Riesgos B00
B00 **no se declara resuelto**. Esta etapa añade un camino de código capaz de **escribir en Atlas** una vez activado: los riesgos abiertos son (a) la rotación de contraseña sin confirmar, (b) la posibilidad de ejecutar el opener con una contraseña real por error (mitigada por activación explícita, destino fijo y ausencia de lanzador), (c) datos de prueba persistentes sin política de limpieza, (d) tokens efímeros y ausencia de revocación/recuperación expuestas al cliente, y (e) la ausencia de pruebas contra el clúster real. Hasta autorizar la conexión, el estado efectivo es el de siempre: sin Atlas desde el juego ni desde Express.
