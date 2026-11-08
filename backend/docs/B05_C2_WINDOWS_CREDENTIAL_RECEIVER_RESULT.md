# C.2 Windows — Preparación del receptor de credenciales

Fecha: 2026-10-29. **Resultado: BLOQUEADO para preparar el receptor.** La condición de la sección 2 de la instrucción no se cumple: **no existe una referencia independiente verificada del manifiesto**. Conforme a esa sección, no se preparó ningún receptor que acepte credenciales. Sí quedaron verificadas la copia C2Runtime y preparado el mecanismo de contraste. No se conectó Atlas, no se solicitó ni introdujo ninguna contraseña, no se ejecutó C.2/F.2/B05.5 y la activación remota sigue deshabilitada. B00 continúa pendiente.

Parte de `B05_C2_WINDOWS_RUNTIME_PREPARATION_RESULT.md`. No se recreó la copia ni se reinstalaron dependencias.

## 1. Referencia independiente — estado: PENDIENTE

| Elemento | Estado |
|---|---|
| Digest del manifiesto a conservar | SHA-256 de `manifest.json`: `8DCCBF599E7C93B94386668F752DA4F1CFD58F35D9DCA39BDCED5A418D3FB0AE` (recalculado hoy; coincide con el informe anterior) |
| Copia externa del manifiesto o de su digest | **No verificable desde esta sesión y no hay constancia de que exista.** El informe anterior la dejó como acción del usuario |
| Git | `backend/` sigue sin versionar (0 archivos en `HEAD`, `origin/master`, `origin/main`). No se hizo commit, push ni `git add` |
| Contraste hecho hoy | Solo frente a este mismo equipo (informe y disco). Eso **no** es referencia independiente |

Un digest que yo calcule o copie desde un archivo de este equipo no sustituye la referencia: es la misma fuente modificable. Tampoco se genera una referencia nueva para tratarla como procedencia histórica.

**Qué debe hacer el usuario (una vez):**
1. Guardar `manifest.json` (302.767 bytes) y el digest anterior en un medio que no sea el árbol modificable, preferiblemente fuera del equipo (dispositivo externo, otra cuenta bajo su control). Registrar fecha y medio.
2. Cuando vaya a contrastar, leer el digest **desde ese medio** y pasarlo al verificador (§3). No copiarlo de este informe.
3. Decidir por escrito si acepta que la copia externa solo ancla hacia adelante: no acredita que los bytes fueran auténticos antes de la revisión.

El manifiesto no contiene secretos (rutas relativas, SHA-256, versiones, destino permitido, SID excluidos, Node, modo `offline-only`, `remoteEnabled:false`).

## 2. Verificación de C2Runtime (hecha hoy, solo lectura)

Ruta: `C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\c2-67d95728399e4e30a406eba7301979fd` — coincide con el informe; existe; sin atributo de redirección; es el único subdirectorio de `C2Runtime`.

| Comprobación | Resultado |
|---|---|
| Manifiesto vs archivos | **1.890/1.890 hashes coinciden**; 0 faltantes; 0 archivos extra en `package/`; sin symlinks/junctions; ningún archivo con más de un enlace físico |
| `package.json` y lock vs `preparation.json` | Coinciden (`5C13E468…`, `8593726A…`) |
| Lock de runtime vs lock original | 35 entradas, **literalmente idénticas** al original; `package.json` sin scripts y con solo las 4 dependencias directas |
| Dependencias instaladas | 23 paquetes; ninguno fuera del lock; versiones iguales al lock; los dos binarios win32 no instalados (`arm64`, `ia32`) están excluidos por CPU, como corresponde |
| Bytes instalados vs registro | 1.858 archivos comparados con los tarballs del registro (descargados en la fase anterior): **0 diferencias, 0 extras** |
| Fuentes selladas vs proyecto | 29/29 iguales (continuidad, no procedencia) |
| Node | v24.19.0, mismo hash que el manifiesto; firma Authenticode válida (OpenJS Foundation) |
| ACL | **2.780 objetos** del árbol C2Runtime inspeccionados (solo ese árbol, sin Set-Acl/icacls): propietario único = usuario actual; **0 ACE de los dos SID B00**; **0 ACE Allow con escritura/borrado/cambio de DACL para principales fuera de {usuario, SYSTEM, Administradores}**; 0 ACE Deny; 0 reparse points; herencia normal desde `TwoSides` |
| Rutas inesperadas | Ninguna dentro de `package/`. Ver hallazgo A |

Observación sobre los SID B00: ninguno de los dos comparte el prefijo de autoridad de este equipo (`S-1-5-21-1972436287-3393038613-924685975`). Eso indica que **no son cuentas locales de esta máquina**; no prueba que sean benignos ni explica su origen.

**Hallazgo A (nuevo, riesgo bajo):** fuera de `package/` y del manifiesto hay 542 archivos en `temp/node-compile-cache` (caché de compilación creada por npm durante la instalación) y 50 en `support/npm-cache`. No están cubiertos por el manifiesto. Ninguna fuente de la copia activa `enableCompileCache` ni `NODE_COMPILE_CACHE`, así que hoy no se usan, pero el lanzador asigna `TEMP`/`TMP` a ese `temp/`. Corrección: en la próxima versión sellada, usar un directorio temporal vacío por ejecución, fallar si no está vacío al arrancar e incluir `temp/` y `support/` en la regla de inventario.

**Hallazgo B (nuevo, procedimiento):** la suite `tests/sync/c2-windows-runtime-preparation.test.js` **modifica temporalmente la copia sellada** (CP04 añade una línea a una fuente y la restaura; CP05 crea un nuevo run). Por eso **no se reejecutó** sobre la copia: habría roto la coherencia con un digest externo si se interrumpía. Con `TWOSIDES_C2_OFFLINE_ROOT` sin definir, sus 14 casos se omiten (verificado). Una vez fijada la referencia externa, esa suite no debe apuntar a la copia sellada; debe usar una copia desechable.

## 3. Mecanismo de contraste preparado

Archivo nuevo: `backend/scripts/c2-verify-reference.ps1` (solo lectura; no escribe, no abre red, no lee `.env`/SQLite/credenciales, no ejecuta nada del release). Recibe un único parámetro obligatorio: el SHA-256 del manifiesto **leído de la copia externa**.

Comprueba, en orden: cadena de directorios sin redirecciones; `manifest.json` igual al digest externo; `releaseId` y `remoteEnabled:false`; conjunto exacto de archivos de `package/` (sin extras ni faltantes, sin enlaces); SHA-256 de cada archivo; hash y firma de `node.exe` según el manifiesto. Salida: `C2_REFERENCE_CHECK=PASS|FAIL code=<categoría fija>`, sin rutas ni contenidos. La release está fijada en el script: no acepta otra ruta.

Pruebas del mecanismo (sintaxis sin errores): con el digest tomado del informe local → `PASS files=1890`; con un dígito cambiado → `FAIL code=manifest_differs_from_reference`; con valor mal formado → rechazado por validación. **Esto prueba el mecanismo, no la independencia de la referencia.** No se probó alteración de un archivo individual sobre la copia sellada (ver hallazgo B); lo cubre CP04 de la fase anterior.

Límites: el propio script vive en el árbol modificable del proyecto (es corto y legible; debe conservarse también su digest fuera del equipo); verifica, no protege durante la ejecución; no mide hardlinks (se comprobaron hoy con otro método) ni DLL.

## 4. Receptor C.2 — NO PREPARADO

No se escribió ni copió ningún código que reciba contraseñas, y no se modificó `atlas-credentials.js` ni se tocó `executeDurableAtlasRun` (sigue lanzando `DURABLE_REVOCATION_C2_NOT_AUTHORIZED`). El lanzador existente (`c2-windows-offline.ps1`) sigue siendo **solo offline**: no tiene `Read-Host` ni stdin de credenciales.

Especificación para cuando se verifique la referencia (no implementada):
- **Release nueva y sellada** (nuevo manifiesto, nuevo digest externo). No se modifica la actual. Debe incluir: capacidad de datos C.2 exclusiva en `atlas-policy.js`, entrypoint remoto habilitado solo por un manifiesto de uso único, receptor y lanzador nuevos.
- **Orden de arranque:** entorno con lista de permitidos (la actual, más rechazo de `NAPI_RS_*`, `NODE_OPTIONS`, `NODE_PATH`, `NODE_COMPILE_CACHE`, `MONGO*`, `DOTENV*`, `NPM_CONFIG_*`) → verificación de referencia externa (§3) → ACL del árbol → marcador de uso único con `CreateNew` → **solo entonces** el prompt oculto.
- **Contraseña:** entrada oculta, a UTF-8 en memoria, por stdin anónimo al hijo; nunca en argumentos, variables, archivos, logs ni URI completas. Los buffers se ponen a cero al terminar, sin prometer borrado de cadenas administradas.
- **Destino no configurable:** host `<cluster>.<id>.mongodb.net`, usuario `twosides_integration_test`, base `two_sides_integration_test`, `authSource=admin`, `DEFAULT`, TLS estricto; sin parámetro para cambiarlos.
- **Antes de escribir:** comprobar permisos efectivos (`verifyAtlasPermissions`), catálogo completo sin filtro, índices exactos y fence `ingestion-v1` inicial. Cualquier discrepancia detiene sin recrear ni adoptar.
- **Límites conservados:** 3 clientes, 2 sesiones simultáneas, 3 callbacks, 120 s en total, 24 documentos, 16 filas propias a limpiar, fence preservado.
- **Si hay commit incierto:** no limpiar, no reintentar, preservar IDs sanitizados y detener.
- **Después:** rotación de la contraseña de integración bajo su autorización.

## 5. Pruebas offline

Ejecutadas hoy, sin tocar la copia sellada, sin Atlas, sin ACL históricos, sin A36:

```text
node --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run --config vitest.config.js --configLoader native --pool threads tests/sync/durable-revocation-atlas-preflight.test.js tests/sync/durable-revocation-operational.test.js tests/sync/c2-windows-runtime-preparation.test.js
Test Files 2 passed | 1 skipped (3)    Tests 67 passed | 14 skipped (81)
```

Los 14 omitidos son la suite de la copia sellada (hallazgo B). `runs/` sigue con un único run (el consumido de la fase anterior).

| # | Prueba solicitada | Estado |
|---|---|---|
| 1 | Destino incorrecto | **No reejecutada hoy.** Cubierta por la suite de la fase anterior (base, usuario y host distintos rechazados). Además `ATLAS_TARGET` es constante en `atlas-policy.js` |
| 2 | Reutilización | **No reejecutada hoy** (CP05 crea runs). Resultado previo: reuso rechazado sin tocar el resultado guardado |
| 3 | Paquete modificado | Previo: CP04. Hoy: el verificador y la comparación completa detectan cualquier diferencia de archivo/conjunto (copia íntegra: 1890/1890) |
| 4 | Variables peligrosas | **No reejecutada hoy.** Previo: siete variables rechazadas antes de crear un run |
| 5 | Credenciales ausentes | **NO PROBADA: no existe receptor** |
| 6 | Secretos en diagnósticos | Parcial: inspeccionado `result.json` (campos fijos, sin claves/verificadores/tokens/URI). El diagnóstico del receptor no existe aún |
| 7 | Límites de conexiones y sesiones | **Aprobadas hoy** (OL05, OL07–OL11, OL20, OL25–OL27, RC12, RC27) |
| 8 | Supervisor temporal | **Aprobadas hoy** (OL01, OL02, OL15, OL16, OL24, RC26–RC28) |
| 9 | Commit incierto | **Aprobadas hoy** (OL03, OL04, RC16, RC29) |
| 10 | Fence C.2A | **Aprobadas hoy** (RC02, RC07, RC24, RC25, RC30, RC31) |
| 11 | Limpieza exacta | **Aprobadas hoy** (RC18–RC21, RC24) |
| 12 | Cierre ordenado | **Aprobadas hoy** (OL10–OL12, OL16, RC22, RC23) |

Cuatro filas (1, 2, 4 y parte de 3) descansan en resultados de la fase anterior y no se repitieron por el riesgo del hallazgo B. Cinco y seis no son comprobables hasta que exista el receptor. No se suman estas cifras a las de otras fases.

## 6. Protección y límites de esta fase

- No se leyó `backend/.env`; no se tocaron SQLite, Godot, ACL, propietarios, usuarios ni permisos de Atlas; no se accedió a credenciales; no se creó ningún administrador.
- Consultas ACL: solo de lectura y solo sobre el árbol C2Runtime, tal como pidió la sección 1.
- Escrituras en el proyecto: este informe y `backend/scripts/c2-verify-reference.ps1`. Fuera del proyecto: nada en C2Runtime. El ejecutor de Vitest puede actualizar su caché interna.
- La red solo se usó en la fase anterior para el contraste con el registro npm; hoy no hubo red.

## 7. Riesgos residuales y estado de B00

- **B00 continúa pendiente.** `backend/.env` sigue en el árbol del proyecto con las dos ACE heredadas; su exposición no se evaluó. Los dos SID no son de esta máquina, pero siguen sin identificarse.
- La copia no hereda esas ACE, pero el usuario actual conserva `FullControl`: un proceso hostil con esa identidad (o SYSTEM/Administradores) puede alterarla o leer memoria. Los handles sin escritura compartida y los hashes mitigan sustitución de archivos existentes; no certifican directorios, DLL ni TOCTOU.
- Sin referencia externa, el código propio solo tiene continuidad respecto de un estado revisado, no procedencia original.
- Esta preparación **no es una certificación de seguridad de Windows** ni acredita que recibir una contraseña sea seguro.

## 8. Condiciones para activar C.2

1. El usuario conserva el digest del manifiesto (y del verificador) fuera del árbol modificable y lo contrasta con `c2-verify-reference.ps1` → `PASS`. *(pendiente)*
2. Se prepara la release nueva de §4, con su propio manifiesto y digest externo, tras autorización explícita.
3. Se corrigen hallazgos A y B en esa release; las pruebas destructivas usan copia desechable.
4. Pruebas offline completas con credenciales ficticias, incluidas las filas 1–6, contra el receptor real.
5. Aceptación escrita del riesgo residual de §7.
6. Autorización independiente para una única activación, con rotación posterior de la contraseña.

**Resultado: BLOQUEADO** hasta cumplir la condición 1. Detenido: sin receptor, sin contraseñas, sin conexión a Atlas.
