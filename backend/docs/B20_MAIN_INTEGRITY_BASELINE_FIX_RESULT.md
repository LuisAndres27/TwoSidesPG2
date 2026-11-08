# B20 — Corrección de la línea base de integridad (código corregido; manifiesto real SIN reemplazar)

Fecha: 2026-11-01. **No se sobrescribió, movió ni eliminó `%LOCALAPPDATA%\TwoSidesMainIntegrity\backend-integrity-manifest.json` (hash intacto, único archivo de la carpeta). No se creó ningún manifiesto nuevo ni se declara válida una línea base nueva.** No se conectó Atlas, no se ejecutó bootstrap, no se activó `main`, no se ejecutó Godot, C.2/F.2 ni C2Runtime, no se abrió ningún `.env` ni respaldo, no se tocaron contraseñas, JWT, SQLite ni ACL actuales, y no hubo commits ni `push` (0 en el índice, 12 commits). **B00 sigue pendiente.**

Contexto: la inspección real de Atlas (por el propietario) fue correcta (`two_sides_db`, `ready`, 7 colecciones `main_v2` + 7 históricas, `writes: 0`, `closed: true`, contraseña nueva); la huella JWT sigue siendo `811cd75b…9d8aec` (`main-2026-11`).

## 1. Causa del fallo

La línea base B17 (`treeDigest e06e4d2e…ebdb`, 3 838 archivos) incluía dos directorios de caché que **Vitest escribe en `node_modules` cada vez que se ejecutan pruebas**:
- `node_modules/.vite/` (`vitest/<hash>/results.json`, `CACHEDIR.TAG`): resultados de la última ejecución.
- `node_modules/.vitest-cache/` (669 archivos, cabecera `__vi…`): caché de transformación de módulos de Vitest (el propio `vitest/dist` referencia ambas rutas).

Al correr pruebas tras crear la línea base, `results.json` cambió (1 modificado) y se añadió una entrada de `.vitest-cache` (1 añadido), así que `verify` devolvía `tree_differs`. **No hubo cambio de código.** (La instrucción nombraba `.vite`; el síntoma real incluía también `.vitest-cache`, igualmente temporal de Vitest, por lo que se excluyen ambos y solo ellos.)

## 2. Cambios realizados

| Archivo | Cambio |
|---|---|
| `scripts/backend-integrity.js` | Exclusiones **fijas y exactas**: `VITEST_TEMPORARY_PATHS = ['node_modules/.vite', 'node_modules/.vitest-cache']` (congelada). Los manifiestos nuevos llevan `formatVersion: 2` y `excluded`. `verify` acepta un manifiesto con **solo** esas rutas (o menos); rechaza (`manifest_invalid`) cualquier otra exclusión, un campo no válido o archivos listados bajo una ruta excluida. Un manifiesto anterior a B20 (sin `excluded`) se verifica **exactamente como se escribió**, es decir, sin exclusiones |
| `scripts/check-main-secrets-acl.ps1` | El límite de 32 KiB se aplica **solo a material de clave** (todo lo que esté bajo `keys\` y cualquier `.pem`/`.key`). El manifiesto (537 KB) deja de marcarse `key_file_too_large`. El límite de las claves **no se relaja** (32 768 B siguen aceptados, 32 769 rechazados; el cargador `SIGNING_KEY_FILE_LIMIT` sigue en 32 768) |
| `tests/sync/main-integrity-baseline.test.js` (nuevo) | BL01–BL05 |
| `tests/sync/main-integrity-guard.test.js` | PG05 con tiempo límite de 90 s (hashea el árbol real en 6 procesos, ≈ 5 s a solas) |

Código de producción (`src/`), lanzador, guardia (`main-preflight.js`), clave, ACL y manifiesto real: sin cambios en esta etapa (el lanzador y `main-preflight.js` ya usan `verifyManifestFile`).

## 3. Cobertura conservada

La línea base nueva seguirá cubriendo `src/`, `scripts/`, `package.json`, `package-lock.json`, `vitest.config.js` y todo `node_modules/` **salvo** las dos cachés de Vitest. Con el árbol actual: **3 168 archivos** (frente a 3 838; los 670 retirados son todos de las dos cachés).

Comparación del árbol actual con la línea base B17, ignorando solo esas cachés:
- 0 añadidos, 0 eliminados en el resto de archivos.
- **2 modificados: `scripts/backend-integrity.js` y `scripts/check-main-secrets-acl.ps1`** — exactamente las dos ediciones intencionadas de esta etapa.
- Los 3 166 archivos restantes (todo `src/`, el lanzador, la guardia y todas las dependencias reales) son **idénticos** a los de B17.

Digest que produciría hoy el árbol **(provisional y no vinculante; no se escribió ningún manifiesto)**: `126a6ceee2713eb3ac5455f3f670295c40d43568b88eb7f093cf0059b6a0e433`. No debe anotarse como ancla: el digest válido es el que imprima la generación aprobada (§6), calculado sobre el árbol en ese momento.

## 4. Pruebas

| # | Cubre |
|---|---|
| BL01 | Modificar, añadir y borrar archivos en `node_modules/.vite` y `.vitest-cache` (o hacerlos desaparecer) **no invalida** la línea base; esas rutas no figuran en el inventario |
| BL02 | **Siguen detectándose:** cambios en `src`, `scripts`, `package.json`, `package-lock.json`, `vitest.config.js` y archivos de dependencias; archivos añadidos en `src`, `scripts`, `node_modules/evil`, nombres parecidos a las cachés (`.vite-other`, `.vitest-cache-evil`, `.vitest`, `.bin`), `.vite` anidados (`node_modules/dep/.vite`, `src/.vite`, `scripts/.vitest-cache`); archivos eliminados; enlaces fuera de las cachés |
| BL03 | Un manifiesto anterior (sin `excluded`) se verifica como antes (y reproduce el fallo de B17); un manifiesto no puede ampliar exclusiones (`src`, `node_modules`, `scripts`, `node_modules/dep`, vacío, no-lista…), ni listar archivos bajo una exclusión; declarar menos exclusiones es válido y más estricto |
| BL04 | Sobre el árbol real: 0 archivos de las cachés, >3 000 de `node_modules`, `src`, `scripts` y los archivos clave (`runtime.js`, `signing-key.js`, el lanzador, la guardia, `jose`); la guardia (`runPreflight`) tolera el ruido de Vitest y detiene un cambio real |
| BL05 | Comprobador de ACL: manifiesto de 600 KB y archivos grandes no-clave sin marca; claves bajo `keys\` y `.pem/.key` sobre 32 768 B sí marcadas; 32 768 exactos aceptados |

Resultados: **5/5** nuevas; con IG/SC/PG: **20/20**. Regresión completa: **primera ejecución 715 + 9 aprobadas con 2 fallos** — `SU03` (prueba C.2 con colisión de digest, ya conocida como inestable y ajena a esta etapa) y `PG05` (intermitente; pasa a solas en ≈ 5 s y no se reprodujo; probable límite de tiempo de 15 s bajo carga, por lo que se amplió a 90 s; causa no demostrada). **Segunda ejecución completa: 717 + 9 aprobadas, 15 + 1 omitidas, 0 fallos.** Legacy **39/39**. `scan-secrets.js`: **clean** (0 hallazgos).

## 5. Estado del manifiesto real

- Archivo: `%LOCALAPPDATA%\TwoSidesMainIntegrity\backend-integrity-manifest.json` (3 838 archivos, `treeDigest e06e4d2e…ebdb`, sin `excluded`): **intacto** y único en la carpeta. Es la referencia histórica.
- Su verificación **falla hoy** (`tree_differs`: ruido de las cachés + las 2 ediciones de `scripts/`). Mientras no se apruebe una línea base nueva, la guardia del lanzador bloqueará el arranque de `main`. Es el comportamiento deseado: no se ajustó nada para que coincida.

## 6. Procedimiento seguro para aprobar una línea base nueva (NO ejecutado; requiere autorización explícita)

1. **Congelar el código:** no editar `src/` ni `scripts/` durante el procedimiento; sin `main` en ejecución. Las pruebas pueden correr (las cachés están excluidas).
2. **Revisar la diferencia** respecto a B17 (solo lectura): debe limitarse a los cambios aprobados (hoy: `scripts/backend-integrity.js` y `scripts/check-main-secrets-acl.ps1`). Ejecutar regresión y `scan-secrets.js`.
3. **Generar un candidato en un archivo nuevo** (creación exclusiva; nunca sobrescribe):
   `node scripts\backend-integrity.js manifest "%LOCALAPPDATA%\TwoSidesMainIntegrity\backend-integrity-manifest.candidate.json"` → anotar `fileCount` y `treeDigest`.
4. **Verificar el candidato contra los archivos reales:** `node scripts\backend-integrity.js verify "<candidato>"` → exit 0, 0 diferencias; comprobar que `formatVersion` es 2 y `excluded` son solo las dos cachés.
5. **Anotar el digest fuera del equipo** (papel, gestor de contraseñas, otro dispositivo), junto a la huella `811cd75b…9d8aec`. Solo entonces cuenta como ancla. No guardarlo en el árbol del proyecto ni en OneDrive.
6. **Conservar el anterior y promover el candidato** con renombrados (sin borrar nada): `Rename-Item …\backend-integrity-manifest.json backend-integrity-manifest.v1-20261101.json`, luego `Rename-Item …\backend-integrity-manifest.candidate.json backend-integrity-manifest.json`. Los archivos heredan la ACL protegida de la carpeta.
7. **Comprobar:** `Get-SecretsAclFailures` sobre carpeta y archivo (0 fallos); `node scripts\main-preflight.js --manifest … --anchor <nuevo digest> --key-file … --key-id main-2026-11 --expected-key-id main-2026-11 --key-fingerprint 811cd75b…` → `ok`.
8. **Reversión:** si algo falla, renombrar de vuelta el `v1` a su nombre original (el candidato se conserva como evidencia).
9. A partir de ahí cualquier cambio en `src/`, `scripts/`, `package*.json`, `vitest.config.js` o dependencias vuelve a invalidar la línea base hasta repetir el procedimiento.

## 7. Riesgos y limitaciones pendientes

- El manifiesto, el código y la carpeta están bajo la misma cuenta (`luis2`): un proceso malicioso de ese usuario puede regenerar todo; solo el digest anotado **fuera** del equipo lo detecta, y la guardia está en `scripts/` (dentro del hash). Ver B16 §5.
- Excluir las cachés de Vitest es seguro para Express `main` (no las carga), pero un atacante podría colocar contenido allí que **solo Vitest** leería al correr pruebas; no afecta a `main`.
- Hay una ventana entre la comprobación y el arranque, y el binario de Node y DLL del sistema no están cubiertos.
- Hasta aprobar la línea base nueva, `main` no puede arrancar con la guardia (por diseño). `PG05` es intermitente bajo carga (causa no demostrada); `SU03` sigue siendo inestable de forma independiente.

## 8. Estado de B00

**Abierto.** Cumplido: SID ajenos retirados, carpeta de secretos, clave JWT, guardia previa, línea base inicial, rotación y verificación real de la contraseña de `twosides_backend` (inspección `ready`, `writes: 0`) y corrección del problema de las cachés. Pendiente: aprobar y anotar externamente la línea base nueva (§6); retirar las copias antiguas de `.env`/`PRUEBA.rar` en OneDrive y vaciar su papelera; línea base en Git (decisión del propietario, sin `push`/`--mirror`); y mitigar (cuenta dedicada o paquete de solo lectura) o aceptar por escrito el riesgo del mismo usuario. `main` sigue sin activarse.

Detenido antes de reemplazar el manifiesto real.
