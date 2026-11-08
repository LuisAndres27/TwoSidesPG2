# B05.4C.2D.1C — Preparación de un intento de solo lectura con Default

2026-10-28, America/Guatemala. **PREPARACIÓN OFFLINE COMPLETADA. NINGUNA CONEXIÓN REAL EJECUTADA.** El próximo intento requiere autorización expresa. D.1 sigue sin validarse; D.2 y B05.5 no iniciadas.

## Evidencia y objetivo

Se revisaron B05_ATLAS_AUTHENTICATION_DIAGNOSIS.md y B05_ATLAS_CONNECTION_DIAGNOSTIC.md. El último intento Node registrado falló en autenticación con MongoServerError 8000. El usuario confirma ahora que Compass conectó después de introducir manualmente la contraseña actual, usando TwoSidesCluster, twosides_integration_test, two_sides_integration_test, Authentication Database admin y Authentication Mechanism Default. No se accedió a Compass ni a su almacenamiento.

La identidad nominal y authSource coinciden con Node; el mecanismo solicitado difiere. El driver instalado negocia DEFAULT con los mecanismos anunciados por el servidor: prefiere SHA-256 si está anunciado y selecciona SHA-1 cuando solo está anunciado este último. El mecanismo realmente negociado por Compass sigue sin conocerse. No se presenta esta diferencia como defecto ni causa probada.

## Cambios mínimos preparados

| Archivo | Cambio |
|---|---|
| src/modules/sync/atlas-policy.js | authMechanism admite SCRAM-SHA-256 o DEFAULT. Omitirlo mantiene SHA-256. DEFAULT se rechaza con allowWrites true. La comprobación del cliente exige el mecanismo solicitado exacto, la misma identidad, admin y TLS estricto. |
| src/modules/sync/atlas-integration.js | Entrega al driver el mecanismo validado sin cambiar contraseña, identidad, destino, TLS o límites de tiempo. |
| src/modules/sync/atlas-readonly-probe.js | Registra authenticationMechanismRequested; no se presenta como mecanismo realmente negociado. |
| scripts/atlas-readonly-receiver.js | Exige manifiesto Phase B05.4C.2D.1C y AuthenticationMechanism DEFAULT. Fija DEFAULT y allowWrites false, conserva marcador exclusivo y verifica hashes antes de consumir credenciales. |
| tests/sync/atlas-default-auth.test.js | Ocho pruebas sintéticas N01–N08 de configuración, Mongoose real con connect interceptado, TLS, permisos, escritura y repetición. |

También se actualizan los dos informes revisados para remitir a esta preparación. No se modifica el canal PowerShell ni el decodificador corregido anteriormente. No cambia el mecanismo habitual de escritura. No hay selección por entorno para activar DEFAULT.

El receptor selecciona constantes de integración, no backend/.env/MONGODB_URI. La contraseña sigue en pass independiente, fuera de la URI y sin encodeURIComponent. Usuario twosides_integration_test y authSource admin se comprueban hasta las opciones normalizadas del driver. Certificado y nombre TLS continúan verificados; no se permite tlsInsecure ni callbacks de identidad alternativos. autoCreate, autoIndex y monitorCommands siguen desactivados. Límites: conexión/selección 10000 ms, recepción privada 10000 ms y proceso hijo 30000 ms.

## Pruebas sin red

**75 aprobadas, 14 excluidas, cinco archivos.** Incluyen ocho nuevas N01–N08 y la regresión anterior, sin sumar ejecuciones repetidas. Sintaxis Node comprobada en los cinco JS modificados/nuevos.

N03 atraviesa factory y Mongoose reales hasta MongoClient.connect interceptado antes de red. Comprueba DEFAULT, usuario, admin, destino, TLS normalizado con rejectUnauthorized true, ausencia de callback alternativo y resolución sintética SHA-256/SHA-1. Los sockets están bloqueados. C01–C05 vuelven a comprobar el canal PowerShell → Node con ocho entradas sintéticas y el comportamiento del driver, sin credenciales reales.

N02/N06 rechazan DEFAULT con escrituras antes del conector. N04 conserva la inspección de privilegios con dobles y bloquea crear el repositorio sin invocar modelos. N05 rechaza identidad/authSource/mecanismo distintos y variantes inseguras de TLS. N07 registra solo el mecanismo solicitado, cero escrituras/transacciones y cierre. N08 ejecuta copias sintéticas del receptor en Temp con manifiesto antiguo o marcador consumido: se detienen antes de cargar el conector/recibir credenciales; un resultado previo no se sobrescribe. No se ejecutó un receptor con manifiesto válido. Se verificó la ruta de los directorios sintéticos antes de eliminarlos.

Comando desde backend:

```powershell
node --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run tests/sync/atlas-default-auth.test.js tests/sync/atlas-credential-channel.test.js tests/sync/atlas.test.js tests/sync/atlas-readonly.test.js tests/sync/atlas-diagnostic.test.js --config vitest.config.js --testNamePattern '^(N\d{2}|C\d{2}|D\d{2}|R\d{2}|A(0[1-9]|10|16|2[1-5]|28|3[01679]))\b'
```

## Procedimiento futuro de un solo intento — NO ejecutado

1. Obtener autorización expresa para **una sola invocación autenticada de solo lectura con DEFAULT**, host <cluster>.<id>.mongodb.net, usuario twosides_integration_test, base two_sides_integration_test y authSource admin. Esta fase solo autoriza preparación offline. Todavía no existe un nuevo run privado utilizable.
2. Después de la autorización, revisar de nuevo código/pruebas y crear un directorio nuevo de un uso: `%LOCALAPPDATA%/TwoSides/AtlasIntegrationTests/b054c2c-<32 hex nuevos>`, fuera de OneDrive/Git. Verificar en lectura ausencia de enlaces/reparse points en ancestros, propietario legítimo y Allow limitado al usuario, SYSTEM y Administradores. Si no se cumple, detenerse sin modificar ACL/propietarios.
3. Copiar únicamente sender/receptor revisados y crear el manifiesto no secreto con Phase B05.4C.2D.1C, AuthenticationMechanism DEFAULT, RunId coincidente, AllowWrites false, TlsValidationRequired true, MaxProcedureInvocations 1 y ReceiverSha256 recién calculado. Dependencies contendrá exactamente ocho filas ordenadas con Path absoluto y SHA256 del código actual:

   - backend/src/modules/sync/atlas-integration.js
   - backend/src/modules/sync/atlas-policy.js
   - backend/src/modules/sync/atlas-readonly-probe.js
   - backend/src/modules/sync/atlas-readonly-connector.js
   - backend/src/modules/sync/atlas-error-diagnostic.js
   - backend/src/modules/sync/atlas-credentials.js
   - backend/tests/jwt/env-guard.js
   - backend/package-lock.json

4. Verificar procedencia y hashes de sender, receptor y dependencias. No reutilizar directorios, manifiestos, huellas o credenciales anteriores. Solo se calculan huellas de código, nunca de contraseñas. B00 sigue pendiente: esta verificación no protege de forma absoluta frente a un sistema comprometido.
5. Entregar al usuario un comando concreto con directorio/huella recién verificados para ejecutar manualmente el sender privado **una sola vez**. Plantilla informativa, no ejecutada; los marcadores se sustituyen después de la autorización:

```powershell
$atlasRunDir = '<directorio privado nuevo verificado>'
& (Join-Path $atlasRunDir 'send-atlas-test-credential.ps1') -AuthorizedForB054C2D -PrivateDirectory $atlasRunDir -ReceiverPath (Join-Path $atlasRunDir 'atlas-readonly-receiver.js') -ReceiverSha256 '<SHA-256 nuevo del receptor revisado>'
```

El nombre histórico del switch se conserva por compatibilidad; no constituye autorización por sí mismo. La entrada se realiza solo en el prompt oculto, nunca en chat, argumentos, entorno o archivos. No se extrae de Compass ni se añaden transformaciones/codificación porcentual. El sender limpia el entorno del hijo y libera buffers/BSTR controlados; no se garantiza borrado de cadenas inmutables .NET/JavaScript.

6. La ejecución manual activa el intento: el agente no debe iniciar otro receptor. readonly-attempt.started se crea mediante wx antes de recibir la entrada. Marcador o resultado previos bloquean la repetición; no borrarlos para reintentar ni siquiera tras un fallo. El driver puede realizar descubrimiento/monitorización internos: el límite es una invocación del procedimiento, sin bucles externos ni prueba adicional SHA-256/SHA-1.
7. Permitir solo autenticación, validación del destino, connectionStatus con privilegios, ping, hello, buildInfo opcional y cierre. La comprobación de permisos verifica el rol esperado sin ejercer escrituras. No modelos, colecciones, índices, migraciones, transacciones o datos de Godot. El éxito del sender no acredita autenticación o permisos.
8. Leer solo el resultado sanitizado: mecanismo solicitado DEFAULT, autenticación, destino/identidad verificados o pendientes, permisos si se alcanzaron, categoría/clase/código/etapa seguros y cierre. No URI, secreto, error original, stack o configuración completa. Fallo o resultado parcial obliga a detenerse; otra prueba requiere nueva autorización.

## Interpretación y límites

- Si DEFAULT funciona, demuestra conexión con la entrada/configuración del nuevo intento. **No demuestra por sí solo que SHA-256 causara el fallo anterior**, porque se introducirá otra vez el secreto y no se comparan valores. authenticationMechanismRequested no identifica el protocolo realmente negociado por Compass ni por el nuevo cliente.
- Si vuelve AUTHENTICATION_FAILURE, se habrá probado también negociación predeterminada, pero no bastará para atribuir el rechazo a entrega de credenciales, estado de usuario o mecanismo. No probar automáticamente otro mecanismo ni cambiar contraseñas/roles.
- Autenticación, privilegios y persistencia MongoDB son validaciones separadas. Un fallo posterior de privilegios no equivale a contraseña inválida. No se escribirán datos para validar persistencia.

No se creó un canal privado real ni se solicitó/recibió contraseña. No consultas DNS/TCP/TLS ni autenticación remota en D.1C. backend/.env y las tres bases SQLite quedaron fuera del acceso de las pruebas; no se certifican nuevamente sus hashes. Sin cambios de Godot, usuarios/datos Atlas, ACL o propietarios. B00 e identidad/revocación durable siguen pendientes. **Detenerse y esperar autorización antes de cualquier conexión real.**
