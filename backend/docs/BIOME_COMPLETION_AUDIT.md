# Auditoría de finalización física de biomas
Fase B04.2B.2B.2E.1 · 2026-10-27 · Solo inspección y documentación.

## Evidencias y alcance
Se inspeccionaron scripts/FinNivel.cs, scripts/AnimalSegmentFlow.cs, scripts/Final.cs, scripts/globals/VariablesGlobales.cs, scripts/MenuNiveles.cs, scripts/TarjetaNivel.cs; las cinco escenas animales y sus personajes; scenes/levels/Final.tscn; integración SQLite (GamePersistenceAdapter, LocalGameState, LocalGameplayObserver y consultas/selección local); servicios remotos AnimalProgressService, EndingService y GameStateStore; GameSaveService, UnitOfWork, SQLiteRepository, GameplayEventService y StatisticsService; backend/src y docs/Final_Global_Godot.md.

También se contrastaron REAL_GAME_SAVE_CONTRACT, BIOME_PERSISTENCE_MAPPING, GODOT_RUNTIME_INTEGRATION_PLAN, GODOT_SCENE_EVENT_MAPPING, GODOT_RUNTIME_TEST_PLAN, SAVE_INTEGRATION_CHANGE_PLAN, LOCAL_STATISTICS_IMPLEMENTATION_PLAN, GAMEPLAY_EVENT_AUDIT, GLOBAL_STATISTICS_DESIGN, PHASES, PHASE_HISTORY, DECISIONS y local-persistence/README.md. Son antecedentes de diseño e implementación, no prueba de que la meta física ya esté integrada. La validación D4C (418 pruebas históricas y 15/15 manuales) es el antecedente confirmado por el usuario; no se ejecutaron pruebas en E.1.

## Flujo real de FinNivel
El detector es un Area2D con CollisionShape2D. _Ready suscribe BodyEntered y luego espera ValidateLocalEntryAsync. OnBodyEntered acepta Node2D que pertenezca a GrupoJugador (por defecto jugador), reserva _nivelFinalizado y difiere FinalizarNivel. No comprueba un tipo concreto de personaje ni una identidad de actor. BodyEntered proviene de cuerpos físicos; los nodos raíz Node2D también agrupados no son por sí mismos cuerpos capaces de activarlo.

FinalizarNivel traduce NivelActual mediante BiomeCardController.BiomeFor y compara con AnimalSegmentFlow.BiomeForScene. Si hay discrepancia retorna conservando la reserva. La validación local de entrada comprueba perfil, partida activa, etapa animal_pending y decisión/ambiente preparados; no sustituye una validación transaccional al llegar. La señal está suscrita antes de terminar esa validación: una implementación futura debe cerrar esa ventana.

Con contexto local, Open(completion:true) muestra LOCAL_OPERATION_UNSUPPORTED y pausa; no invoca SQLite ni CompleteBiome. El modal conserva progreso, no ofrece reintento de esa operación y permite volver al menú principal local (assets/sprites/ui/menu_principal.tscn). No abre automáticamente menú de niveles ni final al tocar la meta. La navegación de recuperación local invalida el gate/contexto de entrada, intenta cambiar escena y libera pausa al confirmar el cambio; si falla conserva el modal y el error. No hay recuperación de un recibo de finalización porque todavía no se emite.

Sin contexto local persiste una rama antigua remota: AnimalProgressService requiere sesión y POST /api/v1/me/games/{gameId}/animal-completions, después recuperación GET. Su destino es Final.tscn si EndingService confirma un final; en otro caso recuperación remota. Esta rama no es una alternativa válida para la futura integración offline. GameApplicationContext no inicializa esos servicios en el arranque local actual.

FinNivel no escribe VariablesGlobales, decisiones, ambientes ni estado de progreso. El observador de actividad detecta el modal bloqueante, pero no registra ANIMAL_SEGMENT_COMPLETED. Un fallo SQLite puede bloquear la validación de entrada; en la llegada actual no hay escritura SQLite que pueda fallar.

## Comparación de las cinco metas
Todos los nodos siguientes son FinNivel/CollisionShape2D y usan res://scripts/FinNivel.cs. La señal se conecta en C#, no mediante conexión serializada. Todos llaman OnBodyEntered → FinalizarNivel → AnimalSegmentFlow.Open. Los destinos exportados son menu_niveles.tscn y Final.tscn, pero el flujo local actual no los utiliza.

| Bioma canónico / enum | Escena en scenes/levels | Actor animal | Posición local FinNivel | Rectángulo / desplazamiento hijo |
|---|---|---|---|---|
| ocean / 0 | bioma_mar.tscn | player_delfin | (-1815,-64) | (107,38) / (8950,679) |
| jungle / 1 | bioma_selva.tscn | player_mono | (6946,-33) | (103,69) / (-1.5,0.5) |
| desert / 2 | bioma_desierto.tscn | player_rata_canguro | (7107,352) | (103,69) / (-1.5,0.5) |
| forest / 3 | bioma_bosque.tscn | player_zorro | (7165,5) | (103,69) / (-1.5,0.5) |
| tundra / 4 | bioma_nieve.tscn | player_oso | (6772,161) | (103,69) / (-1.5,0.5) |

Océano no serializa NivelActual: depende del valor enum inicial 0. Los demás serializan 1–4. No hay propiedades particulares de máscara/monitorización en estas metas que acrediten por sí solas exclusividad del actor. Los grupos del personaje se asignan en sus escenas y/o _Ready. Las coordenadas son locales, no una certificación de accesibilidad física ni una prueba visual de colisiones.

Para cada fila, antes de llegar se exige animal_pending con decisión y ambiente confirmados. Actualmente después sigue animal_pending y aparece el modal no implementado. El resultado futuro esperado es completed persistido, misma decisión/ambiente y bloqueo de la tarjeta; si quedan pendientes, retorno a selección. El quinto necesita el tratamiento separado de FINAL_FLOW_AUDIT.md.

## Contrato SQLite real
En local-persistence/src/GameSaveService.cs.txt:
`public SaveReceipt CompleteBiome(CompleteBiomeCommand command)`
`CompleteBiomeCommand(string OperationId, string LocalPlayerId, string GameId, long ExpectedRevision, string BiomeId, string ConfirmedResult)`.

OperationId es UUID v4 estable; LocalPlayerId es el propietario local, no usuario HTTP. GameId identifica su partida; ExpectedRevision debe corresponder a su revisión actual. BiomeId pertenece al catálogo canónico y ConfirmedResult es good/bad del bioma, no el final global. Se deriva del ambiente ya confirmado: saludable → good; degradado → bad. No es una nueva decisión.

UnitOfWork abre transacción SQLite inmediata, comprueba esquema base v2 y busca primero el recibo. Mismo OperationId, propietario, clase complete_biome y digest devuelven el recibo anterior sin reejecutar ni volver a exigir la revisión vieja. Reutilizar el ID con otro payload produce OPERATION_CONFLICT. Una operación nueva exige partida propia, actual, in_progress, revisión exacta, bioma no completado y etapa animal_pending; carga y valida decisión/ambiente y su correspondencia con ConfirmedResult.

Escribe biome_progress.completed, result, animal_completed_at y updated_at; conserva intento y finalización humana. Incrementa una vez la revisión de partida, fija continuación menu sin bioma/checkpoint y actualiza snapshot y recibo en la misma transacción. No modifica decisiones, consecuencias, otros biomas ni crea/archiva partidas. SQLiteRepository.PutBiome impide reescribir un completed. Un ID nuevo contra ese bioma recibe BIOME_COMPLETED; no equivale al reintento del recibo original.

Errores de contrato/estado incluyen INVALID_DATA, UNKNOWN_BIOME, NOT_FOUND, INVALID_STAGE, BIOME_COMPLETED, REVISION_CONFLICT y OPERATION_CONFLICT; las validaciones de formato/contenido/snapshot y los fallos de almacenamiento deben conservar su diagnóstico mediante el adaptador, sin convertirse en login ni éxito. No se ejecutaron estos casos en esta auditoría.

GamePersistenceAdapter.CompleteBiomeAsync ya existe y devuelve LocalSaveResult<SaveReceipt>. La extensión opcional v1 de eventos es compatible con base v2, pero CompleteBiome no emite eventos estadísticos automáticamente. Las consultas de progreso y las tarjetas ya reconocen completed y bloquean su reentrada. StatisticsService puede contar el progreso confirmado sin cambiarse.

## Discrepancias y riesgos
Los contratos de diseño describen una integración futura; FinNivel todavía usa el modal no implementado. Los destinos exportados no describen su navegación local efectiva. La documentación del final describe confirmación HTTP, no evaluación SQLite. Ninguna de estas referencias demuestra que el quinto bioma cierre una partida local.

La reserva en memoria no es idempotencia durable y puede quedar retenida tras un error. Deben comprobarse actor, escena, propietario y partida al confirmar, evitar callbacks tardíos y preservar el comando ante respuesta incierta. No se deben registrar éxitos por cambiar de escena. Un commit de progreso y un evento en otra transacción dejan una ventana de fallo; el plan distingue esta limitación de una garantía atómica.

CompleteBiome permite cinco completed manteniendo in_progress; no prepara ending/final_pending. El bloqueo de todas las tarjetas puede dejar sin continuación útil. No se debe conectar ese estado directamente a Final.cs remoto ni inventar umbrales.

## Integridad
Auditoría sin ejecución del juego, backend, CompleteBiome o tests. Las tres bases protegidas y sus archivos asociados se verifican por hash/tamaño/fecha, sin SQL. .env conserva la referencia histórica de 278 bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928; sin lectura de valores. El riesgo ACL de B00 permanece pendiente; no se modifican permisos.



## B04.2B.2B.2E.2A — Actualización de implementación (2026-10-27)

COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE. Véase el informe completo E.2A en [COMPLETE_BIOME_INTEGRATION_PLAN.md](COMPLETE_BIOME_INTEGRATION_PLAN.md) y PHASE_HISTORY.md para archivos, comandos, pruebas y guía manual.

FinNivel valida la instancia/tipo/vida del animal y el gate de entrada; LocalGameState prepara un comando CompleteBiome estable y relee SQLite después del recibo. El adaptador conserva el servicio/transacción existentes. AnimalSegmentFlow usa el modal local y navega a selección solo tras confirmación, sin HTTP. Tarjetas completed bloqueadas por el código existente; decisiones y ambiente conservados. Doble señal/clic y reintentos no generan otra finalización. Un fallo de navegación conserva recibo y permite reintentar; pausa se libera al confirmar el cambio.

El quinto guarda su bioma y ofrece, mediante modal/label existentes, una selección recuperable que informa FINAL GLOBAL PENDIENTE. La partida sigue in_progress y Nueva partida bloqueada. No se toca Final.cs/escena, no se evalúan umbrales, no se cierra, archiva ni crea sucesora. La finalización individual está conectada para ocean/jungle/desert/forest/tundra; el flujo global no está resuelto.

Telemetría secundaria: Loading excluye espera SQLite del tiempo efectivo; CompletionConfirmed usa OperationId confirmado como EventId y el FIFO existente, con intervalos ordenados antes del terminal. Fallar estadísticas no revierte ni bloquea progreso. Posible evento faltante tras crash: reconciliación futura basada en recibo/completed/ID y run verificables, sin inventar tiempos ni reescribir dominio; no se implementa ahora ni se añade cola/migración/atomicidad ficticia.

472 comprobaciones aprobadas:54 nuevas y418 regresiones reejecutadas,0 fallidas. Biblioteca/ejecutores0 errores/0 advertencias; Godot C# Rebuild0 errores,63 advertencias históricas ParallaxBackground,0 nuevas. Sin ejecución de Godot; física/UI/SceneTree real pendientes de validación manual. Fixtures únicamente local-persistence/.work/databases/<UUID>.

Tres bases protegidas y archivos asociados (9) idénticos en hash/tamaño/fecha;1.545 archivos fuera del alcance idénticos. .env278 bytes, SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928; sin valores ni cambios ACL/propietario. Riesgo B00 pendiente. Sin Node/Atlas/AWS/B05. Trabajo detenido.