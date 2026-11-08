# B05.4C.2D.1D — Resultado real de autenticación DEFAULT

**COMPLETADA: CONEXIÓN AUTENTICADA DE SOLO LECTURA VERIFICADA.** Un solo procedimiento manual autorizado, sin repetición. Persistencia MongoDB pendiente de validación. B05.4C.2D.2 y B05.5 no iniciadas.

Resultado: 2026-10-28 a las 22:16:31, America/Guatemala; registro UTC 2026-10-29T04:16:31.604Z.

## Condiciones previas

Se revisaron B05_ATLAS_DEFAULT_AUTH_PREFLIGHT.md, B05_ATLAS_AUTHENTICATION_DIAGNOSIS.md, B05_ATLAS_CONNECTION_DIAGNOSTIC.md, B05_ATLAS_INTEGRATION_MODE.md y B05_ATLAS_READONLY_CONNECTION_RESULT.md, junto al sender, receptor y módulos reales de configuración/credenciales/conexión. El usuario autorizó como máximo un intento autenticado de solo lectura, condicionado a su activación manual. No se interpretó el éxito anterior de Compass como validación Mongoose.

Se reejecutaron **75 pruebas sintéticas aprobadas, 14 excluidas, cinco archivos**, sin autenticación remota. Incluyen negociación DEFAULT, Mongoose hasta connect interceptado, TLS, identidad, canal PowerShell/UTF-8, bloqueo de escrituras y rechazo de manifiestos antiguos/canales consumidos. Sintaxis Node del receptor privado y parser PowerShell del sender: aprobados. No se instalaron paquetes ni arrancó el backend de desarrollo.

El único ajuste de código en D.1D fue actualizar Phase exigido y subphase del resultado en scripts/atlas-readonly-receiver.js, desde D.1C a D.1D. No se cambió la configuración principal, el sender, política/factory, credenciales ni parámetros de TLS. El manifiesto de esta ejecución utiliza la fase nueva; las instrucciones D.1C son antecedentes y sus manifiestos no se reutilizaron.

## Configuración efectiva

| Elemento | Valor verificado |
|---|---|
| Modo | atlas-integration-test; authorized true |
| Clúster previsto | TwoSidesCluster |
| Host | <cluster>.<id>.mongodb.net |
| Usuario | twosides_integration_test |
| Base | two_sides_integration_test |
| authSource | admin |
| Mecanismo solicitado | DEFAULT explícito |
| Escrituras | allowWrites false |
| TLS | Certificado y nombre verificados; sin tlsInsecure ni callback alternativo |
| Límites | Selección/conexión 10000 ms; cola 2000 ms; recepción 10000 ms; proceso hijo 30000 ms |
| Creación automática/monitorización | autoCreate, autoIndex, buffering y monitorCommands desactivados |

Fuente: constantes del receptor y política Atlas estricta. backend/.env no se abrió, consultó ni hasheó. No se seleccionó MONGODB_URI ni se heredó del entorno del padre: el sender limpia el entorno del hijo. La contraseña viajó únicamente mediante entrada oculta y frame binario en stdin, fuera de URI/argv/env/archivos. No se leyó almacenamiento de Compass ni se calcularon hashes de contraseñas.

## Procedencia y canal de un solo uso

Directorio privado, fuera de OneDrive y Git:

`C:/Users/luis2/AppData/Local/TwoSides/AtlasIntegrationTests/b054c2c-62e0164dde8948ca83d8d900c9fcd602/`.

RunId: `62e0164dde8948ca83d8d900c9fcd602`.

Receptor SHA-256: `FB6C060EFFE805001494CA9BEF5C058082E631D88066701F5910120AC47A1EAA`.

Sender SHA-256: `B13FC5429F90F42886CA0F0C890745CF936A62192A44FF34557264A3690C34C6`.

Se verificaron en lectura propietario legítimo, Allow limitadas a usuario actual/SYSTEM/Administradores y ausencia de reparse points en ancestros. No cambios de ACL o propietarios. Se crearon únicamente copias revisadas del sender/receptor y un manifiesto no secreto con ocho dependencias, Phase B05.4C.2D.1D, AuthenticationMechanism DEFAULT, AllowWrites false, TlsValidationRequired true y MaxProcedureInvocations 1.

El comando entregado utilizó rutas, parámetros y huella obtenidos de esos archivos. El usuario confirmó su ejecución manual una vez y la salida genérica de canal finalizado. Esa ejecución activó el único procedimiento; el agente no inició otro receptor ni otra conexión. No se reutilizaron directorios, manifiestos o credenciales anteriores.

readonly-attempt.started se creó mediante wx. El sender rechaza resultado/marcador previos antes del prompt; el receptor verifica manifiesto y dependencias antes de consumir credenciales. Marcador y resultado quedan conservados para impedir la repetición. Al terminar, las ocho dependencias y receptor siguen coincidiendo con sus huellas; el sender también conserva la huella revisada. El descubrimiento/monitorización normales del driver no se contabilizan como invocaciones adicionales del procedimiento.

## Resultado real sanitizado

| Comprobación | Resultado |
|---|---|
| Estado | completed |
| Conexión | established |
| Autenticación | accepted-by-driver |
| Destino/base | verified |
| Identidad autenticada | twosides_integration_test en admin |
| Privilegios | Inspección completada: rol único readWrite en two_sides_integration_test; recursos efectivos limitados a esa base conforme a la política |
| ping | ok |
| Topología | Replica set, primary true, tres miembros observados |
| Sesiones | logicalSessionTimeoutMinutes 30 |
| Versión observada | 8.0.34; maxWireVersion 25 |
| Error técnico | Ninguno; errorCode null y privateDiagnostic null |
| Cierre | closed true |
| Escrituras de documentos | **0** |
| Transacciones ejecutadas | **0** |

La cuenta tiene facultades readWrite; **solo lectura describe las operaciones de este procedimiento**, no un rol readOnly. connectionStatus con showPrivileges permitió verificar usuario/roles/acciones sin ejercer escrituras. La política comprobó las acciones previstas y rechazaba recursos ajenos. No se probaron accesos negativos a otras bases ni se utilizó two_sides_db.

Únicos comandos de diagnóstico del procedimiento: connectionStatus, ping, hello y buildInfo opcional. No se crearon modelos/repositorios, colecciones, documentos, índices o migraciones. No syncIndexes, createIndexes, transacciones de escritura, operaciones Godot o envíos reales Outbox. No cambios de usuarios/roles Atlas.

## Limpieza y protección del proyecto

El receptor cerró la conexión; la observación posterior no encontró procesos Node remanentes. El sender libera los buffers/BSTR controlados y dispone su SecureString/proceso; el receptor consume el identificador de un uso y limpia buffers. No se promete borrado garantizado de cadenas inmutables de .NET/JavaScript.

El directorio conserva solo código revisado, preflight-manifest.json, readonly-attempt.started y readonly-result.json sanitizado: cinco archivos, ninguno de credencial. No se borraron marcadores ni se habilitó una repetición. Los directorios sintéticos de pruebas fueron eliminados al terminar. No hubo errores del canal que requirieran recuperación o reintento.

Las tres bases protegidas se compararon antes/después mediante SHA-256, tamaño, mtime UTC, propietario y SDDL, sin SQLite/SQL. **Todos los valores coinciden exactamente.**

| Archivo protegido | Bytes | SHA-256 antes/después | Metadatos y seguridad |
|---|---:|---|---|
| Runtime | 2813952 | 39DECCBA75CB405961BCC03E85C0F8A64542B84585F200FF3F0F64B984B0D197 | Sin cambios |
| Histórica game-progress | 147456 | 74015F29F60F21B90B879B7EB1E6CB8212CF64631C81E69298A4D40428CB064D | Sin cambios |
| Histórica persistence | 147456 | 1CF9B0331B3E088E36415583E987C773C1B71B15472F0EBD95D7478EF56E215F | Sin cambios |

Runtime: local-persistence/.work/runtime-game/save.sqlite3 de la copia. Históricas: game-progress/save.sqlite3 y persistence/save.sqlite3 bajo AppData/Local/TwoSides/ReconstructionTests/copy-06dc7ade-b3cd-425b-8d79-90dde8ef1ac6.

backend/.env no fue accedido ni modificado; no se certifica de nuevo su contenido mediante hash. Sin cambios de Godot, bases, ACL, propietarios, usuarios Atlas, configuración principal, backend de desarrollo o AWS. No acceso al proyecto original.

## Garantías, limitaciones y recomendación

DEFAULT permitió esta conexión autenticada y la inspección de privilegios. **No demuestra la causa del fallo anterior SHA-256/8000**, ya que se introdujo nuevamente el secreto y no se compararon valores. authenticationMechanismRequested registra DEFAULT solicitado; no se ha observado ni se afirma el mecanismo SCRAM realmente negociado. No se realizó una comparación remota adicional con SHA-256.

Autenticación e inspección de privilegios están verificadas por separado. Persistencia, índices, inserciones, idempotencia, recibos, concurrencia, revocación y reinicio MongoDB siguen pendientes; este resultado no valida el adaptador completo. B00 y la coordinación durable de identidad/revocaciones continúan pendientes.

Para D.2 se recomienda primero delimitar y autorizar expresamente las escrituras sintéticas, namespaces nuevos, manifiesto de registros y limpieza exacta, junto con el tratamiento del bloqueo de identidad durable y riesgo B00. No basta habilitar allowWrites ni reutilizar este canal: DEFAULT actualmente rechaza escrituras por política. Esta fase no modifica esa barrera ni autoriza continuar.

**D.1D finalizada. No repetir conexiones. No iniciar D.2, B05.5, Godot o AWS. Esperar instrucciones.**
