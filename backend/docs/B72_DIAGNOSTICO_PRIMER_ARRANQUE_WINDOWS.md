# B72 — Diagnóstico del primer arranque en Windows (TwoSidesTest)

Fecha: 2026-11-04. Solo lectura de los registros del kit y del código fuente. No se reinició el juego, no se abrió ninguna SQLite (ni la de `TwoSidesTest` ni la histórica), no se modificó código.

## 1. Veredicto

**No hay errores bloqueantes.** El juego arrancó con el runtime .NET 8 privado, navegó menús, decisión y bioma, y cerró limpiamente. Hay 5 advertencias del propio juego, todas **esperadas por el diseño actual** (almacén de producción nuevo sin esquema Outbox/telemetría, B68) y 1 aviso del driver gráfico sin relación con el juego. **La persistencia local no está completamente demostrada** (§6): faltan las pruebas de reinicio y de contenido de la base.

## 2. Fuentes examinadas

- `C:\TwoSidesTestKit\Logs\run-20261104-000847.log` (18 189 B) y `.log.err` (8 145 B); `last.pid`. Ejecución 00:08:47 → 00:12:12 (≈3 min 25 s).
- Código: `integration/sqlite/GamePersistenceContext.cs` (líneas citadas abajo), `project.godot`.
- Kit tras la ejecución: recalculados los 1335 SHA-256 → **0 cambiados, 0 añadidos, 0 eliminados** respecto del manifiesto (Godot no escribió en `Project\`). Sin procesos Godot/dotnet vivos.
- No se leyó nada de `C:\Users\TwoSidesTest`: la base y `ownership.json` los informó el verificador del propietario.

## 3. Resultados confirmados

| Hecho | Evidencia |
|---|---|
| Godot 4.6.1 Mono arrancó con el runtime privado | `Found hostfxr: C:\TwoSidesTestKit\dotnet8/host/fxr/8.0.30/hostfxr.dll`, `.NET: hostfxr initialized`, `GodotPlugins initialized` (queda resuelta la duda de B70/B71 sobre `DOTNET_ROOT`) |
| Scripts C# y DLL cargan | `GameApplicationContext.cs`, `GamePersistenceContext.cs`, `GameSyncHost.cs`, `LocalProfileView.cs` cargados; sin `DllNotFound`/`SQLitePCL` |
| Recursos con `Ñ` cargan | `DELFIN JUGADOR DAÑO.png` y su `.ctex` cargados sin error |
| Flujo jugado | menú principal → `menu_niveles` → `DesicionDelfin` → `info_delfin_buena` → `bioma_mar` → `BiomaMar iniciado. Estado saludable: True` → `AnimalSegmentFlow` → cierre |
| Cierre ordenado | `Unloading: Disposing tracked instances… Finished…`; sin `TELEMETRY_CLOSE_TIMEOUT`, `TELEMETRY_CLOSE_FAILED`, `LOCAL_STORAGE_CLOSE_FAILED` ni `[Local storage integrity]` |
| Sin errores | 0 coincidencias de `ERROR:`/`Exception`/`SaveException`/`UNSAFE_PATH`/`STORE_LOCKED` en ambos registros |
| Sin conexión remota | 0 menciones de http/mongo/atlas/connect en los registros; `project.godot` y el kit no contienen `two_sides/sync/main_api_url` ni `override.cfg`; el código solo activa sync con esa URL (`GameSyncHost.cs:32`). `Loaded system CA certificates` es la inicialización TLS de .NET, no una conexión. No se usó Atlas |
| Almacén de producción usado | `PlayerData\save.sqlite3` creado/actualizado y `ownership.json` correcto (informe del verificador); el contexto abre `production:true` (`GamePersistenceContext.cs:30–31`); sin rastro de `runtime-game` en los registros |

## 4. Advertencias completas (todas `GD.PushWarning`, no excepciones)

Las «cuatro entradas `CSharpInstanceBridge.Call`» son **marcos de la traza** de cuatro advertencias emitidas desde `_Process` (el puente C#↔Godot invoca `_Process`); no son excepciones. En total hay 5 advertencias:

| # | Mensaje | Origen | Hilo/momento |
|---|---|---|---|
| 1 | `[Local outbox] OUTBOX_NOT_ACTIVATED` | `GamePersistenceContext._Process`, línea 53 | primer fotograma tras abrir el almacén |
| 2 | `[Local telemetry] UNSUPPORTED_EVENT_SCHEMA` | `_Process`, línea 46 (`GD.PushWarning("[Local telemetry] "+code)`) | al iniciar la telemetría |
| 3 | `[Local telemetry] TELEMETRY_NOT_READY_COVERAGE` | `_Process`, línea 46 | consecuencia de la 2 |
| 4 | `[Local telemetry] TELEMETRY_COMPLETION_MISSING` | `_Process`, línea 46 | consecuencia de la 2 |
| 5 | `[Local outbox] OUTBOX_NOT_ACTIVATED` | `QuitCoreAsync`, línea 100 | al cerrar (drenaje de Outbox) |

Cada traza completa tiene la forma `GD.PushWarning` ← `GamePersistenceContext._Process(double)` ← `Node.InvokeGodotClassMethod` ← `GamePersistenceContext.InvokeGodotClassMethod` (generado) ← `CSharpInstanceBridge.Call`. Responsable: el nodo `GamePersistenceContext` (autoload/hijo de la aplicación, `integration/sqlite/GamePersistenceContext.cs`); no un script de escena.

Avisos ajenos al juego: `NVAPI: Application not found in profile, creating… NVAPI_EXECUTABLE_ALREADY_IN_USE (code -167)` (Godot intenta registrar un perfil NVIDIA para el ejecutable; el ejecutable ya figura como usado, p. ej. por el perfil del propietario; sin efecto, se sigue con `NVAPI: Init OK!` y OpenGL 3.3 en la RTX 3050) y `Unrecognized output string "misc2" in mapping` (tres líneas de la base de mandos de SDL; sin efecto).

## 5. Clasificación, causa e impacto

| Hallazgo | Tipo | Causa | Impacto funcional |
|---|---|---|---|
| `OUTBOX_NOT_ACTIVATED` (×2) | **Esperado**, no crítico | El almacén nuevo solo tiene el esquema base: las tablas `sync_*` las instalan herramientas offline autorizadas (B68 §riesgos); `LocalOutboxPump` devuelve este código si no existen. Está fuera de la lista de códigos silenciosos (`OUTBOX_IDLE/INACTIVE/LOCAL_READY/WAITING_PROFILE`), por eso se avisa | Ninguno en jugabilidad ni guardado; la cola de sincronización no existe aún (coherente con «sin `main_api_url`») |
| `UNSUPPORTED_EVENT_SCHEMA` + `TELEMETRY_NOT_READY_COVERAGE` + `TELEMETRY_COMPLETION_MISSING` | **Esperado en esta configuración**, no bloqueante, pero es una **brecha de producto** | La telemetría local de eventos exige el esquema de eventos de juego; el almacén de producción no lo instala (residual de B68). `Telemetry.Ready` queda en falso y el resto de diagnósticos derivan de ello | No se registran eventos de telemetría (inicio de animal, cobertura, finalización). No afecta al progreso guardado (`LocalGameState`); el cierre no quedó retenido (la telemetría se limita a 3 s por diseño) |
| NVAPI −167 / mapeos de mando | Ruido ajeno | Driver NVIDIA y base SDL | Ninguno |

No se hallaron excepciones C# ni escenas defectuosas. No hay fallos de carga de recursos.

## 6. Estado de la persistencia

- **Confirmado:** creación de `PlayerData`, `ownership.json` válido (`player-production-save`), base creada y actualizada, cierre sin errores de integridad, kit y proyecto intactos, SQLite histórica sin cambios (`9FE793A26068A63C14FC76977FD4661E8C0BB55AC2E6DF69E6E76C45A8D0070C`), `PlayerData` inexistente en `luis2`.
- **No demostrado todavía** (de las 9 comprobaciones de B70):
  - 4 Guardar una decisión: se transitó por `info_delfin_buena`, pero el registro no imprime el guardado; falta ver la fila en la base.
  - 5 Recuperar el progreso y 6 Cerrar/reabrir: **no hubo segundo arranque** en esta sesión.
  - 9 Cambio de bioma conserva el progreso: solo se visitó un bioma (Mar).
  - 7 Sin conexión remota: evidencia indirecta fuerte (§3); falta la lista `Get-NetTCPConnection` con el juego abierto (`3-Verify.ps1 -Running`) si se quiere prueba directa.
  - Carga de `e_sqlite3.dll`: indirecta (base creada); falta el listado de módulos.

## 7. Pruebas pendientes y cómo ejecutarlas

El manifiesto del kit sigue íntegro y `PlayerData` ya existe, por lo que el preflight actual fallará («PlayerData does not exist yet»): es correcto y habrá que decidirlo (§8). Secuencia propuesta, **solo con autorización del propietario**, en `TwoSidesTest`:

1. Antes del siguiente arranque, anotar hash y tamaño de `save.sqlite3`, `ownership.json` y `store.lease` (solo `Get-FileHash`/`Get-Item`).
2. Segundo arranque (mismo kit): elegir una decisión distinta en otro nivel, entrar a **dos biomas distintos**, volver al menú y cerrar con la ventana.
3. Tercer arranque: comprobar que el progreso (decisiones/estado de biomas) aparece como lo dejó la sesión anterior y que no hay `STORE_LOCKED`.
4. Con el juego abierto: `3-Verify.ps1 -Running` (módulos `e_sqlite3`/`coreclr 8.0.x` y conexiones remotas = ninguna).
5. Inspección de contenido de la base en **solo lectura** (con el juego cerrado): hace falta una herramienta de lectura (no existe en el kit; ver §8-C). Esperado: perfil local, registros de decisión y de progreso por bioma, `application_id 0x54535044`, sin tablas `sync_*`.

## 8. Correcciones recomendadas (ninguna aplicada)

- **A. (Sin código) Aceptar las advertencias OUTBOX/telemetría como esperadas** para esta prueba, y documentarlas como residual conocido.
- **B. (Decisión de producto) Provisionar esquema Outbox y eventos en el almacén de producción** de forma explícita y autorizada (B68 lo dejó fuera para evitar cambios automáticos de esquema) o, si la telemetría no va en la primera versión, **silenciar** `UNSUPPORTED_EVENT_SCHEMA`, `TELEMETRY_*` y `OUTBOX_NOT_ACTIVATED` mientras no haya `main_api_url`, para no ensuciar el registro del jugador. Cambio mínimo: tratar `OUTBOX_NOT_ACTIVATED` como código silencioso en `_Process` (línea 52) y no emitir los avisos de telemetría cuando el esquema no esté instalado.
- **C. Herramienta de inspección de solo lectura** (nueva, en el kit, .NET 8 con `Mode=ReadOnly` sobre una copia o con `mode=ro`) para validar decisiones y progreso sin abrir la base con el juego.
- **D. Preflight/ciclo de pruebas:** parámetro explícito para segundas ejecuciones (permitir `PlayerData` existente conservando hash de entrada) en lugar de borrar `PlayerData`; o decidir si se borra con autorización.
- **E. NVAPI −167:** ignorar; es del driver, no del juego.

## 9. Riesgos restantes

- La telemetría de eventos no se registra con el almacén de producción actual (producto, no estabilidad).
- Guardado/recuperación entre sesiones sin prueba; la exportación Windows debe esperar a §7.
- El export deberá resolver el runtime .NET 8 del jugador (privado/autocontenido) — verificado ahora el mecanismo `DOTNET_ROOT`, no el de un exportado.
- Ventanas de Godot por defecto en `AppData\Roaming\Godot` de `TwoSidesTest` (caché de shaders) no son del juego.

B72 se detiene aquí: no se reinició el juego ni se modificó ningún archivo salvo este informe.
