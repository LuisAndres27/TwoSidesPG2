# B41 — Cierre de la etapa B y endurecimiento DPAPI (offline)

Fecha: 2026-11-02. Campaña: prueba real F1 + F2 (B39/B40). runId `bbaa257d-2bcb-42a3-8f4f-f0e364fe7e38`, carpeta `%LOCALAPPDATA%\TwoSidesSyntheticRun\run-20261102-164320`.

## 1. Etapa B (inspección de solo lectura de Atlas)

Ejecutada por el propietario con `run-main-inspection.ps1` y la autorización de un solo uso `d45f009008671e1c7952c9c7005ab0d3` (válida 21:11:59–22:11:59 hora local). Resultado comunicado por el propietario:

- `mainSchemaInspection: finished`, `verdict: ready`, `writes: 0`, `closed: true`, `operationCount: 32`.
- 7 colecciones `main_v2_*` y 7 históricas con los conteos esperados; índices compatibles; semilla válida.
- Registro local sin secretos: `TwoSidesInspection\d45f0090….inspection.json` (`completed: true`, `verdict: ready`, 2026-11-03T03:13:27Z).
- Riesgo abierto: SCRAM-SHA-1.

Alcance real: el lanzador confirma **estructura, índices y conteos estimados** (`estimatedDocumentCount`). **No** comprobó documentos por identificador; los ids de la prueba anterior no se verificaron en esta etapa.

Dos intentos previos fallaron con `authorization_expired` antes de conectar (sin informe, sin conexiones a 27017, sin cambios de estado).

### Estado de la ejecución
`stage-state.json` (sin cambios desde 16:43:31, SHA-256 `620C24DE…27C8`): runId correcto, `stages = A`, `baseline = null`, sin cuenta, `logins 0`, sin `secrets.dpapi`. La etapa B se ejecutó **fuera** del controlador por etapas, por lo que **no quedó registrada** en el estado y no existe línea base guardada. Consecuencia: el controlador exige B registrada (y con menos de 60 min, `-BaselineMaxAgeMinutes`) para permitir C; antes de C hay que repetir B mediante `sync-test-staged.ps1 -Stage B` (otra autorización de un solo uso y otro prompt oculto). No se editó el estado a mano.

## 2. Correcciones DPAPI (solo plantillas de `docs/main-sync-test/`)

Archivos modificados: `sync-test-staged.ps1.template` (SHA-256 `78032EF157A992E8…`) y `staged-selftest.ps1.template` (`A02B8E23EC8E849E…`). No se tocaron contratos, esquema de estado, runId ni operationId.

A. **ACL sobre `secrets.dpapi`**: el temporal se crea vacío, se le aplica ACL (sin herencia, una regla explícita para el usuario actual) y después se escribe el contenido; tras el `Move-Item` se verifica la ACL del archivo final (si falla, se borra y se aborta). Al leer, la ACL se verifica **antes** de descifrar (se aceptan solo usuario actual, SYSTEM y Administradores, herencia desactivada).
B. **Etapa G**: sobrescribe y borra el archivo, elimina solo temporales propios de la carpeta de ejecución por nombre exacto (`secrets.dpapi.tmp`, `stage-state.json.tmp-<32 hex>`; sin recursión ni enlaces), **verifica la ausencia** (`absenceVerified`, `secretsFilePresent`, `temporariesLeft`) y devuelve exit 40 si algo no pudo eliminarse. Se conservan las claves previas (`secretsWiped`). Redacción: borrado lógico, `erasureNote` = «not a guarantee of irrecoverable physical erasure». `Save-State` ya no deja su temporal si se interrumpe la escritura.
C. **Fallo de descifrado/ACL antes del registro**: al empezar C, si `secrets.dpapi` existe se valida (ACL + descifrado) **antes de cualquier solicitud** (ni siquiera health); falla con exit 21, `reason = secrets-unavailable`, sin traza, sin nueva identidad ni cuenta. Igual en el registro, la sesión y las etapas D/E.

## 3. Pruebas offline (autotest ampliado)

Resultado: **163 correctas / 0 fallos** (117 previas + 46 nuevas), carpeta desechable, doble `node:http` en 127.0.0.1; sin Atlas, Express, Caddy, Godot ni certificados. Una primera ejecución dio 162/1: el fallo era un error del propio test (un array de un elemento se desenrollaba a cadena); se corrigió el test, no el guion.

Casos nuevos: ACL del archivo (herencia desactivada, solo usuario actual, sin temporales); ACL incorrecta (regla Users añadida; herencia reactivada) → cierre seguro, 0 solicitudes, archivo/cuenta/ids intactos, G lo elimina; fallo de descifrado (bytes aleatorios, blob con otra entropía, archivo vacío) → 21 sin solicitudes ni identidades nuevas; fallo en D → no reenvía; interrupción antes de terminar la escritura (temporal abandonado) → la reanudación lo sustituye, mismos identificadores, una cuenta, una operación; G: elimina 2 temporales propios, conserva ajenos y el material, es idempotente, verifica ausencia, informa 40 si el archivo está retenido y funciona al liberarlo; la credencial no aparece en ninguna salida.

## 4. Integridad tras el trabajo

- Manifiesto v4: `verify` ok (3169 archivos, 0 diferencias); SHA-256 del archivo `7DEC55E3…3E8B` sin cambios; preflight ok con ancla `aea04105…e27e` y huella JWT `811cd75b…9d8aec`.
- `src/`, `scripts/`, `tests/`: sin cambios (verificación del manifiesto y comparación de árbol del autotest).
- Escáner de secretos: `clean`, 0 hallazgos. ACL de secretos: `conforming`.
- Respaldos pre-F1 (117 archivos listados) y pre-F2 (118): 0 discrepancias hash a hash.
- Ejecución real: solo `batch.json`, `receipts-query.json`, `run-ids.json`, `stage-state.json`.
- Sin procesos `node`/`caddy`/`Godot`; nada escucha en 3000/3001/8443; no se instalaron certificados; sin escrituras en Atlas.

## 5. Pendiente antes de C

1. El controlador desplegado (`%LOCALAPPDATA%\TwoSidesSyntheticRun\sync-test-staged.ps1`) es aún la versión anterior: hay que sustituirlo por la plantilla corregida (no hecho; fuera del alcance autorizado).
2. Repetir B con el controlador (línea base registrada, ≤60 min antes de C).
3. Autorización explícita de C (`AUTORIZO-ETAPA-C-bbaa257d`), CA temporal instalada por el propietario, Caddy y Express en marcha, mismo día (hora local), certificado del servidor vence 2026-11-16.
