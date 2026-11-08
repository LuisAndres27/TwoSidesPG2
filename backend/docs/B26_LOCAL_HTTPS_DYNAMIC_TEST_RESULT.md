# B26 — Prueba dinámica de HTTPS local con Caddy (Etapa 30)

Fecha: 2026-11-02. Se arrancó Caddy v2.11.7 solo en `127.0.0.1:8443`, se probó con la CA de pruebas instalada manualmente por el propietario en `CurrentUser\Root` y se detuvo Caddy. **No se arrancó Express `main`, no se conectó Atlas, no se ejecutó Godot, no se tocaron SQLite/partidas, JWT, `.env`, respaldos, firewall ni `LocalMachine`; sin commits ni `push`. B00 sigue pendiente.**

**Estado de limpieza: COMPLETA. Caddy detenido, 8443 libre y la CA de pruebas (SHA-1 `F2BF0E8DC06AC9C4F12F27ECD6841438A5D412A7`) retirada de `CurrentUser\Root` por el propietario** (los intentos automáticos de borrado fallaron porque Windows exige confirmar en pantalla). Confirmación en §6.

## 1. Verificaciones previas

| Comprobación | Resultado |
|---|---|
| Usuario / elevación | `luis2` / sin elevación; no se tocó `LocalMachine` |
| Procesos `caddy`/`node`; escuchas 8443, 3000, 2019, 80, 443 | 0 / 0 |
| SHA-256 de `caddy.exe` | `5F93A9BD…C9DB2A` (el verificado en B24) |
| Cadena `localhost.crt` → `ca.crt`; vigencia | OK; no caducados (CA hasta 2026-12-02, servidor hasta 2026-11-16) |
| Huella SHA-256 del DER de la CA | `85:9E:01:ED:2B:5B:85:ED:FA:59:CB:3D:1D:6B:11:FF:EB:66:DC:09:72:69:49:34:37:73:4F:09:FA:23:4E:B0` (= esperada) |
| Antes de instalar | 0 entradas «Two Sides» en `CurrentUser\Root`/`CA`/`TrustedPeople` y `LocalMachine\Root` (44 certificados en cada Root) |

## 2. Instalación de la CA

Dos intentos automáticos fallaron por el aviso de seguridad de Windows (`UI is not allowed` / `certutil` en espera, cortado a 30 s; sin cambios). El propietario la instaló a mano. Comprobado después: **una sola entrada nueva** (45 certificados), sujeto `CN=Two Sides LOCAL TEST CA (remove after use)`, huella SHA-256 idéntica a la esperada, `LocalMachine\Root` sin cambios, sin clave privada ni otros certificados.

## 3. Arranque de Caddy

`caddy run --config Caddyfile` (el validado en B25, sin `--watch`), con `XDG_DATA_HOME`/`XDG_CONFIG_HOME` en `TwoSidesLocalProxy\data`/`config`. Única escucha: **TCP `127.0.0.1:8443`**; ninguna en `0.0.0.0` ni `::`; sin UDP (sin HTTP/3); sin 80/443/2019. Admin off, sin ACME, sin cambios de firewall. Express no se inició (upstream 3000 apagado).

## 4. Resultados HTTP/TLS (validación activa; sin `-k`/`--insecure`/callbacks)

Cliente: .NET `HttpClient`/`SslStream` en Windows PowerShell 5.1 (almacén de confianza de Windows, como Godot .NET) y `openssl s_client` con `-verify_return_error`.

| # | Prueba | Resultado | Veredicto |
|---|---|---|---|
| 1 | `GET https://localhost:8443/api/health` | TLS confiado por Windows; **502** (upstream apagado; Caddy registra `dial tcp 127.0.0.1:3000 … refused`) | OK |
| 2 | `/` y `/otra/ruta` | **404** `Not Found` | OK |
| 3 | Host ajeno | `https://127.0.0.1:8443` (IP en SAN, validada) → **421** `Misdirected Request`. Con cabecera `Host: evil.invalid` el propio cliente .NET abortó por validar contra el Host (no llegó al servidor) | OK (421 probado con Host `127.0.0.1`; no con un Host ajeno + SNI correcto, ver §7) |
| 4 | HTTP plano a `127.0.0.1:8443` | **400** «Client sent an HTTP request to an HTTPS server»; no hay contenido ni redirección | OK |
| 5 | SNI/nombre incorrecto (`evil.invalid`, `localhost.evil.invalid`) | `AuthenticationException` (certificado no válido); `localhost` → OK TLS 1.3, `CN=localhost` | OK |
| 6 | Cliente sin la CA de confianza (`openssl -no-CAfile`) | `Verify return code 20 (unable to get local issuer certificate)` | OK |
| 7 | Nombre ajeno con la CA correcta | `Verify return code 62 (hostname mismatch)`; con `localhost` y con `-verify_ip 127.0.0.1` → `Verification: OK` | OK |
| 8 | TLS 1.2 / 1.3 | ambos negocian (ECDHE-RSA-AES128-GCM-SHA256 / TLS_AES_128_GCM_SHA256) | OK |
| 9 | TLS 1.1 forzado | `Cipher (NONE)`: sin handshake | OK |
| 10 | `https://[::1]:8443`, `https://127.0.0.2:8443` | conexión denegada: no escucha en otras interfaces/direcciones | OK |
| 11 | Redirecciones | `AllowAutoRedirect=false`; ninguna respuesta 3xx ni `Location` | OK |

Los *name constraints* de la CA no se pusieron a prueba contra SChannel con un certificado ajeno (no existe ninguno firmado: la clave de la CA fue destruida); sí quedó demostrado que el certificado legítimo es aceptado y los nombres ajenos rechazados.

## 5. Parada y puertos

Caddy detenido (`HasExited=True`); 0 procesos `caddy`/`node`; 0 escuchas en 8443, 3000, 2019, 80, 443. Express `main` continúa apagado; Atlas no se conectó. Caddy creó solo `data\caddy\instance.uuid` y `last_clean.json` (36 y 110 B, sin secretos); `tls\` sigue con sus 3 archivos y ACL intactas.

## 6. Retirada de la CA — CONFIRMADA

El propietario la retiró manualmente (`certutil -user -delstore Root F2BF0E8D…D412A7`). Verificado después, solo en lectura:

| Comprobación | Resultado |
|---|---|
| SHA-1 `F2BF0E8DC06AC9C4F12F27ECD6841438A5D412A7` o sujeto «Two Sides» en `CurrentUser\Root`, `CurrentUser\CA`, `CurrentUser\TrustedPeople`, `LocalMachine\Root` | 0 en todos |
| `CurrentUser\Root` | **44 certificados, conjunto idéntico al inicial** (comparación de huellas) |
| `LocalMachine\Root` | 44, idéntico al inicial |
| Procesos `caddy`/`node`/`certutil`; escuchas 8443, 3000, 2019, 80, 443 | 0 / 0 |
| Express `main` | apagado; Atlas no conectado |
| `tls\` | conservado: `ca.crt` (1 241 B, SHA-256 del DER `85:9E:01:ED:…:4E:B0`), `localhost.crt` (1 245 B), `localhost.key` (1 704 B); ACL sin tocar |

No quedan certificados residuales de la prueba en Windows. Tras el cierre no se reinstaló nada ni se arrancó ningún servidor.

## 7. Riesgos y pendientes

- La CA ya no está instalada: `localhost.key` no permite suplantar `localhost` ante Windows. Una futura etapa que la reinstale reabre la exposición hasta 2026-11-16 (acotada a `localhost`/`127.0.0.1`; la CA caduca el 2026-12-02).
- Falta probar un 421 con SNI correcto y cabecera `Host` ajena (cliente crudo) y el comportamiento de SChannel con certificados fuera de las restricciones.
- El servidor caduca el 2026-11-16; no se pueden emitir más certificados con esta CA.
- Pendiente (otra etapa, con autorización): arrancar Express `main` tras Caddy, sonda `/api/health` real, prueba Godot con perfil desechable, inspección Atlas antes/después. B00 abierto.
