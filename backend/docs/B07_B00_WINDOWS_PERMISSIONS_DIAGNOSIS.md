# B07 — Diagnóstico B00: permisos NTFS en Windows (solo lectura; NADA corregido)

Fecha: 2026-10-31. Equipo `LAPTOP-F337QTKK`, usuario `luis2` (SID local `…-1001`), sesión **no elevada** (la pertenencia a Administradores está filtrada por UAC).

**Alcance de lo hecho:** únicamente consultas: `whoami`, `icacls <ruta>` sin opciones de modificación, `Get-Acl`, `Test-Path`, `Get-LocalUser/Group`, `git ls-files`, `git check-ignore`, `git grep -l` (solo nombres de archivo). **No** se cambió ninguna ACL ni propietario, no se usó `/grant /deny /remove /reset /save /restore /setowner`, no se abrió `backend/.env` (solo su existencia y su ACL), no se mostró ningún secreto, no se generó ni instaló clave, no se conectó Atlas, no se habilitó `main`, no se ejecutó bootstrap, Godot, C.2/F.2, ni se tocó SQLite o C2Runtime. **B00 sigue pendiente.**

## 1. Rutas evaluadas

Cadena de arranque de `main` (según `run-main-backend.ps1`, `src/server.js`, `src/main/*`):

| Eslabón | Ruta |
|---|---|
| Lanzador | `backend\scripts\run-main-backend.ps1` (llama a `C:\Program Files\nodejs\node.exe` con ruta fija) |
| Punto de entrada y módulos | `backend\src\server.js`, `src\main\{runtime,signing-key,profile,policy,…}.js`, `src\config\*`, `src\modules\**` |
| Dependencias | `backend\node_modules` (código ejecutado) y `backend\package.json` |
| Secretos locales | `backend\.env` (ignorado por git; no usado por `main`), contraseña por stdin, **clave JWT futura** (aún no existe) |
| Herramientas | `backend\scripts\main-signing-key.js` |
| Contenedores | `Two-Sides PRUEBA` → `TWO SIDES PRUEBA` → `PRUEBA` → `Desktop` → `OneDrive` |
| Candidatas para la clave | `%LOCALAPPDATA%\TwoSidesMain\keys`, `C:\ProgramData\TwoSidesMain\keys` (ninguna existe) |
| Ejecutables | `C:\Program Files\nodejs\node.exe` y su carpeta |

## 2. Identidades y permisos relevantes

**Contexto legítimo de ejecución:** el usuario interactivo `LAPTOP-F337QTKK\luis2` (propietario de **los 3 234 elementos** explorados), con VS Code, Godot, Git y Node bajo ese token. `luis2` tiene `Full control` heredado; `SYSTEM` y `Administradores` también. Es lo único que debe poder escribir en el backend.

**Identidades observadas en las ACL del proyecto**

| Identidad | Permiso | Origen | Observación |
|---|---|---|---|
| `LAPTOP-F337QTKK\luis2` | Full | heredado desde `OneDrive` | legítimo |
| `NT AUTHORITY\SYSTEM`, `BUILTIN\Administradores` | Full | heredado | normal; Administradores filtrado en la sesión actual |
| **SID A** `S-1-5-21-452213140-3335518246-3718727391-3248334987` | **Modify** `(OI)(CI)` | **explícito en la raíz `Two-Sides PRUEBA`**, propagado | no se resuelve a ninguna cuenta |
| **SID B** `S-1-5-21-307222809-3929607348-3502628415-466486063` | **Modify** `(OI)(CI)` | **explícito en la raíz**, propagado | no se resuelve a ninguna cuenta |
| `Everyone` | **DENY** `DC` (borrar hijos) `(CI)` | explícito en `C:\Users\luis2\OneDrive`, heredado hacia abajo | solo afecta a contenedores; no concede nada; no se toca |
| SID A y B | **DENY** write/delete/permissions | **explícito en `.git`** (4 ACE) | indicio de una protección anterior de la historia de Git |

**Hallazgos de alcance (3 234 elementos, sin `node_modules`, `.git` ni `.godot`):** 2 firmas de ACL distintas (archivos y directorios); **0 elementos con ACE explícitas** salvo la raíz; **los 3 234 incluyen a SID A y B**; propietario único `luis2`. `node_modules` y `.godot` heredan lo mismo; `.git` hereda y además lleva los 4 DENY. Es decir: la herencia de la raíz alcanza a todo el backend, a los scripts de arranque, a los módulos de seguridad (`src\main`, `src\config`, `src\modules\auth`), a `package.json`, a `node_modules` y a `.env`.

**Fuera del árbol (sin identidades extrañas):** `C:\Program Files\nodejs` y `node.exe` → Usuarios/Authenticated Users solo lectura y ejecución; escritura solo Administradores/SYSTEM (**protegido**). `%LOCALAPPDATA%` y `…\TwoSidesMainInspection` → solo `luis2`, `SYSTEM`, `Administradores` (**adecuado** para la clave). `C:\ProgramData` → `BUILTIN\Usuarios` puede **crear** archivos y carpetas (`WD/AD`): **inadecuado** salvo que la subcarpeta desactive la herencia.

## 3. Hallazgos

**Confirmados**
1. **Dos SID ajenos con `Modify` sobre todo el árbol**, incluidos los scripts de arranque, `src\main`, `src\config`, `node_modules` y `.env`. Esa es la causa raíz de B00.
2. Ambos SID **no son de esta máquina**: su prefijo de dominio (`452213140…`, `307222809…`) difiere del de la máquina (`1972436287-3393038613-924685975`), no pertenecen a ningún grupo local y no existe ninguna cuenta local que los use. No hay cuentas locales con permisos de escritura salvo `luis2`; las demás están deshabilitadas.
3. La ACE de los dos SID está **explícita solo en la raíz**; nada más del proyecto tiene ACE explícitas. La corrección puede ser, por tanto, de una sola operación en la raíz.
4. `.git` tiene **DENY de escritura** para esos SID (la historia está mejor protegida que el código).
5. Propietario de todo el árbol: `luis2`. Node y su carpeta no son escribibles por usuarios estándar.
6. **Git:** ningún nombre de archivo versionado coincide con `.env`, `*.pem`, `*.key`, `*.pfx`, `*.p12`, `secret`, `credential`, `*.sqlite`, `*.db`, autorizaciones; `backend/.env` y `node_modules` están ignorados (`backend/.gitignore`). Búsqueda de contenido (solo nombres): **ningún** bloque de clave privada; una única coincidencia de URI con contraseña en `tests/sync/atlas.test.js:26`, que resulta ser un patrón de prueba (falso positivo, ya revisado con la parte sensible enmascarada).
7. **Hallazgo nuevo:** `git ls-files backend` devuelve **0**: todo `backend/` está **sin versionar** (331 archivos sin seguimiento no ignorados). No hay base de integridad en Git para el código de seguridad; los únicos versionados son los 61 archivos del juego.
8. La clave JWT todavía no existe; ninguna carpeta candidata fue creada.

**No verificables (límites de esta sesión)**
- **Quién es SID A/B.** Posibles orígenes (sin confirmar): cuentas de otro equipo o dominio del que se copió/sincronizó el proyecto, una cuenta de Microsoft/Entra anterior o un restos de herramienta; no se pueden resolver sin red de dominio. **No se asume que sean maliciosos**: en este equipo ningún proceso local puede portar esos SID (no están en el token de `luis2` ni en grupos locales). El riesgo real es **otro equipo o servicio que monte/copie el árbol con esas identidades**, o que alguien con privilegios los asigne a una cuenta nueva.
- Contenido de `backend/.env` (no abierto): no se sabe qué secretos contiene ni si siguen vigentes.
- ACL efectivas de procesos elevados o de servicios (`Get-Process -IncludeUserName` exige elevación).
- Estado de OneDrive (qué sincroniza en la nube, historial de versiones): fuera de alcance; el contenido de `.env` podría estar en la nube.
- Que Windows haya aplicado las ACE a cada archivo a nivel de sistema (se muestrea con `Get-Acl`, no con una auditoría).
- Riesgo de **mismo usuario**: cualquier proceso bajo `luis2` puede escribir el código. Ninguna ACL lo impide (conclusión ya registrada en B00.4).

## 4. Riesgos de modificar permisos mal

| Riesgo | Consecuencia | Mitigación |
|---|---|---|
| Quitar o denegar a `luis2`, `SYSTEM` o `Administradores` | VS Code/Godot/Node dejan de poder escribir; Godot no guarda; recuperación requiere elevación o tomar propiedad | Operar **solo** sobre los dos SID, nunca sobre grupos conocidos; respaldo previo de ACL |
| `/reset` o `/inheritance:r` en la raíz | Pérdida de la herencia desde `OneDrive`; ACL distintas a las esperadas; posible rotura de OneDrive | **No usarlos**; la propuesta solo borra dos ACE |
| `/deny` en lugar de `/remove` | Un DENY sobre un SID desconocido puede combinarse mal si algún día se asigna a una cuenta del usuario | Usar `/remove:g`, no `/deny` |
| Recursión masiva sobre `.git` o `node_modules` | Tiempo, bloqueos con OneDrive, corrupción improbable pero posible | Operar solo en la raíz y dejar que Windows propague; no usar `/T` salvo que la verificación lo exija |
| Poner la carpeta de la clave en `C:\ProgramData` con herencia | `Usuarios` podría crear/leer archivos | Preferir `%LOCALAPPDATA%` o cortar la herencia |
| Cambiar propietarios | Pérdida de coherencia (todo es de `luis2`) | No hace falta cambiar propietarios |
| Esperar que la ACL cierre B00 por completo | Falsa sensación de seguridad: el mismo usuario sigue pudiendo modificar el código | Documentar el riesgo residual y exigir un paquete de solo lectura para ejecución real |

## 5. Plan de corrección mínimo (no aplicado)

Principio: **quitar únicamente los dos Modify de SID desconocidos, en la raíz**, y no tocar nada más. Conservan control `luis2`, `SYSTEM` y `Administradores`; VS Code, Godot, Git y Node siguen funcionando como `luis2`.

1. Respaldo de ACL fuera del árbol (reversible).
2. Retirar las dos ACE explícitas de la raíz (Windows propaga la retirada a los hijos que heredan).
3. (Opcional, después) quitar los 4 DENY de `.git` para esos SID, ya inertes.
4. Verificar con el mismo muestreo (0 elementos que listen A/B; 2 firmas restantes iguales a las actuales sin A/B).
5. Para ejecución real: crear la carpeta de la clave en `%LOCALAPPDATA%\TwoSidesMain\keys` con herencia cortada (`luis2` y `SYSTEM`), y mover la ejecución a un paquete de solo lectura (B00.3) cuando se decida.
6. Versionar `backend/` (decisión del usuario) para tener línea base de integridad.

## 6. Comandos propuestos — **NO EJECUTADOS**

(PowerShell, sesión **no elevada** del usuario `luis2`; la ruta se entrecomilla.)

```powershell
$root = 'C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA'
$A = '*S-1-5-21-452213140-3335518246-3718727391-3248334987'
$B = '*S-1-5-21-307222809-3929607348-3502628415-466486063'

# 0) Carpeta de respaldo fuera del árbol y de OneDrive
New-Item -ItemType Directory -Force 'C:\Users\luis2\AppData\Local\TwoSidesB00' | Out-Null

# 1) Respaldo de las ACL de la raíz y de todo su contenido (recomendado antes de cualquier cambio; usa /save, solo escribe el archivo de respaldo)
icacls $root /save 'C:\Users\luis2\AppData\Local\TwoSidesB00\acl-before.txt' /t /c

# 2) Corrección mínima: quitar SOLO los dos Modify explícitos de la raíz
icacls $root /remove:g $A $B

# 3) (Opcional) Limpiar los DENY inertes de .git
icacls "$root\.git" /remove:d $A $B
```

**Consecuencias:** desaparecen los permisos de `Modify` para los dos SID en todo el árbol; `luis2`, `SYSTEM` y `Administradores` no cambian. No altera contenido de archivos ni propietarios. OneDrive no sincroniza ACL.

**Comprobaciones posteriores (solo lectura):**
```powershell
icacls $root                                    # ya no aparecen A ni B
icacls "$root\backend\scripts\run-main-backend.ps1"
# Repetir el muestreo del diagnóstico: items que listan A/B = 0; firmas distintas = 2
git status --short | Select-Object -First 5      # sin cambios inesperados
cd "$root\backend"; node scripts\run-backend-regression.js   # sigue en verde
# Abrir el proyecto en VS Code y Godot (editor) y guardar un archivo de prueba propio
```

**Recuperación:**
```powershell
# Restaurar el estado exacto anterior (se aplica sobre el PADRE de la raíz, como exige /restore)
icacls 'C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA' /restore 'C:\Users\luis2\AppData\Local\TwoSidesB00\acl-before.txt' /c
# Reconceder manualmente un SID, si hiciera falta
icacls $root /grant:r "${A}:(OI)(CI)M"
# Si luis2 perdiera acceso: abrir PowerShell como administrador y ejecutar
icacls $root /grant "LAPTOP-F337QTKK\luis2:(OI)(CI)F"
```

**Carpeta de la futura clave (no crear todavía):**
```powershell
$k = "$env:LOCALAPPDATA\TwoSidesMain\keys"
New-Item -ItemType Directory -Force $k | Out-Null
icacls $k /inheritance:r /grant:r "$env:USERNAME`:(OI)(CI)F" "SYSTEM:(OI)(CI)F"   # sin Administradores si se prefiere mínimo
icacls $k                                                                     # debe listar solo esas dos identidades
```
La clave se crea después, con `node scripts\main-signing-key.js create`, y se vuelve a ejecutar `icacls` sobre el archivo.

## 7. Evidencia suficiente para declarar B00 resuelto

Todas, verificadas por escrito:
1. Muestreo del árbol: **0 elementos** que concedan escritura a SID desconocidos o a `Everyone`/`Users`/`Authenticated Users`; solo `luis2`, `SYSTEM`, `Administradores` con escritura; propietario único esperado.
2. `icacls` de `scripts\`, `src\main`, `src\config`, `src\modules`, `package.json`, `node_modules` y `.env` sin esas identidades.
3. Carpeta de la clave fuera de OneDrive y del proyecto, herencia cortada, solo identidades esperadas; `main-signing-key.js check` válido (aún pendiente de crear).
4. `git ls-files` sin secretos; contenido sin claves; `backend/.env` rotado o sin credenciales vigentes (verificado sin abrirlo ante terceros).
5. Ejecución real desde un paquete de solo lectura (B00.3/B00.4) **o** aceptación escrita del riesgo residual de "mismo usuario" que ninguna ACL elimina.
6. Código de `backend/` versionado o con manifiesto de hashes firmado como línea base.
7. Regresión completa en verde tras el cambio y VS Code, Godot y Node operativos con `luis2`.
8. Resolución del origen de SID A y B (o confirmación documentada de que no corresponden a ninguna cuenta viva).

Hasta que 1–8 estén cumplidos, **B00 permanece pendiente**. Corregir solo las ACE cierra el punto 1 y 2, no el riesgo del mismo usuario.

## 8. Próximo paso recomendado

Decidir si se autoriza la corrección mínima de la sección 6 (pasos 0–2). Requiere autorización específica y posterior; no se ha aplicado nada.
