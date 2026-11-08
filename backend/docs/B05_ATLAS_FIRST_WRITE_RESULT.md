# B05.4C.2D.2D — Primera escritura real: bloqueada en inspección

2026-10-28, America/Guatemala. **BLOQUEADA ANTES DE CONEXIÓN Y ANTES DE CUALQUIER ESCRITURA.** No se ejecutó prueba real ni se preparó un canal privado nuevo.

## 1. Autorización y condición aplicada

El usuario autoriza una inserción sintética, lectura, cierre, reconexión y comprobación, con limpieza exacta si procede. La sección 7 establece: **«Si el adaptador requiere múltiples escrituras, índices secundarios, transacciones o dependencias para insertar un documento, NO ejecutar una operación parcial que pueda dejar datos inconsistentes.»** A continuación exige detenerse y documentar una fase de integración más amplia.

La inspección del adaptador real confirma esa condición. No se interpreta la autorización de una inserción como permiso para quitar índices, transacciones, controles de propiedad o escrituras coordinadas.

## 2. Fuentes revisadas

- B05_ATLAS_LISTCOLLECTIONS_ALTERNATIVE_RESULT.md.
- B05_ATLAS_LISTCOLLECTIONS_DIAGNOSIS.md.
- B05_ATLAS_PERSISTENCE_INTEGRATION_RESULT.md.
- B05_ATLAS_INTEGRATION_MODE.md.
- B05_MONGODB_ADAPTER_IMPLEMENTATION.md.
- B05_REMOTE_INGESTION_TEST_PLAN.md.
- Código: src/modules/sync/mongo-ingestion-repository.js, mongo-models.js, ingestion-engine.js y mongo-authorization-fence.js.

El resultado anterior D.2C demuestra únicamente aceptación de listCollections sin filter, con authorizedCollections true/nameOnly true y cero colecciones en aquel instante. Es evidencia histórica; no se reutilizó como preflight de una nueva escritura ni se repitió remotamente.

## 3. Dependencias exactas que impiden la inserción única

| Ruta implementada | Dependencia observada |
|---|---|
| MongoIngestionRepository.verifyDeployment | Comprueba replica set/primary y dos índices únicos secundarios: owner_operation_unique (technicalAccountId, operationId) y scope_source_unique (scope, sourceKey). Falla sin ellos. |
| MongoIngestionRepository.transaction | Utiliza startSession y withTransaction con snapshot/majority/journal; incrementa el control fences ingestion-v1 y exige que exista. |
| IngestionEngine.acceptOperation | Construye un hecho y una operación con recibo embebido y relaciones coherentes. No guarda una operación aislada de su hecho. |
| MongoIngestionRepository.writeState | Ejecuta upserts separados de hechos y operaciones dentro de la sesión. |
| beforeAuthorizationCommit / mongoAuthorizationFence | Revalida contexto e incrementa el control de sesión autorizado dentro de la misma transacción; exige un registro válido preexistente. |
| prepareIngestionIndexes | Su preparación explícita crea colecciones/índices y el control inicial. No es una única inserción ni se ejecuta en esta fase. |

Una nueva operación válida supone, como mínimo, inserción del hecho y de la operación, actualización del control global y actualización del control de autorización en una transacción, además de las precondiciones de índices/controles. No se ha medido el número real de comandos en Atlas: es una conclusión del código inspeccionado.

El recibo está embebido en la operación, no en una colección de recibos separada. Saltarse esa lógica mediante insertOne o Model.create no validaría el adaptador de ingestión. Un control fences insertado directamente tampoco demostraría esa ruta, aunque el modelo exista. No se implementó un repositorio paralelo ni se eliminó una guarda para satisfacer una prueba de alcance menor.

## 4. Estado de la prueba solicitada

| Criterio | Resultado actual |
|---|---|
| Preflight remoto nuevo | NO EJECUTADO; detención previa por dependencia del adaptador |
| Destino previsto, no conectado | TwoSidesCluster, <cluster>.<id>.mongodb.net, two_sides_integration_test |
| Usuario/authSource/mecanismo previstos | twosides_integration_test / admin / DEFAULT; no autenticación nueva |
| Colección sintética | No seleccionada ni creada; no hay operación autorizada compatible que fijar |
| Identificador nuevo de ejecución/documento | No generado |
| Canal/credencial | No preparado, solicitado, recibido ni reutilizado |
| Inserción | NO EJECUTADA |
| Lectura por identificador y unicidad | NO EJECUTADAS |
| Cierre/reconexión/persistencia | NO EJECUTADOS; ninguna conexión abierta por D.2D |
| Limpieza | No necesaria: ningún registro o recurso creado en Atlas |
| Errores de servidor | Ninguno observado en D.2D; bloqueo de alcance, no error remoto |
| Escrituras remotas adicionales | Cero; tampoco hubo la inserción prevista |
| Índices/transacciones/concurrencia | No ejecutados |
| Pruebas automatizadas nuevas | Ninguna; sin cambios de implementación, no se ejecuta una batería completa |

No existe un identificador ambiguo de escritura que requiera recuperación, ni se borraron documentos, colecciones, índices o artefactos privados de fases anteriores.

## 5. Datos protegidos y límites

No se abrió, consultó, hasheó o modificó backend/.env. No se accedió a SQLite runtime o a las dos bases históricas; no se modificaron sus contenidos, ACL o propietarios. La comparación criptográfica de D.2C es histórica: **no se presenta como una nueva comprobación de integridad en D.2D**. No se accedió a Godot, credenciales de Compass, usuarios/roles Atlas, base principal o proyecto original.

Único archivo creado en esta fase: backend/docs/B05_ATLAS_FIRST_WRITE_RESULT.md. Sin cambios de código, configuración principal, modelos, paquetes, permisos o propietarios. No servidores, npm run dev, conexiones remotas, Outbox real o AWS.

B00 y coordinación durable de identidad/revocaciones siguen pendientes. No se validan persistencia, recuperación abrupta, transacciones, recibos durables, idempotencia o concurrencia. La escritura solicitada no cumple criterios de aceptación porque no se ejecutó.

## 6. Recomendación para una subfase posterior

Antes de conectar, decidir y autorizar un alcance concreto:

1. **Ensayo básico independiente de Mongoose**, expresamente separado de la validación del adaptador de ingestión: una colección/documento sintético de diagnóstico, sin afirmar que prueba la ruta transaccional existente. Requiere autorización explícita de esa distinción y un arnés revisado; no se preparó ni ejecutó aquí.
2. **Integración del adaptador existente**, ampliando expresamente el ensayo a sus índices secundarios, controles ficticios, hecho/operación y transacción, con preflight sin filter, namespaces nuevos, manifiesto de propiedad y limpieza exacta. Debe delimitar el bloqueo de identidad durable y no presentarlo como resuelto.

Ninguna opción está autorizada por este informe. No se propone escribir solo una parte de una operación de ingestión ni reutilizar canales consumidos. El preflight sin filter debe verificarse de nuevo dentro de la futura ejecución autorizada; su éxito anterior no reserva namespaces ni habilita escrituras.

**B05.4C.2D.2D BLOQUEADA POR LA CONDICIÓN EXPLÍCITA DE LA SECCIÓN 7. Trabajo detenido. No iniciar B05.5, persistencia ampliada o nuevo intento remoto sin instrucciones independientes.**
