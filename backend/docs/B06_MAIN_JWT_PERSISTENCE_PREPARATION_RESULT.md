# B06 — JWT persistente y seguridad del backend `main` (preparado, NO aprovisionado)

Fecha: 2026-10-31. **Preparación terminada. No se conectó a MongoDB Atlas, no se ejecutó el bootstrap, no se activó `main`, no se generó ni instaló ninguna clave real, no se leyó ni modificó `backend/.env`, no se tocaron ACL, propietarios, SQLite reales, Godot, C2Runtime ni C.2/F.2.** Las colecciones históricas no se tocaron. **B00 sigue pendiente.**

Punto de partida (confirmado por el usuario): bootstrap real terminado (`postVerdict: ready`, 7 colecciones `main_v2_*`, 5 índices únicos, semilla `ingestion-v1`, 13 escrituras); Godot → Express local probado; Godot → Atlas NO activado; SCRAM negocia SHA-1 con `DEFAULT`.

## 1. Estado inicial del JWT (auditoría)

| Pregunta | Hallazgo |
|---|---|
| Firma | `RS256`, cabecera `{alg, typ:'at+jwt', kid}`; `jose` `SignJWT` en `modules/auth/jwt-service.js`. Vida fija de **900 s**. |
| Origen de la clave | Perfil `main`: archivo PKCS#8 RSA indicado por `MAIN_JWT_PRIVATE_KEY_FILE` + `MAIN_JWT_KEY_ID` (`config/env.js`), cargado por `loadMainSigningKey`. Ninguna clave en el código ni en el repositorio. |
| ¿Se genera clave al reiniciar? | **En `main`, no**: `runtime.js` no genera nada. Sí en `integration` (`createIntegrationJwtConfig`, efímera, `keyId integration-ephemeral`) y en las pruebas aisladas; es intencional y no cambió. |
| Validación | `jwtVerify` con `algorithms:['RS256']`, `issuer`, `audience`, `typ`, `clockTolerance:0`, claims obligatorios, `kid` exacto, solo cabecera `alg/typ/kid`, `nbf==iat`, `exp-iat==900`, `ver==2`, `cv`, `installationId`, `localPlayerId`, `bindingGeneration`, `authzVersion`. Emisor `urn:two-sides:main`, audiencia `two-sides-main-api`; los otros dos reinos (integración, aislado) tienen emisor y audiencia propios. |
| Sesiones / revocación | El JWT solo es válido si existe la sesión (`jti` = `sessionId`) y la cuenta está activa con el mismo `credentialVersion`, rol y binding; revocar sesión o cuenta (colecciones `main_v2_identitySessions`, `main_v2_revocations`) invalida el token antes de `exp`. |
| Renovación desde Godot | **Sin intervención del jugador**: `SyncSessionManager` hace un re-login transparente ante 401 con la credencial técnica guardada en DPAPI (`SyncOutboxDispatcher`: "one re-login on 401; the operations keep their leases"). Un cambio de clave solo provoca un re-login, no pierde datos. |
| Sistema histórico `users` | No se usa ni se reemplaza; la identidad técnica v2 sigue independiente. |

Lagunas encontradas en el cargador previo (corregidas): excepciones crudas de `fs`/`crypto` (con ruta) salían de `loadMainSigningKey`; aceptaba cualquier PEM que `createPublicKey` entendiera; no limitaba el tamaño de módulo máximo; no exigía permisos privados en POSIX; no había herramienta para aprovisionar la clave.

## 2. Cambios realizados

| Archivo | Cambio |
|---|---|
| `src/main/signing-key.js` (nuevo) | Política de ubicación y cargador endurecido. Una sola clase de error: `MainError('main_signing_key_rejected')` (sin ruta, sin mensaje de crypto/fs). Exige **un único bloque PKCS#8 sin cifrar**, RSA de **2048–8192** bits, archivo regular de 1–32 KiB, sin enlaces (archivo ni carpetas padre), ruta absoluta **fuera** del proyecto, de OneDrive y de `.env`, `keyId` `[A-Za-z0-9_-]{1,64}`; en POSIX rechaza permisos de grupo/otros. Expone `inspectMainSigningKey` (huella pública SHA-256 y tamaño) y `assertSigningKeyPath`. Nunca genera, escribe ni usa clave por defecto ni `process.env`. |
| `src/main/runtime.js` | Importa y reexporta `loadMainSigningKey`; la etapa de clave devuelve siempre `main_signing_key_rejected` y ocurre **antes** de leer la contraseña o conectar. |
| `scripts/main-signing-key.js` (nuevo, no ejecutado) | `create <ruta> <keyId>`: genera RSA 3072 y la escribe con `open('wx', 0o600)` (**no sobrescribe jamás**); `check <ruta> <keyId>`: carga como el backend y muestra solo `keyId`, bits y huella pública. Rechaza rutas del repositorio/OneDrive/`.env`; no usa red; no imprime la clave privada. |
| `tests/sync/main-jwt-persistence.test.js` (nuevo) | JP01–JP07 (ver §5). |

`src/config/jwt.js`, `config/env.js`, `jwt-service.js`, `run-main-backend.ps1`, los perfiles `integration`/`offline-test` y `.env` **no se modificaron**.

## 3. Seguridad de la conexión principal (revisión, sin cambios de destino)

| Control | Estado |
|---|---|
| TLS MongoDB | Estricto y fijado (`tls:true`, sin `tlsAllowInvalid*`); pruebas MP02/MR por doble. |
| Autenticación | `DEFAULT`, `authSource=admin`, usuario `twosides_backend`; negocia SCRAM-SHA-1 (único motivo documentado en B05.5 Etapa 11). Riesgo residual: mecanismo más débil mientras el usuario no tenga SHA-256. |
| Separación `main` / `integration` | Hosts, base, usuario, prefijo `main_v2_` / `integration_v2_`, reino JWT y claves distintos; el perfil `main` rechaza configuración de integración (MP01, JP07). Un token de un reino nunca verifica en otro, ni con la misma clave. |
| HTTP local | Solo `127.0.0.1`, sin cabeceras de proxy de confianza (MR06). **No hay HTTPS**: Godot exige HTTPS (`two_sides/sync/main_api_url`, ausente) → hace falta un terminador TLS/proxy antes de activar la sincronización. |
| Secretos y tokens | Contraseña solo por stdin enmarcada; clave solo por ruta externa; tokens en DPAPI en el cliente; errores con códigos fijos. JP05 comprueba que fallos no revelan contenido ni nombre del archivo. |
| Validación de configuración | `readMainEnvironment`, `validateJwtConfig`, `startMainBackend` fallan cerrados (JP04). |
| Credenciales versionadas | JP06 busca bloques de clave privada bajo `backend/` (excepto `.env`, que **no se abre**) y no encuentra ninguno. |

## 4. B00 — procedimiento específico (B00 NO se declara resuelto)

**Riesgo (según B00.1–B00.4):** la copia del proyecto en OneDrive conserva ACE explícitas `Modify` heredadas para SID no resueltos. Un proceso con esos tokens (o con el mismo usuario) podría **sustituir código** que luego se ejecutaría con la contraseña de Atlas o con acceso a la clave, o **leer** archivos de credenciales ubicados en el árbol (p. ej. `backend/.env`, sincronizado además a la nube). Cambiar ruta o clave no cierra esto: reduce la superficie.

Mitigación ya aplicada por diseño: la clave JWT y la contraseña **no** viven en el árbol (el cargador lo impone), y la contraseña de Atlas se rotó.

Procedimiento propuesto (operador; **nada de esto se ejecutó**):
1. **Contención de secretos.** Rotar de nuevo cualquier credencial que haya estado en `backend/.env`; moverla fuera de OneDrive o eliminarla de ese archivo (sin abrirlo en canales compartidos). La contraseña solo se introduce con los lanzadores de entrada oculta.
2. **Carpeta de la clave fuera del árbol y de OneDrive**, p. ej. `C:\ProgramData\TwoSidesMain\keys` o `%LOCALAPPDATA%\TwoSidesMain\keys`, con herencia desactivada y solo la cuenta de servicio y `SYSTEM`:
   `icacls "<carpeta>" /inheritance:r /grant:r "<cuenta>:(OI)(CI)F" "SYSTEM:(OI)(CI)F"`
3. **Código fuera de alcance de los SID B00**: ejecutar el backend desde una copia/paquete de solo lectura firmado fuera de OneDrive (ver B00.3, opción de bundle), o corregir la ACL del árbol bajo autorización específica (B00.3). Sin esto la sustitución de código sigue siendo posible.
4. **Verificación sin revelar secretos** (solo lectura): `icacls "<carpeta>"` y `icacls "<archivo>"` deben listar únicamente la cuenta de servicio y `SYSTEM` (sin `Everyone`, `Users`, `Authenticated Users` ni SID desconocidos); `node scripts\main-signing-key.js check "<archivo>" <keyId>` debe devolver `valid` y una huella; `git ls-files` no debe incluir `.env` ni `*.pem`; `Get-Item` del archivo sin atributo `ReparsePoint`. Para el árbol del proyecto, repetir la comprobación de B00.2 (92 rutas nominales) y exigir que desaparezcan los SID no resueltos.
5. **Criterio de cierre:** B00 se declara resuelto solo cuando los puntos 1–4 estén verificados por escrito. Hasta entonces: **pendiente**.

## 5. Pruebas (offline, dobles, sin Atlas ni red)

| # | Cubre |
|---|---|
| JP01 | Clave creada con la herramienta en carpeta temporal; **la misma clave verifica tokens anteriores tras reiniciar**; segunda creación sobre el mismo archivo falla y deja los bytes intactos; la salida no contiene material privado |
| JP02 | **Otra clave** o **otro `kid`** no verifican tokens anteriores; huellas distintas |
| JP03 | Token a 899 s válido, **expirado** (900 s) y aún-no-válido rechazados; **manipulados** (payload/cabecera/firma/sin firma/`alg:none`/muy largo) rechazados; re-firmados con clave ajena, `exp` alargado, `ver:1`, emisor o audiencia de integración, `typ` distinto: rechazados |
| JP04 | Sin clave válida (ausente, `keyId` inválido, proveedor que falla, vacío, objeto sin claves, config de integración) **`main` no arranca**: no se pide la contraseña ni se conecta; errores sin textos internos; variables de entorno incompletas rechazadas |
| JP05 | PEM público, PKCS#1, cifrado, EC, RSA 1024, dos bloques, basura final, texto, vacío, tamaño excesivo, enlace, directorio; rutas del proyecto, `backend`, `.env`, OneDrive, relativa, vacía, con comillas; en ningún caso aparece contenido ni nombre en el error |
| JP06 | Fuente: sin generación, `process.env`, escritura ni red en el cargador; la herramienta usa `'wx', 0o600`; sin claves privadas en `backend/`; la herramienta rechaza rutas del repositorio, `keyId` inválido, archivo ausente y acciones desconocidas |
| JP07 | Reinos separados (misma clave, otro reino → 401); `integration` y `offline-test` siguen sin necesitar archivo de clave |

Resultado: **7/7**; regresión completa `run-backend-regression.js`: **690 + 9 aprobadas, 15 + 1 omitidas, 0 fallos** (antes 683 + 9). Son resultados de dobles; no describen a Atlas.

## 6. Riesgos pendientes

- **B00** abierto (§4): sin cerrarlo, un atacante con los SID afectados puede alterar el código que carga la clave.
- La **ACL de la carpeta de la clave** no puede comprobarse desde Node en Windows; depende del paso 2–4 del operador.
- **Rotación de clave**: cambiar clave o `kid` invalida todos los tokens vigentes (≤ 15 min); Godot reautentica solo. No hay soporte de varias claves activas (JWKS) ni plan de rotación automática.
- Una copia de seguridad de la clave debe guardarse aparte y protegida; si se pierde basta con generar una nueva (los jugadores se reautentican), no hay datos cifrados con ella.
- SCRAM-SHA-1; `readWrite` más amplio que el trabajo; sin HTTPS; sin cuotas por jugador adicionales; telemetría `Died`/`RequestRestart` sin cablear.

## 7. Procedimiento seguro para aprovisionar una clave real (NO ejecutado)

1. Crear la carpeta protegida fuera del proyecto y de OneDrive y fijar su ACL (§4.2). Elegir un `keyId` estable, p. ej. `main-2026-11`.
2. `node scripts\main-signing-key.js create "<carpeta>\main-jwt.pem" main-2026-11` → muestra `created`, bits y huella pública; no muestra la clave.
3. Restringir la ACL del archivo y verificarla con `icacls` (§4.4); anotar la huella en un lugar aparte (es pública).
4. `node scripts\main-signing-key.js check "<carpeta>\main-jwt.pem" main-2026-11` debe dar `valid` con la misma huella.
5. Copia de seguridad cifrada fuera de OneDrive.
6. En el arranque futuro de `main`: `.\scripts\run-main-backend.ps1 -EnableMain -SigningKeyFile "<carpeta>\main-jwt.pem" -KeyId main-2026-11` (pide la contraseña oculta; solo cuando se autorice activar `main`).

Un archivo existente nunca se sobrescribe: para rotar, crear otro archivo con otro `keyId` y cambiar el lanzador.

## 8. Requisitos antes de habilitar `main`

1. B00 verificado por escrito (§4) o riesgo aceptado por escrito.
2. Clave aprovisionada y verificada (§7).
3. Terminación HTTPS (proxy local o servicio) y `two_sides/sync/main_api_url` configurada en Godot.
4. Decisión sobre SCRAM-SHA-256 para `twosides_backend` y, a futuro, rol más estrecho que `readWrite`.
5. Cuotas/retención por jugador revisadas (límite de 1000 operaciones por propietario).
6. Inspección de solo lectura reciente con veredicto `ready` (sin repetir el bootstrap).
7. Autorización explícita para la primera ejecución real y prueba de humo con datos sintéticos.

## 9. Próximo paso recomendado

Resolver B00 (§4: contención de secretos y ejecución desde ubicación no escribible por los SID afectados) y, solo entonces, aprovisionar la clave (§7). Después, preparar la capa HTTPS local y una primera ejecución controlada de `main` con una cuenta sintética.
