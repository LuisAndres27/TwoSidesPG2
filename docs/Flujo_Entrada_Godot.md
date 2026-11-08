# Coordinador de entrada

Usar exclusivamente `GameApplicationContext.Services.Entry` desde el hilo
principal. Su construcción no hace HTTP ni cambia escenas. No administra
credenciales: la futura pantalla inicia sesión mediante `Services.Session`.

Después del login, la UI llama explícitamente `await Entry.RecoverAsync()`:
primero verifica `/auth/me`, después recupera `/me/games/current`. Reutiliza
`GameService.CreateOrGetAsync`: POST solo tras 404 `CURRENT_GAME_NOT_FOUND`.
No hay reintentos automáticos. Un error bloquea la entrada y conserva su
clasificación `Failure` y `HttpStatus`, sin mensajes técnicos ni credenciales.

`Current` permite consultar sin HTTP estos destinos:

| Destino | Significado |
| --- | --- |
| LoginRequired | Sesión ausente, expirada o rechazada |
| RecoveryRequired | Falta recuperación de la sesión actual o está en curso |
| BiomeMenu | Partida confirmada in_progress |
| PendingEnding | final_pending y ending almacenado; mostrarlo sin recalcular |
| Blocked | Fallo de recuperación o coordinador liberado |

Las recuperaciones simultáneas comparten tarea. Una recuperación ya confirmada
se reutiliza mientras coincidan sesión, partida y revisión. Para refrescar
explícitamente, usar `RecoverAsync(force: true)`. Tras un fallo, una nueva
llamada vuelve a validar y recuperar. No se crea una tarea automática al cambiar
de cuenta: hay que esperar la petición previa y solicitar recuperación de nuevo.

Antes de una futura navegación, llamar `TryConsumeNavigation(resultado)`.
Solo una llamada puede consumir cada confirmación; verifica la generación de
sesión y el progreso actual. Un resultado antiguo no autoriza navegación después
de logout, cambio de cuenta, expiración o revisión. Los resultados son instantáneas,
no permisos permanentes. No almacenar el resultado como autorización offline.

El coordinador no supervisa continuamente la red. El bloqueo en tiempo real
ante desconexiones durante el juego requiere el supervisor posterior. No se han
conectado menús, pantallas ni escenas en esta entrega.

Las pruebas usan el mismo grafo de servicios con HTTP simulado. Cubren orden
de llamadas, creación condicionada, fallos, concurrencia, expiración, navegación
única y respuestas tardías sin ejecutar Godot ni el backend.
