# B25 — Certificados HTTPS locales generados y verificados (NO instalados)

Fecha: 2026-11-02. Se generaron una CA local de pruebas y un certificado de servidor para `localhost`/`127.0.0.1` en `%LOCALAPPDATA%\TwoSidesLocalProxy\tls`, se destruyó la clave de la CA y se verificó todo **sin iniciar Caddy**. **No se instaló ninguna CA ni certificado (0 entradas «Two Sides» en `CurrentUser\Root`, `CurrentUser\CA`, `TrustedPeople` y `LocalMachine\Root`; ningún almacén de Windows modificado), no se inició Caddy, no se abrió ningún puerto (0 procesos `caddy`/`node`, 0 escuchas en 80/443/2019/3000/8443, tampoco UDP), no se activó Express `main`, no se conectó Atlas, no se ejecutó Godot, no se creó `override.cfg`, no se tocaron SQLite/partidas, JWT/contraseñas, `.env` ni respaldos, ACL fuera de la carpeta autorizada, ni C2Runtime, C.2/F.2; sin commits ni `push`.** La línea base de integridad sigue válida (3 168 archivos, `verify` = ok): solo cambiaron `docs/` y `tests/`. **B00 sigue pendiente.**

## 1. Rutas y contenido

| Elemento | Valor |
|---|---|
| Carpeta | `C:\Users\luis2\AppData\Local\TwoSidesLocalProxy\tls` — dentro de `%LOCALAPPDATA%`, fuera de OneDrive y del repositorio; creada con DACL protegido **antes** de generar nada (sin ventana insegura) |
| Contenido final (3 archivos) | `ca.crt` (1 241 B, público) · `localhost.crt` (1 245 B, público) · `localhost.key` (1 704 B, **privada**) |
| Eliminado | `ca.key`, `ca.srl`, `localhost.csr`, `*.cnf`, `*.ext` y todo el material de pruebas negativas |
| Herramienta | `openssl` 3.5.6 de Git for Windows (ya instalada), con el entorno depurado |

## 2. Certificados y vigencia

| | CA local de pruebas | Servidor |
|---|---|---|
| Sujeto | `CN=Two Sides LOCAL TEST CA (remove after use)` | `CN=localhost` |
| Algoritmo | RSA 2048, `sha256WithRSAEncryption` | RSA 2048, `sha256WithRSAEncryption` |
| Desde | 2026-11-02 06:10:39 UTC | 2026-11-02 06:10:39 UTC |
| Hasta | **2026-12-02 06:10:39 UTC (30 días)** | **2026-11-16 06:10:39 UTC (14 días)** |
| Huella SHA-256 | `85:9E:01:ED:2B:5B:85:ED:FA:59:CB:3D:1D:6B:11:FF:EB:66:DC:09:72:69:49:34:37:73:4F:09:FA:23:4E:B0` | `8B:FC:EB:89:75:88:17:98:55:71:19:10:BB:2B:70:9B:57:57:AF:45:54:94:DA:80:CF:B0:29:0A:AF:5E:FC:01` |
| Serie | `10:8f:ed:ff:bf:31:dc:24:ef:12:9b:12:31:2e:19:8c:ed:14:3a:a3` (aleatoria) | aleatoria (`-CAcreateserial`) |

Vigentes ahora (`-checkend 0` → 0); el certificado del servidor **caducará en 15 días** (`-checkend` de 15 días → 1) y la CA en 31 días: pasadas esas fechas hay que regenerar todo el conjunto.

## 3. Restricciones y usos

**CA:** `basicConstraints = critical, CA:TRUE, pathlen:0` (no puede crear sub-CA) · `keyUsage = critical, Certificate Sign` (nada más) · **`nameConstraints = critical, permitted: DNS:localhost, IP:127.0.0.1/255.255.255.255`** · `subjectKeyIdentifier`.
**Servidor:** `subjectAltName = DNS:localhost, IP Address:127.0.0.1` (únicamente esos dos) · `extendedKeyUsage = serverAuth` (TLS Web Server Authentication) · `keyUsage = critical, Digital Signature, Key Encipherment` · `basicConstraints = critical, CA:FALSE`. Sin comodines, sin otros nombres, sin uso de cliente, firma de código ni CA.

## 4. Verificaciones criptográficas

| Verificación | Resultado |
|---|---|
| Cadena `localhost.crt` → `ca.crt` (también **después** de destruir la clave de la CA, con solo material público) | **OK** |
| Nombre `localhost` / IP `127.0.0.1` | aceptados (código 0 / 0) |
| Nombre `evil.invalid` / IP `10.0.0.1` / `localhost.evil.invalid` | **rechazados** (código ≠ 0) |
| La CA real firmó (antes de destruir su clave) certificados desechables para `evil.invalid`, `example.com`, `10.0.0.1`, `localhost`+`evil.invalid` y `localhost`+`127.0.0.1`+`10.0.0.1` | **los 5 rechazados** con `permitted subtree violation` |
| Sub-CA firmada por la CA y hoja `localhost` emitida por ella | **rechazada** (`pathlen:0`) |
| Clave privada ↔ certificado del servidor | coinciden (hash de las claves públicas idéntico) |
| Vigencia | CA 30 d y servidor 14 d (máximos autorizados), no caducados |
| `ca.crt`/`localhost.crt` sin `PRIVATE KEY` | cierto |
| Formato de la clave | PKCS#8 sin cifrar (se comprobó solo la cabecera); no se mostró ni registró su contenido |

Los certificados desechables y sus claves se **sobrescribieron con bytes aleatorios y se borraron**, igual que `ca.key` (verificado: no existe). En un SSD el borrado físico no está garantizado; el riesgo residual queda acotado por `nameConstraints` (solo `localhost`), `pathlen:0` y los 30 días de vida.

## 5. ACL

- `tls`: propietario `luis2`; herencia **deshabilitada**; 3 reglas `Allow` `FullControl` `(OI)(CI)` para `SYSTEM`, `Administradores` y `luis2`; sin DENY, sin `Everyone`/`Users`/SID desconocidos.
- `ca.crt`, `localhost.crt`, `localhost.key`: las mismas 3 identidades (heredadas de `tls`), propietario `luis2`, sin DENY.
- `check-main-secrets-acl.ps1`: `tls` → `conforming` (0 fallos en carpeta y 3 archivos); `TwoSidesLocalProxy` completa → `conforming` (21 elementos, 0 con fallos).
- Ninguna clave privada fuera de `tls\`; ninguna copia `*.key`/`*.pem` nueva en el repositorio ni en OneDrive.
- No se modificó ninguna ACL fuera de la carpeta autorizada.

## 6. Configuración de Caddy

El `Caddyfile` (generado desde la plantilla corregida en B24) referencia exactamente `C:/Users/luis2/AppData/Local/TwoSidesLocalProxy/tls/localhost.crt` y `…/localhost.key`: coinciden con los archivos creados. **`caddy validate --config Caddyfile` → `Valid configuration`, exit 0** (se comprobó antes que `caddy.exe` conserva el SHA-256 verificado `5f93a9bd…db2a`). `validate` carga y aprovisiona sin arrancar: antes y después, 0 procesos `caddy`, 0 escuchas TCP/UDP; sus directorios de trabajo apuntaron a una carpeta temporal (que quedó vacía y se eliminó), por lo que **no creó ningún recurso** ni dentro de `TwoSidesLocalProxy` (`config\`, `data\` siguen vacías).

## 7. Cambios en el proyecto

Solo documentación y pruebas: `docs/local-https/leaf.ext.template` (ahora `subjectAltName = DNS:localhost,IP:127.0.0.1`, requisito de esta etapa) y `tests/sync/main-local-https-plan.test.js` (LP02 comprueba también la validación por IP 127.0.0.1; **LP08 nueva** comprueba los certificados reales: 3 archivos exactos, sin clave de CA, cadena válida, restricciones, 30/14 días, nombres ajenos rechazados; solo lee material público). Nada en `src/`, `scripts/` ni dependencias; el manifiesto no se regeneró.

Pruebas: `main-local-https-plan.test.js` **8/8**. Suite completa `run-backend-regression.js`: **732 + 9 aprobadas, 15 + 1 omitidas, 0 fallos** (en una ejecución intermedia falló una vez `SU03` de C.2 —inestable conocida y ajena a esta etapa—; pasó 14/14 en tres repeticiones aisladas y en la ejecución completa siguiente). Legacy **39/39**; escáner de secretos **clean**; integridad **ok**.

## 8. Procedimiento seguro de instalación y retirada (NO ejecutado; requiere autorización)

**Instalación (solo `CurrentUser`, nunca `LocalMachine`):**
1. Comprobar que `ca.crt` no cambió y que su huella SHA-256 es la de §2: `openssl x509 -in ca.crt -noout -fingerprint -sha256`.
2. Comprobar que la vigencia no ha caducado (`-checkend 0`); si ha caducado, regenerar todo (§9).
3. `certutil -user -addstore Root "%LOCALAPPDATA%\TwoSidesLocalProxy\tls\ca.crt"`. Windows puede mostrar un aviso de seguridad: aceptar **solo** si la huella mostrada coincide con la de §2.
4. Verificar: `certutil -user -store Root | findstr /i "Two Sides"` → una entrada; ninguna en `LocalMachine`.
5. No usar `caddy trust`.

**Retirada (obligatoria al terminar las pruebas):**
1. `certutil -user -delstore Root "<número de serie 108fedffbf31dc24ef129b12312e198ced143aa3 o la huella>"` (o `Remove-Item Cert:\CurrentUser\Root\<huella SHA-1>`).
2. Comprobar que `certutil -user -store Root` ya no contiene «Two Sides».
3. Eliminar `tls\` (o toda `TwoSidesLocalProxy`) tras la prueba; vaciar la papelera si se usó.
4. Aunque se olvidara, la CA caduca el 2026-12-02 y solo puede avalar `localhost`.

## 9. Renovación

La clave de la CA ya no existe: **no se pueden emitir más certificados con esta CA**. Si hay que alargar o rehacer la prueba, se repite todo el procedimiento (CA nueva + hoja nueva, retirando la CA anterior del almacén si se instaló), con autorización.

## 10. Riesgos pendientes

- `localhost.key` está sin cifrar (Caddy la necesita así), protegida solo por ACL: un proceso de `luis2` podría leerla (riesgo del mismo usuario, B00). Su alcance: suplantar `localhost` mientras la CA esté instalada y el certificado vigente (14 días).
- Instalar la CA en `CurrentUser\Root` amplía la confianza del usuario; mitigado por `nameConstraints`, `pathlen:0`, 30 días y la clave destruida. No probado aquí: que SChannel/.NET en Windows aplique las restricciones de nombres igual que OpenSSL (se comprobará con las sondas negativas posteriores a la instalación).
- Borrado de claves sin garantía física en SSD.
- El certificado del servidor caduca el 2026-11-16: la prueba real debe hacerse antes.
- La validación dinámica del proxy (421, 404, TLS, HTTP plano, negativos de cliente) sigue pendiente.
- B00: copias antiguas de `.env`/`PRUEBA.rar` en OneDrive y demás puntos.

## 11. Estado

Certificados generados y verificados; **no instalados**; Caddy y Express **sin iniciar**; Atlas **no conectado**. Detenido tras las verificaciones.
