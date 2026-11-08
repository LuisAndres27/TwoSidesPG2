> **Seguimiento F.1C.1 — 2026-10-29 Guatemala:** C.1 preparada; 493 pruebas backend offline aprobadas (31 nuevas, 462 regresiones). Se prepararon carreras deterministas de revocación/ingestión, reapertura y limpieza transaccional de datos sintéticos. No conexión Atlas ni recepción de secretos. Próximo paso sujeto a autorización independiente: paquete/capacidad/receptor C.2 y validación real. **F.2 sigue deshabilitada; B00 pendiente; B05.5 no iniciada.** [Informe de preparación y riesgos](B05_DURABLE_REVOCATION_ATLAS_PREFLIGHT.md).

> **Antecedente F.1B — 2026-10-29 Guatemala:** coordinación persistente implementada en código aislado: MongoIdentityRepository, guard durable por propietario y UoW común de ingestión/revocación. 462 pruebas backend offline aprobadas (41 nuevas, 421 regresiones). La composición Mongo con identidad memoria/archivo falla cerrada. Sin Atlas, migración o cambios de datos protegidos. Garantía Mongo real pendiente; F.2 deshabilitada, B00 pendiente y B05.5 no iniciada. [Implementación, pruebas y requisitos siguientes](B05_DURABLE_REVOCATION_IMPLEMENTATION.md).

# B05.1 — Hoja de ruta propuesta

> **Actualización de alcance F.1A (2026-10-28 Guatemala):** diagnóstico/diseño de coordinación durable completado, 315 pruebas offline aprobadas (44 nuevas y 271 regresiones). [Propuesta de guard por propietario y UoW común Mongo](B05_DURABLE_REVOCATION_COORDINATION.md). La nueva persistencia de identidad y gestión transaccional de sesiones requiere autorización separada; no fue implementada. La revocación actual mantiene la carrera documentada: F.2 continúa bloqueada. No Atlas en F.1A; B00 pendiente y B05.5 no iniciada. Las secciones siguientes conservan hitos históricos y no autorizan nuevas fases.
2026-10-27 · B05.1 COMPLETADA SOLO COMO AUDITORÍA/DISEÑO. B05.2 no iniciada.

## Secuencia y puertas
| Subfase propuesta | Alcance pequeño | Dependencias y aceptación |
|---|---|---|
| B05.1 auditoría/contratos | Cinco planes y tres registros de fase | Backend/outbox reales distinguidos de propuesta; integridad conservada, sin código. |
| B05.2A seguridad B00 | Diagnóstico actualizado y descriptor/ruta correctiva concretos | Nueva autorización antes de ACL. Verificar hash/size/owner/ACE/ascendencia y acceso legítimo antes/después; no usar secretos reales hasta resolver. |
| B05.2B identidad local | installationId/binding, credencial protegida, lifecycle, puertos fake | Aprobar ruta privada fuera de repo y protección DPAPI; fixtures con secretos sintéticos, no tocar perfil/bases reales sin permiso específico. Fallos entre blob/SQLite/envío recuperables, offline siempre jugable. |
| B05.2C identidad API durable, diseño/pruebas | Contrato adaptador duradero y sesiones/roles player internos | Conserva auth legado por versión o migra explícitamente; registro perdido/duplicado/restart no crea cuenta. Sin Atlas real salvo autorización separada B05.4. Un MemoryRepository no satisface esta puerta. |
| B05.3 outbox local | Extensión syncv1 y reconciliación paginada; worker/transport mock | Autorización DDL/ruta; primero solo SyntheticSandbox. Insert+checkpoint atómicos, leases tras crash, ACK parcial, cota/disk-full sin rollback del dominio. No migrar runtime automáticamente. |
| B05.4 recepción remota | API versionada+colecciones/índices/recibos/proyecciones | Identidad durable/binding y B00 resueltos. Tests Mongo aislado sintético con transacciones y fallo de ACK, no Atlas de usuario. Conexión real solo tras permiso de entorno, secrets/backup/network y revisión. |
| B05.5 cliente sync Godot | Componer coordinador de segundo plano y transporte | Outbox/recepción compatibles; ningún gate remoto en juego. Pruebas mock y manual offline/online con entorno sintético autorizado; no iniciar Godot automáticamente. |
| B05.6 reconciliación/resiliencia | Crash/reordenamiento/duplicados/backoff/rotación/retención | Comparar IDs/fuentes/receipts/proyecciones, cobertura desconocida; pérdida de secreto no reasigna historia; medir límites, no reparar datos reales automáticamente. |
| B05.7 API admin | Métricas derivadas y auth admin independiente | Ingesta probada, definiciones/n/fechas/cobertura y privacy aprobadas; roles/MFA/BOLA y pruebas de consulta sintéticas. No panel web ni credenciales player como admin. |
| B05.8 preparación despliegue | Propuesta IaC/red/secretos/costos/observabilidad y diseño panel | Aprobación de proveedor/topología/región/costos. Ensayo/staging autorizado separado del despliegue real; no crear recursos por “preparación”. |

Numeración/denominaciones son propuestas; un requisito que exija código o ruta fuera del alcance debe concretarse en la autorización de esa subfase. No combinar toda B05 por autorización de B05.2. Fase E.2B.2 validada598 anteriores/12de12 manuales por usuario: regresiones a conservar, no resultados ejecutados aquí.

## Archivos previstos, no editados
Existentes:
- backend/src/app.js/server.js/config/server.js: composición/rutas/config validada sin autoload .env del cliente.
- backend/src/modules/auth/{auth-service,memory-repository,credential-hasher}.js y modules/identity/identity.js: interfaces async de repositorio y binding/rotación; MemoryRepository sigue fixture.
- backend/src/middleware/{security,rate-limiter}.js y utils/work-pool.js: body limits por endpoint, auth/roles, cuotas compartidas y errores.
- backend/package.json/lock únicamente cuando se autoricen driver Mongo o Mongoose (elegir uno conscientemente), Zod si conviene y proveedor auth; no instalados en B05.1.
- local-persistence/src/Models.cs.txt, UnitOfWork.cs.txt, SQLiteRepository.cs.txt, GameSaveService.cs.txt: puertos/lecturas/captura y asociaciones mínimas solo si necesarias; no introducir HTTP en dominio ni cambiar gameplay/evaluador.
- GameplayEventService/Repository e integration/sqlite/GamePersistenceAdapter.cs, GamePersistenceContext.cs, LocalGameState.cs: lectura/captura y composición de servicios separados, sin hacer sync un requisito de progreso.
- scripts/network/GameApplicationContext.cs: composición sync nueva independiente del legado; PendingOperationStore/PersistentApiClient no se activan como atajo.
- Tests de local-persistence e integración y backend/tests; proyectos solo si inclusiones explícitas lo requieren y se autoriza.

Nuevos propuestos, ubicación a aprobar al implementar:
- local-persistence/src/SyncModels.cs.txt, SyncSchema.cs.txt, SyncOutboxRepository.cs.txt, SyncCaptureService.cs.txt, SyncReceiptService.cs.txt.
- integration/sqlite/SyncCoordinator.cs y ProtectedIdentityStore.cs (abstracción/implementación Windows sin SDK de Atlas).
- backend/src/modules/sync/{schemas,sync-service,sync-repository,router}.js; backend/src/database/mongodb/{connection,identity-repository,sync-repository,indexes}.js.
- backend/src/modules/admin/{statistics-service,router}.js y middleware/authorization.js.
- local-persistence/game-save-tests/SyncQueueChecks.cs.txt; backend/tests de recepción/seguridad/estadísticas y fixtures aisladas.

No crear carpetas/listados vacíos para simular avance ni recuperar modelos antiguos del proyecto original.

## Migraciones previsibles, ninguna ejecutada
Extensión syncv1: tablas sync_installation, sync_outbox y sync_checkpoints, índices por estado/nextAttempt/lease y UNIQUE fuente+generación; metadatos de propietario, lease, recibos y contrato/checksum. No editar DDL/checksums basev2 o gameplayv1. Campos de identidad existentes se usan con sus CHECK, servicios transaccionales separados y credential_ref, nunca secretos en SQLite.

Migración runtime requiere fase/permiso propios con procesos cerrados, inventario íntegro, respaldo privado aprobado sin overwrite, ensayo en fixture del formato, verificación posterior y política de fallo/rollback. No asumir autorización de migrar por autorizar la biblioteca. Las dos bases AppData de pruebas anteriores no son origen para importar perfil/runtime.

Remoto: creación de colecciones/índices únicos y validadores con estrategia para duplicados anteriores antes de activar unique, no borrar conflictos. Sesiones/recibos durables y almacenamiento de cuenta/binding. Elegir driver y modelo de transacción/write concern antes de afirmar durabilidad. Pruebas y producción en namespaces separados.

## Matriz de pruebas futura
- Identidad: registro dos veces/concurrente/secreto distinto, reinicio servidor, expiración, revocación, binding ajeno, DPAPI no disponible/mismo usuario/diferente contexto, caída blob→SQLite→ACK, reinstalación/clone/transferencia.
- Outbox: replay de captura, crash antes/después insert/checkpoint/lease, Windows restart, disk full/capacidad, payload/hash canónico, contador/reintentos/backoff/jitter, confirmed inmutable, cuarentena visible.
- Receptor: same operation igual/distinta, misma decisión con ID nuevo, ACK perdido después commit, transacción abortada/resultado incierto, revisión vieja/nueva/salto, mismo revision distinto contenido, batch parcial, TTL/retención no borra dedupe anticipadamente.
- Orden: session/run faltante, intervalo antes de sesión/terminal, reportes tardíos, timestamp erróneo vs offset, solapamiento, datos históricos sin evento, completed sin telemetría y final_pending frente a cierre.
- Seguridad: BOLA por owner/install/ID, body/roles injectados, operator injection, JSON duplicado/profundidad/límite, compresión, lote/ID/enum/revisión fuera de rango, cuotas/NAT/proxy, logs sin secretos, admin separado.
- Métricas: duplicados no suman, denominador0/null, datos ausentes vs0, scopes/períodos/versiones/n, reportes históricos/activos, tiempo excluye pausa, solicitudes no éxitos, final preparado no cerrado, cliente no conectado fuera del universo.
- Regresión: las598 comprobaciones anteriores y flujos manuales offline de perfil/decisión/meta/final/historia/nueva partida sin HTTP. No presentarlas como ejecutadas en B05.1.
- Integridad: hashes/tamaño/fechas de tres bases y .env; pruebas de sync solo en fixtures bajo .work/databases/<UUID> y entorno Mongo sintético autorizado. Ninguna exportación real por defecto.

## Puertas antes de servicios reales
B00 resuelto con evidencia, secreto fuera de cliente/OneDrive, cuentas técnicas y scopes mínimos, TLS/red/retención/privacy aprobados, recibos durables y pruebas de replay/restore, entorno aislado y autorización de conexión/despliegue explícita. Preparar un diff revisable antes de solicitar despliegue; no pedir permiso como sustituto de completar diseño/código autorizado.

## Verificación de B05.1
Solo inspección de código/contratos y documentación oficial pública, sin exportar datos del usuario. No Node, Godot, tests/builds, nuevas credenciales, consultas SQL, Atlas/AWS, ACL o dependencias. Cinco documentos nuevos y PHASES/PHASE_HISTORY/DECISIONS actualizados; ningún otro archivo autorizado a cambiar.

Tres bases protegidas y9 archivos asociados conservados por hash/tamaño/fecha. .env278bytes, SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928; no valores, permisos o propietario modificados. Riesgo B00 sigue abierto. B05.2 requiere siguiente autorización.



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

Siguiente puerta: autorización explícita de B05.2D.2 y elección de base sintética/proveedor privado antes de implementar. Exigir ensayo real con dos procesos y mismo almacén/claves; un Map compartido no prueba durabilidad. Cliente protegido, producción, administración real y B05.3 permanecen fuera de alcance.

Contratos: [identidad persistente](B05_PERSISTENT_IDENTITY_CONTRACT.md), [ciclo de claves](B05_JWT_KEY_LIFECYCLE.md), [plan de pruebas](B05_IDENTITY_PERSISTENCE_TEST_PLAN.md). Las propuestas no habilitan producción ni modifican contratos implementados. Backend/.env conserva la referencia histórica; las tres bases y sus asociados permanecen protegidos. B00 no resuelto: dos Allow no identificadas; respaldo privado y ensayo limitado no garantizan restauración general. Detenido a la espera de autorización, sin iniciar B05.2D.2/B05.3.


## B05.2D.2 — Cierre aislado y puertas siguientes (2026-10-27 Guatemala)

Implementación limitada a puerto async, binding/token v2, adaptador de memoria y archivo cifrado sintético, proveedor RS256 de prueba estable, revocación y ensayos de reinicio. No hay persistencia MongoDB ni gestión productiva de claves. La autorización actual permite archivo temporal duradero; las verificaciones D+P MongoDB del diseño no se consideran cumplidas por ese archivo.

Antes de B05.3 recomendar revisión/aceptación de resultados y autorización separada. No conectar Godot/JWT ni migrar SQLite. Recepción real requiere después Mongo sintético con índices/transacciones/fallos de commit, proveedor/custodia operativos, administración independiente y resolución B00 antes de credenciales reales. Falta definir recuperación/enrollment/retención final, disponibilidad multihost y rotación operativa. No se concede aprobación automática de producción por continuidad sintética.


### Cierre verificado B05.2D.2 — 2026-10-27 Guatemala

**COMPLETADA EN CÓDIGO, únicamente en el ámbito sintético autorizado.** Resultado final de npm test: **124 aprobadas, 0 fallidas, 0 omitidas**: 39 legacy node:test + 50 regresiones JWT B05.2C + 35 nuevas (26 memoria/contrato/HTTP y 9 archivo/aislamiento). No sumar reejecuciones. Todos los procesos Node y listeners de ensayo terminaron; cero directorios identity-d2-* de ensayo restantes.

Inventario final: 23 archivos deliberados (15 existentes modificados y 8 nuevos): seis código/config de pruebas existentes, un puerto src nuevo, siete archivos nuevos de batería/soporte y nueve documentos autorizados. De 4.839 archivos iniciales inventariados fuera de .git/node_modules/.godot y .env separado, 4.824 permanecen idénticos en hash/tamaño/mtime; ocho añadidos, cero eliminados. No otros cambios de contenido detectados. El lector del manifiesto usa UTF-8 explícito para no confundir nombres con Ñ como altas/bajas.

Tres bases protegidas y nueve archivos asociados: hash/tamaño/mtime idénticos. Backend/.env coincide con referencia histórica y conserva tamaño, fecha y descriptor/propietario; sin lectura de valores. SDDL/owner de raíz, backend, .env y .git idénticos antes/después; no comandos de cambio ACL/herencia/owner. No se afirma una nueva auditoría completa de ACL por archivo de todo el árbol. B00 sigue pendiente con ambas Allow investigadas y cuatro Deny Git conservadas.

No dependencias nuevas, Atlas, AWS, Godot, SQLite/SQL/migración, secretos reales ni producción. Persistencia Mongo/índices/transacciones, recuperación de usuario, DPAPI, keyring/rotación productivos y admin OIDC pendientes. El ensayo de archivo no acredita Atlas ni recuperación de apagón o fin del orquestador. Recomendación: revisión y autorización específica antes de cualquier B05.3; **B05.3 no iniciada, trabajo detenido**.


## B05.3A — Outbox SQLite sintética (2026-10-27 Guatemala)

B05.3A COMPLETADA EN CÓDIGO aislado. Siguen pendientes B05.3B (aprovisionamiento local de binding/captura/reconciliación/checkpoints/historia), migración runtime autorizada y B05.4 receptor. Extensión separada sync1 conserva base2/gameplay1. No conexión Godot/HTTP/Atlas, no migración de bases existentes. Antes de B05.3B revisar límites de cuota, saltos de reloj, dependencias explícitas, cola permanente y cobertura; exigir nueva autorización de archivos y estrategia de rollback si se toca runtime.

Contrato, tablas, transiciones, operaciones, limitaciones, pruebas, inventario y plan runtime en [B05_LOCAL_OUTBOX_IMPLEMENTATION.md](B05_LOCAL_OUTBOX_IMPLEMENTATION.md). No inicia B05.3B ni autoriza tocar runtime, HTTP o Atlas. B00 sigue pendiente; sin cambios ACL/propietario/herencia.


## B05.3B.1 — Captura y reconciliación sintéticas (2026-10-28 Guatemala)

B05.3B.1 COMPLETADA EN CÓDIGO sintético:51 nuevas +662 regresiones reejecutadas=713 aprobadas. B05.3B.2 queda para composición local autorizada, binding estable, pasadas acotadas y eventual migración runtime con respaldo/preflight específico; B05.4/B05.5 para recepción/transporte reales. Plan de archivos futuro en informe. No relajar SyntheticDatabase ni conectar GamePersistenceContext/Adapter, FinNivel, Final o menús aquí. B00 y custodia productiva siguen pendientes.

Matriz de hechos, métodos/archivos, garantías, historial, pruebas, limitaciones y plan preciso B05.3B.2 en [B05_OUTBOX_CAPTURE_RECONCILIATION.md](B05_OUTBOX_CAPTURE_RECONCILIATION.md). B00 continúa pendiente. Detenido; sin iniciar B05.3B.2/B05.4.


## B05.3B.2A — Respaldo y ensayo privado (2026-10-28 Guatemala)

Ensayo completado sobre segunda copia privada de runtime, sin migrar original: BackupDatabase read-only bajo bloqueos de escritura; backup y origen hash/metadatos intactos. Copia conservó base2/eventos1 y recibió sync1; integrity_check=ok,FK válidas y todo dominio/estadísticas idénticos. Primera reconciliación658 pendientes/1341 dependencias/0 diagnósticos; segunda en otro proceso0 nuevas,mismos IDs/payload/estados. No envío ni ACK remoto. Migración reaplicada idempotente y fallo precommit revierte otra copia desechable. Es tooling privado, no migrador runtime productivo: DDL exacto/checksum reutilizado sin relajar SyntheticDatabase. No ACL/owner/Godot/HTTP/Atlas/AWS.

Respaldo, SHA-256, conteos anonimizados, resultados, riesgos y plan B05.3B.2B en [B05_OUTBOX_RUNTIME_MIGRATION_TRIAL.md](B05_OUTBOX_RUNTIME_MIGRATION_TRIAL.md). Datos reales solo en privado fuera de Git/OneDrive; no imprimir IDs/decisiones ni restaurar. B00 pendiente. B05.3B.2B/B05.4 no iniciadas.


## B05.3B.2B — Activación local controlada (2026-10-28 Guatemala)

B05.3B.2B COMPLETADA EN CÓDIGO,validación manual pendiente. Runtime base2+eventos1+sync1 activada tras respaldo nuevo/ensayo final;captura automática local y paginada,ningún transporte. Antes de B05.4 exigir validación offline/cola/cierre/desempeño,contratos del receptor y canonicalización,identidad/custodia productiva y evaluación B00. No iniciar B05.4 por disponer de658 pending;no es evidencia de recepción remota.

Preflight,backup nuevo/hash,ensayo,migración,comparación,archivos/pruebas,riesgos y guía manual en [B05_OUTBOX_RUNTIME_ACTIVATION.md](B05_OUTBOX_RUNTIME_ACTIVATION.md). B00 pendiente;sin cambios ACL/propietario,autenticación remota,HTTP/Atlas/AWS oB05.4. Esperar validación manual e instrucciones.


## B05.3B.2C — Auditoría runtime posterior a manuales (2026-10-28 Guatemala)

B05.3B.2C auditada en lectura,resultado PARCIAL por2 capturas faltantes de cierre de última sesión;integridad/dominio correctos. B05.3 no cerrada plenamente. Antes de B05.4A autorizar diagnóstico/corrección o recuperación diferida controlada y reauditoría de cobertura;no realizarlo en esta fase. No transmisión ni receptor por inferencia.15/15 manuales son información del usuario;741 automatizadas previas no reejecutadas.

Resultados,condiciones de lectura,cobertura,faltantes y recomendación en [B05_OUTBOX_RUNTIME_POSTVALIDATION.md](B05_OUTBOX_RUNTIME_POSTVALIDATION.md). Solo lectura/documentación,sin cambios runtime,ACL,.env oproducción. Esperar instrucciones;noB05.4.

## B05.3B.2D — Diagnóstico y recuperación sintética completados (2026-10-28)

24 pruebas nuevas+741regresiones aprobadas. Ventana postcommit/coalescing/cancelación reproducida;reconciliación recupera2 faltantes sin duplicados tras repetición/reinicio y sin sumar Menu al efectivo. No parche productivo ni reparación runtime;853pending/2faltantes siguen en base real. Causa exacta de sesión real no trazada. B05.3 NO cerrada.

Siguiente puerta:autorizar separadamente barrera de drenaje local con presupuesto después del cierre de telemetría y antes de tree.Quit;pruebas sintéticas y manuales Godot;autorización explícita de preflight/backup/ensayo/recuperación real y reauditoría de cobertura. No basta un Delay fijo o Request sin esperar. B00/seguridad permanecen separados. B05.4A debe esperar esa validación;sin transmisión autorizada. Detalles y alcance de parche propuesto en [B05_OUTBOX_SHUTDOWN_RECOVERY.md](B05_OUTBOX_SHUTDOWN_RECOVERY.md).

## B05.3B.2E.1 — Cierre fiable en código

2026-10-28. **COMPLETADA EN CÓDIGO.** Telemetría hasta 3 s → barrera Outbox hasta 1 s → espera de limpieza hasta 1 s → salida. Task única, sin pasadas simultáneas; resultados diferidos o fallidos distintos de captura completa. Reconciliación inicial existente reutilizada, sin nueva migración.

26 nuevas + 765 regresiones = 791 aprobadas. Compilaciones sin errores, 63 advertencias Godot históricas y cero nuevas. Motor no ejecutado. Bases originales intactas; runtime aún conserva 853 pending y dos faltantes.

Puerta E.2: autorización explícita de preflight, respaldo privado nuevo, ensayo en segunda copia, recuperación real y validación manual. Abrir el juego puede recuperar automáticamente y no está autorizado en E.1. B05.3 permanece abierta, B00 pendiente y B05.4 no iniciada. [Alcance implementado](B05_OUTBOX_SHUTDOWN_RECOVERY.md).

## B05.3B.2E.2 — Puerta local satisfecha

2026-10-28. **COMPLETADA. B05.3 completada en captura/reconciliación local**, tras manuales E.1 informados 10/10, respaldo nuevo privado verificado, dos pasadas independientes con cero inserciones y auditoría final satisfactoria. Runtime ya tenía 906 pending y 889/889 fuentes actuales, sin faltantes; cero escrituras reales en E.2. 791 regresiones sintéticas reejecutadas y aprobadas; cero pruebas nuevas.

Siguiente puerta propuesta, no iniciada: autorización separada de B05.4A para revisión/diseño de receptor, identidad/binding, canonicalización, deduplicación y recibos transaccionales, pruebas aisladas y límites. Tratar B00/custodia antes de credenciales o entorno remoto. Las 906 pending no autorizan envío. No cierre de B05 completo, HTTP, Atlas o AWS. [Evidencias y riesgos](B05_OUTBOX_RUNTIME_RECOVERY_RESULT.md). Detenido.

## B05.4A — Receptor remoto: diseño completado

2026-10-28. **COMPLETADA COMO DISEÑO**, sin endpoints ni conexiones. Contrato vigente: POST /api/v2/sync/batches, transporte2 con sobres Outbox1 intactos y JWTver2/player. Cuatro payloads strict, propiedad desde repositorio autenticado, dedupe por operación/hecho, transacción por operación con recibo durable y respuesta individual; 207 para aceptación parcial. Consulta de recibos propuesta y lease/intento separados del núcleo persistido.

Puerta B05.4B no iniciada: autorizar explícitamente schemas/parser canónico, middleware que resuelva binding (hoy no expuesto en principal), servicio/repositorio sintético y pruebas T01–T35/V01–V15. Vectores C#/Node antes de recepción; custodia de archivos duraderos y HTTP loopback de tests requieren alcance expreso. Mongo/índices/transacciones reales, cliente emisor, keyring/custodia productivos y B00 permanecen pendientes. No cambiar sobres/hash, datos protegidos o Godot para ocultar una incompatibilidad.

[Arquitectura normativa](B05_REMOTE_INGESTION_ARCHITECTURE.md) y [plan verificable](B05_REMOTE_INGESTION_TEST_PLAN.md). Cero pruebas/compilaciones/servidores ejecutados en A; 791 y 124 son antecedentes, no resultados nuevos. B05.3 local sigue completada. .env sin abrir ni hashear; solo metadata/seguridad comparadas. Trabajo detenido, sin B05.4B/Atlas/AWS.

## B05.4B — Receptor Express sintético implementado

2026-10-28. **COMPLETADA EN CÓDIGO, exclusivamente sintética.** Puertas superadas:63sobres C# reales/Node compatibles y contexto JWTv2/binding/revocación verificados. Rutas opt-in /api/v2/sync/batches y /receipts/query; defaultapp no activa sync. Repositorio abstracto y adaptadores de memoria/archivo cifrado de test con fence común de identidad, commit+recibo atómicos, dedupe, orden/historia, parcialidad y error seguro.

191backend aprobadas(67nuevas+124regresiones),64regresiones C# Outbox,255totales/0fallidas finales. Todos los50casos de A trazados; no se suman63vectores como63tests. No cambios de dependencias, Godot, esquemas o bases reales. B00 pendiente.

Puerta B05.4C propuesta, no iniciada: autorización separada de adaptador/ensayos Mongo en entorno desechable sintético, índices/transacciones, fence con revocación, commit incierto y recibos duraderos. El archivo sintético no prueba Mongo/HA/apagón; crash deja lock residual503 hasta recuperación explícita. Custodia/rotación productiva y B00 antes de credenciales o Atlas. No cliente Godot ni envío de906operaciones reales por esta fase. [Implementación y límites](B05_REMOTE_INGESTION_ARCHITECTURE.md), [resultados](B05_REMOTE_INGESTION_TEST_PLAN.md). Detenido.

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
