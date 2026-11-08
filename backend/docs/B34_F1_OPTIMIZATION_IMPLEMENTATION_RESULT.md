# B34 — Resultado de la implementación de F1 (COMPLETADA, verificada offline)

Fecha: 2026-11-02. **Veredicto: COMPLETADA.** F1 (B33 §5.1) y el calentamiento inicial autorizado están implementados, probados con dos suites completas verdes sobre la misma versión final, y la nueva línea base de integridad (manifiesto v3) está creada, verificada y promovida. **No se conectó Atlas, no se arrancó Express ni Caddy, no se ejecutó Godot, no se tocó SQLite, no se instalaron certificados, no hubo F2/F3, no hubo commits ni push, no se modificó el límite de 2000 ms.** B00 sigue abierto.

## 1. Resumen ejecutivo

- F1 elimina viajes redundantes a MongoDB sin cambiar autorización, recibos, transacciones ni idempotencia: caché de la verificación de despliegue (TTL ≤ 30 s, una sola verificación compartida, invalidación por error/eventos) y memoización de cuenta/sesión **dentro** de cada intento de transacción.
- Nuevo en esta fase: **calentamiento al arrancar** en `src/main/profile.js`, antes de que exista el *bundle* y por tanto antes de que Express pueda anunciar disponibilidad.
- Modelo offline de viajes (1 llamada = 1 viaje; **no son tiempos de Atlas**): 34 → 21 (frío) / 14 (caliente); reenvío 26 → 9.
- Dos suites completas consecutivas: 792 aprobadas, 0 fallidas, 17 omitidas, salida 0, cada una; legacy 39/39.

## 2. Archivos

| Archivo | Acción | SHA-256 (16 hex) antes → después |
|---|---|---|
| `src/modules/sync/deployment-check.js` | creado | → `09BCCB754C183F15` |
| `src/modules/sync/mongo-ingestion-repository.js` | modificado | `E890632773A40388` → `E0BB2E4C6CF286EF` |
| `src/modules/auth/mongo-identity-repository.js` | modificado | `F9BA9B35676C4862` → `D949F96BA384AF6E` |
| `src/main/profile.js` | modificado (calentamiento) | `3A710C3F7F74BD77` → `0563EAA73D8CA00C` |

`scripts/` es idéntico al respaldo; `package.json`, `package-lock.json` y dependencias sin cambios. Tests creados (nuevos): `main-f1-optimization.test.js` (25), `main-f1-warmup.test.js` (9), soportes `latency-harness.js`, `f1-differential.js`, `f1-golden.json`; planes `main-sync-write-plan`, `main-sync-verification-plan`, `main-latency-probe-plan`; `main-batch-latency-model.test.js` reescrito (mío, B32). **Ningún test preexistente del proyecto fue modificado.**

## 3. Calentamiento inicial (`profile.js`)

Tras `inspectMainSchema` y la creación de ambos repositorios, antes de `registerMainRepository` y del *bundle*:
1. `ingestionRepository.warmDeploymentCheck()` (primario escribible + índices únicos de operaciones y hechos).
2. `identityRepository.transaction(async()=>{}, {deployment:'cached'})`: transacción vacía que rellena la caché de identidad (índices + `hello`) sin leer ni escribir documentos.

Propiedades verificadas (W1–W9): usa la misma conexión (sin conexiones nuevas); si cualquier paso falla, el `catch` existente cierra el ámbito y la conexión y el arranque se rechaza con `MainError` (`startMainBackend` no llega a `createBackend`/`listen`); sin temporizadores (`setInterval` no se invoca); TTL sin cambios (30 s; pasados 31 s la siguiente ingesta vuelve a verificar en vivo y luego queda en caché); la caché no guarda datos de identidades; un primario perdido tras el calentamiento sigue detectándose (invalidación → 503 cerrado, sin escrituras); registro, sesión y revocación siguen en vivo. `keepWarm` periódico **no** está activado. Se eligió la transacción vacía para no tocar `mongo-identity-repository.js`; un método de calentamiento explícito sería más limpio (anotado para F2/F3).

**Limitación tras inactividad:** pasados 30 s sin ingesta, la caché caduca y la siguiente operación paga la verificación completa (+7 viajes: 2 `hello` y 5 lecturas de índices). El calentamiento solo cubre el arranque.

## 4. Suites completas (versión final idéntica)

Última modificación de `src/` y `tests/`: 13:37; ambas suites arrancaron después y ningún archivo de `src/`/`scripts/` cambió desde entonces (comprobado por fecha y por el `verify` del manifiesto).

| Ejecución | Entorno | Aprobadas | Fallidas | Omitidas | Salida |
|---|---|---|---|---|---|
| Intentos 1 y 2 (NO válidos) | sin `C2_FINAL_TEST_ROOT` | 789 | 3 | 17 | 1 |
| **Suite A** | `C2_FINAL_TEST_ROOT` = carpeta desechable propia | **792** | **0** | **17** | **0** |
| **Suite B** | ídem | **792** | **0** | **17** | **0** |

Los intentos 1 y 2 fallaron por el mismo motivo ajeno al código: AC03, FR05 y FR06 exigen la variable `C2_FINAL_TEST_ROOT` (raíz desechable) y yo no la definí al lanzar; se documentan, no se ocultan, y no cuentan como evidencia. En A y B (`%LOCALAPPDATA%\TwoSides\C2ReceiverTests-f1`) pasan. `npm test` incluye legacy: **39/39**, 0 fallos. SU03 no falló en ninguna. 56 archivos pasan + 1 omitido (57).

## 5. Seguridad y compatibilidad

- Escáner de secretos: `clean`, 0 hallazgos (antes y después del manifiesto).
- ACL: carpeta de secretos `conforming`; carpeta de integridad `conforming` (SYSTEM, Administradores, `luis2`; 0 fallos), incluidos los tres manifiestos.
- Clave JWT, huella y key id: sin cambios (`811cd75b…9d8aec`, `main-2026-11`).
- Contratos, endpoints, JWT, idempotencia y límite de 2000 ms: sin cambios (diferencial T19 y suites existentes verdes; el diff de `src/` se limita a las 4 rutas de §2).
- Procesos: 0 `node`/`caddy` tras las pruebas; puertos 3000/8443 libres.

## 6. Diferencial de 63 vectores (T19)

Los 63 vectores C# enviados dos veces producen exactamente las mismas respuestas y filas normalizadas que el código pre-F1 (golden generado ejecutando el respaldo). Pasa en la versión final. T1–T19 y U1–U6 (25) y W1–W9 (9) pasan.

## 7. Viajes (modelo offline, versión final)

| Escenario | Antes | Después |
|---|---|---|
| Primer envío en frío (caché vacía) | 34 | 21 |
| Operación nueva con caché caliente | 34 | 14 |
| Reenvío idéntico con caché caliente | 26 | 9 |

Con el calentamiento, la primera operación tras arrancar cae en el caso «caliente» (14) mientras no pasen 30 s. Son recuentos de llamadas sobre un doble de Mongo, **no tiempos reales de Atlas**; a 49,5 ms de `hello` el mínimo físico estimado es del orden de 0,7 s para 14 viajes, sin medir.

## 8. Respaldo pre-F1

`%LOCALAPPDATA%\TwoSidesBackendBackups\pre-F1-20261102`: 117/117 archivos coinciden con `SHA256SUMS.txt` (verificado antes de modificar `profile.js` y no tocado). Diferencias respecto del respaldo: solo los 4 archivos de §2. Respaldos antiguos no tocados.

## 9. Manifiesto v3

| Dato | Valor |
|---|---|
| **`treeDigest` v3** | `d1c9cd6c5f66ab4401e938e0c17f698025ddded8060e17d7268a093ef86b0813` |
| **SHA-256 del archivo v3** | `9EE7446C473324068D58D7C3DDF2CF89215A024896D5B914BA1A23525F932614` (430 192 B, 3 169 archivos) |
| v2 conservado | `backend-integrity-manifest.v2-20261102.json`, SHA-256 `C855A3EEE948A82BC69C90D88FD85C3CF45C41554423CBABAE16C5FF6CED8C6B`, tree `126a6cee…e433` |
| v1 conservado | `backend-integrity-manifest.v1-20261101.json`, `5E22C975…07DEE0` |

Procedimiento B33 §5.5 / B21: candidato con creación exclusiva → `verify` del candidato `ok` (0 diferencias) → preflight con ancla **nueva** `ok`; con ancla **antigua** `integrity_anchor_mismatch`; el manifiesto v2 contra el árbol modificado `integrity_tree_differs` (1 añadido, 3 modificados) → promoción por dos renombrados, sin borrar nada → `verify` oficial `ok` (3 169, 0 diferencias) y preflight con el digest nuevo `ok`. El lanzador `run-main-backend.ps1` no se modificó. **Acción del propietario:** anotar fuera del equipo el digest v3 (`d1c9cd6c…0813`) y pasarlo como `-ExpectedTreeDigest`; el digest v2 ya no es ancla válida.

## 10. Riesgos residuales

- Caché fría tras >30 s de inactividad (+7 viajes); sin `keepWarm` (decisión de F3).
- Ventana de deriva de despliegue de hasta 30 s (índice/primario) en ingesta; mitigada por TTL, eventos e invalidación; la corrección de datos no depende de los índices secundarios (T8).
- Aislamiento *snapshot* y eventos reales del driver solo probados con dobles; sin prueba real de concurrencia.
- Idempotencia por reenvío real contra Atlas sin probar (requiere autorización aparte).
- Riesgo del mismo usuario del manifiesto (B15/B21) y B00 abierto.
- Los 3 tests C2 dependen de `C2_FINAL_TEST_ROOT`; conviene documentarlo en el procedimiento de pruebas.

## 11. Lo que F1 no resuelve

El 503 falso por «éxito tardío» tras el commit (F2); el presupuesto de 2000 ms y el cliente (F3); el coste de conexión en frío (~457 ms); la latencia real de transacciones snapshot/`w:majority`.

## 12. Condiciones para F2

Aprobación expresa del propietario y del alcance; respaldo nuevo de `src/`; diseño de semántica de commit/recibo para éxito tardío con pruebas primero (M13–M15 y reenvío tras 503); sin cambiar contratos sin acuerdo con el cliente C#; suite doble verde y nuevo manifiesto v4 tras cualquier cambio en `src/`; prueba real contra Atlas solo con autorización separada, tras arranque con solo `/api/health` y verificación B31 de solo lectura.

## 13. Limpieza

`%TEMP%\f1-golden` eliminado (autorizado): contenía una copia del código pre-F1 (ya en el respaldo) y dos scripts de generación; el golden necesario está en `tests/sync/support/f1-golden.json` y ningún test depende de la carpeta temporal. El *junction* a `node_modules` se retiró sin seguirlo (118 entradas intactas). Queda `%LOCALAPPDATA%\TwoSides\C2ReceiverTests-f1` (raíz desechable de las suites, vacía de secretos). B35 se conserva como fotografía previa al cierre (veredicto PARCIAL de entonces).
