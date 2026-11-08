# Historial de fases

## B05.4C.2F.1B ? Implementaci?n local de coordinaci?n durable

- Fecha: 2026-10-29, America/Guatemala. COMPLETADA EN C?DIGO; no garant?a remota validada.
- Modelos de identidad/v?nculo, guard de propietario, sesiones y comandos de revocaci?n; misma ClientSession con operaciones/recibos. Escritura conflictiva com?n y revalidaci?n tras retry. Sin reemplazar el adaptador sint?tico persistente.
- 462 pruebas backend aprobadas: 41 nuevas y 421 regresiones. Intercalaciones reales de callbacks sobre doble optimista, proceso hijo sint?tico, revocaci?n de identidad/sesi?n/v?nculo, recibos hist?ricos y JWT revocado. Primeros fallos de composici?n de fixtures corregidos; sin omitidos finales.
- No Atlas, credenciales, .env, SQLite, Godot, ACL, propietarios, AWS o B05.5. No se recalcularon hashes de archivos protegidos. B00 pendiente.
- F.2 contin?a deshabilitada; pr?ximo paso requiere autorizaci?n de integraci?n Mongo sint?tica y revisi?n de manifiesto, ocho namespaces, ?ndices y limpieza exacta. [Informe completo](B05_DURABLE_REVOCATION_IMPLEMENTATION.md).


## B00 — Arquitectura y documentación

- Fecha: 2026-10-24, America/Guatemala.
- Objetivo: planificar desde cero, separar responsabilidades y establecer control de fases.
- Cambios realizados: arquitectura local primero; registro técnico invisible propuesto; recuperación pendiente explícita; cola durable y confirmaciones por evento; estructura modular futura; requisitos trazables; plan B00–B11; decisiones confirmadas y pendientes separadas.
- Archivos creados: `backend/docs/ARCHITECTURE.md`, `backend/docs/REQUIREMENTS.md`, `backend/docs/PHASES.md`, `backend/docs/PHASE_HISTORY.md`, `backend/docs/DECISIONS.md`. Único directorio creado: `backend/docs/`.
- Archivos existentes modificados: ninguno.
- Pruebas ejecutadas: revisión documental de requisitos y fases; comprobación de ruta y directorios sin enlaces; árbol final limitado a `.env` y los cinco documentos; verificación de tamaño, SHA-256, atributos, permisos y fecha de modificación de `.env` antes/después. No se ejecutaron pruebas de software porque no se creó código funcional.
- Resultado: BLOQUEADA por discrepancia de permisos de `.env` en la verificación final. Documentación entregada; no declarar aceptación completa. Las decisiones técnicas pendientes también deben resolverse antes de su implementación correspondiente.
- Integridad de `.env`: 278 bytes. SHA-256 anterior y posterior: `4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928`. Atributos y fecha de modificación sin cambios; contenido nunca impreso ni copiado. Referencia de modificación UTC en ticks: `639277247382771017`. La ACL final contiene una entrada heredada adicional de acceso `0x1301bf`, ausente al inicio. No se ejecutaron comandos para cambiar permisos; la causa no se determinó. No se intentó restaurarlos porque `.env` está protegido contra modificaciones.
- Problemas encontrados: discrepancia de ACL descrita arriba. La recuperación tras reinstalación y el registro con respuesta perdida necesitan decisiones explícitas antes de implementar; el nombre visible no puede resolverlos.
- Decisiones tomadas: registrar D01–D10 como requisitos confirmados; P01–P11 permanecen propuestas pendientes. No elegir automáticamente mecanismos criptográficos, versiones ni parámetros.
- Restricciones verificadas: sin dependencias instaladas, servicios, código, cuentas, endpoints, conexiones Atlas ni operaciones SQLite; sin escritura fuera de `backend/docs/`, cambios Godot o proyecto original.
- Próximo paso: investigar la discrepancia de permisos sin modificar `.env` y resolver el bloqueo de B00. Después, solicitar autorización para B01; no iniciarla automáticamente. Resolver las decisiones pertinentes de P11 en su alcance.

## Estado de las fases restantes

B01, B02 y B03: COMPLETADAS en sus alcances documentados; B03.1 documental y B03.2 local en memoria verificadas. B04: EN_PROCESO; B04.1, B04.2A, B04.2B.1 y B04.2B.2A completadas en sus alcances. B04.2B.2B.1 COMPLETADA en cierre documental tras las seis decisiones confirmadas del usuario y preparación B05; condiciones de final/desbloqueos no definidas y detalles funcionales siguen como dependencias. B04.2B.2B.2A COMPLETADA en perfil/partidas iniciales mediante API C# sin escena; integración visual pendiente. B04.2B.2B.2B autorizada con núcleo de progreso/bloqueo/decisiones validado y resultado PARCIAL por disponibilidad real pendiente; sin UI/B05. B05–B11: PENDIENTE. B00 permanece BLOQUEADA por riesgo ACL histórico. La infraestructura SQLite está referenciada y compilada con Godot C#, con API local básica de perfil/partidas y sin conexión a escenas, ejecución del motor o persistencia de producción/DPAPI. Ver [PHASES.md](PHASES.md) y contratos de progreso real para alcance y aceptación.

## B01 — Estructura base Node.js + Express

- Fecha: 2026-10-24, America/Guatemala.
- Objetivo: base modular funcional local con health y pruebas, sin autenticación, bases de datos ni conexiones externas durante la ejecución.
- Autorización: solicitud expresa B01 del usuario. Permite continuar conservando la discrepancia ACL como riesgo pendiente, sin modificar permisos ni utilizar credenciales reales. B00 permanece BLOQUEADA; no se reescribe su resultado histórico.
- Ruta: `C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend`.
- Cambios realizados: aplicación Express exportada separada del arranque; `GET /api/health`; 404 JSON; error 500 genérico; cabecera identificadora deshabilitada; puerto no sensible `PORT` validado, valor por defecto 3000 y puerto efímero 0 permitido para pruebas; host fijo `127.0.0.1`; manejo de arranque fallido y señales de cierre. Sin carga de `.env`, dotenv, credenciales, auth, estadísticas ni sincronización.
- Archivos creados: `.gitignore`, `package.json`, `package-lock.json`, `src/app.js`, `src/server.js`, `src/config/server.js`, `tests/unit/app.test.js`; siete `.gitkeep` en `src/modules/{identity,auth,statistics,sync}/`, `src/database/mongodb/`, `src/middleware/` y `src/utils/`. Caché `.npm-cache/`, temporales `.tmp/` y dependencias `node_modules/`, todos locales al backend e ignorados por Git.
- Archivos existentes modificados: solo `docs/PHASES.md` y `docs/PHASE_HISTORY.md`. No se eliminó ningún documento de B00. Las decisiones originales y los otros tres documentos permanecen sin cambios.
- Versiones utilizadas: Node.js v24.19.0, npm 11.17.0, Express 5.3.0 fijado exactamente; módulos ES; pruebas integradas `node:test` y HTTP nativo, sin dependencias de desarrollo.
- Procedencia y revisión previa: metadatos de Express consultados en `https://registry.npmjs.org`; sin scripts de instalación declarados. Se generó primero el lockfile mediante `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`, con registro y caché explícitos. Se comprobó que los 65 paquetes resueltos tienen URL del registro oficial, integridad y ausencia de `hasInstallScript`. Después se ejecutó `npm ci --ignore-scripts --no-audit --no-fund` con la misma caché dentro del backend y TEMP/TMP locales. No se realizaron instalaciones globales ni se actualizaron Node/npm.
- Dependencias instaladas: únicamente Express como dependencia directa y 64 paquetes transitivos; cero dependencias directas de futuras fases. `package.json` y lockfile verificados como consistentes.
- Referencias oficiales consultadas: [versiones de Node.js](https://nodejs.org/en/about/previous-releases), que identifica la rama 24 como LTS, e [instalación de Express](https://expressjs.com/en/starter/installing/), compatible con Node >=18. La elección en B01 resuelve solo la parte de versiones/dependencias de P11; no resuelve sus decisiones futuras de seguridad y operación.
- Pruebas ejecutadas: comprobación sintáctica de los cuatro JavaScript; `npm test`: ocho aprobadas, cero fallidas finales. Cobertura: health HTTP 200 y JSON exacto sin credenciales; 404 genérico; ausencia de rutas de auth/identity/statistics/sync; importación sin escucha ni lectura de `.env` mediante proceso aislado con guardas; escucha loopback; puertos válidos; configuración inválida sin exposición del valor; arranque inválido con salida genérica y código 1. Todas usan dependencias locales y no requieren internet ni Atlas.
- Ejecución local adicional: se inició `node src/server.js` con entorno mínimo y `PORT=0`, se consultó desde el mismo equipo `http://127.0.0.1:51430/api/health`; respondió HTTP 200 y `{"status":"ok","service":"two-sides-backend"}`. El proceso propio PID 20544 fue detenido mediante SIGTERM y se esperó su cierre. Los procesos de pruebas también terminaron; no quedó un servicio propio ejecutándose.
- Problemas encontrados: el primer `npm view` falló con ENOTCACHED en el entorno restringido; se repitió con acceso de red autorizado. La primera resolución del lockfile quedó bloqueada; se detuvo exclusivamente ese npm y se completó con acceso autorizado y reintentos acotados. El intento de inspección de procesos mediante CIM dentro del sandbox devolvió acceso denegado; fuera del sandbox se pudo detener ese proceso. La primera ejecución de pruebas falló antes de ejecutar la suite por `spawn EPERM`; la ejecución autorizada aprobó las ocho pruebas. Hubo dos intentos fallidos de inspección del lockfile por limitaciones de JSON/comillas de PowerShell; la comprobación final con Node por stdin fue satisfactoria. Ninguno de estos problemas requirió modificar `.env` o ACL.
- Integridad de `.env`: 278 bytes al inicio y al final; SHA-256 anterior y posterior `4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928`; fecha UTC en ticks `639277247382771017`, atributos y SDDL completos iguales a los del inicio de B01, incluido el SID adicional pendiente. No se cargaron ni mostraron valores. `git check-ignore` confirma exclusión y las consultas del índice confirman que no está rastreado ni preparado para Git.
- Resultado: COMPLETADA; criterios de B01 verificados. Solo se escribieron archivos del backend de pruebas; sin modificaciones del videojuego, proyecto original o SQLite, sin conexiones Atlas y sin cuentas reales.
- Riesgos pendientes: SID `S-1-5-21-452213140-3335518246-3718727391-3248334987` no resuelto, Allow Modify/Synchronize heredado desde la raíz de la copia. No se modificó ni se dio por justificado; tampoco se adoptó como corrección de B00. Su causa y el acceso efectivo continúan indeterminados. Las ACL locales no determinan el acceso a posibles copias sincronizadas por OneDrive. No utilizar credenciales reales con este servidor B01.
- Decisiones preservadas: Godot solo pide un nombre visible; el backend gestionará identidad técnica con credenciales únicas protegidas; SQLite mantiene el progreso; Atlas recibe estadísticas mediante la API; internet opcional. Los módulos futuros permanecen vacíos.
- Próximo paso: B02 únicamente tras nueva autorización y resolución de las decisiones técnicas que requiera. No iniciar B02 automáticamente; resolver por separado el riesgo pendiente de B00.

## Formato obligatorio para futuras entradas

Registrar identificador, fecha, objetivo, cambios realizados, archivos modificados, pruebas realmente ejecutadas y evidencia, resultado, problemas encontrados, decisiones tomadas y próximo paso. Distinguir pruebas pendientes de resultados observados. Conservar entradas anteriores y añadir correcciones explícitas cuando corresponda. No registrar secretos ni el contenido de `.env`.

## B02 — Diseño del login invisible y contratos de identidad

- Fecha: 2026-10-24, America/Guatemala.
- Objetivo: diseñar identidad y login técnico sin formularios de correo/contraseña, conservando juego offline, progreso local y minimización de datos remotos.
- Autorización y alcance: solicitud expresa B02, exclusivamente documentación en `backend/docs/` y regresión B01. Redefine la fase prevista inicialmente como diseño; no autoriza implementar registro, hashing, tokens, middleware ni cliente. B01 se comprobó COMPLETADA. B00 sigue BLOQUEADA y su SID desconocido permanece como riesgo sin resolver.
- Ruta utilizada: `C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA`.
- Cambios realizados: seis escenarios A–F; identidad local y remota separadas; registro idempotente con credencial como prueba de posesión; contratos propuestos register/session/me; estados de identidad, sesión y cola independientes; almacenamiento protegido candidato en Windows; persistencia cruzada ante caídas; reglas propuestas Unicode; limitaciones de recuperación y del cliente público; nueve ejemplos JSON ficticios.
- Archivos creados: `backend/docs/IDENTITY_DESIGN.md` y `backend/docs/IDENTITY_API_CONTRACT.md`.
- Archivos modificados: `backend/docs/ARCHITECTURE.md`, `REQUIREMENTS.md`, `PHASES.md`, `PHASE_HISTORY.md`, `DECISIONS.md`. No se eliminaron documentos ni se modificó código funcional.
- Decisiones tomadas: conservar D01–D10 sin cambios; precisar P01–P05/P08/P09/P11 y registrar P12/P13 como PROPUESTAS PENDIENTES, no elecciones técnicas aprobadas. El diseño usa `technicalAccountId` como nombre canónico de la identidad remota. Nombre y `localPlayerId` no autentican ni se exportan en los tres contratos propuestos.
- Pruebas ejecutadas: `node --test tests/unit/*.test.js`, mismas ocho pruebas B01; ocho aprobadas, cero fallidas, canceladas u omitidas. Ejecución autorizada para subprocesos y escucha exclusivamente loopback, sin npm/install ni acceso Atlas. Los procesos y listeners de prueba finalizaron. No se inició un servidor persistente ni se probaron endpoints nuevos.
- Revisión documental ejecutada: siete Markdown, presencia de los seis escenarios y tres endpoints, parseo satisfactorio de nueve bloques JSON y resolución de enlaces Markdown locales. Revisión manual de estados, propiedad de datos, respuestas perdidas, secretos ficticios, decisiones pendientes y separación de progreso/estadísticas. Un primer chequeo de encabezados falló por la codificación del guion Unicode al enviar el verificador por stdin de PowerShell; se ajustó solo el comando de comprobación y la revisión final pasó, sin cambiar documentos por ese motivo.
- Integridad de B01: catorce archivos de código, pruebas, `.gitignore`, manifiesto, lockfile y `.gitkeep` comparados con referencia previa; hashes SHA-256 y fechas de modificación idénticos y sin cambios en su cantidad. No se instalaron dependencias ni se modificaron tests.
- Integridad de `.env`: 278 bytes; SHA-256 inicial y final `4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928`. SDDL completo, atributos y fecha UTC en ticks `639277247382771017` iguales a la referencia al inicio de B02. Se calculó hash sin exponer valores ni cargar el archivo como configuración; no se modificaron ACL ni propietario.
- Resultado: COMPLETADA como fase de diseño documental, con regresiones B01 aprobadas. No demuestra login ni recuperación implementados; las pruebas de contratos nuevos quedan para B03 y sus fases dependientes. No se generaron credenciales, tokens utilizables o usuarios; ningún cambio a Godot, SQLite, proyecto original o bases remotas.
- Problemas y riesgos pendientes: SID desconocido con Modify/Synchronize heredado en `.env` sin identificar ni justificar; no se declara resuelto ni se corrige. Pérdida de material protegido podría impedir recuperar identidad; no se promete recuperación por nombre. Un videojuego público no puede impedir por un secreto incrustado que terceros creen sus propias cuentas. Falta aprobar opciones criptográficas, límites, tokens, recuperación y protección local antes de implementarlas.
- Referencias técnicas consultadas: RFC 2606 para `.invalid` y documentación oficial Microsoft de ProtectedData y StringInfo, enlazadas en el diseño. No se seleccionaron bibliotecas ni parámetros por consultar esas fuentes.
- Próximo paso: B03 solo con autorización explícita y decisiones técnicas aplicables confirmadas. Continuar el riesgo ACL de B00 como asunto separado; no usar credenciales reales ni avanzar automáticamente.

## B03.1 — Decisiones definitivas propuestas de autenticación técnica

- Fecha: 2026-10-24, America/Guatemala.
- Objetivo: documentar identificadores, contraseña, hashing, protección Windows, sesiones, registro idempotente, recuperación y contratos necesarios para revisar antes de B03.2.
- Autorización: solicitud expresa B03.1, solo análisis/diseño/documentación y regresiones existentes. No autoriza instalaciones, endpoints, material criptográfico ni B03.2. Ruta exclusiva: `C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA`.
- Revisión previa: se revisaron los siete documentos B00/B01/B02. Antes de modificarlos se registraron las precisiones de TTL ilustrativo 300 frente a propuesta 900, relación perfil/instalación, división de B03 y renovación por reautenticación sin refresh token. Se documentan en la sección 1 de `AUTH_SECURITY_DESIGN.md`; D01–D10 no cambian.
- Cambios realizados: propuesta de UUIDv4 y correo `.invalid`, sin installationId adicional; credencial única por perfil creado en cada instalación; Argon2id con parámetros medibles, salt individual y presupuesto de capacidad; DPAPI CurrentUser y blob por perfil fuera de sincronización; elección justificada de sesiones opacas frente a JWT; 900 segundos, revocación y versión de credencial; límites/errores/TLS; registro idempotente con prueba de posesión; rotación futura sin perder cuenta/eventos; matriz de pérdidas y recuperación voluntaria futura sin correo personal.
- Archivo creado: `backend/docs/AUTH_SECURITY_DESIGN.md`.
- Archivos modificados: `backend/docs/IDENTITY_DESIGN.md`, `IDENTITY_API_CONTRACT.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `PHASES.md`, `PHASE_HISTORY.md`. `REQUIREMENTS.md` no se modificó; los requisitos confirmados permanecen vigentes.
- Decisiones registradas: D11 recoge la preferencia expresa del usuario por Argon2id; T01–T09 son PROPUESTAS TÉCNICAS, no aprobaciones de implementación. Valores concretos pendientes de ratificación: Argon2id v19, 65536 KiB/t3/p1, salt 16 bytes/hash 32 bytes; token opaco 32 bytes/900 s, tres sesiones; DPAPI y ubicación; límites por IP/cuenta/capacidad; rotación y recuperación por contratos adicionales.
- Fuentes consultadas: RFC 9106, OWASP Password Storage y Session Management, Microsoft DataProtectionScope. Enlaces y justificación en `AUTH_SECURITY_DESIGN.md`. La variante p=1 propuesta no se presenta como el perfil RFC de 64 MiB/p=4. No se realizaron benchmarks ni se eligió/instaló biblioteca Argon2.
- Pruebas ejecutadas: `node --test tests/unit/*.test.js`, las ocho regresiones existentes B01. Resultado: ocho aprobadas, cero fallidas/canceladas/omitidas; subprocesos y HTTP exclusivamente loopback, sin instalación ni conexiones Atlas. Finalizaron procesos/listeners de prueba; no queda un servidor persistente propio.
- Revisión documental ejecutada: ocho Markdown; nueve ejemplos JSON parseados satisfactoriamente, enlaces locales existentes, presencia de los tres contratos y marcadores de credencial/token exclusivamente sintéticos e inválidos. Ejemplo de sesión coherente con propuesta 900 segundos. Revisión manual de responsabilidades, estados, códigos HTTP, números de límites, aprobación pendiente y riesgos. No se probaron funciones de identidad inexistentes.
- Integridad funcional: los catorce archivos B01 de código/pruebas/manifiestos/lockfile/gitignore/gitkeep conservan exactamente hashes y fechas iniciales, y la cantidad coincide. No hubo nuevas dependencias ni cambios al código.
- Integridad `.env`: 278 bytes y SHA-256 inicial/final `4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928`; fecha UTC en ticks `639277247382771017`, atributos y SDDL completos idénticos al inicio de B03.1, incluidos propietario y ACL. Solo hash/metadatos, sin imprimir o cargar valores, sin copias ni cambios de permisos.
- Resultado: B03.1 COMPLETADA como diseño documental y revisión. B03 continúa EN_PROCESO porque B03.2 no se autorizó ni implementó; no hay autenticación funcional, tokens o cuentas reales. Sin cambios a Godot, SQLite, proyecto original ni Atlas; sin migraciones/colecciones/índices.
- Problemas encontrados: sin bloqueos nuevos para el diseño. El costo Argon2 y compatibilidad DPAPI/Godot no pueden verificarse solo mediante documentación y quedan explícitamente pendientes. No se atribuye al diseño una seguridad de producción ya validada.
- Riesgos conocidos: SID desconocido `S-1-5-21-452213140-3335518246-3718727391-3248334987` y bloqueo B00 siguen abiertos; sin corrección o justificación de ACL. Registro automatizado de cliente público, compromiso del contexto Windows, pérdida de claves DPAPI, límites compartidos por NAT/bots distribuidos, sesiones robadas y falta de durabilidad en repositorios de prueba conservan sus limitaciones documentadas.
- Próximo paso recomendado: revisar y aprobar propuestas aplicables y alcance B03.2, incluida autorización independiente de instalación/revisión de biblioteca y mediciones. Después implementar solo en repositorios/pruebas aislados si se autoriza. Contratos de recuperación/rotación y despliegue real requieren alcance adicional; no iniciarlos ni usar credenciales reales automáticamente. DETENERSE tras B03.1.

## B03.2 — Implementación local de autenticación técnica

- Fecha: 2026-10-24, America/Guatemala.
- Objetivo y autorización: solicitud expresa B03.2; implementar tres endpoints, hashing, identidad y sesiones exclusivamente con datos sintéticos en memoria. Sin Godot, SQLite, Atlas, `.env`, recuperación o rotación de credenciales. Ruta: `C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend`.
- Verificación previa: raíz/directorio backend normales y correctos; documentos revisados; `.env` 278 bytes y hash esperado; ocho pruebas B01 ejecutadas antes de cambios, ocho aprobadas y cero fallidas. Se registró referencia de hash/metadatos de `.env` y hashes de los tres documentos no autorizados para actualización en esta fase.
- Archivos creados (11): `src/modules/identity/identity.js`; `src/modules/auth/credential-hasher.js`, `memory-repository.js`, `auth-service.js`; `src/middleware/rate-limiter.js`, `security.js`; `src/utils/errors.js`, `work-pool.js`; `tests/unit/identity-auth.test.js`; `tests/integration/identity-api.test.js`; `scripts/benchmark-auth.js`.
- Archivos modificados: `src/app.js`, `package.json`, `package-lock.json` y los cinco documentos `docs/PHASES.md`, `PHASE_HISTORY.md`, `DECISIONS.md`, `AUTH_SECURITY_DESIGN.md`, `IDENTITY_API_CONTRACT.md`. No se borraron archivos o `.gitkeep`. `src/server.js`, configuración de puerto y las ocho pruebas originales B01 no se editaron. `ARCHITECTURE.md`, `REQUIREMENTS.md`, `IDENTITY_DESIGN.md` conservan sus hashes iniciales como registros de diseño anteriores; contrato/seguridad/historial reflejan el estado implementado actual.
- Dependencias y versiones: Node 24.19.0, npm 11.17.0, Express 5.3.0 y nueva dependencia directa @node-rs/argon2 2.2.2, con binario opcional Windows x64 MSVC 2.2.2. Dos dependencias directas en total; ninguna de desarrollo. Instalados 67 paquetes; lockfile con 79 entradas incluyendo variantes opcionales no instaladas de otras plataformas. Coherencia package/lock comprobada.
- Revisión de instalación: metadatos npm y proyecto mantenedor revisados antes de instalar; API asíncrona hash/verify/parseOptions, Node >=10 y Windows soportado. Lockfile generado primero y validado con URLs oficiales, integridad y cero hasInstallScript. `npm ci --ignore-scripts --no-audit --no-fund`, registro explícito, caché y TEMP/TMP dentro de backend; sin compilación/scripts ni instalaciones fuera del proyecto. La carga real del binario y pruebas confirman este Windows/Node 24.
- Implementación: UUIDv4 y credenciales CSPRNG; nombre Unicode validado por helper sin exportarlo/aceptarlo como campo extra de registro. Cliente conserva la credencial original; servidor solo hash y nunca la sustituye tras reintento. Registro 201/200/409 con commits síncronos de unicidad/cupo y verificación de posesión al repetir, incluso tras concurrencia. Cuenta/correo independientes del nombre.
- Hashing: Argon2id v19, m=65536 KiB/t3/p1, salt independiente 16 bytes, salida 32 bytes, PHC con parámetros. Pool por proceso: dos trabajos, ocho en cola y espera dos segundos; 503 al saturarse. Verificación real con función nativa, ficticia equivalente para cuenta desconocida. No registrar contraseñas/hash/tokens y no permitir costos PHC arbitrarios recibidos del cliente.
- Sesiones: tokens opacos aleatorios 32 bytes/900 segundos, solo SHA-256 almacenado; referencia interna sessionId y cuenta/version. Expiración comprobada en cada acceso y revocación por eliminación o versión. Hasta tres sesiones; cuarta revoca más antigua. `/me` deriva cuenta exclusivamente del token, rechaza query/cuerpo/token ausente o inválido. Sin JWT, refresh tokens, cookies o confianza en X-Forwarded-For. Ningún endpoint adicional de recuperación/rotación.
- Seguridad aplicada: JSON UTF-8 y 8192 bytes sin compresión; campos exactos, formato UUID/base64url, no credenciales en query, errores sanitizados, no-store/nosniff/frame/CSP; límites B03.1 de registro, nuevas cuentas, sesión y `/me`. Memoria adicional acotada a 1000 cuentas y 10000 claves de rate limiting; no expulsar cuentas para preservar idempotencia. Todo el estado se pierde al cerrar/reiniciar el proceso y los límites no son distribuidos.
- Pruebas ejecutadas: primera suite 37/37 aprobadas; tras añadir casos de credenciales concurrentes distintas y saturación HTTP, suite final mediante `npm --cache=.npm-cache --logs-max=0 --no-update-notifier --offline test`: **39 aprobadas, 0 fallidas, 0 canceladas, 0 omitidas**, incluidas las ocho regresiones B01 sin modificarlas. Sintaxis de todos los JavaScript de src/tests/scripts comprobada. Las solicitudes HTTP fueron exclusivamente loopback con puertos efímeros y datos generados en memoria; los procesos/listeners terminaron.
- Cobertura observada: UUID/nombres/credenciales, política/salt/hash/verificación, pool/concurrencia/timeout, registro/reintento tras respuesta perdida/apropiación/concurrencia, auth correcta/incorrecta/cuenta desconocida, tokens válidos/ausentes/duplicados/malformados/expirados/revocados/versionados, límite de sesiones, acceso entre cuentas, query/campos/JSON/tamaño/tipo/compresión, rate limiting y proxy falso, respuesta 503 y errores privados sanitizados, repositorios nuevos sin cuentas/tokens antiguos. No se afirman pruebas de DPAPI, migraciones, cliente offline o persistencia remota.
- Rendimiento: `node scripts/benchmark-auth.js`, ocho muestras por operación, hash p50/p95 54,55/61,33 ms; verify 52,34/59,64 ms; hash con dos concurrentes 76,32/84,47 ms (cuatro pares). RSS del proceso inicial 40,82 MiB/pico muestreado 242,33 MiB/aumento 201,51 MiB, intervalo 2 ms; CPU usuario 1375 ms/sistema 110 ms; máximo activo 2. Métricas pequeñas y locales, no garantía productiva ni memoria exacta por hash; explicación y comando reproducible en AUTH_SECURITY_DESIGN.md. No se persistieron datos de credenciales para medir.
- Integridad `.env`: 278 bytes inicial/final; SHA-256 `4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928`; fecha UTC ticks `639277247382771017`, atributos y SDDL completo (ACL/propietario) idénticos a la referencia previa. Solo hash/metadatos, sin valores cargados/impresos/copias. Git confirma que sigue ignorado y fuera del índice.
- Resultado: B03.2 COMPLETADA; B03 cerrada en alcance local por completar B03.1/B03.2. Tres endpoints funcionales locales con Argon2id exacto y verificaciones de seguridad aprobadas, sin credenciales reales, Atlas ni escrituras a Godot/SQLite/proyecto original. No queda un servidor propio de pruebas ejecutándose.
- Problemas encontrados: sin fallos de pruebas o incompatibilidades de parámetros/biblioteca. La petición de validar nombre se resolvió en helper separado respetando el contrato que no lo transmite; no se cambió silenciosamente el registro para generar secretos en servidor. El consumo RSS real supera la memoria nominal de dos hashes, por lo que la capacidad futura debe basarse en mediciones del proceso completo.
- Riesgos y limitaciones: SID desconocido `S-1-5-21-452213140-3335518246-3718727391-3248334987` sigue abierto, B00 BLOQUEADA; no se identificó, justificó o modificó ACL. Estado temporal no duradero/multiproceso, HTTP solo loopback, cliente DPAPI/recuperación/rotación no implementados y antiautomatización limitada por IP/cupos. No usar cuentas o credenciales reales ni publicar como servicio de producción.
- Próximo paso recomendado: B04 (persistencia local) solo tras nueva autorización y alcance explícito de rutas del cliente de pruebas. No modificar SQLite/Godot ni iniciar B04 automáticamente; mantener el riesgo ACL como asunto separado.

## B04.1 — Diseño de persistencia local SQLite

- Fecha de cierre: 2026-10-25, America/Guatemala, según contexto vigente del usuario. La revisión comenzó con contexto del día anterior; no se cambian fechas históricas de B00–B03.
- Objetivo y autorización: solicitud expresa B04.1 para análisis/diseño/documentación y regresiones existentes, sin implementación SQLite, drivers o cambios Godot. Ruta exclusiva: `C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA`.
- Fuentes revisadas: siete documentos backend indicados por el usuario; DOCX `docs/Requerimientos_Two_Sides_v6_corregido.docx`, leído como ZIP/XML en memoria sin extraer; documentos históricos Progreso_Godot, Progreso_Animal_Godot, Decisiones_Biomas_Godot, Tarjetas_Biomas_Godot y Final_Global_Godot. Scripts/símbolos inspeccionados listados en SQLITE_SCHEMA_DESIGN.md: VariablesGlobales, controles de decisión/bioma/jugadores, Estadisticas/FuenteRecurso/ItemRecurso/AlgaEstado, GameStateStore/GameContracts/DecisionCatalog, servicios ambientales/animales/final, menús/tarjetas/Transicion/FinNivel, GameOver/MenuPausa y referencias de bootstrap/conectividad/journal. También se consultaron claves de project.godot y SDK/framework del csproj, solo lectura.
- Hallazgos reales: cinco biomas/decision keys y rutas de escenas; NoJugado/Bueno/Malo, human_pending/animal_pending/completed, healthy/degraded; CurrentHealth y Agua/Comida; agotamiento de recursos; finales good/medium/bad sin fórmula local comprobada. El cliente vigente conserva autoridad y bloqueo remotos del backend anterior; no está integrado con B03.2 ni habilitado offline por esta fase.
- Incompatibilidades registradas: DOCX RNF-006 exige internet y RF-001 exporta progreso a AWS, desplazados por instrucciones actuales offline/SQLite/estadísticas mínimas. Login tradicional y JWT históricos tampoco prevalecen sobre identidad técnica/token opaco. RF-035/RF-036 duplicados y referencias imprecisas se citan con título. RF-021 lineal frente a selección libre actual, derrota/reinicio frente a final negativo y umbrales de final quedan pendientes; no se modificaron documentos de requisitos originales ni se inventaron reglas.
- Archivos creados: `backend/docs/SQLITE_SCHEMA_DESIGN.md`, `backend/docs/LOCAL_SAVE_CONTRACT.md`.
- Archivos modificados: `backend/docs/ARCHITECTURE.md`, `REQUIREMENTS.md`, `DECISIONS.md`, `PHASES.md`, `PHASE_HISTORY.md`. No se editaron los otros documentos de identidad/seguridad/contratos existentes ni archivos de código o pruebas.
- Cambios de diseño: diez tablas conceptuales con diccionario/PK/FK/UNIQUE/NOT NULL/índices/retención; singleton local y una partida actual por índice parcial; historial de decisiones separado de proyección ambiental; payloads acotados/versionados para datos runtime; operaciones idempotentes y revisión optimista; migraciones/compatibilidad/backup y errores; capas desacopladas GameSaveService/unidad de trabajo/repository/adaptadores. Son propuestas de diseño, no DDL, interfaces implementadas o configuraciones aplicadas.
- Continuación y límites: proponer autosave en límites de segmento; exactitud a mitad de recorrido requiere estado actor/recursos/objetos, IDs estables y restauradores hoy ausentes. No prometer checkpoint exacto guardando solo posición ni regenerando recursos. Aplicar ambiente antes de instanciar escena animal. Estado visual derivable no se duplica ni se inventan índices ambientales inexistentes.
- Aislamiento de datos: config/name=TwoSides puede compartir user:// entre copia y original; diseñar namespace y ruta propios antes de cualquier creación. No se consultó AppData ni journal/bases de usuario existentes. El proveedor debe verificar destino local no redirigido/sincronizado; no basta ejecutar desde otra carpeta.
- Integración B05 diseñada: punto de extensión dentro de la misma conexión/transacción para progreso + decisión + evento pendiente + recibo; ID estable conservado en reintentos, HTTP posterior fuera del commit. No tabla outbox final, cola, sincronización o endpoint implementados; partidas no van a Atlas.
- Decisiones: conservar requisitos confirmados; registrar S01–S08 como PROPUESTAS/PENDIENTES sobre driver, ruta/namespace, checkpoints, reglas, formatos, backup/retención, transacciones/migraciones y extensión B05. No elegir biblioteca o umbrales por suposición. Completar diseño no aprueba automáticamente esos valores para B04.2.
- Pruebas ejecutadas: `npm --cache=.npm-cache --logs-max=0 --no-update-notifier --offline test`: **39 aprobadas, 0 fallidas, 0 canceladas, 0 omitidas**, incluidas ocho B01 y 31 B03.2; sin conexiones externas y solo HTTP loopback/datos sintéticos transitorios. Los procesos/listeners finalizaron. No se ejecutó Godot, SQLite, migraciones o pruebas ficticias de persistencia inexistente.
- Revisión documental ejecutada: diez Markdown, diez tablas propuestas, presencia de las once operaciones requeridas, doce bloques JSON parseados y enlaces Markdown locales existentes. Revisión manual de relaciones, orden de inserción FK, recibos/revisiones, fuentes, incertidumbres, escenarios de pérdida, versiones y preservación de estadísticas. Los DTO de ejemplo se identifican como extractos ficticios, no agregados de juego cargables.
- Verificación de archivos: se compararon **256 archivos** de código backend/pruebas/scripts, manifiestos/lockfile, scripts/escenas/documentación del juego, project.godot/csproj y dos scripts UI en assets; mismos hashes SHA-256/fechas y cantidad que la referencia previa. Se inventariaron extensiones de bases en la copia excluyendo dependencias/cachés/Git y no se encontraron archivos SQLite/DB. No se instalaron dependencias ni se crearon bases reales.
- Integridad `.env`: 278 bytes inicial/final; SHA-256 `4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928`; fecha UTC ticks `639277247382771017`, atributos y SDDL completo iguales al inicio, incluidos ACL/propietario. Solo comprobación de hash/metadatos; valores no cargados, impresos, copiados o modificados.
- Referencias oficiales: rutas de datos Godot y SQLite foreign keys, atomic commit, PRAGMA, backup API y WAL; enlaces en SQLITE_SCHEMA_DESIGN.md. Solo consulta web de documentación, no conexión a base o Atlas. Propuesta inicial rollback journal DELETE/FULL/un escritor no es configuración ejecutada.
- Resultado: B04.1 COMPLETADA como diseño con incertidumbres explícitas y regresiones aprobadas. B04 queda EN_PROCESO y B04.2 PENDIENTE; no hay SQLite/Godot implementados ni offline funcional verificado en el ejecutable actual. Ninguna escritura al juego, proyecto original, base o Atlas.
- Problemas/riesgos pendientes: divergencias históricas y reglas de juego incompletas para nuevos evaluadores; IDs/setters de restauración ausentes; posible colisión user:// y corrupción/pérdida física de disco; SID desconocido de B00 sigue abierto sin cambio de ACL. No presentar backup como recuperación garantizada ni actor-only snapshot como mundo completo.
- Próximo paso recomendado: revisar S01–S08 y autorizar explícitamente B04.2 con rutas/namespace, proveedor y política de checkpoints; concretar alcance C# antes de editarlo. No iniciar B04.2, instalar driver o crear/abrir SQLite automáticamente. DETENERSE al finalizar B04.1.

## B04.2A — Implementación aislada de SQLite en C#

- Fecha: 2026-10-25, America/Guatemala.
- Objetivo y autorización: solicitud expresa B04.2A para infraestructura local/proveedor/modelos/esquema/repositorio/servicio/transacciones/migraciones y pruebas reales exclusivamente sintéticas. Sin editar scripts/escenas/csproj existentes, abrir partidas, usar user://, conectar a Node/Atlas o implementar outbox/reglas finales.
- Ruta de proyecto independiente: `C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\local-persistence`.
- Verificación previa: copia y directorios normales, `.env` 278 bytes/hash esperado/metadatos registrados; siete documentos requeridos revisados; TwoSides.csproj leído solo para framework/dependencias: Godot.NET.Sdk/4.6.1 y net8.0, sin PackageReference adicionales. Condición Android net9.0 no utilizada. Rutas reales de jugador no inspeccionadas.
- Estructura y justificación: proyectos propios bajo src/tests, fuentes `.cs.txt` Compile explícito, `.gdignore` y generación de `.cs` desactivada para no entrar indirectamente al glob Godot. No ProjectReference en TwoSides.csproj ni cambios a solución. Framework net8.0, biblioteca sin motor/red, runner autocontenido Win-x64 con .NET 8.0.30; SDK instalado usado 10.0.400, sin instalar SDK/runtime global. La ejecución confirmó .NET 8, no roll-forward a 10.
- Archivos creados (18): `local-persistence/.gdignore`, `.gitignore`, `Directory.Build.props`, `NuGet.Config`, `README.md`, `run-checks.ps1`; `src/TwoSides.LocalPersistence.csproj`, `src/packages.lock.json`, `src/Models.cs.txt`, `src/Validation.cs.txt`, `src/SyntheticSandbox.cs.txt`, `src/SchemaManager.cs.txt`, `src/SQLiteRepository.cs.txt`, `src/UnitOfWork.cs.txt`, `src/GameSaveService.cs.txt`; `tests/TwoSides.LocalPersistence.Checks.csproj`, `tests/packages.lock.json`, `tests/Checks.cs.txt`. Paquetes/runtimes/build/cache y temporales aislados en `.work`, ignorados por Git. Las bases de ejecución se crearon y limpiaron allí.
- Archivos existentes modificados: únicamente `backend/docs/PHASES.md`, `PHASE_HISTORY.md`, `DECISIONS.md`. No se editaron código/paquetes/tests Express, documentos de diseño previos u otro archivo del videojuego.
- Dependencias: directa Microsoft.Data.Sqlite **8.0.32**, versión exacta `[8.0.32]`; transitivas Microsoft.Data.Sqlite.Core **8.0.32**, SQLitePCLRaw.bundle_e_sqlite3/core/lib.e_sqlite3/provider.e_sqlite3 **2.1.13**, System.Memory **4.5.3**. Engine observado **SQLite 3.53.3**. Lockfiles fijan resoluciones/hashes. No previews/RC ni ORM/test framework/driver Node añadidos.
- Revisión y aislamiento NuGet: configuración de usuario inspeccionada solo en metadatos (nuget.org, sin credenciales), sin cambios. Config local limpia fuentes/fallbacks; comandos fijan CLI home, paquetes, HTTP/plugins cache, scratch, TEMP/TMP y build dentro de `.work`. Activos muestran solo esa carpeta de paquetes; fuentes efectivas nuget.org y library-packs de SDK instalado en solo lectura. Todas las nupkg.metadata descargadas indican nuget.org. Targets de paquetes revisados sin Exec. NuGetAudit desactivado: no afirmar auditoría de vulnerabilidades. Restore posterior en locked-mode satisfactorio.
- Activos de toolchain: packs host/ref/runtime Microsoft.NETCore.App 8.0.30 y ref/runtime Microsoft.AspNetCore.App/Microsoft.WindowsDesktop.App 8.0.30 quedaron en la caché privada; no instalaciones globales ni nuevas referencias del juego. El ejecutor utiliza el runtime core autocontenido 8.0.30 fijado en csproj. Compilación/pruebas posteriores usan --no-restore, sin internet; sin servidores compartidos de compilación/nodos reutilizados.
- Tablas implementadas: local_profiles, saved_games, biome_progress, biome_objectives, environmental_decisions, environmental_state, continuation_snapshots, local_settings, local_operations y schema_migrations. PK/FK/CHECK/NOT NULL/UNIQUE/RESTRICT e índices de B04.1; foreign_keys activadas y comprobadas por conexión. JSON soportado/comprobado, por eso se incorporaron CHECK json_valid junto a validación de dominio. Estado ambiental sigue binario, extensiones vacías y snapshots solo de límite de segmento.
- Migraciones: v1 crea esquema y restricciones; v2 agrega índices de consulta documentados. PRAGMA user_version e historial/checksum se actualizan en el mismo commit por paso, con checksum normalizado LF. Probados v1→v2 preservando perfil, rollback completo de v2, checksum alterado, base sintética desconocida no sobrescrita y versión futura rechazada sin downgrade.
- Contratos implementados: perfil único/lectura/nombre; nueva partida con archivado explícito de anterior; guardado y carga del agregado; decisiones cronológicas/paginadas con consecuencias suministradas por llamador confiable/versionado; progreso por bioma, ambiente, snapshots/punto lógico y continuación; preferencias permitidas; recibos operación/digest/revisión. Las reglas de desbloqueo/final y objetivos reales no se inventan. No se implementa reanudación animal exacta, DPAPI, importación antigua o recuperación productiva.
- Transacciones: GameSaveService → UnitOfWork → SQLiteRepository. Escritura inmediata y valores parametrizados, versión/revisión y recibo antes de efectos, padres/recibos antes de hijos, coherencia completa antes de commit. Reintento válido devuelve recibo original; contenido distinto/conflicto de revisión no sobrescribe. Errores revierten decisiones/progreso/ambiente/captura/recibo. Hook ITransactionalSaveExtension recibe misma conexión/transacción para extensión futura B05; prueba de fallo revierte además el registro sintético insertado por hook. No hay tabla outbox o red en esa extensión.
- Configuración local elegida: journal DELETE, synchronous FULL y busy_timeout **1000 ms**, acotado para tests, frente a propuesta no confirmada de 2000 ms; diferencia documentada sin cambiar requisito del usuario. Pooling deshabilitado, conexiones ReadWrite (no recreación accidental al faltar archivo). API síncrona: futura integración deberá coordinar trabajo fuera del frame, no se anuncia cola Godot ya implementada.
- Aislamiento y eliminación: SyntheticSandbox solo acepta raíz exacta autorizada, subcarpetas UUID nuevas y archivos CreateNew registrados por instancia. Antes de abrir/eliminar comprueba propiedad, ubicación y reparse points, incluidos sidecars. No admite rutas arbitrarias, otra instancia, traversal o un archivo no propio. Cleanup elimina únicamente esos archivos/sidecars conocidos y carpeta vacía, sin borrado recursivo. No user://, AppData, partidas previas o original. La capacidad no abre archivos de producción entre procesos; eso requiere proveedor autorizado posterior.
- Pruebas ejecutadas: `local-persistence/run-checks.ps1 -Restore` para restauración privada y después locked-mode; `run-checks.ps1` compila antes de cada ejecución, --no-restore. Resultado final: **43 pruebas SQLite aprobadas, 0 fallidas, 0 omitidas; compilación 0 errores/0 advertencias**. Pruebas con .NET **8.0.30** real y SQLite **3.53.3**. Runner final comprobó **0 bases sintéticas restantes**.
- Cobertura observada: creación/tablas/índices/FK; singleton/nombre Unicode/perfil; guardado/carga/reapertura/archivo; biomas/decisiones/ambiente/snapshots/checkpoints; rollback total; reintento/conflicto/canonicalización/metadatos temporales; revisión; entradas/propiedad/SQL injection; archivo inexistente/corrupción; migraciones/versión futura/checksum; locks/escritores simultáneos; rutas/limpieza; preferencias/ausencia de secretos; ausencia de dependencias Godot/HTTP y cálculo de reglas finales. No se cuentan como probados cortes eléctricos/daño físico/malware/enlaces hostiles reales/cliente Godot o backups de producción.
- Regresiones backend ejecutadas: `npm --cache=.npm-cache --logs-max=0 --no-update-notifier --offline test`, **39 aprobadas, 0 fallidas, 0 omitidas** (incluidas ocho B01). Solo memoria sintética y loopback, sin conexiones Atlas. Los procesos de pruebas y compilación terminaron; no se inició un servicio persistente.
- Problemas encontrados y corregidos: primera suite 38/39 por rechazo de emoji compuesto con categorías Regex UTF-16, corregido con Rune/StringInfo; luego 39/39. Al añadir normalización de checksum hubo errores de paréntesis de compilación, corregidos antes de la suite final ampliada 43/43. No se declararon aprobadas esas ejecuciones fallidas. No hubo incompatibilidad del proveedor o pérdida de datos reales.
- Verificación final de archivos: **263 archivos protegidos** de Godot/proyecto/escenas/scripts/documentación y backend/manifiestos/tests permanecen con el mismo hash/fecha y cantidad inicial. TwoSides.csproj y project.godot íntegros. No existe archivo `.cs` nuevo en local-persistence (incluidos artefactos); no hay incorporación implícita al proyecto Godot. Carpeta de bases sintéticas vacía; paquetes/cachés/build siguen solo dentro del árbol nuevo ignorado.
- Integridad `.env`: **278 bytes**, SHA-256 anterior/final `4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928`; fecha UTC ticks `639277247382771017`, atributos y SDDL completos iguales al inicio, incluidos ACL/propietario. No se leyeron valores, cargó configuración, copiaron secretos o cambiaron permisos. Git sigue ignorando `.env`.
- Resultado: B04.2A COMPLETADA como infraestructura sintética aislada. B04/B04.2 continúan EN_PROCESO porque la integración B04.2B no fue autorizada ni iniciada. Sin cambios a videojuego/SQLite de producción/original, sin Atlas o nuevos endpoints.
- Riesgos pendientes: SID desconocido `S-1-5-21-452213140-3335518246-3718727391-3248334987` de B00 sigue sin identificar/justificar/corregir; dependencia remota del cliente legado no retirada. Rutas productivas/namespace real, DPAPI, checkpoints exactos/IDs de objetos, reglas/final, backup/retención y outbox/sincronización requieren nuevas fases. Datos de la base no se anuncian cifrados; solo contienen sintéticos no secretos en esta fase.
- Próximo paso recomendado: revisar `local-persistence/README.md` y autorizar B04.2B con rutas y archivos C#/ProjectReference/bootstrap concretos. No reutilizar el sandbox para partidas existentes ni habilitar user:// compartido, reglas no confirmadas o nube automáticamente. DETENERSE después de B04.2A.

## B04.2B.1 — Preparación de integración Godot / SQLite

- Fecha: 2026-10-25, America/Guatemala. Autorización: solicitud expresa B04.2B.1 del usuario. Alcance exclusivamente documental.
- Ruta verificada: C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA. Inspección de la copia autorizada; sin acceso al original. Existen proyecto/configuración, biblioteca y documentación requeridos.
- Creados: backend/docs/GODOT_SQLITE_INTEGRATION_PLAN.md y GODOT_SAVE_ADAPTER_CONTRACT.md. Modificados: backend/docs/PHASES.md, PHASE_HISTORY.md y DECISIONS.md. Ningún cambio implementado en juego o biblioteca.
- Compatibilidad: inspección de TwoSides.csproj y Directory.Build.props/csproj/modelos/servicio/sandbox/runner de local-persistence; net8.0 Windows coincide con Godot.NET.Sdk/4.6.1. Referencias actuales del juego sin PackageReference/ProjectReference; EnableDynamicLoading true y Compile implícito. Android net9.0 fuera de alcance. Fuentes oficiales Godot4.6 y Microsoft sobre runtime/bundle nativo consultadas; referencias en el plan. No se compiló/inició Godot ni probó exportación.
- Fuentes del juego: VariablesGlobales; BiomaMar/Selva/Desierto/Bosque/Nieve; PlayerDelfin/Mono/RataCanguro/Zorro/Oso; Estadisticas; FuenteRecurso/ItemRecurso; DecisionNivel/EnvironmentalDecisionNivel/OceanDecisionNivel/DesicionNieve/DecisionSceneFlow; InfoDecision, FinNivel/AnimalSegmentFlow, MenuPrincipal/MenuNiveles/RecoveryScreen, Transicion, GameStateStore/BiomeCardController/DecisionCatalog y escenas de decisión/información correspondientes. Matriz de datos, temporales, dependencias, momentos y efectos en el plan.
- Hallazgos: ambiente debe proyectarse antes de instanciar escena por consumidores _Ready; vida/agua/comida reales no tienen contrato de restauración ni campos en snapshot boundary. Cliente legado tiene gates HTTP y IDs hex24 incompatibles con UUID local. No asumir offline ya funcional ni convertir cuentas/partidas existentes.
- Contrato propuesto: adaptador con DTO en hilo principal, cola serial SQLite, servicio/UoW/repositorio, recibos/revisión, errores visibles y reintento idempotente. Comandos de frontera compuestos requieren futura transacción única: varios métodos no equivalen a commit global.
- Bloqueo técnico documentado: servicio exige SyntheticDatabase propiedad de SyntheticSandbox; no acepta ruta duradera ni reapertura entre procesos. Proveedor duradero y firmas futuras requieren autorización; no se eludió capacidad sintética ni se entregó integración ejecutable.
- Ruta propuesta, no inspeccionada ni creada: LocalApplicationData/TwoSides/ReconstructionTests/copy-06dc7ade-b3cd-425b-8d79-90dde8ef1ac6/persistence/save.sqlite3. Identidad estable; validación futura de ancestros/destino/sidecars/reparse y manifiesto; archivo desconocido detiene apertura sin sobrescritura. Producción separada y transición explícita. No acceso a partidas existentes.
- Checkpoints: human_decision, decision_info, animal_start/segment-start y menu en cinco biomas; escenas reales catalogadas. Sin medio recorrido, reglas nuevas/desbloqueo/final, botón manual inventado o repetición de consecuencias. Política/esquema/API de recursos pendientes. Plan futuro de 14 casos, incluida exportación Windows; ninguno de integración Godot ejecutado.
- Pruebas actuales: 39 backend aprobadas, 0 fallidas, 0 omitidas al finalizar. Comando node --test --test-concurrency=1 tests/unit/*.test.js tests/integration/*.test.js; solo memoria/loopback, sin .env/servicios externos. Primer intento sandbox bloqueó spawn EPERM en tres archivos antes de casos; repetición con escalación autorizada aprobó los 39. Procesos terminaron.
- Pruebas SQLite: las 43 de B04.2A conservan evidencia histórica aprobada, no se repitieron. Runner compila/escribe .work y ejecutor crea/elimina bases en local-persistence, cuya modificación está prohibida aquí. No afirmar que se ejecutaron 82 casos en esta fase; compatibilidad estática e integridad no sustituyen prueba runtime.
- Integridad final: inventario de 2,031 archivos protegidos (C#, escenas, proyectos/configuración, árbol local-persistence fuera de .work, fuentes/tests/manifiestos backend, .env y demás archivos coincidentes del inventario) conserva cantidad y digest de hashes/fechas inicial. Digest agregado C25B0782CFCFCAA0B624E060542E0BD3B71D9E1003499E30A532B8D3CBE72C2C. No ejecución/escritura del árbol .work; su carpeta databases conserva cero archivos. No nuevas bases.
- .env: 278 bytes, SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928; fecha/atributos y SDDL completos (ACL y propietario) iguales al inicio de esta fase. Solo hash/metadatos, sin leer valores. No se usó la fecha histórica serializada de otras fases como sustitución del baseline actual.
- Resultado: B04.2B.1 COMPLETADA en análisis/diseño documental. Compatibilidad de framework verificada; compatibilidad operativa/export y validación efectiva de ruta quedan explícitamente pendientes. B04/B04.2/B04.2B continúan EN_PROCESO; B04.2B.2 PENDIENTE, no autorizada ni iniciada. B00 sigue BLOQUEADA con riesgo SID/ACL sin resolver.
- Recomendación: revisar los dos contratos y decidir proveedor duradero, transacciones de frontera, reglas/versiones/recursos y archivos exactos antes de autorizar B04.2B.2. No crear Autoloads/ProjectReference/AppData ni ejecutar Godot automáticamente. Sin Atlas, credenciales, ACL, cambios de escenas/scripts, SQLite real ni acceso original. Detenerse aquí.
## B04.2B.2A — Integración de infraestructura SQLite con Godot C#

- Fecha:2026-10-25, America/Guatemala. Autorización expresa de usuario B04.2B.2A, limitada a infraestructura y pruebas sintéticas. Ruta exacta C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA.
- Preflight: raíz/proyecto/biblioteca sin reparse; ancestros OneDrive tienen tags cloud0x9000701a/0x9000601a y no destino de junction/symlink. Ruta de datos LocalApplicationData real C:\Users\luis2\AppData\Local, destino exclusivo no existía. Se revisaron diseños/contratos/fases/historial/decisiones/README, proyectos, proveedor/migraciones/servicio/UoW y entorno. Sin acceso original. SDK10.0.400 y runtimes globales10.0.11; no instalaciones globales.
- Modificados: TwoSides.csproj; local-persistence/src/SyntheticSandbox.cs.txt, SchemaManager.cs.txt, UnitOfWork.cs.txt, GameSaveService.cs.txt; local-persistence/README.md; backend/docs/PHASES.md, PHASE_HISTORY.md, DECISIONS.md, GODOT_SQLITE_INTEGRATION_PLAN.md y GODOT_SAVE_ADAPTER_CONTRACT.md.
- Nuevos: local-persistence/src/ISaveDatabase.cs.txt y DurableTestDatabase.cs.txt; local-persistence/infrastructure-tests/Infrastructure.Checks.csproj, InfrastructureChecks.cs.txt y packages.lock.json; integration/sqlite/GodotSqliteInfrastructureAdapter.cs, BuildIsolation.props, run-infrastructure.ps1 y .gitignore. Artefactos privados de NuGet/build en .work, excluidos de git.
- Referencia: ProjectReference a local-persistence/src/TwoSides.LocalPersistence.csproj. Compilación implícita del juego excluye local-persistence y tests/.work de integración; fuentes .cs.txt solo en biblioteca/ejecutores. SDK props/targets importados explícitamente con Version4.6.1 para aislar obj antes de Microsoft.Common.props; TargetFramework/Android/EnableDynamicLoading originales conservados.
- Proveedor: ISaveDatabase conserva SyntheticDatabase y permite DurableTestDatabase restringido a Windows/copia fija. Directorios/archivo validados con handles OPEN_REPARSE_POINT, ruta final, volumen local, FileID, sin links/hardlinks; handles sin shareDelete estabilizan ancestros/archivo; lease serializa instancias. Open ReadWrite sin recreación, Poolingfalse/FKtrue/FULL. No se añaden tablas de gameplay ni credenciales.
- Base sintética nueva: C:\Users\luis2\AppData\Local\TwoSides\ReconstructionTests\copy-06dc7ade-b3cd-425b-8d79-90dde8ef1ac6\persistence\save.sqlite3. Se conservan ownership.json y store.lease. Manifiesto1/copyID/propósito synthetic-infrastructure-only/FileID/Ready y application_id0x54535054 reconocen archivo propio; creación exclusiva y migracionesv1/v2 verificadas, reapertura reconoce sin importar partidas. Base/desconocido/incompleto jamás se sobrescribe. No hay borrado duradero automático. Manifiesto no autentica contra otro escritor con permisos; carrera hostil/energía/backup quedan como límites, no protección probada.
- Adaptador: GodotSqliteInfrastructureAdapter en namespace TwoSides.Integration.Sqlite, clase normal sin Node/Autoload/escena. OpenAsync/ruta explícita, lectura/creación perfil ficticio fijo con UUIDs locales, CloseAsync/DisposeAsync, cola serial y Task.Run, errores por código. No SQL en escenas ni llamadas HTTP. Catálogo infra-test-1/synthetic, no reglas de biomas reales.
- Restore: integration/sqlite/run-infrastructure.ps1 -Mode Restore con escalación aprobada para redNuGet, todos los paquetes/CLI home/http/plugins/scratch/TEMP privados. Config local con nuget.org y library-packsreadonlySDK. Activos NuGet del juego muestran único packageFolder local-persistence/.work/packages. Godot.SourceGenerators/GodotSharp/GodotSharpEditor4.6.1, Microsoft.Data.Sqlite/Core8.0.32, SQLitePCLRaw2.1.13. iOS SDK tiene Execxcrun condicionado a iOS no importado en Windows; no se ejecutó Godot. NuGetAuditfalse no equivale a auditoría de vulnerabilidades.
- Compilación: runner -Mode Build sin restore/servidores compartidos; biblioteca y nuevo ejecutor0warnings/0errores; TwoSides.csproj0errores,63warnings en código legado/generado del juego (incluye obsolescencia ParallaxBackground), sin warnings en adaptador final. Incremental posterior0/0 no sustituye el resultado completo. Obj/bin juego en integration/sqlite/.work, biblioteca/ejecutores en local-persistence/.work. No editor/escenas/export.
- Pruebas nuevas: runner -Mode Test con escalación aprobada para ruta exclusiva AppData. Resultado final28 aprobadas,0fallidas. Verifica paths relativa/externa/traversal rechazadas antes de apertura, referencia/adapter en metadata TwoSides.dll, carga real e_sqlite3.dll de salida win-x64 (3.53.3), inicialización/perfil ficticio, lectura/close/reopen/IDestable, schemav2, FK, rollback, disco lleno controlado SQLite(max_page_count), reapertura en proceso nuevo sin red, base sin manifiesto rechazada sin cambiar hash, junction sintética de sidecar rechazada, sharingdenegado→ACCESS_DENIED y error sanitizado sin eco de ruta/secreto. Retirada solo junction y temporal de manifiesto creados por suite; ningún borrado recursivo ni base desconocida tocada. No se agotó discoWindows ni se cambiaron ACL para probar permisos.
- Regresiones: local-persistence/run-checks.ps1 compiló y ejecutó43casos SQLite aprobados,0fallidos,0bases sintéticas temporales restantes, runtime8.0.30autocontenido. Backend node --test --test-concurrency=1 tests/unit/*.test.js tests/integration/*.test.js con escalación aprobada para procesos/loopback:39aprobados,0fallidos/omitidos. Total110aprobados; sin Atlas/servicios externos durante tests. Procesos finalizaron, no quedó servidor persistente.
- Intentos fallidos corregidos: CA1416 en FileStream.Lock se corrigió guardando plataforma explícita; MSB3540 por MSBuildProjectExtensionsPath tardío se corrigió importando aislamiento antes del SDK; ImportSDK versión explícita usa atributo Version; nullable habilitado solo en adaptador. Primera suite y repetición diagnóstica esperaban STORAGE_BUSY para sharing pero SQLite devolvióACCESS_DENIED; aserción ajustada al mapeo real sin editar ACL. Esos intentos no cuentan como pruebas aprobadas.
- Verificación final:239archivos protegidos conservan cantidad y digest de hash/fecha inicial: scripts existentes, escenas, project.godot, backend/src/tests/manifiestos y .env. TwoSides.csproj es modificación autorizada y su diff conserva propiedades originales más referencia/aislamiento/exclusiones. Sin cambios a VariablesGlobales, biomas, jugadores/NPC, decisiones, mecánicas, assets o Express. No se leyeron valores de .env ni se cargó configuración real.
- .env:278bytes, SHA2564DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, fecha/atributos/SDDLcompleto iguales al inicio de esta fase (ACL y propietario). Riesgo SID heredado de B00 persiste sin corrección.
- Resultado:B04.2B.2A COMPLETADA. Infraestructura referenciada/compilada, perfil sintético persiste entre conexiones/procesos. No se demuestra arranque real del motor ni exportación; no guardado de biomas/partidas reales. B04/B04.2/B04.2B/B.2 siguen EN_PROCESO, B04.2B.2B PENDIENTE sin autorización.
- Próxima fase recomendada: decidir recursos/reglas/versiones y comandos transaccionales de fronteras, separar gatesHTTP e identificar archivos exactos de bootstrap/cliente antes de autorizar B04.2B.2B. Definir namespace productivo independiente; no promover base sintética a perfil real. Detenerse aquí.
Verificación adicional final B04.2B.2A: se rechazó también una junction sintética de sidecar cuyo destino no existía, usando lectura de atributos antes de decidir existencia/creación. El destino permaneció ausente y la junction propia se retiró sin recursión. Suite final28/28; total110/110 con las regresiones existentes. No hay nuevas pruebas de motor/exportación. El caso no demuestra resistencia contra todo proceso hostil con permisos de escritura concurrentes.

## B04.2B.2B.1 — Contratos definitivos para guardar progreso real

- Fecha:2026-10-25, America/Guatemala. Solicitud expresa B04.2B.2B.1: análisis/documentación exclusiva, sin código/migraciones/SQLite/Godot. Ruta verificada C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA; raíz/proyectos/biblioteca sin enlaces de redirección. Sin acceso al original.
- Revisión: SQLITE_SCHEMA_DESIGN.md, LOCAL_SAVE_CONTRACT.md, GODOT_SQLITE_INTEGRATION_PLAN.md, GODOT_SAVE_ADAPTER_CONTRACT.md, REQUIREMENTS.md, DECISIONS.md, PHASES.md, PHASE_HISTORY.md y local-persistence/README.md; modelos/repositorio/servicio/validación/UoW/infraestructura existentes. No se editaron contratos ajenos al alcance ni se cambiaron versiones aprobadas.
- Creados únicamente: backend/docs/REAL_GAME_SAVE_CONTRACT.md, BIOME_PERSISTENCE_MAPPING.md y SAVE_INTEGRATION_CHANGE_PLAN.md. Modificados únicamente: backend/docs/PHASES.md, PHASE_HISTORY.md y DECISIONS.md. No archivos de código, scripts, escenas, proyectos, assets o biblioteca nuevos/modificados.
- Inventario: nombres/tipos/defaults/eventos de VariablesGlobales, PlayerDelfin/Mono/RataCanguro/Zorro/Oso y Estadisticas; cinco Bioma*, decisiones e InfoDecision, FinNivel, AnimalSegmentFlow, GameOver/MenuPausa/Final, tarjetas/menús/contexto y contratos/gates remotos. Se revisaron escenas de decisiones/info/biomas/jugadores/recursos y solo puntos de drop NPC pertinentes. No se atribuye un actor humano físico/inventario no observado: perspectiva humana inspeccionada es decisión educativa.
- Datos reales: CurrentHealth/MaxHealth, Agua/Comida y configuraciones de activación/consumo/recuperación, ambiente por bioma y caché global, resultados/etapas/decisiones, fuentes agotadas y objetos recogidos solo como candidatos de mundo exacto. Delfín tiene ActivarAgua=false; Calor está en enum pero sin rama funcional de recuperación. Mapeo incluye iniciales CLR frente a Ready y overrides de contenido; no se presentan como mediciones runtime.
- Fronteras A–E: decisión confirmada, salida de info a animal, fin por FinNivel, cambio de bioma, ausencia de opción manual de guardar. segment-start existe en catálogo de persistencia, no como nodo checkpoint físico. No checkpoint intermedio/objetivos estables verificados. No convertir pickups o unique_id de escena en logros/IDs duraderos por suposición.
- Contrato: carga coherente, catálogo cerrado, owner/versión/revisión, proyección ambiental antes de instanciar escena, recursos según política aún pendiente, errores visibles y no fallback a defaults/Atlas. RecordDecision y CreateNewGame ya transaccionales; nuevas RestartAnimalSegment/CompleteBiome/FinalExit son propuestas pendientes. Un único UoW.Write por intención y recibo/digest/revisión; operación UUIDv4 estable durante retries. Tras reinicio cargar agregado confirmado, no reejecutar intención precommit perdida ni usar local_operations como journal de pendientes. Hook B05 preparado en misma conexión/transacción, sin outbox implementado.
- Diez tablas comparadas contra modelos/SQL/servicio. Incompatibilidades concretas: snapshot boundary1 sin recursos/mundo; setters privados y Ready sobrescriben; catálogo/validación local aún sin reglas de juego; Available/IDhex24/sesión remotos no son autoridad local; columnas de final existen pero UpdateGame no las escribe y SaveCatalog.Resume rechaza ending; objetivos sin catálogo/operación de mutación; proveedor duradero con propósito exclusivamente sintético. Ninguna migración se ejecutó o se da por necesaria sin diseño de cambio DDL. Mantener formatos aprobados hasta nueva decisión.
- Plan de archivos: lista exacta propuesta y condicionada por RGS01.1, categorías A–E con motivo/responsabilidad/comportamiento conservado/pruebas; nuevos adaptadores/contexto/perfil/catálogo/proyección y proveedor de juego separado, cambios puntuales de composición/UI/flow y extensiones de dominio/repositorio. Evita editar jugadores/Estadisticas/biomas/NPC en alternativa de fronteras. Si se requiere exactitud, falta inventario de mundo/IDs y no se pretende suficiente esa lista base. TwoSides.csproj/project.godot/escenas no requieren cambios en alternativa base propuesta.
- Plan de pruebas futuras T01–T16: nueva partida, frontera, cierre/reapertura, bioma, decisiones/consecuencias/recursos, duplicados, cinco biomas, fallos/rollback/versiones/offline/aislamiento/reinicio/mecánicas. Clasificación unitarias(U), integración C#(C), motor(G) y evidencia esperada. Ninguna prueba G o nueva prueba de implementación ejecutada aquí.
- Bloqueos esenciales RGS01–RGS06: política de recursos/reset/exactitud/salida intermedia; evaluador local de opciones y versiones; final negativo/global/sucesora; objetivos y condición de logro; disponibilidad de biomas; perfil/base de juego separada y bootstrap. Recomendación inicial de fronteras con reinicio explícito es propuesta, NO aprobación. Reglas de selección/desbloqueo/final no se inventaron a partir del texto o cliente legado.
- Pruebas anteriores:110 aprobadas/0fallidas finales permanecen registradas (28 infraestructura,43SQLite,39backend), igual que compilación anterior0errores/63advertencias legado/generado. No se repitieron ni se presentan como nuevas ejecuciones. Runners crearían build/bases o modificarían almacén sintético, prohibido en esta fase.
- Verificación documental ejecutada:5biomas,10tablas implementadas,16casos futuros presentes y enlaces Markdown locales válidos. Comparación final de inventario protegido:2,821archivos, misma cantidad/digest de hashes y fechas que al inicio; digest agregado CLouHYKF6mQRKjTQBczBHUlRZJ6Lw+2lwIqrEsViEPw=. Incluye scripts/escenas/assets/documentos protegidos, proyectos, todo local-persistence (incluido .work), integración/build previo y fuentes/tests/manifiestos backend. Solo seis documentos autorizados fuera del inventario protegido.
- Almacén duradero previamente validado permanece intacto: ruta AppData exclusiva copy-06dc7ade-b3cd-425b-8d79-90dde8ef1ac6/persistence con ownership.json(156bytes), save.sqlite3(147456bytes) y store.lease(0bytes), mismos hashes/fechas y listado. Solo se calcularon hashes/metadatos por lectura de archivos; no se abrieron conexiones SQLite, ejecutaron migraciones, crearon/eliminaron bases ni copiaron partidas.
- .env conserva278bytes y SHA-2564DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928; fecha UTC ticks639277247382771017, atributos32 y SDDLcompleto (ACL/propietario) iguales al baseline de esta fase. No se leyeron valores, generaron credenciales o modificaron permisos. B00 conserva riesgo ACL desconocido independiente.
- Resultado: preparación documental PARCIAL; B04.2B.2B.1 BLOQUEADA hasta resolver decisiones esenciales. No declarar criterios definitivos completos. B04.2B.2B.2 PENDIENTE, sin autorización ni inicio. Sin Godot, Atlas, conexiones externas, cambios Express o proyecto original.
- Próximo paso: resolver RGS01–RGS06 y confirmar alcance exacto de implementación/ruta/tests antes de autorizar B04.2B.2B.2. No promover base/perfil sintéticos ni implementar guardado real automáticamente. Detenerse aquí.
## B04.2B.2B.1 — Cierre de contratos y reglas por decisiones del usuario

- Fecha:2026-10-25, America/Guatemala. Autorización expresa de cierre exclusivamente documental, ruta de copia C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA. No se autorizó ni inició B04.2B.2B.2. Este cierre sustituye el estado PARCIAL/BLOQUEADA anterior de la preparación, manteniendo aquella entrada como evidencia histórica.
- Archivos actualizados exclusivamente: backend/docs/REAL_GAME_SAVE_CONTRACT.md, BIOME_PERSISTENCE_MAPPING.md, SAVE_INTEGRATION_CHANGE_PLAN.md, DECISIONS.md, PHASES.md y PHASE_HISTORY.md. No nuevos archivos de código/documentación fuera de esos seis ni cambios funcionales.
- Decisión1: nivel completado se registra y bloquea durante toda su GameId, desde perspectivas humana/animal, restart y selección. Conservar decisión/consecuencias/progreso/estadísticas/historia; consultar historia permitido. Nueva GameId restablece disponibilidad inicial existente, no desbloquea anterior ni borra datos. Definir protección en dominio/transacción y UI, no solo botones. Sin orden nuevo.
- Decisión2: recursos reales vida/agua/comida del último checkpoint confirmado deben persistirse y recuperarse. Se elimina la propuesta anterior de reset silencioso al continuar. Solo fronteras reconstruibles, no posiciones medias ni estados temporales. Diseño de inicialización: escena suspendida, Ready/captura antes de juego efectivo; commit de recursos/checkpoint y posterior habilitación. Carga aplica valores persistidos tras Ready, antes de consumo/daño/input, sin SetSalud(HUD)/Recuperar como sustitutos de setters. Snapshot1 actual no satisface recursos; requiere formato/APIs posteriores, no implementados. Delfín agua desactivada; Calor enum no añade recurso operativo.
- Decisión3: una decisión por instancia lógica de partida/bioma/key con ID/opción/orden/clasificación solo si definida/consecuencias persistidas. Retry con otra OperationId tampoco puede duplicar instancia. Cargar proyecciones no reejecuta elección ni consecuencias/drops. No deducir clasificación favorable/perjudicial de botones/bool/healthy/degraded sin regla definida; datos no clasificados permanecen no clasificados.
- Decisión4: conservar estado final confirmado e historial, mantener completados bloqueados y permitir partida nueva independiente sin borrar anterior. No inventar final por mayoría/escena ni crear sucesora automática como regla nueva. Condiciones exactas de final global/desenlace y versiones no definidas se registran como dependencias pendientes conforme instrucción del usuario.
- Decisión5: objetivos identificados solamente, sin misiones nuevas ni checkpoints inventados. FinNivel es fin físico observado; no catálogo de objetivos intermedios demostrado. Disponibilidad de incompletos respeta regla existente y condiciones no definidas quedan pendientes, sin imponer secuencia; completed siempre bloquea por partida.
- Decisión6: un perfil local por instalación, partidas independientes/históricas en SQLite duradero de copia y base sintética de infraestructura separada. Sin Atlas/sesión remota para continuar. No adoptar/migrar perfil ficticio, manifiesto o base ya validada. Ruta/proveedor/propósito funcionales requieren concreción y autorización de implementación.
- B05: nueve estadísticas confirmadas documentadas: tiempo total, sesiones de juego, decisiones favorables, perjudiciales e individuales por bioma, biomas completados, resultados ambientales, frecuencia de selección entre partidas y tiempo por bioma condicionado a medición fiable. Tiempo activo/pausas/interrupciones/intervalos/IDs necesitan contrato B05, no inferencias desde timestamps o escenas. Decisiones sin clasificar no se suman a favorable/perjudicial. Historial no se borra ni métricas se duplican al cargar. Eventos ligados a progreso se escribirán con este en la misma conexión/transacción cuando corresponda mediante hook existente; no eventos/outbox/sincronización creados ahora.
- Plan actualizado: restauración de recursos exige incluir APIs mínimas de captura/hidratación en los cinco Player y Estadisticas y PlayerCheckpointAdapter propuesto, preservando daño/consumo/movimiento/animaciones. No implementación ni modificación de esos scripts. Mundo intermedio/NPC/objetos con IDs estables sigue fuera de contrato actual. Se mantienen brechas reales de clasificación/unicidad/formatos, UpdateGame sin persistencia de final y condiciones de final/desbloqueos no definidas, sin afirmar soporte inexistente.
- Verificación documental: seis decisiones y nueve estadísticas B05 presentes, enlaces locales válidos y estado de fase coherente. La regla de completed es por partida, historia intacta, consecuencias no duplicadas y autoridad local sin internet. Revisión no equivale a prueba funcional. Los110 casos anteriores (28infraestructura+43SQLite+39backend,0fallos finales) siguen registrados como históricos y NO se repitieron. Sin build, runner, motor, migraciones o conexiones SQLite.
- Integridad:2,821archivos protegidos antes/después conservan cantidad/digest de hashes/fechas, incluyendo scripts/escenas/assets/proyectos, local-persistence completo y .work, integración, documentos no autorizados y fuentes/tests/manifiestos backend. Digest CLouHYKF6mQRKjTQBczBHUlRZJ6Lw+2lwIqrEsViEPw=. Base sintética duradera y ownership.json/store.lease conservan listado/tamaños/hashes/fechas previos; no bases creadas, abiertas para escritura, modificadas o eliminadas. Solo lectura de hashes/metadatos de archivos, sin acceder a partidas originales.
- .env:278bytes, SHA-2564DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, fecha ticks639277247382771017/atributos/ACL/propietario iguales al inicio. No lectura de valores, credenciales ni cambios de permisos. Sin Atlas o proyecto original. B00 conserva su bloqueo/riesgo ACL independiente.
- Resultado:B04.2B.2B.1 COMPLETADA como cierre documental de decisiones confirmadas, con dependencias funcionales explícitas. No declara guardado real implementado ni fórmulas inexistentes resueltas. B04.2B.2B.2 PENDIENTE, no autorizada ni iniciada; B04 y etapas de implementación global siguen EN_PROCESO.
- Recomendación: preparar autorización concreta de implementación de bloqueo por partida, unicidad lógica y recursos de fronteras versionados, con base de juego separada y pruebas/archivos exactos. Antes de implementar rutas afectadas, concretar versiones y condiciones de final/desbloqueos todavía no definidas; no suplirlas con reglas nuevas. Detenerse aquí, sin cambios funcionales.
## B04.2B.2B.2A — Implementación básica de perfil y partidas

- Fecha:2026-10-25, America/Guatemala. Autorización expresa de perfil/nombre/nueva/activa/estado inicial/carga/historia únicamente. Copia verificada C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA. Sin enlaces en raíz/proyectos/biblioteca/integración, sin acceso al original. Riesgo ACL de B00 permanece sin cambios.
- Revisión previa: ocho documentos requeridos, servicios/modelos/repositorio/proveedor/validación existentes, adaptador de infraestructura y MenuPrincipal.Jugar. Perfil singleton, current parcial único, CreateNewGame transaccional/idempotente y archivado ya existían; no se duplicó implementación ni añadieron campos para activa. La única creación automática de perfil sintético estaba confinada a otro adaptador/ruta/purpose, no se invoca aquí. Contratos compatibles con subconjunto inicial, sin improvisar reglas de juego.
- Punto visual: MenuPrincipal exige EntryAccessController.HasSession y navega login/recuperación remota. No ofrece punto inequívoco local para nombre/nueva/historia. Se usó alternativa explícitamente autorizada: interfaz C# invocable sin escena y bloqueo visual documentado. No menú/contexto/escenas/formulario/Autoload modificados o añadidos. Compilar API en TwoSides.dll no equivale a integrar UI o habilitar juego offline actual.
- Código existente modificado (3): local-persistence/src/DurableTestDatabase.cs.txt (delegación a implementación compartida conservando contrato), GameSaveService.cs.txt (lecturas GetActiveGame/GetGameHistory), SQLiteRepository.cs.txt (Games parametrizada/paginada). Nuevos (8): local-persistence/src/OwnedCopyDatabase.cs.txt y CopyGameDatabase.cs.txt; integration/sqlite/GamePersistenceAdapter.cs, RealGameCatalog.cs y run-game-save-checks.ps1; local-persistence/game-save-tests/GameSave.Checks.csproj, GameSaveChecks.cs.txt y packages.lock.json. Todos estaban enumerados en plan de cambios. Sin cambios a Models/Validation/SchemaManager/UoW/ISaveDatabase, paquetes o csproj raíz.
- Documentación actualizada exclusivamente: backend/docs/PHASES.md, PHASE_HISTORY.md, DECISIONS.md, REAL_GAME_SAVE_CONTRACT.md, SAVE_INTEGRATION_CHANGE_PLAN.md y local-persistence/README.md. Documentos de diseño/mapa/contrato Godot no autorizados en esta subfase no se editaron.
- API: GamePersistenceAdapter abre explícitamente sin crear perfil/partida, PrepareProfileCreation(nombre) genera UUIDv4 seguros Guid.NewGuid para identidad/operación y normaliza; crear/obtener/renombrar con revisión/recibo, IDestable. PrepareNewGame genera solicitud estable por intención con GameId propio y actual/revisión esperados; CreateNewGameAsync reutiliza transacción existente, conserva anterior archivada. GetActiveGameAsync/LoadGameAsync/GetGameHistoryAsync y cierre/reapertura sin borrar. Historial incluye actuales y archivadas, offset>=0/límite1..100, default50, validación en lectura consistente. Worker serial, sin HTTP/Node en DTO. No correo/password/credenciales remotas generados.
- Idempotencia: conservar solicitud/OperationId durante retry; no regenerar factory en el mismo clic. Reemplazo actual necesita ID/revisión explícitos; doble perfil rechazado. Recibo original/Data actual pueden tener revisiones distintas después de nuevos cambios; consultar activa por su método. No create por fallback de error/ausencia confundida ni transacciones separadas para dependientes.
- Ruta de juego utilizada: C:\Users\luis2\AppData\Local\TwoSides\ReconstructionTests\copy-06dc7ade-b3cd-425b-8d79-90dde8ef1ac6\game-progress\save.sqlite3. Destino inicialmente inexistente, controles Windows de ancestros/destino/FileID/reparse/hardlinks/sidecars y sin OneDrive; creación exclusiva reconocida. Manifiesto145bytes, DB147456bytes y lease0bytes propios, purpose copy-game-progress/application_id0x54534743. Migracionesv1/v2 existentes aplicadas solo a base nueva reconocida, sin DDL nuevo. Ninguna base desconocida migrada/adoptada o partida importada.
- Almacén sintético previo permanece distinto: persistence/save.sqlite3, purpose synthetic-infrastructure-only/application_id0x54535054. Wrapper DurableTestDatabase mantiene API/ruta/CopyId/formato; lógica común extraída sin acceso a sus datos. Sus tres archivos se compararon por hash/fecha/listado al inicio/final. No se ejecutó la suite28 que los abre/muta; sigue como evidencia histórica, no prueba nueva. Reconocimiento local no es cifrado ni protección frente a malware/otro escritor autorizado, límite previo conservado.
- Estado inicial: perfil LOCAL_ONLY y referencias técnicas null; SavedGame current/in_progress/revision0/menu/bioma null; cinco human_pending, attempt0/result/fechas null, ambientes null/extensiones{}, snapshot boundary/capturedRevision0, cero decisiones/objetivos. RealGameCatalog versiones técnicas initial-state-only-1/copy-initial-content-1 solo describen este formato inicial y cinco IDs/keys existentes. Sin orden, availability, clasificación, recursos, final o bloqueo de biomas nuevos. No se implementó B05.
- Restore/Build: integration/sqlite/run-game-save-checks.ps1 -Mode Restore (escalación aprobada para restauración privada), -Mode Build; reutiliza run-infrastructure.ps1 exclusivamente Restore/Build. Caches/CLI/TEMP/paquetes privados local-persistence/.work, obj/bin Godot integration/sqlite/.work; fuente/config local y único packageFolder privado verificados. Sin instalaciones/config global modificadas. SDK10.0.400/net8.0; ejecutores selfcontained.NET8.0.30. GodotSDK/Sharp/Editor/SourceGenerators4.6.1, Microsoft.Data.Sqlite/Core8.0.32, SQLitePCLRaw2.1.13, engineSQLite3.53.3. Sin nuevas dependencias, fuentes duplicadas o referencia de biblioteca duplicada.
- Compilación completa: biblioteca/ejecutores0advertencias/0errores; TwoSides.csproj0errores/63advertencias preexistentes de código legado/generado. No se intentó corregirlas. Incrementales0/0 registrados no sustituyen el conteo completo. No editor/motor/escenas/exportación ejecutados.
- Pruebas nuevas reales: runner -Mode Test con escalación aprobada solo para nueva base propia de juego y procesos de prueba. Primera ejecución49aprobadas/0fallidas, incluyendo primera creación+concurrencia de mismo intento, singleton/recuperación, renombre NFC/ID, partida/owner/activa/historia/archivado sin borrar, defaults de cinco biomas, reapertura de conexiones y proceso nuevo, errores readonlySQLite/sin ACL y rollback previo a commit, datos inválidos/owner ajeno/stale/no-consent/duplicados, unknown sin cambiar hash, campos técnicos null, assembly de tests sin referencias HTTP/Mongo/Godot runtime, adapter en metadata TwoSides.dll y referencia única a biblioteca. Ninguna llamada de red en suite local.
- Repetición deliberada de suite:48aprobadas/0fallidas, porque recupera fixture existente en vez de repetir la creación inaugural. Confirma no reemplazo/duplicado de perfil y retención de partidas anteriores. Quedan un perfil ficticio Prueba José local y4partidas (1actual/3archivadas), sin eliminar ninguna; no son nombre/cuenta real del usuario. Fixture reconoce solo sus nombres y se detiene si aparece otro perfil o supera capacidad, no borra para seguir. IDs no se imprimieron ni se generaron secretos remotos. No sumar como casos distintos los checks repetidos.
- Regresiones seguras ejecutadas: local-persistence/run-checks.ps1,43SQLiteaprobadas/0fallidas,0archivos de bases temporales restantes; cleanup solo de fixtures recién creadas y propias, ninguna partida histórica duradera. Backend node --test --test-concurrency=1 tests/unit/*.test.js tests/integration/*.test.js,39aprobadas/0fallidas/0omitidas, solo memoria/loopback y procesos finalizados.131comprobaciones en ejecución principal +48adicionales de repetición de suite, no159casos frescos mezclando28históricas. Sin Atlas/servicios externos durante pruebas.
- Problemas de ejecución: primer apply_patch tenía ruta de nuevo proyecto mal compuesta y la herramienta rechazó crear sus directorios; corregido a rutas relativas de workspace antes de crear archivos. Ninguna prueba funcional falló; no hubo cambios al original o datos desconocidos. Ajustado límite de capacidad de fixture para que paginación default50 no oculte historial al repetir muchas veces; repetición con4partidas pasó.
- Integridad final:620archivos protegidos conservan cantidad/digest de hashes+fechas inicial LhJblRZVNpSo2+/2Eo7ubflcSgJotQFRZ7b7N1DZNcY=. Incluye scripts existentes de biomas/NPC/jugadores/decisiones, escenas/assets, TwoSides.csproj/project.godot, adaptador de infraestructura previo, Express/src/tests/manifiestos y base sintética previamente validada con manifiesto/lease. Se conservaron modificaciones del usuario ya existentes al inicio, sin revertirlas. Original no accedido: no se afirma comparación hash de una base original que no se inspeccionó.
- .env conserva278bytes, SHA-2564DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, fecha UTC ticks639277247382771017, atributos32 y SDDLcompleto/ACL/propietario iguales al baseline. No lectura de valores ni carga de credenciales, cambios ACL o cuentas remotas. B00 sigue con riesgo ACL pendiente.
- Resultado:B04.2B.2B.2A COMPLETADA en alternativa autorizada de interfaz C# sin escena. Perfil/partidas/historia/estado inicial persisten y tests/compilación pasan; integración visual PENDIENTE por gates existentes. B04 y etapas globales siguen EN_PROCESO. B04.2B.2B.2B PENDIENTE sin autorización/inicio; no decisiones/recursos/bloqueo/final/B05 implementados en esta subfase.
- Próximo paso recomendado: autorizar alcance concreto del menú/perfil/carga local y pruebas de runtime, o siguiente subconjunto de dominio, preservando historial/identidad y base sintética. Resolver versiones/consecuencias/final/desbloqueos pendientes antes de rutas afectadas. No activar servicios ni nuevas mecánicas automáticamente. Detenerse aquí.
## B04.2B.2B.2B — Progreso de biomas, bloqueo y decisiones ambientales

- Fecha:2026-10-25, America/Guatemala. Autorización específica de modelos/repositorio/servicio/adaptadores/pruebas/documentos previamente enumerados, no scripts/escenas/menús/proyectos/Express/recursos/B05. Ruta exclusiva verificada C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA. No enlaces en raíz/proyectos/biblioteca/integración; original no accedido. Se preservan modificaciones del usuario ya existentes al iniciar, sin revertirlas.
- Inspección previa: diez documentos solicitados y modelos/servicio/repositorio/validación/UoW/adaptador, catálogo y scripts BiomaBosque/Desierto/Mar/Nieve/Selva en solo lectura para global/aplicación de consecuencias. Identificadores de bioma/decisión reales mantenidos; no objetivos, escenas o variables de gameplay inventadas. Reglas locales de disponibilidad de incompletos no suficientes: se limita entrada y no se deriva una secuencia.
- Código modificado7: local-persistence/src/Models.cs.txt, Validation.cs.txt, GameSaveService.cs.txt, SQLiteRepository.cs.txt; integration/sqlite/GamePersistenceAdapter.cs; local-persistence/game-save-tests/GameSaveChecks.cs.txt; integration/sqlite/run-game-save-checks.ps1. Nueva fuente única local-persistence/src/GameRulePolicy.cs.txt, ya identificada en SAVE_INTEGRATION_CHANGE_PLAN.md. Clases de test nuevas dentro del archivo previsto, no archivos adicionales. Proyectos/proveedores/paquetes/lockfiles/UoW/SchemaManager no cambiados.
- Documentos actualizados autorizados7: backend/docs/PHASES.md, PHASE_HISTORY.md, DECISIONS.md, REAL_GAME_SAVE_CONTRACT.md, BIOME_PERSISTENCE_MAPPING.md, SAVE_INTEGRATION_CHANGE_PLAN.md y local-persistence/README.md. Sin cambios documentales ajenos al alcance.
- Servicio: GetGameProgress/GetBiomeAccess/GetCompletedBiomes, EnterBiome(EnterBiomeCommand) y CompleteBiome(CompleteBiomeCommand); fachada Async equivalente y RecordDecisionAsync/GetDecisionsAsync/GetEnvironmentAsync. Consultas readonly y agregado validado, no código ambiental ejecutado al leer. Comandos con owner/current/revisión/etapa/catálogo y recibo dentro de UoW.Write; no confirmar antes de commit.
- Estados existentes conservados human_pending/animal_pending/completed. Availability available/unavailable/unknown separada, Activity pending/in_progress/completed derivada de estado y punto actual; no enumDDL ni historial de visitas. Entrada humana fija punto human_decision y permanece human_pending hasta decisión; animal_pending refleja avance confirmado. Entrada animal fija frontera lógica, no captura recursos. No reglas de orden/availability/final inventadas.
- Disponibilidad: nuevo puerto IBiomeAvailabilityPolicy puro y confiable de composición; no flag de usuario. Defaultnull→unknown/permisosfalse/AVAILABILITY_UNDEFINED. Policy de fixture (oceanavailable/jungleunavailable/otrosunknown) es SOLO prueba, no política real. Núcleo soporta y prueba entrada válida con regla explícita, pero entrada real de incompletos permanece bloqueada hasta regla aprobada. Persistir resultado confirmado no equivale a permiso de escena. GetActive/Continue/SaveCurrentGame son datos/checkpoint confiables, no sustituyen validación de EnterBiome en futura UI; SaveCurrentGame no se expone como bypass en fachada.
- Bloqueo: completed es terminal por GameId/BiomeId y anula cualquier policy. Entrada/repetición humana/animal, actualización de progreso, checkpoint que apunte al bioma, ambiente y nuevas decisiones rechazan. PutBiome del repositorio también protege fila completada. No borrar datos; otras partidas no heredan completed. Archivadas se consultan sin mutación. Retry idempotente original de decisión/completion devuelve recibo sin cambios incluso después de archive; nuevo incompatible retorna conflicto/BIOME_COMPLETED.
- CompleteBiome requiere animal_pending y resultado ya confirmado coherente con healthy/good o degraded/bad (coherencia existente previa, no clasificación nueva). completed/result/fechaAnimal, partida/snapshot/revisión/recibo en un commit, mantiene decisión/ambiente. Regresa a menu, no evalúa final global ni crea sucesora; estado global sigue in_progress hasta evaluador autorizado, sin nuevas reglas de derrota.
- Decisiones: instancia lógica actual(GameId,BiomeId,DecisionKey) y occurrenceDecisionId UUID único de archivo. Key local se reutiliza en otra partida con UUIDdistinto; no reutilizar UUIDglobal. HasDecision en servicio/repositorio bajo BEGINIMMEDIATE y control de unicidad en Load impiden segundo registro/aplicación por API aunque cambien OperationId/opción/UUID. PK/UNIQUE/FK existentes respaldan IDs/operación/orden/referencias. No índiceUNIQUE nuevo sobre terna ni trigger: SQL directo fuera del servicio puede eludir guardas, lector rechaza datos duplicados; no prometer resistencia a escritores arbitrarios. Futuro refuerzoDDL requiere autorización/migración separadas, no tocar protegidas.
- Classification opcional EnvironmentalClassification(Kind,Version) solo declarada por llamador con decisión ya confirmada. Valores favorables/perjudiciales no se deducen de botones/bool/estado/result. Sin clasificación→ConsequenceVersion1/stateKind/null, preservando digest canónico de recibo v1 pese al nuevo campo opcional del comando. Clasificada→JSONmetadata version2 con kind/versión de procedencia; formato/version sintácticos, no certificación de clasificador de diseño. Lectura v1/v2 sin efectos nuevos, desconocidos/incompatibles rechazados. Originalcommand se conserva para retry, no reconstruirlo con JSONenriquecido. Datos de orden/consecuencias/ID/versiones quedan para hook B05, ningún evento/outbox creado.
- Esquema: sin DDL/migraciones/user_version nuevos ni edición de v1/v2/checksums. JSONTEXT y CHECKjson_valid existentes admiten payload2; se versiona ConsequencesVersion, no se reinterpreta v1. Modelos y lector actual soportan ambos; lectores antiguos sin soporte2 deben rechazarlo. Ninguna base duradera se abrió con SQLite o migró, ni se reutilizaron sus cuatro GameId para pruebas.
- Pruebas finales: integration/sqlite/run-game-save-checks.ps1 -Mode Progress (escalación aprobada para fixtures/childproceso),38aprobadas/0fallidas finales. Todas las escrituras en bases nuevas bajo local-persistence/.work/databases/UUID/UUID.sqlite3, limpieza solo de fixtures propias recién creadas. Childproceso usa ReadOnlyFixture limitado a ruta UUID y ancestros sin reparse, SqliteOpenMode.ReadOnly; recupera agregado tipado, terminalidad, decisión y consecuencia sin red/escritura. Ningún recurso/objeto/escena se restaura o ejecuta.
- Cobertura:27áreas solicitadas más defensas: lectura inicial y sin cambios hash/fecha, entrada disponible/denegada/desconocida y actividad derivada, avance/complete/recibo, bloqueo cruzando perspectivas/proceso, nueva partida/archivo independientes, decisión v1 y metadata2, digestlegacy, retries/cambios de opción/nuevas operaciones, aislamiento de key local entre partidas, clasificación no inferida, entradas nulas/inválidas, FK, rollback por excepción y por fallo realSQLFK después de mutaciones, concurrencia idéntica/diferente de decisión/completion, guardas de mutadores anteriores y repo, originalretry tras archive, adaptador compilado sin abrir base protegida.37casos preliminares y repeticiones38no se suman como casos distintos.
- Regresiones seguras: local-persistence/run-checks.ps1,43/43SQLiteaprobadas y0bases temporales restantes; Node node --test --test-concurrency=1 tests/unit/*.test.js tests/integration/*.test.js,39/39aprobadas,0fallidas/omitidas, solo memoria/loopback y procesos terminados. Total validación final120casos(38+43+39),0fallidos finales. Suites previas49/48básicas y28infraestructura NO repetidas porque abrirían/mutarían bases protegidas, se conservan como históricos (179ejecuciones anteriores no pruebas nuevas).
- Compilación: entorno privado de runner existente, --no-restore/servidores deshabilitados; biblioteca/ejecutores0errores/0advertencias. Rebuild completo TwoSides.csproj con TwoSidesIsolatedBuild=true:0errores y63líneas de advertencia distintas preexistentes,0en código nuevo. .NET8/test8.0.30/SDK10.0.400/Godot.NET4.6.1/Microsoft.Data.Sqlite8.0.32/SQLitePCLRaw2.1.13/engine3.53.3 conservados; único packageFolder privado comprobado, sin refsduplicadas o cambios csproj. Motor/editor/escenas/export no ejecutados, sin Atlas.
- Problemas corregidos: primer build de andamiaje antes de añadir clase de suite, luego paréntesis sobrante en test provocó errores de compilación en cascada; corregidos antes de38aprobadas. Captura PowerShell de advertencias tuvo espacio inválido antes de ToString, corregido antes del rebuild registrado. Se mantuvo explícitamente compatibilidad del digest v1 y se añadieron guardas de entradas nulas, verificadas por la suite. No se presentaron esos intentos como pruebas aprobadas ni se tocaron datos protegidos al corregirlos.
- Integridad final:624archivos protegidos conservan hashes/fechas/listado/cantidad, digestQ4lg2VnKFFetwPhwCYO1icJlQLsM84dV8iTGsJV7RO4=. Incluye fuentes de juego/biomas/actores/NPC/menús/decisiones/escenas/assets, TwoSides.csproj/project.godot, Express/src/tests/manifiestos, SchemaManager y las dos bases duraderas con manifests/leases. Cuatro partidas ficticias previas preservadas por igualdad de archivo, sin abrirlas con SQLite ni nuevas partidas en AppData. No base o archivo histórico eliminado. Original no accedido; no afirmar hash de una base original no inspeccionada.
- .env mantiene278bytes, SHA-2564DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, fecha UTC ticks639277247382771017, atributos32 y SDDLcompleto (ACL/propietario) iguales al baseline. No lectura/impresión de valores ni cambios de permisos. B00 conserva riesgo ACL desconocido independiente, sin resolver.
- Resultado: núcleo de progreso/bloqueo/decisiones implementado/validado; B04.2B.2B.2B EN_PROCESO con resultado PARCIAL por disponibilidad real de biomas incompletos BLOQUEADA hasta política confirmada. No aceptación completa ni regla inventada para pasar criterio. No UI/recursos/final/B05, ni nueva fase iniciada.
- Próximo paso: confirmar política local real de disponibilidad y condiciones faltantes, después autorizar alcance preciso de composición/entrada/escenas si se solicita. No reutilizar policyfixture ni conceder acceso desde metadata/plan. No iniciar B05 o conexión visual automáticamente. Detenerse aquí.
## B04.2B.2B.2B.1 — Disponibilidad y contratos de los tres finales

- Fecha2026-10-25, America/Guatemala. Dos attachments sucesivos del usuario contienen mismo alcance; se procesan como una sola subfase, sin duplicar trabajo o pruebas. Ruta copia autorizada verificada. Análisis prioritario, código condicionado a evidencia inequívoca de disponibilidad: condición NO cumplida, ningún cambio de código.
- Documentos actualizados exclusivamente6: backend/docs/REAL_GAME_SAVE_CONTRACT.md, BIOME_PERSISTENCE_MAPPING.md, SAVE_INTEGRATION_CHANGE_PLAN.md, DECISIONS.md, PHASES.md y PHASE_HISTORY.md. Ningún documento nuevo, README/biblioteca/build/proyectos/script/escena/animación/menú/Express modificados.
- Fuentes revisadas: ocho documentos requeridos, GameStateStore.Valid/Select, BiomeCardController.SceneFor/Begin/Commit, FinNivel.OnBodyEntered/FinalizarNivel/Ready, AnimalSegmentFlow.Start, AnimalProgressService.Begin/CompleteAsync, DecisionSceneFlow, GameSaveService.RecordDecision/CompleteBiome, Final._Ready/IrAlMenu, EndingService.ConfirmedEnding/ExitAsync/SuccessorConfirmed, Final.tscn, escenas bioma/info y docs/Final_Global_Godot.md. Requerimientos_Two_Sides_v6_corregido.docx leído desde ZIP/XML en memoria, sin extracción/escritura ni aplicación externa. No proyecto original o fuentes remotas.
- Hecho confirmado: decisión/consecuencias no completan bioma; RecordDecision guarda animal_pending/decision_info y no llama CompleteBiome. Juego continúa hasta condición real, completed bloquea ambos roles en esa partida, nuevas partidas independientes/historia intacta y tres finales al cumplir conjunto requerido. No se convierte muerte/cualquiergameover o decisión negativa en completion automático.
- Estado inicial observado: cinco human_pending/attempt0/result/fechas/ambiente null, sin decisiones; menu sinbioma. Esto no acredita disponibilidad. GameStateStore remoto exige Availabletrue para incompletos y false para completed; EndingService espera cinco disponibles en sucesora. RF-021 del DOCX exige progresión fija, sin secuencia exacta, y permite rejugar completados. Rejuego queda expresamente sustituido por regla actual de bloqueo. Orden/initial/unlock siguen sin resolución inequívoca, no se implementa selecciónlibre ni lineal por inferencia.
- Condición física actual por cinco biomas: FinNivel con NivelActual0mar(default),1selva,2desierto,3bosque,4nieve; contacto con GrupoJugador, guardia temporal, CallDeferred a FinalizarNivel y cotejo de escena→bioma. Abre AnimalSegmentFlow completion; hoy autoridad es servicio remoto. _Ready startfalse bloquea contexto inválido, no completa nivel. No objetivos/checkpoints intermedios estables demostrados. Futura integración precisa debe enlazar ese evento validado a CompleteBiomeAsync con owner/current/scene/generación/etapa/revisión/resultado, fuera del callback físico y sin confiar en flag de UI. Servicio actual valida transición persistente pero no autentica señal Godot; brecha documentada, no se vende como prueba física.
- Tres finales reales: única scenes/levels/Final.tscn usa scripts/Final.cs, TipoFinal.Bueno/Medio/Malo y endinggood/medium/bad. Títulos/textos existen; no nombres inventados. Ready lee Endings.ConfirmedEnding, falta de confirmación redirige. GameStateStore valida final_pending con cinco completed, conteoGoodBiomeCount y versiones/fechas; eso no determina qué conteo genera cada ending. DOCX RF-027 registro ambientalglobal/acumulativo, RF-028 evalúa al último bioma y bueno/regular/malo, sin función/pesos/umbrales. Nuevo usuario confirma exactamente tres; no inferir mayoría/porcentajes. Backend actual no contiene evaluador de finales. No acceder al backend original para recuperarlo.
- Final persistente futuro: guardar estadofinal/versión/fecha/historial con recibo/revisión atómicos; no recalcular por abrir escena/acabar tween y no duplicar evento. FinalExit remoto guarda EventId/revisión, Acknowledge valida sucesora antes de resetcaché. No es permiso de sucesora automática local: permitir nueva partida explícita independiente, preservar perfil e historia. UpdateGame no escribe camposfinales y SaveCatalog no admite ending; CompleteBiome actual deja menu/in_progress, dependencias futuras no implementadas aquí.
- Reglas clasificadas en contrato/decisiones como CONFIRMADAS POR USUARIO, VERIFICADAS EN CÓDIGO, INFERIDAS NO AUTORIZADAS y PENDIENTES. Preguntas precisas pendientes: conjunto inicialavailable, si hay secuencia y cuál, evento habilitador por bioma, múltiples disponibles/selección/continuidad, conjunto final requerido y condición negativa terminal, evaluación/umbrales/versiones de Bueno/Medio/Malo. Mantener AVAILABILITY_UNDEFINED para incertidumbres, completados/archivo bloqueados independientemente. No sustituir policy de fixture por regla real.
- Pruebas: no nuevos servicios/policy implementados, por tanto no testsfuncionales/regresiones/build/Godot ejecutados.18áreas futuras de policy pendientes;120aprobados/0fallos y63warnings previos son evidencia histórica, no ejecución de esta subfase. Revisión documental de tablas/métodos/fuentes/enlaces y comparación de integridad sí realizadas; no representan prueba de motor o fórmulafinal.
- Integridad final:3,091archivos protegidos (incluido todo local-persistence/.work, README, integración/build, documentos ajenos, scripts/escenas/assets/proyectos/backend y ambas basesduraderas/manifests/leases) mantienen cantidad/digest de hashes/fechas inicial. Directorios de datos sin nuevas entradas ni borrados. Se conservaron cuatro partidas de game-progress por archivo idéntico, sin abrirSQLite, migrar o escribir; infraestructura persistence igualmente íntegra. Ningún acceso original, no se afirma hash de original no inspeccionado.
- .env conserva278bytes, SHA-2564DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, fecha/atributos/SDDLcompleto/ACL/propietario iguales al baseline de esta subfase. Solo hash/metadatos, sin lectura de valores o cambios de permisos. B00 riesgoACL pendiente independiente. Sin Atlas, secretos, recursos/B05/finales implementados o escena ejecutada.
- Resultado: B04.2B.2B.2B.1 COMPLETADA DOCUMENTALMENTE conforme criterios del usuario de explicitar lo faltante; implementación disponibilidadPARCIAL/BLOQUEADA y padre2B sigue parcial. No código nuevo por condición de evidencia insuficiente. No siguiente fase ni conexión UI/finales/B05 autorizada o iniciada.
- Recomendación: confirmar política inicial/orden/continuación y tabla de evaluación global antes de autorizar las respectivas implementaciones; no inferirlas. Mantener señal de completion separada y validar contexto al conectarla en fase futura. Detenerse aquí.
## B04.2B.2B.2B.2 — Disponibilidad libre aprobada y finales existentes

- Fecha2026-10-25. Alcance exclusivo copia autorizada, policy/servicios/adaptador/tests ya listados. Nuevo usuario sustituye expresamenteRF-021: cinco disponibles, ordenlibre, decisión no completa, continuación y completed terminal por partida. No modificar DOCX/escenas/gameplay/finales/recursos/B05.
- Inspección de ocho documentos requeridos, fuentes de política/servicio/tests y cadena real FinNivel/VariablesGlobales/Final.tscn/Final.cs/EndingService/AnimalProgressService/GameStateStore/GameService y búsquedas en scripts/backendactual/docs. Confirmación usuario de demo con tresfinales correcta preservada; no se localizó cálculo numérico exacto en copia permitida. Final solo selecciona presentación desde ending confirmado recibido por HTTP; no fórmula de mayoría inventada o nuevaescena. Inputs/GameDto/biomas/decisiones/fechas/versiones auditados y representación/brechas SQLite documentadas. No acceso al original/Atlas para buscarlo.
- Código modificado4: local-persistence/src/GameRulePolicy.cs.txt (FreeBiomeAvailabilityPolicy/catálogo readonly de cinco), GameSaveService.cs.txt(defaultpolicy y consulta AreAllCanonicalBiomesCompleted), integration/sqlite/GamePersistenceAdapter.cs(fachadaAsync de consulta) y local-persistence/game-save-tests/GameSaveChecks.cs.txt(unknown explícito y4escenarios nuevos con23áreas). Sin otrasfuentes/proyectos/paquetes/modelos/repositorios/proveedores/schema modificados. Documentos7actualizados autorizados: REAL_GAME_SAVE_CONTRACT, BIOME_PERSISTENCE_MAPPING, SAVE_INTEGRATION_CHANGE_PLAN, DECISIONS, PHASES, PHASE_HISTORY y local-persistence/README.
- Policy real comprueba IDcanónico, partida actual/in_progress y bioma no completed; etapa human_pending/animal_pending separada de permisos. Completed/archivada mantienen rechazo independiente, cinco iniciales disponibles, sin prerequisitos/orden. Policies explícitas desconocidas de fixture siguen unknown ydenegadas; no defaultundefined ya resuelto. Regla confirmada aplicada sin persistir nuevos valores/formato o migrar datos.
- ConsultaAll: carga agregado validado y exige una fila completed de cada ocean/jungle/desert/forest/tundra de misma GameId. No decisionescontadas ni mezcla de partidas; readonly, válida en historial sin habilitarlo; estable tras subproceso readonlyfixture. Cuatrofalse/cincotrue sin Statusfinal/ending ni escenas. CompleteBiome/RecordDecision/idempotencia/terminalidad/concurrencia/rollback conservados.
- Pruebas reales:42/42progreso (38regresión+4nuevosescenarios agrupados con23áreas),43/43SQLite y39/39backend,124casosaprobados0fallidosfuncionales. Repetidos42/43no sumados como casosnuevos. NuevasfixturesUUID .work y subproceso readonly, cero bases temporales restantes. No suites49/48/28que tocarían duraderas. Sin internet/HTTP en servicio local, backend solo loopback/memoria. SinselecciónfinalprobadaenGodot, motornoejecutado.
- Compilaciónincidencia: TwoSides.csproj inicial actual(290bytes,mtime25/10/2026 03:17:26) solo SdkGodotNET4.6.1/TargetFramework/Android/EnableDynamicLoading, sin referencia de biblioteca y sin importBuildIsolation de informesanteriores. Hash/fecha iguales al baseline final: se conserva estado del usuario, no se restaura o modifica archivo prohibido. Intentos de runnerModeProgress/Build fallaron antes de tests con35errores namespace/tiposLocalPersistence y12warnings; no son builds aprobados ni conteo final correcto de warningslegados.63warnings previos permanecen históricos. Rebuildbiblioteca independiente0/0ytestejecutor0/0, .NET8/SQLite3.53.3. Resolver referencias sinrestore mostró assetsGodot apuntando a paquetesglobalespreexistentes; no se instaló/restauró/globalconfig ni se declara buildprivadoGodotaprobado. El csproj requiere autorización separada para reponer referencia/aislamiento, no se infiere permiso.
- Ruta alternativa de validación usada: local-persistence/run-checks.ps1 establece entorno/caches/CLI/TEMP privados y ejecuta43; dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore --disable-build-servers -nodeReuse:false; exeprivado --progress. Tras corregir llamadaLINQ explícita y adaptartestunknown, biblioteca/fixtures corrieron satisfactoriamente. No se editaron runners/csproj para eludir restricción. Assetsprotegidos/gameplay/basesnointactos no se modificaron.
- Auditoría futura de completion: FinNivel.OnBodyEntered→FinalizarNivel requiere contactoGrupoJugador y cotejoNivelActual/escena; integrar contexto/GameId/BiomeId/perspectiva/Revision/generación/OperationId estable y evidencia de señalreal, no UIflag. No conexiónhoy. FinalRestauración: conservar decisiones/consecuencias/resultados/fechas/reglas y eventualEnding/EndingRulesVersion/CompletedAt, campos que repositorioactual no hidrata completamente; GoodBiomeCountnoesfórmula. Comparar tres trayectorias de demo antes/después de guardar/cerrar/continuar con evaluadorreal/versiones, pendiente de localización/autorización. No cambiar cálculo comprobado por usuario.
- Integridad antes/después:624archivos protegidos coinciden cantidad/digest/hash/fecha, ambas basesduraderasgame-progress/persistence conmanifest/leaseintactos, cuatroGameIdnoabiertosniusados. .env278bytes/hash4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928,mtime/attributes/SDDLownerACLiguales; sinlectura de valores/cambioACL. B00riesgoSIDsiguependiente. Originalnoaccedido, noafirmarhashdebaseoriginalnoinspeccionada.
- ResultadoPARCIALglobal: implementaciónavailabilitylibre y consultaAllCOMPLETADAS; verificaciónGodotBLOQUEADA porrefausenteprotegida; cálculoexactofinalpendientepero mecánica existente preservada. Se documenta como incompatibilidad importante conformecriterio usuario, no se inventan reglaspendientes. No UI/finales/recursos/B05 implementados ni faseposterior iniciada. Recomendación autorizar reparación mínima csproj/aislamiento antes de validarGodot y localizar evaluador demo sin reemplazarlo. Detenerse.
## B04.2B.2B.2B.3 — Reparación mínima de compilación

Estado COMPLETADA, 2026-10-25. Solo se modificó código de configuración en TwoSides.csproj, más estos documentos autorizados. No se implementó gameplay ni se ejecutó Godot.

Diagnóstico: archivo actual sin ProjectReference, ruta relativa local-persistence/src/TwoSides.LocalPersistence.csproj existente y compatible net8.0; biblioteca usa Compile explícito *.cs.txt y Microsoft.Data.Sqlite[8.0.32]. El informe B04.2B.2A registra una referencia y exclusiones anteriores con imports SDK explícitos, mientras el archivo previo de esta reparación tenía solo Sdk/PropertyGroup. Búsqueda de proyectos/props/targets no encontró referencia activa en otro archivo. Git solo muestra commit inicial645d213 para este proyecto; no demuestra cuándo/quién/proceso cambió configuración. Hecho comprobado: ausencia respecto al informe; causa de pérdida/regresión NO determinada. No atribuir a usuario, OneDrive, herramienta o rollback sin evidencia; no restaurar todo un archivo histórico.

Cambio mínimo: conservar Project Sdk=Godot.NET.Sdk/4.6.1 y las tres propiedades originales(TargetFrameworknet8.0, condiciónAndroidnet9.0, EnableDynamicLoadingtrue). Agregar únicamente ItemGroup con ProjectReference Include="local-persistence/src/TwoSides.LocalPersistence.csproj" y Compile Remove="local-persistence/**/*;integration/sqlite/.work/**/*". No duplicar código SQLite o DLL manualmente. Evaluación MSBuild:83Compile inputs,0fuentes internas/tests/artefactos en Compile y1ProjectReference. No cambios de SDK/paquetes/versiones/estructura completa o a otros archivos de configuración.

Aislamiento de validación: reutilizar SOLO preámbulo existente de integration/sqlite/run-infrastructure.ps1 hasta antes de $config para establecer entorno privado DOTNET_CLI_HOME/NUGET_PACKAGES/cache/scratch/TEMP/MSBUILDDISABLENODEREUSE; con $PSScriptRoot resuelto a integration/sqlite. No editar runner ni imports tempranos del proyecto. Pasar GodotProjectDir absoluto con barras/ final a integration/sqlite/.work/ por línea de comando: el SDK coloca bin/obj bajo integration/sqlite/.work/.godot/mono/temp. Biblioteca/ejecutores y cachés siguen local-persistence/.work. Esta propiedad es solo ruta de SDK en compilación, no nueva raíz de escenas ni cambio project.godot. No usarla para ejecutar/exportar juego. Defaults de un build directo sin este entorno pueden usar .godot y cachés de usuario: procedimiento privado explícito es requisito de validación.

Comandos bajo ese entorno: dotnet restore TwoSides.csproj --configfile local-persistence/NuGet.Config --packages <privatepackages> --disable-parallel -p:GodotProjectDir=<absolute integration/sqlite/.work/>; dotnet build TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -p:GodotProjectDir=<mismo> -v:q. Restore repara activos de ese destino, sin paquetes actualizados ni instalaciones/globalconfig; único packageFolder privado verificado en project.assets.json. Nativeassets incluidos por NuGet sin copias manuales.

Primer setup diagnosticó variable de raíz no asignada y luego un argumento Windows con barra invertida final absorbió -v:q en PowerShell nativo, provocando rutas inválidas/NETSDK1004/MSB3191; corregir solo comando con separadoresforwardslash antes del restore/build satisfactorio. No ocultar intentos fallidos como aprobados; no bases ni gameplay afectados. No hizo falta modificar otros archivos permitidos o pedir ampliación de alcance.

Resultado build Godot:0errores,63advertencias distintas preexistentes (código legado/generado),0nuevas en adaptadores/biblioteca. Biblioteca y ejecutores compilan0errores/0advertencias. SDKGodot4.6.1, net8.0/SDK10.0.400 y runtime de tests8.0.30 conservados; Microsoft.Data.Sqlite/Core8.0.32 y SQLitePCLRaw2.1.13, sin versión nueva. PowerShell Add-Type con DllImport absoluto de e_sqlite3.dll de salidaGodot/runtimes/win-x64/native llamó sqlite3_libversion y devolvió3.53.3; temporales en carpeta privada. No editor/motor, escena, export o SQLite de jugador abiertos para esta carga. Verificación -getItem:Compile,ProjectReference confirma exclusiones/referenciaúnica.

Regresiones reales:42/42progreso-disponibilidad +43/43SQLite +39/39backend=124aprobadas,0fallidas. Nuevasfixtures temporales y childreadonly solo de fixtures, cero bases temporales restantes; backend memoria/loopback sin Atlas. Suites duraderas49/48/28 no ejecutadas para preservar game-progress y persistence. Carga nativa es comprobación adicional, no se cuenta como nueva prueba de final. Disponibilidad libre/consultaAll/idempotencia/rollback conservados sin modificar lógica.

Integridad:623archivos protegidos comparados antes/después, hashes/fechas/ACL .env y ambos almacenes con manifiestos/leases intactos. El inventario excluye únicamente TwoSides.csproj por ser el cambio autorizado frente a los624anteriores; incluye SchemaManager/escenas/scripts/actores/NPC/menús/assets/Express y adaptadorinfra. Cuatro partidas previas permanecen por archivo idéntico, no se abrieron/migraron/escribieron/eliminaron auxiliares. .env278bytes/SHA2564DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, fecha/propietario/ACL/atributos iguales. No valores impresos. Original no accedido; causa histórica de referencia ausente no determinada. B00 riesgoACL sigue pendiente.

Archivos actualizados exactamente6: TwoSides.csproj y backend/docs/{PHASES.md,PHASE_HISTORY.md,DECISIONS.md,GODOT_SQLITE_INTEGRATION_PLAN.md}, local-persistence/README.md. No tests u otros scripts modificados. Reparación COMPLETADA; siguiente integración visual/ejecuciónGodot requiere autorización nueva. Cálculo exacto de finales pendiente de localizar, demo del usuario preservada; no finales/recursos/B05 nuevos ni conexión escenas. Detenerse aquí.
## B04.2B.2B.2C.1 — Preparación de integración real Godot (2026-10-25)

Estado: **COMPLETADA, exclusivamente preparación documental**. No se conectaron escenas ni se implementó runtime. Documentos vigentes: GODOT_RUNTIME_INTEGRATION_PLAN.md (flujo real, HTTP, contratos A–G, recursos, inventario individual y bloqueos), GODOT_SCENE_EVENT_MAPPING.md (cinco recorridos, conexiones reales, decisiones y FinNivel), GODOT_RUNTIME_TEST_PLAN.md (R01–R20, automatización/manual y precondiciones).

Evidencia estática: project.godot UID ddbjf57wpxxoq resuelve a assets/sprites/ui/menu_principal.tscn; Jugar exige sesión y recuperación remota. RegisterScreen solicita Username junto con email/password; no existe entrada de nombre exclusivamente local en ese flujo. Nueva partida actual se crea automáticamente en GameService ante ausencia reconocida; continuar pasa por RecoveryScreen/BiomeMenuAccessGate. La propuesta local separa identidad estable, intención de nueva partida e historial, sin usar esos gates HTTP como autoridad. Transporte remoto se conserva para futuras funciones; no se definió endpoint de estadísticas nuevo.

Cinco biomas canónicos disponibles libremente desde inicio por política local vigente, sin RF-021 secuencial ni repetición de completed. Botones No/Sí → reject/approve → decisión confirmada → información → segmento animal. La decisión persiste consecuencias y animal_pending, no completa bioma. FinNivel.Area2D conecta BodyEntered por código, verifica grupo jugador y guard, difiere FinalizarNivel y coteja NivelActual con escena animal; no valida por sí mismo todos los datos de una futura transacción local. _Ready con modal completion:true,start:false no constituye llegada física. Commit válido de CompleteBiome precederá bloqueo/actualización/navegación; retry conserva UUID e intención, fallo de transición no repite consecuencias.

Recursos identificados: CurrentHealth int/MaxHealth en cinco Player*.cs; Agua/Comida float y flags en Estadisticas, inicializados en Ready; delfín tiene agua inactiva. Captura/hidratación explícita y payload nuevo siguen pendientes, boundary1 no contiene recursos. No restaurar mediante daño/pickup ni regenerar recursos silenciosamente. Vida/agua/comida pertenecen al actor y frontera confirmada; no prometer restauración de mundo intermedio. Calor solo enum sin recurso funcional encontrado.

Finales: se conserva la confirmación del usuario sobre Bueno/Medio/Malo. El recorrido observable obtiene Ending/GoodBiomeCount/EndingRulesVersion de confirmación/GET current, valida en GameStateStore y presenta por EndingService/Final.cs. No se localizó con certeza el evaluador de umbrales dentro de la copia; no se inventó fórmula ni se consultó original/Atlas. AreAllCanonicalBiomesCompleted solo consulta, no calcula ni persiste final. Bloqueos funcionales acotados: evaluador/fixtures auténticas, tabla local de consecuencias verificada, contrato versionado de recursos y fixtures runtime autorizadas distintas de bases protegidas.

Validación de esta fase: lectura estática y comparación de integridad, no tests/compilación/Godot. 42+43+39=124 aprobadas, build 0 errores/63 advertencias y carga nativa son resultados históricos de la fase previa, no reejecutados aquí. Se inventariaron al inicio 1,514 archivos existentes protegidos fuera de las siete rutas documentales autorizadas, excluyendo cachés .work/.godot y node_modules; se comparan hashes/tamaños/fechas antes y después. Ambos almacenes duraderos y sus manifiestos/leases (seis archivos) se verifican por hash/tamaño/fecha, sin abrir SQLite. Cuatro partidas ficticias preservadas por identidad binaria de la base, sin consultas SQL.

.env conserva 278 bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928; fecha, atributos y descriptor de seguridad comparados. No se leyeron valores ni se cambiaron ACL/propietario. B00 sigue BLOQUEADA por discrepancia ACL heredada Modify no resuelta. Se mantienen los cambios previos del usuario presentes en git; no se revierten ni se atribuyen a esta fase.

Alcance de escritura exacto: crear backend/docs/GODOT_RUNTIME_INTEGRATION_PLAN.md, GODOT_SCENE_EVENT_MAPPING.md, GODOT_RUNTIME_TEST_PLAN.md y actualizar backend/docs/PHASES.md, PHASE_HISTORY.md, DECISIONS.md, SAVE_INTEGRATION_CHANGE_PLAN.md. Ningún otro documento, script, escena, csproj, dependencia, esquema o base fue autorizado para modificación. El inventario futuro del plan enumera rutas/clases/responsabilidades/riesgos/pruebas individualmente; no es autorización general sobre directorios.

Recomendación: próxima implementación limitada y expresamente autorizada de composición local, perfil/menú/nueva partida/continuar y selección, con fixtures propias. Resolver requisitos de consecuencias/recursos/finales antes de conectar esas rutas; no anunciar offline completo mientras quede un gate remoto indirecto. No motor, Node, Atlas, migraciones, integración funcional ni B05 en esta fase. Detenerse y esperar instrucciones.

## B04.2B.2B.2C.2A — Perfil y partidas en menú local (2026-10-25)

Estado: **implementación y validación automatizada terminadas; PENDIENTE DE VALIDACIÓN RUNTIME (EN_PROCESO)**. No se ejecutaron editor ni videojuego. Esta actualización sustituye las propuestas de C.1 únicamente para composición/perfil/partidas/admisión a selección; decisiones desde escenas, FinNivel, recursos y finales siguen sin conectar. No se inició B05.

Ampliación expresa aprobada en esta conversación: base nueva y separada `local-persistence/.work/runtime-game/save.sqlite3` y cambios mínimos en `local-persistence/src/CopyGameDatabase.cs.txt` y `OwnedCopyDatabase.cs.txt`. Las rutas AppData game-progress y persistence permanecen protegidas; ninguna se abre desde el modo runtime. No se importan las cuatro partidas ficticias ni se copian sus perfiles. El almacén runtime aún NO se ha creado/abierto durante esta validación; se inicializará al primer inicio manual. Su ubicación dentro de .work es duradera para este flujo y no debe borrarse como caché.

GameApplicationContext._Ready compone un único GamePersistenceContext hijo del Autoload existente. No crea ApiClient, journal user://, servicios de autenticación, ConnectivityOverlay ni OceanDecisionContext en el inicio local. El código HTTP se conserva en una rutina privada no invocada, pendiente de sincronización futura; Services remoto no está inicializado en este modo. No hay cuenta técnica, tokens, correo ni contraseñas nuevos. VariablesGlobales y ambiente permanecen intactos.

LocalGameState usa un puerto ILocalMenuStore implementado por GamePersistenceAdapter. Inicialización coalescida, apertura serial en worker, perfil/partida/revisión y resultados controlados, sin Node en el worker. Solo crea perfil por intención de guardar nombre y partida por intención de nueva partida; volver al menú o reiniciar la proyección no genera registros. UUID/op/payload se conservan durante reintento; fallo de lectura no equivale a ausencia. No hay sustitución volátil ni fallback HTTP.

MenuPrincipal crea LocalProfileView desde código porque la escena existente no tiene nombre ni Continuar. Se reutiliza su contenedor y se oculta el botón de textura ambiguo; la vista aprobada muestra guardar nombre, nueva partida y continuar según estado. No se modifica .tscn. Nombre NFC validado por servicio; perfil existente se recupera, no se vuelve a solicitar. No existe función de renombrar en el menú: no se añadió; UpdateDisplayName previo conserva su contrato y pruebas.

Nueva partida relee la actual y utiliza PrepareNewGame/CreateNewGameAsync con ExpectedCurrentGameId/Revision; confirma en diálogo si hay una activa, archiva sin borrar e inicializa cinco biomas disponibles libremente. No muestra éxito hasta commit y relectura. Reintentar respuesta perdida recupera recibo sin duplicar. Continuar relee SQLite y solo admite la frontera de menú v1 reconstruible de una partida current/in_progress con owner/revisión coherentes. Una frontera de segmento que necesita restauración no implementada se bloquea con mensaje y no se reinicia. Navegación fallida conserva el commit y permite reintentar Continuar.

MenuNiveles admite el ticket local y muestra selección existente + aviso y volver al menú. TarjetaNivel no se modifica: al no existir controller remoto en modo local, las tarjetas permanecen deshabilitadas como límite de esta subfase, NO como una política de disponibilidad persistida. Los cinco siguen disponibles en dominio/SQLite; el aviso explica que la entrada a biomas se conectará después. No se permite entrar a escenas cuyas decisiones todavía exigen el flujo remoto. El juego completo offline aún no está implementado ni validado. Conectar tarjetas/controlador a escenas corresponde a la siguiente autorización, B04.2B.2C.2B según la solicitud.

Proveedor runtime: ruta exacta cerrada, purpose copy-runtime-game, application_id 0x54535254, manifest con identidad de archivo/Ready y lease existentes, esquema existente sin DDL nuevo. Se reutilizan comprobaciones de propiedad/final-path/reparse/hardlink; desconocidos fallan sin adoptar ni migrar. La capacidad runtime se ancla en la raíz exacta local-persistence, validando su handle y cada descendiente. Sus ancestros OneDrive/Desktop tienen metadatos reparse de nube observados; no se relajan las comprobaciones de archivos/raíz/descendientes ni el modo AppData legado. Verificación de apertura duradera y comportamiento del motor queda pendiente de la prueba manual; no se afirma que las fixtures temporales validen ese montaje real.

Resultados efectivos finales: **26 pruebas nuevas de menú + 42 progreso + 43 SQLite + 39 backend = 150 aprobadas, 0 fallidas** (sin sumar repeticiones). Las 26 usan coordinador real + servicio/UoW/repositorio/SQLite real en SyntheticSandbox y puerto de almacenamiento de fixture, con fallos inyectados; comprueban también que el adaptador runtime real rechaza la ruta protegida ANTES de acceso. No ejecutan nodos/UI/Godot ni crean datos en la base runtime. Reinicio del menú se prueba con nuevas instancias del coordinador sobre fixture; no se presenta como reinicio real del motor. Las regresiones de progreso incluyen comprobación de lectura en proceso hijo sobre fixture.

Biblioteca y ejecutores: 0 errores/0 advertencias. Godot C#: compilación correcta, 0 errores, 63 advertencias preexistentes ParallaxBackground en compilación de scripts, 0 nuevas atribuibles a esta fase; build final de scripts 63 advertencias preexistentes y 0 nuevas (un build incremental anterior emitió 0). MSBuild: 86 Compile items, 1 referencia a la biblioteca y 0 fuentes filtradas desde local-persistence o integration/sqlite/.work. .NET de pruebas 8.0.30, SQLite 3.53.3, paquetes/esquema/csproj del juego sin cambios. Entorno/build privados mediante preámbulo de run-infrastructure y GodotProjectDir a integration/sqlite/.work/.godot/mono/temp; sin editor/export/configuración global.

Verificación: **1,506 archivos existentes protegidos** fuera del inventario de cambios comparados por tamaño/hash/fecha, ambos almacenes protegidos con sus seis archivos (DB/manifiesto/lease) intactos. Cuatro partidas conservadas por identidad binaria de game-progress, sin consultas SQL. .env 278 bytes, SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, fecha/atributos/propietario/ACL iguales; no se leyeron valores. B00 sigue BLOQUEADA por riesgo ACL heredado Modify, sin cambios de permisos. Cero bases sintéticas temporales restantes.

Próximo paso: pruebas manuales acotadas abajo, y después autorización explícita de integración de tarjetas/biomas. No conectar decisiones, FinNivel, recursos o finales por extensión de esta entrega.


### Inventario ejecutado: doce archivos de código/pruebas y siete documentos

| Archivo | Cambio |
|---|---|
| scripts/network/GameApplicationContext.cs | Bootstrap local único; conserva composición remota sin invocarla. |
| scripts/MenuPrincipal.cs | Perfil/nueva/continuar por SQLite, diálogo de archivado, errores y navegación. |
| scripts/MenuNiveles.cs | Admisión local, aviso de alcance y retorno a menú; no entra a biomas. |
| integration/sqlite/GamePersistenceContext.cs (nuevo) | Vida del coordinador/adaptador por aplicación; inicialización/cierre. |
| integration/sqlite/LocalGameState.cs (nuevo) | Puerto ILocalMenuStore, proyección autoritativa, comandos pendientes y ticket de selección. |
| integration/sqlite/LocalProfileView.cs (nuevo) | Controles locales creados en el contenedor existente, sin escena nueva ni credenciales. |
| integration/sqlite/GamePersistenceAdapter.cs | Implementa puerto de menú y modo runtime separado, conserva API legado. |
| local-persistence/src/CopyGameDatabase.cs.txt | Nueva ruta fija runtime y apertura explícita distinta de AppData. |
| local-persistence/src/OwnedCopyDatabase.cs.txt | Propósito/application_id/anchor runtime, conserva modos legados y seguridad de archivos. |
| local-persistence/game-save-tests/GameSave.Checks.csproj | Incluye fuente pura LocalGameState para pruebas sin motor. |
| local-persistence/game-save-tests/GameSaveChecks.cs.txt | Despacho --runtime-menu; suites anteriores conservadas. |
| local-persistence/game-save-tests/RuntimeMenuChecks.cs.txt (nuevo) | 26 comprobaciones de coordinador/SQLite/fallos sobre fixtures nuevas. |

Documentos actualizados exactamente: backend/docs/GODOT_RUNTIME_INTEGRATION_PLAN.md, GODOT_SCENE_EVENT_MAPPING.md, GODOT_RUNTIME_TEST_PLAN.md, PHASES.md, PHASE_HISTORY.md, DECISIONS.md y local-persistence/README.md. SAVE_INTEGRATION_CHANGE_PLAN.md y otros documentos quedan sin modificar. Ninguna escena, TwoSides.csproj, project.godot, esquema, script ambiental, decisión, FinNivel, Final, personaje o NPC cambia en esta fase.

Evidencia capturada antes de editar código (ruta, bytes, ticks UTC y SHA-256; NEW indica archivo inexistente):

```json
[{"Path":"scripts/network/GameApplicationContext.cs","Size":2034,"Time":"639277228745318915","Hash":"A90AC7128B8D94F918A1A607D6DE7AAB807074D9E8C97BAF330DCA234D10FABD"},{"Path":"scripts/MenuPrincipal.cs","Size":4620,"Time":"639277206958306777","Hash":"23A62E2A235C02A696AEDE3FE0C1B985D3D63534F021EB6A8DCA67FCF0CECCE9"},{"Path":"scripts/MenuNiveles.cs","Size":1785,"Time":"639277211698056135","Hash":"E70C00677C0A3327958F0D48812B2A8A9DA24CAA499D1602B20D8354B24F0888"},{"Path":"integration/sqlite/GamePersistenceAdapter.cs","Size":8342,"Time":"639285172745672456","Hash":"747D5063FB116950D518D961A1BEB9659712191312F84FDC2BB627325711BF83"},{"Path":"integration/sqlite/GamePersistenceContext.cs","State":"NEW"},{"Path":"integration/sqlite/LocalGameState.cs","State":"NEW"},{"Path":"integration/sqlite/LocalProfileView.cs","State":"NEW"},{"Path":"local-persistence/src/CopyGameDatabase.cs.txt","Size":985,"Time":"639285119407703173","Hash":"05B43FCD31D9283C3233A711995E77C91638BB1E44BF4E9AC525BF60B0FE6115"},{"Path":"local-persistence/src/OwnedCopyDatabase.cs.txt","Size":12630,"Time":"639285124356563751","Hash":"47F14B105255EC14477A7A7FA6996221DB7222C4942935A2472DBB8176633282"},{"Path":"local-persistence/game-save-tests/GameSave.Checks.csproj","Size":676,"Time":"639285121458792102","Hash":"AC4AB1B1594D8E345BB70B3A88CEB4879256C38ED34FD0C92DFDD66F1118731D"},{"Path":"local-persistence/game-save-tests/GameSaveChecks.cs.txt","Size":38228,"Time":"639285173859646458","Hash":"781046EB5846513543D3592E37519866567E31DD34F99058DDEEF145D7A29D8B"},{"Path":"local-persistence/game-save-tests/RuntimeMenuChecks.cs.txt","State":"NEW"}]
```

Metadatos de los siete documentos antes de actualizarlos:

```json
[{"Path":"backend/docs/GODOT_RUNTIME_INTEGRATION_PLAN.md","Size":22078,"Time":"639285743727992057","Hash":"D4B4A4CC45BCBE189F683DFFC4685BB9984C124B10BFD679424679B652AC5A7F"},{"Path":"backend/docs/GODOT_SCENE_EVENT_MAPPING.md","Size":9909,"Time":"639285743201816117","Hash":"EA6BBD2F154D71AEA26C9F4314FB7C7853D3AB483FAE077D520BF15C8C0B6190"},{"Path":"backend/docs/GODOT_RUNTIME_TEST_PLAN.md","Size":8352,"Time":"639285743203070469","Hash":"58C9D037AFFC655F98C864B07A4F35535CBB2140E1A29632EDAEF86F7BC7454D"},{"Path":"backend/docs/PHASES.md","Size":46750,"Time":"639285743728026615","Hash":"B1987F55029773883C9CF069D5FE42F2271C7E7E32CE2001F30211BE7DBE108A"},{"Path":"backend/docs/PHASE_HISTORY.md","Size":117022,"Time":"639285743728046286","Hash":"4C8EFC963E7FB9A5CDE193EB174C2F893D2973245070DFE3C56C3C05EB176225"},{"Path":"backend/docs/DECISIONS.md","Size":59059,"Time":"639285743728046286","Hash":"C45EF7F0A6DFC4680EE832FE4FA7140ECBFAD02BC723F1530FE1AA4113FF0541"},{"Path":"local-persistence/README.md","Size":52091,"Time":"639285178102223197","Hash":"E8C90CE1CDDD043E432F530CDAAF332737F18D88F04B5723E5A209A147BCF12E"}]
```

Intentos intermedios corregidos: primer preámbulo de compilación con interpolación accidental del nombre ErrorActionPreference dio ParseException antes de ejecutar build; se corrigió usando literal. Primer test Node fue bloqueado por sandbox con spawn EPERM, luego ejecución escalada autorizada pasó39. Primera compilación de pruebas nuevas requirió tipos genéricos explícitos Run<T> (CS0411); corregido. Una aserción inicial interpretaba CanReplay como false en todo incompleto; se corrigió para comprobar human_pending/CanEnterHuman y disponibilidad, sin cambiar política de dominio. Resultados definitivos son los150 aprobados; no se cuentan intentos fallidos como éxitos.


## B04.2B.2B.2C.2A.1 — Menú compacto y partida única (2026-10-26)

**Código COMPLETADO; PENDIENTE DE VALIDACIÓN RUNTIME del diseño y botones.** Esta decisión del usuario sustituye expresamente la política anterior que permitía archivar/reemplazar una partida incompleta por una intención de Nueva partida. Las descripciones anteriores se conservan como historia, no como regla vigente.

El usuario confirmó por prueba manual de C.2A: inicio sin Node.js, nombre visible sin credenciales, creación/continuación de partida, persistencia del perfil tras reinicio y ausencia de errores SQLite observados. Esa confirmación no valida el layout ni la restricción añadidos aquí. No se ejecutó Godot/editor/exportación durante C.2A.1.

### Diagnóstico y corrección visual

Centro era un CenterContainer con anchor_left=0.23, top=0.41, right=0.48, bottom=0.61 y offsets right=190/bottom=151. En el viewport lógico 640×360 su región comenzaba en y=147.6 y acababa en y=370.6, ya fuera del límite inferior incluso antes del crecimiento mínimo de los controles. La nueva vista de perfil y acciones aumentó ese mínimo; márgenes interiores de25 y mensajes largos agravaban el recorte.

Se conservan la escena, fondo, título dibujado TWO SIDES, imágenes, texturas y StyleBoxTexture originales. Centro ahora usa anclajes completos y márgenes exteriores x=8, superior72/inferior8 para reservar el título; el contenedor resuelve centrado del tablero sin los antiguos offsets de colocación parcial. Margen pasa a12 horizontal/8 vertical; Contenido usa separación6. LocalProfileView aplica fuente12 a sus controles,11 al estado, separación4 y ancho mínimo260 para envolver mensajes. El nombre permanece visible también ante mensajes transitorios. No se añadió contenedor ni pantalla, no se escaló/reemplazó ningún sprite ni se cambió project.godot o la resolución.

Revisión **ESTÁTICA**, no medición del motor: región disponible de Centro x8/y72/ancho624/alto280 en640×360 → x16/y144/ancho1248/alto560 a1280×720, borde inferior704 dentro de720. El tamaño mínimo final de panel/controles y la ausencia de recortes/solapamientos reales requieren prueba manual; no se presentan como pruebas visuales aprobadas.

### Política transaccional y comportamiento

GameSaveService.HasUnfinishedGames consulta todo el historial del perfil mediante COUNT, sin paginación que pueda omitir un registro antiguo. En CreateNewGame se repite la comprobación dentro de UnitOfWork.Write/BEGIN IMMEDIATE, después de validar propietario y antes de insertar. Devuelve **GAME_IN_PROGRESS** si hay cualquier partida no cerrada. Se retiró el bloque que archivaba automáticamente la actual. No se alteran tablas, migraciones, esquema ni partidas existentes.

Reconocimiento conservador de cierre: únicamente status=completed junto con Ending good/medium/bad, EndingRulesVersion no nula e igual a RulesVersion y CompletedAt no nulo. is_current para completed ya es0 por CHECK existente. Status archived NO demuestra cierre, incluso si no hay partida actual; status in_progress/final_pending bloquea siempre. Esos campos son el contrato del futuro escritor confiable, no prueba criptográfica del origen de un archivo manipulado. No se los asigna en producción desde esta fase, no se agrega endpoint/cierre y no se reconoce un final por mayoría, consulta de biomas o apertura de menú.

El recibo idempotente existente sigue consultándose antes de ejecutar una intención nueva: mismo OperationId/digest recupera su resultado confirmado; no autoriza una segunda partida. UUID distintos concurrentes tienen un solo ganador. Un conflicto nuevo no convierte un error en éxito; el coordinador descarta esa intención rechazada y relee el estado, mientras los errores de resultado incierto conservan la intención para retry.

GamePersistenceAdapter expone HasUnfinishedGamesAsync. LocalGameState consulta la política desde SQLite y expone CanStartNewGame; LocalProfileView deshabilita Nueva partida si existe una sin cerrar. MenuPrincipal elimina el diálogo de reemplazo y rechaza esa acción con mensaje breve. Perfil y partida mantienen identidad al renombrar; no se añade interfaz de renombrado.

| Estado persistido | Nueva partida | Continuar |
|---|---|---|
| Perfil válido, sin partidas sin finalizar | Habilitada | No disponible si no hay activa |
| Activa in_progress en frontera de menú compatible | Bloqueada | Habilitada para la misma partida |
| Archivada sin cierre, sin actual | Bloqueada | No disponible; mensaje de partida sin finalizar, sin reparar historial |
| Solo historial completed con metadatos de cierre válidos | Habilitada | No disponible |
| Error SQLite/política no confirmada | Bloqueada | No se inventa progreso ni fallback |
| Activa que requiere restauración aún no soportada | Bloqueada | Transición limitada con mensaje; no reset de recursos |

Si la base manual tiene históricos incompletos de la política anterior, también bloquearán nuevas creaciones. No se consultó su contenido ni se migró/corrigió/borró nada para resolver ese caso.

### Contrato futuro de finalización global, sin implementarlo

Cinco biomas completos es una precondición del flujo de final, no una orden de cerrar. El coordinador futuro deberá validar partida/dueño/revisión, los cinco completed, evaluador existente y versiones, y resultado auténtico Bueno/Medio/Malo; preparar/persistir final pendiente sin habilitar Nueva partida. Tras el evento real de presentación/confirmación del resultado, una operación idempotente y transaccional aún por diseñar confirmará status=completed, is_current=0, Ending/EndingRulesVersion/CompletedAt, revisión/snapshot coherentes y recibo. Solo entonces HasUnfinishedGames podrá permitir otra, si no quedan históricos sin cerrar. Fallo de escritura no cierra; reapertura no repite efectos. No se ha identificado/validado aquí ese evento ni se modificaron fórmulas, Final.cs, FinNivel o escenas finales. AreAllCanonicalBiomesCompleted sigue siendo solo consulta.

### Pruebas y compilación efectivas

**35 menú/política +42 progreso/decisiones +43 SQLite =120 comprobaciones C# aprobadas,0 fallidas.** No sumar repeticiones. Incluyen primera creación, persistencia de nombre/perfil, Nueva/Continuar, rechazo directo del servicio, historial archivado incompleto sin actual, estado terminal de fixture que permite otra, misma intención concurrente, intenciones distintas concurrentes, nuevo proceso de lectura que conserva bloqueo, renombrado y fallo SQLite/rollback/retry. El coordinador usa puerto de fixture con servicio/UoW/repositorio/SQLite reales; no son pruebas de nodos/UI Godot.

Las fixtures históricas que necesitaban una segunda partida se adaptaron a un registro terminal explícito creado SOLO en bases sintéticas propias. SeedTerminal es setup de pruebas por SQL, no API de cierre del producto, ni evidencia de que un final haya sido presentado. El caso de cinco biomas completos comprueba además que Nueva partida se sigue rechazando sin cierre. Se conserva la cobertura de idempotencia, decisiones, bloqueo por bioma y rollback; una prueba antigua de reemplazo se actualizó para exigir rechazo, conforme la regla nueva. El ejecutor duradero histórico sin argumentos quedó deshabilitado con mensaje/exit2 para evitar escrituras accidentales a AppData y expectativas de reemplazo obsoletas; usar --runtime-menu y --progress, nunca modificar las bases protegidas para adaptar pruebas.

Comandos: local-persistence/run-checks.ps1; dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore --disable-build-servers -nodeReuse:false y ejecutor --runtime-menu/--progress bajo entorno CLI/NuGet/TEMP privado; Godot C# con GodotProjectDir a integration/sqlite/.work/.godot/mono/temp. Biblioteca y ejecutores0errores/0advertencias; Godot C#0errores,63advertencias históricas ParallaxBackground,0nuevas en componentes afectados. .NET8.0.30/SQLite3.53.3 y paquetes sin cambios. Las39 pruebas backend son históricas de C.2A, no reejecutadas: Node.js no se inició en esta subfase.

### Integridad y pendientes

Se comparan antes/después **1,512 archivos existentes protegidos** fuera de los16 archivos autorizados de esta corrección, por hash/tamaño/fecha. Se protegen las TRES bases: dos AppData anteriores y la runtime manual, cada una con manifiesto y lease, nueve archivos totales. Solo hashes/metadatos; no se abrió SQLite ni se inspeccionó perfil/progreso manual. .env278bytes/SHA2564DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, fecha/atributos/propietario/ACL conservados. B00 sigue BLOQUEADA por riesgo ACL heredado Modify, sin cambiar permisos. Esquema, recursos gráficos, configuración global, mecánicas, decisiones, audio, biomas, tarjetas, jugadores, NPC y tres finales permanecen intactos. WASAPI/GetBufferSize/output_device invalidated se considera incidencia de audio separada; no se alteró código de audio ni se reprodujo mediante motor.

Prueba manual pendiente: compilar esta copia en Godot C# bajo control del usuario, abrir a1280×720 y revisar título/fondo/panel completo, nombre, mensajes y controles, también con nombre largo. Con la partida manual existente, Nueva partida debe estar deshabilitada; Continuar debe abrir la misma selección aún sin entrada a biomas. Volver/cerrar/reabrir debe mantener nombre y bloqueo, sin nueva partida ni pérdida de datos. No forzar un cierre ni limpiar la base para probar el estado terminal: esa condición solo está cubierta con fixture sintética hasta autorizar su implementación. No ejecutar automáticamente editor/videojuego.

Código completado, visual **PENDIENTE DE VALIDACIÓN RUNTIME**. Siguiente bloque recomendado: autorización específica de tarjetas/selección de los cinco biomas, manteniendo orden libre y controles de partida; no conectarlo ahora. Cierre global legítimo sigue pendiente de su evento real. Detenerse aquí, sin B05.


### Inventario exacto de cambios de C.2A.1

Nueve archivos de escena/código/pruebas:
- assets/sprites/ui/menu_principal.tscn — anclajes y márgenes/separaciones.
- scripts/MenuPrincipal.cs — eliminar reemplazo de partida y usar bloqueo/mensaje.
- integration/sqlite/LocalProfileView.cs — tamaños de texto/distribución, nombre visible y botón según política.
- integration/sqlite/LocalGameState.cs — consulta persistida y CanStartNewGame, tratamiento de conflictos.
- integration/sqlite/GamePersistenceAdapter.cs — HasUnfinishedGamesAsync, sin lógica paralela.
- local-persistence/src/GameSaveService.cs.txt — guard transaccional y consulta del historial completo.
- local-persistence/tests/Checks.cs.txt — rechazo de sustitución en regresión SQLite.
- local-persistence/game-save-tests/GameSaveChecks.cs.txt — fixtures históricas de progreso y despacho de probe; impedir runner duradero obsoleto.
- local-persistence/game-save-tests/RuntimeMenuChecks.cs.txt — nuevas aserciones, concurrencia y probe readonly en proceso hijo.

Siete documentos actualizados: backend/docs/GODOT_RUNTIME_INTEGRATION_PLAN.md, GODOT_RUNTIME_TEST_PLAN.md, REAL_GAME_SAVE_CONTRACT.md, DECISIONS.md, PHASES.md, PHASE_HISTORY.md y local-persistence/README.md. Sin archivos nuevos. GODOT_SCENE_EVENT_MAPPING.md y SAVE_INTEGRATION_CHANGE_PLAN.md se consultaron pero no se modificaron en esta fase. Las clases LocalGameState/LocalProfileView se tratan como adaptadores locales ya usados por el menú, expresamente necesarios para reflejar la política y distribuir los controles que generan; no se amplía a contexto/selección.

Evidencia inicial capturada antes de editar (ruta/bytes/ticks UTC/SHA-256):

```json
[{"Path":"assets/sprites/ui/menu_principal.tscn","Size":4663,"Time":"639276340890730420","Hash":"8CAA6671ADF5351ACFFBB13E44721E8C7A28B9E69AD8AE5E3F5AAB0902AE0562"},{"Path":"scripts/MenuPrincipal.cs","Size":5253,"Time":"639286022374829168","Hash":"4BC1FD2CCAE8399BA6DED57A801739A5694CB4116D8B31A739E58E8DD4F4B028"},{"Path":"integration/sqlite/LocalProfileView.cs","Size":2258,"Time":"639285750387745195","Hash":"36D8B00C3997908152FB376F5551C5CAC8BEEF9F14ECBD36021C8A8EB91A5AEF"},{"Path":"integration/sqlite/LocalGameState.cs","Size":8251,"Time":"639285750189324098","Hash":"885877F6D817DB5A34E735C75D2266896EF81AC3BB616CCA9270E2D806EED0D7"},{"Path":"integration/sqlite/GamePersistenceAdapter.cs","Size":8560,"Time":"639285750170844960","Hash":"CA830818BCABDEE4A3AFF0AB1FA7F2181F995892DA9DB17C0B9A7E99DAE91AA3"},{"Path":"local-persistence/src/GameSaveService.cs.txt","Size":21757,"Time":"639285172744542903","Hash":"E6A4D6E903E5AA0692328660B223FE33438B98B8B2AD948BE6AA06DC753E673F"},{"Path":"local-persistence/tests/Checks.cs.txt","Size":26721,"Time":"639285068895985526","Hash":"E0A78E5083F17E1206B1B6A9E3DDDC1B67A9AF1E013970C85685AF5D2BA36FDB"},{"Path":"local-persistence/game-save-tests/GameSaveChecks.cs.txt","Size":38325,"Time":"639285750738194914","Hash":"813EB5FC2468E03179391908BB8460E5060757F9BEC3F9D58EE5E558995E0A0A"},{"Path":"local-persistence/game-save-tests/RuntimeMenuChecks.cs.txt","Size":10100,"Time":"639285752599448624","Hash":"5C8E02C33836EDA32CAC15279A526E7A7D89C3D6C028D43D26ED8EA8DF2ED327"},{"Path":"backend/docs/GODOT_RUNTIME_INTEGRATION_PLAN.md","Size":32868,"Time":"639285757059481677","Hash":"9A8B4D0E899463B3F3313345058F9A1000DD425874B35FEC2509A7DFE4C97F7D"},{"Path":"backend/docs/GODOT_RUNTIME_TEST_PLAN.md","Size":17869,"Time":"639285757067936074","Hash":"85C70D619CB4CAECC40B755D2B16D05818D8577B5DC9ABCA403855DAB943F01B"},{"Path":"backend/docs/REAL_GAME_SAVE_CONTRACT.md","Size":50724,"Time":"639285174679158449","Hash":"F91B8D9AA025A0E642E7A1472736D327436D32382CD3FD42F3B234D0CCB26ACC"},{"Path":"backend/docs/DECISIONS.md","Size":65819,"Time":"639285757079967439","Hash":"B84A548D847994872EBC3F0C49D1272BFA8A61FB7CF6907BBA92C08125386E21"},{"Path":"backend/docs/PHASES.md","Size":53510,"Time":"639285757072098275","Hash":"DC410B50A9BC4BA003E979D744033BA0989B95B3F3B31F80FAF563B55887D91A"},{"Path":"backend/docs/PHASE_HISTORY.md","Size":129470,"Time":"639285757075996106","Hash":"52A7770568A1E55FBF426A5F8B636E25E6A934D3CDA6EA4DCFB0D20E82238951"},{"Path":"local-persistence/README.md","Size":60824,"Time":"639285757084212457","Hash":"F3B0F6E2341FF689ABA351FD2D3B775BD2AD7C6FD326697E169FFEF0D37F22BC"}]
```

Incidencia intermedia de compilación: un nombre local de prueba duplicado produjo CS0136; se corrigió antes de los35+42+43 aprobados. Los intentos fallidos no se cuentan como aprobación. La validación visual se limita a revisión estática de contenedores y recursos, sin motor ni captura runtime nueva.


## B04.2B.2B.2C.2B — Selección local de los cinco biomas (2026-10-26)

**COMPLETADA EN CÓDIGO. Validación visual y del motor: PENDIENTE.** Reanudación expresamente autorizada tras comprobar que .env vuelve a coincidir con la referencia histórica, sin reemplazo realizado por Codex en esa última comprobación. La causa de las diferencias anteriores no se atribuye a ningún proceso. La referencia original no cambió. B00 mantiene su riesgo ACL independiente.

El usuario confirmó manualmente la fase anterior: menú completo a1280×720, Nueva partida bloqueada cuando hay activa, Continuar abre selección, bloqueo persistente al reiniciar y sin nuevos errores SQLite. Esa evidencia no se presenta como prueba de las tarjetas recién conectadas. No se ejecutó Godot/editor/exportación en esta fase.

### Causa y archivos exactos

La selección anterior había dejado deliberadamente las tarjetas sin controlador local. MenuNiveles detenía su procesamiento y mostraba aviso de integración pendiente; TarjetaNivel todavía consultaba BiomeCardController remoto, sin sesión/progreso remoto inicializados en modo local. Se elimina esa autoridad de la ruta de selección, no se elimina el código HTTP del proyecto.

Modificados exclusivamente:
1. scripts/MenuNiveles.cs — admisión local, refresh de disponibilidad, entrada asíncrona, mensajes, retorno y transición validada.
2. scripts/TarjetaNivel.cs — eventos existentes Pressed, identificación canónica, destino exportado validado, estados/texturas existentes y llamada local.
3. integration/sqlite/LocalGameState.cs — puerto ILocalBiomeStore y coordinador puro LocalBiomeSelection/DTOs en el archivo autorizado; acceso a selección desde fronteras v1 reconocidas.
4. integration/sqlite/GamePersistenceAdapter.cs — implementa ILocalBiomeStore mediante sus métodos ya existentes de lectura y EnterBiome.
5. local-persistence/game-save-tests/GameSaveChecks.cs.txt — despacho --biome-selection y probe readonly de fixture.
6. local-persistence/game-save-tests/RuntimeMenuChecks.cs.txt — puerto de fixture para selección y expectativa actualizada: volver a selección desde frontera humana confirmada no equivale a restauración de recursos.
7. local-persistence/game-save-tests/BiomeSelectionChecks.cs.txt (nuevo) —30 comprobaciones sobre SQLite sintética y navegación simulada.

Documentos actualizados exactamente7: backend/docs/GODOT_RUNTIME_INTEGRATION_PLAN.md, GODOT_SCENE_EVENT_MAPPING.md, GODOT_RUNTIME_TEST_PLAN.md, PHASES.md, PHASE_HISTORY.md, DECISIONS.md y local-persistence/README.md. No se modificaron .tscn, project.godot, TwoSides.csproj, proveedores, esquema, GameSaveService ni ningún script ambiental, decisión, FinNivel, final, personaje, NPC, animación o audio. Contratos restantes consultados sin editarlos.

### Correspondencia y señales

La escena existente scenes/levels/menu_niveles.tscn permanece intacta. Se reutilizan sus nodos y recursos:

| Nodo / Nivel | ID canónico | Entrada humana existente |
|---|---|---|
| GridContainer/TarjetaOceano /0 | ocean | res://scenes/levels/DesicionDelfin.tscn |
| GridContainer/TarjetaSelva /1 | jungle | res://scenes/levels/DesicionMono.tscn |
| GridContainer/TarjetaDesierto /2 | desert | res://scenes/levels/DesicionRataCanguro.tscn |
| GridContainer/TarjetaBosque /3 | forest | res://scenes/levels/DesicionZorro.tscn |
| GridContainer/TarjetaTundra /4 | tundra | res://scenes/levels/DesicionNieve.tscn |

TarjetaNivel._Ready conserva Pressed += OnPressed y _ExitTree lo desconecta. No hacen falta señales serializadas nuevas. OnPressed → MenuNiveles.EnterLocalBiomeAsync → LocalBiomeSelection.EnterAsync → GamePersistenceAdapter.GetActiveGameAsync/GetBiomeAccessAsync/EnterBiomeAsync/GetGameProgressAsync → GameSaveService/UnitOfWork/SQLite. BiomeFor y HumanSceneFor son catálogo cerrado verificado contra los5 exports reales de .tscn; ResourcePath exportado debe coincidir antes de permitir el clic. No se acepta una ruta arbitraria desde datos guardados.

### Protocolo local

MenuNiveles exige el ticket local de selección, crea un coordinador por instancia y carga disponibilidad por lectura asíncrona. No consulta SessionManager, autenticación, endpoints o backend. GamePersistenceAdapter conserva la capacidad runtime existente; tests inyectan únicamente capacidad sintética propia. El puerto de selección no expone creación de perfil/partida, decisiones, completion, recursos o HTTP.

Antes de escribir, se comprueban dueño/partida activa esperada, is_current/in_progress, bioma válido, disponibilidad y etapa humanas, snapshot boundary v1 válido y existencia de la escena canónica. EnterBiome se confirma con OperationId estable, owner/GameId/revisión/BiomeId/perspectiva humana. Se valida recibo (operación, tipo, dueño, partida y revisión), se relee el agregado vigente y se verifica frontera/etapa antes de navegar. No hay nueva partida ni perfil, no se completan biomas y no se registran decisiones al entrar.

La frontera human_decision ya confirmada para ese bioma se reconoce por lectura y no vuelve a llamar EnterBiome. Si se elige un bioma humano distinto, el EnterBiome existente guarda el nuevo destino lógico y revisión según su contrato, sin cambiar decisiones o estado terminal de otros biomas. No se sobrescribe un snapshot de formato desconocido ni se reescribe la frontera al repetir la entrada al mismo bioma. No se persiste avance de párrafos del diálogo ni recursos.

La transición utiliza Transicion.CambiarEscenaValidadaAsync existente (o ChangeSceneToFile si no hay gestor), con callbacks en hilo principal. No hay I/O SQLite dentro del fundido. Se verifica que el menú siga vivo, ticket vigente y plan vigente antes del cambio; el ticket se consume solo después de aceptar la escena. Abandonar el menú invalida el coordinador y sus resultados tardíos. El adaptador serializa trabajo en worker sin pasar Node/SceneTree.

Un bloqueo Interlocked cubre lectura, escritura y toda la navegación; doble clic y otra tarjeta concurrente no generan otra entrada o transición. Errores de escritura devuelven código controlado y no navegan; incertidumbre de resultado conserva comando/UUID para retry. Si hubo commit pero falló navegar, el punto confirmado permanece; al reintentar la misma entrada se navega desde él sin otra revisión/escritura. Conflicto de revisión exige recargar; no se aplica una revisión vieja a otra partida. No hay rollback silencioso de un commit, ni alternativa HTTP.

### Estados y límites de continuación

Disponibles: tarjetas humanas canónicas interactivas, cinco desde inicio y sin orden. En progreso humano: frontera human_decision reconstruible, interactiva para reabrir desde el inicio de esa decisión, sin reenviar elecciones. La actividad se deriva del progreso/etapa/punto de continuación del servicio existente; no se agregó una columna ni un indicador global de progreso.

Completado: Activity=completed, tarjeta deshabilitada, tooltip discreto «Bioma completado», resultado y texturas existentes conservados. La validación del servicio sigue rechazando ambas perspectivas. Los otros incompletos no se bloquean por completar uno. Se mantienen las imágenes ya asignadas, sin recursos externos ni rediseño de la escena.

Animal_pending/decision_info/animal_start: se muestra el estado conocido, pero la entrada a esa perspectiva se rechaza con RESUME_UNSUPPORTED hasta disponer de captura/hidratación real de recursos. No se usa la escena inicial animal como falsa restauración ni se vuelve a la decisión humana confirmada. La selección puede abrirse desde una frontera v1 reconocida para elegir otro bioma humano; eso NO restaura automáticamente al actor ni modifica la decisión anterior.

Límite importante del alcance: estas entradas son las escenas humanas actuales. Su código de confirmar decisiones aún conserva el flujo legado y puede mostrar mensajes de autenticación/contexto faltante al intentar elegir. No se lo conectó ni se habilitó un servidor como alternativa; poder abrir las cinco entradas no significa que el recorrido animal/completion/final offline completo ya funcione. Tampoco se añadieron botones a escenas humanas. Para probar las cinco entradas por ahora, se puede detener/reabrir el juego entre ellas y volver por Continuar a selección.

### Pruebas y compilación

**30 selección +35 menú/partida única +42 progreso/decisiones +43 SQLite =150 comprobaciones C# aprobadas,0fallidas**, sin sumar repeticiones. Son resultados nuevos de esta fase, diferentes de los150 históricos que incluían backend. No se inició Node.js ni se ejecutaron las39 pruebas backend ahora.

Las30 nuevas cubren los5 biomas como primera elección, correspondencia real .tscn/ID/escena, orden inverso, ID desconocido, partida inexistente/archivada/finalizada, completed en ambas perspectivas, otros disponibles, frontera humana sin escrituras repetidas, continuación animal bloqueada sin replay, doble clic, concurrencia, rollback, respuesta perdida, escena inexistente, fallo/excepción de navegación tras commit, error de lectura, revisión obsoleta, invalidación antes/durante lectura, snapshot desconocido intacto, lectura/reentrada humana readonly en proceso nuevo, independencia histórica y ausencia de referencias HTTP/Mongo/Godot en coordinador/ejecutor puro.

Fixtures nuevas bajo local-persistence/.work/databases/<UUID> y limpieza solo de sus archivos propios. Los estados terminales usados por pruebas se preparan exclusivamente en esas fixtures: no equivalen a ejecutar un final del videojuego ni a una API nueva de cierre. Navegación simulada permite inspeccionar que el commit preceda al callback; no prueba señales, fundido ni presentación en el motor. Cero bases temporales sintéticas restantes. No se abrió SQLite sobre las3 bases protegidas.

Biblioteca y ejecutores:0errores/0advertencias; tests en .NET8.0.30 y SQLite3.53.3. Godot C#:0errores,63advertencias históricas ParallaxBackground y0nuevas atribuibles a los4 archivos. MSBuild:86fuentes,1ProjectReference a biblioteca,0fuentes filtradas desde local-persistence o integration/sqlite/.work. Godot.NET.Sdk4.6.1/net8.0/referencia/paquetes sin cambios. Cachés/CLI/TEMP/NuGet privados; --no-restore, sin instalaciones ni ejecución del motor.

Comandos ejecutados, con el entorno privado del preámbulo de integration/sqlite/run-infrastructure.ps1 (sin invocar sus modos duraderos):
- dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore --disable-build-servers -nodeReuse:false -v:q
- local-persistence/.work/bin/GameSave.Checks/Debug/net8.0/win-x64/GameSave.Checks.exe --biome-selection
- mismo ejecutor --runtime-menu y --progress
- local-persistence/run-checks.ps1
- dotnet build TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -p:GodotProjectDir=<raíz absoluta integration/sqlite/.work/> -v:q

### Integridad y aislamiento

Inventario previo y posterior: **1,514 archivos existentes protegidos** fuera de los14 archivos autorizados y .env, con digest/hash/tamaño/fecha comparados. Incluye todas las escenas, finales, lógica ambiental, controles no autorizados, esquema/proveedores, paquetes y configuración. Se comparan además hash/tamaño/fecha de las3 bases existentes y sus manifiestos/leases:9archivos, todos intactos. Las cuatro partidas ficticias y el progreso manual se preservan por igualdad binaria, sin consultas SQL ni migraciones.

.env se verifica SOLO por tamaño y SHA-256 antes/después, separado de compilaciones/pruebas:278bytes y4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928. No se cargan valores, no se consulta ni modifica ACL/propietario/fecha y no se usa como configuración. La coincidencia resuelve el bloqueo de contenido para esta reanudación, no el riesgo ACL pendiente de B00. No se accedió al original, al archivo recuperado del escritorio o a Atlas.

### Validación manual pendiente y siguiente fase

1. Compilar esta copia en Godot C# bajo control del usuario; la compilación automatizada privada no actualiza por sí sola la caché habitual del editor. No iniciar Node.js.
2. Menú → Continuar → selección: comprobar5 tarjetas iniciales habilitadas sin secuencia, mismas imágenes, mensajes y volver al menú.
3. Pulsar cada tarjeta y comprobar la escena humana de la tabla. Si no hay retorno desde esa escena, detener/reabrir el juego y usar Continuar para probar otra; debe mantenerse la misma partida y perfil.
4. Reabrir el mismo bioma humano: retoma la frontera inicial del diálogo confirmada, sin prometer párrafo/posición/recursos exactos. No debe crear otra partida ni mostrar una falsa finalización.
5. Probar doble clic y observar una sola transición. Si ocurre fallo de navegación, reintentar el mismo bioma sin borrar datos. Estado completed/animal pendiente se valida con fixtures automáticas: no editar la base manual para fabricarlo.
6. No interpretar como fallo de selección el flujo de decisión todavía no conectado; no probar completion o finales como parte de esta aceptación. Registrar separadamente mensajes de audio si aparecen.

Registrar resultados/capturas sin secretos. Motor/visual/perfiles y navegación real de las5 tarjetas permanecen **PENDIENTES DE VALIDACIÓN RUNTIME**. Siguiente autorización recomendada: conectar confirmación local de decisiones y su transición informativa, con contrato explícito de ambiente/frontera; recursos, FinNivel y finales requieren sus bloques posteriores. No iniciarlos ahora. Detenerse al finalizar, sin B05.

Evidencia previa a modificaciones (bytes, ticks UTC y SHA-256; NEW identifica el único archivo nuevo):

```json
[{"Path":"scripts/MenuNiveles.cs","Size":3214,"Time":"639286022374186552","Hash":"CC8E80E878E5D603FC8C018E6D327E1B802DD33A194CF9C5D9B0D9B2D2C9331C"},{"Path":"scripts/TarjetaNivel.cs","Size":2717,"Time":"639277211943601793","Hash":"8CDA79DA36F2BD18BB3EA7795ED1B0E5B834076CB36EFD193CDD6F40BC1D692B"},{"Path":"integration/sqlite/LocalGameState.cs","Size":9181,"Time":"639286035869258070","Hash":"20F4AEA9A68105A538445B365AE58067731B2347AF7F2B1E3DED24EA1EF1736A"},{"Path":"integration/sqlite/GamePersistenceAdapter.cs","Size":8751,"Time":"639286031469546353","Hash":"CD037415C32DE33F05DFE27FA46B724844D6A813A96E71D1A320EC1BA04CD81B"},{"Path":"local-persistence/game-save-tests/GameSaveChecks.cs.txt","Size":38893,"Time":"639286034960026219","Hash":"E4CE3222D4E74D021CFB897EB5D00BBAB459EA50A93BEC8E51064294949B4E4D"},{"Path":"local-persistence/game-save-tests/RuntimeMenuChecks.cs.txt","Size":16485,"Time":"639286034959996212","Hash":"1530D740FE209CD422F532B6D871B261D8FA618D0C377B2DA227D1DE7511153D"},{"Path":"local-persistence/game-save-tests/BiomeSelectionChecks.cs.txt","State":"NEW"},{"Path":"backend/docs/GODOT_RUNTIME_INTEGRATION_PLAN.md","Size":44485,"Time":"639286037695166527","Hash":"1037CCA855999E4C2AB6A0FA27DE5EEE3FF45C0F9522F0C58AFC4F9F2560D0FC"},{"Path":"backend/docs/GODOT_SCENE_EVENT_MAPPING.md","Size":17162,"Time":"639285757063693173","Hash":"DCC7A90668F0C509D6FF5A32033F51BB6C919D5180D49C3A4D570F152DA4FD04"},{"Path":"backend/docs/GODOT_RUNTIME_TEST_PLAN.md","Size":27855,"Time":"639286037699569822","Hash":"FBEF41998F1DE0FB26AF8C48A9351F5E06C05CF10FB48CC25F862F1DD3B1EA84"},{"Path":"backend/docs/PHASES.md","Size":63496,"Time":"639286037713718868","Hash":"417E4CDF6AAA176074AE5780E94BDCEAA753D6F8CF339FD581F9E07B3A14F8CD"},{"Path":"backend/docs/PHASE_HISTORY.md","Size":144116,"Time":"639286037718259499","Hash":"B10FBF2CB7D9D606D67395110F747ABAD15204F7B05D9C13A8299A490D65B327"},{"Path":"backend/docs/DECISIONS.md","Size":75805,"Time":"639286037708856442","Hash":"B9090F69916AE9C2DF2F88C7F9BE25E39E6B729366C5E080C14B246CC1BA47FC"},{"Path":"local-persistence/README.md","Size":70810,"Time":"639286037722788922","Hash":"79A47B8059E05B70014BF4223B695A59064054B1806D7E523A425C479F0B733C"}]
```


## B04.2B.2B.2C.2C — Decisiones locales: implementación parcial (2026-10-26)

**Guardado y confirmación de las cinco decisiones IMPLEMENTADOS EN CÓDIGO. Resultado general PARCIAL por continuidad jugable animal bloqueada fuera del alcance. Validación RUNTIME PENDIENTE.** No declarar la fase completa mientras siga el guard remoto de entrada animal. Se conserva la validación manual del usuario de C.2B: cinco tarjetas/destinos humanos correctos, doble clic sin duplicación y sin nuevos errores observados. Esa prueba no valida estos cambios.

### Inventario y opciones existentes

Antes de editar código se registró el inventario en GODOT_RUNTIME_INTEGRATION_PLAN.md. Cambios de código exactamente3:
- scripts/DecisionSceneFlow.cs — punto compartido de confirmación de los cinco diálogos; reemplazo de HTTP por sesión local y proyección del ambiente confirmado.
- integration/sqlite/LocalGameState.cs — puerto ILocalDecisionStore, DTO LocalDecisionConfirmation y coordinador puro LocalDecisionSession en el archivo autorizado; fábrica ligada al perfil/partida de la aplicación.
- integration/sqlite/GamePersistenceAdapter.cs — implementa ese puerto mediante GetActiveGameAsync y RecordDecisionAsync ya existentes.

Pruebas: local-persistence/game-save-tests/GameSaveChecks.cs.txt (despacho --decisions y --decision-probe) y nuevo DecisionIntegrationChecks.cs.txt. Documentos exactamente7: backend/docs/GODOT_RUNTIME_INTEGRATION_PLAN.md, GODOT_SCENE_EVENT_MAPPING.md, GODOT_RUNTIME_TEST_PLAN.md, PHASES.md, PHASE_HISTORY.md, DECISIONS.md y local-persistence/README.md. No se editaron contratos restantes, .tscn, scripts particulares de diálogos, DecisionNivel, VariablesGlobales, InfoDecision, biomas, actores, NPC, recursos, FinNivel, AnimalSegmentFlow, Final, proveedores, esquema, servicio de dominio, project.godot o TwoSides.csproj.

| Bioma / decisión estable | Escena y script responsables | No / Sí, evento y resultado existentes | Información y destino animal |
|---|---|---|---|
| ocean / ocean_waste_disposal | DesicionDelfin.tscn; OceanDecisionNivel→EnvironmentalDecisionNivel→DecisionNivel | BotonBuena/OnBotonBuenaPressed(true), rechaza vertido→healthy; BotonMala/OnBotonMalaPressed(false), aprueba→degraded | info_delfin_buena/mala.tscn → bioma_mar.tscn |
| jungle / jungle_transport_route | DesicionMono.tscn; EnvironmentalDecisionNivel(BiomeId=jungle) | Mismos eventos true/false; rechazar/aprobar vía por selva→healthy/degraded | info_mono_buena/mala.tscn → bioma_selva.tscn |
| desert / desert_cat_abandonment | DesicionRataCanguro.tscn; EnvironmentalDecisionNivel(BiomeId=desert) | Mismos eventos; rechazar/aprobar abandono de gatos→healthy/degraded | info_rata_buena/mala.tscn → bioma_desierto.tscn |
| forest / forest_industrial_pesticides | DesicionZorro.tscn; EnvironmentalDecisionNivel(BiomeId=forest) | Mismos eventos; rechazar/aprobar pesticidas→healthy/degraded | info_zorro_buena/mala.tscn → bioma_bosque.tscn |
| tundra / tundra_fossil_extraction | DesicionNieve.tscn; scenes/levels/DesicionNieve.cs | Callbacks propios delegan ChooseAsync(true/false); prohíbe/aprueba plataforma fósil→healthy/degraded | info_buena/mala.tscn → bioma_nieve.tscn |

Las rutas de escenas de la tabla están bajo scenes/levels/. Cada pareja informativa mantiene sus UID/rutas serializadas y EscenaSiguiente; no se reescribieron. EnvironmentalDecisionService.OptionFor existente ya convierte true/No a reject y false/Sí a approve. Se reutiliza únicamente esa función estática, sin instanciar servicio remoto, HTTP o sesión. DecisionCatalog.ForBiome proporciona las keys existentes; el catálogo local existente las valida otra vez al guardar.

Evidencia de resultado absoluto: DecisionNivel.Decidir(bool saludable,...) ya contiene BiomaSaludable=saludable; los callbacks enviaban true a información buena y false a mala. Tundra documenta explícitamente plataforma prohibida/saludable y aprobada/degradada. Se conserva ese resultado del diálogo, no se deriva una fórmula de finales ni se aplica un umbral nuevo. LocalDecisionSession recibe el resultado resuelto del llamador y solo lo serializa/valida; no contiene un evaluador ambiental. Classification permanece null, ConsequencesVersion1: no se añade favorable/perjudicial ni una puntuación por el nombre del botón.

### Confirmación, persistencia y memoria

DecisionSceneFlow captura una única elección cuando el diálogo permite decidir. Valida que el dueño sea la escena humana actual y que corresponda al bioma; exige almacenamiento local inicializado y utiliza el perfil/GameId actuales, sin crear otros. El coordinador consulta el agregado activo por SQLite, comprueba owner/GameId/is_current/in_progress, bioma no completado y frontera human_decision o decision_info del bioma correcto. Verifica que exista la escena informativa seleccionada antes de guardar.

Comando RecordDecision: OperationId y DecisionId UUIDv4 reservados una vez por intención; LocalPlayerId, GameId, ExpectedRevision, BiomeId, DecisionKey, OptionId, ResolvedEnvironment y ConsequencesJson={stateKind:resultado}. No se llama CompleteBiome. El servicio/UoW existente guarda atómicamente decisión/orden/consecuencias, EnvironmentalState.LastDecisionId/StateKind, HumanCompletedAt, etapa animal_pending, revisión/snapshot decision_info y recibo. Result de bioma y Ending no se fijan al decidir.

Tras un commit satisfactorio se verifica el recibo (tipo decision/IDs/revisión), se relee el agregado activo y se cotejan decisión, estado ambiental, referencia LastDecisionId y etapa. Solo entonces el punto autorizado de DecisionSceneFlow asigna VariablesGlobales.BiomaSaludable al valor confirmado. No se dispara daño, pickups, consumo, spawns, contadores ni lógica de recursos; los scripts ambientales existentes consumen ese bool al cargar. No se modifica una variable ambiental antes del commit.

SQLite y memoria Godot NO forman una transacción atómica. Estrategia explícita: intención inmutable→commit SQL→relectura/verificación→proyección absoluta del bool→navegación informativa. Un fallo previo al commit no proyecta ambiente ni navega. Una escritura confirmada permanece aunque falle la presentación. La proyección absoluta es idempotente; el coordinador recuerda el OperationId ya proyectado y no vuelve a aplicarlo al reintentar navegación en esa instancia. Una sesión nueva restaura el valor absoluto desde lectura, sin volver a ejecutar RecordDecision ni efectos incrementales. No se anuncia restauración de mundo/actor por asignar ese bool.

Se mantienen callbacks, textos/tweens y destinos informativos existentes. La transición usa Transicion.CambiarEscenaValidadaAsync y confirma escena viva/plan vigente; con gestor ocupado espera el intervalo ya usado, sin I/O en callback del fundido. Sin gestor usa ChangeSceneToFile y verifica resultado. Espacio reintenta la misma opción si el guardado/transición falló; el diálogo sigue bloqueando una segunda elección incompatible. No hay fallback HTTP.

### Idempotencia y recuperación

La instancia lógica sigue siendo (GameId,BiomeId,DecisionKey). Si ya existe la misma opción y consecuencia, se devuelve su registro e IDs originales sin RecordDecision nuevo. Otra opción o resultado incompatible se rechaza como DECISION_CONFLICT. Si dos sesiones compiten con la misma opción, la perdedora de revisión/instancia relee el ganador y adopta ese resultado, sin sobrescribir; opciones distintas tienen un solo ganador.

Ante rollback se retiene exactamente el comando, UUIDs, payload y ExpectedRevision para retry. Ante respuesta perdida pero registro durable presente se reconoce ese registro antes de proyectar; no se genera otro UUID ni se reenvía la consecuencia. Un recibo conocido se conserva durante reintentos en memoria. En recuperación desde un proceso nuevo el resultado devuelve registro/OperationId/estado y Receipt=null: no se inventa un recibo ni se deduce su revisión original de la revisión actual. La fila local_operations del commit permanece; no se implementa otra consulta SQL en el adaptador.

Doble clic en el diálogo queda serializado por el flow y el coordinador Interlocked; una transición exitosa no se repite para la misma operación. Un error después del commit conserva el recibo/registro; reintentar la navegación no aumenta revisión, decision_order ni número de decisiones y no vuelve a proyectar en la misma sesión. Bioma completed o partida archivada/finalizada no aceptan nuevas elecciones/proyecciones. Reiniciar antes de un commit pierde una intención solo en memoria; una nueva intención explícita se evalúa contra el agregado durable, sin inventar un journal nuevo.

### Bloqueo animal fuera del alcance y autorización pendiente

Las parejas InfoDecision conservan su paso al animal. Sin embargo, **FinNivel._Ready** detecta falta de Services/sesión remota y llama AnimalSegmentFlow.Open(completion:true,start:false). Con Services nulo, Open pausa SceneTree y retorna. En las cinco escenas animales ese guard está presente. No se ejecutó el motor para atribuirle una observación runtime nueva: el bloqueo se deduce del código.

Por esa dependencia protegida no se puede declarar «segmento animal jugable offline» ni continuidad completa en esta fase. No se introducen sesiones falsas, no se construye el backend antiguo y no se evita el guard por una variable global. Se preservan las mecánicas en los archivos excluidos.

Autorización necesaria posterior: revisar de forma específica scripts/FinNivel.cs únicamente en su guard de entrada y scripts/AnimalSegmentFlow.cs en los requisitos de contexto/bloqueo local. Esto debe separarse de conectar CompleteBiome y de modificar física/objetivos; no se hizo aquí. Hasta entonces la implementación general queda PARCIAL aunque las cinco decisiones se guardan localmente y el paso informativo está conectado. Tampoco se altera la política de selección que bloquea reentrada animal sin un checkpoint de recursos soportado.

### Finales y restauración futura

Persisten por partida los IDs/opciones/orden/consecuencias, estado ambiental y vínculo de la decisión, versiones existentes de reglas/contenido y fecha humana. Esos son insumos para la futura restauración de resultados; no se añadieron acumuladores, pesos, umbrales ni clasificación numérica. Los resultados Bueno/Medio/Malo confirmados por el usuario permanecen sin modificar. El cálculo exacto sigue sin localizar con certeza en la copia permitida; no se buscó original/Atlas.

Los recursos/vida/agua/comida, posiciones, timers, fuentes agotadas y checkpoints animales no se capturan ni restauran. Recuperar una decisión en una prueba readonly demuestra persistencia y ausencia de replay, no continuación exacta del animal en Godot. La equivalencia definitiva de finales tras cerrar/continuar exige restauración ambiental completa y evaluador existente identificado; queda pendiente. No se cierra globalmente la partida ni se habilita una segunda por decidir.

### Pruebas y compilación efectivas

**30 nuevas decisiones +30 selección +35 menú/partida única +42 progreso/decisiones +43 SQLite =180 comprobaciones C# aprobadas,0 fallidas**, sin contar repeticiones ni las39 pruebas backend históricas. No se inició Node.js/Atlas.

Las30 nuevas incluyen ambas opciones de cada bioma (10), opción/key inválidas, mismo resultado sin escritura/proyección/transición duplicadas, conflicto por otra opción, recuperación en sesión nueva y proceso hijo readonly, doble clic, rollback/retry con mismos UUIDs, intento de cambiar elección pendiente, respuesta perdida, escena faltante, navegación fallida, completed, archivo, otro GameId, lectura fallida, sesión invalidada, concurrencia igual/distinta y ausencia de dependencias HTTP/Mongo/Godot en el coordinador/ejecutor puro. Se usa GameSaveService/UoW/repositorio/SQLite real sobre fixtures propias y callbacks simulados de memoria/navegación. No se presenta la simulación como ejecución de señales o VariablesGlobales reales en el motor; ese orden se inspeccionó en el script y se valida manualmente después.

Las regresiones se ejecutaron sobre fixtures nuevas de local-persistence/.work/databases/<UUID>, sin tocar bases existentes. Comandos: build --no-restore de GameSave.Checks.csproj; ejecutor --decisions, --biome-selection, --runtime-menu, --progress; local-persistence/run-checks.ps1. El probe --decision-probe solo acepta el namespace UUID de fixture ya existente, abre readonly y no invoca RecordDecision.

Biblioteca y ejecutores0errores/0advertencias, .NET8.0.30 y SQLite3.53.3. Godot C#0errores,63advertencias históricas ParallaxBackground y0nuevas en los3 archivos. Entorno CLI/NuGet/TEMP privado, GodotProjectDir a integration/sqlite/.work/.godot/mono/temp; sin restore/actualización de paquetes. Referencia existente única a la biblioteca; no se cambió proyecto/framework. No editor, motor ni exportación ejecutados. Cero bases sintéticas temporales restantes.

### Integridad

Se comparan antes/después **1,517 archivos protegidos** fuera de los12 archivos de esta fase y .env: hashes/tamaños/fechas, incluidos todos los scripts particulares de diálogos, escenas/animales/recursos, FinNivel/AnimalSegmentFlow/Final, configuración, esquema y servicio/repositorio. Tres bases existentes +manifiestos/leases=9archivos protegidos, intactos por comparación binaria/metadatos, sin abrir SQLite ni migrar/limpiar/reinicializar ninguna. Se preservan las cuatro partidas ficticias y progreso manual sin consultar sus contenidos.

.env verificado únicamente por tamaño y SHA-256 antes/después:278bytes,4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928. No valores, credenciales, uso como configuración ni cambios a propietario/ACL/fecha. B00 mantiene el riesgo ACL pendiente. No se accedió a proyecto original ni servicios externos.

### Guía manual acotada y siguiente paso

1. Compilar esta copia en Godot C# bajo control del usuario y abrir sin Node.js. Usar la misma partida, Continuar y una tarjeta humana disponible.
2. Terminar el diálogo y elegir No o Sí. Debe confirmarse el guardado local antes de mostrar la información correspondiente, sin solicitud de login para guardar.
3. Un doble clic debe producir una sola información/decisión. Si falla la transición, Espacio reintenta el mismo resultado; no elegir otra opción ni crear otra partida como reparación.
4. La decisión debe dejar el bioma animal_pending, no completed; la prueba automatizada cubre este estado sin editar la base manual.
5. Al avanzar desde información a animal existe el bloqueo remoto de FinNivel descrito arriba: puede quedar pausado. No forzarlo, no simular sesión ni interpretar esa pausa como guardado fallido. Validación de jugabilidad animal queda bloqueada hasta autorización específica.
6. Después de reiniciar, la decisión se conserva; no prometer reentrada animal/recursos desde selección ni equivalencia de finales aún. No cambiar datos manuales para fabricar completed o restablecer opciones.

La prueba manual de las dos opciones de cada bioma requiere fixtures/runtime autorizado apropiado, no borrar la elección ya confirmada del usuario. El estado vigente es PARCIAL por continuidad animal, RUNTIME PENDIENTE. Recomendar resolver el guard local de entrada con alcance explícito y luego los bloques de restauración/completion; no iniciarlos ni B05. Detenerse aquí.

Evidencia previa a las modificaciones (ruta/bytes/ticks UTC/SHA-256; NEW corresponde al archivo nuevo de pruebas):

```json
[{"Path":"scripts/DecisionSceneFlow.cs","Size":4321,"Time":"639277191443382213","Hash":"CD26B4F0738A817089E0FE84490D078EE9002B3CB9E0D3193F81DB9B30AE2B63"},{"Path":"integration/sqlite/LocalGameState.cs","Size":19154,"Time":"639286641248017798","Hash":"C058D2E210406018BAC45341260B1491CAD820F1A39B3160AD5597E7EBF09729"},{"Path":"integration/sqlite/GamePersistenceAdapter.cs","Size":8769,"Time":"639286640649885494","Hash":"C263D89947B1D31FFB4971BD843811A1DD0576017A45EB8D36EA46E4B8BA9CF2"},{"Path":"local-persistence/game-save-tests/GameSaveChecks.cs.txt","Size":39132,"Time":"639286643291249675","Hash":"24D929AE7ADCE879DFF634C0A4FFE8DE7C0B64C832E19ECCF3C8EA7B28320281"},{"Path":"local-persistence/game-save-tests/DecisionIntegrationChecks.cs.txt","State":"NEW"},{"Path":"backend/docs/GODOT_RUNTIME_INTEGRATION_PLAN.md","Size":58071,"Time":"639286647260394948","Hash":"700D3565EDA2E6A8503BE66967219E3CF78E63BBAFD8D77C38792D76A3C12D70"},{"Path":"backend/docs/GODOT_SCENE_EVENT_MAPPING.md","Size":30748,"Time":"639286647264349027","Hash":"25D7EE68710FA625DAC2A3C0834E0B6904B5CF1A81DFF1F133EAD28A049A8D54"},{"Path":"backend/docs/GODOT_RUNTIME_TEST_PLAN.md","Size":41441,"Time":"639286647268123512","Hash":"0F249EA2B31C731BA385AE20A298747CEA6AEFFA96E0AEADC47B5B5013220561"},{"Path":"backend/docs/PHASES.md","Size":77082,"Time":"639286647272011189","Hash":"C1DA3E16E4BC87B9C89ED79DF007782EB02B7F2319E8DA37867ADCE5A5AAC8D3"},{"Path":"backend/docs/PHASE_HISTORY.md","Size":160024,"Time":"639286647275727258","Hash":"48A0B6183E9DEC9AA065F95385B8BCC1D2373DB0DBC593DC294701FD6033E7B3"},{"Path":"backend/docs/DECISIONS.md","Size":89391,"Time":"639286647279488999","Hash":"4003916EA06856FD8C894E81B00C38F67BF6D4B30B2D19581636B821E2C5E54C"},{"Path":"local-persistence/README.md","Size":84396,"Time":"639286647283234187","Hash":"33DCD5138CD231BABE11B1AF7E235BAFA32FFCEA2B1CEF659431B5DBBFB22C84"}]
```

## B04.2B.2B.2C.2C.1 — Entrada animal local (2026-10-26)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** Este apartado actualiza el estado vigente; los registros anteriores conservan su valor histórico. El usuario autorizó expresamente ampliar la navegación mínima a MenuNiveles.cs, TarjetaNivel.cs y LocalGameState.cs para abrir la entrada animal original de un bioma ya decidido y preparar el ambiente antes de instanciarla.

Diagnóstico: FinNivel._Ready exigía Services/autenticación/progreso remotos aunque el contexto local mantiene Services nulo. La llamada antigua a AnimalSegmentFlow.Open pausaba el árbol y, sin Services, retornaba antes de crear el aviso. El texto «Confirmación pendiente. El juego permanece detenido.» existe en el modal remoto, pero no demuestra por sí solo el origen exacto del «Pendiente» observado por el usuario. animal_pending es un estado SQLite legítimo después de decidir, no evidencia de pérdida. La selección además rechazaba ese estado por restauración animal no soportada; ahora permite únicamente volver a su entrada original. No se consultó la partida manual para diagnosticar datos.

FinNivel._Ready suscribe la señal original y espera ValidateLocalEntryAsync. El lector ILocalAnimalStore solo expone GetLocalProfileAsync/GetActiveGameAsync: valida propietario/perfil, partida actual in_progress, GameId, bioma canónico y pertenencia, animal_pending no completed, decisión confirmada, vínculo LastDecisionId, consecuencias persistidas coherentes y snapshot de frontera soportado. Conserva Decision.OperationId como referencia a la operación original (FK del esquema existente); no fabrica un recibo ni vuelve a ejecutar RecordDecision. Los fallos se presentan localmente y mantienen detenido el ingreso, con reintento de lectura o retorno al menú. No hay fallback HTTP en el modo local.

Las cinco escenas animales originales se seleccionan por mapa canónico. La navegación consulta nuevamente SQLite y prepara el valor absoluto BiomaSaludable antes de cargar/instanciar la escena: reject/No → healthy; approve/Sí → degraded. Solo asigna si difiere, sin consecuencias acumulativas. El guard en _Ready solo compara el ambiente preparado; no lo modifica tarde después de inicializar actores/visuales. Una entrada directa con ambiente incoherente se rechaza y pide volver a la tarjeta. Una decisión confirmada puede recuperarse aunque CurrentBiomeId señale otro bioma; no se modifica snapshot, revisión ni decisión al reentrar.

La tarjeta indica «Abrir entrada animal original. No recupera posición, vida, agua ni comida». Se mantienen escenas, actores, NPC, animaciones, recursos y scripts ambientales originales. Esto no equivale a restauración exacta de una sesión animal. Los métodos FinNivel._ExitTree, OnBodyEntered y FinalizarNivel permanecen idénticos al registro previo. No se llama CompleteBiome, no se marca completed ni se cierra la partida. Si la llegada física o un reinicio llaman al modal antiguo, el modo local devuelve LOCAL_OPERATION_UNSUPPORTED y permite volver al menú; no realiza operaciones remotas. Finalización y reinicios persistentes requieren otra fase.

Archivos de producción modificados: scripts/FinNivel.cs, scripts/AnimalSegmentFlow.cs, integration/sqlite/LocalGameState.cs, integration/sqlite/GamePersistenceAdapter.cs, scripts/MenuNiveles.cs y scripts/TarjetaNivel.cs. Pruebas: GameSaveChecks.cs.txt, RuntimeMenuChecks.cs.txt, BiomeSelectionChecks.cs.txt y el nuevo AnimalEntryChecks.cs.txt bajo local-persistence/game-save-tests. Documentación: únicamente los siete documentos autorizados.

Validación reejecutada: **29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite =209 comprobaciones aprobadas, cero fallidas**. Las nuevas cubren ambos ambientes de los cinco biomas, ausencia de perfil/partida/decisión, IDs incorrectos, completed, fallos de lectura, vínculo/estado/snapshot inválidos, reintentos sin escritura, preparación previa, cuatro decisiones recuperables y reinicio en proceso hijo readonly. Son SQLite sintético y callbacks de navegación; no ejecución del motor ni prueba real de desconexión de red. El puerto puro carece de dependencias HTTP/Mongo/Godot. No se ejecutó Node.js, editor/motor Godot ni Atlas.

Comandos locales: dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore; ejecutor GameSave.Checks.exe con --animal-entry, --decisions, --biome-selection, --runtime-menu y --progress; local-persistence/run-checks.ps1. Fixtures propias UUID en local-persistence/.work/databases, con limpieza controlada por los ejecutores. No ejecutar el modo durable por defecto sobre AppData. Compilación completa TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild con GodotProjectDir dirigido a integration/sqlite/.work/: cero errores, las63 advertencias históricas ParallaxBackground y ninguna en los seis archivos modificados. Biblioteca/ejecutor: cero errores y advertencias. CLI, paquetes y temporales aislados; sin restaurar paquetes ni cambiar proyecto/framework.

Integridad: comparación antes/después de 1,513 archivos protegidos (tamaño, SHA-256 y fecha) y los nueve archivos de las tres bases, manifiestos y leases: sin diferencias. No se abrió ninguna base protegida mediante SQLite. Se conserva el progreso manual de cuatro decisiones sin inspeccionarlo. .env se verifica separadamente solo por tamaño/SHA-256:278bytes y 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928; no se utiliza en compilaciones/pruebas. No se modifican ACL/propietario; el riesgo ACL de B00 sigue pendiente.

Guía manual (pendiente, a cargo del usuario): abrir esta copia en Godot C# sin Node.js; continuar con el mismo perfil y partida; seleccionar una tarjeta ya decidida y comprobar su entrada animal original, personaje y ambiente confirmado sin login ni confirmación de servidor. Probar ambos ambientes solo donde existan decisiones válidas, sin cambiar las cuatro decisiones ni reinicializar bases. Volver a selección y abrir otro bioma decidido: debe usar su propio ambiente. Confirmar que no se promete recuperar posición/recursos. Al llegar físicamente al final o solicitar reinicio, esperar el aviso local de operación pendiente de implementar; no exigir completed ni forzarlo en SQLite.

Siguiente trabajo recomendado, solo con nueva autorización: validar ingreso en Godot y luego diseñar/integrar finalización física local y continuidad de recursos/reinicios. No se conectan finales, no se inicia B05. Trabajo detenido al finalizar esta subfase.

## B04.2B.2B.2C.2C.2 — Retorno al menú local (2026-10-26)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** El usuario informa 7/8 comprobaciones manuales correctas de C.2C.1: continuar, entrada animal, personaje, ambiente, decisión no repetida, ausencia de pausa de entrada y de errores nuevos. El fallo restante es la recuperación remota al volver desde pausa. Estos resultados manuales son reportados por el usuario.

Causa exacta en código: MenuPausa.IrMenuNiveles llamaba ChangeSceneToFile("res://scenes/auth/recuperacion_partida.tscn"). RecoveryScreen._Ready obtenía Services remoto; Render usaba HasSession para mostrar Login, deshabilitaba Continuar y presentaba servicio no disponible con Services nulo. No prueba pérdida de progreso ni fallo de RecordDecision. La escena no solicita HTTP automáticamente en Ready, pero sus acciones de recuperación/login pertenecen al controlador remoto. MenuPrincipal ya recarga SQLite y no requería cambios.

Archivos C# modificados: assets/sprites/ui/MenuPausa.cs, scripts/auth/RecoveryScreen.cs e integration/sqlite/LocalGameState.cs. Los tres figuran en el plan de integración (pausa/salida, recuperación local y proyección local). Se reutilizan las consultas existentes de GamePersistenceAdapter sin modificarlo. Pruebas: nuevo local-persistence/game-save-tests/MenuReturnChecks.cs.txt y selector --menu-return/--menu-return-probe en GameSaveChecks.cs.txt. Solo se actualizan los siete documentos técnicos habituales; sin .tscn ni controladores globales.

Flujo corregido: Volver al menú usa LocalMenuReturn, bloquea doble clic y acciones de pausa concurrentes, refresca SQLite, comprueba el mismo perfil y la misma partida activa, invalida únicamente el permiso de selección en memoria y navega a res://assets/sprites/ui/menu_principal.tscn. No crea, archiva ni completa partidas; no invoca RecordDecision ni CompleteBiome. El menú principal existente vuelve a leer SQLite, muestra Continuar y mantiene Nueva partida bloqueada por la partida sin finalizar. Continuar prepara la selección de cinco biomas; el flujo de C.2C.1 conserva las entradas animales y su preparación ambiental previa.

Pausa: abrir/cerrar mantiene su comportamiento existente; se impiden cambios durante un retorno en curso. Tras confirmar la consulta se quita SceneTree.Paused antes de navegar y se oculta el panel; al salir se desconectan sus señales. Si falla la consulta o la navegación, se conserva/restaura la pausa previa y el panel muestra un error local reintentable. El callback verifica vida del nodo para no volver a pausar otra escena tras una salida concurrente. Sin contexto local no se redirige a login. Una entrada accidental a RecoveryScreen con contexto local oculta login/logout/recuperación remota y vuelve al menú principal local; si falla esa navegación permite reintentar allí, sin tocar SQLite ni usar Services.

**220 comprobaciones C# aprobadas, cero fallidas:** 11 nuevas de retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Cubren retorno y continuación con ambos ambientes, mismos IDs/decisiones/revisión/hash, fallo SQLite y recuperación, navegación fallida/excepción, doble clic, almacén cerrado, retornos repetidos, ausencia de partida y proceso hijo readonly. Las pruebas usan SQLite sintético bajo local-persistence/.work/databases/<UUID> y callbacks de pausa/navegación; no ejecutan señales, escenas ni el motor Godot. No se presenta como una prueba real de desconexión de internet: el flujo local inspeccionado no invoca servicios HTTP. Apertura/cierre visual de pausa y redirección real de RecoveryScreen requieren comprobación manual.

Comandos: dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore; ejecutor --menu-return, --animal-entry, --decisions, --biome-selection, --runtime-menu y --progress; local-persistence/run-checks.ps1. El probe nuevo solo acepta la ruta UUID sintética verificada por ReadOnlyFixture. Compilación completa TwoSides.csproj con --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild y GodotProjectDir dirigido a integration/sqlite/.work/: cero errores, 63 advertencias históricas ParallaxBackground y cero nuevas. Biblioteca y ejecutor: cero errores y advertencias. CLI/paquetes/temporales privados, sin restore ni cambio de proyectos. No se ejecutaron Node.js, Godot ni Atlas.

Integridad antes/después: 1,519 archivos protegidos conservan tamaño, SHA-256 y fecha; incluye FinNivel completo, cinco biomas, actores, escenas, finales, GamePersistenceAdapter y configuración. Las tres bases protegidas y sus manifiestos/leases (9 archivos) permanecen idénticos, sin abrirlas mediante SQLite; se conserva la partida manual sin consultar contenido. .env se comprueba por tamaño/hash separadamente de compilaciones y pruebas: 278 bytes, SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928. No se leen valores ni se modifica contenido, propietario o ACL. El riesgo ACL de B00 sigue pendiente. Cero archivos SQLite sintéticos restantes.

Guía manual: en esta copia, continuar la partida existente y abrir un bioma decidido; abrir pausa, reanudar y comprobar movimiento; abrir pausa otra vez y pulsar Volver al menú (también doble clic). Debe abrir el menú principal local sin login ni Recuperar partida remoto, sin pausa residual, con Continuar disponible y Nueva partida bloqueada. Continuar debe mostrar los cinco biomas; abrir otro ya decidido y verificar su propio ambiente antes de jugar. Repetir después de cerrar/abrir el juego y sin internet, sin cambiar decisiones ni borrar bases. No bloquear ni corromper la base real para probar errores: esos casos están cubiertos con fixtures.

Pendientes: validar este flujo en Godot; restauración exacta de posición/vida/agua/comida, reinicios, CompleteBiome y finales continúan fuera de alcance. El aviso local de finalización/reinicio aún no implementados de C.2C.1 permanece. No se modifica FinNivel ni su finalización física. No se inicia B05. Trabajo detenido al terminar esta subfase.

## B04.2B.2B.2C.2C.3 — Reinicio del segmento animal (2026-10-26)

**COMPLETADA EN CÓDIGO; PERSONAJE, RECURSOS Y OBJETOS PENDIENTES DE VALIDACIÓN RUNTIME.** El usuario confirma las nueve comprobaciones manuales de C.2C.2, incluido retorno local, continuar, ambiente y persistencia tras cerrar Godot. Ese resultado corresponde a la fase anterior, no valida el reinicio nuevo.

Causa exacta del aviso: MenuPausa.ReiniciarNivel llamaba AnimalSegmentFlow.Open(completion:false, reason:"voluntary"); su rama local devolvía LOCAL_OPERATION_UNSUPPORTED, cuyo texto indicaba finalización/reinicio aún no implementados. No era una decisión ausente ni un error de credenciales.

Archivos de producción modificados, previstos en el plan: assets/sprites/ui/MenuPausa.cs (ReiniciarNivel), scripts/AnimalSegmentFlow.cs (RestartLocalAsync/RestartMessage y bloqueo durante reinicio) e integration/sqlite/LocalGameState.cs (coordinador puro LocalAnimalRestart y mensaje genérico de operación aún no disponible). GamePersistenceAdapter no requiere cambios: se reutilizan ILocalAnimalStore y sus consultas existentes. Pruebas: nuevo AnimalRestartChecks.cs.txt y selector --animal-restart/--animal-restart-probe en GameSaveChecks.cs.txt, bajo local-persistence/game-save-tests. Solo se actualizan los siete documentos habituales.

Flujo: el botón reserva la intención para impedir doble clic/acciones concurrentes. El coordinador resuelve el bioma exclusivamente desde la escena animal canónica actual; ReadAnimalEntryAsync valida perfil, misma partida activa, pertenencia del bioma, animal_pending no completed, decisión/consecuencias y frontera soportada. Se verifica/carga el PackedScene original sin instanciarlo y se relee SQLite para rechazar cambios de revisión/decisión/ambiente durante la preparación. No se utiliza una escena humana ni una ruta arbitraria.

Después de esas comprobaciones, el puente prepara BiomaSaludable como estado absoluto confirmado (No/reject/healthy o Sí/approve/degraded), asignándolo solo si difiere; libera SceneTree.Paused y llama ChangeSceneToPacked. Esto crea una instancia nueva del segmento original, no reutiliza el árbol animal vivo ni llama ReloadCurrentScene sin contexto. El guard de entrada existente valida nuevamente SQLite y el ambiente preparado. La salida del menú anterior desconecta señales y libera su pausa. Un fallo de SQLite o destino no modifica el nivel ni su pausa; si falla el cambio de escena se restaura el valor ambiental anterior y la pausa previa, con error local reintentable en el mismo panel. Los callbacks comprueban que el nodo/escena sigan vigentes.

No hay escrituras de progreso durante el reinicio: no RecordDecision, EnterBiome, CompleteBiome, nuevos UUID/recibos, creación/archivo/cierre de partidas ni cambios de disponibilidad, historial u otros biomas. No se crea un checkpoint persistente ni una nueva captura de recursos. Los recibos originales permanecen intactos. La muerte y la llegada física conservan sus rutas actuales, aún no implementadas localmente; esta fase conecta únicamente Reiniciar desde pausa. El mensaje genérico de operación pendiente evita afirmar que el botón nuevo sigue sin implementar.

Inicialización observada en los scripts existentes: los cinco Player*.cs definen MaxHealth=3 y _Ready asigna CurrentHealth=MaxHealth; Estadisticas define AguaMax=100 y ComidaMax=100 y _Ready copia ambos máximos. No se encontraron overrides de esos máximos en las escenas animales/personajes inspeccionadas; el delfín tiene ActivarAgua=false y se conserva así. No se agregan números al código de reinicio: la instancia nueva consume los exports reales. FuenteRecurso conserva _dropeados/_jugadoresDentro por instancia; ItemRecurso tiene _recogido/timers por instancia. Personaje, fuentes, ítems, enemigos y obstáculos vuelven a su configuración original al recrear el árbol; su resultado visual/físico no se afirma validado sin motor. Los métodos ambientales existentes configuran visibilidad/procesamiento/partículas desde el bool absoluto, sin volver a registrar una consecuencia acumulativa.

Entradas originales observadas, coordenadas locales del personaje en las escenas sin editar:

| Bioma | Escena | Personaje | Posición |
|---|---|---|---|
| ocean | bioma_mar.tscn | PlayerDelfin | (25,458) |
| jungle | bioma_selva.tscn | PlayerMono | (79,176) |
| desert | bioma_desierto.tscn | PlayerRataCanguro | (209,478) |
| forest | bioma_bosque.tscn | PlayerZorro | (342,184) |
| tundra | bioma_nieve.tscn | PlayerOso | (571,191) |

**241 comprobaciones C# aprobadas, cero fallidas:** 21 nuevas de reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las21 cubren diez combinaciones bioma/opción, fallo SQLite, destino ausente/humano, completed, partida ausente, decisión ausente, doble clic, retry de navegación, cambio de contexto durante preparación, cuatro ambientes independientes y proceso hijo readonly. Se comprueban hash completo de fixture, revisión, decisiones, ambientes, biomas y referencia a operación/recibos preservados. CompleteBiome aparece únicamente como preparación explícita de una fixture sintética terminal para probar rechazo; no existe en la ruta de reinicio de producción.

Los ejecutores usan bases propias en local-persistence/.work/databases/<UUID>; cero archivos SQLite sintéticos restantes. Las proyecciones de ambiente, pausa y navegación automatizadas son callbacks, no ejecución Godot ni verificación de recursos/colisiones reales. El flujo de producción inspeccionado no usa HTTP, .env ni credenciales; no se simula una sesión remota ni se afirma una prueba real de corte de red.

Comandos: build --no-restore de local-persistence/game-save-tests/GameSave.Checks.csproj; ejecutor --animal-restart, --menu-return, --animal-entry, --decisions, --biome-selection, --runtime-menu y --progress; local-persistence/run-checks.ps1. El probe nuevo solo admite ReadOnlyFixture con ruta UUID sintética verificada. Compilación completa TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild con GodotProjectDir hacia integration/sqlite/.work/: cero errores,63 advertencias históricas ParallaxBackground,ninguna nueva. Biblioteca y ejecutor: cero errores/advertencias. Entorno CLI/paquetes/temporales privado; sin restore ni cambios de proyectos. No se ejecutaron Godot, Node.js ni Atlas.

Integridad antes/después: 1,520 archivos protegidos conservan tamaño/SHA-256/fecha; incluye escenas, cinco biomas, personajes/NPC, recursos, animaciones, FinNivel completo, finales, GamePersistenceAdapter, configuración y rutas de retorno local. Las tres bases protegidas y sus manifiestos/leases (9 archivos) permanecen idénticos, sin abrirlas con SQLite. .env:278bytes,SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928,comprobado separadamente antes/después, sin consultar valores ni usarlo en compilación/pruebas. Propietario/ACL no modificados; riesgo ACL de B00 pendiente. No se accede al proyecto original.

Guía manual: continuar la misma partida, abrir un bioma ya decidido, avanzar desde el inicio, recibir daño y consumir recursos; observar/usar una fuente y algún objeto/enemigo. Pausa → Reiniciar, también doble clic: debe aparecer una única escena animal original, en su entrada, sin diálogo humano, login o recuperación remota, con ambiente confirmado y juego sin pausa residual. Comprobar vida máxima real, agua/comida máximas donde estén activas, fuentes/objetos/enemigos/timers reiniciados y ausencia de señales duplicadas/errores. Repetir en los cinco biomas y con los ambientes disponibles, sin cambiar decisiones ni borrar bases para fabricar opciones. Volver al menú, confirmar misma partida/Nueva partida bloqueada y repetir tras cerrar/abrir Godot y sin internet. Fallos SQLite/destino se prueban solo con fixtures, no dañando la base manual.

Pendientes: validación runtime de posición, recursos y objetos; checkpoints persistentes/continuación exacta, muerte, CompleteBiome y finales en fases independientes autorizadas. No se modifica FinNivel ni su llegada física; no se inicia B05. Trabajo detenido al terminar C.2C.3.

## B04.2B.2B.2C.2C.4 — Game Over y retorno directo a niveles (2026-10-26)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** El usuario informa 9/10 comprobaciones manuales satisfactorias de C.2C.3: reinicio de posición/vida/agua/comida/objetos/enemigos en los cinco biomas, ambiente conservado, sin repetir decisión/login ni pausa residual. La ausencia de errores nuevos de consola no fue confirmada; no se interpreta como un error SQLite demostrado ni como una validación completa de esta fase.

Causas exactas: assets/sprites/ui/GameOver.cs, Reintentar → AnimalSegmentFlow.Open(completion:false,reason:"death") → rama local LOCAL_OPERATION_UNSUPPORTED. VolverMenu del mismo controlador todavía abría recuperacion_partida.tscn. MenuPausa.IrMenuNiveles abría el menú principal local conforme a C.2C.2; la instrucción actual sustituye expresamente ese destino por la selección de niveles. Las cinco escenas incluyen game_over.tscn y MenuPausa.tscn. Los cinco personajes llaman GameOver.MostrarDerrota; ZonaMuerte difiere MostrarGameOver para no cambiar el flujo dentro del evento físico. Esa lógica de muerte no se altera.

Cambios de producción: assets/sprites/ui/GameOver.cs, assets/sprites/ui/MenuPausa.cs, scripts/AnimalSegmentFlow.cs e integration/sqlite/LocalGameState.cs. Están previstos en el plan de integración (GameOver, pausa/salida, flujo animal y contexto de navegación). GamePersistenceAdapter, MenuNiveles y TarjetaNivel se inspeccionan pero no requieren cambios. Pruebas: nuevo local-persistence/game-save-tests/GameOverNavigationChecks.cs.txt y selector --game-over-navigation en GameSaveChecks.cs.txt. Se actualizan únicamente los siete documentos habituales. No se editan escenas, diseño visual, botones, actores, recursos, VariablesGlobales, biomas, FinNivel ni Final.cs.

GameOver.Reintentar ahora espera AnimalSegmentFlow.RestartLocalAsync, el mismo puente y LocalAnimalRestart de Pausa → Reiniciar, sin una segunda implementación del reinicio. Mantiene MostrarDerrota, su fundido, botones originales y sus conexiones C#. Se reserva _saliendo durante la operación; se comprueba validez del nodo tras await antes de volver a tocar controles. El callback de fin de tween también comprueba IsInstanceValid y se conserva Kill/desconexión en _ExitTree. SQLite confirma misma partida/bioma, decisión/consecuencias y ambiente, rechaza completed y resuelve la escena animal original. El ambiente absoluto se prepara antes de instanciar; se libera la pausa y la nueva escena utiliza su posición, vida/recursos y objetos iniciales existentes. No se vuelve al humano ni se repiten consecuencias acumulativas.

Pausa → Menú y Game Over → Menú comparten AnimalSegmentFlow.ReturnToLevelsLocalAsync → LocalMenuReturn.ReturnToSelectionAsync. Destino canónico verificado: **res://scenes/levels/menu_niveles.tscn**. Se verifica/carga su PackedScene, se refresca la misma partida desde SQLite y se crea el permiso de selección mediante PrepareSelectionAsync antes de navegar. Se libera la pausa, se cambia de escena y se retira la interfaz anterior. La selección recibe un permiso válido, mantiene sus cinco tarjetas y consulta disponibilidad mediante los servicios existentes: un bioma decidido incompleto abre su animal y su ambiente; solo completed queda bloqueado. No se pasa por bienvenida, perfil, login ni recuperación. El método ReturnAsync histórico se conserva para usos de menú principal ajenos a estos dos botones; sus11 pruebas siguen siendo regresión de esa API, no una afirmación del destino vigente de pausa.

Abandono animal: se mantienen decisiones, consecuencias, partida y recibos, sin guardar posición ni recursos intermedios. Al volver al animal se abre su entrada original con inicialización real de escena, igual que el reinicio aprobado. No hay RecordDecision, EnterBiome, CompleteBiome, creación/archivo/cierre de partida ni cambios de historial/disponibilidad en estas salidas.

Errores: fallos de lectura, contexto o navegación dejan la escena anterior y su pausa; un fallo al abrir selección invalida su permiso temporal y permite reintentar la consulta. El puente comprueba vida de nodo/escena antes de callbacks para no tocar otra escena ni volver a pausarla tras su salida. El coordinador bloquea transición doble; _saliendo bloquea acciones cruzadas del mismo panel. Los errores usan el aviso local ya existente en pausa; Game Over utiliza TooltipText de los botones existentes y GD.PushWarning, sin añadir controles ni cambiar el diseño. Una escena animal ausente incluye su ruta canónica en el mensaje; el destino de selección ausente también se informa. No hay fallback HTTP ni partida temporal.

Revisión estática de consola: se inspeccionaron referencias locales/remotas, inicialización, señales/tween, pausa, nodos liberados y cola/disposición SQLite. Las dos rutas corregidas no llaman Services ni abren recuperación/login; el adaptador conserva serialización y errores controlados al cerrar recursos. Se añadió la comprobación de validez del callback tween de Game Over. No se diagnostican ni se declaran resueltos errores no aportados por el usuario. Si aparecen al probar, solicitar las líneas completas de consola y su traza (sin secretos), indicando si ocurrieron al morir, reintentar o volver a niveles. No asumir origen SQLite.

**260 comprobaciones C# aprobadas, cero fallidas:**19 nuevas de Game Over/navegación +21 reinicio +11 retorno histórico +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las19 cubren los cinco animales/ambos resultados, ambos orígenes de retorno, estado de las cinco tarjetas y reentrada animal, fallo SQLite/retry, navegación fallida/permiso invalidado, doble clic, completed, escena faltante con ruta, partida ausente y conexiones C# inspeccionadas sin rutas remotas. Se verifica hash completo de fixtures y conservación de revisión/decisiones/ambientes/otros biomas/partida. La preparación de una fixture terminal usa CompleteBiome únicamente en pruebas; ninguna ruta de producción nueva lo ejecuta.

Pruebas de SQLite real con fixtures independientes bajo local-persistence/.work/databases/<UUID>, callbacks de pausa/navegación y comprobación de bindings como texto fuente. No son señales/escenas ejecutadas en Godot, ni una prueba real de desconexión de red. El flujo inspeccionado carece de HTTP obligatorio; validar offline real manualmente. Reanudar desde pausa conserva su implementación y requiere comprobación runtime. Las regresiones incluyen los procesos hijos readonly de fases anteriores. Cero archivos SQLite sintéticos restantes.

Comandos ejecutados con entorno CLI/paquetes/TEMP privado: build --no-restore de GameSave.Checks.csproj; ejecutor --game-over-navigation, --animal-restart, --menu-return, --animal-entry, --decisions, --biome-selection, --runtime-menu y --progress; local-persistence/run-checks.ps1. Compilación completa TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild con GodotProjectDir hacia integration/sqlite/.work/: cero errores,63 advertencias históricas ParallaxBackground,ninguna nueva. Biblioteca/ejecutor: cero errores/advertencias. MSBuild inspecciona86 fuentes, una sola referencia a local-persistence/src/TwoSides.LocalPersistence.csproj y cero fuentes backend/tests filtradas al proyecto Godot. Sin restore, modificación de proyectos ni motor/editor, Node.js o Atlas ejecutados.

Integridad:1,520 archivos protegidos con tamaño/SHA-256/fecha idénticos antes/después, incluyendo finales/FinNivel/biomas/actores/recursos/escenas/configuración y adaptador SQLite. Las tres bases protegidas más manifiestos/leases (9 archivos) permanecen idénticos; no se abrieron con SQLite ni se reinicializó progreso manual. .env conserva278bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928,comprobado separadamente de compilaciones/pruebas, sin leer valores ni usar credenciales. No se cambian ACL/propietario; riesgo ACL de B00 pendiente. No se accede al proyecto original.

Guía manual: con la misma partida, entrar a un bioma decidido, perder por una mecánica existente y comprobar el Game Over original. Reintentar (también doble clic): una sola escena animal, entrada/recursos/objetos iniciales, mismo ambiente y sin humano/login ni pausa residual. Repetir en los cinco biomas y ambientes existentes sin editar decisiones. Desde pausa, reanudar primero; luego Menú debe abrir directamente las cinco tarjetas. Desde Game Over, Menú debe abrir esa misma selección. Elegir un bioma decidido distinto y verificar su ambiente propio e ingreso desde inicio; confirmar misma partida y restricción de nueva partida al volver al menú principal por su ruta habitual. Repetir sin internet y después de cerrar/abrir el juego. No dañar bases reales para inducir errores. Recoger consola/traza si aparece cualquier error nuevo.

Próxima etapa: validar estos dos flujos y aclarar consola con evidencias. CompleteBiome por llegada física, checkpoints, cierre global y finales siguen fuera de alcance; no se implementan aquí ni se inicia B05. Trabajo detenido al terminar C.2C.4.

## B04.2B.2B.2D.1 — Auditoría de recursos, eventos y estadísticas (2026-10-26)

**COMPLETADA como investigación, diseño y documentación. B04.2B.2B.2D.2 NO iniciada.** El usuario confirma C.2C.4 con13/13 pruebas manuales y cero errores nuevos reportados. Las260 pruebas automatizadas corresponden a evidencia histórica; no se reejecutan en esta fase sin cambios de código.

Se revisaron los diez documentos solicitados, todos existentes, y código/esquemas/modelos/servicios/pruebas de local-persistence, los cinco animales y sus escenas, recursos/daño/derrota, pausa/navegación/FinNivel/Final y backend Node sin iniciarlo. Se crean únicamente:
- [LOCAL_RESOURCE_AUDIT.md](LOCAL_RESOURCE_AUDIT.md)
- [GAMEPLAY_EVENT_AUDIT.md](GAMEPLAY_EVENT_AUDIT.md)
- [GLOBAL_STATISTICS_DESIGN.md](GLOBAL_STATISTICS_DESIGN.md)
- [LOCAL_STATISTICS_IMPLEMENTATION_PLAN.md](LOCAL_STATISTICS_IMPLEMENTATION_PLAN.md)

Además se actualizan solo PHASES.md, PHASE_HISTORY.md y DECISIONS.md para registrar esta auditoría. Los nombres del plan para archivos/tablas futuros son propuestas, no implementaciones existentes.

Conclusiones verificadas: vida inicial3 por MaxHealth en los cinco actores, agua/comida100 desde Estadisticas con agua inactiva en delfín; se preservan diferencias de clamp/daño entre actores. Agua/comida agotadas reducen velocidad según código, no se encontró muerte automática por agotamiento. Daño/Hurtbox/Die y ZonaMuerte convergen en GameOver; caída puede no pasar por Die. Reinicio/reintento/retorno son readonly respecto a gameplay SQLite y no producen contadores estadísticos duraderos.

Esquema actual versión2, diez tablas. Reutilizable para perfil/partidas/decisiones/ambientes/progreso/recibos; carece de sesiones de gameplay, muertes/reinicios, intervalos y outbox. attempt_number no incrementa por los reinicios actuales; saved_at no mide tiempo jugado. No confundir sesiones de autenticación/journal remoto con sesiones/eventos locales.

Regla vigente: muerte/reinicio/abandono conservan decisión y ambiente pero vuelven a entrada animal con inicialización original, sin checkpoint intermedio. Sustituye propuestas antiguas incompatibles de hidratación de recursos en documentos históricos, que no se modifican aquí. No se alteran mecánicas, metas ni finales.

Diseño propuesto: eventos con identidad estable e intención/origen, intervalos exclusivos de reloj monotónico y cobertura explícita, no contar pausa/menús/Game Over como juego efectivo. Cierre inesperado solo confirma lo duradero, sin inventar tiempo/muertes previas. Consultas de métricas actuales no necesitan migración; persistencia de nuevos eventos/intervalos requiere migración aditiva ensayada y autorizada, todavía no aplicada. Tres tablas analíticas mínimas propuestas se justifican por datos ausentes; no esconderlos en snapshots/settings ni añadir agregados mutables innecesarios. Outbox/ACK/retry e índices únicos de receptor se diseñan conceptualmente para una fase posterior; backend actual solo tiene identidad/autenticación en memoria y no endpoints de gameplay ni Mongo.

Decisión de diseño: finales globales y completados funcionales siguen parciales hasta integrar meta/CompleteBiome y localizar/conectar evaluador y resultado final, sin inventar umbrales. El panel AWS futuro consume datos mínimos agregados de jugadores que sincronicen, no de todos los jugadores offline. Identidad estable, idempotencia y procedencia/cobertura deben preceder a esos conteos.

Protección: comparación antes/después de1,530 archivos protegidos (tamaño,SHA-256,fecha) y9 archivos de las tres bases/manifiestos/leases, sin cambios. No se abrieron bases duraderas mediante SQLite; solo hashes/metadatos. .env278bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928 comprobados separadamente, sin leer valores ni modificar permisos/propietario. Riesgo ACL de B00 pendiente. No original, producción, escenas, proyectos, pruebas, recursos, navegación, pausa/GameOver/FinNivel/Final modificados; sin tests/builds/migraciones/Node/Godot/Atlas/AWS ejecutados.

Recomendación: autorizar como siguiente paso el alcance concreto de D.2 (consultas readonly primero; instrumentación duradera solo con contrato/migración/ciclo de vida aprobados), manteniendo los archivos exactos y pruebas del plan. No implementar ahora CompleteBiome, checkpoints, cierres/finales, sincronización o endpoints globales; no iniciar B05. Detenerse después de D.1.

## B04.2B.2B.2D.2 — Consultas locales sin migraciones (2026-10-26)

**COMPLETADA EN CÓDIGO. Pantalla Estadísticas pendiente, sin conexión visual.** La autorización actual limita el plan D.1 a consultas derivadas: no se implementan sus propuestas de sesiones/eventos/intervalos, esquema3, instrumentación o sincronización. Prevalece este alcance sobre los apartados futuros del plan histórico.

Inventario exacto de cambios: nuevos local-persistence/src/StatisticsModels.cs.txt, StatisticsRepository.cs.txt y StatisticsService.cs.txt; nuevo local-persistence/game-save-tests/LocalStatisticsChecks.cs.txt y selector --local-statistics en GameSaveChecks.cs.txt. Documentación: LOCAL_STATISTICS_IMPLEMENTATION_PLAN.md, GLOBAL_STATISTICS_DESIGN.md, PHASES.md, PHASE_HISTORY.md, DECISIONS.md y local-persistence/README.md. Total11 archivos. No se cambian UnitOfWork, SQLiteRepository, GameSaveService, adaptadores, Godot, proyectos, esquema ni migraciones.

### Consultas y contratos implementados

StatisticsService recibe ISaveDatabase ya validado y SaveCatalog existente, sin ruta arbitraria ni apertura/creación de almacenes desde UI. Su constructor verifica esquema2 e integridad mediante SchemaManager.Verify (sin Initialize). Cada consulta completa usa **una UnitOfWork.Read**; StatisticsRepository reutiliza Profile/Games/Game/Biomes/Decisions/Environments/Receipt del repositorio existente dentro de esa misma transacción. Las listas son materializadas y expuestas como colecciones readonly. No hay SQL de escritura, recibos nuevos, timestamps actualizados ni almacenamiento redundante.

- GetLocalStatistics(): StatisticsResult<PlayerStatistics>; NoData/Data=null si el esquema está inicializado pero no hay perfil. Nunca crea perfil ni partida.
- GetPlayerStatistics(owner): exige UUID válido y coincidencia con el perfil local; devuelve nombre visible, ID, TotalGames, ActiveGames/ActiveGameId/ActiveGame, HistoricalGames, CompletedGames, AllDecisions/HistoricalDecisions, AllProgress/HistoricalProgress y Uncollected.
- GetGameStatistics(owner,gameId): consulta una partida de ese dueño; GameStatistics incluye IDs, revisión, estado/is_current, versiones, fechas almacenadas, Ending, ConfirmedCompleted, DecisionStatistics, ProgressStatistics y cinco BiomeStatistics.
- DecisionStatistics: Total/Reject/Approve/Healthy/Degraded y cinco BiomeDecisionStatistics. BiomeStatistics contiene estado/resultado/fechas, evidencia de inicio y ConsequenceStatistics opcional (GameId/BiomeId/DecisionId/OperationId, OptionId, ambiente, JSON/version/reglas/fecha).
- No se exponen referencias de credenciales, correo interno ni cuenta técnica en estos contratos. DisplayName se usa solo localmente, no se exporta.

ActiveGame significa la fila is_current, tanto in_progress como final_pending; no promete que esta última sea jugable ni que la navegación final ya exista. HistoricalGames excluye is_current y conserva cada GameId. All* suma todas las partidas; Historical* solo las no actuales; ActiveGame contiene su propio resumen. Los valores de progreso históricos suman filas (GameId,BiomeId), no colapsan ocean de varias partidas en una fila. GamesState=NoData distingue perfil sin partidas, aunque sus conteos válidos sean0.

El repositorio pagina juegos en bloques128 hasta agotar y decisiones por decision_order hasta agotar, bajo el mismo snapshot, sin quedar limitado a50/100. La selección de perfil se verifica dentro de la transacción y los SQL reutilizados parametrizan dueño/partida. No se mezclan consultas de GameSaveService que abrirían transacciones independientes.

### Interpretación y prevención de duplicados

Se valida catálogo/versiones de contenido/formato, cinco biomas/ambientes, decisiones y opciones/consecuencias v1/v2, vínculo LastDecisionId y recibo de decisión de la misma partida/propietario. No se cuenta la proyección environmental_state como otra decisión. IDs y clave lógica por bioma/decision_key se validan; ningún reinicio/visita incrementa decisiones porque esas rutas solo consultan y la capa no emite comandos.

Completed de progreso se cuenta exclusivamente desde biome_progress.status='completed'; animal_pending no es fallo ni completed. Las cinco filas precreadas human_pending no equivalen a cinco entradas. ConfirmedStartedMinimum incluye decisión confirmada o entrada humana actual indicada por CurrentBiomeId/ResumeKind. Started es true con evidencia y null si no puede conocerse. Progress.Started es Unknown/null si falta evidencia para alguna fila; solo es Available cuando todas están acreditadas y NoData si no hay filas. No se infieren visitas históricas desde attempt_number, recibos sin BiomeId o saved_at.

ConfirmedCompleted de partida requiere status completed y los metadatos terminales existentes: ending good/medium/bad, ending_rules_version igual a rules_version y completed_at presente. Ending también reconoce esos metadatos en final_pending sin contar la partida como terminada. Esto verifica la declaración almacenada, NO recalcula umbrales ni demuestra una llegada física no instrumentada. Un completed con metadatos incompletos devuelve Ending Unknown y CompletedGames Unknown/null, no un cero ficticio. Archived no se trata como completado por su nombre. No se implementa cierre ni finales.

StatisticsAvailability distingue Available, Unknown, NotAvailable y NoData. StatisticCount.Value es nullable:
- Available con0: conteo válido y vacío, por ejemplo decisiones de un perfil sin partidas.
- Unknown/null: datos insuficientes para una métrica derivada, por ejemplo número exacto de biomas iniciados o terminal incompleto.
- NotAvailable/null, Reason=NOT_COLLECTED: tiempo jugado, sesiones, muertes, reinicios y reintentos, sin captura existente.
- NoData: no existen registros aplicables (perfil ausente, historial vacío, consecuencia de un bioma sin decisión o final no registrado).

Datos corruptos/contradictorios no generan estadísticas inventadas ni se reparan: SaveException con código seguro (INVALID_STATISTICS_DATA, UNKNOWN_CONTENT, NOT_FOUND, INVALID_DATA, UNSUPPORTED_SCHEMA o códigos StorageErrors como IO_ERROR/ACCESS_DENIED/STORAGE_BUSY). No se devuelve un resumen parcial como éxito tras fallar SQLite.

### Ejemplos sintéticos comprobados

Prueba con una partida histórica con reject en ocean y una actual con approve en jungle: TotalGames2, ActiveGames1, CompletedGames Available1, AllDecisions Total2/Reject1/Approve1, HistoricalDecisions Total1/Reject1/Approve0, ActiveGame.Decisions Total1/Reject0/Approve1. Las decisiones no completan los biomas; los metadatos terminales históricos son preparación explícita de fixture, no implementación de finales.

Prueba con55 partidas históricas de dos decisiones y una activa de una decisión: TotalGames56, HistoricalGames.Count55, AllDecisions.Total111, Reject56, Approve55. Otra fixture de129 partidas confirma que la paginación supera incluso el bloque interno128. No son estadísticas de la partida manual.

Ejemplo de estado sin captura:
~~~json
{"PlayedMilliseconds":{"State":"NotAvailable","Value":null,"Reason":"NOT_COLLECTED"},"Deaths":{"State":"NotAvailable","Value":null,"Reason":"NOT_COLLECTED"}}
~~~
La representación muestra nombres de enum para documentación; el contrato C# no impone una serialización JSON remota.

### Preparación para la futura pantalla

Una futura integración explícitamente autorizada debe invocar estas consultas en el worker/cola del adaptador propietario del ISaveDatabase ya abierto, conservar su ciclo de vida y entregar DTOs al hilo Godot. No abrir una conexión ni ejecutar SQL en scripts visuales. Obtener primero GetLocalStatistics; manejar NoData y SaveException sin crear partidas ni usar recuperación HTTP. Renderizar Value solo cuando State=Available; mostrar desconocido/no disponible/sin datos según el estado. Para opciones actuales usar ActiveGame.Biomes y sus consecuencias; para historial seleccionar GameId o Historical*. No sumar All*+ActiveGame+Historical* (duplicaría datos).

No se añade todavía ese método al GamePersistenceAdapter, ni botón, escena, observador de tiempo, exportador, tarea de sync o endpoint. Los contratos son locales; estadísticas globales seguirán derivándose en el servidor de múltiples jugadores sincronizados, con política de identidad/datos mínimos futura.

### Pruebas y compilación efectivas

**299 comprobaciones C# aprobadas, cero fallidas:**39 nuevas estadísticas +19 Game Over/navegación +21 reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las260 anteriores se reejecutaron, no se presentan solo como historia.

Las39 cubren base inicializada vacía, perfil sin partidas, activa/historial separado, ambos resultados en cinco biomas, orden libre, retry idempotente/restart sin doble conteo, paginación56/129 y111 decisiones, completed realmente almacenado, final histórico/versiones/metadatos incompletos, final_pending actual, cuatro estados de disponibilidad, consecuencias v1/v2, conexión mode=ReadOnly/query_only, bytes/timestamps/esquema/recibos intactos, una conexión por snapshot completo, perfiles ajenos/independientes, IDs inválidos, tabla ausente, errores de acceso, versión antigua incompatible sin upgrade, consecuencias desconocidas/contradictorias y ausencia de dependencias HTTP/Mongo/Godot/campos de credenciales.

Comandos: dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore; ejecutor con --local-statistics y los ocho modos seguros anteriores; local-persistence/run-checks.ps1. Solo fixtures propias en local-persistence/.work/databases/<UUID>, cero archivos SQLite sintéticos restantes. No se prueba con bases manuales, modo durable por defecto ni conexiones externas. Callbacks y fuente de UI inspeccionada en regresiones no equivalen a ejecución del motor.

Biblioteca/ejecutor0errores/0advertencias. Rebuild completo TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild, GodotProjectDir hacia integration/sqlite/.work/:0errores,63advertencias históricas ParallaxBackground y ninguna nueva. MSBuild:86 fuentes, una sola referencia de biblioteca y cero fuentes backend/tests filtradas. CLI/paquetes/temporales privados, sin restore ni cambios de proyectos. No Godot, Node.js o Atlas ejecutados.

### Compatibilidad, integridad y límites

Compatible con esquema2 inicializado y registros antiguos de formato/consecuencias soportados. Una base sin esquema o esquema1 que necesitaría migración se rechaza sin inicializar/actualizar; tampoco se interpreta contenido de versiones desconocidas. No se alteran los diez modelos/tablas existentes ni sus constraints/checksums. Las consultas materializan el historial completo; para volúmenes muy grandes queda optimización futura, sin cambiar ahora su semántica.

Comparación antes/después:1,530 archivos protegidos idénticos en tamaño/SHA-256/fecha y9 archivos de las tres bases/manifiestos/leases intactos. No se abrieron bases duraderas mediante SQLite. .env278bytes,SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928,comprobado separadamente de builds/tests sin leer valores ni cambiar ACL/propietario. Riesgo ACL de B00 pendiente. Producción previa de gameplay, recursos, decisiones, pausa/Game Over/navegación/FinNivel/Final, escenas y proyectos permanecen intactos.

Siguiente subfase recomendada: conexión local de pantalla Estadísticas con estos DTOs y estados, solo tras nueva autorización. Eventos/tiempos/muertes/reinicios, migraciones, CompleteBiome, finales y Atlas quedan para fases separadas; no B05. Detenerse después de D.2.

## B04.2B.2B.2D.3 — Pantalla local de estadísticas (2026-10-26)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** Se conecta exclusivamente la consulta local de D.2, sin eventos, migraciones, sincronización ni nuevas métricas.

Inspección: el botón existente es Centro/Tablero/Margen/Contenido/BotonesInferiores/BotonEstadisticas, en assets/sprites/ui/menu_principal.tscn. MenuPrincipal lo deshabilitaba si EscenaEstadisticas era null, y esa exportación no está asignada. No existe una escena/pantalla de estadísticas; scripts/Estadisticas.cs es HUD de recursos y queda intacto. Por tanto se crea una vista desde C#, como el LocalProfileView existente, dentro del tablero del menú, sin añadir/editar .tscn ni cambiar recursos visuales.

Archivos de producción: scripts/MenuPrincipal.cs; nuevo scripts/LocalStatisticsScreen.cs; integration/sqlite/GamePersistenceAdapter.cs; integration/sqlite/GamePersistenceContext.cs; nuevo integration/sqlite/LocalStatisticsScreenState.cs. Pruebas: nuevo local-persistence/game-save-tests/StatisticsScreenChecks.cs.txt, dispatcher GameSaveChecks.cs.txt y Compile del archivo puro en GameSave.Checks.csproj. Documentación: LOCAL_STATISTICS_IMPLEMENTATION_PLAN.md, GLOBAL_STATISTICS_DESIGN.md, PHASES.md, PHASE_HISTORY.md, DECISIONS.md, local-persistence/README.md y los tres documentos GODOT_RUNTIME_INTEGRATION_PLAN/GODOT_SCENE_EVENT_MAPPING/GODOT_RUNTIME_TEST_PLAN. Total17 archivos; no se modifican proyectos de producción ni biblioteca de consultas D.2.

### Integración de fuentes y consulta

Los Statistics*.cs.txt son fuentes reales de la biblioteca: local-persistence/src/TwoSides.LocalPersistence.csproj incluye Compile="*.cs.txt". TwoSides.csproj excluye local-persistence/** y ya tiene una ProjectReference a esa biblioteca. No se renombran/copian DTOs/servicio a scripts Godot ni se duplican clases. GameSave.Checks.csproj incorpora solo el nuevo estado puro de pantalla, sin referencias al motor.

GamePersistenceAdapter implementa ILocalStatisticsReader, una capacidad con un único GetLocalStatisticsAsync. Reutiliza su _gate/Task.Run y el ISaveDatabase ya abierto por el contexto, con StatisticsService lazy dentro del worker. GetLocalStatistics consulta el mismo esquema/datos de D.2 en una transacción de lectura; no abre otro CopyGameDatabase ni crea registros. El servicio estadístico se invalida al Close/Dispose del adaptador. Prueba negativa del adaptador real cerrado verifica STORAGE_CLOSED sin abrir rutas protegidas.

Ajuste de composición mínimo, anunciado antes de editar: GamePersistenceContext conserva el mismo adaptador propietario en un campo y expone únicamente ILocalStatisticsReader Statistics. El mismo adaptador sigue construyendo State y sigue bajo Initialization/Shutdown existentes; no hay nuevo autoload, contexto ni proveedor de rutas. No se modifica LocalGameState ni sus reglas.

MenuPrincipal.Statistics bloquea doble clic con _navigating, muestra carga, espera el resultado local y abre LocalStatisticsScreen con ese estado ya cargado. El botón deja de depender de EscenaEstadisticas y no exige partida activa: habilitado con almacenamiento listo, sin escritura pendiente/operación/transición en curso. También admite perfil ausente como estado vacío. No crea nombre ni partida. La exportación antigua se conserva sin usarse para navegación.

### Vista y ciclo de vida

La vista es un VBoxContainer hijo del MarginContainer del tablero actual. Durante su apertura se oculta el contenido original y se muestra título, ScrollContainer con Label de texto plano, Volver al menú y Reintentar consulta en caso de error. Mantiene fondo/textura/música del menú sin editar escena. Tamaño mínimo510x220 y fuente12 para cuerpo/botones, diseñado para viewport640x360; ajuste visual, scroll y foco requieren validación en Godot.

LocalStatisticsScreenState consulta una vez por apertura o reintento explícito, genera el texto en Task.Run y lo conserva; no hay polling SQLite ni formateo completo en cada frame. El render/tocar controles queda en hilo Godot tras await. Close invalida el estado y descarta respuestas tardías; cada callback verifica vida de nodo antes de actualizar UI. Volver oculta/retira la vista y restaura contenido/foco del menú, sin cambiar escena, partida o pausa. Una nueva apertura vuelve a consultar los datos actuales una vez.

Los datos del jugador solo se asignan a Label.Text: no RichTextLabel/BBCode, SQL, código, URLs ni rutas de escena. No se muestran LocalPlayerId/GameId/OperationId ni referencias de credenciales; nombre visible y fechas se usan como texto. No se exporta información.

### Datos presentados y estados

- Nombre, total de partidas y existencia de partida actual; terminadas solo según metadatos confirmados por D.2.
- Todas las partidas: decisiones totales, No/reject, Sí/approve y desglose de los cinco biomas.
- Partida actual: estado, fecha almacenada, decisiones propias, completados y pendientes, estado de cada bioma y ambiente confirmado.
- Historial separado, excluyendo la actual: totales históricos y cada partida enumerada sin ID técnico, con decisiones/progreso/ambientes y final solo si Ending está disponible. Un final no confirmado dice Desconocido o Sin final registrado, sin calcular umbrales.
- Tiempo jugado, sesiones, muertes, reinicios y reintentos muestran No disponible porque D.2 devuelve NotAvailable/null; no se convierten en0. El formateador distingue Unknown→Desconocido, NoData→Sin datos y Available0→0.
- Perfil ausente: mensaje vacío explícito. Perfil sin partidas: conteos medidos0 e historial/partida actual vacíos, sin inventar progreso. animal_pending aparece como decisión confirmada/segmento animal pendiente, no como error ni completed.

No se suman AllDecisions+ActiveGame+HistoricalDecisions como si fueran métricas disjuntas: las secciones indican su alcance. Los biomas realmente completed vienen del dato persistido, no de la decisión. Las fechas se presentan como registro, nunca se restan para inventar duración.

Error SQLite/servicio: la vista presenta error local controlado y permite Reintentar consulta o Volver. No muestra mensajes internos/secretos ni redirige a recuperación/login; un error no genera una partida temporal. Sin almacenamiento inicializado el botón permanece deshabilitado; la inicialización conserva su diagnóstico local previo.

### Pruebas y compilación

**323 comprobaciones C# aprobadas, cero fallidas:**24 nuevas de pantalla +39 consultas +19 Game Over/navegación +21 reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las299 anteriores se reejecutan, no se presentan como resultado nuevo solo por referencia histórica.

Las24 usan StatsService/SQLite real readonly en fixtures propias: perfil vacío/sin partidas, diez combinaciones bioma/opción, historial sin activa y final registrado, scopes separados, completed almacenado, estados no disponibles/desconocidos/cero, doble clic/carga asincrónica, error/retry, cierre con respuesta pendiente, reapertura sin polling, proceso hijo readonly, nombre con aspecto de markup sin IDs expuestos, adaptador cerrado real y bindings de texto/controlador sin HTTP. No abren bases manuales. El camino positivo del adaptador propietario se compila/inspecciona; las fixtures no debilitan sus restricciones de ruta para ejecutarlo sobre una base arbitraria.

Comandos: build --no-restore de GameSave.Checks.csproj; ejecutor --statistics-screen y sus probes de fixture, --local-statistics y los ocho modos seguros previos; local-persistence/run-checks.ps1. Fixtures bajo local-persistence/.work/databases/<UUID>, cero archivos SQLite sintéticos restantes. Pruebas de estado/formato/bindings no equivalen a botones, scroll o render ejecutados en Godot, ni a prueba real de desconexión de red.

Biblioteca/ejecutor0errores/0advertencias. Rebuild completo TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild, GodotProjectDir hacia integration/sqlite/.work/:0errores,63 advertencias históricas ParallaxBackground,ninguna nueva. MSBuild:88 fuentes, una referencia a la biblioteca y cero fuentes backend/tests filtradas; no se duplica StatisticsService ni su fuente .cs.txt. CLI/paquetes/temporales privados; sin restore, editor/motor, Node.js o Atlas ejecutados.

### Integridad y validación manual pendiente

Antes del ajuste de contexto se verificó intacto el manifiesto inicial de1,528 archivos protegidos; se añadió GamePersistenceContext al inventario autorizado antes de editarlo. Manifiesto final:1,527 archivos protegidos con tamaño/SHA-256/fecha idénticos antes/después, incluidos esquema, biblioteca D.2, escenas, project.godot/TwoSides.csproj, actores, recursos, decisiones, Game Over/pausa/reinicio/navegación animal/FinNivel/finales. Nueve archivos de las tres bases/manifiestos/leases permanecen intactos, sin abrirlos mediante SQLite en pruebas. .env278bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928 antes/después, separado de builds/tests, sin leer valores ni cambiar permisos/propietario. Riesgo ACL de B00 pendiente.

Guía manual: abrir esta copia en Godot C# sin Node; con el perfil existente pulsar Estadísticas y comprobar nombre, partidas y decisiones de los cinco biomas contra lo jugado. Verificar que decidir no equivale a completed y que los ambientes coinciden; distinguir secciones actual/historial. Confirmar No disponible para los cinco campos no capturados, desplazamiento hasta el final y retorno al mismo menú. Doble clic debe abrir una sola vista. Reabrir tras volver, cerrar/abrir el juego y probar sin internet. Si solo hay perfil/historial debe poder consultarse sin crear otra partida. No borrar bases ni alterar decisiones para fabricar casos; vacíos/fallos se cubren con fixtures.

Si aparece un error, copiar consola/traza sin secretos e indicar carga, scroll o retorno. No se afirma validación visual sin motor. Historial completo muy grande todavía puede exigir paginación visual futura; consultas/formateo se ejecutan fuera del hilo principal, pero layout/render final necesita evaluación runtime.

No se implementan captura de métricas, migración, CompleteBiome, checkpoints, finales, Atlas, datos globales ni B05. Siguiente paso: validación manual de D.3 y autorización específica para cualquier nueva subfase. Trabajo detenido al terminar.

## B04.2B.2B.2D.4A — Almacenamiento local de eventos y tiempos (2026-10-26)

**COMPLETADA EN CÓDIGO; SIN CAPTURA GODOT NI MIGRACIÓN REAL.** El usuario confirma D.3:14/14 comprobaciones manuales correctas y cero errores nuevos. La pantalla validada y StatisticsService conservan su comportamiento, incluidas las métricas No disponible.

### Archivos y decisión de compatibilidad

Nuevos en local-persistence/src: GameplayEventModels.cs.txt, GameplayEventSchema.cs.txt, GameplayEventRepository.cs.txt, GameplayEventService.cs.txt y GameplayMonotonicClock.cs.txt. Pruebas: GameplayEventChecks.cs.txt nuevo y dispatcher GameSaveChecks.cs.txt. Se actualizan únicamente los siete documentos indicados para D.4A: plan/diseño global/auditoría de eventos/PHASES/PHASE_HISTORY/DECISIONS/README. Total14 archivos. Ningún controlador, adaptador o escena Godot, StatisticsModels/Repository/Service, servicio de gameplay ni esquema base se modifica.

El plan D.1 proponía una posible versión3 del esquema base. La alternativa implementada reduce riesgo: **extensión opcional gameplay versión1 sobre base versión2**, con historial propio. Cambiar CurrentVersion base habría afectado verificadores/consumidores ya validados y la apertura automática del runtime. Se conservan user_version=2, migraciones1/2 y sus checksums, diez tablas originales y servicios existentes. No se reinterpreta ningún dato histórico ni se añade una columna a una tabla anterior.

MigrateSynthetic acepta exclusivamente SyntheticDatabase, cuya creación y validación están restringidas al namespace UUID de SyntheticSandbox bajo local-persistence/.work/databases. No acepta CopyGameDatabase, OwnedCopyDatabase, ISaveDatabase genérico ni ruta arbitraria como destino de migración. El runtime existente no invoca esta extensión. Solo una fase futura expresamente autorizada podrá definir una capacidad de migración real con respaldo y recuperación verificados; no se debe eludir la restricción de tipos.

### Esquema implementado

Cuatro tablas nuevas únicamente en fixtures migradas (14 tablas totales):
- gameplay_schema_migrations: PK version, migration_key UNIQUE, checksum y applied_at. Versión1, clave local-gameplay-extension-v1; checksum SHA-256 del SQL normalizado.
- gameplay_sessions: session_id PK, local_player_id FK, started_at_utc, status open/closed/interrupted, ended_at_utc nullable, end_offset_ms nullable; UNIQUE(session_id,owner). Índice parcial ux_gameplay_open_session permite una sesión abierta por propietario, evitando dos relojes capturando simultáneamente.
- gameplay_events: event_id PK; owner/session, kind, occurred_at_utc, offset_ms, game/biome/run opcionales según tipo, death_cause/session_end limitados, contract_version1, payload_digest y dedupe_key; UNIQUE(owner,dedupe_key) y clave compuesta para referencias de run.
- gameplay_intervals: interval_id PK; owner/session, start_ms/end_ms, state, game/biome/run y versión/digest; end>=start>=0 y UNIQUE(session,start,end,state). No tabla de acumuladores redundantes.

FK compuestas preservan propietario de sesión/partida, bioma de esa partida y vínculo del run con su evento ANIMAL_SEGMENT_STARTED. El servicio confirma además tipo/alcance del run: una FK por sí sola no asegura semántica de evento. Índices de eventos por dueño/game/biome/kind y session/offset; intervalos por session/rango y dueño/game/biome/state. Las consultas parametrizan filtros; no tienen LIMIT fijo que trunque historial.

Migración: verifica base2 compatible, abre transacción inmediata, crea todo el SQL y su historial en un único commit. Si encuentra extensión parcial/versión/checksum incompatibles, rechaza sin sobreescribir. Si falla antes del commit, DDL/historial se revierten. Segunda aplicación verifica lo existente y no vuelve a insertar ni cambia bytes. Base vacía necesita primero inicialización base explícita en fixture; esquema1/futuro incompatible no se actualiza silenciosamente. No se tocaron las bases protegidas.

### Contratos y servicios

GameplayEvent contiene EventId, LocalPlayerId, SessionId, Kind, OccurredAtUtc, OffsetMs, GameId/BiomeId/AnimalRunId cuando aplican, DeathCause/SessionEnd tipados y Version1. UUIDv4 canónicos existentes; no nombres, correos, credenciales, texto libre, posiciones o recursos. UTC se normaliza antes del digest. Metadatos posibles son enums cerrados, no JSON arbitrario.

Kinds soportados: SESSION_STARTED, SESSION_ENDED, ANIMAL_SEGMENT_STARTED, ANIMAL_DIED, ANIMAL_RESTART_REQUESTED, ANIMAL_RETRY_REQUESTED, ANIMAL_SEGMENT_EXITED, ANIMAL_SEGMENT_COMPLETED. El último solo puede almacenarse si el bioma YA tiene completed confirmado en dominio; el servicio no ejecuta CompleteBiome ni marca nada completado. La fixture positiva prepara ese estado con la API anterior solo para probar el contrato futuro.

GameplayEventService.RecordEvent registra inicio/cierre y eventos en transacciones inmediatas propias del servicio nuevo; no altera local_operations ni revisiones/timestamps de gameplay. SESSION_STARTED crea sesión y evento atómicos. SESSION_ENDED normal sella estado/UTC real/offset monotónico y evento juntos. InterruptSession sella interrupted con fin UTC desconocido, descubrimiento UTC en el evento y offset duradero existente. Una sesión cerrada rechaza nuevos registros salvo duplicados exactos ya comprometidos.

Inicio animal exige partida actual in_progress, bioma canónico animal_pending, decisión/consecuencia/vínculo confirmados y ambiente coherente con reject/approve. AnimalRunId es el EventId del inicio y no cambia durante ese intento. No abre dos runs activos dentro de una sesión; muerte, salida, solicitud voluntaria o completed cierran el run para tiempo activo. Reintento requiere muerte previa y se rechaza después de salida/cierre incompatible. Muerte no cierra la partida; reintentar no agrega otra muerte. Salida puede seguir a muerte sin contabilizarla otra vez.

RecordInterval registra intervalos confirmados; GetEvents filtra por partida/bioma y GetSessions por propietario; GetTotals ofrece agregados scoped de muertes, solicitudes de reinicio/reintento, tiempo efectivo/pausa/observado y duración de sesión. Contratos son nuevos e independientes; StatisticsService anterior sigue devolviendo NotAvailable, verificado por prueba, hasta una integración posterior explícita.

### Idempotencia y tiempo

EventId/IntervalId se generan una sola vez en el futuro adaptador por operación lógica. Mismo ID y digest devuelve GameplayWriteReceipt(Inserted=false), incluso tras cerrar sesión; contenido distinto da EVENT_CONFLICT/INTERVAL_CONFLICT. Claves naturales kind+session o kind+animalRun evitan una segunda muerte, solicitud o cierre aunque un emisor defectuoso cambie de ID: se rechaza con conflicto, no se suma otra fila. No deduplicar por UTC, escena o bioma solamente.

Los contadores Restarts/Retries significan **ANIMAL_RESTART_REQUESTED/ANIMAL_RETRY_REQUESTED registrados**, no prueba de carga exitosa de escena. Una fase posterior podrá correlacionar nueva entrada confirmada para una métrica distinta; no mezclar ambos significados. No se genera otro evento de muerte al pulsar retry.

GameplayMonotonicClock usa Stopwatch.GetTimestamp/Frequency (inyectables en pruebas), origen nuevo por ejecución/sesión y offsets enteros en milisegundos. Conversión decimal desde diferencia total evita acumulación de redondeos por frame; rechaza reloj hacia atrás/duración inválida. No hay timer, autoload ni bucle del motor. El llamador futuro debe usar ese mismo origen para eventos e intervalos; nunca restar UTC ni comparar ticks entre procesos.

Intervalos [start,end) exclusivos por sesión: la transacción inmediata comprueba solapamiento contra cualquier clasificación, no solo active. Adyacentes permitidos, duplicados exactos idempotentes; IDs alternativos para el mismo rango se rechazan. ActiveHuman/ActiveAnimal suman efectivo; Paused/Menu/GameOver/Loading/Background quedan fuera. Puede existir pausa atribuida al bioma, pero nunca suma tiempo activo. Los intervalos no se borran al morir o salir.

Una sesión normal puede declarar duración por offset de cierre, incluidos menús/pausas; RecordedElapsedMs suma intervalos realmente confirmados. No sumar esa duración a efectivo/subtotales. Si faltan intervalos o la sesión sigue abierta/interrumpida, Incomplete lo indica. Para filtro por partida no se atribuye toda una sesión a ese game porque puede abarcar varios: SessionDurationMs=NotAvailable/SESSION_SPANS_GAMES; el tiempo de game/biome se deriva de sus intervalos.

No hay intervalos: EffectiveMs=Unknown/null, no0. Intervalo confirmado0..0: Available0. Sin cobertura animal registrada: muertes/restarts/retries NotAvailable/null. Resultados Scope=RecordedCoverageOnly y HistoricalCoverageUnknown=true: un0 medido cubre únicamente esa captura, nunca demuestra ausencia histórica de muertes antes de instrumentar. El servicio no rellena eventos, sesiones ni tiempo anteriores.

Cierre inesperado: solo se conserva lo duradero; InterruptSession no extrapola hasta la hora de descubrimiento. Duración total permanece Unknown y ended_at_utc=null. Debe sellarse la sesión anterior antes de abrir otra. El intervalo no confirmado se pierde potencialmente y no puede recuperarse reproduciendo gameplay. InterruptSession lee el límite y lo revalida al escribir; una escritura concurrente que lo cambie produce conflicto temporal, no se inventa tiempo. Reintentos deben conservar ID/UTC/payload o consultar el cierre ya existente.

### Pruebas y compilación

**364 comprobaciones C# aprobadas, cero fallidas:**41 nuevas eventos/tiempo +24 pantalla +39 consultas +19 Game Over/navegación +21 reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las323 regresiones se reejecutan. No se suman repeticiones de pruebas ni resultados históricos sin ejecución.

Las41 verifican extensión nueva/repetida/fallida/parcial/futura/checksum, base histórica y decisiones/recibos conservados, sesiones y cierres normales/interrupted, eventos/tiempos por game/biome, muerte/request/retry separados, idempotencia/conflicto, completado solo previamente confirmado, intervalo0 vs desconocido, exclusión de pausa/menú/derrota, rollback de inicio/cierre/evento/intervalo, propiedad y run, concurrencia de mismo evento y de intervalos solapados, reloj monotónico, API anterior intacta, reapertura readonly en proceso hijo y ausencia de PII/HTTP/Godot en los contratos.

Estrés:40 sesiones,400 intentos animales,1.280 eventos y400 intervalos;400 muertes,400 solicitudes de reintento y4.000ms efectivos capturados, sin truncamiento/duplicación. También compara digest completo del agregado de gameplay y número de local_operations antes/después: intactos. Datos son exclusivamente sintéticos.

Comandos: build --no-restore de GameSave.Checks.csproj; --gameplay-events y probe readonly limitado a fixture UUID; los diez modos seguros anteriores; local-persistence/run-checks.ps1. Solo local-persistence/.work/databases/<UUID>. Cero archivos SQLite sintéticos restantes. Sin bases manuales/servicios externos ni lógica de eventos ejecutada en Godot.

Biblioteca/ejecutor0errores/0advertencias. Rebuild TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild con GodotProjectDir hacia integration/sqlite/.work/:0errores,63 advertencias históricas ParallaxBackground y ninguna nueva. Las fuentes nuevas .cs.txt entran solo por la biblioteca ya referenciada; no se modifica csproj ni se duplican clases. CLI/paquetes/temporales privados; sin restore, Godot, Node, Atlas o AWS ejecutados.

### Integridad, riesgos y siguiente subfase

Comparación antes/después:1.538 archivos protegidos idénticos en tamaño/SHA-256/fecha; incluye esquema/migraciones base, estadísticas/pantalla, todos los controladores, gameplay, escenas, proyectos y finales. Las tres bases protegidas más manifiestos/leases (9 archivos) siguen intactos, sin abrirlas mediante SQLite para pruebas. .env278bytes,SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928,comprobado separadamente antes/después, sin valores ni cambios de propietario/ACL. Riesgo ACL de B00 pendiente.

Riesgos pendientes: pérdida antes del commit, cola/disco lleno y política de bloquear o continuar con cobertura incompleta; reloj/origen correcto bajo suspensión; fuente de causa de derrota; crecimiento/retención; IDs/intenciones que el emisor debe mantener; etiquetas de cobertura para no tratar conteos parciales como totales históricos. No hay outbox, ACK remoto ni entrega garantizada a Atlas. El recibo local no es un ACK de servidor.

Plan preciso para futura autorización:
1. Diseñar respaldo, verificación/reversión y capacidad explícita para migrar el runtime real; validarlo en fixtures/ensayo. No basta llamar MigrateSynthetic ni relajar su tipo. Requerir autorización específica antes de tocar datos reales.
2. GamePersistenceAdapter: servicio de eventos en su cola/worker, solo después de verificar extensión ya autorizada; sin SQL en scripts ni conexión paralela.
3. GamePersistenceContext y nuevo observador único: SESSION_STARTED al activar captura con perfil; cierre normal después de flush; al arrancar, interrumpir sesión abierta anterior sin arrastrar reloj entre procesos.
4. AnimalSegmentFlow: confirmar ANIMAL_SEGMENT_STARTED una vez después del guard, EventId=AnimalRunId; recibir origen de intención y preservar EventId en retry. MenuPausa registra solicitud voluntaria y cierra intervalos al pausar/reanudar. GameOver registra primera derrota del run y solicitud de reintento distinta; causa Unknown si no está propagada, sin modificar daño/recursos por inferencia.
5. Retorno al menú registra ANIMAL_SEGMENT_EXITED sin muerte duplicada y sin checkpoint. Una máquina exclusiva cierra intervalos al entrar/salir de carga, pausa, menú, foco, derrota y juego activo; cadence de flush requiere aprobación, no se activa en D.4A.
6. Nueva capa de consulta/presentación autorizada deberá etiquetar cobertura y distinguir solicitudes de reinicios exitosos; no sustituir silenciosamente las métricas de StatisticsService. Validación manual posterior de pausas, cierres, tiempos y conservación de gameplay.
7. ANIMAL_SEGMENT_COMPLETED solo se conectará a un commit de dominio confirmado en otra fase de meta física; no a decisión, BodyEntered aislado o Game Over. Finales y B05 siguen fuera de alcance.

Para Atlas futuro: preservar IDs/version/digest, receptor idempotente y ACK solo tras commit durable; misma carga/ID puede repetirse, otra carga/ID conflictivo no se suma. Una outbox transaccional y su retención se diseñarán en fase autorizada, no existen aquí. No enviar nombres ni otros datos personales innecesarios.

Recomendación: siguiente subfase de preparación/migración real controlada y luego captura local autorizada, manteniendo estos límites. D.4A termina aquí; no se conecta Godot, no CompleteBiome/finales/checkpoints/sync/B05.

## B04.2B.2B.2D.4A.1 — Respaldos y ensayo de migración (2026-10-26 Guatemala)

**COMPLETADA. Las tres bases originales siguen sin migrar.** Ejecución real de respaldos:2026-10-27T05:22:36Z, equivalente a2026-10-26 23:22:36 en Guatemala. No se falsifican fechas ni timestamps de origen.

### Herramienta aislada y ubicación privada

Archivos nuevos: local-persistence/backup-rehearsal/BackupRehearsal.csproj, Program.cs.txt y packages.lock.json. Solo se actualizan estos cinco documentos: LOCAL_STATISTICS_IMPLEMENTATION_PLAN.md, PHASES.md, PHASE_HISTORY.md, DECISIONS.md y local-persistence/README.md. No cambia ninguna herramienta compartida, migrador/repositorio de producción, adaptador runtime, gameplay, interfaz o escena.

El helper referencia la biblioteca existente y RealGameCatalog, compila fuentes .cs.txt como ejecutor aislado y admite solo --self-test y --backup-and-rehearse. No acepta rutas de origen/destino del usuario ni modo restaurar originales. La ejecución privilegiada revisada se limita a crear la carpeta privada fuera de OneDrive y escribir respaldos/copias/manifiesto allí; las tres fuentes son constantes y se abren exclusivamente ReadOnly.

Raíz de salida: %LOCALAPPDATA%\TwoSides\PrivateBackups\D4A1\<fechaUTC-UUID>. El manifiesto privado manifest.json contiene rutas exactas de cada origen/respaldo, fecha, tamaño, SHA-256, versión/base/application_id, método, integridad, relaciones, conteos/huellas por tabla y resultados de migración/rollback/restauración. La ruta exacta y hashes de esta ejecución se entregan al usuario en el informe privado. No se copian respaldos, datos del jugador ni el manifiesto privado al repositorio/documentos públicos.

La raíz nueva tiene ACL privada explícita para el usuario ejecutor, SYSTEM y Administradores. Se configura exclusivamente esa carpeta nueva, no permisos/propietario de las fuentes. Está fuera del árbol OneDrive y del repositorio Git; no se envía nada a nube. Los archivos de respaldo y las copias de ensayo contienen datos reales y deben conservarse con esa protección. No se utiliza TEMP para los respaldos duraderos.

### Ausencia de escritores y método consistente

La consulta inicial CIM fue denegada. Como comprobación alternativa válida se usa Get-Process y luego Process.GetProcesses en la propia herramienta: no aparecen Godot, TwoSides/Two-Sides ni dotnet antes de acceder a fuentes. Si la enumeración falla o detecta esos procesos, la herramienta se detiene sin copiarlas; nunca termina procesos.

Se validan rutas fijas y ausencia de reparse points bajo sus anclas aprobadas. Cada fuente, store.lease y ownership.json se mantiene con FileAccess.Read/FileShare.Read: rechaza escritores existentes y evita nuevos accesos de escritura/reemplazo durante el snapshot. No se toma ni rompe el byte-range lock de aplicación y no se fuerza ningún bloqueo SQLite. Los lectores SQLite usan mode=ReadOnly, pooling=false y cache privado.

Las tres fuentes inspeccionadas NO tenían WAL/SHM/journal y su encabezado indica formato rollback1/1. Se usa Microsoft.Data.Sqlite.SqliteConnection.BackupDatabase, no File.Copy de save.sqlite3. El snapshot de tablas y esquema antes del backup se compara con el respaldo bajo la misma protección de origen; no puede haber commits concurrentes aceptados entre esas lecturas.

Limitación deliberada: si una fuente real tiene sidecars, modo WAL o encabezado desconocido, esta herramienta la omite sin abrir recuperación/checkpoint ni borrar archivos; habrá que preparar otro procedimiento seguro. No se afirma que copiar el archivo principal sea suficiente en ese caso. Una prueba sintética con WAL activo confirma que el mecanismo BackupDatabase incluye transacciones confirmadas en WAL, pero no se usa esa prueba para autorizar cambios de SHM/journal en una fuente real.

### Respaldos y validación obtenidos

Se obtuvieron los tres respaldos consistentes:
- historical-progress: base A de game-progress.
- historical-infrastructure: base B de persistence.
- runtime-game: base C con la partida manual.

Los tres respaldos tienen147.456bytes y esquema base2. Cada uno posee su propio nombre con alias, UTC y UUID y su SHA-256 real en el manifiesto. Un backup SQLite puede cambiar bytes de cabecera respecto al origen; no se exige igualdad del hash físico entre ambos. Sí se comprueba igualdad lógica exacta, application_id, user_version y estructura.

En cada respaldo/copia: PRAGMA integrity_check=ok, foreign_key_check sin filas, todas las tablas y sus definiciones preservadas. Se comparan conteos y hashes SHA-256 de todas las filas, con tipos y duplicados conservados y orden canónico de hashes; no se publican nombres, IDs de jugador/partida ni contenido de filas. El esquema incluye las restricciones/índices definidos en sqlite_master. Esto cubre perfiles, partidas, decisiones, consecuencias, cinco biomas, historial, recibos y snapshots sin revelar sus valores.

### Ensayo aplicado solo a segundas copias

Por cada respaldo se crean, con nombres nuevos sin sobrescribir:
1. rehearsal: recibe la extensión opcional1, conserva base2 y agrega cuatro tablas.
2. failure: prueba una excepción antes del commit y conserva la base original sin datos/DDL parciales.
3. restored: prueba restauración del respaldo hacia otro archivo aislado, sin apuntar a fuente alguna.

El rol Backup solo abre ReadOnly y el migrador de ensayo lo rechaza como destino. Los roles Rehearsal/Failure son los únicos mutables por ese helper; se comprueba raíz de copia, rol, ausencia de enlaces y exclusión de los tres orígenes. Los archivos restored también son de lectura.

No se amplía GameplayEventSchema.MigrateSynthetic ni su tipo SyntheticDatabase. El helper obtiene por reflexión el SQL const exacto de esa versión de biblioteca y verifica SHA-256 contra GameplayEventSchema.Checksum, para no mantener una migración divergente. Aplica ese SQL solo al rol de segunda copia, en transacción inmediata con historial propio; verifica después mediante GameplayEventSchema.Verify. Si el campo o checksum cambia en otra versión, el ensayo requiere revisión; no extrapolar este acceso a producción.

Resultados de los tres ensayos:
- Esquema base2 y application_id conservados.
- Todas las tablas/filas anteriores idénticas por definición, cantidad y huella: no cambian identificadores, decisiones, consecuencias, biomas, partida activa ni resultados históricos.
- Extensión opcional v1 reconocida y sus tablas gameplay_sessions/events/intervals VACÍAS. Solo hay el registro legítimo de migración en gameplay_schema_migrations.
- Segunda aplicación no inserta ni cambia bytes.
- Fallo antes del commit revierte todo; hash físico idéntico en la copia failure y esquema base intacto.
- Copia restored idéntica lógicamente al respaldo. Ningún archivo original se reemplaza.
- GameSaveService y StatisticsService actuales pueden leer perfil, activa, historial paginado, decisiones y progreso; los tres ensayos informan current-local-services-compatible.
- GameplayEventService consulta eventos/sesiones vacíos y conserva duración/muertes desconocidas; StatisticsService sigue devolviendo No disponible para campos no capturados.

No se generan eventos ficticios ni sesiones/intervalos en las copias finales. Las pruebas de escritura de eventos de D.4A no se ejecutan sobre estos datos reales clonados.

### Pruebas y compilación

**9 pruebas nuevas sintéticas aprobadas,0 fallidas**, más tres ensayos completos sobre copias verificadas reales. Las9 comprueban backup lógico, rol de backup no migrable, conservación tras migrar, segunda aplicación, rollback, restauración aislada, rechazo de handle escritor, backup con transacción WAL confirmada y bytes fuente intactos.

Compilación de BackupRehearsal y biblioteca referenciada:0errores/0advertencias, .NET8 con ejecutor self-contained existente. Restore solo desde caché local de paquetes, sin fuentes de red ni cambios de paquetes de producción. Herramienta compilada bajo local-persistence/.work y pruebas en namespaces propios con datos sintéticos. Las pruebas limpian solo sus archivos conocidos bajo la raíz de trabajo verificada, nunca respaldos reales.

Comandos: dotnet restore/build del proyecto backup-rehearsal con fuente local; BackupRehearsal.exe --self-test; ejecución revisada --backup-and-rehearse. No se modifica código compartido: las364 comprobaciones anteriores y las63 advertencias Godot permanecen como evidencia HISTÓRICA, no se presentan como reejecutadas. No era necesario recompilar Godot sin cambios de producción. No se inicia Godot, Node, Atlas o AWS.

### Política de pérdida antes del commit

Un evento queda confirmado cuando su transacción SQLite terminó el commit duradero; un clic/solicitud en memoria no lo prueba. Fallo antes de commit revierte cambios y no puede reconstruirse como evento real al reiniciar. Si se pierde solo la respuesta después de commit, reintentar MISMO ID y payload estable retorna lo existente; otro contenido produce conflicto. Una solicitud de reinicio no equivale a una nueva escena animal confirmada.

Intervalos sin commit son desconocidos, no tiempo medido0; no restar saved_at ni asumir que la sesión siguió jugando hasta descubrir el cierre. Tras crash se conserva el último intervalo duradero y se marca interrupted con duración total desconocida, sin restaurar posición/recursos ni fabricar eventos.

Política recomendada para la futura integración: la telemetría nunca borra ni cambia decisiones/progreso para repararse. Si falla, conservar el error y la intención pendiente con su ID, y marcar cobertura incompleta; buffers acotados y reintentos en su cola, sin crear partidas temporales ni exigir HTTP. No detener ni revertir un commit de gameplay ya confirmado por intentar registrar una métrica independiente. Cuando se necesite atomicidad dominio+evento, diseñarla explícitamente en una fase autorizada antes de conectar ambos; no prometer recuperación de datos que nunca persistieron.

### Procedimiento de restauración y migración runtime futura

El ensayo demuestra restauración hacia archivos nuevos, NO concede permiso para restaurar originales. Ante necesidad futura:
1. Cerrar Godot por acción del usuario, verificar procesos/handles y mantener las fuentes sin escritores; no matar procesos ni manipular WAL/SHM.
2. Seleccionar el backup privado y verificar SHA-256 con manifest.json; repetir integrity_check, foreign_key_check y esquema/application_id.
3. Crear otro respaldo consistente del estado actual antes de cualquier reemplazo, sin sobrescribir respaldos existentes.
4. Obtener autorización que identifique exactamente la base destino y la operación; conservar ACL/propietario y comprobar ownership.json/identidad de archivo.
5. Preferir restauración SQLite hacia el archivo destino existente bajo capacidad validada: los manifiestos OwnedCopyDatabase incluyen FileIdentity. Un reemplazo por rename/copia de archivo nuevo puede romper esa identidad y no debe hacerse como simple receta File.Copy; cualquier ajuste de manifiesto necesita procedimiento y autorización propios.
6. Verificar datos/estructura/compatibilidad y metadatos antes de volver a abrir el juego. No introducir eventos ni tiempos retroactivos al restaurar.
7. Para migración real futura, preparar una API explícita que acepte SOLO el destino runtime autorizado con respaldo/recuperación verificados. Repetir esta validación y confirmar guardas in situ; aplicar extensión en transacción, releer invariantes y conservar respaldo intacto. No ampliar por inferencia la capacidad MigrateSynthetic.

Riesgos restantes: crecimiento y retención de respaldos privados, disponibilidad de almacenamiento, cambio de esquema/SQL entre compilaciones, modo WAL futuro que exige un plan distinto, datos no confirmados antes de crash y validación completa del proveedor runtime/identidad tras una futura escritura. No eliminar respaldos para liberar espacio sin autorización.

Integridad final:1.547 archivos protegidos sin cambios de tamaño/SHA-256/fecha; los9 archivos originales de bases/manifiestos/leases permanecen intactos. La propia herramienta verifica además hash/tamaño/mtime y huella de ACL/propietario de cada base antes/después bajo protección de lectura. .env278bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, sin leer valores ni copiar credenciales/cambiar permisos. Riesgo ACL de B00 pendiente.

Siguiente subfase recomendada: autorizar explícitamente una migración runtime controlada, usando estos respaldos y procedimiento, antes de integrar capturas de Godot. No se migra ninguna base real, no se conecta evento, gameplay, CompleteBiome/finales o B05. Trabajo detenido al terminar D.4A.1.

## B04.2B.2B.2D.4A.2 — Migración runtime controlada (2026-10-26 Guatemala)

**COMPLETADA. Validación manual Godot pendiente; eventos NO conectados.** Operación real:2026-10-27T05:40:22Z (2026-10-26 23:40:22 Guatemala). Único archivo de datos migrado: local-persistence/.work/runtime-game/save.sqlite3 de la copia Two-Sides PRUEBA. No se modificaron las dos bases AppData.

### Guardas y respaldo

Se verificó ausencia de Godot/TwoSides/dotnet/ejecutores de pruebas; no se cerró ni terminó ningún proceso. La ruta absoluta se compara con una constante autorizada y CopyGameDatabase.RuntimePath. Los handles WindowsGuard existentes se reutilizan por reflexión desde la herramienta aislada: rechazan reparse/hardlinks, validan ruta final y conservan directorios/archivo contra rename/delete. La identidad nativa se comparó con ownership.json (formato/copia/purpose/Ready/FileIdentity), sin mostrar datos personales.

Se adquirió exclusión en store.lease existente, sin cambiar sus bytes; ownership.json permaneció en lectura y el archivo runtime se mantuvo con deny-write hasta la fase final de migración. Sin WAL/SHM/journal; encabezado rollback válido. Se verificaron espacio libre para respaldo/recuperación, application_id runtime0x54535254, base2, integridad y FK; no había extensión previa.

Se verificó hash del manifiesto D4A1 y respaldo de referencia (7D791333A03326FF2A4E91DEA0E1BCF5F9F40A8C0D0DB6BA34365305C33A5E0D), origen correspondiente, esquema/integridad y compatibilidad. No se asumió que fuera el estado actual: el snapshot lógico actual se comparó independientemente.

Se creó nueva carpeta privada %LOCALAPPDATA%/TwoSides/PrivateBackups/D4A2/20261027T054022Z-3618aa339d9e475ea5275d38ced08d43, fuera de OneDrive/Git. Contiene before.json, after.json y respaldo runtime-immediate-20261027T054022Z-43f00cb0f53a4f7ea5b788304fbfed38.backup.sqlite3, más ensayos aislados. No se sobrescribió ningún respaldo anterior. ACL privada únicamente en la nueva carpeta; no se cambia seguridad de fuentes.

BackupDatabase capturó un snapshot consistente actual, validado contra todas las tablas/filas/restricciones/índices mediante conteos y huellas canónicas, sin publicar nombre/decisiones del usuario. SHA-256 del respaldo inmediato:
7D791333A03326FF2A4E91DEA0E1BCF5F9F40A8C0D0DB6BA34365305C33A5E0D.
Coincide con el anterior como resultado observado, no como precondición supuesta.

El ensayo final migró SOLO una segunda copia del respaldo nuevo; validó base2/extensión1, integridad/FK, conservación exacta de tablas/datos anteriores, consultas de GameSaveService/StatisticsService/GameplayEventService, segunda aplicación byte-idempotente, fallo simulado con rollback completo y restauración hacia otro archivo aislado. No eventos ficticios en copias finales.

### Migración y resultados

La herramienta usa el SQL const del migrador versionado existente, verifica su checksum y aplica la misma función de ensayo/transacción a un gate runtime nuevo, limitado a una apertura de escritura. No se modifica ni amplía GameplayEventSchema.MigrateSynthetic. Se permite esta ruta especial solo por la autorización expresa D4A2; no constituye migración automática del runtime al arrancar.

Justo antes de escribir se revalidaron hash/metadatos originales y procesos. Dentro de la transacción inmediata se comparó nuevamente el snapshot base, se aplicaron las cuatro tablas de extensión y se compararon todos los datos base ANTES del commit. Ante error la transacción se revierte; el helper registra stopped.json y nunca restaura automáticamente ni reintenta una escritura desconocida.

Resultado:
- Antes: base v2, sin extensión.
- Después: base v2, extensión opcional v1; mismas diez tablas originales y cuatro adicionales.
- integrity_check=ok y foreign_key_check vacío.
- Perfil, partida actual, historial, IDs, decisiones, consecuencias, cinco biomas, recibos y snapshots iguales al respaldo inmediato.
- Nuevas tablas de sesiones/eventos/intervalos vacías; solo registro real de migración.
- Consultas actuales y nuevas compatibles; métricas históricas no convertidas en0.
- Identidad nativa, propietario/ACL y manifiesto de ownership conservados; no sustitución del archivo.
- SHA-256 runtime anterior:8CC18BE48074E0F91A99E39801E2CA41276192EAD0553DBFE9AA5A48AE28971C.
- SHA-256 runtime posterior:83BD0E4D27ADE3E5CA778233E59456B6CB6CAF04A3608ED92BF07B8F6D790E07.
- SHA-256 after.json:EE2E37A18E3DE2C1FC9EE3B93A27E2B5F93935136C2A2CA1FF9403E9F867246F.

### Código, pruebas y seguridad

Único archivo de herramienta modificado: local-persistence/backup-rehearsal/Program.cs.txt; añade gate runtime fijo, validación del respaldo, identidad/lease, ensayos, manifiestos y modo --migrate-runtime-controlled. No cambia biblioteca/migrador/repositorios de producción ni adaptador runtime. Se actualizan solo estos cinco documentos de D4A2. El segundo adjunto del usuario mantiene las mismas condiciones del primero.

Compilación del helper y biblioteca referenciada:0errores/0advertencias tras corregir una nulabilidad detectada durante preparación; ningún acceso de escritura runtime ocurrió durante esa compilación fallida. **15 comprobaciones sintéticas aprobadas,0 fallidas**:9 de backup/ensayo previas reejecutadas y6 de path/identidad/ownership, verificación intra-transacción/rollback, conservación de identidad/ACL con DDL y respaldo nuevo independiente de referencia anterior. Además ensayo y verificaciones efectivas en la copia y runtime autorizada. No se presentan las364 pruebas previas como reejecutadas ni las63 advertencias históricas Godot como build nuevo: no cambió código de Godot.

Comandos: build --no-restore del helper; --runtime-migration-self-test; única ejecución revisada --migrate-runtime-controlled. No Godot/Node/Atlas ni gameplay ejecutados, no captura ni CompleteBiome/finales/B05.

Integridad final:1.547 archivos protegidos sin cambios de hash/tamaño/fecha; ocho archivos protegidos de almacenes (las dos bases AppData y manifiestos/leases de las tres) intactos. Runtime SQLite excluida expresamente de esa igualdad porque fue el único dato autorizado a cambiar; sus invariantes se verifican separadamente. .env278bytes,SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, sin leer valores ni cambiar permisos/propietario. Riesgo ACL de B00 pendiente.

### Recuperación y siguiente paso

No se necesita recuperación y no se efectuó ninguna. Si aparece un fallo después: detener juego/escritores por acción del usuario, preservar runtime/manifiestos/sidecars y diagnóstico; verificar hashes del respaldo y after.json, integridad/compatibilidad en otra copia. Cualquier restauración requiere autorización adicional que nombre destino y respaldo. No sustituir por rename/File.Copy: ownership.json referencia identidad de archivo; preferir procedimiento SQLite in-place validado que conserve identidad/seguridad. Crear antes otro respaldo del estado a reemplazar y ensayar restauración aislada. No reintentar esta migración sobre runtime ya extendido: el gate la rechaza.

Riesgos pendientes: prueba manual del videojuego tras migrar, pérdidas de eventos anteriores al commit, política de fallos/cobertura, origen de reloj y retención antes de captura. La pantalla sigue mostrando No disponible para datos no capturados; no hay eventos históricos reconstruibles.

Siguiente recomendación: validar manualmente continuidad/estadísticas actuales y luego autorizar por separado la conexión de eventos/intervalos al adaptador/observador único de Godot, usando IDs estables y diferenciando solicitudes de reinicios confirmados. D4A2 termina aquí: no conectar eventos, no gameplay, no CompleteBiome/finales ni B05.

## B04.2B.2B.2D.4B — Captura local Godot y tiempo efectivo (2026-10-27 Guatemala)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** El usuario confirma D4A2 con14/14 comprobaciones manuales, base runtime2+extensión1 y gameplay sin errores nuevos. Esta fase conecta únicamente captura local; no modifica la pantalla Estadísticas ni su contrato histórico No disponible.

### Inventario exacto y arquitectura

Producción: integration/sqlite/LocalGameplayObserver.cs nuevo; integration/sqlite/GamePersistenceAdapter.cs; integration/sqlite/GamePersistenceContext.cs; scripts/AnimalSegmentFlow.cs; assets/sprites/ui/MenuPausa.cs; assets/sprites/ui/GameOver.cs; scripts/MenuPrincipal.cs (solo salida normal). Pruebas: GameplayObserverChecks.cs.txt nuevo, dispatcher GameSaveChecks.cs.txt y Compile del observador puro en GameSave.Checks.csproj. Nueve documentos indicados en D4B actualizados. Total19 archivos.

No se modifican LocalGameState, StatisticsService/pantalla, biblioteca/esquema de eventos, relojes de recursos, actores/daño, NPC, escenas, project.godot, TwoSides.csproj, FinNivel ni finales. Los personajes y ZonaMuerte ya convergen en GameOver.MostrarDerrota; no se añaden señales ni hooks duplicados en cada animal. El observador vive como objeto C# poseído por GamePersistenceContext existente (hijo de GameApplicationContext), no como otro Autoload/Node/escena.

IGameplayTelemetryStore expone solo ReadSessionsAsync, WriteEventAsync, WriteIntervalAsync e InterruptAsync. GamePersistenceAdapter los implementa con su misma cola SemaphoreSlim/worker Task.Run y GameplayEventService lazy sobre el ISaveDatabase que ya posee. No hay SQL en escenas, conexión paralela ni migración automática; si falta la extensión o almacenamiento, falla solamente telemetría con código seguro. El servicio se invalida al cerrar/disponer el adaptador.

LocalGameplayObserver recibe ese puerto, reloj monotónico/UTC y diagnóstico inyectables. Todas las notificaciones Godot son síncronas en memoria y no esperan escrituras para permitir gameplay. La FIFO serial conserva comandos tipados inmutables, IDs y payloads para reintentos; GameSaveService/decisiones no se invocan desde su interfaz. El drenaje de I/O usa el worker ya existente.

### Capturas reales conectadas

| Acontecimiento | Punto de captura nuevo | Semántica y dedupe |
|---|---|---|
| SESSION_STARTED | GamePersistenceContext._Process cuando State.Ready tiene perfil local; Telemetry.InitializeAsync | Una inicialización por contexto/ejecución; SessionId UUID estable, evento offset0. No exige partida ni crea una |
| SESSION_ENDED normal | GamePersistenceContext.QuitAsync por notificación de cierre de ventana y MenuPrincipal.Exit | Cierra último intervalo y encola un único cierre. AutoAcceptQuit=false permite intentar flush; sin nuevo autoload |
| Cierre inesperado anterior | InitializeAsync consulta sesiones abiertas y encola InterruptAsync antes del nuevo inicio | Identificador/UTC de descubrimiento conservados; offset duradero existente, ended_at desconocido; no inventa cierre normal |
| ANIMAL_SEGMENT_STARTED | AnimalSegmentFlow.ValidateLocalCore tras guard local satisfactorio y restauración de pausa; context.AnimalStarted | Una vez por ID de instancia de escena, no por cada FinNivel; el contexto difiere el registro si aún se inicializa telemetría. RunId=EventId UUID |
| ANIMAL_DIED | GameOver.MostrarDerrota después del primer _mostrado | Una derrota por run. Causa Unknown, porque Die y ZonaMuerte no propagan causa tipada; no inferir daño/caída ni modificar actores |
| ANIMAL_RESTART_REQUESTED | MenuPausa.ReiniciarNivel tras guards de doble clic/transición | Solicitud voluntaria, una por run; no se cuenta como muerte ni éxito de carga |
| ANIMAL_RETRY_REQUESTED | GameOver.Reintentar tras sus guards | Requiere derrota conocida en el run; solicitud distinta de muerte. No genera segunda muerte |
| ANIMAL_SEGMENT_EXITED | AnimalSegmentFlow.ReturnToLevelsLocalAsync solo tras ChangeSceneToPacked exitoso; detección secundaria de escena distinta en contexto | Una salida por run, no duplica notificaciones. No checkpoint ni CompleteBiome |
| Intervalos efectivos/pausa | _Process del contexto, MenuPausa.AbrirMenu/CerrarMenu y pérdida de foco de aplicación | Cambio de clasificación cierra intervalo anterior antes del siguiente |

La nueva entrada validada del animal es el único dato que confirma una instancia nueva realmente lista. La solicitud de reinicio/reintento permanece separada; una navegación fallida no agrega otro ANIMAL_SEGMENT_STARTED. ANIMAL_SEGMENT_COMPLETED no se emite, y meta física sigue sin integración local.

Los helpers de navegación solo añaden notificaciones Loading/Leave/NavigationFailed; sus validaciones, escenas, ambientes, pausas y resultados originales se conservan. Telemetría no participa en AnimalSegmentFlow.IsBlocking ni en guards de progreso. No se solicita HTTP ni sesión remota en estas rutas.

### Sesión, reloj e intervalos

Se reutiliza GameplayMonotonicClock (Stopwatch), sin modificarlo: origen nuevo por observador, offsets enteros en milisegundos; UTC solo identifica momentos de eventos. No se resta saved_at ni UTC para duración. Una partida puede tener múltiples sesiones y múltiples runs; cambiar menú/bioma, pausar o morir no crea otra partida ni sesión.

El contexto usa ProcessMode.Always para observar pausa. Cuando la instancia validada sigue vigente, sin bloqueo/transición, sin pausa y con foco, clasifica ActiveAnimal. Paused/GameOver/Loading/Background/Menu no suman efectivo. No se habilita ActiveHuman: su definición y punto listo todavía necesitan una fase explícita; diálogos/menús/estadísticas se excluyen conservadoramente.

Cambio de estado: confirma [boundary,now) del estado anterior y cambia el límite en memoria, sin solapamiento. Muerte cierra activo inmediatamente y pasa a GameOver. Solicitud de reinicio/reintento pasa a Loading; nuevo guard confirma otro run. La pérdida de foco tiene notificación inmediata, además de WindowIsFocused en el muestreo. Los demás estados se contrastan cada frame con SceneTree.Paused, CurrentScene y Transicion.Ocupado.

Cadencia adoptada a partir de la propuesta documentada5s: heartbeat cada5.000ms cierra subintervalos del estado actual, incluidos menú/pausa para cobertura observada. No escribe cada frame ni crea timers de escena; intervalo inmutable con mismo ID se reintenta sin sumar dos veces. Una caída entre confirmaciones puede perder el último intervalo y cualquier cola aún no persistida;5s es la cadencia objetivo durante ejecución normal, no una garantía dura bajo I/O fallido o suspensión del proceso.

Sesión normal: el cierre de ventana y botón Salir intentan completar inicialización/cierre/flush durante máximo3s. El límite incluye inicialización y cola lenta. Si no termina o hay fallo, diagnóstico TELEMETRY_CLOSE_TIMEOUT/FAILED/INCOMPLETE, se permite salir y queda solo lo duradero. Cierre forzado/editor kill/OS crash no se presenta como normal; al siguiente arranque las sesiones abiertas se sellan interrupted hasta su límite confirmado.

_ExitTree mantiene el cierre del adaptador/State existente, no intenta inventar tiempo después de destruir el árbol. La cola usa el mismo gate del adaptador y puede rechazar STORAGE_CLOSED al salir; ese dato no se declara persistido. No se ejecuta gameplay ni motor por Codex.

### Idempotencia y errores secundarios

SessionId/EventId/IntervalId son UUIDv4 generados una vez al capturar intención/límite. Las clausuras de la cola conservan todo el DTO (incluida UTC) durante retry. El run conserva HashSet de kinds enviados; la instancia conserva sceneToken; los controles mantienen _saliendo/busy. Los servicios existentes añaden claves naturales de sesión/run y digest conflictivo: no se sobrescribe un ID contradictorio.

FIFO: intervalos anteriores se confirman antes del evento que termina el run; las siguientes escrituras esperan detrás del comando pendiente para no invertir offset/durable boundary. Respuesta perdida después de commit se reintenta con DTO idéntico y devuelve recibo ya existente; no se alteran recibos de decisiones.

Errores transitorios IO_ERROR/STORAGE_BUSY/DISK_FULL/ACCESS_DENIED/TELEMETRY_WRITE_FAILED conservan la cabeza e intentan nuevamente al muestrear tras5s; nuevas transiciones pueden disparar otro drenaje idempotente. Un conflicto/contrato/esquema incompatible desactiva SOLO captura, marca Incomplete y avisa código local. Inicialización fallida queda diagnosticada y sin captura hasta otra ejecución. Cola máxima2.048 comandos; al llenarse se desactiva captura y conserva datos ya confirmados, sin consumir memoria sin límite ni bloquear juego.

Diagnóstico [Local telemetry] seguido solo de código tipado, sin nombres, IDs, rutas, credenciales o payload. Las fallas no se ocultan en la cobertura. Observador antes de estar listo marca TELEMETRY_NOT_READY_COVERAGE y no inventa actividad previa; el contexto puede iniciar captura del animal aún vigente cuando el observador esté disponible, con cobertura desde ese momento.

Caso conservador de reinicio fallido: la solicitud persistida cierra el run según el contrato existente. No se fabrica un nuevo inicio en la misma instancia ni se sigue sumando activo después de ese cierre; se diagnostica TELEMETRY_FAILED_RESTART_COVERAGE y queda una laguna hasta entrada nueva válida. El juego conserva la escena y recursos; la estadística incompleta no lo bloquea. Reintentar la misma solicitud conserva su identidad lógica. Una salida real posterior puede cerrar navegación sin duplicar la muerte.

Limitaciones explícitas: suspensión abrupta del OS sin notificación de foco/ciclo de vida y bloqueos largos del hilo principal requieren validación runtime de la cobertura temporal; no se afirma exactitud de muestreo que no se midió. Sin una transacción de dominio+evento común, caída antes del commit puede perder la notificación; jamás se reproduce una decisión o navega otra vez para reparar telemetría. No hay outbox/ACK ni envío remoto.

### Pruebas y compilación

**395 comprobaciones C# aprobadas, cero fallidas:**31 nuevas observador +41 servicios eventos +24 pantalla +39 consultas +19 Game Over/navegación +21 reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las364 regresiones se reejecutaron, sin contar pruebas repetidas ni los ensayos de migración como una nueva suite completa.

Las31 nuevas usan reloj manual y GameplayEventService/SQLite real sobre bases sintéticas migradas. Cubren inicio único, perfil sin partida, sesiones sucesivas, cinco biomas, misma instancia/doble señal, muerte/request/retry separados, navegación fallida, salida duplicada, pausa/reanudar/menús/Game Over/carga/foco, heartbeat5s, tiempo por bioma, SQLite fallido/respuesta perdida/worker lento, cierre normal/abrupto, duración desconocida, conservación del agregado principal completo y sin nueva partida, identidad inválida y bindings C# sin capacidad de RecordDecision/CompleteBiome/HTTP.

Los tests del observador puro no ejecutan SceneTree, señales Godot, render, notificaciones de ventana ni frames reales; esos hooks se compilan e inspeccionan y requieren validación manual. Las fixtures usan local-persistence/.work/databases/<UUID>, nunca las tres bases duraderas. Regresiones de servicios incluyen stress40 sesiones/1.280 eventos. No se modifica esquema en esta fase ni se migran fuentes reales.

Comandos: build --no-restore de GameSave.Checks.csproj, --gameplay-observer y once modos seguros previos, local-persistence/run-checks.ps1. Biblioteca/ejecutores0errores/0advertencias. Rebuild completo TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild, GodotProjectDir hacia integration/sqlite/.work/:0errores,63 advertencias históricas ParallaxBackground,ninguna nueva. MSBuild89 fuentes, una referencia a biblioteca, cero fuentes backend/tests filtradas. Sin cambios de project.godot/TwoSides.csproj, sin restore de paquetes ni Node/Godot/Atlas.

### Integridad y guía manual

Comparación final:1.538 archivos protegidos con tamaño/SHA-256/fecha idénticos, incluidos biblioteca/esquema/StatisticsService/pantalla, escenas, personajes/recursos/biomas, FinNivel/finales y configuración. Los9 archivos de las tres bases/manifiestos/leases permanecen idénticos: la runtime2+extensión1 NO fue usada por las pruebas ni recibió eventos ficticios. Solo cuando el usuario ejecute Godot se producirán eventos reales. .env278bytes,SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, verificado separadamente antes/después sin valores/credenciales ni cambios de propietario/ACL. Riesgo ACL de B00 pendiente.

Guía manual propuesta:
1. Abrir esta copia sin Node/internet, usar perfil/partida existentes; no crear otra partida para probar captura. Confirmar consola sin nuevos errores y ausencia de HTTP.
2. Entrar a cada bioma decidido en orden libre; jugar más de5s, pausar más de5s, reanudar, perder y esperar en Game Over. El personaje/ambiente/recursos se comportan igual; no tomar otra decisión.
3. Reintentar y reiniciar voluntariamente, también doble clic. Debe haber una sola transición, misma elección y recursos iniciales existentes. Una solicitud no se etiqueta como carga exitosa hasta nuevo guard.
4. Ir a menú de niveles y principal/Estadísticas, esperar y volver. Esos tiempos no son efectivos animales. La pantalla conserva su diseño y seguirá mostrando No disponible para métricas no expuestas por StatisticsService; no se cambió para mostrar la nueva captura.
5. Salir por botón y cerrar por ventana; en una fase técnica autorizada consultar sesiones/events/intervals reales y cobertura para comprobar una sesión por ejecución, cierres normales, ausencia de duplicados y pausas fuera de efectivo. Sin volcar nombres/decisiones al reporte.
6. Probar foco/suspensión y cierre inesperado solo con aceptación de la posible pérdida de cola no confirmada; al abrir, esperar interrupted, no duración ficticia. No dañar la base ni bloquearla para probar errores: esos casos son sintéticos.
7. Cualquier diagnóstico [Local telemetry] significa posible cobertura incompleta, nunca permiso de borrar/reinicializar datos. Aportar código/traza sin secretos y acción que lo produjo.

Siguiente paso recomendado: validación runtime de captura/tiempos/cierre y revisión técnica readonly autorizada de eventos reales; después, otra fase para exponer métricas con cobertura en Estadísticas. No agregar ahora UI, CompleteBiome, finales, checkpoints, Atlas/AWS o B05. Trabajo detenido al terminar D4B.

## B04.2B.2B.2D.4C — Verificación real y actividad visible (2026-10-27 Guatemala)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME DE LA VISTA PENDIENTE.** El usuario informa D4B15/15 comprobaciones manuales satisfactorias y sin errores nuevos. No se asumen conteos exactos de esas acciones: esta fase audita lo efectivamente persistido.

### Etapa A superada antes de editar producción

Se verificó Godot/ejecutores cerrados. Herramienta temporal bajo local-persistence/.work/event-audit (ignorada por Git) compilada con biblioteca existente y caché local; no se incorpora otro sistema de producción. Ruta única runtime fija; sin reparse points bajo raíz, sin WAL/SHM/journal. FileAccess.Read/FileShare.Read sobre base y lease impide aceptar escritores durante la lectura. SQLite mode=ReadOnly, pooling=false y query_only=ON. No se usa OpenRuntimeOrCreate, ni inicialización/migración/recovery/checkpoint. Si aparecen procesos o sidecars, se detiene la inspección.

GameplayEventSchema.Verify, GameSaveService, StatisticsService y GameplayEventService se usan como APIs reales; SQL parametrizado/constante de solo lectura complementa comprobaciones de intervalos y coherencia no expuestas en API pública. integrity_check=ok, foreign_key_check sin filas, base2+extensión1. No se imprimen perfil, nombre, decisiones personales ni IDs de jugador/sesión.

Resultados reales anonimizados, antes y después de integrar consultas:
- Sesiones:3 registradas,3 cerradas,0 interrupted,0 abiertas.
- SESSION_STARTED3 y SESSION_ENDED3.
- ANIMAL_SEGMENT_STARTED7, ANIMAL_DIED3, ANIMAL_RESTART_REQUESTED1, ANIMAL_RETRY_REQUESTED1, ANIMAL_SEGMENT_EXITED7.
-81 intervalos confirmados.
- Tiempo efectivo total confirmado:37.614ms (37.614 segundos).
- Partida actual por bioma: ocean9.946ms, jungle18.348ms, desert9.320ms; forest/tundra sin intervalos registrados (null, no0).
- Tiempo registrado no efectivo por clasificación: Background43.549ms, GameOver5.669ms, Loading3.848ms, Menu48.191ms, Paused7.396ms.
- Incomplete=false para esas sesiones cerradas y cobertura registrada; HistoricalCoverageUnknown=true.

Las cifras de milisegundos usan punto como separador de miles en esta lista salvo el equivalente en segundos expresado explícitamente. La UI formatea segundos con tres decimales y punto decimal invariante, por ejemplo37614ms→37.614 s confirmados.

Cero duplicados de EventId o clave idempotente, solapamientos entre intervalos de una sesión, tiempos negativos, asociaciones animales inválidas, más de una sesión abierta, solapamientos de sesiones cerradas según UTC, tiempo activo posterior a muerte/salida/request, retry sin muerte previa o intervalos fuera del límite de sesión. La comparación temporal UTC es comprobación orientativa, no reloj usado para acumular duración.

Los eventos SESSION_* por contrato no pertenecen a una partida; no se consideran referencias faltantes. Todos los eventos animales tienen GameId/BiomeId válidos y canónicos y vínculos de sesión/run válidos. No hay eventos de finalización falsa. No hay obligación de que forest/tundra tengan tiempo si no se dispone de un registro de acciones del usuario que lo exija: se informa ausencia, no se fabrica cobertura.

Comparación adicional de dominio contra el respaldo inmediato D4A2, cuyo hash se verifica: perfiles, partidas, biomas, decisiones, consecuencias, snapshots y local_operations idénticos por filas/huellas canónicas. Así se comprueba que la captura no alteró datos anteriores, sin publicar los valores. Lecturas repetidas conservan hash/tamaño/mtime de runtime.

La auditoría confirma coherencia estructural y persistencia, no demuestra por sí sola cada segundo de pausa del motor. Esa exclusión se apoya en tests del observador y prueba manual. No se comparan conteos contra cantidades de acciones nunca aportadas. La etapa B solo comenzó tras AuditPassed=true.

### Cambios de etapa B

Producción: local-persistence/src/StatisticsModels.cs.txt, StatisticsRepository.cs.txt, StatisticsService.cs.txt e integration/sqlite/LocalStatisticsScreenState.cs (formateador existente). Pruebas: nuevo ActivityStatisticsChecks.cs.txt y dispatcher GameSaveChecks.cs.txt. Documentación: siete documentos autorizados. Total13 archivos. La herramienta temporal solo vive en .work y es de lectura.

No se cambian adaptador, controlador visual de nodos/scroll, observador, servicios de escritura, esquema/migración, gameplay, pausa/Game Over, FinNivel, finales, proyectos ni escenas. La sección nueva se agrega al texto plano existente; no se duplican nodos ni se crea otra pantalla.

StatisticsRepository.Activity reutiliza GameplayEventRepository dentro de la MISMA transacción UnitOfWork.Read que el resto del resumen, con carga cacheada por consulta. Comprueba presencia/versión de extensión y no la crea si no existe. Se reutilizan Sessions/Events/Intervals y los filtros de dueño existentes; no se encadenan varias APIs que abrirían snapshots diferentes. Las colecciones completas evitan truncamiento.

Contratos añadidos como propiedades opcionales para compatibilidad:
- PlayerStatistics.Activity: cobertura local de todas las sesiones registradas.
- PlayerStatistics.HistoricalActivity: solo registros vinculados a partidas no actuales.
- GameStatistics.Activity: solo eventos/intervalos de ese GameId.
- ActivityStatistics: Sessions, Deaths, RestartRequests, RetryRequests, EffectiveMs, ByBiome, Incomplete e HistoricalCoverageUnknown.
- BiomeActivityStatistics: BiomeId y EffectiveMs tipado StatisticCount.

No se cambia Uncollected del contrato previo para reinterpretar datos históricos; la vista elige Activity cuando hay sesiones registradas y conserva el estado anterior si no hay captura. Los tres alcances aparecen con títulos distintos. Una sesión puede participar en varias partidas: sus conteos por game/historia no son aditivos; el total local cuenta cada SessionId una vez, y los intervalos efectivos no se suman dos veces.

Disponibilidad:
- Sin extensión: NotAvailable/null, no se migra.
- Extensión sin captura o bioma sin intervalos: NoData/null («Sin datos»), más aviso de actividad histórica desconocida.
- Run con cobertura y ningún evento de un tipo: Available0 representa cero SOLO en cobertura registrada, no cero histórico de toda la vida.
- Intervalo confirmado0..0: tiempo Available0.
- Sesión abierta/interrupted o intervalos faltantes: muestra únicamente suma duradera y aviso Incomplete; no se extrapola hasta la consulta ni se cierra/repara la sesión.
- HistoricalCoverageUnknown siempre verdadero: la actividad anterior al inicio de instrumentación no puede reconstruirse.

Tiempo efectivo suma solo ActiveAnimal/ActiveHuman ya confirmados; las pausas, menús, carga, fondo y Game Over no se añaden. El observador actual solo emite ActiveAnimal, no se inventan intervalos humanos. Fechas de partida/attempt_number no se usan como contadores o duraciones.

La UI mantiene perfil, decisiones, progreso, consecuencias, partida actual, historial y scroll. Añade «ACTIVIDAD LOCAL CONFIRMADA», actividad de cada partida y resumen histórico, sesiones, segundos efectivos, cinco subtotales, muertes y solicitudes confirmadas de reinicio/reintento. Las etiquetas dicen solicitudes: no se presentan como transiciones exitosas. Se conserva la advertencia de cobertura anterior desconocida y otra de incompleta cuando corresponda.

Abrir/reabrir Estadísticas conserva el flujo de una consulta asíncrona por apertura/retry, texto plano sin BBCode/IDs sensibles y retorno al menú. No registra sesiones/eventos ni fuerza flush por consultar. El observador independiente ya existente puede confirmar su heartbeat real de estado Menu mientras el usuario está allí; ese tiempo no es efectivo y no es una escritura provocada por la consulta.

### Pruebas y compilación

**418 comprobaciones C# aprobadas, cero fallidas:**23 nuevas actividad +31 observador +41 eventos +24 pantalla +39 consultas +19 Game Over/navegación +21 reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las395 anteriores se reejecutan.

Las23 nuevas cubren historia sin extensión/captura, sesión cerrada/abierta/interrupted, varias sesiones, muerte distinta de retry y request, evento repetido idempotente, exclusión de pausa/menú/fondo/derrota/carga, cinco subtotales y suma total, cero medido vs ausencia, sesión sin actividad animal, scopes activo/histórico, readonly/bytes/fechas/decisiones/ambiente intactos, etiquetas/formato, esquema incompatible controlado y rechazo de solapamiento. Los tests anteriores de pantalla cubren apertura, retorno, doble clic, ausencia de nodos duplicados por binding/diseño y error local. No se afirma ejecución de escenas ni señales reales.

Fixtures independientes bajo local-persistence/.work/databases/<UUID>; ninguna prueba usa la runtime como fixture. La auditoría de lectura real es una etapa distinta de la suite sintética. Se recompiló el helper de auditoría con las consultas nuevas y se verificó que coinciden con GameplayEventService en sesiones, muertes, requests y tiempo total reales. No se usa la lectura para escribir registros.

Comandos: build --no-restore de GameSave.Checks.csproj; --activity-statistics y doce modos seguros anteriores; local-persistence/run-checks.ps1. Biblioteca/ejecutores0errores/0advertencias. Rebuild completo TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild con GodotProjectDir hacia integration/sqlite/.work/:0errores,63 advertencias históricas ParallaxBackground,ninguna nueva. Sin Godot, Node.js, Atlas, nuevas dependencias o modificaciones a proyectos de producción. Herramienta temporal restaurada solo desde caché local.

### Integridad, limitaciones y validación

Antes de editar producción se registró inventario de1.558 archivos (todo excepto .env); tras fijar los archivos autorizados de etapa B se conserva manifiesto de1.546 archivos protegidos idénticos antes/después. Los9 archivos de las tres bases/manifiestos/leases permanecen idénticos en hash/tamaño/fecha; la runtime NO fue alterada por Codex. Los respaldos solo se leyeron, sin sobrescribirlos. .env278bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, sin valores ni cambios de permisos/propietario. Riesgo ACL de B00 pendiente.

Limitaciones: cobertura histórica desconocida, solicitudes distintas de éxito de navegación y errores de captura que pueden dejar lagunas; sesiones abiertas al consultar mientras se juega se marcan incompletas hasta cierre. Volumen grande materializa colecciones y texto, optimización futura posible. La auditoría actual no atribuye una ausencia de intervalos a fallos sin una secuencia esperada conocida. No se corrigen registros reales, no se rellena tiempo ni se modifica captura.

Guía manual: abrir juego sin internet/Node; Estadísticas debe conservar secciones previas y scroll y mostrar nueva actividad local. Comprobar valores confirmados y advertencias; al ejecutar una sesión nueva pueden cambiar respecto al snapshot auditado, por lo que no exigir las mismas cifras exactas. Jugar/pausar/morir/reintentar/reiniciar, volver a Estadísticas y comprobar aumento razonable de tiempo activo y eventos distintos. Tiempo de menús/pausa no debe sumarse como activo; puede tardar hasta heartbeat/cambio de estado en aparecer lo confirmado. Cerrar normalmente y reabrir debe conservar registros sin duplicarlos. No cambiar decisiones ni borrar bases para probar. Anotar acciones/duraciones aproximadas para investigar discrepancias; aportar consola sin secretos si falla.

Siguiente paso recomendado: validación manual de la vista/alcances y captura real con secuencia registrada. Cualquier corrección de observador/escritura requiere autorización distinta; no se cambia aquí. No CompleteBiome, finales, Atlas/AWS ni B05. Trabajo detenido al terminar D4C.


## B04.2B.2B.2E.1 — Auditoría de metas y finales (2026-10-27)

Se inspeccionaron las cinco metas, actores, navegación, servicios SQLite, contexto, observador y finales, contrastando los trece documentos requeridos. Creados los tres informes E.1; actualizados únicamente PHASES, PHASE_HISTORY y DECISIONS. Revisión estática, sin compilación ni pruebas nuevas; 418 pruebas y 15/15 manuales son antecedentes D4C confirmados por el usuario. Manifiesto de 1.556 archivos protegidos y nueve archivos de bases/manifiestos/leases idénticos en hash/tamaño/fecha. .env: 278 bytes, SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, sin lectura de valores. Sin cambios de ACL/propietario; riesgo B00 pendiente. Sin Godot, Node, CompleteBiome, Atlas, AWS ni B05. Trabajo detenido tras documentación.


## B04.2B.2B.2E.2A — Finalización local (2026-10-27)

Estado: **COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE**. Quinta finalización individual implementada; **PENDIENTE DE FINAL GLOBAL**. Esta actualización sustituye las descripciones E.1 de “operación local no implementada” exclusivamente para completion. No implementa evaluación, presentación ni cierre global.

### Archivos y contrato
Producción modificada:
- scripts/FinNivel.cs: señal BodyEntered, comprobación de instancia y tipo PlayerDelfin/PlayerMono/PlayerRataCanguro/PlayerZorro/PlayerOso bajo el nodo canónico de la escena, grupo jugador, vida positiva, entrada local validada, escena/enum coherentes y reserva física diferida. Cargar una escena no invoca CompleteBiome; no hay barrido de cuerpos ni finalización en Ready.
- integration/sqlite/LocalGameState.cs: ILocalCompletionStore, LocalBiomeCompletion y LocalCompletionResult dentro del archivo existente; CompleteAnimalAsync y coordinación con Busy/HasPendingWrite. Se evitó crear otro archivo de producción o cambiar proyectos.
- integration/sqlite/GamePersistenceAdapter.cs: implementa únicamente el puerto ILocalCompletionStore; CompleteBiomeAsync conserva su implementación/transacción existentes.
- scripts/AnimalSegmentFlow.cs: rama completion local, modal de confirmación/error/reintento, notificación secundaria y retorno privado a selección confirmado.
- integration/sqlite/LocalGameplayObserver.cs: CompletionConfirmed, con EventId igual a OperationId confirmado, asociado a sesión/run/partida/bioma existentes.
- scripts/MenuNiveles.cs: mensaje explícito de cinco completados/final global pendiente en el label existente.

Pruebas: local-persistence/game-save-tests/LocalBiomeCompletionChecks.cs.txt (nuevo) y GameSaveChecks.cs.txt (dispatcher --biome-completion y --completion-probe). Sin cambios a tarjetas, escenas, personajes, recursos, VariablesGlobales, Final, StatisticsService, CompleteBiome, UnitOfWork, esquema o proyectos.

Firma reutilizada: CompleteBiomeCommand(OperationId, LocalPlayerId, GameId, ExpectedRevision, BiomeId, ConfirmedResult) → SaveReceipt mediante GamePersistenceAdapter.CompleteBiomeAsync. La revisión se lee de SQLite; resultado individual healthy→good/degraded→bad según decisión ya confirmada. No es evaluación del final global. Se valida propiedad, partida current/in_progress, animal_pending, decisión, ambiente y frontera. El servicio existente conserva todas sus validaciones atómicas y recibos.

### Orden, errores e idempotencia
Llegada válida → reserva de meta/modal bloqueante → lectura autoritativa → comando UUID v4 inmutable → CompleteBiome → recibo confirmado → relectura del completed → actualización de LocalGameState → intento de evento → selección local.

El bool físico evita señales repetidas de la instancia; Busy evita doble clic/concurrencia; comando/ID/revisión/payload se retienen para retries; un recibo conocido evita otra llamada al servicio incluso si falla después lectura/refresco/navegación. Respuesta perdida se resuelve enviando el mismo comando al servicio idempotente. Payload contradictorio con mismo ID se rechaza; una intención nueva contra completed recibe BIOME_COMPLETED. El recibo no se confunde con el éxito de navegación.

SQLite precommit fallido no produce éxito, evento ni navegación; el modal permite reintentar la misma operación. Durante una intención no resuelta el botón de recuperación también intenta resolverla antes de navegar; no descarta un commit incierto. Un fallo persistente requiere restaurar acceso local o cerrar/reabrir, sin login, progreso temporal ni borrado. Si el commit ya está confirmado, conserva identidad/recibo aunque falle refresco; al recuperar no vuelve a guardar. Los reintentos de navegación preparan un ticket SQLite fresco, conservan la pausa del modal si fallan y liberan SceneTree.Paused al confirmar el cambio.

Tras reiniciar el proceso no se conserva la intención en memoria: SQLite manda. Continuar relee completed y sus tarjetas quedan bloqueadas, sin reenviar una llegada o una decisión. No hay journal nuevo.

### Cinco biomas y navegación
ocean, jungle, desert, forest y tundra comparten el contrato, con su personaje concreto y escena canónica. Cualquiera puede ser primero, cuarto o quinto: se cuenta el estado persistido, no el enum ni un orden obligatorio.

Mientras quedan pendientes: retorno a res://scenes/levels/menu_niveles.tscn; tarjetas completed bloqueadas por la selección existente y demás incompletas disponibles. Se conservan decisiones y consecuencias.

Quinto: CompleteBiome guarda completed y mantiene in_progress. El modal existente muestra que los cinco están guardados y el final global offline sigue pendiente. Una acción explícita abre la selección existente, con las cinco tarjetas bloqueadas y el mismo aviso; Volver al menú permanece disponible. Continuar vuelve a esa selección después de reiniciar; Nueva partida permanece bloqueada. No es una pantalla de final, no muestra Bueno/Medio/Malo, no calcula ni cierra ni archiva ni crea sucesora. Hay salida recuperable sin inventar escenas, pero jugar una nueva partida queda pendiente del futuro cierre global autorizado.

### Telemetría secundaria y reconciliación futura
Al iniciar la coordinación se llama Loading para cerrar el tiempo efectivo anterior a la espera de SQLite; el tiempo de confirmación/modal/navegación no se contabiliza como ActiveAnimal. Después del commit y actualización local, CompletionConfirmed cierra el intervalo pendiente (de carga si procede) antes de encolar ANIMAL_SEGMENT_COMPLETED en el FIFO existente, respetando el orden temporal requerido por GameplayEventService. EventId = OperationId del recibo; el evento captura un payload estable y no se regenera al reintentar.

La notificación no espera que la escritura estadística termine ni afirma que haya persistido. El FIFO existente mantiene IDs/payload y diagnósticos de cobertura incompleta; sus fallos no revierten progreso ni bloquean navegación. Si no hay un run válido o el observador no está disponible se registra TELEMETRY_COMPLETION_MISSING. Una excepción de la notificación también deja continuar la recuperación local. No se implementa otra cola, outbox, migración ni transacción conjunta.

Ventana reconocida: cerrar el proceso entre commit principal y escritura del evento puede dejar una finalización sin evento. Diseño futuro de reconciliación: comparar recibos complete_biome y completed contra gameplay_events.EventId=OperationId, por propietario/partida/bioma; reconstruir solo el faltante con ese mismo ID y datos verificables del run original, nunca otra operación de dominio. Si existe evento, conservar su payload y tratarlo idempotentemente; ante contradicción, diagnóstico. No inventar sesión, run, offset o duración. Runs cerrados/interrumpidos o evidencia insuficiente requieren un contrato específico de reconciliación histórica autorizado: RecordEvent actual no permite forzar retroactivamente un terminal. Sin esa evidencia, marcar faltante/no reconstruible. No ejecutar reparación de historia durante E.2A.

### Validación ejecutada
**472 comprobaciones C# aprobadas, cero fallidas: 54 nuevas + 418 regresiones reejecutadas.**
Nuevas: cinco biomas, conservación de decisiones/ambiente, bloqueo/disponibilidad, replay de recibo y conflicto, rechazo de completed, lectura en proceso hijo, decisión/etapa/partida ausentes, rollback precommit, respuesta perdida, concurrencia, fallos de relectura/refresco/navegación, pausa mediante callbacks, orden libre de cinco, quinto pendiente sin sucesora/final inventado, evento único/ID estable, escritura secundaria fallida/detectable/reintentable y conservación de sesiones/tiempo.

Regresiones: 23 actividad, 31 observador, 41 eventos, 24 pantalla, 39 consultas, 19 Game Over/navegación, 21 reinicio, 11 retorno, 29 entrada animal, 30 decisiones, 30 selección, 35 menú, 42 progreso y 43 SQLite. No se suman repeticiones. No se presentan las 15/15 manuales históricas como pruebas de esta fase.

Comandos efectivamente usados, con entorno aislado de integration/sqlite/run-infrastructure.ps1:
- dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore --disable-build-servers -nodeReuse:false
- GameSave.Checks.exe --biome-completion
- GameSave.Checks.exe con --activity-statistics, --gameplay-observer, --gameplay-events, --statistics-screen, --local-statistics, --game-over-navigation, --animal-restart, --menu-return, --animal-entry, --decisions, --biome-selection, --runtime-menu y --progress.
- local-persistence/run-checks.ps1
- dotnet build TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild -p:TwoSidesIsolatedBuild=true -p:GodotProjectDir=integration/sqlite/.work/

Biblioteca y ejecutores: 0 errores/0 advertencias. Rebuild completo Godot C#: 0 errores, 63 advertencias históricas CS0618 ParallaxBackground, 0 nuevas. No referencias duplicadas nuevas ni cambios de proyectos. No se ejecutó Godot/Node, HTTP, Atlas o AWS. Compilaciones y pruebas no cargan backend/.env.

Todas las escrituras de pruebas usaron SyntheticSandbox bajo local-persistence/.work/databases/<UUID>. Las tres bases protegidas y sus manifiestos/leases (9 archivos) conservan hash/tamaño/fecha antes/después. Manifiesto adicional de 1.545 archivos fuera del alcance permanece idéntico. .env: 278 bytes y SHA-256 histórico 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, verificado separadamente de pruebas/builds sin valores. Sin cambios de ACL/propietario; riesgo ACL B00 pendiente.

### Validación manual segura pendiente
1. Abrir manualmente la copia sin backend ni internet; Continuar debe conservar perfil/partida. Anotar progreso inicial; no borrar bases ni forzar SQL.
2. En cada bioma todavía incompleto, tomar su decisión si falta y llegar físicamente con su animal vivo; comprobar ambiente antes/después y que no se repite la decisión.
3. Mientras queden pendientes, confirmar retorno a selección sin pausa residual, tarjeta completada bloqueada y otros incompletos disponibles. Pulsaciones repetidas no deben duplicar navegación.
4. Cerrar/reabrir y Continuar: misma partida, decisiones/ambientes/completed persistidos, sin login. No se restaura posición, vida, agua o comida.
5. Al completar el quinto, leer el aviso de final global pendiente, abrir selección y volver al menú. Los cinco permanecen bloqueados y Nueva partida también. No esperar final narrativo ni intentar desbloquear mediante edición.
6. Revisar consola y Estadísticas: progreso principal confirmado; un diagnóstico de telemetría implica cobertura incompleta, no pérdida de la decisión. Las pruebas de fallos SQLite/telemetría se realizan solo con fixtures; no alterar permisos, archivo runtime o credenciales para provocarlos.

Las pruebas automatizadas de pausa/navegación usan callbacks, no SceneTree real; la colisión, identidad física y acceso visual a los botones requieren esa validación manual. No se promete cobertura estadística histórica completa ni reconciliación automática tras crash.

Trabajo detenido tras E.2A. No evaluación de finales, cierre global, recursos/checkpoints, partidas nuevas ni B05.


## B04.2B.2B.2E.2B.1 — Recuperación de reglas y diseño global (2026-10-27)

**COMPLETADA COMO AUDITORÍA. E.2B BLOQUEADA PARA IMPLEMENTACIÓN.**
El usuario confirma E.2A validada manualmente:472 pruebas históricas y10/10 manuales, sin errores nuevos. No son nuevas ejecuciones de E.2B.1.

No se recuperó el evaluador auténtico. Final.cs selecciona presentación a partir de EndingService.ConfirmedEnding; GameStateStore valida conteos y resultado recibido, no umbrales. VariablesGlobales y decisiones/ambientes individuales no proporcionan la fórmula. Backend actual solo contiene auth/identity; fixtures con ending preasignado no son equivalencia.

Se revisó el Git local de la copia: nueve commits alcanzables y referencias master/origin/master/origin/main. HEAD5972713c116748d4cb968e092d6d114a3e44b69e; sus árboles no contienen versiones de Final.cs, FinNivel o VariablesGlobales. La PantallaDecisiones.cs antigua en6376cca solo cambia entre escenas A/B. Búsquedas de código/escenas/documentos por commit, historial de rutas y reflog no aportaron evaluador. Sin fetch, checkout, restauración o acceso al proyecto original. Esta conclusión se limita a las evidencias locales disponibles; no afirma que la demostración nunca tuviera evaluador.

Se crean [LOCAL_FINAL_EVALUATOR_PLAN.md](LOCAL_FINAL_EVALUATOR_PLAN.md) y [GLOBAL_PLAYTHROUGH_CLOSURE_PLAN.md](GLOBAL_PLAYTHROUGH_CLOSURE_PLAN.md). Detallan fuentes/rutas/métodos, contrato condicionado, pruebas de equivalencia pendientes, recuperación A–F, idempotencia tras reinicio, diferencia entre resultado/presentación/cierre y futura historia/sincronización sin envío. No inventar fórmula, mayoría ni ponderaciones.

SQLite dispone de campos ending/version/completed_at y estado final_pending, pero no de servicios de preparación/presentación/cierre; UpdateGame no escribe los campos finales y SaveCatalog.Resume no admite ending. El CHECK impide is_current=1 con completed: el cierre futuro debe conservar historia con is_current=0; nueva partida solo por intención explícita posterior. La fecha completed_at requerida ya en final_pending no prueba que el jugador haya visto o salido del final: semántica y evidencia durable pendientes de contrato. Reglas initial-state-only-1 no certifican finales narrativos.

Recomendación para E.2B.2: obtener fuente/commit o tabla original verificable y autorizar su lectura si está fuera de la copia. Alternativa distinta: aprobación explícita del usuario de reglas nuevas, sin llamarlas recuperación histórica. No adoptar reglas ni implementar antes de resolverlo. Preservar controlador visual/textos/animaciones y flujo E.2A de final global pendiente.

No se implementaron servicios, pruebas o código. No build, tests, Godot, Node, CompleteBiome, SQL, Atlas, AWS o B05. Las pruebas de equivalencia no se ejecutaron por falta de oráculo. Solo seis documentos autorizados cambiados. Bases protegidas y nueve archivos asociados verificados por hash/tamaño/fecha sin cambios; .env278 bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, sin valores ni cambios ACL/propietario. Riesgo B00 pendiente. Detenido al terminar auditoría.


## B04.2B.2B.2E.2B.2 — Evaluador autorizado y cierre local (2026-10-27)

**COMPLETADA EN CÓDIGO. VALIDACIÓN RUNTIME PENDIENTE.** Esta autorización levanta el bloqueo de E.2B.1 para la nueva regla; no se recuperó el evaluador original. E.2A/10 de10 manuales son antecedentes aportados por el usuario, no validación manual de este flujo global.

### Autorización, regla y versión
El documento de fase del usuario autoriza expresamente contar solo reject en las cinco decisiones de los cinco biomas completed de la misma partida:
| reject | Resultado persistido | Presentación |
|---|---|---|
| 0 | bad | Malo |
| 1 | bad | Malo |
| 2 | bad | Malo |
| 3 | medium | Medio |
| 4 | medium | Medio |
| 5 | good | Bueno |

Versión nueva y única: **local-ending-reject-count-1**, almacenada en ending_rules_version. No se reutiliza initial-state-only-1: RulesVersion de partida/decisiones y ContentVersion anteriores se conservan. La regla narrativa nueva se aplica explícitamente al preparar un final de esta copia bajo la autorización actual, incluidas partidas E.2A ya existentes con cinco completed. No es una afirmación de equivalencia con la demostración original desaparecida. Sin ponderación por orden, tiempo, muerte, recursos, sesiones o historia.

### Inventario exacto de cambios
Producción (12 archivos):
- local-persistence/src/LocalFinalEvaluator.cs.txt, nuevo: FinalDecision, LocalFinalResult y evaluador puro centralizado, sin SQL/Godot/HTTP/VariablesGlobales.
- local-persistence/src/Models.cs.txt: PrepareFinalCommand y CloseGameCommand.
- local-persistence/src/GameSaveService.cs.txt: PrepareFinal/CloseGame, validación de resultados locales en Load, admisión explícita de versión final para HasUnfinished y rechazo preservado de ending en SaveCurrentGame genérico.
- local-persistence/src/SQLiteRepository.cs.txt: UPDATE parametrizado PrepareFinal que satisface CHECK en una sola instrucción.
- local-persistence/src/Validation.cs.txt: permite leer continuación ending con bioma/checkpoint nulos y snapshot boundary v1.
- local-persistence/src/StatisticsService.cs.txt: solo reconoce la nueva versión narrativa para Ending/ConfirmedCompleted; sin fórmula duplicada, agregados nuevos o cambios en captura.
- integration/sqlite/GamePersistenceAdapter.cs: puerto ILocalFinalStore y fachadas PrepareFinalAsync/CloseGameAsync usando el worker serial existente.
- integration/sqlite/LocalGameState.cs: intención de preparar/cerrar estable, NeedsFinal, ConfirmedEnding, recuperación y NavigateFinalAsync.
- scripts/AnimalSegmentFlow.cs: después del quinto recibo, prepara el resultado local y navega a la escena existente; no repite CompleteBiome al reintentar preparación/navegación.
- scripts/MenuPrincipal.cs: Continuar reconoce cinco completed o final_pending y recupera Final.tscn; reintento de preparación no se convierte en Nueva partida.
- scripts/MenuNiveles.cs: mensaje de recuperación mediante menú/Continuar si se encuentra una selección con cinco completos.
- scripts/Final.cs: obtiene resultado confirmado de SQLite, elimina gates/login/HTTP de esa pantalla y cierra localmente al salir.

Pruebas (2 archivos): nuevo local-persistence/game-save-tests/LocalFinalChecks.cs.txt y dispatcher GameSaveChecks.cs.txt (--local-finals / --final-probe). No cambios de proyectos para incluirlos: glob existente.

Documentación (11 archivos): LOCAL_FINAL_EVALUATOR_PLAN, GLOBAL_PLAYTHROUGH_CLOSURE_PLAN, FINAL_FLOW_AUDIT, COMPLETE_BIOME_INTEGRATION_PLAN, GODOT_RUNTIME_INTEGRATION_PLAN, GODOT_RUNTIME_TEST_PLAN, LOCAL_STATISTICS_IMPLEMENTATION_PLAN, PHASES, PHASE_HISTORY, DECISIONS y local-persistence/README.md. Total25 archivos, incluidos2 nuevos. Se conservan los antecedentes; este apartado sustituye sus propuestas/bloqueos solo en el alcance implementado.

Sin cambios a FinNivel, CompleteBiome, UnitOfWork, esquemas/migraciones, StatisticsRepository, observador, TarjetaNivel, LocalProfileView, VariablesGlobales, personajes, recursos, escenas, project.godot o TwoSides.csproj.

### Contratos y validaciones
LocalFinalEvaluator.Evaluate(gameId, IReadOnlyList<FinalDecision>) valida exactamente los cinco IDs canónicos sin duplicados, misma partida, completed, opción reject/approve y ambiente/resultado coherentes. Su sobrecarga de agregado verifica las cinco decisiones/filas/ambientes y sus vínculos LastDecisionId/consecuencias. El servicio carga el agregado con validación de propietario, catálogo de claves, versiones, snapshot y recibos de decisión; no evalúa entradas arbitrarias de UI.

PrepareFinalCommand(OperationId,LocalPlayerId,GameId,ExpectedRevision) → SaveReceipt.
CloseGameCommand(OperationId,LocalPlayerId,GameId,ExpectedRevision,ConfirmedEnding) → SaveReceipt.
Los resultados no se eligen desde el cliente. ConfirmedEnding de cierre solo se compara con el valor validado y persistido.

PrepareFinal ejecuta UnitOfWork.Write/BEGIN IMMEDIATE existente: carga/valida cinco finalizaciones, cinco decisiones y recibos, evalúa, exige revisión actual, registra recibo y cambia a final_pending/is_current1/resume_kind ending, sin bioma/checkpoint, ending/ending_rules_version/completed_at, revisión+1 y snapshot consistente en la MISMA transacción. Sin migración. Guardado genérico de ending sigue rechazado: solo esta operación específica puede prepararlo.

Mismo OperationId/payload devuelve recibo previo; distinto payload bajo el mismo ID produce OPERATION_CONFLICT. Otra intención para una partida ya preparada/cerrada reconoce su resultado validado, conserva ending/fecha/revisión y no vuelve a transicionar. Puede dejar un recibo adicional de reconocimiento, no otro final ni otra fila de historia. La UI evita esos comandos redundantes cuando ya recuperó un resultado confirmado. Resultado/versión contradictorios producen FINAL_RESULT_CONFLICT y se mantienen intactos, sin sobreescritura; el código se expone como diagnóstico local. Una versión futura debe conservar el evaluador de esta versión para leerla, no reinterpretarla.

### Quinto, presentación y cierre
Después de CompleteBiome confirmado se intenta telemetría secundaria igual que en E.2A. Al detectar cinco completed, LocalGameState.PrepareFinalAsync persiste y relee el resultado; NavigateFinalAsync llama navegación solo tras esa confirmación. El modal conserva la recuperación si falla preparación/navegación. Los demás completados siguen retornando a selección.

Final._Ready espera almacenamiento local, recupera/verifica resultado confirmado y luego usa el mismo mapeo good/medium/bad→Bueno/Medio/Malo. Se conservan Final.tscn, títulos/textos, nodos, sprites, velocidades/espera, tween, clic que completa texto y acción posterior de salida. Solo se añade gate Visible al input durante la lectura asíncrona. No se crea UI final alternativa ni se consulta autenticación remota.

Preparar/navegar no significa “visto”. No se añade marcador durable de presentación: la aplicación sabe que inicializó la vista, pero no acredita que el usuario leyera/renderizara cada cuadro. Cerrar el proceso antes o durante la pantalla deja final_pending y permite mostrarlo de nuevo. La acción de salida existente, después de su espera, inicia CloseFinalAsync; la finalización de la animación por sí sola no cierra.

CloseGame valida propietario, cinco completed y el mismo resultado/version confirmados; transacción existente marca status completed/is_current0, revisión+1, SavedAt y ArchivedAt actuales, snapshot/recibo. No modifica ending ni decisiones/ambientes/progreso/estadísticas. Conforme al esquema, CompletedAt es el instante en que se PREPARÓ el resultado (ya obligatorio en final_pending); el recibo close_game y ArchivedAt identifican el momento de cierre global. No presentar CompletedAt como prueba de lectura o salida. No se usa status archived para sustituir completed.

Final.IrAlMenu solo vuelve al menú después de confirmar el cierre. Fallo de cierre deja la misma pantalla/reintento y Nueva partida bloqueada. Si cierre confirma y falla navegación, la pantalla conserva la confirmación y reintenta solo el cambio de escena. Reiniciar entonces abre menú con la partida histórica ya cerrada, sin crear sucesora.

### Recuperación y nueva partida
A quinto guardado pero no preparado: iniciar menú y Continuar detecta cinco completed y prepara; no vuelve a jugar el quinto.
B cálculo/almacenamiento fallido: no mostrar resultado provisional; mismo comando/revisión/ID para resolver commit incierto.
C resultado guardado/navegación fallida: final_pending durable; Continuar o retry abre el mismo ending.
D/E proceso cerrado antes/durante pantalla: recuperar final_pending y mostrarlo, sin cierre automático.
F proceso cerrado durante salida: precommit sigue final_pending; postcommit es completed/is_current0. Reintentar cierre reconoce el hecho, sin duplicar partida/historia.
Los gates del menú y el perfil existente se conservan. Nueva partida solo se habilita tras cierre confirmado y ausencia de otras inconclusas; es una intención explícita separada. Crea GameId propio, perfil igual, cinco human_pending disponibles, decisiones vacías y ambientes nulos. No se importan recursos/estados de historia. El bool global visual anterior no es autoridad y cada nueva decisión confirmada prepara el ambiente antes del animal por la ruta existente.

### Estadísticas y futuros datos remotos
Se informó antes de editar el ajuste exacto de StatisticsService: aceptar ending_rules_version local-ending-reject-count-1 además del reconocimiento legado. No se modifican sumas/consultas de decisiones, progreso, tiempo, sesiones ni eventos. Se conserva versión, GameId, cinco decisiones/resultados/fechas, historial y recibos para sincronización futura. No se fabrican eventos de presentación/cierre ni se envía nada. La captura de E.2A sigue siendo secundaria y conserva su posible laguna tras crash entre dominio y evento; este cierre no la repara ni exige su éxito.

### Pruebas efectivamente ejecutadas
**598 comprobaciones C# aprobadas:126 nuevas +472 regresiones reejecutadas, cero fallidas finales.**
126 nuevas incluyen seis conteos,32 combinaciones exhaustivas y orden invertido; entradas faltantes/duplicadas/desconocidas/contradictorias/incompletas/de otra partida; determinismo; persistencia good/medium/bad, separación de versiones, recibos y conflictos; cinco decisiones sin meta física y solo cuatro completados rechazados; quinta finalización válida; rollback de preparación/cierre; navegación rechazada mediante callback del coordinador; lectura en procesos hijos; cierres antes/durante pantalla simulados por contextos nuevos; respuesta perdida de preparación y cierre; doble clic; ausencia de nueva partida anticipada; historial/ambientes/decisiones preservados; nueva partida limpia/única; dueño ajeno rechazado y eventos/tiempo efectivo anteriores conservados.

Regresiones reejecutadas:54 completion,23 actividad,31 observador,41 eventos,24 pantalla,39 consultas,19 Game Over/navegación,21 reinicio,11 retorno,29 entrada,30 decisiones,30 selección,35 menú,42 progreso y43 SQLite. No sumar ejecuciones repetidas. La suite base inicialmente detectó cambio de error en SaveCurrentGame ending; se corrigió preservando UNSUPPORTED_CHECKPOINT en la API genérica y sus43 casos pasaron después. No se alteró ese test para ocultarlo.

Comandos usados con entorno aislado de run-infrastructure.ps1:
- dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore --disable-build-servers -nodeReuse:false
- GameSave.Checks.exe --local-finals y los catorce modos seguros anteriores (--biome-completion, --activity-statistics, --gameplay-observer, --gameplay-events, --statistics-screen, --local-statistics, --game-over-navigation, --animal-restart, --menu-return, --animal-entry, --decisions, --biome-selection, --runtime-menu, --progress).
- local-persistence/run-checks.ps1 (43 SQLite).
- dotnet build TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild -p:TwoSidesIsolatedBuild=true -p:GodotProjectDir=integration/sqlite/.work/
Comprobación final focalizada repitió --local-finals, --runtime-menu y --local-statistics tras los últimos ajustes de idempotencia/versionado.

Biblioteca/ejecutores:0 errores/0 advertencias. Godot C# Rebuild:0 errores,63 advertencias históricas CS0618 ParallaxBackground,0 nuevas; sin referencias/proyectos duplicados. No se ejecutó Godot. Los callbacks y procesos C# prueban coordinación/SQLite; no acreditan colisión, frames, tween, navegación o pausa reales del motor.

### Integridad y límites
Solo fixtures bajo local-persistence/.work/databases/<UUID> para escrituras de prueba. Ninguna operación CompleteBiome/PrepareFinal/CloseGame/Nueva partida se ejecutó en las tres bases protegidas. Sus9 archivos de bases/manifiestos/leases conservan hash/tamaño/fecha. Manifiesto de1.542 archivos fuera del alcance idéntico antes/después (incluye escenas/proyectos/VariablesGlobales/FinNivel). .env verificado separadamente por tamaño/hash:278 bytes, SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928; sin lectura de valores ni cambios ACL/propietario. Riesgo B00 pendiente. Sin migraciones, dependencias nuevas, Node, Atlas, AWS o B05.

No se certifica equivalencia con el evaluador original ausente. No existe prueba durable de “final leído”; no se afirma. La telemetría no es condición de cierre. Errores de almacenamiento persistentes requieren recuperación de acceso local o reinicio; nunca login, borrado o resultado por defecto.

### Guía manual segura de los tres finales
1. Abrir manualmente esta copia sin Node/internet. Si la partida ya tiene cinco completed, Continuar debe preparar/mostrar su resultado real, sin modificar sus decisiones ni repetir el quinto.
2. Para good, jugar una partida con5 reject; para medium,3 o4 reject; para bad,0/1/2 reject. Son partidas sucesivas creadas desde Nueva partida después de cerrar la anterior; no editar SQLite ni borrar historia para forzar resultados. Las decisiones ya confirmadas no se cambian para probar.
3. Completar físicamente los cinco en cualquier orden. Después del quinto comprobar título/texto esperado, ambiente conservado y consola sin errores/login. Comparar visual/animación con la presentación previa.
4. Cerrar Godot sin salir explícitamente del final; reabrir y Continuar: mismo resultado. Nueva partida sigue bloqueada mientras final_pending.
5. Primer clic durante escritura completa el texto; después de la espera, la salida explícita debe confirmar cierre y abrir menú sin pausa. El perfil permanece y Nueva partida se habilita.
6. Consultar Estadísticas: partida anterior histórica con su resultado y decisiones. Crear explícitamente otra: cinco disponibles, sin decisiones/ambientes heredados; no dos activas.
7. Repetir para cubrir los tres resultados, sin restaurar ni sobrescribir bases. Registrar consola sin secretos si hay fallo. Los fallos de disco/transacción y respuesta perdida se prueban automáticamente solo en fixtures; no manipular permisos o runtime para provocarlos.

Siguiente paso recomendado: validación manual del quinto→final→reinicio→salida→historia→nueva partida para los tres resultados, antes de otra implementación. Detenido al terminar E.2B.2. No B05 ni sincronización.


## B05.1 — Auditoría y diseño de sincronización global (2026-10-27)

**COMPLETADA SOLO COMO AUDITORÍA Y DISEÑO.** B05.2 NO iniciada. El usuario confirma E.2B.2 validada:598 pruebas anteriores y12/12 manuales, cero errores nuevos. Esos resultados son antecedentes, no ejecuciones de B05.1.

Entregables nuevos:
- B05_SYNC_ARCHITECTURE.md: inventario real, autoridad SQLite, outbox propuesta, captura/reconciliación, tipos de reporte, orden/dependencias, idempotencia y riesgos.
- B05_IDENTITY_AND_SECURITY_PLAN.md: identidad de instalación/perfil/cuenta, credencial protegida, sesiones opacas, recuperación y plan correctivo B00 sin ejecutarlo.
- B05_SYNC_API_CONTRACT.md: endpoints versionados propuestos, esquemas/límites, recibos por operación, validaciones, autorización, conflictos y reintentos.
- B05_GLOBAL_STATISTICS_PLAN.md: métricas/fuentes/fórmulas/denominadores, cobertura, limitaciones y panel administrativo conceptual.
- B05_IMPLEMENTATION_ROADMAP.md: B05.2–B05.8 en entregas pequeñas, archivos/migraciones previsibles, fixtures, dependencias y criterios de aceptación.

Hallazgos: Express5.3.0 y Argon2id reales; registro/sesión/me en memoria con tokens opacos900s. No JWT, Zod, Mongoose, roles admin/player implementados, conexión Atlas, modelos Mongo de partidas/decisiones/sesiones, estadísticas/admin o recepción sync. src/database/mongodb/.gitkeep es placeholder. Tests de identidad/auth inspeccionados, no ejecutados. SQLite basev2+gameplayv1 tiene IDs y hechos durables pero no outbox/sync ACK. Journal remoto legacy24hex no se compone como cola del runtime UUID; un comentario de extensión futura tampoco es implementación.

Decisiones de diseño propuestas: réplica ANALÍTICA mínima, no cloud-save ni autoridad remota sobre gameplay. Tipos game.report/session.report/gameplay.event/gameplay.interval con IDs/versión/binding/huella canónica. Nueva extensión syncv1 separada, sin modificar DDL previos; leases, cinco estados y confirmaciones durables. Captura después de dominio para que una cola fallida no revierta progreso; recuperar hechos existentes desde fuentes/checkpoints, sin fingir cada revisión intermedia ni eventos/tiempos ausentes.

Recepción con claves únicas por operación y hecho; misma carga devuelve recibo, distinta produce conflicto. Commit remoto y respuesta HTTP no son atómicos con SQLite; ACK perdido se reenvía mismo ID. Revisiones antiguas no retroceden proyección; dependencias de sesión/run diferidas. No “HTTP exactamente una vez”. Sesiones/decisiones/intervalos deduplicados y proyecciones no se suman en cada revisión.

Identidad: nombre solo local, localPlayerId existente y installationId nuevo por persistir, technicalAccountId durable futuro; registro idempotente/credencial por instalación con protección Windows propuesta fuera de repo/OneDrive. Renovación por reautenticación, no alta nueva ni JWT obligatorio; secreto perdido no se recupera por nombre. Transferencia/multiPC requiere contrato posterior, no merge automático.

B00: SID S-1-5-21-452213140-3335518246-3718727391-3248334987 registrado no resuelto con Modify/Synchronize heredado desde ACE explícita de raíz de copia. No nueva identificación/justificación/corrección en B05.1. Procedimiento futuro: repetir metadatos/identidad/ascendencia, evidencia privada y plan de descriptor exacto/rollback, autorización separada de alcance, cambio mínimo y verificación posterior. Revisar permisos de ancestros y copias OneDrive; hash íntegro no resuelve exposición. Antes de credenciales reales/despliegue se necesita esa fase de seguridad, gestión de secretos de servidor y roles administrativos separados. No modificar permisos por inferencia.

Métricas globales actuales: NINGUNA API global funcional. Fuentes locales permiten diseñarlas, pero requieren identidad durable/outbox/ingesta/consultas. Distinguir registrado de activo sincronizado, preparado de cerrado, solicitud de reinicio de éxito, desconocido de0 y muestra recibida de todas las instalaciones. Reglas finales se conservan:local-ending-reject-count-1;5reject good,3/4medium,0–2bad. Sin cambios de agregados ni gameplay.

Inspección: backend/package.json, app/server/config, modules/auth/identity, middleware/utils y tests; modelos/DDL/servicios/estadísticas/observador/contratos locales y cliente legacy; documentación de identidad, seguridad, estadísticas y E.2B.2. Referencias públicas oficiales de MongoDB/Microsoft/AWS consultadas para diseño, sin exportar datos reales, autenticar cuentas o utilizar servicios cloud.

Verificación: únicamente los5 documentos nuevos y PHASES/PHASE_HISTORY/DECISIONS modificados. Sin producción, escenas, dependencias, tests/builds, Node/Godot, SQL, migraciones, eventos, ACL, Atlas o AWS. Las3 bases protegidas y9 archivos asociados conservan hash/tamaño/fecha; manifiesto de1.564 archivos fuera del alcance idéntico. .env278bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928; sin contenido mostrado/leído como texto ni permisos/propietario modificados.

Próximo paso recomendado: autorizar B05.2A de seguridad, empezando por comprobaciones readonly actualizadas y una propuesta concreta de ACL/ruta privada revisable; no aplicar cambios hasta su autorización específica. Después identidad con secretos/fixtures sintéticos, sin Atlas real ni migrar runtime por extensión de alcance. Detenido al finalizar B05.1.


## B05.2A — Diagnóstico ACL e identidad técnica (2026-10-27)

**COMPLETADA ÚNICAMENTE COMO AUDITORÍA Y DISEÑO.** B00 no se declara resuelto; B05.2B/B05.3 no iniciadas.

Nuevos documentos: [B05_B00_ACL_DIAGNOSIS.md](B05_B00_ACL_DIAGNOSIS.md) y [B05_IDENTITY_IMPLEMENTATION_PLAN.md](B05_IDENTITY_IMPLEMENTATION_PLAN.md). Contienen evidencia de ACE/metadatos, límites de acceso efectivo, corrección exacta condicionada a inventario/permiso y rollback; autenticación real, contratos player/admin y JWT propuesto, archivos y pruebas futuros.

Hallazgos ACL actuales:
- Propietario de .env/backend/raíz: LAPTOP-F337QTKK\\luis2. Herencia habilitada, .env sin ACE explícitas y sin ReparsePoint/LinkType.
- SID A S-1-5-21-452213140-3335518246-3718727391-3248334987 conserva Allow Modify/Synchronize heredada en .env/backend desde ACE explícita OI/CI en la raíz exacta de la copia.
- SID B S-1-5-21-307222809-3929607348-3502628415-466486063 tiene concesión equivalente; el registro histórico disponible no acredita cuándo apareció, no se declara cambio reciente.
- Ninguno resuelve con Windows (IdentityNotMappedException) ni coincide con usuarios/grupos locales enumerados; no están en el token del proceso consultado. No atribuirlos a cuentas eliminadas, atacante, dominio o herramienta concreta.
- SYSTEM/Administradores/luis2 conservan ACE FullControl heredadas. Everyone tiene Deny DeleteSubdirectoriesAndFiles en carpetas (heredado desde OneDrive); esa ACE no está en .env y no es un Deny universal de Modify.
- Ambos SID aparecen también en cuatro muestras de documentación/código/escenas. Cinco ancestros relevantes consultados no contienen esos SID; origen inmediato explícito demostrado en raíz de copia. Ancestros OneDrive/Desktop tienen metadatos reparse, sin certificación de proveedor/final-path o hardlinks.
- Se verificó lectura de metadatos/integridad, NO escritura/borrado/impersonación/AccessCheck de identidades ajenas. FullControl declarado no certifica cualquier acceso efectivo ante otros controles.
Conclusión: concesiones a principales no identificados/justificados CONFIRMADAS; existencia de una cuenta activa que pueda usarlas y compromiso práctico NO DETERMINADOS.

Corrección C1 propuesta NO ejecutada: retirar solo la ACE explícita exacta A(Allow,0x1301bf,OI/CI) en la raíz, preservando owner/herencia/otras ACE. La propagación afectaría descendientes y requiere inventario+autorización expresa, especialmente por bases/escenas/archivos protegidos. No es modificación limitada a .env. C2 para B requiere evaluación/aprobación separadas; quitar A no elimina riesgo de B. Alternativa focalizada en .env no resuelve por sí sola derechos de reemplazo de ancestros. Almacén privado fuera de OneDrive requiere otra ruta/permiso/configuración aprobados. No quitar indiscriminadamente heredadas ni cambiar propietario.

Verificación/reversión futuras: repetir metadata/ACL/identidades, detener ante diferencia, respaldo privado solo de descriptores/rutas/flags sin contenidos, diff de una/dos ACE aprobado, validar acceso legítimo y herramientas; ante fallo parcial restaurar solo DACL de objetos afectados desde inventario sin pisar cambios concurrentes, ni alterar contenido/fechas/owner. No se creó respaldo ni se ejecutó corrección en esta auditoría.

Identidad actual revisada en backend/src/tests/package: Express, Argon2id, registro/sesión/me y tokens OPACOS900s con repositorios/cupos en memoria; no JWT, roles admin/player, Mongoose/Atlas, Zod o CORS allowlist operativos. Auth está integrado en /identity/me, no middleware reusable de autorización. Tests inspeccionados, no ejecutados. Nombre solo local; instalación/perfil/cuenta y custodia de secreto aún requieren coordinación duradera.

Diseño JWT: perfil opcional futuro RS256 allowlist, issuer exacto configurado, aud two-sides-sync-api, subject técnico, exp/nbf/iat/jti y binding/version, clave privada solo servidor; validación exclusiva de tipo/alg/firma/claims y revocación/estado. Admin por proveedor OIDC/MFA con emisor/audiencia/permisos separados; rol nunca elegido por body ni asociado a Windows Administradores. Conservar opacos sigue siendo opción inicial B05.1; B05.2A no adopta ni implementa JWT.

B05.1 cubre por diseño TLS/owner/binding/límites100ops/256KiB/schema/idempotencia/reintentos y separación admin, pero no lo implementa. Cliente modificado puede falsificar decisiones/metas/muertes/tiempos; servidor valida coherencia/cotas/dedupe sin prometer antitrampas absoluto.

Integridad: .env COINCIDE con referencia histórica, sin mostrar tamaño/hash observados ni valores. SDDL/propietario de .env/backend/raíz y fecha/atributos del archivo comparados antes/después sin cambios. Tres bases y9 archivos asociados idénticos en hash/tamaño/fecha;1.567 archivos fuera de alcance idénticos. Solo2 documentos creados y5 autorizados actualizados. Sin producción, SQLite/SQL, permisos/herencia/owner, cuentas, servicios, Node/Godot/tests/builds, Atlas/AWS o nuevas dependencias.

Siguiente paso: autorización específica para B05.2B con inventario/descriptor exactos antes de cualquier ACL y alcance de identidad/secretos sintéticos separado. No usar credenciales reales ni migrar runtime por inferencia. Trabajo detenido.


## B05.2B.1 — Preparación de corrección de ambas ACE (2026-10-27)

**COMPLETADA COMO PREPARACIÓN/VERIFICACIÓN, SIN CAMBIOS ACL.** Creado B05_B00_ACL_CHANGE_PROPOSAL.md con inventario, candidato exacto, respaldo privado diseñado, rollback y validaciones. B05.2B.2 no iniciada.

Inventario ACL completo inicial de la copia:14.453 objetos (1.928 directorios/12.525 archivos), ambos SID presentes en todos;0 lecturas fallidas,0 reparse internos omitidos,0 DACL protegidas/no canónicas. Incluye dependencias/build/.git/.godot. Raíz tiene6 ACE; propuesta C-AB retira únicamente2 Allow explícitas0x001301BF/OI|CI/Propagation=None, una por SID:
A S-1-5-21-452213140-3335518246-3718727391-3248334987 y
B S-1-5-21-307222809-3929607348-3502628415-466486063.
Ambos siguen no resolubles y no presentes en el token propio; no se consideran maliciosos ni eliminados automáticamente.

Hallazgo nuevo frente a B05.2A: .git tiene4 ACE explícitas adicionales para esos SID, TODAS DENY (0x40130156 OI/CI InheritOnly y0x00130156 sin herencia por cada SID). No son concesiones residuales; corregida expresamente la interpretación preliminar comunicada durante la inspección. Se preservan todas. Retirar Allow raíz elimina sus copias heredadas, no esas Deny. No retirar por SID indiscriminadamente. En .git hay281 directorios/6.303 archivos con las combinaciones de herencia detalladas en la propuesta.

Retenidas en raíz: Deny Everyone DeleteSubdirectoriesAndFiles heredada y FullControl heredadas de SYSTEM/Administradores/luis2; owner/herencia intactos. La candidata6→4 se comprobó en memoria, no se escribió.

Impacto: la propagación alcanzaría backend/.env, código/escenas/proyectos, paquetes/herramientas/cachés, .git y runtime DB/manifest/lease. No cambios de contenido pero sí DACL; requiere autorización explícita y permisos de entorno compatibles (incluida área .git de solo lectura, sin evasión por escritura del padre). Las dos bases AppData y ancestros fuera del proyecto no serían destino. OneDrive no se deshabilita; su funcionamiento posterior no se garantiza sin pruebas autorizadas.

Respaldo futuro propuesto bajo C:\Users\luis2\AppData\Local\TwoSides\SecurityBackups\ACL\copy-06dc7ade-b3cd-425b-8d79-90dde8ef1ac6\B05.2B.2\<UTC>-<UUID>, fuera de OneDrive/workspace. NO creado. DACL/owner-grupo de referencia/flags/identidad de objetos/rutas/checksums/candidato, sin secretos ni datos SQLite. Verificar roundtrip de todos los descriptores y ACE originales; READ_CONTROL para captura, WRITE_DAC para aplicar/restaurar, sin takeown/cambio owner/elevación automática. SACL no incluida ni modificada. Hardlinks/final-path/concurrencia y capacidad de rollback son preflight obligatorio pendiente. Restaurar solo DACL de objetos afectados, sin pisar cambios concurrentes ni restituir contenidos o falsificar fechas.

La propuesta incluye texto concreto de autorización para ambas ACE y alcance de herencia/backup/rollback. No lo trata como autorización recibida. Validación posterior futura: usuario legítimo, build aislado, apertura manual de Godot, fixtures SQLite e integridad protegida, OneDrive sin errores observados, conservación de Deny/otras ACE y reversibilidad. No se ejecutó ninguna de esas pruebas de escritura o motor ahora.

Integridad .env: COINCIDE con referencia histórica, metadata/owner/SDDL de archivo/backend/raíz conservados. Tres bases y9 archivos asociados idénticos en hash/tamaño/fecha;1.571 archivos fuera del alcance idénticos. Inventario de ACL de objetos originales comparado antes/después de documentación. Únicos cambios documentales: propuesta nueva y PHASES/PHASE_HISTORY/DECISIONS. Sin ACL, owner/herencia, producción, SQLite/SQL/migración, JWT/roles, servidores, Godot, Atlas/AWS o B05.3. B00 no se declara resuelto. Detenido para autorización explícita de B05.2B.2.


## B05.2B.2A — Preflight y respaldo privado (2026-10-27 Guatemala)

**COMPLETADA como verificación, respaldo ACL y ensayo sintético limitado. Corrección real NO aplicada; B00 sigue pendiente.**
Reporte detallado: B05_B00_ACL_PREFLIGHT_REPORT.md.

Usuario informó OneDrive desactivado manualmente. OneDrive.Sync.Service permanece presente; no se interpretó como sync activa. Sin Godot/Node/build/ejecutores observados,13s de vigilancia sin cambios y2 capturas completas iguales de ACL/metadata/FileId/ruta final antes de exportar. No es garantía universal o VSS: CIM denegado y154 rutas de procesos no visibles, sin elevar privilegios. Lecturas estables suficientes para respaldo de metadatos, sin escrituras en proyecto.

Inventario actual14.465 objetos (1.931 directorios/12.534 archivos), todo dentro de raíz,0 reparse internos/errores,0 archivos con NumberOfLinks>1 o identidades duplicadas. fsutil confirmó una ruta para .env/runtime/manifest/lease/csproj. Dos Allow explícitas raíz0x001301BF/OI|CI/Propagation=None confirmadas y4 Deny .git intactas; no se identificó como malicioso un SID desconocido.

Respaldo creado en:
C:\Users\luis2\AppData\Local\TwoSides\PrivateBackups\B05_ACL\20261028T041722158Z-6ab71a16-74f2-4e64-b35c-802bc18133dc
acl-descriptors.jsonl:28756910bytes; SHA-256 E9372D35D31E53F9C8B6A8A1FEE58ED846043B49DF889852D9DA3FF5A837ABF6.
manifest.json:1041bytes; SHA-256 4AA511264176F97DF26504ACCF350A148A74715F0D8B1B7D780F01B9CD942609.
Fecha UTC 2026-10-28T04:17:39.7607628Z (2026-10-27 22:17:39.7607628 Guatemala).
Creador LAPTOP-F337QTKK\\luis2, token no administrador. Herencia privada existente solo usuario/SYSTEM/Administradores; no se deshabilitó herencia ni cambió propietario para proteger backup. Incluye DACL/ACE/owner-grupo de referencia/flags/rutas/identidad, SIN contenidos de archivos, secretos o datos SQLite. Lectura completa, reconstrucción binario/SDDL, digest/cantidad/manifiesto/hash verificados; respaldos anteriores no sobrescritos.

Ensayo: árboles sintéticos privados,2 directorios+1 archivo por prueba. Adición Deny WriteData solo sintética, escritura denegada, restauración sección Access, escritura permitida. Se conservan intentos: uno falló antes de DACL por envoltura de array JSON corregida; desde DACL nuevas Windows añadió AutoInherited tras restaurar (ACE/acceso recuperados pero SDDL no exacto). El ensayo final partió de una nueva línea base ya AutoInherited y recuperó exactamente AccessSddl/owner/grupo/protección en3 objetos. Todos los14.465 originales usan ese modelo AI, pero ello NO prueba restaurabilidad masiva/.git o privilegios WRITE_DAC en proyecto. No se probó ni modificó owner/SACL. Artefactos/evidencias sintéticos retenidos en privado; no ocultar resultados previos.

Comparación posterior de los14.465 originales: DACL/owner/grupo/protección/FileId idénticos; backup y hashes originales intactos. .env COINCIDE con referencia histórica y metadata/SDDL igual. Tres bases y9 archivos asociados idénticos en hash/tamaño/fecha;1.571 archivos fuera del alcance documental idénticos. No lectura de valores ni SQLite/SQL/migraciones.

Alternativas: A retirar exclusivamente2 Allow raíz conserva4 Deny Git pero requiere autorización de propagación a runtime/.git y permisos de entorno compatibles; backup no equivale a permiso WRITE_DAC. B usar ubicación privada para futuros secretos fuera de OneDrive reduce exposición de secretos nuevos, no corrige ACL de código o exposición histórica; no se movió ninguno. Recomendar B aun si se aprueba A; rotación/carga de configuración por separado.

Próxima aplicación exige nuevo preflight/backup actualizado, control de escritores/enlaces/FileId, aceptación del alcance y rollback limitado de DACL con owner/herencia intactos. Si el entorno mantiene .git readonly, no sortearlo escribiendo el padre. No se ejecutó corrección de seguridad real, Godot/Node/Atlas/AWS/JWT ni B05.3. Únicos cambios en proyecto: reporte nuevo y propuesta/PHASES/PHASE_HISTORY/DECISIONS. Detenido, pendiente de autorización expresa.


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

Auditado código real B05.2C y documentación obligatoria. Hallazgos: claves generadas en fixture, cuentas/registros/sesiones en Maps, kid fijo de fixture, cv no equivale a versión JWT, sesión jti necesaria incluso con firma válida. Diseñados registro idempotente, persistencia transaccional, vínculo por instalación/perfil, revocación y keyring/rotación. Tres documentos creados y seis actualizados; sin código, instalaciones, pruebas/servidores, Godot, Atlas o AWS. Integridad comparada antes/después; alcance y resultados en cierre B05.2D.1.

Contratos: [identidad persistente](B05_PERSISTENT_IDENTITY_CONTRACT.md), [ciclo de claves](B05_JWT_KEY_LIFECYCLE.md), [plan de pruebas](B05_IDENTITY_PERSISTENCE_TEST_PLAN.md). Las propuestas no habilitan producción ni modifican contratos implementados. Backend/.env conserva la referencia histórica; las tres bases y sus asociados permanecen protegidos. B00 no resuelto: dos Allow no identificadas; respaldo privado y ensayo limitado no garantizan restauración general. Detenido a la espera de autorización, sin iniciar B05.2D.2/B05.3.


## B05.2D.2 — Ejecución aislada (2026-10-27 Guatemala)

Se revisaron contratos y código/tests de B05.2C; no se atribuye implementación a B05.2D.1. La autorización actual permite persistencia temporal de prueba: se agregó adaptador cifrado de snapshot agregado y fake de memoria con el mismo puerto async. Proveedor de claves sintético con inicialización explícita y prueba de pareja; v2 opcional con binding/versiones, conservando legacy/v1 y guardia production.

Se rechazó Temp general por Allow adicional no identificada; ensayos en AppData/Local/TwoSides/identity-d2-UUID con padre/objetos privados verificados en lectura, sin cambiar permisos. Maestra de cifrado solo RAM/IPC. Cleanup limitado a cada UUID propio, nunca las bases/respaldos existentes. No tokens/privadas/credenciales en logs.

Reinicio comprobado con procesos distintos y listener efímero loopback: misma identidad/jti/kid/fingerprint, JWT previo aceptado antes de exp; expirado o identidad revocada rechazados incluso tras reinicio. Interrupción antes de commit deja estado anterior y lock residual, nuevas escrituras 503, sin ACK falso. No demuestra recuperación de apagón ni comportamiento Mongo.

Primer arranque runner bloqueado por sandbox EPERM; reejecutado con alcance de procesos/local/private autorizado. Primera batería nueva 32/34; error Windows --import corregido de ruta absoluta a file://, focalizados 2/2. Comparación integral posterior y resultado final registrados en cierre de esta fase. Sin dependencias nuevas, Atlas, AWS, Godot, SQLite/DDL, producción o B05.3.


### Cierre verificado B05.2D.2 — 2026-10-27 Guatemala

**COMPLETADA EN CÓDIGO, únicamente en el ámbito sintético autorizado.** Resultado final de npm test: **124 aprobadas, 0 fallidas, 0 omitidas**: 39 legacy node:test + 50 regresiones JWT B05.2C + 35 nuevas (26 memoria/contrato/HTTP y 9 archivo/aislamiento). No sumar reejecuciones. Todos los procesos Node y listeners de ensayo terminaron; cero directorios identity-d2-* de ensayo restantes.

Inventario final: 23 archivos deliberados (15 existentes modificados y 8 nuevos): seis código/config de pruebas existentes, un puerto src nuevo, siete archivos nuevos de batería/soporte y nueve documentos autorizados. De 4.839 archivos iniciales inventariados fuera de .git/node_modules/.godot y .env separado, 4.824 permanecen idénticos en hash/tamaño/mtime; ocho añadidos, cero eliminados. No otros cambios de contenido detectados. El lector del manifiesto usa UTF-8 explícito para no confundir nombres con Ñ como altas/bajas.

Tres bases protegidas y nueve archivos asociados: hash/tamaño/mtime idénticos. Backend/.env coincide con referencia histórica y conserva tamaño, fecha y descriptor/propietario; sin lectura de valores. SDDL/owner de raíz, backend, .env y .git idénticos antes/después; no comandos de cambio ACL/herencia/owner. No se afirma una nueva auditoría completa de ACL por archivo de todo el árbol. B00 sigue pendiente con ambas Allow investigadas y cuatro Deny Git conservadas.

No dependencias nuevas, Atlas, AWS, Godot, SQLite/SQL/migración, secretos reales ni producción. Persistencia Mongo/índices/transacciones, recuperación de usuario, DPAPI, keyring/rotación productivos y admin OIDC pendientes. El ensayo de archivo no acredita Atlas ni recuperación de apagón o fin del orquestador. Recomendación: revisión y autorización específica antes de cualquier B05.3; **B05.3 no iniciada, trabajo detenido**.


## B05.3A — Outbox SQLite sintética (2026-10-27 Guatemala)

Inspección confirmó base2/gameplay1 y ausencia previa de Outbox. Se agregaron cuatro archivos src SyncOutbox*.cs.txt y OutboxChecks; único código existente modificado: dispatcher de pruebas GameSaveChecks. Migraciones y escrituras solo en UUID sintéticos, sin cambios a migraciones históricas o gameplay. 64 casos nuevos y598 regresiones realmente reejecutados,662 aprobados;124 tests Node y12/12 manuales son antecedentes no ejecutados. Primeros errores de compilación/fixtures corregidos e inventariados en informe; ensayos finales incluyen procesos independientes/salida abrupta antes de commit, concurrencia, FK/recibos/backoff/historia. No HTTP/Atlas/Node ni Godot ejecutados. Runtime no migrada y B05.3B/B05.4 no iniciadas.

Contrato, tablas, transiciones, operaciones, limitaciones, pruebas, inventario y plan runtime en [B05_LOCAL_OUTBOX_IMPLEMENTATION.md](B05_LOCAL_OUTBOX_IMPLEMENTATION.md). No inicia B05.3B ni autoriza tocar runtime, HTTP o Atlas. B00 sigue pendiente; sin cambios ACL/propietario/herencia.


## Cierre de integridad — 2026-10-28 Guatemala

La fase comenzó el 2026-10-27 y su cierre se registra el 2026-10-28 según la fecha local del cliente.

Comparación final contra inventario anterior a editar: exactamente nueve archivos existentes autorizados modificados y seis nuevos (15 deliberados), cero archivos originales eliminados. No otros cambios de fuente/documentación;49 artefactos generados de compilación bajo la variante previa integration/sqlite/.work.godot se contabilizan aparte, además de cachés/binarios bajo .work excluidos del inventario. Los dos .cs de ensamblado generados por esa variante fueron retirados únicamente tras comprobar que no existían en baseline; compilación final usa .work/ con separador correcto. No se tocaron fuentes de Godot ni csproj.

Las tres bases protegidas y los nueve archivos asociados conservan exactamente hash/tamaño/mtime. Backend/.env **coincide con la referencia histórica** y conserva tamaño/fecha; no se leyeron valores. Owner/SDDL de raíz, backend, backend/.env, local-persistence y .git idénticos antes/después; no comandos de modificación de permisos/ACE/herencia/propietarios. No nueva auditoría de todos los descriptores del árbol. Riesgo B00 pendiente; dos Allow no resueltas y Deny Git conservadas.

Cero archivos de bases sintéticas restantes bajo .work/databases; cada Sandbox limpió exclusivamente sus archivos propios. Sin motores, servidores, HTTP/Atlas/AWS/Node o cuentas/credenciales reales. Los resultados finales son64 pruebas nuevas +598 regresiones reejecutadas=662 aprobadas,0 fallidas; compilación biblioteca/ejecutores0/0 y Godot C#0 errores/63 advertencias históricas,0 nuevas. Pruebas backend124 y manuales12/12 NO reejecutadas.

**B05.3A COMPLETADA EN CÓDIGO exclusivamente en el ámbito sintético. B05.3B y B05.4 no iniciadas.** Quedan pendientes integración real de captura/reconciliación/checkpoints, binding local en arranque, backfill/migración runtime autorizados, vectores C#/Node y receptor/trasporte remoto. No se afirma atomicidad completa gameplay–Outbox ni procedencia criptográfica de recibos simulados. Trabajo detenido a la espera de autorización expresa.


## B05.3B.1 — Captura y reconciliación sintéticas (2026-10-28 Guatemala)

Se revisaron contratos y servicios originales; se añadieron SyncReconciliationModels, SyncFactInventory, SyntheticOutboxReconciler y ReconciliationChecks, con cambios limitados al normalizador/servicio Outbox y dispatch/capability de tests. El dominio confirma primero; fallos/cuota/busy de la captura posterior no lo revierten. Se ensayaron página compartida en transacción sintética, reinicio/procesos, salida abrupta, cursores, backfill, huérfanos/contradicciones y dos procesos concurrentes. Resultado final51 nuevas y662 regresiones,713 aprobadas. Un error de compilación por IDictionary destino abstracto y un diagnóstico redundante oculto se corrigieron antes del cierre; no se contabilizan como éxito.124 backend y12/12 manuales son antecedentes no reejecutados.

Matriz de hechos, métodos/archivos, garantías, historial, pruebas, limitaciones y plan preciso B05.3B.2 en [B05_OUTBOX_CAPTURE_RECONCILIATION.md](B05_OUTBOX_CAPTURE_RECONCILIATION.md). B00 continúa pendiente. Detenido; sin iniciar B05.3B.2/B05.4.


## Cierre de integridad — 2026-10-28 Guatemala

Comparación antes/después:17 archivos deliberados (12 existentes modificados y5 nuevos), cero originales eliminados. Otros19 archivos existentes cambiados son artefactos generados por Rebuild bajo integration/sqlite/.work.godot (DLL/PDB/config/caché/AssemblyInfo generado); se contabilizan aparte de .work excluido. El toolchain conservó ese destino previo de artefactos pese a pasar GodotProjectDir; no se editó una fuente de Godot ni un csproj para modificarlo. De1.357 archivos iniciales inventariados,1.326 permanecen idénticos en hash/tamaño/mtime; no se declara idéntico todo el inventario cuando hubo recompilación.

Las tres bases protegidas y sus9 archivos asociados conservan exactamente hash/tamaño/mtime. Backend/.env coincide con la referencia histórica y mantiene tamaño/fecha. No se leyó su texto ni se usaron credenciales. Owner/SDDL de raíz/backend/.env/local-persistence/.git y carpeta backend iguales antes/después; no se modificaron ACL/ACE/herencia/propietarios. No es una nueva auditoría exhaustiva de cada ACL del árbol. B00 permanece pendiente, sin retirar las dos Allow ni cambiar Deny Git.

Migraciones SchemaManager/GameplayEventSchema/SyncOutboxSchema originales intactas: no nueva versión, runtime sin migrar. Código de GameSaveService, UnitOfWork, GameplayEventService, escenas, menús, FinNivel, Final, LocalGameState y GamePersistenceAdapter intacto. Cero archivos sintéticos restantes bajo .work/databases; sin restauración de respaldos, Node, HTTP, Atlas, AWS o ejecución de Godot.

Resultado final713 comprobaciones aprobadas,0 fallidas:51 nuevas +662 regresiones realmente reejecutadas. Biblioteca/ejecutores0 errores/0 advertencias; Godot C#0 errores/63 advertencias históricas,0 nuevas.124 backend y12/12 manuales no reejecutados.

B05.3B.1 COMPLETADA EN CÓDIGO únicamente como captura/reconciliación sintética posterior al commit. Sus garantías no incluyen revisiones intermedias ausentes, entrada humana precisa no exportable, telemetría nunca confirmada ni entrega remota. B05.3B.2 y B05.4 no iniciadas. Trabajo detenido; siguiente integración exige autorización expresa.


## B05.3B.2A — Respaldo y ensayo privado (2026-10-28 Guatemala)

Ensayo completado sobre segunda copia privada de runtime, sin migrar original: BackupDatabase read-only bajo bloqueos de escritura; backup y origen hash/metadatos intactos. Copia conservó base2/eventos1 y recibió sync1; integrity_check=ok,FK válidas y todo dominio/estadísticas idénticos. Primera reconciliación658 pendientes/1341 dependencias/0 diagnósticos; segunda en otro proceso0 nuevas,mismos IDs/payload/estados. No envío ni ACK remoto. Migración reaplicada idempotente y fallo precommit revierte otra copia desechable. Es tooling privado, no migrador runtime productivo: DDL exacto/checksum reutilizado sin relajar SyntheticDatabase. No ACL/owner/Godot/HTTP/Atlas/AWS.

Respaldo, SHA-256, conteos anonimizados, resultados, riesgos y plan B05.3B.2B en [B05_OUTBOX_RUNTIME_MIGRATION_TRIAL.md](B05_OUTBOX_RUNTIME_MIGRATION_TRIAL.md). Datos reales solo en privado fuera de Git/OneDrive; no imprimir IDs/decisiones ni restaurar. B00 pendiente. B05.3B.2B/B05.4 no iniciadas.


## Cierre verificado — 2026-10-28 Guatemala

**B05.3B.2A COMPLETADA.** Ensayo y preservación sobre el snapshot capturado satisfactorios; no activación de original. Resultado final de regresiones efectivamente reejecutadas:713 aprobadas,0 fallidas,0 omisiones (43 base+51 reconciliación+64 Outbox+555 restantes offline). Ensayo privado adicional descrito por separado, no sumado como cientos de tests por número de operaciones. Copia/reconciliación nueva0 diagnósticos; fallos provocados solo en copias desechables/sintéticas.

Inventario comparado antes/después:10 archivos deliberados (8 existentes modificados y2 nuevos), cero eliminados. Los1.354 restantes del inventario inicial de1.362 conservan hash/tamaño/mtime; artefactos .work excluidos, sin cambios adicionales de fuentes de Godot, librería local, Node o migraciones históricas.

Tres bases protegidas y9 asociados idénticos en hash/tamaño/mtime. Backend/.env coincide con referencia histórica, mismo tamaño/fecha, sin leer contenido. Owner/SDDL de raíz,backend,.env,local-persistence,.git iguales; sin modificación de ACL/ACE/herencia/propietario o restauraciones. B00 pendiente. Backup privado también conserva hash/tamaño/mtime/descriptor; contenido real no divulgado.

Cero archivos de bases sintéticas restantes bajo .work/databases. Copias PRIVADAS del ensayo/rollback y evidencias retenidas por contener la evidencia del trabajo autorizado, fuera de Git/OneDrive. No se sobrescribieron respaldos anteriores, no se restauró nada y no se ejecutó Godot/Node/HTTP/Atlas/AWS.

Recomendación:B05.3B.2B puede prepararse con autorización expresa basada en este ensayo, con NUEVO preflight y backup del estado vigente antes de tocar original. B05.3B.2B y B05.4 NO iniciadas. Detenido.


## B05.3B.2B — Activación local controlada (2026-10-28 Guatemala)

Implementados LocalOutboxPump/Scheduler,composición y solicitudes tras commit en GamePersistenceAdapter,diagnóstico en hilo Godot de GamePersistenceContext,cancelación antes de cerrar capability. Dominio/LocalGameState/FinNivel/Final/menús intactos. Nuevo modo --activate-runtime-outbox crea primero BackupDatabase privado y ensayoindependiente/dosprocesos;reacquiere lease/ruta/FileId/owner/estado,DDL+dos reconciliaciones en una transacción y validaciones postcommit. Resultado658 pending,0 nuevas en segunda,sin cambios dominio/estadísticas/ACL.28 pruebas nuevas y713 regresiones efectivas. Fallo inicial de espera asíncrona en test y resolución de SDK por NUGET_PACKAGES omitido corregidos antes de migrar. No restauraciones ni pruebas destructivas runtime.

Preflight,backup nuevo/hash,ensayo,migración,comparación,archivos/pruebas,riesgos y guía manual en [B05_OUTBOX_RUNTIME_ACTIVATION.md](B05_OUTBOX_RUNTIME_ACTIVATION.md). B00 pendiente;sin cambios ACL/propietario,autenticación remota,HTTP/Atlas/AWS oB05.4. Esperar validación manual e instrucciones.


## Cierre de integridad — 2026-10-28 Guatemala

**B05.3B.2B COMPLETADA EN CÓDIGO; VALIDACIÓN MANUAL GODOT PENDIENTE.**28 nuevas+713 regresiones efectivamente reejecutadas=741 aprobadas,0 fallidas. No sumar repeticiones ni filas de cola como tests. Ninguna prueba automatizada de errores se ejecutó contra runtime; su escritura fue exclusivamente el comando de mantenimiento autorizado tras ensayo y respaldo.

Inventario final comparado:20 archivos deliberados (15 existentes modificados y5 nuevos), cero eliminados;19 artefactos de compilación existentes bajo integration/sqlite/.work.godot cambiados se contabilizan aparte de .work excluido. Del inventario inicial1364,los1330 restantes permanecen idénticos en hash/tamaño/mtime. Sin cambios de migraciones históricas,fuentes originales de dominio/decisiones/finales o Node.

De9 archivos asociados a las tres bases, cambió SOLAMENTE runtime-game/save.sqlite3 por la migración sync1 y658 filas pendientes autorizadas. Las dos bases históricas AppData, sus manifiestos/leases y ownership.json/store.lease runtime permanecen idénticos en hash/tamaño/mtime. Runtime conserva FileId/owner/descriptor; tablas originales y estadísticas lógicas idénticas verificadas por la herramienta. No afirmar runtime íntegra byte-a-byte respecto del estado PRE-sync.

Backend/.env coincide con referencia histórica y conserva tamaño/fecha/owner/SDDL, sin leer contenido. Owner/SDDL de raíz/backend/.env/local-persistence/.git y carpeta backend iguales antes/después. Sin Set-Acl/ACE/herencia/propietarios/restauraciones;no se declara una nueva auditoría exhaustiva de cada ACL del árbol. B00 continúa pendiente.

Respaldo nuevo privado y copias de ensayo conservados e íntegros,ningún backup anterior sobrescrito. Backup SHA-256DC4CD39B47D79F3775825C3E0EFFC0C6CDAAC9B4F0849060D341969A085FFB0E. Nuevo backup/ensayo se crearon antes de migrar aunque el digest coincida con histórico. Cero archivos sintéticos bajo .work/databases y cero ejecutores propios restantes. Godot/HTTP/Node/Atlas/AWS no ejecutados. B05.4 no iniciada. Trabajo detenido a la espera de validación manual e instrucciones.


## B05.3B.2C — Auditoría runtime posterior a manuales (2026-10-28 Guatemala)

Auditoría temporal fuera de producción,Mode=ReadOnly+query_only y handles contra escritores/sustitución,sinWAL/SHM/journal. Se compararon fuentes/sobres/hashes/índices/dependencias/estadísticas sin invocar reconciliación de escritura.853pending vs658 iniciales,+195 por fechas;tipos17 game.report/23 session.report/98 gameplay.event/715 gameplay.interval.838/840 fuentes actuales presentes;faltan terminal e intervaloMenu3932ms de sesión más reciente. Última creaciónOutbox~300ms antes de cierre,código permite cancelar worker tras telemetría;causa compatible,no atribuida a acción específica sin traza. Filas anteriores5decisiones/92eventos/564intervalos idénticas albackup de activación. No reparación,código productivo/SQLite/StatisticsService intactos.741tests no reejecutados.

Resultados,condiciones de lectura,cobertura,faltantes y recomendación en [B05_OUTBOX_RUNTIME_POSTVALIDATION.md](B05_OUTBOX_RUNTIME_POSTVALIDATION.md). Solo lectura/documentación,sin cambios runtime,ACL,.env oproducción. Esperar instrucciones;noB05.4.


## Verificación final de no modificación

Inventario antes/después:5 documentos existentes autorizados actualizados y1 informe nuevo,cero eliminados. Los1364 archivos restantes del inventario inicial de1369 conservan hash/tamaño/mtime. Herramienta y artefactos temporales solo bajo .work excluida;ningún archivo de producción,proyecto oStatisticsService cambiado.

Las tres bases originales y9 archivos asociados idénticos en hash/tamaño/mtime durante esta auditoría, incluida runtime posterior al juego manual. No comparar su hash actual con el PRE-sync para exigir igualdad;se comparó exactamente el estado al inicio de esta fase.

Backend/.env coincide con referencia histórica,tamaño/fecha intactos,sin leer valores. Owner/SDDL de raíz,backend,.env,local-persistence,.git iguales antes/después;sin cambios ACL/ACE/owner/herencia. B00 pendiente. El backup privado de activación leído como referencia conserva su SHA-256 esperado. No exportación de datos personales,restauración o copia mutante.

Resultado **PARCIAL para cierre B05.3**:853pending,840fuentes actuales elegibles/838representadas,2faltantes confirmados.No se repararon. Integridad y dominio coherentes;B05.4A no iniciada. Las741pruebas y15/15manuales son resultados anteriores/informados,no nuevos tests. Trabajo detenido.

## B05.3B.2D — Diagnóstico de captura al cerrar (2026-10-28 Guatemala)

- Resultado:COMPLETADA solo diagnóstico y recuperación sintética;B05.3 sigue pendiente.
- Auditoría nueva read-only:853pending,838/840fuentes actuales,terminal cerrado e intervalo Menu3932ms faltantes;dominio íntegro y estadísticas efectivas1146846ms.
- Reproducción:observador confirma fuentes,scheduler solicitado se cancela antes de captura.Reconciliación existente recupera2,segunda pasada0 y reinicio0;mismos UUID/payload/huellas;sin sumar menú al efectivo.Causa compatible demostrada en fixture;sin traza concluyente del shutdown real.
- Cambios:1 suite nueva y3 archivos del ejecutor sintético(selector/visibilidad de fixtures);informe B05_OUTBOX_SHUTDOWN_RECOVERY y6documentos autorizados actualizados.Ningún código productivo/Godot/schema cambiado.
- Ejecuciones:24nuevas+741regresiones=765aprobadas;lib/ejecutores0errores/0advertencias;rebuild Godot C#0errores/63históricas,0nuevas;motor no iniciado.
- Integridad:sin reparación runtime,modificación bases históricas,.env,ACL/owner o fuentes de juego.NoHTTP/Node/Atlas/AWS.B00 pendiente.
- Siguiente paso propuesto:NO aplicado;drenaje acotado tras commit final de telemetría y antes de tree.Quit,con recuperación idempotente al inicio,preflight/backup/ensayo y reparación real solo con autorización explícita.No iniciar B05.4.Detalles y límites en [B05_OUTBOX_SHUTDOWN_RECOVERY.md](B05_OUTBOX_SHUTDOWN_RECOVERY.md).

## B05.3B.2E.1 — Corrección del cierre y recuperación

2026-10-28, Guatemala. **COMPLETADA EN CÓDIGO; manuales Godot pendientes.** B05.3 no cerrada.

- Unidad verificada en modelo, DDL, reloj, serialización y fotografía read-only anterior: 0..3932 milisegundos, equivalentes a 3,932 segundos. Menu excluido del efectivo; intervalo real sin convertir ni escribir.
- Código: LocalOutboxScheduler.DrainAsync/LocalOutboxDrain, GamePersistenceAdapter.DrainOutboxAsync y GamePersistenceContext.QuitAsync coordinado; suite nueva OutboxBoundedCloseChecks y selector en GameSaveChecks. Sin cambios en esquemas, reconciliador, finales, decisiones, estadísticas o escenas.
- Orden: telemetría hasta 3 s, barrera hasta 1 s después de la fuente confirmada, limpieza hasta 1 s y salida única. Timeout no afirma captura completa. La limpieza gestionada espera el cierre fuente antes de cancelar el worker.
- Pruebas: 26 nuevas + 765 regresiones = 791 aprobadas, cero fallidas. Biblioteca y ejecutores sin errores ni advertencias. Godot C# sin errores, 63 advertencias históricas y cero nuevas; motor no ejecutado.
- Documentación: siete documentos autorizados actualizados, incluidos informe principal y manual E.2.
- Integridad: sin reparación runtime ni cambios en bases históricas, .env, ACL o propietarios. B00 pendiente. Sin Node, HTTP, Atlas ni B05.4.
- Próximo paso: autorización expresa de preflight, respaldo, ensayo, recuperación real y validación manual. Runtime conserva 853 pending y dos faltantes. [Garantías y límites](B05_OUTBOX_SHUTDOWN_RECOVERY.md).

## B05.3B.2E.2 — Recuperación controlada Outbox runtime

2026-10-28, Guatemala. **COMPLETADA, sin necesidad de recuperación adicional.**

- Antecedente manual: usuario informa 10/10 de E.1 satisfactorios; no motor ejecutado por el agente.
- Preflight y final: 906 pending, 889/889 hechos actuales representados, cero faltantes. Los dos hechos antiguos ya están capturados; Menu conserva 3932 ms y aporte efectivo animal cero.
- Respaldo nuevo mediante BackupDatabase en directorio privado único, SHA-256 093C5EBF5D6BE334848E904613792913C9034B0955CD586FEE658E7BE3DD9F4D. Apertura, integridad/FK, tablas/esquema/estadísticas verificadas; respaldo inmutable.
- Ensayo independiente: dos pasadas del reconciliador existente, cero inserciones en ambas, IDs/sobres/estados y tablas intactos. Un primer ensayo fue revertido por chequeo incorrecto Committed del helper, corregido únicamente en tooling temporal; se repitió con respaldo y copia nuevos. Una expectativa de hash equivocada en lectura se corrigió contra baseline del origen, sin cambio real del archivo. Detalles transparentes en informe.
- Runtime: cero aperturas de escritura, cero inserciones, sin restauración o migración. Auditoría final 08:50:38.9398234Z satisfactoria: cero duplicados, contradicciones, huérfanos o dependencias incompletas, integridad ok y FK válidas. Tiempo efectivo actual 1158719 ms conservado, también partida activa, historia, decisiones y finales.
- Pruebas: 791 regresiones sintéticas reejecutadas, 791 aprobadas, cero fallidas; cero pruebas nuevas. Tooling/base compilados sin errores ni advertencias. Compilación Godot y 63 advertencias corresponden a E.1; no repetidas aquí.
- Documentación: informe nuevo B05_OUTBOX_RUNTIME_RECOVERY_RESULT y seis documentos autorizados actualizados; sin código productivo o gameplay cambiado.
- Integridad: tres bases y nueve archivos asociados idénticos durante E.2, .env histórico y ACL/propietarios conservados; B00 pendiente. Sin Node/HTTP/Atlas/AWS.
- Estado: B05.3 completada en su ámbito local, con auditoría final satisfactoria; B05 completo y receptor remoto no cerrados. Proponer B05.4A separado, no iniciarlo. [Informe y rutas privadas](B05_OUTBOX_RUNTIME_RECOVERY_RESULT.md). Trabajo detenido.

## B05.4A — Auditoría y diseño de recepción remota

2026-10-28, America/Guatemala. **COMPLETADA COMO DISEÑO.**

- Inspección: 14 documentos obligatorios; app/server/config, JWT/auth/identity-repository y middleware reales, package/lockfile, tests JWT/identidad/legacy, productor/reconciliador/modelos/validador SQLite, catálogo y regla de finales.
- Hallazgos: Zod y JWTv2 sí existen en código aislado; no Mongo productivo ni receptor. authenticate verifica binding pero devuelve solo id/role/sessionId; se elige resolución adicional desde repositorio, no UUID del body. SimulatedSyncReceipt/Confirm no prueba procedencia de red. CanonicalEnvelope no incluye operationId ni intento/dependencias.
- Decisiones de diseño: POST /api/v2/sync/batches, transporte2 preservando bytes del sobre1; consulta v2 de recibos; 200 solo todos positivos y 207 parcial; semántica de unknowns/intervalos/sesión interrupted; recibo durable separado del intento y commit atómico con hechos/proyecciones; dedupe, alias, fences por revocación/sesión y rechazo de conflictos.
- Entregables: dos documentos nuevos y seis existentes autorizados actualizados. Nada de código/paquetes/endpoints implementado. Diseños históricos quedan identificados y no se mezclan con estado actual.
- Verificación: cotejo estático de campos/contratos, referencias y alcance documental. Cero tests, compilaciones, servidores o procesos Node/Godot ejecutados. 791 regresiones y 124 backend son antecedentes; T01–T35/V01–V15 son plan futuro.
- Integridad: las tres bases y nueve archivos asociados comparados por hash/tamaño/fecha/owner/SDDL sin SQL; .env solo metadata/atributos/owner/SDDL, no lectura ni hash. SHA histórico de .env citado desde E.2, no recalculado. No cambios ACL/herencia/owner ni acceso a secretos.
- Pendientes: vectores C#/Node, transporte/ACK, binding cliente, repositorio/índices/transacciones Mongo, custodia y B00. B05.4B no iniciada, sin HTTP/Atlas/AWS. Solicitar autorización separada de implementación sintética y modos de prueba; detenerse.

Documentos normativos: [arquitectura](B05_REMOTE_INGESTION_ARCHITECTURE.md), [pruebas](B05_REMOTE_INGESTION_TEST_PLAN.md), [API actual de diseño](B05_SYNC_API_CONTRACT.md).

## B05.4B — Receptor Express con repositorio sintético

2026-10-28, America/Guatemala. **COMPLETADA EN CÓDIGO, exclusivamente sintética.**

- Revisión de13documentos obligatorios y código real. Primera puerta: exportador de servicios C# reales genera inicialmente53y luego63vectores, todos compatibles en canonicalEnvelope/hash/forma Node; cuatro tipos, seis eventos, nulls/UTC-ms/MAX_SAFE_INTEGER. Segunda puerta: JWTv2 existente, cuenta/sesión/owner/binding y revocación verificados antes de componer endpoints. Productor/contratos C# sin cambios.
- Backend: módulos sync schemas/parser/semántica/puerto/servicio/router/errores/budget y middleware de contexto autenticado; app.js opt-in. Endpoints POST /api/v2/sync/batches y /receipts/query. Defaultapp/server siguen sin sync ni producción; no nuevas rutas admin ni cambios a autenticación existente.
- Test-support: repositorio de ingestión sintético memoria/archivo cifrado; coordinador común con mutaciones opcionales del repositorio sintético de identidad; EncryptedStore admite nombres de ensayo adicionales. No adaptador Mongo ni secretos de producción.
- Garantías demostradas: commit operación+hecho+recibo, claves estables, duplicate/conflict, alias sin doble efecto, superseded sin retroceso, rangos sin solapamientos positivos/intervalos vacíos orden-independientes, recibos por elemento y207parcial, pérdidas de respuesta/reinicio HTTP en procesos nuevos, concurrencia y revocación. Crash abrupto conserva snapshot/receipt pero deja lock residual503; no recuperación automática insegura.
- Pruebas actuales:39legacy+50JWT+35identidad+67nuevas ingestión=191backend;64regresiones C# Outbox adicionales;255aprobadas,0fallidas finales.50casos A trazados sin bloqueos, T34 por124regresiones existentes.67nuevas:59memoria/contratos/HTTP y8persistencia. No sumar repeticiones o63vectores al total.
- Validación:37JS Node --check sin errores; exportador C# .NET8 0errores/0advertencias. No build/motor Godot,791regresiones históricas no reejecutadas completas. Primer lanzamiento inline Node falló por quoting de PowerShell y se sustituyó por archivo; Vitest inicialmente EPERM de sandbox, reejecutado con permiso de subprocesos/loopback/fixtures; sin modificaciones ACL ni incompatibilidad contractual.
- Integridad: sin migraciones o escrituras a las tres bases reales/archivos asociados; .env conservado, sin mostrar valores, hash histórico verificado. No cambios de ACL/owner/herencia ni credenciales productivas. Fixtures privadas cifradas fuera de OneDrive, maestro solo RAM/IPC; cierre/limpieza verificados.
- Entregables: código/pruebas y los ocho documentos autorizados actualizados. [Inventario y limitaciones](B05_REMOTE_INGESTION_ARCHITECTURE.md), [matriz ejecutada](B05_REMOTE_INGESTION_TEST_PLAN.md).
- Pendientes: Mongo real/índices/transacciones/fences, custodia/rotación/antirollback/HA, emisor Godot y B00. No datos reales enviados, Atlas/AWS ni B05.4C. Recomendar revisión/ensayo sintético Mongo autorizado por separado; trabajo detenido.

## B05.4C.1 — Adaptador MongoDB/Mongoose aislado (2026-10-28)

**COMPLETADA EN CÓDIGO; PROBADA CON DOBLES; NO VALIDADA CONTRA MONGODB LOCAL.** Este estado sustituye las indicaciones históricas de «C no iniciada» únicamente dentro del alcance sintético autorizado de C.1. MongoDB real/Atlas y producción siguen sin habilitarse.

Modelos de operaciones (recibo embebido), hechos y controles; índices únicos cuenta/operationId y scope/sourceKey; adaptador inyectable por el mismo puerto. Los cuatro sobres, bytes/hash y contratos HTTP/JWT/recibos se conservan. Transacción con snapshot/majority/journal, escritura de fence Mongo y barrera de sesión/autorización obligatoria; no se utiliza el bloqueo de archivos de B. Ante resultado incierto, 503 sin ACK especulativo y retry con la misma clave. Sin nuevas rutas admin o cambios de app/server.

Mongoose 9.11.2 instalado exclusivamente desde caché local, sin scripts ni descargas de servidor. No mongod/mongosh disponibles en PATH; Docker Desktop sin motor activo. No se conectó una base MongoDB, personal o remota. Las verificaciones de índices/topología/transacciones y concurrencia nuevas utilizaron dobles, no prueban garantías del servidor real. La identidad Mongo y su acoplamiento duradero con revocaciones/control de sesión permanecen bloqueantes para cualquier despliegue; no basta copiar controles desde memoria o usar un callback permisivo.

**235 pruebas backend aprobadas: 44 nuevas con dobles + 191 regresiones (39 legacy, 50 JWT, 35 identidad persistente y 67 ingestión B). Cero fallidas finales.** Las ocho regresiones de archivos de B siguen siendo persistencia sintética, no Mongo. Gates C#/Node (63 vectores) e identidad/vínculo aprobados; 43 archivos src/sync-tests sin errores de sintaxis. No se suman vectores o ejecuciones repetidas al total. No se reejecutaron las 64 pruebas C# ni las 791 históricas completas, ni se compiló/inició Godot.

Una aserción JWT histórica que prohibía instalar Mongoose se actualizó, con justificación técnica, para exigir que la composición JWT siga independiente/desconectada y permita login local sin Mongo. El resto de la batería se conservó. Primer pase completo: 234 aprobadas y ese único fallo; pase final: 235 aprobadas. EPERM inicial de Vitest se resolvió mediante permiso de subprocesos, sin alterar ACL.

Tres bases protegidas: hashes/tamaños/fechas/propietarios/ACL idénticos antes/después, sin SQL ni operaciones reales enviadas. `.env`: 278 bytes, fecha/propietario/SDDL idénticos; **no se abrió ni recalculó su hash en C.1**. El SHA histórico sigue documentado, sin una nueva certificación del contenido. No comandos de cambio de ACL, propietarios o herencia. B00 pendiente; cero procesos de ensayo o fixtures privadas restantes.

Recomendación C.2: autorización separada de entorno replica set local nuevo y desechable, binario confiable, rutas exclusivas y loopback; integrar identidad/revocación transaccional y probar índices, carreras, commit incierto y recibos tras reinicio reales. Prototipo acotado (1000 operaciones/2 MiB, fence global) pendiente de rendimiento, custodia y controles productivos. No Atlas, Godot HTTP, operaciones runtime, AWS o B05.5. Trabajo detenido.

[Inventario, modelos, garantías, resultados y límites](B05_MONGODB_ADAPTER_IMPLEMENTATION.md).
## B05.4C.2 — Preflight: INFRAESTRUCTURA PENDIENTE

2026-10-28. Inspección completada sin iniciar servidores o instalar software. No se halló mongod/mongosh en PATH ni en ubicaciones de instalación revisadas; sin servicios Mongo/Docker ni procesos Mongo activos. Compass 1.53.0 instalado; Docker Desktop 4.95.0 sin motor disponible. Puerto propuesto 27184 sin listeners y aproximadamente 107,5 GiB libres. La búsqueda acotada no descarta una instalación portátil no declarada.

La puerta de infraestructura exige detenerse: **0 integraciones Mongo reales y 0 pruebas automatizadas ejecutadas en C.2**. Las 235 aprobadas de C.1 siguen siendo evidencia anterior, no reejecutada. Se prepararon configuración local y matriz de 30 casos pendientes; índices, transacciones, recibos, reinicios y carreras reales siguen sin verificar. La identidad memoria/archivo no actualiza los controles Mongo al revocar: la corrección de coordinación está propuesta y no implementada. No usar un callback permisivo ni copiar controles una sola vez como garantía.

Tres bases protegidas: hash/tamaño/mtime/owner/SDDL iguales antes/después; propietario/SDDL de raíz y backend iguales. `.env` no se consultó, abrió ni hasheó; no se certifica de nuevo su contenido o ACL individual. No cambios de permisos/herencia/propietarios, código, contratos, Godot o SQLite. B00 pendiente.

[Informe de infraestructura, propuesta y pruebas pendientes](B05_MONGODB_LOCAL_INTEGRATION.md). La siguiente acción requiere infraestructura local desechable explícitamente autorizada y repetir el preflight. Sin Atlas, descargas automáticas, activación Docker, AWS o B05.5. **INFRAESTRUCTURA PENDIENTE; trabajo detenido.**
## B05.4C.2C — Modo Atlas explícito, sin conexión remota

2026-10-28. **COMPLETADA EN CÓDIGO Y DOBLES; NO VALIDADA CONTRA ATLAS.** Factory sin conector por defecto y sin selección por variables de entorno. Host/usuario/base exactos, TLS estricto, permiso inspeccionado mediante connectionStatus de solo lectura y scope interno por runId; rama local conserva loopback/base temporal/sin credenciales. Creación del repositorio requiere allowWrites explícito y modelos de colecciones exclusivas; autoCreate/autoIndex desactivados. Arranque, endpoints, cuatro sobres y JWT existentes sin cambios.

Canal de credenciales opaco de un uso/RAM y lanzador manual de una futura D: exige autorización, ruta privada y receptor con hash revisado antes del prompt. Solo probado con buffers ficticios; no secreto real recibido ni conexión Atlas. Identidad/revocaciones siguen en memoria/archivo y no se declara coordinación durable resuelta. B00 pendiente.

**271 pruebas backend aprobadas: 36 nuevas + 235 regresiones; cero fallidas finales.** Los 63 vectores C#/Node y gate de identidad pasaron; no se suman como tests nuevos. 48 JS sin errores de sintaxis; parser PowerShell sin errores y arranque sin autorización denegado antes de pedir credencial. No .NET/Godot ejecutados, instalaciones, datos reales o ACL modificados. Las tres bases se comparan por integridad/metadatos; .env excluido de lectura/hash.

[Configuración, archivos, pruebas, límites y propuesta D](B05_ATLAS_INTEGRATION_MODE.md). D requiere autorización de conexión real inicialmente de lectura, credenciales temporales, ruta/receptor revisados y tratamiento explícito de B00/identidad durable. Ninguna escritura/limpieza remota autorizada por C.2C. B05.4C.2D y B05.5 no iniciadas; trabajo detenido.
## B05.4C.2D.1 — Diagnóstico real de solo lectura bloqueado

2026-10-28. **BLOQUEADA / NO COMPLETADA.** El usuario activó dos canales privados; ambos terminaron con atlas_connection_unavailable antes de verificar autenticación/destino/permisos. Resúmenes no secretos conservados por ejecución, cierre indicado y cero escrituras/transacciones. No presentar Compass o la entrega del canal como conexión Mongoose satisfactoria.

Se corrigió una incompatibilidad local del factory: el driver rechaza tlsInsecure junto a tlsAllowInvalidCertificates/Hostnames aunque sean false. Se retiró el flag redundante conservando TLS estricto y se endureció la comprobación de sus opciones normalizadas. Los constructores reales sin connect comprueban esa corrección. El segundo fallo sigue sin causa concreta determinada por su resumen sanitizado. DNS SRV Windows/Node y un handshake TLS independiente del clúster autorizado resultaron satisfactorios sin credenciales; no acreditan autenticación.

35 pruebas sintéticas distintas aprobadas: 13 nuevas de diagnóstico/driver sin red + 22 regresiones de lectura/configuración. 14 casos excluidos por filtro, sin ejecutarlos ni contarlos como aprobados; las 271 anteriores no se reejecutaron completas. El sender bloquea ahora un resultado existente antes del prompt para evitar pedir otra contraseña en un run consumido. No credenciales reales en chat, args, env o archivos; no .env, Godot, índices, modelos, identidades o usuarios remotos modificados. B00 e identidad durable pendientes.

[Resultado completo, evidencias, corrección y límites](B05_ATLAS_READONLY_CONNECTION_RESULT.md). Un diagnóstico posterior deberá categorizar errores sin secretos y preservar las barreras; no autorización implícita de escrituras o transacciones. D.2 y B05.5 no iniciadas; trabajo detenido.