# B70 — Preparación de la prueba de primer arranque en perfil Windows aislado

Fecha: 2026-11-03. Solo lectura y documentación. **No se ejecutó el juego, no se creó ningún usuario, no se instaló nada.**

## 1. Hechos comprobados (B68/B69 + esta fase)

| Elemento | Estado |
|---|---|
| Ruta de producción | `%LOCALAPPDATA%\TwoSides\PlayerData\save.sqlite3` (+ `ownership.json`, `store.lease`), vía `GetFolderPath(LocalApplicationData)`. La variable `LOCALAPPDATA` **no** la redirige (B69). |
| Compilación Godot 4.6.1 Mono | OK; `TwoSides.dll`, `TwoSides.LocalPersistence.dll`, `TwoSides.SyncHttp.dll`, `e_sqlite3.dll` (win-x64) en `.godot/mono/temp/bin/Debug` |
| Windows | 11 Home Single Language |
| Sesión actual | **No administrador** |
| Cuentas locales | `luis2` (activa); `Administrador`, `Invitado`, `DefaultAccount`, `WDAGUtilityAccount`, `WsiAccount` deshabilitadas. **No existe cuenta de pruebas.** |
| Runtimes .NET | Solo 10.0.11 (NETCore, AspNetCore, WindowsDesktop). **Sin runtime 8.** `runtimeconfig` exige 8.0.0, `LatestMinor`. |
| SQLite histórica | `local-persistence/.work/runtime-game/save.sqlite3`, SHA-256 `9FE793A26068A63C14FC76977FD4661E8C0BB55AC2E6DF69E6E76C45A8D0070C` (no se abrió) |

## 2. Opciones de aislamiento

| Opción | Disponible | Notas |
|---|---|---|
| Windows Sandbox | **No** | No existe en Windows 11 *Home* (solo Pro/Enterprise/Education); `WindowsSandbox.exe` no está. |
| Hyper-V | **No** | Tampoco en Home; no hay `vmconnect`. |
| VirtualBox/VMware | **No instalados** | Instalar está prohibido. |
| WSL | Presente, **inútil** | Es Linux; no ejecuta este juego Windows con `%LOCALAPPDATA%`. |
| **Cuenta local estándar de pruebas** | Viable, **creación manual del propietario** | Su `%LOCALAPPDATA%` es independiente de `luis2`. Requiere administrador (la sesión actual no lo es). **Opción recomendada.** |
| Variable `LOCALAPPDATA` / `USERPROFILE` | **Descartada** | No cambia `GetFolderPath`; el juego escribiría en el perfil real. |
| Redirigir shell folder en el registro de `luis2` | **Descartada** | Modifica el perfil principal. |
| Bandera de test (`--two-sides-test-storage=sandbox`) | Disponible pero **insuficiente** | Adaptador sintético; no ejercita la ruta de producción. Útil solo como humo adicional. |
| Override de código (p. ej. variable de entorno de raíz local) | No implementado | Exigiría cambiar `OpenProduction` (fail-closed) y la prueba ya no usaría el código real; **no recomendada**, requiere autorización explícita. |

**Conclusión:** la única vía válida sin instalar programas ni tocar el perfil principal es una cuenta local estándar creada por el propietario.

## 3. Disponibilidad real de .NET 8

- No instalado. Sí hay en la caché NuGet de `luis2` el paquete **runtime 8.0.30 para win-x64** (`%USERPROFILE%\.nuget\packages\microsoft.netcore.app.runtime.win-x64\8.0.30`, ~123 MB) con `coreclr.dll`, `hostfxr.dll`, `hostpolicy.dll` y `System.Private.CoreLib.dll`.
- Alternativas (decisión del propietario):
  - **R1 (preferida): runtime privado** ensamblado copiando archivos (no es una instalación) bajo una carpeta de la cuenta de pruebas y apuntando `DOTNET_ROOT` a ella. Detalle en §5.2. Riesgo: que Godot resuelva `hostfxr` vía `DOTNET_ROOT`; **no verificado** (es parte de la prueba).
  - **R2:** el propietario instala «.NET 8 Desktop Runtime / .NET Runtime 8.0.x x64» desde la fuente oficial en la cuenta de pruebas. Es la configuración más fiel al jugador final.
  - **R3 (solo diagnóstico):** `DOTNET_ROLL_FORWARD=Major` con el runtime 10.0.11. Puede arrancar, pero **no** valida el objetivo net8; sirve únicamente para aislar fallos.

## 4. Pasos manuales necesarios (propietario)

1. Crear cuenta local **estándar** `TwoSidesTest` (Configuración → Cuentas → Otros usuarios → Agregar cuenta sin Microsoft; sin privilegios de administrador).
2. Dejar sin sincronizar OneDrive en esa cuenta (el perfil `C:\Users\TwoSidesTest\AppData\Local` no debe estar redirigido).
3. Copiar a una carpeta legible por esa cuenta (p. ej. `C:\TwoSidesTestKit\`): la carpeta de Godot (`Godot_v4.6.1-stable_mono_win64`, que incluye `GodotSharp`), una **copia** del proyecto `Two-Sides PRUEBA` sin `local-persistence/.work/runtime-game`, sin `backend/.env`, sin `node_modules` y sin `.git`.
4. Disponer del runtime .NET 8 (R1 o R2).
5. Iniciar sesión como `TwoSidesTest` y ejecutar §5. Ninguna credencial real hace falta ni se debe escribir.
6. Después, cerrar sesión y ejecutar §9 (limpieza).

Nada de esto lo hace Claude; la ejecución del juego tampoco es de Claude en el perfil `luis2`.

## 5. Comandos de ejecución (en la cuenta `TwoSidesTest`)

Variables: `K=C:\TwoSidesTestKit`.

### 5.1 Comprobación previa (antes de lanzar nada)

```powershell
whoami                                              # debe ser <PC>\twosidestest
[Environment]::GetFolderPath('LocalApplicationData') # debe ser C:\Users\TwoSidesTest\AppData\Local
Test-Path "$env:LOCALAPPDATA\TwoSides\PlayerData"    # debe ser False
dotnet --list-runtimes                              # solo con R2: debe listar Microsoft.NETCore.App 8.0.x
```
Si `whoami` o la ruta apuntan a `luis2`, **detenerse**.

### 5.2 Runtime privado (R1), sin instalar

```powershell
$src="<ruta de luis2>\.nuget\packages\microsoft.netcore.app.runtime.win-x64\8.0.30\runtimes\win-x64"
$r="C:\TwoSidesTestKit\dotnet8"
New-Item -ItemType Directory -Force "$r\host\fxr\8.0.30","$r\shared\Microsoft.NETCore.App\8.0.30" | Out-Null
Copy-Item "$src\native\hostfxr.dll" "$r\host\fxr\8.0.30\"
Copy-Item "$src\native\*","$src\lib\net8.0\*" "$r\shared\Microsoft.NETCore.App\8.0.30\" -Recurse
$env:DOTNET_ROOT=$r; $env:DOTNET_MULTILEVEL_LOOKUP=0
```
(La carpeta `shared` también necesita `Microsoft.NETCore.App.deps.json`; está en el mismo paquete bajo `runtimes\win-x64\` o `data\`. Si falta, el runtime no arranca: criterio de fallo, no improvisar.)

### 5.3 Compilar y lanzar

```powershell
cd C:\TwoSidesTestKit\Project
$g="C:\TwoSidesTestKit\Godot_v4.6.1-stable_mono_win64\Godot_v4.6.1-stable_mono_win64_console.exe"
& $g --headless --path . --build-solutions --quit      # matar el proceso si no termina (ver B69)
& $g --path . --verbose 2>&1 | Tee-Object C:\TwoSidesTestKit\run1.log
```
Sin banderas de prueba y **sin** `main_api_url`.

## 6. Las nueve comprobaciones funcionales

| # | Comprobación | Evidencia esperada |
|---|---|---|
| 1 | Juego abre sin errores | Ventana principal; `run1.log` sin excepciones C#/`SaveException` |
| 2 | Se crea `PlayerData` | `%LOCALAPPDATA%\TwoSides\PlayerData\{save.sqlite3, ownership.json, store.lease}` |
| 3 | Sin rutas históricas | Ningún acceso a `local-persistence\.work\runtime-game` (no existe en la copia); `ownership.json` con `copy=two-sides-player-save-v1`, `purpose=player-production-save` |
| 4 | Guardar una decisión | Decisión aplicada en la UI sin error |
| 5 | Recuperar el progreso | Tras reiniciar el estado en memoria / recargar, la decisión persiste |
| 6 | Cerrar y reabrir | Misma partida y mismo `save.sqlite3` (hash/tamaño coherente con el cierre); sin `STORE_LOCKED` |
| 7 | Sin conexión remota sin URL | Sin tráfico a hosts externos (`Get-NetTCPConnection` del PID sin conexiones remotas distintas de loopback); log sin intento HTTP |
| 8 | Outbox no activada no bloquea | El juego responde; el log puede mostrar `OUTBOX_NOT_ACTIVATED` sin congelar |
| 9 | Cambio de bioma conserva progreso | Cambiar bioma y volver: progreso intacto, consultado en la base |

## 7. Verificación de PlayerData y SQLite

Tras cerrar el juego (sin abrirlo con otro proceso mientras corre):

```powershell
$d="$env:LOCALAPPDATA\TwoSides\PlayerData"
Get-ChildItem $d -Force | Select Name,Length,LastWriteTime
Get-Content "$d\ownership.json"                    # sin datos secretos
Get-FileHash "$d\save.sqlite3"
```
Lectura del contenido solo con herramienta de solo lectura de B68 (`ProductionStorageChecks`/`GameSave`) sobre una **copia** de la base, o con `sqlite3 -readonly` si existe en el kit. Esperado: `application_id` `0x54535044`, tablas de base (sin `sync_*` ni gameplay-events), una fila de perfil local y los registros de la decisión.

## 8. Verificación de carga de `e_sqlite3.dll`

Con el juego en ejecución (PID `p`):

```powershell
(Get-Process -Id $p).Modules | Where ModuleName -match 'e_sqlite3|coreclr|hostfxr|hostpolicy' | Select ModuleName,FileName
```
Esperado: `e_sqlite3.dll` cargada desde `.godot\mono\temp\bin\Debug\runtimes\win-x64\native\` (o carpeta equivalente), `coreclr.dll` versión 8.0.x (R1/R2). Alternativa: `run1.log` sin `DllNotFoundException`/`SQLitePCL` y `PlayerData` creado (prueba indirecta).

## 9. Limpieza

1. Cerrar Godot y procesos hijos; confirmar `Get-Process Godot*,dotnet` vacío.
2. Anotar hashes de `save.sqlite3` y `ownership.json` (evidencia).
3. Eliminar solo `C:\TwoSidesTestKit` y, si el propietario lo autoriza, la cuenta `TwoSidesTest` completa (desde Configuración, con administrador). No tocar `luis2`.
4. En `luis2` verificar: `%LOCALAPPDATA%\TwoSides\PlayerData` sigue sin existir y la SQLite histórica conserva `9FE793A2…8D0070C`.

## 10. Criterios de aceptación

- Prueba ejecutada **solo** en `TwoSidesTest`; §5.1 aprobado.
- Las 9 comprobaciones superadas con evidencia.
- Runtime .NET 8.0.x efectivo (R1 o R2); R3 no cuenta como aceptación.
- `e_sqlite3.dll` cargada y sin excepciones nativas.
- Sin conexión remota, sin procesos huérfanos.
- Hash histórico sin cambios; `PlayerData` inexistente en `luis2`.

## 11. Riesgos restantes

- Que Godot no resuelva `hostfxr` con `DOTNET_ROOT` (R1); alternativa R2.
- Las tablas Outbox/telemetría no existen en tiendas nuevas (ya documentado en B68): la prueba 8 valida el no bloqueo, no la sincronización.
- La copia del proyecto debe excluir secretos y la SQLite histórica; un descuido puede filtrarlos a otra cuenta.
- OneDrive en la cuenta de pruebas o `LocalAppData` redirigido provoca `UNSAFE_PATH` (comportamiento fail-closed correcto).
- Compilación en la cuenta de pruebas requiere paquetes NuGet (red o caché); si falla, copiar `.godot/mono/temp/bin/Debug` ya compilado.
- Las advertencias de compilación de B69 siguen sin recuento.
- Exportación Windows sigue pendiente de esta validación y de la decisión de runtime (embebido vs instalado).

B70 se detiene aquí. No se ejecutó el juego ni se inició la exportación.
