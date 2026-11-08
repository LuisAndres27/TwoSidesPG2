# B35 — Auditoría del estado actual de F1 (solo lectura)

Fecha: 2026-11-02, ~13:35. **Auditoría de solo lectura:** no se modificó `src/`, `scripts/`, `tests/`, el manifiesto ni ningún respaldo; no se corrigió nada; no se inició ninguna suite (la suite que estaba activa terminó por sí sola y se leyó su resultado después); no se conectó Atlas; no se arrancó Express ni Caddy; no se ejecutó Godot; no se instaló ningún certificado; sin commits ni `push`. Este documento es el único archivo creado.

## 1. Resumen ejecutivo

- F1 (B33 §5.1) está **implementada en el código y verificada offline**, con una salvedad de diseño (la lectura de la semilla no se cachea) y **sin cerrar la Fase 4**: no hay manifiesto v3, no se escribió B34 y solo hay **una** suite completa verde posterior a la última corrección (se pedían dos).
- Alcance respetado: 2 archivos de `src/` modificados + 1 archivo nuevo, exactamente los de B33 §5.1; `scripts/` intacto.
- Reducción de viajes (modelo offline, no Atlas): primer envío **34 → 21 en frío / 14 en caliente**; reenvío idéntico **26 → 9 en caliente**.
- La instrucción duplicada **no causó cambios repetidos ni inconsistencias** (un solo respaldo, una sola secuencia de ediciones).
- Con el código actual **el manifiesto v2 ya no coincide** (1 añadido, 2 modificados): el preflight con el ancla antigua rechaza el árbol, como debe; hasta crear y verificar v3 el backend no puede arrancarse con la guardia.
- **Veredicto: PARCIAL.**

## 2. Estado exacto de F1 frente a B33 §5.1

| Componente | Estado | Evidencia |
|---|---|---|
| Módulo nuevo `deployment-check.js` (caché `{verifiedAt, generation}`, TTL ≤ 30 s con tope forzado, un solo vuelo, invalidación, descarta verificaciones en curso invalidadas, `watchConnection`, `keepWarm`) | **Hecho** | U1–U5 |
| Caché de verificación de despliegue (primario + índices) en ingesta | **Hecho** | T1, T2, T7, T8 |
| TTL máximo 30 s | **Hecho** (el constructor rechaza > 30 000 ms) | U1 |
| Una verificación compartida entre solicitudes concurrentes | **Hecho** | T2, U2 |
| Invalidación ante errores de almacenamiento | **Hecho** (cualquier error de driver o `storage_unavailable` 503) | T6 |
| Invalidación ante eventos de conexión / cambio de primario | **Hecho** (`close`, `disconnected`, `reconnected`, `error`, `serverDescriptionChanged`, `topologyDescriptionChanged`) | U4 (con emisores simulados) |
| Invalidación explícita | **Hecho** (`invalidateDeploymentCheck()`) | uso en pruebas |
| Limpieza al cerrar el ámbito | **Hecho por evento `close` de la conexión** (quita oyentes e invalida); además cada operación ejecuta las aserciones de ámbito/conexión sin caché | U4 |
| Memoización de cuenta y sesión **solo dentro de cada intento de transacción** | **Hecho** (se descarta al terminar o reintentar; se vacía con cada escritura a `identities`/`identitySessions`) | T10 |
| Registro, sesión y revocación con verificación en vivo | **Hecho** (opción `deployment:'live'` por defecto; solo la ingesta usa `'cached'`) | T9 |
| Guardián, decisión de autorización, JWT, cuotas, lecturas de idempotencia, escrituras y commit sin reutilizar entre transacciones | **Hecho** (no se tocaron) | T4, T5, T15–T18 |
| Semilla `ingestion-v1` cacheada (B33 §5.2) | **NO cacheada — desviación deliberada y más estricta** | ver abajo |
| Calentamiento al arrancar / `keepWarm` activado | **NO activado** (opción presente, desactivada por defecto) | U5, U6 |

**Desviación sobre la semilla.** Una primera versión cacheaba la lectura de `ingestion-v1`. El test existente `SC01` (coste idéntico con 0, 126 y 378 registros ajenos) falló de forma determinista en dos suites completas (773 + 9 aprobadas, 1 fallo cada vez) porque la primera ejecución (en frío) leía una vez más que las siguientes. No se modificó el test: se revirtió ese punto (la lectura de la semilla vuelve a hacerse dentro de cada transacción, como antes). Consecuencia: +1 viaje (13 → 14, justo el objetivo) y detección inmediata de la pérdida de la semilla.

**Lo que falta de F1 (no hecho):**
1. **Calentamiento al arrancar y/o `keepWarm`**: exigen tocar `src/main/profile.js` (fuera de §5.1) o activar `keepWarmMs`. Sin ello, la primera operación tras el arranque y cualquier operación tras > 30 s de inactividad pagan la verificación en vivo (frío, 21 viajes). Es el principal límite práctico de F1 tal como está.
2. Fase 4 (manifiesto v3), informe B34, segunda suite completa verde, segundo paso de escáner de secretos y legacy.

## 3. Archivos creados y modificados

**`src/` (alcance autorizado):**

| Archivo | Acción | SHA-256 antes → después (16 primeros hex) | Líneas |
|---|---|---|---|
| `src/modules/sync/deployment-check.js` | **creado** | — → `09BCCB754C183F15` | 61 |
| `src/modules/sync/mongo-ingestion-repository.js` | modificado | `E890632773A40388` → `E0BB2E4C6CF286EF` | 196 |
| `src/modules/auth/mongo-identity-repository.js` | modificado | `F9BA9B35676C4862` → `D949F96BA384AF6E` | 213 |

`scripts/`: 47 archivos, **ninguna diferencia** con el respaldo. Resto de `src/`: 68 archivos idénticos al respaldo (71 ahora, 70 antes).

**Cambios de comportamiento públicos añadidos (neutros):** opción de constructor `deployment {ttlMs, now, keepWarmMs}`; métodos `assertDeploymentBoundary()`, `verifyDeploymentIo()`, `warmDeploymentCheck()`, `invalidateDeploymentCheck()`, opción `transaction(work, {deployment})`. `verifyDeployment()` conserva su comportamiento en vivo. No se cambiaron contratos, endpoints, JWT, el límite de 2 000 ms, `ingestion-engine`, `ingestion-service`, `budget`, rutas, middleware ni configuración de conexión.

**Pruebas y soporte creados hoy (todos nuevos; ningún test preexistente del proyecto fue modificado):** `tests/sync/main-f1-optimization.test.js` (25 pruebas: T1–T19 + U1–U6), `tests/sync/support/latency-harness.js`, `tests/sync/support/f1-differential.js`, `tests/sync/support/f1-golden.json` (485 KB, normalizado, sin secretos: búsqueda de `argon2/tokenHash/credential/password/BEGIN` sin resultados). `tests/sync/main-batch-latency-model.test.js` es **mío** (B32/B33) y se reescribió porque sus aserciones fijaban el conteo pre-F1 (34/26) por diseño; sus helpers pasaron a `support/`.
**Docs:** B30–B33 y las plantillas de `docs/main-sync-test/` (etapas previas); este B35.

**Artefactos fuera del proyecto:** `%LOCALAPPDATA%\TwoSidesBackendBackups\pre-F1-20261102` (respaldo); `%TEMP%\f1-golden` (copia temporal del código anterior con una unión a `node_modules`, usada para generar el *golden*; **aún existe**, sin secretos, pendiente de borrar con tu permiso). Sin `.vitest`, sin archivos sueltos en el proyecto.

## 4. Respaldo

`%LOCALAPPDATA%\TwoSidesBackendBackups\pre-F1-20261102`: `src\` (70 archivos) + `scripts\` (47) + `SHA256SUMS.txt` (117 líneas; SHA-256 del propio fichero `2B00F9AD…61DC`). Carpeta única, propietario `luis2`, DACL heredada (SYSTEM, Administradores, `luis2`), fuera de OneDrive. Verificación de creación: 0 diferencias entre originales y copia. **Re-verificación hoy: 117 de 117 archivos coinciden con `SHA256SUMS.txt` (0 discrepancias).** Ningún respaldo existente se tocó (no había otros en esa carpeta).

## 5. Manifiesto de integridad

| Comprobación | Resultado |
|---|---|
| Manifiesto actual (v2) | intacto: `backend-integrity-manifest.json` SHA-256 `C855A3EE…8C6B` (igual que antes del respaldo); sigue el v1 histórico |
| `backend-integrity verify` con el código actual | **`failed`, `tree_differs`**: añadido `src/modules/sync/deployment-check.js`; modificados `mongo-identity-repository.js` y `mongo-ingestion-repository.js`; 0 eliminados; 0 problemas (los 3168 archivos esperados menos esos cambios coinciden) |
| Ancla antigua (`126a6cee…e433`) | **rechaza el código modificado**: `main-preflight` → `integrity_tree_differs` (el resto de comprobaciones: id de clave, anclas, clave y huella JWT, bien) |
| Manifiesto **v3** | **no existe** (no creado, no verificado) |
| Ancla nueva aceptando el código autorizado | **no comprobable todavía** (requiere v3) |

Consecuencia: **con el árbol actual el lanzador con guardia de integridad no arrancaría** el backend (por diseño). Mientras no se cree v3 con tu autorización, no hay arranque posible.

## 6. Resultados de las pruebas (solo lo disponible)

| Ejecución | Resultado |
|---|---|
| Suite completa #1 y #2 (antes de revertir la caché de la semilla) | **773 aprobadas + 1 fallo (`SC01`) + 16 omitidas** (790) en las dos; grupo de aislamiento: 9 aprobadas + 1 omitida. `SU03`: no falló en ninguna |
| Corrección (revertir caché de la semilla) → ejecución dirigida `main-f1-optimization` + `main-batch-latency-model` + `ingestion-scalability` | 40 aprobadas + 1 omitida, 0 fallos; **`SC01` vuelve a pasar sin modificarlo** |
| **Suite completa posterior a la última corrección (la única)** | **774 aprobadas, 0 fallidas, 16 omitidas** (790; 53 archivos aprobados + 1 omitido); grupo de aislamiento 9 + 1 omitida; salida 0. Incluye `SC01` ✔ y `main-f1-optimization` (25 pruebas) ✔ |
| ¿Dos suites completas exitosas tras la última corrección? | **NO: solo una.** La segunda no se lanzó porque la auditoría lo prohíbe |
| ¿Hay una suite activa ahora? | **No**: terminó (código 0). Procesos `node`/`caddy` = 0 |
| `SU03` (inestable C.2) | sin incidencias en las tres suites de F1; el fallo puntual de etapas anteriores no se reprodujo |
| Legacy (39 pruebas) y escáner de secretos | **no re-ejecutados** desde los cambios de F1 (último estado conocido: legacy 39/39 y escáner `clean` antes de F1) |

**T1–T19 (todas aprobadas dentro de la suite completa):** T1 viajes (≤16 / ≤10) · T2 un solo vuelo · T3 envíos idénticos concurrentes (3 contendientes: 1 `committed` + 2 `duplicate`; 6: los perdedores `deferred`, igual que el código anterior —medido—, un único efecto y convergen al mismo recibo) · T4 revocación concurrente (nunca una operación confirmada tras la revocación ni ACK sin fila) · T5 revocación inmediata con caché fresca · T6 errores parciales (antes de escribir, *rollback*, commit desconocido → invalidación y verificación en vivo; conflicto transitorio sin invalidación) · T7 caducidad (índice ausente tras el TTL ⇒ 503, sin escrituras) · T8 dentro del TTL sigue idempotente por `_id` · T9 registro/sesión/revocación en vivo · T10 memoización por intento · T11–T14 aislamiento entre identidades (colisión de `operationId`, recibos ajenos, revocación de A sin afectar a B, la caché no contiene datos de identidad) · T15–T17 consistencia de recibos · T18 guardián y fence avanzan +1 por transacción, semilla nunca escrita · **T19 diferencial: los 63 vectores C# enviados dos veces producen EXACTAMENTE las mismas respuestas normalizadas y filas almacenadas que el código pre-F1** (golden generado ejecutando el respaldo, en composición de pruebas y de producción). U1–U6 unitarias del módulo.

## 7. Reducción de viajes (modelo offline: 1 llamada a la base = 1 viaje; **no es una medición contra Atlas**)

| Escenario (composición de producción) | Antes de F1 | Después de F1 | Objetivo |
|---|---|---|---|
| Primer envío **en frío** (caché vacía / caducada) | 34 | **21** | — |
| Operación nueva con caché **caliente** | 34 | **14** | ≈ 14 |
| Reenvío idéntico con caché caliente | 26 | **9** | ≈ 8 |

Desglose en frío: 8 viajes de verificación en vivo (2 `hello` + 5 `listIndexes`…) que en caliente desaparecen; la validación de identidad baja de 15 lecturas a 2 (1 cuenta + 1 sesión) en ambos casos. Barrido de latencia en caliente (versión intermedia con 13 viajes; indicativo): responde 200 hasta ≈ 130 ms por viaje (1 768 ms), 503 con commit a 150–160 ms, *rollback* a 200 ms; frontera ≈ 140 ms frente a ≈ 55 ms antes. Con la latencia real medida (hello 49.5 ms) la estimación es ≈ 0.7–0.8 s en caliente y ≈ 1.0–1.2 s en frío (**no medido**; falta telemetría real de transacciones).

## 8. Seguridad y compatibilidad

| Propiedad | Demostrado por pruebas | Requiere verificación adicional |
|---|---|---|
| Aislamiento entre identidades | T11–T14 | con Atlas real |
| Autorización por transacción | T4, T5, T10, T13 (guardián/`coordinate` intactos) | aislamiento *snapshot* y conflicto de escritura reales de MongoDB (el doble los imita; no los prueba) |
| Validación JWT | no se tocó; suites existentes (774) verdes | — |
| Protección contra duplicados / idempotencia | T3, T8, T15, T16, T19 | reenvío real contra Atlas (B31 §5) |
| Manejo de commit incierto | T6 + M13–M15 existentes | comportamiento del driver real |
| Invalidación de caché y TTL ≤ 30 s | T6, T7, U1–U4 | eventos reales del driver (`serverDescriptionChanged` solo probado con emisores simulados) |
| Verificaciones en vivo (registro, sesión, revocación) | T9 | — |

Riesgos residuales: (1) **frío frecuente en producción** si no se activa calentamiento/`keepWarm`; (2) la invalidación ante `storage_unavailable` incluye los 503 por presupuesto: una operación lenta provoca verificación en vivo en la siguiente (posible bucle bajo latencia alta; F2/F3 lo tratan); (3) F1 **no corrige el 503 falso** ni el límite de 2 s; (4) ventana de deriva de despliegue ≤ 30 s en la ruta de ingesta; (5) el razonamiento de las lecturas memoizadas se apoya en el CAS del guardián (existente) y en la semántica *snapshot* de MongoDB; (6) con más de 3 contendientes el doble devuelve `deferred` (igual que antes).

## 9. Entorno (solo lectura, ahora)

Procesos `node`: 0 · `caddy`: 0 · escuchas 3000/8443/2019/80/443: 0 · conexiones a 27017: solo `MongoDBCompass` (tu aplicación; ningún proceso del proyecto) · `CurrentUser\Root`: 44 certificados, 0 de «Two Sides» · integridad: `failed/tree_differs` por los cambios autorizados (§5) · escáner de secretos: no re-ejecutado (último resultado conocido `clean`; los archivos nuevos de F1 no se han escaneado, aunque sí se buscó texto sensible en el *golden*).

## 10. Consecuencias de haber enviado dos veces la instrucción

El segundo mensaje llegó **durante** la ejecución, tras el respaldo y el inicio de la implementación; se interpretó como la misma autorización y no se repitió ningún paso. Verificado: **un único respaldo** (una carpeta, 117 archivos); **un único conjunto de cambios** en `src/` (los 3 archivos, sin duplicados ni archivos paralelos); sin artefactos sueltos; sin segunda copia del módulo. Lo único «repetido» fueron ejecuciones de suites: las dos pedidas (que fallaron por `SC01`, causa real encontrada y corregida) y la posterior a la corrección. No hubo inconsistencias derivadas.

## 11. Tareas pendientes, por prioridad

1. **Decisión tuya:** calentamiento al arrancar y/o `keepWarm` (cambio en `src/main/profile.js` o activar `keepWarmMs`), fuera del alcance de §5.1; sin ello F1 aporta poco en tráfico espaciado.
2. Segunda suite completa posterior a la corrección (+ legacy 39 y escáner de secretos) para cumplir «dos suites verdes».
3. Fase 4: manifiesto v3 conforme a B33 §5.5 (conservar el actual, verificar que detecta los cambios, ancla antigua rechaza —ya evidenciado—, ancla nueva acepta, hashes y diferencias, sin secretos, tu aprobación del *diff*).
4. Redactar `B34_F1_OPTIMIZATION_IMPLEMENTATION_RESULT.md` con hashes, respaldo, T1–T19, viajes y estado de v3.
5. Borrar `%TEMP%\f1-golden` (con tu permiso).
6. Después: arranque con guardia (solo `/api/health`), verificación de solo lectura B31, y autorización aparte para la prueba real de idempotencia. F2 y F3 solo con aprobación.

## 12. Veredicto final: **PARCIAL**

Razonamiento: el código de F1 está completo en lo aprobado y su comportamiento se demostró offline (T1–T19, diferencial de 63 vectores, 774 aprobadas y 0 fallos en la última suite completa, `SC01` sin modificar), y el alcance se respetó. No es COMPLETADA porque faltan elementos que la autorización exigía: segunda suite completa, Fase 4 (manifiesto v3 verificado), B34, y escáner/legacy tras los cambios; y porque el calentamiento sigue sin conectarse, lo que limita el beneficio real. No es BLOQUEADA: no hay fallos abiertos ni condición que impida continuar; solo requiere tus decisiones (puntos 1 y 3).
