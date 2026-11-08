# B05 — Plan de ejecución C.2 en Windows

Fecha: 2026-10-29. Actualizado por el cierre offline de límites operativos C.2.

**Límites operativos COMPLETADOS EN CÓDIGO, con validación offline. C.2 no está habilitada para conexión. B00 pendiente, F.2 bloqueada y B05.5 no iniciada.** El cierre actual está en [B05_C2_WINDOWS_OPERATIONAL_LIMITS_RESULT.md](B05_C2_WINDOWS_OPERATIONAL_LIMITS_RESULT.md). El informe funcional previo se conserva como antecedente histórico de su resultado PARCIAL.

## Código preparado y dependencias

El entrypoint sigue siendo `scripts/durable-revocation-atlas-harness.js` (rutas relativas a backend). `executeDurableAtlasRun()` sigue rechazando toda activación antes de usar un conector o credencial. No hay comando C.2 en package.json, conector por defecto ni receptor C.2 vigente. No reutilizar canales consumidos.

El supervisor inyectado está en `scripts/durable-revocation-runtime.js`: no tiene conector por defecto ni recibe credenciales. El arnés aplica sus controles al preflight, registro, escenarios, reapertura, inventario y limpieza; rechaza clientes Atlas preabiertos fuera del supervisor. Solo los dobles estrictamente loopback pueden adoptarse sin abrirse mediante la fábrica supervisada.

El arnés utiliza MongoIdentityRepository, MongoIngestionRepository, IngestionService, JwtService y resolveSyncContext. Los archivos de implementación incluyen `src/modules/auth/{mongo-identity-repository,mongo-identity-models,jwt-service}.js`, `src/modules/sync/{mongo-ingestion-repository,mongo-models,ingestion-service,atlas-policy,atlas-integration,canonical-envelope,schemas}.js`, `src/middleware/sync-auth-context.js` y `src/config/jwt.js`. La importación dinámica interna de mongo-identity-repository resuelve sync-auth-context.

Versiones observadas en esta fase: Node 24.19.0, Mongoose 9.11.2, driver MongoDB 7.7.0, jose 6.2.13, Zod 4.6.7, Argon2 2.2.2 y Vitest 5.0.5. Se leyeron metadatos de los paquetes instalados; no se instalaron ni actualizaron dependencias. Esto no acredita su procedencia ni la inmutabilidad del árbol.

SHA-256 puntual del arnés: `05F0FB304D3E9DA248B56B24C4284D865A4082474507F2C828D6EF95F8294889`. Supervisor: `C9E097486F9F457BB116CE9345D86E4681F58B7ADFCD2413CE409CA3DFD11CBA`. Estas huellas proceden del árbol modificable y no son raíces de confianza.

## Esquema e inventario preparado

El runId de esquema es fijo: `10ef4f6d653f4ee4a1d1b2e6591013c2`. Cada plan genera además un executionId y bindings, operaciones y comandos UUID nuevos. executionId es contexto local de ejecución; no se añade una marca nueva a cada documento ni se migra el esquema. La pertenencia se determina por el registry opaco de IDs/propietarios y el contenido exacto.

El catálogo esperado son las cuatro colecciones D2E conservadas más las ocho C.2A. Sus nombres exactos se construyen desde los runId históricos fijados en el arnés. La enumeración exige coincidencia completa, cursor cerrado y ausencia de duplicados. Los conteos 12 colecciones/19 índices observados en Compass no sustituyen esos controles.

Se verifican los cinco índices secundarios C.2A y los _id estándar de sus ocho colecciones, sin DDL. Los índices son owner_operation_unique, scope_source_unique, identity_registration_unique, identity_binding_unique e identity_token_unique. No inspeccionar documentos de las cuatro colecciones D2E ni recrear estructuras. durableProvisionSteps ahora devuelve cero creaciones y ningún seed.

El fence está en `b054c2c_10ef4f6d653f4ee4a1d1b2e6591013c2_fence`: `{_id:'ingestion-v1',revision:0}` según el resultado histórico C.2A. Es global a ese ensayo, sin propietario de jugador ni bindingGeneration. Los ownerGuards son documentos distintos, por technicalAccountId. El arnés exige inventario inicial exacto: ese único fence y las otras siete colecciones vacías, antes de permitir registros sintéticos. La comprobación actual es offline; su vigencia en Atlas queda **PENDIENTE DE VERIFICACIÓN REMOTA**.

## Escenarios y coordinación

A mantiene una ingesta autorizada con snapshot pendiente antes del write al guard, confirma la revocación y libera la ingesta. Se exige rechazo sin hecho/recibo aceptado y que el reintento rechace la identidad revocada.

B mantiene pendiente la revocación, confirma primero la ingesta y después la revocación. Se comprueba la revisión durable de operación menor que la de revocación, conservación del recibo histórico y rechazo del duplicado con token revocado.

C simula pérdida de respuesta solo cuando se ejecutó el hook posterior al commit confirmado. Recupera el recibo por ID estable, rechaza binding ajeno, desvincula y vuelve a rechazar el token. Si el hook no se ejecutó, un 503 o commit incierto detiene el escenario: no se reintenta como si hubiera sido una pérdida conocida.

Se reabre un cliente lógico para comprobar revocación y recibo durable. Los dobles no demuestran snapshots, conflictos o durabilidad del servidor real. El orden se verifica por estado/revisiones; si falta evidencia suficiente, el caso es inconcluso.

Identidad e ingesta comparten ClientSession mediante AsyncLocalStorage. Ambas rutas modifican el guard del propietario; ingesta modifica además el fence global. Cada callback reintentado vuelve a autorizar. Se conservan las transacciones snapshot/majority y el mecanismo JWT, sin sustituirlo por una validación aislada del token.

## Límites efectivos y pendientes

Se conservan tres bindings, ocho envíos (A dos, B dos, C cuatro), dos tareas simultáneas, tres intentos de callback y ahora hasta tres invocaciones nativas de commit por transacción. El servicio mantiene 2 s por operación, transacción 10 s, commit 1 s y barrera 1 s. Cada escenario está supervisado a 30 s. El presupuesto global de 120 s reserva 4 s para cierre: a los 116 s se bloquea nuevo trabajo, se activa AbortSignal y se solicita abort/endSession/close(true), con hasta 2 s por fase de cierre. Los presupuestos solo pueden reducirse, no ampliarse.

Hay hasta tres clientes lógicos durante toda la ejecución, reservados antes de llamar a la fábrica. Cada pool tiene maxPoolSize=2 y maxConnecting=1, minPoolSize=0, retryReads/retryWrites=false y timeoutMS=10000. El límite del pool es por servidor y cliente; no es una cifra total de sockets físicos, incluidos los de monitorización. La reapertura consume el tercer cliente y los dos actores iniciales siguen siendo independientes.

El inventario final exige 17 documentos: 16 propios y el fence preexistente, dentro del techo 24. Las tres sesiones de identidad son documentos distintos de ClientSession. El supervisor reserva hasta dos ClientSession explícitas y dos implícitas simultáneas, con techos de 18 explícitas y 256 implícitas por ejecución. Intercepta la apertura Mongoose y nativa, evita contarlas dos veces y libera cupos al confirmar endSession. Un exceso falla cerrado antes de abrir otra sesión. Las explícitas solo pueden usar transacciones supervisadas. Los cupos controlan recursos del cliente, no el TTL de identificadores conservados por el servidor.

Las consultas compatibles reciben AbortSignal. Los writes usan el timeout transaccional/driver y cierre forzado del cliente, sin atribuirles una cancelación que la API no garantiza. Dentro de withTransaction no se añade timeoutMS explícito a cada operación: el driver 7 lo rechaza y debe heredar el plazo transaccional. Una escritura nativa puede seguir en curso o confirmar después del vencimiento; se conserva su seguimiento y una marca de incertidumbre que no desaparece por un resultado tardío. Con esa marca o un write pendiente no se permite limpieza. El supervisor no mata el proceso Windows, no puede interrumpir código síncrono que bloquee el event loop ni demuestra rollback por cerrar un cliente.

La fábrica Atlas genérica conserva sus opciones históricas. El futuro conector C.2 debe usar la fábrica supervisada y sus opciones comprobadas, sin rutas de apertura alternativas. La política Atlas todavía no admite la capacidad de datos C.2 y executeDurableAtlasRun permanece bloqueado. No se deben reutilizar D2E/schema-only para eludirlo.

## Verificación y limpieza

Tras A/B/C y reapertura satisfactorios, validar ocho namespaces, IDs exactos, owners, bindings, sesiones, comandos y relaciones entre hecho/operación/recibo. El snapshot se vuelve a comparar dentro de la transacción antes del primer delete. La limpieza elimina únicamente las 16 filas propias mediante deleteOne por _id y technicalAccountId cuando existe. Conserva las doce colecciones, sus índices y el fence con su revisión final; nunca lo elimina ni lo reinicia.

Si el fence cambia entre captura y limpieza, hay una fila inesperada, falla un escenario, se agota un presupuesto, hay un commit incierto o se pierde el registry, no efectuar limpieza automática. Conservar evidencia sanitizada y preparar recuperación separada. No usar drop, filtros vacíos o prefijos como prueba de propiedad. Un nuevo plan seguirá exigiendo el estado inicial C.2A; después de un ensayo que avance el fence no se debe reiniciarlo para facilitar otra ejecución.

## Seguridad Windows y credenciales futuras

Destino único: <cluster>.<id>.mongodb.net, twosides_integration_test, two_sides_integration_test, authSource admin, DEFAULT y TLS estricto. Verificar identidad autenticada y permisos efectivos, además de URI/dbName. La consulta de catálogo es listCollections con authorizedCollections=true y nameOnly=true, sin filter. No acceder a two_sides_db ni usar twosides_backend, administradores, perfiles reales u Outbox runtime.

B00 continúa abierto: el informe previo describe SID no resueltos con Modify/Synchronize heredados por código/dependencias, además del riesgo de otros procesos del mismo usuario y rutas redirigidas de OneDrive/Desktop. No se consultaron ACL en esta fase. El usuario Atlas es independiente de la identidad de Windows. Hashes, LOCALAPPDATA o aceptar pérdidas de datos no acreditan privacidad o protección frente a sustituciones.

Antes de una autorización real: cerrar los pendientes funcionales, justificar control de acceso/procedencia e integridad durante toda la ejecución y verificar ausencia de sustitución/enlaces. Solo entonces preparar un receptor/manifiesto nuevo y de uso único fuera de OneDrive/Git. El usuario introduciría el secreto únicamente en prompt oculto; tránsito por stdin/RAM, nunca archivos, argumentos, historial o logs. No crear ni activar canal ni solicitar contraseña en esta fase.

No cargar backend/.env: la ruta revisada usa configuración explícita; assertNotProduction consulta NODE_ENV del proceso. El futuro lanzador deberá evitar cargadores de entorno y seleccionar explícitamente la configuración permitida. Un hash no certifica privacidad y no se promete borrado perfecto de strings en RAM.

## Pruebas y condiciones para continuar

Se aprobaron 187 pruebas únicas: 29 nuevas y 158 regresiones. El pase principal aprobó 186 y dejó fuera DR16/A36; DR16 aprobó en una ejecución individual con IPC local fuera del sandbox. A20 se reincorporó tras verificar su rechazo antes del I/O; A36 sigue excluida y OL19 cubre el rechazo del entrypoint C.2 antes de consumir secretos. El informe operativo detalla los fallos intermedios corregidos y las limitaciones. No se ejecutaron private-workspace.ps1, Get-Acl, una batería general, receptores de credenciales ni Atlas.

La siguiente autorización de conexión requiere una capacidad C.2 revisada y composición exclusiva del ejecutor con el supervisor, inventario/fence e índices revalidados remotamente antes de escribir, canal privado justificable frente a B00, recuperación acotada y autorización expresa para los escenarios. F.2 y B05.5 siguen fuera del alcance. No modificar .env, SQLite, Godot, ACL ni propietarios.
