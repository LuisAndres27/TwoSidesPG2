# B05.5 Etapa 10 — Herramienta de inspección de solo lectura de `two_sides_db` (preparada, NO ejecutada)

Fecha: 2026-10-30. Continúa desde `B05_5_MAIN_ACTIVATION_READINESS_RESULT.md`. **Preparación terminada; no se conectó a MongoDB Atlas, no se pidió ni usó ninguna contraseña, no se leyó `backend/.env`, no se emitió ninguna autorización, no se habilitó el perfil `main` ni se conectó Godot.** No se tocaron SQLite reales, ACL, propietarios, C2Runtime, C.2/F.2 ni el destino de integración (`ATLAS_TARGET` intacto). **B00 sigue pendiente.**

## 1. Archivos creados (ninguno existente se modificó)

| Archivo | Función |
|---|---|
| `src/main/inspection.js` | Herramienta de una sola ejecución: conector fijo a `two_sides_db`, verificación de conexión e identidad efectiva, inspección, informe y cierre |
| `src/main/inspection-authorization.js` | Autorización de inspección (distinta de la de integración): `kind` propio, destino `two_sides_db`, ventana ≤ 60 min, identidad declarada |
| `src/main/inspection-marker.js` | Marcador de un solo uso `<executionId>.inspection.json` (ids y código de resultado, sin secretos) |
| `scripts/run-main-inspection.js` / `.ps1` | Punto de entrada y lanzador PowerShell (entrada oculta; contraseña por stdin como una trama; entorno del hijo depurado) |
| `scripts/new-main-inspection-authorization.js` | Genera el archivo de autorización fuera del repositorio (no ejecutado) |
| `tests/sync/main-inspection.test.js`, `tests/sync/support/inspection-double.js` | 10 pruebas offline y un doble de MongoDB que registra y rechaza toda operación no permitida |

Reutiliza sin cambios `schema-inventory.js` (etapa 9, verificado contra los modelos Mongoose), `atlas-credentials.js` y `atlas-error-diagnostic.js`. No importa el perfil `integration`, el runtime Express de `main`, `dotenv` ni lee variables de entorno.

## 2. Operaciones permitidas (lista cerrada)

`connectionStatus{showPrivileges}` · `hello` · `listCollections` (sin filtro) · `listIndexes` (por colección) · `estimatedDocumentCount` (metadato, no lee documentos) · un único `findOne({_id:'ingestion-v1'}, {projection:{revision:1}})` sobre `main_v2_fences`.

Nunca: insertar, actualizar, borrar, crear colecciones o índices, `syncIndexes`, reparar, registrar modelos Mongoose (no hay `autoIndex`/`autoCreate`/`init` posible), abrir HTTP, ni leer documentos de jugadores, sesiones, tokens o hashes. El informe contiene solo nombres, definiciones de índices, recuentos estimados y booleanos de la semilla (existe y revisión entera ≥ 0). Los nombres con caracteres no seguros se enmascaran y hay topes (200 colecciones, 40 índices por colección).

## 3. Qué comprueba

- Colecciones existentes (todas, incluidas las de formato histórico desconocido, solo por nombre, tipo, recuento estimado e índices).
- Las siete `main_v2_*` y sus cinco índices únicos (`owner_operation_unique`, `scope_source_unique`, `identity_registration_unique`, `identity_binding_unique`, `identity_token_unique`) más `_id_`; índices faltantes, incompatibles (clave distinta, no único, sparse, parcial, hidden, TTL, collation) e inesperados.
- Conflictos: objeto que no es una colección normal (vista…), opciones de colección (capped, validator…).
- Semilla `ingestion-v1` y validez de su `revision`; replica set y primario escribible (transacciones).
- Veredicto: `ready` · `bootstrap-required` (ninguna colección `main_v2_*`) · `partial` · `indexes-incomplete` · `seed-missing` · `conflict`.
- Compatibilidad con los modelos Mongoose actuales: IN10 deriva los índices de los modelos vivos y exige veredicto `ready`.

## 4. Identidad y permisos mínimos

La herramienta no usa el usuario de integración (rechazado en autorización y conector). Dos identidades posibles, declaradas en la autorización:

1. **`dedicated-read-only` (recomendada):** un usuario nuevo de Atlas con **un solo rol `read` sobre `two_sides_db`** (acciones `find`, `listCollections`, `listIndexes`, `collStats`…). No se crea ni se amplía nada automáticamente; lo crea el operador en Atlas.
2. **`rotated-backend`:** `twosides_backend` (rol `readWrite`) **solo después de rotar su contraseña (B00)**. Aunque los privilegios permitirían escribir, el código no contiene ninguna llamada de escritura (IN03 lo comprueba por doble y por análisis del fuente).

La identidad efectiva (`connectionStatus`) debe ser exactamente un rol en `two_sides_db` coherente con la declaración (`read` ↔ dedicated, `readWrite` ↔ backend), sin roles ni recursos en otras bases, con `find`, `listCollections` y `listIndexes`. Si no, se cierra sin inspeccionar.

## 5. Pruebas (todas con doble, sin red ni DNS)

| # | Cubre |
|---|---|
| IN01 | Destino principal fijo; destinos/usuarios/mecanismos/TLS alternativos rechazados antes de conectar; autorizaciones inválidas (host, base, usuario de integración, tipo, ventana > 60 min, identidad incoherente) |
| IN02 | Esquema completo → `ready`; solo operaciones permitidas; informe sin documentos ni secretos (la semilla del doble incluye campos privados que no deben aparecer) |
| IN03 | **Ausencia de escrituras:** cualquier llamada fuera de la lista falla y queda registrada; 6 veredictos distintos; análisis estático del fuente |
| IN04 | Colecciones, índices e `_id_` faltantes; semilla ausente o con revisión inválida (−1, 1.5, '1', null, undefined); base vacía = tres lecturas |
| IN05 | Índices incompatibles (8 variantes), vista y opciones de colección → `conflict`, sin reparación; colecciones ajenas listadas solo por nombre |
| IN06 | Permisos insuficientes o identidad que no coincide; denegación del servidor en cada paso → `inspection_permission_denied`, cierre una vez |
| IN07 | Errores de conexión (autenticación, DNS, TLS, timeouts) con código/etapa/categoría propios; cierre ordenado; ningún secreto, URI ni host en salida, marcador o error |
| IN08 | Candados: bandera explícita, autorización válida, trama de credencial por tubería, uso único (también tras un fallo); credencial rechazada no consume |
| IN09 | Independencia (sin Express, sin integración, sin `process.env`/`.env`); lanzador con entrada oculta, entorno depurado, máscara de unidades UTF-16, BOM; generador fuera del repositorio |
| IN10 | Compatibilidad con los modelos Mongoose actuales |

Resultado: **10/10**; regresión completa `run-backend-regression.js` **663 + 9 aprobadas, 16 omitidas, 0 fallos**; legacy 39/39; el `.ps1` parsea sin errores. Son resultados del doble; no describen a Atlas.

## 6. Precondiciones para ejecutarlo (todas por separado)

1. B00 aceptado o mitigado por escrito; contraseña de la identidad elegida rotada/creada y no compartida en el chat.
2. Identidad de inspección confirmada en Atlas (preferible `read` en `two_sides_db`) y Network Access que permita la IP actual.
3. Autorización emitida por el operador (1 h, un solo uso).
4. Windows, Node ≥ 20, ejecución desde PowerShell con entrada oculta.

## 7. Comando manual propuesto (NO ejecutar todavía)

```
# 1) Emitir la autorización (fuera del repositorio; sin contraseña)
node scripts\new-main-inspection-authorization.js "C:\Users\luis2\AppData\Local\TwoSidesMainInspection" dedicated-read-only <usuario-de-solo-lectura>
#    o, tras rotar la contraseña de twosides_backend:   ... "C:\...\TwoSidesMainInspection" rotated-backend

# 2) Ejecutar (desde backend\, en PowerShell; pide la contraseña con entrada oculta)
.\scripts\run-main-inspection.ps1 -Enable -Authorization "C:\Users\luis2\AppData\Local\TwoSidesMainInspection\main-inspection-authorization-<executionId>.json"
```

Salida: una línea JSON `mainSchemaInspection: finished` con el veredicto y el informe; en fallo, `reason=`, `stage=`, `category=`, `approxMs=`. Código de salida 0 si completó. Un fallo (también de autenticación) consume la autorización: hay que emitir otra.

## 8. Riesgos pendientes

- Sin medición real: forma exacta de `listCollections`/`indexes()` en Atlas (p. ej. `ns`, `v`, opciones añadidas por Compass) podría producir falsos `conflict`; se leería como dato, no como fallo de seguridad, y se ajustaría tras la primera ejecución autorizada.
- Con `rotated-backend` los privilegios son de escritura; la garantía es del código, no del servidor. Preferir `read`.
- `estimatedDocumentCount` es aproximado; no demuestra que una colección esté vacía.
- Una inspección no sustituye al bootstrap: sigue sin existir herramienta de creación de `main_v2` (bloqueo de la etapa 9).
- El uso único consume la autorización aunque falle la contraseña.
- B00.

## 9. Resultado esperado de la primera inspección

Lo más probable es `bootstrap-required` (ningún `main_v2_*` existe todavía) con la lista de colecciones históricas de `two_sides_db` (nombre, recuento estimado, índices), lo que permitiría diseñar el bootstrap sin tocarlas. `partial`, `seed-missing` o `conflict` indicarían trabajo previo no documentado y se detendría cualquier plan de creación hasta revisarlo. `ready` solo sería posible si el esquema ya se hubiera creado por otra vía.

Detenido antes de cualquier conexión real.
