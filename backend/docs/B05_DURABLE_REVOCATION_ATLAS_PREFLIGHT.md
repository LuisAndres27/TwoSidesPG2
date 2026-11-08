# B05.4C.2F.1C.1 — Preflight de coordinación durable en Atlas

2026-10-29, America/Guatemala. **C.1 PREPARADA: arnés y pruebas offline completados; ninguna conexión Atlas, credencial remota o escritura remota.** C.2 necesita autorización y activación manual independientes. F.2 permanece deshabilitada; B00 pendiente; B05.5 no iniciada. Este informe no valida la garantía de revocación contra MongoDB real.

## Inspección y modelo que se pretende validar

Se revisaron los diez documentos requeridos: DURABLE_REVOCATION_IMPLEMENTATION, DURABLE_REVOCATION_COORDINATION, ATLAS_CONCURRENCY_PREFLIGHT, ATLAS_TRANSACTIONAL_INTEGRATION_RESULT, MONGODB_ADAPTER_IMPLEMENTATION, ATLAS_INTEGRATION_MODE, PERSISTENT_IDENTITY_CONTRACT, JWT_KEY_LIFECYCLE, REMOTE_INGESTION_TEST_PLAN e IMPLEMENTATION_ROADMAP, bajo backend/docs. Los estados históricos de esos documentos no sustituyen las implementaciones posteriores.

Se inspeccionaron MongoIdentityRepository, MongoIngestionRepository, los modelos de ambas rutas, las factorías Atlas, política/capacidades, JwtService, resolveSyncContext, IngestionService, esquemas Zod y los arneses anteriores. No se repitió F.1A ni se reimplementó F.1B. No fue necesario modificar código de src.

La identidad canónica y los datos de ingestión utilizan la misma conexión/scope dentro de cada receptor y una ClientSession común por transacción. El guard se lee y modifica con CAS/$inc antes de los efectos de ingestión. La revocación modifica ese mismo guard y su estado/comando atómicamente. Los callbacks reintentados vuelven a consultar identidad, vínculo, sesión y épocas; no hay fallback a memoria. El coordinator de compatibilidad no bloquea hilos ni proporciona la garantía.

El recibo se escribe dentro de la transacción de la operación; no se expone como aceptación antes del commit satisfactorio. authorizationDecision queda fuera del recibo público. Se conservan JWT RS256 v2, roles/propiedad, cuatro tipos Outbox, Zod, idempotencia y respuestas parciales. Una identidad revocada no puede reenviar o consultar un recibo histórico, aunque este siga almacenado.

## Archivos de esta preparación

Nuevos:

- scripts/durable-revocation-atlas-harness.js: plan inmutable, comprobaciones de metadatos/modelos/índices, actores opacos, registro sintético mediante servicios reales, casos de carrera, reapertura, orquestador inyectado, limpieza exacta, cierre y diagnósticos seguros.
- tests/sync/durable-revocation-atlas-preflight.test.js: pruebas offline del arnés y sus barreras.
- Este documento.

Modificados:

- tests/sync/support/mongo-double.js: deleteOne transaccional y publicación de tombstones para probar rollback de limpieza. Conserva el doble optimista compartido y no abre MongoDB.
- tests/sync/persistence.test.js: D02 admite un único reintento estable después de dos respuestas 503 concurrentes y exige después 200, un solo hecho/operación y recibo idéntico. Justificación y evidencia en Resultados offline; sin cambiar el adaptador de archivo.
- docs/B05_ATLAS_CONCURRENCY_PREFLIGHT.md y docs/B05_IMPLEMENTATION_ROADMAP.md: enlace al estado C.1, sin habilitar F.2.

Sin cambios a src, política Atlas, receptores privados, app/server, dependencias, autenticación productiva, Godot o bases protegidas.

## Destino y barrera de activación

Destino futuro exclusivo: TwoSidesCluster, host <cluster>.<id>.mongodb.net, usuario twosides_integration_test, base two_sides_integration_test, authSource admin, DEFAULT y TLS estricto. No two_sides_db, twosides_backend, atlasAdmin ni datos reales.

executeDurableAtlasRun rechaza incondicionalmente con DURABLE_REVOCATION_C2_NOT_AUTHORIZED antes de consultar conectores/credenciales. Importar el módulo no conecta, carga .env ni solicita entradas. El arnés F.2 anterior conserva remoteEnabled=false y REVOCATION_COMMIT_RACE_REQUIRES_REVIEW.

Los componentes preparados reciben conexiones/actores ya compuestos para poder verificarse con dobles. No otorgan permiso para abrir esas conexiones. El orquestador tampoco incluye conector por defecto. Su resultado mantiene remoteGuaranteeValidated=false: corresponde al futuro receptor identificar evidencia real verificada, no a un booleano suministrado a una prueba offline.

La política vigente todavía NO admite una capacidad de escritura específica F.1C.2. C.2 debe autorizar/revisar esa incorporación y el nuevo receptor; no se debe presentar esta prueba como D.2/D.2E ni reutilizar sus manifiestos consumidos. Es una condición de activación pendiente, no un defecto que se haya sorteado en C.1.

## Datos y namespaces previstos

prepareDurableAtlasPlan genera un runId nuevo de 32 caracteres hexadecimales y tres conjuntos de UUID independientes A/B/C: registrationId, installationId, localPlayerId, operationId, sourceSessionId y commandId. La identidad técnica y jti los genera el repositorio real al registrar/autenticar. No provienen de SQLite o de jugadores reales.

registerDurableRaceActor usa JwtService/Argon2id y MongoIdentityRepository; la credencial sintética aleatoria y el JWT solo permanecen en RAM. Cada etiqueta puede registrarse una vez por plan. Los actores y snapshots de limpieza son handles opacos: JSON no expone tokens, claves, conexiones, PHC o hashes opacos de sesión. El registro no secreto de ejecución solo debe persistir IDs/vínculos/colecciones/comandos y resultados seguros; no serializar actores, modelos, configuración o documentos de identidad completos.

Con prefijo b054c2c_<runId>, ocho colecciones exactas:

| Clave | Sufijo | Documentos esperados tras A/B/C satisfactorios |
|---|---|---:|
| operations | _ops | 2: B y C, con recibos embebidos |
| facts | _facts | 2: hechos sintéticos de B y C |
| fences | _fence | 1: ingestion-v1 |
| authorization | _authorization | 0: la proyección antigua no autoriza este ensayo |
| identities | _identities | 3: A/B revocadas; C desvinculada |
| ownerGuards | _ownerGuards | 3: revisiones durables |
| identitySessions | _identitySessions | 3: sesiones sintéticas, invalidadas por estado/épocas |
| revocations | _revocations | 3: comandos exactos A/B/C |

Total previsto: **17 documentos**, sin nuevos recibos para A. Techo conservador de inventario: 24 documentos; exceso o IDs ajenos detienen el procedimiento. La prueba remota aún no tiene runId/namespaces activados ni directorio privado creado.

## Metadatos, modelos e índices

Antes de cualquier preparación remota: confirmar host/usuario/base efectivos y DEFAULT/TLS mediante la factoría existente; connectionStatus/showPrivileges debe verificar la identidad única, rol readWrite restringido a la base y acciones efectivas requeridas. Exigir además listCollections/find de toda la base para evitar una enumeración parcial interpretada como ausencia de datos.

Única variante de enumeración preparada:

```javascript
{ listCollections: 1, authorizedCollections: true, nameOnly: true }
```

Sin filter, getMore o consulta alternativa automática. Se exige cursor terminado, nombres sin duplicados y exactamente los cuatro namespaces conservados del run D.2E 0e803b0278594116a83894c04fb10c53: _ops, _facts, _fence y _authorization. Son el inventario **histórico esperado**, no una constatación actual de Atlas. Si difiere, incluso por ausencia de un artefacto conocido o presencia de un namespace del run nuevo, detenerse y revisar antes de escribir.

Reconocer sus nombres no acredita propiedad de su contenido. No se leen documentos, índices o colecciones de ese run anterior para preparar/limpiar este ensayo. La enumeración no excluye una carrera con otro escritor o un principal comprometido; no supone aislamiento frente a administradores externos.

durableProvisionSteps solo describe ocho creaciones de colección, cinco índices únicos y el fence inicial; **no los ejecuta en C.1**. El receptor C.2 deberá comprobar modelos strict throw, conexión/nombres exactos y autoCreate/autoIndex/bufferCommands false antes de ejecutar DDL autorizado. Tras crear los namespaces nuevos debe inspeccionar los índices _id estándar, rechazar índices inesperados y crear únicamente los cinco siguientes, fuera de transacciones de datos:

| Colección | Índice | Claves |
|---|---|---|
| operations | owner_operation_unique | technicalAccountId, operationId |
| facts | scope_source_unique | scope, sourceKey |
| identities | identity_registration_unique | registrationId |
| identities | identity_binding_unique | installationId, localPlayerId |
| identitySessions | identity_token_unique | tokenHash |

Todos unique=true; sin sparse, partialFilterExpression, TTL, hidden o collation no simple. Cada inventario debe coincidir exactamente, sin syncIndexes, borrar/reemplazar índices o crear colecciones previas. Si aparece un índice inesperado durante la preparación, detenerse antes de las escrituras de datos dependientes y conservar lo ya creado. No se puede garantizar ausencia de cambios concurrentes futuros mediante un único preflight.

**Estado de índices:** declaraciones verificadas offline. Los dos índices D.2E son evidencia histórica; no se consultó su estado actual ni se creó ninguno nuevo. Los tres índices de identidad permanecen pendientes de la futura provisión autorizada.

## Intercalaciones preparadas

**A — Revocación primero.** Dos repositorios/servicios reales, con conexiones distintas a los mismos documentos. Ingestión valida su contexto y, dentro de la transacción, lee el guard. El arnés intercepta temporalmente el updateOne de ese receptor justo antes de su escritura Mongo. En ese punto no mantiene artificialmente un write-lock sobre el guard. El revocador confirma guard/identidad/comando; se libera ingestión. Su snapshot obsoleto debe conflictuar/reintentarse y detectar la revocación. Se verifica ausencia persistida de operación **y hecho**, comando durable, identidad inactiva, JWT viejo rechazado y duplicado sin recibo.

**B — Ingestión primero.** Se pausa al revocador después de leer y antes de escribir el guard. Ingestión confirma mediante el adaptador real. Al liberarlo, revocación debe conflictuar/reintentarse y confirmar con revisión mayor que authorizationDecision. Se comparan recibo devuelto y almacenado, relación hecho/operación y comando durable. JWT viejo y duplicado posterior deben rechazarse, preservando el recibo histórico.

**C — Otro propietario, respuesta perdida y desvinculación.** Después de revocar A/B, C sigue autorizado. El adaptador confirma un hecho/recibo y el hook postcommit provoca pérdida controlada de respuesta: 503 sin ACK. Se consulta el estado persistido y el mismo ID recupera exactamente ese recibo. C rechaza un sobre del vínculo de A con 403. Luego se desvincula únicamente C mediante revocación transaccional installation; su reintento posterior obtiene 401.

Se preparó reapertura de una tercera conexión, reconstrucción de repositorios/JwtService con las mismas claves sintéticas en RAM, rechazo del JWT B y comparación exacta de su recibo almacenado. No equivale a reinicio de servidor, pérdida de RAM, failover o recuperación de claves productivas.

Los hooks solo controlan dónde se envía una escritura o cuándo se pierde una respuesta. No sustituyen transacciones, repositorios, JWT, revocación o inserciones de ingestión por operaciones manuales. Se restauran en finally y se esperan las promesas de repositorio, incluso si el presupuesto HTTP ya venció.

## Límites y errores

- Tres propietarios; dos conexiones activas para carreras y una tercera para reapertura. Máximo dos participantes simultáneos; no pruebas de carga.
- Ocho llamadas de ingestión por plan: A dos; B dos; C cuatro. Tres registros y tres sesiones; tres comandos de revocación. Los callbacks Mongo conservan máximo tres intentos y timeout 10 s; no reintento externo de una ejecución fallida.
- Presupuesto de servicio 2 s por operación, barrera 1 s y máximo 30 s por escenario. Cada caso se consume una vez; un fallo marca el plan fallido y bloquea los casos siguientes/limpieza automática. El supervisor C.2 deberá imponer 120 s para la ejecución y conservar el inventario si no consigue drenar/cerrar. Ningún vencimiento prueba rollback.
- Los 30 s se comprueban antes de admitir envíos y antes de declarar satisfactorio un escenario; no cancelan físicamente un I/O pendiente. El conector/receptor C.2 debe imponer también timeoutMS 10000 a las operaciones fuera de withTransaction, retryReads/retryWrites false para el ensayo y el supervisor de 120 s, además de los límites de conexión ya existentes. Sin esos controles efectivos no se debe activar C.2. C.1 no incluye ni valida todavía ese nuevo receptor.
- El orquestador registra solo categorías/códigos permitidos, revisiones, contadores y booleanos seguros. La función sanitizadora no lee message/stack ni ejecuta getters. El receptor futuro debe sanitizar también errores de autenticación, DDL, preflight y cierre antes de escribir el resultado.
- Write conflict y TransientTransactionError se ejercitan con el adaptador/driver y revalidación; no se convierten en rechazos permanentes indiscriminados. Duplicate key no produce ACK sin verificar un recibo existente.
- UnknownTransactionCommitResult está cubierto offline y por las regresiones del driver. En remoto no se provocará un fallo del clúster, desconexión forzada o failpoint. La pérdida de respuesta tras commit conocido **no demuestra** un resultado incierto de commit del servidor. Si este ocurre naturalmente, detenerse, conservar IDs/estado y no repetir por fuera del protocolo autorizado.

## Limpieza y cierre preparados

Solo después de A/B/C satisfactorios y reapertura verificada, capturar inventario de los ocho namespaces propios. El registry se deriva de actores JWT reales de ese plan; objetos imitados o con otra conexión no sirven. Verificar IDs exactos, registro/vínculo/propietario, jti, commandId/kind/target y relación de operaciones/hechos. No basta el prefijo de colección.

El snapshot completo permanece en un handle privado en RAM; no se exportan PHC/tokenHash a manifiestos ni informes. cleanupDurableInventory consume ese handle una vez, relee/compara **todo** el inventario dentro de una transacción y recién después ejecuta deleteOne por IDs exactos y propietario cuando corresponde. Un documento extra, contenido cambiado, error de borrado o commit incierto impide declarar limpieza confirmada. No deleteMany, filtros vacíos, drop, borrado de índices o limpieza de otras ejecuciones.

La limpieza satisfactoria prevista elimina 17 documentos de forma conjunta y conserva ocho colecciones vacías y sus índices para el inventario futuro. Si falla cualquier escenario, se conservan los registros y se requiere una instrucción independiente para recuperación/limpieza. Si se pierde el proceso/snapshot, el manifiesto de IDs no autoriza reconstruir una limpieza automática ni borrar por prefijo.

El orquestador libera barreras, drena las transacciones de repositorio antes de proceder y cierra ambas conexiones principales en finally; la tercera se cierra en la verificación de reapertura. Se registran por separado fallos de cierre. C.2 debe supervisar también el proceso/receptor privado y no declarar ausencia de efectos por haber finalizado su canal de entrada.

## Resultados offline

**493 pruebas backend aprobadas al cierre: 31 nuevas y 462 regresiones.** Pase completo final: 454 Vitest en 19 archivos, cero fallidas/omitidas; regresiones legacy: 39 aprobadas, cero fallidas/omitidas. Los pases focalizados no se suman nuevamente. Sintaxis Node de los tres JS nuevos/modificados del arnés/doble y de persistence.test.js comprobada, sin errores. No se ejecutaron pruebas reales MongoDB/Atlas.

El primer pase completo dio 453 aprobadas y un fallo en D02 del adaptador histórico de archivo; al aislarlo volvió a fallar. La comprobación sanitizada mostró dos respuestas 503 storage_unavailable, cero hechos/operaciones, y un reintento con los mismos IDs obtuvo 200 y exactamente un hecho/operación. No se atribuye una causa concreta del fallo transitorio del almacenamiento sin más evidencia. La aserción antigua exigía un 200 en el primer par, aunque su contrato permite rechazar temporalmente ambos contendientes y reintentar. Se corrigió exclusivamente ese ensayo: un único retry si ambos devuelven 503, 200 obligatorio al cierre, un efecto y comparación del recibo persistido. No se ignoró el fallo, aumentaron presupuestos, cambiaron locks o relajaron controles del adaptador. Los ocho casos de ese archivo y los 31 nuevos aprobaron juntos después de esa corrección.

RC01–07 cubren bloqueo remoto, inmutabilidad/cotas, metadatos, permisos, ocho inventarios de índices y provisión seca. RC08 verifica composición nativa/opacidad. RC09–12 prueban ambos ganadores, conflictos, retry con revocación, recibos, separación de propietarios y pérdida de respuesta/desvinculación. RC13 reapertura; RC14 ampliación indebida de operación; RC15 agotamiento; RC16 commit incierto simulado; RC17 rechazo de memoria; RC18–21 limpieza exacta, cambios ajenos y rollback; RC22–23 sanitización/cierre; RC24 orquestador completo. Los ocho casos parametrizados RC06 se cuentan como ocho, no como uno.

El doble comparte almacenamiento entre facadas de conexión distintas, admite snapshots concurrentes, CAS/conflictos, abort y publicación conjunta. Se ejecutan las clases reales, pero los locks, atomicidad, visibilidad, concerns y durabilidad del servidor siguen siendo supuestos del doble. No equivale a dos sockets Mongo reales. Las regresiones F.1B/F.1A, autenticación, recepción y modos Atlas conservan sus límites declarados.

Comandos desde backend, con guardas de .env y sin iniciar servidores de desarrollo:

```powershell
node --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run --config vitest.config.js
node --import ./tests/jwt/env-guard.js --test --test-concurrency=1 tests/unit/*.test.js tests/integration/*.test.js
```

## Canal futuro y autorización C.2

No se recibió ni solicitó contraseña, leyó Compass/.env, creó directorio privado o reutilizó receptor/manifiesto consumido. No se entrega un comando activable ni un hash ficticio.

Antes de C.2 se necesita autorización independiente que incluya: capacidad exacta nueva, ocho namespaces nuevos, cinco índices secundarios, tres identidades/sesiones sintéticas, los tres escenarios/ocho envíos, reapertura y limpieza de los documentos propios. F.2 sigue fuera de ese alcance.

Con esa autorización: preparar un directorio nuevo bajo AppData/Local/TwoSides/AtlasIntegrationTests, fuera de OneDrive/Git. Inspeccionar en lectura propietario/ACL/ausencia de enlaces; detenerse si no satisface la privacidad, sin cambiar permisos. Copiar solo componentes revisados, fijar runId/manifest no secreto y verificar hashes de receptor, lanzador y dependencias antes de recibir secretos. Debe incluir la nueva política/capacidad, arnés y repositorios reales; no habilitar un callback que omita identidad durable.

El receptor nuevo debe consumir un marcador exclusivo antes del intento, rechazar resultados/manifiestos caducados, aceptar la contraseña únicamente por SecureString/entrada oculta y framing UTF-8 por stdin/RAM conforme al canal revisado, sin argv/env/URI con credenciales. Usuario activa manualmente una vez el comando concreto con hash verificado; no se solicita todavía. El secreto de Atlas no se persiste. Claves RS256 y credenciales de jugadores en este ensayo son exclusivamente sintéticas, en RAM, sin modificar custodia real.

## Riesgos, integridad y siguiente paso

B00 permanece abierto: los riesgos ACL del proyecto no se resuelven por generar un hash o crear un canal privado. C.2 requiere revisar procedencia/integridad del código y privacidad del paquete sin modificar ACL. También quedan custodia/rotación/reinicio de claves, recuperación/enrollment, retención, reconciliación privilegiada de revocación incierta, rollback de backups y rendimiento/contención del guard/fence global.

Sin acceso/modificación a backend/.env, SQLite runtime/históricas, Godot, usuarios Atlas, ACL/propietarios, two_sides_db u Outbox real. No se recalcularon hashes protegidos ni se actualizó una referencia histórica. Los tests usan únicamente datos sintéticos y las guardas existentes. Sin instalaciones, servidores de desarrollo, AWS o B05.5.

Recomendación: revisar y autorizar por separado el paquete C.2 con las condiciones anteriores. C.1 no demuestra todavía la coordinación real. **F.2 solo podrá reconsiderarse después de una integración real satisfactoria que pruebe ambos órdenes mediante estado/revisiones persistidos, JWT revocado/duplicados, reapertura, ausencia de efectos abortados y limpieza/cierre verificados; después requerirá su propia autorización.** No habilitarla por bandera ni por el éxito de estos dobles. Detenerse al finalizar C.1.
