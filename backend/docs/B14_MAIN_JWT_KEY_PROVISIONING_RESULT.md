# B14 — Aprovisionamiento de la clave JWT persistente de `main` (HECHO Y VERIFICADO)

Fecha: 2026-11-01. Se generó **una sola** clave privada RSA de 3072 bits en `C:\Users\luis2\AppData\Local\TwoSidesMainSecrets\keys\main-jwt.pem`. La clave privada **no se imprimió, copió ni registró en ningún sitio**; este informe contiene solo datos públicos. **No se modificó `backend/.env`, no se rotó la contraseña, no se conectó Atlas, no se ejecutó bootstrap, no se activó `main`, no se ejecutó Godot y no se tocaron SQLite, colecciones históricas, ACL fuera del destino, C2Runtime, C.2/F.2 ni el mecanismo RS256.** **B00 sigue pendiente.**

## 1. Verificaciones previas (todas correctas)

| Verificación | Resultado |
|---|---|
| Informes B06, B12, B13 | Revisados |
| `scripts/main-signing-key.js` | Revisado antes de usarlo: interfaz real `create <ruta-absoluta> <keyId>` / `check <ruta-absoluta> <keyId>`; `create` usa `generateKeyPairSync('rsa', 3072)` (CSPRNG de Node), escribe PKCS#8 PEM con `open('wx', 0o600)` (exclusivo, no sobrescribe), valida con el mismo cargador de `main`, imprime solo `keyId`, bits y huella pública |
| `check-main-secrets-acl.ps1` previo | `conforming`, exit 0 |
| Destino | Exactamente `C:\Users\luis2\AppData\Local\TwoSidesMainSecrets\keys\main-jwt.pem` |
| Archivo previo | No existía (0 archivos en el árbol de secretos) |
| Enlaces / permisos inesperados | Cadena de padres sin puntos de reanálisis; carpetas con solo `luis2`, `SYSTEM`, `Administradores` |

## 2. Generación

Comando único: `node scripts\main-signing-key.js create "<destino>" main-2026-11` → salida:
`{"mainSigningKey":"created","keyId":"main-2026-11","bits":3072,"publicFingerprintSha256":"811cd75b…9d8aec"}` (exit 0).
No se generó ninguna otra clave. No hubo copias temporales: el generador escribe directamente en el destino y no usa archivos intermedios. Un segundo `create` se rechazó (`file_exists_or_unwritable`, exit 1) y el hash del archivo quedó idéntico (no se sobrescribe).

## 3. Datos públicos para registrar

| Dato | Valor |
|---|---|
| **`MAIN_JWT_KEY_ID` recomendado** | `main-2026-11` |
| Longitud | 3072 bits (RSA, PKCS#8, RS256) |
| **Huella pública SHA-256 (SPKI)** | `811cd75bcf98dcb88c766f369431e3886f75188ad3fec59d8bbbbe0eab9d8aec` |
| Tamaño del archivo | 2 484 bytes |

Conviene guardar el `keyId` y la huella aparte (son públicos): sirven para comprobar más adelante que el archivo no cambió.

## 4. Validaciones de seguridad

1. `check` (cargador real de `main`) → `valid`, `main-2026-11`, 3072 bits, misma huella; no imprime contenido privado. ✔
2. Archivo regular, no enlace (`reparse = False`), PEM PKCS#8 sin cifrar aceptado por el cargador. ✔
3. ACL del archivo: propietario `luis2`; 3 reglas `Allow` `FullControl` **heredadas** de la carpeta protegida (`SYSTEM`, `Administradores`, `luis2`); sin `Everyone`, `Users`, los SID retirados ni DENY. ✔
4. `check-main-secrets-acl.ps1` con el archivo presente: `conforming`, exit 0, `failures: []` para `keys` y `keys\main-jwt.pem`; el comprobador no abrió el contenido. ✔
5. El árbol de secretos contiene solo `main-jwt.pem`. ✔
6. Fuera de OneDrive y del repositorio; no hay ningún `*.pem`/`*.key` en `...\PRUEBA` (excepto dependencias); `git status` no lista la clave. `.gitignore` ya ignora `*.pem` y `*.key`. ✔
7. Hash del archivo (solo para comprobar que no cambió tras el segundo `create`): sin cambios; el hash no se registra.

## 5. Pruebas offline

`main-jwt-persistence`, `main-secrets-storage`, `main-readiness`, `main-profile`: **31/31** (JP01–JP07 confirman persistencia tras reinicio simulado, rechazo con otra clave, expiración, manipulación y fallo cerrado; SS01–SS07 la política de rutas/ACL). Sin red; no se arrancó Express `main` ni se conectó Atlas.

## 6. Riesgos pendientes de B00 (sigue PENDIENTE)

- El mismo usuario (`luis2`) y cualquier proceso bajo su token pueden **leer la clave privada** y el código; la ACL solo protege frente a otras cuentas. Es el riesgo residual central de B00.
- **Sin copia de seguridad** de la clave: si se pierde o se borra, hay que generar otra con otro `keyId` (los jugadores se reautentican; no hay datos cifrados con ella). Decidir si se hace una copia cifrada fuera de OneDrive.
- `backend/.env` sin revisar ni retirar; contraseña de `twosides_backend` sin rotar; `backend/` sin versionar; ejecución sin paquete de solo lectura.
- Antes de activar `main`: HTTPS para Godot, SCRAM-SHA-256, rol más estrecho que `readWrite`, cuotas por jugador, eventos `Died`/`RequestRestart`, inspección de solo lectura reciente con veredicto `ready`.

Siguiente arranque de `main` (NO ejecutado, requiere autorización): `.\scripts\run-main-backend.ps1 -EnableMain -SigningKeyFile "C:\Users\luis2\AppData\Local\TwoSidesMainSecrets\keys\main-jwt.pem" -KeyId main-2026-11`.

## 7. Estado

Clave generada una sola vez, válida y protegida. **Express `main` no se activó.** Detenido.
