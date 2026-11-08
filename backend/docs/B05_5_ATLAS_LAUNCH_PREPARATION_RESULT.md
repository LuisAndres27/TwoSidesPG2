# B05.5 Etapa 7 — Preparación de la prueba real de Express con Atlas

Continúa `B05_5_ATLAS_INTEGRATION_PROFILE_RESULT.md`.

**Estado:** el lanzador manual y el inventario del esquema están **preparados y probados offline** (dobles de MongoDB y de `mongoose`). **No se conectó Atlas, no se solicitó ni usó ninguna contraseña real, no se creó ninguna colección ni índice remoto, no se leyó `backend/.env`, no se ejecutó C.2 ni F.2, y no se tocó Godot (ni escenas), partidas SQLite, ACL, propietarios ni C2Runtime. No se emitió ninguna autorización operativa de conexión** (el repositorio no contiene ningún archivo de autorización; hay una prueba que lo comprueba). B00 continúa pendiente.

## 1. Archivos creados / modificados

| Archivo | Qué es |
|---|---|
| `backend/scripts/run-integration-backend.ps1` | **Nuevo.** Envoltorio Windows: entrada **oculta** de la contraseña, la envía por stdin en un solo marco con longitud, entorno hijo vacío (solo `SystemRoot`, `windir`, `PATH`). Deshabilitado sin `-Enable`. Compatible con Windows PowerShell 5.1. |
| `backend/scripts/run-integration-backend.js` | **Nuevo.** Punto de entrada delgado: carga `mongoose` dinámicamente solo después de las precondiciones; maneja SIGINT/SIGTERM con cierre ordenado. |
| `backend/src/integration/launcher.js` | **Nuevo.** Precondiciones, apertura del perfil, inspección del esquema, composición e inicio en 127.0.0.1. |
| `backend/src/integration/authorization.js` | **Nuevo.** Validador estricto de la autorización de lanzamiento que debe aportar el operador (esta etapa no emite ninguna). |
| `backend/src/integration/schema-inventory.js` | **Nuevo.** Inventario exacto (colecciones, índices, documentos, operaciones) y plan de limpieza (solo datos/filtros; nada lo ejecuta). |
| `backend/src/integration/profile.js` | `inspectIntegrationSchema` (solo lectura) y `prepareIntegrationCollections` ajustado a las 7 colecciones del inventario. |
| `backend/tests/sync/integration-launcher.test.js`, `tests/sync/support/integration-double.js` | **Nuevos/ampliados.** 11 pruebas y dobles (`listCollections`, preparación simulada, `mongoose` falso, cliente HTTP). |

Sin cambios: Godot, `package.json`, `npm start`, `src/server.js`, repositorios Mongo, rutas, C.2.

## 2. Comando manual propuesto (NO ejecutar todavía)

```powershell
cd "<repo>\backend"
.\scripts\run-integration-backend.ps1 -Enable -Authorization "C:\ruta\fuera-del-repo\launch-authorization.json" [-Port 3000] [-PrepareCollections]
```
Pide la contraseña con entrada oculta, valida todo y escucha en `http://127.0.0.1:<puerto>`. Detener con Ctrl+C (cierra HTTP y luego la conexión MongoDB). Un lanzamiento sin `-Enable`, sin archivo de autorización válido, sin credencial o con cualquier otra opción termina con un código de motivo fijo (`reason=…`) que nunca contiene datos del usuario ni secretos.

**Precondiciones, en este orden y antes de conectar:** (1) `--enable-integration` + `--authorization` y ninguna otra opción (no existen host, URI, base, usuario, perfil, archivo de entorno ni contraseña por argumento); (2) Windows, no producción, Node ≥ 20, stdin es una tubería (nunca terminal); (3) autorización vigente (ventana ≤ 4 h, clúster/base/usuario exactos, `executionId` de 32 hex, `maxSyntheticPlayers` 1–4, `allowCollectionPreparation` booleano), archivo regular ≤ 4 KiB y no enlace; (4) credencial en un marco de ≤ 1024 bytes sin saltos de línea; (5) `mongoose` carga y la conexión, TLS, usuario SCRAM `twosides_integration_test` (authSource `admin`) y rol exacto `readWrite` sobre `two_sides_integration_test` se verifican (solo lectura) **antes de cualquier escritura y antes de escuchar**; (6) esquema completo (inspección de solo lectura) — si no, se detiene; crear colecciones exige `-PrepareCollections` **y** una autorización con `allowCollectionPreparation=true` (si falta, se rechaza antes de leer la contraseña).

Formato de la autorización (plantilla, **no emitida**; el operador la crea cuando decida autorizar):
```json
{"schemaVersion":1,"kind":"atlas-integration-launch","executionId":"<32 hex>","host":"<cluster>.<id>.mongodb.net",
 "database":"two_sides_integration_test","user":"twosides_integration_test","notBefore":"<UTC>","notAfter":"<UTC, <= 4 h después>",
 "allowCollectionPreparation":false,"maxSyntheticPlayers":2}
```

## 3. Inventario del esquema (`two_sides_integration_test`)

Prefijo fijo `integration_v2_`. **No** se reutiliza ni modifica nada de C.2/C.2A (`b054c2c_*`): el lanzador solo *cuenta* colecciones ajenas.

| Colección | Contenido | Índices requeridos (únicos, además de `_id_`) |
|---|---|---|
| `integration_v2_identities` | cuentas técnicas sintéticas (verificador Argon2id, vínculo, versiones) | `identity_registration_unique {registrationId}`; `identity_binding_unique {installationId, localPlayerId}` |
| `integration_v2_ownerGuards` | revisión por cuenta (guarda de autorización durable) | — |
| `integration_v2_identitySessions` | sesiones tras los JWT de 15 min (hash, nunca el token) | `identity_token_unique {tokenHash}` |
| `integration_v2_revocations` | comandos de revocación idempotentes | — |
| `integration_v2_operations` | una operación aceptada por documento | `owner_operation_unique {technicalAccountId, operationId}` |
| `integration_v2_facts` | un hecho aceptado por documento | `scope_source_unique {scope, sourceKey}` |
| `integration_v2_fences` | un documento `_id:"ingestion-v1"` (semilla `revision:0`) | — |

Total: **7 colecciones y 5 índices únicos** (más `_id_`). `integration_v2_authorization` existe como modelo pero la ruta de integración nunca lo lee ni escribe (no usa el fence de C.2A), así que **no se crea**. Una prueba compara el inventario con los esquemas Mongoose reales (nombres, claves, `unique`).

**Documentos sintéticos previstos** (medido con el doble y los 63 vectores C#): por jugador sintético 1 identidad + 1 guarda + 1–3 sesiones + 0–2 revocaciones; por lote completo de vectores 63 operaciones y 63 hechos; 1 documento de fence compartido (su `revision` sube en 1 por transacción de escritura). Máximo 4 jugadores sintéticos; la autorización limita a 1–4.

**Operaciones por fase** (lectura/escritura): conexión TLS+SCRAM y `connectionStatus` (solo lectura, primero); inspección `listCollections` (solo nombres) y `listIndexes` ×7; preparación (solo con doble autorización) `createCollection` ×7, `createIndexes` ×5 y upsert de la semilla del fence; registro (transacción: leer, insertar identidad y guarda); login (guarda +1, insertar sesión, revocar las más antiguas si hay >3); autenticación (lecturas de sesión e identidad por petición); lote (fence +1, guarda +1, lecturas acotadas, upserts de hechos y operaciones); recibos (fence +1, guarda +1, lectura por id); revocación (guarda +1, actualizar sesión/identidad, insertar revocación). Lista completa en `INTEGRATION_OPERATIONS`.

**Identificadores de ejecución:** `executionId` (32 hex) viene de la autorización y se imprime en la línea de arranque; los documentos no llevan marca de ejecución (las colecciones del perfil no son de un solo uso), así que **la limpieza se ancla en los `technicalAccountId` de los jugadores sintéticos creados**, que el cliente de prueba debe registrar en su evidencia local.

## 4. Política de limpieza (plan, sin ejecutor en esta etapa)

1. Preferida: `cleanupPlan([accountIds])` → seis borrados dirigidos, **hijos antes que padres**, cada filtro anclado a los ids de las cuentas sintéticas (operations, facts por `scope` con prefijo de cuenta, revocations, identitySessions, ownerGuards, identities). Nunca filtros vacíos o comodín; 1–4 ids únicos y UUID válidos (probado). No borra `fences` ni toca colecciones ajenas.
2. Reinicio total: `dropPlan()` (las 7 colecciones) solo si el listado de la base contiene exactamente el inventario más colecciones ajenas que **no** se tocan.
3. Cualquier limpieza requiere su propia autorización y una verificación posterior de conteos; no hay borrado automático al cerrar.

## 5. Pruebas aprobadas (11 nuevas + 12 de la etapa 6; vitest completo 595 aprobadas)

| # | Requisito | Prueba |
|---|---|---|
| 1 | Activación explícita | IL01 (flags, opciones prohibidas, procesos hijo reales, producción), IL02 (autorización estricta; el repositorio no contiene ninguna) |
| 2 | Rechazo sin credencial | IL03 (terminal, ausente, marcos mal formados) – sin conexión; también con el proceso real |
| 3 | Destinos alternativos | IL04 (host/usuario/TLS/authSource/base distintos → cerrado y rechazado), IL02 (autorización con otro destino) |
| 4 | Credenciales no registradas | IL04 (autenticación rechazada, privilegios incorrectos; sin filtrar la contraseña; ninguna escritura antes de la verificación) |
| 5 | Inicio en loopback | IL05 (127.0.0.1, inalcanzable por las IP externas de la máquina, rutas heredadas 404) |
| 6 | Esquema simulado | IL06 (inventario = esquemas reales; base vacía sin `-PrepareCollections` → no arranca; sin permiso → rechazo previo; con ambos → exactamente 7 colecciones, 7×índices, 1 semilla, ninguna `b054c2c`/`authorization`; índice dañado no se repara) |
| 7–9 | Autenticación, lote, recibos | IL07 (registro, login, 63 operaciones C#, repetición idempotente, recibo) |
| 10 | Cierre ordenado | IL09 (listener primero, conexión una vez, idempotente, arranque fallido también cierra; SIGINT/SIGTERM en el punto de entrada) |
| 11 | Otros propietarios | IL08 (403, sin filas, sin recibos ajenos) |
| 12 | Sin conexión real | IL11 (solo sockets loopback, sin DNS, fuentes sin `process.env`/`.env`/escritura de archivos/`mongoose` estático, envoltorio sin salida de secretos ni variables, rechazo sin `-Enable`) |
| — | Limpieza | IL10 (plan anclado, límites, hijos antes que padres) |

Regresiones: vitest completo 595 aprobadas / 16 omitidas; fallan solo los 3 que requieren `C2_FINAL_TEST_ROOT` (con él: 9/9); BC12/BC15 y las pruebas de C.2 sin cambios. `.work/databases` vacío.

## 6. Riesgos pendientes

1. **Capacidad del motor de ingesta (hallazgo):** cada transacción lee *todas* las operaciones y hechos de la colección (límite `maxRecords=1000` global, no por jugador) y reescribe el estado con upserts; con los 63 vectores se observaron 2 016 upserts de operaciones y de hechos en un solo lote (patrón cuadrático). En Atlas esto implica latencia y consumo altos y, al superar ~1 000 registros acumulados en la base, respuestas 503 permanentes. **La prueba real debe usar lotes pequeños (≤ ~10 operaciones) y pocos jugadores**, y se recomienda revisar este diseño antes de usar la base de integración de forma sostenida. No se modificó en esta etapa.
2. **Escrituras reales:** una vez autorizado, el perfil escribe en Atlas; solo lo mitigan la autorización con ventana, el destino fijo y la verificación de privilegios.
3. **Tokens efímeros** (claves RS256 en memoria): reiniciar invalida sesiones.
4. **Sin ejecutor de limpieza**: los datos de prueba permanecen hasta que se autorice y ejecute un procedimiento.
5. **Plan de borrado nunca probado contra Atlas.**
6. **Entrada oculta del `.ps1`** solo verificada por inspección estática y por las rutas de rechazo; el flujo completo con contraseña no se ejecutó (por diseño).
7. Contratos de backend faltantes (refresco, recuperación/rotación de credencial, revocación expuesta) siguen sin definirse.
8. **B00** sigue pendiente y no se declara resuelto.

## 7. Condiciones para conectar Atlas (ninguna cumplida)

1. Confirmar la rotación de la contraseña de `twosides_integration_test`.
2. Autorización expresa del propietario con ventana, alcance (solo lectura de inspección o también preparación de colecciones) y límites (jugadores, tamaño de lote); crear el archivo de autorización fuera del repositorio.
3. Decidir sobre el riesgo de capacidad (1) y fijar lotes pequeños.
4. Aprobar el procedimiento y ejecutor de limpieza.
5. Ejecutar primero sin `-PrepareCollections` (inspección de solo lectura); crear el esquema solo con segunda autorización explícita.
6. Prueba manual guiada Godot → Express integration con almacenamiento y credenciales desechables.

## 8. Estado de la rotación de la contraseña de integración

**Sin confirmar.** No hay evidencia en este repositorio ni en esta sesión de que la contraseña de `twosides_integration_test` haya sido rotada tras la ejecución real de C.2. No se solicitó ni se manejó ningún valor de contraseña. Mientras no se confirme, el lanzador debe considerarse **no autorizado para uso**.
