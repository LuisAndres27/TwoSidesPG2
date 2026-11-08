> **Estado vigente B05.4C.2C:** modo Atlas explícito implementado y probado exclusivamente con dobles, 271 pruebas backend aprobadas. Sin conexión Atlas real; identidad durable/B00 pendientes. El [informe del modo](B05_ATLAS_INTEGRATION_MODE.md) actualiza las propuestas e implementaciones históricas siguientes; D no iniciada.
> **Estado vigente B05.4C.1:** adaptador MongoDB/Mongoose implementado y probado con dobles; 235 pruebas backend aprobadas. Integración MongoDB real pendiente por falta de entorno local desechable. Las secciones B05.4A/B conservan sus resultados históricos. Véase [informe C.1](B05_MONGODB_ADAPTER_IMPLEMENTATION.md).
# Receptor Outbox — Plan y resultados B05.4B

**Estado vigente 2026-10-28 Guatemala: B05.4B COMPLETADA EN CÓDIGO, exclusivamente sintética.** 67 pruebas nuevas y 124 regresiones backend aprobadas, más 64 regresiones C# Outbox. La sección B al final traza los 50 casos; el diseño A siguiente conserva su fecha original.

2026-10-28, America/Guatemala. **DISEÑO. Cero pruebas ejecutadas en A.** Define la puerta de B05.4B, no la autoriza. Contrato normativo: [B05_REMOTE_INGESTION_ARCHITECTURE.md](B05_REMOTE_INGESTION_ARCHITECTURE.md), HTTPv2/Outboxv1/JWTver2. Las791 regresiones locales y124backend históricas son antecedentes, no resultados nuevos.

## Aislamiento y fixtures

- Crear UUIDv4, claves RS256 efímeras, credenciales y JWT **sintéticos nuevos**, en RAM. No copiar ninguna de las906operaciones reales, sus IDs, decisiones, nombres o contenido SQLite. Generar payloads con las cuatro formas del contrato.
- Fixtures: dos cuentas player A/B, un fixture admin v1 separado, vínculos válidos/ajenos/revocados, sesiones abiertas/cerradas/interrumpidas, catálogos iniciales y finales de0..5reject. No ruta pública admin ni token de producción. El rol admin v1 en ruta v2 falla401 por versión; autorización de un contexto admin autenticado se prueba aparte y falla403.
- Componer explícitamente createApp/servicio con persistentJwt y repositorio de ingestión inyectados. Defaultapp sigue sin activar sync/JWTv2. No retirar bloqueo production, ni tocar server.js para emitir tráfico o escuchar automáticamente.
- envDir=false y env-guard.js antes de imports y workers; denegar cualquier apertura de `.env`/variantes, carga de claves por fallback y rutas reales. Probar que una ruta protegida se rechaza **antes de accederla**, con spy de I/O, sin abrirla para fabricar un negativo.
- Fake en memoria: copias desconectadas, exclusión atómica, barreras controladas e inyección de errores precommit/postcommit. Para reinicio real, adaptador cifrado sintético de ingestión con repositorio de identidad y coordinador compartidos, solo en directorio privado nuevo fuera de repo/OneDrive tras autorización expresa de B. No usar las bases SQLite ni backups E.2 como almacén del ensayo.
- Propuesta de rutas futuras: `backend/src/modules/sync/{schemas,canonical-envelope,ingestion-service,ingestion-repository,routes}.js`, middleware de resolución de contexto; tests bajo `backend/tests/sync/` y soporte sintético. Son alcance a autorizar en B, no archivos creados en A.
- Comenzar pruebas por servicio/repositorio/schemas en proceso, sin sockets. HTTP loopback127.0.0.1/puerto0, procesos hijos y archivos privados solo si B los autoriza expresamente; cerrar todos al finalizar. Sin peticiones al videojuego, Atlas, AWS ni red externa. Ninguna dependencia nueva se presupone.

## Matriz solicitada para B05.4B

Cada fila tiene resultado observable; son casos propuestos, no un conteo de tests ya implementados. «Sin efecto» exige comparar hechos, heads, recibos y estado de identidad antes/después, no solo HTTP.

| ID | Caso | Aserción de aceptación |
|---|---|---|
| T01 |JWT válido RS256ver2|Firma/perfil/cuenta/sesión/binding válidos permiten ingestión y un recibo por operación confirmada.|
| T02 |JWT inválido|Firma ajena, unsigned, HS256, alg/typ/kid incorrectos, issuer/aud ajenos, claims requeridos ausentes o mal tipados→401 y cero efectos. Ningún claim no autorizado concede privilegios. Sin fallback.|
| T03 |JWT expirado|Exactamente exp→401; mismo sub/vínculo tras nueva sesión, sin alta alternativa. Expiración durante lote conserva commits anteriores y difiere el resto.|
| T04 |Identidad/sesión revocada|active=false, jti revocado, cv/authzVersion/generation distintos→rechazo; error de repositorio503, sin autorización desde caché.|
| T05 |Player autorizado|Contexto resuelto desde repositorio, owner/binding coincidente; ni localPlayerId ni sub inventado por body.|
| T06 |Datos ajenos|Cambiar perfil/instalación/generación declarados→403. Referencia a game/session/run/dependencia no encontrada en scope propio tiene el mismo deferred si es inexistente o de otro dueño; nunca buscarla globalmente, revelar existencia o escribir en el namespace ajeno.|
| T07 |Admin/escalada|role en registro/body/canonicalEnvelope strict se rechaza; token player no entra en administración, admin v1 no entra en sync v2; autorización de rol admin no concede ingestión de juego.|
| T08 |Lote válido|Los cuatro tipos sintéticos, todos persistidos;200/all_accepted con resultados/recibos y counts exactos.|
| T09 |Lote vacío|400 antes de procesamiento; no operaciones/recibos.|
| T10 |Lote/cuerpo excesivo|101elementos o body>256KiB→413, canonicalEnvelope>16128bytes rechazado; tamaño real y límites de bytes/multibyte/escapes, sin confiar en Content-Length.|
| T11 |Operación repetida|Mismo operationId en solicitudes distintas; una sola operación/recibo persistidos, sin nuevos efectos. Mismo ID dos veces en un array→400 preflight.|
| T12 |Duplicado idéntico|Recibo original con mismo receiptId/committedAt/hash, status duplicate y eco de intento actual; effects count no aumenta.|
| T13 |Duplicado contradictorio|Mismo ID con hash/encabezado/payload/dependencias distintos→409; conservar ganador. sourceKey igual con payload distinto y nuevo ID también conflict.|
| T14 |Respuesta perdida después de commit|Ocultar/desconectar ACK tras persistir; repetir misma operación devuelve recibo durable y no incrementa efectos.|
| T15 |Reinicio servidor|Nuevo proceso/instancia carga store sintético autorizado y mismo contexto de identidad; devuelve mismo recibo. Recrear objetos sobre Maps vacíos no satisface prueba durable.|
| T16 |Recepción fuera de orden|Terminal/run/intervalo antes del padre→deferred, sin ACK. Tras padres, retry mismos IDs pasa. Partida antigua no necesita seguir activa.|
| T17 |Dependencia ausente|Referencia no recibida en scope propio→retryable dependency_missing sin distinguir si existe fuera del scope; tipo/relación incompatibles de un padre propio existente→permanente. Nunca «confirmed» por declaración del cliente.|
| T18 |Evento válido|Los seis tipos animales, run y unicidad por run/kind; muerte/restart/retry se distinguen. SESSION_STARTED/ENDED se rechazan como duplicación del reporte de sesión.|
| T19 |Intervalo válido|0..3932ms Menu sin GameId/Run se conserva y aporta0 efectivo; ActiveAnimal con run válido conserva duración exacta.|
| T20 |Duración inválida|Negativos,end<start,fracciones,overflow,NaN/Infinity vía parser,exponentes/-0 no canónicos,solapamiento,intervalo fuera de run/sesión→sin ACK ni suma.|
| T21 |Sesión válida|open con nulls; closed con endedAt/endOffset; interrupted con endedAt:null y frontera durable. No fabricar fecha final o total de tiempo.|
| T22 |Resultado de partida|Cinco biomas/decisiones coherentes;0..2reject bad,3/4medium,5good; versión literal. final_pending no cuenta completed; closed válido sí.|
| T23 |Versión incompatible|Transporte distinto de2, sobre distinto de1, catálogo/reglas/versión de evento incompatibles→rechazo seguro; cola sintética conservada para revisión, no transformación silenciosa.|
| T24 |Payload malformado|Campos omitidos/extra,null donde no se admite,duplicados JSON externos/internos,UTF-8 inválido,profundidad>8,IDs no canónicos,fechas inexistentes→errores acotados, sin secreto ni efectos inválidos.|
| T25 |Recibo individual|Núcleo persistido coincide con owner/scope/operation/hash/versiones; no se emite recibo si no se confirmó persistencia. Query not_found no confirma.|
| T26 |Aceptación parcial|Un positivo y otro rechazo/diferido→207/outcome partial, resultado por índice; sin éxito global ni ACK por HTTP/count. Reintentar no repite positivos.|
| T27 |Error reintentable|503/429/dependency_missing conserva IDs/contenido, Retry-After y jitter; siguiente intento puede aceptar.|
| T28 |Error permanente|invalid_fact/conflict/unsupported_version no tiene receipt positivo ni retry automático con ID nuevo; se conserva para diagnóstico.|
| T29 |Fallo repositorio|Antes del commit: rollback completo operación+hecho+heads+recibo. Commit incierto: no ACK supuesto; consultar/reintentar misma clave.|
| T30 |Duplicados concurrentes|Barreras liberan simultáneamente mismo ID/hecho; un ganador, receipt estable; hash diferente da un conflicto, nunca dos efectos.|
| T31 |Sin duplicar agregados|Repetir reportes/revisiones, alias de mismo hecho y telemetría de completion no vuelven a contar decisiones/biomas/final. Head conserva revisión máxima.|
| T32 |Sin secretos en respuestas|Sembrar marcadores sintéticos de credencial/JWT/clave y fallos internos; no aparecen en body/logs/errors. No stacks, PHC o payload completo en diagnóstico.|
| T33 |Sin Atlas|Spies deniegan resolución/conexión externa y módulos Mongo productivos no se instancian; solo adaptadores sintéticos. No probar «sin Atlas» conectando y esperando error.|
| T34 |Regresiones auth/JWT|Reejecutar las baterías legacy/JWT/identidad aplicables, informar conteo real.124anteriores son referencia; resultados actuales solo tras ejecutar con autorización.|
| T35 |Offline independiente|No modificación Godot/SQLite y cero acceso a sus rutas; fallo remoto no dispara NewGame/RecordDecision/CompleteBiome ni flujo de login del juego. Regresiones locales solo fixtures si se autorizan.|

## Vectores y casos adicionales obligatorios

| ID | Puerta de riesgo | Evidencia exigida |
|---|---|---|
| V01 |Hash byte-a-byte C#/Node|Crear sobres sintéticos mediante productor C# existente y comparar canonicalEnvelope UTF-8/hash con receptor; nunca extraer runtime. Objetos anidados/arrays ordenados, nulls/booleans,0/MAX_SAFE_INTEGER, límites de fechas y todas las variantes de payload.|
| V02 |Normalización peligrosa|Reordenar claves,escape alternativo,1e0/1.0/-0,cambiar timestamps/mayúsculas o agregar campo: comprobar política canónica estricta, sin reescribir filas para que pase. Unicode/HTML/escapes fuera de perfil se rechazan; no tomar JSON.stringify como prueba suficiente.|
| V03 |Binding no expuesto por principal|Middleware conserva el mismo token ya verificado y principal id/role/sessionId; compara sus claims esperados con cuenta/sesión actuales y forma contexto desde repositorio. Cambio de vínculo/época entre authenticate y resolución falla cerrado; no copiar UUID del body ni adoptar automáticamente un vínculo nuevo.|
| V04 |Race de revocación|Revocación y commit comparten coordinador/fence: probar ambos órdenes de linearización, cv y authzVersion. Archivo identidad e ingestión separados sin exclusión común NO acreditan atomicidad.|
| V05 |ACK tardío y lease|ACK válido de lease1 no confirma fila en lease2; query/retry del intento2 devuelve mismo receipt core y correlación2. Cambiar owner/hash/generación/contrato se rechaza. Expiración exacta de lease queda sin confirmar.|
| V06 |Alias de hecho|Nuevo operationId, misma sourceKey/payload semántico, otro capture createdAt: un hecho/efecto, dos recibos ligados a sus hashes originales. Mismo ID con dependencies cambiadas conflict; aliases de padres deben resolver relaciones reales.|
| V07 |Concurrencia entre rangos|Dos intervalos parcialmente solapados con UUID distintos: fence por sesión deja aceptar uno y rechaza otro. Intervalos adyacentes sí; cero duración válido no crea suma.|
| V08 |Historia y retroceso|Revisión mayor llega primero; antigua compatible se persiste superseded sin retroceder head; una que contradice decisión ya conocida falla. No exigir revisión0 ni ausencia de saltos.|
| V09 |Terminal antes de telemetría|Aceptar terminal y luego eventos/intervalos compatibles<=endOffset; no exigir cobertura completa para confirmar terminal. Eventos tardíos incompatibles con intervalos ya recibidos también se detectan.|
| V10 |Unknowns|coverage conserva historicalCoverageUnknown e incomplete; sin datos retorna unknown/null/no_data según métrica, no0. interrupted no aporta duración de pared completa. Clasificación favorable/perjudicial no altera fórmula final.|
| V11 |Reintento días después|Reloj avanza días, JWT nuevo mismo vínculo; receipt y dedupe anteriores siguen; createdAt antiguo no caduca. Rotación autorizada de credencial no cambia IDs pendientes.|
| V12 |Errores globales/parciales|Preflight400/401/403/413/415 garantiza0 commits; pérdida de conexión después de commits no lo garantiza.200solo positivos,207mezcla;503/409/422sin recibos según precedencia. Códigos y shape estrictos.|
| V13 |Límites de espera|Barrera controlada excede presupuesto; elementos no iniciados deferred y ningún ACK ficticio. Page/transaction ya en curso puede resolver por clave después; no afirmar rollback sin evidencia.|
| V14 |Ciclo de dependencias|Self/ciclo visible se diagnostica y no bloquea worker; resto independiente sigue. Padre recibido del mismo owner pero de tipo incompatible se rechaza.|
| V15 |Estado local confirmed|Coordinador simulado aplica solo recibos a intentos actuales. Repetición tras confirmed no cambia recibo guardado; no conectar directamente JSON externo a Confirm. No usar datos reales.|

Para vectores, un campo prohibido no se introduce en un sobre válido solo para «probar compatibilidad»: comprobar rechazo negativo y preservar hash original. Si productor y receptor divergen en bytes/semántica para un sobre válido, **bloquear integración**, registrar caso sintético reproducible y solicitar decisión de versión; no rehash ni migración automática de Outbox.

## Fallos de persistencia y reinicio

Puntos de inyección: antes de adquirir exclusión; después de leer identidad; después de validar dependencia; tras preparar hecho; tras preparar head; antes de commit; después de persistencia y antes de respuesta. Precommit debe dejar snapshots completos anteriores sin recibo nuevo. Postcommit debe recuperar exactamente un recibo/effecto. Nunca borrar store o reiniciar cuenta para que un retry pase.

Adaptador de memoria prueba lógica, no durabilidad. Prueba de archivo requiere dos procesos independientes que carguen el mismo almacén autorizado, revocaciones y claves; timeout/cancelación y lock residual se diagnostican. No bloquear indefinidamente ni borrar locks ajenos. Protección ante corte eléctrico/rollback de archivo y fsync de directorio no se presume. Falla de cifrado/clave o corrupción devuelve503 y conserva archivo, no inicializa reemplazo.

Mongo tiene puerta posterior independiente: índices únicos y CAS efectivos bajo concurrencia real, commit desconocido, rollback de transacción, lectura de receipt tras reinicio, write concern y recursos. Ningún resultado del fake/archivo se anuncia como prueba Atlas. Antes de conectar cualquier entorno Mongo se necesita su autorización expresa; no hay modelos productivos en A.

## Orden de B y criterios de aceptación

1. Autorizar los archivos/backend y modos de ensayo concretos, incluyendo resolución de binding y coordinación con revocación. Preservar contratos legacy/v1/v2 existentes y bloqueo production.
2. Implementar schemas/parser canónico/servicio y repositorio fake, probar V01/V02 antes de endpoints activos. Mantener pruebas sintéticas sin datos del juego.
3. Integrar opcionalmente createApp con recepción v2 y errores específicos, sin activar server.js por defecto. Loopback solo si autorizado; sin contacto con videojuego.
4. Incorporar ensayo de reinicio durable sintético únicamente con custodia/directorio/locks autorizados. Si no se autoriza, marcar prueba durable pendiente; no sustituirla por recrear Maps y declarar el mismo resultado.
5. Ejecutar casos T/V, regresiones auth/JWT y verificaciones de integridad. Registrar nuevas/regresiones, aprobadas/fallidas/omitidas y límites reales; no sumar reejecuciones como tests distintos.

B se acepta solo con los cuatro payloads y contrato de recibos compatibles, propiedad no falsificable por UUID, commit+receipt atómicos, dedupe concurrente probado, recepción parcial explícita, historia sin retroceso/doble conteo, unknowns conservados, conflictos/errores temporales diferenciados y aislamiento demostrado. Prueba durable no ejecutada permanece pendiente. No aceptar fake como identidad Mongo productiva, ni un cliente autenticado como gameplay honesto.

Al cierre de B deberán permanecer sin cambios hashes/metadatos de las tres bases y archivos asociados; .env sin leer, usar o modificar; ACL/propietarios intactos. No Godot/Atlas/AWS/sincronización real. Al cierre de A solo se verifican documentos e integridad, **no se ejecuta ninguna de las pruebas propuestas**. B00 pendiente; B05.4B no iniciada.

## B05.4B — Matriz ejecutada y alcance real

**191 backend aprobadas: 67 nuevas (59 memoria/contratos/HTTP y 8 persistencia temporal) + 124 regresiones (39 legacy, 50 JWT, 35 identidad persistente).** Además 64 regresiones C# Outbox realmente reejecutadas: **255 totales, 0 fallidas finales**. Las 791 históricas no se reejecutaron completas. Ninguna repetición de batería se suma como un test nuevo.

Primera puerta: productor real C# genera 63 sobres sintéticos de cuatro tipos, con seis eventos animales, finales, nulls, UTC-ms, enteros máximos y clasificación. Gate Node verifica bytes/hash/forma exacta sin normalizar. Segunda puerta: JWTv2 y vínculo desde repositorio existente con revocación rechazada. Ambas pasaron antes de montar el receptor. Corpus y exportador bajo tests/sync/support; ningún dato real extraído de SQLite.

### Los 50 casos aprobados
| Caso | Evidencia ejecutada | Resultado |
|---|---|---|
| T01 | tests/sync/ingestion.test.js | APROBADA |
| T02 | tests/sync/ingestion.test.js | APROBADA |
| T03 | tests/sync/ingestion.test.js | APROBADA |
| T04 | tests/sync/ingestion.test.js | APROBADA |
| T05 | tests/sync/ingestion.test.js | APROBADA |
| T06 | tests/sync/ingestion.test.js | APROBADA |
| T07 | tests/sync/ingestion.test.js | APROBADA |
| T08 | tests/sync/ingestion.test.js | APROBADA |
| T09 | tests/sync/ingestion.test.js | APROBADA |
| T10 | tests/sync/ingestion.test.js | APROBADA |
| T11 | tests/sync/ingestion.test.js | APROBADA |
| T12 | tests/sync/ingestion.test.js | APROBADA |
| T13 | tests/sync/ingestion.test.js | APROBADA |
| T14 | tests/sync/ingestion.test.js | APROBADA |
| T15 | tests/sync/persistence.test.js | APROBADA |
| T16 | tests/sync/ingestion.test.js | APROBADA |
| T17 | tests/sync/ingestion.test.js | APROBADA |
| T18 | tests/sync/ingestion.test.js | APROBADA |
| T19 | tests/sync/ingestion.test.js | APROBADA |
| T20 | tests/sync/ingestion.test.js | APROBADA |
| T21 | tests/sync/ingestion.test.js | APROBADA |
| T22 | tests/sync/ingestion.test.js | APROBADA |
| T23 | tests/sync/ingestion.test.js | APROBADA |
| T24 | tests/sync/ingestion.test.js | APROBADA |
| T25 | tests/sync/ingestion.test.js | APROBADA |
| T26 | tests/sync/ingestion.test.js | APROBADA |
| T27 | tests/sync/ingestion.test.js | APROBADA |
| T28 | tests/sync/ingestion.test.js | APROBADA |
| T29 | tests/sync/ingestion.test.js | APROBADA |
| T30 | tests/sync/ingestion.test.js | APROBADA |
| T31 | tests/sync/ingestion.test.js | APROBADA |
| T32 | tests/sync/ingestion.test.js | APROBADA |
| T33 | tests/sync/ingestion.test.js | APROBADA |
| T34 | npm test: 39 legacy + 50 JWT + 35 identidad persistente | APROBADA |
| T35 | tests/sync/ingestion.test.js | APROBADA |
| V01 | tests/sync/ingestion.test.js | APROBADA |
| V02 | tests/sync/ingestion.test.js | APROBADA |
| V03 | tests/sync/ingestion.test.js | APROBADA |
| V04 | tests/sync/ingestion.test.js | APROBADA |
| V05 | tests/sync/ingestion.test.js | APROBADA |
| V06 | tests/sync/ingestion.test.js | APROBADA |
| V07 | tests/sync/ingestion.test.js | APROBADA |
| V08 | tests/sync/ingestion.test.js | APROBADA |
| V09 | tests/sync/ingestion.test.js | APROBADA |
| V10 | tests/sync/ingestion.test.js | APROBADA |
| V11 | tests/sync/ingestion.test.js | APROBADA |
| V12 | tests/sync/ingestion.test.js | APROBADA |
| V13 | tests/sync/ingestion.test.js | APROBADA |
| V14 | tests/sync/ingestion.test.js | APROBADA |
| V15 | tests/sync/ingestion.test.js | APROBADA |

T34 se satisface con regresiones existentes realmente ejecutadas, sin duplicar su implementación para aumentar el conteo. Ningún caso T/V bloqueado. Variantes adicionales S01–S11 y D01–D07 cubren consulta HTTP de recibos, UTF-8/BOM/charset/cuerpo vacío, contextos falsos/IDs de cuenta-sesión incorrectos, recibo corrupto, retry anterior a muerte, fórmula de finales para los seis conteos, heads sin doble conteo, cuota, fechas/UUID, intervalos vacíos/adyacentes y persistencia/concurrencia/crash/revocación entre procesos.

### Persistencia entre procesos y límites

Los ocho tests de persistencia usan nuevos directorios privados identity-d2-<UUID> fuera de OneDrive, con guarda de owner/Allow y sin cambiar ACL. Claves/identidades/sesiones/ingestión cifradas en repositorios de ensayo separados y un coordinador común para revocación y commit. Maestro solo en RAM e IPC, no argv/entorno/disco. Receptor en procesos HTTP independientes127.0.0.1/puerto0 recarga la misma clave, sesión y recibo; no se sustituye por Maps nuevos.

Pérdida de respuesta tras commit conserva hecho/receipt; retry devuelve el núcleo previo. Caída antes de commit conserva snapshot viejo; después, conserva receipt. Crash abrupto deja lock residual y siguientes escrituras fallan503 hasta recuperación explícita, como prescribe A; no se borra lock automáticamente. Esto es una limitación de disponibilidad del adaptador de archivos, no un test omitido ni prueba de HA/Mongo/apagón. Todos los directorios propios se verificaron y eliminaron al finalizar.

El modelo applySyntheticAck es únicamente una prueba del futuro límite de transporte: valida dueño/hash/versiones/lease/intento vigente y conserva confirmed; no implementa cliente HTTP Godot ni abre SQLite. Las64regresiones C# verifican también Confirm real sobre bases nuevas, incluidos lease vencido/ACK viejo/recibo contradictorio.

### Verificación y puertas posteriores

Comandos actuales: gate de compatibilidad, gate de identidad, npm test y GameSave.Checks --outbox. JavaScript --check en37archivos:0errores; exportador .NET8:0errores/0advertencias. Godot no ejecutado ni recompilado;63advertencias antiguas no son resultados nuevos. Los primeros lanzamientos requirieron resolver comillado PowerShell y sandbox EPERM de subprocesos; la batería final no tiene fallos ni omitidos.

No modelos Mongo, Atlas, conexiones externas, datos reales, cambios de Godot o bases protegidas. Puerto Mongo deberá demostrar índices/transacciones/fences/commit incierto y recibos de nuevo en entorno desechable autorizado. B00/custodia productiva pendientes. B05.4B COMPLETADA EN CÓDIGO sintético; B05.4C no iniciada y requiere autorización. Trabajo detenido.
## B05.4C.1 — Adaptador MongoDB/Mongoose aislado (2026-10-28)

**COMPLETADA EN CÓDIGO; PROBADA CON DOBLES; NO VALIDADA CONTRA MONGODB LOCAL.** Este estado sustituye las indicaciones históricas de «C no iniciada» únicamente dentro del alcance sintético autorizado de C.1. MongoDB real/Atlas y producción siguen sin habilitarse.

Modelos de operaciones (recibo embebido), hechos y controles; índices únicos cuenta/operationId y scope/sourceKey; adaptador inyectable por el mismo puerto. Los cuatro sobres, bytes/hash y contratos HTTP/JWT/recibos se conservan. Transacción con snapshot/majority/journal, escritura de fence Mongo y barrera de sesión/autorización obligatoria; no se utiliza el bloqueo de archivos de B. Ante resultado incierto, 503 sin ACK especulativo y retry con la misma clave. Sin nuevas rutas admin o cambios de app/server.

Mongoose 9.11.2 instalado exclusivamente desde caché local, sin scripts ni descargas de servidor. No mongod/mongosh disponibles en PATH; Docker Desktop sin motor activo. No se conectó una base MongoDB, personal o remota. Las verificaciones de índices/topología/transacciones y concurrencia nuevas utilizaron dobles, no prueban garantías del servidor real. La identidad Mongo y su acoplamiento duradero con revocaciones/control de sesión permanecen bloqueantes para cualquier despliegue; no basta copiar controles desde memoria o usar un callback permisivo.

**235 pruebas backend aprobadas: 44 nuevas con dobles + 191 regresiones (39 legacy, 50 JWT, 35 identidad persistente y 67 ingestión B). Cero fallidas finales.** Las ocho regresiones de archivos de B siguen siendo persistencia sintética, no Mongo. Gates C#/Node (63 vectores) e identidad/vínculo aprobados; 43 archivos src/sync-tests sin errores de sintaxis. No se suman vectores o ejecuciones repetidas al total. No se reejecutaron las 64 pruebas C# ni las 791 históricas completas, ni se compiló/inició Godot.

Una aserción JWT histórica que prohibía instalar Mongoose se actualizó, con justificación técnica, para exigir que la composición JWT siga independiente/desconectada y permita login local sin Mongo. El resto de la batería se conservó. Primer pase completo: 234 aprobadas y ese único fallo; pase final: 235 aprobadas. EPERM inicial de Vitest se resolvió mediante permiso de subprocesos, sin alterar ACL.

Tres bases protegidas: hashes/tamaños/fechas/propietarios/ACL idénticos antes/después, sin SQL ni operaciones reales enviadas. `.env`: 278 bytes, fecha/propietario/SDDL idénticos; **no se abrió ni recalculó su hash en C.1**. El SHA histórico sigue documentado, sin una nueva certificación del contenido. No comandos de cambio de ACL, propietarios o herencia. B00 pendiente; cero procesos de ensayo o fixtures privadas restantes.

Recomendación C.2: autorización separada de entorno replica set local nuevo y desechable, binario confiable, rutas exclusivas y loopback; integrar identidad/revocación transaccional y probar índices, carreras, commit incierto y recibos tras reinicio reales. Prototipo acotado (1000 operaciones/2 MiB, fence global) pendiente de rendimiento, custodia y controles productivos. No Atlas, Godot HTTP, operaciones runtime, AWS o B05.5. Trabajo detenido.

[Inventario, modelos, garantías, resultados y límites](B05_MONGODB_ADAPTER_IMPLEMENTATION.md).
## B05.4C.2 — Preflight: INFRAESTRUCTURA PENDIENTE

2026-10-28. Inspección completada sin iniciar servidores o instalar software. No se halló mongod/mongosh en PATH ni en ubicaciones de instalación revisadas; sin servicios Mongo/Docker ni procesos Mongo activos. Compass 1.53.0 instalado; Docker Desktop 4.95.0 sin motor disponible. Puerto propuesto 27184 sin listeners y aproximadamente 107,5 GiB libres. La búsqueda acotada no descarta una instalación portátil no declarada.

La puerta de infraestructura exige detenerse: **0 integraciones Mongo reales y 0 pruebas automatizadas ejecutadas en C.2**. Las 235 aprobadas de C.1 siguen siendo evidencia anterior, no reejecutada. Se prepararon configuración local y matriz de 30 casos pendientes; índices, transacciones, recibos, reinicios y carreras reales siguen sin verificar. La identidad memoria/archivo no actualiza los controles Mongo al revocar: la corrección de coordinación está propuesta y no implementada. No usar un callback permisivo ni copiar controles una sola vez como garantía.

Tres bases protegidas: hash/tamaño/mtime/owner/SDDL iguales antes/después; propietario/SDDL de raíz y backend iguales. `.env` no se consultó, abrió ni hasheó; no se certifica de nuevo su contenido o ACL individual. No cambios de permisos/herencia/propietarios, código, contratos, Godot o SQLite. B00 pendiente.

[Informe de infraestructura, propuesta y pruebas pendientes](B05_MONGODB_LOCAL_INTEGRATION.md). La siguiente acción requiere infraestructura local desechable explícitamente autorizada y repetir el preflight. Sin Atlas, descargas automáticas, activación Docker, AWS o B05.5. **INFRAESTRUCTURA PENDIENTE; trabajo detenido.**
## B05.4C.2C — Modo Atlas explícito, sin conexión remota

2026-10-28. **COMPLETADA EN CÓDIGO Y DOBLES; NO VALIDADA CONTRA ATLAS.** Factory sin conector por defecto y sin selección por variables de entorno. Host/usuario/base exactos, TLS estricto, permiso inspeccionado mediante connectionStatus de solo lectura y scope interno por runId; rama local conserva loopback/base temporal/sin credenciales. Creación del repositorio requiere allowWrites explícito y modelos de colecciones exclusivas; autoCreate/autoIndex desactivados. Arranque, endpoints, cuatro sobres y JWT existentes sin cambios.

Canal de credenciales opaco de un uso/RAM y lanzador manual de una futura D: exige autorización, ruta privada y receptor con hash revisado antes del prompt. Solo probado con buffers ficticios; no secreto real recibido ni conexión Atlas. Identidad/revocaciones siguen en memoria/archivo y no se declara coordinación durable resuelta. B00 pendiente.

**271 pruebas backend aprobadas: 36 nuevas + 235 regresiones; cero fallidas finales.** Los 63 vectores C#/Node y gate de identidad pasaron; no se suman como tests nuevos. 48 JS sin errores de sintaxis; parser PowerShell sin errores y arranque sin autorización denegado antes de pedir credencial. No .NET/Godot ejecutados, instalaciones, datos reales o ACL modificados. Las tres bases se comparan por integridad/metadatos; .env excluido de lectura/hash.

[Configuración, archivos, pruebas, límites y propuesta D](B05_ATLAS_INTEGRATION_MODE.md). D requiere autorización de conexión real inicialmente de lectura, credenciales temporales, ruta/receptor revisados y tratamiento explícito de B00/identidad durable. Ninguna escritura/limpieza remota autorizada por C.2C. B05.4C.2D y B05.5 no iniciadas; trabajo detenido.
## B05.4C.2D.1 — Diagnóstico real de solo lectura bloqueado

2026-10-28. **BLOQUEADA / NO COMPLETADA.** El usuario activó dos canales privados; ambos terminaron con atlas_connection_unavailable antes de verificar autenticación/destino/permisos. Resúmenes no secretos conservados por ejecución, cierre indicado y cero escrituras/transacciones. No presentar Compass o la entrega del canal como conexión Mongoose satisfactoria.

Se corrigió una incompatibilidad local del factory: el driver rechaza tlsInsecure junto a tlsAllowInvalidCertificates/Hostnames aunque sean false. Se retiró el flag redundante conservando TLS estricto y se endureció la comprobación de sus opciones normalizadas. Los constructores reales sin connect comprueban esa corrección. El segundo fallo sigue sin causa concreta determinada por su resumen sanitizado. DNS SRV Windows/Node y un handshake TLS independiente del clúster autorizado resultaron satisfactorios sin credenciales; no acreditan autenticación.

35 pruebas sintéticas distintas aprobadas: 13 nuevas de diagnóstico/driver sin red + 22 regresiones de lectura/configuración. 14 casos excluidos por filtro, sin ejecutarlos ni contarlos como aprobados; las 271 anteriores no se reejecutaron completas. El sender bloquea ahora un resultado existente antes del prompt para evitar pedir otra contraseña en un run consumido. No credenciales reales en chat, args, env o archivos; no .env, Godot, índices, modelos, identidades o usuarios remotos modificados. B00 e identidad durable pendientes.

[Resultado completo, evidencias, corrección y límites](B05_ATLAS_READONLY_CONNECTION_RESULT.md). Un diagnóstico posterior deberá categorizar errores sin secretos y preservar las barreras; no autorización implícita de escrituras o transacciones. D.2 y B05.5 no iniciadas; trabajo detenido.