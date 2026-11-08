> **Estado vigente B05.4C.2C:** modo Atlas explícito implementado y probado exclusivamente con dobles, 271 pruebas backend aprobadas. Sin conexión Atlas real; identidad durable/B00 pendientes. El [informe del modo](B05_ATLAS_INTEGRATION_MODE.md) actualiza las propuestas e implementaciones históricas siguientes; D no iniciada.
# B05.4C.1 — Adaptador MongoDB/Mongoose aislado

2026-10-28, America/Guatemala.

**IMPLEMENTADO EN CÓDIGO y PROBADO CON DOBLES. NO VALIDADO CONTRA MONGODB LOCAL.** La integración real permanece pendiente: no hay `mongod`/`mongosh` en PATH y Docker Desktop está instalado pero su motor no está disponible. No se inició Docker, descargó un servidor ni conectó una base existente o Atlas. B00 sigue pendiente. Esta fase no habilita producción.

## Archivos y dependencias

Nuevos:

- `src/modules/sync/ingestion-engine.js`: lógica común de ingestión extraída del adaptador B, sin importar soporte de tests.
- `src/modules/sync/mongo-models.js`: esquemas Mongoose y preparación explícita de índices.
- `src/modules/sync/mongo-ingestion-repository.js`: adaptador transaccional inyectable.
- `src/modules/sync/mongo-authorization-fence.js`: escritura condicional del control de sesión.
- `tests/sync/mongo.test.js` y `tests/sync/support/mongo-double.js`: 44 pruebas con dobles.
- Este documento.

Existentes modificados: `package.json`/`package-lock.json`; `src/middleware/sync-auth-context.js`; `tests/sync/support/{synthetic-ingestion-repository,fixture}.js`; `tests/jwt/jwt.test.js`; y los siete documentos autorizados: REMOTE_INGESTION_ARCHITECTURE, REMOTE_INGESTION_TEST_PLAN, SYNC_API_CONTRACT, IMPLEMENTATION_ROADMAP, PHASES, PHASE_HISTORY y DECISIONS. No se cambió SYNC_ARCHITECTURE ni otro documento.

Mongoose **9.11.2**, versión exacta, instalado con `--offline --ignore-scripts --no-audit --no-fund` desde la caché local; lockfile incluye driver MongoDB 7.7.0 y dependencias transitivas. Dos intentos restringidos no pudieron usar la caché; la instalación autorizada fuera del sandbox sí terminó sin descargar paquetes ni ejecutar scripts. No se descargaron binarios de MongoDB. No hay carga de `.env` ni configuración de conexión implícita.

## Contratos preservados

HTTP schemaVersion 2, JWT ver 2/RS256, sobre Outbox schemaVersion 1 y recibo versión 1 permanecen iguales. Tipos únicos: `game.report`, `session.report`, `gameplay.event`, `gameplay.interval`. No cambios de bytes canónicos, hash, IDs originales, datos desconocidos, fechas UTC o milisegundos; no cambios C#/SQLite. Se reutilizan parser, Zod, reglas de relaciones, servicio y router de B.

El motor común mantiene dedupe por cuenta/operationId y por scope/sourceKey, alias legítimos, revisiones superseded, dependencias y comprobaciones de intervalos. No crea métricas, agregados incrementales, decisiones o progreso. La proyección se deriva de hechos confirmados.

## Modelos e índices

Todos los modelos pertenecen a una conexión inyectada, `strict:'throw'`, `autoIndex:false`, `bufferCommands:false`, sin conexiones globales. `_id` es String, no cambia UUID públicos a ObjectId.

| Colección | Documento | Unicidad |
|---|---|---|
| sync_operations | `_id=cuenta:operationId`, cuenta, operationId, scope, record | `_id`; índice único `owner_operation_unique` sobre cuenta/operationId |
| sync_facts | `_id=scope\|sourceKey`, scope, sourceKey, record | `_id`; índice único `scope_source_unique` sobre scope/sourceKey |
| sync_fences | `_id=ingestion-v1`, revision | `_id`, serialización transaccional del prototipo |
| sync_authorization | `_id=sessionId`, cuenta/vínculo/épocas, active, expiresAt, revision | `_id`, control emitido exclusivamente por servidor |

`record` conserva el registro tipado validado por el motor compartido: operación incluye cabecera/versiones, dependencias, hash, fecha de recepción y recibo; hecho incluye tipo, identificador fuente, partida, payload canónico y digest. Se usa Mixed para conservar exactamente los contratos existentes; **Mixed no es un validador**. Cada carga reconstruye y valida sobre/hash/recibo/referencias y comprueba igualdad de claves externas e internas. No almacenar nombres visibles, credenciales, JWT, claves ni verificadores en estas colecciones. Esos campos tampoco aparecen en recibos.

El recibo está embebido en la operación; no existe una colección de recibos susceptible de quedar huérfana por sí sola. Hecho, operación y controles se escriben en la misma transacción.

`prepareIngestionIndexes(models)` es una operación explícita para una base nueva y desechable previamente verificada; no se ejecutó contra MongoDB en esta fase. Crea colecciones/índices y el fence inicial con majority/journal. No usar syncIndexes, borrar índices, restaurar datos o preparar una base personal como alternativa. Cada transacción verifica índices existentes: nombre, claves exactas, unique=true, sin filtro parcial, sparse o collation no simple. Ausencia/incompatibilidad produce 503 sin escritura.

## Composición y aislamiento

Se conserva `createApp({persistentJwt, sync:{repository}})`. Pasar una instancia de MongoIngestionRepository selecciona el nuevo adaptador por el mismo puerto; el repositorio debe compartir identidad/coordinador con JWT. No se cambió `app.js`, `server.js` ni rutas de autenticación. Defaultapp no activa sync/Mongo ni abre conexiones al importar módulos.

El constructor exige:

1. Capacidades `synthetic:true`, `disposable:true`; producción sigue rechazada.
2. Conexión ya abierta e inyectada, nombre `twosides_sync_test_` seguido de UUID sin guiones.
3. Semillas exclusivamente loopback, `directConnection:true`, sin SRV ni credenciales.
4. Modelos y callback `fenceAuthorization` explícitos.

El adaptador no recibe URI, no conecta, no lee variables de configuración ni prueba destinos alternativos. La guarda sobre una conexión inyectada no puede deshacer una conexión que su creador haya abierto previamente: cualquier futuro arnés debe validar destino, aislamiento y topología **antes** de conectarse. El nombre aleatorio y las banderas no demuestran por sí solos que una base existente sea desechable. En C.1 se usaron únicamente dobles, ninguna conexión real.

Antes de cada transacción, `hello` exige replica set y primary; standalone y secondary fallan cerrados. No se presume soporte transaccional por disponer de Docker o de un puerto. La dependencia de replica set y el uso secuencial de una sesión siguen la [documentación oficial del driver](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/). La [unicidad real](https://www.mongodb.com/docs/manual/core/index-unique/) debe demostrarse contra el servidor, además de inspeccionar esquemas.

## Transacción e idempotencia

`withTransaction` utiliza snapshot, primary, writeConcern majority/journal, maxCommitTimeMS 1000 y timeoutMS 10000. Todas las lecturas/escrituras Mongo reciben la misma sesión y se ejecutan secuencialmente. Al inicio se incrementa el documento fence global: compiten sobre una escritura real tanto dos receptores como dos operaciones con intervalos solapados. No locks de archivo, TTL de locks o limpieza de locks residuales.

Este prototipo serializa toda la ingestión y carga un conjunto acotado de registros: por defecto 1000 operaciones y límite compartido de 2 MiB. Reescribe únicamente mediante `$setOnInsert`, no sobrescribe el payload del ganador. Es deliberadamente conservador y tiene amplificación de lecturas/escrituras; **no es un diseño de rendimiento para producción**. Su partición futura requiere demostrar otra vez relaciones, solapamientos y cuotas.

Mismo ID/hash/contenido/dependencias devuelve el recibo original; contradicción da 409. Un alias del mismo hecho conserva un hecho y crea un recibo por su propia operación, conforme a B. Índices únicos complementan la validación y el fence; no se confía solo en una lectura previa. Un error duplicate-key no se convierte automáticamente en éxito: se devuelve temporal 503 y se reintenta la misma clave para releer el resultado confirmado.

El callback transaccional puede repetirse por el driver. No emite respuestas ni ejecuta `afterCommit` dentro de él. La simulación de pérdida de respuesta se ejecuta después de que withTransaction resuelva. El adaptador de archivo mantiene su hook dentro de su exclusión original para conservar sus ensayos de crash.

## Autorización y dependencia de identidad

El contexto sigue marcado internamente, derivado del JWT ya verificado y del repositorio, nunca del body. Añade metadatos internos de sesión/cv/authzVersion/expiración para escribir el control Mongo; no cambian principal ni contratos HTTP. Cuenta, sesión, rol player y vínculo siguen revalidados en cada operación.

`mongoAuthorizationFence` hace `$inc` condicional sobre el control de la **misma sesión Mongo**, comparando cuenta, sesión, vínculo, cv, authzVersion, active y expiración. Control ausente, vencido o contradictorio aborta con 401; fallo Mongo aborta con 503. La lectura de recibos también exige ese control. Se comprueba el presupuesto antes de confirmar.

**Dependencia pendiente y bloqueante para un despliegue real:** el repositorio de identidad vigente sigue siendo sintético de memoria/archivo; esta fase no implementa identidad Mongo ni acopla sus revocaciones duraderas a los controles Mongo. La futura implementación de identidad debe crear controles desde registros autenticados del servidor y modificar los mismos documentos al revocar sesión/cuenta, cambiar credenciales o vínculo, incluyendo las sesiones afectadas. Leer un snapshot o copiar controles una sola vez no demuestra esa garantía. No sustituir el callback por `async()=>true` ni rellenar controles desde UUID del cliente.

En los tests, controles y transacciones son dobles en memoria y la identidad comparte además el coordinador B: prueban rechazo y rollback de integración, **no** la carrera de revocación entre procesos Mongo reales. Sin controles existentes, el helper provisto falla cerrado; sin callback, el constructor rechaza la composición. Producción/múltiples hosts permanecen bloqueados hasta verificar el acoplamiento real. No nuevas rutas administrativas ni roles.

## Recibos y errores

Solo después del retorno confirmado de withTransaction se publica un recibo positivo. Se mantiene el contrato de acceptedAs y la correlación lease/intento separada. No ACK global por contadores: lote mixto 207, rechazos/deferred individuales y ausencia de recibo en fallos.

Antes de escribir, desconexión da 503 sin recibo. Error durante commit puede dejar resultado incierto: 503 sin afirmar rollback ni generar otra operationId; retry/query con los mismos IDs/hash recupera el recibo si se confirmó. El driver decide los retries transaccionales elegibles; si agota su presupuesto, el adaptador no inventa confirmación. Lecturas futuras verifican consistencia, no reinitializan colecciones. No garantías HTTP de exactamente una vez.

## Pruebas y comandos

`tests/sync/mongo.test.js`: **44 pruebas unitarias/con dobles**, no 44 integraciones Mongo. M01–M30 corresponden en orden a los treinta mínimos solicitados; M21–M24 recorren los cuatro tipos usando los vectores C# existentes. M10 reconstruye el adaptador sobre el mismo doble: no es durabilidad ni reinicio real de un servidor.

| Casos | Evidencia |
|---|---|
| M01–M05 | Inserción, declaración de índices Mongoose desconectados, repetición, recibo idéntico, contradicción |
| M06–M10 | Propietario, vínculo ajeno, revocación, consulta de recibo, reconstrucción del adaptador sobre doble |
| M11–M15 | Concurrencia simulada, respuesta perdida, fallo previo, resultado incierto, retry estable |
| M16–M20 | Dependencia faltante/posterior, HTTP 207 local, payload inválido, versión incompatible |
| M21–M26 | Cuatro contratos con bytes/hash conservados, fechas/duraciones, null desconocido |
| M27–M30 | Alias sin duplicar hecho, separación de cuentas, rechazo de conexiones con credenciales o externas/SRV |
| M31–M36 | Rollback, callback reintentado sin ACK prematuro, control ausente/revocado, composición incompleta, errores sanitizados |
| M37–M44 | Índices ausentes/parciales, topología incompatible, épocas, duplicate-key, fence ausente, cero conexiones de red en los cuatro tipos, control vencido |

Comandos ejecutados: `npm test` con guardas .env; `node --check` sobre 43 archivos src/sync-tests; gates de compatibilidad e identidad existentes. Servidores HTTP de test solo 127.0.0.1/puerto efímero, cerrados. El caso M42 bloquea Socket.connect y procesa los cuatro tipos sin abrir red. No URI real, credenciales productivas, SQLite o datos runtime como fixtures.

Regresión ajustada técnicamente: la prueba JWT que exigía ausencia de mongoose en package.json dejó de ser válida al autorizar esta dependencia. Se conservó como prueba de composición JWT independiente/desconectada y login local real; las otras 49 pruebas JWT no cambiaron. La primera batería completa mostró ese único fallo y 234 aprobadas; se corrigió la aserción histórica, no la validación de firma o propiedad. Vitest inicialmente requirió permiso de subprocesos por EPERM, sin modificar ACL.

Los ensayos persistentes de archivo B se ejecutan como regresiones aparte: acreditan sus recibos y reinicios, **no** persistencia Mongo. No se reejecutaron las 64 pruebas C# ni las 791 históricas completas porque no cambió productor/juego. Los 63 vectores no se suman como otras 63 pruebas.

## Verificaciones finales y siguiente fase

Los resultados finales e integridad se consignan al cierre abajo. `.env` no se abre ni se hashea en C.1: la referencia histórica sigue siendo 278 bytes / `4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928`, citada del registro anterior, **no recalculada**. Se comparan solo tamaño/fecha/owner/SDDL. Las tres bases se verifican por hash/tamaño/fecha/owner/SDDL sin SQL. No se cambian permisos, propietario o herencia; B00 sigue pendiente.

Proponer B05.4C.2 únicamente para preparar un replica set local desechable con binario confiable previamente disponible/autorizado, almacenamiento exclusivo, bind loopback y cero credenciales reales. Antes de conectar: comprobar proceso/binario, rutas/topología, base vacía nueva, ausencia de usuarios y red externa. Después: preparar/verificar índices, integrar identidad y sus revocaciones en el fence Mongo y ejecutar escenarios reales de concurrencia, commit incierto, desconexión, reinicio del proceso receptor/servidor y conservación de recibos. Incluir reinicios con claves/sesiones duraderas sintéticas, verificación de rollback/majority y acceso cruzado. No certificar esas garantías desde este doble.

Pendientes productivos: identidad/rotación/custodia y B00; throughput/cuotas distribuidas; backups/recuperación, retención, observabilidad sin secretos y pruebas de recursos. Sin Atlas, transporte Godot, envío de 906 pendientes, B05.5 o AWS. Detenerse después de C.1.

### Cierre comprobado

`npm test`: **235 aprobadas, 0 fallidas, 0 omitidas** (39 node:test + 196 Vitest en cinco archivos). Nuevas: 44 con dobles; regresiones: 191. Gate de compatibilidad: 63 vectores / cuatro tipos compatibles; gate JWT v2: vínculo válido y revocación rechazada. Node --check: 43 archivos src/sync-tests, cero errores. No compilación Godot ni nuevo resultado .NET; las 64 pruebas C# de B son antecedentes no reejecutados.

Las tres bases conservan hash, tamaño, mtime, propietario y SDDL. `.env` conserva tamaño 278, mtime, propietario y SDDL; no se ha recalculado su hash ni leído su contenido. Cero directorios identity-d2-* y cero procesos node/mongod/Godot/exportador/comprobador al cerrar. Ninguna conexión Mongo real, Atlas o envío de datos reales. B00 pendiente. C.2 y B05.5 no iniciadas. **Trabajo detenido.**
Inventario final: 1399 → 1406 archivos fuera de .git/.work/node_modules/.godot/.npm-cache y .env separado; 7 nuevos, 13 existentes modificados, 0 eliminados. Los 1386 archivos anteriores restantes conservan su hash. Los 20 cambios deliberados están exclusivamente bajo backend y coinciden con el inventario descrito. El código de Godot y local-persistence no cambió. Los metadatos de .env y las tres bases se verificaron por separado como se indica arriba.

## B05.4C.2 — Preflight: INFRAESTRUCTURA PENDIENTE

2026-10-28. Inspección completada sin iniciar servidores o instalar software. No se halló mongod/mongosh en PATH ni en ubicaciones de instalación revisadas; sin servicios Mongo/Docker ni procesos Mongo activos. Compass 1.53.0 instalado; Docker Desktop 4.95.0 sin motor disponible. Puerto propuesto 27184 sin listeners y aproximadamente 107,5 GiB libres. La búsqueda acotada no descarta una instalación portátil no declarada.

La puerta de infraestructura exige detenerse: **0 integraciones Mongo reales y 0 pruebas automatizadas ejecutadas en C.2**. Las 235 aprobadas de C.1 siguen siendo evidencia anterior, no reejecutada. Se prepararon configuración local y matriz de 30 casos pendientes; índices, transacciones, recibos, reinicios y carreras reales siguen sin verificar. La identidad memoria/archivo no actualiza los controles Mongo al revocar: la corrección de coordinación está propuesta y no implementada. No usar un callback permisivo ni copiar controles una sola vez como garantía.

Tres bases protegidas: hash/tamaño/mtime/owner/SDDL iguales antes/después; propietario/SDDL de raíz y backend iguales. `.env` no se consultó, abrió ni hasheó; no se certifica de nuevo su contenido o ACL individual. No cambios de permisos/herencia/propietarios, código, contratos, Godot o SQLite. B00 pendiente.

[Informe de infraestructura, propuesta y pruebas pendientes](B05_MONGODB_LOCAL_INTEGRATION.md). La siguiente acción requiere infraestructura local desechable explícitamente autorizada y repetir el preflight. Sin Atlas, descargas automáticas, activación Docker, AWS o B05.5. **INFRAESTRUCTURA PENDIENTE; trabajo detenido.**
## B05.4C.2C — Modo Atlas explícito, sin conexión remota

2026-10-28. **COMPLETADA EN CÓDIGO Y DOBLES; NO VALIDADA CONTRA ATLAS.** Factory sin conector por defecto y sin selección por variables de entorno. Host/usuario/base exactos, TLS estricto, permiso inspeccionado mediante connectionStatus de solo lectura y scope interno por runId; rama local conserva loopback/base temporal/sin credenciales. Creación del repositorio requiere allowWrites explícito y modelos de colecciones exclusivas; autoCreate/autoIndex desactivados. Arranque, endpoints, cuatro sobres y JWT existentes sin cambios.

Canal de credenciales opaco de un uso/RAM y lanzador manual de una futura D: exige autorización, ruta privada y receptor con hash revisado antes del prompt. Solo probado con buffers ficticios; no secreto real recibido ni conexión Atlas. Identidad/revocaciones siguen en memoria/archivo y no se declara coordinación durable resuelta. B00 pendiente.

**271 pruebas backend aprobadas: 36 nuevas + 235 regresiones; cero fallidas finales.** Los 63 vectores C#/Node y gate de identidad pasaron; no se suman como tests nuevos. 48 JS sin errores de sintaxis; parser PowerShell sin errores y arranque sin autorización denegado antes de pedir credencial. No .NET/Godot ejecutados, instalaciones, datos reales o ACL modificados. Las tres bases se comparan por integridad/metadatos; .env excluido de lectura/hash.

[Configuración, archivos, pruebas, límites y propuesta D](B05_ATLAS_INTEGRATION_MODE.md). D requiere autorización de conexión real inicialmente de lectura, credenciales temporales, ruta/receptor revisados y tratamiento explícito de B00/identidad durable. Ninguna escritura/limpieza remota autorizada por C.2C. B05.4C.2D y B05.5 no iniciadas; trabajo detenido.