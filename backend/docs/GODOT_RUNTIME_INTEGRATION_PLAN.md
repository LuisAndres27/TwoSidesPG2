# Preparación de integración real Godot–SQLite

Fase B04.2B.2B.2C.1. Fecha: 2026-10-25. **COMPLETADA como preparación documental**; integración funcional NO autorizada ni ejecutada. Este documento y los otros dos planes de runtime prevalecen sobre propuestas históricas incompatibles. Las incertidumbres descritas bloquean sus conexiones respectivas, no la entrega de esta inspección. Solo se trabajó en la copia Two-Sides PRUEBA.

## Flujo observado, sin ejecución del motor

`project.godot` inicia `uid://ddbjf57wpxxoq`, resuelto por la cabecera de `assets/sprites/ui/menu_principal.tscn`. Sus Autoload son Transicion y GameApplicationContext. `TwoSides.csproj` conserva la referencia a local-persistence y las exclusiones reparadas; esto permite compilar la biblioteca, no inicializa guardado ni conecta escenas.

`GameApplicationContext._Ready` crea ApiClient, SupervisedApiClient, PendingOperationStore en user://pending-operations, PersistentApiClient, GameApplicationServices, ConnectivityOverlay y OceanDecisionContext. Los servicios remotos son la autoridad del flujo actual; no se inspeccionó el journal de usuario ni se construyeron estas clases durante la auditoría. La dirección de desarrollo declarada es loopback 127.0.0.1:3000; «remoto» aquí significa dependencia de HTTP, no evidencia de un servidor externo activo.

`MenuPrincipal._Ready` conecta Pressed de BotonJugar, BotonEstadisticas y BotonSalir. Jugar, si no hay sesión, abre `scenes/auth/login.tscn`; con sesión llama EntryAccessController.RequestAsync y después abre `scenes/auth/recuperacion_partida.tscn`, salvo cancelación o necesidad de login. No entra directamente a EscenaNiveles aunque esté exportada. EscenaIntroduccion no se usa en Jugar; no se encontró una introducción obligatoria en este recorrido. Estadísticas está deshabilitado si su escena no está asignada; en el menú inspeccionado no está asignada. `scripts/Estadisticas.cs` es el HUD de recursos, no una pantalla de estadísticas globales.

El nombre se solicita actualmente en `RegisterScreen`, nodo `Center/Board/Margin/Form/Username` de `scenes/auth/register.tscn`; se envía con correo/contraseña mediante AuthFormController. Login usa Email y Password desde AuthScreenBase. No existe en ese recorrido una pantalla que solicite únicamente nombre local. La validación remota de username (3–32, minúsculas, ASCII/guion bajo) no debe convertirse en la validación de DisplayName local Unicode. No se han añadido ni alterado campos de interfaz.

`EntryFlowCoordinator.RecoverCore` exige sesión, consulta MeAsync y Games.CreateOrGetAsync. GameService consulta partida actual y crea por POST solo ante el 404 reconocido de ausencia de partida. No existe una intención independiente de nueva partida en el botón Jugar. RecoveryScreen._Ready reutiliza resultado sin HTTP automático; Retry recupera o concilia explícitamente. Continue abre menu_niveles por BiomeMenuAccessGate o Final.tscn si hay final confirmado. Render bloquea continuar sin confirmación. Ese es un lugar existente para presentar continuar; la propuesta local principal es mostrar también la opción junto a nueva partida en MenuPrincipal, solamente si existe partida activa válida.

MenuNiveles permanece invisible/deshabilitado hasta admisión remota. TarjetaNivel consume BiomeCardController, crea un plan asociado a partida/revisión y aplica el ambiente antes de navegar al segmento animal. La ruta posterior es decisión humana → información → animal → llegada a FinNivel → confirmación → recuperación/selección o final. Pausa/GameOver también llaman AnimalSegmentFlow para reinicios y regresan a recuperación; deben incluirse para evitar dependencias HTTP indirectas.

## Dependencias HTTP y transición gradual

| Clase / operación observada | Método y ruta | Papel actual / sustitución futura |
|---|---|---|
| AuthService | POST /api/v1/auth/register, POST /api/v1/auth/login, GET /api/v1/auth/me | Credenciales/sesión y validación de entrada; reemplazar como requisito de jugar por perfil SQLite, sin borrar estos servicios. |
| GameService | GET /api/v1/me/games/current; POST /api/v1/me/games | Recuperar/crear partida actual; GetActiveGameAsync y CreateNewGameAsync por intención explícita. |
| EnvironmentalDecisionService | POST /api/v1/me/games/{id}/decisions; recuperación GET current | Confirmar elección antes de navegar; RecordDecisionAsync local y lectura del agregado confirmado. |
| AnimalProgressService | POST /api/v1/me/games/{id}/animal-completions o animal-restarts; GET current | Bloquea juego hasta recibo y estado verificados; completion local y diseño separado de reinicio/checkpoint. |
| EndingService | POST /api/v1/me/games/{id}/final-exit; GET current | Confirma salida/sucesora remota; no copiar esta creación automática a local sin contrato aprobado. |
| ConnectivitySupervisor | GET /api/health | Verifica backend y condiciona operaciones; nunca debe bloquear el modo local. |

Sin backend accesible, login/recuperación no confirman acceso; las operaciones ambientales/animales permanecen pendientes y el juego puede quedar pausado por el modal. Tener token o caché no equivale a acceso offline. No se ensayó desconexión ni se enviaron solicitudes; conclusión por lectura de gates y manejadores de fallo.

Para futuras estadísticas se conserva el código de transporte/autenticación y los eventos identificables de partida, decisiones y completados como posibles insumos de sincronización. No se identificó un endpoint dedicado de estadísticas en el recorrido; ninguna llamada concreta se declara obligatoria ni se inventa un endpoint. Subir estadísticas, cuenta técnica, credenciales invisibles y outbox requieren fase/contrato posteriores. Un fallo remoto no debe invalidar el commit SQLite ni iniciar login en modo local.

Transición propuesta: (1) componer contexto local y menú/perfil/partida con proyección separada, sin construir journal/conectividad como requisito local; (2) selección y decisiones; (3) completion y reinicios; (4) captura/restauración; (5) conexión de finales solo después de resolver el evaluador. Cada bloque necesita autorización concreta y pruebas. Conservar el código remoto separado; no mezclar UUID locales con IDs remotos de 24 hexadecimales ni forzar validadores de GameStateStore sobre el agregado local.

## Contrato de llamadas futuras

Las siguientes son APIs existentes de `integration/sqlite/GamePersistenceAdapter.cs`; no se invocaron. Clases Context/State/ProfileView/Checkpoint mencionadas abajo son propuestas, todavía inexistentes. Las operaciones se serializan en el adaptador; ningún Node ni acceso UI debe cruzar al worker. Tras cada await, verificar escena viva, generación local, dueño, partida y revisión antes de proyectar.

| Evento | Secuencia y condición de aceptación |
|---|---|
| Inicio | OpenAsync(StoragePath) solo después de autorización runtime/ruta; GetLocalProfileAsync y GetActiveGameAsync(owner). Si falta perfil, pedir nombre; PrepareProfileCreation una vez y CreateLocalProfileAsync con esa misma solicitud al reintentar. Un error no es ausencia: no recrear ni adoptar una base. Actualizar nombre con UpdateDisplayNameAsync y revisión de perfil sin cambiar LocalPlayerId. |
| Nueva partida | Intención explícita; PrepareNewGame(owner, current) una vez y CreateNewGameAsync. Se inicializan los cinco human_pending disponibles libremente. Se archiva la anterior sin borrar historial, UUID nuevo, ambiente sin heredar, control ExpectedCurrentGameId/Revision. Error conserva partida anterior. |
| Selección | GetGameProgressAsync/GetBiomeAccessAsync; completed rechaza humano, animal y repetición; desconocido deniega. EnterBiomeAsync(EnterBiomeCommand) con OperationId, LocalPlayerId, GameId, ExpectedRevision, BiomeId, Perspective validada. Solo navegar tras recibo y estado vigente. La selección libre actual de dominio no depende de RF-021 secuencial histórico. |
| Decisión confirmada | RecordDecisionAsync(RecordDecisionCommand): UUID de operación y de decisión, owner/game/revisión, BiomeId, DecisionKey, OptionId, ResolvedEnvironment, ConsequencesJson y clasificación opcional solo si ya resuelta por regla confiable/versionada. Persistir decisión, ambiente, punto decision_info, revisión y recibo atómicamente. El estado es animal_pending, no completed. |
| Fin físico | Validar contexto de FinNivel descrito en el mapeo. CompleteBiomeAsync(CompleteBiomeCommand) con UUID estable, owner/game/revisión/bioma y ConfirmedResult coherente con ambiente confirmado. Tras commit, releer agregado/progreso, bloquear ambas perspectivas y actualizar selección. Nunca completar por botón de decisión, _Ready, muerte o cambio de escena. |
| Continuar | LoadGameAsync/GetActiveGameAsync entrega GameAggregate y snapshot; proyectar ambiente del bioma antes de instanciar, validar ResumeKind/CheckpointKey y versión. Restaurar lectura sin RecordDecision ni CompleteBiome. Recursos requieren contrato nuevo: el snapshot boundary actual NO los contiene. No prometer restauración de vida/agua/comida ya soportada. |
| Cinco completos | AreAllCanonicalBiomesCompletedAsync(owner,game) es consulta, no selecciona final ni cambia estado de partida. Solo habilita el puente futuro al evaluador existente una vez localizado. Persistir resultado/versiones/entradas antes de mostrar Final. No usar mayoría, umbral ni fórmula nueva. |

Errores de SQLite deben producir estado visible de guardado pendiente/fallido, con reintento del mismo comando inmutable. Tras conflicto, releer: no cambiar ExpectedRevision dentro del mismo OperationId ni inventar una operación repetida. Un commit confirmado y una navegación fallida son estados distintos: repetir navegación desde lectura/recibo, no volver a aplicar consecuencias. Al cerrar durante una operación, drenar/cerrar con resultado controlado; al reabrir, recuperar estado durable antes de decidir si la intención ocurrió. La persistencia de intenciones no confirmadas tras cierre requiere diseño explícito, no reutilización silenciosa del journal HTTP.

## Recursos y fronteras reconstruibles

Los cinco actores poseen `public int CurrentHealth { get; private set; }`, MaxHealth exportado int por defecto 3, inicializado en _Ready. Hurtbox.ReceivedDamage deriva a OnReceivedDamage; mono también expone RecibirDanio. Disminuyen vida y pueden llamar Die/GameOver. ZonaMuerte muestra derrota diferida; no completa bioma. SetSalud del HUD NO cambia la vida del actor.

`Estadisticas.Agua` y `.Comida` son float con setter privado; _Ready inicializa desde AguaMax/ComidaMax (100 por defecto). _Process consume DrenajeAgua 2.5 y DrenajeComida 2.0 por tiempo, multiplicado por 0.6/1.6 según BiomaSaludable, sujeto a ActivarAgua/ActivarComida. Recuperar recibe ItemRecurso y suma fracción unidades/RecursosParaLlenar (3), limitada al máximo. Estos valores se documentan, no se cambian. PlayerDelfin tiene ActivarAgua=false en su escena; no inferir que deba hidratarse como recurso activo. Los otros cuatro no sobrescriben esos flags en sus escenas de personaje.

Captura futura en main thread: identidad del actor/bioma/etapa, CurrentHealth/MaxHealth, Agua/AguaMax, Comida/ComidaMax, flags efectivos, versión de contenido y frontera/revisión asociada. Restauración explícita validada después de _Ready y antes de habilitar procesamiento/input/consumo, actualizando HUD directamente sin daño, pickups ni Recuperar simulados. El cambio humano→animal crea otro actor: capturar su primera frontera ya inicializada; no trasladar recursos de un personaje al siguiente. Al continuar, aplicar el último checkpoint compatible confirmado, sin recargar máximos silenciosamente. Valores no finitos/fuera de rango o versión desconocida deben fallar visiblemente.

`TipoRecurso.Calor` existe como enum pero Recuperar solo maneja Agua/Comida: no se encontró barra/valor funcional de calor. Velocidad es derivada de los recursos; timers de daño/invulnerabilidad, Velocity, posición, fuentes agotadas (`FuenteRecurso._dropeados`) y drops/recogidos son mundo transitorio, no recursos actualmente persistidos. No capturar una vida tardía y reconstruir un mundo inicial con fuentes regeneradas: permitiría duplicación. El alcance propuesto es frontera de entrada reconstruible; guardar a mitad exacta requiere otro inventario y autorización. Payload boundary v1 actual no puede reinterpretarse como snapshot de recursos; diseñar versión nueva y APIs, sin migraciones por suposición.

## Finales: evidencia y bloqueo acotado

Se mantiene el hecho confirmado por el usuario: la demo presenta Bueno, Medio y Malo según decisiones. La inspección de scripts/scenes/assets y backend/src no localizó con certeza el método que calcula sus umbrales. No se consultó original ni servidor para suplirlo. Ruta visible: respuesta AnimalProgressService + GET current → GameStateStore verificado (`final_pending`, cinco completed, Ending/GoodBiomeCount/EndingRulesVersion) → EndingService.ConfirmedEnding → AnimalSegmentFlow o RecoveryScreen → `scenes/levels/Final.tscn` → Final._Ready. Final convierte good/medium/bad a TipoFinal y textos; no calcula puntuación.

GameStateStore.Valid comprueba que GoodBiomeCount coincide con contar resultados good y que la versión coincide con RulesVersion. Esa comprobación NO es la fórmula de tres finales. VariablesGlobales contiene BiomaSaludable y un diccionario NoJugado/Bueno/Malo, sin acumulador que demuestre una fórmula. Backend/src reconstruido no contiene el evaluador buscado. EndingService.ExitAsync confirma salida HTTP y sucesora; tampoco calcula final.

Preservar sin reinterpretación las decisiones ordenadas/IDs/opciones/clasificación existente, consecuencias/ambiente por bioma, resultados y fechas completadas, RulesVersion/ContentVersion, y cuando haya evaluación auténtica, Ending/EndingRulesVersion/CompletedAt y entradas/contadores requeridos. SavedGame ya tiene campos de final, pero faltan una operación validada de finalización y soporte de lectura/escritura adecuado para todo ese flujo; GoodBiomeCount del DTO remoto no es un campo actual de SavedGame. No anunciar guardado de finales funcional. Antes del puente se necesita ubicar el cálculo existente o recibir su código/regla verificable, fijar fixtures de los tres resultados y diseñar persistencia compatible. El bloqueo no obliga a cambiar escenas ni a inventar umbrales.

## Inventario exacto para futuras autorizaciones

Cada ruta es individual. Nada de esta tabla autoriza cambios ahora. Casos Rxx se definen en GODOT_RUNTIME_TEST_PLAN.md. Las fases pueden aprobar subconjuntos; no implementar todo junto por existir este inventario.

| Grupo / ruta | Clase y responsabilidad / modificación mínima | Dependencias, riesgo y pruebas |
|---|---|---|
| Menú: scripts/network/GameApplicationContext.cs | GameApplicationContext: componer contexto local y liberarlo; aislar creación de gates/journal/overlay remotos en la ruta local. | Un único Autoload; no borrar journal remoto. R01,R19,R20. |
| Menú: integration/sqlite/GamePersistenceContext.cs (nuevo propuesto) | Propietario de GamePersistenceAdapter y generación local; ciclo de apertura/cierre y fallos. | Ruta de juego autorizada, no infraestructura ni producción. R01,R12,R20. |
| Menú: integration/sqlite/LocalProfileView.cs (nuevo propuesto) | Vista de nombre visible, creada desde menú, sin email/password. | Perfil Unicode estable; R02. |
| Menú: scripts/MenuPrincipal.cs | MenuPrincipal: nombre, nueva partida y continuar como intenciones locales. | Contexto/proyección y confirmación para archivar anterior; R01–R04,R18. |
| Menú: scripts/auth/RecoveryScreen.cs | RecoveryScreen: rama local de continuar/error sin sesión HTTP. | No aplicar render/gate remoto indirectamente; R04,R19,R20. |
| Selección/restauración: integration/sqlite/LocalGameState.cs (nuevo propuesto) | Proyección de agregado, generación y plan de entrada desde lectura confirmada. | No adaptar UUID a validación remota; R05,R09,R12,R13. |
| Selección: scripts/MenuNiveles.cs | MenuNiveles: admisión local y refresh. | FreeBiomeAvailabilityPolicy, no orden nuevo; R05,R09–R11. |
| Selección: scripts/TarjetaNivel.cs | TarjetaNivel: selección/EnterBiome local y transición validada. | Cola, revisión, doble clic, Transicion sin modificar; R05,R09,R10. |
| Decisiones: scripts/DecisionSceneFlow.cs | DecisionSceneFlow: sustituir confirmación remota por contrato local y recibo. | Todos los cinco llaman aquí; preservar bool true=No/reject, datos ambientales aún por fijar; R06,R07,R13,R20. |
| FinNivel: scripts/FinNivel.cs | FinNivel: conservar señal física; delegación local y guard válido, retirar gate remoto solo en modo local. | Escena/actor/etapa y commit antes de bloqueo; R08–R10,R20. |
| FinNivel/reinicio: scripts/AnimalSegmentFlow.cs | AnimalSegmentFlow: confirmación local, reintento y navegación tras commit. | Muerte/voluntary nunca completion; falta contrato de recursos/reinicio; R08,R12,R20. |
| Recursos: scripts/PlayerDelfin.cs | PlayerDelfin: API explícita de captura/hidratación de CurrentHealth después de Ready. | Movimiento/daño intactos; agua inactiva; R14. |
| Recursos: scripts/PlayerMono.cs | PlayerMono: misma API, sin invocar RecibirDanio al cargar. | HUD/vida coherentes; R14. |
| Recursos: scripts/PlayerRataCanguro.cs | PlayerRataCanguro: captura/hidratación de vida validada. | Sin cambiar salto/física; R14. |
| Recursos: scripts/PlayerZorro.cs | PlayerZorro: captura/hidratación de vida validada. | Sin cambiar animación/daño; R14. |
| Recursos: scripts/PlayerOso.cs | PlayerOso: captura/hidratación de vida validada. | Actor de tundra, sin cambiar física; R14. |
| Recursos: scripts/Estadisticas.cs | Estadisticas: captura/hidratación directa Agua/Comida y HUD, sin Recup. simulada. | No alterar consumo/flags/derivados; R14. |
| Restauración: integration/sqlite/PlayerCheckpointAdapter.cs (nuevo propuesto) | Orquestar Ready suspendido, captura y aplicación del checkpoint versionado. | Main thread, mundo reconstruible; R12–R14,R20. |
| Restauración: scripts/InfoDecision.cs | InfoDecision: preparar ambiente/actor/frontera antes de habilitar animal. | Textos/tweens/destinos intactos; R07,R13,R14. |
| Restauración: assets/sprites/ui/MenuPausa.cs | MenuPausa: ruta local de reinicio voluntary y salida coherente. | Última frontera, no recursos gratis; R12,R14,R19. |
| Restauración: assets/sprites/ui/GameOver.cs | GameOver: reintento death y recuperación local. | Derrota no confirma completion/final global; R08,R12,R14. |
| Finales: scripts/Final.cs | Final: leer/presentar resultado local confirmado; salida por intención explícita. | Bloqueado por evaluador; mismos tres textos/condiciones; R15–R17. |
| Puente: integration/sqlite/GamePersistenceAdapter.cs | GamePersistenceAdapter: añadir solo métodos para nuevo checkpoint/final si contratos aprobados. | Preservar API actual/cola/recibos; R13–R17,R20. |
| Catálogo: integration/sqlite/RealGameCatalog.cs | RealGameCatalog: enlazar escenas/versiones reales y regla ambiental confiable ya verificada. | No convertir initial-state-only-1 en regla de finales; R05–R07,R15–R17. |
| Dominio: local-persistence/src/Models.cs.txt | DTO de captura/continuación/final versionados, solo tras diseño específico. | No Node ni IDs remotos; R12–R17. |
| Dominio: local-persistence/src/Validation.cs.txt | Validar snapshot nuevo y compatibilidad/final auténtico. | Boundary1 conserva significado; R13–R17,R20. |
| Dominio: local-persistence/src/GameSaveService.cs.txt | Operaciones atómicas de captura/reinicio/final, sin fórmula nueva. | completed terminal, retry/rollback; R08–R18,R20. |
| Dominio: local-persistence/src/SQLiteRepository.cs.txt | Persistencia de campos de final/fecha si diseño lo requiere. | SQL parametrizado/transacción; R15–R17,R20. |

Reutilizar GameRulePolicy/FreeBiomeAvailabilityPolicy, UnitOfWork, SchemaManager y proveedores sin cambios demostrados. No tocar TwoSides.csproj/project.godot/.tscn, VariablesGlobales, Bioma*.cs, DecisionNivel, EnvironmentalDecisionNivel, OceanDecisionNivel ni DesicionNieve para la ruta mínima que conserva callbacks. Mantener intactas las clases remotas Entry/Progress/Services; la autoridad local se separa en composición y consumidores. Captura de mundo intermedio, DDL o cambios en esos archivos requieren otro inventario justificado. Las pruebas futuras podrán ampliar `local-persistence/game-save-tests/GameSaveChecks.cs.txt` (incluye la clase BiomeProgressChecks; no existe un archivo independiente con ese nombre) y crear un archivo de pruebas runtime puro con ruta aprobada antes de implementarlo; no ejecutarlas sobre bases protegidas.

## Validación, riesgos y recomendación

Esta fase solo usa lectura de fuentes/escenas, búsquedas estáticas y hashes/metadatos; no compila ni ejecuta tests o Godot. 42 progreso + 43 SQLite + 39 backend = 124 y compilación 0 errores/63 advertencias son resultados históricos de la fase anterior, NO revalidados aquí. El plan de pruebas separa lo automatizable de la interacción manual.

Riesgos pendientes: evaluador de finales no localizado; resolución local de consecuencias debe cotejarse con comportamiento existente antes de quitar HTTP; snapshot actual sin recursos; gates remotos en rutas secundarias; vida/HUD inicializados en Ready; identidad local diferente de sesión remota; fallos commit/navegación; B00 conserva riesgo ACL heredado adicional de Modify no resuelto. No se modifican ACL para cerrar esta preparación.

Recomendar próxima autorización limitada a composición local + perfil/nueva partida/continuar/selección, con fixtures aisladas y runtime explícitamente autorizado cuando corresponda. No declarar jugabilidad offline completa hasta retirar todos los requisitos remotos del recorrido aprobado. Recursos y finales mantienen sus requisitos previos concretos. Detenerse aquí, sin integración funcional ni B05.


## B04.2B.2B.2C.2A — Perfil y partidas en menú local (2026-10-25)

Estado: **implementación y validación automatizada terminadas; PENDIENTE DE VALIDACIÓN RUNTIME (EN_PROCESO)**. No se ejecutaron editor ni videojuego. Esta actualización sustituye las propuestas de C.1 únicamente para composición/perfil/partidas/admisión a selección; decisiones desde escenas, FinNivel, recursos y finales siguen sin conectar. No se inició B05.

Ampliación expresa aprobada en esta conversación: base nueva y separada `local-persistence/.work/runtime-game/save.sqlite3` y cambios mínimos en `local-persistence/src/CopyGameDatabase.cs.txt` y `OwnedCopyDatabase.cs.txt`. Las rutas AppData game-progress y persistence permanecen protegidas; ninguna se abre desde el modo runtime. No se importan las cuatro partidas ficticias ni se copian sus perfiles. El almacén runtime aún NO se ha creado/abierto durante esta validación; se inicializará al primer inicio manual. Su ubicación dentro de .work es duradera para este flujo y no debe borrarse como caché.

GameApplicationContext._Ready compone un único GamePersistenceContext hijo del Autoload existente. No crea ApiClient, journal user://, servicios de autenticación, ConnectivityOverlay ni OceanDecisionContext en el inicio local. El código HTTP se conserva en una rutina privada no invocada, pendiente de sincronización futura; Services remoto no está inicializado en este modo. No hay cuenta técnica, tokens, correo ni contraseñas nuevos. VariablesGlobales y ambiente permanecen intactos.

LocalGameState usa un puerto ILocalMenuStore implementado por GamePersistenceAdapter. Inicialización coalescida, apertura serial en worker, perfil/partida/revisión y resultados controlados, sin Node en el worker. Solo crea perfil por intención de guardar nombre y partida por intención de nueva partida; volver al menú o reiniciar la proyección no genera registros. UUID/op/payload se conservan durante reintento; fallo de lectura no equivale a ausencia. No hay sustitución volátil ni fallback HTTP.

MenuPrincipal crea LocalProfileView desde código porque la escena existente no tiene nombre ni Continuar. Se reutiliza su contenedor y se oculta el botón de textura ambiguo; la vista aprobada muestra guardar nombre, nueva partida y continuar según estado. No se modifica .tscn. Nombre NFC validado por servicio; perfil existente se recupera, no se vuelve a solicitar. No existe función de renombrar en el menú: no se añadió; UpdateDisplayName previo conserva su contrato y pruebas.

Nueva partida relee la actual y utiliza PrepareNewGame/CreateNewGameAsync con ExpectedCurrentGameId/Revision; confirma en diálogo si hay una activa, archiva sin borrar e inicializa cinco biomas disponibles libremente. No muestra éxito hasta commit y relectura. Reintentar respuesta perdida recupera recibo sin duplicar. Continuar relee SQLite y solo admite la frontera de menú v1 reconstruible de una partida current/in_progress con owner/revisión coherentes. Una frontera de segmento que necesita restauración no implementada se bloquea con mensaje y no se reinicia. Navegación fallida conserva el commit y permite reintentar Continuar.

MenuNiveles admite el ticket local y muestra selección existente + aviso y volver al menú. TarjetaNivel no se modifica: al no existir controller remoto en modo local, las tarjetas permanecen deshabilitadas como límite de esta subfase, NO como una política de disponibilidad persistida. Los cinco siguen disponibles en dominio/SQLite; el aviso explica que la entrada a biomas se conectará después. No se permite entrar a escenas cuyas decisiones todavía exigen el flujo remoto. El juego completo offline aún no está implementado ni validado. Conectar tarjetas/controlador a escenas corresponde a la siguiente autorización, B04.2B.2C.2B según la solicitud.

Proveedor runtime: ruta exacta cerrada, purpose copy-runtime-game, application_id 0x54535254, manifest con identidad de archivo/Ready y lease existentes, esquema existente sin DDL nuevo. Se reutilizan comprobaciones de propiedad/final-path/reparse/hardlink; desconocidos fallan sin adoptar ni migrar. La capacidad runtime se ancla en la raíz exacta local-persistence, validando su handle y cada descendiente. Sus ancestros OneDrive/Desktop tienen metadatos reparse de nube observados; no se relajan las comprobaciones de archivos/raíz/descendientes ni el modo AppData legado. Verificación de apertura duradera y comportamiento del motor queda pendiente de la prueba manual; no se afirma que las fixtures temporales validen ese montaje real.

Resultados efectivos finales: **26 pruebas nuevas de menú + 42 progreso + 43 SQLite + 39 backend = 150 aprobadas, 0 fallidas** (sin sumar repeticiones). Las 26 usan coordinador real + servicio/UoW/repositorio/SQLite real en SyntheticSandbox y puerto de almacenamiento de fixture, con fallos inyectados; comprueban también que el adaptador runtime real rechaza la ruta protegida ANTES de acceso. No ejecutan nodos/UI/Godot ni crean datos en la base runtime. Reinicio del menú se prueba con nuevas instancias del coordinador sobre fixture; no se presenta como reinicio real del motor. Las regresiones de progreso incluyen comprobación de lectura en proceso hijo sobre fixture.

Biblioteca y ejecutores: 0 errores/0 advertencias. Godot C#: compilación correcta, 0 errores, 63 advertencias preexistentes ParallaxBackground en compilación de scripts, 0 nuevas atribuibles a esta fase; build final de scripts 63 advertencias preexistentes y 0 nuevas (un build incremental anterior emitió 0). MSBuild: 86 Compile items, 1 referencia a la biblioteca y 0 fuentes filtradas desde local-persistence o integration/sqlite/.work. .NET de pruebas 8.0.30, SQLite 3.53.3, paquetes/esquema/csproj del juego sin cambios. Entorno/build privados mediante preámbulo de run-infrastructure y GodotProjectDir a integration/sqlite/.work/.godot/mono/temp; sin editor/export/configuración global.

Verificación: **1,506 archivos existentes protegidos** fuera del inventario de cambios comparados por tamaño/hash/fecha, ambos almacenes protegidos con sus seis archivos (DB/manifiesto/lease) intactos. Cuatro partidas conservadas por identidad binaria de game-progress, sin consultas SQL. .env 278 bytes, SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, fecha/atributos/propietario/ACL iguales; no se leyeron valores. B00 sigue BLOQUEADA por riesgo ACL heredado Modify, sin cambios de permisos. Cero bases sintéticas temporales restantes.

Próximo paso: pruebas manuales acotadas abajo, y después autorización explícita de integración de tarjetas/biomas. No conectar decisiones, FinNivel, recursos o finales por extensión de esta entrega.


### Inventario ejecutado: doce archivos de código/pruebas y siete documentos

| Archivo | Cambio |
|---|---|
| scripts/network/GameApplicationContext.cs | Bootstrap local único; conserva composición remota sin invocarla. |
| scripts/MenuPrincipal.cs | Perfil/nueva/continuar por SQLite, diálogo de archivado, errores y navegación. |
| scripts/MenuNiveles.cs | Admisión local, aviso de alcance y retorno a menú; no entra a biomas. |
| integration/sqlite/GamePersistenceContext.cs (nuevo) | Vida del coordinador/adaptador por aplicación; inicialización/cierre. |
| integration/sqlite/LocalGameState.cs (nuevo) | Puerto ILocalMenuStore, proyección autoritativa, comandos pendientes y ticket de selección. |
| integration/sqlite/LocalProfileView.cs (nuevo) | Controles locales creados en el contenedor existente, sin escena nueva ni credenciales. |
| integration/sqlite/GamePersistenceAdapter.cs | Implementa puerto de menú y modo runtime separado, conserva API legado. |
| local-persistence/src/CopyGameDatabase.cs.txt | Nueva ruta fija runtime y apertura explícita distinta de AppData. |
| local-persistence/src/OwnedCopyDatabase.cs.txt | Propósito/application_id/anchor runtime, conserva modos legados y seguridad de archivos. |
| local-persistence/game-save-tests/GameSave.Checks.csproj | Incluye fuente pura LocalGameState para pruebas sin motor. |
| local-persistence/game-save-tests/GameSaveChecks.cs.txt | Despacho --runtime-menu; suites anteriores conservadas. |
| local-persistence/game-save-tests/RuntimeMenuChecks.cs.txt (nuevo) | 26 comprobaciones de coordinador/SQLite/fallos sobre fixtures nuevas. |

Documentos actualizados exactamente: backend/docs/GODOT_RUNTIME_INTEGRATION_PLAN.md, GODOT_SCENE_EVENT_MAPPING.md, GODOT_RUNTIME_TEST_PLAN.md, PHASES.md, PHASE_HISTORY.md, DECISIONS.md y local-persistence/README.md. SAVE_INTEGRATION_CHANGE_PLAN.md y otros documentos quedan sin modificar. Ninguna escena, TwoSides.csproj, project.godot, esquema, script ambiental, decisión, FinNivel, Final, personaje o NPC cambia en esta fase.


### Guía manual pendiente (solo copia de pruebas)

1. Abrir la copia con Godot C# y compilar desde el flujo habitual del editor bajo control del usuario; no exportar ni cambiar configuración global. La compilación automatizada fue aislada y no implica que la caché habitual .godot contenga la nueva DLL.
2. Sin iniciar el backend y sin internet disponible para el juego, ejecutar la escena inicial. Esperado: vista local sin correo/contraseña ni pantalla de login; primera apertura crea exclusivamente el nuevo almacén runtime autorizado. Si falla el almacenamiento, mostrar error y detener operación; no borrar base ni modificar ACL para forzarla.
3. Introducir solo nombre visible y guardar. Debe aparecer el nombre persistido; no debe existir partida hasta pulsar Nueva partida.
4. Pulsar Nueva partida: tras confirmación de SQLite se abre la selección existente con aviso de integración de biomas pendiente. Las tarjetas no abren niveles en esta subfase; no probar decisiones ni FinNivel.
5. Volver al menú: aparece Continuar y no se pide nuevamente el nombre. Continuar recupera la misma partida y abre selección sin crear otra.
6. Cerrar/reabrir el juego: mismo perfil/nombre/partida. Crear otra partida solo por intención explícita y confirmar archivado; verificar conservación del historial mediante lectura local autorizada futura, sin abrir ni escribir las dos bases protegidas.
7. Si aparece guardado pendiente/fallo de navegación, reintentar la MISMA operación; no repetir Nueva partida como sustituto de Continuar. Un punto de segmento no soportado debe mostrar limitación sin reiniciar sus recursos/progreso.

Registrar capturas de menú, nombre, selección/aviso, vuelta y reapertura, sin secretos. Los puntos visuales/layout, apertura nativa duradera bajo OneDrive, señales, cierre del motor y persistencia real entre procesos Godot permanecen **PENDIENTES DE VALIDACIÓN RUNTIME**. No ejecutar automáticamente esta guía desde Codex.


## B04.2B.2B.2C.2A.1 — Menú compacto y partida única (2026-10-26)

**Código COMPLETADO; PENDIENTE DE VALIDACIÓN RUNTIME del diseño y botones.** Esta decisión del usuario sustituye expresamente la política anterior que permitía archivar/reemplazar una partida incompleta por una intención de Nueva partida. Las descripciones anteriores se conservan como historia, no como regla vigente.

El usuario confirmó por prueba manual de C.2A: inicio sin Node.js, nombre visible sin credenciales, creación/continuación de partida, persistencia del perfil tras reinicio y ausencia de errores SQLite observados. Esa confirmación no valida el layout ni la restricción añadidos aquí. No se ejecutó Godot/editor/exportación durante C.2A.1.

### Diagnóstico y corrección visual

Centro era un CenterContainer con anchor_left=0.23, top=0.41, right=0.48, bottom=0.61 y offsets right=190/bottom=151. En el viewport lógico 640×360 su región comenzaba en y=147.6 y acababa en y=370.6, ya fuera del límite inferior incluso antes del crecimiento mínimo de los controles. La nueva vista de perfil y acciones aumentó ese mínimo; márgenes interiores de25 y mensajes largos agravaban el recorte.

Se conservan la escena, fondo, título dibujado TWO SIDES, imágenes, texturas y StyleBoxTexture originales. Centro ahora usa anclajes completos y márgenes exteriores x=8, superior72/inferior8 para reservar el título; el contenedor resuelve centrado del tablero sin los antiguos offsets de colocación parcial. Margen pasa a12 horizontal/8 vertical; Contenido usa separación6. LocalProfileView aplica fuente12 a sus controles,11 al estado, separación4 y ancho mínimo260 para envolver mensajes. El nombre permanece visible también ante mensajes transitorios. No se añadió contenedor ni pantalla, no se escaló/reemplazó ningún sprite ni se cambió project.godot o la resolución.

Revisión **ESTÁTICA**, no medición del motor: región disponible de Centro x8/y72/ancho624/alto280 en640×360 → x16/y144/ancho1248/alto560 a1280×720, borde inferior704 dentro de720. El tamaño mínimo final de panel/controles y la ausencia de recortes/solapamientos reales requieren prueba manual; no se presentan como pruebas visuales aprobadas.

### Política transaccional y comportamiento

GameSaveService.HasUnfinishedGames consulta todo el historial del perfil mediante COUNT, sin paginación que pueda omitir un registro antiguo. En CreateNewGame se repite la comprobación dentro de UnitOfWork.Write/BEGIN IMMEDIATE, después de validar propietario y antes de insertar. Devuelve **GAME_IN_PROGRESS** si hay cualquier partida no cerrada. Se retiró el bloque que archivaba automáticamente la actual. No se alteran tablas, migraciones, esquema ni partidas existentes.

Reconocimiento conservador de cierre: únicamente status=completed junto con Ending good/medium/bad, EndingRulesVersion no nula e igual a RulesVersion y CompletedAt no nulo. is_current para completed ya es0 por CHECK existente. Status archived NO demuestra cierre, incluso si no hay partida actual; status in_progress/final_pending bloquea siempre. Esos campos son el contrato del futuro escritor confiable, no prueba criptográfica del origen de un archivo manipulado. No se los asigna en producción desde esta fase, no se agrega endpoint/cierre y no se reconoce un final por mayoría, consulta de biomas o apertura de menú.

El recibo idempotente existente sigue consultándose antes de ejecutar una intención nueva: mismo OperationId/digest recupera su resultado confirmado; no autoriza una segunda partida. UUID distintos concurrentes tienen un solo ganador. Un conflicto nuevo no convierte un error en éxito; el coordinador descarta esa intención rechazada y relee el estado, mientras los errores de resultado incierto conservan la intención para retry.

GamePersistenceAdapter expone HasUnfinishedGamesAsync. LocalGameState consulta la política desde SQLite y expone CanStartNewGame; LocalProfileView deshabilita Nueva partida si existe una sin cerrar. MenuPrincipal elimina el diálogo de reemplazo y rechaza esa acción con mensaje breve. Perfil y partida mantienen identidad al renombrar; no se añade interfaz de renombrado.

| Estado persistido | Nueva partida | Continuar |
|---|---|---|
| Perfil válido, sin partidas sin finalizar | Habilitada | No disponible si no hay activa |
| Activa in_progress en frontera de menú compatible | Bloqueada | Habilitada para la misma partida |
| Archivada sin cierre, sin actual | Bloqueada | No disponible; mensaje de partida sin finalizar, sin reparar historial |
| Solo historial completed con metadatos de cierre válidos | Habilitada | No disponible |
| Error SQLite/política no confirmada | Bloqueada | No se inventa progreso ni fallback |
| Activa que requiere restauración aún no soportada | Bloqueada | Transición limitada con mensaje; no reset de recursos |

Si la base manual tiene históricos incompletos de la política anterior, también bloquearán nuevas creaciones. No se consultó su contenido ni se migró/corrigió/borró nada para resolver ese caso.

### Contrato futuro de finalización global, sin implementarlo

Cinco biomas completos es una precondición del flujo de final, no una orden de cerrar. El coordinador futuro deberá validar partida/dueño/revisión, los cinco completed, evaluador existente y versiones, y resultado auténtico Bueno/Medio/Malo; preparar/persistir final pendiente sin habilitar Nueva partida. Tras el evento real de presentación/confirmación del resultado, una operación idempotente y transaccional aún por diseñar confirmará status=completed, is_current=0, Ending/EndingRulesVersion/CompletedAt, revisión/snapshot coherentes y recibo. Solo entonces HasUnfinishedGames podrá permitir otra, si no quedan históricos sin cerrar. Fallo de escritura no cierra; reapertura no repite efectos. No se ha identificado/validado aquí ese evento ni se modificaron fórmulas, Final.cs, FinNivel o escenas finales. AreAllCanonicalBiomesCompleted sigue siendo solo consulta.

### Pruebas y compilación efectivas

**35 menú/política +42 progreso/decisiones +43 SQLite =120 comprobaciones C# aprobadas,0 fallidas.** No sumar repeticiones. Incluyen primera creación, persistencia de nombre/perfil, Nueva/Continuar, rechazo directo del servicio, historial archivado incompleto sin actual, estado terminal de fixture que permite otra, misma intención concurrente, intenciones distintas concurrentes, nuevo proceso de lectura que conserva bloqueo, renombrado y fallo SQLite/rollback/retry. El coordinador usa puerto de fixture con servicio/UoW/repositorio/SQLite reales; no son pruebas de nodos/UI Godot.

Las fixtures históricas que necesitaban una segunda partida se adaptaron a un registro terminal explícito creado SOLO en bases sintéticas propias. SeedTerminal es setup de pruebas por SQL, no API de cierre del producto, ni evidencia de que un final haya sido presentado. El caso de cinco biomas completos comprueba además que Nueva partida se sigue rechazando sin cierre. Se conserva la cobertura de idempotencia, decisiones, bloqueo por bioma y rollback; una prueba antigua de reemplazo se actualizó para exigir rechazo, conforme la regla nueva. El ejecutor duradero histórico sin argumentos quedó deshabilitado con mensaje/exit2 para evitar escrituras accidentales a AppData y expectativas de reemplazo obsoletas; usar --runtime-menu y --progress, nunca modificar las bases protegidas para adaptar pruebas.

Comandos: local-persistence/run-checks.ps1; dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore --disable-build-servers -nodeReuse:false y ejecutor --runtime-menu/--progress bajo entorno CLI/NuGet/TEMP privado; Godot C# con GodotProjectDir a integration/sqlite/.work/.godot/mono/temp. Biblioteca y ejecutores0errores/0advertencias; Godot C#0errores,63advertencias históricas ParallaxBackground,0nuevas en componentes afectados. .NET8.0.30/SQLite3.53.3 y paquetes sin cambios. Las39 pruebas backend son históricas de C.2A, no reejecutadas: Node.js no se inició en esta subfase.

### Integridad y pendientes

Se comparan antes/después **1,512 archivos existentes protegidos** fuera de los16 archivos autorizados de esta corrección, por hash/tamaño/fecha. Se protegen las TRES bases: dos AppData anteriores y la runtime manual, cada una con manifiesto y lease, nueve archivos totales. Solo hashes/metadatos; no se abrió SQLite ni se inspeccionó perfil/progreso manual. .env278bytes/SHA2564DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, fecha/atributos/propietario/ACL conservados. B00 sigue BLOQUEADA por riesgo ACL heredado Modify, sin cambiar permisos. Esquema, recursos gráficos, configuración global, mecánicas, decisiones, audio, biomas, tarjetas, jugadores, NPC y tres finales permanecen intactos. WASAPI/GetBufferSize/output_device invalidated se considera incidencia de audio separada; no se alteró código de audio ni se reprodujo mediante motor.

Prueba manual pendiente: compilar esta copia en Godot C# bajo control del usuario, abrir a1280×720 y revisar título/fondo/panel completo, nombre, mensajes y controles, también con nombre largo. Con la partida manual existente, Nueva partida debe estar deshabilitada; Continuar debe abrir la misma selección aún sin entrada a biomas. Volver/cerrar/reabrir debe mantener nombre y bloqueo, sin nueva partida ni pérdida de datos. No forzar un cierre ni limpiar la base para probar el estado terminal: esa condición solo está cubierta con fixture sintética hasta autorizar su implementación. No ejecutar automáticamente editor/videojuego.

Código completado, visual **PENDIENTE DE VALIDACIÓN RUNTIME**. Siguiente bloque recomendado: autorización específica de tarjetas/selección de los cinco biomas, manteniendo orden libre y controles de partida; no conectarlo ahora. Cierre global legítimo sigue pendiente de su evento real. Detenerse aquí, sin B05.


### Inventario exacto de cambios de C.2A.1

Nueve archivos de escena/código/pruebas:
- assets/sprites/ui/menu_principal.tscn — anclajes y márgenes/separaciones.
- scripts/MenuPrincipal.cs — eliminar reemplazo de partida y usar bloqueo/mensaje.
- integration/sqlite/LocalProfileView.cs — tamaños de texto/distribución, nombre visible y botón según política.
- integration/sqlite/LocalGameState.cs — consulta persistida y CanStartNewGame, tratamiento de conflictos.
- integration/sqlite/GamePersistenceAdapter.cs — HasUnfinishedGamesAsync, sin lógica paralela.
- local-persistence/src/GameSaveService.cs.txt — guard transaccional y consulta del historial completo.
- local-persistence/tests/Checks.cs.txt — rechazo de sustitución en regresión SQLite.
- local-persistence/game-save-tests/GameSaveChecks.cs.txt — fixtures históricas de progreso y despacho de probe; impedir runner duradero obsoleto.
- local-persistence/game-save-tests/RuntimeMenuChecks.cs.txt — nuevas aserciones, concurrencia y probe readonly en proceso hijo.

Siete documentos actualizados: backend/docs/GODOT_RUNTIME_INTEGRATION_PLAN.md, GODOT_RUNTIME_TEST_PLAN.md, REAL_GAME_SAVE_CONTRACT.md, DECISIONS.md, PHASES.md, PHASE_HISTORY.md y local-persistence/README.md. Sin archivos nuevos. GODOT_SCENE_EVENT_MAPPING.md y SAVE_INTEGRATION_CHANGE_PLAN.md se consultaron pero no se modificaron en esta fase. Las clases LocalGameState/LocalProfileView se tratan como adaptadores locales ya usados por el menú, expresamente necesarios para reflejar la política y distribuir los controles que generan; no se amplía a contexto/selección.


## B04.2B.2B.2C.2B — Selección local de los cinco biomas (2026-10-26)

**COMPLETADA EN CÓDIGO. Validación visual y del motor: PENDIENTE.** Reanudación expresamente autorizada tras comprobar que .env vuelve a coincidir con la referencia histórica, sin reemplazo realizado por Codex en esa última comprobación. La causa de las diferencias anteriores no se atribuye a ningún proceso. La referencia original no cambió. B00 mantiene su riesgo ACL independiente.

El usuario confirmó manualmente la fase anterior: menú completo a1280×720, Nueva partida bloqueada cuando hay activa, Continuar abre selección, bloqueo persistente al reiniciar y sin nuevos errores SQLite. Esa evidencia no se presenta como prueba de las tarjetas recién conectadas. No se ejecutó Godot/editor/exportación en esta fase.

### Causa y archivos exactos

La selección anterior había dejado deliberadamente las tarjetas sin controlador local. MenuNiveles detenía su procesamiento y mostraba aviso de integración pendiente; TarjetaNivel todavía consultaba BiomeCardController remoto, sin sesión/progreso remoto inicializados en modo local. Se elimina esa autoridad de la ruta de selección, no se elimina el código HTTP del proyecto.

Modificados exclusivamente:
1. scripts/MenuNiveles.cs — admisión local, refresh de disponibilidad, entrada asíncrona, mensajes, retorno y transición validada.
2. scripts/TarjetaNivel.cs — eventos existentes Pressed, identificación canónica, destino exportado validado, estados/texturas existentes y llamada local.
3. integration/sqlite/LocalGameState.cs — puerto ILocalBiomeStore y coordinador puro LocalBiomeSelection/DTOs en el archivo autorizado; acceso a selección desde fronteras v1 reconocidas.
4. integration/sqlite/GamePersistenceAdapter.cs — implementa ILocalBiomeStore mediante sus métodos ya existentes de lectura y EnterBiome.
5. local-persistence/game-save-tests/GameSaveChecks.cs.txt — despacho --biome-selection y probe readonly de fixture.
6. local-persistence/game-save-tests/RuntimeMenuChecks.cs.txt — puerto de fixture para selección y expectativa actualizada: volver a selección desde frontera humana confirmada no equivale a restauración de recursos.
7. local-persistence/game-save-tests/BiomeSelectionChecks.cs.txt (nuevo) —30 comprobaciones sobre SQLite sintética y navegación simulada.

Documentos actualizados exactamente7: backend/docs/GODOT_RUNTIME_INTEGRATION_PLAN.md, GODOT_SCENE_EVENT_MAPPING.md, GODOT_RUNTIME_TEST_PLAN.md, PHASES.md, PHASE_HISTORY.md, DECISIONS.md y local-persistence/README.md. No se modificaron .tscn, project.godot, TwoSides.csproj, proveedores, esquema, GameSaveService ni ningún script ambiental, decisión, FinNivel, final, personaje, NPC, animación o audio. Contratos restantes consultados sin editarlos.

### Correspondencia y señales

La escena existente scenes/levels/menu_niveles.tscn permanece intacta. Se reutilizan sus nodos y recursos:

| Nodo / Nivel | ID canónico | Entrada humana existente |
|---|---|---|
| GridContainer/TarjetaOceano /0 | ocean | res://scenes/levels/DesicionDelfin.tscn |
| GridContainer/TarjetaSelva /1 | jungle | res://scenes/levels/DesicionMono.tscn |
| GridContainer/TarjetaDesierto /2 | desert | res://scenes/levels/DesicionRataCanguro.tscn |
| GridContainer/TarjetaBosque /3 | forest | res://scenes/levels/DesicionZorro.tscn |
| GridContainer/TarjetaTundra /4 | tundra | res://scenes/levels/DesicionNieve.tscn |

TarjetaNivel._Ready conserva Pressed += OnPressed y _ExitTree lo desconecta. No hacen falta señales serializadas nuevas. OnPressed → MenuNiveles.EnterLocalBiomeAsync → LocalBiomeSelection.EnterAsync → GamePersistenceAdapter.GetActiveGameAsync/GetBiomeAccessAsync/EnterBiomeAsync/GetGameProgressAsync → GameSaveService/UnitOfWork/SQLite. BiomeFor y HumanSceneFor son catálogo cerrado verificado contra los5 exports reales de .tscn; ResourcePath exportado debe coincidir antes de permitir el clic. No se acepta una ruta arbitraria desde datos guardados.

### Protocolo local

MenuNiveles exige el ticket local de selección, crea un coordinador por instancia y carga disponibilidad por lectura asíncrona. No consulta SessionManager, autenticación, endpoints o backend. GamePersistenceAdapter conserva la capacidad runtime existente; tests inyectan únicamente capacidad sintética propia. El puerto de selección no expone creación de perfil/partida, decisiones, completion, recursos o HTTP.

Antes de escribir, se comprueban dueño/partida activa esperada, is_current/in_progress, bioma válido, disponibilidad y etapa humanas, snapshot boundary v1 válido y existencia de la escena canónica. EnterBiome se confirma con OperationId estable, owner/GameId/revisión/BiomeId/perspectiva humana. Se valida recibo (operación, tipo, dueño, partida y revisión), se relee el agregado vigente y se verifica frontera/etapa antes de navegar. No hay nueva partida ni perfil, no se completan biomas y no se registran decisiones al entrar.

La frontera human_decision ya confirmada para ese bioma se reconoce por lectura y no vuelve a llamar EnterBiome. Si se elige un bioma humano distinto, el EnterBiome existente guarda el nuevo destino lógico y revisión según su contrato, sin cambiar decisiones o estado terminal de otros biomas. No se sobrescribe un snapshot de formato desconocido ni se reescribe la frontera al repetir la entrada al mismo bioma. No se persiste avance de párrafos del diálogo ni recursos.

La transición utiliza Transicion.CambiarEscenaValidadaAsync existente (o ChangeSceneToFile si no hay gestor), con callbacks en hilo principal. No hay I/O SQLite dentro del fundido. Se verifica que el menú siga vivo, ticket vigente y plan vigente antes del cambio; el ticket se consume solo después de aceptar la escena. Abandonar el menú invalida el coordinador y sus resultados tardíos. El adaptador serializa trabajo en worker sin pasar Node/SceneTree.

Un bloqueo Interlocked cubre lectura, escritura y toda la navegación; doble clic y otra tarjeta concurrente no generan otra entrada o transición. Errores de escritura devuelven código controlado y no navegan; incertidumbre de resultado conserva comando/UUID para retry. Si hubo commit pero falló navegar, el punto confirmado permanece; al reintentar la misma entrada se navega desde él sin otra revisión/escritura. Conflicto de revisión exige recargar; no se aplica una revisión vieja a otra partida. No hay rollback silencioso de un commit, ni alternativa HTTP.

### Estados y límites de continuación

Disponibles: tarjetas humanas canónicas interactivas, cinco desde inicio y sin orden. En progreso humano: frontera human_decision reconstruible, interactiva para reabrir desde el inicio de esa decisión, sin reenviar elecciones. La actividad se deriva del progreso/etapa/punto de continuación del servicio existente; no se agregó una columna ni un indicador global de progreso.

Completado: Activity=completed, tarjeta deshabilitada, tooltip discreto «Bioma completado», resultado y texturas existentes conservados. La validación del servicio sigue rechazando ambas perspectivas. Los otros incompletos no se bloquean por completar uno. Se mantienen las imágenes ya asignadas, sin recursos externos ni rediseño de la escena.

Animal_pending/decision_info/animal_start: se muestra el estado conocido, pero la entrada a esa perspectiva se rechaza con RESUME_UNSUPPORTED hasta disponer de captura/hidratación real de recursos. No se usa la escena inicial animal como falsa restauración ni se vuelve a la decisión humana confirmada. La selección puede abrirse desde una frontera v1 reconocida para elegir otro bioma humano; eso NO restaura automáticamente al actor ni modifica la decisión anterior.

Límite importante del alcance: estas entradas son las escenas humanas actuales. Su código de confirmar decisiones aún conserva el flujo legado y puede mostrar mensajes de autenticación/contexto faltante al intentar elegir. No se lo conectó ni se habilitó un servidor como alternativa; poder abrir las cinco entradas no significa que el recorrido animal/completion/final offline completo ya funcione. Tampoco se añadieron botones a escenas humanas. Para probar las cinco entradas por ahora, se puede detener/reabrir el juego entre ellas y volver por Continuar a selección.

### Pruebas y compilación

**30 selección +35 menú/partida única +42 progreso/decisiones +43 SQLite =150 comprobaciones C# aprobadas,0fallidas**, sin sumar repeticiones. Son resultados nuevos de esta fase, diferentes de los150 históricos que incluían backend. No se inició Node.js ni se ejecutaron las39 pruebas backend ahora.

Las30 nuevas cubren los5 biomas como primera elección, correspondencia real .tscn/ID/escena, orden inverso, ID desconocido, partida inexistente/archivada/finalizada, completed en ambas perspectivas, otros disponibles, frontera humana sin escrituras repetidas, continuación animal bloqueada sin replay, doble clic, concurrencia, rollback, respuesta perdida, escena inexistente, fallo/excepción de navegación tras commit, error de lectura, revisión obsoleta, invalidación antes/durante lectura, snapshot desconocido intacto, lectura/reentrada humana readonly en proceso nuevo, independencia histórica y ausencia de referencias HTTP/Mongo/Godot en coordinador/ejecutor puro.

Fixtures nuevas bajo local-persistence/.work/databases/<UUID> y limpieza solo de sus archivos propios. Los estados terminales usados por pruebas se preparan exclusivamente en esas fixtures: no equivalen a ejecutar un final del videojuego ni a una API nueva de cierre. Navegación simulada permite inspeccionar que el commit preceda al callback; no prueba señales, fundido ni presentación en el motor. Cero bases temporales sintéticas restantes. No se abrió SQLite sobre las3 bases protegidas.

Biblioteca y ejecutores:0errores/0advertencias; tests en .NET8.0.30 y SQLite3.53.3. Godot C#:0errores,63advertencias históricas ParallaxBackground y0nuevas atribuibles a los4 archivos. MSBuild:86fuentes,1ProjectReference a biblioteca,0fuentes filtradas desde local-persistence o integration/sqlite/.work. Godot.NET.Sdk4.6.1/net8.0/referencia/paquetes sin cambios. Cachés/CLI/TEMP/NuGet privados; --no-restore, sin instalaciones ni ejecución del motor.

Comandos ejecutados, con el entorno privado del preámbulo de integration/sqlite/run-infrastructure.ps1 (sin invocar sus modos duraderos):
- dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore --disable-build-servers -nodeReuse:false -v:q
- local-persistence/.work/bin/GameSave.Checks/Debug/net8.0/win-x64/GameSave.Checks.exe --biome-selection
- mismo ejecutor --runtime-menu y --progress
- local-persistence/run-checks.ps1
- dotnet build TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -p:GodotProjectDir=<raíz absoluta integration/sqlite/.work/> -v:q

### Integridad y aislamiento

Inventario previo y posterior: **1,514 archivos existentes protegidos** fuera de los14 archivos autorizados y .env, con digest/hash/tamaño/fecha comparados. Incluye todas las escenas, finales, lógica ambiental, controles no autorizados, esquema/proveedores, paquetes y configuración. Se comparan además hash/tamaño/fecha de las3 bases existentes y sus manifiestos/leases:9archivos, todos intactos. Las cuatro partidas ficticias y el progreso manual se preservan por igualdad binaria, sin consultas SQL ni migraciones.

.env se verifica SOLO por tamaño y SHA-256 antes/después, separado de compilaciones/pruebas:278bytes y4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928. No se cargan valores, no se consulta ni modifica ACL/propietario/fecha y no se usa como configuración. La coincidencia resuelve el bloqueo de contenido para esta reanudación, no el riesgo ACL pendiente de B00. No se accedió al original, al archivo recuperado del escritorio o a Atlas.

### Validación manual pendiente y siguiente fase

1. Compilar esta copia en Godot C# bajo control del usuario; la compilación automatizada privada no actualiza por sí sola la caché habitual del editor. No iniciar Node.js.
2. Menú → Continuar → selección: comprobar5 tarjetas iniciales habilitadas sin secuencia, mismas imágenes, mensajes y volver al menú.
3. Pulsar cada tarjeta y comprobar la escena humana de la tabla. Si no hay retorno desde esa escena, detener/reabrir el juego y usar Continuar para probar otra; debe mantenerse la misma partida y perfil.
4. Reabrir el mismo bioma humano: retoma la frontera inicial del diálogo confirmada, sin prometer párrafo/posición/recursos exactos. No debe crear otra partida ni mostrar una falsa finalización.
5. Probar doble clic y observar una sola transición. Si ocurre fallo de navegación, reintentar el mismo bioma sin borrar datos. Estado completed/animal pendiente se valida con fixtures automáticas: no editar la base manual para fabricarlo.
6. No interpretar como fallo de selección el flujo de decisión todavía no conectado; no probar completion o finales como parte de esta aceptación. Registrar separadamente mensajes de audio si aparecen.

Registrar resultados/capturas sin secretos. Motor/visual/perfiles y navegación real de las5 tarjetas permanecen **PENDIENTES DE VALIDACIÓN RUNTIME**. Siguiente autorización recomendada: conectar confirmación local de decisiones y su transición informativa, con contrato explícito de ambiente/frontera; recursos, FinNivel y finales requieren sus bloques posteriores. No iniciarlos ahora. Detenerse al finalizar, sin B05.

## C.2C — Inventario previo de decisiones (2026-10-26)

Inspección anterior a modificaciones de código. Confirmación común: scripts/DecisionSceneFlow.cs. Océano usa OceanDecisionNivel → EnvironmentalDecisionNivel → DecisionNivel; selva/desierto/bosque usan EnvironmentalDecisionNivel; tundra usa scenes/levels/DesicionNieve.cs y delega al mismo flujo. BotonBuena/No llama true, BotonMala/Sí false. EnvironmentalDecisionService.OptionFor ya convierte true→reject y false→approve. DecisionNivel.Decidir(bool saludable,...) contiene la asignación explícita BiomaSaludable=saludable; tundra documenta expresamente prohibir plataforma como saludable y aprobar como degradado. Se conserva ese resultado absoluto, no se añade clasificación favorable/perjudicial ni un evaluador numérico en el adaptador.

| Bioma / decisión estable | Escena humana | Consecuencia existente de No / Sí | Información / escena animal |
|---|---|---|---|
| ocean / ocean_waste_disposal | DesicionDelfin.tscn (OceanDecisionNivel) | healthy / degraded; estado del mar/contaminación | info_delfin_buena/mala.tscn → bioma_mar.tscn |
| jungle / jungle_transport_route | DesicionMono.tscn (EnvironmentalDecisionNivel) | healthy / degraded; estados/fondos/clima de selva | info_mono_buena/mala.tscn → bioma_selva.tscn |
| desert / desert_cat_abandonment | DesicionRataCanguro.tscn (EnvironmentalDecisionNivel) | healthy / degraded; estados/tormenta de arena | info_rata_buena/mala.tscn → bioma_desierto.tscn |
| forest / forest_industrial_pesticides | DesicionZorro.tscn (EnvironmentalDecisionNivel) | healthy / degraded; estados/clima del bosque | info_zorro_buena/mala.tscn → bioma_bosque.tscn |
| tundra / tundra_fossil_extraction | DesicionNieve.tscn (DesicionNieve) | healthy / degraded; estados/tormenta de nieve | info_buena/mala.tscn → bioma_nieve.tscn |

Todas las rutas de la tabla son relativas a scenes/levels; los callbacks conservan sus UID/rutas actuales. No se modificarán .tscn, escenas informativas, scripts de bioma ni VariablesGlobales. Solo se prepara el resultado, se guarda RecordDecision y se proyecta BiomaSaludable en el punto de integración autorizado después del commit. Los consumidores ambientales existentes siguen aplicándolo al cargar.

Bloqueo observado antes de editar: FinNivel._Ready llama AnimalSegmentFlow.Open(completion:true,start:false) si no existe sesión remota. Su Open, sin Services, pausa el árbol. Es ajeno al guardado de la decisión y no se corregirá bajo esta autorización: continuidad jugable animal queda PARCIAL hasta autorización específica de su guard de entrada, sin implementar completion ahora. Cálculo exacto de finales sigue sin localizar; no se inventan fórmulas.

## B04.2B.2B.2C.2C — Decisiones locales: implementación parcial (2026-10-26)

**Guardado y confirmación de las cinco decisiones IMPLEMENTADOS EN CÓDIGO. Resultado general PARCIAL por continuidad jugable animal bloqueada fuera del alcance. Validación RUNTIME PENDIENTE.** No declarar la fase completa mientras siga el guard remoto de entrada animal. Se conserva la validación manual del usuario de C.2B: cinco tarjetas/destinos humanos correctos, doble clic sin duplicación y sin nuevos errores observados. Esa prueba no valida estos cambios.

### Inventario y opciones existentes

Antes de editar código se registró el inventario en GODOT_RUNTIME_INTEGRATION_PLAN.md. Cambios de código exactamente3:
- scripts/DecisionSceneFlow.cs — punto compartido de confirmación de los cinco diálogos; reemplazo de HTTP por sesión local y proyección del ambiente confirmado.
- integration/sqlite/LocalGameState.cs — puerto ILocalDecisionStore, DTO LocalDecisionConfirmation y coordinador puro LocalDecisionSession en el archivo autorizado; fábrica ligada al perfil/partida de la aplicación.
- integration/sqlite/GamePersistenceAdapter.cs — implementa ese puerto mediante GetActiveGameAsync y RecordDecisionAsync ya existentes.

Pruebas: local-persistence/game-save-tests/GameSaveChecks.cs.txt (despacho --decisions y --decision-probe) y nuevo DecisionIntegrationChecks.cs.txt. Documentos exactamente7: backend/docs/GODOT_RUNTIME_INTEGRATION_PLAN.md, GODOT_SCENE_EVENT_MAPPING.md, GODOT_RUNTIME_TEST_PLAN.md, PHASES.md, PHASE_HISTORY.md, DECISIONS.md y local-persistence/README.md. No se editaron contratos restantes, .tscn, scripts particulares de diálogos, DecisionNivel, VariablesGlobales, InfoDecision, biomas, actores, NPC, recursos, FinNivel, AnimalSegmentFlow, Final, proveedores, esquema, servicio de dominio, project.godot o TwoSides.csproj.

| Bioma / decisión estable | Escena y script responsables | No / Sí, evento y resultado existentes | Información y destino animal |
|---|---|---|---|
| ocean / ocean_waste_disposal | DesicionDelfin.tscn; OceanDecisionNivel→EnvironmentalDecisionNivel→DecisionNivel | BotonBuena/OnBotonBuenaPressed(true), rechaza vertido→healthy; BotonMala/OnBotonMalaPressed(false), aprueba→degraded | info_delfin_buena/mala.tscn → bioma_mar.tscn |
| jungle / jungle_transport_route | DesicionMono.tscn; EnvironmentalDecisionNivel(BiomeId=jungle) | Mismos eventos true/false; rechazar/aprobar vía por selva→healthy/degraded | info_mono_buena/mala.tscn → bioma_selva.tscn |
| desert / desert_cat_abandonment | DesicionRataCanguro.tscn; EnvironmentalDecisionNivel(BiomeId=desert) | Mismos eventos; rechazar/aprobar abandono de gatos→healthy/degraded | info_rata_buena/mala.tscn → bioma_desierto.tscn |
| forest / forest_industrial_pesticides | DesicionZorro.tscn; EnvironmentalDecisionNivel(BiomeId=forest) | Mismos eventos; rechazar/aprobar pesticidas→healthy/degraded | info_zorro_buena/mala.tscn → bioma_bosque.tscn |
| tundra / tundra_fossil_extraction | DesicionNieve.tscn; scenes/levels/DesicionNieve.cs | Callbacks propios delegan ChooseAsync(true/false); prohíbe/aprueba plataforma fósil→healthy/degraded | info_buena/mala.tscn → bioma_nieve.tscn |

Las rutas de escenas de la tabla están bajo scenes/levels/. Cada pareja informativa mantiene sus UID/rutas serializadas y EscenaSiguiente; no se reescribieron. EnvironmentalDecisionService.OptionFor existente ya convierte true/No a reject y false/Sí a approve. Se reutiliza únicamente esa función estática, sin instanciar servicio remoto, HTTP o sesión. DecisionCatalog.ForBiome proporciona las keys existentes; el catálogo local existente las valida otra vez al guardar.

Evidencia de resultado absoluto: DecisionNivel.Decidir(bool saludable,...) ya contiene BiomaSaludable=saludable; los callbacks enviaban true a información buena y false a mala. Tundra documenta explícitamente plataforma prohibida/saludable y aprobada/degradada. Se conserva ese resultado del diálogo, no se deriva una fórmula de finales ni se aplica un umbral nuevo. LocalDecisionSession recibe el resultado resuelto del llamador y solo lo serializa/valida; no contiene un evaluador ambiental. Classification permanece null, ConsequencesVersion1: no se añade favorable/perjudicial ni una puntuación por el nombre del botón.

### Confirmación, persistencia y memoria

DecisionSceneFlow captura una única elección cuando el diálogo permite decidir. Valida que el dueño sea la escena humana actual y que corresponda al bioma; exige almacenamiento local inicializado y utiliza el perfil/GameId actuales, sin crear otros. El coordinador consulta el agregado activo por SQLite, comprueba owner/GameId/is_current/in_progress, bioma no completado y frontera human_decision o decision_info del bioma correcto. Verifica que exista la escena informativa seleccionada antes de guardar.

Comando RecordDecision: OperationId y DecisionId UUIDv4 reservados una vez por intención; LocalPlayerId, GameId, ExpectedRevision, BiomeId, DecisionKey, OptionId, ResolvedEnvironment y ConsequencesJson={stateKind:resultado}. No se llama CompleteBiome. El servicio/UoW existente guarda atómicamente decisión/orden/consecuencias, EnvironmentalState.LastDecisionId/StateKind, HumanCompletedAt, etapa animal_pending, revisión/snapshot decision_info y recibo. Result de bioma y Ending no se fijan al decidir.

Tras un commit satisfactorio se verifica el recibo (tipo decision/IDs/revisión), se relee el agregado activo y se cotejan decisión, estado ambiental, referencia LastDecisionId y etapa. Solo entonces el punto autorizado de DecisionSceneFlow asigna VariablesGlobales.BiomaSaludable al valor confirmado. No se dispara daño, pickups, consumo, spawns, contadores ni lógica de recursos; los scripts ambientales existentes consumen ese bool al cargar. No se modifica una variable ambiental antes del commit.

SQLite y memoria Godot NO forman una transacción atómica. Estrategia explícita: intención inmutable→commit SQL→relectura/verificación→proyección absoluta del bool→navegación informativa. Un fallo previo al commit no proyecta ambiente ni navega. Una escritura confirmada permanece aunque falle la presentación. La proyección absoluta es idempotente; el coordinador recuerda el OperationId ya proyectado y no vuelve a aplicarlo al reintentar navegación en esa instancia. Una sesión nueva restaura el valor absoluto desde lectura, sin volver a ejecutar RecordDecision ni efectos incrementales. No se anuncia restauración de mundo/actor por asignar ese bool.

Se mantienen callbacks, textos/tweens y destinos informativos existentes. La transición usa Transicion.CambiarEscenaValidadaAsync y confirma escena viva/plan vigente; con gestor ocupado espera el intervalo ya usado, sin I/O en callback del fundido. Sin gestor usa ChangeSceneToFile y verifica resultado. Espacio reintenta la misma opción si el guardado/transición falló; el diálogo sigue bloqueando una segunda elección incompatible. No hay fallback HTTP.

### Idempotencia y recuperación

La instancia lógica sigue siendo (GameId,BiomeId,DecisionKey). Si ya existe la misma opción y consecuencia, se devuelve su registro e IDs originales sin RecordDecision nuevo. Otra opción o resultado incompatible se rechaza como DECISION_CONFLICT. Si dos sesiones compiten con la misma opción, la perdedora de revisión/instancia relee el ganador y adopta ese resultado, sin sobrescribir; opciones distintas tienen un solo ganador.

Ante rollback se retiene exactamente el comando, UUIDs, payload y ExpectedRevision para retry. Ante respuesta perdida pero registro durable presente se reconoce ese registro antes de proyectar; no se genera otro UUID ni se reenvía la consecuencia. Un recibo conocido se conserva durante reintentos en memoria. En recuperación desde un proceso nuevo el resultado devuelve registro/OperationId/estado y Receipt=null: no se inventa un recibo ni se deduce su revisión original de la revisión actual. La fila local_operations del commit permanece; no se implementa otra consulta SQL en el adaptador.

Doble clic en el diálogo queda serializado por el flow y el coordinador Interlocked; una transición exitosa no se repite para la misma operación. Un error después del commit conserva el recibo/registro; reintentar la navegación no aumenta revisión, decision_order ni número de decisiones y no vuelve a proyectar en la misma sesión. Bioma completed o partida archivada/finalizada no aceptan nuevas elecciones/proyecciones. Reiniciar antes de un commit pierde una intención solo en memoria; una nueva intención explícita se evalúa contra el agregado durable, sin inventar un journal nuevo.

### Bloqueo animal fuera del alcance y autorización pendiente

Las parejas InfoDecision conservan su paso al animal. Sin embargo, **FinNivel._Ready** detecta falta de Services/sesión remota y llama AnimalSegmentFlow.Open(completion:true,start:false). Con Services nulo, Open pausa SceneTree y retorna. En las cinco escenas animales ese guard está presente. No se ejecutó el motor para atribuirle una observación runtime nueva: el bloqueo se deduce del código.

Por esa dependencia protegida no se puede declarar «segmento animal jugable offline» ni continuidad completa en esta fase. No se introducen sesiones falsas, no se construye el backend antiguo y no se evita el guard por una variable global. Se preservan las mecánicas en los archivos excluidos.

Autorización necesaria posterior: revisar de forma específica scripts/FinNivel.cs únicamente en su guard de entrada y scripts/AnimalSegmentFlow.cs en los requisitos de contexto/bloqueo local. Esto debe separarse de conectar CompleteBiome y de modificar física/objetivos; no se hizo aquí. Hasta entonces la implementación general queda PARCIAL aunque las cinco decisiones se guardan localmente y el paso informativo está conectado. Tampoco se altera la política de selección que bloquea reentrada animal sin un checkpoint de recursos soportado.

### Finales y restauración futura

Persisten por partida los IDs/opciones/orden/consecuencias, estado ambiental y vínculo de la decisión, versiones existentes de reglas/contenido y fecha humana. Esos son insumos para la futura restauración de resultados; no se añadieron acumuladores, pesos, umbrales ni clasificación numérica. Los resultados Bueno/Medio/Malo confirmados por el usuario permanecen sin modificar. El cálculo exacto sigue sin localizar con certeza en la copia permitida; no se buscó original/Atlas.

Los recursos/vida/agua/comida, posiciones, timers, fuentes agotadas y checkpoints animales no se capturan ni restauran. Recuperar una decisión en una prueba readonly demuestra persistencia y ausencia de replay, no continuación exacta del animal en Godot. La equivalencia definitiva de finales tras cerrar/continuar exige restauración ambiental completa y evaluador existente identificado; queda pendiente. No se cierra globalmente la partida ni se habilita una segunda por decidir.

### Pruebas y compilación efectivas

**30 nuevas decisiones +30 selección +35 menú/partida única +42 progreso/decisiones +43 SQLite =180 comprobaciones C# aprobadas,0 fallidas**, sin contar repeticiones ni las39 pruebas backend históricas. No se inició Node.js/Atlas.

Las30 nuevas incluyen ambas opciones de cada bioma (10), opción/key inválidas, mismo resultado sin escritura/proyección/transición duplicadas, conflicto por otra opción, recuperación en sesión nueva y proceso hijo readonly, doble clic, rollback/retry con mismos UUIDs, intento de cambiar elección pendiente, respuesta perdida, escena faltante, navegación fallida, completed, archivo, otro GameId, lectura fallida, sesión invalidada, concurrencia igual/distinta y ausencia de dependencias HTTP/Mongo/Godot en el coordinador/ejecutor puro. Se usa GameSaveService/UoW/repositorio/SQLite real sobre fixtures propias y callbacks simulados de memoria/navegación. No se presenta la simulación como ejecución de señales o VariablesGlobales reales en el motor; ese orden se inspeccionó en el script y se valida manualmente después.

Las regresiones se ejecutaron sobre fixtures nuevas de local-persistence/.work/databases/<UUID>, sin tocar bases existentes. Comandos: build --no-restore de GameSave.Checks.csproj; ejecutor --decisions, --biome-selection, --runtime-menu, --progress; local-persistence/run-checks.ps1. El probe --decision-probe solo acepta el namespace UUID de fixture ya existente, abre readonly y no invoca RecordDecision.

Biblioteca y ejecutores0errores/0advertencias, .NET8.0.30 y SQLite3.53.3. Godot C#0errores,63advertencias históricas ParallaxBackground y0nuevas en los3 archivos. Entorno CLI/NuGet/TEMP privado, GodotProjectDir a integration/sqlite/.work/.godot/mono/temp; sin restore/actualización de paquetes. Referencia existente única a la biblioteca; no se cambió proyecto/framework. No editor, motor ni exportación ejecutados. Cero bases sintéticas temporales restantes.

### Integridad

Se comparan antes/después **1,517 archivos protegidos** fuera de los12 archivos de esta fase y .env: hashes/tamaños/fechas, incluidos todos los scripts particulares de diálogos, escenas/animales/recursos, FinNivel/AnimalSegmentFlow/Final, configuración, esquema y servicio/repositorio. Tres bases existentes +manifiestos/leases=9archivos protegidos, intactos por comparación binaria/metadatos, sin abrir SQLite ni migrar/limpiar/reinicializar ninguna. Se preservan las cuatro partidas ficticias y progreso manual sin consultar sus contenidos.

.env verificado únicamente por tamaño y SHA-256 antes/después:278bytes,4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928. No valores, credenciales, uso como configuración ni cambios a propietario/ACL/fecha. B00 mantiene el riesgo ACL pendiente. No se accedió a proyecto original ni servicios externos.

### Guía manual acotada y siguiente paso

1. Compilar esta copia en Godot C# bajo control del usuario y abrir sin Node.js. Usar la misma partida, Continuar y una tarjeta humana disponible.
2. Terminar el diálogo y elegir No o Sí. Debe confirmarse el guardado local antes de mostrar la información correspondiente, sin solicitud de login para guardar.
3. Un doble clic debe producir una sola información/decisión. Si falla la transición, Espacio reintenta el mismo resultado; no elegir otra opción ni crear otra partida como reparación.
4. La decisión debe dejar el bioma animal_pending, no completed; la prueba automatizada cubre este estado sin editar la base manual.
5. Al avanzar desde información a animal existe el bloqueo remoto de FinNivel descrito arriba: puede quedar pausado. No forzarlo, no simular sesión ni interpretar esa pausa como guardado fallido. Validación de jugabilidad animal queda bloqueada hasta autorización específica.
6. Después de reiniciar, la decisión se conserva; no prometer reentrada animal/recursos desde selección ni equivalencia de finales aún. No cambiar datos manuales para fabricar completed o restablecer opciones.

La prueba manual de las dos opciones de cada bioma requiere fixtures/runtime autorizado apropiado, no borrar la elección ya confirmada del usuario. El estado vigente es PARCIAL por continuidad animal, RUNTIME PENDIENTE. Recomendar resolver el guard local de entrada con alcance explícito y luego los bloques de restauración/completion; no iniciarlos ni B05. Detenerse aquí.

## B04.2B.2B.2C.2C.1 — Entrada animal local (2026-10-26)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** Este apartado actualiza el estado vigente; los registros anteriores conservan su valor histórico. El usuario autorizó expresamente ampliar la navegación mínima a MenuNiveles.cs, TarjetaNivel.cs y LocalGameState.cs para abrir la entrada animal original de un bioma ya decidido y preparar el ambiente antes de instanciarla.

Diagnóstico: FinNivel._Ready exigía Services/autenticación/progreso remotos aunque el contexto local mantiene Services nulo. La llamada antigua a AnimalSegmentFlow.Open pausaba el árbol y, sin Services, retornaba antes de crear el aviso. El texto «Confirmación pendiente. El juego permanece detenido.» existe en el modal remoto, pero no demuestra por sí solo el origen exacto del «Pendiente» observado por el usuario. animal_pending es un estado SQLite legítimo después de decidir, no evidencia de pérdida. La selección además rechazaba ese estado por restauración animal no soportada; ahora permite únicamente volver a su entrada original. No se consultó la partida manual para diagnosticar datos.

FinNivel._Ready suscribe la señal original y espera ValidateLocalEntryAsync. El lector ILocalAnimalStore solo expone GetLocalProfileAsync/GetActiveGameAsync: valida propietario/perfil, partida actual in_progress, GameId, bioma canónico y pertenencia, animal_pending no completed, decisión confirmada, vínculo LastDecisionId, consecuencias persistidas coherentes y snapshot de frontera soportado. Conserva Decision.OperationId como referencia a la operación original (FK del esquema existente); no fabrica un recibo ni vuelve a ejecutar RecordDecision. Los fallos se presentan localmente y mantienen detenido el ingreso, con reintento de lectura o retorno al menú. No hay fallback HTTP en el modo local.

Las cinco escenas animales originales se seleccionan por mapa canónico. La navegación consulta nuevamente SQLite y prepara el valor absoluto BiomaSaludable antes de cargar/instanciar la escena: reject/No → healthy; approve/Sí → degraded. Solo asigna si difiere, sin consecuencias acumulativas. El guard en _Ready solo compara el ambiente preparado; no lo modifica tarde después de inicializar actores/visuales. Una entrada directa con ambiente incoherente se rechaza y pide volver a la tarjeta. Una decisión confirmada puede recuperarse aunque CurrentBiomeId señale otro bioma; no se modifica snapshot, revisión ni decisión al reentrar.

La tarjeta indica «Abrir entrada animal original. No recupera posición, vida, agua ni comida». Se mantienen escenas, actores, NPC, animaciones, recursos y scripts ambientales originales. Esto no equivale a restauración exacta de una sesión animal. Los métodos FinNivel._ExitTree, OnBodyEntered y FinalizarNivel permanecen idénticos al registro previo. No se llama CompleteBiome, no se marca completed ni se cierra la partida. Si la llegada física o un reinicio llaman al modal antiguo, el modo local devuelve LOCAL_OPERATION_UNSUPPORTED y permite volver al menú; no realiza operaciones remotas. Finalización y reinicios persistentes requieren otra fase.

Archivos de producción modificados: scripts/FinNivel.cs, scripts/AnimalSegmentFlow.cs, integration/sqlite/LocalGameState.cs, integration/sqlite/GamePersistenceAdapter.cs, scripts/MenuNiveles.cs y scripts/TarjetaNivel.cs. Pruebas: GameSaveChecks.cs.txt, RuntimeMenuChecks.cs.txt, BiomeSelectionChecks.cs.txt y el nuevo AnimalEntryChecks.cs.txt bajo local-persistence/game-save-tests. Documentación: únicamente los siete documentos autorizados.

Validación reejecutada: **29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite =209 comprobaciones aprobadas, cero fallidas**. Las nuevas cubren ambos ambientes de los cinco biomas, ausencia de perfil/partida/decisión, IDs incorrectos, completed, fallos de lectura, vínculo/estado/snapshot inválidos, reintentos sin escritura, preparación previa, cuatro decisiones recuperables y reinicio en proceso hijo readonly. Son SQLite sintético y callbacks de navegación; no ejecución del motor ni prueba real de desconexión de red. El puerto puro carece de dependencias HTTP/Mongo/Godot. No se ejecutó Node.js, editor/motor Godot ni Atlas.

Comandos locales: dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore; ejecutor GameSave.Checks.exe con --animal-entry, --decisions, --biome-selection, --runtime-menu y --progress; local-persistence/run-checks.ps1. Fixtures propias UUID en local-persistence/.work/databases, con limpieza controlada por los ejecutores. No ejecutar el modo durable por defecto sobre AppData. Compilación completa TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild con GodotProjectDir dirigido a integration/sqlite/.work/: cero errores, las63 advertencias históricas ParallaxBackground y ninguna en los seis archivos modificados. Biblioteca/ejecutor: cero errores y advertencias. CLI, paquetes y temporales aislados; sin restaurar paquetes ni cambiar proyecto/framework.

Integridad: comparación antes/después de 1,513 archivos protegidos (tamaño, SHA-256 y fecha) y los nueve archivos de las tres bases, manifiestos y leases: sin diferencias. No se abrió ninguna base protegida mediante SQLite. Se conserva el progreso manual de cuatro decisiones sin inspeccionarlo. .env se verifica separadamente solo por tamaño/SHA-256:278bytes y 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928; no se utiliza en compilaciones/pruebas. No se modifican ACL/propietario; el riesgo ACL de B00 sigue pendiente.

Guía manual (pendiente, a cargo del usuario): abrir esta copia en Godot C# sin Node.js; continuar con el mismo perfil y partida; seleccionar una tarjeta ya decidida y comprobar su entrada animal original, personaje y ambiente confirmado sin login ni confirmación de servidor. Probar ambos ambientes solo donde existan decisiones válidas, sin cambiar las cuatro decisiones ni reinicializar bases. Volver a selección y abrir otro bioma decidido: debe usar su propio ambiente. Confirmar que no se promete recuperar posición/recursos. Al llegar físicamente al final o solicitar reinicio, esperar el aviso local de operación pendiente de implementar; no exigir completed ni forzarlo en SQLite.

Siguiente trabajo recomendado, solo con nueva autorización: validar ingreso en Godot y luego diseñar/integrar finalización física local y continuidad de recursos/reinicios. No se conectan finales, no se inicia B05. Trabajo detenido al finalizar esta subfase.

## B04.2B.2B.2C.2C.2 — Retorno al menú local (2026-10-26)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** El usuario informa 7/8 comprobaciones manuales correctas de C.2C.1: continuar, entrada animal, personaje, ambiente, decisión no repetida, ausencia de pausa de entrada y de errores nuevos. El fallo restante es la recuperación remota al volver desde pausa. Estos resultados manuales son reportados por el usuario.

Causa exacta en código: MenuPausa.IrMenuNiveles llamaba ChangeSceneToFile("res://scenes/auth/recuperacion_partida.tscn"). RecoveryScreen._Ready obtenía Services remoto; Render usaba HasSession para mostrar Login, deshabilitaba Continuar y presentaba servicio no disponible con Services nulo. No prueba pérdida de progreso ni fallo de RecordDecision. La escena no solicita HTTP automáticamente en Ready, pero sus acciones de recuperación/login pertenecen al controlador remoto. MenuPrincipal ya recarga SQLite y no requería cambios.

Archivos C# modificados: assets/sprites/ui/MenuPausa.cs, scripts/auth/RecoveryScreen.cs e integration/sqlite/LocalGameState.cs. Los tres figuran en el plan de integración (pausa/salida, recuperación local y proyección local). Se reutilizan las consultas existentes de GamePersistenceAdapter sin modificarlo. Pruebas: nuevo local-persistence/game-save-tests/MenuReturnChecks.cs.txt y selector --menu-return/--menu-return-probe en GameSaveChecks.cs.txt. Solo se actualizan los siete documentos técnicos habituales; sin .tscn ni controladores globales.

Flujo corregido: Volver al menú usa LocalMenuReturn, bloquea doble clic y acciones de pausa concurrentes, refresca SQLite, comprueba el mismo perfil y la misma partida activa, invalida únicamente el permiso de selección en memoria y navega a res://assets/sprites/ui/menu_principal.tscn. No crea, archiva ni completa partidas; no invoca RecordDecision ni CompleteBiome. El menú principal existente vuelve a leer SQLite, muestra Continuar y mantiene Nueva partida bloqueada por la partida sin finalizar. Continuar prepara la selección de cinco biomas; el flujo de C.2C.1 conserva las entradas animales y su preparación ambiental previa.

Pausa: abrir/cerrar mantiene su comportamiento existente; se impiden cambios durante un retorno en curso. Tras confirmar la consulta se quita SceneTree.Paused antes de navegar y se oculta el panel; al salir se desconectan sus señales. Si falla la consulta o la navegación, se conserva/restaura la pausa previa y el panel muestra un error local reintentable. El callback verifica vida del nodo para no volver a pausar otra escena tras una salida concurrente. Sin contexto local no se redirige a login. Una entrada accidental a RecoveryScreen con contexto local oculta login/logout/recuperación remota y vuelve al menú principal local; si falla esa navegación permite reintentar allí, sin tocar SQLite ni usar Services.

**220 comprobaciones C# aprobadas, cero fallidas:** 11 nuevas de retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Cubren retorno y continuación con ambos ambientes, mismos IDs/decisiones/revisión/hash, fallo SQLite y recuperación, navegación fallida/excepción, doble clic, almacén cerrado, retornos repetidos, ausencia de partida y proceso hijo readonly. Las pruebas usan SQLite sintético bajo local-persistence/.work/databases/<UUID> y callbacks de pausa/navegación; no ejecutan señales, escenas ni el motor Godot. No se presenta como una prueba real de desconexión de internet: el flujo local inspeccionado no invoca servicios HTTP. Apertura/cierre visual de pausa y redirección real de RecoveryScreen requieren comprobación manual.

Comandos: dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore; ejecutor --menu-return, --animal-entry, --decisions, --biome-selection, --runtime-menu y --progress; local-persistence/run-checks.ps1. El probe nuevo solo acepta la ruta UUID sintética verificada por ReadOnlyFixture. Compilación completa TwoSides.csproj con --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild y GodotProjectDir dirigido a integration/sqlite/.work/: cero errores, 63 advertencias históricas ParallaxBackground y cero nuevas. Biblioteca y ejecutor: cero errores y advertencias. CLI/paquetes/temporales privados, sin restore ni cambio de proyectos. No se ejecutaron Node.js, Godot ni Atlas.

Integridad antes/después: 1,519 archivos protegidos conservan tamaño, SHA-256 y fecha; incluye FinNivel completo, cinco biomas, actores, escenas, finales, GamePersistenceAdapter y configuración. Las tres bases protegidas y sus manifiestos/leases (9 archivos) permanecen idénticos, sin abrirlas mediante SQLite; se conserva la partida manual sin consultar contenido. .env se comprueba por tamaño/hash separadamente de compilaciones y pruebas: 278 bytes, SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928. No se leen valores ni se modifica contenido, propietario o ACL. El riesgo ACL de B00 sigue pendiente. Cero archivos SQLite sintéticos restantes.

Guía manual: en esta copia, continuar la partida existente y abrir un bioma decidido; abrir pausa, reanudar y comprobar movimiento; abrir pausa otra vez y pulsar Volver al menú (también doble clic). Debe abrir el menú principal local sin login ni Recuperar partida remoto, sin pausa residual, con Continuar disponible y Nueva partida bloqueada. Continuar debe mostrar los cinco biomas; abrir otro ya decidido y verificar su propio ambiente antes de jugar. Repetir después de cerrar/abrir el juego y sin internet, sin cambiar decisiones ni borrar bases. No bloquear ni corromper la base real para probar errores: esos casos están cubiertos con fixtures.

Pendientes: validar este flujo en Godot; restauración exacta de posición/vida/agua/comida, reinicios, CompleteBiome y finales continúan fuera de alcance. El aviso local de finalización/reinicio aún no implementados de C.2C.1 permanece. No se modifica FinNivel ni su finalización física. No se inicia B05. Trabajo detenido al terminar esta subfase.

## B04.2B.2B.2C.2C.3 — Reinicio del segmento animal (2026-10-26)

**COMPLETADA EN CÓDIGO; PERSONAJE, RECURSOS Y OBJETOS PENDIENTES DE VALIDACIÓN RUNTIME.** El usuario confirma las nueve comprobaciones manuales de C.2C.2, incluido retorno local, continuar, ambiente y persistencia tras cerrar Godot. Ese resultado corresponde a la fase anterior, no valida el reinicio nuevo.

Causa exacta del aviso: MenuPausa.ReiniciarNivel llamaba AnimalSegmentFlow.Open(completion:false, reason:"voluntary"); su rama local devolvía LOCAL_OPERATION_UNSUPPORTED, cuyo texto indicaba finalización/reinicio aún no implementados. No era una decisión ausente ni un error de credenciales.

Archivos de producción modificados, previstos en el plan: assets/sprites/ui/MenuPausa.cs (ReiniciarNivel), scripts/AnimalSegmentFlow.cs (RestartLocalAsync/RestartMessage y bloqueo durante reinicio) e integration/sqlite/LocalGameState.cs (coordinador puro LocalAnimalRestart y mensaje genérico de operación aún no disponible). GamePersistenceAdapter no requiere cambios: se reutilizan ILocalAnimalStore y sus consultas existentes. Pruebas: nuevo AnimalRestartChecks.cs.txt y selector --animal-restart/--animal-restart-probe en GameSaveChecks.cs.txt, bajo local-persistence/game-save-tests. Solo se actualizan los siete documentos habituales.

Flujo: el botón reserva la intención para impedir doble clic/acciones concurrentes. El coordinador resuelve el bioma exclusivamente desde la escena animal canónica actual; ReadAnimalEntryAsync valida perfil, misma partida activa, pertenencia del bioma, animal_pending no completed, decisión/consecuencias y frontera soportada. Se verifica/carga el PackedScene original sin instanciarlo y se relee SQLite para rechazar cambios de revisión/decisión/ambiente durante la preparación. No se utiliza una escena humana ni una ruta arbitraria.

Después de esas comprobaciones, el puente prepara BiomaSaludable como estado absoluto confirmado (No/reject/healthy o Sí/approve/degraded), asignándolo solo si difiere; libera SceneTree.Paused y llama ChangeSceneToPacked. Esto crea una instancia nueva del segmento original, no reutiliza el árbol animal vivo ni llama ReloadCurrentScene sin contexto. El guard de entrada existente valida nuevamente SQLite y el ambiente preparado. La salida del menú anterior desconecta señales y libera su pausa. Un fallo de SQLite o destino no modifica el nivel ni su pausa; si falla el cambio de escena se restaura el valor ambiental anterior y la pausa previa, con error local reintentable en el mismo panel. Los callbacks comprueban que el nodo/escena sigan vigentes.

No hay escrituras de progreso durante el reinicio: no RecordDecision, EnterBiome, CompleteBiome, nuevos UUID/recibos, creación/archivo/cierre de partidas ni cambios de disponibilidad, historial u otros biomas. No se crea un checkpoint persistente ni una nueva captura de recursos. Los recibos originales permanecen intactos. La muerte y la llegada física conservan sus rutas actuales, aún no implementadas localmente; esta fase conecta únicamente Reiniciar desde pausa. El mensaje genérico de operación pendiente evita afirmar que el botón nuevo sigue sin implementar.

Inicialización observada en los scripts existentes: los cinco Player*.cs definen MaxHealth=3 y _Ready asigna CurrentHealth=MaxHealth; Estadisticas define AguaMax=100 y ComidaMax=100 y _Ready copia ambos máximos. No se encontraron overrides de esos máximos en las escenas animales/personajes inspeccionadas; el delfín tiene ActivarAgua=false y se conserva así. No se agregan números al código de reinicio: la instancia nueva consume los exports reales. FuenteRecurso conserva _dropeados/_jugadoresDentro por instancia; ItemRecurso tiene _recogido/timers por instancia. Personaje, fuentes, ítems, enemigos y obstáculos vuelven a su configuración original al recrear el árbol; su resultado visual/físico no se afirma validado sin motor. Los métodos ambientales existentes configuran visibilidad/procesamiento/partículas desde el bool absoluto, sin volver a registrar una consecuencia acumulativa.

Entradas originales observadas, coordenadas locales del personaje en las escenas sin editar:

| Bioma | Escena | Personaje | Posición |
|---|---|---|---|
| ocean | bioma_mar.tscn | PlayerDelfin | (25,458) |
| jungle | bioma_selva.tscn | PlayerMono | (79,176) |
| desert | bioma_desierto.tscn | PlayerRataCanguro | (209,478) |
| forest | bioma_bosque.tscn | PlayerZorro | (342,184) |
| tundra | bioma_nieve.tscn | PlayerOso | (571,191) |

**241 comprobaciones C# aprobadas, cero fallidas:** 21 nuevas de reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las21 cubren diez combinaciones bioma/opción, fallo SQLite, destino ausente/humano, completed, partida ausente, decisión ausente, doble clic, retry de navegación, cambio de contexto durante preparación, cuatro ambientes independientes y proceso hijo readonly. Se comprueban hash completo de fixture, revisión, decisiones, ambientes, biomas y referencia a operación/recibos preservados. CompleteBiome aparece únicamente como preparación explícita de una fixture sintética terminal para probar rechazo; no existe en la ruta de reinicio de producción.

Los ejecutores usan bases propias en local-persistence/.work/databases/<UUID>; cero archivos SQLite sintéticos restantes. Las proyecciones de ambiente, pausa y navegación automatizadas son callbacks, no ejecución Godot ni verificación de recursos/colisiones reales. El flujo de producción inspeccionado no usa HTTP, .env ni credenciales; no se simula una sesión remota ni se afirma una prueba real de corte de red.

Comandos: build --no-restore de local-persistence/game-save-tests/GameSave.Checks.csproj; ejecutor --animal-restart, --menu-return, --animal-entry, --decisions, --biome-selection, --runtime-menu y --progress; local-persistence/run-checks.ps1. El probe nuevo solo admite ReadOnlyFixture con ruta UUID sintética verificada. Compilación completa TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild con GodotProjectDir hacia integration/sqlite/.work/: cero errores,63 advertencias históricas ParallaxBackground,ninguna nueva. Biblioteca y ejecutor: cero errores/advertencias. Entorno CLI/paquetes/temporales privado; sin restore ni cambios de proyectos. No se ejecutaron Godot, Node.js ni Atlas.

Integridad antes/después: 1,520 archivos protegidos conservan tamaño/SHA-256/fecha; incluye escenas, cinco biomas, personajes/NPC, recursos, animaciones, FinNivel completo, finales, GamePersistenceAdapter, configuración y rutas de retorno local. Las tres bases protegidas y sus manifiestos/leases (9 archivos) permanecen idénticos, sin abrirlas con SQLite. .env:278bytes,SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928,comprobado separadamente antes/después, sin consultar valores ni usarlo en compilación/pruebas. Propietario/ACL no modificados; riesgo ACL de B00 pendiente. No se accede al proyecto original.

Guía manual: continuar la misma partida, abrir un bioma ya decidido, avanzar desde el inicio, recibir daño y consumir recursos; observar/usar una fuente y algún objeto/enemigo. Pausa → Reiniciar, también doble clic: debe aparecer una única escena animal original, en su entrada, sin diálogo humano, login o recuperación remota, con ambiente confirmado y juego sin pausa residual. Comprobar vida máxima real, agua/comida máximas donde estén activas, fuentes/objetos/enemigos/timers reiniciados y ausencia de señales duplicadas/errores. Repetir en los cinco biomas y con los ambientes disponibles, sin cambiar decisiones ni borrar bases para fabricar opciones. Volver al menú, confirmar misma partida/Nueva partida bloqueada y repetir tras cerrar/abrir Godot y sin internet. Fallos SQLite/destino se prueban solo con fixtures, no dañando la base manual.

Pendientes: validación runtime de posición, recursos y objetos; checkpoints persistentes/continuación exacta, muerte, CompleteBiome y finales en fases independientes autorizadas. No se modifica FinNivel ni su llegada física; no se inicia B05. Trabajo detenido al terminar C.2C.3.

## B04.2B.2B.2C.2C.4 — Game Over y retorno directo a niveles (2026-10-26)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** El usuario informa 9/10 comprobaciones manuales satisfactorias de C.2C.3: reinicio de posición/vida/agua/comida/objetos/enemigos en los cinco biomas, ambiente conservado, sin repetir decisión/login ni pausa residual. La ausencia de errores nuevos de consola no fue confirmada; no se interpreta como un error SQLite demostrado ni como una validación completa de esta fase.

Causas exactas: assets/sprites/ui/GameOver.cs, Reintentar → AnimalSegmentFlow.Open(completion:false,reason:"death") → rama local LOCAL_OPERATION_UNSUPPORTED. VolverMenu del mismo controlador todavía abría recuperacion_partida.tscn. MenuPausa.IrMenuNiveles abría el menú principal local conforme a C.2C.2; la instrucción actual sustituye expresamente ese destino por la selección de niveles. Las cinco escenas incluyen game_over.tscn y MenuPausa.tscn. Los cinco personajes llaman GameOver.MostrarDerrota; ZonaMuerte difiere MostrarGameOver para no cambiar el flujo dentro del evento físico. Esa lógica de muerte no se altera.

Cambios de producción: assets/sprites/ui/GameOver.cs, assets/sprites/ui/MenuPausa.cs, scripts/AnimalSegmentFlow.cs e integration/sqlite/LocalGameState.cs. Están previstos en el plan de integración (GameOver, pausa/salida, flujo animal y contexto de navegación). GamePersistenceAdapter, MenuNiveles y TarjetaNivel se inspeccionan pero no requieren cambios. Pruebas: nuevo local-persistence/game-save-tests/GameOverNavigationChecks.cs.txt y selector --game-over-navigation en GameSaveChecks.cs.txt. Se actualizan únicamente los siete documentos habituales. No se editan escenas, diseño visual, botones, actores, recursos, VariablesGlobales, biomas, FinNivel ni Final.cs.

GameOver.Reintentar ahora espera AnimalSegmentFlow.RestartLocalAsync, el mismo puente y LocalAnimalRestart de Pausa → Reiniciar, sin una segunda implementación del reinicio. Mantiene MostrarDerrota, su fundido, botones originales y sus conexiones C#. Se reserva _saliendo durante la operación; se comprueba validez del nodo tras await antes de volver a tocar controles. El callback de fin de tween también comprueba IsInstanceValid y se conserva Kill/desconexión en _ExitTree. SQLite confirma misma partida/bioma, decisión/consecuencias y ambiente, rechaza completed y resuelve la escena animal original. El ambiente absoluto se prepara antes de instanciar; se libera la pausa y la nueva escena utiliza su posición, vida/recursos y objetos iniciales existentes. No se vuelve al humano ni se repiten consecuencias acumulativas.

Pausa → Menú y Game Over → Menú comparten AnimalSegmentFlow.ReturnToLevelsLocalAsync → LocalMenuReturn.ReturnToSelectionAsync. Destino canónico verificado: **res://scenes/levels/menu_niveles.tscn**. Se verifica/carga su PackedScene, se refresca la misma partida desde SQLite y se crea el permiso de selección mediante PrepareSelectionAsync antes de navegar. Se libera la pausa, se cambia de escena y se retira la interfaz anterior. La selección recibe un permiso válido, mantiene sus cinco tarjetas y consulta disponibilidad mediante los servicios existentes: un bioma decidido incompleto abre su animal y su ambiente; solo completed queda bloqueado. No se pasa por bienvenida, perfil, login ni recuperación. El método ReturnAsync histórico se conserva para usos de menú principal ajenos a estos dos botones; sus11 pruebas siguen siendo regresión de esa API, no una afirmación del destino vigente de pausa.

Abandono animal: se mantienen decisiones, consecuencias, partida y recibos, sin guardar posición ni recursos intermedios. Al volver al animal se abre su entrada original con inicialización real de escena, igual que el reinicio aprobado. No hay RecordDecision, EnterBiome, CompleteBiome, creación/archivo/cierre de partida ni cambios de historial/disponibilidad en estas salidas.

Errores: fallos de lectura, contexto o navegación dejan la escena anterior y su pausa; un fallo al abrir selección invalida su permiso temporal y permite reintentar la consulta. El puente comprueba vida de nodo/escena antes de callbacks para no tocar otra escena ni volver a pausarla tras su salida. El coordinador bloquea transición doble; _saliendo bloquea acciones cruzadas del mismo panel. Los errores usan el aviso local ya existente en pausa; Game Over utiliza TooltipText de los botones existentes y GD.PushWarning, sin añadir controles ni cambiar el diseño. Una escena animal ausente incluye su ruta canónica en el mensaje; el destino de selección ausente también se informa. No hay fallback HTTP ni partida temporal.

Revisión estática de consola: se inspeccionaron referencias locales/remotas, inicialización, señales/tween, pausa, nodos liberados y cola/disposición SQLite. Las dos rutas corregidas no llaman Services ni abren recuperación/login; el adaptador conserva serialización y errores controlados al cerrar recursos. Se añadió la comprobación de validez del callback tween de Game Over. No se diagnostican ni se declaran resueltos errores no aportados por el usuario. Si aparecen al probar, solicitar las líneas completas de consola y su traza (sin secretos), indicando si ocurrieron al morir, reintentar o volver a niveles. No asumir origen SQLite.

**260 comprobaciones C# aprobadas, cero fallidas:**19 nuevas de Game Over/navegación +21 reinicio +11 retorno histórico +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las19 cubren los cinco animales/ambos resultados, ambos orígenes de retorno, estado de las cinco tarjetas y reentrada animal, fallo SQLite/retry, navegación fallida/permiso invalidado, doble clic, completed, escena faltante con ruta, partida ausente y conexiones C# inspeccionadas sin rutas remotas. Se verifica hash completo de fixtures y conservación de revisión/decisiones/ambientes/otros biomas/partida. La preparación de una fixture terminal usa CompleteBiome únicamente en pruebas; ninguna ruta de producción nueva lo ejecuta.

Pruebas de SQLite real con fixtures independientes bajo local-persistence/.work/databases/<UUID>, callbacks de pausa/navegación y comprobación de bindings como texto fuente. No son señales/escenas ejecutadas en Godot, ni una prueba real de desconexión de red. El flujo inspeccionado carece de HTTP obligatorio; validar offline real manualmente. Reanudar desde pausa conserva su implementación y requiere comprobación runtime. Las regresiones incluyen los procesos hijos readonly de fases anteriores. Cero archivos SQLite sintéticos restantes.

Comandos ejecutados con entorno CLI/paquetes/TEMP privado: build --no-restore de GameSave.Checks.csproj; ejecutor --game-over-navigation, --animal-restart, --menu-return, --animal-entry, --decisions, --biome-selection, --runtime-menu y --progress; local-persistence/run-checks.ps1. Compilación completa TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild con GodotProjectDir hacia integration/sqlite/.work/: cero errores,63 advertencias históricas ParallaxBackground,ninguna nueva. Biblioteca/ejecutor: cero errores/advertencias. MSBuild inspecciona86 fuentes, una sola referencia a local-persistence/src/TwoSides.LocalPersistence.csproj y cero fuentes backend/tests filtradas al proyecto Godot. Sin restore, modificación de proyectos ni motor/editor, Node.js o Atlas ejecutados.

Integridad:1,520 archivos protegidos con tamaño/SHA-256/fecha idénticos antes/después, incluyendo finales/FinNivel/biomas/actores/recursos/escenas/configuración y adaptador SQLite. Las tres bases protegidas más manifiestos/leases (9 archivos) permanecen idénticos; no se abrieron con SQLite ni se reinicializó progreso manual. .env conserva278bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928,comprobado separadamente de compilaciones/pruebas, sin leer valores ni usar credenciales. No se cambian ACL/propietario; riesgo ACL de B00 pendiente. No se accede al proyecto original.

Guía manual: con la misma partida, entrar a un bioma decidido, perder por una mecánica existente y comprobar el Game Over original. Reintentar (también doble clic): una sola escena animal, entrada/recursos/objetos iniciales, mismo ambiente y sin humano/login ni pausa residual. Repetir en los cinco biomas y ambientes existentes sin editar decisiones. Desde pausa, reanudar primero; luego Menú debe abrir directamente las cinco tarjetas. Desde Game Over, Menú debe abrir esa misma selección. Elegir un bioma decidido distinto y verificar su ambiente propio e ingreso desde inicio; confirmar misma partida y restricción de nueva partida al volver al menú principal por su ruta habitual. Repetir sin internet y después de cerrar/abrir el juego. No dañar bases reales para inducir errores. Recoger consola/traza si aparece cualquier error nuevo.

Próxima etapa: validar estos dos flujos y aclarar consola con evidencias. CompleteBiome por llegada física, checkpoints, cierre global y finales siguen fuera de alcance; no se implementan aquí ni se inicia B05. Trabajo detenido al terminar C.2C.4.

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


## B04.2B.2B.2E.2A — Actualización de implementación (2026-10-27)

COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE. Véase el informe completo E.2A en [COMPLETE_BIOME_INTEGRATION_PLAN.md](COMPLETE_BIOME_INTEGRATION_PLAN.md) y PHASE_HISTORY.md para archivos, comandos, pruebas y guía manual.

FinNivel valida la instancia/tipo/vida del animal y el gate de entrada; LocalGameState prepara un comando CompleteBiome estable y relee SQLite después del recibo. El adaptador conserva el servicio/transacción existentes. AnimalSegmentFlow usa el modal local y navega a selección solo tras confirmación, sin HTTP. Tarjetas completed bloqueadas por el código existente; decisiones y ambiente conservados. Doble señal/clic y reintentos no generan otra finalización. Un fallo de navegación conserva recibo y permite reintentar; pausa se libera al confirmar el cambio.

El quinto guarda su bioma y ofrece, mediante modal/label existentes, una selección recuperable que informa FINAL GLOBAL PENDIENTE. La partida sigue in_progress y Nueva partida bloqueada. No se toca Final.cs/escena, no se evalúan umbrales, no se cierra, archiva ni crea sucesora. La finalización individual está conectada para ocean/jungle/desert/forest/tundra; el flujo global no está resuelto.

Telemetría secundaria: Loading excluye espera SQLite del tiempo efectivo; CompletionConfirmed usa OperationId confirmado como EventId y el FIFO existente, con intervalos ordenados antes del terminal. Fallar estadísticas no revierte ni bloquea progreso. Posible evento faltante tras crash: reconciliación futura basada en recibo/completed/ID y run verificables, sin inventar tiempos ni reescribir dominio; no se implementa ahora ni se añade cola/migración/atomicidad ficticia.

472 comprobaciones aprobadas:54 nuevas y418 regresiones reejecutadas,0 fallidas. Biblioteca/ejecutores0 errores/0 advertencias; Godot C# Rebuild0 errores,63 advertencias históricas ParallaxBackground,0 nuevas. Sin ejecución de Godot; física/UI/SceneTree real pendientes de validación manual. Fixtures únicamente local-persistence/.work/databases/<UUID>.

Tres bases protegidas y archivos asociados (9) idénticos en hash/tamaño/fecha;1.545 archivos fuera del alcance idénticos. .env278 bytes, SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928; sin valores ni cambios ACL/propietario. Riesgo B00 pendiente. Sin Node/Atlas/AWS/B05. Trabajo detenido.

## B04.2B.2B.2E.2B.2 — Finales locales autorizados (2026-10-27)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** El usuario autorizó regla nueva definitiva, no recuperada del evaluador original:0/1/2 reject→bad;3/4→medium;5→good, exclusivamente cinco decisiones canónicas de cinco completed de la misma partida. Versión narrativa separada local-ending-reject-count-1; se conservan versiones de partida/decisiones.

Informe completo, inventario exacto y guía manual en GLOBAL_PLAYTHROUGH_CLOSURE_PLAN.md (apartado E.2B.2). Un evaluador puro centraliza la regla; GameSaveService.PrepareFinal/CloseGame usan transacción/recibos existentes y esquema2 sin migrar. final_pending persiste resultado antes de navegar; cierre solo por acción explícita de salida, completed/is_current0 e historia intacta. Continuar recupera cinco completed sin resultado o final_pending después de reinicio, sin repetir decisiones/metas. Nueva partida es explícita y solo posterior al cierre, con perfil igual, GameId nuevo y cinco biomas limpios/disponibles.

Final.cs consume SQLite y sale localmente: escena/textos/tween/nodos/recursos intactos, sin HTTP/login. AnimalSegmentFlow coordina quinto; menú recupera finales. FinNivel/CompleteBiome y mecánicas intactos. StatisticsService únicamente reconoce la versión final nueva para metadatos, ajuste informado previamente; no se alteran agregados o eventos. CompletedAt indica preparación del resultado; recibo close_game/ArchivedAt indican cierre. No existe ni se afirma marcador durable de “final leído”.

598 comprobaciones aprobadas:126 nuevas y472 regresiones reejecutadas,0 fallidas finales. Biblioteca/ejecutores0 errores/0 advertencias; Godot C# Rebuild0 errores,63 advertencias históricas ParallaxBackground,0 nuevas. Sin ejecución de Godot; visual/navegación/pausa real requieren manuales. Las10/10 manuales anteriores son E.2A, no esta fase.

Tres bases protegidas y9 archivos asociados idénticos en hash/tamaño/fecha;1.542 archivos fuera de alcance idénticos. .env278 bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, sin valores ni cambios ACL/propietario; riesgo B00 pendiente. Solo fixtures nuevas para escrituras. Sin migraciones, Node/Atlas/AWS/B05. Probar manualmente good/medium/bad en partidas sucesivas sin editar decisiones ni borrar historia; incluir reinicio antes de salir del final, cierre y nueva partida. Trabajo detenido.
