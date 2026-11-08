# B37 — Resultado de la implementación de F2 (COMPLETADA offline; manifiesto v4 creado y verificado)

Fecha: 2026-11-02. **Veredicto final: COMPLETADA (offline).** F2 está implementada; las 26 pruebas nuevas, LP06 corregido y dos suites completas definitivas pasan, y el manifiesto v4 está creado y verificado. *(La primera versión de este informe, con veredicto PARCIAL por el fallo LP06, se conserva en las secciones 1-12; el cierre está en la sección 13.)* Sin Atlas, sin Express ni Caddy, sin Godot, sin SQLite, sin certificados, sin cambios en claves, F3 ni el límite de 2000 ms, sin commits ni push.

## 1. Diagnóstico original

Resumido de B36: el temporizador de 2000 ms de `bounded()` seguía armado durante el `commitTransaction` de `withTransaction`, que el plazo no podía cancelar. (A) A los 2000 ms rechazaba con 503 aunque el commit estuviera en vuelo y terminara confirmándose; (B) tras un éxito conocido, `.then(checkBudget)` lo convertía en 503; (C) un fallo tras iniciar el commit se trataba igual que un aborto; (D) el trabajo huérfano de A chocaba con la siguiente operación del lote (cascada). Demostrado en la fase roja (§4).

## 2. Archivos

| Archivo | Acción | SHA-256 (16 hex) antes → después |
|---|---|---|
| `src/modules/sync/budget.js` | modificado | `BE4A5C15D9D45685` → `1D056B64D98AF4D0` |
| `src/modules/sync/ingestion-service.js` | modificado | `94A49965C258C555` → `6C30D5A3F52577C0` |
| `src/modules/sync/mongo-ingestion-repository.js` | modificado | `E0BB2E4C6CF286EF` → `40ECA5BE1DF778FF` |
| `src/modules/sync/errors.js` | **no tocado** (no fue necesario) | `AA8509F697E3C04D` |

`scripts/` idéntico; sin dependencias nuevas. Pruebas **nuevas**: `tests/sync/main-f2-commit-gate.test.js` (`589263C55A01E6D0`) y `tests/sync/support/f2-faults.js` (`0DD5D6AFBC993D23`). Ninguna prueba preexistente ni `mongo-double.js` se modificó. Hash del árbol `src/`+`scripts/` (118 archivos) con el que corrieron ambas suites, idéntico antes y después: `d798968f84fe0e5b1420319d8965b82926785c53b18c8d2894bd7e956776ba29`.

## 3. Respaldo pre-F2

`%LOCALAPPDATA%\TwoSidesBackendBackups\pre-F2-20261102` (fuera de OneDrive): `src/` 71 + `scripts/` 47 = 118 archivos con `SHA256SUMS.txt`, 118/118 coinciden con el árbol de entonces. Antes de crearlo: manifiesto v3 `ok` (3169, 0 diferencias), ACL de secretos e integridad `conforming`, escáner limpio, 0 procesos `node`/`caddy`, puertos 3000/3001/8443 libres, respaldo pre-F1 117/117. Los respaldos pre-F1 y los manifiestos v1, v2 y v3 se conservan.

## 4. Fase roja (pruebas antes del código)

Sobre el código de F1 (sin F2), de 26 pruebas: 13 fallaron y 13 pasaron como guardas de no regresión. Fallos por el defecto real: T1 (503 con la fila persistida), T1b (igual con los 2000 ms reales y ack a 2,3 s), T2 (éxito tras el plazo convertido en 503), T4 (barrido), T11 (cascada), T12 (el lote seguía tras desconocido), T15 (aleatorias: `ack-past-budget` → 503), R1 (`receipts/query`); T19, T21, T22, S1 y S2 fallaban por API inexistente. Dos fallos iniciales (T1b/T19) eran un error de mi arnés (`budgets: undefined` activaba el valor reducido) y se corrigió el arnés antes de registrar la fase roja; S1 tenía una espera insuficiente en el propio test (corregida). Ningún fallo restante procedía del arnés.

## 5. Diseño implementado

- **`budget.js`:** estado de compuerta por señal (`WeakMap`). `beginAttempt(signal)` (vuelve a PRE en cada intento del callback), `commitPoint(signal)` (**síncrono**: `checkBudget` + marca «en commit»; sin `await`, así el temporizador no puede colarse), `noteTransactionFailure(signal, error)` (clasifica abortado/desconocido), `bounded(work, ms, {graceMs, hardDeadline})`. En PRE el temporizador de 2000 ms aborta y rechaza como siempre. **En commit el temporizador no rechaza**: espera el desenlace hasta `min(entrada + graceMs, finDelLote)` (sin suelo, D2); si se agota, resultado **desconocido** (503 `storage_unavailable`, `abort()` solo detiene una *repetición* del callback, no cancela el commit). Un commit confirmado devuelve su recibo aunque el plazo haya vencido (se elimina el `checkBudget` posterior solo cuando hubo compuerta; los almacenes sin compuerta conservan la comprobación anterior). La promesa del commit que sigue tras la gracia queda observada (`orphan*` contadores) y no genera rechazos no gestionados. `COMMIT_GRACE_MS = 3000`. Clasificación conservadora: tras la compuerta, todo fallo es *desconocido* salvo etiqueta `TransientTransactionError` sin `UnknownTransactionCommitResult`, o código 251 (`NoSuchTransaction`). El desenlace viaja en una propiedad **no enumerable** `commitOutcome` del error (D1: el código público y el cuerpo HTTP no cambian).
- **`mongo-ingestion-repository.js`:** `beginAttempt` al inicio de cada intento, `commitPoint` tras `beforeAuthorizationCommit()` (mismo callback para `acceptOperation` y `findReceipts`, por lo que **D4 queda cubierto**), `noteTransactionFailure` en el `catch`. La invalidación de la caché de F1 no cambia.
- **`ingestion-service.js`:** opción `commitGraceMs` (entero 1–3000, defecto 3000; `operationBudgetMs ≤ 2000` y `batchBudgetMs ≤ 10000` sin cambios), `hardDeadline` = fin del lote; si un resultado es **desconocido** las operaciones restantes no se inician y salen `deferred`/`storage_unavailable` con sus ids originales (D3); `receipts/query` usa la misma gracia.
- **Contadores (D5):** `commitStats()` / `resetCommitStats()`: `committed, lateCommitted, aborted, unknown, preDeadline, graceExpired, orphanSettledCommitted, orphanFailed`. Solo enteros en memoria; sin identificadores ni contenidos.

Garantías de la autorización §4: (1–2) el plazo de 2000 ms rige antes del commit y no se entra si venció (S1, T3); (3) el paso a «en commit» es atómico (S1); (4–5) commit confirmado ⇒ recibo, sin comprobación posterior (T1, T1b, T2); (6) desconocido ⇒ sin ACK (T6, T7, T8); (7) el timeout de gracia no se interpreta como aborto: queda etiquetado *desconocido* (S2); (8) promesa huérfana controlada, 0 rechazos no gestionados (T8, T15, S2); (9) el reenvío resuelve el recibo previo sin duplicar (T6, T8, T9, T10, T14, T15); (10) no se inician operaciones tras un desconocido (T12). Ninguna limitación del driver impidió estas garantías en el doble; el comportamiento real del `commitTransaction` de Atlas no se puede demostrar offline.

## 6. Resultados de las pruebas nuevas (26/26 aprobadas)

T1, T1b (ack a 2,3 s con los 2000 ms reales), T2, T3 (expiración previa: 0 filas, guardián/fence intactos), T4 (barrido 60–140 ms alrededor del plazo y 20–380 ms de ack: nunca ACK sin fila ni 503 con fila antes del commit; siempre `committed` si el ack cae en la gracia), T5 (abortado), T6 (desconocido aplicado → `duplicate` con el recibo original), T7 (desconocido no aplicado), T8 (cuelgue que aplica tras la gracia: 503 en < 880 ms, 1 fila, 0 rechazos no gestionados), T9 (reenvío con el original en vuelo: 1 `committed` + 1 `duplicate`, mismo recibo), T10 (respuesta perdida), T11 (cascada), T12 (desconocido en la operación 2 de 5: 3–5 no iniciadas, `ctl.calls = 2`, reconciliación `duplicate`+`committed`×4), T13 (repetición del driver: vuelve a PRE; tardía ⇒ 0 filas), T14 (409 y original intacto), **T15 (500 ejecuciones aleatorias con semilla 20261102, 8 clases de fallo: 0 ACK sin fila, 0 duplicados, 100 % de reenvíos convergen a 1 operación con 1 recibo)**, **T16 (barrido de latencia 14–24 ms/viaje a escala 1/5: nunca 503 con fila)**, T17 (**21 / 14 / 9 viajes**), T19 (2000/10000 y gracia ≤ 3000 sin cambios), T20 (revocación durante commit lento), T21 (contadores mínimos, contrato sin campos nuevos, sin temporizadores vivos), T22 (< 1 ms mediana, 0 viajes), R1/R2 (`receipts/query` tardío ⇒ resultados; desconocido ⇒ 503 reintentable), S1, S2. T18 (F1) se ejecutó dentro de las suites completas. Las latencias de 20–250 ms se barrieron a escala 1/5 (14–24 ms con presupuesto de 400 ms) para ejecutarse en tiempo real; T1b y T19 usan los valores reales.

## 7. Suites completas (versión final idéntica, `C2_FINAL_TEST_ROOT` = `%LOCALAPPDATA%\TwoSides\C2ReceiverTests-f2`, fuera de OneDrive)

| Ejecución | Legacy | Vitest aprobadas | Fallidas | Omitidas | Salida |
|---|---|---|---|---|---|
| Suite A | 39/39 | 817 | **1 (LP06)** | 17 | **1** |
| Suite B | 39/39 | 817 | **1 (LP06)** | 17 | **1** |

(817 = 792 de F1 − LP06 + 26 nuevas; las 3 pruebas C2 que exigen `C2_FINAL_TEST_ROOT` pasan.) Los fallos son idénticos y deterministas; no hay otras pruebas inestables.

## 8. El fallo LP06 (diagnóstico)

`tests/sync/main-local-https-plan.test.js` (LP06, de la etapa 30) lee el manifiesto **vigente** y exige `manifest.fileCount === 3168`. El manifiesto v3 creado al cerrar F1 tiene **3169** archivos (por `deployment-check.js`). **No lo causa F2**: F2 no añade ni quita archivos del inventario (sus pruebas nuevas están fuera de él) y el mismo fallo aparecería con el árbol de F1. No se detectó en F1 porque las suites de cierre se ejecutaron *antes* de crear v3. Es una constante obsoleta de una prueba preexistente. Por la regla de no modificar pruebas existentes para obtener verde **no se tocó**, y por la regla de detenerse ante una suite fallida **no se creó v4**. Propuesta (requiere autorización): cambiar solo `3168` → `3169` en esa línea (el recuento no cambia con v4); o, mejor, que la prueba derive el recuento del propio manifiesto. Las dos suites deberían repetirse tras ello.

## 9. Otras verificaciones

Escáner de secretos `clean` (0); ACL de secretos y de integridad `conforming`; `verify` del manifiesto v3 contra el árbol: `tree_differs` con **solo** los 3 archivos autorizados modificados (0 añadidos/eliminados); `scripts/` idéntico al respaldo; 0 procesos `node`/`caddy`. Compatibilidad con F1: T1–T19, U1–U6, W1–W9 y el diferencial de 63 vectores (golden sin regenerar) pasan en ambas suites; los viajes siguen en 21/14/9.

## 10. Estado del manifiesto

**v3 intacto** (SHA-256 `9EE7446C…2614`, `treeDigest d1c9cd6c…0813`). **v4 no creado.** El lanzador con guardia **no arrancaría** el backend con el árbol actual (esperado hasta crear v4). Pasos pendientes (B33 §5.5): tras resolver LP06 y repetir A y B en verde, candidato v4 con creación exclusiva, `verify`, preflight con ancla nueva ok y con la de v3 rechazada, promoción por renombrado conservando v3 con fecha, y anotación del digest v4 fuera del equipo por el propietario.

## 11. Riesgos pendientes

- Comportamiento real de `commitTransaction`/etiquetas de error/reintentos del driver y aislamiento *snapshot* en Atlas: solo con dobles.
- La gracia puede alargar una petición hasta +3 s por operación (acotada por el lote); con un enlace muy malo habrá *desconocidos* reales (503 seguros) y las operaciones restantes del lote quedarán `deferred`.
- La clasificación conservadora trata algunos abortos reales como desconocidos (solo implica reenviar).
- Caché fría tras >30 s de inactividad (F1) y presupuesto de 2000 ms antes del commit: 503 correctos (sin persistencia); se atienden en F3.
- El cliente C# no se modificó ni se verificó; se asume que reintenta `deferred` con los mismos ids.
- Mismo usuario del manifiesto (B15/B21); B00 abierto.

## 12. Condiciones para probar F2 contra Atlas real (autorización aparte)

Manifiesto v4 creado y verificado, ancla guardada por el propietario; arranque con guardia solo con `/api/health`; verificación de solo lectura B31 previa y posterior; un único lote sintético con ids nuevos y plan de parada ante discrepancia; prueba de idempotencia por reenvío del mismo cuerpo; contadores de `commitStats()` revisados; sin retardos inducidos (no son posibles en Atlas): el objetivo es confirmar que un lote lento ya no produce 503 con fila y que el reenvío devuelve `duplicate` con el mismo `receiptId`. Sin F3 hasta entonces.

---

## 13. CIERRE (autorización limitada para corregir LP06)

### 13.1 Fallo original y causa
LP06 (`tests/sync/main-local-https-plan.test.js`, etapa 30) exigía `manifest.fileCount === 3168`. El manifiesto v3 vigente tiene 3169. Constante histórica del manifiesto v2 (anterior a F1), no relacionada con F2.

### 13.2 Propiedad que LP06 pretende verificar y corrección aplicada
Propiedad: «esta etapa no añadió código cubierto: la línea base de integridad sigue correspondiendo a los archivos de los que depende el plan» (y que `docs/`/plantillas están fuera del inventario). Cambio exacto (sin tocar más expectativas):
1. `main-local-https-plan.test.js` (hash `FA93C6D0AF9C39A5` → `C6E473BCA399FDA2`): dos `import` nuevos (`computeManifest` y `inventoryProblems`); la línea `expect(manifest.fileCount).toBe(3168)` se sustituye por `expect(inventoryProblems(manifest, computeManifest(backendRoot, {exclude: manifest.excluded ?? []}))).toEqual([])`; el cierre de la prueba añade un tiempo límite de 30 s (el cálculo hashea el árbol real, ≈ 2,5 s). La comprobación de «ningún archivo local-https/.template en el inventario» se conserva intacta.
2. Nuevo `tests/sync/support/manifest-inventory.js` (`969AE9EAD062D268`): `inventoryProblems` exige (a) coherencia propia: `kind`, `algorithm`, exclusiones limitadas a las dos cachés de Vitest, ninguna ruta excluida listada, **digest recalculado a partir de sus propias entradas**, `fileCount` = número de entradas; (b) inventario igual al **árbol real** (mismo recuento, ningún archivo añadido ni eliminado, sin enlaces ni archivos especiales); (c) todo lo que está fuera de `src/` (scripts, `node_modules`, `package*.json`, `vitest.config.js`) idéntico byte a byte al manifiesto. Los cambios de contenido dentro de `src/` (trabajo autorizado entre dos líneas base) los detectan `backend-integrity.js verify` y el preflight, que son lo que invalida la línea base.
3. Nuevo `tests/sync/main-lp06-inventory-guard.test.js` (`6163EB6C1075623D`): G1–G8 sobre copias mutadas (nada en disco cambia).

### 13.3 Justificación de seguridad
La comprobación es **más estricta** que la anterior (que solo comparaba un número): un manifiesto no se acepta por declararse válido a sí mismo (G3: lista, recuento y digest forjados de forma coherente siguen fallando contra el árbol real); no depende de una constante que haya que editar en cada línea base; no se debilitó ninguna aserción. Se verificó que sigue fallando ante: manifiesto corrupto (G2), recuento obsoleto (G4, el 3168 antiguo), archivo añadido (G5) o eliminado (G6), modificación inesperada en `scripts/`, `node_modules/`, `package.json`, `package-lock.json` o `vitest.config.js` (G7), exclusiones no permitidas, enlaces/archivos especiales y `kind`/`algorithm` ajenos (G8). Una edición en `src/` es tolerada por LP06 (no por `verify`), lo que permite que LP06 pase con v3 mientras F2 modifica `src/`.

### 13.4 Prueba dirigida
`main-local-https-plan.test.js` + `main-lp06-inventory-guard.test.js`: 16/16 con el manifiesto v3 (LP06 incluido) y 16/16 con el v4.

### 13.5 Suites definitivas (secuenciales, misma versión final)
Árbol `src/`+`scripts/` (118 archivos): `d798968f84fe0e5b1420319d8965b82926785c53b18c8d2894bd7e956776ba29`, idéntico antes y después. `C2_FINAL_TEST_ROOT` = `%LOCALAPPDATA%\TwoSides\C2ReceiverTests-f2b` (fuera de OneDrive).

| Ejecución | Legacy | Vitest aprobadas | Fallidas | Omitidas | Salida |
|---|---|---|---|---|---|
| Suite C | 39/39 | 826 | 0 | 17 | 0 |
| Suite D | 39/39 | 826 | 0 | 17 | 0 |

(826 = 817 − 1 fallo anterior + 1 LP06 + 8 pruebas G.) Las ejecuciones A y B de §7 (LP06 fallido) no se consideran válidas. Ningún otro fallo ni prueba inestable.

### 13.6 Seguridad y compatibilidad
Escáner de secretos `clean` (0); ACL de secretos e integridad `conforming`; respaldo pre-F2 118/118 y pre-F1 117/117 coinciden; `scripts/` idéntico al respaldo; diferencias de `src/` solo en los 3 archivos autorizados (`errors.js` intacto); F1 compatible (T1–T19, U1–U6, W1–W9, diferencial de 63 vectores sin regenerar el golden; viajes 21/14/9); `operationBudgetMs` por defecto y tope 2000 (T19 y revisión de `ingestion-service.js`); rutas, esquemas, configuración y JWT sin cambios; 0 procesos `node`/`caddy`.

### 13.7 Manifiesto v4
Procedimiento B21/B33 §5.5: candidato con creación exclusiva → `verify` ok (3169, 0 diferencias) → preflight con ancla nueva ok → con la ancla de v3 `integrity_anchor_mismatch` → el manifiesto v3 contra el árbol de F2 `integrity_tree_differs` (0 añadidos, 0 eliminados, **3 modificados**: los autorizados) → promoción por dos renombrados (v3 conservado) → `verify` oficial ok y preflight ok. El inventario no cambió (3169): crear v4 no invalidó ninguna prueba y LP06 pasa con v4.

| Dato | Valor |
|---|---|
| **`treeDigest` v4** | `aea04105001d5ca324f817602e781cf5118789f9187c8424c204551ac800e27e` |
| **SHA-256 del manifiesto v4** | `7DEC55E3E1053F7F63A0D2B859ACB0A56FF931E82DB7BBB2625734326D6C3E8B` (430 193 B, 3169 archivos) |
| v3 conservado | `backend-integrity-manifest.v3-20261102.json`, SHA-256 `9EE7446C…2614`, tree `d1c9cd6c…0813` |
| v2 / v1 conservados | `…v2-20261102.json` (`C855A3EE…8C6B`), `…v1-20261101.json` (`5E22C975…07DEE0`) |
| Huella JWT | sin cambios `811cd75b…9d8aec` (`main-2026-11`) |

**Acción del propietario:** anotar el digest v4 fuera del equipo y usarlo como `-ExpectedTreeDigest`; los digests v3/v2 ya no son anclas válidas.

### 13.8 Riesgos pendientes
Los de §11 siguen vigentes (comportamiento real del commit en Atlas solo con dobles; gracia de hasta +3 s por operación; clasificación conservadora; caché fría y presupuesto previo al commit para F3; cliente C# no verificado; mismo usuario del manifiesto; B00 abierto). Adicional: LP06 tolera cambios de contenido en `src/` por diseño (los cubre `verify`/preflight), por lo que la prueba por sí sola no sustituye a la guardia de integridad.

### 13.9 Condiciones para probar F2 contra Atlas real
Las de §12, ahora con el manifiesto v4 ya creado: arranque con la guardia y el digest v4 anotado por el propietario, solo `/api/health`, verificación B31 de solo lectura antes y después, un único lote sintético con ids nuevos, prueba de idempotencia por reenvío, revisión de `commitStats()`, y autorización explícita aparte. Sin F3 hasta entonces.
