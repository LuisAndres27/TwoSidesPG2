# B52 — Diagnóstico de `ACCESS_DENIED` en SQLite y Outbox

Fecha: 2026-11-03. Solo diagnóstico: no se modificó código, escenas, assets, `project.godot`, SQLite real, permisos ni identidades. No se usó Atlas, backend principal, Caddy ni certificados. Sin commits ni push.

## 1. Origen exacto

**Registro** (`%APPDATA%\Godot\app_userdata\TwoSides\logs\godot.log`, última escritura 2026-10-31 07:05:07 hora local, UTC-6 = 13:05:07Z):

```
[Transicion] Pedido: res://scenes/levels/menu_niveles.tscn
[Transicion] Escena cambiada.
WARNING: [Local outbox] ACCESS_DENIED
   at: GamePersistenceContext._Process (integration/sqlite/GamePersistenceContext.cs:52)
... WASAPI: GetBufferSize error / output_device invalidated (x2) ...
WARNING: [Local outbox] OUTBOX_CLOSE_DEFERRED   (GamePersistenceContext.cs:99/103, al cerrar)
```

- Es la **única** aparición en los 5 registros conservados (29-oct a 31-oct); los otros 4 no la tienen. `OUTBOX_CLOSE_DEFERRED` aparece también en el registro de las 00:23 sin `ACCESS_DENIED`, así que es un fenómeno distinto y conocido (B05_OUTBOX_*).
- **Cadena**: `GamePersistenceContext._Process` (línea 52) solo *imprime* `LocalOutboxScheduler.Diagnostic.Code` cuando cambia. El código lo fija `LocalOutboxScheduler.Run` con el resultado de `LocalOutboxPump.Step` (`local-persistence/src/LocalOutboxPump.cs.txt`, catch de línea 51-58), ejecutado vía `GamePersistenceAdapter.OutboxPageAsync`.
- **Qué significa el nombre**: `ACCESS_DENIED` no es «Windows negó permisos». Es una etiqueta genérica que agrupa:
  - `StorageErrors.Map(SqliteException)` (`SyntheticSandbox.cs.txt:126`): SQLite 8 (READONLY), 14 (CANTOPEN) y 23 (AUTH).
  - `OwnedCopyDatabase.Open()` (`OwnedCopyDatabase.cs.txt:168`): cualquier `UnauthorizedAccessException`.
  - `WindowsGuard.Lock` (`:216`): Win32 error 5 al hacer `CreateFileW` sobre la base o sus archivos auxiliares `-journal/-wal/-shm`.
- No proviene de DPAPI ni de identidad/sesión del jugador ni de una validación interna de propiedad: esas devuelven `UNKNOWN_DATABASE`, `UNSAFE_PATH`, `AMBIGUOUS_SYNC_BINDING`, etc. En el pump, `UnauthorizedAccessException` directa se mapea a `IO_ERROR`, de modo que el `ACCESS_DENIED` visto viene de `Open()` (SaveException) o de un `SqliteException` 8/14/23.

## 2. Evidencia y protección de datos

- **Rutas reales**: `local-persistence/.work/runtime-game/{save.sqlite3, ownership.json, store.lease}` (juego normal) y `%APPDATA%\Godot\app_userdata\TwoSides\local-progress\two-sides.sqlite3` (heredada, no usada por Sync v2).
- **Metadatos/ACL (solo lectura)**: archivos con `SYSTEM`, `Administradores` y `luis2` en control total (herencia); atributos solo `Archive`; sin reparse points. Las carpetas padre heredan `Everyone:(DENY)(DC)` (borrar hijos), ya documentado en B07 y ancestro en `C:\Users\luis2\OneDrive`. **No** niega leer, escribir ni crear, y no impide la operación normal (la base se escribió ese día). Descartado como causa.
- **Cabecera SQLite** (lectura de 100 bytes con handle compartido, sin conexión SQLite): rollback journal (`1/1`, no WAL), página 4096, `user_version=2`, `application_id=0x54535254`, contador de cambios 3659. Sin `-journal`/`-wal`/`-shm` en reposo.
- **Adquisición de copia aislada** (procedimiento): sin procesos Godot/node/caddy; apertura de lectura con `FileShare.ReadWrite|Delete`; copia byte a byte a `…/scratchpad/b52-copy/copy.sqlite3`; SHA-256 de origen antes = copia = origen después = `9FE793A2…070C`; consultas con `mode=ro&immutable=1` (no crea sidecars). Solo se consultaron conteos y estados, no nombres ni valores de usuario.
- **Contexto del sistema** (Registro de eventos, solo lectura): `Resume from Connected Standby` a las 07:02:44, tres minutos antes del cierre del juego (07:05:07); el propio log trae dos fallos WASAPI («output_device invalidated»), señal de perturbación del sistema en esa sesión. Edge/Brave y SPP activos en el mismo minuto.

## 3. Estado de las operaciones pendientes (copia aislada)

| Dato | Valor |
|---|---|
| `quick_check` / `foreign_key_check` | `ok` / 0 |
| `sync_outbox` total | **2151**, todas `pending`, `attempts=0`, `last_error_code` NULL, 0 leases, 0 duplicados de `source_key` |
| Por tipo | `gameplay.interval` 1993, `gameplay.event` 104, `session.report` 33, `game.report` 21 |
| Origen | todas `historical_import` (reconciliación local) |
| Cobertura | 1993 intervalos en tabla = 1993 en Outbox |
| Última fila de Outbox | `created_at_utc 2026-10-31T13:05:07.578Z`; **31 intervalos** creados en la sesión del aviso |

Conclusión: **después** del `ACCESS_DENIED` el pump volvió a escribir con éxito en esa misma sesión (filas con marca de las 13:05:07Z, igual a la última escritura del archivo). El error fue **transitorio**; no hubo pérdida ni corrupción visible, y la reconciliación recupera lo no registrado en el siguiente pase. Límite: el registro solo imprime cambios de código, por lo que no puede probarse cuántos pases fallaron antes del primero exitoso.

Hallazgo colateral relevante para la integración final: la cola real tiene **2151** operaciones pendientes, por encima de la cuota de 1000 por propietario del servidor (B48 recomendaba 3000 condicionado a medición). No es consecuencia del aviso, pero impediría subir la cola histórica completa sin decidir la cuota o una política de resumen.

## 4. Análisis de causas

| Causa | Estado | Evidencia / condiciones | Impacto |
|---|---|---|---|
| **A. Win32 error 5 sobre archivo auxiliar en borrado pendiente (`-journal`)** | **Mecanismo reproducido con datos sintéticos; que ocurriera aquí es hipótesis principal, no confirmada** | `OpenConnection` hace `WindowsGuard.Exists(sidecar)` (GetAttributes) y luego `WindowsGuard.Lock(sidecar)` (`CreateFileW`, acceso 0x80, share 3, sin DELETE). Con la base en modo rollback, cada escritura crea y borra `-journal`. Si otro proceso (antivirus, OneDrive —el proyecto vive bajo `OneDrive\Desktop`—, indexador) mantiene un handle, el borrado queda pendiente: `GetAttributes` devuelve OK pero `CreateFileW` falla con **error 5**, que el código traduce a `ACCESS_DENIED`. Prueba en archivo sintético: `GetAttributes: ok`, `CreateFileW invalid=True win32=5`. Contexto compatible: reanudación de standby 3 min antes y OneDrive/AV activos. | Ventana de milisegundos; se reintenta en el siguiente pase (≤30 s o siguiente `Request`). |
| B. SQLite 8/14/23 (READONLY/CANTOPEN/AUTH) | Hipótesis posible, sin evidencia directa | CANTOPEN/READONLY por fallo al crear el journal bajo interferencia del mismo tipo; no hay authorizer ni triggers de tipo `RAISE` en el esquema. Indistinguible con el log actual (no registra el subcódigo). | Igual que A. |
| C. Permisos/ACL de Windows persistentes | **Descartada** | ACL y atributos normales; la base se escribió después; pump posterior exitoso. | — |
| D. DPAPI / identidad / sesión / propiedad | **Descartada** | Esas rutas producen otros códigos; Sync v2 y DPAPI no participan en el pump local. | — |
| E. Base solo de lectura / dañada | **Descartada** | `quick_check ok`, atributos sin `ReadOnly`, escritura posterior. | — |

Archivos y funciones responsables: `OwnedCopyDatabase.OpenConnection/Open` y `WindowsGuard.Exists/Lock` (`local-persistence/src/OwnedCopyDatabase.cs.txt`), `StorageErrors.Map` (`SyntheticSandbox.cs.txt`), `LocalOutboxPump.Step`, `LocalOutboxScheduler.Run`, `GamePersistenceContext._Process`.

## 5. Impacto

- **Guardado local**: el mismo `Open()` lo usan **todas** las operaciones (`GamePersistenceAdapter.Execute` devuelve `LocalSaveResult(false,"ACCESS_DENIED")`). Si la carrera cae en un guardado de decisión/bioma y el llamador no reintenta, esa escritura puede fallar una vez sin guardarse (el contrato `LOCAL_SAVE_CONTRACT.md` exige no confirmarla). **No se trazó el manejo de ese resultado en todas las escenas**: queda como riesgo a verificar, no demostrado.
- **Sincronización**: el pase del pump simplemente se reintenta; las operaciones pendientes permanecen intactas. Sin ACK ni lease afectados.
- **Datos antiguos vs nuevos**: afecta a cualquier partida (es una carrera del sistema), no a datos viejos.
- **Reproducción sintética**: el mecanismo A se reproduce con un archivo temporal (sección 6). La reproducción dentro del juego requeriría concurrencia con AV/OneDrive y no se intentó.

## 6. Pruebas realizadas (solo sintéticas, scratchpad, sin tocar el juego)

1. Archivo sintético `*.sqlite3-journal`, handle de otro proceso con `FileShare.Delete`, borrado POSIX (`File.Delete`): el archivo desaparece al instante (`FileNotFound`, error 2). No reproduce el fallo (Windows 11 usa semántica POSIX para ese borrado).
2. Mismo archivo con borrado clásico (`FileOptions.DeleteOnClose`) con otro handle abierto: `GetAttributes` OK y `CreateFileW(0x80, share 3, OPEN_EXISTING)` falla con **Win32 5**. Reproduce el camino exacto `Exists → Lock → ACCESS_DENIED`.
3. Un intento previo del script falló por una sobrecarga ambigua de `FileStream` en mi propio PowerShell; se corrigió y repitió. No se contó como resultado.

Tampoco se sabe si el `DeleteFileW` de SQLite usa borrado clásico o POSIX en esta build; por eso A sigue siendo hipótesis.

## 7. Corrección mínima recomendada (no implementada)

1. En `OpenConnection` (o `WindowsGuard.Lock`): tratar Win32 5 sobre **`-journal/-wal/-shm`** como transitorio con reintento acotado (p. ej. 3 intentos, 50–150 ms, dentro del presupuesto de 1 s) y, si persiste, devolver `STORAGE_BUSY` en lugar de `ACCESS_DENIED`. No aplicar a la base principal ni a `ownership.json`/`store.lease`.
2. Registrar el origen sanitizado (`win32:5`, `sqlite:14`…, sin rutas ni SQL) en el diagnóstico para distinguir A de B.
3. Que `GamePersistenceContext` cuente apariciones, no solo cambios de código.
4. Confirmar que las escenas con guardado crítico reintentan ante `STORAGE_BUSY`/`ACCESS_DENIED` (auditoría sin cambios).
5. No cambiar ACL, no reintentar sin cota, no borrar sidecars.

## 8. Pruebas necesarias para validar la corrección

- Unitaria sintética: sidecar en borrado clásico pendiente liberado tras N ms → éxito con reintento; no liberado → `STORAGE_BUSY` acotado a ≤1 s.
- Que `ACCESS_DENIED` genuino (base de solo lectura, ya cubierto en `GameSaveChecks`) siga produciendo `ACCESS_DENIED`.
- Concurrencia: escrituras de juego + pump con un tercero reteniendo handles del journal; sin pérdida, sin duplicados de `source_key`.
- Regresión de las suites existentes (679 + 43 + 14) y reejecución F3.3 con SQLite desechable.

## 9. ¿Bloquea la integración final?

**No bloquea**, con dos matices: (a) el error es transitorio y autocorregido, sin pérdida de datos observable; (b) conviene aplicar la corrección mínima antes de la validación real F3.10 para que un fallo transitorio no pueda aparecer como guardado fallido o ruido en la cola. **Sí es una dependencia** para la integración la decisión sobre la cola histórica: 2151 pendientes > cuota 1000 (sección 3).

## 10. Integridad de lo inspeccionado

| Elemento | Resultado |
|---|---|
| `save.sqlite3` | 5 697 536 B, mtime 2026-10-31 07:05:07, SHA-256 `9FE793A26068A63C14FC76977FD4661E8C0BB55AC2E6DF69E6E76C45A8D0070C` — igual antes, durante y después |
| `ownership.json` / `store.lease` | sin cambios (`606D3E8C…` / vacío) |
| Base heredada | `5EA5CA0569F2ED60…`, 139 264 B — sin cambios |
| Registros de `…/TwoSides/logs` | 5 archivos con las mismas fechas |
| Sidecars de la base real | no se crearon (`-journal/-wal/-shm`) |
| ACL / permisos / identidades / credenciales | sin cambios |
| Procesos Godot/node/caddy; Atlas | 0 / ninguna conexión |
| Manifiesto de integridad v4 | `ok`, 3169 archivos, 0 diferencias |
| Archivos creados | este documento; copia aislada y archivos sintéticos solo en el scratchpad de la sesión (`b52-copy`, `b52-synth`) |
| Código / escenas / `project.godot` / `.csproj` | sin cambios por esta etapa (los `M`/`??` de git son anteriores a la sesión) |

La copia `b52-copy/copy.sqlite3` contiene datos reales del jugador; puede borrarse cuando se quiera.
