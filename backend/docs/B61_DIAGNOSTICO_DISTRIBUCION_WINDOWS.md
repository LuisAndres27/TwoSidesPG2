# B61 — Diagnóstico de distribución para Windows

Fecha: 2026-11-03, Guatemala. **Inspección de solo lectura. No se exportó, compiló, modificó ni ejecutó nada del juego.** Sin Express/Caddy, sin Atlas, sin v5, sin SQLite real, sin credenciales, sin commits ni push; B67 sin tocar.

Archivos revisados: `export_presets.cfg`, `TwoSides.csproj` (y `.old`), `project.godot`, `integration/sqlite/GameSyncHost.cs`, `GamePersistenceContext.cs`, `GamePersistenceAdapter.cs`, `scripts/network/GameApplicationContext.cs` y `ApiConfiguration.cs`, `local-persistence/src/{CopyGameDatabase,OwnedCopyDatabase,SyntheticSandbox}.cs.txt`, `local-persistence/sync-http/SyncWorkerLifecycle.cs.txt`, `TwoSides.runtimeconfig.json` de la compilación de depuración, caché NuGet y plantillas de exportación instaladas. Lo que sigue se distingue entre **hecho** (leído) e **inferencia** (deducido del código, sin ejecutarlo).

## Veredicto

**Hoy no se puede entregar una versión jugable en otro equipo.** Hay un bloqueo de código (la ruta de guardado está fija a la máquina del desarrollador) y varias comprobaciones de exportación aún sin hacer. La sincronización con el backend no es necesaria para una entrega académica funcional: el juego funciona sin ella.

## 1. Estado actual de la exportación

**Hechos**
- Existe un preset `Windows Desktop` en `export_presets.cfg`, **no versionado** (aparece como `??` en git; se perdería con un borrado o un clon).
- Ruta de salida: `../../TWO SIDES DEMO/TwoSides.exe`. El directorio **no existe** y está fuera del repositorio: nunca se ha exportado con este preset.
- Opciones relevantes: x86_64, `export_filter="all_resources"`, `include_filter` y `exclude_filter` vacíos, `embed_pck=false`, `script_export_mode=2` (scripts compilados), `dotnet/include_debug_symbols=true`, `debug/export_console_wrapper=1`, `codesign/enable=false`, `application/modify_resources=true`, metadatos de producto vacíos, icono configurado.
- `embed_pck=false` significa que la entrega son **tres elementos que deben ir juntos**: el `.exe`, el `.pck` y la carpeta `data_TwoSides_windows_x86_64/`.
- Plantillas de exportación `4.6.1.stable.mono` instaladas en `%APPDATA%\Godot\export_templates`.
- No encontré el ejecutable del editor Godot en las ubicaciones habituales (Escritorio, Descargas, Archivos de programa, `LOCALAPPDATA\Programs`); el propietario sabrá dónde está.
- No hay `override.cfg` en el proyecto (está en `.gitignore` por diseño).
- La configuración del editor no define `export/windows/rcedit` (solo `signtool=""`).

**Proyecto .NET**
- `TwoSides.csproj`: SDK `Godot.NET.Sdk/4.6.1`, `net8.0`, referencia a los proyectos `TwoSides.LocalPersistence` y `TwoSides.SyncHttp`, con `Compile Remove` de `local-persistence/**`.
- La compilación de depuración existente (`.godot/mono/temp/bin/Debug`) contiene `Microsoft.Data.Sqlite`, `SQLitePCLRaw.*`, `TwoSides.LocalPersistence.dll`, `TwoSides.SyncHttp.dll` y `runtimes/win-x64/native/e_sqlite3.dll`.
- Solo hay SDK .NET 10.0.400 instalado en el equipo (`dotnet --list-sdks`); el proyecto apunta a `net8.0`. En la caché NuGet están `Microsoft.NETCore.App.Ref 8.0.30`, `Microsoft.NETCore.App.Runtime.win-x64 8.0.30`, `Godot.NET.Sdk 4.6.1` y el host de apps `win-x64`, es decir, los paquetes de un publish autocontenido win-x64 están presentes para exportar sin conexión.
- `TwoSides.csproj` modificado respecto a git; `TwoSides.csproj.old` (sin versionar) conserva una variante con importación de aislamiento de compilación. No afecta a la exportación.

## 2. Dependencias necesarias

| Dependencia | Estado |
|---|---|
| Godot 4.6.1 Mono (editor) + plantillas `4.6.1.stable.mono` | Plantillas presentes; editor, ubicación no verificada |
| SDK .NET para exportar | 10.0.400 presente, paquetes net8.0/win-x64 en caché NuGet |
| Runtime .NET en el equipo del jugador | **Inferencia:** no hace falta instalarlo si la exportación incluye el runtime. Godot 4.x publica los proyectos C# de escritorio autocontenidos dentro de `data_<nombre>_windows_x86_64/`. **No verificado**; se confirma en la exportación de prueba comprobando que esa carpeta contiene `hostfxr.dll`/`coreclr.dll` |
| SQLite nativo (`e_sqlite3.dll`) | Llega vía el paquete `SQLitePCLRaw.bundle_e_sqlite3` (`runtimes/win-x64/native`). **No verificado** en un resultado exportado: confirmar que queda junto a los ensamblados |
| Windows | Windows 10 (1607+) / 11 x64; **sin comprobar en esta fase** salvo que el cifrado DPAPI (`DpapiSyncSecretStore`) es de Windows y funciona en 10 y 11 |
| GPU | `GL Compatibility` (OpenGL); no probado en otro equipo |
| Visual C++ runtime | No verificado |

## 3. Rutas de almacenamiento

**Hecho (bloqueante):** el juego normal abre su base con `new GamePersistenceAdapter(runtime:true)` y la ruta de guardado resuelve a:

```text
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\local-persistence\.work\runtime-game\save.sqlite3
```

- `SyntheticSandbox.AuthorizedProjectRoot` es una **constante** con esa ruta absoluta (`SyntheticSandbox.cs.txt`, línea 11). `CopyGameDatabase.RuntimeDirectory/RuntimePath` y el ancla de seguridad de `OwnedCopyDatabase.LockDirectories()` salen de esa constante.
- La carpeta `.work` está en `.gitignore`; la ruta está dentro de OneDrive.
- **Inferencia:** `LockDirectories()` bloquea primero la raíz aprobada sin crearla y solo crea sufijos bajo ella; en otro equipo (otro usuario o ruta) esa raíz no existe, así que el almacenamiento local fallaría al abrir y el juego quedaría sin guardado. No se ejecutó.
- El modo no-runtime apunta a `%LOCALAPPDATA%\TwoSides\ReconstructionTests\copy-<id>\game-progress`: es una copia de pruebas, no un almacén de jugador. **No existe hoy una ruta de producción.**
- Otro almacén heredado (de una versión anterior) vive en `%APPDATA%\Godot\app_userdata\TwoSides\local-progress\two-sides.sqlite3`; no es el que usa el juego actual.

**Credenciales de sincronización:** con sincronización principal configurada, se guardan protegidas con DPAPI (usuario actual) bajo `user://sync-credentials-main-v2/<hash del origen>` (en Windows, `%APPDATA%\Godot\app_userdata\TwoSides\...`); sin ella no se crea nada. Ubicación correcta para otro equipo.

**Implicación para las partidas del desarrollador:** en el equipo del desarrollador, una compilación exportada usaría la misma base real que el editor (la de la cola de 2151 operaciones). Antes de cualquier prueba exportada conviene decidir qué datos se usan; esta fase no los tocó.

## 4. Configuración del backend y banderas de prueba

**Hechos**
- `GameSyncHost.Bind` lee `two_sides/sync/main_api_url` de `ProjectSettings`. **`project.godot` no define esa clave**: el valor por omisión es `""` y la sincronización queda **desactivada**. Así funciona el juego exportado hoy: totalmente local.
- La configuración principal solo se acepta si es `https` absoluta. Rechaza HTTP.
- Las banderas de prueba (`--two-sides-sync-local-test`, `--two-sides-test-storage=sandbox`, etc.) solo actúan con argumentos explícitos de línea de comandos, y combinaciones ambiguas se rechazan. Un ejecutable lanzado normalmente no las activa; no hay valores de prueba activados por omisión.
- Con la bandera de almacenamiento de pruebas, las credenciales viven solo en memoria.
- La ruta HTTP loopback del cliente antiguo (`ApiConfiguration.DevelopmentUrl`, `InitializeRemoteServices`) existe pero no se invoca al iniciar (`private`, sin llamadas en el flujo normal).

**Cómo se configuraría la URL:** o bien la clave `two_sides/sync/main_api_url` en `project.godot` (queda dentro del `.pck` para todos), o un `override.cfg` junto al ejecutable (por máquina; el repositorio ya lo ignora). Cualquiera exige que el backend tenga un certificado de una autoridad pública: el Caddy local usa una CA de prueba que solo existe en el equipo del propietario. **No hay hoy un backend público de producción verificado**, y la validación final contra Atlas (F3.10) sigue pendiente, el canal de credenciales (B67) está pendiente, la cola histórica supera la cuota de 1000 (B53/B54) y B00/v5 no están cerrados.

**Ausencia de secretos:** no se encontró ninguna ruta absoluta del desarrollador en escenas, `project.godot` ni scripts del juego (solo en la constante de `SyntheticSandbox`); ninguna contraseña ni URI de Atlas en el juego. Con `export_filter="all_resources"` los archivos que no son recursos (`.env`, `.sqlite3`, `.md`, `.mjs`, `.ps1`) no se incluyen, **pero no se verificó con una exportación real**.

## 5. Riesgos para las partidas locales y la Outbox

1. **Riesgo de ruta (bloqueante):** ver §3. Cualquier solución debe conservar las garantías actuales (guardia de directorios, bloqueo de instancia única `store.lease`, manifiesto de propiedad) y no abrir nunca el almacén real del desarrollador por accidente.
2. **Instancia única:** el bloqueo por rango de bytes (`store.lease`) impide abrir la misma base a la vez desde el editor y desde un exportado en el mismo equipo.
3. **OneDrive:** el almacén actual está dentro de una carpeta sincronizada; archivos SQLite con journal en carpetas sincronizadas pueden provocar bloqueos. Es una hipótesis (B52 ya analizó un `ACCESS_DENIED` transitorio), no un hecho. Un almacén de producción debe estar fuera de OneDrive.
4. **Esquema:** el esquema de la Outbox está protegido por suma de verificación; cualquier cambio de ruta no debe tocarlo.
5. **Sincronización desactivada:** los eventos se siguen registrando localmente en la Outbox y se acumulan sin enviar. Con la cuota actual de 1000 por propietario y B54, un jugador con mucho tiempo de juego llegaría al tope al sincronizar; no afecta a una entrega sin sincronización.
6. **Cierre:** el juego espera a detener la sincronización antes de cerrar la base (`BeforeStorageClose`); relevante para "cerrar y reabrir".

## 6. Pendientes clasificados

### Bloqueantes
| # | Pendiente | Por qué |
|---|---|---|
| B1 | **Ruta de guardado de producción** | La ruta fija es la del desarrollador; en otro equipo el guardado local no abre (inferencia por código). Requiere un cambio de código autorizado: raíz configurable hacia el directorio de datos del usuario (por ejemplo, la carpeta de datos de Godot o `%LOCALAPPDATA%\TwoSides`), sin OneDrive, conservando las comprobaciones de seguridad |
| B2 | **Exportación de prueba aún no realizada** | Nadie ha comprobado que el preset exporta, que el runtime .NET y `e_sqlite3.dll` quedan en la carpeta `data_*`, ni que el resultado arranca sin el editor |
| B3 | **Prueba en un perfil limpio de Windows** (otro usuario o equipo) | Es la única forma de confirmar B1/B2: primer arranque, perfil nuevo, guardado y reapertura |

### Recomendables
| # | Pendiente | Motivo |
|---|---|---|
| R1 | Versionar `export_presets.cfg` | Hoy sin versionar |
| R2 | `exclude_filter` (`backend/*`, `docs/*`, `local-persistence/*`, `integration/*`) o `.gdignore` | `backend/` pesa 166 MB (la mayor parte `node_modules`); solo `local-persistence` tiene `.gdignore`. Evita empaquetar o escanear el backend |
| R3 | Resolver `application/modify_resources` | `rcedit` no está configurado; puede fallar o avisar. Poner `false` evita la dependencia (se pierde solo el icono/metadatos del `.exe`), o configurar rcedit |
| R4 | Cuidar el nombre/ruta de exportación y limpiar los datos de depuración | `include_debug_symbols=true`, envoltura de consola `=1` (útil para diagnosticar; innecesaria en la entrega final) |
| R5 | Rellenar nombre de producto/versión | Metadatos vacíos |
| R6 | Instrucciones para el jugador (qué hace el juego sin red, dónde guarda) | Entrega académica |
| R7 | Limpiar archivos sueltos: `PlayerOso - copia.cs.uid`, `TwoSides.csproj.old`, carpeta `NVIDIA Corporation/umdlogs` en la raíz | Higiene; no bloquea |
| R8 | Decidir qué se hace con la base real del desarrollador (2151 operaciones) al probar el exportado en ese mismo equipo | Evitar mezclarla con pruebas |

### Opcionales (se pueden posponer)
Firma de código; instalador; icono/metadatos pulidos; empaquetar en un único archivo (`embed_pck=true`); configurar la sincronización con un backend público; completar F3.10, B00, v5 y el canal de credenciales; compactación o aumento de cuota de la cola histórica (B53); revisión del cuadro de ajustes gráficos para equipos modestos.

## 7. Procedimiento mínimo para una versión Windows jugable

Elegido por simplicidad para entrega académica: **versión local, sin sincronización** (es lo que el juego hace por defecto).

1. **Autorizar B1:** una raíz de guardado de producción en el directorio de datos del usuario, fuera de OneDrive, con las mismas comprobaciones de la capa actual. Conservar el comportamiento de desarrollo para las pruebas existentes. Cubrir con las suites de guardado ya existentes (`GameSave.Checks`, biblioteca SQLite, infraestructura) y una prueba de primer arranque en un directorio nuevo.
2. **Preparar el preset (R1–R5):** versionar `export_presets.cfg`, añadir filtros de exclusión, resolver `modify_resources`, ruta de salida dentro de una carpeta de entrega, nombre y versión.
3. **Exportar en Release** desde el editor con la plantilla mono 4.6.1 (o desde línea de comandos con el mismo preset).
4. **Inspeccionar el resultado** sin ejecutarlo: contiene `.exe`, `.pck` y `data_TwoSides_windows_x86_64/`; en esa carpeta están `TwoSides.dll`, `Microsoft.Data.Sqlite.dll`, `SQLitePCLRaw.*`, `e_sqlite3.dll` y los archivos del runtime (`hostfxr.dll`/`coreclr.dll`); **no** hay `.env`, `.sqlite*`, `backend`, `docs`, `local-persistence`.
5. **Probar en un perfil limpio de Windows** (otro usuario, VM o equipo) sin Godot ni .NET instalados.
6. **Entregar** la carpeta completa (`.exe` + `.pck` + `data_*`) en un zip, con instrucciones breves.

## 8. Pruebas de aceptación sugeridas

1. Arranca desde el `.exe` sin el editor, sin .NET ni Godot instalados.
2. Primer arranque: crea el perfil y la base en la ruta de producción (fuera del proyecto y de OneDrive); no aparece ningún archivo en la carpeta del juego.
3. Jugar un nivel hasta una decisión; cerrar; reabrir: el perfil y el progreso persisten.
4. Cierre durante la sincronización desactivada y con el juego en pausa: la base no queda en estado inconsistente (`quick_check`).
5. Sin red y sin configuración de backend: no hay errores visibles ni intentos de conexión; el juego es plenamente utilizable.
6. Con las banderas de prueba ausentes: ninguna modalidad de prueba activa.
7. Dos instancias a la vez: la segunda se rechaza limpiamente (bloqueo de instancia única).
8. Ningún secreto ni archivo de desarrollo en el paquete (listado del contenido).
9. Equipo con otro idioma y nombre de usuario con espacios o acentos (la ruta del usuario del desarrollador ya contiene espacios en las carpetas del proyecto, no en `LOCALAPPDATA`).

## 9. Recomendación

Para la entrega académica: **versión local sin sincronización**, con B1 corregido, un preset ordenado y una prueba limpia. Es la que reduce el riesgo. Dejar la sincronización con backend público, Atlas, v5 y el canal B67 como trabajo posterior, documentado como arquitectura ya implementada y probada en pruebas, sin exigirla al jugador.

No se inició ninguna implementación. Cualquier cambio (B1 y el preset) requiere autorización por separado.
