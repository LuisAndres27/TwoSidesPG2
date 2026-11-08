# B05.5 — Corrección de escalabilidad del motor de ingesta MongoDB

Continúa `B05_5_ATLAS_LAUNCH_PREPARATION_RESULT.md`.

**Alcance y honestidad de las mediciones:** todo se probó con el **doble de MongoDB** (repositorios reales + pila HTTP real). Las cuentas de lecturas/escrituras/upserts son **exactas para el doble** y demuestran qué documentos pide y escribe el código; **no miden latencia, rendimiento ni costo en Atlas**, que sigue sin conectarse. No se usó ninguna contraseña, no se leyó `backend/.env`, no se ejecutó C.2 ni F.2, no se tocó Godot, SQLite real, ACL, propietarios ni C2Runtime, y no se cambió ningún esquema remoto. B00 continúa pendiente.

## 1. Causa del problema (diagnóstico)

El motor (`IngestionEngine`) fue escrito sobre un **estado completo en memoria** (`{operations[], facts[]}`) y el adaptador Mongo lo emulaba: en **cada operación** (cada operación de un lote es su propia transacción):

| # | Hallazgo | Dónde |
|---|---|---|
| 1 | `find({})` sin filtro de **operaciones y hechos de todos los jugadores**, con `limit(maxRecords+1)` | `readState()` |
| 2 | Límite **global** de 1 000 registros: si el almacén lo superaba, **toda** lectura fallaba (`unavailable`) y la cuota 429 se aplicaba al total, no al jugador | `readState()` y `acceptOperation` (`operations.length>=maxRecords`) |
| 3 | Revalidación completa de cada registro almacenado (`validateOperation` + referencias cruzadas) en cada transacción | `load()` |
| 4 | **Reescritura de todo el estado** por operación: un `updateOne(upsert, $setOnInsert)` por **cada** hecho y operación existentes (no-ops disfrazados de escrituras) | `writeState()` |
| 5 | Un documento de **fence global** `ingestion-v1` con `$inc` en toda transacción de escritura: dos jugadores distintos conflictúan (WriteConflict → reintentos) | `transaction()` |
| 6 | Guarda durable de propietario (`identityRepository.coordinate`): **ya es por propietario** (revisión de `ownerGuards/<cuenta>`), no depende del historial; se conserva | `coordinate()/touch()` |

**Qué necesita realmente cada operación** (verificado leyendo `acceptOperation`/`validateRelations`): todo lo que consulta pertenece al **propietario que llama**: la operación por clave (`<cuenta>:<operationId>`), sus padres (mismas claves), el hecho por clave (`<ámbito>|<sourceKey>`), los hechos del propio ámbito para las reglas de relación, y la cuenta de operaciones propias para la cuota. Nada requiere datos de otro jugador. Lo único "más amplio" era el fence global, que no aporta nada que la guarda del propietario no haga ya.

## 2. Corrección mínima aplicada

1. **Lecturas acotadas al propietario** (`readScoped`): operación + padres por `_id`; hecho de la operación y de los padres por `_id`; para un hecho nuevo, los hechos del propio ámbito (para `game.report`, solo los reportes de **ese** `gameId`); para un alias de un hecho ya guardado, la primera operación de ese hecho y sus padres; la cuota con `countDocuments` del propietario solo si se va a guardar una operación nueva. Todas las consultas están ancladas a `technicalAccountId`, `scope` o `_id` (prueba: ninguna consulta sin filtro; ningún documento ajeno devuelto).
2. **Escritura de lo mínimo** (`writeDelta`): como máximo **un hecho nuevo y una operación nueva** (`$setOnInsert`). Cero reescrituras de registros sin cambios.
3. **Integridad por registro** (`check(…,{partial})`): cada documento leído se valida igual que antes (verificación de documento Mongo, `validateOperation` del registro, hecho canónico, receipt); las referencias cruzadas de todo el almacén ya no se pueden ni deben exigir sobre un subconjunto.
4. **Cuota**: el 1 000 **no se eliminó**: pasó de ser global a ser **por propietario** (`maxRecords`), y se añadió una válvula global **separada y mayor** (`maxTotalRecords`, 50 000, `estimatedDocumentCount` fuera de la transacción). Sigue devolviendo 429 reintentable.
5. **Fence por propietario solo en el perfil integration** (`fenceMode:'owner'`): lectura (sin conflicto) del documento semilla `ingestion-v1` + `$inc` upsert en `ingestion-v1:<cuenta>`. **El modo por defecto sigue siendo `'global'`: comportamiento idéntico al de C.2** (las 44 pruebas de C.2 que dependen del fence y de la limpieza exacta de 16 documentos pasan sin tocarlas).
6. **No cambiaron**: contratos HTTP, `operationId`, formato de recibos, Outbox SQLite, Godot, índices existentes, la guarda/revocación durable, la idempotencia, el flujo de transacciones (`withTransaction`, snapshot, majority).

Se conserva el camino de **estado completo** (`store.load/commit`) para el arnés sintético con archivo y para `snapshot()` (diagnóstico/pruebas); comportamiento sin cambios.

## 3. Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/src/modules/sync/ingestion-engine.js` | Lógica común intacta; `check()` reutilizable (completo/parcial); camino con almacén **acotado** (`loadFor/commitDelta/receiptsFor/total`); cuota por propietario + válvula global. |
| `backend/src/modules/sync/mongo-ingestion-repository.js` | `readScoped`, `readReceipts`, `writeDelta`, verificación por documento, `fenceMode` (`global` por defecto / `owner`). `readState/writeState` quedan solo para diagnóstico. |
| `backend/src/integration/profile.js` | El perfil integration usa `fenceMode:'owner'`. |
| `backend/src/integration/schema-inventory.js` | Inventario: documentos de fence por propietario; plan de limpieza incluye solo esos fences (nunca la semilla). |
| `backend/scripts/run-backend-regression.js` | **Nuevo.** Corre la suite en las dos configuraciones que necesita (ver 7). |
| `backend/tests/sync/ingestion-scalability.test.js`, `tests/sync/support/scalability-scenarios.js` | **Nuevos.** 13 pruebas y escenarios. |
| `backend/tests/sync/support/mongo-double.js` | Doble ampliado: filtros `$in`/rutas con punto, `countDocuments`, `estimatedDocumentCount`, contadores/bitácora de lecturas y escrituras, upsert con `$inc`, **copia en escritura** (antes clonaba toda la base por transacción y agotaba memoria con ~1 000 registros: limitación del doble, no del código). |
| `backend/tests/sync/integration-profile.test.js`, `integration-launcher.test.js` | Ajustes: fence por propietario; plan de limpieza; el escaneo ignora `.work`. |

## 4. Consultas antes y después (por operación nueva de un jugador)

| Consulta | Antes | Después |
|---|---|---|
| Operaciones | `find({}).limit(1001)` | `find({_id:{$in:[op, …padres]}, technicalAccountId})` |
| Hechos | `find({}).limit(1001)` | `find({_id:factKey,scope})` + `find({_id:{$in:…},scope})` + (hecho nuevo) `find({scope})` / `find({scope,'record.type':'game.report','record.gameId'})` |
| Cuota | longitud del estado global | `countDocuments({technicalAccountId,scope})` + `estimatedDocumentCount()` |
| Escrituras | upsert de **todos** los hechos y **todas** las operaciones | 1 upsert de hecho (si es nuevo) + 1 upsert de operación |
| Fence | `$inc` en `ingestion-v1` (compartido) | owner: lee semilla + `$inc` en `ingestion-v1:<cuenta>` |

## 5. Mediciones con el doble (63 vectores C#)

**Un jugador, 63 operaciones en un lote** (63 transacciones):

| | Antes | Después |
|---|---|---|
| Documentos leídos (total) | 4 920 | 1 813 |
| …de operaciones / hechos | 1 953 / 1 953 | 40 / 696 |
| Escrituras `updateOne` (total) | 4 158 | 252 |
| …de operaciones / hechos | 2 016 / 2 016 | 63 / 63 |
| Upserts | 126 | 127 (126 + creación del fence propio) |
| **Reescrituras sin cambios** | **3 906** | **0** |

**Reenvío de las mismas 63 operaciones (todas duplicadas):** documentos leídos 8 763 → 1 094; operaciones y hechos escritos 0 → 0.
**Un duplicado (la última operación) con 63 de historial:** leídos 145 → 24 (operaciones 63 → 2, hechos 63 → 2).

**Una operación nueva de un jugador cuando OTROS ya acumulan historial** (0 / 126 / 378 operaciones ajenas):

| | Antes | Después |
|---|---|---|
| Documentos leídos | 22 / 274 / 778 | **23 / 23 / 23** |
| Escrituras | 4 / 256 / 760 | **4 / 4 / 4** |
| Reescrituras sin cambios | 0 / 252 / 756 | **0 / 0 / 0** |

**Más de 1 000 registros acumulados:** antes, el techo global de 1 000 registros hacía fallar toda lectura y, en el doble, el patrón de clonado agotó la memoria alrededor de ese tamaño (el proceso terminó por falta de memoria); después, **18 jugadores × 63 = 1 134 operaciones y hechos** se aceptan sin errores (≈ 12 s en total para las 13 pruebas) y un jugador número 19 sigue funcionando.

*Lo que queda y crece:* las lecturas de **hechos del propio ámbito** (696 en el caso de 63 operaciones ≈ 11 por operación) crecen con el historial **del propio jugador** (acotado por su cuota de 1 000). Lecturas de identidad (≈10 `identities` y ≈5 `identitySessions` por operación) y `verifyIndexes`/`hello` por transacción son constantes por petición y **no se tocaron**.

## 6. Pruebas

Nuevas (13, `ingestion-scalability.test.js`): SC01 costo constante frente al historial ajeno; SC02 > 1 000 registros entre varios jugadores; SC03 jugador con historial largo (duplicado = 2 documentos); SC04 lotes pequeños y repetidos (receipts idénticos, 0 upserts, documentos byte a byte iguales); SC05 propietarios simultáneos sin conflictos de escritura (y mismo propietario dos veces: una sola copia de cada operación); SC06 revocación antes de ingesta (0 consultas a operaciones/hechos, 0 escrituras, lo aceptado antes intacto) e ingesta antes de revocación; SC07 respuesta perdida + consulta de recibos (mismo recibo, consulta lee solo los ids pedidos); SC08 conflicto de `operationId` (409 `idempotency_conflict`, sin escrituras), ids por propietario, alias de hecho (+1 operación, 0 hechos); SC09 no se leen ni reescriben documentos ajenos o históricos; SC10 integridad por registro (un documento dañado de un jugador falla solo para él; daño no leído no interfiere); SC11 cuota por propietario y válvula global; SC12 `snapshot()` y validación de capacidad; SC13 sin consultas sin filtro y contratos HTTP intactos.

Regresión completa (`node scripts/run-backend-regression.js`): **602 + 9 aprobadas, 16 omitidas, 0 fallidas** (ingesta, autenticación, identidad, revocación durable, idempotencia, composición integration, lanzador, C.2). Legacy 39/39. 33 comprobaciones C# del cliente HTTP contra el Express offline (usa el camino de estado completo) siguen verdes.

Durante el trabajo hubo fallos que no eran del código: el cambio de fence compartido rompía pruebas de C.2 (se resolvió con `fenceMode` por defecto `global`, no tocándolas) y un cambio de entorno (`TEMP`) provocaba falsos positivos en un escaneo (ahora ignora `.work`).

## 7. `C2_FINAL_TEST_ROOT`: qué hay que saber (revisión)

- Tres pruebas (AC03, FR05, FR06) **exigen** la variable con una raíz desechable (por diseño). Sin ella fallan con "Disposable root required": **no es un defecto**.
- Pero **definirla globalmente** para toda la suite rompe otras (RX21–23, SU03/06/07/10/12, AR04, RC18–30…): las pruebas basadas en PowerShell/ACL del receptor C.2 **rechazan raíces arbitrarias** (`C2_RECEIVER_REJECTED:acl`) y usan su propia raíz por defecto bajo `%LOCALAPPDATA%` cuando la variable falta. Tampoco conviene redefinir `TEMP`.
- Por eso `scripts/run-backend-regression.js` ejecuta (1) todo salvo esos dos archivos **sin** la variable y (2) esos dos archivos con la variable apuntando a una carpeta nueva bajo `backend/.work/regression-root-<guid>`, que se elimina después (solo si es esa carpeta). Un fallo en cualquiera de las dos pasadas es un fallo real. No toca C2Runtime.

## 8. Garantías conservadas

Idempotencia por `operationId` (duplicado → recibo original; contenido distinto → 409); recibos confirmados sin cambios de formato; índices únicos (`owner_operation_unique`, `scope_source_unique`, etc.) sin tocar y verificados antes de cada transacción; transacciones MongoDB `snapshot/majority/j`; guarda durable de propietario y revocación (revocado ⇒ 401 antes de cualquier lectura de ingesta); aislamiento entre propietarios (403 por vínculo ajeno, nunca se leen documentos ajenos); recuperación ante respuesta perdida (recibo encontrado, reintento duplicado con el mismo recibo); comportamiento y pruebas de C.2 intactos (modo `global` por defecto); respuestas de cuota 429 reintentables.

## 9. Cambios de índices o esquema que harían falta (optimización posterior, **no aplicada**)

1. Hoy los hechos relacionados con una sesión se localizan leyendo **todos los hechos del propio ámbito**, porque `sessionId`/`animalRunId` viven dentro de `canonicalPayload` (cadena JSON). Para leer solo los de la sesión: campos de primer nivel `type`, `gameId`, `sessionId`, `animalRunId` en `integration_v2_facts` + índices compuestos `{scope,type,gameId}` y `{scope,sessionId}`. Requiere cambio de esquema remoto y migración → autorización y fase propias.
2. `record.factKey` (búsqueda del alias) usa el prefijo del índice `owner_operation_unique` y filtra dentro del propietario; un campo/índice `{technicalAccountId, factKey}` lo haría directo.
3. Cada operación sigue siendo una transacción; agrupar un lote en una sola transacción reduciría los viajes de ida y vuelta (rediseño mayor).
4. `verifyIndexes`/`hello` por transacción podrían cachearse por conexión.
5. Documentos `ingestion-v1:<cuenta>` crecen con el número de jugadores (uno por propietario) → incluidos en el inventario y en la limpieza.

## 10. Riesgos restantes

- **No medido en Atlas**: latencia, `countDocuments`/`estimatedDocumentCount`/`find $in` con Mongoose real y transacciones reales solo están razonados, no probados contra el clúster.
- Lecturas de hechos del propio jugador crecen con su historial (acotado por 1 000 operaciones por jugador, pero cuadrático en el peor caso por jugador).
- `estimatedDocumentCount` no es transaccional (válvula aproximada).
- Cambio de semántica documentado: el tope de 1 000 es ahora **por jugador**; la válvula global es de 50 000.
- Sigue sin existir ejecutor de limpieza, ni refresco de sesión/recuperación de credencial (etapas anteriores).
- Rotación de la contraseña de integración: **sin confirmar**.

## 11. Condiciones para conectar Atlas (ninguna cumplida por este trabajo)

1. Confirmar la rotación de la contraseña de `twosides_integration_test`.
2. Autorización expresa y acotada del propietario (ventana, alcance, límites) en un archivo fuera del repositorio.
3. Primera prueba real **sin** `-PrepareCollections` (inspección de solo lectura); crear el esquema solo con segunda autorización.
4. Lotes pequeños y pocos jugadores en la primera ejecución; medir en Atlas lecturas/escrituras reales antes de ampliar.
5. Decidir si se hace la optimización de la sección 9 antes de un uso sostenido.
6. Aprobar el procedimiento de limpieza y su ejecutor.

No se conectó Atlas. Me detengo antes de cualquier conexión remota.
