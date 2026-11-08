# Plan de integración local de CompleteBiome
Fase B04.2B.2B.2E.1 · 2026-10-27 · Propuesta; no autoriza implementación.

## Archivos exactos y límites
Cambios propuestos para una futura E.2:
- scripts/FinNivel.cs: validar actor y estado de llegada; reserva/reintento y llamada al coordinador local.
- scripts/AnimalSegmentFlow.cs: sustituir exclusivamente la rama local completion no implementada por confirmación y navegación controladas, preservando reinicio/Game Over.
- integration/sqlite/LocalGameState.cs: conservar intención/recibo, refrescar partida y preparar el contexto de selección tras commit.
- integration/sqlite/LocalGameplayObserver.cs: cierre del intervalo y notificación idempotente de finalización confirmada.
- integration/sqlite/LocalBiomeCompletion.cs (nuevo, propuesto): coordinación independiente de HTTP y máquina de estados comprobable.
- local-persistence/game-save-tests/LocalBiomeCompletionChecks.cs.txt (nuevo, propuesto): pruebas del coordinador y fallos sintéticos. GameSave.Checks.csproj ya incluye *.cs.txt; deberá autorizarse su ampliación para enlazar el nuevo coordinador integration/sqlite/LocalBiomeCompletion.cs y el punto de entrada del ejecutor que invoque las pruebas. No se modifica ningún proyecto en E.1.

Reutilizar sin modificar GamePersistenceAdapter.CompleteBiomeAsync y las consultas actuales; solo ampliar el adaptador si una carencia concreta aparece y se autoriza. No se necesita cambiar CompleteBiome, StatisticsService, tarjetas, personajes, escenas, project.godot ni TwoSides.csproj para la primera coordinación. Un cierre global o cambio de Final.cs/Final.tscn necesita alcance separado.

## Contrato y secuencia
1. Al contacto, admitir exclusivamente el cuerpo del personaje animal esperado y vigente en la escena canónica; no basta otro cuerpo del grupo jugador. No modificar los personajes para lograrlo.
2. Reservar una sola intención por propietario/partida/bioma/entrada animal. Capturar identidad de escena, generación local y punto de tiempo de llegada; impedir nuevos contactos concurrentes y acciones de salida que compitan.
3. Leer y validar perfil/partida activa propia, in_progress, revisión, animal_pending y decisión/ambiente confirmados. No aceptar datos de VariablesGlobales como fuente única. Derivar good/bad del ambiente guardado, sin RecordDecision.
4. Crear una vez CompleteBiomeCommand con UUID v4, propietario, partida, revisión exacta, bioma y resultado. Conservar el DTO íntegro durante reintentos. Nunca cambiar revisión o resultado bajo el mismo OperationId.
5. Invocar GamePersistenceAdapter.CompleteBiomeAsync. Solo un recibo confirmado acredita completed. Una respuesta incierta exige resolver con el mismo comando/recibo, no fabricar otro.
6. Tras commit, releer la misma partida y verificar completed, decisión/ambiente intactos y revisión coherente con el recibo. Actualizar LocalGameState. Un resultado tardío de otra escena/perfil no puede aplicarse a la UI actual.
7. Finalizar el intervalo efectivo en el instante de llegada capturado, después de confirmar el progreso; excluir espera SQLite, modal y navegación. La medición puede suspenderse provisionalmente durante confirmación, pero no registrar éxito antes del commit. Si falla, recuperar el estado temporal sin sumar artificialmente el tiempo de espera.
8. Encolar el intervalo pendiente antes de ANIMAL_SEGMENT_COMPLETED, asociado al mismo owner/game/biome/session/run. Usar un UUID de evento estable (puede fijarse al OperationId de dominio si se valida ese contrato); conservar ID y payload también al reintentar.
9. Navegar solo con progreso confirmado. Con pendientes: selección local de los cinco biomas, tarjeta completed bloqueada y resto conforme a progreso. Liberar pausa de forma explícita y cerrar el modal al confirmar el cambio. No llamar HTTP, RecordDecision, RestartAnimal ni crear partida.
10. Con cinco completados: aplicar únicamente una política de transición aprobada por separado; véase FINAL_FLOW_AUDIT.md. No abrir el Final remoto ni inventar final por defecto.

## Fallos e idempotencia
| Caso | Respuesta exigida |
|---|---|
| Actor/escena/contexto inválidos | No escribir ni emitir éxito; error local si corresponde. |
| SQLite falla antes del commit | No declarar completed; conservar intención para retry, sin login ni partida temporal. |
| Commit incierto o doble señal | Mismo comando e ID; recibo idempotente, no dos revisiones. |
| REVISION_CONFLICT | Recuperar estado; distinguir operación ya confirmada de conflicto real. No mutar el comando bajo su ID. |
| Otro ID para bioma completed | BIOME_COMPLETED; releer y mostrar progreso, sin nueva finalización. |
| Commit confirmado, refresco falla | Conservar recibo y ofrecer recuperación local; no volver al animal como si estuviera pendiente. |
| Evento/intervalo falla | Progreso sigue confirmado; informar estado estadístico incompleto y reintentar con IDs estables. No deshacer progreso. |
| Navegación falla | Mantener recibo y contexto, UI local recuperable; retry de navegación sin reejecutar dominio. |
| Reinicio del proceso | SQLite es autoridad; consulta progreso/recibo antes de cualquier reintento. No reproducir decisión. |

La reserva física se libera solo según estado explícito (validando, pendiente, confirmado, navegando, recuperable), no con un bool que permita generar otra operación en cada contacto.

## Garantía de estadísticas y límite de atomicidad
GameplayEventService ya reconoce ANIMAL_SEGMENT_COMPLETED y exige bioma completado y run válido. No existe hoy una llamada pública del observador que la conecte a la meta. El orden de cola debe respetar offsets confirmados y el cierre terminal: no persistir intervalos posteriores al fin del run ni confundir salida/navegación con muerte.

Guardar dominio y luego evento en transacciones distintas puede perder el evento si el proceso termina entre ambas. IDs estables evitan duplicados, pero no eliminan esa ventana. No prometer atomicidad o recuperación tras crash con una intención solo en memoria, ni inventar un run histórico para rellenarla.

Si se exige garantía durable conjunta, evaluar en una subfase autorizada el hook BeforeCommit existente de UnitOfWork, escribiendo evento y progreso con la MISMA conexión/transacción y validaciones compartidas. No llamar RecordEvent desde el hook: abre otra transacción. Esa alternativa requiere diseñar un contrato transaccional explícito y autorizar cambios adicionales en local-persistence/src/UnitOfWork.cs.txt y local-persistence/src/GameplayEventService.cs.txt y sus pruebas, o un outbox durable con migración separada. No se aprueba ninguna de esas modificaciones en E.1. Decidir la garantía antes de afirmar ausencia de pérdidas estadísticas.

## Pruebas propuestas (sin ejecución en E.1)
Solo bases sintéticas nuevas, directorio independiente y perfil ficticio; nunca abrir las tres bases protegidas para escribir. Compilar después de autorización sin backend/.env ni configuración real y sin ejecutar Godot automáticamente.

- Cada uno de los cinco IDs, orden libre y ambientes saludable/degradado: solo animal_pending puede completarse; decisión y consecuencia se conservan.
- Rechazar actor ajeno, escena equivocada, otro propietario, partida vieja, etapa humana y llegada antes de validación.
- Doble señal/clic concurrente, mismo comando repetido y respuesta perdida: un recibo, una revisión y una finalización; payload distinto con mismo ID rechazado.
- ID nuevo contra completed rechazado; tarjeta bloqueada; otros pendientes disponibles; Nueva partida sigue bloqueada.
- Fallos antes/durante commit, conflicto, refresco y navegación: no falsos éxitos, pausa y modal recuperables, misma partida tras reinicio.
- Eventos: intervalo termina al llegar, no suma pausa/SQL/navegación; una finalización por run/intención, reintentos sin duplicados, no muerte/reinicio/decisión extra.
- Fallo/crash entre commit y evento: exhibir la laguna si no se aprobó solución durable; no ocultarla con una prueba de éxito normal.
- Quinto: dominio puede confirmar cinco; no crear sucesora, cerrar globalmente ni mostrar un final inventado. Probar por separado la política aprobada.
- Offline y ausencia de HTTP obligatorio; ningún cambio de decisiones, recursos, checkpoints, finales o mecánicas.

Aceptación: persistencia manda sobre UI, no duplicados, recibo recuperable tras fallo de navegación, ambiente inmutable, pausa liberada tras navegación confirmada y limitaciones estadísticas explícitas. La presentación y cierre global requieren criterios propios y no pueden declararse resueltos por CompleteBiome.

## Recomendación para E.2
Autorizar primero coordinador local y pruebas sintéticas de CompleteBiome; definir antes de su conexión física la garantía de eventos y el tratamiento del quinto. La conexión de metas con pendientes puede ser una entrega limitada, pero no debe presentarse como solución completa de los cinco si el quinto deja una partida sin salida. Solicitar evidencia del evaluador original o una decisión de diseño explícita para el final local; mantener intactos sus textos y animación. No implementar cierres, sucesoras ni B05 por extensión de alcance.



## B04.2B.2B.2E.2A — Finalización local (2026-10-27)

Estado: **COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE**. Quinta finalización individual implementada; **PENDIENTE DE FINAL GLOBAL**. Esta actualización sustituye las descripciones E.1 de “operación local no implementada” exclusivamente para completion. No implementa evaluación, presentación ni cierre global.

### Archivos y contrato
Producción modificada:
- scripts/FinNivel.cs: señal BodyEntered, comprobación de instancia y tipo PlayerDelfin/PlayerMono/PlayerRataCanguro/PlayerZorro/PlayerOso bajo el nodo canónico de la escena, grupo jugador, vida positiva, entrada local validada, escena/enum coherentes y reserva física diferida. Cargar una escena no invoca CompleteBiome; no hay barrido de cuerpos ni finalización en Ready.
- integration/sqlite/LocalGameState.cs: ILocalCompletionStore, LocalBiomeCompletion y LocalCompletionResult dentro del archivo existente; CompleteAnimalAsync y coordinación con Busy/HasPendingWrite. Se evitó crear otro archivo de producción o cambiar proyectos.
- integration/sqlite/GamePersistenceAdapter.cs: implementa únicamente el puerto ILocalCompletionStore; CompleteBiomeAsync conserva su implementación/transacción existentes.
- scripts/AnimalSegmentFlow.cs: rama completion local, modal de confirmación/error/reintento, notificación secundaria y retorno privado a selección confirmado.
- integration/sqlite/LocalGameplayObserver.cs: CompletionConfirmed, con EventId igual a OperationId confirmado, asociado a sesión/run/partida/bioma existentes.
- scripts/MenuNiveles.cs: mensaje explícito de cinco completados/final global pendiente en el label existente.

Pruebas: local-persistence/game-save-tests/LocalBiomeCompletionChecks.cs.txt (nuevo) y GameSaveChecks.cs.txt (dispatcher --biome-completion y --completion-probe). Sin cambios a tarjetas, escenas, personajes, recursos, VariablesGlobales, Final, StatisticsService, CompleteBiome, UnitOfWork, esquema o proyectos.

Firma reutilizada: CompleteBiomeCommand(OperationId, LocalPlayerId, GameId, ExpectedRevision, BiomeId, ConfirmedResult) → SaveReceipt mediante GamePersistenceAdapter.CompleteBiomeAsync. La revisión se lee de SQLite; resultado individual healthy→good/degraded→bad según decisión ya confirmada. No es evaluación del final global. Se valida propiedad, partida current/in_progress, animal_pending, decisión, ambiente y frontera. El servicio existente conserva todas sus validaciones atómicas y recibos.

### Orden, errores e idempotencia
Llegada válida → reserva de meta/modal bloqueante → lectura autoritativa → comando UUID v4 inmutable → CompleteBiome → recibo confirmado → relectura del completed → actualización de LocalGameState → intento de evento → selección local.

El bool físico evita señales repetidas de la instancia; Busy evita doble clic/concurrencia; comando/ID/revisión/payload se retienen para retries; un recibo conocido evita otra llamada al servicio incluso si falla después lectura/refresco/navegación. Respuesta perdida se resuelve enviando el mismo comando al servicio idempotente. Payload contradictorio con mismo ID se rechaza; una intención nueva contra completed recibe BIOME_COMPLETED. El recibo no se confunde con el éxito de navegación.

SQLite precommit fallido no produce éxito, evento ni navegación; el modal permite reintentar la misma operación. Durante una intención no resuelta el botón de recuperación también intenta resolverla antes de navegar; no descarta un commit incierto. Un fallo persistente requiere restaurar acceso local o cerrar/reabrir, sin login, progreso temporal ni borrado. Si el commit ya está confirmado, conserva identidad/recibo aunque falle refresco; al recuperar no vuelve a guardar. Los reintentos de navegación preparan un ticket SQLite fresco, conservan la pausa del modal si fallan y liberan SceneTree.Paused al confirmar el cambio.

Tras reiniciar el proceso no se conserva la intención en memoria: SQLite manda. Continuar relee completed y sus tarjetas quedan bloqueadas, sin reenviar una llegada o una decisión. No hay journal nuevo.

### Cinco biomas y navegación
ocean, jungle, desert, forest y tundra comparten el contrato, con su personaje concreto y escena canónica. Cualquiera puede ser primero, cuarto o quinto: se cuenta el estado persistido, no el enum ni un orden obligatorio.

Mientras quedan pendientes: retorno a res://scenes/levels/menu_niveles.tscn; tarjetas completed bloqueadas por la selección existente y demás incompletas disponibles. Se conservan decisiones y consecuencias.

Quinto: CompleteBiome guarda completed y mantiene in_progress. El modal existente muestra que los cinco están guardados y el final global offline sigue pendiente. Una acción explícita abre la selección existente, con las cinco tarjetas bloqueadas y el mismo aviso; Volver al menú permanece disponible. Continuar vuelve a esa selección después de reiniciar; Nueva partida permanece bloqueada. No es una pantalla de final, no muestra Bueno/Medio/Malo, no calcula ni cierra ni archiva ni crea sucesora. Hay salida recuperable sin inventar escenas, pero jugar una nueva partida queda pendiente del futuro cierre global autorizado.

### Telemetría secundaria y reconciliación futura
Al iniciar la coordinación se llama Loading para cerrar el tiempo efectivo anterior a la espera de SQLite; el tiempo de confirmación/modal/navegación no se contabiliza como ActiveAnimal. Después del commit y actualización local, CompletionConfirmed cierra el intervalo pendiente (de carga si procede) antes de encolar ANIMAL_SEGMENT_COMPLETED en el FIFO existente, respetando el orden temporal requerido por GameplayEventService. EventId = OperationId del recibo; el evento captura un payload estable y no se regenera al reintentar.

La notificación no espera que la escritura estadística termine ni afirma que haya persistido. El FIFO existente mantiene IDs/payload y diagnósticos de cobertura incompleta; sus fallos no revierten progreso ni bloquean navegación. Si no hay un run válido o el observador no está disponible se registra TELEMETRY_COMPLETION_MISSING. Una excepción de la notificación también deja continuar la recuperación local. No se implementa otra cola, outbox, migración ni transacción conjunta.

Ventana reconocida: cerrar el proceso entre commit principal y escritura del evento puede dejar una finalización sin evento. Diseño futuro de reconciliación: comparar recibos complete_biome y completed contra gameplay_events.EventId=OperationId, por propietario/partida/bioma; reconstruir solo el faltante con ese mismo ID y datos verificables del run original, nunca otra operación de dominio. Si existe evento, conservar su payload y tratarlo idempotentemente; ante contradicción, diagnóstico. No inventar sesión, run, offset o duración. Runs cerrados/interrumpidos o evidencia insuficiente requieren un contrato específico de reconciliación histórica autorizado: RecordEvent actual no permite forzar retroactivamente un terminal. Sin esa evidencia, marcar faltante/no reconstruible. No ejecutar reparación de historia durante E.2A.

### Validación ejecutada
**472 comprobaciones C# aprobadas, cero fallidas: 54 nuevas + 418 regresiones reejecutadas.**
Nuevas: cinco biomas, conservación de decisiones/ambiente, bloqueo/disponibilidad, replay de recibo y conflicto, rechazo de completed, lectura en proceso hijo, decisión/etapa/partida ausentes, rollback precommit, respuesta perdida, concurrencia, fallos de relectura/refresco/navegación, pausa mediante callbacks, orden libre de cinco, quinto pendiente sin sucesora/final inventado, evento único/ID estable, escritura secundaria fallida/detectable/reintentable y conservación de sesiones/tiempo.

Regresiones: 23 actividad, 31 observador, 41 eventos, 24 pantalla, 39 consultas, 19 Game Over/navegación, 21 reinicio, 11 retorno, 29 entrada animal, 30 decisiones, 30 selección, 35 menú, 42 progreso y 43 SQLite. No se suman repeticiones. No se presentan las 15/15 manuales históricas como pruebas de esta fase.

Comandos efectivamente usados, con entorno aislado de integration/sqlite/run-infrastructure.ps1:
- dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore --disable-build-servers -nodeReuse:false
- GameSave.Checks.exe --biome-completion
- GameSave.Checks.exe con --activity-statistics, --gameplay-observer, --gameplay-events, --statistics-screen, --local-statistics, --game-over-navigation, --animal-restart, --menu-return, --animal-entry, --decisions, --biome-selection, --runtime-menu y --progress.
- local-persistence/run-checks.ps1
- dotnet build TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild -p:TwoSidesIsolatedBuild=true -p:GodotProjectDir=integration/sqlite/.work/

Biblioteca y ejecutores: 0 errores/0 advertencias. Rebuild completo Godot C#: 0 errores, 63 advertencias históricas CS0618 ParallaxBackground, 0 nuevas. No referencias duplicadas nuevas ni cambios de proyectos. No se ejecutó Godot/Node, HTTP, Atlas o AWS. Compilaciones y pruebas no cargan backend/.env.

Todas las escrituras de pruebas usaron SyntheticSandbox bajo local-persistence/.work/databases/<UUID>. Las tres bases protegidas y sus manifiestos/leases (9 archivos) conservan hash/tamaño/fecha antes/después. Manifiesto adicional de 1.545 archivos fuera del alcance permanece idéntico. .env: 278 bytes y SHA-256 histórico 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, verificado separadamente de pruebas/builds sin valores. Sin cambios de ACL/propietario; riesgo ACL B00 pendiente.

### Validación manual segura pendiente
1. Abrir manualmente la copia sin backend ni internet; Continuar debe conservar perfil/partida. Anotar progreso inicial; no borrar bases ni forzar SQL.
2. En cada bioma todavía incompleto, tomar su decisión si falta y llegar físicamente con su animal vivo; comprobar ambiente antes/después y que no se repite la decisión.
3. Mientras queden pendientes, confirmar retorno a selección sin pausa residual, tarjeta completada bloqueada y otros incompletos disponibles. Pulsaciones repetidas no deben duplicar navegación.
4. Cerrar/reabrir y Continuar: misma partida, decisiones/ambientes/completed persistidos, sin login. No se restaura posición, vida, agua o comida.
5. Al completar el quinto, leer el aviso de final global pendiente, abrir selección y volver al menú. Los cinco permanecen bloqueados y Nueva partida también. No esperar final narrativo ni intentar desbloquear mediante edición.
6. Revisar consola y Estadísticas: progreso principal confirmado; un diagnóstico de telemetría implica cobertura incompleta, no pérdida de la decisión. Las pruebas de fallos SQLite/telemetría se realizan solo con fixtures; no alterar permisos, archivo runtime o credenciales para provocarlos.

Las pruebas automatizadas de pausa/navegación usan callbacks, no SceneTree real; la colisión, identidad física y acceso visual a los botones requieren esa validación manual. No se promete cobertura estadística histórica completa ni reconciliación automática tras crash.

Trabajo detenido tras E.2A. No evaluación de finales, cierre global, recursos/checkpoints, partidas nuevas ni B05.


## B04.2B.2B.2E.2B.2 — Finales locales autorizados (2026-10-27)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** El usuario autorizó regla nueva definitiva, no recuperada del evaluador original:0/1/2 reject→bad;3/4→medium;5→good, exclusivamente cinco decisiones canónicas de cinco completed de la misma partida. Versión narrativa separada local-ending-reject-count-1; se conservan versiones de partida/decisiones.

Informe completo, inventario exacto y guía manual en GLOBAL_PLAYTHROUGH_CLOSURE_PLAN.md (apartado E.2B.2). Un evaluador puro centraliza la regla; GameSaveService.PrepareFinal/CloseGame usan transacción/recibos existentes y esquema2 sin migrar. final_pending persiste resultado antes de navegar; cierre solo por acción explícita de salida, completed/is_current0 e historia intacta. Continuar recupera cinco completed sin resultado o final_pending después de reinicio, sin repetir decisiones/metas. Nueva partida es explícita y solo posterior al cierre, con perfil igual, GameId nuevo y cinco biomas limpios/disponibles.

Final.cs consume SQLite y sale localmente: escena/textos/tween/nodos/recursos intactos, sin HTTP/login. AnimalSegmentFlow coordina quinto; menú recupera finales. FinNivel/CompleteBiome y mecánicas intactos. StatisticsService únicamente reconoce la versión final nueva para metadatos, ajuste informado previamente; no se alteran agregados o eventos. CompletedAt indica preparación del resultado; recibo close_game/ArchivedAt indican cierre. No existe ni se afirma marcador durable de “final leído”.

598 comprobaciones aprobadas:126 nuevas y472 regresiones reejecutadas,0 fallidas finales. Biblioteca/ejecutores0 errores/0 advertencias; Godot C# Rebuild0 errores,63 advertencias históricas ParallaxBackground,0 nuevas. Sin ejecución de Godot; visual/navegación/pausa real requieren manuales. Las10/10 manuales anteriores son E.2A, no esta fase.

Tres bases protegidas y9 archivos asociados idénticos en hash/tamaño/fecha;1.542 archivos fuera de alcance idénticos. .env278 bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, sin valores ni cambios ACL/propietario; riesgo B00 pendiente. Solo fixtures nuevas para escrituras. Sin migraciones, Node/Atlas/AWS/B05. Probar manualmente good/medium/bad en partidas sucesivas sin editar decisiones ni borrar historia; incluir reinicio antes de salir del final, cierre y nueva partida. Trabajo detenido.
