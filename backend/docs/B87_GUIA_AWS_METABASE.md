# B87 — Guía AWS para principiantes: Metabase accesible desde Internet (evaluadores) leyendo la base analítica de Atlas

Estado: **preparada, nada ejecutado.** No se contactó con AWS ni con Atlas al escribirla. Los nombres de pantallas de la consola, los precios y varias opciones de Caddy/CloudFront están escritos **de memoria o de documentación pública consultada hoy** y pueden haber cambiado: ante una diferencia, **detente y revisa**, no improvises. Región: **us-east-1 (Norte de Virginia)**. Tiempo estimado la primera vez: 3–4 horas.

Documentos hermanos: `B87_ALCANCE_EVALUADORES.md` (alcance por escrito), `B87_iam-operator-policy.json` (política IAM del operador).

> **Reglas de oro.** (1) Nunca la cuenta raíz para trabajar. (2) Ninguna contraseña o clave en el chat, en el repositorio, en un comando que quede en el historial ni en una captura. (3) **No abras el acceso** hasta pasar la lista de la §11. (4) Todo lo que abras, lo cierras con la §13.

## 0. Qué se monta y qué queda expuesto
```
Evaluadores ──HTTPS 443──► EC2 (Caddy) ──127.0.0.1:3000──► Metabase (contenedor)
                                                              │ solo lectura, SCRAM-SHA-1, TLS
Tu PC (Express, solo 127.0.0.1) ──► Atlas (ingesta) ──publish a mano──► Atlas (analítica) ◄──┘
```
| Puerto / acceso | Estado |
|---|---|
| **443** | Público (HTTPS). Es lo único abierto de forma permanente durante la ventana de pruebas |
| **80** | **Cerrado.** Solo se abre si eliges la opción CloudFront (§3, y solo a los rangos de CloudFront) |
| **3000** (Metabase) | **Nunca expuesto.** El contenedor escucha en `127.0.0.1` |
| **22 (SSH)** | **No existe.** Se entra con *Session Manager* (sin puerto público) |
| **Atlas** | Solo la IP elástica de la EC2 con `/32`, y solo hacia el usuario reader (solo lectura de agregados) |

## 1. Quién hace qué
| Persona | Tareas |
|---|---|
| **Titular de la cuenta AWS** (tu compañera) | §2: protege la cuenta raíz, activa el presupuesto, crea el rol del servidor y el **usuario IAM limitado** para el operador. Después **no vuelve a usar la raíz** |
| **Operador** (tú) | §5 en adelante, con el usuario IAM limitado |
| **Tú** | Atlas (§7), contraseñas del reader y de Metabase, y los scripts de este repositorio |

## 2. Cuenta AWS de tu compañera (la hace ella, una sola vez)
**2.1 Proteger la cuenta raíz** (entrando una vez como raíz): *Security credentials* → activar **MFA** (app autenticadora o llave de seguridad); comprobar que **no hay claves de acceso** de la raíz (si existen, borrarlas). Guardar la contraseña raíz en su gestor y **no usarla más**.

**2.2 Dejar que IAM vea la facturación:** *Account* → *IAM user and role access to Billing information* → **Activate IAM Access**.

**2.3 Alerta de presupuesto:** Billing → **Budgets** → *Create budget* → *Customize → Cost budget* → mensual, **25 USD** → alertas: 50 % real, 80 % real y 100 % **previsto**, a **dos** correos distintos (el suyo y el tuyo). *(Opcional, más estricto: una Budget Action que al 100 % aplique una política que impida lanzar recursos.)* Activar también **Cost Anomaly Detection** (Billing → Cost Anomaly Detection) con el mismo correo.

**2.4 Rol del servidor** (para Session Manager, sin SSH): IAM → Roles → *Create role* → AWS service **EC2** → política **AmazonSSMManagedInstanceCore** → nombre `twosides-metabase-ssm`. Anotar el ID de cuenta (12 dígitos).

**2.5 Usuario IAM limitado del operador:**
1. IAM → Users → *Create user* → `twosides-operator` → acceso a la consola con contraseña propia (generada, a cambiar al entrar). **Sin claves de acceso** (no hacen falta).
2. *Permissions → Create inline policy → JSON*: pega el contenido de `docs/B87_iam-operator-policy.json`, **sustituyendo `<ACCOUNT_ID>`** por el ID de cuenta. Nombre `twosides-operator-limited`.
3. **Nunca** le asignes `AdministratorAccess`, `PowerUserAccess` ni `IAMFullAccess`.
4. El operador entra en `https://<ID-cuenta>.signin.aws.amazon.com/console`, cambia la contraseña y **activa su MFA** antes de nada (la política deniega todo lo demás hasta que lo haga).
5. La política está escrita de memoria. Si la consola dice *AccessDenied: … not authorized to perform X*, la titular añade **solo esa acción**; no se amplía a comodines. Para comprobar sin riesgo: IAM → *Policy simulator*.

## 3. HTTPS válido: tres caminos (elige uno)
Un certificado válido exige que alguien demuestre que controla el **nombre** del sitio. Con IP o con el nombre automático de EC2 (`ec2-…compute-1.amazonaws.com`) no sirve: **Let's Encrypt rechaza esos nombres** (según lo que dicen sus foros de ayuda; en cualquier caso se comprueba al intentarlo).

| | **B-1 Dominio propio (recomendado)** | **B-2 Sin dominio: sslip.io** | **B-3 Sin dominio: CloudFront** |
|---|---|---|---|
| Qué es | Compras un dominio (~12 USD/año) y creas un registro DNS tipo A hacia la IP elástica | `54-1-2-3.sslip.io` es un nombre gratuito de terceros que resuelve a `54.1.2.3` | AWS te da `dxxxx.cloudfront.net` con certificado de AWS |
| Certificado | Let's Encrypt (Caddy, automático) | Let's Encrypt/ZeroSSL (Caddy, automático, por el 443) | Lo gestiona AWS |
| Puertos | 443 | 443 | 443 en CloudFront; **80 en la EC2 solo desde CloudFront** |
| Tiempo extra | 20 min | 5 min | 45–60 min |
| **Riesgos** | Mínimos; coste y renovación del dominio | **(1) Dependes de un DNS de terceros:** si lo comprometen o cambia de dueño pueden hacer que ese nombre apunte a otra IP y obtener un certificado válido para tu nombre (suplantación). **(2)** Límites de emisión compartidos del proveedor de certificados: puede fallar sin aviso (no verificado). **(3)** El nombre queda público en los registros de transparencia de certificados. **(4)** Algunos filtros corporativos bloquean ese dominio. **(5)** Aspecto poco profesional | El tramo CloudFront → EC2 va en **HTTP** (sin cifrar) por la red de AWS; hay que limitar la EC2 a las IP de CloudFront y exigir una cabecera secreta; más piezas que configurar |
| Cuándo | Si hay 10 minutos y 12 USD | Para salir del paso, aceptando el riesgo (1) | Si no quieres depender de terceros ni comprar dominio |

**Recomendación:** B-1. Si no es posible, B-3 es más sólido que B-2; B-2 solo como último recurso y con el riesgo anotado en el alcance. Esta guía desarrolla **B-1 y B-2** (mismo procedimiento con otro nombre); B-3 se describe en §6.5.

## 4. Imagen de Metabase: versión, digest y por qué difiere de B85
| | Imagen | Digest (lista de manifiestos) |
|---|---|---|
| **B85 (local)** | `v0.65.2` | `sha256:b62ac14872e9992d28218a2264d99484e0707064aae9fb594d8fbb3bc1518a9e` |
| **AWS (propuesta)** | `v0.65.3.4` (publicada en Docker Hub el 5-nov-2026) | `sha256:e8f38a6d846accfdd44cf8f31d9fb50648162ddf22daf469dac3a1e4727a7657` (amd64: `sha256:fd06d605cfd19edbb839bf817f7fc8127d0b55a0a1f714db61e15d049386e414`) |

**Por qué cambiar:** es un servicio expuesto a evaluadores de seguridad y Metabase publicó en 2026 varios avisos **críticos** (Jun–Oct: ejecución de código por bypass de la conexión, inyección SQL con enlaces públicos y con un endpoint sin autenticar, lectura/escritura de archivos con funciones de H2, deserialización; el último, GHSA-v44v-x8x4-mvcw, el 28-oct-2026), y desde agosto publica versiones menores cada semana centradas en seguridad. Se elige el **último parche de la misma línea 0.65** que B85, así la API y todas nuestras pruebas siguen siendo válidas.

**Lo que NO puedo afirmar** (consulté solo páginas públicas, hoy): (a) no pude leer las notas de las versiones 0.65.3.x ni confirmar qué arreglan; la página de versiones de GitHub que leí aún mostraba 0.65.2 como «Latest» (30-oct) mientras Docker Hub lista 0.65.3.x; (b) los digest anteriores provienen de la API de Docker Hub leída hoy; **verifícalos al descargar** (abajo); (c) «sin vulnerabilidades conocidas relevantes» no se puede garantizar: se reduce con los pasos siguientes.

**Pasos obligatorios antes de abrir el acceso:**
1. El día de la puesta en marcha, revisa <https://github.com/metabase/metabase/security/advisories> y las versiones publicadas. Si hay una versión más nueva de la línea 0.65 o un aviso que afecte a 0.65.3.4, **actualiza el digest** (y vuelve a pasar las pruebas).
2. Descarga por digest (Docker comprueba que el contenido coincide con el digest): `sudo docker pull metabase/metabase@sha256:e8f38a6d846accfdd44cf8f31d9fb50648162ddf22daf469dac3a1e4727a7657`. En la página de Docker Hub de la etiqueta `v0.65.3.4` el digest debe ser el mismo.
3. **Escaneo de vulnerabilidades** en el servidor (sin abrir nada): `sudo docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest image --severity HIGH,CRITICAL --ignore-unfixed metabase/metabase@sha256:e8f38a6d…` (fija también la imagen de trivy por digest si puedes). Anota el resultado. Cualquier HIGH/CRITICAL **con corrección disponible** exige actualizar o justificar por escrito.
4. **Hecho en local (6-nov-2026, con autorización del propietario):** la imagen se descargó por etiqueta y su digest resultó ser exactamente `sha256:e8f38a6d…7657`; las pruebas reales de B87 endurecidas (`B87_METABASE_IMAGE=metabase/metabase@sha256:e8f38a6d… B87_REAL_TESTS=1`) pasan **11/11** con ella, igual que con la de B85, y la prueba de Caddy (§6.4) también. **Trivy 0.58.1** (base de datos descargada ese día; `--scanners vuln`, severidad HIGH/CRITICAL) sobre la imagen exportada: **0 vulnerabilidades** en el sistema (Alpine 3.24.3) y **0** en los paquetes Java. Un escaneo limpio no demuestra ausencia de fallos: solo que no hay avisos *conocidos* en esa base ese día. Repítelo en el servidor el día de la puesta en marcha (paso 3).
5. **Avisos críticos de 2026 y esta versión (no confirmado).** Leí las páginas de GHSA-vwf4-m7j8-wcjf (CVE-2026-72898, CVSS 10, inyección SQL sin autenticar, explotación activa confirmada por Metabase) y GHSA-v44v-x8x4-mvcw. El primero indica afectadas las líneas 0.58 a 0.63 (corregidas en 58.24, 59.21, 60.17, 61.11, 62.9 y 63.5) y **no menciona 0.65**; el segundo afecta a 0.64 anteriores a 0.64.3.4 y **tampoco menciona 0.65**. De eso se **infiere**, sin poder confirmarlo, que 0.65.x no está en los rangos afectados; **ningún aviso dice que 0.65.3.4 los corrija**, y las notas de la versión solo citan un cambio no relacionado (#86411). Por eso, **además** de la versión, se aplica la mitigación que Metabase indica para CVE-2026-72898: bloquear `/api/session/reset_password` (y `forgot_password`) en Caddy (§6.4). Lo comprobé en local: sin el bloqueo, una petición directa a ese endpoint llega a Metabase (responde 400 «password is too common», es decir, valida el cuerpo sin autenticación); con él, Caddy responde 404 y Metabase no la ve. Las páginas las leí a través de un lector automático que resume el contenido: **contrástalas tú** antes de abrir.
6. Durante las pruebas de los evaluadores, revisa los avisos **cada semana**; si sale un parche crítico, actualiza o cierra el acceso. Si el servidor llegó a estar abierto con una versión afectada, aplica lo que dicen los avisos: revocar sesiones, revisar cuentas y claves, rotar credenciales y revisar registros.

## 5. Crear los recursos en AWS (consola web, como operador)
**5.1 Grupo de seguridad** — EC2 → Security Groups → *Create*: `twosides-metabase-sg`, VPC por defecto.
- **Inbound: ninguna regla al crearlo** (acceso cerrado). Más tarde se añade 443 (§12).
- **Nunca** reglas para 22 ni para 3000.
- Outbound: deja la predeterminada.

**5.2 Instancia** — EC2 → *Launch instance*: nombre `twosides-metabase`; AMI **Amazon Linux 2023** (x86_64); tipo **t3.small** (2 GB; usa **t3.medium** si hay muchos evaluadores a la vez); **sin par de claves**; VPC por defecto con IP pública automática; grupo `twosides-metabase-sg`; disco **20 GiB gp3 cifrado**; *Advanced details* → **IAM instance profile** `twosides-metabase-ssm` y **Metadata version = V2 only**; protección contra terminación desactivada. Etiquétala (`Project=twosides`) para localizar costes.

**5.3 IP elástica** — EC2 → Elastic IPs → *Allocate* → *Associate* con la instancia. Apunta la IP (`EIP`).

**5.4 Entrar sin SSH** — EC2 → Instances → *Connect* → **Session Manager** → *Connect* (1–2 min la primera vez). Si se queda sin conectar, revisa el rol de la instancia y espera.

## 6. Preparar el servidor (en el terminal de Session Manager)
**6.1 Sistema y Docker**
```bash
sudo dnf update -y
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo mkdir -p /opt/metabase-data /opt/caddy
```
Activa las actualizaciones de seguridad del sistema: `sudo dnf install -y dnf-automatic && sudo systemctl enable --now dnf-automatic.timer` (revisa `/etc/dnf/automatic.conf`: `upgrade_type = security`, `apply_updates = yes`). Reinicia el servidor una vez si se actualiza el kernel.

**6.2 Claves de Metabase** (se generan en el servidor y **no se muestran**):
```bash
sudo sh -c 'umask 077; { printf "MB_ENCRYPTION_SECRET_KEY=%s\n" "$(openssl rand -base64 32)"; printf "MB_SESSION_SECRET_KEY=%s\n" "$(openssl rand -base64 32)"; } > /opt/metabase.env'
```
Copia **una vez** el contenido (`sudo cat /opt/metabase.env`) a tu gestor de contraseñas y limpia la pantalla. La primera clave cifra la contraseña del reader guardada en Metabase; si la pierdes no podrás descifrarla (se recrea reaprovisionando). La segunda firma las sesiones.

**6.3 Metabase** (imagen por digest, datos H2 en disco, solo loopback, sin capacidades ni escalada de privilegios, registros rotados). Sustituye `NOMBRE` por el nombre público (§3):
```bash
sudo docker run -d --name metabase --restart unless-stopped \
  --cap-drop=ALL --cap-add=CHOWN --cap-add=SETUID --cap-add=SETGID --cap-add=DAC_OVERRIDE --cap-add=FOWNER \
  --security-opt no-new-privileges:true --pids-limit 512 --memory 1536m --cpus 2 \
  --log-driver json-file --log-opt max-size=10m --log-opt max-file=5 \
  -p 127.0.0.1:3000:3000 \
  -v /opt/metabase-data:/metabase-data -e MB_DB_FILE=/metabase-data/metabase \
  --env-file /opt/metabase.env -e JAVA_OPTS=-Xmx1024m \
  -e MB_SITE_URL=https://NOMBRE -e MB_REDIRECT_ALL_REQUESTS_TO_HTTPS=true \
  -e MB_DISABLE_LEGACY_STARTUP_ENCRYPTION=true \
  -e MB_ANON_TRACKING_ENABLED=false -e MB_CHECK_FOR_UPDATES=false -e MB_ENABLE_PUBLIC_SHARING=false -e MB_ENABLE_EMBEDDING=false \
  metabase/metabase@sha256:e8f38a6d846accfdd44cf8f31d9fb50648162ddf22daf469dac3a1e4727a7657
```
**Contraseñas:** probé `MB_PASSWORD_COMPLEXITY` y `MB_PASSWORD_LENGTH` (que una página de ayuda sugiere) y **no se aplican** en Metabase 0.65.2: un administrador puede crear usuarios con contraseñas de 8 caracteres e incluso comunes (acepté `Abcd1234`); solo el asistente inicial de instalación rechaza contraseñas comunes. Por eso **no** se incluyen: la longitud mínima de **15** la exige el script y el procedimiento. Probado en local (con la imagen de B85): el arranque **falla** con solo `--cap-drop=ALL` («adduser: Operation not permitted»: el script de entrada de la imagen crea y usa el usuario sin privilegios `metabase`), por eso se devuelven únicamente `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER`; con ese conjunto el proceso Java corre como `metabase` (no root) con los datos en volumen. Arranca con estas variables y emite HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` y una política CSP. **No se pudo confirmar** que `MB_REDIRECT_ALL_REQUESTS_TO_HTTPS` redirija solo (no importa: el puerto 80 está cerrado y Caddy solo sirve HTTPS). Espera ~2 min: `curl -s http://127.0.0.1:3000/api/health` → `{"status":"ok"}`.

> **Sobre H2.** La guía oficial de Metabase recomienda una base de datos de producción (Postgres) en lugar de H2. Aquí se mantiene H2 en disco, como se decidió, por sencillez. Riesgos: un solo archivo, sin replicación, copias manuales (§12). Los avisos de H2 de 2026 conciernen a H2 **como fuente de datos**; los evaluadores (sin permisos de administrador) no pueden añadir fuentes, y la única fuente es Atlas. Si el tiempo lo permite, pasar a un contenedor Postgres es el siguiente endurecimiento.

**6.4 Caddy (HTTPS) con nombre público** — crea el Caddyfile (`sudo tee /opt/caddy/Caddyfile`, pega y termina con Ctrl+D):
```
{
	auto_https disable_redirects
}
NOMBRE {
	tls {
		issuer acme {
			disable_http_challenge
		}
	}
	encode zstd gzip
	request_body {
		max_size 5MB
	}
	header {
		-Server
		Referrer-Policy no-referrer
		Permissions-Policy "geolocation=(), microphone=(), camera=()"
	}
	log {
		output file /data/access.log {
			roll_size 10mb
			roll_keep 10
		}
		format json
	}
	# CVE-2026-72898 (GHSA-vwf4-m7j8-wcjf) y similares: estos endpoints no autenticados no se usan (no hay correo configurado) y se bloquean antes del proxy.
	@reset path_regexp reset (?i)(reset_password|forgot_password)
	handle @reset {
		respond "Not found" 404
	}
	handle {
		reverse_proxy 127.0.0.1:3000 {
			header_up X-Forwarded-Proto https
		}
	}
}
```
- **B-1:** `NOMBRE` = `metabase.tudominio.com`, con un registro DNS **A** hacia `EIP`.
- **B-2:** `NOMBRE` = la IP con guiones + `.sslip.io` (p. ej. `54-1-2-3.sslip.io`).
- `disable_http_challenge` obliga a Caddy a validar por el 443 (TLS-ALPN) y **no necesita el puerto 80**. Valida el archivo antes: `sudo docker run --rm -v /opt/caddy/Caddyfile:/etc/caddy/Caddyfile:ro caddy:2 caddy validate --config /etc/caddy/Caddyfile`.
- Fija Caddy por digest: `sudo docker pull caddy:2`, `sudo docker image inspect caddy:2 --format '{{index .RepoDigests 0}}'` y usa ese `caddy@sha256:…` abajo.
```bash
sudo docker run -d --name caddy --restart unless-stopped --network host \
  --cap-drop=ALL --cap-add=NET_BIND_SERVICE --security-opt no-new-privileges:true \
  --log-driver json-file --log-opt max-size=10m --log-opt max-file=5 \
  -v /opt/caddy/Caddyfile:/etc/caddy/Caddyfile:ro -v /opt/caddy/data:/data \
  caddy@sha256:<digest obtenido>
```
**Fase 1 (cerrado):** hasta pasar la §11, el grupo de seguridad **no tiene reglas de entrada**, así que Caddy no podrá obtener el certificado todavía. Es lo esperado: el certificado se emite al abrir el 443 (§12).

**6.5 Variante B-3 (CloudFront), resumen:** CloudFront → *Create distribution*: origen = el *Public IPv4 DNS* de la EC2 (no la IP), *Protocol* **HTTP only**, puerto 80; *Viewer protocol policy* **Redirect HTTP to HTTPS**; política de caché **CachingDisabled**; *Origin request policy* **AllViewer**; *Custom header* `X-Origin-Secret: <valor aleatorio largo>`. En la EC2: Caddy escucha en el 80 y **rechaza** peticiones sin esa cabecera exacta; el grupo de seguridad admite 80 **solo desde** la *managed prefix list* `com.amazonaws.global.cloudfront.origin-facing`. Metabase: `MB_SITE_URL=https://dxxxx.cloudfront.net`. Más piezas, más posibilidades de error: hazlo solo si descartas B-1 y B-2.

## 7. Atlas: permitir solo la IP elástica (acción **tuya**, web de Atlas)
Atlas → Security → **Network Access** → *Add IP Address* → `EIP/32` → comentario `twosides-metabase-aws` → *Temporary* con caducidad (la del fin de la ventana de pruebas + 1 día) → Confirm. No toques las demás entradas; **nunca `0.0.0.0/0`**. No se cambia ningún usuario ni rol: el reader ya es de solo lectura sobre los agregados.

## 8. Crear la conexión, la colección y el panel (desde tu PC)
Con el acceso cerrado aún no se puede llegar a Metabase desde tu PC. Hazlo en la **Fase 2** (§12), con tu IP temporalmente autorizada, o por túnel de Session Manager (`aws ssm start-session …`, requiere AWS CLI y el plugin). Como el script exige `https://` o loopback, usa la URL pública (`https://NOMBRE`) en la Fase 2:
```powershell
.\tools\b87\Run-B87-Metabase-Provision.ps1 -MetabaseUrl https://NOMBRE -AtlasHost <cluster>.<id>.mongodb.net -WithEvaluator
```
Pide con prompts **ocultos**: correo y contraseña del administrador (**15+ caracteres**, fuerte, única), contraseña del reader de Atlas y correo/contraseña del evaluador (15+). Crea la conexión (reader, SCRAM-SHA-1), la colección y el panel «Datos de prueba del propietario», las 15 preguntas, desactiva caché y compartir/incrustar, borra la base de ejemplo y crea la cuenta de evaluador **sin permisos de administrador** (lectura de esa colección; no puede crear preguntas, consultas libres, conexiones ni usuarios, ni cambiar ajustes). Si falla, dice `Provisioning failed: <código>`: copia solo esa línea.

## 9. Endurecimiento de Metabase (resumen de lo que ya está aplicado y lo que falta)
| Medida | Cómo |
|---|---|
| Administrador con contraseña fuerte | El script exige ≥15 caracteres (el servidor no valida la fortaleza al crear usuarios como administrador: comprobado). Un solo administrador. Contraseña única y generada, en el gestor |
| Evaluador sin privilegios | Cuenta creada por el script: no admin; solo lectura de una colección; ejecución de preguntas guardadas |
| Sin enlaces públicos ni incrustación | `MB_ENABLE_PUBLIC_SHARING=false`, `MB_ENABLE_EMBEDDING=false`, y el script lo apaga por API |
| Una sola fuente de datos | Se borra la base de ejemplo; solo la conexión a Atlas (reader) |
| Sin caché | Estrategia global «sin caché» (la API `enable-query-caching` es de solo lectura en esta versión) |
| Claves | `MB_ENCRYPTION_SECRET_KEY` y `MB_SESSION_SECRET_KEY` en un archivo `600` y en tu gestor |
| Contenedor | `--cap-drop=ALL` + 5 capacidades mínimas (el proceso corre como usuario no-root), `no-new-privileges`, límite de procesos y memoria, solo loopback |
| Telemetría y actualizaciones automáticas | Desactivadas; **tú** controlas la versión |
| 2FA | **No disponible** en la edición abierta que usamos (el aviso de la v64 la menciona solo para Pro/Enterprise): riesgo aceptado, compensado con contraseñas de 15+ y una única cuenta de administrador |
| Contraseña del reader | Se guarda en Metabase **cifrada**, pero un administrador puede ver la URI de conexión. El evaluador no. Si hace falta, rota la contraseña en Atlas y edita la conexión |

## 10. Registros básicos
- **Caddy:** `/opt/caddy/data/access.log` (JSON, rota a 10 MB × 10). Revisa: `sudo tail -n 50 /opt/caddy/data/access.log`.
- **Metabase y Caddy (stdout):** `sudo docker logs --since 1h metabase`, `… caddy` (rotados por Docker).
- **AWS:** CloudTrail registra 90 días de eventos de gestión sin configurar nada (CloudTrail → *Event history*); activa también *Billing → Cost Explorer*.
- **Durante la ventana de pruebas:** revisa cada día intentos de inicio de sesión fallidos y errores 4xx/5xx; apunta fecha, IP y qué viste. No hay SIEM: esto es vigilancia manual.
- Comprueba que **no hay secretos** en los registros (§11, punto 17).

## 11. Lista de comprobaciones **antes de abrir el acceso** (hazla entera; guarda las salidas)
| # | Comprobación | Cómo | Esperado |
|---|---|---|---|
| 1 | Cuenta raíz protegida | Titular: MFA activo, sin claves de acceso, no se usa | Sí |
| 2 | Operador limitado y con MFA | IAM → Users → `twosides-operator` | Sin políticas administrativas; MFA activo |
| 3 | Alerta de presupuesto | Billing → Budgets | Existe, con dos correos |
| 4 | Grupo de seguridad cerrado | EC2 → SG → Inbound | **Sin reglas**; ni 22 ni 3000 ni 0.0.0.0/0 |
| 5 | Metabase solo en loopback | `sudo ss -ltnp \| grep ':3000'` | `127.0.0.1:3000` (nunca `0.0.0.0` / `*` / `[::]`) |
| 6 | Publicación del contenedor | `sudo docker port metabase` | `3000/tcp -> 127.0.0.1:3000` |
| 7 | Imagen fijada y esperada | `sudo docker inspect metabase --format '{{.Config.Image}}'` | El digest de la §4 |
| 8 | Versión de Metabase | `curl -s http://127.0.0.1:3000/api/session/properties \| grep -o '"tag":"[^"]*"'` | v0.65.3.4 (o la que hayas decidido) |
| 9 | Escaneo de vulnerabilidades | Trivy (§4, paso 3) | Sin HIGH/CRITICAL con corrección disponible, o justificadas por escrito |
| 10 | Avisos de seguridad del día | GitHub advisories de Metabase | Ninguno sin parchear que afecte a tu versión |
| 11 | Contraseñas | Las del administrador y del evaluador tienen ≥15 caracteres, generadas por el gestor y únicas (Metabase **no** lo impone: se comprueba a mano) | Sí |
| 12 | Un solo administrador | Admin → People | Solo tú; el evaluador **sin** «Admin» |
| 13 | Evaluador sin privilegios | Entrar como evaluador: debe ver el panel y ejecutar preguntas; **no** debe ver *Admin*, ni crear preguntas/consultas, ni listar usuarios/ajustes (la API responde 403) | Cumple todo |
| 14 | Sin enlaces públicos ni incrustación | Admin → Settings → Public sharing / Embedding | Desactivados |
| 15 | Única fuente: Atlas | Admin → Databases | Solo «Atlas analítico — Two Sides (solo lectura)» |
| 16 | Atlas | Network Access | Solo `EIP/32` temporal (+ las tuyas previas); nada `0.0.0.0/0` |
| 17 | Sin secretos en registros | `read -rs P; sudo docker logs metabase 2>&1 \| grep -cF "$P"; sudo docker logs caddy 2>&1 \| grep -cF "$P"; unset P` (pega la contraseña del reader) | `0` y `0` |
| 18 | Sin secretos en historial | `history \| grep -iE 'pass\|secret\|mongodb\+srv'` | Sin valores reales |
| 19 | Claves guardadas | `sudo ls -l /opt/metabase.env` | `-rw-------` y copia en el gestor |
| 20 | Copia de seguridad | EC2 → Volumes → *Create snapshot* | Creada |
| 21 | Cierre rápido ensayado | Sabes dónde borrar las reglas del SG (§13) | Sí |
| 22 | Alcance firmado | `B87_ALCANCE_EVALUADORES.md` rellenado y aceptado por los evaluadores | Sí |
| 23 | Ventana definida | Fechas y horas en el alcance; recordatorio para cerrar | Sí |
| 24 | Bloqueo de restablecimiento de contraseña en Caddy | `grep -c 'reset_password' /opt/caddy/Caddyfile` y `sudo docker run --rm -v /opt/caddy/Caddyfile:/etc/caddy/Caddyfile:ro caddy:2 caddy validate --config /etc/caddy/Caddyfile` | `1` y «Valid configuration» (la prueba funcional contra el 443 es el paso 6 de la §12, porque hasta abrir no hay certificado) |
| 25 | Avisos de CVE-2026-72898 y GHSA-v44v-x8x4-mvcw leídos por ti | Abre ambas páginas de `github.com/metabase/metabase/security/advisories` y comprueba que la línea 0.65 sigue sin figurar como afectada, o que tu versión es la corregida | Anotado en tu registro |

## 12. Abrir el acceso (solo tras la lista) y comprobar desde fuera
1. **Fase 2:** EC2 → SG → *Edit inbound rules* → añade **solo** `HTTPS 443` con origen `0.0.0.0/0` (o, mejor, las IP de los evaluadores si las facilitan) y descripción con la fecha de cierre.
2. Caddy obtiene el certificado al primer acceso (mira `sudo docker logs caddy`). Abre `https://NOMBRE`: candado válido.
3. Ejecuta el aprovisionamiento (§8) y repite las comprobaciones 11–15 sobre el sistema real.
4. **Desde otra red** (por ejemplo, el móvil con datos): `Test-NetConnection EIP -Port 443` → `True`; puertos **22, 80, 3000, 5432, 27017** → `False`. Si tienes `nmap`: `nmap -Pn -p- EIP` solo debe mostrar 443 abierto.
5. Comprueba el certificado y la configuración TLS con un analizador externo (p. ej. SSL Labs) y que la respuesta incluye HSTS.
6. **Bloqueo de restablecimiento y funcionamiento normal**, desde fuera (sustituye `NOMBRE`): `curl -s -o /dev/null -w "%{http_code}\n" -X POST https://NOMBRE/api/session/reset_password` y lo mismo con `forgot_password` → **404** ambos; `curl -s -o /dev/null -w "%{http_code}\n" https://NOMBRE/api/health` → **200**; entra en el navegador con la cuenta de evaluador, abre el panel «Datos de prueba del propietario» y comprueba que las preguntas cargan. Si el inicio de sesión o el panel fallan, el bloqueo no es la causa (en las pruebas locales ambos funcionaron con él), pero revisa `sudo docker logs caddy`.
6. Entrega a los evaluadores la URL, la cuenta de evaluador (contraseña por canal distinto) y el documento de alcance.

## 13. Cerrar y apagar
**Botón rojo (1 minuto):** EC2 → Security Groups → `twosides-metabase-sg` → *Edit inbound rules* → **borra todas las reglas** → Save. Después: Atlas → Network Access → borra `twosides-metabase-aws`. Con eso Metabase deja de ser accesible y de poder leer Atlas.

**Pausa:** EC2 → *Instance state → Stop*. El disco y la IP elástica siguen cobrando.

**Borrado completo** (en este orden):
1. EC2 → Instances → *Terminate* (el disco se borra con ella).
2. EC2 → Elastic IPs → *Release*.
3. EC2 → Volumes y Snapshots: borra los que creaste.
4. EC2 → Security Groups → borrar `twosides-metabase-sg`.
5. CloudFront (si lo usaste): *Disable* y luego *Delete* la distribución.
6. Route 53 (si lo usaste): borra los registros y la zona; el dominio, si no lo quieres, no lo renueves.
7. IAM: borra el usuario `twosides-operator` y el rol `twosides-metabase-ssm` (y su *instance profile*).
8. Atlas: elimina la entrada de red si aún está; cambia o elimina la contraseña del reader si ya no se usará.
9. Metabase: al borrar la instancia se pierde su configuración (se recrea con el script).
10. Al día siguiente, Billing → *Bills* y *Cost Explorer*: ningún cargo corriente. Revisa otras regiones.

## 14. Coste aproximado (us-east-1; **verifícalo** en la calculadora de AWS)
| Concepto | Aprox. mensual |
|---|---|
| t3.small 24 h (t3.medium) | ~15 USD (~30 USD) |
| Disco gp3 20 GiB | ~2 USD |
| IPv4 pública / IP elástica | ~3,6 USD (se cobra aunque la instancia esté apagada) |
| Snapshots | pocos céntimos |
| Tráfico, Session Manager, IAM, CloudTrail (eventos de gestión) | ~0 |
| Dominio + DNS (B-1) | ~12 USD/año + ~0,5 USD/mes |
| CloudFront (B-3) | ~0 con el nivel gratuito del volumen esperado |
| **Total** | **~20 USD/mes** (una semana de pruebas: ~5 USD) |
Con el presupuesto de 25 USD y las alertas de §2.3 un olvido se detecta pronto, pero **no se detiene solo**: cierra y borra al terminar.

## 15. Riesgos aceptados y lo que no se ha verificado
- Servicio expuesto a pruebas de seguridad con una edición sin 2FA y con H2.
- El bloqueo de Caddy se probó con Caddy 2.11.9 en local, con 24 variantes de ruta (mayúsculas, codificación, barras dobles, `..`, con y sin consulta; GET y POST); una variante no probada podría esquivarlo. No sustituye a actualizar.
- Dependencia de la política de versiones de Metabase: la imagen propuesta pasa las pruebas de B87 y un escaneo Trivy limpio, pero **no se ha podido confirmar que 0.65.3.4 corrija CVE-2026-72898 ni GHSA-v44v-x8x4-mvcw** (los avisos no citan la línea 0.65); la mitigación del bloqueo en Caddy cubre solo el primero y solo en el 443 (Metabase en `127.0.0.1:3000` no pasa por Caddy, pero es inaccesible desde fuera).
- B-2 (sslip.io): riesgo de suplantación por un DNS de terceros y de fallo de emisión.
- No se probó nada en AWS ni en Atlas desde aquí: la política IAM, los pasos de consola, los precios y la conexión SRV/TLS a Atlas están sin verificar.
- Las pruebas de seguridad de los evaluadores pueden producir hallazgos sobre la propia aplicación Metabase; el alcance indica cómo se tratan.

## 16. Despliegue real realizado (2026-11-06): Cloudflare Tunnel en us-east-2
**Este apartado sustituye a §3, §5.2–§5.3 (parte HTTPS/443) y §12.1 en lo que choque con él.** URL pública: **https://stats.twosidesgame.com**.

**Cambios de diseño respecto a lo anterior**
- **Región us-east-2** (una política de control de servicios de la organización deniega us-east-1 y us-west-2).
- **Sin puerto 443 abierto:** el grupo de seguridad `twosides-metabase-sg` (`<ID_GRUPO_SEGURIDAD>`) **no tiene reglas de entrada**. El tráfico entra por **Cloudflare Tunnel** (`twosides-metabase`, contenedor `cloudflared` fijado por digest `cloudflare/cloudflared@sha256:4955524aeaa379e154023d5a027c250f7b35041a2e7e950cf13f144bc9b9c5ba`, saliente desde la instancia).
- **Cadena dentro de la instancia:** Cloudflare → cloudflared → **Caddy en `127.0.0.1:8080`** (`caddy@sha256:ce773ec7a742ce15ee6bf2bb5f65882b9e2a4487b10733e6f1484f86e6b5d8bc`) → **Metabase en `127.0.0.1:3000`**. Caddy es obligatorio: bloquea `reset_password` y `forgot_password` (404).
- **Caddyfile:** el sitio es `:8080` con `bind 127.0.0.1`, **sin** nombre de host, porque cloudflared reenvía `Host: stats.twosidesgame.com`. Con `http://127.0.0.1:8080` Caddy devolvía un **200 vacío** a todo, incluido el tráfico real, sin aplicar el bloqueo. **Prueba siempre con la cabecera `Host` real** (`curl -H "Host: stats.twosidesgame.com" …`).
- **Credencial del túnel:** SSM Parameter Store `/twosides/cloudflared/credentials` (SecureString, us-east-2). En la instancia, `/etc/cloudflared/<id>.json` (modo 400, usuario del contenedor). Nada en el repositorio ni en user-data. El rol `twosides-metabase-ssm` solo puede leer `/twosides/cloudflared/*`.
- **Cloudflare:** solo se creó el registro `stats.twosidesgame.com` (CNAME proxied al túnel). Metabase tiene `MB_SITE_URL=https://stats.twosidesgame.com` y `MB_REDIRECT_ALL_REQUESTS_TO_HTTPS=false` (Cloudflare termina TLS).
- **Aprovisionamiento** por túnel de Session Manager (`aws ssm start-session … AWS-StartPortForwardingSession portNumber=3000,localPortNumber=14300`) y `Run-B87-Metabase-Provision.ps1 -MetabaseUrl http://127.0.0.1:14300`, **antes** de activar cloudflared (así el asistente de instalación nunca estuvo expuesto).

**Recursos (us-east-2)**: instancia `<ID_INSTANCIA>` (**c7i-flex.large**, 2 vCPU y 4 GiB, AL2023, 20 GiB gp3 cifrado, IMDSv2 obligatorio, sin clave SSH, swap de 2 GB); la `t3.small` original (`<ID_INSTANCIA_ANTIGUA>`) quedó **parada** y se conserva la imagen `<ID_AMI>` hasta confirmar que todo va bien (borrarlas después), IP elástica `<IP_ELASTICA>` (`<ID_ASIGNACION_EIP>`), rol e instance profile `twosides-metabase-ssm`, presupuesto `twosides-25usd` (**40 USD/mes**, el nombre se conserva; avisos al 80 % y 100 %), túnel `<ID_TUNEL>`. Atlas: `<IP_ELASTICA>/32` (añadida por el propietario).

**Comprobado (2026-11-06)**: puertos en la instancia (solo 3000 y 8080 en 127.0.0.1; `sshd` escucha pero el SG no admite entrada), SG sin reglas, imagen por digest y versión v0.65.3.4, claves de Metabase ausentes de registros y archivos de Caddy/cloudflared (0 coincidencias), `setup-token` nulo, desde fuera: cabecera `cf-ray` presente, `reset_password` y `forgot_password` → 404, `/api/health` → 200, inicio de sesión con credenciales falsas → 401.
**No comprobado por mí**: el inicio de sesión con las credenciales reales y el panel (lo hace el propietario); las contraseñas de Atlas/Metabase en los registros (no las conozco); que `0.65.3.4` corrija CVE-2026-72898 y GHSA-v44v-x8x4-mvcw (**no confirmado**); §11 puntos 1, 2, 22–23 (cuenta raíz, MFA, alcance firmado, ventana definida); instantánea del volumen (punto 20).

**Cerrar y apagar (este despliegue)**
- *Cierre inmediato:* `aws ssm send-command --region us-east-2 --instance-ids <ID_INSTANCIA> --document-name AWS-RunShellScript --parameters 'commands=["docker update --restart=no cloudflared","docker stop cloudflared"]'` (o parar la instancia). Después, Atlas → borra `<IP_ELASTICA>/32`.
- *Pausa:* `aws ec2 stop-instances --region us-east-2 --instance-ids <ID_INSTANCIA>` (disco e IP siguen cobrando).
- *Borrado completo (en orden):* `aws ec2 terminate-instances …`; `aws ec2 release-address --allocation-id <ID_ASIGNACION_EIP>`; `aws ec2 delete-security-group --group-id <ID_GRUPO_SEGURIDAD>`; `cloudflared tunnel route dns` no borra: elimina el CNAME `stats` en el panel de Cloudflare y luego `cloudflared tunnel delete twosides-metabase`; `aws ssm delete-parameter --name /twosides/cloudflared/credentials`; `aws iam remove-role-from-instance-profile`, `delete-instance-profile`, `delete-role-policy --policy-name read-tunnel-param`, `detach-role-policy` (AmazonSSMManagedInstanceCore), `delete-role` (rol `twosides-metabase-ssm`); `aws budgets delete-budget --account-id <ID_CUENTA_AWS> --budget-name twosides-25usd`; Atlas: quitar la IP.

**Dimensionado y coste (corrección tras el primer fallo).** Con `t3.small` (2 GB), Metabase agotó la memoria (carga 49, 27 MB libres, sin OOM-kill) y la web dejó de responder. En una cuenta de **plan gratuito**, AWS no permite cambiar el tipo de una instancia (`FreeTierRestrictionError`) ni lanzar `t3.medium` (aunque `--dry-run` diga que sí); los tipos elegibles son t3.micro/small, t4g, t8i y **c7i-flex.large / m7i-flex.large**. Se lanzó `c7i-flex.large` desde una imagen de la instancia parada y se movió la IP elástica. Metabase se recreó con la misma imagen por digest y la misma configuración endurecida, pero `--memory 3g --memory-swap 3g` y `JAVA_OPTS=-Xmx1536m`; swap de 2 GB (`/swapfile`, `vm.swappiness=10`). Coste aproximado en us-east-2 (**verifícalo**): c7i-flex.large ≈ 0,085 USD/h (≈ 62 USD/mes si estuviera encendida todo el mes), disco 20 GiB gp3 ≈ 1,6 USD, IP pública ≈ 3,6 USD, imagen/snapshot ≈ 1 USD mientras exista; los créditos del plan gratuito lo cubren mientras duren. Si no hacen falta 4 GiB, una alternativa más barata en una cuenta de pago es `t3.medium` (≈ 0,042 USD/h). Apaga la instancia fuera de la ventana de pruebas.
