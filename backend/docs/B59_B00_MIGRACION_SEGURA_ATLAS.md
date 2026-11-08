# B59 — Migración segura de autenticación y permisos de Atlas

Fecha: 2026-11-03, Guatemala. **Plan preparado; ninguna migración ejecutada.** Único archivo creado: este informe. No se conectó Atlas ni se iniciaron Express/Caddy; no se solicitaron secretos, crearon usuarios, cambiaron contraseñas, cuotas, fuentes, índices, colecciones, documentos, SQLite, Godot, ACL o certificados. No se generó manifiesto, no se ejecutaron pruebas, F3.10, commits ni push. Se ejecutó únicamente la verificación local de integridad: **v4 OK, 3169 archivos, cero diferencias**.

Evidencia: **código** = inspección actual; **documental** = resultado registrado anteriormente; **pendiente** = necesita autorización/evidencia futura. Roles, mecanismos y versión del servidor Atlas actuales no se comprobaron remotamente.

## 1. Diagnóstico de autenticación y estado B00

El perfil principal fija en `src/main/policy.js`:

- Host `<cluster>.<id>.mongodb.net`, base `two_sides_db`, usuario `twosides_backend`.
- `authSource=admin`, mecanismo `DEFAULT`, TLS estricto y verificación posterior del destino/identidad/opciones del cliente.
- `src/config/database.js` exige esas opciones; no incorpora contraseña en la URI ni admite parámetros que relajen TLS.
- Mongoose 9.11.2 según el paquete instalado; driver MongoDB 7.7.0 documentado en el diagnóstico SCRAM. Su `mongo_credentials.js` actual prefiere SHA-256 cuando `saslSupportedMechs` lo contiene; cuando la lista no lo contiene usa SHA-1; sin lista usa SHA-256.

Según `B05_5_MAIN_SCRAM_COMPATIBILITY_RESULT.md`, el propietario observó `["SCRAM-SHA-1"]` para la cuenta anterior y rechazo al forzar SHA-256. El cambio a DEFAULT permitió compatibilidad; B46 siguió registrando SHA-1 como riesgo pendiente. **Explica la negociación anterior, no la causa original de que faltase SHA-256 en esa cuenta.** No hay prueba de que fuera un usuario antiguo ni de que hoy siga igual.

Atlas admite SHA-256 por defecto; su documentación menciona regenerar credenciales mediante actualización de contraseña para usuarios anteriores a MongoDB 4.0. Eso no permite diagnosticar la antigüedad de esta cuenta. Para B59 se propone una cuenta nueva, sin alterar inicialmente la anterior; su funcionamiento se acreditará con autenticación explícita SHA-256, no solo con la lista anunciada. [Usuarios de base de datos Atlas](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/).

SCRAM es autenticación; TLS protege el transporte. La huella SHA-1 de identificación de la CA local no significa que TLS o Mongo utilicen SCRAM-SHA-1.

**B00 tiene dos ámbitos:** autenticación/privilegios Atlas y protección local de código/secretos. B11 documenta retirada y verificación de las dos ACE Allow investigadas; no corresponde repetirla. Persisten riesgos bajo la misma cuenta Windows y posibles copias antiguas de secretos (B15). Los manifiestos y el cierre B58 son evidencia posterior: no asumir que siguen faltando controles ya implantados. Migrar SCRAM no cierra automáticamente todo B00.

## 2. Permisos deducidos del código y del arranque

Hoy `verifyMainPermissions` exige exactamente `twosides_backend@admin` con un rol `readWrite` sobre `two_sides_db` y ciertas acciones a nivel de base. Rechaza recursos de otras bases, pero no rechaza todas las acciones adicionales dentro de esa base. El rol es coherente con el funcionamiento documentado, aunque **abarca más recursos/acciones que el recorrido normal observado**: no protege las colecciones históricas frente a una aplicación comprometida. No se inspeccionaron los permisos efectivos actuales de Atlas.

### Matriz de operación normal

Todas las colecciones siguientes pertenecen exclusivamente a `two_sides_db`:

| Función | Colecciones | Operaciones observadas | Privilegios propuestos |
|---|---|---|---|
| Registro técnico idempotente | `main_v2_identities`, `main_v2_ownerGuards` | Lectura de registro/binding; `updateOne` con upsert para identidad y guardia | `find`, `insert`, `update` |
| Inicio/validación de sesiones | `main_v2_identities`, `main_v2_ownerGuards`, `main_v2_identitySessions` | Lecturas, incremento de guardia, upsert de sesión y marcado de sesiones revocadas | `find`, `insert`, `update` |
| Coordinación durable/revocación | Las anteriores y `main_v2_revocations` | Lectura de autorización, incrementos/versiones y upsert de recibo de revocación | `find`, `insert`, `update` |
| Ingesta y relaciones | `main_v2_operations`, `main_v2_facts`, `main_v2_fences` | Lecturas por dueño/clave, conteos, upserts de hecho/operación y fence de propietario | `find`, `insert`, `update` |
| Consulta de recibos | `main_v2_operations` y coordinación de identidad/fence anteriores | Lectura de `record.receipt`; el recorrido de coordinación puede escribir guardias/fence | Lecturas y escrituras de coordinación indicadas arriba |
| Verificación de arranque | Las siete colecciones | `listIndexes` en cada colección, incluso si solo tiene `_id_`; lectura de semilla | `listIndexes` en cada una, más `find` en fences |
| Catálogo previo | Base `two_sides_db` | `listCollections({}, {nameOnly:true})` | `listCollections` a nivel de base, solo metadatos |

La propuesta de rol runtime es la **unión de esta matriz**: `find`, `insert`, `update`, `listIndexes` en esas siete colecciones y `listCollections` en la base. No es lectura/escritura arbitraria en `main_v2_*`: la lista debe enumerar nombres exactos, sin comodín. Un upsert necesita también inserción; una cuenta de solo inserción o un permiso aislado de lectura de recibos no bastan para Express completo.

Precisiones importantes:

- Los recibos de ingesta están embebidos en operaciones; **no hay una colección adicional de recibos** que deba crearse.
- `main_v2_authorization` es un modelo sin uso en este perfil y se omite en el arranque; no añadirle permisos por su nombre. No conceder acceso de datos a `users`, `decisions`, `gameevents`, `gameprogresses`, `statisticevents`, `statisticsummaries`, `syncidentities` ni otras bases.
- `estimatedDocumentCount()` de operaciones, usado por la válvula global, construye **`count`** en el driver instalado. No suponer que requiere `collStats`. El conteo debe verificarse con el rol candidato; no introducir privilegios administrativos para solucionar un error sin identificar el comando real.
- `listCollections` a nivel de base deja ver catálogo; no concede `find` sobre históricos. Permisos de colección tampoco impiden al servicio actualizar otro documento de sus propias colecciones, incluida potencialmente la semilla: autorización por dueño y semilla protegida siguen dependiendo del código.
- Transacciones requieren permisos para las operaciones que contienen, no un rol administrativo genérico. Que `hello` o `commitTransaction` se dirijan a `admin` no autoriza ni necesita lectura/escritura de sus datos. No conceder `killAnySession`, `killAnyCursor` ni administración de réplica. [Transacciones y control de acceso](https://www.mongodb.com/docs/manual/reference/method/session.starttransaction/).

### Índices y provisión

`main/profile.js`, los dos modelos y el conector fijan `autoCreate=false`, `autoIndex=false`, `bufferCommands=false`. El arranque **inspecciona**, no provisiona: catálogo, siete colecciones, índices, semilla `_id=ingestion-v1` y primario de replica set; después calienta verificaciones F1. El calentamiento incluye una transacción vacía de verificación, no escrituras de juego.

Índices secundarios existentes que se deben conservar: `owner_operation_unique`, `scope_source_unique`, `identity_registration_unique`, `identity_binding_unique`, `identity_token_unique`, además de `_id_` en cada colección. **No recrear índices, colecciones o semilla en esta migración.** El helper de preparación de índices y el bootstrap existen para provisión separada, no se llaman desde el arranque normal.

Excesos para runtime: `readWrite` sobre toda la base, `readWriteAnyDatabase`, `dbOwner`, `dbAdmin`, `atlasAdmin`, `remove`, DDL, `bypassDocumentValidation`, administración de usuarios/roles y acceso a bases ajenas. No concederlos para que una herramienta antigua pase sus verificaciones.

## 3. Arquitectura de cuentas propuesta

**Cambio de estrategia respecto de B56:** allí se proponía reducir privilegios manteniendo el nombre anterior. B59 pide preparar una **cuenta nueva**; se propone transición paralela con la anterior intacta hasta demostrar el nuevo recorrido.

Nombres siguientes son propuestas, no objetos creados ni confirmados existentes:

| Identidad | Uso y ámbito | Separación |
|---|---|---|
| Propietario/operador Atlas | Crear roles/usuarios y restricciones de clúster/red mediante Atlas UI/CLI/API | Su identidad de control Atlas no es una contraseña DB que reciba Express |
| Cuenta DB de provisión/mantenimiento, solo si se necesita | DDL o limpieza específicos con autorización propia, recursos y tiempo acotados | Ninguna provisión se necesita para cambiar autenticación; no crearla por rutina ni usarla como runtime |
| **`twosides_backend_v2`** | Cuenta DB nueva de servicio, SCRAM-SHA-256, rol propuesto `two_sides_main_runtime_v1` con la matriz anterior | Solo Express; restricción al clúster previsto/IP de salida; no heredar `readWrite` |
| **`twosides_inspector_v1`**, si se necesita separación operacional | Rol propuesto `two_sides_main_inspect_v1`: `find`/`listIndexes` solo en las siete colecciones y `listCollections` en la base | Lectura delimitada, sin insert/update/remove; no lee/verifica secretos de identidades en informes |
| `twosides_backend`, anterior | Conservar inicialmente para reversión de configuración autorizada | No borrar, rotar ni modificar durante la creación/validación de la nueva; evaluar después su retirada |

La cuenta técnica de un jugador Sync v2 (registro, secreto protegido, JWT) es **otra identidad**, almacenada en `main_v2_identities`. Cambiar el usuario DB del backend no cambia esos IDs ni exige reinscribir jugadores, rotar JWT, borrar recibos o migrar partidas. `twosides_integration_test` tampoco sustituye a la nueva cuenta principal.

Las acciones asignadas a varias funciones son acumulativas: no sumar un rol restrictivo a `readWrite` esperando reducirlo. Se comparará la **unión efectiva** por recurso, incluyendo roles heredados. El nombre de base donde se define un rol personalizado puede ser distinto del recurso que autoriza: registrar su namespace real y fijarlo en la política; no confundir `authSource=admin` con permisos sobre datos de `admin`.

Atlas permite separación mediante roles personalizados; Free/Flex puede tardar hasta 30 s en propagar cambios. El propietario debe confirmar acciones disponibles y restricciones del clúster. [Roles personalizados Atlas](https://www.mongodb.com/docs/atlas/security-add-mongodb-roles/).

## 4. Cambios locales que serán necesarios, todavía no autorizados

1. **Política candidata fijada a la cuenta nueva y SHA-256 explícito.** Cambiar el destino de identidad autorizado en `main/policy.js`; mantener host/base y fijar `MAIN_AUTH_MECHANISM='SCRAM-SHA-256'`. No aceptar usuarios/URI arbitrarios por argumentos o variables ni fallback a la cuenta anterior.
2. **Verificador de privilegios.** El actual rechaza un rol personalizado o la cuenta nueva. Sustituir la expectativa `readWrite` por identidad y roles previstos, recursos exactos, mínimos necesarios y rechazo de excesos. Considerar expansión/agrupación de permisos del servidor sin depender del orden de arrays. Fallo antes de abrir HTTP si no se acredita.
3. **Inspección segura.** `main/inspection.js` exige `read`/`readWrite` a nivel de base y enumera/counta colecciones del catálogo. No es directamente compatible con un inspector restringido a siete colecciones: acotar su recorrido y autorizaciones a estas, o preparar un probe mínimo de lectura. No ampliar el rol para acomodar suposiciones históricas de la herramienta.
4. **Contratos relacionados.** Revisar `config/database.js`, `main/profile.js`, conectores/inspección, autorizaciones, `schema-inventory.js`, pruebas y herramientas efectivamente utilizadas que fijan `MAIN_TARGET.user`, DEFAULT o `readWrite`. El bootstrap antiguo debe quedar separado y cerrado; no adaptarlo para que la cuenta runtime tenga DDL. No reutilizar autorizaciones anteriores: cambió el principal esperado.
5. **Guardia de integridad.** El lanzador actual permite omitir todos los argumentos de integridad y solo emite advertencia. Para la campaña exigir manifiesto/ancla/huella JWT mediante invocación revisada; antes de publicación, hacer ese control obligatorio en la ruta soportada o en el servicio que la gobierne, sin bypass de arranque. No es suficiente que exista un manifiesto en disco.

Esto no requiere modificar `ingestion-engine`, `mongo-ingestion-repository`, `mongo-identity-repository`, `budget.js`, contratos JWT/Sync, modelos, índices ni F1/F2. **La compatibilidad es viable por diseño, pendiente de regresiones y prueba real**; no declarar que la nueva cuenta ya funciona. Los invariantes F1/F2 no se renegocian: caché acotada/invalidation, fence de dueño, mismo contexto transaccional, presupuesto previo a commit, espera del resultado real, incertidumbre sin ACK, idempotencia y recibo original.

## 5. Procedimiento por etapas A–G

En esta tabla «agente» incluye la herramienta de desarrollo que ejecute el trabajo (la solicitud la denomina Claude Code). **B59 no autoriza ninguna de las acciones futuras.** Las autorizaciones locales, de control Atlas, de conexión de lectura y de escrituras son decisiones independientes.

### A. Comprobaciones previas de seguridad

- **Agente, con autorización local posterior:** revisar candidato/diff, respaldo y pruebas offline; confirmar no `.env`, destino fijo, TLS, secreto por canal protegido y apagado fiable; verificar integridad y preparar nuevo sellado tras cambios. Reutilizar B57/B58, sin repetir campañas completas innecesariamente.
- **Propietario:** aprobar nombres/rol/IP/clúster, revisar riesgo B00 y elegir alcance de la campaña. Conservar configuración anterior sin secretos y plan de recuperación.
- **Datos que pueden cambiar:** solo fuentes/pruebas/documentación y nuevo paquete local, tras autorización; nada remoto. El v4 queda intacto.
- **Evidencia:** hashes, diff, regresiones, matriz de permisos y ancla independiente del candidato final.
- **Detención:** falta de referencia, controles omitibles en la invocación elegida, secretos expuestos o incertidumbre sobre destino → no pedir contraseña ni conectar.
- **Reversión:** descartar candidato; el paquete anterior no cambia. No resetear permisos del equipo.

### B. Preparar la nueva cuenta de servicio

- **Propietario, autorización específica Atlas:** crear rol y usuario nuevos exactos mediante Atlas UI/CLI/API; comprobar previamente que los nombres no existan para no sobrescribir otros objetos. Contraseña nueva, no reutilizada; guardar en gestor privado y limitar clúster/IP. No entregar al agente el secreto por chat. Crear inspector solo si la separación acordada lo requiere.
- **Agente:** proporcionar la matriz y revisar evidencia sanitizada; no automatizar cambios de cuentas sin autorización adicional.
- **Datos que pueden cambiar:** objetos de control/roles/usuario e IP permitida, no documentos de juego/índices/colecciones. **Cuenta anterior intacta.**
- **Evidencia:** nombre/authSource, rol y privilegios/recursos, restricción de clúster, registro de actividad Atlas, fecha; nunca contraseña ni su hash.
- **Detención:** privilegio no disponible, objeto preexistente inesperado, permiso amplio no acordado o propagación no acreditada → no conectar. Esperar propagación no autoriza reintentos autenticados ilimitados.
- **Reversión:** no activar la cuenta nueva. Cambios de control nuevos se retirarían solo por el propietario con autorización, sin afectar la cuenta anterior; la eliminación no es un paso automático.

### C. Validar SCRAM-SHA-256

- **Agente, nueva autorización de lectura y activación manual:** una sesión acotada con probe revisado, usuario nuevo fijado, `authSource=admin`, SHA-256 explícito y TLS estricto; sin servidor HTTP, modelos autoinicializados, escrituras o transacciones de juego. Se puede compartir la sesión con D si se autoriza el conjunto de comandos de antemano.
- **Propietario:** introducir la contraseña en entrada oculta del canal nuevo/revisado; no reutilizar credenciales temporales caducadas ni copiar contraseñas de Compass.
- **Datos que pueden cambiar:** auditoría de conexión del proveedor; ningún documento de aplicación.
- **Evidencia:** autenticación exitosa bajo configuración explícita, destino e identidad comprobados, mecanismo anunciado como dato complementario, cierre. Lista de mecanismos por sí sola no acredita éxito.
- **Detención:** fallo TLS, autenticación o identidad → cierre, categoría sanitizada y sin retry/degradación automática a DEFAULT/SHA-1.
- **Reversión:** no cambiar todavía el backend activo; conservar ambos principales. No cambiar contraseñas a ciegas para repetir.

### D. Validar privilegios mínimos y arranque sin DDL

- **Agente, en la sesión autorizada:** `connectionStatus` con `showPrivileges:true`, catálogo, índices, semilla, `hello` y lecturas/conteos delimitados. Revisar la unión efectiva y comprobar compatibilidad real de `count`/listado. No intentar borrar históricos o crear índices para «demostrar» una denegación; los negativos destructivos se prueban offline y los excesos se comprueban por privilegios efectivos.
- **Propietario:** confirmar rol/namespace y restricciones. Si falta una acción, revisar el comando concreto antes de decidir un ajuste; no añadir `readWrite` provisionalmente.
- **Datos que pueden cambiar:** solo logs de acceso; no documentos/índices.
- **Evidencia:** lista sanitizada de privilegios, índices/semilla conformes y resultado de comprobaciones. `connectionStatus` permite examinar identidad y permisos efectivos de la conexión; no requiere dar a Express administración de usuarios. [Contrato oficial](https://www.mongodb.com/docs/manual/reference/command/connectionstatus/).
- **Detención:** acciones/recursos extras, semilla incompatible o índice ausente → no abrir HTTP ni ejecutar bootstrap. Revocar/cerrar el scope local al fallar.
- **Reversión:** candidato no activado; no modificar esquema ni cuenta anterior. Un ajuste de rol sería otra acción del propietario, documentada y acotada.

### E. Autenticación y operaciones sintéticas

- **Agente, autorización de escritura separada:** validar el candidato con repositorios reales y cuenta DB nueva, JWT técnico nuevo, runId/instalación/perfil/partida nuevos, una secuencia pequeña de operaciones válidas y padres confirmados. Preservar B56: guardia de campaña con máximo propuesto 16 operaciones nuevas y ventana de 5 min, a implementar/verificar antes de la ejecución; cuotas intactas. Un propietario sintético, sin pruebas de carga/carreras C.2/F.2.
- **Propietario:** activar manualmente el canal y autorizar por separado HTTPS/CA si interviene Godot. Usar únicamente las banderas B57 con sandbox y APPDATA aislado; B58 ya validó ese recorrido offline.
- **Datos que pueden cambiar:** documentos nuevos de las siete colecciones: registro, sesión, guardias/fence propios, operaciones/hechos; revocación solo si fue explícitamente incluida. No modificar semilla compartida, índices, históricos ni campañas previas. No importar las 2151 operaciones pendientes.
- **Evidencia:** inventario exacto de IDs nuevos y deltas, recibo persistido, reenvío idéntico `duplicate` con receiptId original, consulta `found`, reconexión y dueño correcto. Ningún ACK sin commit acreditado. Si se utiliza Godot, distinguir cierre de telemetría local de confirmación remota del hecho terminal (limitación B58).
- **Detención:** salida de límites, escritura incierta, autorización equivocada o delta inesperado → parar nuevos lotes, esperar/conciliar y no limpiar. No tratar 503 como ausencia de escritura ni generar nuevos IDs para reintentar.
- **Reversión:** detener candidato sin tocar la base real del jugador. Limpieza remota requiere autorización e identidad de mantenimiento separadas, por IDs/ownership exactos; runtime no tendrá `remove`. No borrar documentos anteriores, semilla, colecciones o índices. Si no se autoriza limpiar, conservar los sintéticos inventariados y declararlo.

### F. Cambio controlado del backend a la nueva cuenta

- **Agente, autorización de despliegue:** drenar el proceso anterior y conciliar operaciones en vuelo; cerrar su pool. Activar el paquete candidato sellado, exclusivamente con la cuenta nueva y secreto nuevo. Verificar permisos/índices de nuevo antes de abrir loopback HTTP. No conmutar automáticamente a la cuenta vieja si falla.
- **Propietario:** confirmar ventana, entregar credencial por canal acordado y autorizar el cambio. La cuenta antigua **se conserva** hasta completar aceptación y observación acordada.
- **Datos que pueden cambiar:** estado de proceso/despliegue y operaciones nuevas de clientes que se autoricen después; cambiar usuario DB no migra datos ni modifica IDs/recibos existentes. En esta campaña no habilitar clientes reales.
- **Evidencia:** digest del paquete, principal y permisos efectivos, arranque, health, pruebas sintéticas aprobadas y cierre del pool anterior.
- **Detención:** discrepancia de integridad, perfil, privilegios o readiness → cerrar candidato, conservar pendientes y no abrir tráfico.
- **Reversión:** solo por decisión explícita, paquete anterior con su ancla y credencial autorizada todavía válida. Si se sospecha compromiso de esa credencial, **no usarla para rollback**: mantener servicio detenido y provisionar recuperación segura. No eliminar la nueva cuenta como reacción automática.

### G. Verificación de integridad y cierre

- **Agente:** verificar hashes/estado esperado, recibos/deltas propios, cierre de procesos/sesiones/listeners y limpieza de temporales propios; confirmar retirada manual de CA si se utilizó. No hacer limpieza por prefijo/fecha ni borrar una operación cuyo commit siga incierto.
- **Propietario:** retirar CA temporal, rotar la credencial nueva si la política de la campaña lo exige y autorizar **posteriormente** suspensión/retirada de la cuenta anterior cuando la nueva quede aceptada. Rotar no es eliminar su identidad.
- **Datos que pueden cambiar:** solo los temporales propios y documentos sintéticos exactos si hubo autorización específica; los cambios posteriores de cuentas se autorizan aparte.
- **Evidencia:** informe PASS/FAIL, inventario final, estado de incertidumbres, hashes, cierre y confianza temporal retirada. No contener secretos, JWT, URI completa con credenciales ni stacks del driver.
- **Detención/reversión:** fallo de comparación mantiene la migración sin aceptar; preservar evidencias, no borrar y no continuar con otra fase. Restaurar paquete/configuración según F si se autoriza; ninguna reversión automática de datos históricos.

## 6. Seguridad del despliegue y arranque desatendido

### Estado actual

`run-main-backend.ps1` pide secreto con `Read-Host -AsSecureString`, convierte a UTF-8 estricto y envía una trama binaria por stdin a `src/server.js`; limpia buffers y BSTR. Entorno del hijo limpio, sin `.env`/MONGODB_URI/password; no importa secretos al cliente. `startMainBackend` valida la clave JWT antes de consumir el secreto; los fallos cierran conexión/scope. Node consume un handle de credencial de un solo uso; cadenas JS/driver pueden seguir en memoria y no se promete borrado físico garantizado.

La clave JWT persistente se carga fuera del proyecto/OneDrive; no se regenera en cada arranque. Validación de configuración y driver: TLS estricto, SRV/host/base fijos, `autoIndex/autoCreate=false`, pool máximo 5, timeouts de conexión/selección/socket 10 s y espera de pool 2 s. `mainConnector` y `server.js` exponen errores genéricos; la inspección dispone de clasificador sanitizado. Conservar la categoría/etapa necesarias sin imprimir el error bruto/configuración.

### Campaña local frente a publicación

| Área | Indispensable para campaña sintética local | Antes de publicar/operación desatendida |
|---|---|---|
| Credencial DB | Entrada oculta manual, stdin/RAM, sin archivos/argv/env/chat, cuenta nueva limitada | Proveedor de secretos protegido por identidad del servicio, acceso auditable y rotación; nunca un texto plano en OneDrive o script |
| Arranque | Interactivo supervisado, controles de integridad obligatorios en la invocación | El lanzador actual **no es desatendido**; proveedor explícito para servicio/secret manager e integridad obligatoria. `startMainBackend` admite proveedor inyectado, pero `runMainFromProcess` actual solo recibe stdin; falta elegir/implementar el despliegue |
| Identidad Windows | Riesgo B00 reconocido/mitigado para una ventana específica | Cuenta de servicio de bajo privilegio, código no escribible por ella, protección de secreto/clave y permisos verificados bajo autorización separada; no prometer privacidad contra la misma cuenta |
| Atlas TLS | SHA-256 explícito y certificado/hostname normales; sin bypass | Misma política estricta; actualización de runtime/dependencias y renovación controlada |
| Red | IP de salida precisa y restricción del usuario al clúster; Express solo loopback | Acceso de red mínimo y proxy público TLS confiable. No abrir `0.0.0.0/0`, no exponer 3000 directamente ni entregar Mongo al juego |
| HTTPS del juego | CA temporal manual B55/B58 con retirada comprobada | Certificado público/gestionado para el dominio previsto; no distribuir una CA de pruebas como solución permanente |
| Rotación | Secreto nuevo de la nueva cuenta; anterior intacto mientras se valida | Ventana de solapamiento controlada, reinicio de pools para acreditar el secreto nuevo, retirada de credenciales viejas cuando se apruebe |
| Logs | Categoría/etapa/código seguro y recibos sintéticos acotados | Política de redacción/retención, sin contraseñas/tokens/verificadores ni volcado de documentos de identidad |

La separación de cuentas DB reduce el radio de daño, pero quien obtenga el secreto runtime conserva acceso a todos los documentos autorizados de esas colecciones. No hay aislamiento por jugador mediante roles Mongo en este diseño; lo aplica Express. La cuenta de inspección tampoco debe exportar los verificadores de credenciales de `identities` ni token hashes de sesiones a informes.

## 7. Pruebas de aceptación propuestas

**No ejecutadas en B59.** No hace falta repetir B58 ni cambiar cuotas para preparar estas pruebas.

1. Offline: driver/Mongoose real con conexión interceptada acredita SHA-256 explícito, usuario nuevo, admin/TLS, especiales/Unicode preservados y rechazo de DEFAULT/SHA-1/usuario anterior/destino incorrecto antes de red.
2. Offline: permisos nuevos completos aceptados; acciones ausentes o excesivas, roles heredados amplios, otras bases/colecciones, wildcard, principal incorrecto o namespace de rol no acordado rechazados. Un rol por nombre correcto no basta sin sus privilegios efectivos.
3. Offline: arranque con siete colecciones/índices/semilla; cero llamadas `createCollection`, `createIndexes`, `syncIndexes` o migraciones; DDL ausente no se repara automáticamente. Rechazo de guardia omitida en el camino de despliegue autorizado.
4. Regresión F1/F2: caché acotada/invalidation, verificación en frío y caliente, guardia por dueño, commit confirmado/abortado/incierto, fallo de autenticación/permiso durante sesión, reintento por mismo ID y recibo original. Sin editar la compuerta ni presupuestos para hacer pasar la migración.
5. Regresión cliente/contrato: identidad técnica y JWT no cambian; `quota_exceeded` sigue pausando con B54; dependencias y operaciones pendientes conservadas ante indisponibilidad del backend.
6. Primera conexión futura: éxito SHA-256 **con la nueva cuenta de aplicación**, no inferido del inspector o de Compass. Identidad exacta, permisos efectivos y cierre acreditados por probe de lectura, sin escrituras.
7. Operaciones sintéticas posteriores: registro/sesión, commit, `duplicate`, recibo `found` tras reconectar y deltas exactos; históricos intactos por controles/inventario autorizado. Los tests con dobles no sustituyen esta evidencia real ni certifican privilegios remotos.

Un error 8000 no se interpretará automáticamente como contraseña incorrecta fuera de su contexto. Registrar clasificación sanitizada y etapa; fallo de privilegios no debe «corregirse» cambiando autenticación o agregando administración. Si la incertidumbre de commit persiste, no hay aceptación ni limpieza.

## 8. Compatibilidad con v4 y reversión

La verificación local B59 confirmó **v4 intacto**. Su digest no autoriza archivos editados: el cambio futuro de política/verificadores/scripts exige respaldo, regresión y **nuevo manifiesto candidato con nueva referencia externa**. No generarlo hasta tener los cambios finales; no sobrescribir v4 ni editar su lista de archivos para ocultar diferencias. B57/B58 son cambios/evidencia del cliente fuera del alcance del manifiesto backend.

Matriz de reversión:

- **Antes del corte:** todo sigue en el paquete/cuenta anteriores; la nueva cuenta se valida sin mutar la vieja. Detener candidato es suficiente para revertir la activación.
- **Después del corte:** drenar/conciliar, cerrar pool nuevo y, si se autoriza y es seguro, arrancar paquete anterior con su propia ancla/credencial. No aceptar simultáneamente ambas identidades por fallback silencioso.
- **Datos:** un rollback de binario no revierte un commit. Conserva operationIds/recibos/JWT técnicos; no reinscribir jugadores, desconfirmar ni borrar datos para volver atrás.
- **Secretos:** una contraseña rotada/revocada no se recupera restaurando código. No guardar una copia en el paquete. Si se conoce una exposición, la disponibilidad no justifica reusar el secreto comprometido.
- **Roles:** no reponer `readWrite` para desbloquear un test sin evaluación/autorización. Corregir el permiso mínimo que demuestre faltar o mantener el servicio detenido.
- **Cuenta anterior:** **no eliminar antes de comprobar la nueva**. Conservarla inicialmente no es una decisión de seguridad permanente: acceso amplio/credencial potencialmente expuesta requieren tratamiento explícito al aceptar la migración.

## 9. Riesgos y qué posponer

Pendientes reales: soporte/auth efectiva SHA-256 de la nueva cuenta, permisos normalizados bajo el servidor real, restricciones de red actuales, proveedor desatendido, protección Windows y copias antiguas, procedencia del despliegue, guardia finita de campaña y conciliación/cierre de telemetría señalado en B58. El requisito de nueva cuenta es incompatible con las fijaciones actuales hasta implementar el candidato local. Ninguno se considera resuelto por este documento.

Se puede posponer para la **campaña local**: servicio Windows desatendido, cuenta de provisión permanente, revocación de la cuenta anterior hasta la aceptación, optimizaciones de historial, aumento de cuota/compactación, rediseño de identidad de jugadores, telemetría adicional y funcionalidades de publicación. No posponer SHA-256 explícito, rol acotado, canal protegido, integridad, aislamiento de sandbox, aprobación de operaciones ni cierre.

## 10. Condiciones para autorizar la primera acción real en Atlas

La primera acción propuesta es **B: crear el rol acotado y la nueva cuenta**, no conectar el backend. Antes de autorizarla deben existir:

1. Nombres finales, recursos/acciones y clúster/IP aprobados; autorización de qué objetos de control pueden crearse, sin tocar cuenta anterior ni datos.
2. Decisión de propietario sobre protección/almacenamiento del secreto y riesgo residual B00; nadie pide su contraseña por chat.
3. Candidato local/sonda compatible preparado y revisado mediante una **autorización de implementación separada**, con regresiones offline y plan de sellado, o compromiso explícito de mantener la nueva cuenta sin uso hasta cumplirlo. Crear usuario no prueba que el backend pueda usarlo.
4. Exportación/descripción sanitizada de la configuración anterior y responsables de recuperación; ausencia de nombres nuevos inesperadamente ocupados.
5. Límites claros: solo configuración de rol/usuario/red acordada; **ninguna conexión, escritura sintética o activación main implícita**. Las etapas C/D, E y F necesitarán sus propias autorizaciones y activaciones manuales.

**B59 finalizada: plan local preparado. No hay autorización de implementación ni primera acción Atlas ejecutada. B00 permanece pendiente.**
