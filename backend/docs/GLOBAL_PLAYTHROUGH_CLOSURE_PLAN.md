# Plan de cierre global y recuperación de partida
B04.2B.2B.2E.2B.1 · 2026-10-27 · Propuesta técnica no implementada.

## Autoridad y estado actual
E.2A validada manualmente por el usuario: 10/10, sin errores nuevos. Las cinco metas guardan completed antes de navegar, conservan decisiones y bloquean reentrada. El quinto ofrece aviso local recuperable de final global pendiente; no constituye un resultado narrativo ni cierre.

Separar: A bioma completado; B cinco completados; C resultado confirmado/presentado; D partida global cerrada. SQLite es autoridad. Las estadísticas y navegación no acreditan un cierre.

## Capacidades SQLite verificadas
GameSaveService.AreAllCanonicalBiomesCompleted(owner,game) carga agregado validado y exige una fila completed por cada ID canónico. LoadGame/GetActiveGame recuperan Biomes, Decisions, Environments, Snapshot y Game bajo las validaciones actuales; no juntar consultas de revisiones distintas para evaluar.

Recuperar exactamente una decisión por cada ID y su key canónica usando conjuntos/Single, con mismo GameId, LastDecisionId y consecuencias validadas. No contar environmental_state como otra decisión ni usar solo resultados individuales como sustituto de las entradas que requiera el evaluador auténtico.

SavedGame ya tiene Ending, EndingRulesVersion, CompletedAt y ArchivedAt. DDL admite in_progress/final_pending/completed/archived; is_current=1 solo permite in_progress/final_pending. final_pending exige ending/version/completed_at y resume_kind=ending. Sin embargo, SaveCatalog.Resume no implementa ending y SQLiteRepository.UpdateGame NO escribe Ending/EndingRulesVersion/CompletedAt. No hay servicio local de preparar final, marcar presentado o cerrar globalmente. Tener columnas no equivale a capacidad disponible.

CompleteBiome termina solo un bioma y deja in_progress/menu, también tras el quinto. HasUnfinishedGames no considera terminada una fila hasta status completed con ending válido, versión igual a rules_version y completed_at. CreateNewGame exige ausencia de cualquier inconclusa, revisión/ID esperados y perfil existente. Un cierre futuro deberá usar is_current=0 por el CHECK; conservará su GameId e historia, no una copia histórica nueva. Luego la intención explícita Nueva partida puede crear otra con perfil igual y cinco filas limpias. No crear sucesora automáticamente por heredar la expectativa del antiguo servicio HTTP.

UnitOfWork.Write ya ofrece BEGIN IMMEDIATE, digest, UUID estable, comprobación de recibo antes de mutar, revisión optimista y rollback. Reutilizarlo en los futuros comandos; no cambiar la transacción de CompleteBiome para cerrar globalmente.

## Secuencia propuesta, condicionada al evaluador
1. Quinta meta → CompleteBiome existente confirma. No volver a jugar ese bioma para recuperar un error posterior.
2. Leer snapshot coherente con cinco completed y cinco decisiones/consecuencias. Si falta algo, error local y datos intactos.
3. Evaluar solo con reglas auténticas verificadas y versión compatible. Sin esa fuente, mantener aviso E.2A y bloqueo de implementación.
4. Futuro comando de preparación final valida/relee las entradas dentro de la misma transacción, su revisión/huella y versión, obtiene el resultado con el evaluador puro y persiste resultado+versión+momento+continuación ending+recibo+revisión/snapshot en conjunto.
5. Solo después del recibo cargar Final.tscn con contexto local confirmado de la misma partida. No inyectar un string arbitrario ni invocar servicios remotos.
6. Mostrar los textos/animación existentes. No marcar presentado al solicitar el cambio de escena. Definir evidencia de presentación efectiva (p.ej. vista inicializada; si se exige lectura completa, evento distinto).
7. Acción explícita de salida después del comportamiento actual de texto: futuro comando de cierre valida resultado confirmado y evidencia de presentación definida, marca completed/is_current=0 y registra recibo/fecha/revisión en transacción. No borrar datos.
8. Tras commit volver al menú; Nueva partida disponible por intención nueva, sin heredar estados ambientales. Ninguna creación automática dentro del cierre.

Semántica temporal por aprobar: el DDL exige completed_at ya en final_pending; por tanto ese campo no puede acreditar por sí solo salida/presentación. Proponer distinguir momento de resultado preparado, de presentación y de cierre mediante contrato versionado. No falsificar fechas del quinto ni reinterpretar timestamps históricos.

## Estados de recuperación
Son nombres conceptuales de UI/coordinación, NO enums ni columnas implementados:
| Situación | Evidencia durable / conducta futura |
|---|---|
| Cinco completos, resultado pendiente | in_progress con cinco completed; aviso E.2A, recuperar evaluación sin reabrir animales. |
| Final confirmado pendiente de presentación | final_pending + resultado/version/continuación y recibo válidos; Continuar abre el mismo resultado. |
| Final visible o ya presentado, cierre pendiente | mantener final_pending; reinicio vuelve al mismo final. Cerrar ventana no cierra la partida. |
| Partida cerrada | completed + metadatos válidos + is_current=0 + recibo de cierre; historial conservado y Nueva partida habilitable. |
| Estado contradictorio | error controlado, no final por defecto, no login ni borrado. |

La evidencia durable de “presentado” no existe hoy. Puede diseñarse con operación/recibo dedicado si su momento, identidad natural y consulta quedan definidos; de otro modo nueva migración autorizada. No usar el FIFO estadístico como condición obligatoria para cerrar: su escritura es secundaria y puede faltar. Definir esta decisión antes de implementar un marcador redundante.

## Fallos A–F y reintentos
| Fallo | Recuperación propuesta |
|---|---|
| A quinto confirmado, evaluación falla | conservar cinco completed/in_progress; reintentar solo preparación; no habilitar nueva partida. |
| B resultado calculado, persistencia falla | no mostrarlo como confirmado; reusar intención/entradas/version y resolver commit incierto mediante recibo. |
| C resultado persistido, navegación falla | conservar final_pending y recibo; reintentar navegación con el mismo resultado, no otro cálculo. |
| D cierre de Godot durante pantalla | reabrir final_pending; mismo resultado y animación existente, sin salida automática. |
| E salida solicitada, cierre falla | permanecer/reabrir final confirmado; reintentar mismo cierre. Nueva partida sigue bloqueada hasta commit. |
| F reinicio y operación repetida | consultar estado/recibos; reconocer intención lógica ya hecha por GameId+versión/tipo, además del UUID. No duplicar historia o evaluación. |

IDs UUID v4 estables por intención, propietario y GameId en payload, expectedRevision fija y digest; mismo ID con payload diferente debe producir conflicto. Después de reiniciar, un UUID nuevo no debe eludir la unicidad lógica: preparar sobre final_pending devuelve el resultado/recibo existente validado o rechazo explícito; cerrar una partida ya cerrada devuelve su cierre confirmado o rechazo controlado. Definir recuperación de UUID original/consulta natural antes de afirmar idempotencia entre procesos. Un cambio de reglas no recalcula finales ya persistidos.

No aceptar como entrada del cierre un ending elegido por UI. Versiones actuales initial-state-only-1 no certifican reglas narrativas: debe aprobarse cómo versionar reglas finales y cómo admitir la partida manual anterior sin cambiar silenciosamente su semántica. No migrarla en esta fase.

## Presentación y responsabilidades
Final.cs._Ready/_Process dependen hoy de Session/EndingService; IrAlMenu usa POST final-exit y verificación de sucesora, y GoRecovery envía a login/recuperación. Cambios mínimos futuros: fuente local validada, gate local de continuidad, cierre local idempotente y vuelta al menú después de commit. Mantener Titulo/Texto/Continuar, selección de textos, tween, clic que termina texto, espera antes de salida y liberación de pausa. No editar escenas si no hace falta; una necesidad visual adicional requiere autorización. No tratar EscenaMenuNiveles exportado como navegación efectiva actual.

El evaluador determina resultado; Final solo lo presenta; GameSaveService/UoW lo persistirían y cerrarían; LocalGameState/adaptador coordinarían contexto; telemetría seguiría siendo secundaria. Ningún responsable debe sustituir al otro.

## Historia, estadísticas y sincronización futura
Conservar GameId, propietario local, cinco Decisions con IDs/opciones/keys/consecuencias/versiones, cinco completed/result/fechas, ending/version/fecha de resultado y cierre con semántica aprobada, recibos y eventos/run/sesiones/intervalos existentes. GetGameHistory pagina historial validado; StatisticsService deriva Ending/ConfirmedCompleted de metadatos coherentes, no calcula el final. No modificar agregados para forzar una lectura deseada.

Futura exportación por GameId+revisión y evento estable, con dueño/versiones y exclusión de secretos. No enviar nada, crear endpoints o asumir atomicidad entre estadísticas y dominio. Distinguir fin individual de final presentado/cierre; no duplicar contadores por retries.

## Archivos y pruebas de una implementación futura
Archivos principales: GameSaveService.cs.txt, SQLiteRepository.cs.txt, Models.cs.txt, Validation.cs.txt; evaluador nuevo verificado; RealGameCatalog.cs; GamePersistenceAdapter.cs, LocalGameState.cs; AnimalSegmentFlow.cs, MenuNiveles.cs, Final.cs y, si se necesita para recuperar final_pending desde el inicio, scripts/MenuPrincipal.cs e integration/sqlite/LocalProfileView.cs. Revisar inclusion de tests/proyectos solo si necesario. SchemaManager.cs.txt únicamente mediante nueva migración aprobada si el diseño de presentación exige almacenamiento adicional. No cambiar FinNivel/CompleteBiome para insertar una creación de partida.

Pruebas futuras en bases sintéticas independientes: equivalencia del evaluador (bloqueada ahora), todas las cinco finalizaciones/decisiones, ausencia/duplicado/contradicción/versiones, orden libre, prepare/close replay y conflicto, fallos transaccionales A–F, recibo tras pérdida de respuesta, proceso hijo, cierre/reinicio antes/después de presentación, doble clic, navegación fallida, ambiente limpio de nueva partida explícita, historial/estadísticas conservados, ausencia de HTTP, ningún acceso a bases protegidas. Física/UI/animación/pausa reales requieren manuales separadas.

## Dependencias y próximo alcance
Bloqueos: fuente auténtica del evaluador; versionado compatible; contrato de presentación/cierre/fechas; operaciones de resultado/cierre y gate local de recuperación. E.2B.2 debe comenzar solo tras resolver/autorizar esas decisiones. No hay servicios nuevos, pruebas de equivalencia ejecutadas, escrituras SQL, compilaciones necesarias ni cambios de código en esta auditoría.



## B04.2B.2B.2E.2B.2 — Evaluador autorizado y cierre local (2026-10-27)

**COMPLETADA EN CÓDIGO. VALIDACIÓN RUNTIME PENDIENTE.** Esta autorización levanta el bloqueo de E.2B.1 para la nueva regla; no se recuperó el evaluador original. E.2A/10 de10 manuales son antecedentes aportados por el usuario, no validación manual de este flujo global.

### Autorización, regla y versión
El documento de fase del usuario autoriza expresamente contar solo reject en las cinco decisiones de los cinco biomas completed de la misma partida:
| reject | Resultado persistido | Presentación |
|---|---|---|
| 0 | bad | Malo |
| 1 | bad | Malo |
| 2 | bad | Malo |
| 3 | medium | Medio |
| 4 | medium | Medio |
| 5 | good | Bueno |

Versión nueva y única: **local-ending-reject-count-1**, almacenada en ending_rules_version. No se reutiliza initial-state-only-1: RulesVersion de partida/decisiones y ContentVersion anteriores se conservan. La regla narrativa nueva se aplica explícitamente al preparar un final de esta copia bajo la autorización actual, incluidas partidas E.2A ya existentes con cinco completed. No es una afirmación de equivalencia con la demostración original desaparecida. Sin ponderación por orden, tiempo, muerte, recursos, sesiones o historia.

### Inventario exacto de cambios
Producción (12 archivos):
- local-persistence/src/LocalFinalEvaluator.cs.txt, nuevo: FinalDecision, LocalFinalResult y evaluador puro centralizado, sin SQL/Godot/HTTP/VariablesGlobales.
- local-persistence/src/Models.cs.txt: PrepareFinalCommand y CloseGameCommand.
- local-persistence/src/GameSaveService.cs.txt: PrepareFinal/CloseGame, validación de resultados locales en Load, admisión explícita de versión final para HasUnfinished y rechazo preservado de ending en SaveCurrentGame genérico.
- local-persistence/src/SQLiteRepository.cs.txt: UPDATE parametrizado PrepareFinal que satisface CHECK en una sola instrucción.
- local-persistence/src/Validation.cs.txt: permite leer continuación ending con bioma/checkpoint nulos y snapshot boundary v1.
- local-persistence/src/StatisticsService.cs.txt: solo reconoce la nueva versión narrativa para Ending/ConfirmedCompleted; sin fórmula duplicada, agregados nuevos o cambios en captura.
- integration/sqlite/GamePersistenceAdapter.cs: puerto ILocalFinalStore y fachadas PrepareFinalAsync/CloseGameAsync usando el worker serial existente.
- integration/sqlite/LocalGameState.cs: intención de preparar/cerrar estable, NeedsFinal, ConfirmedEnding, recuperación y NavigateFinalAsync.
- scripts/AnimalSegmentFlow.cs: después del quinto recibo, prepara el resultado local y navega a la escena existente; no repite CompleteBiome al reintentar preparación/navegación.
- scripts/MenuPrincipal.cs: Continuar reconoce cinco completed o final_pending y recupera Final.tscn; reintento de preparación no se convierte en Nueva partida.
- scripts/MenuNiveles.cs: mensaje de recuperación mediante menú/Continuar si se encuentra una selección con cinco completos.
- scripts/Final.cs: obtiene resultado confirmado de SQLite, elimina gates/login/HTTP de esa pantalla y cierra localmente al salir.

Pruebas (2 archivos): nuevo local-persistence/game-save-tests/LocalFinalChecks.cs.txt y dispatcher GameSaveChecks.cs.txt (--local-finals / --final-probe). No cambios de proyectos para incluirlos: glob existente.

Documentación (11 archivos): LOCAL_FINAL_EVALUATOR_PLAN, GLOBAL_PLAYTHROUGH_CLOSURE_PLAN, FINAL_FLOW_AUDIT, COMPLETE_BIOME_INTEGRATION_PLAN, GODOT_RUNTIME_INTEGRATION_PLAN, GODOT_RUNTIME_TEST_PLAN, LOCAL_STATISTICS_IMPLEMENTATION_PLAN, PHASES, PHASE_HISTORY, DECISIONS y local-persistence/README.md. Total25 archivos, incluidos2 nuevos. Se conservan los antecedentes; este apartado sustituye sus propuestas/bloqueos solo en el alcance implementado.

Sin cambios a FinNivel, CompleteBiome, UnitOfWork, esquemas/migraciones, StatisticsRepository, observador, TarjetaNivel, LocalProfileView, VariablesGlobales, personajes, recursos, escenas, project.godot o TwoSides.csproj.

### Contratos y validaciones
LocalFinalEvaluator.Evaluate(gameId, IReadOnlyList<FinalDecision>) valida exactamente los cinco IDs canónicos sin duplicados, misma partida, completed, opción reject/approve y ambiente/resultado coherentes. Su sobrecarga de agregado verifica las cinco decisiones/filas/ambientes y sus vínculos LastDecisionId/consecuencias. El servicio carga el agregado con validación de propietario, catálogo de claves, versiones, snapshot y recibos de decisión; no evalúa entradas arbitrarias de UI.

PrepareFinalCommand(OperationId,LocalPlayerId,GameId,ExpectedRevision) → SaveReceipt.
CloseGameCommand(OperationId,LocalPlayerId,GameId,ExpectedRevision,ConfirmedEnding) → SaveReceipt.
Los resultados no se eligen desde el cliente. ConfirmedEnding de cierre solo se compara con el valor validado y persistido.

PrepareFinal ejecuta UnitOfWork.Write/BEGIN IMMEDIATE existente: carga/valida cinco finalizaciones, cinco decisiones y recibos, evalúa, exige revisión actual, registra recibo y cambia a final_pending/is_current1/resume_kind ending, sin bioma/checkpoint, ending/ending_rules_version/completed_at, revisión+1 y snapshot consistente en la MISMA transacción. Sin migración. Guardado genérico de ending sigue rechazado: solo esta operación específica puede prepararlo.

Mismo OperationId/payload devuelve recibo previo; distinto payload bajo el mismo ID produce OPERATION_CONFLICT. Otra intención para una partida ya preparada/cerrada reconoce su resultado validado, conserva ending/fecha/revisión y no vuelve a transicionar. Puede dejar un recibo adicional de reconocimiento, no otro final ni otra fila de historia. La UI evita esos comandos redundantes cuando ya recuperó un resultado confirmado. Resultado/versión contradictorios producen FINAL_RESULT_CONFLICT y se mantienen intactos, sin sobreescritura; el código se expone como diagnóstico local. Una versión futura debe conservar el evaluador de esta versión para leerla, no reinterpretarla.

### Quinto, presentación y cierre
Después de CompleteBiome confirmado se intenta telemetría secundaria igual que en E.2A. Al detectar cinco completed, LocalGameState.PrepareFinalAsync persiste y relee el resultado; NavigateFinalAsync llama navegación solo tras esa confirmación. El modal conserva la recuperación si falla preparación/navegación. Los demás completados siguen retornando a selección.

Final._Ready espera almacenamiento local, recupera/verifica resultado confirmado y luego usa el mismo mapeo good/medium/bad→Bueno/Medio/Malo. Se conservan Final.tscn, títulos/textos, nodos, sprites, velocidades/espera, tween, clic que completa texto y acción posterior de salida. Solo se añade gate Visible al input durante la lectura asíncrona. No se crea UI final alternativa ni se consulta autenticación remota.

Preparar/navegar no significa “visto”. No se añade marcador durable de presentación: la aplicación sabe que inicializó la vista, pero no acredita que el usuario leyera/renderizara cada cuadro. Cerrar el proceso antes o durante la pantalla deja final_pending y permite mostrarlo de nuevo. La acción de salida existente, después de su espera, inicia CloseFinalAsync; la finalización de la animación por sí sola no cierra.

CloseGame valida propietario, cinco completed y el mismo resultado/version confirmados; transacción existente marca status completed/is_current0, revisión+1, SavedAt y ArchivedAt actuales, snapshot/recibo. No modifica ending ni decisiones/ambientes/progreso/estadísticas. Conforme al esquema, CompletedAt es el instante en que se PREPARÓ el resultado (ya obligatorio en final_pending); el recibo close_game y ArchivedAt identifican el momento de cierre global. No presentar CompletedAt como prueba de lectura o salida. No se usa status archived para sustituir completed.

Final.IrAlMenu solo vuelve al menú después de confirmar el cierre. Fallo de cierre deja la misma pantalla/reintento y Nueva partida bloqueada. Si cierre confirma y falla navegación, la pantalla conserva la confirmación y reintenta solo el cambio de escena. Reiniciar entonces abre menú con la partida histórica ya cerrada, sin crear sucesora.

### Recuperación y nueva partida
A quinto guardado pero no preparado: iniciar menú y Continuar detecta cinco completed y prepara; no vuelve a jugar el quinto.
B cálculo/almacenamiento fallido: no mostrar resultado provisional; mismo comando/revisión/ID para resolver commit incierto.
C resultado guardado/navegación fallida: final_pending durable; Continuar o retry abre el mismo ending.
D/E proceso cerrado antes/durante pantalla: recuperar final_pending y mostrarlo, sin cierre automático.
F proceso cerrado durante salida: precommit sigue final_pending; postcommit es completed/is_current0. Reintentar cierre reconoce el hecho, sin duplicar partida/historia.
Los gates del menú y el perfil existente se conservan. Nueva partida solo se habilita tras cierre confirmado y ausencia de otras inconclusas; es una intención explícita separada. Crea GameId propio, perfil igual, cinco human_pending disponibles, decisiones vacías y ambientes nulos. No se importan recursos/estados de historia. El bool global visual anterior no es autoridad y cada nueva decisión confirmada prepara el ambiente antes del animal por la ruta existente.

### Estadísticas y futuros datos remotos
Se informó antes de editar el ajuste exacto de StatisticsService: aceptar ending_rules_version local-ending-reject-count-1 además del reconocimiento legado. No se modifican sumas/consultas de decisiones, progreso, tiempo, sesiones ni eventos. Se conserva versión, GameId, cinco decisiones/resultados/fechas, historial y recibos para sincronización futura. No se fabrican eventos de presentación/cierre ni se envía nada. La captura de E.2A sigue siendo secundaria y conserva su posible laguna tras crash entre dominio y evento; este cierre no la repara ni exige su éxito.

### Pruebas efectivamente ejecutadas
**598 comprobaciones C# aprobadas:126 nuevas +472 regresiones reejecutadas, cero fallidas finales.**
126 nuevas incluyen seis conteos,32 combinaciones exhaustivas y orden invertido; entradas faltantes/duplicadas/desconocidas/contradictorias/incompletas/de otra partida; determinismo; persistencia good/medium/bad, separación de versiones, recibos y conflictos; cinco decisiones sin meta física y solo cuatro completados rechazados; quinta finalización válida; rollback de preparación/cierre; navegación rechazada mediante callback del coordinador; lectura en procesos hijos; cierres antes/durante pantalla simulados por contextos nuevos; respuesta perdida de preparación y cierre; doble clic; ausencia de nueva partida anticipada; historial/ambientes/decisiones preservados; nueva partida limpia/única; dueño ajeno rechazado y eventos/tiempo efectivo anteriores conservados.

Regresiones reejecutadas:54 completion,23 actividad,31 observador,41 eventos,24 pantalla,39 consultas,19 Game Over/navegación,21 reinicio,11 retorno,29 entrada,30 decisiones,30 selección,35 menú,42 progreso y43 SQLite. No sumar ejecuciones repetidas. La suite base inicialmente detectó cambio de error en SaveCurrentGame ending; se corrigió preservando UNSUPPORTED_CHECKPOINT en la API genérica y sus43 casos pasaron después. No se alteró ese test para ocultarlo.

Comandos usados con entorno aislado de run-infrastructure.ps1:
- dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore --disable-build-servers -nodeReuse:false
- GameSave.Checks.exe --local-finals y los catorce modos seguros anteriores (--biome-completion, --activity-statistics, --gameplay-observer, --gameplay-events, --statistics-screen, --local-statistics, --game-over-navigation, --animal-restart, --menu-return, --animal-entry, --decisions, --biome-selection, --runtime-menu, --progress).
- local-persistence/run-checks.ps1 (43 SQLite).
- dotnet build TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild -p:TwoSidesIsolatedBuild=true -p:GodotProjectDir=integration/sqlite/.work/
Comprobación final focalizada repitió --local-finals, --runtime-menu y --local-statistics tras los últimos ajustes de idempotencia/versionado.

Biblioteca/ejecutores:0 errores/0 advertencias. Godot C# Rebuild:0 errores,63 advertencias históricas CS0618 ParallaxBackground,0 nuevas; sin referencias/proyectos duplicados. No se ejecutó Godot. Los callbacks y procesos C# prueban coordinación/SQLite; no acreditan colisión, frames, tween, navegación o pausa reales del motor.

### Integridad y límites
Solo fixtures bajo local-persistence/.work/databases/<UUID> para escrituras de prueba. Ninguna operación CompleteBiome/PrepareFinal/CloseGame/Nueva partida se ejecutó en las tres bases protegidas. Sus9 archivos de bases/manifiestos/leases conservan hash/tamaño/fecha. Manifiesto de1.542 archivos fuera del alcance idéntico antes/después (incluye escenas/proyectos/VariablesGlobales/FinNivel). .env verificado separadamente por tamaño/hash:278 bytes, SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928; sin lectura de valores ni cambios ACL/propietario. Riesgo B00 pendiente. Sin migraciones, dependencias nuevas, Node, Atlas, AWS o B05.

No se certifica equivalencia con el evaluador original ausente. No existe prueba durable de “final leído”; no se afirma. La telemetría no es condición de cierre. Errores de almacenamiento persistentes requieren recuperación de acceso local o reinicio; nunca login, borrado o resultado por defecto.

### Guía manual segura de los tres finales
1. Abrir manualmente esta copia sin Node/internet. Si la partida ya tiene cinco completed, Continuar debe preparar/mostrar su resultado real, sin modificar sus decisiones ni repetir el quinto.
2. Para good, jugar una partida con5 reject; para medium,3 o4 reject; para bad,0/1/2 reject. Son partidas sucesivas creadas desde Nueva partida después de cerrar la anterior; no editar SQLite ni borrar historia para forzar resultados. Las decisiones ya confirmadas no se cambian para probar.
3. Completar físicamente los cinco en cualquier orden. Después del quinto comprobar título/texto esperado, ambiente conservado y consola sin errores/login. Comparar visual/animación con la presentación previa.
4. Cerrar Godot sin salir explícitamente del final; reabrir y Continuar: mismo resultado. Nueva partida sigue bloqueada mientras final_pending.
5. Primer clic durante escritura completa el texto; después de la espera, la salida explícita debe confirmar cierre y abrir menú sin pausa. El perfil permanece y Nueva partida se habilita.
6. Consultar Estadísticas: partida anterior histórica con su resultado y decisiones. Crear explícitamente otra: cinco disponibles, sin decisiones/ambientes heredados; no dos activas.
7. Repetir para cubrir los tres resultados, sin restaurar ni sobrescribir bases. Registrar consola sin secretos si hay fallo. Los fallos de disco/transacción y respuesta perdida se prueban automáticamente solo en fixtures; no manipular permisos o runtime para provocarlos.

Siguiente paso recomendado: validación manual del quinto→final→reinicio→salida→historia→nueva partida para los tres resultados, antes de otra implementación. Detenido al terminar E.2B.2. No B05 ni sincronización.
