# Two Sides — persistencia local de la copia de pruebas

Fecha: 2026-10-25. Estado vigente: infraestructura/API de perfil/partidas y núcleo de progreso/bloqueo/decisiones2B; resultado PARCIAL por disponibilidad real pendiente. Sin integración con escenas/menús ni ejecución del motor. Los apartados B04.2A y B04.2B.2A conservan evidencia histórica; las actualizaciones finales describen capacidades actuales. No abrir original, partidas ajenas, `user://` ni `.env`. Sin dependencia de Express/Atlas para la API local.

## Estructura y separación del videojuego

```text
local-persistence/
  .gitignore
  .gdignore
  NuGet.Config
  Directory.Build.props
  run-checks.ps1
  src/
    TwoSides.LocalPersistence.csproj
    packages.lock.json
    Models.cs.txt
    Validation.cs.txt
    SyntheticSandbox.cs.txt
    SchemaManager.cs.txt
    SQLiteRepository.cs.txt
    UnitOfWork.cs.txt
    GameSaveService.cs.txt
  tests/
    TwoSides.LocalPersistence.Checks.csproj
    packages.lock.json
    Checks.cs.txt
  .work/                         # ignorado: paquetes, runtime, build, temporales, bases
```

Los `.cs.txt` son C# real incluido explícitamente con `<Compile Include="*.cs.txt"/>`. Se usa esta extensión para evitar que el glob implícito `**/*.cs` del proyecto Godot situado en la raíz incorpore automáticamente los archivos nuevos. `.gdignore` evita además que el motor escanee esta carpeta como recursos. No hay referencias al motor/escenas ni ProjectReference desde TwoSides.csproj, que permanece intacto. Se desactivó generación de AssemblyInfo, atributos de framework y global usings para no dejar `.cs` generados bajo la raíz del juego. Los artefactos se mantienen en `.work/`, sin modificar soluciones o proyectos existentes.

## Framework, paquetes y procedencia

- Biblioteca y pruebas: **net8.0**, compatible con el destino habitual observado en TwoSides.csproj. Compilador usado: SDK **10.0.400** instalado, sin instalar SDK global ni modificar el del juego.
- Pruebas autocontenidas **win-x64** con runtime **.NET 8.0.30** fijado explícitamente; se descargó a `.work` porque el equipo solo tenía runtime global 10.0.11. Las pruebas se ejecutaron efectivamente en .NET 8, sin roll-forward a 10.
- Única dependencia directa: **Microsoft.Data.Sqlite [8.0.32]**, estable, versión exacta.
- Transitivas resueltas: **Microsoft.Data.Sqlite.Core 8.0.32**; **SQLitePCLRaw.bundle_e_sqlite3/core/lib.e_sqlite3/provider.e_sqlite3 2.1.13**; **System.Memory 4.5.3**. Los lockfiles registran versiones y hashes de contenido.
- Motor nativo observado al ejecutar: **SQLite 3.53.3**. No usar un `sqlite3.exe` del sistema ni instalar un driver de Node.

Se revisó NuGet.Config del usuario solo en metadatos: fuente pública nuget.org y sin credenciales. No se modificó. La configuración local limpia fuentes/fallbacks y usa nuget.org explícito; el SDK también declara su fuente local de solo lectura `C:\Program Files\dotnet\library-packs`. Los activos restaurados usan una única carpeta de paquetes: `local-persistence/.work/packages`, sin fallback al caché de otro proyecto.

`run-checks.ps1` fija CLI home, paquetes, caché HTTP/plugins, scratch, TEMP/TMP, artefactos y datos sintéticos dentro de `.work`; desactiva telemetría/avisos de workload y reutilización de servidores. Restore recibe `--configfile`/`--packages`; con lockfiles existentes usa `--locked-mode`. Se inspeccionaron los targets restaurados y no contienen tareas Exec. NuGetAudit está desactivado para esta reproducción aislada: la revisión de procedencia/lockfile NO equivale a auditoría de vulnerabilidades o aprobación de producción.

La restauración del SDK también dejó en esa caché packs de referencia/runtime/host **8.0.30** de Microsoft.NETCore.App, Microsoft.AspNetCore.App y Microsoft.WindowsDesktop.App, todos con metadata de procedencia nuget.org. Son activos de toolchain aislados, no referencias nuevas del juego ni instalaciones globales. El ejecutor usa Microsoft.NETCore.App 8.0.30; no inicia servidores ASP.NET o aplicaciones WindowsDesktop.

Referencias oficiales: [Microsoft.Data.Sqlite 8.0.32 y dependencias](https://www.nuget.org/packages/Microsoft.Data.Sqlite/8.0.32), [proveedor](https://learn.microsoft.com/en-us/dotnet/standard/data/sqlite/), [transacciones](https://learn.microsoft.com/en-us/dotnet/standard/data/sqlite/transactions).

## Ejecutar

Desde esta carpeta, en la copia autorizada:

```powershell
.\run-checks.ps1 -Restore  # primera restauración o validación bloqueada; necesita fuente pública
.\run-checks.ps1           # build --no-restore y ejecutor autocontenido, sin internet
```

El script comprueba su ruta absoluta exacta antes de crear trabajo y rechaza raíces/puntos de trabajo enlazados. No se ejecuta Godot ni se restaura TwoSides.csproj. El ejecutor es una aplicación de pruebas con salida/exit code, sin xUnit/MSTest adicional; `dotnet test` no es el comando de esta suite. Las pruebas se compilan siempre antes de ejecutarse para no presentar resultados de un binario anterior a cambios.

## Rutas sintéticas y ciclo de vida

`SyntheticSandbox` solo admite la raíz autorizada `C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\local-persistence`. Cada instancia reserva `.work/databases/<UUID-aleatorio>/` y crea nombres nuevos mediante CreateNew. `SyntheticDatabase` tiene constructor interno: no acepta una ruta elegida por el jugador o un archivo preexistente. La instancia conserva un registro de propiedad de archivos; otro sandbox, rutas con traversal y rutas externas son rechazados antes de abrir SQLite.

Antes de crear/abrir/eliminar se validan rutas, directorios y atributos de reparse; no se siguen enlaces hacia otros destinos. Conexiones con Mode=ReadWrite, pooling deshabilitado y cadena construida por SqliteConnectionStringBuilder; una base propia eliminada devuelve NOT_FOUND, no se recrea automáticamente. No se inspecciona AppData o user://.

Dispose borra únicamente las bases propias y sus nombres auxiliares conocidos, comprobados dentro del directorio reservado. No hay borrado recursivo: la carpeta se elimina solo si quedó vacía. El runner recorre metadatos sin seguir reparse points para comprobar que no quedan bases. Las pruebas finales dejaron **cero bases sintéticas**; paquetes y binarios permanecen como caché/artefactos ignorados.

Esta capacidad se limita intencionadamente a la vida de la instancia: permite cerrar/reabrir conexiones y servicios sobre la misma base sintética, pero no ofrece apertura de partidas reales ni un bootstrap de producción entre procesos. B04.2B deberá autorizar y diseñar su propio proveedor de rutas/propiedad antes de usar archivos persistentes del jugador. Los controles actuales no sustituyen resolver el riesgo ACL de B00 o proteger una sesión Windows comprometida.

## Modelo y esquema

Se implementaron las **diez tablas B04.1**:

| Tabla | Propósito |
|---|---|
| local_profiles | Perfil singleton, nombre, revisión y metadata técnica no secreta |
| saved_games | Partidas actuales/históricas, revisión, versiones y continuación |
| biome_progress | Progreso independiente por bioma |
| biome_objectives | Estructura para objetivos futuros; no se inventó catálogo ni API de objetivos |
| environmental_decisions | Historial ordenado e inmutable de decisiones |
| environmental_state | Proyección ambiental ligada por FK compuesta a la decisión del mismo juego/bioma |
| continuation_snapshots | Captura de límite de segmento coherente con revisión |
| local_settings | Preferencias expresamente permitidas por el llamador |
| local_operations | Recibos idempotentes y digest de contenido no secreto |
| schema_migrations | Historial de versión/checksum/fecha |

Hay PK/FK/NOT NULL/CHECK/UNIQUE, RESTRICT en referencias, unicidad parcial de partida actual e índices de consultas del diseño. Foreign keys se activan en cada conexión y se comprueba que valgan 1. El motor elegido soporta JSON, verificado en pruebas; por eso se aplicaron CHECK json_valid, además de validación de dominio. No hay columnas de contraseña/verificador/token. La referencia de credencial es metadata opaca, no material criptográfico.

Se configuran journal DELETE y synchronous FULL. Para esta suite aislada se usa **busy_timeout de 1000 ms**, frente a la propuesta inicial no aprobada de 2000 ms, para obtener bloqueo/reintento acotados; debe revisarse al integrar. Toda escritura usa BeginTransaction inmediato, SQL fijo y parámetros. No se utiliza WAL, interpolación de valores del jugador en SQL ni acceso de red.

## Migraciones controladas

- **v1 — initial-relational-schema:** diez tablas, claves, restricciones, unicidad de partida actual e índices de partida/bioma.
- **v2 — documented-query-indexes:** índices `(game_id,biome_id,decision_order)` y `(game_id,committed_at)` documentados en B04.1.

Cada paso actualiza DDL, schema_migrations y PRAGMA user_version dentro del mismo commit. Los checksums SHA-256 normalizan finales de línea a LF para no depender del checkout Windows. Se verifica historia ordenada y checksum; se rechazan versiones futuras, downgrades, historia alterada y esquemas desconocidos no vacíos, sin borrar datos. La apertura del servicio comprueba versión/integridad rápida/FK; cada unidad de trabajo vuelve a comprobar versión física antes de leer/escribir.

La prueba de fallo inyectado durante v2 demuestra rollback de índice, registro y versión a v1; luego la misma migración se aplica correctamente. No existen migraciones para archivos del jugador, reparación destructiva automática, backup productivo o importación del journal antiguo.

## Contratos y responsabilidades

`GameSaveService → UnitOfWork → SQLiteRepository → SyntheticDatabase`.

- Crear/obtener perfil y actualizar nombre normalizado; singleton e identidad local conservados.
- Crear partida y archivar la actual solo con intención y revisión previas explícitas.
- Guardar/cargar agregado, continuar y obtener progreso/ambiente/decisiones ordenadas/paginadas.
- Registrar decisión y consecuencias resueltas por el llamador confiable del catálogo versionado; la infraestructura no decide si approve/reject es bueno/malo.
- Actualizar progreso afirmado y estado ambiental coherente con la decisión, sin cambiar ambiente por patch arbitrario que contradiga la historia.
- Guardar/restaurar snapshot de límite de segmento y punto lógico `segment-start`, sin escenas ni actor real.
- Leer/escribir preferencias permitidas por constructor, únicamente JSON `{value: booleano/numero-finito}` en esta fase; ninguna clave por defecto del juego se inventa.

Los registros separan perfil, partida, progreso/objetivos, decisiones, ambiente, snapshot, setting, recibo y migración. Catálogo de biomas/decisiones/reglas/contenido se suministra externamente. El catálogo de las pruebas es sintético, con IDs de bioma comprobados; no hay evaluador de desbloqueos, finales narrativos o reglas reales de Two Sides implementado.

Las APIs son síncronas y desacopladas: la futura integración debe ejecutarlas fuera del frame principal y capturar/aplicar DTO en el hilo del motor. No se implementa todavía cola de trabajo de Godot ni cambio de escenas.

## Atomicidad e idempotencia

UnitOfWork abre una transacción inmediata, comprueba operationId/propietario/tipo/digest, y devuelve el recibo original si el comando ya hizo commit. Contenido distinto con la misma clave devuelve OPERATION_CONFLICT. Revisión obsoleta produce REVISION_CONFLICT, sin sobrescribir. JSON se canonicaliza y la metadata temporal UpdatedAt no participa en el digest de actualizaciones de proyección.

El servicio inserta primero padres cuando hace falta y luego recibo/decisión/proyecciones/captura dentro de esa transacción. Una actualización valida el agregado completo antes de confirmar. Excepción, constraint o fallo del hook revierte todos los cambios; no quedan recibos de operaciones incompletas. Una nueva partida archiva la anterior y actualiza ambas capturas de revisión atómicamente.

`ITransactionalSaveExtension.BeforeCommit` recibe **la misma conexión y transacción** y un recibo no secreto. B05 podrá insertar su outbox aquí; actualmente no existe cola/tabla/evento estadístico. La prueba Probe escribe un registro sintético y falla: se revierten tanto ese registro como decisión, ambiente, revisión, captura y recibo. No se hace HTTP en el hook.

Errores SQLite se traducen a códigos sanitizados como STORAGE_BUSY, CORRUPT_STORAGE, DISK_FULL, ACCESS_DENIED, INVALID_DATA o IO_ERROR. No se registran SQL, credenciales o valores de usuario. No se borra una base para «resolver» corrupción o versión incompatible.

## Pruebas realmente ejecutadas

Resultado final: **43 aprobadas, 0 fallidas**, sin omisiones; compilación **0 errores y 0 advertencias**. Runtime real .NET 8.0.30, SQLite 3.53.3. Suite backend independiente: **39 aprobadas, 0 fallidas**, sin modificaciones a Express o sus tests.

Cobertura: creación/tablas/índices/FK; perfil/lectura/nombre Unicode/singleton; partidas/archivo/guardado/reapertura; independencia de biomas; decisiones/orden/paginación/ambiente; snapshots/checkpoint; rollback total y de migración; reintento/conflicto/canonicalización/revisión; datos inválidos y SQL injection parametrizada; archivo ausente/corrupción; v1→v2 y checksum/versiones futuras; bloqueo y escritores concurrentes; paths/propiedad/limpieza; configuración acotada y ausencia de campos secretos; independencia de Godot/red; ausencia de cálculos de finales/desbloqueos.

La primera suite tuvo un fallo de aceptación de emoji compuesto por un uso de categorías Regex sobre UTF-16; se corrigió con Rune para categorías y StringInfo para grafemas. Una edición posterior del checksum produjo errores de paréntesis de compilación, corregidos antes de la ejecución final. No se contabilizaron esas ejecuciones como aprobadas. Las bases de las pruebas se limpiaron en los casos ejecutados.

No se simularon corte eléctrico, fallo físico del disco, malware/TOCTOU, enlaces reales hostiles creados por terceros, recuperación productiva o Godot en ejecución. Los tests de locks/corrupción/rollback no equivalen a probar todas esas situaciones. No se prometen restauración exacta a mitad de recorrido, backup del progreso o protección criptográfica de toda la base.

## Límites y siguiente fase

No hay integración con TwoSides.csproj, escenas, Node o Atlas; no se cargó `.env`. No hay credenciales reales, tokens persistidos, DPAPI, outbox, sincronización, reglas finales, objetivos nuevos o checkpoint animal exacto. Versiones de payload admitidas: 1; extensiones ambientales vacías; snapshots estrictamente segment_boundary. Una captura más rica/desconocida se rechaza, no se reemplaza por defaults.

B04.2B requiere autorización específica para archivos C#, ProjectReference, bootstrap/rutas reales, catálogo/versiones y adaptadores de estado. No reutilizar directamente el sandbox de pruebas para una partida existente. Mantener la matriz de conflictos de B04.1 y el SID desconocido de B00 pendientes; no modificar permisos ni acceder al original. Detenerse al finalizar B04.2A.

## B04.2B.2A — Estado vigente de infraestructura (2026-10-25)

Este apartado actualiza el alcance histórico B04.2A anterior. Ahora existe ProjectReference desde TwoSides.csproj a src/TwoSides.LocalPersistence.csproj. Se conserva net8.0 y Microsoft.Data.Sqlite [8.0.32]. No se conecta guardado a escenas, biomas ni perfiles reales.

ISaveDatabase permite reutilizar SchemaManager, UnitOfWork y GameSaveService. SyntheticDatabase conserva comportamiento y las 43 pruebas existentes. DurableTestDatabase implementa únicamente almacén sintético Windows de esta copia; no es un proveedor general ni de producción. No cambia las diez tablas ni migraciones v1/v2: inicializa la base nueva y registra application_id 0x54535054 fuera del esquema de tablas.

Ruta efectiva: C:\Users\luis2\AppData\Local\TwoSides\ReconstructionTests\copy-06dc7ade-b3cd-425b-8d79-90dde8ef1ac6\persistence\save.sqlite3. CopyId estable 06dc7ade-b3cd-425b-8d79-90dde8ef1ac6; no repo/OneDrive/user://. Se crearon aquí save.sqlite3, ownership.json y store.lease, exclusivamente sintéticos. Se conservan al cerrar; ningún Dispose elimina bases duraderas.

Proveedor: ruta absoluta exacta, volumen Fixed, sufijo bajo LocalApplicationData y rechazo OneDrive; handles Windows OPEN_REPARSE_POINT en cada ancestro y archivo, comparación de destino resuelto y bloqueo de rename/delete mientras vive la capacidad. Rechaza reparse/hardlinks y sidecars que sean directorios/enlaces. Creación exclusiva FileMode.CreateNew; directorio sin manifiesto debe estar vacío. Manifiesto enlaza copia/propósito synthetic-infrastructure-only a volumen/FileID del archivo; Ready solo tras migración/verificación. Archivo/manifest desconocido, incompleto, sustituido o versión futura provoca error y no sobrescritura/adopción. Lease con bloqueo por rango serializa proveedores; Pooling=false y ReadWrite sin recreación al abrir conexiones. Integridad/history/FK mantienen verificaciones existentes. Creación interrumpida Ready=false exige intervención, no reinicialización automática.

El manifiesto es reconocimiento local, NO firma/autenticación/cifrado. No protege frente a otro proceso con permisos de escritura que altere simultáneamente datos/sidecars/manifest, ni frente a administrador/malware. Handles estabilizan nombre y ancestros, no dan exclusión contra todo escritor con el mismo usuario. B00 ACL sigue pendiente. No se afirma protección frente a cortes eléctricos en actualización del manifiesto; fallo se rechaza. Se descartan importación, backups y recuperación automática. Producción/desarrollo necesitarán namespaces/proveedores independientes y nueva autorización; este proveedor rechaza cualquier otra ruta.

Adaptador compilado: integration/sqlite/GodotSqliteInfrastructureAdapter.cs, clase C# normal sin Godot.Node, no Autoload. OpenAsync(ruta explícita), GetSyntheticProfileAsync, EnsureSyntheticProfileAsync, CloseAsync y DisposeAsync. Cola SemaphoreSlim/Task.Run, errores sanitizados, apertura/servicio y conexiones dispuestas. Catálogo ficticio infra-test-1/synthetic, nombre fijo Perfil sintético B04.2B.2A y UUIDs locales; sin credenciales. No expone decisiones/partidas/recursos del juego.

Compilación privada: integration/sqlite/run-infrastructure.ps1 -Mode Restore, luego -Mode Build; pruebas nuevas -Mode Test. Restore requiere NuGet y Test requiere permiso de escritura en ruta AppData autorizada. No ejecutarlos automáticamente desde escenas. Restore no inicia Godot; Build compila proyecto C# con SDK/source generators, sin editor/escenas ni exportación. TwoSides.csproj importa explícitamente Sdk.props/Sdk.targets de Godot.NET.Sdk Version=4.6.1 para colocar propiedades de aislamiento antes de Microsoft.Common.props. Conserva TargetFramework/condición Android/EnableDynamicLoading y agrega exclusiones Compile de local-persistence, tests y .work. Las fuentes .cs.txt se compilan únicamente por biblioteca/ejecutores, sin duplicación en juego.

Rutas del build controlado con TwoSidesIsolatedBuild=true: obj/bin Godot en integration/sqlite/.work; biblioteca/ejecutores en local-persistence/.work. CLI home, NuGet packages/http/plugins/scratch/temp también privados. No usar dotnet build directo sin entorno del runner: sus defaults del SDK no equivalen al procedimiento aislado. SDK instalado10.0.400/runtime global10.0.11; pruebas autocontenidas8.0.30. No se instaló SDK/runtime global. Activos NuGet confirman único packageFolder privado; nuget.org y library-packs readonly del SDK como fuentes. Sin cambios de configuración global. NuGetAudit continúa desactivado; no es auditoría de vulnerabilidades.

Resultado: 28 comprobaciones nuevas aprobadas (incluye metadatos TwoSides.dll, native e_sqlite3 de salida win-x64, perfil/reapertura/reinicio de proceso, rollback, disco lleno por max_page_count, sharing denegado sin ACL, rutas/junction/archivo desconocido, errores sanitizados); 43 SQLite y 39 Node aprobadas. Total110. La prueba de permisos usa apertura exclusiva que SQLite traduce ACCESS_DENIED, no edita ACL ni simula otra cuenta. Disco lleno se simula dentro de SQLite, no agotando disco Windows. La suite conserva base/manifest/lease y retira únicamente su junction/archivo temporal propios, sin borrado recursivo.

Biblioteca/ejecutor: cero warnings/errores. Build completo Godot: cero errores y63 advertencias de código legado y generado (obsolescencia/nullability/etc.); build incremental final0/0 no sustituye esa evidencia completa. Microsoft.Data.Sqlite y dependencias aparecen en TwoSides.deps.json; e_sqlite3.dll win-x64 de salida carga y devuelve3.53.3. No se verificó ejecución del motor ni exportación Windows. Las rutas win-x86/arm64 también se copian como assets transitivos, pero no se declaran probadas.

Errores de desarrollo corregidos antes de aprobación: CA1416 por llamada Lock no protegida explícitamente por OperatingSystem.IsWindows; MSB3540 por aislar obj demasiado tarde; sintaxis de versión SDK explícita; nullable del nuevo adaptador; aserción de sharing que esperaba STORAGE_BUSY y recibió ACCESS_DENIED. No se presentan esos intentos como pruebas aprobadas.

Detener tras B04.2B.2A. B04.2B.2B requiere nueva autorización y decisiones de recursos/reglas/fronteras; no crear perfil real ni usar la base sintética como partida productiva.

## B04.2B.2B.2A — Perfil y partidas iniciales invocables desde C#

Implementado en archivos previstos por SAVE_INTEGRATION_CHANGE_PLAN.md, sin tocar escenas, menú, project.godot, TwoSides.csproj, mecánicas o Express. Nuevos proveedores OwnedCopyDatabase/CopyGameDatabase comparten la validación de apertura del proveedor de infraestructura; DurableTestDatabase ahora delega sin cambiar su ruta/propósito/formato/marker. GameSaveService agrega GetActiveGame y GetGameHistory, SQLiteRepository agrega Games parametrizada/paginada. No cambian las diez tablas, modelos ni migracionesv1/v2.

API compilada: integration/sqlite/GamePersistenceAdapter.cs (TwoSides.Integration.Sqlite), clase normal sin Node ni Autoload. Métodos:

- OpenAsync(absolutePath): abre/crea solo la base reconocida de juego, sin perfil/partida automática; devuelve perfil existente o ausencia.
- PrepareProfileCreation(displayName): única entrada de usuario es nombre; normaliza y genera OperationId/LocalPlayerId UUIDv4 con Guid.NewGuid. Retener solicitud para retries.
- CreateLocalProfileAsync(request), GetLocalProfileAsync(), UpdateDisplayNameAsync(operationId,owner,expectedProfileRevision,name): singleton, IDestable y recibos.
- PrepareNewGame(owner,expectedCurrent): generar una solicitud por intención explícita, IDs nuevos y referencia/revisión actual esperadas. No generar otra solicitud para reintentar el mismo clic.
- CreateNewGameAsync(command): reusa transacción existente, archiva actual explícitamente y conserva anterior; nueva actual revision0/menu sin bioma elegido.
- GetActiveGameAsync(owner), LoadGameAsync(owner,game), GetGameHistoryAsync(owner,offset=0,limit=50): agregado/activa e historia con actuales+archivadas. Límite1..100; cada página se valida en una lectura consistente. Orden creadoDESC/gameIdDESC es solo paginación, no regla de biomas.
- CloseAsync() libera proveedor, sin eliminar nada; puede reabrirse. DisposeAsync() cierra definitivamente esa instancia. Operaciones serializadas en worker, sin HTTP o acceso a SceneTree.

LocalSaveResult<T> devuelve Success/Code/Data y recibo cuando corresponde. Error no incluye SQL/ruta privada/secretos. Reintento devuelve recibo original y Data leída ahora; una partida de recibo antiguo puede estar ya archivada, consultar activa explícitamente. Read/load no crean perfil o partida ante error. Segundo perfil y reemplazo de actual sin ID/revisión esperados se rechazan. Recuperación tras proceso nuevo no duplica nada.

Ruta efectiva autorizada: C:\Users\luis2\AppData\Local\TwoSides\ReconstructionTests\copy-06dc7ade-b3cd-425b-8d79-90dde8ef1ac6\game-progress\save.sqlite3. Directorio ausente al preflight. Nuevo propósito copy-game-progress, application_id0x54534743; manifiesto/lease propios, Ready/FileID/CopyId y directorios/archivos/sidecars controlados por WindowsGuard/handles. No OneDrive/user:///producción/ruta arbitraria. SQLReadWrite sin recreación al abrir; unknown/manifest incorrecto falla cerrado. Se aplicaron v1/v2 a esta base NUEVA reconocida, ninguna migración nueva/alteración a infraestructura existente.

La base de infraestructura en persistence sigue con synthetic-infrastructure-only/application_id0x54535054. No se abrió mediante SQLite y sus tres archivos se verificaron íntegros. Reconocimiento local/handles no equivale a autenticación/cifrado o defensa contra malware/otro escritor autorizado, límite anterior conservado.

Estado inicial nuevo reutilizado de contratos/código: perfil LOCAL_ONLY, null en campos de registro/credenciales; partida UUID propia current/in_progress/revision0/menu/currentBiome null; cinco human_pending, AttemptNumber0 y resultados/fechas null; ambientes null con extensiones{}, cero decisiones/objetivos, snapshot boundary/capturedRevision0. Sin recursos, bloqueo, orden, availability, clasificación o final inventado. RealGameCatalog usa reglas técnicas initial-state-only-1 y contenido copy-initial-content-1 solo para reconocer este formato inicial; no ofrece evaluador de gameplay. Desconocidos futuros se rechazan, no se reescribe historia por incompatibilidad.

Uso conceptual de API (requiere autorización de runtime al conectarla a una escena): abrir StoragePath, GetLocalProfile; si falta y el usuario confirma nombre, preparar/comprometer solicitud de perfil; consultar activa/historial. Solo por intención explícita de nueva partida preparar comando con la actual esperada y comprometerlo. No Open→NewGame automático ni formularios de correo/contraseña. El código no se inicializa por mero import/include de proyecto.

MenuPrincipal.Jugar requiere EntryAccessController/HasSession y va a recuperación HTTP. No existe una opción visual inequívoca local de nueva/continúa/historia; no se improvisaron escenas/formularios. Alternativa autorizada cumplida: API C# invocable sin escena, reflejada en TwoSides.dll y referencia única a biblioteca. La UI y sustitución de gates siguen PENDIENTES; juego offline real/menu local no probados ni activados. No editor/Godot/exportación ejecutados.

Comandos: integration/sqlite/run-game-save-checks.ps1 -Mode Restore, después -Mode Build o -Mode Test. Reutiliza run-infrastructure.ps1 SOLO en Restore/Build para entorno ya aislado; no ejecuta su suite de28. Restore nuevo usa locked-mode cuando existe lockfile; sin paquetes nuevos o cambio de versiones. Obj/bin/cachés/CLI/TEMP privados de copia como antes. SDK10.0.400 compila net8.0; pruebas selfcontained.NET8.0.30. No instalaciones/config globales.

Pruebas realmente ejecutadas: primera suite49/49, incluidos creación inaugural de singleton, concurrencia idempotente, NFC/renombre/ID, nueva/activa/historia/archivado, cinco biomas iniciales, cierre/reapertura/proceso nuevo, errores readonlySQLite/rollback/invalid/owner/unknown, ausencia de campos credenciales y referencias HTTP/Mongo/Godot-runtime en ejecutor. Metadatos TwoSides.dll contienen GamePersistenceAdapter y referencia única a biblioteca. Segunda suite48/48 (recupera fixture ya existente, no repite primera creación), confirma conservación del perfil y suma2partidas sin eliminar las anteriores. Se conservan perfil ficticio Prueba José local y4partidas, una actual/tres archivadas. La suite se detiene si reconoce otro nombre/perfil no perteneciente a su fixture; no elimina historia para liberar capacidad.

Regresiones nuevas43SQLite y39backend aprobadas,0fallidas.131comprobaciones en ejecución principal y48adicionales de repetición, sin contarlas como casos diferentes. Los28resultados de infraestructura permanecen históricos, no repetidos porque tocarían su base validada. Suite43 solo limpia sus archivos temporales sintéticos recién creados/propios, nunca las partidas duraderas/históricas. Cero bases temporales de esa suite restantes.

Compilación completa juego0errores/63advertencias legado/generado; biblioteca/ejecutores0/0. Incremental0/0 no sustituye conteo completo de advertencias. Versiones y packageFolder privado verificados; GodotSDK/Sharp/Editor/SourceGenerators4.6.1, Microsoft.Data.Sqlite/Core8.0.32, SQLitePCLRaw2.1.13; nativeSQLite3.53.3 funciona en ejecutor de Windows. No nueva dependencia, duplicación de fuentes, cambio a csproj raíz ni corrección de advertencias fuera de alcance.

Archivos nuevos8: src/OwnedCopyDatabase.cs.txt, src/CopyGameDatabase.cs.txt, game-save-tests/{GameSave.Checks.csproj,GameSaveChecks.cs.txt,packages.lock.json}, ../integration/sqlite/{GamePersistenceAdapter.cs,RealGameCatalog.cs,run-game-save-checks.ps1}. Código existente modificado3: src/DurableTestDatabase.cs.txt, src/GameSaveService.cs.txt, src/SQLiteRepository.cs.txt. Documentos autorizados actualizados en backend y este README. No cambios de modelos/validación/schema ni interfaz ISaveDatabase/UoW.

B00 riesgoACL sigue pendiente. Recursos/decisiones/bloqueo/final/B05 no implementados en esta fase; no inferirlos de los métodos existentes de biblioteca o sus tests previos. B04.2B.2B.2A completada por alternativa sin escena; B04.2B.2B.2B requiere nueva autorización. No abrir el proyecto original ni afirmar verificación de su base: no se accedió a ella.
## B04.2B.2B.2B — Núcleo de progreso y decisiones (resultado PARCIAL)

La implementación añade persistencia/verificación de progreso por partida, bloqueo terminal completed y decisiones confirmadas, sin conectar Godot visualmente. Disponibilidad real de incompletos permanece BLOQUEADA/PENDIENTE: no existe política local aprobada suficiente. No declarar esta subfase completamente aceptada ni copiar la política de tests al juego.

Código existente modificado7: src/Models.cs.txt, src/Validation.cs.txt, src/GameSaveService.cs.txt, src/SQLiteRepository.cs.txt, ../integration/sqlite/GamePersistenceAdapter.cs, game-save-tests/GameSaveChecks.cs.txt y ../integration/sqlite/run-game-save-checks.ps1. Nueva fuente única src/GameRulePolicy.cs.txt, ya enumerada en plan. Sin cambios a proyectos/paquetes/proveedores/ISaveDatabase/UoW/SchemaManager, scripts de juego/escenas/menús/Express o bases duraderas. Documentos actualizados7 autorizados (incluido este README). No B05 ni recursos/final global nuevos.

API nueva de GameSaveService: GetGameProgress(owner,game)→vista de cinco biomas; GetBiomeAccess(owner,game,biome)→Progress/Availability/Activity/permisos/Reason; GetCompletedBiomes; EnterBiome(EnterBiomeCommand); CompleteBiome(CompleteBiomeCommand). Adapter expone versiones Async y RecordDecisionAsync/GetDecisionsAsync/GetEnvironmentAsync. Todos usan servicio/UoW, ningún SQL/efecto de juego/HTTP en adaptador o repositorio. Consultas solo lectura verificadas por hash/fecha del archivo.

Estados SQL continúan human_pending/animal_pending/completed. Activity=pending/in_progress/completed es proyección derivada de estado/punto actual, no enum SQL ni historial de visitas. Entrada humana guarda CurrentBiomeId/human_decision, no inventa flag persistente de misión; animal_pending implica decisión/avance confirmado. Availability=available/unavailable/unknown proviene de IBiomeAvailabilityPolicy puro/confiable de composición, nunca input de jugador. Default null→unknown/permisosfalse/AVAILABILITY_UNDEFINED. Completed siempre unavailable/permisosfalse antes de consultar política; archivada también inaccesible. CanReplay no concede acceso por mera existencia de fila.

EnterBiome valida owner/current/revisión/catálogo, no completed, disponibilidad y etapa human/animal; guarda continuación/revisión/recibo atómicos. Solo fixture usa una política que permite ocean/deniegajungle/dejaotrasunknown: no es desbloqueo real ni orden nuevo. Sin regla real, no se habilita entrada. Las mutaciones que reciben resultado ya confirmado no evalúan disponibilidad ni conceden permiso de escena; guardar estado no autoriza jugar.

CompleteBiome acepta ConfirmedResult good/bad aportado por lógica de juego y compatible con ambiente según comprobación ya existente (healthy↔good/degraded↔bad); no clasifica decisiones ni inventa fórmula final. Requiere animal_pending con decisión válida; fija completed/fecha/resultado, menu/snapshot/revisión y recibo en un commit. Estado por GameId/BiomeId absorbe nuevos intentos; guardas en EnterBiome, RecordDecision, SaveCurrentGame que apunta al bioma, UpdateBiomeProgress, UpdateEnvironment y PutBiome del repositorio. Consultar historia sí se permite. Nueva partida crea filas propias, no hereda completed. Retry mismo ID/digest retorna recibo original incluso tras archivar; otro comando incompatible no escribe.

Instancia lógica actual de decisión=(GameId,BiomeId,DecisionKey). Keys reales del catálogo se conservan. DecisionId identifica ocurrencia UUID única en archivo; usar misma key local en otra partida está permitido, reutilizar UUID global no. HasDecision consulta bajo transacción inmediata en servicio/repositorio; otro ID u opción para instancia confirmada da DECISION_CONFLICT (o conflicto de revisión si obsoleto). Mismo OperationId con cambios da OPERATION_CONFLICT, originalidéntico retorna recibo. No se reemplaza ni ejecuta consecuencia una segunda vez; Load valida ausencia de duplicados lógicos. SQL directo fuera de servicio puede eludir guardas: no se añadió índice UNIQUE lógico o trigger, no prometer lo contrario. Un futuro refuerzoDDL requiere nueva migración autorizada, sin editar v1/v2 o base protegida.

Clasificación opcional EnvironmentalClassification(Kind,Version) en RecordDecisionCommand, valores declarados favorable/perjudicial y versión de procedencia con sintaxis acotada. Sin Classification, guardar/leer consecuenciasv1 stateKind y null, conservando también la forma del digest de recibo v1; ninguna clasificación se deriva automáticamente de opción, botón, ambiente o resultado. Cuando llamador confirma una clasificación ya definida, guardar metadata explícita en JSONconsecuenciasv2 y recuperarla mediante propiedad Classification del modelo; no otra columna/copia duplicada. Version es etiqueta declarada, no validación de un evaluador de diseño inexistente. Entrada ConsequencesJson del comando sigue stateKind original; conservar command para retries, no reconstruirlo desde JSONenriquecido. Nuevos lectores soportan v1/v2, payload desconocido se rechaza. No DDL/user_version/migración nuevos; JSONCHECK existente admite representación.

No se abren con SQLite las bases AppData game-progress (perfil ficticio/cuatro partidas previas) o persistence (infraestructura), ni se mutan manifests/leases. Todas las nuevas escrituras ocurren en SyntheticSandbox recién creado bajo .work/databases/UUID/UUID.sqlite3, con limpieza solo de fixtures propias nuevas. Prueba de reinicio usa clase de test ReadOnlyFixture: path absoluto restringido a UUID bajo ese sandbox, ancestros/archivo sin reparse y SqliteOpenMode.ReadOnly; recupera agregado tipado, bloqueo y consecuencias sin escribir. No se añade capacidad de lectura arbitraria a API de producción.

Comando seguro de nueva suite: ../integration/sqlite/run-game-save-checks.ps1 -Mode Progress. Compila con entorno privado y ejecuta --progress, nunca el modo básico Test que escribiría la base duradera anterior. No se repiten suites básicas49/48 ni infraestructura28 por protección de datos. Las43regresionesSQLite usan fixtures nuevas y39Node solo memoria/loopback; ambas aprobadas. No restore/red o instalación nueva: paquetes/cache/CLI/obj/bin/TEMP controlados como antes, net8.0/SDK10.0.400/test.NET8.0.30/SQLite3.53.3.

Resultado final38escenarios nuevos/0fallidos (incluye27áreas solicitadas y defensas adicionales);43SQLite+39backend aprobados=120casos en validación final, sin sumar repeticiones37preliminares o suites históricas. La suite final se repitió después de agregar Activity derivada, mismos38/38. Incluye concurrencia idéntica/diferente de decisión/completion, errores reales SQLFK e inyección precommit, idempotencia después de archive, propiedad/invalids/etapas, consultas sin cambios hash/fecha, aislamiento de partidas y lectura en proceso nuevo. No certifica disponibilidad real, motor/export, clasificación automática, snapshots de recursos, seguridad contra SQL externo o estadística B05.

Compilación completa reconstruida TwoSides.csproj:0errores/63advertencias preexistentes/0advertencias en código nuevo. Biblioteca/ejecutores0errores/0advertencias. Metadatos TwoSides.dll contienen fachada de progreso, referencias y dependencias existentes sin duplicación o cambio csproj; nativeSQLite operativo en tests. Primeros intentos de tests tuvieron clase aún no añadida y paréntesis sobrante corregidos antes de aprobación; no se presentan como aprobados. Corrección de sintaxis PowerShell en captura de advertencias antes del rebuild satisfactorio, sin cambios funcionales ni datos afectados.

Estado PARCIAL/EN_PROCESO, disponibilidad real bloqueada hasta confirmación de regla y composición. Siguiente paso es resolver esa dependencia y autorizar alcance posterior, no integrar escenas/menús o iniciar B05 automáticamente. Final global, recursos y objetivos nuevos siguen pendientes y no se inventan. Riesgo ACL de B00 sigue documentado; .env y624archivos protegidos, incluidas ambas bases/SchemaManager/proyectos/gameplay/Express, íntegros.
## B04.2B.2B.2B.2 — Disponibilidad libre aprobada y finales preservados

Decisión expresa del usuario: los cinco biomas están disponibles inicialmente, se elige libremente el orden, no hay desbloqueo secuencial. Sustituye RF-021 sin modificar el DOCX original. Decisión/consecuencias no completan nivel; solo condición real confirma completion y bloqueo de ambas perspectivas por GameId. Otros incompletos permanecen disponibles; nueva partida no hereda bloqueos; archivo histórico no admite juego.

Implementado en archivos previstos: FreeBiomeAvailabilityPolicy en GameRulePolicy.cs.txt; GameSaveService usa esta política por defecto, conserva puerto explícito para otras políticas confiables/fixtures. Política comprueba pertenencia a ocean/jungle/desert/forest/tundra, partida current/in_progress y estado human_pending/animal_pending. Access mantiene bloqueo de completed/archivada independiente y etapa humana/animal. Unknown solo subsiste si se inyecta deliberadamente policyunknown; ya no es default real. Sin DDL/migración/formato persistente nuevo, sin tocar bases duraderas. human_pending sigue etapa antes de decidir, no bloqueo.

AreAllCanonicalBiomesCompleted(owner,game) usa agregado validado de una partida y comprueba exactamente una fila completed por cada IDcanónico; decisiones no cuentan, otros GameId no se mezclan, funciona en archivo histórico por lectura sin habilitarlo. Adapter expone AreAllCanonicalBiomesCompletedAsync. No marca Status final_pending/completed, no escribe ni selecciona final, no exige perspectivas extra. Cuatrofalse/cincotrue, estable en proceso nuevo comprobado. Completar uno mantiene disponibles los demás; idempotencia/terminalidad/revisión/transacción conservadas.

Finales: usuario confirma demo probada con Bueno/Medio/Malo correctos según decisiones. Esa confirmación funcional es autoridad del producto, no fórmula nueva a sustituir. En esta copia la cadena localizada es Final.tscn→Final._Ready (scripts/Final.cs)→EndingService.ConfirmedEnding→GameStateStore.Snapshot/ApplyConfirmed/Valid. Final selecciona presentación good/medium/bad; no calcula umbrales. AnimalProgressService.Send recibe AnimalConfirmationDto con GameStatus/Ending/GoodBiomeCount/EndingRulesVersion y recupera snapshot completo con GameService.CurrentAsync; AnimalSegmentFlow.Start decide navegar a Final si Endings ya confirma. Se siguieron referencias hasta cliente HTTP y backend/src actual, donde no existe evaluador de progreso/finales. Cálculo numérico real NO localizado con certeza dentro de alcance permitido; no significa que la demo no lo calcule. No abrir original, inventar mayoría/puntaje, cambiar umbrales o reemplazar mecánica comprobada por el usuario.

Entradas identificadas: GameDto.Id/Revision/Status/RulesVersion/Biomes/Ending/GoodBiomeCount/EndingRulesVersion/CompletedAt; BiomeDto.BiomeId/Status/EnvironmentState/Result/HumanCompletedAt/AnimalCompletedAt/Available. Decisión confirmada actual por EnvironmentalDecisionService y DecisionSceneFlow actualiza proyección y VariablesGlobales.BiomaSaludable; _estadosNiveles es caché de resultados por TipoNivel. No es acumulador global demostrado. AnimalProgressService confirma completion por HTTP y GameStateStore valida cinco completed/countgood, pero validar conteo no es calcular ending. Final lo consulta en Ready y Process; transferencia entre escenas por GameApplicationContext.Services.Progress/Endings, no estado local del árbol persistido en SQLite.

SQLite ya conserva owner/GameId/revisión/reglas/contenido, decisiones/opciones/orden/consecuencias/clasificación definida opcional, estado/resultados/fechas por bioma. SavedGame modela Ending/EndingRulesVersion/CompletedAt, pero UpdateGame aún no los escribe y SaveCatalog rechaza ending; no afirmar restauración completa del final. GoodBiomeCount podría derivarse del agregado con reglas compatibles, no es hoy campo SQLite ni fórmula autorizada. Cachés de sesión/verificación no se restauran como identidad local. Pendiente localizar evaluador real y contrato exacto de entradas, luego adaptar/hidratar sin recalcular resultados distintos o duplicar consecuencias. Recursos/mundo y motor no conectados.

Futuro completion desde FinNivel.OnBodyEntered→FinalizarNivel: usar GameId actual recuperado del contexto local, BiomeId canónico derivado de NivelActual y validado contra SceneFilePath/SceneFor; validar cuerpo/grupojugador y evento real, etapa animal_pending/perspectiva correcta, revisión/generación capturada al comenzar y revalidada, OperationId estable por finalización. No confiar en GameId/result/flag de UI sin cotejo. Acknowledge presentación solo tras commit, retries misma operación. Servicio actual valida dominio persistente pero no autentica contacto físico; no conectar señal ahora. RecordDecision no debe llamar CompleteBiome.

Pruebas futuras de compatibilidad de finales: para cada trayectoria que la demo ya validó, registrar agregado y resultado del evaluador existente, cerrar/continuar en nueva sesión e hidratar mismas entradas/versiones, comparar resultado idéntico Bueno/Medio/Malo; ninguna decisión/efecto/evento duplicado, apertura/tween no vuelve a finalizar y partida nueva no cambia historia anterior. Requiere evaluador localizado y autorización motor, NO ejecutado aquí. Ninguna fórmula final implementada.

Archivos de código modificados únicamente4 ya previstos: local-persistence/src/GameRulePolicy.cs.txt, GameSaveService.cs.txt, integration/sqlite/GamePersistenceAdapter.cs y local-persistence/game-save-tests/GameSaveChecks.cs.txt. Sin cambios a repositorios/modelos/SchemaManager/proveedores/proyectos/escenas/gameplay/menús/Express. Tests existentes de policyunknown se ajustan para inyección explícita y se agregan cuatro escenarios con múltiples comprobaciones (incluidas23áreas solicitadas), además de38regresiones de progreso/concurrencia/rollback.

Validación actual42/42progreso,43/43SQLite,39/39backend=124aprobados/0fallidos. Nuevos4escenarios agrupados y38anteriores separados de43+39regresiones; no sumar repeticiones como casos nuevos. Fixtures nuevas bajo .work, childreadonly UUID, cero bases temporales restantes. Suites49/48/28 no repetidas para proteger datos duraderos. No afirmar selección final probada en motor.

Incompatibilidad de compilación detectada: TwoSides.csproj actual en baseline solo contiene SdkGodot.NET4.6.1/TargetFramework/Android/EnableDynamicLoading; NO ProjectReference a biblioteca ni importdeBuildIsolation, a diferencia del estado reportado en fases previas. Fecha/bytes/hash coinciden antes/después de esta fase: no se revirtió ni modificó el archivo protegido. Compilación Godot falla con35errores de namespace/tipos LocalPersistence no referenciados;12warnings antes de abortar no sustituyen las63advertencias históricas de build correcto. Rebuild de biblioteca independiente confirma0errores/0warnings, ejecutor net8.0también0/0. No corregir csproj sin autorización. Componente de validación Godot PARCIAL/BLOQUEADO por referencia ausente, aunque servicios/policy/consulta pasan. Los intentos fallidos no son resultados aprobados ni pruebas de selección final.

Procedimiento alternativo de validación: local-persistence/run-checks.ps1 establece CLI/NuGet/TEMP/build privados y ejecuta43fixtures; luego dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore --disable-build-servers -nodeReuse:false y ejecutor .work/bin/GameSave.Checks/Debug/net8.0/win-x64/GameSave.Checks.exe --progress. No ejecutar ModeTest que tocaríagame-progress; runnerModeProgress actual intenta Godot y por eso queda bloqueado antes de tests. SDK10.0.400/test.NET8.0.30/SQLite3.53.3, dependencias sin cambios. No nuevos paquetes/config global/restore/migraciones requeridos. Un intento de diagnóstico ResolveReferences reveló que assets actuales del proyecto apuntan a paquetes globales preexistentes: no se restauraron ni instalaron; no declarar esa resolución como buildprivado correcto del juego.

Estado: implementación de disponibilidad libre y consulta completa VALIDADA; resultado global de subfase PARCIAL por compilación Godot protegida sin referencia, no por reglas de disponibilidad. Auditoría de finales documentada con cálculo exacto PENDIENTE DE LOCALIZACIÓN, conservando confirmación del usuario. No conexión visual, cálculo final, recursos, B05 o nueva fase. B00 riesgoACL sigue pendiente independiente.
## B04.2B.2B.2B.3 — Reparación mínima de compilación

Estado COMPLETADA, 2026-10-25. Solo se modificó código de configuración en TwoSides.csproj, más estos documentos autorizados. No se implementó gameplay ni se ejecutó Godot.

Diagnóstico: archivo actual sin ProjectReference, ruta relativa local-persistence/src/TwoSides.LocalPersistence.csproj existente y compatible net8.0; biblioteca usa Compile explícito *.cs.txt y Microsoft.Data.Sqlite[8.0.32]. El informe B04.2B.2A registra una referencia y exclusiones anteriores con imports SDK explícitos, mientras el archivo previo de esta reparación tenía solo Sdk/PropertyGroup. Búsqueda de proyectos/props/targets no encontró referencia activa en otro archivo. Git solo muestra commit inicial645d213 para este proyecto; no demuestra cuándo/quién/proceso cambió configuración. Hecho comprobado: ausencia respecto al informe; causa de pérdida/regresión NO determinada. No atribuir a usuario, OneDrive, herramienta o rollback sin evidencia; no restaurar todo un archivo histórico.

Cambio mínimo: conservar Project Sdk=Godot.NET.Sdk/4.6.1 y las tres propiedades originales(TargetFrameworknet8.0, condiciónAndroidnet9.0, EnableDynamicLoadingtrue). Agregar únicamente ItemGroup con ProjectReference Include="local-persistence/src/TwoSides.LocalPersistence.csproj" y Compile Remove="local-persistence/**/*;integration/sqlite/.work/**/*". No duplicar código SQLite o DLL manualmente. Evaluación MSBuild:83Compile inputs,0fuentes internas/tests/artefactos en Compile y1ProjectReference. No cambios de SDK/paquetes/versiones/estructura completa o a otros archivos de configuración.

Aislamiento de validación: reutilizar SOLO preámbulo existente de integration/sqlite/run-infrastructure.ps1 hasta antes de $config para establecer entorno privado DOTNET_CLI_HOME/NUGET_PACKAGES/cache/scratch/TEMP/MSBUILDDISABLENODEREUSE; con $PSScriptRoot resuelto a integration/sqlite. No editar runner ni imports tempranos del proyecto. Pasar GodotProjectDir absoluto con barras/ final a integration/sqlite/.work/ por línea de comando: el SDK coloca bin/obj bajo integration/sqlite/.work/.godot/mono/temp. Biblioteca/ejecutores y cachés siguen local-persistence/.work. Esta propiedad es solo ruta de SDK en compilación, no nueva raíz de escenas ni cambio project.godot. No usarla para ejecutar/exportar juego. Defaults de un build directo sin este entorno pueden usar .godot y cachés de usuario: procedimiento privado explícito es requisito de validación.

Comandos bajo ese entorno: dotnet restore TwoSides.csproj --configfile local-persistence/NuGet.Config --packages <privatepackages> --disable-parallel -p:GodotProjectDir=<absolute integration/sqlite/.work/>; dotnet build TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -p:GodotProjectDir=<mismo> -v:q. Restore repara activos de ese destino, sin paquetes actualizados ni instalaciones/globalconfig; único packageFolder privado verificado en project.assets.json. Nativeassets incluidos por NuGet sin copias manuales.

Primer setup diagnosticó variable de raíz no asignada y luego un argumento Windows con barra invertida final absorbió -v:q en PowerShell nativo, provocando rutas inválidas/NETSDK1004/MSB3191; corregir solo comando con separadoresforwardslash antes del restore/build satisfactorio. No ocultar intentos fallidos como aprobados; no bases ni gameplay afectados. No hizo falta modificar otros archivos permitidos o pedir ampliación de alcance.

Resultado build Godot:0errores,63advertencias distintas preexistentes (código legado/generado),0nuevas en adaptadores/biblioteca. Biblioteca y ejecutores compilan0errores/0advertencias. SDKGodot4.6.1, net8.0/SDK10.0.400 y runtime de tests8.0.30 conservados; Microsoft.Data.Sqlite/Core8.0.32 y SQLitePCLRaw2.1.13, sin versión nueva. PowerShell Add-Type con DllImport absoluto de e_sqlite3.dll de salidaGodot/runtimes/win-x64/native llamó sqlite3_libversion y devolvió3.53.3; temporales en carpeta privada. No editor/motor, escena, export o SQLite de jugador abiertos para esta carga. Verificación -getItem:Compile,ProjectReference confirma exclusiones/referenciaúnica.

Regresiones reales:42/42progreso-disponibilidad +43/43SQLite +39/39backend=124aprobadas,0fallidas. Nuevasfixtures temporales y childreadonly solo de fixtures, cero bases temporales restantes; backend memoria/loopback sin Atlas. Suites duraderas49/48/28 no ejecutadas para preservar game-progress y persistence. Carga nativa es comprobación adicional, no se cuenta como nueva prueba de final. Disponibilidad libre/consultaAll/idempotencia/rollback conservados sin modificar lógica.

Integridad:623archivos protegidos comparados antes/después, hashes/fechas/ACL .env y ambos almacenes con manifiestos/leases intactos. El inventario excluye únicamente TwoSides.csproj por ser el cambio autorizado frente a los624anteriores; incluye SchemaManager/escenas/scripts/actores/NPC/menús/assets/Express y adaptadorinfra. Cuatro partidas previas permanecen por archivo idéntico, no se abrieron/migraron/escribieron/eliminaron auxiliares. .env278bytes/SHA2564DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, fecha/propietario/ACL/atributos iguales. No valores impresos. Original no accedido; causa histórica de referencia ausente no determinada. B00 riesgoACL sigue pendiente.

Archivos actualizados exactamente6: TwoSides.csproj y backend/docs/{PHASES.md,PHASE_HISTORY.md,DECISIONS.md,GODOT_SQLITE_INTEGRATION_PLAN.md}, local-persistence/README.md. No tests u otros scripts modificados. Reparación COMPLETADA; siguiente integración visual/ejecuciónGodot requiere autorización nueva. Cálculo exacto de finales pendiente de localizar, demo del usuario preservada; no finales/recursos/B05 nuevos ni conexión escenas. Detenerse aquí.

## B04.2B.2B.2C.2A — Perfil y partidas en menú local (2026-10-25)

Estado: **implementación y validación automatizada terminadas; PENDIENTE DE VALIDACIÓN RUNTIME (EN_PROCESO)**. No se ejecutaron editor ni videojuego. Esta actualización sustituye las propuestas de C.1 únicamente para composición/perfil/partidas/admisión a selección; decisiones desde escenas, FinNivel, recursos y finales siguen sin conectar. No se inició B05.

Ampliación expresa aprobada en esta conversación: base nueva y separada `local-persistence/.work/runtime-game/save.sqlite3` y cambios mínimos en `local-persistence/src/CopyGameDatabase.cs.txt` y `OwnedCopyDatabase.cs.txt`. Las rutas AppData game-progress y persistence permanecen protegidas; ninguna se abre desde el modo runtime. No se importan las cuatro partidas ficticias ni se copian sus perfiles. El almacén runtime aún NO se ha creado/abierto durante esta validación; se inicializará al primer inicio manual. Su ubicación dentro de .work es duradera para este flujo y no debe borrarse como caché.

GameApplicationContext._Ready compone un único GamePersistenceContext hijo del Autoload existente. No crea ApiClient, journal user://, servicios de autenticación, ConnectivityOverlay ni OceanDecisionContext en el inicio local. El código HTTP se conserva en una rutina privada no invocada, pendiente de sincronización futura; Services remoto no está inicializado en este modo. No hay cuenta técnica, tokens, correo ni contraseñas nuevos. VariablesGlobales y ambiente permanecen intactos.

LocalGameState usa un puerto ILocalMenuStore implementado por GamePersistenceAdapter. Inicialización coalescida, apertura serial en worker, perfil/partida/revisión y resultados controlados, sin Node en el worker. Solo crea perfil por intención de guardar nombre y partida por intención de nueva partida; volver al menú o reiniciar la proyección no genera registros. UUID/op/payload se conservan durante reintento; fallo de lectura no equivale a ausencia. No hay sustitución volátil ni fallback HTTP.

MenuPrincipal crea LocalProfileView desde código porque la escena existente no tiene nombre ni Continuar. Se reutiliza su contenedor y se oculta el botón de textura ambiguo; la vista aprobada muestra guardar nombre, nueva partida y continuar según estado. No se modifica .tscn. Nombre NFC validado por servicio; perfil existente se recupera, no se vuelve a solicitar. No existe función de renombrar en el menú: no se añadió; UpdateDisplayName previo conserva su contrato y pruebas.

Nueva partida relee la actual y utiliza PrepareNewGame/CreateNewGameAsync con ExpectedCurrentGameId/Revision; confirma en diálogo si hay una activa, archiva sin borrar e inicializa cinco biomas disponibles libremente. No muestra éxito hasta commit y relectura. Reintentar respuesta perdida recupera recibo sin duplicar. Continuar relee SQLite y solo admite la frontera de menú v1 reconstruible de una partida current/in_progress con owner/revisión coherentes. Una frontera de segmento que necesita restauración no implementada se bloquea con mensaje y no se reinicia. Navegación fallida conserva el commit y permite reintentar Continuar.

MenuNiveles admite el ticket local y muestra selección existente + aviso y volver al menú. TarjetaNivel no se modifica: al no existir controller remoto en modo local, las tarjetas permanecen deshabilitadas como límite de esta subfase, NO como una política de disponibilidad persistida. Los cinco siguen disponibles en dominio/SQLite; el aviso explica que la entrada a biomas se conectará después. No se permite entrar a escenas cuyas decisiones todavía exigen el flujo remoto. El juego completo offline aún no está implementado ni validado. Conectar tarjetas/controlador a escenas corresponde a la siguiente autorización, B04.2B.2C.2B según la solicitud.

Proveedor runtime: ruta exacta cerrada, purpose copy-runtime-game, application_id 0x54535254, manifest con identidad de archivo/Ready y lease existentes, esquema existente sin DDL nuevo. Se reutilizan comprobaciones de propiedad/final-path/reparse/hardlink; desconocidos fallan sin adoptar ni migrar. La capacidad runtime se ancla en la raíz exacta local-persistence, validando su handle y cada descendiente. Sus ancestros OneDrive/Desktop tienen metadatos reparse de nube observados; no se relajan las comprobaciones de archivos/raíz/descendientes ni el modo AppData legado. Verificación de apertura duradera y comportamiento del motor queda pendiente de la prueba manual; no se afirma que las fixtures temporales validen ese montaje real.

Resultados efectivos finales: **26 pruebas nuevas de menú + 42 progreso + 43 SQLite + 39 backend = 150 aprobadas, 0 fallidas** (sin sumar repeticiones). Las 26 usan coordinador real + servicio/UoW/repositorio/SQLite real en SyntheticSandbox y puerto de almacenamiento de fixture, con fallos inyectados; comprueban también que el adaptador runtime real rechaza la ruta protegida ANTES de acceso. No ejecutan nodos/UI/Godot ni crean datos en la base runtime. Reinicio del menú se prueba con nuevas instancias del coordinador sobre fixture; no se presenta como reinicio real del motor. Las regresiones de progreso incluyen comprobación de lectura en proceso hijo sobre fixture.

Biblioteca y ejecutores: 0 errores/0 advertencias. Godot C#: compilación correcta, 0 errores, 63 advertencias preexistentes ParallaxBackground en compilación de scripts, 0 nuevas atribuibles a esta fase; build final de scripts 63 advertencias preexistentes y 0 nuevas (un build incremental anterior emitió 0). MSBuild: 86 Compile items, 1 referencia a la biblioteca y 0 fuentes filtradas desde local-persistence o integration/sqlite/.work. .NET de pruebas 8.0.30, SQLite 3.53.3, paquetes/esquema/csproj del juego sin cambios. Entorno/build privados mediante preámbulo de run-infrastructure y GodotProjectDir a integration/sqlite/.work/.godot/mono/temp; sin editor/export/configuración global.

Verificación: **1,506 archivos existentes protegidos** fuera del inventario de cambios comparados por tamaño/hash/fecha, ambos almacenes protegidos con sus seis archivos (DB/manifiesto/lease) intactos. Cuatro partidas conservadas por identidad binaria de game-progress, sin consultas SQL. .env 278 bytes, SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, fecha/atributos/propietario/ACL iguales; no se leyeron valores. B00 sigue BLOQUEADA por riesgo ACL heredado Modify, sin cambios de permisos. Cero bases sintéticas temporales restantes.

Próximo paso: pruebas manuales acotadas abajo, y después autorización explícita de integración de tarjetas/biomas. No conectar decisiones, FinNivel, recursos o finales por extensión de esta entrega.


### Guía manual pendiente (solo copia de pruebas)

1. Abrir la copia con Godot C# y compilar desde el flujo habitual del editor bajo control del usuario; no exportar ni cambiar configuración global. La compilación automatizada fue aislada y no implica que la caché habitual .godot contenga la nueva DLL.
2. Sin iniciar el backend y sin internet disponible para el juego, ejecutar la escena inicial. Esperado: vista local sin correo/contraseña ni pantalla de login; primera apertura crea exclusivamente el nuevo almacén runtime autorizado. Si falla el almacenamiento, mostrar error y detener operación; no borrar base ni modificar ACL para forzarla.
3. Introducir solo nombre visible y guardar. Debe aparecer el nombre persistido; no debe existir partida hasta pulsar Nueva partida.
4. Pulsar Nueva partida: tras confirmación de SQLite se abre la selección existente con aviso de integración de biomas pendiente. Las tarjetas no abren niveles en esta subfase; no probar decisiones ni FinNivel.
5. Volver al menú: aparece Continuar y no se pide nuevamente el nombre. Continuar recupera la misma partida y abre selección sin crear otra.
6. Cerrar/reabrir el juego: mismo perfil/nombre/partida. Crear otra partida solo por intención explícita y confirmar archivado; verificar conservación del historial mediante lectura local autorizada futura, sin abrir ni escribir las dos bases protegidas.
7. Si aparece guardado pendiente/fallo de navegación, reintentar la MISMA operación; no repetir Nueva partida como sustituto de Continuar. Un punto de segmento no soportado debe mostrar limitación sin reiniciar sus recursos/progreso.

Registrar capturas de menú, nombre, selección/aviso, vuelta y reapertura, sin secretos. Los puntos visuales/layout, apertura nativa duradera bajo OneDrive, señales, cierre del motor y persistencia real entre procesos Godot permanecen **PENDIENTES DE VALIDACIÓN RUNTIME**. No ejecutar automáticamente esta guía desde Codex.


## B04.2B.2B.2C.2A.1 — Menú compacto y partida única (2026-10-26)

**Código COMPLETADO; PENDIENTE DE VALIDACIÓN RUNTIME del diseño y botones.** Esta decisión del usuario sustituye expresamente la política anterior que permitía archivar/reemplazar una partida incompleta por una intención de Nueva partida. Las descripciones anteriores se conservan como historia, no como regla vigente.

El usuario confirmó por prueba manual de C.2A: inicio sin Node.js, nombre visible sin credenciales, creación/continuación de partida, persistencia del perfil tras reinicio y ausencia de errores SQLite observados. Esa confirmación no valida el layout ni la restricción añadidos aquí. No se ejecutó Godot/editor/exportación durante C.2A.1.

### Diagnóstico y corrección visual

Centro era un CenterContainer con anchor_left=0.23, top=0.41, right=0.48, bottom=0.61 y offsets right=190/bottom=151. En el viewport lógico 640×360 su región comenzaba en y=147.6 y acababa en y=370.6, ya fuera del límite inferior incluso antes del crecimiento mínimo de los controles. La nueva vista de perfil y acciones aumentó ese mínimo; márgenes interiores de25 y mensajes largos agravaban el recorte.

Se conservan la escena, fondo, título dibujado TWO SIDES, imágenes, texturas y StyleBoxTexture originales. Centro ahora usa anclajes completos y márgenes exteriores x=8, superior72/inferior8 para reservar el título; el contenedor resuelve centrado del tablero sin los antiguos offsets de colocación parcial. Margen pasa a12 horizontal/8 vertical; Contenido usa separación6. LocalProfileView aplica fuente12 a sus controles,11 al estado, separación4 y ancho mínimo260 para envolver mensajes. El nombre permanece visible también ante mensajes transitorios. No se añadió contenedor ni pantalla, no se escaló/reemplazó ningún sprite ni se cambió project.godot o la resolución.

Revisión **ESTÁTICA**, no medición del motor: región disponible de Centro x8/y72/ancho624/alto280 en640×360 → x16/y144/ancho1248/alto560 a1280×720, borde inferior704 dentro de720. El tamaño mínimo final de panel/controles y la ausencia de recortes/solapamientos reales requieren prueba manual; no se presentan como pruebas visuales aprobadas.

### Política transaccional y comportamiento

GameSaveService.HasUnfinishedGames consulta todo el historial del perfil mediante COUNT, sin paginación que pueda omitir un registro antiguo. En CreateNewGame se repite la comprobación dentro de UnitOfWork.Write/BEGIN IMMEDIATE, después de validar propietario y antes de insertar. Devuelve **GAME_IN_PROGRESS** si hay cualquier partida no cerrada. Se retiró el bloque que archivaba automáticamente la actual. No se alteran tablas, migraciones, esquema ni partidas existentes.

Reconocimiento conservador de cierre: únicamente status=completed junto con Ending good/medium/bad, EndingRulesVersion no nula e igual a RulesVersion y CompletedAt no nulo. is_current para completed ya es0 por CHECK existente. Status archived NO demuestra cierre, incluso si no hay partida actual; status in_progress/final_pending bloquea siempre. Esos campos son el contrato del futuro escritor confiable, no prueba criptográfica del origen de un archivo manipulado. No se los asigna en producción desde esta fase, no se agrega endpoint/cierre y no se reconoce un final por mayoría, consulta de biomas o apertura de menú.

El recibo idempotente existente sigue consultándose antes de ejecutar una intención nueva: mismo OperationId/digest recupera su resultado confirmado; no autoriza una segunda partida. UUID distintos concurrentes tienen un solo ganador. Un conflicto nuevo no convierte un error en éxito; el coordinador descarta esa intención rechazada y relee el estado, mientras los errores de resultado incierto conservan la intención para retry.

GamePersistenceAdapter expone HasUnfinishedGamesAsync. LocalGameState consulta la política desde SQLite y expone CanStartNewGame; LocalProfileView deshabilita Nueva partida si existe una sin cerrar. MenuPrincipal elimina el diálogo de reemplazo y rechaza esa acción con mensaje breve. Perfil y partida mantienen identidad al renombrar; no se añade interfaz de renombrado.

| Estado persistido | Nueva partida | Continuar |
|---|---|---|
| Perfil válido, sin partidas sin finalizar | Habilitada | No disponible si no hay activa |
| Activa in_progress en frontera de menú compatible | Bloqueada | Habilitada para la misma partida |
| Archivada sin cierre, sin actual | Bloqueada | No disponible; mensaje de partida sin finalizar, sin reparar historial |
| Solo historial completed con metadatos de cierre válidos | Habilitada | No disponible |
| Error SQLite/política no confirmada | Bloqueada | No se inventa progreso ni fallback |
| Activa que requiere restauración aún no soportada | Bloqueada | Transición limitada con mensaje; no reset de recursos |

Si la base manual tiene históricos incompletos de la política anterior, también bloquearán nuevas creaciones. No se consultó su contenido ni se migró/corrigió/borró nada para resolver ese caso.

### Contrato futuro de finalización global, sin implementarlo

Cinco biomas completos es una precondición del flujo de final, no una orden de cerrar. El coordinador futuro deberá validar partida/dueño/revisión, los cinco completed, evaluador existente y versiones, y resultado auténtico Bueno/Medio/Malo; preparar/persistir final pendiente sin habilitar Nueva partida. Tras el evento real de presentación/confirmación del resultado, una operación idempotente y transaccional aún por diseñar confirmará status=completed, is_current=0, Ending/EndingRulesVersion/CompletedAt, revisión/snapshot coherentes y recibo. Solo entonces HasUnfinishedGames podrá permitir otra, si no quedan históricos sin cerrar. Fallo de escritura no cierra; reapertura no repite efectos. No se ha identificado/validado aquí ese evento ni se modificaron fórmulas, Final.cs, FinNivel o escenas finales. AreAllCanonicalBiomesCompleted sigue siendo solo consulta.

### Pruebas y compilación efectivas

**35 menú/política +42 progreso/decisiones +43 SQLite =120 comprobaciones C# aprobadas,0 fallidas.** No sumar repeticiones. Incluyen primera creación, persistencia de nombre/perfil, Nueva/Continuar, rechazo directo del servicio, historial archivado incompleto sin actual, estado terminal de fixture que permite otra, misma intención concurrente, intenciones distintas concurrentes, nuevo proceso de lectura que conserva bloqueo, renombrado y fallo SQLite/rollback/retry. El coordinador usa puerto de fixture con servicio/UoW/repositorio/SQLite reales; no son pruebas de nodos/UI Godot.

Las fixtures históricas que necesitaban una segunda partida se adaptaron a un registro terminal explícito creado SOLO en bases sintéticas propias. SeedTerminal es setup de pruebas por SQL, no API de cierre del producto, ni evidencia de que un final haya sido presentado. El caso de cinco biomas completos comprueba además que Nueva partida se sigue rechazando sin cierre. Se conserva la cobertura de idempotencia, decisiones, bloqueo por bioma y rollback; una prueba antigua de reemplazo se actualizó para exigir rechazo, conforme la regla nueva. El ejecutor duradero histórico sin argumentos quedó deshabilitado con mensaje/exit2 para evitar escrituras accidentales a AppData y expectativas de reemplazo obsoletas; usar --runtime-menu y --progress, nunca modificar las bases protegidas para adaptar pruebas.

Comandos: local-persistence/run-checks.ps1; dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore --disable-build-servers -nodeReuse:false y ejecutor --runtime-menu/--progress bajo entorno CLI/NuGet/TEMP privado; Godot C# con GodotProjectDir a integration/sqlite/.work/.godot/mono/temp. Biblioteca y ejecutores0errores/0advertencias; Godot C#0errores,63advertencias históricas ParallaxBackground,0nuevas en componentes afectados. .NET8.0.30/SQLite3.53.3 y paquetes sin cambios. Las39 pruebas backend son históricas de C.2A, no reejecutadas: Node.js no se inició en esta subfase.

### Integridad y pendientes

Se comparan antes/después **1,512 archivos existentes protegidos** fuera de los16 archivos autorizados de esta corrección, por hash/tamaño/fecha. Se protegen las TRES bases: dos AppData anteriores y la runtime manual, cada una con manifiesto y lease, nueve archivos totales. Solo hashes/metadatos; no se abrió SQLite ni se inspeccionó perfil/progreso manual. .env278bytes/SHA2564DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, fecha/atributos/propietario/ACL conservados. B00 sigue BLOQUEADA por riesgo ACL heredado Modify, sin cambiar permisos. Esquema, recursos gráficos, configuración global, mecánicas, decisiones, audio, biomas, tarjetas, jugadores, NPC y tres finales permanecen intactos. WASAPI/GetBufferSize/output_device invalidated se considera incidencia de audio separada; no se alteró código de audio ni se reprodujo mediante motor.

Prueba manual pendiente: compilar esta copia en Godot C# bajo control del usuario, abrir a1280×720 y revisar título/fondo/panel completo, nombre, mensajes y controles, también con nombre largo. Con la partida manual existente, Nueva partida debe estar deshabilitada; Continuar debe abrir la misma selección aún sin entrada a biomas. Volver/cerrar/reabrir debe mantener nombre y bloqueo, sin nueva partida ni pérdida de datos. No forzar un cierre ni limpiar la base para probar el estado terminal: esa condición solo está cubierta con fixture sintética hasta autorizar su implementación. No ejecutar automáticamente editor/videojuego.

Código completado, visual **PENDIENTE DE VALIDACIÓN RUNTIME**. Siguiente bloque recomendado: autorización específica de tarjetas/selección de los cinco biomas, manteniendo orden libre y controles de partida; no conectarlo ahora. Cierre global legítimo sigue pendiente de su evento real. Detenerse aquí, sin B05.


## B04.2B.2B.2C.2B — Selección local de los cinco biomas (2026-10-26)

**COMPLETADA EN CÓDIGO. Validación visual y del motor: PENDIENTE.** Reanudación expresamente autorizada tras comprobar que .env vuelve a coincidir con la referencia histórica, sin reemplazo realizado por Codex en esa última comprobación. La causa de las diferencias anteriores no se atribuye a ningún proceso. La referencia original no cambió. B00 mantiene su riesgo ACL independiente.

El usuario confirmó manualmente la fase anterior: menú completo a1280×720, Nueva partida bloqueada cuando hay activa, Continuar abre selección, bloqueo persistente al reiniciar y sin nuevos errores SQLite. Esa evidencia no se presenta como prueba de las tarjetas recién conectadas. No se ejecutó Godot/editor/exportación en esta fase.

### Causa y archivos exactos

La selección anterior había dejado deliberadamente las tarjetas sin controlador local. MenuNiveles detenía su procesamiento y mostraba aviso de integración pendiente; TarjetaNivel todavía consultaba BiomeCardController remoto, sin sesión/progreso remoto inicializados en modo local. Se elimina esa autoridad de la ruta de selección, no se elimina el código HTTP del proyecto.

Modificados exclusivamente:
1. scripts/MenuNiveles.cs — admisión local, refresh de disponibilidad, entrada asíncrona, mensajes, retorno y transición validada.
2. scripts/TarjetaNivel.cs — eventos existentes Pressed, identificación canónica, destino exportado validado, estados/texturas existentes y llamada local.
3. integration/sqlite/LocalGameState.cs — puerto ILocalBiomeStore y coordinador puro LocalBiomeSelection/DTOs en el archivo autorizado; acceso a selección desde fronteras v1 reconocidas.
4. integration/sqlite/GamePersistenceAdapter.cs — implementa ILocalBiomeStore mediante sus métodos ya existentes de lectura y EnterBiome.
5. local-persistence/game-save-tests/GameSaveChecks.cs.txt — despacho --biome-selection y probe readonly de fixture.
6. local-persistence/game-save-tests/RuntimeMenuChecks.cs.txt — puerto de fixture para selección y expectativa actualizada: volver a selección desde frontera humana confirmada no equivale a restauración de recursos.
7. local-persistence/game-save-tests/BiomeSelectionChecks.cs.txt (nuevo) —30 comprobaciones sobre SQLite sintética y navegación simulada.

Documentos actualizados exactamente7: backend/docs/GODOT_RUNTIME_INTEGRATION_PLAN.md, GODOT_SCENE_EVENT_MAPPING.md, GODOT_RUNTIME_TEST_PLAN.md, PHASES.md, PHASE_HISTORY.md, DECISIONS.md y local-persistence/README.md. No se modificaron .tscn, project.godot, TwoSides.csproj, proveedores, esquema, GameSaveService ni ningún script ambiental, decisión, FinNivel, final, personaje, NPC, animación o audio. Contratos restantes consultados sin editarlos.

### Correspondencia y señales

La escena existente scenes/levels/menu_niveles.tscn permanece intacta. Se reutilizan sus nodos y recursos:

| Nodo / Nivel | ID canónico | Entrada humana existente |
|---|---|---|
| GridContainer/TarjetaOceano /0 | ocean | res://scenes/levels/DesicionDelfin.tscn |
| GridContainer/TarjetaSelva /1 | jungle | res://scenes/levels/DesicionMono.tscn |
| GridContainer/TarjetaDesierto /2 | desert | res://scenes/levels/DesicionRataCanguro.tscn |
| GridContainer/TarjetaBosque /3 | forest | res://scenes/levels/DesicionZorro.tscn |
| GridContainer/TarjetaTundra /4 | tundra | res://scenes/levels/DesicionNieve.tscn |

TarjetaNivel._Ready conserva Pressed += OnPressed y _ExitTree lo desconecta. No hacen falta señales serializadas nuevas. OnPressed → MenuNiveles.EnterLocalBiomeAsync → LocalBiomeSelection.EnterAsync → GamePersistenceAdapter.GetActiveGameAsync/GetBiomeAccessAsync/EnterBiomeAsync/GetGameProgressAsync → GameSaveService/UnitOfWork/SQLite. BiomeFor y HumanSceneFor son catálogo cerrado verificado contra los5 exports reales de .tscn; ResourcePath exportado debe coincidir antes de permitir el clic. No se acepta una ruta arbitraria desde datos guardados.

### Protocolo local

MenuNiveles exige el ticket local de selección, crea un coordinador por instancia y carga disponibilidad por lectura asíncrona. No consulta SessionManager, autenticación, endpoints o backend. GamePersistenceAdapter conserva la capacidad runtime existente; tests inyectan únicamente capacidad sintética propia. El puerto de selección no expone creación de perfil/partida, decisiones, completion, recursos o HTTP.

Antes de escribir, se comprueban dueño/partida activa esperada, is_current/in_progress, bioma válido, disponibilidad y etapa humanas, snapshot boundary v1 válido y existencia de la escena canónica. EnterBiome se confirma con OperationId estable, owner/GameId/revisión/BiomeId/perspectiva humana. Se valida recibo (operación, tipo, dueño, partida y revisión), se relee el agregado vigente y se verifica frontera/etapa antes de navegar. No hay nueva partida ni perfil, no se completan biomas y no se registran decisiones al entrar.

La frontera human_decision ya confirmada para ese bioma se reconoce por lectura y no vuelve a llamar EnterBiome. Si se elige un bioma humano distinto, el EnterBiome existente guarda el nuevo destino lógico y revisión según su contrato, sin cambiar decisiones o estado terminal de otros biomas. No se sobrescribe un snapshot de formato desconocido ni se reescribe la frontera al repetir la entrada al mismo bioma. No se persiste avance de párrafos del diálogo ni recursos.

La transición utiliza Transicion.CambiarEscenaValidadaAsync existente (o ChangeSceneToFile si no hay gestor), con callbacks en hilo principal. No hay I/O SQLite dentro del fundido. Se verifica que el menú siga vivo, ticket vigente y plan vigente antes del cambio; el ticket se consume solo después de aceptar la escena. Abandonar el menú invalida el coordinador y sus resultados tardíos. El adaptador serializa trabajo en worker sin pasar Node/SceneTree.

Un bloqueo Interlocked cubre lectura, escritura y toda la navegación; doble clic y otra tarjeta concurrente no generan otra entrada o transición. Errores de escritura devuelven código controlado y no navegan; incertidumbre de resultado conserva comando/UUID para retry. Si hubo commit pero falló navegar, el punto confirmado permanece; al reintentar la misma entrada se navega desde él sin otra revisión/escritura. Conflicto de revisión exige recargar; no se aplica una revisión vieja a otra partida. No hay rollback silencioso de un commit, ni alternativa HTTP.

### Estados y límites de continuación

Disponibles: tarjetas humanas canónicas interactivas, cinco desde inicio y sin orden. En progreso humano: frontera human_decision reconstruible, interactiva para reabrir desde el inicio de esa decisión, sin reenviar elecciones. La actividad se deriva del progreso/etapa/punto de continuación del servicio existente; no se agregó una columna ni un indicador global de progreso.

Completado: Activity=completed, tarjeta deshabilitada, tooltip discreto «Bioma completado», resultado y texturas existentes conservados. La validación del servicio sigue rechazando ambas perspectivas. Los otros incompletos no se bloquean por completar uno. Se mantienen las imágenes ya asignadas, sin recursos externos ni rediseño de la escena.

Animal_pending/decision_info/animal_start: se muestra el estado conocido, pero la entrada a esa perspectiva se rechaza con RESUME_UNSUPPORTED hasta disponer de captura/hidratación real de recursos. No se usa la escena inicial animal como falsa restauración ni se vuelve a la decisión humana confirmada. La selección puede abrirse desde una frontera v1 reconocida para elegir otro bioma humano; eso NO restaura automáticamente al actor ni modifica la decisión anterior.

Límite importante del alcance: estas entradas son las escenas humanas actuales. Su código de confirmar decisiones aún conserva el flujo legado y puede mostrar mensajes de autenticación/contexto faltante al intentar elegir. No se lo conectó ni se habilitó un servidor como alternativa; poder abrir las cinco entradas no significa que el recorrido animal/completion/final offline completo ya funcione. Tampoco se añadieron botones a escenas humanas. Para probar las cinco entradas por ahora, se puede detener/reabrir el juego entre ellas y volver por Continuar a selección.

### Pruebas y compilación

**30 selección +35 menú/partida única +42 progreso/decisiones +43 SQLite =150 comprobaciones C# aprobadas,0fallidas**, sin sumar repeticiones. Son resultados nuevos de esta fase, diferentes de los150 históricos que incluían backend. No se inició Node.js ni se ejecutaron las39 pruebas backend ahora.

Las30 nuevas cubren los5 biomas como primera elección, correspondencia real .tscn/ID/escena, orden inverso, ID desconocido, partida inexistente/archivada/finalizada, completed en ambas perspectivas, otros disponibles, frontera humana sin escrituras repetidas, continuación animal bloqueada sin replay, doble clic, concurrencia, rollback, respuesta perdida, escena inexistente, fallo/excepción de navegación tras commit, error de lectura, revisión obsoleta, invalidación antes/durante lectura, snapshot desconocido intacto, lectura/reentrada humana readonly en proceso nuevo, independencia histórica y ausencia de referencias HTTP/Mongo/Godot en coordinador/ejecutor puro.

Fixtures nuevas bajo local-persistence/.work/databases/<UUID> y limpieza solo de sus archivos propios. Los estados terminales usados por pruebas se preparan exclusivamente en esas fixtures: no equivalen a ejecutar un final del videojuego ni a una API nueva de cierre. Navegación simulada permite inspeccionar que el commit preceda al callback; no prueba señales, fundido ni presentación en el motor. Cero bases temporales sintéticas restantes. No se abrió SQLite sobre las3 bases protegidas.

Biblioteca y ejecutores:0errores/0advertencias; tests en .NET8.0.30 y SQLite3.53.3. Godot C#:0errores,63advertencias históricas ParallaxBackground y0nuevas atribuibles a los4 archivos. MSBuild:86fuentes,1ProjectReference a biblioteca,0fuentes filtradas desde local-persistence o integration/sqlite/.work. Godot.NET.Sdk4.6.1/net8.0/referencia/paquetes sin cambios. Cachés/CLI/TEMP/NuGet privados; --no-restore, sin instalaciones ni ejecución del motor.

Comandos ejecutados, con el entorno privado del preámbulo de integration/sqlite/run-infrastructure.ps1 (sin invocar sus modos duraderos):
- dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore --disable-build-servers -nodeReuse:false -v:q
- local-persistence/.work/bin/GameSave.Checks/Debug/net8.0/win-x64/GameSave.Checks.exe --biome-selection
- mismo ejecutor --runtime-menu y --progress
- local-persistence/run-checks.ps1
- dotnet build TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -p:GodotProjectDir=<raíz absoluta integration/sqlite/.work/> -v:q

### Integridad y aislamiento

Inventario previo y posterior: **1,514 archivos existentes protegidos** fuera de los14 archivos autorizados y .env, con digest/hash/tamaño/fecha comparados. Incluye todas las escenas, finales, lógica ambiental, controles no autorizados, esquema/proveedores, paquetes y configuración. Se comparan además hash/tamaño/fecha de las3 bases existentes y sus manifiestos/leases:9archivos, todos intactos. Las cuatro partidas ficticias y el progreso manual se preservan por igualdad binaria, sin consultas SQL ni migraciones.

.env se verifica SOLO por tamaño y SHA-256 antes/después, separado de compilaciones/pruebas:278bytes y4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928. No se cargan valores, no se consulta ni modifica ACL/propietario/fecha y no se usa como configuración. La coincidencia resuelve el bloqueo de contenido para esta reanudación, no el riesgo ACL pendiente de B00. No se accedió al original, al archivo recuperado del escritorio o a Atlas.

### Validación manual pendiente y siguiente fase

1. Compilar esta copia en Godot C# bajo control del usuario; la compilación automatizada privada no actualiza por sí sola la caché habitual del editor. No iniciar Node.js.
2. Menú → Continuar → selección: comprobar5 tarjetas iniciales habilitadas sin secuencia, mismas imágenes, mensajes y volver al menú.
3. Pulsar cada tarjeta y comprobar la escena humana de la tabla. Si no hay retorno desde esa escena, detener/reabrir el juego y usar Continuar para probar otra; debe mantenerse la misma partida y perfil.
4. Reabrir el mismo bioma humano: retoma la frontera inicial del diálogo confirmada, sin prometer párrafo/posición/recursos exactos. No debe crear otra partida ni mostrar una falsa finalización.
5. Probar doble clic y observar una sola transición. Si ocurre fallo de navegación, reintentar el mismo bioma sin borrar datos. Estado completed/animal pendiente se valida con fixtures automáticas: no editar la base manual para fabricarlo.
6. No interpretar como fallo de selección el flujo de decisión todavía no conectado; no probar completion o finales como parte de esta aceptación. Registrar separadamente mensajes de audio si aparecen.

Registrar resultados/capturas sin secretos. Motor/visual/perfiles y navegación real de las5 tarjetas permanecen **PENDIENTES DE VALIDACIÓN RUNTIME**. Siguiente autorización recomendada: conectar confirmación local de decisiones y su transición informativa, con contrato explícito de ambiente/frontera; recursos, FinNivel y finales requieren sus bloques posteriores. No iniciarlos ahora. Detenerse al finalizar, sin B05.


## B04.2B.2B.2C.2C — Decisiones locales: implementación parcial (2026-10-26)

**Guardado y confirmación de las cinco decisiones IMPLEMENTADOS EN CÓDIGO. Resultado general PARCIAL por continuidad jugable animal bloqueada fuera del alcance. Validación RUNTIME PENDIENTE.** No declarar la fase completa mientras siga el guard remoto de entrada animal. Se conserva la validación manual del usuario de C.2B: cinco tarjetas/destinos humanos correctos, doble clic sin duplicación y sin nuevos errores observados. Esa prueba no valida estos cambios.

### Inventario y opciones existentes

Antes de editar código se registró el inventario en GODOT_RUNTIME_INTEGRATION_PLAN.md. Cambios de código exactamente3:
- scripts/DecisionSceneFlow.cs — punto compartido de confirmación de los cinco diálogos; reemplazo de HTTP por sesión local y proyección del ambiente confirmado.
- integration/sqlite/LocalGameState.cs — puerto ILocalDecisionStore, DTO LocalDecisionConfirmation y coordinador puro LocalDecisionSession en el archivo autorizado; fábrica ligada al perfil/partida de la aplicación.
- integration/sqlite/GamePersistenceAdapter.cs — implementa ese puerto mediante GetActiveGameAsync y RecordDecisionAsync ya existentes.

Pruebas: local-persistence/game-save-tests/GameSaveChecks.cs.txt (despacho --decisions y --decision-probe) y nuevo DecisionIntegrationChecks.cs.txt. Documentos exactamente7: backend/docs/GODOT_RUNTIME_INTEGRATION_PLAN.md, GODOT_SCENE_EVENT_MAPPING.md, GODOT_RUNTIME_TEST_PLAN.md, PHASES.md, PHASE_HISTORY.md, DECISIONS.md y local-persistence/README.md. No se editaron contratos restantes, .tscn, scripts particulares de diálogos, DecisionNivel, VariablesGlobales, InfoDecision, biomas, actores, NPC, recursos, FinNivel, AnimalSegmentFlow, Final, proveedores, esquema, servicio de dominio, project.godot o TwoSides.csproj.

| Bioma / decisión estable | Escena y script responsables | No / Sí, evento y resultado existentes | Información y destino animal |
|---|---|---|---|
| ocean / ocean_waste_disposal | DesicionDelfin.tscn; OceanDecisionNivel→EnvironmentalDecisionNivel→DecisionNivel | BotonBuena/OnBotonBuenaPressed(true), rechaza vertido→healthy; BotonMala/OnBotonMalaPressed(false), aprueba→degraded | info_delfin_buena/mala.tscn → bioma_mar.tscn |
| jungle / jungle_transport_route | DesicionMono.tscn; EnvironmentalDecisionNivel(BiomeId=jungle) | Mismos eventos true/false; rechazar/aprobar vía por selva→healthy/degraded | info_mono_buena/mala.tscn → bioma_selva.tscn |
| desert / desert_cat_abandonment | DesicionRataCanguro.tscn; EnvironmentalDecisionNivel(BiomeId=desert) | Mismos eventos; rechazar/aprobar abandono de gatos→healthy/degraded | info_rata_buena/mala.tscn → bioma_desierto.tscn |
| forest / forest_industrial_pesticides | DesicionZorro.tscn; EnvironmentalDecisionNivel(BiomeId=forest) | Mismos eventos; rechazar/aprobar pesticidas→healthy/degraded | info_zorro_buena/mala.tscn → bioma_bosque.tscn |
| tundra / tundra_fossil_extraction | DesicionNieve.tscn; scenes/levels/DesicionNieve.cs | Callbacks propios delegan ChooseAsync(true/false); prohíbe/aprueba plataforma fósil→healthy/degraded | info_buena/mala.tscn → bioma_nieve.tscn |

Las rutas de escenas de la tabla están bajo scenes/levels/. Cada pareja informativa mantiene sus UID/rutas serializadas y EscenaSiguiente; no se reescribieron. EnvironmentalDecisionService.OptionFor existente ya convierte true/No a reject y false/Sí a approve. Se reutiliza únicamente esa función estática, sin instanciar servicio remoto, HTTP o sesión. DecisionCatalog.ForBiome proporciona las keys existentes; el catálogo local existente las valida otra vez al guardar.

Evidencia de resultado absoluto: DecisionNivel.Decidir(bool saludable,...) ya contiene BiomaSaludable=saludable; los callbacks enviaban true a información buena y false a mala. Tundra documenta explícitamente plataforma prohibida/saludable y aprobada/degradada. Se conserva ese resultado del diálogo, no se deriva una fórmula de finales ni se aplica un umbral nuevo. LocalDecisionSession recibe el resultado resuelto del llamador y solo lo serializa/valida; no contiene un evaluador ambiental. Classification permanece null, ConsequencesVersion1: no se añade favorable/perjudicial ni una puntuación por el nombre del botón.

### Confirmación, persistencia y memoria

DecisionSceneFlow captura una única elección cuando el diálogo permite decidir. Valida que el dueño sea la escena humana actual y que corresponda al bioma; exige almacenamiento local inicializado y utiliza el perfil/GameId actuales, sin crear otros. El coordinador consulta el agregado activo por SQLite, comprueba owner/GameId/is_current/in_progress, bioma no completado y frontera human_decision o decision_info del bioma correcto. Verifica que exista la escena informativa seleccionada antes de guardar.

Comando RecordDecision: OperationId y DecisionId UUIDv4 reservados una vez por intención; LocalPlayerId, GameId, ExpectedRevision, BiomeId, DecisionKey, OptionId, ResolvedEnvironment y ConsequencesJson={stateKind:resultado}. No se llama CompleteBiome. El servicio/UoW existente guarda atómicamente decisión/orden/consecuencias, EnvironmentalState.LastDecisionId/StateKind, HumanCompletedAt, etapa animal_pending, revisión/snapshot decision_info y recibo. Result de bioma y Ending no se fijan al decidir.

Tras un commit satisfactorio se verifica el recibo (tipo decision/IDs/revisión), se relee el agregado activo y se cotejan decisión, estado ambiental, referencia LastDecisionId y etapa. Solo entonces el punto autorizado de DecisionSceneFlow asigna VariablesGlobales.BiomaSaludable al valor confirmado. No se dispara daño, pickups, consumo, spawns, contadores ni lógica de recursos; los scripts ambientales existentes consumen ese bool al cargar. No se modifica una variable ambiental antes del commit.

SQLite y memoria Godot NO forman una transacción atómica. Estrategia explícita: intención inmutable→commit SQL→relectura/verificación→proyección absoluta del bool→navegación informativa. Un fallo previo al commit no proyecta ambiente ni navega. Una escritura confirmada permanece aunque falle la presentación. La proyección absoluta es idempotente; el coordinador recuerda el OperationId ya proyectado y no vuelve a aplicarlo al reintentar navegación en esa instancia. Una sesión nueva restaura el valor absoluto desde lectura, sin volver a ejecutar RecordDecision ni efectos incrementales. No se anuncia restauración de mundo/actor por asignar ese bool.

Se mantienen callbacks, textos/tweens y destinos informativos existentes. La transición usa Transicion.CambiarEscenaValidadaAsync y confirma escena viva/plan vigente; con gestor ocupado espera el intervalo ya usado, sin I/O en callback del fundido. Sin gestor usa ChangeSceneToFile y verifica resultado. Espacio reintenta la misma opción si el guardado/transición falló; el diálogo sigue bloqueando una segunda elección incompatible. No hay fallback HTTP.

### Idempotencia y recuperación

La instancia lógica sigue siendo (GameId,BiomeId,DecisionKey). Si ya existe la misma opción y consecuencia, se devuelve su registro e IDs originales sin RecordDecision nuevo. Otra opción o resultado incompatible se rechaza como DECISION_CONFLICT. Si dos sesiones compiten con la misma opción, la perdedora de revisión/instancia relee el ganador y adopta ese resultado, sin sobrescribir; opciones distintas tienen un solo ganador.

Ante rollback se retiene exactamente el comando, UUIDs, payload y ExpectedRevision para retry. Ante respuesta perdida pero registro durable presente se reconoce ese registro antes de proyectar; no se genera otro UUID ni se reenvía la consecuencia. Un recibo conocido se conserva durante reintentos en memoria. En recuperación desde un proceso nuevo el resultado devuelve registro/OperationId/estado y Receipt=null: no se inventa un recibo ni se deduce su revisión original de la revisión actual. La fila local_operations del commit permanece; no se implementa otra consulta SQL en el adaptador.

Doble clic en el diálogo queda serializado por el flow y el coordinador Interlocked; una transición exitosa no se repite para la misma operación. Un error después del commit conserva el recibo/registro; reintentar la navegación no aumenta revisión, decision_order ni número de decisiones y no vuelve a proyectar en la misma sesión. Bioma completed o partida archivada/finalizada no aceptan nuevas elecciones/proyecciones. Reiniciar antes de un commit pierde una intención solo en memoria; una nueva intención explícita se evalúa contra el agregado durable, sin inventar un journal nuevo.

### Bloqueo animal fuera del alcance y autorización pendiente

Las parejas InfoDecision conservan su paso al animal. Sin embargo, **FinNivel._Ready** detecta falta de Services/sesión remota y llama AnimalSegmentFlow.Open(completion:true,start:false). Con Services nulo, Open pausa SceneTree y retorna. En las cinco escenas animales ese guard está presente. No se ejecutó el motor para atribuirle una observación runtime nueva: el bloqueo se deduce del código.

Por esa dependencia protegida no se puede declarar «segmento animal jugable offline» ni continuidad completa en esta fase. No se introducen sesiones falsas, no se construye el backend antiguo y no se evita el guard por una variable global. Se preservan las mecánicas en los archivos excluidos.

Autorización necesaria posterior: revisar de forma específica scripts/FinNivel.cs únicamente en su guard de entrada y scripts/AnimalSegmentFlow.cs en los requisitos de contexto/bloqueo local. Esto debe separarse de conectar CompleteBiome y de modificar física/objetivos; no se hizo aquí. Hasta entonces la implementación general queda PARCIAL aunque las cinco decisiones se guardan localmente y el paso informativo está conectado. Tampoco se altera la política de selección que bloquea reentrada animal sin un checkpoint de recursos soportado.

### Finales y restauración futura

Persisten por partida los IDs/opciones/orden/consecuencias, estado ambiental y vínculo de la decisión, versiones existentes de reglas/contenido y fecha humana. Esos son insumos para la futura restauración de resultados; no se añadieron acumuladores, pesos, umbrales ni clasificación numérica. Los resultados Bueno/Medio/Malo confirmados por el usuario permanecen sin modificar. El cálculo exacto sigue sin localizar con certeza en la copia permitida; no se buscó original/Atlas.

Los recursos/vida/agua/comida, posiciones, timers, fuentes agotadas y checkpoints animales no se capturan ni restauran. Recuperar una decisión en una prueba readonly demuestra persistencia y ausencia de replay, no continuación exacta del animal en Godot. La equivalencia definitiva de finales tras cerrar/continuar exige restauración ambiental completa y evaluador existente identificado; queda pendiente. No se cierra globalmente la partida ni se habilita una segunda por decidir.

### Pruebas y compilación efectivas

**30 nuevas decisiones +30 selección +35 menú/partida única +42 progreso/decisiones +43 SQLite =180 comprobaciones C# aprobadas,0 fallidas**, sin contar repeticiones ni las39 pruebas backend históricas. No se inició Node.js/Atlas.

Las30 nuevas incluyen ambas opciones de cada bioma (10), opción/key inválidas, mismo resultado sin escritura/proyección/transición duplicadas, conflicto por otra opción, recuperación en sesión nueva y proceso hijo readonly, doble clic, rollback/retry con mismos UUIDs, intento de cambiar elección pendiente, respuesta perdida, escena faltante, navegación fallida, completed, archivo, otro GameId, lectura fallida, sesión invalidada, concurrencia igual/distinta y ausencia de dependencias HTTP/Mongo/Godot en el coordinador/ejecutor puro. Se usa GameSaveService/UoW/repositorio/SQLite real sobre fixtures propias y callbacks simulados de memoria/navegación. No se presenta la simulación como ejecución de señales o VariablesGlobales reales en el motor; ese orden se inspeccionó en el script y se valida manualmente después.

Las regresiones se ejecutaron sobre fixtures nuevas de local-persistence/.work/databases/<UUID>, sin tocar bases existentes. Comandos: build --no-restore de GameSave.Checks.csproj; ejecutor --decisions, --biome-selection, --runtime-menu, --progress; local-persistence/run-checks.ps1. El probe --decision-probe solo acepta el namespace UUID de fixture ya existente, abre readonly y no invoca RecordDecision.

Biblioteca y ejecutores0errores/0advertencias, .NET8.0.30 y SQLite3.53.3. Godot C#0errores,63advertencias históricas ParallaxBackground y0nuevas en los3 archivos. Entorno CLI/NuGet/TEMP privado, GodotProjectDir a integration/sqlite/.work/.godot/mono/temp; sin restore/actualización de paquetes. Referencia existente única a la biblioteca; no se cambió proyecto/framework. No editor, motor ni exportación ejecutados. Cero bases sintéticas temporales restantes.

### Integridad

Se comparan antes/después **1,517 archivos protegidos** fuera de los12 archivos de esta fase y .env: hashes/tamaños/fechas, incluidos todos los scripts particulares de diálogos, escenas/animales/recursos, FinNivel/AnimalSegmentFlow/Final, configuración, esquema y servicio/repositorio. Tres bases existentes +manifiestos/leases=9archivos protegidos, intactos por comparación binaria/metadatos, sin abrir SQLite ni migrar/limpiar/reinicializar ninguna. Se preservan las cuatro partidas ficticias y progreso manual sin consultar sus contenidos.

.env verificado únicamente por tamaño y SHA-256 antes/después:278bytes,4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928. No valores, credenciales, uso como configuración ni cambios a propietario/ACL/fecha. B00 mantiene el riesgo ACL pendiente. No se accedió a proyecto original ni servicios externos.

### Guía manual acotada y siguiente paso

1. Compilar esta copia en Godot C# bajo control del usuario y abrir sin Node.js. Usar la misma partida, Continuar y una tarjeta humana disponible.
2. Terminar el diálogo y elegir No o Sí. Debe confirmarse el guardado local antes de mostrar la información correspondiente, sin solicitud de login para guardar.
3. Un doble clic debe producir una sola información/decisión. Si falla la transición, Espacio reintenta el mismo resultado; no elegir otra opción ni crear otra partida como reparación.
4. La decisión debe dejar el bioma animal_pending, no completed; la prueba automatizada cubre este estado sin editar la base manual.
5. Al avanzar desde información a animal existe el bloqueo remoto de FinNivel descrito arriba: puede quedar pausado. No forzarlo, no simular sesión ni interpretar esa pausa como guardado fallido. Validación de jugabilidad animal queda bloqueada hasta autorización específica.
6. Después de reiniciar, la decisión se conserva; no prometer reentrada animal/recursos desde selección ni equivalencia de finales aún. No cambiar datos manuales para fabricar completed o restablecer opciones.

La prueba manual de las dos opciones de cada bioma requiere fixtures/runtime autorizado apropiado, no borrar la elección ya confirmada del usuario. El estado vigente es PARCIAL por continuidad animal, RUNTIME PENDIENTE. Recomendar resolver el guard local de entrada con alcance explícito y luego los bloques de restauración/completion; no iniciarlos ni B05. Detenerse aquí.

## B04.2B.2B.2C.2C.1 — Entrada animal local (2026-10-26)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** Este apartado actualiza el estado vigente; los registros anteriores conservan su valor histórico. El usuario autorizó expresamente ampliar la navegación mínima a MenuNiveles.cs, TarjetaNivel.cs y LocalGameState.cs para abrir la entrada animal original de un bioma ya decidido y preparar el ambiente antes de instanciarla.

Diagnóstico: FinNivel._Ready exigía Services/autenticación/progreso remotos aunque el contexto local mantiene Services nulo. La llamada antigua a AnimalSegmentFlow.Open pausaba el árbol y, sin Services, retornaba antes de crear el aviso. El texto «Confirmación pendiente. El juego permanece detenido.» existe en el modal remoto, pero no demuestra por sí solo el origen exacto del «Pendiente» observado por el usuario. animal_pending es un estado SQLite legítimo después de decidir, no evidencia de pérdida. La selección además rechazaba ese estado por restauración animal no soportada; ahora permite únicamente volver a su entrada original. No se consultó la partida manual para diagnosticar datos.

FinNivel._Ready suscribe la señal original y espera ValidateLocalEntryAsync. El lector ILocalAnimalStore solo expone GetLocalProfileAsync/GetActiveGameAsync: valida propietario/perfil, partida actual in_progress, GameId, bioma canónico y pertenencia, animal_pending no completed, decisión confirmada, vínculo LastDecisionId, consecuencias persistidas coherentes y snapshot de frontera soportado. Conserva Decision.OperationId como referencia a la operación original (FK del esquema existente); no fabrica un recibo ni vuelve a ejecutar RecordDecision. Los fallos se presentan localmente y mantienen detenido el ingreso, con reintento de lectura o retorno al menú. No hay fallback HTTP en el modo local.

Las cinco escenas animales originales se seleccionan por mapa canónico. La navegación consulta nuevamente SQLite y prepara el valor absoluto BiomaSaludable antes de cargar/instanciar la escena: reject/No → healthy; approve/Sí → degraded. Solo asigna si difiere, sin consecuencias acumulativas. El guard en _Ready solo compara el ambiente preparado; no lo modifica tarde después de inicializar actores/visuales. Una entrada directa con ambiente incoherente se rechaza y pide volver a la tarjeta. Una decisión confirmada puede recuperarse aunque CurrentBiomeId señale otro bioma; no se modifica snapshot, revisión ni decisión al reentrar.

La tarjeta indica «Abrir entrada animal original. No recupera posición, vida, agua ni comida». Se mantienen escenas, actores, NPC, animaciones, recursos y scripts ambientales originales. Esto no equivale a restauración exacta de una sesión animal. Los métodos FinNivel._ExitTree, OnBodyEntered y FinalizarNivel permanecen idénticos al registro previo. No se llama CompleteBiome, no se marca completed ni se cierra la partida. Si la llegada física o un reinicio llaman al modal antiguo, el modo local devuelve LOCAL_OPERATION_UNSUPPORTED y permite volver al menú; no realiza operaciones remotas. Finalización y reinicios persistentes requieren otra fase.

Archivos de producción modificados: scripts/FinNivel.cs, scripts/AnimalSegmentFlow.cs, integration/sqlite/LocalGameState.cs, integration/sqlite/GamePersistenceAdapter.cs, scripts/MenuNiveles.cs y scripts/TarjetaNivel.cs. Pruebas: GameSaveChecks.cs.txt, RuntimeMenuChecks.cs.txt, BiomeSelectionChecks.cs.txt y el nuevo AnimalEntryChecks.cs.txt bajo local-persistence/game-save-tests. Documentación: únicamente los siete documentos autorizados.

Validación reejecutada: **29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite =209 comprobaciones aprobadas, cero fallidas**. Las nuevas cubren ambos ambientes de los cinco biomas, ausencia de perfil/partida/decisión, IDs incorrectos, completed, fallos de lectura, vínculo/estado/snapshot inválidos, reintentos sin escritura, preparación previa, cuatro decisiones recuperables y reinicio en proceso hijo readonly. Son SQLite sintético y callbacks de navegación; no ejecución del motor ni prueba real de desconexión de red. El puerto puro carece de dependencias HTTP/Mongo/Godot. No se ejecutó Node.js, editor/motor Godot ni Atlas.

Comandos locales: dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore; ejecutor GameSave.Checks.exe con --animal-entry, --decisions, --biome-selection, --runtime-menu y --progress; local-persistence/run-checks.ps1. Fixtures propias UUID en local-persistence/.work/databases, con limpieza controlada por los ejecutores. No ejecutar el modo durable por defecto sobre AppData. Compilación completa TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild con GodotProjectDir dirigido a integration/sqlite/.work/: cero errores, las63 advertencias históricas ParallaxBackground y ninguna en los seis archivos modificados. Biblioteca/ejecutor: cero errores y advertencias. CLI, paquetes y temporales aislados; sin restaurar paquetes ni cambiar proyecto/framework.

Integridad: comparación antes/después de 1,513 archivos protegidos (tamaño, SHA-256 y fecha) y los nueve archivos de las tres bases, manifiestos y leases: sin diferencias. No se abrió ninguna base protegida mediante SQLite. Se conserva el progreso manual de cuatro decisiones sin inspeccionarlo. .env se verifica separadamente solo por tamaño/SHA-256:278bytes y 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928; no se utiliza en compilaciones/pruebas. No se modifican ACL/propietario; el riesgo ACL de B00 sigue pendiente.

Guía manual (pendiente, a cargo del usuario): abrir esta copia en Godot C# sin Node.js; continuar con el mismo perfil y partida; seleccionar una tarjeta ya decidida y comprobar su entrada animal original, personaje y ambiente confirmado sin login ni confirmación de servidor. Probar ambos ambientes solo donde existan decisiones válidas, sin cambiar las cuatro decisiones ni reinicializar bases. Volver a selección y abrir otro bioma decidido: debe usar su propio ambiente. Confirmar que no se promete recuperar posición/recursos. Al llegar físicamente al final o solicitar reinicio, esperar el aviso local de operación pendiente de implementar; no exigir completed ni forzarlo en SQLite.

Siguiente trabajo recomendado, solo con nueva autorización: validar ingreso en Godot y luego diseñar/integrar finalización física local y continuidad de recursos/reinicios. No se conectan finales, no se inicia B05. Trabajo detenido al finalizar esta subfase.

## B04.2B.2B.2C.2C.2 — Retorno al menú local (2026-10-26)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** El usuario informa 7/8 comprobaciones manuales correctas de C.2C.1: continuar, entrada animal, personaje, ambiente, decisión no repetida, ausencia de pausa de entrada y de errores nuevos. El fallo restante es la recuperación remota al volver desde pausa. Estos resultados manuales son reportados por el usuario.

Causa exacta en código: MenuPausa.IrMenuNiveles llamaba ChangeSceneToFile("res://scenes/auth/recuperacion_partida.tscn"). RecoveryScreen._Ready obtenía Services remoto; Render usaba HasSession para mostrar Login, deshabilitaba Continuar y presentaba servicio no disponible con Services nulo. No prueba pérdida de progreso ni fallo de RecordDecision. La escena no solicita HTTP automáticamente en Ready, pero sus acciones de recuperación/login pertenecen al controlador remoto. MenuPrincipal ya recarga SQLite y no requería cambios.

Archivos C# modificados: assets/sprites/ui/MenuPausa.cs, scripts/auth/RecoveryScreen.cs e integration/sqlite/LocalGameState.cs. Los tres figuran en el plan de integración (pausa/salida, recuperación local y proyección local). Se reutilizan las consultas existentes de GamePersistenceAdapter sin modificarlo. Pruebas: nuevo local-persistence/game-save-tests/MenuReturnChecks.cs.txt y selector --menu-return/--menu-return-probe en GameSaveChecks.cs.txt. Solo se actualizan los siete documentos técnicos habituales; sin .tscn ni controladores globales.

Flujo corregido: Volver al menú usa LocalMenuReturn, bloquea doble clic y acciones de pausa concurrentes, refresca SQLite, comprueba el mismo perfil y la misma partida activa, invalida únicamente el permiso de selección en memoria y navega a res://assets/sprites/ui/menu_principal.tscn. No crea, archiva ni completa partidas; no invoca RecordDecision ni CompleteBiome. El menú principal existente vuelve a leer SQLite, muestra Continuar y mantiene Nueva partida bloqueada por la partida sin finalizar. Continuar prepara la selección de cinco biomas; el flujo de C.2C.1 conserva las entradas animales y su preparación ambiental previa.

Pausa: abrir/cerrar mantiene su comportamiento existente; se impiden cambios durante un retorno en curso. Tras confirmar la consulta se quita SceneTree.Paused antes de navegar y se oculta el panel; al salir se desconectan sus señales. Si falla la consulta o la navegación, se conserva/restaura la pausa previa y el panel muestra un error local reintentable. El callback verifica vida del nodo para no volver a pausar otra escena tras una salida concurrente. Sin contexto local no se redirige a login. Una entrada accidental a RecoveryScreen con contexto local oculta login/logout/recuperación remota y vuelve al menú principal local; si falla esa navegación permite reintentar allí, sin tocar SQLite ni usar Services.

**220 comprobaciones C# aprobadas, cero fallidas:** 11 nuevas de retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Cubren retorno y continuación con ambos ambientes, mismos IDs/decisiones/revisión/hash, fallo SQLite y recuperación, navegación fallida/excepción, doble clic, almacén cerrado, retornos repetidos, ausencia de partida y proceso hijo readonly. Las pruebas usan SQLite sintético bajo local-persistence/.work/databases/<UUID> y callbacks de pausa/navegación; no ejecutan señales, escenas ni el motor Godot. No se presenta como una prueba real de desconexión de internet: el flujo local inspeccionado no invoca servicios HTTP. Apertura/cierre visual de pausa y redirección real de RecoveryScreen requieren comprobación manual.

Comandos: dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore; ejecutor --menu-return, --animal-entry, --decisions, --biome-selection, --runtime-menu y --progress; local-persistence/run-checks.ps1. El probe nuevo solo acepta la ruta UUID sintética verificada por ReadOnlyFixture. Compilación completa TwoSides.csproj con --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild y GodotProjectDir dirigido a integration/sqlite/.work/: cero errores, 63 advertencias históricas ParallaxBackground y cero nuevas. Biblioteca y ejecutor: cero errores y advertencias. CLI/paquetes/temporales privados, sin restore ni cambio de proyectos. No se ejecutaron Node.js, Godot ni Atlas.

Integridad antes/después: 1,519 archivos protegidos conservan tamaño, SHA-256 y fecha; incluye FinNivel completo, cinco biomas, actores, escenas, finales, GamePersistenceAdapter y configuración. Las tres bases protegidas y sus manifiestos/leases (9 archivos) permanecen idénticos, sin abrirlas mediante SQLite; se conserva la partida manual sin consultar contenido. .env se comprueba por tamaño/hash separadamente de compilaciones y pruebas: 278 bytes, SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928. No se leen valores ni se modifica contenido, propietario o ACL. El riesgo ACL de B00 sigue pendiente. Cero archivos SQLite sintéticos restantes.

Guía manual: en esta copia, continuar la partida existente y abrir un bioma decidido; abrir pausa, reanudar y comprobar movimiento; abrir pausa otra vez y pulsar Volver al menú (también doble clic). Debe abrir el menú principal local sin login ni Recuperar partida remoto, sin pausa residual, con Continuar disponible y Nueva partida bloqueada. Continuar debe mostrar los cinco biomas; abrir otro ya decidido y verificar su propio ambiente antes de jugar. Repetir después de cerrar/abrir el juego y sin internet, sin cambiar decisiones ni borrar bases. No bloquear ni corromper la base real para probar errores: esos casos están cubiertos con fixtures.

Pendientes: validar este flujo en Godot; restauración exacta de posición/vida/agua/comida, reinicios, CompleteBiome y finales continúan fuera de alcance. El aviso local de finalización/reinicio aún no implementados de C.2C.1 permanece. No se modifica FinNivel ni su finalización física. No se inicia B05. Trabajo detenido al terminar esta subfase.

## B04.2B.2B.2C.2C.3 — Reinicio del segmento animal (2026-10-26)

**COMPLETADA EN CÓDIGO; PERSONAJE, RECURSOS Y OBJETOS PENDIENTES DE VALIDACIÓN RUNTIME.** El usuario confirma las nueve comprobaciones manuales de C.2C.2, incluido retorno local, continuar, ambiente y persistencia tras cerrar Godot. Ese resultado corresponde a la fase anterior, no valida el reinicio nuevo.

Causa exacta del aviso: MenuPausa.ReiniciarNivel llamaba AnimalSegmentFlow.Open(completion:false, reason:"voluntary"); su rama local devolvía LOCAL_OPERATION_UNSUPPORTED, cuyo texto indicaba finalización/reinicio aún no implementados. No era una decisión ausente ni un error de credenciales.

Archivos de producción modificados, previstos en el plan: assets/sprites/ui/MenuPausa.cs (ReiniciarNivel), scripts/AnimalSegmentFlow.cs (RestartLocalAsync/RestartMessage y bloqueo durante reinicio) e integration/sqlite/LocalGameState.cs (coordinador puro LocalAnimalRestart y mensaje genérico de operación aún no disponible). GamePersistenceAdapter no requiere cambios: se reutilizan ILocalAnimalStore y sus consultas existentes. Pruebas: nuevo AnimalRestartChecks.cs.txt y selector --animal-restart/--animal-restart-probe en GameSaveChecks.cs.txt, bajo local-persistence/game-save-tests. Solo se actualizan los siete documentos habituales.

Flujo: el botón reserva la intención para impedir doble clic/acciones concurrentes. El coordinador resuelve el bioma exclusivamente desde la escena animal canónica actual; ReadAnimalEntryAsync valida perfil, misma partida activa, pertenencia del bioma, animal_pending no completed, decisión/consecuencias y frontera soportada. Se verifica/carga el PackedScene original sin instanciarlo y se relee SQLite para rechazar cambios de revisión/decisión/ambiente durante la preparación. No se utiliza una escena humana ni una ruta arbitraria.

Después de esas comprobaciones, el puente prepara BiomaSaludable como estado absoluto confirmado (No/reject/healthy o Sí/approve/degraded), asignándolo solo si difiere; libera SceneTree.Paused y llama ChangeSceneToPacked. Esto crea una instancia nueva del segmento original, no reutiliza el árbol animal vivo ni llama ReloadCurrentScene sin contexto. El guard de entrada existente valida nuevamente SQLite y el ambiente preparado. La salida del menú anterior desconecta señales y libera su pausa. Un fallo de SQLite o destino no modifica el nivel ni su pausa; si falla el cambio de escena se restaura el valor ambiental anterior y la pausa previa, con error local reintentable en el mismo panel. Los callbacks comprueban que el nodo/escena sigan vigentes.

No hay escrituras de progreso durante el reinicio: no RecordDecision, EnterBiome, CompleteBiome, nuevos UUID/recibos, creación/archivo/cierre de partidas ni cambios de disponibilidad, historial u otros biomas. No se crea un checkpoint persistente ni una nueva captura de recursos. Los recibos originales permanecen intactos. La muerte y la llegada física conservan sus rutas actuales, aún no implementadas localmente; esta fase conecta únicamente Reiniciar desde pausa. El mensaje genérico de operación pendiente evita afirmar que el botón nuevo sigue sin implementar.

Inicialización observada en los scripts existentes: los cinco Player*.cs definen MaxHealth=3 y _Ready asigna CurrentHealth=MaxHealth; Estadisticas define AguaMax=100 y ComidaMax=100 y _Ready copia ambos máximos. No se encontraron overrides de esos máximos en las escenas animales/personajes inspeccionadas; el delfín tiene ActivarAgua=false y se conserva así. No se agregan números al código de reinicio: la instancia nueva consume los exports reales. FuenteRecurso conserva _dropeados/_jugadoresDentro por instancia; ItemRecurso tiene _recogido/timers por instancia. Personaje, fuentes, ítems, enemigos y obstáculos vuelven a su configuración original al recrear el árbol; su resultado visual/físico no se afirma validado sin motor. Los métodos ambientales existentes configuran visibilidad/procesamiento/partículas desde el bool absoluto, sin volver a registrar una consecuencia acumulativa.

Entradas originales observadas, coordenadas locales del personaje en las escenas sin editar:

| Bioma | Escena | Personaje | Posición |
|---|---|---|---|
| ocean | bioma_mar.tscn | PlayerDelfin | (25,458) |
| jungle | bioma_selva.tscn | PlayerMono | (79,176) |
| desert | bioma_desierto.tscn | PlayerRataCanguro | (209,478) |
| forest | bioma_bosque.tscn | PlayerZorro | (342,184) |
| tundra | bioma_nieve.tscn | PlayerOso | (571,191) |

**241 comprobaciones C# aprobadas, cero fallidas:** 21 nuevas de reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las21 cubren diez combinaciones bioma/opción, fallo SQLite, destino ausente/humano, completed, partida ausente, decisión ausente, doble clic, retry de navegación, cambio de contexto durante preparación, cuatro ambientes independientes y proceso hijo readonly. Se comprueban hash completo de fixture, revisión, decisiones, ambientes, biomas y referencia a operación/recibos preservados. CompleteBiome aparece únicamente como preparación explícita de una fixture sintética terminal para probar rechazo; no existe en la ruta de reinicio de producción.

Los ejecutores usan bases propias en local-persistence/.work/databases/<UUID>; cero archivos SQLite sintéticos restantes. Las proyecciones de ambiente, pausa y navegación automatizadas son callbacks, no ejecución Godot ni verificación de recursos/colisiones reales. El flujo de producción inspeccionado no usa HTTP, .env ni credenciales; no se simula una sesión remota ni se afirma una prueba real de corte de red.

Comandos: build --no-restore de local-persistence/game-save-tests/GameSave.Checks.csproj; ejecutor --animal-restart, --menu-return, --animal-entry, --decisions, --biome-selection, --runtime-menu y --progress; local-persistence/run-checks.ps1. El probe nuevo solo admite ReadOnlyFixture con ruta UUID sintética verificada. Compilación completa TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild con GodotProjectDir hacia integration/sqlite/.work/: cero errores,63 advertencias históricas ParallaxBackground,ninguna nueva. Biblioteca y ejecutor: cero errores/advertencias. Entorno CLI/paquetes/temporales privado; sin restore ni cambios de proyectos. No se ejecutaron Godot, Node.js ni Atlas.

Integridad antes/después: 1,520 archivos protegidos conservan tamaño/SHA-256/fecha; incluye escenas, cinco biomas, personajes/NPC, recursos, animaciones, FinNivel completo, finales, GamePersistenceAdapter, configuración y rutas de retorno local. Las tres bases protegidas y sus manifiestos/leases (9 archivos) permanecen idénticos, sin abrirlas con SQLite. .env:278bytes,SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928,comprobado separadamente antes/después, sin consultar valores ni usarlo en compilación/pruebas. Propietario/ACL no modificados; riesgo ACL de B00 pendiente. No se accede al proyecto original.

Guía manual: continuar la misma partida, abrir un bioma ya decidido, avanzar desde el inicio, recibir daño y consumir recursos; observar/usar una fuente y algún objeto/enemigo. Pausa → Reiniciar, también doble clic: debe aparecer una única escena animal original, en su entrada, sin diálogo humano, login o recuperación remota, con ambiente confirmado y juego sin pausa residual. Comprobar vida máxima real, agua/comida máximas donde estén activas, fuentes/objetos/enemigos/timers reiniciados y ausencia de señales duplicadas/errores. Repetir en los cinco biomas y con los ambientes disponibles, sin cambiar decisiones ni borrar bases para fabricar opciones. Volver al menú, confirmar misma partida/Nueva partida bloqueada y repetir tras cerrar/abrir Godot y sin internet. Fallos SQLite/destino se prueban solo con fixtures, no dañando la base manual.

Pendientes: validación runtime de posición, recursos y objetos; checkpoints persistentes/continuación exacta, muerte, CompleteBiome y finales en fases independientes autorizadas. No se modifica FinNivel ni su llegada física; no se inicia B05. Trabajo detenido al terminar C.2C.3.

## B04.2B.2B.2C.2C.4 — Game Over y retorno directo a niveles (2026-10-26)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** El usuario informa 9/10 comprobaciones manuales satisfactorias de C.2C.3: reinicio de posición/vida/agua/comida/objetos/enemigos en los cinco biomas, ambiente conservado, sin repetir decisión/login ni pausa residual. La ausencia de errores nuevos de consola no fue confirmada; no se interpreta como un error SQLite demostrado ni como una validación completa de esta fase.

Causas exactas: assets/sprites/ui/GameOver.cs, Reintentar → AnimalSegmentFlow.Open(completion:false,reason:"death") → rama local LOCAL_OPERATION_UNSUPPORTED. VolverMenu del mismo controlador todavía abría recuperacion_partida.tscn. MenuPausa.IrMenuNiveles abría el menú principal local conforme a C.2C.2; la instrucción actual sustituye expresamente ese destino por la selección de niveles. Las cinco escenas incluyen game_over.tscn y MenuPausa.tscn. Los cinco personajes llaman GameOver.MostrarDerrota; ZonaMuerte difiere MostrarGameOver para no cambiar el flujo dentro del evento físico. Esa lógica de muerte no se altera.

Cambios de producción: assets/sprites/ui/GameOver.cs, assets/sprites/ui/MenuPausa.cs, scripts/AnimalSegmentFlow.cs e integration/sqlite/LocalGameState.cs. Están previstos en el plan de integración (GameOver, pausa/salida, flujo animal y contexto de navegación). GamePersistenceAdapter, MenuNiveles y TarjetaNivel se inspeccionan pero no requieren cambios. Pruebas: nuevo local-persistence/game-save-tests/GameOverNavigationChecks.cs.txt y selector --game-over-navigation en GameSaveChecks.cs.txt. Se actualizan únicamente los siete documentos habituales. No se editan escenas, diseño visual, botones, actores, recursos, VariablesGlobales, biomas, FinNivel ni Final.cs.

GameOver.Reintentar ahora espera AnimalSegmentFlow.RestartLocalAsync, el mismo puente y LocalAnimalRestart de Pausa → Reiniciar, sin una segunda implementación del reinicio. Mantiene MostrarDerrota, su fundido, botones originales y sus conexiones C#. Se reserva _saliendo durante la operación; se comprueba validez del nodo tras await antes de volver a tocar controles. El callback de fin de tween también comprueba IsInstanceValid y se conserva Kill/desconexión en _ExitTree. SQLite confirma misma partida/bioma, decisión/consecuencias y ambiente, rechaza completed y resuelve la escena animal original. El ambiente absoluto se prepara antes de instanciar; se libera la pausa y la nueva escena utiliza su posición, vida/recursos y objetos iniciales existentes. No se vuelve al humano ni se repiten consecuencias acumulativas.

Pausa → Menú y Game Over → Menú comparten AnimalSegmentFlow.ReturnToLevelsLocalAsync → LocalMenuReturn.ReturnToSelectionAsync. Destino canónico verificado: **res://scenes/levels/menu_niveles.tscn**. Se verifica/carga su PackedScene, se refresca la misma partida desde SQLite y se crea el permiso de selección mediante PrepareSelectionAsync antes de navegar. Se libera la pausa, se cambia de escena y se retira la interfaz anterior. La selección recibe un permiso válido, mantiene sus cinco tarjetas y consulta disponibilidad mediante los servicios existentes: un bioma decidido incompleto abre su animal y su ambiente; solo completed queda bloqueado. No se pasa por bienvenida, perfil, login ni recuperación. El método ReturnAsync histórico se conserva para usos de menú principal ajenos a estos dos botones; sus11 pruebas siguen siendo regresión de esa API, no una afirmación del destino vigente de pausa.

Abandono animal: se mantienen decisiones, consecuencias, partida y recibos, sin guardar posición ni recursos intermedios. Al volver al animal se abre su entrada original con inicialización real de escena, igual que el reinicio aprobado. No hay RecordDecision, EnterBiome, CompleteBiome, creación/archivo/cierre de partida ni cambios de historial/disponibilidad en estas salidas.

Errores: fallos de lectura, contexto o navegación dejan la escena anterior y su pausa; un fallo al abrir selección invalida su permiso temporal y permite reintentar la consulta. El puente comprueba vida de nodo/escena antes de callbacks para no tocar otra escena ni volver a pausarla tras su salida. El coordinador bloquea transición doble; _saliendo bloquea acciones cruzadas del mismo panel. Los errores usan el aviso local ya existente en pausa; Game Over utiliza TooltipText de los botones existentes y GD.PushWarning, sin añadir controles ni cambiar el diseño. Una escena animal ausente incluye su ruta canónica en el mensaje; el destino de selección ausente también se informa. No hay fallback HTTP ni partida temporal.

Revisión estática de consola: se inspeccionaron referencias locales/remotas, inicialización, señales/tween, pausa, nodos liberados y cola/disposición SQLite. Las dos rutas corregidas no llaman Services ni abren recuperación/login; el adaptador conserva serialización y errores controlados al cerrar recursos. Se añadió la comprobación de validez del callback tween de Game Over. No se diagnostican ni se declaran resueltos errores no aportados por el usuario. Si aparecen al probar, solicitar las líneas completas de consola y su traza (sin secretos), indicando si ocurrieron al morir, reintentar o volver a niveles. No asumir origen SQLite.

**260 comprobaciones C# aprobadas, cero fallidas:**19 nuevas de Game Over/navegación +21 reinicio +11 retorno histórico +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las19 cubren los cinco animales/ambos resultados, ambos orígenes de retorno, estado de las cinco tarjetas y reentrada animal, fallo SQLite/retry, navegación fallida/permiso invalidado, doble clic, completed, escena faltante con ruta, partida ausente y conexiones C# inspeccionadas sin rutas remotas. Se verifica hash completo de fixtures y conservación de revisión/decisiones/ambientes/otros biomas/partida. La preparación de una fixture terminal usa CompleteBiome únicamente en pruebas; ninguna ruta de producción nueva lo ejecuta.

Pruebas de SQLite real con fixtures independientes bajo local-persistence/.work/databases/<UUID>, callbacks de pausa/navegación y comprobación de bindings como texto fuente. No son señales/escenas ejecutadas en Godot, ni una prueba real de desconexión de red. El flujo inspeccionado carece de HTTP obligatorio; validar offline real manualmente. Reanudar desde pausa conserva su implementación y requiere comprobación runtime. Las regresiones incluyen los procesos hijos readonly de fases anteriores. Cero archivos SQLite sintéticos restantes.

Comandos ejecutados con entorno CLI/paquetes/TEMP privado: build --no-restore de GameSave.Checks.csproj; ejecutor --game-over-navigation, --animal-restart, --menu-return, --animal-entry, --decisions, --biome-selection, --runtime-menu y --progress; local-persistence/run-checks.ps1. Compilación completa TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild con GodotProjectDir hacia integration/sqlite/.work/: cero errores,63 advertencias históricas ParallaxBackground,ninguna nueva. Biblioteca/ejecutor: cero errores/advertencias. MSBuild inspecciona86 fuentes, una sola referencia a local-persistence/src/TwoSides.LocalPersistence.csproj y cero fuentes backend/tests filtradas al proyecto Godot. Sin restore, modificación de proyectos ni motor/editor, Node.js o Atlas ejecutados.

Integridad:1,520 archivos protegidos con tamaño/SHA-256/fecha idénticos antes/después, incluyendo finales/FinNivel/biomas/actores/recursos/escenas/configuración y adaptador SQLite. Las tres bases protegidas más manifiestos/leases (9 archivos) permanecen idénticos; no se abrieron con SQLite ni se reinicializó progreso manual. .env conserva278bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928,comprobado separadamente de compilaciones/pruebas, sin leer valores ni usar credenciales. No se cambian ACL/propietario; riesgo ACL de B00 pendiente. No se accede al proyecto original.

Guía manual: con la misma partida, entrar a un bioma decidido, perder por una mecánica existente y comprobar el Game Over original. Reintentar (también doble clic): una sola escena animal, entrada/recursos/objetos iniciales, mismo ambiente y sin humano/login ni pausa residual. Repetir en los cinco biomas y ambientes existentes sin editar decisiones. Desde pausa, reanudar primero; luego Menú debe abrir directamente las cinco tarjetas. Desde Game Over, Menú debe abrir esa misma selección. Elegir un bioma decidido distinto y verificar su ambiente propio e ingreso desde inicio; confirmar misma partida y restricción de nueva partida al volver al menú principal por su ruta habitual. Repetir sin internet y después de cerrar/abrir el juego. No dañar bases reales para inducir errores. Recoger consola/traza si aparece cualquier error nuevo.

Próxima etapa: validar estos dos flujos y aclarar consola con evidencias. CompleteBiome por llegada física, checkpoints, cierre global y finales siguen fuera de alcance; no se implementan aquí ni se inicia B05. Trabajo detenido al terminar C.2C.4.

## B04.2B.2B.2D.2 — Consultas locales sin migraciones (2026-10-26)

**COMPLETADA EN CÓDIGO. Pantalla Estadísticas pendiente, sin conexión visual.** La autorización actual limita el plan D.1 a consultas derivadas: no se implementan sus propuestas de sesiones/eventos/intervalos, esquema3, instrumentación o sincronización. Prevalece este alcance sobre los apartados futuros del plan histórico.

Inventario exacto de cambios: nuevos local-persistence/src/StatisticsModels.cs.txt, StatisticsRepository.cs.txt y StatisticsService.cs.txt; nuevo local-persistence/game-save-tests/LocalStatisticsChecks.cs.txt y selector --local-statistics en GameSaveChecks.cs.txt. Documentación: LOCAL_STATISTICS_IMPLEMENTATION_PLAN.md, GLOBAL_STATISTICS_DESIGN.md, PHASES.md, PHASE_HISTORY.md, DECISIONS.md y local-persistence/README.md. Total11 archivos. No se cambian UnitOfWork, SQLiteRepository, GameSaveService, adaptadores, Godot, proyectos, esquema ni migraciones.

### Consultas y contratos implementados

StatisticsService recibe ISaveDatabase ya validado y SaveCatalog existente, sin ruta arbitraria ni apertura/creación de almacenes desde UI. Su constructor verifica esquema2 e integridad mediante SchemaManager.Verify (sin Initialize). Cada consulta completa usa **una UnitOfWork.Read**; StatisticsRepository reutiliza Profile/Games/Game/Biomes/Decisions/Environments/Receipt del repositorio existente dentro de esa misma transacción. Las listas son materializadas y expuestas como colecciones readonly. No hay SQL de escritura, recibos nuevos, timestamps actualizados ni almacenamiento redundante.

- GetLocalStatistics(): StatisticsResult<PlayerStatistics>; NoData/Data=null si el esquema está inicializado pero no hay perfil. Nunca crea perfil ni partida.
- GetPlayerStatistics(owner): exige UUID válido y coincidencia con el perfil local; devuelve nombre visible, ID, TotalGames, ActiveGames/ActiveGameId/ActiveGame, HistoricalGames, CompletedGames, AllDecisions/HistoricalDecisions, AllProgress/HistoricalProgress y Uncollected.
- GetGameStatistics(owner,gameId): consulta una partida de ese dueño; GameStatistics incluye IDs, revisión, estado/is_current, versiones, fechas almacenadas, Ending, ConfirmedCompleted, DecisionStatistics, ProgressStatistics y cinco BiomeStatistics.
- DecisionStatistics: Total/Reject/Approve/Healthy/Degraded y cinco BiomeDecisionStatistics. BiomeStatistics contiene estado/resultado/fechas, evidencia de inicio y ConsequenceStatistics opcional (GameId/BiomeId/DecisionId/OperationId, OptionId, ambiente, JSON/version/reglas/fecha).
- No se exponen referencias de credenciales, correo interno ni cuenta técnica en estos contratos. DisplayName se usa solo localmente, no se exporta.

ActiveGame significa la fila is_current, tanto in_progress como final_pending; no promete que esta última sea jugable ni que la navegación final ya exista. HistoricalGames excluye is_current y conserva cada GameId. All* suma todas las partidas; Historical* solo las no actuales; ActiveGame contiene su propio resumen. Los valores de progreso históricos suman filas (GameId,BiomeId), no colapsan ocean de varias partidas en una fila. GamesState=NoData distingue perfil sin partidas, aunque sus conteos válidos sean0.

El repositorio pagina juegos en bloques128 hasta agotar y decisiones por decision_order hasta agotar, bajo el mismo snapshot, sin quedar limitado a50/100. La selección de perfil se verifica dentro de la transacción y los SQL reutilizados parametrizan dueño/partida. No se mezclan consultas de GameSaveService que abrirían transacciones independientes.

### Interpretación y prevención de duplicados

Se valida catálogo/versiones de contenido/formato, cinco biomas/ambientes, decisiones y opciones/consecuencias v1/v2, vínculo LastDecisionId y recibo de decisión de la misma partida/propietario. No se cuenta la proyección environmental_state como otra decisión. IDs y clave lógica por bioma/decision_key se validan; ningún reinicio/visita incrementa decisiones porque esas rutas solo consultan y la capa no emite comandos.

Completed de progreso se cuenta exclusivamente desde biome_progress.status='completed'; animal_pending no es fallo ni completed. Las cinco filas precreadas human_pending no equivalen a cinco entradas. ConfirmedStartedMinimum incluye decisión confirmada o entrada humana actual indicada por CurrentBiomeId/ResumeKind. Started es true con evidencia y null si no puede conocerse. Progress.Started es Unknown/null si falta evidencia para alguna fila; solo es Available cuando todas están acreditadas y NoData si no hay filas. No se infieren visitas históricas desde attempt_number, recibos sin BiomeId o saved_at.

ConfirmedCompleted de partida requiere status completed y los metadatos terminales existentes: ending good/medium/bad, ending_rules_version igual a rules_version y completed_at presente. Ending también reconoce esos metadatos en final_pending sin contar la partida como terminada. Esto verifica la declaración almacenada, NO recalcula umbrales ni demuestra una llegada física no instrumentada. Un completed con metadatos incompletos devuelve Ending Unknown y CompletedGames Unknown/null, no un cero ficticio. Archived no se trata como completado por su nombre. No se implementa cierre ni finales.

StatisticsAvailability distingue Available, Unknown, NotAvailable y NoData. StatisticCount.Value es nullable:
- Available con0: conteo válido y vacío, por ejemplo decisiones de un perfil sin partidas.
- Unknown/null: datos insuficientes para una métrica derivada, por ejemplo número exacto de biomas iniciados o terminal incompleto.
- NotAvailable/null, Reason=NOT_COLLECTED: tiempo jugado, sesiones, muertes, reinicios y reintentos, sin captura existente.
- NoData: no existen registros aplicables (perfil ausente, historial vacío, consecuencia de un bioma sin decisión o final no registrado).

Datos corruptos/contradictorios no generan estadísticas inventadas ni se reparan: SaveException con código seguro (INVALID_STATISTICS_DATA, UNKNOWN_CONTENT, NOT_FOUND, INVALID_DATA, UNSUPPORTED_SCHEMA o códigos StorageErrors como IO_ERROR/ACCESS_DENIED/STORAGE_BUSY). No se devuelve un resumen parcial como éxito tras fallar SQLite.

### Ejemplos sintéticos comprobados

Prueba con una partida histórica con reject en ocean y una actual con approve en jungle: TotalGames2, ActiveGames1, CompletedGames Available1, AllDecisions Total2/Reject1/Approve1, HistoricalDecisions Total1/Reject1/Approve0, ActiveGame.Decisions Total1/Reject0/Approve1. Las decisiones no completan los biomas; los metadatos terminales históricos son preparación explícita de fixture, no implementación de finales.

Prueba con55 partidas históricas de dos decisiones y una activa de una decisión: TotalGames56, HistoricalGames.Count55, AllDecisions.Total111, Reject56, Approve55. Otra fixture de129 partidas confirma que la paginación supera incluso el bloque interno128. No son estadísticas de la partida manual.

Ejemplo de estado sin captura:
~~~json
{"PlayedMilliseconds":{"State":"NotAvailable","Value":null,"Reason":"NOT_COLLECTED"},"Deaths":{"State":"NotAvailable","Value":null,"Reason":"NOT_COLLECTED"}}
~~~
La representación muestra nombres de enum para documentación; el contrato C# no impone una serialización JSON remota.

### Preparación para la futura pantalla

Una futura integración explícitamente autorizada debe invocar estas consultas en el worker/cola del adaptador propietario del ISaveDatabase ya abierto, conservar su ciclo de vida y entregar DTOs al hilo Godot. No abrir una conexión ni ejecutar SQL en scripts visuales. Obtener primero GetLocalStatistics; manejar NoData y SaveException sin crear partidas ni usar recuperación HTTP. Renderizar Value solo cuando State=Available; mostrar desconocido/no disponible/sin datos según el estado. Para opciones actuales usar ActiveGame.Biomes y sus consecuencias; para historial seleccionar GameId o Historical*. No sumar All*+ActiveGame+Historical* (duplicaría datos).

No se añade todavía ese método al GamePersistenceAdapter, ni botón, escena, observador de tiempo, exportador, tarea de sync o endpoint. Los contratos son locales; estadísticas globales seguirán derivándose en el servidor de múltiples jugadores sincronizados, con política de identidad/datos mínimos futura.

### Pruebas y compilación efectivas

**299 comprobaciones C# aprobadas, cero fallidas:**39 nuevas estadísticas +19 Game Over/navegación +21 reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las260 anteriores se reejecutaron, no se presentan solo como historia.

Las39 cubren base inicializada vacía, perfil sin partidas, activa/historial separado, ambos resultados en cinco biomas, orden libre, retry idempotente/restart sin doble conteo, paginación56/129 y111 decisiones, completed realmente almacenado, final histórico/versiones/metadatos incompletos, final_pending actual, cuatro estados de disponibilidad, consecuencias v1/v2, conexión mode=ReadOnly/query_only, bytes/timestamps/esquema/recibos intactos, una conexión por snapshot completo, perfiles ajenos/independientes, IDs inválidos, tabla ausente, errores de acceso, versión antigua incompatible sin upgrade, consecuencias desconocidas/contradictorias y ausencia de dependencias HTTP/Mongo/Godot/campos de credenciales.

Comandos: dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore; ejecutor con --local-statistics y los ocho modos seguros anteriores; local-persistence/run-checks.ps1. Solo fixtures propias en local-persistence/.work/databases/<UUID>, cero archivos SQLite sintéticos restantes. No se prueba con bases manuales, modo durable por defecto ni conexiones externas. Callbacks y fuente de UI inspeccionada en regresiones no equivalen a ejecución del motor.

Biblioteca/ejecutor0errores/0advertencias. Rebuild completo TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild, GodotProjectDir hacia integration/sqlite/.work/:0errores,63advertencias históricas ParallaxBackground y ninguna nueva. MSBuild:86 fuentes, una sola referencia de biblioteca y cero fuentes backend/tests filtradas. CLI/paquetes/temporales privados, sin restore ni cambios de proyectos. No Godot, Node.js o Atlas ejecutados.

### Compatibilidad, integridad y límites

Compatible con esquema2 inicializado y registros antiguos de formato/consecuencias soportados. Una base sin esquema o esquema1 que necesitaría migración se rechaza sin inicializar/actualizar; tampoco se interpreta contenido de versiones desconocidas. No se alteran los diez modelos/tablas existentes ni sus constraints/checksums. Las consultas materializan el historial completo; para volúmenes muy grandes queda optimización futura, sin cambiar ahora su semántica.

Comparación antes/después:1,530 archivos protegidos idénticos en tamaño/SHA-256/fecha y9 archivos de las tres bases/manifiestos/leases intactos. No se abrieron bases duraderas mediante SQLite. .env278bytes,SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928,comprobado separadamente de builds/tests sin leer valores ni cambiar ACL/propietario. Riesgo ACL de B00 pendiente. Producción previa de gameplay, recursos, decisiones, pausa/Game Over/navegación/FinNivel/Final, escenas y proyectos permanecen intactos.

Siguiente subfase recomendada: conexión local de pantalla Estadísticas con estos DTOs y estados, solo tras nueva autorización. Eventos/tiempos/muertes/reinicios, migraciones, CompleteBiome, finales y Atlas quedan para fases separadas; no B05. Detenerse después de D.2.

## B04.2B.2B.2D.3 — Pantalla local de estadísticas (2026-10-26)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** Se conecta exclusivamente la consulta local de D.2, sin eventos, migraciones, sincronización ni nuevas métricas.

Inspección: el botón existente es Centro/Tablero/Margen/Contenido/BotonesInferiores/BotonEstadisticas, en assets/sprites/ui/menu_principal.tscn. MenuPrincipal lo deshabilitaba si EscenaEstadisticas era null, y esa exportación no está asignada. No existe una escena/pantalla de estadísticas; scripts/Estadisticas.cs es HUD de recursos y queda intacto. Por tanto se crea una vista desde C#, como el LocalProfileView existente, dentro del tablero del menú, sin añadir/editar .tscn ni cambiar recursos visuales.

Archivos de producción: scripts/MenuPrincipal.cs; nuevo scripts/LocalStatisticsScreen.cs; integration/sqlite/GamePersistenceAdapter.cs; integration/sqlite/GamePersistenceContext.cs; nuevo integration/sqlite/LocalStatisticsScreenState.cs. Pruebas: nuevo local-persistence/game-save-tests/StatisticsScreenChecks.cs.txt, dispatcher GameSaveChecks.cs.txt y Compile del archivo puro en GameSave.Checks.csproj. Documentación: LOCAL_STATISTICS_IMPLEMENTATION_PLAN.md, GLOBAL_STATISTICS_DESIGN.md, PHASES.md, PHASE_HISTORY.md, DECISIONS.md, local-persistence/README.md y los tres documentos GODOT_RUNTIME_INTEGRATION_PLAN/GODOT_SCENE_EVENT_MAPPING/GODOT_RUNTIME_TEST_PLAN. Total17 archivos; no se modifican proyectos de producción ni biblioteca de consultas D.2.

### Integración de fuentes y consulta

Los Statistics*.cs.txt son fuentes reales de la biblioteca: local-persistence/src/TwoSides.LocalPersistence.csproj incluye Compile="*.cs.txt". TwoSides.csproj excluye local-persistence/** y ya tiene una ProjectReference a esa biblioteca. No se renombran/copian DTOs/servicio a scripts Godot ni se duplican clases. GameSave.Checks.csproj incorpora solo el nuevo estado puro de pantalla, sin referencias al motor.

GamePersistenceAdapter implementa ILocalStatisticsReader, una capacidad con un único GetLocalStatisticsAsync. Reutiliza su _gate/Task.Run y el ISaveDatabase ya abierto por el contexto, con StatisticsService lazy dentro del worker. GetLocalStatistics consulta el mismo esquema/datos de D.2 en una transacción de lectura; no abre otro CopyGameDatabase ni crea registros. El servicio estadístico se invalida al Close/Dispose del adaptador. Prueba negativa del adaptador real cerrado verifica STORAGE_CLOSED sin abrir rutas protegidas.

Ajuste de composición mínimo, anunciado antes de editar: GamePersistenceContext conserva el mismo adaptador propietario en un campo y expone únicamente ILocalStatisticsReader Statistics. El mismo adaptador sigue construyendo State y sigue bajo Initialization/Shutdown existentes; no hay nuevo autoload, contexto ni proveedor de rutas. No se modifica LocalGameState ni sus reglas.

MenuPrincipal.Statistics bloquea doble clic con _navigating, muestra carga, espera el resultado local y abre LocalStatisticsScreen con ese estado ya cargado. El botón deja de depender de EscenaEstadisticas y no exige partida activa: habilitado con almacenamiento listo, sin escritura pendiente/operación/transición en curso. También admite perfil ausente como estado vacío. No crea nombre ni partida. La exportación antigua se conserva sin usarse para navegación.

### Vista y ciclo de vida

La vista es un VBoxContainer hijo del MarginContainer del tablero actual. Durante su apertura se oculta el contenido original y se muestra título, ScrollContainer con Label de texto plano, Volver al menú y Reintentar consulta en caso de error. Mantiene fondo/textura/música del menú sin editar escena. Tamaño mínimo510x220 y fuente12 para cuerpo/botones, diseñado para viewport640x360; ajuste visual, scroll y foco requieren validación en Godot.

LocalStatisticsScreenState consulta una vez por apertura o reintento explícito, genera el texto en Task.Run y lo conserva; no hay polling SQLite ni formateo completo en cada frame. El render/tocar controles queda en hilo Godot tras await. Close invalida el estado y descarta respuestas tardías; cada callback verifica vida de nodo antes de actualizar UI. Volver oculta/retira la vista y restaura contenido/foco del menú, sin cambiar escena, partida o pausa. Una nueva apertura vuelve a consultar los datos actuales una vez.

Los datos del jugador solo se asignan a Label.Text: no RichTextLabel/BBCode, SQL, código, URLs ni rutas de escena. No se muestran LocalPlayerId/GameId/OperationId ni referencias de credenciales; nombre visible y fechas se usan como texto. No se exporta información.

### Datos presentados y estados

- Nombre, total de partidas y existencia de partida actual; terminadas solo según metadatos confirmados por D.2.
- Todas las partidas: decisiones totales, No/reject, Sí/approve y desglose de los cinco biomas.
- Partida actual: estado, fecha almacenada, decisiones propias, completados y pendientes, estado de cada bioma y ambiente confirmado.
- Historial separado, excluyendo la actual: totales históricos y cada partida enumerada sin ID técnico, con decisiones/progreso/ambientes y final solo si Ending está disponible. Un final no confirmado dice Desconocido o Sin final registrado, sin calcular umbrales.
- Tiempo jugado, sesiones, muertes, reinicios y reintentos muestran No disponible porque D.2 devuelve NotAvailable/null; no se convierten en0. El formateador distingue Unknown→Desconocido, NoData→Sin datos y Available0→0.
- Perfil ausente: mensaje vacío explícito. Perfil sin partidas: conteos medidos0 e historial/partida actual vacíos, sin inventar progreso. animal_pending aparece como decisión confirmada/segmento animal pendiente, no como error ni completed.

No se suman AllDecisions+ActiveGame+HistoricalDecisions como si fueran métricas disjuntas: las secciones indican su alcance. Los biomas realmente completed vienen del dato persistido, no de la decisión. Las fechas se presentan como registro, nunca se restan para inventar duración.

Error SQLite/servicio: la vista presenta error local controlado y permite Reintentar consulta o Volver. No muestra mensajes internos/secretos ni redirige a recuperación/login; un error no genera una partida temporal. Sin almacenamiento inicializado el botón permanece deshabilitado; la inicialización conserva su diagnóstico local previo.

### Pruebas y compilación

**323 comprobaciones C# aprobadas, cero fallidas:**24 nuevas de pantalla +39 consultas +19 Game Over/navegación +21 reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las299 anteriores se reejecutan, no se presentan como resultado nuevo solo por referencia histórica.

Las24 usan StatsService/SQLite real readonly en fixtures propias: perfil vacío/sin partidas, diez combinaciones bioma/opción, historial sin activa y final registrado, scopes separados, completed almacenado, estados no disponibles/desconocidos/cero, doble clic/carga asincrónica, error/retry, cierre con respuesta pendiente, reapertura sin polling, proceso hijo readonly, nombre con aspecto de markup sin IDs expuestos, adaptador cerrado real y bindings de texto/controlador sin HTTP. No abren bases manuales. El camino positivo del adaptador propietario se compila/inspecciona; las fixtures no debilitan sus restricciones de ruta para ejecutarlo sobre una base arbitraria.

Comandos: build --no-restore de GameSave.Checks.csproj; ejecutor --statistics-screen y sus probes de fixture, --local-statistics y los ocho modos seguros previos; local-persistence/run-checks.ps1. Fixtures bajo local-persistence/.work/databases/<UUID>, cero archivos SQLite sintéticos restantes. Pruebas de estado/formato/bindings no equivalen a botones, scroll o render ejecutados en Godot, ni a prueba real de desconexión de red.

Biblioteca/ejecutor0errores/0advertencias. Rebuild completo TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild, GodotProjectDir hacia integration/sqlite/.work/:0errores,63 advertencias históricas ParallaxBackground,ninguna nueva. MSBuild:88 fuentes, una referencia a la biblioteca y cero fuentes backend/tests filtradas; no se duplica StatisticsService ni su fuente .cs.txt. CLI/paquetes/temporales privados; sin restore, editor/motor, Node.js o Atlas ejecutados.

### Integridad y validación manual pendiente

Antes del ajuste de contexto se verificó intacto el manifiesto inicial de1,528 archivos protegidos; se añadió GamePersistenceContext al inventario autorizado antes de editarlo. Manifiesto final:1,527 archivos protegidos con tamaño/SHA-256/fecha idénticos antes/después, incluidos esquema, biblioteca D.2, escenas, project.godot/TwoSides.csproj, actores, recursos, decisiones, Game Over/pausa/reinicio/navegación animal/FinNivel/finales. Nueve archivos de las tres bases/manifiestos/leases permanecen intactos, sin abrirlos mediante SQLite en pruebas. .env278bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928 antes/después, separado de builds/tests, sin leer valores ni cambiar permisos/propietario. Riesgo ACL de B00 pendiente.

Guía manual: abrir esta copia en Godot C# sin Node; con el perfil existente pulsar Estadísticas y comprobar nombre, partidas y decisiones de los cinco biomas contra lo jugado. Verificar que decidir no equivale a completed y que los ambientes coinciden; distinguir secciones actual/historial. Confirmar No disponible para los cinco campos no capturados, desplazamiento hasta el final y retorno al mismo menú. Doble clic debe abrir una sola vista. Reabrir tras volver, cerrar/abrir el juego y probar sin internet. Si solo hay perfil/historial debe poder consultarse sin crear otra partida. No borrar bases ni alterar decisiones para fabricar casos; vacíos/fallos se cubren con fixtures.

Si aparece un error, copiar consola/traza sin secretos e indicar carga, scroll o retorno. No se afirma validación visual sin motor. Historial completo muy grande todavía puede exigir paginación visual futura; consultas/formateo se ejecutan fuera del hilo principal, pero layout/render final necesita evaluación runtime.

No se implementan captura de métricas, migración, CompleteBiome, checkpoints, finales, Atlas, datos globales ni B05. Siguiente paso: validación manual de D.3 y autorización específica para cualquier nueva subfase. Trabajo detenido al terminar.

## B04.2B.2B.2D.4A — Almacenamiento local de eventos y tiempos (2026-10-26)

**COMPLETADA EN CÓDIGO; SIN CAPTURA GODOT NI MIGRACIÓN REAL.** El usuario confirma D.3:14/14 comprobaciones manuales correctas y cero errores nuevos. La pantalla validada y StatisticsService conservan su comportamiento, incluidas las métricas No disponible.

### Archivos y decisión de compatibilidad

Nuevos en local-persistence/src: GameplayEventModels.cs.txt, GameplayEventSchema.cs.txt, GameplayEventRepository.cs.txt, GameplayEventService.cs.txt y GameplayMonotonicClock.cs.txt. Pruebas: GameplayEventChecks.cs.txt nuevo y dispatcher GameSaveChecks.cs.txt. Se actualizan únicamente los siete documentos indicados para D.4A: plan/diseño global/auditoría de eventos/PHASES/PHASE_HISTORY/DECISIONS/README. Total14 archivos. Ningún controlador, adaptador o escena Godot, StatisticsModels/Repository/Service, servicio de gameplay ni esquema base se modifica.

El plan D.1 proponía una posible versión3 del esquema base. La alternativa implementada reduce riesgo: **extensión opcional gameplay versión1 sobre base versión2**, con historial propio. Cambiar CurrentVersion base habría afectado verificadores/consumidores ya validados y la apertura automática del runtime. Se conservan user_version=2, migraciones1/2 y sus checksums, diez tablas originales y servicios existentes. No se reinterpreta ningún dato histórico ni se añade una columna a una tabla anterior.

MigrateSynthetic acepta exclusivamente SyntheticDatabase, cuya creación y validación están restringidas al namespace UUID de SyntheticSandbox bajo local-persistence/.work/databases. No acepta CopyGameDatabase, OwnedCopyDatabase, ISaveDatabase genérico ni ruta arbitraria como destino de migración. El runtime existente no invoca esta extensión. Solo una fase futura expresamente autorizada podrá definir una capacidad de migración real con respaldo y recuperación verificados; no se debe eludir la restricción de tipos.

### Esquema implementado

Cuatro tablas nuevas únicamente en fixtures migradas (14 tablas totales):
- gameplay_schema_migrations: PK version, migration_key UNIQUE, checksum y applied_at. Versión1, clave local-gameplay-extension-v1; checksum SHA-256 del SQL normalizado.
- gameplay_sessions: session_id PK, local_player_id FK, started_at_utc, status open/closed/interrupted, ended_at_utc nullable, end_offset_ms nullable; UNIQUE(session_id,owner). Índice parcial ux_gameplay_open_session permite una sesión abierta por propietario, evitando dos relojes capturando simultáneamente.
- gameplay_events: event_id PK; owner/session, kind, occurred_at_utc, offset_ms, game/biome/run opcionales según tipo, death_cause/session_end limitados, contract_version1, payload_digest y dedupe_key; UNIQUE(owner,dedupe_key) y clave compuesta para referencias de run.
- gameplay_intervals: interval_id PK; owner/session, start_ms/end_ms, state, game/biome/run y versión/digest; end>=start>=0 y UNIQUE(session,start,end,state). No tabla de acumuladores redundantes.

FK compuestas preservan propietario de sesión/partida, bioma de esa partida y vínculo del run con su evento ANIMAL_SEGMENT_STARTED. El servicio confirma además tipo/alcance del run: una FK por sí sola no asegura semántica de evento. Índices de eventos por dueño/game/biome/kind y session/offset; intervalos por session/rango y dueño/game/biome/state. Las consultas parametrizan filtros; no tienen LIMIT fijo que trunque historial.

Migración: verifica base2 compatible, abre transacción inmediata, crea todo el SQL y su historial en un único commit. Si encuentra extensión parcial/versión/checksum incompatibles, rechaza sin sobreescribir. Si falla antes del commit, DDL/historial se revierten. Segunda aplicación verifica lo existente y no vuelve a insertar ni cambia bytes. Base vacía necesita primero inicialización base explícita en fixture; esquema1/futuro incompatible no se actualiza silenciosamente. No se tocaron las bases protegidas.

### Contratos y servicios

GameplayEvent contiene EventId, LocalPlayerId, SessionId, Kind, OccurredAtUtc, OffsetMs, GameId/BiomeId/AnimalRunId cuando aplican, DeathCause/SessionEnd tipados y Version1. UUIDv4 canónicos existentes; no nombres, correos, credenciales, texto libre, posiciones o recursos. UTC se normaliza antes del digest. Metadatos posibles son enums cerrados, no JSON arbitrario.

Kinds soportados: SESSION_STARTED, SESSION_ENDED, ANIMAL_SEGMENT_STARTED, ANIMAL_DIED, ANIMAL_RESTART_REQUESTED, ANIMAL_RETRY_REQUESTED, ANIMAL_SEGMENT_EXITED, ANIMAL_SEGMENT_COMPLETED. El último solo puede almacenarse si el bioma YA tiene completed confirmado en dominio; el servicio no ejecuta CompleteBiome ni marca nada completado. La fixture positiva prepara ese estado con la API anterior solo para probar el contrato futuro.

GameplayEventService.RecordEvent registra inicio/cierre y eventos en transacciones inmediatas propias del servicio nuevo; no altera local_operations ni revisiones/timestamps de gameplay. SESSION_STARTED crea sesión y evento atómicos. SESSION_ENDED normal sella estado/UTC real/offset monotónico y evento juntos. InterruptSession sella interrupted con fin UTC desconocido, descubrimiento UTC en el evento y offset duradero existente. Una sesión cerrada rechaza nuevos registros salvo duplicados exactos ya comprometidos.

Inicio animal exige partida actual in_progress, bioma canónico animal_pending, decisión/consecuencia/vínculo confirmados y ambiente coherente con reject/approve. AnimalRunId es el EventId del inicio y no cambia durante ese intento. No abre dos runs activos dentro de una sesión; muerte, salida, solicitud voluntaria o completed cierran el run para tiempo activo. Reintento requiere muerte previa y se rechaza después de salida/cierre incompatible. Muerte no cierra la partida; reintentar no agrega otra muerte. Salida puede seguir a muerte sin contabilizarla otra vez.

RecordInterval registra intervalos confirmados; GetEvents filtra por partida/bioma y GetSessions por propietario; GetTotals ofrece agregados scoped de muertes, solicitudes de reinicio/reintento, tiempo efectivo/pausa/observado y duración de sesión. Contratos son nuevos e independientes; StatisticsService anterior sigue devolviendo NotAvailable, verificado por prueba, hasta una integración posterior explícita.

### Idempotencia y tiempo

EventId/IntervalId se generan una sola vez en el futuro adaptador por operación lógica. Mismo ID y digest devuelve GameplayWriteReceipt(Inserted=false), incluso tras cerrar sesión; contenido distinto da EVENT_CONFLICT/INTERVAL_CONFLICT. Claves naturales kind+session o kind+animalRun evitan una segunda muerte, solicitud o cierre aunque un emisor defectuoso cambie de ID: se rechaza con conflicto, no se suma otra fila. No deduplicar por UTC, escena o bioma solamente.

Los contadores Restarts/Retries significan **ANIMAL_RESTART_REQUESTED/ANIMAL_RETRY_REQUESTED registrados**, no prueba de carga exitosa de escena. Una fase posterior podrá correlacionar nueva entrada confirmada para una métrica distinta; no mezclar ambos significados. No se genera otro evento de muerte al pulsar retry.

GameplayMonotonicClock usa Stopwatch.GetTimestamp/Frequency (inyectables en pruebas), origen nuevo por ejecución/sesión y offsets enteros en milisegundos. Conversión decimal desde diferencia total evita acumulación de redondeos por frame; rechaza reloj hacia atrás/duración inválida. No hay timer, autoload ni bucle del motor. El llamador futuro debe usar ese mismo origen para eventos e intervalos; nunca restar UTC ni comparar ticks entre procesos.

Intervalos [start,end) exclusivos por sesión: la transacción inmediata comprueba solapamiento contra cualquier clasificación, no solo active. Adyacentes permitidos, duplicados exactos idempotentes; IDs alternativos para el mismo rango se rechazan. ActiveHuman/ActiveAnimal suman efectivo; Paused/Menu/GameOver/Loading/Background quedan fuera. Puede existir pausa atribuida al bioma, pero nunca suma tiempo activo. Los intervalos no se borran al morir o salir.

Una sesión normal puede declarar duración por offset de cierre, incluidos menús/pausas; RecordedElapsedMs suma intervalos realmente confirmados. No sumar esa duración a efectivo/subtotales. Si faltan intervalos o la sesión sigue abierta/interrumpida, Incomplete lo indica. Para filtro por partida no se atribuye toda una sesión a ese game porque puede abarcar varios: SessionDurationMs=NotAvailable/SESSION_SPANS_GAMES; el tiempo de game/biome se deriva de sus intervalos.

No hay intervalos: EffectiveMs=Unknown/null, no0. Intervalo confirmado0..0: Available0. Sin cobertura animal registrada: muertes/restarts/retries NotAvailable/null. Resultados Scope=RecordedCoverageOnly y HistoricalCoverageUnknown=true: un0 medido cubre únicamente esa captura, nunca demuestra ausencia histórica de muertes antes de instrumentar. El servicio no rellena eventos, sesiones ni tiempo anteriores.

Cierre inesperado: solo se conserva lo duradero; InterruptSession no extrapola hasta la hora de descubrimiento. Duración total permanece Unknown y ended_at_utc=null. Debe sellarse la sesión anterior antes de abrir otra. El intervalo no confirmado se pierde potencialmente y no puede recuperarse reproduciendo gameplay. InterruptSession lee el límite y lo revalida al escribir; una escritura concurrente que lo cambie produce conflicto temporal, no se inventa tiempo. Reintentos deben conservar ID/UTC/payload o consultar el cierre ya existente.

### Pruebas y compilación

**364 comprobaciones C# aprobadas, cero fallidas:**41 nuevas eventos/tiempo +24 pantalla +39 consultas +19 Game Over/navegación +21 reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las323 regresiones se reejecutan. No se suman repeticiones de pruebas ni resultados históricos sin ejecución.

Las41 verifican extensión nueva/repetida/fallida/parcial/futura/checksum, base histórica y decisiones/recibos conservados, sesiones y cierres normales/interrupted, eventos/tiempos por game/biome, muerte/request/retry separados, idempotencia/conflicto, completado solo previamente confirmado, intervalo0 vs desconocido, exclusión de pausa/menú/derrota, rollback de inicio/cierre/evento/intervalo, propiedad y run, concurrencia de mismo evento y de intervalos solapados, reloj monotónico, API anterior intacta, reapertura readonly en proceso hijo y ausencia de PII/HTTP/Godot en los contratos.

Estrés:40 sesiones,400 intentos animales,1.280 eventos y400 intervalos;400 muertes,400 solicitudes de reintento y4.000ms efectivos capturados, sin truncamiento/duplicación. También compara digest completo del agregado de gameplay y número de local_operations antes/después: intactos. Datos son exclusivamente sintéticos.

Comandos: build --no-restore de GameSave.Checks.csproj; --gameplay-events y probe readonly limitado a fixture UUID; los diez modos seguros anteriores; local-persistence/run-checks.ps1. Solo local-persistence/.work/databases/<UUID>. Cero archivos SQLite sintéticos restantes. Sin bases manuales/servicios externos ni lógica de eventos ejecutada en Godot.

Biblioteca/ejecutor0errores/0advertencias. Rebuild TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild con GodotProjectDir hacia integration/sqlite/.work/:0errores,63 advertencias históricas ParallaxBackground y ninguna nueva. Las fuentes nuevas .cs.txt entran solo por la biblioteca ya referenciada; no se modifica csproj ni se duplican clases. CLI/paquetes/temporales privados; sin restore, Godot, Node, Atlas o AWS ejecutados.

### Integridad, riesgos y siguiente subfase

Comparación antes/después:1.538 archivos protegidos idénticos en tamaño/SHA-256/fecha; incluye esquema/migraciones base, estadísticas/pantalla, todos los controladores, gameplay, escenas, proyectos y finales. Las tres bases protegidas más manifiestos/leases (9 archivos) siguen intactos, sin abrirlas mediante SQLite para pruebas. .env278bytes,SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928,comprobado separadamente antes/después, sin valores ni cambios de propietario/ACL. Riesgo ACL de B00 pendiente.

Riesgos pendientes: pérdida antes del commit, cola/disco lleno y política de bloquear o continuar con cobertura incompleta; reloj/origen correcto bajo suspensión; fuente de causa de derrota; crecimiento/retención; IDs/intenciones que el emisor debe mantener; etiquetas de cobertura para no tratar conteos parciales como totales históricos. No hay outbox, ACK remoto ni entrega garantizada a Atlas. El recibo local no es un ACK de servidor.

Plan preciso para futura autorización:
1. Diseñar respaldo, verificación/reversión y capacidad explícita para migrar el runtime real; validarlo en fixtures/ensayo. No basta llamar MigrateSynthetic ni relajar su tipo. Requerir autorización específica antes de tocar datos reales.
2. GamePersistenceAdapter: servicio de eventos en su cola/worker, solo después de verificar extensión ya autorizada; sin SQL en scripts ni conexión paralela.
3. GamePersistenceContext y nuevo observador único: SESSION_STARTED al activar captura con perfil; cierre normal después de flush; al arrancar, interrumpir sesión abierta anterior sin arrastrar reloj entre procesos.
4. AnimalSegmentFlow: confirmar ANIMAL_SEGMENT_STARTED una vez después del guard, EventId=AnimalRunId; recibir origen de intención y preservar EventId en retry. MenuPausa registra solicitud voluntaria y cierra intervalos al pausar/reanudar. GameOver registra primera derrota del run y solicitud de reintento distinta; causa Unknown si no está propagada, sin modificar daño/recursos por inferencia.
5. Retorno al menú registra ANIMAL_SEGMENT_EXITED sin muerte duplicada y sin checkpoint. Una máquina exclusiva cierra intervalos al entrar/salir de carga, pausa, menú, foco, derrota y juego activo; cadence de flush requiere aprobación, no se activa en D.4A.
6. Nueva capa de consulta/presentación autorizada deberá etiquetar cobertura y distinguir solicitudes de reinicios exitosos; no sustituir silenciosamente las métricas de StatisticsService. Validación manual posterior de pausas, cierres, tiempos y conservación de gameplay.
7. ANIMAL_SEGMENT_COMPLETED solo se conectará a un commit de dominio confirmado en otra fase de meta física; no a decisión, BodyEntered aislado o Game Over. Finales y B05 siguen fuera de alcance.

Para Atlas futuro: preservar IDs/version/digest, receptor idempotente y ACK solo tras commit durable; misma carga/ID puede repetirse, otra carga/ID conflictivo no se suma. Una outbox transaccional y su retención se diseñarán en fase autorizada, no existen aquí. No enviar nombres ni otros datos personales innecesarios.

Recomendación: siguiente subfase de preparación/migración real controlada y luego captura local autorizada, manteniendo estos límites. D.4A termina aquí; no se conecta Godot, no CompleteBiome/finales/checkpoints/sync/B05.

## B04.2B.2B.2D.4A.1 — Respaldos y ensayo de migración (2026-10-26 Guatemala)

**COMPLETADA. Las tres bases originales siguen sin migrar.** Ejecución real de respaldos:2026-10-27T05:22:36Z, equivalente a2026-10-26 23:22:36 en Guatemala. No se falsifican fechas ni timestamps de origen.

### Herramienta aislada y ubicación privada

Archivos nuevos: local-persistence/backup-rehearsal/BackupRehearsal.csproj, Program.cs.txt y packages.lock.json. Solo se actualizan estos cinco documentos: LOCAL_STATISTICS_IMPLEMENTATION_PLAN.md, PHASES.md, PHASE_HISTORY.md, DECISIONS.md y local-persistence/README.md. No cambia ninguna herramienta compartida, migrador/repositorio de producción, adaptador runtime, gameplay, interfaz o escena.

El helper referencia la biblioteca existente y RealGameCatalog, compila fuentes .cs.txt como ejecutor aislado y admite solo --self-test y --backup-and-rehearse. No acepta rutas de origen/destino del usuario ni modo restaurar originales. La ejecución privilegiada revisada se limita a crear la carpeta privada fuera de OneDrive y escribir respaldos/copias/manifiesto allí; las tres fuentes son constantes y se abren exclusivamente ReadOnly.

Raíz de salida: %LOCALAPPDATA%\TwoSides\PrivateBackups\D4A1\<fechaUTC-UUID>. El manifiesto privado manifest.json contiene rutas exactas de cada origen/respaldo, fecha, tamaño, SHA-256, versión/base/application_id, método, integridad, relaciones, conteos/huellas por tabla y resultados de migración/rollback/restauración. La ruta exacta y hashes de esta ejecución se entregan al usuario en el informe privado. No se copian respaldos, datos del jugador ni el manifiesto privado al repositorio/documentos públicos.

La raíz nueva tiene ACL privada explícita para el usuario ejecutor, SYSTEM y Administradores. Se configura exclusivamente esa carpeta nueva, no permisos/propietario de las fuentes. Está fuera del árbol OneDrive y del repositorio Git; no se envía nada a nube. Los archivos de respaldo y las copias de ensayo contienen datos reales y deben conservarse con esa protección. No se utiliza TEMP para los respaldos duraderos.

### Ausencia de escritores y método consistente

La consulta inicial CIM fue denegada. Como comprobación alternativa válida se usa Get-Process y luego Process.GetProcesses en la propia herramienta: no aparecen Godot, TwoSides/Two-Sides ni dotnet antes de acceder a fuentes. Si la enumeración falla o detecta esos procesos, la herramienta se detiene sin copiarlas; nunca termina procesos.

Se validan rutas fijas y ausencia de reparse points bajo sus anclas aprobadas. Cada fuente, store.lease y ownership.json se mantiene con FileAccess.Read/FileShare.Read: rechaza escritores existentes y evita nuevos accesos de escritura/reemplazo durante el snapshot. No se toma ni rompe el byte-range lock de aplicación y no se fuerza ningún bloqueo SQLite. Los lectores SQLite usan mode=ReadOnly, pooling=false y cache privado.

Las tres fuentes inspeccionadas NO tenían WAL/SHM/journal y su encabezado indica formato rollback1/1. Se usa Microsoft.Data.Sqlite.SqliteConnection.BackupDatabase, no File.Copy de save.sqlite3. El snapshot de tablas y esquema antes del backup se compara con el respaldo bajo la misma protección de origen; no puede haber commits concurrentes aceptados entre esas lecturas.

Limitación deliberada: si una fuente real tiene sidecars, modo WAL o encabezado desconocido, esta herramienta la omite sin abrir recuperación/checkpoint ni borrar archivos; habrá que preparar otro procedimiento seguro. No se afirma que copiar el archivo principal sea suficiente en ese caso. Una prueba sintética con WAL activo confirma que el mecanismo BackupDatabase incluye transacciones confirmadas en WAL, pero no se usa esa prueba para autorizar cambios de SHM/journal en una fuente real.

### Respaldos y validación obtenidos

Se obtuvieron los tres respaldos consistentes:
- historical-progress: base A de game-progress.
- historical-infrastructure: base B de persistence.
- runtime-game: base C con la partida manual.

Los tres respaldos tienen147.456bytes y esquema base2. Cada uno posee su propio nombre con alias, UTC y UUID y su SHA-256 real en el manifiesto. Un backup SQLite puede cambiar bytes de cabecera respecto al origen; no se exige igualdad del hash físico entre ambos. Sí se comprueba igualdad lógica exacta, application_id, user_version y estructura.

En cada respaldo/copia: PRAGMA integrity_check=ok, foreign_key_check sin filas, todas las tablas y sus definiciones preservadas. Se comparan conteos y hashes SHA-256 de todas las filas, con tipos y duplicados conservados y orden canónico de hashes; no se publican nombres, IDs de jugador/partida ni contenido de filas. El esquema incluye las restricciones/índices definidos en sqlite_master. Esto cubre perfiles, partidas, decisiones, consecuencias, cinco biomas, historial, recibos y snapshots sin revelar sus valores.

### Ensayo aplicado solo a segundas copias

Por cada respaldo se crean, con nombres nuevos sin sobrescribir:
1. rehearsal: recibe la extensión opcional1, conserva base2 y agrega cuatro tablas.
2. failure: prueba una excepción antes del commit y conserva la base original sin datos/DDL parciales.
3. restored: prueba restauración del respaldo hacia otro archivo aislado, sin apuntar a fuente alguna.

El rol Backup solo abre ReadOnly y el migrador de ensayo lo rechaza como destino. Los roles Rehearsal/Failure son los únicos mutables por ese helper; se comprueba raíz de copia, rol, ausencia de enlaces y exclusión de los tres orígenes. Los archivos restored también son de lectura.

No se amplía GameplayEventSchema.MigrateSynthetic ni su tipo SyntheticDatabase. El helper obtiene por reflexión el SQL const exacto de esa versión de biblioteca y verifica SHA-256 contra GameplayEventSchema.Checksum, para no mantener una migración divergente. Aplica ese SQL solo al rol de segunda copia, en transacción inmediata con historial propio; verifica después mediante GameplayEventSchema.Verify. Si el campo o checksum cambia en otra versión, el ensayo requiere revisión; no extrapolar este acceso a producción.

Resultados de los tres ensayos:
- Esquema base2 y application_id conservados.
- Todas las tablas/filas anteriores idénticas por definición, cantidad y huella: no cambian identificadores, decisiones, consecuencias, biomas, partida activa ni resultados históricos.
- Extensión opcional v1 reconocida y sus tablas gameplay_sessions/events/intervals VACÍAS. Solo hay el registro legítimo de migración en gameplay_schema_migrations.
- Segunda aplicación no inserta ni cambia bytes.
- Fallo antes del commit revierte todo; hash físico idéntico en la copia failure y esquema base intacto.
- Copia restored idéntica lógicamente al respaldo. Ningún archivo original se reemplaza.
- GameSaveService y StatisticsService actuales pueden leer perfil, activa, historial paginado, decisiones y progreso; los tres ensayos informan current-local-services-compatible.
- GameplayEventService consulta eventos/sesiones vacíos y conserva duración/muertes desconocidas; StatisticsService sigue devolviendo No disponible para campos no capturados.

No se generan eventos ficticios ni sesiones/intervalos en las copias finales. Las pruebas de escritura de eventos de D.4A no se ejecutan sobre estos datos reales clonados.

### Pruebas y compilación

**9 pruebas nuevas sintéticas aprobadas,0 fallidas**, más tres ensayos completos sobre copias verificadas reales. Las9 comprueban backup lógico, rol de backup no migrable, conservación tras migrar, segunda aplicación, rollback, restauración aislada, rechazo de handle escritor, backup con transacción WAL confirmada y bytes fuente intactos.

Compilación de BackupRehearsal y biblioteca referenciada:0errores/0advertencias, .NET8 con ejecutor self-contained existente. Restore solo desde caché local de paquetes, sin fuentes de red ni cambios de paquetes de producción. Herramienta compilada bajo local-persistence/.work y pruebas en namespaces propios con datos sintéticos. Las pruebas limpian solo sus archivos conocidos bajo la raíz de trabajo verificada, nunca respaldos reales.

Comandos: dotnet restore/build del proyecto backup-rehearsal con fuente local; BackupRehearsal.exe --self-test; ejecución revisada --backup-and-rehearse. No se modifica código compartido: las364 comprobaciones anteriores y las63 advertencias Godot permanecen como evidencia HISTÓRICA, no se presentan como reejecutadas. No era necesario recompilar Godot sin cambios de producción. No se inicia Godot, Node, Atlas o AWS.

### Política de pérdida antes del commit

Un evento queda confirmado cuando su transacción SQLite terminó el commit duradero; un clic/solicitud en memoria no lo prueba. Fallo antes de commit revierte cambios y no puede reconstruirse como evento real al reiniciar. Si se pierde solo la respuesta después de commit, reintentar MISMO ID y payload estable retorna lo existente; otro contenido produce conflicto. Una solicitud de reinicio no equivale a una nueva escena animal confirmada.

Intervalos sin commit son desconocidos, no tiempo medido0; no restar saved_at ni asumir que la sesión siguió jugando hasta descubrir el cierre. Tras crash se conserva el último intervalo duradero y se marca interrupted con duración total desconocida, sin restaurar posición/recursos ni fabricar eventos.

Política recomendada para la futura integración: la telemetría nunca borra ni cambia decisiones/progreso para repararse. Si falla, conservar el error y la intención pendiente con su ID, y marcar cobertura incompleta; buffers acotados y reintentos en su cola, sin crear partidas temporales ni exigir HTTP. No detener ni revertir un commit de gameplay ya confirmado por intentar registrar una métrica independiente. Cuando se necesite atomicidad dominio+evento, diseñarla explícitamente en una fase autorizada antes de conectar ambos; no prometer recuperación de datos que nunca persistieron.

### Procedimiento de restauración y migración runtime futura

El ensayo demuestra restauración hacia archivos nuevos, NO concede permiso para restaurar originales. Ante necesidad futura:
1. Cerrar Godot por acción del usuario, verificar procesos/handles y mantener las fuentes sin escritores; no matar procesos ni manipular WAL/SHM.
2. Seleccionar el backup privado y verificar SHA-256 con manifest.json; repetir integrity_check, foreign_key_check y esquema/application_id.
3. Crear otro respaldo consistente del estado actual antes de cualquier reemplazo, sin sobrescribir respaldos existentes.
4. Obtener autorización que identifique exactamente la base destino y la operación; conservar ACL/propietario y comprobar ownership.json/identidad de archivo.
5. Preferir restauración SQLite hacia el archivo destino existente bajo capacidad validada: los manifiestos OwnedCopyDatabase incluyen FileIdentity. Un reemplazo por rename/copia de archivo nuevo puede romper esa identidad y no debe hacerse como simple receta File.Copy; cualquier ajuste de manifiesto necesita procedimiento y autorización propios.
6. Verificar datos/estructura/compatibilidad y metadatos antes de volver a abrir el juego. No introducir eventos ni tiempos retroactivos al restaurar.
7. Para migración real futura, preparar una API explícita que acepte SOLO el destino runtime autorizado con respaldo/recuperación verificados. Repetir esta validación y confirmar guardas in situ; aplicar extensión en transacción, releer invariantes y conservar respaldo intacto. No ampliar por inferencia la capacidad MigrateSynthetic.

Riesgos restantes: crecimiento y retención de respaldos privados, disponibilidad de almacenamiento, cambio de esquema/SQL entre compilaciones, modo WAL futuro que exige un plan distinto, datos no confirmados antes de crash y validación completa del proveedor runtime/identidad tras una futura escritura. No eliminar respaldos para liberar espacio sin autorización.

Integridad final:1.547 archivos protegidos sin cambios de tamaño/SHA-256/fecha; los9 archivos originales de bases/manifiestos/leases permanecen intactos. La propia herramienta verifica además hash/tamaño/mtime y huella de ACL/propietario de cada base antes/después bajo protección de lectura. .env278bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, sin leer valores ni copiar credenciales/cambiar permisos. Riesgo ACL de B00 pendiente.

Siguiente subfase recomendada: autorizar explícitamente una migración runtime controlada, usando estos respaldos y procedimiento, antes de integrar capturas de Godot. No se migra ninguna base real, no se conecta evento, gameplay, CompleteBiome/finales o B05. Trabajo detenido al terminar D.4A.1.

## B04.2B.2B.2D.4A.2 — Migración runtime controlada (2026-10-26 Guatemala)

**COMPLETADA. Validación manual Godot pendiente; eventos NO conectados.** Operación real:2026-10-27T05:40:22Z (2026-10-26 23:40:22 Guatemala). Único archivo de datos migrado: local-persistence/.work/runtime-game/save.sqlite3 de la copia Two-Sides PRUEBA. No se modificaron las dos bases AppData.

### Guardas y respaldo

Se verificó ausencia de Godot/TwoSides/dotnet/ejecutores de pruebas; no se cerró ni terminó ningún proceso. La ruta absoluta se compara con una constante autorizada y CopyGameDatabase.RuntimePath. Los handles WindowsGuard existentes se reutilizan por reflexión desde la herramienta aislada: rechazan reparse/hardlinks, validan ruta final y conservan directorios/archivo contra rename/delete. La identidad nativa se comparó con ownership.json (formato/copia/purpose/Ready/FileIdentity), sin mostrar datos personales.

Se adquirió exclusión en store.lease existente, sin cambiar sus bytes; ownership.json permaneció en lectura y el archivo runtime se mantuvo con deny-write hasta la fase final de migración. Sin WAL/SHM/journal; encabezado rollback válido. Se verificaron espacio libre para respaldo/recuperación, application_id runtime0x54535254, base2, integridad y FK; no había extensión previa.

Se verificó hash del manifiesto D4A1 y respaldo de referencia (7D791333A03326FF2A4E91DEA0E1BCF5F9F40A8C0D0DB6BA34365305C33A5E0D), origen correspondiente, esquema/integridad y compatibilidad. No se asumió que fuera el estado actual: el snapshot lógico actual se comparó independientemente.

Se creó nueva carpeta privada %LOCALAPPDATA%/TwoSides/PrivateBackups/D4A2/20261027T054022Z-3618aa339d9e475ea5275d38ced08d43, fuera de OneDrive/Git. Contiene before.json, after.json y respaldo runtime-immediate-20261027T054022Z-43f00cb0f53a4f7ea5b788304fbfed38.backup.sqlite3, más ensayos aislados. No se sobrescribió ningún respaldo anterior. ACL privada únicamente en la nueva carpeta; no se cambia seguridad de fuentes.

BackupDatabase capturó un snapshot consistente actual, validado contra todas las tablas/filas/restricciones/índices mediante conteos y huellas canónicas, sin publicar nombre/decisiones del usuario. SHA-256 del respaldo inmediato:
7D791333A03326FF2A4E91DEA0E1BCF5F9F40A8C0D0DB6BA34365305C33A5E0D.
Coincide con el anterior como resultado observado, no como precondición supuesta.

El ensayo final migró SOLO una segunda copia del respaldo nuevo; validó base2/extensión1, integridad/FK, conservación exacta de tablas/datos anteriores, consultas de GameSaveService/StatisticsService/GameplayEventService, segunda aplicación byte-idempotente, fallo simulado con rollback completo y restauración hacia otro archivo aislado. No eventos ficticios en copias finales.

### Migración y resultados

La herramienta usa el SQL const del migrador versionado existente, verifica su checksum y aplica la misma función de ensayo/transacción a un gate runtime nuevo, limitado a una apertura de escritura. No se modifica ni amplía GameplayEventSchema.MigrateSynthetic. Se permite esta ruta especial solo por la autorización expresa D4A2; no constituye migración automática del runtime al arrancar.

Justo antes de escribir se revalidaron hash/metadatos originales y procesos. Dentro de la transacción inmediata se comparó nuevamente el snapshot base, se aplicaron las cuatro tablas de extensión y se compararon todos los datos base ANTES del commit. Ante error la transacción se revierte; el helper registra stopped.json y nunca restaura automáticamente ni reintenta una escritura desconocida.

Resultado:
- Antes: base v2, sin extensión.
- Después: base v2, extensión opcional v1; mismas diez tablas originales y cuatro adicionales.
- integrity_check=ok y foreign_key_check vacío.
- Perfil, partida actual, historial, IDs, decisiones, consecuencias, cinco biomas, recibos y snapshots iguales al respaldo inmediato.
- Nuevas tablas de sesiones/eventos/intervalos vacías; solo registro real de migración.
- Consultas actuales y nuevas compatibles; métricas históricas no convertidas en0.
- Identidad nativa, propietario/ACL y manifiesto de ownership conservados; no sustitución del archivo.
- SHA-256 runtime anterior:8CC18BE48074E0F91A99E39801E2CA41276192EAD0553DBFE9AA5A48AE28971C.
- SHA-256 runtime posterior:83BD0E4D27ADE3E5CA778233E59456B6CB6CAF04A3608ED92BF07B8F6D790E07.
- SHA-256 after.json:EE2E37A18E3DE2C1FC9EE3B93A27E2B5F93935136C2A2CA1FF9403E9F867246F.

### Código, pruebas y seguridad

Único archivo de herramienta modificado: local-persistence/backup-rehearsal/Program.cs.txt; añade gate runtime fijo, validación del respaldo, identidad/lease, ensayos, manifiestos y modo --migrate-runtime-controlled. No cambia biblioteca/migrador/repositorios de producción ni adaptador runtime. Se actualizan solo estos cinco documentos de D4A2. El segundo adjunto del usuario mantiene las mismas condiciones del primero.

Compilación del helper y biblioteca referenciada:0errores/0advertencias tras corregir una nulabilidad detectada durante preparación; ningún acceso de escritura runtime ocurrió durante esa compilación fallida. **15 comprobaciones sintéticas aprobadas,0 fallidas**:9 de backup/ensayo previas reejecutadas y6 de path/identidad/ownership, verificación intra-transacción/rollback, conservación de identidad/ACL con DDL y respaldo nuevo independiente de referencia anterior. Además ensayo y verificaciones efectivas en la copia y runtime autorizada. No se presentan las364 pruebas previas como reejecutadas ni las63 advertencias históricas Godot como build nuevo: no cambió código de Godot.

Comandos: build --no-restore del helper; --runtime-migration-self-test; única ejecución revisada --migrate-runtime-controlled. No Godot/Node/Atlas ni gameplay ejecutados, no captura ni CompleteBiome/finales/B05.

Integridad final:1.547 archivos protegidos sin cambios de hash/tamaño/fecha; ocho archivos protegidos de almacenes (las dos bases AppData y manifiestos/leases de las tres) intactos. Runtime SQLite excluida expresamente de esa igualdad porque fue el único dato autorizado a cambiar; sus invariantes se verifican separadamente. .env278bytes,SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, sin leer valores ni cambiar permisos/propietario. Riesgo ACL de B00 pendiente.

### Recuperación y siguiente paso

No se necesita recuperación y no se efectuó ninguna. Si aparece un fallo después: detener juego/escritores por acción del usuario, preservar runtime/manifiestos/sidecars y diagnóstico; verificar hashes del respaldo y after.json, integridad/compatibilidad en otra copia. Cualquier restauración requiere autorización adicional que nombre destino y respaldo. No sustituir por rename/File.Copy: ownership.json referencia identidad de archivo; preferir procedimiento SQLite in-place validado que conserve identidad/seguridad. Crear antes otro respaldo del estado a reemplazar y ensayar restauración aislada. No reintentar esta migración sobre runtime ya extendido: el gate la rechaza.

Riesgos pendientes: prueba manual del videojuego tras migrar, pérdidas de eventos anteriores al commit, política de fallos/cobertura, origen de reloj y retención antes de captura. La pantalla sigue mostrando No disponible para datos no capturados; no hay eventos históricos reconstruibles.

Siguiente recomendación: validar manualmente continuidad/estadísticas actuales y luego autorizar por separado la conexión de eventos/intervalos al adaptador/observador único de Godot, usando IDs estables y diferenciando solicitudes de reinicios confirmados. D4A2 termina aquí: no conectar eventos, no gameplay, no CompleteBiome/finales ni B05.

## B04.2B.2B.2D.4B — Captura local Godot y tiempo efectivo (2026-10-27 Guatemala)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** El usuario confirma D4A2 con14/14 comprobaciones manuales, base runtime2+extensión1 y gameplay sin errores nuevos. Esta fase conecta únicamente captura local; no modifica la pantalla Estadísticas ni su contrato histórico No disponible.

### Inventario exacto y arquitectura

Producción: integration/sqlite/LocalGameplayObserver.cs nuevo; integration/sqlite/GamePersistenceAdapter.cs; integration/sqlite/GamePersistenceContext.cs; scripts/AnimalSegmentFlow.cs; assets/sprites/ui/MenuPausa.cs; assets/sprites/ui/GameOver.cs; scripts/MenuPrincipal.cs (solo salida normal). Pruebas: GameplayObserverChecks.cs.txt nuevo, dispatcher GameSaveChecks.cs.txt y Compile del observador puro en GameSave.Checks.csproj. Nueve documentos indicados en D4B actualizados. Total19 archivos.

No se modifican LocalGameState, StatisticsService/pantalla, biblioteca/esquema de eventos, relojes de recursos, actores/daño, NPC, escenas, project.godot, TwoSides.csproj, FinNivel ni finales. Los personajes y ZonaMuerte ya convergen en GameOver.MostrarDerrota; no se añaden señales ni hooks duplicados en cada animal. El observador vive como objeto C# poseído por GamePersistenceContext existente (hijo de GameApplicationContext), no como otro Autoload/Node/escena.

IGameplayTelemetryStore expone solo ReadSessionsAsync, WriteEventAsync, WriteIntervalAsync e InterruptAsync. GamePersistenceAdapter los implementa con su misma cola SemaphoreSlim/worker Task.Run y GameplayEventService lazy sobre el ISaveDatabase que ya posee. No hay SQL en escenas, conexión paralela ni migración automática; si falta la extensión o almacenamiento, falla solamente telemetría con código seguro. El servicio se invalida al cerrar/disponer el adaptador.

LocalGameplayObserver recibe ese puerto, reloj monotónico/UTC y diagnóstico inyectables. Todas las notificaciones Godot son síncronas en memoria y no esperan escrituras para permitir gameplay. La FIFO serial conserva comandos tipados inmutables, IDs y payloads para reintentos; GameSaveService/decisiones no se invocan desde su interfaz. El drenaje de I/O usa el worker ya existente.

### Capturas reales conectadas

| Acontecimiento | Punto de captura nuevo | Semántica y dedupe |
|---|---|---|
| SESSION_STARTED | GamePersistenceContext._Process cuando State.Ready tiene perfil local; Telemetry.InitializeAsync | Una inicialización por contexto/ejecución; SessionId UUID estable, evento offset0. No exige partida ni crea una |
| SESSION_ENDED normal | GamePersistenceContext.QuitAsync por notificación de cierre de ventana y MenuPrincipal.Exit | Cierra último intervalo y encola un único cierre. AutoAcceptQuit=false permite intentar flush; sin nuevo autoload |
| Cierre inesperado anterior | InitializeAsync consulta sesiones abiertas y encola InterruptAsync antes del nuevo inicio | Identificador/UTC de descubrimiento conservados; offset duradero existente, ended_at desconocido; no inventa cierre normal |
| ANIMAL_SEGMENT_STARTED | AnimalSegmentFlow.ValidateLocalCore tras guard local satisfactorio y restauración de pausa; context.AnimalStarted | Una vez por ID de instancia de escena, no por cada FinNivel; el contexto difiere el registro si aún se inicializa telemetría. RunId=EventId UUID |
| ANIMAL_DIED | GameOver.MostrarDerrota después del primer _mostrado | Una derrota por run. Causa Unknown, porque Die y ZonaMuerte no propagan causa tipada; no inferir daño/caída ni modificar actores |
| ANIMAL_RESTART_REQUESTED | MenuPausa.ReiniciarNivel tras guards de doble clic/transición | Solicitud voluntaria, una por run; no se cuenta como muerte ni éxito de carga |
| ANIMAL_RETRY_REQUESTED | GameOver.Reintentar tras sus guards | Requiere derrota conocida en el run; solicitud distinta de muerte. No genera segunda muerte |
| ANIMAL_SEGMENT_EXITED | AnimalSegmentFlow.ReturnToLevelsLocalAsync solo tras ChangeSceneToPacked exitoso; detección secundaria de escena distinta en contexto | Una salida por run, no duplica notificaciones. No checkpoint ni CompleteBiome |
| Intervalos efectivos/pausa | _Process del contexto, MenuPausa.AbrirMenu/CerrarMenu y pérdida de foco de aplicación | Cambio de clasificación cierra intervalo anterior antes del siguiente |

La nueva entrada validada del animal es el único dato que confirma una instancia nueva realmente lista. La solicitud de reinicio/reintento permanece separada; una navegación fallida no agrega otro ANIMAL_SEGMENT_STARTED. ANIMAL_SEGMENT_COMPLETED no se emite, y meta física sigue sin integración local.

Los helpers de navegación solo añaden notificaciones Loading/Leave/NavigationFailed; sus validaciones, escenas, ambientes, pausas y resultados originales se conservan. Telemetría no participa en AnimalSegmentFlow.IsBlocking ni en guards de progreso. No se solicita HTTP ni sesión remota en estas rutas.

### Sesión, reloj e intervalos

Se reutiliza GameplayMonotonicClock (Stopwatch), sin modificarlo: origen nuevo por observador, offsets enteros en milisegundos; UTC solo identifica momentos de eventos. No se resta saved_at ni UTC para duración. Una partida puede tener múltiples sesiones y múltiples runs; cambiar menú/bioma, pausar o morir no crea otra partida ni sesión.

El contexto usa ProcessMode.Always para observar pausa. Cuando la instancia validada sigue vigente, sin bloqueo/transición, sin pausa y con foco, clasifica ActiveAnimal. Paused/GameOver/Loading/Background/Menu no suman efectivo. No se habilita ActiveHuman: su definición y punto listo todavía necesitan una fase explícita; diálogos/menús/estadísticas se excluyen conservadoramente.

Cambio de estado: confirma [boundary,now) del estado anterior y cambia el límite en memoria, sin solapamiento. Muerte cierra activo inmediatamente y pasa a GameOver. Solicitud de reinicio/reintento pasa a Loading; nuevo guard confirma otro run. La pérdida de foco tiene notificación inmediata, además de WindowIsFocused en el muestreo. Los demás estados se contrastan cada frame con SceneTree.Paused, CurrentScene y Transicion.Ocupado.

Cadencia adoptada a partir de la propuesta documentada5s: heartbeat cada5.000ms cierra subintervalos del estado actual, incluidos menú/pausa para cobertura observada. No escribe cada frame ni crea timers de escena; intervalo inmutable con mismo ID se reintenta sin sumar dos veces. Una caída entre confirmaciones puede perder el último intervalo y cualquier cola aún no persistida;5s es la cadencia objetivo durante ejecución normal, no una garantía dura bajo I/O fallido o suspensión del proceso.

Sesión normal: el cierre de ventana y botón Salir intentan completar inicialización/cierre/flush durante máximo3s. El límite incluye inicialización y cola lenta. Si no termina o hay fallo, diagnóstico TELEMETRY_CLOSE_TIMEOUT/FAILED/INCOMPLETE, se permite salir y queda solo lo duradero. Cierre forzado/editor kill/OS crash no se presenta como normal; al siguiente arranque las sesiones abiertas se sellan interrupted hasta su límite confirmado.

_ExitTree mantiene el cierre del adaptador/State existente, no intenta inventar tiempo después de destruir el árbol. La cola usa el mismo gate del adaptador y puede rechazar STORAGE_CLOSED al salir; ese dato no se declara persistido. No se ejecuta gameplay ni motor por Codex.

### Idempotencia y errores secundarios

SessionId/EventId/IntervalId son UUIDv4 generados una vez al capturar intención/límite. Las clausuras de la cola conservan todo el DTO (incluida UTC) durante retry. El run conserva HashSet de kinds enviados; la instancia conserva sceneToken; los controles mantienen _saliendo/busy. Los servicios existentes añaden claves naturales de sesión/run y digest conflictivo: no se sobrescribe un ID contradictorio.

FIFO: intervalos anteriores se confirman antes del evento que termina el run; las siguientes escrituras esperan detrás del comando pendiente para no invertir offset/durable boundary. Respuesta perdida después de commit se reintenta con DTO idéntico y devuelve recibo ya existente; no se alteran recibos de decisiones.

Errores transitorios IO_ERROR/STORAGE_BUSY/DISK_FULL/ACCESS_DENIED/TELEMETRY_WRITE_FAILED conservan la cabeza e intentan nuevamente al muestrear tras5s; nuevas transiciones pueden disparar otro drenaje idempotente. Un conflicto/contrato/esquema incompatible desactiva SOLO captura, marca Incomplete y avisa código local. Inicialización fallida queda diagnosticada y sin captura hasta otra ejecución. Cola máxima2.048 comandos; al llenarse se desactiva captura y conserva datos ya confirmados, sin consumir memoria sin límite ni bloquear juego.

Diagnóstico [Local telemetry] seguido solo de código tipado, sin nombres, IDs, rutas, credenciales o payload. Las fallas no se ocultan en la cobertura. Observador antes de estar listo marca TELEMETRY_NOT_READY_COVERAGE y no inventa actividad previa; el contexto puede iniciar captura del animal aún vigente cuando el observador esté disponible, con cobertura desde ese momento.

Caso conservador de reinicio fallido: la solicitud persistida cierra el run según el contrato existente. No se fabrica un nuevo inicio en la misma instancia ni se sigue sumando activo después de ese cierre; se diagnostica TELEMETRY_FAILED_RESTART_COVERAGE y queda una laguna hasta entrada nueva válida. El juego conserva la escena y recursos; la estadística incompleta no lo bloquea. Reintentar la misma solicitud conserva su identidad lógica. Una salida real posterior puede cerrar navegación sin duplicar la muerte.

Limitaciones explícitas: suspensión abrupta del OS sin notificación de foco/ciclo de vida y bloqueos largos del hilo principal requieren validación runtime de la cobertura temporal; no se afirma exactitud de muestreo que no se midió. Sin una transacción de dominio+evento común, caída antes del commit puede perder la notificación; jamás se reproduce una decisión o navega otra vez para reparar telemetría. No hay outbox/ACK ni envío remoto.

### Pruebas y compilación

**395 comprobaciones C# aprobadas, cero fallidas:**31 nuevas observador +41 servicios eventos +24 pantalla +39 consultas +19 Game Over/navegación +21 reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las364 regresiones se reejecutaron, sin contar pruebas repetidas ni los ensayos de migración como una nueva suite completa.

Las31 nuevas usan reloj manual y GameplayEventService/SQLite real sobre bases sintéticas migradas. Cubren inicio único, perfil sin partida, sesiones sucesivas, cinco biomas, misma instancia/doble señal, muerte/request/retry separados, navegación fallida, salida duplicada, pausa/reanudar/menús/Game Over/carga/foco, heartbeat5s, tiempo por bioma, SQLite fallido/respuesta perdida/worker lento, cierre normal/abrupto, duración desconocida, conservación del agregado principal completo y sin nueva partida, identidad inválida y bindings C# sin capacidad de RecordDecision/CompleteBiome/HTTP.

Los tests del observador puro no ejecutan SceneTree, señales Godot, render, notificaciones de ventana ni frames reales; esos hooks se compilan e inspeccionan y requieren validación manual. Las fixtures usan local-persistence/.work/databases/<UUID>, nunca las tres bases duraderas. Regresiones de servicios incluyen stress40 sesiones/1.280 eventos. No se modifica esquema en esta fase ni se migran fuentes reales.

Comandos: build --no-restore de GameSave.Checks.csproj, --gameplay-observer y once modos seguros previos, local-persistence/run-checks.ps1. Biblioteca/ejecutores0errores/0advertencias. Rebuild completo TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild, GodotProjectDir hacia integration/sqlite/.work/:0errores,63 advertencias históricas ParallaxBackground,ninguna nueva. MSBuild89 fuentes, una referencia a biblioteca, cero fuentes backend/tests filtradas. Sin cambios de project.godot/TwoSides.csproj, sin restore de paquetes ni Node/Godot/Atlas.

### Integridad y guía manual

Comparación final:1.538 archivos protegidos con tamaño/SHA-256/fecha idénticos, incluidos biblioteca/esquema/StatisticsService/pantalla, escenas, personajes/recursos/biomas, FinNivel/finales y configuración. Los9 archivos de las tres bases/manifiestos/leases permanecen idénticos: la runtime2+extensión1 NO fue usada por las pruebas ni recibió eventos ficticios. Solo cuando el usuario ejecute Godot se producirán eventos reales. .env278bytes,SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, verificado separadamente antes/después sin valores/credenciales ni cambios de propietario/ACL. Riesgo ACL de B00 pendiente.

Guía manual propuesta:
1. Abrir esta copia sin Node/internet, usar perfil/partida existentes; no crear otra partida para probar captura. Confirmar consola sin nuevos errores y ausencia de HTTP.
2. Entrar a cada bioma decidido en orden libre; jugar más de5s, pausar más de5s, reanudar, perder y esperar en Game Over. El personaje/ambiente/recursos se comportan igual; no tomar otra decisión.
3. Reintentar y reiniciar voluntariamente, también doble clic. Debe haber una sola transición, misma elección y recursos iniciales existentes. Una solicitud no se etiqueta como carga exitosa hasta nuevo guard.
4. Ir a menú de niveles y principal/Estadísticas, esperar y volver. Esos tiempos no son efectivos animales. La pantalla conserva su diseño y seguirá mostrando No disponible para métricas no expuestas por StatisticsService; no se cambió para mostrar la nueva captura.
5. Salir por botón y cerrar por ventana; en una fase técnica autorizada consultar sesiones/events/intervals reales y cobertura para comprobar una sesión por ejecución, cierres normales, ausencia de duplicados y pausas fuera de efectivo. Sin volcar nombres/decisiones al reporte.
6. Probar foco/suspensión y cierre inesperado solo con aceptación de la posible pérdida de cola no confirmada; al abrir, esperar interrupted, no duración ficticia. No dañar la base ni bloquearla para probar errores: esos casos son sintéticos.
7. Cualquier diagnóstico [Local telemetry] significa posible cobertura incompleta, nunca permiso de borrar/reinicializar datos. Aportar código/traza sin secretos y acción que lo produjo.

Siguiente paso recomendado: validación runtime de captura/tiempos/cierre y revisión técnica readonly autorizada de eventos reales; después, otra fase para exponer métricas con cobertura en Estadísticas. No agregar ahora UI, CompleteBiome, finales, checkpoints, Atlas/AWS o B05. Trabajo detenido al terminar D4B.

## B04.2B.2B.2D.4C — Verificación real y actividad visible (2026-10-27 Guatemala)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME DE LA VISTA PENDIENTE.** El usuario informa D4B15/15 comprobaciones manuales satisfactorias y sin errores nuevos. No se asumen conteos exactos de esas acciones: esta fase audita lo efectivamente persistido.

### Etapa A superada antes de editar producción

Se verificó Godot/ejecutores cerrados. Herramienta temporal bajo local-persistence/.work/event-audit (ignorada por Git) compilada con biblioteca existente y caché local; no se incorpora otro sistema de producción. Ruta única runtime fija; sin reparse points bajo raíz, sin WAL/SHM/journal. FileAccess.Read/FileShare.Read sobre base y lease impide aceptar escritores durante la lectura. SQLite mode=ReadOnly, pooling=false y query_only=ON. No se usa OpenRuntimeOrCreate, ni inicialización/migración/recovery/checkpoint. Si aparecen procesos o sidecars, se detiene la inspección.

GameplayEventSchema.Verify, GameSaveService, StatisticsService y GameplayEventService se usan como APIs reales; SQL parametrizado/constante de solo lectura complementa comprobaciones de intervalos y coherencia no expuestas en API pública. integrity_check=ok, foreign_key_check sin filas, base2+extensión1. No se imprimen perfil, nombre, decisiones personales ni IDs de jugador/sesión.

Resultados reales anonimizados, antes y después de integrar consultas:
- Sesiones:3 registradas,3 cerradas,0 interrupted,0 abiertas.
- SESSION_STARTED3 y SESSION_ENDED3.
- ANIMAL_SEGMENT_STARTED7, ANIMAL_DIED3, ANIMAL_RESTART_REQUESTED1, ANIMAL_RETRY_REQUESTED1, ANIMAL_SEGMENT_EXITED7.
-81 intervalos confirmados.
- Tiempo efectivo total confirmado:37.614ms (37.614 segundos).
- Partida actual por bioma: ocean9.946ms, jungle18.348ms, desert9.320ms; forest/tundra sin intervalos registrados (null, no0).
- Tiempo registrado no efectivo por clasificación: Background43.549ms, GameOver5.669ms, Loading3.848ms, Menu48.191ms, Paused7.396ms.
- Incomplete=false para esas sesiones cerradas y cobertura registrada; HistoricalCoverageUnknown=true.

Las cifras de milisegundos usan punto como separador de miles en esta lista salvo el equivalente en segundos expresado explícitamente. La UI formatea segundos con tres decimales y punto decimal invariante, por ejemplo37614ms→37.614 s confirmados.

Cero duplicados de EventId o clave idempotente, solapamientos entre intervalos de una sesión, tiempos negativos, asociaciones animales inválidas, más de una sesión abierta, solapamientos de sesiones cerradas según UTC, tiempo activo posterior a muerte/salida/request, retry sin muerte previa o intervalos fuera del límite de sesión. La comparación temporal UTC es comprobación orientativa, no reloj usado para acumular duración.

Los eventos SESSION_* por contrato no pertenecen a una partida; no se consideran referencias faltantes. Todos los eventos animales tienen GameId/BiomeId válidos y canónicos y vínculos de sesión/run válidos. No hay eventos de finalización falsa. No hay obligación de que forest/tundra tengan tiempo si no se dispone de un registro de acciones del usuario que lo exija: se informa ausencia, no se fabrica cobertura.

Comparación adicional de dominio contra el respaldo inmediato D4A2, cuyo hash se verifica: perfiles, partidas, biomas, decisiones, consecuencias, snapshots y local_operations idénticos por filas/huellas canónicas. Así se comprueba que la captura no alteró datos anteriores, sin publicar los valores. Lecturas repetidas conservan hash/tamaño/mtime de runtime.

La auditoría confirma coherencia estructural y persistencia, no demuestra por sí sola cada segundo de pausa del motor. Esa exclusión se apoya en tests del observador y prueba manual. No se comparan conteos contra cantidades de acciones nunca aportadas. La etapa B solo comenzó tras AuditPassed=true.

### Cambios de etapa B

Producción: local-persistence/src/StatisticsModels.cs.txt, StatisticsRepository.cs.txt, StatisticsService.cs.txt e integration/sqlite/LocalStatisticsScreenState.cs (formateador existente). Pruebas: nuevo ActivityStatisticsChecks.cs.txt y dispatcher GameSaveChecks.cs.txt. Documentación: siete documentos autorizados. Total13 archivos. La herramienta temporal solo vive en .work y es de lectura.

No se cambian adaptador, controlador visual de nodos/scroll, observador, servicios de escritura, esquema/migración, gameplay, pausa/Game Over, FinNivel, finales, proyectos ni escenas. La sección nueva se agrega al texto plano existente; no se duplican nodos ni se crea otra pantalla.

StatisticsRepository.Activity reutiliza GameplayEventRepository dentro de la MISMA transacción UnitOfWork.Read que el resto del resumen, con carga cacheada por consulta. Comprueba presencia/versión de extensión y no la crea si no existe. Se reutilizan Sessions/Events/Intervals y los filtros de dueño existentes; no se encadenan varias APIs que abrirían snapshots diferentes. Las colecciones completas evitan truncamiento.

Contratos añadidos como propiedades opcionales para compatibilidad:
- PlayerStatistics.Activity: cobertura local de todas las sesiones registradas.
- PlayerStatistics.HistoricalActivity: solo registros vinculados a partidas no actuales.
- GameStatistics.Activity: solo eventos/intervalos de ese GameId.
- ActivityStatistics: Sessions, Deaths, RestartRequests, RetryRequests, EffectiveMs, ByBiome, Incomplete e HistoricalCoverageUnknown.
- BiomeActivityStatistics: BiomeId y EffectiveMs tipado StatisticCount.

No se cambia Uncollected del contrato previo para reinterpretar datos históricos; la vista elige Activity cuando hay sesiones registradas y conserva el estado anterior si no hay captura. Los tres alcances aparecen con títulos distintos. Una sesión puede participar en varias partidas: sus conteos por game/historia no son aditivos; el total local cuenta cada SessionId una vez, y los intervalos efectivos no se suman dos veces.

Disponibilidad:
- Sin extensión: NotAvailable/null, no se migra.
- Extensión sin captura o bioma sin intervalos: NoData/null («Sin datos»), más aviso de actividad histórica desconocida.
- Run con cobertura y ningún evento de un tipo: Available0 representa cero SOLO en cobertura registrada, no cero histórico de toda la vida.
- Intervalo confirmado0..0: tiempo Available0.
- Sesión abierta/interrupted o intervalos faltantes: muestra únicamente suma duradera y aviso Incomplete; no se extrapola hasta la consulta ni se cierra/repara la sesión.
- HistoricalCoverageUnknown siempre verdadero: la actividad anterior al inicio de instrumentación no puede reconstruirse.

Tiempo efectivo suma solo ActiveAnimal/ActiveHuman ya confirmados; las pausas, menús, carga, fondo y Game Over no se añaden. El observador actual solo emite ActiveAnimal, no se inventan intervalos humanos. Fechas de partida/attempt_number no se usan como contadores o duraciones.

La UI mantiene perfil, decisiones, progreso, consecuencias, partida actual, historial y scroll. Añade «ACTIVIDAD LOCAL CONFIRMADA», actividad de cada partida y resumen histórico, sesiones, segundos efectivos, cinco subtotales, muertes y solicitudes confirmadas de reinicio/reintento. Las etiquetas dicen solicitudes: no se presentan como transiciones exitosas. Se conserva la advertencia de cobertura anterior desconocida y otra de incompleta cuando corresponda.

Abrir/reabrir Estadísticas conserva el flujo de una consulta asíncrona por apertura/retry, texto plano sin BBCode/IDs sensibles y retorno al menú. No registra sesiones/eventos ni fuerza flush por consultar. El observador independiente ya existente puede confirmar su heartbeat real de estado Menu mientras el usuario está allí; ese tiempo no es efectivo y no es una escritura provocada por la consulta.

### Pruebas y compilación

**418 comprobaciones C# aprobadas, cero fallidas:**23 nuevas actividad +31 observador +41 eventos +24 pantalla +39 consultas +19 Game Over/navegación +21 reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las395 anteriores se reejecutan.

Las23 nuevas cubren historia sin extensión/captura, sesión cerrada/abierta/interrupted, varias sesiones, muerte distinta de retry y request, evento repetido idempotente, exclusión de pausa/menú/fondo/derrota/carga, cinco subtotales y suma total, cero medido vs ausencia, sesión sin actividad animal, scopes activo/histórico, readonly/bytes/fechas/decisiones/ambiente intactos, etiquetas/formato, esquema incompatible controlado y rechazo de solapamiento. Los tests anteriores de pantalla cubren apertura, retorno, doble clic, ausencia de nodos duplicados por binding/diseño y error local. No se afirma ejecución de escenas ni señales reales.

Fixtures independientes bajo local-persistence/.work/databases/<UUID>; ninguna prueba usa la runtime como fixture. La auditoría de lectura real es una etapa distinta de la suite sintética. Se recompiló el helper de auditoría con las consultas nuevas y se verificó que coinciden con GameplayEventService en sesiones, muertes, requests y tiempo total reales. No se usa la lectura para escribir registros.

Comandos: build --no-restore de GameSave.Checks.csproj; --activity-statistics y doce modos seguros anteriores; local-persistence/run-checks.ps1. Biblioteca/ejecutores0errores/0advertencias. Rebuild completo TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild con GodotProjectDir hacia integration/sqlite/.work/:0errores,63 advertencias históricas ParallaxBackground,ninguna nueva. Sin Godot, Node.js, Atlas, nuevas dependencias o modificaciones a proyectos de producción. Herramienta temporal restaurada solo desde caché local.

### Integridad, limitaciones y validación

Antes de editar producción se registró inventario de1.558 archivos (todo excepto .env); tras fijar los archivos autorizados de etapa B se conserva manifiesto de1.546 archivos protegidos idénticos antes/después. Los9 archivos de las tres bases/manifiestos/leases permanecen idénticos en hash/tamaño/fecha; la runtime NO fue alterada por Codex. Los respaldos solo se leyeron, sin sobrescribirlos. .env278bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, sin valores ni cambios de permisos/propietario. Riesgo ACL de B00 pendiente.

Limitaciones: cobertura histórica desconocida, solicitudes distintas de éxito de navegación y errores de captura que pueden dejar lagunas; sesiones abiertas al consultar mientras se juega se marcan incompletas hasta cierre. Volumen grande materializa colecciones y texto, optimización futura posible. La auditoría actual no atribuye una ausencia de intervalos a fallos sin una secuencia esperada conocida. No se corrigen registros reales, no se rellena tiempo ni se modifica captura.

Guía manual: abrir juego sin internet/Node; Estadísticas debe conservar secciones previas y scroll y mostrar nueva actividad local. Comprobar valores confirmados y advertencias; al ejecutar una sesión nueva pueden cambiar respecto al snapshot auditado, por lo que no exigir las mismas cifras exactas. Jugar/pausar/morir/reintentar/reiniciar, volver a Estadísticas y comprobar aumento razonable de tiempo activo y eventos distintos. Tiempo de menús/pausa no debe sumarse como activo; puede tardar hasta heartbeat/cambio de estado en aparecer lo confirmado. Cerrar normalmente y reabrir debe conservar registros sin duplicarlos. No cambiar decisiones ni borrar bases para probar. Anotar acciones/duraciones aproximadas para investigar discrepancias; aportar consola sin secretos si falla.

Siguiente paso recomendado: validación manual de la vista/alcances y captura real con secuencia registrada. Cualquier corrección de observador/escritura requiere autorización distinta; no se cambia aquí. No CompleteBiome, finales, Atlas/AWS ni B05. Trabajo detenido al terminar D4C.


## B04.2B.2B.2E.2B.2 — Finales locales autorizados (2026-10-27)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** El usuario autorizó regla nueva definitiva, no recuperada del evaluador original:0/1/2 reject→bad;3/4→medium;5→good, exclusivamente cinco decisiones canónicas de cinco completed de la misma partida. Versión narrativa separada local-ending-reject-count-1; se conservan versiones de partida/decisiones.

Informe completo, inventario exacto y guía manual en ../backend/docs/GLOBAL_PLAYTHROUGH_CLOSURE_PLAN.md (apartado E.2B.2). Un evaluador puro centraliza la regla; GameSaveService.PrepareFinal/CloseGame usan transacción/recibos existentes y esquema2 sin migrar. final_pending persiste resultado antes de navegar; cierre solo por acción explícita de salida, completed/is_current0 e historia intacta. Continuar recupera cinco completed sin resultado o final_pending después de reinicio, sin repetir decisiones/metas. Nueva partida es explícita y solo posterior al cierre, con perfil igual, GameId nuevo y cinco biomas limpios/disponibles.

Final.cs consume SQLite y sale localmente: escena/textos/tween/nodos/recursos intactos, sin HTTP/login. AnimalSegmentFlow coordina quinto; menú recupera finales. FinNivel/CompleteBiome y mecánicas intactos. StatisticsService únicamente reconoce la versión final nueva para metadatos, ajuste informado previamente; no se alteran agregados o eventos. CompletedAt indica preparación del resultado; recibo close_game/ArchivedAt indican cierre. No existe ni se afirma marcador durable de “final leído”.

598 comprobaciones aprobadas:126 nuevas y472 regresiones reejecutadas,0 fallidas finales. Biblioteca/ejecutores0 errores/0 advertencias; Godot C# Rebuild0 errores,63 advertencias históricas ParallaxBackground,0 nuevas. Sin ejecución de Godot; visual/navegación/pausa real requieren manuales. Las10/10 manuales anteriores son E.2A, no esta fase.

Tres bases protegidas y9 archivos asociados idénticos en hash/tamaño/fecha;1.542 archivos fuera de alcance idénticos. .env278 bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, sin valores ni cambios ACL/propietario; riesgo B00 pendiente. Solo fixtures nuevas para escrituras. Sin migraciones, Node/Atlas/AWS/B05. Probar manualmente good/medium/bad en partidas sucesivas sin editar decisiones ni borrar historia; incluir reinicio antes de salir del final, cierre y nueva partida. Trabajo detenido.


## B05.3A — Outbox SQLite sintética (2026-10-27 Guatemala)

Extensión sync v1 implementada en SyncOutboxModels/Schema/Projection/Service.cs.txt, sin nuevas dependencias. No se inicializa automáticamente en arranque del juego ni cambia base v2/gameplay v1. MigrateSynthetic y RollbackEmptySynthetic aceptan exclusivamente SyntheticDatabase; rollback rechaza cola no vacía. Nuevo modo seguro del ejecutor GameSave.Checks: --outbox,64 casos; suite base43 y quince modos offline reejecutados suman598 regresiones, total662. Se compila antes de ejecutar con --no-restore. No dotnet test ni servidor: binario autocontenido .NET8.0.30,SQLite3.53.3. Sin HTTP/Atlas/Node, sin abrir motor Godot. Composición con gameplay/escenas, scanner/checkpoints/backfill y migración runtime permanecen pendientes de B05.3B/autorización independiente.

Contrato, tablas, transiciones, operaciones, limitaciones, pruebas, inventario y plan runtime en [B05_LOCAL_OUTBOX_IMPLEMENTATION.md](../backend/docs/B05_LOCAL_OUTBOX_IMPLEMENTATION.md). No inicia B05.3B ni autoriza tocar runtime, HTTP o Atlas. B00 sigue pendiente; sin cambios ACL/propietario/herencia.


## B05.3B.1 — Captura y reconciliación sintéticas (2026-10-28 Guatemala)

Nuevos componentes sintéticos: SyntheticOutboxReconciler, SyncFactInventory y SyncReconciliationModels. ReconcilePage captura fuentes y audita cola por lotes; establece solo binding local sin JWT/nombre/cuenta remota. No conexión a escritores/gameplay ni migración automática; esquema base2/gameplay1/sync1 intacto. Committed/Completed/Consistent se interpretan por separado; cursor perdido implica nueva pasada idempotente, no ACK. --reconciliation agrega51 casos; --outbox y modos seguros anteriores suman662 regresiones reejecutadas, total713. Build del ejecutor con --no-restore antes de ejecutar. .NET8.0.30/SQLite3.53.3. No datos personales reales/HTTP/Atlas/Godot o escrituras runtime.

Matriz de hechos, métodos/archivos, garantías, historial, pruebas, limitaciones y plan preciso B05.3B.2 en [B05_OUTBOX_CAPTURE_RECONCILIATION.md](../backend/docs/B05_OUTBOX_CAPTURE_RECONCILIATION.md). B00 continúa pendiente. Detenido; sin iniciar B05.3B.2/B05.4.


## B05.3B.2B — Activación local controlada (2026-10-28 Guatemala)

Estado2B:runtime de copia tiene base2/gameplay1/sync1,activación explícita respaldada,658 pending inicialmente y segunda pasada0 nuevas. Nuevo LocalOutboxPump/LocalOutboxScheduler compuestos solo en modo runtime del adaptador:sin migrar al abrir,sinHTTP/JWT/Atlas. Worker por páginas fuera del hilo Godot,gate compartido/coalescing/cancelación,diagnósticos seguros. Capture posterior a commit,sin atomicidad integral de gameplay. Nuevo modo sintético --outbox-activation28 casos;713 regresiones reejecutadas,total741. No pruebas automatizadas en runtime;solo herramienta de mantenimiento autorizada. Manuales pendientes y backup/recuperación en informe2B.

Preflight,backup nuevo/hash,ensayo,migración,comparación,archivos/pruebas,riesgos y guía manual en [B05_OUTBOX_RUNTIME_ACTIVATION.md](../backend/docs/B05_OUTBOX_RUNTIME_ACTIVATION.md). B00 pendiente;sin cambios ACL/propietario,autenticación remota,HTTP/Atlas/AWS oB05.4. Esperar validación manual e instrucciones.
