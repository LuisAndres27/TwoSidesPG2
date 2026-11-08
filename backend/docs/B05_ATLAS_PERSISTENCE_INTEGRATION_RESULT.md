# B05.4C.2D.2 — Persistencia real controlada Mongoose/Atlas

> **Resultado comprobado B05.4C.2D.2B:** una sesión adicional exclusivamente de lectura, autorizada por separado, confirmó autenticación/destino y permisos efectivos listCollections/find sobre toda la base. La consulta original se ejecutó una vez y falló con **UNSUPPORTED_METADATA_FILTER, MongoServerError 8000**, etapa list-collections. No alternativa, escrituras, transacciones o modelos; cierre correcto y tres bases protegidas idénticas antes/después. Ver [resultado real completo](B05_ATLAS_LISTCOLLECTIONS_REMOTE_RESULT.md). El rechazo del filtro queda clasificado en esta sesión; no se atribuye automáticamente al plan M0 ni se acredita otra consulta. Persistencia y transacciones siguen NO VALIDADAS; no reanudadas.

> **Seguimiento B05.4C.2D.2A:** diagnóstico offline finalizado; 152 pruebas aprobadas (14 nuevas y 138 regresiones), sin conexiones remotas. El filtro original cumple el contrato general; el código 8000 sigue sin causa demostrada. Se corrigió la falta de comprobación explícita de la acción listCollections para la consulta original. Se preparó, sin sustituirla automáticamente, una alternativa exact-authorized con cobertura efectiva de toda la base. Ver [diagnóstico, garantías y preflight posterior propuesto](B05_ATLAS_LISTCOLLECTIONS_DIAGNOSIS.md). Este seguimiento no cambia el resultado remoto histórico de D.2: cero escrituras y persistencia no validada.

2026-10-28, America/Guatemala. **BLOQUEADA EN EL PREFLIGHT REMOTO, ANTES DE CUALQUIER ESCRITURA.** La ejecución manual autorizada terminó y no se repitió. Autenticación/privilegios correctos; listCollections devolvió MongoServerError 8000. Persistencia y transacciones NO VALIDADAS. Las secciones de planificación siguientes se distinguen del resultado real consignado al final. B05.5 no iniciada.

## 1. Preflight y autorización

El usuario autoriza una ejecución pequeña de escritura/reconexión/transacciones/idempotencia/concurrencia/reinicio y limpieza exclusivamente sintéticas, condicionada a activación manual del canal privado. Se revisaron resultado DEFAULT, modo de integración, implementación Mongoose, plan de pruebas remoto, preflight Atlas y contrato de identidad. Prevalecen código y autorización actuales sobre restricciones históricas de fases anteriores.

Destino exclusivo: TwoSidesCluster; host <cluster>.<id>.mongodb.net; usuario twosides_integration_test; base two_sides_integration_test; authSource admin; DEFAULT explícito y TLS estricto. No administrador, twosides_backend o two_sides_db. Cada conexión verificará identidad/destino/privilegios antes de usar modelos. dbName no es la única barrera.

## 2. Cambios y límites

- atlas-policy.js: DEFAULT con escrituras exige además persistenceTest B05.4C.2D.2 exacto. DEFAULT habitual sigue rechazando escrituras; SHA-256 habitual se conserva. El arranque principal no selecciona esta capacidad.
- mongo-models.js: solo los cuatro modelos de esa capacidad reciben integrationRunId y syntheticOwnerId requeridos, inmutables y con default del runId. Se conservan contratos canónicos y modelos fuera de esta prueba.
- scripts/atlas-persistence-suite.js: etapas condicionadas, IDs previos, comprobación de ausencia de namespaces, modelos/índices explícitos, prueba del repositorio real, inventario previo a limpieza y deleteOne por ID + ambas marcas. Sin dropDatabase/dropCollection/deleteMany.
- scripts/atlas-persistence-receiver.js: orquestador y trabajador privados con hashes, marcadores exclusivos y dos procesos secuenciales propios. El siguiente proceso solo inicia si el anterior informa completed y cierre correcto.
- scripts/send-atlas-persistence-credential.ps1: derivado del canal revisado, con switch D.2, nombres de resultado/marcador exclusivos y plazo máximo 180000 ms para los dos trabajadores. No cambia el sender de lectura.
- tests/sync/atlas-persistence.test.js: cinco pruebas P01–P05 de capacidad, modelos, propiedad/IDs, sobres sintéticos y rechazo del sender sin autorización.

Máximo previsto: cuatro colecciones nuevas por runId, tres operaciones y tres hechos, dos documentos de control de transacción confirmados y tres controles de sesión; dos solicitudes concurrentes, hasta cuatro conexiones propias en total repartidas en dos procesos secuenciales (máximo dos simultáneas). No carga/failover del clúster. Plazos existentes del adaptador, incluido presupuesto de 2000 ms por operación, no se amplían. Los trabajadores tienen límite propio de 65000 ms.

## 3. Credenciales y manifiesto

Directorio nuevo fuera de OneDrive/Git:

`C:/Users/luis2/AppData/Local/TwoSides/AtlasIntegrationTests/b054c2c-d73458a56d2d46d489f5f2294d20e907/`.

RunId: `d73458a56d2d46d489f5f2294d20e907`.

Receptor y trabajador SHA-256: `EB1CF348691E0FCE91C95B525F5FA2BD104F4095FA3BB5F574582C2D5F5A48BF`.

Sender SHA-256: `ACDBA0C5D1D9B246871C15F20E7D041132E99A52EB38B084CE1019A6B1B28A76`.

Manifiesto nuevo: fase D.2, DEFAULT, AllowWrites true, TLS requerido, una invocación, dos etapas y 56 dependencias de código/fixtures/lockfile fijadas por hash. Receptor/trabajador/sender fueron comprobados sintácticamente; propietario, Allow limitadas al usuario/SYSTEM/Administradores y ausencia de enlaces en ancestros se comprobaron sin cambiar permisos. No existía marcador al preparar el canal.

El usuario recibe un comando con ruta/parámetros/huella reales. Solo el prompt oculto acepta su entrada. El padre conserva el secreto temporalmente en RAM y lo entrega por stdin binario a cada trabajador; nunca en URI, argv, entorno o archivos. El entorno de los hijos es mínimo. No se lee Compass o backend/.env. No se reutilizan secretos o manifiestos de D.1. Marcadores persistence-attempt.started y worker-N-attempt.started impiden reutilizar etapas; no se borrarán para reintentar.

## 4. Secuencia prevista antes de la activación — no equivale a ejecución

| Puerta | Comprobación prevista |
|---|---|
| Seguridad | Identidad, base, host, TLS, permisos y ausencia de las cuatro colecciones antes de escribir |
| Escritura mínima | Un control ingestion-v1 mediante el modelo fences del adaptador, con propiedad marcada; lectura exacta |
| Reconexión | Cerrar y abrir otra conexión; releer ese control sin cambios |
| Índices | Crear solo las cuatro colecciones nuevas y los dos índices únicos requeridos; comprobarlos |
| Transacciones | Insertar un control confirmado mediante commit y otro mediante abort; comprobar presencia/ausencia |
| Adaptador | Una operación válida por IngestionService/MongoIngestionRepository; lectura y recibo embebido |
| Idempotencia | Mismo ID/contenido devuelve recibo original; contradicción devuelve conflicto sin recibo |
| Recibos | Consulta del recibo confirmado por la ruta de servicio existente |
| Concurrencia | Dos conexiones/identidades sintéticas del mismo propietario con coordinadores separados; operación idéntica y contradictoria |
| Propiedad | Rechazo de un vínculo ajeno |
| Revocación | Rechazo local implementado; coordinación durable NO validada |
| Reinicio | Terminar primer proceso y abrir segundo; releer documentos/recibo y reenviar la operación confirmada como simulación de respuesta perdida |
| Limpieza | Inventario exacto, propiedad/IDs comprobados, deleteOne acotado y verificación de cero documentos restantes |

La primera escritura usa un modelo Mongoose preparatorio del adaptador; no se confunde con ingestión real, que se prueba después mediante el repositorio transaccional. Si falla una puerta, no se ejecutan las dependientes ni un nuevo intento externo.

## 5. Identidad, límites del ensayo y limpieza

Identidades, claves JWT y credenciales de fixture son ficticias y viven en memoria. Tras reiniciar se reconstruye deliberadamente el propietario sintético con una nueva sesión/clave local; esto prueba persistencia del adaptador y reenvío, no persistencia o recuperación de identidad real. No se modifica el diseño de identidad ni se resuelve la coordinación transaccional entre autoridades de revocación.

El manifiesto sintético se guarda antes de escribir e incluye runId, propietario ficticio, IDs de operación/sesión/colecciones y posteriormente recibo e inventario de limpieza. No contiene contraseña Atlas, JWT, claves o verificadores. Todo documento de esta ejecución recibe ambas marcas; antes de eliminar se exige colección exacta, ID previsto, marcas y propietario coherente. Se conservarán datos si no puede demostrarse la propiedad o si hay un error inesperado. Las colecciones vacías/índices se retienen: no se autoriza drop.

## 6. Pruebas offline y límites M0

**138 pruebas sintéticas aprobadas, siete archivos, cero omitidas**, incluyendo cinco P nuevas y regresiones Atlas/Mongoose. Tras ajustar la comprobación positiva del constructor P02, se repitieron esas cinco: aprobadas; no se suman como casos nuevos. La primera invocación de Node --check usó una ruta duplicada backend/backend y se corrigió antes de preparar el canal; receptor, suite y sender revisados pasan sintaxis. Ninguna batería offline demuestra transacciones o persistencia Atlas.

La documentación oficial de [Atlas Free](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/) indica 0.5 GB, 500 conexiones, 500 colecciones, 100 operaciones/s y namespaces de 95 bytes; el arnés comprueba longitud y se limita a un conjunto pequeño. No se conocen por este ensayo las cuotas globales ya consumidas por otros usos. No pruebas de failover o cambios de plan. Los [comandos restringidos](https://www.mongodb.com/docs/atlas/unsupported-commands/) se revisaron; un rechazo real de comando/transacción detendrá las pruebas dependientes sin eludirlo. La compatibilidad transaccional real sigue pendiente hasta el resultado.

## 7. Datos protegidos y estado pendiente

Referencia previa capturada con SHA-256, tamaño, mtime UTC, propietario y SDDL, sin abrir SQLite mediante SQL:

| Base protegida | Bytes iniciales | SHA-256 inicial |
|---|---:|---|
| Runtime | 2813952 | 39DECCBA75CB405961BCC03E85C0F8A64542B84585F200FF3F0F64B984B0D197 |
| Histórica game-progress | 147456 | 74015F29F60F21B90B879B7EB1E6CB8212CF64631C81E69298A4D40428CB064D |
| Histórica persistence | 147456 | 1CF9B0331B3E088E36415583E987C773C1B71B15472F0EBD95D7478EF56E215F |

Runtime está en local-persistence/.work/runtime-game/save.sqlite3 de la copia. Históricas bajo AppData/Local/TwoSides/ReconstructionTests/copy-06dc7ade-b3cd-425b-8d79-90dde8ef1ac6, en game-progress/save.sqlite3 y persistence/save.sqlite3.

La comparación final de bases, resultado y cierre se consignan a continuación. backend/.env queda fuera del acceso, sin nueva certificación de su hash. Godot, ACL, propietarios, usuarios Atlas y configuración principal no se modifican. B00 continúa pendiente.

No se declara validada la integración completa. No iniciar B05.5/AWS ni cambiar contraseñas. El único procedimiento se detuvo ante una comprobación esencial fallida, sin reintento automático.

## 8. Ejecución real y error sanitizado

El usuario ejecutó manualmente una vez el sender privado con el receptor/huella indicados y confirmó la salida genérica de canal finalizado. Esa salida no acredita persistencia. El agente leyó únicamente los resultados sanitizados, sin iniciar otra conexión.

Registro final: **22:31:44 del 28 de octubre de 2026, Guatemala**, 2026-10-29T04:31:44.247Z. Marcador persistence-attempt.started conservado. Solo se inició el trabajador 1; no existe trabajador 2 iniciado ni su resultado.

| Campo real | Resultado |
|---|---|
| Estado global | blocked |
| Etapa global | worker-1-stopped |
| Etapa exacta del trabajador | namespace-preflight |
| Mecanismo solicitado | DEFAULT |
| Autenticación | verified |
| Privilegios | verified mediante connectionStatus y política existente |
| Usuario/base/host | twosides_integration_test / two_sides_integration_test / host autorizado, verificados antes del preflight de namespaces |
| Operación fallida | listCollections con filtro name.$in limitado a los cuatro nombres nuevos previstos y nameOnly true |
| Clase | MongoServerError |
| Código técnico seguro | 8000 |
| codeName | AtlasError |
| Categoría disponible | UNKNOWN_CONNECTION_FAILURE |
| Etapa del clasificador | diagnostic; la etapa funcional más precisa es namespace-preflight |
| Cierre | closed true en trabajador y orquestador |
| Escrituras/documentos/índices/transacciones | **0 / 0 / 0 / 0** |

La categoría genérica del clasificador no implica que fallara la conexión: autenticación e inspección de privilegios ya habían terminado correctamente. **Este código 8000 no se clasifica como AUTHENTICATION_FAILURE.** No se conserva ni muestra el mensaje original, stack, URI, secreto u objeto de configuración. El código por sí solo no identifica la causa.

El fallo ocurrió al verificar que las colecciones nuevas no existían. No se llegó a createCollection, create, createIndexes, sesiones/transacciones o ingestión. La construcción de modelos estaba configurada con autoCreate/autoIndex false. No hubo una primera escritura fallida: **la primera escritura nunca se intentó**. Al no poder completar el aislamiento, el arnés cerró y no ejecutó pruebas dependientes, tal como exigía la autorización.

## 9. Matriz de resultados realmente ejecutados

| Área | Estado real |
|---|---|
| Pruebas sintéticas con dobles | 138 aprobadas; 5 P nuevas y regresiones, sin sumar repeticiones |
| Autenticación/TLS/destino/permisos Atlas | Verificados en la conexión del trabajador 1 |
| Ausencia de namespaces seleccionados | Comprobación fallida; no se presume satisfecha |
| Escritura mínima del modelo | NO EJECUTADA |
| Reconexión y persistencia | NO EJECUTADAS |
| Índices y restricciones reales | NO EJECUTADOS/VERIFICADOS |
| Transacciones start/commit/abort | NO EJECUTADAS; compatibilidad M0 desconocida por este ensayo |
| Ingestión/idempotencia/conflictos | NO EJECUTADOS contra Atlas |
| Recibos confirmados | Ninguno generado/persistido en Atlas por este ensayo |
| Concurrencia y reinicio | NO EJECUTADOS; segunda conexión paralela y segundo proceso no iniciados |
| Respuesta perdida/reenvío | NO EJECUTADOS |
| Propiedad/vínculo ajeno y revocación local | NO EJECUTADOS contra Atlas; pruebas con dobles no equivalen a ese resultado |
| Coordinación durable de identidad/revocación | Pendiente y sin cambios de diseño |
| Limpieza de documentos remotos | NO EJECUTADA porque no se creó ningún documento |

## 10. Causa disponible y propuesta mínima, sin ejecutar

Hecho demostrado: MongoServerError 8000 durante la enumeración filtrada de nombres, después de autenticar y verificar privilegios. No hay evidencia suficiente para afirmar que Atlas Free prohíba transacciones o toda enumeración de colecciones. La [referencia oficial de listCollections](https://www.mongodb.com/docs/manual/reference/command/listcollections/) indica compatibilidad Atlas y describe filtrado por nombre. No demuestra que esta variante concreta haya funcionado en este clúster.

Una incompatibilidad del filtro compuesto name.$in con el servicio/tier es una **hipótesis**, no una causa confirmada por el resultado sanitizado. Existe un [antecedente histórico oficial de MongoDB sobre filtros en Free](https://jira.mongodb.org/browse/RUBY-1825), pero no prueba el comportamiento del clúster actual. También faltan detalles técnicos no sensibles del rechazo que el clasificador genérico no retuvo. No se extraerá el error original de procesos o secretos para completarlos.

Propuesta para una fase posterior: preparar y probar offline cuatro consultas independientes listCollections con name igual al nombre exacto y nameOnly true, manteniendo la exigencia de ausencia antes de escribir. No sustituir el preflight por una suposición, no enumerar/inspeccionar documentos ajenos ni cambiar roles. Antes de una nueva ejecución, ampliar de forma acotada el clasificador con firmas fijas sanitizadas de errores de comando/filtro, sin registrar mensajes originales. Ambas propuestas requieren revisión del código y un canal/manifiesto nuevos; no se aplicaron ni se probaron remotamente después del fallo.

No se recomienda pagar/cambiar el clúster o eludir restricciones a partir de este resultado. Un replica set local desechable sería una alternativa futura para validar el adaptador si la limitación se confirma, pero no se instala ni se inicia infraestructura en esta fase.

## 11. Integridad y limpieza final

Las tres bases protegidas conservan **exactamente SHA-256, tamaño, mtime UTC, propietario y SDDL** frente a la referencia inicial de esta fase. No SQL, migración o uso como fixtures. backend/.env no se abrió, consultó, hasheó o modificó; no se anuncia una nueva certificación de su contenido. Godot, ACL, propietarios, usuarios Atlas y configuración principal intactos por este procedimiento.

Las 56 dependencias, receptor y trabajador coinciden con el manifiesto después del intento. El sender conserva su huella revisada. No hay procesos Node remanentes. El trabajador cerró la conexión y se detuvo antes de escrituras. Los buffers/BSTR controlados se liberan; no se promete borrado garantizado de strings del GC.

Se conservan nueve artefactos privados de auditoría: sender, receptor, trabajador, manifiesto de código, marcador/resultado del padre, marcador/resultado del trabajador 1 y synthetic-manifest.json. Este último contiene solo identificadores sintéticos previos; no llegó a tener recibos o inventario remoto de limpieza. No hay archivos de contraseña/JWT/claves. Los marcadores se conservan para bloquear reutilización. Los temporales de las pruebas sintéticas se cerraron/limpiaron; no datos remotos que borrar ni colecciones/índices nuevos que retirar.

**B05.4C.2D.2 BLOQUEADA EN PREFLIGHT.** B00 continúa pendiente. Persistencia Mongoose/Atlas, índices y transacciones no validados. No repetir la ejecución, no iniciar B05.5/AWS ni cambiar credenciales. Entregar este resultado y esperar instrucciones específicas para corregir el preflight.
