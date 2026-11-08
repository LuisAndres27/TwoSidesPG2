# Diagnóstico offline de autenticación Express / Atlas

Fecha: 2026-10-30. **Causa del rechazo real: NO DETERMINADA.** Nueve pruebas offline aprobadas. No se demostró una diferencia de usuario, authSource o mecanismo respecto de la configuración Compass comunicada. No se modificó código de producción ni se cambió SCRAM-SHA-256 por DEFAULT.

## Configuración y recorrido examinados

Archivos revisados: scripts/run-integration-backend.ps1 y .js, src/integration/launcher.js y profile.js, atlas-policy.js, atlas-credentials.js y el clasificador de errores. Se consultó también la implementación instalada del parser/TLS y SCRAM del driver, sin conectarlo.

| Parámetro | Express actual | Compass según confirmación del usuario |
|---|---|---|
| Usuario | twosides_integration_test | twosides_integration_test |
| Base de autenticación | admin, opción authSource | admin |
| Mecanismo | SCRAM-SHA-256, literal obligatorio del perfil | SCRAM-SHA-256 |
| Destino | <cluster>.<id>.mongodb.net / two_sides_integration_test | Clúster/base de integración comunicados; no se extrajo configuración guardada |
| TLS | Validación de certificado y hostname activas | No se inspeccionaron opciones TLS avanzadas ni versión del driver de Compass |
| Fuente de contraseña | Nueva entrada oculta de PowerShell por ejecución | Entrada/configuración de Compass comunicada; secreto no inspeccionado |

No se observa una diferencia demostrada en los tres parámetros de autenticación. La comparación de Compass depende de los valores confirmados por el usuario; no implica acceso al almacén, al proceso o a sus secretos.

El perfil usa URI fija sin usuario/contraseña y entrega `user`, `pass`, `authSource` y `authMechanism` como opciones al driver. **No concatena ni percent-encodea la contraseña en la URI.** Por tanto @, :, /, %, $, comillas o barras en el valor no requieren escape de URI adicional. Teclear una versión escapada de una contraseña en vez de su valor real produciría un secreto diferente.

La ruta analizada no carga dotenv ni MONGODB_URI de backend/.env. El PowerShell borra el entorno del hijo y le entrega únicamente SystemRoot, windir y PATH. El Node nuevo recibe la credencial exclusivamente por stdin. No hay búsqueda de una contraseña anterior en archivos o variables de entorno. Un proceso ya iniciado conserva su configuración/credencial en memoria y no se actualiza automáticamente cuando cambia la contraseña en Atlas.

## Entrada oculta y bytes

Read-Host -AsSecureString produce SecureString. El script copia sus unidades UTF-16 desde BSTR en orden, aplicando `-band 0xFFFF` para evitar el problema de signo en ReadInt16. Codifica esos caracteres en UTF-8 y los transmite con un prefijo binario de longitud de cuatro bytes; no añade newline, no aplica Trim, no cambia mayúsculas ni invierte el orden. Se rechazan explícitamente vacío, más de 1.024 bytes, NUL, CR y LF; no son valores silenciosamente recortados.

La mitigación de BOM de Process.StandardInput ya está implementada: conserva/restaura InputEncoding y escribe la trama con BaseStream. No se sustituyó por escritura textual o JSON. En Node, el decodificador es UTF-8 estricto y preserva un U+FEFF inicial mediante ignoreBOM=true; los handles se consumen una vez y se limpian sus buffers.

El driver aplica **SASLprep** durante SCRAM-SHA-256 (`mongodb/lib/cmap/auth/scram.js`), después de recibir el string. Esa transformación forma parte de su autenticación; no es un escape añadido por el lanzador. Las pruebas de preservación del parser llegan hasta la entrada a connect, antes del intercambio SCRAM. No se ha comparado la implementación/versionado interno de Compass ni demostrado una divergencia de SASLprep con los secretos reales.

Lo validado con fixtures no certifica las pulsaciones, distribución de teclado, pegado, espacios invisibles o valor que se introdujo en los intentos reales. Tampoco prueba que la instancia fallida utilizara el archivo actual y un proceso recién iniciado.

## Compatibilidad instalada y pruebas

Entorno observado: Node 24.19.0, Windows PowerShell 5.1.26100.9711, Mongoose 9.11.2 y MongoDB driver 7.7.0. Mongoose declara mongodb ~7.7; ambos paquetes declaran Node >=20.19.0. El parser instalado acepta las opciones actuales de SCRAM-SHA-256 y TLS. No se instalaron ni actualizaron dependencias.

Se ejecutaron solamente:

- CT01–CT05 de credential-transport.test.js: extracción del bloque real de transporte a una copia desechable, SecureString ficticios, receptor de prueba sin conexión. ASCII, símbolos, espacios, Unicode, pares sustitutos válidos, U+FEFF, combinaciones, límites de tamaño y caracteres prohibidos; ausencia de secreto en argumentos/entorno/archivos de salida y conservación de bloqueos. CT02 contempla páginas 65001/850/1252 cuando la consola permite cambiarlas; su código omite esas variantes si reporta NOCONSOLE, por lo que no se presenta como prueba de cualquier consola interactiva posible.
- IP02–IP03 de integration-profile.test.js: destino/opciones fijos, rechazo de cambios a DEFAULT o producción, handles inválidos/reutilizados, permisos y cierre sobre dobles. No se arrancó servidor HTTP.
- EA01–EA02 nuevos, en express-authentication-offline.test.js: composición real del perfil y parser real Mongoose/driver, interceptando MongoClient.connect **antes de DNS/red**. Se comprobaron usuario/admin/SCRAM, destino, rejectUnauthorized=true, hostname sin callback permisivo y preservación de valores ficticios con símbolos, espacios y Unicode. Dos tramas consecutivas ficticias llegan como dos valores distintos, sin caché anterior. El rechazo de autenticación se simuló; no acredita autenticación real.

Resultado final: **3 archivos de prueba aprobados, 9 pruebas aprobadas y 10 fuera de selección**. Filtro: `CT0[1-5] |^(IP02 |IP03 |EA0[12] )`. Se utilizaron env-guard, envDir=false y fixtures bajo backend/.work/express-auth-offline-<GUID>, con TEMP/TMP propios. La ejecución de subprocesos PowerShell se realizó con escalación autorizada. No se generaron ni consumieron autorizaciones, ni se ejecutó runSyntheticScenario, el servidor de integración real o los arneses C.2/F.2.

En la primera ejecución exploratoria, una aserción nueva dentro del doble esperaba que el driver conservara los nombres tlsAllowInvalidCertificates/tlsAllowInvalidHostnames. El parser los traduce a rejectUnauthorized/checkServerIdentity: la aserción estaba equivocada y el error del propio test quedó clasificado como desconocido. Se trasladaron las aserciones fuera de la función interceptada y se comprobaron las opciones nativas correctas; la ejecución final pasó. También se ajustó el filtro para incluir los nombres CT anidados bajo describe. No se alteró producción para hacer pasar esos casos.

Los hashes internos de CT se calculan exclusivamente sobre datos ficticios y no se usan como comprobación de secretos reales. No se imprimieron ni guardaron hashes de la contraseña del usuario. Ningún test de launcher/diagnóstico que genera autorizaciones se incluyó en esta selección.

## Causas reales aún no descartadas

1. Valor tecleado/pegado distinto del que autentica Compass: contraseña anterior, espacio accidental conservado, teclado, carácter visualmente parecido o valor escapado. No se ha leído ninguno de esos secretos y no se atribuye esta causa como hecho.
2. Instancia Express/PowerShell previa o copia diferente del lanzador; el proceso puede retener un valor anterior a la rotación. Las pruebas confirman frescura con tramas nuevas en el código actual, no la procedencia del proceso que produjo el log.
3. Conexión Compass a un destino/opción avanzada diferente de lo comunicado, o resultado observado en momentos distintos de la actualización. No se ha medido propagación del cambio ni se afirma un retraso de Atlas.
4. Diferencias del cliente Compass, entrada interactiva o normalización SCRAM ante valores Unicode particulares. No se demostró incompatibilidad del parser instalado; tampoco se compararon ambos clientes con un secreto común verificado.

El log mongoose-connect / AUTHENTICATION_FAILURE es compatible con rechazo de autenticación antes de inspeccionar permisos o esquema. Los 500–700 ms por sí solos no identifican cuál de estas causas es correcta. No permiten diagnosticar roles insuficientes, índices, IP o TLS como causa sin evidencia adicional; no se cambiaron esos controles.

## Comprobación local y procedimiento independiente

Sin leer un secreto de Compass, el programa no puede demostrar automáticamente que una entrada de PowerShell sea igual al valor que Compass conserva o utilizó. Que Compass conecte no revela ese valor. No se implementará una extracción, comparación por hash persistente o impresión de longitud de un secreto real para suplir esa limitación.

Es posible diseñar un proceso local sin red con dos entradas ocultas, comparación ordinal de sus bytes UTF-8 exclusivamente en RAM y una salida booleana IGUALES/DISTINTAS. Sin hashes, archivos o logs de los valores; buffers limpiados al finalizar y cierre del proceso. Esto demostraría solo igualdad entre esas dos entradas, **no igualdad con Compass**. No se creó ni ejecutó un nuevo capturador de contraseñas reales en esta fase. SecureString y limpieza de buffers tampoco garantizan borrar todas las copias del sistema.

Procedimiento manual mínimo para una futura comprobación autorizada:

1. Identificar en el gestor de contraseñas bajo control del usuario una única entrada vigente para el usuario y host de integración. Evitar reconstruirla de memoria, aplicar escape de URI o compararla mediante hashes. No enviarla al chat.
2. Mantener confirmados en ambos clientes el usuario twosides_integration_test, admin, SCRAM-SHA-256 y el mismo host. No extraer el secreto guardado de Compass para comprobarlo; el usuario puede volver a introducir el valor de esa misma fuente en su prompt.
3. Cerrar la instancia anterior de Express y usar el lanzador revisado desde una consola nueva cuando exista autorización para otra conexión. Introducir el valor exacto de la misma fuente, sin preescaparlo ni añadir comillas como parte del valor.
4. Si se necesita aislar autenticación, autorizar por separado un único intento acotado de autenticación/lectura, sin preparar colecciones ni ejecutar el escenario sintético. Registrar solo categoría/etapa/cierre. No ejecutar automáticamente un segundo intento ni cambiar SCRAM por DEFAULT si falla.

**Correcciones de producción: ninguna**, porque no se demostró un defecto que explique el rechazo real. Únicos archivos nuevos: pruebas EA e informe; fixtures desechables de pruebas. Sin acceso a .env, SQLite real, Godot, ACL, C2Runtime o credenciales Compass. Sin cambios de autorización, contraseñas o mecanismos. B00 permanece pendiente. **Detenido antes de toda conexión real.**
