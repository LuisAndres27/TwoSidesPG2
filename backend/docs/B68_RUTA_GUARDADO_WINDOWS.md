# B68 — Ruta de guardado de producción para Windows

Fecha: 2026-11-03, Guatemala. **Implementado y validado localmente. Sin exportar.** Sin Atlas, sin v5, sin B67, sin Express/Caddy, sin certificados, sin credenciales, sin commits ni push. **La SQLite real del desarrollador no se abrió, copió, migró ni modificó** (solo se calculó el hash de sus bytes antes y después). Las 2151 operaciones pendientes no se procesaron. Ningún archivo de `backend/src`, `backend/scripts` ni los de paquete cambió, por lo que el manifiesto v5/v4 no se ve afectado (está fuera del ámbito de esta tarea).

## 1. Qué había y qué se hizo

**Antes (B61):** el juego normal abría `new GamePersistenceAdapter(runtime:true)`, cuya ruta salía de la constante `SyntheticSandbox.AuthorizedProjectRoot` (`C:\Users\luis2\…\local-persistence`) → `.work\runtime-game\save.sqlite3`. Otro equipo no tenía esa raíz.

**Ahora:** el juego normal usa un cuarto almacén independiente, **por usuario de Windows**:

```text
%LOCALAPPDATA%\TwoSides\PlayerData\save.sqlite3
```

Para esta cuenta: `C:\Users\luis2\AppData\Local\TwoSides\PlayerData\save.sqlite3` (**no existe todavía**; se crea al primer arranque del juego). Junto a la base se crean `ownership.json` y `store.lease`, igual que en los otros almacenes.

| Almacén | Quién lo usa | Ruta |
|---|---|---|
| **Producción (nuevo)** | el juego normal | `%LOCALAPPDATA%\TwoSides\PlayerData\` |
| Histórico del desarrollador (runtime) | ya no lo abre el juego; solo pruebas heredadas por su API | `local-persistence\.work\runtime-game\` (intacto) |
| Copias de prueba | pruebas | `%LOCALAPPDATA%\TwoSides\ReconstructionTests\…` |
| Sandbox sintético (banderas de prueba) | `--two-sides-test-storage=sandbox` | `local-persistence\.work\databases\<guid>\` |

Cada propósito tiene su propia identidad: `application_id` (producción `0x54535044`), `store id` (`two-sides-player-save-v1`) y `purpose` (`player-production-save`) en el manifiesto de propiedad. Un almacén rechaza las rutas de los demás con `UNSAFE_PATH` **antes** de tocar el sistema de archivos.

## 2. Archivos modificados (respaldos previos en `%LOCALAPPDATA%\TwoSidesClientBackups\pre-B68-20261103\`)

| Archivo | Cambio | SHA-256 nuevo |
|---|---|---|
| `local-persistence/src/OwnedCopyDatabase.cs.txt` | modo producción (`OpenProduction`, `ProductionDirectoryUnder`, identidad propia); la raíz local pasa a una propiedad `LocalRoot`; los dos usos de `CopyId` en el manifiesto pasan a `StoreId`. +40 −8 líneas | `1F78598B8286036A4B48B5364872ACB0B4D92CCD555EDB88EDC432FFFC4E6BF9` |
| `local-persistence/src/CopyGameDatabase.cs.txt` | `ProductionDirectory`, `ProductionPath`, `OpenProductionOrCreate`; `InternalsVisibleTo("TwoSides.Production.Checks")` para la semilla de pruebas. +8 líneas | `4D8D35B549818DA5EBF83267F3FEAFD2B090801D239E5B5A13319B1B2AC8967C` |
| `integration/sqlite/GamePersistenceAdapter.cs` | parámetro `production`, `ProductionStoragePath`; el pump de Outbox también arranca en producción. +7 −4 | `56B6C2C4E0B3C23BA6A40753AA68D84E797B67807F9514CC459AFD05BCBD82DA` |
| `integration/sqlite/GamePersistenceContext.cs` | el juego normal usa `new(production:true)` y `ProductionStoragePath`. +3 −2 | `56C5D203C75ECE86EEF2CC83C254F9389BF43D459129C54110B8245DF8669D68` |

Nuevos (solo pruebas): `local-persistence/production-storage-tests/` — `ProductionStorage.Checks.csproj` `9F919A…4BCB`, `ProductionStorageChecks.cs.txt` `AF7D67…86B0`, `Program.cs.txt` `3969F5…AE01`, `packages.lock.json` `C02FE1…C9E7` (idéntico al de F54).

Respaldos también de `SyncHttpChecks.cs.txt`, `sync-b57-tests/Program.cs.txt` y `GameSaveChecks.cs.txt`, que **finalmente no se modificaron** (comparados byte a byte).

**Reglas del modo producción** (todas fail-closed, sin crear nada si fallan): ruta absoluta y normalizada (sin `..`); no UNC; unidad fija; ningún componente que empiece por `OneDrive`; sin puntos de reanálisis; la ruta pedida debe ser exactamente la del almacén (`UNSAFE_PATH` si no); se crean automáticamente solo `TwoSides\PlayerData` bajo `%LOCALAPPDATA%`; un directorio con archivos y sin manifiesto de propiedad se rechaza (`UNKNOWN_DATABASE`), así que **nunca adopta una base ajena**; un segundo proceso no puede abrir el mismo almacén (arrendamiento de un byte). Nunca borra nada.

**No se modificó:** esquema de la base, esquema/tablas de la Outbox, reglas de guardado, `GameSyncHost.cs`, `ApiConfiguration`, escenas, assets, `project.godot`, `export_presets.cfg`, `SyntheticSandbox` ni el almacén runtime histórico (su API sigue existiendo solo para las pruebas heredadas).

## 3. Compilación

- `TwoSides.LocalPersistence` y proyectos de prueba: **0 advertencias, 0 errores** (TreatWarningsAsErrors activo).
- **Código del juego (Godot):** no se compiló con el SDK de Godot. Un intento de `dotnet build TwoSides.csproj` desde fuera falló por mi método (las propiedades globales rompían los proyectos referenciados; no hubo cambios en el proyecto). En su lugar, un proyecto temporal **fuera del repositorio** compiló todo `scripts/**`, `scenes/**`, `assets/**` e `integration/sqlite/*.cs` contra GodotSharp 4.6.1 y sus generadores de código: **0 errores C#**, ensamblado `TwoSides.dll` generado (≈655 KB). Los únicos errores restantes fueron de copia de activos nativos de SQLite en el directorio temporal. **Es una compilación equivalente, no la de Godot; conviene abrir el proyecto en el editor para confirmar.**

## 4. Pruebas ejecutadas (sin la SQLite real)

| Suite | Resultado |
|---|---|
| **Nueva: almacenamiento de producción** (`TwoSides.Production.Checks`) | **65 PASS, 0 fallos** |
| GameSave.Checks, 20 modos | exit 0 en todos; **756 comprobaciones PASS** |
| Biblioteca SQLite (`run-checks.ps1`) | 43/43 |
| Infraestructura | 28/28 |
| Cliente de sync F3.1 (servidor falso en proceso) | 14/14 |
| Cuota B54 (local) | 16/16 |

El modo sin argumentos de `GameSave.Checks` está deshabilitado deliberadamente por el propio código (suite histórica). No se ejecutaron `sync-http-tests`, B55 ni B57 (necesitan Express o piezas fuera de este alcance); los archivos de B57 y `SyncHttpChecks` no se tocaron.

**La batería nueva (65) cubre:**
- Rutas para cinco perfiles de Windows simulados (espacios, acentos, nombre largo de 83 caracteres, otra unidad): cada uno resuelve a `<LocalAppData>\TwoSides\PlayerData` y dos perfiles dan ubicaciones distintas.
- La ruta real de producción cuelga de `LocalApplicationData`, no del proyecto, `.work`, OneDrive ni de `ReconstructionTests`, y difiere de las otras cuatro rutas.
- Rutas incorrectas rechazadas con `UNSAFE_PATH` por el almacén de producción, el histórico y la copia de prueba, en ambos sentidos; sin crear la carpeta real de producción.
- Raíces inseguras rechazadas sin crear directorios: relativa, UNC, con `..`, bajo "OneDrive", vacía, unidad inexistente.
- Primer arranque en un perfil nuevo: crea directorio, base, manifiesto y arrendamiento; **no hay perfil** (no hereda datos del desarrollador); se guarda un perfil y una partida; segunda instancia rechazada; cerrar y reabrir conserva los datos; `application_id` propio; manifiesto con propósito y store id de producción y sin el id de las copias de prueba.
- Un segundo perfil de Windows tiene su propio almacén independiente (y acentos en la ruta); el primero queda intacto.
- El esquema base de la base de producción es **idéntico** al de un almacén de referencia (15 objetos).
- Un archivo ajeno sin manifiesto en la ruta de producción se rechaza (`UNKNOWN_DATABASE`) y queda intacto.
- Sin URL de backend: la sincronización principal queda desactivada (vacía, espacios, `null`, HTTP, no-URL); con HTTPS válido se activaría (control); una bandera de prueba la desactiva; `project.godot` no define `main_api_url`.
- Las banderas de prueba (`--two-sides-sync-local-test` + `--two-sides-test-storage=sandbox`) usan solo su sandbox desechable, rechazan la ruta de producción, la histórica y la protegida, y solo abren su propio token.
- Inspección del código: el arranque del juego usa `production:true` y no contiene `runtime:true`, `RuntimeStoragePath` ni `AuthorizedProjectRoot`; `GameSyncHost` no usa rutas del desarrollador; `OpenProduction` no referencia ninguna ubicación específica.

Las pruebas con apertura real usan **raíces `LocalAppData` simuladas y desechables** (`%LOCALAPPDATA%\TwoSidesTests\B68\<guid>\<perfil>\AppData\Local`), que se eliminan al terminar. La carpeta real `%LOCALAPPDATA%\TwoSides\PlayerData` no se crea ni se abre en ningún momento: **el camino exacto del juego real (con `GetFolderPath`) no se ejecutó de extremo a extremo**; su primer arranque real queda para la prueba en un perfil limpio.

## 5. Evidencia de aislamiento (al terminar)

| Elemento | Estado |
|---|---|
| SQLite real `local-persistence\.work\runtime-game\save.sqlite3` | SHA-256 `9FE793A26068A63C14FC76977FD4661E8C0BB55AC2E6DF69E6E76C45A8D0070C`, fecha `2026-10-31T13:05:07Z`, 5 697 536 bytes y 3 archivos (`ownership.json`, `save.sqlite3`, `store.lease`) **idénticos antes y después** |
| Base heredada de AppData (`two-sides.sqlite3`) | `5EA5CA05…` sin cambios |
| Copia B52 (`copy.sqlite3`) | `9FE793A2…` sin cambios |
| `%LOCALAPPDATA%\TwoSides\PlayerData` | no existe (no creada por las pruebas) |
| Sandboxes sintéticos en `.work\databases` | 0 restantes |
| Laboratorio `%LOCALAPPDATA%\TwoSidesTests` | eliminado (solo lo creado por las pruebas) |
| Despliegues B67 (`aeec6c…`, `5d135b…`, `16d152…`) | 3 directorios intactos; B67 no se ejecutó |
| `backend/src`, `backend/scripts`, `package.json` | 0 archivos modificados desde las 21:00 |
| Procesos node/caddy/Godot; listeners 3000/8443/27017; conexiones al 27017 | 0 / 0 / 0 |

La suite de infraestructura reutiliza su propio almacén sintético duradero de pruebas (como en ejecuciones anteriores); no es el histórico.

## 6. Riesgos restantes

1. **Los almacenes nuevos solo tienen el esquema base.** Igual que un almacén nuevo de referencia, no incluyen las tablas de eventos de juego (`gameplay_*`) ni de Outbox (`sync_*`): hoy solo se instalan con las herramientas offline autorizadas de la activación de Outbox, y el código de aplicación solo sabe migrar bases sintéticas. Comportamiento verificado: el pump de Outbox responde `OUTBOX_NOT_ACTIVATED` (sin fallo de integridad) y el servicio de eventos se niega con un código controlado (`UNSUPPORTED_EVENT_SCHEMA`); por lectura del código, la telemetría se desactiva sin detener el juego y las estadísticas contemplan la ausencia de tablas de eventos. **Para el jugador de la entrega eso significa progreso, decisiones y finales sí; telemetría y sincronización no.** Es compatible con una entrega local sin sincronización, pero **si se quiere telemetría/estadísticas de actividad o sincronización, hace falta una tarea nueva y autorizada** que aprovisione esas tablas en almacenes de producción vacíos (con la misma verificación de checksum). No se hizo aquí por la instrucción de no cambiar la estructura de la base.
2. **El camino real no se ejecutó** (ver §4): validar el primer arranque en un perfil limpio de Windows.
3. **Cómo queda el equipo del desarrollador:** al iniciar el juego aquí, empezará con un almacén vacío en `%LOCALAPPDATA%`; el histórico no se carga solo (decisión B68). Los datos históricos siguen donde estaban.
4. **`LocalAppData` redirigido a OneDrive o a una unidad no fija, o con puntos de reanálisis:** el almacén lo rechaza (`UNSAFE_PATH`) y el juego queda sin guardado (falla cerrada, con diagnóstico; no hay guardado volátil de reserva). Es poco habitual en cuentas estándar.
5. **Antivirus o sincronización** que bloquee archivos de `%LOCALAPPDATA%\TwoSides` puede producir `ACCESS_DENIED`/`STORAGE_BUSY` (como en B52); no se probó.
6. **Compilación de Godot** no confirmada con su SDK (ver §3).
7. **La API del almacén runtime histórico sigue en la biblioteca** (para las pruebas heredadas) con la constante de la ruta del desarrollador; ya no es alcanzable desde el juego, pero un cambio futuro en `GamePersistenceContext` podría reintroducirla. Hay una prueba que lo vigila.
8. Dos instancias del juego a la vez en el mismo usuario: la segunda no abre el almacén (comportamiento previsto).

## 7. Procedimiento de reversión

1. Restaurar los cuatro archivos desde `%LOCALAPPDATA%\TwoSidesClientBackups\pre-B68-20261103\` (hashes de origen anotados: `GamePersistenceAdapter.cs` `6C6C6A55…`, `GamePersistenceContext.cs` `5A10659E…`, `CopyGameDatabase.cs.txt` `621F94D5…`, `OwnedCopyDatabase.cs.txt` `0DA54821…`). El comportamiento previo vuelve al almacén histórico del desarrollador.
2. Eliminar `local-persistence/production-storage-tests/` y este informe.
3. Si el juego se llegó a ejecutar y creó `%LOCALAPPDATA%\TwoSides\PlayerData`, su contenido es solo de la instalación nueva (sin datos históricos): puede eliminarse archivo a archivo y luego su directorio, sin tocar `TwoSides\` ni los demás almacenes. No forma parte de esta fase.
4. No hay datos que revertir: B68 no modificó ninguna base.

## 8. Recuperar o migrar después el guardado histórico (operación separada y autorizada)

B68 **no** lo hace. Antes de intentarlo, una fase nueva debe definir y aprobar, como mínimo:

1. **Alcance:** si se migra la base completa o solo el perfil y la partida; qué pasa con la cola de 2151 operaciones y con la identidad de instalación (`sync_installations`): hay que conservar `operation_id` e `installation_id` para que el servidor las deduplique y no se dupliquen.
2. **Precondiciones:** juego y editor cerrados; ningún proceso con `store.lease`; espacio libre suficiente; respaldo previo verificado.
3. **Método:** una herramienta dedicada que (a) abra el histórico en modo de solo lectura y verifique `quick_check`, claves foráneas y los checksums de esquema; (b) cree el almacén de producción con `OpenProduction` (sin adoptar archivos); (c) copie con la API de copia de SQLite o con una exportación por tablas dentro de una transacción; (d) fije el `application_id` y el manifiesto de producción; (e) verifique conteos y contenido por tabla y el hash lógico; (f) no borre nada del origen.
4. **Reversibilidad:** el histórico queda intacto; deshacer es eliminar el almacén de producción.
5. **Pruebas previas** con una copia desechable (como B52/B53), nunca con el archivo real, y solo después un ensayo autorizado sobre el real.
6. **Alternativa más simple si no hace falta migrar:** conservar el histórico como archivo de respaldo y empezar la entrega con una instalación limpia.

## 9. Criterios de aceptación

| Criterio | Resultado |
|---|---|
| Cada usuario de Windows tiene su ruta | cumplido (`%LOCALAPPDATA%` por perfil; probado con perfiles simulados) |
| Instalación nueva sin depender del equipo del desarrollador | cumplido en la ruta y las pruebas; **primer arranque real pendiente** (§6.2) |
| Pruebas sintéticas aisladas | cumplido (sandbox y raíces desechables; rechazo cruzado de rutas) |
| Ninguna prueba afecta al histórico | cumplido (hashes, fechas y tamaño idénticos) |
| SQLite y Outbox mantienen su funcionamiento | regresiones PASS (756 + 43 + 28 + 14 + 16); en almacenes nuevos Outbox no está activada (§6.1) |
| No se modifica información real | cumplido |

**Estado: B68 implementado y validado localmente. Detenido; no se inició la exportación.**
