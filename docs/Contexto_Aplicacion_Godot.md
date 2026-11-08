# Contexto persistente de aplicación

`GameApplicationContext` es un autoload junto a `Transicion`. Su nodo y su
`ApiClient` hijo permanecen bajo la raíz al reemplazar `CurrentScene`.
Construye una sola composición `GameApplicationServices`: Auth, Session,
Progress, Games y los cinco servicios de decisiones. La configuración HTTP
sigue centralizada en `ApiConfiguration`; no hay solicitudes, login, timers
ni recuperación automática durante la construcción.

Desde futuros componentes del hilo principal:

```csharp
var app = GetNode<GameApplicationContext>("/root/GameApplicationContext");
var session = app.Services.Session;
var games = app.Services.Games;
// Solo por una acción explícita futura: await session.LoginAsync(formulario);
// Después, el futuro coordinador decidirá cuándo recuperar la partida.
app.Logout();
```

No crear sesiones ni almacenes por escena. La fachada compatible
`/root/OceanDecisionContext` delega en los mismos servicios; se añade de forma
diferida al arrancar para respetar la construcción del árbol. Las escenas
actuales conservan su resolución y fallan de forma segura si no está disponible.
`Configure` solo acepta las dependencias de la composición compartida.
La fachada no es propietaria de los servicios ni los destruye al salir del árbol.

`Logout()` borra JWT, usuario, vencimiento, progreso, recibos y comandos pendientes
en memoria, manteniendo las instancias para otra sesión. Las respuestas en vuelo
quedan invalidadas por la generación de sesión y la identidad del pendiente.
Cerrar sesión no revoca una petición ya recibida por el servidor. No se escribe
en disco; una expiración o 401 conserva la política existente de recuperación
de pendientes para la misma cuenta, distinta del cierre explícito de sesión.
Al salir del autoload se liberan suscripciones y servicios; el transporte hijo
cancela sus peticiones mediante su ciclo de vida existente.

Las comprobaciones locales usan un transporte simulado y la composición .NET;
la compilación usa GodotSharp real. La persistencia durante cambios de escena y
la inserción diferida de la fachada requieren además una comprobación visual
posterior autorizada en Godot. Esta entrega no ejecuta el motor.

Pendientes: pantallas de autenticación, coordinador de entrada, recuperación
inicial, persistencia `user://` y supervisión de conectividad. Sin sesión y
partida verificadas las decisiones continúan bloqueadas.
