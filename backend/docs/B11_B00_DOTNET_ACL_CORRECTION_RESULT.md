# B11 — Corrección B00 mediante API .NET de ACL: **APLICADA Y VERIFICADA** (B00 sigue pendiente)

Fecha: 2026-10-31. Se retiraron las dos concesiones explícitas `Allow Modify` de los SID A y B en la raíz `Two-Sides PRUEBA` con `Get-Acl` + `PurgeAccessRules` + un único `Set-Acl`. No se usó `/T`, recursión, `/reset`, `/deny`, ni cambio de propietarios, auditoría u otros SID. No se tocó `.git` por separado, `backend/.env` (solo su ACL), Atlas, SQLite, bootstrap, clave JWT, `main`, C2Runtime ni C.2/F.2.

SID A `S-1-5-21-452213140-3335518246-3718727391-3248334987` · SID B `S-1-5-21-307222809-3929607348-3502628415-466486063`

## 1. Verificaciones previas (todas correctas; si alguna fallaba, abortaba sin cambios)

| # | Verificación | Resultado |
|---|---|---|
| 1 | Raíz exactamente `…\TWO SIDES PRUEBA\Two-Sides PRUEBA` (directorio existente) | OK |
| 2 | Respaldo `C:\Users\luis2\AppData\Local\TwoSidesB00\acl-before.txt` existe | OK |
| 3 | SHA-256 = `16DD726B1942D31D241A10B4A14DF15922A921AE214690572E7E9EBC1B35CFA0` | OK |
| 4 | ACL leídas como `SecurityIdentifier` (sin resolver nombres) | OK |
| 5 | A y B: exactamente **1** regla cada uno, explícita, `Allow`, máscara `0x1301bf` (Modify + Synchronize), `(OI)(CI)` | OK |
| 6 | Sin otras reglas (Allow ni Deny, explícitas o heredadas) de esos SID en la raíz | OK |
| 7 | `luis2`, `SYSTEM` y `Administradores`: `FullControl` en reglas independientes (heredadas de `C:\Users\luis2\OneDrive`) | OK |

Propietario antes: `LAPTOP-F337QTKK\luis2`. Sesión no elevada.

## 2. Resultado de la operación

`Set-Acl` se ejecutó **una sola vez** y terminó sin error. No hubo errores ni reintentos.

## 3. Diferencias de ACL en la raíz (antes → después)

SDDL antes:
```
O:S-1-5-21-1972436287-3393038613-924685975-1001G:S-1-5-21-1972436287-3393038613-924685975-1001
D:AI(A;OICI;0x1301bf;;;S-1-5-21-307222809-…-466486063)(A;OICI;0x1301bf;;;S-1-5-21-452213140-…-3248334987)
  (D;CIID;DT;;;WD)(A;OICIID;FA;;;SY)(A;OICIID;FA;;;BA)(A;OICIID;FA;;;S-1-5-21-1972436287-…-1001)
```
SDDL después:
```
O:S-1-5-21-1972436287-3393038613-924685975-1001G:S-1-5-21-1972436287-3393038613-924685975-1001
D:AI(D;CIID;DT;;;WD)(A;OICIID;FA;;;SY)(A;OICIID;FA;;;BA)(A;OICIID;FA;;;S-1-5-21-1972436287-…-1001)
```
**Única diferencia:** desaparecen las dos ACE `A;OICI;0x1301bf` de A y B. Las cuatro restantes (`Everyone` Deny `DC` heredado, `SYSTEM`, `Administradores`, `luis2`) son idénticas. Propietario y grupo sin cambio. Sin cambios en SACL/auditoría.

## 4. Estado de herencia

- La raíz conserva la herencia desde `C:\Users\luis2\OneDrive` (`D:AI`, sin `P`): no se protegió ni se desactivó.
- Recorrido de los **21 281 elementos** (21 278 de antes + 3 informes nuevos B08–B10): **0 ACE `Allow` de A o B**; propietario único `luis2` en los 21 281; 5 firmas de ACL (antes 2 más las de `.git`), todas compuestas solo por `SYSTEM`, `Administradores`, `luis2` (FullControl heredado), `Everyone` Deny `DC` en directorios y, en `.git`, los DENY de A/B.
- Confirmado en `backend`, `backend\scripts`, `backend\src\main` y `backend\.env`: solo `SYSTEM`, `Administradores` y `luis2` con `Allow`; **0** de A/B. La retirada se propagó a todos los hijos sin necesidad de `/T`.

## 5. Permisos conservados y elementos intactos

- `luis2`, `SYSTEM`, `Administradores`: `FullControl` heredado, sin cambios.
- `Everyone` Deny `DC` heredado de OneDrive: sin cambios (2 560 + 284 + 1 directorios).
- **DENY de `.git` intactos:** 4 ACE explícitas en `.git`; 16 200 ACE Deny de A/B en total = 8 100 elementos × 2 SID, igual que antes (inertes).
- Ninguna otra entrada de la DACL, propietario ni auditoría cambió.

## 6. Acceso de herramientas

- **Node.js 24:** lee `package.json`, escribe/borra en temporal; las pruebas `main-jwt-persistence` y `main-bootstrap`: **19/19** pasan.
- **VS Code y Godot (4.6.1):** siguen en ejecución bajo `luis2`; su acceso proviene de la ACE heredada de `luis2`, no modificada. La creación de este informe dentro de `backend\docs` confirma escritura. No se abrió ni guardó nada con Godot.
- `git status` sin cambios nuevos atribuibles a la operación.

## 7. Errores

Ninguno.

## 8. Riesgos pendientes de B00 (sigue PENDIENTE)

1. **Mismo usuario:** cualquier proceso bajo `luis2` puede seguir modificando código y leyendo secretos del árbol. Ninguna ACL lo impide.
2. **`backend/.env`:** contenido no revisado; rotar o retirar credenciales y mover secretos fuera de OneDrive (la copia de OneDrive/nube pudo haber contenido las credenciales antes de este cambio).
3. **`backend/` sin versionar** (0 archivos en Git): sin línea base de integridad.
4. **Carpeta de la clave JWT** aún inexistente; su ACL debe crearse con herencia cortada.
5. **Ejecución desde ubicación no escribible** (paquete de solo lectura, B00.3) o aceptación escrita del riesgo residual.
6. Los DENY inertes de `.git` y el `Everyone` DENY `DC` heredado se dejan; evaluación separada si se desea.
7. El origen de A y B sigue sin determinarse (B09); la retirada es reversible con el respaldo.

Recuperación (no necesaria): `icacls 'C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA' /restore 'C:\Users\luis2\AppData\Local\TwoSidesB00\acl-before.txt' /c`.

## 9. Estado

Corrección mínima aplicada y verificada. **B00 no se declara resuelto.** Detenido.
