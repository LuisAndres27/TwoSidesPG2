> **Seguimiento F.1C.1 — 2026-10-29 Guatemala:** C.1 preparada con arnés de repositorios reales, dos órdenes de carrera, reapertura y limpieza exacta; 493 pruebas backend offline aprobadas (31 nuevas, 462 regresiones). No Atlas ni credenciales remotas. C.2 requiere nueva autorización, capacidad y receptor privados revisados; **F.2 continúa deshabilitada**, B00 pendiente y B05.5 no iniciada. [Preflight, límites y requisitos C.2](B05_DURABLE_REVOCATION_ATLAS_PREFLIGHT.md).

> **Antecedente F.1B — 2026-10-29 Guatemala:** coordinación persistente implementada en código aislado: MongoIdentityRepository, guard durable por propietario y UoW común de ingestión/revocación. 462 pruebas backend offline aprobadas (41 nuevas, 421 regresiones). La composición Mongo con identidad memoria/archivo falla cerrada. Sin Atlas, migración o cambios de datos protegidos. Garantía Mongo real pendiente; F.2 deshabilitada, B00 pendiente y B05.5 no iniciada. [Implementación, pruebas y requisitos siguientes](B05_DURABLE_REVOCATION_IMPLEMENTATION.md).

# B05.4C.2F.1 — Preparación de concurrencia e idempotencia

> **Seguimiento F.1A:** diagnóstico/diseño y 44 pruebas sintéticas de coordinación completados; 315 pruebas totales con regresiones aprobadas. Recomendación: identidad/operaciones bajo UoW Mongo y guard duradero por propietario modificado por ambas rutas. No se implementó esa persistencia ni se validó en Mongo real. [Garantía, opciones, veinte intercalaciones y plan de implementación](B05_DURABLE_REVOCATION_COORDINATION.md). **F.2 sigue bloqueada y su arnés no se habilitó.**

2026-10-28, America/Guatemala. **F.1 COMPLETADA COMO PREPARACIÓN OFFLINE. F.2 BLOQUEADA POR RIESGO DE AUTORIZACIÓN REPRODUCIDO.** No conexión Atlas, credenciales, canal privado nuevo o pruebas remotas. B05.5 no iniciada.

## Fuentes y alcance

Revisados B05_ATLAS_TRANSACTIONAL_INTEGRATION_RESULT.md, B05_ATLAS_PERSISTENCE_INTEGRATION_RESULT.md, B05_MONGODB_ADAPTER_IMPLEMENTATION.md, B05_REMOTE_INGESTION_ARCHITECTURE.md, B05_REMOTE_INGESTION_TEST_PLAN.md, B05_PERSISTENT_IDENTITY_CONTRACT.md, B05_JWT_KEY_LIFECYCLE.md y B05_ATLAS_INTEGRATION_MODE.md. Los estados históricos se distinguen de la implementación y del éxito acotado D.2E.

Código inspeccionado: MongoIngestionRepository/IngestionEngine/IngestionService, mongoAuthorizationFence, contexto JWT v2, coordinador/identidad sintéticos y sesiones del driver MongoDB 7.7.0 instalado. No cambios en el sistema de identidad, adaptador, configuración principal o política de permisos.

D.2E verificó secuencialmente commit/abort, recibos, reenvío/conflicto y reconexión; no acreditó concurrencia, reinicio de proceso, revocación durable o tolerancia a caídas. Conserva cuatro colecciones vacías con índices del runId 0e803b0278594116a83894c04fb10c53. No se accedió nuevamente a esos recursos.

## Archivos preparados

- scripts/atlas-concurrency-harness.js: plan fijo, generador de sobres session.report sintéticos, cuatro parejas acotadas ejecutadas mediante actores IngestionService/MongoIngestionRepository inyectados y validación de inventario exacto de limpieza. Sin conector, URI, stdin, receptor, bootstrap o autoejecución.
- tests/sync/atlas-concurrency.test.js: trece pruebas F01–F13.
- Este documento.

El punto executeAtlasConcurrencyRun **rechaza incondicionalmente antes de aprovisionar o recibir credenciales**, con REVOCATION_COMMIT_RACE_REQUIRES_REVIEW. remoteEnabled false no se cambia mediante argumentos/env ni un authorized true. La función de casos acepta actores inyectados para pruebas offline; no es un lanzador de red. El arnés está preparado para revisión y ensayos de contratos; no es un receptor F.2 habilitado. No se creó una excepción de escritura para F ni se reutilizó el arnés D.2E.

## Casos, índices y criterio esperado

| Caso preparado | Resultado requerido y evidencia offline |
|---|---|
| Dos solicitudes idénticas | Mismo owner/ID/hash, un efecto; recibo ganador idéntico. F01 usa repositorios/actores con coordinadores independientes y modelos transaccionales doblados. |
| Mismo ID, contenido diferente | Un ganador y conflicto; el perdedor no sobrescribe ni recibe un ACK positivo. F01. |
| Dos IDs distintos del mismo owner | Dos operaciones válidas con fuentes distintas, sin pérdida de una de ellas. F01. |
| Propietarios ficticios distintos | Mismo operationId permitido por cuenta, ámbitos y recibos separados. F01/F07. |
| Colisión de índice único | Error 11000 tras escritura parcial en la transacción doble: rollback, 503 sin recibo, retry estable exitoso. F02. No se considera duplicate solo por el código. |
| Write conflict | Código 112 y etiqueta transient, sin éxito inventado si se agota el driver: 503 recuperable. F03. |
| TransientTransactionError | Reejecución acotada del callback y un solo efecto/ACK posterior al commit. F04; F12 ensaya el algoritmo real del driver con I/O interceptada. |
| UnknownTransactionCommitResult | 503 sin recibo especulativo si queda incierto; mismo ID recupera recibo persistido. F05. F13 verifica offline que el driver reintenta commit, sin volver a ejecutar el callback. |
| Respuesta perdida tras commit | Hook afterCommit simula pérdida posterior al commit; reenvío conserva recibo. F06. No corta la red ni modifica Atlas. |
| Reinicio ordenado y consulta de recibo | F06 reconstruye repositorio/servicio sobre el estado del doble; F07 verifica consulta de recibos y separación de cuentas. Un reinicio real de Node sigue pendiente. |

Índices existentes del contrato: owner_operation_unique, unique sobre technicalAccountId:1/operationId:1; scope_source_unique, unique sobre scope:1/sourceKey:1. El fence ingestion-v1 realiza una escritura transaccional que serializa también comprobaciones relacionales. No reemplazar transacciones por insertOne ni atribuir toda la protección al índice único.

## Reintentos y resultados inciertos

El adaptador invoca withTransaction con snapshot, majority/journal, maxCommitTimeMS 1000 y timeoutMS 10000. El servicio conserva presupuesto de operación máximo 2000 ms y lote 10000 ms. El driver instalado reintenta callbacks etiquetados TransientTransactionError y commits UnknownTransactionCommitResult dentro de su deadline/backoff; no hay un número fijo de intentos internos garantizado. Los ensayos F12/F13 usan timeout de 1000 ms, sesiones nativas y commit/abort simulados, con sockets bloqueados. No son evidencia del protocolo real del servidor.

El adaptador devuelve indisponibilidad sanitizada si no puede confirmar. Un duplicate key no etiquetado no autoriza fabricar un recibo; se relee el ganador mediante el mismo ID/hash/contenido y contratos. Los errores de autenticación/propiedad son distintos de almacenamiento temporal. El driver no debe recibir errores tragados dentro del callback: deben propagarse para abort/retry.

Un 503 o timeout no prueba ausencia de commit. El presupuesto del servicio puede expirar mientras el driver termina la transacción; no se garantiza cancelación instantánea del commit por vencer la respuesta. F.2 deberá drenar las tareas propias y reconciliar estado por IDs antes de limpiar o declarar ausencia. Si sigue incierto, conservar los datos y detenerse. No prometer exactamente una vez a nivel HTTP.

Plan de aplicación: máximo dos intentos adicionales de recuperación con el mismo ID/hash, solo después de confirmar cierre/drenaje del anterior, backoff acotado y tope global de veinte invocaciones de servicio por ejecución. No reintentar indefinidamente ni regenerar IDs para resolver un resultado incierto. Una consulta de recibo positivo debe coincidir con la operación/hecho confirmado; ausencia de recibo no basta para autorizar un nuevo ID.

## Riesgo crítico de revocación — bloqueo de F.2

F10 reproduce una carrera mediante APIs reales del repositorio de identidad sintético y el adaptador, con persistencia Mongo doblada:

1. La solicitud tiene un contexto JWT v2 válido.
2. La última validación del contexto y el fence Mongo aceptan la sesión.
3. Otro repositorio de identidad, con coordinador independiente, completa revokeIdentity sobre el almacén de identidad compartido.
4. El control Mongo no se actualiza por esa revocación; la transacción puede confirmar y devolver recibo después de completarse revokeIdentity.
5. Una validación posterior del contexto rechaza 401, mientras la operación ya está confirmada.

El test confirma que la identidad quedó inactiva antes de la aceptación y el control Mongo seguía activo. Es una **caracterización de una garantía faltante**, no un test que certifique seguridad. El almacén compartido del ensayo y commit son dobles; no se afirma haber reproducido esa carrera remotamente. El orden está inducido mediante un hook para hacer visible una intercalación permitida por el código.

El coordinador de un fixture protege solo participantes que usan ese mismo coordinador. No coordina procesos o almacenes independientes. Verificar la firma JWT/expiración/épocas y leer de nuevo la identidad antes del fence no elimina el intervalo entre la última comprobación y commit. Incrementar el fence Mongo no ayuda contra una revocación que no escribe los mismos documentos. Un recheck adicional también deja una ventana y no constituye una solución durable.

La documentación previa ya advertía de esa independencia; F.1 aporta una reproducción acotada. Por la sección 6 de la autorización actual, **F.2 no debe ejecutarse hasta analizar y resolver o delimitar formalmente este riesgo en una instrucción independiente**. No basta autorizar genéricamente concurrencia ni pasar un booleano al arnés. No se modificó identidad ni se habilitó una cuenta productiva.

Recomendación: diseñar una autoridad de revocación coherente que mute los mismos controles/épocas de autorización con los que compite el commit, y demostrar ambos órdenes (commit antes/después de revocación), reintentos y reinicio multiinstancia. Conservar claves JWT no recupera por sí solo identidad/sesiones/revocaciones. Las garantías de proveedor de claves/snapshots cifrados sintéticos existentes son independientes de una transacción Mongo distribuida; no se exportan claves/JWT/verificadores al manifiesto.

## Límites y seguridad del ensayo remoto propuesto — NO autorizado en F.1

Destino previsto exclusivo: TwoSidesCluster, <cluster>.<id>.mongodb.net, twosides_integration_test, two_sides_integration_test, authSource admin, DEFAULT y TLS estricto. Mantener autorización opt-in, validación del cliente/Db y privilegios efectivos, no solo dbName. Nada de two_sides_db, twosides_backend o administrador.

Después de desbloquear y autorizar expresamente F.2, requerir:

1. RunId/namespaces nuevos y manifiesto de propiedad previo. listCollections sin filter con authorizedCollections/nameOnly true, cursor completo y cobertura de toda la base. No usar el filtro incompatible ni asumir que la base sigue vacía.
2. Reconocer únicamente los cuatro nombres exactos de D.2E conservados, sin leer sus documentos o reutilizar sus colecciones/índices. Cualquier namespace inesperado detiene la preparación. La mera coincidencia de un prefijo no prueba propiedad. Verificar ausencia de los nuevos candidatos.
3. Dos identidades ficticias y tres actores: dos actores del mismo owner con coordinadores independientes y un tercero de otro owner. Máximo dos peticiones simultáneas por pareja, cuatro parejas principales, sin carga. El runner preparado efectúa exactamente ocho invocaciones para esas parejas; el resto de reconciliaciones/reintentos/consultas no puede exceder el límite global previsto de veinte.
4. Dos índices únicos del contrato comprobados en las colecciones nuevas antes de operar. autoCreate/autoIndex false, sin syncIndexes o cambios de índices ajenos. Crear/provisionar solo lo que autorice F.2; F.1 no lo hace.
5. Tiempo global máximo propuesto 120 s; presupuestos del adaptador/servicio sin ampliar. Como máximo tres conexiones propias, pool pequeño, sin failover/caídas o comandos failpoint del servidor. Si no se observa una colisión/transient real, declararlo no observado; no alterar Atlas para forzarlo. Los errores inyectados se separan siempre de errores naturales.
6. Pérdida de respuesta simulada solo después del commit mediante hook del arnés. Reinicio ordenado de un proceso propio, tras cerrar conexiones, con IDs/receipts no secretos y contexto de identidad definido; no detener procesos ajenos. Si el diseño de claves/identidad no permite reconstituir el mismo owner de forma segura, bloquear ese caso, no prometer continuidad JWT por usar la misma cuenta nominal.
7. Inventario verificado con colección/ID/owner/run exactos y comparación de contenido antes de borrar. El helper offline produce filtros acotados de _id/run/owner y distingue campos de owner de operaciones/hechos y el control global. F.2 deberá revalidar dentro de una transacción antes de limpiar hechos/operaciones/controles, conservar índices y registrar las colecciones vacías. Ante datos extraños o commit incierto, conservar y documentar IDs; no drop ni filtros vacíos.
8. Cierre ordenado de todas las conexiones/sesiones/tareas, resultado sanitizado por caso, sin URI/errores originales/tokens. Las pruebas F08/F09 verifican filtros exactos y no divulgación de secretos sintéticos. No escribir contraseñas/PHC/claves en el manifiesto.

No se entrega un comando activable o hash ficticio en F.1. Una vez levantado el bloqueo de seguridad y autorizada F.2, se revisará un receptor nuevo, se generarán y comprobarán sus hashes/manifiesto/ruta privada fuera de OneDrive/Git y sus permisos en lectura. Solo entonces se entregará el comando PowerShell concreto para entrada oculta manual. No reutilizar canales consumidos ni pedir contraseñas en el chat. No se crea canal, recibe credencial o conecta en esta fase.

## Resultados offline y limitaciones

**186 pruebas aprobadas, doce archivos, cero fallidas/omitidas: trece F nuevas + 173 regresiones aplicables.** Incluyen adaptador real con modelos transaccionales doblados, modo Atlas, aislamiento, índices, recibos y guardas de canal. Los coordinadores de los actores F01 son independientes, pero el doble Mongo serializa transacciones; eso no demuestra carreras o latencia real en Atlas. F06 reconstruye un cliente lógico, no reinicia Node.

F12/F13 ensayan withTransaction real con I/O de commit/abort doblada y sockets bloqueados. El primer doble de abort no actualizaba el estado de sesión y causó Transaction already in progress; se corrigió el doble para efectuar la transición abortada. F10 inicialmente carecía del método exclusive del almacén ficticio; se completó el contrato del doble. La batería final indicada es posterior a ambas correcciones; no se suman reejecuciones ni se cambiaron driver/adaptador/identidad para que pasara.

JS nuevos pasan Node --check. No se declara concurrencia real validada por las pruebas. No pruebas remotas, instalación, recepción de credenciales o ejecución de arneses Atlas. El ensayo F10 es evidencia de un riesgo pendiente: que el test pase no significa que esa garantía esté cumplida.

## Protección y cierre

Únicos archivos nuevos: arnés de preparación, pruebas offline y este informe. Sin cambios de implementación de identidad/adaptador/servidor, configuración principal o dependencias. backend/.env, SQLite runtime/históricas, Godot, ACL/propietarios, Compass y proyecto original no fueron accedidos ni modificados por este trabajo. No se vuelven a certificar sus hashes; la comparación exacta de D.2E es histórica.

B00 permanece pendiente; el arnés privado futuro no elimina el riesgo de código/entorno modificable bajo ACL pendientes. Identidad/revocación durable, custodia productiva, concurrencia Atlas y reinicio real siguen pendientes. No B05.5 ni AWS.

**F.1 completada. F.2 BLOQUEADA por REVOCATION_COMMIT_RACE_REQUIRES_REVIEW. Detenerse y esperar instrucciones de análisis de seguridad y autorización independiente antes de cualquier ejecución remota.**
