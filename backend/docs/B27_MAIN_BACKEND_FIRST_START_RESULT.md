# B27 — Primer arranque controlado de Express `main` (Etapa 31)

Fecha: 2026-11-02. El **propietario** ejecutó el lanzador `scripts/run-main-backend.ps1` en su terminal (la contraseña se escribió solo en el prompt oculto; Claude no la vio ni pudo introducirla) y Claude comprobó antes y después, solo en lectura. **Claude no arrancó Express, no conectó Atlas, no ejecutó Godot ni tocó SQLite, JWT, `.env`, respaldos, ACL ni el proyecto; sin commits ni `push`. B00 sigue pendiente.**

## 1. Verificaciones previas (Claude, solo lectura)

| Comprobación | Resultado |
|---|---|
| `backend-integrity verify` (manifiesto v2) | `ok`, 3 168 archivos, 0 añadidos/quitados/modificados |
| `main-preflight` con las anclas (digest `126a6cee…e433`, huella pública `811cd75b…9d8aec`, id `main-2026-11`) | `ok` en 5 comprobaciones (`key_id`, `anchors`, `key`, `key_fingerprint`, `manifest`) |
| ACL de `TwoSidesMainSecrets` | `conforming` |
| Puerto 3000 / 8443; procesos `node`/`caddy` | libres / 0 (Caddy detenido) |
| CA de pruebas en `CurrentUser\Root` | 0 entradas; 44 certificados |
| Destino fijado en código (`src/main/policy.js`) | `<cluster>.<id>.mongodb.net`, base `two_sides_db`, usuario `twosides_backend`, colecciones `main_v2_*` |

## 2. Arranque (confirmado por el propietario)

Lanzador con `-EnableMain`, clave `…\TwoSidesMainSecrets\keys\main-jwt.pem`, id `main-2026-11`, guardia de integridad con manifiesto real y las dos anclas; la contraseña solo por el prompt oculto (se transmite por stdin, nunca en argumentos, archivos ni registros). Resultado informado: la guardia pasó, Express `main` arrancó, se conectó a Atlas y escuchó en **`127.0.0.1:3000`** (único puerto).

## 3. `GET /api/health`

HTTP **200**, cuerpo `{"status":"ok","service":"two-sides-backend"}`. Solo esa petición; sin sincronización, jugadores, identidades técnicas ni escrituras.

## 4. Parada

Proceso Node PID **25420** finalizado con `Stop-Process -Id 25420` (**terminación forzada**, no el cierre ordenado por Ctrl+C/SIGINT que ejecuta `backend.close`). Consecuencia: la conexión a Atlas se cortó sin cierre limpio del pool; no hubo operaciones de escritura en vuelo (solo se llamó a `/api/health`), pero la parada ordenada y su código de salida **no quedan verificados**. Para próximas pruebas, preferir Ctrl+C.

## 5. Limpieza verificada por Claude

| Comprobación | Resultado |
|---|---|
| PID 25420 | no existe |
| Procesos `node`/`caddy`; powershell del lanzador | 0 / 0 |
| Escuchas 3000, 8443, 2019, 80, 443; conexiones hacia 3000 | 0 / 0 |
| Certificados «Two Sides» instalados | 0 (`CurrentUser\Root` = 44) |
| Integridad tras el arranque | `ok`, 3 168 archivos sin cambios |
| Escáner de secretos | `clean` |
| `tls\` conservado | `ca.crt`, `localhost.crt`, `localhost.key` |

## 6. No verificado / riesgos pendientes

- **Colecciones de Atlas:** Claude no se conectó, así que no confirmó que el arranque no modificó nada. Es de esperar (no hay escrituras en el flujo de arranque ni en `/api/health`) pero solo una inspección de solo lectura autorizada lo demostraría.
- Parada forzada (§4).
- Express arrancó **sin** Caddy: no se probó la cadena completa Godot → Caddy → Express. Reinstalar la CA para ello reabre la exposición de `localhost.key` hasta 2026-11-16 (la CA caduca el 2026-12-02; no se pueden emitir más certificados).
- B00: copias antiguas de `.env` y `PRUEBA.rar` en OneDrive, riesgo del mismo usuario, `readWrite` más amplio de lo necesario, SCRAM-SHA-256 no habilitado, anclas fuera de la máquina.

## 7. Estado

Primer arranque real de Express `main` completado y limpio; Atlas sin cambios conocidos; todo detenido. Sin continuar con la sincronización de Godot.
