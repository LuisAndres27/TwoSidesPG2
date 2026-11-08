# B73.1 — Corrección del paso de parámetros del segundo arranque

Fecha: 2026-11-04. Estado: **corregido y verificado con copias desechables; Godot no se inició, el segundo arranque no se ejecutó y no se tocó ningún `PlayerData` ni SQLite.**

## 1. Causa confirmada

`2-Start-Game.ps1` llamaba al preflight así: `$pfArgs=@(); if($SecondRun){ $pfArgs+='-SecondRun' }; & 1-Preflight.ps1 @pfArgs`.

Un **array** de cadenas se expande como argumentos **posicionales**, no con nombre: PowerShell pasó la *cadena* `-SecondRun` al primer parámetro posicional del preflight, que era `-KitRoot`. Resultado: `KitRoot = "-SecondRun"`, que se resolvió contra el directorio de trabajo (`C:\WINDOWS\system32\-SecondRun\Project\project.godot`) y por eso fallaron Godot, GodotSharp, hostfxr, coreclr, `TwoSides.dll` y `e_sqlite3.dll`; además `SecondRun` quedó en `False`.

Reproducido antes de modificar (parámetro `param([string]$KitRoot='DEFAULT',[switch]$SecondRun…)` con `@('-SecondRun')`): `KitRoot=[-SecondRun] SecondRun=[False] Bound=[KitRoot]`; con un hashtable `@{SecondRun=$true}`: `KitRoot=[DEFAULT] SecondRun=[True]`. Por qué no lo detectaron las pruebas de B73: las copias de prueba del lanzador añadían `-KitRoot $K -StoreOnly …` con nombre *después* de `@pfArgs`, lo que dejaba a `-KitRoot` ya enlazado y ocultaba el enlace posicional erróneo.

No había conflicto con `KitRoot` como tal: su valor por defecto `C:\TwoSidesTestKit` era correcto; fue sobrescrito por el argumento posicional.

## 2. Corrección mínima

| Archivo | Cambio |
|---|---|
| `Scripts\2-Start-Game.ps1` | `$pfArgs=@{}; if($SecondRun){ $pfArgs['SecondRun']=$true }` — un **hashtable** (splatting con nombres) en lugar de un array. Nada más |
| `Scripts\1-Preflight.ps1` | `[CmdletBinding(PositionalBinding=$false)]` (ningún argumento puede enlazarse por posición: un token suelto da error) y un guardia: sin los interruptores solo-prueba `-ManifestOnly/-StoreOnly`, `-KitRoot` debe ser `C:\TwoSidesTestKit` |

Las dos adiciones al preflight son endurecimientos: **no se eliminó ni relajó ninguna verificación** (integridad del kit, cuenta `TwoSidesTest`, `ownership.json`, identidad del archivo, cabecera SQLite, rechazo de bases/rutas ajenas, separación primer/segundo arranque, confirmaciones). Sin cambios en el juego, escenas, Godot, .NET, la herramienta de inspección ni los assets.

## 3. Pruebas (copias desechables; 17 nuevas + 62 de B73 repetidas: 79/79)

**Enlace de parámetros, a través del texto real del lanzador** (copia con solo `$K` cambiado y el arranque de Godot cortado; el preflight es un *stub* que usa **el bloque `param` real** e imprime lo enlazado):

| Prueba | Resultado |
|---|---|
| Lanzador **B73 anterior**: evidencia de regresión | `KitRoot=[-SecondRun]`, `SecondRun=[False]` (el defecto reproducido) |
| Lanzador corregido, `-SecondRun`: `-SecondRun` llega como interruptor con nombre | `SecondRun=[True]`, `Bound=[SecondRun]` |
| `KitRoot` conserva `C:\TwoSidesTestKit` | sí |
| Primer arranque conserva su comportamiento | `SecondRun=[False]`, nada enlazado, `KitRoot` por defecto, avanza |
| Sin confirmación / ambas confirmaciones / confirmación cruzada / sin interruptores | las 4 combinaciones **bloquean** |

**Preflight real:**

| Prueba | Resultado |
|---|---|
| Cadena suelta `"-SecondRun"` (modo anterior) | **rechazada** («no se encuentra ningún parámetro de posición…») en vez de convertirse en la ruta del kit |
| Cualquier argumento posicional (`'C:\Elsewhere'`) | rechazado |
| `-KitRoot` ajeno sin interruptores de prueba | rechazado (`KitRoot must be C:\TwoSidesTestKit`) |
| Splatting con hashtable desde `luis2`, `KitRoot` por defecto | Godot, GodotSharp, hostfxr, coreclr, `TwoSides.dll`, `e_sqlite3.dll` **encontrados**; manifiesto OK; solo fallan las 3 comprobaciones legítimas de `luis2`: cuenta, LocalAppData y «PlayerData directory exists» (no es `TwoSidesTest`) |
| `-ManifestOnly` sobre el kit real | `PREFLIGHT PASSED` |

**Suite de B73 (62) repetida contra los scripts corregidos:** 62/62 — segundo arranque legítimo supera el preflight y el lanzador (línea base escrita); base copiada, propósito/id/`Ready` incorrectos, `ownership.json` inválido o enorme, archivo/subcarpeta extra, base vacía/no SQLite/`application_id`/versión ajenos, ruta `runtime-game`, directorio ausente: **rechazados**; manifiesto alterado o archivo extra del kit: **bloquea el lanzador**; `PlayerData` sin modificar (hashes, fechas, sin archivos nuevos); el inspector rechaza la ruta histórica.

Aislamiento: SQLite histórica `9FE793A2…8D0070C` sin cambios; `PlayerData` de `luis2` no existe; sin procesos Godot; laboratorios `TwoSidesTests\B73` eliminados.

## 4. Archivos modificados y nuevos hashes del kit

| Archivo | SHA-256 anterior (B73) | SHA-256 nuevo |
|---|---|---|
| `Scripts\1-Preflight.ps1` (11 080 B) | `F7CC91AF624B2F837AFD8FA85B3BD0D1D9B5129CFF1F3B03EBCAF8DBF4110E94` | `1429E222962BED11A2873802EEF9BF6FE1D2CBE7B3D7075FA24D1856F9A53465` |
| `Scripts\2-Start-Game.ps1` (2 974 B) | `2F0ADF742E6C50C82A6A05853244E7432681B62BD1DC5F51037BBA48BD30DBBD` | `E51080F8EA43DA0253D04B8F9561609CDCDF164F3BCEEF2C821E376B94D4AA0E` |
| `KIT-MANIFEST.sha256` (1528 entradas) | `3D89B167A996F148A22572B227D8B7F01BF411DC1172AFDDDF149B0A3BCEF507` | `4B31A1FEE94B19031C68319BC6AEB99EC74E0BE31421FDAAF3B0284EB9CD1DB8` |

Manifiesto actualizado con el procedimiento controlado: comparado con el vigente → **2 cambiadas** (esos dos scripts), 0 añadidas, 0 eliminadas, 1528 = 1528; solo entonces se reemplazó. Los 1526 archivos restantes (incluida la herramienta `Tools\SaveInspector` y `3-Verify.ps1`, `4-Inspect-Save.ps1`, `9-Cleanup.ps1`) conservan sus hashes. Ambos scripts son ASCII. Respaldo anterior: `%LOCALAPPDATA%\TwoSidesClientBackups\pre-B73_1-20261104\` (scripts y manifiesto de B73, hashes coinciden con los documentados en B73).

## 5. Hallazgo adicional: el inspector ya funcionó en el almacén real

`Logs\snapshot-before-2nd-run.json` (generado por el propietario con `4-Inspect-Save.ps1`; anónimo por diseño) muestra, antes del segundo arranque: `quick_check=ok`, 0 violaciones de claves foráneas, `application_id 0x54535044`, `user_version 2`, `SourceUnchanged=true`, sin archivos auxiliares; 1 perfil `LOCAL_ONLY`; 1 partida `in_progress`, revisión 3, `resume=menu`; 5 biomas (`ocean`: **completed / good**; desert, forest, jungle, tundra: `human_pending`); **1 decisión guardada** (`ocean/ocean_waste_disposal`, `reject`, `healthy`, orden 1) y su entorno `healthy`; operaciones `create_profile, new_game, enter_biome, decision, complete_biome` = 1 cada una; 1 *snapshot* de continuación (revisión 3). Es decir, **la decisión del Delfín sí quedó guardada** y el almacén real supera la validación del inspector (propiedad, identidad y cabecera). Tablas `sync_*`/`gameplay_*`: ausentes (esperado).

## 6. Procedimiento seguro de nuevo intento (propietario, en `TwoSidesTest`, juego cerrado)

```powershell
Set-ExecutionPolicy -Scope Process Bypass
C:\TwoSidesTestKit\Scripts\1-Preflight.ps1 -SecondRun        # debe terminar con PREFLIGHT PASSED (sin lanzar el juego)
# (ya existe snapshot-before-2nd-run; si hubo juego desde entonces, repetirlo:)
# C:\TwoSidesTestKit\Scripts\4-Inspect-Save.ps1 -Snapshot before-2nd-run
C:\TwoSidesTestKit\Scripts\2-Start-Game.ps1 -SecondRun -IUnderstandThisUsesExistingPlayerData
# jugar: comprobar que el progreso sigue, tomar una decisión nueva en otro nivel, entrar a otro bioma, volver al menú y cerrar la ventana
C:\TwoSidesTestKit\Scripts\4-Inspect-Save.ps1 -Snapshot after-2nd-run
C:\TwoSidesTestKit\Scripts\4-Inspect-Save.ps1 -Compare before-2nd-run after-2nd-run   # esperado: PERSISTENCE VERDICT: PRESERVED
```
Si el preflight falla en `TwoSidesTest`, **copiar el texto de las líneas `[FAIL]`** y no borrar ni tocar `PlayerData`. Reversión: copiar de `pre-B73_1-20261104\` los dos scripts y el manifiesto al kit (restaura el estado de B73, con el defecto de parámetros).

## 7. Riesgos restantes

- Aún no se ha ejecutado el preflight `-SecondRun` completo **en `TwoSidesTest`**; desde `luis2` solo se prueba que el enlace y las comprobaciones del kit son correctos y que las únicas fallas son las propias de la cuenta.
- Las advertencias de Outbox/telemetría (B72) continúan esperadas.

B73.1 se detiene aquí; el segundo arranque lo ejecuta el propietario.
