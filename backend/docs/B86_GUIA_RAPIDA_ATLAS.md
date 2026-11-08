# B86 — Guía rápida Atlas (actualizada con B86.1)

**Estado en una línea:** Express y el conector Atlas están **listos y probados en local** (servidor MongoDB desechable con TLS + usuarios + roles exactos). **Atlas NO está conectado**: no se leyó ninguna credencial ni se creó ningún recurso remoto. Informes: `B86_PREPARACION_CONEXION_ATLAS_ESTADISTICAS.md` y `B86_1_TIEMPOS_Y_AISLAMIENTO_ANALITICO.md` (este último prevalece donde difieran).

> **Guarda de aislamiento (B86.6/B86.7):** el preflight fallaba porque `atlas-session.mjs` cargaba sin querer la guarda de pruebas B80 (rechaza toda conexión no loopback). **Corregido en B86.7:** ninguna ruta de Atlas importa ya `tests/` ni la guarda; la guarda sigue igual para pruebas y demostraciones locales. Ver `B86_6_PREFLIGHT_Y_GUARDA_DE_AISLAMIENTO.md`.

> **Mecanismo de autenticación (B86.5):** en Atlas se usa **SCRAM-SHA-1** (comprobado en TwoSidesCluster con el lector; no en todos los clústeres). Ver `B86_5_MECANISMO_SCRAM_ATLAS.md`.

> **Paso a paso desde la web de Atlas (sección B):** `B86_2_GUIA_MANUAL_ATLAS.md`. Decisión confirmada: Metabase usa **instantáneas** actualizadas **a mano** con `publish`; no se automatiza en esta fase.

## Decisión vigente (B86.1)
**Metabase NUNCA lee la base de ingesta.** Lee una base **analítica separada** con solo una copia publicada de los contadores agregados (modelo B85):

```
Express ──► twosides_statistics_demo (ingesta: 6 colecciones)
                 │  «publish» (identidad publisher, 1 transacción)
                 ▼
            twosides_statistics_analytics_demo  (solo stats_v1_counters)  ◄── Metabase (reader)
```

## A. Lo que Claude Code ya hizo
- Conector Atlas (TLS + **SCRAM-SHA-1 explícito en Atlas**, SCRAM-SHA-256 en el servidor local; ver `B86_5_MECANISMO_SCRAM_ATLAS.md`; sin opciones inseguras), selección apagada por defecto y matriz de privilegios exacta con **cuatro identidades** (ingesta, esquema, publicador, lector). Verificadas en un servidor real con autenticación: suficientes, y cada acción de ingesta es necesaria.
- **Preflight de solo lectura** (`-Action preflight`): conecta por TLS, ejecuta únicamente `hello` y `connectionStatus`, comprueba usuario autenticado, rol único y privilegios **idénticos** a la matriz. No lee ni escribe ninguna colección (probado con un doble que falla ante cualquier otro acceso).
- **Presupuesto de tiempo de Express (B86.1):** responde en ≤ 8 s por solicitud (cliente .NET: 15 s); con MongoDB caído un lote de 5 pasó de ~25 s a **5,0 s**, con idempotencia y recibos intactos.
- Plan y definiciones de roles Atlas: `B86_ATLAS_ROLES_Y_ESQUEMA.json`. Plantilla Metabase sin secretos: `B86_metabase-atlas-connection.template.json`. B85 (dashboard 2) y B84 intactos.

## B. Lo que debes hacer tú — checklist verificable (antes de crear nada)
Rellena la columna «Tu valor» en una nota **privada** (no en el repositorio ni en el chat). Yo no leí `.env` ni ninguna credencial anterior, así que **no puedo identificar tu proyecto por ti**.

| # | Elemento | Valor exacto requerido | Cómo comprobarlo en Atlas | Tu valor |
|---|---|---|---|---|
| 1 | Proyecto | El proyecto de Two Sides destinado a estadísticas (el que tú decidas; anota nombre e ID) | Atlas → selector de proyecto. Confirmar que no es un proyecto ajeno | |
| 2 | Clúster | Un clúster replica set con transacciones; anota su host `<nombre>.<id>.mongodb.net` | Database → clúster → Connect → Drivers: el host `mongodb+srv` | |
| 3 | Base de ingesta (pruebas) | `twosides_statistics_demo` — **no debe existir** | Browse Collections: no aparece | |
| 4 | Base analítica | `twosides_statistics_analytics_demo` — **no debe existir** | Browse Collections: no aparece | |
| 5 | Base de producción | `twosides_statistics` — **no crearla** (bloqueada por la retención no aprobada) | — | |
| 6 | Roles (4, personalizados) | `two_sides_statistics_ingest_v1`, `…_schema_v1`, `…_publisher_v1`, `…_reader_v1`; acciones exactas del campo `atlasCustomRole` de `B86_ATLAS_ROLES_Y_ESQUEMA.json`; **sin roles integrados ni heredados** | Database Access → Custom Roles | |
| 7 | Usuarios (4, SCRAM) | `twosides_statistics_ingest_v1`, `…_schema_v1`, `…_publisher_v1`, `…_reader_v1`; cada uno con **un solo** rol (el suyo); contraseñas largas y únicas, generadas por ti | Database Access → Database Users | |
| 8 | Nada heredado | Ningún usuario/rol legacy (`twosides_backend`, `two_sides_db`, sincronización) tiene acceso a las dos bases nuevas y no se reutiliza ninguno | Database Access: revisar cada usuario antiguo | |
| 9 | Red | Solo las IP públicas de salida del equipo que ejecutará las sesiones (una entrada por IP, con comentario y, si es posible, caducidad). **Nunca `0.0.0.0/0`** | Network Access → IP Access List | |
| 10 | Metabase (después) | Segunda conexión con el usuario `…_reader_v1` sobre la base **analítica** (plantilla JSON) | Metabase → Admin → Databases | |

Comprobaciones previas que **no puedo hacer por ti** y que el preflight revelará: que el plan del clúster permita roles personalizados y transacciones, y que los nombres de acción (FIND, INSERT, UPDATE, REMOVE, LIST_COLLECTIONS, LIST_INDEXES, CREATE_COLLECTION, CREATE_INDEX, DB_STATS) existan tal cual en tu interfaz. Si alguno falta, **detente y avísame**: no sustituyas por roles integrados.

## C. Lo que requiere una NUEVA autorización explícita tuya
1. **Cuando hayas completado el checklist B y me lo confirmes**, autorizar **una** conexión de **preflight de solo lectura**, identidad por identidad. Ejecuta tú: `.\tools\b86\Run-Atlas-Session.ps1 -Identity reader -Action preflight -AtlasHost <host>` (pide la frase de `ATLAS_AUTHORIZATION_PHRASE` en `atlas-policy.js` y la contraseña oculta). Claude Code no ejecuta ese guion ni conoce la frase de uso.
2. Cada acción que escribe, por separado: `provision` (esquema), `seed` (ingesta), `publish` (publicador). `read` (lector) solo lee.
3. Cualquier cambio de red, rol o usuario existente, y la segunda conexión de Metabase.

## D. Pendiente por seguridad / decisión (bloquea producción)
1. **Retención productiva** no aprobada. Atlas solo admite la demo **sintética** (`b82-run-hybrid-v1`); el nombre `twosides_statistics` está bloqueado en código.
2. **Credenciales técnicas definitivas** de instalación y clave HMAC privada (la de la demo es pública y solo vale para la base sintética).
3. **Contención** (revisión global): sin prueba de carga sostenida. Los conflictos de escritura se reintentan, pero no se ha medido el límite.
4. HTTPS/despliegue de Express, gestión de secretos, B00 y v5 siguen pendientes. No se activó telemetría real; el videojuego no se conecta.
5. El dashboard publicado es una **instantánea**: hay que ejecutar `publish` para actualizarlo.

## Orden recomendado
`B completo → (autorizas) preflight reader → publisher → ingest → schema → provision → seed → publish → read → Metabase (segunda conexión) → revocar el usuario schema y cualquier acceso de prueba`.
