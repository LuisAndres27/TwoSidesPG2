# B86 — Preparación y validación segura de MongoDB Atlas para estadísticas

Fecha: 5 de noviembre de 2026.

> **ACTUALIZADO POR `B86_1_TIEMPOS_Y_AISLAMIENTO_ANALITICO.md`:** cuatro identidades (se añade el publicador), Metabase lee una **base analítica separada** (no la de ingesta), presupuesto de 8 s por solicitud y preflight de solo lectura. Donde este informe difiera (identidades del §8, nombres de colecciones visibles del §6, tiempos del §16 bis), prevalece B86.1.

> **ACTUALIZADO POR `B86_5_MECANISMO_SCRAM_ATLAS.md`:** en **modo Atlas** el conector usa **SCRAM-SHA-1** explícito (comprobado solo en TwoSidesCluster: SCRAM-SHA-256 fue rechazado con code 8000); el servidor local de pruebas conserva SCRAM-SHA-256. Donde este informe diga «SCRAM-SHA-256» para Atlas, prevalece B86.5.

**Resultado: PREPARADO Y PROBADO EN LOCAL. Atlas NO está conectado.** No se leyó ninguna credencial, no se creó, modificó ni consultó ningún recurso remoto, no se activó telemetría real y no se hizo commit ni push. Lo que se demostró es el **comportamiento del código y de la matriz de privilegios contra un servidor MongoDB desechable con autenticación SCRAM y TLS**; nada de ello acredita la disponibilidad, los nombres de acciones o la latencia del proyecto Atlas del propietario.

## 1. Estado del proyecto
B77–B85 recibidas como indica la instrucción. Persisten: retención productiva no aprobada, conexión Atlas, credenciales técnicas definitivas, evaluación de contención, activación autorizada de envío desde Godot, B00, actualización de v5 y publicación. B84 (`http://127.0.0.1:4184/dashboard/`) y B85 (`http://127.0.0.1:4185/dashboard/2`) siguen en ejecución y sanas (`/api/health` correcto en ambos); sus contenedores y la base de demostración B84 no se modificaron.

## 2. Componentes reutilizados (sin reescribir)
Contrato `statistics-only-v1` (Zod), autenticación técnica sintética B79, `TransactionalStatisticsRepository`, adaptador MongoDB B81/B81.1 (sesión única, snapshot, majority+j, pausa acotada entre reintentos), esquema/validadores/índices B81/B82 (`provisionB81Statistics`, `verifyB81StatisticsSchema`), política experimental B82 `b82-run-hybrid-v1`, `POST /api/v1/statistics/events`, composición B84, generador B84, siembra B84, consultas B85. El adaptador no cambió su lógica transaccional: solo valida su objetivo mediante un despachador (ver §18).

## 3. Arquitectura
```
Two Sides.exe → SQLite local → Outbox → Express (POST /api/v1/statistics/events)
   → conector preparado (TLS + SCRAM —SHA-1 en Atlas, SHA-256 en el servidor local; ver B86.5— + comprobación exacta de privilegios)
   → MongoDB Atlas, base twosides_statistics_demo (futuro, demostración sintética)
   → Metabase (segunda conexión, lector, solo agregados)
```
Godot, SQLite, Outbox, Express, Atlas y Metabase conservan exactamente las responsabilidades del encargo. Nada de esta fase cambia Godot ni el guardado.

## 4. Configuración de Atlas (qué se espera, no creado)
Proyecto y clúster: los elige el propietario. Debe ser un replica set (todo clúster Atlas lo es) con transacciones; el conector lo comprueba al conectar (`hello`: primario escribible, `setName`, sesiones lógicas) y falla con categoría `transactions_unsupported`. Base: `twosides_statistics_demo` (no existe todavía; el nombre de producción `twosides_statistics` queda **bloqueado en código** hasta aprobar la retención). Procedimiento manual completo: §25 y `B86_GUIA_RAPIDA_ATLAS.md`.

## 5. Esquemas
Los de B81/B82, sin cambios: seis colecciones con `$jsonSchema` estricto, `validationLevel: strict`, `validationAction: error`, campos cerrados. Ninguna colección guarda partidas, JSON original, nombres, correos, rutas ni hardware. El plan generado (offline) está en `B86_ATLAS_ROLES_Y_ESQUEMA.json` (`node tools/b86/deployment-plan.mjs`).

## 6. Colecciones
| Colección | Contenido | ¿Visible a Metabase? |
|---|---|---|
| `stats_v1_counters` | contadores agregados (`all`, `day:`, `month:`) | **Sí (solo lectura)** |
| `stats_v1_meta` | semilla, esquema, política, revisión, `keyCheck` | No |
| `stats_v1_receipts` | recibos por hash de evento | No |
| `stats_v1_semantic` | marcas de unicidad semántica (híbrida B82) | No |
| `stats_v1_active` | actividad distinta por período | No |
| `stats_v1_budgets` | cuotas por instalación/día | No |

Hallazgo: la acción de base `listCollections` (que el descubrimiento de Metabase necesita; B85 lo comprobó con error 13 sin ella) también expone los **nombres** de las seis colecciones, aunque no su contenido (`authorizedCollections` no lo evita). Ver §20.

## 7. Índices
`_id` en todas; `expiry_v1 {expiresAt:1}` con `expireAfterSeconds: 0` en receipts, active y budgets. Las marcas semánticas de la política híbrida no tienen TTL (por eso son experimentales). Se verificó en el servidor de pruebas: el inventario se crea con la identidad de esquema y la ingesta **rechaza arrancar** si aparece un índice alterado (`schema_not_ready`).

## 8. Privilegios mínimos (verificados)
Matriz (acciones nativas MongoDB; `PRIVILEGE_MATRIX` en `src/modules/statistics/atlas-privileges.js`):

| Identidad | Recurso | Acciones |
|---|---|---|
| **ingesta** `twosides_statistics_ingest_v1` / rol `two_sides_statistics_ingest_v1` | counters | find, insert, update, listIndexes |
| | receipts | find, insert, **remove**, listIndexes |
| | semantic | find, insert, listIndexes |
| | active | find, insert, **remove**, listIndexes |
| | budgets | find, insert, update, listIndexes |
| | meta | find, **update** (fence actual), listIndexes |
| | base | listCollections |
| **esquema** `twosides_statistics_schema_v1` (temporal) | las seis | createCollection, find, insert, listIndexes; createIndex solo en receipts/semantic/active/budgets |
| | base | listCollections |
| **lector** `twosides_statistics_reader_v1` (Metabase) | counters | find |
| | base | listCollections, dbStats |

Equivalentes Atlas: FIND, INSERT, UPDATE, REMOVE, LIST_INDEXES, LIST_COLLECTIONS, CREATE_COLLECTION, CREATE_INDEX, DB_STATS (definiciones listas en `B86_ATLAS_ROLES_Y_ESQUEMA.json`; los nombres exactos deben confirmarse en la interfaz del proyecto del propietario).

Evidencia real (servidor desechable con autenticación): **suficiencia** — el flujo completo (aprovisionar, ingerir, leer) funciona solo con estas acciones; **necesidad** — se retiró una a una cada acción de la ingesta (23 variantes de rol) y en todas la ingesta real dejó de funcionar: ninguna acción es prescindible con el código actual. Cambios respecto a B83: `listIndexes` es necesario también en `counters`/`meta` (el verificador de esquema lista los índices de las seis colecciones) y `semantic` no necesita `remove`. Sin readWrite/dbOwner/atlasAdmin, sin comodines, sin acceso a otras bases, sin DDL en ingesta.

**Comprobación exacta al arrancar:** el conector pide `connectionStatus {showPrivileges:true}` y exige que la **unión** de roles y privilegios sea idéntica a la matriz; cualquier rol extra o privilegio de más o de menos aborta antes de leer o escribir (`unexpected_roles` / `privilege_mismatch`). Probado ampliando el rol de ingesta con un `remove` extra.

## 9. Autenticación
SCRAM explícito (**Atlas: SCRAM-SHA-1; servidor local: SCRAM-SHA-256**, ver `B86_5_MECANISMO_SCRAM_ATLAS.md`), `authSource: admin`, usuario y contraseña como **opciones del driver** (nunca en la URI, argumentos, variables de entorno ni archivos). Tres identidades distintas; la de esquema no se usa dentro de Express. No se reutiliza `two_sides_db`, `twosides_backend`, roles de sincronización ni cuentas B59–B67 (rechazados por nombre en la configuración). La identidad técnica de instalación sigue siendo la sintética B79; la definitiva está pendiente (§26).

## 10. TLS
`tls: true` siempre; el objetivo del adaptador se valida en cada sesión (`assertPreparedDriverTarget`): rechaza `tlsAllowInvalidCertificates`, `tlsAllowInvalidHostnames`, `tlsInsecure`, mecanismo distinto del fijado para el destino (Atlas: SCRAM-SHA-1; servidor local: SCRAM-SHA-256), `retryWrites`, proxy, balanceador, SRV distinto o usuario/base distintos. Atlas no admite CA propia en el conector (solo CA públicas). Probado en el servidor local (CA desechable): CA correcta conecta; **sin CA, CA ajena y texto plano son rechazados** con categoría segura.

## 11. Variables de entorno
Reutilizan los nombres propuestos en B83 y **no leen `process.env` por sí solas** (la función recibe el objeto):

| Variable | Valor | Efecto |
|---|---|---|
| `STATISTICS_ENABLE` | `true` | Sin ella: **modo apagado**, aunque exista cualquier otra variable |
| `STATISTICS_STORAGE` | `local-demo` \| `atlas-test` (`production` → error) | Selección explícita; nunca inferida |
| `STATISTICS_ATLAS_AUTHORIZATION` | la frase literal del propietario (`atlas-policy.js`) | Sin ella no se puede seleccionar Atlas |
| `STATISTICS_ATLAS_HOST` | `<clúster>.<id>.mongodb.net` (patrón estricto; rechaza IP, puertos, `@`, dominios ajenos) | |
| `STATISTICS_DATABASE` | solo `twosides_statistics_demo` | |
| `STATISTICS_POLICY_VERSION` | solo `b82-run-hybrid-v1` | |
| `STATISTICS_SERVICE_USER` | uno de los tres usuarios nuevos | fija la identidad |

`MONGODB_URI`, `MONGO_URL` y similares **se ignoran**. Contraseña: no es variable; llega por stdin (`Run-Atlas-Session.ps1`, prompt oculto). Sin configuración válida: no se conecta, no se migra, no hay telemetría.

## 12. Política de retención pendiente
**No implementada ni activada.** B83 recomienda un híbrido por tipo dentro de **campañas finitas**: una campaña es una ventana UTC declarada [S, E] (captura) más admisión hasta E+R+F (R ventana de aceptación de eventos antiguos, F margen de futuro); las marcas de unicidad viven hasta L=E+R+F y caducan al cierre; recibos, actividad y cuotas son temporales; los contadores no caducan. Eventos tardíos fuera de la ventana se rechazan permanentemente (`event_expired`) y la cobertura offline previa a S queda declarada como incompleta. La unicidad **entre** campañas no existe: la misma instalación puede contarse otra vez en la campaña siguiente (el riesgo reproducido en B81.1). Privacidad: marcas HMAC durante toda la campaña; crecimiento acotado por campaña. **Falta la decisión del propietario** (fechas S/E, métrica por campaña vs. total de vida, tratamiento del backlog). Para la demo remota solo se admite la política experimental **sobre `twosides_statistics_demo`, expresamente sintética**; el código bloquea `production`.

## 13. Plan de migración
Sin migración de datos: la base es nueva y sintética. Orden (`deployment-plan.mjs`): 1) propietario crea roles y usuarios; 2) restringe red; 3) *preflight* con cada identidad; 4) `provision` con la identidad de esquema sobre una base **nueva y vacía** (el aprovisionador se niega si hay colecciones); 5) `seed` del conjunto sintético con la identidad de ingesta; 6) `read` con la identidad lectora y comparación con un oráculo; 7) el propietario elimina el usuario de esquema. No se migran los 71 eventos de B78, las 2151 operaciones ni nada de B84.

## 14. Plan de conexión
`tools/b86/Run-Atlas-Session.ps1 -Identity <ingest|schema|reader> -Action <preflight|provision|seed|read> -AtlasHost <host>` (solo propietario). Pide la frase de autorización y la contraseña en un prompt oculto, fija las variables no secretas solo para ese proceso, pasa las credenciales por stdin y las borra. Salida: informe JSON sin secretos, host, usuario ni URI. Salidas de `atlas-session.mjs`: 2 = apagado o sin autorización (nada contactado), 3 = sin credenciales, 4 = fallo (solo categoría y etapa). Probado que con entorno vacío, sin frase y sin credenciales **no hay conexión** (el proceso termina antes).

## 15. Pruebas locales
| Suite | Resultado |
|---|---|
| B86 offline (`tests/b86/vitest.config.js`) | **22/22** — configuración apagada por defecto, ignora URI/process.env, hosts/bases/políticas/usuarios inválidos, configuración infalsificable, objetivo del driver (12 debilitamientos rechazados), opciones sin credenciales en URI, categorías de error sin fuga, matriz exacta, comprobación de unión, conjunto sintético, plan, CLI sin red |
| B86 real en servidor desechable TLS+SCRAM (`B86_REAL_TESTS=1`, `tests/b86/b86-real.config.js`) | **11/11** (ver §16 bis) |
| Estadísticas B79–B83 | **222/222** (tras los cambios aditivos de §18) |
| B84 offline | **34/34** |
| Verificador v5 | `tree_differs` esperado: **18 añadidos, 0 modificados**, 0 problemas |
| Compatibilidad B85 | solo comprobado `GET /api/health` de Metabase y de Express B84 (OK). **No** se ejecutó `tools/b85/verify.mjs` (usa credenciales locales de B85) |
| .NET/Godot | **No repetido**: no cambió ningún archivo .NET ni de Godot |
| Suites reales B81.1/B82 y B84-real | **No repetidas**: exigen un contenedor sin bases ajenas o dependen de la base B84; sus rutas de código no cambiaron |

## 16. Pruebas Atlas pendientes (no ejecutadas)
Checklist §12 de la instrucción: **no se afirma ninguna como aprobada en Atlas.** La tabla muestra qué se acreditó localmente y qué queda para una ejecución autorizada.

| # | Caso | Local (servidor desechable) | Atlas |
|---|---|---|---|
| 1 | TLS correcto | ✔ CA propia; CA ausente/ajena/texto plano rechazados | Pendiente (CA pública, hostname real) |
| 2 | Credencial válida | ✔ | Pendiente |
| 3 | Credencial inválida | ✔ categoría `authentication` | Pendiente |
| 4 | Permisos insuficientes | ✔ rol ampliado/reducido rechazado; lector no escribe | Pendiente |
| 5 | Base incorrecta | ✔ `privilege_mismatch`; base ajena → error 13 | Pendiente |
| 6 | Colección no autorizada | ✔ error 13 (otras colecciones, semantic remove, técnicas desde lector) | Pendiente |
| 7 | Transacción válida | ✔ | Pendiente |
| 8 | Transacción abortada | ✔ nada contado; reintento cuenta una vez | Pendiente |
| 9 | Evento duplicado | ✔ `duplicate`; mismo hecho con otro EventId → `fact_conflict` | Pendiente |
| 10 | Respuesta perdida | ✔ commit sin ACK → reintento `duplicate` | Pendiente |
| 11 | Reintento | ✔ (incluida caída del servidor y recuperación: ver abajo) | Pendiente |
| 12 | Recibo válido | ✔ | Pendiente |
| 13 | Concurrencia | ✔ 4 escritores solapados, sin pérdida ni doble conteo (reintentos de conflictos permitidos) | Pendiente; contención no medida |
| 14 | Lectura agregada | ✔ lector == oráculo | Pendiente |
| 15 | Metabase no escribe | ✔ insert/update/delete/drop/createCollection/createIndex → 13 | Pendiente |
| 16 | Sin exposición de secretos | ✔ informes y errores sin contraseña/usuario/host/puerto | Pendiente |
| 17 | Validación de índices | ✔ índice alterado impide el arranque | Pendiente |

### 16 bis. Hallazgos operativos de las pruebas reales
- **Caída del almacenamiento:** el servidor desechable se detuvo y reinició. Con él caído, cada evento tarda ~**5 s** en devolver `retryable / storage_unavailable` (2 eventos: 10,0 s); Express **no confirma** nada no comprometido. Al volver, el mismo repositorio se recuperó solo, los 5 eventos pendientes se aceptaron, el reenvío completo fue `duplicate` y el total aumentó exactamente en el número de eventos. **Riesgo:** un lote de 5 con almacenamiento caído tarda ~25 s, más que los 15 s del cliente .NET: hay que acotar el presupuesto (B83 ya lo anticipaba). No se modificó.
- **Escritura en conflicto:** `repository.close()` y lecturas pueden lanzar `TransactionConflict` bajo concurrencia (mantenimiento al cerrar); las pruebas lo reintentan. Contención real sigue sin medirse.
- **Nombres de colecciones visibles al lector** (ver §6).

## 17. Datos sintéticos
`tools/b86/session.js`: semilla pública `twosides-b86-atlas-synthetic-v1`, 5 instalaciones, 4 días (anclados antes del 4 nov 2026), 335 eventos —nuevos, sin ningún identificador de B84, B78 ni operaciones históricas—. Incluyen sesiones, partidas iniciadas y completadas, los cinco biomas, approve/reject coherentes con healthy/degraded, tiempo efectivo y finales good/medium/bad. Determinista: sembrar dos veces no cuenta dos veces (probado: segunda siembra, 0 aceptados, 0 rechazados, totales == oracle). Se identifica como demostración. **No se ha escrito en Atlas.** El generador B84 ganó un parámetro opcional `seed`; sin él produce exactamente los mismos 2 293 eventos (probado).

## 18. Integración Express
`POST /api/v1/statistics/events` y su contrato no cambian. Cambios **aditivos**, todos probados:
- `atlas-policy.js` (nuevo): selección apagada por defecto, configuración infalsificable, objetivo del driver.
- `atlas-privileges.js` (nuevo): matriz, definiciones de roles, comprobación exacta.
- `atlas-connector.js` (nuevo): opciones seguras, errores a categoría, `openPreparedIngestRepository`.
- `mongo-local-policy.js` (+import + `assertStatisticsDriverTarget`: despacha a la política Atlas solo para configuraciones emitidas por `atlas-policy.js`; cualquier otra mantiene las reglas B81 sin cambios).
- `mongo-transaction-adapter.js` (solo el alias de importación del despachador).
- `mongo-schema.js` (el aprovisionador acepta además los nombres `twosides_statistics_demo` y `twosides_statistics_b86_<16 hex>`).
- `mongo-test-composition.js` y `offline-app.js` (aceptan el perfil `statistics-atlas-prepared`, exigiendo un repositorio MongoDB registrado).
Fallos: sin Atlas, los recibos son `retryable/storage_unavailable`; no se confirma lo no comprometido; no se duplican agregados; el Outbox local del juego conserva los pendientes. Ninguna ruta de sincronización de partidas ni subida de SQLite existe.

## 19. Preparación de Metabase
B85 intacto (15 preguntas, dashboard 2, contenedores sin cambios). `B86_metabase-atlas-connection.template.json` describe una **segunda** conexión futura: lector `twosides_statistics_reader_v1`, TLS, base `twosides_statistics_demo`, sin credenciales en el JSON, sincronización manual y rótulo «DEMOSTRACIÓN SINTÉTICA». No se creó ninguna conexión.

## 20. Seguridad
Apagado por defecto; autorización literal del propietario; hosts/bases/políticas/usuarios fijados; credenciales fuera de entorno/URI/archivos; TLS sin opciones inseguras; privilegios exactos verificados al arrancar; errores reducidos a categoría; informes sin secretos (comprobado por búsqueda de contraseñas, usuarios, host y puerto). **Riesgos:** (1) el lector ve los nombres de las colecciones técnicas — alternativa: publicar los agregados en una base aparte (como B85); (2) la clave HMAC de la demo es **pública** y solo vale para la base sintética; (3) los permisos son por colección, no por campo: un servicio comprometido con el rol de ingesta puede abusar de sus colecciones; (4) `remove` en receipts/active es necesario con el código actual; (5) sin prueba de carga ni de failover; (6) Metabase local (B85) no usa TLS; (7) HTTPS, gestión de secretos y B00 pendientes.

## 21. Estado de aislamiento
No se accedió a PlayerData (ni contenido, metadatos, existencia, listados ni hashes), ni a SQLite histórica, ni a los 71 eventos ni a las 2151 operaciones. No se leyó `.env` ni ninguna credencial. No hubo conexiones externas (la guardia de aislamiento bloquea red y DNS no locales; el único tráfico fue loopback). Se creó **un contenedor propio y desechable** `twosides-b86-rbac` (imagen `mongo:8.0` ya presente, memoria 512 MiB, solo `127.0.0.1:27086`, CA, llave y contraseñas aleatorias en memoria): se creó y se **eliminó** en cada ejecución; no queda ninguno. Los contenedores del propietario (`twosides-b811-mongo`, `twosides-b85-metabase`, `twosides-b85-analytics`) no se detuvieron, reiniciaron, modificaron ni se escribió en ellos; la base `twosides_statistics_b81_b84d4…` se conserva y `admin/config/local` no se tocaron.

## 22. Estado de B00
Pendiente; no ejecutado. **23. Estado de v5:** no activado ni modificado; verificador: `tree_differs` esperado, 18 archivos añadidos, 0 modificados.

## 24. Reversión
Todo lo nuevo es aditivo. Para revertir: borrar `atlas-policy.js`, `atlas-privileges.js`, `atlas-connector.js`, `tools/b86/`, `tests/b86/` y los documentos/JSON `B86_*`; deshacer las cinco ediciones menores de §18 (el despachador, el alias, la expresión de nombre de base, y las dos condiciones de perfil) y el parámetro `seed` del generador. No se creó ni modificó ningún recurso remoto, por lo que no hay nada que revertir en Atlas.

## 25. Procedimiento manual del propietario
Resumido en `B86_GUIA_RAPIDA_ATLAS.md` (secciones B y C). Puntos clave: proyecto y clúster correctos; tres roles personalizados con las acciones del JSON; tres usuarios SCRAM; Network Access solo con las IP necesarias (nunca `0.0.0.0/0`); la base `twosides_statistics_demo` debe no existir; contraseñas generadas por el propietario y guardadas fuera de Git y OneDrive; ejecutar `Run-Atlas-Session.ps1` solo tras autorizar; al terminar, borrar el usuario de esquema y cualquier acceso de prueba.

## 26. Bloqueos
1. **Autorizaciones:** primera conexión Atlas y cada escritura (provision, seed) deben autorizarse por separado. 2. **Retención productiva** no decidida. 3. **Credenciales técnicas definitivas** y clave HMAC privada (custodia, rotación, B00). 4. Presupuesto de tiempo extremo a extremo (cliente 15 s vs. ~5 s por evento con almacenamiento caído). 5. Contención de la revisión global y capacidad. 6. Decisión sobre nombres de colecciones visibles a Metabase. 7. Confirmar en el proyecto Atlas los nombres exactos de acciones y la disponibilidad de roles personalizados. 8. B00, v5, HTTPS y publicación.

## 27. Próximos pasos
Mañana: que el propietario complete la sección B de la guía y autorice, si lo desea, el *preflight* del lector (solo lectura de topología y permisos); después `preflight` de las otras dos identidades, `provision`, `seed`, `read`, y la segunda conexión en Metabase. En paralelo, decidir la política de retención y el presupuesto de tiempo de ingesta.

## Apéndice — archivos
Nuevos: `src/modules/statistics/atlas-policy.js` (5A837851…), `atlas-privileges.js` (F4484DC5…), `atlas-connector.js` (1C9D36FF…); `tools/b86/session.js` (9B647BDE…), `atlas-session.mjs`, `Run-Atlas-Session.ps1`, `deployment-plan.mjs`; `tests/b86/` (`b86-offline.test.js` 555E3CF2…, `b86-rbac.real.js` 58CF4C8D…, `rbac-container.js`, configuraciones); docs `B86_PREPARACION_CONEXION_ATLAS_ESTADISTICAS.md`, `B86_GUIA_RAPIDA_ATLAS.md`, `B86_ATLAS_ROLES_Y_ESQUEMA.json`, `B86_metabase-atlas-connection.template.json`. Modificados (aditivo): `mongo-local-policy.js` (62DC5BEA…), `mongo-transaction-adapter.js` (D8AE6B51…), `mongo-schema.js` (BBB32F03…), `mongo-test-composition.js` (1AF6A7B5…), `offline-app.js` (553C38BE…), `tools/b84/generator.js` (572D1E14…).
