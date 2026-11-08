# C.2 Windows — Resultado del cierre de límites operativos

Fecha: 2026-10-29. **Límites operativos COMPLETADOS EN CÓDIGO, verificados offline.** No se valida ejecución real de Atlas. C.2 permanece deshabilitada, B00 abierto, F.2 bloqueada y B05.5 no iniciada.

## Alcance y evidencia

Se revisaron B05_C2_WINDOWS_FUNCTIONAL_PREFLIGHT_RESULT.md, B05_C2_WINDOWS_EXECUTION_PLAN.md, B05_DURABLE_REVOCATION_ATLAS_SCHEMA_RESULT.md y el arnés real. **B05_C2_HARNESS_FIX_RESULT.md no existe** en la ruta solicitada; no se creó ni se usó como evidencia.

La revisión se limitó al supervisor, admisión de clientes/sesiones, transacciones, presupuestos, reintentos y cierre/limpieza C.2. Se contrastaron atlas-integration.js, atlas-policy.js, mongo-identity-repository.js, mongo-ingestion-repository.js y budget.js. Para compatibilidad se consultaron el código/tipos del driver MongoDB 7.7.0 y la normalización de opciones de Mongoose 9.11.2 instalados. No se hizo otra auditoría general.

El fence, esquema fijo, executionId y limpieza de 16 filas ya corregidos se conservaron. No se volvió a crear ninguna estructura ni se cambió el adaptador productivo.

## Problemas confirmados

- La comprobación del reloj anterior no interrumpía esperas ni I/O y no cerraba recursos al vencer el plazo.
- El techo de tres conexiones se comprobaba al cerrar, después de abrir; faltaba reserva previa y control de la fábrica.
- El repositorio cerraba sesiones en finally, pero sin admisión global, cupo de vida o cierre acotado. Un error de endSession podía ser absorbido por un catch histórico.
- El driver crea sesiones implícitas además de las explícitas que solicita Mongoose. Contar solo las de connection.startSession dejaba un hueco.
- La configuración genérica conservaba retryWrites=true. Los controles C.2 necesitaban opciones específicas sin alterar los modos históricos.
- Un 503 de commit desconocido requiere conservar la incertidumbre y detener nuevas etapas; no constituye una prueba de rollback.

## Implementación y archivos

Nuevos:

- backend/scripts/durable-revocation-runtime.js.
- backend/tests/sync/durable-revocation-operational.test.js.
- Este informe.

Actualizados:

- backend/scripts/durable-revocation-atlas-harness.js.
- backend/tests/sync/durable-revocation-atlas-preflight.test.js.
- backend/docs/B05_C2_WINDOWS_EXECUTION_PLAN.md.

No se modificaron repositorios reales de identidad/ingesta, esquemas, política Atlas, auxiliares históricos ni lanzadores. No se creó un receptor ni un canal.

La fábrica es inyectada, sin implementación de red por defecto ni recepción de credenciales. El preflight, registros, actores, reapertura, inventario y limpieza se ligan al supervisor del plan. Clientes Atlas no administrados se rechazan; solo se admiten directamente dobles con nombre sintético y destino loopback sin credenciales.

Huellas puntuales posteriores a las correcciones:

| Archivo | SHA-256 |
|---|---|
| scripts/durable-revocation-runtime.js | C9E097486F9F457BB116CE9345D86E4681F58B7ADFCD2413CE409CA3DFD11CBA |
| scripts/durable-revocation-atlas-harness.js | 05F0FB304D3E9DA248B56B24C4284D865A4082474507F2C828D6EF95F8294889 |

Las huellas proceden del árbol modificable. No certifican procedencia, privacidad ni ausencia de sustitución y no cierran B00.

## Supervisor y cancelación

El presupuesto global es 120000 ms desde la creación del plan, incluyendo registro y preparación, no solo A/B/C. Se reservan 4000 ms dentro de ese total para las dos fases de cierre: se deja de admitir trabajo a los 116000 ms. Abort y endSession tienen hasta 2000 ms por fase; los clientes se cierran en paralelo. Cada escenario mantiene un máximo de 30000 ms. El I/O y las transacciones conservan un plazo de 10000 ms y el commit de 1000 ms.

El supervisor tiene timer real, control monotónico de admisión, AbortController, seguimiento de promesas originales y shutdown: solicita abortTransaction, endSession y close(true). Las lecturas compatibles reciben signal. Las escrituras no reciben una opción de cancelación que su API no soporte. Al vencer, bloquea nuevos escenarios, sesiones, transacciones, queries y commits aún no enviados. La salida contiene únicamente motivos fijos, contadores y estados; no mensajes originales o stacks.

No se considera suficiente rechazar una Promise.race. Por eso la operación original sigue registrada hasta que termina, aunque la espera del llamador ya haya fallado. Si había una escritura/commit pendiente al detenerse, uncertain permanece true incluso si la promesa termina más tarde. Un cierre colgado o fallido se registra como fallo; no se declara que liberó recursos.

Limitación real: un write o commit que ya llegó a MongoDB puede confirmar tarde. Cancelar la espera, abortar o cerrar el cliente no prueba rollback. Tampoco se fuerza la terminación del proceso Windows ni se interrumpe código síncrono que bloquee el event loop. Una operación nativa que ignore cancelación puede seguir pendiente después de devolver el resultado acotado del supervisor; queda indicada como pendiente/incierta y se intenta cerrar cualquier recurso devuelto tarde. No se afirma un límite físico sobre ese trabajo del servidor o la vida del proceso en esas condiciones. La ejecución solo puede considerarse satisfactoria con cero pendientes, incertidumbre falsa y cierre confirmado.

## Clientes y pools

La admisión reserva antes de invocar la fábrica, también para aperturas concurrentes. Hay un máximo de **tres clientes lógicos durante toda la ejecución**, incluidas aperturas fallidas. No se recupera un cupo para abrir clientes extra. Se exigen clientes independientes; la tercera apertura se reserva para la reapertura del escenario.

Opciones fijadas y comprobadas después de abrir: usuario/base/host previstos, admin, DEFAULT, TLS estricto, maxPoolSize=2, minPoolSize=0, maxConnecting=1, retryReads=false, retryWrites=false y timeoutMS=10000. El preflight existente verifica además los permisos efectivos. La política de datos C.2 continúa sin admitirse; estas funciones no conceden autorización remota.

maxPoolSize acota cada pool por servidor y cliente. No limita la creación de clientes ni representa el total de sockets, especialmente los de monitorización. El cupo de tres clientes lo aplica otro contador antes de la fábrica. Los controles se aplican a la ruta administrada; no son un sandbox contra código modificado que construya clientes por otra ruta.

Los dos clientes principales se reutilizan entre los escenarios previstos para conservar actores independientes. Cada transacción termina y cierra su sesión; no se confunde ese cierre con destruir los clientes entre A/B/C. La reapertura se cierra tras su comprobación y los principales se cierran al terminar o fallar.

## Sesiones, transacciones y reintentos

Hay hasta **dos ClientSession explícitas y dos implícitas simultáneas** en toda la ejecución: máximo combinado cuatro. Los techos de creación son 18 explícitas y 256 implícitas, sin reponer contadores de vida. Las tres sesiones de identidad almacenadas son documentos y no estos recursos del driver.

El supervisor intercepta tanto connection.startSession de Mongoose como MongoClient.startSession. AsyncLocalStorage identifica la apertura explícita que Mongoose delega al driver y evita contarla dos veces. Esta identificación solo transporta contexto de admisión: no serializa owners ni sustituye el guard durable.

Los cupos se reservan antes de abrir, incluidos intentos simultáneos. Un error al abrir libera la reserva que corresponda y falla cerrado. endSession es idempotente; solo un cierre reconocido libera el cupo. Un cierre fallido queda registrado aunque el repositorio absorba su excepción. Una sesión devuelta después del timeout se cierra y no se admite para transacciones. El cliente cerrado tampoco puede abrir otra sesión.

Las sesiones explícitas solo inician/confirman transacciones dentro del withTransaction supervisado. Se preserva la ClientSession original y su propagación a identidad/ingesta. Se permiten hasta tres callbacks y hasta tres invocaciones nativas de commit por transacción; al exceder el límite de commit se marca incertidumbre y se detiene. Reintentos de commit no repiten el efecto de aplicación; los labels transitorios se conservan para el driver. No se convierten todos los errores en rechazos permanentes.

Dentro de withTransaction con CSOT, el driver 7 rechaza un timeoutMS explícito por operación. Las queries/writes supervisadas heredan el timeout transaccional; fuera de él se fija el timeout de I/O. Se verificó esa diferencia contra resolveOptions del driver instalado. No se cambiaron snapshot, majority+journal, validación durable ni la lógica de recibos.

Estos cupos son de ClientSession del proceso administrado; no se afirma que desaparezcan inmediatamente los identificadores/cache de sesión mantenidos por el servidor.

## Incertidumbre y limpieza

assertCleanup rechaza si hay una escritura original pendiente, el runtime está detenido o la incertidumbre quedó marcada. El flag no se borra por una resolución tardía. Solo A/B/C y reapertura satisfactorios permiten capturar y comparar el inventario completo antes de borrar.

La limpieza mantiene su transacción, filtros de ID/owner exactos y omisión del fence. El caso completo sigue eliminando 16 filas propias y conservando el fence con su revisión final, las doce colecciones y sus índices. Si el propio commit de limpieza fuese incierto, se informa así, sin declarar ausencia de efectos ni repetir la limpieza.

El resultado final expone pendingOperations, pendingWrites, activeSessions, closeFailures y uncertain. closed significa reconocimiento de cierre de los recursos registrados; por sí solo no prueba rollback ni prevalece sobre pendientes/incertidumbre. Un fallo de recursos impide completed=true.

## Evaluación de los tres casos antes excluidos

| Caso y archivo | Riesgo cubierto / exclusión anterior | Evaluación y resultado actual |
|---|---|---|
| DR16 — another real Node process executes revocation on snapshot double before parent commit; tests/sync/durable-revocation.test.js | Independencia entre procesos y revocación antes del commit; excluida antes para evitar proceso hijo en la selección | Worker revisado: IPC, snapshot doble y JWT sintético, sin Atlas/ACL/archivos protegidos. El sandbox dio 503; un sondeo sin secretos confirmó spawn EPERM al pedir IPC, mientras un hijo sin IPC funcionó. Se autorizó por herramienta la ejecución individual fuera del sandbox: **1 aprobada**, sin modificar su expectativa 401. No prueba MongoDB real. |
| A20 — protected env/SQLite access is blocked before filesystem IO; tests/sync/atlas.test.js | Verificar las guardas frente a rutas protegidas; antes se excluyó incluso el intento negativo | Se revisaron env-guard/isolation-guard: rechazan antes de invocar el filesystem original. **Reincorporada y aprobada**. No se abrió ni leyó .env o SQLite. |
| A36 — manual launcher refuses without future D authorization before prompting; tests/sync/atlas.test.js | Rechazo temprano del lanzador histórico; excluida por su código de consultas ACL | **Permanece excluida**: el canal histórico está consumido y no forma parte del ejecutor nuevo. No se ejecutó ese PowerShell. OL19 comprueba rechazo del entrypoint C.2 antes de llamar a un conector o evaluar un getter de credencial. No se afirma que esto vuelva a validar el lanzador histórico. |

A36 no elimina una garantía necesaria de esta ruta: el futuro canal requerirá su propio lanzador revisado y autorización independiente. No se relajó ni modificó el auxiliar para poder ejecutarlo.

## Pruebas y regresiones

**187 pruebas únicas aprobadas: 29 nuevas y 158 regresiones; una exclusión mantenida (A36).** El pase principal final aprobó 186 con DR16 y A36 fuera de su selección; DR16 fue aprobada en el pase individual descrito. Los pases focalizados/intermedios no se suman otra vez. En el pase individual, las otras 40 pruebas del archivo estaban fuera de selección, no fallidas.

Comando principal desde backend:

```powershell
node --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run --config vitest.config.js --configLoader native --pool threads tests/sync/durable-revocation-operational.test.js tests/sync/durable-revocation-atlas-preflight.test.js tests/sync/durable-revocation.test.js tests/sync/mongo.test.js tests/sync/atlas.test.js --testNamePattern '^(?!DR16 |A36 )'
```

Comando individual DR16, ejecutado fuera del sandbox únicamente para permitir IPC:

```powershell
node --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run --config vitest.config.js --configLoader native --pool threads tests/sync/durable-revocation.test.js --testNamePattern '^DR16 '
```

Las 29 pruebas OL cubren vencimiento global en espera/transacción, trabajo que continúa tras timeout, incertidumbre persistente, cupos de clientes y pools con parser real, opciones/destino incorrectos, cupos simultáneos/de vida de sesiones, errores y aperturas tardías, cierre fallido/colgado, bloqueo de limpieza, cancelación compatible, transacción manual rechazada, commit no enviado tras cancelación, sesiones implícitas, conteo Mongoose/nativo sin duplicación y reintentos de commit sin repetir el callback de aplicación.

Las regresiones cubren inventario fijo/executionId, fence conservado, limpieza exacta/rollback, ambos ganadores de revocación, labels/reintentos, recibos históricos, identidad/owner ajenos, reapertura y rechazo de destino. RC16 ahora exige que una revocación pendiente no escriba después de detenerse por commit incierto de ingesta; el hecho ya confirmado por el doble se conserva, sin asumir rollback. RC24 exige además cero sesiones/operaciones pendientes y cierre correcto del supervisor.

En pases intermedios se detectaron y corrigieron: carrera de clasificación entre timer global y timer I/O; uso incorrecto de opciones Mongoose directamente contra el parser nativo en un test; doble incompleto de sesión al verificar resolveOptions; y expectativa antigua de RC16 que permitía continuar una revocación después de detectar incertidumbre. No se relajaron los asserts para ignorar el fallo. El sondeo/ejecución DR16 dentro del sandbox falló por su restricción IPC y se registró arriba; el resultado final individual pasó.

No hubo errores no manejados en el pase final. Node --check pasó para los dos scripts y los dos archivos de pruebas modificados/nuevos. No se lanzó la batería completa ni private-workspace.ps1. envDir=false y las guardas se conservaron; algunos casos de API usaron exclusivamente HTTP loopback efímero con datos sintéticos. La prueba del parser intercepta MongoClient.connect antes de DNS/sockets; los otros clientes son dobles.

## Criterios, riesgos y siguiente autorización

| Criterio | Evidencia offline |
|---|---|
| No iniciar trabajo tras vencimiento | Guardas de admisión, timer, signal y pruebas OL01/02/23 |
| Cupos de clientes, pools y sesiones reales de la ruta | Reserva previa, opciones verificadas, interceptores Mongoose/nativos; OL05–10/20/24–27 |
| Cierre correcto o fallo explícito acotado | endSession/finally, abort y close; OL10–17, RC24 |
| Incertidumbre sin limpieza insegura | Registro de promesa original, flag persistente y assertCleanup; OL03/04/13/28, RC16/29 |
| Regresiones y conservación del fence | Pase final y RC18/20/21/24/30 |
| Cero Atlas/recursos protegidos | Conectores doblados/interceptados, selección revisada y guardas; sin canales o cambios de permisos |

**B00 permanece abierto.** No se inspeccionaron ACL ni propietarios en esta etapa. Los riesgos de código/dependencias modificables y procesos de la misma cuenta no se resuelven con estos cupos ni con hashes. No se creó aislamiento Windows ni se certificó un futuro directorio privado.

Para C.2 real faltan autorización independiente, capacidad Atlas de datos C.2 revisada (sin reutilizar D2E/schema-only), composición exclusiva con el supervisor, revalidación remota de inventario/fence/índices antes de escribir y un canal nuevo cuya integridad y privacidad puedan justificarse frente a B00. No se preparó ni solicitó una contraseña.

No se conectó MongoDB, se alteraron estructuras Atlas ni se usó two_sides_db, twosides_backend o datos reales. No se abrieron .env ni las tres bases SQLite, no se recalcularon hashes protegidos, no se modificaron Godot, ACL, propietarios o usuarios. El resultado acredita controles de código y dobles; no acredita carreras, cancelación o durabilidad reales del servidor. C.2, F.2 y B05.5 siguen detenidas.
