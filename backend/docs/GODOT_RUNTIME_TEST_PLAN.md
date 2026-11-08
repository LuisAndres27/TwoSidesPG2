# Plan de pruebas de integración runtime

Fase B04.2B.2B.2C.1 — 2026-10-25. **Plan, no resultados ejecutados.** No se arrancó Godot, no se compiló ni se ejecutaron tests durante esta fase documental. Los 124 casos y 0 errores/63 advertencias son evidencia histórica de B04.2B.2B.2B.3.

## Entorno futuro y evidencias

Toda prueba funcional necesita autorización posterior del bloque, motor y ruta de fixture. Crear almacén aislado propio para cada caso o secuencia, con manifest/lease reconocidos y limpieza limitada a su propiedad. No usar ni migrar game-progress/save.sqlite3 ni persistence/save.sqlite3 del copy-06dc7ade-b3cd-425b-8d79-90dde8ef1ac6: contienen los datos protegidos de fases previas, incluidas cuatro partidas ficticias. La ruta del adaptador actual está restringida: la selección de fixtures runtime requiere capacidad explícita/diseño seguro, no pasar una ruta arbitraria ni usar la base protegida para probar.

No bloquear internet de todo Windows ni realizar conexiones a Atlas. Para demostrar independencia de HTTP usar un transporte espía/inactivo dentro del harness futuro y observar cero solicitudes; el aislamiento manual debe limitarse al proceso/configuración aprobados. No alterar endpoints para simular conexión. Todos los casos deben registrar versión de build, fixture, pasos/estado antes y después, revisión/recibo cuando aplique, resultado esperado/real y evidencia UI sin secretos. No imprimir .env ni payloads de credenciales.

Automatizable significa prueba futura de dominio/coordinador con fixtures nuevas o dobles de navegación/hilo, sin afirmar que valida señales físicas reales. Manual significa verificar en Godot real tras autorización: montaje, UI, físicas, Ready, pausa, HUD y transiciones. Cada prueba crítica requiere ambos niveles cuando lo indica la tabla.

| Caso | Acción y resultado esperado | Automatización futura / interacción manual |
|---|---|---|
| R01 Primera ejecución sin internet | Perfil ausente legítimamente, pide solo nombre, cero HTTP; base inválida/error no se trata como ausencia. | Auto: transporte espía, lectura/errores. Manual: iniciar limpio y comprobar UI sin login. |
| R02 Nombre local | Crear/editar Unicode y nombre inválido; LocalPlayerId permanece al renombrar, una sola identidad por instalación, sin correo/contraseña. | Auto: validación/revisión/retry. Manual: escribir nombre y reabrir. |
| R03 Crear partida | Intención explícita, UUID nuevo y cinco human_pending disponibles, historial intacto. Doble clic/retry una sola partida. | Auto: transacción/recibo/concurrencia. Manual: botones/feedback. |
| R04 Continuar | Opción solo con partida activa válida; carga owner/game/revisión/snapshot correctos sin crear otra. | Auto: proyección, ausencia vs fallo. Manual: navegación desde menú y recuperación local. |
| R05 Cinco libres | En fixture nueva elegir cada bioma primero, y orden distinto; destinos humano/animal reales y no orden fijo. | Auto: todas las permutaciones de disponibilidad relevantes. Manual: cada tarjeta y escena. |
| R06 Confirmar decisión | Esperar pregunta; No→reject, Sí→approve; una decisión lógica y consecuencias guardadas atómicamente, no completion. | Auto: comandos, callbacks inválidos/dobles y rollback. Manual: las dos opciones en cada escena, incluida tundra. |
| R07 Jugar tras decidir | Información correcta y entrada animal con ambiente confirmado; otros incompletos disponibles, bioma actual animal_pending. | Auto: plan/recibo/etapa. Manual: información, transición y jugabilidad. |
| R08 Finalización real | Solo cuerpo/actor autorizado que alcanza FinNivel en escena/etapa válidas. _Ready/modal/muerte/decisión no completan. | Auto: eventos/contextos inválidos y guard. Manual: colisión física en los cinco niveles y rechazo de otros cuerpos. |
| R09 Bloqueo | Tras commit válido, bioma completed visible, humano/animal/restart/decisión no reabren. | Auto: todas las mutaciones y lectura. Manual: tarjeta/menú actualizados. |
| R10 Repetición | Doble BodyEntered/clic/retry mismo UUID no duplica fecha/revisión/recibo; entrada directa a escena completed se rechaza. | Auto: concurrencia y replay. Manual: colisiones repetidas/navegación directa controlada. |
| R11 Otro bioma | Completar uno no bloquea los demás incompletos; seleccionar otro conserva datos del primero. | Auto: cinco progresos independientes. Manual: volver a selección y jugar otro. |
| R12 Cerrar/reabrir | Recuperar estado confirmado en nuevo proceso; cierre antes/después de commit y antes de navegación no fabrica éxito ni partida. | Auto: procesos hijo sobre fixtures propias. Manual: cierre real durante puntos aprobados, reabrir y verificar pausa/continuación. |
| R13 Restaurar decisiones | Cargar no emite pressed/RecordDecision/HTTP ni duplica consecuencias; ambiente del bioma no se filtra desde otro juego. | Auto: espías/filas/revisión/digest. Manual: escenas saludables/degradadas en las cinco rutas. |
| R14 Restaurar recursos | Vida/agua/comida coinciden con último checkpoint confirmado después de Ready y antes de consumo, flags correctos (agua delfín inactiva), HUD coherente. Rechazar NaN/rangos/versiones inválidas. | Auto: DTO/versiones/captura/aplicación tras inicialización. Manual: cinco personajes, perspectiva, pausa/reinicio y cero recursos duplicados. Bloqueado hasta contrato de checkpoint; boundary1 no prueba este caso. |
| R15 Final Bueno | Reproducir fixture auténtica que la demo calcula Bueno; persistir entradas/resultado/versiones y reabrir sin variación. | Auto: comparación exacta contra evaluador/fixture existentes. Manual: texto/escena Bueno antes/después. Bloqueado por fórmula no localizada. |
| R16 Final Medio | Igual con fixture auténtica Medio; ningún umbral inventado. | Auto+manual como R15. Bloqueado por evaluador. |
| R17 Final Malo | Igual con fixture auténtica Malo; derrota durante nivel no lo sustituye. | Auto+manual como R15, distinguir GameOver de Final. Bloqueado por evaluador. |
| R18 Nueva independiente | Tras anterior parcial o completa, nueva intención archiva anterior sin borrarla, cinco disponibles, decisiones/recursos/ending no se heredan. | Auto: historial y owner/perfil estables. Manual: acciones explícitas y confirmación. |
| R19 Sin conexión obligatoria | Recorrido completo no invoca login/me/health/game/decisión/completion remoto ni pausa por ConnectivityOverlay; código remoto conservado. | Auto: transporte espía con fallo siempre y cero llamadas locales. Manual: menú, selección, pausa, muerte, final y reapertura sin backend. Final aún condicionado a R15–17. |
| R20 Fallo SQLite | Inyectar fallo antes del commit en fixture; rollback total y error visible. Probar commit exitoso/navegación fallida, revisión obsoleta, dueño distinto, base no reconocida y formato desconocido. | Auto: extensión transaccional/fault injection, receipts/relectura, cero fallback HTTP. Manual: UI pausada/retry, no bloqueo falsamente confirmado ni reinicio silencioso. No corromper bases protegidas. |

## Criterio de aceptación por bloque

Perfil/menú/selección pueden validarse como bloque acotado sin anunciar finales ni recursos completos. Decisiones requieren tabla de consecuencias verificada; completion requiere señal real y transacción confirmada; recursos requieren nuevo contrato de frontera; finales requieren el cálculo existente y tres fixtures auténticas. AreAllCanonicalBiomesCompleted debe ser falso con cuatro y verdadero con cinco, sin fijar Ending ni cerrar partida por sí solo. Validar retorno de recibo antiguo sin rebajar la proyección vigente.

Tras futuras modificaciones de código, ejecutar regresiones apropiadas sobre fixtures nuevas y compilación aislada con cachés privadas. No usar los runners duraderos que mutan las cuatro partidas. Registrar advertencias preexistentes separadamente. La aceptación runtime solo procede cuando las comprobaciones manuales autorizadas pasen; compilar y contar tests de dominio no demuestra integración de escenas.

En esta subfase el control realizado es documental y de integridad: tres planes nuevos, cuatro registros autorizados actualizados, fuentes/configuración y bases comparadas por hashes/metadatos. Mantener B00 BLOQUEADA por ACL sin modificar permisos. No iniciar implementación ni B05.


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


### Guía manual pendiente (solo copia de pruebas)

1. Abrir la copia con Godot C# y compilar desde el flujo habitual del editor bajo control del usuario; no exportar ni cambiar configuración global. La compilación automatizada fue aislada y no implica que la caché habitual .godot contenga la nueva DLL.
2. Sin iniciar el backend y sin internet disponible para el juego, ejecutar la escena inicial. Esperado: vista local sin correo/contraseña ni pantalla de login; primera apertura crea exclusivamente el nuevo almacén runtime autorizado. Si falla el almacenamiento, mostrar error y detener operación; no borrar base ni modificar ACL para forzarla.
3. Introducir solo nombre visible y guardar. Debe aparecer el nombre persistido; no debe existir partida hasta pulsar Nueva partida.
4. Pulsar Nueva partida: tras confirmación de SQLite se abre la selección existente con aviso de integración de biomas pendiente. Las tarjetas no abren niveles en esta subfase; no probar decisiones ni FinNivel.
5. Volver al menú: aparece Continuar y no se pide nuevamente el nombre. Continuar recupera la misma partida y abre selección sin crear otra.
6. Cerrar/reabrir el juego: mismo perfil/nombre/partida. Crear otra partida solo por intención explícita y confirmar archivado; verificar conservación del historial mediante lectura local autorizada futura, sin abrir ni escribir las dos bases protegidas.
7. Si aparece guardado pendiente/fallo de navegación, reintentar la MISMA operación; no repetir Nueva partida como sustituto de Continuar. Un punto de segmento no soportado debe mostrar limitación sin reiniciar sus recursos/progreso.

Registrar capturas de menú, nombre, selección/aviso, vuelta y reapertura, sin secretos. Los puntos visuales/layout, apertura nativa duradera bajo OneDrive, señales, cierre del motor y persistencia real entre procesos Godot permanecen **PENDIENTES DE VALIDACIÓN RUNTIME**. No ejecutar automáticamente esta guía desde Codex.

Comandos realmente ejecutados: local-persistence/run-checks.ps1 (43), build --no-restore del ejecutor game-save-tests y GameSave.Checks.exe --runtime-menu (26), --progress (42), node --test --test-concurrency=1 tests/unit/*.test.js tests/integration/*.test.js desde backend (39). No ejecutar modo Test/probe duradero que abra AppData. R01–R04/R18/R20 cubiertos en coordinador/fixtures, R05 solo política de dominio; R12 motor real y R14–R17 siguen pendientes. No hay función UI de cambiar nombre, caso no aplicable; renombrado del servicio queda cubierto por regresión SQLite. Caída de HTTP no es requisito del coordinador, que no referencia HttpClient; inspección del bootstrap confirma que no construye clientes ni supervisor. No se afirma prueba visual offline completa.


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


## B05.3B.2B — Activación local controlada (2026-10-28 Guatemala)

Validación manual específica2B PENDIENTE:abrir copia sin internet/Node,Continuar mismo perfil/partida,sin login/pausa;decisiones/ambiente/meta física/final/cierre/historia/nueva partida conservados;esperar preparación local sin bloqueo;cerrar/reabrir y verificar recuperación/idempotencia. Revisar [Local outbox] y [Local storage integrity] de manera diferenciada. Nunca provocar corrupción/disk-full/cambios ACL en runtime para probar.28 tests nuevos sintéticos del adaptador/worker+713 regresiones,741 aprobados;no sustituyen motor/colisiones/visual manuales. Guía completa en informe2B.

Preflight,backup nuevo/hash,ensayo,migración,comparación,archivos/pruebas,riesgos y guía manual en [B05_OUTBOX_RUNTIME_ACTIVATION.md](B05_OUTBOX_RUNTIME_ACTIVATION.md). B00 pendiente;sin cambios ACL/propietario,autenticación remota,HTTP/Atlas/AWS oB05.4. Esperar validación manual e instrucciones.

## B05.3B.2E.1 — Cierre y captura Outbox: manual pendiente

Código compilado y 791 comprobaciones sintéticas aprobadas: 26 nuevas y 765 regresiones. **Godot no ejecutado.** Los pasos siguientes se proponen para E.2: no abrir runtime hasta autorizar respaldo, ensayo y recuperación real; el inicio ya reconcilia y puede escribir los dos faltantes. No usar bases históricas ni provocar fallos destructivos en runtime.

1. Tras autorización E.2, realizar preflight y respaldo consistente privado. Ensayar primero recuperación en segunda copia y después autorizar la ruta runtime exacta. Reauditar las 853 pending y las 838 de 840 fuentes anteriores, conservando UUID, estados, fuentes y estadísticas. No exigir un total de 855 tras sesiones nuevas.
2. Sin red ni Node, abrir la copia autorizada y cerrar por menú y por X en ejecuciones separadas. Probar una sesión corta Menu de aproximadamente 3,932 s: el almacenamiento usa milisegundos y la medición real no tiene por qué ser exactamente 3932. No sumarla al tiempo efectivo.
3. Cerrar inmediatamente después de apertura y durante actividad o captura; probar doble clic. Debe existir una sola salida lógica y un terminal por sesión, sin errores de Node liberado. Probar pausa y menú, conservando decisiones y finales.
4. OUTBOX_DRAINED significa captura local. OUTBOX_CLOSE_DEFERRED no significa cobertura completa. Las esperas explícitas admiten hasta 3 s de telemetría, 1 s de drenaje y 1 s de limpieza, sujetas a planificación e I/O. No hay envío ni ACK remoto.
5. Reabrir sin internet tras cierre normal y, solo en fixture autorizada, tras terminación inesperada o reinicio. Comprobar recuperación idempotente de hechos confirmados y UUID, sobres y huellas conservados. No fabricar terminales abiertos ni prometer recuperar eventos que nunca hicieron commit.
6. Error de escritura, SQLite ocupado, corrupción y timeout: únicamente sintéticos. Corrupción debe dar diagnóstico de integridad, no mero aviso secundario. Separar las advertencias históricas de las nuevas.
7. Después de cada caso, auditar en lectura cobertura, FK, integridad, decisiones, ambientes, finales y tiempo efectivo. Recalcular hechos si hubo juego. Registrar build, pasos, esperado/real y códigos sin secretos; no editar historia para forzar conteos.

[Garantías y limitaciones](B05_OUTBOX_SHUTDOWN_RECOVERY.md). E.1 completada en código; manuales y reparación real pendientes. B05.3 no cerrada, B00 pendiente y B05.4 no iniciada.
