# B84 — Estadísticas funcionales de extremo a extremo y dashboard administrativo MVP

**Estado:** MVP local de demostración. **No es una versión de producción.** Atlas sigue desconectado; B00 y v5 siguen pendientes.

## 1. Resumen
Se construyó y probó la cadena completa: **evento sintético → Express (`POST /api/v1/statistics/events`) → MongoDB 8 local en transacciones → contadores agregados → API administrativa protegida → dashboard web**. Las cifras del dashboard coinciden aritméticamente con un conteo independiente de los eventos aceptados (prueba automática y prueba en navegador real). No se tocó Godot, ni el guardado local, ni B75/B78, ni los módulos B79–B83 (solo archivos nuevos; el verificador v5 informa 0 archivos modificados).

## 2. Componentes implementados (todos nuevos)
| Archivo | Función |
|---|---|
| `src/modules/statistics/admin-statistics.js` | Vistas agregadas (overview, biomas, decisiones, finales, serie diaria, estado) y router protegido. Solo recibe `aggregates()`. |
| `src/modules/statistics/demo-app.js` | Composición de la demo: ingesta B79/B81 sin cambios + login admin + rutas admin + panel estático. |
| `tools/b84/generator.js` | Generador determinista de datos sintéticos y oráculo de conteo independiente. |
| `tools/b84/seed.js` | Siembra por el endpoint real de ingesta (reintentos y duplicados controlados). |
| `tools/b84/demo-store.js` | Apertura verificada de la base B84 en el contenedor del propietario. |
| `tools/b84/demo-server.mjs`, `Start-B84-Demo.ps1` | Arranque local (solo 127.0.0.1). |
| `dashboard/` | Frontend (HTML, CSS, módulos JS sin dependencias ni build). |
| `tests/b84/*` | 34 pruebas offline + 3 reales con MongoDB. |

## 3. Arquitectura funcional
```
Generador sintético ─HTTP─▶ POST /api/v1/statistics/events ─▶ validación statistics-only-v1 + token técnico
        ─▶ TransactionalStatisticsRepository ─▶ transacción MongoDB (snapshot/majority/j:true) ─▶ contadores + recibos
Navegador ─▶ POST /api/v1/admin/session (JWT RS256 admin) ─▶ GET /api/v1/admin/statistics/* ─▶ repository.aggregates()
```
El navegador nunca habla con MongoDB; la conexión vive solo en el backend.

## 4. Backend
- Reutiliza sin cambios: contrato `statistics-only-v1`, adaptador MongoDB B81/B81.1, política híbrida B82 (`b82-run-hybrid-v1`, **experimental**), `JwtService` (Auth v1: RS256, 15 min, Argon2id), `authenticate`/`authorize('admin')`, `RateLimiter`, cabeceras de seguridad.
- La API no acepta partidas completas (Zod estricto: rechazo 400; campos extra, p. ej. un nombre, se rechazan por evento como `invalid_event`).
- Rechazos, recibos (`accepted/duplicate/rejected/retryable`), idempotencia por `EventId`, deduplicación semántica (política híbrida), reintentos y respuesta perdida se heredan de B80–B82 y se re-verificaron por HTTP (ver §12).

## 5. Endpoints
| Método y ruta | Acceso | Contenido |
|---|---|---|
| `GET /api/v1/admin/mode` | público | Solo el rótulo de modo demostración. |
| `POST /api/v1/admin/session` | público, limitado | `{schemaVersion:1,technicalAccountId,credential}` → token Bearer 15 min. Un jugador recibe 403 y su sesión se revoca. |
| `POST /api/v1/admin/logout` | admin | Revoca la sesión en el servidor. |
| `GET /api/v1/admin/statistics/overview` | admin | Instalaciones, partidas iniciadas/completadas, tasa de finalización, tiempo efectivo, sesiones (cerradas/interrumpidas), promedios (tiempo por partida iniciada, por instalación, partidas y sesiones por instalación). |
| `…/biomes` | admin | Por bioma: visitas, finalizaciones, tiempo efectivo, aprobar/rechazar, saludable/degradado. |
| `…/decisions` | admin | Totales y por bioma. |
| `…/endings` | admin | good/medium/bad, total y proporciones. |
| `…/timeseries?days=N` | admin | N∈[1,90] (def. 30), días UTC con ceros; única opción permitida. |
| `…/status` | admin | Consulta correcta, almacenamiento, retención experimental. |
| `POST /api/v1/statistics/events` | token técnico de ingesta | Sin cambios (B79). |

Toda respuesta administrativa incluye `mode:{demo:true,dataset:'b84-synthetic-v1',label:…}`. Ninguna devuelve documentos, `_id`, EventId, instalaciones, partidas, hashes ni claves (probado por expresión regular sobre las respuestas).

## 6. Autenticación
Auth v1 (JWT RS256) reutilizado. La cuenta admin es **ficticia, en memoria**: el servidor genera ID y credencial aleatorios en cada arranque y los escribe en `%LOCALAPPDATA%\TwoSidesB84Demo\demo-admin.json` (nunca se imprimen ni se guardan en el repositorio). Las llaves RS256 también son efímeras. Limitación de intentos (5 fallos / 15 min por IP+cuenta; 30 sesiones / 5 min). Expiración de 15 min: el frontend vuelve al login con mensaje. Sin contraseñas incrustadas en JS.

## 7. Frontend
HTML + CSS + JS (módulos ES) servidos por Express en `/dashboard/`. **No se usó React/Vite**: no hay frontend previo, no se instalaron paquetes, no hay paso de build y la superficie de dependencias es cero; el costo es no tener componentes de framework. Todo texto del API se inserta como nodo de texto (sin `innerHTML`); CSP estricta `script-src 'self'; style-src 'self'` sin `unsafe-*`. Adaptable a escritorio y a 400 px (sin desbordamiento horizontal, verificado en navegador). Secciones: A Resumen, B Biomas, C Decisiones, D Finales, E Tendencias, F Estado del sistema; menú, botón **Actualizar**, **Cerrar sesión**, indicadores de carga, estados vacíos y errores comprensibles. Banner permanente «MODO DEMOSTRACIÓN».

## 8. Gráficas
SVG propio: barras agrupadas (biomas, decisiones, estados), dona (finales), líneas (tendencias). Paleta categórica validada con el validador de dataviz (teal `#0b8a7a`, naranja `#c25a14`, violeta `#5e4aa8`: pasa banda de luminosidad, croma y separación CVD/visión normal). Leyenda siempre presente con ≥2 series, etiquetas de valor directas, tooltips nativos y **tabla de datos** alternativa. Solo tema claro (sin modo oscuro). El contraste del naranja sobre la superficie queda cercano a 3:1 y se compensa con etiquetas visibles y tabla.

## 9–10. Datos sintéticos y generador
`tools/b84/generator.js`: 30 instalaciones, 14 días (21 oct–3 nov 2026), semilla pública fija. Produce 2 293 eventos coherentes: 81 partidas iniciadas, 52 completadas, 29 incompletas, los cinco biomas en orden, decisiones approve/reject con estado healthy/degraded consistente, finales good/medium/bad según biomas buenos, intervalos de juego ≤60 s, sesiones cerradas e interrumpidas. Los EventId se derivan por hash de etiquetas públicas: **ejecutarlo dos veces no duplica nada** (los duplicados se detectan por EventId). La siembra controla reintentos (cada 23.º lote se reenvía) y reproduce los primeros 40 lotes: 2 293 aceptados, 293 duplicados, 0 rechazados. No lee SQLite, PlayerData ni los 71 eventos reales; no edita contadores. Los datos se identifican como demostración en el banner, en cada API y en el panel de estado.

## 11. MongoDB local
Contenedor `twosides-b811-mongo` (`mongo:8.0`, `127.0.0.1:27028`, `rsB811`), verificado antes de cualquier escritura (contexto Docker local, nombre, imagen, comando, puertos, volúmenes, no privilegiado, servidor mongod 8.0.x primario). Base de demostración: `twosides_statistics_b81_b84d43ac0162337c4d9dbfd530823e54` (prefijo `b84d`, **se conserva**). Las bases de prueba usan `b84e…` y se eliminan solas. Estado final: `admin, config, local` + la base de demostración; no se escribió en admin/config/local; el contenedor no se reinició ni se recreó. Clave HMAC pública y sintética (`PUBLIC B84 SYNTHETIC DEMO KEY`), sin relación con producción. No se leyó `MONGODB_URI` ni `.env`.

## 12. Resultados de pruebas
| Suite | Resultado |
|---|---|
| B84 offline backend (`tests/b84/b84-backend.test.js`) | 18/18 |
| B84 offline frontend (`b84-frontend.test.js`) | 16/16 |
| B84 reales con MongoDB 8 (`b84-real.integration.js`) | 3/3 |
| Navegador real (Edge headless, guion de verificación) | 20/21 — el fallo restante es un 401 intencional de «credencial incorrecta» registrado por el navegador; el 404 del favicon se corrigió después |
| Estadísticas B79–B83 (`tests/statistics`) | 222/222 |
| Suite principal `vitest.config.js` | 907 aprobadas, 4 fallan: 3 exigen `C2_FINAL_TEST_ROOT` (raíz desechable, ajena a B84) y `LP06` (inventario del baseline v5, falla en cuanto se añade cualquier archivo; ya difería antes: 12 añadidos en B81.1, 15 ahora) |
| Verificador v5 | `tree_differs` esperado: 15 añadidos, **0 modificados**, 0 problemas |
| Godot/.NET | `dotnet build` Debug y ExportRelease: 0 errores, 0 advertencias (`--no-restore`; `packages.lock.json` sin cambios). No se ejecutó ni exportó el juego |

Qué demuestran las pruebas B84: login/logout/expiración; 401 sin token y 403 por rol (el guard rechaza un principal `player`; el login rechaza credenciales de jugador); ingesta válida e inválida (hash, campo personal, snapshot completo, contrato distinto, lote de 6, instalación ajena → 403); duplicados y repetición de todo el generador sin cambio; error temporal (reintentable → un solo conteo); respuesta perdida; error de almacenamiento → 503 sin detalles; consultas con parámetros prohibidos → 400; concurrencia (HTTP, 4 copias simultáneas de cada lote) sin pérdida ni doble conteo; cifras del API == conteo independiente (overview, biomas, finales, decisiones, serie diaria).

## 13. Iniciar el backend
Con el contenedor en ejecución, desde `backend/`:
```powershell
.\tools\b84\Start-B84-Demo.ps1 -Seed     # primera vez: carga los datos sintéticos (idempotente)
.\tools\b84\Start-B84-Demo.ps1           # siguientes veces
```
(equivale a `node tools/b84/demo-server.mjs [--seed] [--port 4184]`). Ctrl+C lo detiene y conserva la base.

## 14–15. Frontend y acceso
No hay paso separado: el servidor sirve el panel. Abrir **http://127.0.0.1:4184/dashboard/**. Credenciales: abrir `%LOCALAPPDATA%\TwoSidesB84Demo\demo-admin.json` y copiar `technicalAccountId` y `credential` en el formulario (cambian en cada arranque).

## 16. Configuración necesaria
Docker Desktop con `twosides-b811-mongo` iniciado; Node ≥ 24; sin variables de entorno ni `.env`. Puerto opcional `--port` (solo ≥1024, siempre 127.0.0.1). Pruebas: `node --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run --config tests/b84/vitest.config.js`; reales: `$env:B84_REAL_TESTS='1'` y `--config tests/b84/b84-real.config.js`. (No se modificó `package.json` para no alterar el baseline v5.)

## 17. Estado de seguridad (MVP local, no producción)
Hecho: loopback únicamente; JWT RS256 con rol; rate limiting; consultas sin filtros individuales; CSP sin inline; sin innerHTML; sin secretos en el navegador; errores genéricos; token con `Cache-Control: no-store`.
**Pendiente para producción:** HTTPS/despliegue, cookies seguras o almacenamiento de token revisado (hoy el token está en memoria y `sessionStorage`, expuesto a XSS si apareciera una), CSRF si se pasa a cookies, gestión de secretos y rotación de llaves, cuentas admin persistentes (hoy en memoria), auditoría, supresión de celdas pequeñas para privacidad (el MVP muestra totales exactos aunque sean de pocos jugadores, a diferencia de `generalSummary` de B80), CORS/WAF, dependencias auditadas.

## 18. Limitaciones de retención
La política `b82-run-hybrid-v1` es experimental y solo se usa en la base sintética. **La unicidad entre campañas y la retención de producción siguen sin resolverse ni aprobarse.** No hay datos de jugadores reales ni migración.

## 19. Riesgos de concurrencia
Los contadores comparten una revisión global (cuello de botella conocido en B81.1/B82). Con 4 copias simultáneas la prueba real no perdió ni duplicó eventos, pero algunos lotes pueden devolver `retryable` (conflictos de escritura agotados) y el cliente debe reintentar. Un solo nodo: sin failover. No hay prueba de carga sostenida.

## 20. Atlas
Desconectado. No se leyeron credenciales ni se usó `MONGODB_URI`. **Próximo paso mínimo:** que el propietario cree la cuenta Atlas de privilegios mínimos de B83 (incluido `remove` sobre las colecciones TTL), proporcione la URI por un canal seguro y autorice una fase que (a) sustituya `demo-store.js` por un adaptador con TLS y credenciales fuera del repositorio, (b) ejecute las 17 pruebas reales contra una base nueva de Atlas, y (c) apruebe la política de retención.

## 21–22. B00 y v5
B00 sigue pendiente y no se ejecutó. v5 sigue sin activarse ni modificarse (manifiesto intacto; verificador: 0 modificados).

## 23. Reversión
Todo es aditivo. Borrar: `src/modules/statistics/admin-statistics.js`, `demo-app.js`, `tools/b84/`, `dashboard/`, `tests/b84/` y este informe, más `%LOCALAPPDATA%\TwoSidesB84Demo\`. La base de demostración **no se ha eliminado**; cuando el propietario decida, solo podrá borrarse la base `twosides_statistics_b81_b84d43ac…` (nada más en el contenedor).

## 24. Pendientes para la entrega final (5 nov 2026)
1. Decidir si se conserva la base de demostración para presentar. 2. Ensayar la demostración con el procedimiento §13–15 y capturas del propietario. 3. Decidir la política de retención/unicidad y el rol Atlas (B83). 4. Activar el envío real desde Godot, solo con autorización, usando tokens técnicos reales (hoy la ingesta usa tokens sintéticos emitidos por el proceso de siembra). 5. Eliminar rutas de desarrollo de los binarios y reexportar el juego (pendiente desde B74). 6. B00/v5. 7. Revisar `LP06` al rebasear el baseline.
