# Plan del evaluador local de finales
B04.2B.2B.2E.2B.1 · 2026-10-27 · Auditoría y diseño; ninguna implementación.

## Fuente auténtica: no recuperada
E.2B.1 completada como auditoría. E.2B BLOQUEADA PARA IMPLEMENTACIÓN hasta establecer reglas verificadas. El usuario confirma que la demostración tenía tres finales correctos, pero la copia disponible no contiene el algoritmo que permita reproducirlos. No equiparar esa confirmación con una tabla de resultados.

Evidencia actual:
- scripts/Final.cs: _Ready consume EndingService.ConfirmedEnding y selecciona textos good→Bueno, medium→Medio, bad→Malo. No evalúa decisiones.
- scripts/globals/VariablesGlobales.cs: diccionario NoJugado/Bueno/Malo por enum, setters/getters/reset. Sin agregación a tres finales.
- scripts/EnvironmentalDecisionNivel.cs, DecisionSceneFlow.cs, DecisionNivel.cs, OceanDecisionNivel.cs, DecisionCatalog y LocalDecisionSession: decisiones y consecuencias individuales. reject→healthy y approve→degraded están confirmados; no determinan por sí solos el umbral global.
- integration/sqlite/RealGameCatalog.cs: reglas initial-state-only-1 y contenido copy-initial-content-1; expresamente no es un evaluador de finales.
- scripts/network/Progress/GameStateStore.cs: compara GoodBiomeCount con cantidad de resultados good y valida final_pending. No transforma ese conteo en good/medium/bad.
- AnimalProgressService/EndingService y contratos GameContracts/OperationContracts: reciben resultado/remiten operaciones HTTP. No implementan fórmula.
- backend/src/app.js y módulos auth/identity: health, registro, sesión e identidad. Sin servicios/modelos de partidas/finales ni evaluador; pruebas actuales de backend solo cubren identidad/auth/API.
- local-persistence/src/GameSaveService.cs.txt, Validation.cs.txt, modelos, esquema, repositorio y estadísticas: almacenan/validan metadatos o resultados individuales; no calculan final global.
- docs/Final_Global_Godot.md y documentación de requisitos/integración: describen confirmación remota y dependencias pendientes, no una regla original completa.
- Fixtures RuntimeMenuChecks.SeedTerminal y pruebas de estadísticas/eventos usan ending preestablecido para probar persistencia/validación. No son un oráculo del videojuego.

## Historial Git local inspeccionado
Solo lecturas; sin fetch, checkout, restore, cambio de ramas ni proyecto original. Repositorio raíz confirmado como la copia autorizada. Referencias locales: master, origin/master, origin/main y origin/HEAD; nueve commits alcanzables:
5972713, 49b55ae, c8d9b91, 57a95aa, c66cd5d, cbea507, 6376cca, 1a77a52, 645d213.

HEAD=5972713c116748d4cb968e092d6d114a3e44b69e (Mapa nieve buen estado). Sus archivos versionados no incluyen Final.cs, FinNivel.cs ni VariablesGlobales.cs. Se enumeraron los árboles de los nueve commits, el historial de scripts/rutas pertinentes y búsquedas de TipoFinal/EstadoNivel/ending/GoodBiomeCount/finales/puntuación/conteos saludables en fuentes, escenas y documentación versionadas; sin evaluador. Los commits iniciales contienen PantallaDecisiones.cs/pantalla_decisiones.tscn; la versión inspeccionada en 6376cca solo navega a EscenaOpcionA/EscenaOpcionB. Ningún log de archivos JS/MD aporta un backend histórico de finales. El reflog disponible tampoco revela una versión de los controladores finales.

La búsqueda termina en el working tree y objetos alcanzables por las referencias/reflog locales inspeccionados. No certifica objetos perdidos, ramas remotas no descargadas, copias externas ni la implementación de la demostración ausente. No se accedió a remotos para ampliar la evidencia.

Comandos de evidencia: git rev-parse --show-toplevel; git log --all; git rev-list --all; git branch -a; git ls-tree -r --name-only por commit; git grep por commit limitado a extensiones de código/escenas/documentos; git show 6376cca:PantallaDecisiones.cs; git reflog show --all. Se excluyó .env de búsqueda de contenidos.

## Contrato propuesto, condicionado a recuperar reglas
No hay firma local implementada. Propuesta: evaluador puro recibe una captura validada de un propietario y GameId, revisión, versión de reglas verificadas y exactamente los cinco biomas canónicos completed, con una decisión por bioma, clave canónica, opción original, consecuencias/versiones y resultado individual coherentes.

Validar igualdad de conjuntos, no solo Count=5: ocean/jungle/desert/forest/tundra sin duplicados ni extras. Asociar decisiones y ambientes por GameId+BiomeId, validar LastDecisionId, clave, propietario, recibo de decisión y consistencia reject/approve con healthy/degraded y result good/bad. Nunca tomar orden de juego, último bool global, fecha o attempt_number como ponderación.

Salida futura: good/medium/bad más versión auténtica de reglas y huella de entradas para auditoría/idempotencia. No SQL, HTTP, modificación de contexto, escena, tiempo ni aleatoriedad dentro del evaluador. Datos incompletos/contradictorios/versiones desconocidas → error tipado, nunca final por defecto. El algoritmo intermedio queda SIN DEFINIR: ni mayoría, ni unanimidad, ni ponderaciones quedan adoptadas.

## Equivalencia: pendiente de un oráculo
No se ejecutaron ni crearon pruebas de equivalencia: no existen salidas verificadas para alimentar los casos. Las 472 pruebas y 10/10 manuales de E.2A son antecedentes confirmados por el usuario, no ejecuciones E.2B.1.

Tras obtener fuente auténtica, fijar versión/commit/hash y ejecutar su lógica como oráculo junto al evaluador extraído, en fixtures aisladas. Si las cinco decisiones son binarias y no hay más entradas, comparar exhaustivamente las 32 combinaciones; si la fuente usa otras entradas, ampliar el espacio según esa evidencia. Cubrir Bueno/Medio/Malo con ejemplos derivados de la fuente, permutaciones del orden, cinco decisiones completas, faltante, bioma incompleto, duplicados/contradicción, evaluación repetida, proceso nuevo y resultado ya persistido. El resultado confirmado no se recalcula con otra versión al reintentar. No presentar pruebas de presentación o seeds de SQL como equivalencia.

## Archivos que requerirían cambios en una fase posterior
Rutas propuestas, no autorización de edición:
- local-persistence/src/LocalFinalEvaluator.cs.txt (nuevo, únicamente después de recuperar/aprobar reglas).
- integration/sqlite/RealGameCatalog.cs: separar versión inicial de catálogo y reglas finales auténticas sin reinterpretar silenciosamente partidas existentes.
- local-persistence/src/GameSaveService.cs.txt, SQLiteRepository.cs.txt, Models.cs.txt y Validation.cs.txt: contrato de preparación/cierre/continuación descrito en GLOBAL_PLAYTHROUGH_CLOSURE_PLAN.
- integration/sqlite/GamePersistenceAdapter.cs y LocalGameState.cs: puertos y contexto de resultado confirmado.
- scripts/AnimalSegmentFlow.cs, MenuNiveles.cs y Final.cs: preparar/reanudar presentación local, sin cambiar textos, animación o mecánicas.
- local-persistence/game-save-tests/LocalFinalEvaluatorChecks.cs.txt y GlobalClosureChecks.cs.txt (nuevos), GameSaveChecks.cs.txt; proyectos solo si una inclusión explícita lo exige.
- SchemaManager.cs.txt únicamente si se aprueba una NUEVA migración para evidencia de presentación; nunca editar checksums de migraciones aplicadas ni migrar runtime en una fase de diseño.

## Decisión necesaria
Alternativa preferida: aportar la fuente/commit verificable de la demostración (evaluador y sus dependencias/pruebas), con autorización específica de lectura si está fuera de esta copia.
Alternativa: aportar una tabla original completa o requisitos originales con todos los casos límite y confirmación de que son la referencia auténtica.
Última alternativa: definir reglas nuevas explícitamente aprobadas. Eso es un cambio de diseño y no debe llamarse recuperación/equivalencia histórica.

No adoptar ninguna alternativa automáticamente. E.2B.2 debe seguir bloqueada para implementación hasta disponer de evidencia o aprobación expresa de reglas nuevas. No se implementa evaluador ni B05.



## B04.2B.2B.2E.2B.2 — Finales locales autorizados (2026-10-27)

**COMPLETADA EN CÓDIGO; VALIDACIÓN RUNTIME PENDIENTE.** El usuario autorizó regla nueva definitiva, no recuperada del evaluador original:0/1/2 reject→bad;3/4→medium;5→good, exclusivamente cinco decisiones canónicas de cinco completed de la misma partida. Versión narrativa separada local-ending-reject-count-1; se conservan versiones de partida/decisiones.

Informe completo, inventario exacto y guía manual en GLOBAL_PLAYTHROUGH_CLOSURE_PLAN.md (apartado E.2B.2). Un evaluador puro centraliza la regla; GameSaveService.PrepareFinal/CloseGame usan transacción/recibos existentes y esquema2 sin migrar. final_pending persiste resultado antes de navegar; cierre solo por acción explícita de salida, completed/is_current0 e historia intacta. Continuar recupera cinco completed sin resultado o final_pending después de reinicio, sin repetir decisiones/metas. Nueva partida es explícita y solo posterior al cierre, con perfil igual, GameId nuevo y cinco biomas limpios/disponibles.

Final.cs consume SQLite y sale localmente: escena/textos/tween/nodos/recursos intactos, sin HTTP/login. AnimalSegmentFlow coordina quinto; menú recupera finales. FinNivel/CompleteBiome y mecánicas intactos. StatisticsService únicamente reconoce la versión final nueva para metadatos, ajuste informado previamente; no se alteran agregados o eventos. CompletedAt indica preparación del resultado; recibo close_game/ArchivedAt indican cierre. No existe ni se afirma marcador durable de “final leído”.

598 comprobaciones aprobadas:126 nuevas y472 regresiones reejecutadas,0 fallidas finales. Biblioteca/ejecutores0 errores/0 advertencias; Godot C# Rebuild0 errores,63 advertencias históricas ParallaxBackground,0 nuevas. Sin ejecución de Godot; visual/navegación/pausa real requieren manuales. Las10/10 manuales anteriores son E.2A, no esta fase.

Tres bases protegidas y9 archivos asociados idénticos en hash/tamaño/fecha;1.542 archivos fuera de alcance idénticos. .env278 bytes y SHA-256 4DB843D236E5FBB289DF82CB4544F43D680A42451FD6905E581117E034196928, sin valores ni cambios ACL/propietario; riesgo B00 pendiente. Solo fixtures nuevas para escrituras. Sin migraciones, Node/Atlas/AWS/B05. Probar manualmente good/medium/bad en partidas sucesivas sin editar decisiones ni borrar historia; incluir reinicio antes de salir del final, cierre y nueva partida. Trabajo detenido.
