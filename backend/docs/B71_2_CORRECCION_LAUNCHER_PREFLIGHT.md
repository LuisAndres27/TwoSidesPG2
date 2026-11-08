# B71.2 — Corrección del falso fallo del preflight en el lanzador

Fecha: 2026-11-04. Estado: **corregido y verificado sin iniciar Godot; `2-Start-Game.ps1` no se ejecutó.**

## 1. Causa confirmada

`2-Start-Game.ps1` (línea 7) hacía `& 1-Preflight.ps1; if($LASTEXITCODE -ne 0){ throw }`. La rama PASS del preflight terminaba **sin `exit`** (`'PREFLIGHT PASSED…'` y fin del script). En PowerShell, `$LASTEXITCODE` solo lo fijan los ejecutables nativos o un `exit N` explícito; al invocar con `&` un script que termina sin `exit`, **`$LASTEXITCODE` no se establece** (queda `$null` o conserva el valor de un comando nativo anterior). Y `$null -ne 0` es `$true`, así que el lanzador lanzaba «Preflight failed.» aunque el preflight hubiera aprobado.

Por eso `powershell -File 1-Preflight.ps1` daba código 0 (el proceso hijo termina con 0) mientras que `&` dentro del lanzador no.

Reproducción aislada (stubs con el mismo final, procesos nuevos de PowerShell):

| Escenario | Resultado |
|---|---|
| `&` + PASS sin `exit` | `BLOCKED: Preflight failed.`, `LASTEXITCODE=$null` (**el defecto**) |
| `&` + PASS con `exit 0` | avanza, `LASTEXITCODE=0` |
| `&` + FAIL (`exit 1`) | bloquea, `LASTEXITCODE=1` |
| `powershell -File` + PASS sin `exit` | código de salida 0 |
| Fallo nativo previo (`cmd /c exit 3`) + `&` PASS sin `exit` | `LASTEXITCODE=3` (valor obsoleto: un riesgo opuesto, aprobar/denegar por un código ajeno) |

El defecto **fallaba cerrado** (bloqueaba de más); no hubo ningún arranque indebido.

## 2. Corrección aplicada (mínima, sin quitar verificaciones)

- `1-Preflight.ps1`: la rama PASS termina con `exit 0` explícito. Ninguna comprobación cambia.
- `2-Start-Game.ps1`: antes de llamar se borra el código (`$global:LASTEXITCODE=$null`); después se exige un código **no nulo y exactamente 0**; cualquier otro caso (nulo, 1, excepción) lanza `Preflight failed (exit code: …)` y bloquea. Así un preflight que no informe código, o un valor obsoleto, ya no puede aprobar ni denegar por azar.
- Archivos ASCII (0 bytes no ASCII). El preflight sigue ejecutándose completo (sin `-ManifestOnly`) desde el lanzador.

## 3. Archivos modificados y nuevos SHA-256

| Archivo (kit `C:\TwoSidesTestKit`) | SHA-256 anterior | SHA-256 nuevo |
|---|---|---|
| `Scripts\1-Preflight.ps1` | `CCAF2E27B3E01270BCDCA1A8A9FAB9256CB5B401E57CCE186F46112DB89724F8` | `4790F580FCFB51C4A8A0032B213615E155D138303AF9C5D5ED6E62A7DC18908A` (4793 B) |
| `Scripts\2-Start-Game.ps1` | `41D20CC091FBF84D…` (hash completo en el respaldo) | `2CA1A9A9E4F643C683AC49862A36BE5B90119DEDD67B701A3482C5B2AC87F1B9` (1463 B) |
| `KIT-MANIFEST.sha256` | `CB7FCC389F4B808159D5D4D1C5C9D4FB9C6D5656DA90AE6CD41A53A016E18F3A` | `3B2157E12598E638B4CDF4B4E8A6C3980E2B4A02ECDB594C1337F6E2B37909B4` (180 819 B) |

Sin cambios: `3-Verify.ps1` (`ED8A9F5C…64AF0`), `9-Cleanup.ps1` (`03160246…37EFB`), Godot, .NET 8, proyecto, assets, DLL. Ningún C# ni escena.

Respaldo previo (fuera del kit): `%LOCALAPPDATA%\TwoSidesClientBackups\pre-B71_2-20261104\` con `1-Preflight.ps1`, `2-Start-Game.ps1` y `KIT-MANIFEST.sha256` anteriores. (Los dos scripts se copiaron tras editar y se reconstruyeron invirtiendo las dos ediciones; sus hashes **coinciden exactamente** con los registrados en el manifiesto anterior.)

## 4. Actualización controlada del manifiesto

1. Con el preflight nuevo sobre el manifiesto anterior: fallan exactamente 2 hashes (`1-Preflight.ps1`, `2-Start-Game.ps1`), nada más.
2. Se generó el manifiesto nuevo (UTF-8 con BOM, mismas exclusiones) en el *scratchpad* y se comparó con el vigente: **2 cambiadas, 0 añadidas, 0 eliminadas; 1335 = 1335 entradas.**
3. Solo con esa condición se reemplazó el manifiesto.
4. Resultado en el kit real: `1-Preflight.ps1 -ManifestOnly` → 8/8 OK, `PREFLIGHT PASSED`, código 0. 1336 archivos en disco (1335 + manifiesto), `Logs\` vacía, 0 archivos SQLite/`.env`/claves/credenciales.

## 5. Pruebas (sin Godot)

Mini-kits desechables con el preflight **real** y una copia de prueba del lanzador **real** (mismo bloque a prueba de fallos; solo cambian la raíz, `-KitRoot/-ManifestOnly` y la cola, que sustituye el arranque por un mensaje). Todos como se esperaba:

| Caso | Esperado | Resultado |
|---|---|---|
| Preflight PASS | avanza | avanza |
| PASS con `LASTEXITCODE=3` previo | avanza | avanza |
| Archivo alterado | bloquea | bloquea («exit code: 1») |
| Archivo extra `save.sqlite3` | bloquea | bloquea |
| Manifiesto ausente | bloquea | bloquea |
| Preflight antiguo (PASS sin `exit`) | bloquea (fail-closed) | bloquea («exit code: »)  |
| Preflight que lanza excepción | bloquea | bloquea |
| Sin `-IUnderstandThisCreatesPlayerData` | bloquea | bloquea |
| Preflight real por `-File`: PASS / FAIL | 0 / 1 | 0 / 1 |

Procesos Godot/dotnet tras las pruebas: 0. Preflight completo desde `luis2`: falla solo en las dos comprobaciones de cuenta (esperado); el juego no se inició.

## 6. Aislamiento e integridad

- Proyecto original y SQLite histórica sin cambios (`9FE793A26068A63C14FC76977FD4661E8C0BB55AC2E6DF69E6E76C45A8D0070C`). `PlayerData` no existe en `luis2`. Sin Atlas, v5, B67, instalaciones, commits ni push.
- Los 1333 archivos restantes conservan los hashes del manifiesto anterior (solo cambiaron 2 entradas).

## 7. Reversión

```powershell
$b="$env:LOCALAPPDATA\TwoSidesClientBackups\pre-B71_2-20261104"
Copy-Item "$b\1-Preflight.ps1","$b\2-Start-Game.ps1" C:\TwoSidesTestKit\Scripts\ -Force
Copy-Item "$b\KIT-MANIFEST.sha256" C:\TwoSidesTestKit\ -Force
```
(Restaura el estado de B71.1, con el falso fallo del lanzador.)

## 8. Reintentar el arranque en TwoSidesTest

El manifiesto sigue siendo válido solo antes del primer arranque. En PowerShell estándar de `TwoSidesTest`:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
C:\TwoSidesTestKit\Scripts\1-Preflight.ps1            # esperar PREFLIGHT PASSED
C:\TwoSidesTestKit\Scripts\2-Start-Game.ps1 -IUnderstandThisCreatesPlayerData
C:\TwoSidesTestKit\Scripts\3-Verify.ps1 -Running      # con el juego abierto
```
Este último paso lo ejecuta el propietario; B71.2 no inició el juego y se detiene aquí.
