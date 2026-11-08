# B15 — Preparación del cierre de B00: credenciales e integridad del backend

Fecha: 2026-11-01. **Preparación terminada. No se abrió `backend/.env`; no se rotó ninguna contraseña; no se movió, borró ni se creó ninguna copia de archivos sensibles; no se hicieron commits ni publicaciones; no se tocó la clave JWT; no se conectó Atlas; no se activó `main`; no se ejecutó bootstrap ni Godot; no se tocó SQLite real; no se cambiaron ACL ni propietarios; no se tocó C2Runtime ni C.2/F.2.** Las únicas escrituras: las herramientas y pruebas nuevas, patrones de `.gitignore` y este informe. **B00 sigue abierto.**

Revisados: B11 (SID retirados), B12 (diseño de secretos), B13 (carpeta creada), B14 (clave generada, `main-2026-11`, huella `811cd75b…9d8aec`).

## 1. Riesgos confirmados (solo metadatos)

| # | Hecho | Riesgo |
|---|---|---|
| R1 | `backend/.env` existe: **278 bytes**, modificado 2026-10-15, copiado a esta máquina 2026-10-24, atributo normal. Vive **dentro de OneDrive** (sincronizado a la nube, con historial de versiones y papelera). Ignorado por Git | Si contiene una credencial de Atlas, esa credencial puede estar en la nube y en versiones anteriores. Ningún código lo lee, así que borrar el archivo no rompe nada; **solo rotar invalida esas copias** |
| R2 | En todo el historial Git (todas las referencias) **ningún nombre de archivo** coincide con `.env`, `.pem`, `.key`, `.pfx`, `secret`, `.sqlite`, `.db`, `.bak` ni autorizaciones temporales | Buena señal (basada en nombres, no en contenido) |
| R3 | `backend/` no está en ninguna rama ni remoto (0 archivos versionados en HEAD, `origin/main` y `origin/master`). Sí está en **2 commits de punto de control locales** del agente (`refs/agents/…`, 243 archivos de `backend/`, 0 nombres `.env/.pem/.key`) y hay 2 referencias `refs/codex/…`. No están en ninguna rama | Sin línea base de integridad fiable; un `git push --mirror` (o `--all` con referencias extra) publicaría código del backend en el repositorio ajeno `Nayelhi-Flores/Two-Sides` |
| R4 | `.gitignore` de la raíz solo ignoraba `.godot/` y `/android/` (no había reglas de secretos). `backend/.gitignore` cubría `.env`, `node_modules` | **Corregido**: ver §7 |
| R5 | `backend/Respaldo_ENV/` existe y está **vacía**; no estaba ignorada | Corregido (ignorada) |
| R6 | Existe `C:\Users\luis2\.git` (repositorio **vacío**: 0 commits, 0 archivos, 0 remotos, creado 29-ago) | Inerte, pero un `git add -A` en el perfil lo convertiría en riesgo; recomendable eliminarlo (decisión del propietario). El escáner ya no se deja engañar por él |
| R7 | Fuera de OneDrive y bajo `%LOCALAPPDATA%` (ACL solo `luis2`/`SYSTEM`/`Administradores`): `TwoSides-Backups` (4 copias de `two_sides_db` **cifradas** `.archive.gz.age`), `TwoSides-Keys` (identidad `age` **cifrada** `identity.txt.age` y resultados JSON), `TwoSides\PrivateBackups`/`ReconstructionTests` (≈30 copias `.sqlite3` de ensayos, de 2026-10-25 a 28), `TwoSidesMainInspection`, `TwoSidesMainSecrets` | Datos de partida y copias de seguridad locales; no están en OneDrive ni en Git. Mismo riesgo del mismo usuario (R8) |
| R8 | **Mismo usuario**: cualquier proceso de `luis2` lee la clave JWT y la memoria del proceso `main`, y puede modificar el código y cualquier manifiesto | Riesgo residual central (§9) |
| R9 | Sin ejecutar nada de lo anterior contra Atlas: la contraseña de `twosides_backend` aún no se ha rotado tras haber vivido (quizá) en `.env`/OneDrive | Pendiente (§3) |

## 2. Cómo `main` solicita y usa la contraseña (sin leer secretos)

`run-main-backend.ps1` pide la contraseña con `Read-Host -AsSecureString` (entrada oculta) → la convierte a bytes UTF-8 → la envía por **stdin** al proceso hijo en una trama con longitud (4 bytes) → limpia los buffers y el entorno del hijo (solo `SystemRoot`, `windir`, `PATH` y variables `MAIN_*`/`PORT`/`NODE_ENV`). En Node, `receiveAtlasCredential` la recibe, se consume **una vez** para abrir la conexión (`mainConnector`, `DEFAULT`, TLS estricto) y `destroyAtlasCredential` la borra. Nunca va en argumentos, entorno, archivos ni logs. Mientras el proceso vive, el driver conserva la autenticación en memoria (un proceso de `luis2` podría volcarla: §9). **`.env` no interviene.**

## 3. Rotación de la contraseña de `twosides_backend` (diseño; NO ejecutada)

Orden (cada paso, tras el anterior):
1. **Antes**: inspección de solo lectura reciente con `ready` (confirma que hoy autentica y el esquema está intacto) — comando existente `run-main-inspection.ps1` con autorización de un solo uso.
2. En Atlas (consola web del propietario) → *Database Access* → `twosides_backend` → *Edit Password* → **autogenerar** una contraseña nueva (debe contener dígitos y símbolos). Copiarla al portapapeles; guardarla en un gestor de contraseñas personal. **No** pegarla en archivos, chat, informes, OneDrive ni `.env`. *Update User*.
3. Vaciar el portapapeles. La contraseña anterior deja de valer al instante (también cualquier copia en `.env` u OneDrive).
4. **Verificación posterior**: repetir la inspección de solo lectura (`run-main-inspection.ps1`, entrada oculta) → debe dar `authentication ok`, SCRAM negociado, `ready`, `writes: 0`.
5. **Recuperación ante errores**:
   - `atlas_authentication_failed` justo tras rotar → se pegó mal o con espacios; repetir con entrada oculta (la autorización de un solo uso está consumida: emitir otra).
   - Si el usuario quedó bloqueado o la contraseña se perdió → volver a *Edit Password* en Atlas (no hay pérdida de datos; los datos no dependen de la contraseña).
   - Si algo falla en `main`, no hay arranque: `main` solo se inicia manualmente con el lanzador.
6. Opcional posterior: habilitar SCRAM-SHA-256 en `twosides_backend` y volver a exigirlo (Etapa 11).
7. Registrar fecha de rotación (no la contraseña) en el informe de cierre.

La rotación afecta solo a `twosides_backend`; **no** a `twosides_integration_test`, ni a los perfiles `integration`/`offline-test`.

## 4. Credenciales anteriores potencialmente válidas (metadatos)

- No hay archivos `*.pem/.key/.pfx/.p12`, `*secret*`, `*credential*`, `*.bak/.old` con nombre de credencial en el árbol (solo `TwoSides.csproj.old`, irrelevante) ni copias `Respaldo*` con contenido.
- En el historial Git, sin nombres de credenciales (R2). Los commits de punto de control del agente no contienen `.env`.
- Archivos de autorización temporal (integración/inspección/bootstrap) están **fuera del repositorio**, en carpetas `AppData\Local\TwoSides*`; no contienen secretos por diseño (JSON sin contraseña, ≤ 60 min, de un solo uso).
- **Candidata única** a credencial vigente: `backend/.env` (R1). Se ignora su contenido; la rotación (§3) es la única medida que elimina la duda.
- No se leyó el contenido de ningún archivo histórico. Un análisis de contenido de las referencias locales (`git grep` sobre `refs/agents/*`) requeriría autorización.

## 5. Retirar `backend/.env` de OneDrive (procedimiento; NO ejecutado)

Precondición: **rotación completada y verificada (§3)**. Después el archivo no tiene valor.
1. Confirmar que ningún perfil lo usa: prueba `SS06` (no hay `dotenv`, `loadEnvFile`, `--env-file` ni lectura de `.env`).
2. El propietario revisa en privado (editor local, sin pegar el contenido en ningún canal) si hay variables no secretas que merezca conservar; esas pasan a parámetros del lanzador o a `main-config.json`.
3. Eliminar el archivo (🔴 requiere autorización):
   `Remove-Item -LiteralPath 'C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\.env'`
   (OneDrive lo enviará a su papelera.) Opcional: crear `backend\.env.example` con solo nombres.
4. En onedrive.com → *Papelera* → eliminar definitivamente el archivo; en *Historial de versiones* no queda nada si el archivo se borró. Con la contraseña rotada, las versiones antiguas son inertes.
5. Vaciar `backend\Respaldo_ENV\` (ya vacía) o eliminar la carpeta.
6. Verificar: `git status --ignored` sin `.env`, `scan-secrets.js` limpio, `Test-Path backend\.env` falso.
Alternativa si se desea conservarlo localmente: moverlo a `%LOCALAPPDATA%\TwoSidesMainSecrets` **solo si** sigue vigente; con la rotación, lo recomendable es no conservarlo.

## 6. Estado de Git del backend y línea base de integridad

Estado: `backend/` → 0 archivos versionados, 343 sin seguimiento (no ignorados), 5 rutas ignoradas (`.env`, `.npm-cache/`, `.tmp/`, `Respaldo_ENV/`, `node_modules/`). El resto del repositorio (juego) tiene 61 archivos versionados y numerosos cambios sin confirmar propios del juego.

Propuesta (dos capas complementarias, ambas **no ejecutadas**):

**A. Commit local de línea base (decisión del propietario; sin publicar).**
1. `node scripts\scan-secrets.js` → debe dar `clean` (hoy: **clean**, 0 hallazgos).
2. `git add backend` y revisar `git status` / `git diff --cached --stat` (sin `.env`, `node_modules`, `*.pem`, autorizaciones; comprobado por `SC03`).
3. `git commit -m "backend: línea base de integridad"` **solo en una rama local** (p. ej. `backend-baseline`), sin `push`. Un commit firmado (`git commit -S`) o una etiqueta anotada añaden un ancla más.
4. Anotar el hash del commit fuera del equipo (papel o gestor), y **no** usar `--mirror`/`--all` al publicar; el remoto es un repositorio ajeno (decidir si el backend se publica o no).

**B. Manifiesto SHA-256 del código ejecutado (herramienta nueva `scripts/backend-integrity.js`).**
- Cubre `src/`, `scripts/`, `package.json`, `package-lock.json`, `vitest.config.js` y `node_modules/` (≈ 3 900 archivos); excluye pruebas, documentos, `.env`, `.git` y datos. Detecta modificados, añadidos, eliminados y enlaces; salida acotada a 20 nombres, nunca contenido.
- `manifest <ruta>` escribe con creación exclusiva (no sobrescribe) y exige ruta absoluta **fuera** del proyecto y OneDrive; `verify <ruta>` sale con 0 solo si todo coincide.
- Ubicación propuesta (a crear con ACL protegida como en B13): `%LOCALAPPDATA%\TwoSidesMainIntegrity\backend-integrity-manifest.json`.
- Anotar el `treeDigest` impreso fuera del equipo: es la huella de toda la base.
- Esta herramienta es un **detector**, no una prueba: quien pueda escribir el código puede reescribir también el manifiesto; el ancla externa (digest anotado o commit firmado) es lo que la hace útil.

## 7. Exclusiones de Git (aplicadas y probadas)

`/.gitignore` y `backend/.gitignore` ahora ignoran: `.env`, `.env.*` (salvo `.env.example`), `*.pem`, `*.key`, `*.pfx`, `*.p12`, `*.sqlite`, `*.sqlite3`, `*.sqlite-wal`, `*.sqlite-shm`, `*.db`, `*authorization*.json`, `*-integrity-manifest*.json`, `Respaldo*/`, `secrets/`, `TwoSidesMainSecrets/`, `*.secret`, `*.bak`, y (backend) `node_modules/`, `.tmp/`, `.npm-cache/`. Prueba `SC03`: 22 rutas sensibles ignoradas, 6 rutas legítimas **no** ignoradas, 0 archivos versionados afectados por las reglas nuevas.

Contraseñas y tokens (que no tienen un nombre de archivo propio) los cubre el escáner de contenido `scripts/scan-secrets.js`: bloques de clave privada, URI con contraseña, tokens con forma de JWT, asignaciones `password/secret/token`, nombres de archivo secretos y cabecera SQLite; escanea **solo lo que Git rastrearía** (`--exclude-standard`), de modo que `.env` ni se lista ni se abre; imprime `ruta:línea:tipo`, nunca el texto; exige que el directorio sea la raíz del repositorio. Recomendado además como `pre-commit` (hoy no hay hooks instalados; instalarlo requiere autorización): `node backend/scripts/scan-secrets.js || exit 1`.

Limitaciones del escáner: contraseñas formadas solo por letras y separadores (sin dígitos) se tratan como valores de prueba; no lee archivos > 1 MiB ni binarios.

## 8. Controles de integridad antes de cada arranque de `main` (propuesta)

Secuencia de comprobaciones, cada una de solo lectura, todas deben pasar para lanzar (cualquier fallo → no arrancar, sin reparar):
1. `node scripts\backend-integrity.js verify "<manifiesto>"` → exit 0.
2. `.\scripts\check-main-secrets-acl.ps1` → `conforming` (carpeta, `keys` y `main-jwt.pem`).
3. `node scripts\main-signing-key.js check "<clave>" main-2026-11` → huella igual a la anotada (`811cd75b…9d8aec`).
4. ACL del árbol del proyecto: raíz y `backend` solo con `luis2`/`SYSTEM`/`Administradores` con permisos de escritura (reutiliza el criterio de B07; script propuesto, no escrito).
5. `git status --porcelain backend` vacío y `git rev-parse HEAD` igual al hash anotado (si se adopta la capa A).
6. `node.exe` en la ruta fija de `Program Files` (el lanzador ya lo usa) y `package-lock.json` incluido en el manifiesto.
Integración sugerida (requiere autorización, no hecha): un parámetro obligatorio `-IntegrityManifest` en `run-main-backend.ps1` que ejecute 1–3 antes de pedir la contraseña, de modo que **no se teclee la contraseña si el entorno no es el esperado**.

## 9. Riesgo residual: procesos de `luis2` que modifican archivos y leen la clave

| Capacidad de un proceso con el token de `luis2` | Efecto |
|---|---|
| Leer `main-jwt.pem` | Forjar JWT RS256 válidos (emisor/audiencia/`kid` correctos) hasta que se rote la clave. Además, el servidor exige que la sesión (`jti`) exista y esté activa en `main_v2_identitySessions`: **un token forjado sin sesión registrada es rechazado**, lo que limita el daño a cuentas con sesión viva |
| Leer memoria del proceso `main` | Obtener la contraseña de Atlas en uso y la clave en memoria |
| Modificar código, `node_modules`, scripts y manifiesto | Ejecutar código arbitrario con la contraseña que se teclee en el siguiente arranque; neutralizar los controles de §8 (si no hay ancla externa) |
| Leer/modificar la ACL de las carpetas protegidas | `luis2` es propietario: puede darse a sí mismo o a otros acceso |
| Alcance de red | `main` escucha solo en `127.0.0.1`; el atacante necesita ejecución local, que ya lo sitúa dentro de la cuenta |

Probabilidad: baja–media para una máquina personal (malware, paquete npm comprometido, extensión de editor); impacto: alto (clave de firma, contraseña con `readWrite` en `two_sides_db`, que incluye colecciones históricas).

Opciones de mitigación, de mayor a menor eficacia:
1. **Cuenta de Windows dedicada de bajo privilegio** (p. ej. `twosides-svc`) que ejecute `main`: la clave y la carpeta de secretos pertenecen a esa cuenta (no a `luis2`); el código en un directorio de **solo lectura** para ella; `luis2` no puede leer la clave sin elevarse. Es el único cambio que separa realmente identidades en el mismo equipo.
2. **Ejecución en entorno aislado** (VM/Windows Sandbox con paquete firmado) — ver B00_VM_FEASIBILITY_REPORT (no resuelve el mismo usuario del anfitrión por sí sola).
3. **Compensaciones**: rotación periódica de la clave (`main-2026-11` → nueva) y de la contraseña, rol de base de datos más estrecho que `readWrite`, `node_modules` fijados con `package-lock.json` y verificación de §8, sin extensiones de editor no confiables, tokens de 15 min y revocación de sesiones.
4. **Aceptación formal** del riesgo residual (sección 10, opción B).

## 10. Criterios para declarar B00 resuelto (o aceptar formalmente el residual)

**Resuelto** exige, con evidencia escrita:
1. ✔ SID ajenos retirados del árbol (B11).
2. ✔ Carpeta de secretos conforme (B13) y clave generada y verificada (B14).
3. ☐ Contraseña de `twosides_backend` rotada y verificada (§3).
4. ☐ `backend/.env` eliminado de OneDrive, papelera vaciada, `Respaldo_ENV` vacía (§5).
5. ☐ `backend/` versionado en commit local (capa A) y/o manifiesto creado con digest anotado fuera del equipo (capa B).
6. ☐ `scan-secrets.js` limpio y, si se desea, hook `pre-commit` instalado.
7. ☐ Comprobaciones de §8 integradas o ejecutadas manualmente antes del primer arranque.
8. ☐ Una de: **A)** ejecución bajo cuenta dedicada con la clave y la carpeta bajo esa cuenta (§9.1), o **B)** documento firmado por el propietario que acepte el riesgo residual del mismo usuario con las compensaciones de §9.3.
9. ☐ Regresión completa y pruebas de §11 en verde tras los cambios.

Hasta marcar 3–9, **B00 permanece abierto**; este informe no lo declara resuelto.

## 11. Verificaciones y pruebas

Nuevas (offline, sin Atlas, sin datos de jugadores, `.env` nunca abierto; secretos ficticios construidos en tiempo de ejecución en directorios temporales):

| # | Cubre |
|---|---|
| IG01 | El manifiesto cubre exactamente el código ejecutado, detecta modificaciones/altas/bajas, ignora `.env`/pruebas/docs, no sobrescribe, salida acotada sin contenido |
| IG02 | Ubicación del manifiesto fuera del proyecto/OneDrive, sin nombres de entorno, enlaces rechazados, manifiestos ilegibles o ajenos fallan cerrados |
| IG03 | Ciclo `manifest` → `verify` con la línea de comandos sobre el árbol real del backend (manifiesto temporal), sin sobrescritura, argumentos inválidos |
| SC01 | El escáner detecta bloques de clave, URI con contraseña, tokens JWT y credenciales generadas; ignora centinelas legibles; los hallazgos no contienen el texto |
| SC02 | Solo escanea lo rastreable por Git: `.env` ignorado nunca se lista ni abre; detecta bases SQLite por cabecera; falla cerrado fuera de la raíz de un repositorio |
| SC03 | `.gitignore` real ignora 22 clases sensibles, no ignora 6 rutas legítimas ni afecta a archivos versionados |
| SC04 | Las herramientas no tocan red, entorno ni `.env`; única escritura: el manifiesto con `'wx'` |

Resultado: **7/7**; `scan-secrets.js` sobre el repositorio real: **clean (0 hallazgos)**; regresión completa y legacy: ver §12.

## 12. Cambios en el proyecto

Nuevos: `scripts/backend-integrity.js`, `scripts/scan-secrets.js`, `tests/sync/main-integrity-and-secrets.test.js`. Modificados (solo reglas de ignorado): `/.gitignore` y `backend/.gitignore`. Sin cambios en código de producción.

## 13. Acciones pendientes de autorización

| Acción | Autorización |
|---|---|
| Rotar la contraseña en Atlas y verificar con inspección de solo lectura | Sí (propietario) |
| Eliminar `backend/.env`, vaciar papelera de OneDrive | Sí |
| `git add`/`commit` local del backend (capa A) | Sí |
| Crear carpeta `TwoSidesMainIntegrity` y el manifiesto real; anotar digest | Sí |
| Instalar hook `pre-commit`; eliminar `C:\Users\luis2\.git` | Sí |
| Integrar §8 en `run-main-backend.ps1` | Sí (cambio de código del lanzador) |
| Crear cuenta de Windows dedicada o documento de aceptación del riesgo | Sí |
| Análisis de contenido de referencias locales/históricas | Sí |
| Ejecutar `scan-secrets.js`, `backend-integrity.js verify`, pruebas | No (solo lectura) |

Detenido sin ejecutar ninguna operación real sobre credenciales o MongoDB Atlas.
