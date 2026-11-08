# B60 — Verificadores de mínimo privilegio

Fecha: 2026-11-03, Guatemala. **Candidato implementado y verificado offline. No desplegado; bloqueado para arranque real hasta nuevo sellado autorizado.** Sin conexión Atlas, creación de cuentas, cambios de contraseña, SQLite/Godot, cuotas, contratos Sync v2, certificados, Caddy, F3.10, commits ni push. No se abrió `.env`. No se generó ni activó un manifiesto v5 de despliegue.

## 1. Contrato de aplicación preparado

Se siguió B59 para el futuro runtime: usuario **`twosides_backend_v2`**, `authSource=admin`, host `<cluster>.<id>.mongodb.net`, base `two_sides_db`, **SCRAM-SHA-256 explícito** y TLS estricto. No existe fallback a DEFAULT, SHA-1 ni `twosides_backend`. El código no crea ni acredita la existencia de esa cuenta.

Rol esperado **`two_sides_main_runtime_v1@admin`**. Su namespace de definición no concede acceso a datos de `admin`: todos los recursos se limitan a `two_sides_db`. El propietario debe confirmar esta definición exacta antes de crear el rol; si el servidor presenta una configuración distinta, se detiene, no se relaja automáticamente el verificador.

| Recurso | Acciones efectivas exactas |
|---|---|
| `two_sides_db`, collection `''` | `listCollections` exclusivamente |
| Cada colección `main_v2_operations`, `main_v2_facts`, `main_v2_fences`, `main_v2_identities`, `main_v2_ownerGuards`, `main_v2_identitySessions`, `main_v2_revocations` | `find`, `insert`, `update`, `listIndexes` |

El verificador combina entradas divididas/reordenadas y acciones repetidas en una unión por recurso, sin exigir un orden de respuesta del servidor. Requiere todo el conjunto y rechaza recursos/acciones adicionales, roles extra, campos de recurso desconocidos, otras bases, comodines, colecciones históricas, `main_v2_authorization`, DDL y `remove`. Exigir solo el nombre del rol no sería suficiente: también se comparan sus privilegios efectivos.

Registro/sesión utilizan upserts y modificaciones de guardias/versiones: necesitan `insert` y `update`. Recibos se leen de las operaciones existentes; la coordinación de la petición conserva sus escrituras de autorización/fence. Conteos usan lectura; el driver instalado implementa `estimatedDocumentCount()` con `count`, no se añadió `collStats` por suposición. La compatibilidad remota de esos comandos con el rol permanece pendiente de una sesión autorizada.

## 2. Cambios realizados

Fuentes nuevas:

- `src/main/runtime-permissions.js`: matriz efectiva estricta y principal/rol candidatos.
- `src/main/runtime-integrity.js`: guardia obligatoria en la entrada de proceso Node, antes de importar Mongoose/recibir credenciales/conectar.
- `src/main/administrative-policy.js`: contrato histórico separado para inspección y provisión, fijado a la identidad anterior; el runtime no importa este módulo.

Fuentes existentes:

- `src/main/policy.js`: destino de identidad candidato, SHA-256 explícito y delegación al verificador restringido con error fijo `main_permissions_unverified`.
- `src/main/runtime.js`: exige la guardia de integridad también al invocar la entrada Node directamente. La API de composición inyectable usada por pruebas permanece disponible; no es una vía de despliegue aprobada sin sus controles de integridad.
- `scripts/run-main-backend.ps1`: la guardia deja de ser opcional; ausencia de manifiesto/anclas impide el prompt. Propaga solo referencias/anclas no secretas al proceso para la segunda verificación. Transporte oculto por stdin y controles de ruta/ACL existentes conservados.
- `src/main/schema-inventory.js`: actualiza únicamente la descripción del requisito de identidad; no cambia colecciones, índices, semilla o esquema.
- `src/main/{inspection,inspection-authorization,bootstrap,bootstrap-authorization}.js`: solo separan su import de política administrativa de la nueva política runtime.
- `scripts/{new-main-inspection-authorization,run-main-inspection,new-main-bootstrap-authorization,run-main-bootstrap}.js`: utilizan explícitamente esa política administrativa histórica.

**Separación administrativa:** las herramientas históricas conservan DEFAULT y sus requisitos anteriores de lectura/provisión; no se las presenta como migradas a la cuenta nueva ni como ruta de operación normal. Mantienen sus autorizaciones explícitas, límites y marcadores propios. La nueva cuenta restringida no pasa sus verificadores administrativos y no necesita hacerlo. No se ejecutó ninguna de ellas. Una futura inspección mínima de la nueva cuenta deberá usar el conector/política restringidos y operaciones de lectura acotadas, con autorización independiente; no ampliar su rol para acomodar el inspector histórico.

Pruebas: se añadieron `tests/sync/main-restricted-permissions.test.js` y `support/restricted-status.js`; se adaptaron fixtures/expectativas de main, SCRAM y administración histórica. Se actualizaron dos verificaciones antiguas de HTTPS: la excepción **única** localhost sintética de B57 y el requisito de nueva integridad para los archivos autorizados de B60; se mantiene la prohibición de URLs públicas y bypass TLS. Los negativos de permisos, destino, TLS y secretos se conservan y amplían.

Inventario completo con SHA-256 original/final: `local-persistence/.work/pre-B60-abe56b01/changes-after.json`. Registra **23 archivos existentes modificados y 5 nuevos**: 12 fuentes/scripts existentes + 3 módulos nuevos de producto, y 11 archivos de pruebas existentes + 2 nuevos. Los imports administrativos solo cambian de política, no amplían permisos ni alteran su procedimiento. Los informes anteriores permanecen intactos.

## 3. Arranque, permisos y administración

El arranque normal conserva todas sus comprobaciones: identidad efectiva vía `connectionStatus`, catálogo, siete colecciones existentes, definiciones exactas de índices, semilla `ingestion-v1` válida y primario de replica set. La lista de catálogo puede incluir históricos, pero no concede lectura de sus documentos.

`autoCreate=false`, `autoIndex=false` y `bufferCommands=false` permanecen intactos. No se llama a `createCollection`, `createIndex`, `syncIndexes`, migraciones o bootstrap para reparar una discrepancia. Si faltan índice, colección o semilla, se cierra la conexión antes de admitir HTTP. Cada colección requiere `listIndexes`, incluso con solo `_id_`; ese permiso no es creación de índices.

`readWrite` deja de ser dependencia del **runtime**. Permanece únicamente en la herramienta histórica de provisión/inspección que lo exigía, bajo su contrato independiente. DDL o limpieza requieren procedimiento/identidad específicos; no se otorgan a la aplicación. Un permiso de colección no puede aislar la semilla de otros fences ni un jugador de otro: eso continúa protegido por las invariantes del repositorio y el middleware, no se promete aislamiento por documento mediante este rol.

## 4. Integridad del arranque

El wrapper sigue validando ubicación de clave/manifiesto, ACL, ancla externa, keyId y huella pública antes de pedir contraseña. Ahora rechaza que se omita la guardia. La entrada de proceso Node exige además:

```text
MAIN_INTEGRITY_MANIFEST
MAIN_INTEGRITY_ANCHOR
MAIN_KEY_FINGERPRINT
MAIN_EXPECTED_KEY_ID
```

Son rutas/referencias públicas de integridad, no credenciales. No sustituyen los parámetros protegidos de clave ya existentes. La entrada ejecuta el mismo `runPreflight` antes de cargar Mongoose o consumir stdin; configuración incompleta devuelve `main_integrity_required`, y verificación fallida `main_integrity_rejected`, sin driver errors o material privado.

Se conservan la entrada oculta, UTF-8 estricto, contraseña separada de URI/opciones públicas, limpieza de buffers/BSTR y entorno del hijo mínimo. No se proporciona fuente alternativa de contraseña en variables o archivo. Los argumentos/anclas pueden ser manipulados por quien controla la misma cuenta y el código: no se declara resuelto el riesgo B00 de procedencia/ejecución local.

## 5. Respaldo y reversión

Antes de editar se verificó v4: **3169 archivos y cero diferencias**. Respaldo completo de su ámbito de código/dependencias, más pruebas y documentación:

```text
local-persistence/.work/pre-B60-abe56b01/
  backend/{src,scripts,tests,docs,node_modules,...paquetes/configuración}
  inventory.json
  v4-reference.json
```

**3473 archivos copiados y verificados individualmente por SHA-256**, más referencia v4 cuya igualdad con el original se volvió a comprobar. Exclusiones deliberadas: `.env`, temporales `backend/.work` y los dos caches de Vitest excluidos por el manifiesto. No se copió SQLite, claves privadas, partidas ni C2Runtime. No es una referencia independiente fuera del equipo.

El primer intento de respaldo, antes de editar, falló por longitud de ruta Windows dentro de docs. Se conservó como incompleto con `INCOMPLETE.txt` en `local-persistence/.work/backups/pre-B60-20261104T005432Z-9ffbc7b65ce9456e90e1533b745c7c32`. **No restaurar desde ese intento.** Se repitió en la ruta corta anterior con manejo de rutas largas y verificación de todos los archivos; recién entonces se editaron fuentes.

Reversión: detener cualquier despliegue futuro y conciliar operaciones en vuelo; restaurar **solo los archivos cambiados** desde el respaldo verificado, retirar únicamente los nuevos archivos de B60 inventariados y verificar de nuevo v4. No sobrescribir el árbol completo, secretos, temporales ni datos; no restaurar caches. Las cuentas Atlas no se han cambiado y no requieren reversión. La cuenta anterior no fue eliminada; volver a ella en una futura campaña requiere decisión expresa, credencial segura y el paquete/ancla anteriores, sin fallback automático.

## 6. Pruebas y resultados

Solo dobles/repositories simulados y fixtures criptográficos temporales. Ninguna prueba usa la contraseña/clave JWT real; se sustituyó un caso antiguo que alcanzaba el preflight de la clave instalada por comprobaciones equivalentes con fixtures. El guard de `.env` y el de datos SQLite protegidos se cargan antes de las suites. Las pequeñas composiciones HTTP de pruebas usan loopback y repositorios dobles, no un backend conectado a Atlas.

Cobertura nueva LP01–LP11: matriz exacta y unión normalizada; cada acción faltante; excesos de privilegios; principal/role namespace incorrectos; arranque simulado sin DDL; falta de índice/colección/semilla; cierre idempotente; errores sanitizados; entrada Node sin anclas; wrapper sin guardia antes del prompt; rechazo de v4 sobre el árbol candidato sin modificarlo. SCRAM prueba opciones reales del driver con conexión interceptada y DNS/sockets bloqueados, incluyendo Unicode/especiales y rechazo de la identidad vieja y mecanismos incompatibles.

Resultados reales y trazabilidad:

| Ejecución | Resultado |
|---|---|
| Legacy, `npm run test:legacy` | **39/39**, cero fallos |
| Regresión ampliada inicial, 49 archivos | 752 aprobadas, 1 omitida, 2 expectativas históricas fallidas; log `backend/.work/b60-regression.log` |
| Batería focalizada de 8 archivos, incluyendo B60/SCRAM/F1/F2/HTTPS/inventario | 93 aprobadas, 1 omitida y 3 expectativas de prueba fallidas; F1/F2 y verificadores restringidos aprobados |
| Reejecución tras corregir HTTPS/inventario, 2 archivos | **15/15**, cero fallos |
| Comprobación final tras endurecer también arrays malformados de identidad/rol, 4 archivos (`main-restricted-permissions`, `main-profile`, `main-readiness`, `main-f1-warmup`) | **37/37**, cero fallos |

**No quedan fallos pendientes en los archivos ejecutados según su última ejecución.** No se afirma que toda la selección se ejecutó en una única pasada final verde: la regresión ampliada detectó expectativas antiguas y se reejecutaron sus archivos después de corregirlas. La omisión corresponde al barrido opcional de latencia `VL02` sin `MEASURE_LATENCY`; no se considera aprobado ni se necesita para comprobar el cambio de permisos.

Correcciones de pruebas: HT05 aún prohibía el literal localhost añadido por B57 y esperaba timeout 10 s anterior a F3.1; ahora admite exclusivamente ese origen condicionado a sandbox y exige 15 s, conservando todas las prohibiciones de bypass TLS/secretos. HT07 asumía que runtime/wrapper seguían idénticos a v4; ahora exige nueva integridad para esas ediciones y conserva la identidad de las fuentes de transporte ajenas a B60. En inventario G1 se comprueba que v4 detecta el candidato pendiente de sellar; G7 usa una línea base **solo en memoria** para aislar los negativos de manipulación, sin sobrescribir la referencia instalada.

Hubo asimismo errores iniciales de adaptación de fixtures históricos (provisión seguía usando el principal de runtime) y del formato de la respuesta del probe; se corrigieron. Un intento de actualizar expectativas usó un directorio de trabajo incorrecto y no editó archivos; la repetición con ruta correcta terminó en 15/15. Ninguno se presenta como fallo real de TLS o transacción. Los manifiestos/keys efímeros creados por pruebas de integridad son fixtures temporales: no son v5 ni se instalaron en la ubicación protegida.

Selección ampliada: suites JWT, identidad persistente y Sync; excluye las suites archivadas `c2-*`, planes históricos `*-plan.test.js` y, inicialmente, `main-lp06-inventory-guard.test.js` porque asumía que el manifiesto instalado coincidía con el árbol. Esta última se adaptó para exigir el rechazo del candidato no sellado y se incorporó a la comprobación final; sus ataques sobre inventarios siguen usando copias en memoria. Las suites C.2 y planes de campañas remotas no validan este cambio y no se ejecutaron. No se inició F3.10.

## 7. F1/F2, contratos y límites

No se modificaron repositorios MongoDB, compuerta de commit, presupuestos, servicios/routes Sync v2, JWT, pool, cuotas, esquemas o código Godot. Comparación con el respaldo confirma byte a byte intactos `ingestion-engine.js`, `mongo-ingestion-repository.js`, `ingestion-service.js`, `budget.js`, `deployment-check.js`, `mongo-identity-repository.js`, `config/database.js` y `main/profile.js`. F1 conserva calentamiento, índices, caché acotada e invalidación; F2 conserva transacciones, punto de commit, espera del resultado real e incertidumbre sin ACK falso. Cambian identidad y permisos de conexión **antes** de componerlos. Las regresiones de main usan el rol mínimo simulado; las pruebas F1/F2 siguen ejercitando los mismos repositorios y semántica transaccional.

Nada de lo aprobado offline demuestra que Atlas ya acepte el nuevo rol o SHA-256. Sigue pendiente comprobar permisos efectivos/normalización del servidor real, `count`, catálogo, índices, red y autenticación bajo autorización de lectura. No se demuestra capacidad de volumen ni cierre de telemetría en Godot; B58 y sus limitaciones siguen vigentes.

## 8. Procedimiento pendiente para v5

**No se ejecutó.** El v4 original está conservado y coincide por SHA-256 con `v4-reference.json`. Comprobación final del árbol: rechazo esperado `tree_differs`, **3 archivos añadidos, 12 modificados, 0 eliminados y 0 problemas de enlaces/especiales**. Son exactamente los cambios protegidos inventariados. No arrancar el backend principal con esa referencia ni regenerarla automáticamente para silenciar el rechazo. En la carpeta protegida no se creó un v5.

1. Revisar diff, inventarios de hashes, regresiones y alcance administrativo separado; confirmar que la configuración candidata es la aprobada.
2. Con nueva autorización, generar un manifiesto candidato **en una ubicación nueva y privada**, con creación exclusiva, nunca sobrescribiendo el v4. Nombre v5 o siguiente versión libre.
3. Comparar exclusiones/ámbito y diferencias con el inventario B60; verificar con el comprobador actual y las anclas correctas. Generar una referencia externa confiable siguiendo el procedimiento aprobado; un hash recalculado solo en el equipo no prueba procedencia.
4. Activación posterior requiere autorización expresa: conservar v4 y su paquete, instalar la referencia nueva en la ubicación protegida según el procedimiento aprobado, actualizar ancla de arranque y herramientas fijadas por hash. Probar que la ancla antigua se rechaza y la nueva pasa **sin conectar**.
5. Cualquier edición posterior invalida el candidato y exige revisión/sellado nuevo. Las comprobaciones de etapa que esperan v4 obsoleto deberán archivarse o retargetearse explícitamente al aprobar una nueva referencia; no son permiso para aceptar un manifiesto incoherente.

No se publica un comando de activación remota ni se emite una autorización/canal de credenciales en B60.

## 9. Condiciones antes de crear la cuenta Atlas

Autorización específica del propietario para crear **solo** el rol `two_sides_main_runtime_v1` y usuario `twosides_backend_v2`, confirmando namespace del rol, matriz exacta, clúster/IP, ausencia de nombres ocupados y almacenamiento/rotación del secreto. Mantener la cuenta anterior hasta comprobar la nueva. No crear un inspector/administrador por rutina ni sumar `readWrite` para superar un fallo.

La nueva cuenta no debe usarse mientras no exista un candidato sellado/aceptado y una autorización independiente de conexión. Primera sesión futura: SHA-256 explícito, TLS normal, identidad/privilegios efectivos y metadatos de lectura; ningún Express, escritura sintética o cambio de esquema implícito. La campaña de Godot/Atlas y su guardia finita necesitan autorización posterior propia.

Comprobación de cierre: **0 procesos Node/Caddy y 0 listeners en 3000/3001/8443**. No queda un backend de prueba arrancado. **B60 finalizada; B00 continúa pendiente. No se activa Atlas, v5 ni otra etapa.**
