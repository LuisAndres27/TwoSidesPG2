> **Resultado vigente B05.4C.2D.1B:** el tercer intento único autorizado terminó con AUTHENTICATION_FAILURE, MongoServerError 8000, cierre completado y cero escrituras. No conexión autenticada ni privilegios verificados. Ver la sección D.1B al final; las conclusiones D.1/D.1A anteriores son históricas.

# B05.4C.2D.1 — Primera conexión Mongoose/Atlas de solo lectura

2026-10-28, America/Guatemala. **BLOQUEADA / NO COMPLETADA: DOS INTENTOS MANUALES SIN CONEXIÓN/AUTENTICACIÓN VERIFICADAS. CORRECCIÓN TLS LOCAL COMPROBADA. CERO ESCRITURAS O TRANSACCIONES.**

## Alcance y destino

Se autoriza únicamente conexión, autenticación y diagnóstico no destructivo contra TwoSidesCluster, semilla `<cluster>.<id>.mongodb.net`, usuario `twosides_integration_test`, base `two_sides_integration_test`. No usar administrador, twosides_backend o two_sides_db. Compass conectado sigue siendo evidencia del usuario, no del receptor Mongoose.

No inserciones/actualizaciones/borrados, colecciones, índices, identidades, usuarios o transacciones. No transmitir Outbox real, acceder a otra base de aplicación, iniciar Godot, servicios o B05.5. B00 sigue pendiente.

## Preflight y receptor preparado

Se revisaron los seis documentos requeridos, el factory Atlas, política, canal de credenciales, sender manual y limitaciones de identidad/claves. Se preparó un receptor mínimo que **reutiliza openAtlasIntegration**, sin sustituir ni saltarse sus barreras. No se modificaron políticas, contratos, modo de activación o permisos para intentar conectar.

Archivos nuevos:

- `src/modules/sync/atlas-readonly-probe.js`: exige configuración válida y allowWrites=false. No construye modelos/repositorio, no llama prepareIngestionIndexes, startSession o withTransaction y no consulta colecciones.
- `scripts/atlas-readonly-receiver.js`: artefacto revisado, copiado al directorio privado; utiliza el canal de frame stdin existente, Mongoose ya instalado y el factory Atlas. URI/usuario/base fijos; sin configuración por .env, argv con secretos o variables de entorno de credenciales.
- `tests/sync/atlas-readonly.test.js`: diez casos nuevos de solo lectura con dobles.
- Este informe.

El factory comprueba antes de abrir la conexión modo/autorización, URI y destino exactos, TLS, credencial temporal, ausencia de overrides y plazos. Al retornar el conector, valida Db/conexión/SRV/usuario/TLS y los privilegios mediante connectionStatus. El receptor mantiene autoCreate/autoIndex desactivados; nunca solicita createRepository, aunque el usuario remoto tenga readWrite.

Operaciones explícitas del diagnóstico, todas sobre el Db autorizado:

1. connectionStatus/showPrivileges: inspección de autenticación/roles/recursos/acciones del usuario actual, mediante el factory.
2. ping: conectividad.
3. hello: replica set/primary, número de miembros y parámetros de sesiones/protocolo permitidos.
4. buildInfo: versión, opcional si está disponible.

Los resultados completos de comandos no se imprimen ni se guardan: únicamente un resumen permitido. Se separa establecimiento de conexión, autenticación aceptada por driver, destino verificado, permisos y cierre. Si privilegios no se comprueban, el diagnóstico queda parcial y no se hacen más consultas ni escrituras. Si la versión es inaccesible, se marca desconocida, sin inventarla ni sustituir una prueba transaccional.

Referencias de metadatos: [connectionStatus](https://www.mongodb.com/docs/manual/reference/command/connectionstatus/), [hello](https://www.mongodb.com/docs/manual/reference/command/hello/), [buildInfo](https://www.mongodb.com/docs/manual/reference/command/buildinfo/). No se enviaron esos comandos reales antes de la activación manual.

## Credenciales y artefacto privado

El padre privado existente `%LOCALAPPDATA%/TwoSides` tiene propietario usuario actual y Allow solo de usuario actual/SYSTEM/Administradores. Se verificó en lectura, sin cambiar ACL o propietarios. Se creó un padre AtlasIntegrationTests y un directorio UUID nuevos por herencia, se verificaron las mismas condiciones y ausencia de enlaces y se copió únicamente el receptor no secreto:

```text
C:/Users/luis2/AppData/Local/TwoSides/AtlasIntegrationTests/b054c2c-3d4b5cf7b7b2425da618e8797bd83db4/
```

runId: `3d4b5cf7b7b2425da618e8797bd83db4`.

SHA-256 del receptor copiado, igual al de la fuente revisada:

```text
96B17C93128D0F089331D9604A5D3E802798F4CC9F29FF67056EEB41733F7795
```

El usuario activa manualmente el sender preparado en C.2C. Este pide entrada oculta solo después de verificar autorización D, carpeta privada y hash del receptor; transmite por stdin anónimo y no incluye el secreto en argumentos, historial, entorno, archivos o mensajes. El proceso hijo tiene ventana oculta y entorno mínimo; errores originales/stdout/stderr no se reenvían. No se buscaron contraseñas de Compass, otros proyectos o backend/.env.

Comando de activación sin credenciales, para ejecutarlo exclusivamente en PowerShell local del usuario:

```powershell
$atlasRunDir = 'C:\Users\luis2\AppData\Local\TwoSides\AtlasIntegrationTests\b054c2c-3d4b5cf7b7b2425da618e8797bd83db4'
& 'C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\scripts\send-atlas-test-credential.ps1' -AuthorizedForB054C2D -PrivateDirectory $atlasRunDir -ReceiverPath (Join-Path $atlasRunDir 'atlas-readonly-receiver.js') -ReceiverSha256 '96B17C93128D0F089331D9604A5D3E802798F4CC9F29FF67056EEB41733F7795'
```

No escribir la contraseña en el chat o en ese comando: solo en su entrada oculta. No ejecutar de nuevo sobre un resultado existente: el receptor usa creación exclusiva wx para `readonly-result.json`, sin sobrescribir evidencia. El archivo contiene solo el resumen no secreto y el resultado de cierre, nunca credenciales, payloads o datos previos del clúster. La salida de éxito del sender solo acredita entrega/proceso, **no** resultado Atlas; debe leerse el resumen.

El agente no inició el sender con autorización D ni recibió el valor de un secreto. Crear/copiar el receptor no ejecuta conexión ni solicita credenciales. El usuario activó ambos intentos en su PowerShell privado; sus resultados están documentados abajo. La repetición corregida utilizó otro directorio y conservó la primera evidencia.

## Primer intento real y corrección local

El usuario activó manualmente el primer canal y lo confirmó. El resumen privado registró a las **21:03:15 del 28 de octubre de 2026 (Guatemala; 2026-10-29T03:03:15.180Z)**: connection attempted, autenticación/destino/permisos no verificados, código sanitizado `atlas_connection_unavailable`, cierre true, cero escrituras de documentos y cero transacciones. No se conservó la excepción bruta ni la contraseña; ese código por sí solo no demuestra contraseña incorrecta o falta de permisos.

Diagnóstico posterior sin credenciales: resolución SRV de Windows y Node satisfactoria, tres registros del dominio autorizado; un handshake TLS a un miembro descubierto del mismo clúster validó certificado y nombre correctamente, sin autenticación MongoDB. No demuestra autenticación ni salud de todos los nodos, y no permite atribuir el fallo original a DNS o TLS de red.

Se encontró una incompatibilidad **local y reproducible** en el factory de C.2C: el driver 7.7.0 no admite especificar `tlsInsecure` junto con `tlsAllowInvalidCertificates`/`tlsAllowInvalidHostnames`, aunque todos sean false. El constructor real rechaza esa combinación antes de conectar. Los dobles anteriores no ejercitaban el parser nativo. Se retiró únicamente el redundante tlsInsecure:false; permanecen tls:true y ambas opciones de validación inválida en false, sin relajar TLS ni habilitar overrides.

Además, el driver normaliza esas opciones a rejectUnauthorized/checkServerIdentity. La validación posterior se endureció para rechazar rejectUnauthorized:false o una función personalizada de identidad, además de las guardas anteriores. Se añadieron regresiones con el constructor real de MongoClient **sin llamar connect** y un caso de opciones normalizadas inseguras. El receptor distingue ahora un rechazo local de configuración con código fijo `atlas_client_configuration_rejected`, sin errores originales/credenciales. No se tocaron contratos, permisos o datos para corregirlo.

El primer resultado no se sobrescribió. El usuario mostró repeticiones sobre el primer directorio, que terminaron antes de otro diagnóstico real al existir el archivo de resultado. El sender se corrigió para rechazar ese caso **antes** de pedir la contraseña, evitando entradas innecesarias. Se preparó un directorio nuevo y se solicitó la segunda activación manual, porque el secreto del primero se descartó:

```text
RunId: 1b1c7e83cce04fe5a85e036ed339550a
Directorio: C:/Users/luis2/AppData/Local/TwoSides/AtlasIntegrationTests/b054c2c-1b1c7e83cce04fe5a85e036ed339550a/
SHA-256 receptor: 6CA645AAE03A377E1B44EB9CD247B5A051C789285A83468F63D523C435B25A7E
```

El comando del primer directorio anterior es evidencia histórica, no una instrucción para repetirlo sobre un resultado existente. El segundo canal utiliza el mismo sender validado, con el nuevo directorio y hash indicados al usuario. No se reutilizó ni recuperó la contraseña anterior.

### Segundo intento real: resultado final

El usuario ejecutó y confirmó el canal correcto `1b1c7e83cce04fe5a85e036ed339550a`. El resumen se registró a las **21:13:01 del 28 de octubre de 2026 (Guatemala; 2026-10-29T03:13:01.859Z)**. Resultado: blocked, connection attempted, autenticación no verificada, destino no verificado, permisos null, ping/topología/buildInfo no intentados mediante Mongoose, error `atlas_connection_unavailable`, cierre true, cero escrituras de documentos y cero transacciones.

La configuración TLS corregida sí supera el constructor real sin abrir red. No obstante, el segundo intento sigue fallando antes de que el driver devuelva una conexión autenticada al factory. El diagnóstico almacenado no incluye excepción original, password o URI con credenciales; por ello **no determina la causa concreta** de este segundo fallo. No se atribuye a contraseña incorrecta, rol insuficiente, lista de acceso, DNS o certificado sin evidencia. Los diagnósticos SRV/TLS independientes exitosos no equivalen a autenticación Mongoose y no descartan todos los problemas de acceso/topología.

El mensaje del sender «Canal temporal finalizado» acredita solo entrega/terminación del proceso; no es resultado de conexión. Ambos JSON privados se conservaron sin sobrescritura y no quedan procesos Node del ensayo. No hubo un tercer intento ni se pidió otra contraseña para continuar indefinidamente. No se alteraron roles, TLS estricto, destino o Network Access para eludir el fallo.

**Conclusión: D.1 BLOQUEADA / NO COMPLETADA.** Falta comprobar conexión/autenticación y privilegios reales antes de cualquier D.2. Un siguiente diagnóstico deberá categorizar de forma acotada el error del driver (tipo/código/etapa allowlisted, sin mensajes/credenciales/stack originales), reproducir primero opciones/configuración sin red y, solo si es necesario y autorizado, utilizar un canal privado nuevo. No repetir comandos sobre los dos resultados existentes. No se propone ni autoriza escritura como prueba de conectividad.

## Pruebas sintéticas ejecutadas

**35 pruebas distintas aprobadas**, 0 fallidas finales, en una selección de dos archivos: trece R01–R13 nuevas y veintidós regresiones de configuración/canal/permisos Atlas. Los catorce casos de ingestión/escritura fuera de la selección quedaron excluidos por filtro y Vitest los informa skipped: no se ejecutaron ni se presentan como aprobados. Las 271 pruebas previas no se reejecutaron completas.

La ejecución focalizada inicial de diez casos y la selección de 32 se repitieron al añadir las tres regresiones TLS, sin sumarlas otra vez. Los casos comprueban comandos de diagnóstico permitidos, ausencia de modelos/transacciones/escrituras, rechazo de allowWrites, destino equivocado, permisos excesivos, ping fallido, versión opcional, error sanitizado, topología insuficiente y cierre fallido. Todas las conexiones de las pruebas fueron dobles y se bloquea Socket.connect al procesar configuración. Los constructores nativos de R11/R12 no abren sockets. Una expectativa de test sobre flags sin normalizar se corrigió para comprobar las opciones TLS efectivas del driver; la batería final pasó.

Comando realmente ejecutado:

```text
node --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run tests/sync/atlas.test.js tests/sync/atlas-readonly.test.js --config vitest.config.js --testNamePattern '^(A(0[1-9]|10|16|2[1-5]|28|3[01679])|R\d{2})\b'
```

Node --check de ambos archivos JS nuevos sin errores. No compilar/ejecutar Godot o .NET, instalar paquetes o ejecutar pruebas transaccionales. Esas pruebas locales no acreditan conectividad Atlas.

## Resultado real final

| Verificación real | Estado |
|---|---|
| Activación manual/entrega privada | Dos intentos activados y confirmados por el usuario |
| Conexión Mongoose | Dos intentos fallidos; no conexión autenticada verificada |
| Autenticación | No verificada; no declarar contraseña inválida sin evidencia |
| Destino efectivo | Configuración exacta verificada localmente; destino conectado no verificado |
| Privilegios efectivos | No comprobados remotamente; readWrite de usuario es evidencia declarada de Atlas UI |
| ping/topología/versión | No observados mediante Mongoose; no afirmar transacciones o versión verificadas |
| Cierre de conexión real | Ambos resúmenes indican cierre; ningún proceso Node remanente observado |
| Escrituras o transacciones autorizadas | Ninguna |

## Identidad, Free M0 y siguiente fase

El rol readWrite sobre la base fue comunicado por el usuario; no sustituye la consulta de permisos del proceso autenticado. dbName tampoco constituye aislamiento por sí solo. El factory exige único usuario/rol/recursos previstos y falla cerrado si no puede verificarlos; no prueba aislamiento intentando CRUD sobre otras bases.

Free M0 puede aportar replica set y sesiones, pero esas capacidades observadas no demuestran transacciones/recibos/idempotencia. No reiniciar nodos Atlas, forzar failover o modificar configuración. Los límites y riesgos de latencia del [modo C](B05_ATLAS_INTEGRATION_MODE.md) siguen pendientes de observación, no de una prueba de estrés.

La identidad y revocaciones actuales siguen en memoria/archivo y no están transaccionalmente coordinadas con controles Mongo. Conectar correctamente no resuelve esa ventana ni autoriza crear identidades remotas. Pruebas futuras de revocación concurrente, reinicio con identidad/sesiones y commit requieren una subfase explícita de coordinación durable. B00 permanece documentado y sin corrección de ACL.

Solo tras verificar conexión/destino/permisos/cierre podrá declararse D.1 completada; cualquier resultado parcial mantiene bloqueadas las escrituras. D.2 requerirá autorización nueva y concreta para su alcance, con namespaces/manifiesto sintético, identidad durable y limpieza acotada. Ninguna de esas acciones está autorizada por este informe.

`.env` no se consultó, abrió, hasheó o modificó; no se certifica de nuevo su contenido. Las tres bases protegidas se comparan por hash/tamaño/mtime/owner/SDDL sin SQL. No cambios de Godot, progreso, usuarios, permisos o bases remotas.

**D.1 BLOQUEADA / NO COMPLETADA. D.2/B05.5 no iniciadas. Trabajo detenido sin escrituras.**

## Verificación final e inventario

Las tres bases protegidas conservaron exactamente SHA-256, tamaño, mtime, propietario y SDDL frente al inicio de D.1. .env no se consultó, abrió, hasheó o modificó; no nueva certificación de contenido. Cero procesos Node remanentes al cierre. No cambios de Godot, Outbox o paquetes.

Inventario del backend: cuatro archivos nuevos y ocho existentes modificados, cero eliminados. Nuevos: este informe, el receptor, el módulo de diagnóstico y sus tests. Modificados: atlas-integration.js (TLS compatible), atlas-policy.js (validación TLS normalizada), sender PowerShell (rechazo previo de resultado existente) y cinco documentos directamente afectados (modo, plan de pruebas, PHASES, PHASE_HISTORY y DECISIONS). No cambios de endpoints, roles, esquemas o contratos.

Fuera del proyecto se conservaron únicamente dos directorios privados de ejecución con sus receptores revisados y resúmenes no secretos; ningún archivo de contraseña. Se verificaron owner/ACL sin cambiarlos. No se borró ni reemplazó evidencia previa. Las correcciones sintácticas se comprobaron con Node --check y el parser PowerShell sin errores; las 35 pruebas seleccionadas finales pasaron, sin nuevas credenciales reales en tests.

D.1 termina BLOQUEADA / NO COMPLETADA por falta de conexión/autenticación/permisos verificables. No afirmar integración Mongoose/Atlas validada ni coordinación durable resuelta. B00 pendiente; D.2/B05.5 no iniciadas. Trabajo detenido.
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