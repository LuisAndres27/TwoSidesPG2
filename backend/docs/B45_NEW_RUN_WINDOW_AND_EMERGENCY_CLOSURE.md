# B45 — Ventana de vigencia, ejecución nueva (opción B) y cierre de emergencia. NO ejecutado.

Fecha: 2026-11-02 22:27 hora local. Decisión del propietario: **opción B** (ejecución nueva con A y B repetidas si la línea base caduca antes de C). Sin ampliar `BaselineMaxAgeMinutes`, sin modificar el controlador.

## 1. Estado de la línea base actual (solo lectura)
- runId `bbaa257d-2bcb-42a3-8f4f-f0e364fe7e38`: `A=ok`, `B=ok`, **sin etapa C**, sin cuenta, sin `secrets.dpapi`; `stage-state.json` `AAC98B57…`, sin cambios.
- Línea base registrada 22:19:00 local → **vigente hasta las 23:19:00** (quedaban 52 min a las 22:27). Medianoche local en ~93 min.
- Sin procesos, listeners ni conexiones a Atlas; 44 certificados raíz (CA temporal no instalada).

**Regla de decisión:** la ejecución existente solo se usa si C puede *empezar* antes de las 23:19 con los pasos 2–5 de B44 ya hechos (CA, Caddy, Express, HTTPS ≈ 10–15 min con autorizaciones en curso). Si no, o si hay cualquier duda, se **conserva intacta como evidencia** y se abre una ejecución nueva. No se modifica ninguna marca de tiempo ni archivo de estado. Esta ejecución nunca escribió en Atlas: sus identificadores solo existen en su carpeta.

## 2. ¿Es necesaria una ejecución nueva?
Hoy: probablemente **sí** salvo que autorices C ahora mismo y el arranque de servicios sea fluido; el margen (≈50 min) deja poco para imprevistos y los pasos D/E vienen después. **Recomendación:** empezar la ejecución nueva con **al menos 90 minutos hasta la medianoche** (o a primera hora de mañana). Hoy quedan ~93: viable pero ajustado; mañana es más holgado. Todas las etapas de una ejecución deben quedar en el mismo día local (A, B, C, D, E).

## 3. Procedimiento para una ejecución nueva (orden que cabe en las ventanas)
Variables: `$L=$env:LOCALAPPDATA; $B="C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend"; $V4="aea04105001d5ca324f817602e781cf5118789f9187c8424c204551ac800e27e"; $FP="811cd75bcf98dcb88c766f369431e3886f75188ad3fec59d8bbbbe0eab9d8aec"`.

| Paso | Qué | Red/Atlas | Autorización |
|---|---|---|---|
| 0 | La ejecución anterior queda tal cual (no se borra ni se reutiliza). Comprobar que nada escucha, Compass cerrado | no | — |
| 1 | **Crear identificadores nuevos** (local): `$RUN2="$L\TwoSidesSyntheticRun\run-$(Get-Date -Format yyyyMMdd-HHmmss)"; node "$L\TwoSidesSyntheticRun\build.mjs" $B $RUN2`. runId, registrationId, installationId, localPlayerId, sessionId, **operationId**, leaseId y batchId son nuevos; el controlador rechaza cualquier id repetido respecto a otras carpetas de ejecución y al ensayo real previo (`Test-RunMaterial`). Nunca se reutiliza el operationId anterior | no | **Autorización 1** (A + crear carpeta) |
| 2 | **Etapa A** (local): `powershell -NoProfile -ExecutionPolicy Bypass -File "$L\TwoSidesSyntheticRun\sync-test-staged.ps1" -Stage A -RunDir $RUN2 -ConfirmPhrase AUTORIZO-ETAPA-A-<8 primeros del runId nuevo> -ExpectedTreeDigest $V4 -ExpectedKeyFingerprint $FP` (misma verificación: manifiesto v4, preflight, ACL, escáner, puertos, CA no instalada, respaldos) | no | incluida en Autorización 1 |
| 3 | Instalar la CA (propietario): `certutil -user -addstore Root "$L\TwoSidesLocalProxy\tls\ca.crt"`; comprobar 45 certificados | no | **Autorización 2** (servicios) |
| 4 | Caddy en 127.0.0.1:8443 (comandos de B44 §3.3) | no | Autorización 2 |
| 5 | Express (prompt oculto; conecta a Atlas y hace el calentamiento F1; escucha 127.0.0.1:3000) | **sí (lecturas de despliegue)** | Autorización 2 |
| 6 | Comprobar HTTPS: `curl.exe -sS -o NUL -w "%{http_code}`n" https://localhost:8443/api/health` → 200 | no | — |
| 7 | **Etapa B** (solo lectura, prompt oculto): `… -Stage B -RunDir $RUN2 -ConfirmPhrase AUTORIZO-ETAPA-B-<id8>`. Va **después** de arrancar los servicios para que su línea base sea la más reciente respecto a C y confirme que el arranque de Express no alteró conteos (si hubiese discrepancia → código 31 y parada) | sí (lectura) | **Autorización 3** (B) |
| 8 | **Etapa C inmediatamente** (≤ 10 min tras B; límite duro 60): `… -Stage C -RunDir $RUN2 -ConfirmPhrase AUTORIZO-ETAPA-C-<id8>` | **sí (3 escrituras)** | **Autorización 4** (C) |
| 9 | D, luego E: cada una con su autorización y su frase; no hay límite de frescura de la línea base para ellas, sí el mismo día | sí | Autorizaciones 5 y 6 |
| 10 | Cierre ordenado (§4) y G al final | no | Autorización 7 (G) |

Para minimizar esperas, las Autorizaciones 3 y 4 pueden darse con antelación **condicionadas** («B y C seguidas si B=ok; parar si cualquier salida ≠ ok»), pero cada una sigue exigiendo su frase al ejecutarse; el controlador no avanza solo.

Si la línea base de la ejecución nueva caduca antes de C (C da exit 11 `stale-baseline`), se repite el procedimiento con **otra** ejecución nueva; no se relaja el límite.

## 4. Cierre de emergencia
**Tres niveles distintos, siempre en este orden y por separado:**
1. **Cierre de servicios** (no destruye nada): Express con `Ctrl+C` en su consola (apagado ordenado); solo si no responde, `Stop-Process -Id <pid node>` y anotarlo como parada forzada. Caddy: `Stop-Process -Id <pid de Caddy>`. Comprobar: `Get-Process node,caddy,Godot* -EA SilentlyContinue` vacío y `Get-NetTCPConnection -State Listen | ? LocalPort -in 3000,3001,8443` vacío.
2. **Retirada de la CA** (inmediata, aunque la prueba falle; no la deja instalada ninguna avería): `certutil -user -delstore Root F2BF0E8DC06AC9C4F12F27ECD6841438A5D412A7`; comprobar 44 certificados, ausencia de la huella y de «Two Sides» en `LocalMachine\Root`. Reinstalarla después, si hace falta, es barato.
3. **Limpieza definitiva de credenciales** (etapa G): borra `secrets.dpapi` (credencial sintética + JWT). **Solo** cuando D y E hayan terminado o el propietario decida abandonar la ejecución. **G no tiene modo «solo servicios»**: aunque se le pase `-StopCaddy`, también borra el secreto. Para cerrar servicios sin perder la recuperación, usar los comandos manuales del nivel 1.

**Por tipo de fallo en C:**

| Resultado de C | Qué significa | Qué hacer |
|---|---|---|
| exit 21 en health / registro / sesión (HTTP definitivo, sin lote enviado) | no hubo escritura del lote | niveles 1 y 2; conservar la carpeta tal cual; decidir tras diagnóstico (el registro es idempotente por `registrationId`; con la misma carpeta se reanuda con `-Resume`) |
| exit 20 (resultado desconocido: timeout, conexión cortada, 5xx) | el commit puede existir | **No ejecutar G.** Conservar `stage-state.json`, `run-ids.json`, `batch.json`, `receipts-query.json`, `secrets.dpapi` y el texto de la consola. Si los servicios siguen sanos, ejecutar D (verificación de solo lectura y reenvío idéntico: `duplicate` si el commit existió, `committed` una vez si no). Si hay que parar: niveles 1 y 2 y retomar después con servicios reinstalados y D/-Resume. Nunca un operationId nuevo |
| exit 30 (recibo/verificación inconsistente) | posible escritura incoherente | parar sin reenviar; niveles 1 y 2; conservar todo; análisis manual con la verificación de solo lectura; sin tocar Atlas |
| Proceso de C muerto (consola cerrada, corte) | estado `started` y bloqueo huérfano | no editar el estado; no G; reanudar con `-Resume` tras decidir (la reanudación reutiliza cuenta, credencial y bytes) |
| Express se cae o se cuelga | respuestas perdidas | nivel 1; tratar como desconocido (fila exit 20) hasta verificar con D |

**Información a conservar para reconciliar:** `stage-state.json`, `run-ids.json`, `batch.json`, `receipts-query.json`, `secrets.dpapi` (no copiarlo ni imprimirlo), registros `*.inspection.json` / `*.verification.json` de `TwoSidesInspection`, salida de consola de C y de Express. **Prohibido:** borrar documentos de Atlas, editar el estado a mano, regenerar identificadores o el operationId de una ejecución ya enviada, ejecutar G «para limpiar» antes de decidir D/E.

## 5. Puntos que requieren autorización explícita
1. Crear la ejecución nueva + etapa A (local).
2. Instalar la CA (por ti), arrancar Caddy y Express (conexión a Atlas con la identidad de escritura).
3. Etapa B (lectura Atlas, prompt oculto).
4. Etapa C (tres escrituras reales).
5. Etapa D (verificación + reenvío idéntico), 6. Etapa E (receipts/query y deltas finales).
7. Etapa G (borrado de credenciales) y cierre; retirada de la CA siempre por ti.
Además: cualquier desviación (exit ≠ 0) detiene la secuencia hasta nueva instrucción.
