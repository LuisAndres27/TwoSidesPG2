# C.2 Windows — Preparación del entorno controlado

Fecha: 2026-10-29. **Preparación offline completada, con condiciones pendientes para introducir credenciales.** No se autoriza ni habilita C.2 real. B00 continúa abierta; F.2 y B05.5 no se iniciaron.

Se parte de B05_C2_WINDOWS_FINAL_BLOCKERS_RESULT.md. Se conservaron las verificaciones previas de dependencias, Node y Argon2; no se repitió una auditoría general ni se alteraron versiones o la implementación transaccional.

## 1. Ruta preparada e inventario

Se creó un subdirectorio exclusivo, sin sobrescribir ejecuciones:

```text
C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\c2-67d95728399e4e30a406eba7301979fd
  package/               paquete mínimo de código y dependencias
  manifest.json          SHA-256 de los 1.890 archivos del payload
  preparation.json       fuentes, lock, SID y metadatos de preparación
  runs/<run-id>/         marcador de uso único y resultado offline sanitizado
  support/               configuraciones npm vacías y caché nueva de instalación
  temp/                  temporal privado del proceso, sin secretos
```

El payload package contiene:

- 27 fuentes existentes C.2, byte por byte iguales al inventario previo.
- Dos archivos nuevos: scripts/c2-windows-offline.ps1 y scripts/c2-windows-offline-entry.js.
- package.json y package-lock.json mínimos.
- 23 paquetes instalados de nuevo, con 1.858 archivos.
- El metadato node_modules/.package-lock.json que genera npm.

Total: **1.890 archivos** en el payload. No se copiaron Godot, .env, SQLite, claves privadas reales, .git, docs, pruebas completas, canales históricos, .npmrc del usuario ni cachés del proyecto. support contiene una caché nueva de instalación aislada; no forma parte del payload ni procede de la caché original. No se copiaron dependencias desde node_modules del proyecto: se instalaron desde el lock y después se compararon sus bytes.

No se ejecutó git add, commit ni push. La referencia de código propio sigue siendo un inventario revisado de código sin versionar, no una recuperación de procedencia original.

## 2. Referencia de integridad

| Objeto | SHA-256 |
|---|---|
| manifest.json | 8DCCBF599E7C93B94386668F752DA4F1CFD58F35D9DCA39BDCED5A418D3FB0AE |
| package/package.json | 5C13E468371FC5FE4AF924D4D3B91E0F21666DD2A646049A8E74C5E1955B3E58 |
| package/package-lock.json | 8593726AF93AFC2CAFB483B38A4FE45164E7A9EB97708A827BE8F6E805DF73D5 |
| package/scripts/c2-windows-offline.ps1 | 26E100555EA44BEFAEF2B6CF1FCDA6D0816ADAFF4C4F86AF4D42518A5CB3B5B7 |
| package/scripts/c2-windows-offline-entry.js | BF9508E836431CB2B51D630C84CB655EA17C86B33A41F2DB564C09DBAB9D2F4B |
| Node absoluto, C:\Program Files\nodejs\node.exe | 3602F2BB1A10F2CBAB4C36886218A33C1AB3DB87290E73B033C46C77147D0237 |

Las 27 fuentes coinciden 27/27 con el Anexo A de B05_C2_WINDOWS_RUNTIME_READINESS.md, incluido runId fijo, exclusión del fence al borrar y supervisor. Es continuidad respecto de un estado revisado, **no procedencia original acreditada**.

El manifiesto contiene rutas relativas, hashes, versiones, destino permitido, SID excluidos, versión/hash de Node y modo offline. No contiene contraseñas, verificadores de jugadores, claves privadas, tokens ni cadenas con credenciales.

### Conservación independiente que debe realizar el usuario

Guardar manifest.json y este digest fuera del árbol modificable y preferiblemente fuera del equipo: por ejemplo, copia en un dispositivo externo o almacenamiento privado bajo control del propietario. Comparar allí el SHA-256 completo anterior y registrar la fecha de revisión. El informe/digest puede conservarse en un segundo medio separado del manifiesto. No se envió ni publicó nada por herramientas y no se eligió automáticamente un remoto Git.

Esta copia externa daría un ancla hacia adelante para detectar cambios respecto del estado revisado. No demuestra que los bytes anteriores a la revisión fueran auténticos ni hace desaparecer los riesgos del mismo usuario.

## 3. ACL y rutas verificadas

La preparación comprobó que la ruta real autorizada correspondiera a LOCALAPPDATA/TwoSides/C2Runtime, que los ancestros nominales no fueran reparse points y que la ejecución nueva no existiera. La raíz C2Runtime se creó sin modificar descriptores existentes.

Las consultas ACL/propietario se limitaron expresamente a C2Runtime y sus objetos nuevos. Se inspeccionó la raíz antes de copiar, 48 objetos iniciales y, al terminar instalación/pruebas, **2.779 objetos del subdirectorio de ejecución**. Se rechazaban enlaces, los dos SID B00, propietarios fuera de los esperados y ACE Allow de escritura/borrado/cambio de DACL/propietario para cualquier principal ajeno a:

- LAPTOP-F337QTKK/luis2.
- SYSTEM.
- Administradores.

Resultado final: **cero escritores inesperados, cero ACE de los dos SID B00 y cero cambios de ACL**. Los archivos nuevos se crearon por bytes y heredaron la DACL del destino; no se copiaron descriptores del proyecto. En package se observó propietario luis2 y FullControl heredado para las tres identidades anteriores.

SID rechazados:

- S-1-5-21-452213140-3335518246-3718727391-3248334987.
- S-1-5-21-307222809-3929607348-3502628415-466486063.

También se verificaron archivos normales sin symlinks ni hardlinks adicionales en el inventario de fuentes/dependencias. No hubo consultas ACL en el proyecto original ni en carpetas personales ajenas a los ancestros necesarios de ruta; no se usaron Set-Acl, takeown o icacls.

**Límite:** luis2 conserva FullControl. La copia no separa procesos de esa misma cuenta ni de SYSTEM/Administradores. No se declara que el runtime tenga una ACL de solo lectura o que B00 haya quedado resuelta.

## 4. Lock mínimo e instalación

El informe previo documentaba candidatos temporales que debían regenerarse/revisarse en la copia real. Se regeneró el mínimo como subconjunto literal del lock original: mismas versiones, resolved e integrity, sin resolver ni actualizar dependencias. Contiene 35 paquetes fijados, incluidos los binarios opcionales de otras plataformas requeridos por la validación del lock; en win32/x64 se instalan exactamente 23. Los hashes nuevos de los archivos mínimos están arriba; no se presentan como idénticos a los candidatos temporales anteriores.

El package.json de runtime no tiene scripts y declara exclusivamente:

```json
{
  "@node-rs/argon2": "2.2.2",
  "jose": "6.2.13",
  "mongoose": "9.11.2",
  "zod": "4.6.7"
}
```

Antes de instalar, se inspeccionaron las entradas fijadas, el cierre y los metadatos de scripts del conjunto ya revisado. El dry-run offline con configuración vacía confirmó **23 añadidos, cero cambios/borrados y ausencia de node_modules**.

Después se ejecutó npm ci --ignore-scripts con omit=dev, include=optional, sin auditoría/fund, caché nueva y userconfig/globalconfig vacíos, mediante la ruta absoluta de npm CLI que acompaña a Node. Su proceso recibió entorno limpio y no heredó tokens/configuración npm. No se ejecutaron scripts de instalación, compiladores, actualizaciones o paquetes adicionales. La red se usó exclusivamente para la instalación npm autorizada, no para Atlas.

Resultado: **23 paquetes instalados, cero actualizados/borrados**. Se verificaron los 1.858 archivos frente a los instalados del proyecto que la fase anterior había comparado con los artefactos/firma del registro: cero faltantes, extra o diferentes. npm verificó las integridades fijadas del lock; esta fase no volvió a auditar firmas de los 23 paquetes.

El opcional nativo Windows de Argon2 estuvo disponible sin scripts. La prueba aislada cargó únicamente su .node desde el paquete nuevo, verificó hash/contraseña sintéticos y rechazó un valor sintético distinto. No se actualizó Argon2 ni se cambió su comprobación de versión. No se definió NAPI_RS_ENFORCE_VERSION_CHECK=0: cualquier variable NAPI_RS_* recibida del padre hace fallar el lanzador.

## 5. Entorno permitido y rechazo cerrado

El lanzador nuevo comprueba la presencia de variables peligrosas, sin imprimir sus valores, y rechaza antes de iniciar Node:

- NODE_OPTIONS, NODE_PATH y NODE_COMPILE_CACHE.
- Cualquier NAPI_RS_*, incluida NAPI_RS_ENFORCE_VERSION_CHECK.
- LD_*, DYLD_*.
- MONGO*, DOTENV* y NPM_CONFIG_*.
- NODE_ENV definido con un valor distinto de test.
- Argumentos desconocidos, destino distinto, manifiesto incorrecto o ejecución consumida.

El proceso hijo recibe solo:

| Variable | Origen controlado |
|---|---|
| SystemRoot, WINDIR | Carpeta Windows resuelta por el sistema |
| SystemDrive | Unidad de la ruta absoluta fijada de Node |
| LOCALAPPDATA | Carpeta LocalApplicationData resuelta por el sistema |
| PATH | Únicamente Windows/System32; Node se invoca por ruta absoluta |
| TEMP, TMP | temp dentro de la ejecución nueva |
| NODE_ENV | test |

El resto del entorno del padre no se propaga. No se cargan .env, configuraciones MongoDB ambientales ni librerías nativas por overrides heredados. No se inspeccionaron secretos de procesos o de Compass.

## 6. Lanzador preparado: únicamente offline

Fuentes nuevas en backend/scripts y copias idénticas en package/scripts:

- c2-windows-offline.ps1.
- c2-windows-offline-entry.js.

El PowerShell verifica ruta y ancestros, DACL de raíz/directorios/archivos del paquete, destino fijo, hash del manifiesto, inventario exacto y todos los hashes, más el hash/ruta de Node. Mantiene handles de lectura que deniegan compartir escritura/borrado sobre los archivos verificados mientras corre el hijo. Eso mitiga sustitución de archivos existentes; no certifica todos los ataques de directorio, DLL o memoria por un proceso del mismo usuario.

El destino fijado es host <cluster>.<id>.mongodb.net, usuario twosides_integration_test, base two_sides_integration_test, authSource admin, DEFAULT y TLS estricto. Solo se compara/configura como futuro destino: no se abre conexión.

Cada invocación válida crea runs/<run-id> y un marcador con CreateNew. Una ejecución existente se rechaza, sin borrar marcadores. El hijo recibe solo argumentos no secretos de salida/runId, stdin cerrado y un entorno reconstruido. stdout/stderr se retienen para verificar que estén vacíos, no se reenvían errores crudos. Hay watchdog de 120 s para el hijo y cierre acotado del proceso propio.

El entrypoint genera exclusivamente datos ficticios en RAM, comprueba Argon2, esquema/fence inicial sin DDL, rechazo del entrypoint remoto y destino erróneo; ejercita clientes/sesiones doblados bajo el supervisor y verifica cierre. La revisión de limpieza transaccional y fence se completa con las regresiones seleccionadas sobre las mismas fuentes, no con escrituras MongoDB.

**No hay Read-Host ni receptor de contraseña. No debe introducirse una contraseña con este lanzador.** La biblioteca existente atlas-credentials forma parte del cierre del adaptador, pero no se invoca su recepción de stdin. La capacidad remota sigue bloqueada; no se habilitó mediante bandera ni se ejecutaron las carreras C.2.

## 7. Pruebas ejecutadas

**24 pruebas seleccionadas aprobadas; cero fallidas en los pases de pruebas de esta fase.** No se suman a los 67/187 resultados históricos.

### Lanzador/paquete nuevo

Archivo explícito: tests/sync/c2-windows-runtime-preparation.test.js. **14 aprobadas**.

- Integridad de los 1.890 archivos y cuatro dependencias directas.
- Rechazo de base, usuario y host distintos.
- Rechazo de siete variables peligrosas antes de crear un run.
- Alteración sintética de una fuente de la copia, rechazo antes de ejecutar y restauración exacta en finally; el proyecto original no se altera.
- Arranque offline real del paquete nuevo con Argon2 y recursos ficticios.
- Rechazo de reuso sin modificar el resultado ya guardado.
- Resultado sanitizado sin claves, verificadores, tokens o URI.
- Todos los hashes del payload vuelven a coincidir después de las pruebas negativas.

Se ejecutó con la variable no secreta TWOSIDES_C2_OFFLINE_ROOT fijada únicamente para seleccionar la copia sintética y con permiso de herramienta para sus escrituras fuera del workspace. La suite se omite si esa selección explícita falta; no intenta usar un directorio personal por defecto ni rompe otras baterías:

```powershell
# Desde backend; la variable no se propaga al hijo del lanzador:
$env:TWOSIDES_C2_OFFLINE_ROOT = 'C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\c2-67d95728399e4e30a406eba7301979fd'
node --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run --config vitest.config.js --configLoader native --pool threads tests/sync/c2-windows-runtime-preparation.test.js
```

Resultado offline guardado:

```text
runs/709055c01e204e7f8e91904a0881b796/result.json
status=passed
atlasConnected=false
remoteEnabled=false
argon2Synthetic=true
fixedSchema=true
fencePreserved=true
wrongTargetRejected=true
resourcesClosed=true
```

Ese nonce está **consumido para su validación offline**; no se borra ni se reutiliza como activación real.

### Regresiones relacionadas

**10 aprobadas**, 57 casos fuera de selección, en dos archivos explícitos; sin PowerShell histórico/ACL ni conexiones reales:

```powershell
node --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run --config vitest.config.js --configLoader native --pool threads tests/sync/durable-revocation-atlas-preflight.test.js tests/sync/durable-revocation-operational.test.js --testNamePattern '^(RC18 |RC24 |RC30 |OL01 |OL03 |OL05 |OL08 |OL15 |OL19 |OL29 )'
```

Cubren limpieza exacta y fence conservado, fallo por fence cambiado, cierre completo, timeout/global, escritura tardía incierta, límites de clientes/sesiones/callbacks, bloqueo antes del secreto y commit reintentado sin duplicar el efecto de aplicación.

A36 sigue excluida y no se ejecutó. No se lanzó npm test, private-workspace.ps1 ni una batería general. Node --check y el parser PowerShell aprobaron los nuevos archivos. Las consultas ACL de esta fase fueron las expresamente autorizadas sobre C2Runtime y no provinieron del auxiliar histórico.

Se comprobó además la selección de la suite nueva: sin TWOSIDES_C2_OFFLINE_ROOT sus 14 casos se omiten, sin acceso a un runtime por defecto; con la ruta explícita, CP01 vuelve a aprobar. Esas comprobaciones no se suman a las 24 pruebas únicas anteriores ni convierten los casos omitidos en aprobados.

Hubo dos paradas de instrumentación antes del sellado: el wrapper del dry-run intentó leer como JSON una salida npm que incluía líneas de acciones, y el verificador ad-hoc tuvo un error de sintaxis antes de escribir el manifiesto. Se corrigieron, se confirmó el dry-run y se completó el sellado; no cambiaron versiones, inventarios ni recursos protegidos. No se ocultaron fallos de tests.

## 8. Riesgos pendientes y condiciones para un secreto

- **B00 continúa pendiente.** La copia no hereda los SID del proyecto, pero su usuario conserva FullControl y comparte identidad con otros procesos Windows. No se modificaron las ACE originales ni se certificó aislamiento de memoria.
- El código propio sigue sin procedencia histórica independiente. El manifiesto nuevo debe conservarse externamente por el usuario o registrarse una decisión explícita sobre ese riesgo. No se interpreta esta autorización de preparación como aceptación de exposición de secretos.
- La evidencia independiente de dependencias procede de la fase anterior y la instalación por lock; no convierte el código propio en autenticado. Se mantuvo la limitación de la cadena DLL/TOCTOU bajo la misma cuenta.
- Los handles y hashes son controles parciales; no se promete que un proceso privilegiado o del mismo usuario no pueda intervenir.
- Este lanzador es offline. Para introducir credenciales se requiere autorización separada, un nuevo paquete/manifiesto revisado con capacidad de datos C.2 exclusiva y un receptor/lanzador de un uso que aún no existe. No se debe adaptar el canal consumido ni aceptar la contraseña en este programa.
- Antes de escribir remotamente habrá que verificar en la sesión autorizada permisos efectivos, catálogo/índices exactos y estado inicial del fence. No se recreará esquema C.2A ni se adoptará automáticamente un estado inesperado.
- Mantener el supervisor y la limpieza bloqueada si hay escritura/commit incierto. Un cierre no prueba rollback ni impide commits ya enviados.
- Cualquier prueba real deberá incluir procedimiento de reconciliación exacta y rotación posterior de la contraseña de integración bajo autorización, sin usuarios/bases ajenos.

No se recibe ni solicita una contraseña, ni se entrega un comando que active Atlas. El resultado es preparación offline utilizable para revisión; **no autoriza una conexión remota ni acredita resuelto B00**.

## 9. Archivos creados y detención

En el proyecto se crearon exclusivamente:

- backend/scripts/c2-windows-offline.ps1.
- backend/scripts/c2-windows-offline-entry.js.
- backend/tests/sync/c2-windows-runtime-preparation.test.js.
- Este informe.

Fuera del proyecto se crearon exclusivamente la raíz C2Runtime y el subdirectorio nuevo descrito con paquete, manifiestos, soporte/temporales y resultados sintéticos. El runner puede actualizar su caché interna de pruebas. No se borraron ejecuciones existentes ni se cambió propietario/ACL de objetos existentes.

No se leyó backend/.env, una base SQLite protegida o contraseñas de Compass. No se recalcularon hashes de datos protegidos ni se modificaron Godot, usuarios/permisos de Atlas o referencias históricas. No hubo conexión Atlas, C.2, F.2 o B05.5.

**Preparación offline completada. Detenerse y esperar autorización independiente.**

## Anexo A — Fuentes copiadas

Las 27 primeras son continuidad del inventario revisado; las dos últimas son el lanzador nuevo. El manifiesto externo incluye además las dependencias y metadatos.

| Fuente relativa a package | SHA-256 |
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
| scripts/c2-windows-offline.ps1 | 26E100555EA44BEFAEF2B6CF1FCDA6D0816ADAFF4C4F86AF4D42518A5CB3B5B7 |
| scripts/c2-windows-offline-entry.js | BF9508E836431CB2B51D630C84CB655EA17C86B33A41F2DB564C09DBAB9D2F4B |

## Anexo B — Dependencias instaladas de nuevo

| Paquete | Versión | Archivos comparados |
|---|---|---|
| @mongodb-js/saslprep | 1.6.1 | 40 |
| @node-rs/argon2 | 2.2.2 | 6 |
| @node-rs/argon2-win32-x64-msvc | 2.2.2 | 3 |
| @standard-schema/spec | 1.1.0 | 7 |
| @types/webidl-conversions | 7.0.3 | 4 |
| @types/whatwg-url | 13.0.0 | 9 |
| bson | 7.3.3 | 47 |
| jose | 6.2.13 | 80 |
| kareem | 3.4.1 | 7 |
| memory-pager | 1.5.0 | 6 |
| mongodb | 7.7.0 | 402 |
| mongodb-connection-string-url | 7.0.2 | 10 |
| mongoose | 9.11.2 | 304 |
| mpath | 0.9.0 | 12 |
| mquery | 6.0.0 | 14 |
| ms | 2.1.3 | 4 |
| punycode | 2.3.1 | 5 |
| sift | 17.1.3 | 23 |
| sparse-bitfield | 3.0.3 | 7 |
| tr46 | 5.1.1 | 7 |
| webidl-conversions | 7.0.0 | 4 |
| whatwg-url | 14.2.0 | 17 |
| zod | 4.6.7 | 840 |
