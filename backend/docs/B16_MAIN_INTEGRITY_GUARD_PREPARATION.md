# B16 — Guardia de integridad previa al arranque de `main` y plan de rotación (PREPARADO, NO usado en real)

Fecha: 2026-11-01. **No se abrió `backend/.env`; no se rotó ninguna contraseña; no se movió ni borró nada sensible; no se generó ninguna clave; no se modificó ninguna ACL; no se conectó Atlas; no se activó `main`; no se ejecutó Godot, SQLite real, C.2/F.2 ni C2Runtime. Git: 0 archivos en el índice, 0 commits nuevos (12 antes y ahora), sin `push`, sin borrar repositorios ni referencias, sin `--mirror`.** Tampoco se creó la carpeta `TwoSidesMainIntegrity` ni ningún manifiesto real. **B00 sigue abierto.**

## 1. Cambios realizados

| Archivo | Cambio |
|---|---|
| `scripts/run-main-backend.ps1` (modificado) | Nuevos parámetros opcionales `-IntegrityManifest`, `-ExpectedTreeDigest`, `-ExpectedKeyFingerprint`, `-ExpectedKeyId` (por defecto `main-2026-11`). Con `-IntegrityManifest` ejecuta la guardia **antes de `Read-Host` (contraseña), antes de crear el proceso hijo y antes de cualquier conexión**. Sin él, el lanzador funciona como antes y avisa con una advertencia. El ancla del transporte de contraseña (`$bstr=[IntPtr]::Zero`) y su prueba MC02 no cambian |
| `scripts/main-preflight.js` (nuevo) | Proceso Node sin red, sin `process.env`, sin escritura; imprime solo nombres de comprobación y códigos fijos |
| `scripts/backend-integrity.js` (modificado) | `verify` exige además que el `treeDigest` del manifiesto coincida con el que producen sus propias entradas (`digestOfFiles`) y acepta un **ancla** externa (`anchor_mismatch`) |
| `tests/sync/main-integrity-guard.test.js` (nuevo) | PG01–PG08 |

Código de producción de `main` (`src/`) **sin cambios**.

## 2. Qué comprueba la guardia, y en qué orden

Todas son de solo lectura; cualquier fallo → `Integrity guard failed: <motivo fijo>` y salida con código 1, sin pedir la contraseña.

**En el lanzador (PowerShell):**
1. Se exigen **los tres datos** juntos: manifiesto, `-ExpectedTreeDigest` (64 hex en minúsculas) y `-ExpectedKeyFingerprint` (64 hex). Si falta alguno, se rechaza (un manifiesto sin ancla no es prueba).
2. **Procedencia por ubicación fija:** la clave debe estar exactamente en `%LOCALAPPDATA%\TwoSidesMainSecrets\keys\main-jwt.pem` y el manifiesto exactamente en `%LOCALAPPDATA%\TwoSidesMainIntegrity\backend-integrity-manifest.json`. Una ruta arbitraria se rechaza.
3. `-KeyId` debe ser idéntico al identificador fijado (`main-2026-11`).
4. **ACL** de `TwoSidesMainSecrets`, `keys`, `main-jwt.pem`, `TwoSidesMainIntegrity` y el manifiesto con la política ya probada (`Get-SecretsAclFailures`): DACL protegido en carpetas, solo `luis2`/`SYSTEM`/`Administradores` con control total, sin DENY, propietario esperado, sin enlaces.

**En `main-preflight.js` (Node):**
5. Identificador de clave válido e igual al fijado.
6. La clave se carga con el **mismo cargador que `main`** (PKCS#8 RSA, ≥ 3072 bits aquí) y su **huella pública es igual** a la anotada.
7. El manifiesto es coherente y su `treeDigest` **es igual al ancla** anotada fuera del árbol.
8. El código actual (`src/`, `scripts/`, `package*.json`, `vitest.config.js`, `node_modules/`) es **idéntico** al manifiesto (sin añadidos, bajas, modificaciones ni enlaces).

Salida de fallo: solo `reason` (`key_fingerprint_mismatch`, `integrity_anchor_mismatch`, `integrity_tree_differs` + recuentos, …); nunca rutas, contenido, huellas de archivos ni texto del sistema.

## 3. Procedimiento de uso (NO ejecutado; requiere autorización para los pasos 1–3)

1. Crear `%LOCALAPPDATA%\TwoSidesMainIntegrity` con DACL protegido (misma receta de B13, `Directory.CreateDirectory(ruta, DirectorySecurity)` con `luis2`/`SYSTEM`/`Administradores`).
2. `node scripts\backend-integrity.js manifest "%LOCALAPPDATA%\TwoSidesMainIntegrity\backend-integrity-manifest.json"` → imprime `treeDigest`.
3. **Anotar fuera del equipo** (papel, gestor de contraseñas, mensaje a sí mismo en otro dispositivo): el `treeDigest` y la huella de la clave `811cd75bcf98dcb88c766f369431e3886f75188ad3fec59d8bbbbe0eab9d8aec`. No guardarlos en el árbol del proyecto ni en OneDrive.
4. Comprobar antes de arrancar (solo lectura): `.\scripts\check-main-secrets-acl.ps1` → `conforming`.
5. Arranque (cuando se autorice activar `main`):
```powershell
.\scripts\run-main-backend.ps1 -EnableMain `
  -SigningKeyFile "$env:LOCALAPPDATA\TwoSidesMainSecrets\keys\main-jwt.pem" -KeyId main-2026-11 `
  -IntegrityManifest "$env:LOCALAPPDATA\TwoSidesMainIntegrity\backend-integrity-manifest.json" `
  -ExpectedTreeDigest <digest anotado> -ExpectedKeyFingerprint 811cd75bcf98dcb88c766f369431e3886f75188ad3fec59d8bbbbe0eab9d8aec
```
6. Tras cada cambio legítimo del código: regenerar el manifiesto a una **ruta nueva**/retirar el anterior con autorización (el comando nunca sobrescribe) y anotar el nuevo digest.

## 4. Pruebas (offline; sin red, sin contraseñas, sin `.env`)

| # | Cubre |
|---|---|
| PG01 | Manifiesto válido + ancla + id + huella: las cinco comprobaciones pasan |
| PG02 | **Código alterado** (modificado, añadido en `node_modules`, eliminado): rechazo con recuentos |
| PG03 | **Manifiesto alterado**: entradas editadas → inválido; manifiesto reescrito de forma coherente con el código alterado → `anchor_mismatch` (el ancla externo lo delata); manifiesto de otro árbol; anclas ausentes/mal formadas/en mayúsculas; manifiesto ilegible; manifiesto dentro del proyecto |
| PG04 | **Clave incorrecta**: otra clave, otro id, id inválido, RSA 2048, PEM basura, ausente, dentro del proyecto; ningún resultado contiene el centinela, `BEGIN`, rutas ni nombres de archivo |
| PG05 | Línea de comandos: éxito con el árbol real + manifiesto y clave temporales; códigos de fallo con exit 1; sin secretos; entorno vacío |
| PG06 | Orden en el lanzador: guardia **antes** de `Read-Host` y de `Process::Start` del hijo; parámetros y rutas fijas; sin Mongo/URI/git/red/lectura de `.env`; guardia sin red, entorno ni escrituras |
| PG07 | **ACL incorrecta / rutas incorrectas (lanzador real, 6 casos):** sin anclas, digest inválido, clave fuera de la ubicación protegida, manifiesto fuera de la ubicación, id distinto del fijado, carpeta de integridad ausente: todos terminan con exit 1, **sin aparecer el texto de la contraseña** ni material de clave |
| PG08 | Sin `-EnableMain` sigue rechazando; el lanzador conserva el ancla del transporte |

**Fallo de arranque sin conexión externa:** PG07 ejecuta el lanzador real; la guardia termina antes del prompt y del hijo. PG05/PG06 verifican que `main-preflight.js` no importa red, Mongo, `child_process` ni `process.env`.

Resultados: **8/8** nuevas; regresión completa **712 + 9 aprobadas, 15 + 1 omitidas, 0 fallos**; legacy **39/39**; `scan-secrets.js` sobre el repositorio: **clean**.

## 5. Limitaciones reales del control de integridad

1. **Un manifiesto guardado junto al código modificable no protege frente a un proceso malicioso que corra como `luis2`.** Ese proceso puede cambiar el código, regenerar el manifiesto (la herramienta solo evita *sobrescribir*, no que se cree uno nuevo en otra ruta) y reescribir el lanzador. El control solo detecta cambios que no vengan acompañados de una manipulación coherente de todo lo demás.
2. **Lo que le da valor es el ancla externa** (el digest anotado fuera del equipo y tecleado/pasado por el operador). Si el ancla vive en un archivo del mismo equipo que el atacante puede escribir, el control queda anulado.
3. **La guardia vive dentro del lanzador**, que está en `scripts/` y por tanto dentro del código que se hashea; un lanzador manipulado simplemente no la ejecuta. La mitigación es ejecutar un lanzador copiado a un lugar de solo lectura o comparar a mano el digest de `scripts/run-main-backend.ps1` antes de lanzar.
4. **Ventana TOCTOU:** la comprobación y el arranque son procesos distintos; un cambio entre ambos no se detecta. No hay verificación continua mientras `main` corre.
5. **No cubre:** el binario de Node ni DLL del sistema, variables de entorno heredadas (el lanzador las limpia), memoria del proceso en ejecución, ni el contenido de la clave más allá de la huella pública.
6. **La clave:** la huella pública detecta una clave distinta, pero quien lea `main-jwt.pem` (cualquier proceso de `luis2`) puede forjar tokens con sesión viva. La ACL no lo impide para el mismo usuario.
7. Se acepta la ubicación fija como indicio de procedencia; no es una firma criptográfica. Una firma real requeriría una clave fuera del alcance del atacante (otra cuenta o dispositivo).
8. **Conclusión:** la guardia reduce errores y manipulaciones torpes o parciales (dependencia cambiada, archivo editado, clave equivocada, permisos rotos) y evita teclear la contraseña en un entorno no esperado. **No sustituye** una cuenta de ejecución distinta ni el paquete de solo lectura (B15 §9).

## 6. Riesgos de Git (revisados; no se ejecutó nada)

- Estado: `backend/` sin versionar; 0 en el índice; commits 12 (sin cambios).
- **No** `git add`/`commit` hasta autorización; **no** `git push`; **no** `git push --mirror` ni `--all`/`--tags` indiscriminados (las referencias locales `refs/agents/*` y `refs/codex/*` contienen código del backend y se publicarían). El remoto es un repositorio ajeno.
- No borrar `.git`, ramas ni esas referencias (podrían ser puntos de control útiles); si se quisiera limpiar, evaluarlo aparte.
- Antes de cualquier commit: `node scripts\scan-secrets.js` (hoy limpio) y `git status`/`git diff --cached --stat`. `.gitignore` ya cubre `.env`, claves, SQLite, autorizaciones y manifiestos (SC03).

## 7. Plan de rotación de `twosides_backend` (sin ejecutar)

Antes: confirmar con el propietario que no hay un `main` en ejecución (no lo hay) y que la inspección de solo lectura actual da `ready`.
1. **Generar** en Atlas (*Database Access* → `twosides_backend` → *Edit Password* → *Autogenerate Secure Password*) una contraseña con dígitos y símbolos. Copiar al portapapeles **sin mostrarla en pantalla compartida**; guardar en un gestor de contraseñas. *Update User*.
2. Borrar el portapapeles inmediatamente (copiar un texto neutro). La contraseña antigua queda invalidada al instante, junto con cualquier copia en `.env`/OneDrive.
3. **Verificar sin mostrarla ni registrarla:** `run-main-inspection.ps1` (autorización de un solo uso, ≤ 60 min, usuario `twosides_backend`): pide la contraseña con `Read-Host -AsSecureString` (no se ve, no queda en el historial de PSReadLine, no va en argumentos ni entorno; llega por stdin al hijo). Salida esperada: autenticación correcta, `ready`, `writes: 0`. La salida solo muestra códigos fijos, nunca la contraseña, el URI ni el texto del driver.
4. **Qué evitar:** escribirla en la línea de comandos o en un script, `echo`/`Write-Host`, capturas de pantalla, transcripciones (`Start-Transcript`), pegarla en chat o informes, guardarla en `.env`.
5. **Errores:** `atlas_authentication_failed` → se tecleó mal; repetir con una autorización nueva. Si se pierde la contraseña → volver a *Edit Password* (no hay pérdida de datos).
6. **Después:** registrar solo la fecha de rotación; reevaluar SCRAM-SHA-256 para el usuario (Etapa 11) y un rol más estrecho que `readWrite`.
7. No afecta a `twosides_integration_test` ni a `integration`/`offline-test`.

## 8. Retirar `backend/.env` de OneDrive (después de invalidar sus credenciales)

Condición previa: paso 7.3 verificado (la contraseña antigua ya no sirve).
1. El propietario revisa en privado, en un editor local y sin copiar su contenido a ningún canal, si queda algo no secreto útil (se pasa a parámetros del lanzador).
2. `Remove-Item -LiteralPath '<ruta>\backend\.env'` (🔴 requiere autorización). OneDrive lo envía a su papelera.
3. En onedrive.com: *Papelera de reciclaje* → eliminar definitivamente; confirmar en el historial de versiones que no quedan copias. Con la contraseña rotada, cualquier versión antigua es inerte.
4. Dejar `backend\.env.example` solo con nombres (opcional); vaciar o quitar `backend\Respaldo_ENV\` (hoy vacía).
5. Verificar: `Test-Path backend\.env` falso, `git status --ignored` sin `.env`, `scan-secrets.js` limpio. Ninguna prueba ni lanzador depende de `.env` (SS06).

## 9. Acciones que requieren autorización posterior

| Acción | Notas |
|---|---|
| Crear `TwoSidesMainIntegrity` con ACL protegida y generar el manifiesto real | Escribe en `%LOCALAPPDATA%`; anotar el digest fuera del equipo |
| Rotar la contraseña en Atlas y verificar con la inspección | Acción del propietario en la consola de Atlas |
| Eliminar `backend/.env` y vaciar la papelera de OneDrive | Solo tras la rotación |
| `git add`/`commit` local del backend, hook `pre-commit` | Sin `push`/`--mirror` |
| Primer arranque real de `main` con la guardia | Conexión a Atlas |
| Cuenta de Windows dedicada o aceptación formal del riesgo del mismo usuario | Criterio de cierre de B00 |
| Eliminar `C:\Users\luis2\.git` (vacío) | Opcional |

## 10. Estado de B00

**Abierto.** Cumplido: SID ajenos retirados (B11), carpeta de secretos conforme (B13), clave generada y verificada (B14), herramientas de escaneo e integridad (B15) y guardia previa al arranque (esta etapa). Pendiente: rotación y verificación de la contraseña, retirada de `.env`, manifiesto real con ancla externa, línea base en Git (decisión del propietario) y la mitigación o aceptación formal del riesgo del mismo usuario (cuenta dedicada, paquete de solo lectura o documento firmado). `main` sigue sin activarse.

Detenido tras las pruebas offline.
