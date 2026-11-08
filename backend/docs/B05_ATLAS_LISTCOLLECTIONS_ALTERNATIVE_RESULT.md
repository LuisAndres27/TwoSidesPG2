# B05.4C.2D.2C — Consulta alternativa sin filtros

2026-10-28, America/Guatemala. **CONSULTA ALTERNATIVA REAL VERIFICADA: ACEPTADA, CERO COLECCIONES Y ENUMERACIÓN COMPLETA.** Una consulta, cero escrituras/transacciones/modelos, cierre correcto. Ver resultado final al cierre; las secciones iniciales conservan la preparación histórica y sus estados pendientes quedan sustituidos por ese resultado. Persistencia no validada ni autorizada en esta fase.

## Inspección y comando

Revisados diagnóstico de listCollections, resultado remoto D.2B, resultado de persistencia y modo de integración, junto a la implementación real. La consulta anterior utilizó filter.name.$in con cuatro nombres: sintaxis compatible con el contrato general, rechazada en esa sesión con UNSUPPORTED_METADATA_FILTER/8000. No se ha aislado el operador exacto ni demostrado una restricción general de todo M0.

Comando preparado sobre el Db two_sides_integration_test, sin campo filter:

```js
{ listCollections: 1, authorizedCollections: true, nameOnly: true }
```

Se usa directamente connection.db.command, no listCollections del driver, para no añadir un filter vacío ni otras opciones al documento de comando. El driver añade los metadatos de protocolo normales. No ejecutar otro comando de enumeración si falla; retryReads false y sin fallback.

## Implementación y barreras

Archivos nuevos: src/modules/sync/atlas-unfiltered-collections-probe.js, scripts/atlas-unfiltered-collections-receiver.js y tests/sync/atlas-unfiltered-collections.test.js. Derivados de la ruta de lectura revisada; no modifican el arnés de persistencia ni la configuración principal.

Destino fijo: <cluster>.<id>.mongodb.net, usuario twosides_integration_test, base two_sides_integration_test, authSource admin, DEFAULT, TLS con certificado/nombre verificados. allowWrites false; autoCreate/autoIndex/buffering/monitorCommands false. Sin creación de modelos/repositorios. Inspección de identidad/destino y privilegios efectivos, incluyendo listCollections y find de toda la base, antes de enumerar. Ninguna dependencia de backend/.env ni MONGODB_URI del entorno; el sender limpia el entorno del hijo.

La consulta no sustituye las guardas existentes. authorizedCollections puede ocultar colecciones si los permisos son limitados; se exige cobertura de la base completa para evaluar ausencia. Solo se conservarán nombres con patrón b054c2c_<32 hex>_(ops|facts|fence|authorization). Otros nombres no se muestran ni persisten: se cuenta su cantidad. El patrón indica pertinencia nominal, no prueba propiedad ni autoriza borrarlos.

Se examina únicamente cursor.firstBatch. Si el cursor permanece abierto, enumerationComplete false y estado parcial; **no getMore, paginación ni segundo comando**. La conexión cerrará al finalizar. No afirmar ausencia global o aislamiento suficiente con una enumeración incompleta. Incluso con enumeración completa, la ausencia es puntual y no protege de carreras externas. Ninguna escritura se habilita por el resultado.

## Pruebas y canal privado

**168 pruebas offline aprobadas, diez archivos, cero fallidas/omitidas: seis U nuevas y 162 regresiones.** Verifican el documento exacto sin filter, una invocación, bloqueo sin permisos, cursor incompleto, solo nombres pertinentes, error 8000 sin repetición y rechazo de configuración extranjera/escritura. Regresiones del modo Atlas/adaptador se ejecutan con dobles; no equivalen a consultas reales. Sintaxis de probe/receptor y sender aprobadas.

Directorio nuevo: C:/Users/luis2/AppData/Local/TwoSides/AtlasIntegrationTests/b054c2c-67281434bd544676b6f0a77b2322603c/.

RunId: 67281434bd544676b6f0a77b2322603c.

Receptor SHA-256: 06C9F94AAFC032AD5B1404566E1EA79BB400F3E55A9A833F647CFC01FBD0D55D.

Sender revisado: send-atlas-test-credential.ps1, con el switch histórico AuthorizedForB054C2D. Huella comparada con la fuente. Manifiesto D.2C, Strategy unfiltered-command, DEFAULT, AllowWrites false, RetryReads false, una invocación y nueve dependencias verificadas. Fuera de OneDrive/Git; propietario/Allow limitadas a usuario/SYSTEM/Administradores y ancestros sin enlaces comprobados en lectura, sin modificar permisos. No marcador ni resultado al preparar.

El comando exacto fue entregado al usuario para una activación manual. Solo el prompt oculto recibe la contraseña, no chat/URI/argv/env/archivos. No extracción de Compass ni reutilización de secretos/manifiestos. El receptor verifica hashes antes de consumir credenciales y reclama readonly-attempt.started mediante wx. No repetir el comando ni borrar el marcador tras un fallo. El agente no inicia una segunda sesión.

## Preparación de integridad — referencia previa

Autenticación, permisos, aceptación del comando, nombres pertinentes, integridad final y cierre: **PENDIENTES**; no presentar lo previsto como ejecutado. Se registraron referencias previas de las tres bases protegidas (hash/tamaño/mtime UTC/propietario/SDDL) para comparación posterior sin SQL. backend/.env no accedido ni hasheado; no nueva certificación de su contenido.

Sin modificaciones Godot, usuarios Atlas, bases/colecciones/índices remotos, ACL, propietarios o configuración principal. B00 y coordinación durable de identidad/revocación pendientes. No two_sides_db, Outbox real, persistencia D.2, B05.5 o AWS.

## Resultado final real — B05.4C.2D.2C

Registro: **28 de octubre de 2026, 22:54:11 Guatemala**, UTC 2026-10-29T04:54:11.037Z. El usuario ejecutó manualmente el sender privado y confirmó su salida genérica. El agente leyó el resultado sanitizado, sin iniciar el receptor ni otra conexión.

| Campo | Resultado real |
|---|---|
| Estado / outcome | completed / A |
| Autenticación | accepted-by-driver |
| Destino | verified |
| Usuario/base | twosides_integration_test / two_sides_integration_test |
| Privilegios | readWrite limitado a la base, listCollections true y databaseWideFind true |
| Consulta alternativa | succeeded |
| Invocaciones listCollections | **1** |
| Colecciones devueltas | **0** |
| Nombres pertinentes | Ninguno |
| Otras colecciones contadas | **0** |
| Enumeración completa | **true**, cursor finalizado |
| Namespaces seleccionados ausentes | **true** |
| Comandos adicionales de cursor/getMore | **0** |
| Escrituras / transacciones / modelos creados | **0 / 0 / 0** |
| Diagnóstico de error | Ninguno; privateDiagnostic null |
| Cierre | **closed true** |

Se verificaron host autorizado, DEFAULT solicitado, authSource admin y TLS estricto. No se afirma el mecanismo SCRAM finalmente negociado. La cuenta tiene facultades readWrite; solo lectura describe las operaciones de este procedimiento, no un cambio a rol readOnly.

El único comando de enumeración fue exactamente `{ listCollections: 1, authorizedCollections: true, nameOnly: true }`, sin filter. Se usó connection.db.command sobre la base autorizada, sin cambiar de Db ni leer documentos. La inspección connectionStatus previa fue exclusivamente de identidad/privilegios. Sin reintento automático, consulta original adicional o fallback.

### Alcance de la conclusión

Atlas aceptó esta variante sin filtro en esta sesión. La consulta filtrada anterior falló con UNSUPPORTED_METADATA_FILTER, mientras esta funcionó. Es evidencia de una diferencia relevante en la forma de consulta; no demuestra qué operador exacto rechazó el servicio ni una prohibición universal de filtros en M0.

La enumeración fue completa y la cobertura de permisos incluyó listCollections y find sobre la base completa. Por ello, el resultado vacío no depende únicamente de una vista limitada a permisos por colección y acredita ausencia de colecciones visibles bajo esa cobertura en ese instante, incluidos los cuatro nombres de esta ejecución. No hubo nombres que registrar ni documentos que inspeccionar.

Esta es una comprobación puntual, sin reserva/bloqueo de namespaces. Otros clientes podrían crear recursos después; para cualquier futura escritura deben repetirse el preflight y las verificaciones del nuevo runId, además de comprobar propiedad de cada registro e índices. No trasladar la ausencia observada a otra ejecución ni eliminar colecciones por coincidir con un patrón. authorizedCollections con permisos restringidos por colección o enumeración incompleta no permitiría la misma conclusión.

### Segunda invocación mostrada en el mensaje del usuario

El mensaje contiene un segundo lanzamiento del mismo comando tras finalizar el primero, sin su salida posterior. No se usa como autorización para otra sesión. Al inspeccionar, ya existen readonly-result.json y readonly-attempt.started; el sender revisado comprueba ambos antes de Read-Host y antes de crear el proceso Node. La reutilización de ese canal queda bloqueada por esas barreras. El receptor también reclama el marcador de forma exclusiva y nunca sobrescribe un resultado previo.

Se encontró un único resultado con queryInvocations 1 y cero procesos Node remanentes. No hay evidencia de una segunda conexión; no se afirma haber observado el código de salida del segundo sender, que no fue proporcionado. No se ejecutó el comando otra vez para comprobar la barrera. No repetirlo ni borrar sus marcadores.

### Cierre, artefactos e integridad

La conexión cerró correctamente. No quedan procesos Node. Se conservan cinco archivos privados de auditoría: sender, receptor, manifiesto no secreto, marcador consumido y resultado sanitizado, sin archivos de contraseña/JWT/tokens. Los buffers/BSTR controlados se liberan conforme al canal; no se promete borrado garantizado de strings inmutables del GC. No limpieza remota necesaria porque no se escribieron datos.

Las nueve dependencias y receptor conservan sus hashes del manifiesto. Sender SHA-256: B13FC5429F90F42886CA0F0C890745CF936A62192A44FF34557264A3690C34C6, sin cambios. No se alteraron los canales o resultados anteriores.

Las tres bases protegidas conservan **exactamente SHA-256, tamaño, mtime UTC, propietario y SDDL** respecto del inicio de D.2C: runtime local-persistence/.work/runtime-game/save.sqlite3 y las históricas game-progress/save.sqlite3 y persistence/save.sqlite3 bajo AppData/Local/TwoSides/ReconstructionTests/copy-06dc7ade-b3cd-425b-8d79-90dde8ef1ac6. Verificación binaria/metadatos sin SQLite/SQL.

backend/.env no se abrió, consultó, hasheó ni modificó; no se certifica nuevamente su contenido. Sin cambios de Godot, ACL/propietarios, usuarios/permisos Atlas, colecciones/índices, configuración principal o base principal. No Outbox real, npm run dev o AWS. Las 168 pruebas offline son antecedentes del preflight de esta fase, no consultas reales adicionales.

### Recomendación para persistencia

Se considera superada **únicamente la validación real de esta consulta alternativa de metadatos**. Para una futura fase expresamente autorizada, preparar el arnés de persistencia con preflight sin filter, nombres/runId/manifiesto nuevos y verificación local de los candidatos sobre una enumeración completa y cobertura suficiente. No sustituir silenciosamente el control actual ni usar el canal consumido. Revisar y probar el cambio offline antes de recibir otra credencial.

No se iniciaron escrituras, índices, transacciones, reconexión de persistencia, idempotencia o concurrencia. El adaptador completo y coordinación durable de identidad/revocaciones siguen sin validar; B00 permanece pendiente. **D.2C finalizada. Detenerse; no iniciar persistencia D.2, B05.5 o AWS sin instrucciones independientes.**
