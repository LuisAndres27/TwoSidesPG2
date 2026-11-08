# B05.3B.2D — Capturas pendientes al cerrar: diagnóstico y recuperación sintética

**Estado vigente E.2: auditoría local satisfactoria, cero recuperación adicional necesaria.** B05.3 local completada; ver [resultado E.2](B05_OUTBOX_RUNTIME_RECOVERY_RESULT.md). Los bloques D/E.1 siguientes son antecedentes históricos.

**Estado previo B05.3B.2E.1:** corrección mínima implementada en código y probada solo con SQLite sintético; ver sección E.1 al final. El cuerpo D siguiente conserva el diagnóstico y la propuesta histórica anterior a su implementación. Validación Godot y recuperación runtime todavía pendientes; B05.3 no cerrada.

2026-10-28, America/Guatemala. **COMPLETADA como diagnóstico y recuperación sintética. B05.3 sigue pendiente de cierre. Runtime real sin reparar; ciclo de vida Godot sin corregir. B05.4 no iniciada.**

## Evidencia y alcance

Se revisaron B05_OUTBOX_RUNTIME_POSTVALIDATION, B05_OUTBOX_RUNTIME_ACTIVATION, B05_OUTBOX_CAPTURE_RECONCILIATION, B05_LOCAL_OUTBOX_IMPLEMENTATION, B05_OUTBOX_RUNTIME_MIGRATION_TRIAL, GAMEPLAY_EVENT_AUDIT, LOCAL_STATISTICS_IMPLEMENTATION_PLAN, B05_SYNC_ARCHITECTURE, B05_SYNC_API_CONTRACT, B05_IMPLEMENTATION_ROADMAP, PHASES, PHASE_HISTORY y DECISIONS. Sus resultados históricos se distinguen de las ejecuciones nuevas indicadas abajo.

Lectura nueva mediante OutboxReadAudit a las **2026-10-28T07:30:30.6941168Z** (01:30:30 Guatemala). Helper existente bajo `local-persistence/.work/outbox-read-audit/`, apertura read-only/query_only y guardas de archivos. No invoca reconciliación de escritura ni copia datos reales para probar la reparación. Runtime: base2/eventos1/sync1, integrity_check=ok, FK válidas; 853 operaciones pending, intentos0, sin recibos remotos. Distribución:17 game.report,23 session.report,98 gameplay.event,715 gameplay.interval. Cobertura actual838/840;15 snapshots game.report históricos adicionales. Cero duplicados, contradicciones, huérfanos o dependencias incompletas entre filas existentes.

Faltan exactamente estos dos hechos de la misma última sesión:

| Hecho confirmado | Fuente SQLite | Representación faltante |
|---|---|---|
| Sesión closed; inicio07:05:22.7889721Z, fin07:05:26.7209109Z; endOffsetMs3932 | `gameplay_sessions`, cierre originado por SESSION_ENDED en `gameplay_events` | `session.report`, sourceId=SessionId existente, clave `session:{SessionId}:terminal`, fase terminal |
| Intervalo Menu, startMs0/endMs3932, sin GameId ni AnimalRunId, sesión válida cerrada | `gameplay_intervals` | `gameplay.interval`, sourceId=IntervalId existente, clave `interval:{IntervalId}` |

Los UUID reales no se exportan al documento. No se generan IDs fuente sustitutos. Ambos dependen del reporte open de su sesión; un intervalo Menu sin partida/run no requiere inventar esas dependencias. Terminal y último intervalo son hechos independientes con padre open común: el contrato no impone una dependencia terminal→todos los intervalos. Los eventos SESSION_* se representan como reportes de sesión, no como gameplay.event redundantes.

**3932 ms son 3,932 segundos**, no3932 segundos. La proyección conserva state=Menu y los límites originales; no agrega un campo de duración inventado. No es ActiveAnimal y no debe sumarse al tiempo efectivo. StatisticsService actual conserva1146846ms efectivos,13 muertes,3 reinicios,9 reintentos,12 sesiones;2 partidas completed,10 decisiones/10 biomas completados. HistoricalCoverageUnknown=true; Uncollected.PlayedMilliseconds sigue NotAvailable. Actividad local completa no significa cobertura Outbox completa.

## Secuencia de cierre contrastada con código

| Archivo/método inspeccionado | Comportamiento verificado |
|---|---|
| `scripts/MenuPrincipal.cs`, Exit | Delega en contexto.QuitAsync; fallback tree.Quit solo si no hay contexto. No se demuestra que el fallback se utilizara. |
| `integration/sqlite/GamePersistenceContext.cs`, QuitAsync/FinishTelemetry/_ExitTree | WMCloseRequest y salida normal comparten cierre. Espera Initialization y Telemetry.CloseAsync, con máximo3s para telemetría; después tree.Quit. _ExitTree inicia State.DisposeAsync y guarda Task Shutdown, sin que ese callback espere su finalización. |
| `integration/sqlite/LocalGameplayObserver.cs`, CloseAsync/Flush/DrainAsync/Pump | Encola último intervalo y SESSION_ENDED normal, espera cola de escrituras fuente; no drena Outbox secundaria. Si quedan pendientes informa TELEMETRY_CLOSE_INCOMPLETE. |
| `integration/sqlite/GamePersistenceAdapter.cs`, Execute/WriteEventAsync/WriteIntervalAsync | Gate compartido serializa SQLite; una escritura exitosa ya confirmada solicita `_outbox.Request()`. Solicitar no equivale a esperar captura. |
| Mismo adaptador, CloseAsync/DisposeAsync/OutboxPageAsync | Cancela/espera scheduler antes de cerrar DB; no hace pasada final de reconciliación. |
| `integration/sqlite/LocalGameState.cs`, DisposeAsync | Delega cierre al adaptador; no hace flush de Outbox. |
| `local-persistence/src/LocalOutboxScheduler.cs.txt`, Run/Request/DisposeAsync | Coalescing2s, retry30s, páginas25 con yield25ms. Dispose cancela token; puede cancelar espera/coalescing o impedir páginas siguientes. No ofrece DrainAsync. La página ya iniciada puede confirmar antes de terminar. |
| `local-persistence/src/LocalOutboxPump.cs.txt`, Step | Página atómica de cola y dependencias; sin migración automática. Conflictos/errores locales visibles; no altera decisiones ni progreso. |
| `local-persistence/src/SyntheticOutboxReconciler.cs.txt`, ReconcilePage/PrepareSyntheticPage; `SyncFactInventory.cs.txt` | Relee hechos confirmados, incluye terminal solo para closed/interrupted, captura e inspección paginadas; cursores reiniciables, deduplicación persistida. |
| `local-persistence/src/SyncOutboxService.cs.txt`, Capture; `SyncOutboxProjection.cs.txt`, Read | Claves tipadas/UUID/huella inmutables; captura repetida retorna operación existente. Proyección Menu preserva estado/límites. |
| `GameplayEventService.cs.txt`, `UnitOfWork.cs.txt`, `GameSaveService.cs.txt`, `StatisticsService.cs.txt` | Commit fuente separado de captura secundaria, estadísticas originales y fuentes autoritativas. No modificados. |

## Causa demostrada y límite de atribución

**Existe una ventana verificable de cierre entre commit principal y captura posterior:** esperar DrainAsync del observador no espera la Outbox; tree.Quit y DisposeAsync pueden cancelar el worker durante coalescing. Una pasada previa tampoco puede capturar hechos que se confirman después. No es un defecto demostrado del algoritmo de reconciliación: las pruebas recuperan los hechos con el código existente.

Se reprodujo de forma determinista con el observador real sin escenas, SQLite sintético y scheduler real: capturar apertura, cerrar observador a3932ms, comprobar fuentes confirmadas, solicitar captura secundaria y cancelar scheduler antes de la página. Se inyecta coalescing largo cancelable para controlar el orden sin esperar una hora; no es una medición del temporizador real de2s. El delegado de captura no se ejecutó, las fuentes quedaron closed+Menu y faltaron exactamente los dos registros; una pasada posterior los recuperó.

**La causa exacta de la sesión real no está trazada.** Su última captura fue07:05:26.421Z, unos299,91ms antes del cierre fuente. Esto es compatible con la ventana demostrada, pero no prueba qué callback/cancelación sucedió. No hay evidencia nueva que atribuya ese caso a excepción, Node liberado, fallo de SQLite o fallback sin contexto. No se ejecutó Godot para observarlos. Se trata de falta de representación secundaria, no de pérdida del hecho original. El timeout3s de telemetría es otro riesgo: no garantiza que lo nunca confirmado pueda recuperarse.

## Implementación y pruebas nuevas

No fue necesario corregir servicios de captura/reconciliación. No se cambió código productivo, versiones, esquemas, observador, adaptador, escenas ni gameplay. Solo:

- Nuevo `local-persistence/game-save-tests/OutboxShutdownRecoveryChecks.cs.txt`,24 casos.
- `GameSaveChecks.cs.txt`: selector `--outbox-shutdown-recovery`.
- `ReconciliationChecks.cs.txt`: fixture y lanzador de proceso existentes pasan de private a internal, dentro del ejecutor sintético; se conserva guarda estricta de rutas de ProbeStore.
- `GameplayObserverChecks.cs.txt`: Store sintético pasa de private a internal para reutilizar el observador real. No cambia su comportamiento.

Las24 pruebas cubren terminal confirmado, omisión terminal sola(1 nueva), intervalo solo(1), ambos(2), payload terminal original, Menu0..3932, tiempo efectivo0 y animal previo10ms conservado, segunda pasada0/mismos UUID/payload/huellas, recuperación en proceso nuevo y otro reinicio sin cambios, cierre real del observador con cancelación secundaria, pasada anterior al commit, no inventar terminal abierto, duplicados terminal/intervalo, OperationId contradictorio rechazado, IOException antes de commit con rollback/retry, SQLite ocupado y retry, muerte de proceso precommit con rollback y recuperación posterior, cursor abandonado/reinicio, historial/decisiones/ambientes idénticos, dependencias open, pending sin ACK y esquemas/capturas originales conservados.

Resultados: **24/24 nuevas +741/741 regresiones =765/765 aprobadas.** Ejecuciones actuales, no resultados heredados:

| Suite | Aprobadas |
|---|---:|
| Base SQLite |43|
| Activación Outbox / reconciliación / Outbox |28 /51 /64|
| Progreso / menú runtime / selección / decisiones / entrada animal |42 /35 /30 /30 /29|
| Retorno menú / reinicio animal / Game Over |11 /21 /19|
| Estadísticas locales / pantalla / eventos / observador / actividad |39 /24 /41 /31 /23|
| CompleteBiome / finales locales |54 /126|
| Nueva recuperación al cerrar |24|

También se reejecutaron comprobaciones de ausencia de referencias HTTP/Mongo/JWT/Godot en la biblioteca de captura; no conexiones ni servicios. Tests de backend que requieren Node/HTTP no se ejecutaron. Las15/15 manuales anteriores no se presentan como nuevas.

Biblioteca y ejecutores .NET8:0 errores/0 advertencias. Rebuild del proyecto C# Godot:0 errores/**63 advertencias CS0618 históricas** de ParallaxBackground,0 nuevas. Se compiló con dotnet, sin iniciar motor/editor. Sin restore ni descargas de dependencias.

Comandos empleados (cachés DOTNET_CLI_HOME/NUGET_PACKAGES dentro de `local-persistence/.work`; sin cargar configuración backend):

```powershell
dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore --disable-build-servers -nodeReuse:false
& local-persistence/.work/bin/GameSave.Checks/Debug/net8.0/win-x64/GameSave.Checks.exe --outbox-shutdown-recovery
& ./local-persistence/run-checks.ps1
# Mismo ejecutor con los selectores de las18 suites anteriores, uno por ejecución.
$dir=(Join-Path (Get-Location) 'integration/sqlite/.work')+'\'
dotnet build TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild "-p:GodotProjectDir=$dir"
```

Todas las bases mutadas fueron creadas por SyntheticSandbox bajo `.work/databases/<UUID>/<UUID>.sqlite3`. Los procesos hijos usan la capacidad sintética existente, nunca rutas protegidas. No se realizó repair sobre una copia de datos reales: no hizo falta para demostrar el mecanismo.

## Propuesta de parche futura, NO aplicada ni autorizada por este informe

Alcance propuesto: `GamePersistenceContext.cs` (secuencia de cierre), `GamePersistenceAdapter.cs` (puerto de drenaje serializado), `LocalOutboxScheduler.cs.txt` (petición inmediata y barrera de finalización) y pruebas sintéticas. LocalGameplayObserver y gameplay no necesitan cambiar para esta ventana. Evitar usar Delay fijo como garantía de captura.

Pseudoparche conceptual; las APIs siguientes aún NO existen:

```text
QuitAsync, con guard de un solo cierre:
  detener nuevas observaciones/comandos
  esperar cierre de telemetría hasta su presupuesto de 3s
  si fuentes cerraron, await adapter.DrainOutboxAsync(presupuesto adicional de 1s)
  registrar resultado local sin payload/IDs/secretos
  cerrar worker/DB de forma coordinada; después tree.Quit
  _ExitTree es fallback idempotente; ninguna continuación usa Nodes liberados
```

1s adicional es una propuesta a validar, no una latencia garantizada. Debe limitar admisión de páginas/esperas con deadline monotónico; una transacción SQLite en curso puede tardar su busy timeout y no se debe cerrar su conexión desde otra tarea. Revisar cota de busy/tiempos de página para que la espera del juego permanezca acotada, sin prometer cancelación instantánea del I/O. Si expira presupuesto, emitir OUTBOX_CLOSE_DEFERRED y conservar fuentes; no abortar progreso ni crear ACK.

El drenaje debe omitir coalescing, comenzar desde cursor null después del último commit, usar el mismo gate para cada página y terminar solo con última auditoría completa/consistente. No sostener ese gate mientras se espera al scheduler que lo necesita. Una simple petición o un Passes incrementado de pasada anterior no es barrera; asociar solicitud/generación y resultado a commits que preceden la barrera. No marcar éxito si se canceló/falló o quedan incidencias.

Mantener recuperación al inicio mediante pump existente, una sola binding, sin HTTP y sin migrar ausencias. Repetir páginas/reintentos periódicos existentes; después de cierre forzado o reinicio de Windows arrancar cursor null y deduplicar por clave persistida. Nunca duplicar operaciones ya confirmed ni regenerar su UUID/sobre; preservar recibos existentes. Errores busy/capacidad/integridad se diagnostican y reintentan según política, sin ciclos infinitos ni reescribir fuentes. No guardar un cursor en memoria como única evidencia durable.

Tras crash de página: transacción no confirmada se revierte; páginas anteriores sobreviven; la siguiente pasada completa recupera lo pendiente. Solo son recuperables hechos confirmados. Cortes eléctricos, fallos de almacenamiento o telemetría nunca confirmada no se solucionan prometiendo un flush secundario. La auditoría íntegra puede requerir más que el presupuesto de cierre en historias grandes; completar diferido al próximo inicio y medir rendimiento, sin esperar red.

## Activación y criterios pendientes

Solicitar autorización separada para el parche de ciclo de vida anterior y su validación, manteniendo B00/credenciales/red separados. Después, autorizar explícitamente recuperación de runtime con preflight/backup consistente privado y ensayo en segunda copia, nunca reparación automática implícita por este documento. Un siguiente arranque actual ya puede escribir por reconciliación existente; no se inició el juego aquí.

Plan manual posterior: salida por menú y por X tras sesión Menu de3,932s; repetir al terminar segmento/pausar; doble clic de salida; SQLite ocupado; timeout; cierre forzado y reinicio del proceso/Windows. Sin internet. Verificar fuentes→capturas en lectura después de cada caso, IDs existentes/decisiones/ambientes/tiempo efectivo iguales y ausencia de callbacks sobre Nodes liberados. El reinicio puede crear una nueva sesión: recalcular cobertura actual, no exigir855 como total universal.

Para cerrar B05.3: recuperación real expresamente autorizada y auditada, cero fuentes elegibles faltantes/duplicados/contradicciones/huérfanos/dependencias incompletas, IDs originales preservados, errores de cierre controlados y validación Godot documentada. Con esta fotografía inmutable, recuperar solo los dos hechos llevaría853→855; es predicción sintética, **no resultado runtime**. La runtime sigue853 y dos faltantes.

Recomendación B05.4A: esperar esas comprobaciones y tratar explícitamente B00/identidad/contratos de receptor antes de implementación remota. Tener pending no autoriza envío. B05.4 no iniciada.

## Integridad y límites

Se controla hash/tamaño/mtime de las tres bases protegidas y nueve archivos asociados respecto al inicio de esta fase; no respecto a la fotografía anterior a la migración sync1. `.env` solo se hashea/verifica metadatos:278 bytes y SHA-256 histórico `4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928`, sin leer texto/variables. No se utilizan sus credenciales. Owner/SDDL de raíz,backend,.env,local-persistence,.git se comparan antes/después; no sustituye una auditoría exhaustiva nueva de todos los permisos del árbol. B00 y sus ACE no resueltas siguen pendientes.

No restauraciones, WAL/SHM eliminados, migraciones reales, cambios ACL/owner, servidores, Node, Godot ejecutado, HTTP, Atlas o AWS. Fuentes y estadísticas productivas intactas. Los artefactos de compilación bajo `.work` y `integration/sqlite/.work.godot` se contabilizan aparte de cambios deliberados. Detenerse al terminar; ninguna autorización de B05.4 o reparación runtime se presume.

### Resultado de la comparación final

Inventario inicial1370 archivos,final1372:11 cambios deliberados (9 existentes modificados y2 nuevos) correspondientes exclusivamente a los7 documentos autorizados y4 archivos de pruebas descritos;19 artefactos existentes de compilación bajo `integration/sqlite/.work.godot` cambiados aparte;0 eliminaciones. Los1342 archivos restantes del inventario inicial conservan hash/tamaño/mtime. `.work` temporal se excluye del inventario de código y se controla separadamente para las bases protegidas.

**Las tres bases y sus9 archivos asociados son idénticos en hash/tamaño/mtime al inicio de esta fase.** Runtime sin escritura/reparación. `.env` conserva278bytes,hash histórico yfecha de modificación;owner/SDDL de las5 rutas controladas idénticos. No cambios de ACL/ACE/herencia/propietario. Cero archivos sintéticos restantes bajo `.work/databases`;cero procesos propios de pruebas/compilación o Godot/Node detectados al finalizar. No afirmar resuelto B00 ni cerrada B05.3. Trabajo detenido.

## B05.3B.2E.1 — Cierre acotado implementado

2026-10-28, America/Guatemala. **COMPLETADA EN CÓDIGO, con validación Godot pendiente. No recuperación real.** La propuesta de D anterior deja de ser una propuesta sin código en los archivos que se detallan aquí; sus antecedentes y resultados D permanecen históricos.

### Comprobación previa de unidades

`GameplayInterval.StartMs/EndMs` y `GameplayEvent.OffsetMs`, columnas INTEGER `start_ms/end_ms` y reloj monotónico ElapsedMilliseconds usan **milisegundos**. `SyncOutboxProjection.Read` serializa los mismos enteros como `startMs/endMs`, sin multiplicación o división. La fotografía read-only de D contiene start_ms=0 y end_ms=3932, state=Menu. Por tanto, duración **3932 ms = 3,932 s** (coma decimal española). Escribir «3,932 ms» para representar ese total es una transcripción ambigua/incorrecta en esa notación; no es la unidad ni magnitud guardada. La expresión previa «3,932 segundos» es una conversión correcta, no una duración distinta. No se consultó contenido de secretos ni se convirtió/modificó el intervalo real. El intervalo Menu aporta cero tiempo efectivo animal.

### Archivos de código cambiados

| Ruta | Cambio mínimo |
|---|---|
| `local-persistence/src/LocalOutboxScheduler.cs.txt` | `LocalOutboxDrain` y `DrainAsync(budget)` terminal, única Task compartida, cancelación del worker previo y pasada nueva paginada sin coalescing; plazo y resultados seguros. Dispose espera página/trabajo antes de liberar. |
| `integration/sqlite/GamePersistenceAdapter.cs` | `DrainOutboxAsync` cierra admisión de operaciones fuente y delega barrera. El gate existente serializa fuentes ya en vuelo y páginas; no se espera al scheduler sosteniendo el gate. |
| `integration/sqlite/GamePersistenceContext.cs` | Task de salida única, orden telemetría→drenaje→liberación→tree.Quit, presupuestos separados, guards de Node y diagnóstico de telemetría puramente gestionado hasta que el hilo Godot pueda publicarlo. |
| `local-persistence/game-save-tests/GameSaveChecks.cs.txt` | Selector `--outbox-bounded-close`. |
| `local-persistence/game-save-tests/OutboxBoundedCloseChecks.cs.txt` | Nueva batería sintética de26 casos. |

No cambios a LocalGameplayObserver, algoritmos de reconciliación/proyección, schemas/migraciones, servicios de dominio/estadísticas, FinNivel, evaluador/finales, decisiones, personajes, biomas, recursos o escenas. Startup ya solicitaba reconciliación al abrir/verificar la base; se reutiliza y prueba, sin duplicar workers ni introducir otra migración. Documentos actualizados: este informe, POSTVALIDATION, GODOT_RUNTIME_TEST_PLAN, ROADMAP, PHASES, PHASE_HISTORY y DECISIONS.

### Orden y presupuestos reales

1. Menú/WMCloseRequest comparten la misma QuitAsync Task; `_quitting` evita nuevas observaciones/entradas del contexto y notificaciones de foco durante la salida. El observador existente ya rechaza nuevas observaciones al comenzar CloseAsync.
2. Esperar inicialización y cierre de telemetría, hasta **3s**. CloseAsync persiste intervalo final y evento terminal fuente bajo el gate existente.
3. Solo si esa Task terminó correctamente y Pending=0, iniciar barrera del adaptador con **1s**. Se cierra admisión posterior de fuentes; escrituras ya en vuelo finalizan bajo el mismo gate antes de una página. No se cancela la captura para efectuar el cierre de telemetría.
4. La barrera detiene el worker anterior y espera su página activa. Después comienza cursor null y recorre lotes existentes (25 en adaptador) sin coalescing2s ni yield25ms. No hay pasadas simultáneas: el nuevo trabajo espera terminar el anterior. Cada página mantiene su transacción atómica y cede ejecución entre páginas.
5. Solo última página `Completed && Consistent`, dentro del plazo, devuelve **OUTBOX_DRAINED**. Si hay incidencia conserva su código seguro y distingue IntegrityFailure; corrupción/esquema incompatible se presentan como error de almacenamiento, no aviso secundario inocuo. Un conflicto no se oculta como éxito.
6. Si vence el plazo, devuelve **OUTBOX_CLOSE_DEFERRED**, solicita cancelación y no afirma cuántas filas terminaron después de ese límite. Cancelación se comprueba antes y después de página. Una página SQLite ya ejecutándose puede terminar/confirmar; no se cierra su conexión desde otra tarea. Dispose conserva esa espera de seguridad internamente.
7. La salida espera hasta **1s adicional** por liberación. Si la telemetría había agotado su plazo, se informa cierre diferido y la liberación gestionada espera terminar esa Task antes de cancelar el worker: no se drena contra un cierre fuente todavía en vuelo. Godot puede terminar sin esperar indefinidamente esa limpieza. La ventana ordinaria de esperas explícitas es hasta3+1+1=**5s**; si no se admite drenaje, hasta3+1=4s. No es garantía de tiempo real frente al SO/hardware ni de que un cierre forzado ejecute el código.

Si la limpieza supera su plazo, solo queda trabajo gestionado: los callbacks de telemetría guardan un código sin utilizar Nodes; advertencias/cierre del árbol comprueban validez. El fallback _ExitTree inicia liberación únicamente si no existía salida coordinada. No ofrece garantía de flush ante terminación forzada. No hay busy-wait ni espera síncrona del hilo principal por SQLite.

Una llamada de drenaje repetida devuelve la misma Task/resultado: **no reintenta** una salida cuyo presupuesto ya venció. El siguiente inicio es el responsable de completar lo diferido. Los códigos de drenaje indican captura local, nunca entrega remota. No se registran UUID personales, payloads ni secretos en consola.

### Recuperación al inicio y tras interrupciones

El adaptador abre y verifica la base antes de componer LocalOutboxPump/Scheduler. No automigra sync ausente: OUTBOX_NOT_ACTIVATED. Después Request inicia la reconciliación existente coalescida, no bloquea indefinidamente la jugabilidad. Un solo worker comparte gate con escrituras. Reintento periódico30s y paginación existentes conservados.

La pasada nueva o posterior a crash comienza desde cursor null, identifica fuentes SQLite confirmadas y reutiliza binding/clave/operación/huella. Sesiones abiertas no reciben terminal ficticio. Confirmaciones remotas y estados de entrega existentes no se reescriben (también cubierto por regresión de filas confirmed). Una página interrumpida sin commit se revierte; páginas confirmadas sobreviven. Se recuperan únicamente hechos realmente persistidos; no eventos perdidos antes de commit ni duraciones inventadas tras apagado de Windows. Decisiones/finales/estadísticas son fuentes, no destinos de reparación Outbox.

### Pruebas y compilaciones E.1

**26/26 nuevas +765/765 regresiones =791/791 comprobaciones,0 fallidas.** No se cuenta la repetición de una batería como pruebas adicionales.

La suite nueva prueba: cierre normal con observador/adaptador reales sin escenas; fuente terminal confirmada antes de barrera; exactamente dos recuperadas; omitir coalescing; límites Menu3932ms/tiempo efectivo0; Task de drenaje repetida; solicitudes posteriores ignoradas; timeout con página que no coopera; resultado diferido no sustituido por éxito tardío; excepción sanitizada y recuperación nueva; SQLite ocupado y fuente intacta; cierre durante página sin solapamiento; cancelación previa sin falso éxito; startup recupera ambos; repetir apertura conserva IDs/huellas/sobres/estados; reinicio de proceso sin duplicación; proceso interrumpido antes de commit y recuperación; partida completed/decisiones/ambientes intactos; pausa1000ms y Menu3932ms sin aumentar10ms efectivos previos; fuentes rechazadas después de barrera; ausencia sync sin migración; corrupción diferenciada; no fabricar terminal abierto; conflicto impide éxito; pending sin recibos ficticios; ausencia HTTP/Mongo/Godot/JWT en referencias de biblioteca.

Regresiones reejecutadas:43 base;24 recuperación D;28 activación;51 reconciliación;64 Outbox;42 progreso;35 menú;30 selección;30 decisiones;29 entrada animal;11 retorno;21 reinicio;19 Game Over;39 estadísticas;24 pantalla;41 eventos;31 observador;23 actividad;54 CompleteBiome;126 finales. Son pruebas sintéticas, no sesiones manuales nuevas.

Build biblioteca/ejecutores: **0 errores,0 advertencias**. Rebuild proyecto Godot C#: **0 errores,63 advertencias históricas CS0618 ParallaxBackground,0 nuevas**. Godot no ejecutado; no se afirma validación de señales/ventana/objetos en motor. Sin restore/instalación de dependencias, Node, HTTP, Atlas o B05.4.

Comandos nuevos: mismo build `GameSave.Checks.csproj --no-restore --disable-build-servers -nodeReuse:false` y ejecutor con `--outbox-bounded-close`; se reejecutaron los selectores de regresiones y run-checks.ps1. Build Godot C# con dotnet Rebuild y GodotProjectDir en integration/sqlite/.work como en D; sin cargar backend/.env. Artefactos de build aislados no son modificaciones de escenas.

### E.2 propuesto y limitaciones pendientes

**No abrir el juego contra runtime como parte de E.1:** el startup existente puede recuperar con escritura los dos faltantes. No se hizo aquí. La fotografía runtime permanece853pending,838/840 fuentes actuales y dos faltantes; no se presenta la recuperación sintética como reparación real.

E.2 debe autorizar expresamente: comprobar estabilidad/procesos/rutas/links e integridad, backup consistente privado nuevo sin sobrescribir anteriores, ensayo de recuperación en segunda copia, y luego recuperación real por reconciliación existente sobre ruta exacta. Comparar fuentes/estadísticas/UUID/estados y confirmar cobertura completa sin otros cambios. Sin nueva actividad, la predicción es853→855; si se abre Godot, habrá nuevas sesiones/fuentes y se recalculan conteos. No exigir855 como total universal ni restaurar automáticamente ante error.

Después de ese permiso y respaldo, validación manual del cierre por menú y X, salida inmediata y durante actividad/captura, doble clic, pausa/menú, reinicio normal/inesperado y recuperación offline. Errores SQLite/timeout/corrupción destructivos solo en fixtures. Guía en GODOT_RUNTIME_TEST_PLAN. No reescribir historia para simular escenarios.

Pendientes: validación real del ciclo Godot, rendimiento con historia grande, riesgos del SO/página lenta y B00/ACE no resueltas. B05.3 no cerrada; B05.4 no iniciada. Detenerse y esperar autorización E.2.

### Verificación final E.1

Inventario de1372→1373 archivos: **12 cambios deliberados**, de los cuales11 existentes modificados y1 nuevo; corresponden exclusivamente a7 documentos,3 archivos productivos de coordinación y2 de pruebas. Además cambiaron19 artefactos existentes de compilación bajo `integration/sqlite/.work.godot`. Cero eliminados; los1342 archivos restantes del inventario inicial conservan hash/tamaño/mtime. Temporales `.work` excluidos del inventario de código; bases reales controladas por separado.

Las **tres bases protegidas y sus9 archivos asociados permanecen idénticos en hash, tamaño y mtime** respecto al inicio E.1. No se ejecutó una reparación ni un inicio Godot que pudiera capturar los dos faltantes. `.env` mantiene278bytes, SHA-256 histórico `4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928` y misma fecha; no lectura de texto/variables. Owner/SDDL de raíz,backend,.env,local-persistence,.git idénticos; no cambios de ACE, herencia o propietarios. B00 pendiente. Cero archivos sintéticos restantes y cero procesos propios/Godot/Node detectados al finalizar.

La liberación gestionada en salida coordinada captura fallos y conserva únicamente el código LOCAL_STORAGE_CLOSE_FAILED; si aún existe el Node se publica desde la continuación Godot, sin dejar excepciones tardías de esa limpieza sin observar. Ese código y la ausencia de callbacks sobre objetos liberados requieren validación manual. El último ajuste afecta solo GamePersistenceContext, que no forma parte del ejecutor sin escenas: recompilado Godot C# con0errores/63advertencias históricas; las791comprobaciones corresponden a los servicios/fixtures probados, no a ejecución del motor. Trabajo detenido.

## B05.3B.2E.2 — Auditoría satisfactoria y cero recuperación adicional

2026-10-28. El usuario informa validación manual E.1 de 10/10; no se ejecutó Godot aquí. Al preflight ya existían 906 pending y 889/889 fuentes actuales representadas. Se confirmó específicamente el terminal antiguo y el intervalo Menu original de 3932 ms, sin aporte efectivo animal. No se atribuyen inserciones anteriores al agente.

Respaldo privado nuevo verificado y ensayo en segunda copia: primera y segunda reconciliación con cero inserciones, todos los datos y esquemas intactos. Runtime permaneció en solo lectura: cero escrituras y cero inserciones en E.2. Auditoría final satisfactoria, sin faltantes, duplicados, contradicciones, huérfanos ni dependencias incompletas. Tiempo efectivo actual 1158719 ms conservado. 791 regresiones sintéticas reejecutadas, todas aprobadas; cero pruebas nuevas.

**E.2 COMPLETADA; B05.3 completada en su alcance local de captura y reconciliación**, sin implicar recepción remota ni cierre de B05 completo. Las dos bases históricas, runtime, .env y ACL permanecen intactas en E.2. B00 pendiente; no B05.4. Ruta/hash del respaldo, incidencias del helper, conteos y límites en [B05_OUTBOX_RUNTIME_RECOVERY_RESULT.md](B05_OUTBOX_RUNTIME_RECOVERY_RESULT.md). Detenido.
