# B05.4C.2F.1C.2 — Resultado del preflight funcional C.2 en Windows

Fecha: 2026-10-29. **Resultado: PARCIAL. No se declara PREPARACIÓN FUNCIONAL COMPLETADA.**

Se cerraron defectos de esquema, limpieza y clasificación del escenario de respuesta perdida, con pruebas offline seleccionadas aprobadas. Quedan límites del futuro ejecutor sin implementar de extremo a extremo. C.2 permanece deshabilitada; no hubo conexiones Atlas, credenciales, escrituras remotas ni cambios de esquema. B00 pendiente, F.2 bloqueada y B05.5 no iniciada.

## Evidencia revisada

Se contrastaron el arnés y los informes B05_C2_WINDOWS_EXECUTION_PLAN, B05_DURABLE_REVOCATION_ATLAS_RESULT, B05_DURABLE_REVOCATION_ATLAS_SCHEMA_RESULT, B05_DURABLE_REVOCATION_ATLAS_PREFLIGHT, B05_DURABLE_REVOCATION_IMPLEMENTATION, B05_ATLAS_CONCURRENCY_PREFLIGHT y B00_CONTROLLED_ACL_INSPECTION_RESULT.

Código revisado: scripts/durable-revocation-atlas-harness.js; modules/auth/mongo-identity-repository.js, mongo-identity-models.js y jwt-service.js; modules/sync/mongo-ingestion-repository.js, mongo-models.js, ingestion-service.js, budget.js, atlas-policy.js y atlas-integration.js; middleware/sync-auth-context.js; config/jwt.js; package.json; configuración/guardas y dependencias de las pruebas seleccionadas. Las rutas de modules/middleware/config son relativas a backend/src.

También se leyeron metadatos de paquetes instalados: Node 24.19.0, Mongoose 9.11.2, mongodb 7.7.0, jose 6.2.13, Zod 4.6.7, Argon2 2.2.2 y Vitest 5.0.5. No se instalaron paquetes ni se certificó su procedencia.

## Archivos modificados en esta etapa

- backend/scripts/durable-revocation-atlas-harness.js.
- backend/tests/sync/durable-revocation-atlas-preflight.test.js.
- backend/docs/B05_C2_WINDOWS_EXECUTION_PLAN.md.
- Este informe nuevo.

No se modificó el núcleo de identidad/ingesta, política Atlas, esquemas Mongoose, lanzadores, receptores ni auxiliares históricos. No se creó un canal.

## Defectos encontrados y correcciones

1. El plan generaba namespaces nuevos y esperaba solo cuatro colecciones D2E. Ahora fija el runId/esquema C.2A y exige el catálogo exacto de doce nombres. executionId separa los planes locales y cada plan genera IDs/bindings/comandos nuevos. El helper de provisión devuelve listas vacías y seedFence=null: esta fase no vuelve a crear nada.
2. La limpieza incluía el fence preexistente entre las 17 filas a borrar. Ahora compara todo el snapshot, pero omite el fence al borrar: elimina 16 filas propias y conserva el control global y su revisión final. Un cambio de fence después de capturar el inventario aborta antes del primer borrado.
3. Faltaba un requisito de inventario inicial antes del registro sintético. verifyDurableInitialInventory exige el único fence exacto inicial y cero filas en las otras siete colecciones; sin su aprobación registerDurableRaceActor falla antes de escribir.
4. Los ocho envíos solo tenían un contador global. Se añadieron máximos por caso (2/2/4), admisión de dos tareas simultáneas de ingesta/revocación y comprobación de deadline total de 120 s. Se comprueban tiempos antes y después del trabajo. Son barreras de admisión y de éxito; no cancelan I/O pendiente.
5. C podía interpretar una respuesta 503 de commit incierto como una pérdida simulada tras commit confirmado. Ahora exige que se haya ejecutado el hook afterCommit. Si no ocurrió, se detiene y no realiza el retry/desvinculación posterior. El repositorio sigue ocultando errores sensibles bajo la API genérica; no se inventa una categoría remota a partir del 503.

executeDurableAtlasRun sigue rechazando incondicionalmente con DURABLE_REVOCATION_C2_NOT_AUTHORIZED. remoteEnabled permanece false. No se añadió una capacidad Atlas C.2 ni un conector.

## Inventario del fence y relación con identidad

| Elemento | Evidencia offline / condición |
|---|---|
| Colección | b054c2c_10ef4f6d653f4ee4a1d1b2e6591013c2_fence |
| Identificador | ingestion-v1 |
| Contenido histórico inicial | {_id:'ingestion-v1',revision:0}, documentado y verificado en C.2A |
| Propietario sintético | No existe campo de propietario: es el control global de ingestión de ese esquema |
| Generación/versión | revision inicial 0; no es bindingGeneration ni una versión de JWT |
| Guardas por propietario | Otra colección: mismo prefijo con sufijo _ownerGuards; _id=technicalAccountId y revision inicial 0 al registrar |
| Identidades nuevas | Tres owners independientes, bindings con bindingGeneration=1 y épocas credentialVersion/authzVersion iniciales 1 |
| Relación transaccional | Ingesta toca ownerGuard y fence global en la sesión común; revocación toca ownerGuard y estado/comando en esa misma frontera |
| Qué conservar | Fence existente, su revisión resultante, ocho colecciones C.2A/cinco índices secundarios y cuatro colecciones D2E previas |
| Cómo distinguir ejecuciones | executionId local nuevo, UUID de registro/instalación/jugador/operación/sesión origen/comando nuevos y registry exacto de technicalAccountId/sessionId |
| Estado actual en Atlas | PENDIENTE DE VERIFICACIÓN REMOTA; no se abrió MongoDB para comprobarlo |

No se añade executionId a las filas ni se modifica el esquema para hacerlo. La pertenencia de filas se deriva del registry opaco de actores, identificadores, bindings y relaciones exactas de contenido. No basta con prefijos. La pérdida del registry no permite reconstruir una limpieza automática.

El contenido esperado al terminar todos los casos es: operaciones 2, hechos 2, fence 1, authorization 0, identidades 3, ownerGuards 3, identitySessions 3 y revocations 3. Son 17 filas, de las cuales C.2 crea 16 y C.2A aportó una. El fence avanza legítimamente durante la ingesta; conservarlo no significa restaurar revision=0. Un posterior plan que encuentre un fence avanzado se detiene: no reinicia ni adopta un baseline distinto automáticamente.

Los 12/19 de Compass son observaciones comunicadas, no inventario actual certificado. C.2A documentó ocho _id y cinco secundarios nuevos; el total 19 depende además de índices históricos que no se inspeccionaron ahora.

## Coordinación transaccional

MongoIngestionRepository delega la transacción a MongoIdentityRepository y propaga su ClientSession a sus lecturas/escrituras. coordinate toca el guard del propietario y valida identidad/sesión/vínculo/épocas nuevamente dentro de cada callback. revoke usa esa misma coordinación antes de modificar identidad y persistir el comando. El guard se modifica por CAS/$inc; no se reemplaza por un lock en memoria.

Las pruebas seleccionadas ejercitan reintentos de conflicto snapshot, revocación ganadora, ingesta ganadora, ausencia de recibos de aborts, rechazo de duplicados/consulta de recibos tras revocación, separación entre propietarios y reapertura lógica. El caso B compara revisiones persistidas en el doble. El doble supone atomicidad/conflictos del servidor y no prueba concerns, durabilidad o carreras reales de Atlas.

Un resultado de commit incierto detiene el caso y bloquea nuevos escenarios/limpieza automática. Las tareas ya iniciadas se liberan/drenan; esto no revierte un commit ni demuestra ausencia de efectos. La pérdida de respuesta C es conocida solo por el hook ejecutado después de withTransaction resuelto, y no equivale a UnknownTransactionCommitResult.

## Límites: implementación y pendientes

| Límite | Situación |
|---|---|
| Registros/bindings | Tres etiquetas, registro una vez por etiqueta; IDs nuevos por plan |
| Sesiones de identidad del escenario | Un inicio de sesión por etiqueta: tres filas esperadas; no confundir con ClientSession |
| Envíos | Máximo global ocho y máximos A=2, B=2, C=4, comprobados antes de invocar el trabajo |
| Paralelismo del trabajo de carreras | Máximo dos tareas de ingesta/revocación admitidas por el wrapper |
| Reintentos de callback | Máximo tres en MongoIdentityRepository y limpieza; sin retry externo de la ejecución |
| Operación de servicio | 2 s mediante bounded/AbortSignal; no fuerza la interrupción física del socket |
| Transacción/commit | timeoutMS=10000 y maxCommitTimeMS=1000 en opciones del repositorio |
| Barrera | Timer de 1 s |
| Escenario/total | 30 s/120 s en comprobaciones de admisión y finalización, sin supervisor efectivo de proceso |
| Documentos | Escenarios fijos y validación exacta final de 17 filas dentro del techo 24; no hay contador global de mutaciones independientes |
| Conexiones | Techo tres objetos al verificar cierre; no es una limitación preventiva de aperturas ni de sockets |
| ClientSession | finally/endSession en repositorios y limpieza; falta una barrera de admisión/cupo de sesiones Mongo del futuro ejecutor |
| Cierre | finally, liberación de barreras, drenaje y cierres simulados; un I/O/close colgado sigue requiriendo límites externos |

Pendientes funcionales concretos: supervisor efectivo de 120 s con detención/drenaje verificable; timeout de comandos no transaccionales y cierre; conector C.2 con retryReads=false/retryWrites=false (la fábrica genérica aún usa retryWrites=true); cupos de apertura y ClientSession; integración de esos controles en un ejecutor que aún no existe. Un Promise.race o comprobar el reloj después del await no acreditan un tiempo máximo de proceso. Por ello los límites no están cerrados de extremo a extremo y el resultado es PARCIAL.

## Política de limpieza

Solo después de A/B/C y reapertura satisfactorios se captura y valida el inventario. Antes del primer delete se revalida dentro de withTransaction y se compara todo el contenido. deleteOne usa cada _id exacto, con technicalAccountId adicional cuando la fila lo contiene; para hechos/guards el _id se verifica previamente contra el registry y las relaciones del owner. No hay drop, borrado por prefijo ni filtros vacíos.

El fence participa en la comparación pero queda excluido del borrado. Se conservan colecciones e índices. Ante fila extraña, namespace incorrecto, cambio de contenido/revisión, fallo de borrado o resultado incierto, el ensayo no declara limpieza completa. No se relaja el inventario para sortear residuos: conservar y requerir recuperación separada.

## Selección offline, guardas y resultados

Se usó env-guard antes de Vitest, envDir=false en configuración e isolation-guard en las suites. La selección excluyó persistencia de archivo/identidad que usa private-workspace.ps1. Los imports de fixture y sus almacenes sintéticos se inspeccionaron; no se invocó el auxiliar ni consultas ACL/propietario. Las pruebas de Mongo usan dobles, no un servidor Mongo. Algunas regresiones de API usan únicamente HTTP loopback efímero con datos sintéticos.

El primer comando focalizado con el loader/pool por defecto no pudo cargar la configuración por spawn EPERM, antes de ejecutar tests. No se elevó el proceso ni se cambió ACL. Se usó --configLoader native --pool threads. El primer pase focalizado de 35 pruebas aprobó; no se suma otra vez al resultado final.

Comandos finales desde backend:

```powershell
node --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run --config vitest.config.js --configLoader native --pool threads tests/sync/durable-revocation-atlas-preflight.test.js tests/sync/durable-revocation.test.js tests/sync/mongo.test.js --testNamePattern '^(?!DR16)'
node --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run --config vitest.config.js --configLoader native --pool threads tests/sync/atlas.test.js --testNamePattern '^(?!A20 |A36 )'
```

Resultado final: **156 pruebas únicas aprobadas, cero fallidas en los pases finales, tres excluidas explícitamente**. Primer comando: 122 aprobadas y DR16 excluida; segundo: 34 aprobadas y A20/A36 excluidas. El error inicial es un fallo de arranque del runner, no una prueba aprobada ni un fallo de aserción oculto.

DR16 ejecuta una regresión de proceso Node hijo y quedó fuera de esta selección. A36 invoca el lanzador PowerShell histórico y se excluyó para evitarlo por completo. A20 intenta accesos negativos bloqueados a rutas protegidas y también se excluyó. No se ejecutaron suites generales de persistencia ni se volvieron a lanzar las 493 históricas.

Siete casos nuevos RC25–31 cubren inventario inicial/fence ajeno, deadline de admisión, techo de paralelismo, máximo por escenario, commit incierto no confundido con respuesta perdida, fence modificado antes de cleanup y registro bloqueado sin inventario inicial. Los casos existentes actualizados cubren catálogo/preparación C.2A, limpieza de 16 filas y conservación del fence; las regresiones cubren reintentos, conflictos, autorización, aislamiento, receipts y cierre simulado. Los dobles no validan concurrencia real.

## Riesgos y condiciones de C.2

B00 continúa pendiente. Se consultó su informe histórico, sin repetir inspección ACL. La herencia Modify/Synchronize sobre código/dependencias y los procesos de la misma cuenta pueden afectar integridad y secretos. No se atribuye malicia a los SID ni se considera suficiente una huella o la ubicación LOCALAPPDATA. Se necesita evidencia de procedencia, protección frente a sustitución y privacidad durante toda la ejecución en Windows.

Antes de conectar: cerrar los pendientes funcionales descritos, habilitar una capacidad C.2 exacta mediante cambio revisado sin reutilizar D2E/schema-only, verificar catálogo/indexes/fence/ausencia de datos inesperados remotamente antes de escribir, fijar identidad/destino/TLS y permisos efectivos y preparar un canal nuevo únicamente tras autorización. No pedir secretos ni reutilizar canales consumidos.

Recursos protegidos: no se abrieron backend/.env ni las tres bases SQLite; no se recalcularon sus hashes, no se cambiaron sus referencias ni se afirma una nueva verificación de integridad por contenido. No se modificaron Godot, ACL, propietarios, usuarios Atlas o estructuras remotas. Ninguna prueba ni comando utilizó credenciales Atlas.

C.2 no se ejecutó. F.2 y B05.5 siguen detenidas. El éxito offline cierra las correcciones descritas, no demuestra revocación durable real ni certifica B00.
