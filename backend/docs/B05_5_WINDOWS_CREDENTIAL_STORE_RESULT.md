# B05.5 Etapa 5 — Almacén protegido de credenciales en Windows (DPAPI)

Continúa `B05_5_GODOT_HTTP_OFFLINE_RESULT.md`, `B05_5_GODOT_WORKER_INTEGRATION_RESULT.md` y `B05_5_GODOT_RUNTIME_VALIDATION_RESULT.md`. No se reconstruyó el cliente HTTP, SQLite, el Outbox ni `SyncHost`. Sin Atlas, sin `backend/.env`, sin C.2/F.2, sin cambios de ACL/propietarios/C2Runtime. B00 continúa pendiente.

**Alcance de lo probado:** pruebas automáticas contra el Express `offline-test` real (127.0.0.1) con cuentas sintéticas, SQLite desechables y una carpeta de credenciales desechable. **No se ejecutó dentro de Godot en esta etapa** (ver 8).

## 1. Diseño y ubicación

`DpapiSyncSecretStore` (`local-persistence/sync-http/DpapiSyncSecretStore.cs.txt`) implementa `ISyncSecretStore` con `CryptProtectData/CryptUnprotectData` (P/Invoke a `crypt32.dll`, sin paquetes nuevos), ámbito **CurrentUser**, sin interfaz de usuario, sin claves incrustadas: la clave la deriva Windows de la cuenta que ha iniciado sesión.

- **Un archivo por vínculo** (jugador local + instalación + generación): `<carpeta>/<32 primeros hex de SHA-256(vínculo)>.cred`. El contenido es **solo el blob DPAPI**; ni el id del jugador aparece en claro.
- **Dentro del blob** (JSON): `v`, `player`, `installation`, `generation`, `registrationId`, `account` (id técnico), `credential`. Se guardan juntos para poder reiniciar sin registrar de nuevo.
- **Entropía DPAPI** = texto fijo + vínculo, y además el documento descifrado se compara con el vínculo pedido: un blob copiado al nombre de otro jugador/instalación/generación se rechaza.
- **Ubicación en el juego:** `user://sync-credentials` (carpeta de datos de usuario de Godot), solo cuando la sincronización local de pruebas está activa **sin** el modo sandbox. En modo `--two-sides-test-storage=sandbox` las credenciales quedan **solo en memoria** (no se crea nada persistente junto a datos desechables). No se toca SQLite ni el contenido de las operaciones Outbox.
- Escritura atómica (temporal + `Move`), `FlushToDisk`, tamaño máximo 8 KiB, se rechazan enlaces (reparse points) y rutas no absolutas.

## 2. Cierre en falla (fail closed)

Si el archivo existe pero no se puede usar (otro usuario/equipo, corrupto, truncado, manipulado, demasiado grande, enlace, vínculo distinto) el vínculo queda **no disponible**:
- el almacén **no lo sobrescribe** (`WriteCredential` lanza `CREDENTIAL_UNAVAILABLE`);
- `SyncSessionManager` devuelve `CredentialUnavailable` **antes de cualquier petición**: no hay registro de una cuenta nueva, ni login, ni lote;
- las operaciones quedan `retryable_failure` (código `remote_unavailable`) y el pase informa `SYNC_CREDENTIALUNAVAILABLE`; el juego sigue guardando en local.
- Un fallo del almacén al escribir (disco, permisos) produce el mismo resultado y nunca interrumpe la jugabilidad (todo corre en el worker, no en el hilo principal).
- La única salida es `Forget()` explícito (y, hasta que exista el contrato del backend de la sección 6, una cuenta ya registrada para ese jugador/instalación **no podrá recuperarse** desde el cliente).

## 3. Ciclo de vida de las credenciales

| Momento | Qué ocurre |
|---|---|
| Primer arranque con sync | Genera 32 bytes aleatorios (secreto), guarda secreto + `registrationId` **antes** de registrar; registra; guarda `account`. |
| Respuesta de registro perdida | El `registrationId` persistido se reutiliza: el registro es idempotente por ese id (`createIfAbsent`/`findRegistration` en el backend). |
| Reinicio del juego | Lee el almacén; con `account` conocido **solo hace login**; JWT nuevo cada sesión. No crea cuenta nueva. |
| Token vencido (15 min) | Renovación = login con la credencial guardada (el contrato real no tiene token de refresco). 401 → una repetición transparente. |
| Servidor reiniciado sin estado (offline-test) | Login 401 → re-registro **una vez** con la misma credencial y un `registrationId` nuevo. |
| Logout (`GameApplicationContext.Logout()`) | Detiene el worker; **conserva** la credencial: borrarla dejaría inalcanzable la cuenta existente. |
| Cierre de sesión **en este dispositivo** | `GameApplicationContext.SignOutAndForgetSyncCredential()` → detiene el worker, sobrescribe el archivo con bytes aleatorios y lo borra (mejor esfuerzo; SSD/OneDrive pueden conservar copias). No hay botón: la llamada queda disponible para una pantalla futura. |
| Cambio de jugador | Cada jugador/instalación usa su propio archivo; el gestor de sesión es nuevo y no hereda JWT. |

## 4. Archivos modificados

| Archivo | Cambio |
|---|---|
| `local-persistence/sync-http/DpapiSyncSecretStore.cs.txt` | **Nuevo.** |
| `local-persistence/sync-http/SyncSessionManager.cs.txt` | `ISyncSecretStore` +`ReadRegistrationId/WriteRegistrationId/IsUnavailable` (implementación por defecto); el gestor lee/guarda `registrationId`, comprueba `IsUnavailable` y trata errores del almacén como `CredentialUnavailable`. |
| `local-persistence/sync-http/SyncHttpTransport.cs.txt` | `SyncHttpFailure.CredentialUnavailable`. |
| `local-persistence/sync-http/SyncWorkerLifecycle.cs.txt` | `ForgetCredentialAsync()`. |
| `integration/sqlite/GameSyncHost.cs` | Elige el almacén (DPAPI o memoria en sandbox); `ForgetCredentialAsync()`. |
| `scripts/network/GameApplicationContext.cs` | `SignOutAndForgetSyncCredential()` (+`using System.Threading.Tasks`). |
| `local-persistence/sync-http-tests/SyncHttpChecks.cs.txt` | +8 comprobaciones; carpeta temporal propia; estabilidad de una prueba de la etapa 3 (avance de reloj). |

## 5. Pruebas aprobadas (33/33 en `run-sync-http-checks.ps1`)

1. **Guardado protegido:** ni credencial, cuenta, `registrationId`, ids de jugador/instalación ni etiquetas aparecen en claro (UTF-8 ni UTF-16); un archivo por vínculo; sin temporales.
2. **Reinicio simulado:** un almacén nuevo sobre la misma carpeta recupera todo; otra instalación o generación del mismo jugador no ve nada.
3. **Separación:** jugadores A y B con valores y archivos distintos; el blob de A copiado al nombre de B se rechaza.
4. **Secreto corrupto/truncado/vacío/gigante/manipulado:** no disponible, no se sobrescribe, el otro jugador no se ve afectado, `Forget` es la salida.
5. **Corrupto + sincronización:** 0 peticiones al servidor (sin registro, login ni lote), archivo intacto, operaciones `retryable_failure`, el guardado local continúa.
6. **Reinicio con cuenta existente:** 1 solo registro en dos ejecuciones, ≥2 logins, JWT distinto, misma credencial, operaciones previas intactas y mismos `operationId`.
7. **Token vencido:** reloj +20 min → login (no registro); gestor nuevo tras "reinicio" → solo login; el JWT renovado es aceptado.
8. **Servidor desconectado y de vuelta (con estado vacío):** operaciones sobreviven, misma credencial y un solo archivo, sincronización recuperada.
9. **Logout vs. olvidar:** logout conserva; `ForgetCredentialAsync` detiene primero y borra solo la credencial de ese jugador; el Outbox queda intacto.
10. **Sin secretos en diagnósticos, SQLite ni carpeta de credenciales en claro;** `payload_hash` y envelope de las operaciones idénticos.

Regresiones: SQLite 43/43, infraestructura 28/28, suites del juego (outbox 64, activación 28, observador 31, reconciliación 51), launcher 4/4, el juego compila (0 errores). `.work/databases` y la carpeta temporal de credenciales quedan vacías.

## 6. Limitaciones de DPAPI

- Protege frente a lectura desde otra cuenta de Windows, otro equipo o copia offline del archivo. **No protege frente a procesos que ya ejecutan código con la misma cuenta de Windows** (pueden llamar a `CryptUnprotectData` con la misma entropía, que no es secreta), ni frente a malware con esa sesión, ni frente a un administrador que suplante al usuario.
- Reinstalar Windows, cambiar contraseña con reinicio forzado o restaurar el perfil pueden hacer indescifrable el blob → estado "no disponible" (por diseño).
- El secreto vive en cadenas administradas (.NET) mientras el proceso está activo; no se puede borrar la memoria de forma determinista.
- El borrado seguro es de mejor esfuerzo (SSD, wear leveling, OneDrive).
- Mientras el juego no cifra el propio SQLite, esta mejora protege solo la credencial de sincronización.

## 7. Requisitos pendientes del backend real

El contrato JWT v2 actual no ofrece, y **no se inventó**:
1. **Refresco de sesión:** hoy solo `POST /technical/sessions` con la credencial → `accessToken` + `expiresIn`. Un token de refresco rotatorio evitaría usar la credencial larga en cada renovación.
2. **Recuperación o rotación de credencial** para una cuenta ya registrada cuando el cliente la perdió o quedó inservible (hoy un segundo registro del mismo jugador/instalación no es posible en un servidor con estado), incluida la política de vinculación (generación>1: el cliente solo soporta `bindingGeneration==1`).
3. **Revocación/cierre de sesión en el servidor** (no existe un `DELETE` de sesión ni de cuenta técnica).
4. **Confirmación de la idempotencia del registro por `registrationId` en v2 sobre el almacén real** (verificada solo en repositorios sintéticos).
5. Política de límites/bloqueo por intentos de login y su respuesta (`429` con `Retry-After`) bajo Atlas.

## 8. Pendientes de prueba manual (en el motor)

- El almacén DPAPI no se ejercitó dentro de Godot: el modo sandbox usa memoria. Probarlo en el motor exige sincronizar con el guardado de ejecución normal (`--two-sides-sync-local-test` sin sandbox), lo que **no se hizo** ni se recomienda sin aprobación aparte, porque implica ejecutar sobre una partida protegida.
- Verificar que `user://sync-credentials` se crea con permisos del usuario y que `SignOutAndForgetSyncCredential()` se llama desde alguna pantalla (aún no existe).

## 9. Próximo paso hacia MongoDB Atlas (sin autorización todavía)

1. Confirmar la rotación de la contraseña de `twosides_integration_test`.
2. Definir el perfil de backend `integration` (fábrica de dependencias, claves JWT, políticas) y los contratos faltantes de la sección 7.
3. Prueba manual en el motor con almacenamiento y carpeta de credenciales desechables.
4. Solo entonces, validación contra Atlas con autorización expresa y límites explícitos.
