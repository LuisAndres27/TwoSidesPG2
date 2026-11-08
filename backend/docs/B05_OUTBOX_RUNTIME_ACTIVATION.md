# B05.3B.2B — Activación controlada Outbox runtime

Fecha:2026-10-28, America/Guatemala. **COMPLETADA EN CÓDIGO. Validación manual en Godot PENDIENTE.**

## Alcance y estado previo

Runtime única autorizada:
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\local-persistence\.work\runtime-game\save.sqlite3

Se revisaron contratos implementados de Outbox/captura/API/arquitectura, ensayo2A, roadmap, guardado/finales/estadísticas y planes runtime/pruebas/registros, contrastados con GamePersistenceAdapter/Context, CopyGameDatabase/OwnedCopyDatabase, SyncOutboxSchema, reconciliador y herramientas reales. Se conservaron exclusivamente game.report, session.report, gameplay.event y gameplay.interval; no tipos nuevos.

No se asumió igualdad con2A. El estado actual fue capturado de nuevo con tamaño618496 bytes, base v2/eventos v1 y sync ausente. Preflight no detectó Godot, dotnet, MSBuild o ejecutores de juego/escritura. Sin WAL/SHM/journal y cabecera rollback/DELETE. Espacio libre observado120157941760 bytes, superior a reserva mínima de20 veces tamaño+128MiB.

RuntimeCapability verifica ruta exacta, ruta final nativa, ausencia de reparse/hardlinks múltiples, FileId/ownership.json, application_id/esquema y bloquea ancestros contra sustitución. Mantiene lease de proceso y handles de protección: lectura hasta aprobar copia, una sola apertura de escritura y luego lectura de protección. Ningún proceso fue terminado; no se eliminaron sidecars.

No se certifica ausencia global de actividad OneDrive por telemetría. Estabilidad del origen se acreditó mediante bloqueos, byte-range lease, fotografía de datos y metadatos, y comparación contra respaldo inmediato antes de escribir. Ante proceso/escritura/diferencia/enlace/WAL inesperado, la herramienta se detiene sin migrar. Ninguna ACL se modifica para obtener permiso.

## Respaldo NUEVO y ensayo obligatorio

Subdirectorio privado nuevo:
C:\Users\luis2\AppData\Local\TwoSides\PrivateBackups\B05_OUTBOX\20261028T064735Z-50491e397de342c0854d5914e11d2635

Archivo:
runtime-consistent-20261028T064735Z-b1b9af059c504672aa5f42977288b8c5.backup.sqlite3

Tamaño618496 bytes.
SHA-256:**DC4CD39B47D79F3775825C3E0EFFC0C6CDAAC9B4F0849060D341969A085FFB0E**.
Captura2026-10-28T06:47:35.6631937Z = **2026-10-28 00:47:35.6631937 Guatemala (UTC−06:00)**.
Que el hash coincida con2A no se usó como sustituto de crear/verificar este respaldo nuevo.

SQLite BackupDatabase desde conexión read-only, con handles que impiden escritores, ownership/lease protegidos y sin sidecars. Backup íntegro/FK válidas, base2/eventos1, igualdad de todas las tablas/esquema original y servicios/estadísticas consultables. Carpeta/parent privados comprobados en lectura, herencia existente con Allow únicamente usuario legítimo,SYSTEM,Administradores, sin Set-Acl/owner/ACE. No sobrescrituras ni subida de datos.

Antes de activar se generó SEGUNDA copia privada desde el backup nuevo, se aplicó DDL exacto sync1, se verificaron índices/triggers/checksum, integridad/FK y dominio/estadísticas. Primera reconciliación de esa copia:54 páginas,658 operaciones,0 diagnósticos. Segunda en otro proceso:54 páginas,0 nuevas,IDs/hash/sobres/estados estables. Reaplicación DDL no cambia bytes. En tercera copia desechable, fallo antes de commit revirtió migración. Backup principal intacto. trial-context/result/restart-result y backup-manifest privados conservan evidencia sin imprimir datos individuales.

El backup contiene datos reales del jugador; mantenerlo privado, fuera de Git/OneDrive/Atlas/AWS. No se restauró ni copió al juego. La inmutabilidad se verifica por hash/metadatos/descriptor, no es WORM ni protección frente a administrador. No volcar trial-context.json, perfil, decisiones o payloads a consola.

## Migración e inicialización runtime realmente aplicadas

Comando explícito de esta fase:
BackupRehearsal.exe --activate-runtime-outbox
desde raíz exacta de la copia autorizada.

La herramienta nueva OutboxActivation.cs.txt exige OutboxTrial(forActivation:true) NUEVO y satisfactorio antes de habilitar escritura. Después reacquiere RuntimeCapability, vuelve a comparar metadatos/huellas/tabla/esquema contra backup y confirma ausencia de sync. Diferencia implica detenerse. No usa el resultado histórico como permiso.

DDL obtenido de la constante actual SyncOutboxSchema y hash comparado contra Checksum ya ensayado; las migraciones históricas no se editaron. Patrón de harness existente con reflexión limitado a esta operación explícita, no endpoint genérico ni automigración de Godot.

**Una transacción inmediata** contiene creación sync1/historial y dos pasadas de reconciliación inicial:
- Base v2 y gameplay v1 conservados; user_version/application_id iguales.
- Tablas sync_schema_migrations/sync_installations/sync_outbox/sync_dependencies, índices/UNIQUE/FK/triggers existentes.
- Binding local runtime NUEVO, independiente del binding de ensayo privado. No identidad remota/JWT.
- Primera pasada54 páginas:658 nuevas.
- Segunda pasada54 páginas:0 nuevas; fotografía completa de filas/esquema idéntica entre pasadas.
- **658 pending,1341 dependencias**,attempts0,receipt_json null. Ningún enviado/confirmado.
- integrity_check=ok,foreign_key_check sin filas, todo dominio y estadísticas iguales.

El estado se confirmó a2026-10-28T06:47:40.1499933Z, **00:47:40.1499933 Guatemala**.
Runtime después:2084864 bytes, SHA-256 A72A73537921995D7786480509A816BE92D707A9A54E4182C2DC918BEC4510A8.
Runtime anterior:618496 bytes, SHA-2569E8B9E9358F81124790CAF8DC918E6CB94A077D224CBB689AE0C46DCF9EFE130.

El hash cambió de forma AUTORIZADA por DDL/Outbox; no se presenta como conservación byte-a-byte de runtime. FileId/ownership manifiesto/propietario/descriptor de seguridad se conservaron; no reemplazo del archivo, chmod, ACL o restauración. La copia de backup puede tener hash físico distinto al origen porque BackupDatabase produce una copia lógica; igualdad lógica verificada.

Tras commit, herramienta protegió lectura de runtime, verificó SchemaManager/GameplayEventSchema/SyncOutboxSchema, integridad/FK, huellas de dominio y StatisticsService. Backup permanece intacto. activation-result.json privado conserva antes/después, resultado real, espacio/preparación y estado de commit. Ante fallo, activation-failure.json distinguiría si hubo commit y se detendría sin restaurar; no ocurrió fallo de activación.

## Conservación y límites de las comparaciones

Antes/después se compararon número de filas, huella de TODOS los valores y definición de cada tabla original, application_id y user_version. Solo se añadieron tablas/filas sync_*.

Se conservaron perfil y referencias, partidas activas/históricas, decisiones, consecuencias, cinco biomas por partida/completions, fronteras de continuación, resultados finales/cierre, recibos de dominio, sesiones, eventos e intervalos. No CreateNewGame/RecordDecision/CompleteBiome/PrepareFinal/CloseGame artificiales sobre runtime; la herramienta usa lecturas/proyecciones y escribe exclusivamente sync.

Estadísticas locales consultadas con el mismo StatisticsService/RealGameCatalog antes/después arrojan huella idéntica, incluidos valores desconocidos y cobertura. No nombres, IDs de jugador o decisiones individuales en el reporte. Recuentos/huellas detallados se mantienen en manifiesto privado.

Los dos archivos de bases históricas AppData y sus asociados permanecen protegidos, no abiertos para escritura ni migrados. Runtime ownership.json/store.lease no se reescribieron; lease byte-range temporal no cambia el contenido de archivo.

## Integración local mínima con Godot

Producción:
1. **LocalOutboxPump.cs.txt** nuevo: reconoce extensión ya activada, valida base/FK/integridad al iniciar pasada, verifica sync/eventos, obtiene perfil y binding local único, ejecuta página25 del reconciliador. Sin migración ni red.
2. **LocalOutboxScheduler.cs.txt** nuevo: worker asíncrono independiente de Godot, solicitudes coalescidas, barridos periódicos/reintento, cancelación y diagnóstico inmutable.
3. **integration/sqlite/GamePersistenceAdapter.cs**: compone pump/scheduler solo para su modo runtime autorizado; solicita reconciliación al abrir y DESPUÉS de resultados locales exitosos con SaveReceipt o GameplayWriteReceipt. Incluye capability explícita CreateSyntheticOutboxAdapter(SyntheticDatabase) para probar esta misma fachada sin tocar runtime.
4. **integration/sqlite/GamePersistenceContext.cs**: lee diagnóstico en _Process y publica únicamente cambio de código en consola. Errores de integridad compartida van a PushError [Local storage integrity]; otros a PushWarning [Local outbox]. No callbacks de worker hacia Nodes.

LocalGameState y los servicios escritores se reutilizan SIN editar su lógica. No FinNivel, Final.cs, menús, decisiones, consecuencias, eventos o escenas modificados. No segundo sistema de progreso, UI/login o autenticación remota.

La apertura de Godot **no migra** una base existente sin sync; informa OUTBOX_NOT_ACTIVATED y deja funcionar los servicios locales si la base es válida. La activación solo ocurrió por el comando explícito respaldado. Perfil ausente produce OUTBOX_WAITING_PROFILE; al crearse con commit, se prepara su binding. Si hay más de un vínculo local candidato, AMBIGUOUS_SYNC_BINDING, sin seleccionar/reasignar silenciosamente.

Instalación se lee de sync_installations y se conserva entre reinicios; una nueva solo se genera cuando no existe vínculo para el perfil, en la transacción de preparación. No se cambia la referencia de historial ni se introduce technicalAccountId.

## Scheduling, prioridad y ciclo de vida

No HTTP, sockets, JWT, Atlas o SDK de Godot en las clases nuevas de local-persistence. No Node/AWS.

OpenAsync configura worker y devuelve estado de juego sin esperar el escaneo completo. Cada página se ejecuta en Task.Run y usa la MISMA SemaphoreSlim _gate del adaptador que serializa servicios locales, evitando dos recorridos simultáneos de ese adaptador o escritura concurrente interna. Cola de peticiones/worker único; no un task por cada heartbeat.

Solicitudes de commits se coalescen2 segundos; reintento/barrido periódico30 segundos; pausa25ms entre páginas y límite25 candidatos por página (con prerrequisitos acotados). Una transacción/página puede esperar el busy_timeout1000ms existente y verificaciones/SQL pueden tener coste mayor al número de DTO: no garantía de latencia constante. El hilo principal nunca hace SQLite; un comando local concurrente espera como máximo la página que esté en curso bajo el gate, no un barrido entero.

Dispose/Close del adaptador cancela/espera al scheduler ANTES de cerrar capability DB, sin esperar al gate mientras el worker lo necesita. Cancelación interrumpe espera/coalescing/yield; una página ya iniciada finaliza commit/rollback y luego cesa. El worker solo retiene delegate/DTO, nunca Node/SceneTree. GamePersistenceContext publica diagnósticos en su hilo mientras sigue vivo; no envío a objetos liberados.

Al salir, cancelación puede dejar hechos confirmados aún sin captura. El próximo arranque/pasada completa los recupera. No se prolonga la salida para forzar un upload inexistente. El cierre de telemetría previo conserva su política/timeout; Outbox no cambia escenas/pausa ni el dominio.

Errores temporales de Outbox actualizan código seguro y esperan siguiente oportunidad; no reejecutan el comando de juego ni devuelven falso fallo a una decisión ya confirmada. Una base compartida corrupta/FK rota/versión base incompatible se etiqueta IntegrityFailure y se comunica como almacenamiento, no simple sync. No se esconde un fallo del propio guardado ni se promete jugar cuando la base de dominio es ilegible.

## Contratos, recuperación y atomicidad

Cuatro tipos/key/hash/estados de B05.3A/B.1 conservados. El scheduler usa el reconciliador actual y origin historical_import como política conservadora de procedencia de reconstrucción, incluso para hechos recientes recuperados. No se afirma cobertura live completa; fechas/IDs fuente medidos se mantienen. No hay cambio de formato bajo OperationId existente.

Captura normal del juego es **posterior al commit**, no atomicidad integral dominio–Outbox. El commit de decisión/completion/final no espera la preparación de cola. La ventana de fallo existe: otra pasada recupera hechos durables presentes. Revisiones intermedias reemplazadas, input humano preciso no exportado o telemetría nunca confirmada no se inventan. Los cuatro tipos no implican que cada callback o transición no persistida sea recuperable.

Recibos remotos siguen ausentes. Dependencias impiden reservar hijos antes de padres confirmados, pero no hay transport/consumidor que reserve/envíe automáticamente. Nadie marca confirmed por escanear. Filas existentes con contradicciones/huérfanos/dependencias incompletas quedan diagnosticadas, nunca borradas/reparadas por scheduler.

## Pruebas sintéticas y compilación

**28 comprobaciones nuevas aprobadas,0 fallidas** (--outbox-activation), sobre bases UUID propias. Prueban:
- Ausencia de sync sin automigración, extensión válida, perfil/binding y repetición/IDs estables.
- Adaptador real: nueva partida, decisión/consecuencia, completion, final confirmado/cierre/historial y nueva partida posterior.
- Cuatro tipos, ventana de commit sin cola, error de insert/captura con dominio conservado, recuperación tras fallo.
- SQLite ocupado, ambigüedad de binding, payload contradictorio, esquema base incompatible/FK rota etiquetados integridad.
- Reinicio de pump, estadísticas iguales, datos desconocidos y ausencia de HTTP/Atlas/JWT.
- Scheduler sin solapamientos, coalescing/reintento, cancelación y ausencia de callbacks tras cierre.
- Capability sintética rechaza ruta runtime antes de abrirla.

**713 regresiones reejecutadas,0 fallidas** (51 reconciliación+64 Outbox+598 offline). **Total741 comprobaciones distintas**. Procesos/reinicio/transacciones interrumpidas se ejercitaron en suites sintéticas anteriores reejecutadas; no fallos provocados en runtime ni backup.

Comandos:build GameSave.Checks.csproj/BackupRehearsal.csproj --no-restore --disable-build-servers -nodeReuse:false; GameSave.Checks.exe --outbox-activation y17 modos seguros de regresión más run-checks.ps1. .NET8.0.30/SQLite3.53.3 y paquetes existentes sin instalar.124 tests backend y12/12 manuales anteriores NO reejecutados.

Biblioteca/ejecutores0 errores/0 advertencias finales. TwoSides.csproj Rebuild con NUGET_PACKAGES fijado a caché local y GodotProjectDir a integration/sqlite/.work/: **0 errores,63 advertencias históricas CS0618 ParallaxBackground,0 nuevas**. No referencias/proyectos duplicados ni editor/motor Godot ejecutado.

Incidencias:primer test de perfil observaba inserción de binding antes de que el worker publicara su diagnóstico, se corrigió espera de la prueba, sin relajar garantía. Primeras compilaciones Godot omitían NUGET_PACKAGES y fallaron resolviendo SDK/catálogo NuGet; se corrigió entorno para usar caché ya instalada. No se atribuye ese fallo a concurrencia de código ni se instalaron dependencias. Activación real solo ocurrió después del resultado final correcto.

## Inventario de cambios

Producción:2 nuevos local-persistence/src/LocalOutboxPump.cs.txt y LocalOutboxScheduler.cs.txt;2 modificados integration/sqlite/GamePersistenceAdapter.cs y GamePersistenceContext.cs.
Tests:OutboxActivationChecks.cs.txt nuevo y dispatcher GameSaveChecks.cs.txt modificado.
Herramientas:OutboxActivation.cs.txt nuevo; BackupRehearsal.csproj/Program.cs.txt/OutboxTrial.cs.txt modificados para comando explícito y preparación nueva.
Documentación:este informe nuevo y nueve actualizaciones autorizadas (trial,capture,local outbox,GODOT_RUNTIME_TEST_PLAN,roadmap,PHASES,PHASE_HISTORY,DECISIONS,README).
Total20 archivos deliberados de fuente/documentación, más runtime autorizada y artefactos de build.

No cambios a migraciones históricas, modelos originales de progreso, GameSaveService, UnitOfWork, GameplayEventService, LocalGameState, actores/NPC/recursos, escenas, FinNivel, Final ni código Node. Los archivos protegidos/.env se comprueban al cierre por separado.

## Recuperación ante problemas

No restauración automática. Si falla preparación/backup/ensayo, no escribir runtime. Si falla la transacción de activación, rollback SQLite y diagnóstico distinguiendo Committed; detener escrituras adicionales de la herramienta. Si falla validación posterior tras commit, informar estado real y conservar backup/evidencias, sin revertir historia.

En juego, código Outbox temporal/revisión requiere inspección/reintento periódico; no borrar sync_outbox, cambiar UUID, reemplazar DB ni pedir login para repararlo. IntegrityFailure exige detener operaciones que dependan de la base y diagnóstico de almacenamiento: no «arreglar» valores por defecto. Comunicar código y acción sin secretos.

Una restauración manual futura requiere autorización expresa, nuevo respaldo del estado que se vaya a reemplazar, procesos cerrados, comparación/plan que preserve progreso posterior a este backup. El backup de activación es PRE-sync; restaurarlo indiscriminadamente perdería avances posteriores y cola capturada. No usar copia de ensayo como base runtime ni cambiar ownership/FileId para adoptarla.

## Validación manual pendiente

1. Abrir manualmente esta copia sin Node/internet. Continuar recupera la misma partida/perfil; sin login, pausa indebida o nuevo error.
2. Esperar preparación en segundo plano; revisar consola. No debe aparecer aviso Outbox al estar lista; código de revisión/almacenamiento se comunica de forma diferenciada. No se añadieron etiquetas visuales/servidor.
3. Crear partida únicamente si está permitido por cierre real. Jugar biomas en orden libre; confirmar decisión y comprobar consecuencias antes del animal. Meta física completa solo por actor permitido; no cambia mecánica.
4. Tras commits, esperar unos segundos de coalescing y trabajo; verificar en una futura consulta técnica autorizada la nueva captura estable. Abrir estadísticas no crea partidas/decisiones/eventos artificiales ni modifica valores desconocidos.
5. Completar los cinco y confirmar finales Bueno/Medio/Malo en partidas legítimas sucesivas; cierre e historial y Nueva partida mantienen reglas anteriores. No editar decisiones o borrar DB para forzar resultados.
6. Cerrar/reabrir normalmente en distintos puntos; mismo dominio, binding e IDs de cola sin duplicación. Un cierre antes de captura puede dejar pendientes que otra pasada reconstruya. No se recuperan recursos/posición exactos nuevos.
7. Probar pausa/Game Over/reintento/menú/estadísticas sin conexión, sin esperas remotas. Registrar cualquier código de diagnóstico con secuencia de acciones.
8. Fallos de disco/locks/corrupción se prueban SOLO en fixtures; no alterar runtime/ACL/backup para provocarlos. No abrir editor durante herramientas de mantenimiento.

No afirmar validación runtime/visual completa hasta respuesta del usuario. Antes de B05.4:validar manualmente captura/cierre/desempeño, revisar diagnósticos/binding/dedupe y límites de datos, acordar receptor/schema/vectores de canonicalización/identidad durable/custodia/ACL B00. **B05.4 no iniciada. No HTTP, Atlas, autenticación remota en Godot o AWS.**



## Cierre de integridad — 2026-10-28 Guatemala

**B05.3B.2B COMPLETADA EN CÓDIGO; VALIDACIÓN MANUAL GODOT PENDIENTE.**28 nuevas+713 regresiones efectivamente reejecutadas=741 aprobadas,0 fallidas. No sumar repeticiones ni filas de cola como tests. Ninguna prueba automatizada de errores se ejecutó contra runtime; su escritura fue exclusivamente el comando de mantenimiento autorizado tras ensayo y respaldo.

Inventario final comparado:20 archivos deliberados (15 existentes modificados y5 nuevos), cero eliminados;19 artefactos de compilación existentes bajo integration/sqlite/.work.godot cambiados se contabilizan aparte de .work excluido. Del inventario inicial1364,los1330 restantes permanecen idénticos en hash/tamaño/mtime. Sin cambios de migraciones históricas,fuentes originales de dominio/decisiones/finales o Node.

De9 archivos asociados a las tres bases, cambió SOLAMENTE runtime-game/save.sqlite3 por la migración sync1 y658 filas pendientes autorizadas. Las dos bases históricas AppData, sus manifiestos/leases y ownership.json/store.lease runtime permanecen idénticos en hash/tamaño/mtime. Runtime conserva FileId/owner/descriptor; tablas originales y estadísticas lógicas idénticas verificadas por la herramienta. No afirmar runtime íntegra byte-a-byte respecto del estado PRE-sync.

Backend/.env coincide con referencia histórica y conserva tamaño/fecha/owner/SDDL, sin leer contenido. Owner/SDDL de raíz/backend/.env/local-persistence/.git y carpeta backend iguales antes/después. Sin Set-Acl/ACE/herencia/propietarios/restauraciones;no se declara una nueva auditoría exhaustiva de cada ACL del árbol. B00 continúa pendiente.

Respaldo nuevo privado y copias de ensayo conservados e íntegros,ningún backup anterior sobrescrito. Backup SHA-256DC4CD39B47D79F3775825C3E0EFFC0C6CDAAC9B4F0849060D341969A085FFB0E. Nuevo backup/ensayo se crearon antes de migrar aunque el digest coincida con histórico. Cero archivos sintéticos bajo .work/databases y cero ejecutores propios restantes. Godot/HTTP/Node/Atlas/AWS no ejecutados. B05.4 no iniciada. Trabajo detenido a la espera de validación manual e instrucciones.


## B05.3B.2C — Auditoría runtime posterior a manuales (2026-10-28 Guatemala)

El usuario informa validación manual15/15 satisfactoria,cero errores nuevos. Auditoría2C de solo lectura confirma base2/eventos1/sync1 íntegros y853 pending (+195 posteriores a activación). No duplicados/contradicciones/huérfanos/ACK remoto.838/840 fuentes actuales representadas,además15 snapshots históricos. Faltan terminal de última sesión cerrada e intervalo Menu3932ms;compatibles con ventana de cancelación al salir.10 decisiones,10 completions y2 resultados/cierres representados. No reparar ni cerrar B05.3 como plenamente satisfactoria sin atender la observación.

Resultados,condiciones de lectura,cobertura,faltantes y recomendación en [B05_OUTBOX_RUNTIME_POSTVALIDATION.md](B05_OUTBOX_RUNTIME_POSTVALIDATION.md). Solo lectura/documentación,sin cambios runtime,ACL,.env oproducción. Esperar instrucciones;noB05.4.
