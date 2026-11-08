# B75 — Corrección y validación del ejecutable Windows

Fecha: **2026-11-04**, Guatemala. **Candidato Release exportado, inspeccionado y preparado para prueba manual. `TwoSides.exe` NO se ejecutó.** No se modificó `PlayerData` de TwoSidesTest ni se accedió a su base. No se conectó Atlas, activó v5, ejecutó B67, cambió cuotas/F1/F2, hizo commit o push.

Se revisaron B61, B68–B74, incluyendo B71.1/B71.2 y B73.1, el código de guardado, referencias de proyectos, configuración de exportación y pruebas existentes. No se repitieron campañas del juego ni se confundió la exportación headless con una validación del ejecutable jugable.

## 1. Resultado y artefactos

| Artefacto | Ubicación / resultado |
|---|---|
| Carpeta nueva | **`C:\TwoSidesBuild\TwoSides-win64-B75\`** |
| ZIP nuevo | **`C:\TwoSidesBuild\TwoSides-win64-B75.zip`** |
| Inventario SHA-256 completo | `C:\TwoSidesBuild\TwoSides-win64-B75.sha256` — 204 entradas, fuera del paquete |
| Inventario con tamaños | `C:\TwoSidesBuild\B75-Validation\PACKAGE-INVENTORY.json` |
| Referencia de paquete/ZIP | `C:\TwoSidesBuild\B75-Validation\PACKAGE-REFERENCE.json` |
| Herramientas manuales separadas | `C:\TwoSidesBuild\B75-Validation\Verify-Package.ps1`, `Inspect-Running-Modules.ps1` |
| Archivos / tamaño sin comprimir | **204 / 309 324 611 bytes** (309,32 MB decimales; aproximadamente 295,00 MiB) |
| ZIP | **187 777 814 bytes**; comprobación CRC y SHA-256 del contenido de sus **204 entradas PASS** |
| B74 | Sus **195 archivos siguen coincidiendo** con su manifiesto original, sin añadidos/eliminados |

```text
SHA-256 del manifiesto del paquete B75:
CECA5C3FBA59364031A3EEC3C59790978DCF523458C3F87373E4D7DE2C505F9B

SHA-256 del ZIP B75:
CF55AB6EDF0FE574ACFFCB0B1CCEF121F6FD4727864927770DC8423FAA709257
```

El manifiesto del paquete es un inventario de distribución; **no reemplaza v5 del backend** ni equivale a una firma de código. Se recomienda entregar el ZIP y extraerlo completo: exe, PCK y `data_TwoSides_windows_x86_64` deben permanecer juntos. No ejecutar desde el visor del ZIP ni distribuir únicamente el EXE. No se creó un instalador ni se publicó ningún archivo.

## 2. Diagnóstico y correcciones mínimas

En B74, la búsqueda sobre todos los archivos confirmó rutas privadas en exactamente tres archivos: `TwoSides.dll`, `TwoSides.LocalPersistence.dll` y `TwoSides.SyncHttp.dll`.

- **Compilador:** referencias CodeView a los PDB con la ruta absoluta de compilación.
- **Código:** constante `SyntheticSandbox.AuthorizedProjectRoot`, compilada en la biblioteca e incorporada por inlining en el juego. Se usa en sandboxes, herramientas y en la capacidad histórica `CopyGameDatabase.RuntimePath`, no en `OpenProduction`.

Cambios autorizados, exclusivamente tres archivos existentes:

| Archivo | Cambio |
|---|---|
| `TwoSides.csproj` | `Deterministic=true`; **solo Release/ExportRelease**: PathMap a `/_/TwoSides`, DebugType=none, DebugSymbols=false |
| `local-persistence/Directory.Build.props` | Misma configuración de distribución y símbolo `TWOSIDES_DISTRIBUTION` solo en Release/ExportRelease |
| `local-persistence/src/SyntheticSandbox.cs.txt` | En distribución, `AuthorizedProjectRoot` es una propiedad que rechaza con `TEST_STORAGE_NOT_AVAILABLE`; la constante privada y funcionalidad sintética permanecen exclusivamente en la compilación de desarrollo/pruebas |

**No se calculó una raíz arbitraria de producción ni se relajaron las guardias del sandbox.** En la distribución las rutas sintéticas/históricas fallan cerradas antes de abrir datos. El juego normal conserva `%LOCALAPPDATA%\TwoSides\PlayerData\save.sqlite3` mediante `Environment.GetFolderPath(LocalApplicationData)`, sin fallback a la ruta del desarrollador. Las banderas de sandbox siguen verificadas en Debug; **no están disponibles en este paquete Release**. Para repetir campañas sintéticas dentro de Godot se utiliza la configuración de pruebas, no este paquete de entrega.

PathMap se limitó a distribución para conservar los puntos de interrupción habituales en Debug. Su finalidad y límites se contrastaron con [MSBuild/C# PathMap](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/compiler-options/advanced#pathmap) y [DebugType](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/compiler-options/code-generation).

No se modificaron `project.godot`, `export_presets.cfg`, escenas, scripts de juego, reglas ambientales, finales, assets, esquemas SQLite, cliente Sync v2 o backend. El build/export genera sus salidas en `.godot`/`.work`, fuera del código protegido del backend.

## 3. Respaldos y hashes de cambios

Respaldo previo, creado **antes** de editar:

```text
local-persistence/.work/b75/pre-B75/
  TwoSides.csproj
  local-persistence/Directory.Build.props
  local-persistence/src/SyntheticSandbox.cs.txt
  local-persistence/src/packages.lock.json
  local-persistence/sync-http/packages.lock.json
  export_presets.cfg
```

`local-persistence/.work/b75/before.json` registra los seis hashes originales y una línea base de 694 archivos del juego/persistencia; `after.json` registra la comparación posterior. Los dos lockfiles y el preset terminan **idénticos** al respaldo. La exportación puede añadir targets win-x64 temporalmente (B74); tras los builds finales los lockfiles conservan exactamente sus bytes iniciales, sin cambios adicionales de dependencias.

| Archivo modificado | SHA-256 anterior | SHA-256 final |
|---|---|---|
| `TwoSides.csproj` | `35BE8DAF24E3550B01A38B034D0FC31F33902E6A19584CE4B604DC0A0E2D2726` | `C874EE959B5345BC0427BE2838490B19F862E28B97E30857FD4AFE36FBE83829` |
| `Directory.Build.props` | `0065754AB20288CC40D8484A068C7E888B212753C75B0FE9D74355B3515BA2A7` | `8A23A932D3F8A4F5E4E99D7918EE009C2DC953C3427A21C0722539C61B604F4C` |
| `SyntheticSandbox.cs.txt` | `904071BCDDCB508C2023178D5646E9348F0920CFE9D17C0B423A24A95815AB5F` | `BF5067DC128CC32362D61C5FF53CE37B8970C1B1C5212C4BF7F36FA520A8D346` |

Los programas de ensayo/auditoría y logs nuevos se conservan en `local-persistence/.work/b75/`; están excluidos del paquete. No se borraron respaldos anteriores. El paquete B74 no se sobrescribió ni usó como carpeta de compilación.

## 4. Compilación, pruebas y límites

| Comprobación | Resultado |
|---|---|
| `dotnet build TwoSides.csproj -c Debug --no-restore` | Compilación correcta, **0 errores y 63 advertencias históricas**, sin nuevas categorías por B75 |
| Exportación Godot 4.6.1 Mono `--headless --export-release "Windows Desktop" <salida nueva> --quit` | **Código 0**, first_scan/dotnet_publish/savepack completados, **0 ERROR y 0 WARNING** en el registro de exportación; 61 s |
| Suite base `TwoSides.LocalPersistence.Checks` | **43 PASS**, 0 fallos, 0 bases sintéticas restantes |
| `GameSave.Checks`, 19 modos sintéticos seleccionados | **721 PASS**, 0 fallos: progreso, selección, decisiones, entrada animal, menú, reinicio, Game Over, finalización, finales, estadísticas, eventos, observadores, Outbox, activación y recuperación/cierre |
| `ProductionStorage.Checks` B68 | **65 PASS**, incluidos aislamiento por perfil, almacén de producción vs histórico/sandbox, estructura de esquema y rutas sin desarrollador |
| Regresión focalizada B73 | **14 verificaciones PASS**: preflight de segundo arranque, snapshot previo/posterior con SaveInspector, reapertura, conservación de decisiones, detección de pérdida y rechazos por ownership/archivo extra; fuente sintética intacta por inspección |
| Harness nuevo Release | **9 PASS**, 0 errores/advertencias de compilación: rechazo de raíz sintética/histórica, producción en LocalApplicationData, decisión/ambiente/progreso, cambio de bioma y esquema estable tras reapertura |
| Mismo harness cargando la **DLL exacta exportada** | **9 PASS**; la DLL se copió al harness desechable, no se ejecutó el juego |
| Verificador del paquete | **PACKAGE PASS files=204**, código 0 |

Los resultados individuales de los 19 modos y sus resúmenes se encuentran en `game-test-results.json`. No se ejecutó el modo por defecto de GameSave ni modos que abren almacenes históricos duraderos. La regresión B73 es una selección explícita sobre almacenes nuevos ficticios; **no se afirma repetir íntegramente las 62 comprobaciones históricas ni probar la partida real de TwoSidesTest**.

Los perfiles de ensayo están bajo `TwoSidesTests/B75` o sandboxes exclusivos que las herramientas crean y eliminan. La SQLite real no se abrió con SQLite, restauró ni migró. Se conservaron decisiones originales al reabrir el mismo almacén sintético y añadir otra decisión en otro bioma; SaveInspector devolvió **PRESERVED**. El negativo de comparación inversa produjo código 4 y los rechazos de preflight/inspector 1/2: son rechazos esperados, no fallos de la regresión.

La primera compilación dentro del sandbox terminó con código 1 sin diagnóstico de compilador; se repitió con permiso para procesos locales y compiló correctamente. El primer barrido del paquete marcó `main_api_url` dentro de una DLL: es **el nombre de la clave que lee el cliente**, no una URL configurada. Se separó esa comprobación de la inspección del `project.binary`/PCK; no se eliminó la validación ni se cambió Sync para silenciarla. La descarga de un nombre de archivo de licencia SQLitePCLRaw inexistente devolvió 404; se utilizó el texto oficial Apache-2.0 declarado por el paquete NuGet, sin inventar una licencia.

Los scripts nuevos de validación solo se parsearon/verificaron o ejecutaron sobre archivos. El script de módulos **no** se ejecutó contra un juego abierto. No se ejecutaron B67, C.2, F.2, F3.10, servidores ni campañas remotas.

## 5. Inspección del paquete y ensamblados

Auditoría completa en `package-audit.json`, directorios PE/runtime y comparación de recursos en `final-inspection.json`. El lector PCK verifica límites y MD5 de cada entrada conforme al formato v3 de [Godot 4.6.1](https://github.com/godotengine/godot/blob/4.6.1-stable/core/io/file_access_pack.cpp); no ejecuta recursos o código del paquete.

- **570 entradas PCK**, mismas entradas y hashes que B74: **0 añadidas, 0 eliminadas, 0 cambiadas**. Todos los recursos exportados previamente siguen presentes.
- **0** entradas backend/docs/local-persistence, herramientas de administración/pruebas o bases en el PCK. No se distribuyen archivos de código fuente de las bibliotecas; los stubs de scripts que Godot necesita se conservan.
- **0 PDB**, `.env`, SQLite/DB, claves, JS/PowerShell o herramientas de prueba en el paquete final. `LICENSES/` contiene avisos de redistribución, no documentación interna del proyecto.
- Búsqueda sobre **todos los archivos** en UTF-8/UTF-16: **0 rutas `C:\Users\…`, `C:/Users/…`, carpeta privada de pruebas, URI MongoDB o asignaciones `password=`**. No se buscaron/reconstruyeron valores de secretos reales ni se abrió `.env`.
- Los tres ensamblados propios tienen únicamente la entrada PE de compilación reproducible (tipo 16), **sin entrada CodeView ni ruta PDB**. El binario de persistencia ya no expone la constante privada y su propiedad rechaza las capacidades de prueba en distribución.
- Dependencias nativas del proveedor conservan rutas de su CI (`D:\a\…`) en sus registros CodeView, **no rutas privadas del desarrollador**. No se parchearon DLL de terceros ni firmas para borrar esos registros.
- EXE, coreclr y SQLite nativa: PE x64 `0x8664`. Las bibliotecas administradas tienen cabecera IL/AnyCPU `0x14c`, normal para DLL administradas utilizadas por el host x64; no se confundió con una dependencia nativa x86.

Hashes principales (el inventario externo contiene los 204 completos):

| Archivo | SHA-256 |
|---|---|
| `TwoSides.exe` | `26532670B808CED4728EEC2DB2649277FC5970281AFAFE3ED42E061A1AE87FC4` |
| `TwoSides.pck` | `32530E7EFC1FD619F6FF7B15DB0BB6D823CF232912EB8E88631397E63742091E` |
| `TwoSides.dll` | `882DA581A964318CDE8C37EA6A3364F2DE1FA675B9C153AAA7E6C929933CBAD5` |
| `TwoSides.LocalPersistence.dll` | `3DBF08144F83B94AB140D21290D11156F4400121337B28AAEF78A28E4795E540` |
| `TwoSides.SyncHttp.dll` | `785497022AA47CF36AB0F82DBFDE6289FEDEF12CAE9A918D5179DC07AC99910B` |
| `e_sqlite3.dll` | `B7385D722C83FB52142A00477A726723745916D22A555711EE89834C1111FB2E` |
| `coreclr.dll` | `FC2909E16B3F70EDFEAC96D69D3F1D444705B1E4AD922DC760BB396338A7B1DE` |

## 6. Dependencias, conectividad, metadatos y licencias

**Autocontenido:** `TwoSides.runtimeconfig.json` indica net8.0 e includedFrameworks Microsoft.NETCore.App **8.0.30**. El paquete conserva hostfxr/hostpolicy/coreclr y sus dependencias, `GodotSharp 4.6.1`, Microsoft.Data.Sqlite/Core **8.0.32**, SQLitePCLRaw core/provider/bundle/lib **2.1.13** y `e_sqlite3.dll`. No hace falta instalar .NET en el equipo del jugador; su carga desde el EXE queda pendiente de comprobación manual. No se sustituyó por un runtime del sistema.

Los componentes auxiliares `createdump.exe`, `mscordbi.dll` y `mscordaccore*.dll` proceden del runtime e **inicialmente se conservan** para no alterar un despliegue que aún no se ha probado fuera del editor. No se habilitaron volcados ni se ejecutó createdump. Su recorte puede evaluarse después del humo manual; no son secretos ni herramientas administrativas del backend.

**Modo offline:** `project.godot` no configura `main_api_url`; el PCK no contiene esa clave ni las URLs locales 8443/3001 examinadas; no hay `override.cfg`. Los literales de políticas de prueba/desarrollo pueden existir en código cliente, pero no son una URL activa de sincronización; las capacidades sintéticas están deshabilitadas en Release. No se envían credenciales Mongo al videojuego. El código ya mantiene sync desactivada sin URL. Las pruebas sintéticas funcionaron sin Atlas, pero **no se afirma haber observado las conexiones de un `TwoSides.exe` real**, porque no se lanzó. Verificarlo manualmente antes de distribuir.

**Metadatos actuales:** ProductName, FileDescription y CompanyName vacíos; FileVersion/ProductVersion **1.0.0.0**. Se recomienda producto/descripción «Two Sides» y versión acordada por el propietario. No se inventó empresa, titular de copyright o institución y no se modificó el preset solo para aparentar una versión aprobada. Firma de código/SmartScreen y revisión final de metadatos siguen pendientes antes de una entrega pública.

**Avisos incluidos:** ocho archivos `LICENSES/` y README del candidato explicando uso, guardado y soporte sin datos personales:

- Godot/GodotSharp: MIT y avisos de terceros correspondientes a **4.6.1-stable**, obtenidos de sus fuentes versionadas. Véase [cumplimiento de licencias Godot](https://docs.godotengine.org/en/stable/about/complying_with_licenses.html).
- .NET: LICENSE y THIRD-PARTY-NOTICES del runtime **8.0.30** presente en la caché NuGet, no una licencia genérica de otra versión.
- Microsoft.Data.Sqlite: MIT del commit de EF Core declarado por el paquete NuGet instalado.
- SQLitePCLRaw: **Apache-2.0**, atribución Copyright 2014–2024 SourceGear, LLC según los nuspec; texto de [Apache oficial](https://www.apache.org/licenses/LICENSE-2.0.txt).
- SQLite motor: [dominio público](https://www.sqlite.org/copyright.html); esto no elimina la licencia de sus bindings/paquetes.

Fuentes de descarga registradas en `license-sources.json`. No se concedió una licencia al código/arte del juego mediante estos avisos. **La procedencia y autorización de redistribución de texturas, música, sonidos y fuentes requieren confirmación del propietario; no hay un inventario de derechos completo acreditado aquí.** La revisión de dependencias y sus avisos no equivale a una aprobación jurídica de todos los assets ni a declarar el paquete listo para publicación.

## 7. Preparación de prueba manual segura, sin ejecución en B75

**No borrar, copiar sobre, restaurar ni reinicializar PlayerData.** El exportado normal reutiliza la partida de la cuenta desde la que se abre. No confiar en cambiar la variable `LOCALAPPDATA`: GetFolderPath no se redirige así (B69). Para una instalación vacía se necesita otro usuario estándar que el propietario autorice y prepare; no se crea automáticamente.

La carpeta nueva del paquete ya es independiente. Antes de copiarla al destino de prueba, en PowerShell del propietario:

```powershell
$b75Hash = 'CECA5C3FBA59364031A3EEC3C59790978DCF523458C3F87373E4D7DE2C505F9B'
powershell.exe -NoProfile -File C:\TwoSidesBuild\B75-Validation\Verify-Package.ps1 -PackageRoot C:\TwoSidesBuild\TwoSides-win64-B75 -ManifestPath C:\TwoSidesBuild\TwoSides-win64-B75.sha256 -ExpectedManifestSha256 $b75Hash
if ($LASTEXITCODE -ne 0) { throw 'Detener ante fallo de verificacion' }
# Usar una carpeta NUEVA; nunca un directorio de PlayerData ni un paquete anterior.
$b75Destino = 'C:\TwoSidesExportTest\TwoSides-win64-B75'
if (Test-Path -LiteralPath $b75Destino) { throw 'Destino ocupado; no sobrescribir' }
New-Item -ItemType Directory -Path $b75Destino | Out-Null
Copy-Item -Path 'C:\TwoSidesBuild\TwoSides-win64-B75\*' -Destination $b75Destino -Recurse
powershell.exe -NoProfile -File C:\TwoSidesBuild\B75-Validation\Verify-Package.ps1 -PackageRoot $b75Destino -ManifestPath C:\TwoSidesBuild\TwoSides-win64-B75.sha256 -ExpectedManifestSha256 $b75Hash
if ($LASTEXITCODE -ne 0) { throw 'Copia rechazada; no abrir el juego' }
```

El verificador solo lee, rechaza enlaces, rutas inseguras y cambios/archivos extra. No abre partidas ni lanza el juego. Su hash: `776B881B108A6993ACD78448BD4C14641FA0CF029D654F9BAE0F09D122258C1F`. Copiar si las permisos de la cuenta lo permiten; ante denegación detenerse, no cambiar ACL automáticamente.

**Dentro de TwoSidesTest, con juego/editor cerrados**, tomar la instantánea previa con el SaveInspector existente, sin copiar/restaurar PlayerData:

```powershell
$b75Antes = 'b75-before-' + (Get-Date -Format 'yyyyMMddTHHmmss')
C:\TwoSidesTestKit\Scripts\4-Inspect-Save.ps1 -Snapshot $b75Antes
# Debe confirmar integridad y SourceUnchanged=true. Si falla: detener, nunca reinicializar.
# SOLO el propietario, después de revisar el snapshot, abre manualmente:
& C:\TwoSidesExportTest\TwoSides-win64-B75\TwoSides.exe
```

Ese lanzamiento no fue ejecutado por el agente. Snapshot real previo **pendiente**: no se puede afirmar que existe uno nuevo de B75 sin que el propietario ejecute la herramienta en su cuenta. El flujo SaveInspector sí se ensayó aquí sobre almacenes ficticios antes/después.

Validar en la ventana: apertura sin pedir .NET; continuar la misma partida/perfil; decisiones/ambiente previos presentes; tomar una decisión nueva en un bioma permitido; cambiar de bioma; volver al menú; cerrar normalmente; reabrir manualmente y confirmar recuperación sin duplicar decisiones. No usar banderas de sandbox, partida temporal ni importar la cola histórica. Advertencias locales de telemetría/Outbox de B72 siguen fuera de este alcance; no se aprovisionó su esquema en producción.

Con el juego abierto, obtener su PID y ejecutar la herramienta separada, **sin** ejecutar diagnósticos sobre otras aplicaciones:

```powershell
$b75Proceso = Get-Process -Name TwoSides -ErrorAction Stop
if (@($b75Proceso).Count -ne 1) { throw 'Debe existir una sola instancia de prueba' }
& C:\TwoSidesBuild\B75-Validation\Inspect-Running-Modules.ps1 -GameProcessId $b75Proceso.Id -PackageRoot C:\TwoSidesExportTest\TwoSides-win64-B75
```

Debe reportar coreclr/hostfxr y SQLite nativa desde el paquete, HasDotNet/HasSqlite verdaderos, sin conexiones TCP establecidas durante el modo offline. El código de la herramienta no lanza el juego, lee SQLite o exporta usuario, paths completos, endpoints, IDs de jugador o stacks. Su hash: `D352E986F667D3680F43D0106FE38E8CCFA9732F189BD42AD08298C0BB386A86`. El módulo de .NET debe corresponder a 8.0.30; no aceptar un runtime de otra carpeta como validación del autocontenido.

Con el juego cerrado:

```powershell
$b75Despues = 'b75-after-' + (Get-Date -Format 'yyyyMMddTHHmmss')
C:\TwoSidesTestKit\Scripts\4-Inspect-Save.ps1 -Snapshot $b75Despues
C:\TwoSidesTestKit\Scripts\4-Inspect-Save.ps1 -Compare @($b75Antes,$b75Despues)
# Esperado: PERSISTENCE VERDICT: PRESERVED; SourceUnchanged=true en inspecciones.
Get-Process -Name TwoSides -ErrorAction SilentlyContinue
```

No compartir bases, ownership.json, logs completos, dumps o capturas con datos de jugador. Para un error, registrar versión, acción, código público y el informe de booleanos/módulos; revisar/redactar cualquier detalle adicional antes de enviarlo. No se cambió el sistema de logging del juego ni se activaron volcados o rutas de log permanentes. Las herramientas/snapshots quedan fuera del paquete final.

## 8. Integridad preservada y reversión

- De los 694 archivos originales de escenas/assets/scripts/integración/bibliotecas inventariados, solo cambió `SyntheticSandbox.cs.txt`; cambios de compilación separados en los dos proyectos/props indicados. `project.godot`, reglas, finales y Sync v2 permanecen iguales.
- SQLite histórica: **SHA-256 antes/después idéntico** `9FE793A26068A63C14FC76977FD4661E8C0BB55AC2E6DF69E6E76C45A8D0070C`. Solo hash de bytes, no conexión SQLite. No se tocó B52 ni PlayerData de TwoSidesTest. `%LOCALAPPDATA%\TwoSides\PlayerData` de la cuenta del agente sigue sin existir; sandboxes `.work/databases`: cero al terminar.
- Backend v5: **3172 archivos, cero diferencias, código 0**, SHA `2A4956E951217DFF2501D3FFBD35C9024554166E9126AD0134D8FB58C77AD726`, ancla `1f3f507348a479d88362767e9e548200003d646ad8930f54cbfc9efc6a9f8c28`. No se activó ni regeneró, no se ejecutó B67.
- B74 sigue disponible e íntegro. Ningún proceso Godot/TwoSides quedó abierto al terminar la exportación/inspección. Otros procesos dotnet del entorno no se detuvieron indiscriminadamente.

Reversión de código, si se autoriza: verificar hashes de `before.json`; restaurar **únicamente** `TwoSides.csproj`, `local-persistence/Directory.Build.props` y `local-persistence/src/SyntheticSandbox.cs.txt` desde `pre-B75`, y reconstruir la configuración que corresponda. No restaurar `.work` completo, escenas, datos, cuentas o manifiestos del backend. Los lockfiles/preset ya son idénticos y no necesitan restauración. Conservar el candidato y B74 para comparación; no borrar respaldos. Volver al código anterior reintroduciría las rutas privadas en futuras exportaciones.

## 9. Conclusión

**Aceptación local de B75: compilación/pruebas y nueva exportación autónoma inspeccionada PASS, sin rutas privadas del desarrollador en los binarios del juego, sin secretos/bases reales y con B74/datos/backend preservados.**

**Pendiente antes de distribución pública:** prueba manual del EXE en el perfil autorizado (incluida carga real .NET/SQLite, offline y persistencia), instantánea real previa/posterior, revisión de derechos de assets, metadatos aprobados y decisión de firma. No declarar esas verificaciones aprobadas por el éxito del exportador o del harness. B75 termina tras generar e inspeccionar el paquete; no se ejecutó `TwoSides.exe` ni comenzó otra fase.
