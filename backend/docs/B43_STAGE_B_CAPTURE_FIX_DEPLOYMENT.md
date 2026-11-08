# B43 — Despliegue controlado de la corrección B42

Fecha: 2026-11-02 (22:17 hora local al cierre). runId `bbaa257d-2bcb-42a3-8f4f-f0e364fe7e38`, operationId `011a0fdc-b58b-4dba-90b5-4087ae2cb7fb`.

## 1. Verificaciones previas (todas correctas; se desplegó solo después)
- Las tres plantillas tienen el SHA-256 esperado y son idénticas a las copias que el autotest B42 (202 correctas / 0 fallos) ejecutó.
- 0 procesos `node`/`caddy`/`Godot`; 0 listeners en 3000/3001/8443; 0 conexiones a 27017.
- Manifiesto v4 ok (3169 archivos, 0 diferencias); ACL de secretos e integridad `conforming`.
- Estado: runId correcto, `A=ok`, `B=failed`, `baseline=null`, sin cuenta; operationId sin cambios.
- El envoltorio de inspección no existía; la carpeta de respaldo no existía.

## 2. Respaldos (carpeta nueva, fuera de OneDrive, nada sobrescrito)
`%LOCALAPPDATA%\TwoSidesBackendBackups\pre-B43-20261102\` (con `SHA256SUMS.txt`):

| Archivo | SHA-256 |
|---|---|
| `sync-test-staged.ps1.previous` (controlador B41) | `78032EF157A992E8F124D75D7B4FAE9C13E7B4FC4A67B6D7F7E63CA975E7AA7D` |
| `run-verify-synthetic.ps1.previous` (lanzador antiguo) | `8AC2E82282E0838FF5D36BA505ED56F45C5E424C6FDA7E5CB33C6EF106C70EF1` |

## 3. Despliegue en `%LOCALAPPDATA%\TwoSidesSyntheticRun\`

| Archivo desplegado | Antes | SHA-256 nuevo (= esperado) |
|---|---|---|
| `sync-test-staged.ps1` | `78032EF1…` | `2F0275B22AEE4DB2B87FE54B42FA91F606105EA7280633FD7B213D5174786DA1` |
| `run-main-inspection-captured.ps1` | no existía | `D4860B70D438E0DAEF0FCD02D556F1D77F40A6A075ACBA71E2F734EE24F97577` |
| `run-verify-synthetic.ps1` | `8AC2E822…` | `8A751B0B90E59758624C9E642F7FB7702E8BCDEDA0EFFBF97D7DDF32F9FCC9A5` |

- Sintaxis PowerShell: 0 errores en los tres (análisis sin ejecutar).
- ACL de cada archivo: herencia desactivada y una única regla explícita (usuario actual, control total); verificado (1 principal, solo el usuario).
- Las plantillas del repositorio no se modificaron (hashes sin cambios). No se ejecutó el controlador ni ningún lanzador.

## 4. Comprobaciones posteriores
- Archivos de la ejecución intactos: `stage-state.json` `7839CECC…3A0C`; `batch.json` `6cfdd2b2…`; `receipts-query.json` `22bdbe54…`; `run-ids.json` `ba13b4d4…1c97`; la carpeta sigue con los 4 archivos. runId y operationId sin cambios; `A=ok`, `B=failed`, `baseline=null`, sin cuenta ni `secrets.dpapi`.
- Manifiesto v4: `verify` ok (3169, 0 diferencias); archivo `7DEC55E3E1053F7F63A0D2B859ACB0A56FF931E82DB7BBB2625734326D6C3E8B` sin cambios. `src/`, `scripts/`, `tests/` sin cambios; escáner de secretos limpio.
- Sin conexiones a Atlas (0 a 27017), sin Express/Caddy/Godot, sin listeners; 44 certificados raíz y la CA temporal (`F2BF0E8D…`) no instalada.
- No se creó ninguna autorización de inspección nueva (las últimas son de 21:11 y 21:44).

## 5. Condiciones para repetir la etapa B
1. Autorización expresa del propietario (frase `AUTORIZO-ETAPA-B-bbaa257d`).
2. Mismo día local que la etapa A (2026-11-02): **antes de medianoche**; si cambia el día, repetir A sin regenerar identificadores (la excepción debe indicarse antes).
3. Comando (consola del propietario, Compass cerrado), con `-Resume` porque B está `failed`:
   `powershell -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\TwoSidesSyntheticRun\sync-test-staged.ps1" -Stage B -Resume -RunDir "$env:LOCALAPPDATA\TwoSidesSyntheticRun\run-20261102-164320" -ConfirmPhrase AUTORIZO-ETAPA-B-bbaa257d`
4. El controlador crea la autorización de un solo uso (60 min) y el propietario escribe la contraseña en el prompt oculto del envoltorio; se aceptará el informe solo con las comprobaciones de procedencia de B42.
5. La línea base registrada caduca a los 60 min para la etapa C; C requiere además su propia autorización, la CA instalada por el propietario y Caddy/Express en marcha.
