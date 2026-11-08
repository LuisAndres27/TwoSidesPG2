# B02 / B03.1 — Contratos propuestos de identidad y sesión

Fecha: 2026-10-24. Versión 1, revisada en B03.1 e implementada localmente en B03.2 por autorización expresa del usuario. Los tres endpoints funcionan únicamente con repositorios sintéticos en memoria, sin Atlas, SQLite o credenciales reales. No son un despliegue de producción. Ver [diseño de identidad](IDENTITY_DESIGN.md) y [diseño y evidencia de seguridad](AUTH_SECURITY_DESIGN.md).

## Convenciones comunes

- JSON UTF-8, `Content-Type: application/json` para POST; TLS obligatorio fuera de las pruebas loopback. No enviar secretos por URL/query. Respuestas de estos recursos con `Cache-Control: no-store`.
- Propuesta: objeto plano con `schemaVersion: 1`, cuerpo máximo 8192 bytes, campos desconocidos rechazados. Rechazar compresión distinta de identity con 415, sin descomprimir. UUIDv4 canónico en minúsculas para IDs; credencial de 32 bytes CSPRNG codificados base64url sin padding (43 caracteres), verificada también por decodificación y recodificación canónicas. No recortar, normalizar ni cambiar mayúsculas de credenciales.
- `technicalAccountId` lo asigna el backend; el cliente no lo elige durante registro. `internalEmail` lo asigna el backend con formato `acct.<technicalAccountId>@identity.two-sides.invalid`; no admite correos del jugador y no se entrega correo.
- `localPlayerId`, `displayName`, progreso y estadísticas no forman parte de estos contratos. `credentialVerifier` nunca se admite como prueba de autenticación enviada por el cliente ni se devuelve.
- Tiempos remotos UTC ISO 8601. El servidor genera identificadores de correlación no sensibles; no incluir valores de solicitud en errores.
- Todos los ejemplos son sintéticos; los marcadores de credencial/token son deliberadamente inválidos y deben ser rechazados por un validador real. Los UUID ilustrativos no se generaron como cuentas reales.

Formato común de error:

```json
{
  "schemaVersion": 1,
  "error": {
    "code": "invalid_request",
    "message": "Solicitud no válida."
  },
  "requestId": "SYNTHETIC-REQUEST-ERROR"
}
```

No incluir stack, valores privados, detalles de repositorios ni existencia de cuentas en errores de sesión. La solicitud B03.2 autoriza aplicar los parámetros y controles descritos a pruebas locales. B06 definirá persistencia real; el repositorio en memoria no garantiza idempotencia tras reinicio ni debe recibir cuentas reales. No conectar Atlas para validar estas fases.

## POST /api/identity/register

### Propósito y solicitud

Registrar una identidad técnica sin pedir datos personales. No emite sesión: el cliente autentica después de persistir la asociación. Solicitud propuesta:

```json
{
  "schemaVersion": 1,
  "registrationId": "00000000-0000-4000-8000-000000000001",
  "credential": "SYNTHETIC_NOT_A_CREDENTIAL"
}
```

Validar tamaño/tipo/versionado/campos antes de operaciones costosas. `registrationId` no puede contener el nombre, correo personal o identificadores de hardware. Rechazar `technicalAccountId`, `internalEmail`, `credentialVerifier`, nombre o datos de guardado aportados en este cuerpo.

### Respuesta y autorización

Sin sesión previa; la credencial enviada por HTTPS prueba continuidad en reintentos, no legitimidad del usuario inicial. El backend genera cuenta y correo y almacena el verificador de la credencial, jamás la credencial recuperable.

```json
{
  "schemaVersion": 1,
  "registrationId": "00000000-0000-4000-8000-000000000001",
  "technicalAccountId": "00000000-0000-4000-8000-000000000003",
  "internalEmail": "acct.00000000-0000-4000-8000-000000000003@identity.two-sides.invalid",
  "registrationStatus": "REGISTERED",
  "createdAt": "2026-10-24T12:00:00Z",
  "updatedAt": "2026-10-24T12:00:00Z"
}
```

201 para creación confirmada; 200 para repetición válida, misma identidad y fecha de creación. Nunca devolver credenciales, hash ni token. El cliente verifica `registrationId` y la consistencia de campos antes del commit local. Si ya tiene una cuenta asociada diferente, no sobrescribirla.

### Idempotencia y concurrencia

Asociación remota duradera y única `registrationId` → cuenta, persistida atómicamente con el verificador. No expirar esta asociación mientras viva la cuenta. No usar una caché temporal como única protección contra duplicados. Definir tombstones y borrado sin reutilizar claves en B03/B06.

Si ya existe la clave, verificar la credencial presentada contra el verificador válido de esa cuenta antes de devolverla. Misma clave y credencial correcta: misma cuenta. Misma clave y credencial incorrecta: 409 genérico, sin revelar cuenta/email, sin reemplazar verificador ni crear cuenta nueva. Concurrencia: restricción única y reconciliación del conflicto verificando la credencial; solo la creación persistida puede devolver 201. No responder éxito antes de persistencia confirmada.

Cambiar nombre, reloj o reiniciar no genera otra clave. Tras timeout, conservar `REGISTRATION_PENDING` y repetir exactamente el par. Nunca se reclama una cuenta con solo `registrationId` o `localPlayerId`. El transporte TLS protege el secreto durante el primer registro; no existe secreto global dentro del juego para impedir que un tercero cree sus propias cuentas. Definir límites contra abuso antes de exponer registro públicamente.

Después de rotar/revocar una credencial, los reintentos con la anterior no pueden recuperar acceso. La asociación de idempotencia permanece, pero su prueba de posesión usa únicamente la credencial actualmente aceptada. El protocolo de rotación y recuperación queda pendiente de B03; no conservar un verificador inicial irrevocable que eluda la rotación.

### Errores y comportamiento offline

| HTTP | Código sanitizado | Acción del cliente |
|---|---|---|
| 400 | `invalid_request` | Conservar solicitud, pausar hasta corregir contrato; no regenerar identidad |
| 409 | `registration_conflict` | Pausar y revisar recuperación/asociación; no reclamar cuenta |
| 413 | `payload_too_large` | Conservar datos; corregir cliente |
| 415 | `unsupported_media_type` | Corregir formato sin cambiar solicitud persistida |
| 429 | `rate_limited` | Conservar y respetar `Retry-After` |
| 500 | `internal_error` | Resultado posiblemente desconocido; conservar el par y reintentar con espera |
| 503 | `temporarily_unavailable` | Conservar el par, reintentar con espera |

Sin internet no hay código HTTP: crear/cargar perfil y jugar localmente. No descartar eventos ni declarar fallido definitivamente un registro por timeout.

## POST /api/auth/session

### Propósito y solicitud

Obtener sesión técnica demostrando posesión de la credencial exclusiva, sin interacción adicional del jugador:

```json
{
  "schemaVersion": 1,
  "technicalAccountId": "00000000-0000-4000-8000-000000000003",
  "credential": "SYNTHETIC_NOT_A_CREDENTIAL"
}
```

Sin token previo; `technicalAccountId` identifica la cuenta pero no autentica por sí mismo. Verificar credencial con algoritmo seguro y política de intentos limitada. Cuenta desconocida, credencial incorrecta o revocada comparten HTTP 401 y mensaje genérico. Mitigar diferencias de tiempo/costo que faciliten enumeración; mecanismo exacto pendiente de implementación. Nunca permitir entrada con nombre o correo personal.

### Respuesta autenticada propuesta

```json
{
  "schemaVersion": 1,
  "technicalAccountId": "00000000-0000-4000-8000-000000000003",
  "authStatus": "AUTHENTICATED",
  "tokenType": "Bearer",
  "accessToken": "SYNTHETIC_NOT_A_TOKEN",
  "expiresIn": 900
}
```

HTTP 200. B03.2 aplica `expiresIn: 900`, duración absoluta de 15 minutos sin extensión por uso, y token opaco Bearer de 32 bytes CSPRNG (43 caracteres base64url canónicos). El marcador del ejemplo es deliberadamente inválido. El backend guarda solo su hash SHA-256 con cuenta, versión de credencial, creación y expiración; revocar elimina el registro, de modo que no se acepta de nuevo. Nunca devuelve hashes o tokens almacenados anteriormente. El token nuevo se entrega una sola vez al autenticar. No se usa JWT ni refresh token. Se admite nueva sesión mediante reautenticación por este endpoint; el cliente futuro conserva el token solo en memoria y lo usa exclusivamente para su cuenta.

### Validación, errores, idempotencia y offline

Además de 400/413/415/429/500/503 con el formato común, 401 devuelve `authentication_failed`: "No se pudo autenticar la identidad." No devuelve existencia, hash ni motivo específico. Un 403 `access_denied` se reserva para una identidad autenticada sin permiso para una operación, no para informar que existe una cuenta bloqueada en este login.

La creación de sesiones NO es idempotente: repetir una solicitud válida puede emitir otro token limitado a la misma cuenta. Nunca crea ni duplica cuenta, modifica guardados o confirma eventos. Tras respuesta perdida, reautenticar con espera; el token no recibido expira en 900 segundos como máximo, salvo revocación previa. Propuesta: hasta tres sesiones activas por cuenta, cuarta emisión revoca la más antigua de manera atómica. Cada recurso verifica expiración/revocación/cuenta activa/versión de credencial; no suponer que reintentar produce el mismo token. Descartar token local no revoca por sí solo una copia robada.

Offline: no solicitar sesión; `UNAUTHENTICATED` no impide jugar. Ante rechazo de un token en `/me`, invalidar token y reautenticar de forma acotada; ante rechazo definitivo de la credencial en este endpoint, conservar perfil/cola y pasar a recuperación. No volver a registrar otra cuenta para resolver un error de sesión.

## GET /api/identity/me

### Propósito, solicitud y autorización

Consultar la identidad correspondiente al token. Sin cuerpo; cabecera propuesta:

```text
Authorization: Bearer SYNTHETIC_NOT_A_TOKEN
```

Validar cabecera única, formato canónico del token opaco, hash, existencia, expiración, revocación, cuenta activa y `credentialVersion` vigente. Sin cuerpo ni query; los parámetros no admitidos producen 400. Derivar cuenta exclusivamente de esa autenticación. No aceptar un `technicalAccountId` alternativo ni buscar por nombre. La credencial permanente no se envía para esta consulta.

### Respuesta

```json
{
  "schemaVersion": 1,
  "technicalAccountId": "00000000-0000-4000-8000-000000000003",
  "internalEmail": "acct.00000000-0000-4000-8000-000000000003@identity.two-sides.invalid",
  "createdAt": "2026-10-24T12:00:00Z",
  "updatedAt": "2026-10-24T12:00:00Z"
}
```

HTTP 200; no nombre local, verificador, token nuevo, progreso ni eventos. 401 `authentication_required` para token ausente/inválido/vencido/revocado o identidad ya no válida, sin distinguir existencia; incluir desafío Bearer genérico sin detalles sensibles. 400 `invalid_request` para parámetros no admitidos; 429/500/503 con el formato común. Si en el futuro existe una operación sin permiso para una identidad válida, usar 403 `access_denied`, sin revelar otra cuenta.

GET es de lectura e idempotente respecto al estado de identidad, aunque `updatedAt` pueda cambiar por otras operaciones entre lecturas. Offline: omitir consulta y usar el perfil local; no interpretar ausencia de respuesta como eliminación remota. Si la respuesta contradice la asociación local, descartar token, pausar sincronización y revisar identidad, sin reasignar eventos.

## Ejemplos locales, estados y errores

Perfil local sintético, separado de los guardados y eventos:

```json
{
  "schemaVersion": 1,
  "localPlayerId": "00000000-0000-4000-8000-000000000002",
  "displayName": "Jugadora del Bosque",
  "remoteIdentity": {
    "registrationId": "00000000-0000-4000-8000-000000000001",
    "technicalAccountId": null,
    "internalEmail": null,
    "credentialRef": "SYNTHETIC-PROTECTED-REFERENCE",
    "registrationStatus": "REGISTRATION_PENDING"
  },
  "createdAt": "2026-10-24T12:00:00Z",
  "updatedAt": "2026-10-24T12:00:00Z"
}
```

Estado combinado sintético: registro confirmado, sin sesión y con eventos pendientes; no es una nueva respuesta de API:

```json
{
  "registrationStatus": "REGISTERED",
  "authStatus": "UNAUTHENTICATED",
  "syncStatus": "SYNC_PENDING",
  "pendingEventCount": 2
}
```

Error de sesión sintético:

```json
{
  "schemaVersion": 1,
  "error": {
    "code": "authentication_failed",
    "message": "No se pudo autenticar la identidad."
  },
  "requestId": "SYNTHETIC-REQUEST-AUTH"
}
```

La confirmación de registro o sesión no cambia `pendingEventCount`. Solo el contrato de sincronización de B07 podrá confirmar eventos. Los tres endpoints aquí descritos no abren SQLite ni contienen información de partidas.

## Aprobaciones y pruebas pendientes

La biblioteca Argon2 y los parámetros se revisaron y probaron en B03.2; ver resultados en `AUTH_SECURITY_DESIGN.md` y `PHASE_HISTORY.md`. Rotación/recuperación aún requieren contratos adicionales y no están implementadas como endpoints. Antes de cliente/B04: compatibilidad Godot C#, DPAPI y protocolo de persistencia cruzada. Antes de B06/B07: repositorios durables y esquema estadístico/idempotencia de eventos. HTTPS/proxy/límites compartidos deben verificarse antes de cualquier despliegue remoto.

Las pruebas ejecutadas en B03.2 cubren el contrato local, registro concurrente, expiración, revocación, acceso por identidad, validaciones y límites. Esto no prueba DPAPI, cliente offline ni persistencia real. El dominio técnico usa la reserva documentada por [RFC 2606](https://www.rfc-editor.org/rfc/rfc2606.html).

## Política de seguridad B03.1 aplicada localmente en B03.2

Fuente de parámetros y justificación: [AUTH_SECURITY_DESIGN.md](AUTH_SECURITY_DESIGN.md), secciones 3, 5 y 7. B03.2 aplica estos controles a los tres endpoints nuevos; las políticas de cliente, TLS remoto, rotación y recuperación siguen siendo diseño futuro.

| Endpoint | Límites propuestos antes de trabajo costoso | Prueba de acceso / resultado |
|---|---|---|
| Register | 20 intentos/minuto/IP; nuevas cuentas 5/hora/IP y 100/hora globales, con reserva atómica de cupo; reintento válido no consume otra creación | Clave única más verificación Argon2id de credencial vigente para repetir; 201 nuevo, 200 repetido, 409 conflicto |
| Session | 30 solicitudes/5 minutos/IP; 5 fallos/15 minutos por par IP/cuenta declarada, también para cuentas desconocidas | Credencial Argon2id; 200 y token nuevo; 401 genérico sin enumeración |
| Me | 120/minuto/token válido; sin token válido, 120/minuto/IP | Token opaco válido y cuenta vigente; 200 solo propia identidad; 401 genérico |

429 usa el formato de error común y `Retry-After` entero; 503 se usa para saturación de hashing/repositorios. Todos los trabajos Argon2 comparten máximo dos simultáneos y ocho en espera, espera máxima dos segundos. La propuesta Argon2id es `m=65536 KiB, t=3, p=1`, salt independiente de 16 bytes y salida 32 bytes, con medición pendiente. No mostrar PHC ni razones detalladas de autenticación.

Mantener `trust proxy` desactivado en pruebas directas. Los contadores deben estar acotados y caducar; no bloquear permanentemente una cuenta por un ID elegido por un atacante. Reglas distribuidas, topología proxy y privacidad de datos de red quedan pendientes antes de producción.

Detalles locales: máximo 1000 identidades por repositorio para acotar memoria; al llenarse devuelve 503, sin expulsar asociaciones idempotentes. Los límites almacenan hasta 10000 claves; vencimientos se depuran al consultar o ante presión de capacidad. Los tokens expirados se eliminan al acceder al repositorio. Todos los datos se pierden al reiniciar, incluidos cuentas, sesiones y cupos; ninguna garantía cruza procesos. El pool Argon2 predeterminado se comparte entre instancias del hasher en un proceso.

`displayName` y `localPlayerId` no se añadieron a register/session: enviarlos produce 400 por campo extra. B03.2 implementa una función separada de validación Unicode para uso y pruebas futuras, no un cambio silencioso del contrato ni transmisión del nombre. La credencial la conserva y envía el cliente; el backend nunca la reemplaza ni la devuelve en registro.

La API devuelve mensajes sanitizados estables sin acentos en esta implementación (`Solicitud no valida.`, `Se requiere autenticacion.`, etc.). Los códigos de error y estados HTTP de este documento son el contrato de máquina; el texto de ejemplos previos es ilustrativo y no debe usarse para decisiones del cliente.

HTTPS obligatorio para remoto con validación de certificados; solo loopback admite HTTP sin credenciales reales. Ninguna llamada online condiciona abrir SQLite o jugar. Al reconectar después de días offline, una cuenta registrada solicita sesión nueva; no vuelve a registrar ni pierde eventos. Propuesta de renovación con trabajo online pendiente: una sola solicitud por perfil, margen 60 segundos antes de expirar. Ante 401 de recurso, invalidar token e intentar reautenticación una vez con espera; ante 401 de la credencial, pausar y activar recuperación, sin bucles. Errores transitorios conservan estados/datos y respetan espera exponencial con variación y `Retry-After`.
