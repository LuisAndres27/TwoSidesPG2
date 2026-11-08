# B64 — Sonda de primera lectura Atlas v2

Fecha: 2026-11-03, Guatemala. **Preparación y pruebas offline completadas. NO autorizada ni ejecutada la conexión real.** Se revisaron B59, B60, B62, B63, el inspector histórico, el inventario de esquema, el transporte de credenciales y el verificador oficial.

No se abrió `.env`, consultó Atlas, creó cuenta/rol, activó v5, inició el backend principal, modificó F1/F2, cuotas, Godot, SQLite, ACL, certificados o C2Runtime. No se generó una autorización real, creó un directorio receptor privado, recibió una contraseña real, hizo commit ni push. Las autorizaciones utilizadas en pruebas son objetos ficticios en RAM; los marcadores de uso único se ensayaron exclusivamente en directorios temporales desechables.

## 1. Por qué no utilizar el inspector histórico

`scripts/run-main-inspection.js` y `src/main/inspection.js` utilizan la política administrativa histórica: identidad anterior, mecanismo DEFAULT y comprobaciones de roles `read`/`readWrite`. No representan la nueva matriz exacta `two_sides_main_runtime_v1@admin`. No se modificaron ni se propone conceder roles amplios para hacerlos pasar.

Tampoco se utiliza `run-main-backend.ps1`, `openMainProfile`, la composición HTTP, calentamiento transaccional, repositorios de juego ni modelos Mongoose. Su ejecución haría más que la primera lectura solicitada.

## 2. Archivos creados y diseño

Todos son nuevos; no se modificaron archivos de producción existentes:

| Archivo, relativo a backend | Función |
|---|---|
| `tools/atlas-v2-first-read/probe.mjs` | Núcleo de lista cerrada de lecturas, configuración fija, validación efectiva y cierre; dependencias inyectadas para probar sin red |
| `tools/atlas-v2-first-read/gate.mjs` | Bootstrap con módulos nativos: manifiesto, rutas normales, hashes previos a imports de producción, autorización acotada y claim exclusivo |
| `tools/atlas-v2-first-read/receiver.mjs` | Entrada futura, bloqueada por defecto; solo directorio privado exacto, autorización nueva, v5 activo y stdin enmarcado |
| `tools/atlas-v2-first-read/send-first-read.ps1` | Plantilla de lanzamiento manual: checks antes del prompt, hashes, bloqueos de archivos, entrada oculta, UTF-8 estricto, stdin binario y supervisión |
| `tests/sync/atlas-v2-first-read.test.js` | 61 pruebas offline nuevas |
| `docs/B64_SONDA_LECTURA_ATLAS_V2.md` | Este informe |

Los scripts son preparación revisable, **no un canal desplegado/certificado**. El receptor rechaza ejecutarse desde el workspace. Su ubicación futura fija es `%LOCALAPPDATA%\TwoSides\AtlasV2FirstRead\<runId de 32 caracteres hexadecimales>`. B64 no crea esa carpeta ni su `authorization.json`.

Destino invariable: `<cluster>.<id>.mongodb.net`, base `two_sides_db`, usuario `twosides_backend_v2`, authentication database `admin`, **SCRAM-SHA-256 explícito**, TLS estricto. No se reciben URI, destino, usuario, mecanismo, opciones TLS o contraseña mediante configuración ambiental/argumentos alternativos. No se consulta configuración del backend ni se usa la cuenta anterior.

La contraseña se entrega separada de la URI mediante opciones de Mongoose. No se escapa/recompone como URI, recorta ni normaliza. El script conserva las unidades UTF-16 del SecureString, codifica UTF-8 estricto sin BOM añadido y transmite longitud big-endian + bytes por stdin. Se reutiliza el módulo protegido `atlas-credentials.js` para recepción/consumo/destrucción. Rechaza vacío, más de 1024 bytes, CR/LF/NUL y UTF-8 inválido; no elimina caracteres válidos. Se limpian BSTR y buffers; **los strings de JavaScript y memoria de procesos no ofrecen borrado verificable**.

## 3. Operaciones remotas previstas, todavía no ejecutadas

Una sola llamada de conexión de aplicación, sin fallback ni retry de campaña. El driver puede abrir sus conexiones de topología/autenticación; no se promete que una sesión equivalga a un único socket TCP.

Máximo **11 comandos explícitos**, todos de lectura:

1. `connectionStatus:1, showPrivileges:true`: verificar usuario único, namespace, rol único y acciones efectivas.
2. `hello:1, saslSupportedMechs:'admin.twosides_backend_v2'`: replica set y primario, sin degradar el mecanismo explícito aunque el servidor anuncie SHA-1.
3. `listCollections:1, nameOnly:true, authorizedCollections:true`, **sin filter**, cursor de 200 y maxTimeMS 2000.
4. Siete `listIndexes`, uno por colección autorizada; cursor de 40, maxTimeMS 2000.
5. Un `find` sobre `main_v2_fences`, filtro exacto `_id:'ingestion-v1'`, proyección `_id:0, revision:1`, limit/batchSize 2, singleBatch y maxTimeMS 2000.

No `getMore`, conteos, lecturas de documentos de operaciones/identidad/sesión/históricos, HTTP, transacciones, escrituras, índices, colecciones, migraciones o reparaciones. No se registra ningún modelo; `autoCreate=false`, `autoIndex=false`, `bufferCommands=false`. Si un cursor no termina en el primer batch o excede el límite se detiene, sin ampliar la consulta.

Se exigen las siete colecciones del `MAIN_SCHEMA`, sus siete índices `_id_` y cinco secundarios únicos exactos. Rechaza índices adicionales, claves/orden distintos, sparse, parciales, hidden, TTL o collation no simple. La revisión de la semilla debe ser un entero seguro no negativo; no se imprime su documento ni se modifica.

El catálogo admite además exclusivamente los siete nombres históricos ya inventariados en B63: `users`, `decisions`, `gameevents`, `gameprogresses`, `statisticevents`, `statisticsummaries`, `syncidentities`. Solo sus nombres pueden aparecer en esa respuesta de metadatos; jamás se consultan sus datos. Un nombre inesperado, vista en lugar de colección requerida o esquema incompleto detiene la sonda. Los informes sanitizados guardan cantidades/estados, no el catálogo bruto ni documentos.

### Privilegios y separación administrativa

| Recurso de two_sides_db | Lectura requerida / política |
|---|---|
| Base, collection `''` | `listCollections` para conservar la garantía de catálogo completo de B60 |
| Cada una de `main_v2_operations`, `main_v2_facts`, `main_v2_fences`, `main_v2_identities`, `main_v2_ownerGuards`, `main_v2_identitySessions`, `main_v2_revocations` | `listIndexes`; se exige también `find` al comprobar el contrato de lectura de las siete; el único documento consultado es la semilla de fences |
| Identidad autenticada | Exactamente `twosides_backend_v2@admin`, rol único `two_sides_main_runtime_v1@admin` |
| Aplicación completa B60 | Lo anterior más `insert` y `update` en cada una de las siete; se inspeccionan, **no se ejercen** |

`connectionStatus` inspecciona los privilegios de la sesión propia; no se solicita `usersInfo`, `rolesInfo`, `viewUser`, administración global ni acceso a otras bases. `hello` no es una tarea de administración de colecciones.

El núcleo demuestra que la lectura funciona con solo el subconjunto de lectura: devuelve `readPermissionsVerified:true` y `runtimePrivilegesVerified:false` si faltan insert/update. **El receptor real convierte ese resultado en fallo `runtime_permissions_incomplete`**: una lectura exitosa no aprueba un rol de aplicación incompleto. No se amplían permisos automáticamente.

Se rechazan recursos extra, comodines, bases/colecciones no autorizadas, roles amplios, DDL, remove y cualquier acción fuera de la matriz B60. La cuenta de aplicación sí podrá escribir por su rol; la garantía de cero escrituras de esta sonda proviene de su lista de comandos/código revisado. **No es un sandbox RBAC que impida escribir a código comprometido bajo esa cuenta.**

Con `listCollections` de base, `authorizedCollections:true` no reduce el catálogo; sin ese permiso podría devolver solo una parte. La sonda **mantiene la exigencia del permiso** y no utiliza la variante limitada como sustitución silenciosa de esa garantía. Contratos oficiales: [listCollections](https://www.mongodb.com/docs/v7.0/reference/command/listcollections/) y [connectionStatus](https://www.mongodb.com/docs/manual/reference/command/connectionStatus/).

## 4. TLS, servidor, límites y errores

Validación normal de cadena/nombre del driver: no callbacks alternativos, `tlsInsecure`, certificados/nombres inválidos ni `rejectUnauthorized=false`. Se contrastan también opciones efectivas del cliente: SRV host fijado, base, identidad, authSource y mecanismo. El parser real de Mongoose/driver se probó con `MongoClient.connect` interceptado **antes de red**.

TLS/SRV validan el servicio bajo el host esperado; `hello` confirma replica set/primario. **No se inventa un setName esperado ni se afirma haber acreditado remotamente la identidad del clúster en B64.** El propietario deberá confirmar proyecto/clúster y red de Atlas antes de autorizar la sesión.

Pool de datos máximo 1, min 0, maxConnecting 1; retryReads/retryWrites false; selección/conexión/socket 10000 ms, espera pool 2000 ms; recepción stdin 30000 ms. El wrapper limita el preflight a 60000 ms y el proceso real a 150000 ms. Un timeout provoca fallo y terminación, no reintento. En una terminación forzada no se declara cierre ordenado: registrar cierre no confirmado y detenerse.

La API de la sonda devuelve códigos fijos, categoría allowlisted, etapa, códigos técnicos seguros 13/18/8000 y estado de cierre. Nunca errores originales, URI completa, stacks, opciones con pass o respuestas completas. Fallar el clasificador tampoco permite divulgar el error ni omitir finally. El cierre normal se espera; un error de cierre es fallo, aun si todas las lecturas pasaron.

## 5. Integridad previa a credenciales y uso único

Antes de `Read-Host`, el launcher futuro deberá:

1. Haber sido contrastado externamente él mismo junto con los otros tres artefactos. Verificar sus hashes y los de la autorización/nodo ejecutable usando las referencias aprobadas, no inventadas en la misma ejecución.
2. Exigir la ubicación privada exacta, sin reparse points en ancestros. Inspeccionar únicamente la DACL/propietario de los objetos nuevos y manifiesto activo: carpeta protegida y sin Allow a otros principales fuera del usuario actual, SYSTEM y Administrators. **B64 no ejecutó estas consultas.** No usa el auxiliar histórico de ACL ni modifica permisos. Si falla, detener sin reparar.
3. Mantener handles de lectura sin compartición de escritura/eliminación sobre los cuatro artefactos, autorización, Node y manifiesto activo durante prompt/ejecución. Esto reduce sustitución de esos archivos, no demuestra inmutabilidad de todo el sistema o de cada dependencia durante toda la sesión.
4. Ejecutar `receiver.mjs --preflight-only <SHA autorización>` sin entrada de credenciales: autorización exacta, runId nuevo, ventana máxima 15 minutos, aprobación externa/privacidad, sin marcadores/resultados anteriores.
5. Exigir que el manifiesto **instalado** sea exactamente v5. El bootstrap valida sus bytes/anclas y cada archivo listado, rutas normales sin enlaces/hardlinks antes de importar código protegido. Después ejecuta el verificador oficial con ancla, incluyendo detección de archivos adicionales.

Solo después se permite entrada oculta. El receptor repite las comprobaciones, crea `used.json` con `wx` **antes** de aceptar stdin y verifica nuevamente v5 antes de consumir el secreto/conectar. Un intento consumido o resultado existente no se reutiliza. El resultado sanitizado se guarda con creación exclusiva en ese mismo directorio futuro; no se persiste la contraseña.

La autorización futura contendrá exclusivamente kind `two-sides-atlas-v2-first-read-once`, runId, issuedAt/expiresAt, confirmaciones externalReferenceVerified/privacyApproved, TARGET fijo y hashes de los cuatro artefactos. No se emitió ahora. Es una capacidad local revisada, **no una firma digital ni una prueba automática de la veracidad de las confirmaciones del propietario**. Un atacante con control de la misma cuenta puede intentar sustituir código, referencias o proceso; eso continúa dentro de B00.

## 6. Manifiesto e integridad comprobada en B64

| Referencia | Resultado local |
|---|---|
| Candidato v5 | `%LOCALAPPDATA%\TwoSidesMainIntegrity\backend-integrity-manifest.v5-B62.json` |
| SHA-256 v5 | `2A4956E951217DFF2501D3FFBD35C9024554166E9126AD0134D8FB58C77AD726` |
| treeDigest v5 | `1f3f507348a479d88362767e9e548200003d646ad8930f54cbfc9efc6a9f8c28` |
| Nueva guardia + verificador oficial | **PASS, 3172 archivos, cero diferencias, código 0** |
| Instalado | Sigue siendo **v4**, SHA `7DEC55E3E1053F7F63A0D2B859ACB0A56FF931E82DB7BBB2625734326D6C3E8B`; no se reemplazó |

La sonda se añadió bajo `tools/`, las pruebas bajo `tests/` y este informe bajo `docs/`: **fuera del alcance v5**. No cambió ningún byte protegido, no se regeneró manifiesto. Estos artefactos requieren referencia independiente propia; v5 no los certifica. Si en el futuro se mueven a src/scripts o se modifica una dependencia protegida, habrá que autorizar un nuevo sellado, no actualizar v5 silenciosamente.

Hashes SHA-256 de los artefactos de esta preparación:

| Archivo | SHA-256 |
|---|---|
| `gate.mjs` | `E1FA695193BB716DC45DB24DC27F9B36625CBB5E1313391D87071040D3F8A695` |
| `probe.mjs` | `FB7B63C429C3CDE1055561038173068E0525F247F70EE064B8D248832B032080` |
| `receiver.mjs` | `11FC67BC135EF4CCAC0A8623EC5529818A400829FE12D428DA68AE3473C13354` |
| `send-first-read.ps1` | `E6090C57B6D3EA3FA98B9F592557C737DF55F0291C6DEE354E659BF7F0D36051` |

Son referencias locales revisables, **todavía no recuperadas ni contrastadas desde un medio externo**. No confundir con los paquetes C.2 anteriores, que son otro código/manifiesto.

## 7. Pruebas ejecutadas

Comando final, desde backend, sin npm scripts ni servidor remoto:

```powershell
node --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run --config vitest.config.js tests/sync/atlas-v2-first-read.test.js tests/sync/main-restricted-permissions.test.js tests/sync/main-readiness.test.js tests/sync/main-f1-optimization.test.js tests/sync/main-f1-warmup.test.js tests/sync/main-f2-commit-gate.test.js tests/sync/main-scram.test.js tests/sync/main-credential-channel.test.js
```

**8 archivos PASS, 150 pruebas PASS, 0 fallidas, código 0, 82,72 segundos.** B64 aporta 61; las otras 89 son regresiones existentes. Las regresiones HTTP utilizan únicamente fixtures/servidores locales de prueba, no el backend principal contra Atlas. Las guardias de pruebas impiden cargar `.env` o SQLite real.

Cobertura: credenciales ficticias incorrectas (18/8000), config/usuario/base/host/TLS/mecanismo inesperados, permisos ausentes/extra, rol equivocado, lectura con subconjunto sin escrituras, catálogo/índices/semilla/cursor inválidos, ausencia de escrituras, límite de comandos, cierre exitoso/fallido, errores sanitizados, manifiesto alterado, rutas de traversal, ventana/confirmaciones/hashes de autorización, uso único sobre archivos desechables y entrada por defecto bloqueada. Se comprobó el parser real de Mongoose/driver sin red y la conversión SecureString/UTF-8 con caracteres ficticios especiales. El script PowerShell se parseó sin ejecutarse como launcher real.

La primera corrida detectó tres defectos en el código de prueba (parametrización de catálogo y uso directo de opciones Mongoose en MongoClient), corregidos antes de la corrida final. No motivaron cambios de producción. La primera invocación del runner fue impedida por EPERM del sandbox al crear procesos; la ejecución offline seleccionada se realizó con permiso de ejecución local, sin ampliar el alcance de red.

No se ejecutó la batería completa ni auxiliares de auditoría histórica. No se hicieron pruebas interactivas con contraseñas reales, prueba remota de TLS/SCRAM, ni ensayo completo del launcher privado desplegado. Esas limitaciones no se presentan como PASS remoto.

## 8. Contraste independiente y comandos futuros del propietario

**Pendiente, no ejecutado.** Seguir B63 P1: guardar fuera del árbol/equipo el manifiesto v5 sin reserializar y sus referencias aprobadas SHA/tree/3172; recuperar una copia desde ese medio a Downloads nuevo. Contrastar con la referencia previamente conservada y la procedencia/versionado externo, no solo con hashes producidos al verificar la copia local. Hacer lo mismo con los cuatro artefactos B64 y sus hashes aprobados. Un hash local y una bandera `externalReferenceVerified:true` no sustituyen ese procedimiento.

Comandos de lectura que se ejecutarán **cuando exista y se identifique la descarga real**:

```powershell
# $v5Recuperado deberá apuntar al JSON realmente recuperado del medio externo.
Get-FileHash -LiteralPath $v5Recuperado -Algorithm SHA256
node backend/scripts/backend-integrity.js verify $v5Recuperado
# Exigir SHA aprobado, treeDigest aprobado, 3172 y código 0;
# contrastar además con la referencia externa conservada por el propietario.
```

Después, autorizaciones separadas para activar v5 según B63 y crear manualmente cuenta/rol en Atlas. Conservar v4 y cuenta anterior; no reutilizar sus credenciales. No cambiar cuotas/contratos ni arrancar main como efecto de esos pasos.

Cuando se autorice preparar el canal real: desplegar únicamente los cuatro artefactos a un runId nuevo, comprobar permisos del directorio **y de los ancestros relevantes** mediante inspección acotada autorizada, comprobar Node/Windows/PowerShell confiables, contrastar hashes, emitir una autorización nueva de 15 minutos como máximo, y verificar que no existen marcadores previos. Si no puede acreditarse privacidad/procedencia, detener antes de prompt. No aprobar B00 por estar en LOCALAPPDATA.

**Plantilla de activación futura, NO ejecutable ahora:** faltan directorio/autorización/hash de Node certificados y autorización real. El propietario verificará primero el hash del sender desde su referencia externa antes de invocarlo:

```powershell
# Solo después de las autorizaciones anteriores; valores NO secretos, por concretar.
Get-FileHash -LiteralPath (Join-Path $runPrivado 'send-first-read.ps1') -Algorithm SHA256
& (Join-Path $runPrivado 'send-first-read.ps1') -AuthorizedFirstRead `
  -PrivateDirectory $runPrivado -AuthorizationSha256 $hashAutorizacionNueva `
  -SenderSha256 'e6090c57b6d3ea3fa98b9f592557c737df55f0291c6dee354e659bf7f0d36051' `
  -ReceiverSha256 '11fc67bc135ef4ccac0a8623ec5529818a400829fe12d428da68ae3473c13354' `
  -GateSha256 'e1fa695193bb716dc45db24dc27f9b36625cbb5e1313391d87071040d3f8a695' `
  -ProbeSha256 'fb7b63c429c3cde1055561038173068e0525f247f70ee064b8d248832b032080' `
  -NodePath $nodeVerificado -NodeSha256 $hashNodeVerificado
```

Nunca incluir una contraseña en ese comando. Introducirla solo en la entrada oculta que aparecería después de todos los preflights. Cualquier fallo consume o invalida ese canal según el punto alcanzado: no repetir automáticamente. Resultado aceptable de la futura sesión: autenticación SHA-256 efectiva, identidad/base/TLS conformes, **matriz completa de aplicación** verificada, catálogo/índices/semilla conformes, 11 comandos como máximo y cierre completado. No implica validación de escrituras/transacciones del nuevo usuario.

## 9. Condiciones pendientes y conclusión

1. Referencia externa de v5 y artefactos B64 recuperada/contrastada; v5 activado solo bajo autorización propia.
2. Cuenta/rol candidatos creados y configuración manual exacta confirmada, sin tocar históricos ni eliminar cuenta anterior; red/clúster restringidos.
3. Directorio privado y cadena de ejecución certificados, sin enlaces/hardlinks o permisos inesperados; ensayo local del despliegue antes de aceptar secretos. La plantilla solo consulta permisos al ejecutarse posteriormente, no los corrige.
4. Autorización explícita de **una sola sesión de primera lectura**, ventana vigente y activación manual; no implícita en B64.
5. Ante catálogo/índices/permisos inesperados: cerrar, documentar y detener; administración separada autorizada si se necesita reparar algo. Nunca ampliar privilegios o usar la cuenta anterior como fallback.

**B00 continúa pendiente.** B11 documentó la retirada de las dos ACE investigadas; no se afirma que sigan activas. Persisten riesgos de ejecución bajo la misma cuenta Windows, manipulación entre verificación/uso de dependencias, integridad/procedencia del ejecutable y secretos antiguos o residentes en RAM. Los hashes son detección de cambios, no aislamiento del sistema ni firmas. El rol de colección tampoco aísla documentos por jugador.

**Resultado B64: sonda preparada y probada offline; conexión real bloqueada hasta satisfacer las condiciones anteriores y recibir nueva autorización.** No activar v5, recibir credenciales, conectar Atlas, arrancar main/Godot ni continuar C.2/F.2 desde este informe.
