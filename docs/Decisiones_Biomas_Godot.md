# Fase 5, etapa 5: decisiones de los cinco biomas

EnvironmentalDecisionService contiene la logica extraida del servicio del Oceano:
JWT desde SessionManager, revision/gameId desde GameStateStore, UUID por comando,
POST transaccional, validacion de recibo y recuperacion del snapshot completo.
No construye consecuencias ni resultados del juego. No realiza reintentos de POST
automaticamente, ni guarda JWT, contrasenas o pendientes en archivos.

## Catalogo y configuracion de escenas

| Escena | Script | Bioma | Decision |
|---|---|---|---|
| DesicionDelfin.tscn | OceanDecisionNivel | ocean | ocean_waste_disposal |
| DesicionMono.tscn | EnvironmentalDecisionNivel | jungle | jungle_transport_route |
| DesicionRataCanguro.tscn | EnvironmentalDecisionNivel | desert | desert_cat_abandonment |
| DesicionZorro.tscn | EnvironmentalDecisionNivel | forest | forest_industrial_pesticides |
| DesicionNieve.tscn | DesicionNieve | tundra | tundra_fossil_extraction |

No -> reject, Si -> approve. DecisionCatalog valida el par bioma/decision antes
de construir un servicio. No admite pares mezclados ni identificadores arbitrarios.
EnvironmentalDecisionNivel exporta BiomeId; las tres escenas establecen jungle,
desert o forest. El Oceano conserva un adaptador que fija ocean. La Tundra fija
tundra desde su implementacion propia. No se modifican textos narrativos, opciones,
velocidades de texto, recursos visuales ni destinos de informacion existentes.

OceanDecisionService sigue disponible con su constructor y API anteriores, pero
delega por herencia en el servicio comun. El nombre publico PendingOceanDecision
se conserva por compatibilidad; ahora representa el comando de cualquiera de los
cinco biomas y su Command incluye los identificadores reales. No se duplica el DTO
DecisionRequestDto ni se mantienen dos motores de confirmacion.

## Contexto persistente y autenticacion pendiente

Se conserva `/root/OceanDecisionContext` y su metodo Configure(api, session, store,
games), para mantener compatibilidad con etapa 4. Ahora administra un servicio por
bioma y ForBiome(biomeId) lo resuelve. Decisions conserva el adaptador del Oceano.
Todos utilizan la misma sesion y proyeccion de partida. Al retirar el contexto se
disponen los servicios, se desconectan eventos y se pierden pendientes en memoria.

Todavia NO hay bootstrap, autoload, pantallas de login o recuperacion inicial
conectados al menu. No se agregaron para esta etapa. Sin contexto configurado y
sesion/partida verificadas, los botones no envian peticiones ni cambian de escena.
No existen JWT fijos, usuarios automaticos o bypasses de autenticacion en el juego.

El futuro flujo de arranque debe usar los servicios reales de etapas anteriores,
autenticar, recuperar la partida y configurar un contexto persistente. No crear
contextos por escena ni proporcionar tokens o gameIds manuales a los adaptadores.

## Presentacion compartida y Tundra

DecisionSceneFlow comparte bloqueo de clics, mensajes de espera, accion manual
de recuperacion/reintento y transicion despues de confirmar. OceanDecisionNivel y
EnvironmentalDecisionNivel delegan en ese adaptador. DesicionNieve conserva sus
parrafos privados, pregunta, tween y control de avance; solo sus botones y el
reintento invocan el adaptador. Las opciones de la Tundra solo se aceptan cuando
el tween de la pregunta ya las habilito.

DecisionNivel conecta el callable por nombre solo si no existe ya la conexion
pressed de la escena, usando el mismo callable para desconectar al salir. No se
agrega una conexion de delegado diferente sobre una conexion serializada. La
Tundra sigue usando solo sus conexiones serializadas. Los handlers y servicios
tambien bloquean dobles clics antes del primer await.

Solo un recibo compatible Y un snapshot vigente permiten asignar
VariablesGlobales.BiomaSaludable y navegar a la informacion buena/mala. El estado
proviene del ambiente recibido, nunca del boton. Tras esperar una transicion
ocupada se vuelve a comprobar sesion/progreso antes de aplicar. No se modifica
movimiento, animales, combate, recursos, metas, reinicios o finales.

## Fallos e idempotencia

- Sin sesion: Unauthorized, sin enviar HTTP. Sin partida verificada o segmento
  human_pending: Conflict local. El backend sigue validando propietario y secuencia.
- Mientras POST esta pendiente, el snapshot queda no verificado para seleccion.
- Timeout/red/servidor: no se aplica el ambiente ni se avanza. El comando conserva
  usuario, gameId, UUID, expectedRevision y opcion. RetryAsync es explicito y
  conserva exactamente ese contenido; nunca crea un evento alternativo.
- 401 limpia la sesion y exige login. El comando privado solo puede recuperarlo
  la misma cuenta; cambiar de cuenta lo descarta. Las pantallas de reautenticacion
  y su reconexion con esta escena siguen pendientes.
- 409 exige RecoverAsync (GET) antes de permitir un reintento del mismo comando.
  Recuperar el estado no demuestra por si solo que este eventId hizo commit.
- 429 conserva clasificacion y RetryAfter en el resultado del servicio, sin repetir
  solicitudes. El adaptador visual bloquea reintentos por espacio para evitar que
  se ignore el plazo. La futura UI de recuperacion debera habilitar una accion
  explicita tras respetar RetryAfter; no se implementa un temporizador aqui.
- POST confirmado y GET fallido: se conserva el recibo y se recupera con GET,
  sin otro POST. Las revisiones antiguas no reemplazan el snapshot mas reciente.
- Un comando desactualizado puede seguir recibiendo 409 despues de recuperar:
  se conserva bloqueado hasta una resolucion explicita futura. No se adapta
  expectedRevision ni se elige una opcion nueva silenciosamente.

Espacio/ui_accept ejecuta una sola accion cuando la escena habilita reintento:
recuperar si NeedsRecovery; en otro caso reintentar el pendiente. No hay bucles,
backoff automatico ni peticiones de login automaticas. Los mensajes mostrados son
fijos; no se imprimen excepciones, cuerpos, JWT o datos sensibles.

## Dependencias para etapas posteriores

La persistencia user:// no esta implementada. Su contrato futuro debe conservar
cuenta, partida y comando, sin JWT/contrasena. Cerrar el proceso pierde el pendiente
en memoria, pero no borra las decisiones ya confirmadas en el servidor.
El supervisor de conexion y bloqueo global de jugabilidad tambien sigue pendiente;
este adaptador bloquea el avance cuando la confirmacion es incierta y no habilita
modo offline. La monitorizacion futura debe cubrir informacion y recorridos.

Los servicios conservan sus recibos durante la vida del contexto; el futuro ciclo
de nueva partida debera gestionar ese contexto/pendientes confirmados al cambiar
de gameId. Esta etapa no implementa final-exit ni el reinicio de partida.

## Comprobaciones sin motor ni red

```powershell
dotnet build backend/client-checks/ClientChecks.csproj --no-restore -p:NuGetAudit=false
dotnet run --project backend/client-checks/ClientChecks.csproj --no-build --no-restore
dotnet build TwoSides.csproj --no-restore -p:NuGetAudit=false -p:NuGetInteractive=false
```

Se conservan los 236 casos anteriores, incluidos los 64 del adaptador del Oceano.
EnvironmentalDecisionChecks agrega los cinco pares, No/Si, healthy/degraded,
sesion ausente/expirada, ausencia de partida, biomas bloqueados, doble clic,
timeout/red/servidor, 401/409/429, mismo comando y revisiones antiguas, sin logs.
La compilacion del proyecto valida los tipos reales de Godot. Senales y escenas
visuales en ejecucion quedan pendientes de una prueba autorizada con el motor.
No se ejecuta Godot, backend, integracion MongoDB ni migraciones en estos comandos.
