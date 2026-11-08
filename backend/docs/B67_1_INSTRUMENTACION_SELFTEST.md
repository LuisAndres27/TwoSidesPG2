# B67.1 — Instrumentación segura del selftest

Fecha: 2026-11-03, Guatemala. **Ensayos automáticos y de consola sintética: PASS (ver §4). Accept y Cancel manuales NO ejecutados por el agente; pendientes del propietario.** El canal sigue **NO APTO para credenciales reales** hasta que el propietario complete la comprobación manual sin fallos.

No se conectó Atlas, no se activó v5, no se iniciaron Express ni Caddy, no se pidió ni usó una contraseña real, no se tocó `.env`, SQLite real, Godot, F1/F2, cuotas, `backend/src`, `backend/scripts` ni `backend/tests`. Sin commits ni push. El despliegue B67 anterior y los cinco archivos de referencia B66 siguen byte a byte intactos.

## 1. Causa del fallo manual

**No determinada.** El diagnóstico previo (B67 §9 y la verificación aislada posterior) descartó un defecto de `Read-Host -AsSecureString`, de PowerShell 5.1.26100, de la comparación, del framing UTF-8 y del receptor: el sentinela correcto pasa por consola real oculta. Los dos FAIL manuales no pueden atribuirse a una etapa porque el `catch` original devolvía siempre el mismo mensaje.

Hipótesis respaldada solo para el **primer** intento: la sección 5 de B67 ponía los comandos Accept y Cancel en el mismo bloque; si se pegan juntos, `Read-Host` consume la segunda línea como entrada oculta y la comparación falla. La prueba C05 reproduce ese efecto (entrada distinta → `INPUT_MISMATCH`). Para el segundo intento no hay evidencia suficiente; el objetivo de esta versión es que el siguiente FAIL, si ocurre, indique etapa y código.

## 2. Cambios exactos

Nuevos archivos bajo `backend/tools/atlas-v2-first-read/b67-1/` (fuera del ámbito v5; `b67/` no se tocó):

| Archivo | Función | SHA-256 |
|---|---|---|
| `offline-selftest.ps1` | Selftest instrumentado | `1FA746AE8773E5600158E41AB208841E6F18D377D11BDE1C5DDB3B7DF9D1CA6A` |
| `prepare.ps1` | Copia de `b67/prepare.ps1`: selftest de `b67-1`, receptor tomado de `b67/` y fijado por hash, runId nuevo, campo `revision:"B67.1"` | `D5D745D4BC1C19DE24D3CE5894FBE6808A9D9FE98DD491DF8CF4D39A34EE1E73` |
| `run-tests.ps1` | Batería sintética (fixtures desechables) | `C5C61C5203B8951DE59765641AD345B585CCF8A1D916A5DA6F471C7AE7244CE5` |
| `console-inject.ps1` | Auxiliar de pruebas: teclas sintéticas por `WriteConsoleInput` en la consola oculta | `78066A63CEC1592F8AA8B6A0DFD1F09A02FAEC233BD01DEDFE866C4C03293609` |

`run-tests.ps1` y `console-inject.ps1` no se despliegan ni están en el sello.

Cambios en `offline-selftest.ps1` respecto del B67 (`97033A…885D`):

1. **Etapas públicas fijas**: `integrity`, `preflight`, `input`, `compare`, `receiver`, `cleanup`. Líneas de progreso `B67_STAGE=<etapa> ok|waiting|received`; `input waiting` aparece justo antes del prompt, de modo que el propietario puede informar si el fallo fue antes o después de él.
2. **Códigos públicos allowlisted** (cualquier otro se convierte en `UNEXPECTED`; nunca se imprime excepción, longitud, posición, carácter, hash de entrada ni stderr):
   - integrity: `INTEGRITY_LOCATION`, `_PATH`, `_ACL`, `_LOCK`, `_SEAL`, `_FILE_MISSING`, `_FILE_HASH`, `_NODE`
   - preflight: `PREFLIGHT_START`, `_TIMEOUT`, `_REJECTED`
   - input/compare: `INPUT_READ_FAILED`, `INPUT_EMPTY`, `INPUT_MISMATCH`, `CANCEL_INPUT_NOT_EMPTY`, `COMPARE_CONVERT_FAILED`, `FRAME_FAILED`
   - receiver: `RECEIVER_START`, `TRANSPORT_WRITE`, `RECEIVER_TIMEOUT`, `RECEIVER_REJECTED`, `RECEIVER_EXIT`, `RECEIVER_CONTRACT`
   - cierre: `CLEANUP_FAILED`
3. **Formato de fallo**: `B67_SELFTEST=FAIL mode=<Accept|Cancel> stage=<etapa> code=<CÓDIGO> cleanup=<ok|failed>`.
4. **Limpieza verificable**: cada paso de `finally` está protegido; un fallo de limpieza o un hijo aún vivo convierte la ejecución en FAIL (`cleanup=failed`). Los `Kill()` en tiempo de espera esperan hasta 5 s la salida del hijo.
5. **Sin cambios de seguridad**: mismos controles (ubicación, DACL, propietario, rutas/reparse points, sello, siete hashes, Node, handles sin compartir escritura), mismo preflight antes del prompt, mismo sentinela único, misma comparación por unidades de carácter, mismo framing y mismos requisitos del contrato del receptor. Mismo texto de PASS: `B67_SELFTEST=PASS mode=… syntheticOnly=True cleanup=True`. El receptor `offline-receiver.mjs` es **idéntico** (`4C9628…6E`).
6. Los dos comandos manuales están separados (§6).

`deployment.json` conserva `kind:"two-sides-b67-offline-only"` (el receptor lo exige), `remoteEnabled:false`, y añade `revision:"B67.1"`.

## 3. Nuevo despliegue

```text
C:\Users\luis2\AppData\Local\TwoSides\AtlasV2FirstRead\5d135b5e8cb448df8c3a8a0a9adcb1a3
```

Creado con la DACL privada inicial de un directorio nuevo (protegida; FullControl solo para el usuario actual, SYSTEM y Administradores). Exactamente ocho archivos.

| Archivo | SHA-256 |
|---|---|
| `offline-selftest.ps1` | `1FA746AE8773E5600158E41AB208841E6F18D377D11BDE1C5DDB3B7DF9D1CA6A` |
| `deployment.json` (sello) | `285C83F70D040521F98607B74966810932DB44896F210E531A6C669E67E57DCD` |
| `offline-receiver.mjs` | `4C96280821292EF01F961E1B2C8BD81B31FA6ACF66802756CFBD8A92F9AD4F6E` |
| `gate.mjs` / `probe.mjs` / `receiver.mjs` / `send-first-read.ps1` (B66) | `E1FA6951…A695` / `FB7B63C4…2080` / `11FC67BC…3354` / `21AB67270…BBDE`, iguales a B66 |
| `v5-reference.json` | `2A4956E951217DFF2501D3FFBD35C9024554166E9126AD0134D8FB58C77AD726` |

Hash del sello en minúsculas (el parámetro lo exige): `285c83f70d040521f98607b74966810932db44896f210e531a6c669e67e57dcd`.

El despliegue B67 (`aeec6c0d34394a65817de04755d88535`) se conserva: 8 archivos; `offline-selftest.ps1` `97033A…885D` y `deployment.json` `A9372F…AA08` sin cambios. Los cinco archivos de referencia B66 en Descargas conservan sus hashes. El manifiesto v5 candidato (`2A4956…D726`) fue verificado por el preflight de cada ejecución de Accept (backend: cero diferencias); el manifiesto instalado v4 no se tocó.

## 4. Resultados de pruebas (datos sintéticos)

Batería `run-tests.ps1`: cada caso usa un directorio fixture desechable (runId propio, DACL privada, sello propio) junto a los despliegues, porque el selftest exige esa ubicación; cada fixture se elimina archivo a archivo y se comprueba su ausencia. Cada salida se valida contra una lista cerrada de líneas permitidas, y se comprueba que no aparezcan textos de entrada rechazada ni procesos residuales.

| Caso | Resultado esperado (y observado) |
|---|---|
| A01 Accept válido (Automation) | PASS |
| A02 Cancel válido (Automation) | PASS; no se inicia el receptor de datos |
| A03 archivo alterado | `integrity / INTEGRITY_FILE_HASH`; no llega al prompt |
| A04 digest de sello erróneo | `integrity / INTEGRITY_SEAL` |
| A05 archivo ausente | `integrity / INTEGRITY_FILE_MISSING` |
| A06 preflight rechazado | `preflight / PREFLIGHT_REJECTED`; no llega al prompt |
| A07 receptor rechaza | `receiver / RECEIVER_REJECTED` |
| A08 receptor sale con error | `receiver / RECEIVER_EXIT` |
| A09 receptor responde basura | `receiver / RECEIVER_CONTRACT` |
| A10 receptor incumple contrato | `receiver / RECEIVER_CONTRACT` |
| A11 error de transporte | `receiver / TRANSPORT_WRITE` (ver nota) |
| A12 receptor sin respuesta (60 s) | `receiver / RECEIVER_TIMEOUT`, hijo terminado |
| C01 consola real: Accept con sentinela | PASS |
| C02 Accept con entrada incorrecta | `compare / INPUT_MISMATCH`; no inicia receptor; la entrada no aparece |
| C03 Accept con entrada vacía (solo Enter) | `compare / INPUT_EMPTY` |
| C04 Accept con espacio adicional | `compare / INPUT_MISMATCH` |
| C05 Accept con una línea de comando pegada | `compare / INPUT_MISMATCH`; el texto pegado no aparece |
| C06 Cancel válido (Enter vacío) — cancelación segura | PASS; sin etapas `compare` ni `receiver` |
| C07 Cancel con texto | `compare / CANCEL_INPUT_NOT_EMPTY` |
| G01 ninguna entrada rechazada aparece en ninguna salida | PASS |
| G02 ningún fixture queda | PASS |

La batería se ejecutó completa una vez: 18 de 21 PASS. Los tres incumplimientos fueron **defectos de mi arnés, no del selftest**: A11 (expectativa errónea, ver nota) y C03/C06 (PowerShell 5.1 descarta un argumento vacío al pasar la entrada al inyector). Se corrigió únicamente el arnés y A11, C03 y C06 se repitieron individualmente: PASS. Por tanto el resultado es 19/19 casos más 2 comprobaciones globales, aunque no en una sola ejecución continua. Durante el primer intento detuve a mano los procesos del propio fixture de C03 y C06 para no esperar su timeout de 200 s.

**Nota sobre A11:** escribir a una tubería cuyo lector ya terminó **no lanza excepción** en este entorno; el fallo aparece como `RECEIVER_CONTRACT` (sin respuesta válida). El código `TRANSPORT_WRITE` se probó forzando el error de escritura (stdin cerrado, en una copia desechable con ese único cambio). No se acredita que una tubería rota real produzca `TRANSPORT_WRITE`.

**Despliegue real, sin interacción**, con el sello fijado: `-Automation` Accept y Cancel → PASS, código 0, con la secuencia de etapas completa. Inventario de 8 archivos, DACL protegida, sin procesos residuales ni listeners (3000, 8443, 27017).

**No ejercitados** (no hay forma sintética no invasiva): `INTEGRITY_LOCATION/PATH/ACL/LOCK/NODE`, `PREFLIGHT_START/TIMEOUT`, `INPUT_READ_FAILED`, `COMPARE_CONVERT_FAILED`, `FRAME_FAILED`, `RECEIVER_START`, `CLEANUP_FAILED`. Sus ramas están por inspección; no se afirma que se hayan probado.

## 5. Secretos y salidas

Todas las salidas de la batería coincidieron con una lista cerrada de líneas; los textos de entrada rechazada (`FAKE-REJECT…` y la línea de comando pegada) no aparecen en ninguna. Los únicos datos de entrada usados son el sentinela público y esas cadenas ficticias. No se usó ninguna contraseña real; no se escribió transcripción. Como en B67, no se puede demostrar ausencia de captura por software externo del mismo usuario, administradores o SYSTEM.

## 6. Comandos manuales para el propietario (no ejecutados por el agente)

Ejecutar **uno solo, y esperar a que PowerShell regrese**. No pegar otro comando junto a él ni mientras el prompt esté abierto. El sentinela es público: **no escribir ninguna contraseña real**.

**Accept** (primero):

```powershell
$d='C:\Users\luis2\AppData\Local\TwoSides\AtlasV2FirstRead\5d135b5e8cb448df8c3a8a0a9adcb1a3'; if(((Get-FileHash -LiteralPath "$d\offline-selftest.ps1").Hash -ne '1FA746AE8773E5600158E41AB208841E6F18D377D11BDE1C5DDB3B7DF9D1CA6A') -or ((Get-FileHash -LiteralPath "$d\deployment.json").Hash -ne '285C83F70D040521F98607B74966810932DB44896F210E531A6C669E67E57DCD')){'HASH DIFERENTE - NO CONTINUAR'}else{powershell.exe -NoProfile -File "$d\offline-selftest.ps1" -Mode Accept -DeploymentSha256 285c83f70d040521f98607b74966810932db44896f210e531a6c669e67e57dcd}
```

Cuando aparezca `B67_STAGE=input waiting`, escribir exactamente `B67-ONLY-FAKE-2026!` (sin espacios antes ni después; si se pega, sin saltos de línea) y pulsar Enter una vez.

**Cancel** (solo después de comunicar el resultado de Accept):

```powershell
$d='C:\Users\luis2\AppData\Local\TwoSides\AtlasV2FirstRead\5d135b5e8cb448df8c3a8a0a9adcb1a3'; if(((Get-FileHash -LiteralPath "$d\offline-selftest.ps1").Hash -ne '1FA746AE8773E5600158E41AB208841E6F18D377D11BDE1C5DDB3B7DF9D1CA6A') -or ((Get-FileHash -LiteralPath "$d\deployment.json").Hash -ne '285C83F70D040521F98607B74966810932DB44896F210E531A6C669E67E57DCD')){'HASH DIFERENTE - NO CONTINUAR'}else{powershell.exe -NoProfile -File "$d\offline-selftest.ps1" -Mode Cancel -DeploymentSha256 285c83f70d040521f98607b74966810932db44896f210e531a6c669e67e57dcd}
```

Cuando aparezca `input waiting`, pulsar solo Enter, sin escribir nada.

Comunicar únicamente las líneas públicas `B67_STAGE=…` y `B67_SELFTEST=…`. Si hay FAIL, no repetir ni modificar nada: el par `stage`/`code` indica la causa. No copiar al chat ningún texto introducido.

## 7. Procedimiento de reversión

Esta versión no cambia B67 ni el backend; revertirla es dejar de usarla.

1. No usar el despliegue `5d135b5e…`. El despliegue B67 anterior sigue disponible y con sus hashes originales.
2. Si se desea borrar el despliegue nuevo: eliminar únicamente sus 8 archivos y luego el directorio `5d135b5e8cb448df8c3a8a0a9adcb1a3`, nunca `TwoSides` o `AtlasV2FirstRead`. Sin borrado recursivo del perfil. No forma parte de esta fase.
3. Si se desea quitar las fuentes: eliminar `backend/tools/atlas-v2-first-read/b67-1/` (cuatro archivos) y este informe. No afecta al manifiesto v5 (la carpeta está fuera de su ámbito).

## 8. Riesgos residuales y condiciones

- La causa de los dos FAIL manuales sigue sin conocerse; esta versión solo permite identificarla en el siguiente intento. Un PASS manual no validaría Atlas.
- El modo `-Automation` y las pruebas de consola con teclas sintéticas no reproducen ni la distribución de teclado, ni el pegado desde un portapapeles, ni otro terminal del propietario.
- El preflight vuelve a verificar el backend contra la copia candidata v5; una modificación de archivos cubiertos por v5 durante la prueba produciría `PREFLIGHT_REJECTED` o `RECEIVER_REJECTED`. Evitar ediciones del backend (B60) mientras se ejecuta.
- B00 sigue pendiente. v5 sigue sin activarse. El canal real requiere, como en B67 §8, activación v5 autorizada por separado y autorización remota nueva.

**Estado: despliegue y pruebas automáticas completos. Detenido tras las pruebas automáticas, como se pidió; sin ensayo manual en nombre del propietario.**
