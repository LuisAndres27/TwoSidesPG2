# B05.4C.2F.1C.2 — Resultado de revisión previa

2026-10-29, America/Guatemala. **C.2 BLOQUEADA ANTES DE CONECTAR.** Ninguna conexión remota, credencial solicitada/recibida, índice/colección creado o documento remoto consultado/modificado. No se ejecutaron A/B, limpieza o reapertura. No se valida la revocación durable real. F.2 sigue deshabilitada; B00 pendiente; B05.5 no iniciada.

## Motivo de detención y alcance de la evidencia

Se revisaron los cinco informes obligatorios y el arnés C.1, sus límites, factorías/política Atlas y plan de provisión. No se repitió F.1A, reimplementó F.1B ni modificó el arnés.

La sección 2 de la instrucción C.2 exige detenerse antes de conectar si hay precondiciones incumplidas. La sección 6 establece expresamente: «Si faltan índices o estructuras necesarias, detenerse y solicitar autorización separada para crearlos. No modificar automáticamente el esquema».

C.1 preparó ocho namespaces **nuevos por ejecución**, cinco índices secundarios y el fence inicial. Su durableProvisionSteps es un plan seco: executeDuringC1=false. Los informes no registran provisión de esos ocho namespaces de identidad/ingestión; la evidencia histórica D.2E solo conserva cuatro colecciones y sus dos índices de otra ejecución. No deben reutilizarse como sustituto de los nuevos documentos/índices de identidad.

Por tanto, la autorización actual para documentos sintéticos no permite completar automáticamente la preparación estructural que necesita este ensayo. Se solicita permiso separado sobre el inventario exacto siguiente. **Esto es una conclusión del diseño y sus registros locales; no una inspección actual del catálogo remoto.** No se afirma haber comprobado hoy qué colecciones o índices existen en Atlas.

También siguen pendientes las tareas de activación previstas en C.1: capacidad exacta F.1C.2, receptor/manifiesto de uso único y límites efectivos de I/O/supervisión. La autorización actual permite preparar el canal, pero primero debe resolverse la condición estructural; no se pide una contraseña para un ensayo que aún no puede ejecutarse conforme a sus restricciones.

## Identificador e inventario concreto para revisión

Identificador **propuesto localmente, no ejecutado ni activado**:

`10ef4f6d653f4ee4a1d1b2e6591013c2`

Se generó mediante prepareDurableAtlasPlan y se inspeccionó durableProvisionSteps, sin invocar conectores. No existe todavía un receptor/directorio privado o manifiesto activo para este identificador. Antes de una futura ejecución, el paquete revisado deberá fijar ese runId y esos namespaces; no sustituirlos silenciosamente por los de otra ejecución.

Destino exclusivo propuesto: TwoSidesCluster; host <cluster>.<id>.mongodb.net; usuario twosides_integration_test; base two_sides_integration_test; DEFAULT; authSource admin; TLS estricto. Ninguna configuración con secretos se recibió o serializó.

Colecciones nuevas que requerirían autorización de creación:

1. b054c2c_10ef4f6d653f4ee4a1d1b2e6591013c2_ops
2. b054c2c_10ef4f6d653f4ee4a1d1b2e6591013c2_facts
3. b054c2c_10ef4f6d653f4ee4a1d1b2e6591013c2_fence
4. b054c2c_10ef4f6d653f4ee4a1d1b2e6591013c2_authorization
5. b054c2c_10ef4f6d653f4ee4a1d1b2e6591013c2_identities
6. b054c2c_10ef4f6d653f4ee4a1d1b2e6591013c2_ownerGuards
7. b054c2c_10ef4f6d653f4ee4a1d1b2e6591013c2_identitySessions
8. b054c2c_10ef4f6d653f4ee4a1d1b2e6591013c2_revocations

Cinco índices secundarios propuestos, todos unique=true, direcciones ascendentes y sin sparse/filtro parcial/TTL/hidden/collation no simple:

| Sufijo de colección | Nombre | Claves exactas |
|---|---|---|
| _ops | owner_operation_unique | technicalAccountId:1, operationId:1 |
| _facts | scope_source_unique | scope:1, sourceKey:1 |
| _identities | identity_registration_unique | registrationId:1 |
| _identities | identity_binding_unique | installationId:1, localPlayerId:1 |
| _identitySessions | identity_token_unique | tokenHash:1 |

Se conservarían los índices _id estándar de las ocho colecciones. No se propone crear otros índices secundarios, usar syncIndexes, alterar índices existentes, migrar datos ni tocar otro runId. La provisión incluiría solamente el documento inicial ingestion-v1, revision=0, en la colección _fence del run nuevo; las identidades/sesiones y sus guards se crearían mediante el repositorio real conforme al ensayo autorizado.

La creación seguiría condicionada al preflight remoto aceptado: identidad/destino/TLS/permisos efectivos, enumeración completa sin filter, namespaces nuevos libres y ausencia de estructuras inesperadas. Si alguno de los nombres propuestos ya existe o el catálogo difiere del inventario histórico esperado, detenerse y revisar; esta propuesta no permite adoptarlo ni sobrescribirlo.

## Comprobaciones locales realizadas

- Lectura del plan real: ocho colecciones, cinco índices y fence coinciden con el modelo C.1.
- La política instalada acepta el control de configuración D.2E y rechaza la capacidad nueva B05.4C.2F.1C.2, manteniendo idénticos los demás campos válidos. Prueba offline, sin conector. No se usó D.2E para suplantar C.2.
- executeDurableAtlasRun sigue rechazando con DURABLE_REVOCATION_C2_NOT_AUTHORIZED, antes de cualquier conexión.
- Límites inspeccionados: tres propietarios, ocho envíos de ingestión, dos participantes simultáneos, máximo tres conexiones incluyendo reapertura, 24 documentos como techo, tres callbacks por transacción, barrera de 1 s, presupuesto de servicio de 2 s y escenario de 30 s. La futura activación debe fijar además I/O de 10 s y supervisor de 120 s, tal como exige C.1.
- Las 493 pruebas de C.1 son evidencia anterior. No se reejecutó esa batería ni se presenta como validación remota de C.2.

## Estado de los resultados solicitados

| Elemento | Estado en C.2 |
|---|---|
| Preflight remoto y permisos | NO EJECUTADOS |
| Colecciones/índices actuales Atlas | NO CONSULTADOS; inventario anterior solo documental |
| Documentos de ejecuciones anteriores | NO LEÍDOS; no se asume propiedad por su nombre |
| Escenario A, orden y efectos persistidos | NO EJECUTADO; sin evidencia nueva |
| Escenario B, orden y recibo histórico | NO EJECUTADO; sin evidencia nueva |
| Conflictos/reintentos, D02 y revocación entre intentos | NO EJECUTADOS en C.2 |
| Recibos nuevos | NINGUNO generado por esta fase |
| Reapertura/reconexión | NO EJECUTADA |
| Limpieza | NO EJECUTADA; no hubo escrituras de esta fase |
| Residuos C.2 | NINGUNO creado por esta fase |
| Sesiones/conexiones remotas C.2 | CERO abiertas; ninguna pendiente de cierre |
| Errores sanitizados | Bloqueo local DURABLE_REVOCATION_C2_NOT_AUTHORIZED y rechazo de configuración nueva; ningún error de Atlas observado |
| Garantía de revocación MongoDB real | NO VALIDADA |

## Protección, riesgos y siguiente paso

No se leyeron ni modificaron backend/.env, las tres bases SQLite protegidas, Godot, ACL/propietarios, usuarios/permisos/red Atlas, two_sides_db o datos reales. No se recalcularon hashes protegidos ni se alteró una referencia histórica. La única escritura del proyecto en esta revisión es este informe. No se prepararon archivos con credenciales ni se consultó Compass.

B00 permanece pendiente. Los demás riesgos/limitaciones de identidad y custodia descritos en C.1/F.1B siguen vigentes; los resultados históricos no acreditan el estado actual del clúster. No se declara segura una futura ejecución solo por disponer de un canal privado o un hash.

Para continuar se requiere autorización separada de creación **exclusivamente de las ocho colecciones, los cinco índices secundarios y el fence inicial detallados**, conservando todo lo ajeno. Después podrá completarse la capacidad/receptor/manifiesto nuevos, verificar ruta y hashes reales y entregar el comando manual. No se entrega ahora una ruta o huella ficticia ni se solicita contraseña.

C.2 permanece BLOQUEADA. F.2 no se desbloquea: requiere posteriormente evidencia real de ambos órdenes, revocación/recibos/reconexión/limpieza/cierre satisfactorios y su autorización independiente. Sin B05.5, Godot HTTP, AWS o datos reales. Trabajo detenido antes de conectar.
