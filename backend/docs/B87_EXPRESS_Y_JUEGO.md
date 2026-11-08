# B87 — Express local contra Atlas y ejecutable de prueba de estadísticas

Estado: **preparado y probado solo en local.** No se contactó con Atlas ni con AWS, no se abrió el ejecutable, no se leyó `.env`, credenciales ni PlayerData.

## 1. Cómo encaja

```
Juego (cuenta de Windows DEDICADA) ──HTTP 127.0.0.1:PUERTO──► Express local (tu cuenta) ──TLS──► Atlas (usuario ingest)
        │  escribe installation.json (id, no secreto)                  │  escribe kit.json (URL + token, 1 h, se renueva)
        └──────────────── carpeta del kit: C:\TwoSidesStatsKit\hand-over ◄┘
```

* El contrato (`statistics-only-v1`), `offline-app.js` y el almacén no cambian. Solo se añade el relevo de **una** credencial técnica por carpeta.
* El Express escucha **solo en 127.0.0.1**, usa la identidad `twosides_statistics_ingest_v1` (permisos de escritura de ingesta, nada más) y enlaza **la primera** instalación que ve; cualquier otro id se ignora y sus eventos reciben 403.
* El token (43 caracteres) se genera al arrancar, vive en memoria y en `kit.json`, dura 1 h, se renueva cada 20 min y `kit.json` se borra al parar.

## 2. Archivos nuevos

| Archivo | Para qué |
|---|---|
| `backend/tools/b87/express-atlas-lib.mjs` | Servidor + relevo por carpeta (sin Atlas, sin secretos). |
| `backend/tools/b87/express-atlas.mjs` | Línea de órdenes: acción `atlas-test` con ingest, credenciales por stdin, aborta si está cargada la guarda B80. |
| `backend/tools/b87/Run-Atlas-Express.ps1` | Lanzador **del propietario**: frase y contraseña con prompt oculto, variables `STATISTICS_*` solo en ese proceso. |
| `backend/tests/b87/b87-express.test.js` | 11 pruebas offline. |
| `backend/tests/b87/kit-e2e-server.js` | Servidor desechable para la comprobación C#. |
| `local-persistence/sync-http/StatisticsKit.cs.txt` | Puerta de activación, archivos del kit y proveedor de credenciales (lógica pura, comprobable sin Godot). |
| `local-persistence/statistics-kit-tests/` + `local-persistence/run-statistics-kit-checks.ps1` | 37 comprobaciones C# (incluye la cadena real SQLite → transporte → Express). |
| `scripts/stats/StatsDemoBootstrap.cs` | Nodo de Godot, fino: aprende el id, lo anuncia y llama al único punto de activación existente. |

**Archivos EXISTENTES modificados (para tu revisión del manifiesto v5):**

1. `local-persistence/src/StatisticsTelemetry.cs.txt` — **un método** añadido: `GetInstallationId()` (lectura, no cambia nada).

No se tocó `project.godot`, `GameSyncHost.cs`, `GamePersistenceAdapter.cs`, `export_presets.cfg`, `TwoSides.csproj` ni `Directory.Build.props` (sus hashes y los de todos los `packages.lock.json` coinciden con los de antes de compilar; el exportador reescribió dos lockfiles y se restauraron byte a byte, igual que en B78). También se modificaron, solo en pruebas/documentos/lanzadores de B87: `tests/b87/vitest.config.js`, `b87-real.config.js`, `b87-docs.test.js`, `docs/B87_GUIA_AWS_METABASE.md`.

## 3. Tres puertas para que el transporte siga apagado

1. **`override.cfg`** junto al ejecutable es lo único que registra el nodo. Sin él (builds B75/B78 y cualquier otro) el nodo no existe. Comprobado en un proyecto mínimo exportado: sin `override.cfg` no hay nodo; con él se crea **después** de los autoloads existentes y ve los argumentos de usuario.
2. **Argumentos y cuenta**: `--stats-demo`, `--stats-expected-user=<cuenta>` igual a la cuenta de Windows que ejecuta (sin distinguir mayúsculas) y `--stats-kit-dir=<ruta absoluta>`. Nunca se activa en `luis2`, `TwoSidesTest` ni `TwoSidesStatsTest` (cuentas con PlayerData real), aunque los argumentos lo pidan.
3. **Kit vigente**: solo se llama a `ConfigureStatisticsForAuthorizedRun` cuando existe un `kit.json` con URL `http://127.0.0.1:<puerto>`, token válido, no caducado y para **esta** instalación. El transporte (`syntheticLoopback`) solo admite loopback.

Además `Start-StatsDemoGame.ps1` (junto al `.exe`) se niega a lanzar si la cuenta no es la esperada, si es una de las prohibidas o si `LocalApplicationData` no está en el perfil de esa cuenta.

## 4. Ejecutable de prueba

Carpeta nueva: `C:\TwoSidesBuild\TwoSides-win64-B87-StatsDemo\` (no sustituye `TwoSides-win64-B75` ni `-B78`). Contiene `TwoSides.exe`, `TwoSides.pck`, `data_TwoSides_windows_x86_64\`, `override.cfg`, `Start-StatsDemoGame.ps1`, `LEEME-B87.txt` y `SHA256SUMS.txt`. Compilado con Godot 4.6.1 mono, preset *Windows Desktop*, `ExportRelease`, comando como en B78. **El ejecutable no se abrió.**

## 5. Menú y API principal

Por lectura de código (no se ejecutó el juego): la escena principal es `menu_principal.tscn`; `MenuPrincipal` solo usa `GameApplicationContext.Local` (SQLite). `InitializeRemoteServices()` no se llama nunca, así que `Services` es nulo; el flujo de animales y de finales usa el contexto local y no recurre al remoto. **El menú no exige la API principal.** Falta confirmarlo ejecutándolo.

## 6. Pasos del propietario (cuando autorices)

1. Crear una cuenta estándar nueva de Windows, p. ej. `TwoSidesDemo` (no existe; no puedo crearla).
2. Copiar o dejar accesible `C:\TwoSidesBuild\TwoSides-win64-B87-StatsDemo\` para esa cuenta (sin cambiar permisos si no hace falta) y comprobar `SHA256SUMS.txt`.
3. Desde tu cuenta: `.\backend\tools\b87\Run-Atlas-Express.ps1 -AtlasHost <cluster>.<id>.mongodb.net` (te pide la frase y la contraseña de ingest).
4. Desde la cuenta dedicada: `.\Start-StatsDemoGame.ps1 -ExpectedUser TwoSidesDemo`. Crear perfil y jugar. Los envíos salen cada ~2 s en lotes de hasta 5; si el Express no estaba listo, el juego espera y activa el envío cuando aparece `kit.json`.
5. Parar el Express con Ctrl+C (borra `kit.json`).

## 7. Lo que NO está verificado

* El ejecutable no se ha ejecutado: el nodo de Godot, la activación real en `GameSyncHost` y el menú sin API solo están comprobados por compilación, lectura de código y la prueba del mecanismo `override.cfg` en un proyecto mínimo.
* Contra Atlas: la ruta con el repositorio MongoDB y la identidad ingest (la misma de `seed`, que ya funcionó) no se probó en esta fase; las pruebas usan el almacén sintético.
* Los permisos de `C:\TwoSidesStatsKit\` dependen de los heredados de `C:\`; no se cambió ningún permiso. Cualquier cuenta con acceso de lectura a esa carpeta podría leer el token mientras el Express esté activo (solo sirve para esa instalación, contra 127.0.0.1, 1 h).
* Nada impide técnicamente ejecutar el `.exe` desde `luis2`; solo procedimiento y el lanzador.

## 8. Datos reales: qué acciones de `atlas-session` NO sirven para validarlos

`seed` y `read` (y el campo `aggregatesMatchOracle`) comparan con el oráculo del conjunto **sintético** (`expectedTotals` de `generator.js`). Con datos reales siempre darán «no coincide»; no usarlas para validar. `publish` solo copia `_id` y `values` (no compara). `seed` además enviaría eventos sintéticos: no ejecutarlo sobre bases con datos reales. Para validar datos reales: comparar el panel de Metabase con el recuento de documentos de `stats_v1_counters`, o con lo que muestra el propio juego en su pantalla de estadísticas locales.

## 9. Metabase local para los datos reales (`Start-B87-LocalMetabase.ps1`)

Contenedor `twosides-b87-owner-metabase` (v0.65.3.4 por digest, endurecido, solo `127.0.0.1:4387`, sin Caddy). Claves en `%LOCALAPPDATA%\TwoSidesB87\metabase.env` (generadas, nunca impresas). Diferencia con la guía de AWS: sin `MB_REDIRECT_ALL_REQUESTS_TO_HTTPS` (no hay HTTPS en local) y `MB_SITE_URL=http://127.0.0.1:4387`.

> Evidencia con datos reales del propietario (informada por él): ver `B87_EVIDENCIA_DATOS_PROPIETARIO.md`.

## 10. Publicador automático local (`auto-publish.mjs`, `Run-Atlas-AutoPublish.ps1`, `Start-StatsDemo-Local.ps1`)

Proceso aparte de Express, identidad `publisher`, frase y contraseña **una vez** por prompt oculto (stdin; solo en memoria). Cada `-IntervalMinutes` (por defecto 2, mínimo 1) lee con el `find` propio del publisher un resumen (SHA-256) de `stats_v1_counters` de ingesta y, **solo si cambió** desde la última publicación correcta, ejecuta la acción `publish` existente (`tools/b86/session.js`, sin modificar). Un ciclo a la vez; fallos: línea saneada + espera con retroceso exponencial (15 s … 10 min) sin cerrarse; Ctrl+C espera al ciclo en curso. Salida: hora, documentos y estado.

**Atomicidad de `publish` (por código, no probado contra Atlas):** una sola transacción con lectura `snapshot` y escritura `majority`+journal: `deleteMany` + `insertMany` + `commitTransaction`, con `abortTransaction` si falla. Metabase no ve la colección vacía ni a medias. Matiz: la lectura de la fuente es previa a la transacción (un `find` de pocos documentos, un único lote), así que dos contadores podrían reflejar instantes ligeramente distintos si la ingesta escribe a la vez; el siguiente ciclo lo corrige.
