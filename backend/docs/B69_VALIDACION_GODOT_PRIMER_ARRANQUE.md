# B69 — Validación en Godot y primer arranque controlado

Fecha: 2026-11-03. Estado: **compilación VALIDADA; arranque controlado NO ejecutado (detenido por la regla de aislamiento)**.

## 1. Resumen

| Etapa | Resultado |
|---|---|
| 1 Preparación | Completa |
| 2 Compilación con Godot Mono | **OK** (binarios regenerados, dependencias SQLite presentes) |
| 3 Arranque controlado | **NO ejecutado**: el aislamiento de LocalAppData no es garantizable (§4) |
| 4 Limpieza | Completa: sin procesos vivos, SQLite histórica intacta, nada creado en `%LOCALAPPDATA%\TwoSides\PlayerData` |

## 2. Versiones y entorno

- Godot: `v4.6.1.stable.mono.official.14d19694e`, ejecutable `C:\Users\luis2\OneDrive\Desktop\Godot_v4.6.1-stable_mono_win64\Godot_v4.6.1-stable_mono_win64_console.exe`.
- Proyecto: `Godot.NET.Sdk/4.6.1`, `TargetFramework net8.0` (net9.0 solo para Android), `EnableDynamicLoading`. `project.godot`: `assembly_name=TwoSides`, features `4.6, C#, GL Compatibility`.
- SDK instalado: .NET **10.0.400** (único). Runtimes instalados: Microsoft.NETCore.App **10.0.11** (+ AspNetCore y WindowsDesktop 10.0.11). **No hay runtime .NET 8.** `TwoSides.runtimeconfig.json` exige `Microsoft.NETCore.App 8.0.0` con `rollForward: LatestMinor`.
- Paquetes NuGet de compilación ya en caché (`godot.net.sdk`, `godotsharp`, `microsoft.data.sqlite`, `sqlitepclraw.*`, `microsoft.netcore.app.ref`).
- Manifiesto v5 (`src, scripts, node_modules, package.json, package-lock.json, vitest.config.js`): fuera del alcance de la compilación; no se tocó nada de `backend/`.

## 3. Compilación

Mecanismo oficial: `Godot_..._console.exe --headless --path . --build-solutions --quit`.

- Pasos reportados por Godot: `first_scan_filesystem` DONE, **`dotnet_build_project` DONE**, `update_scripts_classes` DONE, `loading_editor_layout` DONE. Sin mensajes de error.
- Salida generada en `.godot/mono/temp/bin/Debug` (22:47 UTC): `TwoSides.dll` (661 504 B), `TwoSides.LocalPersistence.dll`, `TwoSides.SyncHttp.dll`, `Microsoft.Data.Sqlite.dll`, `SQLitePCLRaw.{core,batteries_v2,provider.e_sqlite3}.dll`, `TwoSides.deps.json`, `TwoSides.runtimeconfig.json`.
- **SQLite nativo:** `runtimes/win-x64/native/e_sqlite3.dll` (1 978 880 B) presente, junto con win-x86/arm64, linux, osx, etc. La resolución nativa en Windows x64 queda satisfecha por el paquete (carga real no ejercitada, ver §6).
- El código de B68 (`production:true`, `OpenProductionOrCreate`, `InternalsVisibleTo`) compila dentro del proyecto Godot real: **0 errores de compilación** (Godot no emite error y regenera los DLL).
- **Advertencias:** Godot headless no vuelca el log de MSBuild, por lo que no se capturó el recuento de advertencias de este build. Pendiente si se desea (`dotnet build -v:n` sobre una copia, ver §7).
- No se modificó código. El editor headless quedó abierto tras terminar la compilación (`--quit` no cerró el proceso); se cerró manualmente (PID propio 8424).
- El árbol de trabajo, fuera de `.godot/`, `.git`, `node_modules`, `.work`, `obj`, `bin`, no cambió (comparación de 2296 entradas ruta|tamaño|mtime antes/después: sin diferencias). `project.godot`, `TwoSides.csproj` y `export_presets.cfg` sin cambios.

## 4. Arranque controlado: NO ejecutado

Regla del pliego: «si no puede garantizarse el aislamiento del perfil, detenerse antes del arranque». No puede garantizarse:

1. La ruta de producción es `Environment.GetFolderPath(LocalApplicationData)`. Se comprobó que **modificar la variable de entorno `LOCALAPPDATA` no tiene efecto** (con `LOCALAPPDATA=C:\Nope\X` el API devolvió `C:\Users\luis2\AppData\Local`; en Windows el API usa la shell, no la variable). Un arranque desde esta cuenta crearía `%LOCALAPPDATA%\TwoSides\PlayerData` en el perfil real, que el pliego prohíbe como primer paso.
2. No hay perfil Windows desechable, ni Windows Sandbox/VM disponible sin instalar programas o crear usuarios (prohibido sin autorización); redirigir el shell folder del registro afectaría al perfil real.
3. Las banderas de prueba del juego (`-- --two-sides-sync-local-test --two-sides-test-storage=sandbox`) usan un adaptador sintético y **no** ejercitan la ruta de producción, así que no validan el objetivo de B69 (nota: el arranque con esas banderas tampoco se hizo).
4. Bloqueo adicional: **runtime .NET 8 ausente**. El juego (`runtimeconfig` → 8.0.x, `LatestMinor`) no podría cargar el runtime en esta máquina sin `DOTNET_ROLL_FORWARD=Major` o instalar .NET 8. Es relevante también para la distribución (§7).

Pruebas del §3 del pliego (guardar decisión, recuperar, cerrar/reabrir, cambio de bioma, sin conexión remota, sin Outbox) → **PENDIENTES**; no hay evidencia nueva. La evidencia disponible sigue siendo la de B68 (65/65 comprobaciones de producción, 20 modos GameSave / 756 comprobaciones, Outbox ausente → `OUTBOX_NOT_ACTIVATED`, sync deshabilitada sin `main_api_url`).

## 5. Evidencia de aislamiento / no impacto

- SQLite histórica `local-persistence/.work/runtime-game/save.sqlite3` (5 697 536 B, mtime 31/10/2026 07:05:07): SHA-256 `9FE793A26068A63C14FC76977FD4661E8C0BB55AC2E6DF69E6E76C45A8D0070C` antes y después. Solo se calculó hash (lectura), sin abrirla con SQLite.
- `%LOCALAPPDATA%\TwoSides\PlayerData` no existe tras B69.
- Sin procesos Godot/dotnet/MSBuild vivos al final.
- No se tocó Atlas, Express, Caddy, v5, B67, credenciales, cuotas, exportación, commits ni push. Las 2151 operaciones pendientes no se procesaron.
- Respaldo previo: `%LOCALAPPDATA%\TwoSidesClientBackups\pre-B69-20261103\` (`project.godot`, `TwoSides.csproj`, `TwoSides.sln`, `export_presets.cfg`, `godot-mono-metadata`, `temp-bin-Debug` anterior, `tree-before.txt`).
- Archivos sintéticos creados: ninguno. Nada que eliminar.

## 6. Errores, advertencias y limitaciones

- Ningún error de compilación.
- Advertencias del build no capturadas (§3).
- La carga real de `e_sqlite3.dll` por el proceso de Godot no se ejercitó.
- El editor headless no termina con `--quit` tras `--build-solutions` en este entorno (hay que matar el proceso).
- Los DLL en `.godot/mono/temp/bin/Debug` se regeneraron (carpeta ignorada por git).

## 7. Siguiente paso mínimo

Para cerrar B69 y habilitar la exportación Windows, el propietario debe decidir **una** vía de aislamiento para el arranque de producción:

- **A (recomendada):** ejecutar el juego con una cuenta de Windows de pruebas (o Windows Sandbox/VM) con .NET 8 Desktop Runtime, y verificar las 9 comprobaciones del §3 del pliego. Es la misma prueba que validaría la distribución.
- **B:** autorizar explícitamente el primer arranque en el perfil real de esta cuenta (crea `%LOCALAPPDATA%\TwoSides\PlayerData`; la SQLite histórica no se usa) con `DOTNET_ROLL_FORWARD=Major` solo para el proceso; borrar luego `PlayerData` con autorización.

Además: resolver el runtime .NET 8 para la distribución (los exportes Mono/.NET 8 lo exigirán en la máquina del jugador, o bien exportar self-contained), y, opcionalmente, capturar las advertencias con `dotnet build -v:n` sobre una copia.

B69 se detiene aquí. No se inició exportación.
