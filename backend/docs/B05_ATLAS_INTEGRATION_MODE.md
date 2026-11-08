# B05.4C.2C — Modo Atlas de integración controlada

2026-10-28, America/Guatemala. **COMPLETADA EN CÓDIGO Y PRUEBAS CON DOBLES. SIN CONEXIÓN REMOTA NI VALIDACIÓN REAL ATLAS.**

Compass conectado es evidencia aportada por el usuario, no una prueba del adaptador. Esta fase no solicitó/recibió contraseñas reales, instaló software ni manipuló datos remotos. B00 sigue pendiente y B05.5 no se inicia.

## Modos y arranque

| Modo | Activación y restricciones |
|---|---|
| Sintético memoria/archivo | Composición anterior de fixtures, sin Atlas. |
| Mongo local de ensayo | Constructor existente: base twosides_sync_test_<runId>, directConnection=true, loopback y sin credenciales. Conserva el rechazo de Atlas. |
| atlas-integration-test | Nuevo factory explícito, destino exacto, autorización booleana obligatoria, credencial opaca temporal y conector inyectado. Sin conector por defecto. |

`app.js` y `server.js` no cambian ni importan el factory Atlas. No se selecciona modo por MONGODB_URI, NODE_ENV=development o por hallar una contraseña. NODE_ENV=production continúa rechazado. Importar los módulos nuevos no conecta, consulta DNS, lee stdin ni inspecciona variables/archivos de secretos.

La aplicación existente conserva POST /api/v2/sync/batches y consulta de recibos; JWT RS256 v2/player, Zod/parser/hash, cuatro tipos Outbox1, dependencias, idempotencia y 207 parcial permanecen compatibles. No cambios C#, Godot, contratos SQLite, progreso o datos de Outbox.

## Archivos de implementación

Nuevos:

- `src/modules/sync/atlas-policy.js`: configuración estricta, destino fijo, verificación de conexión/permisos y capacidades internas de ejecución.
- `src/modules/sync/atlas-credentials.js`: handle opaco de un solo uso y receptor de frame binario desde stream privado.
- `src/modules/sync/atlas-integration.js`: factory opt-in sin conector global/default, cierre sanitizado y creación controlada del repositorio.
- `scripts/send-atlas-test-credential.ps1`: lanzador manual para una futura D, denegado sin su autorización explícita.
- `tests/sync/atlas.test.js`, `tests/sync/support/atlas-double.js`: nuevas pruebas y conexión Mongo exclusivamente doble.
- Este documento.

Existentes de código modificados: `mongo-ingestion-repository.js` y `mongo-models.js`. El primero admite la capacidad Atlas verificada y conserva la rama local; el segundo liga nombres de modelo/colección a runId y desactiva autoCreate, además de autoIndex. No cambios de dependencias, app/server o lógica de autenticación/decisiones. Documentos estrictamente afectados enlazan este estado; el preflight anterior conserva sus propuestas/hallazgos históricos.

## Configuración y destino exactos

Config requerido por `validateAtlasConfig` y `openAtlasIntegration`, ejemplo sin contraseña:

```javascript
{
  mode: 'atlas-integration-test',
  authorized: true,
  uri: 'mongodb+srv://<cluster>.<id>.mongodb.net/two_sides_integration_test',
  host: '<cluster>.<id>.mongodb.net',
  database: 'two_sides_integration_test',
  user: 'twosides_integration_test',
  tls: true,
  runId: '<32 hex minúsculos nuevos>',
  allowWrites: false
}
```

El marcador runId debe sustituirse por un GUID sintético de 32 hex; no es una configuración ejecutada aquí. `allowWrites` es false por defecto. El schema rechaza claves desconocidas, otro host/base/usuario, URI alterada, userinfo en URI, query overrides, TLS inseguro y flags para saltar permisos. No twosides_backend, administrador, two_sides_db o una base temporal distinta.

El factory valida antes de invocar el conector. Solo pasa URI fija y opciones construidas internamente: dbName exacto, usuario fijo, contraseña desde handle/RAM, authSource admin, SCRAM-SHA-256, TLS estricto, directConnection=false, primary, retryWrites y majority; pool 2/min0/maxConnecting1, autoCreate/autoIndex/buffering/monitorCommands desactivados y plazos acotados de selección/conexión/cola. No acepta overrides de opciones del driver. No crea una conexión si falta el conector o la credencial. Durante C.2C todos los conectores fueron dobles: no se suministró uno real.

Después de conectar en una fase futura, verifica readyState, nombre real de Db y conexión, srvHost, dbName, credencial de usuario/authSource/mecanismo y opciones de TLS/directConnection. Una incongruencia cierra únicamente esa conexión propia sin consultar modelos ni escribir. Estas guardas no constituyen un sandbox contra código malicioso que sustituya deliberadamente el conector: el conector es una dependencia confiable del arnés revisado.

## Comprobación de permisos de solo lectura

Antes de emitir una capacidad interna, el factory llama exclusivamente:

```javascript
connection.db.command({ connectionStatus: 1, showPrivileges: true })
```

Verifica usuario autenticado único twosides_integration_test, auth DB admin, rol único readWrite en two_sides_integration_test y privilegios efectivos de recursos solo en esa base. Rechaza permisos globales, de clúster, otras bases o información incompleta; comprueba acciones necesarias para lectura/escritura/colecciones/índices. Un rol custom no contemplado se rechaza, sin fallback a administrador. Devuelve solo un resumen no secreto de usuario/base/rol/estado; no se registra el objeto recibido ni opciones/credencial/stack original.

Este comando es de inspección de la conexión, no de creación de usuarios/documentos. Está documentado para Atlas en [connectionStatus](https://www.mongodb.com/docs/manual/reference/command/connectionstatus/). Se ejecutó solo contra dobles. Si Atlas lo deniega o el resultado no cumple, no habrá capacidad de repositorio; no sustituir el resultado por una declaración manual de que Compass conecta.

El resultado refleja permisos en ese instante, no una supervisión continua de cambios posteriores. El confinamiento definitivo sigue dependiendo de RBAC del usuario Atlas. dbName solo selecciona una base: no equivale a negar otras. El factory no ofrece un Db público en su handle; el repositorio es una dependencia interna del servidor, no una frontera de seguridad contra un programador con acceso a sus objetos. Ningún endpoint expone client.db/useDb o nombres arbitrarios de colección.

`authSource:'admin'` sirve para SCRAM y metadatos de autenticación/topología; no implica rol admin ni CRUD sobre admin. Deben confirmarse alcance del usuario al clúster TwoSidesCluster y Network Access limitado antes de cualquier conexión real; esas condiciones no se consultaron ni modificaron en C.2C.

## Capacidades, namespaces y escrituras

Tras verificar permisos, se emite una capacidad interna en WeakMap, ligada a conexión, config inmutable y runId. No se puede suplir con un objeto JSON. La vista de política que reciben los consumidores es inmutable y no permite alterar el estado privado. Cerrar el handle invalida el scope; posteriores operaciones fallan cerradas.

El handle inicial permite revisar el resumen y cerrar. Con allowWrites=false, createRepository rechaza **antes** de registrar modelos. No se crean colecciones o índices al verificar la conexión. Solo con allowWrites=true, configuración explícita y permiso comprobado puede construirse el repositorio de operaciones. Ese booleano debe reflejar autorización externa real; no la inventa el programa.

Colecciones del mismo Db autorizado:

```text
b054c2c_<runId>_ops
b054c2c_<runId>_facts
b054c2c_<runId>_fence
b054c2c_<runId>_authorization
```

Los nombres de modelos también incorporan runId para evitar reutilización de otro ensayo. El repositorio comprueba Db/conexión y mapa de modelos al construirse y antes de cada transacción; una sustitución de namespace aborta. No usa las colecciones fijas anteriores ni altera canonicalEnvelope para añadir runId.

La provisión de índices/fence sigue siendo una escritura explícita separada: el factory no invoca prepareIngestionIndexes. Una futura D debe verificar nombres nuevos/libres y propiedad del runId antes de autorizar esa provisión; no inicializar colecciones previas ni borrar índices. No se añadió limpieza remota automática. El manifiesto por ejecución y limpieza por IDs exactos del [preflight B](B05_ATLAS_INTEGRATION_PREFLIGHT.md) siguen siendo requisitos para una fase con escrituras.

Las guardas validan el arnés y sus argumentos; no restringen las facultades de readWrite en el servidor a un runId. Para proteger registros existentes se necesitan también el código revisado y el mapa exclusivo, además del rol restringido a la base. No intentar accesos negativos a otra base para probar RBAC fuera del alcance autorizado.

## Credenciales temporales y activación manual futura

El secreto se entrega a `temporaryAtlasCredential(Buffer)`; no se acepta como campo de config, URI, string persistida, argumento del proceso o variable de entorno. El handle congelado no tiene propiedades secretas y puede serializarse sin revelarlas. Los bytes viven en un WeakMap privado, se consumen una vez y se limpian al consumir, fallar o descartar. El driver necesita una string temporal en RAM: no se promete borrado perfecto de strings del GC, ni protección frente a malware/administrador.

`receiveAtlasCredential(stream)` recibe un frame: longitud uint32 big-endian y hasta 1024 bytes UTF-8, sin CR/LF/NUL; rechaza datos inválidos, frames truncados, exceso de tamaño y timeout (máximo 30 s). Limpia buffers de entrada/copia. No lee process.stdin al importar; el receptor debe invocarlo explícitamente sobre un canal dedicado. No JSON de contraseña, archivos temporales o logs.

El lanzador PowerShell manual requiere todos estos elementos antes de pedir entrada:

1. Switch AuthorizedForB054C2D; en ausencia de autorización termina antes del prompt.
2. Directorio ya existente `%LOCALAPPDATA%/TwoSides/AtlasIntegrationTests/b054c2c-<runId>`; no lo crea. Comprueba ruta, rechazo de OneDrive/reparse points de ancestros, propietario y Allow limitadas a usuario actual/SYSTEM/Administradores en el padre privado y la ejecución. No cambia ACL.
3. ReceiverPath dentro de ese directorio privado y ReceiverSha256 de un receptor JavaScript revisado. No busca el receptor ni una contraseña en Compass o el proyecto.

Tras aprobación futura, usa Read-Host -AsSecureString, convierte temporalmente en RAM, inicia solo ese receptor con ventana oculta y entorno mínimo sin heredar MONGODB_URI, y envía el frame por stdin anónimo. No contraseña en argv/env/disco. Captura y no reenvía stdout/stderr del hijo; cualquier salida inesperada genera error genérico. Tiene timeout y finaliza únicamente su propio hijo si queda activo. Limpia BSTR/bytes y dispone objetos cuando termina.

**No se activó ese canal ni se creó su directorio/receptor privado en C.2C.** Solo se probó que el lanzador sin autorización falla antes de pedir contraseña. El receptor/orquestador real y el conector de D todavía deben revisarse y autorizarse; no hay un script de esta fase que conecte automáticamente Atlas. La verificación de SHA y ACL no elimina todas las carreras de sistema/usuario ni sustituye resolver o aceptar el riesgo B00.

## Identidad y ventana de revocación

Se conserva el JWT v2 existente: firma RS256, issuer/audience/expiración, cuenta y sesión activas, versiones y rol, instalación/perfil/vínculo del servidor. La propiedad no procede del body. Contexto interno marcado y revalidado antes de commit; el repositorio Mongo mantiene el control de sesión de la transacción. No se relajó autenticación al añadir Atlas.

Sin embargo, identidad/cuentas/sesiones y revocaciones permanecen en memoria o archivo sintético; sus métodos no actualizan de forma transaccional sync_authorization en Mongo. Entre una validación de contexto y commit podría revocarse el usuario en otro almacén/proceso mientras el control Mongo queda obsoleto. Un mutex de test o el rechazo de un control ausente no demuestran que ambas autoridades estén coordinadas durablemente.

**Bloqueo declarado:** no se implementó un repositorio de identidad Mongo transaccional ni un protocolo de coordinación entre almacenes. C.2C no certifica revocación durable multiinstancia. Requiere subfase separada de identidad/sesiones/controles coherentes, carreras de ambos órdenes y reinicio posterior a revocación. No usar fenceAuthorization que siempre devuelve true, copiar controles una vez o un Map temporal como solución real. Las pruebas usan controles sintéticos solo para validar integración y fallo cerrado.

B00 continúa pendiente, sin tocar ACE/propietarios/herencia. Custodia fuera de OneDrive reduce persistencia accidental, pero código modificable bajo ACL pendientes podría capturar secretos en RAM. Antes de introducir un secreto real debe revisarse la fuente/huella del arnés y resolverse B00 o aceptarse explícitamente su riesgo residual para ese ensayo mínimo; no se interpreta como una corrección de permisos.

## Pruebas y resultados

`npm test`: **271 pruebas backend aprobadas**, 0 fallidas finales, 0 omitidas. Son **36 nuevas + 235 regresiones**: 39 legacy, 50 JWT, 35 identidad persistente, 67 ingestión B y 44 Mongoose C.1. Vitest: 232 casos en seis archivos; node:test: 39. Las pruebas de archivo se mantienen como persistencia sintética local, no como evidencia Atlas.

La primera batería focalizada aprobó 32 casos; se añadieron cuatro comprobaciones del lanzador, UTF-8, mutación de namespace y error de permisos. No se suman reejecuciones al total. Tras endurecer la vista privada inmutable se repiten las baterías Atlas/Mongoose; su resultado final se registra al cierre. Gate C#/Node: 63 vectores/cuatro tipos compatibles; gate de vínculo JWTv2/revocación aprobado. No compilar ni ejecutar Godot o .NET; las 64 regresiones C# y 791 históricas son antecedentes, no resultados actuales.

| Requisito de C.2C | Evidencia |
|---|---|
| 1–8 Modo por defecto, autorización, host/base/usuario/URI, credencial y configuración válida ficticia | A01–A08 |
| 9–10 No exposición de secretos/conexiones accidentales | A09–A10, A30–A32, A36–A39 |
| 11–12 Contratos y endpoint conservados | A11–A12, 63 vectores y regresiones de ingestión |
| 13–16 JWT inválido, revocación, propietario y autorización | A13–A16, A28, A34 |
| 17 Regresiones Mongoose | 44 casos anteriores realmente reejecutados |
| 18 Regresiones Express/ingestión | 67 casos anteriores realmente reejecutados |
| 19 Regresiones autenticación | 124 casos anteriores realmente reejecutados |
| 20 SQLite protegido | A20, guardas de acceso y comparación binaria externa de las tres bases |

A21–A39 añaden configuración de producción/TLS/overrides, destino conectado, composición de lectura, scope/namespace cerrado o sustituido, permisos incompletos/globales, modo local conservado, canal temporal y ausencia de control de identidad. Todos los Mongo connectors son dobles. HTTP de regresión solo loopback/puertos efímeros, cerrado al terminar; no publica servicios.

Node --check sobre 48 archivos src/sync-tests: cero errores; parser PowerShell: cero errores. El lanzador se ejecutó únicamente sin switch D en modo no interactivo y negó el acceso antes del prompt. No pruebas de permisos, persistencia o latencia Atlas reales.

## Límites Atlas Free y procedimiento D propuesto

Free/M0 tiene cuotas de almacenamiento/conexiones/operaciones y restricciones de pruebas de failover/comandos; consultar [límites oficiales](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/). No son características verificadas de TwoSidesCluster. Un pool pequeño no limita a dos todos los sockets de monitorización y no convierte el ensayo en prueba de rendimiento.

El prototipo aún carga y recorre todo su estado acotado y realiza upserts secuenciales; los presupuestos de 2 s por operación/10 s por lote no se ampliaron. WAN/M0 podría superar esos tiempos o activar throttling. Optimizar escrituras a deltas requiere una corrección separada y pruebas; esta fase no presenta el rendimiento como validado.

Para B05.4C.2D:

1. Autorizar expresamente conexión real, fuente/custodia temporal y receptor/conector revisados; confirmar roles mínimos y restricción de clúster/IP con el operador, sin administrador/twosides_backend. Aprobar la ruta privada y riesgo B00 por separado.
2. Ejecutar primero factory con allowWrites=false, conector real revisado y canal manual, sin provisionar colecciones. Registrar solo resumen de destino/permisos o código de error sanitizado. Cerrar si hay incongruencia, permisos excesivos o información incompleta; no probar otras bases.
3. Si lectura/permisos son correctos, entregar esa evidencia antes de habilitar escrituras expresamente autorizadas. D no se presume autorizada por este documento ni por Compass.
4. Antes de crear índices o insertar: resolver el bloqueo de identidad durable o limitar explícitamente la subfase sin declararla validación completa de autorización/revocación; comprobar colecciones nuevas/libres y manifiesto runId. Autorizar allowWrites y provisión de esos namespaces concretos.
5. Solo entonces preparar pruebas sintéticas pequeñas, recibos, retries, dos procesos propios, reinicio Node y limpieza por IDs exactos del manifiesto. No alterar servidores Atlas, datos anteriores, base principal o índices ajenos. Detenerse ante cuotas/tiempos inesperados y no convertir un error simulado en prueba de commit incierto real.

## Integridad y cierre

Las tres bases protegidas se comparan por SHA-256, tamaño, mtime, propietario y SDDL contra el inicio, sin SQL ni uso de sus operaciones como fixtures. `.env` no se consulta, abre ni hashea y queda bloqueado por las guardas de tests; no se anuncia una nueva certificación de su contenido. No modificación de ACL, propietarios, herencia, datos reales, AWS o paquetes.

**B05.4C.2C COMPLETADA EN CÓDIGO SINTÉTICO. Integración Mongoose/Atlas NO VALIDADA. B00 e identidad durable pendientes. B05.4C.2D/B05.5 no iniciadas. Trabajo detenido.**

### Verificación final B05.4C.2C

Tras la última revisión de la política: 80/80 casos Atlas/Mongoose focalizados aprobados (36 nuevos y 44 regresiones), además de la batería completa de 271/271 indicada arriba. No se suman esos 80 de nuevo. Gates de 63 vectores y vínculo/revocación aprobados. No conexiones Atlas, contraseñas reales o pruebas remotas.

Inventario final: 1408 → 1415 archivos fuera de .git/.work/node_modules/.godot/.npm-cache y nombres .env excluidos; 7 nuevos, 10 existentes modificados, 0 eliminados. Los 1398 archivos anteriores restantes conservan su SHA-256. Los 17 cambios deliberados están únicamente en backend y coinciden con el inventario descrito: siete archivos nuevos, dos archivos de código existentes y ocho documentos directamente afectados. No cambios de app/server/package/lockfile o Godot.

Las tres bases protegidas conservan SHA-256, tamaño, mtime, propietario y SDDL frente al inicio. .env no se consultó ni hasheó, y no se certifica aquí su contenido. Cero procesos Node/mongod/Godot/exportador/comprobador y cero carpetas identity-d2-* de ensayo al cerrar. B00 permanece pendiente. B05.4C.2D y B05.5 no iniciadas; trabajo detenido.
## B05.4C.2D.1 — Diagnóstico real de solo lectura bloqueado

2026-10-28. **BLOQUEADA / NO COMPLETADA.** El usuario activó dos canales privados; ambos terminaron con atlas_connection_unavailable antes de verificar autenticación/destino/permisos. Resúmenes no secretos conservados por ejecución, cierre indicado y cero escrituras/transacciones. No presentar Compass o la entrega del canal como conexión Mongoose satisfactoria.

Se corrigió una incompatibilidad local del factory: el driver rechaza tlsInsecure junto a tlsAllowInvalidCertificates/Hostnames aunque sean false. Se retiró el flag redundante conservando TLS estricto y se endureció la comprobación de sus opciones normalizadas. Los constructores reales sin connect comprueban esa corrección. El segundo fallo sigue sin causa concreta determinada por su resumen sanitizado. DNS SRV Windows/Node y un handshake TLS independiente del clúster autorizado resultaron satisfactorios sin credenciales; no acreditan autenticación.

35 pruebas sintéticas distintas aprobadas: 13 nuevas de diagnóstico/driver sin red + 22 regresiones de lectura/configuración. 14 casos excluidos por filtro, sin ejecutarlos ni contarlos como aprobados; las 271 anteriores no se reejecutaron completas. El sender bloquea ahora un resultado existente antes del prompt para evitar pedir otra contraseña en un run consumido. No credenciales reales en chat, args, env o archivos; no .env, Godot, índices, modelos, identidades o usuarios remotos modificados. B00 e identidad durable pendientes.

[Resultado completo, evidencias, corrección y límites](B05_ATLAS_READONLY_CONNECTION_RESULT.md). Un diagnóstico posterior deberá categorizar errores sin secretos y preservar las barreras; no autorización implícita de escrituras o transacciones. D.2 y B05.5 no iniciadas; trabajo detenido.