# B05 C.2 — construcción de release activable, bloqueada

Fecha: 2026-10-29. **LISTO PARA REFERENCIA EXTERNA.** Construcción y pruebas offline completadas. La nueva release no está activada: no hay autorización de conexión ni manifiesto remoto válido. B00 pendiente, C.2/F.2 sin ejecutar, B05.5 no iniciada.

## 1. Nueva release y sellado

```text
C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\c2-22fa685aef680f59de7e52427a42d647
```

Inventario exacto: **1.894 archivos de payload**, incluidas las mismas **23 dependencias / 1.858 archivos de dependencias** fijados y contrastados con la release anterior. No se instalaron paquetes ni ejecutaron scripts npm. Raíz limitada a package, manifest.json, runs y temp; los dos últimos están vacíos después del sellado.

SHA-256 completo del manifiesto, referencia del inventario y configuración de esta release:

```text
0A8C7D973CE35BFD31D697C5E87B9432D7AC591D1BFBE93E3DCD882F83AA7579
```

SHA-256 de la descripción ordenada del payload:

```text
259C2336A32F7AE0253487FFAF00C09E5AA5861BE59F4C22E64BE16CA72FB29F
```

El manifiesto no contiene su propio hash, evitando una autorreferencia imposible: el digest esperado se suministra desde una referencia externa. La descripción de payload se forma en el orden del inventario como ruta UTF-8, NUL, SHA-256 en mayúsculas y LF por archivo. Se valida tanto en JavaScript como PowerShell, además de cada archivo individual.

Resultado real del nuevo verificador:

```text
C2_ACTIVATABLE_REFERENCE_CHECK=PASS files=1894 mode=c2-blocked
Digest comparison only; B00 and external provenance are not certified. No activation performed.
```

Este PASS utilizó el digest local de construcción; **no se presenta como verificación externa**. El PASS externo anterior de 1.895 archivos pertenece a D4A5… y no certifica este inventario nuevo.

## 2. Diferencias acotadas

Se reutilizaron receptor, lectura oculta, transporte, conexión Mongoose, repositorios, política C.2, arnés, supervisor y limpieza existentes. No se reconstruyeron esos componentes ni se modificó la política del backend normal. La política y el adaptador incluidos se copiaron de los bytes ya verificados de la release anterior.

| Archivo de la nueva copia | Cambio y SHA-256 |
|---|---|
| scripts/c2-receiver-core.js | Vinculación release/inventario y temporal por run. BACE3274075C1F2197531C901FF8F1540DFCDC1C502B69EC028D5E4C92A89BEF |
| scripts/c2-receiver-entry.js | Pasa el releaseId efectivo a la comprobación del permiso. 6DBC4E7837F732207FD8907ADDDBFF9C2469E99913240A8902781C8FA5210E02 |
| scripts/c2-receiver.ps1 | Comprueba vinculación, ausencia de runs previos y crea/verifica temporal después de reservar intento. 7033A154CF7A69ACA90E7707AB5AB120CB8812EE013F339C05E4AADE3C132187 |
| scripts/c2-activatable-verify-reference.ps1 | Nuevo verificador de lectura del formato bloqueado y del eventual formato remoto, sin activar ni recibir entradas. 8613935B3C844AAEB0840BC4CB41EE2B1DFE4D95BE0C860E12B98FA3FA1D8504 |
| scripts/c2-activation-template.json | Especificación incompleta, no utilizable para conectar. 4940D5B1B4C4D22BB88EDF501FEF23EC18AD4B1970346AD273F0476F137CA5E2 |

Se excluyeron solo de la nueva copia tres herramientas históricas que no son necesarias para su ejecución: c2-final-verify-reference.ps1, c2-windows-offline-entry.js y c2-windows-offline.ps1. Permanecen intactas donde existían. La cuenta de archivos resulta de 1.895 anteriores − 3 + 2 nuevos = 1.894; tres archivos existentes se actualizaron.

En el workspace se actualizaron esos tres scripts C.2, se añadieron los dos archivos nuevos, se adaptaron los fixtures de c2-receiver.test.js, c2-final-release.test.js y c2-receiver-activation.test.js y se añadió c2-activatable.test.js. Las únicas escrituras adicionales fueron documentación, referencia sin secretos y temporales de preparación. No se alteraron repositorios de identidad/ingesta, esquema o mecánicas del juego.

## 3. Conexión y capacidad C.2

La fábrica real Mongoose está incluida, importarla no conecta. Solo puede invocarse por la composición revisada tras una activación válida; la release entregada no la proporciona. Destino fijo: <cluster>.<id>.mongodb.net, twosides_integration_test, two_sides_integration_test, admin, DEFAULT, TLS estricto. No hay parámetros de destino ni lectura de .env. No se usa twosides_backend, two_sides_db o una cuenta administrativa.

La capacidad C.2 queda limitada por política a B05.4C.2F.1C.2 y al ámbito de esquema 10ef4f6d653f4ee4a1d1b2e6591013c2; no se habilitó el backend normal. Los controles de cliente, identidad autenticada y permisos efectivos se conservan antes de escribir. Catálogo completo de doce nombres, ocho modelos, cinco índices secundarios y fence inicial exacto deben coincidir; las otras siete colecciones C.2A deben estar vacías. No se crea esquema ni se adopta una revisión distinta del fence.

## 4. Manifiesto de un solo uso: preparado, no activable

Estado efectivo del manifest.json entregado:

```text
version = 2
mode = c2-blocked
remoteEnabled = false
activation = null
```

La plantilla tiene releaseId, payloadSha256, executionId y fechas nulos, mode c2-blocked y remoteEnabled false. No asigna un run ejecutable ni una ventana vigente. No se generó ni entregó un manifiesto remoto válido para esta release; los fixtures positivos de pruebas usan código/datos ficticios y no constituyen una activación de la copia sellada.

Para el futuro, lanzador y núcleo exigen coincidencia con la ruta/releaseId y descripción criptográfica del payload; digest explícito del manifiesto; mode c2-remote-once y remoteEnabled true; run exclusivo, ámbito C.2A y escenarios exactamente A/B/C; ventana positiva de máximo cuatro horas. El permiso opaco del arnés queda ligado al run y vencimiento.

El lanzador reserva el run con marcador exclusivo antes de pedir entrada. Un intento cancelado o fallido queda consumido. Se rechaza un run ya existente y cualquier otro residuo en runs de esa release. El receptor tiene además su propio marcador exclusivo. No hay generador automático que rellene la plantilla ni que obtenga un digest local como sustituto de la referencia externa.

## 5. Entorno, temporal y acceso

El hijo recibe solo LOCALAPPDATA, NODE_ENV, PATH, SYSTEMDRIVE, SYSTEMROOT, TEMP, TMP y WINDIR, tras borrar el entorno heredado. Se conservan los rechazos de variables capaces de sustituir módulos, bibliotecas, certificados, proxies o configuración MongoDB. Contraseña futura solo por lectura oculta y stdin anónimo; nunca argumentos, entorno, archivos o logs.

TEMP/TMP serán exactamente **runs/executionId/temp dentro de la release autorizada**. El lanzador lo crea después del marcador y verifica su ACL antes del prompt. El núcleo comprueba de nuevo ruta exacta, padres normales sin enlaces y temporal vacío. El temp de la raíz se conserva vacío como parte del inventario; no se utiliza como temporal del receptor ni se usa el Temp general de Windows.

Se comprobaron atributos y ACL en lectura de **2.084 objetos nuevos**: cero escritores inesperados, cero SID prohibidos y cero propietarios inesperados. Se admitieron usuario actual, SYSTEM y Administrators según las condiciones ya documentadas. No se copiaron ACL del proyecto ni se cambiaron permisos/propietarios. Es una comprobación acotada de objetos nuevos, no una repetición de la auditoría de B00 ni una certificación del sistema operativo.

## 6. Supervisión y limpieza conservadas

Se mantienen A/B/C, tres actores, hasta tres clientes de vida, dos trabajos simultáneos y ocho envíos (2/2/4). Sesiones: dos explícitas y dos implícitas simultáneas como cupos separados; totales de vida 18 y 256. Pool de dos por servidor/cliente, maxConnecting=1, sin retries automáticos de lecturas/escrituras del driver. Hasta tres callbacks/intentos de commit supervisados por transacción.

120 s globales desde el plan, 116 s para admitir trabajo y 4 s reservados para cierre; 30 s por escenario, I/O/transacción 10 s, commit 1 s y barrera 1 s. No son garantía física de rollback ni de cancelación del servidor. Timeout, cancelación, conexión fallida, límites agotados y commit incierto detienen etapas nuevas y provocan cierre supervisado y resultado sanitizado. Las promesas originales siguen contabilizadas; una escritura pendiente bloquea limpieza aunque la espera del llamador haya terminado.

Limpieza solo después de A/B/C y reapertura satisfactorios, inventario ligado a IDs/propietarios del executionId, sin incertidumbre o escrituras pendientes. Se relee y compara en transacción snapshot y se usa deleteOne con IDs exactos. Inventario esperado: 17 filas incluyendo fence; **16 propias eliminables**, conservando siempre el fence y su revisión avanzada, índices y estructuras históricas. El techo defensivo de 24 filas no amplía ese permiso. Ante fallo se conservan restos para conciliación posterior autorizada.

La ausencia de otra ejecución incompatible requiere además confirmar el estado operativo antes de la futura autorización. Que runs esté vacío y el fence/inventario inicial coincidan no demuestra ausencia de un proceso externo aún sin commits; no se autorizan ensayos paralelos desde otras copias. Un run previo incierto exige conciliación, no borrar marcadores ni resetear fence.

## 7. Pruebas offline y diferencias de ejecución

Selección relacionada de seis archivos de pruebas: receptor, activación, composición final, preflight durable, supervisor y c2-activatable. Resultado final conjunto: **103 aprobadas y 2 omitidas** (RX17 de la release offline histórica y AC04 que requiere la copia desechable nueva). AC01–AC03 cubren hash de payload/release/digest externo, plantilla bloqueada y temporal de run.

Después se ejecutó AC04 sobre una copia desechable completa marcada, nunca sobre la candidata: PASS de su verificador, rechazo de digest incorrecto, rechazo del lanzador bloqueado antes del prompt/run, alteración sintética detectada y restauración exacta. Resultado final **AC04 aprobada**. Total de casos distintos aprobados: **104**; no se suman sus repeticiones ni los PASS interactivos históricos.

El primer AC04 agotó el límite predeterminado de prueba de 15 s al hacer varias verificaciones secuenciales de 1.894 archivos. Se fijaron 60 s para esa prueba y se repitió únicamente AC04: aprobada. No se ampliaron los límites del arnés remoto. Un primer comando de construcción tuvo un error de comillas antes de ejecutar código/crear archivos; se corrigió y se construyó una sola candidata final.

Se probaron rechazo sin activación, manifiestos inválidos/expirados, destino diferente, digest erróneo, reutilización, credenciales ausentes/malformadas, entorno, temporal, cupos, reintentos, incertidumbre, limpieza exacta, fence, cierre y ausencia de secretos en salida. Dobles e interceptación del límite nativo impidieron red en los casos de conexión. No se entregaron contraseñas reales. A36 y private-workspace.ps1 no se ejecutaron. Sintaxis JS y PowerShell comprobada.

Fixtures en `C2Runtime/stage-activatable-58f6223cc8d48ae3e9a791fce87174a5/tests`. Copia desechable c2-da0d2a71a180c1149499e2b31913ed18 eliminada después de verificar ruta exacta, marcador y ausencia de enlaces. No hubo pruebas mutables sobre la candidata ni las releases anteriores.

## 8. Releases anteriores conservadas

Se capturaron y compararon instantáneas completas antes/después: rutas, contenido SHA-256, tamaños y fechas de modificación.

| Release | Objetos | Resultado |
|---|---:|---|
| c2-67d95728399e4e30a406eba7301979fd | 2779 | Sin cambios |
| c2-19dcfa4b88b64813a334cc8ef2cc48ea | 2085 | Sin cambios |

No se afirma conservación de fechas de último acceso. Sus manifiestos y referencias anteriores no se sobrescribieron.

## 9. Nuevo paquete de referencia y condiciones pendientes

Paquete **local** preparado a las 2026-10-29T21:10:31.418Z:

```text
backend/docs/c2-reference/c2-22fa685aef680f59de7e52427a42d647-20261029T211031Z/
```

Cinco archivos: manifest.json (copia exacta), manifest.sha256.txt, verifier.sha256.txt, reference.json e INSTRUCCIONES.md. Incluye únicamente integridad, identificador/ruta/fecha y procedimiento de lectura, sin secretos. No se subió automáticamente ni se reutilizó el digest D4A5… como referencia nueva.

Pendiente: guardar y recuperar este paquete desde la nube; comparar sus cinco archivos; verificar la candidata usando el digest recuperado y el nuevo verificador. El hash local actual no acredita independencia ni procedencia histórica.

Después se requerirá autorización independiente para preparar un manifiesto remoto concreto, con otro digest, run/ventana y referencia revisados antes de cualquier secreto. La aceptación de riesgos no equivale a autorizar una ejecución. No se entrega aquí comando de activación ni se pide contraseña.

B00 sigue pendiente: riesgos de procesos de la misma cuenta, dependencias y sustitución anterior a los controles, referencia sincronizada y exposición de memoria. Node.js/MongoDB pueden conservar copias del secreto hasta terminar el proceso; no se promete borrado completo. Antes de ejecutar se acordará rotación manual posterior de la contraseña de integración, incluso tras fallo, sin modificar otros usuarios ni conceder limpieza adicional.

## 10. Detención

Sin conexiones Atlas, ni siquiera de lectura. No se ejecutaron C.2/F.2 ni operaciones reales Godot. No se accedió a backend/.env, SQLite o Godot, ni se cambiaron ACL, propietarios, usuarios Atlas, bases o colecciones remotas. No se generó activación remota válida, no se solicitaron credenciales reales y no se inició B05.5.

**LISTO PARA REFERENCIA EXTERNA. Release bloqueada. Detenido hasta nueva autorización explícita.**
