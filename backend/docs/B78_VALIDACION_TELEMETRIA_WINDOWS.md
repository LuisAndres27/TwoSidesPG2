# B78 — Preparación de validación de telemetría en Windows

Fecha: 4 de noviembre de 2026, Guatemala. **Preparación completada con una observación del editor en la exportación; ejecución jugable real pendiente del propietario.** No se abrió TwoSides.exe. B00 permanece pendiente.

## 1. Alcance y protección de datos

Se revisaron B68–B75, el informe y los ocho cambios de B77, migraciones, observador, Outbox y configuración de distribución. B77 conserva el almacenamiento normal por usuario y las mecánicas de B75; incorpora las extensiones Gameplay v1 y Statistics v1 sobre guardado v2. **Abrir B78 sobre PlayerData existente puede instalar estas extensiones. Por ello, no debe abrirse en luis2 ni en TwoSidesTest.**

El almacenamiento de distribución es `%LOCALAPPDATA%\TwoSides\PlayerData\save.sqlite3`, resuelto por GetFolderPath(LocalApplicationData), con `ownership.json` ligado a la identidad del archivo y propósito `player-production-save`. No basta cambiar una variable de entorno ni copiar una base para simular otra instalación. Release deshabilita las capacidades históricas/sandbox de desarrollo antes de acceder a ellas.

La prueba manual requiere una **cuenta Windows estándar nueva**, preparada manualmente por el propietario, que todavía no tenga PlayerData. No se creó ninguna cuenta ni se inspeccionó su existencia. Si no se dispone de ese entorno, detenerse antes de abrir el juego. No copiar ownership.json/SQLite entre perfiles, borrar PlayerData ni reutilizar TwoSidesTest.

No se abrió, copió, migró ni calculó el hash de la SQLite histórica ni de las bases de TwoSidesTest. Sus 2151 operaciones quedan fuera de todos los comandos. Las pruebas de producción se realizaron sobre raíces ficticias bajo TwoSidesTests/B68, B77, B78 y B78Release; no sobre el almacén real. La suite histórica de aislamiento solo consulta si existe el directorio real para comprobar que no lo creó; no abre sus archivos.

## 2. Cambios y archivos preparados

No se cambió código del juego, escenas, assets, mecánicas, cuotas, contratos ni backend/src. Los hashes de los ocho archivos modificados en B77 siguen coincidiendo con `local-persistence/.work/b77/changes.json`.

Nuevos componentes de desarrollo:

- `local-persistence/telemetry-inspector/TelemetryInspector.csproj`, `Inspector.cs.txt`, `Program.cs.txt`: inspector de lectura.
- `local-persistence/telemetry-inspector-tests/TelemetryInspector.Checks.csproj`, `Program.cs.txt` y sus lockfiles: ensayos sintéticos.
- `local-persistence/.work/b78/`: respaldos de configuración, selección reproducible de regresiones, arnés de DLL exportada, exportador, auditoría y registros.

Antes de exportar se respaldaron TwoSides.csproj, project.godot, export_presets.cfg, Directory.Build.props y los dos lockfiles del juego. `before.json` y `preparation-backup/` están en `.work/b78/`. El publish añadió únicamente el target `net8.0/win-x64` al lockfile de sync-http: tras comparar que sus dependencias anteriores no cambiaban, se restauraron exactamente sus bytes previos. Los seis archivos vuelven a coincidir con el respaldo. No hubo cambio de configuración permanente.

## 3. Compilación y exportación

Godot utilizado: 4.6.1 stable Mono, preset Windows Desktop x86_64, ExportRelease y .NET 8 autocontenido. Salida especificada explícitamente; no se usó la ruta relativa antigua del preset. Comando de exportación del editor:

```text
Godot_v4.6.1-stable_mono_win64_console.exe --headless --path <copia-autorizada> --export-release "Windows Desktop" C:/TwoSidesBuild/TwoSides-win64-B78/TwoSides.exe --quit
```

Esto ejecuta el editor/exportador, no el videojuego. Los builds incrementales Debug y ExportRelease devolvieron 0, con cero errores y cero advertencias emitidas en esas ejecuciones. B77 registró 63 advertencias históricas en compilación completa; no se presenta una compilación incremental como eliminación de ellas. La publicación Release del inspector y el arnés también compilaron sin errores.

**Incidencia registrada:** Godot terminó con código nativo 0 después de completar dotnet_publish_project y savepack, en 27 segundos. Al final del registro apareció:

```text
ERROR: EditorSettings not instantiated yet when getting setting "export/android/android_sdk_path".
```

El auxiliar conservador heredado de B75 devolvió **1**, porque rechaza cualquier `ERROR:`. No se afirma que ese auxiliar pasó ni que el registro esté libre de errores. Se comprobó que es el único mensaje ERROR y aparece después de savepack; hace referencia a ajustes Android del editor, no a una excepción C# del juego. La atribución a la fase final del editor se basa en ese orden; no se corrigió Godot ni se cambió su configuración. La auditoría independiente del paquete, la comparación íntegra de recursos y las pruebas con su DLL exacta pasaron. Se conserva como observación de la herramienta, sin repetir la exportación ni ocultar el registro. Evidencia: `export.log` y `export-review.json`.

## 4. Artefactos y hashes

| Artefacto | Resultado |
| --- | --- |
| Paquete nuevo | `C:\TwoSidesBuild\TwoSides-win64-B78\` |
| ZIP | `C:\TwoSidesBuild\TwoSides-win64-B78.zip` |
| Manifiesto SHA-256 | `C:\TwoSidesBuild\TwoSides-win64-B78.sha256` |
| Herramientas separadas | `C:\TwoSidesBuild\B78-Validation\` |
| Archivos / tamaño sin comprimir | **204 / 309373680 bytes** |
| ZIP / contenido verificado | **187790666 bytes / 204 entradas**, CRC y hashes correctos |
| PCK | **570 entradas**, cero añadidas, eliminadas o cambiadas frente a B75 |
| Verificador del paquete | **PACKAGE PASS files=204**, código 0 |

SHA-256 del manifiesto B78:

`08634D7B515E3EF5CE27D410ED068CDE27A978813B51361A79BF6EEB5C996DA7`

SHA-256 del ZIP B78:

`078090EE18847F59333DC8B8DE954549265745B80ABC6271946F7DA730A03AAC`

SHA-256 de `B78-Validation\TOOLS-INVENTORY.json`:

`A63600B2DD9AB449B4054D8654D0973895C3607BC12D8EC6F2F87B43AEDB03E9`

SHA-256 de `TelemetryInspector\TelemetryInspector.exe`:

`13DDB04D3187E51AF3C2DB242F97B3182972E25684B36A6A48D85572C817B199`

Los inventarios JSON externos contienen todos los hashes de archivos y dependencias, no solo el EXE. El manifiesto de paquete no es una firma de código ni reemplaza v5. Se recomienda custodiar estos valores separadamente antes de la prueba.

Dependencias verificadas: .NET 8.0.30 autocontenido, hostfxr/hostpolicy/coreclr, GodotSharp 4.6.1, Microsoft.Data.Sqlite 8.0.32 y SQLitePCLRaw/e_sqlite3. EXE, coreclr.dll y e_sqlite3.dll tienen arquitectura nativa x64. No hace falta instalar .NET para este paquete. Los ocho avisos de dependencias de B75 se copiaron sin modificar B75; no se otorgan por ello derechos nuevos sobre assets.

La auditoría recorrió los archivos exportados y las entradas PCK: sin backend, bases SQLite, .env, PDB, claves, herramientas de administración/desarrollo, URI MongoDB, asignaciones de contraseña ni rutas privadas del desarrollador en los patrones UTF-8/UTF-16 revisados. Las bibliotecas de terceros mantienen sus propios metadatos del proveedor; no se parchearon. El inspector está fuera del juego y del ZIP, con su runtime propio. No se incluyeron registros privados.

## 5. Inspector estadístico

Uso futuro, **desde la cuenta nueva de prueba y con juego/editor cerrados**:

```powershell
$b78Db = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)) 'TwoSides\PlayerData\save.sqlite3'
& 'C:\TwoSidesBuild\B78-Validation\TelemetryInspector\TelemetryInspector.exe' inspect --db $b78Db
if ($LASTEXITCODE -ne 0) { throw 'Inspeccion rechazada; no reinicializar ni restaurar datos' }
```

La CLI rechaza luis2 y TwoSidesTest antes de acceder a un almacén; también exige la ruta de producción exacta del usuario actual. No acepta una opción para saltar esa restricción. El núcleo se probó con capacidades de producción ficticias desde otro arnés, no mediante una excepción a la CLI real.

El inspector:

1. Abre antecesores sin seguir reparse points y mantiene handles contra sustitución/renombrado. Rechaza hardlinks, rutas UNC/OneDrive, objetos inesperados y manifiestos de propósito/identidad incorrectos.
2. Mantiene **todos los archivos de origen solo para lectura, sin compartir escritura ni borrado**. Rechaza el juego abierto o falta de acceso. No crea store.lease, ownership ni conexiones SQLite en el origen.
3. Copia de forma consistente DB y los sidecars presentes a un directorio temporal exclusivo mientras conserva esos handles. Un rollback journal no vacío se rechaza: no se intenta reparar el original. WAL/SHM, si existen, se copian juntos; si SQLite no puede leerlos sin recuperación, falla de forma controlada.
4. Consulta únicamente la copia con Mode=ReadOnly, query_only y trusted_schema deshabilitado. Verifica base v2 y sus migraciones, Gameplay v1, checksum Statistics v1, integrity_check y claves foráneas. Valida cada payload estadístico sin imprimirlo.
5. Compara bytes/longitudes del origen antes/después y elimina la copia temporal también ante errores. No compara dos lecturas de una fuente abierta sin protegerla contra escrituras.

Salida JSON agregada: Result, SourceUnchanged, TemporaryCopyDeleted, migraciones, cantidad/tipos de eventos, EffectiveMs, tiempo por bioma y sesión ordinal, sesiones abiertas/cerradas/interrumpidas, partidas iniciadas/completadas, finales, decisiones por bioma/opción/estado, biomas completados, estados Outbox, duplicados, intervalos inválidos, fuentes aún no proyectadas y cobertura. **No imprime nombres, IDs locales/estadísticos, hashes de identidad, rutas del usuario ni payloads libres.**

Result=PASS certifica esa inspección estructural, no todas las pruebas manuales del juego. Para una captura normal cerrada se esperan SourceUnchanged=true, TemporaryCopyDeleted=true, Integrity=ok, duplicados/InvalidIntervals=0 y fuentes no proyectadas=0. Una fuente pendiente o CAPTURE_GAP debe investigarse; no basta con que integrity_check diga ok. Un cierre inesperado puede dejar la sesión open hasta que la siguiente apertura la marque interrupted: no equivale a partida abandonada.

No modifica permisos ni acredita privacidad frente a procesos con el mismo usuario; B00 y los límites de la cuenta Windows siguen vigentes. El directorio temporal no se considera seguro solo por su ubicación. Se usa sin secretos administrativos y su vida se limita a la inspección.

## 6. Pruebas automáticas

| Batería ejecutada nuevamente | Resultado |
| --- | --- |
| B77 Statistics.Checks | 129 PASS |
| GameSave.Checks, 19 modos sintéticos explícitos | 721 PASS |
| SQLite | 43 PASS |
| Almacenamiento/aislamiento B68 | 65 PASS |
| F3.1, servidor falso en proceso | 14 PASS |
| B54 cuota | 16 PASS |
| Inspector nuevo | 23 PASS |
| DLL exacta de persistencia exportada, arnés Release | 11 PASS |

**1022 comprobaciones distintas aprobadas.** Las mismas 23 del inspector se repitieron además cargando sus DLL publicadas sobre una copia desechable del arnés; también pasaron y no se suman dos veces. La CLI publicada rechazó el perfil del desarrollador antes de abrir la ruta ficticia proporcionada. El juego no se ejecutó para estas pruebas.

Los negativos cubren rollback de migración, evento repetido, duración negativa/anómala, almacén ajeno, error de captura/almacenamiento, fallo de reserva, respuesta perdida, interrupción/reapertura, identidad/propósito incorrecto, archivo inesperado, almacén abierto, journal no recuperable y checksum modificado. La ausencia de servidor y los fallos de red se simulan; no se afirma una campaña real de desconexión del juego.

Se ejecutaron solo los modos GameSave enumerados en `.work/b78/run-offline.ps1`; no su modo por defecto ni modos históricos duraderos. El primer intento de ProductionStorage.Checks omitió su argumento de raíz y fue rechazado antes de los casos; se corrigió el invocador y después aprobó las 65 comprobaciones. El primer build del test del inspector detectó dos errores de compilación del nuevo test (using y nulabilidad); se corrigieron sin modificar código de producción ni relajar validaciones.

Evidencia principal: `.work/b78/offline-results.json`, logs por batería, `inspector-tests.log`, `published-inspector-tests.log`, `exported-library-tests.log`, `package-audit.json`, `final-package.json`, `export-review.json` y logs de compilación.

## 7. Procedimiento manual pendiente

### Preparación por el propietario

1. Preparar manualmente otra cuenta Windows **estándar y nueva**, por ejemplo una dedicada a B78. No iniciar sesión con luis2 ni TwoSidesTest. No copiar sus almacenes ni crear usuarios automáticamente.
2. Cerrar editores/juegos antes de inspecciones. Comprobar acceso de lectura al paquete y herramientas. Si hay denegación, detenerse: no cambiar ACL como solución implícita.
3. Desde PowerShell de la cuenta nueva, ejecutar el preflight de lectura:

```powershell
& 'C:\TwoSidesBuild\B78-Validation\Test-Fresh-Profile.ps1'
# Debe mostrar B78_FRESH_PROFILE=PASS; si PlayerData existe, detenerse sin borrarlo.
```

4. Verificar paquete e integridad de herramientas antes de abrir el juego:

```powershell
$b78Tools = 'C:\TwoSidesBuild\B78-Validation'
$b78Inventory = Join-Path $b78Tools 'TOOLS-INVENTORY.json'
if ((Get-FileHash -LiteralPath $b78Inventory -Algorithm SHA256).Hash -ne 'A63600B2DD9AB449B4054D8654D0973895C3607BC12D8EC6F2F87B43AEDB03E9') { throw 'Inventario distinto' }
foreach ($b78Item in (Get-Content -LiteralPath $b78Inventory -Raw | ConvertFrom-Json)) {
    if ((Get-FileHash -LiteralPath (Join-Path $b78Tools $b78Item.name) -Algorithm SHA256).Hash -ne $b78Item.sha256) { throw 'Herramienta distinta' }
}
& (Join-Path $b78Tools 'Verify-Package.ps1') -PackageRoot 'C:\TwoSidesBuild\TwoSides-win64-B78' -ManifestPath 'C:\TwoSidesBuild\TwoSides-win64-B78.sha256' -ExpectedManifestSha256 '08634D7B515E3EF5CE27D410ED068CDE27A978813B51361A79BF6EEB5C996DA7'
```

5. Solo después de revisar esas comprobaciones, el propietario abre **manualmente** `C:\TwoSidesBuild\TwoSides-win64-B78\TwoSides.exe`. No se suministra ni ejecuta aquí un launcher automático. Si se extrae el ZIP en otra carpeta nueva, verificar esa carpeta con el mismo manifiesto antes de abrirla. No separar EXE/PCK/data. No añadir override.cfg, URL, banderas de sandbox ni credenciales.

### Recorrido y capturas

| Paso | Acción manual | Comprobación después de cerrar normalmente |
| --- | --- | --- |
| A | Crear perfil con nombre ficticio y nueva partida; salir. | Migraciones v2/1/1; instalación y game_started una vez; game_completed=0; Outbox pendiente. |
| B | Reabrir, continuar, entrar a Mar y jugar activamente; pausar/reanudar y quitar/restaurar foco; confirmar una decisión. | Misma partida y decisión conservadas; una environmental_decision, opción/ambiente correctos; tiempo activo positivo. |
| C | Volver al menú, reentrar al bioma decidido y cambiar de bioma cuando sea permitido. | No repetir la decisión previa. biome_entered puede aumentar por una entrada nueva legítima; no es duplicado de finalización. |
| D | Alcanzar la meta física con el animal permitido y salir normalmente. | Un biome_completed del bioma, resultado correcto, progreso conservado. No basta visitar la meta con otro contexto. |
| E | Reabrir y continuar, sin servidor configurado. | Eventos previos conservados, nuevas sesiones legítimas; cero duplicados. Pending persiste; confirmed=0. El juego sigue funcionando sin red. |
| F, ampliación manual | Completar los cinco biomas y alcanzar un final válido si se desea validar todo el recorrido. | Final good/medium/bad según decisiones; game_completed una vez. Hasta realizarlo, la evidencia de finales es automatizada. |

Tras cada cierre, ejecutar el inspector y conservar su salida agregada fuera de PlayerData. Por ejemplo, para una carpeta nueva de resultados de la cuenta de prueba:

```powershell
$b78Evidence = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)) ('TwoSidesB78Evidence-' + (Get-Date -Format 'yyyyMMddTHHmmss'))
New-Item -ItemType Directory -Path $b78Evidence -ErrorAction Stop | Out-Null
$b78Db = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)) 'TwoSides\PlayerData\save.sqlite3'
$b78Result = & 'C:\TwoSidesBuild\B78-Validation\TelemetryInspector\TelemetryInspector.exe' inspect --db $b78Db
if ($LASTEXITCODE -ne 0) { throw 'Detener; conservar datos y comunicar solo el codigo publico' }
[IO.File]::WriteAllLines((Join-Path $b78Evidence 'after-close.json'), [string[]]$b78Result)
```

No guardar la salida dentro de PlayerData: el almacén rechaza archivos extra. El inspector de B78 no restaura snapshots ni compara ownership de perfiles distintos. Comparar los agregados entre capturas: no deben disminuir ni duplicarse los hechos; EventTypes session_* y nuevas entradas pueden crecer legítimamente.

### Tiempo y tolerancias

En una sesión controlada, anotar aproximadamente 60 s activos, 45 s de pausa, 45 s sin foco, 30 s de menú y otros 45 s activos. Empezar a cronometrar después de la carga; detener antes de transiciones. Cerrar normalmente y comparar EffectiveMs respecto de la captura anterior. Esperar aproximadamente la suma activa (105 s en ese ejemplo), con tolerancia **máximo de 5 s o 10 % del tiempo activo medido**, atribuible al manejo manual y fronteras de escena. No aceptar como tiempo activo los 120 s de pausa/foco/menú ni ampliar la tolerancia para esconderlos. Si el recorrido no puede separarse de cargas/interacciones, repetir una sesión controlada y documentarlo, sin borrar eventos.

El heartbeat es de 30 s, pero el cierre normal y cambios de estado vacían intervalos: no se añade automáticamente una tolerancia de 30 s a cada pausa. Un salto monotónico mayor de 60 s se excluye como suspensión. No forzar el cierre para probarlo sobre una partida que deba conservarse. En una interrupción inesperada, la ventana normal de pérdida de tiempo no persistido puede llegar a 30 s; no debe inventarse el tiempo entre procesos. Si hay errores de disco o fuentes no proyectadas, esa garantía de pérdida acotada deja de ser aplicable y debe investigarse.

## 8. Integridad preservada y límites

B75 se volvió a verificar: **204 archivos correctos**, ZIP SHA-256 `CF55AB6EDF0FE574ACFFCB0B1CCEF121F6FD4727864927770DC8423FAA709257`. No fue carpeta de salida ni se reemplazó su ZIP. Los recursos PCK de B78 son idénticos; las bibliotecas del juego reflejan B77.

v5 se verificó oficialmente: **3172 archivos, cero diferencias/problemas**, sin activarlo. Su SHA-256 sigue siendo `2A4956E951217DFF2501D3FFBD35C9024554166E9126AD0134D8FB58C77AD726`; treeDigest `1f3f507348a479d88362767e9e548200003d646ad8930f54cbfc9efc6a9f8c28`. No se modificaron ACL, propietarios ni credenciales ni se leyó .env.

No se inició el backend principal, Express offline, Caddy, Atlas, B67, C.2, F.2 ni F3.10; no hubo commits/push. Al cerrar la preparación no se observaron procesos Godot, TwoSides o Caddy. No se afirma haber monitorizado la red de un juego real ni probado su interfaz, porque todavía no fue ejecutado.

La referencia de hashes prueba igualdad de archivos, no confianza frente a modificaciones bajo la misma cuenta Windows. B00, firma de código/metadatos, derechos de redistribución y política/aviso de telemetría continúan pendientes antes de publicación. B78 es un candidato de prueba local, no una entrega pública certificada.

## 9. Reversión y próxima etapa

No hubo cambios nuevos de producción que revertir. Conservar B75 como candidato anterior. No ejecutar B75 sobre el almacén B78 como si eso revirtiera migraciones; no borrar tablas con pendientes ni copiar ownership/SQLite sobre la partida de otro perfil. Cualquier limpieza del nuevo perfil/almacén o descarte de los artefactos B78 necesita una decisión explícita y rutas verificadas. Los respaldos de configuración y registros quedan disponibles; no se borraron respaldos anteriores.

Para comenzar la integración estadística Express se requiere primero el resultado manual del propietario, incluyendo capturas agregadas de reapertura, tiempo, decisión, finalización y pendientes. Después, una fase autorizada deberá acordar statistics-only-v1, autenticación técnica sin cuenta personal, validación de límites, idempotencia, recibos y HTTPS con servidor simulado. No reutilizar game.report ni enviar partidas completas. Atlas solo podrá probarse en otra autorización, con riesgos B00 y privilegios revisados.

**Estado final: paquete e inspector preparados/verificados; validación real de la telemetría en Windows PENDIENTE. No se ejecutará automáticamente.**
