# B83 — Preparación segura de Atlas para estadísticas

Fecha de consulta y elaboración: **4 de noviembre de 2026, America/Guatemala**.

**PREPARACIÓN DOCUMENTADA; NO AUTORIZA DESPLIEGUE.** Se recomienda un híbrido por tipo, dentro de campañas estadísticas finitas y explícitas. La recomendación **queda pendiente del propietario**; no se implementó una política productiva, perfil Atlas, usuario, rol, colección ni panel. No se conectó MongoDB, ni local ni Atlas, en esta fase. B00 pendiente; v5 preservado/sin activar; B84 no iniciada.

## 1. Estado recibido y arquitectura vigente

B82 acreditó 17 casos reales repetidos tres veces, 18 nuevos casos reales y 638 comprobaciones/regresiones locales. Se recuperaron 25 solicitudes agotadas, sin pérdidas ni doble conteo en las muestras. El contenedor del propietario quedó en ejecución. Estos son **resultados recibidos**, no campañas repetidas en B83. Commit incierto real, failover, corte eléctrico, capacidad sostenida y producción seguían pendientes.

La sección vigente B79 de ARCHITECTURE.md/REQUIREMENTS.md prevalece sobre diseños históricos: **Windows x64**, Godot 4.6.1 Mono/.NET 8; SQLite autoridad exclusiva de partidas, decisiones y progreso; Outbox local; Express recibe statistics-only-v1; Mongo conserva agregados y registros técnicos mínimos. Sin Android, recuperación de partidas desde nube, cuentas personales ni expedientes individuales.

Flujo propuesto, todavía no habilitado:

```text
Godot → SQLite/Outbox local → HTTPS → servicio statistics-only
                                      → transacción de agregados + claves + recibo
                                      → MongoDB exclusivo de estadísticas
panel autenticado → servicio de lectura agregada con otra identidad DB
```

Se revisaron B77–B82, B59/B60/B62–B67 y su corrección B67.2, arquitectura/requisitos y fuentes de contrato, Express, identidad sintética, repositorio, proyector, esquemas, adaptador, cuotas, retry, configuración y cliente .NET. No se importó una configuración de partidas como si fuese estadística.

### Estado comprobado en el código

| Componente | Estado / consecuencia |
| --- | --- |
| Contrato/Zod | Nueve tipos cerrados, cinco biomas, fechas UTC, 5 eventos/lote, 32768 bytes de cuerpo, hasta 4096 caracteres/EventJson, hash ligado a bytes originales. Sin snapshots/PII. |
| Autenticación estadística | **SyntheticStatisticsIdentity**, tokens opacos ficticios en memoria, scope statistics:write; no emisor/custodia/revocación productiva acreditados. UUID no autentica a un jugador. |
| Composición HTTP | Solo perfiles statistics-offline-test/statistics-b81-local-test y capacidades sintéticas. No es un servidor productivo de estadísticas. |
| Mongo | Driver 7.7.0, BSON 7.3.3; adaptador inyectado sin conexión automática; políticas actuales rechazan Atlas y bases productivas. |
| Retención | Predeterminado bounded-v1; alternativa b82-run-hybrid-v1 **solo experimental**. Ninguna equivale a la propuesta productiva de este informe. |
| Privilegios legacy | Main B60 espera twosides_backend_v2/two_sides_db y siete main_v2_*; no sirve para este nuevo propósito. No se modificó ni verificó remotamente ese usuario. |
| Envío Godot | ConfigureStatisticsForAuthorizedRun exige activación explícita/consentimiento. Sigue apagado en distribución; no se añadieron credenciales al juego/PCK. |

## 2. Seguridad histórica que se conserva como antecedente

- B59 separó SCRAM de TLS y roles de operación/provisión. No demuestra el mecanismo o privilegios actuales de ninguna cuenta Atlas.
- B60 restringió el candidato legacy, B62 generó v5 y B63–B65 prepararon activación/sonda. Sus autorizaciones y namespaces no cubren estadísticas.
- B66 contrastó una **custodia externa nueva**, no una referencia que existiese antes de B62. No prueba por sí sola privacidad del equipo.
- B67/B67.2 probaron componentes locales y corrigieron INTEGRITY_SEAL; el informe B67.2 conserva **Accept/Cancel manuales pendientes y canal no apto para secretos reales**. No se consultaron directorios privados ni se reutilizó ese despliegue/canal para B83. Certificación actual requerirá una fase propia y alcance estadístico nuevo.
- B79 registró una consulta de existencia a PlayerData real y B81.1 el hash de lectura de la SQLite histórica. Fueron desviaciones; se conservan sus informes, sin justificarlas como centinelas ni repetirlas aquí.

No se ejecutó B00 ni auditoría ACL. TLS/SCRAM correctos, manifiestos y HMAC no eliminan el riesgo de un proceso comprometido bajo la misma cuenta Windows.

## 3. Retención: alternativas y recomendación pendiente

### Comparación

| Criterio | A. Marcas durante toda la vida del contador | B. Solo ventana temporal | C. Híbrido por tipo y campaña finita |
| --- | --- | --- | --- |
| Exactitud | Unicidad de hechos mientras sobrevivan claves/época coherentes | Idempotencia temporal de eventos; **no** impide otro ID/fecha del mismo hecho | Unicidad de hechos dentro de una cobertura explícita; fuera no se promete unicidad global |
| Privacidad/metadatos | HMAC estables durante toda esa vida, potencialmente muy larga | Menos retención; pérdida de memoria semántica | HMAC de cinco hechos hasta un cierre calculable; recibos/actividad/cuotas temporales |
| Crecimiento | Acumula hechos por instalaciones/partidas; el tiempo puede ser indefinido si el contador lo es | Proporcional a flujo × ventana | Hechos durante campaña + flujo temporal; no conserva cada intervalo para siempre |
| Offline/retry | Recibos todavía necesitan una ventana o almacenamiento duradero | Rechaza tardíos fuera del horizonte; requiere informar al cliente | Conserva admisión actual dentro de campaña y explicita el cierre/cobertura |
| Eliminación | Borrar marcas conservando contador abierto pierde garantía | TTL facilita eliminación; no arregla semántica | Cerrar definitivamente el ámbito antes de borrar; agregados históricos quedan inmutables |
| Coste/complejidad | Menor complejidad conceptual, mayor crecimiento/custodia | Económica, pero insuficiente para totales únicos de larga vida | Más control de ciclo de vida y credenciales; coste limitado por alcance |
| Compatibilidad | Se parece a B82, pero su retención productiva no fue aprobada | Es el riesgo demostrado en B81.1 | Reutiliza proyector/recibos y prueba B82, **requiere nuevos controles** antes de desplegar |

**Recomendación C para una primera campaña universitaria acotada**, sin afirmar instalaciones/personas únicas de por vida. No se recomienda volver a B para solucionar el defecto ni convertir A en retención perpetua por omisión. Si el requisito es un total de instalaciones único a través de todas las campañas, C no satisface ese requisito por sí sola: deberá aprobarse A u otra solución con continuidad de claves/evidencia.

### Propuesta concreta de cobertura finita

Parámetros a aprobar, no valores inventados:

- `S`: inicio UTC de captura; `E`: fin UTC elegido por el propietario según la campaña y el consentimiento. **No se eligió una duración de campaña en B83.**
- `R=90 días` de admisión y `F=5 minutos` de tolerancia: son los límites implementados B79, cuya conservación se propone; no un TTL nuevo arbitrario.
- `L=E+R+F`: límite del ámbito. Solo se admite un evento asignado al ámbito si `S ≤ OccurredAtUtc ≤ E`, cumple la ventana rolling actual y el ámbito no está cerrado. Nunca se aceptan nuevas contribuciones después de L.
- Una base dedicada por campaña/época inicialmente. Nombre propuesto de la primera: **two_sides_statistics**; una campaña posterior necesita namespace/credenciales autorizados, sin reabrir la anterior ni reutilizar sus contadores como si mantuvieran unicidad.

Las credenciales técnicas deben estar ligadas a una época inmutable asignada por el servidor. Renovar un token no reasigna su backlog a la campaña siguiente; la ruta legítima conserva bytes/fechas originales y la época no la elige el cliente. Esto no demuestra la fecha real de un hecho frente a un cliente manipulado ni proporciona unicidad entre campañas. **Ese binding, la admisión por campaña y el cierre no existen aún en el código B82.** No basta cambiar expiresAt.

Al cerrar: coordinar estado cerrado y fence transaccional, detener nuevas escrituras, comprobar cierre y retirar permisos de escritura de la cuenta de la campaña. Los marcadores pueden vencer en L porque el ámbito ya no puede recibir otro hecho. TTL puede tardar; verificar eliminación posterior. No depende solo de que una tarea programada cierre a tiempo: los límites de admisión deben comprobarse también en cada petición/transacción. Reloj de servidor, deriva, tareas de cierre y carreras necesitan pruebas.

Los agregados archivados deben permanecer inmutables y cumplir la política de publicación/grupos. La duración de conservación de esos agregados, backups y evidencias debe aprobarse por separado; B83 no supone que sean anónimos o que deban conservarse perpetuamente.

### Tratamiento por tipo

| Tipo | Unicidad propuesta | Retención / límite |
| --- | --- | --- |
| installation_registered | HMAC(instalación,tipo,ámbito); misma instalación no se vuelve a registrar en ese ámbito | Marca hasta L. Cuenta **registros capturados**; no personas ni todas las instalaciones preexistentes. |
| game_started | HMAC(instalación,tipo,GameId,ámbito) | Marca hasta L; otra partida con otro GameId es válida. |
| game_completed | Clave anterior con tipo completion separado | Marca hasta L; no inferir una cohorte por disponer solo del final. |
| environmental_decision | HMAC(instalación,tipo,GameId,BiomeId,ámbito) | Marca hasta L; no retener la opción individual en ella. |
| biome_completed | Clave por partida/bioma/tipo/ámbito | Marca hasta L; otra partida no colisiona. |
| biome_entered | EventId + hash dentro de admisión | Visitas repetidas legítimas pueden tener IDs nuevos; no una marca única por bioma de por vida. |
| playtime_interval | EventId + hash; validación de duración/estado/tiempo | Sin marca duradera por intervalo. IDs/fechas falsificados o solapamientos no se resuelven con esta política. |
| session_started | EventId + hash | Cuenta inicios recibidos; no es autenticación ni persona distinta. |
| session_ended | EventId + hash; closed/interrupted | No inventa abandono ni cobertura completa de tiempo. No se añadió unicidad de sesión adicional. |

Propuesta de recibos: `expiresAt=min(OccurredAtUtc+R+F,L)`. Es **un cambio futuro**, no el actual `max(recepción,fecha)+R+F`. Cubre toda admisión posible del evento sin retener otros 90 días innecesarios desde una recepción muy tardía; requiere probar fronteras, pérdida de respuesta y compatibilidad del cliente.

Actividad: `min(fin del período UTC+R+F,L)`; presupuestos: siguiente día UTC de recepción, sin cambiar cuota. Marcas semánticas: L, no un vencimiento rolling por evento. Antes de L no deben poder desaparecer por TTL. La fórmula recomendada no es la política B82 sin fecha: se parece en su garantía de marca, pero añade un cierre finito verificable.

Después del cierre no se suman campañas para presentar un total **único de instalaciones**: pueden contener la misma instalación. Las instalaciones preexistentes sin registro nuevo tampoco se inventan. Si el propietario exige esa métrica universal, hay una decisión pendiente, no una conversión silenciosa del significado.

Eventos fuera de cobertura/admisión se conservan localmente con error explícito; nunca se cambia EventId/OccurredAtUtc ni se borran pendientes para hacerlos pasar. El contrato actual solo reconoce determinados códigos, incluidos invalid_time/event_expired/fact_conflict: un código nuevo como epoch_closed requeriría modificar/versionar y probar cliente/servidor. La UX y el comportamiento de backlog al cerrar una campaña son decisiones previas a su activación.

## 4. Diseño final propuesto de almacenamiento

Especificación candidata, no creada ni aceptada por el adaptador actual. Seis colecciones; campos cerrados y `validationLevel:strict`, `validationAction:error`. Identificadores HMAC hexadecimales de 64 caracteres; fechas BSON Date. Sin JSON original, nombres, correo, rutas, hardware, guardados o cuentas personales.

| Colección | Campos/tipos propuestos | Índices / retención | E/S y relación atómica |
| --- | --- | --- | --- |
| stats_v1_counters | `_id`: all/day:YYYY-MM-DD/month:YYYY-MM; `values`: objeto con las 56 métricas enumeradas actuales; `revision`: entero seguro solo en all | `_id` único, sin TTL; aditivos mensuales se derivan de días; mensual físico solo actividad distinta | Leer contadores, $inc; crear buckets acotados por calendario. Fence/contadores comparten transacción con ledger. |
| stats_v1_receipts | `_id`: tag de evento/ámbito; `hash`: SHA-256 de bytes; `revision`: entero seguro positivo; `expiresAt`: Date calculado arriba | `_id` único; expiry_v1 `{expiresAt:1}`, TTL(0) | Lectura puntual, inserción inmutable, reutilización exacta vencida cuando proceda. Sin payload. |
| stats_v1_semantic | `_id`: tag de hecho/ámbito; `expiresAt`: Date **L** | `_id` único + TTL(0); no caduca por antigüedad individual del hecho | Leer/insertar una marca con las mismas contribuciones. No actualizarla/borrarla desde ingesta. |
| stats_v1_active | `_id`: tag de instalación/período/ámbito; `expiresAt`: Date | `_id` único + TTL(0), fin de período/admisión limitado por L | Leer/insertar solo al contribuir actividad distinta; no consulta por instalación en claro. |
| stats_v1_budgets | `_id`: tag instalación/día de recepción; `value`: entero seguro; `expiresAt`: Date | `_id` único + TTL(0), siguiente día UTC | Lectura y replace/upsert de cuota en la misma transacción. Sin incremento de cuotas legacy. |
| stats_v1_meta | `_id`: statistics-v1; schemaVersion, policyVersion, keyEpoch, keyCheck, captureStart, captureEnd, admitUntil, state=open/closed | `_id` único, sin TTL; **solo lectura para ingesta** | Aprovisionamiento/cierre por administración; no contiene claves, contraseñas ni JWT. |

Validación numérica propuesta: BSON int/long/double, `minimum:0`, `maximum:9007199254740991`, `multipleOf:1`, y Number.isSafeInteger en aplicación. Revision/hash/patterns/campos required se validan; ningún atributo extra o métrica arbitraria. El JSON Schema actual no tiene multipleOf: es un endurecimiento propuesto, pendiente de prueba del nuevo esquema. Mongo documenta ese keyword; no equivale a haberlo probado en Atlas. [JSON Schema oficial](https://www.mongodb.com/docs/manual/reference/operator/query/jsonschema/).

Invariantes de aplicación/provisión que no se sustituyen por el tipo Date: S≤E; L=E+R+F; fechas de cada registro dentro de su política; constantes de política/época coincidentes; sumas tiempo/biomas, finales/completadas, tipos/eventos y días/total consistentes. Un índice único no sustituye atomicidad multidocumento.

**Cambio propuesto de separación de privilegios:** trasladar el fence/revisión mutable desde meta al documento global de counters. La política de campaña queda en meta de solo lectura. El cierre administrativo deberá modificar estado y fence en una misma transacción para abortar/revalidar escritores anteriores. No se implementó ni se afirma que reduzca contención; evita dar UPDATE sobre la política a ingesta. El adaptador actual rechaza esa forma de counters/meta: necesita una fase de implementación y nuevo sellado.

No se añaden índices por instalación, GameId, SessionId, opción individual o EventJson. Lecturas diarias por claves exactas/rango acotado y mensuales derivadas; no índices secundarios duplicados si `_id` ya cubre la clave. TTL es asíncrono, no una garantía de borrado en el instante exacto. [Contrato TTL](https://www.mongodb.com/docs/manual/core/index-ttl/).

## 5. Privilegios exactos: código actual frente al candidato

La matriz se refiere solo a la base de estadísticas aprobada, enumerando nombres completos; no comodines, readWrite/dbOwner/dbAdmin/atlasAdmin, main_v2_*, two_sides_db ni otras bases. Las acciones acumuladas de todos los roles deben coincidir con el conjunto previsto; añadir un rol restrictivo a uno amplio no lo reduce.

### Servicio de ingesta

| Colección | Camino híbrido B82 actual | Candidato productivo propuesto |
| --- | --- | --- |
| counters | FIND, INSERT, UPDATE | FIND, INSERT, UPDATE |
| receipts | FIND, INSERT, REMOVE | FIND, INSERT, REMOVE mientras subsista el algoritmo de reutilización |
| semantic | FIND, INSERT | FIND, INSERT; expirar solo al cierre, sin deleteOne de ingesta |
| active | FIND, INSERT, REMOVE | FIND, INSERT, REMOVE mientras se llame a deleteOne al insertar |
| budgets | FIND, INSERT, UPDATE | FIND, INSERT, UPDATE |
| meta | FIND, UPDATE por el fence actual | **FIND**, tras mover el fence a counters |

En ambos: LIST_COLLECTIONS sobre **esa base**, LIST_INDEXES en sus seis colecciones para preflight. Sin CREATE_INDEX, COLL_MOD, DROP_*, BYPASS_DOCUMENT_VALIDATION, SERVER_STATUS, GET_CMD_LINE_OPTS, LIST_DATABASES o administración de sesiones/usuarios. Transacciones no justifican privilegios administrativos genéricos.

REMOVE de receipts/active no es hipotético: el adaptador actual envía deleteOne sobre **esa clave vencida**, incluso cuando borra cero documentos. No se puede quitar del rol sin cambiar y probar ese camino. No se concede REMOVE en budgets ni semantic por comodidad. Los permisos son por colección, no una restricción de predicado/columna: código comprometido puede abusar de sus colecciones; mínimo privilegio limita ámbito, no reemplaza autorización e integridad.

### Administración de esquema y mantenimiento

| Tarea | Recursos y acciones previstas |
| --- | --- |
| Aprovisionar base nueva | CREATE_COLLECTION en las seis; CREATE_INDEX en receipts/semantic/active/budgets; INSERT en semilla counters y meta; LIST_COLLECTIONS de la base; LIST_INDEXES seis; FIND counters/meta para verificar. Validadores se envían en createCollection. |
| Cerrar campaña | UPDATE counters/meta y lecturas correspondientes; identidad temporal distinta de ingesta. Retirar después los permisos de escritura del usuario de ingesta mediante el propietario Atlas. |
| Cambiar esquema existente | Solo tras plan autorizado: COLL_MOD en colecciones enumeradas; CREATE_INDEX/DROP_INDEX en los índices afectados; acciones de datos adicionales de esa migración, con inventario y prueba previos. No concesión permanente por rutina. |
| Reversión/limpieza destructiva | No DROP_DATABASE/DROP_COLLECTION automático. Necesita objeto, autorización, respaldo y alcance propios. TTL realiza la eliminación ordinaria del servidor. |

### Panel administrativo

FIND solamente en counters y meta necesarios para cobertura/snapshot; sin INSERT/UPDATE/REMOVE, sin datos de receipts/semantic/active/budgets ni claves. El servicio devuelve una proyección de metadata sin fingerprint/keyCheck, y debe reutilizar la política de supresión sin exigir la clave HMAC de ingesta. No basta exponer readCommitted completo.

**Distinción crítica:** ingesta necesita FIND sobre counters para sus invariantes. Por ello una credencial DB de ingesta no puede ser a la vez incapaz de leer esos contadores. El negativo «credenciales de ingesta no abren el panel» se exige en **autenticación/autorización HTTP con otra audiencia/scope**, no como una falsa denegación Mongo del FIND que sí necesita. Panel no tiene acceso inverso a ledgers técnicos.

Acciones y nombres Atlas se contrastaron con documentación oficial; debe verificarse la unión efectiva y disponibilidad en el proyecto autorizado antes de crear nada. [Acciones Atlas](https://www.mongodb.com/docs/atlas/reference/custom-role-actions/), [roles personalizados](https://www.mongodb.com/docs/atlas/security-add-mongodb-roles/).

Nombres propuestos nuevos: `twosides_statistics_ingest_v1`, `twosides_statistics_schema_v1` temporal y `twosides_statistics_reader_v1`; roles `two_sides_statistics_ingest_v1`, `...schema_v1`, `...reader_v1`. Son propuestas, no existencia confirmada. Mantener usuarios/roles legacy intactos hasta un inventario y retirada autorizados; no reutilizar sus secretos o permisos.

## 6. Identidad, credenciales y conexión segura

Separar tres identidades: jugador/instalación técnica del transporte; usuario DB de Express; administrador del panel/operador Atlas. Nunca Mongo en Godot/PCK. El emisor sintético no se publica: hay que decidir/probar emisión, audiencia, renovación/revocación y persistencia o verificación de la credencial técnica estadística, con binding de época. Reutilizar criptografía validada no significa reutilizar cuentas de partidas ni asumir resuelta identidad durable.

Propuesta de contrato de proceso, **no implementado**:

| Configuración no secreta | Regla |
| --- | --- |
| TWOSIDES_PROFILE=statistics | Nuevo perfil; no main, integration ni lanzador de pruebas. |
| STATISTICS_ENABLE | false por defecto; true requiere autorización/scope vigentes e integridad verificada. |
| STATISTICS_ATLAS_HOST | Host fijado al clúster aprobado; propuesta histórica <cluster>.<id>.mongodb.net, no verificado remotamente. |
| STATISTICS_DATABASE / SERVICE_USER | Base y cuenta estadísticas exactas aprobadas, sin fallback. |
| STATISTICS_POLICY_VERSION / KEY_EPOCH | Solo una política/época productiva aprobada; rechazar b82-run-hybrid-v1. |
| STATISTICS_CAPTURE_START/END | Constantes UTC aprobadas, contrastadas con meta de solo lectura. |
| STATISTICS_HTTPS_AUDIENCE | Origen HTTPS único autorizado del cliente, no URI Mongo. |

URI sin secretos de ejemplo conceptual: `mongodb+srv://<host-aprobado>/<base-estadistica-aprobada>`; usuario/contraseña se suministran al driver por opciones/capacidad protegida, **no** como argumentos, URI en logs, fallback MONGODB_URI ni .env del juego. SCRAM-SHA-256 explícito, authSource admin, TLS con cadena/nombre normales, sin DEFAULT/SHA-1 alternativos ni callbacks que acepten certificados inválidos. [SCRAM](https://www.mongodb.com/docs/v8.0/core/security-scram/).

Guardar secretos en gestor/canal del servicio fuera de Git/OneDrive, certificando primero B00 y la ruta de arranque. No incrustar HMAC/JWT privados en binarios ni asumir que DPAPI protege frente al mismo usuario comprometido. Verificar código/dependencias/manifiesto **antes** de pedir un secreto; stdin/RAM evita argumentos y archivos, pero no prueba integridad del receptor ni elimina todas las copias del GC.

Restricción al clúster e IP de salida autorizados; no 0.0.0.0/0. Separar identidad de control Atlas de usuario DB y auditar cambios sin contraseñas. [Usuarios Atlas](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/).

Rotación DB: nueva cuenta/credencial mínima en paralelo, comprobación independiente, sesión autorizada acotada, cambio de servicio, recibos/denegaciones/cierre y después retirada aprobada de la anterior. Rotación HMAC es distinta: consultar/migrar épocas antiguas durante su garantía o retirar el ámbito coherentemente; jamás cambiarla por reinicio y perder la deduplicación.

Timeouts candidatos iniciales, pendientes de campaña: selección/conexión 5 s, operaciones 5 s, commit hasta dos llamadas de 5 s, espera de pool 2 s; cliente .NET 15 s actual. Deben probarse **como presupuesto extremo a extremo**, no sumar límites y prometer que caben en 15 s. Tres intentos de transacción y cola/espera actuales pueden exceder el cliente: se requiere un deadline propagado antes del commit y conciliación posterior sin ACK falso. No reintentos de autenticación ilimitados.

Reconexión con backoff+jitter, IDs intactos y pendientes conservados; no reconectar por cada evento. Cierre: dejar de aceptar, drenar con presupuesto, resolver/registrar incertidumbre, cerrar sesiones y pool. Errores solo categoría/etapa/código seguro, runId de campaña sintética y contadores; sin URI completa, stacks originales, payloads, tokens, identificadores/IP persistidos o objetos de configuración.

## 7. Transacciones, recibos y límites de consistencia

Mantener sesión única por evento, snapshot, primary, majority+j:true, unicidad _id y unidad marca/cuota/contadores/recibo/fence. Confirmar HTTP individual solo después del commit. Una lectura administrativa compuesta debe usar snapshot o un agregado publicado consistente, no concatenar lecturas sueltas con readConcern local. [Transacciones oficiales](https://www.mongodb.com/docs/manual/core/transactions/).

TransientTransactionError/WriteConflict: abort/retry acotado. DuplicateKey: aborto y nueva lectura/idempotencia; no rechazo permanente indiscriminado. UnknownTransactionCommitResult: reintentar el mismo commit según presupuesto o conciliar recibo por hash/revisión, sin replay ciego del negocio. SDK puede reintentar comandos internamente; no multiplicar presupuestos a escondidas. Sin prueba positiva, estado reintentable/incertidumbre, no éxito ficticio.

El tier, latencia, límites y failover Atlas no se validan por un contenedor local de un nodo. No se desactiva journaling/majority ni se sustituyen transacciones para obtener rendimiento. Verificar posteriormente topología, concerns efectivos, opciones/identidad y resultados con el rol real.

## 8. Contención y capacidad: diagnóstico y mejoras propuestas

Observado B82: 148 conflictos 112, 25 agotamientos iniciales; 3/4/8 escritores terminaron con 10/13/25 eventos y recibos. En A con ocho escritores se agotaron 7/16 y en mezcla 10/16. Máximos de latencia de esas muestras ~287/285/303 ms; no son p95 globales ni SLA. La recuperación FIFO posterior no demuestra capacidad concurrente sostenida.

Cuellos de botella confirmados por código:

- Fence global escrito en cada transacción, incluidos duplicados; all/day y presupuestos compartidos suman conflictos.
- Lectura de **todos** los documentos de contadores en cada transacción para invariantes: O(períodos), respuesta/CPU crecientes. Consultas generales deben evitar ledgers; ya existe includeTechnical:false.
- Límite por IP 120 peticiones/min y por instalación 60/min; trust proxy=false. Detrás de Caddy todas pueden aparecer con la IP del proxy. Un campus/NAT también comparte IP. No activar trust proxy=true sin fijar proxies de confianza y saneamiento de cabeceras. Cuotas/rate limit se deben probar con la topología definitiva, no aumentarlas por B83.
- Cuota 6000 eventos nuevos/instalación/día; duplicados no la consumen. Lotes de 5, no una transacción por lote. La media de tráfico no caracteriza backlog simultáneo al reconectar.

Orden mínimo propuesto: límites de concurrencia/backpressure y Retry-After compatibles, presupuestos coordinados con cliente, métricas por categoría, consultas por períodos necesarios e invariantes de deltas. Después evaluar particiones fijas de contadores por tag técnico y sumar en lectura con snapshot. Cada evento debe incrementar un solo bucket determinista y su ledger en la misma transacción; deduplicación sigue única. Particionar el fence sin reexaminar invariantes de rango/época/lectura puede romper atomicidad.

No se implementó una optimización ni se cambiaron intentos, cuotas, esquema o contrato. Mover fence a counters por privilegios **no** elimina su contención. La capacidad esperada, escritores simultáneos, tolerancia a agotamientos y SLA necesitan respuesta del propietario y medición con historia/backlog sintéticos.

## 9. Costos y crecimiento paramétricos

### Variables y fórmulas

Sean `I` registros de instalación en campaña, `A` instalaciones activas/día, `s` sesiones/activa/día, `m` minutos efectivos/sesión, `f` intervalos por hora efectiva, `g` partidas iniciadas/activa/día, `q` fracción completada, `v/d/b` visitas/decisiones/biomas completados por partida iniciada y `T` días de captura. Son supuestos, no mediciones de jugadores.

```text
H_d = A*s*m/60
G_d = A*g
Eventos_d = I/T + 2*A*s + G_d*(1+q+v+d+b) + H_d*f
Marcas_semánticas = I + T*G_d*(1+q+d+b)
Recibos_residentes ≈ Eventos_d * min(T, R + F/día)
Actividad = suma de distintos instalación/día y mes cuyos marcadores no vencieron
Presupuesto ≈ A documentos/día, con margen de barrido alrededor del cambio UTC
Contadores = 1 global + días cubiertos + meses con actividad distinta
Almacenamiento = Σ(documentos_grupo * bytes_BSON_grupo) + Σ(entradas_índice * bytes_por_entrada)
```

El modelo usa cota conservadora de hasta 92 días de marcadores diarios y cinco meses de marcadores mensuales para R=90; la retención exacta es por fechas UTC y se limita por L. Sesiones cerradas se suponen una por inicio solo para dimensionar; no se afirma que todas se reciban. El heartbeat B77 de 30 s orienta `f=120`, pero pausas/cierres generan fragmentos y debe medirse f real. No se extrajeron muestras de SQLite ni se usaron los 71 eventos reales para ajustar tasas.

La estimación de recibos anterior supone la **propuesta de expiración por fecha del evento** y tráfico uniforme, no una garantía de llegada. El código actual conserva desde max(recepción,fecha), por lo que entrega offline muy tardía puede incrementar bastante residencia; el modelo también registra el sobre de todos los eventos de campaña como sensibilidad. Los backlogs/fechas alteradas y picos requieren otro escenario, no una media diaria.

### Bytes medidos sin Mongo ni datos reales

Se serializaron documentos BSON ficticios con BSON instalado 7.3.3: counters con las 56 celdas en cero y revisión, **1438 B**; receipt **187 B**; semantic con Date **98 B**; active **98 B**; budget **109 B**; meta propuesta **300 B**. Son tamaños **BSON sin comprimir de esas formas**, no estadísticas del disco/índices Atlas. Enteros mayores, prefijos, allocation, validadores, backups y otras formas añaden coste; mensual real es menor que un documento completo de celdas.

No hay medición de índices. El modelo conserva explícitamente **64/128/256 B por entrada como supuestos de sensibilidad**, no resultados. Se cuentan dos entradas por registro con TTL y una en counters/meta. No existe un factor de compresión garantizado.

| Escenario ficticio | I / A / activos mensuales / T | Sesiones × minutos; partidas por activa | Horas/día; eventos/día | Recibos / marcas | BSON MiB | BSON + índices supuestos MiB (64/128/256 B) |
| --- | --- | --- | --- | --- | --- | --- |
| Laboratorio universitario | 50 / 5 / 20 / 30 | 1×20; 0,25 | 1,67; 231,42 | 6943 / 455 | 1,35 | 2,28 / 3,22 / 5,08 |
| Piloto pequeño | 1000 / 100 / 500 / 90 | 1×30; 0,30 | 50; 6685,11 | 601660 / 30161 | 111,36 | 189,93 / 268,50 / 425,65 |
| Crecimiento | 10000 / 1000 / 5000 / 180 | 1,5×30; 0,30 | 750; 97795,56 | 8801940 / 593200 | 1636,56 | 2797,96 / 3959,37 / 6282,18 |

En los tres: q=0,8, v=5, d=5, b=4 y f=120, **solo hipótesis**. Los documentos se redondean hacia arriba; las tasas fraccionarias son expectativas de conjunto, no eventos fraccionarios.

Inspección del camino actual: ~6 comandos de escritura/evento repetido en un período y hasta ~12 para un hecho con actividad nueva día/mes; ~6–7 lecturas, más commit/getMore/TTL/reintentos. No equivale a operaciones facturadas. Medias hipotéticas de lectura+escritura sin esos extras: 0,032–0,051 / 0,928–1,470 / 13,583–21,506 comandos/s. No son capacidad medida ni incluyen pico de reconexión. El modelo de precios debe usar métricas reales del proveedor, no multiplicar HTTP por una tarifa inventada.

### Referencias públicas de capacidad/precio

Consulta oficial 4/11/2026: Free publica **0,5 GB**, incluyendo BSON **sin comprimir e índices**, y **100 operaciones/s**, con throttling; hay límites de comandos y de observabilidad. El tamaño no valida automáticamente compatibilidad de la campaña. [Límites Free](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/).

La documentación oficial Flex publica **USD 8–30 por 30 días**, 5 GB y 100 ops/s en base, escalando por uso. Es referencia pública, **no cotización del clúster del propietario**, impuestos ni aprobación de gasto. La página comercial general no se pudo recuperar por timeout; no se inventaron precios Dedicated/regionales. Confirmar proveedor/región, tier, backup, otros servicios y facturación antes de autorizar. [Costes Flex](https://www.mongodb.com/docs/atlas/billing/atlas-flex-costs/).

Conclusión condicionada: el laboratorio parece pequeño por volumen bajo estos supuestos; el piloto puede acercarse al límite Free al añadir índices/overhead/backlog y necesita medición/alertas; crecimiento excede Free incluso solo en BSON y su sensibilidad alta supera 5 GB. No se decide un tier ni presupuesto sin I/A/s/m/f/T, picos y margen aprobados. Un proyecto universitario no implica automáticamente coste cero o viabilidad de la carga.

## 10. Contratos de lectura agregada del panel, no endpoints

Propuesta interna `StatisticsSummaryV1`/`StatisticsSeriesV1`: `scope/campaign`, `captureWindowUtc`, `admissionCloseUtc`, `asOfUtc`, `coverageWarnings`, `period=all|day|month`, `available`, `metrics`, `suppressedReasons`. No InstallationId, GameId, SessionId, tags, hashes, IP ni fechas individuales. Solo rangos UTC acotados/fijos; sin filtros arbitrarios. No se implementaron rutas o interfaz web.

| Consulta | Definición / denominador correcto |
| --- | --- |
| Instalaciones | Registros installation_registered aceptados únicos en la cobertura; no personas/todas las instalaciones históricas. No sumar campañas como únicos. |
| Actividad diaria/mensual | Instalaciones con al menos un evento aceptado en ese período UTC. No personas ni necesariamente tiempo activo. Mes no es suma de DAU. |
| Partidas iniciadas/completadas | Hechos recibidos únicos según política. Cobertura previa/sesiones sin conexión puede ser incompleta. |
| Tasa de finalización | **null por ahora**: completed/started del período no es una cohorte y puede superar 100% si los inicios no están cubiertos. Una cohorte real necesita otra fuente/proyección aprobada. |
| Tiempo efectivo | Suma DurationMs de intervalos válidos. Horas=ms/3600000; no tiempo de calendario/pausa. |
| Tiempo por bioma | Suma por los cinco biomas; total igual a suma. No es duración de partidas completadas. |
| Decisiones/estados | approve/reject y degraded/healthy emparejados; rechazar→healthy, aprobar→degraded. Porcentaje por bioma, si se publica: opción/(approve+reject), denominador cero→null. |
| Finales | good/medium/bad entre game_completed recibidos; proporción final/total finales, no personas ni todas las partidas iniciadas. |
| Series diarias/mensuales | Aditivos por fecha declarada UTC, sujetos a llegadas tardías. No dividir un intervalo dos veces al cruzar medianoche. |
| Promedios | Tiempo por sesión cerrada/partida completada: **null**, faltan watermark/completitud y asociación de intervalos. Media por intervalo, si se pide, usa type:playtime_interval y se etiqueta como tal. |

Current generalSummary suprime grupos pequeños y mantiene celdas sin soporte en null. Para liberar una celda detallada hacen falta soporte de contribuyentes, protección ante diferencias entre consultas y autorización. Cinco instalaciones globales no prueban cinco por bioma/final. No se promete un panel detallado con la información de soporte actualmente descartada. Mantener privacidad aunque un administrador esté autenticado.

## 11. Plan de migración, despliegue y reversión

| Etapa futura | Acciones/evidencia | Condición de detención |
| --- | --- | --- |
| 0. Decisión | Propietario aprueba cobertura, retención, semántica de métricas, privacidad, presupuesto y cuentas. | Falta S/E, significado de instalaciones o tratamiento del backlog. |
| 1. Implementación local | Nuevo perfil/identidad/época/cierre, expiraciones, fence/metadatos, presupuestos y verificador de rol; fixtures nuevos. | No convergen concerns/deadlines, contratos o denegaciones. No tocar F1/F2 legacy. |
| 2. Integridad/canal | Revisar diff/dependencias, nuevo candidato/manifiesto separado y referencia independiente; ensayos ocultos/cancelación sin secretos. | Árbol no sellado, canal no certificado o B00 no tratado. No pedir contraseña. |
| 3. Control Atlas manual | Propietario verifica nombres no existentes, crea identidades/roles nuevos restringidos y red; no modifica legacy. | Rol extra/no disponible, recurso ajeno, contraseña expuesta. |
| 4. Primera lectura | Autorización de una sesión acotada, activación manual del canal nuevo; TLS/SCRAM/identidad/permisos/schema. | Cualquier discrepancia: cerrar sin fallback, DDL ni reintento libre. |
| 5. Aprovisionamiento | Cuenta schema, nueva base exacta vacía, validadores/índices/semillas; registro de inventario. | Objetos preexistentes inesperados o migración no aprobada. |
| 6. Escritura sintética | Autorización independiente de volumen/IDs/limpieza/cierre, sin juegos reales. | ACK incierto sin conciliación, índices/counters incoherentes, acceso ajeno. |
| 7. Despliegue mínimo | Activación limitada con consentimiento y métricas de capacidad/cola; rotación controlada. | Fallos/saturación persistentes, identidad o integridad no verificables. |

No importar colas antiguas, 71 eventos B78 ni 2151 operaciones. No se recuperan marcas borradas desde los agregados: una migración debe declarar cobertura desde un corte o una nueva época. No backfill desde SQLite real. La prueba local B82 no se convierte automáticamente en una base de producción.

Reversión propuesta: deshabilitar nuevos envíos, preservar pendientes/recibos, cerrar conexiones y retener evidencia. Volver a un binario/configuración anterior solo si admite el mismo esquema/política. No volver a bounded-v1 sobre contadores que dependan de marcas de campaña ni borrar marcadores dejando el total abierto. Preferir nueva base/candidato en paralelo; cuentas anteriores permanecen hasta validar sustitución. Restauración de datos debe coordinar contadores, ledger, época, fences y claves en un mismo punto. No drop destructivo de producción como rollback automático.

Al final de una campaña verificar cierre y retirar privilegios de escritura; una campaña nueva requiere otra aprobación. El cierre no autoriza borrar progreso ni pendientes locales. Backups también forman parte de retención y deben tener una política aprobada.

## 12. Checklist verificable para una fase Atlas autorizada

Todos los negativos de datos se ejecutarán en namespaces sintéticos dedicados; nunca contra históricos de usuario o colecciones legacy. Primero comprobar privilegios efectivos; una prueba destructiva negativa no se justifica por esperar denegación.

| Caso | Resultado exigido / evidencia |
| --- | --- |
| Password/usuario incorrectos, SCRAM distinto | Fallo sanitizado, sin fallback ni bucle; cierre confirmado. No compartir secretos en chat. |
| TLS/host/base distintos | Rechazo antes de datos; cadena y hostname normales. URI/variables no redirigen. |
| Usuario insuficiente o con extras | No abrir HTTP; comparar unión exacta por recurso, incluidos roles heredados. |
| Colección/base ajena | Código rechaza namespace; rol sin acción sobre un recurso ficticio no autorizado, con autorización específica. No consultar two_sides_db para «probar». |
| Permisos de esquema desde ingesta | Ausencia de DDL acreditada; cualquier negativo ejecutable, solo en objeto desechable y con limpieza aprobada. |
| Panel con token de instalación | 401/403 en servicio de panel, sin respuesta agregada. FIND de ingesta sobre counters en DB es permitido por diseño, no un test que deba fallar. |
| Panel lee ledger | Denegación de rol; API nunca acepta filtros de instalación/juego/sesión ni devuelve tags/secretos. |
| Eventos/PII/snapshot inválidos | Rechazo Zod/tamaño/contrato, cero contribuciones; no persistencia de payload original. |
| Duplicado exacto/ID contradictorio/hecho nuevo con ID diferente | Recibos coherentes, un único incremento o conflicto explícito; nueva partida legítima aceptada. |
| TTL y fronteras S/E/R/F/L | Marca conserva unicidad durante admisión; cerrado no se reabre con fecha/ID nuevos. Borrado después de cierre sin redoblar. Probar reloj y colisiones de cierre. |
| Llegada offline/recepción tardía | Sin reescritura; expiración propuesta cubre última admisión; error permanente conserva evidencia local. |
| Timeout/fallo/commit incierto | Sin ACK inventado; conciliación por hash/revisión; distinguir inyección de aplicación de fallo real del servidor. |
| HTTP perdido/reinicio | Mismos IDs/bytes, recibo persistido, no incremento adicional; sin exigir reinicios del clúster no autorizados. |
| 3/4/8 escritores y backlog pequeño | Medir códigos reales, agotamientos y recuperación separados, p50/p95, throughput sostenido, carga de lecturas e índices. No aumentar retries para ocultar capacidad. |
| Rutas legacy/proxy/rate limit | Ausencia de /api/v2/sync y recuperación de partidas; cabeceras de origen confiables, sin spoof/NAT colapsado. |
| Cierre/custodia | Sin listeners propios, secretos persistidos, bases sintéticas sobrantes o cuenta temporal innecesaria; limpieza por IDs/base propios verificados. |

Cada ejecución futura necesita límites pequeños aprobados, runId y datos nuevos; recibos/identidad/destino/topología se acreditan por separado. No se declara validada persistencia Atlas por Compass, por un login correcto o por esta lista.

## 13. Pruebas ejecutadas B83, aislamiento e integridad

No hubo cambios en transacciones/deduplicación/retención del código. Se ejecutó solo la selección pertinente:

- **222 pruebas estadísticas offline PASS**, ocho archivos B79–B82, guardia B80 precargada y envDir:false. Dobles, fixtures de archivos y Express solo loopback; ningún Mongo real, Docker/reinicio o Atlas.
- **55 comprobaciones del modelo de planificación PASS**: fronteras algebraicas de campaña/expiración, serialización BSON ficticia y sensibilidad/cálculo de escenarios. **No implementan ni validan en el backend la política propuesta**, ni sustituyen pruebas reales de RBAC/TTL/época.
- No se repitieron 17 casos/reinicios, .NET, Godot ni benchmarks reales: no cambió código que los afecte. La evidencia B82 permanece como referencia, no resultados nuevos.

Evidencia en `local-persistence/.work/b83/`: planning-model.mjs, planning-model.log, planning-results.json, statistics-regressions.log, v5-verification.json e inventario. Solo artefactos ficticios y hashes de código/manifest, no de archivos personales ni bases.

No se accedió a PlayerData real ni su contenido/metadatos/existencia/listados/hashes; no SQLite histórica, 71 eventos o 2151 operaciones, .env, credenciales, claves privadas o directorios de canales reales. Se revisó documentación/fuentes, no almacenes personales. Las pruebas instrumentadas rechazan rutas protegidas antes de E/S y red externa; esa guardia no certifica seguridad contra software hostil. Los precedentes B79/B81.1 permanecen documentados.

v5 conserva la referencia aprobada: SHA-256 **2A4956E951217DFF2501D3FFBD35C9024554166E9126AD0134D8FB58C77AD726**, treeDigest **1f3f507348a479d88362767e9e548200003d646ad8930f54cbfc9efc6a9f8c28**. Debe rechazar los 13 añadidos estadísticos ya registrados en B82; no se activa/regenera una referencia para ocultarlos. La verificación oficial de esta fase se conserva en v5-verification.json.

No se modificaron fuentes productivos, dependencias, perfiles, cuotas, manifiestos, ACL, propietarios, Godot, B75/B78, Caddy o datos. Ningún usuario/rol real se creó/modificó; no se solicitaron secretos, hizo commit/push ni publicó panel. El contenedor del propietario no se consultó, reinició o detuvo en B83; su último estado acreditado sigue siendo el cierre B82.

## 14. Decisiones del propietario y condiciones de siguiente fase

Pendientes explícitos:

1. ¿Métrica única por campaña/cobertura, o total único de vida? Aceptar limitaciones o financiar continuidad de marcas; no son intercambiables.
2. Fechas S/E, conservación de R/F, publicación y retención de agregados/backups; consentimiento y revisión de pendientes/fact_conflict al cierre. Nada productivo aprobado todavía.
3. Base/cuentas/roles nuevos y estrategia de época/cierre/fence; no reutilizar legacy ni el esquema experimental.
4. Identidad técnica de instalación y administrador, emisión/renovación/revocación, binding de época, custodia de claves y canal/servicio bajo B00.
5. Volumen I/A/s/m/f/g/T, concurrencia/backlog y objetivos aceptables de latencia/agotamiento; margen, tier/presupuesto y alarmas de gasto/capacidad.
6. Perfil HTTPS, proxy confiable, verificador de integridad, nuevo sellado/contraste independiente y autorizaciones separadas de primera lectura, DDL y escritura sintética.

**B83 queda preparada documentalmente, no Atlas listo.** B84 recomendada: ratificar esas decisiones y, con autorización acotada, implementar/probar localmente el perfil/época/roles/deadlines elegidos antes de pedir una conexión real. Persisten B00, identidad/canal no certificados, política productiva no aplicada, capacidad y privacidad de publicación. No se inicia B84 automáticamente.
