# Plan permanente B00–B11

## B05.4C.2F.1B ? COMPLETADA en c?digo aislado

2026-10-29 Guatemala. Guardia durable por propietario y repositorio Mongo de identidad comparten transacci?n con ingesti?n/revocaci?n. 462 pruebas backend aprobadas (41 nuevas, 421 regresiones); solo dobles/loopback de ensayos, ninguna conexi?n Atlas. F.2 BLOQUEADA hasta validaci?n Mongo real y autorizaci?n independiente. B00 pendiente, B05.5 no iniciada. Sin migraciones ni cambios a .env/SQLite/Godot/ACL. [Informe](B05_DURABLE_REVOCATION_IMPLEMENTATION.md).


Fecha: 2026-10-24. Estados admitidos: PENDIENTE, EN_PROCESO, BLOQUEADA, COMPLETADA.

## Reglas de ejecución

Cada fase requiere autorización explícita antes de empezar. Las rutas permitidas de fases futuras son propuestas de alcance, no permisos actuales. Actualizar este plan y `PHASE_HISTORY.md` con evidencias; no cerrar una fase sin comprobar todos sus criterios. Si falta una decisión requerida, registrar BLOQUEADA y el motivo. Las fases de cliente requieren autorización específica para las rutas reales de la copia de pruebas, todavía no determinadas.

Restricción permanente: no modificar `.env`, proyecto original, otras copias ni bases reales. No ejecutar acciones remotas, instalaciones o servicios sin autorización de la fase correspondiente. Los permisos sobre pruebas con SQLite o MongoDB aislados nunca implican permiso sobre datos existentes o Atlas. La evidencia de una prueba futura se registra solo después de ejecutarla.

## B00 — Arquitectura y documentación

- Estado: BLOQUEADA.
- Bloqueo: la verificación final detectó una entrada heredada adicional en la ACL de `.env` respecto al registro inicial. Contenido, tamaño, atributos y fecha de modificación coinciden. No modificar permisos para cerrar esta fase; investigar y resolver la discrepancia antes de declarar aceptación completa.
- Objetivo: definir responsabilidades, flujos, módulos, requisitos, decisiones y control de fases desde cero.
- Dependencias: limpieza autorizada terminada; `.env` intacto.
- Archivos permitidos: únicamente `backend/docs/{ARCHITECTURE,REQUIREMENTS,PHASES,PHASE_HISTORY,DECISIONS}.md`.
- Archivos restringidos: todos los demás, incluido `.env`; sin código ni paquetes.
- Entregables: los cinco documentos, estructura futura propuesta y decisiones pendientes separadas.
- Pruebas requeridas: revisar requisitos y cobertura B00–B11; verificar árbol exacto, tamaño/hash/permisos/modificación de `.env`.
- Criterios de aceptación: cinco documentos coherentes; flujos offline, identidad y confirmación idempotente definidos; restricciones respetadas; verificación final registrada en el historial.

## B01 — Estructura Node.js + Express

- Estado: COMPLETADA.
- Verificación: 2026-10-24; ocho pruebas aprobadas, cero fallos finales; arranque real en 127.0.0.1, health HTTP 200 y proceso detenido. `.env` conserva tamaño/hash/ACL/fecha del inicio de B01. Evidencia y problemas del entorno en `PHASE_HISTORY.md`.
- Autorización: solicitud B01 del usuario del 2026-10-24. Permite avanzar con la discrepancia ACL de B00 registrada como riesgo pendiente, sin corregir permisos ni usar credenciales reales. No declara B00 completada.
- Objetivo: preparar base modular y ciclo de vida del servidor.
- Dependencias: B00 y autorización; resolver P11 en lo aplicable.
- Archivos permitidos: `backend/.gitignore`, `package.json`, `package-lock.json`, `src/app.js`, `src/server.js`, `src/config/`, carpetas modulares vacías con `.gitkeep`, `tests/unit/`, dependencias Express, caché/temporales locales y los dos documentos de seguimiento.
- Archivos restringidos: `.env`, cliente, bases; sin identidad, endpoints de negocio ni conexiones Atlas.
- Entregables: estructura mínima y contrato de configuración, sin copiar configuración antigua.
- Pruebas requeridas: composición de app, configuración ausente/inválida sin filtrar secretos, arranque/cierre en entorno aislado si autorizado.
- Criterios de aceptación: estructura existente, Express instalado, health HTTP 200 y pruebas aprobadas, escucha exclusiva en 127.0.0.1 y procesos propios detenidos; sin credenciales, Atlas ni cambios al videojuego; `.env` conserva tamaño/hash/ACL/fecha respecto al inicio de B01; seguimiento actualizado. La discrepancia histórica ACL sigue pendiente.

## B02 — Identidad y login invisible

- Estado: COMPLETADA.
- Verificación: 2026-10-24; seis escenarios, tres contratos, nueve ejemplos JSON y enlaces documentales revisados; ocho regresiones B01 aprobadas, cero fallidas; catorce archivos B01 conservan hash/fecha y `.env` conserva tamaño/hash/ACL/atributos/fecha. Se completa el diseño, no una implementación de identidad.
- Alcance autorizado: solicitud B02 del usuario, 2026-10-24; redefine B02 como DISEÑO, sin implementar registro ni modificar código B01. B00 conserva su bloqueo ACL; se permite avanzar documentalmente con ese riesgo pendiente.
- Objetivo: documentar login invisible, identidad técnica, contratos, estados y recuperación sin bloquear el juego offline.
- Dependencias: B01 COMPLETADA; requisitos D01–D10 preservados. P01–P05/P08 y demás opciones se proponen aquí; requieren aprobación antes de implementarse.
- Archivos permitidos: crear `backend/docs/IDENTITY_DESIGN.md` y `IDENTITY_API_CONTRACT.md`; actualizar únicamente los cinco Markdown anteriores de `backend/docs/`.
- Archivos restringidos: todo código, pruebas y dependencias B01, `.env`, ACL/propietarios, Godot, SQLite y Atlas; no crear credenciales ni implementar endpoints.
- Entregables: escenarios A–F, modelo local/remoto, tres contratos propuestos, estados independientes, nombres Unicode, ejemplos ficticios, límites de seguridad y decisiones pendientes.
- Pruebas requeridas: revisión documental cruzada, JSON de ejemplos válido sintácticamente, regresiones existentes B01 (ocho); comparar integridad de archivos B01 y metadatos/hash de `.env` sin leer valores.
- Criterios de aceptación: seis escenarios y contratos completos, estados y limitaciones definidos, decisiones pendientes separadas; ocho regresiones aprobadas; código B01 intacto; sin secretos reales ni cambios al videojuego/bases/ACL; seguimiento actualizado. Ninguna prueba futura de identidad se presenta como ejecutada.

## B03 — Autenticación técnica

- Estado: COMPLETADA.
- Alcance cerrado: B03.1 documental y B03.2 local en memoria, ambas autorizadas y verificadas. No implica autenticación de producción, cliente DPAPI, recuperación o persistencia real; tampoco resuelve B00.
- Objetivo: implementar registro técnico, autenticación y autorización conforme a contratos B02 aprobados, inicialmente con persistencia simulada de pruebas.
- Dependencias: B02 y nueva autorización; resolver P01/P02/P04/P05/P08/P11/P13 y acuerdos de protección local P03/P09 que afecten a los contratos. No implementar cliente sin permiso específico.
- Archivos permitidos: propuesta futura `backend/src/modules/identity/`, `auth/`, middleware de autenticación, config/composición pertinentes, repositorios simulados, pruebas y documentos; alcance concreto sujeto a autorización B03.
- Archivos restringidos: `.env`, Godot, bases existentes y conexiones Atlas.
- Entregables: verificación de credenciales, ciclo de tokens, revocación y manejo de errores con repositorios simulados.
- Pruebas requeridas: nombres no autentican, secretos distintos, registro concurrente/repetido, respuesta perdida y posesión de credencial, expiración, reautenticación, rotación/renovación si se aprueba, credencial incorrecta, aislamiento y límites de abuso.
- Criterios de aceptación: ningún acceso por nombre o ID declarado; verificadores y sesiones protegidos en el backend, pruebas locales de posesión/idempotencia/expiración/revocación aprobadas. Recuperación/DPAPI quedan fuera de este alcance local y no se declaran implementadas.
- Precisión de alcance B03.2: aceptación de B03 se limita a identidad/sesiones locales en memoria y sus pruebas; DPAPI, recuperación, persistencia real y cliente quedan para autorizaciones posteriores. No se exige ni se declara recuperación funcional para cerrar este alcance local.

### B03.1 — Decisiones de autenticación técnica

- Estado: COMPLETADA.
- Verificación: 2026-10-24; diseño y contratos cruzados, ocho documentos y nueve ejemplos JSON revisados; ocho regresiones B01 aprobadas sin fallos; catorce archivos B01 y metadatos/hash de `.env` idénticos al inicio. No se midió Argon2, implementó DPAPI o generó material secreto. Las propuestas requieren aprobación antes de B03.2; B03 continúa EN_PROCESO.
- Fecha y autorización: 2026-10-24, solicitud expresa B03.1 del usuario; no permite instalar Argon2 ni implementar endpoints o generar secretos.
- Objetivo: precisar identificadores, Argon2id, protección Windows, sesiones, límites, idempotencia, rotación y recuperación para revisar antes de B03.2.
- Dependencias: B01 y B02 COMPLETADAS; revisión de los siete documentos previos; discrepancia ACL de B00 conservada como riesgo pendiente.
- Archivos permitidos: crear `backend/docs/AUTH_SECURITY_DESIGN.md`; actualizar `IDENTITY_DESIGN.md`, `IDENTITY_API_CONTRACT.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `PHASES.md` y `PHASE_HISTORY.md` en esa carpeta.
- Archivos restringidos: `REQUIREMENTS.md` sin necesidad de cambio; todo código/pruebas/dependencias B01, `.env`, ACL/propietario, Godot, SQLite, Atlas y proyecto original. No generar material criptográfico.
- Entregables: diseño con incompatibilidades previas registradas, parámetros propuestos y recursos, comparación opacas/JWT, DPAPI y escenarios de pérdida, controles/contratos revisados, propuestas separadas de confirmaciones.
- Pruebas requeridas: revisión de consistencia y JSON/links, ocho regresiones B01, comparación de hashes/fechas de archivos B01 y metadatos/hash de `.env`; no medir Argon2 ni probar DPAPI real en esta fase.
- Criterios de aceptación: diseño trazable que no altera D01–D10; opciones concretas justificadas y pendientes identificados; offline/progreso local preservados; ocho regresiones aprobadas; código y `.env` intactos; riesgo ACL aún abierto; detenerse sin B03.2.

### B03.2 — Implementación local de identidad y sesiones

- Estado: COMPLETADA.
- Verificación: 2026-10-24; 39 pruebas aprobadas, cero fallidas, incluidas las ocho B01 previas y posteriores; Argon2id exacto y benchmark local registrados; tres endpoints HTTP loopback probados; `.env` conserva tamaño/hash/ACL/propietario/fecha. Sin procesos de prueba persistentes, cuentas reales o conexiones Atlas.
- Autorización: solicitud expresa B03.2 del usuario, 2026-10-24; autoriza implementación local sintética, dependencia imprescindible Argon2 y pruebas/mediciones. No permite cliente, bases o recuperación.
- Objetivo: implementar identidad, registro idempotente y sesiones sobre contratos revisados, con repositorios en memoria y datos sintéticos.
- Dependencias: B03.1 COMPLETADA y solicitud expresa B03.2 que autoriza parámetros, implementación local, dependencia Argon2 y mediciones.
- Archivos permitidos: `backend/src/modules/identity/`, `auth/`, `src/middleware/`, `src/utils/`, composición `src/app.js`, package/lock, pruebas unitarias/integración, script de benchmark y los cinco documentos de seguimiento/seguridad/contratos indicados por el usuario. Dependencias y caché solo dentro de backend.
- Archivos restringidos: `.env`, ACL, cliente, bases existentes, Atlas real y proyecto original; no asumir autorización de recuperación/rotación adicional.
- Entregables: register/session/me locales, hashing asíncrono, repositorios aislados, límites y cabeceras/errores sanitizados; tests y benchmark reproducible sin secretos persistidos.
- Pruebas requeridas: idempotencia/concurrencia, posesión, expiración/revocación, autorización entre cuentas, límites/recursos, no filtración y regresión B01; medir Argon2 solo con autorización.
- Criterios de aceptación: los tres endpoints funcionan localmente; Argon2id genera/verifica; idempotencia y sesiones expirables/revocables probadas; accesos indebidos rechazados; suite y regresiones B01 aprobadas; sin secretos reales/Atlas/cambios Godot/SQLite; `.env` intacto; evidencia y limitaciones documentadas. No iniciar B04 sin nueva autorización.

## B04 — Persistencia SQLite

- Estado: EN_PROCESO.
- División autorizada: B04.1 diseña desde fuentes reales; B04.2 implementación futura requiere autorización independiente, incluyendo rutas C# y destino de datos. B00 conserva bloqueo ACL.
- Objetivo: implementar progreso local independiente de la red.
- Dependencias: B00, contratos B02/B03 y P09; permiso específico de rutas del cliente de pruebas.
- Archivos permitidos: documentación del backend y, solo con nueva autorización, archivos de persistencia C# identificados del cliente y pruebas con SQLite temporal.
- Archivos restringidos: `.env`, proyecto original, guardados/bases existentes, escenas/assets y resto del cliente.
- Entregables: esquema local, guardado/carga, transacciones y migraciones probadas únicamente con datos temporales.
- Pruebas requeridas: perfil, bioma, decisiones, ecosistemas, reapertura, rollback y disco lleno simulado.
- Criterios de aceptación: continuar partida sin Atlas y sin pérdida silenciosa de progreso.

### B04.1 — Diseño de persistencia local SQLite

- Estado: COMPLETADA.
- Verificación: 2026-10-25; fuentes reales y conflictos revisados, diez tablas conceptuales y contratos documentados; diez Markdown, doce ejemplos JSON y enlaces locales válidos; 39 regresiones aprobadas, cero fallidas. Se compararon 256 archivos protegidos sin diferencias de hash/fecha; `.env` íntegro. No se crearon bases/drivers ni se modificó juego/código. S01–S08 siguen pendientes para implementación.
- Fecha: 2026-10-25, America/Guatemala.
- Objetivo: documentar datos reales, relaciones, guardado/carga, integridad, migración, ruta aislada y extensión transaccional B05.
- Dependencias: B01/B02/B03 completadas en su alcance; revisión de documentos backend y requisitos/C# necesarios de la copia, sin modificar el juego.
- Archivos permitidos: crear `backend/docs/SQLITE_SCHEMA_DESIGN.md` y `LOCAL_SAVE_CONTRACT.md`; actualizar `ARCHITECTURE.md`, `REQUIREMENTS.md`, `DECISIONS.md`, `PHASES.md`, `PHASE_HISTORY.md`. Fuentes de juego/requisitos solo lectura.
- Archivos restringidos: código backend/cliente, escenas/assets, `.env`, ACL/propietario, SQLite real, drivers, datos del original, Atlas y endpoints nuevos.
- Entregables: esquema/diccionario/relaciones propuestos; contratos y errores; evidencia de campos y conflictos históricos; rutas/namespaces; reglas y checkpoints pendientes; integridad y B05.
- Pruebas requeridas: revisión de JSON/enlaces/consistencia, regresiones B01/B03.2 existentes, comparación de hashes/fechas de fuentes y backend, tamaño/hash/metadatos de `.env`; sin ejecutar SQLite.
- Criterios de aceptación: datos observados y dudas identificados sin inventar variables, contratos y transacciones especificados, migraciones/estadísticas preparadas, documentación coherente, regresiones aprobadas y ninguna modificación al juego o base real. No equivale a implementación offline/exacta ya funcional.

### B04.2 — Implementación por etapas de persistencia local

- Estado: EN_PROCESO.
- División: B04.2A infraestructura C# aislada autorizada; B04.2B.1 preparación documental completada; B04.2B.2 ejecutable pendiente, sin autorización. Completar A no completa la integración ni habilita offline en el ejecutable actual.
- Objetivo: implementar solo el alcance de SQLite que autorice el usuario con rutas y checkpoints definidos.
- Dependencias: B04.1 diseñada, S01–S08 aplicables revisados y autorización explícita, particularmente namespace de pruebas y archivos C#.
- Archivos permitidos: únicamente el alcance aislado de B04.2A descrito abajo. Para B04.2B.1 solo los cinco documentos autorizados; cliente y datos reales requieren nueva autorización.
- Archivos restringidos: proyecto original, user:// compartido/legado, bases existentes, `.env`, ACL y Atlas real. No importar automáticamente IDs/journal del backend anterior.
- Entregables: futuros repositorios/unidad de trabajo/servicio y migraciones en bases aisladas, sin prometer checkpoint exacto no soportado.
- Pruebas requeridas: guardado/carga offline, perfil único, propiedad, revisión/idempotencia, fallos/rollback, corrupción, migraciones/versiones y aislamiento de rutas; extensión B05 solo cuando se autorice.
- Criterios de aceptación: alcance implementado y probado, datos originales intactos y límites documentados; no iniciar B05 automáticamente.

#### B04.2A — Infraestructura SQLite C# aislada

- Estado: COMPLETADA.
- Verificación: 2026-10-25; compilación net8.0 con cero errores/advertencias; 43 pruebas SQLite reales aisladas y 39 regresiones backend aprobadas, cero fallos finales; migraciones v1→v2/rollback/locks/idempotencia verificadas. Cero bases sintéticas restantes, ningún .cs nuevo bajo la raíz del juego y 263 archivos protegidos sin cambios de hash/fecha; `.env` íntegro. B04.2B permanece PENDIENTE.
- Fecha/autorización: 2026-10-25; solicitud expresa B04.2A, sin modificar código existente de Godot o proyecto raíz.
- Objetivo: biblioteca net8.0 con Microsoft.Data.Sqlite, modelos/repositorio/unidad de trabajo/servicio y pruebas sobre bases sintéticas.
- Dependencias: B04.1 diseñada; framework inspeccionado; proveedor estable/revisión NuGet y caches aislados. Las reglas definitivas de juego y checkpoint exacto quedan pendientes.
- Archivos permitidos: crear `local-persistence/` con proyectos, código `.cs.txt`, configuración local, lockfiles, runner, README y trabajo sintético; actualizar únicamente PHASES.md, PHASE_HISTORY.md y DECISIONS.md en backend/docs.
- Archivos restringidos: TwoSides.csproj/solución, scripts/escenas/assets existentes, otros documentos de diseño, `.env`/ACL/propietario, user:// y partidas existentes, original, Atlas; sin cola B05 ni integración Godot.
- Entregables: diez tablas, dos migraciones, operaciones locales transaccionales/idempotentes, políticas de ruta propias y hook transaccional B05 sin outbox, pruebas/guía técnica.
- Pruebas requeridas: casos B04.2A ejecutados en .NET 8/SQLite real aislado, regresiones Node, inspección de activos NuGet, limpieza sintética, ausencia de .cs incorporables a Godot, comparación de archivos protegidos y `.env`.
- Criterios de aceptación: compilación correcta, proveedor y diez tablas/FK funcionales, guardado/carga/rollback/migraciones/idempotencia/concurrencia probados, sin fallos finales, backend intacto, datos de jugador no accedidos y procesos terminados. No continuar B04.2B automáticamente.

#### B04.2B — Integración con Godot por etapas

- Estado: EN_PROCESO.
- Objetivo: integrar persistencia con el cliente solo en el alcance que autorice el usuario; B.1 documental completada, B.2 ejecutable pendiente.
- Dependencias: B04.2A verificada; resolver rutas, propiedad de archivos, catálogo real, inicialización/adaptadores y reglas pendientes; autorización explícita de archivos C#/ProjectReference.
- Archivos permitidos: solo documentación B04.2B.1; ninguno de integración ejecutable.
- Archivos restringidos: original, partidas/user:// compartidos o existentes sin permiso, `.env` y ACL, escenas/scripts fuera del alcance y Atlas real.
- Entregables: futuros servicios del cliente, rutas y guardado/carga offline con estados realmente soportados, sin prometer snapshot exacto no aprobado.
- Pruebas requeridas: cargas/autosaves del cliente, conservación de estado, aislamiento entre copias, fallos/transiciones, permisos de escritura y regresiones pertinentes.
- Criterios de aceptación: implementación autorizada/probada y límites explícitos; no iniciar antes de autorización ni confundir esta fase con A aislada.

##### B04.2B.1 — Preparación documental Godot / SQLite

- Estado: COMPLETADA en su alcance documental, 2026-10-25.
- Autorización: solicitud expresa B04.2B.1; análisis de fuentes reales y contratos, sin ejecutar Godot.
- Archivos permitidos: crear GODOT_SQLITE_INTEGRATION_PLAN.md y GODOT_SAVE_ADAPTER_CONTRACT.md; actualizar PHASES.md, PHASE_HISTORY.md y DECISIONS.md, todos en backend/docs.
- Entregables: compatibilidad estática net8.0, inventario de cinco biomas/jugadores, decisiones/recursos/menús/transición, adaptador conceptual, ruta estable exclusiva bajo LocalApplicationData, checkpoints de frontera y catorce pruebas futuras.
- Verificación: 39 regresiones backend aprobadas, 0 fallidas finales; 43 SQLite anteriormente aprobadas no repetidas porque crean archivos en local-persistence protegido. No declarar 82 ejecuciones actuales. Integridad de archivos/metadatos verificada en historial.
- Condiciones pendientes: compatibilidad operativa/export Windows no probada, validación efectiva de ruta externa no realizada, proveedor durable no existente, recursos sin esquema/API, reglas/versiones y transacciones compuestas por aprobar. Diseño completado no equivale a integración ejecutable; no hay propuesta ejecutable habilitada.
- Restricciones: sin cambios a escenas/C#/proyecto/Godot/biblioteca/.env/ACL ni bases; sin Atlas. B00 sigue BLOQUEADA. No iniciar B04.2B.2.

##### B04.2B.2 — Integración por subfases

- Estado: EN_PROCESO; B04.2B.2A infraestructura autorizada y completada; B04.2B.2B guardado real PENDIENTE.
- Dependencias: mantener separación de infraestructura sintética y juego; transacciones de frontera, recursos/reglas/versiones e integración con escenas requieren nueva autorización.
- Archivos permitidos en A: TwoSides.csproj, mínimos de local-persistence, nueva integración/pruebas y documentación afectada. Ruta AppData exclusiva de esta copia para base sintética. No habilita Autoload ni guardado real.

###### B04.2B.2A — Infraestructura SQLite referenciada por Godot

- Estado: COMPLETADA, 2026-10-25. Autorización expresa B04.2B.2A.
- Entregables: ProjectReference, exclusiones de compilación de pruebas, compilación privada, ISaveDatabase y DurableTestDatabase conservando SyntheticDatabase; adaptador sin Node/Autoload/escena y suite sintética de infraestructura.
- Ruta utilizada: LocalApplicationData/TwoSides/ReconstructionTests/copy-06dc7ade-b3cd-425b-8d79-90dde8ef1ac6/persistence/save.sqlite3. Base exclusivamente sintética nueva, reconocida por manifiesto/identidad de archivo/copia/application_id, conservada al cerrar. No producción ni importación.
- Verificación: biblioteca y TwoSides.csproj compilan, cero errores; compilación completa del juego muestra 63 advertencias en código legado/generado, ninguna originada en el adaptador final. 28 comprobaciones nuevas, 43 SQLite y 39 backend aprobadas: total 110, cero fallos finales. Native e_sqlite3 de salida win-x64 cargado sin Godot. 239 archivos protegidos íntegros, .env íntegro.
- Límites: no editor/escenas/exportación, ni recursos/decisiones/progreso reales; runtime Godot no probado. NuGet/SDK/build privados; SDK instalado 10.0.400, ejecutores autocontenidos .NET8.0.30. B00 mantiene riesgo ACL sin cambios.

###### B04.2B.2B — Guardado real e integración con flujo del juego

- Estado: EN_PROCESO; B04.2B.2B.1 cerrada y B04.2B.2B.2A básica completada por interfaz C# sin escena. Etapas posteriores no autorizadas.
- Requiere: catálogo/reglas y recursos aprobados, comandos atómicos de frontera, archivos exactos de cliente/escenas/bootstrap autorizados y pruebas de runtime. No reutilizar la base de infraestructura como perfil del jugador real.

###### B04.2B.2B.1 — Contratos de progreso real

- Estado: COMPLETADA como cierre documental, 2026-10-25, tras decisiones expresas del usuario. Sustituye la preparación PARCIAL/BLOQUEADA anterior; no declara implementación funcional.
- Autorización: análisis/documentación exclusiva de copia de pruebas. Crear REAL_GAME_SAVE_CONTRACT.md, BIOME_PERSISTENCE_MAPPING.md y SAVE_INTEGRATION_CHANGE_PLAN.md; actualizar únicamente PHASES.md, PHASE_HISTORY.md y DECISIONS.md en backend/docs.
- Entregables: inventario de nombres/tipos/iniciales reales, cinco biomas/actores/escenas/recursos, fronteras A–E y límites, contrato transaccional e idempotencia, mapeo de diez tablas, brechas de servicio/formatos y lista exacta condicionada de archivos/pruebas para B.2.
- Decisiones incorporadas: completed terminal y bloqueado por partida desde ambas perspectivas; recursos guardados del último checkpoint válido, sin reset silencioso ni posiciones medias; una decisión por instancia lógica y consecuencias no repetidas; final/historia preservados y nueva partida independiente; solo objetivos/disponibilidad existentes, sin orden nuevo; perfil por instalación/base de copia separada de infraestructura y sin Atlas para continuar.
- Dependencias funcionales explícitas: formato/API de recursos con Ready controlado, consecuencias/clasificaciones/versiones aún no definidas, condiciones exactas del final/desbloqueos no definidos, ruta/propósito de juego y autorización futura. No inventar reglas para resolverlas. B00 conserva riesgo ACL separado.
- Verificación: revisión documental de fuentes/contratos y enlaces/consistencia; inventario de 2,821 archivos protegidos (incluido local-persistence/.work e integración/escenas/assets/backend y tres archivos del almacén sintético duradero) comparado antes/después. .env íntegro. Los110 resultados anteriores permanecen históricos; no se ejecutan runners/build/SQLite/Godot para no modificar archivos/bases protegidos.
- Aceptación documental: seis decisiones y nueve estadísticas B05 reflejadas coherentemente; no hay código/eventos/sincronización implementados. Las110 comprobaciones siguen históricas. Conservar dependencias de final/desbloqueos, como instruyó el usuario; no iniciar implementación.

###### B04.2B.2B.2 — Implementación futura del guardado real

- Estado: EN_PROCESO; solo B04.2B.2B.2A perfil/partidas/historial autorizada y completada. No implica guardado de decisiones/recursos ni bloqueo de biomas.
- Requiere autorizar lista actualizada de archivos/ruta/pruebas y concretar dependencias de las rutas a implementar. Recuperar recursos confirmados del checkpoint necesita extensión versionada y APIs mínimas en cinco jugadores/Estadisticas, sin cambiar daño/consumo/movimiento; exactitud de mundo intermedio no autorizada. Final/desbloqueos sin reglas quedan pendientes.
- La autorización específica A se documenta abajo. El contrato general no concede alcance sobre otras mecánicas, escenas, Autoload o la base sintética actual.

###### B04.2B.2B.2A — Perfil local y partidas iniciales

- Estado: COMPLETADA, 2026-10-25, con la alternativa autorizada de interfaz C# invocable sin escena. Integración visual PENDIENTE: MenuPrincipal entra en flujo de login/recuperación remota y no ofrece punto inequívoco para perfil/nueva partida/historial locales.
- Alcance: perfil/nombre/ID estable, nueva partida transaccional con estado inicial confirmado, activa, carga e historial. Sin decisiones/recursos/final/bloqueo de biomas, B05 o motor Godot.
- Archivos de código existentes modificados: local-persistence/src/DurableTestDatabase.cs.txt, GameSaveService.cs.txt y SQLiteRepository.cs.txt. Nuevos enumerados en plan: OwnedCopyDatabase.cs.txt, CopyGameDatabase.cs.txt, integration/sqlite/GamePersistenceAdapter.cs, RealGameCatalog.cs, run-game-save-checks.ps1 y local-persistence/game-save-tests/{GameSave.Checks.csproj,GameSaveChecks.cs.txt,packages.lock.json}.
- Ruta propia: LocalApplicationData/TwoSides/ReconstructionTests/copy-06dc7ade-b3cd-425b-8d79-90dde8ef1ac6/game-progress/save.sqlite3; propósito copy-game-progress, application_id0x54534743. Destino inicialmente libre, validado por handles; base nueva, manifiesto y lease, sin adoptar infraestructura. La suite conserva perfil ficticio y4partidas, una activa y3archivadas; ninguna eliminada.
- Verificación: compilación biblioteca/ejecutores0errores/0advertencias; Godot C# completo0errores/63advertencias previas. Primera suite49/49, repetición con fixture conservada48/48;43SQLite y39backend aprobadas. Las28infraestructura permanecen históricas, no ejecutadas para preservar base duradera validada.
- Integridad:620archivos protegidos, TwoSides.csproj/project.godot/scripts/escenas/assets/Express/.env y almacén sintético intactos. Original no accedido; no afirmar hash de base original que no se inspeccionó. Sin Atlas ni credenciales remotas.
- Límite: compilar/adaptador invocable no equivale a integración del menú ni juego offline actual; bloqueo visual documentado, sin alterar escenas o gates remotos.

###### B04.2B.2B.2B — Progreso, bloqueo y decisiones ambientales

- Estado: EN_PROCESO. Resultado PARCIAL: núcleo de persistencia/bloqueo/decisiones implementado y validado; disponibilidad real de incompletos BLOQUEADA hasta política local confirmada. No marcar aceptación global completa ni inventar reglas de desbloqueo.
- Autorización: modelos/repositorio/servicio/adaptador/pruebas y documentos ya enumerados en plan, sin modificar juego/escenas/proyectos/menús/Express. Bases duraderas existentes protegidas, sin abrirlas con SQLite.
- Implementado: GetGameProgress/GetBiomeAccess/GetCompletedBiomes, EnterBiome con política explícita, CompleteBiome transaccional, decisiones por instancia lógica (GameId,BiomeId,DecisionKey), clasificación opcional declarada y consecuencias almacenadas sin ejecución. Completed terminal por partida en entrada, ambas perspectivas, actualización de progreso, checkpoint de bioma y ambiente; retry confirmado retorna recibo original.
- Persistencia compatible: human_pending/animal_pending/completed conservados; disponibilidad disponible/no disponible/desconocida separada, jamás concedida por default. IBiomeAvailabilityPolicy es puerto puro de composición confiable, no flag de usuario. Sin política devuelve AVAILABILITY_UNDEFINED y deniega. Política de pruebas solo fixture, no regla real.
- Sin DDL/migraciones ni cambio de SchemaManager. Consecuenciasv1 conservadas; v2 opcional incluye clasificación+versión que aporta llamador. Unicidad lógica comprobada por SQL/repositorio dentro de BEGIN IMMEDIATE y en carga, más PK/UNIQUE/FK existentes; sin índice nuevo ni garantía frente a SQL directo ajeno al servicio.
- Código modificado (7): Models.cs.txt, Validation.cs.txt, GameSaveService.cs.txt, SQLiteRepository.cs.txt, integration/sqlite/GamePersistenceAdapter.cs, local-persistence/game-save-tests/GameSaveChecks.cs.txt y integration/sqlite/run-game-save-checks.ps1. Único archivo fuente nuevo: local-persistence/src/GameRulePolicy.cs.txt, ya previsto en plan.
- Validación final:38escenarios nuevos +43SQLite +39backend=120aprobados,0fallidos finales.37casos preliminares pasaron antes de ampliar fallo real SQLite; no sumarlos como casos distintos. Suites básicas49/48 e infraestructura28 siguen históricas, no repetidas para proteger bases.
- Compilación reconstruida GodotC#:0errores,63advertencias previas,0advertencias nuevas; biblioteca/ejecutores0/0. NativeSQLite3.53.3 y paqueteFolder privado sin referencias duplicadas. Sin motor/editor/export.
- Integridad:624archivos protegidos (incluye dos bases con manifests/leases, SchemaManager, proyectos/scripts/escenas/assets/menús/Express/.env) conservan hash/fecha/listado; cuatro partidas previas intactas. Sin Atlas, credenciales, B05, recursos o conexión visual.
- Pendiente: especificar política real de disponibilidad, composición/escenas autorizadas y evaluador global de final si se solicita. CompleteBiome no calcula final ni crea sucesora. Guardar resultado confirmado no concede acceso. Detener tras esta entrega parcial.

###### B04.2B.2B.2B.1 — Disponibilidad y contratos de tres finales

- Estado: COMPLETADA DOCUMENTALMENTE, 2026-10-25. Implementación de disponibilidad PARCIAL/BLOQUEADA; padre2B no se declara completo.
- Autorización prioriza análisis y permite código solo con evidencia inequívoca de todas las reglas. Inspección encontró RF-021 ordenfijo sin secuencia y protocolo remoto de incompletos disponibles, sin evaluador local. No cumple condición de implementación: no se modificó código ni policydefaultunknown.
- Entregables: separación decisión/avance/fin/bloqueo, cinco biomas/escenas/FinNivel, estados iniciales sin inferir disponibilidad, evidencia contradictoria y preguntas precisas; revisión Final.tscn/Final.cs/EndingService/RF-027/028 sin umbrales inventados, puntos de conexión futura y límites de confianza del servicio.
- Regla vigente: decisión no completa ni bloquea; solo condición real validada completa. Completed terminal por partida de ambas perspectivas prevalece sobre rejuegoRF-021. No sucesión/desbloqueo/fórmulafinal nuevos.
- Documentos autorizados únicos: REAL_GAME_SAVE_CONTRACT, BIOME_PERSISTENCE_MAPPING, SAVE_INTEGRATION_CHANGE_PLAN, DECISIONS, PHASES y PHASE_HISTORY. README/código/build/proyectos/escenas/bases no se modifican.
- Verificación: revisión documental/enlaces y comparación de3,091archivos protegidos con hashes/fechas, ambas bases duraderas/manifests/leases y .env íntegros. Sin conexiones SQLite/build/Godot/Atlas;120tests y63advertencias anteriores son históricos, no nuevas ejecuciones.
- Pendiente para política: conjunto inicial, ordenexacto/evento habilitador si existe, coexistencia/continuidad/selección de incompletos. Pendiente para finales: condición terminal negativa, conjunto requerido, fórmula/umbrales/versiones y operación persistente. Mantener AVAILABILITY_UNDEFINED y B00ACL sin cambios; detenerse sin fase siguiente.
###### B04.2B.2B.2B.2 — Disponibilidad libre y compatibilidad de finales

- Estado global: PARCIAL, 2026-10-25. Policy libre y consulta de cinco completados COMPLETADAS/VALIDADAS; compilación Godot BLOQUEADA por ProjectReference ausente en csproj actual protegido. No corregirlo sin autorización. Auditoría documentada, evaluador exacto de finales pendiente de localizar.
- Nueva decisión definitiva sustituye ordenfijoRF-021: cinco disponibles desde inicio, selección libre de incompletos, sin secuencia. Completed terminal humano/animal por partida, decisión no completa, nueva partida independiente. Default FreeBiomeAvailabilityPolicy aplicado al servicio; unknown solo por política explícita de composición/fixture.
- AreAllCanonicalBiomesCompleted valida cinco IDs únicos de una GameId con completed, readonly/estable entre procesos, cuatrofalse/cincotrue; no finaliza partida, selecciona final o cambia datos. FachadaAsync añadida. SinDDL/migraciones/modelos/formatos nuevos.
- Código modificado4 de plan: GameRulePolicy.cs.txt, GameSaveService.cs.txt, integration/sqlite/GamePersistenceAdapter.cs y game-save-tests/GameSaveChecks.cs.txt. Sin scripts/escenas/menús/proyectos/Express/proveedores/bases protegidas modificados.
- Pruebas42/42progreso(incluye4escenarios nuevos),43/43SQLite y39/39backend=124aprobadas,0fallidas funcionales. Compilación biblioteca/ejecutor0errores/0warnings. Intentos de Godot fallaron35errores de referencias; no confundir12warnings de buildfallido con63warnings históricos. Ningún motor o selecciónfinal ejecutados.
- Finales Bueno/Medio/Malo probados por usuario en demo: conservar mecánica, no fórmula nueva. Cadena Final→EndingService→snapshotGameStateStore y DTOHTTP auditada, sin evaluador numérico localizado en copia/backendactual. Campos/operaciones/futuros tests de equivalencia en contrato.
- Integridad:624archivos protegidos y ambas bases/manifests/leases iguales al baseline, incluidos proyectos/gameplay/Express/SchemaManager/.env. Sin escribir/migrar4partidas existentes, sin Atlas/recursos/B05. Esperar autorización del csproj o siguiente alcance antes de continuar.
###### B04.2B.2B.2B.3 — Reparación mínima de referencia

- Estado: COMPLETADA, 2026-10-25. ProjectReference y CompileRemove añadidos como ItemGroup al csproj, manteniendo estructuraSDK/propiedades originales. Causa de ausencia histórica no determinada, sin atribuciones.
- Validación: GodotC#0errores/63advertenciasprevias/0nuevas; biblioteca0/0;42progreso+43SQLite+39backend=124aprobadas. Carga nativa de salidaGodotwin-x64 devuelve3.53.3 sin motor;83Compileinputs/0internos-tests/1ProjectReference. Dependencias/versiones sin cambios.
- Aislamiento por entorno privado y argumentoGodotProjectDir=integration/sqlite/.work/absoluto; bin/obj delSDK en .work/.godot/mono/temp, biblioteca/cache/temp en local-persistence/.work. Sin nuevos imports o archivos de config.
- Integridad623archivos protegidos y ambasbases/manifests/leases/.env iguales; csproj único cambio funcional autorizado. Original no accedido, no Atlas/Godot/UI/migraciones/recursos/B05.
- Modificados solo csproj y cinco documentos autorizados. Siguiente fase requiere autorización; reparación elimina bloqueo de compilación reportado en2B.2 sin implementar nada más.
## B05 — Estadísticas locales

- Estado: PENDIENTE.
- Objetivo: registrar métricas y cola duradera primero en SQLite.
- Dependencias: B04; resolver P06/P07 y asociación de identidad.
- Archivos permitidos: contratos/documentos en backend; con autorización específica, estadísticas y cola C# del cliente de pruebas y pruebas temporales.
- Archivos restringidos: `.env`, bases existentes, original y componentes ajenos al alcance.
- Entregables: eventos versionados, métricas y estados locales de cola.
- Pruebas requeridas: sesiones, pausas, decisiones, biomas, resultados, atomicidad con progreso y conservación tras reinicio.
- Criterios de aceptación: métricas reproducibles, sin doble conteo ni descarte de pendientes por fallos.

## B06 — Esquema de MongoDB Atlas

- Estado: PENDIENTE.
- Objetivo: definir persistencia remota mínima para identidad y estadísticas.
- Dependencias: B02/B03/B05; resolver P10.
- Archivos permitidos: `backend/src/database/mongodb/`, adaptadores de módulos, pruebas y documentos.
- Archivos restringidos: `.env`, cliente, SQLite, cualquier colección/índice real de Atlas.
- Entregables: esquema, índices propuestos y adaptadores; integración solo con MongoDB desechable previamente autorizado.
- Pruebas requeridas: unicidad, concurrencia, validación, separación de identidades y datos mínimos.
- Criterios de aceptación: ningún guardado remoto, sin datos personales innecesarios y sin modificación de Atlas real.

## B07 — API de sincronización

- Estado: PENDIENTE.
- Objetivo: recibir lotes y confirmar persistencia por evento.
- Dependencias: B03/B05/B06; contrato P07 aprobado.
- Archivos permitidos: `backend/src/modules/sync/`, `statistics/`, composición/rutas pertinentes, pruebas y documentos.
- Archivos restringidos: `.env`, cliente, bases existentes y Atlas real.
- Entregables: API validada, idempotencia y contrato de confirmaciones parciales.
- Pruebas requeridas: duplicados concurrentes, contenido conflictivo, fallo de persistencia, límites, identidad ajena y respuesta perdida.
- Criterios de aceptación: confirmación solo tras persistencia; reenvío no duplica efectos; aislamiento por identidad.

## B08 — Integración con Godot

- Estado: PENDIENTE.
- Objetivo: conectar el cliente con la API sin bloquear la partida.
- Dependencias: B02–B07; aprobación de rutas exactas C# y mecanismo P03.
- Archivos permitidos: documentos/pruebas del contrato backend y archivos C# de red/credenciales/sincronización expresamente autorizados.
- Archivos restringidos: `.env`, original, bases existentes y escenas/assets/configuración de Godot no autorizados.
- Entregables: registro invisible, protección local y trabajador de sincronización cancelable.
- Pruebas requeridas: inicio offline, cambio de perfil, tokens vencidos, timeout, respuestas inválidas y fluidez del juego.
- Criterios de aceptación: solo nombre visible, acceso local autónomo y cero conexión directa a Atlas.

## B09 — Pruebas offline y reconexión

- Estado: PENDIENTE.
- Objetivo: verificar continuidad y entrega idempotente ante fallos.
- Dependencias: B08.
- Archivos permitidos: pruebas/backend y cliente de pruebas previamente autorizados, documentos y fixtures temporales.
- Archivos restringidos: `.env`, datos reales, original y producción.
- Entregables: matriz reproducible de desconexión/reconexión y evidencias.
- Pruebas requeridas: desconexión prolongada, reinicio, caída en cada frontera de confirmación, respuesta parcial, reordenamiento y recuperación de la cola.
- Criterios de aceptación: ningún pendiente perdido, ningún evento contado dos veces y juego utilizable offline.

## B10 — Seguridad e integración

- Estado: PENDIENTE.
- Objetivo: validar protección de identidad, credenciales y datos entre componentes.
- Dependencias: B09 y decisiones técnicas resueltas.
- Archivos permitidos: `backend/tests/security/`, integración, ajustes acotados autorizados, documentos y pruebas de cliente autorizadas.
- Archivos restringidos: `.env`, original, bases reales y despliegues no autorizados.
- Entregables: revisión de amenazas, privacidad, recuperación, límites y correcciones verificadas.
- Pruebas requeridas: suplantación, acceso entre identidades, abuso de registro, replay, rotación, filtración en logs/artefactos y minimización de datos.
- Criterios de aceptación: sin fallos críticos pendientes ni secretos embebidos; riesgos y límites documentados.

## B11 — Validación final

- Estado: PENDIENTE.
- Objetivo: validar el conjunto contra todos los requisitos.
- Dependencias: B00–B10 verificadas.
- Archivos permitidos: documentación y evidencias/pruebas autorizadas; correcciones requieren alcance explícito.
- Archivos restringidos: `.env`, original, bases reales y publicación/despliegue automático.
- Entregables: trazabilidad de R01–R16, informe final y estado de decisiones/fases.
- Pruebas requeridas: regresión completa en entorno de pruebas, offline, reconexión, seguridad e integridad de `.env`.
- Criterios de aceptación: requisitos demostrados, ninguna fase incompleta presentada como terminada, datos originales intactos y limitaciones registradas.

## B04.2B.2B.2C.1 — Preparación de integración real Godot (2026-10-25)

Estado: **COMPLETADA, exclusivamente preparación documental**. No se conectaron escenas ni se implementó runtime. Documentos vigentes: GODOT_RUNTIME_INTEGRATION_PLAN.md (flujo real, HTTP, contratos A–G, recursos, inventario individual y bloqueos), GODOT_SCENE_EVENT_MAPPING.md (cinco recorridos, conexiones reales, decisiones y FinNivel), GODOT_RUNTIME_TEST_PLAN.md (R01–R20, automatización/manual y precondiciones).

Evidencia estática: project.godot UID ddbjf57wpxxoq resuelve a assets/sprites/ui/menu_principal.tscn; Jugar exige sesión y recuperación remota. RegisterScreen solicita Username junto con email/password; no existe entrada de nombre exclusivamente local en ese flujo. Nueva partida actual se crea automáticamente en GameService ante ausencia reconocida; continuar pasa por RecoveryScreen/BiomeMenuAccessGate. La propuesta local separa identidad estable, intención de nueva partida e historial, sin usar esos gates HTTP como autoridad. Transporte remoto se conserva para futuras funciones; no se definió endpoint de estadísticas nuevo.

Cinco biomas canónicos disponibles libremente desde inicio por política local vigente, sin RF-021 secuencial ni repetición de completed. Botones No/Sí → reject/approve → decisión confirmada → información → segmento animal. La decisión persiste consecuencias y animal_pending, no completa bioma. FinNivel.Area2D conecta BodyEntered por código, verifica grupo jugador y guard, difiere FinalizarNivel y coteja NivelActual con escena animal; no valida por sí mismo todos los datos de una futura transacción local. _Ready con modal completion:true,start:false no constituye llegada física. Commit válido de CompleteBiome precederá bloqueo/actualización/navegación; retry conserva UUID e intención, fallo de transición no repite consecuencias.

Recursos identificados: CurrentHealth int/MaxHealth en cinco Player*.cs; Agua/Comida float y flags en Estadisticas, inicializados en Ready; delfín tiene agua inactiva. Captura/hidratación explícita y payload nuevo siguen pendientes, boundary1 no contiene recursos. No restaurar mediante daño/pickup ni regenerar recursos silenciosamente. Vida/agua/comida pertenecen al actor y frontera confirmada; no prometer restauración de mundo intermedio. Calor solo enum sin recurso funcional encontrado.

Finales: se conserva la confirmación del usuario sobre Bueno/Medio/Malo. El recorrido observable obtiene Ending/GoodBiomeCount/EndingRulesVersion de confirmación/GET current, valida en GameStateStore y presenta por EndingService/Final.cs. No se localizó con certeza el evaluador de umbrales dentro de la copia; no se inventó fórmula ni se consultó original/Atlas. AreAllCanonicalBiomesCompleted solo consulta, no calcula ni persiste final. Bloqueos funcionales acotados: evaluador/fixtures auténticas, tabla local de consecuencias verificada, contrato versionado de recursos y fixtures runtime autorizadas distintas de bases protegidas.

Validación de esta fase: lectura estática y comparación de integridad, no tests/compilación/Godot. 42+43+39=124 aprobadas, build 0 errores/63 advertencias y carga nativa son resultados históricos de la fase previa, no reejecutados aquí. Se inventariaron al inicio 1,514 archivos existentes protegidos fuera de las siete rutas documentales autorizadas, excluyendo cachés .work/.godot y node_modules; se comparan hashes/tamaños/fechas antes y después. Ambos almacenes duraderos y sus manifiestos/leases (seis archivos) se verifican por hash/tamaño/fecha, sin abrir SQLite. Cuatro partidas ficticias preservadas por identidad binaria de la base, sin consultas SQL.

.env conserva 278 bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928; fecha, atributos y descriptor de seguridad comparados. No se leyeron valores ni se cambiaron ACL/propietario. B00 sigue BLOQUEADA por discrepancia ACL heredada Modify no resuelta. Se mantienen los cambios previos del usuario presentes en git; no se revierten ni se atribuyen a esta fase.

Alcance de escritura exacto: crear backend/docs/GODOT_RUNTIME_INTEGRATION_PLAN.md, GODOT_SCENE_EVENT_MAPPING.md, GODOT_RUNTIME_TEST_PLAN.md y actualizar backend/docs/PHASES.md, PHASE_HISTORY.md, DECISIONS.md, SAVE_INTEGRATION_CHANGE_PLAN.md. Ningún otro documento, script, escena, csproj, dependencia, esquema o base fue autorizado para modificación. El inventario futuro del plan enumera rutas/clases/responsabilidades/riesgos/pruebas individualmente; no es autorización general sobre directorios.

Recomendación: próxima implementación limitada y expresamente autorizada de composición local, perfil/menú/nueva partida/continuar y selección, con fixtures propias. Resolver requisitos de consecuencias/recursos/finales antes de conectar esas rutas; no anunciar offline completo mientras quede un gate remoto indirecto. No motor, Node, Atlas, migraciones, integración funcional ni B05 en esta fase. Detenerse y esperar instrucciones.

## B04.2B.2B.2C.2A — Perfil y partidas en menú local (2026-10-25)

Estado: **implementación y validación automatizada terminadas; PENDIENTE DE VALIDACIÓN RUNTIME (EN_PROCESO)**. No se ejecutaron editor ni videojuego. Esta actualización sustituye las propuestas de C.1 únicamente para composición/perfil/partidas/admisión a selección; decisiones desde escenas, FinNivel, recursos y finales siguen sin conectar. No se inició B05.

Ampliación expresa aprobada en esta conversación: base nueva y separada `local-persistence/.work/runtime-game/save.sqlite3` y cambios mínimos en `local-persistence/src/CopyGameDatabase.cs.txt` y `OwnedCopyDatabase.cs.txt`. Las rutas AppData game-progress y persistence permanecen protegidas; ninguna se abre desde el modo runtime. No se importan las cuatro partidas ficticias ni se copian sus perfiles. El almacén runtime aún NO se ha creado/abierto durante esta validación; se inicializará al primer inicio manual. Su ubicación dentro de .work es duradera para este flujo y no debe borrarse como caché.

GameApplicationContext._Ready compone un único GamePersistenceContext hijo del Autoload existente. No crea ApiClient, journal user://, servicios de autenticación, ConnectivityOverlay ni OceanDecisionContext en el inicio local. El código HTTP se conserva en una rutina privada no invocada, pendiente de sincronización futura; Services remoto no está inicializado en este modo. No hay cuenta técnica, tokens, correo ni contraseñas nuevos. VariablesGlobales y ambiente permanecen intactos.

LocalGameState usa un puerto ILocalMenuStore implementado por GamePersistenceAdapter. Inicialización coalescida, apertura serial en worker, perfil/partida/revisión y resultados controlados, sin Node en el worker. Solo crea perfil por intención de guardar nombre y partida por intención de nueva partida; volver al menú o reiniciar la proyección no genera registros. UUID/op/payload se conservan durante reintento; fallo de lectura no equivale a ausencia. No hay sustitución volátil ni fallback HTTP.

MenuPrincipal crea LocalProfileView desde código porque la escena existente no tiene nombre ni Continuar. Se reutiliza su contenedor y se oculta el botón de textura ambiguo; la vista aprobada muestra guardar nombre, nueva partida y continuar según estado. No se modifica .tscn. Nombre NFC validado por servicio; perfil existente se recupera, no se vuelve a solicitar. No existe función de renombrar en el menú: no se añadió; UpdateDisplayName previo conserva su contrato y pruebas.

Nueva partida relee la actual y utiliza PrepareNewGame/CreateNewGameAsync con ExpectedCurrentGameId/Revision; confirma en diálogo si hay una activa, archiva sin borrar e inicializa cinco biomas disponibles libremente. No muestra éxito hasta commit y relectura. Reintentar respuesta perdida recupera recibo sin duplicar. Continuar relee SQLite y solo admite la frontera de menú v1 reconstruible de una partida current/in_progress con owner/revisión coherentes. Una frontera de segmento que necesita restauración no implementada se bloquea con mensaje y no se reinicia. Navegación fallida conserva el commit y permite reintentar Continuar.

MenuNiveles admite el ticket local y muestra selección existente + aviso y volver al menú. TarjetaNivel no se modifica: al no existir controller remoto en modo local, las tarjetas permanecen deshabilitadas como límite de esta subfase, NO como una política de disponibilidad persistida. Los cinco siguen disponibles en dominio/SQLite; el aviso explica que la entrada a biomas se conectará después. No se permite entrar a escenas cuyas decisiones todavía exigen el flujo remoto. El juego completo offline aún no está implementado ni validado. Conectar tarjetas/controlador a escenas corresponde a la siguiente autorización, B04.2B.2C.2B según la solicitud.

Proveedor runtime: ruta exacta cerrada, purpose copy-runtime-game, application_id 0x54535254, manifest con identidad de archivo/Ready y lease existentes, esquema existente sin DDL nuevo. Se reutilizan comprobaciones de propiedad/final-path/reparse/hardlink; desconocidos fallan sin adoptar ni migrar. La capacidad runtime se ancla en la raíz exacta local-persistence, validando su handle y cada descendiente. Sus ancestros OneDrive/Desktop tienen metadatos reparse de nube observados; no se relajan las comprobaciones de archivos/raíz/descendientes ni el modo AppData legado. Verificación de apertura duradera y comportamiento del motor queda pendiente de la prueba manual; no se afirma que las fixtures temporales validen ese montaje real.

Resultados efectivos finales: **26 pruebas nuevas de menú + 42 progreso + 43 SQLite + 39 backend = 150 aprobadas, 0 fallidas** (sin sumar repeticiones). Las 26 usan coordinador real + servicio/UoW/repositorio/SQLite real en SyntheticSandbox y puerto de almacenamiento de fixture, con fallos inyectados; comprueban también que el adaptador runtime real rechaza la ruta protegida ANTES de acceso. No ejecutan nodos/UI/Godot ni crean datos en la base runtime. Reinicio del menú se prueba con nuevas instancias del coordinador sobre fixture; no se presenta como reinicio real del motor. Las regresiones de progreso incluyen comprobación de lectura en proceso hijo sobre fixture.

Biblioteca y ejecutores: 0 errores/0 advertencias. Godot C#: compilación correcta, 0 errores, 63 advertencias preexistentes ParallaxBackground en compilación de scripts, 0 nuevas atribuibles a esta fase; build final de scripts 63 advertencias preexistentes y 0 nuevas (un build incremental anterior emitió 0). MSBuild: 86 Compile items, 1 referencia a la biblioteca y 0 fuentes filtradas desde local-persistence o integration/sqlite/.work. .NET de pruebas 8.0.30, SQLite 3.53.3, paquetes/esquema/csproj del juego sin cambios. Entorno/build privados mediante preámbulo de run-infrastructure y GodotProjectDir a integration/sqlite/.work/.godot/mono/temp; sin editor/export/configuración global.

Verificación: **1,506 archivos existentes protegidos** fuera del inventario de cambios comparados por tamaño/hash/fecha, ambos almacenes protegidos con sus seis archivos (DB/manifiesto/lease) intactos. Cuatro partidas conservadas por identidad binaria de game-progress, sin consultas SQL. .env 278 bytes, SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, fecha/atributos/propietario/ACL iguales; no se leyeron valores. B00 sigue BLOQUEADA por riesgo ACL heredado Modify, sin cambios de permisos. Cero bases sintéticas temporales restantes.

Próximo paso: pruebas manuales acotadas abajo, y después autorización explícita de integración de tarjetas/biomas. No conectar decisiones, FinNivel, recursos o finales por extensión de esta entrega.


## B04.2B.2B.2C.2A.1 — Menú compacto y partida única (2026-10-26)

**Código COMPLETADO; PENDIENTE DE VALIDACIÓN RUNTIME del diseño y botones.** Esta decisión del usuario sustituye expresamente la política anterior que permitía archivar/reemplazar una partida incompleta por una intención de Nueva partida. Las descripciones anteriores se conservan como historia, no como regla vigente.

El usuario confirmó por prueba manual de C.2A: inicio sin Node.js, nombre visible sin credenciales, creación/continuación de partida, persistencia del perfil tras reinicio y ausencia de errores SQLite observados. Esa confirmación no valida el layout ni la restricción añadidos aquí. No se ejecutó Godot/editor/exportación durante C.2A.1.

### Diagnóstico y corrección visual

Centro era un CenterContainer con anchor_left=0.23, top=0.41, right=0.48, bottom=0.61 y offsets right=190/bottom=151. En el viewport lógico 640×360 su región comenzaba en y=147.6 y acababa en y=370.6, ya fuera del límite inferior incluso antes del crecimiento mínimo de los controles. La nueva vista de perfil y acciones aumentó ese mínimo; márgenes interiores de25 y mensajes largos agravaban el recorte.

Se conservan la escena, fondo, título dibujado TWO SIDES, imágenes, texturas y StyleBoxTexture originales. Centro ahora usa anclajes completos y márgenes exteriores x=8, superior72/inferior8 para reservar el título; el contenedor resuelve centrado del tablero sin los antiguos offsets de colocación parcial. Margen pasa a12 horizontal/8 vertical; Contenido usa separación6. LocalProfileView aplica fuente12 a sus controles,11 al estado, separación4 y ancho mínimo260 para envolver mensajes. El nombre permanece visible también ante mensajes transitorios. No se añadió contenedor ni pantalla, no se escaló/reemplazó ningún sprite ni se cambió project.godot o la resolución.

Revisión **ESTÁTICA**, no medición del motor: región disponible de Centro x8/y72/ancho624/alto280 en640×360 → x16/y144/ancho1248/alto560 a1280×720, borde inferior704 dentro de720. El tamaño mínimo final de panel/controles y la ausencia de recortes/solapamientos reales requieren prueba manual; no se presentan como pruebas visuales aprobadas.

### Política transaccional y comportamiento

GameSaveService.HasUnfinishedGames consulta todo el historial del perfil mediante COUNT, sin paginación que pueda omitir un registro antiguo. En CreateNewGame se repite la comprobación dentro de UnitOfWork.Write/BEGIN IMMEDIATE, después de validar propietario y antes de insertar. Devuelve **GAME_IN_PROGRESS** si hay cualquier partida no cerrada. Se retiró el bloque que archivaba automáticamente la actual. No se alteran tablas, migraciones, esquema ni partidas existentes.

Reconocimiento conservador de cierre: únicamente status=completed junto con Ending good/medium/bad, EndingRulesVersion no nula e igual a RulesVersion y CompletedAt no nulo. is_current para completed ya es0 por CHECK existente. Status archived NO demuestra cierre, incluso si no hay partida actual; status in_progress/final_pending bloquea siempre. Esos campos son el contrato del futuro escritor confiable, no prueba criptográfica del origen de un archivo manipulado. No se los asigna en producción desde esta fase, no se agrega endpoint/cierre y no se reconoce un final por mayoría, consulta de biomas o apertura de menú.

El recibo idempotente existente sigue consultándose antes de ejecutar una intención nueva: mismo OperationId/digest recupera su resultado confirmado; no autoriza una segunda partida. UUID distintos concurrentes tienen un solo ganador. Un conflicto nuevo no convierte un error en éxito; el coordinador descarta esa intención rechazada y relee el estado, mientras los errores de resultado incierto conservan la intención para retry.

GamePersistenceAdapter expone HasUnfinishedGamesAsync. LocalGameState consulta la política desde SQLite y expone CanStartNewGame; LocalProfileView deshabilita Nueva partida si existe una sin cerrar. MenuPrincipal elimina el diálogo de reemplazo y rechaza esa acción con mensaje breve. Perfil y partida mantienen identidad al renombrar; no se añade interfaz de renombrado.

| Estado persistido | Nueva partida | Continuar |
|---|---|---|
| Perfil válido, sin partidas sin finalizar | Habilitada | No disponible si no hay activa |
| Activa in_progress en frontera de menú compatible | Bloqueada | Habilitada para la misma partida |
| Archivada sin cierre, sin actual | Bloqueada | No disponible; mensaje de partida sin finalizar, sin reparar historial |
| Solo historial completed con metadatos de cierre válidos | Habilitada | No disponible |
| Error SQLite/política no confirmada | Bloqueada | No se inventa progreso ni fallback |
| Activa que requiere restauración aún no soportada | Bloqueada | Transición limitada con mensaje; no reset de recursos |

Si la base manual tiene históricos incompletos de la política anterior, también bloquearán nuevas creaciones. No se consultó su contenido ni se migró/corrigió/borró nada para resolver ese caso.

### Contrato futuro de finalización global, sin implementarlo

Cinco biomas completos es una precondición del flujo de final, no una orden de cerrar. El coordinador futuro deberá validar partida/dueño/revisión, los cinco completed, evaluador existente y versiones, y resultado auténtico Bueno/Medio/Malo; preparar/persistir final pendiente sin habilitar Nueva partida. Tras el evento real de presentación/confirmación del resultado, una operación idempotente y transaccional aún por diseñar confirmará status=completed, is_current=0, Ending/EndingRulesVersion/CompletedAt, revisión/snapshot coherentes y recibo. Solo entonces HasUnfinishedGames podrá permitir otra, si no quedan históricos sin cerrar. Fallo de escritura no cierra; reapertura no repite efectos. No se ha identificado/validado aquí ese evento ni se modificaron fórmulas, Final.cs, FinNivel o escenas finales. AreAllCanonicalBiomesCompleted sigue siendo solo consulta.

### Pruebas y compilación efectivas

**35 menú/política +42 progreso/decisiones +43 SQLite =120 comprobaciones C# aprobadas,0 fallidas.** No sumar repeticiones. Incluyen primera creación, persistencia de nombre/perfil, Nueva/Continuar, rechazo directo del servicio, historial archivado incompleto sin actual, estado terminal de fixture que permite otra, misma intención concurrente, intenciones distintas concurrentes, nuevo proceso de lectura que conserva bloqueo, renombrado y fallo SQLite/rollback/retry. El coordinador usa puerto de fixture con servicio/UoW/repositorio/SQLite reales; no son pruebas de nodos/UI Godot.

Las fixtures históricas que necesitaban una segunda partida se adaptaron a un registro terminal explícito creado SOLO en bases sintéticas propias. SeedTerminal es setup de pruebas por SQL, no API de cierre del producto, ni evidencia de que un final haya sido presentado. El caso de cinco biomas completos comprueba además que Nueva partida se sigue rechazando sin cierre. Se conserva la cobertura de idempotencia, decisiones, bloqueo por bioma y rollback; una prueba antigua de reemplazo se actualizó para exigir rechazo, conforme la regla nueva. El ejecutor duradero histórico sin argumentos quedó deshabilitado con mensaje/exit2 para evitar escrituras accidentales a AppData y expectativas de reemplazo obsoletas; usar --runtime-menu y --progress, nunca modificar las bases protegidas para adaptar pruebas.

Comandos: local-persistence/run-checks.ps1; dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore --disable-build-servers -nodeReuse:false y ejecutor --runtime-menu/--progress bajo entorno CLI/NuGet/TEMP privado; Godot C# con GodotProjectDir a integration/sqlite/.work/.godot/mono/temp. Biblioteca y ejecutores0errores/0advertencias; Godot C#0errores,63advertencias históricas ParallaxBackground,0nuevas en componentes afectados. .NET8.0.30/SQLite3.53.3 y paquetes sin cambios. Las39 pruebas backend son históricas de C.2A, no reejecutadas: Node.js no se inició en esta subfase.

### Integridad y pendientes

Se comparan antes/después **1,512 archivos existentes protegidos** fuera de los16 archivos autorizados de esta corrección, por hash/tamaño/fecha. Se protegen las TRES bases: dos AppData anteriores y la runtime manual, cada una con manifiesto y lease, nueve archivos totales. Solo hashes/metadatos; no se abrió SQLite ni se inspeccionó perfil/progreso manual. .env278bytes/SHA2564DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, fecha/atributos/propietario/ACL conservados. B00 sigue BLOQUEADA por riesgo ACL heredado Modify, sin cambiar permisos. Esquema, recursos gráficos, configuración global, mecánicas, decisiones, audio, biomas, tarjetas, jugadores, NPC y tres finales permanecen intactos. WASAPI/GetBufferSize/output_device invalidated se considera incidencia de audio separada; no se alteró código de audio ni se reprodujo mediante motor.

Prueba manual pendiente: compilar esta copia en Godot C# bajo control del usuario, abrir a1280×720 y revisar título/fondo/panel completo, nombre, mensajes y controles, también con nombre largo. Con la partida manual existente, Nueva partida debe estar deshabilitada; Continuar debe abrir la misma selección aún sin entrada a biomas. Volver/cerrar/reabrir debe mantener nombre y bloqueo, sin nueva partida ni pérdida de datos. No forzar un cierre ni limpiar la base para probar el estado terminal: esa condición solo está cubierta con fixture sintética hasta autorizar su implementación. No ejecutar automáticamente editor/videojuego.

Código completado, visual **PENDIENTE DE VALIDACIÓN RUNTIME**. Siguiente bloque recomendado: autorización específica de tarjetas/selección de los cinco biomas, manteniendo orden libre y controles de partida; no conectarlo ahora. Cierre global legítimo sigue pendiente de su evento real. Detenerse aquí, sin B05.


## B04.2B.2B.2C.2B — Selección local de los cinco biomas (2026-10-26)

**COMPLETADA EN CÓDIGO. Validación visual y del motor: PENDIENTE.** Reanudación expresamente autorizada tras comprobar que .env vuelve a coincidir con la referencia histórica, sin reemplazo realizado por Codex en esa última comprobación. La causa de las diferencias anteriores no se atribuye a ningún proceso. La referencia original no cambió. B00 mantiene su riesgo ACL independiente.

El usuario confirmó manualmente la fase anterior: menú completo a1280×720, Nueva partida bloqueada cuando hay activa, Continuar abre selección, bloqueo persistente al reiniciar y sin nuevos errores SQLite. Esa evidencia no se presenta como prueba de las tarjetas recién conectadas. No se ejecutó Godot/editor/exportación en esta fase.

### Causa y archivos exactos

La selección anterior había dejado deliberadamente las tarjetas sin controlador local. MenuNiveles detenía su procesamiento y mostraba aviso de integración pendiente; TarjetaNivel todavía consultaba BiomeCardController remoto, sin sesión/progreso remoto inicializados en modo local. Se elimina esa autoridad de la ruta de selección, no se elimina el código HTTP del proyecto.

Modificados exclusivamente:
1. scripts/MenuNiveles.cs — admisión local, refresh de disponibilidad, entrada asíncrona, mensajes, retorno y transición validada.
2. scripts/TarjetaNivel.cs — eventos existentes Pressed, identificación canónica, destino exportado validado, estados/texturas existentes y llamada local.
3. integration/sqlite/LocalGameState.cs — puerto ILocalBiomeStore y coordinador puro LocalBiomeSelection/DTOs en el archivo autorizado; acceso a selección desde fronteras v1 reconocidas.
4. integration/sqlite/GamePersistenceAdapter.cs — implementa ILocalBiomeStore mediante sus métodos ya existentes de lectura y EnterBiome.
5. local-persistence/game-save-tests/GameSaveChecks.cs.txt — despacho --biome-selection y probe readonly de fixture.
6. local-persistence/game-save-tests/RuntimeMenuChecks.cs.txt — puerto de fixture para selección y expectativa actualizada: volver a selección desde frontera humana confirmada no equivale a restauración de recursos.
7. local-persistence/game-save-tests/BiomeSelectionChecks.cs.txt (nuevo) —30 comprobaciones sobre SQLite sintética y navegación simulada.

Documentos actualizados exactamente7: backend/docs/GODOT_RUNTIME_INTEGRATION_PLAN.md, GODOT_SCENE_EVENT_MAPPING.md, GODOT_RUNTIME_TEST_PLAN.md, PHASES.md, PHASE_HISTORY.md, DECISIONS.md y local-persistence/README.md. No se modificaron .tscn, project.godot, TwoSides.csproj, proveedores, esquema, GameSaveService ni ningún script ambiental, decisión, FinNivel, final, personaje, NPC, animación o audio. Contratos restantes consultados sin editarlos.

### Correspondencia y señales

La escena existente scenes/levels/menu_niveles.tscn permanece intacta. Se reutilizan sus nodos y recursos:

| Nodo / Nivel | ID canónico | Entrada humana existente |
|---|---|---|
| GridContainer/TarjetaOceano /0 | ocean | res://scenes/levels/DesicionDelfin.tscn |
| GridContainer/TarjetaSelva /1 | jungle | res://scenes/levels/DesicionMono.tscn |
| GridContainer/TarjetaDesierto /2 | desert | res://scenes/levels/DesicionRataCanguro.tscn |
| GridContainer/TarjetaBosque /3 | forest | res://scenes/levels/DesicionZorro.tscn |
| GridContainer/TarjetaTundra /4 | tundra | res://scenes/levels/DesicionNieve.tscn |

TarjetaNivel._Ready conserva Pressed += OnPressed y _ExitTree lo desconecta. No hacen falta señales serializadas nuevas. OnPressed → MenuNiveles.EnterLocalBiomeAsync → LocalBiomeSelection.EnterAsync → GamePersistenceAdapter.GetActiveGameAsync/GetBiomeAccessAsync/EnterBiomeAsync/GetGameProgressAsync → GameSaveService/UnitOfWork/SQLite. BiomeFor y HumanSceneFor son catálogo cerrado verificado contra los5 exports reales de .tscn; ResourcePath exportado debe coincidir antes de permitir el clic. No se acepta una ruta arbitraria desde datos guardados.

### Protocolo local

MenuNiveles exige el ticket local de selección, crea un coordinador por instancia y carga disponibilidad por lectura asíncrona. No consulta SessionManager, autenticación, endpoints o backend. GamePersistenceAdapter conserva la capacidad runtime existente; tests inyectan únicamente capacidad sintética propia. El puerto de selección no expone creación de perfil/partida, decisiones, completion, recursos o HTTP.

Antes de escribir, se comprueban dueño/partida activa esperada, is_current/in_progress, bioma válido, disponibilidad y etapa humanas, snapshot boundary v1 válido y existencia de la escena canónica. EnterBiome se confirma con OperationId estable, owner/GameId/revisión/BiomeId/perspectiva humana. Se valida recibo (operación, tipo, dueño, partida y revisión), se relee el agregado vigente y se verifica frontera/etapa antes de navegar. No hay nueva partida ni perfil, no se completan biomas y no se registran decisiones al entrar.

La frontera human_decision ya confirmada para ese bioma se reconoce por lectura y no vuelve a llamar EnterBiome. Si se elige un bioma humano distinto, el EnterBiome existente guarda el nuevo destino lógico y revisión según su contrato, sin cambiar decisiones o estado terminal de otros biomas. No se sobrescribe un snapshot de formato desconocido ni se reescribe la frontera al repetir la entrada al mismo bioma. No se persiste avance de párrafos del diálogo ni recursos.

La transición utiliza Transicion.CambiarEscenaValidadaAsync existente (o ChangeSceneToFile si no hay gestor), con callbacks en hilo principal. No hay I/O SQLite dentro del fundido. Se verifica que el menú siga vivo, ticket vigente y plan vigente antes del cambio; el ticket se consume solo después de aceptar la escena. Abandonar el menú invalida el coordinador y sus resultados tardíos. El adaptador serializa trabajo en worker sin pasar Node/SceneTree.

Un bloqueo Interlocked cubre lectura, escritura y toda la navegación; doble clic y otra tarjeta concurrente no generan otra entrada o transición. Errores de escritura devuelven código controlado y no navegan; incertidumbre de resultado conserva comando/UUID para retry. Si hubo commit pero falló navegar, el punto confirmado permanece; al reintentar la misma entrada se navega desde él sin otra revisión/escritura. Conflicto de revisión exige recargar; no se aplica una revisión vieja a otra partida. No hay rollback silencioso de un commit, ni alternativa HTTP.

### Estados y límites de continuación

Disponibles: tarjetas humanas canónicas interactivas, cinco desde inicio y sin orden. En progreso humano: frontera human_decision reconstruible, interactiva para reabrir desde el inicio de esa decisión, sin reenviar elecciones. La actividad se deriva del progreso/etapa/punto de continuación del servicio existente; no se agregó una columna ni un indicador global de progreso.

Completado: Activity=completed, tarjeta deshabilitada, tooltip discreto «Bioma completado», resultado y texturas existentes conservados. La validación del servicio sigue rechazando ambas perspectivas. Los otros incompletos no se bloquean por completar uno. Se mantienen las imágenes ya asignadas, sin recursos externos ni rediseño de la escena.

Animal_pending/decision_info/animal_start: se muestra el estado conocido, pero la entrada a esa perspectiva se rechaza con RESUME_UNSUPPORTED hasta disponer de captura/hidratación real de recursos. No se usa la escena inicial animal como falsa restauración ni se vuelve a la decisión humana confirmada. La selección puede abrirse desde una frontera v1 reconocida para elegir otro bioma humano; eso NO restaura automáticamente al actor ni modifica la decisión anterior.

Límite importante del alcance: estas entradas son las escenas humanas actuales. Su código de confirmar decisiones aún conserva el flujo legado y puede mostrar mensajes de autenticación/contexto faltante al intentar elegir. No se lo conectó ni se habilitó un servidor como alternativa; poder abrir las cinco entradas no significa que el recorrido animal/completion/final offline completo ya funcione. Tampoco se añadieron botones a escenas humanas. Para probar las cinco entradas por ahora, se puede detener/reabrir el juego entre ellas y volver por Continuar a selección.

### Pruebas y compilación

**30 selección +35 menú/partida única +42 progreso/decisiones +43 SQLite =150 comprobaciones C# aprobadas,0fallidas**, sin sumar repeticiones. Son resultados nuevos de esta fase, diferentes de los150 históricos que incluían backend. No se inició Node.js ni se ejecutaron las39 pruebas backend ahora.

Las30 nuevas cubren los5 biomas como primera elección, correspondencia real .tscn/ID/escena, orden inverso, ID desconocido, partida inexistente/archivada/finalizada, completed en ambas perspectivas, otros disponibles, frontera humana sin escrituras repetidas, continuación animal bloqueada sin replay, doble clic, concurrencia, rollback, respuesta perdida, escena inexistente, fallo/excepción de navegación tras commit, error de lectura, revisión obsoleta, invalidación antes/durante lectura, snapshot desconocido intacto, lectura/reentrada humana readonly en proceso nuevo, independencia histórica y ausencia de referencias HTTP/Mongo/Godot en coordinador/ejecutor puro.

Fixtures nuevas bajo local-persistence/.work/databases/<UUID> y limpieza solo de sus archivos propios. Los estados terminales usados por pruebas se preparan exclusivamente en esas fixtures: no equivalen a ejecutar un final del videojuego ni a una API nueva de cierre. Navegación simulada permite inspeccionar que el commit preceda al callback; no prueba señales, fundido ni presentación en el motor. Cero bases temporales sintéticas restantes. No se abrió SQLite sobre las3 bases protegidas.

Biblioteca y ejecutores:0errores/0advertencias; tests en .NET8.0.30 y SQLite3.53.3. Godot C#:0errores,63advertencias históricas ParallaxBackground y0nuevas atribuibles a los4 archivos. MSBuild:86fuentes,1ProjectReference a biblioteca,0fuentes filtradas desde local-persistence o integration/sqlite/.work. Godot.NET.Sdk4.6.1/net8.0/referencia/paquetes sin cambios. Cachés/CLI/TEMP/NuGet privados; --no-restore, sin instalaciones ni ejecución del motor.

Comandos ejecutados, con el entorno privado del preámbulo de integration/sqlite/run-infrastructure.ps1 (sin invocar sus modos duraderos):
- dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore --disable-build-servers -nodeReuse:false -v:q
- local-persistence/.work/bin/GameSave.Checks/Debug/net8.0/win-x64/GameSave.Checks.exe --biome-selection
- mismo ejecutor --runtime-menu y --progress
- local-persistence/run-checks.ps1
- dotnet build TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -p:GodotProjectDir=<raíz absoluta integration/sqlite/.work/> -v:q

### Integridad y aislamiento

Inventario previo y posterior: **1,514 archivos existentes protegidos** fuera de los14 archivos autorizados y .env, con digest/hash/tamaño/fecha comparados. Incluye todas las escenas, finales, lógica ambiental, controles no autorizados, esquema/proveedores, paquetes y configuración. Se comparan además hash/tamaño/fecha de las3 bases existentes y sus manifiestos/leases:9archivos, todos intactos. Las cuatro partidas ficticias y el progreso manual se preservan por igualdad binaria, sin consultas SQL ni migraciones.

.env se verifica SOLO por tamaño y SHA-256 antes/después, separado de compilaciones/pruebas:278bytes y4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928. No se cargan valores, no se consulta ni modifica ACL/propietario/fecha y no se usa como configuración. La coincidencia resuelve el bloqueo de contenido para esta reanudación, no el riesgo ACL pendiente de B00. No se accedió al original, al archivo recuperado del escritorio o a Atlas.

### Validación manual pendiente y siguiente fase

1. Compilar esta copia en Godot C# bajo control del usuario; la compilación automatizada privada no actualiza por sí sola la caché habitual del editor. No iniciar Node.js.
2. Menú → Continuar → selección: comprobar5 tarjetas iniciales habilitadas sin secuencia, mismas imágenes, mensajes y volver al menú.
3. Pulsar cada tarjeta y comprobar la escena humana de la tabla. Si no hay retorno desde esa escena, detener/reabrir el juego y usar Continuar para probar otra; debe mantenerse la misma partida y perfil.
4. Reabrir el mismo bioma humano: retoma la frontera inicial del diálogo confirmada, sin prometer párrafo/posición/recursos exactos. No debe crear otra partida ni mostrar una falsa finalización.
5. Probar doble clic y observar una sola transición. Si ocurre fallo de navegación, reintentar el mismo bioma sin borrar datos. Estado completed/animal pendiente se valida con fixtures automáticas: no editar la base manual para fabricarlo.
6. No interpretar como fallo de selección el flujo de decisión todavía no conectado; no probar completion o finales como parte de esta aceptación. Registrar separadamente mensajes de audio si aparecen.

Registrar resultados/capturas sin secretos. Motor/visual/perfiles y navegación real de las5 tarjetas permanecen **PENDIENTES DE VALIDACIÓN RUNTIME**. Siguiente autorización recomendada: conectar confirmación local de decisiones y su transición informativa, con contrato explícito de ambiente/frontera; recursos, FinNivel y finales requieren sus bloques posteriores. No iniciarlos ahora. Detenerse al finalizar, sin B05.


## B04.2B.2B.2C.2C — Decisiones locales: implementación parcial (2026-10-26)

**Guardado y confirmación de las cinco decisiones IMPLEMENTADOS EN CÓDIGO. Resultado general PARCIAL por continuidad jugable animal bloqueada fuera del alcance. Validación RUNTIME PENDIENTE.** No declarar la fase completa mientras siga el guard remoto de entrada animal. Se conserva la validación manual del usuario de C.2B: cinco tarjetas/destinos humanos correctos, doble clic sin duplicación y sin nuevos errores observados. Esa prueba no valida estos cambios.

### Inventario y opciones existentes

Antes de editar código se registró el inventario en GODOT_RUNTIME_INTEGRATION_PLAN.md. Cambios de código exactamente3:
- scripts/DecisionSceneFlow.cs — punto compartido de confirmación de los cinco diálogos; reemplazo de HTTP por sesión local y proyección del ambiente confirmado.
- integration/sqlite/LocalGameState.cs — puerto ILocalDecisionStore, DTO LocalDecisionConfirmation y coordinador puro LocalDecisionSession en el archivo autorizado; fábrica ligada al perfil/partida de la aplicación.
- integration/sqlite/GamePersistenceAdapter.cs — implementa ese puerto mediante GetActiveGameAsync y RecordDecisionAsync ya existentes.

Pruebas: local-persistence/game-save-tests/GameSaveChecks.cs.txt (despacho --decisions y --decision-probe) y nuevo DecisionIntegrationChecks.cs.txt. Documentos exactamente7: backend/docs/GODOT_RUNTIME_INTEGRATION_PLAN.md, GODOT_SCENE_EVENT_MAPPING.md, GODOT_RUNTIME_TEST_PLAN.md, PHASES.md, PHASE_HISTORY.md, DECISIONS.md y local-persistence/README.md. No se editaron contratos restantes, .tscn, scripts particulares de diálogos, DecisionNivel, VariablesGlobales, InfoDecision, biomas, actores, NPC, recursos, FinNivel, AnimalSegmentFlow, Final, proveedores, esquema, servicio de dominio, project.godot o TwoSides.csproj.

| Bioma / decisión estable | Escena y script responsables | No / Sí, evento y resultado existentes | Información y destino animal |
|---|---|---|---|
| ocean / ocean_waste_disposal | DesicionDelfin.tscn; OceanDecisionNivel→EnvironmentalDecisionNivel→DecisionNivel | BotonBuena/OnBotonBuenaPressed(true), rechaza vertido→healthy; BotonMala/OnBotonMalaPressed(false), aprueba→degraded | info_delfin_buena/mala.tscn → bioma_mar.tscn |
| jungle / jungle_transport_route | DesicionMono.tscn; EnvironmentalDecisionNivel(BiomeId=jungle) | Mismos eventos true/false; rechazar/aprobar vía por selva→healthy/degraded | info_mono_buena/mala.tscn → bioma_selva.tscn |
| desert / desert_cat_abandonment | DesicionRataCanguro.tscn; EnvironmentalDecisionNivel(BiomeId=desert) | Mismos eventos; rechazar/aprobar abandono de gatos→healthy/degraded | info_rata_buena/mala.tscn → bioma_desierto.tscn |
| forest / forest_industrial_pesticides | DesicionZorro.tscn; EnvironmentalDecisionNivel(BiomeId=forest) | Mismos eventos; rechazar/aprobar pesticidas→healthy/degraded | info_zorro_buena/mala.tscn → bioma_bosque.tscn |
| tundra / tundra_fossil_extraction | DesicionNieve.tscn; scenes/levels/DesicionNieve.cs | Callbacks propios delegan ChooseAsync(true/false); prohíbe/aprueba plataforma fósil→healthy/degraded | info_buena/mala.tscn → bioma_nieve.tscn |

Las rutas de escenas de la tabla están bajo scenes/levels/. Cada pareja informativa mantiene sus UID/rutas serializadas y EscenaSiguiente; no se reescribieron. EnvironmentalDecisionService.OptionFor existente ya convierte true/No a reject y false/Sí a approve. Se reutiliza únicamente esa función estática, sin instanciar servicio remoto, HTTP o sesión. DecisionCatalog.ForBiome proporciona las keys existentes; el catálogo local existente las valida otra vez al guardar.

Evidencia de resultado absoluto: DecisionNivel.Decidir(bool saludable,...) ya contiene BiomaSaludable=saludable; los callbacks enviaban true a información buena y false a mala. Tundra documenta explícitamente plataforma prohibida/saludable y aprobada/degradada. Se conserva ese resultado del diálogo, no se deriva una fórmula de finales ni se aplica un umbral nuevo. LocalDecisionSession recibe el resultado resuelto del llamador y solo lo serializa/valida; no contiene un evaluador ambiental. Classification permanece null, ConsequencesVersion1: no se añade favorable/perjudicial ni una puntuación por el nombre del botón.

### Confirmación, persistencia y memoria

DecisionSceneFlow captura una única elección cuando el diálogo permite decidir. Valida que el dueño sea la escena humana actual y que corresponda al bioma; exige almacenamiento local inicializado y utiliza el perfil/GameId actuales, sin crear otros. El coordinador consulta el agregado activo por SQLite, comprueba owner/GameId/is_current/in_progress, bioma no completado y frontera human_decision o decision_info del bioma correcto. Verifica que exista la escena informativa seleccionada antes de guardar.

Comando RecordDecision: OperationId y DecisionId UUIDv4 reservados una vez por intención; LocalPlayerId, GameId, ExpectedRevision, BiomeId, DecisionKey, OptionId, ResolvedEnvironment y ConsequencesJson={stateKind:resultado}. No se llama CompleteBiome. El servicio/UoW existente guarda atómicamente decisión/orden/consecuencias, EnvironmentalState.LastDecisionId/StateKind, HumanCompletedAt, etapa animal_pending, revisión/snapshot decision_info y recibo. Result de bioma y Ending no se fijan al decidir.

Tras un commit satisfactorio se verifica el recibo (tipo decision/IDs/revisión), se relee el agregado activo y se cotejan decisión, estado ambiental, referencia LastDecisionId y etapa. Solo entonces el punto autorizado de DecisionSceneFlow asigna VariablesGlobales.BiomaSaludable al valor confirmado. No se dispara daño, pickups, consumo, spawns, contadores ni lógica de recursos; los scripts ambientales existentes consumen ese bool al cargar. No se modifica una variable ambiental antes del commit.

SQLite y memoria Godot NO forman una transacción atómica. Estrategia explícita: intención inmutable→commit SQL→relectura/verificación→proyección absoluta del bool→navegación informativa. Un fallo previo al commit no proyecta ambiente ni navega. Una escritura confirmada permanece aunque falle la presentación. La proyección absoluta es idempotente; el coordinador recuerda el OperationId ya proyectado y no vuelve a aplicarlo al reintentar navegación en esa instancia. Una sesión nueva restaura el valor absoluto desde lectura, sin volver a ejecutar RecordDecision ni efectos incrementales. No se anuncia restauración de mundo/actor por asignar ese bool.

Se mantienen callbacks, textos/tweens y destinos informativos existentes. La transición usa Transicion.CambiarEscenaValidadaAsync y confirma escena viva/plan vigente; con gestor ocupado espera el intervalo ya usado, sin I/O en callback del fundido. Sin gestor usa ChangeSceneToFile y verifica resultado. Espacio reintenta la misma opción si el guardado/transición falló; el diálogo sigue bloqueando una segunda elección incompatible. No hay fallback HTTP.

### Idempotencia y recuperación

La instancia lógica sigue siendo (GameId,BiomeId,DecisionKey). Si ya existe la misma opción y consecuencia, se devuelve su registro e IDs originales sin RecordDecision nuevo. Otra opción o resultado incompatible se rechaza como DECISION_CONFLICT. Si dos sesiones compiten con la misma opción, la perdedora de revisión/instancia relee el ganador y adopta ese resultado, sin sobrescribir; opciones distintas tienen un solo ganador.

Ante rollback se retiene exactamente el comando, UUIDs, payload y ExpectedRevision para retry. Ante respuesta perdida pero registro durable presente se reconoce ese registro antes de proyectar; no se genera otro UUID ni se reenvía la consecuencia. Un recibo conocido se conserva durante reintentos en memoria. En recuperación desde un proceso nuevo el resultado devuelve registro/OperationId/estado y Receipt=null: no se inventa un recibo ni se deduce su revisión original de la revisión actual. La fila local_operations del commit permanece; no se implementa otra consulta SQL en el adaptador.

Doble clic en el diálogo queda serializado por el flow y el coordinador Interlocked; una transición exitosa no se repite para la misma operación. Un error después del commit conserva el recibo/registro; reintentar la navegación no aumenta revisión, decision_order ni número de decisiones y no vuelve a proyectar en la misma sesión. Bioma completed o partida archivada/finalizada no aceptan nuevas elecciones/proyecciones. Reiniciar antes de un commit pierde una intención solo en memoria; una nueva intención explícita se evalúa contra el agregado durable, sin inventar un journal nuevo.

### Bloqueo animal fuera del alcance y autorización pendiente

Las parejas InfoDecision conservan su paso al animal. Sin embargo, **FinNivel._Ready** detecta falta de Services/sesión remota y llama AnimalSegmentFlow.Open(completion:true,start:false). Con Services nulo, Open pausa SceneTree y retorna. En las cinco escenas animales ese guard está presente. No se ejecutó el motor para atribuirle una observación runtime nueva: el bloqueo se deduce del código.

Por esa dependencia protegida no se puede declarar «segmento animal jugable offline» ni continuidad completa en esta fase. No se introducen sesiones falsas, no se construye el backend antiguo y no se evita el guard por una variable global. Se preservan las mecánicas en los archivos excluidos.

Autorización necesaria posterior: revisar de forma específica scripts/FinNivel.cs únicamente en su guard de entrada y scripts/AnimalSegmentFlow.cs en los requisitos de contexto/bloqueo local. Esto debe separarse de conectar CompleteBiome y de modificar física/objetivos; no se hizo aquí. Hasta entonces la implementación general queda PARCIAL aunque las cinco decisiones se guardan localmente y el paso informativo está conectado. Tampoco se altera la política de selección que bloquea reentrada animal sin un checkpoint de recursos soportado.

### Finales y restauración futura

Persisten por partida los IDs/opciones/orden/consecuencias, estado ambiental y vínculo de la decisión, versiones existentes de reglas/contenido y fecha humana. Esos son insumos para la futura restauración de resultados; no se añadieron acumuladores, pesos, umbrales ni clasificación numérica. Los resultados Bueno/Medio/Malo confirmados por el usuario permanecen sin modificar. El cálculo exacto sigue sin localizar con certeza en la copia permitida; no se buscó original/Atlas.

Los recursos/vida/agua/comida, posiciones, timers, fuentes agotadas y checkpoints animales no se capturan ni restauran. Recuperar una decisión en una prueba readonly demuestra persistencia y ausencia de replay, no continuación exacta del animal en Godot. La equivalencia definitiva de finales tras cerrar/continuar exige restauración ambiental completa y evaluador existente identificado; queda pendiente. No se cierra globalmente la partida ni se habilita una segunda por decidir.

### Pruebas y compilación efectivas

**30 nuevas decisiones +30 selección +35 menú/partida única +42 progreso/decisiones +43 SQLite =180 comprobaciones C# aprobadas,0 fallidas**, sin contar repeticiones ni las39 pruebas backend históricas. No se inició Node.js/Atlas.

Las30 nuevas incluyen ambas opciones de cada bioma (10), opción/key inválidas, mismo resultado sin escritura/proyección/transición duplicadas, conflicto por otra opción, recuperación en sesión nueva y proceso hijo readonly, doble clic, rollback/retry con mismos UUIDs, intento de cambiar elección pendiente, respuesta perdida, escena faltante, navegación fallida, completed, archivo, otro GameId, lectura fallida, sesión invalidada, concurrencia igual/distinta y ausencia de dependencias HTTP/Mongo/Godot en el coordinador/ejecutor puro. Se usa GameSaveService/UoW/repositorio/SQLite real sobre fixtures propias y callbacks simulados de memoria/navegación. No se presenta la simulación como ejecución de señales o VariablesGlobales reales en el motor; ese orden se inspeccionó en el script y se valida manualmente después.

Las regresiones se ejecutaron sobre fixtures nuevas de local-persistence/.work/databases/<UUID>, sin tocar bases existentes. Comandos: build --no-restore de GameSave.Checks.csproj; ejecutor --decisions, --biome-selection, --runtime-menu, --progress; local-persistence/run-checks.ps1. El probe --decision-probe solo acepta el namespace UUID de fixture ya existente, abre readonly y no invoca RecordDecision.

Biblioteca y ejecutores0errores/0advertencias, .NET8.0.30 y SQLite3.53.3. Godot C#0errores,63advertencias históricas ParallaxBackground y0nuevas en los3 archivos. Entorno CLI/NuGet/TEMP privado, GodotProjectDir a integration/sqlite/.work/.godot/mono/temp; sin restore/actualización de paquetes. Referencia existente única a la biblioteca; no se cambió proyecto/framework. No editor, motor ni exportación ejecutados. Cero bases sintéticas temporales restantes.

### Integridad

Se comparan antes/después **1,517 archivos protegidos** fuera de los12 archivos de esta fase y .env: hashes/tamaños/fechas, incluidos todos los scripts particulares de diálogos, escenas/animales/recursos, FinNivel/AnimalSegmentFlow/Final, configuración, esquema y servicio/repositorio. Tres bases existentes +manifiestos/leases=9archivos protegidos, intactos por comparación binaria/metadatos, sin abrir SQLite ni migrar/limpiar/reinicializar ninguna. Se preservan las cuatro partidas ficticias y progreso manual sin consultar sus contenidos.

.env verificado únicamente por tamaño y SHA-256 antes/después:278bytes,4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928. No valores, credenciales, uso como configuración ni cambios a propietario/ACL/fecha. B00 mantiene el riesgo ACL pendiente. No se accedió a proyecto original ni servicios externos.

### Guía manual acotada y siguiente paso

1. Compilar esta copia en Godot C# bajo control del usuario y abrir sin Node.js. Usar la misma partida, Continuar y una tarjeta humana disponible.
2. Terminar el diálogo y elegir No o Sí. Debe confirmarse el guardado local antes de mostrar la información correspondiente, sin solicitud de login para guardar.
3. Un doble clic debe producir una sola información/decisión. Si falla la transición, Espacio reintenta el mismo resultado; no elegir otra opción ni crear otra partida como reparación.
4. La decisión debe dejar el bioma animal_pending, no completed; la prueba automatizada cubre este estado sin editar la base manual.
5. Al avanzar desde información a animal existe el bloqueo remoto de FinNivel descrito arriba: puede quedar pausado. No forzarlo, no simular sesión ni interpretar esa pausa como guardado fallido. Validación de jugabilidad animal queda bloqueada hasta autorización específica.
6. Después de reiniciar, la decisión se conserva; no prometer reentrada animal/recursos desde selección ni equivalencia de finales aún. No cambiar datos manuales para fabricar completed o restablecer opciones.

La prueba manual de las dos opciones de cada bioma requiere fixtures/runtime autorizado apropiado, no borrar la elección ya confirmada del usuario. El estado vigente es PARCIAL por continuidad animal, RUNTIME PENDIENTE. Recomendar resolver el guard local de entrada con alcance explícito y luego los bloques de restauración/completion; no iniciarlos ni B05. Detenerse aquí.

## B04.2B.2B.2C.2C.1 — Entrada animal local (2026-10-26)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** Este apartado actualiza el estado vigente; los registros anteriores conservan su valor histórico. El usuario autorizó expresamente ampliar la navegación mínima a MenuNiveles.cs, TarjetaNivel.cs y LocalGameState.cs para abrir la entrada animal original de un bioma ya decidido y preparar el ambiente antes de instanciarla.

Diagnóstico: FinNivel._Ready exigía Services/autenticación/progreso remotos aunque el contexto local mantiene Services nulo. La llamada antigua a AnimalSegmentFlow.Open pausaba el árbol y, sin Services, retornaba antes de crear el aviso. El texto «Confirmación pendiente. El juego permanece detenido.» existe en el modal remoto, pero no demuestra por sí solo el origen exacto del «Pendiente» observado por el usuario. animal_pending es un estado SQLite legítimo después de decidir, no evidencia de pérdida. La selección además rechazaba ese estado por restauración animal no soportada; ahora permite únicamente volver a su entrada original. No se consultó la partida manual para diagnosticar datos.

FinNivel._Ready suscribe la señal original y espera ValidateLocalEntryAsync. El lector ILocalAnimalStore solo expone GetLocalProfileAsync/GetActiveGameAsync: valida propietario/perfil, partida actual in_progress, GameId, bioma canónico y pertenencia, animal_pending no completed, decisión confirmada, vínculo LastDecisionId, consecuencias persistidas coherentes y snapshot de frontera soportado. Conserva Decision.OperationId como referencia a la operación original (FK del esquema existente); no fabrica un recibo ni vuelve a ejecutar RecordDecision. Los fallos se presentan localmente y mantienen detenido el ingreso, con reintento de lectura o retorno al menú. No hay fallback HTTP en el modo local.

Las cinco escenas animales originales se seleccionan por mapa canónico. La navegación consulta nuevamente SQLite y prepara el valor absoluto BiomaSaludable antes de cargar/instanciar la escena: reject/No → healthy; approve/Sí → degraded. Solo asigna si difiere, sin consecuencias acumulativas. El guard en _Ready solo compara el ambiente preparado; no lo modifica tarde después de inicializar actores/visuales. Una entrada directa con ambiente incoherente se rechaza y pide volver a la tarjeta. Una decisión confirmada puede recuperarse aunque CurrentBiomeId señale otro bioma; no se modifica snapshot, revisión ni decisión al reentrar.

La tarjeta indica «Abrir entrada animal original. No recupera posición, vida, agua ni comida». Se mantienen escenas, actores, NPC, animaciones, recursos y scripts ambientales originales. Esto no equivale a restauración exacta de una sesión animal. Los métodos FinNivel._ExitTree, OnBodyEntered y FinalizarNivel permanecen idénticos al registro previo. No se llama CompleteBiome, no se marca completed ni se cierra la partida. Si la llegada física o un reinicio llaman al modal antiguo, el modo local devuelve LOCAL_OPERATION_UNSUPPORTED y permite volver al menú; no realiza operaciones remotas. Finalización y reinicios persistentes requieren otra fase.

Archivos de producción modificados: scripts/FinNivel.cs, scripts/AnimalSegmentFlow.cs, integration/sqlite/LocalGameState.cs, integration/sqlite/GamePersistenceAdapter.cs, scripts/MenuNiveles.cs y scripts/TarjetaNivel.cs. Pruebas: GameSaveChecks.cs.txt, RuntimeMenuChecks.cs.txt, BiomeSelectionChecks.cs.txt y el nuevo AnimalEntryChecks.cs.txt bajo local-persistence/game-save-tests. Documentación: únicamente los siete documentos autorizados.

Validación reejecutada: **29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite =209 comprobaciones aprobadas, cero fallidas**. Las nuevas cubren ambos ambientes de los cinco biomas, ausencia de perfil/partida/decisión, IDs incorrectos, completed, fallos de lectura, vínculo/estado/snapshot inválidos, reintentos sin escritura, preparación previa, cuatro decisiones recuperables y reinicio en proceso hijo readonly. Son SQLite sintético y callbacks de navegación; no ejecución del motor ni prueba real de desconexión de red. El puerto puro carece de dependencias HTTP/Mongo/Godot. No se ejecutó Node.js, editor/motor Godot ni Atlas.

Comandos locales: dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore; ejecutor GameSave.Checks.exe con --animal-entry, --decisions, --biome-selection, --runtime-menu y --progress; local-persistence/run-checks.ps1. Fixtures propias UUID en local-persistence/.work/databases, con limpieza controlada por los ejecutores. No ejecutar el modo durable por defecto sobre AppData. Compilación completa TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild con GodotProjectDir dirigido a integration/sqlite/.work/: cero errores, las63 advertencias históricas ParallaxBackground y ninguna en los seis archivos modificados. Biblioteca/ejecutor: cero errores y advertencias. CLI, paquetes y temporales aislados; sin restaurar paquetes ni cambiar proyecto/framework.

Integridad: comparación antes/después de 1,513 archivos protegidos (tamaño, SHA-256 y fecha) y los nueve archivos de las tres bases, manifiestos y leases: sin diferencias. No se abrió ninguna base protegida mediante SQLite. Se conserva el progreso manual de cuatro decisiones sin inspeccionarlo. .env se verifica separadamente solo por tamaño/SHA-256:278bytes y 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928; no se utiliza en compilaciones/pruebas. No se modifican ACL/propietario; el riesgo ACL de B00 sigue pendiente.

Guía manual (pendiente, a cargo del usuario): abrir esta copia en Godot C# sin Node.js; continuar con el mismo perfil y partida; seleccionar una tarjeta ya decidida y comprobar su entrada animal original, personaje y ambiente confirmado sin login ni confirmación de servidor. Probar ambos ambientes solo donde existan decisiones válidas, sin cambiar las cuatro decisiones ni reinicializar bases. Volver a selección y abrir otro bioma decidido: debe usar su propio ambiente. Confirmar que no se promete recuperar posición/recursos. Al llegar físicamente al final o solicitar reinicio, esperar el aviso local de operación pendiente de implementar; no exigir completed ni forzarlo en SQLite.

Siguiente trabajo recomendado, solo con nueva autorización: validar ingreso en Godot y luego diseñar/integrar finalización física local y continuidad de recursos/reinicios. No se conectan finales, no se inicia B05. Trabajo detenido al finalizar esta subfase.

## B04.2B.2B.2C.2C.2 — Retorno al menú local (2026-10-26)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** El usuario informa 7/8 comprobaciones manuales correctas de C.2C.1: continuar, entrada animal, personaje, ambiente, decisión no repetida, ausencia de pausa de entrada y de errores nuevos. El fallo restante es la recuperación remota al volver desde pausa. Estos resultados manuales son reportados por el usuario.

Causa exacta en código: MenuPausa.IrMenuNiveles llamaba ChangeSceneToFile("res://scenes/auth/recuperacion_partida.tscn"). RecoveryScreen._Ready obtenía Services remoto; Render usaba HasSession para mostrar Login, deshabilitaba Continuar y presentaba servicio no disponible con Services nulo. No prueba pérdida de progreso ni fallo de RecordDecision. La escena no solicita HTTP automáticamente en Ready, pero sus acciones de recuperación/login pertenecen al controlador remoto. MenuPrincipal ya recarga SQLite y no requería cambios.

Archivos C# modificados: assets/sprites/ui/MenuPausa.cs, scripts/auth/RecoveryScreen.cs e integration/sqlite/LocalGameState.cs. Los tres figuran en el plan de integración (pausa/salida, recuperación local y proyección local). Se reutilizan las consultas existentes de GamePersistenceAdapter sin modificarlo. Pruebas: nuevo local-persistence/game-save-tests/MenuReturnChecks.cs.txt y selector --menu-return/--menu-return-probe en GameSaveChecks.cs.txt. Solo se actualizan los siete documentos técnicos habituales; sin .tscn ni controladores globales.

Flujo corregido: Volver al menú usa LocalMenuReturn, bloquea doble clic y acciones de pausa concurrentes, refresca SQLite, comprueba el mismo perfil y la misma partida activa, invalida únicamente el permiso de selección en memoria y navega a res://assets/sprites/ui/menu_principal.tscn. No crea, archiva ni completa partidas; no invoca RecordDecision ni CompleteBiome. El menú principal existente vuelve a leer SQLite, muestra Continuar y mantiene Nueva partida bloqueada por la partida sin finalizar. Continuar prepara la selección de cinco biomas; el flujo de C.2C.1 conserva las entradas animales y su preparación ambiental previa.

Pausa: abrir/cerrar mantiene su comportamiento existente; se impiden cambios durante un retorno en curso. Tras confirmar la consulta se quita SceneTree.Paused antes de navegar y se oculta el panel; al salir se desconectan sus señales. Si falla la consulta o la navegación, se conserva/restaura la pausa previa y el panel muestra un error local reintentable. El callback verifica vida del nodo para no volver a pausar otra escena tras una salida concurrente. Sin contexto local no se redirige a login. Una entrada accidental a RecoveryScreen con contexto local oculta login/logout/recuperación remota y vuelve al menú principal local; si falla esa navegación permite reintentar allí, sin tocar SQLite ni usar Services.

**220 comprobaciones C# aprobadas, cero fallidas:** 11 nuevas de retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Cubren retorno y continuación con ambos ambientes, mismos IDs/decisiones/revisión/hash, fallo SQLite y recuperación, navegación fallida/excepción, doble clic, almacén cerrado, retornos repetidos, ausencia de partida y proceso hijo readonly. Las pruebas usan SQLite sintético bajo local-persistence/.work/databases/<UUID> y callbacks de pausa/navegación; no ejecutan señales, escenas ni el motor Godot. No se presenta como una prueba real de desconexión de internet: el flujo local inspeccionado no invoca servicios HTTP. Apertura/cierre visual de pausa y redirección real de RecoveryScreen requieren comprobación manual.

Comandos: dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore; ejecutor --menu-return, --animal-entry, --decisions, --biome-selection, --runtime-menu y --progress; local-persistence/run-checks.ps1. El probe nuevo solo acepta la ruta UUID sintética verificada por ReadOnlyFixture. Compilación completa TwoSides.csproj con --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild y GodotProjectDir dirigido a integration/sqlite/.work/: cero errores, 63 advertencias históricas ParallaxBackground y cero nuevas. Biblioteca y ejecutor: cero errores y advertencias. CLI/paquetes/temporales privados, sin restore ni cambio de proyectos. No se ejecutaron Node.js, Godot ni Atlas.

Integridad antes/después: 1,519 archivos protegidos conservan tamaño, SHA-256 y fecha; incluye FinNivel completo, cinco biomas, actores, escenas, finales, GamePersistenceAdapter y configuración. Las tres bases protegidas y sus manifiestos/leases (9 archivos) permanecen idénticos, sin abrirlas mediante SQLite; se conserva la partida manual sin consultar contenido. .env se comprueba por tamaño/hash separadamente de compilaciones y pruebas: 278 bytes, SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928. No se leen valores ni se modifica contenido, propietario o ACL. El riesgo ACL de B00 sigue pendiente. Cero archivos SQLite sintéticos restantes.

Guía manual: en esta copia, continuar la partida existente y abrir un bioma decidido; abrir pausa, reanudar y comprobar movimiento; abrir pausa otra vez y pulsar Volver al menú (también doble clic). Debe abrir el menú principal local sin login ni Recuperar partida remoto, sin pausa residual, con Continuar disponible y Nueva partida bloqueada. Continuar debe mostrar los cinco biomas; abrir otro ya decidido y verificar su propio ambiente antes de jugar. Repetir después de cerrar/abrir el juego y sin internet, sin cambiar decisiones ni borrar bases. No bloquear ni corromper la base real para probar errores: esos casos están cubiertos con fixtures.

Pendientes: validar este flujo en Godot; restauración exacta de posición/vida/agua/comida, reinicios, CompleteBiome y finales continúan fuera de alcance. El aviso local de finalización/reinicio aún no implementados de C.2C.1 permanece. No se modifica FinNivel ni su finalización física. No se inicia B05. Trabajo detenido al terminar esta subfase.

## B04.2B.2B.2C.2C.3 — Reinicio del segmento animal (2026-10-26)

**COMPLETADA EN CÓDIGO; PERSONAJE, RECURSOS Y OBJETOS PENDIENTES DE VALIDACIÓN RUNTIME.** El usuario confirma las nueve comprobaciones manuales de C.2C.2, incluido retorno local, continuar, ambiente y persistencia tras cerrar Godot. Ese resultado corresponde a la fase anterior, no valida el reinicio nuevo.

Causa exacta del aviso: MenuPausa.ReiniciarNivel llamaba AnimalSegmentFlow.Open(completion:false, reason:"voluntary"); su rama local devolvía LOCAL_OPERATION_UNSUPPORTED, cuyo texto indicaba finalización/reinicio aún no implementados. No era una decisión ausente ni un error de credenciales.

Archivos de producción modificados, previstos en el plan: assets/sprites/ui/MenuPausa.cs (ReiniciarNivel), scripts/AnimalSegmentFlow.cs (RestartLocalAsync/RestartMessage y bloqueo durante reinicio) e integration/sqlite/LocalGameState.cs (coordinador puro LocalAnimalRestart y mensaje genérico de operación aún no disponible). GamePersistenceAdapter no requiere cambios: se reutilizan ILocalAnimalStore y sus consultas existentes. Pruebas: nuevo AnimalRestartChecks.cs.txt y selector --animal-restart/--animal-restart-probe en GameSaveChecks.cs.txt, bajo local-persistence/game-save-tests. Solo se actualizan los siete documentos habituales.

Flujo: el botón reserva la intención para impedir doble clic/acciones concurrentes. El coordinador resuelve el bioma exclusivamente desde la escena animal canónica actual; ReadAnimalEntryAsync valida perfil, misma partida activa, pertenencia del bioma, animal_pending no completed, decisión/consecuencias y frontera soportada. Se verifica/carga el PackedScene original sin instanciarlo y se relee SQLite para rechazar cambios de revisión/decisión/ambiente durante la preparación. No se utiliza una escena humana ni una ruta arbitraria.

Después de esas comprobaciones, el puente prepara BiomaSaludable como estado absoluto confirmado (No/reject/healthy o Sí/approve/degraded), asignándolo solo si difiere; libera SceneTree.Paused y llama ChangeSceneToPacked. Esto crea una instancia nueva del segmento original, no reutiliza el árbol animal vivo ni llama ReloadCurrentScene sin contexto. El guard de entrada existente valida nuevamente SQLite y el ambiente preparado. La salida del menú anterior desconecta señales y libera su pausa. Un fallo de SQLite o destino no modifica el nivel ni su pausa; si falla el cambio de escena se restaura el valor ambiental anterior y la pausa previa, con error local reintentable en el mismo panel. Los callbacks comprueban que el nodo/escena sigan vigentes.

No hay escrituras de progreso durante el reinicio: no RecordDecision, EnterBiome, CompleteBiome, nuevos UUID/recibos, creación/archivo/cierre de partidas ni cambios de disponibilidad, historial u otros biomas. No se crea un checkpoint persistente ni una nueva captura de recursos. Los recibos originales permanecen intactos. La muerte y la llegada física conservan sus rutas actuales, aún no implementadas localmente; esta fase conecta únicamente Reiniciar desde pausa. El mensaje genérico de operación pendiente evita afirmar que el botón nuevo sigue sin implementar.

Inicialización observada en los scripts existentes: los cinco Player*.cs definen MaxHealth=3 y _Ready asigna CurrentHealth=MaxHealth; Estadisticas define AguaMax=100 y ComidaMax=100 y _Ready copia ambos máximos. No se encontraron overrides de esos máximos en las escenas animales/personajes inspeccionadas; el delfín tiene ActivarAgua=false y se conserva así. No se agregan números al código de reinicio: la instancia nueva consume los exports reales. FuenteRecurso conserva _dropeados/_jugadoresDentro por instancia; ItemRecurso tiene _recogido/timers por instancia. Personaje, fuentes, ítems, enemigos y obstáculos vuelven a su configuración original al recrear el árbol; su resultado visual/físico no se afirma validado sin motor. Los métodos ambientales existentes configuran visibilidad/procesamiento/partículas desde el bool absoluto, sin volver a registrar una consecuencia acumulativa.

Entradas originales observadas, coordenadas locales del personaje en las escenas sin editar:

| Bioma | Escena | Personaje | Posición |
|---|---|---|---|
| ocean | bioma_mar.tscn | PlayerDelfin | (25,458) |
| jungle | bioma_selva.tscn | PlayerMono | (79,176) |
| desert | bioma_desierto.tscn | PlayerRataCanguro | (209,478) |
| forest | bioma_bosque.tscn | PlayerZorro | (342,184) |
| tundra | bioma_nieve.tscn | PlayerOso | (571,191) |

**241 comprobaciones C# aprobadas, cero fallidas:** 21 nuevas de reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las21 cubren diez combinaciones bioma/opción, fallo SQLite, destino ausente/humano, completed, partida ausente, decisión ausente, doble clic, retry de navegación, cambio de contexto durante preparación, cuatro ambientes independientes y proceso hijo readonly. Se comprueban hash completo de fixture, revisión, decisiones, ambientes, biomas y referencia a operación/recibos preservados. CompleteBiome aparece únicamente como preparación explícita de una fixture sintética terminal para probar rechazo; no existe en la ruta de reinicio de producción.

Los ejecutores usan bases propias en local-persistence/.work/databases/<UUID>; cero archivos SQLite sintéticos restantes. Las proyecciones de ambiente, pausa y navegación automatizadas son callbacks, no ejecución Godot ni verificación de recursos/colisiones reales. El flujo de producción inspeccionado no usa HTTP, .env ni credenciales; no se simula una sesión remota ni se afirma una prueba real de corte de red.

Comandos: build --no-restore de local-persistence/game-save-tests/GameSave.Checks.csproj; ejecutor --animal-restart, --menu-return, --animal-entry, --decisions, --biome-selection, --runtime-menu y --progress; local-persistence/run-checks.ps1. El probe nuevo solo admite ReadOnlyFixture con ruta UUID sintética verificada. Compilación completa TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild con GodotProjectDir hacia integration/sqlite/.work/: cero errores,63 advertencias históricas ParallaxBackground,ninguna nueva. Biblioteca y ejecutor: cero errores/advertencias. Entorno CLI/paquetes/temporales privado; sin restore ni cambios de proyectos. No se ejecutaron Godot, Node.js ni Atlas.

Integridad antes/después: 1,520 archivos protegidos conservan tamaño/SHA-256/fecha; incluye escenas, cinco biomas, personajes/NPC, recursos, animaciones, FinNivel completo, finales, GamePersistenceAdapter, configuración y rutas de retorno local. Las tres bases protegidas y sus manifiestos/leases (9 archivos) permanecen idénticos, sin abrirlas con SQLite. .env:278bytes,SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928,comprobado separadamente antes/después, sin consultar valores ni usarlo en compilación/pruebas. Propietario/ACL no modificados; riesgo ACL de B00 pendiente. No se accede al proyecto original.

Guía manual: continuar la misma partida, abrir un bioma ya decidido, avanzar desde el inicio, recibir daño y consumir recursos; observar/usar una fuente y algún objeto/enemigo. Pausa → Reiniciar, también doble clic: debe aparecer una única escena animal original, en su entrada, sin diálogo humano, login o recuperación remota, con ambiente confirmado y juego sin pausa residual. Comprobar vida máxima real, agua/comida máximas donde estén activas, fuentes/objetos/enemigos/timers reiniciados y ausencia de señales duplicadas/errores. Repetir en los cinco biomas y con los ambientes disponibles, sin cambiar decisiones ni borrar bases para fabricar opciones. Volver al menú, confirmar misma partida/Nueva partida bloqueada y repetir tras cerrar/abrir Godot y sin internet. Fallos SQLite/destino se prueban solo con fixtures, no dañando la base manual.

Pendientes: validación runtime de posición, recursos y objetos; checkpoints persistentes/continuación exacta, muerte, CompleteBiome y finales en fases independientes autorizadas. No se modifica FinNivel ni su llegada física; no se inicia B05. Trabajo detenido al terminar C.2C.3.

## B04.2B.2B.2C.2C.4 — Game Over y retorno directo a niveles (2026-10-26)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** El usuario informa 9/10 comprobaciones manuales satisfactorias de C.2C.3: reinicio de posición/vida/agua/comida/objetos/enemigos en los cinco biomas, ambiente conservado, sin repetir decisión/login ni pausa residual. La ausencia de errores nuevos de consola no fue confirmada; no se interpreta como un error SQLite demostrado ni como una validación completa de esta fase.

Causas exactas: assets/sprites/ui/GameOver.cs, Reintentar → AnimalSegmentFlow.Open(completion:false,reason:"death") → rama local LOCAL_OPERATION_UNSUPPORTED. VolverMenu del mismo controlador todavía abría recuperacion_partida.tscn. MenuPausa.IrMenuNiveles abría el menú principal local conforme a C.2C.2; la instrucción actual sustituye expresamente ese destino por la selección de niveles. Las cinco escenas incluyen game_over.tscn y MenuPausa.tscn. Los cinco personajes llaman GameOver.MostrarDerrota; ZonaMuerte difiere MostrarGameOver para no cambiar el flujo dentro del evento físico. Esa lógica de muerte no se altera.

Cambios de producción: assets/sprites/ui/GameOver.cs, assets/sprites/ui/MenuPausa.cs, scripts/AnimalSegmentFlow.cs e integration/sqlite/LocalGameState.cs. Están previstos en el plan de integración (GameOver, pausa/salida, flujo animal y contexto de navegación). GamePersistenceAdapter, MenuNiveles y TarjetaNivel se inspeccionan pero no requieren cambios. Pruebas: nuevo local-persistence/game-save-tests/GameOverNavigationChecks.cs.txt y selector --game-over-navigation en GameSaveChecks.cs.txt. Se actualizan únicamente los siete documentos habituales. No se editan escenas, diseño visual, botones, actores, recursos, VariablesGlobales, biomas, FinNivel ni Final.cs.

GameOver.Reintentar ahora espera AnimalSegmentFlow.RestartLocalAsync, el mismo puente y LocalAnimalRestart de Pausa → Reiniciar, sin una segunda implementación del reinicio. Mantiene MostrarDerrota, su fundido, botones originales y sus conexiones C#. Se reserva _saliendo durante la operación; se comprueba validez del nodo tras await antes de volver a tocar controles. El callback de fin de tween también comprueba IsInstanceValid y se conserva Kill/desconexión en _ExitTree. SQLite confirma misma partida/bioma, decisión/consecuencias y ambiente, rechaza completed y resuelve la escena animal original. El ambiente absoluto se prepara antes de instanciar; se libera la pausa y la nueva escena utiliza su posición, vida/recursos y objetos iniciales existentes. No se vuelve al humano ni se repiten consecuencias acumulativas.

Pausa → Menú y Game Over → Menú comparten AnimalSegmentFlow.ReturnToLevelsLocalAsync → LocalMenuReturn.ReturnToSelectionAsync. Destino canónico verificado: **res://scenes/levels/menu_niveles.tscn**. Se verifica/carga su PackedScene, se refresca la misma partida desde SQLite y se crea el permiso de selección mediante PrepareSelectionAsync antes de navegar. Se libera la pausa, se cambia de escena y se retira la interfaz anterior. La selección recibe un permiso válido, mantiene sus cinco tarjetas y consulta disponibilidad mediante los servicios existentes: un bioma decidido incompleto abre su animal y su ambiente; solo completed queda bloqueado. No se pasa por bienvenida, perfil, login ni recuperación. El método ReturnAsync histórico se conserva para usos de menú principal ajenos a estos dos botones; sus11 pruebas siguen siendo regresión de esa API, no una afirmación del destino vigente de pausa.

Abandono animal: se mantienen decisiones, consecuencias, partida y recibos, sin guardar posición ni recursos intermedios. Al volver al animal se abre su entrada original con inicialización real de escena, igual que el reinicio aprobado. No hay RecordDecision, EnterBiome, CompleteBiome, creación/archivo/cierre de partida ni cambios de historial/disponibilidad en estas salidas.

Errores: fallos de lectura, contexto o navegación dejan la escena anterior y su pausa; un fallo al abrir selección invalida su permiso temporal y permite reintentar la consulta. El puente comprueba vida de nodo/escena antes de callbacks para no tocar otra escena ni volver a pausarla tras su salida. El coordinador bloquea transición doble; _saliendo bloquea acciones cruzadas del mismo panel. Los errores usan el aviso local ya existente en pausa; Game Over utiliza TooltipText de los botones existentes y GD.PushWarning, sin añadir controles ni cambiar el diseño. Una escena animal ausente incluye su ruta canónica en el mensaje; el destino de selección ausente también se informa. No hay fallback HTTP ni partida temporal.

Revisión estática de consola: se inspeccionaron referencias locales/remotas, inicialización, señales/tween, pausa, nodos liberados y cola/disposición SQLite. Las dos rutas corregidas no llaman Services ni abren recuperación/login; el adaptador conserva serialización y errores controlados al cerrar recursos. Se añadió la comprobación de validez del callback tween de Game Over. No se diagnostican ni se declaran resueltos errores no aportados por el usuario. Si aparecen al probar, solicitar las líneas completas de consola y su traza (sin secretos), indicando si ocurrieron al morir, reintentar o volver a niveles. No asumir origen SQLite.

**260 comprobaciones C# aprobadas, cero fallidas:**19 nuevas de Game Over/navegación +21 reinicio +11 retorno histórico +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las19 cubren los cinco animales/ambos resultados, ambos orígenes de retorno, estado de las cinco tarjetas y reentrada animal, fallo SQLite/retry, navegación fallida/permiso invalidado, doble clic, completed, escena faltante con ruta, partida ausente y conexiones C# inspeccionadas sin rutas remotas. Se verifica hash completo de fixtures y conservación de revisión/decisiones/ambientes/otros biomas/partida. La preparación de una fixture terminal usa CompleteBiome únicamente en pruebas; ninguna ruta de producción nueva lo ejecuta.

Pruebas de SQLite real con fixtures independientes bajo local-persistence/.work/databases/<UUID>, callbacks de pausa/navegación y comprobación de bindings como texto fuente. No son señales/escenas ejecutadas en Godot, ni una prueba real de desconexión de red. El flujo inspeccionado carece de HTTP obligatorio; validar offline real manualmente. Reanudar desde pausa conserva su implementación y requiere comprobación runtime. Las regresiones incluyen los procesos hijos readonly de fases anteriores. Cero archivos SQLite sintéticos restantes.

Comandos ejecutados con entorno CLI/paquetes/TEMP privado: build --no-restore de GameSave.Checks.csproj; ejecutor --game-over-navigation, --animal-restart, --menu-return, --animal-entry, --decisions, --biome-selection, --runtime-menu y --progress; local-persistence/run-checks.ps1. Compilación completa TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild con GodotProjectDir hacia integration/sqlite/.work/: cero errores,63 advertencias históricas ParallaxBackground,ninguna nueva. Biblioteca/ejecutor: cero errores/advertencias. MSBuild inspecciona86 fuentes, una sola referencia a local-persistence/src/TwoSides.LocalPersistence.csproj y cero fuentes backend/tests filtradas al proyecto Godot. Sin restore, modificación de proyectos ni motor/editor, Node.js o Atlas ejecutados.

Integridad:1,520 archivos protegidos con tamaño/SHA-256/fecha idénticos antes/después, incluyendo finales/FinNivel/biomas/actores/recursos/escenas/configuración y adaptador SQLite. Las tres bases protegidas más manifiestos/leases (9 archivos) permanecen idénticos; no se abrieron con SQLite ni se reinicializó progreso manual. .env conserva278bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928,comprobado separadamente de compilaciones/pruebas, sin leer valores ni usar credenciales. No se cambian ACL/propietario; riesgo ACL de B00 pendiente. No se accede al proyecto original.

Guía manual: con la misma partida, entrar a un bioma decidido, perder por una mecánica existente y comprobar el Game Over original. Reintentar (también doble clic): una sola escena animal, entrada/recursos/objetos iniciales, mismo ambiente y sin humano/login ni pausa residual. Repetir en los cinco biomas y ambientes existentes sin editar decisiones. Desde pausa, reanudar primero; luego Menú debe abrir directamente las cinco tarjetas. Desde Game Over, Menú debe abrir esa misma selección. Elegir un bioma decidido distinto y verificar su ambiente propio e ingreso desde inicio; confirmar misma partida y restricción de nueva partida al volver al menú principal por su ruta habitual. Repetir sin internet y después de cerrar/abrir el juego. No dañar bases reales para inducir errores. Recoger consola/traza si aparece cualquier error nuevo.

Próxima etapa: validar estos dos flujos y aclarar consola con evidencias. CompleteBiome por llegada física, checkpoints, cierre global y finales siguen fuera de alcance; no se implementan aquí ni se inicia B05. Trabajo detenido al terminar C.2C.4.

## B04.2B.2B.2D.1 — Auditoría de recursos, eventos y estadísticas (2026-10-26)

**COMPLETADA como investigación, diseño y documentación. B04.2B.2B.2D.2 NO iniciada.** El usuario confirma C.2C.4 con13/13 pruebas manuales y cero errores nuevos reportados. Las260 pruebas automatizadas corresponden a evidencia histórica; no se reejecutan en esta fase sin cambios de código.

Se revisaron los diez documentos solicitados, todos existentes, y código/esquemas/modelos/servicios/pruebas de local-persistence, los cinco animales y sus escenas, recursos/daño/derrota, pausa/navegación/FinNivel/Final y backend Node sin iniciarlo. Se crean únicamente:
- [LOCAL_RESOURCE_AUDIT.md](LOCAL_RESOURCE_AUDIT.md)
- [GAMEPLAY_EVENT_AUDIT.md](GAMEPLAY_EVENT_AUDIT.md)
- [GLOBAL_STATISTICS_DESIGN.md](GLOBAL_STATISTICS_DESIGN.md)
- [LOCAL_STATISTICS_IMPLEMENTATION_PLAN.md](LOCAL_STATISTICS_IMPLEMENTATION_PLAN.md)

Además se actualizan solo PHASES.md, PHASE_HISTORY.md y DECISIONS.md para registrar esta auditoría. Los nombres del plan para archivos/tablas futuros son propuestas, no implementaciones existentes.

Conclusiones verificadas: vida inicial3 por MaxHealth en los cinco actores, agua/comida100 desde Estadisticas con agua inactiva en delfín; se preservan diferencias de clamp/daño entre actores. Agua/comida agotadas reducen velocidad según código, no se encontró muerte automática por agotamiento. Daño/Hurtbox/Die y ZonaMuerte convergen en GameOver; caída puede no pasar por Die. Reinicio/reintento/retorno son readonly respecto a gameplay SQLite y no producen contadores estadísticos duraderos.

Esquema actual versión2, diez tablas. Reutilizable para perfil/partidas/decisiones/ambientes/progreso/recibos; carece de sesiones de gameplay, muertes/reinicios, intervalos y outbox. attempt_number no incrementa por los reinicios actuales; saved_at no mide tiempo jugado. No confundir sesiones de autenticación/journal remoto con sesiones/eventos locales.

Regla vigente: muerte/reinicio/abandono conservan decisión y ambiente pero vuelven a entrada animal con inicialización original, sin checkpoint intermedio. Sustituye propuestas antiguas incompatibles de hidratación de recursos en documentos históricos, que no se modifican aquí. No se alteran mecánicas, metas ni finales.

Diseño propuesto: eventos con identidad estable e intención/origen, intervalos exclusivos de reloj monotónico y cobertura explícita, no contar pausa/menús/Game Over como juego efectivo. Cierre inesperado solo confirma lo duradero, sin inventar tiempo/muertes previas. Consultas de métricas actuales no necesitan migración; persistencia de nuevos eventos/intervalos requiere migración aditiva ensayada y autorizada, todavía no aplicada. Tres tablas analíticas mínimas propuestas se justifican por datos ausentes; no esconderlos en snapshots/settings ni añadir agregados mutables innecesarios. Outbox/ACK/retry e índices únicos de receptor se diseñan conceptualmente para una fase posterior; backend actual solo tiene identidad/autenticación en memoria y no endpoints de gameplay ni Mongo.

Decisión de diseño: finales globales y completados funcionales siguen parciales hasta integrar meta/CompleteBiome y localizar/conectar evaluador y resultado final, sin inventar umbrales. El panel AWS futuro consume datos mínimos agregados de jugadores que sincronicen, no de todos los jugadores offline. Identidad estable, idempotencia y procedencia/cobertura deben preceder a esos conteos.

Protección: comparación antes/después de1,530 archivos protegidos (tamaño,SHA-256,fecha) y9 archivos de las tres bases/manifiestos/leases, sin cambios. No se abrieron bases duraderas mediante SQLite; solo hashes/metadatos. .env278bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928 comprobados separadamente, sin leer valores ni modificar permisos/propietario. Riesgo ACL de B00 pendiente. No original, producción, escenas, proyectos, pruebas, recursos, navegación, pausa/GameOver/FinNivel/Final modificados; sin tests/builds/migraciones/Node/Godot/Atlas/AWS ejecutados.

Recomendación: autorizar como siguiente paso el alcance concreto de D.2 (consultas readonly primero; instrumentación duradera solo con contrato/migración/ciclo de vida aprobados), manteniendo los archivos exactos y pruebas del plan. No implementar ahora CompleteBiome, checkpoints, cierres/finales, sincronización o endpoints globales; no iniciar B05. Detenerse después de D.1.

## B04.2B.2B.2D.2 — Consultas locales sin migraciones (2026-10-26)

**COMPLETADA EN CÓDIGO. Pantalla Estadísticas pendiente, sin conexión visual.** La autorización actual limita el plan D.1 a consultas derivadas: no se implementan sus propuestas de sesiones/eventos/intervalos, esquema3, instrumentación o sincronización. Prevalece este alcance sobre los apartados futuros del plan histórico.

Inventario exacto de cambios: nuevos local-persistence/src/StatisticsModels.cs.txt, StatisticsRepository.cs.txt y StatisticsService.cs.txt; nuevo local-persistence/game-save-tests/LocalStatisticsChecks.cs.txt y selector --local-statistics en GameSaveChecks.cs.txt. Documentación: LOCAL_STATISTICS_IMPLEMENTATION_PLAN.md, GLOBAL_STATISTICS_DESIGN.md, PHASES.md, PHASE_HISTORY.md, DECISIONS.md y local-persistence/README.md. Total11 archivos. No se cambian UnitOfWork, SQLiteRepository, GameSaveService, adaptadores, Godot, proyectos, esquema ni migraciones.

### Consultas y contratos implementados

StatisticsService recibe ISaveDatabase ya validado y SaveCatalog existente, sin ruta arbitraria ni apertura/creación de almacenes desde UI. Su constructor verifica esquema2 e integridad mediante SchemaManager.Verify (sin Initialize). Cada consulta completa usa **una UnitOfWork.Read**; StatisticsRepository reutiliza Profile/Games/Game/Biomes/Decisions/Environments/Receipt del repositorio existente dentro de esa misma transacción. Las listas son materializadas y expuestas como colecciones readonly. No hay SQL de escritura, recibos nuevos, timestamps actualizados ni almacenamiento redundante.

- GetLocalStatistics(): StatisticsResult<PlayerStatistics>; NoData/Data=null si el esquema está inicializado pero no hay perfil. Nunca crea perfil ni partida.
- GetPlayerStatistics(owner): exige UUID válido y coincidencia con el perfil local; devuelve nombre visible, ID, TotalGames, ActiveGames/ActiveGameId/ActiveGame, HistoricalGames, CompletedGames, AllDecisions/HistoricalDecisions, AllProgress/HistoricalProgress y Uncollected.
- GetGameStatistics(owner,gameId): consulta una partida de ese dueño; GameStatistics incluye IDs, revisión, estado/is_current, versiones, fechas almacenadas, Ending, ConfirmedCompleted, DecisionStatistics, ProgressStatistics y cinco BiomeStatistics.
- DecisionStatistics: Total/Reject/Approve/Healthy/Degraded y cinco BiomeDecisionStatistics. BiomeStatistics contiene estado/resultado/fechas, evidencia de inicio y ConsequenceStatistics opcional (GameId/BiomeId/DecisionId/OperationId, OptionId, ambiente, JSON/version/reglas/fecha).
- No se exponen referencias de credenciales, correo interno ni cuenta técnica en estos contratos. DisplayName se usa solo localmente, no se exporta.

ActiveGame significa la fila is_current, tanto in_progress como final_pending; no promete que esta última sea jugable ni que la navegación final ya exista. HistoricalGames excluye is_current y conserva cada GameId. All* suma todas las partidas; Historical* solo las no actuales; ActiveGame contiene su propio resumen. Los valores de progreso históricos suman filas (GameId,BiomeId), no colapsan ocean de varias partidas en una fila. GamesState=NoData distingue perfil sin partidas, aunque sus conteos válidos sean0.

El repositorio pagina juegos en bloques128 hasta agotar y decisiones por decision_order hasta agotar, bajo el mismo snapshot, sin quedar limitado a50/100. La selección de perfil se verifica dentro de la transacción y los SQL reutilizados parametrizan dueño/partida. No se mezclan consultas de GameSaveService que abrirían transacciones independientes.

### Interpretación y prevención de duplicados

Se valida catálogo/versiones de contenido/formato, cinco biomas/ambientes, decisiones y opciones/consecuencias v1/v2, vínculo LastDecisionId y recibo de decisión de la misma partida/propietario. No se cuenta la proyección environmental_state como otra decisión. IDs y clave lógica por bioma/decision_key se validan; ningún reinicio/visita incrementa decisiones porque esas rutas solo consultan y la capa no emite comandos.

Completed de progreso se cuenta exclusivamente desde biome_progress.status='completed'; animal_pending no es fallo ni completed. Las cinco filas precreadas human_pending no equivalen a cinco entradas. ConfirmedStartedMinimum incluye decisión confirmada o entrada humana actual indicada por CurrentBiomeId/ResumeKind. Started es true con evidencia y null si no puede conocerse. Progress.Started es Unknown/null si falta evidencia para alguna fila; solo es Available cuando todas están acreditadas y NoData si no hay filas. No se infieren visitas históricas desde attempt_number, recibos sin BiomeId o saved_at.

ConfirmedCompleted de partida requiere status completed y los metadatos terminales existentes: ending good/medium/bad, ending_rules_version igual a rules_version y completed_at presente. Ending también reconoce esos metadatos en final_pending sin contar la partida como terminada. Esto verifica la declaración almacenada, NO recalcula umbrales ni demuestra una llegada física no instrumentada. Un completed con metadatos incompletos devuelve Ending Unknown y CompletedGames Unknown/null, no un cero ficticio. Archived no se trata como completado por su nombre. No se implementa cierre ni finales.

StatisticsAvailability distingue Available, Unknown, NotAvailable y NoData. StatisticCount.Value es nullable:
- Available con0: conteo válido y vacío, por ejemplo decisiones de un perfil sin partidas.
- Unknown/null: datos insuficientes para una métrica derivada, por ejemplo número exacto de biomas iniciados o terminal incompleto.
- NotAvailable/null, Reason=NOT_COLLECTED: tiempo jugado, sesiones, muertes, reinicios y reintentos, sin captura existente.
- NoData: no existen registros aplicables (perfil ausente, historial vacío, consecuencia de un bioma sin decisión o final no registrado).

Datos corruptos/contradictorios no generan estadísticas inventadas ni se reparan: SaveException con código seguro (INVALID_STATISTICS_DATA, UNKNOWN_CONTENT, NOT_FOUND, INVALID_DATA, UNSUPPORTED_SCHEMA o códigos StorageErrors como IO_ERROR/ACCESS_DENIED/STORAGE_BUSY). No se devuelve un resumen parcial como éxito tras fallar SQLite.

### Ejemplos sintéticos comprobados

Prueba con una partida histórica con reject en ocean y una actual con approve en jungle: TotalGames2, ActiveGames1, CompletedGames Available1, AllDecisions Total2/Reject1/Approve1, HistoricalDecisions Total1/Reject1/Approve0, ActiveGame.Decisions Total1/Reject0/Approve1. Las decisiones no completan los biomas; los metadatos terminales históricos son preparación explícita de fixture, no implementación de finales.

Prueba con55 partidas históricas de dos decisiones y una activa de una decisión: TotalGames56, HistoricalGames.Count55, AllDecisions.Total111, Reject56, Approve55. Otra fixture de129 partidas confirma que la paginación supera incluso el bloque interno128. No son estadísticas de la partida manual.

Ejemplo de estado sin captura:
~~~json
{"PlayedMilliseconds":{"State":"NotAvailable","Value":null,"Reason":"NOT_COLLECTED"},"Deaths":{"State":"NotAvailable","Value":null,"Reason":"NOT_COLLECTED"}}
~~~
La representación muestra nombres de enum para documentación; el contrato C# no impone una serialización JSON remota.

### Preparación para la futura pantalla

Una futura integración explícitamente autorizada debe invocar estas consultas en el worker/cola del adaptador propietario del ISaveDatabase ya abierto, conservar su ciclo de vida y entregar DTOs al hilo Godot. No abrir una conexión ni ejecutar SQL en scripts visuales. Obtener primero GetLocalStatistics; manejar NoData y SaveException sin crear partidas ni usar recuperación HTTP. Renderizar Value solo cuando State=Available; mostrar desconocido/no disponible/sin datos según el estado. Para opciones actuales usar ActiveGame.Biomes y sus consecuencias; para historial seleccionar GameId o Historical*. No sumar All*+ActiveGame+Historical* (duplicaría datos).

No se añade todavía ese método al GamePersistenceAdapter, ni botón, escena, observador de tiempo, exportador, tarea de sync o endpoint. Los contratos son locales; estadísticas globales seguirán derivándose en el servidor de múltiples jugadores sincronizados, con política de identidad/datos mínimos futura.

### Pruebas y compilación efectivas

**299 comprobaciones C# aprobadas, cero fallidas:**39 nuevas estadísticas +19 Game Over/navegación +21 reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las260 anteriores se reejecutaron, no se presentan solo como historia.

Las39 cubren base inicializada vacía, perfil sin partidas, activa/historial separado, ambos resultados en cinco biomas, orden libre, retry idempotente/restart sin doble conteo, paginación56/129 y111 decisiones, completed realmente almacenado, final histórico/versiones/metadatos incompletos, final_pending actual, cuatro estados de disponibilidad, consecuencias v1/v2, conexión mode=ReadOnly/query_only, bytes/timestamps/esquema/recibos intactos, una conexión por snapshot completo, perfiles ajenos/independientes, IDs inválidos, tabla ausente, errores de acceso, versión antigua incompatible sin upgrade, consecuencias desconocidas/contradictorias y ausencia de dependencias HTTP/Mongo/Godot/campos de credenciales.

Comandos: dotnet build local-persistence/game-save-tests/GameSave.Checks.csproj --no-restore; ejecutor con --local-statistics y los ocho modos seguros anteriores; local-persistence/run-checks.ps1. Solo fixtures propias en local-persistence/.work/databases/<UUID>, cero archivos SQLite sintéticos restantes. No se prueba con bases manuales, modo durable por defecto ni conexiones externas. Callbacks y fuente de UI inspeccionada en regresiones no equivalen a ejecución del motor.

Biblioteca/ejecutor0errores/0advertencias. Rebuild completo TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild, GodotProjectDir hacia integration/sqlite/.work/:0errores,63advertencias históricas ParallaxBackground y ninguna nueva. MSBuild:86 fuentes, una sola referencia de biblioteca y cero fuentes backend/tests filtradas. CLI/paquetes/temporales privados, sin restore ni cambios de proyectos. No Godot, Node.js o Atlas ejecutados.

### Compatibilidad, integridad y límites

Compatible con esquema2 inicializado y registros antiguos de formato/consecuencias soportados. Una base sin esquema o esquema1 que necesitaría migración se rechaza sin inicializar/actualizar; tampoco se interpreta contenido de versiones desconocidas. No se alteran los diez modelos/tablas existentes ni sus constraints/checksums. Las consultas materializan el historial completo; para volúmenes muy grandes queda optimización futura, sin cambiar ahora su semántica.

Comparación antes/después:1,530 archivos protegidos idénticos en tamaño/SHA-256/fecha y9 archivos de las tres bases/manifiestos/leases intactos. No se abrieron bases duraderas mediante SQLite. .env278bytes,SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928,comprobado separadamente de builds/tests sin leer valores ni cambiar ACL/propietario. Riesgo ACL de B00 pendiente. Producción previa de gameplay, recursos, decisiones, pausa/Game Over/navegación/FinNivel/Final, escenas y proyectos permanecen intactos.

Siguiente subfase recomendada: conexión local de pantalla Estadísticas con estos DTOs y estados, solo tras nueva autorización. Eventos/tiempos/muertes/reinicios, migraciones, CompleteBiome, finales y Atlas quedan para fases separadas; no B05. Detenerse después de D.2.

## B04.2B.2B.2D.3 — Pantalla local de estadísticas (2026-10-26)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** Se conecta exclusivamente la consulta local de D.2, sin eventos, migraciones, sincronización ni nuevas métricas.

Inspección: el botón existente es Centro/Tablero/Margen/Contenido/BotonesInferiores/BotonEstadisticas, en assets/sprites/ui/menu_principal.tscn. MenuPrincipal lo deshabilitaba si EscenaEstadisticas era null, y esa exportación no está asignada. No existe una escena/pantalla de estadísticas; scripts/Estadisticas.cs es HUD de recursos y queda intacto. Por tanto se crea una vista desde C#, como el LocalProfileView existente, dentro del tablero del menú, sin añadir/editar .tscn ni cambiar recursos visuales.

Archivos de producción: scripts/MenuPrincipal.cs; nuevo scripts/LocalStatisticsScreen.cs; integration/sqlite/GamePersistenceAdapter.cs; integration/sqlite/GamePersistenceContext.cs; nuevo integration/sqlite/LocalStatisticsScreenState.cs. Pruebas: nuevo local-persistence/game-save-tests/StatisticsScreenChecks.cs.txt, dispatcher GameSaveChecks.cs.txt y Compile del archivo puro en GameSave.Checks.csproj. Documentación: LOCAL_STATISTICS_IMPLEMENTATION_PLAN.md, GLOBAL_STATISTICS_DESIGN.md, PHASES.md, PHASE_HISTORY.md, DECISIONS.md, local-persistence/README.md y los tres documentos GODOT_RUNTIME_INTEGRATION_PLAN/GODOT_SCENE_EVENT_MAPPING/GODOT_RUNTIME_TEST_PLAN. Total17 archivos; no se modifican proyectos de producción ni biblioteca de consultas D.2.

### Integración de fuentes y consulta

Los Statistics*.cs.txt son fuentes reales de la biblioteca: local-persistence/src/TwoSides.LocalPersistence.csproj incluye Compile="*.cs.txt". TwoSides.csproj excluye local-persistence/** y ya tiene una ProjectReference a esa biblioteca. No se renombran/copian DTOs/servicio a scripts Godot ni se duplican clases. GameSave.Checks.csproj incorpora solo el nuevo estado puro de pantalla, sin referencias al motor.

GamePersistenceAdapter implementa ILocalStatisticsReader, una capacidad con un único GetLocalStatisticsAsync. Reutiliza su _gate/Task.Run y el ISaveDatabase ya abierto por el contexto, con StatisticsService lazy dentro del worker. GetLocalStatistics consulta el mismo esquema/datos de D.2 en una transacción de lectura; no abre otro CopyGameDatabase ni crea registros. El servicio estadístico se invalida al Close/Dispose del adaptador. Prueba negativa del adaptador real cerrado verifica STORAGE_CLOSED sin abrir rutas protegidas.

Ajuste de composición mínimo, anunciado antes de editar: GamePersistenceContext conserva el mismo adaptador propietario en un campo y expone únicamente ILocalStatisticsReader Statistics. El mismo adaptador sigue construyendo State y sigue bajo Initialization/Shutdown existentes; no hay nuevo autoload, contexto ni proveedor de rutas. No se modifica LocalGameState ni sus reglas.

MenuPrincipal.Statistics bloquea doble clic con _navigating, muestra carga, espera el resultado local y abre LocalStatisticsScreen con ese estado ya cargado. El botón deja de depender de EscenaEstadisticas y no exige partida activa: habilitado con almacenamiento listo, sin escritura pendiente/operación/transición en curso. También admite perfil ausente como estado vacío. No crea nombre ni partida. La exportación antigua se conserva sin usarse para navegación.

### Vista y ciclo de vida

La vista es un VBoxContainer hijo del MarginContainer del tablero actual. Durante su apertura se oculta el contenido original y se muestra título, ScrollContainer con Label de texto plano, Volver al menú y Reintentar consulta en caso de error. Mantiene fondo/textura/música del menú sin editar escena. Tamaño mínimo510x220 y fuente12 para cuerpo/botones, diseñado para viewport640x360; ajuste visual, scroll y foco requieren validación en Godot.

LocalStatisticsScreenState consulta una vez por apertura o reintento explícito, genera el texto en Task.Run y lo conserva; no hay polling SQLite ni formateo completo en cada frame. El render/tocar controles queda en hilo Godot tras await. Close invalida el estado y descarta respuestas tardías; cada callback verifica vida de nodo antes de actualizar UI. Volver oculta/retira la vista y restaura contenido/foco del menú, sin cambiar escena, partida o pausa. Una nueva apertura vuelve a consultar los datos actuales una vez.

Los datos del jugador solo se asignan a Label.Text: no RichTextLabel/BBCode, SQL, código, URLs ni rutas de escena. No se muestran LocalPlayerId/GameId/OperationId ni referencias de credenciales; nombre visible y fechas se usan como texto. No se exporta información.

### Datos presentados y estados

- Nombre, total de partidas y existencia de partida actual; terminadas solo según metadatos confirmados por D.2.
- Todas las partidas: decisiones totales, No/reject, Sí/approve y desglose de los cinco biomas.
- Partida actual: estado, fecha almacenada, decisiones propias, completados y pendientes, estado de cada bioma y ambiente confirmado.
- Historial separado, excluyendo la actual: totales históricos y cada partida enumerada sin ID técnico, con decisiones/progreso/ambientes y final solo si Ending está disponible. Un final no confirmado dice Desconocido o Sin final registrado, sin calcular umbrales.
- Tiempo jugado, sesiones, muertes, reinicios y reintentos muestran No disponible porque D.2 devuelve NotAvailable/null; no se convierten en0. El formateador distingue Unknown→Desconocido, NoData→Sin datos y Available0→0.
- Perfil ausente: mensaje vacío explícito. Perfil sin partidas: conteos medidos0 e historial/partida actual vacíos, sin inventar progreso. animal_pending aparece como decisión confirmada/segmento animal pendiente, no como error ni completed.

No se suman AllDecisions+ActiveGame+HistoricalDecisions como si fueran métricas disjuntas: las secciones indican su alcance. Los biomas realmente completed vienen del dato persistido, no de la decisión. Las fechas se presentan como registro, nunca se restan para inventar duración.

Error SQLite/servicio: la vista presenta error local controlado y permite Reintentar consulta o Volver. No muestra mensajes internos/secretos ni redirige a recuperación/login; un error no genera una partida temporal. Sin almacenamiento inicializado el botón permanece deshabilitado; la inicialización conserva su diagnóstico local previo.

### Pruebas y compilación

**323 comprobaciones C# aprobadas, cero fallidas:**24 nuevas de pantalla +39 consultas +19 Game Over/navegación +21 reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las299 anteriores se reejecutan, no se presentan como resultado nuevo solo por referencia histórica.

Las24 usan StatsService/SQLite real readonly en fixtures propias: perfil vacío/sin partidas, diez combinaciones bioma/opción, historial sin activa y final registrado, scopes separados, completed almacenado, estados no disponibles/desconocidos/cero, doble clic/carga asincrónica, error/retry, cierre con respuesta pendiente, reapertura sin polling, proceso hijo readonly, nombre con aspecto de markup sin IDs expuestos, adaptador cerrado real y bindings de texto/controlador sin HTTP. No abren bases manuales. El camino positivo del adaptador propietario se compila/inspecciona; las fixtures no debilitan sus restricciones de ruta para ejecutarlo sobre una base arbitraria.

Comandos: build --no-restore de GameSave.Checks.csproj; ejecutor --statistics-screen y sus probes de fixture, --local-statistics y los ocho modos seguros previos; local-persistence/run-checks.ps1. Fixtures bajo local-persistence/.work/databases/<UUID>, cero archivos SQLite sintéticos restantes. Pruebas de estado/formato/bindings no equivalen a botones, scroll o render ejecutados en Godot, ni a prueba real de desconexión de red.

Biblioteca/ejecutor0errores/0advertencias. Rebuild completo TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild, GodotProjectDir hacia integration/sqlite/.work/:0errores,63 advertencias históricas ParallaxBackground,ninguna nueva. MSBuild:88 fuentes, una referencia a la biblioteca y cero fuentes backend/tests filtradas; no se duplica StatisticsService ni su fuente .cs.txt. CLI/paquetes/temporales privados; sin restore, editor/motor, Node.js o Atlas ejecutados.

### Integridad y validación manual pendiente

Antes del ajuste de contexto se verificó intacto el manifiesto inicial de1,528 archivos protegidos; se añadió GamePersistenceContext al inventario autorizado antes de editarlo. Manifiesto final:1,527 archivos protegidos con tamaño/SHA-256/fecha idénticos antes/después, incluidos esquema, biblioteca D.2, escenas, project.godot/TwoSides.csproj, actores, recursos, decisiones, Game Over/pausa/reinicio/navegación animal/FinNivel/finales. Nueve archivos de las tres bases/manifiestos/leases permanecen intactos, sin abrirlos mediante SQLite en pruebas. .env278bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928 antes/después, separado de builds/tests, sin leer valores ni cambiar permisos/propietario. Riesgo ACL de B00 pendiente.

Guía manual: abrir esta copia en Godot C# sin Node; con el perfil existente pulsar Estadísticas y comprobar nombre, partidas y decisiones de los cinco biomas contra lo jugado. Verificar que decidir no equivale a completed y que los ambientes coinciden; distinguir secciones actual/historial. Confirmar No disponible para los cinco campos no capturados, desplazamiento hasta el final y retorno al mismo menú. Doble clic debe abrir una sola vista. Reabrir tras volver, cerrar/abrir el juego y probar sin internet. Si solo hay perfil/historial debe poder consultarse sin crear otra partida. No borrar bases ni alterar decisiones para fabricar casos; vacíos/fallos se cubren con fixtures.

Si aparece un error, copiar consola/traza sin secretos e indicar carga, scroll o retorno. No se afirma validación visual sin motor. Historial completo muy grande todavía puede exigir paginación visual futura; consultas/formateo se ejecutan fuera del hilo principal, pero layout/render final necesita evaluación runtime.

No se implementan captura de métricas, migración, CompleteBiome, checkpoints, finales, Atlas, datos globales ni B05. Siguiente paso: validación manual de D.3 y autorización específica para cualquier nueva subfase. Trabajo detenido al terminar.

## B04.2B.2B.2D.4A — Almacenamiento local de eventos y tiempos (2026-10-26)

**COMPLETADA EN CÓDIGO; SIN CAPTURA GODOT NI MIGRACIÓN REAL.** El usuario confirma D.3:14/14 comprobaciones manuales correctas y cero errores nuevos. La pantalla validada y StatisticsService conservan su comportamiento, incluidas las métricas No disponible.

### Archivos y decisión de compatibilidad

Nuevos en local-persistence/src: GameplayEventModels.cs.txt, GameplayEventSchema.cs.txt, GameplayEventRepository.cs.txt, GameplayEventService.cs.txt y GameplayMonotonicClock.cs.txt. Pruebas: GameplayEventChecks.cs.txt nuevo y dispatcher GameSaveChecks.cs.txt. Se actualizan únicamente los siete documentos indicados para D.4A: plan/diseño global/auditoría de eventos/PHASES/PHASE_HISTORY/DECISIONS/README. Total14 archivos. Ningún controlador, adaptador o escena Godot, StatisticsModels/Repository/Service, servicio de gameplay ni esquema base se modifica.

El plan D.1 proponía una posible versión3 del esquema base. La alternativa implementada reduce riesgo: **extensión opcional gameplay versión1 sobre base versión2**, con historial propio. Cambiar CurrentVersion base habría afectado verificadores/consumidores ya validados y la apertura automática del runtime. Se conservan user_version=2, migraciones1/2 y sus checksums, diez tablas originales y servicios existentes. No se reinterpreta ningún dato histórico ni se añade una columna a una tabla anterior.

MigrateSynthetic acepta exclusivamente SyntheticDatabase, cuya creación y validación están restringidas al namespace UUID de SyntheticSandbox bajo local-persistence/.work/databases. No acepta CopyGameDatabase, OwnedCopyDatabase, ISaveDatabase genérico ni ruta arbitraria como destino de migración. El runtime existente no invoca esta extensión. Solo una fase futura expresamente autorizada podrá definir una capacidad de migración real con respaldo y recuperación verificados; no se debe eludir la restricción de tipos.

### Esquema implementado

Cuatro tablas nuevas únicamente en fixtures migradas (14 tablas totales):
- gameplay_schema_migrations: PK version, migration_key UNIQUE, checksum y applied_at. Versión1, clave local-gameplay-extension-v1; checksum SHA-256 del SQL normalizado.
- gameplay_sessions: session_id PK, local_player_id FK, started_at_utc, status open/closed/interrupted, ended_at_utc nullable, end_offset_ms nullable; UNIQUE(session_id,owner). Índice parcial ux_gameplay_open_session permite una sesión abierta por propietario, evitando dos relojes capturando simultáneamente.
- gameplay_events: event_id PK; owner/session, kind, occurred_at_utc, offset_ms, game/biome/run opcionales según tipo, death_cause/session_end limitados, contract_version1, payload_digest y dedupe_key; UNIQUE(owner,dedupe_key) y clave compuesta para referencias de run.
- gameplay_intervals: interval_id PK; owner/session, start_ms/end_ms, state, game/biome/run y versión/digest; end>=start>=0 y UNIQUE(session,start,end,state). No tabla de acumuladores redundantes.

FK compuestas preservan propietario de sesión/partida, bioma de esa partida y vínculo del run con su evento ANIMAL_SEGMENT_STARTED. El servicio confirma además tipo/alcance del run: una FK por sí sola no asegura semántica de evento. Índices de eventos por dueño/game/biome/kind y session/offset; intervalos por session/rango y dueño/game/biome/state. Las consultas parametrizan filtros; no tienen LIMIT fijo que trunque historial.

Migración: verifica base2 compatible, abre transacción inmediata, crea todo el SQL y su historial en un único commit. Si encuentra extensión parcial/versión/checksum incompatibles, rechaza sin sobreescribir. Si falla antes del commit, DDL/historial se revierten. Segunda aplicación verifica lo existente y no vuelve a insertar ni cambia bytes. Base vacía necesita primero inicialización base explícita en fixture; esquema1/futuro incompatible no se actualiza silenciosamente. No se tocaron las bases protegidas.

### Contratos y servicios

GameplayEvent contiene EventId, LocalPlayerId, SessionId, Kind, OccurredAtUtc, OffsetMs, GameId/BiomeId/AnimalRunId cuando aplican, DeathCause/SessionEnd tipados y Version1. UUIDv4 canónicos existentes; no nombres, correos, credenciales, texto libre, posiciones o recursos. UTC se normaliza antes del digest. Metadatos posibles son enums cerrados, no JSON arbitrario.

Kinds soportados: SESSION_STARTED, SESSION_ENDED, ANIMAL_SEGMENT_STARTED, ANIMAL_DIED, ANIMAL_RESTART_REQUESTED, ANIMAL_RETRY_REQUESTED, ANIMAL_SEGMENT_EXITED, ANIMAL_SEGMENT_COMPLETED. El último solo puede almacenarse si el bioma YA tiene completed confirmado en dominio; el servicio no ejecuta CompleteBiome ni marca nada completado. La fixture positiva prepara ese estado con la API anterior solo para probar el contrato futuro.

GameplayEventService.RecordEvent registra inicio/cierre y eventos en transacciones inmediatas propias del servicio nuevo; no altera local_operations ni revisiones/timestamps de gameplay. SESSION_STARTED crea sesión y evento atómicos. SESSION_ENDED normal sella estado/UTC real/offset monotónico y evento juntos. InterruptSession sella interrupted con fin UTC desconocido, descubrimiento UTC en el evento y offset duradero existente. Una sesión cerrada rechaza nuevos registros salvo duplicados exactos ya comprometidos.

Inicio animal exige partida actual in_progress, bioma canónico animal_pending, decisión/consecuencia/vínculo confirmados y ambiente coherente con reject/approve. AnimalRunId es el EventId del inicio y no cambia durante ese intento. No abre dos runs activos dentro de una sesión; muerte, salida, solicitud voluntaria o completed cierran el run para tiempo activo. Reintento requiere muerte previa y se rechaza después de salida/cierre incompatible. Muerte no cierra la partida; reintentar no agrega otra muerte. Salida puede seguir a muerte sin contabilizarla otra vez.

RecordInterval registra intervalos confirmados; GetEvents filtra por partida/bioma y GetSessions por propietario; GetTotals ofrece agregados scoped de muertes, solicitudes de reinicio/reintento, tiempo efectivo/pausa/observado y duración de sesión. Contratos son nuevos e independientes; StatisticsService anterior sigue devolviendo NotAvailable, verificado por prueba, hasta una integración posterior explícita.

### Idempotencia y tiempo

EventId/IntervalId se generan una sola vez en el futuro adaptador por operación lógica. Mismo ID y digest devuelve GameplayWriteReceipt(Inserted=false), incluso tras cerrar sesión; contenido distinto da EVENT_CONFLICT/INTERVAL_CONFLICT. Claves naturales kind+session o kind+animalRun evitan una segunda muerte, solicitud o cierre aunque un emisor defectuoso cambie de ID: se rechaza con conflicto, no se suma otra fila. No deduplicar por UTC, escena o bioma solamente.

Los contadores Restarts/Retries significan **ANIMAL_RESTART_REQUESTED/ANIMAL_RETRY_REQUESTED registrados**, no prueba de carga exitosa de escena. Una fase posterior podrá correlacionar nueva entrada confirmada para una métrica distinta; no mezclar ambos significados. No se genera otro evento de muerte al pulsar retry.

GameplayMonotonicClock usa Stopwatch.GetTimestamp/Frequency (inyectables en pruebas), origen nuevo por ejecución/sesión y offsets enteros en milisegundos. Conversión decimal desde diferencia total evita acumulación de redondeos por frame; rechaza reloj hacia atrás/duración inválida. No hay timer, autoload ni bucle del motor. El llamador futuro debe usar ese mismo origen para eventos e intervalos; nunca restar UTC ni comparar ticks entre procesos.

Intervalos [start,end) exclusivos por sesión: la transacción inmediata comprueba solapamiento contra cualquier clasificación, no solo active. Adyacentes permitidos, duplicados exactos idempotentes; IDs alternativos para el mismo rango se rechazan. ActiveHuman/ActiveAnimal suman efectivo; Paused/Menu/GameOver/Loading/Background quedan fuera. Puede existir pausa atribuida al bioma, pero nunca suma tiempo activo. Los intervalos no se borran al morir o salir.

Una sesión normal puede declarar duración por offset de cierre, incluidos menús/pausas; RecordedElapsedMs suma intervalos realmente confirmados. No sumar esa duración a efectivo/subtotales. Si faltan intervalos o la sesión sigue abierta/interrumpida, Incomplete lo indica. Para filtro por partida no se atribuye toda una sesión a ese game porque puede abarcar varios: SessionDurationMs=NotAvailable/SESSION_SPANS_GAMES; el tiempo de game/biome se deriva de sus intervalos.

No hay intervalos: EffectiveMs=Unknown/null, no0. Intervalo confirmado0..0: Available0. Sin cobertura animal registrada: muertes/restarts/retries NotAvailable/null. Resultados Scope=RecordedCoverageOnly y HistoricalCoverageUnknown=true: un0 medido cubre únicamente esa captura, nunca demuestra ausencia histórica de muertes antes de instrumentar. El servicio no rellena eventos, sesiones ni tiempo anteriores.

Cierre inesperado: solo se conserva lo duradero; InterruptSession no extrapola hasta la hora de descubrimiento. Duración total permanece Unknown y ended_at_utc=null. Debe sellarse la sesión anterior antes de abrir otra. El intervalo no confirmado se pierde potencialmente y no puede recuperarse reproduciendo gameplay. InterruptSession lee el límite y lo revalida al escribir; una escritura concurrente que lo cambie produce conflicto temporal, no se inventa tiempo. Reintentos deben conservar ID/UTC/payload o consultar el cierre ya existente.

### Pruebas y compilación

**364 comprobaciones C# aprobadas, cero fallidas:**41 nuevas eventos/tiempo +24 pantalla +39 consultas +19 Game Over/navegación +21 reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las323 regresiones se reejecutan. No se suman repeticiones de pruebas ni resultados históricos sin ejecución.

Las41 verifican extensión nueva/repetida/fallida/parcial/futura/checksum, base histórica y decisiones/recibos conservados, sesiones y cierres normales/interrupted, eventos/tiempos por game/biome, muerte/request/retry separados, idempotencia/conflicto, completado solo previamente confirmado, intervalo0 vs desconocido, exclusión de pausa/menú/derrota, rollback de inicio/cierre/evento/intervalo, propiedad y run, concurrencia de mismo evento y de intervalos solapados, reloj monotónico, API anterior intacta, reapertura readonly en proceso hijo y ausencia de PII/HTTP/Godot en los contratos.

Estrés:40 sesiones,400 intentos animales,1.280 eventos y400 intervalos;400 muertes,400 solicitudes de reintento y4.000ms efectivos capturados, sin truncamiento/duplicación. También compara digest completo del agregado de gameplay y número de local_operations antes/después: intactos. Datos son exclusivamente sintéticos.

Comandos: build --no-restore de GameSave.Checks.csproj; --gameplay-events y probe readonly limitado a fixture UUID; los diez modos seguros anteriores; local-persistence/run-checks.ps1. Solo local-persistence/.work/databases/<UUID>. Cero archivos SQLite sintéticos restantes. Sin bases manuales/servicios externos ni lógica de eventos ejecutada en Godot.

Biblioteca/ejecutor0errores/0advertencias. Rebuild TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild con GodotProjectDir hacia integration/sqlite/.work/:0errores,63 advertencias históricas ParallaxBackground y ninguna nueva. Las fuentes nuevas .cs.txt entran solo por la biblioteca ya referenciada; no se modifica csproj ni se duplican clases. CLI/paquetes/temporales privados; sin restore, Godot, Node, Atlas o AWS ejecutados.

### Integridad, riesgos y siguiente subfase

Comparación antes/después:1.538 archivos protegidos idénticos en tamaño/SHA-256/fecha; incluye esquema/migraciones base, estadísticas/pantalla, todos los controladores, gameplay, escenas, proyectos y finales. Las tres bases protegidas más manifiestos/leases (9 archivos) siguen intactos, sin abrirlas mediante SQLite para pruebas. .env278bytes,SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928,comprobado separadamente antes/después, sin valores ni cambios de propietario/ACL. Riesgo ACL de B00 pendiente.

Riesgos pendientes: pérdida antes del commit, cola/disco lleno y política de bloquear o continuar con cobertura incompleta; reloj/origen correcto bajo suspensión; fuente de causa de derrota; crecimiento/retención; IDs/intenciones que el emisor debe mantener; etiquetas de cobertura para no tratar conteos parciales como totales históricos. No hay outbox, ACK remoto ni entrega garantizada a Atlas. El recibo local no es un ACK de servidor.

Plan preciso para futura autorización:
1. Diseñar respaldo, verificación/reversión y capacidad explícita para migrar el runtime real; validarlo en fixtures/ensayo. No basta llamar MigrateSynthetic ni relajar su tipo. Requerir autorización específica antes de tocar datos reales.
2. GamePersistenceAdapter: servicio de eventos en su cola/worker, solo después de verificar extensión ya autorizada; sin SQL en scripts ni conexión paralela.
3. GamePersistenceContext y nuevo observador único: SESSION_STARTED al activar captura con perfil; cierre normal después de flush; al arrancar, interrumpir sesión abierta anterior sin arrastrar reloj entre procesos.
4. AnimalSegmentFlow: confirmar ANIMAL_SEGMENT_STARTED una vez después del guard, EventId=AnimalRunId; recibir origen de intención y preservar EventId en retry. MenuPausa registra solicitud voluntaria y cierra intervalos al pausar/reanudar. GameOver registra primera derrota del run y solicitud de reintento distinta; causa Unknown si no está propagada, sin modificar daño/recursos por inferencia.
5. Retorno al menú registra ANIMAL_SEGMENT_EXITED sin muerte duplicada y sin checkpoint. Una máquina exclusiva cierra intervalos al entrar/salir de carga, pausa, menú, foco, derrota y juego activo; cadence de flush requiere aprobación, no se activa en D.4A.
6. Nueva capa de consulta/presentación autorizada deberá etiquetar cobertura y distinguir solicitudes de reinicios exitosos; no sustituir silenciosamente las métricas de StatisticsService. Validación manual posterior de pausas, cierres, tiempos y conservación de gameplay.
7. ANIMAL_SEGMENT_COMPLETED solo se conectará a un commit de dominio confirmado en otra fase de meta física; no a decisión, BodyEntered aislado o Game Over. Finales y B05 siguen fuera de alcance.

Para Atlas futuro: preservar IDs/version/digest, receptor idempotente y ACK solo tras commit durable; misma carga/ID puede repetirse, otra carga/ID conflictivo no se suma. Una outbox transaccional y su retención se diseñarán en fase autorizada, no existen aquí. No enviar nombres ni otros datos personales innecesarios.

Recomendación: siguiente subfase de preparación/migración real controlada y luego captura local autorizada, manteniendo estos límites. D.4A termina aquí; no se conecta Godot, no CompleteBiome/finales/checkpoints/sync/B05.

## B04.2B.2B.2D.4A.1 — Respaldos y ensayo de migración (2026-10-26 Guatemala)

**COMPLETADA. Las tres bases originales siguen sin migrar.** Ejecución real de respaldos:2026-10-27T05:22:36Z, equivalente a2026-10-26 23:22:36 en Guatemala. No se falsifican fechas ni timestamps de origen.

### Herramienta aislada y ubicación privada

Archivos nuevos: local-persistence/backup-rehearsal/BackupRehearsal.csproj, Program.cs.txt y packages.lock.json. Solo se actualizan estos cinco documentos: LOCAL_STATISTICS_IMPLEMENTATION_PLAN.md, PHASES.md, PHASE_HISTORY.md, DECISIONS.md y local-persistence/README.md. No cambia ninguna herramienta compartida, migrador/repositorio de producción, adaptador runtime, gameplay, interfaz o escena.

El helper referencia la biblioteca existente y RealGameCatalog, compila fuentes .cs.txt como ejecutor aislado y admite solo --self-test y --backup-and-rehearse. No acepta rutas de origen/destino del usuario ni modo restaurar originales. La ejecución privilegiada revisada se limita a crear la carpeta privada fuera de OneDrive y escribir respaldos/copias/manifiesto allí; las tres fuentes son constantes y se abren exclusivamente ReadOnly.

Raíz de salida: %LOCALAPPDATA%\TwoSides\PrivateBackups\D4A1\<fechaUTC-UUID>. El manifiesto privado manifest.json contiene rutas exactas de cada origen/respaldo, fecha, tamaño, SHA-256, versión/base/application_id, método, integridad, relaciones, conteos/huellas por tabla y resultados de migración/rollback/restauración. La ruta exacta y hashes de esta ejecución se entregan al usuario en el informe privado. No se copian respaldos, datos del jugador ni el manifiesto privado al repositorio/documentos públicos.

La raíz nueva tiene ACL privada explícita para el usuario ejecutor, SYSTEM y Administradores. Se configura exclusivamente esa carpeta nueva, no permisos/propietario de las fuentes. Está fuera del árbol OneDrive y del repositorio Git; no se envía nada a nube. Los archivos de respaldo y las copias de ensayo contienen datos reales y deben conservarse con esa protección. No se utiliza TEMP para los respaldos duraderos.

### Ausencia de escritores y método consistente

La consulta inicial CIM fue denegada. Como comprobación alternativa válida se usa Get-Process y luego Process.GetProcesses en la propia herramienta: no aparecen Godot, TwoSides/Two-Sides ni dotnet antes de acceder a fuentes. Si la enumeración falla o detecta esos procesos, la herramienta se detiene sin copiarlas; nunca termina procesos.

Se validan rutas fijas y ausencia de reparse points bajo sus anclas aprobadas. Cada fuente, store.lease y ownership.json se mantiene con FileAccess.Read/FileShare.Read: rechaza escritores existentes y evita nuevos accesos de escritura/reemplazo durante el snapshot. No se toma ni rompe el byte-range lock de aplicación y no se fuerza ningún bloqueo SQLite. Los lectores SQLite usan mode=ReadOnly, pooling=false y cache privado.

Las tres fuentes inspeccionadas NO tenían WAL/SHM/journal y su encabezado indica formato rollback1/1. Se usa Microsoft.Data.Sqlite.SqliteConnection.BackupDatabase, no File.Copy de save.sqlite3. El snapshot de tablas y esquema antes del backup se compara con el respaldo bajo la misma protección de origen; no puede haber commits concurrentes aceptados entre esas lecturas.

Limitación deliberada: si una fuente real tiene sidecars, modo WAL o encabezado desconocido, esta herramienta la omite sin abrir recuperación/checkpoint ni borrar archivos; habrá que preparar otro procedimiento seguro. No se afirma que copiar el archivo principal sea suficiente en ese caso. Una prueba sintética con WAL activo confirma que el mecanismo BackupDatabase incluye transacciones confirmadas en WAL, pero no se usa esa prueba para autorizar cambios de SHM/journal en una fuente real.

### Respaldos y validación obtenidos

Se obtuvieron los tres respaldos consistentes:
- historical-progress: base A de game-progress.
- historical-infrastructure: base B de persistence.
- runtime-game: base C con la partida manual.

Los tres respaldos tienen147.456bytes y esquema base2. Cada uno posee su propio nombre con alias, UTC y UUID y su SHA-256 real en el manifiesto. Un backup SQLite puede cambiar bytes de cabecera respecto al origen; no se exige igualdad del hash físico entre ambos. Sí se comprueba igualdad lógica exacta, application_id, user_version y estructura.

En cada respaldo/copia: PRAGMA integrity_check=ok, foreign_key_check sin filas, todas las tablas y sus definiciones preservadas. Se comparan conteos y hashes SHA-256 de todas las filas, con tipos y duplicados conservados y orden canónico de hashes; no se publican nombres, IDs de jugador/partida ni contenido de filas. El esquema incluye las restricciones/índices definidos en sqlite_master. Esto cubre perfiles, partidas, decisiones, consecuencias, cinco biomas, historial, recibos y snapshots sin revelar sus valores.

### Ensayo aplicado solo a segundas copias

Por cada respaldo se crean, con nombres nuevos sin sobrescribir:
1. rehearsal: recibe la extensión opcional1, conserva base2 y agrega cuatro tablas.
2. failure: prueba una excepción antes del commit y conserva la base original sin datos/DDL parciales.
3. restored: prueba restauración del respaldo hacia otro archivo aislado, sin apuntar a fuente alguna.

El rol Backup solo abre ReadOnly y el migrador de ensayo lo rechaza como destino. Los roles Rehearsal/Failure son los únicos mutables por ese helper; se comprueba raíz de copia, rol, ausencia de enlaces y exclusión de los tres orígenes. Los archivos restored también son de lectura.

No se amplía GameplayEventSchema.MigrateSynthetic ni su tipo SyntheticDatabase. El helper obtiene por reflexión el SQL const exacto de esa versión de biblioteca y verifica SHA-256 contra GameplayEventSchema.Checksum, para no mantener una migración divergente. Aplica ese SQL solo al rol de segunda copia, en transacción inmediata con historial propio; verifica después mediante GameplayEventSchema.Verify. Si el campo o checksum cambia en otra versión, el ensayo requiere revisión; no extrapolar este acceso a producción.

Resultados de los tres ensayos:
- Esquema base2 y application_id conservados.
- Todas las tablas/filas anteriores idénticas por definición, cantidad y huella: no cambian identificadores, decisiones, consecuencias, biomas, partida activa ni resultados históricos.
- Extensión opcional v1 reconocida y sus tablas gameplay_sessions/events/intervals VACÍAS. Solo hay el registro legítimo de migración en gameplay_schema_migrations.
- Segunda aplicación no inserta ni cambia bytes.
- Fallo antes del commit revierte todo; hash físico idéntico en la copia failure y esquema base intacto.
- Copia restored idéntica lógicamente al respaldo. Ningún archivo original se reemplaza.
- GameSaveService y StatisticsService actuales pueden leer perfil, activa, historial paginado, decisiones y progreso; los tres ensayos informan current-local-services-compatible.
- GameplayEventService consulta eventos/sesiones vacíos y conserva duración/muertes desconocidas; StatisticsService sigue devolviendo No disponible para campos no capturados.

No se generan eventos ficticios ni sesiones/intervalos en las copias finales. Las pruebas de escritura de eventos de D.4A no se ejecutan sobre estos datos reales clonados.

### Pruebas y compilación

**9 pruebas nuevas sintéticas aprobadas,0 fallidas**, más tres ensayos completos sobre copias verificadas reales. Las9 comprueban backup lógico, rol de backup no migrable, conservación tras migrar, segunda aplicación, rollback, restauración aislada, rechazo de handle escritor, backup con transacción WAL confirmada y bytes fuente intactos.

Compilación de BackupRehearsal y biblioteca referenciada:0errores/0advertencias, .NET8 con ejecutor self-contained existente. Restore solo desde caché local de paquetes, sin fuentes de red ni cambios de paquetes de producción. Herramienta compilada bajo local-persistence/.work y pruebas en namespaces propios con datos sintéticos. Las pruebas limpian solo sus archivos conocidos bajo la raíz de trabajo verificada, nunca respaldos reales.

Comandos: dotnet restore/build del proyecto backup-rehearsal con fuente local; BackupRehearsal.exe --self-test; ejecución revisada --backup-and-rehearse. No se modifica código compartido: las364 comprobaciones anteriores y las63 advertencias Godot permanecen como evidencia HISTÓRICA, no se presentan como reejecutadas. No era necesario recompilar Godot sin cambios de producción. No se inicia Godot, Node, Atlas o AWS.

### Política de pérdida antes del commit

Un evento queda confirmado cuando su transacción SQLite terminó el commit duradero; un clic/solicitud en memoria no lo prueba. Fallo antes de commit revierte cambios y no puede reconstruirse como evento real al reiniciar. Si se pierde solo la respuesta después de commit, reintentar MISMO ID y payload estable retorna lo existente; otro contenido produce conflicto. Una solicitud de reinicio no equivale a una nueva escena animal confirmada.

Intervalos sin commit son desconocidos, no tiempo medido0; no restar saved_at ni asumir que la sesión siguió jugando hasta descubrir el cierre. Tras crash se conserva el último intervalo duradero y se marca interrupted con duración total desconocida, sin restaurar posición/recursos ni fabricar eventos.

Política recomendada para la futura integración: la telemetría nunca borra ni cambia decisiones/progreso para repararse. Si falla, conservar el error y la intención pendiente con su ID, y marcar cobertura incompleta; buffers acotados y reintentos en su cola, sin crear partidas temporales ni exigir HTTP. No detener ni revertir un commit de gameplay ya confirmado por intentar registrar una métrica independiente. Cuando se necesite atomicidad dominio+evento, diseñarla explícitamente en una fase autorizada antes de conectar ambos; no prometer recuperación de datos que nunca persistieron.

### Procedimiento de restauración y migración runtime futura

El ensayo demuestra restauración hacia archivos nuevos, NO concede permiso para restaurar originales. Ante necesidad futura:
1. Cerrar Godot por acción del usuario, verificar procesos/handles y mantener las fuentes sin escritores; no matar procesos ni manipular WAL/SHM.
2. Seleccionar el backup privado y verificar SHA-256 con manifest.json; repetir integrity_check, foreign_key_check y esquema/application_id.
3. Crear otro respaldo consistente del estado actual antes de cualquier reemplazo, sin sobrescribir respaldos existentes.
4. Obtener autorización que identifique exactamente la base destino y la operación; conservar ACL/propietario y comprobar ownership.json/identidad de archivo.
5. Preferir restauración SQLite hacia el archivo destino existente bajo capacidad validada: los manifiestos OwnedCopyDatabase incluyen FileIdentity. Un reemplazo por rename/copia de archivo nuevo puede romper esa identidad y no debe hacerse como simple receta File.Copy; cualquier ajuste de manifiesto necesita procedimiento y autorización propios.
6. Verificar datos/estructura/compatibilidad y metadatos antes de volver a abrir el juego. No introducir eventos ni tiempos retroactivos al restaurar.
7. Para migración real futura, preparar una API explícita que acepte SOLO el destino runtime autorizado con respaldo/recuperación verificados. Repetir esta validación y confirmar guardas in situ; aplicar extensión en transacción, releer invariantes y conservar respaldo intacto. No ampliar por inferencia la capacidad MigrateSynthetic.

Riesgos restantes: crecimiento y retención de respaldos privados, disponibilidad de almacenamiento, cambio de esquema/SQL entre compilaciones, modo WAL futuro que exige un plan distinto, datos no confirmados antes de crash y validación completa del proveedor runtime/identidad tras una futura escritura. No eliminar respaldos para liberar espacio sin autorización.

Integridad final:1.547 archivos protegidos sin cambios de tamaño/SHA-256/fecha; los9 archivos originales de bases/manifiestos/leases permanecen intactos. La propia herramienta verifica además hash/tamaño/mtime y huella de ACL/propietario de cada base antes/después bajo protección de lectura. .env278bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, sin leer valores ni copiar credenciales/cambiar permisos. Riesgo ACL de B00 pendiente.

Siguiente subfase recomendada: autorizar explícitamente una migración runtime controlada, usando estos respaldos y procedimiento, antes de integrar capturas de Godot. No se migra ninguna base real, no se conecta evento, gameplay, CompleteBiome/finales o B05. Trabajo detenido al terminar D.4A.1.

## B04.2B.2B.2D.4A.2 — Migración runtime controlada (2026-10-26 Guatemala)

**COMPLETADA. Validación manual Godot pendiente; eventos NO conectados.** Operación real:2026-10-27T05:40:22Z (2026-10-26 23:40:22 Guatemala). Único archivo de datos migrado: local-persistence/.work/runtime-game/save.sqlite3 de la copia Two-Sides PRUEBA. No se modificaron las dos bases AppData.

### Guardas y respaldo

Se verificó ausencia de Godot/TwoSides/dotnet/ejecutores de pruebas; no se cerró ni terminó ningún proceso. La ruta absoluta se compara con una constante autorizada y CopyGameDatabase.RuntimePath. Los handles WindowsGuard existentes se reutilizan por reflexión desde la herramienta aislada: rechazan reparse/hardlinks, validan ruta final y conservan directorios/archivo contra rename/delete. La identidad nativa se comparó con ownership.json (formato/copia/purpose/Ready/FileIdentity), sin mostrar datos personales.

Se adquirió exclusión en store.lease existente, sin cambiar sus bytes; ownership.json permaneció en lectura y el archivo runtime se mantuvo con deny-write hasta la fase final de migración. Sin WAL/SHM/journal; encabezado rollback válido. Se verificaron espacio libre para respaldo/recuperación, application_id runtime0x54535254, base2, integridad y FK; no había extensión previa.

Se verificó hash del manifiesto D4A1 y respaldo de referencia (7D791333A03326FF2A4E91DEA0E1BCF5F9F40A8C0D0DB6BA34365305C33A5E0D), origen correspondiente, esquema/integridad y compatibilidad. No se asumió que fuera el estado actual: el snapshot lógico actual se comparó independientemente.

Se creó nueva carpeta privada %LOCALAPPDATA%/TwoSides/PrivateBackups/D4A2/20261027T054022Z-3618aa339d9e475ea5275d38ced08d43, fuera de OneDrive/Git. Contiene before.json, after.json y respaldo runtime-immediate-20261027T054022Z-43f00cb0f53a4f7ea5b788304fbfed38.backup.sqlite3, más ensayos aislados. No se sobrescribió ningún respaldo anterior. ACL privada únicamente en la nueva carpeta; no se cambia seguridad de fuentes.

BackupDatabase capturó un snapshot consistente actual, validado contra todas las tablas/filas/restricciones/índices mediante conteos y huellas canónicas, sin publicar nombre/decisiones del usuario. SHA-256 del respaldo inmediato:
7D791333A03326FF2A4E91DEA0E1BCF5F9F40A8C0D0DB6BA34365305C33A5E0D.
Coincide con el anterior como resultado observado, no como precondición supuesta.

El ensayo final migró SOLO una segunda copia del respaldo nuevo; validó base2/extensión1, integridad/FK, conservación exacta de tablas/datos anteriores, consultas de GameSaveService/StatisticsService/GameplayEventService, segunda aplicación byte-idempotente, fallo simulado con rollback completo y restauración hacia otro archivo aislado. No eventos ficticios en copias finales.

### Migración y resultados

La herramienta usa el SQL const del migrador versionado existente, verifica su checksum y aplica la misma función de ensayo/transacción a un gate runtime nuevo, limitado a una apertura de escritura. No se modifica ni amplía GameplayEventSchema.MigrateSynthetic. Se permite esta ruta especial solo por la autorización expresa D4A2; no constituye migración automática del runtime al arrancar.

Justo antes de escribir se revalidaron hash/metadatos originales y procesos. Dentro de la transacción inmediata se comparó nuevamente el snapshot base, se aplicaron las cuatro tablas de extensión y se compararon todos los datos base ANTES del commit. Ante error la transacción se revierte; el helper registra stopped.json y nunca restaura automáticamente ni reintenta una escritura desconocida.

Resultado:
- Antes: base v2, sin extensión.
- Después: base v2, extensión opcional v1; mismas diez tablas originales y cuatro adicionales.
- integrity_check=ok y foreign_key_check vacío.
- Perfil, partida actual, historial, IDs, decisiones, consecuencias, cinco biomas, recibos y snapshots iguales al respaldo inmediato.
- Nuevas tablas de sesiones/eventos/intervalos vacías; solo registro real de migración.
- Consultas actuales y nuevas compatibles; métricas históricas no convertidas en0.
- Identidad nativa, propietario/ACL y manifiesto de ownership conservados; no sustitución del archivo.
- SHA-256 runtime anterior:8CC18BE48074E0F91A99E39801E2CA41276192EAD0553DBFE9AA5A48AE28971C.
- SHA-256 runtime posterior:83BD0E4D27ADE3E5CA778233E59456B6CB6CAF04A3608ED92BF07B8F6D790E07.
- SHA-256 after.json:EE2E37A18E3DE2C1FC9EE3B93A27E2B5F93935136C2A2CA1FF9403E9F867246F.

### Código, pruebas y seguridad

Único archivo de herramienta modificado: local-persistence/backup-rehearsal/Program.cs.txt; añade gate runtime fijo, validación del respaldo, identidad/lease, ensayos, manifiestos y modo --migrate-runtime-controlled. No cambia biblioteca/migrador/repositorios de producción ni adaptador runtime. Se actualizan solo estos cinco documentos de D4A2. El segundo adjunto del usuario mantiene las mismas condiciones del primero.

Compilación del helper y biblioteca referenciada:0errores/0advertencias tras corregir una nulabilidad detectada durante preparación; ningún acceso de escritura runtime ocurrió durante esa compilación fallida. **15 comprobaciones sintéticas aprobadas,0 fallidas**:9 de backup/ensayo previas reejecutadas y6 de path/identidad/ownership, verificación intra-transacción/rollback, conservación de identidad/ACL con DDL y respaldo nuevo independiente de referencia anterior. Además ensayo y verificaciones efectivas en la copia y runtime autorizada. No se presentan las364 pruebas previas como reejecutadas ni las63 advertencias históricas Godot como build nuevo: no cambió código de Godot.

Comandos: build --no-restore del helper; --runtime-migration-self-test; única ejecución revisada --migrate-runtime-controlled. No Godot/Node/Atlas ni gameplay ejecutados, no captura ni CompleteBiome/finales/B05.

Integridad final:1.547 archivos protegidos sin cambios de hash/tamaño/fecha; ocho archivos protegidos de almacenes (las dos bases AppData y manifiestos/leases de las tres) intactos. Runtime SQLite excluida expresamente de esa igualdad porque fue el único dato autorizado a cambiar; sus invariantes se verifican separadamente. .env278bytes,SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, sin leer valores ni cambiar permisos/propietario. Riesgo ACL de B00 pendiente.

### Recuperación y siguiente paso

No se necesita recuperación y no se efectuó ninguna. Si aparece un fallo después: detener juego/escritores por acción del usuario, preservar runtime/manifiestos/sidecars y diagnóstico; verificar hashes del respaldo y after.json, integridad/compatibilidad en otra copia. Cualquier restauración requiere autorización adicional que nombre destino y respaldo. No sustituir por rename/File.Copy: ownership.json referencia identidad de archivo; preferir procedimiento SQLite in-place validado que conserve identidad/seguridad. Crear antes otro respaldo del estado a reemplazar y ensayar restauración aislada. No reintentar esta migración sobre runtime ya extendido: el gate la rechaza.

Riesgos pendientes: prueba manual del videojuego tras migrar, pérdidas de eventos anteriores al commit, política de fallos/cobertura, origen de reloj y retención antes de captura. La pantalla sigue mostrando No disponible para datos no capturados; no hay eventos históricos reconstruibles.

Siguiente recomendación: validar manualmente continuidad/estadísticas actuales y luego autorizar por separado la conexión de eventos/intervalos al adaptador/observador único de Godot, usando IDs estables y diferenciando solicitudes de reinicios confirmados. D4A2 termina aquí: no conectar eventos, no gameplay, no CompleteBiome/finales ni B05.

## B04.2B.2B.2D.4B — Captura local Godot y tiempo efectivo (2026-10-27 Guatemala)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** El usuario confirma D4A2 con14/14 comprobaciones manuales, base runtime2+extensión1 y gameplay sin errores nuevos. Esta fase conecta únicamente captura local; no modifica la pantalla Estadísticas ni su contrato histórico No disponible.

### Inventario exacto y arquitectura

Producción: integration/sqlite/LocalGameplayObserver.cs nuevo; integration/sqlite/GamePersistenceAdapter.cs; integration/sqlite/GamePersistenceContext.cs; scripts/AnimalSegmentFlow.cs; assets/sprites/ui/MenuPausa.cs; assets/sprites/ui/GameOver.cs; scripts/MenuPrincipal.cs (solo salida normal). Pruebas: GameplayObserverChecks.cs.txt nuevo, dispatcher GameSaveChecks.cs.txt y Compile del observador puro en GameSave.Checks.csproj. Nueve documentos indicados en D4B actualizados. Total19 archivos.

No se modifican LocalGameState, StatisticsService/pantalla, biblioteca/esquema de eventos, relojes de recursos, actores/daño, NPC, escenas, project.godot, TwoSides.csproj, FinNivel ni finales. Los personajes y ZonaMuerte ya convergen en GameOver.MostrarDerrota; no se añaden señales ni hooks duplicados en cada animal. El observador vive como objeto C# poseído por GamePersistenceContext existente (hijo de GameApplicationContext), no como otro Autoload/Node/escena.

IGameplayTelemetryStore expone solo ReadSessionsAsync, WriteEventAsync, WriteIntervalAsync e InterruptAsync. GamePersistenceAdapter los implementa con su misma cola SemaphoreSlim/worker Task.Run y GameplayEventService lazy sobre el ISaveDatabase que ya posee. No hay SQL en escenas, conexión paralela ni migración automática; si falta la extensión o almacenamiento, falla solamente telemetría con código seguro. El servicio se invalida al cerrar/disponer el adaptador.

LocalGameplayObserver recibe ese puerto, reloj monotónico/UTC y diagnóstico inyectables. Todas las notificaciones Godot son síncronas en memoria y no esperan escrituras para permitir gameplay. La FIFO serial conserva comandos tipados inmutables, IDs y payloads para reintentos; GameSaveService/decisiones no se invocan desde su interfaz. El drenaje de I/O usa el worker ya existente.

### Capturas reales conectadas

| Acontecimiento | Punto de captura nuevo | Semántica y dedupe |
|---|---|---|
| SESSION_STARTED | GamePersistenceContext._Process cuando State.Ready tiene perfil local; Telemetry.InitializeAsync | Una inicialización por contexto/ejecución; SessionId UUID estable, evento offset0. No exige partida ni crea una |
| SESSION_ENDED normal | GamePersistenceContext.QuitAsync por notificación de cierre de ventana y MenuPrincipal.Exit | Cierra último intervalo y encola un único cierre. AutoAcceptQuit=false permite intentar flush; sin nuevo autoload |
| Cierre inesperado anterior | InitializeAsync consulta sesiones abiertas y encola InterruptAsync antes del nuevo inicio | Identificador/UTC de descubrimiento conservados; offset duradero existente, ended_at desconocido; no inventa cierre normal |
| ANIMAL_SEGMENT_STARTED | AnimalSegmentFlow.ValidateLocalCore tras guard local satisfactorio y restauración de pausa; context.AnimalStarted | Una vez por ID de instancia de escena, no por cada FinNivel; el contexto difiere el registro si aún se inicializa telemetría. RunId=EventId UUID |
| ANIMAL_DIED | GameOver.MostrarDerrota después del primer _mostrado | Una derrota por run. Causa Unknown, porque Die y ZonaMuerte no propagan causa tipada; no inferir daño/caída ni modificar actores |
| ANIMAL_RESTART_REQUESTED | MenuPausa.ReiniciarNivel tras guards de doble clic/transición | Solicitud voluntaria, una por run; no se cuenta como muerte ni éxito de carga |
| ANIMAL_RETRY_REQUESTED | GameOver.Reintentar tras sus guards | Requiere derrota conocida en el run; solicitud distinta de muerte. No genera segunda muerte |
| ANIMAL_SEGMENT_EXITED | AnimalSegmentFlow.ReturnToLevelsLocalAsync solo tras ChangeSceneToPacked exitoso; detección secundaria de escena distinta en contexto | Una salida por run, no duplica notificaciones. No checkpoint ni CompleteBiome |
| Intervalos efectivos/pausa | _Process del contexto, MenuPausa.AbrirMenu/CerrarMenu y pérdida de foco de aplicación | Cambio de clasificación cierra intervalo anterior antes del siguiente |

La nueva entrada validada del animal es el único dato que confirma una instancia nueva realmente lista. La solicitud de reinicio/reintento permanece separada; una navegación fallida no agrega otro ANIMAL_SEGMENT_STARTED. ANIMAL_SEGMENT_COMPLETED no se emite, y meta física sigue sin integración local.

Los helpers de navegación solo añaden notificaciones Loading/Leave/NavigationFailed; sus validaciones, escenas, ambientes, pausas y resultados originales se conservan. Telemetría no participa en AnimalSegmentFlow.IsBlocking ni en guards de progreso. No se solicita HTTP ni sesión remota en estas rutas.

### Sesión, reloj e intervalos

Se reutiliza GameplayMonotonicClock (Stopwatch), sin modificarlo: origen nuevo por observador, offsets enteros en milisegundos; UTC solo identifica momentos de eventos. No se resta saved_at ni UTC para duración. Una partida puede tener múltiples sesiones y múltiples runs; cambiar menú/bioma, pausar o morir no crea otra partida ni sesión.

El contexto usa ProcessMode.Always para observar pausa. Cuando la instancia validada sigue vigente, sin bloqueo/transición, sin pausa y con foco, clasifica ActiveAnimal. Paused/GameOver/Loading/Background/Menu no suman efectivo. No se habilita ActiveHuman: su definición y punto listo todavía necesitan una fase explícita; diálogos/menús/estadísticas se excluyen conservadoramente.

Cambio de estado: confirma [boundary,now) del estado anterior y cambia el límite en memoria, sin solapamiento. Muerte cierra activo inmediatamente y pasa a GameOver. Solicitud de reinicio/reintento pasa a Loading; nuevo guard confirma otro run. La pérdida de foco tiene notificación inmediata, además de WindowIsFocused en el muestreo. Los demás estados se contrastan cada frame con SceneTree.Paused, CurrentScene y Transicion.Ocupado.

Cadencia adoptada a partir de la propuesta documentada5s: heartbeat cada5.000ms cierra subintervalos del estado actual, incluidos menú/pausa para cobertura observada. No escribe cada frame ni crea timers de escena; intervalo inmutable con mismo ID se reintenta sin sumar dos veces. Una caída entre confirmaciones puede perder el último intervalo y cualquier cola aún no persistida;5s es la cadencia objetivo durante ejecución normal, no una garantía dura bajo I/O fallido o suspensión del proceso.

Sesión normal: el cierre de ventana y botón Salir intentan completar inicialización/cierre/flush durante máximo3s. El límite incluye inicialización y cola lenta. Si no termina o hay fallo, diagnóstico TELEMETRY_CLOSE_TIMEOUT/FAILED/INCOMPLETE, se permite salir y queda solo lo duradero. Cierre forzado/editor kill/OS crash no se presenta como normal; al siguiente arranque las sesiones abiertas se sellan interrupted hasta su límite confirmado.

_ExitTree mantiene el cierre del adaptador/State existente, no intenta inventar tiempo después de destruir el árbol. La cola usa el mismo gate del adaptador y puede rechazar STORAGE_CLOSED al salir; ese dato no se declara persistido. No se ejecuta gameplay ni motor por Codex.

### Idempotencia y errores secundarios

SessionId/EventId/IntervalId son UUIDv4 generados una vez al capturar intención/límite. Las clausuras de la cola conservan todo el DTO (incluida UTC) durante retry. El run conserva HashSet de kinds enviados; la instancia conserva sceneToken; los controles mantienen _saliendo/busy. Los servicios existentes añaden claves naturales de sesión/run y digest conflictivo: no se sobrescribe un ID contradictorio.

FIFO: intervalos anteriores se confirman antes del evento que termina el run; las siguientes escrituras esperan detrás del comando pendiente para no invertir offset/durable boundary. Respuesta perdida después de commit se reintenta con DTO idéntico y devuelve recibo ya existente; no se alteran recibos de decisiones.

Errores transitorios IO_ERROR/STORAGE_BUSY/DISK_FULL/ACCESS_DENIED/TELEMETRY_WRITE_FAILED conservan la cabeza e intentan nuevamente al muestrear tras5s; nuevas transiciones pueden disparar otro drenaje idempotente. Un conflicto/contrato/esquema incompatible desactiva SOLO captura, marca Incomplete y avisa código local. Inicialización fallida queda diagnosticada y sin captura hasta otra ejecución. Cola máxima2.048 comandos; al llenarse se desactiva captura y conserva datos ya confirmados, sin consumir memoria sin límite ni bloquear juego.

Diagnóstico [Local telemetry] seguido solo de código tipado, sin nombres, IDs, rutas, credenciales o payload. Las fallas no se ocultan en la cobertura. Observador antes de estar listo marca TELEMETRY_NOT_READY_COVERAGE y no inventa actividad previa; el contexto puede iniciar captura del animal aún vigente cuando el observador esté disponible, con cobertura desde ese momento.

Caso conservador de reinicio fallido: la solicitud persistida cierra el run según el contrato existente. No se fabrica un nuevo inicio en la misma instancia ni se sigue sumando activo después de ese cierre; se diagnostica TELEMETRY_FAILED_RESTART_COVERAGE y queda una laguna hasta entrada nueva válida. El juego conserva la escena y recursos; la estadística incompleta no lo bloquea. Reintentar la misma solicitud conserva su identidad lógica. Una salida real posterior puede cerrar navegación sin duplicar la muerte.

Limitaciones explícitas: suspensión abrupta del OS sin notificación de foco/ciclo de vida y bloqueos largos del hilo principal requieren validación runtime de la cobertura temporal; no se afirma exactitud de muestreo que no se midió. Sin una transacción de dominio+evento común, caída antes del commit puede perder la notificación; jamás se reproduce una decisión o navega otra vez para reparar telemetría. No hay outbox/ACK ni envío remoto.

### Pruebas y compilación

**395 comprobaciones C# aprobadas, cero fallidas:**31 nuevas observador +41 servicios eventos +24 pantalla +39 consultas +19 Game Over/navegación +21 reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las364 regresiones se reejecutaron, sin contar pruebas repetidas ni los ensayos de migración como una nueva suite completa.

Las31 nuevas usan reloj manual y GameplayEventService/SQLite real sobre bases sintéticas migradas. Cubren inicio único, perfil sin partida, sesiones sucesivas, cinco biomas, misma instancia/doble señal, muerte/request/retry separados, navegación fallida, salida duplicada, pausa/reanudar/menús/Game Over/carga/foco, heartbeat5s, tiempo por bioma, SQLite fallido/respuesta perdida/worker lento, cierre normal/abrupto, duración desconocida, conservación del agregado principal completo y sin nueva partida, identidad inválida y bindings C# sin capacidad de RecordDecision/CompleteBiome/HTTP.

Los tests del observador puro no ejecutan SceneTree, señales Godot, render, notificaciones de ventana ni frames reales; esos hooks se compilan e inspeccionan y requieren validación manual. Las fixtures usan local-persistence/.work/databases/<UUID>, nunca las tres bases duraderas. Regresiones de servicios incluyen stress40 sesiones/1.280 eventos. No se modifica esquema en esta fase ni se migran fuentes reales.

Comandos: build --no-restore de GameSave.Checks.csproj, --gameplay-observer y once modos seguros previos, local-persistence/run-checks.ps1. Biblioteca/ejecutores0errores/0advertencias. Rebuild completo TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild, GodotProjectDir hacia integration/sqlite/.work/:0errores,63 advertencias históricas ParallaxBackground,ninguna nueva. MSBuild89 fuentes, una referencia a biblioteca, cero fuentes backend/tests filtradas. Sin cambios de project.godot/TwoSides.csproj, sin restore de paquetes ni Node/Godot/Atlas.

### Integridad y guía manual

Comparación final:1.538 archivos protegidos con tamaño/SHA-256/fecha idénticos, incluidos biblioteca/esquema/StatisticsService/pantalla, escenas, personajes/recursos/biomas, FinNivel/finales y configuración. Los9 archivos de las tres bases/manifiestos/leases permanecen idénticos: la runtime2+extensión1 NO fue usada por las pruebas ni recibió eventos ficticios. Solo cuando el usuario ejecute Godot se producirán eventos reales. .env278bytes,SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, verificado separadamente antes/después sin valores/credenciales ni cambios de propietario/ACL. Riesgo ACL de B00 pendiente.

Guía manual propuesta:
1. Abrir esta copia sin Node/internet, usar perfil/partida existentes; no crear otra partida para probar captura. Confirmar consola sin nuevos errores y ausencia de HTTP.
2. Entrar a cada bioma decidido en orden libre; jugar más de5s, pausar más de5s, reanudar, perder y esperar en Game Over. El personaje/ambiente/recursos se comportan igual; no tomar otra decisión.
3. Reintentar y reiniciar voluntariamente, también doble clic. Debe haber una sola transición, misma elección y recursos iniciales existentes. Una solicitud no se etiqueta como carga exitosa hasta nuevo guard.
4. Ir a menú de niveles y principal/Estadísticas, esperar y volver. Esos tiempos no son efectivos animales. La pantalla conserva su diseño y seguirá mostrando No disponible para métricas no expuestas por StatisticsService; no se cambió para mostrar la nueva captura.
5. Salir por botón y cerrar por ventana; en una fase técnica autorizada consultar sesiones/events/intervals reales y cobertura para comprobar una sesión por ejecución, cierres normales, ausencia de duplicados y pausas fuera de efectivo. Sin volcar nombres/decisiones al reporte.
6. Probar foco/suspensión y cierre inesperado solo con aceptación de la posible pérdida de cola no confirmada; al abrir, esperar interrupted, no duración ficticia. No dañar la base ni bloquearla para probar errores: esos casos son sintéticos.
7. Cualquier diagnóstico [Local telemetry] significa posible cobertura incompleta, nunca permiso de borrar/reinicializar datos. Aportar código/traza sin secretos y acción que lo produjo.

Siguiente paso recomendado: validación runtime de captura/tiempos/cierre y revisión técnica readonly autorizada de eventos reales; después, otra fase para exponer métricas con cobertura en Estadísticas. No agregar ahora UI, CompleteBiome, finales, checkpoints, Atlas/AWS o B05. Trabajo detenido al terminar D4B.

## B04.2B.2B.2D.4C — Verificación real y actividad visible (2026-10-27 Guatemala)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME DE LA VISTA PENDIENTE.** El usuario informa D4B15/15 comprobaciones manuales satisfactorias y sin errores nuevos. No se asumen conteos exactos de esas acciones: esta fase audita lo efectivamente persistido.

### Etapa A superada antes de editar producción

Se verificó Godot/ejecutores cerrados. Herramienta temporal bajo local-persistence/.work/event-audit (ignorada por Git) compilada con biblioteca existente y caché local; no se incorpora otro sistema de producción. Ruta única runtime fija; sin reparse points bajo raíz, sin WAL/SHM/journal. FileAccess.Read/FileShare.Read sobre base y lease impide aceptar escritores durante la lectura. SQLite mode=ReadOnly, pooling=false y query_only=ON. No se usa OpenRuntimeOrCreate, ni inicialización/migración/recovery/checkpoint. Si aparecen procesos o sidecars, se detiene la inspección.

GameplayEventSchema.Verify, GameSaveService, StatisticsService y GameplayEventService se usan como APIs reales; SQL parametrizado/constante de solo lectura complementa comprobaciones de intervalos y coherencia no expuestas en API pública. integrity_check=ok, foreign_key_check sin filas, base2+extensión1. No se imprimen perfil, nombre, decisiones personales ni IDs de jugador/sesión.

Resultados reales anonimizados, antes y después de integrar consultas:
- Sesiones:3 registradas,3 cerradas,0 interrupted,0 abiertas.
- SESSION_STARTED3 y SESSION_ENDED3.
- ANIMAL_SEGMENT_STARTED7, ANIMAL_DIED3, ANIMAL_RESTART_REQUESTED1, ANIMAL_RETRY_REQUESTED1, ANIMAL_SEGMENT_EXITED7.
-81 intervalos confirmados.
- Tiempo efectivo total confirmado:37.614ms (37.614 segundos).
- Partida actual por bioma: ocean9.946ms, jungle18.348ms, desert9.320ms; forest/tundra sin intervalos registrados (null, no0).
- Tiempo registrado no efectivo por clasificación: Background43.549ms, GameOver5.669ms, Loading3.848ms, Menu48.191ms, Paused7.396ms.
- Incomplete=false para esas sesiones cerradas y cobertura registrada; HistoricalCoverageUnknown=true.

Las cifras de milisegundos usan punto como separador de miles en esta lista salvo el equivalente en segundos expresado explícitamente. La UI formatea segundos con tres decimales y punto decimal invariante, por ejemplo37614ms→37.614 s confirmados.

Cero duplicados de EventId o clave idempotente, solapamientos entre intervalos de una sesión, tiempos negativos, asociaciones animales inválidas, más de una sesión abierta, solapamientos de sesiones cerradas según UTC, tiempo activo posterior a muerte/salida/request, retry sin muerte previa o intervalos fuera del límite de sesión. La comparación temporal UTC es comprobación orientativa, no reloj usado para acumular duración.

Los eventos SESSION_* por contrato no pertenecen a una partida; no se consideran referencias faltantes. Todos los eventos animales tienen GameId/BiomeId válidos y canónicos y vínculos de sesión/run válidos. No hay eventos de finalización falsa. No hay obligación de que forest/tundra tengan tiempo si no se dispone de un registro de acciones del usuario que lo exija: se informa ausencia, no se fabrica cobertura.

Comparación adicional de dominio contra el respaldo inmediato D4A2, cuyo hash se verifica: perfiles, partidas, biomas, decisiones, consecuencias, snapshots y local_operations idénticos por filas/huellas canónicas. Así se comprueba que la captura no alteró datos anteriores, sin publicar los valores. Lecturas repetidas conservan hash/tamaño/mtime de runtime.

La auditoría confirma coherencia estructural y persistencia, no demuestra por sí sola cada segundo de pausa del motor. Esa exclusión se apoya en tests del observador y prueba manual. No se comparan conteos contra cantidades de acciones nunca aportadas. La etapa B solo comenzó tras AuditPassed=true.

### Cambios de etapa B

Producción: local-persistence/src/StatisticsModels.cs.txt, StatisticsRepository.cs.txt, StatisticsService.cs.txt e integration/sqlite/LocalStatisticsScreenState.cs (formateador existente). Pruebas: nuevo ActivityStatisticsChecks.cs.txt y dispatcher GameSaveChecks.cs.txt. Documentación: siete documentos autorizados. Total13 archivos. La herramienta temporal solo vive en .work y es de lectura.

No se cambian adaptador, controlador visual de nodos/scroll, observador, servicios de escritura, esquema/migración, gameplay, pausa/Game Over, FinNivel, finales, proyectos ni escenas. La sección nueva se agrega al texto plano existente; no se duplican nodos ni se crea otra pantalla.

StatisticsRepository.Activity reutiliza GameplayEventRepository dentro de la MISMA transacción UnitOfWork.Read que el resto del resumen, con carga cacheada por consulta. Comprueba presencia/versión de extensión y no la crea si no existe. Se reutilizan Sessions/Events/Intervals y los filtros de dueño existentes; no se encadenan varias APIs que abrirían snapshots diferentes. Las colecciones completas evitan truncamiento.

Contratos añadidos como propiedades opcionales para compatibilidad:
- PlayerStatistics.Activity: cobertura local de todas las sesiones registradas.
- PlayerStatistics.HistoricalActivity: solo registros vinculados a partidas no actuales.
- GameStatistics.Activity: solo eventos/intervalos de ese GameId.
- ActivityStatistics: Sessions, Deaths, RestartRequests, RetryRequests, EffectiveMs, ByBiome, Incomplete e HistoricalCoverageUnknown.
- BiomeActivityStatistics: BiomeId y EffectiveMs tipado StatisticCount.

No se cambia Uncollected del contrato previo para reinterpretar datos históricos; la vista elige Activity cuando hay sesiones registradas y conserva el estado anterior si no hay captura. Los tres alcances aparecen con títulos distintos. Una sesión puede participar en varias partidas: sus conteos por game/historia no son aditivos; el total local cuenta cada SessionId una vez, y los intervalos efectivos no se suman dos veces.

Disponibilidad:
- Sin extensión: NotAvailable/null, no se migra.
- Extensión sin captura o bioma sin intervalos: NoData/null («Sin datos»), más aviso de actividad histórica desconocida.
- Run con cobertura y ningún evento de un tipo: Available0 representa cero SOLO en cobertura registrada, no cero histórico de toda la vida.
- Intervalo confirmado0..0: tiempo Available0.
- Sesión abierta/interrupted o intervalos faltantes: muestra únicamente suma duradera y aviso Incomplete; no se extrapola hasta la consulta ni se cierra/repara la sesión.
- HistoricalCoverageUnknown siempre verdadero: la actividad anterior al inicio de instrumentación no puede reconstruirse.

Tiempo efectivo suma solo ActiveAnimal/ActiveHuman ya confirmados; las pausas, menús, carga, fondo y Game Over no se añaden. El observador actual solo emite ActiveAnimal, no se inventan intervalos humanos. Fechas de partida/attempt_number no se usan como contadores o duraciones.

La UI mantiene perfil, decisiones, progreso, consecuencias, partida actual, historial y scroll. Añade «ACTIVIDAD LOCAL CONFIRMADA», actividad de cada partida y resumen histórico, sesiones, segundos efectivos, cinco subtotales, muertes y solicitudes confirmadas de reinicio/reintento. Las etiquetas dicen solicitudes: no se presentan como transiciones exitosas. Se conserva la advertencia de cobertura anterior desconocida y otra de incompleta cuando corresponda.

Abrir/reabrir Estadísticas conserva el flujo de una consulta asíncrona por apertura/retry, texto plano sin BBCode/IDs sensibles y retorno al menú. No registra sesiones/eventos ni fuerza flush por consultar. El observador independiente ya existente puede confirmar su heartbeat real de estado Menu mientras el usuario está allí; ese tiempo no es efectivo y no es una escritura provocada por la consulta.

### Pruebas y compilación

**418 comprobaciones C# aprobadas, cero fallidas:**23 nuevas actividad +31 observador +41 eventos +24 pantalla +39 consultas +19 Game Over/navegación +21 reinicio +11 retorno +29 entrada animal +30 decisiones +30 selección +35 menú +42 progreso +43 SQLite. Las395 anteriores se reejecutan.

Las23 nuevas cubren historia sin extensión/captura, sesión cerrada/abierta/interrupted, varias sesiones, muerte distinta de retry y request, evento repetido idempotente, exclusión de pausa/menú/fondo/derrota/carga, cinco subtotales y suma total, cero medido vs ausencia, sesión sin actividad animal, scopes activo/histórico, readonly/bytes/fechas/decisiones/ambiente intactos, etiquetas/formato, esquema incompatible controlado y rechazo de solapamiento. Los tests anteriores de pantalla cubren apertura, retorno, doble clic, ausencia de nodos duplicados por binding/diseño y error local. No se afirma ejecución de escenas ni señales reales.

Fixtures independientes bajo local-persistence/.work/databases/<UUID>; ninguna prueba usa la runtime como fixture. La auditoría de lectura real es una etapa distinta de la suite sintética. Se recompiló el helper de auditoría con las consultas nuevas y se verificó que coinciden con GameplayEventService en sesiones, muertes, requests y tiempo total reales. No se usa la lectura para escribir registros.

Comandos: build --no-restore de GameSave.Checks.csproj; --activity-statistics y doce modos seguros anteriores; local-persistence/run-checks.ps1. Biblioteca/ejecutores0errores/0advertencias. Rebuild completo TwoSides.csproj --no-restore --disable-build-servers -nodeReuse:false -t:Rebuild con GodotProjectDir hacia integration/sqlite/.work/:0errores,63 advertencias históricas ParallaxBackground,ninguna nueva. Sin Godot, Node.js, Atlas, nuevas dependencias o modificaciones a proyectos de producción. Herramienta temporal restaurada solo desde caché local.

### Integridad, limitaciones y validación

Antes de editar producción se registró inventario de1.558 archivos (todo excepto .env); tras fijar los archivos autorizados de etapa B se conserva manifiesto de1.546 archivos protegidos idénticos antes/después. Los9 archivos de las tres bases/manifiestos/leases permanecen idénticos en hash/tamaño/fecha; la runtime NO fue alterada por Codex. Los respaldos solo se leyeron, sin sobrescribirlos. .env278bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, sin valores ni cambios de permisos/propietario. Riesgo ACL de B00 pendiente.

Limitaciones: cobertura histórica desconocida, solicitudes distintas de éxito de navegación y errores de captura que pueden dejar lagunas; sesiones abiertas al consultar mientras se juega se marcan incompletas hasta cierre. Volumen grande materializa colecciones y texto, optimización futura posible. La auditoría actual no atribuye una ausencia de intervalos a fallos sin una secuencia esperada conocida. No se corrigen registros reales, no se rellena tiempo ni se modifica captura.

Guía manual: abrir juego sin internet/Node; Estadísticas debe conservar secciones previas y scroll y mostrar nueva actividad local. Comprobar valores confirmados y advertencias; al ejecutar una sesión nueva pueden cambiar respecto al snapshot auditado, por lo que no exigir las mismas cifras exactas. Jugar/pausar/morir/reintentar/reiniciar, volver a Estadísticas y comprobar aumento razonable de tiempo activo y eventos distintos. Tiempo de menús/pausa no debe sumarse como activo; puede tardar hasta heartbeat/cambio de estado en aparecer lo confirmado. Cerrar normalmente y reabrir debe conservar registros sin duplicarlos. No cambiar decisiones ni borrar bases para probar. Anotar acciones/duraciones aproximadas para investigar discrepancias; aportar consola sin secretos si falla.

Siguiente paso recomendado: validación manual de la vista/alcances y captura real con secuencia registrada. Cualquier corrección de observador/escritura requiere autorización distinta; no se cambia aquí. No CompleteBiome, finales, Atlas/AWS ni B05. Trabajo detenido al terminar D4C.


## B04.2B.2B.2E.1 — Auditoría de metas y finales (2026-10-27)

Estado E.1: auditoría documental completada. Entregables: BIOME_COMPLETION_AUDIT.md, COMPLETE_BIOME_INTEGRATION_PLAN.md y FINAL_FLOW_AUDIT.md. FinNivel local no llama CompleteBiome; el servicio y adaptador existen. Falta coordinación, eventos y transición del quinto. No se encontró evaluador ejecutable de los tres finales en el ámbito inspeccionado. E.2 requiere autorización; no implementada. Sin B05.


## B04.2B.2B.2E.2A — Actualización de implementación (2026-10-27)

COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE. Véase el informe completo E.2A en [COMPLETE_BIOME_INTEGRATION_PLAN.md](COMPLETE_BIOME_INTEGRATION_PLAN.md) y PHASE_HISTORY.md para archivos, comandos, pruebas y guía manual.

FinNivel valida la instancia/tipo/vida del animal y el gate de entrada; LocalGameState prepara un comando CompleteBiome estable y relee SQLite después del recibo. El adaptador conserva el servicio/transacción existentes. AnimalSegmentFlow usa el modal local y navega a selección solo tras confirmación, sin HTTP. Tarjetas completed bloqueadas por el código existente; decisiones y ambiente conservados. Doble señal/clic y reintentos no generan otra finalización. Un fallo de navegación conserva recibo y permite reintentar; pausa se libera al confirmar el cambio.

El quinto guarda su bioma y ofrece, mediante modal/label existentes, una selección recuperable que informa FINAL GLOBAL PENDIENTE. La partida sigue in_progress y Nueva partida bloqueada. No se toca Final.cs/escena, no se evalúan umbrales, no se cierra, archiva ni crea sucesora. La finalización individual está conectada para ocean/jungle/desert/forest/tundra; el flujo global no está resuelto.

Telemetría secundaria: Loading excluye espera SQLite del tiempo efectivo; CompletionConfirmed usa OperationId confirmado como EventId y el FIFO existente, con intervalos ordenados antes del terminal. Fallar estadísticas no revierte ni bloquea progreso. Posible evento faltante tras crash: reconciliación futura basada en recibo/completed/ID y run verificables, sin inventar tiempos ni reescribir dominio; no se implementa ahora ni se añade cola/migración/atomicidad ficticia.

472 comprobaciones aprobadas:54 nuevas y418 regresiones reejecutadas,0 fallidas. Biblioteca/ejecutores0 errores/0 advertencias; Godot C# Rebuild0 errores,63 advertencias históricas ParallaxBackground,0 nuevas. Sin ejecución de Godot; física/UI/SceneTree real pendientes de validación manual. Fixtures únicamente local-persistence/.work/databases/<UUID>.

Tres bases protegidas y archivos asociados (9) idénticos en hash/tamaño/fecha;1.545 archivos fuera del alcance idénticos. .env278 bytes, SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928; sin valores ni cambios ACL/propietario. Riesgo B00 pendiente. Sin Node/Atlas/AWS/B05. Trabajo detenido.

## B04.2B.2B.2E.2B.1 — Recuperación de reglas y diseño global (2026-10-27)

**COMPLETADA COMO AUDITORÍA. E.2B BLOQUEADA PARA IMPLEMENTACIÓN.**
El usuario confirma E.2A validada manualmente:472 pruebas históricas y10/10 manuales, sin errores nuevos. No son nuevas ejecuciones de E.2B.1.

No se recuperó el evaluador auténtico. Final.cs selecciona presentación a partir de EndingService.ConfirmedEnding; GameStateStore valida conteos y resultado recibido, no umbrales. VariablesGlobales y decisiones/ambientes individuales no proporcionan la fórmula. Backend actual solo contiene auth/identity; fixtures con ending preasignado no son equivalencia.

Se revisó el Git local de la copia: nueve commits alcanzables y referencias master/origin/master/origin/main. HEAD5972713c116748d4cb968e092d6d114a3e44b69e; sus árboles no contienen versiones de Final.cs, FinNivel o VariablesGlobales. La PantallaDecisiones.cs antigua en6376cca solo cambia entre escenas A/B. Búsquedas de código/escenas/documentos por commit, historial de rutas y reflog no aportaron evaluador. Sin fetch, checkout, restauración o acceso al proyecto original. Esta conclusión se limita a las evidencias locales disponibles; no afirma que la demostración nunca tuviera evaluador.

Se crean [LOCAL_FINAL_EVALUATOR_PLAN.md](LOCAL_FINAL_EVALUATOR_PLAN.md) y [GLOBAL_PLAYTHROUGH_CLOSURE_PLAN.md](GLOBAL_PLAYTHROUGH_CLOSURE_PLAN.md). Detallan fuentes/rutas/métodos, contrato condicionado, pruebas de equivalencia pendientes, recuperación A–F, idempotencia tras reinicio, diferencia entre resultado/presentación/cierre y futura historia/sincronización sin envío. No inventar fórmula, mayoría ni ponderaciones.

SQLite dispone de campos ending/version/completed_at y estado final_pending, pero no de servicios de preparación/presentación/cierre; UpdateGame no escribe los campos finales y SaveCatalog.Resume no admite ending. El CHECK impide is_current=1 con completed: el cierre futuro debe conservar historia con is_current=0; nueva partida solo por intención explícita posterior. La fecha completed_at requerida ya en final_pending no prueba que el jugador haya visto o salido del final: semántica y evidencia durable pendientes de contrato. Reglas initial-state-only-1 no certifican finales narrativos.

Recomendación para E.2B.2: obtener fuente/commit o tabla original verificable y autorizar su lectura si está fuera de la copia. Alternativa distinta: aprobación explícita del usuario de reglas nuevas, sin llamarlas recuperación histórica. No adoptar reglas ni implementar antes de resolverlo. Preservar controlador visual/textos/animaciones y flujo E.2A de final global pendiente.

No se implementaron servicios, pruebas o código. No build, tests, Godot, Node, CompleteBiome, SQL, Atlas, AWS o B05. Las pruebas de equivalencia no se ejecutaron por falta de oráculo. Solo seis documentos autorizados cambiados. Bases protegidas y nueve archivos asociados verificados por hash/tamaño/fecha sin cambios; .env278 bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, sin valores ni cambios ACL/propietario. Riesgo B00 pendiente. Detenido al terminar auditoría.


## B04.2B.2B.2E.2B.2 — Finales locales autorizados (2026-10-27)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** El usuario autorizó regla nueva definitiva, no recuperada del evaluador original:0/1/2 reject→bad;3/4→medium;5→good, exclusivamente cinco decisiones canónicas de cinco completed de la misma partida. Versión narrativa separada local-ending-reject-count-1; se conservan versiones de partida/decisiones.

Informe completo, inventario exacto y guía manual en GLOBAL_PLAYTHROUGH_CLOSURE_PLAN.md (apartado E.2B.2). Un evaluador puro centraliza la regla; GameSaveService.PrepareFinal/CloseGame usan transacción/recibos existentes y esquema2 sin migrar. final_pending persiste resultado antes de navegar; cierre solo por acción explícita de salida, completed/is_current0 e historia intacta. Continuar recupera cinco completed sin resultado o final_pending después de reinicio, sin repetir decisiones/metas. Nueva partida es explícita y solo posterior al cierre, con perfil igual, GameId nuevo y cinco biomas limpios/disponibles.

Final.cs consume SQLite y sale localmente: escena/textos/tween/nodos/recursos intactos, sin HTTP/login. AnimalSegmentFlow coordina quinto; menú recupera finales. FinNivel/CompleteBiome y mecánicas intactos. StatisticsService únicamente reconoce la versión final nueva para metadatos, ajuste informado previamente; no se alteran agregados o eventos. CompletedAt indica preparación del resultado; recibo close_game/ArchivedAt indican cierre. No existe ni se afirma marcador durable de “final leído”.

598 comprobaciones aprobadas:126 nuevas y472 regresiones reejecutadas,0 fallidas finales. Biblioteca/ejecutores0 errores/0 advertencias; Godot C# Rebuild0 errores,63 advertencias históricas ParallaxBackground,0 nuevas. Sin ejecución de Godot; visual/navegación/pausa real requieren manuales. Las10/10 manuales anteriores son E.2A, no esta fase.

Tres bases protegidas y9 archivos asociados idénticos en hash/tamaño/fecha;1.542 archivos fuera de alcance idénticos. .env278 bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, sin valores ni cambios ACL/propietario; riesgo B00 pendiente. Solo fixtures nuevas para escrituras. Sin migraciones, Node/Atlas/AWS/B05. Probar manualmente good/medium/bad en partidas sucesivas sin editar decisiones ni borrar historia; incluir reinicio antes de salir del final, cierre y nueva partida. Trabajo detenido.


## B05.1 — Auditoría y diseño de sincronización global (2026-10-27)

**COMPLETADA SOLO COMO AUDITORÍA Y DISEÑO.** B05.2 NO iniciada. El usuario confirma E.2B.2 validada:598 pruebas anteriores y12/12 manuales, cero errores nuevos. Esos resultados son antecedentes, no ejecuciones de B05.1.

Entregables nuevos:
- B05_SYNC_ARCHITECTURE.md: inventario real, autoridad SQLite, outbox propuesta, captura/reconciliación, tipos de reporte, orden/dependencias, idempotencia y riesgos.
- B05_IDENTITY_AND_SECURITY_PLAN.md: identidad de instalación/perfil/cuenta, credencial protegida, sesiones opacas, recuperación y plan correctivo B00 sin ejecutarlo.
- B05_SYNC_API_CONTRACT.md: endpoints versionados propuestos, esquemas/límites, recibos por operación, validaciones, autorización, conflictos y reintentos.
- B05_GLOBAL_STATISTICS_PLAN.md: métricas/fuentes/fórmulas/denominadores, cobertura, limitaciones y panel administrativo conceptual.
- B05_IMPLEMENTATION_ROADMAP.md: B05.2–B05.8 en entregas pequeñas, archivos/migraciones previsibles, fixtures, dependencias y criterios de aceptación.

Hallazgos: Express5.3.0 y Argon2id reales; registro/sesión/me en memoria con tokens opacos900s. No JWT, Zod, Mongoose, roles admin/player implementados, conexión Atlas, modelos Mongo de partidas/decisiones/sesiones, estadísticas/admin o recepción sync. src/database/mongodb/.gitkeep es placeholder. Tests de identidad/auth inspeccionados, no ejecutados. SQLite basev2+gameplayv1 tiene IDs y hechos durables pero no outbox/sync ACK. Journal remoto legacy24hex no se compone como cola del runtime UUID; un comentario de extensión futura tampoco es implementación.

Decisiones de diseño propuestas: réplica ANALÍTICA mínima, no cloud-save ni autoridad remota sobre gameplay. Tipos game.report/session.report/gameplay.event/gameplay.interval con IDs/versión/binding/huella canónica. Nueva extensión syncv1 separada, sin modificar DDL previos; leases, cinco estados y confirmaciones durables. Captura después de dominio para que una cola fallida no revierta progreso; recuperar hechos existentes desde fuentes/checkpoints, sin fingir cada revisión intermedia ni eventos/tiempos ausentes.

Recepción con claves únicas por operación y hecho; misma carga devuelve recibo, distinta produce conflicto. Commit remoto y respuesta HTTP no son atómicos con SQLite; ACK perdido se reenvía mismo ID. Revisiones antiguas no retroceden proyección; dependencias de sesión/run diferidas. No “HTTP exactamente una vez”. Sesiones/decisiones/intervalos deduplicados y proyecciones no se suman en cada revisión.

Identidad: nombre solo local, localPlayerId existente y installationId nuevo por persistir, technicalAccountId durable futuro; registro idempotente/credencial por instalación con protección Windows propuesta fuera de repo/OneDrive. Renovación por reautenticación, no alta nueva ni JWT obligatorio; secreto perdido no se recupera por nombre. Transferencia/multiPC requiere contrato posterior, no merge automático.

B00: SID S-1-5-21-452213140-3335518246-3718727391-3248334987 registrado no resuelto con Modify/Synchronize heredado desde ACE explícita de raíz de copia. No nueva identificación/justificación/corrección en B05.1. Procedimiento futuro: repetir metadatos/identidad/ascendencia, evidencia privada y plan de descriptor exacto/rollback, autorización separada de alcance, cambio mínimo y verificación posterior. Revisar permisos de ancestros y copias OneDrive; hash íntegro no resuelve exposición. Antes de credenciales reales/despliegue se necesita esa fase de seguridad, gestión de secretos de servidor y roles administrativos separados. No modificar permisos por inferencia.

Métricas globales actuales: NINGUNA API global funcional. Fuentes locales permiten diseñarlas, pero requieren identidad durable/outbox/ingesta/consultas. Distinguir registrado de activo sincronizado, preparado de cerrado, solicitud de reinicio de éxito, desconocido de0 y muestra recibida de todas las instalaciones. Reglas finales se conservan:local-ending-reject-count-1;5reject good,3/4medium,0–2bad. Sin cambios de agregados ni gameplay.

Inspección: backend/package.json, app/server/config, modules/auth/identity, middleware/utils y tests; modelos/DDL/servicios/estadísticas/observador/contratos locales y cliente legacy; documentación de identidad, seguridad, estadísticas y E.2B.2. Referencias públicas oficiales de MongoDB/Microsoft/AWS consultadas para diseño, sin exportar datos reales, autenticar cuentas o utilizar servicios cloud.

Verificación: únicamente los5 documentos nuevos y PHASES/PHASE_HISTORY/DECISIONS modificados. Sin producción, escenas, dependencias, tests/builds, Node/Godot, SQL, migraciones, eventos, ACL, Atlas o AWS. Las3 bases protegidas y9 archivos asociados conservan hash/tamaño/fecha; manifiesto de1.564 archivos fuera del alcance idéntico. .env278bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928; sin contenido mostrado/leído como texto ni permisos/propietario modificados.

Próximo paso recomendado: autorizar B05.2A de seguridad, empezando por comprobaciones readonly actualizadas y una propuesta concreta de ACL/ruta privada revisable; no aplicar cambios hasta su autorización específica. Después identidad con secretos/fixtures sintéticos, sin Atlas real ni migrar runtime por extensión de alcance. Detenido al finalizar B05.1.


## B05.2A — Diagnóstico ACL e identidad técnica (2026-10-27)

**COMPLETADA ÚNICAMENTE COMO AUDITORÍA Y DISEÑO.** B00 no se declara resuelto; B05.2B/B05.3 no iniciadas.

Nuevos documentos: [B05_B00_ACL_DIAGNOSIS.md](B05_B00_ACL_DIAGNOSIS.md) y [B05_IDENTITY_IMPLEMENTATION_PLAN.md](B05_IDENTITY_IMPLEMENTATION_PLAN.md). Contienen evidencia de ACE/metadatos, límites de acceso efectivo, corrección exacta condicionada a inventario/permiso y rollback; autenticación real, contratos player/admin y JWT propuesto, archivos y pruebas futuros.

Hallazgos ACL actuales:
- Propietario de .env/backend/raíz: LAPTOP-F337QTKK\\luis2. Herencia habilitada, .env sin ACE explícitas y sin ReparsePoint/LinkType.
- SID A S-1-5-21-452213140-3335518246-3718727391-3248334987 conserva Allow Modify/Synchronize heredada en .env/backend desde ACE explícita OI/CI en la raíz exacta de la copia.
- SID B S-1-5-21-307222809-3929607348-3502628415-466486063 tiene concesión equivalente; el registro histórico disponible no acredita cuándo apareció, no se declara cambio reciente.
- Ninguno resuelve con Windows (IdentityNotMappedException) ni coincide con usuarios/grupos locales enumerados; no están en el token del proceso consultado. No atribuirlos a cuentas eliminadas, atacante, dominio o herramienta concreta.
- SYSTEM/Administradores/luis2 conservan ACE FullControl heredadas. Everyone tiene Deny DeleteSubdirectoriesAndFiles en carpetas (heredado desde OneDrive); esa ACE no está en .env y no es un Deny universal de Modify.
- Ambos SID aparecen también en cuatro muestras de documentación/código/escenas. Cinco ancestros relevantes consultados no contienen esos SID; origen inmediato explícito demostrado en raíz de copia. Ancestros OneDrive/Desktop tienen metadatos reparse, sin certificación de proveedor/final-path o hardlinks.
- Se verificó lectura de metadatos/integridad, NO escritura/borrado/impersonación/AccessCheck de identidades ajenas. FullControl declarado no certifica cualquier acceso efectivo ante otros controles.
Conclusión: concesiones a principales no identificados/justificados CONFIRMADAS; existencia de una cuenta activa que pueda usarlas y compromiso práctico NO DETERMINADOS.

Corrección C1 propuesta NO ejecutada: retirar solo la ACE explícita exacta A(Allow,0x1301bf,OI/CI) en la raíz, preservando owner/herencia/otras ACE. La propagación afectaría descendientes y requiere inventario+autorización expresa, especialmente por bases/escenas/archivos protegidos. No es modificación limitada a .env. C2 para B requiere evaluación/aprobación separadas; quitar A no elimina riesgo de B. Alternativa focalizada en .env no resuelve por sí sola derechos de reemplazo de ancestros. Almacén privado fuera de OneDrive requiere otra ruta/permiso/configuración aprobados. No quitar indiscriminadamente heredadas ni cambiar propietario.

Verificación/reversión futuras: repetir metadata/ACL/identidades, detener ante diferencia, respaldo privado solo de descriptores/rutas/flags sin contenidos, diff de una/dos ACE aprobado, validar acceso legítimo y herramientas; ante fallo parcial restaurar solo DACL de objetos afectados desde inventario sin pisar cambios concurrentes, ni alterar contenido/fechas/owner. No se creó respaldo ni se ejecutó corrección en esta auditoría.

Identidad actual revisada en backend/src/tests/package: Express, Argon2id, registro/sesión/me y tokens OPACOS900s con repositorios/cupos en memoria; no JWT, roles admin/player, Mongoose/Atlas, Zod o CORS allowlist operativos. Auth está integrado en /identity/me, no middleware reusable de autorización. Tests inspeccionados, no ejecutados. Nombre solo local; instalación/perfil/cuenta y custodia de secreto aún requieren coordinación duradera.

Diseño JWT: perfil opcional futuro RS256 allowlist, issuer exacto configurado, aud two-sides-sync-api, subject técnico, exp/nbf/iat/jti y binding/version, clave privada solo servidor; validación exclusiva de tipo/alg/firma/claims y revocación/estado. Admin por proveedor OIDC/MFA con emisor/audiencia/permisos separados; rol nunca elegido por body ni asociado a Windows Administradores. Conservar opacos sigue siendo opción inicial B05.1; B05.2A no adopta ni implementa JWT.

B05.1 cubre por diseño TLS/owner/binding/límites100ops/256KiB/schema/idempotencia/reintentos y separación admin, pero no lo implementa. Cliente modificado puede falsificar decisiones/metas/muertes/tiempos; servidor valida coherencia/cotas/dedupe sin prometer antitrampas absoluto.

Integridad: .env COINCIDE con referencia histórica, sin mostrar tamaño/hash observados ni valores. SDDL/propietario de .env/backend/raíz y fecha/atributos del archivo comparados antes/después sin cambios. Tres bases y9 archivos asociados idénticos en hash/tamaño/fecha;1.567 archivos fuera de alcance idénticos. Solo2 documentos creados y5 autorizados actualizados. Sin producción, SQLite/SQL, permisos/herencia/owner, cuentas, servicios, Node/Godot/tests/builds, Atlas/AWS o nuevas dependencias.

Siguiente paso: autorización específica para B05.2B con inventario/descriptor exactos antes de cualquier ACL y alcance de identidad/secretos sintéticos separado. No usar credenciales reales ni migrar runtime por inferencia. Trabajo detenido.


## B05.2B.1 — Preparación de corrección de ambas ACE (2026-10-27)

**COMPLETADA COMO PREPARACIÓN/VERIFICACIÓN, SIN CAMBIOS ACL.** Creado B05_B00_ACL_CHANGE_PROPOSAL.md con inventario, candidato exacto, respaldo privado diseñado, rollback y validaciones. B05.2B.2 no iniciada.

Inventario ACL completo inicial de la copia:14.453 objetos (1.928 directorios/12.525 archivos), ambos SID presentes en todos;0 lecturas fallidas,0 reparse internos omitidos,0 DACL protegidas/no canónicas. Incluye dependencias/build/.git/.godot. Raíz tiene6 ACE; propuesta C-AB retira únicamente2 Allow explícitas0x001301BF/OI|CI/Propagation=None, una por SID:
A S-1-5-21-452213140-3335518246-3718727391-3248334987 y
B S-1-5-21-307222809-3929607348-3502628415-466486063.
Ambos siguen no resolubles y no presentes en el token propio; no se consideran maliciosos ni eliminados automáticamente.

Hallazgo nuevo frente a B05.2A: .git tiene4 ACE explícitas adicionales para esos SID, TODAS DENY (0x40130156 OI/CI InheritOnly y0x00130156 sin herencia por cada SID). No son concesiones residuales; corregida expresamente la interpretación preliminar comunicada durante la inspección. Se preservan todas. Retirar Allow raíz elimina sus copias heredadas, no esas Deny. No retirar por SID indiscriminadamente. En .git hay281 directorios/6.303 archivos con las combinaciones de herencia detalladas en la propuesta.

Retenidas en raíz: Deny Everyone DeleteSubdirectoriesAndFiles heredada y FullControl heredadas de SYSTEM/Administradores/luis2; owner/herencia intactos. La candidata6→4 se comprobó en memoria, no se escribió.

Impacto: la propagación alcanzaría backend/.env, código/escenas/proyectos, paquetes/herramientas/cachés, .git y runtime DB/manifest/lease. No cambios de contenido pero sí DACL; requiere autorización explícita y permisos de entorno compatibles (incluida área .git de solo lectura, sin evasión por escritura del padre). Las dos bases AppData y ancestros fuera del proyecto no serían destino. OneDrive no se deshabilita; su funcionamiento posterior no se garantiza sin pruebas autorizadas.

Respaldo futuro propuesto bajo C:\Users\luis2\AppData\Local\TwoSides\SecurityBackups\ACL\copy-06dc7ade-b3cd-425b-8d79-90dde8ef1ac6\B05.2B.2\<UTC>-<UUID>, fuera de OneDrive/workspace. NO creado. DACL/owner-grupo de referencia/flags/identidad de objetos/rutas/checksums/candidato, sin secretos ni datos SQLite. Verificar roundtrip de todos los descriptores y ACE originales; READ_CONTROL para captura, WRITE_DAC para aplicar/restaurar, sin takeown/cambio owner/elevación automática. SACL no incluida ni modificada. Hardlinks/final-path/concurrencia y capacidad de rollback son preflight obligatorio pendiente. Restaurar solo DACL de objetos afectados, sin pisar cambios concurrentes ni restituir contenidos o falsificar fechas.

La propuesta incluye texto concreto de autorización para ambas ACE y alcance de herencia/backup/rollback. No lo trata como autorización recibida. Validación posterior futura: usuario legítimo, build aislado, apertura manual de Godot, fixtures SQLite e integridad protegida, OneDrive sin errores observados, conservación de Deny/otras ACE y reversibilidad. No se ejecutó ninguna de esas pruebas de escritura o motor ahora.

Integridad .env: COINCIDE con referencia histórica, metadata/owner/SDDL de archivo/backend/raíz conservados. Tres bases y9 archivos asociados idénticos en hash/tamaño/fecha;1.571 archivos fuera del alcance idénticos. Inventario de ACL de objetos originales comparado antes/después de documentación. Únicos cambios documentales: propuesta nueva y PHASES/PHASE_HISTORY/DECISIONS. Sin ACL, owner/herencia, producción, SQLite/SQL/migración, JWT/roles, servidores, Godot, Atlas/AWS o B05.3. B00 no se declara resuelto. Detenido para autorización explícita de B05.2B.2.


## B05.2B.2A — Preflight y respaldo privado (2026-10-27 Guatemala)

**COMPLETADA como verificación, respaldo ACL y ensayo sintético limitado. Corrección real NO aplicada; B00 sigue pendiente.**
Reporte detallado: B05_B00_ACL_PREFLIGHT_REPORT.md.

Usuario informó OneDrive desactivado manualmente. OneDrive.Sync.Service permanece presente; no se interpretó como sync activa. Sin Godot/Node/build/ejecutores observados,13s de vigilancia sin cambios y2 capturas completas iguales de ACL/metadata/FileId/ruta final antes de exportar. No es garantía universal o VSS: CIM denegado y154 rutas de procesos no visibles, sin elevar privilegios. Lecturas estables suficientes para respaldo de metadatos, sin escrituras en proyecto.

Inventario actual14.465 objetos (1.931 directorios/12.534 archivos), todo dentro de raíz,0 reparse internos/errores,0 archivos con NumberOfLinks>1 o identidades duplicadas. fsutil confirmó una ruta para .env/runtime/manifest/lease/csproj. Dos Allow explícitas raíz0x001301BF/OI|CI/Propagation=None confirmadas y4 Deny .git intactas; no se identificó como malicioso un SID desconocido.

Respaldo creado en:
C:\Users\luis2\AppData\Local\TwoSides\PrivateBackups\B05_ACL\20261028T041722158Z-6ab71a16-74f2-4e64-b35c-802bc18133dc
acl-descriptors.jsonl:28756910bytes; SHA-256 E9372D35D31E53F9C8B6A8A1FEE58ED846043B49DF889852D9DA3FF5A837ABF6.
manifest.json:1041bytes; SHA-256 4AA511264176F97DF26504ACCF350A148A74715F0D8B1B7D780F01B9CD942609.
Fecha UTC 2026-10-28T04:17:39.7607628Z (2026-10-27 22:17:39.7607628 Guatemala).
Creador LAPTOP-F337QTKK\\luis2, token no administrador. Herencia privada existente solo usuario/SYSTEM/Administradores; no se deshabilitó herencia ni cambió propietario para proteger backup. Incluye DACL/ACE/owner-grupo de referencia/flags/rutas/identidad, SIN contenidos de archivos, secretos o datos SQLite. Lectura completa, reconstrucción binario/SDDL, digest/cantidad/manifiesto/hash verificados; respaldos anteriores no sobrescritos.

Ensayo: árboles sintéticos privados,2 directorios+1 archivo por prueba. Adición Deny WriteData solo sintética, escritura denegada, restauración sección Access, escritura permitida. Se conservan intentos: uno falló antes de DACL por envoltura de array JSON corregida; desde DACL nuevas Windows añadió AutoInherited tras restaurar (ACE/acceso recuperados pero SDDL no exacto). El ensayo final partió de una nueva línea base ya AutoInherited y recuperó exactamente AccessSddl/owner/grupo/protección en3 objetos. Todos los14.465 originales usan ese modelo AI, pero ello NO prueba restaurabilidad masiva/.git o privilegios WRITE_DAC en proyecto. No se probó ni modificó owner/SACL. Artefactos/evidencias sintéticos retenidos en privado; no ocultar resultados previos.

Comparación posterior de los14.465 originales: DACL/owner/grupo/protección/FileId idénticos; backup y hashes originales intactos. .env COINCIDE con referencia histórica y metadata/SDDL igual. Tres bases y9 archivos asociados idénticos en hash/tamaño/fecha;1.571 archivos fuera del alcance documental idénticos. No lectura de valores ni SQLite/SQL/migraciones.

Alternativas: A retirar exclusivamente2 Allow raíz conserva4 Deny Git pero requiere autorización de propagación a runtime/.git y permisos de entorno compatibles; backup no equivale a permiso WRITE_DAC. B usar ubicación privada para futuros secretos fuera de OneDrive reduce exposición de secretos nuevos, no corrige ACL de código o exposición histórica; no se movió ninguno. Recomendar B aun si se aprueba A; rotación/carga de configuración por separado.

Próxima aplicación exige nuevo preflight/backup actualizado, control de escritores/enlaces/FileId, aceptación del alcance y rollback limitado de DACL con owner/herencia intactos. Si el entorno mantiene .git readonly, no sortearlo escribiendo el padre. No se ejecutó corrección de seguridad real, Godot/Node/Atlas/AWS/JWT ni B05.3. Únicos cambios en proyecto: reporte nuevo y propuesta/PHASES/PHASE_HISTORY/DECISIONS. Detenido, pendiente de autorización expresa.


## B05.2C — JWT y roles en memoria (2026-10-27 Guatemala)

**COMPLETADA EN CÓDIGO Y PRUEBAS AISLADAS.** Informe completo/inventario en B05_IDENTITY_IMPLEMENTATION_PLAN.md y PHASE_HISTORY.md. JWT mediante jose6.2.13, validadores Zod4.6.7 y tests Vitest5.0.5; dependencias exactas/lockfile, sin scripts de instalación. Argon2id, límites y39 pruebas legacy conservados.

RS256 con claves efímeras de fixture y algoritmo explícito; typ at+jwt/kid,iss reservado de test y aud exacta única,sub UUID,jti sesión conocida,iat/nbf/exp900s y cv/role obligatorios. Firma y claims preceden validación de cuenta activa/sesión/rol real/versión en repositorio. Token inválido401, privilegio/propiedad insuficiente403. Nunca confiar en role de body o payload alterado.

Rutas JWT opcionales configuradas explícitamente: POST /api/v1/technical/registrations y /sessions; GET /api/v1/technical/me, /api/v1/players/:id (propio,player) y /api/v1/admin/status(admin). Registro nuevo no acepta nombre/email/role ni devuelve correo; admin solo fixture opt-in del servidor. Rutas legadas sin /v1 siguen opacas; no aceptan JWT y las nuevas no aceptan opacos. No hay binding installationId ni sync completo implementados: propuesta B05.1 se ampliará/versionará explícitamente después. No admin OIDC/MFA o cuentas reales.

Defaultapp no crea claves ni activa JWT. Config inyectada solo isolated-test; producción se rechaza antes de listen aunque se suministren valores de prueba. Requisitos de claves/issuer/audience de producción son futuro diseño fuera de OneDrive, no .env cargado. Vitest envDir=false y guardas de IO impiden leer .env. Todos los secretos/tokens de tests se generan en RAM; no se imprimen.

89 pruebas backend aprobadas:39 regresiones+50 nuevas,0 fallidas finales. Node24.19/npm11.17; primeros workers bloqueados por sandbox EPERM y reejecutados con permiso de ejecución, sin modificar ACL. HTTP solo loopback/puerto0 de tests y cierre posterior. No Godot ni598 pruebas del juego reejecutadas.

Bases protegidas y9 asociados idénticos hash/tamaño/fecha; .env coincide con referencia y seguridad/metadata igual,4 Deny .git conservadas.677 archivos juego/raíz sin diferencias de metadata/DACL contra backup previo;23 backend existentes sin diferencias ACL/owner. El digest global que incluía caché npm cambió por instalación/logs y no se declara idéntico. Cambios deliberados21 archivos (14 código/dependencias/tests y7 documentos), más artefactos npm. No gameplay/SQLite/estadísticas/evaluador/ACL/herencia/owner modificados.

Persistencia sigue en memoria y se pierde al reiniciar. B00 continúa pendiente; sin Atlas, Godot sync, despliegue, corrección ACL o B05.3. Detenido; próxima implementación requiere autorización.


## B05.2D.1 — Identidad persistente y claves (2026-10-27 Guatemala)

**COMPLETADA únicamente como auditoría y diseño; sin implementación.**

B05.2D.1 COMPLETADA SOLO COMO DISEÑO. B05.2D.2 NO INICIADA. B05.2C conserva su resultado histórico de 89 tests (39+50), no reejecutados aquí. B00 sigue pendiente; no se retiraron ACE, no se cambió propietario/herencia ni se certificó restauración ACL masiva.

Contratos: [identidad persistente](B05_PERSISTENT_IDENTITY_CONTRACT.md), [ciclo de claves](B05_JWT_KEY_LIFECYCLE.md), [plan de pruebas](B05_IDENTITY_PERSISTENCE_TEST_PLAN.md). Las propuestas no habilitan producción ni modifican contratos implementados. Backend/.env conserva la referencia histórica; las tres bases y sus asociados permanecen protegidos. B00 no resuelto: dos Allow no identificadas; respaldo privado y ensayo limitado no garantizan restauración general. Detenido a la espera de autorización, sin iniciar B05.2D.2/B05.3.


## B05.2D.2 — Identidad persistente sintética y continuidad JWT (2026-10-27 Guatemala)

Implementado el ámbito aislado autorizado: repositorio async/vínculo, archivos cifrados privados de prueba, RS256 estable entre procesos, revocación persistida, rutas v2 opcionales y pruebas. MongoDB/Atlas, custodia productiva, cliente Godot y B05.3 NO implementados. La puerta de prueba con base Mongo real sigue pendiente; el archivo sintético no la satisface. B00 sigue pendiente, sin cambios de ACL/propietario/herencia.


### Cierre verificado B05.2D.2 — 2026-10-27 Guatemala

**COMPLETADA EN CÓDIGO, únicamente en el ámbito sintético autorizado.** Resultado final de npm test: **124 aprobadas, 0 fallidas, 0 omitidas**: 39 legacy node:test + 50 regresiones JWT B05.2C + 35 nuevas (26 memoria/contrato/HTTP y 9 archivo/aislamiento). No sumar reejecuciones. Todos los procesos Node y listeners de ensayo terminaron; cero directorios identity-d2-* de ensayo restantes.

Inventario final: 23 archivos deliberados (15 existentes modificados y 8 nuevos): seis código/config de pruebas existentes, un puerto src nuevo, siete archivos nuevos de batería/soporte y nueve documentos autorizados. De 4.839 archivos iniciales inventariados fuera de .git/node_modules/.godot y .env separado, 4.824 permanecen idénticos en hash/tamaño/mtime; ocho añadidos, cero eliminados. No otros cambios de contenido detectados. El lector del manifiesto usa UTF-8 explícito para no confundir nombres con Ñ como altas/bajas.

Tres bases protegidas y nueve archivos asociados: hash/tamaño/mtime idénticos. Backend/.env coincide con referencia histórica y conserva tamaño, fecha y descriptor/propietario; sin lectura de valores. SDDL/owner de raíz, backend, .env y .git idénticos antes/después; no comandos de cambio ACL/herencia/owner. No se afirma una nueva auditoría completa de ACL por archivo de todo el árbol. B00 sigue pendiente con ambas Allow investigadas y cuatro Deny Git conservadas.

No dependencias nuevas, Atlas, AWS, Godot, SQLite/SQL/migración, secretos reales ni producción. Persistencia Mongo/índices/transacciones, recuperación de usuario, DPAPI, keyring/rotación productivos y admin OIDC pendientes. El ensayo de archivo no acredita Atlas ni recuperación de apagón o fin del orquestador. Recomendación: revisión y autorización específica antes de cualquier B05.3; **B05.3 no iniciada, trabajo detenido**.


## B05.3A — Outbox SQLite sintética (2026-10-27 Guatemala)

**B05.3A COMPLETADA EN CÓDIGO únicamente con SQLite sintético.** 64 comprobaciones nuevas +598 regresiones offline reejecutadas:662 aprobadas,0 fallidas. Biblioteca/ejecutores0 errores/0 advertencias; Godot C# Rebuild0 errores/63 advertencias históricas,0 nuevas; motor no ejecutado. B05.3B/B05.4 NO iniciadas. Runtime y dos bases históricas protegidas sin migrar; B00 sigue pendiente.

Contrato, tablas, transiciones, operaciones, limitaciones, pruebas, inventario y plan runtime en [B05_LOCAL_OUTBOX_IMPLEMENTATION.md](B05_LOCAL_OUTBOX_IMPLEMENTATION.md). No inicia B05.3B ni autoriza tocar runtime, HTTP o Atlas. B00 sigue pendiente; sin cambios ACL/propietario/herencia.


## Cierre de integridad — 2026-10-28 Guatemala

La fase comenzó el 2026-10-27 y su cierre se registra el 2026-10-28 según la fecha local del cliente.

Comparación final contra inventario anterior a editar: exactamente nueve archivos existentes autorizados modificados y seis nuevos (15 deliberados), cero archivos originales eliminados. No otros cambios de fuente/documentación;49 artefactos generados de compilación bajo la variante previa integration/sqlite/.work.godot se contabilizan aparte, además de cachés/binarios bajo .work excluidos del inventario. Los dos .cs de ensamblado generados por esa variante fueron retirados únicamente tras comprobar que no existían en baseline; compilación final usa .work/ con separador correcto. No se tocaron fuentes de Godot ni csproj.

Las tres bases protegidas y los nueve archivos asociados conservan exactamente hash/tamaño/mtime. Backend/.env **coincide con la referencia histórica** y conserva tamaño/fecha; no se leyeron valores. Owner/SDDL de raíz, backend, backend/.env, local-persistence y .git idénticos antes/después; no comandos de modificación de permisos/ACE/herencia/propietarios. No nueva auditoría de todos los descriptores del árbol. Riesgo B00 pendiente; dos Allow no resueltas y Deny Git conservadas.

Cero archivos de bases sintéticas restantes bajo .work/databases; cada Sandbox limpió exclusivamente sus archivos propios. Sin motores, servidores, HTTP/Atlas/AWS/Node o cuentas/credenciales reales. Los resultados finales son64 pruebas nuevas +598 regresiones reejecutadas=662 aprobadas,0 fallidas; compilación biblioteca/ejecutores0/0 y Godot C#0 errores/63 advertencias históricas,0 nuevas. Pruebas backend124 y manuales12/12 NO reejecutadas.

**B05.3A COMPLETADA EN CÓDIGO exclusivamente en el ámbito sintético. B05.3B y B05.4 no iniciadas.** Quedan pendientes integración real de captura/reconciliación/checkpoints, binding local en arranque, backfill/migración runtime autorizados, vectores C#/Node y receptor/trasporte remoto. No se afirma atomicidad completa gameplay–Outbox ni procedencia criptográfica de recibos simulados. Trabajo detenido a la espera de autorización expresa.


## B05.3B.1 — Captura y reconciliación sintéticas (2026-10-28 Guatemala)

**B05.3B.1 COMPLETADA EN CÓDIGO exclusivamente en SQLite sintético.** Captura normalizada/reconciliación idempotente, dependencias y auditoría por páginas, sin nuevas migraciones ni cambios de gameplay.51 pruebas nuevas +662 regresiones realmente reejecutadas=713 aprobadas,0 fallidas. Biblioteca/ejecutores0 errores/0 advertencias; Godot C#0 errores/63 advertencias históricas,0 nuevas; motor no ejecutado. B05.3B.2/B05.4 NO iniciadas y runtime NO migrada.

Matriz de hechos, métodos/archivos, garantías, historial, pruebas, limitaciones y plan preciso B05.3B.2 en [B05_OUTBOX_CAPTURE_RECONCILIATION.md](B05_OUTBOX_CAPTURE_RECONCILIATION.md). B00 continúa pendiente. Detenido; sin iniciar B05.3B.2/B05.4.


## Cierre de integridad — 2026-10-28 Guatemala

Comparación antes/después:17 archivos deliberados (12 existentes modificados y5 nuevos), cero originales eliminados. Otros19 archivos existentes cambiados son artefactos generados por Rebuild bajo integration/sqlite/.work.godot (DLL/PDB/config/caché/AssemblyInfo generado); se contabilizan aparte de .work excluido. El toolchain conservó ese destino previo de artefactos pese a pasar GodotProjectDir; no se editó una fuente de Godot ni un csproj para modificarlo. De1.357 archivos iniciales inventariados,1.326 permanecen idénticos en hash/tamaño/mtime; no se declara idéntico todo el inventario cuando hubo recompilación.

Las tres bases protegidas y sus9 archivos asociados conservan exactamente hash/tamaño/mtime. Backend/.env coincide con la referencia histórica y mantiene tamaño/fecha. No se leyó su texto ni se usaron credenciales. Owner/SDDL de raíz/backend/.env/local-persistence/.git y carpeta backend iguales antes/después; no se modificaron ACL/ACE/herencia/propietarios. No es una nueva auditoría exhaustiva de cada ACL del árbol. B00 permanece pendiente, sin retirar las dos Allow ni cambiar Deny Git.

Migraciones SchemaManager/GameplayEventSchema/SyncOutboxSchema originales intactas: no nueva versión, runtime sin migrar. Código de GameSaveService, UnitOfWork, GameplayEventService, escenas, menús, FinNivel, Final, LocalGameState y GamePersistenceAdapter intacto. Cero archivos sintéticos restantes bajo .work/databases; sin restauración de respaldos, Node, HTTP, Atlas, AWS o ejecución de Godot.

Resultado final713 comprobaciones aprobadas,0 fallidas:51 nuevas +662 regresiones realmente reejecutadas. Biblioteca/ejecutores0 errores/0 advertencias; Godot C#0 errores/63 advertencias históricas,0 nuevas.124 backend y12/12 manuales no reejecutados.

B05.3B.1 COMPLETADA EN CÓDIGO únicamente como captura/reconciliación sintética posterior al commit. Sus garantías no incluyen revisiones intermedias ausentes, entrada humana precisa no exportable, telemetría nunca confirmada ni entrega remota. B05.3B.2 y B05.4 no iniciadas. Trabajo detenido; siguiente integración exige autorización expresa.


## B05.3B.2A — Respaldo y ensayo privado (2026-10-28 Guatemala)

Ensayo completado sobre segunda copia privada de runtime, sin migrar original: BackupDatabase read-only bajo bloqueos de escritura; backup y origen hash/metadatos intactos. Copia conservó base2/eventos1 y recibió sync1; integrity_check=ok,FK válidas y todo dominio/estadísticas idénticos. Primera reconciliación658 pendientes/1341 dependencias/0 diagnósticos; segunda en otro proceso0 nuevas,mismos IDs/payload/estados. No envío ni ACK remoto. Migración reaplicada idempotente y fallo precommit revierte otra copia desechable. Es tooling privado, no migrador runtime productivo: DDL exacto/checksum reutilizado sin relajar SyntheticDatabase. No ACL/owner/Godot/HTTP/Atlas/AWS.

Respaldo, SHA-256, conteos anonimizados, resultados, riesgos y plan B05.3B.2B en [B05_OUTBOX_RUNTIME_MIGRATION_TRIAL.md](B05_OUTBOX_RUNTIME_MIGRATION_TRIAL.md). Datos reales solo en privado fuera de Git/OneDrive; no imprimir IDs/decisiones ni restaurar. B00 pendiente. B05.3B.2B/B05.4 no iniciadas.


## Cierre verificado — 2026-10-28 Guatemala

**B05.3B.2A COMPLETADA.** Ensayo y preservación sobre el snapshot capturado satisfactorios; no activación de original. Resultado final de regresiones efectivamente reejecutadas:713 aprobadas,0 fallidas,0 omisiones (43 base+51 reconciliación+64 Outbox+555 restantes offline). Ensayo privado adicional descrito por separado, no sumado como cientos de tests por número de operaciones. Copia/reconciliación nueva0 diagnósticos; fallos provocados solo en copias desechables/sintéticas.

Inventario comparado antes/después:10 archivos deliberados (8 existentes modificados y2 nuevos), cero eliminados. Los1.354 restantes del inventario inicial de1.362 conservan hash/tamaño/mtime; artefactos .work excluidos, sin cambios adicionales de fuentes de Godot, librería local, Node o migraciones históricas.

Tres bases protegidas y9 asociados idénticos en hash/tamaño/mtime. Backend/.env coincide con referencia histórica, mismo tamaño/fecha, sin leer contenido. Owner/SDDL de raíz,backend,.env,local-persistence,.git iguales; sin modificación de ACL/ACE/herencia/propietario o restauraciones. B00 pendiente. Backup privado también conserva hash/tamaño/mtime/descriptor; contenido real no divulgado.

Cero archivos de bases sintéticas restantes bajo .work/databases. Copias PRIVADAS del ensayo/rollback y evidencias retenidas por contener la evidencia del trabajo autorizado, fuera de Git/OneDrive. No se sobrescribieron respaldos anteriores, no se restauró nada y no se ejecutó Godot/Node/HTTP/Atlas/AWS.

Recomendación:B05.3B.2B puede prepararse con autorización expresa basada en este ensayo, con NUEVO preflight y backup del estado vigente antes de tocar original. B05.3B.2B y B05.4 NO iniciadas. Detenido.


## B05.3B.2B — Activación local controlada (2026-10-28 Guatemala)

**B05.3B.2B COMPLETADA EN CÓDIGO; VALIDACIÓN MANUAL GODOT PENDIENTE.** Runtime exacta autorizada migrada a sync1,base2/eventos1 y dominio/estadísticas conservados. Nuevo backup privado y ensayo satisfactorio antes;658 pending/1341 dependencias,segunda pasada0 nuevas.28 nuevas+713 regresiones=741 aprobadas,0 fallidas. Biblioteca/ejecutores0 errores/0 advertencias;Godot C#0 errores/63 históricas,0 nuevas. Sin ejecutar motor/HTTP/Atlas;B05.4 no iniciada.

Preflight,backup nuevo/hash,ensayo,migración,comparación,archivos/pruebas,riesgos y guía manual en [B05_OUTBOX_RUNTIME_ACTIVATION.md](B05_OUTBOX_RUNTIME_ACTIVATION.md). B00 pendiente;sin cambios ACL/propietario,autenticación remota,HTTP/Atlas/AWS oB05.4. Esperar validación manual e instrucciones.


## Cierre de integridad — 2026-10-28 Guatemala

**B05.3B.2B COMPLETADA EN CÓDIGO; VALIDACIÓN MANUAL GODOT PENDIENTE.**28 nuevas+713 regresiones efectivamente reejecutadas=741 aprobadas,0 fallidas. No sumar repeticiones ni filas de cola como tests. Ninguna prueba automatizada de errores se ejecutó contra runtime; su escritura fue exclusivamente el comando de mantenimiento autorizado tras ensayo y respaldo.

Inventario final comparado:20 archivos deliberados (15 existentes modificados y5 nuevos), cero eliminados;19 artefactos de compilación existentes bajo integration/sqlite/.work.godot cambiados se contabilizan aparte de .work excluido. Del inventario inicial1364,los1330 restantes permanecen idénticos en hash/tamaño/mtime. Sin cambios de migraciones históricas,fuentes originales de dominio/decisiones/finales o Node.

De9 archivos asociados a las tres bases, cambió SOLAMENTE runtime-game/save.sqlite3 por la migración sync1 y658 filas pendientes autorizadas. Las dos bases históricas AppData, sus manifiestos/leases y ownership.json/store.lease runtime permanecen idénticos en hash/tamaño/mtime. Runtime conserva FileId/owner/descriptor; tablas originales y estadísticas lógicas idénticas verificadas por la herramienta. No afirmar runtime íntegra byte-a-byte respecto del estado PRE-sync.

Backend/.env coincide con referencia histórica y conserva tamaño/fecha/owner/SDDL, sin leer contenido. Owner/SDDL de raíz/backend/.env/local-persistence/.git y carpeta backend iguales antes/después. Sin Set-Acl/ACE/herencia/propietarios/restauraciones;no se declara una nueva auditoría exhaustiva de cada ACL del árbol. B00 continúa pendiente.

Respaldo nuevo privado y copias de ensayo conservados e íntegros,ningún backup anterior sobrescrito. Backup SHA-256DC4CD39B47D79F3775825C3E0EFFC0C6CDAAC9B4F0849060D341969A085FFB0E. Nuevo backup/ensayo se crearon antes de migrar aunque el digest coincida con histórico. Cero archivos sintéticos bajo .work/databases y cero ejecutores propios restantes. Godot/HTTP/Node/Atlas/AWS no ejecutados. B05.4 no iniciada. Trabajo detenido a la espera de validación manual e instrucciones.


## B05.3B.2C — Auditoría runtime posterior a manuales (2026-10-28 Guatemala)

**B05.3B.2C AUDITORÍA COMPLETADA,RESULTADO PARCIAL.**853 pending,4 tipos,838/840 fuentes actuales representadas y15 revisiones históricas capturadas. Faltan1 session.report terminal y1 gameplay.interval Menu de última sesión cerrada.0 duplicados/contradicciones/huérfanos/dependencias incompletas entre filas existentes;integridadok,FKválidas. Dominio/estadísticas coherentes. B05.3 no se declara cerrada satisfactoriamente;B05.4 no iniciada.

Resultados,condiciones de lectura,cobertura,faltantes y recomendación en [B05_OUTBOX_RUNTIME_POSTVALIDATION.md](B05_OUTBOX_RUNTIME_POSTVALIDATION.md). Solo lectura/documentación,sin cambios runtime,ACL,.env oproducción. Esperar instrucciones;noB05.4.

## B05.3B.2D — Diagnóstico de cierre y recuperación sintética

2026-10-28. **COMPLETADA como diagnóstico/recuperación sintética únicamente.** Ventana de cierre postcommit y cancelación secundaria reproducida con código existente;2 faltantes recuperados en fixtures,segunda pasada y reinicio sin duplicados.24 pruebas nuevas+741regresiones=765/765;compilación C# correcta,63advertencias históricas/0nuevas. No código productivo ni Godot modificados. Bases protegidas y .env intactos;ACL conservadas,B00 pendiente.

Runtime sigue853pending y838/840fuentes actuales representadas. B05.3 no cerrada;parche de drenaje Godot y recuperación runtime requieren autorización aparte. B05.4 no iniciada. [Informe y propuesta NO aplicada](B05_OUTBOX_SHUTDOWN_RECOVERY.md). Detenido.

## B05.3B.2E.1 — Cierre Godot y recuperación Outbox

2026-10-28. **COMPLETADA EN CÓDIGO; VALIDACIÓN GODOT PENDIENTE.** Barrera terminal acotada posterior al commit fuente, Task única y reconciliación inicial existente. El intervalo Menu dura 3932 ms, equivalentes a 3,932 s, sin tiempo efectivo animal.

26 nuevas + 765 regresiones = 791 aprobadas, cero fallidas. Builds sin errores; 63 advertencias históricas y cero nuevas. Motor no ejecutado; sin cambios de escenas, gameplay o esquemas. Bases protegidas y .env intactos; ACL y propietarios conservados. B00 pendiente.

B05.3 no cerrada: runtime sigue con 853 pending y dos faltantes. E.2 requiere autorización de respaldo, ensayo, recuperación real y manuales; no iniciar Godot ahora. B05.4 no iniciada. [Informe vigente](B05_OUTBOX_SHUTDOWN_RECOVERY.md). Trabajo detenido.

## B05.3B.2E.2 — Recuperación controlada y auditoría final

2026-10-28. **COMPLETADA: cero inserciones necesarias.** Estado recalculado tras manuales E.1 del usuario (10/10): 906 pending y 889/889 fuentes actuales representadas, cero faltantes. Respaldo privado nuevo verificado, dos reconciliaciones en segunda copia con cero inserciones y todas las tablas/esquema/estadísticas intactos. Runtime exclusivamente de lectura en E.2; sin restauraciones ni migraciones.

Auditoría final satisfactoria: cero duplicados, contradicciones, huérfanos o dependencias incompletas; integridad ok y FK válidas. 791 regresiones sintéticas reejecutadas y aprobadas, cero pruebas nuevas. Las tres bases y nueve archivos asociados, .env, propietarios y ACL conservados.

**B05.3 COMPLETADA en su alcance local de Outbox/captura/reconciliación.** No se cierra B05 completo ni se autoriza entrega remota. B00 continúa pendiente y B05.4 no iniciada. [Resultado, respaldo e incidencias](B05_OUTBOX_RUNTIME_RECOVERY_RESULT.md). Detenerse y esperar autorización.

## B05.4A — Auditoría y diseño del receptor de sincronización

2026-10-28. **COMPLETADA COMO DISEÑO ÚNICAMENTE.** Contrato definitivo propuesto HTTPv2/Outboxv1/JWTver2, cuatro tipos aprobados, schemas Zod strict y refinamientos, binding desde identidad verificada, recibos durables y estados individuales, idempotencia/concurrencia/orden y repositorio sintético antes de Mongo. No código de recepción implementado.

Creado B05_REMOTE_INGESTION_ARCHITECTURE y B05_REMOTE_INGESTION_TEST_PLAN; actualizados SYNC_API_CONTRACT, SYNC_ARCHITECTURE, ROADMAP, PHASES, PHASE_HISTORY y DECISIONS. Propuestas sync/v1 históricas sustituidas explícitamente sin alterar rutas reales ni sobres locales. Pruebas futuras T01–T35/V01–V15, no ejecutadas en esta fase.

B05.3 completada localmente según E.2, sin enviar sus 906 pendientes. B00 sin resolver. Bases/archivos asociados conservados; .env no leído ni hasheado, solo metadata/owner/SDDL comparados. No cambios productivos/Godot/SQLite/ACL, servidores, HTTP, Atlas o AWS. B05.4B requiere autorización; trabajo detenido. [Contrato](B05_REMOTE_INGESTION_ARCHITECTURE.md), [plan de pruebas](B05_REMOTE_INGESTION_TEST_PLAN.md).

## B05.4B — Implementación aislada del receptor

2026-10-28. **COMPLETADA EN CÓDIGO en el ámbito sintético autorizado.** POST /api/v2/sync/batches y consulta de recibos opt-in, JWT RS256v2/propietario/binding verificados desde servidor, cuatro sobres1 sin modificaciones, validación Zod/parser/hash, dedupe y recibos por commit, dependencias, alias/historia y207parcial. Repositorio sintético con exclusión compartida para identidad/revocación y memoria o archivo cifrado.

Dos puertas previas aprobadas;63vectores C# compatibles;191backend(67nuevas+124regresiones)+64regresiones C#=255aprobadas,0fallidas finales. Los50casos A cubiertos; T34 por regresiones reales.37archivos JS sin error de sintaxis y exportador .NET8 sin errores/advertencias. Godot no ejecutado/recompilado,791históricas no reejecutadas completas.

Bases protegidas/.env/ACL conservadas, sin datos reales enviados ni operación real confirmed. B00 pendiente. No Atlas, modelos Mongo productivos, despliegue, cliente HTTP Godot ni B05.4C. Lock residual tras crash del archivo es limitación controlada503, no disponibilidad productiva. [Archivos y garantías](B05_REMOTE_INGESTION_ARCHITECTURE.md), [matriz y resultados](B05_REMOTE_INGESTION_TEST_PLAN.md). Trabajo detenido.

## B05.4C.1 — Adaptador MongoDB/Mongoose aislado (2026-10-28)

**COMPLETADA EN CÓDIGO; PROBADA CON DOBLES; NO VALIDADA CONTRA MONGODB LOCAL.** Este estado sustituye las indicaciones históricas de «C no iniciada» únicamente dentro del alcance sintético autorizado de C.1. MongoDB real/Atlas y producción siguen sin habilitarse.

Modelos de operaciones (recibo embebido), hechos y controles; índices únicos cuenta/operationId y scope/sourceKey; adaptador inyectable por el mismo puerto. Los cuatro sobres, bytes/hash y contratos HTTP/JWT/recibos se conservan. Transacción con snapshot/majority/journal, escritura de fence Mongo y barrera de sesión/autorización obligatoria; no se utiliza el bloqueo de archivos de B. Ante resultado incierto, 503 sin ACK especulativo y retry con la misma clave. Sin nuevas rutas admin o cambios de app/server.

Mongoose 9.11.2 instalado exclusivamente desde caché local, sin scripts ni descargas de servidor. No mongod/mongosh disponibles en PATH; Docker Desktop sin motor activo. No se conectó una base MongoDB, personal o remota. Las verificaciones de índices/topología/transacciones y concurrencia nuevas utilizaron dobles, no prueban garantías del servidor real. La identidad Mongo y su acoplamiento duradero con revocaciones/control de sesión permanecen bloqueantes para cualquier despliegue; no basta copiar controles desde memoria o usar un callback permisivo.

**235 pruebas backend aprobadas: 44 nuevas con dobles + 191 regresiones (39 legacy, 50 JWT, 35 identidad persistente y 67 ingestión B). Cero fallidas finales.** Las ocho regresiones de archivos de B siguen siendo persistencia sintética, no Mongo. Gates C#/Node (63 vectores) e identidad/vínculo aprobados; 43 archivos src/sync-tests sin errores de sintaxis. No se suman vectores o ejecuciones repetidas al total. No se reejecutaron las 64 pruebas C# ni las 791 históricas completas, ni se compiló/inició Godot.

Una aserción JWT histórica que prohibía instalar Mongoose se actualizó, con justificación técnica, para exigir que la composición JWT siga independiente/desconectada y permita login local sin Mongo. El resto de la batería se conservó. Primer pase completo: 234 aprobadas y ese único fallo; pase final: 235 aprobadas. EPERM inicial de Vitest se resolvió mediante permiso de subprocesos, sin alterar ACL.

Tres bases protegidas: hashes/tamaños/fechas/propietarios/ACL idénticos antes/después, sin SQL ni operaciones reales enviadas. `.env`: 278 bytes, fecha/propietario/SDDL idénticos; **no se abrió ni recalculó su hash en C.1**. El SHA histórico sigue documentado, sin una nueva certificación del contenido. No comandos de cambio de ACL, propietarios o herencia. B00 pendiente; cero procesos de ensayo o fixtures privadas restantes.

Recomendación C.2: autorización separada de entorno replica set local nuevo y desechable, binario confiable, rutas exclusivas y loopback; integrar identidad/revocación transaccional y probar índices, carreras, commit incierto y recibos tras reinicio reales. Prototipo acotado (1000 operaciones/2 MiB, fence global) pendiente de rendimiento, custodia y controles productivos. No Atlas, Godot HTTP, operaciones runtime, AWS o B05.5. Trabajo detenido.

[Inventario, modelos, garantías, resultados y límites](B05_MONGODB_ADAPTER_IMPLEMENTATION.md).
## B05.4C.2 — Preflight: INFRAESTRUCTURA PENDIENTE

2026-10-28. Inspección completada sin iniciar servidores o instalar software. No se halló mongod/mongosh en PATH ni en ubicaciones de instalación revisadas; sin servicios Mongo/Docker ni procesos Mongo activos. Compass 1.53.0 instalado; Docker Desktop 4.95.0 sin motor disponible. Puerto propuesto 27184 sin listeners y aproximadamente 107,5 GiB libres. La búsqueda acotada no descarta una instalación portátil no declarada.

La puerta de infraestructura exige detenerse: **0 integraciones Mongo reales y 0 pruebas automatizadas ejecutadas en C.2**. Las 235 aprobadas de C.1 siguen siendo evidencia anterior, no reejecutada. Se prepararon configuración local y matriz de 30 casos pendientes; índices, transacciones, recibos, reinicios y carreras reales siguen sin verificar. La identidad memoria/archivo no actualiza los controles Mongo al revocar: la corrección de coordinación está propuesta y no implementada. No usar un callback permisivo ni copiar controles una sola vez como garantía.

Tres bases protegidas: hash/tamaño/mtime/owner/SDDL iguales antes/después; propietario/SDDL de raíz y backend iguales. `.env` no se consultó, abrió ni hasheó; no se certifica de nuevo su contenido o ACL individual. No cambios de permisos/herencia/propietarios, código, contratos, Godot o SQLite. B00 pendiente.

[Informe de infraestructura, propuesta y pruebas pendientes](B05_MONGODB_LOCAL_INTEGRATION.md). La siguiente acción requiere infraestructura local desechable explícitamente autorizada y repetir el preflight. Sin Atlas, descargas automáticas, activación Docker, AWS o B05.5. **INFRAESTRUCTURA PENDIENTE; trabajo detenido.**
## B05.4C.2C — Modo Atlas explícito, sin conexión remota

2026-10-28. **COMPLETADA EN CÓDIGO Y DOBLES; NO VALIDADA CONTRA ATLAS.** Factory sin conector por defecto y sin selección por variables de entorno. Host/usuario/base exactos, TLS estricto, permiso inspeccionado mediante connectionStatus de solo lectura y scope interno por runId; rama local conserva loopback/base temporal/sin credenciales. Creación del repositorio requiere allowWrites explícito y modelos de colecciones exclusivas; autoCreate/autoIndex desactivados. Arranque, endpoints, cuatro sobres y JWT existentes sin cambios.

Canal de credenciales opaco de un uso/RAM y lanzador manual de una futura D: exige autorización, ruta privada y receptor con hash revisado antes del prompt. Solo probado con buffers ficticios; no secreto real recibido ni conexión Atlas. Identidad/revocaciones siguen en memoria/archivo y no se declara coordinación durable resuelta. B00 pendiente.

**271 pruebas backend aprobadas: 36 nuevas + 235 regresiones; cero fallidas finales.** Los 63 vectores C#/Node y gate de identidad pasaron; no se suman como tests nuevos. 48 JS sin errores de sintaxis; parser PowerShell sin errores y arranque sin autorización denegado antes de pedir credencial. No .NET/Godot ejecutados, instalaciones, datos reales o ACL modificados. Las tres bases se comparan por integridad/metadatos; .env excluido de lectura/hash.

[Configuración, archivos, pruebas, límites y propuesta D](B05_ATLAS_INTEGRATION_MODE.md). D requiere autorización de conexión real inicialmente de lectura, credenciales temporales, ruta/receptor revisados y tratamiento explícito de B00/identidad durable. Ninguna escritura/limpieza remota autorizada por C.2C. B05.4C.2D y B05.5 no iniciadas; trabajo detenido.
## B05.4C.2D.1 — Diagnóstico real de solo lectura bloqueado

2026-10-28. **BLOQUEADA / NO COMPLETADA.** El usuario activó dos canales privados; ambos terminaron con atlas_connection_unavailable antes de verificar autenticación/destino/permisos. Resúmenes no secretos conservados por ejecución, cierre indicado y cero escrituras/transacciones. No presentar Compass o la entrega del canal como conexión Mongoose satisfactoria.

Se corrigió una incompatibilidad local del factory: el driver rechaza tlsInsecure junto a tlsAllowInvalidCertificates/Hostnames aunque sean false. Se retiró el flag redundante conservando TLS estricto y se endureció la comprobación de sus opciones normalizadas. Los constructores reales sin connect comprueban esa corrección. El segundo fallo sigue sin causa concreta determinada por su resumen sanitizado. DNS SRV Windows/Node y un handshake TLS independiente del clúster autorizado resultaron satisfactorios sin credenciales; no acreditan autenticación.

35 pruebas sintéticas distintas aprobadas: 13 nuevas de diagnóstico/driver sin red + 22 regresiones de lectura/configuración. 14 casos excluidos por filtro, sin ejecutarlos ni contarlos como aprobados; las 271 anteriores no se reejecutaron completas. El sender bloquea ahora un resultado existente antes del prompt para evitar pedir otra contraseña en un run consumido. No credenciales reales en chat, args, env o archivos; no .env, Godot, índices, modelos, identidades o usuarios remotos modificados. B00 e identidad durable pendientes.

[Resultado completo, evidencias, corrección y límites](B05_ATLAS_READONLY_CONNECTION_RESULT.md). Un diagnóstico posterior deberá categorizar errores sin secretos y preservar las barreras; no autorización implícita de escrituras o transacciones. D.2 y B05.5 no iniciadas; trabajo detenido.