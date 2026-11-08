# B86.2 — Guía manual: preparar Atlas desde la interfaz web (sección B del checklist)

**Para:** el propietario, que hará estos pasos a mano. **Estado:** solo guía. Claude Code **no conectó Atlas, no ejecutó preflight, no creó usuarios ni roles, no leyó `.env` ni credenciales históricas**, no tocó permisos antiguos ni la base de sincronización anterior, y no activó telemetría, B00 ni v5.

**Decisión confirmada:** Metabase usa **instantáneas** de agregados, actualizadas **a mano con `publish`** (no se automatiza ahora). Se mantienen **separadas** la base de ingesta y la analítica; el usuario de Metabase solo lee los agregados analíticos.

## 0. Antes de empezar
- Necesitas el rol de **Project Owner** (o *Project Database Access Admin* + *Project Network Access Manager*) en el proyecto.
- Usa un **gestor de contraseñas** para generar (≥ 24 caracteres, sin espacios) y guardar **4 contraseñas distintas**. **No las escribas en el chat, el repositorio ni OneDrive.**
- Lleva una **nota privada** con la columna «Tu valor» del checklist (§8).
- Regla de oro: **si algo no coincide con lo que dice esta guía, detente y avísame; no lo sustituyas por un rol integrado** (readWrite, atlasAdmin…).

## 1. Nombres definitivos
| Elemento | Nombre |
|---|---|
| Base de ingesta (pruebas) | `twosides_statistics_demo` |
| Base analítica (Metabase) | `twosides_statistics_analytics_demo` |
| Base de producción | `twosides_statistics` — **no crear** (retención no aprobada) |
| Roles → usuarios (1 rol por usuario) | `two_sides_statistics_ingest_v1` → `twosides_statistics_ingest_v1` · `two_sides_statistics_schema_v1` → `twosides_statistics_schema_v1` · `two_sides_statistics_publisher_v1` → `twosides_statistics_publisher_v1` · `two_sides_statistics_reader_v1` → `twosides_statistics_reader_v1` |

Atlas crea una base solo cuando algo se escribe en ella: **no la crees a mano**. Aquí solo comprobarás que **no existen**.

## 2. Paso 1 — Proyecto y clúster (checklist 1, 2)
1. Atlas → selector de proyecto (arriba a la izquierda). Elige el proyecto de Two Sides destinado a estadísticas. Anota **nombre e ID** (Project Settings).
2. **Database → clúster** (pestaña *Clusters*). Anota: nombre, **nivel (Free / Flex / M10…)**, versión de MongoDB (≥ 8.0 recomendable; mínimo 4.2 para transacciones).
3. Botón **Connect → Drivers**: copia **solo el host** de la cadena `mongodb+srv://<usuario>@<HOST>/…`, con forma `<nombre>.<id>.mongodb.net`. Ese host es el valor de `-AtlasHost`. (No copies ni pegues contraseñas.)
4. Confirma que es un **replica set** (los clústeres Atlas lo son: la vista del clúster muestra 3 nodos / «Replica Set»).

### Soporte del plan (puntos 6 y 7 de tu lista) — lo que consulté y lo que no
Consulté la documentación pública de MongoDB (no tu cuenta):
- **Roles personalizados: soportados**, también en clústeres **Free** (los cambios pueden tardar **hasta 30 s** en aplicarse). Límites: 20 roles personalizados por usuario, 100 por proyecto, 100 usuarios de base de datos por proyecto. Cubre de sobra 4 roles y 4 usuarios.
- **Free tiene restricciones que podrían afectarnos:** máx. **500 conexiones**, **0,5 GB**, **100 operaciones/s**, y **sin acceso de lectura/escritura a `admin`** (documentado para datos). Nuestro preflight ejecuta `hello` y `connectionStatus` contra `admin`: son comandos, no lectura de datos, y no aparecen como no soportados, pero la documentación **no lo confirma explícitamente**.
- **Transacciones** (`snapshot` + `majority` + `j:true`) **no se mencionan** en las páginas de limitaciones de Free/Flex consultadas: ni prohibidas ni confirmadas. Un clúster Free es un replica set; **no lo doy por verificado**.
- Nombres de acciones (`find`, `insert`, … `dbStats`): documentados como acciones de roles personalizados; su **disponibilidad exacta** depende de la versión de tu clúster (Atlas oculta las no disponibles). **No verificado en tu proyecto.**

**Cómo se verifica de verdad:** el preflight de solo lectura (cuando lo autorices) comprueba `setName`, sesiones lógicas (transacciones), usuario, rol único y privilegios exactos. **Recomendación:** para la demostración usa un clúster **M10 o superior** o confirma con el preflight; si el plan es Free y `connectionStatus` o las transacciones fallan, se detiene y lo reevaluamos (no se «arregla» ampliando permisos).

## 3. Paso 2 — Comprobar que las bases NO existen (checklist 3, 4, 5)
Database → clúster → **Browse Collections**. Verifica que **no aparecen** `twosides_statistics_demo`, `twosides_statistics_analytics_demo` ni `twosides_statistics`. Si alguna existe, **detente** (el aprovisionador exige bases nuevas y vacías). No toques ni reutilices `two_sides_db` ni ninguna base del sistema de sincronización anterior.

## 4. Paso 3 — Crear los 4 roles personalizados (checklist 6)
Ruta: **Security → Database & Network Access → pestaña Custom Roles → Add New Custom Role**.
Para cada rol: escribe el nombre exacto. Cada **fila** = una *categoría* + base + colección + acciones. Atlas solo permite una categoría por fila: para mezclar **Collection Actions** y **Database Actions** pulsa **Add an action or role** y añade otra fila. Para repetir lo mismo en otra colección usa **Add a database or collection**. **No uses «Apply to any database/collection»** y no añadas roles heredados. Termina con **Add Custom Role**.

### 4.1 `two_sides_statistics_ingest_v1`
| Categoría | Base | Colección | Acciones |
|---|---|---|---|
| Database Actions | twosides_statistics_demo | — | listCollections |
| Collection Actions | twosides_statistics_demo | stats_v1_counters | find, insert, update, listIndexes |
| Collection Actions | twosides_statistics_demo | stats_v1_receipts | find, insert, remove, listIndexes |
| Collection Actions | twosides_statistics_demo | stats_v1_semantic | find, insert, listIndexes |
| Collection Actions | twosides_statistics_demo | stats_v1_active | find, insert, remove, listIndexes |
| Collection Actions | twosides_statistics_demo | stats_v1_budgets | find, insert, update, listIndexes |
| Collection Actions | twosides_statistics_demo | stats_v1_meta | find, update, listIndexes |

### 4.2 `two_sides_statistics_schema_v1` (temporal)
| Categoría | Base | Colección | Acciones |
|---|---|---|---|
| Database Actions | twosides_statistics_demo | — | listCollections |
| Collection Actions | twosides_statistics_demo | stats_v1_counters, stats_v1_semantic, stats_v1_meta | createCollection, find, insert, listIndexes |
| Collection Actions | twosides_statistics_demo | stats_v1_receipts, stats_v1_active, stats_v1_budgets | createCollection, createIndex, find, insert, listIndexes |
| Database Actions | twosides_statistics_analytics_demo | — | listCollections |
| Collection Actions | twosides_statistics_analytics_demo | stats_v1_counters | createCollection, listIndexes |

### 4.3 `two_sides_statistics_publisher_v1`
| Categoría | Base | Colección | Acciones |
|---|---|---|---|
| Collection Actions | twosides_statistics_demo | stats_v1_counters | find |
| Collection Actions | twosides_statistics_analytics_demo | stats_v1_counters | find, insert, remove |

### 4.4 `two_sides_statistics_reader_v1` (Metabase)
| Categoría | Base | Colección | Acciones |
|---|---|---|---|
| Database Actions | twosides_statistics_analytics_demo | — | listCollections, dbStats |
| Collection Actions | twosides_statistics_analytics_demo | stats_v1_counters | find |

Las mismas definiciones, en el formato de la API de Atlas, están en `B86_ATLAS_ROLES_Y_ESQUEMA.json` (`identities.<identidad>.atlasCustomRole`). **No añadas ninguna otra acción** (en particular ningún `update`/`remove` al lector, ni DDL a ingesta): el preflight rechaza cualquier privilegio de más **o** de menos.

## 5. Paso 4 — Crear los 4 usuarios (checklist 7, 8)
Ruta: **Security → Database & Network Access → Database Access → Add New Database User**.
1. **Authentication Method: Password** (SCRAM; base de autenticación `admin`). El conector se autentica en Atlas con **SCRAM-SHA-1** explícito (ver `B86_5_MECANISMO_SCRAM_ATLAS.md`); no hay que elegir mecanismo en la interfaz.
2. Username exacto (§1) y la contraseña **generada por tu gestor**. (No uses «Autogenerate» y la copies al chat.)
3. **Database User Privileges → Custom Roles:** selecciona **un único** rol, el de su fila. **Quita cualquier rol integrado** que Atlas proponga por defecto (p. ej. *Read and write to any database*).
4. **Restrict Access to Specific Clusters:** actívalo y deja **solo el clúster elegido**.
5. Opcional pero recomendado para `…_schema_v1`: marca **Temporary User** (caduca en ≤ 7 días) para que el usuario de esquema desaparezca solo.
6. **Add User.** Los cambios de rol pueden tardar hasta 30 s.
7. **Comprobación de herencia (punto 8):** revisa la lista Database Access: ningún usuario **antiguo** (`twosides_backend` u otros del sistema de sincronización) debe tener acceso a las bases nuevas, y **no se reutiliza ninguno**. No edites ni borres los antiguos en esta fase.

## 6. Paso 5 — Red (checklist 9)
Ruta: **Security → Database & Network Access → Network Access → Add IP Address**.
1. Averigua la **IP pública de salida** del equipo desde el que se ejecutarán las sesiones (por ejemplo, buscando «mi IP» en un navegador de ese equipo). Si cambia a menudo (IP dinámica), tendrás que actualizarla.
2. Introduce **esa IP sola** (equivale a `/32`) con comentario `Two Sides B86 sesiones`. Para la demostración marca **temporal** (caduca en ≤ 7 días).
3. **Nunca `0.0.0.0/0`**, ni rangos amplios. Si el proyecto ya tiene entradas antiguas, **no las borres ni las cambies**: solo anota que existen (y avísame si hay `0.0.0.0/0`, para decidir contigo).
4. La lista se aplica a **todos los clústeres del proyecto** (límite 200 entradas). Quitar una entrada no corta de inmediato las conexiones ya abiertas.
5. Metabase (contenedor local de B85) **no** necesita esta entrada hasta que conectes su segunda conexión; en ese momento hará falta la IP de salida de la máquina que lo ejecuta.

## 7. Qué hace quién
| Quién | Acciones |
|---|---|
| **Propietario (manual, esta guía)** | Pasos 1–5 en la web de Atlas; guardar contraseñas fuera del repo; rellenar la nota privada; confirmarme el checklist **sin enviar contraseñas** (basta «hecho» + los valores no secretos: host, nombres, nivel del clúster). |
| **Ya automatizado (Claude Code, sin Atlas)** | Matriz exacta de privilegios, conector TLS/SCRAM, preflight de solo lectura, `provision`/`seed`/`publish`/`read` y sus pruebas en un servidor local desechable, plan JSON, plantilla Metabase. |
| **Requiere nueva autorización expresa tuya** | Cada conexión a Atlas (empezando por el preflight de solo lectura del lector, ejecutado **por ti** con `Run-Atlas-Session.ps1`), y luego `provision`, `seed`, `publish` por separado; la segunda conexión de Metabase. |
| **Pendiente (seguridad/decisión)** | Retención productiva, credenciales técnicas definitivas y clave HMAC privada, HTTPS/secretos, contención/capacidad, B00, v5, envío real desde Godot. |

## 8. Checklist B (los 10 puntos) — qué comprobar y qué anotar
| # | Punto | Comprobación (resumen) | Evidencia a anotar (sin secretos) |
|---|---|---|---|
| 1 | Proyecto | §2.1 | nombre e ID del proyecto |
| 2 | Clúster | §2.2–2.4 | nombre, nivel, versión, host `…mongodb.net` |
| 3 | Base de ingesta | §3 | «no existe `twosides_statistics_demo`» |
| 4 | Base analítica | §3 | «no existe `twosides_statistics_analytics_demo`» |
| 5 | Producción | §3 | «no existe `twosides_statistics`; no se creó» |
| 6 | 4 roles | §4 | 4 nombres de rol creados, cada uno con exactamente las filas de la tabla |
| 7 | 4 usuarios | §5 | 4 nombres de usuario, **un solo** rol cada uno, acceso limitado al clúster |
| 8 | Sin herencia | §5.7 | «ningún usuario/rol legacy con acceso a las bases nuevas» |
| 9 | Red | §6 | IP(s) permitida(s) y «no hay `0.0.0.0/0` nuevo» |
| 10 | Metabase | Se hará después, con usuario `…_reader_v1` sobre la base **analítica** (`B86_metabase-atlas-connection.template.json`) | — (no aplica todavía) |

## 9. Siguiente paso
Cuando termines el checklist, dime «checklist B completado» con los valores no secretos (§8). Luego autorizas **una** conexión de **preflight de solo lectura** (primero `reader`) y la ejecutas tú:
`.\tools\b86\Run-Atlas-Session.ps1 -Identity reader -Action preflight -AtlasHost <host>` (te pedirá la frase de autorización —`ATLAS_AUTHORIZATION_PHRASE` en `src/modules/statistics/atlas-policy.js`— y la contraseña oculta).

*Fuentes públicas consultadas (documentación de MongoDB Atlas): roles personalizados, usuarios de base de datos, lista de acceso IP, limitaciones de clústeres Free y comandos no soportados. Las etiquetas de la interfaz pueden cambiar; si difieren, prevalece lo que veas y la regla de oro de §0.*
