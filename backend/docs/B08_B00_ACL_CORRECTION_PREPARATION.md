# B08 — Corrección controlada de ACL de B00 (PREPARADA, NO APLICADA)

Fecha: 2026-10-31. **No se ha cambiado ninguna ACL ni propietario.** Se hizo únicamente: relectura de ACL, comprobaciones de necesidad, y un respaldo con `icacls /save` (escribe solo un archivo fuera del árbol). No se abrió `backend/.env` (solo su ACL), no se tocó Atlas, Godot, SQLite, claves JWT, `main`, colecciones, C2Runtime ni C.2/F.2. **B00 sigue pendiente.**

## 1. SID exactos (leídos de las ACL, no inventados)

Raíz: `C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA`

| | SID | Permiso | Origen |
|---|---|---|---|
| A | `S-1-5-21-452213140-3335518246-3718727391-3248334987` | Allow `Modify, Synchronize` (`0x1301bf`), `(OI)(CI)` | **Explícito en la raíz** |
| B | `S-1-5-21-307222809-3929607348-3502628415-466486063` | Allow `Modify, Synchronize` (`0x1301bf`), `(OI)(CI)` | **Explícito en la raíz** |

Confirmado en `backend`, `backend\scripts`, `backend\src\main` y `backend\.env`: ambos aparecen **heredados** (`inherited=True`) con el mismo permiso. Ninguna de esas rutas tiene ACE propias.

## 2. ¿Son necesarios para el proyecto? — No encontrado ningún uso

- No están en el token de `luis2` ni en ningún grupo local; no son cuentas locales (prefijo de dominio distinto al de la máquina, `…1972436287-3393038613-924685975`).
- 0 servicios y 0 tareas programadas con esas cuentas; recursos compartidos solo `ADMIN$`, `C$`, `IPC$` (administrativos por defecto).
- Perfiles de usuario en el equipo: solo `luis2` y `WsiAccount` (deshabilitada).
- VS Code y Godot corren como `luis2` (no dependen de A ni de B). Node, Git y OneDrive también se ejecutan como `luis2`.
- Límite honesto: no se puede resolver a quién pertenecen. Si esos SID corresponden a otro equipo que monta o copia este árbol, perdería su acceso de escritura (ese es precisamente el objetivo).

## 3. Respaldo de ACL (HECHO)

| Dato | Valor |
|---|---|
| Archivo | `C:\Users\luis2\AppData\Local\TwoSidesB00\acl-before.txt` (fuera del árbol, fuera de OneDrive) |
| Comando usado | `icacls "<raíz>" /save "C:\Users\luis2\AppData\Local\TwoSidesB00\acl-before.txt" /t /c` |
| Resultado | 21 278 elementos procesados, 0 errores (todo el árbol, incluidos `.git`, `node_modules` y `.godot`) |
| Tamaño / SHA-256 | 15 763 330 bytes / `16DD726B1942D31D241A10B4A14DF15922A921AE214690572E7E9EBC1B35CFA0` |
| Contenido | Rutas relativas a la carpeta **padre** (`Two-Sides PRUEBA\…`) y su DACL en SDDL; no contiene secretos ni contenido de archivos. A y B aparecen en las 21 278 entradas |
| Protección de la carpeta | Solo `SYSTEM`, `Administradores` y `luis2` |

Consejo: copiar el archivo a un segundo lugar fuera de OneDrive antes de aplicar (opcional).

## 4. `luis2`, `SYSTEM` y `Administradores` conservan sus permisos

Hoy los tres tienen `FullControl` **heredado desde `C:\Users\luis2\OneDrive`** (ACE `(I)(OI)(CI)(F)`), no desde A ni B. `/remove:g` sobre A y B solo borra las ACE de esos dos SID; no toca las de los otros tres ni la herencia. Los tres siguen en las 21 278 entradas del respaldo. Propietario de todo el árbol: `luis2` (no se cambia).

## 5. Comandos exactos

> Clasificación: 🟢 solo lectura / sin efecto en ACL (se puede ejecutar libremente) · 🔴 **cambia ACL: requiere autorización explícita**.

Variables comunes (PowerShell, sesión **no elevada** de `luis2`):
```powershell
$root = 'C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA'
$A = '*S-1-5-21-452213140-3335518246-3718727391-3248334987'
$B = '*S-1-5-21-307222809-3929607348-3502628415-466486063'
$backup = 'C:\Users\luis2\AppData\Local\TwoSidesB00\acl-before.txt'
```

### 5.1 Antes (🟢)
```powershell
Get-FileHash $backup -Algorithm SHA256        # debe dar 16DD726B1942D31D241A10B4A14DF15922A921AE214690572E7E9EBC1B35CFA0
icacls $root                                  # A y B aparecen como (OI)(CI)(M) sin (I)
```

### 5.2 Corrección mínima (🔴 AUTORIZACIÓN REQUERIDA)
```powershell
icacls $root /remove:g $A $B
```
Sin `/T`, sin `/reset`, sin `/deny`, sin `/inheritance`, sin `/setowner`. Windows propaga la retirada a los hijos que heredan. Duración esperada: segundos a un par de minutos.

### 5.3 Limpieza opcional de los DENY inertes en `.git` (🔴 AUTORIZACIÓN REQUERIDA, separada)
Los DENY de A y B en `.git` (4 ACE explícitas, heredadas por 8 100 elementos) no hacen daño; quedan inertes tras 5.2. Retirarlos es cosmético y puede hacerse más tarde:
```powershell
icacls "$root\.git" /remove:d $A $B
```

### 5.4 Contingencia si la propagación no llega a todos los hijos (🔴 AUTORIZACIÓN REQUERIDA, solo si 5.5 falla)
```powershell
icacls $root /remove:g $A $B /t /c
```

### 5.5 Verificación posterior (🟢 solo lectura)
```powershell
icacls $root
icacls "$root\backend"
icacls "$root\backend\scripts"
icacls "$root\backend\src\main"
icacls "$root\backend\.env"                   # solo ACL; no abre el contenido
# Esperado en cada una: solo SYSTEM, Administradores y LAPTOP-F337QTKK\luis2 con (F), más el Everyone DENY DC heredado en directorios

$n = 0; $bad = 0
Get-ChildItem -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
  $n++; $a = Get-Acl -LiteralPath $_.FullName
  if ($a.Access | Where-Object { $_.IdentityReference.Value -match '3248334987|466486063' -and $_.AccessControlType -eq 'Allow' }) { $bad++ } }
"elementos=$n  con A/B concedidos=$bad"       # esperado bad=0
cd "$root\backend"; node scripts\run-backend-regression.js   # sigue en verde
git -C $root status --short | Select-Object -First 5          # sin cambios inesperados
```
Abrir además el proyecto en VS Code y en el editor de Godot, y guardar un archivo propio, para confirmar que el funcionamiento normal no cambió.

### 5.6 Recuperación
```powershell
# (a) Restauración exacta de todo el árbol al estado respaldado (se aplica sobre el PADRE: las rutas del respaldo empiezan por 'Two-Sides PRUEBA\')
icacls 'C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA' /restore $backup /c            # 🔴 cambia ACL

# (b) Reconceder solo a un SID, si se necesitara
icacls $root /grant:r "${A}:(OI)(CI)M"                                                              # 🔴 cambia ACL

# (c) Si luis2 perdiera acceso (no se espera): PowerShell como administrador
icacls $root /grant 'LAPTOP-F337QTKK\luis2:(OI)(CI)F'                                               # 🔴 cambia ACL
```
La restauración (a) no cambia propietarios ni contenido. `/save` no guardó propietarios, pero estos no se modifican en ningún paso.

## 6. Qué requiere autorización

| Comando | Cambia ACL | ¿Autorización? |
|---|---|---|
| 5.1, 5.5 | No | No (solo lectura) |
| Respaldo `icacls /save` | No (escribe un archivo) | Ya hecho |
| **5.2** `icacls $root /remove:g $A $B` | **Sí** | **Sí** |
| 5.3 `/remove:d` en `.git` | Sí | Sí (separada, opcional) |
| 5.4 `/t /c` | Sí | Sí (solo si 5.5 falla) |
| 5.6 recuperación (a)(b)(c) | Sí | Sí, si hay que revertir |

## 7. Otras entradas que requieren evaluación aparte (análisis del respaldo, 21 278 elementos)

1. **`Everyone` DENY `DC` (borrar hijos)**: 2 845 directorios; **heredado** desde `C:\Users\luis2\OneDrive`, no del proyecto. No concede nada, no es parte de B00. Si algún día impide borrar o renombrar archivos de un directorio, evaluarlo; no se toca.
2. **DENY de A y B en `.git`** (4 ACE explícitas; heredadas por 8 100 elementos): inertes tras 5.2; opción 5.3.
3. **No hay** otras ACE explícitas, ni DACL protegidos, ni herencia desactivada en ningún elemento. Las únicas identidades presentes son `SYSTEM`, `Administradores`, `luis2`, A, B y `Everyone` (solo DENY).
4. **Fuera del árbol, no incluido en el respaldo:** la carpeta de la clave JWT (aún no existe) y `C:\ProgramData` (Usuarios puede crear elementos) requieren decisión aparte (B06/B07).
5. **Riesgo del mismo usuario:** quitar A y B no impide que un proceso de `luis2` modifique el código. B00 solo se cierra con los criterios de B07 §7 (incluido un paquete de solo lectura o aceptación escrita del riesgo residual, `.env` rotado y `backend/` versionado).

## 8. Estado

Preparado y con respaldo verificado. **Esperando confirmación explícita** para ejecutar 5.2 (y, si se desea, 5.3). B00 permanece pendiente aunque se aplique la corrección.
