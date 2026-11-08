# Fase 5, etapa 1: transporte y contratos

Se agregan clases independientes en `scripts/network/`. No se conectan escenas,
no se crean autoloads y no se modifica `project.godot` ni el csproj del juego.
No hay login automatico, timers, guardado, sincronizacion, reintentos o bloqueo
de jugabilidad implementados. Crear un ApiClient no envia solicitudes.

## Configuracion

`ApiConfiguration` centraliza:

- URL inicial `http://127.0.0.1:3000`.
- Timeout por solicitud: 10 segundos.
- Intervalo reservado para comprobaciones futuras: 10 segundos; no hay scheduler.
- Desarrollo: permite HTTP solo en loopback. Despliegue: construir con
  `development: false`, que exige HTTPS, incluso para loopback.
- URL base sin usuario, contrasena, query, fragmento o prefijo de ruta.
- Endpoints relativos que comienzan por `/api/`, en el mismo origen configurado.

Ejemplo de configuracion de despliegue (dominio ficticio):

```csharp
api.Configuration = new ApiConfiguration("https://api.example.invalid", development: false);
```

No incluir la URI de MongoDB ni secretos JWT del servidor en Godot. El cliente
solo conoce la URL HTTP de Express. No se desactiva la verificacion TLS.
Las redirecciones HTTP estan deshabilitadas para no reenviar Authorization a
otros destinos. El cuerpo de respuesta tiene limite de 4 MiB.

## Uso futuro desde un script

El cliente debe anadirse al arbol y recibir `_Ready` antes de utilizarlo. Todos
los metodos que manipulan nodos se invocan desde el hilo principal de Godot.
Este ejemplo es documentacion; no esta conectado a ninguna escena:

```csharp
using TwoSides.Network;
using TwoSides.Network.Contracts;

// Dentro de _Ready de un nodo de la futura capa de integracion:
var api = new ApiClient();
AddChild(api);
var result = await api.GetAsync<HealthResponseDto>("/api/health");
if (result.IsSuccess)
{
    var health = result.Data;
    // Mostrar estado HTTP. Health NO garantiza que MongoDB este disponible.
}
else
{
    // Clasificar por result.Failure y result.HttpStatus; no imprimir cuerpos.
}
```

Ejemplo de POST (solo para la futura capa de servicios):

```csharp
var result = await api.PostAsync<CreateGameRequestDto, GameResponseDto>(
    "/api/v1/me/games", new CreateGameRequestDto(), jwt);
```

El JWT se proporciona para cada llamada, sin almacenamiento del cliente en
propiedades o disco. No pasar contrasenas o tokens en URL/query. Los metodos no
registran cabeceras, cuerpos, credenciales ni excepciones con datos de terceros.
No volcar objetos LoginResponseDto o solicitudes de autenticacion en logs.

Se crea un HttpRequest por solicitud: llamadas paralelas nunca comparten un nodo.
Al terminar se desconecta la senal y se libera el nodo. Al retirar ApiClient del
arbol se cancelan sus solicitudes y se resuelven como Cancelled. Usar un cliente
de vida persistente en la futura integracion; no destruirlo a mitad de una
operacion del juego sin reconciliar despues el estado confirmado en el servidor.
Cancelar/timeout no demuestra que el servidor haya abortado la operacion.

Cliente e HttpRequest procesan en modo Always para admitir futuras peticiones
durante la pausa. Esta etapa no pausa ni reanuda el juego automaticamente.

## Resultados

`ApiResult<T>` distingue:

- `None`: HTTP 2xx y JSON deserializable con campos requeridos.
- `Transport`: fallo de transporte o inicio de la solicitud.
- `Timeout`: timeout de Godot, sin codigo HTTP confirmado.
- `BadRequest`, `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `RateLimited`:
  HTTP 400, 401, 403, 404, 409 y 429.
- `Server`: HTTP 500-599; `OtherHttp`: otros codigos no exitosos.
- `InvalidResponse`: respuesta 2xx sin application/json, con JSON corrupto,
  tipos incompatibles o campos requeridos ausentes.
- `Configuration`: URL/token invalidos, cliente fuera del arbol o hilo incorrecto.
- `Cancelled`: cliente retirado del arbol antes de terminar la solicitud.

HTTP fallido conserva su clasificacion aunque el cuerpo de error sea HTML o JSON
invalido. Si el error JSON es compatible, `Error` contiene code/message. No mostrar
ese mensaje sin escapar en RichTextLabel ni registrarlo indiscriminadamente.
`RetryAfter` conserva la cabecera, sin programar un reintento. Un 401 no activa
login automatico y un 409 no modifica expectedRevision ni repite el comando.

## Contratos

Fuente: `backend/docs/api.md`, documentos complementarios y validadores actuales.

| Operacion | DTO de entrada | DTO de respuesta |
|---|---|---|
| GET /api/health | ninguno | HealthResponseDto |
| POST /api/v1/auth/register | RegisterRequestDto | UserResponseDto |
| POST /api/v1/auth/login | LoginRequestDto | LoginResponseDto |
| GET /api/v1/auth/me | ninguno | UserResponseDto |
| POST /api/v1/me/games | CreateGameRequestDto (`{}`) | GameResponseDto |
| GET /api/v1/me/games/current | ninguno | GameResponseDto |
| GET /api/v1/me/games/:gameId | ninguno | GameResponseDto |
| POST .../:gameId/decisions | DecisionRequestDto | DecisionConfirmationDto |
| POST .../:gameId/animal-completions | AnimalCompletionRequestDto | AnimalConfirmationDto |
| POST .../:gameId/animal-restarts | AnimalRestartRequestDto | AnimalConfirmationDto |
| POST .../:gameId/final-exit | FinalExitRequestDto | FinalExitConfirmationDto |
| GET /api/v1/me/games?page=1&limit=20 | query | GamesPageDto |
| GET .../:gameId/decisions | HistoryQuery como query | DecisionsPageDto |

Usar el tipo CONCRETO del comando en PostAsync para serializar todos sus campos.
HistoryQuery no es un cuerpo JSON para GET: la futura implementacion de servicios
construira query escapada (biomeId/from/to solo para decisiones), con fechas UTC.
No se implementa esa capa de servicios en esta etapa: solo IAuthService,
IProgressService e IConnectionProbe para inyeccion y futuras pruebas simuladas.

ApiJson usa System.Text.Json del framework, camelCase y campos required.
Conserva null explicitamente, fechas DateTimeOffset, UUID Guid y revisiones long.
Las respuestas del servidor usan UTC; DateTimeOffset conserva el instante y el
offset recibido. Para futuros filtros usar fechas UTC ISO 8601 y escapar la query.
El backend limita revisiones a enteros seguros de JavaScript (comandos hasta
9007199254740990); long evita truncarlas a int en C#.

DTO son contratos de transporte, no otra implementacion de Zod o reglas del
videojuego: no calculan consecuencias, finales ni validan transiciones. Los
campos requeridos detectan ausencia; la validacion semantica completa y aplicacion
del snapshot corresponden a etapas posteriores. No dar por saludable un null.

Identificadores de biomas: ocean, jungle, desert, forest, tundra. Progreso:
human_pending, animal_pending, completed. Partida: in_progress, final_pending,
archived. Ambiente: healthy/degraded o null sin decidir. Resultado de bioma:
good/bad o null. Final: good/medium/bad o null. Se conservan como strings del
contrato; no se serializan enums numericos del juego.

Los comandos solo contienen eventId, expectedRevision y los campos propios
de la operacion; nunca userId, environmentState, resultados ni reglas impuestas
por el cliente. No existe un endpoint separado de calculo del final: los DTO
incluyen ending y metadatos en GameDto y AnimalConfirmationDto.
La revision de una confirmacion repetida puede ser antigua. final-exit devuelve
la revision archivada, no la de la sucesora. Esta capa no actualiza estado local.

## Comprobaciones sin juego ni red

Compilar el proyecto original con dependencias YA disponibles:

```powershell
dotnet build TwoSides.csproj --no-restore -p:NuGetAudit=false -p:NuGetInteractive=false
```

Las comprobaciones independientes usan .NET 10 instalado en este entorno y el
GodotSharp 4.6.1 real de la cache local. No tienen paquetes ni framework de tests
nuevos. RestoreSources apunta solo a la carpeta local, sin feeds de Internet.
En otro equipo configurar GodotSharpAssembly si la cache tiene otra ubicacion.
Si falta un SDK, targeting pack o ensamblado, informar y no instalar automaticamente.

```powershell
dotnet build backend/client-checks/ClientChecks.csproj
dotnet run --project backend/client-checks/ClientChecks.csproj --no-build --no-restore
```

Verifican configuracion, cabeceras, codigos HTTP, JSON incorrecto, camelCase,
null, fechas, long, UUID, ausencia de campos de autoridad y contratos de respuesta.
No instancian ApiClient/HttpRequest ni inician el motor o la red: el ciclo de vida
real de nodos, timeout, senales y concurrencia quedara pendiente de una prueba
autorizada dentro de Godot. La compilacion del juego valida los tipos de Godot.
Los archivos generados del comprobador quedan bajo `.godot/client-checks/` para
no introducir codigo generado en la compilacion del juego. Checks.cs.txt se incluye
solo en el comprobador; Godot no incorpora ese Main.

Las pruebas Node habituales se conservan con `cd backend; npm test`. No ejecutar
integracion real, backend, Godot o migraciones como parte de estas comprobaciones.
