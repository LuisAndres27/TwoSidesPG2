# B05.4C.2 — Preflight MongoDB local

2026-10-28, America/Guatemala. **Estado B: INFRAESTRUCTURA PENDIENTE.**

La inspección terminó sin encontrar una instancia MongoDB local previamente autorizada, identificada y desechable. Se aplica la puerta de la sección 6: solo inspección y preparación documental; no iniciar servidores, activar Docker, descargar software ni simular integración real. Esta ausencia no demuestra un defecto del adaptador. B05.4C.1 permanece implementada y probada con dobles; MongoDB real sigue sin verificar. B00 pendiente.

## Inventario de infraestructura

| Comprobación de lectura | Resultado observado |
|---|---|
| `Get-Command mongod,mongosh` | Ninguno disponible en PATH |
| MongoDB en Program Files, Program Files (x86), LocalAppData/Programs/MongoDB y Programs/mongosh | Directorios de instalación candidatos ausentes |
| Chocolatey lib/mongodb y lib/mongodb.install; Scoop apps/mongodb | Directorios candidatos ausentes |
| WinGet Packages, subdirectorios cuyo nombre contiene Mongo | No ejecutables mongod/mongosh/mongo encontrados |
| Carpeta instalada de Compass; backend/.work y local-persistence/.work | Búsqueda de nombres de ejecutables sin resultados mongod/mongosh/mongo; no se inspeccionaron preferencias ni conexiones guardadas de Compass |
| Registro de aplicaciones HKLM/HKCU, incluidas entradas de 32 bits | MongoDB Compass 1.53.0 y Docker Desktop 4.95.0; sin entrada MongoDB Server observada |
| Servicios Windows por nombre/displayName Mongo o Docker | Consulta completada: ninguno encontrado; no se inició, detuvo o reconfiguró servicio alguno |
| Procesos mongod/mongosh/Docker Desktop/com.docker.backend | Ninguno observado |
| Docker CLI | Existe en `C:\Users\luis2\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe` |
| `docker info --format '{{json .ServerVersion}}'` | Sin versión de servidor; falta el pipe dockerDesktopLinuxEngine, motor no disponible; no se activó Docker |
| Listeners TCP en 27184, 27017 y 27018 | Ninguno observado; 27184 propuesto, no reservado |
| Disco C: | 115433439232 bytes libres en la consulta, aproximadamente 107,5 GiB; suficiente para la reserva propuesta de ensayo |
| Replica set/servidor de pruebas autorizado | Ninguno identificado; no se enviaron comandos Mongo, ni siquiera a puertos libres |
| Node/Mongoose/Vitest | Código y paquetes del ensayo C.1 presentes; no sustituyen al servidor MongoDB |

La búsqueda fue acotada a PATH, registros de instalación y ubicaciones razonables de software/artefactos. No recorrió todo el disco, perfiles ajenos, preferencias de Compass, bases personales o el proyecto original. No descarta un binario portátil en una ruta no declarada. Compass instalado no acredita disponer de mongod ni de una instancia autorizada.

Las primeras consultas CIM y Get-NetTCPConnection fueron inaccesibles desde el sandbox. Se repitieron únicamente en lectura con permiso para inventariar servicios, listeners y disco; completaron correctamente. Get-PSDrive no aportó capacidad utilizable dentro del sandbox y se sustituyó por Win32_LogicalDisk. No se cambiaron ACL para obtener estos datos.

## Resultado de la puerta

No hay destino que permita confirmar propiedad, almacenamiento exclusivo, datos exclusivamente sintéticos, topología y aislamiento. No se reutiliza MongoDB Compass, una conexión guardada o una base desconocida como alternativa. Tener un puerto libre no significa tener un servidor. Poder expresar bindIp en una configuración no demuestra que el proceso pueda iniciarse: no se hizo una prueba de escucha porque la puerta obliga a detenerse antes de servidores.

**Integraciones MongoDB reales ejecutadas: 0. Nuevas pruebas unitarias ejecutadas: 0. Pruebas del adaptador sintético ejecutadas: 0.** No se ejecutó npm test, Node, Godot ni .NET en C.2; no corresponde abrir listeners o fixtures cuando la rama autorizada es solo inspección. Las 235 pruebas de C.1 (44 nuevas con dobles, 191 regresiones) y sus 63 vectores compatibles son resultados históricos, no reejecuciones ni pruebas reales de MongoDB.

## Inspección del adaptador y límites pendientes

Fuentes contrastadas: mongo-ingestion-repository.js, mongo-models.js, mongo-authorization-fence.js, ingestion-engine.js, ingestion-service.js, schemas.js, relaciones y rutas sync, middleware sync-auth-context y JWT, repositorios de identidad y sus métodos de revocación, mongo.test.js y mongo-double.js. Documentación de referencia: los diez documentos obligatorios, con su estado C.1 vigente y contratos anteriores de identidad/claves. No se cambió código ni contrato.

| Garantía | Código actual | Evidencia que falta |
|---|---|---|
| Unicidad de operación | Índice cuenta/operationId y `_id`; validación previa | Crear e inspeccionar índices en servidor y provocar duplicate-key con dos clientes reales |
| Unicidad de hecho | Índice scope/sourceKey, alias compatibles sin nuevo hecho | Restricción efectiva bajo carrera real y separación de cuentas |
| Recibo | Embebido en operación; publicación después de withTransaction | Relectura con conexión nueva y procesos reiniciados, mismo receiptId/fecha/hash |
| Atomicidad | Hechos, operaciones y controles comparten sesión Mongo | Commit/abort real sin hecho huérfano, operación sin recibo o recibo positivo especulativo |
| Confirmación | Snapshot, primary, writeConcern majority/journal; maxCommitTimeMS 1000, timeoutMS 10000 | Soporte efectivo, errores y durabilidad de la topología escogida; no prueba de apagón |
| Concurrencia | Incremento de fence Mongo global, más índices únicos | Dos procesos independientes, conflictos/retries y rangos superpuestos, sin depender del mutex del doble |
| Canonicalización | Reutiliza contratos/validación C#-Node y reconstruye hash al cargar | Roundtrip BSON/lean real conservando bytes reconstruidos, nulls y enteros seguros |
| Dependencias | deferred sin crear padres; scoped al propietario | Llegada posterior y consultas efectivas en Mongo |
| Commit incierto | Error temporal sin ACK y retry de IDs estables | Inyección real controlada; no confundir excepción del doble con incertidumbre del servidor |
| Reinicios | Adaptador admite conexión inyectada, sin conexión implícita | Reinicio Node y reinicio mongod separados; no afirmar que M10 del doble es un reinicio real |

El prototipo serializa toda la ingestión y carga un conjunto acotado (por defecto 1000 operaciones, 2 MiB). Puede generar contención y amplificación de escrituras. No demuestra capacidad productiva, alta disponibilidad, cuotas distribuidas o entrega HTTP exactamente una vez. No se encontró evidencia nueva de un fallo real de MongoDB porque no se conectó ninguno.

## Identidad, revocación y propuesta de corrección

Hallazgo estático confirmado: `SyntheticIdentityRepository` guarda cuentas/sesiones/revocaciones en memoria o archivo cifrado. revokeSession, revokeIdentity e invalidateAccountSessions **no escriben** los documentos sync_authorization de MongoDB. El coordinador B ordena operaciones que lo comparten, pero no equivale por sí solo a una transacción distribuida con identidad Mongo.

El adaptador exige callback de autorización y `mongoAuthorizationFence` incrementa condicionalmente el control de la sesión dentro de la transacción, comparando cuenta/vínculo/cv/authzVersion/active/expiry. Sin control válido rechaza. Los tests C.1 crean controles en un doble; no implementan un repositorio de identidad Mongo ni su ciclo completo.

**Ventana que debe cerrarse antes de certificar integración:** si otro proceso revoca identidad en un almacén separado después de validar el contexto, pero el control Mongo permanece activo, la escritura de ingestión podría competir solamente con un control obsoleto. Copiar cuentas/controles una vez o usar un JWT firmado no establece un orden común con esa revocación. Es una limitación de la futura composición entre repositorios, no un incidente observado ni una prueba de explotación del juego.

Propuesta NO implementada en C.2:

1. Diseñar un adaptador de identidad sintético Mongo por el puerto existente: cuentas, binding, versiones y sesiones persistentes, sin cambiar los contratos HTTP o credenciales productivas.
2. Emitir controles únicamente desde identidad/sesión verificadas del servidor. Alta de sesión y control deben tener consistencia transaccional.
3. Hacer que revocación de sesión/cuenta, rotación de cv/authzVersion o cambio de binding actualicen los controles afectados dentro de transacciones sobre la misma base y documentos que utiliza la ingestión. No mantener una segunda autoridad permisiva en archivos.
4. La ingestión y la revocación deben competir sobre una escritura real común, releer estado tras conflictos y fallar cerradas si la identidad/almacén cae. Probar también expiración y todas las sesiones de la cuenta.
5. Demostrar ambos órdenes de la carrera desde procesos distintos y persistencia de la revocación tras reinicio. No certificar por un bloqueo de JavaScript compartido.

Esta corrección requiere alcance y aprobación propios; la falta de infraestructura obliga a dejarla como propuesta, sin editar identidad/JWT o rellenar controles en un servidor personal. Mantener también pendientes custodia de claves y sesiones para probar reinicios sin sustituir identidades.

## Configuración desechable propuesta — NO ejecutada

Opción preferida: proceso mongod propio, sin servicio Windows ni Docker. Primero debe estar disponible un binario oficial confiable, con versión/parche y procedencia aprobados, firma/hash comprobados y compatible con driver MongoDB 7.7.0/Mongoose 9.11.2. No se seleccionó ni descargó un artefacto automáticamente. mongosh puede suministrarse junto al entorno aprobado o utilizarse el driver ya instalado para inicialización explícita.

Parámetros propuestos para una ejecución nueva:

| Parámetro | Valor/condición |
|---|---|
| runId | GUID nuevo, sin guiones, 32 hex minúsculos |
| Replica set | `twosides_c2_<runId>` |
| Base | `twosides_sync_test_<runId>`; debe cumplir exactamente la guarda C.1 |
| Dirección/puerto | bind exclusivo `127.0.0.1:27184`; repetir comprobación justo antes de arrancar |
| Miembros | Un miembro localhost para transacciones/reinicio básico; no acredita replicación redundante, failover o tolerancia a pérdida del disco |
| Datos/config/log | Directorio nuevo y exclusivo por runId, sin enlaces y sin reutilizar bases existentes |
| Ubicación propuesta | `%LOCALAPPDATA%/TwoSides/MongoIntegrationTests/c2-<runId>` fuera de OneDrive; requiere autorización explícita de esa ubicación antes de crearla, dado el alcance actual limitado a la copia |
| Reserva de ensayo | 5 GiB libres como margen operativo propuesto, no mínimo oficial de MongoDB |
| Conexión | Única semilla 127.0.0.1:27184, directConnection=true, replicaSet exacto; sin SRV, credenciales reales, fallback o lectura de .env |

No se creó esa carpeta, configuración, base o proceso. Si se propone otra ruta o Docker, repetir autorización/aislamiento: no activar Docker ni hacer pull automáticamente. Una publicación Docker debe restringirse a loopback y almacenamiento nuevo; no usar el volumen de otro proyecto.

Ejemplo conceptual de configuración, sustituir `<runId>` y `<directorio-aprobado>` **solo tras aprobación**:

```yaml
storage:
  dbPath: '<directorio-aprobado>/data'
systemLog:
  destination: file
  path: '<directorio-aprobado>/mongod.log'
net:
  bindIp: 127.0.0.1
  port: 27184
replication:
  replSetName: twosides_c2_<runId>
```

La [guía oficial de replica sets de prueba](https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set-for-testing/) documenta la configuración/arranque e inicialización. Se conservaría `localhost:27184` como nombre del miembro, con escucha IPv4 de loopback verificada, y cliente directo a 127.0.0.1. Esta propuesta de un miembro reduce infraestructura, pero no permite afirmar redundancia. El [comando de inicialización](https://www.mongodb.com/docs/manual/reference/method/rs.initiate/) se aplicaría una sola vez a la instancia nueva, nunca a servicios existentes.

Secuencia preparada, **no comandos ejecutados**:

1. Verificar binario, versión/firma/hash, ruta nueva, propietario, ausencia de enlaces, puerto libre y espacio; crear únicamente el directorio autorizado. Conservar PID/ruta ejecutable/config/dbPath propios.
2. Lanzar el binario verificado con `--config <config-aprobada>`, como proceso propio con ventana oculta (`Start-Process -WindowStyle Hidden -PassThru`), sin instalar servicio ni abrir firewall. Confirmar que solo escucha 127.0.0.1.
3. Desde mongosh local verificado, iniciar la instancia nueva con la plantilla siguiente; no hay usuario/clave productivos:

```javascript
rs.initiate({
  _id: 'twosides_c2_<runId>',
  members: [{ _id: 0, host: 'localhost:27184' }]
});
```

4. Esperar con plazo acotado y comprobar hello.setName, isWritablePrimary y lista de miembros exclusivamente locales. Probar una transacción real antes de declarar infraestructura apta.
5. Crear una conexión Mongoose propia hacia `mongodb://127.0.0.1:27184/twosides_sync_test_<runId>?directConnection=true&replicaSet=twosides_c2_<runId>`, sin leer configuración del backend. Verificar ausencia de datos/usuarios ajenos en la instancia nueva y almacenamiento exclusivo.
6. Crear/verificar índices con los modelos C.1, preparar identidad sintética coherente y ejecutar la matriz posterior. El helper prepareIngestionIndexes no valida por sí solo el aislamiento de una conexión: el arnés debe hacerlo **antes** de crear colecciones.
7. Cerrar clientes y aplicaciones propias; detener ordenadamente solo el mongod cuyo PID/ejecutable/dbPath se hayan registrado. No matar procesos por nombre ni tocar servicios compartidos. No automatizar borrados recursivos; cualquier limpieza futura se limita al directorio propio verificado.

Un bind loopback no impide acceso de otros procesos/usuarios del mismo equipo. Usar solo datos sintéticos y directorio exclusivo; no atribuir al ensayo sin autenticación una seguridad productiva. Un replica set de un miembro con majority/journal no demuestra replicación redundante ni recuperación de apagón.

## Matriz preparada, no ejecutada en C.2

Todos los casos siguientes están **PENDIENTES por infraestructura**, no aprobados ni omitidos de una batería ejecutada. Cada caso real requerirá evidencia del servidor, sesiones, índices y procesos propios; no sustituir esos resultados por el doble de C.1.

| ID | Caso preparado | Evidencia futura |
|---|---|---|
| I01 | Índices únicos reales | listIndexes y violaciones reales cuenta/operación y scope/fuente |
| I02 | Inserción válida | Hecho, operación y recibo confirmados |
| I03 | Duplicado idéntico | Mismo recibo original y un efecto |
| I04 | Duplicado contradictorio | 409 y ganador intacto |
| I05 | Dos clientes concurrentes | Dos conexiones/procesos, índices y conflictos reales |
| I06 | Propiedad del jugador | Cuenta/vínculo del contexto autenticado |
| I07 | Identidad ajena/inexistente | Sin acceso, escritura o filtración |
| I08 | Identidad revocada | JWT anterior rechazado, control y revocación coherentes |
| I09 | Instalación/perfil | Vínculo válido admitido, ajeno/inválido rechazado |
| I10 | Recibo persistente | Relectura en conexión nueva, ID/hash/fecha idénticos |
| I11 | Reinicio de aplicación | Nuevo proceso Node con identidad/claves sintéticas duraderas |
| I12 | Respuesta perdida | Retry de mismo ID recupera commit/recibo |
| I13 | Commit | Escribir y leer desde otra sesión tras confirmar |
| I14 | Abort | Sin huérfanos ni recibo emitido |
| I15 | Resultado incierto | Fallo controlado, sin ACK especulativo, resolución por misma clave |
| I16 | Fallo de conexión | 503 controlado, sin datos perdidos por reinicialización |
| I17 | Reconexión | Misma instancia/base, recuperar operación y recibo |
| I18 | Dependencia pendiente | deferred sin inventar padre |
| I19 | Dependencia posterior | Retry acepta con fuente válida de mismo owner |
| I20 | Lote parcial | 207 con recibos solo de commits |
| I21 | game.report | Roundtrip y revisiones/superseded sin retroceso |
| I22 | session.report | open/terminal/null/UTC sin inventar tiempo |
| I23 | gameplay.event | Relaciones/runs y tipos originales |
| I24 | gameplay.interval | ms, límites seguros, solapamientos/adyacencia/ceros |
| I25 | No duplicaciones | Alias y reenvío completo sin nuevos hechos equivalentes |
| I26 | Sin datos productivos | Fixtures generadas, rutas/identidad y ausencia de SQLite real |
| I27 | Sin Atlas | Solo endpoint local explícito, sin SRV ni destinos externos |
| I28 | Regresiones autenticación | 39 legacy + 50 JWT + 35 identidad, reejecutadas y separadas |
| I29 | Regresiones Express/ingestión | 67 casos B, distinguiendo memoria y archivo |
| I30 | Regresiones Mongoose/dobles | 44 casos C.1, identificados como dobles |

Casos adicionales imprescindibles: carrera de revocación en ambos órdenes y reinicio posterior, cambio de cv/authzVersion/binding, expiración durante ingestión, índice ausente/parcial, hash/payload inconsistente, cero operaciones sin recibo/cero recibos huérfanos. Distinguir reinicio Node, reapertura de cliente y reinicio ordenado del mongod propio. Un crash abrupto del servidor necesita autorización específica, aislamiento probado y un plan que no afecte procesos ajenos; no está ejecutado ni se promete durabilidad de apagón.

## Integridad y archivos

Únicamente documentación: este informe nuevo y notas de resultado en los seis documentos autorizados (ADAPTER_IMPLEMENTATION, REMOTE_INGESTION_TEST_PLAN, IMPLEMENTATION_ROADMAP, PHASES, PHASE_HISTORY y DECISIONS). Son resultados nuevos del preflight, no cambios de implementación. No paquetes, código, escenas, datos o contratos modificados.

Las tres bases protegidas se comparan por SHA-256, tamaño, mtime, propietario y SDDL antes/después mediante lectura binaria, sin abrir SQLite ni consultar registros. La raíz y backend se comparan por propietario/SDDL. `.env` queda excluido: **no consultado, abierto, hasheado ni modificado**. Referencia histórica únicamente documental: 278 bytes y SHA-256 `4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928`; no nueva certificación de su contenido o ACL individual en C.2. No comandos de cambio de ACL, propietarios o herencia; B00 permanece pendiente.

## Próximo paso

Suministrar o autorizar explícitamente la infraestructura local desechable y su ubicación, o identificar una instalación portátil confiable que esta búsqueda acotada no haya encontrado. Repetir el preflight después; si cumple, autorizar el arnés real y la corrección de coordinación de identidad propuesta, sin ampliar contratos o permitir Atlas. No reanudar automáticamente ni confundir B05.4C.1 en código con integración validada.

**B05.4C.2: INFRAESTRUCTURA PENDIENTE. Integración real no ejecutada. Trabajo detenido; B05.5 no iniciada.**

Verificación final completada: las tres bases conservan exactamente SHA-256, tamaño, mtime, propietario y SDDL frente al inicio de C.2; propietario/SDDL de raíz y backend también idénticos. .env no se consultó. Únicas ediciones deliberadas: este informe y las seis notas autorizadas. No se iniciaron procesos ni se generaron bases/fixtures de ensayo.
