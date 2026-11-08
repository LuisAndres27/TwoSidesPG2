# B02 — Diseño del login invisible

Fecha: 2026-10-24. Estado: propuesta de diseño B02, precisada en B03.1, sin implementación. Los mecanismos, formatos y límites requieren aprobación antes de B03.2 o de la fase de cliente correspondiente. Ver [contrato de API](IDENTITY_API_CONTRACT.md), [seguridad B03.1](AUTH_SECURITY_DESIGN.md) y [decisiones](DECISIONS.md).

## Alcance e invariantes

El jugador solamente introduce un nombre visible en Godot. Puede jugar y cargar su partida sin internet, sin cuenta remota y con una sesión técnica vencida. La comunicación remota, cuando sea posible, ocurre en segundo plano; incluso en el primer inicio con conexión, esperar registro/autenticación no bloquea jugar.

La identidad técnica se genera inicialmente en el cliente como identificadores y una credencial propia; solo el backend reconoce la cuenta remota y verifica autenticación. El nombre no es único globalmente, contraseña, clave de búsqueda de cuentas ni prueba de recuperación. No se usa correo personal ni una contraseña compartida. No hay secretos de servidor dentro del ejecutable público.

## Seis escenarios

### A — Primer inicio con internet

1. Solicitar y validar `displayName`, crear perfil y `localPlayerId` persistente en SQLite.
2. Preparar `registrationId` y una credencial exclusiva con generador criptográfico del sistema en la futura implementación. Persistirlos de forma recuperable y protegida antes de cualquier envío remoto.
3. Intentar registro remoto con ese par. El backend asigna `technicalAccountId` e `internalEmail` y almacena el verificador de credencial.
4. Validar la respuesta y guardar la asociación del perfil. Solicitar una sesión técnica; nunca presentar formularios de correo/contraseña al jugador.
5. El jugador puede comenzar inmediatamente después del perfil local, mientras los pasos remotos avanzan de forma asíncrona. Las estadísticas se guardan primero localmente y se sincronizan cuando haya identidad y sesión válidas.

### B — Primer inicio sin internet

Crear nombre, perfil e identidad técnica local con el mismo procedimiento; no inventar una cuenta remota provisional. Jugar inmediatamente. SQLite conserva progreso y eventos pendientes asociados al perfil. Al volver la conexión, registrar exactamente la solicitud persistida, obtener sesión y enviar los eventos conservando sus IDs originales. Si aún no pudo protegerse una credencial, mantener `LOCAL_ONLY` y preparar registro posteriormente; no guardar secretos en claro como alternativa.

### C — Jugador existente

Recuperar perfil sin pedir el nombre de nuevo, abrir guardado local y jugar. Revisar la cola sin bloquear. Si hay conexión y credencial disponible, registrar si aún está pendiente o autenticar si ya está registrado. No crear una nueva identidad al vencer un token. Una pérdida de conexión no borra registro remoto ni progreso.

### D — Cambio de nombre

Validar y guardar el nuevo `displayName` solo en el perfil local. Conservar `localPlayerId`, `registrationId`, `technicalAccountId`, credencial, guardados, eventos y asociaciones. No hay endpoint remoto de cambio de nombre en esta propuesta porque el nombre no se exporta. Dos nombres iguales no fusionan perfiles ni cuentas.

### E — Fallo de red o del backend

Mantener juego y guardados locales. Conservar credencial, solicitud y eventos pendientes. Un timeout de registro es un resultado desconocido: reintentar la misma solicitud, no crear otro `registrationId`. Un error transitorio de sesión conserva la identidad registrada. Un 401 de sesión pausa los intentos automáticos y conduce a recuperación; un 401 de un recurso protegido puede deberse solo a token vencido y permite intentar reautenticación una vez antes de escalar. Aplicar espera acotada con variación aleatoria y respetar `Retry-After`; no hacer bucles de reintento rápidos. El protocolo estadístico posterior confirmará individualmente eventos persistidos, sin descartarlos por un fallo.

### F — Reinstalación o pérdida de datos

Si sobreviven perfil y credencial protegida utilizable por el mismo contexto Windows, se podrá intentar retomar la identidad; verificar asociación antes de enviar eventos. Si solo sobrevive SQLite o el nombre, no hay prueba suficiente para recuperar la cuenta. Reinstalar el juego, Windows o cambiar de PC son casos diferentes y no se promete que el material protegido sea portable.

Opciones futuras pendientes: código de recuperación de alta entropía con verificador remoto y uso controlado, o exportación cifrada explícita protegida por el jugador. Ninguna requiere correo personal. Definir emisión, custodia, revocación, limitación de intentos y rotación antes de ofrecerlas. Si no se aprueba ninguna opción, declarar claramente que perder la credencial impide recuperar la cuenta anterior. Nunca reclamar identidad escribiendo el nombre.

Recuperar cuenta no recupera guardados: Atlas no almacena progreso. Conservar los guardados locales disponibles aunque la cuenta no sea recuperable. Crear otra identidad debe ser una acción explícita con reglas aprobadas de asociación; no reasignar ni reenviar automáticamente eventos ya ligados a la cuenta anterior.

## Modelo conceptual y separación de almacenamiento

| Campo | Autoridad y almacenamiento futuro | Regla |
|---|---|---|
| `localPlayerId` | Cliente, SQLite | UUID aleatorio persistente propuesto; correlación local, no credencial; no se envía en estos tres contratos |
| `displayName` | Cliente, SQLite | Etiqueta editable; no se exporta por defecto |
| `registrationId` | Cliente y backend | UUID aleatorio propuesto, distinto de `localPlayerId`; clave de idempotencia, no secreto |
| `technicalAccountId` | Backend; asociación en SQLite | UUID opaco generado por backend propuesto; inmutable para la cuenta |
| `internalEmail` | Backend; copia local opcional | Propuesta `acct.<technicalAccountId>@identity.two-sides.invalid`, único y sintético; no se usa para enviar correo ni para recuperar |
| `credentialVerifier` | Backend exclusivamente | Verificador mediante hash de contraseña seguro con salt individual y parámetros versionados; no se devuelve ni se guarda como sustituto de la credencial del cliente |
| Credencial original | Almacén protegido Windows; memoria transitoria | Aleatoria y exclusiva por perfil; propuesta 32 bytes aleatorios codificados base64url, nunca derivada del nombre |
| `credentialRef` | SQLite | Referencia al material protegido, no su texto original ni su verificador remoto |
| `registrationStatus` | SQLite, reconciliado con respuesta del backend | `LOCAL_ONLY`, `REGISTRATION_PENDING`, `REGISTERED`, `RECOVERY_REQUIRED` |
| `createdAt`, `updatedAt` | Cada autoridad sobre su entidad | UTC ISO 8601; tiempos locales no prueban identidad ni orden remoto |

`identityId` en documentos iniciales denota conceptualmente `technicalAccountId`; los nuevos contratos usan únicamente este último nombre. El nombre `registrationStatus` representa el ciclo de identidad, incluido el estado excepcional de recuperación; no incluye autenticación ni sincronización.

Entidades separadas: perfil local; asociación remota; material secreto protegido; sesión técnica en memoria; partidas/guardados SQLite; eventos estadísticos inmutables SQLite; cola/confirmaciones SQLite. Atlas solo recibe identidad técnica mínima, verificador y estadísticas cuando sus fases se implementen. No se transmiten guardados, nombre visible, identificadores de hardware ni datos personales adicionales.

## Protección local y consistencia ante caídas

Propuesta precisada en B03.1: DPAPI `CurrentUser`, con blob por perfil bajo `%LOCALAPPDATA%\TwoSides\Identity\<localPlayerId>\credential.bin`, fuera del repositorio/OneDrive; no se crea esa ruta en esta fase. No escoger `LocalMachine` como sustituto silencioso, ni incrustar una clave global en C#. Verificar ubicación no redirigida, compatibilidad con Godot y formato versionado antes de implementar. DPAPI protege datos en reposo; no evita acceso por malware con el mismo contexto de usuario, depuración o sistema comprometido. Tampoco sustituye respaldo/recuperación.

No hay transacción distribuida entre SQLite y el almacén Windows. Orden propuesto: (1) persistir y comprobar material protegido bajo una referencia estable; (2) guardar referencia y `registrationId` en una transacción SQLite; (3) habilitar envíos. Un fallo entre 1 y 2 deja material huérfano que debe reconciliarse, no una petición remota sin credencial recuperable. No enviar hasta confirmar ambos pasos. No reemplazar una credencial cuando la solicitud podría haber llegado al servidor.

Tras respuesta válida, guardar en una transacción local la asociación remota y `REGISTERED`; solo entonces solicitar sesión. Si se cae antes de ese commit, repetir registro con el mismo par devuelve la misma cuenta. Si se pierde una sesión recibida, reautenticar sin volver a registrar. La pérdida de un secreto asociado a una petición enviada conduce a `RECOVERY_REQUIRED`; nunca a regeneración silenciosa.

## Máquinas de estados independientes

### Identidad: `registrationStatus`

| Origen | Evento y condición | Destino | Persistencia y recuperación |
|---|---|---|---|
| Sin perfil | Nombre válido, perfil creado | `LOCAL_ONLY` | Persistir perfil y guardado; jugar sin red |
| `LOCAL_ONLY` | Credencial protegida y solicitud persistidas | `REGISTRATION_PENDING` | Guardar `registrationId`/referencia antes de enviar |
| `REGISTRATION_PENDING` | Respuesta 201 o 200 válida, misma solicitud | `REGISTERED` | Commit atómico de cuenta/email/estado; luego autenticar |
| `REGISTRATION_PENDING` | Timeout, desconexión, 429 o 503 | Igual | Conservar solicitud y secreto; reintentar el mismo par |
| `REGISTRATION_PENDING` | Conflicto, asociación contradictoria o secreto perdido tras posible envío | `RECOVERY_REQUIRED` | Pausar registro y conservar perfil/eventos; no reclamar ni sustituir cuenta |
| `REGISTERED` | Token vencido o fallo transitorio de red | Igual | Solo cambia la sesión; guardar progreso y cola |
| `REGISTERED` | Pérdida de credencial o rechazo definitivo de credencial | `RECOVERY_REQUIRED` | Preservar asociación previa y datos locales |
| `RECOVERY_REQUIRED` | Credencial recuperada por procedimiento aprobado | `REGISTERED` o `REGISTRATION_PENDING` | Reconciliar cuenta o solicitud original con prueba de posesión; sin fusiones por nombre |

Antes de cualquier posible envío, un fallo de preparación mantiene `LOCAL_ONLY`; un 400/413/415 de contrato conserva los datos y pausa reintentos hasta corregir el cliente. Un 409 o respuesta que declara otra cuenta no se trata como éxito. Validar versión, `registrationId`, tipos y consistencia de cuenta/email antes del commit.

### Sesión técnica: `authStatus`

`UNAUTHENTICATED` → `AUTHENTICATING` → `AUTHENTICATED` tras obtener y validar sesión. Error transitorio vuelve a `UNAUTHENTICATED` con espera. Expiración/reinicio del proceso/401 de un recurso protegido invalida el token en memoria y conduce a `UNAUTHENTICATED`; reintentar sesión con la credencial única si está disponible. Rechazo definitivo de esa credencial lleva identidad a `RECOVERY_REQUIRED`. `AUTHENTICATED` no es un estado persistente de registro ni requisito para jugar. Sin registro confirmado no puede haber sesión válida.

### Cola: `syncStatus`

`IDLE` → `SYNC_PENDING` al registrar eventos; `SYNC_PENDING` → `SYNCING` solo con red, asociación confirmada y sesión válida; `SYNCING` → `IDLE` al confirmar todos o → `SYNC_PENDING` si quedan pendientes o hay fallo. Identidad `REGISTERED` y cola `SYNC_PENDING` pueden coexistir sin sesión. Tras reinicio, recuperar trabajo no confirmado como pendiente. Conservar ID de evento y cuenta de destino; una confirmación de identidad/sesión no confirma eventos estadísticos. Transacciones de la cola se especificarán en B05/B07.

## Validación propuesta de `displayName`

- Cadena Unicode bien formada; eliminar espacios Unicode al inicio/final y normalizar a NFC.
- Entre 1 y 32 elementos de texto visibles/grupos grafémicos; techo adicional de 256 bytes UTF-8 para acotar entrada.
- Rechazar caracteres de control, saltos de línea, separadores de línea/párrafo, sustitutos no emparejados y controles bidireccionales de presentación. Rechazar nombres compuestos solo por espacios o caracteres invisibles.
- Admitir letras de distintos alfabetos, marcas combinantes, números, espacios internos, apóstrofos, guiones y emoji. No prohibir indiscriminadamente todos los caracteres de formato: algunos participan en escrituras o emoji legítimos. Definir una lista precisa y corpus Unicode compartido antes de implementación.
- No exigir unicidad global ni cambiar a minúsculas para autenticar. Mostrar como texto, con escape propio del motor y sin interpretar marcado.

Los límites y el corpus Unicode son propuestas, no validadores implementados. El backend no valida un nombre que no recibe; si se aprueba exportarlo en el futuro, versionar el contrato y compartir reglas cliente/servidor.

## Seguridad y límites

HTTPS y validación de certificados en el cliente para despliegues futuros. La posesión de la credencial aleatoria demuestra continuidad del registro; no demuestra identidad civil ni que el cliente sea una copia legítima. Un atacante puede distribuir solicitudes de nuevas cuentas desde un cliente público: el ejecutable no puede custodiar un secreto universal de admisión. Proponer límites de creación, tamaño y verificación costosa, cuotas y respuestas sin filtraciones; política precisa pendiente de B03/B10.

No registrar cuerpos de registro/sesión, cabeceras Authorization, credenciales, tokens ni verificadores. Un identificador de solicitud no es una credencial. No exportar progreso y no fiarse de estadísticas de cliente como sistema antitrampas. El riesgo ACL desconocido de B00 sigue abierto: B02 no usa secretos reales, cambia permisos ni demuestra que se haya resuelto.

## Precisiones B03.1 — propuestas aún no implementadas

Cada perfil nuevo de cada instalación lógica obtiene una credencial exclusiva; no compartir entre perfiles/instalaciones. Una reinstalación con datos conservados puede retomar el perfil; migración a otro equipo requiere recuperación y rotación, no garantiza copiar DPAPI. No se agrega `installationId` porque no aporta una finalidad mínima necesaria y no se intenta probar un PC físico o una licencia.

Se propone Argon2id v19, `m=65536 KiB, t=3, p=1`, salt nuevo de 16 bytes y salida de 32 bytes; capacidad y mediciones pendientes. Sesión opaca de 32 bytes aleatorios, solo hash SHA-256 en backend, TTL absoluto 900 segundos y hasta tres sesiones activas por cuenta. Validar versión de credencial y revocación en cada recurso. Renovar con la credencial protegida por `/session`, sin JWT ni refresh token; una instalación offline juega y reautentica al reconectar. El cierre local no garantiza revocar un token robado.

La rotación futura conserva cuenta y eventos, incrementa versión y revoca sesiones; un reintento nunca admite la credencial vieja revocada. La recuperación futura opcional por código guardado por el jugador no necesita correo personal ni rescata progreso desde Atlas. Su protocolo completo y los endpoints adicionales necesitan autorización propia. Ver el diseño de seguridad para fallos, parámetros, controles de abuso, riesgos y pruebas todavía pendientes.

## Evidencia requerida en fases futuras

Casos aún NO ejecutados: nombres duplicados con cuentas distintas; mismo registro concurrente devuelve una cuenta; mismo ID con otra credencial no permite reclamarla; caída antes/después de cada persistencia local/remota; secreto perdido; credencial rotada; token vencido sin bloquear guardado; nombre modificado sin nueva cuenta; recuperación sin correo personal y sin reasignación de eventos. B02 solo revisa el diseño y ejecuta las regresiones existentes de B01.

## Referencias técnicas consultadas

El uso de `.invalid` como dominio reservado se apoya en [RFC 2606](https://www.rfc-editor.org/rfc/rfc2606.html). La propuesta de protección por usuario se basa en [ProtectedData de Microsoft](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata); la segmentación de nombres debe evaluar [StringInfo](https://learn.microsoft.com/en-us/dotnet/api/system.globalization.stringinfo). Estas referencias no equivalen a una selección de bibliotecas, parámetros ni código implementado.
