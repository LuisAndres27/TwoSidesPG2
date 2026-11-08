# B05.4C.2F.1B — Coordinación persistente de identidad y revocaciones

2026-10-29, America/Guatemala. Implementación local aislada, sin conexión MongoDB/Atlas ni migración de datos. F.2 sigue deshabilitada; B00 pendiente; B05.5 no iniciada. La evidencia offline no acredita aún la garantía del servidor MongoDB real.

## Modelo y frontera implementados

MongoIdentityRepository es un adaptador nuevo del puerto async existente. No reemplaza SyntheticIdentityRepository, no importa fixtures desde src, no lee configuración ni abre conexiones. Requiere conexión inyectada y capacidad synthetic explícita; producción sigue bloqueada. No se generaron identidades reales.

| Modelo nuevo | Estado durable diseñado en código | Índices secundarios requeridos |
|---|---|---|
| identities | Cuenta técnica estable, registro, vínculo instalación/perfil, linked, active, player, épocas cv/authz/binding, PHC Argon2id y fechas | identity_registration_unique; identity_binding_unique |
| ownerGuards | _id del propietario y revision entera segura creciente | _id estándar |
| identitySessions | jti, propietario, vínculo/épocas, hash opaco interno, expiración y revoked; nunca JWT completo | identity_token_unique |
| revocations | Comando estable owner:commandId, kind/target, revisión confirmada y fecha | _id estándar |

La política aprobada sigue siendo una instalación/perfil por identidad. El vínculo se embebe en identities, sin una nueva relación multidispositivo. Varias identidades pueden compartir installationId si pertenecen a perfiles distintos. Revocar una identidad no revoca otros perfiles de esa instalación.

Todos los esquemas son strict throw, autoIndex/autoCreate false, bufferCommands false, sin clave privada. La factoría solo declara modelos. No crea colecciones o índices. Cada transacción verifica los tres índices de identidad y topología replica set/primary; ingestión conserva además sus dos índices únicos. No se introducen migraciones ni un aprovisionador automático.

En loopback se exige base aleatoria twosides_sync_test_<32hex>, sin credenciales/SRV y modelos de esa conexión. Atlas conserva la capacidad interna, destino/usuario/base/TLS existentes, y exige exactamente el mismo scope para identidad e ingestión. Los cuatro modelos nuevos llevan prefijo del runId mediante identityCollectionNames; se verifican conexión, nombre y ausencia de creación/indexación automática antes de utilizarlos. No hay opción skipCoordination ni fallback a memoria.

MongoIngestionRepository exige una instancia reconocida por WeakMap de MongoIdentityRepository de la misma conexión/scope. Un objeto parecido, el repositorio de memoria/archivo o un callback permisivo no satisfacen esa condición. WeakMap protege la composición dentro de este proceso; **la exclusión entre procesos procede de las escrituras Mongo**, no del WeakMap.

## Unidad de trabajo

MongoIdentityRepository.transaction inicia una ClientSession/withTransaction con snapshot, primary y majority+journal, maxCommitTimeMS 1000 y timeoutMS 10000. Permite como máximo tres ejecuciones del callback, siempre con snapshot nuevo según el driver. AsyncLocalStorage propaga la sesión a todas las consultas de identidad de esa transacción; no almacena la autoridad ni es un lock.

La propiedad coordinator exigida por el motor antiguo ejecuta directamente work(), sin serialización en memoria. Receptores distintos usan coordinadores independientes. La validación de contexto ahora consulta cuenta y sesión secuencialmente, para no ejecutar operaciones paralelas sobre una ClientSession transaccional compartida.

## Ingestión coordinada

1. JWT v2 sigue validándose con RS256, kid, issuer/audience, tiempos, rol y estado del repositorio. assertSyncContext exige el contexto interno de esa identidad.
2. Antes de cargar hechos o recibos, la transacción lee el guard del propietario y lo modifica mediante CAS de revision y $inc real, sin upsert. Ausencia, revisión inválida o desbordamiento fallan cerrados.
3. Dentro de esa misma sesión se validan actividad, vínculo, jti, épocas, propiedad y expiración contra los documentos canónicos.
4. Se modifica el fence global de relaciones ya existente y se ejecuta el motor de ingestión sin alterar los cuatro sobres Outbox.
5. Hecho y operación/recibo se escriben en la misma sesión. La operación incorpora authorizationDecision {owner,revision} **fuera** de record/recibo público. No cambia canonicalEnvelope, hash o receiptVersion. La evidencia se valida al cargar; si falta, se devuelve indisponibilidad sin inventarla ni migrar registros anteriores.
6. Validación final dentro de la transacción y comprobación de presupuesto. Solo después de withTransaction satisfactorio se permite ACK/postcommit.

El antiguo callback fenceAuthorization puede seguir restringiendo ensayos históricos, pero es opcional y no puede sustituir el guard obligatorio. Las nuevas identidades/sesiones canónicas no necesitan copiarse a sync_authorization para autorizar. DR37 demuestra el flujo sin esa proyección ni callback.

Las consultas públicas de recibos también toman el guard y verifican autorización. El recibo histórico continúa almacenado después de una revocación, pero el JWT revocado no puede recuperarlo ni provocar una respuesta duplicate positiva. El duplicado contradictorio revocado obtiene rechazo de autenticación, sin revelar el conflicto histórico.

## Revocación coordinada

La entrada local es revoke(context,{commandId,kind,target}); no existe endpoint administrativo nuevo. El contexto debe proceder del middleware JWT/player y pertenecer exactamente al repositorio activo.

| kind | Alcance autorizado en esta implementación |
|---|---|
| identity | Solo la identidad técnica del contexto; active=false y authzVersion creciente |
| installation | Solo su vínculo actual; linked=false y aumento de bindingGeneration/authzVersion |
| session | Solo el jti del contexto; revoked=true, preservando las otras sesiones |
| generation | Invalida el contexto antiguo mediante incremento de bindingGeneration/authzVersion |
| credential | Invalida sesiones antiguas mediante cv/authzVersion; no cambia el secreto ni implementa rotación de credencial |

La transacción toca el mismo ownerGuard antes de validar y mutar. Estado, revisión y comando/resultado de revocación se confirman conjuntamente. No hay borrado de operaciones, decisiones o recibos. Se rechazan propietario, instalación o sesión ajenos con 403; no se amplía player a admin. Las firmas antiguas revokeIdentity(id), revokeSession(id) e invalidateAccountSessions(id) no identifican un actor y se rechazan con 403 en este nuevo adaptador; el adaptador sintético anterior conserva sus firmas originales.

createSession también toca el mismo guard y vuelve a validar las épocas/vínculo del account previamente verificado. No puede crear una sesión válida después de una revocación ganadora usando un snapshot anterior. Conserva máximo tres sesiones vivas; las retiradas se marcan revoked, sin eliminarlas. El prototipo falla cerrado si su inventario por propietario supera 3000 sesiones; no hay política productiva de retención.

## Orden, reintentos y errores

El orden lógico se prueba por revisiones confirmadas del guard: operación authorizationDecision.revision y revocations.revision, nunca por el momento de responder HTTP. Una transacción abortada no consume una revisión durable ni deja recibo positivo.

- Si revocación confirma primero, la escritura concurrente del guard provoca conflicto. El siguiente intento consulta el estado nuevo y rechaza el JWT/contexto anterior. No basta la lectura snapshot: ambas rutas escriben el documento común.
- Si ingestión confirma primero, su recibo permanece válido. La revocación concurrente debe reintentar contra el guard nuevo y se confirma con revisión posterior.
- Write conflict/TransientTransactionError: el driver puede repetir el callback hasta el límite de tres intentos y el presupuesto; se revalida identidad en cada intento. Sin lock de Node ni suposición de servidor único.
- Duplicate key no se convierte directamente en duplicate: devuelve indisponibilidad, sin recibo especulativo. Reenvío estable vuelve a comprobar autorización y datos confirmados.
- UnknownTransactionCommitResult: el driver gestiona reintentos de commit dentro de su timeout. Si no puede confirmar, se devuelve 503, sin afirmar rollback ni fabricar ACK. El llamador debe conservar IDs y reconciliar.
- Comando de revocación ya existente: mismo kind/target y actor actualmente autorizado devuelve el resultado original. Un commandId con otro alcance produce conflicto. Repetir con identidad/sesión ya revocada no concede autorización para consultar el resultado. La reconciliación privilegiada de una revocación incierta de esa identidad queda pendiente; no se crea acceso administrativo para resolverla.

Los errores 401/403 se conservan como autorización, no se convierten indiscriminadamente en fallos de almacenamiento. Los errores internos Mongo se sanitizan. No se promete exactamente una vez a nivel HTTP.

## Pruebas offline

El doble Mongo anterior serializaba callbacks mediante una cola; se reemplazó por snapshots optimistas con conjunto de documentos escritos, comparación CAS al confirmar y publicación conjunta de todas las escrituras. Admite solapamiento de callbacks, conflictos, replay, rollback y commit incierto. Usa las clases reales MongoIdentityRepository, MongoIngestionRepository, IngestionService y JwtService, no el modelo conceptual F.1A como implementación.

| Casos requeridos | Nuevas pruebas |
|---|---|
| Normal; revocación previa; JWT viejo | DR01–02/09 |
| Revocación entre autorización/escritura y tras última validación | DR03–04 |
| Ingestión primero; evidencia/revisión y recibo preservado | DR05 |
| Dos solicitudes idénticas con callbacks solapados | DR06 |
| Dos propietarios y vínculo compartido con perfiles independientes | DR07–08 |
| Generación, credencial, sesión y expiración | DR10/26–27/34 |
| Conflictos, replay acotado, abort, resultado incierto | DR11–14/20/28 |
| Reconstrucción de repositorio/servicio JWT | DR15 |
| Revocación desde proceso Node hijo con código de repositorio real | DR16 |
| Duplicados, recibo histórico y autorización de consulta | DR17–19/38 |
| Propiedad y roles player/admin | DR21–23 |
| Dependencia pendiente y respuesta parcial | DR24–25 |
| Fallo cerrado, índices, namespace, esquemas y API sin actor | DR29–33/36 |
| Operaciones distintas simultáneas; revocación frente a dos operaciones | DR35/41 |
| Sin callback/proyección antigua; comando estable; evidencia ausente | DR37/39–40 |

DR03 y DR04 dejan ganar a la revocación en dos puntos diferentes. DR05 deja confirmar ingestión mientras la revocación tiene snapshot pendiente. DR06 utiliza barreras para mantener un callback abierto mientras otro confirma. DR41 superpone tres participantes independientes. Se comprueban conflictos y revisiones durables del doble, no solo un orden fijo de respuestas.

DR16 inicia un hijo Node real, verifica un JWT sintético y ejecuta el repositorio nuevo sobre una imagen del doble recibida por IPC. El padre publica esa imagen de revocación antes de su CAS pendiente. Prueba reconstrucción/ejecución en otro proceso y detección de snapshot obsoleto; **no prueba dos conexiones simultáneas a Mongo ni durabilidad en disco**. DR15 tampoco equivale a reinicio del servidor. Las veinte intercalaciones conceptuales F.1A se conservan como regresión adicional bajo sus supuestos explícitos.

El doble detecta conflictos al confirmar; no simula el calendario de locks del servidor. En Mongo real, una transacción que ya escribió el guard puede impedir que la otra confirme primero. El arnés futuro debe permitir avanzar al dueño del lock y observar espera/conflicto/retry, sin esperar la revocación mientras mantiene artificialmente bloqueado el commit de ingestión. Ambos mecanismos deben respetar el mismo orden lógico; sus tiempos físicos no son equivalentes.

**COMPLETADA EN C?DIGO AISLADO Y PRUEBAS OFFLINE. 462 pruebas backend aprobadas: 41 nuevas y 421 regresiones; 423 Vitest (18 archivos) y 39 legacy. Cero fallidas u omitidas finales.** Las ejecuciones focalizadas no se suman de nuevo. No se valid? a?n la garant?a contra MongoDB real.

Comandos ejecutados desde backend, sin npm run dev, conexiones Atlas o carga .env:

```powershell
node --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run --config vitest.config.js
node --import ./tests/jwt/env-guard.js --test --test-concurrency=1 tests/unit/*.test.js tests/integration/*.test.js
```

El arranque inicial de Vitest tuvo EPERM al crear subprocesos; se ejecut? con permiso sin cambiar ACL. Los primeros pases detectaron fixtures que todav?a compon?an identidad en memoria, un scope doble en Atlas simulado y una expectativa de no reintentar un conflicto transitorio; se corrigieron sin omitir pruebas. El pase final completo aprob? los 423 casos.

Las regresiones de esquema P02/T05/A33 ahora componen una identidad Mongo del mismo scope. M08/A14 usan revocación con contexto. M28/F01/F07 registran vínculos propios en lugar de duplicar la identidad de otro fixture. F03 provoca conflictos persistentes para verificar agotamiento, porque uno transitorio ahora se reintenta correctamente. F10 exige rechazo de la composición insegura histórica; el control negativo conceptual F.1A se conserva. No se eliminaron ni omitieron casos para obtener éxito.

## Inventario de archivos

Nuevos:

- src/modules/auth/mongo-identity-models.js
- src/modules/auth/mongo-identity-repository.js
- tests/sync/durable-revocation.test.js
- tests/sync/support/durable-revocation-worker.js
- docs/B05_DURABLE_REVOCATION_IMPLEMENTATION.md

Modificados:

- src/middleware/sync-auth-context.js: consultas secuenciales en sesión común.
- src/modules/sync/mongo-ingestion-repository.js: identidad obligatoria/UoW/guard/evidencia.
- src/modules/sync/mongo-models.js: evidencia interna adicional, sin cambiar recibo.
- src/modules/sync/atlas-integration.js: factoría explícita de identidad y verificación de composición antes de modelos de ingestión.
- tests/sync/support/{fixture,mongo-double,atlas-double}.js: composición nativa y conflictos optimistas.
- tests/sync/{mongo,atlas,atlas-concurrency,atlas-persistence,atlas-transactional}.test.js: regresiones adaptadas a la nueva obligación de coordinación.
- scripts/atlas-concurrency-harness.js: datos sintéticos con vínculo propio por actor; barrera remota intacta.
- Los siete documentos solicitados: DURABLE_REVOCATION_COORDINATION, ATLAS_CONCURRENCY_PREFLIGHT, REMOTE_INGESTION_ARCHITECTURE, IMPLEMENTATION_ROADMAP, PHASES, PHASE_HISTORY, DECISIONS.

No otros documentos, dependencias, rutas Express, clave de firma, adaptador sintético persistente o contratos Outbox fueron modificados.

## Protección, riesgos y validación posterior

Sin acceso ni modificación a backend/.env, SQLite runtime/históricas, Godot, ACL/propietarios, usuarios Atlas, two_sides_db o Outbox real. Los tests conservan guardas contra lectura de .env/.sqlite3 y configuración envDir=false. No se recalcularon hashes ni se certifica de nuevo contenido protegido: las referencias históricas permanecen históricas. Sin nuevas credenciales, canal privado, software, AWS o B05.5. B00 sigue pendiente.

Quedan por verificar en MongoDB real: conflictos/visibilidad snapshot, concerns, límites del driver/tier, durabilidad/reinicio y revocación con procesos/conexiones independientes. El doble supone atomicidad/CAS del servidor; sus resultados no constituyen prueba remota. También quedan custodia/rotación de claves, recuperación/enrollment, revocación administrativa, reconciliación privilegiada, retención de sesiones/revocaciones, rollback de backups, disponibilidad y contención del guard/fence global. El prototipo no es una implementación productiva de identidad.

Siguiente subfase recomendada: preflight y autorización independiente para integrar únicamente esta coordinación en MongoDB sintético, antes de F.2. Debe inventariar/provisionar explícitamente los cuatro namespaces de identidad y los de ingestión con cinco índices secundarios en total; manifiesto y limpieza exacta deben contemplar identidades, guards, sesiones, comandos y evidencia. Las colecciones/índices D.2E existentes se conservan. Los arneses históricos de cuatro documentos no se reutilizan con la nueva identidad: su composición antigua falla cerrada y no incluye estas necesidades de aprovisionamiento/limpieza.

Exigir canal privado nuevo revisado/activado manualmente solo tras autorización, DEFAULT/TLS estrictos, host/usuario/base fijos y permisos efectivos. Validar guard/ingestión/revocación entre conexiones separadas, ambos ganadores, JWT viejo, duplicado revocado, abort/commit incierto/reinicio y recibos. No usar identidades reales ni migrar documentos históricos que no tengan authorizationDecision. No basta cambiar remoteEnabled: **F.2 permanece incondicionalmente bloqueada hasta demostrar la coordinación real y recibir autorización independiente**.
