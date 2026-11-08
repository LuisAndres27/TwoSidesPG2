# B31 — Plan de verificación de solo lectura de la operación sintética existente (Etapa 33)

Fecha: 2026-11-02. **Solo análisis y preparación offline.** No se conectó Atlas, no se arrancó Express ni Caddy, no se instaló ningún certificado, no se creó sesión ni se reenvió el lote, no se ejecutó Godot ni se tocó SQLite, no se tocaron las colecciones históricas, no se modificó el código del backend, claves, contraseñas, ACL ni el manifiesto (integridad `ok`, 3 168 archivos); sin commits ni `push`. Estado local: 0 procesos `node`/`caddy`, puertos 3000/8443/2019/80/443 libres, `CurrentUser\Root` = 44 certificados.

## 1. Qué hay que demostrar y qué NO sirve

El 503 del batch es compatible con un commit correcto (B30 §7). Para afirmar «persistida y con recibo» hay que **leer los documentos por identificador**. Tres caminos y su idoneidad:

| Camino | ¿Solo lectura? | Veredicto |
|---|---|---|
| `POST /api/v2/sync/receipts/query` | **No**: `findReceipts` pasa por `transaction()` → incrementa `ownerGuards.revision` y el fence del propietario; además exige token (sesión nueva = documento nuevo) | Descartado sin autorización de escritura |
| Reenviar el batch | No (idem) y puede volver a dar 503 por el límite de 2 s | Solo para idempotencia (§5) |
| **Lectura directa de Mongo por `_id`/identificador** con la misma identidad `twosides_backend`, mismo conector estricto que la inspección | **Sí** (`find` con proyección; ninguna escritura, ni sesión, ni HTTP) | **Recomendado** |

## 2. Qué se leerá (7 consultas acotadas a la cuenta T = `5e05a972-98ef-447a-9579-ba4d0e20a4b8`)

Colección · filtro (una sola clave, igualdad) · proyección (nunca `credentialVerifier` ni `tokenHash`):

| Colección | Filtro | Se comprueba |
|---|---|---|
| `main_v2_identities` | `registrationId = c9d001ca-…` | 1 documento; `_id = T`; binding installation/localPlayer del run; `bindingGeneration 1`; `active`, `linked`, `role player` |
| `main_v2_ownerGuards` | `_id = T` | 1 documento; `revision` (esperada **2**: sesión +1, sync +1) |
| `main_v2_identitySessions` | `technicalAccountId = T` | 1 documento, `revoked false` |
| `main_v2_operations` | `technicalAccountId = T` | **exactamente 1**; `_id = T:64ad5b53-…`; `scope`; `record.receipt.acceptedAs = committed`; `receipt.operationId/technicalAccountId/installationId/localPlayerId/bindingGeneration` coinciden; `receipt.payloadHash` = `payloadHash` del lote y `record.payloadHash`; `receiptId` UUID v4 y `committedAtUtc` ISO; `dependencies []`; `authorizationDecision {owner T, revision ≥ 1}` (esperada 2) |
| `main_v2_facts` | `scope = T:installationId:localPlayerId:1` | **exactamente 1**; `sourceKey = session:e4d2dd99-…:open`; `_id = scope|sourceKey` = `record.factKey` de la operación; `factDigest` = el del `run-ids.json`; `type session.report` |
| `main_v2_fences` | `_id = ingestion-v1:T` | existe, `revision` entero ≥ 1 (esperada 1 tras un único commit) |
| `main_v2_revocations` | `technicalAccountId = T` | 0 (solo `_id`) |

Se compara además con los ficheros locales (`batch.json`, `run-ids.json`): `payloadHash`, `factDigest`, `sourceKey`, `operationId`. Veredicto: `consistent` (20 comprobaciones, todas verdaderas) o `inconsistent` con la lista de comprobaciones falladas. `revisionsConsistentWithOneCommit` (guardián 2, fence 1, decisión de autorización 2) es **informativo**: distingue «un solo commit» de «commit + reenvíos»; no es criterio de aprobado/suspenso.

No se leen: colecciones históricas, documentos de otras cuentas, la semilla, `main_v2_authorization`. No se hace `listCollections`, `count`, `aggregate` ni ningún comando salvo `connectionStatus` (verificación de permisos, igual que la inspección).

## 3. Herramienta preparada (fuera de `src/`, sin cambios de código del backend)

Plantillas en `docs/main-sync-test/` (a copiar fuera del proyecto; fuera del inventario de integridad):
- `verify-synthetic-run.mjs.template`: función pura `verifySyntheticRun` + `guardedReader` (lista blanca de colecciones/filtros/proyecciones, máx. 5 filas) + ejecutor de un solo uso que **reutiliza** (importa, no modifica) `inspectionConnector`, `assertInspectionConnection`, `verifyInspectionPermissions`, la autorización de inspección (≤ 60 min, un solo uso, marcador `<executionId>.verification.json`) y el canal de contraseña por stdin.
- `run-verify-synthetic.ps1.template`: lanzador con `-Enable`, prompt oculto, entorno vacío, sin secretos en argumentos.

Pruebas offline (`tests/sync/main-sync-verification-plan.test.js`, VF01–VF05, 5/5; suite completa 742 + 9, 0 fallos): caso consistente; cada discrepancia detectada (lote abortado, `duplicate`, hash distinto, segunda operación, hecho ausente/otro digest, sesión revocada, revocaciones); el lector rechaza colecciones históricas, operadores, filtros ajenos y proyecciones con secretos; ninguna palabra de escritura ni HTTP en la plantilla; el ejecutor se niega sin la bandera, con stdin TTY o con argumentos relativos/ajenos.

Salida esperada (sin secretos): `syntheticRunVerification: finished`, `writes: 0`, `verdict: consistent`, `counts {identities 1, ownerGuards 1, identitySessions 1, operations 1, facts 1, fences 1, revocations 0}`, `receipt {acceptedAs: committed, receiptId, committedAtUtc, payloadHash}`, `guardRevision 2`, `fenceRevision 1`.

## 4. Procedimiento operativo (requiere tu autorización explícita para conectar Atlas)

Sin Express, sin Caddy, sin CA, sin sesión nueva; una sola contraseña oculta.
1. Claude: copia las plantillas a `%LOCALAPPDATA%\TwoSidesSyntheticRun\` (`verify.mjs`, `run-verify-synthetic.ps1`) y genera una autorización nueva: `node scripts\new-main-inspection-authorization.js "%LOCALAPPDATA%\TwoSidesInspection" rotated-backend` (sin red; nueva `executionId`).
2. Propietario (terminal normal):
   ```powershell
   cd "$env:LOCALAPPDATA\TwoSidesSyntheticRun"
   .\run-verify-synthetic.ps1 -Enable `
     -Authorization "<ruta de la autorización nueva>" `
     -RunDir "$env:LOCALAPPDATA\TwoSidesSyntheticRun\run-20261102-110352" `
     -Account 5e05a972-98ef-447a-9579-ba4d0e20a4b8 `
     -Verifier "$env:LOCALAPPDATA\TwoSidesSyntheticRun\verify.mjs"
   ```
   Escribe la contraseña en el prompt oculto y pega la salida.
3. Claude: interpreta el veredicto, actualiza B30 y comprueba el estado local (procesos, puertos, certificados).

Si el veredicto es `inconsistent`, se documenta cada comprobación fallida y **no se escribe nada** (sin reintentos ni correcciones).

## 5. Idempotencia (no verificable solo con lecturas)

Probarla exige un **reenvío HTTP del mismo lote**, que: (a) necesita una **sesión nueva** (+1 documento en `identitySessions`, +1 `ownerGuards.revision`); (b) incrementa `ownerGuards.revision` y el fence del propietario aunque el resultado sea `duplicate`; (c) puede devolver **503 otra vez** por el límite de 2 s aunque el servidor lo haya procesado bien (`bounded`), por lo que la comprobación se haría **después con la lectura directa** de §2: el criterio de éxito sería `operations = 1`, `facts = 1`, mismo `receiptId`/`committedAtUtc` que antes del reenvío, y `guardRevision`/`fenceRevision` incrementados (guardián +2 con la sesión nueva; fence +1) sin nuevos documentos en `operations`/`facts`/`fences`. Requiere Express, Caddy y CA otra vez (3 contraseñas/avisos de Windows) y una autorización explícita **distinta** (esta no la cubre). Orden recomendado: primero §4 (lectura); solo si es `consistent`, decidir si se quiere gastar esa segunda prueba. **Hasta entonces la idempotencia figura como «no comprobada»** (en B30 y en cualquier resumen).

Nota de diseño relevante (sin modificar código): con el presupuesto fijo de 2 000 ms por operación, la primera operación de una cuenta nueva desde este equipo puede devolver 503 pese a confirmarse; antes de la sincronización real desde Godot conviene medir esa latencia (inspección de solo lectura cronometrada) o decidir si el presupuesto debe ajustarse mediante un cambio de código que invalidaría el manifiesto (B20 §6).

## 6. Riesgos

- Mientras no se ejecute §4, que los seis documentos sean «los de este run» es una inferencia (conteos exactos tras una escritura conocida, sin otros escritores), no una prueba.
- La lectura directa usa la identidad `twosides_backend` (`readWrite`, B00); el control es que la herramienta solo implementa `find` por identificador (comprobado por VF03/VF04) y que cada ejecución necesita autorización firmada de un solo uso.
- El verificador se importa de `src/` (módulos de inspección) pero no los modifica; si `src/` cambiara, el manifiesto cambiaría y esta herramienta debería revisarse.
- SCRAM-SHA-1 negociado y B00 abierto.

## 7. Autorización pedida

Para ejecutar §4: **conexión de solo lectura a Atlas** (una vez, con `twosides_backend`) para leer por identificador los 7 conjuntos de documentos de T. No se pide nada más: ni escrituras, ni Express, ni CA, ni sesión nueva. La prueba de idempotencia (§5) se solicitará por separado, si procede.
