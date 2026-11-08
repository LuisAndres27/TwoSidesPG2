# B42 — Corrección de la captura del informe de las etapas B/D/E (offline)

Fecha: 2026-11-02. runId `bbaa257d-2bcb-42a3-8f4f-f0e364fe7e38`, operationId `011a0fdc-b58b-4dba-90b5-4087ae2cb7fb` (sin cambios).

## 1. Fallo

La etapa B real terminó con `exitCode 21 / reason inspection` aunque la inspección fue correcta (`ready`, `writes 0`, `closed true`). `scripts\run-main-inspection.ps1` arranca `node` con la consola heredada (`UseShellExecute=false`, sin redirigir salida): el JSON no pasa por el flujo que captura `Invoke-Inspection`; `$report` quedó nulo y `Stage-B` marcó `failed`. El autotest no lo vio porque sus lanzadores falsos escribían por el flujo normal. `run-verify-synthetic.ps1` (etapas D/E) tiene el mismo defecto.

## 2. Evaluación de la solución más segura: leer el informe local

Registro que deja el lanzador (`<executionId>.inspection.json`): `kind`, `executionId`, `startedAt/finishedAt`, `result{completed, verdict}`. Es JSON plano, sin firma ni MAC; **no contiene** conteos, `writes` ni `closed`. No permite comprobar la línea base (requisito 8) ni `writes/closed` (7) ni integridad (5). **Descartado como sustituto**; sí se usa como corroboración (ver §3).

## 3. Solución elegida

1. **Envoltorio de captura** `run-main-inspection-captured.ps1.template` (despliegue: `%LOCALAPPDATA%\TwoSidesSyntheticRun\run-main-inspection-captured.ps1`): copia fiel del lanzador del repositorio (deshabilitado salvo `-Enable`, autorización obligatoria, prompt oculto, contraseña solo por stdin en un marco con prefijo de longitud, entorno del hijo vacío, sin contraseña/URI en argumentos, archivos o salida) con **una sola diferencia funcional**: redirige y lee stdout/stderr del hijo, reemite stdout al flujo de salida, muestra stderr con prefijo, propaga el código de salida y trata «salida vacía con código 0» como fallo (exit 3). Sigue ejecutando `scripts\run-main-inspection.js` del backend con integridad verificada; `scripts/` no se toca.
2. **Lanzador de verificación** `run-verify-synthetic.ps1.template`: misma corrección (captura + código de salida).
3. **Controlador** (`sync-test-staged.ps1.template`): en modo real usa solo esos dos lanzadores **fijados por SHA-256**; además `Confirm-ToolReport` acepta un informe solo si: `finished`; `executionId` igual al de la autorización recién creada (nombre de archivo = id interno); `writes` = 0; `closed` = true; existe el registro local de esa ejecución, con el mismo `kind` y `executionId`, `finishedAt` entre el inicio de la autorización (−1 min) y ahora (+1 min), y veredicto confirmado por el registro (`completed` = true en inspección); no existía registro previo (reutilización); código de salida 0 y salida no vacía. Cualquier fallo → rechazo cerrado (B/E: exit 21, D: exit 21 `verification`/30 según el caso) sin registrar línea base. El modo de prueba también rechaza el nuevo lanzador por nombre.

## 4. Autotest (offline)

**202 correctas / 0 fallos** (163 previas + 39 nuevas), primera ejecución completa tras los cambios. Casos nuevos: hijo con consola heredada (el defecto real) → 21; salida vacía; JSON mal formado; JSON válido con código 5; executionId distinto; sin registro local; registro antiguo; registro alterado; `writes≠0`; `closed≠true`; veredicto no `ready`; B se queda `failed` sin línea base y sin peticiones; C bloqueada; reanudación con `-Resume` con ruido en stdout/stderr → B=ok, runId/operationId/`run-ids.json` intactos, sin cuenta ni logins; D rechaza verificaciones sin procedencia y no reenvía; envoltorios (copias con solo el prompt y la ruta sustituidos): JSON llega al flujo, contraseña solo por stdin (12 bytes), entorno vacío, stderr visible, vacío → 3, código 7 propagado, un invocador con captura de canalización recibe exactamente un JSON; los hashes fijados en el controlador coinciden con las plantillas.

## 5. Hashes definitivos (plantillas; aún NO desplegadas)

| Archivo | SHA-256 |
|---|---|
| `sync-test-staged.ps1.template` | `2F0275B22AEE4DB2B87FE54B42FA91F606105EA7280633FD7B213D5174786DA1` |
| `run-main-inspection-captured.ps1.template` | `D4860B70D438E0DAEF0FCD02D556F1D77F40A6A075ACBA71E2F734EE24F97577` |
| `run-verify-synthetic.ps1.template` | `8A751B0B90E59758624C9E642F7FB7702E8BCDEDA0EFFBF97D7DDF32F9FCC9A5` |
| `staged-selftest.ps1.template` | `D85A112FB3D6B9A494D5DB0A6873C917F44EC874D194678A403F747C9E3C6022` |

Desplegado hoy (sin cambios): controlador `78032EF1…` (versión B41), `run-verify-synthetic.ps1` antiguo `8AC2E822…`; el envoltorio de inspección no existe aún.

## 6. Estado e integridad

- `stage-state.json` sin cambios desde el diagnóstico: `A=ok`, `B=failed`, `baseline null`, sin cuenta (SHA-256 `7839CECC…3A0C`). Se mantienen `batch.json`, `receipts-query.json`, `run-ids.json`.
- Manifiesto v4 ok (3169, 0 diferencias; archivo `7DEC55E3…`); `src/`, `scripts/`, `tests/` sin cambios; ACL `conforming`; escáner de secretos limpio; respaldos pre-F1/pre-F2/pre-controller-update sin discrepancias.
- Sin procesos node/caddy/Godot, sin listeners, sin conexiones a 27017, 44 certificados raíz, sin autorizaciones nuevas.

## 7. Para repetir la etapa B

1. Autorizar el despliegue de las tres plantillas en `%LOCALAPPDATA%\TwoSidesSyntheticRun\` (con respaldo del controlador y del lanzador de verificación actuales y verificación de hash).
2. Ejecutar `sync-test-staged.ps1 -Stage B -Resume -RunDir … -ConfirmPhrase AUTORIZO-ETAPA-B-bbaa257d` en la consola del propietario; contraseña en el prompt oculto (autorización nueva de un solo uso, 60 min). Mismo día local.

## 8. Riesgos residuales

- El prompt oculto de los envoltorios solo se prueba con una copia que sustituye esa línea; su comportamiento con consola real se confirmará en la ejecución del propietario.
- El registro local no tiene firma: la procedencia se sostiene en autorización de un solo uso + identidad + marca de tiempo + coincidencia con la salida + hash fijado de los lanzadores, no en un MAC.
- SCRAM-SHA-1 sigue abierto; el certificado del servidor vence el 2026-11-16.
