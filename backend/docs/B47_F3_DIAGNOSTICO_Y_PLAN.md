# B47 — F3: diagnóstico y plan de implementación (solo análisis)

Fecha: 2026-11-03. **Solo lectura y documentación.** No se modificó `src/`, `scripts/`, `tests/`, Godot, SQLite ni informes anteriores; no se conectó Atlas; no se arrancó Express ni Caddy; no se instalaron certificados; no se ejecutó ninguna prueba; no hubo commits ni push. F3 **no está implementada**.

Convención de evidencia: **[I]** leído en el código (archivo y línea citados) · **[P]** existe una prueba o evidencia registrada que lo cubre (los nombres de las pruebas salen de leer los archivos; **no se re-ejecutaron**) · **[R]** observado en la campaña real B46 · **[S]** suposición no verificada.

Fuentes: `src/modules/sync/*`, `src/main/profile.js`, `src/modules/auth/mongo-identity-repository.js`, `src/composition/lifecycle.js`, `src/server.js`, `src/app.js`, `src/middleware/*`; cliente `local-persistence/sync-http/*.cs.txt` y `local-persistence/src/SyncOutboxService.cs.txt`; informes B32–B46 (en especial B38, que ya documenta H1–H14 del cliente).

---

## 7.1 Estado actual

### Implementado y verificado
| Área | Estado | Evidencia |
|---|---|---|
| F1 (menos viajes a Atlas, caché de la verificación de despliegue, calentamiento al arrancar) | Implementado; viajes por operación: **21 en frío, 14 en caliente (operación nueva), 9 en reenvío idéntico** | `deployment-check.js`, `main/profile.js:45-46` [I]; `main-f1-optimization` (25 pruebas), `main-f1-warmup` (9), `main-batch-latency-model` (2), `main-f2-commit-gate` T17 [P] |
| F2 (compuerta de commit) | Implementado: antes del punto de commit rige el presupuesto de 2000 ms; después se espera el resultado real hasta una gracia de 3000 ms; resultado desconocido → 503 sin recibo y el resto del lote queda `deferred` | `budget.js`, `ingestion-service.js:120-133`, `mongo-ingestion-repository.js:238` [I]; `main-f2-commit-gate` (26 pruebas: T1–T22, R1–R2, S1–S2) [P] |
| Idempotencia por operación | `operationId` por propietario (índice único `owner_operation_unique`) y hecho único por `scope+sourceKey`; el reenvío devuelve `duplicate` con el **recibo original** | `ingestion-engine.js:87-92`, `mongo-ingestion-repository.js:198-204` [I]; `ingestion` T11–T14, V05, V11; `main-f2` T6, T9, T10; [R] etapa D: `duplicate`, mismo `receiptId` |
| Validación real F1+F2 | A–E y G correctas; commit real `committed` (1530 ms), reenvío `duplicate`, `receipts/query` `found`, deltas +1 en las seis colecciones de la operación, históricas sin cambios | B46 [R] |
| Cliente Sync v2 | Outbox con `operationId` estable, recibo exigido para confirmar, reintentos con retroceso, conciliación por `receipts/query` tras `attempt>1`, un solo worker | B38 §3 [I][P] (188 comprobaciones del cliente contra un servidor simulado) |

### Constantes de tiempo y capacidad verificadas en el código
| Parámetro | Valor | Dónde |
|---|---|---|
| Presupuesto por operación | 2000 ms (tope fijo en el constructor) | `ingestion-service.js:105-109` |
| Presupuesto de lote | 10 000 ms (tope fijo) | idem |
| Gracia de commit | 3000 ms (tope fijo) | `budget.js:12` |
| Transacción Mongo | `readConcern snapshot`, `w:majority, j:true`, `maxCommitTimeMS 1000`, `timeoutMS 10000`, reejecución del callback ≤ 3 veces | `mongo-identity-repository.js:18-19, 91` |
| Conexión del perfil `main` | pool 5, `socketTimeoutMS 10 000`, `serverSelection 10 s`, `waitQueue 2 s`, `minPoolSize 0`, `retryWrites true` | `main/profile.js:34-37` |
| Caché de despliegue | TTL 30 s; **sin keep-warm** (no se pasa `deployment.keepWarmMs`) | `deployment-check.js:7`, `main/profile.js:41` |
| Cuota | **1000 operaciones por propietario** (por defecto; el constructor rechaza > 10 000) y 50 000 en total | `ingestion-engine.js:23-28` |
| Límites de peticiones | `sync-ip` 60/min, `sync-owner` 120/min; registros 5/h por IP y 100/h globales | `routes.js:184,191`, `rate-limiter.js:5` |
| Cliente | petición 10 s (0,1–60 s), conexión 3 s, lote 25 (máx. 100), lease 30 s, pasada 15 s en reposo / 5 s tras fallo | `SyncHttpTransport.cs.txt:26,60`, `SyncOutboxService.cs.txt:146`, dispatcher:188 |
| Caddy | `dial 3 s`, `response_header_timeout 15 s`, `write 30 s`, cuerpo 2 MB | Caddyfile (B44) |
| Apagado | `server.js`: gracia 4 s y `process.exit` a los 5 s | `server.js:165`, `lifecycle.js:135` |

### Tiempos observados en la campaña real (B46, cliente PowerShell → Caddy → Express → Atlas) [R]
Lote de 1 operación nueva: 1530 ms; reenvío idéntico: 3451 ms; `receipts/query`: 3441 ms. Incluyen TLS, autenticación y la ida y vuelta de PowerShell, y no solo el presupuesto de operación; sirven como orden de magnitud: **una petición de una sola operación ya consume 1,5–3,5 s del tiempo de espera de 10 s del cliente**.

---

## 7.2 Hallazgos

Prioridad: **P1** = indispensable antes de integrar Godot con el backend real · **P2** = antes de uso sostenido/lanzamiento · **P3** = opcional. Los H1–H14 de B38 se conservan y se referencian cuando coinciden.

### F3-01 · Tiempo de espera del cliente = presupuesto del lote (H1) · P1 · Riesgo alto
- **Dónde:** `SyncHttpTransport.cs.txt:26` (10 s), dispatcher (lote 25), `ingestion-service.js:105,120` (`batchBudgetMs=10000`).
- **Comportamiento:** el servidor procesa las operaciones de un lote **una a una, cada una en su transacción** (14 viajes en caliente ≈ 0,7–1,5 s [modelo B34 + R]); admite hasta 10 s por lote más la gracia dentro de ese tope. El cliente abandona a los 10 s de **su** reloj, que arranca antes (conexión, TLS, subida, autenticación).
- **Problema:** un lote de 25 operaciones nuevas no cabe (≈ 17 s en el mejor caso); el cliente se rinde antes de leer la respuesta aunque el servidor siga confirmando.
- **Evidencia:** código [I]; modelo de B38 §3; [R] 1,5 s con una sola operación.
- **Impacto:** sin pérdida de datos (recibos + reenvío idéntico), pero cada pasada con cola gasta una consulta de recibos y un reenvío, y **el cliente puede lanzar la pasada siguiente mientras la anterior sigue ejecutándose en el servidor para el mismo jugador** → contención en la guarda del propietario (ver F3-09) y respuestas `deferred` innecesarias.
- **Cobertura:** solo con simuladores [P]; no hay prueba cliente real ↔ backend (H14).

### F3-02 · Cuota de 1000 operaciones por jugador con reintento indefinido · P1 · Riesgo alto (nuevo)
- **Dónde:** `ingestion-engine.js:23,112` (`maxRecords=1000`); `main/profile.js` construye el repositorio **sin** `maxRecords`; `ingestion-service.js:92-96` convierte el 429 en `quota_exceeded`, `retryable:true`, `retryAfterSeconds:1`.
- **Comportamiento:** al alcanzar 1000 operaciones propias, toda operación nueva recibe 429 reintentable; el cliente la trata como `rate_limited` y la reintenta con retroceso para siempre.
- **Problema:** un jugador con historial largo (el cliente proyecta eventos de animal, intervalos de tiempo y reportes de partida/sesión) puede agotar la cuota y la sincronización se **detiene silenciosamente**. Los datos siguen en SQLite (no se pierden), pero el remoto deja de recibirlos y nadie lo sabe. El constructor impide subir el tope por encima de 10 000.
- **Evidencia:** [I]; `ingestion-scalability` SC11 prueba el límite y que es reintentable [P]. **El volumen real de operaciones por hora de juego no está cuantificado [S].**
- **Impacto:** funcional (sincronización incompleta a largo plazo), no de integridad. **Decisión necesaria del propietario:** tamaño de cuota y qué ve el jugador.

### F3-03 · Coste por operación nueva crece con el historial del jugador · P2 · Riesgo medio (nuevo)
- **Dónde:** `mongo-ingestion-repository.js:294-297` (`readScoped`): para una operación nueva que no sea `game.report`, lee **todos los hechos del propietario** (hasta 1001) para validar relaciones; `relations.js:10-12,76` los filtra en memoria.
- **Problema:** con historial largo, cada operación nueva transfiere y parsea cientos de documentos (hasta 16 KB cada uno) dentro del presupuesto de 2000 ms; el coste real en Atlas no está medido [S].
- **Evidencia:** SC03 afirma que el coste depende solo del historial propio, no que sea constante [P].
- **Impacto:** 503 `deferred` crecientes en jugadores veteranos. **Mitigación acotada** por la cuota (F3-02): el peor caso es 1000 documentos.
- **Nota:** una consulta más selectiva (por sesión o partida) exigiría campos indexados nuevos en `main_v2_facts` → cambio de esquema en Atlas; no se propone sin una medición que lo justifique.

### F3-04 · Los leases son exclusivamente del cliente (H6) · P2 · Riesgo bajo-medio
- **Dónde:** `grep lease` en `src/` solo encuentra el esquema y el eco (`schemas.js:34`, `ingestion-service.js:49`, `ingestion-engine.js:140`). El servidor **no almacena ni valida** `leaseId`/`attempt`: los devuelve tal cual.
- **Cómo funciona de verdad:** el lease protege la fila de la Outbox en SQLite (`SyncOutboxService.Reserve`, 30 s; `CurrentAttempt` exige lease vigente; `RecoverExpired` devuelve `in_flight` vencidos a `retryable_failure`). La protección en el servidor es otra: índices únicos, guarda por propietario con comparación de revisión dentro de la transacción, hechos inmutables (`$setOnInsert`) y reglas de monotonía (`game.report` por revisión → `superseded`, `validateRelations`).
- **Problema:** una pasada completa puede durar más de 30 s (inicio de sesión ≤ 10 s + consulta ≤ 10 s + lote ≤ 10 s): `Confirm` falla con `LEASE_CONFLICT`, la operación vuelve a reintento y se concilia por recibo. Es seguro pero ruidoso.
- **Evidencia:** [I]; B38 H6/H10 [I][P]; `ingestion` V05 y T12 cubren el eco del intento [P].

### F3-05 · Apagado de Express más corto que un lote en vuelo · P2 · Riesgo medio
- **Dónde:** `server.js:165` (`graceMs 4000`, `process.exit` a 5000) y `lifecycle.js:135-142` (`closeAllConnections` tras la gracia); un lote puede durar hasta 10 s (+ gracia de commit).
- **Problema:** Ctrl+C durante un lote corta conexiones con transacciones posiblemente en vuelo → resultado desconocido para el cliente. Es **recuperable** (reenvío idéntico), pero se produce evitablemente. Además, **el apagado ordenado nunca se ejercitó contra Atlas real**: en la campaña B46 Express se detuvo con `Stop-Process` (terminación forzada).
- **Evidencia:** [I]; `backend-composition` BC09 (cierre ordenado con trabajo en vuelo) y el caso forzado [P] con dobles.
- **Impacto:** ruido operativo y reconciliaciones innecesarias; sin riesgo de duplicación.

### F3-06 · Sin calentamiento continuo ni conexiones mínimas · P2 · Riesgo medio (B33/B34/B37 lo dejaron para F3)
- **Dónde:** `main/profile.js` no pasa `deployment.keepWarmMs`; `minPoolSize:0`; el TTL de la caché es 30 s.
- **Comportamiento:** tras >30 s sin tráfico la siguiente operación paga la verificación en vivo (+7 viajes → 21 viajes) y la conexión en frío (≈ +457 ms, B33): ≈ 1,5 s de los 2000 ms.
- **Problema:** primeras operaciones tras una pausa con riesgo de 503 `deferred` (correcto, no persiste nada, pero evitable).
- **Evidencia:** [I]; B33 §5, B37 §«cola fría» [P]. El aumento real en Atlas es un modelo, no una medición [S].

### F3-07 · Presupuestos cooperativos y trabajo previo sin presupuesto · P2 · Riesgo medio
- **Dónde:** `budget.js` (`bounded` rechaza al vencer el presupuesto pero no cancela una llamada del driver en curso); `sync-auth-context.js` (`validate` hace 2 lecturas a Atlas **antes** de que empiece el reloj del lote); no hay `requestTimeout` explícito de Express (`grep` sin resultados).
- **Problema 1:** una lectura lenta sigue ocupando una conexión del pool (5) y la escritura de la guarda del propietario hasta que el driver falla (`socketTimeoutMS 10 s`). Al vencer el presupuesto se aborta antes del commit (`commitPoint` falla, nada se persiste [P: T3/T4]), pero la transacción huérfana retiene recursos; con lentitud sostenida podría agotar el pool y producir 503 por `waitQueue 2 s`.
- **Problema 2:** el tiempo de autenticación (JWT + 2 lecturas) no cuenta para ningún presupuesto, de modo que el tiempo total de la petición puede superar `batchBudgetMs` en esas lecturas.
- **Evidencia:** [I]; contadores `orphanSettledCommitted/orphanFailed` [I][P: T21]. Efecto real en Atlas: [S].

### F3-08 · Límites por IP detrás de Caddy · P2 (antes de abrir a más de un jugador) · Riesgo medio
- **Dónde:** `app.js:19` (`trust proxy false`) y `app.js:27,36,43,81,85`, `routes.js:184,188` (limitadores por `request.ip`); `auth-service.js:15` (`creationsPerIp 5/h`).
- **Problema:** detrás de Caddy, `request.ip` es siempre `127.0.0.1`: **todos los jugadores compartirían** 5 registros/hora, 100/hora globales y 60 peticiones/min. Con un solo jugador local de pruebas no se nota (B46 usó 1 registro); un backend compartido se bloquearía.
- **Evidencia:** [I]. Hay que decidir el modelo de despliegue antes de tocarlo (confiar solo en el proxy local conocido).

### F3-09 · `receipts/query` es una transacción de escritura y compite con los lotes del mismo jugador (H9) · P3 · Riesgo bajo
- **Dónde:** `ingestion-engine.js:131-143` y `mongo-ingestion-repository.js:231-234`, `mongo-identity-repository.js:119-125` (`touch`: lectura + comparación de revisión + incremento).
- **Comportamiento:** cada petición del mismo propietario incrementa su guarda; dos peticiones simultáneas generan un conflicto de escritura transitorio y el driver reejecuta el callback (≤ 3; la cuarta → 503). **Serializa correctamente** [P: T30, SC05, D02, atlas-concurrency F01–F04, F12] pero cuesta reintentos. Con un solo worker es poco frecuente; F3-01 puede provocarlo.

### F3-10 · Sin telemetría utilizable (`commitStats` solo en memoria) · P3
- `budget.js:15-16`: contadores sin exposición (decisión D5 de F2). Para ajustar F3 con datos reales hay que inferir por tiempos de cliente y resultados. Propuesta mínima en el plan (F3.8).

### F3-11 · Mecanismo de autenticación de Atlas: SCRAM-SHA-1 · P2 (antes de producción) · Riesgo medio-alto de seguridad
- `main/policy.js:9` (`DEFAULT`) negocia con la lista que anuncia el servidor; el usuario `twosides_backend` solo anuncia SCRAM-SHA-1 (B05.5 etapa 11). Si Atlas dejara de anunciar SHA-1 o cambiara el usuario, la degradación o fallo sería silenciosa. Se resuelve **en Atlas** (reasignar la credencial para que exista SHA-256) y luego fijar el mecanismo; no es un cambio de lógica de F3.

### F3-12 · Otros hallazgos menores
- `batchId` no se persiste ni participa en la idempotencia (H8, bajo).
- Dos pilas de red en el cliente (v1/v2) y rutas v1 no montadas (H2/H11); `project.godot` sin `two_sides/sync/main_api_url` (H3); `HttpClient` + CA de pruebas sin probar (H4); bloqueo `SYNC_DESTINATION_MIGRATION_REQUIRED` (H5); sin prueba cliente real ↔ backend F2 (H14). Siguen vigentes tal como los documenta B38 §5.
- B00 (copias antiguas de `.env`/`PRUEBA.rar`, rol `readWrite` amplio) sigue abierto.

### Mecanismos de protección existentes (resumen verificado)
Unicidad de operación y hecho por índices únicos verificados en caliente y en cada arranque; hechos inmutables por `$setOnInsert`; recibo original en reenvíos; guarda por propietario que serializa y que la revocación también incrementa (V04, T20); compuerta de commit (sin ACK sin fila, sin 503 con fila cuando el trabajo estaba antes del punto de commit); parada del resto del lote tras un commit desconocido; verificación de la integridad de cada documento leído; cuotas con respuesta reintentable.

---

## Escenarios de recuperación solicitados (§4.D)

| # | Escenario | Mecanismo | Pruebas existentes | Falta |
|---|---|---|---|---|
| 1 | Pérdida de conexión durante la sincronización | El cliente conserva la fila y reintenta con retroceso | Cliente: «HTTP interruption keeps every pending operation…», «after reconnecting…» [P] | — |
| 2 | El backend recibe y la respuesta se pierde | Consulta de recibos o reenvío idéntico → `found`/`duplicate` | `ingestion` T14; `atlas-concurrency` F05/F06; `ingestion-scalability` SC07; cliente «a response lost after the server committed is reconciled…»; [R] reenvío real | Cliente .NET real contra backend F2 (H14) y P4 real (abandono con espera corta) |
| 3 | Mongo confirma tras el timeout del cliente | Compuerta de commit; 503 sin recibo; reenvío → `duplicate` | `main-f2` T1, T6–T10, R1 con dobles | Comportamiento real de Atlas solo con dobles; prueba con cliente más corto que el lote |
| 4 | El backend se cierra inesperadamente | Transacciones atómicas; nada parcial | `persistence` D05/D06 (almacén de archivos); `backend-composition` BC09 y cierre forzado | Matar el proceso **durante un commit Mongo**: solo con dobles; apagado ordenado nunca ejercitado contra Atlas (F3-05) |
| 5 | Godot se cierra antes del recibo | Lease de 30 s, `RecoverExpired`, conciliación | Cliente «closing the game during an in-flight batch…» [P] | Fiabilidad de `synchronous=FULL` en el disco real [S] |
| 6 | El usuario reinicia el juego | Cuenta DPAPI reutilizada, nuevo JWT, mismos `operationId` | Cliente «restart without re-registering…», «Logout→Login→Resume» [P] | — |
| 7 | SQLite conserva operaciones pendientes | Outbox persistente | Pruebas de Outbox/recuperación (B05) [P] | Colas ≥ 1000 operaciones frente a la cuota (F3-02) y colas grandes frente a F3-01 |
| 8 | Reenvío de una operación ya confirmada | `duplicate` con recibo original | `ingestion` T11/T12, V11, SC04; [R] etapa D | — |
| 9 | Dos solicitudes procesan la misma operación | Índices únicos + guarda del propietario | `ingestion` T30; `main-f2` T9; `persistence` D02; SC05; `atlas-concurrency` F01–F04, F12 (dobles) | Concurrencia contra Atlas real nunca ejecutada |
| 10 | Reinicio del servidor con pendientes | Idempotencia durable en Atlas; clave JWT persistente; cliente re-registra si el servidor «vacío» | Cliente «server close and restart…», «restarted server (empty state)…»; B06/B14 | Reinicio real: caché de despliegue fría (F3-06) y primera pasada tras arrancar |

---

## 7.3 Plan de implementación F3

Principios: etapas pequeñas con respaldo previo (`pre-F3-n`), desarrollo y pruebas **offline**, suite completa antes y después, revisión del diff, y **autorización explícita por etapa**. Toda etapa que toque `src/` invalida el manifiesto v4: requiere manifiesto v5 y la ceremonia de la línea base (B20 §6). Las etapas del cliente (C#) no tocan el manifiesto del backend. No se cambia ningún presupuesto de 2000 ms/10 000 ms/3000 ms del servidor salvo decisión expresa; la dirección es **ajustar el cliente a esos valores**.

### F3.0 — Cuantificación y decisiones (sin código)
- **Objetivo:** convertir las suposiciones [S] críticas en números: operaciones por hora de juego por tipo (partida, sesión, evento, intervalo); tamaño de cola tras el primer uso (`historical_import`); latencia por operación y por viaje en Atlas.
- **Cómo:** contar con el código del cliente y SQLite de prueba (solo lectura); la latencia real se mide después, en la validación F3.10.
- **Decisiones del propietario:** cuota por jugador (F3-02), qué verá el jugador si se alcanza, modelo de despliegue (local único vs servicio compartido, F3-08), pila de identidad v1/v2 (H2).
- **Criterio:** tabla de volúmenes y decisiones firmadas. **Reversión:** no aplica.

### F3.1 — Coherencia de presupuestos del cliente (F3-01, F3-04) · P1
- **Archivos:** `local-persistence/sync-http/SyncHttpTransport.cs.txt` (valor por defecto del tiempo de espera), `SyncOutboxDispatcher.cs.txt` (tamaño de lote), `local-persistence/src/SyncOutboxService.cs.txt` (duración del lease), `sync-http-tests/SyncHttpChecks.cs.txt`.
- **Cambios propuestos:** (a) tiempo de espera de petición **15 s** (> 10 s del servidor + margen de red; el cliente admite 0,1–60 s); (b) lote inicial **≤ 8** y adaptativo: ajustar el tamaño con el tiempo medido por operación para que el lote esperado quede ≤ ~6 s; (c) lease ≥ suma de la peor pasada (inicio de sesión + consulta + lote = 45 s) más margen → **60 s**; (d) no iniciar una pasada si hay otra en curso (ya hay un worker; se añade comprobación de que la respuesta de la pasada anterior terminó o fue conciliada).
- **Compatibilidad F1/F2:** el servidor no cambia. La respuesta con `deferred`/`storage_unavailable` y operaciones «no iniciadas» sigue tratándose como reintento.
- **Pruebas:** nuevas pruebas del cliente (servidor simulado lento: lote que tarda 9 s no provoca abandono; lote adaptativo reduce tamaño si sube la latencia; lease no vence en la pasada máxima; `RECEIPT_CONFLICT` no aparece en el flujo normal); regresión de las 188 comprobaciones.
- **Riesgos:** pasadas más largas bloquean el worker más tiempo (no bloquea el juego, probado «the caller is never blocked»); lote pequeño alarga el vaciado de colas grandes.
- **Aceptación:** con un simulador que tarde 0,7–1,5 s por operación, ningún lote acaba en abandono; cola de 100 operaciones se vacía sin pasadas solapadas.
- **Reversión:** restaurar los valores por defecto desde el respaldo del cliente (no hay cambio de datos ni de esquema).

### F3.2 — Prueba de contrato cliente .NET ↔ backend con F2 (H14), sin Atlas
- **Objetivo:** probar el cliente real contra el servidor Express en bucle local con el repositorio de dobles (503 con `results`, operaciones «no iniciadas», `duplicate`, recibo con fecha ISO).
- **Archivos:** pruebas nuevas únicamente (backend `tests/sync/` y/o arnés en `sync-http-tests`).
- **Aceptación:** las dos pilas coinciden byte a byte en recibos y estados; ningún error de formato de fechas/cabeceras. **Reversión:** eliminar las pruebas.

### F3.3 — Cuota y estado «sincronización incompleta» (F3-02)
- **Objetivo:** que alcanzar la cuota no sea un fallo silencioso ni un bucle ciego.
- **Opciones (decidir en F3.0):** subir `maxRecords` por perfil `main` (hasta 10 000 permitido hoy) y/o reducir el volumen del cliente (agregar intervalos antes de proyectarlos); en el cliente, tras N respuestas consecutivas `quota_exceeded`, pasar a estado `quota_blocked` con retroceso largo y diagnóstico local visible.
- **Archivos:** `src/main/profile.js` (pasar `maxRecords`) y, si procede, `ingestion-engine.js` (límite superior); cliente: `SyncOutboxDispatcher`.
- **Compatibilidad:** no cambia contratos ni códigos públicos; `quota_exceeded` sigue siendo reintentable.
- **Pruebas:** SC11 ampliada (perfil `main`), cliente con 429 sostenido, 1000 operaciones en una sola cola.
- **Riesgos:** cuota alta + F3-03 → más lectura por operación; por eso se decide con las cifras de F3.0.
- **Aceptación:** con cuota agotada, el cliente informa y no consume ciclos; los datos permanecen intactos en SQLite. **Reversión:** volver al valor por defecto; sin migración.

### F3.4 — Apagado ordenado (F3-05)
- **Archivos:** `src/server.js` (gracia y salida de seguridad), `composition/lifecycle.js` si se añade estado de drenaje.
- **Cambios:** gracia ≥ `batchBudgetMs + COMMIT_GRACE_MS` (≈ 13 s) con salida forzada de seguridad ≈ 15 s; mientras se drena, responder 503 `Retry-After` a peticiones nuevas de sync; registrar en el cierre los contadores de `commitStats` (sin identificadores).
- **Pruebas:** ampliar BC09 (lote en vuelo termina antes del cierre; no se cortan conexiones antes de la gracia); cierre forzado conserva idempotencia (reenvío → `duplicate`).
- **Aceptación:** apagado con un lote en vuelo termina con respuesta completa al cliente. **Reversión:** restaurar `server.js` desde el respaldo.
- **Real:** un apagado con Ctrl+C se comprobaría en la validación F3.10, no antes.

### F3.5 — Calentamiento continuo y pool (F3-06)
- **Cambios:** pasar `deployment.keepWarmMs` (< 30 000, p. ej. 20 000) y valorar `minPoolSize` 1; son parámetros de composición, sin cambiar lógica.
- **Compatibilidad F1:** usa el mismo mecanismo (`keepWarm`), apagado por defecto, con temporizador `unref`; un fallo solo invalida la caché (cierra en falso).
- **Pruebas:** extender `main-f1-warmup` (el temporizador se detiene al cerrar; no hay lecturas cuando no hay sesión; fallo → próxima operación verifica en vivo).
- **Riesgo:** tráfico de lectura periódico hacia Atlas aun sin jugadores; coste mínimo, a confirmar.
- **Aceptación:** tras 60 s de inactividad, la primera operación sigue en 14 viajes (modelo). **Reversión:** quitar el parámetro.

### F3.6 — Presupuesto de la validación previa y tiempo máximo de petición (F3-07)
- **Objetivo:** que ninguna petición de sync dure más que `batchBudget + gracia + margen` y que la autenticación quede acotada.
- **Cambios:** tiempo máximo de petición/respuesta en el router de sync y un presupuesto para `resolveSyncContext`; evaluar si el driver admite acotar cada lectura dentro de la transacción (**[S] a verificar con la versión 9.11.2 del driver antes de diseñar**).
- **Pruebas:** dobles lentos en la lectura de la sesión; pool agotado → 503 y recuperación.
- **Riesgo:** medio (toca el camino de autenticación) → etapa propia, con análisis previo adicional. **Reversión:** respaldo `pre-F3-6`.

### F3.7 — Despliegue y seguridad previos a un servicio compartido (F3-08, F3-11, H12, B00)
- Confianza explícita en el proxy local y límites por cuenta además de por IP; certificados con cadena y revocación apropiadas para el cliente .NET (hoy CA de pruebas sin CRL); SCRAM-SHA-256 en Atlas (acción del propietario); rol de menor privilegio; cierre de B00. **Fuera del camino crítico de Godot local.**

### F3.8 — Observabilidad mínima (F3-10) · opcional
- Contadores de F2 y tiempos por operación a un canal **solo local** (archivo del proceso o salida al apagar), sin identificadores ni cargas. Aceptación: se pueden correlacionar tiempos de cliente con commits tardíos sin añadir exposición HTTP.

### F3.9 — Optimización de consultas por historial (F3-03) · condicionada
- Solo si F3.0/F3.10 muestran que el coste de F3-03 compromete los 2000 ms. Requiere decidir si se añaden campos/índices a `main_v2_facts` (cambio de esquema en Atlas, con su propia autorización, inspección previa y reversión por índice).

### F3.10 — Validación real de F3 (campaña sintética nueva)
- Mismo método A–G (ejecución nueva, ids nuevos, etapas con frase, sin tocar históricos): lote pequeño (5–8 operaciones con dependencias), P4 (respuesta abandonada con espera corta del cliente), una consulta de recibos, y, si F3.4 está hecha, **apagado con Ctrl+C** con un lote en vuelo. Criterios: deltas exactos, ningún duplicado, sin 503 con fila ni ACK sin fila. Requiere sus propias autorizaciones y la ventana de 90 minutos.

---

## 7.4 Plan de pruebas

Regla: **ninguna prueba toca Atlas ni datos existentes**; se usan los dobles y el arnés de los archivos de prueba actuales (`tests/sync/support`, `local-persistence/sync-http-tests`). La validación real es F3.10.

| ID | Qué valida | Etapa | Tipo |
|---|---|---|---|
| F3-T01 | Lote de 25 operaciones con 0,7–1,5 s por operación: con la configuración nueva el cliente nunca abandona antes de la respuesta | F3.1 | Cliente + simulador |
| F3-T02 | Lote adaptativo: sube/baja el tamaño según la latencia medida y respeta el máximo | F3.1 | Cliente |
| F3-T03 | Pasada máxima (sesión + consulta + lote) no vence el lease; no hay `LEASE_CONFLICT` en el flujo normal | F3.1 | Cliente |
| F3-T04 | Dos pasadas no se solapan aunque la respuesta tarde | F3.1 | Cliente |
| F3-T05 | Cliente real ↔ Express con F2: 503 con `results`, «no iniciadas» tras desconocido, `duplicate`, recibo ISO | F3.2 | Contrato |
| F3-T06 | 1000+ operaciones en cola: se envían sin pérdida; al alcanzar la cuota → estado `quota_blocked`, datos intactos | F3.3 | Servidor + cliente |
| F3-T07 | Cuota del perfil `main` = valor decidido; duplicados siguen respondiendo en la cuota | F3.3 | Servidor |
| F3-T08 | Cierre con lote en vuelo: respuesta completa y recursos cerrados en orden inverso; cierre forzado → reenvío `duplicate` | F3.4 | Servidor |
| F3-T09 | Drenaje: peticiones nuevas reciben 503 `Retry-After`; ninguna se pierde | F3.4 | Servidor |
| F3-T10 | `keepWarm`: sin lecturas tras cerrar; fallo invalida la caché; viajes en caliente = 14 tras inactividad simulada | F3.5 | Servidor |
| F3-T11 | Lectura de sesión lenta: la petición termina acotada; pool agotado → 503 y recuperación sin duplicados | F3.6 | Servidor |
| F3-T12 | Concurrencia: lotes y consultas simultáneos del mismo jugador convergen a una fila y un recibo (regresión T30/SC05/D02) | todas | Servidor |
| F3-T13 | Semilla aleatoria con fallos (como T15) ampliada a lotes de 8 con reinicios simulados del servidor | F3.1–F3.4 | Servidor |
| F3-T14 | Regresión completa: suites actuales del backend y del cliente sin fallos | todas | Regresión |

Cada etapa de `src/` repite el protocolo de F1/F2: pruebas nuevas escritas primero, implementación mínima, doble ejecución completa, revisión del diff, manifiesto nuevo.

---

## 7.5 Criterios de finalización de F3

F3 se considera terminada y segura para integrar con Godot cuando:
1. **Presupuestos coherentes:** el cliente nunca abandona antes de la respuesta del servidor en el régimen normal, medido en pruebas y en la validación real; sin pasadas solapadas del mismo jugador.
2. **Cuota decidida y visible:** se conoce el volumen real por hora de juego; la cuota lo cubre con holgura o el cliente reduce volumen; alcanzarla produce un estado visible y no un bucle ciego.
3. **Sin regresiones F1/F2:** 21/14/9 viajes, compuerta de commit, límites de 2000/10 000/3000 ms, contrato público sin campos ni códigos nuevos.
4. **Invariantes de integridad:** nunca ACK sin fila, nunca duplicados, el reenvío siempre devuelve el recibo original, históricos intactos (verificado por pruebas y por la campaña real).
5. **Apagado ordenado probado** (al menos con dobles y una vez contra Atlas con un lote en vuelo).
6. **Pruebas:** suite completa del backend y del cliente en verde, incluida la prueba de contrato cliente ↔ backend.
7. **Integridad del despliegue:** manifiesto nuevo verificado, respaldos `pre-F3-n`, escáner de secretos limpio, sin secretos en los informes.
8. **Validación real F3.10** aprobada con deltas exactos y sin 503 con fila.

---

## 7.6 Prioridades posteriores

### Indispensable antes de integrar Godot con el backend real
1. **F3-01 / F3.1** (tiempos, lote, lease del cliente).
2. **F3-02 / F3.3** (cuantificar y decidir cuota + estado visible).
3. **H2:** decidir la pila de identidad (v1 o v2) y retirar/desactivar la pila v1 contra `main`.
4. **H3:** definir cómo se configura `two_sides/sync/main_api_url` (hoy ausente; exige `https://`) y **H4:** probar `HttpClient` .NET con la CA de pruebas y Caddy (revocación, restricción de nombres).
5. **H5:** usar una base SQLite desechable o migrada para las pruebas (bloqueo `SYNC_DESTINATION_MIGRATION_REQUIRED`).
6. **F3.2:** prueba de contrato cliente real ↔ backend (H14).
7. Certificado de servidor (vence 2026-11-16) y CA (2026-12-02): regenerar antes de cualquier prueba posterior.

### Se puede posponer sin comprometer la corrección
- F3.5 (calentamiento continuo): mejora latencia, no integridad (el 503 en frío es correcto).
- F3.4 (apagado): evita ruido, no corrompe; hacerlo antes de uso sostenido.
- F3.6, F3.8, F3.9: según resultados de medición.
- F3.7 (servicio compartido, SCRAM-SHA-256, rol mínimo, B00): obligatorio antes de abrir el servicio a más jugadores o de producción, no para Godot local.
- H8, H10, H11, H13 (menores).

### Nada de esto exige una arquitectura nueva
Las decisiones del proyecto (una partida activa por jugador, cinco biomas, persistencia por bioma, registro de decisiones, SQLite local + Atlas remoto, identificadores estables, protección de históricos) se conservan; los hallazgos se resuelven con parámetros del cliente, composición del servidor y pruebas.

---

## Lo que este diagnóstico NO verificó
- No se re-ejecutó ninguna suite (conteos de pruebas = lectura de los archivos, no resultados de ejecución).
- No se midió latencia real de transacciones snapshot/`w:majority` en Atlas ni el coste de F3-03.
- El volumen de operaciones por hora de juego es una incógnita (F3.0).
- Si el driver 9.11.2 permite acotar lecturas individuales dentro de una transacción (F3.6).
- El comportamiento del SQLite real del jugador ante un corte de energía.
