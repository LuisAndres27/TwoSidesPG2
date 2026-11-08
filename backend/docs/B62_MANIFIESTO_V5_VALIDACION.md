# B62 — Generación y validación del manifiesto v5

Fecha: 2026-11-03, Guatemala. **PASS: v5 generado como archivo nuevo y validado localmente; NO activado.** Sin Atlas, usuarios, credenciales, claves JWT, certificados, Express/Caddy, SQLite real, Godot, cuotas, migraciones, cambios de producción, F3.10, commits ni push. `.env` no se abrió ni incluyó en copias/inventarios.

## 1. Identificación del candidato

```text
C:\Users\luis2\AppData\Local\TwoSidesMainIntegrity\backend-integrity-manifest.v5-B62.json
```

| Campo | Resultado |
|---|---|
| Archivos protegidos | **3172** |
| SHA-256 del archivo v5 | **`2A4956E951217DFF2501D3FFBD35C9024554166E9126AD0134D8FB58C77AD726`** |
| treeDigest v5 | **`1f3f507348a479d88362767e9e548200003d646ad8930f54cbfc9efc6a9f8c28`** |
| Creación real registrada, UTC | `2026-11-04T01:30:29.514Z` |
| Equivalente Guatemala | `2026-11-03 19:30:29.514`, UTC−06:00 |
| Generador oficial | Código **0** |
| Verificador oficial CLI | **OK, código 0**, cero diferencias |
| Activación | **Pendiente de autorización posterior** |

El SHA-256 identifica los bytes completos del JSON, incluida su fecha real. `treeDigest` resume nombres/hashes del árbol protegido. No son firmas digitales. No se generó firma ni se usó una clave privada: el procedimiento oficial solo calcula hashes y escribe JSON con creación exclusiva.

## 2. Revisión previa y cambios autorizados

Se revisaron B60, el respaldo completo `local-persistence/.work/pre-B60-abe56b01`, `inventory.json`, `changes-after.json` y `v4-reference.json`. Se compararon **3274 archivos actuales** de código, pruebas, dependencias y configuración con el estado previo y los hashes finales autorizados de B60. No aparecieron cambios inesperados, archivos eliminados o enlaces/redirecciones dentro del alcance inspeccionado.

Los **28 archivos** inventariados en B60 (23 existentes modificados y 5 nuevos, incluyendo pruebas) coinciden con sus hashes finales. La diferencia **protegida por el manifiesto** es exactamente **12 modificados, 3 nuevos y 0 eliminados**. Los cambios de pruebas quedan fuera de ese alcance, pero también se compararon con el inventario B60.

Tres módulos protegidos nuevos:

- `src/main/administrative-policy.js`.
- `src/main/runtime-integrity.js`.
- `src/main/runtime-permissions.js`.

Doce archivos protegidos modificados:

- `src/main/policy.js`, `src/main/runtime.js`, `src/main/schema-inventory.js`.
- `src/main/inspection.js`, `src/main/inspection-authorization.js`.
- `src/main/bootstrap.js`, `src/main/bootstrap-authorization.js`.
- `scripts/run-main-backend.ps1`.
- `scripts/new-main-inspection-authorization.js`, `scripts/run-main-inspection.js`.
- `scripts/new-main-bootstrap-authorization.js`, `scripts/run-main-bootstrap.js`.

Hashes completos antes/después: `local-persistence/.work/pre-B60-abe56b01/changes-after.json`; copia de consulta conservada en `local-persistence/.work/b62-49869e7f/authorized-B60-changes.json`. El manifiesto v5 contiene los 3172 nombres, tamaños y hashes completos, sin abreviar.

Las verificaciones de B60 preparan `twosides_backend_v2`, SHA-256 explícito, rol exacto por colección e integridad obligatoria; no demuestran que exista la cuenta en Atlas. La administración histórica permanece separada; no se ejecutó.

Antes de generar: cero procesos Node/Caddy/Godot/TwoSides y cero listeners de prueba en 3000/3001/8443. Los procesos Node usados después fueron únicamente utilidades locales de archivos/integridad, sin servidores.

## 3. Alcance exacto

El alcance oficial no cambió:

```text
backend/src/
backend/scripts/
backend/node_modules/
backend/package.json
backend/package-lock.json
backend/vitest.config.js
```

Únicas exclusiones admitidas por el procedimiento: `node_modules/.vite` y `node_modules/.vitest-cache`. No se añadieron exclusiones para conseguir un resultado positivo.

Quedan fuera por diseño: `.env`, secretos, claves JWT, certificados, SQLite, datos del jugador, respaldos, `.work`, docs, tests, Godot y C2Runtime. No se copió nada de esos ámbitos a v5. El número crece de **3169 a 3172** por los tres módulos nuevos, no por incluir temporales o datos adicionales.

## 4. Generación y verificación oficiales

Se comprobó primero que el destino nuevo no existía. Se utilizó exclusivamente el generador del proyecto, que abre con `wx` y no sobrescribe referencias existentes:

```powershell
$candidate = Join-Path $env:LOCALAPPDATA 'TwoSidesMainIntegrity\backend-integrity-manifest.v5-B62.json'
node backend/scripts/backend-integrity.js manifest $candidate
node backend/scripts/backend-integrity.js verify $candidate
```

Resultado de generación: `backendIntegrity:ok`, 3172 archivos, treeDigest indicado arriba, código 0. Verificación CLI: `backendIntegrity:ok`, `added:0`, `removed:0`, `modified:0`, `problems:0`, código 0.

La validación no importa Mongoose ni inicia una conexión Atlas. Aunque la utilidad reutiliza la función de política de ubicación del módulo de claves, **no llama al cargador de claves ni lee una clave privada**. El archivo está fuera del proyecto y OneDrive, como exige ese procedimiento.

## 5. Pruebas negativas en copia aislada

Copia desechable y evidencias conservadas:

```text
local-persistence/.work/b62-49869e7f/
  backend/                          # copia de los 3172 archivos cubiertos
  negative-integrity-results.json
  authorized-B60-changes.json
```

Solo se copiaron las rutas enumeradas por v5; cada archivo copiado se comprobó contra su hash. Ningún código de esa copia se ejecutó. Se utilizó la función **oficial** `verifyManifestFile` con raíz de prueba explícita y ancla v5, sin modificar su implementación. La CLI anterior ya había comprobado el árbol real con código 0.

| Caso aislado | Resultado esperado y obtenido |
|---|---|
| Copia inicial íntegra | **PASS**, verificador `ok:true` |
| Alterar la copia de `src/main/runtime-permissions.js` | Rechazo **`tree_differs`**, exactamente 1 modificado |
| Añadir `node_modules/b62-injected.js` solo en la copia | Rechazo **`tree_differs`**, exactamente 1 añadido |
| Eliminar la copia de `scripts/run-main-backend.ps1` | Rechazo **`tree_differs`**, exactamente 1 eliminado |
| Proporcionar un ancla de prueba incorrecta | Rechazo **`anchor_mismatch`** |
| Restaurar todos los archivos de la copia | **PASS**, `ok:true`, cero diferencias |

**Cuatro negativos aprobados; orquestación de comprobación con código 0.** Cada rechazo se consideró éxito de su prueba negativa, no validación del árbol alterado. Las modificaciones y eliminaciones afectaron únicamente a archivos propios de la copia aislada. No se alteraron el backend original, v4, v5 ni respaldos; no se falsificaron firmas.

Se comparó la diferencia v4→v5 con la lista autorizada, incluidos los hashes: 3 añadidos/12 modificados/0 eliminados. Se comprobó la autoconsistencia de `treeDigest` a partir de las entradas y que el JSON v5 permanecía byte a byte igual después de los negativos. No se borró la copia aislada ni ningún respaldo.

## 6. Compatibilidad F1/F2 y regresiones

No hubo ediciones de código en B62. Todo el estado de fuentes/pruebas coincide con el inventario final B60. En particular, F1/F2, repositorios Mongo, compuerta de commit, servicios y contratos Sync v2 conservan los hashes validados allí; cambiar de referencia de integridad no modifica su comportamiento.

Se confirmaron los resultados y límites **documentados**, sin repetir suites no afectadas:

- Legacy B60: 39/39.
- Regresión ampliada B60: 752 aprobadas, 1 omitida y dos expectativas históricas detectadas; reejecutadas y corregidas según el informe B60.
- Comprobación posterior de HTTPS/inventario: 15/15.
- Comprobación final B60 de permisos/main/readiness/F1 warm-up: 37/37.
- F1/F2 habían pasado en la batería focalizada; no se modificaron sus implementaciones. El barrido opcional de latencia omitido no se presenta como aprobado.

No se afirma una única ejecución global final verde en B60 ni una nueva prueba real Atlas en B62. Para B62 las pruebas nuevas ejecutadas fueron la verificación oficial y los negativos de integridad descritos. La campaña real futura sigue necesitando autorización y comprobaciones vivas de identidad/permisos.

## 7. Preservación de v4 y reversión

Referencia instalada anterior **sin sustituir**:

```text
C:\Users\luis2\AppData\Local\TwoSidesMainIntegrity\backend-integrity-manifest.json
```

- SHA-256 v4: **`7DEC55E3E1053F7F63A0D2B859ACB0A56FF931E82DB7BBB2625734326D6C3E8B`**.
- treeDigest v4: `aea04105001d5ca324f817602e781cf5118789f9187c8424c204551ac800e27e`.
- Copia de respaldo: `local-persistence/.work/pre-B60-abe56b01/v4-reference.json`, igualdad de bytes comprobada antes y después.
- Código previo para reversión: `local-persistence/.work/pre-B60-abe56b01/backend/`, con inventario de hashes propio. No usar el intento incompleto de respaldo señalado en B60.

v4 sigue rechazando correctamente el código de B60; preservarlo **no** significa que pueda arrancar ese código con él. Para revertir código en el futuro: autorización específica, servicios detenidos/operaciones conciliadas si los hubiera, restaurar solo archivos B60 inventariados y retirar exclusivamente los nuevos; verificar v4 sobre el árbol restaurado. No restaurar datos, claves, cuentas o secretos como parte del rollback de código.

Descartar el candidato v5 no requiere cambiar ninguna referencia activa, porque no se activó. Conservarlo y sus evidencias no modifica Atlas.

## 8. Condiciones de activación y riesgos pendientes

1. Guardar/contrastar el digest con una referencia independiente confiable antes de entregar credenciales. El hash local de B62 y sus copias en el mismo equipo prueban correspondencia, no procedencia independiente frente a procesos de la misma cuenta.
2. Autorización expresa posterior para activar v5 y para cualquier cambio de la referencia instalada. **No se renombró ni sustituyó `backend-integrity-manifest.json`.** El wrapper actual exige esa ubicación fija: pasar directamente el nombre candidato v5 no es una vía para eludir su control de ubicación. La activación deberá preservar v4 y su paquete y actualizar anclas mediante el procedimiento aprobado, sin cambiar el código para evitar la comprobación.
3. Repetir verificación oficial al activar: cualquier edición posterior invalida estos hashes. Confirmar huella/keyId JWT por su procedimiento protegido solo si una etapa posterior lo requiere; B62 no los leyó ni alteró.
4. La cuenta/rol candidato y autenticación/permisos efectivos Atlas siguen pendientes. Crear cuentas, conectar en lectura, iniciar main o ejecutar una campaña sintética requieren sus autorizaciones independientes B00; v5 no las concede.
5. B00 local persiste: un proceso con control de la misma cuenta puede alterar código y referencias. No se certificaron ACL de nuevo ni se resolvió almacenamiento desatendido de secretos. SHA-256 del manifiesto no sustituye esos controles.

Cierre comprobado: **0 procesos relacionados y 0 listeners de prueba**. No hubo claves, certificados, partidas o datos modificados. **B62 finalizada: v5 validado y disponible como candidato para una futura activación autorizada; B00 no se inicia.**
