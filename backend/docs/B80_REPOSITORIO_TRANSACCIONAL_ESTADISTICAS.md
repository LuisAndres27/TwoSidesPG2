# B80 — Repositorio transaccional de estadísticas

Fecha: 4 de noviembre de 2026, Guatemala. **Implementado y validado con almacenamiento desechable. Sin MongoDB Atlas, sin ejecución del videojuego y sin activación de v5.** B00 sigue pendiente. B81 no se inicia.

## 1. Estado recibido, alcance e inventario

B77 captura estadísticas y Outbox en SQLite; B78 fue validada manualmente por el propietario; B79 implementó transporte, validación, identidad ficticia y recibos. Se revisaron sus informes, statistics-only-v1, endpoint, esquemas Zod, cuotas, leases, retención, pruebas y arquitectura/requerimientos. La evidencia real B78 de 71 eventos y 752279 ms se conserva como información del propietario: **no se consultó su base ni se reutilizaron sus eventos o IDs**.

Se revisaron `atlas-policy.js`, `main/policy.js` y la configuración fuente de `main/profile.js`: existen perfiles anteriores con destinos y namespaces legacy, TLS, autenticación y `autoIndex:false/autoCreate:false`. B80 no los importa en su repositorio ni los activa. No se leyó .env ni se utilizaron credenciales. Los permisos del rol antiguo no se adoptan por defecto.

| B79 ya probado | B80 añade | Pendiente de un almacenamiento real |
| --- | --- | --- |
| Transporte/recibos y snapshot persistente de un proceso | Contrato de adaptador, proyección pura, repositorio independiente y puntos de fallo | Sesiones/transacciones del driver contra el despliegue elegido |
| Duplicados/reconexión del fixture | Conflictos/reintentos acotados y conciliación por ledger comprometido | Write concern/read concern, elección de primario y fallos de red reales |
| Persistencia tras cierre/reinicio normal | Muerte del proceso con transacción preparada y recuperación explícita | Pérdida eléctrica, discos dañados, failover y múltiples escritores reales |
| Agregados básicos | Invariantes, lecturas coherentes, métricas de sesión y supresión de celdas | Política administrativa completa, autorización y pruebas de privacidad de publicación |

No se presenta el snapshot de B79/B80 como una transacción MongoDB ni una prueba de rendimiento de Atlas.

## 2. Incidencia B79 y no repetición

Se conserva la trazabilidad: una suite B68 consultó existencia del directorio PlayerData real en B79, sin abrir archivos; fue una desviación y sus dos aserciones se retiraron explícitamente. B80 no borra esa incidencia ni la considera resuelta retroactivamente.

Medidas aplicadas antes de pruebas B80:

- Guardia Node `b80-isolation-guard.js`, precargada antes de Vitest y dentro de los procesos de pruebas. Rechaza PlayerData, .env, runtime-game histórico y ReconstructionTests antes de lectura, escritura, consultas de existencia/atributos o enumeración por las APIs fs instrumentadas, incluidas promesas y destinos de copias/renombrados.
- Bloqueo previo de DNS/conexiones externos y listeners TCP que no sean loopback. Los tests negativos usan nombres `.invalid` y una ruta centinela que no representa un usuario; el bloqueo sucede antes de E/S, no después de consultar un dato real.
- Revisión del código de los dos arneses .NET ejecutados. B77 crea exclusivamente sandboxes y raíces ficticias `TwoSidesTests/B77/<guid>/ProfileA|B/...`; B79 usa SyntheticSandbox y un directorio temporal exclusivo. No invocan la batería B68 ni su antiguo sondeo. Los nombres PlayerData usados dentro de esas raíces son **almacenes ficticios nuevos**, no los del usuario.
- Omisión explícita de ProductionStorage/B68, de GameSave por defecto y sus modos históricos, inspector sobre almacenes reales, pruebas de canales/ACL/B67/C.2 y batería global no revisada. Las regresiones ejecutadas se enumeran en la sección 12.

La guardia es instrumentación de pruebas, no una sandbox del sistema operativo contra código hostil o bindings nativos arbitrarios. En .NET el aislamiento se sustenta en capacidades sintéticas y revisión de los puntos de E/S, no en fingir un interceptor universal. No se enumeraron carpetas de usuarios, consultaron PlayerData reales ni sus ownership/hashes. Tampoco se certificó privacidad del equipo ni se modificaron ACL.

## 3. Arquitectura y componentes

```text
HTTP statistics-only-v1 / validador B79
              ↓ tupla validada y bytes canónicos originales
TransactionalStatisticsRepository
              ↓ revalidación + idempotencia dentro de la unidad atómica
projectStatistics (función pura)
              ↓ contribuciones acotadas
TransactionAdapter.runAtomic
  ledger + unicidad + presupuesto + contadores + revisión de commit
              ↓ publicación completa, nunca incremental
resultado confirmado / conciliación de commit incierto
              ↓ recibos B79 sin cambio de formato
```

Se reutilizan validadores, endpoint, identidad sintética, cabeceras/limitador, Outbox y cliente .NET. No se añadieron tipos de evento ni se tocaron decisiones/finales/guardados. La fachada `SyntheticStatisticsStore` conserva su API B79 y sus hooks de compatibilidad, delegando a los componentes nuevos. La lógica anterior se separó; no hay dos implementaciones paralelas de contabilización.

## 4. Contrato transaccional

`statistics-transaction-v1` exige:

| Operación | Semántica |
| --- | --- |
| `runAtomic(work,{signal})` | Ejecuta una unidad completa y devuelve `{committed:true, revision, result}` solamente tras publicación comprometida. |
| `tx.get/put/insertUnique` | Acceso a registros operativos dentro de esa transacción; unicidad no equivale por sí sola a atomicidad del conjunto. |
| `tx.increment(period,key,amount)` | Incremento positivo, entero seguro; sin reemplazo de un valor leído fuera de la transacción. |
| `tx.expire(now)` | Expiración lógica/mantenimiento transaccional del doble; Mongo podrá resolver expiración relevante y TTL sin recorrer todo el ledger por evento. |
| `lookupCommittedReceipt(key)` | Consulta puntual de un recibo comprometido, con revisión; no escanea todo el ledger para conciliar un commit. |
| `readCommitted()` | Una vista completa comprometida; puede ser anterior o posterior al escritor, nunca su mezcla. |
| `checkpoint` y `close` | Inyección determinista de fallos en pruebas y cierre ordenado. |

Las operaciones tx se esperan con await: el futuro adaptador puede utilizar I/O asíncrona real. No se exige simular una API Mongo síncrona. Las capacidades de transacción expiran al terminar; no pueden reutilizarse después del callback. Las lecturas y valores entrantes se clonan para impedir mutación externa de una versión comprometida o de un evento en espera.

La atomicidad es **por evento**, no por todo el lote: B79 permite recibos parciales. Cada accepted tiene su ledger y todas sus contribuciones comprometidas conjuntamente; otros eventos del mismo lote pueden seguir reintentables.

El núcleo no genera EventId/SessionId nuevos. Los UUID de archivos temporales solo identifican artefactos del adaptador, no eventos estadísticos.

## 5. Adaptador de referencia y garantías

`SnapshotTransactionAdapter` mantiene una versión comprometida y un borrador privado por transacción. Serializa escritores mediante cola en un proceso y un lock exclusivo del fixture. Valida invariantes, escribe un snapshot temporal, hace fsync, publica con rename y cambia la referencia comprometida. El recibo y los incrementos están en el mismo snapshot. No hay escrituras independientes que se den por exitosas por conveniencia.

`readCommitted` no lee el borrador. Se verificó mediante una barrera justo después de incrementos parciales y antes del recibo: el lector ve la versión anterior completa. Tras liberar y comprometer ve la nueva completa. Se devuelven copias, no referencias que permitan cambiar el contador desde el lector.

Directorios nuevos `twosides-b80-*` y los fixtures B79 nuevos compatibles `twosides-b79-*`, exclusivamente bajo el temporal local. Se rechazan rutas relativas, UNC/OneDrive, enlaces en la cadena, hardlinks del snapshot y snapshots de propósito/clave incorrectos. No se confía en la ubicación como certificación de privacidad. La identidad del snapshot se conserva como `b79-statistics-synthetic-v1`; B80 añade revisión operativa, aceptando snapshots ficticios anteriores sin revisión. No es una migración de SQLite ni de datos reales.

La recuperación de un proceso muerto es explícita: exige el PID exacto del hijo de prueba, lock coincidente y prueba de que ya no está activo. No se elimina un lock vivo ni de origen desconocido. Solo se descartan snapshots pending no publicados dentro del fixture. PID reutilizado/activo provoca rechazo. Este mecanismo **no es una recuperación productiva ni mata procesos ajenos**.

Supuestos de durabilidad: sistema de archivos local que conserva fsync+rename y muerte/reinicio de un proceso; un escritor por fixture. No se probó corte eléctrico ni se sincroniza el directorio como una base de datos distribuida. El archivo JSON copia el estado completo y no está diseñado para producción/cargas indefinidas. Las garantías reales de Mongo quedan pendientes.

## 6. Idempotencia, recibos y errores

El repositorio revalida los bytes canónicos originales dentro de la operación, con el reloj vigente. La propiedad `canonical` añadida a la tupla interna del validador no cambia el JSON público B79. Se conservan hash, IDs, nueve tipos y formatos UTC existentes.

La clave de evento es HMAC de instalación+EventId. Un recibo guarda hash, expiración y revisión de commit, sin payload. Repetir mismo contenido devuelve duplicate; contenido diferente devuelve event_conflict sin sobrescribir ni incrementar. Claves semánticas acotadas protegen instalación, inicio/final de partida, decisión y finalización de bioma. Se mantiene la semántica B79 de primera contribución confirmada y conflicto posterior, no se reconstruyen expedientes.

`TransactionConflict` solo permite repetir el callback después de aborto definido, con máximo tres intentos. Agotarlos deja fallo reintentable, no rechazo permanente. `CommitUncertain` **no** autoriza repetir incrementos a ciegas: se consulta el recibo comprometido y su hash/revisión. Solo una prueba positiva permite devolver duplicate; si no se puede leer, permanece incierto/reintentable. El retry posterior vuelve a usar el mismo evento.

Un fallo del hook histórico afterCommit de la fachada conserva el comportamiento B79: el HTTP puede perder su confirmación y devolver un recibo retryable; el siguiente envío reconstruye duplicate. No se cambian formatos, códigos ni política de errores públicos.

Cancelar antes de publicar aborta el borrador. Cancelar una respuesta o perderla después de publicar no revierte un hecho confirmado; se concilia. No se promete exactamente una ejecución HTTP ni se marca permanentemente inválido un fallo de almacenamiento.

## 7. Proyección, agregados y supuestos matemáticos

`projectStatistics` recibe una tupla validada y devuelve contribuciones deterministas sin E/S, IDs nuevos ni payload persistido. Eventos: installation_registered, session_started, session_ended, game_started, game_completed, biome_entered, biome_completed, environmental_decision y playtime_interval.

Contadores disponibles internamente:

- Instalaciones registradas y actividad distinta por día/mes. Actividad significa al menos un evento aceptado de esa instalación, no persona ni tiempo necesariamente activo.
- Sesiones iniciadas, cerradas normalmente e interrumpidas; el cierre no significa abandono de partida.
- Partidas iniciadas/completadas y finales good/medium/bad.
- Visitas, finalizaciones y tiempo por ocean/jungle/desert/forest/tundra.
- approve/reject y healthy/degraded por bioma, conservando reject→healthy y approve→degraded.
- Tiempo efectivo y tipos de evento, con períodos all/day UTC/month UTC de compatibilidad B79.

Invariantes automáticos: enteros seguros no negativos, tiempo=suma de biomas, completadas=suma de finales, decisiones/estados emparejados, events=suma de tipos, clasificación de sesiones no superior al total recibido y ausencia de incrementos duplicados. En el doble, que conserva **toda** su historia diaria, cada contador aditivo all coincide con la suma de días y cada mes con sus días. Se excluyen instalaciones activas de esas sumas: los distintos no son aditivos. Si después se recortase historia diaria, esa igualdad requeriría un nuevo alcance de cobertura; no se fuerza contra un total de otra ventana.

El doble conserva vistas mensuales B79 para compatibilidad. Propuesta Mongo: almacenar aditivos diarios y total acumulado, y derivar aditivos mensuales de los días; solo unicidad mensual necesita estado propio. Así no se duplica innecesariamente una tercera copia de cada contador. Toda lectura compuesta deberá usar una vista coherente.

Las duraciones van enteras al período UTC declarado, conforme a B79. Un intervalo que cruza medianoche no se divide ni se suma dos veces. B77 puede fechar por captura/proyección: no se interpreta como inicio civil exacto. Se admiten eventos tardíos hasta 90 días y hasta cinco minutos futuros; no se crean particiones por años arbitrarios del cliente. La cuota se aplica por **recepción** UTC; la tendencia por **evento declarado** UTC.

## 8. Promedios y privacidad administrativa

No se calcula tiempo total/partidas completadas como duración de partidas completas: incluye actividad de partidas incompletas. Tampoco tiempo total/sesiones cerradas: B79 no tiene una marca de completitud de intervalos por sesión y pueden llegar tarde. Ambos promedios devuelven null, no cero ficticio. Una tasa de cohorte no se obtiene dividiendo finales de hoy por inicios de hoy; esos eventos pueden pertenecer a cohortes distintas. Se conservan numeradores y denominadores y se declara qué falta.

Los contadores de tipos son la referencia para totales de sesión. Los snapshots ficticios antiguos B79 no conservaron clasificación closed/interrupted: no se puede reconstruir información descartada. Los nuevos contadores de estado cubren los eventos procesados por B80; esa cobertura debe indicarse en una adopción de datos anteriores. No hay importación de datos reales en esta fase.

`aggregates()` es una primitiva interna sin IDs/payloads; no se publica como endpoint. `generalSummary` solo acepta período exacto all/day/month, rechaza filtros de instalación/sesión/juego y suprime grupos con menos de cinco instalaciones de soporte. Cinco instalaciones globales **no prueban** cinco contribuyentes en cada bioma/final: por eso las celdas detalladas y ratios quedan en null hasta disponer de una política aprobada y prueba de soporte por celda. Solo se liberan contadores poblacionales que superan el umbral. No se añadió un panel ni una ruta administrativa.

Esto prepara protección conservadora de grupos pequeños; no equivale a anonimización ni privacidad diferencial. Antes de publicar hacen falta autorización administrativa, protección frente a diferencias entre consultas, ventanas fijas, demora de publicación y política de retención. HMAC y hashes siguen siendo potencialmente vinculables. No se almacenan IP, nombres, correos, contraseñas, rutas, hardware, SQLite ni historial individual de decisiones. Los tests verifican ausencia de IDs crudos y payloads en el snapshot.

## 9. Retención y crecimiento

Se conserva el contrato B79: admisión máxima 90 días y tolerancia futura cinco minutos. Recibos y claves semánticas permanecen al menos hasta cubrir toda admisión posible; distintos de período hasta su cierre+ventana+tolerancia; presupuestos hasta el siguiente día UTC. Mantenimiento purga registros operativos vencidos, no contadores generales.

Outbox local puede retener indefinidamente, pero no se promete admitir indefinidamente: un evento vencido recibe event_expired y permanece localmente para revisión. Esa acotación es lo que impide recontar tras purgar el ledger. No ampliar admisión ni cambiar claves HMAC sin extender/migrar primero deduplicación. La clave del fixture es pública y ficticia, no configuración de producción.

La política estadística de 6000 eventos nuevos/instalación/día y lotes de cinco permanece; duplicados no consumen nuevos eventos ni contadores. No se modificó la cuota legacy. Los días se generan únicamente dentro de la ventana temporal; la historia de contadores crece por calendario y métricas fijas, no por particiones arbitrarias del cliente. El ledger sí requiere presupuesto de capacidad por instalaciones×eventos×retención; no se presume que quepa en un Free cluster.

## 10. Concurrencia, fallos y reinicios verificados

| Punto/caso | Evidencia exigida y obtenida |
| --- | --- |
| Antes/después de consultar idempotencia | Error reintentable, contadores y recibos sin cambios; replay posterior una vez. |
| Antes/durante incrementos | El borrador parcial no es visible ni queda publicado. |
| Antes de recibo / antes de commit | Ningún contador se confirma sin su ledger coherente. |
| Snapshot fsync antes de rename | Al matar el hijo, recuperación conserva la versión antigua y descarta pending. |
| Después de commit | Recuperación encuentra todo el evento y el replay es duplicate. |
| Commit incierto + lectura rechazada | No se emite éxito; al recuperar lectura se deduplica sin incrementar. |
| Conflicto de transacción | Dos conflictos y un éxito, o tres fallos acotados sin efectos parciales. |
| Cancelación/timeout en barrera previa | Aborto definido y reintento posterior seguro. |
| Escritura/lectura rechazadas | Fallo controlado; sin confirmación inventada. Rechazo simulado, sin cambiar permisos reales. |
| Dos copias concurrentes | Una accepted y una duplicate, un incremento. |
| Cien eventos distintos | Cien recibos/efectos, sin incrementos perdidos. |
| Veinte lotes HTTP simultáneos | Cien intervalos; 3000000 ms, 600000 por bioma y cien entradas de deduplicación. |
| Lotes solapados | Cuatro únicos de seis enviados, cuatro accepted y dos duplicate. |
| Lectura durante escritura bloqueada | Vista anterior completa y después nueva completa. |
| Respuesta perdida/reinicio Node B79 | Cliente Outbox confirma el mismo lote al repetir, sin doble agregación. |

Se usan promesas-barrera, mensajes IPC y puntos de fallo, no sleeps para decidir quién gana. Tres pruebas terminan **procesos hijos propios** en after_increment, after_durable_write y after_commit. Recuperan con PID verificado, comprueban contadores+ledger y reenvían. La primera ejecución de una prueba de cuota usó por error dos instalaciones distintas; se corrigió únicamente el fixture para probar la cuota de la misma instalación, sin cambiar ni debilitar la política.

## 11. Propuesta MongoDB — no implementada ni conectada

Es una propuesta de mapeo del adaptador, no autorización de creación. Base a confirmar por el propietario; no inferida de .env ni adoptada automáticamente de main/integration. Namespaces nuevos y separados de operaciones/facts/fences legacy:

| Colección propuesta | Documento mínimo / índices |
| --- | --- |
| `stats_v1_counters` | `_id` por período/ámbito; contadores enumerados y revisión global de commit. `_id` único; índice por período/metric si se elige modelo por celda. |
| `stats_v1_receipts` | `_id`=tag de evento, payloadHash, commitRevision, expiresAt tipo Date. `_id` único + TTL independiente sobre expiresAt. Inmutable tras commit. |
| `stats_v1_semantic` | `_id`=tag de hecho único y expiresAt. `_id` único + TTL. Sin decisión individual en claro. |
| `stats_v1_active` | `_id`=tag instalación/período, período grueso y expiresAt. `_id` único + TTL; sin índice/búsqueda por instalación en claro. |
| `stats_v1_budgets` | `_id`=tag instalación/día de recepción, valor y expiresAt. `_id` único + TTL. |
| `stats_v1_meta` | Contrato/proyección, versión de esquema y época de clave HMAC; sin secretos. `_id` único. |

Los índices y validadores se crean por un procedimiento administrativo separado. Runtime con autoIndex/autoCreate deshabilitados, sin migraciones automáticas ni fallback a roles amplios. Crear índices únicos no sustituye la unidad que actualiza varios documentos. Preflight debe comprobar colecciones/índices exactos y privilegios efectivos sin ampliar el alcance a datos históricos.

Mapeo transaccional propuesto: abrir sesión, validar ámbito/época de clave, leer recibo indexado, comprobar unicidad/presupuesto, aplicar incrementos emparejados con $inc, insertar claves/recibo y comprometer. Revisión puede residir en el documento global de contadores; es un punto de contención que hay que medir, no una promesa de escalabilidad. El wrapper validará deltas antes del commit; no debe recorrer todo el ledger ni releer toda la historia por evento. Los métodos tx ya admiten Promises.

Para la unidad multidocumento se propone readConcern snapshot y writeConcern majority; lecturas administrativas compuestas también deben observar una vista consistente. Son garantías que habrá que probar en el despliegue, no deducir de los dobles. La documentación distingue atomicidad multidocumento y las condiciones de snapshot/majority. [MongoDB: transacciones](https://www.mongodb.com/docs/manual/core/transactions/), [driver Node.js](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/).

WriteConflict/TransientTransactionError requieren aborto/reintento acotado del callback. UnknownTransactionCommitResult requiere tratar el commit como incierto, conciliar recibo por clave/hash o reintentar el mismo commit según el driver; no repetir el negocio como si no hubiese ocurrido. Debe haber un único propietario de reintentos y presupuesto total, evitando multiplicar los tres intentos del núcleo por reintentos ilimitados del SDK. El conjunto de pruebas reutilizable se aplicará al futuro adaptador.

TTL no elimina exactamente al vencer: la admisión temporal y la lectura de expiración deben sostener la seguridad incluso con borrado retrasado. No borrar antes de que un retry deje de ser admisible ni depender de TTL como bloqueo de duplicados. [MongoDB: TTL](https://www.mongodb.com/docs/manual/core/index-ttl/).

Propuesta de mínimo privilegio, sobre estos nombres exactos:

- Aplicación: find/insert/update en counters y budgets; find/insert en receipts, semantic y active; find en meta. listIndexes únicamente si lo exige el verificador de arranque, sin createIndex/collMod/drop/createCollection. La limpieza mediante TTL debe quedar a cargo del servidor/proceso administrativo; no se concede delete indiscriminadamente.
- Lectura administrativa: find solo sobre contadores/metadata necesarios, pasando siempre por la política de grupos/roles del servicio; sin acceso a ledger de instalaciones, presupuestos o claves operativas.
- Aprovisionamiento: cuenta separada para creación de colecciones, validadores e índices/TTL y verificación. Acciones exactas a revisar frente al procedimiento elegido; no rol dbAdmin/readWrite global por comodidad.

Son roles propuestos, no usuarios creados ni permisos actuales comprobados. Atlas permite roles específicos y combina los privilegios asignados; un rol amplio adicional anularía la intención de mínimo privilegio. Administración exclusivamente por mecanismos Atlas autorizados y revisión de permisos efectivos. [Roles personalizados Atlas](https://www.mongodb.com/docs/atlas/security-add-mongodb-roles/), [acciones](https://www.mongodb.com/docs/atlas/reference/custom-role-actions/), [privilegios de updateOne](https://www.mongodb.com/docs/manual/reference/method/db.collection.updateone/).

Comprobar posteriormente topología/versión real, soporte de transacciones, journaling, límites, autenticación SCRAM-SHA-256/TLS, timeouts y elegibilidad de comandos del tier. No se afirma que un Free cluster esté validado: tiene restricciones de capacidad/operaciones que requieren dimensionamiento y pruebas propias. [Límites de Atlas Free](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/).

La época de HMAC requiere diseño de rotación sin carreras entre servidores: versiones coherentes, consultas a claves antiguas durante retención y fence de despliegue aprobado. Cambiar de clave por reinicio rompería unicidad. El doble rechaza una clave que no corresponda a su snapshot; eso no resuelve rotación distribuida.

## 12. Pruebas ejecutadas, omitidas y compilación

| Batería ejecutada | Resultado |
| --- | --- |
| Vitest estadísticas, 4 archivos | **104 PASS**: 51 de B79 + 53 nuevas B80. |
| Cliente B79/Express real de loopback/Outbox sintética | **99 comprobaciones PASS**. |
| Estadísticas B77, con dos perfiles ficticios nuevos | **129 PASS**. |
| JWT, F1/F2, ingesta/composición offline revisadas | **188 PASS** en seis archivos. |
| Total sin duplicar repeticiones | **520 comprobaciones aprobadas**. |
| Godot Debug y ExportRelease, --no-restore | Código 0, **0 errores**, 0 advertencias emitidas en builds incrementales. La referencia histórica de 63 advertencias no se considera eliminada por ello. |

El contrato reutilizable está en `transaction-contract-suite.js`: recibe una factoría desechable, prueba confirmación/dedup, cien contribuciones, aislamiento de lecturas y rechazo atómico de inconsistencias. La instrumentación de inspección técnica pertenece al harness, no a una API pública futura. Las pruebas específicas añaden proyección de nueve eventos, todos los biomas/opciones/finales, entradas rechazadas, datos tardíos, retención, privacidad, fallos, barreras y procesos independientes.

Comandos principales (desde backend, sin usar npm start):

```text
node --import ./tests/statistics/b80-isolation-guard.js ./node_modules/vitest/vitest.mjs run --config tests/statistics/vitest.config.js
node --import ./tests/statistics/b80-isolation-guard.js --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run --config vitest.config.js tests/jwt/jwt.test.js tests/sync/main-f1-optimization.test.js tests/sync/main-f2-commit-gate.test.js tests/sync/ingestion.test.js tests/sync/ingestion-scalability.test.js tests/sync/backend-composition.test.js
```

Arneses .NET: Statistics.Checks y StatisticsTransport.Checks con builds --no-restore y ejecutables de prueba. No se inició el juego. Se omitieron deliberadamente la batería completa no revisada, ProductionStorage/B68, suites B67/canales/ACL/Atlas y modos GameSave históricos/default. Los 721 casos de navegación de B79 no se repitieron: B80 no modifica Godot/C#/SQLite y el contrato aplicable queda cubierto por B77+B79 y las compilaciones. No se cuentan como aprobados en B80 casos no ejecutados.

Evidencia en `local-persistence/.work/b80/`: transaction-tests.log, b79-client.log, b77-statistics.log, backend-regressions.log, builds Godot, v5-verification.json e inventarios. Los logs contienen resultados/códigos, no payloads o tokens. Se mantuvieron fuentes de diagnóstico; no se ocultó la incidencia histórica B79.

## 13. Archivos, integridad y reversión

Nuevos fuentes: `projection.js`, `transaction-contract.js`, `snapshot-transaction-adapter.js`, `transactional-repository.js` bajo backend/src/modules/statistics. Nuevos tests: b80-isolation-guard.js, b80-fixture.js, transaction-contract-suite.js, transactions.test.js, crash-worker.js, crash-recovery.test.js y http-transaction.test.js. Nuevo documento: este informe.

Modificados: synthetic-store.js (fachada), contract.js (bytes canónicos en tupla interna), tests/statistics/vitest.config.js (guardia), tests/statistics/e2e-server.js (guardia del proceso hijo). Respaldo exacto de esos cuatro antes de editar: `.work/b80/pre-B80/`; hashes antes/después en changes.json. No se modificaron fuentes Godot/C#, paquete/dependencias, cuotas legacy, .env ni manifiestos.

v5 conserva SHA-256 `2A4956E951217DFF2501D3FFBD35C9024554166E9126AD0134D8FB58C77AD726`. Rechaza el árbol actual por **ocho añadidos estadísticos** (cuatro B79 y cuatro B80), con cero modificaciones/eliminaciones de los 3172 archivos protegidos originales y cero problemas de enlaces. No se generó ni activó una referencia nueva. El backend principal sigue bloqueado para este árbol.

B75 y B78: verificación de **204 archivos por paquete** y ZIP intactos. SHA-256 B75: `CF55AB6EDF0FE574ACFFCB0B1CCEF121F6FD4727864927770DC8423FAA709257`; B78: `078090EE18847F59333DC8B8DE954549265745B80ABC6271946F7DA730A03AAC`. No se exportó ni reemplazó ninguno.

Reversión propuesta, no ejecutada: con servicios cerrados, verificar el respaldo y restaurar los cuatro archivos modificados; retirar únicamente los archivos nuevos inventariados de B80. No borrar fixtures ajenos, bases, ownership ni datos históricos. Eso vuelve al estado B79, que todavía tiene sus cuatro módulos fuera de v5; **no autoriza activar v5**. No hay migración de jugador que revertir.

## 14. Riesgos pendientes y B81

El modelo sigue limitado a un proceso escritor y al sistema de archivos del doble. No prueba failover Mongo, transacciones reales, corte eléctrico, rotación distribuida, throughput del tier ni seguridad completa de publicación. Las métricas de cohorte/medias de partidas o sesiones completas no pueden inferirse correctamente del contrato actual; no se inventaron. Las celdas finas permanecen suprimidas sin prueba de soporte. La provisión/revocación duradera, consentimiento, política de publicación, HMAC, nuevo manifiesto y B00 permanecen pendientes.

**B81 recomendado:** implementar el adaptador Mongo específico con dobles del driver y aplicar el contrato reutilizable, comprobar índices/roles/conciliación/retención y dimensionar capacidad. Mantener separado el aprovisionamiento administrativo. Una campaña real, usuario Atlas, creación de colecciones o nuevo manifiesto requiere otra autorización explícita; B80 no los autoriza ni los inicia.

**Resultado final: repositorio transaccional de estadísticas implementado y verificado en el alcance del doble; Atlas desconectado, envío real desactivado y datos reales fuera del alcance.**
