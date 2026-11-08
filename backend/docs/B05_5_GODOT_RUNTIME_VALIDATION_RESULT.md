# B05.5 Etapa 4 — Validación del worker dentro de Godot

Continúa `B05_5_GODOT_WORKER_INTEGRATION_RESULT.md`. No se reconstruyó el cliente HTTP, SQLite, el Outbox ni la composición Express.

## Resultado en una línea

**Actualización (ver sección 10):** la persona responsable del proyecto ejecutó después Godot 4.6.1 con el sandbox y el Express offline-test y reportó sincronización real dentro del motor. El recorrido probado fue **Godot → Express offline-test (repositorios sintéticos) en 127.0.0.1:3000; no MongoDB Atlas**. Esa ejecución la realizó el usuario; Claude no ejecutó Godot y solo verificó el estado de archivos en modo lectura.

Estado original de esta etapa (antes de esa ejecución): no se encontró ejecutable de Godot (sección 1), por lo que se implementaron y probaron fuera del motor, con SQLite desechables y el Express offline real, el almacenamiento desechable, la protección de guardados reales y el flujo Logout → Login → Resume. El juego compila (0 errores). Las secciones 1–9 se conservan tal como se escribieron; la sección 10 las complementa.

## 1. Localización de Godot

Inspección limitada: `C:\Program Files\Godot*`, `Program Files (x86)`, `C:\Godot`, `%LOCALAPPDATA%\Programs\Godot`, carpetas de usuario `Godot` (perfil, Escritorio, Descargas), scoop, PATH, procesos en ejecución, `%APPDATA%\Godot` (hay `editor_settings-4.6.tres`, `projects.cfg` con este proyecto y registros de compilación mono, es decir, el editor se usa en este equipo, pero esos archivos no guardan la ruta del ejecutable) y la configuración del proyecto. No apareció ningún `Godot*.exe`. No se descargó ni instaló nada. Una búsqueda recursiva amplia agotó el tiempo y se abandonó.

## 2. Almacenamiento desechable (mecanismo)

Se activa solo con ambos argumentos de usuario exactos:

```
-- --two-sides-sync-local-test --two-sides-test-storage=sandbox
```

- **No acepta ninguna ruta.** El juego crea su propio `SyntheticSandbox` (la misma capacidad de las pruebas automáticas): `local-persistence/.work/databases/<guid>/<guid>.sqlite3`. Esa capacidad solo puede direccionar archivos creados por ella misma, rechaza enlaces/reparse points y borra todo al terminar.
- Se abre mediante el adaptador sintético existente, cuyo único token de ruta admitido es `owned-outbox-fixture`; cualquier otra ruta (runtime, copias de reconstrucción, AppData, la propia ruta del sandbox) se rechaza antes de tocar archivos.
- Contiene solo un perfil sintético "Synthetic Godot Validation": sin partida, sin biomas, sin decisiones.
- Argumento de almacenamiento inválido, duplicado, con ruta o sin el flag de sincronización → el juego **falla cerrado** (excepción) en lugar de abrir el guardado real. Sin los argumentos, el juego usa su persistencia normal sin cambios.
- Al cerrar, el sandbox se elimina después de cerrar SQLite.

## 3. Protección de guardados reales (probada)

Comprobación `the engine test storage is a fresh sandbox database…`:
- la ruta del sandbox está bajo `.work/databases/` y no es ni cuelga de `.work/runtime-game`;
- el adaptador rechaza `RuntimeStoragePath`, `StoragePath`, `CopyGameDatabase.AuthorizedPath`, `DurableTestDatabase.AuthorizedPath`, la ruta del propio sandbox, una ruta con `..` hacia `runtime-game`, la ruta vacía, una ruta bajo `%LOCALAPPDATA%\TwoSides\ReconstructionTests` y una ruta bajo `app_userdata` de Godot;
- el directorio `runtime-game` queda **idéntico byte a byte** (hash SHA-256, tamaño y fecha de cada archivo) tras crear, abrir, drenar y destruir el sandbox, y las copias protegidas de reconstrucción tampoco cambian;
- tras iniciar el cierre (`DrainOutboxAsync`), `SyncStorage` es nulo: nada puede reanudarse sobre una base que se cierra.

No se modificó ni se abrió ninguna partida real.

## 4. Logout → Login → Resume

Defecto previo: `ResumeAfterLogout()` no tenía llamador. Corrección:

- `SyncSessionGate` (puro, probado) decide si hay sesión: activa al inicio, `End()` en logout, `Begin()` en login/menú, `Close()` al cerrar (después, `Begin()` se ignora). `Evaluate` exige además perfil cargado y base abierta.
- `GameApplicationContext.Logout()` → `Sync.EndSession()`. Nuevo `GameApplicationContext.BeginLocalSession()`, invocado desde `MenuPrincipal` (tras inicializar y con perfil cargado) y desde `LoginScreen` (login exitoso). Se retiró `ResumeAfterLogout()`.
- Cada arranque crea un `SyncSessionManager` nuevo: **el JWT nunca se reutiliza** entre sesiones ni jugadores. La credencial técnica se conserva en memoria **por jugador+instalación**.
- **Defecto adicional hallado y corregido:** tras detener y reanudar, el cliente volvía a *registrar* (el id de cuenta se perdía con el gestor de sesión) y un servidor real rechazaría el segundo registro. Ahora el id de cuenta (no secreto) se guarda junto a la credencial en memoria y la sesión siguiente hace *login*. (Cambio en `SyncSessionManager`: dos métodos con implementación por defecto en `ISyncSecretStore`.)

Pruebas: logout detiene el worker; sin sesión no se reanuda ni se envía (el trabajo local sigue capturándose); login reanuda con exactamente un worker nuevo (10 ticks concurrentes, sin duplicados); un registro y ≥2 logins; JWT distinto por sesión; el cierre prevalece sobre un login; cambio de jugador A→B: cada uno entrega con su propia identidad (el servidor rechazaría tokens ajenos) y no comparten JWT.

## 5. Cambios mínimos realizados

| Archivo | Cambio |
|---|---|
| `integration/sqlite/GameTestStorage.cs` | Nuevo: sandbox desechable del modo de prueba. |
| `integration/sqlite/GamePersistenceContext.cs` | Elige el adaptador: sandbox solo con los argumentos; si no, el runtime de siempre. Libera el sandbox tras cerrar SQLite. |
| `integration/sqlite/GameSyncHost.cs` | Usa `SyncSessionGate`; `EndSession`/`BeginSession`; línea sanitizada `[Sync-Test]` (códigos y contadores, sin ids, payloads, tokens ni rutas) solo en modo sandbox. |
| `scripts/network/GameApplicationContext.cs` | `Logout()` termina la sesión de sync; `BeginLocalSession()`. |
| `scripts/MenuPrincipal.cs`, `scripts/auth/LoginScreen.cs` | Una llamada a `BeginLocalSession()` cada una. |
| `local-persistence/sync-http/SyncWorkerLifecycle.cs.txt` | `SyncTestStorageMode`, `SyncSessionGate`, `SyncOutboxCounts`; almacén de credenciales por ciclo de vida; fábrica de handler (solo pruebas). |
| `local-persistence/sync-http/SyncSessionManager.cs.txt` | Recuerda el id de cuenta (ver 4). |
| `local-persistence/sync-http-tests/*` | +4 comprobaciones (total 25); el proyecto enlaza fuentes del juego sin motor. |

No se tocaron biomas, decisiones ambientales, finales, `backend/.env`, C2Runtime, ACL ni propietarios.

## 6. Pruebas

Aprobadas: 25/25 de `run-sync-http-checks.ps1` (Express offline real en 127.0.0.1 + SQLite desechables); `run-checks.ps1` 43/43; infraestructura 28/28; suites C# del juego ejecutadas una a una (outbox 64, activation 28, bounded-close 26, reconciliation 51, observer 31, events 41, statistics, menu-return, animal-entry, decisions, biome-selection, finals 126, completion 54, etc.) todas verdes; el proyecto Godot compila con 0 errores; `.work/databases` queda vacío.
Omitidas: ninguna nueva. `run-game-save-checks.ps1 -Mode Test` termina con error por diseño (suite histórica deshabilitada); se usaron los modos por indicador.
No ejecutadas: vitest completo (el backend no cambió en esta etapa; las suites C.2 requieren `C2_FINAL_TEST_ROOT`).
**Dentro del motor: 0 comprobaciones ejecutadas.**

## 7. Instrucciones manuales pendientes (requieren el ejecutable de Godot 4.6.1 .NET)

1. Terminal A (en `backend/`): `node scripts/run-offline-backend.js --port 3000 --exit-on-stdin-close` (déjalo abierto; se detiene con Ctrl+C).
2. Terminal B (carpeta del proyecto), sustituyendo la ruta del ejecutable: `"<Godot_v4.6.1-stable_mono_win64.exe>" --path . -- --two-sides-sync-local-test --two-sides-test-storage=sandbox`
3. Observar la consola. Esperado: aviso `[Sync] Local test synchronization enabled: http://127.0.0.1:3000` y líneas `[Sync-Test] code=…;workers=creados/detenidos;…;outbox=…`.
4. Comprobar, en orden: (a) con Express **apagado**: `SYNC_STARTED`/`SYNC_RUNNING` sin congelar el menú; (b) iniciar Express: aparecen pases y, si hay operaciones, `confirmed=N`; (c) cambiar de escena varias veces: `workers` sigue en `1/0`; (d) matar Express y volver a levantarlo: pendientes `retryable_failure` que luego se confirman; (e) si hay flujo de logout (pantalla de recuperación): `workers` pasa a `2/1` tras volver a entrar; (f) cerrar la ventana: el cierre no debe tardar más de unos 3 s extra.
5. Verificar después que `local-persistence/.work/runtime-game` no cambió (fecha/tamaño de `save.sqlite3`) y que `.work/databases` no conserva archivos.
6. Nota: el sandbox empieza sin partida; para generar operaciones del Outbox hay que crear partida/jugar dentro del propio sandbox (se borra al cerrar). No jugar ni guardar sin los dos argumentos.
7. No ejecutar nunca el juego con solo el primer argumento esperando almacenamiento desechable: sin el segundo usa el guardado de ejecución normal.

## 8. Limitaciones

- Sin ejecución en el motor: `GameSyncHost`, los ganchos de `MenuPrincipal`/`LoginScreen` y la integración con `_Process` solo están validados por compilación y por la lógica pura equivalente.
- El flujo de login de esta copia es el heredado `/api/v1` (Services nulo en modo local); la sesión local se identifica por el perfil cargado + menú abierto.
- Credenciales e id de cuenta solo en memoria; tras reiniciar el juego se registraría de nuevo (falta almacén protegido, p. ej. DPAPI).
- La protección de enlaces del sandbox es la ya existente en `SyntheticSandbox` (no se añadió una prueba con junctions en esta etapa).
- Sin TLS probado; el worker no se despierta tras cada guardado (consulta cada 15 s en reposo).

## 9. Próximo paso para Atlas real

Sin autorización todavía: ejecutar la validación manual anterior; confirmar la rotación de la contraseña de `twosides_integration_test`; definir el perfil `integration` del backend; almacén protegido de credenciales; y solo entonces una validación contra Atlas con autorización expresa. No se conectó Atlas, no se usó `twosides_integration_test`, no se ejecutó C.2/F.2 y B00 continúa pendiente.

## 10. Evidencia de la ejecución real en Godot (aportada por el usuario) y verificación de solo lectura

### 10.1 Recorrido probado

**Godot 4.6.1 .NET (motor real) → cliente HTTP del juego → Express `offline-test` con repositorios sintéticos en `http://127.0.0.1:3000`.**
No intervino MongoDB Atlas, ni `twosides_integration_test`, ni C.2/F.2, ni `backend/.env`. El destino está fijado por código a loopback:3000.

Argumentos usados: `-- --two-sides-sync-local-test --two-sides-test-storage=sandbox` (almacenamiento: `SyntheticSandbox`).

### 10.2 Salida observada por el usuario (transcrita, sin ids ni credenciales)

- Con Express apagado: `SYNC_NETWORKUNAVAILABLE`; las operaciones permanecieron pendientes.
- Tras iniciar Express: `code=SYNC_RUNNING;workers=1/0;passes=6;worker=SYNC_OK;confirmed=26,pending=2`.

Interpretación (limitada a lo que la línea demuestra): un único worker (`1/0`), seis pases, 26 operaciones confirmadas y recuperación de la conexión tras haber estado sin servidor. Las 2 operaciones `pending` en esa línea **no están explicadas**: pueden ser hechos recién capturados o dependientes de un padre aún sin confirmar; falta una línea posterior que muestre si se vaciaron.

### 10.3 Verificación de solo lectura realizada por Claude (2026-10-29 ~22:20, hora local)

| Comprobación | Resultado |
|---|---|
| `local-persistence/.work/databases` | **Vacío**: ningún archivo ni carpeta del sandbox quedó. Es consistente con cierre ordenado (una terminación brusca habría dejado archivos). No prueba por sí solo *cómo* se cerró; el log de cierre del usuario no se aportó. |
| `local-persistence/.work/runtime-game` | `save.sqlite3` 2 813 952 B, última escritura **28/10/2026 02:38:26**; `ownership.json` y `store.lease` del **26/10/2026**. Todas las fechas son **anteriores** a las etapas 3 y 4 y a la ejecución del usuario; coinciden con la fecha del directorio observada al inicio de la etapa 3. Sin escritura ni archivos nuevos. |
| Copias protegidas `%LOCALAPPDATA%\TwoSides\ReconstructionTests\copy-06dc7ade-…` (`game-progress` y `persistence`) | Seis archivos con fechas del **25/10/2026**, sin cambios posteriores; sin archivos nuevos. |
| Procesos | Sigue en ejecución `Godot_v4.6.1-stable_mono_win64` (PID 19932), probablemente el editor; no se tocó. |
| `project.godot` | Ya **no** contiene `run/main_run_args` (el usuario lo retiró): el juego volvió a su comportamiento normal desde el editor. |

Límite: no se guardaron huellas SHA-256 de antes de la ejecución del usuario, así que la integridad se sostiene en fechas/tamaños y en la ausencia de archivos nuevos, no en una comparación de hash. La prueba automática de la sección 3 sí comparó hash antes/después de sus propias operaciones. No se modificó ni borró nada.

### 10.4 Confirmado vs pendiente

| Elemento | Estado |
|---|---|
| Autoload `GameApplicationContext` + `SyncHost` activos en el motor con el modo de prueba | **Confirmado** (usuario; la línea `[Sync-Test]` solo la emite `GameSyncHost` en modo sandbox) |
| Un solo worker (`workers=1/0`) | **Confirmado** en la línea observada |
| Funcionamiento con Express apagado; operaciones pendientes conservadas | **Confirmado** (usuario) |
| Reconexión al iniciar Express y sincronización HTTP (autenticación, envío, recibos: 26 confirmadas) | **Confirmado** en el motor por el usuario; la validez de los recibos la impone el despachador (probada en las pruebas automáticas) |
| Sandbox cerrado y sin restos | **Compatible con lo observado** (carpeta vacía); log de cierre no aportado |
| `runtime-game` y copias protegidas sin cambios | **Consistente** (fechas/tamaños), sin hash previo |
| Explicación de `pending=2` y vaciado final | **Pendiente** |
| Cambio de escenas sin duplicar worker en el motor | **Pendiente de confirmar** (no mencionado en la evidencia) |
| Logout → Login → Resume en el motor | **Pendiente** (solo probado fuera del motor) |
| Cierre de ventana con petición en vuelo (≤ ~3 s) | **Pendiente** |
| Caída y reinicio de Express con juego abierto | **Pendiente de confirmar** |
| Ausencia de tirones en el hilo principal | **Pendiente** (observación visual) |
| Credenciales protegidas entre reinicios del juego, TLS, Atlas real | **Pendiente / no autorizado** |

### 10.5 Alcance de la afirmación

Lo confirmado es sincronización **local** contra un backend **simulado** con almacenamiento **desechable**. No valida MongoDB Atlas, su latencia, límites, índices ni reglas de producción, ni la persistencia de credenciales. B00 continúa pendiente.
