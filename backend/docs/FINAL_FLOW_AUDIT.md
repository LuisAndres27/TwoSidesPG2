# Auditoría del flujo final global
Fase B04.2B.2B.2E.1 · 2026-10-27 · Lectura y documentación.

## Resultado de la búsqueda
No se localizó en el código actual inspeccionado un evaluador ejecutable que transforme el conjunto de cinco decisiones/resultados en Bueno, Medio o Malo. Se buscaron referencias de finales, ending, conteos/resultados, VariablesGlobales y sus métodos en scripts, escenas, integración, local-persistence/src y backend/src, y se contrastó docs/Final_Global_Godot.md. Este último documenta el protocolo remoto, no umbrales. No se consultó el proyecto original ni servicios externos. La ausencia en este ámbito no demuestra que nunca haya existido un evaluador en otra versión.

No es correcto inventar una fórmula o presentar el selector visual como el cálculo del final. El backend Node actual contiene identidad/sesión, no una implementación de las rutas remotas de juego que resuelva esta laguna.

## Funcionamiento real
scripts/Final.cs y scenes/levels/Final.tscn implementan una sola pantalla con tres variantes textuales Bueno, Medio y Malo. Conservan títulos, textos y animación progresiva; no son tres escenas diferentes.

_Ready oculta el control y obtiene GameApplicationContext.Services.Endings.ConfirmedEnding. Sin confirmación redirige a recuperación/login. Con confirmación muestra la pantalla, libera pausa y selecciona el enum visual: good → Bueno, medium → Medio, restante → Malo, detrás del validador que solo admite good/medium/bad. No cuenta decisiones en ese método.

EndingService.ConfirmedEnding requiere sesión autenticada, snapshot verificado, status final_pending y ending válido. GameStateStore valida que final_pending tenga cinco biomas completed, CompletedAt, versión de reglas y GoodBiomeCount coherente con los resultados. Verifica consistencia; no define qué conteo corresponde a cada final.

La rama remota de AnimalSegmentFlow puede dirigir al final tras POST de animal-completions y recuperación confirmada. Sin ending confirmado dirige a recuperación remota. La ruta local al tocar FinNivel no llama CompleteBiome ni abre Final.tscn: muestra operación no implementada.

VariablesGlobales conserva enum y estados/indicadores heredados, pero no es la fuente durable de las cinco decisiones. No se encontraron llamadas activas que reconstruyan desde ella un evaluador global; sus resets en flujos antiguos no equivalen al cierre de SQLite. BiomaSaludable de una escena no puede decidir el resultado de cinco biomas.

## Presentación y salida
Final.cs conserva animación de texto (velocidad y espera), permite que un clic complete el texto y solo una acción posterior inicie la salida. _Process comprueba validez remota; perderla redirige a recuperación. Abrir la escena o acabar la animación no cierra por sí solo la partida.

IrAlMenu llama EndingService.ExitAsync. El protocolo antiguo usa un ID/revisión estable, POST /api/v1/me/games/{gameId}/final-exit y recuperación GET; exige que la respuesta identifique una sucesora distinta, in_progress, revisión cero y cinco biomas limpios. Solo después reconoce la operación y limpia indicadores heredados. Los fallos mantienen reintento/recuperación. GoRecovery conserva dependencia de login/sesión; no es navegación local reutilizable sin cambios.

Esa creación de sucesora es una expectativa remota heredada, no autorización para crear una partida local al completar el quinto. El PackedScene exportado hacia menú principal no acredita su uso: el método actual utiliza recuperación.

## Cuatro estados diferentes
| Estado | Evidencia necesaria | Situación actual local |
|---|---|---|
| A. Bioma completado | Llegada válida y recibo CompleteBiome | Servicio existente; meta sin conectar. |
| B. Cinco completados | Cinco registros canónicos completed | Consultable; CompleteBiome no prepara final global. |
| C. Final presentado | Resultado correcto confirmado y presentación efectiva | No hay flujo local de final ni marcador durable de presentación implementado. |
| D. Partida global cerrada | Cierre explícito durable, historial conservado y autorización para nueva partida | No lo implementa CompleteBiome. |

No convertir B en C por una solicitud de cambio de escena ni en D por el quinto recibo. No crear/archivar/borrar partidas al completar un bioma.

## Quinto bioma y SQLite
CompleteBiome deja status in_progress, resume_kind menu y revisión incrementada aun con cinco completed. Las tarjetas bloquean todos los completed y la política local de nueva partida sigue considerando la partida inconclusa. Abrir Final.cs en ese estado no funciona sin confirmación remota. Hay riesgo de menú sin biomas disponibles y sin cierre permitido.

El esquema contiene ending, ending_rules_version y completed_at, pero tener columnas no implementa la transición. SQLiteRepository.UpdateGame no las actualiza y el contrato de continuación local admite menu/human_decision/decision_info/animal_start, no un checkpoint de final. No basta rellenar un booleano global o cambiar la escena.

Para preservar el comportamiento local hacen falta: procedencia verificable de las reglas originales; resultado global y versión de evaluación; asociación al propietario/partida y cinco resultados confirmados; operación idempotente de preparación del final; política explícita de presentación, recuperación tras cierre/reinicio y cierre global; historial inmutable y habilitación de Nueva partida solamente cuando corresponda. El marcador durable de presentación/cierre y sus transacciones requieren diseño separado, no una migración implícita en la integración de metas.

## Propuesta separada y límites
Antes de conectar físicamente la quinta finalización, aprobar su destino recuperable y el contrato de final local. Opciones de producto requieren decisión expresa; esta auditoría no elige umbrales ni transforma in_progress en final_pending por su cuenta. Las pruebas sintéticas pueden demostrar el quinto commit sin alterar datos reales, pero eso no demuestra que el juego global esté terminado.

Obtener el evaluador original verificable, si existe, o autorizar específicamente su diseño. Después separar preparación, presentación y cierre. Conservar textos, animación y la intención de los tres finales; reemplazar autenticación/HTTP únicamente dentro de una futura fase autorizada.

Limitaciones: sin ejecución visual/física, sin pruebas automáticas nuevas y sin acceso al backend histórico. No se certifica accesibilidad de las metas, duración de animaciones ni resultados globales sin evaluador. Riesgos pendientes: quinto bloqueado, dependencias HTTP, cierre remoto que presupone sucesora, eventos no atómicos y estado de presentación no persistido.



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
