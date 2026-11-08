# B04.2B.2B.2D.1 — Auditoría de eventos de juego

Fecha: 2026-10-26. Solo investigación/diseño en la copia; ningún evento nuevo está conectado. Fuentes: scripts/MenuPrincipal.cs, MenuNiveles.cs, TarjetaNivel.cs, DecisionSceneFlow.cs, InfoDecision.cs, AnimalSegmentFlow.cs, FinNivel.cs, Final.cs, assets/sprites/ui/MenuPausa.cs y GameOver.cs; LocalGameState/GamePersistenceAdapter, GameSaveService/UnitOfWork y pruebas de local-persistence.

## Inventario trazable

P=partida, B=bioma, S=sesión de aplicación propuesta, A=intento/sesión animal propuesto. S y A aún no existen de forma duradera. Datos comunes disponibles en consultas locales: LocalPlayerId, GameId, BiomeId, revisión, decisión/consecuencias y versiones. La presencia de un callback no demuestra que exista un evento persistente.

| Evento y alcance | Origen real y momento exacto | Datos disponibles | Persistencia actual | Duplicación / clave recomendada futura |
|---|---|---|---|---|
| Inicio partida; P | MenuPrincipal.NewGame→State.NewGameAsync→GamePersistenceAdapter.CreateNewGameAsync→GameSaveService.CreateNewGame; éxito de commit, no clic | GameId, dueño, revisiones/versiones, CreatedAt | saved_games +cinco biomas/ambientes/snapshot +local_operations new_game en misma UoW | doble clic/retry: OperationId conservado; analítica única por GameId, no por apertura de menú |
| Entrada humana a bioma; P/B/S | TarjetaNivel.OnPressed→MenuNiveles.EnterLocalBiomeAsync→LocalBiomeSelection.EnterAsync; EnterBiome solo si hace falta, después navegación validada | escena, perspectiva, bioma, GameId, revisión | enter_biome y frontera para primera entrada aplicable; reentrada puede ser solo lectura | recibo no cuenta todas las visitas; eventId de intención persistido y evento de escena realmente preparada |
| Decisión humana; P/B | DecisionSceneFlow.ConfirmChoice→LocalDecisionSession.ConfirmAsync→RecordDecision; commit antes de proyección y navegación a información | DecisionId/key/OptionId, OperationId, orden, consecuencias, versiones | environmental_decisions +state +animal_pending +frontera y recibo atómicos | usar DecisionId y clave natural game/biome/decision_key; no duplicar al reintentar diálogo/navegación |
| Entrada animal; P/B/S/A | InfoDecision.IrALaSiguienteEscena cambia a su EscenaSiguiente; o selección abre bioma decidido; FinNivel._Ready→ValidateLocalEntryAsync valida estado y ambiente | escena canónica, contexto leído, bool confirmado | guard y reentrada readonly; no fila de sesión animal | emitir una vez por nueva instancia validada, no por cada FinNivel/retry de validación; animal_run_id nuevo, estable para ese intento |
| Pausa; S/A | MenuPausa.AbrirMenu al pasar _abierto false→true y Paused=true | contexto de escena, instante monotónico futuro | solo memoria | transitionId/seq; ignorar abrir repetido y distinguir pausa de carga/derrota |
| Reanudar; S/A | MenuPausa.CerrarMenu al pasar _abierto true→false y Paused=false | contexto, intervalo pausado futuro | solo memoria | transición única; no inferir reanudación por cualquier Paused=false de navegación |
| Reinicio voluntario; P/B/S/A | MenuPausa.ReiniciarNivel→AnimalSegmentFlow.RestartLocalAsync→LocalAnimalRestart; intención y luego nueva entrada confirmada | mismo GameId/BiomeId/Decision.OperationId, escena, revisión | consultas readonly; sin recibo de reinicio | contar reinicio confirmado una vez al comenzar A nuevo, enlazado por intentId y previous_run_id; no contar clic/fallo |
| Muerte/derrota; P/B/S/A | Player*.Die tras CurrentHealth<=0 y guard _muerto; ZonaMuerte.MostrarGameOver por caída; ambos→GameOver.MostrarDerrota, primer _mostrado | bioma/partida; causa exacta solo en origen, no propagada actualmente | ninguna | primera derrota por animal_run_id; un evento por resultado de intento, no sumar Die +MostrarDerrota ni varias zonas |
| Reintento Game Over; P/B/S/A | GameOver.Reintentar→mismo RestartLocalAsync/LocalAnimalRestart | decisión/ambiente y destino actuales; origen death en el botón, no en helper compartido | ninguna; readonly | intentId una vez y origen game_over_retry; no mezclar con voluntary_restart por observar solo helper |
| Salida a selección; P/B/S/A | MenuPausa.IrMenuNiveles o GameOver.VolverMenu→ReturnToLevelsLocalAsync→ReturnToSelectionAsync; PrepareSelectionAsync antes de ChangeSceneToPacked | escena origen, IDs, permiso generado en memoria | refresca datos, no guarda abandono ni checkpoint | cierre único de A con reason menu_exit si sigue abierto; derrota previa ya lo cerró, no contar segunda muerte/abandono |
| Meta física; P/B/A | FinNivel.OnBodyEntered para grupo jugador, reserva _nivelFinalizado y difiere FinalizarNivel→AnimalSegmentFlow.Open(completion:true) | NivelActual/bioma, dueño/partida vía contexto | local Open da operación no implementada; NO llama CompleteBiome | futuro commit único game/biome y OperationId; no contar BodyEntered como bioma completed sin éxito transaccional |
| Presentación final; P/S | Final._Ready recibe Services.Endings.ConfirmedEnding; solo muestra si hay final confirmado; si no GoRecovery | ending good/medium/bad remoto; textos, no cálculo | no integración local final; columnas ending existen, pero no productor local de resultado final localizado | game+ending_rules_version para resultado global; presentation eventId distinto si se quiere contar visitas, no recalcular/sumar finales por render |

InfoDecision es información posterior a una decisión ya guardada, no otra decisión. El script usa transición diferida a EscenaSiguiente; el guard animal confirma contexto antes de jugar. Revisar orden de carga/guard como punto de captura, no cambiar InfoDecision en D.1.

## Estado del tiempo

saved_games.created_at/saved_at/completed_at/archived_at y biome_progress.human_completed_at/animal_completed_at son fechas UTC de dominio. environmental_decisions.occurred_at y local_operations.committed_at son fechas de operaciones. Son útiles para orden/auditoría, no para duración efectiva. created_at no prueba primer input; saved_at no es final de sesión.

No se localizó registro duradero de duración de sesión, tiempo por bioma/animal, pausa o menú. _Process(delta) de Estadisticas mide drenaje, no estadísticas de tiempo; timers de daño, tween o Time.GetTicksMsec de presentación/input no forman un acumulador de juego. SessionManager y MemoryRepository sessions representan autenticación/expiración remota, no sesiones de gameplay. No usar su TTL como tiempo jugado.

## Contrato temporal propuesto, aún no implementado

- Sesión de aplicación S: empieza al inicializar el contexto local para un perfil; termina al cierre normal. Cada arranque crea sessionId UUID una vez y persiste inicio antes de atribuir intervalos. Si aún no hay perfil, no atribuir actividad a un jugador inexistente.
- Sesión animal A: comienza solo cuando la nueva instancia pasa el guard de entrada; termina por derrota, reinicio solicitado, salida a menú, meta física o interrupción. Nueva instancia/nuevo proceso nunca retoma una posición intermedia; crea A nuevo y conserva decisión. No reutilizar attempt_number como identidad.
- Estado temporal exclusivo del observador: active_human, active_animal, paused, menu, game_over, loading, background. Información de decisión cuenta como active_human solo cuando el diálogo/interfaz está listo y acepta interacción; cargas/confirmación bloqueante quedan loading. Propuesta que debe aprobarse antes de implementar.
- Tiempo efectivo = suma de intervalos foreground, listos y sin pausa en active_human/active_animal. Permanecer quieto dentro de un animal jugable sí cuenta; no introducir umbral de inactividad inventado. Derrota, pausa, menús, carga, pérdida de foco/suspensión no cuentan como efectivo.
- Tiempo por bioma = subconjunto efectivo con GameId y BiomeId; animal = subconjunto active_animal con A. Tiempo de pausa y menú se conserva separado, nunca se suma otra vez al efectivo.
- Duración de sesión = suma de intervalos observados de S, incluidos menú/pausa/background conocido; no equivale a tiempo efectivo ni a resta ciega de UTC. Si hay suspensión no observada, marcar tramo desconocido y reportar cobertura, sin rellenarlo como juego.
- Total acumulado de jugador/partida = SUM de intervalos efectivos únicos de las sesiones pertinentes; no sumar simultáneamente total de sesión +subtotales por bioma/animal.

Reloj propuesto: Stopwatch.GetTimestamp para intervalos, reloj UTC solo para fechas/calendarios. Guardar offsets desde origen de S y duraciones enteras en milisegundos, aritmética de64bits, conversión de ticks con resto para no introducir pérdidas por frame. Nunca comparar ticks/orígenes de procesos distintos ni aplicar tiempo transcurrido offline al drenaje. Cambios del reloj del sistema no producen duraciones negativas.

Dividir el tiempo en intervalos inmutables [start_offset_ms,end_offset_ms), clasificados sin solaparse. Un heartbeat futuro cierra subintervalos con seq e intervalId estables; cerrar sesión o cambiar estado confirma el último. Una propuesta de cadencia5s debe aprobarse y medirse, no se adopta aquí como requisito. Estado pausado y señal de visibilidad/ciclo de vida deben alimentar una sola máquina; no son múltiples relojes independientes.

Cierre inesperado: al siguiente arranque sellar S anterior como interrupted, hasta el último intervalo duradero; closed_at real desconocido. No fabricar hora final ni elapsed hasta DateTime.UtcNow actual. El intervalo no confirmado es pérdida potencial limitada por la cadencia, no tiempo0 probado; marcar cobertura incompleta. No reproducir la escena ni consecuencias para reconstruir eventos. Datos históricos previos a captura tienen tiempo desconocido, no cero.

## Idempotencia y límites de observación

Eventos futuros: eventId UUID generado una vez por intención lógica y persistido; sessionId y secuencia única, GameId/BiomeId y animal_run_id cuando correspondan. Claves de negocio adicionales para decisión, resultado del bioma y cierre del intento; payload idéntico con mismo ID devuelve ACK previo, distinto payload produce conflicto. No deduplicar por timestamp, texto o bioma a secas: dos reintentos legítimos son distintos.

La intención de reinicio debe quedar ligada a la instancia nueva: persistir restart_requested con intentId antes de navegar y restart_confirmed/run_started tras el guard. Si falla navegación, no contar confirmación; si el proceso cae en medio, conservar intención no resuelta y cobertura desconocida, sin repetir decisiones. Futuro mismo handshake para entrada/reintento; el helper compartido debe recibir origen explícito para métricas, no adivinarlo por escena o pausa.

No hay garantía de observar una muerte anterior al commit si el proceso cae inmediatamente. Una entrega fiable comienza cuando el evento quedó duradero; la medición debe reconocer ese límite. D.2 deberá definir la política ante disco lleno/SQLite fallido: recomendación no corromper ni reemplazar progreso para salvar telemetría, mostrar cobertura degradada y reintentar el mismo ID; límites de buffer/backpressure requieren aprobación.

Puntos de dominio ya transaccionales (nueva partida/decisión y futura meta) pueden usar ITransactionalSaveExtension.BeforeCommit sobre la MISMA conexión/transacción para anexar eventos, sin HTTP. Los recibos originales y sus digests no cambian. No considerar que existe outbox por existir ese hook: su comentario reserva trabajo futuro.

Revisar [diseño global](GLOBAL_STATISTICS_DESIGN.md) y [plan](LOCAL_STATISTICS_IMPLEMENTATION_PLAN.md) antes de implementar. No se conectan eventos en D.1.


## B04.2B.2B.2D.4A — Almacenamiento local de eventos y tiempos (2026-10-26)

**COMPLETADA EN CÓDIGO; SIN CAPTURA GODOT NI MIGRACIÓN REAL.** El usuario confirma D.3:14/14 comprobaciones manuales correctas y cero errores nuevos. La pantalla validada y StatisticsService conservan su comportamiento, incluidas las métricas No disponible.

### Archivos y decisión de compatibilidad

Nuevos en local-persistence/src: GameplayEventModels.cs.txt, GameplayEventSchema.cs.txt, GameplayEventRepository.cs.txt, GameplayEventService.cs.txt y GameplayMonotonicClock.cs.txt. Pruebas: GameplayEventChecks.cs.txt nuevo y dispatcher GameSaveChecks.cs.txt. Se actualizan únicamente los siete documentos indicados para D.4A: plan/diseño global/auditoría de eventos/PHASES/PHASE_HISTORY/DECISIONS/README. Total14 archivos. Ningún controlador, adaptador o escena Godot, StatisticsModels/Repository/Service, servicio de gameplay ni esquema base se modifica.

El plan D.1 proponía una posible versión3 del esquema base. La alternativa implementada reduce riesgo: **extensión opcional gameplay versión1 sobre base versión2**, con historial propio. Cambiar CurrentVersion base habría afectado verificadores/consumidores ya validados y la apertura automática del runtime. Se conservan user_version=2, migraciones1/2 y sus checksums, diez tablas originales y servicios existentes. No se reinterpreta ningún dato histórico ni se añade una columna a una tabla anterior.

MigrateSynthetic acepta exclusivamente SyntheticDatabase, cuya creación y validación están restringidas al namespace UUID de SyntheticSandbox bajo local-persistence/.work/databases. No acepta CopyGameDatabase, OwnedCopyDatabase, ISaveDatabase genérico ni ruta arbitraria como destino de migración. El runtime existente no invoca esta extensión. Solo una fase futura expresamente autorizada podrá definir una capacidad de migración real con respaldo y recuperación verificados; no se debe eludir la restricción de tipos.

### Esquema implementado

Cuatro tablas nuevas únicamente en fixtures migradas (14 tablas totales):
- gameplay_schema_migrations: PK version, migration_key UNIQUE, checksum y applied_at. Versión1, clave local-gameplay-extension-v1; checksum SHA-256 del SQL normalizado.
- gameplay_sessions: session_id PK, local_player_id FK, started_at_utc, status open/closed/interrupted, ended_at_utc nullable, end_offset_ms nullable; UNIQUE(session_id,owner). Índice parcial ux_gameplay_open_session permite una sesión abierta por propietario, evitando dos relojes capturando simultáneamente.
- gameplay_events: event_id PK; owner/session, kind, occurred_at_utc, offset_ms, game/biome/run opcionales según tipo, death_cause/session_end limitados, contract_version1, payload_digest y dedupe_key; UNIQUE(owner,dedupe_key) y clave compuesta para referencias de run.
- gameplay_intervals: interval_id PK; owner/session, start_ms/end_ms, state, game/biome/run y versión/digest; end>=start>=0 y UNIQUE(session,start,end,state). No tabla de acumuladores redundantes.

FK compuestas preservan propietario de sesión/partida, bioma de esa partida y vínculo del run con su evento ANIMAL_SEGMENT_STARTED. El servicio confirma además tipo/alcance del run: una FK por sí sola no asegura semántica de evento. Índices de eventos por dueño/game/biome/kind y session/offset; intervalos por session/rango y dueño/game/biome/state. Las consultas parametrizan filtros; no tienen LIMIT fijo que trunque historial.

Migración: verifica base2 compatible, abre transacción inmediata, crea todo el SQL y su historial en un único commit. Si encuentra extensión parcial/versión/checksum incompatibles, rechaza sin sobreescribir. Si falla antes del commit, DDL/historial se revierten. Segunda aplicación verifica lo existente y no vuelve a insertar ni cambia bytes. Base vacía necesita primero inicialización base explícita en fixture; esquema1/futuro incompatible no se actualiza silenciosamente. No se tocaron las bases protegidas.

### Contratos y servicios

GameplayEvent contiene EventId, LocalPlayerId, SessionId, Kind, OccurredAtUtc, OffsetMs, GameId/BiomeId/AnimalRunId cuando aplican, DeathCause/SessionEnd tipados y Version1. UUIDv4 canónicos existentes; no nombres, correos, credenciales, texto libre, posiciones o recursos. UTC se normaliza antes del digest. Metadatos posibles son enums cerrados, no JSON arbitrario.

Kinds soportados: SESSION_STARTED, SESSION_ENDED, ANIMAL_SEGMENT_STARTED, ANIMAL_DIED, ANIMAL_RESTART_REQUESTED, ANIMAL_RETRY_REQUESTED, ANIMAL_SEGMENT_EXITED, ANIMAL_SEGMENT_COMPLETED. El último solo puede almacenarse si el bioma YA tiene completed confirmado en dominio; el servicio no ejecuta CompleteBiome ni marca nada completado. La fixture positiva prepara ese estado con la API anterior solo para probar el contrato futuro.

GameplayEventService.RecordEvent registra inicio/cierre y eventos en transacciones inmediatas propias del servicio nuevo; no altera local_operations ni revisiones/timestamps de gameplay. SESSION_STARTED crea sesión y evento atómicos. SESSION_ENDED normal sella estado/UTC real/offset monotónico y evento juntos. InterruptSession sella interrupted con fin UTC desconocido, descubrimiento UTC en el evento y offset duradero existente. Una sesión cerrada rechaza nuevos registros salvo duplicados exactos ya comprometidos.

Inicio animal exige partida actual in_progress, bioma canónico animal_pending, decisión/consecuencia/vínculo confirmados y ambiente coherente con reject/approve. AnimalRunId es el EventId del inicio y no cambia durante ese intento. No abre dos runs activos dentro de una sesión; muerte, salida, solicitud voluntaria o completed cierran el run para tiempo activo. Reintento requiere muerte previa y se rechaza después de salida/cierre incompatible. Muerte no cierra la partida; reintentar no agrega otra muerte. Salida puede seguir a muerte sin contabilizarla otra vez.

RecordInterval registra intervalos confirmados; GetEvents filtra por partida/bioma y GetSessions por propietario; GetTotals ofrece agregados scoped de muertes, solicitudes de reinicio/reintento, tiempo efectivo/pausa/observado y duración de sesión. Contratos son nuevos e independientes; StatisticsService anterior sigue devolviendo NotAvailable, verificado por prueba, hasta una integración posterior explícita.

### Idempotencia y tiempo

EventId/IntervalId se generan una sola vez en el futuro adaptador por operación lógica. Mismo ID y digest devuelve GameplayWriteReceipt(Inserted=false), incluso tras cerrar sesión; contenido distinto da EVENT_CONFLICT/INTERVAL_CONFLICT. Claves naturales kind+session o kind+animalRun evitan una segunda muerte, solicitud o cierre aunque un emisor defectuoso cambie de ID: se rechaza con conflicto, no se suma otra fila. No deduplicar por UTC, escena o bioma solamente.

Los contadores Restarts/Retries significan **ANIMAL_RESTART_REQUESTED/ANIMAL_RETRY_REQUESTED registrados**, no prueba de carga exitosa de escena. Una fase posterior podrá correlacionar nueva entrada confirmada para una métrica distinta; no mezclar ambos significados. No se genera otro evento de muerte al pulsar retry.

GameplayMonotonicClock usa Stopwatch.GetTimestamp/Frequency (inyectables en pruebas), origen nuevo por ejecución/sesión y offsets enteros en milisegundos. Conversión decimal desde diferencia total evita acumulación de redondeos por frame; rechaza reloj hacia atrás/duración inválida. No hay timer, autoload ni bucle del motor. El llamador futuro debe usar ese mismo origen para eventos e intervalos; nunca restar UTC ni comparar ticks entre procesos.

Intervalos [start,end) exclusivos por sesión: la transacción inmediata comprueba solapamiento contra cualquier clasificación, no solo active. Adyacentes permitidos, duplicados exactos idempotentes; IDs alternativos para el mismo rango se rechazan. ActiveHuman/ActiveAnimal suman efectivo; Paused/Menu/GameOver/Loading/Background quedan fuera. Puede existir pausa atribuida al bioma, pero nunca suma tiempo activo. Los intervalos no se borran al morir o salir.

Una sesión normal puede declarar duración por offset de cierre, incluidos menús/pausas; RecordedElapsedMs suma intervalos realmente confirmados. No sumar esa duración a efectivo/subtotales. Si faltan intervalos o la sesión sigue abierta/interrumpida, Incomplete lo indica. Para filtro por partida no se atribuye toda una sesión a ese game porque puede abarcar varios: SessionDurationMs=NotAvailable/SESSION_SPANS_GAMES; el tiempo de game/biome se deriva de sus intervalos.

No hay intervalos: EffectiveMs=Unknown/null, no0. Intervalo confirmado0..0: Available0. Sin cobertura animal registrada: muertes/restarts/retries NotAvailable/null. Resultados Scope=RecordedCoverageOnly y HistoricalCoverageUnknown=true: un0 medido cubre únicamente esa captura, nunca demuestra ausencia histórica de muertes antes de instrumentar. El servicio no rellena eventos, sesiones ni tiempo anteriores.

Cierre inesperado: solo se conserva lo duradero; InterruptSession no extrapola hasta la hora de descubrimiento. Duración total permanece Unknown y ended_at_utc=null. Debe sellarse la sesión anterior antes de abrir otra. El intervalo no confirmado se pierde potencialmente y no puede recuperarse reproduciendo gameplay. InterruptSession lee el límite y lo revalida al escribir; una escritura concurrente que lo cambie produce conflicto temporal, no se inventa tiempo. Reintentos deben conservar ID/UTC/payload o consultar el cierre ya existente.

### Pruebas y compilación

**364 comprobaciones C# aprobadas, cero fallidas:**41 nuevas eventos/tiempo +24 pantalla +39 consultas +19 Game Over/navegación +21 reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las323 regresiones se reejecutan. No se suman repeticiones de pruebas ni resultados históricos sin ejecución.

Las41 verifican extensión nueva/repetida/fallida/parcial/futura/checksum, base histórica y decisiones/recibos conservados, sesiones y cierres normales/interrupted, eventos/tiempos por game/biome, muerte/request/retry separados, idempotencia/conflicto, completado solo previamente confirmado, intervalo0 vs desconocido, exclusión de pausa/menú/derrota, rollback de inicio/cierre/evento/intervalo, propiedad y run, concurrencia de mismo evento y de intervalos solapados, reloj monotónico, API anterior intacta, reapertura readonly en proceso hijo y ausencia de PII/HTTP/Godot en los contratos.

Estrés:40 sesiones,400 intentos animales,1.280 eventos y400 intervalos;400 muertes,400 solicitudes de reintento y4.000ms efectivos capturados, sin truncamiento/duplicación. También compara digest completo del agregado de gameplay y número de local_operations antes/después: intactos. Datos son exclusivamente sintéticos.

Comandos: build --no-restore de GameSave.Checks.csproj; --gameplay-events y probe readonly limitado a fixture UUID; los diez modos seguros anteriores; local-persistence/run-checks.ps1. Solo local-persistence/.work/databases/<UUID>. Cero archivos SQLite sintéticos restantes. Sin bases manuales/servicios externos ni lógica de eventos ejecutada en Godot.

Biblioteca/ejecutor0errores/0advertencias. Rebuild TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild con GodotProjectDir hacia integration/sqlite/.work/:0errores,63 advertencias históricas ParallaxBackground y ninguna nueva. Las fuentes nuevas .cs.txt entran solo por la biblioteca ya referenciada; no se modifica csproj ni se duplican clases. CLI/paquetes/temporales privados; sin restore, Godot, Node, Atlas o AWS ejecutados.

### Integridad, riesgos y siguiente subfase

Comparación antes/después:1.538 archivos protegidos idénticos en tamaño/SHA-256/fecha; incluye esquema/migraciones base, estadísticas/pantalla, todos los controladores, gameplay, escenas, proyectos y finales. Las tres bases protegidas más manifiestos/leases (9 archivos) siguen intactos, sin abrirlas mediante SQLite para pruebas. .env278bytes,SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928,comprobado separadamente antes/después, sin valores ni cambios de propietario/ACL. Riesgo ACL de B00 pendiente.

Riesgos pendientes: pérdida antes del commit, cola/disco lleno y política de bloquear o continuar con cobertura incompleta; reloj/origen correcto bajo suspensión; fuente de causa de derrota; crecimiento/retención; IDs/intenciones que el emisor debe mantener; etiquetas de cobertura para no tratar conteos parciales como totales históricos. No hay outbox, ACK remoto ni entrega garantizada a Atlas. El recibo local no es un ACK de servidor.

Plan preciso para futura autorización:
1. Diseñar respaldo, verificación/reversión y capacidad explícita para migrar el runtime real; validarlo en fixtures/ensayo. No basta llamar MigrateSynthetic ni relajar su tipo. Requerir autorización específica antes de tocar datos reales.
2. GamePersistenceAdapter: servicio de eventos en su cola/worker, solo después de verificar extensión ya autorizada; sin SQL en scripts ni conexión paralela.
3. GamePersistenceContext y nuevo observador único: SESSION_STARTED al activar captura con perfil; cierre normal después de flush; al arrancar, interrumpir sesión abierta anterior sin arrastrar reloj entre procesos.
4. AnimalSegmentFlow: confirmar ANIMAL_SEGMENT_STARTED una vez después del guard, EventId=AnimalRunId; recibir origen de intención y preservar EventId en retry. MenuPausa registra solicitud voluntaria y cierra intervalos al pausar/reanudar. GameOver registra primera derrota del run y solicitud de reintento distinta; causa Unknown si no está propagada, sin modificar daño/recursos por inferencia.
5. Retorno al menú registra ANIMAL_SEGMENT_EXITED sin muerte duplicada y sin checkpoint. Una máquina exclusiva cierra intervalos al entrar/salir de carga, pausa, menú, foco, derrota y juego activo; cadence de flush requiere aprobación, no se activa en D.4A.
6. Nueva capa de consulta/presentación autorizada deberá etiquetar cobertura y distinguir solicitudes de reinicios exitosos; no sustituir silenciosamente las métricas de StatisticsService. Validación manual posterior de pausas, cierres, tiempos y conservación de gameplay.
7. ANIMAL_SEGMENT_COMPLETED solo se conectará a un commit de dominio confirmado en otra fase de meta física; no a decisión, BodyEntered aislado o Game Over. Finales y B05 siguen fuera de alcance.

Para Atlas futuro: preservar IDs/version/digest, receptor idempotente y ACK solo tras commit durable; misma carga/ID puede repetirse, otra carga/ID conflictivo no se suma. Una outbox transaccional y su retención se diseñarán en fase autorizada, no existen aquí. No enviar nombres ni otros datos personales innecesarios.

Recomendación: siguiente subfase de preparación/migración real controlada y luego captura local autorizada, manteniendo estos límites. D.4A termina aquí; no se conecta Godot, no CompleteBiome/finales/checkpoints/sync/B05.

## B04.2B.2B.2D.4B — Captura local Godot y tiempo efectivo (2026-10-27 Guatemala)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** El usuario confirma D4A2 con14/14 comprobaciones manuales, base runtime2+extensión1 y gameplay sin errores nuevos. Esta fase conecta únicamente captura local; no modifica la pantalla Estadísticas ni su contrato histórico No disponible.

### Inventario exacto y arquitectura

Producción: integration/sqlite/LocalGameplayObserver.cs nuevo; integration/sqlite/GamePersistenceAdapter.cs; integration/sqlite/GamePersistenceContext.cs; scripts/AnimalSegmentFlow.cs; assets/sprites/ui/MenuPausa.cs; assets/sprites/ui/GameOver.cs; scripts/MenuPrincipal.cs (solo salida normal). Pruebas: GameplayObserverChecks.cs.txt nuevo, dispatcher GameSaveChecks.cs.txt y Compile del observador puro en GameSave.Checks.csproj. Nueve documentos indicados en D4B actualizados. Total19 archivos.

No se modifican LocalGameState, StatisticsService/pantalla, biblioteca/esquema de eventos, relojes de recursos, actores/daño, NPC, escenas, project.godot, TwoSides.csproj, FinNivel ni finales. Los personajes y ZonaMuerte ya convergen en GameOver.MostrarDerrota; no se añaden señales ni hooks duplicados en cada animal. El observador vive como objeto C# poseído por GamePersistenceContext existente (hijo de GameApplicationContext), no como otro Autoload/Node/escena.

IGameplayTelemetryStore expone solo ReadSessionsAsync, WriteEventAsync, WriteIntervalAsync e InterruptAsync. GamePersistenceAdapter los implementa con su misma cola SemaphoreSlim/worker Task.Run y GameplayEventService lazy sobre el ISaveDatabase que ya posee. No hay SQL en escenas, conexión paralela ni migración automática; si falta la extensión o almacenamiento, falla solamente telemetría con código seguro. El servicio se invalida al cerrar/disponer el adaptador.

LocalGameplayObserver recibe ese puerto, reloj monotónico/UTC y diagnóstico inyectables. Todas las notificaciones Godot son síncronas en memoria y no esperan escrituras para permitir gameplay. La FIFO serial conserva comandos tipados inmutables, IDs y payloads para reintentos; GameSaveService/decisiones no se invocan desde su interfaz. El drenaje de I/O usa el worker ya existente.

### Capturas reales conectadas

| Acontecimiento | Punto de captura nuevo | Semántica y dedupe |
|---|---|---|
| SESSION_STARTED | GamePersistenceContext._Process cuando State.Ready tiene perfil local; Telemetry.InitializeAsync | Una inicialización por contexto/ejecución; SessionId UUID estable, evento offset0. No exige partida ni crea una |
| SESSION_ENDED normal | GamePersistenceContext.QuitAsync por notificación de cierre de ventana y MenuPrincipal.Exit | Cierra último intervalo y encola un único cierre. AutoAcceptQuit=false permite intentar flush; sin nuevo autoload |
| Cierre inesperado anterior | InitializeAsync consulta sesiones abiertas y encola InterruptAsync antes del nuevo inicio | Identificador/UTC de descubrimiento conservados; offset duradero existente, ended_at desconocido; no inventa cierre normal |
| ANIMAL_SEGMENT_STARTED | AnimalSegmentFlow.ValidateLocalCore tras guard local satisfactorio y restauración de pausa; context.AnimalStarted | Una vez por ID de instancia de escena, no por cada FinNivel; el contexto difiere el registro si aún se inicializa telemetría. RunId=EventId UUID |
| ANIMAL_DIED | GameOver.MostrarDerrota después del primer _mostrado | Una derrota por run. Causa Unknown, porque Die y ZonaMuerte no propagan causa tipada; no inferir daño/caída ni modificar actores |
| ANIMAL_RESTART_REQUESTED | MenuPausa.ReiniciarNivel tras guards de doble clic/transición | Solicitud voluntaria, una por run; no se cuenta como muerte ni éxito de carga |
| ANIMAL_RETRY_REQUESTED | GameOver.Reintentar tras sus guards | Requiere derrota conocida en el run; solicitud distinta de muerte. No genera segunda muerte |
| ANIMAL_SEGMENT_EXITED | AnimalSegmentFlow.ReturnToLevelsLocalAsync solo tras ChangeSceneToPacked exitoso; detección secundaria de escena distinta en contexto | Una salida por run, no duplica notificaciones. No checkpoint ni CompleteBiome |
| Intervalos efectivos/pausa | _Process del contexto, MenuPausa.AbrirMenu/CerrarMenu y pérdida de foco de aplicación | Cambio de clasificación cierra intervalo anterior antes del siguiente |

La nueva entrada validada del animal es el único dato que confirma una instancia nueva realmente lista. La solicitud de reinicio/reintento permanece separada; una navegación fallida no agrega otro ANIMAL_SEGMENT_STARTED. ANIMAL_SEGMENT_COMPLETED no se emite, y meta física sigue sin integración local.

Los helpers de navegación solo añaden notificaciones Loading/Leave/NavigationFailed; sus validaciones, escenas, ambientes, pausas y resultados originales se conservan. Telemetría no participa en AnimalSegmentFlow.IsBlocking ni en guards de progreso. No se solicita HTTP ni sesión remota en estas rutas.

### Sesión, reloj e intervalos

Se reutiliza GameplayMonotonicClock (Stopwatch), sin modificarlo: origen nuevo por observador, offsets enteros en milisegundos; UTC solo identifica momentos de eventos. No se resta saved_at ni UTC para duración. Una partida puede tener múltiples sesiones y múltiples runs; cambiar menú/bioma, pausar o morir no crea otra partida ni sesión.

El contexto usa ProcessMode.Always para observar pausa. Cuando la instancia validada sigue vigente, sin bloqueo/transición, sin pausa y con foco, clasifica ActiveAnimal. Paused/GameOver/Loading/Background/Menu no suman efectivo. No se habilita ActiveHuman: su definición y punto listo todavía necesitan una fase explícita; diálogos/menús/estadísticas se excluyen conservadoramente.

Cambio de estado: confirma [boundary,now) del estado anterior y cambia el límite en memoria, sin solapamiento. Muerte cierra activo inmediatamente y pasa a GameOver. Solicitud de reinicio/reintento pasa a Loading; nuevo guard confirma otro run. La pérdida de foco tiene notificación inmediata, además de WindowIsFocused en el muestreo. Los demás estados se contrastan cada frame con SceneTree.Paused, CurrentScene y Transicion.Ocupado.

Cadencia adoptada a partir de la propuesta documentada5s: heartbeat cada5.000ms cierra subintervalos del estado actual, incluidos menú/pausa para cobertura observada. No escribe cada frame ni crea timers de escena; intervalo inmutable con mismo ID se reintenta sin sumar dos veces. Una caída entre confirmaciones puede perder el último intervalo y cualquier cola aún no persistida;5s es la cadencia objetivo durante ejecución normal, no una garantía dura bajo I/O fallido o suspensión del proceso.

Sesión normal: el cierre de ventana y botón Salir intentan completar inicialización/cierre/flush durante máximo3s. El límite incluye inicialización y cola lenta. Si no termina o hay fallo, diagnóstico TELEMETRY_CLOSE_TIMEOUT/FAILED/INCOMPLETE, se permite salir y queda solo lo duradero. Cierre forzado/editor kill/OS crash no se presenta como normal; al siguiente arranque las sesiones abiertas se sellan interrupted hasta su límite confirmado.

_ExitTree mantiene el cierre del adaptador/State existente, no intenta inventar tiempo después de destruir el árbol. La cola usa el mismo gate del adaptador y puede rechazar STORAGE_CLOSED al salir; ese dato no se declara persistido. No se ejecuta gameplay ni motor por Codex.

### Idempotencia y errores secundarios

SessionId/EventId/IntervalId son UUIDv4 generados una vez al capturar intención/límite. Las clausuras de la cola conservan todo el DTO (incluida UTC) durante retry. El run conserva HashSet de kinds enviados; la instancia conserva sceneToken; los controles mantienen _saliendo/busy. Los servicios existentes añaden claves naturales de sesión/run y digest conflictivo: no se sobrescribe un ID contradictorio.

FIFO: intervalos anteriores se confirman antes del evento que termina el run; las siguientes escrituras esperan detrás del comando pendiente para no invertir offset/durable boundary. Respuesta perdida después de commit se reintenta con DTO idéntico y devuelve recibo ya existente; no se alteran recibos de decisiones.

Errores transitorios IO_ERROR/STORAGE_BUSY/DISK_FULL/ACCESS_DENIED/TELEMETRY_WRITE_FAILED conservan la cabeza e intentan nuevamente al muestrear tras5s; nuevas transiciones pueden disparar otro drenaje idempotente. Un conflicto/contrato/esquema incompatible desactiva SOLO captura, marca Incomplete y avisa código local. Inicialización fallida queda diagnosticada y sin captura hasta otra ejecución. Cola máxima2.048 comandos; al llenarse se desactiva captura y conserva datos ya confirmados, sin consumir memoria sin límite ni bloquear juego.

Diagnóstico [Local telemetry] seguido solo de código tipado, sin nombres, IDs, rutas, credenciales o payload. Las fallas no se ocultan en la cobertura. Observador antes de estar listo marca TELEMETRY_NOT_READY_COVERAGE y no inventa actividad previa; el contexto puede iniciar captura del animal aún vigente cuando el observador esté disponible, con cobertura desde ese momento.

Caso conservador de reinicio fallido: la solicitud persistida cierra el run según el contrato existente. No se fabrica un nuevo inicio en la misma instancia ni se sigue sumando activo después de ese cierre; se diagnostica TELEMETRY_FAILED_RESTART_COVERAGE y queda una laguna hasta entrada nueva válida. El juego conserva la escena y recursos; la estadística incompleta no lo bloquea. Reintentar la misma solicitud conserva su identidad lógica. Una salida real posterior puede cerrar navegación sin duplicar la muerte.

Limitaciones explícitas: suspensión abrupta del OS sin notificación de foco/ciclo de vida y bloqueos largos del hilo principal requieren validación runtime de la cobertura temporal; no se afirma exactitud de muestreo que no se midió. Sin una transacción de dominio+evento común, caída antes del commit puede perder la notificación; jamás se reproduce una decisión o navega otra vez para reparar telemetría. No hay outbox/ACK ni envío remoto.

### Pruebas y compilación

**395 comprobaciones C# aprobadas, cero fallidas:**31 nuevas observador +41 servicios eventos +24 pantalla +39 consultas +19 Game Over/navegación +21 reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las364 regresiones se reejecutaron, sin contar pruebas repetidas ni los ensayos de migración como una nueva suite completa.

Las31 nuevas usan reloj manual y GameplayEventService/SQLite real sobre bases sintéticas migradas. Cubren inicio único, perfil sin partida, sesiones sucesivas, cinco biomas, misma instancia/doble señal, muerte/request/retry separados, navegación fallida, salida duplicada, pausa/reanudar/menús/Game Over/carga/foco, heartbeat5s, tiempo por bioma, SQLite fallido/respuesta perdida/worker lento, cierre normal/abrupto, duración desconocida, conservación del agregado principal completo y sin nueva partida, identidad inválida y bindings C# sin capacidad de RecordDecision/CompleteBiome/HTTP.

Los tests del observador puro no ejecutan SceneTree, señales Godot, render, notificaciones de ventana ni frames reales; esos hooks se compilan e inspeccionan y requieren validación manual. Las fixtures usan local-persistence/.work/databases/<UUID>, nunca las tres bases duraderas. Regresiones de servicios incluyen stress40 sesiones/1.280 eventos. No se modifica esquema en esta fase ni se migran fuentes reales.

Comandos: build --no-restore de GameSave.Checks.csproj, --gameplay-observer y once modos seguros previos, local-persistence/run-checks.ps1. Biblioteca/ejecutores0errores/0advertencias. Rebuild completo TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild, GodotProjectDir hacia integration/sqlite/.work/:0errores,63 advertencias históricas ParallaxBackground,ninguna nueva. MSBuild89 fuentes, una referencia a biblioteca, cero fuentes backend/tests filtradas. Sin cambios de project.godot/TwoSides.csproj, sin restore de paquetes ni Node/Godot/Atlas.

### Integridad y guía manual

Comparación final:1.538 archivos protegidos con tamaño/SHA-256/fecha idénticos, incluidos biblioteca/esquema/StatisticsService/pantalla, escenas, personajes/recursos/biomas, FinNivel/finales y configuración. Los9 archivos de las tres bases/manifiestos/leases permanecen idénticos: la runtime2+extensión1 NO fue usada por las pruebas ni recibió eventos ficticios. Solo cuando el usuario ejecute Godot se producirán eventos reales. .env278bytes,SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, verificado separadamente antes/después sin valores/credenciales ni cambios de propietario/ACL. Riesgo ACL de B00 pendiente.

Guía manual propuesta:
1. Abrir esta copia sin Node/internet, usar perfil/partida existentes; no crear otra partida para probar captura. Confirmar consola sin nuevos errores y ausencia de HTTP.
2. Entrar a cada bioma decidido en orden libre; jugar más de5s, pausar más de5s, reanudar, perder y esperar en Game Over. El personaje/ambiente/recursos se comportan igual; no tomar otra decisión.
3. Reintentar y reiniciar voluntariamente, también doble clic. Debe haber una sola transición, misma elección y recursos iniciales existentes. Una solicitud no se etiqueta como carga exitosa hasta nuevo guard.
4. Ir a menú de niveles y principal/Estadísticas, esperar y volver. Esos tiempos no son efectivos animales. La pantalla conserva su diseño y seguirá mostrando No disponible para métricas no expuestas por StatisticsService; no se cambió para mostrar la nueva captura.
5. Salir por botón y cerrar por ventana; en una fase técnica autorizada consultar sesiones/events/intervals reales y cobertura para comprobar una sesión por ejecución, cierres normales, ausencia de duplicados y pausas fuera de efectivo. Sin volcar nombres/decisiones al reporte.
6. Probar foco/suspensión y cierre inesperado solo con aceptación de la posible pérdida de cola no confirmada; al abrir, esperar interrupted, no duración ficticia. No dañar la base ni bloquearla para probar errores: esos casos son sintéticos.
7. Cualquier diagnóstico [Local telemetry] significa posible cobertura incompleta, nunca permiso de borrar/reinicializar datos. Aportar código/traza sin secretos y acción que lo produjo.

Siguiente paso recomendado: validación runtime de captura/tiempos/cierre y revisión técnica readonly autorizada de eventos reales; después, otra fase para exponer métricas con cobertura en Estadísticas. No agregar ahora UI, CompleteBiome, finales, checkpoints, Atlas/AWS o B05. Trabajo detenido al terminar D4B.
