# B30 — Resultado de la prueba de escritura sintética en Atlas (Etapa 33)

**ESTADO FINAL: la primera operación sintética QUEDÓ CONFIRMADA en Atlas (verificación directa de solo lectura: `consistent`, 20/20, recibo `committed`) pese a que el batch respondió HTTP 503. La IDEMPOTENCIA por reenvío NO se ha probado (pendiente).** Diagnóstico y propuesta de corrección del 503 en B32. Sin Godot, sin SQLite, sin tocar las siete colecciones históricas, sin cambios de código/claves/contraseñas/ACL/manifiesto, sin commits ni `push`. B00 sigue abierto.

## 1. Autorización recibida (límites)

6 documentos nuevos en `main_v2_*` de `two_sides_db`; inspecciones de solo lectura antes y después; CA temporal en `CurrentUser\Root` (instalación y retirada manuales); carpetas `TwoSidesSyntheticRun` y `TwoSidesInspection`; documentos sintéticos **conservados** en Atlas (sin eliminaciones); sin modificar colecciones históricas, partidas ni SQLite; una única operación sintética; reenvío idéntico para idempotencia; ante discrepancias, detenerse sin reintentos ni escrituras correctivas.

## 2. Inspección inicial («antes»)

`executionId a3c93af080d8d7581100a2c8d2fd2b80` · `verdict ready` · `writes 0` · semilla `ingestion-v1` válida · índices correctos · SCRAM negociado **SCRAM-SHA-1** (riesgo conocido, B00).

## 3. Operación sintética (lote `run-20261102-110352`, intacto)

1 operación `session.report` fase `open`, sin dependencias, `gameId null`; hashes `batch 83D68DEF…`, `receipts-query A02EE380…`, `run-ids 0ED6A6CD…` (sin cambios entre intentos).

| Identificador | Valor |
|---|---|
| runId | `44ccac91-ed97-4694-bddf-5a7b70ca1504` |
| registrationId | `c9d001ca-6bc8-4a09-ab71-a837da09b185` |
| installationId | `45f620f4-85cb-42c3-a455-d25ebf7a3540` |
| localPlayerId | `f8925302-8e92-4b06-b57e-eb6908376bab` |
| sessionId (origen) | `e4d2dd99-f2de-47f2-89f1-c1945e7e745c` |
| operationId | `64ad5b53-9df4-4040-b2d0-056eebde3467` |
| batchId | `9905e32c-8029-444e-ab69-b198629f41bd` |
| **technicalAccountId (T)** | `5e05a972-98ef-447a-9579-ba4d0e20a4b8` |

## 4. Primer intento: HTTP 400 en el registro (sin escritura)

`POST /api/v2/technical/registrations` → **400**; el script paró. **Causa (error mío en la plantilla):** la función `Json` devolvía `[Text.Encoding]::UTF8.GetBytes(...)`, que PowerShell desenrolla en `Object[]`; `Invoke-WebRequest` enviaba el cuerpo como texto decimal «123 34 115 …» (reproducido con un listener local en 127.0.0.1: 248 B, no es JSON). **Por qué no hubo escritura:** el cuerpo no parsea (`express.json strict` → `entity.parse.failed` → 400 antes del servicio); en la cadena de la ruta los únicos 400 posibles están antes de `register`; el log de errores de Caddy estaba vacío; y la inspección posterior lo confirma (las cifras de §6 son exactamente las del segundo intento). **Corrección:** `,[Text.Encoding]::UTF8.GetBytes(...)` en `docs/main-sync-test/sync-test.ps1.template` y en la copia ejecutable (idénticas, sin errores de sintaxis). **Pruebas offline:** `Json` devuelve `System.Byte[]`, bytes idénticos al JSON compacto, parseable; captura local 75 B válidos; regresión **SW05**.

## 5. Segundo intento (una sola ejecución)

| Paso | Resultado |
|---|---|
| 0 health | 200 |
| 1 registro | **201**, T = `5e05a972-98ef-447a-9579-ba4d0e20a4b8` |
| 2 sesión | 200 |
| 3 `GET /api/v2/technical/me` | 200 |
| 4 `POST /api/v2/sync/batches` | **503** (cuerpo ilegible para el script) |
| 5 reenvío idéntico · 6 consulta de recibos | **no ejecutados** (el script se detuvo; no se creó otra sesión) |

## 6. Inspección posterior («después», ejecutada por el propietario)

`executionId cd8f886c62efd3a66e04f8fc0ee65692` · `verdict ready` · `writes 0` · `closed true` · semilla válida · índices correctos.

| Colección | Antes | Después | Δ |
|---|---|---|---|
| main_v2_identities | 0 | 1 | +1 |
| main_v2_ownerGuards | 0 | 1 | +1 |
| main_v2_identitySessions | 0 | 1 | +1 |
| main_v2_operations | 0 | 1 | +1 |
| main_v2_facts | 0 | 1 | +1 |
| main_v2_fences | 1 | 2 | +1 |
| main_v2_revocations | 0 | 0 | 0 |
| users / decisions / gameevents / gameprogresses / statisticevents / statisticsummaries / syncidentities | 2 / 7 / 13 / 2 / 14 / 2 / 1 | 2 / 7 / 13 / 2 / 14 / 2 / 1 | **0** |

**Los conteos coinciden exactamente con seis documentos nuevos**, uno por colección prevista, y las siete históricas conservan sus conteos. Importante: son contadores de metadatos (`estimatedDocumentCount`): prueban cuántos documentos hay, **no** que `operations` contenga el recibo `committed` de `64ad5b53-…` ni que los documentos sean los de este run. Eso queda para B31.

## 7. El 503 NO demuestra que la operación se abortara (análisis offline del código)

Recorrido: `POST /api/v2/sync/batches` → `IngestionService.batches` → por operación `bounded(signal => repository.acceptOperation(...), min(restante, operationBudgetMs ≤ 2000))`. Un 503 del batch solo sale de `storage_unavailable` (`IngestionError(503, retryable)`), que se marca `deferred` y, al no haber recibos, eleva el estado HTTP a 503 (`results.some(r => r.error.retryable)`).

`bounded` produce ese error por **tres vías, todas posibles tras un commit correcto**:
1. **Temporizador de 2 000 ms** (`setTimeout → controller.abort(); reject(unavailable())`): responde al cliente mientras el trabajo del servidor sigue; si la última comprobación de presupuesto (`checkBudget`) se pasó antes de los 2 s, el **commit de la transacción** (viaje a Atlas, no vigilado por el presupuesto) se completa después.
2. **Comprobación posterior** (`.then(result => checkBudget(signal))`): si `acceptOperation` terminó, ya con la transacción confirmada, pero pasados los 2 000 ms, `bounded` lanza `unavailable()` aunque haya éxito.
3. Fallo real previo al commit (transacción abortada y revertida): produce el mismo 503, pero habría dejado `operations/facts/fences` sin cambios — **no es lo observado**.

Lo observado (§6: `operations` 1, `facts` 1, `fences` 2) es la huella de las vías 1–2: **éxito tardío informado como 503** («late success»). Coste estimado (no medido) de la primera operación: `verifyDeployment` (`hello` + 2 `listIndexes`), la transacción (≈5–8 lecturas, `fence`, `touch` del guardián, `coordinate`, 2 escrituras, commit); ≈15–20 viajes a Atlas: a 100–150 ms de latencia superan 2 s con facilidad. El límite está fijado en el código (`operationBudgetMs ≤ 2000`) y **no se ha modificado**.

Consecuencias: (a) el 503 era `retryable` de verdad, pero el reenvío debía hacerse con el **mismo cuerpo** (lo previsto) y solo tras consultar el recibo; (b) un reenvío puede volver a superar los 2 s y volver a dar 503 aunque funcionalmente sea un `duplicate` correcto, por lo que **una respuesta 503 no puede usarse por sí sola como prueba** ni a favor ni en contra de la idempotencia.

Corrección a B29: `receipts/query` **no es de solo lectura estricta**: también pasa por `transaction()`, que incrementa `ownerGuards.revision` y el fence del propietario (sin crear documentos), y exige una sesión (documento nuevo en `identitySessions` si no hay token vigente). Lo mismo vale para cualquier reenvío del batch.

## 8. Verificación directa por identificador (B31 §4) — RESULTADO DEFINITIVO

Autorizada por el propietario; ejecutada por él con `run-verify-synthetic.ps1` (contraseña oculta). Herramienta de solo lectura: solo `find` acotado + `connectionStatus`; sin sesión nueva, sin HTTP, sin Express/Caddy/CA, sin colecciones históricas ni cuentas ajenas, campos secretos excluidos.

| Campo | Valor |
|---|---|
| `syntheticRunVerification` | `finished` · `executionId f6160e3ecfec6b425820a3943215508c` |
| **veredicto** | **`consistent`** · `failed: []` · **20 de 20 comprobaciones correctas** |
| `writes` · `closed` | **0** · `true` |
| technicalAccountId | `5e05a972-98ef-447a-9579-ba4d0e20a4b8` |
| operationId | `64ad5b53-9df4-4040-b2d0-056eebde3467` |
| **receiptId** | `c85edd99-fe3f-43cf-9966-ca3443e83c91` |
| **acceptedAs** | **`committed`** |
| committedAtUtc | `2026-11-02T17:21:20.638Z` |
| payloadHash | `5fd906aba9802046f6c2174adedfad8afd74a78768d05ffbb74f4bb6d3151a87` (= el del lote) |
| Documentos | identity, guard, session, operation, fact y fence: **1 cada uno** según los filtros de B31; revocations **0** |
| Revisiones | `guardRevision 2` · `fenceRevision 1` · `revisionsConsistentWithOneCommit: true` (exactamente un commit de sync) |

**Conclusión:** la operación `64ad5b53-…` quedó **persistida exactamente una vez**, con recibo `committed`, `payloadHash` y `factDigest` correctos, y los seis documentos son los de este run. El **HTTP 503 del batch fue un éxito tardío informado como error** (el commit se completó en Atlas; la respuesta 503 se envió al vencer el presupuesto de 2 000 ms). Las siete colecciones históricas no se tocaron (conteos idénticos en la inspección posterior).

## 9. Evidencia conservada

Recibo (arriba), identificadores (§3), `run-ids.json`/`batch.json`/`receipts-query.json` en `%LOCALAPPDATA%\TwoSidesSyntheticRun\run-20261102-110352` (hashes en §3), autorizaciones y marcadores en `%LOCALAPPDATA%\TwoSidesInspection` (`a3c93af0…`, `cd8f886c…`, `f6160e3e…` consumidas). Los documentos sintéticos **se conservan** en Atlas (no autorizados borrados), identificados por T y los ids de este informe.

## 10. Pendiente

- **Idempotencia por reenvío: NO probada.** El recibo único y la ausencia de duplicados prueban que el primer envío no duplicó, pero no que un segundo envío del mismo lote devuelva `duplicate` con el mismo recibo. Requeriría una sesión nueva y una autorización separada (B31 §5).
- Corrección del 503 / presupuesto de 2 s: diagnóstico y propuesta en B32 (sin cambios de código todavía).
- Express se detuvo con `Stop-Process` (PID 27204, forzado, no Ctrl+C); CA retirada (44 certificados); Caddy detenido; puertos libres. B00 abierto.
