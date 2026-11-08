> **Estado vigente B05.4C.2C:** modo Atlas explícito implementado y probado exclusivamente con dobles, 271 pruebas backend aprobadas. Sin conexión Atlas real; identidad durable/B00 pendientes. El [informe del modo](B05_ATLAS_INTEGRATION_MODE.md) actualiza las propuestas e implementaciones históricas siguientes; D no iniciada.
# B05.4C.2B — Preflight seguro de integración Atlas

2026-10-28, America/Guatemala. **PREPARACIÓN DOCUMENTAL COMPLETADA. SIN CONEXIÓN REMOTA NI VALIDACIÓN MONGOOSE/ATLAS.**

El usuario informa que MongoDB Compass pudo conectarse al clúster de pruebas. Esa evidencia pertenece a Compass: no demuestra compatibilidad del adaptador, permisos efectivos del arnés, transacciones, aislamiento, recibos o revocaciones. No se consultaron Compass, sus contraseñas o sus conexiones guardadas. B00 continúa pendiente.

## 1. Destino autorizado para identificar la propuesta

| Dato no secreto | Valor fijo |
|---|---|
| Clúster declarado | TwoSidesCluster |
| Semilla SRV | <cluster>.<id>.mongodb.net |
| Usuario de base de datos | twosides_integration_test |
| Única base de datos de aplicación | two_sides_integration_test |
| Tier analizado | Atlas Free/M0; características efectivas del clúster todavía no comprobadas |

Esta fase autoriza identificar y documentar el destino, **no conectarse**. La contraseña no fue recibida, buscada ni almacenada. No utilizar administrador, twosides_backend, credenciales del videojuego o material de backend/.env. No crear usuarios, cambiar roles o modificar Network Access en esta fase.

## 2. Revisión del código actual: incompatibilidades explícitas

Revisados `src/modules/sync/{mongo-ingestion-repository,mongo-models,mongo-authorization-fence,ingestion-engine,ingestion-service,budget}.js`, configuración JWT, pruebas Mongoose/ingestión y sus fixtures, repositorio sintético de identidad y soporte de custodia privada. Mongoose 9.11.2 y driver MongoDB 7.7.0 ya están instalados; no se instalaron paquetes adicionales.

| Protección/implementación C.1 | Consecuencia para Atlas y cambio futuro propuesto |
|---|---|
| Nombre obligatorio `twosides_sync_test_<32 hex>` | Rechaza la base autorizada. Un modo Atlas independiente deberá exigir igualdad exacta con `two_sides_integration_test`, sin ampliar genéricamente la expresión local. |
| directConnection=true y hosts loopback | Incompatible con el destino SRV. Mantener intacto el modo local y añadir una política Atlas explícita, con semilla exacta y descubrimiento de replica set. |
| Rechaza srvHost y credentials | Rechaza deliberadamente Atlas autenticado. No eliminar estas restricciones globalmente ni convertir synthetic=true en autorización de red. |
| Conexión ya abierta al construir el adaptador | La validación del constructor llega tarde para impedir una conexión equivocada. El futuro factory debe validar host/base/usuario/opciones **antes** de abrir sockets. |
| Colecciones fijas sync_operations, sync_facts, sync_fences, sync_authorization | Podrían mezclar datos previos de esa base. Añadir un mapa de colecciones exclusivo por ejecución; no usar las colecciones fijas en Atlas. |
| `connection.models.SyncOperation` y demás nombres se reutilizan | El factory debe ligar modelos al runId/colecciones esperados y verificar su namespace. No reutilizar modelos de otro ensayo en una conexión compartida. |
| prepareIngestionIndexes crea colecciones/índices y un fence | Es una operación de escritura. Solo podrá invocarse tras autorización de escritura y validación de namespaces nuevos del ensayo; nunca durante una conexión meramente de lectura. |
| Lectura de todos los registros y upserts de todos los hechos/operaciones | Aunque acotado, provoca amplificación y múltiples viajes secuenciales por operación. No ejecutar contra colecciones con datos existentes. |
| Identidad persistente solo en memoria/archivo | No hay coordinación durable real con revocaciones Mongo; ver sección 7. |

**El código actual no está listo para Atlas por configuración solamente.** No se implementó ninguno de estos cambios en B05.4C.2B. Los cuatro contratos Outbox, canonicalEnvelope/hash, IDs, nulls, recibos, JWT RS256 v2 y rutas HTTP deben permanecer intactos en cualquier ampliación autorizada.

## 3. Configuración de conexión propuesta, todavía no ejecutable con el adaptador actual

URI sin usuario ni contraseña:

```text
mongodb+srv://<cluster>.<id>.mongodb.net/two_sides_integration_test
```

Opciones conceptuales para una conexión Mongoose **propia del arnés**, nunca la conexión global del backend:

```javascript
const proposedOptions = {
  dbName: 'two_sides_integration_test',
  user: 'twosides_integration_test',
  pass: secretoTemporalEnMemoria, // recibido por canal privado; no literal ni variable de entorno
  authSource: 'admin',
  authMechanism: 'SCRAM-SHA-256',
  tls: true,
  tlsAllowInvalidCertificates: false,
  tlsAllowInvalidHostnames: false,
  directConnection: false,
  readPreference: 'primary',
  retryWrites: true,
  w: 'majority',
  maxPoolSize: 2,
  minPoolSize: 0,
  maxConnecting: 1,
  maxIdleTimeMS: 10000,
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  waitQueueTimeoutMS: 2000,
  autoIndex: false,
  autoCreate: false,
  bufferCommands: false,
  monitorCommands: false,
  appName: 'TwoSides-B054C2B'
};
```

Son valores propuestos de ensayo, no configuración instalada ni tiempos validados. Las opciones se contrastaron con los tipos locales de Mongoose/driver. No ejecutar createConnection/connect en este preflight. Contraseña separada evita construir una URI con secretos o problemas de percent-encoding. No imprimir el objeto de opciones, cliente, conexión, error original o stack del driver.

Atlas utiliza descubrimiento SRV y TLS; SCRAM en Atlas autentica contra admin. `authSource:'admin'` **no** concede rol administrador ni autoriza CRUD en admin. Las excepciones permitidas serían únicamente autenticación y metadatos de topología/sesiones necesarios para el driver/hello, sin leer colecciones administrativas. No fijar a mano un miembro del clúster ni adivinar setName: verificarlo en la primera conexión autorizada. Fuentes: [formato de conexión](https://www.mongodb.com/docs/manual/reference/connection-string-formats/), [autenticación y usuarios Atlas](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/).

El driver resuelve los miembros a partir de la semilla SRV. La política debe fijar exactamente la semilla autorizada, conservar validación DNS del driver y certificados TLS; no sustituirla por aceptar cualquier hostname terminado en mongodb.net, ni permitir proxies, resolvers personalizados, otras URIs o fallback local/remoto. No se realizó resolución DNS dirigida al clúster en esta fase.

Un pool pequeño reduce carga; no significa dos sockets totales, pues existen sockets de monitorización y pools por servidor. Limitar además a un orquestador y como máximo dos clientes/procesos sintéticos en la prueba de concurrencia. [Pools del driver](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/).

## 4. Confinamiento a la base autorizada

**Resultado de la revisión: la configuración actual no implementa todavía una guarda Atlas para esta base.** URI y dbName establecen una base predeterminada; por sí solos no impiden invocar client.db con otro nombre. Para una conexión futura se necesitan tres capas:

1. **Factory con política cerrada.** Constantes exactas de esquema mongodb+srv, semilla, usuario, base y TLS. Rechazar antes de conexión cualquier sustitución, base ausente/distinta, opción duplicada/ambigua o credencial de otro usuario. No aceptar una URI arbitraria copiada de Compass ni cargar .env. Tras conectar, comprobar connection.name y el Db real, además de modelos/colecciones.
2. **Puerto restringido.** Exponer al servicio solo repositorio/modelos ligados al Db aprobado y al runId. No entregar MongoClient/Db arbitrarios a payloads o controladores. Prohibir useDb, conexiones globales, cross-db bulkWrite, aggregate $out/$merge, rename, dropDatabase y modelos fuera del mapa aprobado. El helper de preparación y la limpieza deben compartir la misma política.
3. **Permisos del servidor.** El operador debe confirmar en Atlas que twosides_integration_test tiene solo `readWrite` sobre two_sides_integration_test, sin roles heredados/globales o administrativos, y acceso restringido a TwoSidesCluster. Un rol custom más estrecho es posible si sus privilegios de colecciones/índices se acuerdan expresamente; no se requiere dbAdmin o readWriteAnyDatabase para suplir un error del ensayo. readWrite incluye facultades destructivas dentro de su base, por lo que no sustituye la guarda de colecciones del arnés. [Roles y alcance](https://www.mongodb.com/docs/manual/reference/built-in-roles/), [restricción de clúster](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/).

No se verificaron remotamente roles ni Network Access. Deben confirmarse antes de autorizar la conexión: IP de salida específica del equipo, sin recomendar 0.0.0.0/0; acceso TLS y reglas de red necesarias para SRV/miembros Atlas. No cambiar firewall, roles o listas de acceso automáticamente. Las pruebas negativas de otras bases se harán **sin red**, validando rechazo de la política; no intentar leer o escribir otra base para probar un permiso no autorizado.

## 5. Recepción temporal de credenciales fuera de OneDrive

**Preferencia: ninguna contraseña en disco.** En una fase futura autorizada, el usuario la introducirá directamente en una consola local propia con entrada oculta (p. ej. Read-Host -AsSecureString), sin pegarla en el chat, comandos del agente o código. Un lanzador revisado la transferirá al proceso de prueba mediante stdin anónimo o IPC privado, sin argv, URL, variables de entorno, archivos temporales o historial. Solo ese proceso/orquestador la conservará en memoria durante el ensayo; tras reiniciar un hijo, se transmitirá de nuevo por IPC, sin recrear identidades.

No se solicita la contraseña ahora. No se abrió consola de captura ni se implementó un lanzador. Las funciones existentes de tests no son un mecanismo ya aprobado de recepción de credenciales Atlas; requieren revisión/adaptación explícita y mensajes de error sanitizados. La conversión de SecureString para un cliente Node implica texto claro temporal en RAM: liberar BSTR/buffers cuando sea posible y terminar procesos al cerrar; no prometer borrado perfecto de strings del GC ni protección frente a malware del mismo usuario o administrador.

Ubicación propuesta únicamente para manifiesto no secreto y, si hiciera falta, custodia alternativa:

```text
%LOCALAPPDATA%/TwoSides/AtlasIntegrationTests/b054c2b-<runId>/
```

Fuera del repositorio y OneDrive, con propietario y ACL revisados en lectura, sin enlaces/reparse points o acceso adicional no justificado. No se creó ni inspeccionó esa ruta en esta fase. Si sus permisos no son privados, detenerse; no cambiar ACL automáticamente. Su creación/acceso requiere alcance explícito en una autorización posterior.

Si se necesitara sobrevivir al cierre del orquestador, alternativa sujeta a aprobación: blob DPAPI CurrentUser cifrado, con caducidad operativa, en ese directorio privado, no un archivo de contraseña plana. No guardar una clave de descifrado junto al blob, no DPAPI LocalMachine, no copia a OneDrive, no exportación automática. Preferir entrada temporal en RAM cuando baste para reinicios Node. No instalar software adicional.

El usuario de integración debe estar limitado temporalmente o revocarse/rotarse por el operador al terminar según lo que se apruebe; esta fase no cambia su contraseña, caducidad o roles. Nunca buscar el secreto en Compass, Respaldo_ENV, otros proyectos, historial, gestores de contraseñas o variables existentes.

## 6. Transacciones y Free/M0

Según la [documentación actual de Free](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/), el tier usa MongoDB 8.0 y tres nodos; no admite clúster sharded, pruebas de failover primario ni simulación de caída regional. Límites publicados: 0,5 GB incluyendo índices, 500 conexiones, 100 operaciones/s, 10 GB de entrada y salida por siete días, 100 bases/500 colecciones; base hasta 38 bytes y namespace hasta 95 bytes. Hay throttling y restricciones de comandos. No se comprobaron esos valores contra TwoSidesCluster.

La base autorizada tiene 26 caracteres ASCII. El nombre local exigido por C.1 tiene 51: además de no estar autorizado, supera el límite Free documentado. El aislamiento Atlas se hará por colecciones del runId, nunca creando otra base temporal.

El adaptador necesita una transacción multidocumento: operación/recibo embebido, hecho y controles deben confirmar juntos. Usa snapshot, primary, majority/j:true, maxCommitTimeMS 1000 y timeoutMS 10000, con operaciones secuenciales en una sesión. Es razonable preparar la prueba sobre el replica set Free; la compatibilidad efectiva se demostrará solo con commit y abort reales. No quitar j:true o degradar a escrituras independientes para hacer pasar el ensayo. [Transacciones del driver](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/), [comandos Atlas](https://www.mongodb.com/docs/atlas/unsupported-commands/).

Riesgo específico del código: el servicio permite como máximo 2 s por operación y 10 s por lote; las escrituras de todo el estado son secuenciales, aproximadamente dos upserts por registro ya acumulado, además de lecturas/fences. En WAN/M0 eso puede agotar presupuestos o disparar cuotas incluso con pocas solicitudes HTTP. No se midió latencia y no se garantiza que la batería completa quepa. Proponer por separado escribir solo el delta nuevo de operación/hecho, conservando índices/transacción y validación de relaciones; no modificarlo aquí ni ampliar presupuestos ocultamente.

Ensayo futuro progresivo: una operación, su retry y luego dependencias mínimas de los cuatro tipos; contabilizar llamadas de base sin registrar comandos/payloads. Tope propuesto de 200 operaciones nuevas/2 MiB de estado por ejecución, dos clientes como máximo y ritmo deliberadamente bajo. Detener ante throttling, error de cuota, timeout repetido o carga no prevista; no tratarlo como prueba de estrés. El límite de almacenamiento del tier no demuestra que haya capacidad libre: deberá confirmarlo el operador sin inspeccionar datos ajenos.

No apagar nodos Atlas, forzar elecciones, usar failCommand, cambiar parámetros o matar sesiones ajenas. Se podrá probar cierre de los procesos/clientes propios, no reinicio del servidor Atlas. Una excepción simulada después del commit prueba pérdida de respuesta, **no** un commit realmente incierto del servidor. Si M0 no permite inducir ese caso con aislamiento seguro, dejarlo pendiente. Majority/journal no certifica recuperación de apagón en este ensayo.

## 7. Identidad, revocaciones y B00

La contraseña Atlas autentica al arnés ante la base; es distinta de la credencial técnica/JWT de los jugadores sintéticos. No insertar aquella en cuentas, operaciones, recibos, manifests o fixtures. Claves RS256/Argon2id y credenciales de jugador se generan sintéticamente y mantienen fuera de progreso real.

La identidad actual sigue en memoria o archivo cifrado. Sus revokeSession, revokeIdentity e invalidateAccountSessions no actualizan sync_authorization Mongo. `mongoAuthorizationFence` escribe un control de sesión dentro de la transacción de ingestión, pero solo eso no conecta de forma atómica dos almacenes distintos. Un control copiado puede quedar obsoleto ante revocación concurrente o reinicio. El mutex del doble no demuestra coordinación entre procesos reales.

Requisito para validar autorización/revocación: repositorio de identidad sintético coherente en la misma base/colecciones del runId, emisión durable de sesiones/controles y mutación de los mismos controles al revocar/cambiar versiones/vínculo, compitiendo con ingestión en transacciones. Revalidar estado después de conflictos y fallar cerrado ante indisponibilidad. No usar un callback que siempre devuelve true, duplicar identidad en un Map permisivo o sembrar controles desde IDs del cliente. Esta implementación requiere autorización posterior y sus pruebas propias.

B00: permanecen los riesgos documentados de ACE heredadas no resueltas con Modify/Synchronize. No se modificaron ACL, propietario o herencia ni se investigaron nuevamente cuentas. Sacar la contraseña de OneDrive reduce persistencia accidental, pero **no** corrige código modificable ni protege memoria si ese código se altera. Antes de introducir el secreto se necesita revisión de huellas/código del arnés y resolver B00 o aceptar expresamente su riesgo residual para un ensayo estrictamente sintético con usuario mínimo; no presentar tal aceptación como corrección de permisos.

## 8. Identificación y limpieza exclusiva de datos sintéticos

Propuesta preferida: GUID aleatorio runId de 32 hex minúsculos y colecciones nuevas del mismo Db:

```text
two_sides_integration_test.b054c2b_<runId>_ops
two_sides_integration_test.b054c2b_<runId>_facts
two_sides_integration_test.b054c2b_<runId>_fence
two_sides_integration_test.b054c2b_<runId>_authorization
```

La más larga tiene namespace de 81 bytes ASCII, inferior al límite documentado. Las colecciones adicionales de identidad/sesiones, si se autorizan, deben enumerarse explícitamente en el manifiesto con ese mismo prefijo y verificar el límite de longitud. No añadir runId al sobre canónico ni alterar hashes/contratos. El factory elegirá estos namespaces de forma cerrada; hoy los modelos siguen con nombres fijos y no implementan esta opción.

Manifiesto local no secreto: runId, host/base/colecciones exactos, origen sintético, IDs de cuentas/operaciones/hechos/controles creados por el arnés, estado de resultados inciertos y cantidades esperadas. No contraseña, JWT, verificador Argon2, clave privada ni payloads de datos existentes. Reservar cada ID previsto antes del intento para poder resolver un ACK perdido, sin atribuir documentos desconocidos al ensayo.

Antes de escribir en una futura fase, comprobar únicamente por nombre que las colecciones candidatas nuevas no existan; si existen, detenerse o generar otro runId y manifiesto. No listar/leer documentos de otras colecciones ni inferir que toda la base es desechable por su nombre. No reutilizar sync_operations, sync_facts u otros namespaces existentes; la rutina de carga actual debe quedar confinada al mapa de ese runId.

Limpieza propuesta, **no autorizada ni ejecutada ahora**:

1. Cerrar productores/clientes del ensayo y resolver operaciones inciertas con IDs/hash del manifiesto. Validar de nuevo host, Db, mapa de colecciones y propiedad del runId.
2. Verificar que cada documento candidato corresponde a un ID/cuenta previamente reservado por ese ensayo; si aparecen registros desconocidos, detener y conservar evidencia no secreta.
3. Eliminar solo documentos por conjuntos acotados de `_id` exactos del manifiesto y en sus colecciones exactas; usar transacción cuando se retire un grupo hecho/operación/recibo/control dependiente. Incluir todos los aliases documentados. No deleteMany({}), filtros solo por fecha o nombre visible, ni búsquedas amplias por prefijo como autorización de borrado.
4. Comprobar cero documentos propios pendientes y ausencia de cambios fuera de esos namespaces. No dropDatabase, dropCollection, dropIndex, syncIndexes, TTL ni borrado de una ejecución anterior. Las colecciones/índices vacíos pueden permanecer; su retirada requeriría alcance adicional expreso.
5. Conservar el manifiesto mínimo de resultado y cerrar el acceso/limpiar la custodia temporal según autorización. No afirmar que terminar procesos elimina automáticamente una credencial persistida o la revoca en Atlas.

La futura autorización de pruebas debe indicar también si incluye esta limpieza exacta; de lo contrario, no asumir permiso para borrar. Ninguna lectura, inserción, creación de índice o eliminación remota se realizó en el presente preflight.

## 9. Pruebas previstas — ninguna ejecutada aquí

| Caso | Evidencia exigida en una fase posterior |
|---|---|
| P01 Política offline | Rechazo antes de red de otro host/base/usuario, TLS inseguro, opciones ambiguas y modo local usado como Atlas |
| P02 Canal secreto | Entrada oculta/RAM o DPAPI aprobado, sin logs/argv/env/archivos planos; mensajes sanitizados incluso si falla autenticación |
| P03 Primera conexión, solo lectura | Semilla/Db/usuario exactos, TLS/topología/sesiones; modelos autoCreate/autoIndex desactivados; rol y aislamiento confirmados sin CRUD fuera de la base |
| P04 Aprovisionamiento autorizado | Solo colecciones nuevas del runId; índices únicos reales de cuenta/operationId y scope/sourceKey, sin tocar índices existentes |
| P05 Inserción y cuatro contratos | Fuentes sintéticas, bytes/hash y roundtrip BSON/lean exactos; nulls/UTC/ms/enteros seguros conservados |
| P06 Idempotencia | Retry idéntico conserva receiptId/fecha/hash; contradicción 409; alias no duplica hecho |
| P07 Atomicidad | Commit y abort reales: operación, recibo y hecho juntos; fallos sin ACK especulativo |
| P08 Recibos | Consulta solo del dueño/hash autorizado; respuesta perdida recupera núcleo original con intento actual |
| P09 Concurrencia | Dos procesos/conexiones independientes, un efecto; identidades separadas e intervalos superpuestos controlados por Mongo, no mutex compartido |
| P10 Dependencias y parcialidad | deferred sin inventar padre, llegada posterior, 207 solo con recibos de commits |
| P11 Revocación | Cuenta/sesión activa, inexistente, revocada y vínculo ajeno; ambos órdenes de carrera y control compartido de identidad/ingestión |
| P12 Reinicio propio | Cerrar/reabrir conexión y reiniciar Node conservando claves/sesiones/recibos y revocaciones; no reiniciar Atlas |
| P13 Errores y cuotas | Error previo, timeout, pérdida de respuesta y retry estable; diferenciar simulación de commit incierto real; sin tormenta de reintentos |
| P14 Limpieza | Solo IDs/colecciones del manifiesto autorizado; conservar todo dato previo |
| P15 Regresiones offline | Reejecutar suites existentes después de los cambios autorizados, separando dobles, persistencia de archivo e integración Atlas real |

Las 235 pruebas de C.1 y 63 vectores son antecedentes, no reejecuciones en B05.4C.2B. No tests, Node, .NET, Godot, servidores o solicitudes al clúster durante esta fase. Solo lectura de código/contratos y consulta de documentación pública oficial; consultar documentación no prueba acceso al clúster.

## 10. Condiciones para una autorización posterior

- Confirmar por el operador el tier real, estado del clúster, alcance mínimo de roles, acceso limitado a TwoSidesCluster y disponibilidad de la base autorizada, sin consultar secretos de Compass.
- Autorizar los cambios concretos del modo Atlas, factory previo a red, mapa de colecciones/runId y canal privado de credenciales. Mantener las guardas locales y tests que rechazan Atlas en modo local.
- Aprobar por separado la corrección de identidad/revocaciones y el riesgo B00; sin ello, no certificar la integración completa aunque inserción/recibos aislados funcionen.
- Verificar sin red las políticas negativas, sanitización y ausencia de carga de .env antes de solicitar el secreto al usuario.
- Autorizar primero la conexión de lectura y metadatos de autenticación/topología. Solo después, con comprobaciones satisfactorias y alcance expreso, crear colecciones/índices y ejecutar pruebas sintéticas dentro del Db/runId aprobado.
- Enumerar límites de carga, duración, actores/procesos propios y limpieza de IDs exactos; detener ante datos desconocidos, incongruencia de namespace, permisos excesivos o error inesperado. No fallback a administrador/twosides_backend ni cambio automático de configuración del clúster.

**No existe autorización de conexión/escritura en este documento.** Su contenido es una propuesta revisable; recibir otra vez credenciales o una captura Compass no sustituye la autorización de pruebas y limpieza.

## 11. Cierre de esta fase

Entregable único: `backend/docs/B05_ATLAS_INTEGRATION_PREFLIGHT.md`. No se modifican otros documentos, código, paquetes, Godot, bases SQLite, progreso o ACL. `.env` no se consultó, abrió ni hasheó; no se recalculó integridad de bases porque no se accedió a ellas. No afirmar nuevas verificaciones criptográficas de datos protegidos en una preparación documental.

**B05.4C.2B: INFORME PREPARADO. Integración Mongoose/Atlas NO VALIDADA. B00 pendiente. B05.5 no iniciada. Detenerse y esperar instrucciones.**

## B05.4C.2C — Modo Atlas explícito, sin conexión remota

2026-10-28. **COMPLETADA EN CÓDIGO Y DOBLES; NO VALIDADA CONTRA ATLAS.** Factory sin conector por defecto y sin selección por variables de entorno. Host/usuario/base exactos, TLS estricto, permiso inspeccionado mediante connectionStatus de solo lectura y scope interno por runId; rama local conserva loopback/base temporal/sin credenciales. Creación del repositorio requiere allowWrites explícito y modelos de colecciones exclusivas; autoCreate/autoIndex desactivados. Arranque, endpoints, cuatro sobres y JWT existentes sin cambios.

Canal de credenciales opaco de un uso/RAM y lanzador manual de una futura D: exige autorización, ruta privada y receptor con hash revisado antes del prompt. Solo probado con buffers ficticios; no secreto real recibido ni conexión Atlas. Identidad/revocaciones siguen en memoria/archivo y no se declara coordinación durable resuelta. B00 pendiente.

**271 pruebas backend aprobadas: 36 nuevas + 235 regresiones; cero fallidas finales.** Los 63 vectores C#/Node y gate de identidad pasaron; no se suman como tests nuevos. 48 JS sin errores de sintaxis; parser PowerShell sin errores y arranque sin autorización denegado antes de pedir credencial. No .NET/Godot ejecutados, instalaciones, datos reales o ACL modificados. Las tres bases se comparan por integridad/metadatos; .env excluido de lectura/hash.

[Configuración, archivos, pruebas, límites y propuesta D](B05_ATLAS_INTEGRATION_MODE.md). D requiere autorización de conexión real inicialmente de lectura, credenciales temporales, ruta/receptor revisados y tratamiento explícito de B00/identidad durable. Ninguna escritura/limpieza remota autorizada por C.2C. B05.4C.2D y B05.5 no iniciadas; trabajo detenido.