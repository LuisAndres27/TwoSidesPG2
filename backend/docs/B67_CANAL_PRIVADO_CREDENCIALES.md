# B67 — Despliegue local del canal privado de credenciales

Fecha: 2026-11-03, Guatemala. **Ensayos automatizados PASS; Accept manual reportado FAIL, causa no determinada. Canal NO APTO para credenciales reales.** Cancel manual sigue sin confirmar. La sección 9 registra el diagnóstico posterior, sin cambios de scripts o sellos. Revisados B64, B65 y el contraste externo posterior de B66.

No se conectó Atlas, creó usuario/rol, introdujo contraseña real, activó v5, inició Express/Caddy, instaló certificado, abrió `.env` o SQLite real, modificó Godot, cuotas, F1/F2 o C2Runtime. Sin commits ni push. No se emitió ni consumió una autorización remota. Los cuatro componentes contrastados en B66 permanecen byte a byte intactos.

## 1. Despliegue realizado

```text
C:\Users\luis2\AppData\Local\TwoSides\AtlasV2FirstRead\aeec6c0d34394a65817de04755d88535
```

Se creó únicamente el contenedor nuevo `AtlasV2FirstRead` y el directorio exclusivo de este run bajo el `TwoSides` existente. Se estableció la **DACL privada inicial de esos directorios nuevos** durante su creación, sin cambiar ACL/propietarios de objetos existentes, del proyecto, manifiestos o perfil. No se ejecutaron auxiliares históricos de permisos.

Los cuatro artefactos de primera lectura y el manifiesto se copiaron **de la descarga B66 contrastada**, no de una release anterior ni de archivos secretos. Se añadieron dos componentes de ensayo exclusivamente sintético y un registro de despliegue sin secretos.

| Archivo desplegado | SHA-256 |
|---|---|
| `gate.mjs` | `E1FA695193BB716DC45DB24DC27F9B36625CBB5E1313391D87071040D3F8A695` |
| `probe.mjs` | `FB7B63C429C3CDE1055561038173068E0525F247F70EE064B8D248832B032080` |
| `receiver.mjs` | `11FC67BC135EF4CCAC0A8623EC5529818A400829FE12D428DA68AE3473C13354` |
| `send-first-read.ps1`, B66 | `21AB67270D8EB7F6EE50B06B38298EC6DB9628E70EC1377D073F8C0DED7EBBDE` |
| `v5-reference.json`, copia de candidato | `2A4956E951217DFF2501D3FFBD35C9024554166E9126AD0134D8FB58C77AD726` |
| `offline-receiver.mjs`, B67 | `4C96280821292EF01F961E1B2C8BD81B31FA6ACF66802756CFBD8A92F9AD4F6E` |
| `offline-selftest.ps1`, B67 | `97033A3435EAEB5A71D23CBD6404CEA6668312A4C70E4DB1A24E0AB2412F885D` |
| `deployment.json`, sello local B67 | `A9372F1B662F7244E5236D965AC7D77020467D3779ABF07FEC3634521711AA08` |

**Inventario posterior: exactamente esos ocho archivos.** No hay `authorization.json`, `used.json`, `result.json`, contraseña, frame de credenciales, clave o SQLite. El sello contiene nombres/hashes, runId, fecha, raíz backend, Node y `remoteEnabled:false`; no es una autorización de primera lectura ni una firma digital.

Fuentes nuevas en el workspace, todas **fuera del ámbito v5**:

- `backend/tools/atlas-v2-first-read/b67/prepare.ps1`: comprobación de fuentes/ancestros y creación del despliegue nuevo sin sobrescribir objetos existentes.
- `backend/tools/atlas-v2-first-read/b67/offline-selftest.ps1`: ensayo de entrada oculta y transporte del texto público fijo.
- `backend/tools/atlas-v2-first-read/b67/offline-receiver.mjs`: receptor sin driver ni capacidad remota; solo preflight o recepción sintética.
- `backend/tests/sync/b67-deployed-channel.test.js`: negativos sobre copias desechables y comprobación de staging intacto.
- Este informe.

No se modificaron fuentes cubiertas por v5 ni los artefactos originales B64/B66; no fue necesario generar otro manifiesto ni cambiar referencias aprobadas de producción. Los dos componentes nuevos de ensayo tienen sello local propio y **no se presentan como parte de la custodia externa B66**. No se usan para recibir contraseñas reales.

## 2. Permisos y entorno inspeccionados

Se consultaron en lectura exclusivamente los objetos necesarios: perfil del usuario, AppData/Local, `TwoSides`, referencias de integridad, nuevos directorios/archivos, ancestros `C:\`/`C:\Users` y directorio/ejecutable Node. No se recorrió recursivamente el perfil ni se leyeron almacenes de secretos.

- Propietario del run y sus ocho archivos: usuario Windows actual.
- DACL del run: **protegida**, FullControl solamente para usuario actual, SYSTEM (`S-1-5-18`) y Administrators (`S-1-5-32-544`). Los ocho archivos heredan únicamente esos tres principales.
- AppData/Local/TwoSides: sin permisos adicionales de escritura en los objetos inspeccionados. El perfil protegido del usuario corta herencias más amplias de ancestros superiores.
- Las entradas de recorrido/lectura o creación de carpetas en ancestros superiores no se confundieron con permiso de leer/reemplazar estos archivos privados. La entrada de capacidad observada en el perfil permite solo recorrido/sincronización, sin herencia de acceso a estos datos.
- Rutas del despliegue sin reparse points; archivos regulares sin hardlinks detectados por las verificaciones nativas y del receptor de ensayo.
- Node utilizado: `C:\Program Files\nodejs\node.exe`, SHA-256 `3602F2BB1A10F2CBAB4C36886218A33C1AB3DB87290E73B033C46C77147D0237`. Propietario SYSTEM; escritura para SYSTEM/Administrators, otros permisos observados de lectura/ejecución.

Esto acredita el alcance local inspeccionado, **no un aislamiento frente al propio usuario, administradores, SYSTEM o software ya comprometido**. No se verificó la firma del distribuidor mediante servicios externos ni se hizo una auditoría general del sistema. El hash de Node conserva una referencia local del ejecutable usado; no demuestra por sí mismo su procedencia.

## 3. Separación del ensayo y del canal real

### Ensayo B67

El único texto aceptado es el **sentinela público** `B67-ONLY-FAKE-2026!`. Cualquier otro valor se rechaza sin mostrarlo. No introducir aquí una contraseña real.

Antes del prompt, el script comprueba ubicación, DACL, propietario, rutas, sello esperado, hashes de los siete archivos del sello y de Node; mantiene handles de lectura sin compartir escritura/eliminación. A continuación ejecuta el preflight del receptor sintético, que valida nuevamente los artefactos y el backend contra la copia **candidata** v5. Solo después permite la entrada oculta.

El uso de `v5-reference.json` está limitado a **este ensayo offline sin driver**. No cambia el manifiesto instalado ni proporciona un parámetro alternativo al receptor real. El modo Automation genera únicamente el sentinela público o un SecureString vacío; no acepta una contraseña arbitraria por argumentos/entorno.

En Accept, se compara el valor por unidades de caracteres, se construye el frame UTF-8 estricto y se liberan BSTR/SecureString y arrays de conversión antes del proceso receptor. El frame viaja solo por stdin y se borra después de enviarlo; el receptor consume/destruye su handle y buffers. En Cancel se requiere pulsar Enter vacío; no se inicia el receptor de datos. Los procesos de preflight sí se ejecutan antes de ambos modos y se cierran.

El receptor sintético no importa Mongoose, no tiene URI ni operaciones DB, bloquea llamadas a sockets/DNS durante la recepción y admite únicamente `--preflight` o `--receive-synthetic` con el digest de despliegue. No hay flag para activar Atlas. Devuelve exclusivamente booleanos/códigos sanitizados; no registra el texto ni un hash de contraseña.

### Primera lectura real futura

Los cuatro archivos originales conservan su política B64/B66: cuenta exacta `twosides_backend_v2`, base `two_sides_db`, host esperado, `admin`, **SCRAM-SHA-256**, TLS estricto y autorización de primera lectura de uso único. No admiten cuentas anteriores como fallback ni mecanismos alternativos. La lista de lecturas se mantiene acotada a identidad/permisos, hello, catálogo, siete índices y la semilla proyectada del fence, máximo 11 comandos; sin modelos, HTTP, escrituras o DDL.

La entrada real sigue requiriendo el manifiesto **instalado** v5 y una autorización real vigente antes de recibir credenciales. Hoy falta esa autorización y el instalado sigue siendo v4: el rechazo es el comportamiento correcto. `remoteEnabled:false` pertenece al arnés sintético; no se lo presenta como una barrera adicional implementada dentro del receptor original. Las barreras reales son su autorización, integridad, destino/política y preflight obligatorios.

## 4. Pruebas ejecutadas

### Despliegue real, sin interacción

Se ejecutó `offline-selftest.ps1 -Automation`, con sello fijado:

```text
B67_SELFTEST=PASS mode=Accept syntheticOnly=True cleanup=True
B67_SELFTEST=PASS mode=Cancel syntheticOnly=True cleanup=True
```

Ambos procesos terminaron con código 0. En Accept el receptor verificó igualdad exacta, `argvLeak:false`, `envLeak:false`, `networkAttempts:0` y `remoteEnabled:false`; el wrapper solo imprimió el PASS público. Cancel cerró sin transmitir un frame.

Negativos adicionales sobre entradas reales, sin modificación de archivos:

- Receptor original desplegado, `--preflight-only` con digest ficticio y sin autorización: **rechazo esperado**, código 1, mensaje fijo, sin recibir credenciales.
- Ensayo desplegado con digest de sello incorrecto: **rechazo esperado antes del prompt**, código 1, mensaje sanitizado.

### Batería seleccionada

```powershell
# Desde backend:
node --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run --config vitest.config.js tests/sync/b67-deployed-channel.test.js tests/sync/b66-private-channel.test.js tests/sync/atlas-v2-first-read.test.js tests/sync/main-credential-channel.test.js
```

**4 archivos PASS, 76 pruebas PASS, cero fallos, código 0; 12,27 segundos.** No se ejecutaron C.2, F.2 ni la batería completa de campañas históricas.

Los ocho casos nuevos B67 comprueban alteración de código, manifiesto alterado incluso si se recalcula su hash en el sello ficticio, sello incorrecto, parámetros extra, SHA-1 solicitado como argumento inesperado, intento de habilitar remoto, rechazo de una entrada ficticia distinta del sentinela e inventario/hash original del despliegue intacto. Todos los ataques con cambios de archivos se hicieron en **copias desechables**, nunca en el directorio desplegado o el árbol protegido.

Los 68 casos existentes cubren además política efectiva SCRAM/TLS, credenciales ficticias, permisos insuficientes/excesivos, integridad antes de recepción, transporte UTF-8, cancelación simulada, buffers, errores, uso único y cierre. El parser real del driver se prueba con conexión interceptada, no con Atlas.

### Comprobación interactiva pendiente

**Actualización posterior:** el propietario confirmó hashes coincidentes, pero reportó `B67_SELFTEST=FAIL` en Accept; Cancel no está confirmado. No recuerda con certeza si pulsó Enter. No se infiere por ello una entrada incorrecta ni un defecto de SecureString. Automation no demuestra la apariencia del prompt ni una cancelación manual; no se declara un PASS de Ctrl+C real. El modo Cancel documentado utiliza Enter vacío. El propietario solicitó un nuevo intento: se prepara únicamente un Accept manual con el script intacto, no una repetición automática. Véase sección 9.

## 5. Procedimiento exacto de comprobación manual sintética

En PowerShell local del propietario, sin transcripción de credenciales. Son valores públicos; no escribir ninguna contraseña real.

```powershell
$b67Dir = 'C:\Users\luis2\AppData\Local\TwoSides\AtlasV2FirstRead\aeec6c0d34394a65817de04755d88535'
$b67Test = Join-Path $b67Dir 'offline-selftest.ps1'
if ((Get-FileHash -LiteralPath $b67Test -Algorithm SHA256).Hash -ne '97033A3435EAEB5A71D23CBD6404CEA6668312A4C70E4DB1A24E0AB2412F885D') { throw 'Ensayo distinto del revisado' }
if ((Get-FileHash -LiteralPath (Join-Path $b67Dir 'deployment.json') -Algorithm SHA256).Hash -ne 'A9372F1B662F7244E5236D965AC7D77020467D3779ABF07FEC3634521711AA08') { throw 'Despliegue distinto del revisado' }
powershell.exe -NoProfile -File $b67Test -Mode Accept -DeploymentSha256 a9372f1b662f7244e5236d965ac7d77020467d3779abf07fec3634521711aa08
powershell.exe -NoProfile -File $b67Test -Mode Cancel -DeploymentSha256 a9372f1b662f7244e5236d965ac7d77020467d3779abf07fec3634521711aa08
```

En **Accept**, introducir únicamente `B67-ONLY-FAKE-2026!` y pulsar Enter; confirmar que no se muestran los caracteres. En **Cancel**, pulsar Enter sin escribir. Esperar los dos PASS y retorno de la consola. Comunicar solo esos resultados públicos y si la entrada quedó oculta; no copiar una contraseña o contenido de stdin al chat.

Si hay FAIL, sello diferente, prompt inesperado o consola que no vuelve, no intentar con credenciales reales ni habilitar Atlas. Registrar solo el estado genérico y detenerse. No modificar el sello para silenciar una diferencia.

## 6. Límites comprobados de exposición y almacenamiento

- El circuito previsto es consola Windows del propietario → SecureString/BSTR → frame en RAM → stdin anónimo → memoria Node. No hay una llamada a una herramienta conversacional que transporte el valor ni un endpoint que lo envíe al asistente.
- En los ensayos se verificó ausencia en argv/entorno/salidas. Lo único solicitado al propietario para el chat es el PASS/FAIL público. **No se puede demostrar universalmente ausencia de capturas por software externo, herramientas de depuración del mismo usuario o administradores.**
- No se persisten frames, contraseñas, hashes reutilizables de contraseñas ni dumps. Las fuentes contienen únicamente el sentinela público ficticio. Los ocho archivos conservados son código y referencias públicas; la lista/hash se comprobó después de los ensayos y no aparecieron archivos nuevos.
- Las copias de ataques de tests se crean en carpetas temporales exclusivas con datos públicos/ficticios y se eliminan archivo a archivo y luego sus directorios; no se usan como canal de secretos reales. Las pruebas B66 también limpian sus cuatro archivos ficticios. Ninguna SQLite se abre.
- Se limpian buffers y BSTR, y se desecha SecureString. No se promete borrado verificable de strings administrados, RAM del driver, swap/volcados o procesos comprometidos.
- El directorio privado evita permisos heredados del proyecto en los artefactos desplegados; no aísla del propio usuario Windows, SYSTEM o administradores. B00 continúa pendiente en ese modelo de confianza. La custodia OneDrive de B66 es nueva y declarada por el propietario, no una prueba de seguridad histórica del equipo.

## 7. Integridad v5/v4 al terminar los ensayos automatizados

```text
v5 SHA-256: 2A4956E951217DFF2501D3FFBD35C9024554166E9126AD0134D8FB58C77AD726
v5 treeDigest: 1f3f507348a479d88362767e9e548200003d646ad8930f54cbfc9efc6a9f8c28
v5: PASS, 3172 archivos, cero diferencias, código 0
Instalado: v4, SHA-256 7DEC55E3E1053F7F63A0D2B859ACB0A56FF931E82DB7BBB2625734326D6C3E8B
Respaldo pre-B60 y v4: PASS, 3169 archivos, cero diferencias, código 0
```

La referencia v4 del respaldo coincide con la instalada; la verificación usó el manifiesto externo y la raíz del código respaldado. No se restauró código ni se sobrescribió v4. Los ensayos no modifican partidas o cuentas existentes y no importan las 2151 operaciones de la cola real.

## 8. Uso futuro, cierre y recuperación

Antes de cualquier primera conexión real:

1. Completar y registrar la comprobación interactiva sintética, sin fallos. Ante un fallo mantener **NO APTO** hasta resolverlo; un PASS local no valida Atlas.
2. Autorizar por separado la activación v5 conforme B63, con sus respaldos y contraste B66. Volver a verificar código, referencias, DACL/rutas y Node inmediatamente antes de recibir secretos.
3. Autorizar/configurar manualmente el rol/cuenta candidatos con privilegios exactos y restricciones de clúster/red; conservar cuentas anteriores sin usarlas como fallback. Ninguna cuenta fue consultada o alterada en B67.
4. Preparar una autorización nueva y exclusiva de primera lectura, ventana máxima 15 minutos, destino/política fijados y cuatro hashes B66. No reutilizar un canal consumido ni convertir `deployment.json` en autorización. El staging de ensayo B67 no concede permiso remoto; un run real tendrá identidad/vida propias y se volverá a verificar.
5. Solo entonces entregar el comando final del launcher original con rutas/hashes concretos, Node verificado y digest de autorización, siguiendo B64/B66. El propietario activará manualmente ese único intento e introducirá la contraseña solo tras el preflight de **v5 instalado**, nunca en el ensayo B67, chat, URI o argumentos.

Al cerrar: esperar el proceso, cerrar stdin, limpiar buffers/handles y cerrar conexiones en finally. Los ensayos no crean listeners ni servidores; sus hijos Node/PowerShell terminaron con código 0. Un timeout del wrapper mata únicamente su proceso hijo y se informa como fallo, sin reintento automático ni promesa de cierre ordenado.

Ante alteración de hash/permisos: detener antes del prompt, conservar solo evidencia sanitizada y reconstruir en un directorio **nuevo** desde referencias aprobadas, sin sobrescribir o reparar automáticamente el actual. No cambiar ACL existentes para forzar PASS. Los archivos actuales se conservan para la comprobación manual; no contienen credenciales. Cualquier eliminación posterior debe acotarse a sus ocho archivos y directorios nuevos, nunca a `TwoSides` o al perfil completo, y no forma parte de esta fase.

**Estado actual: desplegado; Accept manual fallido y causa no determinada. NO APTO para introducir credenciales reales.** No activar v5, comenzar B00, conectar Atlas o arrancar otro servicio a partir de este informe.

## 9. Diagnóstico del FAIL manual — sin modificar el canal

### Evidencia recibida y comprobaciones nuevas de solo lectura

El propietario reportó hashes correctos de `offline-selftest.ps1` y `deployment.json`, Accept FAIL y Cancel sin confirmar. Ante la pregunta de si el error ocurrió antes del prompt o después de Enter, indicó no recordarlo con certeza y solicitó un nuevo intento. **No se recibió, solicitó, leyó ni registró el contenido introducido.**

Se inspeccionaron las fuentes, pruebas anteriores y estado actual, sin ejecutar de nuevo el prompt ni el receptor de datos:

- Selftest: SHA `97033A3435EAEB5A71D23CBD6404CEA6668312A4C70E4DB1A24E0AB2412F885D`, coincide.
- Sello: SHA `A9372F1B662F7244E5236D965AC7D77020467D3779ABF07FEC3634521711AA08`, coincide.
- Los siete archivos enumerados por el sello coinciden; Node coincide con su hash registrado.
- Inventario privado: los mismos ocho archivos, sin adicionales. Consultas acotadas de metadatos de seguridad: cero discrepancias de propietario, DACL o reparse points en los objetos comprobados; no se alteraron permisos.
- Verificación independiente en lectura del backend contra `v5-reference.json` desplegado: **PASS, código 0**. No se activó ese manifiesto ni se ejecutó la sonda remota.

Estas observaciones descartan una diferencia **actual** en los objetos comprobados. No reconstruyen las condiciones transitorias de la consola/procesos durante el intento manual fallido. No se reejecutaron las 76 pruebas para presentar un PASS automatizado como explicación de ese intento.

### Requisitos exactos y ramas del script

Accept exige el texto sintético público `B67-ONLY-FAKE-2026!`, carácter por carácter y con coincidencia de mayúsculas. No recorta ni normaliza espacios o signos; una entrada distinta debe rechazarse. Se convierte SecureString mediante BSTR, se conserva el orden de unidades UTF-16 y se usa UTF-8 estricto. No se encontró una transformación que añada o quite caracteres en ese recorrido; sus ensayos con datos ficticios habían pasado.

`Mode` tiene ValidateSet Accept/Cancel. Cancel exige entrada vacía y no inicia el receptor de datos; Accept ejecuta comparación, framing, envío y comprobación de respuesta. **No se encontró confusión entre ambas ramas.** El modo Automation construye el SecureString a partir del sentinela conocido, mientras el modo manual usa Read-Host; el PASS de Automation no verifica el teclado/paste, el host o la interacción manual.

No pulsar Enter normalmente deja Read-Host esperando, **no produce por sí solo este FAIL**. No se atribuye el fallo a esa omisión sin evidencia. Tampoco se atribuye al usuario una entrada distinta: no se conoce qué recibió el script y no se intentará recuperarlo.

### Causa disponible y causas no descartadas

**Causa del fallo manual: NO DETERMINADA.** El catch actual transforma todos los fallos en el mismo mensaje y no conserva una etapa pública. Este límite de diagnóstico está demostrado en el código; no demuestra un defecto de transporte o lectura de SecureString.

Siguen siendo posibles: entrada distinta del sentinela; excepción de lectura/host de consola; error de conversión; fallo o timeout de arranque/preflight/recepción; o respuesta del hijo que no cumpla el contrato. Los hashes correctos del script/sello no distinguían esas ramas. Los controles locales actuales pasan, pero un problema transitorio durante aquel intento no queda descartado.

No corresponde cambiar SCRAM/TLS, permisos, el texto esperado, normalizar la entrada o aceptar cualquier SecureString para conseguir un PASS. El ensayo no autentica contra Atlas: contraseñas/cuentas remotas no explican directamente este resultado.

### Propuesta mínima de diagnóstico — NO implementada

Si el nuevo intento autorizado vuelve a fallar, proponer antes de editar una variable de **etapa fija** y códigos públicos allowlisted en `offline-selftest.ps1`, conservando su validación y finally. Ejemplo de salida segura:

```text
B67_SELFTEST=FAIL mode=Accept stage=synthetic-validation code=SYNTHETIC_INPUT_MISMATCH
```

Otras etapas acotadas: controles locales, preflight, lectura oculta, conversión/framing, arranque de receptor, envío, respuesta y cierre. No imprimir entrada, longitud observada, posición/caracteres diferentes, hashes de entrada, exception.Message, stack, objetos de configuración o stderr bruto. Para un fallo anterior a la entrada, reportar solo el código de precondición; para un hijo rechazado, solo códigos públicos de su contrato.

**Impacto de implementarlo:** cambiaría el hash aprobado del selftest `97033A…885D`; al actualizar su entrada en `deployment.json`, cambiaría también `A9372F…AA08`. No se pueden anunciar hashes nuevos antes de construir esos bytes. Habría que preparar una versión/directorio nuevos, preservar el despliegue anterior, probar y registrar/aprobar sus referencias antes de repetir el ensayo. Los cuatro artefactos originales B66 y el manifiesto backend v5 no necesitarían cambiar; el auxiliar está fuera del árbol protegido. No se hizo esa modificación ni se recalculó/reemplazó ningún sello aquí.

### Nuevo intento solicitado por el propietario

Se ofrece **un único Accept manual**, con el script y los hashes actuales intactos. Ejecutar la invocación sola, sin pegar a continuación el comando Cancel ni otras órdenes que puedan interferir con la entrada interactiva. Esperar el prompt, escribir solamente el sentinela público y pulsar Enter una vez. No utilizar una contraseña real.

Registrar únicamente: si apareció el prompt, si se pulsó Enter y el resultado PASS/FAIL público, incluido si el FAIL fue antes o después del prompt. No copiar la línea de entrada al chat. Si falla, detenerse sin repetir; entonces valorar la instrumentación propuesta mediante una autorización posterior. Cancel manual continúa pendiente hasta que se ensaye y confirme por separado.

**Sin modificaciones de código, hashes, credenciales, v5, datos o cuentas. Diagnóstico concluido; no se habilita Atlas ni se declara el canal apto.**
