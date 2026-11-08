# B82 — Unicidad, retención estadística y preparación de Atlas

Fecha: 4 de noviembre de 2026, Guatemala.

**Resultado: completada en el ámbito experimental autorizado.** Se implementó una política híbrida separada, probada contra MongoDB 8.0.34: la marca semántica sobrevive al borrado de registros temporales y evita repetir el incremento dentro de la ejecución sintética. **No se decidió la retención del producto ni se declara Atlas listo.** B00 pendiente, v5 preservado/sin activar, envío remoto apagado y B83 no iniciada.

## 1. Estado recibido, autorizaciones e incidencia previa

Se revisaron B79/B80/B81/B81.1 y el código real: contrato statistics-only-v1, validadores, proyector, admisión temporal, recibos, unicidad, esquema, índices, transacciones, perfiles, arneses, concurrencia y fuentes de las suites .NET.

B81.1 aportó 17 casos reales aprobados, dos pruebas adicionales TTL, 204 pruebas estadísticas y 188 regresiones backend. Había corregido la contención con pausas aleatorias acotadas sin aumentar los tres intentos. UnknownTransactionCommitResult seguía simulado. **Se conserva la incidencia B81.1: el hash de lectura de la SQLite histórica violó su aislamiento. No se borra ni justifica como centinela. B82 no repitió ese acceso, existencia, metadatos o hash.**

El propietario autorizó expresamente durante B82:

- Probar el híbrido **solo en bases sintéticas B82**: recibos/actividad/cuotas mantienen sus ventanas; las marcas semánticas duran toda la ejecución y se eliminan junto con su base al cerrar. La política del producto queda pendiente.
- Hasta **tres reinicios limpios**, uno por repetición de los 17 casos, del contenedor identificado; sin detenerlo, eliminarlo ni recrearlo. Se usaron exactamente esos tres.

La primera consulta Docker dentro de la sandbox devolvió permiso denegado. Se repitió la inspección de lectura con la ejecución autorizada fuera de la sandbox; no se cambiaron ACL, permisos de Docker ni propietarios.

## 2. Alternativas evaluadas y decisión limitada

| Alternativa | Garantía viable | Coste / límite | Evaluación |
| --- | --- | --- | --- |
| A. Marcas semánticas duraderas | Un hecho por clave mientras se mantengan marca, época HMAC y contadores coherentes | Crecimiento por hechos únicos; seudónimos vinculables; eliminación/rotación/restauración requieren política | Puede proteger instalaciones/partidas/decisiones; no debe convertirse silenciosamente en retención perpetua. |
| B. Ventana de aceptación | Reintentos del mismo evento dentro de una admisión/retención coordinadas | Hechos legítimos demasiado antiguos se rechazan explícitamente y disminuye cobertura | **Por sí sola no resuelve el caso B81.1:** otro EventId y fecha nueva puede representar el mismo hecho. Haría falta un ancla de hecho verificable o métricas de cobertura acotada. |
| C. Híbrido por tipo | Recibos temporales + marcas de los hechos seleccionados, con intervalos/sesiones limitados por contrato | Combina costes; no vuelve anónimos los HMAC ni autentica la veracidad del cliente | **Seleccionado únicamente para la prueba autorizada.** No modifica la elección predeterminada ni aprueba retención del producto. |

No se eligió un TTL numérico nuevo ni una fecha lejana ficticia. En el experimento, la marca carece de expiración temporal; su límite es el cierre y eliminación de la **base completa de esa ejecución**, incluidos sus contadores. No se borra una marca conservando sus totales y pretendiendo que continúe la garantía. La configuración no incluye una ruta para desplegar esta política en Atlas.

## 3. Política implementada y garantías exactas

Nueva selección explícita: `b82-run-hybrid-v1`, esquema `statistics-mongo-b82-run-v1`. El valor predeterminado permanece **bounded-v1**, con el esquema B81 intacto y sus cuatro TTL. El repositorio exige que su política coincida con la del adaptador; el adaptador verifica catálogo, índices, validadores, semilla/época y política. Un consumidor antiguo rechaza el esquema híbrido, sin convertirlo ni migrarlo.

Hechos protegidos por marcas del experimento:

| Tipo | Clave semántica HMAC existente, reutilizada |
| --- | --- |
| installation_registered | Instalación + tipo; no es una persona única. |
| game_started / game_completed | Instalación + tipo + GameId. Son hechos separados. |
| biome_completed / environmental_decision | Instalación + tipo + GameId + BiomeId. Una nueva partida no colisiona con una anterior. |

Solo se guarda `{_id: HMAC, kind: 'b82-run-semantic-v1'}`. No contiene EventId, instalación, sesión, GameId, decisión, fecha o payload en claro. La clave HMAC estable sigue siendo seudónima, no anonimato.

Garantías y límites:

- **Evento exacto:** mientras siga siendo admisible y exista su recibo, mismos bytes/hash se deduplican. Otro contenido con la misma clave de evento produce conflicto; no se sobrescribe.
- **Hecho semántico:** otro EventId del mismo hecho produce `fact_conflict` y no incrementa, aunque hayan caducado sus registros temporales. La garantía dura mientras exista la marca en esa base, con la misma época HMAC y un estado coherente.
- **Nueva instalación/partida legítima:** una clave semántica diferente se acepta. Renovar un token de la misma instalación no permite repetir un hecho; un token de otra instalación no puede enviar sus eventos.
- **Fuera de admisión:** se conserva `event_expired`, sin borrar el pendiente local ni ampliar silenciosamente la ventana.
- **Sesiones e intervalos:** siguen protegidos por EventId, validación, cuota y ventana. No se añaden marcas duraderas por cada intervalo ni se promete detectar un cliente que cambie IDs/fechas y vuelva a declarar tiempo o sesiones. No se implementó detección de solapamientos ni expedientes navegables.
- No hay garantía de unicidad entre instalaciones diferentes que pertenezcan a una misma persona, tras pérdida de la época/clave o tras una restauración incoherente. No se promete exactamente una entrega HTTP.

`fact_conflict` conserva el contrato B79: es un resultado explícito, no un recibo aceptado inventado. La Outbox conserva los fallos permanentes para revisión y puede detener FIFO; B82 no los elimina ni añade una nueva UX de recuperación. Ese comportamiento debe contemplarse en la decisión de producto.

## 4. Auditoría de las cuatro colecciones TTL originales

Todos los índices temporales originales son `expiry_v1`, `{expiresAt:1}`, `expireAfterSeconds:0`, con BSON Date. Los totales y metadatos no llevan TTL.

| Colección | Datos mínimos / propósito | Retención original y relación con invariantes | Riesgo al caducar y tratamiento B82 |
| --- | --- | --- | --- |
| stats_v1_receipts | HMAC de evento, hash, revisión, expiresAt; reconstrucción del recibo | max(recepción, fecha del evento) + 90 días + 5 minutos. Recibo y contribuciones en la misma transacción | Los bytes originales ya no son admisibles al vencer. Se mantienen ventana/TTL. No protege por sí solo un hecho con otro ID/fecha. Seudónimo vinculable durante retención. |
| stats_v1_semantic | HMAC de hecho y expiresAt | Mismo vencimiento del evento que creó el hecho. No equivale a unicidad de por vida | Es el defecto confirmado: desaparece el bloqueo pero permanecen totales. En **bases híbridas nuevas**, no existe ese índice TTL ni expiresAt; hay marca hasta limpiar la base. El esquema original conserva su TTL. |
| stats_v1_active | HMAC de instalación/período, expiresAt; unicidad de actividad diaria/mensual | Fin del período UTC + 90 días + 5 minutos; los distintos no son aditivos | Tras vencer, los eventos de ese período ya no deben ser admisibles. Mantiene política. No es un historial personal ni un contador de personas. |
| stats_v1_budgets | HMAC de instalación/día de recepción, valor y expiresAt | Inicio del siguiente día UTC de recepción | Al cambiar el día cambia la clave. La cuota no se convierte en vitalicia ni se amplía. El borrado atrasado no autoriza doble consumo del mismo día. Mantiene TTL. |

El híbrido tiene **tres TTL**, no cuatro: solo en su nueva colección semantic se omite el índice temporal. No se hizo dropIndex/collMod ni cambio de TTL sobre colecciones existentes. Ambos esquemas conservan seis índices _id implícitos únicos.

TTL es un proceso de fondo; no se puede depender de borrado instantáneo. El adaptador comprueba expiración lógica y la admisión antes de deduplicación. [Contrato TTL oficial](https://www.mongodb.com/docs/manual/core/index-ttl/).

Clasificación conservada: replay exacto → duplicate; mismo ID/contenido distinto → event_conflict mientras haya recibo; otro ID/mismo hecho vigente → fact_conflict; nuevo hecho legítimo → accepted; tardío dentro de ventana → puede aceptarse; demasiado antiguo/incompatible → rechazo explícito. Reintentos offline indefinidos y borrado de todas las claves con deduplicación indefinida no están resueltos simultáneamente.

## 5. Cambios, transacciones y migración

Se reutilizó el proyector/validación B79/B80, sin otra implementación de reglas de negocio. Marcas, cuotas, recibos, revisión e incrementos siguen en una misma transacción. La marca no se elimina por expire ni por reutilización de una clave técnica caducada. Las lecturas compuestas conservan snapshot; commits usan majority+j:true.

Fuentes nuevos: `backend/src/modules/statistics/retention-policy.js`.

Archivos existentes modificados:

| Archivo | Cambio |
| --- | --- |
| src/modules/statistics/transactional-repository.js | Política explícita coincidente y selección de marca semántica retenida. Tres intentos/pausas B81.1 conservados. |
| src/modules/statistics/mongo-schema.js | Variante de esquema/validadores/semilla y tres TTL; esquema predeterminado sin cambio. |
| src/modules/statistics/mongo-transaction-adapter.js | Codificación/lectura de marca sin fecha, comprobación de política y no eliminación por expiración de esa marca. |
| tests/statistics/b81-driver-double.js | Permite seleccionar explícitamente la política en fixtures. |
| tests/statistics/b81-container-instance.js | Política en aprovisionamiento/adaptador; limpieza reforzada con ID/imagen/servidor, nombre generado y semilla schema/keyCheck. |
| tests/statistics/b81-node-worker.js | Política opcional explícita, contraste Docker en hijo y código de recibo público para comprobar fact_conflict. Comportamiento predeterminado B81 conservado. |

Nuevos tests/soporte: `b82-fixture.js`, `b82-retention.test.js`, `b82-retention.real.js`, `b82-concurrency.real.js` y `b82-real.config.js`. No se montó una ruta nueva, activó el transporte del juego ni cambió statistics-only-v1.

Respaldo de los **seis** originales antes de editar en `local-persistence/.work/b82/pre-B82/`; before.json, changes.json y new-files.json contienen inventario y hashes de **fuentes**. No se usaron partidas como centinelas.

### Migración del producto: diseñada, no ejecutada

No hay migración de datos existentes: cada prueba crea una base vacía y el aprovisionador rechaza bases ya pobladas. No se supone que un marcador borrado por TTL pueda reconstruirse desde un total agregado.

Antes de producción: inventariar épocas, cobertura y marcas aún disponibles; elegir política; crear un esquema versionado mediante herramienta administrativa aprobada; verificar contadores/ledgers y restauración coherente. Los hechos cuyas marcas ya se borraron no pueden recuperar retroactivamente unicidad demostrable sin otra evidencia autorizada. Opciones: declarar cobertura de unicidad desde un corte, separar una nueva época de contadores/marcas o adoptar una migración probada de evidencia disponible. Ninguna autoriza leer SQLite reales, importar 71/2151 eventos o ajustar totales a ciegas.

La rotación HMAC requiere coexistencia/migración de claves/épocas y un fence de despliegue; cambiar la clave sin ese procedimiento abre duplicados. La comprobación keyCheck falla cerrado ante una época incompatible, pero no implementa una rotación distribuida.

## 6. Entorno real y estabilidad

Motor identificado: **MongoDB 8.0.34**, WiredTiger, replica set `rsB811` de un nodo, host publicado **127.0.0.1:27028**, imagen mongo:8.0 con ImageID `sha256:6657bf2413fefc5be649390318f5b4cd7328e982722f8ce2ac6dfa6f0a42cb03`. Driver instalado 7.7.0. No hay TLS ni credenciales en este servidor local desechable; eso no certifica una configuración de producción.

Contenedor del propietario: `twosides-b811-mongo`, ID `f26949b7d54dda8fd6454f6ed6ca4d0965a9ca63a1a40818afdc1fc5b242bc31`, idéntico antes y después. No se creó otro contenedor ni se accedió a otros motores. Las bases generan el prefijo sintético aprobado `twosides_statistics_b81_<runId>`; se usa el arnés existente aunque la fase sea B82.

Antes de escribir se verifican Docker local, nombre/imagen/puertos/montajes, respuestas del servidor, primario y ausencia de bases ajenas. Solo se elimina la base generada por esa factoría tras comprobar su semilla y destino. No se detiene ni elimina el contenedor.

| Repetición de los 17 casos originales, sin reemplazos | Resultado | Duración | Reinicios autorizados |
| --- | --- | --- | --- |
| 1 | 17/17 PASS | 22,48 s | 1 limpio |
| 2 | 17/17 PASS | 18,80 s | 1 limpio |
| 3 | 17/17 PASS | 17,62 s | 1 limpio |

Son **51 ejecuciones de los mismos 17 casos**, no 51 casos nuevos. Cada caso tiene una base nueva; el arnés elimina solo la propia. Se conservaron casos de atomicidad, cien solicitudes, duplicados, escritores independientes, índice único, lectura concurrente, fallos precommit, reinicio Mongo, procesos Node sucesivos y recibo HTTP tras perder la respuesta. No se repitieron los dos experimentos TTL antiguos que esperaban la duplicación: se añadieron pruebas de la nueva política sin ocultar la evidencia anterior.

Los reinicios fueron exactamente los tres autorizados. No hubo reinicios adicionales en las pruebas nuevas. Estado final verificado: contenedor en ejecución con la misma ID; solo bases **admin, config y local**, sin bases sintéticas restantes. No se probó pérdida eléctrica/failover multinodo.

## 7. Evidencia real de la corrección TTL y recuperación

La selección B82 real aprobó **18/18**: cinco contratos B80 sin modificarlos sobre el esquema híbrido; cinco tipos semánticos más allá del horizonte anterior; prueba física TTL; índices y rechazo de política incorrecta; HTTP con renovación de identidad ficticia/nueva instalación; fallo precommit; reapertura en proceso Node independiente; tres matrices de concurrencia.

En la prueba física se registró una instalación con reloj ficticio de febrero y se dejó actuar el monitor TTL real. Aproximadamente **60,5 s** después:

| Documentos | Antes | Después |
| --- | --- | --- |
| counters | 3 | 3 |
| receipts | 1 | 0 |
| semantic | 1 | **1** |
| active | 2 | 0 |
| budgets | 1 | 0 |
| meta | 1 | 1 |

Mismos bytes antiguos → event_expired. Mismo hecho con EventId nuevo/fecha admisible → **fact_conflict; installations_registered se mantiene en 1**. Otra instalación legítima → accepted y total 2; su replay exacto → duplicate. La marca no tiene expiresAt ni datos claros del jugador. Todas esas bases se eliminaron al cerrar, limitando la retención a la prueba autorizada.

Se comprobaron además nuevas partidas sin conflictos falsos, eventos tardíos, instalación ajena rechazada por autenticación, no bypass al renovar token, rollback de marcador+recibo+contador y un nuevo proceso Node que recupera el marcador y devuelve fact_conflict sin incrementar.

UnknownTransactionCommitResult continúa probado **solo mediante simulación**. Las tres inyecciones nuevas fueron fallos de aplicación antes del commit sobre transacciones reales, no failpoints ni errores internos Mongo observados. El código no fabrica confirmaciones para una transacción no comprometida.

## 8. Concurrencia de 3, 4 y 8 escritores

Cada escritor usó un adaptador y cliente independientes (pool máximo 2), con la misma base sintética de su caso. Se enviaron: A) eventos distintos al mismo agregado, B) duplicados entre escritores, C) mezcla de nuevos/repetidos y F) un aborto transitorio inyectado antes del commit. El fence compartido y sus conflictos se conservaron, sin aumentar intentos ni ocultar agotamientos.

Se contaron los códigos **112 reales** mediante command monitoring; no se imprimieron cuerpos de comandos/payloads. El envoltorio midió intentos/clasificaciones y latencia de cada solicitud. Se registraron percentiles por escenario en real-results.json.

| Escritores | Solicitudes iniciales | Accepted inicial | Duplicate inicial | Agotadas iniciales | Intentos / reintentos iniciales | WriteConflict 112 reales | Recuperadas FIFO | Eventos finales / recibos |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 19 | 10 | 9 | 0 | 38 / 19 | 18 | 0 | 10 / 10 |
| 4 | 25 | 12 | 10 | **3** | 56 / 31 | 33 | 3 | 13 / 13 |
| 8 | 49 | 14 | 13 | **22** | 125 / 76 | 97 | 22 | 25 / 25 |

Cada fila incluye una inyección de aplicación adicional a esos conflictos del servidor. Totales: **148 conflictos 112 observados**, tres abortos de aplicación y **25 solicitudes inicialmente agotadas**, todas recuperadas. El máximo observado de latencia inicial fue 286,90 / 284,95 / 302,75 ms; máximo de recuperación 0 / 31,28 / 41,08 ms para 3/4/8. Son muestras locales pequeñas, no un SLA ni una prueba de carga sostenida.

En A con ocho escritores se agotaron 7/16; en C, 10/16. **Hay un límite de capacidad real que debe resolverse o gestionarse antes de prometer servicio a esa concurrencia.** No se interpreta que todos hayan pasado al primer intento.

La recuperación fue un paso de cliente separado: **un reenvío FIFO por solicitud agotada, con los mismos bytes e IDs**, sin competir con los demás escritores, manteniendo tres intentos dentro de cada llamada. No se multiplicó a escondidas el presupuesto de la solicitud inicial. Se recuperaron nuevos eventos y duplicados, no se generaron nuevos identificadores. La Outbox B79 también conserva y recupera sus pendientes en sus regresiones.

Totales finales: **48 eventos únicos, 48 recibos y 1.440.000 ms** entre las tres bases (10/13/25 eventos; 300.000/390.000/750.000 ms). Se verificaron hash/revisión de recibos e invariantes de contadores. No hubo pérdidas ni doble incremento. Los resultados completos por escenario incluyen accepted, duplicate, agotados, retries, commits, aborts, p50/p95/max y recuperación.

## 9. Regresiones y comandos

| Selección ejecutada | Resultado |
| --- | --- |
| Estadísticas ordinarias B79/B80/B81/B81.1/B82, 8 archivos | **222 PASS**: 204 previas + 18 nuevas offline B82. |
| JWT/F1/F2/ingesta/composición, selección offline revisada | **188 PASS**. |
| B77 Statistics.Checks, recompilada --no-restore | **129 PASS**. |
| B79 StatisticsTransport.Checks, recompilada --no-restore | **99 PASS**. |
| Mongo originales | **17/17 × 3**. |
| Mongo nuevos B82 | **18/18 PASS**. |

Son 638 comprobaciones/regresiones locales y 69 ejecuciones reales (51 repetidas + 18 nuevas). Si se cuenta solo una repetición de los 17 originales, son **673 casos/comprobaciones** en las selecciones, sin convertir las repeticiones en casos nuevos.

Las suites .NET cubren serialización, eventos, tiempo efectivo, Outbox, leases, recibos, idempotencia, reconexión, errores y conservación del guardado sintético. Se revisaron primero: B77 crea SyntheticSandbox y perfiles ficticios nuevos bajo TwoSidesTests/B77; B79 usa su sandbox y Express de loopback. **No se ejecutó ProductionStorage/B68 ni modos de guardado histórico/default.** No se recompiló/exportó otro juego: los fuentes Godot/C# no cambiaron.

Comandos desde backend (variables activadas solo en procesos de ensayo):

```text
node --import ./tests/statistics/b80-isolation-guard.js ./node_modules/vitest/vitest.mjs run --config tests/statistics/vitest.config.js
node --import ./tests/statistics/b80-isolation-guard.js ./node_modules/vitest/vitest.mjs run --config tests/statistics/b81-real.config.js tests/statistics/b81-mongo.real.js --reporter=verbose
node --import ./tests/statistics/b80-isolation-guard.js ./node_modules/vitest/vitest.mjs run --config tests/statistics/b82-real.config.js --reporter=verbose
```

La repetición original usó B81_OWNED_LOCAL_TESTS/B81_CONTAINER_TESTS y la autorización de reinicio; B82 nueva solo B82_REAL_TESTS=1 y **restartAuthorized=false**. No se deben repetir comandos con reinicio invocando la autorización ya consumida. Las tres autorizaciones se agotaron en sus tres usos.

Evidencia: `local-persistence/.work/b82/stability-1.log` a stability-3.log, b82-real.log, real-results.json, statistics-tests.log, backend-regressions.log, b77-statistics.log, b79-client.log y builds .NET. No hubo fallos ocultos ni ajustes de expectativas para pasar la contención; los resultados reintentables se mantienen en las métricas.

## 10. Propuesta Atlas — no creada ni conectada

Base propuesta separada: **two_sides_statistics**, pendiente de aprobación. Seis nombres stats_v1_* anteriores; su versión/validadores definitivos dependerán de la decisión de retención del producto. El esquema **b82-run-hybrid-v1 es experimental y no se despliega como producto**. Ningún perfil actual acepta esa base Atlas; harán falta composición/controles y manifiesto aprobados, sin convertir el arnés en lanzador productivo.

Cuentas técnicas propuestas nuevas, nunca heredadas del envío de partidas: `twosides_statistics_ingest_v1`, otra para migración y otra para lectura administrativa. Solo identificadores propuestos, no usuarios creados.

### Acciones mínimas del camino de ingesta auditado

| Recurso de la base propuesta | Acciones Mongo mínimas de ingesta |
| --- | --- |
| stats_v1_counters | find, insert, update |
| stats_v1_receipts | find, insert, **remove** |
| stats_v1_semantic con política híbrida aprobada posteriormente | find, insert |
| stats_v1_active | find, insert, **remove** |
| stats_v1_budgets | find, insert, update |
| stats_v1_meta | find, update; seed insert solo aprovisionamiento |

El remove de receipts/active es necesario **en el código actual** por el deleteOne de clave vencida antes de insertar, aunque normalmente borre cero filas. No corresponde concederlo en budgets/semantic para el camino del repositorio actual. La API genérica tx.put permite otros grupos, pero no se debe ampliar un rol por operaciones que el servicio no utiliza. Quitar remove requeriría cambiar y probar ese algoritmo; no se fingió que TTL lo vuelve innecesario.

Preflight normal: listCollections sobre esa base y listIndexes sobre sus colecciones, sin find sobre otras bases. Las transacciones usan los privilegios de sus operaciones; no justifican roles administrativos amplios. Atlas denomina las acciones equivalentes FIND/INSERT/UPDATE/REMOVE/LIST_COLLECTIONS/LIST_INDEXES. Verificar alcance y permisos efectivos con una cuenta de pruebas antes de aprobar el rol. [Acciones oficiales Atlas](https://www.mongodb.com/docs/atlas/reference/custom-role-actions/).

La cuenta de migración tiene, temporalmente, acciones de creación/índices/validadores y transformaciones **del plan aprobado**, limitadas a estos namespaces. No conceder dropDatabase ni dropCollection automáticamente; si se necesita una reversión destructiva requiere su autorización específica. createIndex, collMod, dropIndex y mantenimiento pertenecen a esa herramienta, nunca al proceso de ingesta.

El futuro panel tendrá **find solo en contadores y metadatos estrictamente necesarios**, sin acceso a receipts/semantic/active/budgets ni privilegios de escritura. Necesita una ruta interna de lectura que no requiera la clave HMAC de ingesta, autenticación/autorización administrativa y supresión de celdas; no se debe usar como panel la API diagnóstica que lee ledgers. No se implementó web ni endpoint administrativo.

### Seguridad, configuración y rotación propuestas

- SCRAM-SHA-256 explícito, authSource admin y TLS estricto con validación de cadena/nombre. Sin fallback a mecanismos menos fuertes ni certificados inválidos. Autenticación y cifrado de transporte son controles diferentes. [SCRAM oficial](https://www.mongodb.com/docs/v8.0/core/security-scram/).
- Host Atlas fijado y base exacta dedicada; nunca two_sides_db ni el usuario legacy. Allowlist de la IP de salida/entorno autorizado, sin 0.0.0.0/0. No entregar credenciales Mongo al cliente Godot.
- Variables **propuestas, no habilitadas**: STATISTICS_STORAGE (disabled por defecto), STATISTICS_ATLAS_HOST, STATISTICS_DATABASE, STATISTICS_SERVICE_USER, STATISTICS_RETENTION_POLICY, STATISTICS_KEY_EPOCH. Secretos por un gestor/canal de servicio protegido fuera de Git/OneDrive/logs/argumentos, por certificar con B00. No .env del videojuego ni URI con contraseña en logs.
- Rotación de contraseña de servicio por el propietario: segunda credencial/cuenta técnica mínima, validación controlada, cambio del servicio y comprobación de recibos, luego revocación de la anterior. No quitar la anterior antes de validar la nueva ni usar roles amplios para diagnosticar. Rotación HMAC es un procedimiento diferente, con unicidad entre épocas.
- Despliegue posterior: política y privacidad aprobadas → aprovisionamiento separado → pruebas de rol/denegaciones → nueva referencia de integridad y contraste independiente → conexión controlada de lectura → escritura sintética autorizada/recibos → campaña limitada. No importar colas históricas ni reutilizar identidades reales.
- Reversión operativa: detener nuevos envíos, preservar pendientes y evidencias, volver a configuración/cuenta anterior **solo si su esquema/política son compatibles**, verificar recibos y desactivar el despliegue fallido. No borrar marcadores dejando contadores acumulados ni reutilizar contraseñas comprometidas. La reversión de datos debe mantener un punto coherente de todos los componentes.

Los comandos administrativos del arnés local (Docker, serverStatus, getCmdLineOpts, listDatabases y restart) **no son privilegios necesarios de la futura ingesta Atlas**. No se propone copiarlos al rol de aplicación.

## 11. Aislamiento, integridad y cierre

No se accedió a archivos, existencia, listados, metadatos, hashes, copias ni SQLite de PlayerData real de luis2/TwoSidesTest/TwoSidesStatsTest, ni a la SQLite histórica, sus 2151 operaciones o los 71 eventos reales. No se usaron datos reales para fabricar muestras. No se leyó .env, solicitaron secretos, consultaron ACL/propietarios o cambiaron credenciales.

La guardia B80 se precargó antes de Vitest y en hijos Node: rechaza acceso a rutas protegidas antes de E/S, red/DNS externos y listeners públicos. Es instrumentación de pruebas, no una garantía frente a software hostil o bindings nativos. En .NET el aislamiento se basa en capacidades sintéticas y revisión de los puntos de E/S; no se presenta una guardia Node como protección de C#.

v5 conserva SHA-256 **2A4956E951217DFF2501D3FFBD35C9024554166E9126AD0134D8FB58C77AD726** y ancla **1f3f507348a479d88362767e9e548200003d646ad8930f54cbfc9efc6a9f8c28**. Verificador oficial: tree_differs esperado, **13 añadidos estadísticos**, 0 originales modificados, 0 eliminados y 0 problemas entre los 3172 originales. La incorporación nueva B82 es retention-policy.js; las modificaciones B82 afectan módulos añadidos después del manifiesto. No se regeneró/activó v5.

B75/B78 y fuentes del juego permanecen fuera de las escrituras de esta fase; no se exportó ni reemplazó paquete. Su preservación aquí se sustenta en no modificación; no se volvió a hashear ninguna partida como prueba de integridad. B00 no se ejecutó ni se declara resuelto. No hubo Atlas, roles/usuarios remotos, Caddy productivo, servicios públicos, commits o push.

Todas las bases de prueba fueron eliminadas mediante las factorías propietarias. Verificación final de lectura en container-final.json: la misma ID/imagen, Mongo 8.0.34 primario y **solo admin/config/local**. Los procesos HTTP/Node propios se cerraron. El listener 127.0.0.1:27028 permanece porque corresponde al contenedor del propietario, que sigue en ejecución; no se detuvo para fingir ausencia total de listeners.

## 12. Riesgos pendientes, reversión y B83

1. **Política de producto pendiente:** duración de marcas, vinculación, eliminación, cobertura y consentimiento. La corrección experimental no aprueba retención perpetua ni resuelve retroactivamente las marcas ya borradas.
2. **Capacidad:** el fence/revisión global concentra conflictos; ocho escritores agotaron muchas solicitudes. FIFO recuperó todas en esta muestra, pero no acredita throughput sostenido ni una latencia de producción. Leer todos los períodos para invariantes también requiere medición con historia extensa. Particionar sin perder invariantes necesita otra fase.
3. **Seguridad:** identidad estadística duradera, custodia/rotación HMAC y credenciales, publicación administrativa/anti-diferencias y B00 siguen pendientes. Un HMAC no sustituye una decisión de privacidad.
4. **Entorno:** un nodo Docker sin TLS/autenticación no equivale a Atlas ni a aislamiento frente a otros procesos/containers del equipo. No se probaron failover, corte eléctrico ni commit incierto real.
5. **Outbox:** eventos vencidos o fact_conflict son fallos explícitos conservados; la política de revisión del usuario debe evitar un bloqueo permanente de cobertura sin explicación.

Reversión de código propuesta, no ejecutada: con pruebas cerradas, verificar changes.json y restaurar exclusivamente los seis originales desde pre-B82; retirar las incorporaciones nuevas inventariadas. Las bases híbridas ya fueron limpiadas por sus factorías. No revertir índices/datos de bases ajenas ni borrar marcadores de una futura base productiva. Volver al código B81.1 restablece su riesgo TTL y no autoriza v5 ni Atlas.

**B83 recomendado:** decidir con el propietario la garantía/retención del producto y su cobertura, diseñar migración/épocas y lectura administrativa mínima; después abordar contención con pruebas e invariantes y preparar roles/seguridad/despliegue autorizados. No conectar Atlas como atajo. B82 se detiene aquí.
