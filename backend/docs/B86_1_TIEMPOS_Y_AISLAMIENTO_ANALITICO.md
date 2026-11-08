# B86.1 — Presupuesto de tiempo, aislamiento analítico y preflight de solo lectura

Fecha: 5 de noviembre de 2026. **Atlas sigue sin conectarse.** No se leyó ninguna credencial, no se creó ningún recurso remoto, no se activó telemetría, no se conectó el videojuego, no se tocaron partidas, v5 ni B00, no hay commit ni push. Este documento **prevalece** sobre `B86_PREPARACION_CONEXION_ATLAS_ESTADISTICAS.md` donde difieran (ver §6).

## 1. Presupuesto de tiempo Express/MongoDB frente a los 15 s del cliente .NET
**Problema (medido en B86):** con el almacenamiento caído, cada evento esperaba ~5 s a que el driver agotase la selección de servidor, y un lote de 5 eventos se procesa en serie: **~25 s**, más que el HTTP de 15 s del cliente (que entonces reintenta lo mismo y no recibe recibos).

**Corrección** (`offline-app.js`, aditiva, sin cambiar el contrato `statistics-only-v1`):
- **Presupuesto por solicitud: 8 s** (`requestBudgetMs`, acotado a 50 ms–12 s; margen de ≥ 5 s para transporte). Cada commit compite con el tiempo restante; si lo agota, el recibo es `retryable / deadline_exceeded`.
- **Cortacircuitos:** abre 5 s (`breakerCooldownMs`) ante evidencia de caída: un fallo **lento** (≥ 1 s), un desbordamiento del presupuesto o **tres** fallos seguidos. Abierto, responde `retryable / storage_unavailable` **al instante** sin intentar nada. Un fallo rápido y aislado (transacción abortada, fallo inyectado) **no** bloquea a otros clientes; un éxito reinicia la cuenta. Los conflictos de escritura y los commits inciertos **nunca** lo abren (el almacén está accesible).
- **Idempotencia y recibos intactos:** un commit que supera el presupuesto se informa como reintentable pero puede completarse en segundo plano; su reenvío recibe `duplicate` y el contador sube **una sola vez**. Los eventos inválidos siguen rechazándose de forma permanente aunque el almacén esté caído. Cada recibo conserva `EventId` y `PayloadHash`.

**Resultados:**
| Escenario | Antes | Ahora |
|---|---|---|
| Lote de 5, servidor MongoDB real (TLS+SCRAM) detenido | ~25 s | **5,0 s** (5 007 / 5 014 ms medidos), todo `retryable` |
| Segunda solicitud con el cortacircuitos abierto | ~25 s | < 1 s |
| Recuperación al volver el servidor | — | el mismo repositorio se recupera solo; los 5 pendientes se aceptan; el reenvío completo es `duplicate`; el total sube exactamente en 5 |
| Camino sano | sin cambios | sin cambios (aceptado → duplicado) |

Pruebas: `tests/b86/b86-timeout.test.js` (9: presupuesto < 15 s, almacén colgado, caída lenta con cortacircuitos y reanudación, commit tardío que se aplica una vez, repetición en carrera, fallos rápidos aislados vs. consecutivos, conflictos, inválidos con almacén caído, camino sano) más el caso real de caída/recuperación en el servidor desechable.
**Pendiente:** el presupuesto de 8 s se verificó contra un servidor local; la latencia real de Atlas y el cliente .NET (no se tocó) se comprobarán en la fase autorizada. El Outbox local del juego conserva los eventos `retryable` y los reintenta con su propio *backoff*.

## 2. Metabase y la base analítica separada (modelo B85)
Decisión recibida: Metabase lee **solo una base analítica separada con agregados**; nunca la base de ingesta.
- Nueva base `twosides_statistics_analytics_demo` con **una** colección `stats_v1_counters` (mismo validador estricto; solo `_id` y valores numéricos). Ninguna colección técnica (recibos, marcas semánticas, actividad, cuotas, meta) existe ahí.
- Nueva identidad **publicador** `twosides_statistics_publisher_v1`: lee `stats_v1_counters` de la ingesta y, en **una transacción** (snapshot, majority+j), borra e inserta la copia analítica. Acciones: ingesta-origen `find`; analítica `find, insert, remove`. La acción `publish` es idempotente (publicar dos veces deja la misma copia).
- El **lector** `twosides_statistics_reader_v1` queda solo en la base analítica: `find` sobre `stats_v1_counters`; `listCollections` y `dbStats` de esa base. Hallazgo resuelto: la base analítica lista **solo** `stats_v1_counters`; la de ingesta no es ni siquiera listable por el lector (error 13).
- Matriz final (4 identidades) en `atlas-privileges.js` y `B86_ATLAS_ROLES_Y_ESQUEMA.json`; plantilla Metabase actualizada. B85 (dashboard 2) no se tocó. El dashboard es una **instantánea**: se actualiza con `publish`.
- Aprovisionamiento: la identidad de esquema crea además la colección analítica vacía (`createCollection`, `listIndexes` en la analítica). La configuración exige `STATISTICS_ANALYTICS_DATABASE=twosides_statistics_analytics_demo` y solo esquema/publicador/lector llevan base analítica; la ingesta nunca la ve.

## 3. Revisión de la sección B de la guía
La sección B anterior no fijaba valores comprobables ni cubría la base analítica ni al publicador. Se reescribió como **checklist de 10 filas** (proyecto, clúster, las dos bases —que no deben existir—, base de producción que no debe crearse, **4 roles** y **4 usuarios** con nombres exactos, ausencia de herencia/legacy, red sin `0.0.0.0/0`, segunda conexión Metabase) con «cómo comprobarlo» y una columna «Tu valor» para tu nota privada. **No se puede identificar tu proyecto Atlas desde aquí** (no se leyeron `.env` ni credenciales anteriores): lo identifica el propietario. Puntos que solo el preflight podrá confirmar: soporte de roles personalizados y de transacciones en el plan del clúster y nombres exactos de acción.

## 4. Preflight de Atlas (preparado, **no ejecutado**)
`tools/b86/Run-Atlas-Session.ps1 -Identity <ingest|schema|publisher|reader> -Action preflight -AtlasHost <host>` (solo propietario; pide la frase de autorización y la contraseña con prompt oculto; ninguna otra acción corre sin frase).
Operaciones, **estrictamente de lectura**:
1. Conexión TLS con validación normal de certificado y nombre (sin `tlsAllowInvalid*`, sin CA propia); autenticación SCRAM (en Atlas, SCRAM-SHA-1 explícito según `B86_5_MECANISMO_SCRAM_ATLAS.md`; SCRAM-SHA-256 en el servidor local).
2. `hello`: primario escribible, `setName` (replica set), sesiones lógicas (transacciones).
3. `connectionStatus {showPrivileges:true}`: el usuario autenticado es **exactamente** la identidad, tiene **un solo** rol y los privilegios **son idénticos** a la matriz (extra o faltante → aborta).
No ejecuta `find`, inserciones, índices, sesiones ni transacciones, y no crea nada. Verificado con un cliente doble que falla ante cualquier otro acceso (solo se observan `connect`, `hello`, `connectionStatus`, `close`) y, en el servidor real desechable, con roles ampliados/reducidos. Informe sin secretos, host ni usuario. **No se ejecutará hasta que confirmes el checklist B y autorices esa conexión específica.**

## 5. Pruebas
| Suite | Resultado |
|---|---|
| B86 offline (`tests/b86/vitest.config.js`: configuración, conector, matriz de 4 identidades, preflight de solo lectura, dataset, plan, 9 de tiempo) | **36/36** |
| B86 reales, servidor desechable TLS+SCRAM (`B86_REAL_TESTS=1`, `b86-real.config.js`) | **11/11** (nuevos: analítica separada, publicador, lector sin acceso a ingesta, lote de 5 en 5,0 s con recuperación) |
| Estadísticas B79–B83 | **222/222** (la primera versión del cortacircuitos rompió 5 pruebas existentes por bloquear tras un fallo aislado; se corrigió con el criterio de §1 y no se tocó ninguna prueba existente) |
| B84 offline | **34/34** |
| Verificador v5 | `tree_differs` esperado: 18 añadidos, **0 modificados**, 0 problemas |
| No repetido | .NET/Godot (sin cambios), suites reales B81.1/B82/B84, `tools/b85/verify.mjs` |
Nuevo: `src/modules/statistics/offline-app.js` modificado (copia previa en `local-persistence/.work/b86/pre-timeout/`); `atlas-policy.js`, `atlas-privileges.js`, `atlas-connector.js`, `tools/b86/*` ampliados (copias previas en `.work/b86/pre-analytics/`). Contenedor desechable `twosides-b86-rbac`: creado y eliminado en cada ejecución; no queda ninguno. Contenedores del propietario y base B84 sin cambios.

## 6. Correcciones al informe B86 principal
- «Tres identidades / lector ve nombres de seis colecciones» → **cuatro identidades; el lector solo ve la colección de la base analítica**.
- Variable nueva `STATISTICS_ANALYTICS_DATABASE` (único valor aceptado: `twosides_statistics_analytics_demo`).
- «~5 s por evento / lote de 25 s» → corregido (§1).
- Plan: `provision` crea también la base analítica; se añade `publish` antes de `read`.

## 7. Pendientes y decisiones (sin cambio salvo lo indicado)
Retención productiva; credenciales técnicas definitivas y clave HMAC privada; contención y capacidad reales en Atlas; HTTPS y secretos; B00; v5; activación autorizada del envío desde Godot. **Nuevas decisiones:** (a) ¿se acepta que el dashboard Atlas sea una instantánea publicada manualmente, o se automatiza `publish` más adelante?; (b) confirmar que los límites del plan Atlas elegido admiten roles personalizados y transacciones (lo mostrará el preflight).

## 8. Siguiente acción concreta
Completa el checklist de la sección B de `B86_GUIA_RAPIDA_ATLAS.md` y confírmamelo; después autoriza expresamente **un preflight de solo lectura** (primero `reader`) y lo ejecutas tú con `Run-Atlas-Session.ps1`.
