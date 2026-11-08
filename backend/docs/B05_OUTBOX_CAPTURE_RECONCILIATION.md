# B05.3B.1 — Captura y reconciliación Outbox

2026-10-28, America/Guatemala. **COMPLETADA EN CÓDIGO exclusivamente en SQLite sintético. Runtime no activada ni migrada.**

## Inventario e inspección

Se contrastaron los documentos obligatorios con Models/SQLiteRepository, GameSaveService/UnitOfWork, GameplayEventSchema/Repository/Service y SyncOutboxModels/Schema/Projection/Service. Los resultados anteriores (598 offline,12/12 manuales,124 identidad,662 local-persistence) son antecedentes; abajo se separan las ejecuciones de esta fase.

Métodos fuente reales, sin modificaciones: GameSaveService.CreateLocalProfile/CreateNewGame/SaveCurrentGame/EnterBiome/RecordDecision/CompleteBiome/PrepareFinal/CloseGame y UnitOfWork.Write; GameplayEventService.RecordEvent/RecordInterval/InterruptSession. La lectura usa los repositorios SQLite existentes, con la misma transacción de captura. No se extrae un payload del digest de local_operations ni se usa la antigua cola JSON remota.

## Matriz de los quince hechos solicitados

Todas las operaciones analíticas usan sobre schemaVersion1, dueño y vínculo local; no hay nuevo tipo de API. El UUID de operación se conserva separado del UUID fuente.

| Hecho | Fuente e identificadores originales | Representación mínima y límites |
| --- | --- | --- |
| Perfil | local_profiles.local_player_id | sync_installations liga ese UUID al installationId local/generación proporcionados. Sin nombre, correo, credential_ref ni perfil remoto inventado. No existe profile.report aprobado. |
| Partida creada | saved_games.GameId/revision/CreatedAt | game.report de revisión disponible; conserva GameId/fecha original y cinco biomas. No fabrica snapshot de revisión0 si ya no existe. |
| Decisión confirmada | environmental_decisions.DecisionId/OperationId/orden | Una entrada en decisions de game.report; opción/key/versiones/fecha, sin segundo mensaje decision.report. |
| Consecuencia confirmada | environmental_state y decisión enlazada | Verifica LastDecisionId/StateKind y opción/consecuencia; exporta campos permitidos de decisión/clasificación, sin JSON libre ni proyección duplicada. |
| Entrada a bioma | recibo enter_biome y revisión de saved_games | Captura revisión disponible; el contrato no exporta current_biome_id humano. No reconstruye visita humana exacta desde un digest ni inventa evento de entrada. Entrada animal sí tiene evento cuando fue registrado. |
| Bioma completado | biome_progress + revisión/GameId/BiomeId | status/result/animalCompletedAtUtc en game.report. Un marcador de telemetría ausente no se fabrica. |
| Sesión registrada | gameplay_sessions.SessionId | session.report open y, si existe terminal, terminal; conserva límites/estado. SESSION_STARTED/ENDED no se vuelven a encolar como eventos nuevos equivalentes. |
| Entrada animal | gameplay_events.EventId/AnimalRunId | gameplay.event ANIMAL_SEGMENT_STARTED, mismo dueño/sesión/partida/bioma/offset medido. |
| Muerte | EventId/RunId/kind/DeathCause | ANIMAL_DIED real, nunca inferido por attempts o ausencia de vida guardada. |
| Reinicio voluntario | EventId y run original | ANIMAL_RESTART_REQUESTED; solicitud confirmada, no éxito de nueva escena. |
| Reintento | EventId y run original | ANIMAL_RETRY_REQUESTED; no equivale a otra muerte ni a reinicio voluntario exitoso. |
| Salida animal | EventId/RunId | ANIMAL_SEGMENT_EXITED medido, sin inferencia por abrir menú. |
| Tiempo confirmado | gameplay_intervals.IntervalId | gameplay.interval con sesión/run/ámbito, start/end/state originales. Solo ActiveAnimal/ActiveHuman son efectivos; no suma Paused/Menu/GameOver/Loading/Background. |
| Resultado final | saved_games ending/ending_rules_version/completed_at | game.report final_pending o completed; versión local-ending-reject-count-1 y regla verificada. No acredita final leído. |
| Cierre global | saved_games status/is_current/archived_at y revisión | game.report completed con closedAtUtc original, distinto de preparación del final. Historia intacta. |

Clave de cola: game:GameId:revision; session:SessionId:open|terminal; event:EventId; interval:IntervalId, única por dueño/instalación/generación. Payload conserva versiones y fechas fuente cuando existen; normaliza UTC a milisegundos según contrato, no crea una fecha de evento para intervalos que carecen de ella. createdAtUtc del sobre es la primera captura y no cambia al reintentar.

Progreso/decisiones/final son autoridad del agregado. Eventos animales, incluido ANIMAL_SEGMENT_COMPLETED si existe, conservan su contexto temporal/run; no se deben sumar como otra decisión/completion del agregado. El receptor futuro deduplicará métricas por fuente lógica, no por cantidad de mensajes. Una sesión se representa canónicamente por SessionId+phase; eventos SESSION_* históricos ya en cola no se borran: se diagnostican para revisión.

## Código e inventario de archivos

Nuevos:
- local-persistence/src/SyncReconciliationModels.cs.txt: cursor y resumen seguro por página.
- local-persistence/src/SyncFactInventory.cs.txt: inventario paginado y prerrequisitos desde fuentes.
- local-persistence/src/SyntheticOutboxReconciler.cs.txt: captura, backfill y auditoría sintéticos.
- local-persistence/game-save-tests/ReconciliationChecks.cs.txt:51 casos.
- Este documento.

Modificados:
- SyncOutboxProjection.cs.txt: valida consistencia de cinco biomas, decisiones y consecuencias enlazadas, sin cambiar el formato válido.
- SyncOutboxService.cs.txt: comparte internamente búsqueda/contrato de binding; una captura antigua ya no acepta fuente de partida ausente ni regresión de revisión.
- game-save-tests/GameSaveChecks.cs.txt: dispatcher --reconciliation/--reconcile-probe.
- game-save-tests/OutboxChecks.cs.txt: reutiliza la capability de proceso sintético; solo visibilidad interna de ProbeStore.
- Ocho documentos autorizados: B05_LOCAL_OUTBOX_IMPLEMENTATION, B05_SYNC_ARCHITECTURE, B05_SYNC_API_CONTRACT, B05_IMPLEMENTATION_ROADMAP, PHASES, PHASE_HISTORY, DECISIONS y local-persistence/README.

Total17 archivos deliberados (12 existentes y5 nuevos), aparte de artefactos de compilación en .work. No csproj, paquetes, migraciones/checksums base2/gameplay1/sync1, controladores Godot o código Node modificados. No nueva tabla ni versión: el esquema sync1 ya admite vínculos/dependencias/dedupe necesarios.

## Contrato y procesamiento por lotes

SyntheticOutboxReconciler solo se compone públicamente con SyntheticDatabase; no acepta ruta runtime ni abre bases AppData. No migra automáticamente. ReconcilePage recibe SyncBinding, límite1..100 (defecto50), origen live_capture/historical_import y cursor opcional. El vínculo son referencias locales explícitas, no prueba de propiedad remota ni requisito de JWT.

La primera página inserta idempotentemente el vínculo LOCAL del perfil existente en la misma transacción que la cola. El llamador debe reutilizar el mismo installationId, nunca generar uno por pasada. Perfil sin partida puede conservar ese vínculo sin exportar datos personales o crear una cuenta remota.

Dos etapas:
1. Captura: consulta hechos existentes por clave rank+UUID y crea solamente representaciones faltantes. Orden: partidas, sesiones open, entradas animales, otros eventos animales, intervalos, sesiones terminales.
2. Auditoría: recorre TODAS las filas del vínculo por operationId, incluidos confirmed/permanent_failure, para detectar huérfanos, contradicciones y dependencias deficientes que no aparecerían en un inventario solo de fuentes.

Cada página usa transacción SQLite inmediata. Dedupe/lectura fuente/prerrequisitos/operaciones de esa página comparten conexión y transacción. Un savepoint por candidato evita dejar padres/hijos parciales al rechazar un hecho inválido; un error de almacenamiento/cuota aborta la página completa. No se escribe en las tablas fuente.

Memoria de DTO acotada por página; recursión de dependencias<=8 y presupuesto de inserciones acotado. SQL/orden/categorías fijos, valores parametrizados. Las verificaciones de integridad base y el ordenamiento SQL pueden recorrer más que el límite: no se promete latencia constante en una base grande. Son pruebas sintéticas, no benchmark de volumen real.

El cursor es un indicio local reanudable, ligado a binding/origen, NO un recibo ni checkpoint durable de dominio. Los IDs y estados importantes están en SQLite. Perder el cursor obliga a reiniciar desde null: se revalidan originales, sin duplicar. Inserciones/modificaciones detrás del cursor entre páginas requieren otra pasada completa; no hay fotografía global entre commits de páginas. Así no hace falta alterar migraciones para simular progreso durable de un escáner.

Committed=false impide interpretar el cursor como avance confirmado. Completed solo indica fin de recorrido; Consistent exige ausencia de diagnósticos. PreviousIssues viaja en el cursor para que una última página limpia no oculte problemas anteriores. Un consumidor debe conservar todos los resúmenes y repetir desde null tras atender errores; no autorizar entrega basándose en una página parcial.

DiagnosticSummary solo imprime cantidades/flags, sin nombre/UUID/payload/ruta/secretos. Diagnostics expone códigos sanitizados y conteos. El DTO de cursor contiene IDs necesarios para paginar y no debe usarse como texto de log. Errores de fuentes o de filas ya existentes se vuelven a detectar al repetir; no se borran estados/error_codes de Outbox ni se silencian permanent_failure.

## Idempotencia y auditoría

La representación existente conserva OperationId, sobre, fecha, hash, origen y dependencias originales aunque el escaneo actual se solicite como historical_import. No se cambia un registro live_capture por repetir backfill.

Para una revisión de partida aún actual se reconstruye el sobre y compara contenido/hash exactos. Para revisiones antiguas capturadas: se verifica hash/canonicalización/identidad del sobre, existencia de la partida, monotonicidad, metadatos inmutables y que las decisiones contenidas sigan coincidiendo con sus fuentes. HistoricalSnapshots señala que no puede reconstruirse por completo el estado intermedio desde las filas actuales. No se usa esa limitación para ignorar contradicciones de metadatos/decisiones.

Filas sin evento/intervalo/sesión fuente generan ORPHANED_OUTBOX, sin borrar ni fabricar fuente. Una rotura de FK estructural puede impedir toda la página con CORRUPT_STORAGE; no se «repara». Contradicciones de consecuencias, contenido o revisión generan diagnóstico y dejan intactas las fuentes y filas previas. No se renombran claves para eludir conflictos.

Si alguien elimina una fila de cola ya confirmada y también su evidencia de ID, el UUID aleatorio original no se puede derivar del hecho fuente. Eso es pérdida/manipulación de almacenamiento fuera del protocolo, no una promesa de recuperación del UUID borrado. La recuperación demostrada es de capturas que nunca hicieron commit y de filas/IDs aún conservados; dedupe remoto deberá usar además claves naturales.

## Dependencias y autorización futura

No se encola un perfil ni una credencial como si fuera identidad remota. Una partida se guarda/captura con UUID local e instalación, sin correo, contraseña, token o technicalAccountId remoto.

Para nuevas operaciones, el reconciliador agrega antes sus prerrequisitos reales:
- session terminal depende de session open.
- evento animal depende de session open y game.report disponible.
- eventos posteriores e intervalos de run dependen además de ANIMAL_SEGMENT_STARTED.
- intervalos globales sin game/run dependen de session open.
- game.report autocontenido no depende de telemetría para confirmar progreso.

Padres se capturan con la misma transacción; restricciones compuestas impiden cruzar dueños/vínculos. Reserve de B05.3A solo devuelve hijos cuando los padres están confirmed. Reconciliación NO confirma padres ni emite recibos. El reporte terminal puede preceder intervalos tardíos según el contrato remoto; no se inventa dependencia de cada intervalo de una sesión extensa.

Filas antiguas que carecían de dependencias se diagnostican DEPENDENCY_COVERAGE_INCOMPLETE; no se reescriben silenciosamente, en particular si están confirmadas. Padre permanent_failure y eventos redundantes de sesión requieren revisión explícita. No hay transporte actual que pueda enviar esas filas.

Antes de un envío futuro deben comprobarse asociación remota autenticada account/installation/localPlayer/generación, esquema/vectores C#/Node y una pasada íntegra sin problemas, además de resolver filas antiguas. Los UUID locales por sí solos no autentican. El insert local no necesita JWT; HTTP/recepción/confirmación reales siguen B05.4/B05.5.

## Atomicidad real y pérdidas

| Situación | Garantía implementada |
| --- | --- |
| Fuente ya confirmó; cola faltante | Otra pasada lee estado actual o hecho inmutable y captura de forma idempotente. No modifica la fuente. |
| Fuente confirma y preparación de cola falla | Save/GameplayEventService no se modificaron ni reciben hooks nuevos. Su commit permanece; diagnóstico de página/retentativa permite recuperar lo disponible. |
| Página de cola o dependencias interrumpida | Commit único o rollback de la página; no ACK/filas parciales. |
| Fuente y cola comparten una transacción de fixture | PrepareSyntheticPage devuelve Committed=false hasta commit del propietario. Se probó rollback conjunto de fuente sintética y todas sus filas; las pruebas64 anteriores también ejercitan el puerto compartido. |
| Ventana entre dos commits de dominio | Revisiones intermedias no capturadas pueden perder su proyección. Se recupera la revisión disponible y decisiones/progreso/fechas conservados, no todos los estados intermedios. |
| Evento/intervalo nunca confirmado | Irrecuperable desde Outbox; no fabricarlo desde tiempos acumulados o flags de UI. |
| Confirmación remota | Ninguna nueva garantía: reconciliación nunca la concede. |

No atomicidad integral gameplay–Outbox ni conexión a UnitOfWork.BeforeCommit/observador. Se eligió captura posterior para no convertir cuota/disco/cola en un nuevo motivo de rollback del progreso. El hook existente comparte c/tx, pero hacerlo obligatorio para CompleteBiome contradiría esa prioridad. La prueba de una transacción sintética no es activación runtime ni modifica la semántica de los escritores.

## Historia y desconocidos

historical_import solo usa filas existentes de este fixture. Partidas completadas/decisiones/finales conservan sus UUID y fechas; no backfill real. La comparación de digests de TODAS las tablas de dominio en pruebas demuestra que perfil, progreso, consecuencias, recibos, sesiones y mediciones originales no cambian por el reconciliador.

historicalCoverageUnknown permanece true; game.report mantiene cobertura conservadora. Una sesión cerrada prueba su terminal registrado, no por sí sola toda la telemetría o cero muertes. Solo intervalos/eventos realmente medidos permiten agregados. Solicitudes de reinicio/reintento no prueban su éxito de navegación; estado completed no acredita escena/final leído.

No se recuperan entradas humanas precisas no exportables, tiempo/muertes previos a instrumentación, markers de completion que nunca llegaron a commit, ni revisiones intermedias perdidas. Un game.report sí conserva completion confirmado aunque falte su evento temporal. Esas limitaciones no se ocultan ni se compensan con ceros.

## Pruebas y compilación

**51 comprobaciones nuevas aprobadas,0 fallidas**, con bases bajo .work/databases/UUID, incluyendo perfil mínimo, cuatro tipos y los quince hechos, orden libre, decisiones/consecuencias, backfill histórico, datos desconocidos, IDs/orígenes repetidos, filas confirmadas inmutables, huérfanos/contradicciones, fuente/cola/busy/cuota fallidos, savepoints/rollback compartido, cursores/páginas/errores persistentes, dependencias, procesos independientes, salida abrupta durante página y dos procesos concurrentes.

**662 regresiones reejecutadas,0 fallidas**:64 Outbox B05.3A +598 offline (43 base,42 progreso,35 menú,30 selección,30 decisiones,29 entrada,11 retorno,21 reinicio,19 Game Over,39 estadísticas,24 pantalla,41 eventos,31 observador,23 actividad,54 completions,126 finales). **Total713 comprobaciones distintas** de esta fase; repeticiones focalizadas no suman.

Comandos: run-checks.ps1; build de GameSave.Checks.csproj --no-restore --disable-build-servers -nodeReuse:false; ejecutor --reconciliation, --outbox y quince modos seguros anteriores. No modo escritor histórico AppData. .NET8.0.30,SQLite3.53.3, sin paquetes nuevos.

Biblioteca/ejecutores0 errores/0 advertencias. Godot C# Rebuild --no-restore con GodotProjectDir a integration/sqlite/.work/ y separador final:0 errores,63 advertencias históricas CS0618 ParallaxBackground,0 nuevas. No se abrió motor Godot. Backend124 y manuales12/12 NO reejecutados: no dependencias Node compartidas y esta fase prohíbe HTTP.

Incidencias corregidas: compilación inicial usaba new con tipo destino IDictionary abstracto, corregido a Dictionary explícito; batería inicial45 pasó, ampliación detectó que diagnóstico de dependencia ocultaba la redundancia de un evento de sesión antiguo; se movió ese diagnóstico para informar ambos sin tocar la fila. Se añadió propagación de incidencias entre páginas y comprobación de inmutables en snapshots antiguos; resultado final51/51.

No se certifica apagón físico, corrupción hardware, rollback de backups o volumen productivo. SQLite serializa escritores; contención agotada informa STORAGE_BUSY y se reintenta explícitamente, sin prometer concurrencia distribuida ilimitada.

## Plan preciso para B05.3B.2 — NO ejecutado

1. Autorizar por separado la integración local y una eventual migración runtime. El actual constructor exige SyntheticDatabase; no relajar la capability ni usar ruta runtime por inferencia.
2. Diseñar una composición local en integration/sqlite/GamePersistenceAdapter.cs y GamePersistenceContext.cs para ejecutar páginas acotadas en trabajo de segundo plano, después de commits locales/arranque seguro. Un coordinador nuevo local-persistence/src/LocalOutboxCoordinator.cs.txt sería candidato, no existe ahora. No es necesario insertar HTTP ni otro guard en FinNivel, Final, menús o LocalGameState.
3. Aprovisionar una vez installationId local estable y persistir selección de binding. Si aparecen varios vínculos incompatibles, diagnosticar en vez de elegir/generar uno silenciosamente. No adoptar credenciales del backend ni convertir un vínculo en cuenta remota.
4. Orquestar pasadas completas/reintentos tras errores, guardar diagnósticos seguros, cancelar al salir y repetir desde null tras reinicio. No ejecutar escaneo completo por frame; presupuesto/latencia/capacidad deben medirse. No iniciar InitializeRemoteServices de scripts/network/GameApplicationContext.cs.
5. Mantener hechos en GameSaveService/GameplayEventService como autoridad, con reconciliación posterior. Si se propone un hook compartido, requerirá pruebas de fallos que demuestren que Outbox no causa pérdida de progreso. No cambiar intención de RecordDecision/CompleteBiome/PrepareFinal/CloseGame.
6. Runtime solo tras autorización expresa de ruta, backup privado actualizado/verificado, proceso cerrado, estabilidad OneDrive, inventario/enlaces/ACL y recuentos antes/después. Serán candidatos a revisión SyncOutboxSchema, CopyGameDatabase/OwnedCopyDatabase y composición de adaptador; no editar sus migraciones históricas ni usar RollbackEmptySynthetic para una cola runtime poblada.
7. Validación futura: fixtures de ciclo completo, recuperación/paginación/errores, después compilación y manuales offline autorizados. Transporte/identidad remota/receptor permanecen desactivados hasta B05.4/B05.5 y su autorización.

B00 continúa pendiente; dos ACE Allow investigadas sin corregir. No restauraciones, cambios de permisos/propietario, secretos reales o conexiones remotas. **B05.3B.2 y B05.4 no iniciadas.**



## Cierre de integridad — 2026-10-28 Guatemala

Comparación antes/después:17 archivos deliberados (12 existentes modificados y5 nuevos), cero originales eliminados. Otros19 archivos existentes cambiados son artefactos generados por Rebuild bajo integration/sqlite/.work.godot (DLL/PDB/config/caché/AssemblyInfo generado); se contabilizan aparte de .work excluido. El toolchain conservó ese destino previo de artefactos pese a pasar GodotProjectDir; no se editó una fuente de Godot ni un csproj para modificarlo. De1.357 archivos iniciales inventariados,1.326 permanecen idénticos en hash/tamaño/mtime; no se declara idéntico todo el inventario cuando hubo recompilación.

Las tres bases protegidas y sus9 archivos asociados conservan exactamente hash/tamaño/mtime. Backend/.env coincide con la referencia histórica y mantiene tamaño/fecha. No se leyó su texto ni se usaron credenciales. Owner/SDDL de raíz/backend/.env/local-persistence/.git y carpeta backend iguales antes/después; no se modificaron ACL/ACE/herencia/propietarios. No es una nueva auditoría exhaustiva de cada ACL del árbol. B00 permanece pendiente, sin retirar las dos Allow ni cambiar Deny Git.

Migraciones SchemaManager/GameplayEventSchema/SyncOutboxSchema originales intactas: no nueva versión, runtime sin migrar. Código de GameSaveService, UnitOfWork, GameplayEventService, escenas, menús, FinNivel, Final, LocalGameState y GamePersistenceAdapter intacto. Cero archivos sintéticos restantes bajo .work/databases; sin restauración de respaldos, Node, HTTP, Atlas, AWS o ejecución de Godot.

Resultado final713 comprobaciones aprobadas,0 fallidas:51 nuevas +662 regresiones realmente reejecutadas. Biblioteca/ejecutores0 errores/0 advertencias; Godot C#0 errores/63 advertencias históricas,0 nuevas.124 backend y12/12 manuales no reejecutados.

B05.3B.1 COMPLETADA EN CÓDIGO únicamente como captura/reconciliación sintética posterior al commit. Sus garantías no incluyen revisiones intermedias ausentes, entrada humana precisa no exportable, telemetría nunca confirmada ni entrega remota. B05.3B.2 y B05.4 no iniciadas. Trabajo detenido; siguiente integración exige autorización expresa.


## B05.3B.2A — Respaldo y ensayo privado (2026-10-28 Guatemala)

Ensayo completado sobre segunda copia privada de runtime, sin migrar original: BackupDatabase read-only bajo bloqueos de escritura; backup y origen hash/metadatos intactos. Copia conservó base2/eventos1 y recibió sync1; integrity_check=ok,FK válidas y todo dominio/estadísticas idénticos. Primera reconciliación658 pendientes/1341 dependencias/0 diagnósticos; segunda en otro proceso0 nuevas,mismos IDs/payload/estados. No envío ni ACK remoto. Migración reaplicada idempotente y fallo precommit revierte otra copia desechable. Es tooling privado, no migrador runtime productivo: DDL exacto/checksum reutilizado sin relajar SyntheticDatabase. No ACL/owner/Godot/HTTP/Atlas/AWS.

Respaldo, SHA-256, conteos anonimizados, resultados, riesgos y plan B05.3B.2B en [B05_OUTBOX_RUNTIME_MIGRATION_TRIAL.md](B05_OUTBOX_RUNTIME_MIGRATION_TRIAL.md). Datos reales solo en privado fuera de Git/OneDrive; no imprimir IDs/decisiones ni restaurar. B00 pendiente. B05.3B.2B/B05.4 no iniciadas.


## B05.3B.2B — Activación local controlada (2026-10-28 Guatemala)

La reconciliación ya tiene composición runtime mínima autorizada mediante LocalOutboxPump+Scheduler en GamePersistenceAdapter. Reutiliza mismo puerto paginado/contratos existentes, sin modificar fuentes ni comandos de dominio. Es captura POSTERIOR al commit: fallos de preparación no revierten decisiones/finales; revisiones intermedias/telemetría no persistidas conservan límites históricos. El scheduler nunca reserva/envía ni confirma remoto. LocalGameState intacto.

Preflight,backup nuevo/hash,ensayo,migración,comparación,archivos/pruebas,riesgos y guía manual en [B05_OUTBOX_RUNTIME_ACTIVATION.md](B05_OUTBOX_RUNTIME_ACTIVATION.md). B00 pendiente;sin cambios ACL/propietario,autenticación remota,HTTP/Atlas/AWS oB05.4. Esperar validación manual e instrucciones.

## B05.3B.2D — Recuperación sintética tras cierre (2026-10-28)

La captura secundaria no forma parte del commit fuente. CloseAsync del observador confirma fuentes,pero DisposeAsync del scheduler cancela esperas sin barrera de flush. Reproducción controlada deja terminal+Menu3932ms sin cola y reconciliación existente los recupera:2 nuevas,segunda pasada0,reinicio0,mismos UUID/sobres/huellas. No añade tiempo efectivo ni altera historial/decisiones/ambientes; no fabrica terminal abierto. Sin corrección productiva,esquemas nuevos o cambios Godot. La ventana se demuestra; la secuencia exacta de la sesión real sigue sin traza concluyente.

24 nuevas+741regresiones=765/765;compilaciones correctas,63advertencias Godot históricas y0nuevas. Bases reales intactas y runtime sigue853pending/2faltantes. [Diagnóstico,matriz de pruebas y parche futuro no aplicado](B05_OUTBOX_SHUTDOWN_RECOVERY.md). B05.3B.2D COMPLETADA solo diagnóstico/sintético;B05.3 no cerrada.B00 pendiente,B05.4 no iniciada.
