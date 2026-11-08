# B28 — Cadena HTTPS completa Caddy → Express `main` (Etapa 32)

Fecha: 2026-11-02. **Solo lecturas (`GET`).** El propietario instaló la CA temporal en `CurrentUser\Root` y arrancó Express `main` con el lanzador (contraseña por prompt oculto); Claude arrancó Caddy y ejecutó las pruebas. **No se ejecutó Godot, no se tocó SQLite/partidas, no se escribió en Atlas (ninguna petición de escritura, sin cuentas ni sesiones ni sincronización), no se repitió bootstrap, no se cambiaron contraseñas/JWT, manifiestos ni ACL, no se abrieron `.env` ni respaldos; sin commits ni `push`. B00 sigue pendiente.**

**Estado de limpieza: COMPLETA (§6).** Caddy y Express detenidos, puertos libres, CA retirada y `CurrentUser\Root` de nuevo en sus 44 certificados originales.

## 1. Preparación

| Comprobación | Resultado |
|---|---|
| Preflight (integridad 3 168 archivos, id `main-2026-11`, anclas, huella pública `811cd75b…9d8aec`) | `ok` |
| ACL `TwoSidesMainSecrets` y `TwoSidesLocalProxy` | `conforming` |
| Caddy: SHA-256 de `caddy.exe` | `5F93A9BD…C9DB2A` (el verificado) |
| Certificado servidor | cadena OK; vence 2026-11-16 (vigente) |
| Caddyfile | `admin off`, `auto_https off`, `default_bind 127.0.0.1`, `bind 127.0.0.1`, sitio `https://:8443` |
| Antes de empezar | 0 `node`/`caddy`; 3000, 8443, 2019, 80, 443 libres; 44 certificados en `CurrentUser\Root` |

## 2. Estado tras la activación manual

CA instalada: una entrada, SHA-1 `F2BF0E8D…D412A7`, SHA-256 `85:9E:01:ED:…:4E:B0` (correcta); `CurrentUser\Root` = 45; `LocalMachine\Root` sin entradas «Two Sides». Express: PID 24192 (`node`), escucha **`127.0.0.1:3000`**, sin escucha comodín. Directo `GET http://127.0.0.1:3000/api/health` → **200** `{"status":"ok","service":"two-sides-backend"}`.

## 3. Caddy

Arrancado con el Caddyfile validado, sin `--watch`. Única escucha nueva: **TCP `127.0.0.1:8443`** (0 UDP, 0 en `0.0.0.0`/`::`, sin 80/443/2019). Log de errores de Caddy: vacío.

## 4. Resultados HTTPS (validación TLS de Windows activa; sin `-k`/`--insecure`/callbacks)

| # | Prueba | Resultado |
|---|---|---|
| 1 | `GET https://localhost:8443/api/health` | **200**, `application/json`, `{"status":"ok","service":"two-sides-backend"}` — Caddy reenvía correctamente a Express |
| 2 | `GET https://127.0.0.1:8443/api/health` | **421** `Misdirected Request` (Host ≠ `localhost`) |
| 3 | SNI `localhost` + cabecera `Host: evil.invalid` (cliente crudo) | **421** (cierra la limitación de B26) |
| 4 | SNI `localhost` + `Host: localhost:8443` | 200, mismo JSON |
| 5 | `/`, `/otra`, `/apix` | **404** `Not Found` (texto de Caddy; no llegan a Express) |
| 6 | `/api/ruta-inexistente` | 404 JSON `{"error":"not_found"}` (respuesta de Express: el proxy sí reenvía todo `/api/*`) |
| 7 | HTTP plano `http://127.0.0.1:8443` | **400** «Client sent an HTTP request to an HTTPS server»; sin contenido ni redirección |
| 8 | SNI `evil.invalid` / `localhost.evil.invalid` | fallo de validación del certificado |
| 9 | `openssl` sin CA de confianza | `Verify return code 20` |
| 10 | `https://[::1]:8443` | conexión denegada |
| 11 | Redirecciones | ninguna (`AllowAutoRedirect=false`; sin 3xx ni `Location`) |

TLS: handshake aceptado por Windows (SChannel/.NET) con la CA instalada; errores TLS nunca ignorados.

## 5. Puertos

Durante la prueba: `127.0.0.1:3000` (node 24192) y `127.0.0.1:8443` (caddy). Ninguno más nuevo; ninguno en interfaces externas. Caddy se detuvo con `Stop-Process` (con `admin off` no hay cierre ordenado; es un proxy sin estado y no tenía peticiones en vuelo): `HasExited=True`, 8443 libre.

## 6. Limpieza

Verificado por Claude en solo lectura tras la intervención del propietario:

| Comprobación | Resultado |
|---|---|
| Procesos `node`/`caddy`/`certutil`; PID 24192; powershell del lanzador | 0 / no existe / 0 |
| Escuchas 3000, 8443, 2019, 80, 443; conexiones hacia 3000/8443 | 0 / 0 |
| CA (SHA-1 `F2BF0E8DC06AC9C4F12F27ECD6841438A5D412A7`) o sujeto «Two Sides» en `CurrentUser\Root`, `CurrentUser\CA`, `TrustedPeople`, `LocalMachine\Root` | 0 en todos |
| `CurrentUser\Root` | **44 certificados, conjunto idéntico al inicial** (huellas); `LocalMachine\Root` 44, idéntico |
| Integridad / escáner de secretos | `ok` (3 168 archivos) / `clean` |
| `tls\` | conservado: `ca.crt`, `localhost.crt`, `localhost.key` |

- **Caddy:** detenido por Claude con `Stop-Process` (sin cierre ordenado posible con `admin off`).
- **Express (PID 24192):** el propietario informó que lo detuvo, pero **no indicó el método** y Claude no lo puede deducir desde fuera (no hay código de salida disponible): **no queda documentado si fue Ctrl+C (cierre ordenado) o `Stop-Process` (forzado)**. Solo consta que el proceso ya no existe y que no quedan conexiones.
- **CA temporal:** retirada manualmente por el propietario; confirmada la ausencia.
- No se reinstaló ningún certificado, no se arrancó ningún servicio, no se conectó Atlas.

## 7. Riesgos pendientes

- Mientras la CA siga instalada, `localhost.key` (mismo usuario, B00) permitiría suplantar `localhost` hasta 2026-11-16 (acotado por name constraints; la CA caduca 2026-12-02 y no se pueden emitir más certificados).
- Caddy sin cierre ordenado con `admin off`.
- No se verificó el estado de las colecciones de Atlas (solo `GET /api/health`; no se espera ningún cambio, pero no está comprobado por inspección).
- `trust proxy` en Express desactivado: Express verá siempre la IP del proxy.
- Godot → Caddy → Express con cliente real, escrituras de prueba y sincronización quedan para otra etapa con autorización. B00 abierto.
