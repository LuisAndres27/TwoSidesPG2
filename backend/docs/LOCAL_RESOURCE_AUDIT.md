# B04.2B.2B.2D.1 — Auditoría de recursos locales

Fecha: 2026-10-26. Investigación estática de la copia de pruebas; sin ejecución ni cambios de producción. El usuario confirma C.2C.4: 13/13 comprobaciones manuales y cero errores nuevos reportados. Las260 pruebas son evidencia histórica, no reejecutada en esta auditoría.

## Fuentes y precedencia

Se revisaron los diez documentos solicitados (ninguno falta), SchemaManager/Models/GameSaveService/SQLiteRepository/UnitOfWork, políticas y pruebas locales, actores/Estadisticas/Hitbox/Hurtbox/FuenteRecurso/ItemRecurso, escenas animales y navegación. Las rutas de esta auditoría son relativas a la raíz de la copia.

Algunos párrafos antiguos de BIOME_PERSISTENCE_MAPPING y SAVE_INTEGRATION_CHANGE_PLAN proponen hidratar recursos de checkpoints. La instrucción vigente de D.1 y las fases C.2C.3–4 prevalecen: muerte, reinicio o abandono implican entrada animal original con recursos iniciales y ambiente confirmado. No se modifican esos documentos históricos fuera de los siete archivos autorizados para D.1. No diseñar recuperación intermedia ni pérdida de decisión.

## Comparación de los cinco animales

Los valores son defaults de código contrastados con las escenas de personaje y bioma; no mediciones nuevas del motor. La búsqueda no encuentra overrides de MaxHealth/AguaMax/ComidaMax en esas escenas; sí encuentra ActivarAgua=false del delfín. Agua/Comida pertenecen a Estadisticas, no a campos de cada Player.

| Bioma y escena animal | Actor / escena de personaje | Vida inicial y límites reales | Agua y comida iniciales | Consumo/recuperación | Daño y muerte |
|---|---|---|---|---|---|
| ocean; scenes/levels/bioma_mar.tscn | scripts/PlayerDelfin.cs; scenes/characters/player_delfin.tscn | MaxHealth=3; CurrentHealth=_Ready→MaxHealth; daño con piso0 | Agua=AguaMax100 pero inactiva; comida100 activa | Estadisticas._Process/Recuperar; no drenaje de agua activo | OnReceivedDamage, guarda _muerto/invulnerabilidad, Die al llegar0 |
| jungle; bioma_selva.tscn | scripts/PlayerMono.cs; player_mono.tscn | MaxHealth3; CurrentHealth inicial3; AplicarDanio con piso0 | Agua100 y comida100 activas | Mismos métodos compartidos, multiplicador ambiental | OnReceivedDamage y RecibirDanio→AplicarDanio; Die si<=0 |
| desert; bioma_desierto.tscn | scripts/PlayerRataCanguro.cs; player_rata_canguro.tscn | MaxHealth3; CurrentHealth inicial3; piso0 | Agua100 y comida100 activas | Estadisticas._Process/Recuperar | OnReceivedDamage descarta amount<=0; Die si<=0 |
| forest; bioma_bosque.tscn | scripts/PlayerZorro.cs; player_zorro.tscn | MaxHealth3; CurrentHealth inicial3; resta directa: puede quedar negativo; HUD muestra piso0 | Agua100 y comida100 activas | Estadisticas._Process/Recuperar | OnReceivedDamage avisa/descarta amount<=0, Die si<=0 |
| tundra; bioma_nieve.tscn | scripts/PlayerOso.cs; player_oso.tscn | MaxHealth3; CurrentHealth inicial3; resta directa sin clamp ni guard amount<=0; HUD piso0 | Agua100 y comida100 activas | Estadisticas._Process/Recuperar | OnReceivedDamage, Die si<=0; no equiparar su validación a otros actores |

Todos inicializan CurrentHealth en _Ready y actualizan HUD con Estadisticas.SetSalud. SetSalud solo ajusta la representación _saludActual/_saludMax: no cura ni cambia CurrentHealth del actor. No se encontró API de recuperación de vida comparable a Recuperar(Agua/Comida). No inventar tope aplicado al campo CurrentHealth de zorro/oso; sus diferencias se conservan sin corregir mecánicas.

Los GetNode de Hurtbox/Estadisticas difieren: delfín, mono y rata admiten búsqueda local y fallback /root/Estadisticas; zorro recorre hijos buscando tipo Estadisticas; oso busca su hijo. Las escenas inspeccionadas contienen Estadisticas por personaje; no debe confundirse el fallback con un autoload efectivamente presente.

## Aritmética compartida y efectos reales

Estadisticas.cs: AguaMax=100, ComidaMax=100, DrenajeAgua=2.5, DrenajeComida=2.0, RecursosParaLlenar=3. _Ready asigna los máximos. _Process(delta) resta drenaje*delta*MultiplicadorDrenaje, solo si la estadística está activa, con piso0. MultiplicadorDrenajeBueno=0.6 y Malo=1.6, seleccionados por VariablesGlobales.BiomaSaludable. Tasas derivadas: agua1.5/4 unidades por segundo y comida1.2/3.2, saludable/degradado respectivamente; no son nuevas reglas.

Recuperar(tipo,unidades) suma máximo*unidades/max(1,RecursosParaLlenar), con techo del máximo, solo para Agua/Comida activas. ItemRecurso.Recoger encuentra Estadisticas, llama Recuperar(Tipo,Cantidad) y QueueFree; _recogido evita doble consumo. TipoRecurso incluye Calor, pero Recuperar no tiene rama Calor: no afirmar que existe una barra/calor persistente o efecto de recuperación implementado. Las unidades normales son positivas; no se altera validación de cantidades.

MultiplicadorVelocidad usa el menor cociente agua/máximo/comida/máximo activo, clamped0..1, y Lerp(MultiplicadorMinimo=0.5,1,factor). Los actores lo usan para velocidad; agotamiento no llama Die en Estadisticas. No atribuir Game Over automático al agua/comida0: el código inspeccionado reduce velocidad, no inflige daño por hambre/sed.

Hurtbox._PhysicsProcess obtiene Hitbox superpuestas, llama TakeDamage(Damage), aplica CooldownDano=2 y emite ReceivedDamage. Hitbox.Damage default1, con posibles exports de enemigos/escenas: no asumir todos los golpes iguales. Cada Player conecta ReceivedDamage→OnReceivedDamage y aplica sus guards/timers. NpcAnimal.OnHitboxBodyEntered llama además RecibirDanio(Danio,GlobalPosition) al mono; esa vía y Hurtbox pueden competir y no equivalen a dos daños efectivamente aceptados. Auditar golpes aceptados después del guard, no solapamientos brutos, si se autorizara esa métrica.

## Derrota, reinicio y datos transitorios

Die de cada actor usa _muerto para una sola derrota, pone Velocity=Zero, deshabilita física y llama GameOver.MostrarDerrota. ZonaMuerte.OnBodyEntered→CallDeferred(MostrarGameOver) llama la misma pantalla al tocar jugador; no necesariamente pone vida0 ni pasa por Die. Una derrota por caída y una muerte por vida agotada deben tener causas distintas o desconocida, sin inventar dato no disponible.

assets/sprites/ui/GameOver.cs: MostrarDerrota usa _mostrado, pausa y fundido; Reintentar→AnimalSegmentFlow.RestartLocalAsync. assets/sprites/ui/MenuPausa.cs: ReiniciarNivel usa exactamente ese reinicio; IrMenuNiveles y GameOver.VolverMenu usan ReturnToLevelsLocalAsync. LocalAnimalRestart consulta decisión/ambiente, resuelve escena original y relee contexto antes de navegar; no escribe SQLite. El puente prepara el bool ambiental absoluto antes de ChangeSceneToPacked y libera pausa. Los objetos y enemigos se reinstancian normalmente; no se conserva su árbol vivo.

| Animal | Entrada local original en escena |
|---|---|
| Delfín | (25,458) |
| Mono | (79,176) |
| Rata canguro | (209,478) |
| Zorro | (342,184) |
| Oso | (571,191) |

Memoria temporal: CurrentHealth, Agua/Comida, posición/velocidad, _muerto, timers de daño/control/invulnerabilidad, estados de animación/IA, objetos recogidos, proyectiles/drops, FuenteRecurso._dropeados/_jugadoresDentro, ItemRecurso._recogido/_espera/_vida, pausa/fundido y permisos de navegación. FuenteRecurso elige cantidad por ambiente (defaults3 bueno/2 malo, no garantía de todos los exports); SoltarUnRecurso instancia un ítem y aumenta _dropeados. Una instancia nueva reinicia esos campos.

Memoria global distinta: VariablesGlobales.BiomaSaludable es proyección del bioma abierto; su diccionario de estados no sustituye las cinco filas ambientales SQLite. GameApplicationContext.Local mantiene perfil/partida/adaptador; guards débiles/tareas/busy controlan navegación, no son estadísticas duraderas.

## Qué persistir

Ya persistido: IDs de perfil/partida, revisión/estado de progreso, decisión/key/option/orden/consecuencias versionadas, environmental_state y referencia a decisión/operación, fechas y snapshot de frontera. No hay columnas de salud/agua/comida actuales ni recursos intermedios en el snapshot admitido: GameSaveService.BoundarySnapshot es {"mode":"segment_boundary"}.

Permitido como diseño futuro: eventos de derrota/reinicio/entrada y duraciones, y opcionalmente resúmenes agregados de consumo/daño cuando exista captura aprobada. Nunca usar estos datos analíticos para hidratar posición/vida/agua/comida o mundo. Mantener una nueva sesión animal por cada entrada/reinicio/reintento, con ambiente persistido, sin cambiar elección.

No persistir como checkpoints: coordenadas, recursos actuales, pickups, agotamiento, timers, IA y velocidades. No reproducir acciones acumulativas al reconstruir ambiente. FinNivel.OnBodyEntered→FinalizarNivel detecta meta; CompleteBiome sigue sin conexión local y no se implementa en esta auditoría.

Véanse [eventos](GAMEPLAY_EVENT_AUDIT.md), [estadísticas](GLOBAL_STATISTICS_DESIGN.md) y [plan](LOCAL_STATISTICS_IMPLEMENTATION_PLAN.md).

