# Arquitectura de Two Sides — B00

## Estado vigente B79 — 2026-11-04

Esta sección prevalece sobre los diseños históricos fechados que se conservan debajo. Plataforma actual: Windows PC, Godot 4.6.1 Mono/C#/.NET 8; Android está fuera del alcance.

SQLite es autoridad exclusiva de partidas, perfil local, decisiones, consecuencias y continuidad. Atlas tendrá únicamente agregados estadísticos y el mínimo registro operativo con retención limitada para autenticación/deduplicación; no un historial navegable de partidas o jugadores. No hay recuperación de partidas desde la nube ni cuentas personales remotas.

Flujo implementado para pruebas: captura B77 → Outbox SQLite statistics v1 → StatisticsTransport en segundo plano → POST /api/v1/statistics/events → aplicación Express statistics-offline-test → almacén falso persistente → recibos individuales. El envío conserva IDs y hashes originales; HTTP 200 por sí solo no confirma eventos. El servicio nuevo no monta rutas legacy de Auth/Sync v2 ni importa sus repositorios MongoDB. Reutiliza solo parser puro, cabeceras y limitador existentes.

La composición de Godot exige activación explícita con consentimiento, destino y proveedor de credencial técnica por instalación; está desactivada por defecto. B79 usa solamente capacidades e identidades sintéticas. No hay secreto global, emisión pública real, credenciales de Atlas ni datos de jugador dentro del contrato. La futura custodia/provisión de credenciales debe resolverse antes de distribuir envío remoto.

El backend protegido v5 se conserva, pero sus cuatro archivos nuevos requieren una futura revisión/manifiesto: no se activa ni arranca el backend principal con el árbol desactualizado. F1/F2 y endpoints anteriores no se modifican. Véanse B79_DEPENDENCY_INVENTORY.md, STATISTICS_ONLY_V1_CONTRACT.md y B79_TRANSPORTE_ESTADISTICO_EXPRESS.md para contratos, evidencia y límites. No está validada una integración Atlas ni publicado el servicio.

Fecha inicial: 2026-10-24. Actualización B04.1: 2026-10-25. B01 implementó Express/health y B03.2 identidad/sesiones locales en memoria con 39 pruebas; los flujos de cliente, DPAPI, persistencia SQLite y sincronización siguen como diseño sin implementar. No hay conexiones Atlas configuradas o utilizadas.
Ámbito exclusivo: `C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend`.

## Responsabilidades

| Componente | Responsabilidad | Límites |
|---|---|---|
| Godot con C# en Windows PC | Solicitar nombre visible, ejecutar el juego, gestionar guardado y sincronización en segundo plano | Sin secretos de servidor, contraseña universal ni conexión directa a Atlas |
| SQLite local | Perfil, bioma/nivel, partidas guardadas, decisiones, consecuencias ambientales, ecosistemas, continuidad, sesiones, estadísticas y cola pendiente | Autoridad del progreso; cargar una partida nunca requiere Atlas |
| API Node.js + Express | Registro de identidad técnica, autenticación, autorización, validación y recepción idempotente de estadísticas | No decide el estado de la partida ni almacena sus guardados |
| MongoDB Atlas | Identidad técnica mínima, verificadores de contraseña y estadísticas confirmadas | No es requisito para jugar ni cargar progreso |

## Flujos propuestos

### Primer inicio y registro

1. Godot solicita únicamente un nombre visible, que puede repetirse entre jugadores.
2. Crea un perfil local independiente y un identificador aleatorio de instalación/perfil. Este identificador correlaciona datos; no autentica.
3. Sin conexión, guarda y juega localmente; los eventos quedan asociados al perfil local pendiente de registro.
4. Con conexión, propone registrar una identidad técnica a través de HTTPS. El cliente genera una contraseña aleatoria exclusiva mediante el generador criptográfico de la plataforma. Nunca deriva la contraseña del nombre.
5. El backend asigna un identificador de identidad estable y un correo interno sintético sin datos personales. Guarda solo el verificador seguro de la contraseña; no su texto original. No se envían correos reales.
6. Godot protege la credencial por perfil mediante el mecanismo de Windows que se apruebe; no la guarda en claro en SQLite, documentos, logs ni ejecutable.
7. Solo una vez confirmada y persistida la asociación identidad/perfil se habilita el envío de sus eventos. No reasociar eventos por coincidencia de nombre.

El protocolo de registro debe resolver respuestas perdidas: un identificador de solicitud no secreto por sí solo no permite recuperar ni reclamar una identidad. La propuesta es guardar el secreto generado antes de enviar y vincular el reintento a una prueba de posesión del mismo. El diseño exacto, el almacenamiento provisional y la expiración necesitan aprobación y pruebas en B02/B03. Nunca generar una segunda identidad silenciosamente tras un resultado ambiguo.

### Inicio offline

Abrir SQLite, cargar el perfil y su guardado y comenzar a jugar sin esperar autenticación remota. Un token vencido o un fallo de red no impiden el acceso al progreso. El nombre es una etiqueta editable, no una credencial. Si falta una credencial remota, conservar el perfil y la cola; solicitar recuperación cuando corresponda sin descartar datos.

### Estadísticas y sincronización

1. Registrar primero el evento y su entrada de cola en una transacción SQLite. Cuando una decisión cambia también el progreso, persistir ambos cambios de forma atómica.
2. Un trabajador en segundo plano envía lotes acotados a la API autenticada. Todos los eventos, incluso con internet disponible, pasan primero por almacenamiento local.
3. La API valida versión, identidad, límites y contenido de cada evento. Obtiene la identidad de la autenticación, nunca confía en una identidad indicada libremente por el cliente.
4. Propuesta pendiente: unicidad remota por `(identityId, eventId)`. Un evento repetido idéntico recibe confirmación equivalente; el mismo identificador con contenido distinto produce conflicto, sin sobrescribirlo.
5. Confirmar individualmente solo después de persistencia remota duradera. Ante un fallo incierto, el cliente conserva y reintenta; no se promete entrega única de red, sino efecto idempotente.
6. Godot valida identidad, identificador y resultado de cada confirmación contra el lote enviado. Marca como sincronizados únicamente los eventos confirmados válidamente, dentro de una transacción local. Una respuesta HTTP exitosa por sí sola no confirma todo el lote.
7. Una caída tras persistencia remota o antes de actualizar SQLite se resuelve reenviando los mismos identificadores. Las respuestas parciales dejan pendientes los eventos sin confirmación.

Propuesta de reintento: espera exponencial con variación aleatoria y límite, respetando la espera indicada por el servidor. Red/errores transitorios se reintentan; autenticación fallida pausa el envío hasta renovación; errores permanentes de esquema se conservan en estado revisable y no bloquean otros eventos. No hay borrado automático de pendientes por antigüedad. Definir cuotas y respuesta a disco lleno sin prometer capacidad local ilimitada.

## Seguridad y recuperación

La autenticación demuestra posesión de la contraseña única o de una credencial derivada válida. El correo interno no es secreto ni un correo recuperable. Registro limitado contra abuso, validación de entradas, límites de lotes y autorización por identidad forman parte del diseño futuro. Estadísticas del cliente no equivalen a datos resistentes a trampas.

Diseño B03.1 aplicado localmente en B03.2: sesiones opacas revocables de 900 segundos con hash del token en backend y comprobación de versión de credencial. Cliente, custodia DPAPI y programación de reautenticación siguen pendientes. No se usa JWT ni refresh token; renovación con refresh token o endpoint de rotación de contraseña requeriría otro contrato. No registrar contraseñas, tokens, cadenas de conexión ni cargas privadas.

La recuperación después de reinstalar Windows, perder el perfil del sistema o cambiar de PC no se puede basar en el nombre visible. Debe elegirse entre nueva identidad sin recuperación, un código de recuperación entregado al usuario o una exportación protegida y explícita. El formato, verificador y proceso requieren decisión; no se garantiza recuperación automática. Restaurar una identidad no restaura progreso remoto: los guardados siguen siendo locales y su respaldo es un asunto separado. Una pérdida de credenciales nunca autoriza a adjuntar la cola a otra identidad sin un procedimiento aprobado.

## Separación modular y estructura futura

```text
backend/
  .env                         # existente, protegido
  package.json                 # B01 o posterior
  src/
    app.js                     # composición Express
    server.js                  # ciclo de vida del proceso
    config/                    # validación de configuración
    modules/
      identity/                # registro y ciclo de identidad
      auth/                    # credenciales, tokens y autorización
      statistics/              # validación y semántica estadística
      sync/                    # lotes, idempotencia y confirmaciones
    database/
      mongodb/                 # persistencia remota
    middleware/                # errores, límites y contexto común
    utils/                     # funciones transversales pequeñas
  tests/
    unit/
    integration/
    security/
  scripts/
  docs/
    ARCHITECTURE.md
    REQUIREMENTS.md
    PHASES.md
    PHASE_HISTORY.md
    DECISIONS.md
    IDENTITY_DESIGN.md          # propuesta B02
    IDENTITY_API_CONTRACT.md    # propuesta B02
    AUTH_SECURITY_DESIGN.md     # propuesta B03.1
    SQLITE_SCHEMA_DESIGN.md     # diseño B04.1
    LOCAL_SAVE_CONTRACT.md      # diseño B04.1
```

Esta estructura conserva la propuesta inicial y ampliaciones: B00 creó solamente `docs/` y cinco Markdown; B01/B03.2 implementaron la base y autenticación local; B02/B03.1/B04.1 añadieron diseño. SQLite y cliente C# se diseñan aquí, pero su código futuro reside en el cliente de pruebas, no dentro de un servidor que abra la base SQLite del jugador. Cada módulo mantiene contratos explícitos; auth no calcula estadísticas, sync no modifica guardados y statistics no emite credenciales.

## Puertas de decisión

Ver [DECISIONS.md](DECISIONS.md) para propuestas pendientes y [PHASES.md](PHASES.md) para permisos y aceptación. Ninguna propuesta técnica pendiente se considera implementada ni autorizada por este documento.

## Ampliación B02 — diseño de identidad

Los seis escenarios, campos y transiciones se detallan en [IDENTITY_DESIGN.md](IDENTITY_DESIGN.md); los contratos propuestos de registro, sesión y `/me`, en [IDENTITY_API_CONTRACT.md](IDENTITY_API_CONTRACT.md). Estos documentos precisan la propuesta inicial sin cambiar los requisitos confirmados.

Nombre y `localPlayerId` permanecen locales. El cliente persiste una credencial exclusiva protegida y un `registrationId` antes de enviar; el backend asigna `technicalAccountId` e `internalEmail`. Un reintento de registro requiere verificar la credencial además de la clave de idempotencia. `identityId` en el diseño inicial equivale conceptualmente a `technicalAccountId`, nombre canónico de los contratos B02.

Registro remoto, sesión y cola son máquinas independientes: `REGISTERED` no implica `AUTHENTICATED`, y `SYNC_PENDING` no implica fallo de identidad. Incluso en el primer inicio online, el registro no bloquea jugar. El cambio de nombre no crea cuentas y la pérdida de credencial no permite reclamar identidad por nombre. Atlas no recupera guardados locales.

Las opciones `.invalid`, DPAPI por usuario, validación Unicode, formato de credencial y políticas de token se documentan como propuestas pendientes, no como decisiones aprobadas o mecanismos implementados. B00 conserva el bloqueo ACL histórico. B02 no modifica esa ACL ni utiliza credenciales reales. B03 requiere nueva autorización.

## Ampliación B03.1 — seguridad propuesta

[AUTH_SECURITY_DESIGN.md](AUTH_SECURITY_DESIGN.md) precisa Argon2id, DPAPI CurrentUser, sesiones opacas, límites iniciales, idempotencia, rotación y recuperación. Registra los ajustes respecto a B02 antes de modificar contratos; no contradice D01–D10 ni implementa esos mecanismos. La credencial es exclusiva por perfil creado en cada instalación; no se requiere un identificador de instalación adicional. Los parámetros exactos son propuestas sujetas a aprobación y medición.

B03.1 solo crea/actualiza documentación y repite regresiones B01; B03.2 no comienza automáticamente. El backend no guarda contraseña recuperable, DPAPI pertenece al cliente Windows y SQLite sigue siendo autoridad de las partidas. Un repositorio en memoria de pruebas futuro no proporciona persistencia de cuentas tras reiniciar ni sustituye B06. El riesgo ACL desconocido permanece pendiente.

## Ampliación B04.1 — persistencia local diseñada desde el juego real

Los contratos en [LOCAL_SAVE_CONTRACT.md](LOCAL_SAVE_CONTRACT.md) y el [esquema propuesto](SQLITE_SCHEMA_DESIGN.md) separan perfil único, partidas históricas/actual, progreso/objetivos por bioma, decisiones inmutables, proyección ambiental, captura de continuación, configuración y recibos locales/versiones. Toda partida se abre sin sesión remota. B05 añadirá el evento pendiente a la misma transacción SQLite que la decisión/progreso, sin exportar guardados a Atlas.

La inspección C# y del DOCX histórico halló autoridad remota e internet obligatorio todavía presentes en el cliente anterior; no son requisitos vigentes de esta reconstrucción. B03.2 ya está implementada localmente, pero ese cliente NO ha sido adaptado. B04.1 no habilita offline en el ejecutable actual, no abre bases existentes y no importa automáticamente journal JSON o IDs remotos de 24 hex.

Variables comprobadas: BiomaSaludable y resultados por TipoNivel; CurrentHealth; Agua/Comida; agotamiento de fuentes/objetos. Solo el estado ambiental binario está confirmado: no inventar índices numéricos. Fondos/partículas/HUD se reconstruyen. Restauración exacta a mitad de recorrido requiere IDs de entidades y adaptadores aún ausentes; los puntos de segmento son una propuesta inicial explícita, no una promesa de exactitud sin esos datos.

La capa conceptual es GameSaveService → unidad de trabajo → SQLiteRepository → archivo local aislado. Primero commit, después proyección visual/cambio de escena. Para escena animal aplicar ambiente antes de Ready. user:// requiere namespace propio de pruebas, porque la copia comparte config/name=TwoSides con posibles instalaciones; validar ruta efectiva antes de crear archivos. Driver, rutas, checkpoints, reglas de desbloqueo/final y backup siguen pendientes de aprobación S01–S08. B00 conserva su riesgo ACL; no iniciar B04.2 sin autorización.
