# B86.5 — Mecanismo de autenticación en modo Atlas: SCRAM-SHA-1

Fecha: 5 de noviembre de 2026. Esta decisión **prevalece** sobre cualquier mención a «SCRAM-SHA-256» en modo Atlas de los demás documentos B86 (el servidor local desechable conserva SCRAM-SHA-256).

## 1. Decisión
- **Modo Atlas:** el conector usa `authMechanism: SCRAM-SHA-1` de forma **explícita**, con `authSource: admin`, TLS obligatorio y validación normal de certificado y nombre.
- **MongoDB local de pruebas (`local-rbac`):** sigue en **SCRAM-SHA-256** y no se puede degradar.
- El mecanismo se fija en el código (`AUTH_MECHANISM_BY_KIND` en `atlas-policy.js`, tabla congelada): no viene del entorno, de argumentos ni de la configuración que escribe el propietario.

## 2. Motivo y evidencia
Diagnóstico autorizado por el propietario, ejecutado con la identidad `twosides_statistics_reader_v1` (herramienta `tools/b86/diagnose.js`):

| Variante | Resultado |
|---|---|
| A — mínima, SCRAM-SHA-256, `authSource` admin | **FAIL** — `MongoServerError`, code 8000, `AtlasError`, `bad auth`, etapa `connect` |
| B — todas las opciones del conector, SCRAM-SHA-256 | **FAIL** — igual |
| C — como A, SCRAM-SHA-1 | **OK** |
| D — como A, sin mecanismo (el driver negocia) | **OK**; usuario y rol correctos |

Antes: el `hello` sin credenciales, ejecutado por el propietario, ya había confirmado SRV, TLS, lista de IP y replica set. Es decir, la red y el TLS no eran la causa; la autenticación con SCRAM-SHA-256 sí lo era.

**Alcance de la evidencia:** se comprobó **solo en TwoSidesCluster**, con **una** identidad (`reader`), el 5 de noviembre de 2026. **No** se ha comprobado en otros clústeres de Atlas ni con las otras tres identidades. No se conoce por qué TwoSidesCluster rechaza SCRAM-SHA-256 para este usuario; la hipótesis de que Atlas no admita SCRAM-SHA-256 **no** está confirmada (la documentación pública indica lo contrario) y no se ha investigado la causa en el lado de Atlas. La decisión es un ajuste práctico respaldado por esa prueba, no una afirmación general.

## 3. Consecuencias y riesgos aceptados
- SCRAM-SHA-1 es más débil que SCRAM-SHA-256 (HMAC-SHA-1; menos iteraciones). Se compensa con: TLS siempre activo con certificado validado, lista de IP restringida, contraseñas largas y únicas por identidad, privilegios mínimos exactos (comprobados en cada sesión) y usuario de esquema temporal. Es una **excepción documentada**, limitada a Atlas.
- Las demás identidades (`ingest`, `schema`, `publisher`) no se han probado contra Atlas. Si alguna rechazara SCRAM-SHA-1 con `code 8000`, el informe lo clasifica como `authentication` y no se debe cambiar el mecanismo sin nueva autorización.
- Si en el futuro se confirma que SCRAM-SHA-256 funciona en TwoSidesCluster (p. ej. al recrear el usuario), basta cambiar **una** entrada de `AUTH_MECHANISM_BY_KIND` y regenerar `B86_ATLAS_ROLES_Y_ESQUEMA.json`.
- La segunda conexión de Metabase (plantilla JSON) se actualizó al mismo mecanismo (`authMechanism=SCRAM-SHA-1`) por coherencia; no se ha creado ninguna conexión.

## 4. Clasificación de errores (misma fase)
Un `MongoServerError` con **code 8000** (o 18) en la etapa `connect` se clasifica como **`authentication`** (antes caía en `unknown` cuando el mensaje no coincidía). Fuera de la etapa `connect`, o si el error no viene del servidor, no se promueve. El saneado de errores no cambia.

## 5. Qué NO cambió
TLS y validación de certificado; comprobación exacta de privilegios; bloqueos de producción; saneado de errores; usuarios, roles, contraseñas y configuración de Atlas; matriz de privilegios; contrato `statistics-only-v1`.

## 6. Archivos
Cambiados: `src/modules/statistics/atlas-policy.js` (tabla de mecanismos, comprobación del objetivo), `src/modules/statistics/atlas-connector.js` (mecanismo derivado del tipo, comprobación, clasificación 8000), `tools/b86/session.js` (el informe indica el mecanismo real), `tools/b86/deployment-plan.mjs` y `docs/B86_ATLAS_ROLES_Y_ESQUEMA.json` (generado), `docs/B86_metabase-atlas-connection.template.json`, documentos B86. Pruebas: `tests/b86/b86-mechanism.test.js` (nuevo), `tests/b86/b86-offline.test.js` y `tests/b86/b86-diagnose.test.js` (expectativas del mecanismo en modo Atlas). `tools/b86/diagnose.js` no cambia: la variante A sigue forzando SCRAM-SHA-256 a propósito, para poder repetir la comparación.

## 7. Siguiente paso
Preflight del lector con el conector actualizado (solo lectura, tras autorización expresa): `.\tools\b86\Run-Atlas-Session.ps1 -Identity reader -Action preflight -AtlasHost <cluster>.<id>.mongodb.net`.
