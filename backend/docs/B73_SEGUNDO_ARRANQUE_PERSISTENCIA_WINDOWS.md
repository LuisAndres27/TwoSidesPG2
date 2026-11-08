# B73 — Segundo arranque seguro e inspección de la persistencia (Windows)

Fecha: 2026-11-04. Estado: **preparado y validado con almacenes sintéticos (62/62 pruebas); el juego no se inició y el `PlayerData` de `TwoSidesTest` no se tocó** (ni se pudo leer desde `luis2`). El segundo arranque lo ejecuta el propietario.

## 1. Por qué el preflight rechazaba `PlayerData`

El preflight de B71.2 exigía «PlayerData does not exist yet» (pensado para el primer arranque). El **juego** ya valida un almacén existente al abrirlo (`OwnedCopyDatabase.Initialize`: manifiesto, identidad del archivo, `application_id`, historial de migraciones, `quick_check`, claves foráneas); el único bloqueo era el preflight. Ahora hay dos modos y el primero se conserva intacto.

## 2. Cambios realizados

| Archivo (kit `C:\TwoSidesTestKit`) | Cambio |
|---|---|
| `Scripts\1-Preflight.ps1` | Nuevo `-SecondRun`: exige que `PlayerData` exista y sea el almacén legítimo (§3). Sin el interruptor, el modo de primer arranque sigue exigiendo que no exista (el mensaje ahora indica `-SecondRun`, «nunca borrar»). Parámetros solo-prueba: `-StoreOnly`, `-PlayerDataDirOverride`, `-ManifestOnly`, `-KitRoot` (el lanzador no los usa). Verificación del manifiesto, exit 0/1 y ASCII sin cambios |
| `Scripts\2-Start-Game.ps1` | Nuevos `-SecondRun` + `-IUnderstandThisUsesExistingPlayerData` (confirmaciones mutuamente excluyentes con `-IUnderstandThisCreatesPlayerData`). Mantiene el control fail-closed del código de salida. En segundo arranque escribe una **línea base** (SHA-256, tamaño, nombre de cada archivo) en `Logs\second-run-baseline-*.txt` antes de lanzar |
| `Scripts\4-Inspect-Save.ps1` (nuevo) | Envoltorio de la herramienta de lectura: solo en `TwoSidesTest`, con el juego cerrado; `-Snapshot <nombre>` y `-Compare <antes> <después>` |
| `Tools\SaveInspector\` (nuevo, 192 archivos, 73 MB) | Herramienta de inspección autocontenida win-x64 (no depende de `DOTNET_ROOT`) |
| `KIT-MANIFEST.sha256` | Actualizado con procedimiento controlado (§9) |

Repositorio (solo herramientas/pruebas, sin código del juego, escenas, reglas ni assets):

| Archivo | Cambio |
|---|---|
| `local-persistence/save-inspector/SaveInspector.csproj`, `Program.cs.txt`, `packages.lock.json` | Herramienta de lectura (nueva) |
| `local-persistence/production-storage-tests/SyntheticStoreMaker.cs.txt` (nuevo) y `Program.cs.txt` (+1 ramal) | Generador de almacenes sintéticos con el **código real** de producción, solo en raíces `…\TwoSidesTests\…` (rechaza el LocalAppData real) |

Respaldo previo: `%LOCALAPPDATA%\TwoSidesClientBackups\pre-B73-20261104\` (scripts y manifiesto del kit; `Program.cs.txt` original reconstruido, hash `3969F55B…` = el documentado en B68).

## 3. Protección del guardado existente (`-SecondRun`)

El preflight **solo lee** (nunca crea, repara, migra, sobrescribe ni borra). Rechaza si:

- la ruta no es exactamente `<LocalAppData>\TwoSides\PlayerData`, contiene OneDrive, `runtime-game` o `.work`, o es un enlace;
- hay algún archivo/carpeta distinto de `save.sqlite3`, `ownership.json`, `store.lease` y sus `-journal/-wal/-shm`; faltan `store.lease`, `ownership.json` (≤1024 B) o `save.sqlite3`;
- `ownership.json` no es JSON válido o no cumple `Format=1`, `Copy=two-sides-player-save-v1`, `Purpose=player-production-save`, `Ready=true`;
- la **identidad del archivo** (`volumen:índice`, mismo cálculo que el juego vía `GetFileInformationByHandle`) no coincide con la del manifiesto (detecta bases copiadas/sustituidas);
- `save.sqlite3` no es un archivo normal de 4 KB–256 MB, su cabecera no es SQLite, `application_id ≠ 0x54535044` o `user_version ≠ 2`;
- hay un proceso Godot en ejecución, o falla cualquier comprobación de cuenta/perfil/kit del modo normal;
- falla la integridad del kit (manifiesto: BOM, líneas, rutas, duplicados, nº de entradas, ausentes, **adicionales**, hashes).

Un `-journal/-wal` no vacío solo **avisa** (`[WARN]`): lo recupera el propio juego. Tras el arranque, la defensa completa (migraciones, `quick_check`, claves foráneas, lease) la aplica el código del juego.

## 4. Herramienta de lectura (`SaveInspector`)

- **Garantías:** no abre el original con SQLite. Valida el almacén igual que el preflight (más identidad), lo **copia** a una carpeta temporal privada (`%TEMP%\TwoSidesInspect-<guid>`, borrada al terminar) y consulta la copia con `Mode=ReadOnly` + `query_only`. Calcula el SHA-256 del original antes y después (`source unchanged`). Rechaza rutas que no sean `…\TwoSides\PlayerData\save.sqlite3`, `runtime-game`, `.work`, OneDrive, otros nombres, archivos desconocidos, ownership distinto, snapshots dentro del almacén.
- **Privacidad:** no imprime ni guarda el nombre (solo su longitud) ni identificadores: los ids son etiquetas de 8 hex del SHA-256.
- **Qué muestra:** integridad (`quick_check`, claves foráneas), migraciones, tablas con su nº de filas, presencia de tablas `sync_*`/`gameplay_*`, perfil, partidas (estado, revisión, tipo de reanudación, bioma, final, reglas), progreso por bioma, **decisiones** (orden, bioma, clave, opción `reject/approve`, estado `healthy/degraded`), entornos, operaciones por tipo, ajustes y *snapshots* de continuación, y la línea `dolphin (ocean) decision saved: True/False`.
- **Tablas relevantes del esquema** (`SchemaManager`, v2): `local_profiles`, `saved_games` (incluye `ending` = finales), `biome_progress`, `environmental_decisions`, `environmental_state`, `biome_objectives`, `continuation_snapshots`, `local_operations`, `local_settings`, `schema_migrations`.
- **Comparación** (`compare antes.json después.json`, salida 0/4): perfil igual; partidas sin desaparecer ni bajar de revisión; **cada decisión previa idéntica**; biomas sin retroceder; operaciones sin disminuir; integridad correcta. Veredicto `PERSISTENCE VERDICT: PRESERVED` o `ISSUES (n)`.
- **Limitaciones del esquema:** el bioma del Delfín es `ocean` (no hay etiqueta «delfín»); no hay tablas de Outbox ni de eventos/telemetría (B68/B72), por lo que no hay tiempo jugado ni estadísticas de eventos; los finales solo existen como `saved_games.ending`; el estado de un bioma no distingue entre «nunca visitado» y «sin decisión» salvo por la fila de `biome_progress`.

## 5. Resultados de las pruebas (62/62, almacenes sintéticos con el código real)

Raíces desechables en `%LOCALAPPDATA%\TwoSidesTests\B73\<guid>\…` de `luis2` (distintas de `TwoSides\PlayerData`), eliminadas al terminar (carpeta B73 incluida). Además, `ProductionStorage.Checks`: **65/65** (sin regresión tras la ampliación). Compilaciones: 0 advertencias (`TreatWarningsAsErrors`).

| Bloque | Pruebas |
|---|---|
| Almacén sintético legítimo | creado por el código de producción: exactamente `ownership.json, save.sqlite3, store.lease`; el generador rechaza el LocalAppData real |
| Preflight `-SecondRun` (aceptación) | PASS en almacén legítimo, comprobando identidad, propósito, cabecera y versión; no modifica nada (hashes iguales); sigue aceptando tras un segundo arranque |
| Preflight (rechazos, 16) | base copiada (identidad distinta), propósito `copy-runtime-game`, id de almacén ajeno, `Ready=false`, JSON inválido, sin `ownership.json`, `ownership.json` enorme, archivo extra, subcarpeta, sin base, base vacía, contenido no SQLite, `application_id` ajeno, `user_version` no soportado, ruta con `runtime-game`, directorio ausente. `-journal` no vacío solo avisa |
| Inspector (lectura) | exit 0; integridad ok; decisión `ocean/ocean_waste_disposal reject healthy` hallada; progreso, perfil y límites (sin Outbox/eventos) reportados; salida y JSON sin nombre ni ids crudos; original sin cambios (hash, fecha, sin archivos nuevos); sin copia temporal residual |
| Segundo arranque simulado | se reabre el **mismo** almacén con el código real y se añade una decisión (`jungle`); 2 decisiones; `compare` → **PRESERVED** (1 → 2, la primera idéntica); `compare` invertido → `ISSUE: decision … missing`; una decisión borrada en el JSON (reinicio) → `ISSUE` |
| Inspector (rechazos, 9) | **ruta histórica**, base copiada, ownership distinto, archivo extra, `runtime-game`, otro nombre de archivo, ruta relativa, snapshot dentro del almacén, almacén ausente |
| Lanzador (copias de prueba sin arranque) | `-SecondRun` con almacén legítimo **avanza** y escribe línea base (3 archivos, SHA-256, tamaño); sin confirmación, ambas confirmaciones, confirmación cruzada y sin interruptores: **bloquea**; almacén sospechoso: **bloquea y no escribe línea base**; manifiesto modificado o archivo extra del kit: **bloquea** |
| Aislamiento | SQLite histórica `9FE793A2…8D0070C` sin cambios (el inspector la rechaza con `NOT_PRODUCTION_PATH`); `PlayerData` de `luis2` no existe; sin procesos Godot |

Cobertura que **no** tiene prueba automática: la comprobación «PlayerData ausente» del primer arranque se verificó solo por inspección del texto (desde `luis2` fallan antes las comprobaciones de cuenta); y nada se probó contra el almacén real de `TwoSidesTest`.

## 6. Nuevos hashes

| Archivo | SHA-256 |
|---|---|
| `KIT-MANIFEST.sha256` (1528 entradas, antes 1335) | `3D89B167A996F148A22572B227D8B7F01BF411DC1172AFDDDF149B0A3BCEF507` |
| `Scripts\1-Preflight.ps1` (antes `4790F580…8908A`) | `F7CC91AF624B2F837AFD8FA85B3BD0D1D9B5129CFF1F3B03EBCAF8DBF4110E94` |
| `Scripts\2-Start-Game.ps1` (antes `2CA1A9A9…F1B9`) | `2F0ADF742E6C50C82A6A05853244E7432681B62BD1DC5F51037BBA48BD30DBBD` |
| `Scripts\4-Inspect-Save.ps1` (nuevo) | `D4CB2A70D4956B680A50041DC70C4FF26EF0E653CECC96D184FA4B60143C4970` |
| `Tools\SaveInspector\SaveInspector.exe` / `.dll` | `788B08C4F6A90D751F723FD34C649A01197A1E4313C150DF9D125B710E162B97` / `CF75F5DC66B0E186047C7CCDCE2EB6D16D1C3A723CB4086D6A656BAB2B871DC8` |
| `local-persistence/save-inspector/Program.cs.txt` | `9CB4FF09186A1EDD1E3AC66AD40D8EEC6857D0F9D5786D33D0F0BDD3BC37D706` |
| `local-persistence/save-inspector/SaveInspector.csproj` | `AAC237E60165B1DD82F8DD659A8E2344F8CEB2F462F10B92B6D8A521DA2D3D0C` |
| `local-persistence/save-inspector/packages.lock.json` | `7ADA2416F858670A80C19413634BB98BAC63FD455B6A2326071484C466CFF220` |
| `production-storage-tests/Program.cs.txt` (antes `3969F55B…`) | `D20C3096AE262C809598C5A31327FC44B82AD66436634AE2E7CD435760914B5B` |
| `production-storage-tests/SyntheticStoreMaker.cs.txt` | `658AD280A6DA92D856DB12B2C39F6E7C1EF69EB6FDCF04B53FF089C9CF8FA51C` |

## 7. Comandos manuales para el segundo arranque (los ejecuta el propietario en TwoSidesTest)

Con el juego **cerrado**, en PowerShell estándar de `TwoSidesTest`:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
# 1. Estado ANTES (no abre el juego; copia privada de la base)
C:\TwoSidesTestKit\Scripts\4-Inspect-Save.ps1 -Snapshot before-2nd-run
#    Esperado: quick_check=ok, "dolphin (ocean) decision saved: True" si la decisión del Delfín quedó guardada, source unchanged: True
# 2. Comprobar el kit y el almacén (opcional; el lanzador lo repite)
C:\TwoSidesTestKit\Scripts\1-Preflight.ps1 -SecondRun        # PREFLIGHT PASSED
# 3. Segundo arranque
C:\TwoSidesTestKit\Scripts\2-Start-Game.ps1 -SecondRun -IUnderstandThisUsesExistingPlayerData
# 4. Con el juego abierto
C:\TwoSidesTestKit\Scripts\3-Verify.ps1 -Running
```
En el juego: comprobar que el progreso previo se conserva (menú de niveles / continuar), tomar **una decisión nueva en otro nivel**, entrar a **otro bioma distinto** del Mar, volver al menú y cerrar con la ventana. Después:
```powershell
# 5. Estado DESPUÉS y comparación
C:\TwoSidesTestKit\Scripts\4-Inspect-Save.ps1 -Snapshot after-2nd-run
C:\TwoSidesTestKit\Scripts\4-Inspect-Save.ps1 -Compare before-2nd-run after-2nd-run   # PERSISTENCE VERDICT: PRESERVED
C:\TwoSidesTestKit\Scripts\3-Verify.ps1
```
Un tercer arranque repite los pasos 1–5 con `before-3rd-run` / `after-3rd-run`.

## 8. Criterios de aceptación del segundo arranque

El preflight pasa; el juego abre sin excepciones ni `UNKNOWN_DATABASE`/`STORE_LOCKED`; `compare` da `PRESERVED`; la decisión del Delfín sigue idéntica (opción, estado, orden, etiqueta); aparecen las decisiones/biomas nuevos; `quick_check=ok`; sin conexiones remotas; `SourceUnchanged` verdadero; SQLite histórica y `PlayerData` de `luis2` sin cambios. Las advertencias `OUTBOX_NOT_ACTIVATED`/`TELEMETRY_*` siguen siendo esperables (B72).

## 9. Procedimiento controlado del manifiesto

Se generó el manifiesto nuevo en el *scratchpad* y se comparó con el vigente: **2 cambiadas** (`1-Preflight.ps1`, `2-Start-Game.ps1`), **193 añadidas** (192 de `Tools\SaveInspector\` + `Scripts\4-Inspect-Save.ps1`), **0 eliminadas**. Solo con esa condición exacta se reemplazó. Resultado: `1-Preflight.ps1 -ManifestOnly` → `PREFLIGHT PASSED`. Los 1333 archivos previos conservan sus hashes. `Logs\` (evidencia de la primera ejecución) intacta. Sin SQLite/`.env`/claves en `Tools\`.

## 10. Verificación y reversión

- Verificación: §7–§8 y `1-Preflight.ps1`.
- Reversión del kit: copiar de `pre-B73-20261104\` los scripts `1-Preflight.ps1`, `2-Start-Game.ps1`, `3-Verify.ps1`, `9-Cleanup.ps1` y `KIT-MANIFEST.sha256` a sus rutas, y borrar `C:\TwoSidesTestKit\Tools` y `Scripts\4-Inspect-Save.ps1` (estado de B71.2; el primer arranque seguiría funcionando, el segundo quedaría bloqueado por el preflight antiguo).
- Reversión del repositorio: restaurar `production-storage-tests\Program.cs.txt` desde el respaldo y eliminar `SyntheticStoreMaker.cs.txt` y `local-persistence\save-inspector\`.

## 11. Riesgos restantes

- Las comprobaciones del preflight/herramienta se validaron con almacenes sintéticos del mismo código; el almacén real de `TwoSidesTest` (creado por el juego) debería cumplirlas, pero **no se leyó** desde `luis2`. Si el preflight o el inspector lo rechazan, es una señal a investigar (no a «arreglar» borrando).
- La identidad del archivo depende del volumen/índice NTFS; mover o copiar `PlayerData` (p. ej. restaurar un respaldo) la invalida a propósito.
- El inspector deja durante unos segundos una copia de la base en `%TEMP%` de `TwoSidesTest` (se borra en `finally`; si se mata el proceso podría quedar un `TwoSidesInspect-*`).
- Sigue sin existir Outbox/telemetría en producción (decisión de producto pendiente, B72-B).
- El manifiesto del kit no cubre `Logs\`.

B73 se detiene aquí. No se ejecutó el segundo arranque ni se inició el juego.
