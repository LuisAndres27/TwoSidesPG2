# Fase 5, etapa 4: decision del Oceano

Solo DesicionDelfin.tscn cambia de script: usa OceanDecisionNivel, subclase de
DecisionNivel. Conserva sus dialogos, botones No/Si, escenas informativas UID
y transicion existente. DecisionNivel solo agrega un metodo virtual y helpers
protegidos para esperar la API. Selva, Desierto, Bosque y Tundra conservan sus
scripts, escenas y comportamiento anterior. No se cambia la jugabilidad animal.

## Dependencia pendiente, sin accesos alternativos

La escena busca `/root/OceanDecisionContext`. No se registra un autoload ni se
modifica el menu para crearlo. Mientras no exista ese contexto, la escena bloquea
la decision con el mensaje de que faltan login y recuperacion de partida.
No existen JWT fijos, usuarios de desarrollo ni partidas inventadas en el juego.

El futuro bootstrap autenticado debe crear una instancia persistente de ese nodo
y llamar Configure con ApiClient listo, SessionManager autenticado, GameStateStore
y GameService de la misma sesion. Esa configuracion no hace solicitudes por si
misma. No crear el contexto dentro de la escena temporal ni destruirlo al cambiar
a informacion: el comando pendiente debe sobrevivir en memoria entre escenas.
Al eliminar el contexto se dispone el servicio y se pierde el pendiente en memoria.

```csharp
// Solo despues de autenticar y recuperar la partida mediante los servicios reales:
var context = new TwoSides.Network.OceanDecisionContext { Name = "OceanDecisionContext" };
context.Configure(api, session, store, games);
GetTree().Root.AddChild(context);
// Ningun token o gameId se proporciona manualmente a la escena.
```

Este ejemplo no esta conectado a menus o pantallas de autenticacion. No implementa
recuperacion automatica desde el arranque ni habilita probar con tokens externos.

## Flujo de confirmacion

OceanDecisionService recibe IApiClient, SessionManager, GameStateStore e
ICurrentGameService. Solo admite la decision del Oceano:

- No: optionId=reject.
- Si: optionId=approve.
- biomeId=ocean; decisionId=ocean_waste_disposal.
- Ruta real: POST /api/v1/me/games/:gameId/decisions, incluyendo el ID de partida;
  la doble barra de la solicitud corresponde al parametro gameId.

Una nueva decision requiere sesion valida, snapshot verificado in_progress y
Ocean en human_pending. El servicio genera un UUID y conserva usuario, gameId,
expectedRevision y comando. JWT solo se obtiene de SessionManager al enviar;
no forma parte del pendiente. No se envian consecuencias ni resultados del cliente.

Un pendiente existente impide otra decision, incluso con otra opcion. La llamada
en vuelo bloquea doble clic y reintentos simultaneos; las conexiones duplicadas
de botones de la escena original tampoco generan otro envio porque el handler
marca espera antes del primer await. Los otros biomas mantienen sus conexiones.

Se valida que el recibo corresponda al mismo evento, partida, decision, opcion y
revision esperada+1, y que el ambiente sea healthy o degraded. El ambiente nunca
se determina a partir del boton en el script de presentacion.
Despues de POST confirmado se hace un GET del progreso actual a traves de
GameService: es una lectura de reconciliacion, no otro POST ni un reintento oculto.
Se exige ocean animal_pending con ambiente/fecha/version compatibles con el
recibo y revision de snapshot >= revision confirmada. Un recibo antiguo no se
convierte en un snapshot ni reemplaza progreso mas reciente. Si no se puede
reconciliar, no hay cambio de ambiente global ni transicion.

Solo tras recibo y snapshot compatibles, OceanDecisionNivel escribe
VariablesGlobales.BiomaSaludable y elige la escena informativa buena/mala segun
el ambiente recibido. Antes de navegar vuelve a comprobar sesion y snapshot,
incluido despues de esperar una transicion ocupada. Las escenas informativas
y sus enlaces al recorrido animal se conservan.

## Fallos, accion explicita y pendiente en memoria

Durante espera se ocultan las opciones y se muestra un mensaje fijo, sin incluir
cuerpos de respuesta, token o detalles del driver. No se permite avanzar con
confirmacion incierta. Ante fallo, espacio/ui_accept permite UNA accion manual:

- Timeout/red: RetryAsync envia exactamente el mismo UUID y cuerpo original.
  No se cambia expectedRevision aunque el servidor pudiera haber hecho commit.
- 409: NeedsRecovery bloquea RetryAsync. La primera accion ejecuta RecoverAsync
  (solo GET); otra accion explicita permite recuperar el recibo repitiendo el
  comando original. No se genera un UUID nuevo ni se cambia la opcion.
- 401: se invalida la sesion y se solicita nuevo login. El pendiente privado se
  conserva para la misma cuenta, pero no es visible/enviable sin autenticarla.
  Una cuenta diferente limpia el pendiente. La pantalla de reautenticacion aun
  no existe: no se agrega un atajo; el futuro flujo debera recuperar progreso y
  habilitar la accion de reintento, o reabrir esta escena con el mismo contexto.
- POST confirmado, GET fallido: se conserva el recibo. RecoverAsync consulta de
  nuevo sin repetir POST. Reintentar la transicion tampoco crea otra decision.
- Cambio de sesion durante una respuesta: se descarta esa respuesta. Excepciones
  inesperadas del transporte se saneán, conservando pendiente y exigiendo recuperar.

Si tras 409 el progreso indica que la revision avanzo por otra operacion, un
reintento del comando original puede seguir en conflicto. Se mantiene bloqueado;
la resolucion explicita de operaciones rechazadas queda pendiente. No se permite
silenciosamente reemplazar el evento, adaptar su revision ni sobreescribir la
decision de otro dispositivo. Tampoco se sigue una partida sucesora para aplicar
una decision pendiente de una partida anterior.

RecoverAsync puede devolver Conflict aun despues de un GET correcto cuando no
hay recibo de ESTE eventId. NeedsRecovery pasa a false para permitir el siguiente
reintento explicito; conocer solo el ambiente no prueba la identidad del evento.

## Siguientes etapas

No se escribe user://. Cerrar el proceso pierde el pendiente; el progreso que
ya quedo confirmado sigue en el backend. La persistencia futura debe guardar
solo usuario, partida, UUID y comando original, sin JWT o contrasena, restaurarlo
tras autenticar la misma cuenta y consultar primero el estado vigente.

El supervisor de conectividad y el bloqueo global aun no estan integrados.
Esta escena impide decidir/avanzar mientras una confirmacion es incierta; no
habilita juego offline. La futura puerta global debera supervisar tambien las
escenas informativas y el recorrido animal. Health por si solo no confirma MongoDB.

No se implementan decisiones de otros biomas, progreso animal, finales, nuevas
pantallas, migraciones o endpoints.

## Verificacion local

```powershell
dotnet build backend/client-checks/ClientChecks.csproj --no-restore -p:NuGetAudit=false
dotnet run --project backend/client-checks/ClientChecks.csproj --no-build --no-restore
dotnet build TwoSides.csproj --no-restore -p:NuGetAudit=false -p:NuGetInteractive=false
```

OceanDecisionChecks usa JWT ficticios y respuestas en memoria exclusivamente en
el proyecto de comprobaciones, nunca en el juego. Comprueba mapeo, consecuencias
confirmadas, requisitos, doble clic, 401/409, timeout/red, mismo comando, lectura
posterior, aislamiento de cuentas y revision antigua. Conserva todos los casos
anteriores. La compilacion valida la subclase y los tipos reales de Godot; el
ciclo visual, senales y transiciones en ejecucion requieren una prueba posterior
autorizada con el motor. No se inicia Godot ni un backend en estas comprobaciones.
