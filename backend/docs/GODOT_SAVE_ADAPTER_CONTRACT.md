# B04.2B.1 — Contrato propuesto del adaptador de guardado

Fecha: 2026-10-25. Documento de diseño, sin nuevas clases/scripts compilables. Complementa [plan e inventario](GODOT_SQLITE_INTEGRATION_PLAN.md), [contrato local](LOCAL_SAVE_CONTRACT.md) y [esquema](SQLITE_SCHEMA_DESIGN.md).

## Límite de arquitectura

Godot / VariablesGlobales / biomas → **GamePersistenceAdapter (propuesto)** → GameSaveService → UnitOfWork → SQLiteRepository → archivo SQLite local. La unidad de trabajo existente se conserva en la cadena. Las escenas no reciben conexión, SQL, ruta arbitraria ni repositorio. No se crea Autoload en esta fase.

GamePersistenceAdapter propuesto captura DTO inmutable en hilo principal, coordina cola serial de comandos, convierte catálogo y estados, verifica generación de partida/revisión y entrega respuestas a UI en hilo principal. No calcula finales/desbloqueos nuevos, no modifica NPC/física, no contiene credenciales ni realiza HTTP. Vida del perfil local independiente de SessionManager remoto.

Un proveedor duradero propuesto valida namespace/propiedad/ruta/reparse, apertura reconocida y migraciones antes de construir servicio. Es una dependencia futura: el constructor real GameSaveService(SyntheticDatabase, SaveCatalog, ...) no acepta rutas ni un proveedor general. SyntheticDatabase tiene constructor internal. No existe API durable que pueda usarse hoy. Implementarla y cambiar firmas requiere autorización posterior; no ofrecer código ejecutable que eluda esa barrera.

## Solicitudes conceptuales y API real correspondiente

Los nombres a la izquierda son responsabilidades propuestas, no métodos existentes del juego. Todo comando incluye identidad local UUIDv4, operationId UUIDv4, versión y expectedRevision cuando corresponda. Una operación en vuelo conserva su ID/payload hasta resolver resultado.

| Responsabilidad propuesta | API observada de GameSaveService | Condiciones / respuesta |
|---|---|---|
| Inicializar almacenamiento | SchemaManager.Verify y constructor de servicio, tras proveedor futuro | Bootstrap no se implementa ni abre bases actuales. Resultado listo/conflicto/indisponible. |
| Recuperar/crear perfil | GetLocalProfile, CreateLocalProfile | Crear solo ausencia legítima; un error de lectura no significa perfil ausente. Nombre NFC validado, ID estable. Recibo confirmable. |
| Renombrar perfil | UpdateDisplayName | Revisión de perfil, distinta de revisión de partida. |
| Nueva partida | CreateNewGame(NewGameCommand) | ExpectedCurrentGameId/ExpectedCurrentRevision explícitos si existe actual; confirmar archivado según intención usuario. |
| Guardar frontera | SaveCurrentGame(SaveGameCommand) | Bioma/ResumeKind/checkpoint catálogo cerrado; BoundarySnapshot únicamente. No incorpora recursos intermedios. |
| Confirmar decisión | RecordDecision(RecordDecisionCommand) | DecisionId/key/option/resolvedEnvironment/consequences versionados del llamador confiable aprobado. No deducir healthy del botón por su texto o de un bool desconocido. |
| Consultar decisiones/progreso/ambiente | GetDecisions, GetBiomeProgress, GetEnvironment | Paginación/propiedad y revisión consistentes; LoadGame preferido para restauración integral. |
| Actualizar progreso/ambiente | UpdateBiomeProgress, UpdateEnvironment | No son autorización para inventar reglas ni pasos independientes que produzcan frontera parcialmente guardada. |
| Continuar | ContinueGame y LoadGame | ResumePlan y agregado deben referir misma revisión; revalidar/reintentar lectura si cambió. No aplicar plan obsoleto. |
| Preferencias | SetLocalSetting, GetLocalSetting | Solo lista aprobada de keys y JSON admitido; no crear preferencias por intuición. |

**Brecha transaccional:** cada método de servicio tiene su transacción; varias llamadas consecutivas no comparten commit. Una decisión seguida de guardado de nueva frontera o fin animal con cambio de bioma debe definirse como comando de dominio único si exige atomicidad. Añadirlo al servicio/unidad de trabajo será trabajo posterior autorizado. El adaptador no abre una segunda conexión ni implementa SQL paralelo. Sin ese cambio no prometer una frontera compuesta atómica.

## Mapeo de datos y semántica

| Fuente Godot real | Modelo local / conversión propuesta | Restricción |
|---|---|---|
| VariablesGlobales.TipoNivel.Oceano/Selva/Desierto/Bosque/Tundra | ocean/jungle/desert/forest/tundra | Tabla explícita, no ordinal implícito al persistir. Catálogo de escenas en plan. |
| VariablesGlobales.BiomaSaludable | EnvironmentalState.StateKind healthy/degraded | null significa no resuelto; nunca null→false ni default true como decisión guardada. Solo proyectar el bioma activo. |
| ObtenerEstadoNivel / GuardarResultadoNivel | BiomeProgress.Result good/bad y Status | NoJugado no equivale a bad. Bueno/Malo solo cuando resultado válido; ambiente saludable por sí solo no acredita fin animal. |
| Elección confirmada de DecisionSceneFlow / DecisionCatalog | EnvironmentalDecision: DecisionKey, OptionId, orden, consecuencias; EnvironmentalState.LastDecisionId | No guardar fase de texto/tweens. Reglas y OptionId definitivos requieren aprobación; no ejecutar ConfirmAsync para restaurar. |
| FinNivel / AnimalSegmentFlow | BiomeProgress, timestamps y ResumePlan | Guardado local no utiliza sesión/confirmación HTTP. No computar final nuevo. |
| SceneFor + InfoDecision.EscenaSiguiente | SavedGame.ResumeKind/CheckpointKey y ContinuationSnapshot | Persistir clave lógica, nunca ruta arbitraria aportada por base; resolver a catálogo cerrado. |
| Player*.CurrentHealth y Estadisticas.Agua/Comida | Sin campos soportados actualmente | Futura versión de snapshot/DTO y métodos de aplicación explícitos. No usar reflection, Recuperar ni SetSalud del HUD como sustitución de salud real. |
| FuenteRecurso._dropeados / ItemRecurso._recogido | Excluidos de snapshot boundary actual | Requieren IDs estables y estado del mundo para recorrido exacto, fuera de alcance. |

No serializar Node, Resource, PackedScene, Vector2 de recorrido, señales, timers, IDs de instancia, sesiones/tokens, caches de red ni objetos físicos. Los modelos pueden contener referencias opcionales de identidad técnica; no llenarlas con secretos ni adoptar IDs remotos legados de 24 caracteres como UUID locales.

## Protocolo de guardado y errores

Captura en main thread → validación de catálogo/owner/versión → comando inmutable con operationId → cola única del adaptador → servicio/UoW con revisión y recibo → commit → actualización de caché en main thread → cambio de escena. Un doble clic comparte operación o se rechaza mientras hay una en vuelo. No ejecutar SQLite en _Process, _PhysicsProcess ni callback del fundido.

Reintento con misma intención conserva UUID y digest; payload distinto con mismo ID se trata como conflicto. Si estado cambió, recargar agregado y pedir nueva intención; no sustituir expectedRevision silenciosamente. Las respuestas incluyen recibo/revisión o error sanitizado y estado guardado/no guardado. Separar almacenamiento fallido de presentación fallida después de commit. No cancelar una tarea ya comprometida como si hubiera rollback; consultar recibo/estado antes de reintentar.

Mapear errores reales SaveException.Code y StorageErrors de la biblioteca a mensajes sin SQL/rutas privadas/secretos. Categorías del adaptador propuestas: conflicto (revisión, operación o propiedad), archivo no reconocido, versión incompatible/corrupción, ocupado transitorio e I/O/permisos. El nombre concreto se mapeará contra códigos reales durante implementación, sin inventar que ya existen nuevas excepciones. Nunca borrar base, cambiar ACL, crear perfil de reemplazo o conectar al servidor como fallback. Conservar última revisión confirmada; mostrar pendientes. Backoff finito para ocupado, reintento explícito para fallos permanentes; no bucle que congele frames.

## Protocolo de restauración

1. Validar proveedor/ruta/namespace/schema; recuperar perfil y partida actual reconocidos.
2. Cargar agregado coherente y ResumePlan de misma revisión; validar catálogo, propiedad, ResumeKind y checkpoint admitido. Los campos ending no autorizan a inventar umbrales ni desbloqueos.
3. Preparar proyección del diccionario de resultados. Si se usa ReiniciarEstadosNiveles, reconstruir todo sin mostrar menú a medio aplicar. No llamar APIs que generan nuevas decisiones/resultados.
4. Para escena animal, exigir estado ambiental conocido y asignar BiomaSaludable antes de ChangeSceneToPacked: _Ready de hijos puede ejecutarse antes del padre; aplicar en _Ready del controlador sería demasiado tarde para jugadores/fuentes. Validar vigencia en antesDeCambiar de Transicion si se autoriza usar ese punto.
5. Instanciar escena de catálogo y comenzar en frontera, sin reproducir spawns/decisión/recompensas. Recursos conservan comportamiento de inicio hasta resolver contrato; no asegurar continuidad intermedia. Si ruta/UID no carga, mantener último commit y permitir reintentar presentación.
6. Rechazar resultados asíncronos tras abandonar escena, cambiar perfil/partida o cerrar adaptador. Ningún worker toca SceneTree. Cierre coordina cola/disposal en lugar de confiar en async void _ExitTree.

## Requisitos para B04.2B.2

Autorizar archivos concretos de proveedor/servicio/adaptador/TwoSides.csproj y pruebas; resolver identidad de copia/ruta externa y propiedad persistente; aprobar transacciones de frontera, catálogo/reglas/versiones y política de recursos. Planificar sustitución coordinada de EntryAccessController, GameStateStore, BiomeMenu, DecisionSceneFlow y AnimalSegmentFlow donde corresponda, sin mezclar autoridades local/remota ni modificar mecánicas sin permiso. Compilar/referenciar/exportar solo con nueva autorización. La fase actual no concede escritura en AppData ni habilita ProjectReference.

La matriz de 14 pruebas futuras está en el plan. B00 mantiene el riesgo ACL desconocido. No se inició B04.2B.2.

## B04.2B.2A — Infraestructura implementada, alcance actual

La autorización B04.2B.2A implementa solo el soporte de almacenamiento y referencia; actualiza las limitaciones históricas de B.1 sobre SyntheticDatabase/ruta/ProjectReference. No implementa GamePersistenceAdapter de gameplay ni el resto de responsabilidades conceptuales anteriores.

ISaveDatabase.Open devuelve conexión validada. SyntheticDatabase sigue disponible sin cambio de semántica; DurableTestDatabase.OpenOrCreate exige la ruta exacta DurableTestDatabase.AuthorizedPath y Windows. SchemaManager/UnitOfWork/GameSaveService ahora aceptan ISaveDatabase. El proveedor mantiene copia/propósito/identidad de archivo/application_id, rechaza desconocidos y conserva archivos. No es un proveedor arbitrario/de producción; manifiesto local no es autenticación contra procesos con el mismo acceso.

GodotSqliteInfrastructureAdapter (TwoSides.Integration.Sqlite) es clase C# normal compilada en TwoSides.dll, sin Node ni Autoload: OpenAsync(string) → InfrastructureResult(Success,Code,Profile opcional); GetSyntheticProfileAsync y EnsureSyntheticProfileAsync recuperan/crean perfil ficticio fijo; CloseAsync libera proveedor, admite reapertura explícita; DisposeAsync termina instancia. Ejecución serial en trabajador, sin acceso SceneTree ni HTTP. Cada servicio mantiene conexiones de duración de operación. Error devuelve código controlado, no mensajes SQL/secretos. No expone guardado real de juego.

Ruta/copyID/propósito exactos, protocolo de reconocimiento y comandos de build/test en local-persistence/README.md y plan actualizado. Para pruebas solo catálogo infra-test-1/synthetic; no adopta reglas/cuentas remotas ni resuelve recursos o finales.

Comandos compuestos de frontera, recursos, proyección ambiental, sustitución de gates HTTP y bootstrap siguen siendo diseño pendiente B04.2B.2B. No se llamó al adaptador desde escenas ni se modificaron VariablesGlobales o project.godot. Las 28 comprobaciones de infraestructura y 82 regresiones aprobaron; ejecutar motor/exportación no fue parte de esta autorización.