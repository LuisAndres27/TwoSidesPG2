# B22 — Preparación de HTTPS entre Godot y Express `main` (DISEÑO + PRUEBAS OFFLINE; nada activado)

Fecha: 2026-11-01. **No se activó Express `main`, no se conectó Atlas, no se ejecutó bootstrap, no se tocaron colecciones, JWT, contraseñas, `.env`/respaldos, ACL, SQLite ni partidas, no se ejecutó Godot ni C.2/F.2/C2Runtime, no se creó ningún servicio, certificado real ni proxy, no se publicó nada en Internet y no hubo commits ni `push`.** **No se modificó ningún archivo cubierto por el manifiesto de integridad**: `verify` sigue en `ok` (3 168 archivos) y `main-preflight.js` en `ok`; la línea base `126a6cee…e433` continúa vigente. Solo se añadieron una prueba (`tests/sync/main-https-preparation.test.js`), una línea a `/.gitignore` (`override.cfg`) y este informe. **B00 sigue pendiente.**

## 1. Hallazgos de la revisión

**Godot (cliente de sincronización `main`)**
- Dirección: `ProjectSettings["two_sides/sync/main_api_url"]` (hoy **no existe** en `project.godot`; sin ella la sincronización queda desactivada). Se valida en `SyncMainMode.FromConfiguration` y `SyncHttpOptions`: esquema **`https` obligatorio**, sin usuario/contraseña, sin consulta ni fragmento, ruta `/`. El HTTP solo existe con el indicador explícito de prueba (`--two-sides-sync-local-test` → `http://127.0.0.1:3000`), que no puede combinarse con la configuración `main`.
- Transporte: `System.Net.Http.HttpClient` sobre `SocketsHttpHandler` con **validación de certificados por defecto del sistema** (almacén de confianza de Windows); `AllowAutoRedirect=false`, `UseProxy=false`, `UseCookies=false`, conexión 3 s, solicitud 10 s (límite 0,1–60 s), respuesta ≤ 1 MiB. **No existe en ningún código propio** (`scripts`, `integration`, `local-persistence`) un callback de validación de certificados, `ClientUnsafe`, `SslProtocols`, revocación desactivada ni equivalente: no hay forma de ignorar errores de certificado.
- Contraseña de MongoDB: **ninguna referencia** (`mongodb://`, `twosides_backend`, host de Atlas, `two_sides_db`) en el código del juego; el cliente solo conoce una URL HTTPS de la API y su credencial técnica v2 (DPAPI, por URL: el espacio de nombres de credenciales es el SHA-256 de la URL base, de modo que **cambiar la URL crea otra identidad técnica**).
- Sin URL pública ni host ficticio codificados (0 coincidencias de `https://host` en el código).
- Legado: `scripts/network/ApiClient.cs` usa `HttpRequest` de Godot (su propio paquete de CA, no el almacén de Windows). No interviene en `main` (`legacyIdentity:false` en la composición `main`), pero una CA local **no** sería confiable allí.
- Offline-first: `GameSyncHost` desactiva el proceso si no hay configuración, ejecuta el trabajo en `Task.Run` (fuera del hilo de juego) y traga cualquier excepción; un fallo de red solo mueve operaciones a `retryable_failure` (códigos `network_unavailable`/`timeout`/`rate_limited`, con `Retry-After`), sin perder ni modificar datos. El arnés C# existente (`SyncHttpChecks`, **no ejecutado en esta etapa**) cubre: configuración que rechaza HTTP/`mongodb://`/credenciales en URL/rutas; servidor caído y servidor mudo → reintentable, con la Outbox intacta.

**Express `main`**
- Escucha solo en `127.0.0.1` (`HOST` fijo; `startServer` rechaza cualquier otro host salvo loopback). Habla HTTP plano; no hay TLS ni HSTS en la aplicación (corresponden al proxy).
- `app.set('trust proxy', false)`: `X-Forwarded-For` se **ignora** hoy. `request.ip` (limitadores por IP) es la dirección del socket. Detrás de un proxy local todos los clientes aparecerían como `127.0.0.1` (un único cupo por IP): inocuo para una prueba de un solo jugador, inadecuado para varios clientes (§5).
- Cabeceras de seguridad ya presentes (`nosniff`, `X-Frame-Options: DENY`, CSP `default-src 'none'`, `Cache-Control: no-store`).

## 2. Arquitectura HTTPS recomendada

```
Godot (.NET HttpClient, almacén de confianza de Windows)
   │  HTTPS  (TLS ≥ 1.2, certificado validado: cadena + nombre + fechas)
   ▼
Proxy inverso TLS en el MISMO equipo  (escucha solo donde corresponda; termina TLS)
   │  HTTP plano, solo loopback
   ▼
Express main  127.0.0.1:3000   ──TLS estricto, SCRAM──►  MongoDB Atlas (two_sides_db)
```

Misma arquitectura en las dos fases; cambia solo la fuente del certificado:

| Fase | Uso | Dirección en Godot | Certificado |
|---|---|---|---|
| **L — primera prueba** (equipo del propietario) | Verificar Godot→proxy→Express→Atlas de extremo a extremo | `https://localhost:8443/` | Hoja para `localhost` firmada por una **CA local de pruebas** instalada solo en el almacén `CurrentUser\Root` del propietario |
| **P — producción** (más adelante, otro host) | Jugadores reales | `https://<dominio propio>/` | Certificado de **CA pública** (p. ej. Let's Encrypt) gestionado por el proxy; cortafuegos solo 443; lista de IP de Atlas; HSTS en el proxy |

Descartado/diferido: terminar TLS dentro de Node (otra clave privada en el proceso y cambio en el código cubierto); IIS/ARR (pesado); `dotnet dev-certs` (certificado ASP.NET, no pensado para esto). Opciones de proxy para la fase L: **Caddy** (un solo ejecutable, CA local con `tls internal`) o `mkcert` + un proxy; son decisiones externas que requieren autorización (§9). Fragmento orientativo, **sin probar** (verificar directivas con la versión instalada):
```
{ admin off }
https://localhost:8443 {
    bind 127.0.0.1
    tls internal
    request_body { max_size 2MB }
    reverse_proxy 127.0.0.1:3000 { header_up X-Forwarded-For {remote_host} }   # sobrescribe, no añade
}
```

## 3. Configuración

**Godot** (fase L; sin tocar `project.godot` ni el código): archivo local `override.cfg` junto a `project.godot` (ahora ignorado por Git):
```
[two_sides]
sync/main_api_url="https://localhost:8443/"
```
(confirmar el formato exacto con la documentación de Godot 4.6 al hacer la prueba). Reglas que ya aplica el código: solo `https`, sin credenciales/consulta/fragmento, ruta `/`. No añadir argumentos `--two-sides-sync*` (desactivan el modo `main`). Producción: fijar `two_sides/sync/main_api_url` en la configuración de exportación, nunca una IP ni un certificado de pruebas.

**Express** (sin cambios para la fase L): lanzador con guardia de integridad (B16/B21), `PORT` 3000, escucha solo en loopback. Para la fase P ver §5.

## 4. Requisitos de certificados

- Nombre en **SAN** (DNS `localhost`, o el dominio real; para IP, SAN de IP), `extendedKeyUsage=serverAuth`, `basicConstraints=CA:FALSE`, RSA ≥ 2048 o ECDSA P-256; sin comodines; vigencia corta (local: ≤ 90 días; pública: la que fije la CA).
- Clave privada del certificado: solo en la carpeta del proxy, con la misma política de ACL que `TwoSidesMainSecrets` (protegida, `luis2`/`SYSTEM`/`Administradores`, sin herencia), fuera de OneDrive y del repositorio. La clave de la CA local no sale del equipo; se instala **solo el certificado** de la CA, y solo en `CurrentUser\Root`.
- **Prohibido en producción:** certificados autofirmados o ficticios, CA local, `.invalid`/`example`, URL sin HTTPS, desactivar la validación, anclaje a un certificado concreto sin plan de rotación.
- Validación en Godot: la hace Windows (cadena hasta una raíz de confianza, nombre, fechas, uso). Sin CA instalada el cliente **rechaza** la conexión (comprobado en el modelo).

## 5. Cambios de código necesarios (NO realizados)

| Cambio | Cuándo | Archivos cubiertos por el manifiesto |
|---|---|---|
| Opción `trustProxy` (solo `false` o `'loopback'`, 1 salto) en `createApp`, activable con una variable explícita (`MAIN_TRUST_PROXY=loopback`, por defecto desactivada) y un parámetro del lanzador | Fase P (varios clientes) — no hace falta para la primera prueba | `src/app.js`, `src/composition/backend.js`, `src/config/env.js`, `src/main/runtime.js`, `scripts/run-main-backend.ps1` |
| Distinguir en el cliente un fallo TLS (`AuthenticationException`) del resto de fallos de red con un código fijo (hoy se ve como `network_unavailable`) | Mejora de diagnóstico, opcional | `local-persistence/sync-http/SyncHttpTransport.cs.txt` (y copia de juego); no cubierto por el manifiesto |

Reglas del ajuste de proxy: nunca `true`, `'uniquelocal'` ni rangos amplios; el proxy debe **sobrescribir** `X-Forwarded-For` y `X-Forwarded-Proto` no se usa en la aplicación; con `'loopback'` Express solo cree la cabecera si el salto es loopback y toma la dirección más a la derecha no confiable (comprobado en HT04). Un proceso local malicioso podría falsificar la cabecera (mismo usuario → B00).

> **ADVERTENCIA DE LÍNEA BASE:** cualquier modificación de `src/`, `scripts/` (incluido `run-main-backend.ps1`), `package*.json` o dependencias hará que la línea base actual (`treeDigest 126a6cee…e433`) **deje de coincidir**, la guardia impedirá el arranque y habrá que aprobar una **nueva línea base** con el procedimiento de B20 §6. **No se regenera automáticamente.** Esta etapa no modificó ninguno de esos archivos.

## 6. Timeouts, reintentos y modo sin conexión

Sin cambios necesarios. Conexión 3 s, solicitud 10 s, sin redirecciones ni proxy del sistema, respuesta ≤ 1 MiB; fallos → `retryable_failure` con `Attempts` y `Retry-After`; 401 → un re-login transparente con la credencial DPAPI; el trabajo corre fuera del hilo del juego y se detiene antes de cerrar la base local. Un fallo de TLS o de red nunca toca partidas ni SQLite local. Riesgo: un problema de certificado se manifiesta como «sin conexión» (silencioso); ver la mejora de diagnóstico de §5.

## 7. Pruebas offline (`main-https-preparation.test.js`, 7/7)

| # | Cubre |
|---|---|
| HT01 | La app Express real responde sobre TLS solo a un cliente que valida cadena, nombre y fechas (CA de prueba generada en tiempo de ejecución); nombre incorrecto, CA ausente y CA de otro emisor → rechazo |
| HT02 | Autofirmado no confiable, certificado de otro nombre, caducado, TLS < 1.2, `https://` contra puerto HTTP y `http://` contra puerto TLS → rechazados; ignorar errores solo ocurre con una opción insegura explícita |
| HT03 | Servidor caído → `ECONNREFUSED` en < 3 s; servidor mudo → fin por tiempo límite, sin cuelgues |
| HT04 | `trust proxy` hoy desactivado y loopback-only; modelo de la opción `'loopback'` (cabecera aceptada solo desde el salto proxy, falsificaciones a la izquierda ignoradas) |
| HT05 | Código del juego: solo HTTPS, sin override de validación de certificados, sin proxy/redirecciones, tiempos acotados, sin referencias a la base de datos ni URL fijas; `project.godot` sin `main_api_url` |
| HT06 | La sincronización queda desactivada sin configuración y no bloquea el juego; el arnés C# existente cubre desconexión/servidor mudo; `override.cfg` ignorado por Git |
| HT07 | Los archivos clave cubiertos (`app.js`, `lifecycle.js`, `server.js`, `runtime.js`, el lanzador) siguen siendo idénticos al manifiesto |

Límites honestos: Node modela la política de TLS, **no** SChannel/.NET; la prueba real (§9) es la que valida la cadena con Windows. Los certificados de las pruebas son temporales, de una CA descartable nunca instalada. No se ejecutó el arnés C# ni Godot. Resultados: regresión completa **724 + 9 aprobadas, 15 + 1 omitidas, 0 fallos**; legacy **39/39**; escáner de secretos **clean**; integridad **ok**; preflight **ok**.

## 8. Riesgos pendientes

- B00 (mismo usuario) y las copias antiguas de `.env`/`PRUEBA.rar` en OneDrive siguen abiertas.
- Instalar una CA local en `CurrentUser\Root` amplía la confianza del equipo: la clave de esa CA debe protegerse y el certificado retirarse al terminar las pruebas.
- Un binario de proxy externo (Caddy/mkcert) es una nueva dependencia de confianza: verificar su SHA-256/firma y ubicarlo en una carpeta protegida; no está cubierto por el manifiesto.
- Sin `trust proxy`, los límites por IP se comparten entre todos los clientes (fase P); con él, un falsificador local podría evadirlos.
- Los fallos TLS se ven como «sin conexión» en el cliente.
- Cambiar la URL crea otra identidad técnica y otro espacio de credenciales; una prueba con las partidas reales vincularía esa partida a la identidad de la URL de prueba (hacer antes una copia de seguridad de SQLite con la herramienta existente, o usar un perfil desechable).
- Pendientes de `main`: SCRAM-SHA-256, rol más estrecho que `readWrite`, cuotas, eventos `Died`/`RequestRestart`, y la aprobación de la línea base si se cambia código.

## 9. Procedimiento para la primera conexión segura (NO ejecutar sin autorización)

Precondiciones: `verify` y `main-preflight.js` en `ok`; digest y huella anotados fuera del equipo; copias antiguas de `.env` tratadas; copia de seguridad de las partidas locales; propietario presente.
1. Descargar el proxy, verificar su SHA-256/firma contra la fuente oficial y colocarlo en una carpeta protegida (🔴 autorización).
2. Crear la CA local y el certificado `localhost`; instalar **solo** el certificado de la CA en `CurrentUser\Root` (🔴); comprobar con `certutil -user -store Root`.
3. Arrancar el proxy escuchando **solo** en `127.0.0.1:8443` y comprobar los puertos en escucha.
4. Arrancar Express `main` con el lanzador y su guardia (🔴, pide la contraseña con entrada oculta; conexión a Atlas).
5. Sondeo con un cliente que valida (p. ej. `curl --cacert` o PowerShell): `https://localhost:8443/api/health` → 200; casos negativos: otro nombre, HTTP en 8443, sin CA.
6. Crear `override.cfg` y abrir el juego **con un perfil/copia desechable** (🔴, lo hace el propietario); observar los contadores de la Outbox.
7. Inspección de solo lectura de Atlas con una autorización nueva para ver las operaciones recibidas.
8. Reversión: borrar `override.cfg` (sincronización desactivada), detener el proxy y Express, retirar la CA local del almacén, eliminar claves/certificados de prueba.

## 10. Acciones que requieren autorización posterior

Descargar/instalar el proxy; crear CA/certificados e instalar la CA en el almacén de confianza; abrir el puerto 8443 local; arrancar `main` (conexión a Atlas); crear `override.cfg` y ejecutar Godot; cualquier cambio en `src/`/`scripts/` y la nueva línea base; despliegue público (dominio, cortafuegos, certificado público).

Detenido antes de activar cualquier conexión real.
