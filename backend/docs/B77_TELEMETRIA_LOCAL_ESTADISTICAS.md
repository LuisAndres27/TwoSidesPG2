# B77 — Telemetría local y Outbox de estadísticas

Fecha de cierre: 2026-11-04 UTC. Resultado: captura local implementada y verificada automáticamente. No se ha validado una integración estadística en la nube ni ejecutado el juego actualizado.

## 1. Arquitectura y alcance

SQLite continúa siendo la fuente de verdad de partidas, decisiones, consecuencias y progreso. La extensión estadística deriva hechos de guardados confirmados y de los intervalos del observador existente. Cada hecho se persiste junto con su entrada de Outbox. No necesita URL, conexión, cuenta personal ni Atlas para capturar o jugar.

Se reutilizaron GameSaveService/UnitOfWork, sus recibos e idempotencia, GameplayEventService/Repository, el reloj monotónico, LocalGameplayObserver y los puntos existentes de pausa, muerte, reinicio, finalización y cierre. No se modificaron escenas, mecánicas, reglas ambientales ni reglas de finales.

La Outbox histórica no puede convertirse silenciosamente: contiene contratos diferentes, incluido `game.report`. Se conservó su implementación y sus pruebas. Para almacenamiento de producción, GameSyncHost no habilita el transportador histórico y GamePersistenceAdapter no expone SyncStorage al mismo. Los ensayos explícitos de almacenamiento sintético del Sync anterior conservan su funcionamiento. La nueva Outbox únicamente expone operaciones locales de reserva, confirmación y fallo; el transporte estadístico HTTPS queda pendiente.

Esto aplica la decisión expresa de B77: no enviar partidas completas, recuperar partidas desde la nube ni construir expedientes individuales. Los objetivos anteriores de respaldo remoto y cuentas personales quedan obsoletos para el producto definitivo. REQUIREMENTS.md no fue reescrito: se propone ratificar allí SQLite como fuente de verdad, estadísticas agregadas como único fin remoto y sustitución futura de `game.report`. R07/R08/R14 siguen alineados; los contratos antiguos de identidad técnica/sincronización requieren revisión explícita antes de reutilizarlos.

## 2. Archivos y respaldo

Archivos existentes modificados:

| Archivo | Cambio |
| --- | --- |
| `local-persistence/src/GameplayEventSchema.cs.txt` | Instalación reutilizable dentro de una transacción; SQL/checksum histórico conservado. |
| `local-persistence/src/CopyGameDatabase.cs.txt` | Identificación interna del almacén de producción autorizado. |
| `local-persistence/src/OwnedCopyDatabase.cs.txt` | Propiedad interna de esa capacidad. |
| `local-persistence/src/GameplayEventService.cs.txt` | Exclusión de intervalos activos anómalos de los totales. |
| `integration/sqlite/GamePersistenceAdapter.cs` | Inicialización, captura transaccional, proyección recuperable, ámbito confirmado y cierre acotado. |
| `integration/sqlite/GamePersistenceContext.cs` | Observación del segmento humano y diagnóstico estadístico. |
| `integration/sqlite/LocalGameplayObserver.cs` | Tiempo humano, sesión compartida y exclusión de suspensiones. |
| `integration/sqlite/GameSyncHost.cs` | Impide transporte histórico de snapshots en producción. |

Archivos nuevos: `local-persistence/src/StatisticsTelemetry.cs.txt`, `local-persistence/statistics-tests/Statistics.Checks.csproj`, `Program.cs.txt` y `packages.lock.json` dentro de ese proyecto de pruebas; este informe.

Respaldo de los ocho originales: `local-persistence/.work/b77/pre-B77/`, con rutas relativas conservadas. Inventario original: `before.json`; hashes originales/finales: `changes.json`; verificaciones finales: `final-verification.json`, todos en `.work/b77/`. Se comprobaron nuevamente los ocho respaldos. El original de OwnedCopyDatabase fue recuperado retirando únicamente el acceso interno recién añadido y contrastando sus bytes con la referencia preexistente B75 antes de respaldarlo; no se presenta como un respaldo previo a esa primera edición.

Ninguno de estos archivos de implementación pertenece al alcance protegido por v5. No se modificó backend/src ni se generó/activó otro manifiesto.

## 3. Migraciones y errores de captura

Se mantiene la base de guardado v2. Gameplay v1 se instala cuando falta, sin cambiar su SQL histórico. La extensión independiente `statistics-only-v1`, versión 1, tiene checksum:

`59D0B990B5E1E8D356164C2EB7088B79E9594DFD25CDA9CB37F06FA552DFF44E`

Crea ocho tablas: `statistics_schema_migrations`, `statistics_installation`, `statistics_events`, `statistics_outbox`, `statistics_coverage`, `statistics_projection`, `statistics_intents` y `statistics_cursors`; dos índices y dos triggers de inmutabilidad. La instalación se hace en una transacción inmediata, con versión/checksum y verificación al reabrir. Un fallo revierte toda la extensión y mantiene el progreso previo. Solo acepta capacidades sintéticas o de producción; rechaza capacidades históricas/ajenas antes de abrirlas.

Una base previa sin estadísticas conserva sus partidas. Se registra cobertura `PREEXISTING_PROGRESS_NO_BACKFILL`; los cursores comienzan en el máximo rowid existente de gameplay. No se importan intervalos antiguos ni se inventan eventos históricos. Si existen tablas `sync_*`, la inicialización estadística se detiene con `LEGACY_SYNC_REVIEW_REQUIRED`; no borra ni transforma la cola anterior. El guardado principal puede continuar con diagnóstico de estadísticas no disponibles.

Cada operación de dominio conserva un intento compacto de proyección en la misma transacción del guardado. La captura estadística usa un savepoint: si falla, se revierte la captura y se conserva el intento para reconciliar posteriormente. No se devuelve un falso fallo del guardado ya confirmado. Los recibos repetidos no vuelven a ejecutar la extensión.

La reconciliación recupera intentos pendientes y consume gameplay por cursores, en pasadas acotadas de 128 entradas por fuente (512 al cerrar). Evento, Outbox y avance del cursor se confirman atómicamente. Un fallo de almacenamiento que impida incluso registrar el intento/cobertura se comunica como captura incompleta; no se promete recuperar datos que nunca llegaron a disco. No se bloquea el progreso para esconder ese fallo.

## 4. Contrato estadístico v1

El DTO serializado usa los nombres `EventId`, `SchemaVersion`, `InstallationId`, `SessionId`, `Type`, `OccurredAtUtc`, `GameId`, `BiomeId`, `DurationMs`, `Data`. `Data` es una cadena que contiene un objeto JSON con campos cerrados. Esta representación debe acordarse explícitamente con el futuro receptor Express; no es compatible por suposición con los endpoints antiguos.

| Tipo | Datos específicos |
| --- | --- |
| `installation_registered` | Objeto vacío; una instalación local. |
| `game_started` | Objeto vacío; partida confirmada. |
| `biome_entered` | Bioma de la entrada confirmada. |
| `environmental_decision` | `decisionKey`, `option`, `state`. |
| `biome_completed` | `result`: good/bad. |
| `game_completed` | `ending`: good/medium/bad, determinado por las reglas existentes. |
| `session_started` | `status`: open. |
| `session_ended` | `status`: closed/interrupted. |
| `playtime_interval` | `state`, `startMs`, `endMs`, `excluded`, `active`; duración activa. |

Se valida versión, IDs, UTC, biomas, tamaños, campos y valores. Los campos desconocidos se rechazan. Se conservan `reject → healthy` y `approve → degraded`. Los eventos de final y bioma completado proceden del dominio validado, no de visitas, opciones visualizadas ni cierre de ventana.

InstallationId es un GUID persistente aleatorio. GameId de salida es un token derivado con la instalación, no el ID local de partida. EventId es estable a partir de instalación y fuente, con formato compatible con el validador UUID existente; la unicidad de fuente impide duplicados. Una confirmación repetida conserva el evento original, incluida su sesión y fecha. Estos identificadores son seudónimos, no anonimato garantizado.

No se incluyen nombres, propietarios locales, correos, rutas, inventarios, contraseñas ni snapshots. La futura infraestructura no debe persistir IP como identificador estadístico. El contrato no es resistente a un cliente manipulado: el servidor deberá validar límites y duplicados y no confiar en cifras arbitrarias.

## 5. Tiempo e integración con Godot

El observador usa reloj monotónico; UTC se reserva para marcas temporales. Continúa el heartbeat F3.1 de 30 segundos y los reintentos locales de 5 segundos. Los cambios de estado cierran el intervalo anterior. El segmento humano utiliza el ámbito de partida/bioma confirmado del adaptador, evitando depender de la instantánea del menú.

Solo ActiveHuman/ActiveAnimal producen intervalos salientes positivos. Menú, pausa, segundo plano, carga y Game Over no suman tiempo efectivo ni generan operaciones de tiempo salientes. Los intervalos locales de control siguen disponibles para los mecanismos existentes. Se rechazan duraciones negativas y se excluyen intervalos de más de 60 segundos. Un salto entre observaciones superior a ese límite se considera suspensión: se conserva el tramo observado anterior y se excluye el hueco, con diagnóstico.

Instalación, sesión, token de partida y bioma permiten agregar tiempo total, por sesión/partida/bioma y hasta la finalización. Los offsets distinguen intervalos dentro de una sesión; el UTC de un intervalo proyectado indica su captura/proyección y no permite reconstruir exactamente cada frontera de reloj civil.

Se conservan los avisos existentes de pausa, muerte, reinicio animal, salida, CompleteBiome y final. No se duplican intervalos por recargar la escena ni por reintentar una escritura. El cierre normal primero vacía el observador y después reconcilia la Outbox con presupuesto acotado; lo ya persistido puede recuperarse al reabrir. Si no termina, informa cierre diferido/incompleto. Una interrupción inesperada puede perder hasta el heartbeat activo aún no persistido (30 segundos en funcionamiento normal); con errores de disco puede existir una pérdida mayor explícitamente diagnosticada. No se inventa tiempo entre procesos ni abandono definitivo de la partida.

## 6. Outbox, volumen y retención

Estados: pending, in_flight, confirmed, retryable_failure y permanent_failure. Las reservas son FIFO, máximo cinco eventos, lease de 60 segundos y número de intentos persistido. Un lease vencido permite recuperar el mismo evento con el mismo payload/hash. Una respuesta perdida no crea otro identificador.

Confirmar exige ID, lease y hash del evento; repetir el mismo recibo confirmado es idempotente. Esta comprobación local no autentica por sí sola a un servidor: la futura capa HTTPS deberá comprobar el recibo remoto antes de llamarla. No se promete ejecución exactamente una vez a nivel HTTP.

Fallo de red: reintento tras 30 segundos. `quota_exceeded`: conserva el evento y pausa hasta ResumeQuota explícito. Error permanente: conserva el evento y detiene el avance FIFO para revisión. No hay borrado automático, conversión de la cola histórica ni incremento de la cuota remota de 1000. B54 anterior conserva sus propios tiempos y contrato; la nueva cola comparte la garantía de conservación y reanudación explícita, no sustituye silenciosamente aquel protocolo.

La prueba de volumen usa 2200 intervalos. Se emite `STATISTICS_VOLUME_REVIEW` desde 50000 eventos; es un aviso, no una cuota destructiva. Pendientes y fallos se retienen sin vencimiento automático. A largo plazo aumenta el espacio local: se propone, para autorización futura, agregar tiempo confirmado por sesión/bioma/ventana horaria y conservar trazabilidad de los IDs originales antes de compactar. Nunca compactar eventos pendientes enviados previamente sin un protocolo que conserve deduplicación y recibos. No se ejecutó compactación sobre ninguna base.

Política propuesta para aprobar antes del despliegue: conservar eventos confirmados locales 90 días y agregados remotos sin detalle individual; definir retención remota y eliminación antes de recoger datos reales. No es una política ya aplicada. Aviso propuesto: «Two Sides guarda tu partida en este equipo y registra estadísticas seudónimas de decisiones, biomas y tiempo activo para mostrar resultados generales. No envía tu partida completa ni tu nombre. Las estadísticas pendientes se conservan sin conexión». La aprobación del aviso y de los controles de participación queda pendiente.

## 7. Pruebas y compilación

Todas las bases empleadas fueron sintéticas y desechables. Los ensayos de aislamiento de producción usan raíces temporales bajo TwoSidesTests/B77, no PlayerData de TwoSidesTest. No se ejecutó GameSave por defecto ni modos que abren los almacenes históricos fijos.

| Verificación | Resultado |
| --- | --- |
| Statistics.Checks B77 | 129 PASS. |
| GameSave.Checks, 19 modos sintéticos seleccionados | 721 PASS. |
| SQLite | 43 PASS; cero archivos sintéticos restantes según la suite. |
| F3.1 | 14 PASS; servidor falso en proceso. |
| B54 | 16 PASS. |
| Godot C# Debug | Código 0, cero errores, 63 advertencias históricas. |
| Godot C# ExportRelease | Código 0, cero errores, 63 advertencias históricas. |

Total automatizado: 923 comprobaciones aprobadas. No hay advertencias nuevas en las dos compilaciones respecto de la referencia de 63.

La batería nueva cubre instalación/repetición/reapertura, rollback de migración, base previa, rechazo de almacenes ajenos y Sync histórico, aislamiento entre raíces, seis combinaciones de finales, decisiones y cinco biomas, idempotencia, pérdida simulada de respuesta, leases, recibos, cuota, error permanente, triggers que fuerzan fallos de captura/reserva, recuperación del intento, 2200 intervalos, tiempo humano/animal, pausa/foco/suspensión, muerte/reinicio/cierre y nueva instancia tras interrupción. Rechaza payloads personales o incompatibles. Las regresiones incluyen progreso, selección, decisiones, navegación, finalización, estadísticas, observador y Outbox histórica.

Durante el desarrollo se corrigieron un identificador derivado incompatible con el validador UUID, un nombre ficticio demasiado largo y un ensayo de reinicio que reutilizaba incorrectamente el adaptador. Los resultados indicados corresponden a las ejecuciones corregidas. Evidencia: `.work/b77/statistics-checks.log`, `regression-results.json`, `game-regression-results.json`, `build-godot-final.log`, `build-export-config.log` y `final-verification.json`.

## 8. Integridad y compatibilidad B75

Verificador oficial v5: 3172 archivos, cero añadidos/eliminados/modificados/problemas; resultado correcto. SHA-256 del manifiesto preservado:

`2A4956E951217DFF2501D3FFBD35C9024554166E9126AD0134D8FB58C77AD726`

TreeDigest: `1f3f507348a479d88362767e9e548200003d646ad8930f54cbfc9efc6a9f8c28`. No se activó v5.

Verificador B75: PACKAGE PASS, 204 archivos. ZIP preservado:

`CF55AB6EDF0FE574ACFFCB0B1CCEF121F6FD4727864927770DC8423FAA709257`

No se abrió, copió, migró ni recalculó el hash de la SQLite histórica. Tampoco se accedió a PlayerData de TwoSidesTest. Su preservación en esta etapa se sustenta en no acceso y en las capacidades sintéticas utilizadas, no en una inspección nueva de esas bases. La validación manual PRESERVED de B75 es evidencia aportada por el propietario de aquel ejecutable; no valida todavía la interfaz de B77.

ExportRelease compila y conserva la configuración de distribución B75. No se generó exportación ni se reemplazó ZIP alguno. No se ejecutó Godot, Express, Caddy, Atlas, B67, C.2 o F.2; no se leyó .env ni se modificaron ACL, cuotas, cuentas o manifiestos. B00 continúa pendiente.

## 9. Reversión y validación posterior

Con el juego cerrado, verificar hashes de `before.json` contra los respaldos, restaurar únicamente los ocho fuentes originales y retirar los fuentes/pruebas nuevos mediante una operación autorizada. Recompilar y repetir regresiones sintéticas. No ejecutar scripts de restauración sobre PlayerData ni borrar tablas de estadísticas con pendientes. La reversión de código no implica reversión destructiva de la base; una futura migración inversa necesita inventario y autorización independientes.

Próximo ensayo manual, con autorización separada: nueva exportación en carpeta distinta y perfil/almacén aislado nuevo; crear partida, recorrer segmento humano/animal, decidir, pausar, perder foco, reiniciar, completar y cerrar/reabrir. Comprobar eventos, tiempos y Outbox en ese almacén desechable. No reutilizar ni actualizar automáticamente la partida validada de TwoSidesTest.

## 10. Próxima etapa mínima Express/Atlas

Diseñar un receptor `statistics-only-v1` con validación cerrada, límites de lote/tamaño, autenticación técnica de instalación sin cuenta personal, idempotencia por instalación/EventId y recibos ligados al hash. Reutilizar cliente HTTPS y manejo de reconexión donde sean compatibles, pero no los snapshots `game.report` ni credenciales de campañas anteriores. Confirmar recibos solo tras persistencia efectiva; mantener pendientes ante fallo.

Probar primero con Express falso/en memoria y SQLite sintética; después HTTPS local. Cualquier modificación del backend protegido requerirá su fase y manifiesto autorizados. Una campaña Atlas necesitará autorización independiente, cuenta mínima, aislamiento, limpieza exacta y resolución/aceptación informada de riesgos B00. El panel futuro presentará agregados, no fichas de jugadores. Ninguna de esas conexiones, migraciones remotas o interfaces web forma parte de B77.
