# B05.2A — Plan de implementación de identidad y autorización
2026-10-27 · Solo auditoría y contratos; no implementación de JWT/roles/servicios.

## Inventario real inspeccionado
| Área | Estado actual comprobado en código |
|---|---|
| Dependencias | backend/package.json: Express5.3.0 y @node-rs/argon2 2.2.2, Node>=24<25. Sin Mongoose, JWT, Zod o cors declarados. |
| Registro | POST /api/identity/register, validateBody exacto schemaVersion/registrationId/credential; AuthService.register reconoce misma clave/secreto en MemoryRepository. UUIDv4 técnico remoto y correo reservado sintético, no correo real/nombre. Conflicto no sobreescribe. |
| Login técnico | POST /api/auth/session; token opaco aleatorio900s. GET /api/identity/me valida Bearer y deriva cuenta del token. No es JWT. |
| Hash | Argon2id v0x13, memoria65536KiB/timeCost3/paralelismo1/hash32/salt16; PHC verificado y costos acotados. WorkPool2 activos/cola8/espera2s y dummy verifier. No se ejecutó hashing o benchmark ahora. |
| Persistencia | MemoryRepository con Maps de cuentas/registros/sesiones; pierde identidades al reiniciar proceso. Límite3 sesiones/cuenta y expiración/versionado/revocación internos. MongoDB/mongodb/.gitkeep es placeholder, sin conexión/modelos durables. |
| Auth middleware | Comprobación integrada en handler /identity/me; no middleware reusable general de autenticación/autorización por propietario/rol. |
| Roles/JWT | No player/admin implementados; no emisor/firmante/validador JWT/JWKS/refresh. El cliente legacy con nombres Session no demuestra un JWT funcionando en este backend. |
| Validación/errores | Validadores manuales de campos y UUID/secretos; JSON8KiB estricto/sin compresión, headers, no query en rutas actuales, errores sanitizados/requestId. Sin esquemas de sync ni protección BOLA de recursos aún inexistentes. |
| Rate limits | Ventanas/cupos por IP/cuenta/token, memoria acotada; trust proxy=false. No distribuido o persistente entre procesos. |
| CORS | No middleware ni allowlist CORS aplicada en app.js. No significa acceso admin autorizado: CORS no reemplaza auth, no protege un cliente nativo y no es mitigación antireplay. |
| Servidor | loopback127.0.0.1; config/server.js lee puerto del entorno de proceso. No autoload .env ni TLS configurado en esta aplicación local. |
| Tests | unit/app, unit/identity-auth e integration/identity-api: auth/hash/pool/expiración/revocación/límites/idempotencia/errores. Inspeccionados, NO ejecutados. No tests de roles/JWT/Atlas que acrediten implementación. |

Rutas ausentes de sync/admin devuelven404. Los directorios routes/controllers/models/services/domain separados no existen; la implementación real es modules/auth/identity y middleware singular. No se adopta un modelo antiguo de fuera de esta copia.

## Contrato de jugador y credencial
Mantener B05.1 como propuesta, no como código:
- displayName solo local, editable y no único; nunca identidad de seguridad, password o prueba de recuperación.
- localPlayerId UUID existente estable en SQLite; installationId UUID nuevo persistente, sin fingerprint hardware.
- registrationId UUID idempotente independiente; technicalAccountId UUID generado por servidor duradero.
- credential CSPRNG32bytes por instalación/perfil, no secreto compartido de ejecutable. Servidor solo PHC Argon2id; SQLite solo credentialRef, sin credencial/token en texto.
- Binding autoritativo account+installation+localPlayer; bindingGeneration para reasociación, credentialVersion para rotación. Body no elige propietario efectivo ni rol.
- Secuencia protegida: blob Windows CurrentUser privado fuera de OneDrive/repositorio → lectura de verificación → transacción de referencia/registro pending → envío → asociación registrada. Fallos entre fases se reconcilian sin regenerar ID/secreto tras timeout.
- LOCAL_ONLY sigue jugable si no puede protegerse credencial. Registro/sesión/envío son secundarios al dominio local.
- Token opaco actual se puede conservar en la primera implementación. Renovación por reautenticación con secreto protegido y sesión corta; no nueva alta. Una renovación acotada tras401 de recurso; fallo de secreto/revocación→RECOVERY_REQUIRED y sync pausada.
- Pérdida/reinstalación/otra PC: nombre/DB no prueban cuenta; DPAPI no es recuperación portable garantizada. Recovery code o exportación cifrada requieren contrato y autorización independientes. No reasignar eventos antiguos a cuenta nueva automáticamente.
- No generar cuentas reales ni leer .env para bootstrap. El secreto de Atlas/firmante/admin solo en servidor/gestor privado, jamás Godot o navegador.

## JWT: perfil propuesto, NO implementado ni sustitución automática
B05.1 recomienda conservar opacos para player inicialmente. El pedido actual añade este diseño JWT para futura decisión explícita; no cambia el formato emitido ni autoriza instalar librerías. Migrar token de una ruta deberá versionarse/acordarse antes de B05.2B. No “detectar JWT” solo por puntos ni aceptar opacos/JWT indiscriminadamente en cualquier endpoint.

Propuesta de access JWT del juego si se aprueba:
| Parte | Contrato propuesto |
|---|---|
| alg | Allowlist exclusiva RS256, clave RSA generada/custodiada en servidor. No none, HS256, algoritmo de header a voluntad o verificación con una clave de otro tipo. |
| typ/kid | typ at+jwt; kid acotado y buscado solo en conjunto confiable configurado. Rechazar jku/x5u arbitrarios/URL de token y critical headers desconocidos. |
| iss | Identificador HTTPS exacto del emisor propio configurado por entorno y aprobado al desplegar; no derivado de Host o del token recibido. No se inventa un dominio real aquí. |
| aud | Identificador lógico exacto two-sides-sync-api, distinto del público administrativo. |
| sub | technicalAccountId de la cuenta duradera, no displayName/localPlayerId elegido por body. |
| iat,nbf,exp | NumericDate enteros, exp obligatorio, TTL máximo900s propuesto; validar no expirado/no futuro y skew máximo60s. No prolongar exp al reintentar. |
| jti | ID aleatorio único de token para revocación/auditoría segura; no es OperationId de sync. |
| Privilegios | role=player y scope sync:write sync:status desde servidor; installationId/bindingGeneration/credentialVersion validados contra relación durable vigente. |
| Contenido excluido | Contraseña, credencial original, correo real, PHC, claves de Atlas, decisiones o guardados. Firma no cifra el payload; no tratarlo como confidencial. |

Validación primero estructura/tamaño/tipo permitido, clave/alg/firma y perfil exacto de emisor/audiencia, después tiempos/claims y principal vivo/binding/version/rol. Ningún claim se usa para autorizar antes de validar. Rechazar tokens malformados, duplicados, ID tokens de login y JWT del panel en rutas de jugador.

JWT corto no proporciona revocación inmediata por sí solo: mantener sesión/jti revocable o validar estado de cuenta/credentialVersion/binding en repositorio durable con caché de invalidación acotada y SLA explícito. Si se exige revocación inmediata, no aceptar caché stale ni degradar validación por indisponibilidad; sync devuelve503/401 según causa y juego sigue local. Sesiones opacas actuales ya consultan estado en memoria; persistirlas sería una alternativa menos compleja.

Rotación: keys de firma con kid, overlap para validar tokens no vencidos, retirada de clave comprometida y expiración cortas. Solo el backend firma; Godot recibe token, nunca clave privada/secret JWT. Configurar rutas y esquema de validación mutuamente excluyentes para cada tipo de token. El contrato de estas comprobaciones se apoya en [RFC8725](https://www.rfc-editor.org/rfc/rfc8725.html); las elecciones de issuer/audience/TTL/alg anteriores son propuestas de este proyecto, no requisitos adoptados automáticamente.

## Administración separada
Admin pertenece a una persona autorizada por proveedor OIDC/MFA, no una cuenta técnica del juego. Su sujeto es (issuer,sub) de ese proveedor, con audiencia two-sides-admin-api y claves/perfil de validación separados. Seleccionar proveedor/issuer real en fase de panel; validar sus access tokens mediante discovery/JWKS confiables fijos y algoritmos allowlist de su perfil aprobado. No asumir que su ID token es access token ni reusar el JWT player. Rol admin y scope stats:read se derivan de asignación server-side aprobada, nunca registro/body/nombre.

| Ruta/clase | Principal permitido | Control adicional |
|---|---|---|
| Registro/sesión técnica | Público acotado / prueba de credencial | No acepta role/admin/scope; cuotas antes de trabajo costoso. |
| /api/v1/technical/me | Player autenticado | Identidad propia/binding vigente. |
| /api/v1/sync/* | Player con scope específico | Propietario account+installation; objetos ajenos no se consultan por ID arbitrario. |
| /api/v1/admin/statistics | Admin stats:read | Proveedor/audiencia propios, MFA y mínimo agregado. |
| Rotación/revocación futura | Permiso y prueba definidos | No existe endpoint ahora; diseñarlo antes de exponerlo. |

403 por privilegio insuficiente;401 por token inválido. Denegar por defecto. No existe promoción player→admin. Windows Administradores o propietario de archivo NO asigna admin en API. Navegador nunca tiene clave de Mongo/JWT; sesión web requiere HttpOnly/Secure/SameSite+CSRF cuando corresponda, CORS allowlist según origen exacto y sin wildcard credencial. No configurar CORS de player como sustituto de estas comprobaciones.

## Seguridad sync frente a cliente modificado
B05.1 contempla TLS, binding/owner, schemas strict,100operaciones/256KiB, límites por operación, cuotas/rate limits, recibos+índices, reintentos/401 acotados y separación admin. Todo sigue PROPUESTA, no controles ya implementados. Confirmación recibida no vuelve remota la autoridad del juego.

Un cliente modificado puede falsificar decisiones, completions, muertes/ausencia de muertes, offsets, sesiones, final y fechas; poseer credencial solo demuestra el principal que reportó. Servidor puede rechazar combinaciones imposibles según contrato, duplicados, solapamientos, finales incoherentes con reject, versiones desconocidas y volumen/velocidades implausibles. Marcar anomalies/quarantine sin borrar progreso local ni “corregir” historia reportada. No puede probar metas físicas offline o estadísticas imposibles de falsificar completamente. Agregados derivan de hechos únicos validados estructuralmente, no totales enviados. Mostrar cobertura y procedencia; límites de rate/heurísticas no son anticheat absoluto.

## Persistencia, archivos y pruebas futuras
Pendientes durables: cuentas/verificadores, registrations únicos, binding de instalación, sesiones/jti/version/revocación y cuotas compartidas. Modelos Mongo e índices (registrationId; account+installation; tokenHash o jti; unicidad de binding) y transacciones/errores deben ensayarse en namespace sintético aislado. No usar MemoryRepository para cuentas reales o garantizar idempotencia tras reinicio. DPAPI y la asociación SQLite son parte local separada; Atlas requiere B00 resuelto, secrets/TLS/red/env aprobados y permiso de conexión explícito.

Archivos previstos, no editados:
- backend/src/modules/auth/auth-service.js/memory-repository.js/credential-hasher.js y modules/identity/identity.js: puertos async durables, binding/version y conservar fixtures.
- backend/src/middleware/security.js/rate-limiter.js; nuevos authentication.js/authorization.js y jwt-verifier.js si JWT se aprueba. app.js/server.js/config/server.js para composición/config estricta.
- backend/src/database/mongodb: connection.js/identity-repository.js/indexes.js nuevos, previa decisión driver/Mongoose y autorización de dependencias.
- backend/package.json/lock solo con aprobación de librería JWT/validación/BD; ninguna instalada ahora.
- integration/sqlite/ProtectedIdentityStore.cs y IdentityCoordinator.cs propuestos; GamePersistenceAdapter/LocalGameState/GamePersistenceContext y GameApplicationContext para puertos de identidad sin gates remotos en gameplay.
- Extensión de metadatos de instalación/binding y pruebas con nueva migración solo si se autoriza; bases actuales no se adoptan/migran aquí.
- backend/tests unit/integration de identidad, JWT/roles/binding; fixtures C#/Windows de protección/reinicio sin secretos reales.

Pruebas propuestas: secreto correcto/distinto/registro duplicado concurrente; servidor reiniciado; blob/DB/ACK interrumpidos; credencial perdida/clone; token expirado/nbf futuro/aud/iss erróneo/alg none o HS256/kid desconocido/firma falsa/token admin en player y viceversa; rol admin inyectado, BOLA, revocación/rotación/key rollover, quotas/proxy/CORS/CSRF según perfil; logs sin datos; outage de auth/sync sin bloquear juego. Pruebas JWT solo sintéticas con claves efímeras; no crear claves reales en esta auditoría. Reejecutar regresiones offline solo cuando haya código autorizado.

## Puertas para B05.2B
1. Elegir y autorizar la corrección ACL concreta con su inventario/rollback, sin dar B00 por resuelto con una propuesta.
2. Resolver alcance de SID B y permisos de herramientas antes de declarar un almacén de secretos seguro.
3. Aprobar ruta privada/protección de credencial y lifecycle/recuperación; cualquier escritura fuera de la copia necesita permiso de entorno y tarea.
4. Decidir conservar opacos o adoptar el perfil JWT; roles admin separados y endpoints/versiones aprobados. JWT no es requisito técnico para comenzar identidad local.
5. Autorizar archivos/dependencias/fixtures/migraciones exactos. No implica Atlas real, despliegue, cola B05.3 o manipular bases protegidas.

B05.2A completada solo como auditoría. Código, credenciales, cuentas, JWT, roles y servicios no fueron modificados/creados/ejecutados.



## B05.2C — JWT y roles aislados (2026-10-27 Guatemala)

**COMPLETADA EN CÓDIGO Y PRUEBAS AISLADAS.** No persistencia MongoDB, conexión Godot, producción, cambios ACL o B05.3. B00 sigue pendiente. Las598 pruebas del juego y su validación manual son antecedentes, NO reejecuciones de esta fase.

### Inventario exacto
Producción/dependencias,6 modificados:
- backend/src/app.js: composición JWT opcional explícita y rutas versionadas, conserva rutas legadas.
- backend/src/server.js: rechazo de producción antes de abrir listener.
- backend/src/utils/errors.js: error forbidden sanitizado.
- backend/src/modules/auth/memory-repository.js: role player asignado por servidor, búsqueda de sesión por ID y fixtures sintéticos controlados; opción sin alias/email interno para JWT.
- backend/package.json y package-lock.json: dependencias exactas/scripts de pruebas.

Producción,5 nuevos:
- backend/src/config/jwt.js: configuración criptográfica sintética validada, sin .env/fallback.
- backend/src/modules/auth/jwt-schemas.js: Zod strict para registro/sesión.
- backend/src/modules/auth/jwt-service.js: firma/verificación y lifecycle de sesión reutilizado.
- backend/src/middleware/authentication.js y authorization.js: principal validado, roles y propiedad.

Pruebas/herramientas,3 nuevos: backend/tests/jwt/jwt.test.js, tests/jwt/env-guard.js y vitest.config.js.
Documentación,7 actualizados: B05_IDENTITY_IMPLEMENTATION_PLAN, B05_IDENTITY_AND_SECURITY_PLAN, B05_IMPLEMENTATION_ROADMAP, B05_SYNC_API_CONTRACT, PHASES, PHASE_HISTORY y DECISIONS.
Total21 archivos deliberados, más dependencias/caché npm generadas. Ningún archivo del videojuego/SQLite/evaluador/estadísticas fue editado.

### Dependencias y compatibilidad
Antes de instalar se comprobó que no había biblioteca JWT/Zod/Vitest adecuada instalada. Consultadas fuentes oficiales y versiones públicas del registro. Se agregaron **jose6.2.13**, **zod4.6.7** y **vitest5.0.5** (dev), con lockfile. Node observado24.19.0/npm11.17.0 compatibles con sus engines. No scripts de instalación, audit/fund automáticos, Mongo/Mongoose o nuevas librerías de Godot.
Comandos de instalación exactos con --save-exact/--ignore-scripts/--no-audit/--no-fund y caché local .npm-cache. La configuración npm inicial era offline; se habilitó acceso al registro público solo por opción de comando, sin cambiar config global o usar .env.
Fuentes de API: [jose](https://github.com/panva/jose), [Zod](https://zod.dev/api), [Vitest](https://vitest.dev/config/). Las versiones usadas se fijan en package/lock; no se supone que “latest” permanezca igual.

AuthService y CredentialHasher conservan su código funcional. JWT reutiliza registro, Argon2id y sesión/revocación acotada en memoria existentes; la respuesta opaca transitoria de ese flujo se usa internamente para localizar la sesión y se descarta, NO se devuelve por el endpoint JWT. No se acepta ese valor como mecanismo alternativo en rutas JWT.

### Contratos HTTP efectivamente implementados
Se activan SOLO con createApp({jwt:configSintéticaValidada,jwtRepository?:repoDeFixture}); defaultapp/server NO genera claves ni habilita esas rutas automáticamente.
| Ruta | Entrada/autorización | Resultado |
|---|---|---|
| POST /api/v1/technical/registrations | schemaVersion1,registrationId UUIDv4,credential CSPRNG32bytes base64url43; Zod strict |201/200 idempotente en proceso, schemaVersion/registrationId/technicalAccountId/registrationStatus. No nombre/email/role permitido o devuelto. |
| POST /api/v1/technical/sessions | schemaVersion1,technicalAccountId UUIDv4,credential; strict |200 JWT Bearer/expiresIn900/ID técnico. Rol no solicitado por cliente. |
| GET /api/v1/technical/me | JWT válido, player o admin | Solo identidad propia y rol del servidor. |
| GET /api/v1/players/:id | JWT válido, player,params.id===principal.id | Recurso mínimo de prueba: ID propio; otro dueño403. No implementación de partidas/stats. |
| GET /api/v1/admin/status | JWT válido y admin | Estado aislado mínimo; no panel ni métricas/globales. |

Las rutas sin /v1 conservan tokens OPACOS y sus contratos/tests previos. El repositorio JWT es separado del legado. JWT en /api/identity/me recibe401; opaco en /api/v1/technical/me recibe401. No “adivinar mecanismo” por formato ni aceptar dos incompatibles en una misma ruta. Sin configuración JWT, esas rutas versionadas devuelven404.

El body estrecho de B05.2C NO implementa todavía el binding installationId/localPlayerId/bindingGeneration ni el lote de B05.1. La propuesta anterior que usa esas rutas con más campos sigue pendiente: deberá versionarse/ampliarse de manera explícita, no aceptar silenciosamente esos campos ahora. No registrar install remoto real.

### Perfil JWT único de este entorno
-Algoritmo allowlist **RS256**, claves CryptoKey RSA>=2048/SHA-256 generadas en RAM por fixtures del servidor. Private key nunca en Godot, disco, .env o informe.
-Header únicamente alg/typ/kid; typ=at+jwt,kid configurado. Rechazar none/HS256/algoritmo inesperado, tipo incorrecto, keyID desconocido y encabezados adicionales (incluidas URL de claves remotas). Sin fetch de JWKS.
-iss exacto reservado https://two-sides.test.invalid; aud exacta escalar two-sides-isolated-api. Son identificadores de test, no destinos de red ni emisor productivo.
-sub UUID técnico; jti UUID de sesión conocida; iat/nbf/exp enteros seguros obligatorios; nbf=iat,iat no futuro, exp−iat900s. Se valida firma, issuer, audiencia, tipo, fecha actual inyectable y sin tolerancia de reloj en este perfil aislado.
-role obligatorio player/admin; cv versión de credencial positiva. No autorizar por claims sin verificar.
-Después de validar JWT, buscar sesión viva/jti y cuenta activa en memoria: mismo sub,cv y rol que repositorio. Rol firmado inconsistente con servidor, sujeto/sesión inexistente o versión revocada→401.
-Sin token/token inválido/expirado/firma mala→401 genérico. Token válido sin rol/propiedad autorizados→403 forbidden. No revelar motivo criptográfico, token, credencial, PHC o stack.
-Revocación individual/por credentialVersion y límite3 sesiones/cuenta reutilizados. Renovar mediante reautenticación, no nueva identidad/refresh token. El JWT NO es stateless mientras se requiera este estado de sesión/revocación.

### Roles e identidades
Registro público siempre crea player; Zod rechaza role/admin/scope/email/displayName y otros campos extra. MemoryRepository.seedSyntheticAccount solo funciona con capacidad de fixture opt-in, nunca accesible por HTTP; fixtures generan admin en memoria. No cuenta admin real ni autopromoción. Admin solo tiene rutas expresamente autorizadas (me/status), no permiso general para recursos player; player no entra en admin y no consulta a otro usuario existente.

Nuevo flujo JWT no inventa correos: includeInternalEmail=false. El contrato legado conserva su alias reservado previo por compatibilidad; no se introducen correos personales o nueva semántica en Godot. Identidad técnica no usa nombre visible; esta fase no conecta ningún formulario de login al juego.

Esto no implementa proveedor OIDC/MFA administrativo de producción del plan B05.1, gestión multinstalación/DPAPI, recuperación/rotación de claves de usuario ni persistencia durable. Son dependencias posteriores separadas.

### Configuración y secretos
validateJwtConfig exige mode isolated-test,algoritmo/issuer/audiencia/keyID/claves públicas/privadas compatibles explícitos; no clave por defecto ni generación al importar app. Los tests generan claves/credenciales/verificadores sintéticos en memoria. Los valores inválidos “test” en casos negativos son marcadores rechazados, no claves compartidas de funcionamiento.

server.js **rechaza NODE_ENV=production incondicionalmente** antes de escuchar: ni claves ausentes/vacías/default/test ni configuración aparente hacen productivo un repositorio de memoria. No se anuncia un modo productivo seguro ya implementado. La aplicación por defecto sigue siendo base local loopback con contratos legados; solo tests/composición explícita activan JWT.

Futura ejecución productiva deberá diseñar/validar NODE_ENV,JWT_ISSUER,JWT_AUDIENCE,JWT_KEY_ID,JWT_PRIVATE_KEY_REF y JWT_PUBLIC_KEY_REF como referencias a material privado fuera de OneDrive/gestor de secretos, sin valores productivos aquí. Esos nombres son requisitos futuros, NO variables que se hayan cargado de .env o un parser productivo ya conectado. Rotación/kid/validación cruzada de claves y persistencia deben autorizarse antes de habilitar producción.

### Aislamiento de .env y pruebas
Vitest envDir=false; bootstrap y setup env-guard bloquean readFile/open/createReadStream sync/async sobre nombres .env antes de llegar al sistema de archivos. También se carga en el comando legacy y en el subproceso nuevo de arranque productivo rechazado. Un test comprueba que el bloqueo lanza antes de leer; no inspecciona contenido. Nunca dotenv ni credenciales reales.

Servidores de integración solo efímeros127.0.0.1/puerto0, todos cerrados al finalizar. Sin Atlas, cuentas reales o sockets remotos durante tests; instalación de dependencias solo consultó registro público.
Primer intento de npm test fue bloqueado antes de los casos por spawn EPERM del sandbox; se reejecutó con permiso de procesos hijos/loopback. No se “corrigieron” ACL para ejecutar.

### Resultados finales
**89 pruebas backend aprobadas,0 fallidas finales:39 regresiones node:test conservadas y50 nuevas Vitest.**
Comandos: npm test (test:legacy seguido test:jwt); reejecuciones focalizadas npm run test:jwt tras endurecer audiencia/headers y comprobar acceso cruzado entre dos cuentas existentes. No sumar repeticiones.

Cobertura nueva: registro idempotente sin correo, Argon2id positivo/negativo, credenciales erróneas, perfil JWT completo y firma, player propio/ajeno, admin sintético y restricciones, registro/sesión con rol extra rechazados, token ausente/malformado/alterado/sin firma/otra clave/HS256, issuer/audiencia/subject/exp/iat/nbf/jti/cv/tipo/kid/headers inválidos, rol firmado desconocido/inconsistente, expiración exacta/reautenticación/revocación, incompatibilidad opaco/JWT, límites de registro/sesión/recursos, configuración ausente/vacía/test/algoritmo indebido, producción rechazada, .env bloqueado, fixture admin restringida, rutas JWT no activadas por defecto, ausencia de Mongo/Mongoose/Atlas y pérdida de memoria al reiniciar.
39 regresiones anteriores cubren rutas/errores/Argon/pool/rate limit/registro concurrente/expiración/revocación y loopback. No eliminadas ni modificadas para hacerlas pasar.
No errores nuevos de parse/ejecución en suite final. JavaScript se ejecutó con Node/Vitest; no se compiló ni inició Godot. Las598 comprobaciones de juego no se ejecutaron porque no se cambió su código.

### Integridad y límites de verificación
Tres bases protegidas y9 archivos asociados conservan hash/tamaño/fecha exactos antes/después. .env COINCIDE con referencia histórica; metadata/SDDL/owner de archivo/backend/raíz iguales. Cuatro Deny explícitas .git intactas; no Set-Acl/takeown/herencia/propietarios o restauración de respaldo. B00 y las dos Allow desconocidas siguen sin corregir.

Se contrastaron677 archivos del juego y raíz con metadata/DACL del respaldo privado previo, sin diferencias, y23 archivos existentes de backend/src/tests/package contra su seguridad previa, sin diferencias. No se leyó contenido de partidas o secretos para esos contrastes. No afirmar que esta comparación de metadata equivale a hash por archivo de todo el juego.

El manifiesto global de protección inicial incluía .npm-cache; instalación y npm crearon entradas/cambiaron caché y logs, por lo que su digest global NO coincide. Es un efecto esperado de dependencias/caché, no se presenta engañosamente como “todos los archivos idénticos”. Se documentan por separado las comprobaciones de bases, .env, ACL y juego. No se tocaron escenas/FinNivel/Final/MenuNiveles/LocalGameState/GamePersistenceAdapter/decisiones/estadísticas/partidas/evaluador.

### Próximo paso y puertas
B05.2C finaliza aislada. Identidad/roles/sesiones desaparecen al reiniciar servidor; no es cuenta persistida en Mongo, identidad sincronizada de Godot ni seguridad de producción. B00, secretos fuera de OneDrive, binding/DPAPI, repositorio durable, migración de contratos de instalación, admin OIDC/MFA y gestión de claves quedan pendientes.
Recomendar revisión del contrato JWT aislado y plan de persistencia/identidad duradera con fixtures antes de cualquier conexión; resolver por separado seguridad de secretos/ACL. No usar este servidor con jugadores o secretos reales ni empezar cola B05.3 por inferencia. Trabajo detenido.


## B05.2D.1 — Identidad persistente y claves (2026-10-27 Guatemala)

**COMPLETADA únicamente como auditoría y diseño; sin implementación.**

Implementación futura: puerto de repositorio asíncrono, adaptador MongoDB transaccional, índices reales, sesiones duraderas, proveedor/keyring persistente y rutas/token v2 explícitos. Inventario detallado de archivos y pruebas en B05_IDENTITY_PERSISTENCE_TEST_PLAN.md. No se cambió código ni se instaló dependencia.

Contratos: [identidad persistente](B05_PERSISTENT_IDENTITY_CONTRACT.md), [ciclo de claves](B05_JWT_KEY_LIFECYCLE.md), [plan de pruebas](B05_IDENTITY_PERSISTENCE_TEST_PLAN.md). Las propuestas no habilitan producción ni modifican contratos implementados. Backend/.env conserva la referencia histórica; las tres bases y sus asociados permanecen protegidos. B00 no resuelto: dos Allow no identificadas; respaldo privado y ensayo limitado no garantizan restauración general. Detenido a la espera de autorización, sin iniciar B05.2D.2/B05.3.


## B05.2D.2 — Inventario implementado aislado (2026-10-27 Guatemala)

Puerto nuevo: src/modules/auth/identity-repository.js.
Código existente modificado: src/modules/auth/auth-service.js (await y binding), jwt-service.js (mismo motor RS256, perfil v2/estado async/503), jwt-schemas.js (strict v2), src/middleware/authentication.js (preserva 503 seguro), src/app.js (composición opcional/rutas v2) y vitest.config.js (incluye batería nueva).

Pruebas nuevas: tests/identity-persistence/persistence.test.js y support/{encrypted-store.js,synthetic-repository.js,key-provider.js,private-workspace.ps1,harness.js,restart-worker.js}. Adaptadores de prueba fuera de src, puerto reutilizable en src. Sin dependencias nuevas ni cambios package/lock. Documentación: únicamente los nueve archivos autorizados por la sección17 de B05.2D.2; B05_SYNC_API_CONTRACT conserva su propuesta histórica y no se editó.

Contrato efectivo v2 y límites del adaptador en B05_PERSISTENT_IDENTITY_CONTRACT; cifrado/continuidad/custodia en B05_JWT_KEY_LIFECYCLE; pruebas e incidencias en B05_IDENTITY_PERSISTENCE_TEST_PLAN. El snapshot único agrega identidad/vínculo/recibo/verificador/sesiones atómicamente; no sustituye modelos/índices/transacciones Mongo. Repositorio futuro deberá implementar el puerto async y sus verificaciones de estado/CAS, no copiar garantías del fichero a Atlas.

Pendientes detenidos: Mongoose/driver y entorno sintético Mongo, rotación operativa/keyring, recuperación/enrollment/cliente protegido, admin humano, custodia productiva y B00. No se implementaron endpoints de rotación/suspensión pública para suplir decisiones aún pendientes. No iniciar B05.3.


### Cierre verificado B05.2D.2 — 2026-10-27 Guatemala

**COMPLETADA EN CÓDIGO, únicamente en el ámbito sintético autorizado.** Resultado final de npm test: **124 aprobadas, 0 fallidas, 0 omitidas**: 39 legacy node:test + 50 regresiones JWT B05.2C + 35 nuevas (26 memoria/contrato/HTTP y 9 archivo/aislamiento). No sumar reejecuciones. Todos los procesos Node y listeners de ensayo terminaron; cero directorios identity-d2-* de ensayo restantes.

Inventario final: 23 archivos deliberados (15 existentes modificados y 8 nuevos): seis código/config de pruebas existentes, un puerto src nuevo, siete archivos nuevos de batería/soporte y nueve documentos autorizados. De 4.839 archivos iniciales inventariados fuera de .git/node_modules/.godot y .env separado, 4.824 permanecen idénticos en hash/tamaño/mtime; ocho añadidos, cero eliminados. No otros cambios de contenido detectados. El lector del manifiesto usa UTF-8 explícito para no confundir nombres con Ñ como altas/bajas.

Tres bases protegidas y nueve archivos asociados: hash/tamaño/mtime idénticos. Backend/.env coincide con referencia histórica y conserva tamaño, fecha y descriptor/propietario; sin lectura de valores. SDDL/owner de raíz, backend, .env y .git idénticos antes/después; no comandos de cambio ACL/herencia/owner. No se afirma una nueva auditoría completa de ACL por archivo de todo el árbol. B00 sigue pendiente con ambas Allow investigadas y cuatro Deny Git conservadas.

No dependencias nuevas, Atlas, AWS, Godot, SQLite/SQL/migración, secretos reales ni producción. Persistencia Mongo/índices/transacciones, recuperación de usuario, DPAPI, keyring/rotación productivos y admin OIDC pendientes. El ensayo de archivo no acredita Atlas ni recuperación de apagón o fin del orquestador. Recomendación: revisión y autorización específica antes de cualquier B05.3; **B05.3 no iniciada, trabajo detenido**.
