# B05.4C.2D.2B — Preflight real de listCollections, solo lectura

2026-10-28, America/Guatemala. **SESIÓN REAL FINALIZADA: resultado D, UNSUPPORTED_METADATA_FILTER, MongoServerError 8000.** Autenticación, destino y permisos listCollections/find comprobados; una consulta original, cero alternativas/escrituras/transacciones y cierre correcto. Ver Resultado final al cierre. Las secciones iniciales conservan la preparación histórica; sus estados pendientes quedan sustituidos por el resultado final.

## Preparación y alcance

Se revisaron diagnóstico listCollections, resultado de persistencia, resultado DEFAULT y modo de integración, junto al helper, política, conector, clasificador y canal implementados. El adjunto reiterado mantiene el mismo alcance y no autoriza una segunda sesión. El resultado remoto anterior sigue siendo MongoServerError 8000 en namespace-preflight, con cero escrituras y causa específica desconocida.

Destino exclusivo: <cluster>.<id>.mongodb.net (TwoSidesCluster), twosides_integration_test, two_sides_integration_test, authSource admin, DEFAULT y TLS estricto. No cambios de roles o acceso a two_sides_db. Se verifican conexión real, identidad y permisos; dbName no es la única barrera.

## Implementación revisada

Nuevo src/modules/sync/atlas-listcollections-probe.js: opt-in, allowWrites false, sin creación de modelos/repositorio. Usa factory/conector revisados, verifica privilegios y presencia específica de listCollections/find a nivel de base, ejecuta una sola invocación de la consulta original y cierra. retryReads false evita el reintento automático del driver; timeoutMS 5000 acota las operaciones, junto a selección/conexión 10000 ms y límite del sender 30000 ms. Sin consultas ping/hello/buildInfo adicionales del arnés; se conserva el descubrimiento interno normal del driver.

Nuevo scripts/atlas-listcollections-receiver.js: separado del receptor de persistencia; exige Phase D.2B, Strategy original, RetryReads false, MaxListCollectionsInvocations 1, AllowWrites false y TLS estricto. Marcador readonly-attempt.started exclusivo y hashes antes de consumir la entrada. No importa ni ejecuta la suite de escritura D.2.

Consulta prevista: Db autorizado, listCollections con filtro name.$in de los cuatro nombres generados por atlasCollections(runId), nameOnly true y authorizedCollections false normalizado por el driver. No se registrarán nombres devueltos; solo cantidad/ausencia dentro del conjunto permitido. Una colección ajena o respuesta inesperada detiene la validación sin mostrar su nombre.

Se amplió atlas-error-diagnostic.js con firmas fijas limitadas a etapa list-collections y código numérico 8000: UNSUPPORTED_METADATA_FILTER, UNSUPPORTED_METADATA_COMMAND y AUTHORIZATION_FAILURE para prefijos reconocidos. No conserva ni devuelve mensajes originales/subcadenas. Firmas no reconocidas mantienen UNKNOWN_CONNECTION_FAILURE. Esto no predice la causa del intento pendiente ni modifica errores públicos de API.

Clasificación prevista: A consulta original correcta; B permiso necesario ausente; C autorización rechazada; D otro error clasificado; E 8000 aún desconocido. La etiqueta A no implica persistencia, ni ausencia si existen candidatos.

## Pruebas offline

**162 aprobadas, cero fallidas/omitidas, nueve archivos: diez Q nuevas y 152 regresiones.** Incluye adaptador con dobles, permisos/aislamiento, canal sintético y construcción del comando con driver instalado. Q01–Q10 comprueban una sola consulta, ausencia de alternativa/modelos/escrituras, falta de permiso, 13/8000, firmas sanitizadas acotadas, configuración inválida, transmisión real a Mongoose de retryReads false/timeoutMS/TLS/identidad, respuesta fuera de ámbito y fallo de cierre. Conexiones reales interceptadas antes de red. Sintaxis Node de receptor/probe aprobada y parser del sender privado aprobado.

## Canal privado de esta ejecución

Directorio: C:/Users/luis2/AppData/Local/TwoSides/AtlasIntegrationTests/b054c2c-86b1d8395fdf4164a42b9186b2a7a4ef/.

RunId: 86b1d8395fdf4164a42b9186b2a7a4ef.

Receptor SHA-256: F7051DF0E32F29169686D7E6C3716248BB4C9B856F9AAD39214748E5C9B87F0B.

Sender SHA-256: B13FC5429F90F42886CA0F0C890745CF936A62192A44FF34557264A3690C34C6.

Fuera de OneDrive/Git; propietario/Allow limitadas a usuario actual/SYSTEM/Administradores y ausencia de reparse points en ancestros comprobados en lectura. Sin modificaciones de ACL/propietarios. Copias comparadas con fuentes revisadas y manifiesto nuevo de nueve dependencias verificado. Al preparar el canal no existían marcador ni resultado.

El comando exacto fue presentado mediante pregunta de activación manual. La contraseña solo puede introducirse en el prompt oculto; no en chat, URI, argv, entorno o archivos. No lectura de Compass/backend/.env ni reciclaje de manifiestos anteriores. El sender usa el nombre histórico AuthorizedForB054C2D, que no sustituye la autorización actual. El agente no inicia otro receptor. No repetir aunque falle y no borrar marcadores para reintentar.

## Resultado e integridad pendientes

Activación manual, autenticación, permisos efectivos, consulta original y cierre: **PENDIENTES**, no acreditados todavía. No ejecución de alternativa. No escrituras ni transacciones iniciadas por el agente.

Se registró antes del intento SHA-256, tamaño, mtime UTC, propietario y SDDL de las tres bases protegidas, sin SQL; se compararán al terminar. backend/.env no se abrió, consultó ni hasheó. No cambios Godot, usuarios Atlas, colecciones/índices, ACL, propietarios o configuración principal. B00 y coordinación durable de identidad/revocación siguen pendientes.

La preparación anterior se cierra con el siguiente resultado real. No continuar con escrituras D.2 ni B05.5/AWS.

## Resultado final B05.4C.2D.2B

Registro: **28 de octubre de 2026, 22:49:00 Guatemala**, UTC 2026-10-29T04:49:00.666Z. El usuario activó manualmente una vez el comando con las rutas y huella verificadas y confirmó la salida genérica. El agente leyó únicamente el resultado sanitizado; no inició otro receptor ni conexión. El adjunto reiterado no se interpretó como autorización de una segunda sesión.

| Campo real | Resultado |
|---|---|
| Estado / resultado A–E | blocked / **D: otro error técnico clasificado** |
| Autenticación | accepted-by-driver |
| Destino | verified |
| Usuario/base | twosides_integration_test / two_sides_integration_test |
| Privilegios generales | readWrite limitado a la base, verificado por la política |
| Privilegios específicos | **listCollections true y databaseWideFind true** sobre la base completa |
| Etapa | **list-collections** |
| Consulta original | failed |
| Invocaciones de listCollections | **1** |
| Alternativa ejecutada | **false** |
| Categoría | **UNSUPPORTED_METADATA_FILTER** |
| Clase/código/codeName | **MongoServerError / 8000 / AtlasError** |
| Evidencia sanitizada | Una raíz, sin truncamiento |
| Cierre | closed true; diagnóstico close completed |
| Escrituras / transacciones / modelos | **0 / 0 / 0** |

Se verificaron host autorizado, usuario/base exactos, authSource admin, DEFAULT solicitado y TLS estricto. No se observó ni se afirma el mecanismo SCRAM finalmente negociado. Solo lectura describe las operaciones del procedimiento: el usuario mantiene facultades readWrite. Los permisos no se modificaron.

La consulta ejecutada fue la original: filtro name.$in con cuatro nombres exclusivos de esta ejecución sobre el Db autorizado, nameOnly true y authorizedCollections false normalizado. retryReads false impidió reintentos de lectura del driver; no hubo bucle externo ni fallback. No ping/hello/buildInfo adicionales del arnés; se conserva el descubrimiento interno normal del driver.

### Causa demostrada y límites

El clasificador reconoció una firma fija de **rechazo del filtro de metadatos**, en la etapa y código esperados. No se conservó ni mostró el mensaje original, substring, URI, contraseña, token, stack u objeto de configuración. El resultado agrupa las firmas de filtro reconocidas y no distingue cuál coincidió; no se recupera el mensaje para ampliar ese detalle.

Este fallo no se debió a ausencia del permiso listCollections comprobado ni fue un rechazo de autenticación en esta sesión. No demuestra que listCollections completo esté prohibido, que $in sea inválido en el contrato general o que todas las instancias Free M0 tengan idéntico comportamiento. La forma name.$in es candidata concreta para corregir, pero el resultado no aísla el operador exacto ni acredita todavía una alternativa funcional. La ausencia de los cuatro namespaces **no se verificó**; no continuar con persistencia.

### Cierre, limpieza e integridad

La conexión quedó cerrada y no quedan procesos Node. El campo cleanup del clasificador permanece unknown porque no instrumenta por separado toda liberación interna; close completed y la ausencia de procesos sí se observaron. El canal consume el identificador y limpia buffers/BSTR controlados; no garantiza borrado de strings inmutables del GC.

Las nueve dependencias y receptor conservan sus hashes del manifiesto. Sender SHA-256 sin cambios: B13FC5429F90F42886CA0F0C890745CF936A62192A44FF34557264A3690C34C6. Se conservan cinco artefactos privados: sender, receptor, manifiesto no secreto, readonly-attempt.started y readonly-result.json sanitizado. Ningún archivo de contraseña/tokens. El marcador queda conservado para impedir reutilización. No hay documentos remotos que limpiar; no se crearon colecciones/índices o modelos.

Las tres bases protegidas conservaron **exactamente SHA-256, tamaño, mtime UTC, propietario y SDDL** frente al inicio de D.2B: runtime local-persistence/.work/runtime-game/save.sqlite3 y las históricas game-progress/save.sqlite3 y persistence/save.sqlite3 bajo AppData/Local/TwoSides/ReconstructionTests/copy-06dc7ade-b3cd-425b-8d79-90dde8ef1ac6. Comparación binaria/metadatos sin SQL.

backend/.env no se abrió, consultó, hasheó o modificó; no se certifica de nuevo su contenido. Sin cambios Godot, ACL, propietarios, usuarios/roles Atlas, colecciones/índices, base principal o configuración principal. No npm run dev, Outbox real, Godot o AWS. Las 162 pruebas son ensayos offline previos, no consultas Atlas adicionales.

### Recomendación

Una futura autorización puede limitarse a la alternativa preparada exact-authorized: cuatro consultas con nombre exacto, authorizedCollections true y nameOnly true, conservando identidad/destino/TLS y **find efectivo sobre toda la base**. Con permisos limitados por colección podría haber namespaces ocultos; no declarar aislamiento en ese caso. La alternativa sigue sin comprobarse remotamente y **no se ejecutó en D.2B**.

Para ese otro ensayo se requiere autorización independiente, receptor exclusivamente de lectura y nuevo directorio/manifiesto/runId/hashes. No reutilizar el canal consumido ni cargar la suite de escrituras. Aunque luego se verificase ausencia, solo se superaría el preflight puntual; persistencia, índices y transacciones seguirían requiriendo su alcance autorizado.

**D.2B finalizada con resultado D. Persistencia NO VALIDADA y D.2 bloqueada. B00 y coordinación durable de identidad/revocaciones pendientes. Sin segundo intento, alternativa automática, B05.5 o AWS. Esperar instrucciones.**
