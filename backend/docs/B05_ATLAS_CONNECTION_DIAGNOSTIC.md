> **Preparación B05.4C.2D.1C:** opción DEFAULT de solo lectura preparada y 75 pruebas offline aprobadas (14 excluidas), sin nuevo intento remoto. Ver [procedimiento pendiente de autorización](B05_ATLAS_DEFAULT_AUTH_PREFLIGHT.md). El último resultado remoto sigue siendo D.1B: AUTHENTICATION_FAILURE, MongoServerError 8000, cierre completado y cero escrituras; sin autenticación ni privilegios verificados. Las conclusiones D.1/D.1A/D.1B conservan su carácter histórico.

# B05.4C.2D.1A — Diagnóstico sanitizado Node.js/MongoDB Atlas

2026-10-28, America/Guatemala. **COMPLETADA COMO DIAGNÓSTICO: causas posibles delimitadas e instrumentación privada probada. Conexión Mongoose/Atlas NO VALIDADA. Sin tercer intento autenticado.**

Entorno identificado por el usuario: TwoSidesCluster, host `<cluster>.<id>.mongodb.net`, cuenta `twosides_integration_test`, única base `two_sides_integration_test`. No contraseñas recibidas/buscadas, URI completas mostradas en este informe, cuentas administrativas, acceso a two_sides_db, datos del juego o escrituras remotas. B00 sigue pendiente.

## 1. Resultado y límite de lo conocido

- El defecto TLS local anterior está confirmado y corregido: el driver rechaza tlsInsecure junto a tlsAllowInvalidCertificates/Hostnames aunque sean false. La configuración vigente mantiene TLS estricto y ya no combina esas opciones.
- En esta fase, DNS SRV/TXT, resolución de los tres miembros, TCP y TLS estricto funcionaron sin credenciales. Se repitieron bajo el entorno mínimo del receptor con el mismo resultado.
- La configuración vigente supera el parser del driver. Mongoose real también llega a MongoClient.connect en una prueba interceptada antes de red.
- El segundo fallo histórico continúa **SIN CAUSA CONCRETA DETERMINADA**. Sus datos originales no se conservaron y no pueden reconstruirse del código atlas_connection_unavailable. No es evidencia de contraseña incorrecta, permisos insuficientes o caída de Atlas.
- Las comprobaciones sin autenticación no acreditan handshake MongoDB autenticado, selección efectiva bajo ese intento, roles ni transacciones. D.1 sigue bloqueada y D.2 no comienza.

No se solicitaron credenciales ni autorización de tercer intento durante D.1A. Se entrega primero este resultado, conforme a la puerta de la sección 8 de la solicitud.

## 2. Punto exacto donde se pierde la evidencia

En los receptores históricos, el bloque con mongoose.createConnection/asPromise convertía cualquier error no reconocido en un AtlasIntegrationError genérico. Solo distinguía inicialmente código 18 y luego errores de opciones por nombre. Descartaba clase real, códigos distintos de 18, causas, descripción de selección/errores por servidor, duración y resultado individual del cierre.

`atlas-integration.js`, catch de openAtlasIntegration, conserva únicamente AtlasIntegrationError conocidos y convierte el resto en atlas_connection_unavailable. `atlas-readonly-probe.js` registra ese código, pero ya no dispone de la causa. `authorizeAtlasScope` convertiría un fallo posterior de inspección de permisos en atlas_permissions_unverified; los resúmenes previos no llegaron a ese estado ni a ping/hello/buildInfo.

Por tanto, la frontera del segundo fallo es el conector de establecimiento **antes de devolver la conexión autenticada al factory**, no una prueba de rechazo del rol readWrite. No se sabe qué excepción concreta salió de esa frontera en el segundo intento. La nueva prueba de puente Mongoose/driver excluye una incompatibilidad local reproducible del flujo vigente, sin afirmar que las condiciones históricas de red/servidor fueran idénticas.

La corrección mínima implementada es capturar una clasificación cerrada en esa frontera **antes** de la conversión genérica. No cambiar la API pública, relajar autenticación/TLS, ampliar plazos o probar escrituras.

## 3. Versiones, configuración y ciclo de vida

| Elemento verificado ahora | Valor |
|---|---|
| Node ejecutable | C:/Program Files/nodejs/node.exe |
| Node | v24.19.0 |
| Mongoose efectivo | 9.11.2 |
| Driver mongodb efectivo | 7.7.0, dependencia de Mongoose |
| Engines instalados de Mongoose/driver | Node >=20.19.0; versión local satisface el requisito declarado |
| Modo/destino | atlas-integration-test explícito, autorización obligatoria, semilla/usuario/base exactos |
| Autenticación prevista | SCRAM-SHA-256, authSource admin; no rol admin |
| TLS transmitido | tls=true, tlsAllowInvalidCertificates=false, tlsAllowInvalidHostnames=false; tlsInsecure redundante omitido |
| TLS efectivo tras parser | rejectUnauthorized=true; checkServerIdentity sin sustitución personalizada |
| Pools | maxPoolSize 2, minPoolSize 0, maxConnecting 1, idle 10000 ms |
| Selección/conexión | serverSelectionTimeoutMS 10000; connectTimeoutMS 10000 |
| Espera de pool | waitQueueTimeoutMS 2000 |
| Escrituras automáticas/diagnóstico de comandos | autoCreate, autoIndex, buffering y monitorCommands desactivados |
| Canal privado | Frame de stdin anónimo, recepción hasta 10000 ms; sin contraseña en argv/env/disco |
| Lanzador | Espera de hijo 30000 ms; solo termina su proceso propio ante timeout |

La versión histórica del proceso de cada intento no estaba registrada en sus resúmenes. Los valores anteriores se observaron ahora, tanto en el diagnóstico normal como en el proceso con entorno mínimo.

El sender verifica carpeta privada, propietario/ACL en lectura y hash del receptor, pide entrada oculta y entrega un frame de un uso. La repetición sobre un resultado existente se rechaza antes del prompt. El receptor no crea modelos/repositorio, no llama startSession/withTransaction y solo tendría permitido connectionStatus/ping/hello/buildInfo. El factory sigue con allowWrites=false en este procedimiento.

El handle de credencial se consume/libera en el factory/probe; se limpian buffers y el lanzador libera BSTR/bytes. No se promete borrado perfecto de strings del GC o protección contra administrador/malware. El conector ahora clasifica antes de desechar el error y registra si su cierre propio falla; el receptor refleja ese fallo en closed/status. No oculta un fallo de cierre como éxito del diagnóstico.

## 4. Clasificador privado implementado

Nuevo módulo `src/modules/sync/atlas-error-diagnostic.js`.

Categorías: DNS_SRV_FAILURE, DNS_HOST_FAILURE, NETWORK_TIMEOUT, NETWORK_REFUSED, NETWORK_RESET, TLS_HANDSHAKE_FAILURE, CERTIFICATE_VALIDATION_FAILURE, SERVER_SELECTION_TIMEOUT, SERVER_SELECTION_FAILURE, AUTHENTICATION_FAILURE, AUTHORIZATION_FAILURE, INVALID_CONNECTION_OPTIONS, CLUSTER_UNAVAILABLE y UNKNOWN_CONNECTION_FAILURE. La clase de selección por sí sola no acredita timeout: se distingue de la firma fija de plazo expirado, sin conservar su mensaje.

Se conservan solo clase/código/codeName de listas cerradas, categoría, etapa permitida, duración aproximada redondeada a 100 ms, resultado de cierre/limpieza y evidencia categórica de causas. No nombres de nodos, direcciones IP, keys de mapas, password, token, URI, variables de entorno, mensaje, stack, configuración del cliente u objeto original. No tiene logger ni modifica respuestas HTTP.

La lectura de propiedades evita invocar getters, toString o toJSON. Recorre cause/error/reason, errores de servidores por sus valores y AggregateError, con límite de profundidad/nodos y detección de ciclos. Una causa concreta de certificado/DNS/red tiene prioridad sobre el envoltorio de selección de servidor, que sigue visible como evidencia. No serializa el Map de topología o sus claves.

Código 18 o AuthenticationFailed clasifica rechazo de autenticación; código 13/Unauthorized clasifica autorización. **El código Atlas 8000 por sí solo permanece desconocido.** Únicamente una firma fija de respuesta bad-auth se reconoce como autenticación, sin conservar el texto o un fragmento. Esa categoría no determina que la contraseña esté mal: puede involucrar identidad/mecanismo/estado. Una topología o pool cerrado describe disponibilidad del cliente y no demuestra por sí solo una caída del clúster.

Nuevo `atlas-readonly-connector.js`: contiene el bloque nativo de conexión y captura la clasificación privada mediante callback cerrado. Cierra su propia conexión incompleta y lanza al factory el mismo código genérico previsto; no adjunta cause, errores originales o diagnósticos al error público. El receptor de pruebas puede escribir solo esa clasificación sanitizada en su resumen privado. La API/endpoint y políticas públicas no se modificaron.

No se copiaron nuevos receptores a AppData, no se cambiaron las dos evidencias privadas previas y no se activó el sender. El receptor fuente queda preparado para una posible subfase autorizada; no debe confundirse con instrumentación que hubiera existido durante los dos intentos anteriores.

## 5. Diagnóstico de red sin credenciales

Nuevo `scripts/atlas-network-diagnostic.js`. Solo usa DNS/TCP/TLS; no importa Mongoose, recibe contraseña, crea MongoClient o envía comandos MongoDB. No consulta/edita DNS global, firewall, certificados o Atlas Network Access. Valida que los SRV pertenezcan al dominio exclusivo autorizado y al puerto previsto antes de tocar un nodo.

| Comprobación actual | Entorno normal | Entorno mínimo del sender |
|---|---|---|
| SRV del host autorizado | OK, 3 registros | OK, 3 registros |
| Sufijos/puertos esperados | Todos válidos | Todos válidos |
| TXT | 1 registro; authSource admin y replicaSet presentes; sin opciones desconocidas | Igual |
| Resolución de cada nodo | 1 IPv4 por nodo; lookup IPv4 1, IPv6 0 | Igual |
| TCP, tres nodos | 3/3 OK, sockets cerrados | 3/3 OK, sockets cerrados |
| TLS, tres nodos | 3/3 OK, certificado y nombre verificados, sockets cerrados | 3/3 OK, mismo requisito estricto |
| Configuración DNS observada | 2 resolvers, orden verbatim | Igual |
| Autenticación MongoDB | No intentada | No intentada |

Las direcciones de resolvers/IP/nombres completos de miembros no se registran. La consulta de diagnóstico usa un Resolver propio con timeout 2500 ms/1 intento; no modifica los resolvers globales ni los plazos del driver. TCP/TLS tienen plazo propio de 5000 ms. El entorno mínimo reproduce SystemRoot, LOCALAPPDATA y NODE_ENV=test, sin heredar opciones adicionales o secretos del padre; no demuestra idénticas condiciones históricas de todos los procesos.

Se valida el certificado normal del servidor, sin tlsInsecure, rejectUnauthorized=false o certificados inválidos. No se escribe siquiera un documento de prueba. Un socket TLS exitoso **no es** una sesión MongoDB autenticada ni una prueba transaccional.

Comando reproducible sin credenciales desde la raíz de la copia: `node backend/scripts/atlas-network-diagnostic.js`. No acepta otro destino como parámetro. El procedimiento con entorno mínimo también se ejecutó sin stdin de credenciales o llamadas MongoDB.

## 6. Corrección TLS anterior y compatibilidad comprobadas offline

Se reejecutaron las regresiones del parser nativo: la combinación TLS anterior falla antes de red; las opciones corregidas se aceptan con validación estricta efectiva. Además, la prueba D26 usa Mongoose real y sustituye MongoClient.connect por una interrupción sintética, con Socket.connect bloqueado. **El driver recibió el flujo de conexión exactamente una vez sin abrir sockets**. Esto cubre el paso Mongoose/opciones que un doble genérico no verificaba.

No se detectó necesidad de cambiar versión de paquetes, TLS, authSource, mecanismo, familia IP, tiempos o destino. No hacer cambios globales o ampliar Network Access a partir de hipótesis. El estado actual no reproduce un fallo de DNS/nodo/TCP/certificado/parser; tampoco permite descartarlos históricamente ante condiciones transitorias.

## 7. Pruebas realizadas

**62 pruebas distintas aprobadas, 0 fallidas finales: 27 nuevas D01–D27 + 35 regresiones pertinentes de lectura/configuración.** Catorce casos de ingestión/escritura quedaron excluidos por filtro y se informan skipped, no aprobados. La ejecución inicial focalizada de 27 y sus repeticiones no se suman otra vez. No se reejecutaron las 271 pruebas completas ni las baterías C#/Godot.

| Grupo | Casos |
|---|---|
| DNS SRV/host, timeout, rechazo/reset, TLS/certificado, selección | D01–D07, D13–D14 |
| Autenticación/autorización, opciones, topología cerrada y desconocido | D08–D12, D21–D22 |
| AggregateError/ciclos, causas anidadas, secretos/logs/getters, límites/duración | D15–D20, D27 |
| Wrapper privado, error público genérico, cierre fallido, destino restringido | D23–D25 |
| Puente real Mongoose/driver interceptado antes de red | D26 |
| Regresiones previas de opciones, canal, TLS y diagnóstico readonly | 35 casos A/R seleccionados |

Errores sintéticos contienen marcadores aleatorios en mensajes, stacks, credenciales anidadas y claves de mapas; no aparecen en la salida sanitizada. Se comprueba ausencia de console.log/warn/error del clasificador y que no se adjunta detalle privado al error público. Los constructores reales usados en tests no autentican contra Atlas.

Comando desde backend:

```text
node --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run tests/sync/atlas.test.js tests/sync/atlas-readonly.test.js tests/sync/atlas-diagnostic.test.js --config vitest.config.js --testNamePattern '^(D\d{2}|R\d{2}|A(0[1-9]|10|16|2[1-5]|28|3[01679]))\b'
```

Node --check de los cinco archivos JS nuevos/modificados revisados: cero errores. No software instalado, edición de dependencias, .env, pruebas autenticadas o escrituras remotas.

## 8. Causas restantes y tercer intento

Quedan delimitadas, **no diagnosticadas como hechos**, estas posibilidades: rechazo durante autenticación/handshake MongoDB, imposibilidad de selección/protocolo en ese momento, acceso efectivo específico del cliente o una condición transitoria no reproducida. El rol readWrite declarado no pudo verificarse por falta de conexión; no se usa como prueba de que falló la contraseña. Una inspección de permisos tendría otra etapa/código y no fue alcanzada en las evidencias previas.

Para **completar D.1 o identificar con certeza el error restante**, probablemente será necesario un intento autenticado nuevo con esta instrumentación, porque la causa del segundo se descartó irreversiblemente. No es necesario para cerrar D.1A como diagnóstico delimitado. Este informe se entrega antes de pedirlo: **no se ejecutó ni se solicitó automáticamente ese tercer intento**.

Si el usuario decide autorizarlo por separado, la nueva evidencia será categoría/clase/código anidados y etapa/duración/cierre del fallo real antes del mapeo público, o bien conexión/permisos/diagnóstico satisfactorios. Debe usar un nuevo directorio/copia/hash revisados y el canal manual existente, con allowWrites=false y las mismas políticas. No reutilizar/buscar credenciales anteriores, sobrescribir los dos resultados, probar otra base o usar administrador. Si una causa se identifica sin autenticación antes de ese paso, no volver a pedir la contraseña.

## 9. Riesgos e integridad

La coordinación durable de identidad/revocaciones aún no existe entre memoria/archivo y Mongo; ni el clasificador ni un TLS exitoso la resuelven. B00 sigue pendiente: código modificable bajo ACL investigadas puede comprometer secretos futuros aunque la custodia esté fuera de OneDrive. Esta fase no cambia ACL, propietarios o herencia ni recibe un secreto real.

El alcance deliberado es cinco archivos nuevos (clasificador, wrapper privado, script de red, tests e informe) y el receptor fuente existente modificado para usar el callback sanitizado. No se modifican app/server/API pública, factory/política TLS, paquetes, Godot, datos, usuarios Atlas, colecciones o índices. Las dos evidencias privadas previas se conservan; no nuevos directorios privados de conexión o intentos autenticados.

`.env` excluido de lectura/apertura/hash; las tres bases protegidas se verifican por SHA-256, tamaño, mtime, propietario y SDDL sin SQLite/SQL. No datos reales Outbox, AWS, D.2 o B05.5. Las verificaciones finales se consignan al cierre.

Referencias de criterios técnicos: [DNS Node 24](https://nodejs.org/docs/latest-v24.x/api/dns.html), [TLS Node 24](https://nodejs.org/docs/latest-v24.x/api/tls.html), [diagnóstico oficial del driver](https://www.mongodb.com/docs/drivers/node/current/connect/connection-troubleshooting/). Se usaron fuentes públicas y código instalado; no configuración de Compass o del proyecto original.

**D.1A COMPLETADA COMO DIAGNÓSTICO. D.1 permanece BLOQUEADA, conexión Mongoose/Atlas NO VALIDADA. No tercer intento autenticado, D.2/B05.5 no iniciadas. Detenerse y esperar instrucciones.**

## Verificación final

Inventario comprobado: 5 archivos nuevos y 1 existente modificado, cero eliminados, todos bajo backend y enumerados arriba. Sin cambios de factory/política pública, endpoints, paquetes o documentos históricos. Los cinco JS revisados pasan Node --check; 62/62 pruebas seleccionadas aprobadas y 14 casos fuera de alcance excluidos. No se suman reejecuciones.

Las tres bases protegidas conservan exactamente SHA-256, tamaño, mtime, propietario y SDDL frente al inicio de D.1A. .env no se consultó ni hasheó; no se certifica de nuevo su contenido. No comandos de modificación de ACL/propietarios/herencia, escrituras remotas o tercer intento autenticado. Cero procesos Node remanentes. No se crearon nuevas copias privadas ni se alteraron los dos resultados anteriores.

D.1A completada como diagnóstico delimitado; D.1 continúa bloqueada. El siguiente intento autenticado, si el usuario decide continuarlo, requiere autorización separada y canal privado nuevo/revisado. No se solicita contraseña en esta fase. D.2/B05.5/AWS no iniciados. Trabajo detenido.
## B05.4C.2D.1B — Único tercer intento controlado: resultado

2026-10-28, America/Guatemala. **INTENTO AUTORIZADO CONCLUIDO CON FALLO DE AUTENTICACIÓN. D.1 y la conexión Mongoose/Atlas siguen sin validarse.** No hubo repetición en esta subfase.

### Preflight y configuración efectiva

Se revisaron informe, clasificador, factory, receptor y canal. Se reejecutaron 62 pruebas pertinentes sin autenticación remota: todas aprobadas; 14 casos de ingestión/escritura excluidos por filtro. No se presentan las baterías históricas como ejecuciones nuevas adicionales. Sintaxis de receptor y sender comprobada sin errores.

Fuente seleccionada: constantes del receptor revisado + política Atlas estricta, con mode atlas-integration-test, authorized true y allowWrites false. Host fijo <cluster>.<id>.mongodb.net; usuario twosides_integration_test; base two_sides_integration_test. Ninguna lectura de backend/.env o selección por MONGODB_URI. Credencial únicamente por entrada oculta/stdin de un uso; no se registró su valor.

TLS estricto conservado: certificado/nombre verificados, sin tlsInsecure ni callbacks de identidad alternativos. Selección/conexión 10000 ms, cola 2000 ms, recepción de frame 10000 ms y plazo del hijo 30000 ms. autoCreate, autoIndex, buffering y monitorCommands desactivados. No modelos/repositorio, índices, migraciones, operaciones reales o transacciones.

### Procedencia y límite de un intento

Se creó un solo directorio nuevo fuera de OneDrive/Git, con owner/Allow verificados en lectura y sin cambios de permisos:

RunId: `17ddc05d05834e03b7b38a68d7277562`.

Directorio: `C:/Users/luis2/AppData/Local/TwoSides/AtlasIntegrationTests/b054c2c-17ddc05d05834e03b7b38a68d7277562/`.

Receptor SHA-256: `4B8B7CDDC34E7C9C85D2EBA268999D51507C8CD24086B5C4AA8A7AD60C923657`.

Sender privado SHA-256: `B13FC5429F90F42886CA0F0C890745CF936A62192A44FF34557264A3690C34C6`.

Se copiaron únicamente receptor/sender revisados y manifiesto no secreto de ocho dependencias. El receptor verifica manifiesto, runId y hashes antes de importar código del proyecto o consumir el frame. El sender verifica el receptor antes del prompt. Las huellas se comprobaron de nuevo al terminar, sin diferencias. B00 no se declara resuelto: la revisión/hash no constituye una protección absoluta contra código o sistema comprometidos.

Para cumplir el máximo autorizado se añadió un marcador de ejecución exclusivo `readonly-attempt.started` creado mediante wx; solo su propietario de ejecución puede escribir el resultado. El sender rechaza un marcador o resultado previo antes del prompt. Así una repetición/concurrencia del mismo canal no vuelve a invocar el procedimiento, y una segunda instancia no sobrescribe el resultado del propietario. No se borraron marcadores ni se habilitó otro directorio para repetir el intento.

El usuario activó manualmente una vez este canal y confirmó su salida. El agente no pidió la contraseña en el chat, no recuperó valores anteriores/Compass, no inició el sender con credencial ni repitió la conexión. La invocación controlada usa el descubrimiento/monitorización normal del driver; no se cuentan esas tareas internas como pruebas adicionales autorizadas.

### Captura privada sanitizada

Resultado registrado a las **21:45:35 del 28 de octubre de 2026 (Guatemala)**, `2026-10-29T03:45:35.283Z`:

| Campo | Resultado observado |
|---|---|
| Estado del procedimiento | blocked |
| Conexión | attempted; no conexión autenticada devuelta al factory |
| Categoría técnica | **AUTHENTICATION_FAILURE** |
| Clase | **MongoServerError** |
| Código técnico seguro | **8000** |
| codeName permitido | AtlasError |
| Etapa | **mongoose-connect** |
| Duración aproximada | **600 ms** |
| Resultado autenticación | **failed** |
| Destino conectado/identidad efectiva | No verificados después de autenticar; solo configuración previa fijada |
| Privilegios efectivos | No comprobados; no se alcanzó connectionStatus |
| ping/topología/versión | No ejecutados mediante esta conexión |
| Cierre / limpieza del conector | **completed / completed**; closed true |
| Evidencia anidada | Una entrada raíz permitida, sin truncamiento |
| Escrituras de documentos / transacciones | **0 / 0** |

El error fijo privado es atlas_authentication_failed. No se imprimió/persistió el error original, stack, mensaje de servidor, URI, password, token u objeto de configuración. La API pública continúa con sus contratos genéricos; el detalle anterior existe solo en el procedimiento privado autorizado. El resumen final no debe interpretarse como autenticación correcta porque el sender haya finalizado.

### Causa demostrada y corrección mínima recomendada

La causa disponible de **este tercer intento** es un rechazo de autenticación durante el establecimiento Mongoose/driver. El clasificador identifica la firma fija de rechazo junto al código; no utiliza 8000 por sí solo como prueba. No es un timeout de selección ni un fallo de certificado observado en este intento. Esto no reconstruye retrospectivamente la causa original del segundo intento.

**No demuestra por sí solo que la contraseña sea incorrecta.** Permanecen por verificar la correspondencia de la credencial introducida con ese usuario concreto, existencia/estado/vigencia del usuario, método SCRAM y restricción del usuario al clúster previsto. Los roles de aplicación no se pudieron consultar; no afirmar un fallo de autorización por falta de readWrite.

Corrección mínima recomendada: que el operador revise en Atlas Database Access la identidad exacta twosides_integration_test, su estado y método, el clúster al que está limitada y la correspondencia de la credencial temporal, sin exponerla ni extraer una guardada de Compass. Confirmar si la conexión Compass anterior correspondía realmente a esa misma identidad/clúster, a partir de metadatos/evidencia no secreta. No se ha demostrado necesidad de cambiar TLS, destino, timeout, DNS, firewall o permisos; no se cambian automáticamente contraseñas, roles, usuarios o Network Access.

No se autoriza ni ejecuta otra prueba autenticada para verificar esa revisión. Cualquier nuevo intento necesitará autorización separada y otro canal revisado, sin reciclar este run consumido. Ninguna inferencia sobre password o cuentas autoriza a escribir documentos, crear índices o iniciar D.2.

### Integridad y cierre de D.1B

Las tres bases protegidas conservaron exactamente SHA-256, tamaño, mtime, propietario y SDDL antes/después. .env no se consultó, abrió, imprimió, hasheó o modificó; no se certifica nuevamente su contenido. Sin cambios de Godot, datos Outbox, paquetes, ACL, propietarios o herencia. No se modificaron usuarios/colecciones/índices Atlas. Los dos resultados anteriores permanecen intactos y no se inició ninguna prueba adicional de red sobre Atlas fuera de este único procedimiento.

Cero procesos Node remanentes. Los artefactos privados conservados contienen solo código revisado, manifiesto, marcador y resultado sanitizado, sin archivos de credencial. La coordinación durable de identidad/revocaciones y B00 continúan pendientes; el resultado no valida persistencia MongoDB.

**B05.4C.2D.1B finalizada con AUTHENTICATION_FAILURE. D.1 sigue BLOQUEADA / NO COMPLETADA. No repetición autorizada ni ejecutada. D.2/B05.5 no iniciadas. Trabajo detenido.**
