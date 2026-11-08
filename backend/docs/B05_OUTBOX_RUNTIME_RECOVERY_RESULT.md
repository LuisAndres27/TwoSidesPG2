# B05.3B.2E.2 — Recuperación controlada Outbox runtime

2026-10-28, America/Guatemala. **COMPLETADA: no fue necesaria recuperación adicional. Cero inserciones y cero escrituras en runtime durante E.2.** Auditoría final satisfactoria; B05.3 completada en su alcance de captura y reconciliación local. No implica entrega remota ni resolución de B00. B05.4 no iniciada.

## Antecedentes y estado recalculado

El usuario informa **10/10 comprobaciones manuales satisfactorias de E.1**, incluyendo juego offline, botón Salir, X de Windows, reinicio con progreso e historial conservados y ausencia de errores nuevos. Son resultados aportados por el usuario, no ejecución del motor por el agente. Las 791 pruebas y las 63 advertencias de E.1 son antecedentes; abajo se distingue la batería realmente reejecutada en E.2.

Se revisaron SHUTDOWN_RECOVERY, RUNTIME_POSTVALIDATION, RUNTIME_ACTIVATION, CAPTURE_RECONCILIATION, LOCAL_OUTBOX_IMPLEMENTATION, GODOT_RUNTIME_TEST_PLAN, IMPLEMENTATION_ROADMAP, PHASES, PHASE_HISTORY y DECISIONS. Se contrastaron contratos/código de SyncFactInventory, SyncOutboxProjection/Service/Schema, SyntheticOutboxReconciler, SyncReconciliationPage, LocalOutboxPump y los mecanismos BackupDatabase/guardas/snapshots de backup-rehearsal existentes. No se modificaron esos archivos productivos.

La fotografía antigua853 pending/838 de 840 fuentes dejó de ser el estado actual después del uso manual. Primera auditoría E.2, solo lectura, **2026-10-28T08:40:37.2309559Z**:906 pending,889 de 889 fuentes actuales representadas y cero faltantes. El incremento de 53 respecto a853 es anterior a esta intervención; no son inserciones realizadas en E.2. No se forzó853,855 ni ninguna cifra predeterminada. La cobertura se recalculó desde fuentes confirmadas y proyecciones, no desde el número de filas de cola.

## Preflight y aislamiento

- Ruta exacta: `C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\local-persistence\.work\runtime-game\save.sqlite3`. Archivo normal, tamaño 2813952 bytes. Guardas Windows validaron ruta, enlaces/FileId y manifiesto ownership correspondiente a la copia runtime; sin modificarlo.
- Godot, TwoSides, Node y ejecutores de escritura del proyecto no detectados. No se forzó cierre de procesos. Antes de respaldar se repitió la comprobación de escritores.
- Se observaron `ownership.json`, `store.lease` y `save.sqlite3`; sin WAL, SHM o journal. Cabecera SQLite DELETE normal; no se borraron sidecars ni se ejecutaron checkpoint/VACUUM/migraciones.
- Base v2, gameplay v1 y sync v1 existentes, verificadas mediante contratos/checksums actuales. integrity_check=ok; foreign_key_check sin resultados. Tres índices únicos Outbox con formas esperadas.
- Espacio libre comprobado mediante DriveInfo: 118365462528 bytes durante el respaldo satisfactorio, suficiente para las copias y el margen. Directorio privado existente verificado fuera de OneDrive, dueño esperado y Allow limitadas al usuario actual, SYSTEM y Administradores. Directorios nuevos heredan esos permisos; no se modificaron ACL/propietarios/herencia.
- Se detecta OneDrive.Sync.Service, pero no se equipara su presencia a sincronización activa. La estabilidad durante respaldo/ensayo se comprobó manteniendo guardas nativas contra sustitución y handles Read/FileShare.Read sobre base, manifiesto y lease: no permiten escritores concurrentes durante esa ventana. Hash/tamaño/mtime del origen coinciden con el preflight al finalizar. Esto no certifica el estado global de sincronización de otras carpetas de OneDrive, que no se inspeccionaron.

## Respaldo privado nuevo y verificado

Directorio del procedimiento satisfactorio:

```text
C:\Users\luis2\AppData\Local\TwoSides\PrivateBackups\B05_OUTBOX\20261028T084559Z-e1a0ffd06ada46319c04fb686352036d
```

Respaldo auténtico nuevo:

```text
C:\Users\luis2\AppData\Local\TwoSides\PrivateBackups\B05_OUTBOX\20261028T084559Z-e1a0ffd06ada46319c04fb686352036d\runtime-consistent-20261028T084559Z-c931ea054c6646419941e2e342399e6b.backup.sqlite3
```

Tamaño: **2813952 bytes**. SHA-256:

```text
093C5EBF5D6BE334848E904613792913C9034B0955CD586FEE658E7BE3DD9F4D
```

Creado por **SQLite BackupDatabase** con origen ReadOnly bajo bloqueo de escritores y destino exclusivo nuevo. Apertura y comprobación posterior correctas: integrity_check=ok, FK válidas, esquemas existentes verificados, todas las tablas y definiciones y estadísticas lógicamente iguales al origen. Se conserva `backup-manifest.json` privado con huellas de tablas y metadatos; no datos secretos exportados a documentación/Git.

El respaldo se mantuvo con handle de lectura que niega escritura durante el ensayo; hash/tamaño/mtime/descriptor comprobados sin cambios antes/después. SHA-256 nuevamente comprobado tras la batería sintética. Ningún respaldo anterior sobrescrito ni restaurado.

El hash propio del origen runtime al preflight y al final es:

```text
39DECCBA75CB405961BCC03E85C0F8A64542B84585F200FF3F0F64B984B0D197
```

No se exige igualdad binaria entre BackupDatabase y origen: el mecanismo puede producir otra cabecera con el mismo contenido lógico. Se verifica cada archivo contra su propia referencia y se comparan todas sus tablas/esquema/estadísticas.

## Ensayo independiente

Copia de trabajo nueva, creada desde el respaldo anterior, en el mismo directorio privado:

```text
independent-recovery-trial-20261028T084559Z-394045e8bc6040dcb3879ca7d0073e36.rehearsal.sqlite3
```

Se reutilizó `SyntheticOutboxReconciler.PrepareSyntheticPage` con binding existente, cursor null, lotes de 25 y transacciones de copia de trabajo. No migración, nueva identidad ni inserción manual de filas. El puerto estático retorna Committed=false hasta que su caller confirma; primero se inspeccionan diagnósticos y después se verifica el resultado confirmado, respetando ese contrato.

| Comprobación | Resultado |
|---|---|
| Primera reconciliación completa, captura y auditoría |0 inserciones, sin diagnósticos|
| Segunda reconciliación completa |0 inserciones, idempotente|
| IDs/sobres/huellas/estados/recibos y dependencias existentes |Íntegros; todas las tablas iguales|
| Esquema, migraciones, sesiones, eventos, intervalos y progreso |Sin cambios|
| Estadísticas y tiempo efectivo |Sin cambios|
| Integridad/FK de copia y respaldo |ok/válidas|
| Respaldo y runtime durante el ensayo |Metadatos/hash intactos|

Se conserva `recovery-result.json` privado. Huella de cola de la copia después de ambas pasadas: `F62D078A330D58E82107F5F01D204E856418663B62F774A149CCAFD3DAD1FF1E`. Las comparaciones de snapshots abarcan todas las tablas, no solo esa huella parcial de cola. No se copiaron tablas desde ensayo a runtime.

### Incidencias del tooling, sin daño a datos

Un primer intento se detuvo por una comprobación incorrecta del helper: requería Consistent antes de commit, aunque Consistent exige Committed=true. La página de ensayo se revirtió; no fue un conflicto encontrado en las fuentes. Se corrigió exclusivamente el helper temporal, sin relajar diagnósticos, y se repitió todo el procedimiento con otro directorio y respaldo nuevos. El primer conjunto se conserva en `B05_OUTBOX\20261028T084458Z-812e1529f3504f81874fab2123fe8cbd`; su respaldo mantiene el mismo SHA-256 verificado arriba. No se reutilizó su copia de ensayo para simular éxito.

Una invocación auxiliar de lectura recibió por error el hash del respaldo como expectativa del origen y se detuvo con SOURCE_CHANGED. La comparación correcta contra el baseline propio del origen confirmó igualdad exacta. No hubo un cambio real del origen ni apertura de escritura como consecuencia. Ambos controles fallidos se distinguen de las pruebas de regresión y del ensayo posterior satisfactorio.

Tooling exclusivo bajo `local-persistence/.work/outbox-recovery`, ignorado: compone helpers existentes de respaldo/inspección, sin alterar fuentes de producción. Entry point de esta operación no invoca migraciones ni métodos de escritura runtime. Compilación0 errores / 0 advertencias; restore solo desde caché local existente, sin descargas/servicios. No se aplica parche a Godot ni dependencias nuevas.

## Recuperación real: no necesaria

**Registros recuperados por E.2: 0. Escrituras runtime por E.2: 0.** La cobertura ya era completa al preflight y siguió completa tras el ensayo. Por ello no se abrió una conexión ReadWrite sobre runtime ni se invocó allí una reconciliación mutante que no era necesaria. Se eligió el caso autorizado de cero inserciones. No se fabricaron los dos registros del informe antiguo ni se alteró cola existente.

La consulta de lectura específica de la sesión antigua confirma:

- Sesión original closed, inicio 07:05:22.7889721Z y endOffsetMs 3932, todavía presente.
- Su session.report terminal ya representado.
- Su intervalo original Menu, start_ms 0 / end_ms 3932, sin GameId ni AnimalRunId, ya representado por gameplay.interval.
- Duración **3932 ms = 3,932 segundos**, aporte efectivo animal 0. Sin conversión ni reescritura del dato.

La captura existente es compatible con la recuperación de startup/cierre durante la validación manual posterior a E.1. No hay traza por callback que demuestre exactamente en qué llamada se insertó cada uno; no se atribuye al agente esta recuperación anterior.

## Auditoría final de lectura

**2026-10-28T08:50:38.9398234Z** (02:50:38 Guatemala), después de ensayos y regresiones. ReadOnly/query_only; conexiones de ensayo cerradas. Resultado **SATISFACTORY**, sin reconciliación de escritura runtime.

| Tipo | Operaciones | Fuentes actuales elegibles | Representadas |
|---|---:|---:|---:|
| game.report |20|3|3|
| session.report |28|28|28|
| gameplay.event |102|102|102|
| gameplay.interval |756|756|756|
| **Total** |**906**|**889**|**889**|

Los 17 game.report adicionales son snapshots de revisiones históricas, no otras fuentes actuales faltantes. Los 28 eventos SESSION_STARTED/ENDED se excluyen correctamente del tipo gameplay.event porque sus hechos se representan mediante session.report.

Estados: 906 pending; 0 in_flight, 0 confirmed, 0 retryable_failure, 0 permanent_failure. Intentos 0, sin leases activos ni recibos/confirmaciones remotas ficticias. 1872 dependencias. Faltantes 0, duplicados 0, contradicciones 0, huérfanos 0, dependencias incompletas 0, bindings incorrectos 0, errores guardados 0. Integridad SQLite ok, FK válidas, tres índices únicos correctos. Última captura previa a E.2: 08:38:26.011Z.

## Progreso, datos históricos e integridad

Fotografía de fuentes conservada durante E.2:1 perfil, 3 partidas (2 completed y 1 in_progress/activa), 11 decisiones, 15 filas de biomas y 15 ambientes, 10 biomas completados, 2 finales y 2 cierres, 14 sesiones, 130 eventos y 756 intervalos. Las 11 decisiones, 10 completions y 2 resultados/cierres están representados. Auditoría contra el backup de activación confirma 5/5 decisiones, 92/92 eventos y 564/564 intervalos anteriores todavía iguales.

Tiempo efectivo confirmado **1158719 ms** (19 min 18,719 s), idéntico entre preflight, backup, copia y final E.2. No exigir el valor1146846 ms de la fotografía anterior al juego manual: la diferencia es previa a E.2. Se conservan 13 muertes, 3 solicitudes de reinicio y 9 reintentos. HistoricalCoverageUnknown=true, actividad Incomplete=false, Uncollected.PlayedMilliseconds sigue NotAvailable; no se transforma en 0 ni se supone cobertura anterior inexistente.

Las dos bases históricas AppData no se abrieron para escritura, migraron ni restauraron. Se comparan hash/tamaño/mtime y descriptores de seguridad de los nueve archivos asociados a las tres bases respecto al inicio E.2; también runtime permanece intacta porque no precisó reparación.

`.env` se controla solo mediante hash y metadatos: 278 bytes y SHA-256 histórico `4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928`, sin texto, variables ni credenciales. Sin cambios de fecha, ACL, propietario o herencia. B00 continúa pendiente; no se elimina ninguna ACE. No HTTP, Atlas, AWS, servidores o ejecución Godot/Node.

## Pruebas ejecutadas en E.2

**0 pruebas nuevas. 791 regresiones sintéticas realmente reejecutadas, 791 aprobadas, 0 fallidas.** No se cuenta el ensayo sobre copia privada de datos reales como test sintético ni se ocultan las incidencias de tooling anteriores.

| Suite | Aprobadas |
|---|---:|
| Base SQLite |43|
| Drenaje acotado / recuperación D / activación |26 /24 /28|
| Reconciliación / Outbox |51 /64|
| Progreso / menú / selección / decisiones / entrada animal |42 /35 /30 /30 /29|
| Retorno / reinicio / Game Over |11 /21 /19|
| Estadísticas / pantalla / eventos / observador / actividad |39 /24 /41 /31 /23|
| CompleteBiome / finales |54 /126|

Incluyen terminal/intervalo Menu, claves estables, duplicados y contradicciones, filas confirmed inmutables simuladas, recuperación/reinicio/interrupción, tiempo efectivo/pausa, partida activa/historia, decisiones/finales y ausencia HTTP/Mongo en referencias. Todas las pruebas con escrituras usan SyntheticSandbox; ninguna apunta a las tres bases protegidas.

Se compiló el helper y el ejecutor base,0 errores / 0 advertencias. **Godot C# no se recompiló en E.2** porque no hay cambios productivos;0 errores y63 advertencias históricas corresponden a E.1. Los 10/10 manuales de E.1 son del usuario. No se presenta ninguna de esas ejecuciones anteriores como una compilación o sesión nueva E.2.

## Estado, riesgos y siguiente puerta

E.2 COMPLETADA con cero recuperación adicional. Auditoría final satisfactoria y manuales E.1 informados 10/10 permiten **cerrar B05.3 en su alcance local de Outbox/captura/reconciliación**, sin excepciones actuales de cobertura. No implica cerrar B05 completo, seguridad B00, receptor o transporte remoto. Las906 pending siguen locales y no autorizan envío.

No se exige repetir los 10/10 manuales por esta intervención sin cambios productivos ni escrituras runtime. Seguimiento recomendado en el siguiente uso autorizado: salida por menú/X, reinicio offline, ausencia de nuevos errores, continuidad de partida/historia y comprobación de cobertura si aparece OUTBOX_CLOSE_DEFERRED. No iniciar Godot automáticamente aquí. No provocar corrupción/busy/disk-full en datos reales.

Riesgos pendientes: dos ACE de B00 no resueltas; procesos/SO pueden terminar sin ejecutar drenaje; hechos nunca confirmados no se recuperan; historia grande puede superar presupuesto y diferir al siguiente arranque; snapshots históricos no permiten reconstruir todas las revisiones intermedias. Respaldo privado requiere custodia local; no se exporta ni se restaura automáticamente.

Recomendación B05.4A: solicitar por separado revisión/diseño del receptor y pruebas aisladas de identidad/binding, canonicalización C#/Node, deduplicación y recibos transaccionales/ACK parcial, límites y errores seguros. Tratar B00 y custodia antes de usar credenciales o autorizar entornos remotos. Esta fase no inicia HTTP, Atlas, AWS ni B05.4. Trabajo detenido.

## Verificación final del inventario E.2

Inventario antes/después: **1373→1374 archivos**. Solo siete cambios deliberados: seis documentos existentes autorizados actualizados y este informe nuevo. Los1367 archivos restantes del inventario original conservan hash, tamaño y mtime. Cero eliminaciones y cero cambios de artefactos Godot. Herramientas temporales únicamente bajo `.work` excluida del inventario de código; no son cambios productivos.

Las tres bases y sus nueve archivos asociados conservan exactamente hash/tamaño/mtime; también sus propietarios/descriptores de seguridad son idénticos al baseline E.2. Coinciden owner/SDDL de raíz, backend, .env, local-persistence y .git. `.env` conserva278bytes, hash histórico y fecha. Cero archivos sintéticos restantes bajo `.work/databases` y cero procesos propios/Godot/Node detectados al terminar. Respaldo satisfactorio conserva SHA-256 verificado; no se escribió ni restauró runtime. E.2 completada y trabajo detenido.
