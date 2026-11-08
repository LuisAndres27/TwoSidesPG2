# statistics-only-v1 — contrato B79

Estado: implementado y probado con Express aislado/almacén ficticio persistente. Sin despliegue ni Atlas. Windows PC, Godot/.NET 8. No reemplaza el protocolo legacy Sync v2 ni una autorización de ejecución real.

## Transporte y ruta

`POST /api/v1/statistics/events`. Namespace estadístico independiente. No tiene rutas de consulta pública por instalación, sesión, partida o jugador, ni endpoints de guardado/recuperación. La aplicación de B79 exige `statistics-offline-test` y capacidades sintéticas auténticas de sus constructores; no puede sustituir la composición principal.

Producción futura: HTTPS con validación normal de cadena/nombre, sin redirecciones; credencial ligada al origen exacto. La única excepción HTTP implementada exige capacidad sintética explícita y host literal 127.0.0.1. No permite hosts externos HTTP. No se habilitó ninguna configuración permanente del juego.

Content-Type application/json UTF-8; Content-Encoding identity/sin compresión. Sin parámetros de query ni Origin de navegador. CORS no autentica clientes nativos: el receptor no habilita acceso de navegador. Cuerpo máximo 32768 bytes, profundidad JSON acotada, sin claves repetidas. Lotes de 1–5 elementos. Respuesta máxima aceptada por el cliente: 16384 bytes application/json.

```json
{
  "Contract": "statistics-only-v1",
  "Events": [
    { "EventJson": "<serializacion inmutable del DTO B77>", "PayloadHash": "<sha256 lowercase de EventJson UTF-8>" }
  ]
}
```

EventJson es una cadena JSON de máximo 4096 caracteres y el cliente además limita sus bytes UTF-8. Evita recalcular un hash diferente por el orden de propiedades o escapes entre System.Text.Json y JavaScript. El servidor verifica el hash de esos bytes y analiza el objeto con claves cerradas. No confundir hash con firma/autenticidad. Data mantiene la representación B77: cadena con objeto JSON cerrado, no campos libres. No se modifica ningún evento histórico para transportarlo.

## DTO B77, versión 1

Todas las propiedades siguientes son obligatorias; los campos no aplicables se envían como null. No se admiten propiedades adicionales.

| Campo | Restricción |
| --- | --- |
| EventId | UUID v4 lowercase compatible con el ID estable derivado de B77 |
| SchemaVersion | Entero literal 1 |
| InstallationId | UUID v4; debe coincidir con la identidad autenticada |
| SessionId | UUID v4 estadístico, sin consultas públicas por él |
| Type | Uno de los nueve tipos de la tabla siguiente |
| OccurredAtUtc | UTC real B77: `yyyy-MM-ddTHH:mm:ss.fffZ` o `yyyy-MM-ddTHH:mm:ss.fffffff+00:00`; fecha válida |
| GameId | Token estadístico hexadecimal lowercase de 32 caracteres, o null; nunca ID de propietario local |
| BiomeId | ocean/jungle/desert/forest/tundra, o null |
| DurationMs | Entero positivo hasta 60000 solo en playtime_interval; null en otros tipos |
| Data | Cadena de máximo 1024 caracteres con objeto JSON de campos estrictos |

| Type | GameId/BiomeId | Data |
| --- | --- | --- |
| installation_registered | null/null | `{}` |
| session_started | null/null | status=open |
| session_ended | null/null | status=closed/interrupted |
| game_started | token/null | `{}` |
| game_completed | token/null | ending=good/medium/bad |
| biome_entered | token/bioma | `{}` |
| biome_completed | token/bioma | result=good/bad |
| environmental_decision | token/bioma | decisionKey, option=approve/reject, state=healthy/degraded |
| playtime_interval | token/bioma | state=ActiveHuman/ActiveAnimal, startMs/endMs enteros seguros no negativos, excluded=false, active=true |

Para intervalos, endMs−startMs=DurationMs y duración 1–60000. No se aceptan pausas/menús como tiempo efectivo. Offset relativo a sesión, máximo Number.MAX_SAFE_INTEGER; no es reloj civil.

Decisiones: ocean_waste_disposal, jungle_transport_route, desert_cat_abandonment, forest_industrial_pesticides, tundra_fossil_extraction, asociadas respectivamente a los cinco biomas. reject→healthy y approve→degraded. No se calculan nuevos finales ni se reconstruye la partida en el receptor: valida valores/coherencia estadística, no acredita que el animal alcanzó una meta física.

Fechas: máximo cinco minutos en el futuro y 90 días hacia atrás respecto del servidor. Se conservan los dos formatos reales y su hash; el servidor trunca la fracción solo para comparación de fecha y obtiene día/mes UTC para agregados. No conserva el timestamp preciso en el almacén técnico. B77 asigna a ciertos intervalos UTC de captura/proyección, no UTC exacta de inicio: los períodos son del timestamp declarado, no una reconstrucción forense de actividad.

La duración completa de un intervalo se asigna a ese único día/mes, sin repartirla entre medianoches ni volverla a sumar. Un intervalo de frontera puede desplazar hasta su duración válida (máximo 60 s) entre días; una proyección tardía puede desplazar el período más. Las tendencias representan captura declarada con esa cobertura, no tiempo civil exacto de juego.

## Autenticación

Authorization: Bearer con credencial técnica de instalación. En B79 la emite únicamente un registro de pruebas inyectado en memoria, 256 bits aleatorios, scope exacto statistics:write, caducidad predeterminada 15 minutos (máximo de pruebas una hora), revocación explícita. Se almacena el hash del token en RAM, no su texto en disco. La CLI/servidor de pruebas no ofrece emisión pública ni usa Auth v1/JWT de jugador. El fixture de procesos recibe un token ficticio por stdin redirigido; stdout contiene solo puerto y agregados, nunca tokens.

La instalación declarada no autentica por sí sola. Token ausente/inválido/vencido: 401; scope distinto o instalación ajena: 403. Sin permisos de administración, consulta de terceros o progreso. No hay secreto global dentro de Godot. El proveedor cliente debe estar ligado al origen y la credencial no se envía si la audiencia no coincide.

Antes de producción se necesita provisión autorizada, custodia Windows DPAPI CurrentUser, renovación/rotación y revocación duradera específicas de estadísticas. Para la primera campaña puede utilizarse activación técnica de un solo uso aprobada por el propietario y canjeada por HTTPS; no cuenta personal ni correo. La emisión abierta para un juego público necesita controles de abuso adicionales. Un cliente Windows no puede probar por un UUID que es una copia genuina ni proteger un secreto global contra quien controla el equipo.

## Recibos y errores

```json
{
  "Contract": "statistics-only-v1",
  "Receipts": [
    { "EventId": "<id del evento>", "PayloadHash": "<hash recibido>", "Status": "accepted", "Code": "ok" }
  ]
}
```

Statuses: accepted, duplicate, rejected, retryable. accepted/duplicate solo con Code=ok. rejected: invalid_event, hash_mismatch, unsupported_version, invalid_time, event_expired, event_conflict, fact_conflict. retryable: storage_unavailable o quota_exceeded. Nunca cuerpos originales, datos libres, stacks, URI o credenciales en errores.

El cliente comprueba toda la estructura, IDs/hash contra su lote y unicidad antes de aplicar recibos. Admite respuestas parciales y reordenadas. Confirma únicamente accepted/duplicate reconocidos. Los ausentes o transitorios permanecen pendientes; rejected queda permanent_failure local sin borrar el evento. Un ID/hash ajeno o duplicado en la respuesta invalida su aplicación. Si falla un commit local durante aplicación, conserva leases/recibos ya confirmados y recupera los restantes; no inventa una confirmación global.

HTTP: 200 con recibos; 400 invalid_request/unsupported_contract; 401 unauthorized; 403 forbidden; 404 not_found; 413 payload_too_large; 415 unsupported_media_type; 429 rate_limited con Retry-After; 500 internal_error sanitizado. Un fallo de persistencia por evento puede expresarse como recibo retryable dentro de 200, incluso cuando el commit resultó incierto. Versión de evento desconocida devuelve rejected/unsupported_version, sin conversión arbitraria.

El cliente pausa ante 400/401/403/404 hasta revisión/renovación explícita en esa instancia; conserva un aplazamiento de 24 h en SQLite, por lo que un reinicio no crea un bucle inmediato. ResumeAuthenticationAsync vuelve a habilitar esos pendientes. Otros fallos HTTP, timeout, red o respuesta inválida aplican reintento. Cancelar no confirma eventos. Una respuesta HTTP 200 vacía no confirma el lote.

## Reintentos, cuotas y deduplicación

Una pasada y solicitud simultánea por worker; timeout 15 s, lease B77 60 s, lotes de cinco. Backoff 30 s exponencial hasta 1 h, variación de 0.8–1.2 y límite final de 24 h para respetar Retry-After. Los plazos persistidos evitan girar contra el servidor; no se usa el hilo principal para HTTP. Nuevos códigos de aplazamiento utilizan columnas existentes: no cambia el checksum de statistics-only-v1.

Política de pruebas específica, no cuota vitalicia: 60 solicitudes/minuto por instalación, 120/minuto por IP, máximo 6000 eventos nuevos por instalación/día UTC. Hasta 2880 intervalos de 30 s por 24 h de juego caben con margen para otros hechos. Un duplicado consume la limitación de solicitudes, no vuelve a consumir eventos nuevos ni a sumar contadores. La cuota diaria devuelve un recibo retryable y Retry-After hasta el siguiente día UTC. No se toca la cuota legacy 1000 ni la cola histórica.

No hay compresión ni compactación destructiva. Backlogs muy grandes se drenan por lotes/ventanas; no se importa ninguna base real. B77 conserva el bloqueo FIFO ante error permanente: si la cabecera está vencida, se requiere revisión explícita antes de avanzar; no renombrar/recrear eventos para evadir caducidad.

El registro técnico almacena solo HMAC de instalación+EventId, hash de payload, expiración y claves HMAC mínimas para hechos únicos/distintos. No guarda EventJson, GameId/SessionId/InstallationId en claro, perfiles o IP. Los recibos se retienen 90 días desde aceptación, más tolerancia temporal; los distintos de período hasta cierre de día/mes +90 días +tolerancia. El ingreso de eventos mayores de 90 días se rechaza siempre, **incluso después de purgar deduplicación**, evitando recontar un reintento viejo. Reloj/retención/cambios de esa ventana son un contrato: no ampliar admisión sin extender primero la deduplicación.

El almacén falso purga en commits, mantenimiento y cierre; su runner de prueba programa mantenimiento cada 15 minutos. Los contadores agregados sobreviven. La implantación productiva requiere programar y auditar limpieza efectiva, no solo declarar TTL. Las claves HMAC también requieren gestión/versionado/rotación que preserve la ventana; no se pueden sustituir silenciosamente sin perder deduplicación.

## Atomicidad y agregados

El almacén ficticio serializa commits, persiste una nueva instantánea con fsync y rename y mantiene un lock de proceso. Deduplicación, claves semánticas, presupuesto y contadores se confirman juntos. Un fallo previo no incrementa; posterior se resuelve por reenvío. Se comprobó reapertura en un **nuevo proceso Node**. Es referencia de pruebas de un solo proceso, no un almacén de producción ni prueba de resistencia a apagado eléctrico/almacenamiento distribuido.

Un futuro repositorio Atlas deberá realizar en una transacción duradera: verificar/insertar deduplicación única, validar presupuesto/consistencia, incrementar agregados y confirmar recibo. Duplicate key debe releer el recibo ligado al hash; commit incierto requiere conciliación con el mismo ID. Sin esa atomicidad no se promete efecto único. No hay exactamente una ejecución HTTP garantizada.

Métricas disponibles por all, día UTC y mes UTC: installations_registered, games_started/completed, finales, visitas/finalizaciones por bioma, approve/reject y healthy/degraded por bioma, tiempo efectivo total y por bioma, tipos de eventos. active_installations por día/mes significa instalación con al menos un evento aceptado en ese período, no una persona ni necesariamente una sesión activa; se deduplica mediante clave HMAC de período y se purga después de la ventana tardía.

Invariantes: tiempo total=suma de cinco biomas; completed=suma good/medium/bad; contadores enteros seguros y no negativos; rechazados/duplicados no incrementan; asignación diaria/mensual usa una sola fecha declarada UTC. No sumar all+day+month como si fueran métricas diferentes de actividad.

Promedios: tiempo/visitas por bioma es exposición observada por visita, no duración media hasta completar; tiempo/game_started es exposición por inicio recibido, no promedio de duración de partidas finalizadas; tiempo/session_started es exposición por sesión recibida con cobertura conocida. Un denominador cero devuelve no disponible. completed/started de un período es razón de actividad y puede superar 1 por eventos tardíos/partidas iniciadas antes: no presentarla como tasa de finalización de una cohorte. Una tasa de cohorte o duración media hasta completar exige diseño agregado adicional con correlación operativa acotada; no se inventa un expediente individual para obtenerla. No se deduce abandono por cerrar o no volver a jugar.

Identificadores HMAC y hashes continúan siendo potencialmente vinculables, no anonimización irreversible. Los logs HTTP individuales, IP permanente, paneles por jugador y consultas de eventos completos están fuera del contrato. Aviso/consentimiento y retención aprobados son requisitos anteriores a una distribución remota.
