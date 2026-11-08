# B05.3B.2C — Auditoría de Outbox runtime

2026-10-28, America/Guatemala. **Auditoría completada; resultado PARCIAL respecto de los criterios de cierre. B05.3 no se declara cerrada satisfactoriamente.**

El usuario confirma15/15 comprobaciones manuales y cero errores nuevos. Se toma como validación informada por el usuario, no ejecución de Godot por esta auditoría. Las741 pruebas automatizadas previas NO se reejecutaron.

## Condiciones de lectura y alcance

Único origen runtime:
local-persistence/.work/runtime-game/save.sqlite3, en la copia autorizada.

No se detectaron Godot/TwoSides/ejecutores de guardado activos antes de inspeccionar. Sin WAL,SHM,journal; cabecera SQLite rollback/DELETE. Se validaron rutas nativas sin reparse/hardlinks múltiples y se mantuvieron handles FileAccess.Read/FileShare.Read sobre base,ownership.json y store.lease, junto con bloqueo de sustitución de directorios. Ningún proceso se terminó ni archivo asociado se eliminó.

Conexiones Microsoft.Data.Sqlite Mode=ReadOnly,pooling=false,cache privada,query_only=ON. Snapshot de lectura para comparar fuentes/cola; estadísticas en conexión también read-only bajo los mismos handles sin escritores. No immutable,checkpoint,VACUUM,migración,reconciliación de escritura o reparación. Si hubiera WAL/sidecar/cabecera distinta, el helper se detiene para otra estrategia; no ignora transacciones WAL.

Herramienta temporal bajo local-persistence/.work/outbox-read-audit, fuera de producción. Se compiló con bibliotecas/paquetes ya almacenados en caché local, sin red ni nuevas dependencias. Reutiliza por reflexión SOLO normalización Read/SourceKey/Parents existentes, todos de lectura; no llama Capture,PrepareSyntheticPage,LocalOutboxPump,Reserve o Confirm. Query-only y apertura read-only impiden que un descuido se convierta en DML.

Documentación revisada:activación2B,ensayo2A,captura/reconciliación,Outbox,arquitectura/API/roadmap,planes de prueba y registros. Código contrastado de esquemas,fuentes,proyecciones,dependencias,scheduler,adaptador,observador y cierre del contexto.

La última lectura completa fue2026-10-28T07:11:29.3697483Z = **2026-10-28 01:11:29.3697483 Guatemala**. Lecturas repetidas arrojaron los mismos conteos y faltantes.

## Esquema, integridad e índices

Base v2 + gameplay/eventos v1 + sync v1,con historiales/checksums correctos.
PRAGMA integrity_check=ok.
PRAGMA foreign_key_check sin filas.
Verificados los tres índices únicos de sync_outbox por sus columnas:
- operation_id.
- local_player_id,installation_id,binding_generation,source_key.
- operation_id,local_player_id,installation_id,binding_generation.

Índices de consulta ix_sync_due/ix_sync_game y triggers/esquema sync verificados por SyncOutboxSchema.Verify. Solo un binding local para el perfil; no asociación remota inventada. Base íntegra no significa captura completa: ambos resultados se informan por separado.

## Conteos actuales y comparación con activación

**853 operaciones**,todas pending.

| Estado | Cantidad |
| --- | ---: |
| pending |853|
| in_flight |0|
| confirmed |0|
| retryable_failure |0|
| permanent_failure |0|

| Tipo implementado | Operaciones |
| --- | ---: |
| game.report |17|
| session.report |23|
| gameplay.event |98|
| gameplay.interval |715|
| **Total** |**853**|

No se agregaron tipos nuevos. Perfil solo aporta referencias locales; decisiones/consecuencias/progreso/resultados/cierre se incluyen en game.report. Eventos animales e intervalos conservan fuentes originales; SESSION_STARTED/ENDED se representan mediante session.report, sin otra operación equivalente de sesión.

Activación:658 pendientes. Actual:853,**195 adicionales**. Las fechas de creación sitúan658 filas antes o al término registrado de activación (2026-10-28T06:47:40.1499933Z) y195 después. No se atribuyen automáticamente a una comprobación manual concreta; no hay traza de acciones para hacerlo.

Entre los game.report creados después de activación:
-14 reportes contienen decisiones.
-13 contienen al menos un bioma completed.
-2 contienen un resultado final.
-1 contiene cierre global completed.

Son reportes/revisiones, NO14 decisiones distintas ni13 biomas diferentes. No sumar revisiones como hechos nuevos.

## Cobertura real de fuentes

Se comparó cada fuente elegible actual por clave canónica,propietario,instalación y generación,además del contenido normalizado. Para partidas se exige una representación de la revisión actual; revisiones capturadas anteriores siguen siendo snapshots históricos válidos.

| Hechos elegibles actuales | Elegibles | Representados | Faltantes |
| --- | ---: | ---: | ---: |
| game.report: revisión actual por partida |2|2|0|
| session.report: apertura y terminal confirmados |24|23|1|
| gameplay.event: eventos animales medidos |98|98|0|
| gameplay.interval: intervalos confirmados |716|715|1|
| **Total** |**840**|**838**|**2**|

853 filas de Outbox =838 representaciones de fuentes actuales +15 snapshots históricos de game.report. No se compara853 contra840 como si fueran el mismo universo.

Cobertura del dominio:
-10/10 decisiones originales representadas con DecisionId/OperationId/consecuencias/versiones coherentes.
-10/10 parejas partida/bioma completed representadas.
-2/2 partidas con resultado final representadas.
-2/2 cierres globales representados.
-2 partidas completed,0 activas; perfil conservado.
-Consecuencias ambientales verificadas contra sus decisiones y resultados.

Exclusiones legítimas:24 eventos de sesión SESSION_STARTED/ENDED no generan operaciones separadas redundantes; están contemplados mediante24 reportes lógicos (uno de esos reportes aún falta). No hay profile.report,nuevas métricas de entrada humana,no snapshots de recursos/posición ni prueba de final leído. No se reconstruyen revisiones intermedias no conservadas,tiempo anterior a instrumentación,eventos no confirmados o éxito de reinicio a partir de solicitudes.

## Dos hechos confirmados faltantes

Ambos corresponden a la sesión más reciente,guardada como closed:
- **session.report terminal**,con cierre confirmado en fuente.
- **gameplay.interval Menu**,start_ms0,end_ms3932,es decir **3,932 segundos de menú**. No es intervalo de tiempo efectivo ni está ligado a una partida/run animal.

Fechas fuente,Guatemala:
- Inicio:2026-10-28 01:05:22.7889721.
- Cierre:2026-10-28 01:05:26.7209109.
- Última creación de Outbox:2026-10-28 01:05:26.421.

La última captura precede al cierre unos300ms. En fuentes existen el cierre y el intervalo completos; no son datos desconocidos ni telemetría perdida del dominio. La Outbox todavía no los copió. No se crean filas durante la auditoría.

### Explicación compatible con el código, sin atribución de acciones no registrada

GamePersistenceContext.QuitAsync espera Telemetry.CloseAsync,que confirma Flush final y SESSION_ENDED. Después tree.Quit provoca _ExitTree;State.DisposeAsync llega a GamePersistenceAdapter.DisposeAsync,que cancela el LocalOutboxScheduler. El scheduler coalesce solicitudes2s y no fuerza un último barrido de cierre. Un commit de telemetría puede,por tanto,quedar después de la última página y antes de cancelar el worker.

La secuencia temporal observada y la implementación son compatibles con esa ventana de captura posterior al commit,documentada en2B. Sin trazas de ejecución no se asegura cuál callback exacto o prueba manual la produjo. El diseño permite recuperar ambas fuentes en otra pasada; esta auditoría NO ejecutó esa pasada,ni simulación de escritura ni reparación automática. No afirmar recuperación efectuada hasta comprobarla.

No se detectó pérdida de decisiones,biomas,finales o progreso. La ausencia de captura de dos hechos impide cumplir el criterio3 (“hechos elegibles representados”) y cerrar B05.3 como plenamente satisfactoria en esta fotografía.

## Idempotencia, contradicciones y referencias

Resultados de lectura:
-0 claves idempotentes duplicadas.
-0 payloads contradictorios con fuente comparable.
-0 filas huérfanas.
-0 referencias a binding incorrecto.
-0 dependencias incompletas en las filas YA existentes.
-1790 relaciones de dependencia.
-0 errores persistidos en last_error_code.
-0 intentos,reservas,leases o recibos remotos presentes.
-0 estados inválidos o confirmaciones remotas inventadas.

Se verificaron canonicalización,SHA-256,sobre/identidad/source_key,proyección por fuente actual y prerrequisitos sesión/partida/run. Los15 game.report históricos no pueden reconstruirse completamente desde la revisión actual:se comprobó hash/sobre,existencia de partida,metadatos inmutables y que sus decisiones sigan coincidiendo con las fuentes. Esa limitación se mantiene explícita; no se declara comparación exacta de cada estado intermedio desaparecido.

“0 dependencias incompletas” no significa que no falten operaciones:las dos capturas ausentes se contabilizan en cobertura,antes de que exista una fila con dependencias que revisar. Ningún resultado se interpreta como entrega remota.

## Historial y estadísticas

Fuentes actuales:1 perfil,2 partidas,10 decisiones,10 filas de progreso y10 ambientes,12 sesiones,122 eventos,716 intervalos. Consultas locales coherentes:
-2 partidas completed,0 activas.
-10 decisiones y10 biomas completados.
-12 sesiones medidas.
-13 muertes,3 solicitudes de reinicio voluntario y9 solicitudes de reintento.
-Tiempo efectivo confirmado1146846ms (**19min6,846s**),sin sumar el intervalo Menu faltante.
-HistoricalCoverageUnknown=true.
-Incomplete=false para la actividad local guardada; esto no equivale a cobertura Outbox completa.
-Contrato histórico Uncollected.PlayedMilliseconds permanece NotAvailable; no se transforma en0 por existir actividad nueva.

Además se leyó en modo read-only el backup privado de activación,verificando antes su SHA-256 histórico. Se compararon filas originales contra sus IDs en runtime actual:
-5/5 decisiones anteriores siguen presentes y exactamente iguales.
-92/92 eventos anteriores siguen presentes e iguales.
-564/564 intervalos anteriores siguen presentes e iguales.

Los conteos nuevos frente a activación son compatibles con actividad posterior; no se presentan como alteración de datos por esta auditoría. La igualdad de fuentes anteriores y la coherencia actual descartan reescritura en esas comparaciones; no prueban toda conducta de frames o causas de acciones manuales.

StatisticsService no se modificó. No se evaluó artificialmente CompleteBiome/PrepareFinal/CloseGame para obtener datos. La Outbox contiene proyecciones,pero no interviene en la regla local de finales.

## Ejecuciones de esta fase

Solo auditoría real de lectura y documentación. Helper temporal OutboxReadAudit compilado con .NET8 y proveedor existente,0 errores/0 advertencias. Restore exclusivamente desde caché local de paquetes,sin servicios ni dependencias nuevas. Artefactos temporales bajo .work;ningún archivo de producción o proyecto Godot editado.

No se ejecutaron las741 pruebas anteriores ni nuevas pruebas de gameplay. Las15/15 manuales son resultado aportado por el usuario. Lecturas ampliadas/repetidas no se cuentan como nueva batería automatizada.

No Godot,Node/HTTP/Atlas/AWS,checkpoint,VACUUM,migración,backfill o reconciliación de escritura. No copia de trabajo con simulación mutante fue necesaria;el diagnóstico proviene de fuentes reales en read-only y análisis de código.

## Conclusión y recomendación para B05.4A

**B05.3B.2C auditada,resultado PARCIAL:dominio e integridad satisfactorios;captura final de sesión incompleta en2 hechos. B05.3 no cerrada sin observaciones.**

Antes de B05.4A recomendar:
1. Autorizar separadamente una corrección/validación acotada del cierre de captura o aceptar explícitamente la recuperación diferida en el siguiente arranque. No bloquear progreso para esperar red ni inventar recibos.
2. Probar en fixtures la ventana CloseAsync/DisposeAsync,commit de terminal/último intervalo,cancelación del worker y siguiente arranque idempotente. Un flush local debe tener presupuesto y diagnóstico,sin callbacks sobre Nodes liberados.
3. Reauditar después de recuperación autorizada:840 fuentes actuales de esta fotografía representadas sin nuevas contradicciones (recalcular si cambia la actividad),mismos IDs ya existentes y estados pending. No reparar con UUID/fuentes fabricados.
4. Solo después,autorizar diseño/implementación de receptor B05.4A con contratos/dedupe/recibos/identidad/canonicalización y seguridad B00 tratados de forma explícita. Los853 pendientes no autorizan transmisión.

No se corrigió ningún archivo productivo ni fila. Las limitaciones de cobertura histórica y posible pérdida de telemetría nunca confirmada siguen vigentes. B00 pendiente,sin cambios de ACL/ACE/owner/herencia. **B05.4 no iniciada;detenido a la espera de instrucciones.**



## Verificación final de no modificación

Inventario antes/después:5 documentos existentes autorizados actualizados y1 informe nuevo,cero eliminados. Los1364 archivos restantes del inventario inicial de1369 conservan hash/tamaño/mtime. Herramienta y artefactos temporales solo bajo .work excluida;ningún archivo de producción,proyecto oStatisticsService cambiado.

Las tres bases originales y9 archivos asociados idénticos en hash/tamaño/mtime durante esta auditoría, incluida runtime posterior al juego manual. No comparar su hash actual con el PRE-sync para exigir igualdad;se comparó exactamente el estado al inicio de esta fase.

Backend/.env coincide con referencia histórica,tamaño/fecha intactos,sin leer valores. Owner/SDDL de raíz,backend,.env,local-persistence,.git iguales antes/después;sin cambios ACL/ACE/owner/herencia. B00 pendiente. El backup privado de activación leído como referencia conserva su SHA-256 esperado. No exportación de datos personales,restauración o copia mutante.

Resultado **PARCIAL para cierre B05.3**:853pending,840fuentes actuales elegibles/838representadas,2faltantes confirmados.No se repararon. Integridad y dominio coherentes;B05.4A no iniciada. Las741pruebas y15/15manuales son resultados anteriores/informados,no nuevos tests. Trabajo detenido.

## B05.3B.2D — Diagnóstico posterior, sin reparar runtime (2026-10-28)

Nueva auditoría read-only a07:30:30.6941168Z confirma853pending y los mismos2faltantes:terminal de última sesión cerrada e intervalo Menu0..3932ms. Se reproduce con observador/scheduler reales sobre SQLite sintético la ventana commit→captura diferida→cancelación; no hay trazas suficientes para atribuir cada callback de la sesión real. Reconciliar recupera exactamente2 filas; segunda pasada/reinicio0 nuevas,UUID/payload/tiempos preservados. No hay defecto demostrado en reconciliación que justifique parche productivo en esta fase.

24 pruebas nuevas +741 regresiones reejecutadas=765/765. Biblioteca/ejecutores0errores/0advertencias; rebuild C# Godot0errores/63históricas,0nuevas; motor no ejecutado. Runtime y ambas bases históricas sin cambios; .env histórico intacto y ACL conservadas. B05.3B.2D COMPLETADA solo diagnóstico/sintético;B05.3 sigue pendiente mientras existan2faltantes. Propuesta de drenaje acotado posterior al cierre de telemetría, NO aplicada, y evidencias en [B05_OUTBOX_SHUTDOWN_RECOVERY.md](B05_OUTBOX_SHUTDOWN_RECOVERY.md). B00 pendiente;sinB05.4.

## B05.3B.2E.1 — Corrección en código, sin reparación real

2026-10-28. **COMPLETADA EN CÓDIGO; validación Godot pendiente.** La unidad comprobada en modelo, esquema, reloj y proyección es milisegundos: **3932 ms = 3,932 segundos**. Escribir «3,932 ms» no describe ese total en notación decimal española. Menu conserva su categoría y no aporta tiempo efectivo animal.

Cierre con Task compartida: telemetría hasta 3 s; después, barrera Outbox hasta 1 s; liberación hasta 1 s y tree.Quit. La barrera espera la página activa, reinicia cursor y omite coalescing. Timeout devuelve OUTBOX_CLOSE_DEFERRED sin éxito tardío. Se reutiliza la reconciliación inicial existente.

26 pruebas nuevas + 765 regresiones = **791 aprobadas**, cero fallidas. Builds sin errores; Godot C# conserva 63 advertencias históricas y cero nuevas. Motor no ejecutado. Bases y .env intactos, ACL conservadas; B00 pendiente. Runtime sigue con la fotografía de 853 pending y dos faltantes. B05.3 no cerrada. E.2 requiere autorización expresa para respaldo, ensayo, recuperación real y manuales. Abrir Godot podría recuperar por startup y no está autorizado aquí. [Implementación y límites](B05_OUTBOX_SHUTDOWN_RECOVERY.md). B05.4 no iniciada.

## B05.3B.2E.2 — Estado actual posterior al uso manual

2026-10-28. La fotografía de 853 pending con dos faltantes es histórica. Auditorías actuales, antes y después de respaldo/ensayo, confirman **906 pending, 889/889 fuentes actuales y cero faltantes**. Hay 17 snapshots game.report históricos adicionales; no se confunden con fuentes actuales. Ambos hechos antiguos ya están representados, incluido Menu de 3932 ms. Auditoría final de lectura: 08:50:38.9398234Z, integridad ok/FK válidas y cero duplicados, contradicciones, huérfanos o dependencias incompletas.

E.2 no insertó ni escribió runtime: respaldo nuevo privado verificado y dos pasadas independientes con cero inserciones. Estados, partida activa, historial, decisiones, finales y tiempo efectivo actual 1158719 ms conservados. 791 regresiones reejecutadas, todas aprobadas; cero nuevas. Manuales E.1: 10/10 informados por el usuario, no repetidos por el agente. Sin nueva compilación Godot ni cambio productivo.

E.2 COMPLETADA; B05.3 local satisfactoria y completada, sin autorizar transmisión ni cerrar B05 completo. B00 pendiente, .env y bases intactos, sin cambios ACL. [Respaldo, ensayo, auditoría e incidencias](B05_OUTBOX_RUNTIME_RECOVERY_RESULT.md). B05.4 no iniciada; trabajo detenido.
