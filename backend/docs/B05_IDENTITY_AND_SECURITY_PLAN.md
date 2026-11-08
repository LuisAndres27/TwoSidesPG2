# B05.1 — Identidad técnica y seguridad
2026-10-27 · Solo diseño. B00 sigue pendiente; no se lee ni utiliza contenido de .env, no se cambian ACL.

## Qué existe
IDENTITY_DESIGN, IDENTITY_API_CONTRACT y AUTH_SECURITY_DESIGN separan nombre, UUID local, registro idempotente y credencial por perfil. En Node están implementados registro/sesión/me con cuenta en memoria, credencial de32bytes base64url canónica, Argon2id(salt16bytes, memoria65536KiB, timeCost3, parallelism1, hash32), token opaco900s y SHA-256 del token. No JWT/refresh token, roles ni persistencia remota.

SQLite tiene registration_status LOCAL_ONLY/REGISTRATION_PENDING/REGISTERED/RECOVERY_REQUIRED y referencias opcionales; LOCAL_ONLY exige referencias nulas. No hay bootstrap de credencial, DPAPI, installation_id o asociación remota funcional en el arranque local. Los registros de tests no son cuentas del usuario. Un .gitkeep de Mongo no es un repositorio. Límite Argon2/quotas actual es por proceso, no defensa distribuida de producción.

## Identidades propuestas
| Campo | Creación/custodia | Semántica |
|---|---|---|
| installationId UUIDv4 | Cliente, nuevo registro sync_installation | Instalación lógica de esta copia/perfil, no huella de hardware. Persistir antes de registrar. No generar cada inicio. |
| localPlayerId UUIDv4 | Perfil SQLite existente | Mantenerlo; nombre visible solo etiqueta local y no se exporta por defecto. |
| registrationId UUIDv4 | Cliente, SQLite antes de envío | Idempotencia de alta y binding estable; no secreto. |
| technicalAccountId UUIDv4 | Servidor duradero | Identificador remoto del jugador técnico; no “persona humana única”. |
| credentialRef | SQLite | Referencia, nunca contraseña, token o PHC exportado. |
| bindingGeneration | Cliente+servidor | Cambiar solo con reasociación/transferencia aprobada; rotar credencial cambia credentialVersion, no el binding de los hechos pendientes. No reasignar datos a otra cuenta automáticamente. |

Un perfil/instalación se registra sin correo/contraseña visible. No usar login de escenas antiguo como pantalla alternativa. Mantener correo reservado sintético legado solo si compatibilidad lo requiere; no inventar correo personal ni usarlo para recuperación.

Secuencia futura: generar secreto CSPRNG32bytes; persistir blob protegido y comprobarlo; transacción local guarda installationId/registrationId/credentialRef/REGISTRATION_PENDING con binding al perfil; solo entonces registrar. ACK confirma technicalAccountId/binding/REGISTERED en SQLite. No transacción distribuida entre secreto/SQLite/API: material huérfano se reconcilia por referencia, nunca se envía sin prueba de custodia y nunca se regenera tras timeout de registro. Respuesta perdida→mismo registrationId/credencial/binding.

Proteger credencial mediante DPAPI CurrentUser en ubicación privada fuera de repositorio/OneDrive (ruta exacta propuesta por perfil/installationId debe aprobarse antes de crear). No LocalMachine como fallback; blob versionado, escritura atómica sin sobrescribir secreto ajeno, ruta normal sin enlaces, permisos mínimos comprobados. DPAPI normalmente requiere el mismo contexto de usuario/equipo y no es copia portable universal; tampoco protege de malware en ese usuario. [Microsoft CryptProtectData](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata).

## Sesiones, renovación y revocación
Conservar estrategia opaca para player: token aleatorio900s en memoria, hash remoto durable, binding account+installation+credentialVersion. Renovar mediante POST de sesión con credencial protegida, no registrar cuenta nueva. Sin JWT ni refresh token obligatorios en v1; introducirlos sería contrato nuevo. Reintentar auth una vez por401 de recurso; expiración de credencial/revocación real detiene sync hasta recuperación autorizada, sin bloquear jugar.

Cuenta, registro, binding y versión deben ser durables antes de usar jugadores reales. Sesiones con expiración comprobada en cada petición, revocación por versión, límite de sesiones por instalación/cuenta definido y probado (el límite3 legado puede conservarse inicialmente, no es control multiPC). No depender de borrado TTL para expirar autorización. Limitador compartido y cuotas por IP/account/installation, protección de pool y body, trusted proxy configurado solo según topología; TLS para cualquier transporte externo. Logs solo requestId/códigos, sin Authorization, secretos, cuerpos de registro o decisiones personales.

Rotación futura con prueba del secreto vigente y nuevo blob confirmado, credentialVersion monotónica y fase recuperable; nunca reemplazo silencioso por fallo de descifrado. Revocar cuenta/binding impide nuevos envíos; progreso no se pierde. Administración puede revocar permisos remotos, no borrar SQLite por red.

## Reinstalación, copias y varias computadoras
- Misma DB+blob utilizable: verificar binding remoto antes de reenviar, mismo source_key/UUID.
- Solo nombre o DB sin secreto: no acredita cuenta; RECOVERY_REQUIRED. No fusionar por displayName.
- Reinstalar Windows/perder contexto DPAPI: no prometer recuperación. Proponer recovery code de alta entropía con verificador/revocación o exportación cifrada explícita; NO implementar ninguna opción sin aprobar su custodia.
- Clonar DB en otra PC: puede conservar GameId/session/event IDs pero cambiar instalación; servidor detecta fuente incompatible. No duplicar como otra persona ni apropiarse de cuenta con localPlayerId. Transferencia de fuente exige autorización/registro de transferencia.
- Dos PCs legítimas: no cloud-save ni merge de partidas en B05. Una identidad multinstalación necesitaría recovery/enrollment comprobado y política de una sola partida activa por jugador; hasta definirla, fuente única por partida y bloqueos de conflictos de sync, nunca de juego offline. Las partidas activas reportadas pueden ser conflictivas/desactualizadas; no prometer autoridad remota de la activa real.

## B00: evidencia y corrección propuesta, NO ejecutada
PHASE_HISTORY y AUTH_SECURITY_DESIGN registran SID S-1-5-21-452213140-3335518246-3718727391-3248334987 no resuelto, Allow Modify/Synchronize heredado en backend/.env desde ACE explícita en raíz Two-Sides PRUEBA. El origen del proceso y acceso efectivo no quedaron determinados. No atribuirlo a cuenta eliminada ni afirmar compromiso. Hash íntegro no resuelve exposición ni permisos. OneDrive puede tener otras copias con controles distintos.

B05.1 no revalida identidades de Windows ni modifica ACL; toma ese registro como riesgo pendiente. Antes de secretos reales/despliegue:
1. Repetir solo lectura de ruta exacta, ausencia de enlaces/hardlinks inesperados, tamaño/hash278/histórico, propietario/SDDL/ACE/IsInherited y ascendencia dentro de la copia; traducir SID y consultar cuentas locales sin contenido ni servicios externos. Detener ante diferencias no autorizadas.
2. Definir principales autorizados para esta ejecución/despliegue y alcance mínimo. Exportar descriptor/metadatos a evidencia privada con nombre único (no contenidos); plan de reversión del descriptor, no restauración automática.
3. Revisar permisos efectivos también de directorios ancestros: bloquear lectura del archivo no basta si otro principal puede reemplazarlo por permisos en carpeta. No aplicar Deny genérico o desactivar herencia masivamente.
4. Seleccionar una corrección concreta y revisable: eliminar solo ACE explícita injustificada en origen si se autoriza el impacto sobre descendientes, O proteger un archivo/directorio de secretos privado aislado conservando permisos necesarios. Cambiar herencia del archivo copiando ACE y quitando solo SID requeriría autorización específica y no elimina riesgos de ancestros. No emitir un comando genérico de borrado recursivo de ACL.
5. Solicitar autorización independiente para ese descriptor/ruta/alcance precisos; ejecutar una sola corrección controlada en esa fase, con rollback limitado y comprobaciones posteriores.
6. Verificar propietario y ACE esperadas, herencia, acceso legítimo, ausencia de permisos inesperados y contenido/hash/size/fecha sin cambio por operación ACL. Evaluar rotación de secretos potencialmente expuestos por separado, sin leerlos aquí ni declarar que deban rotarse sin evidencia.
[icacls](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls) distingue entradas heredadas y cambios de herencia; aquí no se ejecutó ninguna modificación.

## Secretos de despliegue y panel
Preferir gestor de secretos en servidor con identidad de workload/permiso mínimo y rotación; .env privado solo desarrollo controlado, nunca bundle Godot/panel/Git. Credenciales Atlas de aplicación limitadas a su BD, separadas de bootstrap/admin/lectura analítica; conectividad restringida/TLS según topología aprobada. Una credencial administrativa nunca viaja a cliente.

Propuesta AWS posterior: Secrets Manager con IAM de tarea/servicio y logs/redacción/cifrado; alternativa SSM SecureString bajo controles equivalentes si el análisis de requisitos lo justifica. Sin elegir ni aprovisionar recursos en B05.1. AWS recomienda gestionar, limitar acceso y rotar secretos. [Buenas prácticas oficiales](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html).

Admin: identidad humana separada de cuenta player, MFA, proveedor OIDC y rol stats:read derivado del servidor; no aceptar rol en registro del videojuego ni promover por campo body. Navegador→API administrativa, nunca Atlas. Tokens de admin con issuer/audience/expiración y separación de secretos; definir cookies HttpOnly/Secure/SameSite y CSRF si se adopta sesión web. CORS allowlist no sustituye auth; sin endpoint administrativo actual. Auditoría de acceso a agregados y protección de grupos pequeños, retención/minimización de datos antes del panel.

Puerta B05.2: aprobar corrección B00 concreta, namespace privado/ruta de secreto, lifecycle/binding y pruebas solo sintéticas; sin Atlas ni credenciales reales por inferencia.



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


## B05.2C — JWT y roles en memoria (2026-10-27 Guatemala)

**COMPLETADA EN CÓDIGO Y PRUEBAS AISLADAS.** Informe completo/inventario en B05_IDENTITY_IMPLEMENTATION_PLAN.md y PHASE_HISTORY.md. JWT mediante jose6.2.13, validadores Zod4.6.7 y tests Vitest5.0.5; dependencias exactas/lockfile, sin scripts de instalación. Argon2id, límites y39 pruebas legacy conservados.

RS256 con claves efímeras de fixture y algoritmo explícito; typ at+jwt/kid,iss reservado de test y aud exacta única,sub UUID,jti sesión conocida,iat/nbf/exp900s y cv/role obligatorios. Firma y claims preceden validación de cuenta activa/sesión/rol real/versión en repositorio. Token inválido401, privilegio/propiedad insuficiente403. Nunca confiar en role de body o payload alterado.

Rutas JWT opcionales configuradas explícitamente: POST /api/v1/technical/registrations y /sessions; GET /api/v1/technical/me, /api/v1/players/:id (propio,player) y /api/v1/admin/status(admin). Registro nuevo no acepta nombre/email/role ni devuelve correo; admin solo fixture opt-in del servidor. Rutas legadas sin /v1 siguen opacas; no aceptan JWT y las nuevas no aceptan opacos. No hay binding installationId ni sync completo implementados: propuesta B05.1 se ampliará/versionará explícitamente después. No admin OIDC/MFA o cuentas reales.

Defaultapp no crea claves ni activa JWT. Config inyectada solo isolated-test; producción se rechaza antes de listen aunque se suministren valores de prueba. Requisitos de claves/issuer/audience de producción son futuro diseño fuera de OneDrive, no .env cargado. Vitest envDir=false y guardas de IO impiden leer .env. Todos los secretos/tokens de tests se generan en RAM; no se imprimen.

89 pruebas backend aprobadas:39 regresiones+50 nuevas,0 fallidas finales. Node24.19/npm11.17; primeros workers bloqueados por sandbox EPERM y reejecutados con permiso de ejecución, sin modificar ACL. HTTP solo loopback/puerto0 de tests y cierre posterior. No Godot ni598 pruebas del juego reejecutadas.

Bases protegidas y9 asociados idénticos hash/tamaño/fecha; .env coincide con referencia y seguridad/metadata igual,4 Deny .git conservadas.677 archivos juego/raíz sin diferencias de metadata/DACL contra backup previo;23 backend existentes sin diferencias ACL/owner. El digest global que incluía caché npm cambió por instalación/logs y no se declara idéntico. Cambios deliberados21 archivos (14 código/dependencias/tests y7 documentos), más artefactos npm. No gameplay/SQLite/estadísticas/evaluador/ACL/herencia/owner modificados.

Persistencia sigue en memoria y se pierde al reiniciar. B00 continúa pendiente; sin Atlas, Godot sync, despliegue, corrección ACL o B05.3. Detenido; próxima implementación requiere autorización.


## B05.2D.1 — Identidad persistente y claves (2026-10-27 Guatemala)

**COMPLETADA únicamente como auditoría y diseño; sin implementación.**

Decisiones propuestas: perfil/localPlayerId/installationId/cuenta remota/credencial separados; nombre solo local; un vínculo activo por cuenta inicialmente, sin recuperación por UUID ni nombre. DPAPI CurrentUser/Credential Manager se evaluarán fuera de OneDrive. Admin OIDC/MFA con cadena de confianza separada; fixtures no son cuentas reales. Revocación stateful, secretos separados y ninguna dependencia de gameplay.

Contratos: [identidad persistente](B05_PERSISTENT_IDENTITY_CONTRACT.md), [ciclo de claves](B05_JWT_KEY_LIFECYCLE.md), [plan de pruebas](B05_IDENTITY_PERSISTENCE_TEST_PLAN.md). Las propuestas no habilitan producción ni modifican contratos implementados. Backend/.env conserva la referencia histórica; las tres bases y sus asociados permanecen protegidos. B00 no resuelto: dos Allow no identificadas; respaldo privado y ensayo limitado no garantizan restauración general. Detenido a la espera de autorización, sin iniciar B05.2D.2/B05.3.


## B05.2D.2 — Seguridad efectiva del ensayo (2026-10-27 Guatemala)

JWT v2 opcional reutiliza firma/validación RS256 de B05.2C; ver2 y binding/versiones consultados contra estado sintético persistente. Cliente no fija rol; v2 solo player. Admin sintético sigue exclusivamente en mecanismo interno v1, sin aprovisionamiento real ni acceso por JWT player. Middleware conserva 503 cuando no puede consultar seguridad; nunca fail-open o fallback opaco.

Datos/claves de prueba cifrados con maestra en RAM, en carpeta privada UUID fuera de OneDrive/Git/runtime, ACL heredada existente verificada sin modificar. No persistencia de credencial original ni tokens. Directorios sintéticos se eliminan tras cada caso con comprobación de ruta, propietario y ausencia de reparse. No se certifica DPAPI, defensa frente a administrador/malware/rollback o secretos productivos.

B00 sigue pendiente: dos Allow no identificadas en proyecto, cuatro Deny Git conservadas; respaldo previo solo prueba reversión limitada. Un hash .env íntegro no resuelve exposición histórica ni seguridad del código. No se rotaron secretos, cambiaron ACL/owner/herencia ni utilizaron valores .env. Godot, progreso y decisiones siguen fuera del ensayo; ninguna dependencia HTTP nueva en gameplay.


### Cierre verificado B05.2D.2 — 2026-10-27 Guatemala

**COMPLETADA EN CÓDIGO, únicamente en el ámbito sintético autorizado.** Resultado final de npm test: **124 aprobadas, 0 fallidas, 0 omitidas**: 39 legacy node:test + 50 regresiones JWT B05.2C + 35 nuevas (26 memoria/contrato/HTTP y 9 archivo/aislamiento). No sumar reejecuciones. Todos los procesos Node y listeners de ensayo terminaron; cero directorios identity-d2-* de ensayo restantes.

Inventario final: 23 archivos deliberados (15 existentes modificados y 8 nuevos): seis código/config de pruebas existentes, un puerto src nuevo, siete archivos nuevos de batería/soporte y nueve documentos autorizados. De 4.839 archivos iniciales inventariados fuera de .git/node_modules/.godot y .env separado, 4.824 permanecen idénticos en hash/tamaño/mtime; ocho añadidos, cero eliminados. No otros cambios de contenido detectados. El lector del manifiesto usa UTF-8 explícito para no confundir nombres con Ñ como altas/bajas.

Tres bases protegidas y nueve archivos asociados: hash/tamaño/mtime idénticos. Backend/.env coincide con referencia histórica y conserva tamaño, fecha y descriptor/propietario; sin lectura de valores. SDDL/owner de raíz, backend, .env y .git idénticos antes/después; no comandos de cambio ACL/herencia/owner. No se afirma una nueva auditoría completa de ACL por archivo de todo el árbol. B00 sigue pendiente con ambas Allow investigadas y cuatro Deny Git conservadas.

No dependencias nuevas, Atlas, AWS, Godot, SQLite/SQL/migración, secretos reales ni producción. Persistencia Mongo/índices/transacciones, recuperación de usuario, DPAPI, keyring/rotación productivos y admin OIDC pendientes. El ensayo de archivo no acredita Atlas ni recuperación de apagón o fin del orquestador. Recomendación: revisión y autorización específica antes de cualquier B05.3; **B05.3 no iniciada, trabajo detenido**.
