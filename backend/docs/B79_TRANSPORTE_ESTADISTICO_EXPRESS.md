# B79 — Transporte estadístico Godot → Express

Fecha: 4 de noviembre de 2026, Guatemala. **Implementación y extremo a extremo simulados aprobados. Sin integración productiva/Atlas y sin ejecutar el videojuego.** B00 permanece pendiente.

## 1. Evidencia inicial y alcance

El propietario informó una ejecución real B78 en TwoSidesStatsTest: 71 eventos, una partida iniciada/completada, cinco sesiones cerradas, cinco decisiones reject→healthy, cinco biomas completados, final good, 752279 ms efectivos y 71 pendientes; cero duplicados/intervalos inválidos/fuentes sin proyectar, Integrity=ok y PASS/código 0. Es evidencia aportada por el propietario: **no abrimos su SQLite, no copiamos sus identificadores y no enviamos esos 71 eventos**.

Se revisaron B68–B75 y B77/B78, migraciones estadísticas, observador, Outbox/leases, HttpClient, rutas Sync v2, autenticación, rate limiting y requerimientos. El inventario previo y los conflictos están en `B79_DEPENDENCY_INVENTORY.md`. La plataforma es Windows PC; no se desarrolló para Android.

## 2. Arquitectura implementada

```text
Guardado/tiempo B77 → SQLite local (autoridad)
                         ↓ eventos inmutables ya persistidos
                  Outbox estadística v1
                         ↓ reserva de hasta 5, lease 60 s
        StatisticsTransport (.NET, fuera del hilo principal)
                         ↓ credencial técnica + statistics-only-v1
           POST /api/v1/statistics/events
                         ↓ validación/autorización/límites
           Almacén falso persistente de pruebas
                         ↓ commit coherente de ledger + contadores
             recibos individuales → Outbox local
```

No se generan eventos al transmitir. No se exportan perfiles, archivos SQLite, snapshots, continuidad ni partidas completas. La ruta estadística no llama GameProgress/Decision/PlaySession remotos. No hay dependencia de MongoDB ni de Auth v1 para esta aplicación.

Godot reutiliza su GameSyncHost de aplicación y el callback de cierre de GamePersistenceContext. `ConfigureStatisticsForAuthorizedRun(consent, factory)` es el punto explícito para proporcionar destino y proveedor de credencial. Rechaza falta de consentimiento, un segundo worker o coexistencia con el worker legacy habilitado. **Ninguna composición normal lo invoca automáticamente**; no se configuró project.godot, URL, perfil real ni envío silencioso. En producción normal tampoco se consulta la URL legacy main_api_url para preparar este transporte.

El tick ejecuta trabajo en Task.Run y el cliente usa HttpClient asíncrono. El adaptador reserva/aplica estados bajo su mismo gate SQLite, liberándolo antes de HTTP. La prueba mantuvo una solicitud pendiente mientras un guardado local se completaba. Al cerrar se cancela el transporte antes de cerrar el almacén; recibos/leases no resueltos siguen recuperables. Un error de red no detiene la partida; un fallo real de disco sigue sujeto a los controles de guardado existentes, no a una promesa de almacenamiento ilimitado.

## 3. Componentes y archivos

Reutilizados: StatisticsTelemetry, GamePersistenceAdapter/Context, LocalGameplayObserver, GameSaveService, Outbox/recibos B77, biblioteca TwoSides.SyncHttp, HttpClient, parser puro parseStrict, RateLimiter y securityHeaders existentes. El backend no tiene Helmet instalado; se conservaron sus cabeceras equivalentes sin añadir dependencias. CORS no se usa como autenticación de un cliente nativo.

Nuevos fuentes:

| Archivo | Finalidad |
| --- | --- |
| `backend/src/modules/statistics/contract.js` | Esquemas Zod, contrato y validaciones cruzadas. |
| `backend/src/modules/statistics/offline-app.js` | Aplicación Express exclusiva statistics-offline-test. |
| `backend/src/modules/statistics/synthetic-identity.js` | Identidades ficticias con scope/caducidad/revocación. |
| `backend/src/modules/statistics/synthetic-store.js` | Referencia persistente desechable, ledger mínimo y agregados atómicos. |
| `backend/tests/statistics/statistics.test.js` | Pruebas HTTP/servidor/retención. |
| `backend/tests/statistics/vitest.config.js` | Selección aislada, envDir=false y guardia de .env. |
| `backend/tests/statistics/e2e-server.js` | Fixture loopback de proceso independiente; bootstrap por stdin. |
| `local-persistence/src/IStatisticsDeliveryStore.cs.txt` | Capacidad asíncrona acotada de entrega, sin acceso al guardado. |
| `local-persistence/sync-http/StatisticsTransport.cs.txt` | Cliente y validación de recibos/backoff. |
| `local-persistence/statistics-transport-tests/` | Proyecto, Program y lockfile del arnés sintético. |

Existentes modificados:

- `local-persistence/src/StatisticsTelemetry.cs.txt`: aplazamiento persistente, reanudación tras autenticación y códigos permanentes cerrados.
- `integration/sqlite/GamePersistenceAdapter.cs`: implementa la capacidad de entrega mediante el gate existente, sin HTTP dentro de una transacción de guardado.
- `integration/sqlite/GamePersistenceContext.cs`: expone esa capacidad al host, sin exponer la base.
- `integration/sqlite/GameSyncHost.cs`: activación explícita, tick y cierre del transportador; legacy continúa aislado.
- `local-persistence/production-storage-tests/ProductionStorageChecks.cs.txt`: exclusión explícita de dos aserciones históricas que consultaban existencia del directorio real; las pruebas restantes usan perfiles ficticios.
- `backend/docs/ARCHITECTURE.md` y `REQUIREMENTS.md`: alcance vigente y trazabilidad; se conservó el contenido histórico.

Documentación nueva: este informe, inventario previo y `STATISTICS_ONLY_V1_CONTRACT.md`, que es la especificación formal. Respaldos de los siete archivos existentes, cada uno antes de editarlo: `local-persistence/.work/b79/pre-B79/`, hashes `before.json`; el test heredado se respaldó al detectar su consulta de metadatos y antes de acotarlo. Inventarios finales/evidencia en la misma carpeta de trabajo. No se cambió package.json, package-lock, dependencias, escenas, mecánicas, finales, cuotas legacy ni configuración de exportación.

## 4. Contrato, seguridad y API

Contrato completo: [STATISTICS_ONLY_V1_CONTRACT.md](STATISTICS_ONLY_V1_CONTRACT.md). Ruta elegida y justificada antes de implementar: `/api/v1/statistics/events`, para evitar cualquier ambigüedad con `/api/v2/sync` y rutas de partidas.

El envoltorio lleva Contract=statistics-only-v1 y Events de 1–5 elementos, cada uno con EventJson y PayloadHash. EventJson es la serialización inmutable B77: EventId, SchemaVersion=1, InstallationId, SessionId, Type, OccurredAtUtc, GameId, BiomeId, DurationMs y Data. Data sigue siendo cadena JSON cerrada. El hash se verifica sobre los bytes UTF-8 originales, evitando diferencias de escapes/orden entre C# y Node. No se modifica ni rehasha arbitrariamente el evento persistido.

Se validan los nueve tipos B77, cinco biomas, UUID, tokens estadísticos, tamaños, campos desconocidos, duraciones y límites temporales, opciones/estados y correspondencia decisionKey-bioma. Se rechazan datos personales añadidos y documentos de partida. Se usa parser que conserva/rechaza claves duplicadas y UTF-8 inválido. Límite de cuerpo 32 KiB, profundidad acotada y respuesta cliente 16 KiB; sin compresión ni redirecciones.

Se encontró una incompatibilidad real al cruzar implementaciones: gameplay usa UTC con tres decimales/Z, pero los commits de dominio B77 usan DateTimeOffset "O", siete decimales/+00:00. El receptor ahora acepta **ambos formatos reales**, mantiene el hash original y usa solo día/mes UTC en agregados. No se reescribió el historial ni se migró SQLite para resolverlo.

La app solo admite un repositorio y registro de identidad construidos como capacidades sintéticas, no objetos con una propiedad synthetic inventada. No monta repositorios Mongo, rutas legacy, arranque principal ni emisión pública de credenciales. Los fixtures abren únicamente 127.0.0.1 con puerto efímero. Ningún servidor se publicó.

Cabeceras: nosniff, DENY, CSP default-src none, no-store y x-powered-by deshabilitado; trust proxy deshabilitado en pruebas. Las respuestas de error son códigos fijos; no se registran cuerpos, tokens, IP asociada a eventos, URI ni stacks. Hay contadores HTTP agregados en RAM por status, sin ruta pública administrativa. TLS cliente normal conserva validación de cadena/nombre; no se introdujeron callbacks que acepten certificados inválidos. La excepción HTTP exige capacidad sintética y host literal loopback.

## 5. Autenticación técnica y límites de confianza

El registro de pruebas emite credenciales opacas individuales de 256 bits, scope exacto statistics:write, 15 minutos por defecto y máximo sintético de una hora. El token se verifica por hash en RAM y su InstallationId autenticado debe coincidir con cada evento. Se probaron ausente, inválido, vencido, revocado, scope incorrecto, instalación ajena y audiencia cliente incorrecta. El UUID solo no autentica.

El cliente no carga credenciales de Atlas, perfiles anteriores o .env. IStatisticsCredentials es una dependencia explícita; la credencial está ligada al origen exacto y su ToString es redactado. El fixture de procesos genera un secreto ficticio nuevo y lo pasa por stdin redirigido. No figura en argumentos, consola, informes o archivos; stdout del hijo solo comunica puerto y contadores. El código de fixture nunca recibe contraseñas reales.

**No se ha implementado un emisor productivo, aprovisionamiento real, persistencia DPAPI del proveedor nuevo ni revocación duradera de estadísticas.** Antes de un despliegue deberán definirse activación técnica autorizada, audiencia, custodia CurrentUser, renovación, rotación y revocación sin cuentas personales. La emisión abierta requiere controles antiabuso. B79 no importa automáticamente los fences de identidad legacy para afirmar que ese problema ya está resuelto.

La autorización sintética se valida al comenzar la solicitud; no se acredita revocación atómica de peticiones ya autorizadas durante un commit. Ese límite debe resolverse/aceptarse en el diseño productivo. Tampoco se prueba que el cliente sea genuino, que el animal llegó a la meta o que el tiempo no fue manipulado: hay validación/coherencia/cuotas, no antitrampas infalible. Un usuario que controla Windows puede inspeccionar su proceso; no se promete borrado forense de strings en RAM ni protección de secretos globales distribuidos.

## 6. Recibos, persistencia e idempotencia

Cada recibo contiene EventId, PayloadHash, Status y Code. accepted/duplicate válidos confirman solo ese evento. rejected conserva permanent_failure y el motivo cerrado en last_error_code; retryable o recibo ausente conservan pendiente. Una respuesta 200 no confirma por sí sola. El cliente valida el conjunto completo antes de aplicar: contrato, propiedades exactas, status/código permitido, pertenencia al lote, hash y ausencia de IDs duplicados. Admite recibos parciales y reordenados.

Los errores de transporte no crean otros IDs. Confirmación local exige el lease de esa reserva y hash correcto. Si falla un commit local en una aplicación parcial, los ya confirmados se mantienen; los demás pueden seguir in_flight hasta expirar. La fuente no se elimina ni se afirma confirmación completa.

El almacén falso persiste únicamente ledger HMAC, hash de payload, expiraciones, claves semánticas mínimas, presupuestos y contadores. No conserva eventos completos, IDs de sesión/partida en claro ni perfiles. Serializa commits en un proceso y guarda una instantánea fsync+rename; un lock impide abrir simultáneamente ese fixture desde otro proceso. Un fallo anterior al commit no modifica contadores; uno posterior devuelve incertidumbre y el reenvío reconoce deduplicación. La prueba reinició realmente Node, no solo la clase en memoria.

No es almacenamiento productivo ni prueba de apagado eléctrico o clúster distribuido. Antes de Atlas debe existir una transacción duradera que confirme conjuntamente deduplicación única, incremento y recibo. Duplicate key/commit incierto deben conciliarse por el mismo ID/hash. No se promete una única ejecución HTTP; la evidencia actual es efecto idempotente en el almacén de referencia.

## 7. Tiempo, cuotas, retención y privacidad

Se conservan B77/F3.1: reloj monotónico de juego, observación 30 s, exclusión de menú/pausa/foco/suspensión y decisiones/finales derivados del dominio confirmado. El envío no altera esos datos ni crea intervalos nuevos.

Transporte: cinco eventos por reserva, lease de 60 s, timeout HTTP 15 s, backoff exponencial desde 30 s hasta 1 h con variación ±20 %, respetando Retry-After hasta 24 h. Los plazos se guardan en columnas existentes. 400/401/403/404 pausan la instancia por configuración/autenticación; los pendientes conservan deferimiento de 24 h, evitando bucle al reiniciar. La reanudación requiere una acción explícita del proveedor/composición. Cancelación, red, 429/500/503 y respuestas inválidas no confirman.

Política nueva solo estadística: 60 solicitudes/minuto/instalación, 120/minuto/IP y 6000 eventos nuevos/día UTC/instalación. No es cuota vitalicia. Reenvíos no vuelven a consumir eventos nuevos ni suman métricas, aunque cuentan para limitar solicitudes. El alcance diario limita un backlog grande: no se dispara una importación masiva. El fixture permite reducir su límite únicamente para probar agotamiento. La cuota legacy 1000 y sus 2151 operaciones no se modifican.

Admisión temporal: hasta 90 días hacia atrás, cinco minutos hacia el futuro. Un evento vencido se rechaza y queda localmente retenido para revisión; no se cambia su fecha/ID para admitirlo. La retención del ledger cubre al menos toda la admisión posible; tras purgarlo se sigue rechazando el original viejo. No aplicar TTL que deje recontar un evento todavía admisible. La ventana es parte del contrato: no ampliarla sin extender primero deduplicación.

El falso almacén purga registros técnicos vencidos en commits, mantenimiento y cierre; el runner mantiene un ciclo de 15 minutos. Los distintos diarios/mensuales permanecen hasta cierre del período+90 días+tolerancia para no contar dos veces eventos tardíos. Los agregados se conservan. Se probó purga física con reloj sintético avanzado y preservación de contadores.

El HMAC no es anonimización irreversible. Es identificador operativo limitado y potencialmente vinculable; requiere clave de servidor estable/versionada durante la ventana. La clave pública ficticia de los tests **no es un secreto ni configuración válida de producción**. Rotarla sin estrategia de claves anteriores invalidaría deduplicación.

No se implementó compresión/agregación destructiva de intervalos pendientes. B77 mantiene FIFO: un error permanente en cabecera detiene avance y requiere revisión explícita; no elimina eventos vencidos silenciosamente. Esto es una limitación operativa real para backlogs antiguos, pendiente de un procedimiento de revisión/consentimiento antes de distribución.

Aviso propuesto: «Tu partida permanece en este equipo. Con tu autorización, Two Sides envía estadísticas seudónimas de decisiones, biomas y tiempo activo para resultados generales. No envía tu nombre ni tu partida completa. Los eventos pendientes se conservan sin conexión». Aprobar aviso, participación y retención real antes de habilitar una versión distribuida; el punto de composición booleano no sustituye una interfaz de consentimiento aprobada. No se da una conclusión jurídica.

## 8. Agregados y coherencia

El contrato formal define todos los contadores all/day UTC/month UTC: instalaciones registradas, actividad distinta por período, partidas iniciadas/completadas, finales, visitas/completados por bioma, decisiones/estado ambiental y tiempo efectivo total/bioma. No hay panel ni endpoint por jugador. Los identificadores de juego/sesión recibidos se descartan tras obtener claves técnicas/hashes necesarios.

Se comprobaron: tiempo total=suma de biomas; completadas=suma de finales; no negativos/overflow; duplicados y rechazados no incrementan. Los distintos de período usan expiración después del cierre de período+ventana tardía. Los logs no permiten recorrer jugadores ni partidas.

Las definiciones evitan confundir instalaciones con personas o sesiones. Los promedios requieren denominadores y cobertura explícitos; los ratios de un período no son tasas de cohorte. Una finalización tardía puede llegar en otro período que su inicio. No se inventa abandono por cerrar. Tiempo por visita no equivale a tiempo hasta completar. Métricas de cohorte/tiempo de partidas finalizadas requieren un diseño agregado adicional acotado, no un historial individual permanente.

## 9. Pruebas y resultados

| Batería | Resultado |
| --- | --- |
| Vitest estadístico B79 | **51 PASS**, servidor Express local y almacenes desechables. |
| Cliente .NET y extremo a extremo real contra Express sintético | **99 comprobaciones PASS**. |
| Regresiones JWT/F1/F2/ingesta/composición seleccionadas | **188 PASS** en seis archivos. |
| B77 Statistics.Checks | **129 PASS**. |
| GameSave, 19 modos sintéticos seleccionados | **721 PASS**. |
| SQLite | **43 PASS**. |
| Almacenamiento por perfil, selección sin metadatos reales | **63 PASS**; dos aserciones históricas excluidas explícitamente. |
| F3.1 | **14 PASS**. |
| B54 | **16 PASS**. |
| Inspector estadístico | **23 PASS**. |
| Godot Debug y ExportRelease | Código 0; cero errores; **63 advertencias históricas**, sin nuevas categorías. |

Total de la selección final permitida: **1347 comprobaciones aprobadas**, sin sumar dos veces repeticiones durante correcciones ni las dos aserciones de metadatos excluidas. La compilación ExportRelease no exporta un paquete. No se ejecutó Godot ni una escena del videojuego. La incidencia del primer uso de la suite B68 se describe explícitamente abajo; no se declara una ejecución sin desviaciones.

Cobertura nueva: nueve tipos/cinco biomas, versión/JSON/campos/duraciones/decisiones/tiempo inválidos, tamaño, identidad/scope/expiración/revocación, instalación ajena, deduplicación en lote/entre lotes/concurrencia, conflicto de hash, cuotas/Retry-After, fallos antes/después de commit, purga, ausencia de rutas legacy, no persistencia de payload/IDs claros y agregados. Cliente: serialización, recibo individual/parcial/reordenado/falso/duplicado/vacío, error permanente persistido, 401/403/400/404/429/500/503/302, red/timeout/cancelación/TLS modelados, backoff, renovación explícita, concurrencia y guardado durante HTTP.

Caso extremo a extremo obligatorio:

1. Se creó una Outbox SQLite sintética nueva con cinco eventos, sin copiar datos B78.
2. El HttpClient de StatisticsTransport envió esos cinco a Express en loopback.
3. El fixture destruyó la respuesta después del procesamiento; el agregado quedó en cinco y el cliente en cero confirmados.
4. Se cerró ordenadamente Node y se reabrió el adaptador local.
5. Otro proceso Node abrió el mismo almacén falso, con credencial ficticia nueva por stdin.
6. El reenvío produjo cinco recibos duplicate; Outbox confirmó cinco y el agregado siguió en cinco. El progreso local conservó el bioma completado.
7. Ambos procesos terminaron normalmente y se eliminó únicamente su fixture temporal.

No es una prueba de Godot jugable ni una campaña HTTPS B79 con Caddy/certificado real: el contrato se verificó con HttpClient/Express loopback y las condiciones TLS inválidas se modelaron como fallo del handler. La validación TLS normal está conservada en código, sin instalar certificados. No se atribuyen a B79 las campañas históricas B55/B58.

La selección de regresiones no ejecutó la batería global con pruebas B67, auxiliares de ACL, canales antiguos o campañas Atlas. No se inició B00. Se usó la guardia de .env en tests Node. Los métodos GameSave por defecto/históricos duraderos quedaron excluidos. Los dos errores iniciales del arnés C# (ocultación de un miembro del handler y declaración var múltiple), el preload Windows que requería URI file:// y la incompatibilidad UTC detectada fueron corregidos; las cifras corresponden a la fuente final.

Evidencia: `local-persistence/.work/b79/client-tests.log`, `server-tests.log`, `backend-regressions.log`, `offline-results.json`, logs por modo, compilaciones, `before.json`, `changes.json`, `new-files.json` y `backend-v5-diff.json`.

## 10. Integridad, manifiestos y datos protegidos

Los paquetes B75 y B78 se verificaron de nuevo: **204 archivos cada uno**, sin diferencias. SHA-256 ZIP B75:

`CF55AB6EDF0FE574ACFFCB0B1CCEF121F6FD4727864927770DC8423FAA709257`

SHA-256 ZIP B78:

`078090EE18847F59333DC8B8DE954549265745B80ABC6271946F7DA730A03AAC`

No se reemplazaron, exportaron ni ejecutaron. El esquema estadístico local conserva checksum `59D0B990B5E1E8D356164C2EB7088B79E9594DFD25CDA9CB37F06FA552DFF44E`; no hubo migración ni conversión de Outbox legacy.

El archivo v5 permanece con SHA-256 `2A4956E951217DFF2501D3FFBD35C9024554166E9126AD0134D8FB58C77AD726`. **Su verificador rechaza correctamente el árbol actual**: cuatro añadidos autorizados de statistics, cero archivos protegidos anteriores modificados/eliminados y cero problemas de enlaces. No se declara v5 válido para esos módulos ni se sustituyó/activó el manifiesto. El backend principal debe permanecer detenido hasta revisión y una referencia nueva autorizada; los tests usan composición aislada explícita.

No se leyeron credenciales, .env ni archivos de PlayerData de luis2/TwoSidesTest/TwoSidesStatsTest. No se abrió la SQLite histórica ni se enviaron 71/2151 eventos reales. Los datos consultados/escritos en las pruebas fueron exclusivamente sintéticos.

**Desviación de alcance:** antes de corregir la selección, la suite B68 ejecutó consultas `Directory.Exists` sobre el directorio PlayerData de la cuenta actual para dos aserciones históricas. Aunque no abrió archivos, SQLite u ownership.json ni modificó datos, consultar existencia es acceso a metadatos y **excede la prohibición absoluta de B79**. Se detectó, comunicó y registró; no se presenta como ausencia total de acceso. No se consultaron datos del jugador ni se imprimió el resultado de existencia. Las consultas y las dos aserciones se retiraron explícitamente del fuente de pruebas, sin alterar guardias del juego; las otras 63 se recompilaron y repitieron sobre perfiles ficticios. Los 65 resultados iniciales se conservan como historial de la incidencia y no se usan como aceptación de la selección final. La corrección impide repetirla, pero no deshace las consultas previas. Evidencia adicional: `production.log` original y `production-isolated.log` posterior.

No hubo Atlas, puertos públicos, Caddy productivo, cuentas/roles/permisos remotos, modificaciones ACL/propietario, commits ni push.

## 11. Riesgos y bloqueos de producción

1. B00 no está resuelto: integridad del entorno, custodia y privilegios reales necesitan revisión propia.
2. Falta provisión/custodia/renovación/revocación duradera de la nueva identidad estadística y una interfaz de consentimiento aprobada. El registro ficticio no debe desplegarse públicamente.
3. Falta repositorio Atlas de agregados con transacción ledger+contadores+recibo, índices/retención/permisos mínimos y gestión de claves HMAC. El archivo JSON de referencia no es escalable ni multiproceso; no sustituye MongoDB.
4. El árbol necesita una futura referencia de integridad revisada; v5 antiguo no se activa para ocultar diferencias.
5. Falta prueba autorizada de la nueva ruta por HTTPS y una versión nueva del juego en perfil aislado. B75/B78 distribuidos no incorporan estos cambios.
6. Pendientes permanentes detienen FIFO. La admisión de 90 días y revisión de colas viejas requieren aceptación explícita y UX segura; no se amplía ventana ni borra historia por conveniencia.
7. No hay prueba de resistencia a cliente manipulado, pérdida eléctrica o revocación concurrente de producción. Agregados reflejan hechos recibidos con cobertura posiblemente incompleta, no expedientes ni medidas infalibles de jugadores reales.

## 12. Reversión y próxima etapa

Con servicios/juego detenidos, comprobar before.json y restaurar únicamente los siete archivos existentes desde pre-B79; retirar únicamente los fuentes nuevos inventariados de B79 mediante una operación autorizada. Recompilar. Revertir el fuente de pruebas no autoriza ejecutar sus consultas históricas sobre metadatos reales. No copiar/restaurar SQLite ni ownership.json, borrar pendientes, revertir esquemas o tocar B75/B78. Al retirar los cuatro módulos nuevos, el manifiesto v5 puede volver a contrastarse contra su árbol anterior; no se activa automáticamente. Los fixtures sintéticos se eliminaron al terminar; sus logs agregados y respaldos de fuente se conservan.

**B80 recomendado:** implementar el repositorio estadístico transaccional de agregados con dobles Mongo, conciliación de commit incierto, retención y permisos mínimos; resolver por separado la provisión técnica y la nueva referencia de integridad. Después autorizar una campaña HTTPS sintética del contrato. Una conexión Atlas o nueva exportación requerirá otra autorización explícita. No reutilizar la ingesta de partidas para acelerar la entrega.

**B79 finaliza aquí: transporte implementado y probado en integración simulada, envío distribuido desactivado, sin Atlas ni cambios a partidas reales.**
