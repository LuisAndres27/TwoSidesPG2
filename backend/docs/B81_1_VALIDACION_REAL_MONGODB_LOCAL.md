# B81.1 — Validación real MongoDB local

Fecha: 4 de noviembre de 2026, Guatemala.

**RESULTADO: los 17 casos reales B81 APROBADOS contra un MongoDB 8.0.34 real (contenedor del propietario) en la ejecución final, más 2 pruebas adicionales de evidencia TTL (19/19).** La validación encontró **un defecto real** que los dobles no podían mostrar (reintentos de conflicto sin espera), corregido de forma compatible y probada. **El riesgo de idempotencia a largo plazo por los cuatro TTL NO está resuelto**: se reprodujo contra Mongo real (§6). No se conectó Atlas ni se habilitó el envío remoto. B00 sigue pendiente. B82 no se inicia.

## 1. Motor real y configuración observada

Contenedor del propietario `twosides-b811-mongo`, **no creado, detenido ni eliminado por esta fase** (solo se reinició dos veces por autorización expresa, §5; sigue en ejecución).

| Dato | Valor observado |
|---|---|
| Contenedor / ID | `twosides-b811-mongo` / `f26949b7d54dda8fd6454f6ed6ca4d0965a9ca63a1a40818afdc1fc5b242bc31` (la misma ID antes y después de los reinicios) |
| Imagen | `mongo:8.0`, ImageID `sha256:6657bf2413fefc5be649390318f5b4cd7328e982722f8ce2ac6dfa6f0a42cb03` |
| Servidor | `mongod` **8.0.34**, gitVersion `51db4515a6597aedcf6188ee4e48a27e65b065ae`, WiredTiger, wire version máxima 25, sesiones lógicas 30 min |
| Comando | `mongod --replSet rsB811 --bind_ip_all`, PID 1 en el contenedor; sin autenticación ni TLS (instancia local sin secretos) |
| Publicación de puertos | únicamente `127.0.0.1:27028 → 27017/tcp` (HostIp 127.0.0.1); red `bridge`, sin privilegios; 2 volúmenes (`/data/db`, `/data/configdb`) |
| Escucha en Windows | `127.0.0.1:27028` (proxy de Docker Desktop, `com.docker.backend`); sin escucha pública |
| Replica set | `rsB811`, un solo miembro `localhost:27017` (votos 1), versión de configuración 1, `writeConcernMajorityJournalDefault: true`, `isWritablePrimary: true`, primario `myState 1` |
| Bases previas | solo `admin`, `config`, `local` |
| Contexto Docker | motor local de Docker Desktop (`npipe`); Docker 29.8.2 |

Otro contenedor, `twosides-mongo-it-53d5ecdcb71669dbe78912bad89016e2` (imagen `mongo@sha256:6657bf24…`, `--port 27028`, estado `Exited (255)`), **no pertenece a B81.1**: no se inició, inspeccionó más allá de sus metadatos ni modificó. El arnés rechaza cualquier contenedor con otro nombre.

## 2. Adaptación necesaria y cambios (todos compatibles y probados)

El arnés preparado en B81 arrancaba su **propio `mongod` nativo** (con SHA-256 aprobado, PID y `dbPath` comprobados) y exigía el replica set `b81_<runId>`. El propietario preparó un contenedor, así que se añadió un **modo de contenedor** aparte, sin relajar el modo nativo:

| Archivo | Cambio | SHA-256 nuevo |
|---|---|---|
| `src/modules/statistics/mongo-local-policy.js` | Perfil adicional todo-o-nada `ownedContainer: 'twosides-b811-mongo'` ⇒ obliga a puerto 27028 y réplica `rsB811`; sin marcador, `rsB811` sigue rechazado; el perfil nativo (`b81_<runId>`) no cambia | `4F6DC5EE…E599454` |
| `src/modules/statistics/transactional-repository.js` | **Corrección del defecto real**: pausa aleatoria acotada entre los 3 reintentos de conflicto (30–60 ms y 90–180 ms, ≤ ~270 ms). Mismos 3 intentos, ninguna validación relajada | `DE48D51C…ACCBA` |
| `tests/statistics/b81-container-instance.js` (nuevo) | Arnés del contenedor (§3) | `540244C8…7FD2` |
| `tests/statistics/b81-mongo.real.js` | Selección por `B81_CONTAINER_TESTS=1`; el caso 15 solo se salta si no hay autorización de reinicio; los 17 casos no cambian | `C0CE0088…D33` |
| `tests/statistics/b81-node-worker.js` | Identificación del servidor del contenedor en el proceso hijo (caso 16) | `FDCDA377…611E` |
| `tests/statistics/b81-real.config.js` | Incluye además `b81-ttl.real.js` | `D9FC185D…8B7D` |
| `tests/statistics/b81-ttl.real.js` (nuevo) | Evidencia TTL real, extra a los 17 | `16EC2023…327A` |
| `tests/statistics/b81-container-policy.test.js` (nuevo, 18 pruebas offline) | Perfil de contenedor, rechazos, pausa de reintentos, rechazo de arranque sin autorización | `E7B7E0C3…24DA` |

Respaldo de los originales en `local-persistence/.work/b81/pre-B81_1/`; inventario antes/después en `local-persistence/.work/b81/b81_1-changes.json`. Sin cambios al adaptador Mongo, esquema, proyector, paquetes, juego Godot/C#, B75/B78 ni manifiestos.

## 3. Identificación del destino (antes de cualquier escritura)

El arnés verifica en cada arranque: (1) el contexto Docker es el motor local; (2) `docker inspect` de `twosides-b811-mongo`: imagen `mongo:8.0`, en ejecución, comando exacto `--replSet rsB811 --bind_ip_all`, `PortBindings` y puertos exactamente `127.0.0.1:27028`, sin privilegios, red `bridge`, solo los dos volúmenes; (3) el servidor tras 127.0.0.1:27028: `serverStatus.process = mongod`, **PID 1**, versión `8.0.x`, `setName = rsB811`, un miembro, primario escribible, sesiones lógicas, `getCmdLineOpts.replSet = rsB811`; (4) ninguna base ajena; (5) política: host literal, base `twosides_statistics_b81_<runId>` nueva, sin URI, sin credenciales, sin proxies/SRV/TLS/`loadBalanced`.

**Límite honesto:** a diferencia del modo nativo no se puede igualar el PID/`dbPath` con un proceso hijo propio; la identidad se apoya en Docker (nombre, imagen, enlaces de puerto) más las respuestas del servidor. No se usó `MONGODB_URI` ni credenciales de Atlas, ni se leyó `.env`.

## 4. Resultados de los 17 casos (ejecución final, sin dobles ni simulaciones)

Comando (consola sin credenciales, desde `backend`): `B81_OWNED_LOCAL_TESTS=1 B81_CONTAINER_TESTS=1 B81_CONTAINER_RESTART_AUTHORIZED=1`, `node --import ./tests/statistics/b80-isolation-guard.js ./node_modules/vitest/vitest.mjs run --config tests/statistics/b81-real.config.js --reporter=verbose` (guarda de aislamiento precargada).

| Nº | Caso | Resultado | Evidencia real |
|---|---|---|---|
| 1 | Contribuciones y recibo reconstruible; replay duplicate | **PASS** | transacciones snapshot/majority reales |
| 2 | Cien eventos simultáneos, sin pérdidas | **PASS** (~5 s) | 100 commits sobre un contador |
| 3 | Dos copias del mismo evento: un incremento | **PASS** | |
| 4 | La lectura devuelta no modifica el estado persistido | **PASS** | |
| 5 | Contadores inconsistentes rechazados atómicamente | **PASS** | |
| 6 | Lotes superpuestos | **PASS** | |
| 7 | Dos escritores independientes, evento idéntico | **PASS** tras la corrección | `accepted` + `duplicate`, 1 evento; WriteConflict 112 real observado |
| 8 | Dos escritores independientes, eventos distintos | **PASS** tras la corrección | `accepted` + `accepted`, 2 eventos |
| 9 | Colisión real de `_id`: aborta ambos inserts y la revisión | **PASS** | |
| 10 | Lectura durante escritura: sin conjunto parcial | **PASS** | |
| 11–14 | Fallos de aplicación antes de transacción, tras deduplicación, tras incremento, antes del commit | **PASS ×4** | cero efectos persistidos |
| 15 | Reinicio del `mongod`, reapertura y deduplicación | **PASS** (6,9 s) | `docker restart`, misma ID, primario `rsB811`, el evento no se cuenta dos veces |
| 16 | Dos procesos Node sucesivos conservan el recibo | **PASS** (2,6 s) | `accepted` luego `duplicate`, 1 evento |
| 17 | Express, respuesta descartada, replay coherente | **PASS** | recibo `duplicate` con el mismo hash |

**17/17 aprobados** en la ejecución final (19/19 con las dos de TTL; 86 s). Historial honesto de ejecuciones: (1) 14 PASS, 2 FAIL (casos 7 y 8, defecto real de reintentos), 1 omitido (caso 15, sin autorización); (2) tras la corrección, 16 PASS + TTL, caso 15 omitido; (3) con reinicio autorizado el caso 15 falló por **un defecto de mi arnés** (tras `docker restart` creó un solo cliente que falló al conectar antes de que `mongod` volviera y quedó cerrado; la limpieza lo enmascaró), corregido con reintento de conexión con clientes nuevos; esa falla dejó una base sintética sobrante que hizo fallar en cascada los casos 16 y 17 de esa ejecución (la propia limpieza de mi arnés), y la base se eliminó tras verificar que era propia; (4) final 17/17 + 2. Los casos 1–6 y 9–14 pasaron en las 4 ejecuciones; 16 y 17 en las ejecuciones 1, 2 y 4; 7 y 8 en las 3 posteriores a la corrección.

## 5. Evidencia por categoría

- **Transacciones multidocumento reales:** sesiones con `readConcern snapshot`, `writeConcern majority + j:true`, commit y abort reales sobre un replica set de un nodo. Los 4 fallos de aplicación y la colisión de `_id` dejan el estado intacto y `revision 0`; el lector concurrente solo ve el estado anterior o el posterior completo.
- **Concurrencia (hallazgo):** con dos escritores independientes, la revisión global (`stats_v1_meta`) provoca **WriteConflict (código 112, `TransientTransactionError`)** reales. El perdedor es abortado al instante mientras el ganador sigue en transacción (~8 ms). Con reintentos inmediatos se agotaron los 3 intentos en ~10 ms ⇒ `StatisticsUnavailable` (reintentable; sin pérdida ni doble conteo: `aggregates` mostraba 1 evento). Con la pausa acotada: 1–3 conflictos reales y ambos escritores confirman (`accepted/duplicate` o `accepted/accepted`).
- **Recibos y reintentos:** replay por Express y por segundo proceso Node reconstruyen `duplicate` con el mismo hash y no cambian contadores.
- **Recuperación:** dos reinicios graduales del contenedor (autorizados): `docker restart --time 20`; el contenedor vuelve con la misma ID y como primario; el segundo (el del caso 15 válido) conserva la deduplicación. **Limitación:** es un cierre limpio, no una pérdida de energía ni una caída; un único nodo no prueba elecciones ni failover.
- **No observado en real:** `UnknownTransactionCommitResult`, timeouts de commit, errores internos del servidor: su cobertura sigue siendo la simulada de B81.
- **Limpieza:** cada ejecución elimina solo su base `twosides_statistics_b81_<runId>` (nombre + semilla propia con la clave pública ficticia). Un fallo de mi arnés dejó una base sobrante; se verificó y eliminó con el mismo criterio. Al final: solo `admin`, `config`, `local`.

## 6. Índices TTL

Observado en el servidor real:

| Comprobación | Resultado |
|---|---|
| Índices | `stats_v1_receipts`, `stats_v1_semantic`, `stats_v1_active`, `stats_v1_budgets`: `expiry_v1` sobre `{expiresAt:1}` con `expireAfterSeconds: 0`; contadores y metadatos sin TTL |
| Monitor TTL | `ttlMonitorEnabled: true`, `ttlMonitorSleepSecs: 60` |
| Borrado físico | Con un evento aceptado en febrero de 2026 (todas sus claves con `expiresAt` en el pasado real), **las cuatro colecciones quedaron vacías** en 48 s, 18 s y 55 s (tres mediciones) y los contadores conservaron sus 3 documentos y el total |
| Replay de los mismos bytes después de expirar | **Rechazado** `event_expired` (la fecha del evento salió de los 90 días): la protección que B81 declara funciona |
| Control dentro de la retención | Mismo hecho con otro `EventId` ⇒ `fact_conflict` (deduplicación semántica activa) |
| **RIESGO REPRODUCIDO** | Tras expirar físicamente la clave semántica, **la misma instalación se registró de nuevo con otro `EventId` y una fecha nueva admisible y fue `accepted`**: `installations_registered` pasó de 1 a 2 |

**Conclusión:** que los 17 casos pasen no resuelve la idempotencia a largo plazo. Las instalaciones, partidas, finales y decisiones «únicas» pueden contarse otra vez tras 90 días + 5 min si llega un evento nuevo del mismo hecho. Sigue pendiente decidir (con coste de privacidad): conservar *tombstones* HMAC semánticos de por vida del contador/época, definir una cobertura/retención acotada y declarada, o adoptar otro mecanismo probado. **No se cambió ni aprobó ninguna opción.** Siguen pendientes la rotación de HMAC, la protección del ledger frente a borrados prematuros y las restauraciones coherentes. El retraso del TTL (hasta ~minuto, más con carga) no se midió bajo carga.

## 7. Regresiones

| Batería | Resultado |
|---|---|
| Estadísticas B79/B80/B81 + perfil de contenedor (config ordinaria, guarda precargada) | **204/204** (186 de B81 + 18 nuevas) |
| JWT/F1/F2/ingesta/composición (misma selección de B81, 6 archivos) | **188/188** |
| Pruebas offline B81 de política/driver/Express con dobles | incluidas en las 204; pasan sin cambios |
| Cliente .NET B79 (99) y captura/Outbox B77 (129) | **No repetidos**: no cambió ningún archivo .NET/Godot ni el contrato; los cambios son del backend (política y pausa de reintento, que solo actúa ante `TransactionConflict`). Quedan como recomendación para B82 |

Total ejecutado en esta fase: 204 + 188 + 19 reales (varias repeticiones de las reales, no sumadas).

## 8. Restricciones respetadas

- Sin Atlas, sin `MONGODB_URI` de producción, sin `.env`, sin credenciales; destino exclusivo `127.0.0.1:27028`, base sintética nueva por ejecución.
- Sin PlayerData (ni existencia ni metadatos) de `luis2`, `TwoSidesTest` o `TwoSidesStatsTest`; la guarda de aislamiento B80 estuvo precargada en todas las ejecuciones de Vitest y en el hijo Node. **Excepción de lectura:** al inicio calculé un SHA-256 (solo lectura) de la SQLite histórica `runtime-game` como centinela de integridad, sin abrirla con SQLite; valor `9FE793A2…8D0070C`, sin cambios. No se leyeron eventos B78 ni operaciones pendientes.
- Sin cambios al videojuego, ni envío remoto, v5 (SHA-256 `2A4956E9…D726`; el verificador oficial sigue en `tree_differs` esperado: 12 añadidos de estadísticas, 0 modificados, 0 eliminados, 0 problemas), B75/B78, B00, cuotas, ACL, commits o push.
- No se detuvo ni eliminó el contenedor del propietario: **dos `docker restart`** autorizados expresamente (el primero se perdió por mi defecto de arnés) y queda en ejecución, ID intacta. Sin servicios, procesos ni listeners propios residuales.

## 9. Riesgos pendientes

1. **Idempotencia a largo plazo / TTL** (§6): sin resolver; decisión de producto y privacidad.
2. **Revisión global como punto de contención:** dos escritores producen conflictos reales; con más de ~3 escritores simultáneos el presupuesto de 3 intentos puede agotarse (resultado reintentable, sin corrupción). Sin prueba de carga ni de latencia; evaluar particionar la revisión.
3. **Un nodo, sin elecciones, failover ni pérdida de energía; contenedor sobre Docker Desktop** (latencias y proxy de puertos); sin TLS ni autenticación; no equivale a Atlas.
4. `UnknownTransactionCommitResult`/timeouts de commit no observados en real.
5. Identidad del destino apoyada en Docker + respuestas del servidor (no en PID/`dbPath` propios).
6. Permisos mínimos de la futura cuenta de Atlas (incluida la acción `remove` de reutilización de claves expiradas), TLS/SCRAM, custodia HMAC, consentimiento y capacidad.
7. B00 sigue abierto; B75/B78 no incluyen B81 y el envío estadístico real continúa apagado.
8. El reloj sintético del fixture es noviembre de 2026; las pruebas TTL usaron febrero de 2026 a propósito.

## 10. Recomendación para B82

Antes de HTTPS/Atlas o de cualquier publicación: (1) **decidir la política semántica de unicidad a largo plazo** y probarla contra este mismo contenedor (el experimento TTL ya la reproduce); (2) repetir las pruebas de concurrencia con 3–8 escritores y medir tasa de `StatisticsUnavailable`/latencia para decidir si se particiona la revisión; (3) repetir los 17 casos al menos 3 veces seguidas para medir estabilidad, y añadir un test de reinicio no limpio si el entorno lo permite; (4) rerun de .NET B79/B77; (5) definir el rol Atlas con los permisos exactos (incluido `remove`). No activar estadísticas remotas ni conectar Atlas como atajo.

Reversión: con procesos cerrados, restaurar desde `local-persistence/.work/b81/pre-B81_1/` los cinco archivos modificados y retirar los tres archivos nuevos del inventario `b81_1-changes.json`. Nada que deshacer en el contenedor (todas las bases propias ya fueron eliminadas).

B81.1 se detiene aquí.
