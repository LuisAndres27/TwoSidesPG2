# B71.1 — Corrección del manifiesto de integridad del kit

Fecha: 2026-11-03. Estado: **corregido y verificado; el juego no se inició** (ni `2-Start-Game.ps1`).

## 1. Causa confirmada

`KIT-MANIFEST.sha256` se generó en B71 con `Set-Content -Encoding ascii`, que sustituye `Ñ` (U+00D1) por `?`. Los hashes eran correctos; solo las rutas de **28 archivos** (14 nombres con `Ñ` × su archivo original/importado: `…DAÑO.png`, `HIELO FLOTANTE PEQUEÑO.png` y sus `.import`, `.ctex`, `.md5`) quedaron dañadas, de modo que el preflight los daba por «ausentes». Reproducido en `luis2`: 28 ausentes, 0 hashes distintos. Los otros 1307 coincidían.

## 2. Archivos modificados

Solo dos, ambos en el kit; nada del juego, Godot, .NET, assets, código C#, escenas ni proyecto original:

| Archivo | SHA-256 anterior | SHA-256 nuevo | Tamaño |
|---|---|---|---|
| `C:\TwoSidesTestKit\KIT-MANIFEST.sha256` | `A1078348011E5CD1BF6DE4ACF5C7840EBF7CF4A0E44FA3AA5BC388BD1943FD55` | **`CB7FCC389F4B808159D5D4D1C5C9D4FB9C6D5656DA90AE6CD41A53A016E18F3A`** | 180 819 B |
| `C:\TwoSidesTestKit\Scripts\1-Preflight.ps1` | `95F488D148A99EA6063157DEED44C07AF823D692988759602FDC6ACDBA6A885A` | **`CCAF2E27B3E01270BCDCA1A8A9FAB9256CB5B401E57CCE186F46112DB89724F8`** | 4 785 B |

Respaldo previo (fuera del kit): `%LOCALAPPDATA%\TwoSidesClientBackups\pre-B71_1-20261103\` (manifiesto y preflight anteriores, hashes arriba).

Generador (no incluido en el kit): `scratchpad\b711gen.ps1`: enumera archivos (sin `Logs\` ni el manifiesto), orden ordinal, SHA-256 mayúsculas, línea `HASH␣␣ruta`, escrito con `UTF8Encoding($true)` (**UTF-8 con BOM**, bytes `EF BB BF`).

## 3. Cambios del preflight

- Lee el manifiesto con `Get-Content -Encoding UTF8` y exige BOM UTF-8.
- Nuevas comprobaciones: líneas bien formadas (`64 hex` + dos espacios + ruta); rutas seguras (rechaza `?`, rutas absolutas, `..`, `\\`); **sin rutas duplicadas** (sin distinguir mayúsculas); **nº de líneas = nº de entradas únicas = nº de archivos en disco**; **sin archivos ausentes**; **sin archivos adicionales** (antes no se detectaban); hashes SHA-256 (comparación sin distinguir mayúsculas hex).
- Se mantiene la exclusión de `Logs\` y del propio manifiesto. Las 13 comprobaciones de cuenta/perfil/dependencias no cambian.
- Archivo solo ASCII (PowerShell 5.1 lee los scripts sin BOM como ANSI).
- Parámetros `-KitRoot` y `-ManifestOnly`: existen solo para probar el manifiesto en copias desechables. `2-Start-Game.ps1` llama al preflight sin parámetros, así que se ejecuta la verificación completa. (Ejecutado `-ManifestOnly` no valida la cuenta; en uso real no debe emplearse.)

## 4. Resultados

- Entradas: **1335**; archivos del kit: 1335 (+ el manifiesto = 1336 en disco).
- **28 nombres con `Ñ` conservados** en el manifiesto nuevo; **0 líneas con `?`**; 0 duplicados; BOM presente.
- `1-Preflight.ps1 -ManifestOnly` sobre el kit real: las 8 comprobaciones de manifiesto **OK** → `PREFLIGHT PASSED` (el juego no se inició).
- Preflight completo desde `luis2`: falla correctamente en «Account is TwoSidesTest» y «LocalAppData belongs to TwoSidesTest» (esperado; no es la cuenta de pruebas) y ninguno de los demás. Procesos Godot: 0.
- Sin SQLite, `.env`, claves ni credenciales en el kit (0 coincidencias).
- Pendiente de confirmar por el propietario: el preflight completo en `TwoSidesTest`.

## 5. Correspondencia con el manifiesto anterior

Comparación línea a línea (anterior ↔ nuevo):

| Grupo | Nº | Resultado |
|---|---|---|
| Idénticas (ruta y hash) | 1306 | coinciden |
| Rutas dañadas (`?`) restauradas | 28 | cada una casó con **un único** archivo real (patrón `?`→un carácter, sin ambigüedad) y con **el mismo hash** del manifiesto anterior |
| Distinta | 1 | `Scripts\1-Preflight.ps1` (cambio intencionado) |
| **Total** | **1335** | |

Los 1334 archivos restantes conservan exactamente los hashes previamente comprobados; B71 ya había verificado que los 14 assets con `Ñ` son byte a byte idénticos a los del proyecto original.

## 6. Pruebas negativas (copias desechables)

18 casos sobre mini-kits temporales en el *scratchpad* (con archivos `DAÑO.png` y `HIELO PEQUEÑO.png.import`, ejecutando el preflight real con `-KitRoot … -ManifestOnly`; eliminados al terminar). **Todos como se esperaba:**

| Caso | Esperado | Resultado |
|---|---|---|
| Intacto con Ñ | PASS | PASS |
| Byte modificado (normal / con Ñ) | FAIL | FAIL (hash) |
| Archivo borrado (normal / con Ñ) | FAIL | FAIL (conteo + ausente) |
| Archivo extra / `save.sqlite3` extra / variante de mayúsculas | FAIL | FAIL (extra + conteo) |
| Archivo nuevo en `Logs\` | PASS (excluido) | PASS |
| Entrada duplicada | FAIL | FAIL |
| Entrada eliminada del manifiesto | FAIL | FAIL |
| Manifiesto en ASCII sin BOM | FAIL | FAIL (BOM, rutas) |
| `Ñ`→`?` en el manifiesto | FAIL | FAIL |
| Hash erróneo / línea malformada / ruta `..\..` | FAIL | FAIL |
| Manifiesto ausente | FAIL | FAIL |
| Preflight alterado | FAIL | FAIL (hash del propio script) |
| Hashes en minúsculas | PASS | PASS |

## 7. Aislamiento y seguridad

- Proyecto original: sin cambios (comparación con la instantánea de B69: solo difieren los .md de B69, B70 y B71). La SQLite histórica conserva `9FE793A26068A63C14FC76977FD4661E8C0BB55AC2E6DF69E6E76C45A8D0070C`. `PlayerData` no existe en `luis2`. Sin Atlas, v5, B67, instalaciones, commits ni push.

## 8. Reversión

```powershell
$b="$env:LOCALAPPDATA\TwoSidesClientBackups\pre-B71_1-20261103"
Copy-Item "$b\KIT-MANIFEST.sha256" C:\TwoSidesTestKit\ -Force
Copy-Item "$b\1-Preflight.ps1"     C:\TwoSidesTestKit\Scripts\ -Force
```
(Restaura el estado de B71, que falla con 28 diferencias; no recomendable.) Para descartar todo el kit: `9-Cleanup.ps1` según B71.

## 9. Limitaciones

- El manifiesto sigue siendo válido solo antes del primer arranque (Godot escribe en `.godot\`) y no cubre `Logs\`.
- La integridad del manifiesto nuevo se basa en su generación desde el propio kit más la correspondencia verificada con el anterior; no es una firma criptográfica.

## 10. Siguiente paso

Que el propietario ejecute `C:\TwoSidesTestKit\Scripts\1-Preflight.ps1` en `TwoSidesTest` y confirme `PREFLIGHT PASSED`. B71.1 se detiene aquí: no se ejecutó el videojuego.
