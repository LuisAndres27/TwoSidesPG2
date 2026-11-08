# B44 — Preparación de la etapa C (primera escritura sintética). NO ejecutada.

Fecha de preparación: 2026-11-02 22:22 hora local. runId `bbaa257d-2bcb-42a3-8f4f-f0e364fe7e38`, operationId `011a0fdc-b58b-4dba-90b5-4087ae2cb7fb`.

## 1. Estado registrado (solo lectura)
- `stage-state.json` (SHA-256 `AAC98B57…6D93`): `A=ok` (2026-11-02 16:43 local), `B=ok` (línea base registrada 2026-11-03T04:19:00.9Z = 22:19 local), `logins 0`, sin cuenta, sin `secrets.dpapi`.
- Línea base registrada = esperada: main_v2 `operations 1, facts 1, fences 2, identities 1, ownerGuards 1, identitySessions 1, revocations 0`; históricas `users 2, decisions 7, gameevents 13, gameprogresses 2, statisticevents 14, statisticsummaries 2, syncidentities 1`.
- `batch.json` `6cfdd2b2…`, `receipts-query.json` `22bdbe54…`, `run-ids.json` `ba13b4d4…` sin cambios; operationId y runId sin cambios.
- Manifiesto v4 ok (3169); controlador/lanzadores desplegados con los hashes de B43; sin procesos node/caddy/Godot; sin listeners; 0 conexiones a 27017.

## 2. Vigencia
| Elemento | Vigencia |
|---|---|
| Línea base de B (máx. 60 min al iniciar C) | **caduca 2026-11-03T05:19:00Z = 23:19 local** (quedaban ~57 min a las 22:22) |
| Etapa A / B: «mismo día local» | 2026-11-02; vence a las 00:00 |
| Certificado de servidor (`CN=localhost`) | vence **2026-11-16 00:10** (13 días) |
| CA temporal (`F2BF0E8D…`) | vence 2026-12-02 (29 días); no instalada; no hay clave privada de la CA en disco |
| Autorización de inspección | no hay ninguna vigente (C no la usa; D/E crearán otra cada una) |

**Bloqueo a vigilar:** el controlador nunca repite una etapa terminada (`B ok` → «never run twice»), pero C rechaza una línea base de más de 60 min diciendo «repeat stage B». Si C no arranca antes de las 23:19 queda un callejón sin salida con este runId. Salidas posibles (requieren decisión del propietario): (a) pasar `-BaselineMaxAgeMinutes <n>` a C (parámetro existente; relaja la frescura de la línea base, aceptable si nadie escribió en Atlas entre tanto: Compass cerrado); (b) abrir un runId nuevo (A+B de nuevo); (c) corregir el controlador para permitir repetir B.

## 3. Procedimiento propuesto (el propietario ejecuta cada paso; nada se ha ejecutado)
Variables comunes: `$L=$env:LOCALAPPDATA; $B="C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend"; $RUN="$L\TwoSidesSyntheticRun\run-20261102-164320"`.

1. **Cerrar MongoDB Compass.**
2. **CA temporal (manual, aceptar el aviso de Windows):**
   `certutil -user -addstore Root "$L\TwoSidesLocalProxy\tls\ca.crt"` → comprobar: `(Get-ChildItem Cert:\CurrentUser\Root).Count` = 45 y existe la huella `F2BF0E8DC06AC9C4F12F27ECD6841438A5D412A7`.
3. **Caddy (solo 127.0.0.1:8443, sin `--watch`):**
   ```powershell
   (Get-FileHash "$L\TwoSidesLocalProxy\bin\caddy.exe").Hash   # 5F93A9BD555F3AAC9D33AF2756BA14B3519D8CCA4FFD55256BDAEAB444C9DB2A
   $env:XDG_DATA_HOME="$L\TwoSidesLocalProxy\data"; $env:XDG_CONFIG_HOME="$L\TwoSidesLocalProxy\config"
   $caddy = Start-Process "$L\TwoSidesLocalProxy\bin\caddy.exe" -ArgumentList 'run','--config',"$L\TwoSidesLocalProxy\Caddyfile" -WindowStyle Hidden -PassThru; $caddy.Id
   Get-NetTCPConnection -State Listen -OwningProcess $caddy.Id | Select LocalAddress,LocalPort   # solo 127.0.0.1:8443
   ```
   El Caddyfile fija `bind 127.0.0.1`, `admin off`, `auto_https off`, Host obligatorio `localhost` (421 si no), solo `/api/*`, proxy a `127.0.0.1:3000`, `response_header_timeout 15s`.
4. **Express (consola propia; la contraseña se escribe en el prompt oculto; escucha solo 127.0.0.1:3000):**
   ```powershell
   & "$B\scripts\run-main-backend.ps1" -EnableMain -SigningKeyFile "$L\TwoSidesMainSecrets\keys\main-jwt.pem" -KeyId main-2026-11 -IntegrityManifest "$L\TwoSidesMainIntegrity\backend-integrity-manifest.json" -ExpectedTreeDigest aea04105001d5ca324f817602e781cf5118789f9187c8424c204551ac800e27e -ExpectedKeyFingerprint 811cd75bcf98dcb88c766f369431e3886f75188ad3fec59d8bbbbe0eab9d8aec
   ```
   **Ojo:** el arranque conecta a Atlas (identidad `twosides_backend`, con permisos de escritura) y ejecuta el calentamiento F1 (lecturas de verificación de despliegue); si falla, no arranca.
5. **HTTPS:** `curl.exe -sS -o NUL -w "%{http_code}`n" https://localhost:8443/api/health` → `200`. Cualquier error de certificado: detenerse.
6. **Etapa C (una sola; consola del propietario; dentro de la ventana de la línea base):**
   `powershell -NoProfile -ExecutionPolicy Bypass -File "$L\TwoSidesSyntheticRun\sync-test-staged.ps1" -Stage C -RunDir $RUN -ConfirmPhrase AUTORIZO-ETAPA-C-bbaa257d`
   Hace: health → **1 registro** → **1 sesión** → **1 lote de 1 operación** (los bytes exactos de `batch.json`). Esperado: 201 / 200 / 200 `all_accepted`+`committed`. Cualquier resultado distinto: parada sin reenviar; exit 20 = resultado desconocido (se resuelve en D, nunca con identificadores nuevos).
7. **Deltas esperados de C** (se comprueban en D/E): identities +1, ownerGuards +1, identitySessions +1, operations +1, facts +1, fences +1, revocations 0; históricas sin cambios.
8. **Cierre** (solo después de D y E; **no** ejecutar la etapa G antes: borra la credencial protegida que D/E necesitan):
   - Express: `Ctrl+C` en su consola (apagado ordenado).
   - Caddy: `Stop-Process -Id <pid de Caddy>` (o G con `-StopCaddy -CaddyPid <pid>` y frase `AUTORIZO-ETAPA-G-bbaa257d`).
   - Etapa G: `… -Stage G -RunDir $RUN` (verifica ausencia de `secrets.dpapi` y temporales).
   - **CA (manual):** `certutil -user -delstore Root F2BF0E8DC06AC9C4F12F27ECD6841438A5D412A7` → 44 certificados.

## 4. Salvaguardas confirmadas
- Solo IDs sintéticos de `run-ids.json`; el controlador fija bytes (SHA-256 de `batch.json`/`receipts-query.json`), lista blanca HTTP (`GET /api/health`, `POST registrations/sessions/sync/batches/sync/receipts/query`), URL fija `https://localhost:8443`; sin DELETE/PUT/PATCH; nada de borrado automático; colecciones históricas no tocadas (el perfil main solo escribe `main_v2_*`; E lo comprueba).
- Contraseñas: solo en prompts ocultos de los lanzadores existentes; el controlador guarda credencial sintética y JWT únicamente en `secrets.dpapi` (DPAPI CurrentUser, ACL propia, falla cerrado); nada secreto en salida.
- Integridad: Express/arranque exigen manifiesto v4 + huella JWT (`811cd75b…9d8aec`) antes del prompt.

## 5. Riesgos
1. Ventana de la línea base (23:19) y medianoche (§2).
2. La instalación de la CA concede confianza a esa CA en tu cuenta hasta retirarla; mitigado por: sin clave privada de la CA en disco, solo `CurrentUser`, retirada inmediata al terminar.
3. El arranque de Express usa una identidad de Atlas con escritura: primera escritura real de F1+F2; resultado desconocido (20) posible si falla la red.
4. Certificado de servidor con 13 días; SCRAM-SHA-1 abierto; H1 (timeout cliente vs presupuesto del lote) pendiente para F3.
5. `curl.exe`/HTTPS depende del almacén de Windows: error de certificado = parar.

## 6. Condiciones para autorizar C
Autorización explícita que cubra: instalar la CA (por ti), arrancar Caddy y Express (por ti o delegado), conexión de Express a Atlas, **las tres escrituras** de C (registro, sesión, lote de 1 operación) y la frase `AUTORIZO-ETAPA-C-bbaa257d`; decisión sobre el plan si se supera 23:19 (§2); Compass cerrado; mismo día local. D y E requieren cada una su propia autorización.
