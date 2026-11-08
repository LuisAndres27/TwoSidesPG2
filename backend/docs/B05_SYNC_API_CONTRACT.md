> **Estado vigente B05.4C.1:** adaptador MongoDB/Mongoose implementado y probado con dobles; 235 pruebas backend aprobadas. Integración MongoDB real pendiente por falta de entorno local desechable. Las secciones B05.4A/B conservan sus resultados históricos. Véase [informe C.1](B05_MONGODB_ADAPTER_IMPLEMENTATION.md).
# Sincronización — API B05.4B implementada en ensayo sintético

**Estado vigente 2026-10-28 Guatemala: COMPLETADA EN CÓDIGO en el ámbito sintético.** POST /api/v2/sync/batches y POST /api/v2/sync/receipts/query se activan únicamente mediante createApp({persistentJwt,sync:{repository}}) con identidad y repositorio coordinados. Defaultapp/server conservan sync desactivado y bloqueo de producción; no envío desde Godot ni Atlas.

Contrato A conservado: HTTP2/JWTver2 transportan los cuatro sobres Outbox1 como canonicalEnvelope string inmutable, más operationId/hash/dependencias/lease/intento. Implementados Zod strict, UTF-8/parser sin duplicados, límites y semántica de fuentes, propietario verificado desde repositorio, dedupe por operación/hecho, recibo atómico, alias/superseded y 207 parcial. Núcleo durable y correlación del intento separados; no ACK por HTTP/counters. Consulta found con recibo propio/hash coincidente o not_found sin confirmación.

63 vectores generados por C# compatibles, 191 backend aprobadas (67 nuevas +124 regresiones) y64regresiones C# Outbox:255total,0fallidas finales. Todos los50casos A trazados; T34 corresponde a regresiones existentes. Archivo cifrado de ensayo demuestra reinicio ordenado y pérdida de ACK; crash abrupto deja lock residual y503 hasta recuperación explícita, sin HA productiva. Sin cambios al productor/Outbox/Godot.

[Implementación, archivos y límites](B05_REMOTE_INGESTION_ARCHITECTURE.md), [matriz ejecutada](B05_REMOTE_INGESTION_TEST_PLAN.md). No Mongo/índices/transacciones reales, transporte cliente o custodia productiva; B00 pendiente. B05.4C requiere autorización, no iniciada. El contrato A siguiente sigue siendo la especificación de recepción; sus estados «no implementado» son antecedentes de su fecha.
# Sincronización — Contrato vigente de diseño B05.4A

2026-10-28, America/Guatemala. **DISEÑO COMPLETADO, receptor no implementado.** La norma de recepción actual es [B05_REMOTE_INGESTION_ARCHITECTURE.md](B05_REMOTE_INGESTION_ARCHITECTURE.md), con [plan verificable de B](B05_REMOTE_INGESTION_TEST_PLAN.md). Esos documentos prevalecen sobre los borradores históricos siguientes para sync; no cambian rutas técnicas ya implementadas.

| Contrato vigente propuesto | Especificación |
|---|---|
| Recepción |POST `/api/v2/sync/batches`, JWT RS256 ver2/player con vínculo resuelto desde repositorio; ningún fallback v1/opaco/admin|
| Versiones |HTTPschemaVersion2; sobre OutboxschemaVersion1 inmutable; tokenver2 y receiptVersion1/operationContractVersion1 independientes|
| Body |`{schemaVersion:2,batchId,operations:[{operationId,payloadHash,canonicalEnvelope,dependencies,leaseId,attempt}]}`; canonicalEnvelope string conserva exactamente los nueve campos/bytes almacenados|
| Tipos únicos |game.report, session.report, gameplay.event, gameplay.interval; sourceKey derivada del payload, no otro tipo de evento/perfil|
| Cotas |1..100operaciones, cuerpo real256KiB, sobre canónico16128bytes UTF-8, profundidad interior8,16dependencias; parser específico, sin aumentar8KiB de auth|
| Validación |Zod4 strict y refinamientos semánticos en arquitectura; null obligatorio distinto de ausencia; parser detecta duplicados y UTF-8 inválido; vectores C#/Node antes de integración|
| Resultado |200solo todos positivos;207partial con recibos y fallos; errores individuales y globales definidos, sin confirmar por HTTP/count|
| Recibo |Owner/cuenta/vínculo, operationId/hash/versiones, receiptId/committedAt/acceptedAs durables; leaseId/attempt actuales separados; ninguna respuesta positiva antes de commit|
| Consulta de recibos |POST `/api/v2/sync/receipts/query`, `{schemaVersion:2,attempts:[{operationId,payloadHash,leaseId,attempt}]}`,1..100; found con núcleo durable o not_found sin confirmación|

El borrador B05.1 de `/api/v1/sync/*`, operaciones planas en JSON y200para lote parcial **se sustituye explícitamente**: esas rutas no llegaron a implementarse. No reescribir los sobres/hash locales para adaptarlos. El cliente HTTP aún no existe: deberá leer dependencias, respetar bytes reales del body y verificar procedencia del recibo antes de Confirm. authenticate hoy no expone binding en principal; el middleware propuesto lo resolverá desde identidad verificada. Producción/Atlas/credenciales reales siguen bloqueados y B00 pendiente.

## Archivo histórico B05.1–B05.3

Lo siguiente conserva decisiones y estados de sus fechas originales, incluidos candidatos luego implementados (Zod, JWTv2, Outbox local). No usarlo para concluir que Zod falta hoy, que la identidad v2 ya es Mongo productiva o que las rutas sync ya existen.

# B05.1 — Contrato propuesto de API sync v1 (histórico)
2026-10-27 · Diseño sin endpoints implementados. Rutas actuales sin /v1 permanecen contratos legacy separados; no ampliar su body silenciosamente.

## Convenciones y límites propuestos
TLS fuera de loopback; JSON UTF-8 sin compresión; desconocidos/campos duplicados/JSON malformado se rechazan antes de hashing. UUIDv4 minúscula canónica para IDs, fechas RFC3339 UTC con milisegundos, enteros seguros JS0..9007199254740991 (SQLite long mayor queda en cuarentena, no redondear). Enum biomas cerrado ocean/jungle/desert/forest/tundra. No ObjectId24hex en protocolo público.

Sobre con schemaVersion1; versiones de evento/payload/dominio se conservan aparte. /api/v1 se versiona por incompatibilidad; añadir campos requiere estrategia explícita de compatibilidad, no aceptar todo. Zod es una opción de implementación futura con esquemas strict, aún NO dependencia instalada. Los validadores manuales actuales no son Zod.

Máximos propuestos: auth8KiB, sobre individual16KiB, batch100 operaciones y256KiB totales (ambos límites simultáneos), JSON depth12, recibos consultados100, paginación status100. Rechazar strings/cargas ilimitadas y consecuencias no reconocidas; no aceptar snapshotJson, displayName, correo, tokens/verificadores, rutas, campos SQL o texto libre. Conservar únicamente JSON de consecuencias validado por versión y campos permitidos; límite4KiB por decisión. IDs/textos permitidos con límites específicos (key64, versión64bytes) y sin caracteres de control.

SHA-256 sobre serialización canónica de {schemaVersion,type,installationId,localPlayerId,bindingGeneration,gameId?,sourceKey,createdAtUtc,payload}, excluye operationId/hash y datos de transporte. Especificación de canonicalización a fijar con vectores byte-a-byte C#/Node: propiedades ordinales, números enteros decimales, Unicode sin normalización tácita de datos, fechas ya normalizadas y UTF-8; rechazo de claves JSON duplicadas antes de parse perderlas. Se persisten payload canónico/hash al encolar; reintentos no cambian timestamps. Hash por sí solo NO autentica: token/binding obligatorio y servidor recalcula.

Errores globales: {schemaVersion:1,error:{code,message seguro,retryable},requestId}; no stack/cuerpo/secreto. 400 estructura/JSON,401 auth,403 binding/rol,409 conflicto,413 tamaño,415 tipo/compresión,422 semántica/versión,429 cuota con Retry-After,503 temporal con Retry-After,500 sanitizado. RequestId no es clave idempotente.

## Endpoints
| Método/ruta propuesta | Auth/entrada | Respuesta y comportamiento |
|---|---|---|
| POST /api/v1/technical/registrations | Pública acotada; {schemaVersion:1,registrationId,installationId,localPlayerId,credential} |201 primera alta/200 retry idéntico: {schemaVersion,registrationId,technicalAccountId,installationId,localPlayerId,bindingGeneration:1,registrationStatus:"REGISTERED",createdAtUtc}. Identidad ligada duraderamente. No nombre/email personal. |
| POST /api/v1/technical/sessions | {schemaVersion:1,technicalAccountId,installationId,credential} |200 {schemaVersion,technicalAccountId,installationId,bindingGeneration,tokenType:"Bearer",accessToken,expiresIn:900}. No registra otra cuenta. Credencial solo en TLS, no logs. |
| GET /api/v1/technical/me | Bearer player; sin body/query |200 IDs/binding/status permitidos del principal, sin verifier/credential/hash de token. |
| POST /api/v1/sync/batches | Bearer player ligado; {schemaVersion:1,batchId UUID,operations:[sobre]} |200 resultados por operación committed/duplicate/superseded/deferred/rejected. Lote no es transacción global. Auth/esquema envelope inválido→error global sin procesar; cada elemento válido se confirma independientemente. |
| POST /api/v1/sync/receipts/query | Bearer player; {schemaVersion:1,operationIds:[UUID]} máximo100 |200 {schemaVersion,receipts:[{operationId,status,payloadHash?,receiptId?,committedAtUtc?}]}; status committed/not_found. Propietario/instalación token filtran; no revela existencia de IDs ajenos. not_found NO prueba que no haya petición en vuelo; reintentar ID original. |
| GET /api/v1/sync/status?cursor=...&limit=... | Bearer player; cursor opaco <=512bytes,limit1..100 |200 {schemaVersion,installationId,bindingGeneration,serverTimeUtc,acceptedCount,conflictCount,lastCommittedAtUtc,nextCursor,receipts:[...]} para esa instalación. No conoce cuántas operaciones locales aún no llegaron. |
| GET /api/v1/admin/statistics | Principal admin stats:read; filtros from/to UTC semiabiertos,biome?,ending?,rulesVersion?,bucket=day|week |200 contrato agregado descrito en plan métricas. Máximo366d por consulta interactiva y366buckets;400 rango inválido/403 rol/429/503. Sin listas de jugadores, secretos o hechos individuales por defecto. |

Todos están pendientes. Registro legacy usa3 campos y devuelve internalEmail sintético; el contrato nuevo es distinto y necesitará pruebas/migración de compatibilidad, no apunta automáticamente al mismo handler.

Registro: clave registrationId durable única; igual secreto y binding→misma cuenta; otro secreto/binding→409 registration_conflict genérico; no reasignar por nombre. No persistir credencial original, solo Argon2id. Índice de binding por instalación/perfil y límites antiautomatización. Timeout→repetir mismo request, nunca generar alta alternativa.

Sesión: opaca renovable mediante reautenticación; un retry puede emitir otro token dentro del límite, no otro jugador.401 credencial fallida→RECOVERY_REQUIRED tras política acotada;429/503 respetan espera. Expirar no equivale a borrar perfil ni regenerar registrationId. Roles se derivan del principal, nunca del body.

## Sobre y payload
Cada operación: {operationId UUID,type enum,schemaVersion:1,installationId UUID,localPlayerId UUID,bindingGeneration:entero>=1,gameId UUID|null,sourceKey:string<=192,createdAtUtc,payloadHash hex64,payload:objeto}. No aceptar technicalAccountId/role para elegir dueño: se deriva del token y se comprueba binding. SourceKey la recalcula el servidor a partir de payload/IDs; cliente no decide unicidad arbitraria.

Tipos:
- game.report: GameId/revision/rulesVersion/contentVersion/saveFormatVersion1, status in_progress|final_pending|completed|archived, isCurrent, createdAtUtc/savedAtUtc, ending/endingRulesVersion/preparedAtUtc/closedAtUtc nullable, biomes[exactamente5], decisions[0..5], coverage. biomes: {biomeId,status:human_pending|animal_pending|completed,result:null|good|bad,humanCompletedAtUtc?,animalCompletedAtUtc?}. decisions: {decisionId,operationId,biomeId,decisionKey,optionId:reject|approve,decisionOrder,consequencesVersion,stateKind,classification? con versión si existe,rulesVersion,occurredAtUtc}. Se usa preparedAtUtc desde CompletedAt; closedAtUtc del cierre confirmado/ArchivedAt según E.2B.2, no se confunden con final mostrado.
- session.report: {sessionId,phase:open|terminal,status:open|closed|interrupted,startedAtUtc,endedAtUtc:null|UTC,endOffsetMs:null|entero,coverage}. gameId exterior null porque sesión puede abarcar varias partidas. Terminal interrupted no inventa endedAt ni duración real; endOffset solo último confirmado.
- gameplay.event: campos tipados de GameplayEvent existentes (EventId,SessionId,Kind,OccurredAtUtc,OffsetMs,GameId?,BiomeId?,AnimalRunId?,DeathCause?,SessionEnd?,Version1) en camelCase. SESSION_* sin game/biome/run; animales con los tres. Preservar evento original; .NET enums tienen mapping string explícito, no valores ordinales.
- gameplay.interval: campos de GameplayInterval existentes en camelCase, intervalId/sessionId/startMs/endMs/state/gameId?/biomeId?/animalRunId?/version1; duración derivada end-start, no aceptar acumulado cliente. Estados exactos ActiveHuman/ActiveAnimal/Paused/Menu/GameOver/Loading/Background.

coverage: {origin:"live_capture"|"historical_import",historicalCoverageUnknown:boolean,incomplete:boolean,recordedThroughOffsetMs?:entero}. No usar coverage como permiso para inventar ceros. Para session.report la clave SessionId+open|terminal no admite dos terminales contradictorios.

Validar game.report: cincoIDs sin duplicados, decisión por bioma cuando etapa la requiere, key canónica, mismo owner/game, relaciones reject/healthy/good y approve/degraded/bad, versiones, estados y revisión; no admitir completed→jugable ni cambiar decisión ya confirmada de la misma partida. final_pending/completed exige cinco completed/cinco decisiones y tabla local-ending-reject-count-1 verificada independientemente por servidor; versión desconocida→422 unsupported_rules_version. Clasificación ambiental no sustituye opción. Legacy archived sin final confirmado se conserva como reporte de archivo no contado como completed; no inventar final.

## Respuestas por operación
Propuesta:
```json
{
  "schemaVersion": 1,
  "batchId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "results": [{
    "operationId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "status": "committed",
    "payloadHash": "<64 hex>",
    "receiptId": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    "committedAtUtc": "2026-10-27T18:00:00.000Z"
  }]
}
```
Solo ejemplo sintético, no IDs reales. committed/duplicate/superseded con recibo durable confirman outbox; superseded significa revisión histórica aceptada que no retrocede proyección. duplicate debe devolver recibo original (mismo receiptId/hash/committedAt), no reincrementar métricas.
deferred incluye {code:"dependency_missing",retryable:true,missing:[{type,id}],retryAfterSeconds}; sin ACK terminal.
rejected incluye {code:"payload_conflict"|"invalid_fact"|"unsupported_contract"|"unsupported_rules_version",retryable:false}, diagnóstico seguro sin el payload. Conflict409 por operación se representa como code/status dentro del200batch; no confundir con409 global de binding/registro. No reencolar con ID nuevo para eludir un conflicto.

ACK requiere hash coincidente y principal/binding actual; respuestas tardías de otro perfil/generación no confirman filas ajenas. Error HTTP global o timeout conserva elementos no confirmados. Un batchId sirve para correlación y no para dedupe de todas sus operaciones. Falta resultado para un ID solicitado→pendiente, no éxito implícito.

## Reintentos, dependencias y orden
401 recurso→una sesión renovada, mismo lote/IDs; fallo credencial→pausa sync.403 binding/rol→cuarentena administrativa de binding;413 dividir lote conservando IDs, si una operación excede límite→permanent_failure;429/503 Retry-After. Red/timeout/5xx→retryable con jitter y lease.422 versiones desconocidas se conservan para actualización/revisión, no borrar ni corregir opción.200 parcial procesa cada recibo; nunca confirmar por status del lote.

Para cada account+installation+OperationId: índice único, comparar hash y transacción recibo+hechos. Para sameGameRevision otro digest→conflicto aunque OperationId nuevo. Eventos/intervalos tienen además sus IDs y clave lógica, sesiones SessionId/phase. Monotonicidad de partida y terminales se valida del lado servidor. Eventos tardíos requieren sesión/run ya reportados y rangos consistentes; no exigir estado jugable actual para importar un run antiguo anterior al cierre.

## Seguridad, pruebas y decisiones abiertas
Una implementación de recepción debe validar primero sintaxis/cotas, autenticar/autorizar antes de consultar hechos ajenos, usar queries tipadas sin operadores Mongo aportados por cliente y redacción de logs. Controlar cuotas de almacenamiento, replay y abuso; TLS no hace confiable a un ejecutable público modificado.
Pruebas futuras: duplicado concurrente, commit/ACK perdido, rollback/commit incierto, reordenamiento, lote parcial, conflicto/hash canónico C#/Node,401/429/503, datos de otro dueño, límites, final incompatible, sesiones interrumpidas e intervalos solapados. Fixtures solo sintéticas. Pendiente decidir retención, política multinstalación y publicación de esquemas formales; no pruebas de Atlas real en B05.1.



## B05.2C — JWT y roles en memoria (2026-10-27 Guatemala)

**COMPLETADA EN CÓDIGO Y PRUEBAS AISLADAS.** Informe completo/inventario en B05_IDENTITY_IMPLEMENTATION_PLAN.md y PHASE_HISTORY.md. JWT mediante jose6.2.13, validadores Zod4.6.7 y tests Vitest5.0.5; dependencias exactas/lockfile, sin scripts de instalación. Argon2id, límites y39 pruebas legacy conservados.

RS256 con claves efímeras de fixture y algoritmo explícito; typ at+jwt/kid,iss reservado de test y aud exacta única,sub UUID,jti sesión conocida,iat/nbf/exp900s y cv/role obligatorios. Firma y claims preceden validación de cuenta activa/sesión/rol real/versión en repositorio. Token inválido401, privilegio/propiedad insuficiente403. Nunca confiar en role de body o payload alterado.

Rutas JWT opcionales configuradas explícitamente: POST /api/v1/technical/registrations y /sessions; GET /api/v1/technical/me, /api/v1/players/:id (propio,player) y /api/v1/admin/status(admin). Registro nuevo no acepta nombre/email/role ni devuelve correo; admin solo fixture opt-in del servidor. Rutas legadas sin /v1 siguen opacas; no aceptan JWT y las nuevas no aceptan opacos. No hay binding installationId ni sync completo implementados: propuesta B05.1 se ampliará/versionará explícitamente después. No admin OIDC/MFA o cuentas reales.

Defaultapp no crea claves ni activa JWT. Config inyectada solo isolated-test; producción se rechaza antes de listen aunque se suministren valores de prueba. Requisitos de claves/issuer/audience de producción son futuro diseño fuera de OneDrive, no .env cargado. Vitest envDir=false y guardas de IO impiden leer .env. Todos los secretos/tokens de tests se generan en RAM; no se imprimen.

89 pruebas backend aprobadas:39 regresiones+50 nuevas,0 fallidas finales. Node24.19/npm11.17; primeros workers bloqueados por sandbox EPERM y reejecutados con permiso de ejecución, sin modificar ACL. HTTP solo loopback/puerto0 de tests y cierre posterior. No Godot ni598 pruebas del juego reejecutadas.

Bases protegidas y9 asociados idénticos hash/tamaño/fecha; .env coincide con referencia y seguridad/metadata igual,4 Deny .git conservadas.677 archivos juego/raíz sin diferencias de metadata/DACL contra backup previo;23 backend existentes sin diferencias ACL/owner. El digest global que incluía caché npm cambió por instalación/logs y no se declara idéntico. Cambios deliberados21 archivos (14 código/dependencias/tests y7 documentos), más artefactos npm. No gameplay/SQLite/estadísticas/evaluador/ACL/herencia/owner modificados.

Persistencia sigue en memoria y se pierde al reiniciar. B00 continúa pendiente; sin Atlas, Godot sync, despliegue, corrección ACL o B05.3. Detenido; próxima implementación requiere autorización.


## B05.3A — Outbox SQLite sintética (2026-10-27 Guatemala)

Se implementó productor local de sobres schemaVersion1 para cuatro tipos, UUID fuente separado de operación, SHA-256 canónico y fechas UTC en milisegundos. No endpoints de sync ni HTTP nuevos. SimulatedSyncReceipt valida alcance/hash/lease/intento/vigencia y committed|duplicate|superseded; es recibo simulado estructural, sin prueba de procedencia remota. Auth técnico v2 queda separado de versión de sobre. Vectores byte-a-byte C#/Node, receptor/autenticación/validación remota aún requieren su fase. Captura sin binding local conocido se difiere con SYNC_BINDING_REQUIRED, sin inventar ID o modificar sobre capturado.

Contrato, tablas, transiciones, operaciones, limitaciones, pruebas, inventario y plan runtime en [B05_LOCAL_OUTBOX_IMPLEMENTATION.md](B05_LOCAL_OUTBOX_IMPLEMENTATION.md). No inicia B05.3B ni autoriza tocar runtime, HTTP o Atlas. B00 sigue pendiente; sin cambios ACL/propietario/herencia.


## B05.3B.1 — Captura y reconciliación sintéticas (2026-10-28 Guatemala)

Se conservan los cuatro tipos y claves source_key aprobados. Perfil se minimiza a referencias locales en sync_installations; no se inventa profile.report o identidad remota. Decisiones/consecuencias/progreso/final/cierre se normalizan en game.report. Sesiones canónicas open/terminal evitan volver a emitir SESSION_STARTED/ENDED como nuevos eventos equivalentes; filas antiguas redundantes se diagnostican, no borran. Eventos animales y offsets originales se conservan como telemetría, sin sumar dos veces métricas de progreso. No endpoints/HTTP nuevos ni cambios Node; futuras entregas exigen asociación remota y validación del receptor.

Matriz de hechos, métodos/archivos, garantías, historial, pruebas, limitaciones y plan preciso B05.3B.2 en [B05_OUTBOX_CAPTURE_RECONCILIATION.md](B05_OUTBOX_CAPTURE_RECONCILIATION.md). B00 continúa pendiente. Detenido; sin iniciar B05.3B.2/B05.4.

## B05.4C.1 — Adaptador MongoDB/Mongoose aislado (2026-10-28)

**COMPLETADA EN CÓDIGO; PROBADA CON DOBLES; NO VALIDADA CONTRA MONGODB LOCAL.** Este estado sustituye las indicaciones históricas de «C no iniciada» únicamente dentro del alcance sintético autorizado de C.1. MongoDB real/Atlas y producción siguen sin habilitarse.

Modelos de operaciones (recibo embebido), hechos y controles; índices únicos cuenta/operationId y scope/sourceKey; adaptador inyectable por el mismo puerto. Los cuatro sobres, bytes/hash y contratos HTTP/JWT/recibos se conservan. Transacción con snapshot/majority/journal, escritura de fence Mongo y barrera de sesión/autorización obligatoria; no se utiliza el bloqueo de archivos de B. Ante resultado incierto, 503 sin ACK especulativo y retry con la misma clave. Sin nuevas rutas admin o cambios de app/server.

Mongoose 9.11.2 instalado exclusivamente desde caché local, sin scripts ni descargas de servidor. No mongod/mongosh disponibles en PATH; Docker Desktop sin motor activo. No se conectó una base MongoDB, personal o remota. Las verificaciones de índices/topología/transacciones y concurrencia nuevas utilizaron dobles, no prueban garantías del servidor real. La identidad Mongo y su acoplamiento duradero con revocaciones/control de sesión permanecen bloqueantes para cualquier despliegue; no basta copiar controles desde memoria o usar un callback permisivo.

**235 pruebas backend aprobadas: 44 nuevas con dobles + 191 regresiones (39 legacy, 50 JWT, 35 identidad persistente y 67 ingestión B). Cero fallidas finales.** Las ocho regresiones de archivos de B siguen siendo persistencia sintética, no Mongo. Gates C#/Node (63 vectores) e identidad/vínculo aprobados; 43 archivos src/sync-tests sin errores de sintaxis. No se suman vectores o ejecuciones repetidas al total. No se reejecutaron las 64 pruebas C# ni las 791 históricas completas, ni se compiló/inició Godot.

Una aserción JWT histórica que prohibía instalar Mongoose se actualizó, con justificación técnica, para exigir que la composición JWT siga independiente/desconectada y permita login local sin Mongo. El resto de la batería se conservó. Primer pase completo: 234 aprobadas y ese único fallo; pase final: 235 aprobadas. EPERM inicial de Vitest se resolvió mediante permiso de subprocesos, sin alterar ACL.

Tres bases protegidas: hashes/tamaños/fechas/propietarios/ACL idénticos antes/después, sin SQL ni operaciones reales enviadas. `.env`: 278 bytes, fecha/propietario/SDDL idénticos; **no se abrió ni recalculó su hash en C.1**. El SHA histórico sigue documentado, sin una nueva certificación del contenido. No comandos de cambio de ACL, propietarios o herencia. B00 pendiente; cero procesos de ensayo o fixtures privadas restantes.

Recomendación C.2: autorización separada de entorno replica set local nuevo y desechable, binario confiable, rutas exclusivas y loopback; integrar identidad/revocación transaccional y probar índices, carreras, commit incierto y recibos tras reinicio reales. Prototipo acotado (1000 operaciones/2 MiB, fence global) pendiente de rendimiento, custodia y controles productivos. No Atlas, Godot HTTP, operaciones runtime, AWS o B05.5. Trabajo detenido.

[Inventario, modelos, garantías, resultados y límites](B05_MONGODB_ADAPTER_IMPLEMENTATION.md).