# B10 — Resultado de la corrección de ACL de B00: **NO APLICADA (icacls falló, sin cambios)**

Fecha: 2026-10-31. Autorización recibida del propietario para retirar únicamente las concesiones de los SID A y B. **El comando autorizado falló y, conforme a las restricciones, no se intentó ninguna alternativa.** Las ACL quedaron exactamente como estaban. No se abrió `.env`, no se tocó Atlas, SQLite, partidas, `.git`, propietarios, la clave JWT ni `main`. **B00 sigue pendiente.**

## 1. Verificaciones previas (todas correctas)

| Verificación | Resultado |
|---|---|
| Respaldo `C:\Users\luis2\AppData\Local\TwoSidesB00\acl-before.txt` | Existe; SHA-256 `16DD726B1942D31D241A10B4A14DF15922A921AE214690572E7E9EBC1B35CFA0` = esperado |
| SID A `S-1-5-21-452213140-3335518246-3718727391-3248334987` | `Allow Modify, Synchronize`, **explícito** en la raíz `…\Two-Sides PRUEBA` |
| SID B `S-1-5-21-307222809-3929607348-3502628415-466486063` | Igual |
| `luis2`, `SYSTEM`, `Administradores` | `FullControl` **heredado** (no dependen de A ni B); propietario `luis2`; sesión no elevada |

## 2. Comando ejecutado (único)

```powershell
$root = 'C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA'
$A = '*S-1-5-21-452213140-3335518246-3718727391-3248334987'
$B = '*S-1-5-21-307222809-3929607348-3502628415-466486063'
icacls $root /remove:g $A $B
```

Resultado de `icacls`:
```
Se procesaron correctamente 0 archivos; error al procesar 0 archivos
código de salida: 1332 (ERROR_NONE_MAPPED: no se realizó ninguna asignación entre nombres de cuenta e identificadores de seguridad)
```

No se modificó nada: "0 archivos procesados". La causa exacta no está determinada; el código 1332 coincide con que los SID no se resuelven (B09, H1) y `icacls /remove` intenta una asignación de nombre pese al prefijo `*`. Es una hipótesis.

## 3. Verificación posterior (solo lectura): sin cambios

- `icacls` de la raíz sigue mostrando A y B con `(OI)(CI)(M)`, además de `Everyone:(I)(CI)(DENY)(DC)`, `SYSTEM`, `Administradores` y `luis2` con `(F)` heredado.
- `backend`, `backend\scripts`, `backend\src\main` y `backend\.env`: **2 ACE de A/B cada una** (heredadas), igual que antes.
- Proyecto accesible (`backend\package.json` existe). VS Code y Godot siguen en ejecución bajo `luis2`; al no haberse cambiado nada, conservan el acceso exactamente como antes. No se realizó una prueba funcional adicional.
- Respaldo intacto; no hizo falta restaurar.

## 4. Opciones para completar la corrección (NO ejecutadas; requieren nueva autorización)

Ambas respetan el alcance autorizado (solo quitar las concesiones de A y B en la raíz; sin `/T`, `/reset`, `/deny`, propietarios ni `.git`).

**Opción 1 — API de .NET (recomendada).** Trabaja con el objeto `SecurityIdentifier` y no necesita resolver nombres. `PurgeAccessRules` solo quita las reglas *Allow/Deny de ese SID* en la ACL de la raíz; los DENY propios de `.git` no se tocan, porque son de otro objeto.
```powershell
$root = 'C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA'
$acl = Get-Acl -LiteralPath $root
foreach ($s in 'S-1-5-21-452213140-3335518246-3718727391-3248334987','S-1-5-21-307222809-3929607348-3502628415-466486063') {
  $acl.PurgeAccessRules((New-Object Security.Principal.SecurityIdentifier $s)) }
Set-Acl -LiteralPath $root -AclObject $acl          # 🔴 cambia ACL
```
Consecuencia: Windows propaga la retirada a los hijos que heredan (misma semántica que `icacls`). Si el propietario del objeto no cambió (es `luis2`), no se altera.

**Opción 2 — `icacls` con otra sintaxis** (por ejemplo `icacls $root /remove $A $B`, sin `:g`); mismo riesgo de 1332, menos fiable.

Verificación posterior (solo lectura) en ambas: `icacls $root`; recorrido de `Get-Acl` con 0 elementos con A/B concedidos; regresión completa; abrir VS Code y Godot (editor).
Recuperación: `icacls 'C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA' /restore 'C:\Users\luis2\AppData\Local\TwoSidesB00\acl-before.txt' /c`.

## 5. Riesgos pendientes

- B00 abierto: A y B siguen con `Modify` sobre todo el árbol (incluidos scripts de arranque, `src\main`, `src\config`, `node_modules` y `.env`).
- La Opción 1 no está probada en este equipo; podría fallar de otra forma (se registraría y se detendría).
- Aunque se retiren A y B, el riesgo del mismo usuario (`luis2`) persiste; quedan por resolver `.env` (rotación/contenido), código sin versionar, carpeta de clave protegida y paquete de solo lectura (B07 §7).
- Los 4 DENY de `.git` siguen sin tocar (inertes tras la corrección).

## 6. Estado

Sin cambios de seguridad. Esperando decisión sobre la Opción 1 (o instrucciones distintas). Detenido.
