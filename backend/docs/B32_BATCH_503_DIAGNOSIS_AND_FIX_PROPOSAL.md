# B32 — Diagnóstico del HTTP 503 del batch y propuesta de corrección (Etapa 33)

Fecha: 2026-11-02. **Solo análisis y mediciones offline.** No se conectó Atlas, no se arrancó Express ni Caddy, no se instaló ningún certificado, no se creó sesión ni se reenvió nada, no se modificó el backend (`src/`, `scripts/`) ni el manifiesto, no se ejecutó Godot ni se tocó SQLite, no se tocaron las colecciones históricas; sin commits ni `push`. Añadido solo `tests/sync/main-batch-latency-model.test.js`.

## 1. Hecho confirmado

B30 §8: la operación `64ad5b53-…` está persistida **una vez** (recibo `c85edd99-…`, `committed`, `committedAtUtc 2026-11-02T17:21:20.638Z`), pero el batch respondió **503**. El cliente habría creído que no se guardó. Por qué ocurrió y cómo arreglarlo sin romper confirmación ni idempotencia.

## 2. Dónde se gasta el tiempo (medido offline sobre el código real)

Método: los repositorios reales (`MongoIngestionRepository`, `MongoIdentityRepository`, `IngestionService`) corren sobre el doble de Mongo del proyecto; cada llamada a la base (find, count, write, `listIndexes`, `hello`, commit) cuenta como **un viaje** y puede retrasarse con una latencia inyectada. Modela el **número** de viajes del camino de código, no Atlas (no modela RTT real, tiempo de servidor, Argon2 ni JWT). Reproducible: `npx vitest run tests/sync/main-batch-latency-model.test.js` (VL01, rápido, en la suite); el barrido se activa con `MEASURE_LATENCY=1` (y opcionalmente `MEASURE_RTTS=…`, `MEASURE_OUT=<archivo>`).

**Viajes por operación (VL01):**

| | Primer envío | Reenvío idéntico (`duplicate`) |
|---|---|---|
| **Total** | **34** | **26** |
| `hello` (verificación de despliegue) | 2 | 2 |
| `listIndexes` (verificación de índices) | 5 | 5 |
| `find` en `identities` | 10 | 8 |
| `find` en `identitySessions` | 5 | 4 |
| guardián (`find` + `updateOne`) | 2 | 2 |
| fence de propietario | 1 | 1 |
| `find` operations / facts, `count`, `estimatedCount` | 1 / 2 / 1 / 1 | 1 / 1 / 0 / 0 |
| escrituras de hecho, operación, autorización | 3 | 1 |
| commit | 1 | 1 |

Dos tercios del coste no son trabajo útil: **7 viajes** repiten comprobaciones de despliegue que no cambian entre operaciones (las hacen dos repositorios, cada uno en cada operación) y **15 viajes** validan la identidad/sesión: `context.validate()` se ejecuta 3 veces dentro de la misma transacción (más `coordinate`), cuando todo lo leído dentro de una transacción con snapshot es idéntico en cada lectura (una escritura concurrente del guardián, p. ej. una revocación, provoca conflicto de escritura, así que una sola validación por transacción basta). Útil de verdad: ≈ 12 viajes.

**Barrido de latencia (VL02, modelo, 34 viajes ⇒ ≈ 34 × RTT):**

| RTT inyectado | Respuesta | ¿Guardado en el almacén? |
|---|---|---|
| 10, 30, 50, 51, 52 ms | 200 `committed` (0,5 – 2,0 s) | sí |
| **53 ms** | **503** `storage_unavailable` | **sí** (éxito tardío) |
| 54 ms | 200 | sí |
| **55 ms** | **503** | **sí** (éxito tardío) |
| 56 – 100 ms | 503 | **no** (revertido, 24–33 viajes alcanzados) |

Lectura: (a) la **frontera está en ≈ 55 ms de RTT**; Atlas desde un equipo doméstico suele estar entre 40 y 150 ms, así que este diseño funciona «de milagro» o falla; (b) la ventana «503 pero guardado» (el incidente real) aparece cuando el vencimiento cae sobre el último viaje (commit); con jitter real esa ventana es ancha; (c) **por encima de la frontera es un callejón sin salida**: el reenvío de un `duplicate` cuesta 26 viajes y también supera 2 s en cuanto RTT > ≈ 77 ms; el cliente reintentaría para siempre un 503 reintentable, y cada intento bumpea guardián y fence sin lograr confirmar.

## 3. Por qué el 503 es *semánticamente* incorrecto cuando hay commit

Camino (`ingestion-service.js` → `budget.js::bounded` → `mongo-ingestion-repository.js::transaction` → `ingestion-engine.js::acceptOperation`):
1. `bounded` arma un temporizador a `min(restante, operationBudgetMs ≤ 2000)` que hace `abort()` y **rechaza** con `unavailable()` (503 reintentable).
2. Dentro del trabajo, `checkBudget(signal)` se llama **antes** del último paso previo al commit; **después** de ese punto, el `commitTransaction` de `withTransaction` no está vigilado: si el vencimiento cae durante él, el servidor confirma y el temporizador ya devolvió 503.
3. Además `bounded` hace `.then(result => checkBudget(...))` **después** de que el trabajo terminó con éxito: si pasó el plazo, convierte un éxito ya confirmado en `unavailable()`.
4. `IngestionService.batches` traduce eso a `deferred`/503.

El invariante de seguridad del motor es «**nunca ACK de un commit desconocido**» (pruebas M14/M15: commit incierto ⇒ 503 y el reenvío estable lo resuelve). Eso se mantiene. Lo que falla es el inverso: un commit **conocido** (el trabajo devolvió el recibo) se reporta como fallo, y el plazo se aplica también a una fase (el commit) que ya no se puede cancelar.

## 4. Cómo medir el tiempo real del procesamiento de batches (sin cambiar semántica)

Tres niveles, de menos a más intrusivo:
1. **Offline (hecho):** viajes por operación y barrido de latencia (§2). Línea base para detectar regresiones: la propuesta de §5 añade una prueba que fija un máximo de viajes.
2. **Latencia real a Atlas, solo lectura (nueva herramienta, requiere autorización de conexión):** plantilla fuera de `src/`, mismo molde que `verify-synthetic-run` (conector estricto, autorización de un solo uso): 30 × `hello` y 10 × `find` por `_id` de la semilla, cronometrados con `performance.now()`; salida: mediana, p95, máximo y RTT efectivo, sin documentos. Con eso el número de la tabla anterior pasa de modelo a medición. No cambia ninguna fila de Atlas.
3. **Telemetría en el servidor (cambio de código, sin datos de usuario):** por operación, un registro de longitud fija con milisegundos por fase (`deploymentCheck`, `begin`, `validate`, `guard`, `loadScoped`, `write`, `commit`, `total`) y el número de viajes; sin ids, tokens ni contenido. Incluye el resultado (`committed/duplicate/deferred/late_success`) para detectar éxitos tardíos reales.

## 5. Propuesta de corrección (por fases independientes, cada una con su prueba)

Principios: la confirmación y la idempotencia no se tocan (ACK solo tras commit confirmado; `operationId` + `payloadHash` estables; mismo recibo en `duplicate`); el presupuesto sigue acotando el trabajo **previo al punto de no retorno**; nada se desactiva.

**F1 — Menos viajes (no cambia semántica).**
- Verificación de despliegue (`hello` + índices) una vez al arrancar y con caducidad (p. ej. 60 s) en lugar de por operación: −7 viajes. Mantiene la comprobación; un fallo posterior sigue produciendo `storage_unavailable`.
- Una sola validación de identidad/sesión por transacción (la de `coordinate`, tras el `touch` del guardián); `live()` sin releer la cuenta ya leída: −≈ 12 viajes.
- `touch` del guardián como una sola `findOneAndUpdate` (condición `revision: n`) en lugar de `find` + `updateOne`: −1.
- Objetivo: **≈ 14 viajes** el primer envío y **≈ 10** el reenvío (de 34 y 26): la frontera de RTT sube de ≈ 55 ms a ≈ 140 ms para 2 s.
- Pruebas: las suites existentes (I*, M*, identidad, revocación) siguen verdes sin cambios; **nueva prueba de tope de viajes** (p. ej. ≤ 16 y ≤ 12) para que no vuelva a crecer; prueba de equivalencia: revocar durante la operación sigue produciendo conflicto/401.

**F2 — Semántica del plazo (corrige el 503 falso).**
- Puerta de commit: `bounded` recibe una señal «commit iniciado» que el motor activa justo antes de devolver el control a `withTransaction`; a partir de ahí **el temporizador no rechaza**: se espera el resultado del commit hasta un `commitGraceMs` fijo (p. ej. 8 s, siempre ≤ presupuesto de batch y < tiempo de espera del cliente).
- Eliminar el `.then(checkBudget)` posterior al éxito: si el trabajo devolvió recibo, **se responde el recibo** (el commit ya ocurrió).
- Si el commit sigue sin resolverse tras `commitGraceMs`, el resultado es **desconocido de verdad**: se mantiene el 503 reintentable con código distinto (`commit_outcome_unknown`) y el reenvío estable lo resuelve (M14/M15 intactas).
- Pruebas: con el modelo de latencia, barrido completo ⇒ nunca `503` con `committedInStore: true` (el caso de hoy, RTT 53/55 ms, pasa a 200 `committed`); `unknown` simulado ⇒ 503 `commit_outcome_unknown`, sin recibo especulativo, y el reenvío devuelve `duplicate` con el mismo `receiptId`; el plazo previo al commit aún aborta y revierte (sin documentos).

**F3 — Presupuestos y cliente coherentes.**
- Hoy `operationBudgetMs ≤ 2000` está **fijado en el constructor**; pasar a un valor configurable con tope (p. ej. por defecto 5 000 ms, máximo 8 000) y `batchBudgetMs` hasta 30 s (hoy 10 s), con la regla `plazo total < tiempo de espera del cliente`.
- El cliente Godot usa 10 s de espera por petición: debe enviar lotes **pequeños** (p. ej. ≤ 5 operaciones) y tratar `deferred` como «reintentar los mismos ids». Con F1, ≈ 14 viajes × 100 ms ≈ 1,4 s/operación ⇒ ≈ 5–7 operaciones por petición. No se resuelve el volumen de un primer envío histórico por esta vía: debe drenarse por lotes sucesivos (la outbox ya lo hace).

**F4 — Operación.** Telemetría de §4.3 desde el primer despliegue, para validar F1–F3 con Atlas real. Sondeo de latencia de solo lectura (§4.2) **antes** de decidir los números definitivos de F3.

**Qué NO se propone:** subir el límite sin más (retrasaría el fallo, no lo arregla), responder éxito antes del commit, relajar la verificación de despliegue o de autorización, ni cambiar el contrato de recibos/idempotencia.

## 6. Procedimiento si se aprueba

Cada fase modifica `src/` ⇒ **invalida el manifiesto** (B20 §6): requiere tu autorización explícita por fase; se desarrolla y prueba offline (suite completa + nuevas pruebas), se crea una línea base nueva conservando la anterior (procedimiento B21) y se re-verifica el arranque (preflight de integridad). Orden sugerido: medición de latencia real (solo lectura) → F1 → F2 → F3 → telemetría. La prueba de idempotencia por reenvío (B31 §5) se hace **después** de F1+F2 para que el resultado no dependa del límite de 2 s.

## 7. Riesgos de esta propuesta

- F1 cambia el momento de las comprobaciones de despliegue (cache con caducidad): un cambio de índices en caliente se detectaría hasta 60 s después; aceptable (el perfil exige índices exactos al arrancar).
- F2 introduce dos estados («confirmado tardío» y «desconocido»): requieren pruebas explícitas y que el cliente trate ambos como reintentos del mismo `operationId`.
- Los números de §2 son un modelo de viajes, no tiempos de Atlas: hay que medirlos (§4.2) antes de fijar F3.
- El estado actual no se modifica: SCRAM-SHA-1 y B00 siguen abiertos; la idempotencia por reenvío sigue **sin probarse**.
