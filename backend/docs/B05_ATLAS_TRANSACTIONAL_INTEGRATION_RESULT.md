# B05.4C.2D.2E — Integración transaccional real Mongoose/Atlas

2026-10-28, America/Guatemala. **VALIDADA LA INTEGRACIÓN TRANSACCIONAL EN EL ENSAYO SINTÉTICO ACOTADO D.2E.** Preflight/índices, commit, abort controlado, recibo, idempotencia, conflicto y persistencia tras reconexión verificados; limpieza transaccional y cierre correctos. Ver Resultado real final. Las secciones de preparación siguientes conservan la planificación histórica; los estados pendientes quedan sustituidos por ese resultado. No validación completa de B05.4C.2 ni de revocación durable/concurrencia. Sin Godot, B05.5 o AWS.

## Preflight y autorización

Se revisaron FIRST_WRITE_RESULT, LISTCOLLECTIONS_ALTERNATIVE_RESULT, PERSISTENCE_INTEGRATION_RESULT, MONGODB_ADAPTER_IMPLEMENTATION, ATLAS_INTEGRATION_MODE y REMOTE_INGESTION_TEST_PLAN bajo backend/docs, junto a modelos/repositorio/motor/fence y contratos reales. La autorización D.2E amplía expresamente el alcance a los dos índices, controles sintéticos, operación transaccional, recibo, abort seguro, idempotencia y reconexión. No autoriza concurrencia ni resolver el diseño de identidad.

Destino fijo: TwoSidesCluster, <cluster>.<id>.mongodb.net, twosides_integration_test, two_sides_integration_test, admin y DEFAULT. TLS estricto, sin bypass. Cada conexión valida host/Db/usuario/authSource/mecanismo y privilegios efectivos. Antes de toda preparación se ejecutará la consulta aceptada `{listCollections:1,authorizedCollections:true,nameOnly:true}`, sin filter; se exige cursor terminado, cobertura listCollections/find de toda la base y cero colecciones. Si hay cualquier namespace preexistente, se detiene sin inspeccionar documentos ajenos ni escribir.

Se revisaron los [límites oficiales Free](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/) y el [contrato de transacciones](https://www.mongodb.com/docs/manual/core/transactions/). Ensayo pequeño, sin carga/failover o cambios de plan; límites del adaptador conservados. Cuotas/compatibilidad del servidor se comprobarán solo mediante los resultados reales. Un rechazo detendrá las etapas dependientes, sin desactivar atomicidad. El callback transaccional del driver puede reintentarse conforme a su contrato, con IDs estables y presupuesto existente; no hay reintento externo del procedimiento.

## Implementación preparada

- atlas-policy.js admite la capacidad exacta persistenceTest B05.4C.2D.2E con DEFAULT/allowWrites true; el modo común DEFAULT sigue sin autorizar escrituras sin capacidad.
- mongo-models.js aplica a E las mismas marcas requeridas e inmutables integrationRunId/syntheticOwnerId. Sin cambios de sobres canónicos o modelo productivo.
- scripts/atlas-transactional-suite.js implementa la secuencia acotada y mantiene la ruta real IngestionService/MongoIngestionRepository, con el fence de autorización real.
- scripts/atlas-transactional-receiver.js verifica manifiesto/hashes y ejecuta una vez esa suite sin trabajadores o suite de concurrencia.
- scripts/send-atlas-transactional-credential.ps1 deriva del canal revisado, switch AuthorizedForB054C2D2E, marcador/resultado transactional y límite del hijo 120000 ms.
- tests/sync/atlas-transactional.test.js añade cinco ensayos T01–T05; este informe.

autoCreate/autoIndex false; no syncIndexes. Lecturas/escrituras automáticas del cliente reintentables desactivadas en el arnés; las transacciones conservan el mecanismo del adaptador. Se prevén dos conexiones secuenciales propias, nunca en paralelo. No app/server/npm run dev, endpoints públicos o configuración principal.

## Colecciones e índices fijados antes de conectar

RunId: **0e803b0278594116a83894c04fb10c53**. Colecciones según atlasCollections del contrato existente:

- b054c2c_0e803b0278594116a83894c04fb10c53_ops
- b054c2c_0e803b0278594116a83894c04fb10c53_facts
- b054c2c_0e803b0278594116a83894c04fb10c53_fence
- b054c2c_0e803b0278594116a83894c04fb10c53_authorization

Únicos índices secundarios previstos: owner_operation_unique, claves technicalAccountId:1/operationId:1, unique true en ops; scope_source_unique, claves scope:1/sourceKey:1, unique true en facts. Se comparan las declaraciones y opciones del esquema antes de crear colecciones; se inspeccionan los índices presentes en los namespaces nuevos, se rechaza todo índice inesperado y se verifican los dos creados. Índice _id estándar de cada colección permitido; no eliminaciones/reemplazos.

Se preparan los controles global ingestion-v1 y de sesión ficticia, ambos marcados; la operación de ingestión crea un hecho y una operación con recibo embebido dentro de la transacción existente. Sin inserción manual sustitutiva de la operación. IDs/propietario/colecciones se guardan en synthetic-manifest.json antes de escribir; sin secreto/JWT/claves/verificadores.

## Secuencia real prevista — pendiente

1. Autenticación/privilegios y preflight sin filtro, vacío y completo.
2. Cuatro colecciones nuevas; dos índices secundarios exactos fuera de transacción.
3. Controles sintéticos; una operación session.report válida mediante adaptador real, comprobando relación hecho/operación/recibo/payload.
4. Abort controlado: otra operación ficticia; el hook del arnés ejecuta el fence real y provoca rechazo antes del commit. Se comprueba ausencia de recibo y que todo el inventario, incluidas revisiones de controles, permanece igual. No simula una caída de Atlas ni una revocación durable.
5. Reenvío de la operación confirmada: duplicate y mismo recibo, sin efecto duplicado. Mismo ID contradictorio: 409 sin recibo.
6. Cierre ordenado, nueva conexión y lectura de los cuatro registros/recibo para comprobar persistencia. Misma identidad ficticia en memoria, no reinicio del proceso ni recuperación durable de identidad.
7. Inventario/IDs/propietario verificados; limpieza atómica de exactamente cuatro documentos por _id más ambas marcas, con relectura transaccional comparada al inventario. No drop/deleteMany ni filtros vacíos. Índices y colecciones vacías se conservan.

Si una puerta falla o el commit es incierto, detenerse y conservar los registros. Las consultas amplias del adaptador/inventario se limitan a los cuatro namespaces exclusivos creados tras el preflight, sin acceso a documentos ajenos. Una carrera externa o sistema comprometido no queda excluido de manera absoluta por esta comprobación puntual.

## Canal privado y pruebas offline

Directorio nuevo: C:/Users/luis2/AppData/Local/TwoSides/AtlasIntegrationTests/b054c2c-0e803b0278594116a83894c04fb10c53/.

Receptor SHA-256: 9F09EF6149ED0B51FEDC624C8B3928E4E03052BA0AE1C2EC83B9A4EB10507F4C.

Sender SHA-256: AC0DCCCDE58E1A6503EA82F7A3AB215CC16C141436E32F8D03D7034206AE8FCE.

Manifiesto E nuevo, 59 dependencias verificadas, DEFAULT, escrituras acotadas autorizadas, TLS obligatorio, una invocación y ConcurrencyAllowed false. Owner/Allow limitadas al usuario/SYSTEM/Administradores y ausencia de enlaces comprobados sin cambiar ACL. No resultado/marcador al preparar. Fuente/copia/sintaxis verificadas. Solo activación manual con entrada oculta; sin Compass, .env, URI/argv/env/archivos de contraseña. El agente no inicia otro receptor. Marcador transactional-attempt.started exclusivo bloquea reutilización.

**173 pruebas offline aprobadas, once archivos, cero fallidas/omitidas: cinco T nuevas y 168 regresiones.** T verifica capacidad, rechazo de metadatos incompletos/existentes, índices exactos, propiedad/inventario de limpieza y modelos reales sin autoIndex/autoCreate. Regresiones del adaptador prueban commit/abort/idempotencia con dobles, no demuestran todavía Atlas. JS revisados y parser PowerShell sin errores.

## Identidad, protección y resultados pendientes

La identidad/credencial/claves del fixture son ficticias y permanecen en memoria. El control Mongo de sesión corresponde a ese contexto validado y el fence real sigue activo. No se usa un callback permisivo ni se presenta copiar controles de un fixture como coordinación durable. La prueba permite validar almacenamiento transaccional acotado; revocaciones multiinstancia/entre repositorios siguen pendientes.

Se registraron SHA-256/tamaño/mtime UTC/owner/SDDL de las tres bases protegidas para comparación final, sin SQL. backend/.env no se abre ni hashea. No Godot, datos Outbox reales, ACL/propietarios, usuarios/roles Atlas, base principal, proyecto original o AWS.

El resultado real de esos criterios se documenta a continuación; las 173 pruebas offline no sustituyen esta evidencia. No validar B05.4C.2 completa; B00 continúa pendiente y B05.5 no iniciada.

## Resultado real final — D.2E

Registro: **28 de octubre de 2026 a las 23:08:31, Guatemala**, UTC 2026-10-29T05:08:31.059Z. El usuario confirmó ejecución manual una vez del sender/receptor nuevos y su salida genérica. El agente no ejecutó otro receptor, conexión o prueba remota posterior; leyó transactional-result.json sanitizado y los identificadores no sensibles del manifiesto sintético.

| Criterio | Resultado observado |
|---|---|
| Estado/etapa | completed / completed |
| Autenticación | verified; DEFAULT solicitado |
| Identidad/destino | twosides_integration_test, two_sides_integration_test, host previsto; validaciones del cliente y política aprobadas |
| Privilegios | readWrite limitado a la base; listCollections/find de toda la base verificados para metadatos |
| Preflight sin filter | passed-empty-database; cursor completo y ninguna colección preexistente |
| Colecciones | Las cuatro exclusivas enumeradas en la preparación, creadas por esta ejecución |
| Índices secundarios | Los dos autorizados creados e inspeccionados correctamente |
| Operación del adaptador | Commit confirmado mediante IngestionService/MongoIngestionRepository reales |
| Contenido/relaciones/recibo | receiptMatchesStoredContent true |
| Abort controlado | abort true; ningún recibo para operación abortada; inventario sin cambios frente al estado previo |
| Idempotencia | true; reenvío devuelve duplicate y conserva recibo/efecto |
| Contradicción mismo ID | conflict true; 409 sin recibo |
| Reconexión | persistedAfterReconnect true |
| Limpieza | cleanupCommit true; four-owned-documents-deleted |
| Índices conservados | indexesRetained true |
| Cierre | closed true |
| Concurrencia | concurrencyExecuted false |
| Errores remotos inesperados | Ninguno registrado |

### Índices y topología

En ops se creó owner_operation_unique, unique true, sobre technicalAccountId:1 y operationId:1. En facts se creó scope_source_unique, unique true, sobre scope:1 y sourceKey:1. Se verificaron esquemas y autoIndex/autoCreate false antes de preparar; se contrastaron índices presentes y se rechazaban opciones/nombres extraños. No syncIndexes, reemplazo o borrado de índices. Los cuatro índices _id estándar también se conservan junto con las colecciones vacías.

El repositorio real verificó replica set/primary y los índices requeridos. La ejecución demuestra compatibilidad de las operaciones transaccionales efectivamente realizadas en este clúster/instante, con las opciones existentes de snapshot y majority/journal. No prueba todas las capacidades M0, rendimiento, failover, límites globales o recuperación de caída abrupta. No se modificó el plan del clúster ni se eludió una restricción.

### Documentos y recibos sintéticos

Cuenta ficticia: 6d385a38-d6a2-4b9e-8d08-c2d470aa8e14.

Operación confirmada: 7b8713f0-db40-44aa-b201-cb32533fd4e4.

Recibo confirmado: 9fa5a4d2-2945-4d62-badf-2bff81def98a.

Operación de abort controlado: dd34a16a-f2f9-4453-88ed-9957c51ba6da, sin operación/hecho/recibo persistido.

El manifiesto previo identifica propietario, vínculo, IDs, colecciones y marcas únicas. La transacción confirmada persistió exactamente un hecho session.report sintético y una operación con recibo embebido; también actualizó los controles global y de autorización. El arnés verificó claves internas/externas, factKey, hash del sobre y reconstrucción del contenido canónico contra la entrada sintética, además de correspondencia entre recibo/operación/cuenta. No se generó un recibo manual independiente.

El abort se indujo por un hook exclusivo del arnés después de ejecutar el fence real, antes de confirmar. La operación abortada llegó a la ruta transaccional completa; el rechazo controlado 401 no produjo recibo y la comparación del inventario completo antes/después confirmó rollback, incluidas revisiones de controles. Esto no equivale a un fallo real de credenciales Atlas ni a prueba de revocación durable.

El reenvío idéntico conservó el recibo original y un solo hecho/operación; el contenido contradictorio con el mismo ID dio conflicto sin recibo. Tras cerrar y abrir una nueva conexión autorizada, se volvieron a verificar los cuatro registros y su relación/recibo. El proceso Node y la identidad ficticia permanecieron vivos durante la reconexión; no se declara reinicio del proceso ni recuperación de identidad.

### Limpieza efectivamente completada

Antes de eliminar se verificó exactamente un documento esperado en cada colección, con _id permitido, integrationRunId y syntheticOwnerId iguales al runId, propietario ficticio coherente y relaciones válidas. El inventario de IDs se guardó antes de limpiar. Dentro de una única transacción se releyó y comparó cada documento con el inventario, y se usó deleteOne con _id exacto más ambas marcas. Se confirmó la limpieza y se verificó cero documentos en las cuatro colecciones exclusivas.

Se eliminaron exactamente: la operación confirmada, su hecho, el control ingestion-v1 y el control de autorización ficticio. No se borró el abort porque no persistió. La limpieza atómica preservó la relación hecho/operación/recibo; no filtros vacíos, deleteMany, dropDatabase/dropCollection o borrado de otra ejecución. **Cuatro colecciones vacías y sus índices permanecen**; deben reconocerse como artefactos de este runId en futuros preflights, sin atribuirles propiedad de datos por el nombre solamente.

### Credenciales, recursos e integridad

Las 59 dependencias y receptor conservan exactamente sus hashes del manifiesto después del intento. El sender conserva AC0DCCCDE58E1A6503EA82F7A3AB215CC16C141436E32F8D03D7034206AE8FCE. Marcador transactional-attempt.started presente y resultado de un uso conservado. No reutilizar el canal ni borrar marcadores para reintentar.

Se conservan seis artefactos privados: sender, receptor, preflight-manifest.json, synthetic-manifest.json con IDs/recibo/inventario no secretos, marcador y resultado sanitizado. Sin archivos de contraseña/JWT/claves/verificadores. El secreto de integración solo viajó por entrada oculta/stdin/RAM; no Compass, .env, URI/argv/env o repositorio. Buffers/BSTR controlados liberados; no se garantiza borrado de strings inmutables del GC. No se recibió ni mostró el valor del secreto en el chat.

Todas las conexiones propias cerraron. No quedan procesos Node. No se ejecutó una batería real de concurrencia ni procesos trabajadores. Las 173 pruebas offline son un conjunto separado de regresión, no operaciones Atlas adicionales.

Las tres bases protegidas conservan **exactamente SHA-256, tamaño, mtime UTC, propietario y SDDL** frente al inicio de D.2E: runtime local-persistence/.work/runtime-game/save.sqlite3 y game-progress/save.sqlite3/persistence/save.sqlite3 bajo AppData/Local/TwoSides/ReconstructionTests/copy-06dc7ade-b3cd-425b-8d79-90dde8ef1ac6. Comparación binaria/metadatos sin SQLite/SQL.

backend/.env no se abrió, consultó, hasheó o modificó; no se certifica nuevamente su contenido. No cambios de Godot, ACL/propietarios, usuarios/roles Atlas, datos ajenos, base principal o configuración principal. No Outbox real, npm run dev o AWS. Las escrituras fueron únicamente la preparación/operación/controles/abort/limpieza sintéticos autorizados y los dos índices secundarios de las colecciones nuevas.

## Conclusión y siguiente subfase

**Los criterios de aceptación de D.2E se cumplen dentro de este ensayo sintético acotado:** preflight satisfactorio, índices seguros, operación mediante adaptador real, commit y persistencia tras reconectar, recibo coherente, idempotencia/conflicto, limpieza segura y protección de credenciales/datos ajenos. Abort controlado adicional comprobado.

Esto no finaliza B05.4C.2 completa ni habilita producción. La identidad sigue en repositorio sintético separado y no se acreditan revocación durable entre procesos, concurrencia real, respuesta perdida, reinicio Node, cambios de época durante commit o tolerancia a fallos abruptos. B00 continúa pendiente.

Se recomienda una subfase separada que delimite las garantías pendientes de identidad/revocación y, si se autoriza posteriormente, concurrencia/reinicio/respuesta perdida con namespaces nuevos y reconocimiento seguro de las colecciones vacías conservadas. No reutilizar la ausencia global de esta ejecución como garantía futura, ni relajar el preflight porque ahora existan esos artefactos. No ejecutar más conexiones o pruebas hasta nuevas instrucciones.

**D.2E finalizada con éxito acotado. Trabajo detenido. No B05.5, datos reales, base principal, Godot o AWS.**
