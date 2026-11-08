# B40 — Guiones por etapas para la prueba real F1+F2: creación y validación OFFLINE

Fecha: 2026-11-02. **No se conectó Atlas, no se hicieron lecturas remotas ni escrituras reales, no se arrancó Express ni Caddy, no se ejecutó Godot, no se instaló ningún certificado, no se tocó SQLite/Outbox, `src/`, `scripts/`, `tests/`, `package*.json`, manifiestos, anclas, claves ni respaldos, no se cambió ningún timeout, no hay F3, commits ni push.** Los archivos nuevos están solo en `backend/docs/main-sync-test/` (fuera del inventario de integridad): el manifiesto v4 sigue siendo válido sin regenerarlo.

## 1. Archivos creados

| Archivo (`docs/main-sync-test/`) | SHA-256 (16 hex) | Función |
|---|---|---|
| `sync-test-staged.ps1.template` (555 líneas) | `5865D772C257EBDE` | Controlador **por etapas** A–G de la prueba real (una etapa por invocación) |
| `build-second-op.mjs.template` (45) | `017D7863D13F6280` | Constructor offline de la **segunda** operación (solo para la etapa F, fuera de alcance); no envía nada |
| `fake-sync-server.mjs.template` (89) | `F2B190BAF2BF9D10` | **Doble de pruebas** `node:http` (no es Express) que imita el contrato público; solo para el autotest |
| `staged-selftest.ps1.template` (344) | `2262AE60BE54EED4` | Autotest offline: 117 comprobaciones sobre carpetas desechables, el doble y lanzadores falsos |

Las plantillas se copian fuera del proyecto antes de usarlas (como las de B29–B33). Reutilizan sin duplicar: `build-synthetic-run.mjs.template` (construcción y validación de la operación con el validador real), `new-main-inspection-authorization.js`, `run-main-inspection.ps1` (línea base) y `run-verify-synthetic.ps1`/`verify.mjs` (verificación de solo lectura por identificador), `backend-integrity.js`, `main-preflight.js`, `check-main-secrets-acl.ps1` y `scan-secrets.js`. **El guion nunca maneja la contraseña de Atlas:** la escribe el propietario en el prompt oculto de esos lanzadores existentes.

## 2. Diseño por etapas (cada invocación hace UNA etapa)

`.\sync-test-staged.ps1 -Stage <A|B|C|D|E|F|G> -RunDir <carpeta de build.mjs> -ConfirmPhrase AUTORIZO-ETAPA-<X>-<8 primeros caracteres del runId> …`

| Etapa | Contenido | Red |
|---|---|---|
| **A** | Material de la ejecución (ids v4 únicos, `payloadHash` = SHA-256 del sobre canónico, 1 sola operación, sin dependencias, sin reutilizar ids de otras ejecuciones ni de la prueba anterior), `verify` del manifiesto, **preflight con las anclas** (digest y huella JWT del propietario), ACL (secretos e integridad), escáner de secretos, ausencia de procesos/puertos de servidores, CA temporal **no** instalada, respaldos pre-F1/pre-F2 (hash a hash) | ninguna |
| **B** | Autorización de inspección de un solo uso + inspección de solo lectura (lanzador existente); veredicto `ready`, `writes 0`, `closed`; **línea base** comparada con la esperada (main_v2_* e históricas); cualquier diferencia ⇒ `discrepancy` y C bloqueada | Atlas (lectura) |
| **C** | Línea base reciente (≤ 60 min), CA instalada, salud, **registro único** (la credencial se protege con DPAPI **antes** de enviarse), sesión, **un** lote de **una** operación con los bytes exactos de `batch.json`; valida el recibo (operationId, hash, instalación, jugador, generación, cuenta, `receiptId`, fecha) | HTTPS local → Atlas |
| **D** | Verificación de solo lectura **antes** del reenvío; reenvío de los **mismos bytes**; exige `duplicate` con el **mismo** `receiptId`/`committedAtUtc`/`payloadHash` (si C quedó desconocido, la respuesta define el recibo de referencia) | idem + lectura |
| **E** | `receipts/query` (`found`, mismo recibo; sonda `not_found` opcional que solo consulta), inspección final y **deltas exactos** (+1 en las seis colecciones, +N sesiones según los inicios de sesión registrados, 0 en revocaciones e históricas) y verificación final | idem + lecturas |
| **F** | **Rechazada** (código 9): fuera de alcance de esta campaña; solo se prepara el constructor `build-second-op.mjs` | — |
| **G** | Cierre: borrado del secreto protegido (sobrescribir + eliminar el archivo local), limpieza del bloqueo caducado, comprobación de procesos, puertos y almacén de certificados (CurrentUser y LocalMachine); imprime el comando que el **propietario** debe ejecutar para retirar la CA (**nunca la retira**); `-StopCaddy`/`-ForceStopExpress` solo con PID explícito, nombre de proceso comprobado y frase de autorización | local |

Garantías de control (todas probadas):
- **Autorización explícita por etapa:** sin la frase exacta (ligada al `runId`) ⇒ código 10 y no se registra nada.
- **Sin avance automático ni saltos:** orden A<B<C<D<E; una etapa ya `ok` no se repite; una etapa inconclusa exige `-Resume` (código 12) y usa **los mismos ids y bytes**; un bloqueo (`stage.lock`) impide ejecuciones simultáneas y el de un proceso muerto se retoma.
- **G sin prerrequisitos:** funciona sin estado, con estado corrupto, tras una interrupción y sin carpeta de ejecución.
- **Lista blanca HTTP:** solo `GET /api/health` y `POST` a registro, sesión, `sync/batches` y `sync/receipts/query`; cualquier otro método o ruta (incluido `DELETE`) se rechaza antes de enviar nada. URL fija `https://localhost:8443`, `BackendDir` y servicios comprobados fijos en modo real; los parámetros de prueba solo se aceptan con `-TestMode`, que **prohíbe la URL real y los lanzadores reales**.
- **Resultado desconocido nunca crea nada nuevo:** 0/5xx/`deferred`/cuerpo ilegible ⇒ estado `unknown` (código 20) y D verifica por lectura y reenvía **el mismo `operationId`**; los bytes de `batch.json`/`receipts-query.json` se fijan por hash al iniciar la ejecución (`bytes-changed` ⇒ código 30).
- **Atlas:** el guion solo espera las colecciones `main_v2_*` (7) y las históricas conocidas; recuentos distintos ⇒ discrepancia; no existe ninguna ruta de borrado ni de limpieza automática (la única eliminación es el archivo local del secreto, en G).

## 3. Manejo de credenciales

- La contraseña de Atlas **no pasa** por el guion (prompt oculto de los lanzadores existentes).
- **Decisión de diseño:** como cada etapa exige una autorización distinta entre turnos del chat, mantener un único proceso con la credencial «solo en memoria» sería frágil (cualquier cierre la pierde y deja la cuenta inutilizable). Se implementó el almacén **DPAPI CurrentUser** (`secrets.dpapi` dentro de `RunDir`, entropía = `runId`) para la credencial sintética de la cuenta (43 caracteres, aleatoria, **no** es una contraseña de MongoDB) y el JWT (reutilizado mientras no caduque, con 60 s de margen; así basta **una** sesión: `identitySessions +1`). Nada va en texto plano: el autotest comprueba que el blob no contiene la credencial ni el token, y que ni la credencial, ni el JWT, ni cualquier patrón `eyJ…` aparecen en ningún archivo, autorización, salida del guion ni registro del servidor. La salida pasa por un filtro de redacción. G sobrescribe y elimina el blob. `RunDir` se rechaza si es legible por *Everyone/Users/Authenticated Users* (en modo real) o está en OneDrive/dentro del proyecto.
- **Alternativa no implementada:** modo «solo memoria» con un proceso único que espera archivos de continuación; se descarta por fragilidad, pero puede añadirse si se prefiere. Requiere decisión del propietario antes de la ejecución real (§8).

## 4. Pruebas offline (117/117 aprobadas)

Ejecutadas con `staged-selftest.ps1` en una carpeta desechable del directorio temporal del asistente, el doble en `127.0.0.1` y lanzadores falsos (leen la instantánea del doble). Sin Atlas, sin Express, sin Caddy, sin Godot. Primeras pasadas: fallos de mi propio código/arnés corregidos (variable de ámbito sin inicializar en modo estricto, colecciones vacías desenrolladas, el escáner imprime por stderr, directorio de trabajo de los scripts Node, orden de claves del JSON de resumen, y un arnés que trataba el stderr de Node como error); la pasada final no tiene fallos.

| Requisito B40 §6 | Cobertura (resultado) |
|---|---|
| 1 Validación de parámetros | etapa inválida, falta de `RunDir`, URL real en TestMode, URL distinta en modo real, parámetros de prueba sin `-TestMode`, lanzador real en TestMode, servicios fijados: todos rechazados (código 2) |
| 2 Etapas sin autorización | sin frase, frase de otra ejecución: código 10; nada se registra |
| 3 Sin avance automático | tras A el estado solo contiene A; tras B solo A,B; C/D/E/B fuera de orden: código 11; ninguna petición de sync por etapas rechazadas |
| 4 `operationId` conservado | en cada escenario (incl. 503/pérdida) **un solo `operationId`** llegó al servidor; mismos bytes (hash estable) |
| 5 Sin secretos | credencial, token y `eyJ…` ausentes en archivos, salidas, autorizaciones y registro; blob cifrado |
| 6 Manifiesto inválido | manifiesto alterado ⇒ A falla (21), B queda bloqueada |
| 7 Configuración incompleta | ancla ausente/inválida ⇒ falla; ancla equivocada ⇒ el preflight falla; ids repetidos de otra ejecución, id de la prueba anterior, lote manipulado, puerto ocupado, proceso de servidor activo ⇒ falla |
| 8 Reanudación tras interrupción | muerte del proceso tras el registro (99): sin `-Resume` ⇒ 12; con `-Resume` ⇒ misma cuenta, **1 registro y 1 operación** en el servidor; el bloqueo caducado se retoma |
| 9 HTTP 503 simulado | 503 sin cuerpo, 503 con `deferred`, respuesta perdida antes y después del commit: C = *unknown* (20), D resuelve por verificación + reenvío idéntico (`committed` o `duplicate` según lo persistido), **1 operación y 1 hecho** y deltas correctos en E |
| 10 `duplicate` simulado | ruta normal: D devuelve `duplicate` con el mismo `receiptId` |
| 11 `receiptId` inconsistente | duplicado con otro `receiptId` ⇒ D inconsistente (30) y E bloqueada; recibo con instalación ajena ⇒ C inconsistente (30) y D bloqueada; consulta con recibo distinto ⇒ E (30); verificación no consistente ⇒ D se detiene **sin reenviar** |
| 12 Cierre seguro | G sin estado, sin `RunDir`, tras interrupción (borra secreto y bloqueo), con estado corrupto; informa atención (40) con procesos activos o CA instalada y **no la retira**; se niega a detener procesos sin frase o que no sean `caddy`; el almacén de certificados no se modificó |
| Línea base | historial alterado antes de B ⇒ discrepancia (31) y nada se escribe; veredicto de inspección ≠ `ready` o lanzador que falla ⇒ B falla; línea base caducada ⇒ C se niega; historial alterado antes de E ⇒ discrepancia (31) |
| Constructor de la 2.ª operación | validada con el validador real; misma instalación/jugador, ids nuevos; `payloadHash` = SHA-256 del sobre; rechaza carpeta no vacía y carpeta dentro del proyecto |

Integridad: `src/`, `scripts/`, `package.json`, `package-lock.json` y `vitest.config.js` con el mismo hash antes y después (`7857e5f4…b61d`); manifiesto v4 verifica (3169, 0 diferencias); 0 procesos `node`/`caddy`/`Godot`; sin escuchas en 3000/3001/8443; las únicas conexiones a 27017 son las de MongoDB Compass (PID 3192, preexistentes); `CurrentUser\Root` = 44; respaldos pre-F1 y pre-F2 intactos.

## 5. Cómo se ejecutaría la etapa A (no ejecutada con los datos reales)

```powershell
$B='C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend'; $L=$env:LOCALAPPDATA; $T="$L\TwoSidesSyntheticRun"
Copy-Item "$B\docs\main-sync-test\sync-test-staged.ps1.template" "$T\sync-test-staged.ps1"
$RUN="$T\run-$(Get-Date -Format yyyyMMdd-HHmmss)"
node "$T\build.mjs" $B $RUN                     # offline: ids nuevos + operación validada
$id=(Get-Content -Raw "$RUN\run-ids.json"|ConvertFrom-Json).runId
& "$T\sync-test-staged.ps1" -Stage A -RunDir $RUN -ConfirmPhrase "AUTORIZO-ETAPA-A-$($id.Substring(0,8))" `
   -ExpectedTreeDigest aea04105001d5ca324f817602e781cf5118789f9187c8424c204551ac800e27e `
   -ExpectedKeyFingerprint 811cd75bcf98dcb88c766f369431e3886f75188ad3fec59d8bbbbe0eab9d8aec
```
La etapa A no abre ninguna conexión de red; el digest debe ser el que el propietario anotó **fuera del equipo**.

## 6. Qué requiere autorización para B

La etapa B es la primera con acceso a Atlas (lectura): requiere autorización explícita nueva del propietario en el chat (frase de la etapa B), una autorización de inspección de un solo uso creada en ese momento y que el propietario escriba la contraseña en el prompt oculto. Además: A completada con éxito el mismo día, Compass cerrado o en solo lectura, y la línea base esperada confirmada (`main_v2_*`: identities 1, ownerGuards 1, identitySessions 1, operations 1, facts 1, fences 2, revocations 0; históricas: users 2, decisions 7, gameevents 13, gameprogresses 2, statisticevents 14, statisticsummaries 2, syncidentities 1; o un `-ExpectedBaselineFile` actualizado).

## 7. Riesgos residuales

- Los **lanzadores reales** (`run-main-inspection.ps1`, `run-verify-synthetic.ps1`) no se ejecutaron (requieren Atlas): el guion interpreta su salida según el formato leído en el código (`mainSchemaInspection`, `requiredCollections.<k>.estimatedCount`, `otherCollections[]`, `syntheticRunVerification`, `counts`, `verdict`, `closed`); un cambio de formato haría fallar la etapa de forma segura (código 21), no inventaría datos.
- El comportamiento real de HTTPS con Windows PowerShell 5.1 y la CA de prueba, y la latencia/forma exacta de las respuestas de Express en Atlas, solo se verificaron contra el doble (la forma del contrato se tomó de `ingestion-service.js`).
- `estimatedDocumentCount` es una estimación por metadatos; la verificación por identificador (exacta) es la que decide la consistencia.
- DPAPI depende de que el mismo usuario de Windows ejecute todas las etapas; si cambia, la cuenta sintética no puede iniciar sesión (se verifica por lectura y se decide).
- La contraseña de Atlas se introducirá previsiblemente 5 veces (Express, B, D, y dos en E).
- Certificado de servidor caduca el 2026-11-16 (CA 2026-12-02).
- B00 sigue abierto; los scripts nuevos no están cubiertos por el manifiesto (están en `docs/`).

## 8. Condiciones para iniciar una prueba real

1. Autorización explícita del propietario para **cada** etapa (B…G), nunca implícita.
2. Decisión sobre el almacén de credenciales: **DPAPI (implementado)** frente a modo solo memoria (no implementado).
3. Digest v4 anotado fuera del equipo y verificado por el propietario; manifiesto v4 y respaldos intactos el mismo día.
4. Ventana antes del 2026-11-16, con CA instalada/retirada y arranque/cierre de Caddy y Express a cargo del propietario (cierre de Express con Ctrl+C), y Compass cerrado o en solo lectura.
5. Carpeta de ejecución nueva y vacía fuera del proyecto y de OneDrive (`build.mjs`), sin reutilizar ids.
6. Etapa F fuera de esta campaña; limpieza futura de datos solo con autorización separada.

Detenido tras entregar B40. No se inició la etapa B ni ninguna operación real.
