# B54 — Manejo explícito del agotamiento de cuota en la sincronización

Fecha: 2026-11-03. Implementación mínima del cliente. **No se tocó el servidor** (`backend/src`, `scripts`, `tests`), ni la cuota (sigue en 1000), ni Godot, escenas, `project.godot`, el esquema SQLite, la SQLite real ni la copia de B52. Sin Atlas, backend principal, Caddy ni certificados. Sin commits ni push.

**[H]** = comprobado en código o por prueba; **[Hip]** = hipótesis o estimación.

## 1. Verificaciones previas (Fase 1)

1. **Cómo se aplica la cuota [H].** `ingestion-engine.js:112`: `ownCount >= maxRecords (1000)` → `IngestionError(429,'quota_exceeded',true)`. Cuenta **operaciones** del propietario, solo las **nuevas**: los duplicados se contestan antes (líneas 87-92). Además: válvula global 50 000 (`:113`) y, solo en el almacén en memoria (no escopado), un tope de 2 MiB (`:121`) con el mismo código.
2. **¿El servidor distingue cuota de límite de ritmo? Sí [H], sin cambiar el contrato.**
   - *Cuota*: respuesta de lote (`ingestion-service.js:50-67`) con `results[]`, cada elemento `status:"deferred"`, `error.code:"quota_exceeded"`; HTTP 429 si todas fallan, 207 si es mixta.
   - *Límite de ritmo*: lo lanza el limitador antes del lote (`rate-limiter.js:26`) y responde el manejador de errores del router (`routes.js:45-53`): sobre `{schemaVersion,error:{code:"rate_limited"},requestId}`, **sin `results`**, con `Retry-After`.
   - Confirmado contra el servidor real (Express offline-test, sección 5): las dos formas aparecen tal cual.
3. **Política de reintentos anterior [H, por lectura de código; no se ejecutó antes del cambio].** El despachador mapeaba `quota_exceeded` y `rate_limited` al mismo código `rate_limited`; cada operación se reprogramaba con retroceso exponencial (1 s … tope 15 min, jitter 50-100 %), **sin límite de intentos ni pausa conjunta**. Con la cuota llena, el resto de la cola seguía siendo reservado en lotes de hasta 8, cada intento con lectura a Atlas antes del rechazo.
4. **Orden de despacho [H].** `Reserve`: `ORDER BY created_at_utc, operation_id`, solo operaciones cuyos padres están `confirmed`. **No se cambió.**
5. **Dependencias [H].** `sync_dependencies` (3162 en la copia de B53). El cliente no envía hijos con padre sin confirmar.
6. **Pausa recuperable previa.** No existía. Lo único persistente que ya tenía el esquema es `next_attempt_ms` (columna permitida por el trigger de inmutabilidad, que solo protege identificadores y contenido).
7. **Archivos a cambiar:** `local-persistence/src/SyncOutboxService.cs.txt` y `local-persistence/sync-http/SyncOutboxDispatcher.cs.txt`. Nada más del producto.

## 2. Comportamiento anterior y nuevo

| Situación | Antes | Ahora |
|---|---|---|
| Un resultado `quota_exceeded` en un lote | Reintento individual (`rate_limited`), el resto de la cola seguía intentándose | La pasada se detiene: `SYNC_QUOTA_BLOCKED`. Las operaciones no confirmadas se pausan **en SQLite** |
| Código guardado | `rate_limited` | `quota_exceeded` (campo `last_error_code`, texto libre; sin cambio de esquema) |
| Repetición | Indefinida, tope 15 min por operación | Cero peticiones durante la pausa; pausas 15 min → 1 h → 6 h (tope) si la sonda vuelve a fallar |
| Reinicio del juego | Retomaba el reintento masivo | La pausa persiste en `next_attempt_ms`; el proceso nuevo no envía nada hasta que expire |
| Reanudación | Automática por retroceso | Al expirar: **una sola operación** de sonda. Solo un `committed` nuevo prueba capacidad; un `duplicate` no (el servidor lo contesta antes de la cuota). `ResumeAfterQuotaChange()` permite reanudar antes |
| Límite de ritmo (429 sin `results`) | Igual que cuota | Sin cambios: retroceso corto (`rate_limited`), sin pausa ni sonda |

Mecánica (`SyncOutboxDispatcher`):
- En el bucle de resultados, `deferred` con `error.code=="quota_exceeded"` → `Retry(op,"quota_exceeded")` (conserva lease/intentos) y marca `quotaHit`.
- Tras procesar todo el lote: `BlockForQuota` → `SyncOutboxService.DeferForQuota(binding,pausa)`, `_probe=true`, nivel +1, código `SYNC_QUOTA_BLOCKED`.
- Con cola vacía de elegibles: consulta de solo lectura `QuotaPauseUntil`; si hay pausa devuelve `SYNC_QUOTA_BLOCKED` (esto da el estado visible tras un reinicio).
- Un `committed` nuevo sin cuota en la misma pasada pone `_probe=false` y el nivel a 0.
- El `retryAfterSeconds:1` que el servidor adjunta a la cuota se **ignora**.

`SyncOutboxService` (nuevos, sin tocar esquema): `DeferForQuota` (solo `next_attempt_ms` de `pending`/`retryable_failure`, nunca baja una fecha), `ReleaseQuotaPause` (pone `now` a pendientes y a los `retryable_failure` con código `quota_exceeded`), `QuotaPauseUntil`; `ErrorCode` acepta `quota_exceeded` como reintentable (validación en C#, la columna no tiene CHECK). Constante `MaxQuotaPause` = 1 día.

## 3. Archivos modificados y respaldo

| Archivo | SHA-256 nuevo | Antes |
|---|---|---|
| `local-persistence/src/SyncOutboxService.cs.txt` (CRLF conservado) | `60474909D09A1D33DCDCF1A5646C2EBCE9ABBCBD117727F51486D3A299C334C1` | `57301129…6CB1` (+27 líneas) |
| `local-persistence/sync-http/SyncOutboxDispatcher.cs.txt` | `1DF47EF3CC8770B3EDC8A45D97517DCA661AACDC31D86FD632CC7F3D544B70C1` | `454197E8…D681` (~46 líneas) |

Nuevos (pruebas): `local-persistence/sync-f54-tests/{SyncF54Checks.cs.txt, Program.cs.txt, SyncF54.Checks.csproj, packages.lock.json}`.

Respaldo previo: `%LOCALAPPDATA%\TwoSidesClientBackups\pre-B54-20261103\` (los dos archivos originales, con hash verificado).

**Manifiesto:** no hay archivos protegidos del backend modificados. El manifiesto v4 sigue `ok` (3169 archivos, 0 diferencias); no hace falta v5 por esta etapa.

## 4. Diferenciación de errores 429 [H]

| | Cuota | Límite de ritmo |
|---|---|---|
| Quién | `IngestionEngine.acceptOperation` | `RateLimiter` en el router |
| Forma | Cuerpo de lote con `results[]` y `error.code:"quota_exceeded"` por operación | Envoltorio `error.code:"rate_limited"`, sin `results` |
| Estado HTTP | 429 (todas) o 207 (mixto) | 429 |
| Cliente | `SYNC_QUOTA_BLOCKED`, pausa, sonda | `SYNC_RATELIMITED`, retroceso corto |

No se basa solo en el 429: el estado HTTP no se usa para decidir cuota; solo el código por operación.

## 5. Pruebas ejecutadas

Todas con SQLite sintética desechable; servidor falso en proceso o Express `offline-test` (loopback, memoria). Sin Atlas.

**Nuevas (`SyncF54.Checks`): 16/16 locales + 2/2 contra Express real.**

Locales (servidor falso que imita exactamente las dos formas): cuota agotada (3 aceptadas, 2 pausadas, 15 pendientes); lote entero rechazado por cuota identificado por código; pausa ≥ 15 min pese a `retryAfter=1`; **200 pasadas sin ninguna petición** y contadores de intentos intactos; límite de ritmo ≠ cuota (sin pausa, sin sonda, recupera tras 30 s); reanudación al recuperar capacidad (una sonda, drenaje, cada `operationId` exactamente una vez, grafo de dependencias idéntico); sonda fallida: 15 min, 1 h, 6 h, 6 h, 6 h; `duplicate` no limpia la sonda; reanudación manual (solo toca no confirmadas, filas confirmadas intactas); **reinicio con cuota bloqueada** (proceso nuevo: 0 peticiones, luego reanuda); huella de identificadores, hashes, claves de origen, fechas y dependencias idéntica tras bloqueos de horas; padres antes que hijos y un solo commit por operación; lote mixto con recibos conservados; sin pérdida de decisiones/progreso (sobres idénticos tras 30 ciclos de 7 h); guardas del servicio (pausas 0, 0,5 s, 2 d, negativas rechazadas; estados e intentos intactos); compatibilidad F3.1 (lote 5/8, lease 60 s, timeout 15 s, pausas por defecto).

Express offline-test real (dos procesos, porque el almacén en memoria es único):
- *Cuota:* cola de 1012 sesiones → aceptadas **944**, luego `SYNC_QUOTA_BLOCKED`; 68 sin confirmar, todas pausadas; 0 permanentes; huella intacta; 30 pasadas más sin reservar nada.
  **Observación importante:** 944 y no 1000, porque el almacén en memoria alcanza antes su tope de 2 MiB (mismo código `quota_exceeded`). No se probó la cuota de **conteo 1000** del camino Mongo/Atlas.
- *Límite de ritmo real:* a la operación 120 (límite `sync-owner 120/min`) llegó `SYNC_RATELIMITED`: se distingue de la cuota, sin estado de cuota, 0 permanentes.

**Regresión [H]:** F3.1 14/14; `GameSave.Checks` 679/679 en los 18 modos (`--outbox` 66, `--gameplay-observer` 37, `--reconciliation` 51, etc.); biblioteca SQLite 43/43; contrato cliente↔Express 36/36. F1/F2: el backend no cambió (manifiesto v4 intacto); sus suites no se reejecutaron.

**No ejecutado:** compilación del proyecto Godot (`TwoSides.csproj`) con estos dos archivos; los compilan los proyectos de prueba `net8.0` con las mismas fuentes.

## 6. Garantías sobre las operaciones pendientes [H, por prueba]

- Nunca se cambian `operation_id`, `payload_hash`, `canonical_envelope`, `source_key`, `created_at_utc`, `type`, `origin` ni dependencias (el trigger `sync_outbox_immutable` lo impediría; la huella lo confirma).
- Ninguna pasa a `permanent_failure` por cuota; ninguna se borra ni se compacta.
- Solo cambia `next_attempt_ms` (pausa) y, en las que llegaron al servidor, `state`/`attempts`/`last_error_code` como en cualquier reintento.
- Las confirmadas no se modifican (`sync_confirmed_immutable`).
- El orden (`created_at, operation_id`) y la regla «padre confirmado» siguen siendo los de siempre. **No se implementó prioridad de despacho** (no estaba demostrada su seguridad respecto a dependencias).

## 7. Riesgos residuales

1. **Tras subir la cuota, el cliente espera.** La pausa persiste (hasta 6 h en el peor caso). Nada en el juego llama aún a `ResumeAfterQuotaChange()`; el hook (arranque, versión de servidor o botón) es un paso futuro.
2. **Nivel de pausa solo en memoria.** Tras un reinicio y expirar la pausa, vuelve a empezar en 15 min (el coste es una sonda de 1 operación).
3. **`DeferForQuota` también aplaza** operaciones que estaban en retroceso por red; se reintentan al terminar la pausa.
4. **La cuota sigue en 1000** y no distingue tipos: con la cola de B53 (2151 + 1), 1151 intervalos quedarían pausados y las decisiones **nuevas** también. Esta etapa evita la tormenta de reintentos, no el bloqueo.
5. **Cuota de conteo contra Mongo/Atlas no probada** (solo el valor de 2 MiB del almacén en memoria y el servidor falso).
6. El caso «`duplicate` no limpia la sonda» se probó de forma débil (comprobación tolerante); la lógica es `newCommit` solo con `status=="committed"`.
7. La pasada de bloqueo hace una consulta SQLite local cada ~15 s (despreciable).
8. Mi primera ejecución de esta suite falló por errores míos de prueba (fase `terminal`, sobrecargas, índice de argumentos); se corrigieron y no cuentan como resultados.

## 8. Reversión

1. Restaurar los dos archivos desde `%LOCALAPPDATA%\TwoSidesClientBackups\pre-B54-20261103\` (hashes `57301129…` y `454197E8…`). Los datos no necesitan migración: lo único escrito por el nuevo código en SQLite son `next_attempt_ms` futuros y el texto `quota_exceeded` en `last_error_code`.
2. Si hay operaciones con pausa activa y se revierte, el binario antiguo las ve como `retryable_failure`/`pending` con fecha futura y las reintenta cuando llegue; para adelantarlas basta restaurar el cliente nuevo y llamar a `ReleaseQuotaPause`, o esperar.
3. Borrar `sync-f54-tests/` (no afecta al producto).

## 9. Pasos mínimos para una futura ampliación de cuota

1. Decidir el valor (B53: 3000 provisional) y cambiar el valor por defecto de `maxRecords` en `backend/src/modules/sync/ingestion-engine.js:23` (el constructor admite hasta 10 000), con pruebas del servidor.
2. Nuevo manifiesto v5 antes de arrancar el backend principal; no arrancar con el v4.
3. Validar contra Atlas sintético con autorización aparte (latencia con ≥ 2000 hechos, F3.10).
4. Liberar a los clientes bloqueados: cablear `ResumeAfterQuotaChange()` (o esperar el fin de la pausa).
5. Reanudación automática: sonda de 1 operación, luego lotes normales (5 → 8).

## 10. Integridad

| Elemento | Resultado |
|---|---|
| SQLite real `save.sqlite3` | `9FE793A2…070C`, sin cambios |
| Copia B52 | `9FE793A2…070C`, sin cambios |
| Base heredada | `5EA5CA05…`, sin cambios |
| Bases sintéticas restantes | 0 |
| Manifiesto v4 | `ok`, 3169 archivos, 0 diferencias |
| Procesos node/Godot/caddy al terminar | 0; sin conexión a puerto 27017 |
| `backend/src`, `scripts`, `tests`, `project.godot`, `TwoSides.csproj`, `integration` | sin cambios por esta etapa |
