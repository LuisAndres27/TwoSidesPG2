> **Estado vigente F.1B ? 2026-10-29 Guatemala:** coordinaci?n persistente implementada en c?digo aislado: MongoIdentityRepository, guard durable por propietario y UoW com?n de ingesti?n/revocaci?n. 462 pruebas backend offline aprobadas (41 nuevas, 421 regresiones). La composici?n Mongo con identidad memoria/archivo ahora falla cerrada. Sin Atlas, migraci?n o cambios de datos protegidos. Garant?a Mongo real a?n pendiente; **F.2 sigue deshabilitada, B00 pendiente y B05.5 no iniciada**. [Implementaci?n, pruebas y requisitos siguientes](B05_DURABLE_REVOCATION_IMPLEMENTATION.md). Los estados anteriores se conservan como antecedentes.

# B05.4C.2F.1A — Coordinación durable de identidad y revocaciones

2026-10-28, America/Guatemala. **COMPLETADA COMO DIAGNÓSTICO, DISEÑO Y DEMOSTRACIÓN SINTÉTICA.** Revocación durable MongoDB NO implementada ni validada. F.2 continúa bloqueada; B00 pendiente; B05.5 no iniciada. Sin conexión Atlas ni credenciales.

## 1. Causa y arquitectura actual

Revisados los nueve documentos exigidos: ATLAS_CONCURRENCY_PREFLIGHT, PERSISTENT_IDENTITY_CONTRACT, JWT_KEY_LIFECYCLE, IDENTITY_IMPLEMENTATION_PLAN, MONGODB_ADAPTER_IMPLEMENTATION, ATLAS_TRANSACTIONAL_INTEGRATION_RESULT, REMOTE_INGESTION_ARCHITECTURE, SYNC_API_CONTRACT e IMPLEMENTATION_ROADMAP bajo backend/docs. Se contrastaron middleware/JwtService, puerto/repositorio sintético de identidad, vínculos/sesiones, modelo Mongoose, motor de ingestión, fence de autorización y pruebas.

| Componente real | Frontera y autoridad actuales |
|---|---|
| JwtService y middleware JWT v2 | Firma RS256, iss/aud, tiempo, rol y estado consultado de identidad/sesión. El JWT no acredita por sí solo actividad posterior. |
| resolveSyncContext | Contexto interno marcado, owner/vínculo/épocas y validate asíncrono contra el repositorio inyectado. |
| SyntheticIdentityRepository | Memoria o snapshot cifrado de ensayo; mutate coordina ese almacén, no una transacción Mongo de ingestión. |
| SyntheticCoordinator | Exclusión compartida solo por participantes que usen esa instancia/almacén; no lock distribuido universal. |
| MongoIngestionRepository | Transacción propia: fence global, hechos, operación/recibo y control de sesión Mongo. |
| mongoAuthorizationFence | Escritura condicional de la sesión Mongo y revisión; no la actualizan automáticamente las revocaciones del repositorio de identidad separado. |

F10 de F.1 reprodujo: después de context.validate y del fence aceptado, un revocador independiente confirma revokeIdentity en el almacén de identidad; el control Mongo sigue activo y el commit posterior puede aceptarse. No hay una escritura conflictiva común entre esa revocación y ese commit. No es un defecto de RS256 ni una prueba de JWT falsificado.

D.2E confirmó transacciones reales acotadas, recibos y reconexión con fixture; no cerró esta frontera entre autoridades. Conservar claves o copiar controles de sesión una vez tampoco la cierra. Un mutex de proceso no protege otros procesos ni reinicios.

## 2. Garantía propuesta y orden verificable

**Para cada propietario, una operación nueva solo se confirma si su autorización es válida en el punto lógico de decisión de una transacción que compite atómicamente con las revocaciones pertinentes. Si la revocación confirma antes en ese orden, la operación debe abortar/revalidar y no producir recibo positivo. Si la operación confirma primero, una revocación posterior no borra el hecho ni su recibo.**

El orden se define por transacciones confirmadas sobre un guard compartido del propietario, no por llegada de solicitudes, relojes del cliente o respuestas HTTP. El guard incorpora una revisión serial creciente mediante una **modificación real**, por ejemplo $inc; no una actualización sin cambio. Operación y revocación guardan internamente la revisión resultante/identificador de decisión en su evidencia transaccional. Ese metadato será interno: no cambia silenciosamente el contrato público de recibo ni el sobre canónico.

El punto lógico es el resultado exitoso de esa decisión dentro de la transacción que finalmente confirma; una tentativa abortada no cuenta. Su escritura del guard participa en el mismo commit que hechos/operación/recibo, o que estado revocado/épocas/sesiones/auditoría de revocación. No se reconoce una revocación como confirmada antes de confirmar esa transacción con write concern aprobado.

La expiración se evalúa según reloj/semántica del servidor en la decisión autorizante de cada intento; no se promete que el token siga vigente al llegar la respuesta HTTP ni precisión de milisegundos del instante físico de almacenamiento. Una implementación futura debe fijar ese punto y el origen del reloj; el modelo utiliza su reloj lógico, no certifica el tiempo real Mongo.

## 3. Opciones evaluadas

| Opción | Garantía y límites | Coste y recuperación |
|---|---|---|
| A. Identidad y operaciones en una frontera Mongo | Posibilita atomicidad durable entre documentos del mismo despliegue, pero una simple lectura snapshot NO evita la carrera. Requiere además escritura común. | Alto: repositorio de identidad Mongo, sesiones, índices, UoW y custodia. Reinicio/entre procesos dependen de estado confirmado, no de Maps. |
| B. Generación durable y escritura coordinada | Revisión/época validada y modificada por ambas rutas; una generación solo leída o actualizada en otro almacén sigue siendo insegura. | Medio-alto si la autoridad vive en Mongo. Reintentos deben refrescar snapshot y validar todas las épocas. No arregla una proyección asíncrona sola. |
| C. Serializador durable por propietario | Broker/log o actor puede dar orden si todos los productores participan y el escritor tiene fencing durable que impide un líder anterior. Mutex/lock con TTL sin fencing no basta. | Alto: recuperación de líder, replay/idempotencia del log y coordinación con commit Mongo. Otra infraestructura y fallos de doble escritura; no preferida ahora. |
| D. Proyección de revocación desde otro almacén | Solo segura si la autoridad efectiva del commit es el guard Mongo y revoke no responde confirmado hasta su actualización atómica. Una cola eventual deja ventana; llamarla revocación inmediata sería falso. | Alto: comando idempotente y estado pending/confirmed, recuperación tras fallos, una autoridad definida. Transacción distribuida o protocolo formal si se conservan dos fuentes autoritativas. |

Las cuatro opciones conservan JWT RS256: la firma sigue siendo requisito previo, no fuente única de revocación. A+B se integran con Atlas mediante transacciones/contención por documento y evitan infraestructura adicional; deben comprobarse realmente en el tier autorizado. C/D necesitan pruebas propias de failover, reinicio y recuperación; no se instalan ni implementan aquí. Ninguna opción promete disponibilidad si su autoridad está caída: debe fallar cerrada con indisponibilidad controlada.

## 4. Recomendación: A+B, guard durable por propietario

Proponer una autoridad persistente Mongo para identidad/vínculo/sesión y un **guard de autorización por technicalAccountId**, modificado por toda ingestión y toda mutación relevante de seguridad. No basta mantener guards solo por sesión si revokeIdentity tendría que descubrir/actualizar sesiones mientras se crean otras.

Estructuras propuestas, NO creadas:

- Identidad técnica: UUID servidor, player impuesto, active/status, authzVersion y credentialVersion conforme al contrato v2.
- Vínculo: technicalAccountId, installationId/localPlayerId, bindingGeneration y estado activo; unicidad según el contrato existente.
- Sesión: jti, propietario/vínculo/épocas, estado y expiración; sin JWT completo. Estado del token consultable aunque su firma siga siendo válida.
- Guard del propietario: revision serial, actividad/época autoritativa y versión de esquema. No aceptar su ausencia ni recrearlo desde claims de un cliente.
- Comando/recibo de revocación con revocationId estable, revisión resultante y resultado; auditoría mínima sin secretos, confirmados atómicamente. Reintentar un commit incierto no debe aplicar una revocación distinta o reactivar una identidad.
- Evidencia interna de decisión de ingestión ligada al guard y al registro/recibo, definida en un cambio de contrato explícito.

Cuenta/vínculo/sesión y guard deben cambiar coherentemente en una misma transacción. También alta de sesión, rotación de credencial, desvinculación, suspensión, generación y retirada de sesión deben tocar el guard común; no puede quedar una ruta antigua fuera del protocolo. Para sesiones revocadas individualmente se preserva su estado específico; el guard común provoca conflicto, y la revalidación identifica qué sesión sigue autorizada.

Mantener el fence global de relaciones existente mientras no se rediseñe su garantía. En la futura UoW definir un único orden de adquisición: guard de propietario, sesión/vínculo, fence relacional y escrituras de operación; para múltiples propietarios, IDs ordenados. Esta es una propuesta de cambio del adaptador, no el orden implementado hoy. Evita introducir órdenes inversos de locks al añadir revocación.

### Secuencia de ingestión propuesta

1. Validar JWT RS256 v2 existente: firma/kid, issuer/audience, tiempo, rol player y contexto interno. No confiar en propietario arbitrario del body.
2. Iniciar transacción nueva y efectuar escritura condicional no upsert del guard del owner activo y con épocas esperadas; incrementar revisión. Cero coincidencias implica autorización inválida o estado incongruente, sin fallback.
3. En la misma sesión transaccional comprobar cuenta/vínculo/sesión/jti/épocas/tiempo. La mera escritura de guard no sustituye estas verificaciones.
4. Ejecutar las relaciones/índices/fences y persistir hecho, operación, recibo y evidencia interna con esa misma sesión. Ningún ACK o efecto externo antes de commit.
5. Commit confirmado: devolver el recibo persistido. Write conflict: abortar y reintentar con snapshot nuevo dentro del presupuesto. Commit incierto: 503 sin recibo especulativo; reconciliar con mismos IDs, sin presumir rollback.

### Secuencia de revocación propuesta

1. Autorizar al actor mediante el contrato apropiado, sin ampliar player a admin ni crear rutas administrativas improvisadas.
2. Iniciar transacción; escribir el mismo guard del propietario. Aplicar revocación/épocas/vínculo/sesión según alcance y guardar revocationId/auditoría/resultado de forma atómica.
3. Commit confirmado: responder revocación confirmada. Si el resultado es incierto, mantenerlo incierto y consultar/reintentar el mismo revocationId; no responder confirmada por haber enviado el comando.
4. Ninguna nueva operación con contexto anterior puede confirmar en un orden posterior incompatible; revalidación después de conflicto la rechaza.

### Por qué excluye el orden incorrecto

- Revocación primero: el guard y estado autoritativo ya cambiaron. Una operación con snapshot anterior no puede modificar con éxito esa versión; debe abortar por conflicto o no coincidencia. Reintento con estado nuevo detecta revocación.
- Operación primero: mantiene su modificación conflictiva hasta terminar. Una revocación no puede confirmar de forma independiente delante de ella sobre ese guard; espera/conflicta y se ordena después. El recibo previo permanece válido como hecho histórico.
- Lectura snapshot sin escritura común: ambas transacciones pueden modificar documentos distintos y confirmar con autorización obsoleta. El control negativo RVC21 reproduce exactamente esa insuficiencia.
- $inc/revisión debe modificar datos; una escritura no-op no se usa como prueba de conflicto.

Este razonamiento corresponde a la propiedad que se exige al despliegue Mongo real. La [documentación oficial de transacciones](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/) describe lecturas snapshot obsoletas y uso de escrituras conflictivas para proteger un documento. El modelo prueba el protocolo bajo sus supuestos; no sustituye locks, concern o comportamiento del servidor. La [atomicidad MongoDB](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/) fundamenta la modificación atómica por documento y el uso de transacciones cuando intervienen varios documentos.

## 5. Identidad durable, reinicio y claves

La implementación futura debe persistir IDs técnicos, instalación registrada, perfil vinculado, estado/épocas y sesiones/revocaciones confirmadas. No migrar Maps, snapshots o identidades sintéticas automáticamente. Contratos v2, propiedad y role player siguen explícitos; JWT viejo se rechaza según estado actual, aunque no haya vencido.

RS256 requiere continuidad de claves/kid y registro de claves confiables, sin generar una pareja de reemplazo silenciosa después de un reinicio o corrupción. Claves privadas fuera de documentos de negocio y OneDrive/repositorio, mediante proveedor/custodia cifrada con autorización independiente; Mongo puede almacenar referencias públicas/metadatos/kid, no una clave privada sin estrategia de cifrado. El proveedor cifrado de ensayo existente demuestra únicamente su alcance sintético; no se despliega KMS/Secrets Manager ni custodia productiva en esta fase.

Reinicio: reconstruir autoridad desde estado confirmado, no desde claims o caches; revocaciones no retroceden por recrear sesión/guard o restaurar backups sin control de rollback. Conservación de recibos no concede acceso al llamador revocado: la consulta pública también debe autorizarse; un reconciliador interno puede conservar evidencia sin exponerla.

Esto exige **nueva persistencia y una UoW de identidad/ingestión**, por lo que la sección 10 obliga a detener esa implementación hasta autorización posterior. No se añadió repositorio Mongo, colección, migración, endpoint ni modificación a JwtService/middleware actuales.

## 6. Demostración sintética y resultados

Archivos nuevos:

- tests/sync/support/revocation-coordination-model.js: modelo optimista test-only de snapshot/versiones, escritura común por owner, commit/abort, recibos y copia de imagen.
- tests/sync/durable-revocation-coordination.test.js: 24 escenarios y 20 intercalaciones.
- Este documento.

Actualizaciones documentales mínimas: ATLAS_CONCURRENCY_PREFLIGHT y B05_IMPLEMENTATION_ROADMAP. **No cambios de código productivo o de identidad.** El modelo no es un adaptador desplegable, no genera claves/tokens ni instala persistencia nueva.

**315 pruebas aprobadas: 44 nuevas y 271 regresiones, quince archivos; cero fallidas/omitidas.** Primera selección: 280 en catorce archivos (incluye JWT); después, 35 del archivo real de identidad persistente. No se suman las 44 focalizadas nuevamente. Un filtro inicial nombraba identity-persistence.test.js inexistente; se corrigió ejecutando persistence.test.js por separado. Las cifras finales reflejan archivos realmente ejecutados. Node --check de los dos archivos nuevos aprobado.

| Requisitos | Evidencia |
|---|---|
| Autorización sin revocación; revocación previa | RVC01–02 |
| Entre lectura y escritura; antes de commit | RVC03–04 |
| Operación confirmada primero; recibo histórico | RVC05/17/22 |
| Dos operaciones; revocación frente a ambas | RVC06–07 |
| Reinicio después de revocar | RVC08, reconstrucción de imagen del modelo; no proceso Mongo/disk |
| JWT previo; token expirado | RVC09–10 ejecutan JwtService real con identidad sintética |
| Desvinculación; épocas/credencial/sesión | RVC11–12/23 |
| Error transaccional, conflicto y retry limitado | RVC13–15 |
| Commit incierto y recibo persistido | RVC16; no se infiere rollback |
| Abort sin recibo | RVC18 |
| Separación de owners y rechazo de admin | RVC19 |
| Revocador desde otro proceso | RVC20: hijo Node propio solicita revoke por IPC; autoridad central doblada |
| Lectura sin write-fence insuficiente | RVC21, control negativo |
| Expiración al punto lógico del modelo | RVC24 |
| Intercalaciones de inicio/staging/commit | RVC-S01 a S20 |

Los veinte schedules conservan orden interno de tres pasos por transacción y exploran todos los órdenes topológicos entre ambas. Verifican que todo commit de operación aceptado precede al de revocación, o que la operación queda sin recibo. Los conflictos de revocación se completan con transacción fresca; los de ingestión no pasan a éxito con el snapshot viejo. No es una simulación que solo ejecuta revoke y operación secuencialmente en un orden elegido.

Supuestos explícitos del modelo: CAS atómico de revisión por owner y aplicación conjunta de guard/operación/recibo. El modelo **asume**, no demuestra, la implementación de esa atomicidad/durabilidad por Mongo. Su contador/auditoría modela orden confirmado, no tiempo de HTTP. RVC20 prueba mensajería/intercalación de un proceso real contra autoridad central sintética, no escritura concurrente Mongo entre procesos. La imagen de reinicio es memoria copiada, no disco duradero ni recuperación después de apagón. Los casos F.1 anteriores siguen reproduciendo la carrera del código actual.

## 7. Cambios futuros y plan de validación real

Propuesta de siguiente subfase, previa autorización explícita: implementar un repositorio Mongo de identidad de ensayo y una UoW transaccional común, con modelo/índices/métodos de revocación y comandos idempotentes definidos. Primero probar offline APIs/contratos y ambos órdenes con control de barreras, preservando todo JWT/Outbox/recibo existente. No basta añadir otro validate al final.

Después, en otra ejecución remota autorizada de entorno sintético:

1. Canal privado nuevo verificado/activación manual, DEFAULT/TLS/host/usuario/base confinados, permisos y preflight sin filter; namespaces propios, manifest y protección de artefactos D.2E.
2. Dos procesos independientes con conexiones/sesiones separadas, autoridad Mongo real compartida, clocks definidos y barreras controladas en el arnés; ningún mutex común de memoria que oculte la carrera.
3. Revocación gana primero, operación gana primero, revocación en pausa entre última comprobación y commit, dos operaciones y ambos órdenes con la revocación. Verificar conflictos/reintentos mediante estado duradero y revisiones/evidencias confirmadas, no hora de respuestas.
4. Reinicio de procesos con claves/identidades/sesiones de prueba preservadas de forma autorizada; revocación permanece y JWT viejo se rechaza. Probar suspensión/unlink/session/cv/authzVersion y errores de repositorio.
5. Commit incierto/reconciliación y recibos sin ACK especulativo; cleanup exacto y límites de ejecución. No failpoints/caída del clúster o escrituras fuera del ensayo.

**Nada de esto se ejecuta ni queda autorizado por F.1A.** F.2 sigue bloqueada hasta la implementación revisada y evidencia real suficiente del protocolo de revocación. Una autorización futura no debe cambiar remoteEnabled o saltar REVOCATION_COMMIT_RACE_REQUIRES_REVIEW sin cerrar esa garantía.

## 8. Riesgos, protección y cierre

Pendientes: contención/hotspot por owner y fence global, deadlocks si hay rutas con orden inverso, presupuestos de retry, revocación multiowner/masiva, actor administrador, durabilidad/rollback de backups y custodia/rotación de claves, precisión temporal, commit incierto y coherencia de caches. Degradar a memoria cuando Mongo falla violaría la garantía; usar 503 controlado sin autorización temporal ni borrado de progreso.

B00 sigue pendiente. No se modificaron ACL/propietarios o se declaró segura la custodia actual por existir un canal privado. No acceso/modificación a backend/.env, SQLite runtime/históricas, Godot, Compass, identidades reales o proyecto original. Sin nuevas certificaciones de sus hashes; las comparaciones de D.2E son históricas. Sin Atlas, credenciales, Outbox real, servidores de desarrollo, AWS o B05.5. Regresiones usan únicamente fixtures locales de prueba y procesos propios, cerrados al terminar.

**Criterios de F.1A cumplidos como diagnóstico/diseño: frontera identificada, regla inequívoca, protocolo verificable y pruebas sintéticas ejecutadas con límites declarados. Revocación durable NO resuelta en la implementación actual. F.2 permanece bloqueada. Detenerse y esperar autorización para implementar la nueva frontera transaccional de ensayo.**
