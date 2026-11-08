# B63 — Preparación de activación de v5 y cuenta Atlas

Fecha: 2026-11-03, Guatemala. **Procedimiento preparado, no ejecutado.** Único archivo creado: este informe. No se activó v5, modificó código/credenciales, creó cuenta/rol, conectó Atlas, inició Express/Caddy, modificó SQLite/Godot/cuotas ni eliminó datos/respaldos. Sin commits ni push. No se leyó `.env` ni material JWT privado.

Referencias: B59 (migración), B60 (verificadores), B62 (manifiesto). B57/B58 ya cubrieron HTTPS sintético; no es necesario repetirlos para preparar las cuentas.

## 1. Estado comprobado en B63

| Referencia | Identificación y comprobación |
|---|---|
| Candidato v5 | `%LOCALAPPDATA%\TwoSidesMainIntegrity\backend-integrity-manifest.v5-B62.json` |
| SHA-256 v5 | **`2A4956E951217DFF2501D3FFBD35C9024554166E9126AD0134D8FB58C77AD726`** |
| treeDigest v5 | **`1f3f507348a479d88362767e9e548200003d646ad8930f54cbfc9efc6a9f8c28`** |
| Árbol candidato | **3172 archivos; verificador oficial con ancla: OK, cero diferencias; comprobación local con código 0** |
| Referencia instalada | Sigue siendo v4, `%LOCALAPPDATA%\TwoSidesMainIntegrity\backend-integrity-manifest.json`; no se sustituyó |
| SHA-256 v4 | `7DEC55E3E1053F7F63A0D2B859ACB0A56FF931E82DB7BBB2625734326D6C3E8B` |
| treeDigest v4 | `aea04105001d5ca324f817602e781cf5118789f9187c8424c204551ac800e27e` |
| Copia v4 | `local-persistence/.work/pre-B60-abe56b01/v4-reference.json`, bytes iguales a la instalada |
| Código para reversión | `local-persistence/.work/pre-B60-abe56b01/backend/` |
| Prueba de reversión sin restaurar archivos | Verificador oficial con raíz de ese respaldo y ancla v4: **OK, 3169 archivos, cero diferencias**, código 0 |

La comprobación sobre el respaldo fue de solo lectura: no se restauró código ni ejecutó el backend anterior. v4 no valida el árbol candidato B60 y no se debe intentar usarlo para arrancarlo. Los hashes comunicados por el propietario coinciden con los archivos actuales; todavía **no hay una recuperación externa de v5 contrastada en B63**.

## 2. Orden mínimo y autorizaciones

| Paso | Acción futura | Autoriza / ejecuta | Condición de salida |
|---|---|---|---|
| P1 | Contrastar la referencia externa | Propietario recupera archivos; agente verifica cuando se autorice | Bytes/ancla/árbol coinciden |
| P2 | Preparar y probar sonda de primera conexión, sin red | Nueva autorización de preparación local | Sonda acotada, canal revisado y hash independiente |
| A1 | Activar v5 localmente con respaldo v4 | Nueva autorización explícita de activación | Referencia instalada v5 verificada; ningún servidor arrancado |
| A2 | Crear rol y cuenta nuevos en Atlas | Nueva autorización y acción manual del propietario | Configuración exacta, secreto protegido, anterior intacta |
| V1 | Una conexión de lectura con la cuenta nueva | Nueva autorización remota y activación manual del canal | SHA-256, identidad, permisos y metadatos conformes, cierre |
| V2 | Operaciones sintéticas / arranque main / Godot | Autorización posterior propia | Fuera de B63; no implícito en V1 |

P2 puede prepararse mientras se obtiene la referencia externa; no acepta credenciales reales. A1 no autoriza A2/V1. Crear la cuenta no activa main. No es necesario crear usuarios adicionales de administración/inspección para la primera sesión si la sonda usa la cuenta de aplicación con una lista cerrada de operaciones de lectura.

## 3. P1 — Contraste de referencia externa independiente

**No realizado aquí.** No reutilizar el paquete C.2 anterior: es una release distinta.

Procedimiento manual propuesto:

1. Propietario: conservar fuera del árbol/equipo una copia **sin reserializar** del JSON v5 de B62 y una referencia legible con su SHA-256 completo, treeDigest y número 3172. Puede ser almacenamiento externo o nube bajo su control; no contiene contraseñas ni claves. No subir `.env`, claves, SQLite ni el árbol de dependencias.
2. Guardar también los valores aprobados de esta solicitud/B62 por un medio independiente. Subir manifiesto y hashes juntos no los convierte en una firma: importa preservar esa referencia confiable y la procedencia/versionado de la copia.
3. Recuperar desde el servicio externo a una carpeta nueva, por ejemplo `%USERPROFILE%\Downloads\TwoSides_v5_Reference_<fecha>`. No obtener los valores a contrastar del proyecto ni copiar el candidato local a esa carpeta fingiendo una descarga.
4. Confirmar manualmente el origen de la descarga; localizar exactamente un candidato v5, sin enlaces o ambigüedad entre versiones. Calcular SHA-256 de los bytes recuperados y compararlo con la referencia externa/aprobada; leer del JSON recuperado `treeDigest`, `fileCount` y fecha B62.
5. Ejecutar el verificador oficial contra **ese archivo descargado**, usando como ancla el digest recuperado y contrastado externamente. Exigir código 0 y 3172 archivos. Comparar además sus bytes/hash con el candidato local v5. Descargas bajo `Downloads` quedan fuera del proyecto/OneDrive, como exige la política de ubicación del verificador.
6. Registrar ruta, hashes, origen declarado, resultado y límites. Si no puede acreditarse la descarga o hay diferencias: **referencia externa NO VERIFICADA**, detener antes de activar.

Comprobación local de lectura que se podrá realizar sobre la descarga, sin conectar Atlas:

```text
Get-FileHash del JSON descargado → SHA esperado de esta sección
JSON descargado → fileCount 3172 y treeDigest esperado
node backend/scripts/backend-integrity.js verify <ruta absoluta del JSON descargado>
verifyManifestFile(<JSON descargado>, raíz backend, {anchor:<digest externo>}) → ok:true
```

No se creó un paquete de referencia, subió archivo ni solicitó acceso a la nube en B63. La procedencia externa sigue siendo una condición pendiente, no un resultado aprobado.

## 4. A1 — Activación local de v5 sin arrancar servicios

**Plan para una autorización posterior. No ejecutar bajo B63.** El wrapper fija el manifiesto activo en `backend-integrity-manifest.json`; por eso no basta con pasarle el nombre alternativo v5 ni se debe modificar su código para saltar la política.

Secuencia exacta propuesta:

1. Volver a comprobar P1, código/digest, ausencia de procesos/listeners y que el activo aún tenga el SHA v4 indicado. Si ya contiene otro hash, detener: no sobrescribir un estado desconocido.
2. Resolver las rutas absolutas de carpeta, activo, candidato, staging y respaldo; todos los archivos de activación bajo `%LOCALAPPDATA%\TwoSidesMainIntegrity`, en el mismo volumen. Comprobar archivos normales, padres sin redirecciones inesperadas y ausencia de vínculos que permitan alterar otros recursos. Registrar propietario/DACL actuales de los objetos concretos y comprobar la política existente, con la autorización de inspección que corresponda. No corregir ACL automáticamente.
3. Elegir nombres únicos no existentes para respaldo v4 y staging. Crear **un respaldo nuevo con creación exclusiva**, por ejemplo `backend-integrity-manifest.v4-before-v5-<UTC>-<GUID>.json`; copiar los bytes activos, verificar el SHA v4 y conservar el respaldo de código pre-B60. No sobrescribir respaldos anteriores.
4. Crear staging nuevo con los bytes del candidato v5, sin regenerar/reescribir JSON. Verificar SHA v5 y árbol actual una vez más. El candidato original y la descarga externa permanecen intactos.
5. Reemplazar únicamente la referencia activa con staging mediante una operación de reemplazo revisada, por ejemplo `System.IO.File.Replace(staging, activo, null, false)` **después de haber creado/verificado el respaldo independiente del punto 3**. No ignorar errores de combinación de metadatos, no usar `force`, `takeown`, cambios de propietario o ACL como alternativa. El `null` evita que la API sobrescriba un archivo de respaldo; su uso aquí depende de que el respaldo exclusivo ya esté asegurado.
6. Confirmar inmediatamente: activo SHA v5 exacto, JSON 3172/treeDigest esperado, propietario/DACL conservados conforme a la política y verificador oficial con código 0. Comprobar respaldo v4 y candidato original intactos. Si la API falla, inspeccionar cuál referencia quedó en cada ruta; no presuponer que nada cambió y no arrancar.
7. Registrar fecha real, rutas, hashes y resultado. Conservar v4, v5 y evidencia externa. **Terminar esta etapa sin ejecutar `run-main-backend.ps1`.**

`File.Replace` requiere origen/destino en el mismo volumen y puede combinar metadatos; por eso se planifica comprobación posterior y `ignoreMetadataErrors=false`. El método puede sobrescribir un backup si se le pasa un nombre existente: de ahí el respaldo exclusivo previo y no reutilizar nombres. [Contrato oficial de File.Replace](https://learn.microsoft.com/en-us/dotnet/api/system.io.file.replace?view=netframework-4.7.2).

No se implementó ni ensayó el procedimiento de reemplazo en B63. Su operación exacta y recuperación deben revisarse/probarse sobre archivos sintéticos antes de aplicarlo al activo, bajo la siguiente autorización local.

## 5. A2 — Instrucciones manuales para el propietario en Atlas

**No ejecutarlas sin autorización específica.** No usar `db.createUser`/`createRole` desde la aplicación; gestionar cuentas y roles mediante Atlas UI/CLI/API. Las instrucciones siguientes son para la UI, sin scripts con contraseñas.

### Rol nuevo

1. Acceder al proyecto que contiene `TwoSidesCluster`, confirmar organización/proyecto/clúster y abrir **Security → Database & Network Access → Custom Roles** (los rótulos pueden variar por idioma).
2. Verificar que `two_sides_main_runtime_v1` no existe. Si existe, detener y revisar su definición; no sobrescribir un objeto no inventariado.
3. **Add New Custom Role**, nombre `two_sides_main_runtime_v1`; sin roles heredados ni roles globales. Añadir únicamente estas acciones/recursos:

| Base | Colección | Acciones exactas |
|---|---|---|
| `two_sides_db` | Recurso de base, `collection:''` | `listCollections` |
| `two_sides_db` | `main_v2_operations` | `find`, `insert`, `update`, `listIndexes` |
| `two_sides_db` | `main_v2_facts` | `find`, `insert`, `update`, `listIndexes` |
| `two_sides_db` | `main_v2_fences` | `find`, `insert`, `update`, `listIndexes` |
| `two_sides_db` | `main_v2_identities` | `find`, `insert`, `update`, `listIndexes` |
| `two_sides_db` | `main_v2_ownerGuards` | `find`, `insert`, `update`, `listIndexes` |
| `two_sides_db` | `main_v2_identitySessions` | `find`, `insert`, `update`, `listIndexes` |
| `two_sides_db` | `main_v2_revocations` | `find`, `insert`, `update`, `listIndexes` |

4. No seleccionar «any database/any collection» para acciones de datos. Confirmar que la UI permite expresar la tabla sin ampliar recursos. Si una acción no está disponible o exige un permiso más amplio, detener y documentar; no agregar `readWrite` para salvarlo.
5. Guardar y conservar la definición sanitizada. El contrato B60 exige que el rol efectivo aparezca como **`two_sides_main_runtime_v1@admin`**; `admin` es el namespace del rol/autenticación, **no** un recurso de lectura/escritura. Confirmarlo en la posterior inspección efectiva; no alterar el verificador si el resultado difiere sin analizarlo.

Atlas permite acciones por recurso y advierte que los roles se suman; Free/Flex puede tardar hasta 30 s en propagar cambios. Se necesitan permisos de control Atlas apropiados para configurar roles. [Procedimiento oficial de roles](https://www.mongodb.com/docs/atlas/security-add-mongodb-roles/).

### Usuario nuevo

1. En **Database Users**, comprobar que no existe `twosides_backend_v2`; si existe inesperadamente, detener antes de editar.
2. **Add New Database User**, autenticación por contraseña/SCRAM, usuario exacto `twosides_backend_v2`. Generar una contraseña nueva en un gestor privado/entrada protegida, sin reutilizar las de cuentas anteriores. No pegarla en chat, código, URI, `.env`, argumentos, capturas o documentos.
3. Asignar **solo** el rol personalizado anterior. Eliminar de la selección cualquier rol por defecto amplio; no conservar `readWrite`, `readWriteAnyDatabase`, `dbAdmin`, `dbOwner`, `atlasAdmin` ni privilegios extra.
4. Restringir acceso al clúster `TwoSidesCluster`; revisar la IP de salida necesaria y la lista de red del proyecto con alcance específico. No abrir `0.0.0.0/0` ni alterar restricciones existentes sin autorización. La IP exacta no se inventa en este informe.
5. Guardar sin cambiar `twosides_backend`, `twosides_integration_test` u otros usuarios. Mantener la cuenta anterior disponible hasta completar la aceptación, sin usar su contraseña como fallback automático.
6. Conservar nombre, método, rol/recursos, restricción de clúster/red, fecha y registro de actividad; nunca el secreto. La UI puede mostrar «SCRAM» genérico: la prueba real debe exigir **SCRAM-SHA-256** desde el driver. No afirmar SHA-256 validado solo por crear la cuenta o conectar Compass.

Atlas usa `admin` como authentication database de SCRAM y soporta SHA-256; la identidad de usuario Atlas que administra el proyecto es distinta del usuario DB utilizado por Express. [Usuarios y autenticación oficiales](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/).

## 6. P2/V1 — Primera conexión controlada de solo lectura

### Brecha actual: falta la sonda específica

El código runtime B60 está preparado, pero **no existe todavía un comando independiente revisado y probado para una primera conexión de lectura de `twosides_backend_v2`**:

- `run-main-inspection.js` conserva la política administrativa histórica, DEFAULT y requisitos `read`/`readWrite`; no se debe reutilizar con la cuenta nueva ni concederle roles extra para que pase.
- `run-main-backend.ps1` conecta y finalmente arranca Express; no es la prueba aislada de lectura de V1.
- `openMainProfile` también realiza composición/modelos y calentamiento con una transacción vacía; no es necesario usarlo para una sonda mínima.

Por tanto **V1 permanece bloqueada hasta preparar/probar la sonda bajo otra autorización**. B63 identifica exactamente su contrato; no inventa un comando operativo ni entrega uno que inicie servicios inadvertidamente.

### Contrato exacto de la futura sonda

1. Receptor/launcher de un solo uso en directorio privado exclusivo fuera de OneDrive/proyecto, sin modificar los 3172 archivos de v5. Si se decide añadirlo al árbol protegido en vez de usar un artefacto externo revisado, v5 dejará de coincidir y habrá que sellar de nuevo; no editar el árbol silenciosamente.
2. Verificar referencia externa/manifest activo, integridad del propio receptor/launcher y precondiciones de privacidad antes de recibir un secreto. El artefacto externo no queda protegido por v5: necesita hash, revisión y referencia propios, pruebas offline y protección contra sustitución/reutilización. No basta con ubicarlo en LOCALAPPDATA. No crear un canal ahora ni recuperar secretos de Compass.
3. Destino fijo: `<cluster>.<id>.mongodb.net`, `two_sides_db`, `twosides_backend_v2`, `authSource=admin`, `authMechanism=SCRAM-SHA-256`; TLS estricto, sin opciones permisivas, URI sin contraseña, `autoCreate=false`, `autoIndex=false`, `bufferCommands=false`, tiempos y pool acotados del conector principal. Sin destino/usuario/URI alternativos por argumentos.
4. Propietario introduce la contraseña **solo** en entrada oculta del launcher; transporte por stdin/RAM mediante el mecanismo revisado. Un intento de sesión, sin fallback a DEFAULT/SHA-1/usuario anterior ni repetición autenticada automática. Las conexiones internas de topología del driver no equivalen a autorizar varias campañas.
5. Conector y aserciones del candidato: `mainConnector` → `assertMainConnection` → `verifyMainPermissions` con `connectionStatus:{showPrivileges:true}`. Comparar identidad, rol único y unión efectiva exacta. Cerrar inmediatamente si falta o sobra cualquier permiso.
6. Lista cerrada de lecturas: `hello`, catálogo de nombres de la base, `listIndexes` de las siete colecciones y lectura proyectada de **solo** la semilla `main_v2_fences/ingestion-v1`. Verificar replica set/primario, índices únicos y revisión no negativa; añadir lectura acotada de conteo de `main_v2_operations` solo si se incluye explícitamente en la autorización para comprobar ese comando. Ningún documento privado de identidad/sesión, histórico o jugador debe exportarse al informe.
7. Sin `createBackend`, HTTP, Godot, transacciones de juego, escrituras, DDL, migraciones, `syncIndexes` o bootstrap. Los privilegios declarados de `insert/update` se inspeccionan, **no se prueban con escrituras** en V1.
8. Registrar solo categoría/etapa/código seguro, destino público, identidad, mecanismo explícito, matriz de permisos, metadatos conformes y resultado de cierre. No URI completa, contraseña, JWT, verificadores, token hashes, objetos completos del driver o stacks brutos.
9. `finally`: cerrar conexión/sesiones y destruir buffers/handle temporales; sin material persistido ni listeners. Fallo o incertidumbre → informar y detener, sin cambiar roles/contraseñas ni reintentar. No se necesita abrir la clave JWT para comprobar metadatos Mongo; esa clave corresponde al arranque HTTP posterior.

La preparación offline deberá demostrar: rechazo de destino/TLS/usuario/mecanismo incorrectos, falta/exceso de privilegios, secreto ausente, límites de tiempo, integridad y uso único, ausencia de DDL/escritura y cierre. Solo después se podrá proporcionar al propietario un comando manual exacto con rutas/hashes concretos y pedir la autorización real. No se solicitan credenciales en B63.

## 7. Aceptación, detención y reversión

| Etapa | Aceptación | Detención / reversión |
|---|---|---|
| Referencia externa | SHA/bytes/digest/3172 y verificador coincidentes; origen documentado | No activar si es copia local no acreditada o hay discrepancias |
| Activación v5 | Activo coincide con v5; política de metadatos conservada; verificador código 0; v4 recuperable | Ante fallo conservar referencias; restaurar bytes v4 desde respaldo verificado mediante procedimiento autorizado; no iniciar candidato con v4 |
| Creación rol/cuenta | Objetos nuevos exactos, sin roles/acciones extra, cuenta anterior intacta | No conectar si hay nombres ocupados o recursos amplios. No eliminar cuenta anterior ni reparar automáticamente |
| Primera lectura | SHA-256 autenticado, usuario/base/host/TLS y permisos exactos, esquema/semilla conformes, cierre completo | Cerrar ante cualquier fallo; sin fallback, writes ni retry. Mantener backend detenido |
| Escritura/arranque posterior | Necesita autorización propia; no está aceptado por V1 | Nunca deducir permiso para modificar datos de una conexión de lectura exitosa |

Reversión precisa de activación: con servicios detenidos, identificar activo/respaldos por hash, preservar el candidato nuevo, crear staging de los bytes v4 y restaurar únicamente el puntero de manifiesto activo siguiendo las mismas verificaciones de ruta/metadatos. **Restaurar solo v4 no hace compatible el código B60:** si se pretende arrancar el backend anterior, restaurar también sus archivos inventariados y validar las 3169 entradas contra v4. No restaurar datos, secretos o cuentas como parte del rollback de código.

Si la cuenta nueva ya existe cuando falle una etapa posterior, dejarla sin uso o tratarla según una autorización específica del propietario; no borrarla automáticamente. Volver a una contraseña expuesta no es una reversión segura. Cambiar usuario DB no exige recrear cuentas JWT de jugadores ni cambiar operationIds/recibos.

## 8. Exclusión de datos históricos y partidas reales

La preparación/activación local modifica, si se autoriza, **solo referencias de integridad**, no código ni datos. Crear rol/usuario afecta configuración Atlas, no colecciones. V1 no lee ni escribe documentos históricos; el catálogo puede revelar sus nombres, lo que no equivale a acceso de datos. El rol nuevo no autoriza `users`, `decisions`, `gameevents`, `gameprogresses`, `statisticevents`, `statisticsummaries`, `syncidentities`, otras bases ni `main_v2_authorization`.

No se abrirán SQLite real/B52 ni Godot en V1. Tampoco se importarán las 2151 operaciones históricas. Una campaña futura de escritura requiere nuevos runId/perfil/instalación/identidad técnica y sandbox HTTPS B57, guardia finita y limpieza exacta autorizados por separado. Esta cuenta Mongo nunca se entrega al videojuego.

El servicio tendrá escritura sobre las siete colecciones modernas, incluidas filas anteriores de esas colecciones: el rol no proporciona separación por documento/jugador. Los controles de dueño, fence e idempotencia siguen en el código. No prometer protección de todos los documentos previos de `main_v2_*` mediante RBAC de colección.

## 9. Resultado y próximos permisos requeridos

**B63 finalizada: referencias locales y reversión verificadas; procedimiento documentado.** Pendientes: contraste externo, preparación offline de la sonda, autorización de activación v5, autorización manual de rol/cuenta y, por separado, autorización de la primera sesión de lectura.

No se activó el manifiesto ni se emitió un canal/permiso remoto. B00 continúa pendiente por verificación efectiva Atlas, secretos y riesgos de integridad/ejecución bajo la misma cuenta Windows. No se inicia ninguna etapa real con este informe.
