# B05 C.2 — corrección de las brechas de activación

Fecha: 2026-10-29. **Brechas corregidas y release nueva construida, BLOQUEADA.** Pendiente de que el usuario conserve y recupere la referencia externa. No se generó ningún manifiesto remoto válido, no se pidió contraseña, no se conectó Atlas, no se ejecutó C.2/F.2. B00 sigue sin resolver y B05.5 no se inició.

## 1. Defectos corregidos

### 1.1 `executionId` igual al identificador de esquema C.2A (G1)

Ahora se rechaza cualquier `executionId` igual a `10ef4f6d653f4ee4a1d1b2e6591013c2`, en todas las capas por las que pasa:

| Capa | Dónde |
|---|---|
| Argumentos del proceso hijo (y por tanto el punto de entrada) | `parseReceiverArgs`: `--run-id` igual al id de esquema → `ARGS_REJECTED`, antes de leer entorno, manifiesto o stdin |
| Núcleo | `assertActivation`: `executionId === runId(esquema)` → `ACTIVATION_REJECTED` |
| Plan del arnés | `prepareDurableAtlasPlan`: falla con ese id, de modo que ni siquiera la composición real podría usarlo |
| Lanzador | `Invoke-C2Receiver` rechaza `-RunId` igual al de esquema (`args`) y `Test-C2Activation` lo rechaza dentro del manifiesto (`activation`), ambos antes de reservar nada o pedir la contraseña |

`c2-receiver-entry.js` **no cambió** (mismos bytes que en la release anterior, `6DBC4E78…0E02`): no lee el id por su cuenta, solo pasa por `parseReceiverArgs` y por `openC2Integration`, que valida el permiso y llama al plan. Esas son las rutas que ahora lo rechazan (SU09).

### 1.2 Validación unificada PowerShell / JavaScript (G3)

El lanzador era más laxo que el núcleo. Ahora ambos aplican las mismas reglas, y el lanzador rechaza **antes de reservar o pedir la contraseña**:

- `target`: exactamente las claves `host, user, database, authSource, authMechanism, tls`; ni extra ni ausente. Tipos estrictos (cadena para los cinco textos y booleano `true` para `tls`; `"true"` o un número se rechazan).
- `activation`: exactamente `executionId, runId, scenarios, createdAtUtc, expiresAtUtc`; sin claves extra. `scenarios` debe ser un arreglo de tres cadenas `A, B, C`; una cadena suelta como `"ABC"` se rechaza.
- `version` numérica `2` y `remoteEnabled` booleano `true` (`"2"` o `"true"` se rechazan).
- Fechas: solo instantes UTC estrictos `AAAA-MM-DDThh:mm:ss[.mmm]Z` en **ambos** lados. Antes JavaScript aceptaba formatos que PowerShell interpretaba distinto. Un manifiesto futuro debe usar `toISOString()` o equivalente.

**Consecuencia para el futuro manifiesto:** deberá respetar ese formato exacto; cualquier clave sobrante lo invalida.

### 1.3 Protección de un solo uso (G2): parcial, con límite documentado

Se añadió un **registro de consumo persistente fuera de la release y de `runs/`**:

```text
%LOCALAPPDATA%\TwoSides\C2Runtime\consumed\<releaseId>.json
```

- Lo crea el lanzador, en exclusiva (`CreateNew`, sin compartir), después de todas las comprobaciones y **antes de pedir la contraseña**. Verifica ACL del directorio y del archivo con las mismas reglas del resto del árbol, sin cambiarlas y sin privilegios adicionales.
- Contiene solo `version, releaseId, executionId, manifestSha256, reservedAtUtc`; ningún secreto.
- Lo exige el proceso hijo (`assertConsumptionRecord`): sin registro exacto (release, ejecución, digest, claves, tamaño ≤ 1 KB, archivo normal sin enlace) rechaza con `ACTIVATION_REJECTED` antes de reservar o leer stdin. Por lo tanto el receptor tampoco arranca saltándose el lanzador.
- Está ligado a la **release**, no solo al `executionId`: un intento fallido o cancelado consume la release entera, aunque se prepare otro manifiesto con otro `executionId`.
- El verificador de la release nueva falla (`consumed`) si ese registro existe, de modo que una release ya consumida no puede volver a darse por verificada.
- Nunca se borra desde el código.

**Qué mejora (SU12):** borrar `runs/<id>` después de un intento (por error o a propósito) **ya no rearma** la release. Tampoco la rearma preparar otro manifiesto con otro `executionId`.

**Qué NO garantiza, expresamente:**

- Cualquier proceso que controle la misma cuenta Windows puede borrar también el registro (y `runs/<id>`) y rearmar el intento. SU12 deja esa limitación demostrada en una prueba, no oculta.
- Se evaluaron alternativas que no requieren cambiar ACL ni privilegios, y ninguna lo evita: un segundo archivo local o una clave `HKCU` (misma cuenta), el atributo de solo lectura (reversible por la cuenta), mantener un manejador abierto (solo dura mientras vive el proceso) y un contador remoto en Atlas (está fuera de alcance y obliga a conectar). Un control que resista a la misma cuenta exigiría un medio fuera de ella, p. ej. anotar a mano el intento en su almacenamiento externo, o un cambio de ACL/privilegios que este trabajo tiene prohibido.
- Se impide un reintento accidental o parcial. **No** se impide uno malicioso del mismo usuario. B00 no queda resuelto por esto.
- Coste operativo: tras cualquier intento (aunque se cancele con Esc) esa release queda consumida; otro intento requeriría una release nueva, un manifiesto nuevo y una referencia externa nueva.

## 2. Archivos modificados

Código (workspace y release nueva, mismos bytes, comprobado por SU13):

| Archivo | SHA-256 |
|---|---|
| `scripts/c2-receiver-core.js` | `126F6E01BB6F490924DA566137728342370CC636A1332F4AD8207EFFB60ED0E4` |
| `scripts/c2-receiver.ps1` | `24E6059D70C9C5A36F4B5BFE1373068E9704197A7F7299DBF5911D2E72A95863` |
| `scripts/durable-revocation-atlas-harness.js` | `897EC9B388351ED5B824CD5A5DC9335C901B34E3072F50B788B68C2C6276E82F` |
| `scripts/c2-activatable-verify-reference.ps1` | `EFA7AD7C88168EF25A0BCCE23C82262D9BB7D2DC82B3F0DC1B32A071272EE0E7` |

Pruebas:

- Nuevos: `tests/sync/support/c2-consumption.js` (doble del registro del lanzador) y `tests/sync/c2-single-use-activation.test.js`, ahora con SU01–SU13.
- Adaptados para que el núcleo encuentre el registro: los montajes de `c2-receiver.test.js`, `c2-receiver-activation.test.js` y `c2-final-release.test.js`. Ninguna aserción se debilitó.

Documentación: este informe y el paquete de referencia nuevo (sección 5). Sin cambios en `backend/.env`, SQLite, Godot, ACL, propietarios, Atlas ni en la entrada, la plantilla, la integración o el runtime de la release.

## 3. Pruebas

| Ejecución | Resultado |
|---|---|
| `c2-single-use-activation.test.js` (SU01–SU13) | **13 aprobadas** |
| `tests/sync` completo (25 archivos, con raíz desechable) | **469 aprobadas, 16 omitidas, 1 fallo** |
| AC03–AC04 sobre copia desechable de la release **nueva** | **4/4 aprobadas** (verificador PASS, digest erróneo rechazado, lanzador bloqueado antes del prompt, alteración detectada) |
| Verificador de la release nueva con un registro de consumo sintético en una copia desechable | PASS sin registro, FAIL con registro, PASS al retirarlo |

Lo que cubren SU01 y SU10 (diferenciales): 38 variantes de manifiesto dan la misma respuesta en JavaScript y en PowerShell, incluida cada clave extra o ausente, cada tipo erróneo, cada formato de fecha no admitido, el límite exacto de 4 h y el `executionId` reservado. SU10 comprueba además que el lanzador rechaza ocho de ellas con **0 pulsaciones solicitadas y sin crear carpeta de run ni registro**.

**El fallo** es `atlas-revocation-schema.test.js › SC01`. No se relaciona con estos cambios: espera que `persistenceTest: 'B05.4C.2F.1C.2'` lance un error, pero la política de `atlas-policy.js` (sin tocar en esta fase, idéntica a la de la release anterior) ya acepta esa fase con el id de esquema desde la construcción activable. Es una expectativa caduca de esa fase; no la modifiqué por quedar fuera de las brechas confirmadas. Debe decidirse si se actualiza esa prueba.

**Omitidas (16):** AC04 (requiere copia desechable; pasó aparte con su variable, ver arriba), RX17 (requiere la release offline histórica) y las demás pruebas con dependencias de entorno propias de fases anteriores, que no repetí. No se declara nada sobre ellas.

**Conservado y comprobado por las pruebas existentes (todas aprobadas):** destino fijo (SU01, RX02, RX03); usuario de integración, sin `twosides_backend` ni `two_sides_db`; límites de 3 clientes, 2 sesiones explícitas y 8 envíos (RX10); reserva antes de pedir la contraseña (SU03, SU06); commits inciertos sin reintento ni limpieza (RX11, RX12); limpieza exacta de 16 documentos y conservación del fence C.2A (FR03, FR04, durable-revocation). No se abrió ninguna conexión real: la entrada real nunca se arrancó con una puerta abierta.

## 4. Estado del riesgo de reutilización

| Escenario | Estado |
|---|---|
| Reintento accidental tras fallo, cancelación o `result.json` ausente | **Bloqueado** (run, marcador y registro de consumo) |
| Borrar solo `runs/<id>` | **Bloqueado** por el registro externo (nuevo, SU12) |
| Otro `executionId` con la misma release | **Bloqueado** (el registro es por release) |
| Arrancar el hijo sin lanzador | **Bloqueado** (exige el registro exacto) |
| Proceso hostil con la misma cuenta que borra `runs/<id>` **y** el registro | **No bloqueado.** Límite documentado, no resoluble sin ACL, privilegios o un medio fuera de la cuenta |
| Quien controle esa cuenta y sustituya código antes de las comprobaciones | **No bloqueado** (B00) |

No se promete resistencia absoluta frente a un proceso que controle la cuenta.

## 5. Nueva release y referencia

```text
Release:  C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\c2-ba006dea951a180aabf7561b028ee1cb
Id:       c2-ba006dea951a180aabf7561b028ee1cb
Manifiesto SHA-256: A24EDEE0CED4D6548AEEDCF5F72B8C2E689D31ABDEFA97B054A90538F5FD57A8
Payload SHA-256:    35502ABC9C42F00E474259267E7A08594AFD643627806B4C36E3022030A0CBC7
Verificador SHA-256 (c2-activatable-verify-reference.ps1): EFA7AD7C88168EF25A0BCCE23C82262D9BB7D2DC82B3F0DC1B32A071272EE0E7
Archivos: 1.894   Estado: version 2, c2-blocked, remoteEnabled false, activation null
runs / temp: 0 / 0 elementos
```

- Digest **nuevo**; no se reutilizó `0A8C7D97…7579` ni `D4A5ED8A…`. Se conserva como `parentManifestSha256` solo para trazabilidad.
- Verificador de la release con el digest local de construcción: `PASS files=1894 mode=c2-blocked`. **Es una comprobación local, no una verificación externa.**
- Qué cambió respecto de `c2-22fa685a…`: exactamente los cuatro archivos de la sección 2 (`diff -rq` sobre los 1.894 archivos de `package`) y `manifest.json` (nuevo `releaseId`, `createdAt`, `payloadSha256`, `parentReleaseId`, `parentManifestSha256`, `gapFixes`, `changes`). Mismas 23 dependencias fijadas y sin instalar nada.
- Lectura de ACL con las propias rutinas del lanzador sobre la release nueva: 0 escritores inesperados y 0 SID prohibidos en los 1.894 archivos; es una comprobación acotada de objetos nuevos, no una auditoría de B00.
- Releases anteriores intactas: huella completa (ruta, tamaño, fecha, SHA-256) de `c2-22fa685a…`, `c2-19dcfa4b…` y `c2-67d95728…` idéntica antes y después.
- Copias desechables de las pruebas (en `C2Runtime`) eliminadas tras comprobar ruta exacta, marcador y ausencia de enlaces. No quedó ningún directorio `consumed` ni residuo en `runs`.

**Paquete de referencia único (local, sin subir):**

```text
backend/docs/c2-reference/c2-ba006dea951a180aabf7561b028ee1cb-20261029T220011Z/
```

Cinco archivos: `manifest.json` (copia exacta), `manifest.sha256.txt`, `verifier.sha256.txt`, `reference.json`, `INSTRUCCIONES.md`. Sin secretos. Su `INSTRUCCIONES.md` incluye el procedimiento de recuperación y verificación. La referencia **no es independiente todavía**.

## 6. Condiciones pendientes para activar C.2

1. **Referencia externa de la release nueva:** subir a Drive los cinco archivos de la carpeta anterior en una carpeta nueva, recuperarlos en otra ubicación, comparar sus cinco SHA-256 con el original y ejecutar el verificador con el digest recuperado. Sin ello no hay verificación externa de `c2-ba006dea…`. La referencia de `c2-22fa685a…` no vale para esta.
2. Decidir sobre `SC01` (expectativa caduca de una prueba ajena a estas brechas).
3. Aceptación expresa y escrita de los riesgos residuales (sección 7) y del límite de la sección 4.
4. **Autorización aparte para generar el manifiesto de activación** de esta release, con `executionId` distinto del identificador de esquema, ventana ≤ 4 h y fechas en el formato estricto. Cambia `manifest.json`, necesita digest propio y una verificación externa antes de teclear nada.
5. Acuerdo de rotación manual de la contraseña de `twosides_integration_test` tras el intento (procedimiento en `B05_C2_SINGLE_USE_ACTIVATION_PREPARATION_RESULT.md`, sección 8).
6. Autorización explícita de la ejecución ligada a release, digest, `executionId`, ventana y comando. Opcional pero recomendable: anotar a mano en su almacenamiento externo cada intento, único control fuera de la cuenta.

## 7. Riesgos residuales (B00 sin resolver)

- **B00:** SID desconocidos A (`…3248334987`) y B (`…466486063`) con Modify heredado en el proyecto, incluido `.env`, y SID C con Modify explícito en el Temp del usuario. Siguen sin identificarse. Procesos de la misma cuenta pueden atacar código o referencias antes de las comprobaciones y, como se indica en la sección 4, borrar el registro de consumo.
- Esta release incluye la fábrica real de conexión: solo la frenan el manifiesto bloqueado, el digest externo, el registro de consumo y su autorización.
- Copias de la contraseña en memoria (Node.js, driver, sistema); sin borrado garantizado.
- Un commit enviado puede confirmarse tras una interrupción; no se acredita rollback.
- Las garantías de Windows (manejadores sin escritura, ACL) mitigan sustitución y no aíslan la cuenta. El respaldo en `C:\TwoSides_Backup_Integridad` es escribible por Authenticated Users.
- El rol `readWrite` de `twosides_integration_test` es más amplio que los documentos autorizados.
- El fence avanzará aunque la limpieza sea completa.
- Procedencia de la referencia externa confirmada por el usuario, no observada por el agente.
- G4 (el «digest externo» es procedimental) y G5 (ventana acotada por el supervisor de 120 s) del informe anterior siguen vigentes.

No se declara resuelto ninguno de estos riesgos.

## 8. Detención

Sin contraseñas reales. Sin conexión a MongoDB Atlas, ni siquiera de lectura. Sin C.2, F.2 ni A36. Sin manifiesto remoto válido (`c2-ba006dea…` sigue `c2-blocked`). Sin cambios en `backend/.env`, SQLite, Godot, ACL ni propietarios. Sin `private-workspace.ps1`. Sin B05.5.

**Release `c2-ba006dea951a180aabf7561b028ee1cb` BLOQUEADA, pendiente de referencia externa. Detenido.**
