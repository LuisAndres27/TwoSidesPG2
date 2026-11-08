# B51 — F3.3: Godot real + SQLite desechable + Express `offline-test`

Fecha: 2026-11-03, 01:25–01:41 (hora local, Guatemala). Se **compiló el proyecto Godot real** y se **ejecutó el juego real en el motor** (3 ejecuciones) con almacenamiento SQLite desechable y Express en modo `offline-test`. **No se conectó MongoDB Atlas, no se usó el backend principal ni credenciales reales, no se inició Caddy, no se instaló ningún certificado, no se modificó código, pruebas, archivos del juego ni la configuración de Godot, no hubo commits ni push.**

**Resultado: la compilación es correcta (0 errores) y el cliente Sync v2 funciona dentro del motor contra el Express `offline-test`. Los valores de F3.1 se compilan y se comprueban en ejecución (cadencia de 30 s medida en el motor). No hay bloqueo para esta prueba. Sí hay un bloqueo de diseño para la prueba HTTPS dentro del juego (§8).**

---

## 1. Inspección (Fase 1)

| Punto | Hallazgo |
|---|---|
| Proyecto Godot | `C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA` (`project.godot`, `TwoSides.csproj`, `TwoSides.sln`) |
| Godot instalado | `C:\Users\luis2\OneDrive\Desktop\Godot_v4.6.1-stable_mono_win64\` — `Godot_v4.6.1-stable_mono_win64(.exe/_console.exe)`; `--version` → `4.6.1.stable.mono.official.14d19694e` |
| .NET | `TwoSides.csproj`: `Godot.NET.Sdk/4.6.1`, `net8.0`. En el equipo: SDK **10.0.400** y tiempos de ejecución **10.0.11** (no hay 8.x). El juego **arrancó y ejecutó el código C# sin ninguna variable de compatibilidad** (no se definió `DOTNET_ROLL_FORWARD`); `TwoSides.runtimeconfig.json` declara `rollForward: LatestMinor` |
| `project.godot` | `config/features = 4.6, C#`; autoloads `Transicion` y `GameApplicationContext` (`res://scripts/network/GameApplicationContext.cs`); **no contiene** `two_sides/sync/main_api_url` ni `run/main_run_args` |
| `LocalGameplayObserver` | `integration/sqlite/LocalGameplayObserver.cs` (F3.1: `HeartbeatMs=30_000`), instanciado por `GamePersistenceContext.Telemetry` y alimentado por `_Process` |
| `InitializeRemoteServices` | `scripts/network/GameApplicationContext.cs:29`: **definido pero sin ningún llamador** en el proyecto (`grep` en `.cs` y `.txt`); `_Ready` solo crea `Local` y `Sync`. Es la pila v1 (`ApiClient`, `/api/v1/*`) y, por diseño, «nunca requerida por el arranque local»; la sincronización Sync v2 no la usa |
| Cómo se inicia la sincronización | `GameApplicationContext._Ready` crea `GameSyncHost` y llama `Sync.Bind(Local)`. `GameSyncHost` lee los argumentos de usuario; modo local = `-- --two-sides-sync-local-test` (HTTP a `127.0.0.1:3000`, fijo), modo principal = `two_sides/sync/main_api_url` (HTTPS). Un tick cada 2 s evalúa `SyncSessionGate` (sesión activa + perfil cargado + base abierta) |
| Base SQLite por defecto (**real**) | `local-persistence/.work/runtime-game/save.sqlite3` (5 697 536 B; SHA-256 `9FE793A2…`, última escritura 2026-10-31 07:05) y `store.lease` / `ownership.json`. Existe además una base heredada `%APPDATA%\Godot\app_userdata\TwoSides\local-progress\two-sides.sqlite3` (139 264 B, 2026-10-16) |
| Base desechable | `GameTestStorage` (solo con `-- --two-sides-sync-local-test --two-sides-test-storage=sandbox`): crea su propio `SyntheticSandbox` en `local-persistence/.work/databases/<guid>/<guid>.sqlite3`, **sin aceptar ninguna ruta**, con un perfil sintético «Synthetic Godot Validation» (sin partida, sin biomas); credenciales solo en memoria; se elimina al cerrar. Argumentos inválidos o parciales hacen que el juego **falle cerrado** en vez de abrir el guardado real (probado en B05.5 y `sync-http-tests` casos 25–26) |

### Aislamiento garantizado antes de ejecutar
1. Argumentos exactos del modo sandbox (§2).
2. Variable de entorno `APPDATA` del proceso de Godot **redirigida a una carpeta temporal** (`scratchpad\f33-appdata`): todo `user://` (registros, caché de sombreadores, `local-progress`, `pending-operations`) cayó allí; la carpeta real `%APPDATA%\Godot\app_userdata\TwoSides` **no pudo** ser tocada.
3. Instantánea previa de integridad (§7): SHA-256 de la partida real, de la base heredada, de `project.godot`, `TwoSides.csproj`, y un resumen por hash de `scripts/` (147 archivos), `scenes/` (69), `integration/` (24), `assets/` (361), `local-persistence/` (84), `backend/src` (71), `backend/scripts` y `backend/tests`, más los caches pequeños de `.godot`.
4. Respaldo de la única carpeta que la compilación regenera: `.godot/mono/temp` (259 archivos, 118,6 MB) en `%LOCALAPPDATA%\TwoSidesClientBackups\pre-F3.3-godot-mono-temp-20261103\` (con `uid_cache.bin`, `global_script_class_cache.cfg`, `scene_groups_cache.cfg`); verificado 0 diferencias de tamaño.
5. Express solo `127.0.0.1:3000`, entorno vacío (solo `SystemRoot`, `PATH`, `NODE_ENV=test`), sin credenciales.

---

## 2. Compilación (Fase 2)

Comando (el estándar del SDK de Godot; el modo «aislado» `-p:TwoSidesIsolatedBuild=true` de `run-infrastructure.ps1` **ya no aplica** porque el `TwoSides.csproj` actual —modificado respecto al repositorio— no contiene esa lógica; solo la conserva `TwoSides.csproj.old`):

```powershell
$env:DOTNET_CLI_HOME="<proyecto>\local-persistence\.work\dotnet-home"; $env:DOTNET_NOLOGO='1'; $env:MSBUILDDISABLENODEREUSE='1'
dotnet build "<proyecto>\TwoSides.csproj" --no-restore --disable-build-servers -nodeReuse:false
```
(`--no-restore`: se reutilizó `project.assets.json` existente, sin acceso a red.)

| Medida | Resultado |
|---|---|
| Resultado | **Correcta** (exit 0) |
| Errores | **0** |
| Advertencias | **63**, todas `CS0618` (`ParallaxBackground` obsoleto en los generadores de scripts de las escenas de bioma): **las mismas 63 advertencias históricas** documentadas en B05.5/auditorías; ninguna nueva |
| Tiempo | 8–9 s |
| Archivos regenerados | 12, todos en `.godot/mono/temp` (`TwoSides.dll/.pdb`, `TwoSides.LocalPersistence.dll/.pdb`, `TwoSides.SyncHttp.dll/.pdb` y sus copias `obj`) |
| Cambios de F3.1 dentro del ensamblado | `TwoSides.dll` contiene `HeartbeatMs`/`RetryDelayMs`; `TwoSides.SyncHttp.dll` contiene `DefaultRequestTimeout`, `TargetBatchMs`, `InitialBatchOperations`, y es idéntico al de `.work/bin`; `TwoSides.LocalPersistence.dll` contiene `DefaultLease` |
| Incompatibilidades Godot ↔ bibliotecas del cliente | **Ninguna** (las referencias `ProjectReference` a `TwoSides.LocalPersistence` y `TwoSides.SyncHttp` compilan y se cargan en el motor) |

No se modificó ningún código. El `TwoSides.dll` anterior (2026-10-30 22:38, hash `1117D2C9…`) está en el respaldo; el nuevo (2026-11-03 01:29, `F87E5B49…`) es lo que el editor generaría con el código actual.

---

## 3. Integración local (Fase 3): configuración

Argumentos del juego: `-- --two-sides-sync-local-test --two-sides-test-storage=sandbox`. Comando completo (ventana real del juego, audio mudo, sin tocar la configuración permanente):

```
Godot_v4.6.1-stable_mono_win64_console.exe --path "<proyecto>" --audio-driver Dummy --resolution 960x540 -- --two-sides-sync-local-test --two-sides-test-storage=sandbox
   (entorno del proceso: APPDATA=<carpeta temporal>)
Express: C:\Program Files\nodejs\node.exe scripts/run-offline-backend.js --port 3000 --exit-on-stdin-close   (WorkingDirectory=backend, entorno vacío)
```
Secuencia de cada ejecución: Godot arranca **con Express apagado**; a los ≈ 20 s se inicia Express; a ≈ 116 s se pide el cierre ordenado de la ventana (equivalente a que el jugador la cierre: `WM_CLOSE`); se espera la salida; después se detiene Express. Un muestreador de conexiones (cada ≈ 0,8 s) vigila los procesos de la prueba.

**`main_api_url`:** no se configuró. `SyncMainMode` exige `https://` y descarta cualquier configuración si hay un argumento `--two-sides-*`; el servidor `offline-test` escucha en HTTP. La sincronización se activó con la bandera local de prueba, que es el mecanismo previsto por el código. No fue necesario modificar `project.godot`.

**`InitializeRemoteServices`:** no se invoca y no hace falta; `GameApplicationContext.Services` permanece nulo (pila v1 dormida). No es un bloqueo para Sync v2.

---

## 4. Resultados de la integración

Se ejecutó 3 veces (códigos de salida de Godot: 0, 0, 0; de Express en la tercera: 0).

### 4.1 Observado en el motor (línea `[Sync-Test]`, solo códigos y contadores)
- `[Sync] Local test synchronization enabled: http://127.0.0.1:3000` en cada ejecución.
- **Un único worker en todas las líneas**: `workers=1/0`.
- **Express apagado (primeros ≈ 20 s)**: `SYNC_STARTED` → `SYNC_RUNNING; worker=SYNC_NETWORKUNAVAILABLE; retryable_failure=1`. La operación pendiente se conserva y el juego sigue respondiendo.
- **Al iniciar Express**: `worker=SYNC_OK; confirmed=…` — autenticación técnica Sync v2 (registro + sesión JWT), envío de lotes y recibos aceptados por el cliente. Al terminar: `worker=SYNC_IDLE; confirmed=N` sin pendientes.
- **Cierre**: `[Local outbox] OUTBOX_DRAINED` y salida limpia en ≈ 0,7–0,9 s tras la petición.

| Ejecución | Operaciones confirmadas | Pases | Notas |
|---|---|---|---|
| 1 | 14 | 7 | Hasta 7 pendientes simultáneas; los saltos de `confirmed` por pase fueron +1, +4, **+5**, +2, +2: **ningún pase envió más de 5** (lote inicial 5 de F3.1, no 25) |
| 2 | 6 | 6 | — |
| 3 | 4 (1 informe de sesión + 3 intervalos) | 6 | **Con muestreo de solo lectura de la base desechable** (§4.2) |

La diferencia entre ejecuciones (14, 6, 4) la atribuyo **sin haberlo verificado** a cambios de estado del juego (por ejemplo pérdida/ganancia de foco de la ventana, que cierran un intervalo al instante). Solo la ejecución 3 se instrumentó; no puedo afirmar la causa en las ejecuciones 1 y 2.

### 4.2 Evidencia de F3.1 en el motor (ejecución 3, SQLite desechable leída en solo lectura)
Intervalos de telemetría escritos con el juego en el menú (estado sin cambios) y su paso por la Outbox:

| `start_ms` | `end_ms` | Estado | Duración |
|---|---|---|---|
| 0 | 30 006 | Menu | **30,006 s** |
| 30 006 | 60 013 | Menu | **30,007 s** |
| 60 013 | 90 019 | Menu | **30,006 s** |

- **Cadencia de 30 s confirmada en el motor** (antes: 5 s). 1 `session.report` + 3 `gameplay.interval` = 4 operaciones en ≈ 105 s de uso en reposo (≈ 120/hora, como estimó B48).
- La operación `session.report` quedó con `attempts=2`: el primer intento falló con Express apagado (`retryable_failure`) y el segundo (tras reconectar) se confirmó **con el mismo `operationId`** (histograma de intentos: 3 operaciones con 1 intento, 1 con 2). Sin duplicados ni identificadores nuevos.
- Cada intervalo pasó `pending → confirmed` en pocos segundos; el sandbox no tenía partida (`saved_games=0`), así que no hubo `game.report` ni eventos de animal.

### 4.3 Qué NO se ejercitó en el motor
- **Tiempo de espera de 15 s, lease de 60 s y crecimiento del lote hasta 8**: el servidor `offline-test` responde al instante y las colas fueron de 1–7; no se llegó a esos límites (están cubiertos por las 14 pruebas de F3.1 y la suite de B50).
- **Partida real/biomas/decisiones/animal**: no se jugó (no se interactúa con la interfaz); solo menú.
- **Caída y reinicio de Express con el juego abierto**, **logout → login**, **cambios de escena** y **latencia/tirones del hilo principal**: no se probaron aquí.
- **Reconexión tras fallo**: sí (Express apagado → encendido).

---

## 5. Seguridad y aislamiento durante las ejecuciones

| Comprobación | Resultado |
|---|---|
| Conexiones a Atlas / no locales | **0 / 0** en 120+ muestras por ejecución (procesos Godot y node); único puerto de escucha observado: `127.0.0.1:3000` |
| Partida real (`runtime-game/*`) | **idéntica** (SHA-256 `9FE793A2…`, tamaño y fecha) |
| Base heredada `two-sides.sqlite3` y árbol `app_userdata` real (16 archivos, incluidos `godot.log`) | **idénticos** (hash/tamaño/fecha) |
| Carpeta `%LOCALAPPDATA%\TwoSides` | idéntica |
| `local-persistence/.work/databases` | **vacía** tras cada cierre (el sandbox se eliminó) |
| `project.godot`, `TwoSides.csproj`, `TwoSides.sln`, `export_presets.cfg` | idénticos |
| `scripts/`, `scenes/`, `integration/`, `assets/`, `local-persistence/` (fuentes), `backend/src|scripts|tests` | resumen por hash idéntico a la instantánea previa (0 diferencias) |
| Caches de `.godot` (`uid_cache.bin`, clases, grupos de escena, credenciales de exportación) | idénticos |
| `.godot/mono/temp` | 12 archivos regenerados por la compilación (esperado, ver §2); mismo número total de archivos (259) |
| Manifiesto v4 del backend | `ok`, 3169 archivos, 0 diferencias; `7DEC55E3…3E8B` |
| Procesos / escuchas / certificados | 0 procesos node/Godot/python; 0 escuchas en 3000/3001/8443; 0 conexiones a 27017; 44 certificados raíz (sin cambios) |
| Credenciales | modo sandbox = solo memoria; no se creó ningún almacén DPAPI ni se usó ninguna credencial real |

---

## 6. Errores y avisos encontrados

1. **Ninguno en el cliente de sincronización ni en el motor durante las 3 ejecuciones** (la salida de errores de Express quedó vacía; Godot salió con código 0).
2. **Mi arnés de prueba, no el producto:** en las ejecuciones 1 y 2 Express no se detuvo con la línea `shutdown` por la entrada estándar enviada desde Windows PowerShell 5.1 (a los 15 s lo detuve a la fuerza). Lo comprobé aparte: **cerrar la entrada estándar detiene Express de forma ordenada (código 0 en 31 ms)**, y la ejecución 3 terminó así (`Express exited, code 0`). La suite de .NET de B50 usa su propio mecanismo y no se vio afectada.
3. **Aviso preexistente en el registro real de la sesión del usuario del 2026-10-31** (no producido por estas ejecuciones, que usaron un `APPDATA` temporal): `WARNING: [Local outbox] ACCESS_DENIED` (`GamePersistenceContext.cs:52`) y `OUTBOX_CLOSE_DEFERRED`, al usar el guardado normal. **No investigado** aquí; conviene revisarlo aparte porque afecta a la Outbox sobre la base real.
4. Mensajes `ERROR: Condition "err != OK" … shader_gles3.cpp:800` del motor al iniciar con una caché de sombreadores vacía (la carpeta temporal de `user://`): ruido de OpenGL por caché fría, sin relación con el cliente.

---

## 7. Procedimiento de verificación y restauración
- Instantáneas previa y posterior generadas por script de solo lectura (hash de cada archivo comparado; ninguna diferencia salvo los 12 archivos de compilación).
- **Restauración de configuración temporal:** no hubo configuración temporal permanente que restaurar: el entorno `APPDATA` y los argumentos eran exclusivos de los procesos lanzados; `project.godot` y los demás archivos del juego no se tocaron. La carpeta temporal `APPDATA` y los registros de las ejecuciones quedaron en el directorio de trabajo temporal de la sesión.
- **Reversión de la compilación** (si se desea): restaurar `.godot/mono` desde `pre-F3.3-godot-mono-temp-20261103` (el editor la regenera de todos modos al compilar).

---

## 8. Bloqueos técnicos y archivos que requerirían cambios

### 8.1 Prueba HTTPS dentro del juego con base desechable: **bloqueada por diseño**
- `SyncMainMode.FromConfiguration` devuelve `null` si hay **cualquier** argumento `--two-sides-sync*` o `--two-sides-test-storage*` (`SyncWorkerLifecycle.cs.txt:34`), y `SyncTestStorageMode` exige el modo local HTTP (`:56`). Es decir: el almacenamiento desechable **solo existe con HTTP a `127.0.0.1:3000`**; el modo HTTPS (`main_api_url`) solo funciona con el **guardado real** (`runtime-game`) y credenciales DPAPI reales.
- Probar HTTPS dentro del juego tal como está implicaría usar la partida real: **no debe hacerse**.

**Corrección mínima propuesta (no implementada, requiere autorización):** añadir en `SyncWorkerLifecycle.cs.txt` un modo de prueba explícito y restringido, p. ej. `--two-sides-sync-local-test-https`, que (a) solo admita `https://localhost:8443/`, (b) exija a la vez el sandbox, (c) mantenga las credenciales en memoria; y que `SyncTestStorageMode`/`SyncLocalMode` lo acepten. Archivos: `local-persistence/sync-http/SyncWorkerLifecycle.cs.txt` (+ pruebas en `sync-http-tests`, sin tocar la partida real) y, si se desea, el texto de ayuda en `GameSyncHost.cs`. Cambio pequeño y reversible; el resto del juego no se toca.

### 8.2 Alternativa sin tocar el juego
Probar H4 (`HttpClient` .NET + Caddy + CA de pruebas) **fuera del motor**, con un proyecto de comprobaciones nuevo como `sync-f31-tests` apuntado a `https://localhost:8443` y el Express `offline-test` en 3000. Cubre cadena de certificados, nombre `localhost` y revocación sin involucrar la partida real.

### 8.3 Otros archivos que cambiarían en etapas posteriores (no ahora)
- `project.godot`: añadir `two_sides/sync/main_api_url` solo para la configuración de despliegue.
- `GameApplicationContext.cs`: nada que cambiar para Sync v2 (la pila v1 sigue dormida).

---

## 9. Condiciones para la prueba HTTPS posterior
1. **Autorización explícita** para arrancar Caddy y para que el propietario instale/retire la CA temporal (`F2BF0E8D…`, vence 2026-12-02). El certificado de servidor `CN=localhost` vence el **2026-11-16**.
2. **Decisión** entre §8.1 (cambio mínimo y nuevo modo de prueba) y §8.2 (prueba fuera del motor). Recomendación: hacer **primero §8.2** (no toca el juego) y reservar §8.1 si se quiere ver el HTTPS dentro de la ventana del juego.
3. Detrás de Caddy, Express `offline-test` en 3000 (sin Atlas); `Host: localhost` obligatorio.
4. Mantener el aislamiento: base desechable, `APPDATA` temporal, instantáneas previa y posterior, cierre ordenado (Express por cierre de entrada estándar, Caddy, CA retirada por el propietario).
5. Para colas > 5 y la prueba de lote adaptativo contra el servidor real: ver F3.10 (validación real, otra autorización).

## 10. Riesgos restantes
1. HTTPS en el motor no probado (y bloqueado por diseño con base desechable).
2. Tiempo de espera de 15 s, lease de 60 s y lotes 6–8 no ejercitados en el motor ni contra Express (solo servidor falso de F3.1).
3. Variabilidad de operaciones por ejecución (14/6/4) sin explicación verificada; conviene instrumentar una ejecución con interacción controlada (foco fijo) para atribuir cada intervalo.
4. Aviso `ACCESS_DENIED` de la Outbox en la sesión normal del usuario, sin investigar.
5. Aún sin probar en el motor: logout → login, caída de Express con el juego abierto, cierre con petición en vuelo, juego completo (biomas, animales).
6. F1/F2 solo con Atlas real en la campaña B46 (1 operación); F3.10 pendiente.
7. Persisten los riesgos de B47/B48 (cuota de 1000, apagado ordenado de Express, calentamiento, SCRAM-SHA-1, backend compartido, brecha RNF-006/RF-035).
