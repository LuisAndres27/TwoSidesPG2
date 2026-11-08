# B05.2D.1 — Contrato propuesto de identidad persistente

Fecha: 2026-10-27, America/Guatemala. Estado: COMPLETADA únicamente como diseño. Ninguna propuesta siguiente está implementada ni autoriza B05.2D.2.

## 1. Auditoría del contrato implementado

Fuentes revisadas: src/app.js, src/server.js, src/config/jwt.js, src/modules/auth/{auth-service,jwt-service,jwt-schemas,memory-repository}.js, middleware de autenticación/autorización, tests JWT y legacy, package.json; contratos B05 de sincronización, identidad, seguridad, hoja de ruta y tres informes ACL. La implementación prevalece sobre descripciones históricas.

| Aspecto | Comportamiento actual |
| --- | --- |
| Registro JWT opcional | POST /api/v1/technical/registrations; body estricto schemaVersion:1, registrationId UUID y credential de 32 bytes base64url canónico |
| Sesión JWT | POST /api/v1/technical/sessions; technicalAccountId y credential; Argon2id verifica posesión |
| Identidad | UUID remoto generado por servidor, role player; no binding de instalación/perfil implementado |
| Repositorio | Maps de cuentas, registros y sesiones; unicidad solo dentro del proceso |
| Autorización | Cuenta activa, sesión jti existente, cv y rol coincidentes; propiedad del recurso |
| Administración | admin únicamente fixture sintético opt-in; no aprovisionamiento real |
| Producción | Bloqueada explícitamente antes de listen; JWT solo composición isolated-test |
| Reinicio | Pierde identidades, verificadores, sesiones y revocaciones; fixtures generan otras claves |

El servicio JWT reutiliza la sesión opaca interna para crear el registro de sesión, pero devuelve JWT en las rutas nuevas. El registro guarda el hash del token opaco transitorio; no constituye persistencia. El máximo actual es tres sesiones por cuenta, TTL 900 segundos. El middleware rechaza tokens inválidos con 401 y privilegios/propiedad insuficientes con 403. El catch general actual convierte también fallos de repositorio en 401; el adaptador persistente deberá distinguir indisponibilidad.

Las rutas /api/identity/register, /api/auth/session y /api/identity/me permanecen opacas. Las JWT son opcionales y separadas; ni convertir un token ni probar ambos validadores como alternativa. Los 89 tests (39 legacy y 50 nuevos) son resultados de B05.2C, NO ejecuciones de esta fase.

## 2. Identificadores y política elegida

| Dato | Autoridad, estabilidad y función |
| --- | --- |
| displayName | Solo SQLite local; no secreto, no criterio de recuperación |
| localPlayerId | UUID del perfil existente; conservarlo, no acredita propiedad remota |
| installationId | UUID aleatorio nuevo por instalación; sin MAC ni huella de hardware |
| technicalAccountId | UUID generado por servidor; sujeto remoto estable |
| registrationId | UUID persistido antes del primer intento; deduplicación de alta |
| credential | Aleatoria de 32 bytes; posesión probada mediante Argon2id |
| credentialRef | Referencia local al almacén protegido, nunca secreto en progreso |
| gameId, decisionId, eventId | Identificadores originales de progreso/sync; nunca regenerarlos para registrar identidad |
| bindingGeneration | Época de vínculo; impide reutilizar mensajes de un vínculo reemplazado |

Política inicial propuesta: una instalación activa por identidad remota. Un equipo puede tener varios perfiles, cada uno con su identidad y vínculo propios. installationId identifica la instancia de aplicación; el par installationId/localPlayerId identifica un vínculo. Una identidad no se comparte automáticamente entre equipos. Una futura ampliación multidispositivo exigirá enrollment autorizado por credencial existente o recuperación independiente real; conocer UUID/nombre no basta. No existe hoy recuperación remota ni migración de dispositivo implementada.

Si se copia perfil y secreto, las dos copias pueden demostrar la misma posesión. Sin hardware obligatorio no se puede distinguirlas de forma infalible. Detectar sesiones/épocas incompatibles y ofrecer revocación futura no prueba que haya dos personas ni autoriza borrar progreso.

## 3. Protocolo persistente propuesto, explícitamente v2

No ampliar silenciosamente los esquemas estrictos v1. Proponer POST /api/v2/technical/registrations con schemaVersion:2, registrationId, installationId, localPlayerId, credential y bindingGeneration inicial 1. Servidor fija role player y genera technicalAccountId. Nunca aceptar email, displayName, role, scopes o privilegios de cliente. Respuesta mínima: IDs de registro/cuenta/vínculo, versión y estado; sin verificador ni secreto.

Secuencia futura:
1. Cliente genera IDs y secreto; persiste primero el secreto protegido y un sobre pendiente sin secreto en el progreso.
2. Servidor valida formato/límites, limita origen y gasto Argon2id; verifica reintento por receipt.
3. Alta transaccional de identidad, vínculo, verificador y receipt. Devuelve el mismo resultado solamente al probar la misma credencial y vínculo.
4. Cliente conserva respuesta mediante transición local atómica. Un timeout conserva registrationId y secreto; reintenta con backoff/jitter, no crea otra identidad.
5. POST /api/v2/technical/sessions exige cuenta, instalación, perfil y credencial; devuelve JWT de 900 segundos. Sin refresh token en esta propuesta: renovar significa reautenticar por posesión.
6. GET /api/v2/technical/me devuelve exclusivamente la identidad autenticada.

Un registro repetido con el mismo ID pero distinta credencial/vínculo produce conflicto controlado, nunca sobrescribe al ganador. UUID ajeno declarado no concede acceso. No habilitar búsquedas públicas por nombre/ID ni devolver datos de otras cuentas. Alinear posteriormente B05_SYNC_API_CONTRACT de manera expresamente autorizada: sus propuestas no equivalen a estas rutas implementadas.

Proponer JWT v2 con ver:2 y claims de instalación, bindingGeneration y authzVersion además de cv. cv pasará a ser versión de credencial por vínculo; actualmente es por cuenta. Este cambio semántico exige middleware/rutas v2 y validación estricta separada, sin aceptar v1 como v2. iss/aud de prueba siguen reservados; producción exige otros valores aprobados y no se habilita aquí.

## 4. Esquemas MongoDB/Mongoose conceptuales

No se crearon modelos ni colecciones. UUID canónicos, UTC para fechas, versiones enteras positivas y campos estrictos. Credenciales PHC y metadatos de seguridad no se serializan en respuestas.

| Colección propuesta | Campos mínimos | Restricciones/índices |
| --- | --- | --- |
| TechnicalIdentity | _id UUID, status, role=player, authzVersion, createdAt, updatedAt | _id único; status enumerado; rol no editable desde API pública |
| InstallationBinding | _id bindingId, installationId, localPlayerId, technicalAccountId, bindingGeneration, status, currentCredentialVersion, mutationVersion | único (installationId,localPlayerId); único parcial technicalAccountId donde status=active para política inicial |
| CredentialVerifier | bindingId, version, verifierPHC Argon2id, status, expiresAt nullable, createdAt, revokedAt | único (bindingId,version); único parcial bindingId donde status=active |
| RegistrationReceipt | registrationId, bindingId, technicalAccountId, IDs declarados inmutables, resultVersion, createdAt | registrationId único; respuesta sin secreto; verificación por verificador asociado |
| AuthSession | jti UUID, accountId, bindingId, cv, bindingGeneration, authzVersion, role, kid, tokenVersion, issuedAt, expiresAt, revokedAt | jti único; índices accountId/bindingId/expiry; nunca JWT íntegro |
| SigningKeyRegistry | kid, publicFingerprint, publicKeyRef, state, signerEpoch, activatedAt, lastIssuedAt, retiredAt | kid único e inmutable respecto de fingerprint; un firmante activo por entorno |
| AdminRoleBinding | issuer, subject, permissions, status, authzVersion, audit timestamps | único (issuer,subject); separado de cuentas de jugadores |
| SecurityAudit | eventId, actor técnico, operación, resultado, fecha, correlationId | eventId único; sin secretos, tokens, PHC ni progreso |

Entornos separados físicamente; no mezclar fixtures/producción. Para todos los índices únicos, campos requeridos y tipos estrictos evitan colisiones por null/ausencia. La opción unique de un esquema no sustituye a verificar el índice real de la base.

[MongoDB: índices únicos](https://www.mongodb.com/docs/manual/core/index-unique/) respaldan unicidad simple/compuesta. [MongoDB: transacciones](https://www.mongodb.com/docs/manual/core/transactions/) documenta atomicidad por documento y transacciones multidocumento. Decisión propia: alta multicollección requiere replica set sintético, transacción y write concern majority; no simular garantía con Maps.

Crear/verificar índices antes de habilitar altas, sin autoIndex improvisado en producción. Hash Argon fuera de transacción; dentro revalidar estado y escritura condicional. Ante duplicate key, releer receipt del ganador y comprobar posesión, no declarar éxito por compartir UUID. Reintentos transaccionales acotados, sin duplicar efectos externos. Leer snapshot y escribir condicionalmente mutationVersion del vínculo/cuenta durante alta de sesión y revocación para que ambas compitan sobre el mismo documento; una simple lectura snapshot no impide todas las carreras. Autorización posterior vuelve a comprobar estado/versiones.

## 5. Revocación, cambio y pérdida

Revocar jti invalida una sesión; incrementar cv invalida las sesiones del vínculo; suspender identidad bloquea temporalmente toda autenticación; incrementar authzVersion invalida autorizaciones anteriores. Revocación terminal no se revierte cambiando solo un booleano. Todos los validadores consultan estado persistente; ninguna caché permisiva durante caída si se promete revocación inmediata.

Rotación propuesta: cliente guarda primero el nuevo secreto protegido, prueba el anterior y envía rotationId idempotente. Servidor hace CAS de versión y promueve nuevo verificador, revocando anterior y sesiones en una transacción. Si pierde ACK, cliente prueba el nuevo secreto para consultar estado; no borra la copia pendiente antes de confirmar. No hay ventana donde la credencial anterior pueda emitir nuevas sesiones. Reintentos de rotationId requieren prueba del nuevo secreto y recibo inmutable. No guardar secretos en recibos.

Credencial con expiresAt=null no vence automáticamente; una política futura puede fijar fecha explícita. Si existe, se exige now < expiresAt; TTL no decide autorización. Vencida o revocada no permite renovar por sí sola; requiere recuperación/enrollment independiente. Perder ambos secretos o reinstalar sin almacén recuperable puede perder la identidad remota. El progreso SQLite permanece local; no prometer recuperación por nombre ni reasignar historial a cuenta nueva sin protocolo aprobado.

Almacén caído: respuesta local a sync con error temporal 503 y Retry-After acotado; credencial realmente inválida 401; permiso insuficiente 403. No reemplazar identidad, relajar firma ni habilitar sesión temporal sin guardado. Rate limiting de CPU, concurrencia Argon, cuota por cuenta/origen, límites de tamaño y presupuestos compartidos entre instancias; actuales límites en memoria no bastan para abuso distribuido. Cuotas no eliminan Sybil/NAT/DoS.

Retención propuesta: sesiones expiradas hasta 24 h para diagnóstico mínimo; auditoría 30 días, luego borrado automático, sujeto a aprobación operativa/legal. Receipts/tombstones de IDs se conservan mientras pueda llegar una cola válida; no reciclar IDs al aplicar TTL. Desactivar no borra progreso local. Borrado definitivo requiere política explícita de privacidad, minimización y tratamiento de colas antiguas; no retener PHC de credenciales revocadas más allá de recuperación autorizada. Estos plazos son propuestas, no tareas ejecutadas.

## 6. Almacenamiento Windows y administradores

Preferencia propuesta: DPAPI CurrentUser o Credential Manager por usuario, fuera del repositorio/OneDrive, con referencias opacas en SQLite. DPAPI protege datos bajo contexto Windows; debe probarse en .NET 8/Windows antes de elegir implementación ([Microsoft ProtectedData](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata?view=net-8.0)). Directorio privado con ACL limita exposición, pero texto plano no sustituye cifrado. No usar LocalMachine para compartir secretos entre usuarios. Instalación/vínculo es contexto, no contraseña criptográfica. Usuario con sesión/control del equipo o malware puede extraer secretos; DPAPI no lo impide absolutamente. Respaldo del blob puede depender del perfil Windows y no garantiza portabilidad a reinstalación. No exportación automática sin protección y autorización.

Admins: aprovisionamiento solo operador servidor mediante proveedor OIDC y MFA, con issuer/audience/keyset de administración separados; permisos mínimos, expiración corta, sesiones y revocación propias, auditoría de cambios. No existe ruta pública de alta admin; ni role suministrado por Godot ni Windows Administradores implica rol web. Fixture admin no se migra. Un JWT player válido se rechaza en panel aunque intente declarar admin.

## 7. Compatibilidad y límites

Conservar legacy opaco y JWT v1 aislado con middleware propio. Futuro v2 no acepta ninguno como sustituto. Retirada requiere inventario de consumidores, métricas sin tokens, plazo aprobado, aviso de versión y pruebas de rechazo cruzado; sin retirada en esta fase. Fixtures se descartan; nunca importarlos como identidades reales.

Registro remoto fallido solo deja sincronización pendiente: crear/continuar, decidir, jugar, guardar, finales, estadísticas y nueva partida permanecen locales. No modificar IDs ni bases existentes. B00 sigue pendiente: dos Allow no resueltas, no prueba de malicia ni corrección; custodia privada futura reduce exposición nueva, no corrige código/secretos históricos. Respaldo ACL y ensayo limitado no certifican restauración masiva.



## B05.2D.2 — Implementación aislada (2026-10-27 Guatemala)

Estado de este documento: las secciones B05.2D.1 anteriores conservan el diseño/hallazgos históricos. El siguiente alcance sí tiene código; no convierte propuestas MongoDB/productivas en funciones implementadas.

**Implementado:** puerto asíncrono identity-repository.js y await en registro/sesión y JWT; repositorio sintético con cuenta, vínculo, verificador Argon2id y recibo registrationId en un único snapshot atómico; sesiones/jti, cv, authzVersion y revocación persistibles. Una identidad por vínculo installationId/localPlayerId; ID remoto generado en servidor, role player impuesto, bindingGeneration inicial 1. Lecturas devuelven copias; no nombres ni secreto original en registros.

Composición explícita createApp({persistentJwt:{config,repository}}) activa únicamente POST /api/v2/technical/registrations, POST /api/v2/technical/sessions, GET /api/v2/technical/me y GET /api/v2/players/:id. Schemas strict separados: registro schemaVersion2/registrationId/installationId/localPlayerId/bindingGeneration1/credential; sesión schemaVersion2/technicalAccountId/installationId/localPlayerId/credential. Respuesta de alta incluye IDs/vínculo/estado, sin PHC. Tokens v2 tienen ver:2, installationId, localPlayerId, bindingGeneration y authzVersion además del perfil RS256/cv existente.

Reutilizado JwtService de B05.2C, sin otro firmante/validador paralelo. v1 rechaza ver de v2; v2 exige ver y vínculos coincidentes en cuenta y sesión. Rutas legacy/v1 permanecen iguales. No existe ruta admin v2: solo fixtures admin v1 conservados, sin provisión real ni puente de confianza. Defaultapp/server no carga claves ni activa v2; producción sigue rechazada.

Registro repetido exige misma credencial y binding; cambios producen 409, nunca reemplazo. CAS de versiones al crear sesión y revocación dentro de mutación exclusiva. Revocación terminal active=false incrementa authzVersion; revocación individual y cv invalida tokens previos. Caducidad de credencial opcional solo control interno sintético, sin endpoint de política pública. Errores de almacenamiento se propagan como 503 sanitizado con Retry-After, incluso en middleware; autenticación inválida 401, propietario incorrecto 403.

Dos adaptadores del mismo contrato: fake en memoria y snapshot cifrado de prueba, ambos en tests/identity-persistence/support/synthetic-repository.js. El puerto reusable está en src; el adaptador de archivos NO se carga desde el arranque normal. Límite 1.000 cuentas, tres sesiones por cuenta; snapshot máximo 4 MiB y esquemas estrictos. Modelo agregado sintético no prueba colecciones, índices únicos, replica sets o transacciones de MongoDB.

La autorización B05.2D.2 permite expresamente almacenamiento temporal duradero de prueba. Por ello se ensaya archivo cifrado en vez de provisionar MongoDB. La puerta D+P MongoDB del plan de diseño sigue PENDIENTE y no se rebautiza como superada con archivos. No se implementaron Mongoose, enrollment, recuperación, rotación de credenciales, suspensión/reactivación pública, cliente DPAPI ni administración OIDC. Esas partes afectadas por decisiones pendientes quedan detenidas; no se inventó recuperación alternativa.

El rollback de snapshots antiguos por un operador no está protegido mediante contador externo antirollback. No es almacén productivo ni recuperación de usuario. Gameplay permanece sin conexión a estas rutas; código del juego y bases protegidas intactos, sin nueva validación manual de Godot.


### Cierre verificado B05.2D.2 — 2026-10-27 Guatemala

**COMPLETADA EN CÓDIGO, únicamente en el ámbito sintético autorizado.** Resultado final de npm test: **124 aprobadas, 0 fallidas, 0 omitidas**: 39 legacy node:test + 50 regresiones JWT B05.2C + 35 nuevas (26 memoria/contrato/HTTP y 9 archivo/aislamiento). No sumar reejecuciones. Todos los procesos Node y listeners de ensayo terminaron; cero directorios identity-d2-* de ensayo restantes.

Inventario final: 23 archivos deliberados (15 existentes modificados y 8 nuevos): seis código/config de pruebas existentes, un puerto src nuevo, siete archivos nuevos de batería/soporte y nueve documentos autorizados. De 4.839 archivos iniciales inventariados fuera de .git/node_modules/.godot y .env separado, 4.824 permanecen idénticos en hash/tamaño/mtime; ocho añadidos, cero eliminados. No otros cambios de contenido detectados. El lector del manifiesto usa UTF-8 explícito para no confundir nombres con Ñ como altas/bajas.

Tres bases protegidas y nueve archivos asociados: hash/tamaño/mtime idénticos. Backend/.env coincide con referencia histórica y conserva tamaño, fecha y descriptor/propietario; sin lectura de valores. SDDL/owner de raíz, backend, .env y .git idénticos antes/después; no comandos de cambio ACL/herencia/owner. No se afirma una nueva auditoría completa de ACL por archivo de todo el árbol. B00 sigue pendiente con ambas Allow investigadas y cuatro Deny Git conservadas.

No dependencias nuevas, Atlas, AWS, Godot, SQLite/SQL/migración, secretos reales ni producción. Persistencia Mongo/índices/transacciones, recuperación de usuario, DPAPI, keyring/rotación productivos y admin OIDC pendientes. El ensayo de archivo no acredita Atlas ni recuperación de apagón o fin del orquestador. Recomendación: revisión y autorización específica antes de cualquier B05.3; **B05.3 no iniciada, trabajo detenido**.
