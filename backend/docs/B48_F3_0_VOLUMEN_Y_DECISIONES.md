# B48 — F3.0: volumen de operaciones y decisiones mínimas

Fecha: 2026-11-03. **Solo lectura y documentación.** No se modificó código, pruebas, certificados, manifiestos, SQLite ni Godot; no se conectó Atlas; no se arrancó Express ni Caddy; no hubo commits ni push. Complementa B47 (`B47_F3_DIAGNOSTICO_Y_PLAN.md`); no lo modifica.

**Regla de honestidad de este informe.** No hay mediciones reales del volumen de juego: el juego nunca se ha jugado con la sincronización activa y la telemetría no se ha extraído de ninguna partida real. Todas las cifras de volumen son **estimaciones con supuestos explícitos (§3)**, calculadas con una fórmula reproducible a partir del código. Lo que sí se verificó en el código está marcado **[I]**; lo que viene de la documentación del proyecto, **[D]**; los supuestos, **[S]**.

Fuentes: `integration/sqlite/LocalGameplayObserver.cs`, `GamePersistenceContext.cs`, `GameSyncHost.cs`; `local-persistence/src/{GameSaveService,SyncFactInventory,SyncOutboxProjection,LocalOutboxPump,LocalOutboxScheduler}.cs.txt`, `local-persistence/sync-http/*`; `scripts/network/GameApplicationContext.cs`, `scripts/AnimalSegmentFlow.cs`; `docs/Requerimientos_Two_Sides_v6_corregido.docx` (texto extraído en solo lectura), `backend/docs/{GAMEPLAY_EVENT_AUDIT,Decisiones_Biomas_Godot,BIOME_PERSISTENCE_MAPPING,B38,B47}.md`; servidor `ingestion-engine.js`, `mongo-ingestion-repository.js`, `main/profile.js`.

---

## Resumen ejecutivo

1. **El hallazgo central:** cada **5 s** de ejecución del juego (en *cualquier* estado: menú, pausa, segundo plano, juego) el observador cierra un intervalo y cada intervalo se convierte en una operación de sincronización. Son ≈ **720 operaciones por hora** de aplicación abierta [I]. Con la cuota actual de 1000 operaciones por jugador (de por vida), el sistema deja de aceptar operaciones a los **≈ 80 minutos** de uso acumulado. Una partida normal completa (escenario medio) la supera (≈ 130 %).
2. **Elevar la cuota no es la solución con la cadencia actual:** el servidor lee todos los hechos del jugador en cada operación nueva; a 7000+ operaciones el coste por operación sería inviable en el presupuesto de 2000 ms (F3-03 de B47).
3. **Recomendación:** (a) cambiar la cadencia de cierre de intervalos de 5 s a **30 s** (una constante; ≈ 6× menos volumen; el tiempo efectivo sigue exacto, solo cambia la granularidad); (b) con eso, los escenarios bajo y medio caben en la cuota actual y el alto (≈ 2200) pide una cuota de **3000**; (c) subir la cuota **no antes** de medir el coste por operación con historial largo; (d) el cliente debe mostrar un estado «sincronización detenida por cuota» en vez de reintentar a ciegas.
4. **H1 provisional:** tiempo de espera 15 s ✔ adecuado; lease 60 s ✔ adecuado; lote «hasta 8» ✔ como **tope**, pero el lote **inicial** debe ser 5 y adaptarse al tiempo medido (con 1,5 s por operación, 8 operaciones ≈ 12 s superan el presupuesto del servidor de 10 s; sigue siendo seguro, pero ineficiente).
5. **H2:** la pila v1 de Godot **no se inicia** hoy (`InitializeRemoteServices` no se llama) [I]; no hay autenticación existente que romper. Propuesta: la identidad Sync v2 (cuenta técnica por instalación) es la única identidad de transporte para la sincronización; la cuenta de usuario del requisito RF-035 es un asunto aparte (vinculación posterior).
6. **Discrepancia a decidir por el propietario (no se resuelve aquí):** el documento de requisitos v6 (RNF-006) dice que el juego **requiere conexión permanente** y que SQLite es una caché temporal; la arquitectura implementada y descrita para este trabajo es **local-primero con Outbox recuperable**. Ver §9.

---

## 1. Inventario de operaciones que genera el juego

### 1.1 Operaciones locales (SQLite) frente a operaciones enviadas a Atlas

| Capa | Qué es | ¿Se envía a Atlas? |
|---|---|---|
| `local_operations` (diario de comandos locales) | `create_profile`, `rename`, `new_game`, `enter_biome`, `decision`, `complete_biome`, `prepare_final`, `close_game`, `save_game`, `environment`, `biome_progress`, `setting` [I: `GameSaveService`] | **No.** Es el registro idempotente local de cada comando; no pasa a la Outbox |
| Hechos proyectados a la Outbox (`sync_outbox`) | Solo cuatro tipos: `game.report`, `session.report`, `gameplay.event`, `gameplay.interval` [I: `SyncFactInventory.cs:12-26`] | **Sí**, uno por hecho |

Los comandos locales cambian el estado; el **proyector** (`LocalOutboxPump`, coalescencia de 2 s) lee el estado ya guardado y crea las filas de Outbox. Perfil, nombre y ajustes **no** se sincronizan. Los eventos `SESSION_STARTED/ENDED` tampoco: se representan con `session.report` [I].

### 1.2 Hechos que llegan a Atlas

| Tipo | Cuándo se genera | Cuántos |
|---|---|---|
| `game.report` | Una operación por **revisión** de partida: cada comando que sube la revisión (`new_game`, `enter_biome`, `decision`, `complete_biome`, `prepare_final`, `close_game`, `save_game`) [I]. El proyector toma la revisión vigente de la partida en cada pasada | por partida: 1 + 5 (entrar) + 5 (decisión) + 5 (completar) + 1 + 1 = **18**, más los `save_game` (**k**, [S]) |
| `session.report` | `open` y `terminal` (cuando la sesión se cierra o se marca interrumpida) | **2 por arranque del juego** |
| `gameplay.event` | `ANIMAL_SEGMENT_STARTED` (1 por intento), `ANIMAL_DIED`, `ANIMAL_RETRY_REQUESTED`, `ANIMAL_RESTART_REQUESTED`, `ANIMAL_SEGMENT_COMPLETED`, `ANIMAL_SEGMENT_EXITED` [I: `LocalGameplayObserver`] | por bioma: éxito = 2; cada fallo con reintento = 3 (STARTED, DIED, RETRY); cada reinicio voluntario = 2 (STARTED, RESTART_REQUESTED); más 1 `EXITED` (cota superior) |
| `gameplay.interval` | `Observe` se llama en cada fotograma desde el autoload [I: `GamePersistenceContext.cs:62`]; **si han pasado ≥ 5000 ms desde el último límite, escribe un intervalo** en el estado actual (también Menu, Paused, Background, GameOver, Loading); además uno por **cada cambio de estado** [I: `LocalGameplayObserver.cs:92,112`] | tiempo de aplicación ÷ 5 s **+** cambios de estado |

Toda fila de `gameplay_intervals` entra en la Outbox sin filtro [I: `SyncFactInventory.cs:19`]. La captura empieza al abrir el perfil local y no depende de que el jugador esté «jugando» [I].

### 1.3 Qué piden realmente los requisitos (documento v6)
- El cliente mide el tiempo efectivo y **lo envía al backend al completar un bioma o al cerrar sesión**; el backend lo acumula por usuario y por bioma [D: RF-0xx, tiempo jugado].
- El guardado ocurre «al completar un segmento» y el registro de la partida se envía al backend [D].
- Las decisiones se registran en una bitácora por jugador autenticado [D].

Es decir, el requisito exige que el backend **conozca** el tiempo efectivo por bioma; **no exige** un flujo de intervalos de 5 s. La granularidad de 5 s proviene del diseño de telemetría (GAMEPLAY_EVENT_AUDIT: «cadencia 5 s… debe aprobarse y medirse»), no del requisito. Esto es lo que permite proponer cambiar la cadencia sin cambiar requisitos.

---

## 2. Estimación por bioma y por partida

### 2.1 Un bioma
Flujo: tarjeta → entrada → decisión humana (1 decisión, texto) → segmento animal (uno o varios intentos) → completar. Parámetros por bioma: **f** fallos (cada uno: STARTED+DIED+RETRY), **r** reinicios voluntarios (STARTED+RESTART), **c** = 6 cambios de estado por intento (Loading→Active, pausa/reanudar, GameOver, Loading) [S], +4 cambios de menú/decisión [S].

- Operaciones de partida: 3 (`enter_biome`, `decision`, `complete_biome`) [I].
- Eventos: `2 + 3·f + 2·r + 1` (el último es el EXITED).
- Intervalos por cambio de estado: `(1 + f + r)·6 + 4`.
- Intervalos por cadencia: `minutos_del_bioma · 60 / cadencia`.

Ejemplo, bioma «sin tropiezos» (f=0, r=0, 6 min): 3 + 3 + (10) + (72 a 5 s | 12 a 30 s) = **88** a 5 s, **28** a 30 s.

### 2.2 Efecto de reinicios, cambios de bioma y partidas nuevas
- **Reinicio del segmento animal (derrota → reintento / reinicio voluntario):** +2 a +3 eventos y +6 cambios de estado por intento, **más el tiempo extra** que se sigue contando a la cadencia. Dominado por tiempo, no por eventos.
- **Cambio entre biomas / volver al menú:** `enter_biome` solo sube revisión «si hace falta» (primera entrada aplicable); reentrar es lectura. El tiempo en el menú de niveles **sí genera intervalos** (estado Menu).
- **Partida nueva:** otra serie de 18 `game.report` + eventos + intervalos. La cuota es **por cuenta técnica, de por vida**, no por partida.
- **Importación inicial:** al activar la sincronización, el proyector inserta como `historical_import` todo lo ya guardado en SQLite (partidas, sesiones, eventos e intervalos previos) [I: `LocalOutboxPump`]: una base de pruebas con mucho historial ya consume cuota.

---

## 3. Escenarios de carga y supuestos

Fórmula (por escenario): `total = G·(18+k) + 2·S + G·5·(3+3f+2r) + minutos·60/cadencia + G·5·((1+f+r)·6+4)`, donde G = partidas, S = arranques del juego.

| Parámetro | **Bajo** | **Medio** | **Alto** |
|---|---|---|---|
| Descripción [S] | una partida casual, sin derrotas | una partida con derrotas y pausas, tres sesiones | jugador completista: tres partidas completas, muchos reintentos |
| Partidas G | 1 | 1 | 3 |
| Arranques del juego S | 1 | 3 | 12 |
| Minutos de aplicación abierta | 35 | 90 | 500 (≈ 8,3 h) |
| Fallos por bioma f | 0 | 2 | 5 |
| Reinicios voluntarios r | 0 | 1 | 2 |
| `save_game` por partida k | 0 | 5 | 15 |

### Resultados (operaciones totales de por vida de un jugador)

| Escenario | Cadencia | `game.report` | sesiones | eventos | intervalos | **TOTAL** | frente a 1000 |
|---|---|---|---|---|---|---|---|
| Bajo | **5 s** (actual) | 18 | 2 | 15 | 470 | **505** | 50 % |
| Bajo | 30 s | 18 | 2 | 15 | 120 | **155** | 16 % |
| Bajo | 60 s | 18 | 2 | 15 | 85 | 120 | 12 % |
| Medio | **5 s** (actual) | 23 | 6 | 55 | 1220 | **1304** | **130 %** |
| Medio | 30 s | 23 | 6 | 55 | 320 | **404** | 40 % |
| Medio | 60 s | 23 | 6 | 55 | 230 | 314 | 31 % |
| Alto | **5 s** (actual) | 99 | 24 | 330 | 6780 | **7233** | **723 %** |
| Alto | 30 s | 99 | 24 | 330 | 1780 | **2233** | **223 %** |
| Alto | 60 s | 99 | 24 | 330 | 1280 | 1733 | 173 % |

Lectura:
- A 5 s, **≈ 12 operaciones/min** de aplicación abierta; 1000 se agotan en ≈ 80 min [(1000 − 40) / 12].
- A 30 s, **≈ 2/min**; 1000 se agotan en ≈ 8 h de uso.
- En el escenario alto los **cambios de estado** (780) pesan tanto como la cadencia (1000 a 30 s): bajar de 30 s a 60 s ahorra poco; el límite práctico lo marcan los cambios de estado.
- Las cifras son **cotas razonables, no mediciones**. Lo que realmente se necesita (F3.10) es el conteo real de filas de Outbox tras una partida sandbox.

### Almacenamiento en Atlas (estimación [S])
Cada operación nueva escribe un documento en `operations` y otro en `facts` (≈ 1,5–3 KB entre ambos con índices; **no medido**). Medio a 30 s (404 operaciones ≈ 0,6–1,2 MB por jugador) ⇒ ≈ 1000 jugadores ≈ 0,6–1,2 GB. El nivel gratuito (512 MB) no sirve para un servicio compartido sostenido. Se debe medir con tamaño real (`collStats`, lectura, con autorización) en F3.10.

---

## 4. Recomendación sobre la cuota

**Veredicto: rediseñar el volumen en el origen (cadencia), luego aumentar la cuota de forma moderada y condicionada. No conservar 1000 ni saltar a 10 000.**

| Opción | Efecto | Veredicto |
|---|---|---|
| Conservar 1000 y cadencia 5 s | Bloqueo a los ≈ 80 min; el escenario medio ya no cabe | ❌ no viable |
| Subir a 10 000 (tope del código) con cadencia 5 s | Cabe el alto (7233) pero cada operación nueva lee hasta ~7000 documentos del jugador (F3-03) dentro de 2000 ms | ❌ no viable (coste cuadrático: Σ de lecturas ≈ 25 millones de documentos en un jugador alto) |
| **Cadencia 30 s + cuota 3000** | bajo 155, medio 404, alto 2233 (1,34× de margen); lecturas por operación ≤ 3000 en el peor caso | ✅ **recomendado**, sujeto a medir el coste con historial largo |
| Cadencia 30 s + cuota 1000 | Bajo y medio caben; el alto se detiene a ≈ 4 h | ⚠ aceptable **solo** para la primera integración de Godot y pruebas, no para lanzamiento |
| Agregar intervalos al proyectar (solo tramos cerrados con identificador determinista) | Elimina la parte de cadencia (≈ 1000 de 2233 en el alto) | opción de diseño mayor: cambia qué hechos se envían y exige id determinista e inmutabilidad; **no se propone ahora** |

Condiciones para la cuota de 3000:
1. **Medir** (F3.10) latencia por operación con 500, 1500 y 3000 hechos en el propietario sintético; si el p95 supera ≈ 1200 ms con ≥ 2000 hechos, **primero** aplicar la optimización de F3-03 (consulta selectiva por identificadores/sesión sin cambio de esquema, con pruebas diferenciales), después elevar.
2. **El cliente debe tratar `quota_exceeded` como estado de usuario**, no como reintento ciego (F3-02). Obligatorio antes de lanzamiento.
3. **Cuota global (`maxTotalRecords`)** distinta de la individual: hoy 50 000 [I: `ingestion-engine.js:23`], que **se agota con ≈ 22 jugadores altos o ≈ 124 medios** a 30 s. Para servicio compartido debe dimensionarse como `1,5 × jugadores esperados × operaciones medias (≈ 400)`: 100 jugadores → 60 000; 1000 → 600 000 (el constructor admite hasta 1 000 000). Se decide con el número de jugadores previsto.

---

## 5. Configuración mínima recomendada de timeout, lote y lease (H1)

Modelo de tiempo por operación: 14 viajes en caliente ≈ **0,7 s**, 21 en frío ≈ **1,5 s** (B34/B38, a 49,5 ms de RTT); en la campaña B46 una petición de una operación tardó 1,5–3,5 s de extremo a extremo con PowerShell (incluye TLS e inicio de cliente) [R de B46].

| Parámetro | Actual | Propuesta provisional | Evaluación |
|---|---|---|---|
| Tiempo de espera del cliente | 10 s | **15 s** | ✔ Adecuado. El servidor responde en ≤ 10 s por lote (tope fijo en el constructor) + lecturas de autenticación previas (≈ 0,1–0,3 s normales) + red: margen ≈ 4 s. Caddy local (`response_header_timeout 15 s`) no se activa porque el servidor contesta antes |
| Tamaño de lote | 25 | **inicial 5, tope 8, adaptativo** | ⚠ 8 fijo es borde: 8×0,7 = 5,6 s ✔, 8×1,5 = 12 s ✘ (> 10 s; el servidor deja el resto como `deferred` y es seguro, pero se desperdicia la pasada). Adaptar con el tiempo medido por operación (objetivo ≤ 6 s por lote) |
| Lease | 30 s | **60 s** | ✔ Peor pasada: inicio de sesión 15 + consulta de recibos 15 + lote 15 = **45 s** < 60 s. Con 30 s la pasada puede vencer el lease (H6) |
| Reposo entre pasadas | 15 s inactivo / 5 s tras fallo; **pasada con trabajo vuelve a ejecutarse de inmediato** [I: `SyncOutboxWorker`] | sin cambio | ✔ El vaciado de colas no espera |

Capacidad resultante: ≈ 40–85 operaciones/min de vaciado, frente a ≈ 2–3/min de generación a 30 s (≈ 12/min a 5 s, también cubierto). Una importación histórica de 2000 filas tarda ≈ 25–50 min en segundo plano.

Límites de peticiones del servidor con esta configuración: ≈ 6–10 peticiones/min por jugador (< `sync-owner` 120/min); no hay riesgo.

**Esto es provisional**: los números definitivos salen de la medición de F3.10.

---

## 6. Decisión técnica propuesta para H2 (identidad)

**Hechos verificados [I]:**
- La pila v1 de Godot (`ApiClient`, `ConnectivitySupervisor`, `PendingOperationStore`, rutas `/api/v1/*`) **no se inicia**: `InitializeRemoteServices()` está «retenido para una fase de sincronización autorizada por separado; nunca requerido por el arranque local» y no se llama (`GameApplicationContext.cs:28-45`). El autoload solo crea el contexto local (`Local`) y el anfitrión de sincronización (`Sync`). El flujo animal con contexto local **nunca recurre a la remota** (`AnimalSegmentFlow.Open`, líneas 198-209).
- El backend `main` solo monta `/api/health` y `/api/v2/*`; `/api/v1/*` responde 404.
- La sincronización v2 usa **cuentas técnicas** (registro idempotente `registrationId`, credencial local protegida con DPAPI por jugador+instalación+destino) y JWT v2 de 15 min con re-inicio de sesión automático [B38 §3, §4].

**Decisión propuesta (sin romper nada existente):**
1. **Identidad de sincronización = cuenta técnica Sync v2**, creada automáticamente por instalación y jugador local. Sin pantallas de login. Es la única identidad que habla con `main`.
2. **La pila v1 queda dormida y marcada como heredada**: no se inicializa, no se monta en el backend, no se borra aún (riesgo cero, nada depende de ella). Su retirada es posterior y opcional.
3. **No se toca el perfil local** (`local_profiles` en SQLite; selección «Logout→Login→Resume» del menú local): es independiente de la identidad remota.
4. **Activación**: definir `two_sides/sync/main_api_url` (HTTPS, sin credenciales ni ruta) solo en el despliegue de pruebas; sin esa clave la sincronización permanece desactivada [I: `GameSyncHost`]. Pruebas con base sandbox (`--two-sides-test-storage=sandbox`) por H5.
5. **Limitación que debe conocerse:** una cuenta técnica = una instalación. Reinstalar crea otra cuenta y **no recupera** la anterior en el servidor. El requisito RF-035 (cuenta de usuario con correo/contraseña, panel «solo ver mis datos») **no está cubierto por esta identidad**: requeriría una *vinculación* posterior entre cuenta de usuario y cuenta técnica (el modelo ya tiene el campo `linked`). **No es parte de F3**; se deja como brecha de requisitos explícita (§9).

---

## 7. Implicaciones de un backend compartido (ajustes mínimos)

Indispensables **antes** de abrirlo a más de un jugador (no para la integración local de Godot):

| # | Ajuste | Por qué | Evidencia |
|---|---|---|---|
| S1 | Confiar en el proxy local conocido (`trust proxy` restringido al bucle local) y leer la IP real | Detrás de Caddy todos comparten `127.0.0.1`: **5 registros/hora y 100/hora globales, 60 peticiones/min** serían del servicio entero | `app.js:19`, `rate-limiter.js:5`, `routes.js:184` [I] |
| S2 | Cuota global dimensionada al número de jugadores (§4) | 50 000 por defecto se agota con decenas de jugadores | `ingestion-engine.js:23,113` [I] |
| S3 | Arranque sin intervención: hoy la contraseña de Atlas se escribe en un aviso oculto al iniciar; un servicio necesita inyección de secretos y reinicio automático | Proceso desatendido | `main/runtime.js` (canal de credencial por stdin) [I] |
| S4 | TLS de confianza pública (dominio real + CA conocida) en lugar de la CA de pruebas; el cliente .NET valida con el almacén de Windows | La CA de pruebas es temporal y sin CRL | B26–B28, B46 |
| S5 | Atlas: SCRAM-SHA-256, rol de menor privilegio (solo `main_v2_*`), lista de acceso por IP, copias de seguridad, nivel con capacidad (§3) | SCRAM-SHA-1 abierto, `readWrite` amplio, 512 MB insuficiente | B05.5 etapa 11, B00 |
| S6 | Apagado ordenado (F3-05) y administrador de procesos | Reinicios sin pérdidas ruidosas | B47 |
| S7 | Capacidad de registro: `WorkPool` de Argon2 con concurrencia 2 y cola 8 devuelve 503 en ráfagas de altas | Lanzamiento con muchas altas simultáneas | `work-pool.js`, `credential-hasher.js` [I] |
| S8 | Despliegue previsto en AWS según requisitos; verificar región y latencia hacia Atlas | Presupuesto de 2000 ms depende de RTT | RNF-006 [D] |

Opcional compartido: telemetría local de contadores (`commitStats`), límites por cuenta además de por IP.

---

## 8. Cambios indispensables antes de integrar Godot (lista exacta)

Orden y alcance. «Obligatorio» = sin esto la integración falla o se detiene en una partida normal.

| # | Cambio | Dónde | Tipo | Notas |
|---|---|---|---|---|
| **G1** | Cadencia de cierre de intervalos **5000 → 30000 ms** | `integration/sqlite/LocalGameplayObserver.cs:112` (y el reintento de 5000 ms de la línea 165 se deja) | **Obligatorio** (requiere decisión del propietario) | Ventana de pérdida por cierre inesperado pasa de ≤ 5 s a ≤ 30 s de tiempo no confirmado (ya se marca como cobertura incompleta). Revisar pruebas del observador que asuman 5 s |
| **G2** | Tiempo de espera del cliente 15 s; lote inicial 5, tope 8, adaptativo; lease 60 s | `SyncHttpTransport.cs.txt` (defecto), `SyncOutboxDispatcher.cs.txt`, `SyncOutboxService.cs.txt` (`Reserve`) | **Obligatorio** (F3.1) | Sin cambio del servidor |
| **G3** | `two_sides/sync/main_api_url` solo en configuración de pruebas + base sandbox | `project.godot` / argumentos de prueba | **Obligatorio** (H3, H5) | Requiere autorización para editar el proyecto |
| **G4** | Prueba de `HttpClient` .NET con Caddy y la CA de pruebas (revocación, nombres) | prueba nueva | **Obligatorio** (H4) | Si falla, el defecto no es del backend |
| **G5** | Prueba de contrato cliente real ↔ Express con F2 (503 con `results`, «no iniciadas», `duplicate`) | pruebas nuevas | **Obligatorio** (H14, F3.2) | Sin Atlas |
| **G6** | Conservar la cuota en **1000** con G1 activo para la **primera** integración | — | Aceptable provisional | Bajo 155 / medio 404 caben |
| **G7** | Renovar certificado de servidor (vence 2026-11-16) y CA (2026-12-02) si la integración los supera | Caddy / certificados | Dependiente del calendario | |

**Antes de lanzamiento (no para la primera integración):** cuota individual 3000 (tras medir), cuota global dimensionada, estado «sincronización detenida por cuota» (F3.3), apagado ordenado (F3.4), ajustes S1–S8.

---

## 9. Discrepancias y brechas que el propietario debe conocer

1. **RNF-006 (v6) frente a la arquitectura implementada.** El requisito exige conexión permanente y trata SQLite como caché temporal («ya no hay modo offline»); el código y el encargo son local-primero con Outbox recuperable. Este informe **no cambia requisitos** y asume la arquitectura implementada, pero la discrepancia debería resolverse en la documentación de requisitos.
2. **RF-035 / JWT / refresh / panel por usuario.** El requisito pide cuentas de usuario; la identidad Sync v2 es técnica. Brecha reconocida en §6.5; fuera de F3.
3. **Granularidad de 5 s.** Es decisión de diseño de la telemetría, no del requisito (§1.3); por eso se puede proponer 30 s sin tocar requisitos. Aun así la decisión es del propietario.
4. **La cuota es de por vida por cuenta técnica**, no por partida ni por sesión.

---

## 10. Orden recomendado para implementar

1. **Decisiones del propietario** (hoy, sin código): G1 (cadencia 30 s), cuota objetivo (3000 sujeta a medida; 1000 provisional), identidad (§6), brecha RNF-006/RF-035.
2. **G2** (cliente: timeout/lote/lease) con sus pruebas del cliente. Primer bloque, bajo riesgo, sin tocar el servidor ni el manifiesto.
3. **G1** (cadencia) con revisión de pruebas del observador.
4. **G5** (contrato cliente ↔ backend, sin Atlas) y **G4** (`HttpClient` + CA).
5. **G3** (activación en pruebas con base sandbox) y arranque supervisado de Godot con sincronización de pruebas.
6. **F3.10** (validación real con ids nuevos): mide ms/operación, coste con historial de 500/1500/3000 hechos, filas reales de Outbox por partida sandbox (sustituye las estimaciones de este informe), pérdida de respuesta (P4) y apagado con Ctrl+C.
7. Con las cifras: **cuota 3000 + cuota global + estado de cuota** (F3.3) y **apagado ordenado** (F3.4); S1–S8 antes de abrir el servicio.

---

## 11. Riesgos que pueden posponerse

- Optimización por historial (F3-03) si la medición no la exige.
- Calentamiento continuo y pool mínimo (F3-06): mejora la latencia, no la integridad.
- Presupuesto de la validación previa y tiempo máximo de petición (F3-07).
- Telemetría/observabilidad local (F3-10).
- Retirada del código v1 y `PendingOperationStore` (H11).
- `batchId` no persistido (H8); reconfirmación `RECEIPT_CONFLICT` (H10).
- Cierre de B00 y SCRAM-SHA-256 (obligatorios antes de **producción**, no antes de la integración local).
- Vinculación cuenta de usuario ↔ cuenta técnica y panel (brecha de requisitos fuera de F3).

## 12. Lo que este informe NO verificó
- No hay ninguna medición real de volumen: las tres tablas son estimaciones con parámetros [S].
- No se midió el tamaño de documentos en Atlas, ni la latencia por operación con historial largo.
- No se ejecutaron pruebas ni se abrió Godot; el comportamiento de `Observe` por fotograma se infirió del código (`GamePersistenceContext.cs:62` y `LocalGameplayObserver.cs:106-113`) y no se observó en ejecución.
- Si el número real de `save_game` por partida (k) y de cambios de estado por intento (c) difiere de lo supuesto, las cifras del escenario alto cambian en proporción.
- El texto de requisitos se extrajo del `.docx` sin su formato; las citas son resúmenes, no transcripciones.
