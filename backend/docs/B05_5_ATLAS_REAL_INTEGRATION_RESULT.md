# B05.5 Etapa 8 - Primera integración real Express -> MongoDB Atlas

**Estado: PREPARADA, NO EJECUTADA.** Este documento recoge las precondiciones offline. Todo lo marcado *pendiente* se rellena después de que el usuario lance el proceso; hasta entonces no se afirma ningún resultado remoto. B00 sigue pendiente.

## 1. Lo que se hizo en esta etapa (sin conexión remota)

No se conectó a Atlas, no se pidió ni se usó ninguna contraseña, no se leyó ni modificó `backend/.env`, no se ejecutó C.2/F.2, no se tocaron Godot, SQLite reales, ACL ni C2Runtime.

Se reutilizó sin cambios: perfil `integration`, repositorios Mongo (con la corrección de escalabilidad), JWT v2 RS256, endpoints reales de registro/sesión/ingesta/recibos, `authorization.js`, `schema-inventory.js`.

Se detectó una **carencia real**: la contraseña solo existe dentro del proceso del lanzador, y nada verificaba la persistencia ni limpiaba documentos sintéticos. Un script externo no puede hacerlo sin recibir otra contraseña. Se añadió, de forma opt-in:

| Pieza | Cambio |
|---|---|
| `src/integration/synthetic-run.js` (nuevo) | Escenario acotado: 1 cuenta, 1 lote de 10 operaciones (prefijo cerrado de los vectores C#, redirigido a un binding aleatorio), recibos, reenvío, conteo en Atlas, limpieza dirigida. Solo acepta `http://127.0.0.1:<puerto>`. |
| `src/integration/profile.js` | `collectionTotals` (conteos de metadatos), `countSyntheticDocuments`, `deleteSyntheticDocuments`; solo usan los filtros de `cleanupPlan(ids)`. |
| `src/integration/launcher.js` | Opción `--synthetic-run` (apagada por defecto). Corre el escenario, cierra HTTP y luego MongoDB, e imprime el resultado. Rechaza una `executionId` ya consumida (`authorization_consumed`). |
| `scripts/run-integration-backend.ps1/.js` | Interruptor `-SyntheticRun`; salida 0 si éxito, 2 si no. |
| `scripts/new-integration-authorization.js` (nuevo) | Genera el archivo de autorización fuera del repositorio, 60 minutos exactos, sin secretos. Un vencimiento obliga a emitir otro; nada lo amplía. |

No se eliminó ni debilitó ninguno de los tres candados (`-Enable`, archivo de autorización válido, contraseña por entrada oculta). No hay firma: el contrato real (`authorization.js`) es un JSON estricto sin firma ni emisor; no se inventaron campos.

## 2. Precondiciones (resultado offline)

| # | Comprobación | Resultado |
|---|---|---|
| 1 | Lanzador deshabilitado por defecto | Sí: sin `-Enable` / `--enable-integration` + autorización no arranca (IL01, SR05). |
| 2 | `npm start` no activa integration | Sí: `node src/server.js`; IP01 verifica que ningún archivo fuera de `src/integration` use el opener. |
| 3 | Base y usuario fijados en código | Sí: `ATLAS_TARGET`; autorización con `z.literal` para host/base/usuario. |
| 4 | Inventario de 7 colecciones | `integration_v2_{operations,facts,fences,identities,ownerGuards,identitySessions,revocations}`. |
| 5 | 5 índices únicos | `owner_operation_unique`, `scope_source_unique`, `identity_registration_unique`, `identity_binding_unique`, `identity_token_unique`. |
| 6 | Corrección de escalabilidad incluida | Sí (`fenceMode: 'owner'`, lecturas acotadas, escrituras delta). |
| 7 | Sin consultas de ingesta sin filtro | En el camino integration, SC09/SC10 lo verifican. `readState` (`find({})`) sigue existiendo solo para el modo global de C.2/diagnóstico. |
| 8 | Limpieza solo de sintéticos | `cleanupPlan(ids)`: ids UUID obligatorios, máx. 1 (autorización) / 4, sin filtros vacíos, hijos antes que padres; SR02 prueba que otro propietario queda intacto. |
| 9 | Sin procesos previos con el perfil | Ningún `node` con `run-integration-backend` / `--enable-integration`. |
| 10 | Pruebas offline | `node scripts/run-backend-regression.js`: **609 + 9 aprobadas, 16 omitidas, 0 fallos** (antes de SR08); tras SR08, las 31 pruebas de integración/launcher/synthetic pasan. |

Las 8 pruebas nuevas (`tests/sync/synthetic-run.test.js`, SR01-SR08) cubren: corrida completa en el doble, limpieza que respeta documentos ajenos, fallo tras el registro, ventana vencida, opt-in, prefijo de 10 operaciones, URL solo loopback y autorización de un solo uso. Son resultados del **doble**, no de Atlas.

## 3. Autorización emitida

- Archivo (fuera del repositorio, sin contraseña): `C:\Users\luis2\AppData\Local\TwoSidesIntegration\launch-authorization-2f545824af3551d8a6e96c38de84aebf.json`
- `executionId`: `2f545824af3551d8a6e96c38de84aebf`
- Ventana: `2026-10-31T02:14:05Z` a `2026-10-31T03:14:05Z` (60 min; 20:14 a 21:14 hora local, UTC-6).
- `allowCollectionPreparation: true`, `maxSyntheticPlayers: 1`.
- Si vence, se emite otra con `node scripts\new-integration-authorization.js "C:\Users\luis2\AppData\Local\TwoSidesIntegration" --allow-preparation`. Nada la renueva solo.

## 4. Procedimiento manual

Desde `backend\` en PowerShell:

```
.\scripts\run-integration-backend.ps1 -Enable -SyntheticRun -PrepareCollections -Authorization "C:\Users\luis2\AppData\Local\TwoSidesIntegration\launch-authorization-2f545824af3551d8a6e96c38de84aebf.json"
```

Escribe la contraseña de `twosides_integration_test` en la entrada oculta. `-PrepareCollections` solo actúa si la inspección de solo lectura encuentra colecciones o índices ausentes. Detención: Ctrl+C durante la ejecución cierra HTTP y luego MongoDB; el modo `-SyntheticRun` se cierra solo al terminar. Pegar la salida (JSON sin secretos) para completar el informe.

## 5. Resultados reales (pendiente)

Se rellenarán con la salida real: duración, TLS/autenticación, colecciones e índices creados o verificados, registro y login, operaciones aceptadas, recibos, idempotencia, persistencia, latencias, documentos creados y limpiados, errores, recursos cerrados. **Reinicio/reconexión (F): no se prueba en esta ejecución** (exigiría una segunda entrada de contraseña y nuevas claves RS256); queda pendiente.

## 6. Límites y riesgos conocidos

- Cierre de conexiones: el vencimiento de la autorización solo se comprueba al arrancar y antes de registrar/ingerir; **no cierra** conexiones abiertas. El modo sintético cierra por sí mismo al terminar; si se corta con Ctrl+C a mitad, la limpieza podría quedar incompleta y habría que revisar el manifiesto (`<executionId>.manifest.json`, junto al archivo de autorización, solo ids).
- Si falla algo, se detienen las escrituras nuevas y se limpia únicamente el id de la cuenta creada; la limpieza puede ejecutarse tras el vencimiento (es una reducción de riesgo, no una ampliación).
- `-PrepareCollections` sobre un esquema parcial puede fallar al re-crear una colección existente; no se fuerza.
- La comprobación `estimatedDocumentCount` es de metadatos y puede desviarse brevemente en Atlas; si difiere, el informe lo marcará, no se interpretará como fallo de aislamiento sin revisar.
- No medido en Atlas: `$in`, `countDocuments`, transacciones multi-documento con Mongoose real.
- B00 sigue pendiente. No se declara resuelto.

## 7. Verificación del transporte de la contraseña (offline, contraseñas ficticias)

Tras actualizar la contraseña en Atlas se revisó el tramo `Read-Host -AsSecureString` -> marco de 4 bytes + UTF-8 por stdin -> Node (`receiveAtlasCredential`). Se ejecutó el código real de `run-integration-backend.ps1` en Windows PowerShell 5.1 contra una sonda Node, con 16 contraseñas ficticias. Dos defectos demostrados y corregidos (sin tocar ningún control de seguridad):

1. `ReadInt16` devuelve un entero con signo: cualquier unidad de código >= U+8000 (CJK en ese rango, pares sustitutos como emoji, U+FEFF, U+FFFF) rompía la conversión a `[char]` y el script abortaba antes de lanzar nada. Corregido con `-band 0xFFFF`.
2. Con la consola en UTF-8 (página 65001), `Process` escribía un BOM delante del marco y Node rechazaba la credencial (`atlas_credential_required`). Con 850 y 1252 no ocurría. Corregido cambiando temporalmente la página de entrada a una sin preámbulo mientras arranca el proceso hijo y restaurándola después.

Sin defectos: ASCII, caracteres especiales, espacios iniciales/finales, Latin-1, comillas y barras, texto con aspecto de shell, 1024 bytes exactos (aceptado) y 1025 (rechazado). NUL, CR y LF se rechazan. El hijo recibe un entorno de solo `SystemRoot`, `windir` y `PATH`; el secreto no aparece en argumentos, entorno, salida ni archivos. Pruebas: `tests/sync/credential-transport.test.js` (CT01-CT05).
La entrada oculta en sí (que el terminal no muestre lo que escribes) no se puede automatizar; se verificó por código (`-AsSecureString`).

## 8. Diagnóstico de `atlas_authentication_failed` (offline, sin cambios de código)

Resultado remoto observado por el usuario (dos intentos, contraseña ya rotada): `reason=atlas_authentication_failed`, `stage=mongoose-connect`, `category=AUTHENTICATION_FAILURE`, `approxMs=700`. Fallo rápido, tras alcanzar el servidor: descarta DNS, TLS, IP y timeouts.

**Configuración efectiva** (Mongoose real + driver 7.7.0, red bloqueada, `connect()` interceptado; tests AU01): usuario `twosides_integration_test`, `authSource` `admin`, mecanismo `SCRAM-SHA-256` explícito, contraseña idéntica byte a byte (8 muestras ficticias: especiales, espacios, Unicode, emoji, `%40`, BOM inicial), sin credenciales en la URI, TLS estricto, host SRV y base fijos.

**Diferencia frente al conector de C.2** (AU02): solo `authMechanism` (`SCRAM-SHA-256` en integration, `DEFAULT` en C.2) y parámetros de pool/appName, que no intervienen en la autenticación. Usuario, authSource, TLS, destino y modo de entrega de la contraseña son iguales.

**Historial** (AU03): toda conexión autenticada con éxito (D.1C, primera escritura, C.2) usó `DEFAULT`; las que pidieron `SCRAM-SHA-256` explícito terminaron con error 8000. Con `DEFAULT` el driver usa SHA-256 si el servidor lo anuncia y SCRAM-SHA-1 si solo anuncia ese; con SHA-256 explícito nunca hace fallback.

**Sin defecto de código demostrado** en el transporte ni en la construcción de las opciones. No se aplicó ningún cambio al mecanismo: pasar a `DEFAULT` admite el fallback a SCRAM-SHA-1 y es una decisión de política pendiente de aprobación.

## 9. Comprobación aislada de autenticación (`-AuthCheck`, preparada, no ejecutada)

El lanzador sin `-SyntheticRun` ni `-PrepareCollections` sí arranca, pero si el esquema está completo deja un servidor HTTP escuchando (sin escrituras mientras nadie envíe peticiones) y si falta algo termina en `schema_not_ready` sin dejar claro que autenticó. Cambio mínimo: opción `--auth-check` (`-AuthCheck`), apagada por defecto, que usa los mismos tres candados, autentica, verifica privilegios (solo lectura), inspecciona el esquema (solo lectura), cierra y sale. No arranca HTTP, no admite `--port`, `--prepare-collections` ni `--synthetic-run`, no registra jugadores, no ingiere y no crea colecciones, índices ni la semilla. Mongoose no crea nada solo: todos los modelos usan `autoIndex:false`, `autoCreate:false`, `bufferCommands:false` y la creación solo existe en `prepareIntegrationCollections`.
Es de un solo uso: antes de conectar crea `<executionId>.manifest.json` junto al archivo de autorización (ids y código de resultado, sin secretos); un segundo intento, tras éxito o fallo, se rechaza con `authorization_consumed` antes de pedir conexión. SCRAM-SHA-256 explícito, TLS estricto y destino fijo no cambian. Pruebas: `tests/sync/auth-check.test.js` (AC01-AC07). Salida: JSON con `authenticated`, usuario, base, `authSource`, mecanismo, privilegios, estado del esquema y `writes: 0`; los errores usan los códigos/etapa/categoría de la sección de diagnóstico.
