# B13 — Creación de la carpeta segura para la clave JWT (HECHA Y VERIFICADA; sin clave)

Fecha: 2026-11-01. Se crearon **solo** `C:\Users\luis2\AppData\Local\TwoSidesMainSecrets` y `…\TwoSidesMainSecrets\keys`. **No se creó `main-jwt.pem` ni ningún archivo de credenciales, no se generó ninguna clave, no se abrió ni modificó `backend/.env`, no se rotaron contraseñas, no se conectó Atlas, no se ejecutó bootstrap, no se activó `main`, no se ejecutó Godot y no se tocaron SQLite, partidas, C2Runtime, C.2/F.2, colecciones históricas ni las ACL del proyecto.** **B00 sigue pendiente.**

## 1. Verificaciones previas (todas correctas)

| Verificación | Resultado |
|---|---|
| Informe B12 y scripts `check-main-secrets-acl.ps1` / `main-secrets-acl-lib.ps1` revisados | OK |
| Usuario actual | `LAPTOP-F337QTKK\luis2` (SID `…-1001`), sesión no elevada |
| `%LOCALAPPDATA%` | `C:\Users\luis2\AppData\Local`; la ruta está dentro de él |
| Fuera de OneDrive y del repositorio | Sí |
| Existencia previa | `TwoSidesMainSecrets`, `keys` y `main-jwt.pem`: **no existían** |
| Cadena de padres (`Local` → `AppData` → `luis2` → `Users`) | 0 enlaces/puntos de reanálisis; ACL de `Local`: solo `SYSTEM`, `Administradores`, `luis2` con `(OI)(CI)(F)` |
| API disponible | PowerShell 5.1 con `Directory.CreateDirectory(string, DirectorySecurity)` |

## 2. Carpetas creadas

```
C:\Users\luis2\AppData\Local\TwoSidesMainSecrets
C:\Users\luis2\AppData\Local\TwoSidesMainSecrets\keys
```
Creadas con `[IO.Directory]::CreateDirectory(ruta, DirectorySecurity)`: el descriptor de seguridad protegido se entrega **en la propia creación**, por lo que no hubo ventana con permisos heredados. Si alguna ya hubiera existido, el script abortaba sin cambios.

## 3. Permisos NTFS aplicados (ambas carpetas)

SDDL (SID de máquina abreviado `<m>`): `O:<m>-1001 G:<m>-1001 D:P (A;OICI;FA;;;SY) (A;OICI;FA;;;BA) (A;OICI;FA;;;<m>-1001)`

| Elemento | Valor |
|---|---|
| Propietario | `LAPTOP-F337QTKK\luis2` |
| Herencia | **Deshabilitada** (`D:P`, `AreAccessRulesProtected = True`), sin copiar reglas heredadas |
| Reglas | 3 `Allow`, `FullControl`, `(OI)(CI)`: `SYSTEM` (`S-1-5-18`), `Administradores` (`S-1-5-32-544`, por SID conocido), `luis2` |
| `Everyone`, `Users`, los dos SID retirados, otras identidades | **Ninguna** |
| Reglas DENY | **Ninguna** |

No se modificó ninguna ACL de otra carpeta ni ningún propietario.

## 4. Resultado del comprobador (`check-main-secrets-acl.ps1`, solo lectura)

Código de salida **0**, `verdict: conforming`, `directoryFailures: []`, un elemento (`keys`, directorio, 0 bytes, `failures: []`). Comprobaciones:
1. Ambas carpetas existen. ✔
2. Herencia deshabilitada. ✔
3. Solo las tres identidades autorizadas. ✔
4. Ninguna identidad desconocida. ✔
5. Fuera de OneDrive. ✔
6. `luis2` accede: se creó, leyó y borró un archivo vacío de prueba (`.access-probe.tmp`, no es una clave) en `keys`; no quedaron restos. ✔
7. `main-jwt.pem` **no existe**. ✔
8. 0 archivos en el árbol de secretos. ✔

## 5. Pruebas offline

`main-secrets-storage` (SS01–SS07) y `main-jwt-persistence` (JP01–JP07): **14/14**. No se tocó la carpeta real; no hubo red.

## 6. Confirmación de que no se creó ninguna clave

El árbol contiene únicamente los dos directorios; ningún archivo. La clave JWT sigue sin existir.

## 7. Riesgos y requisitos pendientes de B00 (sigue PENDIENTE)

- El mismo usuario (`luis2`) y cualquier proceso bajo su token siguen pudiendo leer/escribir la carpeta y el código; la ACL protege frente a otras cuentas, no frente a ese usuario.
- `backend/.env`: sin revisar, rotar ni retirar (ningún código lo lee). Rotación de la contraseña de `twosides_backend` pendiente.
- `backend/` sin versionar; ejecución sin paquete de solo lectura o aceptación escrita del riesgo residual.
- Clave JWT por generar (`main-signing-key.js create`) y verificar con `check`; luego repetir `check-main-secrets-acl.ps1` con el archivo presente (debe seguir `conforming`).
- Pendientes de activación de `main`: HTTPS para Godot, SCRAM-SHA-256, rol más estrecho que `readWrite`, cuotas, eventos `Died`/`RequestRestart`.

Rollback (no necesario): las carpetas están vacías; eliminarlas es seguro y solo borra esas dos rutas (`Remove-Item` manual del propietario).

## 8. Estado

Carpetas creadas y conformes. **No se continúa con la generación de la clave JWT ni con el arranque de Express.** Detenido.
