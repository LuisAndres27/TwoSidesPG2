# B71 — Kit de prueba de primer arranque en Windows

Fecha: 2026-11-03. Kit preparado; **el juego no se ha iniciado** en ninguna cuenta. Código, Godot project settings, backend, manifiesto v5, B67 y git: sin cambios.

## 1. Bloqueo que hay que resolver primero

**La cuenta `TwoSidesTest` NO existe.** `Get-LocalUser`: solo `luis2` activa (más Administrador, Invitado, DefaultAccount, WDAGUtilityAccount, WsiAccount deshabilitadas); `C:\Users` contiene `luis2`, `Public` y `WsiAccount`. Las restricciones prohíben crearla automáticamente y la sesión no es administrador.

El kit se preparó igualmente en una carpeta fuera del perfil (`C:\TwoSidesTestKit`), pero **la prueba de acceso desde `TwoSidesTest` y todo el §6 siguen pendientes hasta que el propietario cree la cuenta** (cuenta local estándar, sin Microsoft, sin administrador).

## 2. Ubicación del kit

`C:\TwoSidesTestKit` (952 MB, 1335 archivos hasheados). Fuera de `C:\Users\luis2` y de OneDrive.

| Carpeta | Contenido |
|---|---|
| `Project\` | Copia del juego (631 MB, 1064 archivos) |
| `Godot\` | Godot 4.6.1 Mono win64 completo (exe, consola y `GodotSharp`) copiado de `Desktop\Godot_v4.6.1-stable_mono_win64` |
| `dotnet8\` | Runtime privado .NET 8.0.30 win-x64 (71 MB, 185 archivos) |
| `Scripts\` | `1-Preflight.ps1`, `2-Start-Game.ps1`, `3-Verify.ps1`, `9-Cleanup.ps1` (ninguno ejecutado) |
| `Logs\` | Vacía; recibirá los logs de la ejecución |
| `KIT-MANIFEST.sha256` | SHA-256 de los 1335 archivos (excepto `Logs\` y el propio manifiesto) |

Permisos (solo lectura, sin cambios): `C:\TwoSidesTestKit` hereda de `C:\`: Administradores y SYSTEM control total, `Usuarios` leer/ejecutar, `Authenticated Users` modificar. `TwoSidesTest` podrá leer, ejecutar y escribir logs; ver riesgo §10.

## 3. Archivos incluidos / excluidos

**Incluidos en `Project\`:** `project.godot`, `TwoSides.csproj`, `TwoSides.sln`, `assets\`, `scenes\`, `scripts\`, `integration\` (código), `local-persistence\src` y `local-persistence\sync-http` (referenciados por el csproj), y de `.godot\`: `imported\`, `mono\metadata`, `mono\temp\bin\Debug` (DLL compilados en B69, incluido `runtimes\win-x64\native\e_sqlite3.dll`), `uid_cache.bin`, `global_script_class_cache.cfg`, `scene_groups_cache.cfg`.

**Excluidos:** `backend\` completo, `.git`, `node_modules`, `.env*`, `.work\` (incluye `runtime-game` con la SQLite histórica y sus 2151 operaciones), todas las pruebas, `*.sqlite*`, `*.db`, `*.pem/key/pfx/p12`, `*authorization*.json`, `*integrity-manifest*`, `*.secret`, `*.bak`, `*.old`, `export_presets.cfg`, `.godot\export_credentials.cfg`, `.godot\editor`, caches de shaders y `obj/bin` de proyectos auxiliares.

**Verificaciones sobre el kit:** ningún archivo `*.sqlite*`/`*.db`/`.env`/clave; el único nombre con "secret" es `DpapiSyncSecretStore.cs.txt` (código fuente, sin secretos); ninguna referencia a `luis2`, `runtime-game`, `C:\Users\` ni `OneDrive` en el texto del proyecto. La SQLite histórica no se abrió, copió ni hasheó en esta fase.

## 4. Dependencias .NET y runtime privado

- El juego exige `Microsoft.NETCore.App 8.0.0` (`rollForward: LatestMinor`). En esta máquina solo hay 10.0.11; el sistema no puede ejecutar apps net8 (probado: «You must install or update .NET»).
- **Origen del runtime privado:** paquete NuGet `microsoft.netcore.app.runtime.win-x64 8.0.30` de la caché de `luis2`; `.nupkg` verificado contra su `.sha512` (**coincide**).
- **Plataforma:** `hostfxr.dll`, `hostpolicy.dll`, `coreclr.dll`: PE machine `8664` (x64), versión `8.0.30.36720`; **0 DLL con firma Authenticode no válida** de las 185 (firma Microsoft).
- **Estructura** (sin `dotnet.exe`; no hace falta con `DOTNET_ROOT`):
  ```
  dotnet8\host\fxr\8.0.30\hostfxr.dll
  dotnet8\shared\Microsoft.NETCore.App\8.0.30\{coreclr,hostpolicy,System.Private.CoreLib,... 183 archivos}
  ```
- **Prueba realizada sin el juego:** una app net8 de sondeo (en el *scratchpad*) con `DOTNET_ROOT=C:\TwoSidesTestKit\dotnet8` se ejecutó y devolvió `8.0.30 | .NET 8.0.30 | X64`, con `System.Private.CoreLib.dll` cargada desde el kit; sin `DOTNET_ROOT` falla (el sistema no tiene runtime 8). Esto prueba el runtime privado y el mecanismo `DOTNET_ROOT`, **no** la resolución de `hostfxr` por parte de Godot (se verá en la prueba).
- Sin `Microsoft.NETCore.App.deps.json` en el paquete: el sondeo funcionó igualmente. SQLite: `e_sqlite3.dll` win-x64 viene con los DLL compilados; no se instala SQLite en el sistema.

## 5. Configuración sin alterar Windows

Solo variables de proceso, definidas por `2-Start-Game.ps1` y heredadas por Godot: `DOTNET_ROOT=C:\TwoSidesTestKit\dotnet8`, `DOTNET_MULTILEVEL_LOOKUP=0`, y `DOTNET_ROLL_FORWARD` eliminada (que no salte a 10). Ningún cambio en registro, PATH global ni variables de usuario/máquina.

## 6. Procedimiento de inicio desde TwoSidesTest

Pasos manuales previos del propietario (Claude no los hace): crear la cuenta estándar `TwoSidesTest`; no vincularla a OneDrive; iniciar sesión.

```powershell
# En PowerShell estándar de TwoSidesTest
Set-ExecutionPolicy -Scope Process Bypass          # solo este proceso
C:\TwoSidesTestKit\Scripts\1-Preflight.ps1         # 13 comprobaciones; no inicia el juego
C:\TwoSidesTestKit\Scripts\2-Start-Game.ps1 -IUnderstandThisCreatesPlayerData
C:\TwoSidesTestKit\Scripts\3-Verify.ps1 -Running   # con el juego abierto
# jugar las 9 comprobaciones (§7), cerrar el juego
C:\TwoSidesTestKit\Scripts\3-Verify.ps1            # tras cerrar
```
`1-Preflight.ps1` falla (y `2-Start-Game.ps1` no arranca) si: la cuenta no es `TwoSidesTest`; `LocalApplicationData` no es `C:\Users\TwoSidesTest\AppData\Local` o contiene OneDrive; la sesión es administrador; `PlayerData` ya existe; falta Godot, runtime privado, `TwoSides.dll` o `e_sqlite3.dll`; hay `*.sqlite*`/`.env` en el kit; `project.godot` menciona `runtime-game`; o el manifiesto SHA-256 no coincide. El manifiesto solo vale **antes del primer arranque** (Godot escribe en `.godot\`).

Inicio: `Godot_..._console.exe --path C:\TwoSidesTestKit\Project --verbose`, **sin** banderas de prueba y **sin** `main_api_url`.

## 7. Las nueve comprobaciones pendientes (de B70)

1. Abre sin errores (ventana y log sin excepciones).
2. Se crea `%LOCALAPPDATA%\TwoSides\PlayerData\{save.sqlite3, ownership.json, store.lease}`.
3. Sin rutas históricas (`ownership.json`: `copy=two-sides-player-save-v1`, `purpose=player-production-save`; sin `runtime-game` en el log).
4. Guardar una decisión.
5. Recuperar el progreso.
6. Cerrar y reabrir: misma partida, sin `STORE_LOCKED`.
7. Sin conexión remota (sin `main_api_url`): `3-Verify.ps1 -Running` no lista conexiones externas.
8. Outbox no activada no bloquea (puede verse `OUTBOX_NOT_ACTIVATED`; el juego responde).
9. Cambiar de bioma conserva el progreso.

Más: `e_sqlite3.dll` y `coreclr.dll 8.0.x` aparecen en los módulos del proceso (lo imprime `3-Verify.ps1 -Running`).

## 8. Verificación del aislamiento

- Antes: `1-Preflight.ps1` (cuenta, LocalAppData, sin OneDrive, sin PlayerData previo, sin SQLite/`.env` en el kit).
- En `luis2`, tras la prueba: `%LOCALAPPDATA%\TwoSides\PlayerData` debe seguir sin existir y `local-persistence\.work\runtime-game\save.sqlite3` debe conservar SHA-256 `9FE793A26068A63C14FC76977FD4661E8C0BB55AC2E6DF69E6E76C45A8D0070C`.
- Estado actual en `luis2`: `PlayerData` no existe; sin procesos Godot/dotnet.

## 9. Limpieza

1. Cerrar Godot; guardar evidencia (hash de `save.sqlite3`, copia de `Logs\`) fuera del kit.
2. `9-Cleanup.ps1` (sin parámetros = simulacro); con `-ConfirmDeleteKit` borra solo `C:\TwoSidesTestKit`, y se niega fuera de `TwoSidesTest`.
3. `PlayerData` de `TwoSidesTest` y la propia cuenta solo se eliminan con autorización del propietario (la cuenta, desde Configuración con administrador).
4. Copias de seguridad: no se modificó nada en el proyecto original, así que no hubo respaldo nuevo; el kit es una copia desechable.

## 10. Riesgos restantes

- La cuenta no existe: aislamiento y acceso del kit sin probar desde `TwoSidesTest`.
- Godot podría no resolver `hostfxr` desde `DOTNET_ROOT`; plan B: instalar «.NET Runtime 8.0.x x64» en `TwoSidesTest` (acción del propietario).
- La ACL heredada de `C:\` permite a cualquier usuario autenticado modificar el kit (no contiene secretos ni datos reales, pero se puede alterar); se detecta con el manifiesto antes del primer arranque. No se cambió ninguna ACL.
- El kit no puede recompilar sin caché NuGet; usa los DLL compilados en B69.
- Sin tablas Outbox/telemetría en tiendas nuevas (B68): la prueba 8 solo valida el no bloqueo.
- Advertencias de compilación de B69 siguen sin recuento.
- Los scripts no se han ejecutado (ni siquiera el preflight, por diseño pensado para `TwoSidesTest`): pueden tener errores no detectados.

B71 se detiene aquí. No se inició el juego ni la exportación.
