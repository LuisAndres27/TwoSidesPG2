# B21 — Actualización de la línea base real de integridad (HECHA Y VERIFICADA)

Fecha: 2026-11-01. Se generó, verificó y promovió una versión nueva del manifiesto de integridad conservando íntegramente la anterior. **No se modificó código, no se conectó Atlas, no se ejecutó bootstrap, no se activó `main` (0 procesos `node.exe`), no se ejecutó Godot, C.2/F.2 ni C2Runtime, no se tocaron `.env` ni respaldos, contraseñas, clave JWT, SQLite ni ACL existentes, y no hubo commits ni `push` (0 en el índice, 12 commits).** **B00 sigue pendiente.**

## 1. Verificaciones previas (todas correctas)

| Verificación | Resultado |
|---|---|
| B17 y B20 revisados | Sí |
| Usuario / sesión | `luis2`, no elevada |
| ACL de `TwoSidesMainIntegrity` | 0 fallos (DACL protegido; solo `luis2`, `SYSTEM`, `Administradores`; sin DENY) |
| Manifiesto anterior | Existe: 537 776 B, 3 838 archivos, `treeDigest e06e4d2e…ebdb`, sin `formatVersion` (v1). SHA-256 del archivo `5E22C975…07DEE0`, igual al del momento de su creación: **no fue sobrescrito** |
| Escáner de secretos | `clean`, 0 hallazgos |
| Exclusiones | Solo `node_modules/.vite` y `node_modules/.vitest-cache` (constante congelada) |
| Cambios respecto a B17 fuera de esas cachés | 0 añadidos, 0 eliminados, **2 modificados: `scripts/backend-integrity.js` y `scripts/check-main-secrets-acl.ps1`** (los documentados en B20); `src/`, lanzador, guardia y dependencias, idénticos |
| Express `main` | Ningún proceso `node.exe`, ningún puerto 3000/3001 en escucha |

## 2. Candidato

Creado con `node scripts\backend-integrity.js manifest "%LOCALAPPDATA%\TwoSidesMainIntegrity\backend-integrity-manifest.candidate.json"` (creación exclusiva; el nombre no existía). Verificación del candidato: `verify` → `ok`, 3 168 esperados, **0 añadidos / 0 eliminados / 0 modificados / 0 problemas**; estructura revisada sin leer contenidos de archivos:
`formatVersion 2` · `sha256` · `excluded = [node_modules/.vite, node_modules/.vitest-cache]` · lista de 3 168 entradas = `fileCount` · digest recomputado = digest declarado (coherente) · 0 archivos dentro de las cachés · 0 nombres de entorno/claves/bases de datos.

## 3. Inventario final

| Parte | Archivos |
|---|---|
| `src/` | 70 |
| `scripts/` | 47 |
| `node_modules/` (sin las dos cachés) | 3 048 |
| Raíz (`package.json`, `package-lock.json`, `vitest.config.js`) | 3 |
| **Total** | **3 168** (la línea base anterior: 3 838; los 670 retirados eran todos de las dos cachés) |

## 4. Digest definitivo

| Dato | Valor |
|---|---|
| **`treeDigest` de la línea base nueva** | `126a6ceee2713eb3ac5455f3f670295c40d43568b88eb7f093cf0059b6a0e433` |
| Huella pública JWT (`main-2026-11`, RSA 3072) | `811cd75bcf98dcb88c766f369431e3886f75188ad3fec59d8bbbbe0eab9d8aec` |

**El propietario debe conservar ambos valores fuera de este equipo** (papel, gestor de contraseñas, otro dispositivo). Mientras solo existan aquí o junto al manifiesto no son un ancla independiente; este informe vive en el árbol del proyecto y **no** lo es. **No debe reutilizarse el digest anterior (`e06e4d2e…ebdb`) como ancla**: la guardia con ese valor se rechaza (`integrity_anchor_mismatch`, comprobado).

## 5. Promoción

Dos renombrados dentro de la carpeta protegida, sin borrar nada (se comprobó antes el hash del anterior; ambos pasos sin errores):
1. `backend-integrity-manifest.json` → `backend-integrity-manifest.v1-20261101.json`.
2. `backend-integrity-manifest.candidate.json` → `backend-integrity-manifest.json`.

Carpeta resultante: `backend-integrity-manifest.json` (nuevo, v2, 3 168) y `backend-integrity-manifest.v1-20261101.json` (anterior). El archivo oficial es bit a bit el candidato verificado.

## 6. Estado del manifiesto anterior

Conservado como referencia histórica en `backend-integrity-manifest.v1-20261101.json`: SHA-256 `5E22C9752B74321CE337F76C05B1FD02C2B4264276B88F6383F8A3F82507DEE0` (sin cambios), 3 838 archivos, `treeDigest e06e4d2e…ebdb`. No es un ancla vigente: solo sirve de evidencia. Reversión posible renombrando de vuelta (el candidato ya es el oficial).

## 7. Verificaciones finales

| # | Resultado |
|---|---|
| 1 | `verify` del manifiesto oficial contra el disco: **ok**, 3 168 coincidentes, 0 diferencias |
| 2 | `main-preflight.js` (solo comprobación; no arranca Express, no pide contraseña, sin red): **`mainPreflight: ok`** — `key_id`, `anchors`, `key`, `key_fingerprint` y `manifest` correctos con el digest nuevo como ancla. Con el digest anterior como ancla: **falla** (`integrity_anchor_mismatch`) |
| 3 | ACL: carpeta, manifiesto oficial y `v1` con 0 fallos (3 reglas, sin DENY, propietario `luis2`); `check-main-secrets-acl.ps1` sobre la carpeta de integridad: `conforming`, ya **sin** la marca `key_file_too_large`; carpeta de secretos: `conforming` |
| 4–6 | Clave JWT `valid`, `main-2026-11`, 3072 bits, huella **`811cd75b…9d8aec` (igual)**; contenido privado no mostrado |
| 7 | Digest definitivo registrado (§4) |

## 8. Riesgos pendientes

- **Mismo usuario:** el manifiesto, el código y la clave están bajo `luis2`; un proceso malicioso con ese token puede modificar el código y generar otro manifiesto. Solo el digest anotado **fuera** del equipo (que debe pasarse a `-ExpectedTreeDigest`) lo detecta, y la guardia vive en `scripts/` (dentro del hash).
- Ventana entre la comprobación y el arranque; el binario de Node y las DLL del sistema no están cubiertos; sin verificación continua.
- Cualquier cambio posterior en `src/`, `scripts/`, `package*.json`, `vitest.config.js` o dependencias (incluida la edición de los propios scripts de integridad) vuelve a invalidar la línea base hasta repetir este procedimiento. Ejecutar pruebas **ya no** la invalida (cachés de Vitest excluidas).
- Copias antiguas de `.env`, `.env.recuperado.txt`, la copia antigua del proyecto y `PRUEBA.rar` en OneDrive (B19/B20): inertes si la contraseña rotada es la vigente, pero deben eliminarse y vaciarse de la papelera.
- Pendientes de activación de `main`: HTTPS para Godot, SCRAM-SHA-256, rol más estrecho que `readWrite`, cuotas, eventos `Died`/`RequestRestart`.

## 9. Estado de B00

**Abierto.** Cumplido: SID ajenos retirados, carpeta de secretos conforme, clave JWT generada y verificada, escáner de secretos y guardia previa al arranque, rotación y verificación real de la contraseña, corrección del inventario y **línea base nueva verificada, promovida y con digest registrado**. Pendiente: que el propietario conserve el digest y la huella **fuera del equipo**; limpiar las copias antiguas en OneDrive; decidir la línea base en Git (sin `push`/`--mirror`); mitigar (cuenta dedicada o paquete de solo lectura) o aceptar por escrito el riesgo del mismo usuario. `main` sigue sin activarse.

Detenido al finalizar. No se inició Express `main`.
