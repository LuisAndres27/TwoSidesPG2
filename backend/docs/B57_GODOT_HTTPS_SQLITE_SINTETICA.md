# B57 — HTTPS con SQLite sintética en Godot

Fecha: 2026-11-03, Guatemala. **IMPLEMENTADO Y VERIFICADO LOCALMENTE.** Modo HTTPS de pruebas preparado; no se ejecutó Godot, Caddy, Express ni una campaña Atlas. No se instalaron certificados ni se modificaron credenciales, cuotas, esquema SQLite, escenas, assets, mecánicas, partidas reales, `project.godot`, manifiesto del backend o C2Runtime. Sin commits ni push. B00 continúa pendiente.

## 1. Causa y cambio mínimo

Antes, `SyncLocalMode` fijaba HTTP `127.0.0.1:3000`, y el sandbox exigía esa bandera. `SyncMainMode` desactiva el origen HTTPS normal cuando encuentra banderas de pruebas. El recorrido HTTPS disponible en el juego correspondía por tanto al modo normal de almacenamiento; B55 había validado HTTPS con un cliente independiente, no con sandbox en Godot.

Se modificaron únicamente dos fuentes del producto:

| Archivo | Cambio |
|---|---|
| `local-persistence/sync-http/SyncWorkerLifecycle.cs.txt` | Nueva constante `SyncLocalMode.HttpsFlag`; acepta HTTPS fijo solo con la bandera exacta de sandbox. HTTPS sin sandbox se clasifica `Invalid`, incluso si no hay una bandera de almacenamiento. No cambia el worker, identidad, transporte ni manejo de cuota |
| `integration/sqlite/GameSyncHost.cs` | Rechaza explícitamente una solicitud de almacenamiento inválida antes de componer Sync; el aviso de modo de prueba muestra el origen seleccionado, sin IDs ni secretos |

El guardado ya se selecciona en `GamePersistenceContext` mediante `GameTestStorage.FromArguments` **antes** de construir el adaptador normal. Una solicitud HTTPS inválida lanza excepción allí; no devuelve `null` para caer al guardado real. La comprobación en `GameSyncHost` aporta una segunda validación de esa misma política. No se alteró la arquitectura de identidad ni la persistencia real.

## 2. Configuración del modo sintético

Argumentos de usuario de Godot para una futura ejecución autorizada:

```text
-- --two-sides-sync-local-test-https --two-sides-test-storage=sandbox
```

No es un comando ejecutado durante B57. No requiere cambios permanentes en `project.godot`.

| Argumentos/configuración | Resultado |
|---|---|
| Sin banderas, sin configuración HTTPS normal | Comportamiento anterior: Sync desactivado; B57 no inicia el juego así |
| Sin banderas, con `two_sides/sync/main_api_url` válido | Configuración normal anterior, sin cambios |
| `--two-sides-sync-local-test` | Modo HTTP anterior, sin cambios |
| Bandera HTTP anterior + sandbox | HTTP `http://127.0.0.1:3000/`, base nueva desechable |
| Nueva bandera HTTPS + sandbox | **`https://localhost:8443/`**, base nueva desechable |
| Nueva bandera HTTPS sola, duplicada, combinada con HTTP, con almacenamiento incorrecto o parámetros sync desconocidos | Rechazo; no selección de almacenamiento real como alternativa |

No hay argumento para URL/host/puerto/contraseña. Modificar la bandera con `=https://otro-host` no cambia el destino: se rechaza. Las banderas son exactas; variantes de mayúsculas o sufijos no activan el modo. HTTPS no se activa por defecto en sandbox. El modo normal sigue descartando configuración `main` cuando hay banderas de prueba.

## 3. Aislamiento y TLS

- `GameTestStorage` conserva su capacidad existente: crea una base propia nueva en `local-persistence/.work/databases/<GUID>/<GUID>.sqlite3`; no acepta rutas arbitrarias. Su adaptador solo abre el token `owned-outbox-fixture`.
- Datos iniciales: perfil sintético nuevo; sin copiar bases ni importar los 2151 registros históricos. El pump solo observa la base nueva que le entrega ese adaptador.
- El sandbox mantiene `GameSyncHost._testStorage=true`; la fábrica DPAPI normal no se usa y `SyncWorkerLifecycle` conserva su `InMemorySyncSecretStore`. No se reutilizan credenciales o perfiles reales. Identificadores nuevos entre campañas son deliberados; reintentos de la misma operación conservan los identificadores existentes.
- `SyncHttpTransport` y `SocketsHttpHandler` de producción permanecen intactos: confianza del sistema y nombre del certificado normales, sin callbacks permisivos ni almacén alternativo. La nueva bandera solo selecciona el origen.
- No se modificaron `GameTestStorage`, `GamePersistenceContext`, los adaptadores, el esquema ni el mecanismo de captura/identidad. Los comentarios históricos de esos archivos que muestran la combinación HTTP siguen describiendo un modo válido; la combinación HTTPS adicional se documenta aquí.
- No se tomó ninguna huella de SQLite real para demostrar aislamiento: no se abrió ni leyó. La evidencia es la selección de capacidades, el rechazo de rutas y las bases nuevas creadas en pruebas.

## 4. Respaldo pre-B57 e integridad

Creado **antes de editar**, sin sobrescribir otro respaldo:

```text
local-persistence/.work/backups/pre-B57-20261103T233411Z-8bd04eceb4ee4b40b99b56e74b6f5606/
```

Contiene las dos fuentes originales y `inventory.json` con rutas y hashes. Copias comparadas con sus originales mediante SHA-256 antes del cambio. Es un respaldo local dentro del proyecto, no una referencia independiente ni una solución de B00.

| Fuente | SHA-256 original | SHA-256 B57 |
|---|---|---|
| `SyncWorkerLifecycle.cs.txt` | `D13E82CAA74E6DFBCCC6656A5BF10BDF1A4DD4A00A91E98489E0A6D424449830` | `048F215EF20AE6389634FCCF9119C22BDBDFFD316814C55D44ED2062F2CFB505` |
| `GameSyncHost.cs` | `FDBC585818F5BED943EDB752F5BC51F50DB8EB539C6CED3D13ECD2F903FEF530` | `5E27E323A77BDE56E1C81EF78D734D8C4D96E5841A669FD843159FCCD517A4E2` |

Manifiesto backend v4: **OK antes y después**, 3169 archivos, cero añadidos/eliminados/modificados/problemas. No se regeneró ni cambió. Estos cambios de cliente están fuera de su ámbito; no se afirma que v4 selle el cliente.

Fuentes B54 sin cambios, hashes confirmados:

- `SyncOutboxService.cs.txt`: `60474909D09A1D33DCDCF1A5646C2EBCE9ABBCBD117727F51486D3A299C334C1`.
- `SyncOutboxDispatcher.cs.txt`: `1DF47EF3CC8770B3EDC8A45D97517DCA661AACDC31D86FD632CC7F3D544B70C1`.

## 5. Pruebas locales ejecutadas

Nuevos archivos de prueba: `local-persistence/sync-b57-tests/{SyncB57.Checks.csproj,Program.cs.txt,packages.lock.json}`. El proyecto compila las fuentes actuales del producto y reutiliza las suites F3.1/B54 como fuentes, sin modificar esas suites. B54 se invoca con argumentos vacíos, excluyendo sus casos opcionales Express.

| Grupo | Resultado real |
|---|---|
| B57 selección de modos, aislamiento, transporte y TLS | **46 comprobaciones aprobadas** |
| F3.1, servidor HTTP falso en proceso | **14 casos aprobados**, 0 fallos |
| B54, servidor HTTP falso en proceso | **16 casos aprobados** |
| Resultado global | **`B57_RESULT=PASS`, código 0** |
| Compilación del proyecto de pruebas | 0 errores, 0 advertencias |
| `dotnet build TwoSides.csproj --no-restore --nologo` | 0 errores, **63 advertencias históricas**; ninguna advertencia nueva en las dos fuentes modificadas |

Cobertura concreta:

1. Comportamiento normal sin banderas y modo HTTP anterior intactos; HTTPS exige sandbox y destino fijo.
2. Configuración normal externa no suplanta el modo de prueba. Duplicados/mezclas, destinos añadidos, sufijos, mayúsculas y almacenamiento/rutas arbitrarios se rechazan. `GameTestStorage.FromArguments` lanza antes de poder seleccionar el adaptador normal.
3. Base propia normal sin enlaces; el adaptador rechaza rutas reales y arbitrarias por su valor de cadena antes de abrir archivos. Solo acepta la capacidad de la base recién creada. Cierre impide continuar Sync y disposición elimina únicamente su sandbox. Dos campañas obtienen rutas independientes.
4. Transporte Sync v2 real con doble HTTP en memoria recibe la URI HTTPS fija correcta. Este doble no pretende validar certificados.
5. **Validación TLS real separada:** servidor falso `SslStream` en un puerto efímero de loopback, certificado localhost autofirmado creado solo en RAM y no instalado. X509Chain rechaza su confianza; el `SyncHttpTransport` real devuelve `Status=0 / NetworkUnavailable`, rechazando el certificado con su validación normal. Se cierra el listener en `finally`. No se accede a Caddy ni al almacén para instalar confianza. No se acredita revocación mediante esta prueba.
6. F3.1 comprueba timeout real de 15 s, lote inicial 5/tope 8 adaptativo, lease 60 s, reintento con mismos IDs, conciliación tras respuesta perdida, un único registro técnico por instalación y contrato de sesión/lote sin cambios.
7. B54 comprueba preservación de decisiones/progreso y dependencias, cuota frente a rate limit, 200 pasadas sin solicitudes durante pausa, escalado 15 min/1 h/6 h, reinicio, sonda de una operación, duplicado que no acredita capacidad y reanudación sin renumerar ni perder recibos.

No se ejecutó `SyncHttp.Checks` completo: contiene un caso que lee/hashea el guardado real, prohibido en B57. Se cubrieron las políticas nuevas con esta batería explícita sin ejecutar ese auxiliar. No se ejecutaron pruebas remotas, Express offline-test ni campañas Godot.

Comandos empleados:

```powershell
dotnet restore local-persistence/sync-b57-tests/SyncB57.Checks.csproj --source local-persistence/.work/packages --nologo
dotnet build local-persistence/sync-b57-tests/SyncB57.Checks.csproj --no-restore --nologo
& 'local-persistence/.work/bin/SyncB57.Checks/Debug/net8.0/win-x64/SyncB57.Checks.exe'
dotnet build TwoSides.csproj --no-restore --nologo
```

Restauración desde caché local; no instalación de dependencias del backend ni consulta NuGet remota. Compilar el proyecto Godot no inició el motor ni abrió partidas.

## 6. Cierre, riesgos y límites

Comprobación final: **0 entradas sintéticas restantes**, 0 procesos Node/Caddy, 0 listeners en 3000/3001/8443 y 0 coincidencias de la CA B55 en `CurrentUser\Root`. El servidor TLS falso fue detenido por su propia disposición. No se instalaron/modificaron certificados.

B57 acredita selección de modo y bibliotecas con pruebas sin motor, más compilación del juego. Aún falta una ejecución dentro de Godot con HTTPS confiable para validar el recorrido completo de escenas/arranque/cierre; no se presenta como realizada. B55 cubrió HttpClient+Caddy fuera del motor.

La nueva bandera fija el origen HTTPS local; no fija por sí misma qué Express escucha detrás de Caddy ni autoriza acceder a Atlas. La campaña futura debe verificar el proceso backend, su perfil y permisos. Tampoco limita por sí sola el total de operaciones de una campaña: la guardia finita y los controles B56 siguen pendientes. La base desechable se elimina al cerrar; no es recuperación de datos reales. B00, SHA-256/rol mínimo de Atlas y capacidad prolongada no se resuelven en B57.

## 7. Reversión

Sin procesos de prueba activos, restaurar **solo las dos fuentes** desde el respaldo pre-B57 a sus rutas originales y comprobar los dos hashes originales de la tabla. Recompilar el cliente/proyecto. No hay migración, cambios de datos ni rollback SQLite. El nuevo proyecto de pruebas puede conservarse como evidencia; al revertir la funcionalidad sus expectativas HTTPS ya no serían aplicables. No restaurar directorios completos ni tocar partidas, claves, manifiestos o fuentes B54.

## 8. Condiciones para una campaña futura con Atlas

Requiere autorización independiente, no concedida por B57: primero aprobar el ensayo Godot HTTPS con sandbox, confianza temporal instalada/retirada manualmente y backend verificado; completar los controles de B56 (autenticación/rol, integridad, IDs nuevos, límite de campaña y limpieza exacta); fijar los documentos sintéticos permitidos y conciliación de commits inciertos. No importar historial ni compartir identidades previas. No ejecutar automáticamente F3.10, C.2, F.2 ni otra etapa.

**B57 finalizada. Godot queda preparado para HTTPS sintético explícito, sin cambios permanentes en su configuración normal.**
