# B05.5 Etapa 12 — Bootstrap del esquema `main_v2` en `two_sides_db` (preparado, NO ejecutado)

Fecha: 2026-10-31. **Preparación terminada; no se conectó a MongoDB Atlas, no se escribió nada en `two_sides_db`, no se pidió ni usó contraseña, no se leyó `backend/.env`, no se emitió ninguna autorización, no se habilitó el perfil `main` ni se conectó Godot.** No se tocaron SQLite reales, ACL, propietarios, C2Runtime, C.2/F.2 ni el perfil `integration`. **B00 sigue pendiente.**

Punto de partida confirmado por la inspección real (hecha por el usuario): base `two_sides_db`, veredicto `bootstrap-required`, 7 colecciones históricas (`users`, `decisions`, `gameevents`, `gameprogresses`, `statisticevents`, `statisticsummaries`, `syncidentities`), 0 de las `main_v2_*`, `conflicts: []`, `writes: 0`, SCRAM-SHA-1 negociado con `DEFAULT`.

## 1. Inventario exacto que se creará (namespace `main_v2`)

Verificado contra los modelos Mongoose vivos (`main-readiness` MR01, `main-inspection` IN10).

| Colección | Índices únicos (más `_id_`) | Contenido inicial |
|---|---|---|
| `main_v2_operations` | `owner_operation_unique {technicalAccountId:1, operationId:1}` | vacía |
| `main_v2_facts` | `scope_source_unique {scope:1, sourceKey:1}` | vacía |
| `main_v2_fences` | — | `{_id:'ingestion-v1', revision:0}` (semilla) |
| `main_v2_identities` | `identity_registration_unique {registrationId:1}`, `identity_binding_unique {installationId:1, localPlayerId:1}` | vacía |
| `main_v2_ownerGuards` | — | vacía |
| `main_v2_identitySessions` | `identity_token_unique {tokenHash:1}` | vacía |
| `main_v2_revocations` | — | vacía |

7 colecciones, 5 índices, 1 documento. No se crea `main_v2_authorization` (modelo sin uso). Las 7 colecciones históricas no forman parte del inventario: están en una lista de protección y el código **no puede** nombrarlas en una escritura.

## 2. Operaciones previstas (13 pasos aditivos, en este orden)

1. `createCollection` ×7 (orden del inventario), con `writeConcern {w:'majority', j:true}`.
2. `createIndex` ×5 (`unique:true`, nombre y clave del inventario, mismo `writeConcern`).
3. `seedUpsert`: `updateOne({_id:'ingestion-v1'}, {$setOnInsert:{revision:0}}, {upsert:true})`. `$setOnInsert` no modifica una semilla que ya exista.

Solo se planifica lo que falta. No existe en el código ninguna operación de borrado, `drop`, renombrado, `collMod`, `$set`/`$unset`/`$inc`, inserciones masivas ni `syncIndexes`, ni registro de modelos Mongoose (BS12 lo comprueba sobre el fuente).

## 3. Cómo funciona (archivos nuevos; ningún archivo existente se modificó salvo una exportación en `inspection.js`)

| Archivo | Función |
|---|---|
| `src/main/bootstrap.js` | Herramienta de una sola ejecución: lectura → plan → escritura → verificación |
| `src/main/bootstrap-authorization.js` | Autorización propia (`kind: atlas-main-schema-bootstrap`) |
| `scripts/run-main-bootstrap.js` / `.ps1` | Entrada y lanzador PowerShell (entrada oculta, trama por stdin, entorno depurado, máscara UTF-16, BOM) |
| `scripts/new-main-bootstrap-authorization.js` | Genera la autorización fuera del repositorio (no ejecutado) |
| `tests/sync/main-bootstrap.test.js`, `tests/sync/support/bootstrap-double.js` | 12 pruebas y un doble **con estado** que registra lecturas y escrituras y rechaza cualquier forma no prevista |
| `src/main/inspection.js` | Solo se añadió `export const inspectionDiagnostic` (reutiliza el vocabulario de diagnóstico seguro) |

Flujo: 1) **Lectura**: la misma inspección de solo lectura de la etapa 10 (conector `DEFAULT`, TLS estricto, `authSource=admin`, identidad efectiva, `hello`, `listCollections`, `listIndexes`, recuentos estimados, una lectura de la semilla). 2) **Plan** derivado del informe; cualquier conflicto, índice incompatible/inesperado/ausente de `_id_`, semilla con revisión inválida, identidad sin los permisos o clúster sin primario escribible → **salida con cero escrituras**. 3) **Escritura** (solo `mode: apply`), paso a paso, anotando cada paso en el marcador local antes de seguir. 4) **Verificación**: se repite la inspección y debe dar `ready`; además se comparan nombres e índices de las colecciones históricas antes y después. Los conflictos no se reparan.

## 4. Autorización temporal y de un solo uso

Archivo JSON estricto, fuera del repositorio, sin contraseña, ≤ 60 min, con: `kind` propio, destino `two_sides_db`, usuario **solo** `twosides_backend` (el inspector, el de integración y cualquier otro se rechazan), `namespace: "main_v2"`, `mode` (`plan-only` o `apply`), la frase de confirmación `CREATE_MAIN_V2_SCHEMA_IN_TWO_SIDES_DB` y `passwordRotationConfirmed: true` (declaración del operador de que la contraseña fue rotada; **no** cierra B00). No sirve para inspección ni para integración. Un archivo no puede hacer plan y aplicación a la vez. Se consume (marcador `<executionId>.bootstrap.json`) en cuanto una ejecución llega a conectar, haya terminado bien o mal; una credencial malformada no la consume.

## 5. Permisos mínimos y verificación de identidad

`twosides_backend` con **exactamente un rol `readWrite` sobre `two_sides_db`** (sin roles ni recursos en otras bases) y, según `connectionStatus`, las acciones `find`, `listCollections`, `listIndexes`, `createCollection`, `createIndex`, `insert`, `update`. Si no, no se escribe nada. No se modifican usuarios ni permisos. Un rol más estrecho (solo `main_v2_*`) sería preferible a futuro, pero requiere cambiar las verificaciones.

## 6. Pruebas (todas con doble, sin red ni DNS)

| # | Cubre |
|---|---|
| BS01 | Plan-only desde el estado real (7 históricas, ninguna `main_v2`): 13 pasos exactos, cero escrituras |
| BS02 | Aplicación: 7 colecciones + 5 índices + semilla, en orden, con `writeConcern` mayoritario; verificación `ready`; históricas intactas; sin violaciones |
| BS03 | **Idempotencia**: segunda ejecución simulada sobre el estado terminado → plan vacío, 0 escrituras, estado idéntico byte a byte |
| BS04 | Estados parciales: solo se crea lo que falta; una semilla existente no se reescribe |
| BS05 | Conflictos (7 variantes de índice, vista, opciones de colección, semilla inválida) → rechazo con cero escrituras y sin reparación |
| BS06 | Las 7 históricas y cualquier otro nombre (incl. `main_v2_authorization`, `integration_v2_*`, `system.*`) son rechazados por la superficie de escritura; ninguna ejecución escribe en ellas |
| BS07 | Identidad/permisos/replica set verificados antes de escribir (11 variantes) |
| BS08 | Autorización: tipo, usuario, destino, namespace, modo, frase, rotación, ventana, un solo uso, argumentos |
| BS09 | **Fallo parcial**: lo creado se conserva, se registra en el marcador (pasos hechos, paso fallido, pendientes), nada se borra; una autorización nueva reanuda solo lo pendiente; clasificación de permisos (13), conflicto de índice (85/86) y otros |
| BS10 | Si una escritura no surte efecto, la verificación final falla (no se declara éxito) |
| BS11 | Fallos de conexión con código/etapa/categoría; sin escrituras; ningún secreto en salida, marcador o errores |
| BS12 | Independencia (sin Express, integración, `process.env`/`.env`, modelos) y superficie de escritura mínima; lanzador y generador |

Resultado: **12/12**; regresión completa `run-backend-regression.js` **683 + 9 aprobadas, 16 omitidas, 0 fallos**; legacy 39/39; el `.ps1` parsea sin errores. Son resultados del doble; no describen a Atlas.

## 7. Plan de recuperación ante fallos parciales (sin borrado automático)

Los pasos son aditivos e idempotentes: nunca hay que deshacer nada para reanudar. Ante un fallo la herramienta cierra, conserva todo lo creado y deja en el marcador `executed`, `failedStep` y `remaining` (la salida de error muestra `stepsExecuted`, `stepsRemaining`, `failedStep`).
1. Revisar el marcador y ejecutar una **inspección** nueva para ver el estado real.
2. Si el estado es `partial`, `indexes-incomplete` o `seed-missing`: emitir una autorización nueva y repetir; solo se planifica lo que falta.
3. Si es `conflict`: no se reanuda. Decisión humana: corregir manualmente (por ejemplo, tras revisar, eliminar a mano una colección `main_v2_*` creada vacía y mal definida). La herramienta no lo hace.
4. Nunca se tocan las colecciones históricas.

## 8. Precondiciones y comando manual propuesto (NO ejecutar todavía)

Precondiciones: contraseña de `twosides_backend` rotada y B00 aceptado o mitigado por escrito; inspección reciente con veredicto `bootstrap-required`; copia o instantánea de seguridad de `two_sides_db` decidida por el operador; ventana de mantenimiento sin otras escrituras de DDL.

```
# 1) Ensayo de solo lectura: calcula y muestra el plan, escribe 0 (consume una autorización)
node scripts\new-main-bootstrap-authorization.js "C:\Users\luis2\AppData\Local\TwoSidesMainBootstrap" plan-only --password-rotated
.\scripts\run-main-bootstrap.ps1 -Enable -Authorization "C:\Users\luis2\AppData\Local\TwoSidesMainBootstrap\main-bootstrap-authorization-<executionId>.json"

# 2) Revisar el plan (13 pasos esperados) y, solo entonces, aplicar con una autorización NUEVA
node scripts\new-main-bootstrap-authorization.js "C:\Users\luis2\AppData\Local\TwoSidesMainBootstrap" apply --password-rotated
.\scripts\run-main-bootstrap.ps1 -Enable -Authorization "C:\Users\luis2\AppData\Local\TwoSidesMainBootstrap\main-bootstrap-authorization-<otro-executionId>.json"
```
Ambos piden la contraseña con entrada oculta. Salida correcta: JSON `mainSchemaBootstrap: finished` con `preVerdict`, `postVerdict: ready`, `plan`, `executed`, `writes` e `historicalUnchanged: true`.

## 9. Riesgos pendientes

- **Nada medido en Atlas**: cómo responde el clúster real a `createCollection`/`createIndex` con `writeConcern` mayoritario y a un posible límite del plan de Atlas; la verificación final y el marcador lo detectarían.
- **Autenticación SCRAM-SHA-1** (más débil) mientras `twosides_backend` no tenga SHA-256; la herramienta lo informa (`scram.weaker`).
- **`readWrite` es más amplio que el trabajo** (incluye acciones destructivas); la garantía de no borrar está en el código, no en los privilegios.
- Creación no transaccional: un fallo intermedio deja un estado parcial (cubierto por el plan de recuperación, no por reversión).
- El `NamespaceExists` por una carrera se tolera solo si el resto de pasos y la verificación pasan.
- Bootstrap creado ≠ backend activado: siguen pendientes JWT persistente, HTTPS, cuotas por jugador, eventos `Died`/`RequestRestart`, y B00.
