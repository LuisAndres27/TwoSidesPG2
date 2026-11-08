# Diagnóstico offline de autenticación Atlas

Actualización B05.4C.2D.1C: el usuario confirma conexión Compass tras introducir manualmente la contraseña actual, con la misma identidad/admin y mecanismo Default. Se preparó una opción DEFAULT limitada a solo lectura y se aprobaron 75 pruebas offline (14 excluidas). No se ejecutó otro intento. Ver [preparación y procedimiento](B05_ATLAS_DEFAULT_AUTH_PREFLIGHT.md). Las secciones siguientes conservan los resultados y límites del diagnóstico anterior; la causa original continúa NO DETERMINADA.

Fecha: 2026-10-28, America/Guatemala. Alcance: copia de pruebas de Two Sides. **Causa del rechazo de autenticación: NO DETERMINADA. No hubo nuevas conexiones remotas.**

## Evidencia disponible

El resultado registrado de B05.4C.2D.1B fue AUTHENTICATION_FAILURE, MongoServerError, código 8000, durante mongoose-connect. No se alcanzó la comprobación de privilegios. Después del primer diagnóstico, el usuario confirmó desde la interfaz de la conexión guardada Two-Sides-Integration-Test: Username/Password, usuario twosides_integration_test, Authentication Database admin, Authentication Mechanism Default, clúster TwoSidesCluster y base two_sides_integration_test. Compass se conectó correctamente con esa configuración. Se incorpora esta evidencia manual sin abrir almacenes, conexiones guardadas ni contraseñas de Compass. Ambos clientes apuntan a la misma identidad nominal; no se ha comprobado ni se intentará comprobar la igualdad de sus secretos.

Se revisaron el sender PowerShell, receptor privado, manifiesto del procedimiento y módulos locales de credenciales/configuración/conector. El sender y receptor del tercer intento conservado coinciden por comparación de archivos con las fuentes revisadas. No se reutilizaron ni ejecutaron esos artefactos consumidos.

## Configuración efectiva y comparación

| Elemento | Node/Mongoose verificado en código y pruebas offline | Compass |
|---|---|---|
| Destino | <cluster>.<id>.mongodb.net | TwoSidesCluster confirmado manualmente; no se inspeccionó la URI |
| Usuario | twosides_integration_test, literal exacto | twosides_integration_test confirmado manualmente |
| Base de aplicación | two_sides_integration_test | Visible según usuario, cero colecciones |
| Base de autenticación | admin, opción explícita | admin confirmado manualmente |
| Mecanismo | SCRAM-SHA-256 explícito | Default confirmado manualmente; mecanismo realmente negociado desconocido |
| TLS | Validación de certificado y nombre habilitada | No inspeccionado |
| Credencial | Entrada manual oculta de un solo uso | No inspeccionada ni extraída |

Las opciones se generan exclusivamente desde las constantes/política Atlas de integración. El receptor no carga dotenv ni selecciona MONGODB_URI. El sender limpia el entorno del hijo y conserva solo SystemRoot, LOCALAPPDATA y NODE_ENV=test. Se revisaron esos caminos sin abrir backend/.env ni consultar su contenido, variables, tamaño o hash. No se usa configuración del backend real.

## Recorrido de la entrada y codificación

1. Read-Host -AsSecureString obtiene la entrada oculta. SecureStringToBSTR y PtrToStringBSTR producen una cadena UTF-16 en memoria; no hay trim, sustitución ni normalización explícita.
2. Encoding.UTF8.GetBytes genera bytes; el frame contiene longitud uint32 big-endian y esos bytes. No se incorpora la contraseña a argv, entorno, archivos ni texto de URI. El sender rechaza vacío, más de 1024 bytes y CR/LF/NUL.
3. El receptor valida longitud, copia los bytes a un identificador opaco de un uso y borra los buffers controlados. No hay percent-decoding ni interpretación de sintaxis PowerShell en la entrada recibida por Read-Host. Las cadenas en memoria de .NET/JavaScript no ofrecen borrado garantizado; no se afirma lo contrario.
4. La factory entrega user/pass como opciones separadas. Mongoose las convierte a auth.username/auth.password y el driver recibe el valor original. **No corresponde aplicar encodeURIComponent a pass:** produciría una contraseña diferente. La codificación porcentual sería relevante si se construyera una URI con credenciales, cosa que este flujo no hace.
5. SCRAM-SHA-256 aplica SASLprep dentro del driver instalado. Esa preparación de protocolo puede normalizar caracteres Unicode; no es una conversión añadida por el canal.

El texto acentuado del prompt puede verse mal en Windows PowerShell 5.1 al interpretar el script UTF-8 sin BOM. Los ensayos con Unicode verificaron que esto no altera por sí mismo los datos sintéticos obtenidos mediante SecureString. No se probó la pulsación/pegado interactivo real ni se verificó el valor introducido en el intento anterior.

## Defecto reproducido y corrección mínima

El TextDecoder anterior usaba fatal:true y el comportamiento BOM predeterminado: eliminaba un U+FEFF inicial. Se reprodujo tanto al consumir directamente el identificador como en el recorrido PowerShell → frame → receptor → Mongoose → opciones del driver. Los demás casos anteriores a ese punto pasaron.

Se cambió únicamente la construcción del decodificador a:

```js
new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
```

ignoreBOM:true conserva U+FEFF como dato de la credencial. No cambia TLS, usuario, destino, authSource o mecanismo. **No se atribuye el fallo de Atlas a este defecto:** se verificó con el mismo paquete SASLprep del driver que una entrada sintética con ese carácter inicial y la entrada sin él producen el mismo resultado de preparación SCRAM-SHA-256. Tampoco hay evidencia de que la contraseña real contuviera ese carácter; no se leyó ni se calculó su hash.

Archivos de la primera revisión: src/modules/sync/atlas-credentials.js (corrección mínima), tests/sync/atlas-credential-channel.test.js (regresión offline) y este informe. En la comparación posterior con Compass solo se ampliaron las pruebas y este informe. No se modificaron de nuevo código de ejecución, sender, receptor, política o credenciales reales.

## Pruebas ejecutadas

Se añadieron tres pruebas: conservación de caracteres y borrado del buffer; conversión/framing reales de PowerShell con Mongoose hasta el límite nativo interceptado; preparación SASLprep del caso BOM.

Ocho entradas exclusivamente sintéticas: ASCII, caracteres reservados de URI y shell, espacios/tabulación, acentos/caracteres combinados/emoji, U+FEFF inicial, U+FEFF interno, secuencias porcentuales literales y límite de 1024 bytes. No se imprimieron sus valores durante la ejecución. El Read-Host de la prueba se sustituye por una fuente sintética SecureString; se extraen del sender las instrucciones de conversión y framing para ensayar su implementación efectiva. No se ejecuta el sender privado ni el receptor que conecta a Atlas.

Cada hijo Node bloquea sockets y las funciones DNS relevantes. MongoClient.connect se intercepta para comparar en memoria las opciones normalizadas y abortar antes de cualquier red. Se comprueba igualdad exacta de la entrada, usuario, authSource y mecanismo. No se inicia autenticación, monitorización, modelos o consultas. Los archivos temporales contienen solamente código y muestras sintéticas; se eliminan al terminar, verificando antes la ruta de limpieza dentro del directorio temporal.

Resultado inicial: ambas pruebas de conservación fallaron únicamente al alcanzar U+FEFF inicial (salida del harness 24, quinto caso). Después del cambio: **65 pruebas aprobadas, 14 excluidas**, en cuatro archivos de pruebas de canal/configuración/lectura/diagnóstico. Tras ampliar el harness para atravesar Mongoose real, se volvieron a ejecutar sus **3 pruebas, todas aprobadas**; no son tres pruebas adicionales distintas. Windows PowerShell 5.1.26100.9711. No se ejecutó el diagnóstico de red anterior.

Comando de regresión offline desde backend:

```powershell
node --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run tests/sync/atlas-credential-channel.test.js tests/sync/atlas.test.js tests/sync/atlas-readonly.test.js tests/sync/atlas-diagnostic.test.js --config vitest.config.js --testNamePattern '^(C\d{2}|D\d{2}|R\d{2}|A(0[1-9]|10|16|2[1-5]|28|3[01679]))\b'
```

## Interpretación y siguiente paso

No se encontró corrupción de caracteres reservados, percent-encoding doble, cambio de usuario ni authSource incorrecto en el recorrido probado. No hay fundamento para cambiar TLS, DNS, firewall, roles o contraseñas automáticamente. El código 8000 clasificado como autenticación no demuestra que falten permisos sobre colecciones.

La confirmación manual de Compass descarta la diferencia nominal de usuario/authSource entre los valores mostrados y los fijados por Node. Sigue sin demostrar que la entrada manual del intento Node sea igual a la utilizada por Compass, que corresponda a su estado actual o que ambos clientes hayan negociado el mismo mecanismo. Un error de escritura/pegado, espacios adicionales, interpretación de secuencias porcentuales o una credencial guardada distinta son posibilidades no verificadas; no se atribuye ninguna al usuario. El canal probado conserva espacios y secuencias porcentuales literalmente. No se leen, comparan ni calculan hashes de secretos reales para resolverlo.

## Comparación de Default con SCRAM-SHA-256 — seguimiento offline

Se revisó la implementación instalada del driver, especialmente node_modules/mongodb/lib/cmap/auth/mongo_credentials.js y node_modules/mongodb/lib/cmap/connect.js. La factory fija SCRAM-SHA-256 y la política comprueba ese mecanismo; no hay selección implícita por entorno ni cambio de authSource.

Se añadieron C04 y C05, que construyen MongoClient sin llamar a connect y ejecutan únicamente resolveAuthMechanism con respuestas hello sintéticas:

| Configuración | Respuesta sintética | Resultado del driver instalado |
|---|---|---|
| DEFAULT | SHA-1 y SHA-256 anunciados | SCRAM-SHA-256 |
| DEFAULT | Solo SHA-1 anunciado | SCRAM-SHA-1 |
| DEFAULT | Sin campo saslSupportedMechs | SCRAM-SHA-256 |
| SCRAM-SHA-256 explícito | Solo SHA-1 anunciado | Conserva SCRAM-SHA-256; no negocia SHA-1 |

En modo DEFAULT el driver prepara la solicitud de mecanismos para admin.twosides_integration_test. Estos ensayos no ejecutan handshake, autenticación ni red. No reproducen una respuesta real de Atlas ni prueban qué driver/versión o mecanismo negoció Compass; Default es una selección de negociación, no evidencia de SHA-1 ni de SHA-256 ya utilizado. Si ambos clientes seleccionaran SHA-256, la diferencia de configuración no explicaría por sí misma el rechazo. Si la identidad solo admitiera SHA-1, una selección predeterminada podría diferir de la fijada; sigue siendo una hipótesis sin evidencia del servidor para ese usuario.

No se demuestra un nuevo defecto de producción con la información disponible. No se cambia el mecanismo a DEFAULT ni a SHA-1 para probar una hipótesis, ni se relaja la política existente. La corrección de conservación de U+FEFF de la primera revisión permanece, con su limitación causal ya indicada. El recorrido SecureString → BSTR → UTF-8 → frame → Mongoose se volvió a probar con las ocho entradas sintéticas, incluidos caracteres reservados. La contraseña continúa fuera de la URI y no necesita codificación porcentual adicional.

Resultado de esta ejecución de seguimiento: **67 pruebas aprobadas, 14 excluidas, cuatro archivos**. Incluye cinco pruebas C01–C05; no se suman a las 65 de la ejecución anterior como si fueran casos distintos. El comando de regresión documentado arriba selecciona también C04/C05. Ningún nuevo intento autenticado, consulta remota, acceso a Compass o diagnóstico DNS/TCP/TLS. No se cambió código de producción en este seguimiento. La causa del código 8000 permanece **NO DETERMINADA**.

La modificación del módulo de credenciales invalida su hash en manifiestos anteriores. Cualquier intento futuro requerirá autorización expresa, receptor/dependencias revisados y un manifiesto/directorio de un solo uso nuevo; no reciclar los canales ya consumidos. Esta revisión no prepara ni activa otro intento.

backend/.env, las tres bases SQLite, Godot, ACL y propietarios no fueron abiertos ni modificados por este procedimiento. No se certifica nuevamente su integridad mediante hashes: se mantuvieron fuera del acceso del diagnóstico. No se modificaron usuarios, colecciones ni datos Atlas. B00 y los riesgos de identidad/revocación durable continúan pendientes. Persistencia MongoDB no validada. Trabajo detenido; no iniciar D.2 ni B05.5.
