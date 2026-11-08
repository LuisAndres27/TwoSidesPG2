# B66 — Bloqueos previos a B00

Fecha: 2026-11-03, Guatemala. **Preparación y pruebas locales realizadas; contraste posterior de la descarga externa PASS. Canal real todavía no desplegado/certificado.** Revisados el procedimiento oficial de B62/B63, el prevuelo B65 y los mecanismos B64 de entrada, transporte, integridad y cierre. La sección 7 registra la recuperación manual confirmada por el propietario y las comprobaciones posteriores.

No se conectó Atlas, creó un usuario/rol, recibió un secreto real, activó v5, inició el backend principal/Express/Caddy, instaló certificados, abrió `.env` o SQLite real, modificó Godot, cuotas, F1/F2 o manifiestos. Sin F3.10, commits ni push. No se generó ni consumió una autorización real ni se reutilizó un canal anterior.

## 1. Estado de los dos bloqueos

| Bloqueo | Resultado |
|---|---|
| Referencia externa independiente | **CONTRASTE VERIFICADO — custodia nueva B66.** Cinco archivos descargados coinciden con originales y referencias previas; manifiesto PASS, 3172, cero diferencias, código 0. Procedencia OneDrive declarada por el propietario; límites en sección 7 |
| Canal desplegado y certificado | **PENDIENTE.** Se corrigió la retención innecesaria del secreto y se cerró la brecha de ensayos de transporte/error/cancelación; no se declara certificado un despliegue inexistente |

**Qué se resolvió:** la preparación verificable del transporte y sus caminos de error/cancelación simulada; el BSTR y SecureString ahora se liberan antes de iniciar el receptor, no después de esperar su finalización. Posteriormente se completó el contraste de la nueva referencia externa con las limitaciones declaradas en sección 7. **Permanece el bloqueo de despliegue/certificación del canal.** No se infiere autorización de activación o conexión de ninguno de estos resultados.

## 2. Integridad y reversión preservadas

Verificación después de la corrección y pruebas, con el bootstrap B64 y el verificador oficial:

```text
Candidato: %LOCALAPPDATA%\TwoSidesMainIntegrity\backend-integrity-manifest.v5-B62.json
SHA-256: 2A4956E951217DFF2501D3FFBD35C9024554166E9126AD0134D8FB58C77AD726
treeDigest: 1f3f507348a479d88362767e9e548200003d646ad8930f54cbfc9efc6a9f8c28
Resultado: PASS, 3172 archivos, cero diferencias, código 0
```

El instalado continúa siendo v4, `%LOCALAPPDATA%\TwoSidesMainIntegrity\backend-integrity-manifest.json`, SHA-256:

`7DEC55E3E1053F7F63A0D2B859ACB0A56FF931E82DB7BBB2625734326D6C3E8B`.

Coincide con `local-persistence/.work/pre-B60-abe56b01/v4-reference.json`. Se verificó nuevamente el código del respaldo `local-persistence/.work/pre-B60-abe56b01/backend/` usando la referencia instalada y el ancla v4: **3169 archivos, cero diferencias, código 0**. No se ejecutó/restauró ese código ni se alteró la referencia instalada. Revertir solo el manifiesto no permite arrancar el código B60 con v4: una reversión operativa exige también el paquete correspondiente y autorización propia, como indica B63.

Archivos afectados por B66:

- Modificado únicamente `backend/tools/atlas-v2-first-read/send-first-read.ps1`, fuera del ámbito protegido v5.
- Nuevo `backend/tests/sync/b66-private-channel.test.js`, fuera del ámbito v5.
- Nuevo este informe, fuera del ámbito v5.

No fue necesario editar src/scripts/dependencias ni detenerse por un cambio del árbol protegido. No se modificó v5 para acomodar el cambio del launcher. Los informes B64/B65 conservan sus hashes históricos; para el launcher actual se deberá usar la referencia B66 siguiente.

## 3. Referencia independiente que debe contrastar el propietario

Al preparar B66, B62/B63/B65 no identificaban una copia v5 ya recuperada y contrastada. Las descargas verificadas de C.2 pertenecen a otra release; no sirven como referencia de este backend. Los valores comunicados por el propietario antes de B66 son anclas aprobadas para SHA/tree de v5, separadas de esta ejecución. Ahora se cuenta además con la recuperación nueva declarada y contrastada en sección 7; no se le atribuye una custodia anterior.

La referencia utilizable es una copia sin reserializar del manifiesto v5 custodiada fuera del árbol/equipo, con procedencia/versionado del medio externo y hashes aprobados conservados por separado. Los artefactos del canal también necesitan custodia/contraste propios porque no están protegidos por v5.

Si esa copia ya existe: **recuperarla, no reemplazarla por una copia recién calculada**, e informar su origen/ruta. Si no existe: establecer una custodia nueva de forma explícita y conservar los valores aprobados fuera del workspace; no presentarla como evidencia anterior a B66. Crear custodia hoy no demuestra retroactivamente la seguridad del equipo o la procedencia histórica del código.

### Procedimiento manual solicitado y posteriormente aplicado

1. Conservar por separado del paquete los SHA/tree aprobados de v5 de B62 y del mensaje del propietario. Para el launcher modificado, revisar y aprobar la referencia B66; es un artefacto nuevo respecto de B64 y requiere aprobación de su hash, no se hereda automáticamente la anterior.
2. Si aún no se custodiaron, subir manualmente a la nube bajo control del propietario **solo estos cinco archivos**, conservando nombres y bytes:

| Archivo | Origen local exacto |
|---|---|
| `backend-integrity-manifest.v5-B62.json` | `C:\Users\luis2\AppData\Local\TwoSidesMainIntegrity\backend-integrity-manifest.v5-B62.json` |
| `gate.mjs` | Carpeta de herramientas indicada debajo |
| `probe.mjs` | Misma carpeta |
| `receiver.mjs` | Misma carpeta |
| `send-first-read.ps1` | Misma carpeta; **versión actual B66** |

Carpeta de herramientas:

```text
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\tools\atlas-v2-first-read
```

3. Descargar los cinco desde ese medio externo a una carpeta nueva, por ejemplo `C:\Users\luis2\Downloads\TwoSides_B66_Referencia`. Descargar los originales; no abrirlos en un editor y guardarlos de nuevo. No reemplazar archivos de origen ni releases.
4. Comunicar **ruta local exacta, origen de la descarga y si la custodia era previa o acaba de establecerse**. No enviar contraseñas, `.env`, SQLite, claves JWT o privadas. Se solicitó esta información mediante la pregunta pendiente de B66.
5. Tras recibir esa evidencia, localizar los cinco archivos, comprobar archivos/rutas normales, comparar sus bytes/hashes con las referencias aprobadas y verificar el manifiesto descargado con su digest recuperado y contrastado. Exigir 3172 archivos, cero diferencias y código 0; cualquier discrepancia detiene el procedimiento sin reemplazar nada.

Comandos locales de lectura para cuando exista la descarga real, sin ejecutar receptor ni contactar Atlas:

```powershell
$b66Descarga = 'C:\Users\luis2\Downloads\TwoSides_B66_Referencia'
$b66Nombres = @('backend-integrity-manifest.v5-B62.json','gate.mjs','probe.mjs','receiver.mjs','send-first-read.ps1')
foreach ($b66Nombre in $b66Nombres) {
    Get-FileHash -LiteralPath (Join-Path $b66Descarga $b66Nombre) -Algorithm SHA256 -ErrorAction Stop
}
$b66Manifiesto = Join-Path $b66Descarga 'backend-integrity-manifest.v5-B62.json'
$b66Referencia = Get-Content -LiteralPath $b66Manifiesto -Raw -ErrorAction Stop | ConvertFrom-Json
$b66Referencia | Select-Object treeDigest,fileCount
node 'C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\scripts\backend-integrity.js' verify $b66Manifiesto
if ($LASTEXITCODE -ne 0) { throw 'Referencia rechazada; detener sin sustituir archivos' }
```

Esos comandos no prueban solos la procedencia. El resultado debe contrastarse con los valores aprobados **fuera de esta ejecución**, la declaración de recuperación y la evidencia del medio externo. No basta leer un hash incluido en el mismo archivo que se está validando ni aceptar dos copias producidas por una misma ejecución como independientes. Durante la preparación no se ejecutaron por falta de descarga identificada; la comprobación equivalente posterior, mediante módulos nativos y verificador oficial, queda registrada en sección 7.

### Hashes de los cinco archivos esperados

| Archivo | SHA-256 |
|---|---|
| `backend-integrity-manifest.v5-B62.json` | `2A4956E951217DFF2501D3FFBD35C9024554166E9126AD0134D8FB58C77AD726` |
| `gate.mjs` | `E1FA695193BB716DC45DB24DC27F9B36625CBB5E1313391D87071040D3F8A695` |
| `probe.mjs` | `FB7B63C429C3CDE1055561038173068E0525F247F70EE064B8D248832B032080` |
| `receiver.mjs` | `11FC67BC135EF4CCAC0A8623EC5529818A400829FE12D428DA68AE3473C13354` |
| `send-first-read.ps1`, **B66** | `21AB67270D8EB7F6EE50B06B38298EC6DB9628E70EC1377D073F8C0DED7EBBDE` |

El hash antiguo del sender B64 (`E609…6051`) no corresponde al launcher B66. Si el propietario ya descargó ese archivo anterior, conservarlo como versión anterior y recuperar la versión B66 en una carpeta nueva antes de certificar el canal actual; no se declara discrepancia del manifiesto v5 por este cambio externo a su alcance. **La tabla de este informe es evidencia local de preparación, no una certificación de recuperación externa.**

## 4. Mecanismo de credenciales y mejora mínima

Se conserva `Read-Host -AsSecureString`, conversión de unidades UTF-16 sin recorte/normalización, UTF-8 estricto sin BOM añadido, longitud binaria de cuatro bytes y transporte por stdin/RAM. El receptor consume un handle opaco y libera buffers. No hay contraseña en URI, argumentos, entorno, logs o informes. El destino sigue fijado a `twosides_backend_v2`, `two_sides_db`, host esperado, `admin`, SCRAM-SHA-256 y TLS estricto.

Antes de B66, BSTR y SecureString se liberaban en finally después de esperar al receptor hasta 150 segundos. Ahora, inmediatamente después de formar el frame:

1. Se libera/ceroiza el BSTR y se pone su puntero a cero para evitar doble liberación.
2. Se desecha el SecureString y se elimina su referencia.
3. Se borran arrays de caracteres/bytes, antes de iniciar el receptor.
4. El frame se borra después de enviarlo; finally cubre también fallo/cancelación previos al envío o durante él.

La vida mínima del string en Node/Mongoose no se puede demostrar como borrado físico; es una limitación de memoria administrada/driver, no se promete erradicación de RAM, swap o volcados. La cuenta Windows y el proceso siguen siendo parte de la frontera de confianza B00.

## 5. Pruebas exclusivamente locales

```powershell
# Desde backend:
node --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run --config vitest.config.js tests/sync/b66-private-channel.test.js tests/sync/atlas-v2-first-read.test.js tests/sync/main-credential-channel.test.js
```

**Resultado final: 3 archivos PASS, 68 pruebas PASS, cero fallos, código 0; 6,35 segundos.** Son los 63 casos seleccionados en B65 más cinco ensayos nuevos:

| Caso nuevo | Evidencia obtenida |
|---|---|
| Aceptación sintética | Transporte exacto de espacios/Unicode/caracteres especiales; sin secreto en argv/entorno/salida; BSTR/SecureString liberados antes del hijo; buffers borrados al cerrar |
| Cancelación simulada | Excepción de cancelación desde el sustituto de Read-Host; no se inicia receptor; finally se ejecuta sin secreto disponible |
| Entrada vacía | Rechazo antes del receptor y limpieza |
| Fallo al iniciar receptor | Error con texto ficticio no se divulga; frame/buffers liberados |
| Fallo del receptor | Retorno no cero, error genérico y limpieza; sin reintento |

Las copias desechables extraen **las funciones de arranque y el transporte/finally reales** del launcher, sustituyendo únicamente el prompt por entradas ficticias y el receptor remoto por uno sintético. Se comprueba además liberación anticipada antes de crear el proceso hijo. En ese receptor de prueba se bloquean conexiones de socket y resolución DNS; no se importa Mongoose ni se accede a Atlas.

Los 61 casos B64 cubren guardia de integridad antes de recibir credenciales, manifiesto alterado, uso único, rechazo de destino/mecanismo/TLS/permisos inesperados, comandos de lectura, errores sanitizados y cierre. Las otras dos regresiones ejercitan el transporte existente y bloqueo sin autorización.

La primera corrida de los nuevos casos falló en la comprobación de liberación: consultar la propiedad Length mediante PowerShell no propagaba la excepción del objeto desechado como esperaba el test. Se cambió **solo esa aserción** por la operación .NET Copy, que sí rechaza SecureString desechado. Después se identificó y corrigió la retención hasta fin de proceso descrita arriba, y la batería final de 68 casos pasó. No se interpretaron estos fallos como una exposición real ni se ocultaron resultados.

**No se afirma un PASS interactivo de Ctrl+C real ni un ensayo de despliegue privado:** la cancelación fue simulada y el preflight remoto no se eludió en ningún canal real. La sustitución del preflight ocurre únicamente en la copia de transporte de prueba para no activar v5, consultar ACL o emitir una autorización real.

### Archivos temporales y limpieza

Cada fixture usa una carpeta exclusiva `two-sides-b66-fake-*` bajo el directorio temporal del sistema. Contiene exclusivamente un script PowerShell, un receptor de prueba con literal **ficticio**, un recibo de booleanos y una auditoría de limpieza; no hashes/credenciales reales. Se eliminan esos cuatro archivos exactos y su carpeta al finalizar, también ante error. No hay borrado recursivo ni operaciones sobre directorios reales del canal.

El directorio temporal **no se certifica como privado**: su uso es admisible aquí porque solo contiene datos ficticios. No trasladar ese fixture a uso real ni usarlo para eludir integridad/autorización. No se almacenó ningún secreto real, persistió un frame ni creó un almacén de contraseñas.

## 6. Qué falta para certificar el canal y permitir Atlas

1. Acción manual del propietario y contraste externo de la sección 3; nueva referencia del sender B66 aprobada. Si falta o difiere, detener el despliegue dependiente.
2. Preparar un runId exclusivo fuera de OneDrive/proyecto, con solo los artefactos aprobados, sin enlaces/redirecciones/hardlinks o permisos inesperados. Inspección acotada de los objetos y ancestros, con autorización correspondiente; no dar por seguro LOCALAPPDATA ni cambiar ACL para superar el check.
3. Contrastar hashes externos y verificar Node/PowerShell confiables. Ensayar ese despliegue con secretos exclusivamente sintéticos, incluido el prompt/cancelación interactivo, sin crear una capacidad que conecte Atlas. No certificarlo usando solo los fixtures de este informe.
4. Activación v5 y creación manual de rol/cuenta requieren sus autorizaciones separadas; no son efectos de B66. Hasta entonces la entrada real permanece bloqueada por v4 instalado y por falta de canal/autorización reales.
5. Primera intervención futura en Atlas: revisión manual del proyecto/clúster/nombres y, si se autoriza expresamente, únicamente el rol acotado previsto en B65. No crear automáticamente usuario/rol ni ampliar privilegios. La conexión de lectura requiere otra autorización y activación manual; sin HTTP, documentos nuevos, índices, transacciones de juego, importación de las 2151 operaciones ni cuentas anteriores como fallback.

**B00 continúa pendiente.** Se mejoró y probó el manejo local del secreto; el contraste posterior de la nueva custodia externa no resuelve la confianza en el equipo/proceso ni los permisos efectivos de una cuenta Atlas futura. No comienza B00 automáticamente.

## 7. Contraste posterior de la descarga externa — PASS

El propietario declaró y autorizó verificar exclusivamente:

```text
Origen: OneDrive, carpeta TwoSides_B66_Referencia
Descarga: C:\Users\luis2\Downloads\TwoSides_B66_Referencia
Custodia: NUEVA, establecida durante B66; no anterior a B62
```

Se inspeccionó esa carpeta y sus entradas en lectura, sin modificar la descarga ni ejecutar sus scripts. Resultado: **exactamente cinco archivos normales, cero archivos adicionales, cero subdirectorios y sin enlaces/redirecciones o hardlinks detectados en las rutas verificadas**. No hubo que recorrer otras carpetas personales. Solo se leyeron los cinco archivos esperados; no se accedió a secretos, `.env`, SQLite o almacenes de credenciales.

| Archivo descargado | Bytes | SHA-256 completo | Comparación |
|---|---:|---|---|
| `backend-integrity-manifest.v5-B62.json` | 430563 | `2A4956E951217DFF2501D3FFBD35C9024554166E9126AD0134D8FB58C77AD726` | Igual al original y referencia B62/propietario |
| `gate.mjs` | 4026 | `E1FA695193BB716DC45DB24DC27F9B36625CBB5E1313391D87071040D3F8A695` | Igual al original y B64 |
| `probe.mjs` | 8465 | `FB7B63C429C3CDE1055561038173068E0525F247F70EE064B8D248832B032080` | Igual al original y B64 |
| `receiver.mjs` | 3638 | `11FC67BC135EF4CCAC0A8623EC5529818A400829FE12D428DA68AE3473C13354` | Igual al original y B64 |
| `send-first-read.ps1` | 6715 | `21AB67270D8EB7F6EE50B06B38298EC6DB9628E70EC1377D073F8C0DED7EBBDE` | Igual al original actualizado y B66 |

Se compararon tanto hashes como igualdad de bytes con los originales. **El sender es la versión B66 requerida**, no la anterior B64. La diferencia respecto del hash histórico B64 es la corrección autorizada y documentada de la sección 4; no es una discrepancia entre descarga y paquete vigente.

### Verificador del manifiesto descargado

Se leyó el JSON **desde la descarga**, no desde el candidato local, y se contrastó su SHA con la referencia aprobada anterior a esta comprobación. Sus metadatos recuperados son:

```text
treeDigest recuperado: 1f3f507348a479d88362767e9e548200003d646ad8930f54cbfc9efc6a9f8c28
fileCount recuperado: 3172
```

Después de contrastarlos, se ejecutó el bootstrap de integridad y la función oficial `verifyManifestFile` sobre **ese JSON descargado**, con raíz `backend` y **ancla leída de la descarga**. No se ejecutó el código de gate/receiver/launcher descargados. Resultado:

```text
PASS / ok:true
expectedFiles: 3172
added: 0; removed: 0; modified: 0; problems: 0
Código de salida del proceso verificador: 0
```

El manifiesto instalado se consultó únicamente para confirmar su SHA: continúa siendo **v4**, `7DEC55E3E1053F7F63A0D2B859ACB0A56FF931E82DB7BBB2625734326D6C3E8B`. No se activó v5, reemplazó una referencia, alteró un respaldo o generó una autorización/canal real. No se repitieron pruebas funcionales: los artefactos coinciden exactamente con los ya probados y esta autorización solo requiere su contraste.

### Independencia, ausencia de secretos y límites de la evidencia

- **Observación directa:** existe la descarga local indicada, con exactamente cinco archivos; sus bytes/hashes coinciden con los originales y con referencias registradas antes de esta comprobación. El manifiesto recuperado valida el árbol actual, sin diferencias. La coincidencia exacta con los cinco artefactos públicos esperados permite confirmar que **este paquete no contiene archivos adicionales ni archivos de secretos**; no se hace esa afirmación sobre otras carpetas o el contenido general de OneDrive.
- **Declaración del propietario:** los archivos fueron custodiados y recuperados de OneDrive. No se accedió a OneDrive por API/web, comprobó su historial/versionado remoto o atestiguó técnicamente la descarga desde el proveedor. Se registra esa procedencia como declaración explícita, separada de los resultados locales.
- **Separación de fuentes:** los valores esperados proceden de B62/B64 y de la referencia B66 del sender, anteriores a esta verificación, además de los valores aprobados por el propietario. Los bytes y el ancla verificados se recuperaron de la descarga identificada por él; no se generó aquí otro paquete y se lo presentó como externo. El archivo descargado no se utilizó para inventar su propio SHA esperado.
- **Alcance de la nueva custodia:** establece una referencia externa nueva declarada, cuyo contenido se ha contrastado. No acredita que existiera antes de B62/B66, que el equipo fuera confiable en el pasado, ni que código y referencia no pudieran haber sido comprometidos antes de custodiarse. Son hashes, no firmas ni una atestación independiente del proveedor. La custodia posterior debe conservar las versiones y valores aprobados fuera del árbol modificable.
- **Riesgo residual B00:** ejecutar bajo la misma cuenta Windows mantiene riesgos de sustitución entre comprobación y uso, dependencias/procesos y exposición de memoria. Esta comprobación no certifica el directorio futuro del canal ni los permisos de una cuenta Atlas.

**Resultado actualizado: referencia externa nueva CONTRASTADA, cinco de cinco archivos coincidentes y manifiesto PASS, 3172, código 0. Se cierra ese bloqueo dentro del alcance de custodia declarada y verificación local descrito. Permanece pendiente el despliegue/certificación del canal.** No se conecta Atlas, activa v5, inicia Express, solicita contraseña o continúa la migración B00; se detiene tras actualizar este informe.
