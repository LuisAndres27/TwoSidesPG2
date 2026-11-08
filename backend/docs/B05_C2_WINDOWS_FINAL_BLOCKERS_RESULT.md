# C.2 Windows — Resultado de los tres bloqueos restantes

Fecha: 2026-10-29. **Conclusión: LISTO CON CONDICIONES para *preparar* la ejecución.** No autoriza activar C.2, recibir una contraseña ni crear un receptor. B00 **no** queda resuelta. Esta fase no se conectó a Atlas, no creó receptores, no solicitó credenciales, no ejecutó C.2/F.2/B05.5, no leyó `backend/.env` ni las SQLite, no modificó ACL/propietarios/Godot y no instaló paquetes.

Parte de `B05_C2_WINDOWS_RUNTIME_READINESS.md` sin repetir sus fases. Una corrección a ese informe: allí se dijo que los dos scripts, `package.json` y el lockfile «no figuran como rastreados»; en realidad **todo `backend/` está sin versionar** (ver §1).

## Resumen

| Bloqueo | Resultado | ¿Bloquea necesariamente C.2? |
|---|---|---|
| 1. Procedencia | **Dependencias: acreditada** con referencia independiente (registro npm). **Código propio (27 fuentes): sin referencia independiente**; falta crear un ancla | No, si se crea el ancla o se acepta por escrito el riesgo residual (decisión, no dependencia técnica) |
| 2. Entorno Windows | Destino y procedimiento especificados; **nada materializado**; Node verificado; B00 sigue abierta | No para *preparar*; sí requiere autorización para crear la copia |
| 3. Argon2 | **No es un error.** Metadatos de un cargador generado upstream; bytes idénticos al paquete firmado del registro | No |

---

## 1. Procedencia verificable del paquete mínimo

**Causa concreta.** No existe ninguna referencia confiable del código propio. Los hashes anteriores solo prueban continuidad entre fases.

**Evidencia (Git).**
- Repositorio: `C:/Users/luis2/OneDrive/Desktop/PRUEBA/TWO SIDES PRUEBA/Two-Sides PRUEBA`, HEAD `5972713`, rama `master`.
- Remoto `origin` = `https://github.com/Nayelhi-Flores/Two-Sides.git`: un repositorio del **juego**, de otra cuenta distinta del usuario Git local (`LuisAndres27`).
- `git ls-files backend` = 0; `git ls-tree -r HEAD`, `origin/master` y `origin/main` = 0 archivos bajo `backend/`; `git log --all -- backend` = 0 commits. `git status` muestra `?? backend/`. Sin stashes ni worktrees adicionales.
- `backend/.gitignore` excluye `.env*`, `node_modules/`, `.npm-cache/`, `.tmp/`.
- Conclusión: **ningún commit, rama ni remoto contiene el backend.** No hay forma de contrastar los 27 archivos con una copia independiente.

**Evidencia (dependencias).** Script propio, solo lectura, que no ejecuta código descargado (fuera del proyecto, en la carpeta temporal de la sesión):
- Para los 23 paquetes del cierre win32/x64 se descargó el tarball de `resolved` (host `registry.npmjs.org` en los 23). **23/23: el SHA-512 del tarball coincide con el `integrity` del lock.**
- **23/23: el `integrity` publicado por el registro coincide con el lock y su firma ECDSA es válida** con las claves públicas del registro.
- Se extrajo cada tarball a un directorio nuevo y se compararon por SHA-256 todos los archivos con los instalados en `backend/node_modules`: **23/23 paquetes, 0 diferencias, 0 faltantes, 0 archivos extra.** Incluye `index.js` y el `.node` de Argon2.
- Hay atestación de procedencia (provenance) del registro en `mongoose`, `mongodb`, `bson`, `jose`, `zod`, `@node-rs/argon2` y su binario win32, entre otros. No la hay en paquetes antiguos o menores (`ms`, `punycode`, `kareem`, `mpath`, `mquery`, `sift`, `tr46`, `whatwg-url`, etc.): es una limitación del ecosistema, no una anomalía.
- Ganchos de ciclo de vida de los 23: solo `prepare` (`bson`, `mongodb`, `whatwg-url`) y `prepublish*` (varios). Ninguno se ejecuta al instalar desde el registro, y se usaría `--ignore-scripts` de todos modos. El único `hasInstallScript` del lock es `fsevents` (macOS, fuera del cierre). Ningún paquete tiene `bin` ni `gypfile`.

**Evidencia (package.json / lock).**
- `backend/package.json` SHA-256 `0C02C900…AB383D` y `package-lock.json` `B3D28E74…01789FD8`: coinciden con el informe anterior (continuidad, no procedencia).
- Las cuatro dependencias directas del runtime (`mongoose 9.11.2`, `jose 6.2.13`, `zod 4.6.7`, `@node-rs/argon2 2.2.2`) coinciden con el lock. Express y Vitest no son necesarios para el arnés.
- **Paquete mínimo candidato** (generado en la carpeta temporal de la sesión; **no está en el proyecto**; es un subconjunto literal del lock actual, sin hashes inventados):
  - `package.json` SHA-256 `9941D0E3755A631AF6BA73CDB8626D272A09393CF0B1E40E194944BD8CA29307`: sin scripts, `type=module`, `private=true`, `engines node >=24 <25`.
  - `package-lock.json` SHA-256 `1A398CFE1DA837116C87FC0E2F5B33D423A3156E0010F0BA53C47CAE8301ABE8`: 35 entradas (21 paquetes comunes, `@node-rs/argon2` y sus 13 binarios por plataforma; los 12 que no son win32-x64 son opcionales y se omiten al instalar, pero el lock debe listarlos para que `npm ci` lo valide).
  - `npm ci --dry-run --ignore-scripts --offline` con configuración npm vacía y caché aislada: **añadiría exactamente 23 paquetes** y terminó sin errores. No instaló nada y no se creó `node_modules`.
  - Quedan **sin verificar** estos dos archivos candidatos como parte de un paquete real: deben regenerarse y revisarse dentro de la fase que cree la copia.

**Evidencia (código del arnés y sus imports).**
- Los 27 archivos fuente del Anexo A del informe anterior se recalcularon: **27/27 coinciden**, incluidos `scripts/durable-revocation-atlas-harness.js` y `scripts/durable-revocation-runtime.js`. Es continuidad respecto de la fase anterior, **no procedencia**.
- Imports del arnés: solo `node:crypto`, `node:perf_hooks`, los módulos `src/**` del Anexo A y `./durable-revocation-runtime.js`; el runtime importa solo `node:perf_hooks`, `node:async_hooks` y `atlas-policy.js`. Sin imports externos adicionales ni lectura de `.env`.
- **Actualización de mi auditoría anterior.** Los dos defectos que señalé en el arnés ya no existen: `runId` es ahora `ATLAS_SCHEMA_RUN` fijo (línea 32) y la limpieza omite el fence (`if(key==='fences')continue;`, línea 307). Esto lo cubren los casos RC02, RC07, RC24 y RC30, que pasaron.

**Archivos involucrados.** `backend/package.json`, `backend/package-lock.json`, `backend/scripts/durable-revocation-*.js`, los 25 archivos `backend/src/**` del Anexo A, `backend/node_modules/**` (23 paquetes).

**Riesgo real.** Las dos ACE `Modify` heredadas (B00) permiten, en teoría, sustituir código fuente. Para las **dependencias** el riesgo queda cubierto: cualquier alteración de `node_modules` o de su origen sería detectada por la comparación con el registro. Para el **código propio** no hay forma independiente de detectar una alteración previa; el ancla solo protege hacia adelante.

**Corrección mínima.** Establecer un ancla del código propio fuera del árbol escribible. En orden de preferencia:
1. Commit de `backend/` (ya ignora `.env`, `node_modules`, `.npm-cache`, `.tmp`) en un repositorio **privado bajo control del propietario del proyecto**, empujado a un remoto donde los SID investigados no tengan escritura. **No usar el remoto actual** (`Nayelhi-Flores/Two-Sides`) sin acuerdo de su dueña/o, ni incluir `backend/.env`.
2. Alternativa: `git bundle` o manifiesto de los 27 hashes guardado fuera del equipo (otro dispositivo o cuenta) en el momento de revisión.
3. Mínimo aceptable, solo como decisión consciente: revisión de contenido de los 27 archivos con hashes registrados inmediatamente antes de copiar y ejecutar, aceptando por escrito que no hay referencia anterior.

**Qué se verificó.** Todo lo anterior: estado de Git, ausencia de referencia, 23/23 paquetes contra registro y firma, consistencia del lock mínimo, 27/27 hashes de continuidad, imports del arnés.

**Qué falta verificar.** Creación y verificación del ancla; revisión humana o asistida de contenido del código exacto que se copie; regeneración/revisión del `package.json` y lock mínimos dentro de la copia; cierre dinámico real del código (qué carga Node en ejecución).

**¿Bloquea C.2?** No como dependencia técnica: es una decisión de procedimiento (opción 1, 2 o 3). Hasta que se tome y se registre, **no debe activarse**.

---

## 2. Entorno de ejecución Windows

**Causa concreta.** La copia aislada solo existe como especificación. Ni existe `C:\Users\luis2\AppData\Local\TwoSides\C2Runtime` (comprobado: `Test-Path` = falso), ni hay receptor/lanzador nuevo.

**Evidencia (verificado ahora, solo lectura).**
- `C:\Program Files\nodejs\node.exe`: v24.19.0, firma Authenticode **Valid**, firmante `CN=OpenJS Foundation`, SHA-256 `3602F2BB1A10F2CBAB4C36886218A33C1AB3DB87290E73B033C46C77147D0237`. Compatible con `engines >=24 <25` y con N-API 10.
- Variables de entorno de esta sesión (solo presencia): `NAPI_RS_NATIVE_LIBRARY_PATH`, `NAPI_RS_ENFORCE_VERSION_CHECK`, `NAPI_RS_FORCE_WASI`, `NAPI_RS_WASI_FLAVOR`, `NODE_OPTIONS`, `NODE_PATH`, `NODE_COMPILE_CACHE` y `NODE_ENV`: **ninguna definida**. Esto describe esta sesión, no el proceso que lance un futuro operador.
- Ancestros y permisos: resultados de `B05_C2_WINDOWS_RUNTIME_READINESS.md` (sin reparse points; sin los dos SID en `TwoSides/Local/AppData`). No se repitieron ni se modificó ninguna ACL.

**Contenido exacto de la copia propuesta (no creada).**

Destino: `C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\code\<release-id>\` (código, solo lectura/ejecución para el runtime) y `...\runs\<execution-id>\` (salidas de un uso). `<release-id>` y `<execution-id>` se fijan al crear.

| Contenido | Origen | Notas |
|---|---|---|
| 2 archivos `scripts/durable-revocation-*.js` + 25 archivos `src/**` (lista y SHA-256 en el Anexo A del informe anterior) | `backend/` | Copia por bytes, archivos nuevos, sin descriptores de seguridad |
| `package.json` y `package-lock.json` mínimos | candidatos de §1, tras revisión | Sin scripts |
| `node_modules/` con los 23 paquetes | `npm ci --ignore-scripts` desde el lock mínimo, con configuración npm vacía y entorno sin tokens | Solo tras autorización; verificar después contra el registro con el mismo método de §1 |
| Entrypoint/receptor y lanzador nuevos | **no existen** | Fase posterior; revisión y pruebas offline propias |

No se copian: `.git`, `.env*`, `Respaldo_ENV`, `.npm-cache`, `.tmp`, pruebas completas, docs, SQLite, canales históricos, Godot ni `.npmrc`.

**Procedimiento de verificación previo a cualquier secreto (especificación).**
1. Comprobar que el destino no existe y que sus ancestros no son reparse points; crear con nombres nuevos, sin sobrescribir.
2. Copiar bytes (sin `robocopy /COPYALL`, `/SEC`, enlaces ni junctions); instalar con `--ignore-scripts`.
3. Inspeccionar DACL/propietario de **cada objeto nuevo**: no deben aparecer los dos SID B00 ni concesiones no justificadas. Si aparecieran, detenerse; no corregir ACL sin autorización.
4. Comparar los 27 hashes con el manifiesto anclado y los 23 paquetes con el registro (método de §1).
5. Proceso lanzado con ruta absoluta de `node.exe` (verificar firma y hash), sin elevación, entorno **con lista de permitidos**: sin `NODE_OPTIONS`, `NODE_PATH`, `NODE_COMPILE_CACHE`, `NAPI_RS_*`; `NODE_ENV` fijado.
6. Directorio de código separado del de salidas; el runtime sin permiso de escritura sobre el código.

**Riesgo real (residual, no resuelto).**
- `luis2` tendría `FullControl` sobre la copia: un proceso hostil con la misma identidad podría modificarla o leer memoria. Estar en LOCALAPPDATA no elimina esto, y sin VM no hay aislamiento entre procesos de la misma cuenta.
- Estar en LOCALAPPDATA **no** acredita seguridad: solo evita heredar las dos ACE del proyecto.
- **B00 sigue sin resolverse.** `backend/.env` permanece en el árbol con esas ACE; esta fase no lo toca ni evalúa su exposición.
- Carga de DLL de `node.exe`, cierre dinámico real y TOCTOU entre verificación e import no están certificados.

**Qué se verificó.** Node (firma, hash, versión), entorno de variables en esta sesión, inexistencia del destino, consistencia dry-run del lock mínimo.

**Qué falta verificar.** Todo lo que requiere objetos reales: DACL de la copia, estabilidad de rutas/FileId, entorno del proceso lanzador, cadena de DLL, entrypoint y lanzador.

**¿Bloquea C.2?** No para *preparar*. Crear la copia necesita autorización explícita; recibir un secreto sigue requiriendo cerrar el entrypoint y aceptar el riesgo residual por escrito.

---

## 3. Discrepancia de versiones del cargador Argon2

**Causa concreta.** `node_modules/@node-rs/argon2/index.js` es un cargador auto-generado por NAPI-RS que contiene la cadena fija `'2.1.0'` en sus comprobaciones de versión del binario, mientras el paquete y el binario instalados declaran `2.2.2`. Es una constante residual de la versión con la que se generó el cargador.

**Evidencia.**
| Elemento | Valor |
|---|---|
| Declarada (`backend/package.json`) | `"@node-rs/argon2": "2.2.2"` |
| Fijada (`package-lock.json`) | `2.2.2`, integrity `sha512-NtdlPPWt…SW+sbfCQ==`; binario `@node-rs/argon2-win32-x64-msvc 2.2.2` integrity `sha512-dQOO9S4Q…tl8CnA`; 12 binarios de otras plataformas `2.2.2` como opcionales |
| Instalada | `package.json` de ambos = `2.2.2` |
| Módulo realmente importado | `node_modules/@node-rs/argon2/index.js` → binario `node_modules/@node-rs/argon2-win32-x64-msvc/argon2.win32-x64-msvc.node` (único `.node` en `require.cache`); **no se cargó WASI** |
| Node | v24.19.0, N-API 10, win32-x64; `engines` de Argon2 `>= 10` |
| Prueba funcional | hash Argon2id v=19 `m=65536,t=3,p=1` con un valor sintético: verificación correcta; verificación con valor distinto, incorrecta |
| Bytes | `index.js` y `.node` **idénticos** al tarball del registro (integrity coincide con lock y firma del registro válida; provenance presente) |

**Funcionamiento de la comprobación.** La condición es `version !== '2.1.0' && process.env.NAPI_RS_ENFORCE_VERSION_CHECK && … !== '0'`. Con la variable sin definir (el caso actual), **nunca se evalúa** y el módulo carga con normalidad. Si alguien definiera `NAPI_RS_ENFORCE_VERSION_CHECK=1`, la carga fallaría (falla cerrada), no se aceptaría un binario distinto.

**Otras rutas de carga a controlar (están en el mismo `index.js`).** `NAPI_RS_NATIVE_LIBRARY_PATH` carga un módulo nativo arbitrario por ruta; `NAPI_RS_FORCE_WASI` / `NAPI_RS_WASI_FLAVOR` seleccionan WASI. Son vectores de sustitución de código si el entorno del proceso no está controlado → la lista de permitidos del §2, paso 5, es obligatoria.

**Archivos involucrados.** `backend/package.json`, `backend/package-lock.json`, `backend/node_modules/@node-rs/argon2/{index.js,package.json}`, `backend/node_modules/@node-rs/argon2-win32-x64-msvc/*`, `backend/src/modules/auth/credential-hasher.js`.

**Riesgo real.** Diferencia de metadatos de origen upstream; **sin incompatibilidad** con Node 24 ni con el binario nativo. No hay evidencia de compromiso. El riesgo operativo es de entorno (variables `NAPI_RS_*`), no de la versión. Por qué el cargador publicado conserva `2.1.0` no es verificable desde aquí; sí lo es que el artefacto es el publicado y firmado.

**Corrección mínima.** Ninguna sobre Argon2: **no actualizar ni reinstalar**. No desactivar ni «arreglar» la comprobación. Mantener las variables `NAPI_RS_*` fuera del entorno del proceso. Verificar los dos archivos de Argon2 contra el registro tras crear la copia.

**Qué se verificó.** Todo lo de la tabla. **Qué falta.** Repetirlo sobre los bytes de la copia real.

**¿Bloquea C.2?** No.

---

## 4. Pruebas offline ejecutadas

Selección explícita (2 archivos, sin comodines): `tests/sync/durable-revocation-atlas-preflight.test.js` y `tests/sync/durable-revocation-operational.test.js`. Antes de ejecutarlas se revisaron sus importaciones y sus archivos de soporte: sin PowerShell, ACL, `private-workspace.ps1`, SQLite, `.env`, receptores ni conexiones reales (`MongoClient.connect` está sustituido por un doble que falla; `isolation-guard.js` y `env-guard.js` bloquean `.env`/`.sqlite3`).

```text
node --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run --config vitest.config.js --configLoader native --pool threads tests/sync/durable-revocation-atlas-preflight.test.js tests/sync/durable-revocation-operational.test.js
Test Files  2 passed (2)    Tests  67 passed (67)
```

Cero fallos. El total no se suma a cifras de otras fases.

| Garantía | Casos |
|---|---|
| Fence conservado e inventario exacto | RC02, RC03, RC07, RC24, RC25, RC30, RC31 |
| Limpieza exacta (solo filas propias, atómica, aborta si cambia algo) | RC18–RC21, RC24 |
| Supervisor temporal y presupuestos | OL01, OL02, OL15, OL24, RC26–RC28 |
| Límites de sesiones y clientes | OL05, OL07–OL11, OL20, OL25–OL27, RC12, RC23 |
| Reintentos (3 callbacks, 3 commits) | OL14, OL15, RC09, RC10, RC15 |
| Commit incierto | OL03, OL04, RC16, RC29 |
| Bloqueo remoto antes de cualquier secreto | RC01, OL19 |

**A36 sigue excluida y no se ejecutó.** Tampoco se ejecutaron `atlas.test.js`, las suites con PowerShell/ACL ni `npm test`. El ejecutor Vitest puede actualizar su caché interna en `backend/node_modules/.vite`. Es la única escritura en el proyecto distinta de este informe.

---

## 5. Conclusión

**LISTO CON CONDICIONES** — solo para *preparar* la ejecución, no para activarla.

Resuelto: dependencias con procedencia independiente (23/23); Argon2 clasificado como diferencia de metadatos inofensiva; arnés con garantías preservadas (67/67); Node firmado y compatible.

Condiciones, en orden:
1. **Ancla del código propio** (§1): elegir y registrar una de las tres opciones. Es una decisión suya, no una dependencia técnica.
2. **Autorización explícita** para crear `C2Runtime` con el contenido de §2 y verificar las DACL de los objetos nuevos; detenerse si aparece alguno de los dos SID.
3. **Entorno con lista de permitidos** para el proceso lanzador (§2.5 y §3).
4. **Entrypoint/receptor y lanzador nuevos**, revisados y probados offline, ejecutados desde la copia.
5. **Aceptación escrita de los riesgos que no se eliminan:** proceso hostil del mismo usuario, DLL de Node no certificadas y **B00 sin resolver**, incluida la exposición de `backend/.env`, que sigue sin evaluarse.

Esta conclusión no declara seguro el entorno ni resuelto B00. Detenido: sin copia creada, sin credenciales, sin Atlas.
