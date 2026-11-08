# B85 — Metabase: estadísticas generales de Two Sides

Fecha local: 4 de noviembre de 2026 (Guatemala). Evidencias de ejecución: 5 de noviembre UTC.

**Resultado: IMPLEMENTADO Y VERIFICADO, demostración local.** Metabase está disponible en **http://127.0.0.1:4185/dashboard/2**. Requiere sesión administrativa propia. Se crearon la colección **Two Sides**, el dashboard **TWO SIDES — ESTADÍSTICAS GENERALES**, 15 preguntas nativas y siete secciones. No se desarrolló otro frontend ni se integró visualmente con Godot.

## 1. Arquitectura y relación con B84

```text
Mongo B84 original (conservado, sin reinicio ni escrituras B85)
  └─ lectura transaccional snapshot de stats_v1_counters
       └─ copia analítica B85 con autorización Mongo habilitada
            └─ lector de agregados → Metabase → navegador local autenticado
```

La autorización estaba deshabilitada en `twosides-b811-mongo`. Crear allí un usuario no habría impuesto límites reales. El propietario autorizó expresamente una instancia analítica separada usando la imagen Mongo ya disponible; no se modificó la autenticación del original. Esta copia es un **snapshot de agregados de Express**, no un nuevo motor de ingesta ni un contador paralelo. B84 y su dashboard HTML de diagnóstico se conservan.

Origen exclusivamente sintético: `twosides_statistics_b81_b84d43ac0162337c4d9dbfd530823e54`, contenedor `twosides-b811-mongo`, MongoDB 8.0.34, replica set `rsB811`, `127.0.0.1:27028`. Identificador original y fecha de arranque se verificaron antes y después; no cambiaron. Se comprobaron la identidad del servidor y la marca sintética de B84 antes de leer sus contadores. No se abrió el repositorio de ingesta para evitar mantenimiento implícito.

Se copiaron **17 documentos** (global, diarios y mensuales), únicamente `_id` de período y `values` numéricos. No se copiaron eventos, identificadores de instalaciones/sesiones/partidas, recibos, marcas semánticas, cuotas ni claves del documento meta. Digest del snapshot, igual en origen antes/después:

`7b34af0b299fc39c8bd7c495d1093e4d528b66153bff557b3f5997b2bb1f3cb8`

## 2. Versión, recursos y despliegue

Se descargó exclusivamente la imagen oficial autorizada **`metabase/metabase:v0.65.2`**. El contenedor se creó usando su referencia inmutable:

`metabase/metabase@sha256:b62ac14872e9992d28218a2264d99484e0707064aae9fb594d8fbb3bc1518a9e`

La versión se contrastó también con el arranque de la instancia y su API. Referencias oficiales: [release v0.65.2](https://github.com/metabase/metabase/releases/tag/v0.65.2), [Docker](https://www.metabase.com/docs/latest/installation-and-operation/running-metabase-on-docker), [MongoDB](https://www.metabase.com/docs/latest/databases/connections/mongodb).

| Recurso nuevo | Configuración |
|---|---|
| `twosides-b85-metabase` | 1536 MiB de límite, 2 CPU, heap Java 1024 MiB; `127.0.0.1:4185 → 3000` |
| `twosides-b85-analytics` | Imagen local `mongo:8.0`, 512 MiB, 1 CPU, cache WiredTiger 0,25 GiB; autorización habilitada; sin puertos publicados |
| `twosides-b85-private` (red) | Red Docker interna, solo ambos contenedores B85 |
| `twosides-b85-ui` (red) | Red de Metabase para publicar su interfaz; solo loopback del host |
| `twosides-b85-metabase-data` | H2, claves locales de cifrado y firma de sesión, script de arranque |
| `twosides-b85-mongo-data` | Datos exclusivos del Mongo analítico |
| `twosides-b85-private` (volumen) | Credenciales nuevas y sintéticas de administración/lectura B85; no se monta en Metabase |

Docker disponía de aproximadamente 3,45 GiB y Windows de 83 GiB libres. Consumo observado: Metabase 1,44–1,47 GiB, analítico unos 225 MiB, Mongo original unos 156 MiB. No hubo OOM en la campaña. Es una configuración pequeña de demostración; evitar otras cargas y revisar memoria antes de ampliar uso. Ningún otro contenedor se modificó.

La red interna por sí sola no publicaba el puerto con esta versión de Docker; se añadió la red de UI únicamente al nuevo Metabase. Esto **no constituye un bloqueo de egreso del proceso Metabase**. El analítico sigue aislado, sin puerto público. No se configuró ninguna conexión Atlas ni se entregaron credenciales Atlas.

## 3. Base de aplicación y secretos locales

Metabase persiste H2 en `/metabase-data/metabase.mv.db`, mediante `MB_DB_FILE=/metabase-data/metabase`. Su catálogo contiene usuarios administrativos, preguntas, conexiones, colección y dashboard; es independiente de Mongo y SQLite.

El cifrado de credenciales almacenadas está habilitado mediante una clave aleatoria creada dentro del volumen. Se añadió también una clave persistente de firma de sesiones antes del reinicio autorizado. Ninguna clave se puso en argumentos Docker ni en el repositorio. Las claves y la base H2 deben respaldarse juntas. La administración local de Docker puede acceder a estos volúmenes: esto no resuelve B00 ni certifica aislamiento frente al administrador del equipo.

Las contraseñas locales nuevas son aleatorias, sin relación con Atlas o el juego. Para el acceso del propietario existe `tools/b85/Open-B85.ps1`: ventana Windows con contraseña oculta y copia voluntaria al portapapeles; al cerrar limpia el portapapeles si todavía contiene ese valor. No imprime credenciales. No ejecutarlo dentro de una transcripción de PowerShell. Su sintaxis se validó; el acceso HTTP se verificó efectivamente con Edge y la misma cuenta. La ventana auxiliar no se invocó automáticamente.

Para producción debe migrarse H2 a PostgreSQL mediante el [procedimiento oficial de migración](https://www.metabase.com/docs/latest/installation-and-operation/migrating-from-h2), con respaldo y misma versión de Metabase. No se instaló PostgreSQL en B85. También requiere HTTPS, gestión de secretos, cuentas y roles de visualización, auditoría y política de egreso.

## 4. Conexión Mongo y permisos demostrados

Destino: host Docker `twosides-b85-analytics`, puerto 27017, base `twosides_b85_analytics`, colección `stats_v1_counters`. Conexión directa a este standalone local: `directConnection=true`. No se reconfiguró el replica set original anunciado como `localhost:27017`.

Usuario: `b85_metabase_reader`, autenticación en `twosides_b85_analytics`. Esta identidad admite **únicamente SCRAM-SHA-256**, impuesto al crear el usuario del nuevo servidor. El driver de Metabase recibe usuario y contraseña mediante campos separados. Poner `authMechanism` en sus opciones de URI intermedia, todavía sin usuario, produjo `username can not be null`; se retiró esa opción de la URI intermedia, conservando la restricción SHA-256 del usuario en el servidor. No se modificó el driver ni ninguna cuenta anterior.

Rol personalizado, sin roles heredados:

| Recurso | Acciones | Justificación |
|---|---|---|
| `twosides_b85_analytics.stats_v1_counters` | `find` | Preguntas, agregación de lectura y muestreo de estos contadores |
| Base `twosides_b85_analytics`, metadatos | `dbStats`, `listCollections` | La conexión y el descubrimiento oficiales los ejecutaron y fallaron con código 13 sin ellos |

No se concedieron `readWrite`, `insert`, `update`, `remove`, `createCollection`, `dropCollection`, administración ni lectura de otras colecciones. No hicieron falta permisos de índices adicionales. El descubrimiento final contiene **una sola tabla: `stats_v1_counters`**. Los permisos adicionales permiten metadatos de esta base, no leer documentos técnicos.

Pruebas reales de denegación, código 13: actualización sin upsert de un ID inexistente, eliminación de una colección inexistente, lectura de recibos, marcas semánticas, cuotas y otra base. Ninguna modificó documentos. La cuenta de provisión pertenece únicamente al nuevo servidor y no se entrega a Metabase.

Esta conexión local entre contenedores no utiliza TLS. Se limita a una demostración sintética en redes locales Docker; no equivale al contrato TLS obligatorio de Atlas ni a una configuración publicable.

## 5. Preguntas nativas y definiciones

ID de base en Metabase: **2**; colección Two Sides: **5**; dashboard: **2**. Los identificadores efectivos de las preguntas se conservan en `.work/b85/metabase-objects.json`; ese archivo no contiene contraseñas.

`tools/b85/questions.mjs` es la definición reproducible. Todas las preguntas usan agregaciones nativas sobre contadores existentes, sin `$out`, `$merge`, eventos completos ni consultas individuales:

| Sección | Preguntas |
|---|---|
| A. Resumen | Instalaciones; iniciadas; completadas; completadas/iniciadas (%); sesiones iniciadas; horas efectivas |
| B. Tiempo | Minutos capturados/sesión iniciada; eventos únicos aceptados; minutos por bioma |
| C. Biomas | Visitas y finalizaciones por bioma |
| D. Decisiones | Approve/reject; healthy/degraded por bioma |
| E. Finales | Distribución good/medium/bad |
| F. Tendencias | Iniciadas/completadas por día; minutos por día |
| G. Estado | Tarjetas de texto nativas de demostración, alcance y límites |

Consultas globales: seleccionan `_id: all`; los gráficos por bioma proyectan únicamente cinco filas de estadísticas. Las series seleccionan exclusivamente `day:YYYY-MM-DD`, convierten la fecha en **UTC** y ordenan por ella; no suman nuevamente documentos mensuales/globales. No hay filtros por jugador, sesión o identificador técnico ni exploración de partidas. Las tarjetas muestran unidades y el estado sintético de manera permanente.

## 6. Cifras y validación independiente

La referencia independiente es `expectedTotals(generateDemoEvents().events)` de B84: cuenta eventos ficticios deterministas en RAM, sin importar la proyección de contadores. No se resembró Mongo ni se leyó SQLite.

| Métrica | Resultado de Metabase y referencia |
|---|---:|
| Instalaciones | 30 |
| Partidas iniciadas / completadas | 81 / 52 |
| Completadas / iniciadas, conjunto demo | 64,1975308642 % |
| Sesiones iniciadas | 84 |
| Tiempo efectivo | 36 795 232 ms = 10,2208977778 h |
| Minutos capturados por sesión iniciada | 7,3006412698 |
| Eventos únicos aceptados | 2293 |
| Finales good / medium / bad | 14 / 35 / 3 |
| Serie diaria | 14 fechas, 21 octubre–3 noviembre 2026 UTC |

Los 293 duplicados son evidencia de la ingesta B84, **no una nueva métrica inventada en los contadores**: el panel los explica mediante texto. No alteran los 2293 eventos contabilizados.

| Bioma | Visitas | Finalizaciones | Minutos efectivos | Approve / reject | Healthy / degraded |
|---|---:|---:|---:|---:|---:|
| Océano | 81 | 75 | 149,798683 | 28 / 47 | 47 / 28 |
| Selva | 75 | 66 | 134,161733 | 27 / 39 | 39 / 27 |
| Desierto | 66 | 61 | 121,976983 | 29 / 32 | 32 / 29 |
| Bosque | 61 | 57 | 105,406200 | 19 / 38 | 38 / 19 |
| Tundra | 57 | 52 | 101,910267 | 27 / 25 | 25 / 27 |

Se verificaron todas las fechas y las cifras por bioma, no solamente el total global. Los tres finales suman 52. El porcentaje es del conjunto sintético, no una tasa universal de cohorte. Todos los intervalos ficticios tienen sesión iniciada y terminada; el denominador 84 incluye sesiones interrumpidas. No se divide el tiempo por solo las 45 sesiones cerradas normalmente ni se afirma medir su duración completa.

## 7. Pruebas y navegador real

| Verificación | Resultado |
|---|---|
| `node tools/b85/verify.mjs` | **85/85**, con Mongo y Metabase reales locales; incluye 15 consultas, oráculo, metadatos, rol exacto, denegaciones, 401, publicación y logs |
| Edge real con perfil desechable | Dashboard abierto, sesión válida, todos los indicadores y gráficos renderizados |
| `node tools/b85/verify-browser-evidence.mjs` | **12/12** comprobaciones sobre la evidencia de ese navegador |
| Logs combinados stdout/stderr | Sin las contraseñas sintéticas del provisionador, lector ni administrador Metabase |
| Reinicio autorizado de Metabase | Preguntas, configuración, conexión y dashboard conservados; login y consultas volvieron a funcionar |
| Origen B84 | Identidad, fecha de arranque y digest de agregados sin cambios |
| Scripts PowerShell nuevos | Análisis de sintaxis PASS; no se ejecutaron el respaldo ni la ventana de acceso automáticamente |

**97 comprobaciones automatizadas principales aprobadas**, además de las verificaciones operativas indicadas. No se repitieron suites de producción ni pruebas de Godot: B85 no modificó esos componentes.

El navegador emitió 16 solicitudes de consulta de tarjetas; todos los gráficos quedaron visibles. Su único HTTP 401 fue `/api/user/current` **antes del login**, esperado. No hubo solicitudes de página a hosts externos. El perfil temporal de Edge se eliminó al cerrar. Capturas reales revisadas: `.work/b85/dashboard-top.png`, `dashboard-middle.png`, `dashboard-bottom.png`. Se inspeccionaron las tres imágenes, no se infirió el resultado visual solo de la API.

Evidencias adicionales: `.work/b85/deployment.json`, `verification.json`, `source-check.json`, `browser-result.json`, `browser-validation.json`, `layout-result.json`, `tool-hashes.json`. Son evidencias locales, no una certificación independiente de procedencia ni un manifiesto v5.

## 8. API de la versión instalada

Se consultó **`GET /api/docs/openapi.json` de esta instancia v0.65.2** antes de completar la automatización. Se usaron realmente:

- `GET /api/health`, `GET /api/session/properties`.
- `POST /api/setup` para el administrador nuevo y `POST /api/session` para acceder.
- `PUT /api/setting/{key}` para deshabilitar publicación anónima, embedding estático y seguimiento; `GET /api/setting` para verificar.
- `POST /api/database`, `POST /api/database/2/sync_schema`, `GET /api/database/2/metadata` y `GET /api/database/2` (contraseña enmascarada).
- `POST /api/collection`, `POST /api/dashboard`, `POST /api/card`.
- `PUT /api/dashboard/2` con `dashcards`, `GET /api/dashboard/2`.
- `POST /api/card/{id}/query` para comparar resultados con el oráculo.

No se supuso el contrato de versiones anteriores. Los fallos iniciales de configuración y permisos se corrigieron en el despliegue B85; no se modificó Metabase ni el Mongo original para evitarlos.

## 9. Uso sencillo por el propietario

1. Abrir Docker Desktop y esperar a que el motor esté disponible.
2. Desde la carpeta `backend`, ejecutar `./tools/b85/Start-B85.ps1`. Inicia solamente los contenedores B85 existentes, verifica imagen y publicación y no descarga imágenes. Esperar hasta dos minutos en un arranque frío.
3. Ejecutar `powershell.exe -NoProfile -STA -File ./tools/b85/Open-B85.ps1`. En la ventana, copiar la contraseña local oculta y abrir Metabase. Usuario: `admin@twosides.example`. Mantener la ventana hasta pegarla; al cerrar se limpia esa copia del portapapeles.
4. Abrir **http://127.0.0.1:4185/dashboard/2**, iniciar sesión y localizar **Two Sides → TWO SIDES — ESTADÍSTICAS GENERALES**.
5. Usar actualizar en Metabase para volver a consultar el snapshot. No envía operaciones del videojuego ni accede a jugadores.
6. Para detener **solo Metabase**: `docker stop --timeout 30 twosides-b85-metabase`. No usar comandos globales de Docker. Los volúmenes conservan la configuración.

La consulta del dashboard no necesita que Express ni el juego estén abiertos. Mongo original B84 solo se necesita para validar/publicar un nuevo snapshot; el dashboard utiliza su copia analítica autenticada.

### Actualizar la copia de agregados

Esta entrega es un snapshot fijo de demostración, no sincronización continua. Para republicar el mismo conjunto validado, manualmente:

```powershell
docker stop --timeout 30 twosides-b85-metabase
node tools/b85/refresh.mjs
# Solo si informó éxito:
docker start twosides-b85-metabase
```

El publicador verifica el contenedor de origen, lee una transacción snapshot, exige el mismo digest B84 validado, prepara una colección temporal propia y la publica mediante rename atómico en **el analítico B85 únicamente**. Metabase debe estar detenido para evitar que distintas tarjetas muestren snapshots diferentes durante el cambio. Si hay datos u objetos inesperados, falla cerrado y no amplía el conjunto. Un conjunto nuevo requiere primero validar su oráculo/período, no desactivar la comprobación. Este publicador se preparó y pasó comprobación de sintaxis; **no se ejecutó una segunda publicación durante B85**. Si falla dejando una colección staging, conservarla para diagnóstico y no borrar objetos automáticamente.

## 10. Reproducción, respaldo y recuperación

Archivos nuevos exclusivamente en `tools/b85/`, este informe y evidencias locales. No se modificaron `package.json`, producción, Godot ni el dashboard B84.

Para una instalación **nueva y vacía**, el procedimiento implementado es `prepare.mjs → metadata-grants.mjs → configure.mjs → layout.mjs → verify.mjs`. `prepare` rechaza nombres/volúmenes ya existentes y exige la imagen local autorizada; `configure` rechaza una configuración ya registrada. **No volver a ejecutarlos para abrir el panel existente**. La preparación actual se completó y el refuerzo de firma de sesión quedó aplicado con `secure-boot.mjs` y el reinicio autorizado. No se debe recrear un entorno existente para recuperar una contraseña o refrescar gráficas.

Respaldo manual preparado: `./tools/b85/Backup-B85.ps1`. Detiene únicamente los dos contenedores B85 para obtener un respaldo frío de H2, Mongo analítico y credenciales/claves. Crea un volumen nuevo `twosides-b85-backup-<fecha>`, monta los originales de solo lectura y guarda `b85-volumes.tgz` más SHA-256. Usa `mongo:8.0` local con `--pull=never --network=none`, sin descargar herramientas. Conserva los originales y deja B85 detenido; se puede iniciar después con `Start-B85.ps1`. **No se ejecutó ese respaldo ni un ensayo de restauración en esta campaña**; el reinicio sí demostró persistencia. El respaldo contiene secretos locales y no debe subirse públicamente. Un volumen en el mismo Docker no protege contra pérdida del equipo: exportarlo posteriormente a un destino privado autorizado y verificar su hash.

Recuperación propuesta: verificar el SHA-256 del archivo, conservar los volúmenes actuales, restaurar en **volúmenes nuevos** con ambos contenedores B85 detenidos, mantener la imagen fijada, y recuperar H2 junto con sus claves y Mongo junto con las credenciales correspondientes. Validar salud, login y las 15 preguntas antes de utilizar la copia restaurada. No sobrescribir el original ni restaurar sobre B84. Si falta una clave, detenerse en vez de regenerarla silenciosamente.

Reversión de B85: detener únicamente los dos nuevos contenedores. B84, Express y el videojuego no dependen de ellos. No eliminar volúmenes ni respaldos por rutina. La eliminación definitiva de los recursos B85 y restauraciones necesitan una acción explícita del propietario; no se hicieron en esta entrega.

## 11. Seguridad, Atlas, B00 y v5

- **Atlas no se conectó**. No hay URI ni contraseña Atlas en este procedimiento. No se usó `.env`, ni cuentas del juego, ni la conexión del backend principal.
- No se accedió a PlayerData real, ni siquiera a sus metadatos; tampoco a SQLite real/histórica, las 2151 operaciones ni los 71 eventos B78. Los procesos Node incorporan el guard local de rutas y red de B80; los comandos Mongo se acotan a los recursos indicados. No es una sandbox de seguridad del sistema operativo.
- No se ejecutaron B00, C.2, F.2 ni otra fase. No se cambiaron ACL, propietarios, cuotas, cuentas Atlas, manifiestos, binarios, B75/B78 ni código del videojuego. No hubo commit/push.
- **B00 pendiente**. Separar los volúmenes y crear cuentas locales no resuelve la integridad del host bajo la misma cuenta Windows ni protege frente a administradores Docker. Los hashes locales no certifican procedencia independiente. No se promete privacidad ante un equipo comprometido.
- **v5 preservado, sin activar ni regenerar**. B85 no cambió archivos de producción protegidos; se añadió tooling separado. No se ejecutó una nueva certificación completa del árbol v5 en esta campaña y no se confunde su baseline anterior con la adición de B84.
- La API no devuelve la contraseña Mongo en claro; publicación pública y embedding están deshabilitados y el dashboard no tiene UUID público. Sin sesión, su API devuelve 401. Los logs combinados se comprobaron contra los secretos sintéticos en RAM sin mostrarlos.
- Autenticación del panel y del juego son independientes. No hay alta de jugadores ni acciones de administración de partidas. Una cuenta administradora Metabase sí puede configurar su propio Metabase; para una audiencia amplia conviene una identidad visualizadora con permisos de colección, no repartir el acceso administrador.

## 12. Limitaciones y próximo paso mínimo

La demostración está operativa. Pendientes de producción: H2→PostgreSQL, HTTPS del panel, gestión/rotación de secretos, permisos de visualización, egreso, respaldo probado, capacidad/memoria, retención/unicidad B82, supresión de celdas pequeñas y la resolución de B00. No se aplican métricas a personas reales ni se considera aprobada la política de retención experimental.

Para Atlas, el próximo paso mínimo es autorizar separadamente una cuenta **analítica de lectura** sobre una proyección de agregados aprobada conforme a B83, revisar si su descubrimiento requiere `dbStats/listCollections`, configurar TLS y verificar esos permisos con datos sintéticos nuevos. No reutilizar el administrador local, la cuenta de provisión ni la credencial de ingesta. No conectar el dashboard a partidas/recibos ni a toda la base mediante `readWrite`. La migración del adaptador de ingesta y la retención de producto son trabajos distintos.

**B85 termina aquí. No se inicia automáticamente otra fase.**
