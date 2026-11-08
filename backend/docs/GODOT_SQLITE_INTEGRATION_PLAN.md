# B04.2B.1 — Preparación de integración Godot / SQLite

Fecha: 2026-10-25. Alcance: análisis y contratos documentales; ningún adaptador implementado.

## Entorno y compatibilidad

Raíz inspeccionada: `C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA`. Coincide con la copia autorizada. No se accedió al original. Existen TwoSides.csproj, project.godot, local-persistence y backend/docs.

TwoSides.csproj declara Godot.NET.Sdk/4.6.1, TargetFramework net8.0, net9.0 condicionado a Android y EnableDynamicLoading=true. No declara PackageReference, ProjectReference ni exclusiones Compile. Se conserva la inclusión implícita del SDK de C#; no añadir .cs de pruebas bajo esta raíz sin exclusiones previamente autorizadas. project.godot identifica 4.6/C# y ya contiene GameApplicationContext y Transicion como Autoloads; no se creó ninguno.

local-persistence/src/TwoSides.LocalPersistence.csproj usa Microsoft.NET.Sdk; Directory.Build.props fija net8.0, nullable, compilación explícita .cs.txt, sin generación de .cs, salidas/cachés privadas .work y warnings como errores. Referencia exacta Microsoft.Data.Sqlite [8.0.32]. Lockfiles: Core 8.0.32, SQLitePCLRaw bundle/core/lib/provider 2.1.13, System.Memory 4.5.3. Las fuentes están en namespace TwoSides.LocalPersistence y no dependen de Godot. La suite autocontenida anterior ejecutó .NET 8.0.30; eso no demuestra qué runtime cargaría el editor.

**Compatibilidad estática de framework Windows verificada:** ambos proyectos net8.0 y sin referencias explícitas incompatibles en el proyecto del juego. Godot documenta .NET 8 o posterior y soporte de escritorio ([C# Godot 4.6](https://docs.godotengine.org/en/4.6/tutorials/scripting/c_sharp/c_sharp_basics.html)). No se compiló el juego, cargó Godot o exportó. La compatibilidad operativa y resolución transitiva en Godot quedan pendientes de pruebas autorizadas. Android no es alcance de esta conclusión.

**Bloqueo de integración ejecutable actual:** GameSaveService requiere SyntheticDatabase, cuyo constructor es internal y cuya capacidad solo se obtiene de SyntheticSandbox con ruta fija .work y propiedad por instancia. No puede abrir la ruta duradera propuesta ni recuperar una base entre procesos. No cambiar constantes, usar reflection o reutilizar el sandbox: B04.2B.2 deberá autorizar una abstracción de apertura duradera, validaciones de propiedad/migración y sus pruebas. El diseño siguiente es conceptual, no una integración lista para ejecutar.

Para exportación Windows, Microsoft.Data.Sqlite incluye el bundle nativo e_sqlite3 ([Microsoft](https://learn.microsoft.com/en-us/dotnet/standard/data/sqlite/custom-versions)). Riesgos por verificar: arquitectura win-x64 frente a otras arquitecturas; inclusión de e_sqlite3.dll y assemblies transitivos en salida final; resolución por .deps.json; otro proveedor nativo cargado por plugins; publicación con trimming/single-file; plantillas .NET 4.6.1 y runtime compatible. No copiar DLL manualmente ni asumir que el .gdignore de la biblioteca garantiza empaquetado .NET. La futura referencia debe propagar assets de NuGet y probarse en exportación limpia. No se detectó otra referencia SQLite explícita en TwoSides.csproj; no equivale a inspección del proceso nativo. No se instaló ni actualizó ningún paquete.

## Inventario de fuentes reales

Las rutas de la tabla son relativas a la raíz. Los nombres son observados; los contratos de adaptación posteriores son propuestas.

| Archivo / clase real | Estado candidato a persistencia | Estado temporal excluido | Dependencias, momentos y efectos de restaurar |
|---|---|---|---|
| scripts/globals/VariablesGlobales.cs — VariablesGlobales | BiomaSaludable; resultados por TipoNivel en _estadosNiveles, consultados por ObtenerEstadoNivel | Diccionario estático como caché, no fuente duradera | Proyectar desde agregado al cargar y después de commit; GuardarResultadoNivel permite actualizar resultado, ReiniciarEstadosNiveles limpia caché. No inferir resultado de NoJugado como false. Cambiar BiomaSaludable afecta todo el bioma activo. |
| scenes/levels/BiomaMar.cs — BiomaMar | Estado healthy/degraded desde EnvironmentalState, no nodos | _buenEstado, _malEstado, _fondo, partículas, _estadoAnterior | Lee BiomaSaludable en _Ready y detecta cambios en _Process; restituir antes de escena. AplicarConsecuenciasAmbientales cambia visibilidad/procesamiento/partículas. |
| scenes/levels/BiomaSelva.cs — BiomaSelva | Mismo estado por jungle | Fondos/nodos/partículas y _estadoAnterior | Lee en _Ready y _Process; mismo orden de restauración. No persistir animación o emisión. |
| scenes/levels/BiomaDesierto.cs — BiomaDesierto | Estado por desert | _particulasArena, nodos y fondos | AplicarConsecuenciasAmbientales en _Ready; no depender de cambiar el global después de inicializar. |
| scenes/levels/BiomaBosque.cs — BiomaBosque | Estado por forest | _particulasClimaMalo y referencias visuales | Aplica en _Ready; activa grupos/partículas. Preparar global antes de instanciar. |
| scenes/levels/BiomaNieve.cs — BiomaNieve | Estado por tundra | _particulasNieveMala, fondos y nodos | Aplica en _Ready; requiere nodos concretos, cuya carga real no fue probada. |
| scripts/PlayerDelfin.cs — PlayerDelfin | CurrentHealth, MaxHealth como contexto de validación | Velocity, posición, _controlTimer, _invulnTimer, _damageAnimTimer, _muerto y nodos | CharacterBody2D; Estadisticas/Hurtbox/AnimalSegmentFlow. _Ready inicia salud y configuración ambiental. Sin setter de salud para restauración; no usar daño simulado. |
| scripts/PlayerMono.cs — PlayerMono | CurrentHealth; MaxHealth de configuración | Velocity, posición, timers, _muerto, animaciones/nodos | Mismas dependencias. Inicializa salud en _Ready; sufijos ambientales deben estar listos antes. |
| scripts/PlayerRataCanguro.cs — PlayerRataCanguro | CurrentHealth; MaxHealth de configuración | Física, timers, nodos, animación, _muerto | Igual; requiere futuro contrato explícito de recursos, sin reflection ni alterar private setters. |
| scripts/PlayerZorro.cs — PlayerZorro | CurrentHealth; MaxHealth de configuración | Física, timers, _muerto y nodos | Igual; guardar solo en frontera autorizada y restaurar después de inicialización por una API aún inexistente. |
| scripts/PlayerOso.cs — PlayerOso | CurrentHealth; MaxHealth de configuración | Física, timers, _muerto y nombres de animación | _Ready fija salud y cachea animaciones según BiomaSaludable; cambiar global después deja cachés inconsistentes. |
| scripts/Estadisticas.cs — Estadisticas | Agua, Comida; salud canónica procede del jugador | HUD, _iconosSalud, barras y caches; configuración de drenaje no es progreso | _Ready reinicia Agua/Comida a máximos, _Process consume y Recuperar suma. Agua/Comida tienen setter privado. SetSalud actualiza HUD, no CurrentHealth del jugador. No basta para restaurar salud real. |
| scripts/FuenteRecurso.cs — FuenteRecurso | _dropeados solo candidato a recorrido exacto futuro con ID estable | _jugadoresDentro, _animacion, referencias y drop físico | CantidadTotal depende del ambiente; _Ready elige apariencia. Reiniciar escena repone fuentes: no permitir restaurar recursos de mitad de recorrido junto a fuentes reiniciadas. |
| scripts/ItemRecurso.cs — ItemRecurso / TipoRecurso | Tipo/Cantidad son configuración, no progreso de cuenta | _recogido, _espera, _vida, cuerpos/colisiones | Recoger llama Estadisticas.Recuperar y QueueFree; no reproducirlo al restaurar ni duplicar drops. Calor existe en enum, no se inventa barra o persistencia de calor. |
| scripts/DecisionNivel.cs — DecisionNivel; scripts/EnvironmentalDecisionNivel.cs — EnvironmentalDecisionNivel; scripts/OceanDecisionNivel.cs — OceanDecisionNivel; scenes/levels/DesicionNieve.cs — DesicionNieve | Elección confirmada, decision key/option/version y estado resultante | _indice, _estado, _decisionTomada, _escribiendo, _dialogoTerminado, _opcionesVisibles, tween y UI según clase | EnvironmentalDecisionNivel hereda DecisionNivel; OceanDecisionNivel hereda EnvironmentalDecisionNivel. Tundra tiene script propio con DecisionSceneFlow. Guardar al confirmar, antes de escena info. No ejecutar ChooseAsync/confirmación HTTP al restaurar. |
| scripts/DecisionSceneFlow.cs — DecisionSceneFlow | Resultado confirmado se convierte a EnvironmentalDecision/EnvironmentalState | _busy, _canRetry y referencias/callbacks | Hoy EnvironmentalDecisionService HTTP y OceanDecisionContext; no es compatible directamente con servicio local. Handle aplica ambiente y cambia a escena informativa. Reemplazo requiere autorización expresa. |
| scripts/InfoDecision.cs — InfoDecision | Frontera decision_info → animal_start; EscenaSiguiente es configuración | _yaSalio, _puedeContinuar, tween y temporización | Cambia escena con Transicion; persistir avance antes de aceptar transición, no repetir decisión. |
| scripts/FinNivel.cs — FinNivel; scripts/AnimalSegmentFlow.cs — AnimalSegmentFlow | Finalización/reinicio del segmento y resultado confirmado | _nivelFinalizado, _busy, _leaving, _active, pausa y UI | FinNivel difiere FinalizarNivel y abre flujo HTTP. AnimalSegmentFlow pausa gameplay hasta confirmación remota. No es un checkpoint intermedio. Futuro commit local debe preceder escena; no usar flujo remoto al continuar local. |
| scripts/MenuPrincipal.cs — MenuPrincipal; scripts/MenuNiveles.cs — MenuNiveles | Selección de partida/perfil y destino, no controles | _cambiando, _recuperando, _admitted, _redirecting, Selection y UI | EntryAccessController/GameApplicationContext/biome gate exigen sesión actualmente. No existe aquí guardado manual local. No declarar juego offline ya disponible. |
| scripts/auth/RecoveryScreen.cs — RecoveryScreen | Seleccionar última partida local en futuro | _entry, _leaving, _endingMessage y controles | Continue hoy depende de BiomeMenu y Endings confirmados; va a menu_niveles o Final. Requiere futura separación de recuperación local y cuenta remota. |
| scripts/globals/Transicion.cs — Transicion | Ninguno; coordina entrega de ResumePlan | Ocupado/_ocupado, _rect y tween | CambiarEscenaValidadaAsync valida antesDeCambiar después de fundido, antes de ChangeSceneToPacked; posible punto futuro de aplicar global, sin I/O síncrono en callback. Validar fallo y conservar recibo. |
| scripts/network/Progress/GameStateStore.cs — GameStateStore; BiomeCardController.cs — BiomeCardController | IDs/revisión/biomas del DTO son contrato legado, no importación autorizada | sesión, generation, _verified, _pending y _committed | GameStateStore exige ID hexadecimal 24 caracteres y sesión; biblioteca usa UUIDv4. No adaptar mediante cast/ID inventado. SceneFor aporta catálogo observado; disponibilidad no debe convertirse en nueva regla local. |
| scripts/network/Services/DecisionCatalog.cs — DecisionCatalog | Catálogo observado de decision keys | Ninguno | Usar IDs verificados en contrato; reglas y versiones deben aprobarse antes de resolver consecuencias localmente. |

## Catálogo y checkpoints propuestos

Todas las rutas de escena siguientes existen en la copia. SceneFor aporta las parejas humana/animal; las escenas Desicion*.tscn referencian los scripts citados y las info*.tscn usan InfoDecision. Los enlaces UID de EscenaInfo/EscenaSiguiente deben validarse en la futura integración real; aquí no se ejecutó ResourceLoader.

| Bioma / TipoNivel | Decision key observada | Humana / animal (bajo res://scenes/levels/) | Información buena / mala (mismo directorio) |
|---|---|---|---|
| ocean / Oceano | ocean_waste_disposal | DesicionDelfin.tscn / bioma_mar.tscn | info_delfin_buena.tscn / info_delfin_mala.tscn |
| jungle / Selva | jungle_transport_route | DesicionMono.tscn / bioma_selva.tscn | info_mono_buena.tscn / info_mono_mala.tscn |
| desert / Desierto | desert_cat_abandonment | DesicionRataCanguro.tscn / bioma_desierto.tscn | info_rata_buena.tscn / info_rata_mala.tscn |
| forest / Bosque | forest_industrial_pesticides | DesicionZorro.tscn / bioma_bosque.tscn | info_zorro_buena.tscn / info_zorro_mala.tscn |
| tundra / Tundra | tundra_fossil_extraction | DesicionNieve.tscn / bioma_nieve.tscn | info_buena.tscn / info_mala.tscn |

Fronteras candidatas para los cinco biomas: human_decision al entrar en escena humana; decision_info después del commit de decisión; animal_start con checkpoint segment-start antes de entrar al recorrido; menu tras resultado animal confirmado por reglas aprobadas. menu se resolvería a res://scenes/levels/menu_niveles.tscn, cuyo gate actual deberá adaptarse con permiso. No cargar Final.tscn calculando umbrales nuevos. No se identificó contrato de checkpoint intermedio persistente en los controladores inspeccionados. FinNivel señala fin, no posición de reanudación. No se propone añadir botón de guardar donde no existe.

Cada frontera guarda IDs, revisión, bioma, progreso, ambiente/consecuencia versionados y ResumeKind/CheckpointKey; snapshot actual únicamente {"mode":"segment_boundary"}. Se restaura el agregado completo, después caché global, después escena validada. No reejecutar efectos de decisión, spawns, consumo ni confirmaciones remotas. Un archivo comprometido o un dato incoherente no se convierte en escena arbitraria: catálogo cerrado.

**Recursos pendientes:** vida/agua/comida son datos reales, pero B04.2A no tiene campos ni snapshot autorizado para ellos. Los private setters y reinicios _Ready impiden restauración segura sin cambios del juego. En animal_start puede preservarse el inicio actual de escena; no afirmar que conserva recursos intermedios. La política de recursos de frontera, su esquema/versionado y API de inicialización quedan por aprobar. Nunca guardar valores intermedios para después restaurarlos con fuentes/objetos reiniciados, pues permitiría duplicación. Posición, NPC y objetos recogidos quedan fuera.

## Ruta duradera exclusiva propuesta

Resolver con Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), no con user:// ni rutas del repositorio. Valor local observado: C:\Users\luis2\AppData\Local. Sufijo fijo propuesto:

`TwoSides\ReconstructionTests\copy-06dc7ade-b3cd-425b-8d79-90dde8ef1ac6\persistence\save.sqlite3`

Ruta completa propuesta: `C:\Users\luis2\AppData\Local\TwoSides\ReconstructionTests\copy-06dc7ade-b3cd-425b-8d79-90dde8ef1ac6\persistence\save.sqlite3`.

El ID fijo identifica esta copia, no se regenera por arranque ni deriva del nombre móvil del directorio. No se consultó ni creó este directorio o archivo. Es diseño: la ausencia de redirecciones de esa ruta no está verificada todavía y debe bloquear su apertura si no se puede demostrar. No crear nada fuera de la raíz autorizada en esta fase.

Proveedor futuro: canonicalizar ruta absoluta, exigir volumen local y contención bajo LocalApplicationData, rechazar UNC, OneDrive/repositorio y reparse points de cada ancestro existente/archivo/sidecars. Validar destino resuelto mediante handles y mantener protección ante cambios de enlaces entre comprobación y apertura; fallar cerrado si no es posible. Revalidar después de creación autorizada. No seguir junctions/symlinks, ni cambiar ACL para superar rechazo. Un simple prefijo textual no basta.

Directorio nuevo: creación exclusiva y manifiesto de propietario/namespace/versiones con formato validado; creación del archivo sin sobrescritura. Directorio/base anterior: no borrar, reemplazar ni inicializar ciegamente; manifiesto y esquema/versiones deben ser reconocidos, ID de copia coincidente e integridad comprobada. Archivo desconocido, vacío o sin manifiesto: mostrar conflicto y detener apertura, sin adoptar por nombre. Recuperación/backup requieren alcance específico y nunca regeneran automáticamente una partida. Las bases de SyntheticSandbox no se importan.

Producción futura utilizará namespace independiente TwoSides\Production, con autorización y decisión de producto previa. No cambiar el sufijo de pruebas para apuntarlo a producción; transición solo con exportación/importación explícita, copia verificada, migración y consentimiento. Mantener origen intacto y no mezclar perfiles/IDs del legado.

## Ciclo de vida y carga/guardado

1. Bootstrap futuro valida identidad de copia/ruta, abre proveedor duradero, verifica integridad/versiones y migra transaccionalmente; no necesita internet. Fallo no crea perfil ni sustituye archivo.
2. Recuperar perfil único mediante GetLocalProfile; solo si ausencia legítima, CreateLocalProfile con UUIDv4 y operación idempotente. No leer .env ni guardar tokens/correos como requisito de juego.
3. Nueva partida exige intención explícita y CreateNewGame con revisión/partida actual esperadas. Nunca archivar automáticamente al fallar ContinueGame.
4. Capturar DTO inmutable en hilo principal, sin nodos, despachar a trabajador serial. GameSaveService → UnitOfWork → SQLiteRepository; no SQL en escenas. Confirmar en UI solo tras recibo de commit; misma operación/digest al reintentar.
5. ContinueGame y LoadGame obtienen partida y agregado coherentes; validar propietario, versión/catálogo y revisión antes de escena. Un resultado de tarea de una sesión/partida anterior no puede aplicarse.
6. Aplicar ambiente y resultados del agregado en hilo principal antes de instanciar bioma/jugador; escena destino y etapa deben concordar con ResumePlan. No usar confirmaciones HTTP del legado para validar guardado local. Las reglas de transición aún pendientes no se inventan.
7. Si commit termina y cambio de escena falla, conservar recibo/estado y reintentar solo presentación. Si rollback, no aplicar consecuencias ni avanzar. Las operaciones compuestas que aún requieren varios métodos públicos del servicio necesitarán una operación de frontera atómica autorizada; encadenarlas no da atomicidad global.
8. Error de almacenamiento conserva último commit, muestra estado no guardado y ofrece reintento explícito sin nueva operación. No sobrescribir con defaults. Gameplay entre fronteras no depende de internet; en frontera no declarar progreso durable si no se pudo guardar. Decisión UX sobre seguir sin guardar requiere aprobación, sin pérdida silenciosa.
9. Cierre futuro drena cola con plazo y confirmación visible de pendientes; no depender únicamente de _ExitTree o cierre forzado. Conexiones/transacciones por operación se disponen; sin conexión global Godot ni pool persistente. Pruebas de cierre real pendientes.

## Plan de pruebas futuro (no ejecutado con Godot)

| Caso | Evidencia requerida |
|---|---|
| 1 Primera ejecución | Ruta exclusiva, creación una sola vez, sin acceso original/OneDrive/user:// legado. |
| 2 Perfil | Singleton, Unicode, reintento y reapertura con mismo ID, sin credenciales remotas. |
| 3 Nueva partida | Intención explícita, archivo anterior conservado y archivado transaccional de partida. |
| 4 Bioma | Los cinco IDs/escenas y revisión/etapa correctos; sin reglas de desbloqueo añadidas. |
| 5 Decisiones | Cronología, digest, retry antes/después de commit, cero consecuencias duplicadas. |
| 6 Recursos | Caso bloqueado hasta aprobar esquema/API/política; no duplicar fuentes ni simular setter con daño/Recuperar. |
| 7 Cierre y reapertura | Proceso nuevo reconoce copia/perfil/base y recupera último commit; cierre abrupto no crea partida vacía. |
| 8 Continuación | human_decision, decision_info, animal_start y menu; rechazo de checkpoint medio no soportado. |
| 9 Ambiente | Healthy/degraded en cinco biomas antes de _Ready; HUD, animaciones y partículas coherentes sin callbacks de elección. |
| 10 Fallos | Lock, disco lleno, permiso denegado, migración/corrupción, commit exitoso con escena fallida; sin sobrescritura ni avance parcial. |
| 11 Sin internet | Arranque/continuación/guardado sin sesión o petición HTTP; validar separación de gates legados. |
| 12 Aislamiento | Monitorizar escrituras autorizadas; sentinel sintético ajeno intacto; junctions/reparse y carrera rechazados. No usar partidas originales para probar. |
| 13 Godot | Build autorizado de referencia y arranque .NET4.6.1, sin C# de tests/globals generados incluidos por glob; worker no toca nodos. |
| 14 Export Windows | Plantilla .NET4.6.1, win-x64, assemblies/deps y e_sqlite3 presentes; arranque en host limpio offline y apertura SQLite, cierre/reapertura. |

Antes de esas pruebas: autorización de archivos exactos, proveedor duradero y ruta externa; decidir versiones/consecuencias/desbloqueo/final/recursos. Repetir regresiones aisladas cuando se autoricen sus escrituras. No instalar runtime o cambiar paquetes globales automáticamente.

## Evidencia de esta fase y pendientes

39 regresiones backend ejecutadas: 39 aprobadas, 0 fallidas. Intento inicial con sandbox falló al crear procesos Node (spawn EPERM en tres archivos, no se ejecutaron sus casos); repetición autorizada fuera de sandbox terminó correctamente, solo loopback/datos sintéticos. Sin Atlas.

43 pruebas SQLite de B04.2A: resultado histórico aprobado, no repetidas aquí. run-checks.ps1 compila/escribe .work y el ejecutor crea/elimina bases dentro de local-persistence; repetirlo contradice la prohibición actual de modificar ese árbol. Por tanto no afirmar 82 pruebas ejecutadas en B04.2B.1. Se verifica integridad estática del árbol protegido, no se reemplaza prueba runtime por hash.

B00 sigue BLOQUEADA por el SID desconocido heredado con Modify/Synchronize ya documentado; sin cambiar ACL. Permanecen pendientes validación operativa/export, recursos, reglas/versiones, proveedor duradero, autorización externa, backups/recuperación y sustitución coordinada de dependencias HTTP. Esta preparación documental es verificable; la integración ejecutable permanece pendiente y no debe iniciarse mientras esos requisitos no estén resueltos. No iniciar B04.2B.2.

## Actualización B04.2B.2A — Infraestructura cerrada

Se implementó el proveedor duradero restringido y la referencia de proyecto descritos en la preparación, exclusivamente para datos sintéticos. Cambia la limitación histórica del constructor: ISaveDatabase sustituye parámetro concreto SyntheticDatabase en servicio/UoW/schema, manteniendo proveedor y43 casos previos. TwoSides.csproj referencia la biblioteca y excluye sus fuentes/pruebas de Compile; mismas propiedades funcionales del proyecto, SDK4.6.1 y frameworks sin cambios. Compilación SDK aislada, sin motor/editor.

Ruta efectivamente validada/utilizada, inicialmente inexistente: C:\Users\luis2\AppData\Local\TwoSides\ReconstructionTests\copy-06dc7ade-b3cd-425b-8d79-90dde8ef1ac6\persistence\save.sqlite3. Ancestros Windows validados por handles/destino resuelto sin reparse, volumen local; ninguna ruta OneDrive/repo/original/user://. Raíz de proyecto y local-persistence no son enlaces; etiquetas cloud de OneDrive en ancestros0x9000701a/0x9000601a son metadatos de nube, no junctions hacia original. No se inspeccionó el original.

Creación exclusiva: base nueva, ownership.json con CopyId/propósito synthetic-infrastructure-only y volumen/FileID, application_id0x54535054, Ready tras migraciones v1/v2/verificación. Reapertura valida reconocimiento/versiones; desconocido se rechaza sin sobrescribir. Handles impiden rename/delete de ancestros/archivo mientras vive proveedor; rechaza hardlinks/reparse, compara ruta final y examina sidecars. Lease serializa proveedores; no es defensa contra malware/escritores con el mismo usuario. Crear directorios solo en sufijo autorizado, no adoptar archivos sin manifiesto. Cierre conserva base sintética; sin recuperación automática ni producción/importación.

Adaptador nuevo integration/sqlite/GodotSqliteInfrastructureAdapter.cs, sin Node/Autoload ni enlaces a escenas. Métodos infraestructura únicamente, catálogo/nombre de perfil ficticios, UUIDs locales y sin secretos. Referencia comprobada por metadata TwoSides.dll; native e_sqlite3.dll de su salida win-x64 cargado mediante API nativa y devolvió3.53.3. No se ejecutó Godot ni probó export.

Compilación: SDK10.0.400, net8.0, GodotSharp/Editor/SourceGenerators4.6.1, proveedor8.0.32 y SQLitePCLRaw2.1.13; ejecutores runtime8.0.30 autocontenido. Obj/bin Godot en integration/sqlite/.work, resto/cache/CLI/temp en local-persistence/.work. Único packageFolder privado en activos. Resultado completo juego:0 errores/63 advertencias del código legado/generado; biblioteca/ejecutores0/0. Sin instalaciones/config global modificadas. SDK iOS contiene target Exec xcrun condicionado a iOS, no importado/ejecutado en Windows.

Pruebas actuales:28 infraestructura +43 SQLite +39 Node=110 aprobadas,0 fallidas finales. Infra incluye perfil/cierre/reapertura/reinicio proceso sin red, transacciones, FK, migraciones, rutas relativas/externas, junction sintética, desconocido sin cambios de hash, disco lleno simulado, sharing denegado/errores sanitizados. Prueba de permisos sin editar ACL; prueba disco no agota volumen. Ejecuciones fallidas previas y correcciones en historial/README. Base/manifest/lease se conservan en AppData; cero bases temporales B04.2A restantes.

B00 conserva riesgo ACL. Faltan recursos/reglas/checkpoints compuestos, durabilidad ante corte en manifest, pruebas del motor/exportación, backups y bootstrap real. No conectar todavía guardado a decisiones/biomas; B04.2B.2B no iniciada.
## B04.2B.2B.2B.3 — Reparación mínima de compilación

Estado COMPLETADA, 2026-10-25. Solo se modificó código de configuración en TwoSides.csproj, más estos documentos autorizados. No se implementó gameplay ni se ejecutó Godot.

Diagnóstico: archivo actual sin ProjectReference, ruta relativa local-persistence/src/TwoSides.LocalPersistence.csproj existente y compatible net8.0; biblioteca usa Compile explícito *.cs.txt y Microsoft.Data.Sqlite[8.0.32]. El informe B04.2B.2A registra una referencia y exclusiones anteriores con imports SDK explícitos, mientras el archivo previo de esta reparación tenía solo Sdk/PropertyGroup. Búsqueda de proyectos/props/targets no encontró referencia activa en otro archivo. Git solo muestra commit inicial645d213 para este proyecto; no demuestra cuándo/quién/proceso cambió configuración. Hecho comprobado: ausencia respecto al informe; causa de pérdida/regresión NO determinada. No atribuir a usuario, OneDrive, herramienta o rollback sin evidencia; no restaurar todo un archivo histórico.

Cambio mínimo: conservar Project Sdk=Godot.NET.Sdk/4.6.1 y las tres propiedades originales(TargetFrameworknet8.0, condiciónAndroidnet9.0, EnableDynamicLoadingtrue). Agregar únicamente ItemGroup con ProjectReference Include="local-persistence/src/TwoSides.LocalPersistence.csproj" y Compile Remove="local-persistence/**/*;integration/sqlite/.work/**/*". No duplicar código SQLite o DLL manualmente. Evaluación MSBuild:83Compile inputs,0fuentes internas/tests/artefactos en Compile y1ProjectReference. No cambios de SDK/paquetes/versiones/estructura completa o a otros archivos de configuración.

Aislamiento de validación: reutilizar SOLO preámbulo existente de integration/sqlite/run-infrastructure.ps1 hasta antes de $config para establecer entorno privado DOTNET_CLI_HOME/NUGET_PACKAGES/cache/scratch/TEMP/MSBUILDDISABLENODEREUSE; con $PSScriptRoot resuelto a integration/sqlite. No editar runner ni imports tempranos del proyecto. Pasar GodotProjectDir absoluto con barras/ final a integration/sqlite/.work/ por línea de comando: el SDK coloca bin/obj bajo integration/sqlite/.work/.godot/mono/temp. Biblioteca/ejecutores y cachés siguen local-persistence/.work. Esta propiedad es solo ruta de SDK en compilación, no nueva raíz de escenas ni cambio project.godot. No usarla para ejecutar/exportar juego. Defaults de un build directo sin este entorno pueden usar .godot y cachés de usuario: procedimiento privado explícito es requisito de validación.

Comandos bajo ese entorno: dotnet restore TwoSides.csproj --configfile local-persistence/NuGet.Config --packages <privatepackages> --disable-parallel -p:GodotProjectDir=<absolute integration/sqlite/.work/>; dotnet build TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -p:GodotProjectDir=<mismo> -v:q. Restore repara activos de ese destino, sin paquetes actualizados ni instalaciones/globalconfig; único packageFolder privado verificado en project.assets.json. Nativeassets incluidos por NuGet sin copias manuales.

Primer setup diagnosticó variable de raíz no asignada y luego un argumento Windows con barra invertida final absorbió -v:q en PowerShell nativo, provocando rutas inválidas/NETSDK1004/MSB3191; corregir solo comando con separadoresforwardslash antes del restore/build satisfactorio. No ocultar intentos fallidos como aprobados; no bases ni gameplay afectados. No hizo falta modificar otros archivos permitidos o pedir ampliación de alcance.

Resultado build Godot:0errores,63advertencias distintas preexistentes (código legado/generado),0nuevas en adaptadores/biblioteca. Biblioteca y ejecutores compilan0errores/0advertencias. SDKGodot4.6.1, net8.0/SDK10.0.400 y runtime de tests8.0.30 conservados; Microsoft.Data.Sqlite/Core8.0.32 y SQLitePCLRaw2.1.13, sin versión nueva. PowerShell Add-Type con DllImport absoluto de e_sqlite3.dll de salidaGodot/runtimes/win-x64/native llamó sqlite3_libversion y devolvió3.53.3; temporales en carpeta privada. No editor/motor, escena, export o SQLite de jugador abiertos para esta carga. Verificación -getItem:Compile,ProjectReference confirma exclusiones/referenciaúnica.

Regresiones reales:42/42progreso-disponibilidad +43/43SQLite +39/39backend=124aprobadas,0fallidas. Nuevasfixtures temporales y childreadonly solo de fixtures, cero bases temporales restantes; backend memoria/loopback sin Atlas. Suites duraderas49/48/28 no ejecutadas para preservar game-progress y persistence. Carga nativa es comprobación adicional, no se cuenta como nueva prueba de final. Disponibilidad libre/consultaAll/idempotencia/rollback conservados sin modificar lógica.

Integridad:623archivos protegidos comparados antes/después, hashes/fechas/ACL .env y ambos almacenes con manifiestos/leases intactos. El inventario excluye únicamente TwoSides.csproj por ser el cambio autorizado frente a los624anteriores; incluye SchemaManager/escenas/scripts/actores/NPC/menús/assets/Express y adaptadorinfra. Cuatro partidas previas permanecen por archivo idéntico, no se abrieron/migraron/escribieron/eliminaron auxiliares. .env278bytes/SHA2564DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, fecha/propietario/ACL/atributos iguales. No valores impresos. Original no accedido; causa histórica de referencia ausente no determinada. B00 riesgoACL sigue pendiente.

Archivos actualizados exactamente6: TwoSides.csproj y backend/docs/{PHASES.md,PHASE_HISTORY.md,DECISIONS.md,GODOT_SQLITE_INTEGRATION_PLAN.md}, local-persistence/README.md. No tests u otros scripts modificados. Reparación COMPLETADA; siguiente integración visual/ejecuciónGodot requiere autorización nueva. Cálculo exacto de finales pendiente de localizar, demo del usuario preservada; no finales/recursos/B05 nuevos ni conexión escenas. Detenerse aquí.