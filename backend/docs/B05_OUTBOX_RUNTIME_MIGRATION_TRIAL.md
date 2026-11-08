# B05.3B.2A — Ensayo privado de migración Outbox runtime

Fecha local: 2026-10-28, America/Guatemala. **COMPLETADA: respaldo verificado y ensayo sobre segunda copia independiente. Runtime original NO migrada.**

## Origen y preflight

Origen único: local-persistence/.work/runtime-game/save.sqlite3 de la copia autorizada. Dos bases históricas AppData se controlaron por hash/metadatos, no se abrieron como fixtures ni se migraron.

Inspeccionados contratos de captura/Outbox/arquitectura/API/roadmap, guardado/estadísticas/finales, planes de integración/pruebas Godot, registros de fases/decisiones y README, contrastados con código real. Los únicos tipos admitidos siguen siendo game.report, session.report, gameplay.event y gameplay.interval. No tipos nuevos, endpoints o cambios de sobre.

Get-Process y el harness antes de captura no detectaron Godot, TwoSides, GameSave.Checks, Infrastructure.Checks, dotnet u otros ejecutores conocidos de guardado. Se verificaron rutas sin reparse dentro de los anclajes permitidos. La runtime no tenía -wal, -shm o -journal; cabecera de lectura/escritura SQLite=1 (rollback/DELETE). Se mantuvieron handles FileAccess.Read/FileShare.Read sobre origen, ownership.json y store.lease: impiden escrituras/borrado mientras dura la captura/ensayo. Origen SQLite abrió Mode=ReadOnly, pooling=false, sin recuperación ni migración.

La presencia/inactividad global de OneDrive no se certificó por telemetría. Los bloqueos de escritura y comparaciones antes/después acreditan estabilidad de estos archivos durante la ventana observada. No se apagó OneDrive ni modificaron procesos/permisos.

Se utilizó Microsoft.Data.Sqlite.SqliteConnection.BackupDatabase, no File.Copy del archivo principal. Conserva una copia lógica consistente de la conexión fuente. No había WAL que incluir; si aparece WAL/SHM/journal, cambia cabecera o no se obtiene el bloqueo, esta herramienta se DETIENE. No se afirma cobertura ensayada de captura de una runtime WAL activa; requeriría otro plan de solo lectura y estado estable que no cree/recupere sidecars en original.

## Respaldo nuevo y privacidad

Directorio privado nuevo, sin sobrescribir:
C:\Users\luis2\AppData\Local\TwoSides\PrivateBackups\B05_OUTBOX\20261028T063105Z-0e9c06e76d554ed984a05275d12533d7

Respaldo:
runtime-consistent-20261028T063105Z-1b5fbe8956f549d2a8eeb42632d9c9bb.backup.sqlite3

Tamaño:618496 bytes.
SHA-256:**DC4CD39B47D79F3775825C3E0EFFC0C6CDAAC9B4F0849060D341969A085FFB0E**.
Captura registrada:2026-10-28T06:31:06.0102537Z, equivalente Guatemala **2026-10-28 00:31:06.0102537 UTC−06:00**.
Método:SQLite BackupDatabase desde conexión read-only protegida contra escritores.
PRAGMA integrity_check=ok; foreign_key_check sin filas; base2/eventos1/sync ausente.

Privacidad comprobada en lectura en padre y carpetas nuevas: propietario usuario actual; únicas Allow de usuario legítimo, SYSTEM y Administradores. Herencia existente ya privada, sin Set-Acl, protección de herencia, cambio de owner o ACE. GuardChain rechaza reparse. No se aplicó el método SecureRoot antiguo del harness porque altera permisos; el modo nuevo usa exclusivamente PrivateExisting.

backup-manifest.json conserva método, captura, metadatos origen/backup, tamaños/hashes, fingerprint de estadísticas y tablas/esquema con recuentos/huellas. No contenido de filas, nombres o decisiones en el informe. El respaldo SQLite SÍ contiene datos reales y se mantiene únicamente en privado fuera de Git/OneDrive/Atlas/AWS. trial-context.json contiene referencias necesarias de la copia y binding local, nunca se imprime; tratar todos esos artefactos como privados. No se restauró ni subió nada.

El archivo backup solo se usa como fuente de lectura de BackupDatabase e inspecciones. Inmutable por disciplina de la herramienta, verificado hash/tamaño/mtime/security antes/después; no se cambió ACL/atributo para hacerlo inmutable. Un administrador o proceso con acceso legítimo podría modificarlo; no es WORM ni firma criptográfica independiente.

## Segunda copia y migración

Archivo de trabajo independiente:
independent-outbox-trial-20261028T063106Z-9fb669bc44754645b41583bd054c603d.rehearsal.sqlite3

Se creó con otra llamada BackupDatabase desde el respaldo, no se migra el backup. Una capability CopyDatabase del harness valida directorio privado/rol/archivo propio; rechaza rutas de las tres bases protegidas. Migración solo permitida Role.Rehearsal o Role.Failure. No se amplió SyncOutboxSchema.MigrateSynthetic para aceptar runtime ni se cambió código productivo.

El harness sigue el patrón de ensayo existente: obtiene la constante SQL privada de SyncOutboxSchema por reflexión, comprueba SHA-256 contra Checksum y ejecuta exactamente ese DDL + fila de historial en transacción inmediata. El entrypoint público continúa limitado a SyntheticDatabase. Es ensayo del DDL/historial exactos sobre copia autorizada, NO un nuevo migrador runtime de producción.

Antes:base v2 + gameplay v1, sin sync.
Después:base v2 + gameplay v1 + sync v1.
Cuatro tablas nuevas sync_schema_migrations/sync_installations/sync_outbox/sync_dependencies; índices ix_sync_due/ix_sync_game, UNIQUE/FK y triggers verificados con SyncOutboxSchema.Verify. PRAGMA user_version y application_id conservados. Integridad ok y FK válidas antes/después.

Reaplicar migración no altera bytes. En otra copia desechable del backup se inyectó una excepción antes del commit del DDL: rollback completo, mismo hash/esquema/datos anteriores. No fallos provocados en original ni backup.

## Conservación de registros y estadísticas

Comparación por tabla: número de filas, hash de todas las filas ordenadas canónicamente y hash de definición SQL. Se verificó igualdad de TODAS las tablas originales, no solo totales. Esquema anterior y application_id/user_version preservados; únicas nuevas tablas son sync_*.

| Tabla/fuente original | Filas antes y después |
| --- | ---: |
| local_profiles |1|
| saved_games |2|
| biome_progress |10|
| environmental_decisions |5|
| environmental_state |10|
| continuation_snapshots |2|
| local_operations |25|
| local_settings / biome_objectives |0 /0|
| gameplay_sessions |10|
| gameplay_events |92|
| gameplay_intervals |564|
| schema_migrations / gameplay_schema_migrations |2 /1|

Estas comparaciones conservan partidas activas/históricas, decisiones/consecuencias, completions/resultados/fechas y sesiones/eventos/intervalos sin imprimir IDs, opciones individuales ni finales particulares. No se reescribieron resultados ni actividad.

StatisticsService.GetLocalStatistics, con RealGameCatalog y los servicios actuales, produjo el mismo fingerprint antes de migrar, después de migrar, después de reconciliar y tras repetir en otro proceso. Incluye estadísticas locales con sus disponibilidades/cobertura; no convertir null/desconocido en0. Huellas privadas en manifiesto; no salida de objetos que contengan perfil o decisiones.

## Reconciliación y reinicio

Se invocó PrepareSyntheticPage con la conexión/transacción de la capability de SEGUNDA copia privada, nunca sobre la runtime original. Binding de ensayo local nuevo asociado al perfil de la copia, sin identidad remota ni JWT; no se adopta ese UUID en el juego original.

Primera pasada:54 páginas, **658 operaciones nuevas**,0 diagnósticos.
Segunda pasada:otro proceso independiente,54 páginas, **0 nuevas**,0 diagnósticos; mismos IDs, hashes, sobres y estados. Los conteos de validaciones Existing pueden superar el número de filas por visitas a dependencias y auditoría; no son operaciones adicionales.

Resultado de copia:
- sync_installations:1.
- sync_outbox:658.
- sync_dependencies:1341.
- sync_schema_migrations:1.
- Ninguna operación enviada/confirmada remotamente; todas quedan pendientes, attempts0.

Fingerprint privado estable de la cola:
812C1010C097FBAD90DD31997A310FE80C28130659EA7180B025107CDFA6B578.

Se incluyeron proyecciones disponibles de partidas/decisiones/progreso/finales, session.report open/terminal válidos, eventos animales y todos los intervalos medidos elegibles. Se excluyen datos personales, credenciales, snapshots jugables y eventos SESSION_* redundantes como mensajes separados; no se reconstruyen eventos ausentes ni revisiones intermedias no conservadas. Requests de reinicio/reintento siguen siendo requests. Cobertura anterior desconocida permanece explícita.

Auditoría completa de filas y dependencias sin huérfanos, contradicciones o dependencias incompletas. No reparación de historial. Este resultado permite preparar futura activación, no certifica todos los posibles estados runtime futuros.

## Herramienta y archivos

Únicos cambios de código son de ensayo, no gameplay:
- local-persistence/backup-rehearsal/OutboxTrial.cs.txt nuevo: respaldo bloqueado read-only, copia privada, migración exacta, reconciliación, huellas y proceso hijo.
- Program.cs.txt: clase parcial y dispatch explícito --outbox-trial / --outbox-trial-restart.
- BackupRehearsal.csproj: incluye ese archivo, sin paquetes/lockfiles nuevos.

Los otros modos históricos del harness no se ejecutaron. En particular NO --migrate-runtime-controlled, --backup-and-rehearse ni SecureRoot (estos pertenecen a autorizaciones anteriores y no son el comando de esta fase).

Documentación autorizada: informe nuevo; B05_LOCAL_OUTBOX_IMPLEMENTATION, B05_OUTBOX_CAPTURE_RECONCILIATION, B05_IMPLEMENTATION_ROADMAP, PHASES, PHASE_HISTORY y DECISIONS actualizados. Total10 archivos deliberados. Artefactos de build .work se registran aparte; originales del juego y librería sin cambios.

Artefactos privados adicionales:backup-manifest.json, trial-context.json, trial-result.json, restart-result.json, backup SQLite, copia de ensayo y copia de rollback. Se conservan para revisión/recuperación futura; no restauración ni purga automática. No usar la copia migrada como reemplazo del juego.

## Pruebas y regresiones de esta fase

Comando real:build BackupRehearsal.csproj --no-restore --disable-build-servers -nodeReuse:false; BackupRehearsal.exe --outbox-trial. Subproceso interno --outbox-trial-restart solo admite contexto privado validado.

Ensayo real independiente:backups consistentes, migración/reaplicación/rollback, tablas/FK/integridad, igualdad de todo dominio/estadísticas, captura y repetición con reinicio/identidad estable. No contar las658 filas como658 casos de prueba.

Se reejecuta batería713 (51 reconciliación +64 Outbox +598 offline) exclusivamente en fixtures .work/databases/UUID, separada de la inspección/backup de origen real. Cubre migración interrumpida/reaplicada/version incompatible, duplicados y payload contradictorio, reserva/reconciliación interrumpida y reanudada, fallo de escritura, locks, reinicios/FK. Ningún test usa runtime o backup como destino de fallos. Los124 backend y12/12 manuales no se reejecutaron por ausencia de cambios compartidos y prohibición HTTP/Godot.

Tooling .NET8.0.30/SQLite3.53.3. Biblioteca/ejecutor de respaldo y base:0 errores/0 advertencias finales. Primer build detectó nullable, namespace y guardas Windows faltantes en archivo nuevo; se corrigieron antes de ejecutarlo. Sin instalación de dependencias, Node o servicios. No rebuild del juego requerido al no cambiar librería/controladores; resultado Godot63 advertencias es antecedente, no compilación nueva de esta fase.

## Riesgos y activación futura B05.3B.2B

Recomendación:compatibilidad del snapshot ensayado satisfactoria. **No activar ni migrar original todavía.** B00 sigue abierto; privacidad del nuevo backup no corrige ACL/código/secretos históricos de la copia OneDrive. No prueba de acceso efectivo futuro de todas las herramientas, apagón o escritor desconocido fuera de la ventana. Si fuente cambia después, este backup no reemplaza una nueva captura previa a activación.

Plan concreto, sujeto a autorización:
1. Volver a cerrar Godot/escritores, confirmar estabilidad/enlaces/sidecars/owner/ACL/hash y generar NUEVO respaldo privado verificado del estado de ese momento.
2. Aprobar capability/migrador runtime explícito, manteniendo base2/gameplay1 y aplicando sync1 en transacción; no reutilizar reflexión del harness como API operativa ni saltar restricciones de SyntheticDatabase.
3. Detección distingue sync ausente, sync1 válido y esquema desconocido/corrupto. Ausente no autoriza migrar por abrir un menú. Ante desconocido/corrupción detener función Outbox; progreso sigue mediante servicios existentes si su base es válida.
4. integration/sqlite/GamePersistenceAdapter.cs y GamePersistenceContext.cs:planear inicialización/coordinador local acotado después del arranque/perfil; UUID instalación persistente único, sin reutilizar binding de ensayo. No activar InitializeRemoteServices ni requerir JWT/internet.
5. Capturar únicamente después de commits de CreateNewGame/RecordDecision/CompleteBiome/PrepareFinal/CloseGame y hechos medidos por GameplayEventService, mediante reconciliación secundaria. Sin alterar FinNivel, Final, mecánicas o intención de esos comandos por defecto. Nueva captura/retentativa no vuelve a ejecutar el comando de dominio.
6. Reconciliar al iniciar y tras fallos, páginas acotadas fuera del frame, una tarea por almacén, cancelación/cierre controlados, backoff de errores, diagnósticos locales seguros separados del guardado. Una falla de cola no revierte decisiones/finales ni genera login. Cursor perdido implica nueva pasada idempotente.
7. Validar conservación de historia/estadísticas y cobertura con migración real autorizada antes/después. Rollback con cola poblada requiere diseño que preserve filas/backup aprobado; no RollbackEmptySynthetic ni restauración automática que borre progreso posterior.
8. Manuales offline:arranque/Continuar/nueva partida, cinco biomas en orden libre, decisiones, meta física, final/cierre, historial/estadísticas, reinicios normales y captura posterior sin pausa/login. Simular fallo de cola solo en fixtures; comprobar diagnóstico/reintento sin cambiar dominio. No iniciar Godot automáticamente.
9. HTTP/Atlas/AWS/receptor siguen fuera de B05.3B.2B salvo autorización futura específica. Nunca marcar delivered sin recibo remoto real; asociación remota y semántica del servidor necesitan B05.4/B05.5.

**B05.3B.2B y B05.4 no iniciadas. No migración/reconciliación de runtime original. Esperar autorización expresa.**



## Cierre verificado — 2026-10-28 Guatemala

**B05.3B.2A COMPLETADA.** Ensayo y preservación sobre el snapshot capturado satisfactorios; no activación de original. Resultado final de regresiones efectivamente reejecutadas:713 aprobadas,0 fallidas,0 omisiones (43 base+51 reconciliación+64 Outbox+555 restantes offline). Ensayo privado adicional descrito por separado, no sumado como cientos de tests por número de operaciones. Copia/reconciliación nueva0 diagnósticos; fallos provocados solo en copias desechables/sintéticas.

Inventario comparado antes/después:10 archivos deliberados (8 existentes modificados y2 nuevos), cero eliminados. Los1.354 restantes del inventario inicial de1.362 conservan hash/tamaño/mtime; artefactos .work excluidos, sin cambios adicionales de fuentes de Godot, librería local, Node o migraciones históricas.

Tres bases protegidas y9 asociados idénticos en hash/tamaño/mtime. Backend/.env coincide con referencia histórica, mismo tamaño/fecha, sin leer contenido. Owner/SDDL de raíz,backend,.env,local-persistence,.git iguales; sin modificación de ACL/ACE/herencia/propietario o restauraciones. B00 pendiente. Backup privado también conserva hash/tamaño/mtime/descriptor; contenido real no divulgado.

Cero archivos de bases sintéticas restantes bajo .work/databases. Copias PRIVADAS del ensayo/rollback y evidencias retenidas por contener la evidencia del trabajo autorizado, fuera de Git/OneDrive. No se sobrescribieron respaldos anteriores, no se restauró nada y no se ejecutó Godot/Node/HTTP/Atlas/AWS.

Recomendación:B05.3B.2B puede prepararse con autorización expresa basada en este ensayo, con NUEVO preflight y backup del estado vigente antes de tocar original. B05.3B.2B y B05.4 NO iniciadas. Detenido.


## B05.3B.2B — Activación local controlada (2026-10-28 Guatemala)

B05.3B.2A se conserva como antecedente. En2B se creó OTRO respaldo nuevo/ensayo de estado vigente antes de escribir runtime, sin asumir identidad con este snapshot histórico. Activación real posterior verificó base2/eventos1/sync1,658 pending y segunda pasada0 nuevas,dominio/estadísticas intactos. El backup histórico de2A no se sobrescribió ni restauró. Nueva ruta/hash/preflight/commit/evidencias en informe de activación.

Preflight,backup nuevo/hash,ensayo,migración,comparación,archivos/pruebas,riesgos y guía manual en [B05_OUTBOX_RUNTIME_ACTIVATION.md](B05_OUTBOX_RUNTIME_ACTIVATION.md). B00 pendiente;sin cambios ACL/propietario,autenticación remota,HTTP/Atlas/AWS oB05.4. Esperar validación manual e instrucciones.
