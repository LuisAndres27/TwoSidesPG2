# B46 — Resultado de la validación real F1 + F2 contra Atlas (campaña sintética)

Fecha: 2026-11-03 (00:07–00:38 hora local, Guatemala). Cerrada con la etapa G.

- runId `ca49569e-7df6-420d-9ce7-91caf2af20ca`
- operationId `aae75e11-2c85-425d-9baf-26f0913bfc4e`
- receiptId `48599428-2bc3-415d-bd45-cbd6501066e3`
- Carpeta `%LOCALAPPDATA%\TwoSidesSyntheticRun\run-20261103-000729` (fuera de OneDrive)
- Controlador B43 `sync-test-staged.ps1` SHA-256 `2F0275B2…6DA1`; envoltorio de inspección `D4860B70…7577`; lanzador de verificación `8A751B0B…C9A5`.
- Manifiesto v4 `7DEC55E3…3E8B`, treeDigest `aea04105…e27e`; huella JWT `811cd75b…9d8aec`.

**Conclusión:** la operación sintética se confirmó (HTTP 200 `committed`), el reenvío idéntico devolvió `duplicate` con el mismo receiptId, `receipts/query` la encontró (`found`) y los deltas finales fueron exactamente los esperados. Las colecciones históricas no cambiaron.

## 1. Resultados por etapa

| Etapa | Hora local | Resultado |
|---|---|---|
| A (local) | 00:07 | ok, 9/9 comprobaciones (material, configuración, manifiesto, preflight, ACL, escáner de secretos, sin servidores, CA no instalada, respaldos). Sin conexión a Atlas. |
| B (lectura) | 00:20 | ok. Línea base de las 14 colecciones igual a la esperada; sin colecciones extra. |
| C (3 escrituras) | 00:23 | ok. health 200 · registro **201** (847 ms) · sesión ok (`logins` 1) · lote **200** `committed` (1530 ms), un solo envío (`priorAttempt false`), bytes de `batch.json` (`96E87B73…`). |
| D (lectura + reenvío) | 00:26 | ok. Verificación previa `consistent`, `persisted true`; reenvío HTTP 200 (3451 ms), `duplicate`, `sameReceiptId true`. |
| E (consulta + deltas) | 00:29 | ok. `receipts/query` **found** (3441 ms), `sameReceiptId true`; `deltasOk true`, veredicto `consistent`. |
| G (limpieza) | 00:37 | ok. `secretsWiped true`, `absenceVerified true`, `temporariesLeft 0`, sin procesos ni listeners, CA no instalada. |

## 2. Commit e idempotencia
El lote se envió una vez; la respuesta fue `committed`. La verificación directa de D (antes del reenvío) ya mostraba la operación persistida (operations 1, facts 1 dentro del delta) y, tras reenviar los mismos bytes con el mismo operationId, el servidor respondió `duplicate` con el mismo receiptId. No se generaron identificadores nuevos ni se creó otra operación.

## 3. Conteos y deltas (main_v2 y colecciones históricas)

| Colección | Antes (B) | Después (E) | Delta |
|---|---|---|---|
| identities | 1 | 2 | +1 |
| ownerGuards | 1 | 2 | +1 |
| identitySessions | 1 | 2 | +1 |
| operations | 1 | 2 | +1 |
| facts | 1 | 2 | +1 |
| fences | 2 | 3 | +1 |
| revocations | 0 | 0 | 0 |
| users / decisions / gameevents / gameprogresses / statisticevents / statisticsummaries / syncidentities | 2 / 7 / 13 / 2 / 14 / 2 / 1 | 2 / 7 / 13 / 2 / 14 / 2 / 1 | 0 |

Sin duplicados: el delta de operations y facts es exactamente +1. Las escrituras de control de `receipts/query` no añadieron documentos de jugador (no aparecen en los conteos).

**Verificación de fences:** la línea base de Atlas registraba 2 documentos en `main_v2_fences`. La comprobación final de la etapa E confirmó 3 documentos, equivalente a un incremento neto de +1. Durante D se mostró el valor 1 en una verificación intermedia, pero no se determinó de manera concluyente qué representaba ese valor. Por tanto, no se utiliza para interpretar el conteo total ni la procedencia de los documentos.

## 4. Seguridad del transporte
Cliente HTTP del controlador: `Invoke-WebRequest` de PowerShell 5.1, URL fija `https://localhost:8443`, TLS 1.2, lista blanca de métodos/rutas, validación por el almacén de Windows; sin ninguna desactivación de TLS en los scripts. `Invoke-WebRequest` no comprueba revocación (.NET Framework), por lo que `CRYPT_E_NO_REVOCATION_CHECK` solo afecta a `curl.exe` (SChannel) porque el certificado de servidor no tiene CRL/AIA; la comprobación manual usó `--ssl-no-revoke`. Caddy rechaza `Host` distinto de `localhost` (421).

## 5. Cierre de servicios y CA
- Caddy (PID 9372) y Express (PID 17920) detenidos por el propietario mediante `Stop-Process`: **terminación forzada** de Express (no apagado ordenado con Ctrl+C).
- Sin listeners en 3000, 3001 y 8443; sin procesos node/caddy/Godot; 0 conexiones al puerto 27017.
- CA temporal (`F2BF0E8D…D412A7`) retirada con `certutil -user -delstore Root` por el propietario; 44 certificados raíz y sin coincidencias en CurrentUser ni LocalMachine.

## 6. Limpieza DPAPI (etapa G)
`secrets.dpapi` sobrescrito y eliminado; sin temporales propios; ausencia verificada. Es borrado lógico (sobrescritura + eliminación): **no garantiza el borrado físico irrecuperable**. Se conservan `run-ids.json` (`06CBD4A9…`), `batch.json` (`96E87B73…`), `receipts-query.json` (`EA19D672…`) y `stage-state.json` (`F2AAC70A…`, A–E y G en ok).

## 7. Verificación final de integridad
Manifiesto v4 ok (3169 archivos, 0 diferencias); `src/`, `scripts/`, `tests/` sin cambios; ejecuciones anteriores (`bbaa257d…` y `run-20261102-110352`) con los mismos hashes; los 4 respaldos verificados (0 discrepancias); no se borró ningún documento de Atlas ni respaldo.

## 8. Riesgos residuales
1. SCRAM-SHA-1 sigue abierto como mecanismo de autenticación con Atlas.
2. Express se detuvo por la fuerza: no se probó el apagado ordenado en esta campaña.
3. Los documentos sintéticos (de esta campaña y de las de ensayo previas) permanecen en Atlas; no se borran automáticamente.
4. El borrado de secretos es solo lógico.
5. Certificado de servidor vence el 2026-11-16 y la CA el 2026-12-02; hay que regenerarlos antes de otra prueba real.
6. H1 (timeout del cliente frente al presupuesto del lote) sigue pendiente para F3.
7. El registro de inspección local no tiene firma; la procedencia se apoya en autorización de un solo uso, identidad, marca de tiempo y lanzadores fijados por hash.
8. B00 sigue abierto. La campaña probó F1+F2 con una sola operación `session.report`, no un volumen real.

## 9. Próximos pasos
- **F3:** decidir el alcance (H1: coordinar el timeout del cliente con el presupuesto de 2000 ms) y autorizarlo por separado; no se implementó.
- **Godot:** integrar el cliente de sincronización con el backend sobre HTTPS local de prueba, empezando por un flujo sin datos reales, sin tocar SQLite hasta que F3 esté definido.
- Decidir si se limpian los documentos sintéticos de Atlas (requiere autorización explícita y un procedimiento de limpieza controlado).
- Pendiente de decisión: si se repite la prueba con apagado ordenado de Express (Ctrl+C) para cubrir el riesgo 2.
