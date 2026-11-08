# B05.5 — preparación del backend principal y sincronización normal

Fecha: 2026-10-30. **Perfil main implementado y comprobado offline. No conectado ni desplegado.** Pendientes esquema remoto, configuración operativa y primera conexión autorizada. B00 continúa pendiente. No se ejecutaron C.2/F.2 ni se modificó C2Runtime.

## 1. Arquitectura encontrada y componentes reutilizados

Los archivos solicitados src/config/database.js y src/config/env.js no existían; se crearon con contratos explícitos. El arranque anterior de server.js servía la aplicación local, sin persistencia MongoDB principal. La composición reservaba main, los almacenes exigían synthetic/disposable y los perfiles JWT aceptaban únicamente los ámbitos de prueba.

Se reutilizan sin sustituir sus contratos HTTP: JWT v2, Argon2id, validación estricta, autorización de propietario e instalación, guard durable de identidad, revocaciones, repositorios MongoDB de identidad/ingesta, lecturas acotadas por propietario, transacciones snapshot/majority, claves únicas, idempotencia y recibos. Se mantiene el cierre HTTP antes de liberar la base. Main no importa el lanzador integration ni su escenario sintético.

En Godot se reutilizan GameApplicationContext/GameSyncHost, guardado local, captura/reconciliación Outbox, worker único, transporte HTTP, renovación de JWT, aplicación de recibos y almacén DPAPI por jugador/instalación. Ninguna credencial MongoDB se transmite a Godot.

## 2. Cambios implementados

| Archivos | Resultado |
|---|---|
| src/main/policy.js | Destino principal fijo, verificación de conexión y privilegios, ámbitos/bundles/repositorios registrados y separación respecto de integración |
| src/main/profile.js | Composición de repositorios durables reales, inspección de esquema en lectura, sin autoCreate/autoIndex ni limpieza sintética |
| src/main/runtime.js | Proveedores explícitos de credencial y clave JWT persistente, arranque/cierre principal, carga de clave fuera del repositorio y OneDrive |
| src/config/database.js y env.js | Conector Mongoose principal y configuración de proceso validada; sin dotenv ni contraseña/URI MongoDB tomada de .env |
| scripts/run-main-backend.ps1 | Lanzador normal separado: requiere EnableMain, entrada oculta, trama binaria stdin, entorno del hijo depurado; sin escenarios sintéticos o preparación de colecciones |
| src/server.js y composition/backend.js | Selección explícita de main, bundle verificado obligatorio, JWT propio, listener loopback y cierre ordenado; el arranque previo de pruebas conserva sus bloqueos |
| src/config/jwt.js | Ámbito main separado; claves RS256 suministradas y estables, sin generar claves efímeras en el arranque principal |
| atlas-policy.js y repositorios/engine/routes de sync | Puente de ámbito main explícitamente verificado. Los modos de prueba conservan sus restricciones. Main usa synthetic=false y disposable=false; no se disfraza como almacén de pruebas |
| integration/sqlite/GameSyncHost.cs | Selección normal de API HTTPS por configuración del juego; credenciales técnicas separadas por destino y main/integration; protección ante recibos históricos de otro destino |
| local-persistence/sync-http/SyncWorkerLifecycle.cs.txt | Selector HTTPS main, namespace estable por API y bloqueo de adopción de ACK de otro destino antes de registrar una nueva identidad |
| Pruebas main-profile, main-credential-channel y SyncHttpChecks | Cobertura nueva y regresiones offline; no se modificaron escenas, biomas o partidas reales |
| local-persistence/src/SyntheticSandbox.cs.txt | Corrección de carrera del guard sintético cuando SQLite elimina un journal entre Exists y GetAttributes; no se alteró el adaptador de bases reales |

El ciclo de vida compartido existente no necesitó cambios. Los paquetes instalados se conservaron; no se restauraron ni instalaron dependencias.

## 3. Destino principal y barreras

Host: <cluster>.<id>.mongodb.net. Base: **two_sides_db**. Usuario: **twosides_backend**. authSource: admin. Mecanismo: **SCRAM-SHA-256**. TLS con validación de certificado y hostname, sin callbacks permisivos. El conector rechaza opciones inseguras antes de abrir; se verifica también el cliente efectivo después de conectar.

La configuración integration sigue fijada a twosides_integration_test/two_sides_integration_test. validateAtlasConfig no admite la configuración main como configuración de integración. Los ámbitos no son intercambiables; main requiere un bundle propio tras comprobar la conexión y sus permisos. Las restricciones contra producción permanecen para los perfiles de pruebas. Main puede componerse con NODE_ENV=production, pero solo con ámbito verificado y configuración JWT main válida.

El perfil comprueba una sola identidad autenticada twosides_backend en admin, un único rol readWrite sobre two_sides_db y privilegios sin recursos de otras bases. Exige find/insert/update/listCollections/listIndexes efectivos sobre su base. Si la cuenta actual tiene roles adicionales o privilegios fuera del destino, se detendrá; no se modifican roles para forzar una conexión. readWrite permite más acciones de las que ejecuta este arranque y sigue siendo una decisión operativa de privilegios.

La inspección inicial es de lectura: catálogo, índices y seed. No se llaman createCollection, createIndexes, syncIndexes, migraciones o limpieza. Main no utiliza las colecciones de C.2 ni el fence de integración.

## 4. Contrato de persistencia principal

Se propone un namespace separado **main_v2**, preservando colecciones anteriores de formato desconocido. Las siete colecciones requeridas son:

```text
main_v2_operations
main_v2_facts
main_v2_fences
main_v2_identities
main_v2_ownerGuards
main_v2_identitySessions
main_v2_revocations
```

Índices únicos requeridos: owner_operation_unique, scope_source_unique, identity_registration_unique, identity_binding_unique e identity_token_unique, con las mismas claves de los modelos existentes. Se exige _id y las definiciones exactas, sin índices adicionales incompatibles, sparse, parciales, hidden, TTL o collation distinta de simple. main_v2_fences debe contener ingestion-v1 con revisión entera no negativa. La coordinación de escrituras es por propietario, no por un fence global compartido entre todos los jugadores. El modelo authorization no se usa como alternativa de autorización ni requiere crear su colección.

Los game.report y demás hechos del protocolo conservan los snapshots de partida, decisiones/progreso y eventos soportados por los contratos actuales dentro de facts y sus recibos en operations. No se inventó una transformación a un esquema histórico desconocido de two_sides_db. Tampoco se implementó descarga/restauración MongoDB → SQLite: el flujo preparado es subida Outbox y confirmación de recibos.

El esquema y permisos reales **no se han inspeccionado** en esta fase. Si faltan colecciones, índices o seed, main devuelve main_schema_not_ready y no escucha. Su creación o una migración de datos existentes requiere un plan y autorización posterior; no se ejecutó ni se incorporó un bootstrap automático.

Se conservan los límites del motor reutilizado: 1.000 operaciones por propietario y 50.000 totales por defecto, con límites superiores internos de 10.000/1.000.000. Dimensionado, archivo/retención y configuración de límites antes de explotación prolongada siguen pendientes; no se promete almacenamiento ilimitado ni se borran hechos para recuperar capacidad.

## 5. Configuración y suministro de secretos

La configuración normal de proceso queda definida así, sin valores secretos:

| Nombre | Valor/contrato |
|---|---|
| TWOSIDES_PROFILE | main |
| MAIN_ENABLE | true, habilitación explícita; sin ella se rechaza |
| NODE_ENV | production para operación normal |
| PORT | 1–65535, predeterminado 3000; escucha solo 127.0.0.1 |
| MAIN_JWT_PRIVATE_KEY_FILE | Ruta absoluta a clave privada RSA PKCS#8 persistente fuera de todo el proyecto y OneDrive; archivo normal y sin enlaces |
| MAIN_JWT_KEY_ID | Identificador público estable de 1–64 caracteres |

La contraseña no tiene variable de entorno ni argumento. El lanzador main la solicita oculta solamente cuando se habilite expresamente en una fase posterior, conserva sus caracteres, codifica UTF-8 estricto y envía una sola trama de longitud + bytes por stdin anónimo. No utiliza el lanzador sintético ni copia secretos de integración. La API startMainBackend permite sustituir esa fuente por un proveedor de secretos de servicio, suministrado explícitamente. No hay recuperación automática de .env, Compass o una credencial anterior.

La clave privada de firma se suministra por el operador; no se generó ninguna en esta fase. Se deriva su clave pública y se validan RS256, tipo de clave y tamaño mínimo de 2.048 bits. El proveedor de firma se valida antes de consumir la credencial de base. Mantener la misma clave/KeyId entre reinicios evita invalidar JWT por un arranque ordinario. Ámbito principal: issuer urn:two-sides:main y audience two-sides-main-api, separado de los ámbitos de prueba.

No se imprimen URI con secretos, errores originales del driver o contenido de claves. Los errores del arranque son genéricos. Se limpian buffers controlados, sin prometer eliminación completa de copias de contraseñas o claves en memoria. Permisos del archivo de firma, cuenta de servicio, rotación de claves y protección del entorno deben resolverse operativamente, sin alterar ACL automáticamente.

La variable histórica MONGODB_URI de .env no forma parte del contrato nuevo. **No se abrió ni se modificó backend/.env, ni se recalculó su hash.** La credencial compartida en el contexto del chat debe rotarse antes de la primera conexión principal; no se copió a código, pruebas o este informe.

## 6. Funcionamiento normal de Godot preparado

Configurar en una futura versión/despliegue autorizado el ajuste público:

```text
two_sides/sync/main_api_url = https://<API-del-backend>/
```

No es la dirección MongoDB. Se admite solo una raíz HTTPS sin usuario, contraseña, query, fragmento o prefijo de ruta. No se definió un dominio ficticio como destino efectivo ni se modificó project.godot: sin endpoint configurado, main permanece deshabilitado. El modo local de pruebas sigue separado y explícito.

Una vez configurado: guardado en SQLite → captura/reconciliación Outbox → worker HTTP en segundo plano → registro/sesión técnica JWT v2 → batches → recibos verificados. La Outbox conserva pendientes cuando Express no está disponible; el worker reintenta con los mismos IDs y reconcilia respuestas perdidas consultando recibos. Escenas o ticks repetidos no crean workers duplicados. Cierre/logout detienen el worker antes de cerrar SQLite, sin borrar pendientes.

Las credenciales técnicas propias del jugador se protegen con DPAPI CurrentUser bajo user://sync-credentials-main-v2/<namespace-de-la-API>. El namespace deriva únicamente de la URL pública normalizada, no de una contraseña. Otro destino no reutiliza la identidad de integración. El JWT es de memoria y se renueva; cuenta/credencial/registro técnicos pueden persistir entre reinicios para la misma instalación. La protección implementada es Windows; otros sistemas requerirán su proveedor de secretos.

**Cambio de destino e historial confirmado:** la Outbox existente no particiona ACK por servidor. Main no interpreta un recibo de integración como prueba de persistencia principal. Si no existe cuenta protegida para ese destino y hay operaciones confirmed de la misma vinculación, no registra ni crea worker: devuelve SYNC_DESTINATION_MIGRATION_REQUIRED. No reabre/borrar partidas ni resetea recibos. La migración del historial, si se necesita, debe diseñarse sobre una copia sintética y autorizarse aparte. Esta barrera impide presentar una migración incompleta como sincronización satisfactoria.

## 7. Verificaciones realizadas

**JavaScript: 88 pruebas finales aprobadas.**

- main-profile: 9 casos sobre perfil explícito, permisos/esquema/TLS, producción, JWT separado, propiedad, vectores C#, transacciones, recibos, duplicados, rollback, commit incierto, reapertura y cierre.
- main-credential-channel: 2 casos, rechazo antes del prompt y extracción del transporte real a un proceso receptor de prueba, con contraseña ficticia Unicode, sin secretos en argumentos/entorno/salida. No ejecuta el servidor principal real.
- backend-composition e integration-profile: 27 regresiones aprobadas; separación y comportamiento anteriores conservados.
- jwt.test.js: 50 regresiones aprobadas. El primer pase bajo sandbox dejó 49 aprobadas y un fallo al iniciar un proceso hijo (status null); la repetición autorizada fuera del sandbox aprobó las 50, sin debilitar la prueba.

**C#: 36 comprobaciones finales aprobadas**, utilizando Express offline-test en loopback y SQLite desechables. Incluyen HTTP v2, formatos, captura/recibos, servidor apagado y reconexión, respuesta perdida, reintentos con IDs estables, identidad DPAPI tras reinicio, corrupción de credenciales, logout/login, guardado local durante fallos, nueva selección HTTPS y bloqueo de recibos de otro destino. No es una validación remota MongoDB. Algunas comprobaciones preexistentes calculan huellas de lectura del runtime/protecciones para confirmar ausencia de cambios; las escrituras se limitan a fixtures sintéticos.

Una ejecución intermedia C# pasó la nueva barrera main, pero terminó por FileNotFoundException de un -journal sintético eliminado concurrentemente. Se corrigió únicamente SyntheticSandbox.ValidateOwnedPath: captura la desaparición genuina entre Exists y GetAttributes, sin aceptar un archivo/directorio existente ni enlaces. La batería completa se repitió y pasó. El adaptador OwnedCopyDatabase de las partidas reales no se cambió.

Comandos principales: Vitest con env-guard/envDir=false y selección de los cuatro archivos de perfiles/canal; regresión JWT independiente; dotnet build de SyncHttp.Checks.csproj y TwoSides.csproj con --no-restore; ejecución de SyncHttp.Checks.exe. Sintaxis JS y PowerShell comprobada. No se ejecutaron A36, private-workspace.ps1, C.2 o F.2.

Godot C# compiló con **0 errores y 63 advertencias históricas**, sin ejecutar el motor. Se observaron además cinco CS2002 por referencias duplicadas ya presentes en el proyecto de pruebas C#; no se añadieron duplicados ni se modificó ese csproj para ocultarlos. La última compilación incremental del ejecutable de pruebas terminó con 0 errores/advertencias.

Después del último ajuste de la exclusión de claves a todo el árbol del proyecto (no solo backend), MP07 y MC01/MC02 volvieron a pasar: tres casos seleccionados, sin ampliar ni sumar los totales. No se suman repeticiones de pruebas a los totales finales. No se instalaron paquetes ni se abrió una conexión Atlas. Todo conector del destino principal utilizado en pruebas fue un doble.

## 8. Bloqueos y procedimiento de primera conexión propuesto

Pendientes antes de operación real: rotación de la credencial expuesta; cuenta de servicio y protección de secretos; aceptación/mitigación de B00; clave JWT persistente; permisos reales del usuario principal; inventario y plan de esquema; dirección HTTPS estable, certificados/reverse proxy y reglas de exposición/rate limiting; dimensionado/retención; y migración explícita si existen ACK de otro destino.

El listener Express es loopback HTTP detrás de una terminación TLS futura. trust proxy permanece desactivado: el diseño del proxy y el tratamiento seguro de IP/rate limiting deben revisarse antes de abrir la API públicamente. No se deshabilitan límites o autorización para desplegar. No se declara producción lista para exposición pública.

Primera conexión futura, **solo tras autorización independiente**:

1. Presentar el código/artefacto principal concreto, destino fijo y canal de secreto; acreditar su integridad y evaluar el entorno B00. No reutilizar ni consumir autorizaciones o releases C.2.
2. Un proceso acotado de autenticación/lectura, sin HTTP listener, llamaría al conector/openMainProfile y cerraría inmediatamente. Verificar usuario efectivo, SCRAM, TLS, permisos, replica set y metadatos del namespace main_v2. No invocar registros, sesiones de jugadores, ingesta, preparación o limpieza.
3. Si falta esquema, aparece un conflicto o falla autenticación, cerrar y entregar diagnóstico sanitizado. No crear índices/colecciones, cambiar credenciales o repetir automáticamente. Elaborar después un inventario/propuesta de bootstrap o migración para autorización propia.
4. Solo después de la lectura y preparación de esquema autorizadas, configurar la API HTTPS, clave persistente y secreto principal. Probar primero con jugadores y bases locales sintéticos; no adoptar partidas reales durante esa validación. Activar el servicio normal y el ajuste Godot en una decisión posterior de despliegue.

El lanzador main está preparado, pero **no se ejecutó con EnableMain ni una contraseña real**. No se entrega en este informe un comando que inicie ahora la conexión. La contraseña principal nunca debe llegar a Godot; el juego solo conserva su propia credencial técnica y utiliza JWT v2 sobre HTTPS.

## 9. Detención

Preparación terminada. No se conectó two_sides_db ni ninguna otra base Atlas, ni se crearon/modificaron/eliminaron documentos reales. Sin lectura de .env, cambios de ACL/propietarios o C2Runtime, ni modificaciones a partidas existentes. Se ejecutaron únicamente servidores/dobles offline y pruebas con datos sintéticos.

**Perfil main preparado; sincronización real aún no activada. B00 pendiente. Detenido antes de cualquier conexión o escritura principal.**
