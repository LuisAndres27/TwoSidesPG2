# B17 — Línea base de integridad del backend (CREADA Y VERIFICADA)

Fecha: 2026-11-01. Se creó `%LOCALAPPDATA%\TwoSidesMainIntegrity` con DACL protegido y se generó, con el generador existente, el manifiesto SHA-256 del código actual del backend. **No se abrió `backend/.env`, no se leyó ninguna clave privada ni base SQLite, no se rotó ninguna contraseña, no se tocó la clave JWT, no se conectó Atlas, no se activó `main`, no se ejecutó Godot, C.2/F.2 ni C2Runtime, no se hicieron commits ni `push` (0 archivos en el índice, 12 commits antes y después) y no se cambió ninguna ACL existente.** **B00 sigue pendiente.**

## 1. Verificaciones previas (todas correctas)

| Verificación | Resultado |
|---|---|
| B15 y B16 revisados | Sí |
| Usuario | `LAPTOP-F337QTKK\luis2`, sesión no elevada |
| Ruta | `C:\Users\luis2\AppData\Local\TwoSidesMainIntegrity`: dentro de `%LOCALAPPDATA%`, fuera de OneDrive y del repositorio; 0 enlaces/redirecciones en la cadena de padres |
| Carpeta y manifiesto previos | No existían (de existir, la operación se detenía sin sobrescribir) |
| Escáner de secretos (`scan-secrets.js`) | `clean`, 0 hallazgos |
| Interfaz real de `backend-integrity.js` | `manifest <ruta-absoluta>` (creación exclusiva `'wx'`, nunca sobrescribe) y `verify <ruta-absoluta>`; ámbito fijo: `src`, `scripts`, `node_modules`, `package.json`, `package-lock.json`, `vitest.config.js` |
| Lectura de `.env`, claves o SQLite | El ámbito no los incluye; 0 nombres `.env`/`.sqlite`/`.db`/`.pem`/`.key`/`.pfx`/`.p12` dentro de `src`, `scripts` y `node_modules` |

## 2. Carpeta creada y permisos

`C:\Users\luis2\AppData\Local\TwoSidesMainIntegrity`, creada con `Directory.CreateDirectory(ruta, DirectorySecurity)`: el descriptor protegido se aplicó en la creación, sin ventana de herencia.

SDDL (SID de máquina abreviado `<m>`): `O:<m>-1001 G:<m>-1001 D:P (A;OICI;FA;;;SY) (A;OICI;FA;;;BA) (A;OICI;FA;;;<m>-1001)`

| Elemento | Propietario | Herencia | Reglas |
|---|---|---|---|
| Carpeta | `luis2` | Deshabilitada (`D:P`) | `SYSTEM`, `Administradores` (SID conocidos), `luis2`: `FullControl` `(OI)(CI)`; sin DENY, sin otras identidades |
| `backend-integrity-manifest.json` | `luis2` | Hereda de la carpeta | Las mismas 3 reglas (`(F)`), sin DENY |

La política de ACL (`Get-SecretsAclFailures`, la misma que usa la guardia del lanzador) devuelve **0 fallos** para la carpeta y para el manifiesto.

## 3. Manifiesto

- Ruta: `%LOCALAPPDATA%\TwoSidesMainIntegrity\backend-integrity-manifest.json`, 537 776 bytes, creación exclusiva (un segundo `manifest` sobre la misma ruta fue **rechazado**, `file_exists_or_unwritable`, y el hash del archivo quedó idéntico).
- Contenido: `kind two-sides-backend-integrity`, `sha256`, **3 838 archivos**, 0 problemas (sin enlaces ni archivos especiales): `src` 70 · `scripts` 47 · `node_modules` 3 718 · raíz 3 (`package.json`, `package-lock.json`, `vitest.config.js`).
- Sin nombres de archivos de entorno, claves ni bases de datos en la lista.

## 4. Digest público para conservar FUERA del equipo

| Dato | Valor |
|---|---|
| **`treeDigest` de la línea base** | `e06e4d2e466f1cb381c6ad925178f9caebd83a8b3c6b49efbd7ed76aa871ebdb` |
| Archivos cubiertos | 3 838 |
| Huella pública JWT (`main-2026-11`, RSA 3072) | `811cd75bcf98dcb88c766f369431e3886f75188ad3fec59d8bbbbe0eab9d8aec` |

Estos dos valores deben conservarse **por el propietario en un lugar confiable fuera de este equipo** (papel, gestor de contraseñas, mensaje a otro dispositivo). No considerarlos un ancla independiente mientras solo existan aquí o junto al manifiesto: este informe, que vive en el árbol del proyecto, **no** es un ancla.

## 5. Resultado de la verificación

- `backend-integrity.js verify` (real): `ok`, **3 838 coincidentes; 0 añadidos, 0 eliminados, 0 modificados, 0 problemas**.
- `main-signing-key.js check` sobre la clave real: `valid`, `main-2026-11`, 3072 bits, huella **igual** a la esperada (`811cd75b…9d8aec`); el contenido privado no se imprimió.
- Escáner de secretos: `clean`.
- `check-main-secrets-acl.ps1 -Directory <integridad>`: sin fallos de ACL en la carpeta; marca `key_file_too_large` en el manifiesto porque su regla de tamaño (32 KiB) es **específica de claves** y el manifiesto pesa 537 KB. Es una limitación del comprobador (no una falla de permisos); la política de ACL aplicada directamente da 0 fallos y la guardia del lanzador no usa esa regla de tamaño. Mejora pendiente (no hecha, fuera de alcance): aplicar el límite solo bajo `keys\`.

## 6. Archivos excluidos de la línea base

`tests/`, `docs/`, `.env` (y todo secreto), `.git`, `.npm-cache`, `.tmp`, `Respaldo_ENV`, datos y bases SQLite, manifiestos y autorizaciones, resultados temporales y cualquier archivo fuera de `backend/`. Por tanto editar informes o pruebas **no** cambia la verificación; editar `src/`, `scripts/` (incluido el lanzador y la guardia), `package*.json`, `vitest.config.js` o `node_modules/` **sí** la hace fallar.

## 7. Uso y mantenimiento

- Arranque futuro (cuando se autorice activar `main`): `run-main-backend.ps1 -EnableMain -SigningKeyFile "$env:LOCALAPPDATA\TwoSidesMainSecrets\keys\main-jwt.pem" -KeyId main-2026-11 -IntegrityManifest "$env:LOCALAPPDATA\TwoSidesMainIntegrity\backend-integrity-manifest.json" -ExpectedTreeDigest e06e4d2e…ebdb -ExpectedKeyFingerprint 811cd75b…9d8aec` (valores completos en §4).
- Si cambia código cubierto, la verificación **falla** hasta aprobar una nueva línea base: no se modificará código para ajustarlo al manifiesto. Una nueva línea base requiere revisar el cambio, retirar el manifiesto anterior (autorización), generar otro y anotar el nuevo digest fuera del equipo.
- Mientras exista esta línea base, cualquier cambio posterior en `src/` o `scripts/` (por ejemplo corregir el comprobador, §5) la invalidará.

## 8. Riesgos y limitaciones

- **El manifiesto, la carpeta y el código están en el mismo equipo y cuenta (`luis2`):** un proceso malicioso con ese token puede modificar el código y generar otro manifiesto en una ruta distinta; la ACL no lo impide. Solo el digest anotado fuera del equipo (que debe pasarse al lanzador) lo detecta, y solo si el lanzador no fue alterado (la guardia vive en `scripts/`, que forma parte del hash).
- No hay verificación continua ni protección contra cambios entre la comprobación y el arranque.
- No cubre el binario de Node, DLL del sistema ni la memoria del proceso.
- La huella JWT detecta una clave distinta, pero quien lea `main-jwt.pem` puede forjar tokens con sesión viva.
- El resto de B00 sigue abierto (§9).

## 9. Estado de B00

**Abierto.** Cumplido: SID ajenos retirados (B11), carpeta de secretos (B13), clave generada y verificada (B14), escáner e integridad (B15), guardia previa al arranque (B16) y **línea base creada y verificada (B17)**. Pendiente: que el propietario conserve el digest y la huella fuera del equipo; rotación y verificación de la contraseña de `twosides_backend`; retirada de `backend/.env` y vaciado de la papelera de OneDrive; línea base en Git (decisión del propietario, sin `push`/`--mirror`); mitigación (cuenta dedicada o paquete de solo lectura) o aceptación formal del riesgo del mismo usuario. `main` sigue sin activarse.

Detenido al finalizar.
