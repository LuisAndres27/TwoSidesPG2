# B12 — Almacenamiento seguro de secretos de `main` (PREPARADO, NO creado)

Fecha: 2026-10-31. **No se creó la carpeta real de secretos, no se generó ni movió ningún secreto, no se abrió ni modificó `backend/.env`, no se conectó Atlas, no se ejecutó bootstrap, no se activó `main`, no se tocaron SQLite, Godot, C2Runtime, C.2/F.2, ACL existentes ni el esquema.** Verificado: `%LOCALAPPDATA%\TwoSidesMainSecrets` no existe. **B00 sigue pendiente.**

Revisados: B06 (JWT), B07/B08/B09/B10/B11 (permisos). Estado de partida: B11 retiró los dos SID ajenos; sigue abierto el riesgo del mismo usuario, `.env`, código sin versionar y la clave.

## 1. Qué usa Express `main` (auditoría)

| Dato | Fuente real | ¿Secreto? | ¿Disco? |
|---|---|---|---|
| Perfil / habilitación | `TWOSIDES_PROFILE=main`, `MAIN_ENABLE=true` (las pone el lanzador `run-main-backend.ps1`) | No | No |
| Puerto | `PORT` (1–65535, por defecto 3000); solo `127.0.0.1` | No | No |
| Clave JWT | `MAIN_JWT_PRIVATE_KEY_FILE` (ruta) + `MAIN_JWT_KEY_ID` | **La clave: sí** | Archivo PKCS#8 externo |
| **Contraseña de `twosides_backend`** | **Prompt oculto** del lanzador → trama por stdin al proceso hijo (entorno depurado) | **Sí** | **No se guarda en ningún sitio** |
| URI/destino de Atlas | Fijo en `src/main/policy.js` (host, base, usuario, `DEFAULT`, TLS); sin variable | No | No |

Hallazgos: **ningún código lee `backend/.env`** (no hay `dotenv`, `loadEnvFile` ni `--env-file`; `readMainEnvironment` rechaza explícitamente `MONGODB_URI`, contraseña y URI). Por tanto `.env` no es una dependencia de `main`, `integration` ni `offline-test`; es un residuo histórico. `backend/Respaldo_ENV/` existe y está **vacía** (solo nombres consultados), pero **no estaba ignorada por Git**: ahora lo está.

## 2. Ruta recomendada

```
%LOCALAPPDATA%\TwoSidesMainSecrets\            (= C:\Users\luis2\AppData\Local\TwoSidesMainSecrets)
  keys\main-jwt.pem        única clave secreta (PKCS#8 RSA, creada por main-signing-key.js)
  main-config.json         opcional, NO secreto (keyId, puerto); hoy se pasan como parámetros
```
Por qué: perfil local del usuario, **no sincronizado por OneDrive**, no itinerante, fuera del repositorio; ya hereda solo `luis2`, `SYSTEM` y `Administradores`; la política del cargador lo admite sin cambios (SS01/SS02). La contraseña de Atlas **no se almacena**: se escribe en el prompt oculto en cada arranque (una opción futura es un archivo cifrado con DPAPI del usuario, no implementada).

`src/main/secrets-layout.js` fija esta disposición (lógica pura de rutas, sin E/S): solo acepta `<unidad>:\Users\<usuario>\AppData\Local` y comprueba la política del cargador.

## 3. Diseño de permisos NTFS

| Elemento | Dueño | Herencia | Reglas explícitas |
|---|---|---|---|
| `TwoSidesMainSecrets` | `luis2` | **Deshabilitada** (DACL protegido, sin copiar reglas heredadas) | `luis2`, `SYSTEM`, `BUILTIN\Administradores`: `FullControl`, `(OI)(CI)` |
| `keys\`, `main-jwt.pem` | `luis2` | Heredan de la carpeta | Solo esas tres identidades; **sin** `Users`, `Authenticated Users`, `Everyone`, SID desconocidos ni DENY |

Reglas que el comprobador exige: DACL protegido en la carpeta; propietario `luis2` o Administradores; **sin DENY**; solo esas tres identidades, cada una con control total; reglas con herencia a hijos; sin enlaces simbólicos; clave ≤ 32 KiB.

## 4. Procedimiento de creación (NO ejecutado — requiere autorización)

PowerShell 5.1 de `luis2`, sesión no elevada. La carpeta nace con el DACL protegido (sin ventana de herencia):
```powershell
$dir = Join-Path $env:LOCALAPPDATA 'TwoSidesMainSecrets'
if (Test-Path -LiteralPath $dir) { throw 'Ya existe: detenerse y revisar' }
$me  = [Security.Principal.WindowsIdentity]::GetCurrent().User
$sys = New-Object Security.Principal.SecurityIdentifier 'S-1-5-18'
$adm = New-Object Security.Principal.SecurityIdentifier 'S-1-5-32-544'
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetOwner($me); $acl.SetAccessRuleProtection($true, $false)
foreach ($s in $me, $sys, $adm) { $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($s, 'FullControl', 'ContainerInherit, ObjectInherit', 'None', 'Allow'))) }
(New-Object IO.DirectoryInfo $dir).Create($acl)               # 🔴 crea carpeta con ACL protegida
(New-Object IO.DirectoryInfo $dir).CreateSubdirectory('keys') | Out-Null
```
Verificación (solo lectura, ya existe y probado): `.\scripts\check-main-secrets-acl.ps1` → `verdict: conforming`, exit 0.

## 5. Comprobación de ACL sin mostrar contenido

`scripts/check-main-secrets-acl.ps1` (+ `main-secrets-acl-lib.ps1`): lee descriptores de seguridad y **solo nombres y tamaños**; nunca abre un archivo, no cambia ACL ni propietarios, no crea ni borra. Salida JSON con códigos fijos (`inheritance_enabled`, `unexpected_identity`, `missing_identity`, `not_full_control`, `deny_rule_present`, `unexpected_owner`, `link`, `key_file_too_large`…). Exit 0 conforme, 1 incumple, 2 ausente. Ejecutado contra la ruta real: **ausente (exit 2)**, tal como se espera hoy. Rechaza rutas dentro del proyecto u OneDrive.

## 6. Cargador JWT: sin cambios

`loadMainSigningKey`/`assertSigningKeyPath` no se modificaron; SS02 prueba que carga una clave real de prueba almacenada bajo `…\TwoSidesMainSecrets\keys\main-jwt.pem` (temporal) y mantiene todos los requisitos (PKCS#8, ≥2048 bits, sin enlaces, fuera de proyecto/OneDrive/`.env`, errores sin detalle).

## 7. Retirar credenciales de `backend/.env` sin afectar otros perfiles

Hecho comprobado: ningún perfil lo lee (SS06), así que **retirarlo no cambia ningún comportamiento**. Procedimiento (manual; no abrir el archivo en canales compartidos; requiere autorización para los cambios):
1. **Rotar primero** las credenciales que contenga (Atlas) — es lo que realmente invalida cualquier copia en OneDrive/versiones anteriores.
2. El propietario revisa en privado qué variables contiene (solo nombres). Si alguna no secreta aún se necesita, pasa a `main-config.json` o a parámetros del lanzador.
3. Sustituir por un `.env.example` con marcadores (el `.gitignore` ya admite `!.env.example`), o eliminar el archivo.
4. Vaciar `Respaldo_ENV\` (hoy vacía) y revisar la papelera y el historial de versiones de OneDrive (retiene versiones anteriores; la rotación cubre ese hueco).
5. Probar: regresión completa y los lanzadores `integration`/`offline-test` (no dependen de `.env`, SS07).

## 8. Rotación de la contraseña de `twosides_backend` (sin generar ni revelar contraseñas)

1. En Atlas → Database Access → usuario `twosides_backend` → *Edit Password*, con el **autogenerador** de Atlas; se copia al portapapeles y no se pega en archivos, chat ni informes.
2. Guardar la contraseña en un gestor de contraseñas personal (opcional); nunca en el repositorio, OneDrive o `.env`.
3. Verificar con la herramienta de solo lectura existente (`run-main-inspection.ps1` con autorización) que autentica (SCRAM-SHA-1 vía `DEFAULT`) y devuelve `ready`.
4. La contraseña vieja deja de valer de inmediato: cualquier copia antigua queda inerte. Si se activa SCRAM-SHA-256 para el usuario, se vuelve a la comprobación (B05.5 Etapa 11).
5. Regla: la contraseña solo se introduce en los prompts ocultos de los lanzadores.

## 9. Arranque futuro de `main` desde ubicaciones protegidas (sin cambiar el lanzador)

```powershell
cd <backend>
.\scripts\run-main-backend.ps1 -EnableMain `
   -SigningKeyFile "$env:LOCALAPPDATA\TwoSidesMainSecrets\keys\main-jwt.pem" -KeyId main-2026-11 -Port 3000
# → pide la contraseña con entrada oculta; el hijo recibe un entorno vacío más las variables fijas
```
Orden interno: leer entorno → clave (falla cerrada antes de la contraseña) → contraseña por stdin → conexión (TLS estricto, `DEFAULT`) → verificación del esquema `ready` → escucha en `127.0.0.1`. Mejora futura (no hecha): que el lanzador lea `main-config.json` y la ruta por defecto.

## 10. Recuperación si falla el arranque por falta de configuración

`server.js` ahora imprime un código fijo (nunca rutas, URI ni mensajes del driver): `Unable to start two-sides-backend: invalid configuration [main_xxx]` (cambio mínimo; el mensaje de los perfiles no `main` es idéntico, 39/39 legacy).

| Código | Causa probable | Acción |
|---|---|---|
| `main_not_enabled` | Faltan `TWOSIDES_PROFILE=main`/`MAIN_ENABLE=true` | Usar el lanzador con `-EnableMain` |
| `main_signing_key_required` | Falta `MAIN_JWT_PRIVATE_KEY_FILE` o `MAIN_JWT_KEY_ID` válido | Pasar `-SigningKeyFile` y `-KeyId` |
| `main_signing_key_rejected` | Archivo ausente, ruta no permitida, formato/tamaño inválido, enlace | `node scripts\main-signing-key.js check "<ruta>" <keyId>`; revisar con `check-main-secrets-acl.ps1`; si la clave se perdió, crear otra con otro `keyId` (los jugadores se reautentican solos) |
| `main_credential_channel_required` | Arranque sin canal stdin | Usar el lanzador (no `npm start`) |
| `main_connection_*`, `main_schema_*`, `main_permissions_unverified` | Contraseña errónea/rotada, red, esquema o permisos | Inspección de solo lectura con autorización; no repetir bootstrap sin plan |
| `main_start_failed` / `main_close_failed` | Fallo interno al abrir/cerrar | Reiniciar; revisar la regresión local |

Nada se repara automáticamente: ante un fallo se detiene sin escribir en Atlas.

## 11. Pruebas (offline; sin red, Atlas, carpeta real ni secretos)

SS01 (disposición y rutas rechazadas) · SS02 (carga real con el cargador sin cambios) · SS03 (política de ACL: 9 casos en memoria — conforme, herencia activa, `Users`, `Everyone`, falta `SYSTEM`/usuario, Administradores de solo lectura, DENY, propietario ajeno) · SS04 (comprobador: ausente → 2; carpeta sin proteger → 1 sin imprimir ni modificar contenido) · SS05 (el comprobador no lee, no cambia ACL, no crea/borra) · SS06 (nadie lee `.env`; `main` sin variables de contraseña/URI; `Respaldo_ENV/`, `*.pem`, `*.key` ignorados; códigos `main_*` fijos) · SS07 (`integration` y `offline-test` independientes).

Resultado: **7/7**; regresión completa **697 + 9 aprobadas, 15 + 1 omitidas, 0 fallos**; legacy **39/39**.

## 12. Cambios en archivos del proyecto

Nuevos: `src/main/secrets-layout.js`, `scripts/check-main-secrets-acl.ps1`, `scripts/main-secrets-acl-lib.ps1`, `tests/sync/main-secrets-storage.test.js`. Modificados (mínimos): `src/server.js` (imprime código `main_*` fijo), `backend/.gitignore` (añade `Respaldo_ENV/`, `*.pem`, `*.key`).

## 13. Riesgos pendientes

- **B00 abierto**: mismo usuario puede leer/escribir carpeta y código; `.env` sin rotar/retirar; `backend/` sin versionar; ejecución sin paquete de solo lectura.
- La ACL protegida defiende de otras cuentas, no de procesos de `luis2`.
- La contraseña se teclea en cada arranque (seguro, pero poco cómodo); DPAPI es una mejora futura.
- Pérdida de la clave JWT = reautenticación general (sin datos perdidos); sin copia de seguridad cifrada definida.
- SCRAM-SHA-1; sin HTTPS para Godot; cuotas por jugador y eventos `Died`/`RequestRestart` pendientes.
- `.gitignore` y las pruebas no impiden que alguien copie secretos manualmente al árbol.

## 14. Pasos que requieren autorización posterior

| Paso | Autorización |
|---|---|
| Crear `TwoSidesMainSecrets` con ACL protegida (§4) | **Sí** |
| Generar la clave real (`main-signing-key.js create`) | **Sí** |
| Rotar la contraseña en Atlas (§8) y retirar/rotar `.env` (§7) | **Sí** (acciones del propietario) |
| Eliminar o reemplazar `backend/.env`, vaciar `Respaldo_ENV` | **Sí** |
| Primer arranque real de `main` / conexión a Atlas | **Sí** |
| Comprobar ACL (`check-main-secrets-acl.ps1`), pruebas offline | No (solo lectura) |

Detenido antes de crear carpetas protegidas o aprovisionar secretos reales.
