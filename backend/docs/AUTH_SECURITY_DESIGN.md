# B03.1 — Seguridad de la autenticación técnica

Fecha: 2026-10-24. Ámbito exclusivo: copia `C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA`. Las secciones 1–10 conservan el diseño B03.1 y sus decisiones propuestas. B03.2 autoriza e implementa el alcance LOCAL EN MEMORIA descrito en la sección 11, con datos sintéticos; DPAPI cliente, rotación, recuperación, persistencia y despliegue remoto siguen sin implementación. No confundir pruebas locales con seguridad de producción validada.

## 1. Revisión previa e incompatibilidades registradas

Antes de modificar documentos se revisaron los siete documentos existentes y se registraron estos ajustes:

1. B02 no eligió JWT/sesión opaca y mostró `expiresIn: 300` solo como ejemplo. B03.1 propone sesión opaca y 900 segundos. Cambiar el ejemplo documental no cambia una API desplegada: estas rutas aún no existen.
2. B02 definió secreto por perfil; la nueva solicitud exige exclusividad por instalación. Se precisa secreto nuevo por perfil creado en cada instalación lógica; nunca compartirlo entre instalaciones o perfiles nuevos. Restaurar/migrar una identidad será un proceso de recuperación y rotación separado, no clonación automática de secretos.
3. B03 figuraba como fase única de implementación. Se divide en B03.1 documental y B03.2 futura con autorización independiente. El diseño de recuperación no implica implementar recuperación en B03.2.
4. La propuesta inicial de renovación rotatoria no estaba aprobada. Para esta API única y cliente nativo, se propone reautenticación con credencial protegida, sin refresh token adicional. Se conserva como alternativa futura que requeriría otro contrato.

No cambian D01–D10: nombre visible solamente, identidad técnica con correo interno y contraseña única hasheada, progreso SQLite, estadísticas e identidad mínima en Atlas, internet opcional y API como intermediaria. El bloqueo ACL de B00 continúa abierto.

## 2. Modelo propuesto de identidad

| Elemento | Decisión propuesta | Autoridad / secreto |
|---|---|---|
| `localPlayerId` | UUIDv4 criptográficamente aleatorio, persistente en SQLite por perfil local | Cliente; no secreto, no se envía para autenticar |
| `registrationId` | Otro UUIDv4 aleatorio, persistido antes de enviar, estable durante reintentos | Cliente; idempotencia, no propiedad |
| `technicalAccountId` | UUIDv4 aleatorio generado por backend al crear cuenta | Backend; no secreto, no sustituye credencial |
| `displayName` | Editable, Unicode y no único; reglas B02 siguen propuestas | Solo local; no se utiliza para buscar, reclamar ni recuperar cuenta |
| `internalEmail` | `acct.<technicalAccountId>@identity.two-sides.invalid` | Backend; único, sintético, sin correo saliente, sin correo personal |
| Credencial técnica | 32 bytes CSPRNG exclusivos por perfil/instalación, base64url canónico sin padding: 43 caracteres | Cliente protegido; efímera en memoria del backend durante verificación |
| `credentialVerifier` | Argon2id con salt independiente y versión de política | Solo backend; nunca respuesta de API |
| `credentialVersion` | Contador monotónico de cambios de credencial | Backend; invalida sesiones antiguas |
| `createdAt`, `updatedAt` | UTC ISO 8601, generados por la autoridad correspondiente | No son pruebas de identidad |

No se necesita un `installationId` adicional: no hay licencia ni correlación entre perfiles que lo justifique. Los identificadores no codifican hardware, usuario Windows o nombre visible. En la futura implementación usar generadores del sistema, por ejemplo `RandomNumberGenerator` en C# y `crypto.randomUUID`/`randomBytes` en Node, sin algoritmos aleatorios caseros. Nunca derivar la contraseña de un UUID, nombre, reloj, MAC o secreto del ejecutable.

Una instalación nueva sin datos recibe material nuevo; una reinstalación que conserva el perfil y material protegido puede continuar la identidad anterior. No se promete detectar clonación del sistema o demostrar un PC físico único. No se soporta acceso simultáneo multidispositivo por compartir una credencial: el diseño futuro de migración deberá rotarla.

## 3. Argon2id: propuesta concreta y recursos

| Parámetro | Valor propuesto para medir en B03.2 |
|---|---|
| Variante / versión | Argon2id / 0x13 (19 decimal) |
| Memoria `m` | 65536 KiB = 64 MiB por operación |
| Pasadas `t` | 3 |
| Paralelismo `p` | 1 |
| Salt | 16 bytes CSPRNG nuevos por verificador |
| Salida | 32 bytes |
| Persistencia | PHC completo con variante, versión, parámetros, salt y hash; política/versión de credencial separadas |

La memoria de 64 MiB y tres pasadas se inspiran en la alternativa de memoria reducida de [RFC 9106, sección 4](https://www.rfc-editor.org/rfc/rfc9106.html#section-4), cuyo perfil completo usa `p=4`. Esta propuesta usa `p=1` para acotar CPU por petición; **no es una reproducción exacta de ese perfil**. También supera los valores de memoria/pasadas mínimos indicados por [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). No se deduce un tiempo de ejecución sin medir en el servidor real.

Proponer máximo dos operaciones Argon2 simultáneas por proceso y ocho peticiones en espera, con espera máxima de dos segundos antes de 503 `temporarily_unavailable`. Son al menos 128 MiB para dos trabajos, más runtime, biblioteca y otros datos. Limitar creación, verificación real y verificación ficticia bajo el mismo presupuesto. Nunca bloquear el bucle de eventos con hashing síncrono ni permitir una cola ilimitada. Límites globales de un despliegue con varios procesos requieren coordinador externo y capacidad agregada; no multiplicar inadvertidamente el presupuesto.

En B03.2, si se autoriza instalar una biblioteca, verificar su procedencia, compatibilidad Node/Windows, API asíncrona y scripts nativos. Medir latencia p50/p95, RAM y rendimiento con dos trabajos concurrentes; objetivo inicial p95 <=500 ms por operación sin tiempo de cola. Si no se cumple, registrar resultados y proponer ajuste o más capacidad, sin reducir parámetros silenciosamente. No hay benchmark ejecutado en B03.1. Antes de producción revisar hardware, carga, amenaza y dependencias.

El backend valida primero el formato canónico de 43 caracteres y decodificación exacta de 32 bytes; compara mediante la biblioteca de hashing, no con `===` sobre hashes. Las cuentas desconocidas usan una verificación ficticia equivalente para reducir enumeración temporal, dentro de los mismos límites. El verificador ficticio se podrá preparar solo al implementar, nunca se genera en B03.1. No prometer tiempos indistinguibles de extremo a extremo sin medición.

No añadir pepper en esta propuesta: exigiría otro secreto de servidor y custodia aún no definida. No guardar contraseña cifrada recuperable en el backend. Salt, hash y parámetros no son credenciales de acceso y jamás se devuelven. El algoritmo no convierte el cliente en una licencia ni impide trampas.

Actualizar parámetros mediante rehash después de verificar una credencial válida, usando salt nuevo y cambio atómico condicionado a la versión leída; no invalidar una rotación concurrente. No aceptar parámetros de coste suministrados por el cliente.

## 4. DPAPI y cliente Windows

Propuesta: `ProtectedData.Protect/Unprotect` con `DataProtectionScope.CurrentUser`, no `LocalMachine`. Microsoft vincula [CurrentUser](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.dataprotectionscope) al contexto del usuario que protege los datos. No es una contraseña maestra embebida en Godot.

Ubicación futura propuesta, fuera del repositorio y OneDrive: archivo binario por perfil bajo `%LOCALAPPDATA%\TwoSides\Identity\<localPlayerId>\credential.bin`. Solo se define la ruta lógica; B03.1 no crea archivos allí ni cambia permisos. Validar en la fase de cliente que la ubicación real no esté redirigida/sincronizada y protegerla con permisos apropiados, con autorización específica. SQLite guarda referencia, identificadores, estados y progreso; no contraseña, token de acceso persistente ni verificador remoto como sustituto de la contraseña.

El contenedor cifrado debe incluir versión de formato, referencia de perfil, `registrationId`, cuenta remota si ya existe, versión de credencial y material secreto. Esa asociación no sustituye autorización remota. No usar datos externos editables para seleccionar otra cuenta sin verificar consistencia. La representación y escritura atómica del contenedor se definirán antes de implementar C#; no crear dependencia de un secreto adicional fijo.

| Situación | Comportamiento previsto |
|---|---|
| Reinicio del equipo | Recuperar el blob con el mismo contexto Windows y claves disponibles; token anterior no se persiste, obtener sesión nueva |
| Otro usuario Windows | No se garantiza descifrado; usar perfil propio o recuperación aprobada |
| Reinstalar Windows/eliminar perfil Windows | Pueden perderse claves de DPAPI; no prometer portabilidad o recuperación del blob |
| Reinstalar solo el juego | Si sobreviven perfil, blob y contexto, reconciliar; si se borran, recuperación o cuenta nueva explícita |
| Sesión Windows comprometida | Un proceso con ese contexto puede acceder al secreto; DPAPI no evita malware, depuración ni compromiso completo |

Godot C# deberá invocar las APIs del sistema mediante una abstracción de almacenamiento que se pueda probar, tras verificar runtime y empaquetado. No cargar el `.env` del servidor en Godot. No implementar DPAPI en el backend Node: es una responsabilidad del cliente Windows.

Antes de red, persistir blob, comprobar lectura y luego guardar referencia/solicitud en una transacción SQLite. Una caída deja como máximo material protegido huérfano, que se reconcilia; no una cuenta remota sin secreto persistido. Si DPAPI falla, conservar el perfil y jugar offline sin guardar el secreto en claro. La coordinación entre dos almacenes no se presenta como una sola transacción atómica.

## 5. Sesiones opacas frente a JWT

| Criterio | Opacas propuestas | JWT descartado para este alcance |
|---|---|---|
| Servicio único | Consulta simple al repositorio de sesiones | No se necesita validación distribuida autónoma |
| Revocación inmediata | Eliminar/revocar registro y comprobar en cada petición | Requiere consulta/denylist o esperar expiración |
| Complejidad | Repositorio y generación aleatoria | Firma, claves, algoritmos, claims y rotación adicionales |
| Dependencia remota | Repositorio disponible para funciones online | Evitar consulta no aporta beneficio para cargar partidas, que son locales |

**Propuesta seleccionada: tokens opacos Bearer**, 32 bytes CSPRNG, base64url canónico de 43 caracteres. El backend guarda exclusivamente SHA-256 del token y metadatos mínimos: cuenta, `credentialVersion`, creación, expiración y revocación. Un hash rápido es adecuado para estos tokens aleatorios de alta entropía; no sustituye el Argon2id exigido para la contraseña técnica. El token original solo aparece una vez en la respuesta de sesión, permanece en memoria del cliente y nunca se registra. Véase [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

Duración absoluta propuesta: **900 segundos (15 minutos)** desde emisión según reloj del servidor, sin extensión por uso. En cada petición comprobar formato, hash, existencia, expiración, revocación, cuenta activa y coincidencia de `credentialVersion`. No confiar en temporizadores del cliente ni solo en un borrado TTL del repositorio. El token no contiene claims ni identificadores interpretables. Usar una única cabecera Authorization Bearer; no cookies ni query para este cliente nativo. La comparación de bytes, cuando corresponda, será de tiempo constante.

Renovación propuesta sin refresh token: si hay red y trabajo pendiente, reautenticar por `/api/auth/session` con la credencial DPAPI antes de expirar (margen propuesto 60 segundos). Coordinar una única solicitud de sesión por perfil, evitar renovaciones paralelas y, ante 401 del recurso, invalidar token y reintentar sesión una vez con espera. Error de la credencial en `/session` no causa un bucle: pausar y pasar a recuperación. No renovar si el cliente está offline o no necesita funciones remotas. Tras varios días offline, cargar la partida y obtener una sesión nueva en segundo plano al reconectar; nunca volver a registrar una cuenta ya asociada.

Máximo propuesto: tres sesiones no expiradas por cuenta; una cuarta emisión revoca la más antigua, evitando que un reintento con respuesta perdida destruya inmediatamente una sesión todavía utilizable. Sesiones no son idempotentes; un token no recibido puede existir hasta expirar/revocarse, sin confirmar estadísticas. Emitir sesión y aplicar el límite de manera atómica.

Invalidación local al cerrar el juego o cambiar perfil: descartar token en memoria. Esto no revoca por sí solo un token remoto robado: seguirá válido como máximo hasta expirar, salvo revocación del servidor. Revocación inmediata futura: repositorio marca token, deshabilita cuenta o incrementa `credentialVersion`; middleware lo comprueba siempre. Las interfaces de logout/revocación administrativa no se agregan a estos tres contratos ni se prometen implementadas en B03.2 sin nuevo alcance.

B03.2 deberá usar repositorios aislados de prueba, inicialmente en memoria si se autoriza; reiniciar ese proceso invalida sus sesiones y también pierde sus cuentas de prueba. No ofrece persistencia de cuentas de producción ni idempotencia a través de reinicios. B06 añadirá el almacenamiento duradero necesario; no utilizar la maqueta para perfiles reales. Un fallo del repositorio online produce 503 y pausa la sincronización, sin impedir jugar.

Para futuras estadísticas, derivar `technicalAccountId` de la sesión y restringir lecturas/escrituras a esa cuenta. No autorizar por IDs del cuerpo, nombre o correo interno. Rechazar asociaciones ajenas, validar eventos y aplicar idempotencia; los endpoints estadísticos no se implementan en B03.1.

## 6. Registro idempotente

El cliente conserva antes de enviar: `localPlayerId`, `registrationId`, referencia y blob de la credencial original protegida, versión de formato y estado. No conservar solicitudes de texto con contraseñas en SQLite ni logs. Tras confirmar, guardar cuenta/email devueltos en una transacción local. No confundir confirmación de registro con confirmación de eventos.

| Caso | Resultado remoto propuesto | Recuperación local |
|---|---|---|
| Registro nuevo | Crear atómicamente asociación única y verificador; 201 | Confirmar misma solicitud y persistir asociación |
| Duplicado y credencial correcta | Verificar con Argon2id y devolver misma cuenta; 200 | Completar commit pendiente |
| Respuesta perdida tras crear | Cuenta ya persistida; el reenvío válido recibe 200 | Reusar el mismo par, nunca nueva clave |
| Clave existente, credencial distinta | 409 genérico, sin cuenta/email ni cambio de hash | Pausar y revisar recuperación |
| Vuelta de periodo offline | Mismo procedimiento con solicitud duradera original | Cargar partida primero; enviar después |
| Error 500/503/timeout | No inferir que no se creó cuenta | Conservar par y reintentar con espera |
| Concurrencia | Una creación gana unicidad; demás verifican posesión | Todas las respuestas válidas asocian la misma cuenta |

La clave de idempotencia no acredita propiedad. Conservar su asociación mientras exista la cuenta; no basta una caché con vencimiento. Tras una rotación, solo la credencial vigente permite repetir el registro. No dejar el secreto inicial como vía de acceso permanente. El borrado de cuenta/tombstones requiere política antes de producción; no reciclar claves conocidas en operaciones de recuperación.

Un cliente público puede generar cuentas nuevas arbitrarias: TLS y contraseña por registro no demuestran licencia, compra, persona única ni ausencia de bots. No incrustar un secreto de admisión compartido. Se necesita control de abuso y capacidad; no se garantiza eliminar registros automatizados por completo.

## 7. Contratos, validación y controles de abuso

Las solicitudes/respuestas de los tres endpoints están en [IDENTITY_API_CONTRACT.md](IDENTITY_API_CONTRACT.md). Las siguientes son propuestas iniciales coherentes con ese contrato, a aprobar y probar antes de exposición pública:

| Control | Valor / comportamiento propuesto |
|---|---|
| Cuerpo POST | Máximo 8192 bytes del cuerpo; JSON UTF-8, objeto plano, versión 1 y campos permitidos exactos |
| Compresión | Rechazar Content-Encoding distinto de identity: 415; no descomprimir cargas antes del límite |
| GET `/me` | Sin cuerpo ni query; Authorization único y token canónico; 400 para parámetros/cuerpo no admitidos |
| Registro, todos los intentos | Ventana deslizante de 20 solicitudes/minuto por IP antes de Argon2 |
| Creación nueva | 5 cuentas/hora por IP y 100/hora globales para entorno inicial; duplicados válidos no consumen cupo de cuentas nuevas |
| Sesión | 30 solicitudes/5 minutos por IP; además 5 verificaciones fallidas/15 minutos por par (IP, cuenta declarada) |
| `/me` | 120 solicitudes/minuto por token válido y 120/minuto por IP para solicitudes sin token válido |
| Recursos Argon2 | Dos trabajos simultáneos, ocho en espera, espera máxima dos segundos; saturación 503 |
| Límite excedido | 429 `rate_limited`, `Retry-After` entero en segundos; no revela cuentas, verificadores o cupos internos |

No se bloquea permanentemente una cuenta por ID aportado por un atacante. El contador por par IP/cuenta se aplica también a IDs desconocidos con el mismo comportamiento externo; no exponer si existe. Éxito válido puede limpiar fallos de ese par; límites por IP y capacidad siguen activos. Una red NAT puede compartir cupos: reconocer impacto y ajustar con datos de carga. Un atacante distribuido puede eludir límites por IP: el techo global y la capacidad acotada reducen daño, sin prometer protección completa.

En B03.2, `trust proxy` debe quedar deshabilitado en pruebas directas; no confiar en X-Forwarded-For enviado por el cliente. Un despliegue con proxy debe aprobar topología, peers de confianza y almacén compartido de límites antes de activarse. Contadores con TTL, memoria acotada y sin IPs/cuerpos en logs; definir retención mínima y tratamiento de identificadores de red antes de producción. Reiniciar un limitador en memoria reinicia sus cupos: no es control distribuido duradero.

HTTPS obligatorio con certificados verificados para comunicaciones remotas. HTTP solo para pruebas 127.0.0.1 sin credenciales reales. No seguir redirecciones remotas con Authorization ni credenciales sin una política explícita de origen. Nunca activar el servidor de pruebas sobre una interfaz pública por comodidad. Proponer timeout total de cliente de diez segundos, espera exponencial inicial de un segundo con variación aleatoria hasta cinco minutos, y respetar el mayor plazo si `Retry-After` exige más. Las peticiones fallidas no borran cola ni progreso; no almacenar el cuerpo secreto para reintentar, reconstruirlo desde el almacén protegido.

Errores sanitizados: 400 `invalid_request`, 401 `authentication_failed` en sesión / `authentication_required` en recurso, 409 `registration_conflict` solo registro, 413 `payload_too_large`, 415 `unsupported_media_type`, 429 `rate_limited`, 500 `internal_error`, 503 `temporarily_unavailable`. 403 se reserva para identidad autenticada sin permiso, no distingue cuentas existentes en login. No filtrar stack, valores, hash, salt, PHC, tokens previos ni existencia de cuentas en sesión. El nuevo token es la única excepción deliberada a no devolver secretos: se entrega solo al autenticar correctamente y nunca se devuelve un secreto almacenado.

No imprimir solicitudes sensibles, Authorization o errores de biblioteca que contengan material privado. Logs técnicos futuros: correlación, tipo de operación, resultado agregado y latencia, sin payload, IP persistente por defecto ni credenciales. La política de observabilidad debe revisarse antes de producción.

## 8. Rotación sin perder estadísticas — diseño futuro

No hay endpoint de rotación autorizado todavía. Flujo conceptual para un contrato adicional:

1. Con credencial actual disponible, preparar nueva credencial exclusiva y `rotationId` aleatorio; proteger ambas versiones y solicitud antes de enviar.
2. Requerir prueba de la credencial vigente, no solo token, ID, nombre o correo. Cambiar verificador mediante operación atómica condicionada a `credentialVersion`; mantener `technicalAccountId` y la asociación `registrationId`.
3. Incrementar versión e invalidar todas las sesiones anteriores. No mantener el verificador viejo como credencial alternativa; conservar solo recibo no secreto de operación asociado a la cuenta.
4. Si se pierde respuesta, el cliente conserva ambos secretos y comprueba el nuevo mediante sesión. Un reintento de la rotación completada exige `rotationId` y prueba con la nueva credencial, no con la anterior revocada. Si la anterior aún es vigente, repetir la misma operación; rechazar rotaciones concurrentes contradictorias.
5. Confirmar y persistir la nueva versión; retirar material viejo solo tras reconciliar éxito. No regenerar de nuevo después de timeout ni sobrescribir una versión concurrente.

Las estadísticas mantienen cuenta y eventId; rotación no modifica propietario, guardados, eventos ni estados de confirmación. Si se perdió la credencial vigente, este flujo no autentica: necesita recuperación aprobada. La atomicidad cliente/servidor y protección contra replay requieren pruebas específicas antes de implementar ese contrato.

## 9. Recuperación: límites y opción futura

| Pérdida / cambio | Qué se conserva y qué hacer |
|---|---|
| Credencial local perdida | Conservar SQLite y eventos; `RECOVERY_REQUIRED`; no autenticar por nombre |
| Reinstalar videojuego | Si sobreviven SQLite/blob/contexto, reconciliar; si no, recuperación opcional o identidad nueva explícita |
| Cambio de computadora | DPAPI no es un formato de traslado garantizado; necesitar recuperación/migración aprobada y rotación |
| Perfil Windows eliminado / Windows reinstalado | No prometer descifrado, aunque sobreviva el blob; recuperación externa voluntaria si fue preparada |
| SQLite perdida pero blob disponible | No hay recuperación de progreso en Atlas; reconstruir solo asociación técnica si el contenedor la permite y la credencial se verifica, tras procedimiento explícito |
| SQLite conservada, blob ausente/inutilizable | Se puede jugar y conservar progreso; no sincronizar como la cuenta anterior sin prueba de recuperación |
| SQLite y blob perdidos | Sin código previamente guardado no se promete cuenta anterior ni progreso; nombre no sirve |

Opción futura propuesta: código de recuperación CSPRNG de 32 bytes, entregado una sola vez al jugador al activar voluntariamente respaldo. Guardarlo fuera de la instalación en lugar seguro junto con identificador de cuenta; nunca enviarlo por correo personal ni guardarlo en claro en SQLite, documentos o logs. El backend guardaría un verificador y estado de uso, no el código recuperable. El normal inicio del juego continúa pidiendo únicamente nombre visible; el respaldo sería una acción opcional separada.

Un futuro protocolo debe consumir el código atómicamente, exigir nueva credencial preprotegida, rotar contraseña y revocar sesiones, emitir un nuevo código y resolver respuestas perdidas/replay con prueba de posesión de la credencial nueva. Debe tener rate limiting y no dar acceso por ID de cuenta solamente. Ese protocolo y su UI todavía no están especificados para implementación: sin aprobación previa, no anunciar recuperación disponible. Si se pierde también el código, no hay recuperación garantizada. Exportación cifrada sigue como alternativa pendiente, no segundo mecanismo activo.

El código recupera identidad, no partidas. Un respaldo separado de SQLite es necesario para restaurar progreso; Atlas no sustituye ese respaldo. No reasociar eventos de una cuenta previa a otra nueva automáticamente.

## 10. Decisiones y puertas para B03.2

Confirmado por el usuario: requisitos D01–D10, preferencia Argon2id, diseñar DPAPI/rotación/recuperación y comparar sesiones, sin implementación en esta fase. Propuesto aquí: parámetros exactos, DPAPI CurrentUser y ubicación, tokens opacos/900 s, límites, modelo por perfil/instalación y renovación sin refresh token. Pendiente: aprobación de esos valores, selección/revisión de biblioteca Argon2, mediciones, contrato adicional de rotación/recuperación, reglas finales de cliente y almacén durable/multiproceso para producción.

B03.2 necesita autorización independiente sobre código, pruebas y cualquier instalación. Recomendar comenzar con los tres contratos aprobados y repositorios de pruebas aislados, sin Atlas, SQLite o cliente real; usar reloj inyectable y comprobadores de identidad para probar expiración/revocación. No es autenticación de producción ni licencia. No realizar pruebas de DPAPI o coste Argon2 en B03.1 porque requerirían implementación o material criptográfico.

Pruebas futuras obligatorias: registro concurrente y respuesta perdida, clave conocida sin credencial, contraseña distinta, rehash concurrente con rotación, vencimiento/versión/revocación, token aleatorio malformado, autorización entre cuentas, límites/saturación, ausencia de filtraciones, y continuidad offline del cliente cuando su fase esté autorizada. Las ocho regresiones B01 solo demuestran que la base existente sigue funcionando.

Riesgo conocido no resuelto: SID `S-1-5-21-452213140-3335518246-3718727391-3248334987` heredado con Modify/Synchronize en `.env`. B03.1 no lo identifica, justifica, elimina ni modifica. No cargar ese archivo ni usar sus secretos; verificar solamente tamaño/hash y metadatos. Revisar el riesgo por separado antes de usar credenciales reales o desplegar.

## 11. Implementación local B03.2 y mediciones

Autorización: solicitud expresa B03.2 del usuario, 2026-10-24. Aplica UUID y credenciales CSPRNG, correo reservado, Argon2id con los parámetros solicitados, sesiones opacas de 900 segundos, validaciones y límites a repositorios aislados en memoria. No implementa Godot, SQLite, Atlas, DPAPI, recuperación ni rotación de contraseñas. La invalidación interna de versión/sesiones existe para pruebas, no como endpoint de recuperación o cambio de credencial.

Dependencia nueva: `@node-rs/argon2` **2.2.2**, con paquete opcional instalado `@node-rs/argon2-win32-x64-msvc` **2.2.2**. Node.js **24.19.0**, npm **11.17.0**, Express **5.3.0**. Se revisaron metadatos oficiales del registro npm y [API/proyecto mantenedor](https://github.com/napi-rs/node-rs/tree/main/packages/argon2). La biblioteca declara Node >=10 y binario Windows x64; la ejecución real verificó compatibilidad con este Node 24/Windows. No se instalaron dependencias de desarrollo ni JWT/drivers. El lockfile incluye variantes opcionales de otras plataformas, pero solo está instalado el binario Windows apropiado: 67 paquetes instalados frente a 79 entradas de dependencias en el lockfile.

Se generó lockfile antes de instalar, se comprobaron URLs `registry.npmjs.org`, integridad y ausencia de `hasInstallScript`, y se instaló mediante `npm ci --ignore-scripts --no-audit --no-fund`, con caché y TEMP/TMP dentro del backend. No hubo compilación ni scripts de instalación. Los scripts build/prepublish del mantenedor se revisaron como tareas de publicación, no se ejecutaron.

Componentes implementados:

- `identity/identity.js`: UUIDv4, credencial sintética de 32 bytes, validación Unicode y representación pública por lista permitida. La validación de nombre es una función separada; register/session rechazan displayName conforme al contrato local mínimo.
- `auth/credential-hasher.js`: `hash`/`verify` asíncronos de la biblioteca, Argon2id v19/m65536/t3/p1, salt CSPRNG de 16 bytes, salida de 32 bytes y PHC. Solo acepta verificadores de la política esperada para evitar costos arbitrarios por corrupción. Usa verificador ficticio para cuenta desconocida; se prepara perezosamente y su coste inicial se comparte en el camino de sesión. No se promete indistinguibilidad temporal absoluta.
- `utils/work-pool.js`: pool predeterminado por proceso con dos trabajos, ocho esperas y plazo dos segundos; saturación 503. No se cancela un trabajo nativo ya iniciado, pero su costo está fijado y no se libera un slot antes de que termine.
- `auth/memory-repository.js`: cuentas, idempotencia y sesiones privadas en Map, sin archivos; commits de unicidad/cupos y sesiones síncronos sin await. Máximo 1000 cuentas sin expulsarlas; máximo tres sesiones por cuenta. Expiración/revocación elimina sesiones, versión controla vigencia; sesiones solo almacenan hash SHA-256, nunca token original.
- `auth/auth-service.js`, `app.js` y middleware: tres endpoints, sesión propia desde Bearer, formato/JSON/límites/cabeceras/errores sanitizados, sin cookies, CORS como autenticación, proxy confiado o conexiones externas.

### Medición reproducible con datos sintéticos

Comando: `node scripts/benchmark-auth.js` (también `npm run bench:auth`). No guarda credenciales/verificadores ni resultados privados; imprime únicamente parámetros y métricas agregadas. Medición local Windows x64, Node 24.19.0, 2026-10-24:

| Operación | Muestras | p50 | p95 |
|---|---:|---:|---:|
| Hash secuencial | 8 | 54,55 ms | 61,33 ms |
| Verificación secuencial | 8 | 52,34 ms | 59,64 ms |
| Hash con concurrencia 2 | 8 (4 pares) | 76,32 ms | 84,47 ms |

RSS inicial del proceso: **40,82 MiB**; pico muestreado: **242,33 MiB**; aumento observado: **201,51 MiB**. Muestreo cada 2 ms, máximo dos trabajos activos. CPU agregada: usuario **1375 ms**, sistema **110 ms**, para la serie completa. RSS mide TODO el proceso y asignaciones/retenciones del runtime/biblioteca, no memoria exacta por hash; el muestreo puede perder picos breves. No tratar los 128 MiB teóricos de dos trabajos como límite real del proceso. Ocho muestras son una comprobación local pequeña, no estudio de carga ni garantía de producción. No se redujeron los parámetros para lograr estos tiempos; el objetivo inicial de p95 <=500 ms se cumple en esta medición.

### Evidencia y límites

Las pruebas locales verifican parámetros y sal independiente, aceptación/rechazo, concurrencia y colas, idempotencia y conflicto, sesión/expiración/revocación, aislamiento por cuenta, cuerpo/JSON/campos/query, rate limiting y ausencia de material privado en respuestas. Regresiones y conteo final están en `PHASE_HISTORY.md`. Los ejemplos documentales permanecen sintéticos e inválidos como credencial/token real.

Los secretos de prueba se generan y usan exclusivamente en memoria durante pruebas/benchmark; no hay fixtures con secretos persistidos ni logs de contraseñas, hashes o tokens. Reiniciar el proceso pierde todo, incluidos límites y asociaciones: no es persistencia real, no protege producción contra reinicios o múltiples procesos, ni sustituye Atlas futuro. El servidor de arranque sigue fijo en 127.0.0.1 y no carga `.env`. La exposición remota/TLS/proxy, protocolos de rotación/recuperación, protección del cliente y política de borrado requieren fases/autorizaciones posteriores. El SID desconocido de B00 sigue sin resolver ni modificar.
