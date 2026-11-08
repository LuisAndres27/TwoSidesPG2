# C.2 Windows — Preparación final del entorno de ejecución

Fecha: 2026-10-29. **Estado: BLOQUEADO para recibir credenciales o autorizar la ejecución remota.** La preparación funcional y los límites de código se conservan; falta acreditar el paquete ejecutable y su entorno de recepción de secretos. No se conectó Atlas, no se ejecutó C.2, no se creó receptor y no se solicitaron credenciales.

## 1. Estado funcional confirmado

Se revisaron los informes B05_C2_WINDOWS_OPERATIONAL_LIMITS_RESULT.md, B05_C2_WINDOWS_FUNCTIONAL_PREFLIGHT_RESULT.md, B05_C2_WINDOWS_EXECUTION_PLAN.md y B00_CONTROLLED_ACL_INSPECTION_RESULT.md. Se contrastaron el arnés, supervisor, política Atlas, imports y componentes de bootstrap, sin repetir sus implementaciones.

| Control | Evidencia actual en código |
|---|---|
| Esquema C.2A | ATLAS_SCHEMA_RUN=10ef4f6d653f4ee4a1d1b2e6591013c2; ocho nombres fijos C.2A y cuatro D2E conservados; executionId distinto para cada plan |
| Fence | Una fila inicial {_id:'ingestion-v1',revision:0}; registro sintético bloqueado sin inventario inicial aprobado |
| Limpieza | Snapshot/registry exactos, comparación transaccional y deleteOne por IDs/owner; se omite el fence y no se reinicia su revisión; 16 filas propias al completar los casos |
| Supervisor | 120 s, con 116 s de trabajo y hasta 4 s reservados para cierre; timers, AbortSignal, seguimiento de promesas originales y abort/endSession/close acotados |
| Clientes/pools | Tres clientes de vida, reserva previa; maxPoolSize=2 por pool/servidor/cliente y maxConnecting=1; no es un total de sockets físicos |
| Sesiones | Dos explícitas y dos implícitas simultáneas; 18 explícitas/256 implícitas de vida; admisión Mongoose/nativa sin doble conteo |
| Reintentos | Tres callbacks y hasta tres commits nativos por transacción; misma sesión y autorización durable |
| Incertidumbre | Una escritura pendiente o uncertain bloquean assertCleanup; un resultado tardío no borra la incertidumbre |
| Bloqueo remoto | executeDurableAtlasRun sigue lanzando DURABLE_REVOCATION_C2_NOT_AUTHORIZED; remoteEnabled=false; la política aún no admite capacidad de datos C.2 |
| Provisión | durableProvisionSteps devuelve cero creaciones, cero índices y seedFence=null |

Se conservaron las huellas del arnés y supervisor del informe operativo:

- scripts/durable-revocation-atlas-harness.js: 05F0FB304D3E9DA248B56B24C4284D865A4082474507F2C828D6EF95F8294889.
- scripts/durable-revocation-runtime.js: C9E097486F9F457BB116CE9345D86E4681F58B7ADFCD2413CE409CA3DFD11CBA.

Coincidir con ese registro local confirma continuidad de bytes entre fases. No certifica procedencia ni resistencia a sustitución.

La cancelación no puede retirar un commit ya enviado al servidor. Un I/O nativo puede continuar después del timeout y el proceso Windows no se mata por estos controles. La seguridad de limpieza depende de mantener los flags de incertidumbre, no de suponer rollback por un cierre.

## 2. A36: análisis sin ejecutarla

Caso exacto: **A36 manual launcher refuses without future D authorization before prompting**, en backend/tests/sync/atlas.test.js.

Ejecuta powershell.exe sobre scripts/send-atlas-test-credential.ps1 sin autorización; espera salida de error genérica, código 1 y ausencia del prompt. Cubre el rechazo temprano del lanzador histórico antes de recibir secretos. Se excluyó porque ese archivo contiene inspección de ACL/propietario y corresponde a un mecanismo histórico de fase D, no al futuro canal C.2. En esta revisión se leyó el script, no se ejecutó. Su primer guard rechaza falta de autorización/huella antes de sus consultas ACL, pero no hace falta invocarlo para esta ruta.

OL19, en tests/sync/durable-revocation-operational.test.js, verifica que el entrypoint C.2 rechaza antes de evaluar un getter de credencial o llamar al conector. Es equivalente para el requisito de bloqueo de C.2 antes del secreto; no demuestra la corrección de aquel PowerShell ni de un futuro lanzador.

**A36 sigue excluida y no se considera aprobada. Su exclusión no impide C.2 por sí misma.** Antes de usar un canal nuevo deben probarse su propio rechazo temprano, manifiesto, uso único y prompt/transportes, sin reutilizar un canal consumido.

## 3. Ubicación Windows evaluada y alcance de permisos

Ruta propuesta:

C:\Users\luis2\AppData\Local\TwoSides\C2Runtime

La ruta **no existe actualmente**. Se consultaron atributos y DACL/propietario exclusivamente de sus seis ancestros existentes: C:\, C:\Users, C:\Users\luis2, AppData, AppData\Local y AppData\Local\TwoSides; además se comprobó la ausencia del destino. No hubo recorrido recursivo de carpetas personales ni consultas sobre el proyecto original.

Estas consultas acotadas responden a la verificación de permisos solicitada en esta fase. No se usaron private-workspace.ps1 ni las pruebas históricas de ACL. No se modificó ninguna ACL o propietario.

Hallazgos:

- Ninguno de esos seis ancestros presentó el atributo ReparsePoint.
- TwoSides, Local y AppData tienen propietario luis2 y DACL heredada con Allow FullControl para luis2, SYSTEM y Administradores; no aparecen allí los dos SID B00 investigados.
- El perfil C:\Users\luis2 tiene la herencia protegida y esos tres principales con FullControl. Tiene además una ACE de ejecución/travesía sin flags de herencia para un principal de capacidad; no es una ACE heredable de escritura hacia el candidato.
- Las concesiones más amplias en C:\ y C:\Users no se deben interpretar como permisos efectivos sobre C2Runtime: el perfil tiene su propia barrera de herencia. No se calculó acceso efectivo de todos los tokens ni se resolvieron identidades ajenas al objetivo.
- No se inspeccionaron permisos del destino, porque no existe. Sus futuros objetos todavía necesitan comprobación real; el estado de sus padres no los certifica por anticipado.

**No se materializó una copia ni se instaló software en esta etapa.** Se preparó el inventario/procedimiento. Crear ahora una copia de bytes aún sin procedencia acreditada no resolvería los bloqueos de confianza; la preparación del paquete queda especificada abajo.

### Distribución propuesta

```text
%LOCALAPPDATA%\TwoSides\C2Runtime\
  code\<release-id>\       # fuentes y dependencias cerradas, sin datos de ejecución
  runs\<execution-id>\     # manifiesto de un uso, marcadores y resultado sanitizado
```

Los identificadores son propuestas de estructura, no directorios creados ni comandos activables. No se copia el árbol del juego, docs, .git, .env, SQLite, pruebas completas, canales históricos ni configuraciones npm del usuario.

Procedimiento de copia que evita transportar las ACE del proyecto:

1. Verificar las rutas nuevas y ancestros reales, ausencia de redirecciones y colisiones; usar nombres nuevos sin sobrescribir objetos.
2. Crear archivos normales nuevos por bytes, sin copiar descriptores de seguridad, propietario o herencia del origen. No usar enlaces, junctions, /COPYALL, /SEC ni una copia recursiva del proyecto.
3. Examinar la DACL resultante de cada objeto nuevo y verificar que no aparecen los SID B00 u otras concesiones no justificadas. No corregir permisos de objetos existentes automáticamente.
4. Comparar bytes con el paquete/manifest de referencia independiente, y comprobar FileId/volumen, enlaces/reparse y estabilidad de rutas. Las 27 fuentes inspeccionadas ahora son archivos normales, nlink=1; eso no verifica todos sus ancestros ni elimina una carrera entre lectura e import.
5. Mantener cerrada la resolución de imports y librerías nativas y proteger el código durante todo el uso del secreto. Los hashes antes/después no impiden por sí mismos modificaciones durante la ejecución. Controles de handles que denieguen escritura/borrado requieren ensayo propio y no certifican aislamiento de memoria frente al mismo usuario.
6. Publicar únicamente una versión revisada y separar las salidas escribibles. Cualquier protección nueva que necesite ACL/identidad de publicación debe tener alcance explícito y autorización propia; no se cambia el proyecto original.

## 4. Inventario mínimo de código y dependencias

Se preparó un cierre estático candidato de **27 archivos fuente** a partir de cuatro raíces: arnés C.2, atlas-integration, CredentialHasher y rate-limiter. Las últimas tres aportan la composición que necesitaría el futuro bootstrap. No existe todavía ese bootstrap/receptor C.2 ni un PowerShell nuevo.

Los imports locales incluyen la importación dinámica de nombre fijo de mongo-identity-repository a sync-auth-context. Las llamadas require en schemas.js y relations.js son validadores locales, no cargadores de módulos; se revisaron para resolver ese falso positivo del escaneo. El inventario estático no prueba todo el cierre dinámico/nativo de Node.

Dependencias directas candidatas:

- mongoose 9.11.2.
- jose 6.2.13.
- zod 4.6.7.
- @node-rs/argon2 2.2.2 y su binario Windows x64 correspondiente.

Para win32/x64, el lockfile declara **23 paquetes candidatos** en ese cierre, incluidos transitivos, opcionales compatibles y metadatos de tipos. Sus versiones instaladas declaradas coinciden 23/23 con el lockfile. Todos declaran integridad de artefacto y registry.npmjs.org como host de descarga, sin credenciales en esas referencias. Eso no verifica los archivos instalados contra el artefacto.

No se debe podar arbitrariamente la distribución de cada paquete para aparentar un mínimo de archivos: exports, licencias, datos de runtime y binarios forman parte del artefacto que se verifique. La lista es el cierre declarado por metadatos, no un certificado de todas las cargas reales o DLL.

El package.json del backend añade Express y Vitest, innecesarios para esta composición directa del arnés. Usarlo sin cambios para npm ci instalaría componentes ajenos al mínimo. Se propone un package.json de runtime nuevo sin scripts automáticos, type=module, private=true y las cuatro versiones directas exactas; con un lockfile mínimo propio revisado y trazabilidad respecto del lock original. **Ese nuevo lockfile no se ha generado ni validado** y no se deben inventar sus hashes.

Los scripts PowerShell necesarios se limitan a un futuro lanzador/supervisor manual nuevo. No se incluye ningún script histórico. Debe revisarse junto con el futuro entrypoint antes de contener un prompt o aceptar stdin de credenciales.

## 5. Procedencia e integridad

Referencias locales actuales:

| Archivo | SHA-256 |
|---|---|
| backend/package.json | 0C02C90077183AFD93CDE70FB270036ADDCB4CF82538C58CE6C2D0A006AB383D |
| backend/package-lock.json | B3D28E74F4AF5543A60D18E937F1117892F7D6945C3A2D859542A21D01789FD8 |
| @node-rs/argon2/index.js instalado | 1F7935358751EAA3B1134DF8DBD61D8247D9DF401BE90E9CCE8C484F7AB4BA01 |
| @node-rs/argon2-win32-x64-msvc/argon2.win32-x64-msvc.node instalado | C43009DDBAA869F7D7AD21EA2D1BD0F4DD5DAAEE9F8393284593AD57A53EC11C |

El manifiesto C.2A histórico y los hashes documentados son referencias locales modificables. No se aportó una referencia de confianza independiente para el paquete final; los dos scripts, package.json y lockfile consultados no figuran como archivos rastreados en la consulta git nominal realizada. No se toma un hash calculado aquí como prueba de autenticidad.

**Hallazgo concreto que requiere contraste:** el paquete y binding Argon2 declaran 2.2.2, mientras el cargador instalado contiene comprobaciones de versión esperada 2.1.0 condicionadas por NAPI_RS_ENFORCE_VERSION_CHECK. También permite un path nativo mediante NAPI_RS_NATIVE_LIBRARY_PATH y selección/fallback WASI. Esto demuestra rutas de carga y una discrepancia de metadatos/código; no demuestra compromiso ni explica por sí solo un incidente anterior. Debe compararse con el artefacto original de una referencia independiente antes de ejecutarlo con una credencial Atlas. No se desactivará una comprobación de versión como sustituto de esa verificación.

El entorno futuro debe tener un allowlist de variables de proceso y rutas: sin NODE_OPTIONS, NODE_PATH, overrides NAPI/WASI o loaders heredados no revisados. No se consultaron sus valores actuales ni .env. NODE_ENV=test y la configuración del destino deben fijarse explícitamente. Usar ruta absoluta de Node, verificar su binario/firma y dependencias DLL sigue pendiente; no se certificó su cadena de carga.

### Procedimiento de verificación preparado

- Contrastar fuentes y paquetes con una copia/publicación revisada bajo control independiente, documentando quién estableció esa referencia. Si no existe, registrar esa ausencia.
- Registrar los 27 SHA-256 fuente y los de todos los archivos realmente publicados, package/lock del runtime, binario Node, addons y configuración no secreta.
- Para paquetes, verificar el artefacto contra el integrity anclado en un lock confiable y su origen; después comparar el contenido instalado, no solo package.version.
- Inspeccionar scripts lifecycle antes de instalar. Los metadatos actuales presentan prepare en bson, mongodb y whatwg-url, prepublishOnly en varios paquetes y prepublish en tr46; no se ejecutó ninguno. El lock no marca hasInstallScript en los 23 candidatos, pero eso no sustituye revisar los metadatos/scripts reales.
- Si se realiza npm ci --ignore-scripts, hacerlo solo en una carpeta sintética nueva fuera de OneDrive, con package/lock mínimos previamente revisados, configuración npm vacía/controlada y entorno sin tokens. Omitir devDependencies, conservar el opcional nativo Windows necesario y no ejecutar scripts posteriores, compiladores o descargas adicionales para hacer pasar una carga.
- Comprobar después, sin secretos ni red Atlas, resolución de módulos dentro del paquete, ausencia de rutas externas/enlaces, carga nativa exacta y funcionamiento con la configuración fijada. No aceptar un fallback o un binding diferente silenciosamente.

No se ejecutó npm install, npm ci, npm update, un hook ni una descarga. Tampoco se leyó .npmrc del usuario o de otros proyectos.

## 6. Modelo de seguridad Windows

| Ámbito | Mitigación prevista o evidencia | Riesgo pendiente |
|---|---|---|
| A. Salir del árbol original | El candidato no está bajo OneDrive/proyecto; los ancestros directos inspeccionados no tienen reparse points; TwoSides no hereda los SID B00 | Aún no hay copia publicada ni verificación de sus objetos; copiar código alterado seguiría propagando esa alteración |
| B. Misma cuenta Windows | Proceso no elevado y carpeta de código separada de resultados, a comprobar antes del secreto | luis2 conserva FullControl y sus procesos comparten identidad; ubicación/ocultación del prompt no aíslan frente a modificación o lectura de memoria por un proceso hostil o privilegiado |
| C. Dependencias | Versiones fijadas, cierre declarado y scripts identificados; futura instalación sin scripts | Procedencia/bytes de paquetes y addons no certificados, DLL y rutas dinámicas pendientes, discrepancia del cargador Argon2 |
| D. Secretos | Nuevo canal de uso único, stdin/RAM, sin archivos, argv, chat o logs | Un receptor o una dependencia comprometidos pueden capturar la contraseña; rotarla después no deshace una filtración |
| E. SID investigados | No aparecen en las DACL actuales de TwoSides/Local/AppData; no se copiarán descriptores del proyecto | La fuente y node_modules del proyecto siguen expuestos al riesgo histórico; no se identificó malicia ni se remediaron las ACE originales |

**B00 no está resuelta.** El aislamiento de rutas es viable como medida parcial y puede reducir la herencia del proyecto; no certifica una ejecución segura con secretos. La selección de una identidad de publicación/ejecución o controles adicionales debe justificarse sin suponer que dar FullControl al mismo usuario separa sus procesos. Aceptar pérdidas de datos sintéticos no equivale a aceptar exposición de credenciales.

## 7. Procedimiento futuro, sin activación actual

1. Cerrar la procedencia/carga del paquete y verificar los objetos reales del candidato. Mantener una versión de código separada de salidas y evidencia verificable durante toda la ejecución.
2. Revisar e implementar en una fase autorizada la capacidad exclusiva propuesta B05.4C.2F.1C.2, ligada al runId C.2A, al destino y a los escenarios/cupos exactos. La capacidad de datos actual sigue rechazada; no usar D2E/schema-only o una bandera genérica para eludirla. Habilitar el entrypoint únicamente tras comprobar manifiesto/autorización de uso único.
3. Verificar host <cluster>.<id>.mongodb.net, usuario twosides_integration_test, base two_sides_integration_test, authSource admin, DEFAULT y TLS estricto. Confirmar identidad autenticada y permisos efectivos; no confiar exclusivamente en dbName. No usar twosides_backend, two_sides_db o credenciales administrativas.
4. El usuario autorizado prepara una contraseña de integración temporal/única por el canal de administración correspondiente, sin entregarla al agente. Cualquier cambio de contraseña requiere la autorización de esa fase; no se hizo ahora.
5. Crear entonces un lanzador/receptor y manifiesto nuevos de un uso, fijados al paquete aprobado, con marcador atómico antes de consumir secretos y límites del supervisor. Verificar hashes/procedencia/rutas antes del prompt. Nunca reutilizar un directorio/manifiesto consumido ni borrar marcadores para repetir.
6. Solo tras la activación manual: introducir la contraseña en prompt oculto, conversión UTF-8 sin recortes y transporte por stdin anónimo/RAM. No URI completas, argumentos, variables persistentes, archivos, historial, transcripciones o logs de errores crudos. Limpiar buffers al terminar sin prometer borrado perfecto de strings administrados.
7. Abrir exclusivamente mediante la fábrica supervisada. Verificar catálogo completo con listCollections sin filter, los índices exactos y el fence inicial/ausencia de residuos antes de cualquier escritura. El estado remoto actual sigue pendiente. Un objeto o revisión inesperados detienen el ensayo sin recrear, borrar ni adoptar otra referencia.
8. Ejecutar únicamente A revocación primero, B ingesta primero y C pérdida de respuesta conocida/retry/desvinculación, más reapertura. Tres owners, ocho envíos, dos tareas paralelas; conservar los límites de clientes, sesiones, tiempo, callbacks/commits, documentos y cierre.
9. Confirmar orden mediante revisiones/estado durable y recibos, rechazo de tokens/duplicados tras revocación y ausencia de efectos abortados. No llamar a F.2, Outbox runtime ni datos reales. Dobles no equivalen a estas pruebas reales.
10. Si el commit es incierto: detener nuevas operaciones y limpieza, conservar IDs y estados sanitizados, cerrar con límites y no reintentar automáticamente. Una reconciliación posterior requiere autorización separada de lecturas por esos IDs exactos en la misma base de integración. Verificar efectos/recibos/revocaciones sin revivir identidades ni conceder acceso a recibos mediante tokens revocados; si la evidencia no basta, resultado inconcluso. No emitir ACK especulativo.
11. Solo después del éxito y de inventario exacto sin incertidumbre: limpiar las 16 filas propias, conservar el fence y todas las estructuras, y verificar residuales. Cerrar sesiones y clientes, registrar fallos de cierre y no interpretar close como rollback.
12. Rotar la contraseña de integración después del ensayo, incluido un fallo con posible exposición, mediante el usuario autorizado y sin ampliar roles. No automatizar esa rotación ni pedir la contraseña en chat. Preservar únicamente manifiesto/IDs/resultados no secretos; nunca dumps de identidad con verificadores, tokens o claves.

No se entrega un comando de activación ni un hash de receptor inexistente.

## 8. Validación de esta etapa

- Inspección estática del arnés/supervisor y comparación de sus hashes con el informe operativo.
- Inventario de 27 fuentes, cuatro dependencias directas y 23 paquetes declarados para win32/x64; 23/23 versiones declaradas coincidentes con el lock.
- Lectura de atributos/DACL/propietario de seis ancestros nominales y comprobación de ausencia del destino; sin cambios.
- **Cuatro pruebas focalizadas aprobadas**, cero fallidas, 63 casos de esos archivos fuera de selección. No se suman a las 187 pruebas históricas para inventar un total nuevo:

```powershell
# Desde backend, solo los casos expresamente seleccionados:
node --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run --config vitest.config.js --configLoader native --pool threads tests/sync/durable-revocation-atlas-preflight.test.js tests/sync/durable-revocation-operational.test.js --testNamePattern '^(RC01 |RC02 |RC07 |OL19 )'
```

Esos casos prueban bloqueo remoto, esquema/IDs fijos, ausencia de reprovisión y rechazo antes de consumir secretos. No ejecutan el lanzador A36, consultas ACL de tests, Mongo real, receptores ni carreras remotas.

## 9. Condiciones que realmente faltan

1. Paquete mínimo real con lockfile propio y cierre ejecutable/nativo verificado; actualmente solo existe su inventario/procedimiento.
2. Una referencia de procedencia independiente y contraste de bytes de fuentes, dependencias y binding Argon2, incluida explicación de la discrepancia 2.2.2/2.1.0 y de sus rutas de carga.
3. Comprobar los permisos/rutas/estabilidad de los objetos nuevos y justificar protección durante ejecución y riesgo del mismo usuario. La DACL del padre es evidencia parcial, no certificación del futuro canal.
4. Un entrypoint/capacidad C.2 y lanzador nuevos, probados offline, que compongan exclusivamente el paquete y supervisor revisados sin resolver módulos desde el proyecto.
5. Autorización independiente para una única activación real, revalidación remota previa de inventario/permisos y procedimiento de reconciliación/limpieza/rotación acotado.

No son bloqueos nuevos del arnés ya resuelto ni se debe repetir C.1/C.2A. A36 no bloquea por sí misma; B00 y el paquete no acreditado sí impiden afirmar que la recepción de una contraseña sea suficientemente controlada ahora. No se exige una VM para cerrar estas condiciones.

## Anexo A — Fuentes del cierre estático candidato

Rutas relativas a backend. Huellas puntuales sin valor de certificación de procedencia.

| Fuente | SHA-256 |
|---|---|
| scripts/durable-revocation-atlas-harness.js | 05F0FB304D3E9DA248B56B24C4284D865A4082474507F2C828D6EF95F8294889 |
| scripts/durable-revocation-runtime.js | C9E097486F9F457BB116CE9345D86E4681F58B7ADFCD2413CE409CA3DFD11CBA |
| src/config/jwt.js | 1F6993954045B9FC80A1D603E4D096E86619FEF0771CAB3CCE9459F1B7BB45D4 |
| src/middleware/rate-limiter.js | A102751645195CE7F2B581B0509A310573B1FDBF0D30BB741052B1C73FDC5CB9 |
| src/middleware/sync-auth-context.js | 007A6C8F54413B4F8CA7E7E28CF4D398C7B01564A8D458E34AB37826EE8E4A50 |
| src/modules/auth/auth-service.js | 96D2994BA70EDF75DC930055F1AF438BFD636AAD9D370325D926B0AB138F41A1 |
| src/modules/auth/credential-hasher.js | E07D4BDC0C9DECC8C1D64B47BFB0D01F00FED5A157998108C69BD13F9FD121B3 |
| src/modules/auth/identity-repository.js | 787D7FE12C3DE42F3F770D81B938CD74BE33775C93EEFA68CDAC245DB3D3E959 |
| src/modules/auth/jwt-service.js | 79350D4BC1B9C776327C508426F6CD5A0622DA0134F2BCDE385DFC47A79EA0E9 |
| src/modules/auth/mongo-identity-models.js | AA0ACC6E37A9F4AAB229FE9D1170C09B5D83C59E0C77D671C5E05AE172AA9101 |
| src/modules/auth/mongo-identity-repository.js | 03AFB155A589A73DC70B52B11E88B59BF40D4EC93A47781FD9362D5C0A046E17 |
| src/modules/identity/identity.js | 7D1BF8228027795FDC6E6DD83D8EE00031E21A817CABD823822F4334256347A5 |
| src/modules/sync/atlas-credentials.js | 1199F0465275BDDE44BDAE004FFCDEE0C6C8E31C3ECAF6DCDC2C5CE3B9E3AC57 |
| src/modules/sync/atlas-integration.js | D2C76E5A2957A9548E77AB4F672CD498B2153BC55E61B639A7558A05E417966D |
| src/modules/sync/atlas-policy.js | DB0FB9974DEE73764C6D462251CCE921DE828019C24A7BF9CA8A9A7541646E42 |
| src/modules/sync/budget.js | BE4A5C15D9D456859A12CC1EBA9C3FB0CE3E3C0886FE3E0953DB35DD5A24F5DB |
| src/modules/sync/canonical-envelope.js | 36042E339DD6CAE539CFC7EFA0D76D5B244532F94700C04CD0D4DAC73370C829 |
| src/modules/sync/errors.js | AA8509F697E3C04D5CF84ACAD9EC9FDD1B265DD5C3BF62AE90B0B0EBFEA77B33 |
| src/modules/sync/ingestion-engine.js | ACF5E0320B8211294FC28FC5065EED2D872D2C4B11A8B789898AA2BB1FACB017 |
| src/modules/sync/ingestion-repository.js | 8133AD64E19108715591BD1131F41A6C39279C388B5B0AEDD998FF3059079E86 |
| src/modules/sync/ingestion-service.js | 94A49965C258C555CB8304693CA7CE9D2ABA7A034D723956DD8CBA420D29E44B |
| src/modules/sync/mongo-ingestion-repository.js | 6E7062019EEDB452A3BB874C0993D05CE235FAE34AE97A0AC69E56E6A05DFE43 |
| src/modules/sync/mongo-models.js | E9FE4E984E9F009D26AD1FB7C03FFCF0EB9C6E4F80628C9C94CCF071A42D9729 |
| src/modules/sync/relations.js | 215004D399846A97D4F8F30A5BB24DBFB3EF455703DAA2DBAA3733776B8A609D |
| src/modules/sync/schemas.js | 842B8C48BE1210D2DFCC9296EA2BDB1E2E5BF54F504E2C9651BEAD701B41D069 |
| src/utils/errors.js | 4D580B337E328BD502D2FB4E7832518499AA46B10DAC4F524AE843EAD2CB27FB |
| src/utils/work-pool.js | 31C75336AF18F6B15369A1736A7C1EACFE8768018714847195B13629FFF3036B |

## Anexo B — Cierre de paquetes declarado para win32/x64

Incluye metadatos transitivos y opcionales compatibles. No es una auditoría archivo por archivo ni un cierre DLL certificado.

| Paquete | Versión fijada |
|---|---|
| @mongodb-js/saslprep | 1.6.1 |
| @node-rs/argon2 | 2.2.2 |
| @node-rs/argon2-win32-x64-msvc | 2.2.2 |
| @standard-schema/spec | 1.1.0 |
| @types/webidl-conversions | 7.0.3 |
| @types/whatwg-url | 13.0.0 |
| bson | 7.3.3 |
| jose | 6.2.13 |
| kareem | 3.4.1 |
| memory-pager | 1.5.0 |
| mongodb | 7.7.0 |
| mongodb-connection-string-url | 7.0.2 |
| mongoose | 9.11.2 |
| mpath | 0.9.0 |
| mquery | 6.0.0 |
| ms | 2.1.3 |
| punycode | 2.3.1 |
| sift | 17.1.3 |
| sparse-bitfield | 3.0.3 |
| tr46 | 5.1.1 |
| webidl-conversions | 7.0.0 |
| whatwg-url | 14.2.0 |
| zod | 4.6.7 |

## Detención

El único entregable creado o editado es este informe; el runner puede actualizar su caché interna de pruebas. No se modificó código, documentación histórica, permisos, propietarios, Godot o SQLite. No se creó el directorio C2Runtime ni se abrió backend/.env o recalcularon hashes de recursos protegidos. No hubo conexión Atlas, credenciales recibidas, instalación npm, receptor nuevo, C.2, F.2 o B05.5.

**Conclusión: BLOQUEADO.**
