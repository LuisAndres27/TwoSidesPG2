# B50 — F3.2 (primera parte): suite `sync-http-tests` del cliente .NET contra Express `offline-test`

Fecha: 2026-11-03, ejecución 01:20:32–01:21:23 (hora local, Guatemala). **Solo verificación del funcionamiento existente.** No se modificó código, pruebas, Godot, SQLite real, certificados ni cuotas; no se inició el backend principal ni Caddy; no se usaron credenciales reales; no hubo conexión a MongoDB Atlas; no hubo commits ni push.

**Resultado: 36 casos ejecutados, 36 aprobados, 0 fallidos, 0 omitidos.** No apareció ninguna incompatibilidad con F3.1 en lo que la suite cubre (ver §6 sobre lo que **no** cubre).

---

## 1. Precondiciones de seguridad (comprobadas antes de ejecutar)

| Condición | Resultado | Evidencia |
|---|---|---|
| Manifiesto v4 válido | ✔ | `backend-integrity.js verify` → `ok`, 3169 archivos, 0 añadidos/quitados/modificados; archivo `7DEC55E3…3E8B` |
| `backend/src`, `scripts`, `tests` sin cambios | ✔ | `git status` solo muestra los directorios sin seguimiento de siempre (`??`), igual que en B46–B49 |
| Cambios de F3.1 presentes y respaldo íntegro | ✔ | Los 6 archivos modificados coinciden con los hashes de B49; `SHA256SUMS.txt` del respaldo `pre-F3.1-20261103` = `BCD8B180…9BBD`; los 4 archivos de `sync-http-tests` son idénticos al respaldo |
| El modo `offline-test` no usa Atlas | ✔ | `scripts/run-offline-backend.js` importa solo `jose`, `createBackend` y los dobles de `tests/…/support/*` (repositorios y coordinador **en memoria**); no importa Mongoose/Atlas/C.2; no acepta argumentos de host, URI, usuario, base de datos, clave ni perfil (`parseArguments` los rechaza); el `host` está fijo en `127.0.0.1` |
| No requiere `MONGODB_URI` ni credenciales | ✔ | La suite lanza el hijo con `Environment.Clear()` y solo `SystemRoot`, `PATH` y `NODE_ENV=test`; en esta sesión no existía ninguna variable `MONGO*`/`ATLAS*`/`TWOSIDES*`; clave RSA desechable generada al arrancar |
| Almacenes sintéticos, sin disco | ✔ | `SyntheticIdentityRepository({synthetic:true, coordinator})` y `SyntheticCoordinator()` sin `store` ⇒ memoria (el `EncryptedStore` en disco solo se crea si se le pasa una carpeta; el lanzador no la pasa) |
| Express solo en 127.0.0.1 y en puerto de pruebas | ✔ | Puerto libre elegido al azar por la suite (`FreePort`) para cada servidor; 3000, 3001 y 8443 sin escuchar antes, durante y después (puertos observados: 127.0.0.1:49152+ únicamente) |
| No toca SQLite real ni perfiles existentes | ✔ | Todas las bases son `SyntheticSandbox` (`UNSAFE_PATH` si la raíz no es la autorizada) bajo `local-persistence/.work`; las pruebas de credenciales usan carpetas temporales `.work/credential-tests/<guid>`. La base real del juego (`%APPDATA%\Godot\app_userdata\TwoSides\local-progress\two-sides.sqlite3`, 139 264 bytes) se verificó **solo por hash** antes y después: `5EA5CA05…A13B` idéntico, misma fecha de modificación |
| Sin Atlas posible por red | ✔ | Ver §4 (muestreo de conexiones) |

Todas las condiciones se demostraron; no hubo motivo de parada.

---

## 2. Configuración y comandos

Mecanismo oficial, sin sustituciones (documentado en la cabecera de `local-persistence/run-sync-http-checks.ps1`):

```powershell
cd "C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\local-persistence"
powershell -NoProfile -ExecutionPolicy Bypass -File .\run-sync-http-checks.ps1
```

El guion fija el entorno de .NET en `local-persistence/.work` (CLI, NuGet, TEMP), compila `sync-http-tests/SyncHttp.Checks.csproj` con `--no-restore --disable-build-servers -nodeReuse:false` (la restauración ya existía; no se pidió red) y ejecuta `.work\bin\SyncHttp.Checks\Debug\net8.0\win-x64\SyncHttp.Checks.exe` (autocontenido, win-x64). La suite arranca por su cuenta, para cada caso que lo necesita, `C:\Program Files\nodejs\node.exe scripts/run-offline-backend.js --port <libre> --exit-on-stdin-close` con `WorkingDirectory=backend` y lo detiene con la orden `shutdown` por la entrada estándar (código de salida 0 comprobado por la propia suite: `server.Stop()==0` y salida de error vacía). El guion solo escribe bajo `.work`.

Configuración del cliente **bajo prueba** (F3.1): tiempo de espera por defecto 15 s, lote inicial 5, máximo 8, lease 60 s.

---

## 3. Resultados reales

| Medida | Valor |
|---|---|
| Casos ejecutados | **36** |
| Aprobados | **36** |
| Fallidos | **0** |
| Omitidos | **0** (la suite no tiene mecanismo de omisión) |
| Tiempo total (compilación + ejecución) | **51 s** (01:20:32 → 01:21:23) |
| Errores / advertencias en la salida | **ninguno**. La compilación oficial del guion terminó con `0 Advertencia(s)` y `0 Errores` (1,85 s) y la ejecución no imprimió errores. (Aparte, una compilación manual con verbosidad distinta, hecha en F3.1 solo para comprobar que el proyecto compilaba, mostró advertencias CS2002 preexistentes por archivos listados dos veces en `SyncHttp.Checks.csproj`; no aparecen en la ejecución oficial) |
| Resumen de la suite | `36 sync HTTP checks passed; real Express offline-test composition on 127.0.0.1, synthetic SQLite only, no Atlas.` (salida del programa, código 0) |

**Aclaración sobre la cifra «188».** El 188 de B38 es el número de **llamadas `Check(…)` en el código fuente** de `SyncHttpChecks.cs.txt` (contado ahora: 188) dentro de **36 casos con nombre** (`await Case(…)`, 36). La suite no imprime cuántas aserciones ejecuta (algunas están en bucles o ramas), así que lo verificable es: **36 de 36 casos pasan, y los 188 puntos de comprobación están en esos casos**. No se ejecutaron «188 pruebas independientes».

---

## 4. Ausencia de conexiones a Atlas y cierre

- **Durante la ejecución** (60 muestras cada ≈ 0,7 s de las conexiones de procesos `node` y `SyncHttp.Checks`): **0 conexiones a destinos no locales, 0 al puerto 27017**; como máximo 1 proceso `node` a la vez; 17 puertos de escucha distintos, todos `127.0.0.1:<efímero>`. El muestreo no es exhaustivo (intervalo de 0,7 s); la garantía principal es estructural (§1: el lanzador no contiene código ni configuración capaces de abrir una conexión Mongo).
- **Después**: 0 procesos `node`/`caddy`/`Godot`/`SyncHttp.Checks`; 0 escuchas en 3000/3001/8443 y ninguna escucha residual de la ejecución; 0 conexiones a 27017; 44 certificados raíz (sin cambios; ninguna CA instalada).
- **Manifiesto v4**: verificado de nuevo, `ok`, 3169 archivos, 0 diferencias.
- **Datos reales intactos**: base SQLite del juego con el mismo SHA-256 y fecha; sin bases sintéticas ni carpetas `credential-tests` sobrantes.
- **Código y pruebas**: respecto al respaldo `pre-F3.1`, solo difieren los 6 archivos de F3.1 ya documentados en B49; esta tarea no modificó ninguno.

---

## 5. Cobertura del contrato (36 casos)

| Área | Casos | Qué demuestran contra el Express real `offline-test` |
|---|---|---|
| **Autenticación / identidad técnica** | 4, 27, 28, 31, 32, 33, 34, 35 | Registro + sesión JWT v2 + sondeo autenticado; petición anónima y token falso rechazados (401); renovación de token con login (nunca un registro nuevo); reutilización de la misma cuenta tras reiniciar el cliente; servidor reiniciado «vacío» ⇒ se registra de nuevo de forma transparente; dos jugadores nunca comparten JWT ni credencial; credencial corrupta ⇒ no se crea otra cuenta |
| **Lotes** | 1, 5, 9, 11, 22 | Un lote se confirma solo con recibos del servidor; las operaciones hijas esperan a su padre; los mismos `operationId` se entregan una sola vez tras reconectar; cierre y reinicio del servidor sin reenviar lo ya confirmado |
| **Recibos / idempotencia** | 6, 7, 10, 13 | Reenvío del mismo `operationId` ⇒ mismo recibo, sin duplicar, recibo local intacto; `receipts/query` devuelve `found`/`not_found`; respuesta perdida tras el commit ⇒ se concilia por consulta de recibos y **no** se reenvía; un recibo que no coincide nunca se acepta |
| **Errores y recuperación** | 8, 12, 14, 16, 23, 24 | Interrupción HTTP, servidor inalcanzable o mudo ⇒ operaciones intactas y reintentables; un timeout nunca borra trabajo y el juego sigue guardando en local; rechazo permanente ⇒ se conserva el byte a byte pero no se reenvía; el worker vacía la Outbox y se libera rápido aunque el servidor desaparezca; el llamador nunca se bloquea; cerrar el juego con un lote en vuelo deja la Outbox consistente |
| **Ciclo de vida del worker** | 16–21, 27 | Un solo worker; no se crea otro con ticks repetidos o cambios de escena; espera si no hay instalación registrada; parada ordenada que conserva las pendientes |
| **Activación y modos de prueba** | 2, 3, 17, 18, 25, 26 | HTTPS obligatorio (o HTTP de bucle local explícito); nunca URI de base de datos, credenciales, ruta ni consulta en la URL; sincronización desactivada por defecto; modo local solo con la bandera exacta (siempre `http://127.0.0.1:3000`); almacenamiento de prueba siempre en un sandbox que nunca es la partida real |
| **Protección de credenciales** | 15, 29, 30, 36 | Cuenta protegida con DPAPI atada a jugador+instalación; blobs corruptos/truncados/ajenos se rechazan sin sobrescribir; ningún secreto llega a la base de datos, diagnósticos, registros o archivos en claro |
| **Destino `main`** | 1 | Con destino `main` y recibos confirmados de otra integración, la sincronización se detiene (`SYNC_DESTINATION_MIGRATION_REQUIRED`) sin tocar datos |

Compatibilidad con el backend F1/F2: el cliente se entiende con las rutas, esquemas, códigos y recibos de `/api/v2/*` del mismo código de servicio (`IngestionService`, enrutador, autenticación JWT v2) que ejecuta el backend principal.

---

## 6. Compatibilidad con F3.1: qué cubrió y qué no cubrió esta ejecución

**Sí se ejercitó (por defecto, sin parámetros explícitos):**
- El dispatcher con lote inicial **5** / máx. **8** (`new SyncOutboxDispatcher(f.Queue,Session,f.Binding)` en la fixture): todos los casos pasan, p. ej. el caso 5 espera `Reserved==3` y el siguiente pase confirma el hijo.
- La reserva con **lease 60 s** (valor por defecto de `Reserve`): los casos de reintento y de cierre con lote en vuelo (8, 10, 12, 24) pasan avanzando el reloj en minutos, sin dependencia del valor de 30 s anterior.
- El contrato `/api/v2/*` sin cambios de forma (registro, sesión, lote, recibos, consulta).

**No se ejercitó (limitaciones reales, no fallos):**
1. **Tiempo de espera de 15 s por defecto contra Express.** La fixture crea el cliente con un tiempo de espera **explícito de 10 s** (`timeout??TimeSpan.FromSeconds(10)`) y las pruebas de worker usan 30 s; el valor por defecto de 15 s solo está verificado por las 14 pruebas del cliente sin servidor de F3.1 (propiedad y espera real de ≈ 15 s con un servidor falso), no contra Express.
2. **Lotes de más de 5 operaciones y el crecimiento/reducción del lote adaptativo.** Todos los casos de esta suite usan ≤ 4 operaciones por fixture (`CaptureAll` captura 4), así que nunca llegan al límite de 5 ni al de 8. El comportamiento con colas grandes contra Express real **no está probado**.
3. **F2 (compuerta de commit) y F1 (caché de despliegue).** Existen únicamente en `MongoIngestionRepository`. `offline-test` usa `SyntheticIngestionRepository` (motor de ingesta en memoria sin transacciones Mongo): la validación, los presupuestos de 2000/10 000 ms del servicio, la idempotencia, los recibos y las respuestas HTTP son los reales; el **punto de commit, la gracia de 3000 ms y los resultados «desconocidos»** no pueden darse. Esos comportamientos solo se han probado con los dobles de `main-f2-commit-gate` (backend) y en la campaña real B46 con 1 operación.
4. **Transporte HTTPS / Caddy / CA / `HttpClient` con TLS (H4).** Esta suite usa HTTP en `127.0.0.1`.
5. **Godot.** El cliente se compila sin motor; no se ejecutó dentro del juego.
6. **Latencia real.** El servidor `offline-test` responde en memoria; no dice nada sobre los 0,7–1,5 s por operación de Atlas.

---

## 7. Fallos e incompatibilidades encontradas

**Ninguna.** No hubo fallos que analizar. El único hallazgo de esta etapa es de **cobertura**: la suite existente no estresa los valores de F3.1 contra Express (puntos 1 y 2 de §6). No es una incompatibilidad con el contrato; es un hueco de prueba que, por la regla «no modificar pruebas» de esta tarea, no se ha cubierto.

---

## 8. Riesgos restantes

1. Lotes > 5 y adaptación del lote **sin probar contra Express real** (solo contra el servidor falso de F3.1).
2. Tiempo de espera de 15 s **no ejercitado contra Express** (solo con servidor falso).
3. F1/F2 solo con dobles y con 1 operación real (B46); falta una campaña real con lotes de 5–8 (F3.10).
4. HTTPS + CA de pruebas con `HttpClient` (H4) sin probar; certificado de servidor vence el **2026-11-16**, la CA el **2026-12-02**.
5. Godot: sin compilar ni ejecutar con los cambios de F3.1.
6. Cuota de 1000 sin estado visible de «detenido por cuota» (F3.3); volumen real sin medir (B48).
7. La cifra «188» es de puntos de comprobación, no de pruebas independientes (§3).
8. Persisten los riesgos de B47/B48 no tratados (apagado ordenado, calentamiento continuo, SCRAM-SHA-1, backend compartido, brecha RNF-006/RF-035).

---

## 9. Condiciones para compilar y probar dentro de Godot (siguiente parte, con autorización)

1. **Autorización expresa** para compilar/ejecutar Godot con los cambios de F3.1 (hoy prohibido).
2. **Compilación del proyecto**: `TwoSides.csproj` con el procedimiento ya documentado (`--no-restore --disable-build-servers -nodeReuse:false`, `GodotProjectDir` hacia `integration/sqlite/.work/`, según GAMEPLAY_EVENT_AUDIT/`run-game-save-checks.ps1`). Criterio: 0 errores y ninguna advertencia nueva respecto a las 63 históricas de `ParallaxBackground`.
3. **Prueba con el Express `offline-test` en el puerto 3000** (`node scripts/run-offline-backend.js --port 3000`, sin Atlas): el modo local del cliente (`--two-sides-sync-local-test`) solo admite `http://127.0.0.1:3000`.
4. **Base desechable**: `--two-sides-test-storage=sandbox` (nunca la partida real; H5). No editar `project.godot` ni definir `two_sides/sync/main_api_url`.
5. Observar los registros `[Sync-Test]`: códigos y recuentos; comprobar con una cola > 5 que los pases son de 5 y crecen hasta 8, que el lease no vence y que no hay `RECEIPT_CONFLICT`.
6. Cierre ordenado (`shutdown` por la entrada estándar), sin listeners ni procesos propios, y verificación del hash de la base real.

## 10. Condiciones para la prueba HTTPS posterior (H4), con autorización aparte

1. Permiso para **arrancar Caddy** (loopback 8443, configuración B44) y para que el **propietario instale la CA temporal** (`F2BF0E8D…`, vence 2026-12-02) y la retire después; comprobar la huella antes y 44/45 certificados.
2. Detrás de Caddy puede usarse el **Express `offline-test` en 3000 (sin Atlas)**: así se prueba `HttpClient` + CA + `Host: localhost` + `SyncHttpOptions` HTTPS sin tocar la base remota.
3. Certificado de servidor `CN=localhost` vigente hasta **2026-11-16 00:10**; si se supera, regenerar certificados antes (procedimiento B25).
4. `HttpClient` de .NET no comprueba revocación por defecto; el certificado no tiene CRL/AIA, por lo que no se espera el error `CRYPT_E_NO_REVOCATION_CHECK` de `curl.exe` (B46). Verificar, no suponer.
5. Sin credenciales reales ni conexión a Atlas; cierre en el orden de B45 (Express, Caddy, CA retirada por el propietario).

## 11. Siguiente paso recomendado
Con autorización y sin cambiar código existente: añadir, en un archivo de pruebas **nuevo**, casos contra el Express `offline-test` que cubran (a) el tiempo de espera por defecto de 15 s con un servidor que responde en 12 s, y (b) colas de 20–40 operaciones con pases de 5→8 y reanudación; luego, la prueba en Godot (§9) y la HTTPS (§10). Esto requiere que se levante la restricción «no modificar código ni pruebas» solo para añadir ese archivo nuevo.
