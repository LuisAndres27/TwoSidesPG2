# B05.4C.2D.2A — Diagnóstico de listCollections y preflight

2026-10-28, America/Guatemala. **DIAGNÓSTICO Y PRUEBAS OFFLINE COMPLETADOS. SIN NUEVAS CONEXIONES REMOTAS.** La causa del código 8000 permanece NO DETERMINADA. D.2 sigue bloqueada para ejecución real; B00 pendiente; B05.5 no iniciada.

## 1. Evidencia inspeccionada

Se revisaron B05_ATLAS_PERSISTENCE_INTEGRATION_RESULT.md, B05_ATLAS_DEFAULT_AUTH_RESULT.md, B05_ATLAS_INTEGRATION_MODE.md y B05_MONGODB_ADAPTER_IMPLEMENTATION.md, así como el arnés de persistencia, política Atlas, clasificador sanitizado y driver instalado.

El resultado anterior autenticó mediante DEFAULT, verificó destino/privilegios y falló en namespace-preflight con MongoServerError, código 8000, codeName AtlasError. Categoría registrada: UNKNOWN_CONNECTION_FAILURE; etapa del clasificador diagnostic. Esa etiqueta genérica no invalida la autenticación correcta previa ni demuestra un fallo de contraseña. No se guardó el mensaje original; no se intenta recuperarlo de procesos o secretos. No hubo escrituras, índices o transacciones en aquel intento.

## 2. Consulta original y driver

Llamada original, en scripts/atlas-persistence-suite.js:

```js
connection.db.listCollections(
  { name: { $in: Object.values(cp.collections) } },
  { nameOnly: true }
).toArray();
```

Base de ejecución: **two_sides_integration_test**, mediante el Db de la conexión inyectada. El cliente y el Db se contrastan con host/usuario/base/TLS/authSource/mecanismo esperados, no solo con dbName.

cp.collections se generó mediante atlasCollections(config). Nombres seleccionados: b054c2c_<runId>_ops, _facts, _fence y _authorization. El runId es de 32 hex nuevos. No se consultan documentos; solo la existencia de esos cuatro namespaces, incluidas vistas que ocupen sus nombres. Cualquier existencia impide escribir.

El driver 7.7.0 instalado construye lógicamente este comando sobre la base autorizada:

```js
{
  listCollections: 1,
  filter: { name: { $in: [/* cuatro nombres exactos */] } },
  cursor: {},
  nameOnly: true,
  authorizedCollections: false
}
```

La aplicación omitía authorizedCollections; el driver lo convierte a false. Se comprobó usando el cursor público y ListCollectionsOperation.buildCommandDocument del driver real, sin llamar a connect ni ejecutar el cursor contra un servidor. Las pruebas contrastan el Db real del objeto nativo y filtros/opciones transmitidos. No se construye una URI con credenciales.

## 3. Comparación con el contrato oficial

La [documentación oficial de listCollections](https://www.mongodb.com/docs/manual/reference/command/listcollections/) admite filtros por nombre con nameOnly. authorizedCollections junto a nameOnly permite enumeración limitada a recursos autorizados; sin esa combinación se requiere la acción listCollections. Una autorización find sobre toda la base permite cobertura de sus colecciones. El comando está documentado para Atlas.

Por tanto, la sintaxis original es compatible con el contrato general. **No se ha demostrado un defecto en el filtro $in ni que el código 8000 signifique incompatibilidad M0.** Tampoco la documentación demuestra que esa variante haya funcionado en el clúster concreto. El mecanismo de autenticación y los límites transaccionales no se pueden diagnosticar a partir de este rechazo de metadatos.

## 4. Carencia verificable y corrección mínima

El verificador previo exigía rol readWrite en la base y acciones find, insert, update, remove, createCollection, createIndex y listIndexes. **No exigía explícitamente listCollections**, aunque el comando original con authorizedCollections false la requiere. El test L02 reproduce la diferencia: un resumen sintético con el rol esperado y esas siete acciones supera el verificador anterior sin listCollections.

Es una carencia demostrada del preflight, **no la causa demostrada del rechazo real**. No se dispone del detalle histórico de acciones para afirmar que faltara listCollections en Atlas. El nombre del rol esperado no sustituye inspeccionar las acciones efectivas del comando.

Cambios:

- Nuevo src/modules/sync/atlas-namespace-preflight.js: helper de solo lectura sin conector, modelos, secretos o capacidad de escritura. Valida configuración y conexión real y consulta nuevamente connectionStatus con privilegios. Conserva verifyAtlasPermissions y exige listCollections a nivel de base para la estrategia original.
- scripts/atlas-persistence-suite.js utiliza ese helper en namespace-preflight. El filtro y las opciones originales siguen siendo los predeterminados; no se cambian automáticamente para hacer pasar la prueba.
- Nuevo tests/sync/atlas-listcollections.test.js: 14 pruebas L01–L14.
- Este informe y actualización del resultado de D.2.

La nueva comprobación detiene una autorización insuficiente antes de enumerar. Los fallos del servidor no se convierten en una lista vacía; se propagan al clasificador privado existente, que no imprime ni conserva el error original. No se modificó el clasificador para asignar una causa sin evidencia.

## 5. Alternativa preparada, sin activación automática

El helper admite explícitamente strategy exact-authorized; **el arnés D.2 sigue usando original**. La alternativa construye cuatro consultas independientes:

```js
connection.db.listCollections(
  { name: exactName },
  { nameOnly: true, authorizedCollections: true }
).toArray();
```

No basta añadir authorizedCollections: una colección oculta podría producir una ausencia aparente. Antes de esta alternativa se conservan todos los controles y se exige find efectivo sobre el recurso completo de la base autorizada, con collection vacío. Los permisos limitados a colecciones concretas se rechazan. Así se comprueba cobertura de los cuatro nombres, sin ampliar la enumeración a datos o bases ajenas. La acción listCollections no es obligatoria para esa variante si se acredita esa cobertura; no se elimina el control general de privilegios.

Para ambos modos, una colección, vista, respuesta inesperada/no array o error impide declarar ausencia. La alternativa no se ejecutó remotamente ni se presume compatible con el clúster hasta probarla bajo autorización separada.

## 6. Necesidad y límites del aislamiento

Es necesario conservar la garantía de que los namespaces seleccionados no contienen recursos ajenos antes de usar modelos/índices/escrituras. Los nombres aleatorios por sí solos no prueban ausencia. Tampoco una lectura find vacía distingue entre una colección inexistente y una colección ajena vacía. No se propone quitar la comprobación.

listCollections no es conceptualmente la única forma posible de demostrar propiedad, pero es el mecanismo revisado del arnés. Las cuatro consultas exactas son equivalentes para los cuatro candidatos únicamente bajo la cobertura efectiva exigida. No se necesita enumerar toda la base ni inspeccionar documentos de otros proyectos.

La consulta utiliza directamente el driver a través de connection.db; no depende de esquemas Mongoose ni crea índices/modelos. El arnés ya había construido modelos con autoCreate/autoIndex false; el nuevo helper no los usa. Una ausencia observada es una comprobación puntual, no un bloqueo de namespaces contra otros clientes. No se afirma protección absoluta frente a una carrera externa o un sistema comprometido.

Se mantienen host esperado, usuario exacto, base exclusiva, TLS estricto, DEFAULT, admin, inspección efectiva de permisos, rechazo de recursos de otras bases y prohibición de two_sides_db. Ninguna prueba intenta conectarse a esa base para validar un rechazo: los casos negativos usan dobles.

## 7. Pruebas ejecutadas

**152 aprobadas, cero fallidas y cero omitidas, ocho archivos: 14 nuevas + 138 regresiones.** No se suman repeticiones. Incluye el adaptador Mongoose con dobles, modo Atlas, canal de credenciales sintéticas y clasificador anterior. JS nuevos/modificado pasan Node --check. Cero procesos Node remanentes.

| Casos | Evidencia |
|---|---|
| L01 | Consulta autorizada y respuesta vacía; filtro original de cuatro nombres y opción original conservados |
| L02 | Falta listCollections: rechazo antes de enumerar, aunque el rol/resumen genérico anterior pasara |
| L03–L04 | Alternativa exacta transmite ambas opciones; cobertura completa mediante find de base |
| L05–L06 | Permisos por colección o acciones insuficientes no acreditan ausencia |
| L07–L09 | Configuración, base/usuario/host/authSource o TLS incorrectos detienen metadatos/enumeración |
| L10 | Error 8000 detiene el resto de consultas, conserva código y categoría desconocida sin filtrar detalles |
| L11–L12 | Colecciones/vistas existentes, nombres inesperados o respuesta inválida impiden ausencia |
| L13 | Cursor/operación reales del driver construyen el comando original y alternativo sin red |
| L14 | Error de autorización en connectionStatus impide enumeración |

Los dobles verifican ausencia de llamadas de escritura. La prueba del driver bloquea sockets y no ejecuta connect/toArray nativos. Las regresiones HTTP existentes usan su servidor sintético local efímero, cerrado al terminar; no se inicia npm run dev ni el backend real. No se introducen credenciales reales ni se consulta DNS/TCP/TLS de Atlas.

## 8. Recomendación para un único preflight posterior

Con una autorización independiente, preparar un receptor **solo de metadatos**, con allowWrites false y DEFAULT, un directorio privado/runId/manifiesto nuevos y un marcador de un uso. No reutilizar el receptor D.2 que contiene etapas de escritura ni sus canales consumidos. Verificar hashes nuevos, incluyendo este helper, antes de cualquier entrada oculta.

La recomendación es un solo procedimiento autenticado que contraste destino/identidad/permisos y ejecute únicamente las cuatro consultas exact-authorized bajo cobertura completa. No fallback automático a otro modo, consulta amplia, escritura o cambio de rol. Si falta cobertura, aparece un candidato o vuelve el error, cerrar y detenerse. Obtener evidencia sanitizada del comando/etapa; 8000 solo no identifica causa.

Una respuesta vacía válida en los cuatro candidatos acreditaría ese preflight puntual; **no autoriza persistencia, índices, transacciones, B05.5 o AWS**. No se ha creado un canal nuevo ni se solicita activación/contraseña en D.2A.

## 9. Datos protegidos y cierre

backend/.env no se abrió, consultó, hasheó o modificó. No acceso a SQLite runtime/históricas, Godot, ACL, propietarios o almacenamiento Compass durante este diagnóstico. No se vuelven a certificar hashes de archivos protegidos: la comparación anterior de D.2 es histórica. Ninguna modificación de usuarios, permisos, bases o colecciones Atlas, configuración principal o proyecto original.

No se alteraron los artefactos privados consumidos. El cambio de la suite y el nuevo helper exigen nuevas dependencias/huellas en cualquier procedimiento posterior; un manifiesto anterior no valida el código actual. B00 y coordinación durable de identidad/revocaciones continúan pendientes.

**D.2A finalizada como diagnóstico offline. Causa 8000 NO DETERMINADA. D.2 remoto bloqueado; esperar autorización independiente para repetir únicamente el preflight.**
