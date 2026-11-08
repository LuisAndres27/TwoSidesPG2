# B49 — F3.1: corrección mínima del cliente de sincronización (implementada y probada en local)

Fecha: 2026-11-03. **Solo cliente local.** No se modificó el backend Express (`backend/src`, `backend/scripts`, `backend/tests` sin cambios), no se conectó MongoDB Atlas, no se arrancó Express ni Caddy, no se instalaron certificados, no se ejecutó Godot, no se tocó ninguna base SQLite real ni credenciales, no se cambiaron cuotas del servidor, no hubo commits ni push. F3.2 **no** se ha iniciado.

Referencias: B46 (validación real F1+F2), B47 (diagnóstico), B48 (volumen y decisiones).

---

## 1. Resumen

| Decisión aprobada | Valor anterior | Valor nuevo | Dónde |
|---|---|---|---|
| Cadencia de observación (cierre de intervalo de un estado sin cambios) | 5 s | **30 s** | `LocalGameplayObserver.HeartbeatMs` |
| Tiempo de espera HTTP | 10 s | **15 s** | `SyncHttpOptions.DefaultRequestTimeout` |
| Lote inicial | 25 | **5** | `SyncOutboxDispatcher` (parámetro `batchSize`) |
| Lote máximo | 100 (opción `MaxBatchOperations` 25) | **8** (rechazado > 8 en todas las entradas) | `SyncHttpOptions.MaxBatchOperationsLimit`, dispatcher |
| Lease de la reserva en la Outbox | 30 s | **60 s** | `SyncOutboxService.DefaultLease` |
| Cuota del servidor | 1000 | **1000 (sin cambio, a propósito)** | — |
| Identidad | cuenta técnica Sync v2 | **sin cambio** (solo para pruebas locales; `main_api_url` sigue sin definirse, la sincronización sigue desactivada por defecto) | — |

Efecto esperado (B48, estimación no medida): ≈ 720 → ≈ 120 intervalos por hora de aplicación abierta.

Resultado de pruebas: **679 comprobaciones locales correctas, 0 fallos** (línea base antes de cambiar: 671) + 43 de la biblioteca SQLite + 14 pruebas nuevas del cliente de sincronización sin servidor.

---

## 2. Protección del progreso (análisis previo a modificar `LocalGameplayObserver.cs`)

Conclusión: **cambiar la cadencia no modifica la semántica funcional del juego**, por eso se implementó. Evidencia (código leído, y pruebas que lo confirman):

1. **Decisiones ambientales.** `RecordDecisionAsync` → `GameSaveService.RecordDecision` es una transacción SQLite inmediata (`LocalGameState.cs:280`, `GamePersistenceAdapter.cs:148-151`). No pasa por el observador ni depende de ningún intervalo.
2. **Fin de segmento / bioma.** `CompleteBiomeAsync` → `GameSaveService.CompleteBiome` es igualmente inmediata y ocurre **antes** de `Telemetry.CompletionConfirmed` (`AnimalSegmentFlow.cs:338`). La prueba nueva *«a completed biome is durable in SQLite at once…»* lo demuestra: el bioma figura `completed` antes de que el observador haga nada, y el evento `ANIMAL_SEGMENT_COMPLETED` se persiste sin esperar un latido. La prueba existente de `--biome-completion` confirma además que un fallo de telemetría no deshace el progreso.
3. **Pausa, minimizar, cierre.** Todo cambio de estado confirma el intervalo abierto **en ese instante** (`Change` → `Flush`): pausa (`Paused`), pérdida de foco (`NotificationApplicationFocusOut` → `Observe(…,focused:false)`), muerte, reinicio, carga y salida. El cierre normal (`QuitAsync` → `CloseAsync`) hace `Flush` y encola `SESSION_ENDED`. El latido solo cierra subintervalos de un estado que **no cambia**. Prueba nueva: *«focus loss minimize pause and normal close confirm the open interval immediately, with no heartbeat needed»* (todos los tiempos < 30 s y el tiempo efectivo exacto).
4. **Tiempo efectivo.** Solo `ActiveAnimal` suma tiempo efectivo; Menu, Paused, Background, GameOver y Loading **no** lo suman (ya estaba así, no se cambió). Esos estados siguen registrándose como tiempo *observado* para la cobertura de la sesión (semántica previa de B04.2). Prueba nueva: *«menu pause and background heartbeats are observed time but never effective time»* (efectivo = 300 ms, pausa = 30,1 s, observado total = 90,5 s).
5. **Sin operaciones repetitivas nuevas.** No se añadió ningún tipo de hecho ni evento: sólo disminuye la frecuencia del latido. Un intervalo sigue siendo inmutable e idempotente por `intervalId`. No hay longitud máxima de intervalo en el esquema (`GameplayEventSchema`: solo `end_ms>=start_ms`) ni en el servidor.
6. **Orden y reintentos.** Se conserva el orden FIFO («intervalos anteriores antes del evento que termina el run») y el reintento tras escritura fallida sigue siendo de 5 s (constante aparte `RetryDelayMs`). Prueba nueva: *«pending telemetry survives a failing store…»* (mismos identificadores, sin pérdida).
7. **Outbox.** El proyector de la Outbox (`LocalOutboxPump`) no se tocó: lee el estado ya guardado. Las operaciones pendientes no se pierden por el cambio (las pruebas `--outbox*`, `--reconciliation` y el apagado ordenado pasan).

**Único efecto real:** tras una muerte inesperada del proceso (corte de energía, `kill`), la ventana de tiempo no confirmado del estado actual pasa de ≤ 5 s a ≤ 30 s. Esa pérdida **ya se declara** como cobertura incompleta (`interrupted`, sesión con duración desconocida): no se inventa tiempo. Requiere que el propietario acepte esa ventana (B48 §8, G1).

Los intervalos ya almacenados con 5 s en SQLite no se tocan ni se migran; conviven con los nuevos.

---

## 3. Archivos modificados (hashes SHA-256)

Respaldo previo: `%LOCALAPPDATA%\TwoSidesClientBackups\pre-F3.1-20261103\` (96 archivos, fuera de OneDrive, con `SHA256SUMS.txt` = `BCD8B180E56F43FC8FB1E2304C6B25F614887FA0E05836A03AE371DAD0F29BBD`; verificado idéntico al origen antes de editar).

| Archivo | Cambio | Antes | Ahora |
|---|---|---|---|
| `integration/sqlite/LocalGameplayObserver.cs` | constantes `HeartbeatMs=30_000`, `RetryDelayMs=5_000`; el latido y el reintento las usan (+7/−2 líneas) | `E8B92EDD…1075FF` | `5B918E3C…E4254` |
| `local-persistence/sync-http/SyncHttpTransport.cs.txt` | `DefaultRequestTimeout=15 s`, `InitialBatchOperations=5`, `MaxBatchOperationsLimit=8`; `MaxBatchOperations` por defecto 8 y validado 1–8 (+8/−3) | `404B4B9F…C627E3` | `E92741D1…B93B` |
| `local-persistence/sync-http/SyncOutboxDispatcher.cs.txt` | lote inicial 5, tope 8, adaptativo (ver §4); validación; medición con reloj inyectable (+33/−7) | `FECB0EDE…6366` | `454197E8…D681` |
| `local-persistence/src/SyncOutboxService.cs.txt` | `DefaultLease=60 s` (+4/−1; se conservan los finales de línea mixtos del archivo) | `65D70FFA…EDE2E` | `57301129…6CB1` |
| `local-persistence/game-save-tests/GameplayObserverChecks.cs.txt` | 5 casos existentes ajustados a 30 s + 6 casos nuevos (+38/−5) | `22E62C64…2692` | `A289E7B5…DB54` |
| `local-persistence/game-save-tests/OutboxChecks.cs.txt` | 3 casos con vencimiento 30/31 s → 60/61 s + 2 casos nuevos (+15/−4) | `FE4EF2FB…FFB4` | `87464DBA…39E4` |

Archivos **nuevos** (proyecto de pruebas sin servidor): `local-persistence/sync-f31-tests/` → `SyncF31Checks.cs.txt` (`E83EB18F…38ED`), `Program.cs.txt` (`043FD465…FB0C`), `SyncF31.Checks.csproj` (`9A35F546…5D00`), `packages.lock.json` (`C02FE1B1…C9E7`, copia del de `sync-http-tests`; restauración en modo bloqueado y sin red).

No se modificó ningún otro archivo de `local-persistence/` ni de `integration/` (comprobado por hash contra el respaldo). `project.godot` figuraba ya como modificado antes de esta tarea y no se tocó.

---

## 4. Lote adaptativo (justificación y reglas)

Un lote fijo de 8 es el borde: a 0,7 s/operación caben (5,6 s), a 1,5 s/operación no (12 s > 10 s, tope del servidor; el servidor deja el resto `deferred`, seguro pero ineficiente). Por eso el lote **empieza en 5** y se ajusta solo con lo medido, sin salir de 1–8:

- **Crece +1** solo si el lote estaba *lleno*, **todas** sus operaciones se confirmaron/reconciliaron y el tiempo proyectado del tamaño siguiente cabe en **6 s** (`TargetBatchMs`).
- **Se reduce −1** (mínimo 1) si la petición del lote da *timeout*, respuesta 5xx/503, respuesta no válida o tarda **≥ 8 s** (`SlowBatchMs`).
- **No cambia** por errores de red genéricos, cuota (`quota_exceeded`), rechazos ni lotes vacíos.

No toca identificadores, cargas, orden de la Outbox ni las reglas del lease; solo cuántas operaciones viajan juntas. Los umbrales (6 s / 8 s) se basan en el modelo de B34/B38 y **no están medidos en Atlas**: se confirmarán en F3.10.

Compatibilidad del tope: `SyncHttpOptions` y el dispatcher rechazan > 8 (y < 1) con `INVALID_SYNC_HTTP_OPTIONS` / `INVALID_SYNC_BATCH`. `SyncWorkerLifecycle` crea el dispatcher con valores por defecto, por lo que hereda 5/8 sin cambios.

---

## 5. Pruebas

Entorno: .NET SDK 10 con el kit de referencia de `net8.0` ya presente en `local-persistence/.work/packages`; compilación `--no-restore` y ejecutables autocontenidos `win-x64` (mismas variables de entorno que `run-checks.ps1`). El proyecto nuevo se restauró en modo bloqueado desde la caché local, sin red. Todas las bases son SQLite sintéticas desechables del sandbox (`SyntheticSandbox`): ninguna partida real, `0` ficheros sobrantes al terminar.

### 5.1 Regresión del cliente local (`GameSave.Checks`)
| Modo | Antes | Después |
|---|---|---|
| `--outbox` | 64 | **66** (+2 de lease) |
| `--outbox-bounded-close` / `--outbox-shutdown-recovery` / `--outbox-activation` | 26 / 24 / 28 | 26 / 24 / 28 |
| `--reconciliation` | 51 | 51 |
| `--biome-completion` / `--biome-selection` / `--decisions` | 54 / 30 / 30 | 54 / 30 / 30 |
| `--gameplay-events` / `--activity-statistics` / `--local-statistics` / `--statistics-screen` | 41 / 23 / 39 / 24 | 41 / 23 / 39 / 24 |
| `--game-over-navigation` / `--animal-restart` / `--menu-return` / `--animal-entry` | 19 / 21 / 11 / 29 | 19 / 21 / 11 / 29 |
| `--local-finals` | 126 | 126 |
| `--gameplay-observer` | 31 | **37** (+6 de F3.1) |
| **Total** | **671** | **679** (0 fallos, todos `EXIT 0`) |

La biblioteca SQLite base (`TwoSides.LocalPersistence.Checks`): **43 correctas, 0 fallos**.

Las únicas pruebas existentes que hubo que tocar son las que codificaban un valor antiguo: 4 casos del observador (latido de 5 s; en la ejecución intermedia falló el de menú/estadísticas y se corrigió) y 3 casos de la Outbox (vencimiento de lease a 30/31 s; fallaron al cambiar el valor y se actualizaron a 60/61 s). No se debilitó ninguna aserción: se cambiaron las constantes y los tiempos esperados en proporción.

### 5.2 Pruebas nuevas sin servidor (`sync-f31-tests`, 14 correctas)
Un servidor Sync v2 falso en proceso (`HttpMessageHandler`) y SQLite sintética; sin Express, sin Caddy, sin red.

| Requisito de la tarea | Prueba |
|---|---|
| Cadencia de 30 s | *constants* (`HeartbeatMs`), *no interval before 30 s and exactly one at 30 s*, *heartbeat every thirty seconds* (observador) |
| Estados excluidos no cuentan como efectivo | *menu pause and background … never effective time* |
| Persistencia inmediata de decisiones críticas | *a completed biome is durable in SQLite at once…* |
| Cierre normal / minimizar / pausa | *focus loss minimize pause and normal close confirm … immediately* |
| Conservación de operaciones pendientes ante errores | *pending telemetry survives…*, *errors never delete or renumber pending operations*, *a 503 … keeps every operation retryable*, *a timeout keeps the operation* |
| Timeout de 15 s | *defaults* (propiedad) y *the effective request deadline is 15 s* (espera real: ≈ 15 s medidos en el rango 14,5–18 s) |
| Lotes de 5 y límite de 8 | *first pass sends exactly 5*, *a fast server grows 5-6-7-8 and never beyond 8*, *slow server stays at 5*, *batch slower than 8 s shrinks … never below 1*, *limits … refused at every entry point* |
| Lease de 60 s | *outbox reserves with 60 s lease and keeps it through a 45 s pass*; (`--outbox`) *default lease is 60 seconds: alive at 30 s and 59 s, expired exactly at 60 s* y *a slow pass (45 s) can still confirm* |
| Ausencia de reintentos que generen identificadores nuevos | *a timeout … retry reuses the same identifiers*, *response lost AFTER commit is reconciled … never sent twice* (una sola confirmación por operación, consulta por los mismos ids), *only captured ids ever sent* |
| Compatibilidad Sync v2 | *wire shapes are unchanged* (campos de registro, sesión, lote y operación; solo rutas `/api/v2`), *technical identity created once and reused* |

### 5.3 Lo que no se ejecutó y por qué
- **`sync-http-tests` (188 comprobaciones contra el Express `offline-test`)**: **no se ejecutó**, porque arranca un proceso Express en bucle local y la tarea prohíbe iniciar Express. Se **compiló** (0 errores) para comprobar que los cambios no rompen su API, y se revisó a mano: sus fixtures usan ≤ 4 operaciones por prueba, pasan sus propios tiempos de espera y avanzan el reloj en minutos, por lo que no dependen del lote 25 ni del lease de 30 s. **Se ejecutará en F3.2** (con autorización).
- **Compilación en Godot**: no se ejecutó Godot ni el compilador de `TwoSides.csproj`. `LocalGameplayObserver.cs` y los archivos del cliente se compilan sin motor en los proyectos de pruebas (0 advertencias, 0 errores), pero la compilación dentro de Godot queda por confirmar al abrir el proyecto.
- **Pruebas del backend (`npm test`)**: no se ejecutaron ni eran necesarias: el backend no cambió (manifiesto v4 `verify` ok, 3169 archivos, 0 diferencias; archivo `7DEC55E3…3E8B` sin cambios).

---

## 6. Compatibilidad con Sync v2 y con F1/F2

- Contrato `/api/v2/*` intacto: mismas rutas, campos y códigos (probado por forma de los cuerpos de registro, sesión, lote y operación). Misma gestión de recibos: una operación se confirma únicamente con un recibo que coincide exactamente.
- Identificadores estables: `operationId`, `payloadHash`, `canonicalEnvelope` no cambian en los reintentos (pruebas). Un reintento obtiene un lease nuevo (`leaseId`, `attempt+1`), exactamente como antes; `batchId` es nuevo por pasada y el servidor solo lo devuelve como eco.
- Reconciliación: una operación con `attempt>1` se consulta primero en `receipts/query`; si el servidor ya la confirmó (respuesta perdida) no se reenvía.
- F1 y F2 (backend): sin cambios. Con lote ≤ 8 y 14 viajes por operación, un lote queda dentro del presupuesto de 10 s del servidor y del tiempo de espera de 15 s del cliente (B48 §5).
- Identidad: sin cambios en `SyncSessionManager` ni en el almacén DPAPI; sigue siendo la cuenta técnica por instalación, solo para pruebas locales.

---

## 7. Manifiesto v4

Los archivos modificados están **fuera** de `backend/` y no forman parte del inventario del manifiesto v4. Verificado después de todos los cambios: `backend-integrity.js verify` → `ok`, `expectedFiles 3169`, `added 0 / removed 0 / modified 0`; `src/`, `scripts/` y `tests/` del backend sin cambios. **No se generó ni se sustituyó ningún manifiesto.** Si una etapa posterior (F3.3, F3.4…) modifica `backend/src`, deberá generarse y validarse el manifiesto v5 con el procedimiento autorizado antes de usar el backend protegido; F3.1 no lo exige.

---

## 8. Riesgos pendientes

1. **Ventana de pérdida tras muerte del proceso: ≤ 30 s** del estado actual (antes 5 s); decisión del propietario, ya aceptada en la instrucción de F3.1. Reportada como cobertura incompleta, nunca inventada.
2. **Los umbrales del lote adaptativo (6 s / 8 s) son del modelo, no medidos en Atlas.** Si Atlas es más lento, el lote bajará solo; si más rápido, subirá hasta 8.
3. **Cuota de 1000 sin cambio:** con 30 s caben los escenarios bajo (≈ 155) y medio (≈ 404) de B48 y no el alto (≈ 2233, estimación). Sigue pendiente el estado «sincronización detenida por cuota» (F3.3) y medir el coste por operación con historial largo.
4. **La suite `sync-http-tests` no se ha ejecutado** con los nuevos valores (necesita Express); se ejecutará en F3.2.
5. **No se ha probado dentro de Godot** (compilación y ejecución del cliente en el motor).
6. **Importación inicial de historial:** el proyector sigue insertando todo lo ya almacenado como `historical_import` al activar la sincronización; una base con mucho historial seguirá consumiendo cuota (los intervalos antiguos de 5 s existentes no se reducen).
7. Menos intervalos no reducen el número de **cambios de estado** (B48: dominan en el escenario alto).
8. El proyecto `sync-f31-tests` usa un servidor falso: valida el cliente y el contrato de forma, **no** reemplaza la prueba de contrato contra el Express real (F3.2).
9. Persisten los riesgos de B47/B48 no tratados aquí (apagado ordenado, calentamiento continuo, SCRAM-SHA-1, ajustes de backend compartido, brecha RNF-006/RF-035).

---

## 9. Reversión

Respaldo íntegro de los directorios `local-persistence/{src,sync-http,sync-http-tests,game-save-tests,tests}` e `integration/sqlite` y de los archivos de configuración en `%LOCALAPPDATA%\TwoSidesClientBackups\pre-F3.1-20261103\` (`SHA256SUMS.txt` incluido).

1. Restaurar los 6 archivos modificados desde el respaldo:
   `robocopy "<respaldo>\integration\sqlite" "<proyecto>\integration\sqlite" LocalGameplayObserver.cs`
   y análogo para `local-persistence\src\SyncOutboxService.cs.txt`, `local-persistence\sync-http\{SyncHttpTransport,SyncOutboxDispatcher}.cs.txt`, `local-persistence\game-save-tests\{GameplayObserverChecks,OutboxChecks}.cs.txt`.
2. Eliminar la carpeta `local-persistence/sync-f31-tests/` (y, si se desea, `local-persistence/.work/{bin,obj}/SyncF31.Checks`).
3. Comprobar los hashes contra `SHA256SUMS.txt` y reejecutar `--outbox` y `--gameplay-observer` (deben dar 64 y 31).
No hay migración de datos ni de esquema que deshacer: las filas ya escritas (intervalos de 5 s o 30 s, operaciones de la Outbox) son válidas con cualquiera de las dos configuraciones.

---

## 10. Condiciones para comenzar F3.2

F3.2 = prueba de contrato del cliente real contra el backend con F2 (H14), sin Atlas. Requiere, con autorización expresa:
1. Permiso para **ejecutar el Express `offline-test`** en bucle local (lo que hoy está prohibido) para correr `sync-http-tests` (188 comprobaciones) con los valores nuevos, y para añadir los casos de contrato (503 con `results`, operaciones «no iniciadas», `duplicate`, recibo con fecha ISO).
2. Ninguna conexión a Atlas; bases sintéticas; sin certificados.
3. Aprobación de este informe (en particular la ventana de 30 s y el lote adaptativo).
4. Si F3.2 incluye `HttpClient` + CA de pruebas (H4), permiso aparte para Caddy y la CA.
