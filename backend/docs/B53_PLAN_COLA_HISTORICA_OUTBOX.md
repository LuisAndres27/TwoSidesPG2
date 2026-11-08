# B53 — Plan seguro para la cola histórica de la Outbox

Fecha: 2026-11-03. Solo análisis y planificación. No se modificó ninguna SQLite (la original ni la copia de B52), código, pruebas, Godot, cuotas, manifiestos ni operaciones. No se usó Atlas, Express, Caddy ni certificados. Sin commits ni push.

Convención: **[H]** hecho comprobado (código o datos leídos), **[Hip]** hipótesis o estimación no medida.

## 0. Corrección a B52 (importante)

B52 relacionó el `ACCESS_DENIED` con la reanudación de standby de las 07:02. **Esa relación no se sostiene.** Los datos de la copia muestran que la sesión del aviso (`ca329aed…`) empezó a las 06:23:30Z (00:23 local) y terminó a las 13:05:06Z (07:05 local): duró 6,7 h. El aviso apareció justo tras el primer cambio de escena, es decir, al principio de esa sesión, y los fallos de audio WASAPI (probablemente del standby de las 07:02) vienen **después** en el log. Lo que sigue en pie de B52: el error fue transitorio, ya que el pump siguió escribiendo durante horas (1154 intervalos de esa sesión, todos con fila en la Outbox), y no hubo pérdida. La causa A (archivo `-journal` en borrado pendiente) sigue siendo una hipótesis sin confirmar; el contexto de standby debe descartarse. No edité B52 por no estar autorizado.

## 1. Método y fuentes

- Esquema y reglas: `SyncOutboxSchema`, `SyncOutboxService.cs.txt`, `SyncOutboxDispatcher.cs.txt`, `SyncOutboxModels.cs.txt`; servidor: `ingestion-engine.js`, `ingestion-service.js`, `relations.js`, `schemas.js`, `mongo-ingestion-repository.js`.
- Datos: **solo** la copia aislada de B52 (`scratchpad/b52-copy/copy.sqlite3`), abierta con `mode=ro&immutable=1`. SHA-256 de la copia y de la base original = `9FE793A2…070C` antes y después. Las simulaciones se calcularon en memoria; no se creó ni escribió ninguna copia nueva.

## 2. Inventario exacto [H]

| Tipo | Operaciones | Bytes medios | Estado |
|---|---|---|---|
| `gameplay.interval` | 1993 | 546 | pending, 0 intentos |
| `gameplay.event` | 104 | 695 | pending |
| `session.report` | 33 | 579 | pending (17 `open` + 16 `closed`) |
| `game.report` | 21 | 2351 | pending (18 `in_progress`, 2 `completed`, 1 `final_pending`) |
| **Total** | **2151** | 1,23 MB | todas `historical_import`, sin errores, sin leases, sin `source_key` duplicado |

- **Qué representa cada tipo**
  - *Decisiones y progreso:* viven dentro de `game.report`, cuyo payload trae `decisions` (51 en total entre los 21 informes), `biomes`, `ending`, `revision` y `status`. Son 3 partidas: 2 completadas y 1 en curso. Cada informe es una revisión de la partida (p. ej. una partida tiene 16 revisiones); el servidor marca `superseded` las anteriores a la más alta.
  - *Sesiones:* `session.report` (open/closed).
  - *Eventos de animal:* `gameplay.event` (35 inicios, 34 salidas, 13 muertes, 10 completados, 9 reintentos, 3 reinicios).
  - *Tiempo:* `gameplay.interval`. Estados: Background 1380, ActiveAnimal 290, Menu 201, Loading 77, Paused 23, GameOver 22.
- `SESSION_STARTED/ENDED` (17+17) **no** tienen fila propia: los cubre `session.report`.
- **Hallazgo:** la sesión de 6,7 h aún no tiene su `session.report` *closed* (solo el *open*), aunque la sesión está `closed` en `gameplay_sessions` y tiene `SESSION_ENDED`. Es consistente con el `OUTBOX_CLOSE_DEFERRED` del cierre. Se generará en la próxima reconciliación (+1 operación). Los 1154 intervalos de esa sesión sí están cubiertos.
- Orden por `created_at_utc`: las **primeras 1000** son las 158 operaciones no-intervalo **más** 842 intervalos; las **1151 restantes son todas intervalos** de la última sesión. [Hip: el dispatcher las enviaría en ese orden (`ORDER BY created_at_utc, operation_id`, filtrado por dependencias confirmadas)].

## 3. Dependencias e integridad [H]

- 3162 filas en `sync_dependencies`, máximo 3 por operación:
  - intervalo → `session.report`: 1993 (todos);
  - intervalo → evento de segmento de animal: 438; intervalo → `game.report`: 438;
  - evento → `session.report` 104, → `game.report` 104, → otro evento 69;
  - `session.report` closed → open: 16.
- El cliente solo reserva operaciones cuyos padres están `confirmed`; el servidor responde `deferred` (`dependency_missing`) si el padre no existe y `422 invalid_dependencies` si hay ciclo.
- **Restricciones del servidor** (`relations.js`): los intervalos de una sesión **no pueden solaparse**; `endMs ≤ endOffsetMs` de la sesión cerrada; intervalos `ActiveAnimal` terminan antes del evento terminal de su corrida; `idempotency_conflict` si un `operationId` repite con otro hash; `superseded` si llega una revisión menor de `game.report`.
- La cuota **no distingue tipos**: `ownCount` = todas las operaciones del propietario (`ingestion-engine.js:112`, `mongo-ingestion-repository.js:154`). Los duplicados idénticos devuelven antes de la cuota; solo las operaciones **nuevas** cuentan.
- `sync_outbox` tiene triggers `sync_outbox_immutable` y `sync_confirmed_immutable` y esquema CHECK de estados: no existe un estado «omitido localmente», y los códigos de error permanentes admitidos son solo 4 (`payload_conflict`, `invalid_fact`, `unsupported_contract`, `unsupported_rules_version`).
- 5 de los 21 `game.report` no tienen hijos; 172 operaciones dependen de revisiones que **no** son la última. Por tanto **no** es seguro omitir revisiones intermedias de `game.report`: hay hijos que apuntan a ellas.

## 4. Viabilidad de compactar intervalos

Todos los pares consecutivos de una sesión son **adyacentes** (1976 de 1976; sin huecos ni solapes) y el 99,9 % duran 5000 ms o menos (producto de la cadencia anterior de 5 s). Fusionar intervalos adyacentes con el mismo estado y contexto (sesión, juego, bioma, corrida de animal) da (calculado sobre la copia):

| Regla de fusión | Segmentos | Total Outbox | Grupos con dependencias idénticas |
|---|---|---|---|
| Sin límite de duración | 363 | **521** | 357/363 |
| Máx. 30 min | 370 | 528 | 364/370 |
| Máx. 5 min | 386 | 544 | 380/386 |
| Máx. 60 s | 486 | 644 | 480/486 |
| Máx. 30 s | 639 | 797 | 633/639 |

- Un grupo de 1120 intervalos consecutivos (la sesión de 6,7 h) explica casi toda la reducción.
- **En 6 grupos las dependencias difieren** (el intervalo cruza una revisión de `game.report`): la clave de fusión debe incluir el conjunto de dependencias, o se rompería el orden causal. Con eso resultan unos 369 segmentos y ≈ 527 operaciones [Hip: el valor exacto exige implementar la regla].
- **Semántica**: fusionar adyacentes iguales conserva el tiempo total por estado, el contexto, los puntos de cambio de estado y la no superposición. Pierde las marcas internas de latido y la granularidad de idempotencia por intervalo. [Hip: ninguna regla de servidor revisada usa los latidos; si más adelante las estadísticas del servidor lo hicieran, habría que revisarlo]. Los hechos fuente (`gameplay_intervals`) no se tocan.
- **Obstáculo técnico [H]**: las filas de Outbox son inmutables y no hay estado «reemplazada». Compactar exige operaciones nuevas (nuevo `operationId`, `sourceKey` y hash) y una forma de retirar de la cola las 1993 pendientes: migración de esquema de la Outbox real o filtro en el despacho. **No se puede hacer sin cambiar código y esquema**, y no se debe borrar ni reescribir nada ahora.

## 5. Comparación de alternativas

Cuota actual: 1000 por propietario (valor por defecto del constructor, sin otro cableado; máximo del constructor 10000). Tabla sobre las 2151 + 1 pendiente (cierre de sesión).

| Alternativa | Resultado con la cola actual | Crecimiento futuro | Cambios necesarios |
|---|---|---|---|
| **A. Mantener 1000** | Se aceptan 1000; **1152 intervalos de la última sesión quedan bloqueados**. Las 158 no-intervalo sí entran [Hip por orden]. | Tras llenar, **toda** operación nueva (también decisiones y `game.report`) recibe 429. **No viable para seguir jugando.** | Ninguno, pero exige manejo de 429 |
| **B. Subir a 3000** | Cabe todo (2152) con 848 de margen. | Margen ≈ 7 h de juego en primer plano a 120 intervalos/h [Hip: depende del uso]. Después, mismo bloqueo. | `backend/src` (manifiesto v5) |
| **C. Subir a 10000** | Cabe todo. | ≈ 65 h de margen; el coste por operación crece con el historial [Hip; B48/F3-03: sin medir]. | `backend/src`; medición de latencia a 3000+ |
| **D. Compactar solo la cola histórica** | ≈ 527 operaciones. | Las nuevas siguen a 120 intervalos/h; se recupera ≈ 1,6 mil de margen respecto a hoy, no cambia la pendiente. | Cliente + migración Outbox |
| **E. Agregar por segmento también en vivo** (un intervalo por cambio de estado, con tope de duración p. ej. 5–30 min) | ≈ 530 operaciones; nuevas ≈ número de cambios de estado, no de latidos | Pendiente varias veces menor | Cliente (observer/proyección) + migración + pruebas |
| **F. Reserva de cuota por tipo** (intervalos limitados a un % de la cuota, decisiones siempre admitidas) | Con 1000: ≈ 1000 aceptadas pero las no-intervalo siempre caben | Decisiones nunca bloqueadas; intervalos se detienen | `backend/src` (manifiesto v5), nuevo código de rechazo |

## 6. Recomendación

Por fases, de menor a mayor riesgo, sin tocar la base real hasta que cada fase pase pruebas:

1. **Fase 1 — indispensable antes de activar la sincronización real**
   a. Manejo de cuota en el cliente (sección 7).
   b. Cuota **3000** (alternativa B): es el valor ya recomendado en B48 y deja cabida a toda la cola sin modificarla. Es un cambio de una línea en `backend/src` pero obliga a manifiesto v5 y a ejecutar las suites del servidor. **Es provisional**: solo evita bloquear hoy.
   c. Prioridad de despacho: enviar primero lo no-intervalo (`game.report`, sesiones, eventos) y después intervalos, sin romper dependencias. Así, si la cuota se agota, lo perdido en retraso son latidos de tiempo, nunca decisiones. [Hip: hoy el orden por `created_at` ya lo cumple para esta cola, pero no en el futuro.]
2. **Fase 2 — antes de uso prolongado**: agregación por segmento (alternativa E, incluida la cola histórica) con clave de fusión que incluya contexto y dependencias, o la reserva de cuota por tipo (F). Mientras no exista, vigilar el margen: con B (3000) el límite se alcanza tras ≈ 7 h de juego.
3. **No recomendado**: subir a 10000 sin medir latencia; omitir revisiones de `game.report`; borrar o marcar manualmente operaciones.

Orden alternativo si se prefiere no tocar el servidor: aplicar E primero (≈ 527 operaciones caben bajo 1000), pero requiere la migración de Outbox sobre datos reales, que es el cambio más delicado. Mi recomendación es B + manejo de 429 primero (reversible, sin tocar datos).

## 7. Tratamiento del HTTP 429 por cuota

**Hechos actuales**
- El servidor devuelve por operación `deferred` / `quota_exceeded`, `retryable:true`, `retryAfterSeconds:1`; si todas fallan, el lote responde **429** (`ingestion-service.js:50-60`).
- El cliente lo mapea a `rate_limited` y reprograma **cada operación** con retroceso exponencial (1 s … tope 15 min con jitter 50-100 %), **sin límite de intentos ni estado de pausa** (`OutboxRetryPolicy`, `SyncOutboxService.Retry`). El `Retry-After` de 1 s de la cuota no ayuda: el máximo con el retroceso lo hace irrelevante tras unos intentos.
- Efecto con A: 1152 operaciones reintentando para siempre, cada reintento con lectura a Atlas antes del rechazo, intentos que crecen sin fin, y el diagnóstico no distingue «cuota» de «límite de ritmo».

**Diseño propuesto (cliente, sin esquema nuevo)**
1. Distinguir `quota_exceeded` de `rate_limited` en `SyncOutboxDispatcher` (hoy ambos → `rate_limited`).
2. Ante un lote cuyas operaciones fallan **todas** por cuota: **detener la pasada**, no reservar más operaciones y registrar un estado de pasada «detenido por cuota» (`SYNC_QUOTA_BLOCKED`) con pausa larga y creciente (p. ej. 15 min → 1 h → 6 h, con tope), y reanudar solo tras ese plazo o al reiniciar el juego.
3. No incrementar intentos del resto de la cola; las operaciones quedan `pending`/`retryable_failure` con su `next_attempt_ms` común.
4. Nunca pasar a `permanent_failure` por cuota; sin borrado ni pérdida.
5. Mostrar el estado (diagnóstico/log) una sola vez por cambio, con conteo de pendientes.
6. Pruebas: servidor falso que devuelve 429 por cuota tras N aceptaciones; verificar 1 sola petición por ventana, cola intacta, reanudación al subir la cuota, sin duplicados.

## 8. Estrategia de migración y reversión

**Fase 1 (sin migración de datos)**
1. Respaldar la base real con el procedimiento de B52 (copia con handle compartido, hash antes/después) y un respaldo del entorno de pruebas.
2. Aplicar cuota 3000 + manejo de 429 + prioridad de despacho (código; manifiesto v5).
3. Prueba en Express `offline-test` con una **copia desechable** de la base y cuota 3000 en un servidor sintético; luego validación real en Atlas con propietario sintético (autorización aparte).
4. Sincronizar la base real en lotes pequeños, observando recibos; las filas pasan de `pending` a `confirmed` con su recibo (inmutables después).
- **Reversión**: la sincronización solo *confirma* operaciones; no cambia hechos fuente. Para revertir: detener el worker (deshabilitar la bandera de sincronización), volver a la cuota anterior en el servidor y restaurar el binario previo. Las operaciones confirmadas permanecen válidas (el servidor ya las tiene); las no confirmadas siguen pendientes. No existe «des-confirmar»; por eso la validación real debe ocurrir antes sobre copias.

**Fase 2 (con migración)**
1. Versionar esquema de sync (v2) con un estado explícito de operación sustituida, o nueva tabla de agregados; migración transaccional con `PRAGMA user_version`, solo sobre una copia hasta aprobar pruebas.
2. Reconstruir segmentos a partir de `gameplay_intervals` (fuente intacta), con `operationId` deterministas derivados del primer intervalo; marcar las operaciones de latido pendientes como sustituidas, **no** borrarlas.
3. **Reversión**: la tabla de sustituciones permite reactivar las operaciones originales; copia previa verificada por hash.

## 9. Riesgos

| Alternativa | Riesgos |
|---|---|
| A | Bloqueo total de nuevo progreso al llenarse; reintentos infinitos; datos de la última sesión sin subir |
| B | Es provisional; cambio en `backend/src` y manifiesto v5; la latencia con 2000+ hechos del propietario no está medida |
| C | Latencia creciente por operación (F3-03), mayor volumen en Atlas |
| D/E | Migración sobre datos reales; pérdida de granularidad de latidos; si el servidor luego exige latidos, no recuperable; nuevos `operationId` (más superficie de idempotencia); error de fusión rompe dependencias o solapa |
| F | Cambio de contrato (nuevo código de rechazo); más lógica de cuota en servidor |
| Manejo 429 | Pausa demasiado larga retrasa la subida; demasiado corta repite carga. Mitigación: parámetros acotados y pruebas |

Riesgos transversales: **[H]** el primer envío real es de ≈ 2152 operaciones de golpe; a 0,7–1,5 s por operación (modelo B47/B48, no medido en este volumen) son 25–54 min de servidor [Hip], con 270+ lotes de 8; los límites `sync-owner 120/min` y `sync-ip 60/min` se respetan a esta cadencia, pero esto debe verificarse en F3.10. [Hip] El cierre de la próxima sesión puede volver a emitir `OUTBOX_CLOSE_DEFERRED` y dejar su `closed` sin informar hasta el siguiente arranque; no pierde datos.

## 10. Plan de implementación mínimo (propuesto, no iniciado)

1. Cliente: `quota_exceeded` distinto de `rate_limited`; estado de pasada «detenido por cuota» con pausa; prioridad de despacho por tipo respetando dependencias.
2. Servidor: `maxRecords` por defecto 3000 (y su pasada por pruebas), manifiesto v5.
3. Corrección de B52 (reintento acotado de `-journal` bajo Win32 5), que también reduce reintentos espurios.
4. Pruebas locales y Express offline-test; después, F3.10 con Atlas sintético y autorización.
5. Fase 2 (agregación) en etapa propia, con diseño aprobado.

## 11. Pruebas y criterios de aceptación

| ID | Prueba | Criterio |
|---|---|---|
| Q1 | Servidor sintético con cuota N < cola: 429 tras N aceptaciones | Cola intacta, ≤ 1 petición por ventana de pausa, 0 `permanent_failure`, 0 duplicados |
| Q2 | Subir cuota con la cola bloqueada | Reanuda y confirma todo, mismos `operationId` |
| Q3 | Cola con intervalos antiguos y `game.report` nuevo con cuota casi llena | El informe se envía antes que los intervalos |
| Q4 | Copia desechable de la cola real (2152) contra Express offline-test, cuota 3000 | 2152 confirmadas, recibos coherentes, ninguna violación de dependencias, `OUTBOX_DRAINED` |
| Q5 | Reintento tras corte de red a mitad | Mismo `operationId`, `duplicate` aceptado sin conteo doble |
| Q6 | Reinicio del cliente en pausa de cuota | Estado se reconstruye, sin tormenta de reintentos |
| Q7 (fase 2) | Fusión de segmentos sobre la copia | Tiempo total por estado y contexto idéntico, sin solapes, dependencias válidas, reversión probada |
| R1 | Regresión de las suites del cliente (679 + 43 + 14) y servidor | 100 % |
| R2 | Integridad de la base original antes/después | Hash idéntico en todas las pruebas con copias |

## 12. Reversión (resumen)

- Antes de cada fase: copia con hash y manifiesto vigente.
- Fase 1: apagar la sincronización (bandera), restaurar cuota/binario anterior; operaciones ya confirmadas permanecen en el servidor sin efecto sobre la partida.
- Fase 2: restaurar la copia previa o reactivar las operaciones originales desde la tabla de sustituciones.
- Nada se borra: ni operaciones, ni hechos, ni copias, hasta autorización expresa.

## 13. Integridad de lo inspeccionado

| Elemento | Resultado |
|---|---|
| Base original `save.sqlite3` | SHA-256 `9FE793A2…070C`, 5 697 536 B, mtime 2026-10-31 07:05:07; sin cambios |
| Copia B52 `copy.sqlite3` | mismo hash antes y después; abierta con `mode=ro&immutable=1`; sin sidecars |
| `ownership.json`, `store.lease` | sin cambios; sin `-journal/-wal/-shm` |
| Código, pruebas, Godot, cuotas, manifiesto | sin cambios; manifiesto v4 `ok` (3169 archivos, 0 diferencias) |
| Procesos Godot/node/caddy; Atlas | 0; sin conexión |
| Archivos creados | este documento; script de lectura en el scratchpad (`b52-copy/q.py`) |

La verificación del manifiesto devolvió `ok`, aunque el comando de PowerShell terminó con código 255 por mi uso de `Select-Object -First 1` sobre la salida; no es un fallo del manifiesto.
