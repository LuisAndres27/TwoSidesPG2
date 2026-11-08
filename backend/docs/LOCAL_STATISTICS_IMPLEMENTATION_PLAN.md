# B04.2B.2B.2D.1 — Plan de implementación de estadísticas locales

Fecha: 2026-10-26. **Diseño únicamente. D.2 NO implementada ni autorizada por este documento.** Fuentes y métricas verificadas en [recursos](LOCAL_RESOURCE_AUDIT.md), [eventos](GAMEPLAY_EVENT_AUDIT.md) y [estadísticas globales](GLOBAL_STATISTICS_DESIGN.md).

## Orden recomendado para D.2

1. Aprobar contrato de métricas/tiempos, alcance de sesión, estados exclusivos, definición de derrota, cobertura histórica, política ante fallo estadístico y cadencia del heartbeat. La propuesta inicial5s es evaluable, no valor adoptado. No vincular avance de gameplay a internet.
2. Implementar primero consultas readonly de perfiles/partidas/decisiones/progreso existentes, con paginación completa y filtros de dueño/versión. Esto NO necesita migración. Mostrar desconocido para muerte/reinicios/tiempos/final no disponibles, nunca0 fabricado. Sin panel visual nuevo si no se autoriza.
3. Diseñar/probar almacenamiento local de eventos y tiempos en fixtures sintéticas; si se aprueba instrumentación duradera, requiere migración aditiva versionada. No hay estructura existente segura para sesiones/intervalos; no alterar snapshots ni settings para evitar una migración legítima.
4. Incorporar observador único y reloj monotónico inyectable, ciclo de vida y clasificación de intervalos. Confirmar identidad/partida, no cambiar la revisión del gameplay por cada heartbeat.
5. Conectar nueva partida/decisión mediante extensión transaccional donde sea apropiado, reutilizando IDs/digests originales. Separar resultado de dominio de evento de presentación. Reintentos de RecordDecision no vuelven a proyectar ni producir eventos.
6. Conectar entrada animal, pausa/reanudar, reinicio/reintento y retorno a niveles en puntos centrales existentes. Game Over registra primera derrota por sesión animal, sin cambiar daño/vida ni lógica Die. Las causas no propagadas serán unknown; capturarlas exactamente exigiría autorización adicional de los scripts de origen.
7. Integrar y validar intervalos/cierres inesperados/errores con fixtures, luego compilación controlada y validación manual autorizada. Nunca usar las tres bases protegidas para pruebas destructivas.
8. Dejar CompleteBiome/meta física, evaluador/cierre final, outbox/transporte Atlas y panel AWS para fases autorizadas posteriores. Un log analítico no habilita finalización ni B05.

## ¿Hace falta migrar?

No para estadísticas derivadas del esquema actual. Sí para conservar nuevos eventos de muerte/reinicio y tiempos entre procesos: SchemaManager.CurrentVersion=2 tiene diez tablas sin esa semántica. No se ejecuta ninguna migración en D.1. Una futura versión3 debe estar explícitamente aprobada y ensayada en bases sintéticas; activación sobre el runtime manual requiere autorización que abarque esa base, no está concedida por esta auditoría.

Propuesta mínima, nombres/columnas aún no existentes y sujetos a aprobación:

| Tabla propuesta | Campos y claves | Justificación/validación |
|---|---|---|
| local_gameplay_sessions | session_id UUID PK; local_player_id FK→perfil; opened_at_utc; observed_until_offset_ms; closed_at_utc nullable; status open/closed/interrupted; coverage_from_utc/version | Un proceso/sesión por perfil; cierre inesperado no inventa closed_at. Índice(owner,opened_at_utc); actor/session no son auth/session |
| local_gameplay_events | event_id UUID PK; local_player_id; session_id FK; sequence; game_id nullable; biome_id nullable; animal_run_id nullable; kind; business_key; occurred_at_utc; observed_offset_ms; payload_version; payload_json permitido; payload_digest | UNIQUE(session_id,sequence), UNIQUE(owner,business_key); FK(owner)→perfil y FK(game,owner)→saved_games; FK(game,biome)→progress si ambos presentes. Índices(game,biome,kind) y(session,sequence). Dueño de sesión se valida por FK compuesta UNIQUE(session_id,owner), no solo por aplicación |
| local_activity_intervals | interval_id UUID PK; session_id; sequence; owner; game_id/biome_id nullable; animal_run_id nullable; state_kind; start_offset_ms; end_offset_ms; duration_ms; interval_version | FK(session,owner), FK(game,owner), FK(game,biome) donde aplica; UNIQUE(session,sequence); end>=start>=0 y duration=end-start; índice(game,biome,state_kind). Servicio transaccional impide solapamientos: un CHECK de una fila no lo garantiza |

animal_run_id identifica un evento animal_run_started (event_id ya existente) en vez de añadir otra tabla de runs sin necesidad. Eventos/intervalos que lo usen requieren FK al evento de inicio y validación transaccional de tipo/misma sesión, dueño, partida y bioma; el ciclo de vida se deriva de eventos start/terminal. Para eventos de sesión sin partida, game/biome/run deben ser null coherentes. No crear cinco tablas por bioma ni una tabla de totales mutable si basta consultar intervalos/eventos.

No se introduce todavía tabla de envío ni estado de sincronización en local_operations. Outbox futura justificada solo cuando se autorice entrega remota; propondrá FK a evento y ACK/lease/retry, en misma transacción de origen. Estadísticas históricas derivadas podrán exportarse desde IDs estables, no creando falsos eventos de muerte.

Conservar migraciones1/2 y checksums sin cambios. Añadir dispatch explícito de migración/VerifyHistory: el código actual tiene alternativas específicas1/2, no admite automáticamente un tercer SQL. Verificar historial, app_id, user_version y validación de proveedor; ningún downgrade/overwrite silencioso. Una aplicación antigua versión2 rechazará la base3: compatibilidad de datos conservados NO significa compatibilidad con ejecutables antiguos. Plan de reversión y respaldo futuro debe preservar ACL/propiedad y estar autorizado; no crear respaldos de datos reales en esta auditoría.

## Archivos exactos previstos para futura autorización

| Archivo existente o nuevo propuesto | Cambio futuro acotado |
|---|---|
| local-persistence/src/SchemaManager.cs.txt | Solo si se aprueba nueva persistencia: migración3/historial/verificación, sin cambiar SQL/checksum1/2 |
| local-persistence/src/StatisticsModels.cs.txt (nuevo) | DTOs tipados, estados de tiempo, eventos/intervalos/resultados de cobertura; sin recursos restaurables |
| local-persistence/src/StatisticsRepository.cs.txt (nuevo) | SQL parametrizado y consultas agregadas dentro de conexión/tx existente |
| local-persistence/src/StatisticsService.cs.txt (nuevo) | Idempotencia por business_key/eventId, dueños/IDs/versiones, secuencia/no solapamiento, sellado interrupted |
| local-persistence/src/UnitOfWork.cs.txt | Reutilizar Read/BeforeCommit; cambio solo si contrato de escritura estadística necesita exponer tx sin mutar revisión de partida |
| local-persistence/src/GameSaveService.cs.txt | Preferir extensión existente para new_game/decision; cambiar solo si falta superficie segura de consulta, sin modificar regla de decisión/final |
| local-persistence/src/OwnedCopyDatabase.cs.txt | Revisar checks de esquema/propiedad si versión nueva; no ampliar rutas ni abrir almacenes ajenos |
| integration/sqlite/GamePersistenceAdapter.cs | Serializar servicio estadístico en el ciclo local existente, sin HTTP ni apertura de conexión desde escena |
| integration/sqlite/LocalStatisticsCoordinator.cs (nuevo) | Máquina de estados exclusiva, reloj inyectado y dedupe por instancia/intención/run; no un segundo autoload |
| integration/sqlite/GamePersistenceContext.cs | Poseer observador, inicio/cierre/flush; conservar apertura/cierre local |
| scripts/network/GameApplicationContext.cs | Solo si hace falta enrutar foco/suspensión/quit al observador; es controlador global y deberá autorizarse expresamente, no está modificado |
| integration/sqlite/LocalGameState.cs | Contexto tipado para observar navegación; no convertir refresh readonly en escritura oculta |
| scripts/AnimalSegmentFlow.cs | Una captura de run_started tras guard, origen explícito restart/game_over_retry e intentId estable; handshake carga confirmada |
| assets/sprites/ui/MenuPausa.cs | Emitir transición pausa/reanudar e intención de reinicio/salida, sin cambiar controles ni mecánicas |
| assets/sprites/ui/GameOver.cs | Emitir derrota al primer _mostrado y origen de retry/menu; sin alterar Die, daño ni vida |
| scripts/MenuNiveles.cs y scripts/MenuPrincipal.cs | Solo si el observador central no identifica estados menú/entrada; conservar destinos y partida única |
| local-persistence/game-save-tests/LocalStatisticsChecks.cs.txt (nuevo) y GameSaveChecks.cs.txt | Ejecutor sintético aislado y dispatcher; sin modo que abra runtime real |
| local-persistence/tests/Checks.cs.txt | Pruebas de migración1/2→3, checksums, rollback/reapertura y compatibilidad |

No cambiar project.godot/TwoSides.csproj ni escenas. La biblioteca existente compila *.cs.txt; los nuevos archivos de integración deberán verificar inclusión y una sola referencia de biblioteca, sin duplicarla. Los siete documentos de runtime no se amplían en D.1; solo los cuatro entregables y PHASES/PHASE_HISTORY/DECISIONS.

Fuera de D.2 recomendada: FinNivel.cs y Final.cs permanecen intactos. Captura exacta de causa de muerte si requiere Player*/ZonaMuerte, consumos por frame, NPC/recursos, pantalla estadística y endpoints/backend requieren autorización separada. Los nombres nuevos de este plan son propuestas, no afirmaciones de existencia.

## Protocolo y compatibilidad con partidas existentes

Antes de instrumentar, determinar inicio de coverage de cada perfil sin asumir sesiones anteriores. No recalcular la elección del usuario ni reescribir los recibos para añadir columnas analíticas. Eventos de dominio nuevos deben anexarse atómicamente a nuevos commits con BeforeCommit; entidades anteriores se consultan por sus IDs originales, diferenciadas de captura nueva.

Un restart_requested puede quedar pendiente si cambia la escena o cae el proceso. El nuevo guard confirma run_started y restart_confirmed con el intentId; errores de navegación no aumentan reinicios exitosos. Si la estadística falla después de una carga, no inventar una confirmación ni revertir decisiones. Política de seguir con cobertura degradada frente a detener transición requiere aprobación previa y pruebas, no una decisión implícita.

Sobreentrega y relecturas pueden ocurrir; persistir intentId, business_key y eventId una vez. Un ID repetido con mismo digest devuelve lo existente; con payload distinto devuelve conflicto. Muerte por caída/Hurtbox/Die se cuenta en el primer fracaso del run, no por cada detector. El cierre de run por muerte no se cuenta otra vez como abandono al volver al menú. Las tablas propuestas son analíticas; nunca sirven para devolver al jugador a mitad del recorrido.

## Pruebas propuestas para D.2, no ejecutadas en D.1

- Reloj falso: pausa, menú, carga, foco, suspensión, diálogo listo, muerte y reintento; un solo estado activo, límites semiabiertos, duración no negativa, overflow y conversión con resto. UTC atrás/adelante no altera elapsed.
- Heartbeat y transición simultáneos: sin huecos/solapamientos duplicados; ACK de mismo intervalo/evento no incrementa. Un total por jugador coincide con suma de intervalos efectivos, no suma de múltiples niveles de agregación.
- Proceso hijo: cerrar sin flush simulado, reabrir fixture y sellar interrupted hasta último dato duradero; duración desconocida diferenciada de0 y sin restauración jugable intermedia.
- Dos intentos legítimos de un bioma vs doble clic; five biomes/ambos ambientes; death+zona duplicadas; retry navegación/SQLite y dos observadores accidentales.
- Atomicidad: rollback beforeCommit sin evento huérfano ni recibo modificado; commit con respuesta perdida; mismo ID/digest y conflicto por otro payload. Disco lleno/acceso denegado/almacén cerrado y cola serial sin deadlocks.
- Migración de fixture v2 con decisiones/recibos reales sintéticos, versión1, versión futura, checksum alterado, interrupción/reapertura y conservación de digests/IDs; ninguna base del usuario.
- Consultas completas con más de50 partidas/100 decisiones, porcentajes con denominador0, propietarios ajenos, versiones desconocidas y ausencia de backfill inventado.
- Reejecutar las260 regresiones históricas cuando se implemente, no contarlas como nuevas pruebas. Compilar biblioteca y Godot C# sin motor/Node/Atlas, registrar63 advertencias históricas y ninguna nueva. Validación manual posterior autorizada mantiene cinco biomas libres, decisión única, reinicio/Game Over/navegación y recursos originales.

## Criterios de aceptación propuestos de B04.2B.2B.2D.2

1. Contrato de duración/cobertura/orígenes aprobado; consultas derivadas correctas y datos ausentes marcados desconocidos.
2. Si se autoriza captura duradera: esquema aditivo probado, sesiones/eventos/intervalos idempotentes, inicio de cobertura y cierres interrupted sin tiempo ficticio.
3. Decisiones, progreso e historial existentes intactos salvo nuevas operaciones legítimas de gameplay; ningún cambio de elección por instrumentación.
4. Tiempo de pausa/Game Over/menú/carga fuera del efectivo; no checkpoints de recursos/posición ni reinicio del proceso contado como continuación exacta.
5. No métricas de completed/final simuladas: siguen pendientes hasta sus respectivas integraciones.
6. Pruebas sintéticas y compilación aprobadas, ningún acceso de pruebas a las tres bases protegidas/.env y ninguna dependencia HTTP obligatoria.
7. No outbox real, Atlas, AWS, endpoints globales ni B05 sin autorización posterior. No actuar sobre la base runtime manual por inferir permiso de este plan.

Riesgos principales: eventos anteriores al commit perdidos al caer proceso, duplicación por doble observador/callback/ACK, sesgo por captura tardía y jugadores sin sync, UTC del cliente no confiable, identidad entre instalaciones sin vínculo, cuota local agotada y migración incompatible con binarios antiguos. El diseño registra cobertura/límites en vez de prometer exactitud inexistente.

D.1 termina con documentación e inspección; no se ejecutan tests, builds, motores, migraciones ni servicios porque no cambió código. D.2 requiere la siguiente instrucción.


## B04.2B.2B.2D.2 — Consultas locales sin migraciones (2026-10-26)

**COMPLETADA EN CÓDIGO. Pantalla Estadísticas pendiente, sin conexión visual.** La autorización actual limita el plan D.1 a consultas derivadas: no se implementan sus propuestas de sesiones/eventos/intervalos, esquema3, instrumentación o sincronización. Prevalece este alcance sobre los apartados futuros del plan histórico.

Inventario exacto de cambios: nuevos local-persistence/src/StatisticsModels.cs.txt, StatisticsRepository.cs.txt y StatisticsService.cs.txt; nuevo local-persistence/game-save-tests/LocalStatisticsChecks.cs.txt y selector --local-statistics en GameSaveChecks.cs.txt. Documentación: LOCAL_STATISTICS_IMPLEMENTATION_PLAN.md, GLOBAL_STATISTICS_DESIGN.md, PHASES.md, PHASE_HISTORY.md, DECISIONS.md y local-persistence/README.md. Total11 archivos. No se cambian UnitOfWork, SQLiteRepository, GameSaveService, adaptadores, Godot, proyectos, esquema ni migraciones.

### Consultas y contratos implementados

StatisticsService recibe ISaveDatabase ya validado y SaveCatalog existente, sin ruta arbitraria ni apertura/creación de almacenes desde UI. Su constructor verifica esquema2 e integridad mediante SchemaManager.Verify (sin Initialize). Cada consulta completa usa **una UnitOfWork.Read**; StatisticsRepository reutiliza Profile/Games/Game/Biomes/Decisions/Environments/Receipt del repositorio existente dentro de esa misma transacción. Las listas son materializadas y expuestas como colecciones readonly. No hay SQL de escritura, recibos nuevos, timestamps actualizados ni almacenamiento redundante.

- GetLocalStatistics(): StatisticsResult<PlayerStatistics>; NoData/Data=null si el esquema está inicializado pero no hay perfil. Nunca crea perfil ni partida.
- GetPlayerStatistics(owner): exige UUID válido y coincidencia con el perfil local; devuelve nombre visible, ID, TotalGames, ActiveGames/ActiveGameId/ActiveGame, HistoricalGames, CompletedGames, AllDecisions/HistoricalDecisions, AllProgress/HistoricalProgress y Uncollected.
- GetGameStatistics(owner,gameId): consulta una partida de ese dueño; GameStatistics incluye IDs, revisión, estado/is_current, versiones, fechas almacenadas, Ending, ConfirmedCompleted, DecisionStatistics, ProgressStatistics y cinco BiomeStatistics.
- DecisionStatistics: Total/Reject/Approve/Healthy/Degraded y cinco BiomeDecisionStatistics. BiomeStatistics contiene estado/resultado/fechas, evidencia de inicio y ConsequenceStatistics opcional (GameId/BiomeId/DecisionId/OperationId, OptionId, ambiente, JSON/version/reglas/fecha).
- No se exponen referencias de credenciales, correo interno ni cuenta técnica en estos contratos. DisplayName se usa solo localmente, no se exporta.

ActiveGame significa la fila is_current, tanto in_progress como final_pending; no promete que esta última sea jugable ni que la navegación final ya exista. HistoricalGames excluye is_current y conserva cada GameId. All* suma todas las partidas; Historical* solo las no actuales; ActiveGame contiene su propio resumen. Los valores de progreso históricos suman filas (GameId,BiomeId), no colapsan ocean de varias partidas en una fila. GamesState=NoData distingue perfil sin partidas, aunque sus conteos válidos sean0.

El repositorio pagina juegos en bloques128 hasta agotar y decisiones por decision_order hasta agotar, bajo el mismo snapshot, sin quedar limitado a50/100. La selección de perfil se verifica dentro de la transacción y los SQL reutilizados parametrizan dueño/partida. No se mezclan consultas de GameSaveService que abrirían transacciones independientes.

### Interpretación y prevención de duplicados

Se valida catálogo/versiones de contenido/formato, cinco biomas/ambientes, decisiones y opciones/consecuencias v1/v2, vínculo LastDecisionId y recibo de decisión de la misma partida/propietario. No se cuenta la proyección environmental_state como otra decisión. IDs y clave lógica por bioma/decision_key se validan; ningún reinicio/visita incrementa decisiones porque esas rutas solo consultan y la capa no emite comandos.

Completed de progreso se cuenta exclusivamente desde biome_progress.status='completed'; animal_pending no es fallo ni completed. Las cinco filas precreadas human_pending no equivalen a cinco entradas. ConfirmedStartedMinimum incluye decisión confirmada o entrada humana actual indicada por CurrentBiomeId/ResumeKind. Started es true con evidencia y null si no puede conocerse. Progress.Started es Unknown/null si falta evidencia para alguna fila; solo es Available cuando todas están acreditadas y NoData si no hay filas. No se infieren visitas históricas desde attempt_number, recibos sin BiomeId o saved_at.

ConfirmedCompleted de partida requiere status completed y los metadatos terminales existentes: ending good/medium/bad, ending_rules_version igual a rules_version y completed_at presente. Ending también reconoce esos metadatos en final_pending sin contar la partida como terminada. Esto verifica la declaración almacenada, NO recalcula umbrales ni demuestra una llegada física no instrumentada. Un completed con metadatos incompletos devuelve Ending Unknown y CompletedGames Unknown/null, no un cero ficticio. Archived no se trata como completado por su nombre. No se implementa cierre ni finales.

StatisticsAvailability distingue Available, Unknown, NotAvailable y NoData. StatisticCount.Value es nullable:
- Available con0: conteo válido y vacío, por ejemplo decisiones de un perfil sin partidas.
- Unknown/null: datos insuficientes para una métrica derivada, por ejemplo número exacto de biomas iniciados o terminal incompleto.
- NotAvailable/null, Reason=NOT_COLLECTED: tiempo jugado, sesiones, muertes, reinicios y reintentos, sin captura existente.
- NoData: no existen registros aplicables (perfil ausente, historial vacío, consecuencia de un bioma sin decisión o final no registrado).

Datos corruptos/contradictorios no generan estadísticas inventadas ni se reparan: SaveException con código seguro (INVALID_STATISTICS_DATA, UNKNOWN_CONTENT, NOT_FOUND, INVALID_DATA, UNSUPPORTED_SCHEMA o códigos StorageErrors como IO_ERROR/ACCESS_DENIED/STORAGE_BUSY). No se devuelve un resumen parcial como éxito tras fallar SQLite.

### Ejemplos sintéticos comprobados

Prueba con una partida histórica con reject en ocean y una actual con approve en jungle: TotalGames2, ActiveGames1, CompletedGames Available1, AllDecisions Total2/Reject1/Approve1, HistoricalDecisions Total1/Reject1/Approve0, ActiveGame.Decisions Total1/Reject0/Approve1. Las decisiones no completan los biomas; los metadatos terminales históricos son preparación explícita de fixture, no implementación de finales.

Prueba con55 partidas históricas de dos decisiones y una activa de una decisión: TotalGames56, HistoricalGames.Count55, AllDecisions.Total111, Reject56, Approve55. Otra fixture de129 partidas confirma que la paginación supera incluso el bloque interno128. No son estadísticas de la partida manual.

Ejemplo de estado sin captura:
~~~json
{"PlayedMilliseconds":{"State":"NotAvailable","Value":null,"Reason":"NOT_COLLECTED"},"Deaths":{"State":"NotAvailable","Value":null,"Reason":"NOT_COLLECTED"}}
~~~
La representación muestra nombres de enum para documentación; el contrato C# no impone una serialización JSON remota.

### Preparación para la futura pantalla

Una futura integración explícitamente autorizada debe invocar estas consultas en el worker/cola del adaptador propietario del ISaveDatabase ya abierto, conservar su ciclo de vida y entregar DTOs al hilo Godot. No abrir una conexión ni ejecutar SQL en scripts visuales. Obtener primero GetLocalStatistics; manejar NoData y SaveException sin crear partidas ni usar recuperación HTTP. Renderizar Value solo cuando State=Available; mostrar desconocido/no disponible/sin datos según el estado. Para opciones actuales usar ActiveGame.Biomes y sus consecuencias; para historial seleccionar GameId o Historical*. No sumar All*+ActiveGame+Historical* (duplicaría datos).

No se añade todavía ese método al GamePersistenceAdapter, ni botón, escena, observador de tiempo, exportador, tarea de sync o endpoint. Los contratos son locales; estadísticas globales seguirán derivándose en el servidor de múltiples jugadores sincronizados, con política de identidad/datos mínimos futura.

### Pruebas y compilación efectivas

**299 comprobaciones C# aprobadas, cero fallidas:**39 nuevas estadísticas +19 Game Over/navegación +21 reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las260 anteriores se reejecutaron, no se presentan solo como historia.

Las39 cubren base inicializada vacía, perfil sin partidas, activa/historial separado, ambos resultados en cinco biomas, orden libre, retry idempotente/restart sin doble conteo, paginación56/129 y111 decisiones, completed realmente almacenado, final histórico/versiones/metadatos incompletos, final_pending actual, cuatro estados de disponibilidad, consecuencias v1/v2, conexión mode=ReadOnly/query_only, bytes/timestamps/esquema/recibos intactos, una conexión por snapshot completo, perfiles ajenos/independientes, IDs inválidos, tabla ausente, errores de acceso, versión antigua incompatible sin upgrade, consecuencias desconocidas/contradictorias y ausencia de dependencias HTTP/Mongo/Godot/campos de credenciales.

Comandos: dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore; ejecutor con --local-statistics y los ocho modos seguros anteriores; local-persistence/run-checks.ps1. Solo fixtures propias en local-persistence/.work/databases/<UUID>, cero archivos SQLite sintéticos restantes. No se prueba con bases manuales, modo durable por defecto ni conexiones externas. Callbacks y fuente de UI inspeccionada en regresiones no equivalen a ejecución del motor.

Biblioteca/ejecutor0errores/0advertencias. Rebuild completo TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild, GodotProjectDir hacia integration/sqlite/.work/:0errores,63advertencias históricas ParallaxBackground y ninguna nueva. MSBuild:86 fuentes, una sola referencia de biblioteca y cero fuentes backend/tests filtradas. CLI/paquetes/temporales privados, sin restore ni cambios de proyectos. No Godot, Node.js o Atlas ejecutados.

### Compatibilidad, integridad y límites

Compatible con esquema2 inicializado y registros antiguos de formato/consecuencias soportados. Una base sin esquema o esquema1 que necesitaría migración se rechaza sin inicializar/actualizar; tampoco se interpreta contenido de versiones desconocidas. No se alteran los diez modelos/tablas existentes ni sus constraints/checksums. Las consultas materializan el historial completo; para volúmenes muy grandes queda optimización futura, sin cambiar ahora su semántica.

Comparación antes/después:1,530 archivos protegidos idénticos en tamaño/SHA-256/fecha y9 archivos de las tres bases/manifiestos/leases intactos. No se abrieron bases duraderas mediante SQLite. .env278bytes,SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928,comprobado separadamente de builds/tests sin leer valores ni cambiar ACL/propietario. Riesgo ACL de B00 pendiente. Producción previa de gameplay, recursos, decisiones, pausa/Game Over/navegación/FinNivel/Final, escenas y proyectos permanecen intactos.

Siguiente subfase recomendada: conexión local de pantalla Estadísticas con estos DTOs y estados, solo tras nueva autorización. Eventos/tiempos/muertes/reinicios, migraciones, CompleteBiome, finales y Atlas quedan para fases separadas; no B05. Detenerse después de D.2.

## B04.2B.2B.2D.3 — Pantalla local de estadísticas (2026-10-26)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** Se conecta exclusivamente la consulta local de D.2, sin eventos, migraciones, sincronización ni nuevas métricas.

Inspección: el botón existente es Centro/Tablero/Margen/Contenido/BotonesInferiores/BotonEstadisticas, en assets/sprites/ui/menu_principal.tscn. MenuPrincipal lo deshabilitaba si EscenaEstadisticas era null, y esa exportación no está asignada. No existe una escena/pantalla de estadísticas; scripts/Estadisticas.cs es HUD de recursos y queda intacto. Por tanto se crea una vista desde C#, como el LocalProfileView existente, dentro del tablero del menú, sin añadir/editar .tscn ni cambiar recursos visuales.

Archivos de producción: scripts/MenuPrincipal.cs; nuevo scripts/LocalStatisticsScreen.cs; integration/sqlite/GamePersistenceAdapter.cs; integration/sqlite/GamePersistenceContext.cs; nuevo integration/sqlite/LocalStatisticsScreenState.cs. Pruebas: nuevo local-persistence/game-save-tests/StatisticsScreenChecks.cs.txt, dispatcher GameSaveChecks.cs.txt y Compile del archivo puro en GameSave.Checks.csproj. Documentación: LOCAL_STATISTICS_IMPLEMENTATION_PLAN.md, GLOBAL_STATISTICS_DESIGN.md, PHASES.md, PHASE_HISTORY.md, DECISIONS.md, local-persistence/README.md y los tres documentos GODOT_RUNTIME_INTEGRATION_PLAN/GODOT_SCENE_EVENT_MAPPING/GODOT_RUNTIME_TEST_PLAN. Total17 archivos; no se modifican proyectos de producción ni biblioteca de consultas D.2.

### Integración de fuentes y consulta

Los Statistics*.cs.txt son fuentes reales de la biblioteca: local-persistence/src/TwoSides.LocalPersistence.csproj incluye Compile="*.cs.txt". TwoSides.csproj excluye local-persistence/** y ya tiene una ProjectReference a esa biblioteca. No se renombran/copian DTOs/servicio a scripts Godot ni se duplican clases. GameSave.Checks.csproj incorpora solo el nuevo estado puro de pantalla, sin referencias al motor.

GamePersistenceAdapter implementa ILocalStatisticsReader, una capacidad con un único GetLocalStatisticsAsync. Reutiliza su _gate/Task.Run y el ISaveDatabase ya abierto por el contexto, con StatisticsService lazy dentro del worker. GetLocalStatistics consulta el mismo esquema/datos de D.2 en una transacción de lectura; no abre otro CopyGameDatabase ni crea registros. El servicio estadístico se invalida al Close/Dispose del adaptador. Prueba negativa del adaptador real cerrado verifica STORAGE_CLOSED sin abrir rutas protegidas.

Ajuste de composición mínimo, anunciado antes de editar: GamePersistenceContext conserva el mismo adaptador propietario en un campo y expone únicamente ILocalStatisticsReader Statistics. El mismo adaptador sigue construyendo State y sigue bajo Initialization/Shutdown existentes; no hay nuevo autoload, contexto ni proveedor de rutas. No se modifica LocalGameState ni sus reglas.

MenuPrincipal.Statistics bloquea doble clic con _navigating, muestra carga, espera el resultado local y abre LocalStatisticsScreen con ese estado ya cargado. El botón deja de depender de EscenaEstadisticas y no exige partida activa: habilitado con almacenamiento listo, sin escritura pendiente/operación/transición en curso. También admite perfil ausente como estado vacío. No crea nombre ni partida. La exportación antigua se conserva sin usarse para navegación.

### Vista y ciclo de vida

La vista es un VBoxContainer hijo del MarginContainer del tablero actual. Durante su apertura se oculta el contenido original y se muestra título, ScrollContainer con Label de texto plano, Volver al menú y Reintentar consulta en caso de error. Mantiene fondo/textura/música del menú sin editar escena. Tamaño mínimo510x220 y fuente12 para cuerpo/botones, diseñado para viewport640x360; ajuste visual, scroll y foco requieren validación en Godot.

LocalStatisticsScreenState consulta una vez por apertura o reintento explícito, genera el texto en Task.Run y lo conserva; no hay polling SQLite ni formateo completo en cada frame. El render/tocar controles queda en hilo Godot tras await. Close invalida el estado y descarta respuestas tardías; cada callback verifica vida de nodo antes de actualizar UI. Volver oculta/retira la vista y restaura contenido/foco del menú, sin cambiar escena, partida o pausa. Una nueva apertura vuelve a consultar los datos actuales una vez.

Los datos del jugador solo se asignan a Label.Text: no RichTextLabel/BBCode, SQL, código, URLs ni rutas de escena. No se muestran LocalPlayerId/GameId/OperationId ni referencias de credenciales; nombre visible y fechas se usan como texto. No se exporta información.

### Datos presentados y estados

- Nombre, total de partidas y existencia de partida actual; terminadas solo según metadatos confirmados por D.2.
- Todas las partidas: decisiones totales, No/reject, Sí/approve y desglose de los cinco biomas.
- Partida actual: estado, fecha almacenada, decisiones propias, completados y pendientes, estado de cada bioma y ambiente confirmado.
- Historial separado, excluyendo la actual: totales históricos y cada partida enumerada sin ID técnico, con decisiones/progreso/ambientes y final solo si Ending está disponible. Un final no confirmado dice Desconocido o Sin final registrado, sin calcular umbrales.
- Tiempo jugado, sesiones, muertes, reinicios y reintentos muestran No disponible porque D.2 devuelve NotAvailable/null; no se convierten en0. El formateador distingue Unknown→Desconocido, NoData→Sin datos y Available0→0.
- Perfil ausente: mensaje vacío explícito. Perfil sin partidas: conteos medidos0 e historial/partida actual vacíos, sin inventar progreso. animal_pending aparece como decisión confirmada/segmento animal pendiente, no como error ni completed.

No se suman AllDecisions+ActiveGame+HistoricalDecisions como si fueran métricas disjuntas: las secciones indican su alcance. Los biomas realmente completed vienen del dato persistido, no de la decisión. Las fechas se presentan como registro, nunca se restan para inventar duración.

Error SQLite/servicio: la vista presenta error local controlado y permite Reintentar consulta o Volver. No muestra mensajes internos/secretos ni redirige a recuperación/login; un error no genera una partida temporal. Sin almacenamiento inicializado el botón permanece deshabilitado; la inicialización conserva su diagnóstico local previo.

### Pruebas y compilación

**323 comprobaciones C# aprobadas, cero fallidas:**24 nuevas de pantalla +39 consultas +19 Game Over/navegación +21 reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las299 anteriores se reejecutan, no se presentan como resultado nuevo solo por referencia histórica.

Las24 usan StatsService/SQLite real readonly en fixtures propias: perfil vacío/sin partidas, diez combinaciones bioma/opción, historial sin activa y final registrado, scopes separados, completed almacenado, estados no disponibles/desconocidos/cero, doble clic/carga asincrónica, error/retry, cierre con respuesta pendiente, reapertura sin polling, proceso hijo readonly, nombre con aspecto de markup sin IDs expuestos, adaptador cerrado real y bindings de texto/controlador sin HTTP. No abren bases manuales. El camino positivo del adaptador propietario se compila/inspecciona; las fixtures no debilitan sus restricciones de ruta para ejecutarlo sobre una base arbitraria.

Comandos: build --no-restore de GameSave.Checks.csproj; ejecutor --statistics-screen y sus probes de fixture, --local-statistics y los ocho modos seguros previos; local-persistence/run-checks.ps1. Fixtures bajo local-persistence/.work/databases/<UUID>, cero archivos SQLite sintéticos restantes. Pruebas de estado/formato/bindings no equivalen a botones, scroll o render ejecutados en Godot, ni a prueba real de desconexión de red.

Biblioteca/ejecutor0errores/0advertencias. Rebuild completo TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild, GodotProjectDir hacia integration/sqlite/.work/:0errores,63 advertencias históricas ParallaxBackground,ninguna nueva. MSBuild:88 fuentes, una referencia a la biblioteca y cero fuentes backend/tests filtradas; no se duplica StatisticsService ni su fuente .cs.txt. CLI/paquetes/temporales privados; sin restore, editor/motor, Node.js o Atlas ejecutados.

### Integridad y validación manual pendiente

Antes del ajuste de contexto se verificó intacto el manifiesto inicial de1,528 archivos protegidos; se añadió GamePersistenceContext al inventario autorizado antes de editarlo. Manifiesto final:1,527 archivos protegidos con tamaño/SHA-256/fecha idénticos antes/después, incluidos esquema, biblioteca D.2, escenas, project.godot/TwoSides.csproj, actores, recursos, decisiones, Game Over/pausa/reinicio/navegación animal/FinNivel/finales. Nueve archivos de las tres bases/manifiestos/leases permanecen intactos, sin abrirlos mediante SQLite en pruebas. .env278bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928 antes/después, separado de builds/tests, sin leer valores ni cambiar permisos/propietario. Riesgo ACL de B00 pendiente.

Guía manual: abrir esta copia en Godot C# sin Node; con el perfil existente pulsar Estadísticas y comprobar nombre, partidas y decisiones de los cinco biomas contra lo jugado. Verificar que decidir no equivale a completed y que los ambientes coinciden; distinguir secciones actual/historial. Confirmar No disponible para los cinco campos no capturados, desplazamiento hasta el final y retorno al mismo menú. Doble clic debe abrir una sola vista. Reabrir tras volver, cerrar/abrir el juego y probar sin internet. Si solo hay perfil/historial debe poder consultarse sin crear otra partida. No borrar bases ni alterar decisiones para fabricar casos; vacíos/fallos se cubren con fixtures.

Si aparece un error, copiar consola/traza sin secretos e indicar carga, scroll o retorno. No se afirma validación visual sin motor. Historial completo muy grande todavía puede exigir paginación visual futura; consultas/formateo se ejecutan fuera del hilo principal, pero layout/render final necesita evaluación runtime.

No se implementan captura de métricas, migración, CompleteBiome, checkpoints, finales, Atlas, datos globales ni B05. Siguiente paso: validación manual de D.3 y autorización específica para cualquier nueva subfase. Trabajo detenido al terminar.

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

## B04.2B.2B.2D.4A.1 — Respaldos y ensayo de migración (2026-10-26 Guatemala)

**COMPLETADA. Las tres bases originales siguen sin migrar.** Ejecución real de respaldos:2026-10-27T05:22:36Z, equivalente a2026-10-26 23:22:36 en Guatemala. No se falsifican fechas ni timestamps de origen.

### Herramienta aislada y ubicación privada

Archivos nuevos: local-persistence/backup-rehearsal/BackupRehearsal.csproj, Program.cs.txt y packages.lock.json. Solo se actualizan estos cinco documentos: LOCAL_STATISTICS_IMPLEMENTATION_PLAN.md, PHASES.md, PHASE_HISTORY.md, DECISIONS.md y local-persistence/README.md. No cambia ninguna herramienta compartida, migrador/repositorio de producción, adaptador runtime, gameplay, interfaz o escena.

El helper referencia la biblioteca existente y RealGameCatalog, compila fuentes .cs.txt como ejecutor aislado y admite solo --self-test y --backup-and-rehearse. No acepta rutas de origen/destino del usuario ni modo restaurar originales. La ejecución privilegiada revisada se limita a crear la carpeta privada fuera de OneDrive y escribir respaldos/copias/manifiesto allí; las tres fuentes son constantes y se abren exclusivamente ReadOnly.

Raíz de salida: %LOCALAPPDATA%\TwoSides\PrivateBackups\D4A1\<fechaUTC-UUID>. El manifiesto privado manifest.json contiene rutas exactas de cada origen/respaldo, fecha, tamaño, SHA-256, versión/base/application_id, método, integridad, relaciones, conteos/huellas por tabla y resultados de migración/rollback/restauración. La ruta exacta y hashes de esta ejecución se entregan al usuario en el informe privado. No se copian respaldos, datos del jugador ni el manifiesto privado al repositorio/documentos públicos.

La raíz nueva tiene ACL privada explícita para el usuario ejecutor, SYSTEM y Administradores. Se configura exclusivamente esa carpeta nueva, no permisos/propietario de las fuentes. Está fuera del árbol OneDrive y del repositorio Git; no se envía nada a nube. Los archivos de respaldo y las copias de ensayo contienen datos reales y deben conservarse con esa protección. No se utiliza TEMP para los respaldos duraderos.

### Ausencia de escritores y método consistente

La consulta inicial CIM fue denegada. Como comprobación alternativa válida se usa Get-Process y luego Process.GetProcesses en la propia herramienta: no aparecen Godot, TwoSides/Two-Sides ni dotnet antes de acceder a fuentes. Si la enumeración falla o detecta esos procesos, la herramienta se detiene sin copiarlas; nunca termina procesos.

Se validan rutas fijas y ausencia de reparse points bajo sus anclas aprobadas. Cada fuente, store.lease y ownership.json se mantiene con FileAccess.Read/FileShare.Read: rechaza escritores existentes y evita nuevos accesos de escritura/reemplazo durante el snapshot. No se toma ni rompe el byte-range lock de aplicación y no se fuerza ningún bloqueo SQLite. Los lectores SQLite usan mode=ReadOnly, pooling=false y cache privado.

Las tres fuentes inspeccionadas NO tenían WAL/SHM/journal y su encabezado indica formato rollback1/1. Se usa Microsoft.Data.Sqlite.SqliteConnection.BackupDatabase, no File.Copy de save.sqlite3. El snapshot de tablas y esquema antes del backup se compara con el respaldo bajo la misma protección de origen; no puede haber commits concurrentes aceptados entre esas lecturas.

Limitación deliberada: si una fuente real tiene sidecars, modo WAL o encabezado desconocido, esta herramienta la omite sin abrir recuperación/checkpoint ni borrar archivos; habrá que preparar otro procedimiento seguro. No se afirma que copiar el archivo principal sea suficiente en ese caso. Una prueba sintética con WAL activo confirma que el mecanismo BackupDatabase incluye transacciones confirmadas en WAL, pero no se usa esa prueba para autorizar cambios de SHM/journal en una fuente real.

### Respaldos y validación obtenidos

Se obtuvieron los tres respaldos consistentes:
- historical-progress: base A de game-progress.
- historical-infrastructure: base B de persistence.
- runtime-game: base C con la partida manual.

Los tres respaldos tienen147.456bytes y esquema base2. Cada uno posee su propio nombre con alias, UTC y UUID y su SHA-256 real en el manifiesto. Un backup SQLite puede cambiar bytes de cabecera respecto al origen; no se exige igualdad del hash físico entre ambos. Sí se comprueba igualdad lógica exacta, application_id, user_version y estructura.

En cada respaldo/copia: PRAGMA integrity_check=ok, foreign_key_check sin filas, todas las tablas y sus definiciones preservadas. Se comparan conteos y hashes SHA-256 de todas las filas, con tipos y duplicados conservados y orden canónico de hashes; no se publican nombres, IDs de jugador/partida ni contenido de filas. El esquema incluye las restricciones/índices definidos en sqlite_master. Esto cubre perfiles, partidas, decisiones, consecuencias, cinco biomas, historial, recibos y snapshots sin revelar sus valores.

### Ensayo aplicado solo a segundas copias

Por cada respaldo se crean, con nombres nuevos sin sobrescribir:
1. rehearsal: recibe la extensión opcional1, conserva base2 y agrega cuatro tablas.
2. failure: prueba una excepción antes del commit y conserva la base original sin datos/DDL parciales.
3. restored: prueba restauración del respaldo hacia otro archivo aislado, sin apuntar a fuente alguna.

El rol Backup solo abre ReadOnly y el migrador de ensayo lo rechaza como destino. Los roles Rehearsal/Failure son los únicos mutables por ese helper; se comprueba raíz de copia, rol, ausencia de enlaces y exclusión de los tres orígenes. Los archivos restored también son de lectura.

No se amplía GameplayEventSchema.MigrateSynthetic ni su tipo SyntheticDatabase. El helper obtiene por reflexión el SQL const exacto de esa versión de biblioteca y verifica SHA-256 contra GameplayEventSchema.Checksum, para no mantener una migración divergente. Aplica ese SQL solo al rol de segunda copia, en transacción inmediata con historial propio; verifica después mediante GameplayEventSchema.Verify. Si el campo o checksum cambia en otra versión, el ensayo requiere revisión; no extrapolar este acceso a producción.

Resultados de los tres ensayos:
- Esquema base2 y application_id conservados.
- Todas las tablas/filas anteriores idénticas por definición, cantidad y huella: no cambian identificadores, decisiones, consecuencias, biomas, partida activa ni resultados históricos.
- Extensión opcional v1 reconocida y sus tablas gameplay_sessions/events/intervals VACÍAS. Solo hay el registro legítimo de migración en gameplay_schema_migrations.
- Segunda aplicación no inserta ni cambia bytes.
- Fallo antes del commit revierte todo; hash físico idéntico en la copia failure y esquema base intacto.
- Copia restored idéntica lógicamente al respaldo. Ningún archivo original se reemplaza.
- GameSaveService y StatisticsService actuales pueden leer perfil, activa, historial paginado, decisiones y progreso; los tres ensayos informan current-local-services-compatible.
- GameplayEventService consulta eventos/sesiones vacíos y conserva duración/muertes desconocidas; StatisticsService sigue devolviendo No disponible para campos no capturados.

No se generan eventos ficticios ni sesiones/intervalos en las copias finales. Las pruebas de escritura de eventos de D.4A no se ejecutan sobre estos datos reales clonados.

### Pruebas y compilación

**9 pruebas nuevas sintéticas aprobadas,0 fallidas**, más tres ensayos completos sobre copias verificadas reales. Las9 comprueban backup lógico, rol de backup no migrable, conservación tras migrar, segunda aplicación, rollback, restauración aislada, rechazo de handle escritor, backup con transacción WAL confirmada y bytes fuente intactos.

Compilación de BackupRehearsal y biblioteca referenciada:0errores/0advertencias, .NET8 con ejecutor self-contained existente. Restore solo desde caché local de paquetes, sin fuentes de red ni cambios de paquetes de producción. Herramienta compilada bajo local-persistence/.work y pruebas en namespaces propios con datos sintéticos. Las pruebas limpian solo sus archivos conocidos bajo la raíz de trabajo verificada, nunca respaldos reales.

Comandos: dotnet restore/build del proyecto backup-rehearsal con fuente local; BackupRehearsal.exe --self-test; ejecución revisada --backup-and-rehearse. No se modifica código compartido: las364 comprobaciones anteriores y las63 advertencias Godot permanecen como evidencia HISTÓRICA, no se presentan como reejecutadas. No era necesario recompilar Godot sin cambios de producción. No se inicia Godot, Node, Atlas o AWS.

### Política de pérdida antes del commit

Un evento queda confirmado cuando su transacción SQLite terminó el commit duradero; un clic/solicitud en memoria no lo prueba. Fallo antes de commit revierte cambios y no puede reconstruirse como evento real al reiniciar. Si se pierde solo la respuesta después de commit, reintentar MISMO ID y payload estable retorna lo existente; otro contenido produce conflicto. Una solicitud de reinicio no equivale a una nueva escena animal confirmada.

Intervalos sin commit son desconocidos, no tiempo medido0; no restar saved_at ni asumir que la sesión siguió jugando hasta descubrir el cierre. Tras crash se conserva el último intervalo duradero y se marca interrupted con duración total desconocida, sin restaurar posición/recursos ni fabricar eventos.

Política recomendada para la futura integración: la telemetría nunca borra ni cambia decisiones/progreso para repararse. Si falla, conservar el error y la intención pendiente con su ID, y marcar cobertura incompleta; buffers acotados y reintentos en su cola, sin crear partidas temporales ni exigir HTTP. No detener ni revertir un commit de gameplay ya confirmado por intentar registrar una métrica independiente. Cuando se necesite atomicidad dominio+evento, diseñarla explícitamente en una fase autorizada antes de conectar ambos; no prometer recuperación de datos que nunca persistieron.

### Procedimiento de restauración y migración runtime futura

El ensayo demuestra restauración hacia archivos nuevos, NO concede permiso para restaurar originales. Ante necesidad futura:
1. Cerrar Godot por acción del usuario, verificar procesos/handles y mantener las fuentes sin escritores; no matar procesos ni manipular WAL/SHM.
2. Seleccionar el backup privado y verificar SHA-256 con manifest.json; repetir integrity_check, foreign_key_check y esquema/application_id.
3. Crear otro respaldo consistente del estado actual antes de cualquier reemplazo, sin sobrescribir respaldos existentes.
4. Obtener autorización que identifique exactamente la base destino y la operación; conservar ACL/propietario y comprobar ownership.json/identidad de archivo.
5. Preferir restauración SQLite hacia el archivo destino existente bajo capacidad validada: los manifiestos OwnedCopyDatabase incluyen FileIdentity. Un reemplazo por rename/copia de archivo nuevo puede romper esa identidad y no debe hacerse como simple receta File.Copy; cualquier ajuste de manifiesto necesita procedimiento y autorización propios.
6. Verificar datos/estructura/compatibilidad y metadatos antes de volver a abrir el juego. No introducir eventos ni tiempos retroactivos al restaurar.
7. Para migración real futura, preparar una API explícita que acepte SOLO el destino runtime autorizado con respaldo/recuperación verificados. Repetir esta validación y confirmar guardas in situ; aplicar extensión en transacción, releer invariantes y conservar respaldo intacto. No ampliar por inferencia la capacidad MigrateSynthetic.

Riesgos restantes: crecimiento y retención de respaldos privados, disponibilidad de almacenamiento, cambio de esquema/SQL entre compilaciones, modo WAL futuro que exige un plan distinto, datos no confirmados antes de crash y validación completa del proveedor runtime/identidad tras una futura escritura. No eliminar respaldos para liberar espacio sin autorización.

Integridad final:1.547 archivos protegidos sin cambios de tamaño/SHA-256/fecha; los9 archivos originales de bases/manifiestos/leases permanecen intactos. La propia herramienta verifica además hash/tamaño/mtime y huella de ACL/propietario de cada base antes/después bajo protección de lectura. .env278bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, sin leer valores ni copiar credenciales/cambiar permisos. Riesgo ACL de B00 pendiente.

Siguiente subfase recomendada: autorizar explícitamente una migración runtime controlada, usando estos respaldos y procedimiento, antes de integrar capturas de Godot. No se migra ninguna base real, no se conecta evento, gameplay, CompleteBiome/finales o B05. Trabajo detenido al terminar D.4A.1.

## B04.2B.2B.2D.4A.2 — Migración runtime controlada (2026-10-26 Guatemala)

**COMPLETADA. Validación manual Godot pendiente; eventos NO conectados.** Operación real:2026-10-27T05:40:22Z (2026-10-26 23:40:22 Guatemala). Único archivo de datos migrado: local-persistence/.work/runtime-game/save.sqlite3 de la copia Two-Sides PRUEBA. No se modificaron las dos bases AppData.

### Guardas y respaldo

Se verificó ausencia de Godot/TwoSides/dotnet/ejecutores de pruebas; no se cerró ni terminó ningún proceso. La ruta absoluta se compara con una constante autorizada y CopyGameDatabase.RuntimePath. Los handles WindowsGuard existentes se reutilizan por reflexión desde la herramienta aislada: rechazan reparse/hardlinks, validan ruta final y conservan directorios/archivo contra rename/delete. La identidad nativa se comparó con ownership.json (formato/copia/purpose/Ready/FileIdentity), sin mostrar datos personales.

Se adquirió exclusión en store.lease existente, sin cambiar sus bytes; ownership.json permaneció en lectura y el archivo runtime se mantuvo con deny-write hasta la fase final de migración. Sin WAL/SHM/journal; encabezado rollback válido. Se verificaron espacio libre para respaldo/recuperación, application_id runtime0x54535254, base2, integridad y FK; no había extensión previa.

Se verificó hash del manifiesto D4A1 y respaldo de referencia (7D791333A03326FF2A4E91DEA0E1BCF5F9F40A8C0D0DB6BA34365305C33A5E0D), origen correspondiente, esquema/integridad y compatibilidad. No se asumió que fuera el estado actual: el snapshot lógico actual se comparó independientemente.

Se creó nueva carpeta privada %LOCALAPPDATA%/TwoSides/PrivateBackups/D4A2/20261027T054022Z-3618aa339d9e475ea5275d38ced08d43, fuera de OneDrive/Git. Contiene before.json, after.json y respaldo runtime-immediate-20261027T054022Z-43f00cb0f53a4f7ea5b788304fbfed38.backup.sqlite3, más ensayos aislados. No se sobrescribió ningún respaldo anterior. ACL privada únicamente en la nueva carpeta; no se cambia seguridad de fuentes.

BackupDatabase capturó un snapshot consistente actual, validado contra todas las tablas/filas/restricciones/índices mediante conteos y huellas canónicas, sin publicar nombre/decisiones del usuario. SHA-256 del respaldo inmediato:
7D791333A03326FF2A4E91DEA0E1BCF5F9F40A8C0D0DB6BA34365305C33A5E0D.
Coincide con el anterior como resultado observado, no como precondición supuesta.

El ensayo final migró SOLO una segunda copia del respaldo nuevo; validó base2/extensión1, integridad/FK, conservación exacta de tablas/datos anteriores, consultas de GameSaveService/StatisticsService/GameplayEventService, segunda aplicación byte-idempotente, fallo simulado con rollback completo y restauración hacia otro archivo aislado. No eventos ficticios en copias finales.

### Migración y resultados

La herramienta usa el SQL const del migrador versionado existente, verifica su checksum y aplica la misma función de ensayo/transacción a un gate runtime nuevo, limitado a una apertura de escritura. No se modifica ni amplía GameplayEventSchema.MigrateSynthetic. Se permite esta ruta especial solo por la autorización expresa D4A2; no constituye migración automática del runtime al arrancar.

Justo antes de escribir se revalidaron hash/metadatos originales y procesos. Dentro de la transacción inmediata se comparó nuevamente el snapshot base, se aplicaron las cuatro tablas de extensión y se compararon todos los datos base ANTES del commit. Ante error la transacción se revierte; el helper registra stopped.json y nunca restaura automáticamente ni reintenta una escritura desconocida.

Resultado:
- Antes: base v2, sin extensión.
- Después: base v2, extensión opcional v1; mismas diez tablas originales y cuatro adicionales.
- integrity_check=ok y foreign_key_check vacío.
- Perfil, partida actual, historial, IDs, decisiones, consecuencias, cinco biomas, recibos y snapshots iguales al respaldo inmediato.
- Nuevas tablas de sesiones/eventos/intervalos vacías; solo registro real de migración.
- Consultas actuales y nuevas compatibles; métricas históricas no convertidas en0.
- Identidad nativa, propietario/ACL y manifiesto de ownership conservados; no sustitución del archivo.
- SHA-256 runtime anterior:8CC18BE48074E0F91A99E39801E2CA41276192EAD0553DBFE9AA5A48AE28971C.
- SHA-256 runtime posterior:83BD0E4D27ADE3E5CA778233E59456B6CB6CAF04A3608ED92BF07B8F6D790E07.
- SHA-256 after.json:EE2E37A18E3DE2C1FC9EE3B93A27E2B5F93935136C2A2CA1FF9403E9F867246F.

### Código, pruebas y seguridad

Único archivo de herramienta modificado: local-persistence/backup-rehearsal/Program.cs.txt; añade gate runtime fijo, validación del respaldo, identidad/lease, ensayos, manifiestos y modo --migrate-runtime-controlled. No cambia biblioteca/migrador/repositorios de producción ni adaptador runtime. Se actualizan solo estos cinco documentos de D4A2. El segundo adjunto del usuario mantiene las mismas condiciones del primero.

Compilación del helper y biblioteca referenciada:0errores/0advertencias tras corregir una nulabilidad detectada durante preparación; ningún acceso de escritura runtime ocurrió durante esa compilación fallida. **15 comprobaciones sintéticas aprobadas,0 fallidas**:9 de backup/ensayo previas reejecutadas y6 de path/identidad/ownership, verificación intra-transacción/rollback, conservación de identidad/ACL con DDL y respaldo nuevo independiente de referencia anterior. Además ensayo y verificaciones efectivas en la copia y runtime autorizada. No se presentan las364 pruebas previas como reejecutadas ni las63 advertencias históricas Godot como build nuevo: no cambió código de Godot.

Comandos: build --no-restore del helper; --runtime-migration-self-test; única ejecución revisada --migrate-runtime-controlled. No Godot/Node/Atlas ni gameplay ejecutados, no captura ni CompleteBiome/finales/B05.

Integridad final:1.547 archivos protegidos sin cambios de hash/tamaño/fecha; ocho archivos protegidos de almacenes (las dos bases AppData y manifiestos/leases de las tres) intactos. Runtime SQLite excluida expresamente de esa igualdad porque fue el único dato autorizado a cambiar; sus invariantes se verifican separadamente. .env278bytes,SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, sin leer valores ni cambiar permisos/propietario. Riesgo ACL de B00 pendiente.

### Recuperación y siguiente paso

No se necesita recuperación y no se efectuó ninguna. Si aparece un fallo después: detener juego/escritores por acción del usuario, preservar runtime/manifiestos/sidecars y diagnóstico; verificar hashes del respaldo y after.json, integridad/compatibilidad en otra copia. Cualquier restauración requiere autorización adicional que nombre destino y respaldo. No sustituir por rename/File.Copy: ownership.json referencia identidad de archivo; preferir procedimiento SQLite in-place validado que conserve identidad/seguridad. Crear antes otro respaldo del estado a reemplazar y ensayar restauración aislada. No reintentar esta migración sobre runtime ya extendido: el gate la rechaza.

Riesgos pendientes: prueba manual del videojuego tras migrar, pérdidas de eventos anteriores al commit, política de fallos/cobertura, origen de reloj y retención antes de captura. La pantalla sigue mostrando No disponible para datos no capturados; no hay eventos históricos reconstruibles.

Siguiente recomendación: validar manualmente continuidad/estadísticas actuales y luego autorizar por separado la conexión de eventos/intervalos al adaptador/observador único de Godot, usando IDs estables y diferenciando solicitudes de reinicios confirmados. D4A2 termina aquí: no conectar eventos, no gameplay, no CompleteBiome/finales ni B05.

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

## B04.2B.2B.2D.4C — Verificación real y actividad visible (2026-10-27 Guatemala)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME DE LA VISTA PENDIENTE.** El usuario informa D4B15/15 comprobaciones manuales satisfactorias y sin errores nuevos. No se asumen conteos exactos de esas acciones: esta fase audita lo efectivamente persistido.

### Etapa A superada antes de editar producción

Se verificó Godot/ejecutores cerrados. Herramienta temporal bajo local-persistence/.work/event-audit (ignorada por Git) compilada con biblioteca existente y caché local; no se incorpora otro sistema de producción. Ruta única runtime fija; sin reparse points bajo raíz, sin WAL/SHM/journal. FileAccess.Read/FileShare.Read sobre base y lease impide aceptar escritores durante la lectura. SQLite mode=ReadOnly, pooling=false y query_only=ON. No se usa OpenRuntimeOrCreate, ni inicialización/migración/recovery/checkpoint. Si aparecen procesos o sidecars, se detiene la inspección.

GameplayEventSchema.Verify, GameSaveService, StatisticsService y GameplayEventService se usan como APIs reales; SQL parametrizado/constante de solo lectura complementa comprobaciones de intervalos y coherencia no expuestas en API pública. integrity_check=ok, foreign_key_check sin filas, base2+extensión1. No se imprimen perfil, nombre, decisiones personales ni IDs de jugador/sesión.

Resultados reales anonimizados, antes y después de integrar consultas:
- Sesiones:3 registradas,3 cerradas,0 interrupted,0 abiertas.
- SESSION_STARTED3 y SESSION_ENDED3.
- ANIMAL_SEGMENT_STARTED7, ANIMAL_DIED3, ANIMAL_RESTART_REQUESTED1, ANIMAL_RETRY_REQUESTED1, ANIMAL_SEGMENT_EXITED7.
-81 intervalos confirmados.
- Tiempo efectivo total confirmado:37.614ms (37.614 segundos).
- Partida actual por bioma: ocean9.946ms, jungle18.348ms, desert9.320ms; forest/tundra sin intervalos registrados (null, no0).
- Tiempo registrado no efectivo por clasificación: Background43.549ms, GameOver5.669ms, Loading3.848ms, Menu48.191ms, Paused7.396ms.
- Incomplete=false para esas sesiones cerradas y cobertura registrada; HistoricalCoverageUnknown=true.

Las cifras de milisegundos usan punto como separador de miles en esta lista salvo el equivalente en segundos expresado explícitamente. La UI formatea segundos con tres decimales y punto decimal invariante, por ejemplo37614ms→37.614 s confirmados.

Cero duplicados de EventId o clave idempotente, solapamientos entre intervalos de una sesión, tiempos negativos, asociaciones animales inválidas, más de una sesión abierta, solapamientos de sesiones cerradas según UTC, tiempo activo posterior a muerte/salida/request, retry sin muerte previa o intervalos fuera del límite de sesión. La comparación temporal UTC es comprobación orientativa, no reloj usado para acumular duración.

Los eventos SESSION_* por contrato no pertenecen a una partida; no se consideran referencias faltantes. Todos los eventos animales tienen GameId/BiomeId válidos y canónicos y vínculos de sesión/run válidos. No hay eventos de finalización falsa. No hay obligación de que forest/tundra tengan tiempo si no se dispone de un registro de acciones del usuario que lo exija: se informa ausencia, no se fabrica cobertura.

Comparación adicional de dominio contra el respaldo inmediato D4A2, cuyo hash se verifica: perfiles, partidas, biomas, decisiones, consecuencias, snapshots y local_operations idénticos por filas/huellas canónicas. Así se comprueba que la captura no alteró datos anteriores, sin publicar los valores. Lecturas repetidas conservan hash/tamaño/mtime de runtime.

La auditoría confirma coherencia estructural y persistencia, no demuestra por sí sola cada segundo de pausa del motor. Esa exclusión se apoya en tests del observador y prueba manual. No se comparan conteos contra cantidades de acciones nunca aportadas. La etapa B solo comenzó tras AuditPassed=true.

### Cambios de etapa B

Producción: local-persistence/src/StatisticsModels.cs.txt, StatisticsRepository.cs.txt, StatisticsService.cs.txt e integration/sqlite/LocalStatisticsScreenState.cs (formateador existente). Pruebas: nuevo ActivityStatisticsChecks.cs.txt y dispatcher GameSaveChecks.cs.txt. Documentación: siete documentos autorizados. Total13 archivos. La herramienta temporal solo vive en .work y es de lectura.

No se cambian adaptador, controlador visual de nodos/scroll, observador, servicios de escritura, esquema/migración, gameplay, pausa/Game Over, FinNivel, finales, proyectos ni escenas. La sección nueva se agrega al texto plano existente; no se duplican nodos ni se crea otra pantalla.

StatisticsRepository.Activity reutiliza GameplayEventRepository dentro de la MISMA transacción UnitOfWork.Read que el resto del resumen, con carga cacheada por consulta. Comprueba presencia/versión de extensión y no la crea si no existe. Se reutilizan Sessions/Events/Intervals y los filtros de dueño existentes; no se encadenan varias APIs que abrirían snapshots diferentes. Las colecciones completas evitan truncamiento.

Contratos añadidos como propiedades opcionales para compatibilidad:
- PlayerStatistics.Activity: cobertura local de todas las sesiones registradas.
- PlayerStatistics.HistoricalActivity: solo registros vinculados a partidas no actuales.
- GameStatistics.Activity: solo eventos/intervalos de ese GameId.
- ActivityStatistics: Sessions, Deaths, RestartRequests, RetryRequests, EffectiveMs, ByBiome, Incomplete e HistoricalCoverageUnknown.
- BiomeActivityStatistics: BiomeId y EffectiveMs tipado StatisticCount.

No se cambia Uncollected del contrato previo para reinterpretar datos históricos; la vista elige Activity cuando hay sesiones registradas y conserva el estado anterior si no hay captura. Los tres alcances aparecen con títulos distintos. Una sesión puede participar en varias partidas: sus conteos por game/historia no son aditivos; el total local cuenta cada SessionId una vez, y los intervalos efectivos no se suman dos veces.

Disponibilidad:
- Sin extensión: NotAvailable/null, no se migra.
- Extensión sin captura o bioma sin intervalos: NoData/null («Sin datos»), más aviso de actividad histórica desconocida.
- Run con cobertura y ningún evento de un tipo: Available0 representa cero SOLO en cobertura registrada, no cero histórico de toda la vida.
- Intervalo confirmado0..0: tiempo Available0.
- Sesión abierta/interrupted o intervalos faltantes: muestra únicamente suma duradera y aviso Incomplete; no se extrapola hasta la consulta ni se cierra/repara la sesión.
- HistoricalCoverageUnknown siempre verdadero: la actividad anterior al inicio de instrumentación no puede reconstruirse.

Tiempo efectivo suma solo ActiveAnimal/ActiveHuman ya confirmados; las pausas, menús, carga, fondo y Game Over no se añaden. El observador actual solo emite ActiveAnimal, no se inventan intervalos humanos. Fechas de partida/attempt_number no se usan como contadores o duraciones.

La UI mantiene perfil, decisiones, progreso, consecuencias, partida actual, historial y scroll. Añade «ACTIVIDAD LOCAL CONFIRMADA», actividad de cada partida y resumen histórico, sesiones, segundos efectivos, cinco subtotales, muertes y solicitudes confirmadas de reinicio/reintento. Las etiquetas dicen solicitudes: no se presentan como transiciones exitosas. Se conserva la advertencia de cobertura anterior desconocida y otra de incompleta cuando corresponda.

Abrir/reabrir Estadísticas conserva el flujo de una consulta asíncrona por apertura/retry, texto plano sin BBCode/IDs sensibles y retorno al menú. No registra sesiones/eventos ni fuerza flush por consultar. El observador independiente ya existente puede confirmar su heartbeat real de estado Menu mientras el usuario está allí; ese tiempo no es efectivo y no es una escritura provocada por la consulta.

### Pruebas y compilación

**418 comprobaciones C# aprobadas, cero fallidas:**23 nuevas actividad +31 observador +41 eventos +24 pantalla +39 consultas +19 Game Over/navegación +21 reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las395 anteriores se reejecutan.

Las23 nuevas cubren historia sin extensión/captura, sesión cerrada/abierta/interrupted, varias sesiones, muerte distinta de retry y request, evento repetido idempotente, exclusión de pausa/menú/fondo/derrota/carga, cinco subtotales y suma total, cero medido vs ausencia, sesión sin actividad animal, scopes activo/histórico, readonly/bytes/fechas/decisiones/ambiente intactos, etiquetas/formato, esquema incompatible controlado y rechazo de solapamiento. Los tests anteriores de pantalla cubren apertura, retorno, doble clic, ausencia de nodos duplicados por binding/diseño y error local. No se afirma ejecución de escenas ni señales reales.

Fixtures independientes bajo local-persistence/.work/databases/<UUID>; ninguna prueba usa la runtime como fixture. La auditoría de lectura real es una etapa distinta de la suite sintética. Se recompiló el helper de auditoría con las consultas nuevas y se verificó que coinciden con GameplayEventService en sesiones, muertes, requests y tiempo total reales. No se usa la lectura para escribir registros.

Comandos: build --no-restore de GameSave.Checks.csproj; --activity-statistics y doce modos seguros anteriores; local-persistence/run-checks.ps1. Biblioteca/ejecutores0errores/0advertencias. Rebuild completo TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild con GodotProjectDir hacia integration/sqlite/.work/:0errores,63 advertencias históricas ParallaxBackground,ninguna nueva. Sin Godot, Node.js, Atlas, nuevas dependencias o modificaciones a proyectos de producción. Herramienta temporal restaurada solo desde caché local.

### Integridad, limitaciones y validación

Antes de editar producción se registró inventario de1.558 archivos (todo excepto .env); tras fijar los archivos autorizados de etapa B se conserva manifiesto de1.546 archivos protegidos idénticos antes/después. Los9 archivos de las tres bases/manifiestos/leases permanecen idénticos en hash/tamaño/fecha; la runtime NO fue alterada por Codex. Los respaldos solo se leyeron, sin sobrescribirlos. .env278bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, sin valores ni cambios de permisos/propietario. Riesgo ACL de B00 pendiente.

Limitaciones: cobertura histórica desconocida, solicitudes distintas de éxito de navegación y errores de captura que pueden dejar lagunas; sesiones abiertas al consultar mientras se juega se marcan incompletas hasta cierre. Volumen grande materializa colecciones y texto, optimización futura posible. La auditoría actual no atribuye una ausencia de intervalos a fallos sin una secuencia esperada conocida. No se corrigen registros reales, no se rellena tiempo ni se modifica captura.

Guía manual: abrir juego sin internet/Node; Estadísticas debe conservar secciones previas y scroll y mostrar nueva actividad local. Comprobar valores confirmados y advertencias; al ejecutar una sesión nueva pueden cambiar respecto al snapshot auditado, por lo que no exigir las mismas cifras exactas. Jugar/pausar/morir/reintentar/reiniciar, volver a Estadísticas y comprobar aumento razonable de tiempo activo y eventos distintos. Tiempo de menús/pausa no debe sumarse como activo; puede tardar hasta heartbeat/cambio de estado en aparecer lo confirmado. Cerrar normalmente y reabrir debe conservar registros sin duplicarlos. No cambiar decisiones ni borrar bases para probar. Anotar acciones/duraciones aproximadas para investigar discrepancias; aportar consola sin secretos si falla.

Siguiente paso recomendado: validación manual de la vista/alcances y captura real con secuencia registrada. Cualquier corrección de observador/escritura requiere autorización distinta; no se cambia aquí. No CompleteBiome, finales, Atlas/AWS ni B05. Trabajo detenido al terminar D4C.


## B04.2B.2B.2E.2B.2 — Finales locales autorizados (2026-10-27)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** El usuario autorizó regla nueva definitiva, no recuperada del evaluador original:0/1/2 reject→bad;3/4→medium;5→good, exclusivamente cinco decisiones canónicas de cinco completed de la misma partida. Versión narrativa separada local-ending-reject-count-1; se conservan versiones de partida/decisiones.

Informe completo, inventario exacto y guía manual en GLOBAL_PLAYTHROUGH_CLOSURE_PLAN.md (apartado E.2B.2). Un evaluador puro centraliza la regla; GameSaveService.PrepareFinal/CloseGame usan transacción/recibos existentes y esquema2 sin migrar. final_pending persiste resultado antes de navegar; cierre solo por acción explícita de salida, completed/is_current0 e historia intacta. Continuar recupera cinco completed sin resultado o final_pending después de reinicio, sin repetir decisiones/metas. Nueva partida es explícita y solo posterior al cierre, con perfil igual, GameId nuevo y cinco biomas limpios/disponibles.

Final.cs consume SQLite y sale localmente: escena/textos/tween/nodos/recursos intactos, sin HTTP/login. AnimalSegmentFlow coordina quinto; menú recupera finales. FinNivel/CompleteBiome y mecánicas intactos. StatisticsService únicamente reconoce la versión final nueva para metadatos, ajuste informado previamente; no se alteran agregados o eventos. CompletedAt indica preparación del resultado; recibo close_game/ArchivedAt indican cierre. No existe ni se afirma marcador durable de “final leído”.

598 comprobaciones aprobadas:126 nuevas y472 regresiones reejecutadas,0 fallidas finales. Biblioteca/ejecutores0 errores/0 advertencias; Godot C# Rebuild0 errores,63 advertencias históricas ParallaxBackground,0 nuevas. Sin ejecución de Godot; visual/navegación/pausa real requieren manuales. Las10/10 manuales anteriores son E.2A, no esta fase.

Tres bases protegidas y9 archivos asociados idénticos en hash/tamaño/fecha;1.542 archivos fuera de alcance idénticos. .env278 bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, sin valores ni cambios ACL/propietario; riesgo B00 pendiente. Solo fixtures nuevas para escrituras. Sin migraciones, Node/Atlas/AWS/B05. Probar manualmente good/medium/bad en partidas sucesivas sin editar decisiones ni borrar historia; incluir reinicio antes de salir del final, cierre y nueva partida. Trabajo detenido.
