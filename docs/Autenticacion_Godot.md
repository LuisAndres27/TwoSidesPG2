# Fase 5, etapa 2: autenticacion y sesion en memoria

No se modifican escenas, project.godot, MenuPrincipal ni jugabilidad. No hay
autoload, pantallas de registro/login, recuperacion de partidas, timers,
reintentos, sincronizacion o almacenamiento user:// implementados.

## Componentes

- AuthService implementa el IAuthService existente y utiliza IApiClient.
- SessionManager es una clase .NET que recibe IAuthService y un reloj UTC
  inyectable para pruebas. Se debe conservar una instancia en la futura capa
  de integracion e invocarla desde el hilo principal, igual que ApiClient.
- Se reutilizan los DTO y ApiResult existentes, sin duplicar contratos.

AuthService envia exactamente RegisterRequestDto a POST /api/v1/auth/register,
LoginRequestDto a POST /api/v1/auth/login y JWT Bearer a GET /api/v1/auth/me.
No altera usuario, correo ni contrasena. Zod sigue siendo la autoridad de la
normalizacion NFKC/minusculas y validacion (registro: username ASCII 3-32,
correo hasta 254, password 12-128; login: password 1-128). No se usa una
validacion de correo .NET que pueda diferir de Zod. Un registro invalido se
devuelve como HTTP 400, sin iniciar sesion ni corregir datos silenciosamente.

## Uso futuro, no conectado a escenas

```csharp
using TwoSides.Network.Services;
using TwoSides.Network.Session;
using TwoSides.Network.Contracts;

// api es el ApiClient de etapa 1 ya listo dentro del arbol.
var session = new SessionManager(new AuthService(api));
session.LoginRequired += reason => { /* Mostrar login en una etapa posterior. */ };
var result = await session.LoginAsync(new LoginRequestDto {
    Email = correoDelFormulario, Password = contrasenaDelFormulario
});
// Limpiar la contrasena del formulario; no imprimir result ni sus datos.
if (result.IsSuccess) {
    var user = session.User; // Datos publicos actuales, no passwordHash.
}
var account = await session.MeAsync();
session.Logout(); // Limpieza local; no existe revocacion JWT en el backend.
```

RegisterAsync no inicia sesion. LoginAsync almacena solo token, usuario publico
y expiracion; no conserva el DTO de credenciales en campos. Logout elimina las
referencias al token/usuario/expiracion. Las strings .NET son inmutables: eliminar
referencias no garantiza sobrescritura fisica inmediata en memoria. Nunca se
escriben contrasenas/JWT en archivos, configuracion o logs.

## Expiracion y HTTP 401

ExpiresAtUtc usa el menor entre exp del JWT y el inicio de la solicitud mas
expiresIn. El tiempo de red no extiende artificialmente la sesion. Se rechazan
tokens malformados, TTL invalido, sub distinto del usuario o respuestas incompletas.
Leer exp NO verifica firma ni autoriza operaciones: exclusivamente el backend
valida HS256, cuenta vigente y permisos. El reloj del equipo puede diferir del
servidor; un 401 siempre puede exigir nuevo login antes del plazo calculado.

State, IsAuthenticated, User, ExpiresAtUtc, TryGetToken y MeAsync comprueban
expiracion. CheckExpiration permite la futura comprobacion periodica, sin crear
timers ahora. Al expirar se limpian los datos y se emite LoginRequired(Expired)
una vez. Un 401 de login/me limpia la sesion y emite Unauthorized. No hay refresh
tokens, login automatico ni repeticion de la solicitud. TryGetToken permite a
futuros servicios obtener el token transitoriamente sin persistirlo.

Otros servicios protegidos podran invocar ObserveUnauthorized(tokenUsado) al
recibir 401. Ignora tokens de otra sesion. MeAsync actualiza los datos publicos
desde el servidor y rechaza un usuario diferente del que inicio sesion.

SessionChanged y LoginRequired notifican solo estados, nunca JWT o credenciales.
La futura UI debe suscribirse y desuscribirse segun su ciclo de vida, sin lanzar
solicitudes reentrantes desde los eventos. No se implementa aun la pantalla que
solicita login ni el bloqueo de jugabilidad.

## Concurrencia y errores

Un segundo login mientras el primero sigue pendiente devuelve Conflict local
(sin HttpStatus), sin enviar otra peticion ni consumir otro intento del limitador.
Logout invalida respuestas pendientes: un login tardio no restaura una sesion
cerrada y un me antiguo no elimina una sesion nueva. Cada login explicito limpia
la sesion anterior. Tras cerrar sesion durante un login pendiente, esperar a que
termine/cancele antes de iniciar otro para evitar dobles intentos.

429 conserva RetryAfter y se devuelve sin reintentar. Transport, Timeout y Server
mantienen las clasificaciones existentes; un fallo de red en me no borra una
sesion aun vigente ni autoriza jugar offline. El bloqueo por conectividad se
implementara despues. El consumidor debe tratar estos estados por separado de
Unauthorized. Los mensajes del servidor no se imprimen automaticamente.

## Verificacion sin motor ni conexiones

```powershell
dotnet build TwoSides.csproj --no-restore -p:NuGetAudit=false -p:NuGetInteractive=false
dotnet build backend/client-checks/ClientChecks.csproj --no-restore
dotnet run --project backend/client-checks/ClientChecks.csproj --no-build --no-restore
```

El comprobador conserva los 53 casos anteriores y agrega AuthChecks.cs.txt con
IApiClient simulado, JWT ficticios sin firma real y reloj controlado. No instala
paquetes, no inicia Godot/backend ni usa la red o MongoDB. Los tests capturan la
consola y comprueban ausencia de salida durante las operaciones. Las pruebas
del backend permanecen intactas. No se probaron escenas ni conexiones reales.
