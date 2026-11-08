# Requisitos de Two Sides

## Requisitos vigentes B77–B79 — 2026-11-04

Las secciones históricas siguientes se conservan como trazabilidad. Esta actualización autorizada limita el producto a Windows PC; no añade Android, respaldo remoto, cuentas personales ni expedientes individuales.

| ID | Requisito vigente | Evidencia / límite |
| --- | --- | --- |
| R03-B79 | Identidad técnica mínima, por instalación y con alcance exclusivo statistics:write; no correo/cuenta personal ni secreto global incrustado | Sustituye el diseño histórico R03 para el transporte nuevo. Credenciales ficticias verificadas; provisión/custodia real pendiente. |
| R11-B79 | Transporte estadístico acotado y asíncrono; SQLite continúa siendo autoridad de guardado | GamePersistenceAdapter serializa solo operaciones locales; HTTP no mantiene el gate del guardado. |
| R14-B79 | Atlas futuro: agregados y registros técnicos mínimos con retención justificada; sin eventos completos permanentes ni consultas públicas por jugador/partida | Almacén falso persistente de referencia; no conexión Atlas en B79. |
| R21 | statistics-only-v1 y nueve tipos reales B77; campos cerrados, cinco biomas y reglas ambientales | STATISTICS_ONLY_V1_CONTRACT.md; validaciones Zod y pruebas cruzadas .NET/Express. |
| R22 | Recibos ligados a evento/hash; reintentos y respuestas perdidas no incrementan agregados otra vez | Confirmación individual; prueba con reinicio de proceso Node y Outbox sintética persistente. |
| R23 | Credencial técnica válida y audiencia correcta; el UUID del cliente no prueba autenticidad | Tokens opacos sintéticos con caducidad/alcance; ninguna emisión real. |
| R24 | Sin acceso a bases reales, .env, servicios productivos o paquetes B75/B78 durante la implementación | En B79 prevalece no acceder a .env sobre antiguos procedimientos de hash por fase. No se inspecciona PlayerData de ningún perfil real. |
| R25 | Envío remoto apagado por defecto, activación explícita y transparencia de telemetría antes de distribuir | Punto de composición implementado; interfaz de consentimiento y despliegue real pendientes. |
| R26 | Sin borrado silencioso de pendientes; rechazo permanente conserva evidencia local | Caducidad de admisión de 90 días requiere revisión de eventos antiguos, no reescritura ni envío como eventos nuevos. |

R04–R10, R12/R13 y R17–R20 siguen vigentes donde son compatibles con este alcance. La cuota legacy y la Outbox histórica no se convierten ni se aumentan. La preparación de B79 no acredita sincronización productiva ni resuelve B00. Informe: B79_TRANSPORTE_ESTADISTICO_EXPRESS.md.

Fecha: 2026-10-24. Fuente: solicitud de reconstrucción B00 del usuario. Diseño desde cero; no reutilizar automáticamente código ni configuraciones anteriores.

## Requisitos verificables

| ID | Requisito confirmado | Verificación futura |
|---|---|---|
| R01 | Windows PC, Godot/C#, API Node.js/Express, SQLite y MongoDB Atlas | Revisión de plataforma y arquitectura en B01/B08 |
| R02 | El jugador solo proporciona un nombre visible, no globalmente único | Diseño B02; probar en B03/B10 que dos perfiles con igual nombre mantienen identidades distintas |
| R03 | Correo técnico interno y contraseña aleatoria única, verificador mediante hash seguro | Diseño B02; registro y revisión de almacenamiento en B03 |
| R04 | Sin contraseña universal ni secretos de servidor en Godot | Inspección de fuentes, artefactos y configuración de pruebas; B10 |
| R05 | El nombre visible no autentica ni recupera una identidad | Intentar suplantación por nombre y verificar rechazo; B03/B10 |
| R06 | SQLite mantiene perfil, nivel/bioma, guardados, decisiones, consecuencias, ecosistemas y continuidad | Cargar y continuar una partida sin red; B04/B09 |
| R07 | Estadísticas primero locales: tiempo, sesiones, decisiones buenas/malas y ambientales, biomas, frecuencias y resultados ambientales | Cálculo reproducible a partir de registros locales; B05 |
| R08 | Internet opcional; Atlas no es necesario para cargar una partida | Inicio offline con tokens vencidos y servidor inaccesible; B09 |
| R09 | Conexión exclusiva Godot → API → Atlas | Revisión de configuración del cliente y pruebas; B08/B10 |
| R10 | Cola duradera con ID por evento, reintentos controlados e idempotencia | Caídas, duplicados, respuestas perdidas y reconexión; B07/B09 |
| R11 | Sincronización en segundo plano sin bloquear el juego | Verificar latencia, cancelación y lotes limitados; B08/B09 |
| R12 | Marcar sincronizado solo ante confirmación válida por evento | Respuestas parciales, ajenas o malformadas no pierden pendientes; B07/B09 |
| R13 | No eliminar pendientes ante fallos o periodos sin internet | Persistencia tras reinicio, desconexión prolongada y errores; B05/B09 |
| R14 | Atlas solo almacena estadísticas e identidad técnica mínima | Revisión de esquema, sin guardados ni datos personales innecesarios; B06/B10 |
| R15 | `.env` existente permanece intacto | Tamaño, SHA-256, permisos y modificación antes/después de cada fase |
| R16 | Reconstrucción por fases, pruebas y autorización entre fases | Historial y criterios verificados antes de cerrar cada fase |
| R17 | Diseño local con un perfil y partidas actuales/históricas, sin usar nombre como dueño técnico | Esquema/contratos B04.1; singleton, pertenencia y conservación a probar en B04.2 |
| R18 | Guardado coherente de decisión, consecuencias, progreso y punto de continuación; B05 añadirá evento en el mismo commit | Contrato transaccional B04.1; rollback/revisión/idempotencia a probar después |
| R19 | Datos de usuario fuera de instalación y con aislamiento explícito entre copia de pruebas y original | Verificar ruta/namespace efectivos antes de crear cualquier SQLite en B04.2 |
| R20 | Versiones, errores de disco, corrupción y migraciones no pueden resolverse borrando progreso silenciosamente | Diseño B04.1; pruebas con bases temporales autorizadas en implementación |

## Datos locales y remotos

El perfil local y el guardado contienen el estado necesario para jugar. La cola conserva eventos estadísticos inmutables pendientes; no debe utilizarse Atlas como sustituto del guardado. El almacenamiento exacto, migraciones y política de respaldo de SQLite se decidirán en B04, sin tocar bases existentes en B00.

Propuesta de mínimos por evento, todavía pendiente de contrato: `eventId`, `schemaVersion`, identificador técnico de sesión, tipo, momento declarado por el cliente y datos acotados del evento. La API deriva `identityId` y registra su propia hora de recepción. El identificador de perfil local se usa para asociación local; no hace falta exportarlo si no aporta una finalidad aprobada.

Tipos candidatos: inicio/cierre de sesión de juego, tiempo activo, visita a bioma, decisión y resultado ambiental. Distinguir tiempo activo de pausas; evitar doble conteo entre duraciones y sesiones. Definir qué sucede tras un cierre inesperado, cómo se clasifican decisiones y cómo se versionan las reglas antes de B05. El reloj del cliente es orientativo y no una prueba de orden o autenticidad. Frecuencias y distribución se calculan sobre eventos canónicos, sin volver a sumar duplicados.

No solicitar correo real, contraseña al jugador, fecha de nacimiento, ubicación, identificadores de hardware ni otros datos personales innecesarios. El nombre visible puede contener información personal introducida por el usuario; propuesta: conservarlo localmente salvo finalidad remota aprobada. No prometer anonimato solo por usar identificadores técnicos. Definir retención, eliminación de estadísticas y tratamiento de logs en B06/B10; ninguna retención puede descartar pendientes locales por un fallo de red.

## Alcance de B00

Únicas creaciones permitidas: `backend/docs/` y sus cinco documentos definidos. No crear `package.json`, código, endpoints, cuentas, índices, migraciones ni configuraciones ejecutables. No instalar dependencias, iniciar servicios, conectar a Atlas ni abrir/modificar SQLite. No cambiar Godot, el proyecto original, otras copias ni archivos fuera del backend de pruebas.

Referencia de `.env`: 278 bytes; SHA-256 `4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928`. Calcular hash sin imprimir contenido; preservar permisos y fecha de modificación.

## Alcance y trazabilidad de B02

B02 es exclusivamente diseño documental, por instrucción del usuario. Crear `IDENTITY_DESIGN.md` y `IDENTITY_API_CONTRACT.md`, actualizar los cinco documentos existentes y repetir las ocho regresiones de B01. No modificar código, instalar paquetes, implementar rutas, generar credenciales, tocar Godot/SQLite ni conectar Atlas. El hash de `.env` se calcula solo para integridad; sus valores no se leen en documentos ni configuración.

| Entrega de diseño | Ubicación | Verificación de implementación posterior |
|---|---|---|
| Escenarios A–F, nombre editable, inicio offline | `IDENTITY_DESIGN.md`: seis escenarios | B03/B04/B08/B09 según componente |
| Modelo local/remoto mínimo y separación de progreso/eventos | `IDENTITY_DESIGN.md`: modelo conceptual | B03–B07 |
| Registro idempotente con prueba de posesión, sesión y `/me` | `IDENTITY_API_CONTRACT.md`: tres endpoints | B03; persistencia durable en B06 |
| Estados independientes y conservación ante caídas | `IDENTITY_DESIGN.md`: máquinas y persistencia | B03/B04/B05/B09 |
| Nombre Unicode no único y recuperación sin correo personal | `IDENTITY_DESIGN.md`: validación y escenario F | Cliente autorizado, B03/B10 |
| Opciones pendientes separadas de requisitos aprobados | `DECISIONS.md`: P01–P13 | Resolver antes de cada implementación afectada |

La aceptación de B02 acredita documentación coherente y regresiones B01, no prueba que exista login, recuperación ni sincronización funcional. B00 sigue BLOQUEADA por el SID desconocido; el usuario autoriza esta fase sin resolver ese riesgo ni modificar permisos.

## B04.1 — fuentes reales y alcance de diseño

Actualización: 2026-10-25. Se revisó `docs/Requerimientos_Two_Sides_v6_corregido.docx` y C# necesario de esta copia, sin modificar sus contenidos. Ver la matriz completa y lista de archivos en `SQLITE_SCHEMA_DESIGN.md`. El DOCX duplica RF-035/RF-036 y contiene referencias inconsistentes: citar ID y título, no asumir numeración única.

- RF-001 aporta autosave de segmento y estado local; RF-004/005/008/009/010/013/016/017/018 aportan decisiones/ambiente/reconstrucción; RF-014/015, derrota/reinicio; RF-027/028, final; RF-030/031/032, decisión inicial, información y tarjeta final. RNF-008 pide guardar/retomar sesiones breves y RNF-010 audio opcional.
- RNF-006 (internet obligatorio), RF-001 (enviar guardado completo a AWS), RF-033 (correo/contraseña del jugador) y RF-035 «JWT» quedan desplazados por las instrucciones actuales: offline, progreso exclusivamente local, identidad técnica y token opaco. No se modifica el DOCX ni se añade AWS/Android al alcance vigente.
- RF-021 pide desbloqueo lineal, pero BiomeCardController/GameStateStore y la documentación actual permiten biomas incompletos en cualquier orden. Muerte/reinicio frente a completar con final negativo también requiere precisión. Esas reglas y umbrales del final se registran como S04 pendiente, no se inventan.
- CurrentHealth, Agua/Comida y agotamiento son datos reales para guardar a mitad de segmento; no hay contrato de IDs/restauración de objetos. La política de checkpoints y exactitud se debe aprobar. No declarar implementada una recuperación exacta simplemente por guardar una posición.

B04.1 solo crea `SQLITE_SCHEMA_DESIGN.md` y `LOCAL_SAVE_CONTRACT.md`, actualiza estos cinco documentos autorizados y repite las regresiones B01/B03.2. No crea/abre SQLite, instala drivers, cambia código, añade endpoints, ejecuta Godot o conecta Atlas. La finalización del diseño no equivale a que el cliente actual pueda jugar offline.
