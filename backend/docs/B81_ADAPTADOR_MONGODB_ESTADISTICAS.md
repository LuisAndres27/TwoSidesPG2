# B81 — Adaptador transaccional MongoDB para estadísticas

Fecha: 4 de noviembre de 2026, Guatemala.

**Resultado: adaptador implementado y comprobado offline; validación transaccional real MongoDB PENDIENTE.** No se encontró un servidor local utilizable. No se descargó software, arrancó MongoDB, contactó Atlas ni habilitó envío desde Windows. B00 sigue pendiente. B82 no se inicia.

## 1. Estado recibido y revisión

Se revisaron los informes B77, B78, B79 y B80; statistics-only-v1, Zod, proyector, cuotas, retención, recibos, interfaz transaccional, identidad ficticia y pruebas de aislamiento. B80 había aprobado 520 comprobaciones con su almacenamiento de referencia. La evidencia B78 de una partida real pertenece al propietario: no se abrió su almacenamiento ni se reutilizaron sus 71 eventos, identidades o muestras.

También se inspeccionaron los repositorios Mongo existentes de identidad/ingesta, las políticas de conexión y el procedimiento oficial de integridad. Aquellos repositorios corresponden a contratos anteriores; **no se importan ni reutilizan sus colecciones, credenciales, perfiles main/integration o arranque** para recoger estadísticas. SQLite continúa siendo la única fuente de verdad del progreso. Mongo no ofrece recuperación de partidas ni cuentas personales.

Versiones leídas de los paquetes instalados, sin instalar ni cambiar dependencias:

| Componente | Versión |
| --- | --- |
| Node.js | 24.19.0 |
| Mongoose existente | 9.11.2; sin uso de modelos Mongoose en este adaptador |
| Driver oficial `mongodb` | 7.7.0, instalado mediante la dependencia existente |
| BSON | 7.3.3 |
| Express / Zod / Vitest | 5.3.0 / 4.6.7 / 5.0.5 |
| Godot .NET SDK / destino | 4.6.1 / .NET 8 |
| SDK dotnet de compilación | 10.0.400 |
| Servidor MongoDB | **No disponible; versión y comportamiento reales no verificados** |

No se encontró `mongod` en PATH, ubicaciones habituales comprobadas ni cachés específicas de binarios Mongo. Docker CLI existe, pero su consulta local informó que no está disponible el pipe del motor Docker Desktop. No se inició el motor ni se descargaron imágenes/binarios. No se intentó conectar a un Mongo local preexistente para descubrir su contenido.

## 2. Arquitectura e interfaces reutilizadas

```text
Express de prueba, identidad sintética, POST /api/v1/statistics/events
    → contrato/validación B79, recibos individuales sin cambio
    → TransactionalStatisticsRepository B80
    → projectStatistics B80
    → statistics-transaction-v1
        ├─ SnapshotTransactionAdapter: regresiones B79/B80
        └─ MongoStatisticsTransactionAdapter: operaciones reales del driver
             ├─ doble del driver: ejecutado en B81
             └─ instancia local propia: preparado, NO ejecutado
```

El adaptador usa `ClientSession.startTransaction`, operaciones de colección con esa sesión, `commitTransaction`, `abortTransaction` y `endSession`. No sustituye transacciones por escrituras independientes. Importarlo, crear Express o construir un adaptador inyectado **no abre conexiones**. La única ruta de conexión real preparada está en el arnés opt-in de instancia propia.

Se mantiene la interfaz requerida: runAtomic, readCommitted, lookupCommittedReceipt, checkpoint y close, y los métodos tx get/put/insertUnique/increment/expire. No se duplicó validación, proyección, reglas ambientales, cuotas ni generación de recibos. La atomicidad sigue siendo **por evento**, no por lote; los recibos parciales B79 permanecen válidos.

`aggregates()` solicita ahora `readCommitted({includeTechnical:false})`, opción compatible con el doble anterior. Evita recorrer los ledgers técnicos para una consulta general. La lectura diagnóstica completa del contrato sigue disponible internamente para las pruebas; no se publica por HTTP.

## 3. Archivos y respaldo

Fuentes nuevos en `backend/src/modules/statistics/`:

- `mongo-local-policy.js`: configuración cerrada y comprobación del destino del driver.
- `mongo-schema.js`: aprovisionamiento explícito, validadores e inspección de catálogo/índices.
- `mongo-transaction-adapter.js`: sesiones, atomicidad, persistencia, lecturas, errores y cierre.
- `mongo-test-composition.js`: selección explícita de repositorio y comprobación de la época HMAC.

Archivos existentes modificados:

| Archivo | Cambio |
| --- | --- |
| `offline-app.js` | Admite únicamente el perfil adicional `statistics-b81-local-test` con repositorio registrado y la identidad sintética existente. El perfil normal conserva su selección previa. |
| `transactional-repository.js` | Pide una vista de contadores sin ledgers en aggregates; sin cambios a las reglas del repositorio. |

Respaldo de ambos originales en `local-persistence/.work/b81/pre-B81/`, con rutas relativas conservadas. Sus hashes coinciden con los inventarios B79/B80 anteriores. `changes.json` registra antes/después y `new-files.json` registra las incorporaciones. No se modificaron paquetes/lock, fuentes C#, escenas, mecánicas, endpoints Sync v2, F1/F2 ni manifiestos.

Pruebas/arnés nuevos bajo `backend/tests/statistics/`: `b81-driver-double.js`, `b81-mongo.test.js`, `b81-http.test.js`, `b81-local-instance.js`, `b81-real.config.js`, `b81-mongo.real.js` y `b81-node-worker.js`. El doble es explícitamente una simulación; el archivo `.real.js` queda fuera del include ordinario `*.test.js`.

## 4. Colecciones, índices y coste

Se implementó este esquema, creado **solamente dentro del doble** en esta fase. Ninguna colección Mongo real fue creada:

| Colección | Contenido mínimo | Índices |
| --- | --- | --- |
| `stats_v1_counters` | `_id` all/day UTC/month UTC; objeto values con métricas enumeradas y enteros seguros no negativos | `_id` único implícito |
| `stats_v1_receipts` | `_id` HMAC de evento, hash, revision, expiresAt Date | `_id` + expiry_v1 TTL |
| `stats_v1_semantic` | `_id` HMAC de hecho único, expiresAt | `_id` + TTL |
| `stats_v1_active` | `_id` HMAC de instalación/período, expiresAt | `_id` + TTL |
| `stats_v1_budgets` | `_id` HMAC de instalación/día de recepción, value, expiresAt | `_id` + TTL |
| `stats_v1_meta` | Único documento statistics-v1: schema, keyCheck y revision | `_id` único implícito |

Son **seis colecciones, seis índices _id y cuatro secundarios TTL** sobre expiresAt, expireAfterSeconds=0. No hay colecciones de eventos originales, partidas, propietarios, sesiones individuales ni perfiles.

Los contadores de bioma, visitas, tiempo, decisiones, ambientes y finales son celdas enumeradas dentro del documento del período. Los aditivos mensuales se derivan de días UTC, evitando persistir una tercera copia de cada contribución; el documento mensual conserva solo instalaciones activas distintas, que no son aditivas. Se preserva la vista all/day/month B80 y sus invariantes.

El aprovisionador exige una base nueva vacía y autorización explícita; no repara ni reprovisiona un catálogo existente. Crea validadores estrictos, índices y semilla, fuera de transacciones de negocio. La verificación inicial exige catálogo exacto, opciones, validadores, índices sin filtros parciales/sparse/collation inesperados, TTL y metadatos coherentes. Un adaptador no verificado no puede abrir una transacción.

**Límites de coste:** se actualizan con $inc solo los documentos/celdas afectados; no se reemplaza toda la base ni se escanea el ledger en cada ingesta. Para comprobar íntegramente las invariantes B80, esta versión lee los documentos de contadores históricos dentro de la transacción: coste O(períodos), no O(eventos). La revisión global escrita serializa escritores independientes y constituye un punto de contención. No es un benchmark de producción ni una solución de escala validada. Particionar revisiones/reducir lecturas requiere conservar y probar las mismas invariantes.

## 5. Transacción, deduplicación y recibo

Por cada evento:

1. Abrir sesión y transacción snapshot/primary, con writeConcern majority y j:true.
2. Comprobar semilla/época y efectuar CAS+$inc de su revisión. Un escritor con snapshot anterior no puede confirmar silenciosamente una actualización perdida.
3. Leer una vista coherente de contadores y ejecutar el callback **existente B80**: revalidación temporal, ledger indexado, unicidad semántica, presupuesto y proyección.
4. Registrar unicidad, presupuesto y recibo técnico en la misma sesión; preparar e incrementar solo las celdas necesarias.
5. Validar invariantes y presupuesto/cancelación antes del punto de commit.
6. Confirmar la transacción y después devolver el resultado. Siempre cerrar la sesión.

No hay confirmación definitiva antes del commit. Un duplicado con el mismo contenido reconstruye duplicate; distinto contenido conserva event_conflict. No se genera EventId nuevo en reintentos. El fence también avanza en transacciones sin contribuciones, por ejemplo duplicados/mantenimiento: es un coste explícito, no una nueva contribución estadística.

Las lecturas compuestas abren su propia transacción snapshot y la confirman con majority. No mezclan varias lecturas sueltas de estados diferentes. Una lectura durante escritura debe ver una versión completa anterior o posterior. `lookupCommittedReceipt` lee una sola clave más la revisión, en una vista coherente; no consulta todo el ledger para conciliar.

Los valores de operación y capacidades tx no permiten reutilización después del callback. El repositorio espera las operaciones asíncronas. Como exige la API del driver, no se ejecutan operaciones paralelas dentro de una misma sesión transaccional.

## 6. Fallos, reintentos y límites

| Situación | Tratamiento implementado y probado con dobles |
| --- | --- |
| Error antes de transacción o antes del commit | Aborto/ningún recibo confirmado; storage_unavailable reintentable. |
| WriteConflict/TransientTransactionError/colisión DuplicateKey | Aborto definido; el repositorio puede repetir hasta tres intentos. Agotarlos no es rechazo permanente del evento. |
| UnknownTransactionCommitResult | Hasta dos llamadas al **mismo commit**, sin repetir el callback. |
| Error no clasificable durante commit | Se trata conservadoramente como incierto, no como permiso para repetir incrementos. |
| Incierto seguido de otro error | Conserva incertidumbre; no vuelve a ejecutar negocio a ciegas. |
| Commit sin respuesta | Consulta de recibo comprometido y hash/revisión. Prueba positiva permite duplicate; sin prueba permanece reintentable. |
| Fallo de red/selección/timeout antes del commit | Error seguro; no reintento indiscriminado ni volcado del objeto original. |
| Cancelación/presupuesto vencido antes del commit | Aborta y conserva el evento local pendiente. No intenta deshacer un commit publicado. |
| Cierre | Rechaza trabajo nuevo, espera escritores/lectores registrados y termina sesiones/conexión cuando le corresponde su propiedad. |

Límites: cola máxima 128 transacciones pendientes/en curso por adaptador; espera máxima comprobada al despachar de 30 s; presupuesto precommit de 10 s comprobado entre etapas; maxTimeMS de operaciones 5 s; maxCommitTimeMS 5 s; hasta dos llamadas commit con timeoutMS 5 s. El driver instalado puede realizar su propio reintento de comando dentro de esa llamada acotada: dos llamadas no significan exactamente dos paquetes de red. Estos presupuestos no prometen tiempo real estricto ni interrumpen de forma insegura un commit incierto. La instancia propia prepara pool máximo 4; el worker independiente, 2.

Se utiliza la Core API para mantener separado el presupuesto de reintento del callback y del commit. No se combina con un withTransaction ilimitado. La especificación y documentación distinguen ambas clases de error y los reintentos internos del driver. [API transaccional oficial](https://www.mongodb.com/docs/manual/core/transactions-in-applications/), [especificación de transacciones](https://specifications.readthedocs.io/en/latest/transactions/transactions/).

## 7. Proyección y consultas administrativas

Se comprobaron todos los tipos reales statistics-only-v1, cinco biomas, sesiones closed/interrupted, visitas, finalizaciones, intervalos, approve/reject, healthy/degraded y finales good/medium/bad. Los resultados son iguales al proyector/repositorio B80. Un replay deja todos los contadores intactos. Se comprueban tiempos globales/por bioma, emparejamientos ambientales, finales, tipos, integridad diaria y mensual UTC y soporte distinto no aditivo.

Se conservan `aggregates()` interno y `generalSummary({period})`, con períodos cerrados all/day/month. No admiten búsquedas por jugador, sesión, partida ni filtros arbitrarios. No se publica un panel ni endpoints administrativos. Grupos pequeños permanecen suprimidos; celdas sin prueba suficiente de contribuyentes y promedios/cohortes no inferibles permanecen null. No se transforma una instalación en una persona ni se inventa abandono por cerrar una sesión.

## 8. Privacidad y retención

Se comprobó que la persistencia simulada no contiene JSON original, IDs crudos de instalación/evento/sesión/partida, perfil, rutas, correo o SQLite. Los hashes/HMAC son metadatos seudónimos vinculables, no una garantía de anonimato. El fingerprint keyCheck ata el repositorio a la época de la clave del almacén; una clave distinta se rechaza antes de aceptar eventos. B81 usa exclusivamente la clave ficticia pública de los fixtures, nunca una clave productiva.

La admisión sigue siendo 90 días más tolerancia futura de cinco minutos. La retención de recibos/semántica cubre esa admisión; actividad distinta cubre el período más ventana; presupuesto vence al día UTC siguiente. Los contadores generales no llevan TTL.

La expiración se comprueba lógicamente al leer una clave. Si una clave ya vencida debe reutilizarse, insertUnique elimina **solo esa clave con expiresAt anterior al límite**, dentro de la transacción. El resto de la eliminación operativa corresponde al TTL. No se depende de que TTL ejecute exactamente al vencer, pues el borrado del servidor es asíncrono. [Documentación TTL](https://www.mongodb.com/docs/manual/core/index-ttl/).

No se prometen reintentos offline admisibles indefinidos con borrado de identificadores: un evento vencido se rechaza como event_expired y queda local para revisión. Ampliar admisión o rotar HMAC requiere migración/coexistencia/fence explícitos antes de purgar; no se implementó rotación automática.

## 9. Configuración e aislamiento local

El único modo preparado es `statistics-b81-local-test`, apagado por defecto. La configuración cerrada exige enabled=true, runId hexadecimal, host literal 127.0.0.1, puerto explícito no privilegiado, base `twosides_statistics_b81_<runId>` y replica set `b81_<runId>`. Rechaza URI, Atlas/SRV, hosts externos, localhost genérico, bases main/integration, usuario/contraseña, proxies y opciones desconocidas. Valida también las opciones del cliente inyectado: un solo host/puerto, directConnection y replica set esperados, sin credenciales heredadas.

No lee MONGODB_URI ni archivos .env. La prueba de interferencia introduce únicamente una URI ficticia pública dentro del proceso desechable de tests, sin consultar su valor previo. El adapter no utiliza una conexión por defecto de Mongoose ni inicializa modelos/índices automáticamente. El comportamiento normal de Express/Godot no selecciona Mongo.

El código de conexión local sin TLS es exclusivamente para una instancia propia sin secretos en loopback: **no es configuración válida para Atlas ni desactiva TLS de perfiles existentes**. No existe un interruptor para convertir este arnés en una conexión productiva.

### Identidad de la instancia futura

`startOwnedB81Mongo` requiere ruta absoluta y SHA-256 aprobado de un mongod ya disponible; no acepta descargas. Comprueba binario, enlaces/hardlinks, crea temporal exclusivo `twosides-b81-*`, dbPath nuevo y marcador de ejecución. Reserva loopback y arranca solamente su ChildProcess. La reserva puede competir con otro proceso al liberarse: no se confía solo en el puerto. Antes de escrituras exige salida de arranque del hijo, PID devuelto por serverStatus igual al hijo y dbPath/bind/puerto/replSet de getCmdLineOpts coincidentes.

Solo inicia el replica set nuevo tras esa identificación, espera primario/sesiones/topología compatibles, reconecta con replicaSet fijado y exige que no existan bases ajenas. Después aprovisiona únicamente su base vacía. La inicialización administrativa de admin/local/config es propia de ese servidor desechable, no de un servicio existente.

El adaptador de bajo nivel admite inyección de dependencias para dobles: comprobar opciones de un objeto JS **no demuestra por sí solo quién inició un servidor**. La prueba de propiedad corresponde al arnés anterior. No se certifica un destino por contener localhost ni por llamarse B81.

**Este procedimiento no se ejecutó ni se certificó contra un mongod real.** Se comprobó su sintaxis y rechazo por defecto; sus etapas de PID, topología, arranque, reinicio y cierre real siguen pendientes.

## 10. Permisos y preparación futura de Atlas

La instancia local propuesta no recibe usuarios/credenciales reales ni cambia roles. En una futura autorización, separar aprovisionamiento (createCollection/createIndex/validadores/semilla) de ejecución. Este adaptador necesita find en contadores/ledgers/meta, insert en las colecciones que reciben filas, update en counters/budgets/meta y comprobaciones listCollections/listIndexes del preflight. El `put` genérico de la interfaz también requiere update si un consumidor lo utiliza sobre otro grupo.

**Diferencia frente al boceto B80:** la reutilización de una clave expirada usa deleteOne con predicado exacto, por lo que hoy requeriría remove en esos ledgers. No se afirma que el rol B60 anterior sea compatible ni se concede ese permiso. Antes de producción revisar si se mantiene esa acción o se adopta reemplazo condicional/otro diseño probado con una política aprobada. Las lecturas administrativas deberían acceder solo a contadores/metadatos necesarios, no a ledgers.

Tampoco se adoptó una base Atlas existente. Faltan rol real, TLS estricto/SCRAM-SHA-256 del perfil futuro, custodia/rotación de HMAC y credenciales, consentimiento, límites/capacidad y manifiesto nuevo autorizado. Tener una API transaccional implementada no valida un tier de Atlas.

MongoDB documenta que las garantías snapshot/majority dependen del commit y write concern seleccionados. Un replica set local de un nodo permite probar semántica, pero no demuestra redundancia, elecciones, failover ni pérdida eléctrica. Esas garantías reales siguen pendientes. [Transacciones MongoDB](https://www.mongodb.com/docs/manual/core/transactions/).

## 11. Pruebas ejecutadas

| Batería | Resultado | Naturaleza |
| --- | --- | --- |
| Estadísticas B79/B80 existentes | 104 PASS | Referencia sintética, HTTP y procesos de fixture |
| B81 política/driver/contrato/errores | 70 PASS | Unitarias y doble del driver, sin servidor Mongo |
| B81 Express | 12 PASS | Express real en loopback con driver simulado |
| JWT/F1/F2/ingesta/composición seleccionadas | 188 PASS | Regresión offline con dobles |
| Cliente .NET B79 + Express de loopback | 99 PASS | SQLite nueva, pérdida de respuesta y reinicio de Node sobre snapshot falso |
| Captura/Outbox B77 | 129 PASS | SQLite sintética y raíces de perfil ficticias nuevas |
| **Total sin duplicar repeticiones** | **602 PASS** | **Cero pruebas contra un servidor MongoDB** |

Las primeras tres filas son 186 tests Vitest en seis archivos. Se aplican **las mismas cinco pruebas de contrato B80, sin modificarlas**, al snapshot anterior y al adaptador Mongo con driver doble. Esas cinco también están incluidas en la selección real preparada.

Cobertura B81: cien eventos distintos concurrentes sin pérdidas en el doble; dos copias; dos adaptadores simulados independientes; lotes solapados; lectura durante una escritura retenida por barrera; unicidad y rollback de dos inserts/revisión; fallos antes de abrir transacción, tras dedup/incrementos, antes del commit; abort/cancelación/presupuesto; tres conflictos agotados; commit repetido sin replay de negocio; incierto seguido de error definido; ausencia de prueba del recibo; red/timeout simulados; cierre/sesiones/cola; validadores, índices y catálogo alterados; época incorrecta; ausencia de IDs/payloads en persistencia; retención; comparación de todas las métricas con B80; rate limit, identidad ficticia, errores permanentes/temporales y recibos individuales.

Los escritores del mismo adaptador se encolan: cien llamadas simultáneas no significan cien transacciones en paralelo dentro de una sesión. La colisión entre adaptadores se comprueba con el modelo del driver; **no se presenta como WriteConflict observado de un servidor real**. Las pruebas de reinicio B79/B80 son sobre su snapshot; la reapertura de estado del doble B81 tampoco es evidencia de reinicio Mongo.

Las primeras pruebas negativas B81 fallaron al cerrar fixtures cuyos propios tests habían dejado deliberadamente alteradas opciones/semilla. Se corrigió la limpieza del fixture para restaurar sus modificaciones de prueba, sin aceptar la configuración inválida ni cambiar reglas de negocio. Todos los resultados anteriores corresponden a la selección final.

Evidencia en `local-persistence/.work/b81/`: statistics-tests.log, backend-regressions.log, b79-client.log, b77-statistics.log y resultados/inventarios. No se suman ejecuciones intermedias como pruebas nuevas.

## 12. MongoDB real: pendiente, no sustituido por dobles

La selección real separada prepara **17 casos**, no ejecutados:

- Cinco contratos B80 idénticos: efecto+recibo, cien solicitudes, duplicado, lecturas inmutables y rechazo atómico de inconsistencias.
- Lotes solapados; escritores independientes con contenido igual/distinto; colisión real de _id con rollback; lector durante transacción.
- Cuatro fallos de aplicación alrededor de una transacción real, sin afirmar que sean fallos internos deterministas de MongoDB.
- Cierre/reinicio del mongod propio con reapertura y deduplicación.
- Dos procesos Node independientes sucesivos contra esa instancia, conservando recibo.
- Express y pérdida deliberada de respuesta, con replay del mismo evento.

UnknownTransactionCommitResult, timeouts y varios errores internos solo tienen evidencia simulada. No se activaron failpoints ni se pretende que todas las fallas del servidor sean reproducibles. Una prueba local futura debe informar cuáles errores fueron observados y cuáles inyectados por la aplicación.

Procedimiento futuro, **no ejecutado**: aprobar un binario mongod local y su digest; utilizar una consola sin credenciales con B81_OWNED_LOCAL_TESTS=1, B81_APPROVED_MONGOD y B81_APPROVED_MONGOD_SHA256; desde backend ejecutar:

```text
node --import ./tests/statistics/b80-isolation-guard.js ./node_modules/vitest/vitest.mjs run --config tests/statistics/b81-real.config.js
```

La ruta del binario debe estar ya autorizada; el comando no instala ni descarga nada. Los puertos/dbPath/PID los crea y verifica el arnés. No pasar URI, cuenta o base existente. Si falta una precondición, falla cerrado antes de usar un destino ajeno.

El cierre preparado ordena shutdown solamente tras reidentificar su servidor; termina sus propios clientes, espera al hijo y comprueba marcador/ruta/enlaces antes de eliminar su directorio sintético. Un fallo de arranque puede terminar únicamente su ChildProcess como fallback; eso no se registra como apagado limpio ni permite afirmar durabilidad. Ante identidad incierta o proceso vivo se conserva el directorio y no se ejecuta limpieza de bases/servicios ajenos. Todo ello sigue pendiente de comprobación real.

## 13. Compilación, datos protegidos e integridad

Godot compiló en **Debug y ExportRelease**, ambos con `--no-restore`, código 0 y cero errores. Las compilaciones incrementales emitieron cero advertencias; eso no elimina la referencia histórica de 63 advertencias. No se ejecutó Godot, exportó otro paquete ni cambió su contrato/almacenamiento.

No se accedió a PlayerData de luis2, TwoSidesTest o TwoSidesStatsTest, **ni siquiera existencia/metadatos**; tampoco a .env, SQLite histórica, 71 eventos reales o 2151 operaciones. La guardia B80 se precargó antes de Vitest y en hijos Node: bloquea fs de contenido/metadatos protegidos, DNS/conexiones externas y listeners públicos antes de E/S. Es instrumentación, no una sandbox de seguridad contra código hostil/bindings nativos. Las suites .NET revisadas usan capacidades sintéticas/raíces ficticias; no se ejecutó ProductionStorage/B68 ni los modos de almacén histórico. La desviación de metadatos B79 permanece registrada en su informe y no se borra retroactivamente.

B75/B78: **204 archivos verificados por paquete**, manifiestos y ZIP conservados. ZIP B75 SHA-256 `CF55AB6EDF0FE574ACFFCB0B1CCEF121F6FD4727864927770DC8423FAA709257`; B78 `078090EE18847F59333DC8B8DE954549265745B80ABC6271946F7DA730A03AAC`. No se sobrescribieron ni ejecutaron.

v5 conserva SHA-256 `2A4956E951217DFF2501D3FFBD35C9024554166E9126AD0134D8FB58C77AD726` y ancla `1f3f507348a479d88362767e9e548200003d646ad8930f54cbfc9efc6a9f8c28`. El verificador oficial devuelve **tree_differs esperado: doce añadidos estadísticos, cero modificaciones/eliminaciones de los 3172 originales y cero problemas**. Ocho añadidos eran anteriores; cuatro son los fuentes B81. Los dos archivos editados en B81 pertenecían a esas incorporaciones posteriores a v5. No se regeneró ni activó el manifiesto y el backend principal debe seguir rechazando el árbol actual.

No se inició Express principal, Atlas, Caddy, C.2, F.2, B67, F3.10 ni otra campaña. Los servidores HTTP de tests se cerraron; no quedó un proceso de Mongo porque no se inició ninguno. No hubo cambios ACL/propietario, usuarios/roles, certificados, cuentas Windows, commits o push.

## 14. Reversión, límites y próxima etapa

Reversión propuesta: con procesos de prueba cerrados, contrastar `changes.json` y restaurar **solo** offline-app.js y transactional-repository.js desde pre-B81; retirar exclusivamente los archivos B81 inventariados. No restaurar SQLite ni borrar progreso/ledgers reales. No hay migración remota que deshacer. Volver a B80 no hace válido el antiguo v5 para sus ocho incorporaciones; no lo activa automáticamente.

Persisten B00, custodia/rotación/consentimiento, identidad estadística de producción, política administrativa completa, límites de capacidad y nuevo manifiesto autorizado. El proceso Windows y loopback no aíslan frente a otros procesos de la misma cuenta ni certifican privacidad por ubicación. No se consultaron ni corrigieron ACL. Los paquetes distribuidos B75/B78 no incluyen B81 y el envío estadístico real continúa apagado.

**Bloqueo concreto:** falta un MongoDB local desechable con soporte transaccional, binario/procedencia aprobados y validación de las 17 pruebas preparadas. No se declara B81 completamente validada ni el adaptador listo para desplegar contra Atlas.

**B82 recomendado:** disponer de esa instancia aislada autorizada y ejecutar la selección real, comprobar versiones/topología, índices, concurrencia entre escritores, abortos, commits/recibos y reinicios; medir el fence/coste por períodos y revisar el permiso de expiración. Resolver cualquier defecto demostrado antes de autorizar HTTPS/Atlas o publicación. No iniciar esa fase automáticamente.
