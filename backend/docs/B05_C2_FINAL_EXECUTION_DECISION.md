# B05 C.2 — documento de decisión de ejecución

Preparado: 2026-10-29 (UTC 2026-10-30).

## ESTADO ACTUAL (2026-10-30): EJECUCIÓN C.2 REALIZADA UNA VEZ — ver `B05_C2_REAL_ATLAS_EXECUTION_RESULT.md`

El usuario autorizó una única ejecución y la realizó manualmente: resultado local `passed`/`OK`, run consumido, limpieza hecha, rotación de la contraseña **pendiente**. La release `c2-4d2193d3…` no puede reutilizarse. El texto siguiente es el histórico previo a la ejecución.

## ESTADO: PENDIENTE DE AUTORIZACIÓN DE EJECUCIÓN (riesgos aceptados de forma limitada)

Estado global exigido, vigente en lo que falta: **PENDIENTE DE ACEPTACIÓN DE RIESGOS Y AUTORIZACIÓN DE EJECUCIÓN** → la aceptación ya se concedió (ver abajo); la autorización de ejecución **no**.

- **ACEPTACIÓN DE RIESGOS: APROBADA EXCLUSIVAMENTE PARA C.2** (R1, R4, R5, R6, R7, R8, R9 y R10; opción A del usuario, 2026-10-30 UTC).
- **AUTORIZACIÓN DE PREPARACIÓN DE ACTIVACIÓN: CONCEDIDA el 2026-10-30 UTC y ejecutada offline** (release `c2-4d2193d364587b1eed72b7e6ef8345b6`; ver `B05_C2_ACTIVATION_MANIFEST_PREPARATION_RESULT.md`). **Verificación externa por Drive: PASS** (1.894 archivos, código 0, 2026-10-30T02:45:27Z). La ejecución sigue **no autorizada**.
- **AUTORIZACIÓN DE CONEXIÓN A ATLAS: NO CONCEDIDA.**
- **AUTORIZACIÓN DE EJECUCIÓN C.2: NO CONCEDIDA.**

Este documento reúne lo que hay que decidir. **No concede nada, no contiene comandos de activación y no existe ningún manifiesto de activación remota.** La ejecución sigue bloqueada. B00 sigue **sin resolver**.

Documentos que lo respaldan: `B05_C2_RESIDUAL_RISK_ACCEPTANCE.md` (riesgos y aceptación), `B05_C2_INTEGRATION_CREDENTIAL_ROTATION_PLAN.md` (rotación), `B05_C2_SINGLE_RUN_AUTHORIZATION_PLAN.md` (alcance), `B05_C2_ACTIVATION_GAPS_FIX_RESULT.md` y `…_VERIFICATION_RESULT.md` (release y referencia).

## 1. Qué se autorizaría

| Elemento | Valor |
|---|---|
| Identificador de release | `c2-ba006dea951a180aabf7561b028ee1cb` |
| Ruta | `C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\c2-ba006dea951a180aabf7561b028ee1cb` |
| SHA-256 esperado del manifiesto **bloqueado actual** | `A24EDEE0CED4D6548AEEDCF5F72B8C2E689D31ABDEFA97B054A90538F5FD57A8` |
| SHA-256 del payload | `35502ABC9C42F00E474259267E7A08594AFD643627806B4C36E3022030A0CBC7` |
| SHA-256 del verificador | `EFA7AD7C88168EF25A0BCCE23C82262D9BB7D2DC82B3F0DC1B32A071272EE0E7` |
| Archivos | 1.894 |

**Aviso importante sobre el digest.** Para ejecutar habría que sustituir `manifest.json` de la release por un manifiesto de activación (`c2-remote-once`), lo que **cambia su SHA-256**. Ese nuevo digest todavía no existe: se generará solo tras una autorización aparte, y necesitará su propia referencia externa recuperada y verificada. El digest `A24EDEE0…D57A8` identifica únicamente el estado bloqueado y **no autoriza** una ejecución. Ninguna decisión sobre él puede tomarse hasta ese paso.

Destino fijo: clúster TwoSidesCluster, host `<cluster>.<id>.mongodb.net`, usuario `twosides_integration_test`, base `two_sides_integration_test`, authSource `admin`, DEFAULT, TLS estricto. **Nunca** `twosides_backend` ni `two_sides_db`.

## 2. Alcance permitido

- **Una** activación manual. Cancelar o fallar consume la release.
- Una ejecución A/B/C más la reapertura, con tres actores sintéticos generados en memoria.
- Máximo **tres clientes** en toda la ejecución (incluidos los fallidos; el tercero está reservado para la reapertura); *pool* de 2.
- Máximo **ocho envíos** de aplicación (A=2, B=2, C=4); sesiones: dos explícitas y dos implícitas simultáneas.
- 120 s globales desde el plan; 116 s para admitir trabajo y 4 s de cierre; 30 s por escenario.
- Ocho colecciones con prefijo `b054c2c_10ef4f6d653f4ee4a1d1b2e6591013c2_`; doce nombres exactos en el catálogo; cinco índices únicos.
- Limpieza condicional de hasta **16 documentos sintéticos propios**.
- Fence C.2A protegido: nunca se elimina ni se reinicia; su revisión avanzará si hay commits.
- Sin Outbox real, sin identidad Godot real, sin carga ni F.2, sin crear colecciones, índices, usuarios ni permisos.

Todo lo anterior es el contrato existente del código; no se amplía.

## 3. Riesgos pendientes

Detalle y siete campos de cada uno en `B05_C2_RESIDUAL_RISK_ACCEPTANCE.md`. Ninguno está resuelto.

| ID | Riesgo | Afecta a |
|---|---|---|
| R1 | B00 sin resolver | C.2 y la cuenta |
| R2 | SID desconocidos con Modify (proyecto y Temp); no se atribuye actividad | proyecto original, Temp |
| R3 | `backend/.env` legible por permisos existentes | otros componentes, no C.2 |
| R4 | La misma cuenta puede borrar el registro de consumo y rearmar | C.2 |
| R5 | Copias de la contraseña en memoria de Node.js y el driver | C.2 |
| R6 | Un commit puede confirmarse tras timeout o pérdida de respuesta | C.2 |
| R7 | La referencia externa acredita integridad, no procedencia histórica | C.2 |
| R8–R10 | Rol `readWrite` amplio; fábrica real de conexión incluida; fence que avanza | C.2 |

La aceptación (si se concede) cubre solo una ejecución sintética C.2 y excluye `two_sides_db`, `twosides_backend`, otros servicios y `backend/.env`.

## 4. Plan de rotación

Detalle en `B05_C2_INTEGRATION_CREDENTIAL_ROTATION_PLAN.md`. Resumen:

1. Antes: confirmar el usuario y revisar sus permisos en Atlas (solo lectura); preparar una contraseña exclusiva de 24–32 caracteres alfanuméricos; no guardarla en `.env`, archivos, chat ni URIs.
2. Durante: se teclea una sola vez en la entrada oculta del receptor; nunca por argumentos, variables ni archivos.
3. Después de **cualquier** intento (éxito, fallo o cancelación): cerrar la consola y **cambiar la contraseña manualmente** a un valor nuevo y aleatorio que no se anota; retirar la entrada del gestor; cerrar herramientas que la retengan.
4. Verificar con el registro de actividad de Atlas y la hora de modificación del usuario. La prueba negativa con la contraseña antigua solo con autorización aparte.
5. Si falla: tratarla como expuesta, eliminar el usuario o quitar el acceso de red; nunca tocar `twosides_backend` ni `two_sides_db`.
6. Registrar fecha, código de resultado y método de verificación, **sin** ningún secreto.

## 5. Criterios de detención

Detener etapas nuevas, intentar el cierre supervisado y conservar evidencia e IDs ante cualquiera de estos casos. No reactivar la ejecución ni repetirla.

- Autenticación o permisos no verificados; usuario, host, base o mecanismo distintos de los fijos.
- Rol efectivo distinto de un único `readWrite` sobre la base autorizada, o privilegios sobre otras bases.
- Catálogo distinto de los doce nombres exactos, o colección, índice o estructura inesperados (parciales, TTL, ocultos, *sparse*).
- Fence distinto de `{_id:'ingestion-v1', revision:0}` o restos en las otras siete colecciones C.2A.
- Digest, firma o inventario divergente; `runs/` no vacío; registro de consumo preexistente.
- Plazo o cupo agotado (120 s, 3 clientes, 8 envíos, sesiones).
- Respuesta incompatible o excepción no recuperada dentro del presupuesto.
- **Commit incierto o escritura pendiente.**
- Fallo de cierre de clientes o sesiones, o resultado ausente.
- Cualquier intento de abrir un cliente adicional o de acceder a `two_sides_db` o `twosides_backend`.

Los rechazos 401/403 y el 503 deliberado del escenario C son esperados solo donde las aserciones los exigen.

## 6. Condiciones para la limpieza

Solo se limpia si A/B/C y la reapertura se completaron sin incertidumbre, sin trabajo activo ni escrituras pendientes, y el cierre quedó confirmado.

- Inventario final exacto: 2 ops + 2 facts + 1 fence + 0 authorization + 3 identities + 3 ownerGuards + 3 identitySessions + 3 revocations = **17 filas, 16 eliminables**.
- Se relee y compara el inventario completo en una transacción *snapshot* antes de borrar; cada borrado usa `_id` exacto (y `technicalAccountId` cuando existe) y exige `deletedCount = 1`.
- El techo defensivo de 24 filas no autoriza borrar filas adicionales.
- El fence, las colecciones, los cinco índices y las estructuras históricas **nunca** se eliminan.
- Ante fallo, incertidumbre o inventario distinto **no se limpia**: se conserva `synthetic-plan.json` para una conciliación posterior bajo una autorización propia.

## 7. Precondiciones: qué está verificado y qué solo se puede comprobar conectado

Comprobado hoy (2026-10-30 02:21 UTC) con consultas de solo lectura y pruebas sin red:

| Condición | Estado | Evidencia |
|---|---|---|
| Release sellada e intacta | **Verificada** | Digest local = digest de la descarga externa = `A24EDEE0…D57A8`; verificador `PASS files=1894 mode=c2-blocked`; `runs` y `temp` vacíos; releases anteriores sin cambios |
| Referencia externa verificada | **Verificada en integridad** | PASS, 1.894 archivos, código 0 (`…VERIFICATION_RESULT.md`). Procedencia (Drive) confirmada por el usuario, no observada |
| SC01 corregido | **Verificada** | Expectativa de prueba actualizada en el workspace; hoy `atlas-revocation-schema` + `c2-single-use-activation` + `c2-receiver` + `c2-receiver-activation`: 56 aprobadas, 1 omitida |
| Pruebas de entrada oculta Accept y Cancel | **Comunicadas por el usuario**, no observadas | `PASS mode=Accept bytes=26` y `PASS mode=Cancel` (`…FINAL_RELEASE_PREPARATION_RESULT.md`). Se ejecutaron contra la release anterior; los bytes de `Read-C2HiddenCredential` son idénticos en la actual (huella de la función coincidente), pero no se repitieron con esta release |
| Protección de un solo uso implementada | **Verificada offline** | Registro de consumo fuera de `runs`, SU03–SU04, SU06, SU11–SU12. Límite documentado: la misma cuenta puede borrarlo (R4) |
| `executionId` ≠ id de esquema; validación JS = PowerShell | **Verificada offline** | SU01, SU09, SU10 |
| Ausencia de manifiesto de activación válido | **Verificada** | `mode=c2-blocked`, `remoteEnabled=false`, `activation=null`; no existe el registro de consumo; no hay generador (AR02) |
| B00 | **Pendiente** | No resuelto |

Solo comprobable **durante una conexión autorizada** (no se ha hecho ni se puede hacer antes):

- Que la contraseña corresponde al usuario y que se autentica en `admin`.
- El rol efectivo y los privilegios reales (`connectionStatus`, `showPrivileges`).
- El catálogo completo de doce nombres y los cinco índices en el servidor.
- El fence en revisión 0 y las otras siete colecciones vacías.
- Que el primario sea escribible y que el *pool* no supere el límite.
- El comportamiento real ante timeouts y la confirmación del cierre.

## 8. Condiciones para una única activación

Todas deben cumplirse y quedar anotadas. Si falta una, no se activa.

1. Aceptación de riesgos **A concedida** y registrada en `B05_C2_RESIDUAL_RISK_ACCEPTANCE.md` (sección 3). **Cumplida el 2026-10-30 UTC, limitada a una única ejecución sintética C.2.**
2. **Autorización aparte** para generar el manifiesto de activación de esta release: `executionId` nuevo y distinto de `10ef4f6d…`, ventana ≤ 4 h con fechas `AAAA-MM-DDThh:mm:ss[.mmm]Z`, destino y escenarios fijos. Esto modifica `manifest.json` y crea un digest nuevo.
3. **Nueva referencia externa** de ese manifiesto, recuperada desde Drive y verificada con el verificador, con PASS y código 0, antes de teclear nada.
4. Plan de rotación leído y aceptado; contraseña exclusiva preparada con sus controles propios; usted dispuesto a rotarla **inmediatamente después**.
5. Sesión limpia: sin otros programas innecesarios, consola interactiva nueva, ninguna variable `NODE_*`, `MONGO*`, `HTTPS_PROXY`, etc. (el lanzador las rechaza).
6. Confirmar que no corre otra ejecución incompatible desde otra copia o proceso.
7. `runs/` vacío, sin registro de consumo y verificador en PASS en ese momento.
8. Autorización explícita de la ejecución, ligada a release, digest, `executionId`, ventana y comando.
9. Anotar el intento en un medio externo (control de R4) y estar preparado para no repetir el ensayo, aunque falle.

## 9. Decisión del usuario

**Estado actual (2026-10-30 UTC): aceptación de riesgos CONCEDIDA de forma limitada; ninguna autorización operativa concedida.**

| Decisión | Registro |
|---|---|
| Aceptación de riesgos (ver `B05_C2_RESIDUAL_RISK_ACCEPTANCE.md` §3) | [x] **Sí, opción A: R1, R4, R5, R6, R7, R8, R9 y R10, exclusivamente para una única ejecución sintética C.2** |
| Plan de rotación | [x] Aprobado: la contraseña de `twosides_integration_test` se rota manualmente después de cualquier intento, incluso fallido o cancelado |
| **Autorización de preparación de activación** (paso 2 de la sección 8) | [x] **CONCEDIDA** (2026-10-30 UTC, solo preparación offline) |
| **Autorización de conexión a Atlas** | [ ] Sí  [x] **NO CONCEDIDA** |
| **Autorización de ejecución C.2** | [ ] Sí  [x] **NO CONCEDIDA** *(solo tras los pasos 2 y 3 de la sección 8)* |
| Release `c2-ba006dea951a180aabf7561b028ee1cb` | **Bloqueada** (`c2-blocked`, digest `A24EDEE0…D57A8`), sin modificar |

| Campo | Registro |
|---|---|
| Fecha y hora (UTC) | 2026-10-30, comunicada en la conversación; hora exacta no proporcionada |
| Nombre de quien decide | El usuario del proyecto (sin firma adicional) |
| Release y digest a los que se refiere la decisión | `c2-ba006dea951a180aabf7561b028ee1cb`, digest bloqueado `A24EDEE0CED4D6548AEEDCF5F72B8C2E689D31ABDEFA97B054A90538F5FD57A8` (no identifica ninguna ejecución) |
| Observaciones | La aceptación está atada al alcance de la sección 2 y no cubre `two_sides_db`, `twosides_backend`, otros clústeres, `backend/.env`, datos reales ni otros servicios. B00 sigue pendiente |

### Decisiones registradas (textuales en `B05_C2_RESIDUAL_RISK_ACCEPTANCE.md` §2.1 y §3)

- **Aceptación (opción A):** R1, R4, R5, R6, R7, R8, R9 y R10, limitada a una única ejecución sintética C.2 con `twosides_integration_test`, `two_sides_integration_test` y TwoSidesCluster. Se mantienen: verificación de permisos efectivos antes de escribir; máximo tres clientes; máximo ocho envíos; limpieza condicional de hasta 16 documentos sintéticos propios; protección del fence C.2A; detención ante discrepancias o commits inciertos; rotación manual después de cualquier intento.
- **R2:** los SID desconocidos se mantienen documentados, sin modificar permisos. **R3:** `backend/.env` se trata por separado, antes de utilizar datos reales. **R7:** Google Drive como referencia externa. **R8:** `readWrite` limitado a `two_sides_integration_test`.

### Estado de cada elemento

| Elemento | Estado |
|---|---|
| Aceptación de riesgos | **Concedida, limitada a C.2** |
| Rotación | **Aprobada** (nada rotado: no hay intento ni cambio de contraseña) |
| Preparación de activación | **Autorizada y realizada offline**. Existe un manifiesto de activación **solo** en la release nueva `c2-4d2193d364587b1eed72b7e6ef8345b6`; la release `c2-ba006dea…` sigue bloqueada |
| Activación | **Preparada, NO ejecutada.** `c2-ba006dea…`: bloqueada, digest `A24EDEE0…D57A8`. Release nueva activable: digest `47F4250B…62BDD`, ventana hasta 2026-10-30T06:39:39.489Z, `runs` vacío, sin registro de consumo. No hay ejecución ni conexión autorizadas |
| Conexión a Atlas | **No autorizada** |
| Ejecución C.2 | **No autorizada** |

### Próximo paso mínimo

La preparación ya está hecha (ver `B05_C2_ACTIVATION_MANIFEST_PREPARATION_RESULT.md`). Lo que sigue:

1. **Usted:** subir a una carpeta nueva de Google Drive los cinco archivos de `backend/docs/c2-reference/c2-4d2193d364587b1eed72b7e6ef8345b6-20261030T024009Z/`, descargarlos en otra ubicación y comunicar la ruta. **Antes de 2026-10-30T06:39:39Z** (UTC; 00:39 de la madrugada hora de Guatemala).
2. **Agente (solo lectura):** comparar los cinco hashes, leer el digest del `manifest.sha256.txt` recuperado y ejecutar el verificador en modo `c2-remote-once`. Debe dar PASS, código 0.
3. **Usted, aparte:** la autorización final de ejecución, que fija el digest, el `executionId` y la ventana, y que todavía **no existe**. Sin ella no se pide ninguna contraseña ni se conecta.

## 10. Qué no ocurrió

Sin contraseñas reales. Sin conexión a MongoDB Atlas. Sin manifiesto de activación válido. Sin C.2 ni F.2 ni A36. Sin cambios en ninguna release, `backend/.env`, SQLite, Godot, ACL, propietarios, usuarios, permisos ni contraseñas de Atlas. Sin B05.5. B00 pendiente.

**PENDIENTE DE ACEPTACIÓN DE RIESGOS Y AUTORIZACIÓN DE EJECUCIÓN. Detenido antes de cualquier conexión remota.**
