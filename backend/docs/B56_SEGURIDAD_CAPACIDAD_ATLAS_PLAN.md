# B56 — Preparación final de seguridad y capacidad de MongoDB Atlas

Fecha: 2026-11-03, Guatemala. **Inspección y planificación exclusivamente.** Único archivo creado: este informe. Sin conexiones Atlas, Express/Caddy, certificados, contraseñas, usuarios, cuotas, migraciones, borrados, pruebas ejecutadas, commits ni push. No se abrió `.env`, SQLite real ni la copia B52. No se modificaron fuentes del backend, Godot, manifiestos o C2Runtime. No se implementó F3.10.

Convenciones: **C** = comprobado en código actual; **D** = evidencia de una fase anterior, no repetida; **P** = propuesta pendiente; **N** = no comprobable sin una futura autorización remota. Las cifras históricas no constituyen una inspección actual de Atlas.

## 1. Estado actual y conclusión

| Componente | Evidencia y límite |
|---|---|
| F1/F2 | B46 documenta commit real, reenvío `duplicate`, recibo `found`, persistencia y deltas sintéticos; colecciones históricas intactas. Una operación, no una campaña de volumen. **D** |
| Cliente | F3.1/F3.2/B51 documentan tiempos, lote adaptativo, dependencias y pruebas con Express offline-test. **D** |
| B54 | Cuota recuperable: conserva pendientes, pausa persistente y sonda; no cambia la cuota ni reserva espacio para decisiones. **C/D** |
| B55 | HTTPS con HttpClient y Caddy: PASS, código 0; CA retirada, servicios detenidos y sandbox eliminado. Valida el transporte fuera del motor; no Atlas. **D** |
| Godot HTTPS con sandbox | **Bloqueado por la selección actual de modos.** Sandbox exige la bandera HTTP; `SyncMainMode` rechaza argumentos de prueba. **C**, ya señalado en B51 §8.1 |
| Atlas principal | Destino fijo `<cluster>.<id>.mongodb.net` / `two_sides_db`, identidad DB `twosides_backend`, `authSource=admin`, TLS estricto, `DEFAULT`. **C** |
| Capacidad | 1000 operaciones por propietario/binding, válvula global estimada 50 000; historial de 2151 documentado en B53. **C/D** |
| Integridad | Última comprobación B55: manifiesto v4, 3169 archivos, cero diferencias. No se recalculó en esta fase documental. **D** |

**Recomendación mínima:** primero habilitar y verificar un modo HTTPS con sandbox que falle cerrado; resolver SHA-256 y el rol de servicio con pruebas offline; sellar un único despliegue candidato; después solicitar por separado una campaña pequeña con identidades nuevas. La cuota 3000 puede esperar para esa campaña: no necesita importar historial. No activar el guardado real para evitar un bloqueo de configuración.

Fuentes locales principales: B46, B47, B48, B51, B53, B54, B55; `B05_5_MAIN_SCRAM_COMPATIBILITY_RESULT.md`, B11 y B15. Las descripciones antiguas de B47/B48 sobre cliente, cadencia o esquema desconocido no sustituyen los cambios posteriores: hoy la cadencia es **30 000 ms**, el cliente tiene B54 y el esquema principal fue utilizado en B46.

## 2. Autenticación: qué sabemos y cómo endurecerla

### Causa y límites de la evidencia

`src/main/policy.js` fija `MAIN_AUTH_MECHANISM='DEFAULT'`. Según el diagnóstico SCRAM y la observación del propietario, el usuario anunciaba únicamente `SCRAM-SHA-1`; exigir SHA-256 daba error de autenticación. DEFAULT prefiere SHA-256 cuando se anuncia y, en aquel caso, negociaba SHA-1. Esto explica la selección del mecanismo, **no demuestra por qué Atlas carecía de la credencial SHA-256**. No se conoce su estado actual sin una nueva comprobación autorizada.

MongoDB documenta soporte SHA-256 por defecto en Atlas y actualización de contraseñas para generar las credenciales SHA-256 de usuarios anteriores a MongoDB 4.0. No hay evidencia de que esta cuenta pertenezca a ese caso; no se atribuye esa antigüedad ni se garantiza que otra rotación lo arregle. [Documentación oficial de usuarios Atlas](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/).

SCRAM autentica; TLS cifra el canal. Cambiar SCRAM no sustituye la protección de secretos, las ACL ni la validación del certificado. La huella SHA-1 de la CA local B55 tampoco indica el mecanismo SCRAM.

### Procedimiento propuesto, sin ejecutarlo

1. Propietario: revisar en Atlas la cuenta exacta, roles, restricciones de clúster/IP y método SCRAM; conservar configuración **sin secretos** y versión previa desplegable. No utilizar un administrador como usuario de la aplicación.
2. Preparar offline el candidato estricto: `MAIN_AUTH_MECHANISM='SCRAM-SHA-256'`; revisar conectores, inspección, bootstrap y herramientas que importan esa política; actualizar las expectativas que hoy exigen DEFAULT. Sin modificar la política del perfil `integration` ni las releases C.2.
3. Mantener host/base/usuario fijos, `authSource=admin`, validación TLS/nombre, `autoIndex=false`, `autoCreate=false`, tiempos y límites de pool. Sin fallback SHA-1 automático en el candidato de entrega.
4. Propietario: bajo autorización independiente, rotar la contraseña de servicio por una nueva no reutilizada, en Atlas UI/CLI/API; entregarla solo al proceso autorizado por entrada oculta y stdin. No ponerla en URI, argumentos, registros, Godot o OneDrive. No cambiar la clave JWT: la rotación SCRAM y los JWT son mecanismos distintos.
5. Primera sesión futura de solo lectura: autenticar **explícitamente** con SHA-256 y verificar destino, identidad, permisos efectivos, catálogo, índices y semilla. Una lista `saslSupportedMechs` es evidencia de capacidad, no una prueba de autenticación exitosa por sí sola. Con éxito explícito se acredita SHA-256; con fallo se detiene sin degradación ni reintentos automáticos.
6. Si persiste el fallo, conservar la categoría sanitizada y comprobar manualmente usuario/authSource/soporte del mecanismo. Soporte Atlas o una identidad nueva requerirán una decisión separada; no borrar/recrear la cuenta a ciegas.

Riesgos de rotar: nuevas conexiones con contraseña antigua fallarán; conexiones ya autenticadas podrían seguir vivas; reiniciar ordenadamente el pool es necesario para comprobar el nuevo estado. El cliente debe conservar Outbox ante la indisponibilidad. Cambiar usuario DB puede romper fijaciones de identidad y verificadores; no implica migrar jugadores, pero exige revisar su uso como credencial de conexión. Nunca confundir usuario DB con cuenta técnica JWT del jugador.

## 3. Privilegios actuales y cuenta de servicio propuesta

### Qué se puede afirmar ahora

`verifyMainPermissions` exige una identidad `twosides_backend@admin`, exactamente un rol `readWrite` en `two_sides_db`, recursos de esa base y acciones `find`, `insert`, `update`, `listCollections`, `listIndexes` a nivel de base. Rechaza permisos en otras bases, pero **no impone una lista máxima de acciones dentro de la base**. Las herramientas de inspección y bootstrap también contienen expectativas `readWrite`.

B31 y la campaña B46 son evidencia documental de uso de esa identidad; **no se consultaron sus roles efectivos actuales**. El rol `readWrite` alcanza las colecciones no-sistema de la base; por tanto no aísla las siete colecciones históricas respecto de las colecciones `main_v2_*`. Es más amplio que el trabajo ordinario del backend. [Roles oficiales MongoDB](https://www.mongodb.com/docs/manual/reference/built-in-roles/).

### Diseño mínimo propuesto

Reutilizar el nombre fijo `twosides_backend` como cuenta de servicio exclusivamente de Express, con secreto nuevo y rol propio propuesto `two_sides_main_runtime_v1`; evita introducir selección arbitraria de usuarios. El propietario decide y aplica el cambio posteriormente. No sumar el rol nuevo a `readWrite`: los permisos son acumulativos y eso mantendría el acceso amplio. Restringir además al clúster previsto y a la IP de salida necesaria, sin abrir `0.0.0.0/0`.

| Recursos exactos en `two_sides_db` | Acciones de runtime propuestas |
|---|---|
| `main_v2_operations`, `main_v2_facts` | `find`, `insert`, `update`, `listIndexes` |
| `main_v2_fences` | `find`, `insert`, `update`, `listIndexes` |
| `main_v2_identities`, `main_v2_ownerGuards`, `main_v2_identitySessions`, `main_v2_revocations` | `find`, `insert`, `update`, `listIndexes` |
| Base `two_sides_db`, solo metadatos | `listCollections`, requerido por el preflight actual |

Lista positiva cerrada: sin `remove`, DDL (`createIndex`, `dropIndex`, `createCollection`, `dropCollection`, `dropDatabase`), administración de usuarios, otras bases, colecciones históricas ni acceso a `main_v2_authorization` (modelo sin uso en este recorrido). `listCollections` revela nombres de catálogo, pero no concede lectura de documentos históricos.

Los upserts actuales necesitan `insert` y `update`. No es un rol de solo inserción. La válvula global llama a `estimatedDocumentCount()`; se inspeccionó el driver instalado: construye el comando **`count`**, no `collStats`. Debe comprobarse su autorización con el rol propuesto; no añadir privilegios estadísticos o administrativos por suposiciones de otras versiones del driver.

Limitación real: permisos a nivel de colección no protegen documentos individuales dentro de `main_v2_*`. El servicio puede actualizar datos de otros jugadores de esas colecciones si se compromete; el control de propietario y la protección del fence semilla siguen dependiendo del código. La cuenta no es acceso directo para Godot.

Atlas permite roles personalizados, con acciones disponibles limitadas por la plataforma; en Free/Flex su propagación puede tardar hasta 30 s. Confirmar disponibilidad de cada acción en el clúster real. [Roles personalizados Atlas](https://www.mongodb.com/docs/atlas/security-add-mongodb-roles/).

### Compatibilidad y cambios inevitables

- **Cambiar el rol ahora sin cambiar el verificador impediría arrancar.** Debe sustituirse la expectativa de nombre `readWrite` por la identidad/rol autorizado y la comparación de la **unión efectiva** de acciones y recursos; rechazo de privilegios adicionales, comodines o recursos ajenos. Mantener `connectionStatus` con `showPrivileges`.
- Adaptar solo los validadores usados por la campaña y la inspección; no relajar globalmente el bootstrap para que funcione con la cuenta de runtime. Herramientas de provisión/limpieza deben tener autorización separada. No crear índices durante el arranque.
- Roles distintos no cambian las transacciones, recibos, índices, payloads ni claves idempotentes. F1 debe seguir invalidando cachés al perder conexión; F2 conserva su punto de commit, la espera del resultado real y el tratamiento de resultado incierto. Tras cambiar credenciales/rol, cerrar el pool antiguo y efectuar verificaciones vivas antes de admitir tráfico.
- Limpieza remota: identidad del propietario o cuenta de mantenimiento separada con `remove` solo en las colecciones necesarias, sin entregar ese permiso al backend normal.

## 4. B00: estado real y procedimiento de cierre

No repetir la corrección histórica: **B11 documenta que las dos ACE Allow de SID no resueltos se retiraron y se verificaron**. No afirmar que siguen concediendo Modify basándose en B10, que fue sustituido por B11. No se inspeccionaron ACL en B56.

B00 sigue abierto por integridad/secreto bajo la misma cuenta Windows, copias históricas de secretos y necesidad de acreditar la procedencia del despliegue. B15/B55 aportan manifiestos y controles posteriores a B11; no seguir tratando la ausencia de manifiesto o de carpeta JWT de aquel informe como un hecho actual.

Procedimiento mínimo posterior:

1. Inventariar documentalmente qué secretos pudieron exponerse y qué copias/nube/archivos antiguos quedan pendientes; no abrirlos ni publicar sus valores. La retirada de una copia no revoca una contraseña filtrada: rotar la identidad de servicio y, solo si existe evidencia de exposición, el material JWT afectado mediante su plan de transición.
2. Reutilizar el canal de entrada oculta, fuera de OneDrive para material temporal; secreto solo stdin/RAM, entorno de proceso mínimo y diagnósticos sanitizados. No crear otro canal paralelo innecesario.
3. Tras cambios autorizados, generar manifiesto nuevo y referencia externa del candidato final; hash local no certifica por sí solo procedencia o control de acceso. No sobrescribir el v4 ni reutilizar su ancla para código cambiado.
4. Revisar con el propietario el riesgo residual de procesos bajo la misma cuenta y de la ubicación de ejecución. Para una campaña local acotada puede registrarse una aceptación específica de ese riesgo, sin declarar B00 resuelta; aceptar perder datos **no** equivale a aceptar exposición de secretos. Para entrega pública se requiere protección y operación documentadas, no una excepción silenciosa.
5. Cierre por evidencias separadas: SHA-256 real, roles mínimos efectivos, secretos renovados y canal controlado, referencia de integridad y disposición de copias pendientes. Cambiar SCRAM por sí solo no cierra B00 Windows.

## 5. Capacidad real y propuesta de cuota 3000

### Implementación actual

- `ingestion-engine.js:23,112–121`: `maxRecords=1000`, máximo permitido por constructor 10 000; `maxTotalRecords=50000`. No hay parámetro de despliegue que ya fije 3000 en `main/profile.js`.
- Idempotencia por **mismo operationId y contenido** se resuelve antes de cuota: devuelve recibo original. Un alias con ID nuevo que necesita nueva fila de operación sigue sujeto a cuota, aunque represente un hecho existente. Cada fila de operación cuenta, incluidos informes `superseded` aceptados.
- Mongo: conteo por `technicalAccountId` y `scope` (jugador/instalación/generación), acotado a cuota+1; consulta global estimada sobre `main_v2_operations`. No son cuotas de disco, de partidas ni ventanas diarias. No hay liberación automática del historial.
- La válvula global usa conteo estimado, fuera de una reserva global serializada: no prometer un techo transaccional exacto frente a propietarios concurrentes. Es una protección operativa, no una garantía de facturación o almacenamiento.
- El tope de **2 MiB** que B54 encontró con Express offline-test pertenece al almacén en memoria; **no prueba el límite de conteo Mongo**. Elevar a 3000 ese doble no demuestra que 2152 operaciones pasen al adaptador real.

### Coste de historial

`MongoIngestionRepository.readScoped`: lee operación/padres por ID, hecho por clave y, para un `game.report` nuevo, informes de esa partida. Para otros hechos nuevos lee **todos los hechos del scope** (límite cuota+1) para las relaciones. `relations.js` recorre sesiones, eventos, intervalos/solapes y progresión. Además se cuenta el propietario y se consulta el total estimado. Los índices únicos `owner_operation_unique` y `scope_source_unique` ayudan a localizar, pero no eliminan la transferencia y validación de esos hechos.

Por tanto elevar 1000→3000 puede triplicar el historial manejado por operación al final de la vida de una cuenta; un vaciado prolongado tiene crecimiento acumulado aproximadamente cuadrático en la parte de validación general. No es una medición de latencia. F1 reduce viajes y evita comprobaciones repetidas, **no elimina este coste**. `game.report` tiene un recorrido más estrecho y un duplicado idéntico no carga todo el historial; no atribuir el peor caso a todas las peticiones.

### 2151 pendientes: evidencia histórica, no importación autorizada

B53 documenta 1993 intervalos, 104 eventos, 33 sesiones y 21 informes de partida: total 2151, más un cierre reconciliable = **2152**; 3162 dependencias. Se usa ese informe, **sin abrir B52 ni la base real**.

- Con cuota 1000 y propietario vacío: quedarían 1152 operaciones sin admitir en el escenario 2152. Si el propietario ya tiene operaciones, queda menos margen.
- Con cuota 3000 y propietario vacío: margen aritmético 848; con historial remoto previo `n`, margen `848−n`. No equivale a capacidad ilimitada ni valida el rendimiento.
- La cadencia actual de 30 s reduce generación futura respecto de los intervalos históricos de 5 s, pero no compacta los 1993 intervalos existentes. Cambios de estado y otros hechos añaden volumen. Los ~7 h de margen estimados por B53 no son garantía.
- A 3000 por propietario, 16 propietarios completamente llenos consumen 48 000 operaciones; el siguiente se toparía con la válvula global si no hay otros registros. No se recomienda cambiar la válvula sin dimensionar demanda y almacenamiento.
- B54 pausa también nuevas decisiones/progreso si la cuota está llena. No borra hechos, pero no garantiza que lleguen a Atlas mientras continúe el bloqueo. Las decisiones viajan dentro de `game.report`; no existe una operación independiente `decision` que pueda priorizarse sin más.

### Decisión mínima propuesta

**Para el ensayo pequeño: mantener 1000. Para entrega con historial como B53: 3000 es solo una solución provisional condicionada**, no una solución duradera de capacidad. Cambio futuro localizado preferentemente en la composición `main` (`maxRecords:3000` al crear el repositorio), manteniendo los valores de integración y dobles; el constructor ya lo admite. Alternativa de cambiar el valor por defecto afecta a más perfiles y aumenta las regresiones. No decidir dos valores distintos a la vez.

Cualquier cambio de `backend/src` exige manifiesto candidato **v5 o siguiente versión libre**, después de todas las ediciones y regresiones; preservar v4 como referencia de reversión, nueva ancla externa y verificación de arranque. Nunca editar el manifiesto para ocultar una diferencia. Actualizar también las herramientas fijadas por hash que realmente se usen.

### Cuota diferenciada y conservación de progreso

Opción posterior: reservar capacidad para `game.report`, sesiones y eventos; limitar intervalos a un presupuesto separado. La reserva **no garantiza** decisiones ilimitadas y debe incluir padres requeridos, margen total y válvula global. No permitir saltarse una dependencia ni omitir revisiones usadas por hijos. La priorización del envío por sí sola no libera espacio ya ocupado.

No es indispensable para una campaña de pocas operaciones. Se clasifica **P2 si una cuota provisional demuestra cubrir el uso previsto; P1 antes de uso prolongado si no lo cubre**. Requiere contadores/validación transaccional, política de rechazo compatible con B54 y pruebas de orden; no se propone introducir ahora códigos nuevos. No compactar, reidentificar ni borrar Outbox histórica como atajo.

Compatibilidad B54: mantener `quota_exceeded`, pendientes y pausa; un commit nuevo exitoso permite reanudar, un `duplicate` no prueba capacidad. Tras subir cuota el cliente puede esperar hasta 6 h; `ResumeAfterQuotaChange()` existe, pero el juego no tiene un hook integrado para invocarlo. Para la futura prueba se puede esperar la pausa o invocar ese hook en el arnés autorizado; no resetear tablas ni aumentar masivamente el despacho. Incorporar aviso/reanudación al producto requiere una autorización específica si se considera necesario para entrega.

### Pruebas de capacidad que faltan

Preparar offline con dobles Mongo/scoped y SQLite nuevas: exactamente 999/1000/1001 y 2999/3000/3001; duplicado en cuota con mismo recibo; alias con ID nuevo; límites por propietario/aislamiento; límite global; cola sintética generada de 2152 hechos válidos con dependencias, más decisión nueva cerca del límite; reinicio en pausa, sonda y recuperación; datos inmutables y cero fallos permanentes por cuota; F1/F2 y contrato de errores sin regresión.

Prueba diferencial debe conservar validación de relaciones, no simular que toda fila arbitraria es aceptable. Contra Express en memoria, su tope 2 MiB debe distinguirse explícitamente del resultado del adaptador Mongo. Medición real pendiente con historiales sintéticos de 500/1500/2000/3000, percentiles y commits inciertos, será una autorización posterior, **no ejecutada ni implementada como F3.10 aquí**. Umbral orientativo: p95 previo a commit <1200 ms y sin agotamiento sistemático del presupuesto de 2000 ms; si falla, no ampliar cuota por intuición ni relajar F2.

## 6. Recorrido mínimo Godot → SQLite nueva → HTTPS → Express → Atlas

### Bloqueo de selección de modo: resolver antes de iniciar el juego

En `SyncWorkerLifecycle.cs.txt`, `SyncTestStorageMode` solo acepta sandbox junto a `SyncLocalMode`, que fija HTTP `127.0.0.1:3000`; `SyncMainMode` desactiva HTTPS ante cualquier bandera de prueba. B55 usa un cliente independiente y **no corrige ese bloqueo**.

Cambio propuesto, no realizado: bandera explícita de HTTPS de prueba con origen **fijo** `https://localhost:8443/`, obligatoriamente combinada con sandbox. Argumentos desconocidos/incompletos/contradictorios deben fallar antes de abrir almacenamiento; jamás volver al guardado real. Preservar el modo HTTP existente y el modo principal sin banderas. `GameTestStorage` debe seguir creando su propia base sin aceptar rutas arbitrarias y `GameSyncHost` debe mantener secretos sintéticos en memoria. Solo modificar esas políticas; no biomas ni mecánicas.

Pruebas offline necesarias: combinaciones válidas/erróneas, HTTPS sin sandbox rechazado, ausencia de apertura real, estado de sesión y un único worker, credenciales en memoria, ningún `historical_import` ajeno y ninguna bandera que cambie host/base. Compilar Godot solo con autorización de implementación; no modificarlo en B56.

### Campaña futura propuesta y barreras

1. Autorización independiente enumera destino, operaciones, rol de servicio, datos y acciones de cierre. Destino propuesto para validar el perfil final: `two_sides_db`, **solo nuevas identidades y documentos de `main_v2_*`**. No usar el lanzador de `integration` como sustituto ni reutilizar su contraseña. No entrar en las siete colecciones históricas para copiar datos.
2. Preflight local: fuentes y dependencia fijadas por manifiesto externo vigente; certificado localhost/CA vigentes; confianza instalada y retirada exclusivamente por el propietario; puertos libres; sin procesos principales anteriores; almacenamiento sintético creado nuevo y token de ruta `owned-outbox-fixture`. Redirigir APPDATA/user-data de la ejecución como en B51. No copiar SQLite real/B52 ni sus IDs.
3. Preflight remoto de lectura autorizado: SHA-256 explícito, identidad DB exacta, permisos efectivos mínimos, TLS, primario/replica set, siete colecciones e índices esperados, semilla `ingestion-v1`. No `autoCreate`, `autoIndex`, DDL ni bootstrap. Discrepancia → detener. Evidencia histórica B46 no sustituye este control vivo.
4. Crear runId, installationId, localPlayerId, registrationId, gameId y sessionId **nuevos**. La cuenta técnica JWT de pruebas se registra para ese binding; no es `twosides_integration_test` ni una credencial Mongo enviada al juego. JWT y secreto sintético solo RAM en sandbox. La identidad DB del servicio permanece exclusivamente en Express.
5. Generar una secuencia pequeña de juego: perfil/partida sintéticos, sesión abierta, un informe con decisión/progreso, evento/intervalo coherentes y cierre. Conservar orden causal y source keys. No importar ni reproducir las 2151 operaciones históricas. No hace falta recorrer los cinco biomas para comprobar transporte/persistencia.
6. Límite propuesto: una instancia Godot, un worker, un Express, un Caddy, un pool Mongo ya limitado a 5; una campaña de hasta 5 min, lotes iniciales de hasta 5/tope existente 8; máximo **16 operaciones nuevas**, reenvío de una operación y una consulta acotada de recibos. Es un presupuesto **a instrumentar y probar en la guardia de campaña**, no una capacidad que hoy tenga el worker. Debe cortar nuevos envíos antes de excederlo, sin cancelar un commit incierto. Si no puede acreditarse el límite o aislarse la base, no iniciar el ensayo. Sin carga ni concurrencia C.2/F.2.
7. Guardar inventario sanitizado propio del run: IDs exactos y relaciones, sin tokens ni payloads reales. Capturar IDs que efectivamente se vayan generando en sandbox; no asumir que los documentos `main_v2_*` tienen un campo runId, porque este modelo no lo añade. Verificar desde una herramienta de lectura acotada que los recibos corresponden a esos IDs y que cada operación/facto existe una vez.
8. Reenviar **mismo ID/hash/contenido/dependencias**: exigir `duplicate` y receiptId original. Consulta: `found`. Si hay respuesta perdida o commit incierto, detener nuevos lotes y conciliar; no regenerar IDs, no interpretar 503 como ausencia de escritura y no limpiar aún. Confirmaciones locales solo con recibos válidos.
9. Comparar solo el conjunto sintético autorizado; comprobación de históricos mediante herramienta del propietario con lectura autorizada y línea base previamente aprobada, si se exige comparar contenido. El servicio restringido no debe recuperar lectura de históricos para probar su protección. Catálogo y cantidades por sí solos no prueban integridad de contenido.
10. Cierre: detener worker, esperar lote en vuelo/conciliación, cerrar Godot y SQLite, drenar Express/pool, detener Caddy; verificar ausencia de procesos/listeners. Retirada manual CA y comprobación posterior. Eliminar solo temporales/sandbox propios; ningún archivo real ni respaldo.

### Limpieza remota exacta propuesta

No forma parte de B56. Requiere autorización explícita para eliminar **solo IDs del nuevo run** y una identidad separada de mantenimiento. Detener si hay escrituras inciertas, IDs no conciliados o relaciones inesperadas.

Inventario por colección: operaciones por `_id` y technicalAccountId; hechos por claves scope/sourceKey capturadas; sesiones por sus `_id` y technicalAccountId; revocaciones solo si se crearon y constan en inventario; ownerGuard/identidad por propietario nuevo; fence de propietario `ingestion-v1:<technicalAccountId>`. Verificar ownership en cada filtro y que no existan referencias ajenas antes de eliminar. **Nunca borrar `ingestion-v1`, colecciones/índices, documentos de campañas anteriores, ni usar `deleteMany({})`, prefijos amplios o solo una fecha.** Guardar comparación previa/posterior del conjunto exacto y ausencia final; si se conserva evidencia sintética en Atlas en vez de borrar, registrar esa decisión y no llamarla limpieza completada.

## 7. Priorización y lista mínima de cambios

P0 = bloquea un ensayo/entrega segura o puede afectar datos; P1 = debe resolverse antes de la conexión real de este plan; P2 = puede esperar con el límite indicado. No se diagnostica pérdida de datos actual por alcanzar cuota.

| Hallazgo/acción | Prioridad | Tipo | Decisión mínima |
|---|---|---|---|
| HTTPS Godot solo disponible hoy sin sandbox | **P0 para esta campaña** | Código + pruebas | Modo HTTPS de prueba obligatorio con base nueva; fallo cerrado |
| Importación accidental de cola real | **P0** | Configuración/guardia/pruebas | Ninguna ruta real aceptada; nuevo run y límite comprobable |
| Credenciales antiguas posiblemente expuestas/copias pendientes | **P1**, P0 si se confirma compromiso activo | Manual Atlas + operación | Rotar secreto de servicio y controlar su entrega; no confiar en borrar una copia |
| DEFAULT permite SHA-1 | **P1** | Código + manual Atlas + pruebas | SHA-256 explícito verificado; sin fallback |
| `readWrite` sobre históricos | **P1** | Código + manual Atlas + pruebas | Rol mínimo, verificación de permisos compatible y cerrada |
| Cambios invalidan v4 | **P1** | Configuración/integridad | Un manifiesto final nuevo, ancla externa; v4 conservado |
| F1/F2 y contratos podrían sufrir regresión | **P1** | Pruebas | Suites de main/SCRAM/permisos/F1/F2 y C# relevantes |
| Cuota 1000 con backlog 2152 | **P1 antes de habilitar ese backlog real**; no bloquea ensayo pequeño | Código + pruebas de capacidad | 3000 provisional solo tras evidencia; no importar historial ahora |
| Historial amplio y coste de relaciones | **P1 para aumentar cuota o prometer volumen de entrega** | Pruebas; código solo si falla | Medir por separado; no optimización especulativa |
| Reserva por tipo/prioridad/compactación | **P2** condicionado al volumen de entrega | Código/diseño | Posponer si la capacidad medida cubre el uso; nunca saltar padres |
| Hook visible de reanudación de cuota | **P2 para ensayo nuevo** | Cliente | Usar sonda/espera en pruebas; decidir antes de UX de entrega |
| Rotación de certificados locales vencidos | **P1 cuando corresponda por fecha** | Manual/configuración | No regenerar por rutina si siguen vigentes; revalidar siempre |
| B00 residual misma cuenta/procedencia/copias | **P1** | Operación/decisión propietario | Mitigación verificable o aceptación específica de campaña; no declarar cierre global |
| Caché periódica, pool precalentado, telemetría nueva | **Opcional** | Código | No necesario para comprobar corrección |
| Cuenta de usuario con correo, recuperación entre dispositivos, nuevo dashboard | **Opcional para este alcance** | Funcionalidad | Fuera de B56; no rediseñar identidad para la campaña |

## 8. Orden recomendado y aceptación

1. Aprobar alcance: modo HTTPS sandbox, SHA-256, rol mínimo y guardia finita. No aprobar implícitamente conexiones ni eliminación remota.
2. Implementar y probar offline esos cambios, preservando F1/F2/B54; dejar cuota 1000 para el ensayo inicial. Si se aprueba capacidad 3000, evaluarla como cambio separado y evitar repetir sellado innecesariamente.
3. Propietario prepara cambios manuales Atlas bajo nueva autorización, con configuración previa y recuperación planificadas. Preparar código antes de retirar `readWrite` para evitar una indisponibilidad innecesaria; no arrancarlo hasta verificar todo.
4. Sellar candidato final y referencia externa; comparar hashes de herramientas y configuración. No reutilizar el manifiesto v4 con código cambiado.
5. Solicitar sesión de verificación remota de solo lectura; si pasa, solicitar por separado la campaña Godot sintética, sin F3.10 automática.
6. Cerrar, retirar CA, conciliar y efectuar limpieza exacta solo si fue aprobada. Presentar resultados y detener.

Criterios de aceptación: SHA-256 autenticado explícitamente; privilegios efectivos mínimos exactos; destino/TLS sin excepciones; esquema/índices/semilla sin DDL; ninguna apertura SQLite real ni importación histórica; cuenta técnica nueva; cada dependencia confirmada antes de hijo; recibos persistidos y repetibles; cero ACK sin persistencia comprobada; incertidumbre conciliada; límites finitos respetados; cierre y confianza temporal retirados. Las métricas F1 de viajes previas y los tiempos reales B46 no son promesas con más historial: comparar con los modelos/regresiones, y medir el nuevo entorno cuando se autorice.

## 9. Reversión

- **Código/configuración:** detener envíos, esperar/conciliar commits, restaurar el paquete anterior y su manifiesto/ancla sin editarlo. Volver a v4 no restaura automáticamente roles/credenciales ni debe iniciar un backend inseguro.
- **Credenciales:** el rollback de código no recupera una contraseña revocada. Propietario provisiona otra credencial segura compatible o mantiene el servicio detenido; no restaurar una contraseña conocida como expuesta. No recurrir automáticamente a SHA-1 para evitar un fallo de conexión.
- **Permisos:** conservar descripción previa de roles. Preferir corregir el rol mínimo faltante con evidencia. Reponer `readWrite` sería una ampliación sensible que requiere autorización y evaluación, no un paso automático. Separar provisión/limpieza de runtime.
- **Cuota, si se aprueba posteriormente:** bajar a 1000 no elimina las 1001–3000 operaciones ya confirmadas; nuevos envíos podrán quedar bloqueados y B54 conservará pendientes. Mismo ID devuelve su recibo. No desconfirmar, borrar o recapturar para ajustar conteos.
- **Datos:** revertir el binario no revierte escrituras Atlas. Usar únicamente el inventario sintético y el procedimiento de limpieza autorizado. Datos reales/históricos y B52 quedan fuera.

## 10. Qué posponer para terminar antes

No hace falta elevar cuota para una campaña pequeña, compactar las 2151 filas, rediseñar Outbox/identidad, agregar un sistema de roles al juego ni optimizar consultas antes de medir. Posponer importación histórica, cuota diferenciada, agregación de intervalos, calentamiento periódico y observabilidad adicional. No posponer el sandbox HTTPS, los secretos controlados, permisos/identidad verificables, manifiesto nuevo, recibos/conciliación ni el cierre.

La entrega con uso prolongado sí necesita una capacidad sustentada por pruebas; 3000 solo amplía el margen y no resuelve una cuota de por vida. **B56 termina con el plan preparado, sin implementar ni activar cambios. B00 sigue pendiente.**
