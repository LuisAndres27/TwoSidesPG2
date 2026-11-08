# B05.3A — Outbox SQLite local durable

Fecha: 2026-10-27, America/Guatemala. **COMPLETADA EN CÓDIGO en bases sintéticas. No activada en runtime.**

## Alcance y fuentes

Inspeccionados los contratos B05_SYNC_ARCHITECTURE/API_CONTRACT, roadmap, identidad persistente/plan de pruebas, estadísticas globales, GAMEPLAY_EVENT_AUDIT, LOCAL_STATISTICS_IMPLEMENTATION_PLAN, REAL_GAME_SAVE_CONTRACT, registros de fases/decisiones y README; contrastados con Models, SchemaManager, SQLiteRepository, UnitOfWork, GameSaveService y GameplayEventSchema/Models/Repository/Service reales.

Antes de esta fase no existía Outbox funcional. Base v2 con historial/checksums originales y extensión opcional gameplay v1 confirmados en código/pruebas. Un comentario de UnitOfWork no es una captura implementada. Permanecen intactos métodos reales de gameplay, proyectos/escenas/menús, FinNivel, Final, LocalGameState y GamePersistenceAdapter.

No red, worker, temporizador, HTTP, token o Atlas en el código nuevo. No dependencias nuevas. Los 124 tests de identidad son antecedente: no reejecutados aquí, porque no hay código/dependencia Node compartida y su batería abre HTTP loopback, fuera del alcance actual. Los 12/12 manuales anteriores tampoco son una validación nueva.

## Archivos

Nuevos, C# real incluido por el glob existente *.cs.txt:
- local-persistence/src/SyncOutboxModels.cs.txt: DTO tipados, estados, recibo simulado y backoff.
- local-persistence/src/SyncOutboxSchema.cs.txt: extensión sync v1, verificación y rollback sintético vacío.
- local-persistence/src/SyncOutboxProjection.cs.txt: proyecciones mínimas desde hechos confirmados.
- local-persistence/src/SyncOutboxService.cs.txt: transacciones/captura/consulta/reserva/ACK/error/recuperación.
- local-persistence/game-save-tests/OutboxChecks.cs.txt: 64 comprobaciones, incluidas otras instancias/procesos y caídas.

Modificado únicamente GameSaveChecks.cs.txt en código existente para despachar --outbox y --outbox-probe; no se cambian sus pruebas anteriores. No cambios csproj/paquetes/lockfiles ni código Node.

Documentación: este informe nuevo; actualizados B05_SYNC_ARCHITECTURE, B05_SYNC_API_CONTRACT, B05_IMPLEMENTATION_ROADMAP, B05_GLOBAL_STATISTICS_PLAN, PHASES, PHASE_HISTORY, DECISIONS y local-persistence/README. Total: 15 archivos deliberados. Builds generan artefactos ignorados en .work y el directorio de artefactos previo integration/sqlite/.work.godot; no son ediciones de gameplay.

## Extensión y migración

SyncOutboxSchema.Version=1 y migration_key local-sync-outbox-v1, historial/checksum propio. Conserva PRAGMA user_version=2, migraciones base 1/2 y gameplay v1, sin modificarlas. MigrateSynthetic admite únicamente SyntheticDatabase, creada por el sandbox propio; no ISaveDatabase arbitrario como destino de migración.

| Tabla | Contrato |
| --- | --- |
| sync_schema_migrations | Versión, clave, SHA-256 normalizado LF y fecha de aplicación; una fila v1 conocida |
| sync_installations | PK compuesta dueño/installationId/bindingGeneration, FK al perfil; fecha; sin credenciales ni identidad remota |
| sync_outbox | operation_id UUID PK, dueño/vínculo, game_id nullable, source_id/key/type, versión1, fecha UTC, origen, sobre canónico/hash, estado, intentos, próximo intento UTC en ms Unix, lease/expiry, recibo y error sanitizado |
| sync_dependencies | Dependencias entre operaciones, PK por par, FK compuestas al mismo dueño/instalación/generación |

UNIQUE(dueño,instalación,generación,source_key) protege dedupe después de reiniciar. UNIQUE(operation_id,dueño,instalación,generación) sustenta dependencias sin cruce de propietario. FK a perfiles y (game_id,dueño) de saved_games; RESTRICT conserva referencias. Índices ix_sync_due e ix_sync_game. Triggers rechazan cambios a identidad/payload/hash de una fila y cualquier UPDATE de confirmed.

CHECK valida enum/tipo/JSON/coherencia de lease/recibo, no sustituye la API de validación de ACK. Referencias polimórficas a sesiones/eventos/intervalos se verifican en la misma transacción al capturar; no hay FK SQL a tablas opcionales ausentes. No se introducen permisos de borrado de fuentes; eliminar hechos fuera de APIs autorizadas no está respaldado por una garantía FK polimórfica.

Migración DDL+historial en una transacción inmediata; repetición verifica sin reescribir bytes. Base futura/antigua no soportada, historial/checksum alterado o extensión parcial se rechazan sin reparar. Ensayadas aplicación a fixture existente, ausencia de pérdida de dominio y rollback de fallo. RollbackEmptySynthetic elimina únicamente la extensión cuando sync_outbox está vacía; rehúsa borrar cola pendiente/confirmada. Conserva perfil/partidas/eventos y permite volver a aplicar. No rollback destructivo de datos ni restauración automática.

## Contratos y captura

SyncBinding es metadata LOCAL, no autenticación: localPlayerId, installationId aleatorio y bindingGeneration positiva. RegisterInstallation requiere perfil existente y es idempotente. No usa nombre, secretos o cuenta remota. Sin identidad de instalación disponible, Capture devuelve SYNC_BINDING_REQUIRED y no inventa instalación ni transmite. B05.3B deberá aprovisionar/vincular el UUID local y reconciliar fuentes pendientes; no se cambia el sobre bajo un OperationId ya capturado. Esto no requiere alta remota ni bloquea jugar.

SyncFact admite cuatro tipos ya aprobados:
- game.report: fuente GameId + revisión exacta; cinco biomas/decisiones mínimas, versiones, progreso y metadatos de resultado/cierre.
- session.report: SessionId + phase open/terminal; estado y límites efectivamente guardados.
- gameplay.event: EventId original y campos medidos permitidos, enums explícitos.
- gameplay.interval: IntervalId original, sesión/run/ámbito, offsets/estado; sin contador acumulado inventado.

Capture lee la fuente confirmada dentro del snapshot SQLite y construye el contenido mediante una lista cerrada de campos; no acepta JSON/payload libre del llamador. Verifica dueño, UUID, versión, enteros seguros JS, claves acotadas, esquema de eventos cuando se requiere y coherencia básica de resultado/decisiones. Fuentes inexistentes o terminal aún no confirmado se rechazan. No emite snapshots de continuación, nombre, claves, PHC, credenciales ni posiciones/recursos.

Source keys: game:GameId:revision; session:SessionId:open|terminal; event:EventId; interval:IntervalId. OperationId distinto del ID fuente. Reconciliación repetida devuelve OperationId, fecha y sobre originales; no crea otro ID para reintentar. Mismo source key/contenido o recibo idéntico es idempotente; contenido/cobertura/dependencias contradictorios produce OUTBOX_CONFLICT. Un ID de operación colisionado no se reasigna.

Sobre schemaVersion1 con type/installationId/localPlayerId/bindingGeneration/gameId nullable/sourceKey/createdAtUtc/payload. SHA-256 minúscula de JSON canónico excluyendo operationId/hash; orden ordinal de propiedades, fechas UTC con milisegundos y enteros generados por DTO. Conservar bytes al reintentar. Se fija aquí para el productor C#; vectores C#/Node y receptor equivalente quedan pendientes antes de red. Auth v2 de B05.2D.2 no cambia la versión del sobre analítico.

Máximo conservador 16 KiB por sobre contando 256 bytes reservados para campos de transporte; hasta 100 elementos y 256 KiB por reserva. Cola limitada a 10.000 filas por defecto (configurable 1..100.000); no purga automática de confirmados/cuarentena. OUTBOX_FULL detiene captura, no revierte un commit previo del dominio. Sin scanner/paginación/checkpoints automáticos todavía: no se crean tablas vacías para simularlos.

## Estados, transacciones y recibos

| Origen | Operación | Destino |
| --- | --- | --- |
| pending / retryable_failure y venció nextAttempt | Reserve | in_flight, UUID lease nuevo, attempts+1 |
| in_flight con lease vigente e intento coincidente | Confirm con recibo simulado válido | confirmed |
| in_flight vigente | Retry | retryable_failure con nextAttempt persistido |
| in_flight vigente | Reject con código definitivo permitido | permanent_failure, conservando contenido |
| in_flight vencido | RecoverExpired | retryable_failure, conserva intentos/ID/payload y añade demora |

No transición por mera lectura/envío. No HTTP real: SimulatedSyncReceipt es entrada de prueba de un futuro transporte confiable; validación estructural no demuestra una firma de recibo ni procedencia remota hoy inexistente.

ACK comprueba operationId/owner/installation/generación/hash exactos, UUID receiptId, fecha UTC normalizada, estado committed/duplicate/superseded, leaseId e intento actuales y now < lease_until. Un lote parcialmente respondido no confirma otros elementos. El recibo persistido conserva alcance/intento; repetición del mismo recibo es no-op, otro recibo para confirmed produce RECEIPT_CONFLICT. ACK tardío/lease anterior se rechaza, incluso si el payload coincide; se reintentará misma operación y un futuro servidor devolverá su recibo deduplicado.

Writes usan BeginTransaction(deferred:false), lecturas snapshot deferred:true, SQL fijo/parametrizado, FK activas por capability, journal DELETE/synchronous FULL y busy_timeout1000 ms existentes. SQLite permite un escritor a la vez; bloqueo agotado devuelve STORAGE_BUSY. Dos consumidores no reservan la misma fila; todas las filas de reserva hacen commit juntas o ninguna. No garantía de cola distribuida multihost ni de equidad entre consumidores.

Dependencias explícitas (máximo16) deben apuntar a operaciones ya existentes del mismo vínculo y no a sí misma: el servicio construye un DAG por inserción y solo reserva cuando todos los padres están confirmed. No inventa automáticamente todo el grafo causal de gameplay. Prerrequisito permanent_failure deja descendientes pendientes para revisión; no lo salta ni borra. Captura completa y scheduling automático de dependencias quedan para B05.3B/receptor futuro.

## Reintentos y recuperación

Backoff exponencial de techo 1 s por primer intento, duplicando hasta techo15 min; equal jitter entre 50% y 100% del techo, mínimo500 ms. Reloj y dispersión inyectables; validación rechaza muestras inválidas. RetryAfter simulado prevalece cuando es mayor, con entrada permitida0..24 h. Solo códigos cerrados se guardan; nunca mensaje/URL/cuerpo arbitrario.

No límite corto de intentos por fallo de red: continúan con demora acotada sin cambiar ID. El contador entero seguro JS tiene límite técnico; agotarlo produce ATTEMPT_LIMIT sin reservar, no borra ni convierte una caída temporal en rechazo definitivo. Workers futuros deben respetar nextAttempt y tratar almacenamiento/binding/autenticación sin bucle inmediato.

Lease configurable1 s..5 min, defecto30 s. RecoverExpired es explícito y acotado a100 filas por llamada; otro proceso puede ejecutarlo tras reiniciar. No confirma una reserva vencida. Usa UTC persistida: saltos del reloj pueden adelantar/demorar recuperación; no se afirma reloj monotónico entre procesos.

Ensayos con procesos distintos: reapertura de pendiente, reserva duradera, recuperación de lease; salida abrupta antes de commit de reserva y antes de commit de ACK. SQLite recupera journal/transacción; no queda confirmación falsa ni intento a medias. No se simularon apagón físico, disco defectuoso, malware, sincronización OneDrive activa o restauración de backup antiguo.

## Atomicidad del dominio: garantías y brecha

A. Fuente confirma y captura posterior falla: la fuente sigue intacta; una futura reconciliación debe releer IDs/revisiones y capturar idempotentemente. Una revisión antigua NO capturada que ya fue reemplazada no se puede reconstruir: SOURCE_REVISION_UNAVAILABLE; conservar proyecciones capturadas y reportar revisión actual sin inventar intermedias.

B. Cola sin fuente confirmada: Capture exige leer fuente dentro de su transacción. CaptureInTransaction(SQLiteRepository,...) permite usar exactamente la conexión/transacción del futuro escritor. En fixtures se comprobó commit conjunto y rollback conjunto de fuente sintética + Outbox.

Eso NO significa atomicidad completa del gameplay real: el método no está conectado a UnitOfWork.BeforeCommit, GameplayEventService u observador. El hook ITransactionalSaveExtension existente puede compartir c/tx/recibo, pero no tiene todo el payload por sí solo; el futuro adaptador deberá proyectar datos de esa transacción sin abrir otra conexión. El diseño B05.1 prioriza reconciliación posterior para que fallo de captura/cuota no revierta CompleteBiome. Elegir/conectar la captura concreta y scanner/checkpoints es B05.3B, con pruebas de sus ventanas; no se implementó aquí.

## Historia y métricas

historical_import usa hechos presentes: partidas actuales/cerradas, decisiones originales y eventos/intervalos efectivamente medidos. No backfill en bases reales. historicalCoverageUnknown=true; game.report se marca incomplete conservadoramente respecto de telemetría no certificada. No enviar cero de muertes/tiempos donde no hay medición. Estado completed y resultado autorizado provienen de guardado; final_pending no se convierte en cerrado y no existe evidencia de final leído.

Una sesión open puede proyectarse desde started_at aunque ya exista terminal; sus campos de apertura permanecen estables, terminal es otra clave natural. Partida histórica archivada sin resultado válido no se transforma en completada. UUID originales, decisiones y fechas de dominio no se reescriben.

## Validación ejecutada

**64 comprobaciones nuevas aprobadas, 0 fallidas**, en SQLite real sintético .work/databases/<UUID>. Cubren los 35 grupos solicitados: migraciones/FK/rollback/versiones, captura/IDs/hash/duplicados/conflictos, reservas y concurrencia de escritores/consumidores, ACK válido/duplicado/ajeno/antiguo/incorrecto, backoff/rechazo/lease, reinicios y procesos interrumpidos, filtros/orden/historia/desconocido, capacidad/atomicidad y ausencia de dependencias HTTP/Atlas/secretos.

**598 regresiones offline reejecutadas, 0 fallidas:**43 SQLite base,42 progreso,35 menú,30 selección,30 decisiones,29 entrada animal,11 retorno,21 reinicio,19 Game Over,39 consultas estadísticas,24 pantalla,41 eventos,31 observador,23 actividad,54 completions y126 finales. Total de esta fase: **662 comprobaciones**, no contar repeticiones.

Comandos: local-persistence/run-checks.ps1; dotnet build game-save-tests/GameSave.Checks.csproj --no-restore --disable-build-servers -nodeReuse:false; ejecutor autocontenido --outbox y los quince modos seguros históricos. Runtime .NET8.0.30 y SQLite3.53.3. No modo histórico escritor de AppData.

Biblioteca/ejecutores:0 errores/0 advertencias. TwoSides.csproj Rebuild --no-restore, con GodotProjectDir dirigido a integration/sqlite/.work/ con separador final:0 errores,63 advertencias CS0618 históricas ParallaxBackground,0 nuevas. Solo compilación C#, nunca motor Godot. Un primer build emitió artefactos en la variante previa .work.godot por normalización de ruta; se corrigió separador y se retiraron únicamente dos .cs generados nuevos, verificando ausencia en baseline. No fuente de juego eliminada.

Incidencias corregidas: overload ambiguo en primera compilación resuelto especificando SQLiteRepository; test de versión futura inicialmente violaba CHECK y detectaba corrupción antes que incompatibilidad, corregido antes del cierre; prueba de contenido contradictorio consultaba primero el validador de dominio y devolvía UNKNOWN_CONTENT, corregida su entrada sintética para probar el conflicto de Outbox. Se conservan como intentos fallidos, no resultados aprobados.

## B05.3B y runtime: pendientes sin autorización implícita

1. Autorizar integración de captura/reconciliación, provisionamiento local de binding, backfill tipado/paginación/checkpoints, límites y política de errores que preserve gameplay.
2. No registrar callbacks de red en decisiones/FinNivel/finales. Primero transporte fake; HTTP, cliente JWT y receptor remoto requieren sus fases.
3. Migrar runtime solo con autorización explícita, procesos cerrados/estado OneDrive estable, inventario de enlaces/ruta/ACL, respaldo privado nuevo verificado y ensayo de migración sobre copia autorizada. No usar bases históricas AppData como origen de datos.
4. Aplicar extensión conservando base/eventos, revisar integridad/filas/cobertura e invariantes antes/después. Reversión con datos exige plan de preservación/backup autorizado; RollbackEmptySynthetic no es herramienta de rollback runtime poblado.
5. Resolver riesgo B00 y custodia/retención/identidad productiva antes de secretos/red reales. Ningún ACK local demuestra ingesta Atlas.

B05.3B y B05.4 NO iniciadas; runtime NO migrada, sin conexión Godot, HTTP, Node, Atlas o AWS.

## Fuentes técnicas

Decisiones locales y resultados anteriores se apoyan en código/ejecuciones de esta copia. Para semántica de transacciones y límites de concurrencia: [Microsoft.Data.Sqlite](https://learn.microsoft.com/en-us/dotnet/standard/data/sqlite/transactions). FK y atomicidad requieren configuración/motor/almacenamiento adecuados: [SQLite foreign keys](https://www.sqlite.org/foreignkeys.html), [SQLite atomic commit](https://www.sqlite.org/atomiccommit.html). Estas fuentes no certifican este dispositivo ante un apagón; los ensayos descritos son de procesos/transacciones sintéticos.



## Cierre de integridad — 2026-10-28 Guatemala

La fase comenzó el 2026-10-27 y su cierre se registra el 2026-10-28 según la fecha local del cliente.

Comparación final contra inventario anterior a editar: exactamente nueve archivos existentes autorizados modificados y seis nuevos (15 deliberados), cero archivos originales eliminados. No otros cambios de fuente/documentación;49 artefactos generados de compilación bajo la variante previa integration/sqlite/.work.godot se contabilizan aparte, además de cachés/binarios bajo .work excluidos del inventario. Los dos .cs de ensamblado generados por esa variante fueron retirados únicamente tras comprobar que no existían en baseline; compilación final usa .work/ con separador correcto. No se tocaron fuentes de Godot ni csproj.

Las tres bases protegidas y los nueve archivos asociados conservan exactamente hash/tamaño/mtime. Backend/.env **coincide con la referencia histórica** y conserva tamaño/fecha; no se leyeron valores. Owner/SDDL de raíz, backend, backend/.env, local-persistence y .git idénticos antes/después; no comandos de modificación de permisos/ACE/herencia/propietarios. No nueva auditoría de todos los descriptores del árbol. Riesgo B00 pendiente; dos Allow no resueltas y Deny Git conservadas.

Cero archivos de bases sintéticas restantes bajo .work/databases; cada Sandbox limpió exclusivamente sus archivos propios. Sin motores, servidores, HTTP/Atlas/AWS/Node o cuentas/credenciales reales. Los resultados finales son64 pruebas nuevas +598 regresiones reejecutadas=662 aprobadas,0 fallidas; compilación biblioteca/ejecutores0/0 y Godot C#0 errores/63 advertencias históricas,0 nuevas. Pruebas backend124 y manuales12/12 NO reejecutadas.

**B05.3A COMPLETADA EN CÓDIGO exclusivamente en el ámbito sintético. B05.3B y B05.4 no iniciadas.** Quedan pendientes integración real de captura/reconciliación/checkpoints, binding local en arranque, backfill/migración runtime autorizados, vectores C#/Node y receptor/trasporte remoto. No se afirma atomicidad completa gameplay–Outbox ni procedencia criptográfica de recibos simulados. Trabajo detenido a la espera de autorización expresa.


## B05.3B.1 — Captura y reconciliación sintéticas (2026-10-28 Guatemala)

Implementada captura/reconciliación por páginas en SyntheticOutboxReconciler, con fuentes confirmadas, backfill, DAG de prerrequisitos y auditoría de TODA la cola. No nueva migración: base2/eventos1/sync1 conservados. Origen/IDs/confirmados existentes no se reescriben. En snapshots antiguos se verifican metadatos/decisiones inmutables y se informa que la proyección completa no puede reconstruirse. Filas huérfanas, contradicciones y dependencias antiguas incompletas se diagnostican sin borrado. No hooks nuevos en escritores: captura posterior conserva progreso si falla la cola.

Matriz de hechos, métodos/archivos, garantías, historial, pruebas, limitaciones y plan preciso B05.3B.2 en [B05_OUTBOX_CAPTURE_RECONCILIATION.md](B05_OUTBOX_CAPTURE_RECONCILIATION.md). B00 continúa pendiente. Detenido; sin iniciar B05.3B.2/B05.4.


## B05.3B.2A — Respaldo y ensayo privado (2026-10-28 Guatemala)

Ensayo completado sobre segunda copia privada de runtime, sin migrar original: BackupDatabase read-only bajo bloqueos de escritura; backup y origen hash/metadatos intactos. Copia conservó base2/eventos1 y recibió sync1; integrity_check=ok,FK válidas y todo dominio/estadísticas idénticos. Primera reconciliación658 pendientes/1341 dependencias/0 diagnósticos; segunda en otro proceso0 nuevas,mismos IDs/payload/estados. No envío ni ACK remoto. Migración reaplicada idempotente y fallo precommit revierte otra copia desechable. Es tooling privado, no migrador runtime productivo: DDL exacto/checksum reutilizado sin relajar SyntheticDatabase. No ACL/owner/Godot/HTTP/Atlas/AWS.

Respaldo, SHA-256, conteos anonimizados, resultados, riesgos y plan B05.3B.2B en [B05_OUTBOX_RUNTIME_MIGRATION_TRIAL.md](B05_OUTBOX_RUNTIME_MIGRATION_TRIAL.md). Datos reales solo en privado fuera de Git/OneDrive; no imprimir IDs/decisiones ni restaurar. B00 pendiente. B05.3B.2B/B05.4 no iniciadas.


## B05.3B.2B — Activación local controlada (2026-10-28 Guatemala)

Estado vigente2B:runtime de copia migrada explícitamente a sync1 con backup/ensayo nuevo previo; base2/gameplay1 conservados.658 operaciones pending/1341 dependencias,0 nuevas en segunda reconciliación. Nuevo pump verifica extensión existente sin automigrar al abrir, binding local único y captura secundaria; worker asíncrono serializado por gate del adaptador,diagnóstico/cancelación sin Godot liberado. No HTTP/Atlas/JWT ni rol remoto. Ausencia sync devuelve OUTBOX_NOT_ACTIVATED, no impide progreso local válido.

Preflight,backup nuevo/hash,ensayo,migración,comparación,archivos/pruebas,riesgos y guía manual en [B05_OUTBOX_RUNTIME_ACTIVATION.md](B05_OUTBOX_RUNTIME_ACTIVATION.md). B00 pendiente;sin cambios ACL/propietario,autenticación remota,HTTP/Atlas/AWS oB05.4. Esperar validación manual e instrucciones.
