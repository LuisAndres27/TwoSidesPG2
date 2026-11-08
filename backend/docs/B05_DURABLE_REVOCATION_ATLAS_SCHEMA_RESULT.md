# B05.4C.2F.1C.2A — Esquema de ensayo de revocación durable

2026-10-29, America/Guatemala. **C.2A COMPLETADA EN SU ALCANCE DE ESQUEMA: ocho colecciones, cinco índices secundarios y un fence sintético creados y verificados en Atlas.** Activación manual realizada por el usuario; conexión cerrada. No se ejecutaron carreras C.2 ni F.2; no se valida todavía revocación durable real. B00 pendiente; B05.5 no iniciada. La incidencia ACL de la preparación permanece documentada en su sección, sin considerarse subsanada por este resultado.

Resultado registrado: **2026-10-29 07:13:51, America/Guatemala**; timestamp original 2026-10-29T13:13:51.889Z. Se revisaron únicamente los artefactos locales sanitizados después de la activación: no se abrió una conexión adicional para elaborar este informe.

## Autorización e inventario

La autorización del usuario para C.2A resuelve exclusivamente el bloqueo de provisión del [inventario C.2](B05_DURABLE_REVOCATION_ATLAS_RESULT.md). No permite ejecutar las carreras ni ampliar a datos de identidad/operaciones. RunId fijo:

`10ef4f6d653f4ee4a1d1b2e6591013c2`

Destino: TwoSidesCluster, host <cluster>.<id>.mongodb.net, usuario twosides_integration_test, base two_sides_integration_test, authSource admin, DEFAULT y TLS estricto. No otra base/usuario o configuración de red.

Con prefijo b054c2c_10ef4f6d653f4ee4a1d1b2e6591013c2, únicamente ocho colecciones: _ops, _facts, _fence, _authorization, _identities, _ownerGuards, _identitySessions, _revocations. Cinco índices secundarios únicos:

| Colección | Índice | Claves ascendentes |
|---|---|---|
| _ops | owner_operation_unique | technicalAccountId, operationId |
| _facts | scope_source_unique | scope, sourceKey |
| _identities | identity_registration_unique | registrationId |
| _identities | identity_binding_unique | installationId, localPlayerId |
| _identitySessions | identity_token_unique | tokenHash |

Se permiten los _id estándar. Sin otros índices, filtros parciales, sparse, TTL, hidden o collation no simple. Única inserción autorizada: `{_id:'ingestion-v1',revision:0}` en _fence. Cero identidades, sesiones, hechos, operaciones, recibos o comandos de revocación. Sin transacciones/carreras, limpieza destructiva, drop, syncIndexes, actualizaciones, upserts o borrado de estructuras anteriores.

## Controles implementados

- Capacidad exacta B05.4C.2F.1C.2A ligada al runId fijo, DEFAULT y allowWrites explícito. La capacidad general B05.4C.2F.1C.2 sigue sin admitirse. Las factorías de identidad/ingestión rechazan schema-only antes de crear modelos.
- Una conexión Mongoose inyectada, pool máximo uno, sin modelos/autoCreate/autoIndex, retryReads/retryWrites false, operaciones de 10 s y supervisor del proceso de 120 s. No servidor de desarrollo ni conector por defecto.
- Verificación de identidad/destino/TLS y permisos efectivos, incluidos listCollections/find/createCollection/createIndex/insert/listIndexes. Enumeración completa `{listCollections:1,authorizedCollections:true,nameOnly:true}`, sin filter, alternativas o getMore.
- Antes de DDL se exige exactamente el catálogo histórico de las cuatro colecciones conservadas de D.2E 0e803b0278594116a83894c04fb10c53. No se inspeccionan sus documentos/índices ni se presume propiedad por su nombre. Un objeto inesperado, un namespace de destino ya existente o cursor incompleto detiene la ejecución antes de crear.
- Creación secuencial de ocho colecciones, inspección de _id, creación de los cinco índices exactos y comparación estricta de todos los índices antes de insertar. Si una definición es incompatible, se detiene y conserva lo ya creado, sin corregir/reemplazar objetos.
- Antes del fence se exige ausencia de documentos en las ocho colecciones nuevas. Inserción única, sin reintento externo; verificación exacta del fence y conteos finales: una fila en _fence, cero en las otras siete.
- Journal local sincronizado antes de cada mutación y después de cada respuesta reconocida. Ante timeout/commit o respuesta incierta, conservar estructuras y reportar incertidumbre; nunca declarar ausencia por un fallo ni reutilizar el canal.
- Cierre ordenado en finally. Un fallo de cierre impide declarar completada la provisión.

El preflight remoto confirmó el catálogo esperado y los permisos antes de DDL. Después de crear las colecciones se comprobaron sus índices y ausencia de documentos; tras insertar el fence se verificaron el contenido exacto y los conteos finales. Las llamadas del arnés se limitaron a los namespaces nuevos: los cuatro anteriores solo participaron en la enumeración de nombres. No se inspeccionaron sus documentos o índices ni se excluyen cambios concurrentes de otros principales.

## Canal nuevo preparado

Directorio real creado fuera de OneDrive/Git:

`C:\Users\luis2\AppData\Local\TwoSides\AtlasIntegrationTests\b054c2c-10ef4f6d653f4ee4a1d1b2e6591013c2`

| Componente | SHA-256 verificado |
|---|---|
| atlas-revocation-schema-receiver.js | CCEA03C8F0753A18C40BDAB249C3D9559AE7B0F590616066AD3B41E1575C7C53 |
| send-atlas-schema-credential.ps1 | EA9F8BCEF6D6C951DD4DA3920B5A15A73C074C446922D160FCB8A151B9EA0B5F |
| schema-preflight-manifest.json | 67BEC125D8C61D4152C3A37B27F3726DCFABBEDB3A4F403DD13AFF5E10C7B65A |

Manifiesto exclusivo de fase/runId, límites e inventario exactos; 45 dependencias fuente/guardas/package/lockfile verificadas. Fuente/copia del receptor y lanzador coinciden; sintaxis Node y parser PowerShell sin errores. Directorio/archivos normales, sin enlaces en sus rutas comprobadas; no se copió un canal consumido. Antes de activar no había marcador, journal o resultado. Después de ejecutar permanecen schema-attempt.started, schema-progress.jsonl y schema-result.json; no existe schema-supervisor.json. El canal está consumido y no debe reutilizarse.

El lanzador bloquea resultados/marcadores/journal previos antes del prompt; verifica hashes del receptor/manifiesto y su propia correspondencia con el manifiesto. El comando manual fija además el hash del lanzador. El receptor reclama un marcador exclusivo antes de consumir la credencial y vuelve a comprobar integridad/procedencia e inventario.

La contraseña solo entra por SecureString/entrada oculta; BSTR a UTF-8 sin recortes, framing binario por stdin anónimo al hijo Node oculto. Nunca argv/env/URI completa, archivo, salida de consola o informe. Buffers/BSTR se liberan; no se promete borrado perfecto de strings inmutables del GC. stdout/stderr del hijo no se reenvían. Los resultados y el journal contienen solo estado, nombres autorizados, contadores y diagnósticos sanitizados.

**ACL:** el canal nuevo y su preparación no consultan ni alteran ACL/propietario. Se verificaron ubicación, enlaces y hashes, pero no se recertifica privacidad de permisos del directorio. El aislamiento de la credencial se basa en stdin/RAM del proceso, sin archivos de secretos. B00 permanece pendiente; hashes y ubicación no resuelven ese riesgo ni todas las carreras de integridad del sistema.

## Incidencia de validación y pruebas

Se inició por error la batería Vitest completa histórica; incluye private-workspace.ps1, que consulta ACL/propietario en AppData/Local/TwoSides y sus carpetas sintéticas identity-d2. Se interrumpió al identificarlo. **No se puede afirmar ausencia total de lecturas ACL durante esta fase.** No se ejecutó código de modificación de ACL/propietarios. Esta incidencia no se presenta como una auditoría autorizada de seguridad; se comunicó al usuario. No quedaron procesos Node de aquella ejecución ni carpetas sintéticas identity-d2 al comprobarlo después. No se modificó el auxiliar para omitir sus controles.

Se excluyeron de la ejecución posterior los archivos de identidad persistente y persistencia de ingestión que usan ese auxiliar. Las suites restantes se revisaron antes de ejecutarlas; los lanzadores antiguos probados sin autorización rechazan antes de sus consultas ACL. El canal nuevo no contiene esas consultas.

**Validación concluida antes de la activación:** 427 pruebas Vitest en 18 archivos y 39 legacy aprobadas: **466 pruebas únicas, 16 nuevas y 450 regresiones**, cero fallidas/omitidas dentro de la selección. La selección explícita no incluye las 43 pruebas excluidas por la restricción ACL. La ejecución completa interrumpida no se cuenta como aprobada. Los 78 casos focalizados son un subconjunto y no se suman otra vez.

Las 16 nuevas cubren: capacidad/runId/destino, inventario respecto del informe y C.1, techo 8/5/1, objetos preexistentes o inesperados, privilegios, cursor incompleto, índices incompatibles/automáticos, documentos inesperados, fence incierto sin retry, fallos de cierre, journal previo a mutar, prohibición de factorías de datos, bloqueos C.2/F.2, sanitización, ausencia de sockets reales y rechazo del lanzador sin autorización/lectura ACL. Son dobles; no prueban Atlas real.

## Activación manual realizada — canal consumido

El usuario ejecutó el comando nuevo con las tres huellas verificadas e introdujo la contraseña únicamente en la entrada oculta. Comunicó el mensaje genérico de finalización, sin secretos. Ese mensaje no se tomó como prueba suficiente: se leyeron schema-result.json y schema-progress.jsonl y se verificó la ausencia de aviso del supervisor.

El resultado corresponde exactamente a esta fase/runId y al inventario autorizado: status=completed, stage=completed, authentication=verified, permissionsVerified=true, metadataVerified=true, replicaSetPrimary=true, structuresVerified=true, fenceConfirmed=true, racesExecuted=false y closed=true. No aparecen errores sanitizados o resultados inciertos en esa ejecución.

El journal contiene **28 entradas** consistentes: intención y reconocimiento de cada una de las ocho colecciones, intención y reconocimiento de cada uno de los cinco índices, intención del fence y terminación verificada. Los nombres/índices reconocidos se compararon exactamente con schemaInventory. Después de la ejecución, las 45 dependencias, receptor, lanzador y manifiesto conservaron sus SHA-256. No se recibió ni recuperó una contraseña para efectuar estas verificaciones locales.

El marcador de uso único permanece. No repetir el comando ni eliminar marcadores para reactivarlo. Se conservan seis artefactos no secretos: receptor, lanzador, manifiesto, marcador, journal y resultado sanitizado.

## Resultado remoto actual e integridad

| Elemento | Resultado real C.2A |
|---|---|
| Activación / autenticación | Manual; DEFAULT, usuario/base autorizados, verificadas |
| Preflight remoto/permisos/catálogo | Verificados; sin filter ni objetos inesperados |
| Colecciones creadas / índices secundarios creados | 8 / 5, exactamente el inventario autorizado |
| Índices _id estándar | Verificados; conservados |
| Fence insertado/verificado | Una fila exacta _id=ingestion-v1, revision=0 en _fence |
| Documentos en las otras siete colecciones | 0 en cada una |
| Estructuras anteriores | Ninguna llamada de escritura sobre ellas |
| Carreras C.2/F.2, identidades, operaciones o recibos | NO EJECUTADOS |
| Estructuras remotas conservadas | Las ocho colecciones, cinco índices y el fence creados deliberadamente; no limpieza autorizada/ejecutada |
| Conexión / sesiones transaccionales | Conexión cerrada; no se iniciaron transacciones |
| Errores / timeout del supervisor | Ninguno registrado; sin aviso del supervisor |
| Canal privado | Consumido; no reutilizar |

Archivos del proyecto creados: scripts/atlas-revocation-schema-suite.js, scripts/atlas-revocation-schema-receiver.js, scripts/send-atlas-schema-credential.ps1, tests/sync/atlas-revocation-schema.test.js y este informe. Modificados: src/modules/sync/atlas-policy.js y atlas-integration.js para la capacidad exclusiva de esquema. Fuera del proyecto se crearon exclusivamente las dos copias de código y el manifiesto del canal, sin secretos; los tests históricos emplearon sus directorios sintéticos efímeros y no dejaron residuos detectados.

No se accedió a backend/.env, SQLite runtime/históricas o Godot, ni se conectó Atlas antes de la activación. No se recalcularon hashes protegidos, cambiaron referencias históricas, modificaron permisos/propietarios, instalaron dependencias o consultaron contraseñas Compass. La incidencia de lectura ACL del auxiliar histórico queda registrada arriba y no se oculta bajo esta declaración. La revisión posterior a la activación solo leyó resultado/journal/manifiesto y archivos de código para comprobar sus hashes; no volvió a consultar Atlas o ACL.

**Provisión del esquema confirmada en el alcance autorizado.** No demuestra revocación durable real. Las carreras C.2 requerirán autorización y revisión de su preflight para reconocer este esquema preparado; no se adaptan/ejecutan automáticamente. F.2, B05.5 y AWS continúan fuera de alcance. B00 sigue pendiente, con la incidencia ACL de preparación expresamente conservada. C.2A finalizada; trabajo detenido después de documentar el resultado, sin nuevas conexiones.
