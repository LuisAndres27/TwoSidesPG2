# B05 C.2 — propuesta de autorización de una ejecución única

Fecha: 2026-10-29. **Propuesta preparada; ejecución NO autorizada ni activada.** Este documento no es un manifiesto ejecutable. B00 pendiente, F.2 bloqueada y B05.5 no iniciada.

## 1. Punto de partida y evidencia

Revisados B05_C2_EXTERNAL_REFERENCE_VERIFICATION.md, B05_C2_RELEASE_FINAL_REVIEW_RESULT.md y B05_C2_FINAL_RELEASE_PREPARATION_RESULT.md. Se contrastaron únicamente los límites, preflight, escenarios y limpieza del código existente; no se repitió la auditoría ni las pruebas anteriores.

La referencia externa quedó registrada como **VERIFICADA en integridad: PASS, 1.895 archivos, código 0**, a las 2026-10-29T20:50:41.5087888Z, usando el digest leído de `C:\Users\luis2\OneDrive\Desktop\DESCARGA NUBE\hash\manifest.sha256.txt`. Los cinco archivos coinciden con el original. Su procedencia desde la nube está confirmada por el usuario, sin observación directa del servicio.

Release de partida, que se conservará intacta:

```text
C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\c2-19dcfa4b88b64813a334cc8ef2cc48ea
```

Manifiesto offline: `D4A5ED8A8C0C61FFD59F60B30EEB4B678BBA3FCC7A9B3E42651A8B0727AD2AF8`. Verificador offline: `9A9BE545381CBFF315317CBA3769077BB2ADFE9C48EF572A178C28EA5796C77E`. Estos valores no autorizan un manifiesto activable diferente.

## 2. Riesgos residuales que requieren aceptación expresa

- B00 sigue abierto. La cuenta Windows y procesos con sus permisos pueden atacar código o referencias antes de las comprobaciones, observar memoria o manipular marcadores. Los hashes y handles de lectura mitigan sustitución, sin aislar toda la cuenta ni el sistema.
- La referencia recuperada aporta continuidad, no procedencia histórica. La copia descargada está bajo OneDrive y no se certificaron directamente permisos, historial o independencia de la cuenta de nube.
- El usuario Atlas de integración tiene readWrite en toda su base, un privilegio más amplio que los documentos autorizados para este ensayo. El aislamiento por código y los IDs no convierten ese rol en permisos de colección. Exponer su contraseña sigue siendo un riesgo aunque los datos sean sintéticos.
- La contraseña circula por entrada oculta/stdin y RAM; Node.js, el driver y el sistema pueden conservar copias hasta terminar el proceso. No se garantiza borrado total de memoria. Rotar después reduce la utilidad futura de una copia, sin deshacer acciones ya realizadas.
- Un commit enviado puede confirmarse después de un timeout. Cerrar, matar el proceso o abortar la espera no acredita rollback. Ante incertidumbre se conservan los datos; su conciliación posterior requeriría alcance y autorización propios.

No se investigarán nuevamente los SID sin evidencia nueva. Una aceptación de riesgos, pasada o futura, no equivale por sí sola a autorizar conexiones, escrituras o cambios de contraseña.

## 3. Alcance remoto propuesto

Una sola activación manual C.2, sin carga ni F.2. Puede abrir hasta tres clientes supervisados dentro del mismo ensayo; no significa tres ejecuciones. Sin repetición del comando tras fallo, cancelación o finalización.

Destino exclusivo: host `<cluster>.<id>.mongodb.net`, clúster TwoSidesCluster, usuario `twosides_integration_test`, base `two_sides_integration_test`, authSource `admin`, mecanismo DEFAULT y TLS estricto. Prohibidos twosides_backend, usuarios administrativos y two_sides_db. No habrá fallback a otros destinos, mecanismos o credenciales.

Ámbito fijo C.2A: `10ef4f6d653f4ee4a1d1b2e6591013c2`. El identificador **executionId** de la ejecución futura será nuevo y distinto de ese identificador de esquema.

Las únicas colecciones con operaciones de datos permitidas son las ocho existentes con prefijo `b054c2c_10ef4f6d653f4ee4a1d1b2e6591013c2_`:

| Sufijo | Operaciones propuestas |
|---|---|
| ops | Lectura y aceptación transaccional de las operaciones sintéticas B/C; limpieza exacta por ID |
| facts | Lectura y persistencia transaccional de sus dos hechos; limpieza exacta por ID |
| fence | Leer el fence inicial y actualizar su revisión mediante el adaptador; nunca eliminarlo ni reiniciarlo |
| authorization | Lectura/uso interno según el contrato del adaptador; inventario final exigido vacío, sin datos ajenos |
| identities | Registrar tres identidades sintéticas; revocar A/B y desvincular C; limpieza de sus tres filas |
| ownerGuards | Coordinación durable de esos tres propietarios; limpieza de sus tres filas |
| identitySessions | Tres sesiones técnicas sintéticas y sus comprobaciones de revocación; limpieza de sus tres filas |
| revocations | Tres comandos sintéticos de revocación/desvinculación y su verificación; limpieza de sus tres filas |

Las altas, sesiones, ingesta, recibos, revocaciones y limpieza usarán los repositorios reales y sus transacciones, sin sustituirlos por inserciones manuales. Tokens y claves JWT de los actores son sintéticos, generados en RAM; no se utiliza una identidad Godot real ni se envía Outbox real.

Solo se permite reconocer por metadatos las cuatro colecciones históricas con prefijo `b054c2c_0e803b0278594116a83894c04fb10c53_` y sufijos ops/facts/fence/authorization. No se leerán sus documentos ni se modificarán. El catálogo esperado contiene esas cuatro más las ocho C.2A: doce nombres exactos.

No crear colecciones, índices, usuarios, permisos, migraciones o transacciones ajenas a los escenarios. No drop, deleteMany, limpieza por prefijo, recreación de esquema ni eliminación de datos preexistentes. Que el rol permita DDL no lo autoriza en este plan.

## 4. Comprobaciones antes de escribir

Primero, sin secretos: integridad contra la nueva referencia externa, ruta fuera del proyecto/OneDrive, ausencia de enlaces, entorno depurado, firma/hash de Node, hashes de dependencias, temporal propio vacío y run no consumido. Mantener las consultas de seguridad del lanzador revisado acotadas al runtime que eventualmente se autorice; no ejecutar auxiliares históricos ni ampliar la auditoría. Una discrepancia detiene sin cambiar ACL.

Después de la activación manual y autenticación, el procedimiento existente debe comprobar en cada cliente:

1. Propiedades efectivas del driver: host/base/usuario exactos, admin, DEFAULT, TLS estricto, opciones supervisadas y prohibición de autoIndex/autoCreate. No confiar solamente en dbName.
2. `connectionStatus:1, showPrivileges:true`: una sola identidad autenticada twosides_integration_test en admin, un solo rol readWrite sobre la base autorizada y privilegios sin recursos de otras bases. El validador actual exige find/insert/update/remove/createCollection/createIndex/listIndexes sobre la base; el preflight exige además listCollections/find. Estas comprobaciones reflejan el contrato existente, no autorizan crear estructuras ni cambiar roles para hacerlo pasar.
3. `listCollections:1, authorizedCollections:true, nameOnly:true`, sin filter: catálogo completo, cursor agotado y exactamente los doce nombres previstos. Un catálogo parcial no sirve como inventario completo. No usar alternativas automáticas ni otra base si falla.
4. `hello:1` de diagnóstico, sin consultar documentos de otras bases: replica set y primario escribible. No es autorización de datos fuera de la base de integración.
5. Ocho modelos exactos, strict throw, sin buffering ni creación automática. Índices _id y cinco secundarios únicos existentes: owner_operation_unique, scope_source_unique, identity_registration_unique, identity_binding_unique e identity_token_unique. Comparar claves y opciones; rechazar índices inesperados, sparse/parciales/ocultos/TTL o collation incompatible.
6. Inventario inicial exacto: solo `{_id:'ingestion-v1', revision:0}` en fence y las otras siete colecciones C.2A vacías. Un fence avanzado o restos de otra ejecución detienen; no se resetean ni limpian para continuar.

Los controles anteriores se ejecutarán dentro del ensayo autorizado, no mediante una conexión adicional previa en esta fase.

## 5. Escenarios y criterios

| Escenario | Evidencia exigida |
|---|---|
| A — revocación confirma primero | Solicitud ya autorizada queda intercalada en la coordinación del propietario; tras confirmar revocación no se persiste operación/hecho ni recibo nuevo. Token y duplicado posteriores rechazados |
| B — ingesta confirma primero | Una operación/hecho y su recibo se conservan; revisión de autorización anterior a revisión de revocación. Token/duplicado posteriores rechazados, sin alterar el recibo histórico |
| C — respuesta perdida y desvinculación | Pérdida controlada después de commit conocido; mismo operationId recupera idéntico recibo, vínculo ajeno rechazado, desvinculación persistida y uso posterior rechazado |
| Reapertura | Tercer cliente independiente ve la revocación durable y el recibo histórico; token antiguo rechazado |

C no demuestra un commit de servidor desconocido: simula pérdida de respuesta después de commit confirmado. No se promete ejecución exactamente una vez a nivel HTTP ni se prueba reinicio completo del servidor.

**Éxito:** A/B/C y reapertura cumplen todos sus asserts; inventario propio exacto; limpieza confirmada; cero operaciones pendientes, cero incertidumbre, cierre de clientes/sesiones confirmado y resultado sanitizado guardado. No declarar resuelta la revocación general o F.2 por este resultado limitado.

**Fallo y detención:** autenticación/permisos no verificados, configuración distinta, digest/firma/inventario divergente, objetos inesperados, plazo/cupo agotado, respuesta incompatible, excepción no recuperada dentro del presupuesto, commit incierto, cierre fallido o resultado ausente. Detener etapas nuevas, intentar cierre supervisado y conservar evidencia/IDs. No reactivar el run ni repetir todo el ensayo. Los rechazos 401/403 y el 503 deliberado de C son esperados solo donde los assertions los exigen; fuera de esos puntos no se asumen normales.

Los reintentos transaccionales internos ya revisados permanecen limitados. No se clasifican todos los errores como rechazos permanentes ni se extienden sus presupuestos para lograr éxito.

## 6. Limpieza exacta y estado remoto posterior

Se confirmó en captureDurableCleanup/cleanupDurableInventory: A/B/C deben estar completados, sin trabajo activo, sin incertidumbre ni escrituras pendientes. Registro de tres propietarios ligado al plan y conexión; cada modelo debe corresponder a su colección fija. Se validan IDs de registro/instalación/jugador/sesión/comando/operación, payloads, recibos, scopes y estados esperados.

Inventario final exigido: 2 ops + 2 facts + 1 fence + 0 authorization + 3 identities + 3 ownerGuards + 3 identitySessions + 3 revocations = **17 filas, de las que 16 son eliminables**. El techo defensivo de inventario es 24, no una autorización para crear 24 filas ni para borrar filas adicionales.

Antes de borrar se relee y compara el inventario completo dentro de una transacción snapshot/majority. Cada deleteOne usa _id exacto y technicalAccountId cuando existe; se exige deletedCount=1. El handle de limpieza es de un uso. Nunca se elimina el fence ni se restaura su revisión. Colecciones, cinco índices y estructuras históricas quedan conservados.

Si un caso falla o aparece incertidumbre/inventario distinto, **no se limpia automáticamente**, aunque queden documentos sintéticos. Se preserva synthetic-plan.json con IDs, sin tokens/credenciales, para una conciliación posterior autorizada. La revisión del fence avanzará si hay commits: incluso con éxito y limpieza completa, otra ejecución no podrá asumir revision=0 ni queda autorizada a resetearlo.

## 7. Límites operativos existentes

| Recurso | Techo |
|---|---|
| Activaciones | Una; cancelar o fallar consume el run |
| Ventana del manifiesto | Positiva y de máximo 4 h; propuesta operativa: fijarla solo al preparar la autorización concreta, sin fechas vigentes en este documento |
| Clientes | Tres en toda la ejecución, incluidos intentos fallidos; tercero reservado para reapertura |
| Pool | maxPoolSize=2 por servidor/cliente, minPoolSize=0, maxConnecting=1; no equivale a seis sockets totales |
| Trabajos concurrentes | Dos; no carga masiva |
| Sesiones | Dos explícitas y dos implícitas simultáneas como cupos separados; totales de vida 18 explícitas y 256 implícitas |
| Envíos de aplicación | Ocho: A=2, B=2, C=4; no equivale al total de comandos MongoDB |
| Reintentos | Hasta tres callbacks y tres intentos de commit por transacción supervisada |
| Tiempo | 120 s globales desde el plan; admisión hasta 116 s y 4 s reservados para cierre; 30 s por escenario |
| I/O y barreras | I/O/transacción 10 s, commit 1 s, barrera 1 s, waitQueue 2 s; presupuesto de operación del adaptador 2 s |
| Driver | retryReads=false, retryWrites=false; TLS estricto, buffering/autoIndex/autoCreate/monitorCommands desactivados |

El supervisor y lanzador intentan terminar/cerrar al vencer el plazo, sin afirmar un límite físico a la vida de una operación ya recibida por MongoDB. Pendientes o cierre fallido impiden declarar éxito.

## 8. Nueva release activable y nuevo sellado — solo propuesta

No modificar la candidata offline ni la copia anterior. Tras autorización para preparar:

1. Crear una copia mínima nueva bajo C2Runtime con releaseId exclusivo; copiar bytes verificados, sin instalaciones ni permisos del proyecto, con temp/runs inicialmente vacíos. Mantener intacta la referencia externa offline.
2. El archivo que necesariamente cambia es **manifest.json de la nueva copia**: releaseId nuevo, versión 2, mode c2-remote-once, remoteEnabled true, target fijo, activation.executionId nuevo, runId C.2A fijo, escenarios A/B/C y ventana UTC expresamente revisada. No se generan esos valores activables ahora.
3. Núcleo, entrada, lanzador, fábrica, política, repositorios y supervisor no requieren cambios previstos para ejecutar. Cualquier cambio posterior no previsto exige mostrar su diferencia y volver a revisar/probar antes de recibir secretos.
4. El actual c2-final-verify-reference.ps1 rechaza manifiestos remotos por diseño. Preparar en la nueva copia un **verificador específico de activación**, con nombre distinto, que compruebe el nuevo manifiesto y conserve inventario exacto, enlaces, hashes, entorno y uso único; nunca debilitar el verificador offline ni usar su rechazo como motivo para omitir la verificación. Su incorporación cambiará el inventario y hash; no prometer que el nuevo payload seguirá teniendo exactamente 1.895 archivos.
5. Revisar la diferencia y ejecutar solo pruebas necesarias con credenciales ficticias, en copias desechables y sin red. No consumir el run definitivo. Verificar que no existan secretos o residuos en payload/temp/runs.
6. Generar nuevo inventario y SHA-256 completo del manifiesto, receptor/lanzador y verificador. Preservar fuera del equipo la nueva referencia, recuperarla y contrastarla antes de ejecutar. El digest D4A5… seguirá identificando solo la candidata offline, sin sustituirse en su documentación histórica.
7. Presentar rutas, hashes, ventana y comando exactos para aprobación final; solo después de esa autorización el usuario activaría manualmente el canal de un uso. Mantener archivos verificados abiertos contra escritura durante el hijo, entorno de ocho variables y contraseña solo por stdin/RAM.

Archivos locales futuros de ejecución: marcadores de uso, synthetic-plan.json y result.json bajo runs/executionId de esa nueva release. No deben contener la contraseña, tokens ni claves privadas. No se crearán receptores ni referencias activables como efecto de este documento.

## 9. Rotación posterior propuesta

Responsable: el usuario, mediante el mecanismo de administración de Atlas bajo su control; sin entregar al agente la contraseña antigua o nueva ni usar una cuenta administrativa en el arnés. No se modifica ahora ningún usuario o permiso.

Tras finalizar o fallar el único intento: cerrar clientes/proceso del receptor, conservar resultado sanitizado y estado de incertidumbre y **cambiar la contraseña de twosides_integration_test**. Si no se llegó a autenticar pero se introdujo la contraseña en el canal, rotarla igualmente. No alterar los roles, red, otros usuarios o bases como parte de esa rotación. Cerrar las sesiones de herramientas que pudieran retener esa credencial y actualizar manualmente sus datos solo cuando sea necesario; no extraer secretos de Compass.

No prometer que cambiar la contraseña cancela sesiones ya autenticadas o revierte commits. Si el cierre queda incierto, registrar la situación y exigir una decisión explícita sobre cualquier intervención de sesiones; no añadir comandos administrativos al ensayo. La confirmación de rotación será manual, sin conexión adicional para comprobar la contraseña nueva ni probar que la antigua falla. Una verificación remota posterior necesitaría autorización aparte.

La rotación no autoriza limpiar restos inciertos. Puede ser necesaria una credencial vigente y una autorización independiente para conciliarlos después; no retrasar indefinidamente la rotación esperando un ensayo exitoso.

## 10. Decisiones que faltan

1. **Aceptar expresamente** los riesgos residuales de B00, privacidad de memoria y referencia bajo la misma cuenta, sin declararlos resueltos.
2. **Autorizar preparación** de una nueva copia activable, su verificador específico y su nueva referencia externa, conservando las existentes. Esa preparación no autoriza conectar.
3. **Aprobar el alcance de una ejecución única**, con tres actores, escenarios A/B/C, tres clientes, ocho envíos y limpieza condicional de 16 filas; aceptar conservación de residuos ante fallo/incertidumbre y avance del fence sin reset.
4. **Acordar el ciclo de vida/rotación manual** de la contraseña de integración, incluso tras un intento fallido; sin compartir secretos.
5. Tras presentar la nueva release concreta y verificar su referencia externa, **autorizar explícitamente esa ejecución** vinculada a su digest, executionId, ventana y comando. Solo entonces activar manualmente el canal. Una aceptación anterior o un PASS offline no sustituye esta decisión.

No se plantea una pregunta de aprobación en esta fase: se entrega una propuesta concreta para revisión. Preparar este plan no autoriza ninguna de las acciones futuras enumeradas.

## 11. Cierre de esta fase

Único archivo creado: este documento. No se ejecutaron pruebas ni conexiones para repetir evidencias ya registradas. No se accedió a .env, SQLite o Godot, ni se modificaron releases, ACL, propietarios, usuarios Atlas o datos remotos. No se solicitaron contraseñas ni se generó un manifiesto remoto activable. C.2/F.2 no ejecutadas; B05.5 no iniciada.

**Detenido antes de toda activación. B00 pendiente.**
