# B36 — Plan técnico de F2: un commit confirmado nunca se informa como 503 (SOLO PLAN, sin implementar)

Fecha: 2026-11-02. Documento de planificación. **No se modificó `src/`, `scripts/` ni `tests/`; no se tocó el límite de 2000 ms; no se conectó Atlas; no se arrancó Express ni Caddy; no se ejecutó Godot; no se tocaron SQLite, certificados, claves, ACL, manifiestos ni respaldos; no hubo commits ni push.** Base: B30, B32, B33, B34 y lectura del código actual (`budget.js`, `ingestion-service.js`, `ingestion-engine.js`, `mongo-ingestion-repository.js`, `routes.js`, `scripts/network/ApiClient.cs` solo lectura). Línea base de integridad vigente: `treeDigest` v3 `d1c9cd6c…0813`, manifiesto SHA-256 `9EE7446C…2614`.

## 1. Problema (hechos del código real)

Cada operación del lote se ejecuta así (`ingestion-service.js:45`):
`bounded(signal => repository.acceptOperation(...), min(restante_lote, 2000))` → `acceptOperation` → `transaction()` → `identityRepository.transaction()` → `session.withTransaction(callback, {snapshot, w:majority, j:true, maxCommitTimeMS:1000, timeoutMS:10000})`.

`withTransaction` hace: callback (lecturas y escrituras) → **`commitTransaction`** (viaje con espera de journal y mayoría; el driver lo reintenta mientras el error lleve la etiqueta `UnknownTransactionCommitResult`, cada intento ≤ 1000 ms, total ≤ `timeoutMS` 10 s).

El plazo de 2000 ms (`budget.js`) solo vigila hasta la última llamada a `checkBudget` dentro del callback. **El commit queda fuera de esa vigilancia** y el temporizador de `bounded` sigue armado.

## 2. Dónde un commit confirmado se convierte en HTTP 503 (exacto)

| # | Lugar | Mecanismo | ¿Commit en el servidor? |
|---|---|---|---|
| A | `budget.js:12` (temporizador del `Promise.race`) | A los 2000 ms hace `abort()` y rechaza con `unavailable()` mientras `withTransaction` está **ya en `commitTransaction`** (o en las escrituras finales de `commitDelta` que luego pasan el último `checkBudget` antes del abort). El trabajo sigue vivo en segundo plano | **Sí, puede llegar a confirmarse tras responder el 503** (caso real de B30: `operations 1, facts 1, fences 2` con HTTP 503) |
| B | `budget.js:11` (`.then(checkBudget)` posterior al éxito) | La transacción ya terminó con recibo confirmado, pero el reloj pasó de 2000 ms durante el commit: se lanza `unavailable()` | **Sí, confirmado y conocido por el servidor**, descartado por el plazo |
| C | `mongo-ingestion-repository.js` `catch` | Cualquier error tras el inicio del commit (red, `MaxTimeMSExpired`, `timeoutMS` agotado) se convierte en `unavailable()` | **Desconocido** (puede haberse confirmado). Es legítimo: se mantiene el 503, pero hoy no se distingue de un aborto |
| D | `ingestion-service.js:46-49` | Traduce cualquier `retryable` a `deferred` + HTTP 503 con `Retry-After: 1` | Hereda A–C |
| E | Cascada | Tras A, el trabajo huérfano sigue vivo y la **siguiente operación del mismo lote** (mismo guardián del propietario) entra en conflicto de escritura con él (`WriteConflict`, 3 intentos) y también da 503 | Solo la huérfana puede confirmarse |

Casos que **no** son el problema: un 503 por plazo vencido **antes** del punto de no retorno (el `checkBudget` dentro del callback lanza → `withTransaction` aborta → nada persiste); un `remaining<=0` antes de empezar la operación (no se inicia).

Daño real: respuesta engañosa (el cliente cree que no se guardó), reenvío innecesario que vuelve a pagar ≈14 viajes y puede repetir el 503 (el reenvío es `duplicate` correcto pero igual de lento si el enlace es lento), y la cascada E. **No hay riesgo de duplicados ni de pérdida**: la idempotencia (`_id` determinista = cuenta + operationId, `$setOnInsert`, índices únicos, `payloadHash`) hace seguro el reenvío (T15, T16).

## 3. Diseño: compuerta de commit («commit gate»)

Principios (no negociables): **ACK solo tras `withTransaction` resuelto**; nunca ACK especulativo; el presupuesto de 2000 ms sigue gobernando todo lo que ocurre **antes del punto de no retorno**; `operationId`/`payloadHash` estables; mismo `receiptId` en `duplicate`; contratos, endpoints y JWT intactos; F1 intacto.

### 3.1 Fases por intento de transacción

```
PRE ──(último checkBudget + entrar en compuerta, síncrono)──► COMMITTING ──► COMMITTED (withTransaction resolvió)
 │                                                                  ├──► ABORTED  (error con prueba de no confirmación)
 └─ plazo/abort/error ─► ABORTED (garantizado, nada persiste)       └──► UNKNOWN  (error tras entrar sin prueba, o gracia agotada)
```

- **PRE:** el temporizador de 2000 ms actúa como hoy (`abort()` + rechazo). Cualquier `checkBudget` posterior lanza dentro del callback → el driver aborta → **estado ABORTED probado**. No se cambia.
- **Entrada en COMMITTING:** una función `commitPoint(signal)` que **síncronamente** ejecuta `checkBudget(signal)` y marca la señal como «en commit». Va como último paso del callback de `transaction()` en `mongo-ingestion-repository.js`, tras `beforeAuthorizationCommit()` (que conserva sus comprobaciones). Al no haber `await` entre ambos pasos, el temporizador no puede colarse entre el chequeo y la marca: o ganó el temporizador (entonces `checkBudget` lanza y se aborta) o gana la compuerta.
- **En COMMITTING el temporizador de 2000 ms no rechaza.** Se arma en su lugar la **gracia de commit** (`commitGraceMs`, propuesta 3000 ms, ver D2) que espera el resultado de `withTransaction`. El `.then(checkBudget)` de `bounded` se **omite** si la señal entró en compuerta.
- **Reintento del driver** (`TransientTransactionError` en el commit): el callback se vuelve a ejecutar; su primera instrucción **reinicia la señal a PRE** (igual que F1 crea una memoria nueva por intento). Si el plazo ya pasó, `checkBudget` lanza → aborto probado → 503 sin documentos.

### 3.2 Resultado por estado

| Estado | Qué sabe el servidor | Respuesta | Persistencia |
|---|---|---|---|
| **COMMITTED** | `withTransaction` resolvió (mayoría + journal) | recibo `committed`/`duplicate`/`superseded` con 201/200, **aunque hayan pasado > 2000 ms** | exactamente 1 operación + 1 hecho |
| **ABORTED** (PRE o error con etiqueta de aborto/`NoSuchTransaction` o excepción del callback) | no se confirmó | 503 `storage_unavailable` reintentable, `deferred` | cero documentos nuevos |
| **UNKNOWN** (error tras entrar en compuerta sin prueba de aborto, `UnknownTransactionCommitResult` agotado, o gracia agotada) | puede o no estar confirmado | 503 reintentable `deferred`, **sin recibo** | 0 o 1; el reenvío estable lo resuelve |
| **Pérdida de respuesta tras el commit** (HTTP/cliente) | confirmado | el cliente no la ve; al reenviar el mismo cuerpo recibe `duplicate` con el **mismo** `receiptId`, `committedAtUtc` y `payloadHash` | sin cambios (los contadores de guardián/fence sí suben +1 por transacción, como hoy, T18) |

Regla de clasificación (conservadora): tras entrar en COMMITTING, **todo fallo sin etiqueta de aborto probado se trata como UNKNOWN**. Nunca se promociona un fallo a COMMITTED ni se fabrica un recibo.

### 3.3 Reintentos con los mismos identificadores

- Reenvío tras UNKNOWN/ABORTED: mismo `operationId` + `payloadHash` → `duplicate` con recibo original, o (si no se confirmó) `committed` normal. Contradictorio → 409 `idempotency_conflict`, original intacto (T16).
- **Reenvío mientras el commit original sigue en vuelo**: dos transacciones sobre el mismo `_id`/guardián → conflicto de escritura → el driver reintenta → la segunda ve el documento (`duplicate`). Se prueba explícitamente (F2-T9).
- Sin cancelar al desconectarse el cliente: el servidor no aborta el commit por `req.close` (hoy tampoco); evita crear UNKNOWN artificiales.

### 3.4 Evitar ACK falsos y duplicados

- ACK ⇒ fila existe: el recibo sale únicamente del valor devuelto por `transaction()` (tras el commit). El callback devuelve el recibo **antes** del commit; la compuerta no lo libera: solo el valor final de `withTransaction` llega a `bounded`.
- Duplicados imposibles por construcción: `_id` determinista, `$setOnInsert` + `upsert`, índices únicos `(technicalAccountId, operationId)` y `(scope, sourceKey)`. F2 no toca esas rutas.
- Cascada E: el servicio **espera el desenlace** (COMMITTED/ABORTED/UNKNOWN) antes de la siguiente operación, de modo que no queda trabajo huérfano solapado. Si el desenlace es UNKNOWN, las operaciones **restantes del lote no se inician** y se devuelven `deferred` (reintentar con los mismos ids; nada se escribió para ellas). Ver D3.

### 3.5 Compatibilidad con F1

- La comprobación de despliegue en caché (`deployment.ensure`) y la memoización siguen **dentro de PRE**; el calentamiento, el TTL de 30 s, la invalidación y los 21/14/9 viajes **no cambian** (la compuerta no añade viajes).
- Un COMMITTED tardío **no invalida** la caché (es un éxito); ABORTED por almacenamiento y UNKNOWN siguen invalidándola (cerrado ante fallo), como hoy.
- Registro, sesión y revocación (transacciones `live`, sin `bounded`) no se tocan. La memoización de F1 por intento se reinicia junto con la señal.

## 4. Archivos exactos a modificar

| Archivo | Cambio | Riesgo |
|---|---|---|
| `src/modules/sync/budget.js` | estado de compuerta por señal (`WeakMap`), `commitPoint(signal)`, temporizador que no rechaza en COMMITTING y arma la gracia, omitir `.then(checkBudget)` tras compuerta, clasificación de desenlace; **la constante de 2000 ms no cambia** | medio (núcleo del plazo) |
| `src/modules/sync/mongo-ingestion-repository.js` | reinicio de fase al inicio de cada intento; `commitPoint(signal)` al final del callback; en el `catch`, etiquetar el error según la fase (ABORTED/UNKNOWN); invalidación como hoy | medio |
| `src/modules/sync/ingestion-service.js` | pasar el tope de gracia (`min(commitGraceMs, restante_lote)` con suelo 1000 ms); esperar el desenlace; no iniciar operaciones tras UNKNOWN (D3); sin tocar `operationBudgetMs` ni su validación | medio |
| `src/modules/sync/errors.js` | solo si D1 se decide por un código nuevo o una marca interna del desenlace | bajo |
| **No se tocan:** `ingestion-engine.js` (el motor en memoria no tiene commit separado y conserva el comportamiento actual), `mongo-identity-repository.js`, `deployment-check.js`, `profile.js`, `routes.js`, `scripts/*`, `package*.json`, contratos y endpoints | | |

Archivos de pruebas **nuevos** (no se modifica ningún test existente): `tests/sync/main-f2-commit-gate.test.js`, `tests/sync/support/f2-faults.js` (envoltorio sobre el doble de Mongo que inyecta latencia/fallos de commit sin editar `mongo-double.js`). Si alguna prueba preexistente (p. ej. M13–M15, latencia B32) fijara el comportamiento actual de la ventana tardía, se documenta y se pide autorización antes de tocarla.

## 5. Pruebas offline (escribir primero; deben fallar donde hoy hay defecto)

Soporte: envoltorio de `startSession`/`withTransaction` con retardo configurable del commit (`commitDelayMs`), modos `abort-before`, `unknown-applied` (aplica y lanza `UnknownTransactionCommitResult`), `unknown-not-applied`, `hang-then-apply` (aplica tras la gracia), reloj controlable, y el modelo de latencia por viaje de `latency-harness`.

| ID | Prueba | Esperado |
|---|---|---|
| F2-T1 | **Defecto actual (A)**: commit con retardo que cruza 2000 ms | hoy 503 con fila; con F2: 201 `committed` con la fila |
| F2-T2 | **Defecto actual (B)**: éxito conocido tras el plazo | hoy 503; con F2: recibo |
| F2-T3 | Plazo vencido en PRE (retardo en lecturas/escrituras previas) | 503, 0 documentos, 0 recibos, guardián/fence sin cambios |
| F2-T4 | Carrera temporizador/compuerta (barrido de 0–5 ms alrededor del plazo, 200 puntos) | nunca ACK sin fila; nunca fila con 503 si el commit terminó dentro de la gracia |
| F2-T5 | Commit abortado (`abort-before`, rollback) | 503, 0 filas, reenvío = `committed` |
| F2-T6 | `unknown-applied` | 503 sin recibo; reenvío = `duplicate`, mismo `receiptId`, 1 operación/1 hecho |
| F2-T7 | `unknown-not-applied` | 503; reenvío = `committed`, 1 fila |
| F2-T8 | `hang-then-apply` (aplica después de la gracia) | 503 sin recibo en el momento; luego la fila existe; reenvío = `duplicate`; 0 duplicados |
| F2-T9 | Reenvío concurrente mientras el commit original sigue en vuelo | un efecto; el reenvío no crea un segundo documento ni un 409 espurio |
| F2-T10 | Pérdida de respuesta tras commit (el cliente cancela la lectura) y reenvío | `duplicate` idéntico (receiptId, hora, hash) |
| F2-T11 | Cascada E: lote de 5 con la 2.ª en commit lento | sin conflictos entre operaciones del lote; todas COMMITTED o las no iniciadas `deferred` |
| F2-T12 | UNKNOWN en la operación k de un lote | operaciones > k no iniciadas (`deferred`), ninguna fila para ellas; ≤ k según su estado |
| F2-T13 | Transacción reintentada por el driver tras entrar en compuerta | fase reinicia a PRE; si el plazo pasó, aborto probado y 0 filas |
| F2-T14 | Contradictorio tras UNKNOWN | 409 `idempotency_conflict`, original intacto |
| F2-T15 | Concurrencia: N propietarios × M operaciones con fallos aleatorios (semilla fija, ≥ 500 ejecuciones) | **invariante**: todo ACK ⇒ fila; toda fila con 503 ⇒ el desenlace fue UNKNOWN dentro de ventana inyectada; ≤ 1 fila por operationId/sourceKey |
| F2-T16 | Barrido de latencia por viaje 20–250 ms (reutiliza VL02) | 0 casos «503 con `committedInStore`» mientras commit ≤ gracia |
| F2-T17 | Viajes (F1) | 21 / 14 / 9 sin cambios; ningún `hello`/índice extra con caché caliente |
| F2-T18 | F1 completo: T1–T19, U1–U6, W1–W9, diferencial de 63 vectores | iguales (golden no se regenera) |
| F2-T19 | Constantes: `operationBudgetMs` por defecto 2000 y tope 2000; `batchBudgetMs` 10000; constructor sigue rechazando valores mayores | sin cambios |
| F2-T20 | Autorización: revocación durante el commit lento y durante la gracia | nunca una operación confirmada después de la revocación (T4 se conserva) |
| F2-T21 | Sin secretos en respuestas/logs del desenlace; sin temporizadores tras cerrar | limpio |
| F2-T22 | Sobrecoste de la compuerta en la ruta normal | < 1 ms mediana, 0 viajes |

## 6. Criterios de aceptación medibles

1. 0 casos de «503/deferred con fila confirmada y commit dentro de la gracia» en F2-T1/T2/T4/T15/T16.
2. 0 ACK sin fila y 0 filas duplicadas en ≥ 500 ejecuciones de fallos aleatorios (F2-T15).
3. 100 % de los reenvíos tras ABORTED/UNKNOWN convergen a 1 operación, 1 hecho y el mismo `receiptId`.
4. Viajes del modelo idénticos a F1 (21/14/9); tope de F1-T1 intacto.
5. Suites existentes sin modificar: ≥ 792 aprobadas + las nuevas, 0 fallidas, dos suites completas consecutivas sobre la versión final con `C2_FINAL_TEST_ROOT`; legacy 39/39; diferencial 63/63; escáner de secretos limpio; ACL `conforming`.
6. `operationBudgetMs` = 2000 verificado por prueba y por `diff`; `diff` limitado a los 3–4 archivos de §4.
7. Tiempo máximo de una petición de un lote: ≤ 10 s + 1 s (suelo de gracia) y siempre < el tiempo de espera del cliente (`ApiClient.cs` usa `Configuration.TimeoutSeconds`; **valor no verificado en esta revisión**, B32 lo cita como 10 s).

## 7. Respaldo, integridad y orden de trabajo

1. Antes de tocar nada: respaldo nuevo `%LOCALAPPDATA%\TwoSidesBackendBackups\pre-F2-<fecha>` (src 71 + scripts 47, con `SHA256SUMS.txt`, fuera de OneDrive); confirmar que `pre-F1-20261102` sigue 117/117; registrar los hashes previos de los 3–4 archivos.
2. Escribir las pruebas de §5 primero; comprobar que F2-T1/T2/T11 fallan sobre el código actual.
3. Implementar (mínimo), pruebas nuevas verdes, luego dos suites completas consecutivas sobre la misma versión final, legacy, escáner y ACL.
4. Manifiesto **v4** (B33 §5.5/B21): conservar v3 renombrado con fecha, candidato con creación exclusiva, `verify`, preflight con ancla nueva ok y con la de v3 rechazada (`integrity_anchor_mismatch`); el propietario anota el digest v4 fuera del equipo. No se relajan controles ni se editan scripts de integridad.
5. Informe B37 de resultado. Arranque con la guardia solo con `/api/health`; la verificación real contra Atlas (reenvío idempotente y un lote lento) solo con autorización aparte.

## 8. Riesgos residuales

- **No demostrable offline:** el comportamiento real de `commitTransaction` con Atlas (etiquetas de error exactas, `MaxTimeMSExpired`, reintentos del driver, aislamiento snapshot) solo se probó con dobles.
- La gracia alarga el peor caso de una petición (hasta +3 s por operación, acotado por el lote); si el enlace es muy malo habrá UNKNOWN reales (siguen siendo 503 seguros).
- Clasificación conservadora: algunos abortos reales se tratarán como UNKNOWN (sin consecuencia de datos, solo reenvío).
- F2 no reduce latencia por sí sola (eso es F1/F3); no cambia el volumen por lote ni los tiempos de espera del cliente.
- Cola fría tras >30 s de inactividad (F1) sigue pudiendo agotar los 2000 ms en PRE: eso es un 503 **correcto** (nada persiste) y se resuelve con F3 (presupuestos/keep-warm) o con `minPoolSize`.
- Mismo usuario del manifiesto (B15/B21) y B00 abierto.

## 9. Decisiones que requieren autorización del propietario

- **D1 — Código externo del desenlace desconocido:** (a, recomendado) mantener `storage_unavailable` en la respuesta y registrar el desenlace solo internamente (sin cambio de contrato); (b) nuevo código `commit_outcome_unknown` (aditivo, pero el cliente C# debería tolerarlo).
- **D2 — `commitGraceMs`:** propuesta 3000 ms, acotado por el tiempo restante del lote con suelo de 1000 ms (≥ `maxCommitTimeMS`); valor fijo en código, no configurable por entorno.
- **D3 — Tras UNKNOWN, no iniciar las operaciones restantes del lote** (devolverlas `deferred`): recomendado.
- **D4 — Aplicar la misma compuerta a `receipts/query`** (su transacción también escribe guardián/fence): recomendado por coherencia, de bajo riesgo.
- **D5 — Contadores/telemetría en proceso** del desenlace (sin PII): fuera de F2 salvo que se apruebe.
- **D6 — Alcance de las pruebas:** solo archivos nuevos (recomendado); no editar `mongo-double.js` ni pruebas existentes.
- **D7 — Autorización explícita** para: respaldo pre-F2, modificar los 3–4 archivos de §4, crear manifiesto v4. Nada se hará hasta recibirla; F3 sigue fuera de alcance.

Detenido tras entregar el plan. No se inició F2.
