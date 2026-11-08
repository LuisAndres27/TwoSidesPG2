# B05.5 — Etapa 1: composición de Express

Fecha: 2026-10-30 (UTC). **COMPLETADA EN MODO OFFLINE CON DEPENDENCIAS SIMULADAS. No validada contra MongoDB Atlas.** No se conectó Atlas, no se usó la cuenta de integración ni credenciales reales, no se ejecutó C.2 ni F.2, no se accedió a `backend/.env`, y no se tocó SQLite, Godot, ACL, propietarios, el servidor de producción ni las releases C.2. B00 sigue pendiente. La rotación de la contraseña de integración **sigue sin confirmarse**: no debe haber nuevas operaciones con esa cuenta hasta que se confirme.

## 1. Revisión de la composición existente

| Componente | Estado antes de esta etapa |
|---|---|
| `src/app.js` (`createApp`) | Ya sabía montar JWT v2 y sincronización (`persistentJwt` + `sync`), pero **solo las pruebas lo hacían**. Montaba siempre las rutas heredadas de token opaco |
| `src/server.js` | Arrancaba `createApp()` por defecto: **sin JWT v2 ni sincronización**, con las rutas heredadas |
| JWT v2 (`JwtService`, `authenticate`, `authorize`, `authorizeOwner`, `syncAuthContext`) | Probado y correcto; sin cambios |
| `createSyncRouter`, `IngestionService`, `IngestionEngine`, canonicalización, esquemas | Probado (T01–T35, V01…); sin cambios. Exige un repositorio con `synthetic === true` |
| `MongoIdentityRepository`, `MongoIngestionRepository` | Solo se construyen dentro de `openAtlasIntegration`, ligados al ámbito Atlas C.2A y a la fábrica del arnés. **No se tocaron ni se importan** desde la composición nueva |
| `SyntheticIdentityRepository`, `SyntheticCoordinator`, `SyntheticIngestionRepository` | Viven en `tests/`; son las dependencias simuladas |
| Arranque y cierre | `server.js` hacía `server.close` con un `process.exit(1)` a los 5 s; nada liberaba recursos ni cerraba las conexiones ociosas |

No se reconstruyó ningún módulo ya probado.

## 2. Arquitectura final de composición

```
 server.js (sin cambios de comportamiento)                  tests / futuras etapas
   └─ composition/lifecycle.js  startServer()               └─ composition/backend.js  createBackend({profile, ...inyectado})
                                                                 ├─ valida perfil, producción, JWT, repositorios, recursos
                                                                 ├─ createApp({ legacyIdentity:false, persistentJwt, sync })
                                                                 └─ start()/close()  ──►  lifecycle.startServer()
```

- **`src/composition/backend.js`** — raíz de composición. Toda dependencia con estado se **inyecta**: configuración JWT, repositorio de identidad, repositorio de ingesta, *hasher*, *limiter*, reloj, presupuestos y recursos a cerrar. No lee el entorno, no lee `.env`, no importa Mongoose, Atlas, `scripts/` ni el arnés C.2 (lo verifica BC15).
- **`src/composition/lifecycle.js`** — `startServer(app, {host, port, resources})`. Solo *loopback* (`127.0.0.1`, `::1`, `localhost`). `close({graceMs})` es idempotente: deja de aceptar conexiones, cierra las ociosas, deja terminar las solicitudes en curso hasta `graceMs`, corta las que queden y **después** cierra los recursos en orden inverso al de registro. Un recurso que falla se cuenta y no impide cerrar los demás.
- **Perfiles.** Solo existe **`offline-test`**. `integration` y `main` son nombres reservados que **fallan cerrado** (`PROFILE_UNAVAILABLE`): ninguna etapa futura hereda permisos, claves ni configuración del arnés C.2 ni del entorno principal sin definir sus dependencias de forma explícita. Cualquier perfil distinto → `PROFILE_UNKNOWN`.
- **Rechazos al componer:** `NODE_ENV=production` (`PRODUCTION_REFUSED`); configuración JWT que no sea la aislada de pruebas (`JWT_CONFIG_REJECTED`); repositorios que incumplan los puertos o no sean coordinados (`REPOSITORY_REJECTED`); repositorio de ingesta no sintético (`REPOSITORY_NOT_SYNTHETIC`); recursos mal formados (`RESOURCES_REJECTED`); un segundo `start()` (`ALREADY_STARTED`).
- **Modo offline de pruebas:** `tests/sync/support/offline-stack.js` ensambla la composición real con identidad y almacén de ingesta **en memoria**, un par RSA generado y un reloj inyectado, y ofrece un cliente HTTP real contra el puerto de *loopback*.

## 3. Rutas disponibles

Contrato público de `createBackend` (`ROUTES`). Cualquier otra ruta responde 404 JSON.

| Método y ruta | Autenticación |
|---|---|
| `GET /api/health` | Ninguna |
| `POST /api/v2/technical/registrations` | Ninguna (cuerpo estricto `schemaVersion 2`, 20/min por IP) |
| `POST /api/v2/technical/sessions` | Ninguna (cuerpo estricto, límites de intentos). Emite JWT RS256 de 900 s |
| `GET /api/v2/technical/me` | JWT v2, rol `player` |
| `GET /api/v2/players/:id` | JWT v2, rol `player` y propietario del `:id` |
| `POST /api/v2/sync/batches` | JWT v2, `player`, contexto de sincronización ligado a la cuenta |
| `POST /api/v2/sync/receipts/query` | Ídem |

**No montadas en esta composición:** `/api/identity/*` y `/api/auth/session` (token opaco heredado, desactivadas con el nuevo parámetro `legacyIdentity: false`), y las rutas JWT v1 (`/api/v1/*`). No se reemplazó el JWT v2 por el esquema antiguo.

## 4. Archivos modificados y creados

| Archivo | Cambio |
|---|---|
| `src/composition/backend.js` | **Nuevo.** Raíz de composición (sección 2) |
| `src/composition/lifecycle.js` | **Nuevo.** Inicio y cierre ordenados |
| `src/app.js` | **Un único cambio:** nuevo parámetro `legacyIdentity = true` que envuelve las tres rutas heredadas. El valor por defecto conserva el comportamiento y las pruebas existentes |
| `src/server.js` | Usa `startServer` para el arranque y el cierre ordenado (cierre con 4 s de gracia). **Mismo comportamiento externo:** mismos mensajes y códigos de salida; rechazo en producción y puerto inválido idénticos |
| `tests/sync/support/offline-stack.js` | **Nuevo.** Montaje offline con dependencias simuladas |
| `tests/sync/backend-composition.test.js` | **Nuevo.** BC01–BC15 |
| `tests/sync/c2-single-use-activation.test.js` | SU14 deja de suponer que la release C.2 sigue sin ejecutarse (acepta solo el run `2c541441…` y su registro de consumo). No toca la release |

El backend no está bajo control de versiones en este repositorio, así que no hay *diff* de Git. No se instalaron dependencias ni se modificó `package.json`.

## 5. Dependencias utilizadas

Solo las ya fijadas: `express 5.3.0`, `jose 6.2.13`, `zod 4.6.7` y `@node-rs/argon2 2.2.2` (a través de `CredentialHasher`). `mongoose` **no** se importa en `src/composition` ni en `server.js`; solo las pruebas lo espían para demostrar que no se usa.

## 6. Pruebas

| Ejecución | Resultado |
|---|---|
| `tests/sync/backend-composition.test.js` (BC01–BC15) | **15 aprobadas** |
| Pruebas heredadas de Node (`tests/unit`, `tests/integration`) | **39 aprobadas**, 0 fallos |
| Todo vitest (28 archivos) | **570 aprobadas, 16 omitidas, 1 fallo**. El fallo fue SU14 por la razón de la sección 4; tras corregir la prueba se repitió ese archivo: 14 de 14. Las 16 omitidas son las ya conocidas que necesitan entornos propios (RX17, AC04 sin su variable y pruebas de fases anteriores) |
| Arranque real de `src/server.js` (`PORT=0`) | `GET /api/health` → 200; salida con el mismo mensaje de siempre |

Qué demuestra cada caso de la composición (los 10 puntos pedidos):

| Pedido | Prueba |
|---|---|
| 1 Inicio de Express, solo *loopback* | BC01, BC11 (rechaza `0.0.0.0`, `::`, IP privadas y el host de Atlas) |
| 2 Registro de rutas | BC02: el contrato exacto responde y lo no documentado da 404 |
| 3 Emisión y validación de JWT | BC03: RS256, `typ at+jwt`, `ver 2`, 900 s, el mismo servicio lo valida |
| 4 Rechazo sin autenticación | BC04: sin token, basura, firma alterada, HS256, expirado en `exp`, identidad revocada → 401 con `WWW-Authenticate` y nada escrito |
| 5 Rechazo de propietarios no autorizados | BC05: `/players/:id` ajeno → 403; lotes de A con token de B → 403 y nada escrito; operación con otro `localPlayerId` → 403; escalada de rol → 400 |
| 6 Validación de sincronización | BC06: lote vacío, claves duplicadas, JSON roto, 101 operaciones, cuerpo de 256 KiB, consulta en la URL, tipo de contenido, operación repetida, esquema incompatible |
| 7 Respuestas del endpoint | BC07: lote C# completo (todas las operaciones confirmadas), repetición idempotente (`duplicate`), éxito parcial 207, consulta de recibos |
| 8 Manejo de errores | BC08: fallo del repositorio → 500/503 reintentable sin marcador, pila, token, credencial ni `node_modules`; reintento con los mismos ids funciona |
| 9 Cierre ordenado | BC09: la solicitud en curso termina, se rechazan conexiones nuevas, los recursos se cierran una vez en orden inverso, cierre idempotente. BC10: una solicitud que supera la gracia se corta; un recurso que falla no detiene a los demás. BC11: cierre antes de arrancar |
| 10 Ausencia de conexiones externas | BC13: todos los *sockets* salientes son de *loopback*, ninguna resolución DNS externa, `mongoose.createConnection`, `mongoose.connect` y `MongoClient.connect` sin llamar |
| Seguridad y separación | BC12 (perfiles, producción, configuración y repositorios inseguros), BC14 (nada se escribe en la consola), BC15 (análisis estático de imports y de `process.env`/`.env`) |

## 7. Seguridad

- **Separación de entornos:** el entorno de integración (`integration`), el principal (`main`) y las herramientas sintéticas (`offline-test`) son perfiles distintos; solo el último existe. La composición no importa nada del arnés C.2 ni de la política de Atlas, y no hereda su usuario, base ni permisos.
- **Un usuario autenticado no escribe datos de otro jugador:** el contexto de sincronización se resuelve del token verificado y del estado del repositorio, nunca del cuerpo; cualquier sobre con otro jugador o instalación se rechaza (403) sin escritura (BC05).
- **Sin secretos en registros:** la composición no registra nada. Los errores devuelven solo códigos fijos.
- **Controles existentes conservados:** idempotencia (`duplicate`), validación estricta de sobres, límites de tamaño y de velocidad, y rechazo de cabeceras ambiguas. No se cambió ningún contrato de sincronización.

## 8. Limitaciones

1. **No validado contra Atlas.** Todas las pruebas usan almacenes en memoria. La validación real queda para una etapa con autorización y credenciales nuevas.
2. **`server.js` sigue arrancando la app por defecto** (sin JWT v2 ni sincronización). No hay todavía una fuente de repositorios para un perfil que no sea de pruebas, así que no se cambió lo que `npm start` sirve. Los almacenes simulados viven en `tests/`.
3. **El router de sincronización exige `repository.synthetic === true` y el JWT solo admite la configuración aislada** (`iss https://two-sides.test.invalid`, `aud two-sides-isolated-api`, modo `isolated-test`), y la producción está bloqueada. Habilitar datos reales requiere cambiar esas reglas de forma explícita y revisada.
4. Los adaptadores de MongoDB existentes están acoplados al ámbito Atlas C.2A (prefijo de colecciones, `runId`, banderas desechables). Un perfil `integration` necesitará su propio ámbito y su propia fábrica de dependencias.
5. El *rate limiter* es de proceso; no hay *proxy*, TLS ni CORS (el cliente de Godot no es un navegador). Un despliegue real necesita TLS delante.
6. La clave RSA de firma se genera para cada prueba. La gestión de claves reales no existe todavía.
7. El cierre ordenado depende del comportamiento de `http.Server` de Node 24 (probado). En Windows, una señal de terminación externa mata el proceso sin ejecutar los *handlers*; `Ctrl+C` sí.
8. B00 pendiente. La rotación de la credencial de integración sigue sin confirmarse.

## 9. Próximo paso para integrar Godot

1. **Decidir el destino del cliente en desarrollo:** (a) un lanzador local offline (`scripts/`) que arranque `createBackend` con el montaje simulado en *loopback*, para que Godot pueda probar contra un servidor real sin Atlas; o (b) esperar a un perfil `integration`.
2. **Etapa 2 (backend):** definir el perfil `integration`: fábrica de dependencias con Mongo para ese entorno, ámbito propio de colecciones, gestión de claves JWT y política de producción. Requiere autorización expresa, una cuenta de integración con contraseña ya rotada y confirmación de la rotación.
3. **Etapa de cliente (después):** `HttpClient` en C# para el contrato v2 ya fijado (registro, sesión, `sync/batches`, `receipts/query`), renovación del token antes de los 900 s, salida (*outbox*) con reintentos que conserven los mismos identificadores, y manejo de 207/409/429/503. No se inició en esta etapa.

**Entrega:** composición Express funcional y verificada en pruebas locales offline, con autenticación y sincronización conectadas mediante dependencias simuladas, preparada para una validación posterior con MongoDB Atlas. Detenido.
