# B05.4C.2F.1C.2B.1 — Preflight del próximo canal C.2

2026-10-29, America/Guatemala. **CANAL NO APTO PARA ACTIVACIÓN. Preparación detenida por la condición expresa de privacidad de la sección 4.** No se creó un canal nuevo, ejecutó receptor o batería de pruebas, introdujo/solicitó contraseña, consultó ACL/propietarios o conectó Atlas. No C.2, F.2 o B05.5. B00 permanece pendiente.

## Revisión realizada

Se revisaron los cinco documentos requeridos: DURABLE_REVOCATION_ATLAS_SCHEMA_RESULT, DURABLE_REVOCATION_ATLAS_RESULT, DURABLE_REVOCATION_ATLAS_PREFLIGHT, DURABLE_REVOCATION_IMPLEMENTATION y ATLAS_CONCURRENCY_PREFLIGHT, así como el diagnóstico ACL inmediatamente anterior de la conversación. Se contrastaron con el auxiliar histórico, las rutas de pruebas, la configuración Vitest y el código del receptor/lanzador C.2A.

No se repitieron las pruebas de esquema o fases anteriores. La evidencia de C.2A acredita históricamente ocho colecciones, cinco índices y un fence, con cierre correcto; no acredita la privacidad actual del directorio ni habilita reutilizar el canal consumido. El diagnóstico anterior APTO CON CONDICIONES permitía preparar bajo condiciones; no certificaba los permisos del directorio ni autorizaba activar un canal nuevo.

## Precondición que no pudo demostrarse

La instrucción actual exige comprobar las garantías de privacidad sin consultas ACL y, si no es posible, detenerse y declarar NO APTO PARA ACTIVACIÓN. La revisión no encontró una evidencia vigente o un mecanismo alternativo ya verificado que acredite esa precondición.

| Evidencia disponible | Qué demuestra | Límite para este canal nuevo |
|---|---|---|
| Hashes de receptor, lanzador, manifiesto y fuentes C.2A | Coincidencia de bytes en los instantes comprobados de la ejecución anterior | No demuestra quién puede modificar archivos después ni certifica un paquete nuevo |
| Ruta AppData fuera de OneDrive/Git y ausencia de enlaces comprobadas entonces | Ubicación y tipo de objetos de aquel paquete | No prueba exclusividad de acceso actual |
| Entrada oculta, stdin anónimo y credencial solo en RAM | Evita persistir el secreto en archivos, argv, entorno o salida del canal revisado | No acredita por sí sola protección del directorio, del código cargado o del entorno de ejecución |
| Marcador exclusivo y bloqueo de resultados previos | Uso único del canal C.2A | Ese canal está consumido y no es el receptor C.2B |
| Incidencia ACL contenida y selección de pruebas revisada | Permite evitar repetir consultas ACL en una batería seleccionada | Ausencia de consultas no equivale a prueba de privacidad |

El receptor anterior verifica hashes y después importa código y dependencias desde el proyecto. Las comprobaciones registradas no eliminan todas las ventanas entre comprobación y ejecución. Con B00 pendiente, no se puede convertir ese control de integridad en una garantía de protección efectiva frente a modificaciones concurrentes. Esto identifica una limitación de la evidencia, **no demuestra una intrusión, una filtración anterior o que los SID pendientes sean maliciosos**.

No se consultaron permisos para suplir esa falta de evidencia, no se alteró la precondición y no se propone cambiar ACL/propietarios como parte de esta subfase.

## Identificación y exclusión de auxiliares ACL

Cadena de ejecución identificada mediante lectura de código, sin ejecutar PowerShell:

1. tests/identity-persistence/support/harness.js: workspace(operation,directory) invoca private-workspace.ps1 mediante execFileSync.
2. private-workspace.ps1: Assert-Private ejecuta Get-Acl, consulta Owner y recorre Access. Lo hace sobre AppData/Local/TwoSides, el directorio sintético identity-d2 y sus descendientes. Las operaciones Create, Verify y Remove atraviesan esas comprobaciones.
3. tests/identity-persistence/persistence.test.js utiliza workspace para sus fixtures y limpieza.
4. tests/sync/support/persistence-fixture.js invoca workspace; tests/sync/persistence.test.js consume persistentFixture y su limpieza.

**Exclusión obligatoria:** tests/identity-persistence/persistence.test.js y tests/sync/persistence.test.js, junto con cualquier ejecución directa o indirecta del auxiliar. No se modificaron esos archivos o el auxiliar para ocultar/omitir sus controles.

No se usarán los comandos generales siguientes: npm test, npm run test:jwt o Vitest run con vitest.config.js sin una lista explícita. Su configuración incluye ambas suites excluidas. No se ejecutó ninguno en esta subfase.

Se dejan también fuera de la selección conservadora las suites que ejecutan lanzadores PowerShell o generan sondas a partir de ellos: atlas.test.js, atlas-persistence.test.js, atlas-credential-channel.test.js y atlas-revocation-schema.test.js. Algunos casos anteriores rechazan antes de consultar ACL o sustituyen partes del lanzador para la prueba; no se asume esa propiedad por el nombre del archivo. Se excluyen además todos los archivos que no figuren en la lista explícita siguiente.

## Selección estática de pruebas permitidas

Lista propuesta y revisada por sus fixtures/rutas de subprocess, **no ejecutada en esta subfase debido al bloqueo previo de privacidad**:

| Archivo bajo backend/tests/sync | Alcance de comprobación offline |
|---|---|
| durable-revocation-atlas-preflight.test.js | Límites, actores sintéticos, aislamiento, reapertura doblada, limpieza exacta, fallo cerrado y bloqueo de entrada remota |
| durable-revocation.test.js | Repositorios reales con modelos doblados, revocación, recibos, propiedad y conflictos; hijo Node sintético por IPC |
| durable-revocation-coordination.test.js | Modelo conceptual e intercalaciones; hijo Node de mensajería sintética |
| atlas-concurrency.test.js | Pares acotados, driver transaccional doblado y deshabilitación de F.2 |
| mongo.test.js | Contratos del adaptador, errores, índices y autorización con dobles |

Los fixtures seleccionados construyen identidades en memoria de ensayo o MongoIdentityRepository con modelos doblados. No llaman workspace ni persistentFixture. El simple import de EncryptedStore a través de clases compartidas no ejecuta private-workspace.ps1: las rutas seleccionadas no abren el almacén de archivo ni pasan opciones de persistencia al coordinador. Se inspeccionó también durable-revocation-worker.js: usa Node/IPC y el doble Mongo; no invoca PowerShell ni el auxiliar.

Comando de selección documentado, **no ejecutado ahora**; no autoriza ejecutar un receptor o el canal:

```powershell
# Desde backend. Lista cerrada; sin comodines ni bateria completa.
$allowedTests = @(
  'tests/sync/durable-revocation-atlas-preflight.test.js'
  'tests/sync/durable-revocation.test.js'
  'tests/sync/durable-revocation-coordination.test.js'
  'tests/sync/atlas-concurrency.test.js'
  'tests/sync/mongo.test.js'
)
node --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run @allowedTests --config vitest.config.js
```

La inspección no sustituye la ejecución de esas pruebas ni certifica un receptor nuevo inexistente. Antes de una futura ejecución deberá revalidarse que los archivos/fixtures no hayan cambiado y que no se amplíe la lista por descubrimiento automático.

## Estado de los componentes solicitados

| Entregable o comprobación | Estado real |
|---|---|
| Archivo preparado | Únicamente este informe de bloqueo y selección estática |
| Directorio exclusivo nuevo | NO CREADO |
| Receptor/lanzador nuevos | NO PREPARADOS: detenidos por la precondición de privacidad |
| SHA-256 del receptor nuevo | NO DISPONIBLE; no se inventó ni reutilizó el de C.2A |
| Manifiesto de uso único nuevo | NO GENERADO; ningún paquete se declara verificable o activable |
| Integridad, reutilización, credencial ausente y redacción del receptor nuevo | NO PROBADAS; no existe receptor nuevo |
| Límites/identidades/limpieza/F.2 | Selección offline identificada; no reejecutada tras el bloqueo |
| Resultado de pruebas offline de esta subfase | 0 pruebas ejecutadas; ninguna se declara aprobada por herencia |
| Receptor real / credenciales / Atlas | NO EJECUTADO / NO SOLICITADAS NI INTRODUCIDAS / SIN CONEXIONES |
| Canal C.2A | Consumido; se conserva sin reutilización o modificación |

Las cifras de C.1 y C.2A permanecen como resultados históricos de sus fases; no son pruebas ejecutadas en B.1. La ausencia de consultas ACL de **esta** revisión se apoya en que solo se leyeron documentación y código, sin ejecutar auxiliares, receptores, suites o APIs de permisos. No se utiliza esa ausencia como prueba de privacidad.

## Destino que deberá quedar fijado en un canal futuro

Exclusivamente <cluster>.<id>.mongodb.net, two_sides_integration_test, twosides_integration_test, authSource admin, mecanismo DEFAULT y TLS estricto con validación normal. Credenciales y argumentos no deben sustituir host/base/usuario/mecanismo o debilitar TLS. Son requisitos pendientes del receptor futuro, no una configuración activada en esta revisión. Sin two_sides_db ni usuario administrativo.

## Activación y condiciones para continuar

**No se prepara un comando PowerShell de activación ni se proporcionan rutas/hashes ficticios.** La detención de la sección 4 impide presentar como utilizable un canal cuya precondición no pudo acreditarse. La lista de pruebas anterior es exclusivamente un comando offline no ejecutado y no recibe contraseñas.

Antes de retomar se necesita evidencia vigente y verificable, compatible con la prohibición de consultas ACL, que acredite las condiciones de privacidad/protección efectiva del entorno y del código a ejecutar. Alternativamente, una instrucción distinta tendría que definir expresamente otra forma de verificar esa precondición. No se solicita aquí acceso a ACL, cambio de permisos, aceptación implícita del riesgo o credenciales.

Solo después de resolver ese punto podrán prepararse el directorio/receptor/manifiesto nuevos, calcular sus huellas reales, ejecutar la selección permitida y emitir un comando deshabilitado hasta autorización independiente. Si la evidencia falta o contradice las condiciones, mantener NO APTO y detenerse. Un éxito del esquema, un hash válido o stdin/RAM por sí solos no levantan el bloqueo documentado.

## Protección y cierre

No se accedió a backend/.env, SQLite runtime/históricas, Godot, ACL o propietarios. No se consultaron secretos Compass, conectó Atlas, modificaron usuarios/permisos/red, reutilizó el canal anterior o cambiaron archivos protegidos. Única escritura: este documento. No se prepararon archivos privados fuera del proyecto.

B00 sigue pendiente. La incidencia anterior fue una selección de pruebas que consultaban metadatos; esta subfase evita repetirla, pero no resuelve ni vuelve a auditar B00. No se declara comprometida la confidencialidad del canal anterior. No C.2, F.2, B05.5 o AWS.

**Conclusión: CANAL NO APTO PARA ACTIVACIÓN; preparación detenida conforme a la sección 4.** No se completó un canal ni se autoriza activar ninguno. Esperar instrucciones independientes después de entregar este informe.
