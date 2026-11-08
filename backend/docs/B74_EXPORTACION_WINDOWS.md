# B74 — Preparación y validación de la exportación Windows

Fecha: 2026-11-04. Estado: **paquete Windows x64 generado e inspeccionado; NO se ejecutó (ni `TwoSides.exe` ni el juego del proyecto)**. Es un candidato para pruebas en `TwoSidesTest`, **no listo para entregar** (ver §9).

## 1. Resultado

Exportación correcta de `Windows Desktop` con Godot `v4.6.1.stable.mono` (plantilla `4.6.1.stable.mono`, release) a una carpeta independiente: **`C:\TwoSidesBuild\TwoSides-win64\`** (fuera de OneDrive y del proyecto). Pasos de Godot: `first_scan_filesystem`, `dotnet_publish_project`, `savepack` → DONE, sin errores ni advertencias. Hash de integridad del paquete (195 archivos): `C:\TwoSidesBuild\TwoSides-win64.sha256` (fuera del paquete), SHA-256 `571C5FB0FAFC78780600B3B6B8B9B8A8E8F5EC328111DF37FEC02424BDB9223F`.

Dato operativo: el editor headless no termina por sí solo tras exportar (igual que con `--build-solutions`); se cerró el proceso propio tras `savepack`. Sin procesos Godot/dotnet vivos.

## 2. Revisión de preset y herramientas

- Preset `Windows Desktop` (`export_presets.cfg`, sin versionar en git): `export_filter=all_resources`, `x86_64`, `embed_pck=false`, `encrypt_pck=false`, sin firma de código, `dotnet/embed_build_outputs=false`, icono configurado. `export_path` relativo (`../../TWO SIDES DEMO/…`); no se usó: la salida se fijó por línea de comandos (`--export-release "Windows Desktop" <ruta>`), así el preset no ancla la salida a OneDrive.
- Godot usado: `C:\Users\luis2\OneDrive\Desktop\Godot_v4.6.1-stable_mono_win64\Godot_v4.6.1-stable_mono_win64_console.exe`. SDK .NET 10.0.400 (compila `net8.0`).
- `.godot\export_credentials.cfg` (clave de cifrado de scripts, identidad de firma): **no** se incluye ni se imprimió; `encrypt_pck=false`.

## 3. Bloqueos confirmados y corrección

Primera exportación de prueba (preset original) → inspección del `.pck` con un lector propio (formato v3, 748 entradas) y análisis de binarios:

| Hallazgo confirmado | Evidencia | Corrección |
|---|---|---|
| **El PCK incluía 178 archivos de `backend/`** (2,8 MB): `package.json`, `package-lock.json`, `scripts/c2-activation-template.json`, vectores de `tests/sync`, 8 JSON de `docs/c2-reference` y 165 JSON de `node_modules`. `all_resources` trata los `.json` como recursos y `backend/` no tiene `.gdignore` | lista del PCK | `exclude_filter="backend/*, docs/*, local-persistence/*"` (sin tocar `backend/`) |
| Se copiaban 3 `.pdb` (con rutas absolutas del desarrollador) | 3 `.pdb` en `data_TwoSides_windows_x86_64\` | `dotnet/include_debug_symbols=false` |

Cambios solo en `export_presets.cfg` (respaldo: `%LOCALAPPDATA%\TwoSidesClientBackups\pre-B74-20261104\`, hash anterior `DAEAB80D032B7E82…`, nuevo `B24DE0045DB112A8DB2CFA2B2D6F29E4BDCD7C3F0F938EB20AB5485CE492F7FF`). Sin cambios en `project.godot`, `TwoSides.csproj`/`.sln`, escenas, scripts, reglas, assets, ni el backend. Se probó (y se descartó) excluir `integration/*`: sus `.cs` son *stubs* de 1 byte que el motor necesita para cargar los scripts C#.

Efecto lateral detectado y revertido: `dotnet publish` reescribió `local-persistence/src/packages.lock.json` y `sync-http/packages.lock.json` añadiendo el destino `net8.0/win-x64`. Se restauraron quitando solo ese bloque; los tamaños vuelven exactamente a los previos (2193 y 2324 B) y son JSON válidos (copias del estado posterior en el respaldo). **Cada nueva exportación volverá a reescribirlos.**

## 4. Archivos generados y tamaño

| Elemento | Tamaño |
|---|---|
| `TwoSides.exe` (motor Godot Mono release, x64) | 99,9 MB |
| `TwoSides.pck` (240 recursos importados `.godot`, 183 assets, 63 escenas, 73 scripts-stub, `project.binary`; 570 entradas) | 115,9 MB |
| `data_TwoSides_windows_x86_64\` (runtime .NET 8 + juego + SQLite nativa) | 79,0 MB |
| **Total** | **294,8 MB, 195 archivos** (una sola subcarpeta) |

No se genera envoltorio de consola (solo en depuración). SHA-256 clave:

| Archivo | SHA-256 |
|---|---|
| `TwoSides.exe` | `26532670B808CED4728EEC2DB2649277FC5970281AFAFE3ED42E061A1AE87FC4` |
| `TwoSides.pck` | `32530E7EFC1FD619F6FF7B15DB0BB6D823CF232912EB8E88631397E63742091E` |
| `data…\TwoSides.dll` | `74FB01853B50F5E5BFFC019743449F543E536AADA09CA440C1841105E18E4BA8` |
| `data…\TwoSides.LocalPersistence.dll` | `B95D7EB5633BB370A7FF3E811BCE197E83FBE08BAE5C3CE3251C62E3E3B25806` |
| `data…\TwoSides.SyncHttp.dll` | `F928F74006ACE59E7C9564A43D3A28668C4A8B256BDAB059844064F0805C7D8F` |
| `data…\e_sqlite3.dll` | `B7385D722C83FB52142A00477A726723745916D22A555711EE89834C1111FB2E` |
| `data…\coreclr.dll` | `FC2909E16B3F70EDFEAC96D69D3F1D444705B1E4AD922DC760BB396338A7B1DE` |

## 5. Dependencias incluidas

- **.NET 8.0.30 autocontenido win-x64** (`runtimeconfig`: `includedFrameworks Microsoft.NETCore.App 8.0.30`): `hostfxr`, `hostpolicy`, `coreclr` (firma Microsoft válida), `System.*`. **El jugador no necesita instalar .NET.** El paquete incluye además componentes de depuración del runtime (`createdump.exe`, `mscordbi.dll`, `mscordaccore*.dll`); son opcionales.
- **SQLite nativa**: `e_sqlite3.dll` (x64, 1,98 MB, sin firma) + `Microsoft.Data.Sqlite`, `SQLitePCLRaw.*`.
- Juego: `TwoSides.dll`, `TwoSides.LocalPersistence.dll`, `TwoSides.SyncHttp.dll`, `GodotSharp.dll`, `TwoSides.deps.json`.
- Arquitectura PE x64 (`0x8664`) en exe, `e_sqlite3.dll` y `coreclr.dll`.

## 6. Verificaciones de seguridad (sin ejecutar nada)

| Comprobación | Resultado |
|---|---|
| Entradas `backend/`, `docs/`, `local-persistence/` en el PCK | **0** (antes 178) |
| JSON en el PCK | 0 |
| Archivos `.sqlite*`, `.db`, `.env*`, claves, credenciales, `.ps1`, `.md`, `.js`, `node_modules`, herramientas administrativas, bases de prueba en el paquete | **ninguno** |
| `*.pdb` | 0 |
| Cadenas `mongodb://`, `main_api_url`, `password=` en todo el paquete | 0 (la sincronización queda **desactivada**: no hay URL) |
| `-----BEGIN … PRIVATE KEY-----` en `TwoSides.exe` | Falso positivo: está también, idéntico, en la plantilla oficial `windows_release_x86_64.exe` (literales de mbedTLS) |
| Subcadena «TWO SIDES» en el PCK | Es el nombre de `TITULO TWO SIDES ..png` |
| Historial/SQLite del desarrollador | no incluidos; la SQLite histórica sigue con SHA-256 `9FE793A26068A63C14FC76977FD4661E8C0BB55AC2E6DF69E6E76C45A8D0070C` |
| Proyecto original | solo cambia `export_presets.cfg` (más los `packages.lock.json` ya revertidos) |

**Rutas absolutas del desarrollador: AÚN presentes (hallazgo abierto).** En `TwoSides.dll`, `TwoSides.LocalPersistence.dll` y `TwoSides.SyncHttp.dll`:

1. Ruta del `.pdb` en el directorio de depuración del PE (`C:\Users\luis2\OneDrive\Desktop\PRUEBA\…\obj\ExportRelease\…pdb`). Contiene el nombre de usuario y la estructura de carpetas, no secretos. Corrección sin tocar código: `PathMap`/`DebugType=none` en `TwoSides.csproj` y `local-persistence\Directory.Build.props` (cambio de compilación, no de exportación; no aplicado).
2. La constante `SyntheticSandbox.AuthorizedProjectRoot = @"C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\local-persistence"` (`local-persistence/src/SyntheticSandbox.cs.txt:11`) queda compilada en `TwoSides.LocalPersistence.dll` y se inlinea en `TwoSides.dll`. Solo la usan el almacén sintético de pruebas/histórico (no el almacén de producción: B68), pero viaja en el binario. Corrección: derivar la raíz en tiempo de ejecución o separar el código de pruebas del ensamblado del juego (cambio de código, no autorizado aquí).

Ninguno es un secreto ni un riesgo de ejecución; sí incumple el objetivo de «sin rutas del desarrollador» para una **entrega**. El paquete actual es válido para pruebas internas.

## 7. Procedimiento de prueba en TwoSidesTest (no sobrescribe la partida)

El ejecutable exportado usa **el mismo** almacén de producción que el kit (`%LOCALAPPDATA%\TwoSides\PlayerData`, mismas reglas de propiedad/identidad): **reutiliza y amplía** la partida existente, no la reinicia ni la borra. Restaurar o copiar `PlayerData` invalida la identidad y el juego lo rechaza, por eso no se hace copia de respaldo de esa carpeta. Si se quiere una prueba de «instalación limpia», hace falta otra cuenta estándar (p. ej. `TwoSidesTest2`) creada por el propietario.

Con el juego del kit y cualquier `TwoSides.exe` **cerrados**, en PowerShell estándar de `TwoSidesTest`:
```powershell
# 1. Copiar el paquete (solo lectura del origen) y verificar integridad
robocopy C:\TwoSidesBuild\TwoSides-win64 C:\TwoSidesExportTest\TwoSides-win64 /E
#    Comparar cada hash con C:\TwoSidesBuild\TwoSides-win64.sha256 (formato 'HASH  ruta', UTF-8 con BOM)
Get-Content C:\TwoSidesBuild\TwoSides-win64.sha256 -Encoding UTF8 | % { $h,$p=$_ -split '  ',2; if((Get-FileHash "C:\TwoSidesExportTest\TwoSides-win64\$p").Hash -ne $h){ "DIFERENTE: $p" } }
# 2. Estado ANTES (copia privada de la base; el original no se modifica)
C:\TwoSidesTestKit\Scripts\4-Inspect-Save.ps1 -Snapshot before-export-test
# 3. Ejecutar sin variables de .NET (es autocontenido); no definir DOTNET_ROOT en esta sesión
Remove-Item Env:DOTNET_ROOT -ErrorAction SilentlyContinue
& C:\TwoSidesExportTest\TwoSides-win64\TwoSides.exe       # lo ejecuta el propietario
# 4. Jugar: el progreso previo debe estar; tomar una decisión nueva; cambiar de bioma; cerrar la ventana
# 5. Estado DESPUÉS y comparación
C:\TwoSidesTestKit\Scripts\4-Inspect-Save.ps1 -Snapshot after-export-test
C:\TwoSidesTestKit\Scripts\4-Inspect-Save.ps1 -Compare before-export-test after-export-test   # PERSISTENCE VERDICT: PRESERVED
```
Con el juego abierto: `Get-Process TwoSides | % Modules | ? ModuleName -match 'e_sqlite3|coreclr|hostfxr'` debe listar las DLL **dentro de** `C:\TwoSidesExportTest\...\data_TwoSides_windows_x86_64\` (runtime 8.0.30 propio, no el de otra ubicación), y `Get-NetTCPConnection -OwningProcess <pid>` no debe mostrar conexiones remotas.

Aceptación: abre sin pedir .NET; el progreso/decisiones previas se conservan (`PRESERVED`); sin conexión remota; módulos desde el paquete; `PlayerData` sin archivos extra; SQLite histórica y `PlayerData` de `luis2` intactos. Registro: el exe de lanzamiento no produce consola; si hace falta log, hay que exportar con envoltorio de consola (`debug/export_console_wrapper=2`) o activar el registro en archivo (decisión pendiente).

## 8. Problemas encontrados

1. `backend/` se colaba en el PCK (corregido).
2. Los `.pdb` se copiaban (corregido).
3. Rutas del desarrollador en los ensamblados (abierto, §6).
4. El editor headless no sale solo tras exportar (se cierra manualmente).
5. La exportación reescribe `packages.lock.json` de `src` y `sync-http` (revertido; se repetirá).
6. Metadatos del exe vacíos: `ProductName`, `FileDescription`, `CompanyName` en blanco; `FileVersion/ProductVersion 1.0.0.0`.

## 9. Pendientes antes de entregar

- Quitar las rutas del desarrollador de los binarios (§6, dos cambios de compilación/código) y reexportar.
- Probar el exportado en `TwoSidesTest` (§7) y, ideal, en una cuenta limpia.
- Rellenar metadatos del ejecutable (nombre del producto, versión, empresa, copyright) y decidir la firma de código (el exe y `e_sqlite3.dll` no están firmados; SmartScreen avisará).
- Decidir si se recortan los componentes de depuración del runtime y cómo se distribuye (carpeta/ZIP/instalador; el paquete debe viajar completo: exe + pck + carpeta `data_…`).
- Decidir telemetría/Outbox en producción (B72) y el registro de errores del jugador.
- Revisar licencias de terceros (Godot, .NET, SQLite/SQLitePCLRaw) para el paquete.
- Resolver B00 y las demás tareas abiertas fuera de este alcance.

B74 se detiene aquí. No se ejecutó el juego exportado ni se hizo commit/push.
