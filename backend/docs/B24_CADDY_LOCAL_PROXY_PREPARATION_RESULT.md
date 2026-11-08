# B24 — Caddy descargado, verificado y validado en seco (NO iniciado)

Fecha: 2026-11-02. Se descargó Caddy desde su distribución oficial, se verificó su procedencia, se comprobó su versión y se validó sintácticamente el Caddyfile de B23 **sin iniciar ningún servidor**. **No se instaló ningún certificado, no se creó ninguna CA, no se modificó ningún almacén de certificados de Windows (0 entradas «Two Sides» en `CurrentUser\Root` y en `LocalMachine\Root`), no se ejecutó Caddy como servidor, no se abrió ningún puerto, no se activó Express `main`, no se conectó MongoDB Atlas, no se crearon identidades ni datos sintéticos, no se ejecutó Godot, no se creó `override.cfg`, no se tocaron SQLite/partidas, JWT/contraseñas, ACL del proyecto, `.env` ni respaldos, y no hubo commits ni `push`.** La línea base de integridad sigue válida (3 168 archivos, `126a6cee…e433`): `verify` = ok. **B00 sigue pendiente.**

## 1. Fuente oficial y versión

| Dato | Valor |
|---|---|
| Fuente | `https://github.com/caddyserver/caddy/releases` (descarga por HTTPS, TLS ≥ 1.2, `--proto =https`) |
| Release estable más reciente | **v2.11.7**, publicado `2026-10-03T05:58:33Z` por `github-actions[bot]`, no prerelease, no borrador |
| ¿Es la versión propuesta en B23? | **Sí** (v2.11.7) |
| Archivo de distribución de Windows (nombre exacto) | `caddy_2.11.7_windows_amd64.zip` — 18 479 498 B |
| Archivos de verificación del mismo release | `caddy_2.11.7_windows_amd64.zip.sig`, `caddy_2.11.7_windows_amd64.pem`, `caddy_2.11.7_checksums.txt`, `…checksums.txt.sig`, `…checksums.txt.pem` |
| Gestores de paquetes comunitarios | No utilizados |

## 2. Qué hay en la carpeta local

`%LOCALAPPDATA%\TwoSidesLocalProxy` (creada con DACL protegido desde la creación: solo `luis2`, `SYSTEM`, `Administradores`; herencia deshabilitada; sin DENY; comprobador de ACL: `conforming`, 17 elementos, 0 fallos). Contenido: `bin\{caddy.exe, LICENSE, README.md}`, `download\` (zip, `.sig`, `.pem`, `checksums.txt`, `.sig`, `.pem`), `verify\` (certificados decodificados), `config\` y `data\` (vacías), `Caddyfile`. No existe `tls\`: **no hay certificados ni claves**.

El zip se inspeccionó **antes** de extraer: 3 entradas (`LICENSE`, `README.md`, `caddy.exe`), 0 rutas sospechosas; se extrajeron solo esas con `ExtractToFile` sin sobrescribir.

## 3. Hashes

| Objeto | Algoritmo | Valor |
|---|---|---|
| `caddy_2.11.7_windows_amd64.zip` | SHA-256 | `0a1edc0b799512051c57071ce0e798d3f2cf67dc98171366f1d2b326072e3b06` |
| ídem | SHA-512 | `c308154504e53755958ffc62d8a2657ab17eefd6dd25c45dbb2c3d93d29519971f77ca652f7d0f2bcb7f980b9ba3822478865e29969d0272d7613550a43152b1` |
| **`bin\caddy.exe`** | **SHA-256** | **`5f93a9bd555f3aac9d33af2756ba14b3519d8cca4ffd55256bdaeab444c9db2a`** |
| `LICENSE` / `README.md` | SHA-256 | `cfc7749b…3d30` / `0bc5939a…8b18` |

Nota: `checksums.txt` de Caddy usa **SHA-512** (no SHA-256); la suma del zip coincide línea a línea. La API de GitHub también informa el SHA-256 del zip y de `checksums.txt` (coinciden).

## 4. Autenticidad: qué se verificó y qué no

**Insuficiente por sí solo (mismo origen):** la coincidencia del SHA-512 con `checksums.txt` y del SHA-256 con la API de GitHub solo prueba que la descarga no se corrompió; **no** se afirma autenticidad por ello.

**Verificación de firma Sigstore («keyless») hecha a mano, sin ejecutar código descargado** (script reproducible `docs/local-https/verify-caddy-sigstore.mjs`; `cosign` no está instalado), para el **zip** y para **`checksums.txt`**:
1. La firma ECDSA (`.sig`) sobre el archivo es **válida** con la clave pública del certificado (`.pem`).
2. El certificado (válido 05:51:14–06:01:14 UTC del 2026-10-03) fija la identidad: SAN `https://github.com/caddyserver/caddy/.github/workflows/release.yml@refs/tags/v2.11.7`, emisor OIDC `https://token.actions.githubusercontent.com`, repositorio `caddyserver/caddy`, flujo `Release`, disparo `push`, ref `refs/tags/v2.11.7`, commit `72dd0fb067f6d7826c7f79907670ba4a713bfe37`.
3. La cadena hoja → `sigstore-intermediate` → raíz `sigstore` **valida**, con las anclas obtenidas de la infraestructura de Sigstore (`fulcio.sigstore.dev/api/v2/trustBundle`), independiente de GitHub y de Caddy; las ventanas de validez de la cadena cubren el instante de la firma.
4. Registro de transparencia **Rekor** (`rekor.sigstore.dev`): existe 1 entrada por archivo (índices 3069872581 para el zip y 3069891822 para `checksums.txt`) que contiene exactamente el mismo hash, la misma firma y el mismo certificado; su *signed entry timestamp* **verifica** con la clave pública de Rekor y la integración (05:51:14Z y 05:52:24Z) cae **dentro** de la ventana del certificado.
5. Corroboración (autodeclarada por el binario): `caddy version` = `v2.11.7 h1:yj0Y4fYZ…`, `build-info` = `vcs.revision 72dd0fb0…fe37` (**el mismo commit** del certificado), `GOOS=windows`, `GOARCH=amd64`, `-trimpath`, `CGO_ENABLED=0`, Go 1.26.8, `vcs.modified=false`. Encabezado PE: `MZ`/`PE`, máquina `0x8664` (x64).

**No verificado (límites):** la prueba criptográfica de inclusión de Merkle / la cabecera firmada del árbol de Rekor (la entrada la traía, no se validó); la raíz de Fulcio no se fijó mediante el repositorio TUF de Sigstore (se tomó del punto final de Fulcio por TLS público); el SCT del certificado; no se usó `cosign`. El binario **no tiene firma Authenticode** (`NotSigned`; es lo habitual en Caddy) y no se ha auditado el código fuente: la firma prueba que el artefacto lo produjo el flujo de release de `caddyserver/caddy` en la etiqueta `v2.11.7`, no que el proyecto sea inocuo.

**Conclusión:** procedencia **verificada con un nivel alto** (equivalente en sustancia a `cosign verify-blob` con identidad fijada, sin la prueba de inclusión ni el ancla TUF). Se consideró suficiente para ejecutar el binario **solo en modo diagnóstico**. Confiamos además en la infraestructura pública de Sigstore y en que el flujo de release de Caddy no esté comprometido.

## 5. Comprobación de funcionamiento básico (sin servidor)

Solo se ejecutaron `version`, `list-modules`, `build-info` y `adapt`, con entorno vacío salvo `SystemRoot`, `windir`, `PATH` y `XDG_*`/`TEMP` hacia la carpeta protegida. Resultados: `v2.11.7`; 135 módulos, incluidos `http.handlers.reverse_proxy`, `request_body`, `static_response`, `tls.certificates.load_files` y los matchers `host`, `path`, `not`. Antes y después de cada tanda: 0 procesos `caddy`, 0 puertos de escucha (80/443/2019/3000/8443, tampoco UDP), 0 archivos nuevos en `config\`/`data\`, 0 reglas de firewall. (Una primera ejecución mía pasó mal los argumentos y mostró la ayuda del binario; no abrió nada.)

## 6. Validación del Caddyfile de B23

Comando: `caddy adapt --config <Caddyfile> --pretty` → **exit 0, sin errores ni avisos**. Se usó `adapt` y **no** `caddy validate` porque este último aprovisiona los módulos TLS e intentaría abrir `tls\localhost.crt`/`.key`, que no existen (no se crean certificados en esta etapa). `caddy validate` queda para la etapa siguiente.

**Problema encontrado y corregido en la plantilla (única modificación de configuración):** con el sitio `https://localhost:8443`, Caddy añade un *matcher* de `Host` a nivel de sitio y la regla `421` nunca se alcanzaba; un `Host` ajeno habría recibido una respuesta vacía en lugar de un rechazo. Se cambió la etiqueta a `https://:8443` (escucha igualmente solo en `127.0.0.1` por `bind`) y se añadió `protocols tls1.2 tls1.3`. Plantilla corregida: `backend/docs/local-https/Caddyfile.template`.

Resultado del JSON adaptado (verificado también por la prueba LP07 con el binario verificado):
- `listen`: **solo `127.0.0.1:8443`**; protocolos `h1`, `h2` (sin HTTP/3: no hay UDP). Sin `:80`, `:443`, `0.0.0.0`, `[::]`.
- Destino del proxy: **solo `127.0.0.1:3000`** (HTTP), `dial_timeout` 3 s, `response_header_timeout` 15 s.
- `admin`: **deshabilitado** (`persist: false`). `automatic_https`: **deshabilitado** → sin ACME, sin redirecciones, sin puerto 80. Sin `pki`, `issuers`, `internal` ni `on_demand`.
- Rutas, en orden: `request_body` (2 MB) → `Host ≠ localhost` ⇒ **421** → ruta fuera de `/api/*` ⇒ **404** → `reverse_proxy`. Un `Host` inesperado nunca llega al proxy (comprobación **estática**; la dinámica requiere ejecutar el servidor: etapa siguiente).
- TLS: certificado explícito (`load_files`), `protocol_min tls1.2`, `protocol_max tls1.3`. Sin `trusted_proxies` ni `client_ip_headers`: Caddy sobrescribe las `X-Forwarded-*` entrantes.
- Registro: nivel `ERROR`, sin registro de accesos (no se escriben cabeceras `Authorization`).
- `skip_install_trust` no deja rastro en el JSON (no hay CA interna que instalar); se conserva como defensa en profundidad.

El `Caddyfile` de la carpeta local se generó desde la plantilla corregida con `@@TLS_DIR@@ = C:/Users/luis2/AppData/Local/TwoSidesLocalProxy/tls`; **debe regenerarse si la plantilla vuelve a cambiar**.

## 7. Pruebas

`main-local-https-plan.test.js`: **7/7** (LP01–LP06 ajustadas a la plantilla corregida y **LP07 nueva**, que ejecuta `caddy adapt` solo si el hash de `caddy.exe` coincide con el verificado y comprueba escucha, destino, rechazo por `Host`, ausencia de ACME/admin/80/trusted_proxies y que `adapt` no crea archivos). Suite completa `run-backend-regression.js`: **731 + 9 aprobadas, 15 + 1 omitidas, 0 fallos**; legacy **39/39**; escáner de secretos **clean**; `backend-integrity.js verify` **ok** (3 168 coincidentes); `main-preflight.js` **ok**. Ningún archivo de `src/`, `scripts/` ni dependencias se modificó (solo `docs/` y `tests/`).

## 8. Requisitos para la siguiente etapa (todos requieren autorización)

1. Crear `tls\` y la CA/hoja de pruebas con las plantillas `ca.cnf`/`leaf.cnf`/`leaf.ext` (nameConstraints, 30/14 días, destruir la clave de la CA) y comprobar con `caddy validate --config Caddyfile`.
2. Instalar **solo** el certificado de la CA en `CurrentUser\Root` (comparar huella antes) y planificar su retirada.
3. Arrancar Caddy en primer plano y verificar que escucha solo en `127.0.0.1:8443` (TCP) y que no hay UDP; ejecutar las sondas negativas (Host ajeno → 421, fuera de `/api` → 404, HTTP plano, sin CA, nombre incorrecto).
4. Arrancar Express `main` con su guardia y la contraseña por prompt oculto; sondas de autenticación; después, Godot con perfil desechable (B23 §6–§7).
5. Conservar el SHA-256 de `caddy.exe` (`5f93a9bd…db2a`) y comprobarlo antes de cada ejecución; descartar el binario si cambia.

## 9. Riesgos

- Dependencia externa de confianza (Caddy y la infraestructura de Sigstore); sin Authenticode; verificación sin prueba de inclusión de Rekor ni ancla TUF.
- El binario vive en la misma cuenta `luis2` que el resto (riesgo del mismo usuario, B00): cualquier proceso de `luis2` podría sustituirlo; mitigación: comprobar su hash antes de cada uso.
- `adapt` no valida los certificados ni el comportamiento en ejecución; la validación dinámica (421/404/proxy/TLS) queda pendiente.
- Copias antiguas de `.env`/`PRUEBA.rar` en OneDrive y demás puntos de B00 siguen abiertos.

## 10. Confirmación final

**No se conectó Atlas y no se inició ningún servidor** (0 procesos `caddy`/`node`, 0 puertos de escucha, 0 reglas de firewall, almacenes de certificados sin cambios). Detenido antes de instalar certificados o ejecutar servicios.
