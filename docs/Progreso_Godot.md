# Fase 5, etapa 3: recuperacion y proyeccion en memoria

GameService utiliza IApiClient, SessionManager y GameStateStore. No modifica
escenas, menus ni scripts de jugabilidad. No ejecuta solicitudes al construirse.
Solo implementa GET /api/v1/me/games/current y POST /api/v1/me/games.
No implementa decisiones, finalizacion animal, final-exit, historial o guardado.

## Identidad e interfaces

ICurrentGameService expone CurrentAsync() y CreateOrGetAsync(), sin parametro JWT.
El token se obtiene exclusivamente de SessionManager; no hay userId de entrada.
Se conserva IProgressService, interfaz preliminar de etapa 1 que mezcla operaciones
futuras y JWT explicito. No se implementa esa interfaz amplia ni se agregan metodos
con NotImplementedException: se adopta una interfaz pequena para esta etapa.
Los DTO existentes se reutilizan sin cambios.

SessionManager.Generation es un contador de sesion sin credenciales. Permite
descartar respuestas de una sesion cerrada, incluso si la misma cuenta inicia
sesion otra vez y recibe el mismo JWT durante el mismo segundo. El almacén se
asocia a una unica instancia SessionManager; GameService rechaza una combinacion
con otra sesion. Usar estos objetos desde el hilo principal de Godot.

## Flujo de recuperacion

```csharp
using TwoSides.Network.Services;
using TwoSides.Network.Progress;

// api y session proceden de etapas 1 y 2; el usuario ya inicio sesion.
using var store = new GameStateStore(session);
var games = new GameService(api, session, store);
var result = await games.CurrentAsync();
if (result.Failure == TwoSides.Network.ApiFailure.NotFound
    && result.Error?.Code == "CURRENT_GAME_NOT_FOUND") {
    // Solo por accion explicita del flujo de inicio, no por cualquier error.
    result = await games.CreateOrGetAsync();
}
if (result.IsSuccess) {
    var selection = store.Select("jungle");
    // selection es una instruccion: no cambia escenas ni VariablesGlobales.
}
```

El ejemplo usa using para mostrar la liberacion: en la integracion futura conservar
el store mientras viva la sesion y llamar Dispose al retirar su propietario.

CurrentAsync nunca crea. CreateOrGetAsync consulta primero al servidor y solo hace
POST cuando recibe exactamente HTTP 404 con CURRENT_GAME_NOT_FOUND. No crea ante
otro 404, 401, 409, error de red o timeout. No crea si GET devuelve una actual,
incluida final_pending. El POST envia solo `{}`; la unicidad real la garantiza el
backend incluso si otro dispositivo crea entre GET y POST. Si el POST devuelve
200 por una carrera, se acepta la partida existente. Las solicitudes de esta
instancia GameService se serializan; no hay reintentos automaticos.

## Proyeccion confirmada

GameStateStore mantiene gameId, revision long y el snapshot publico completo.
El estado de ocean, jungle, desert, forest y tundra es independiente; se requiere
exactamente uno de cada bioma. Se validan schemaVersion=1, rulesVersion=1.0.0,
revision no negativa dentro del rango seguro de JavaScript y las combinaciones:

| Estado | Ambiente | Resultado | Destino |
|---|---|---|---|
| human_pending | null | null | Human |
| animal_pending | healthy/degraded confirmado | null | AnimalFromStart |
| completed | healthy/degraded confirmado | good/bad confirmado | Completed, no seleccionable |

Se comprueban disponibilidad y fechas de segmentos para no convertir un snapshot
incompleto en un nivel jugable. No se asignan valores ambientales por defecto.
Los resultados existentes se verifican por coherencia, no se generan decisiones
ni resultados nuevos. No se recalcula el final global en Godot.

Una partida final_pending requiere los cinco completos, ending persistido,
fecha y metadatos finales. PendingEnding expone ese valor y Select devuelve
FinalPending para todos los biomas, sin habilitar su seleccion. No se muestra
ninguna pantalla final en esta etapa. Una partida archived no se acepta como actual.

Snapshot devuelve una copia defensiva, incluida la coleccion de biomas: modificar
un array recibido no altera el estado interno. El servicio tambien copia la
respuesta del transporte antes de conservarla. No hay setters publicos de estados.
No se reciben confirmaciones parciales como si fueran snapshots completos.

Para el mismo gameId, una revision inferior nunca reemplaza el snapshot reciente;
igual revision con distinto contenido es conflicto. La misma revision/contenido
puede confirmar de nuevo la recuperacion. Solo la lectura actual autorizada puede
cambiar el gameId, por ejemplo tras una nueva partida creada en otro dispositivo.
No comparar revisiones entre gameIds distintos. La futura integracion de eventos
debera recuperar el estado vigente tras un recibo idempotente antiguo, sin volcar
su revision sobre el almacen. Aun no se implementa esa sincronizacion.

## Sesion, errores y conectividad

Logout, expiracion, 401 y cambio de usuario limpian el snapshot por suscripcion a
SessionChanged. Las propiedades tambien comprueban la generacion de sesion.
Dispose desuscribe y limpia memoria. Las respuestas en vuelo de otra generacion
devuelven Cancelled y no restauran ni contaminan la nueva cuenta.

Al comenzar la recuperacion IsVerified se desactiva. Si hay fallo, se conserva
solo una copia de consulta del ultimo snapshot; no es seleccionable. Una respuesta
actual inexistente borra esa copia. Solo una recuperacion valida vuelve a habilitar
la interpretacion de destinos. HTTP 401 invalida la sesion que envio la solicitud;
los otros errores mantienen ApiFailure (Transport, Timeout, Conflict, Server, etc.).
Un snapshot malformado devuelve InvalidResponse; revision antigua o contenido
contradictorio devuelve Conflict local sin codigo HTTP inventado.

IsVerified NO es una comprobacion permanente de red: significa que la ultima
recuperacion termino correctamente. No existe modo offline ni se inicia jugabilidad
desde esta capa. La siguiente integracion debera combinar este estado con el
ConnectionGate y la comprobacion periodica para detener inmediatamente el juego
cuando se detecte desconexion; no usar el cache como permiso para jugar sin red.
Esta etapa no crea timers, reintentos ni bloqueos visuales.

No se guardan tokens, cuentas o progreso en disco; no se registran respuestas,
credenciales ni datos sensibles. No se conecta a MongoDB desde Godot.

## Verificacion sin conexiones

```powershell
dotnet build backend/client-checks/ClientChecks.csproj --no-restore -p:NuGetAudit=false
dotnet run --project backend/client-checks/ClientChecks.csproj --no-build --no-restore
dotnet build TwoSides.csproj --no-restore -p:NuGetAudit=false -p:NuGetInteractive=false
```

ProgressChecks.cs.txt usa cliente y autenticacion ficticios, JWT de prueba y reloj
controlado. Conserva los 89 casos previos y comprueba rutas, cuerpo vacio, cinco
biomas, seleccion libre, bloqueo, final pendiente, revisiones, respuestas tardias,
limpieza de sesion, ausencia de logs y fallos de recuperacion. No inicia el motor,
el backend, migraciones o conexiones reales.
