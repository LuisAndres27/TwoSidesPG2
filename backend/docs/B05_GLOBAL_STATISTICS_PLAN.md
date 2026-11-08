# B05.1 — Estadísticas globales y futuro panel
2026-10-27 · Diseño, no consultas remotas ejecutadas ni agregados existentes modificados.

## Universo y confiabilidad
Universo = cuentas técnicas con datos recibidos y validados estructuralmente, NO todas las personas que jugaron. Una persona puede perder credencial o tener varias instalaciones; una instalación offline puede no aparecer nunca. “Registrados” y “con actividad sincronizada” son distintos. Reporte firmado/autenticado no prueba una meta física real: cliente público puede ser modificado.

Ingestión recibe hechos mínimos y proyecciones versionadas, no números totales para incrementar a ciegas. Agregar por IDs/clave lógica únicos y revisión más reciente válida; ningún retry suma otra fila. Batch/HTTP exitoso sin recibo por elemento no es cobertura. Los datos que nunca salieron de SQLite no pueden contarse ni medirse como cola global conocida.

## Inventario de métricas propuesto
Todos los indicadores filtran cuentas/bindings autorizados no eliminados bajo política, período UTC [from,to), versión de contrato/reglas y, cuando procede, bioma. Fecha del hecho reportada por cliente se distingue de receivedAt servidor; reloj local puede ser incorrecto. Entregar ambas opciones de filtro y no mezclar cohortes silenciosamente.
| Indicador | Fuente y fórmula | Dedupe/cobertura/limitación |
|---|---|---|
| Registrados | COUNT DISTINCT TechnicalAccountId de altas durables en período de registro | No displayName, sesiones ni instalación como persona; registros sin actividad se incluyen solo aquí. |
| Con actividad sincronizada | DISTINCT accountId con game.report/session/event/interval aceptado en período | Excluir solo alta y heartbeat de sync; declarar criterio exacto de fecha selected. |
| Partidas iniciadas | DISTINCT(accountId,GameId) con reporte válido de creación | No contar cada revisión; CreatedAt reportado, no fecha de subida. |
| Partidas completadas | DISTINCT GameId con última proyección status completed, cinco completed y final/version válidos | final_pending NO completed. archived sin final no cuenta. No exigir telemetría completa. |
| Activas reportadas | Último game.report in_progress/final_pending,isCurrent=true no cerrado | Reporte potencialmente viejo. No usar lease online como prueba de partida activa; marcar stale y conflictos multiPC, no cerrar por tiempo. |
| Reject/approve y por bioma | COUNT DISTINCT(accountId,GameId,BiomeId,decisionKey) por optionId | No sumar fila de consecuencias ni relecturas. Cinco decisiones máximas por partida actual; historia separada. |
| Porcentaje de opción |100*n(opción)/n(decisiones válidas del mismo bioma/cohorte) | Denominador0→null/no_data, no0%; no dividir por jugadores registrados. Reportar n. |
| Biomas iniciados | Distintos GameId/BiomeId con evidencia de decisión/entrada animal/evento start o reporte de etapa | Si solo human_pending sin evidencia explícita, desconocido; incluir selección humana actual como mínimo probado si el contrato exporta esa evidencia adicional. No tratar cinco filas precreadas como cinco jugados. |
| Biomas completados | Distintos GameId/BiomeId con status completed validado | Fuente progreso, no conteo de ANIMAL_SEGMENT_COMPLETED que puede faltar. |
| Distribución de progreso | Histogramas0..5 completed por GameId en últimas proyecciones | Cohortes activas/históricas separadas; decisiones no son metas. |
| Muertes | COUNT DISTINCT eventId de ANIMAL_DIED válido | Una muerte no es retry; ausencia histórica de instrumentación no equivale a0. |
| Reinicios voluntarios | COUNT DISTINCT eventId de ANIMAL_RESTART_REQUESTED | Son SOLICITUDES confirmadas, no éxito de cambio de escena. |
| Reintentos | COUNT DISTINCT eventId de ANIMAL_RETRY_REQUESTED | Separar de muerte y restart; no derivar attempt_number. |
| Sesiones | DISTINCT accountId/SessionId con session.report o SESSION_STARTED coherentes | Unir fuentes para cobertura, no sumarlas; open/interrupted/closed separados. |
| Tiempo efectivo | SUM(endMs-startMs) de intervalos únicos ActiveAnimal/ActiveHuman válidos y sin solapamiento | No Date.now−created_at ni tiempo offline; ActiveHuman no capturado por observador actual, no inventar. |
| Tiempo por bioma | Misma suma filtrada GameId/BiomeId canónicos | Sin intervalos→null/no_data; excluir Paused/Menu/GameOver/Loading/Background. |
| Finales good/medium/bad | DISTINCT GameId con resultado confirmado/version válido | Dos series: preparados(incluye final_pending) y cerrados(solo completed). No confundir con final visto. |
| Distribución de finales |100*n(tipo cerrado)/n(partidas cerradas válidas de cohorte) | Excluir pendientes y versiones desconocidas; n=0→null. Versión local-ending-reject-count-1 explícita. |

## Disponibilidad real y trabajo adicional
Ya derivables de SQLite: perfil/partidas/historia/decisiones/ambientes/progreso/finales, sesiones/eventos/intervalos realmente capturados; consultas locales tipadas funcionan. No hay ninguna estadística global disponible en API/Atlas actual. Hacen falta identidad durable, outbox, ingesta, índices/proyecciones/consultas, auth admin y pruebas.

Biomas iniciados con precisión histórica, tiempo previo a captura y finales efectivamente vistos no están completos hoy. El game.report mínimo no exporta current_biome_id de etapa humana: debe añadir evidencia tipada no jugable o usar el mínimo de decisiones/start y etiquetarlo. No extraerlo de local_operations.digest ni enviar todo snapshot. Un evento de completion faltante puede detectarse contra completed, pero no reconstruir tiempo/run sin evidencia.

No usar Totals/StatisticsResult locales como entradas incrementales remotas: enviar hechos y contrastar agregados en fixtures. Los contadores pueden calcularse al consultar; si se materializan, usar contribución por hecho/versión con actualización idempotente en la misma transacción y posibilidad de recomputar, nunca un incremento adicional al retry. Decisiones no se vuelven a sumar cuando sube una revisión de partida.

## Cobertura y datos tardíos
Respuesta debe contener {metric,availability:available|no_data|unknown|partial,value:null|number,unit,numerator?,denominator?,coverage:{historicalCoverageUnknown,incomplete,receivedThroughUtc,selectedTimeBasis},warnings:[]}. Nombres son propuesta API, no reemplazan enums locales.

Cero disponible significa ausencia medida dentro de una cobertura conocida: un run capturado sin ANIMAL_DIED puede informar0 en esa cobertura; no se extiende a la vida del jugador. Sin extensión/captura→no_data/unknown, valor null. Sumar solo duraciones persistidas y marcar incompleto si sesión abierta/interrumpida/intervalos faltantes. La cola de ese cliente puede tener datos pendientes que el servidor desconoce; mostrar “datos recibidos hasta...” y, si cliente reporta cursor/balance opcional, aclarar que es declarado y no garantía de completitud.

Un historical_import aporta lo que existe, no fabrica sesiones/muertes de juegos antiguos. Eventos tardíos actualizan buckets afectados por hora del hecho, con versión/asOf visible; informar ventana de revisión, no asumir todos los días anteriores cerrados. Validar UTC como orientación, usar offsets para duración. Terminal interrupted usa último offset durable, no toda la pausa entre última muestra y descubrimiento.

Perfiles/revisiones históricas no se reescriben para sincronizar. Partidas legacy con ending/version no reconocidos permanecen aparte para revisión; no aplicar regla nueva retroactivamente por inferencia. La versión autorizada local actual se valida como tal.

## Modelos/índices de lectura previstos
Colecciones de recibos/hechos/proyección se describen en B05_SYNC_ARCHITECTURE. Índices de consulta secundarios por acceptedAt/occurredAt, GameProjection(status,ending,endingRulesVersion,closedAt), DecisionFact(biomeId,optionId,occurredAt), EventFact(kind,biomeId,occurredAt), IntervalFact(sessionId,startMs,endMs). Validar planes/cotas en datos sintéticos antes de producción; índices de unicidad separados de optimización. No cada consulta agrega toda la base sin límite.

API admin puede responder summary/decisions/progress/gameplay/endings/timeSeries con filtros consistentes y units explícitas, requestId/asOfUtc y cobertura. Limitar366d/366buckets por interactiva; jobs de exportación necesitan fase/permiso distinto y no incluir PII por defecto. Cuando un filtro no es aplicable (bioma sobre total de cuentas registradas), devolver métrica fuera de alcance o especificar intersección, no cambiar denominador ocultamente.

## Panel AWS conceptual
Panel estático/servido con HTTPS y auth administrativa separada; backend de consulta autorizado stats:read con MFA/OIDC, no credencial player. Resumen general, tendencias por día/semana, bioma/opción, progreso, gameplay y distribución de finales. Filtros en UTC con zona de visualización elegida explícitamente; mostrar n, cobertura, último dato recibido, parcial/desconocido y separación de preparados/cerrados.

Navegador nunca recibe URI/clave Atlas, contraseñas/credenciales, secreto de firma, PHC, tokens de otros usuarios o datos individuales innecesarios. Privilegios de BD de consulta readonly, cuotas, caches por filtros/rol con TTL explícito (no cache de credenciales), redacción/auditoría y agregación de grupos pequeños según política de privacidad. Requerimientos previos: retención, consentimiento/base de tratamiento aplicable, borrado/pseudonimización, regiones, presupuesto, observabilidad, restauración/backup y política de acceso.

No se selecciona ni despliega stack AWS concreto, no se crea web ni se abre Atlas en B05.1. Las consultas propuestas no son métricas verificadas con datos reales.



## B05.3A — Outbox SQLite sintética (2026-10-27 Guatemala)

Outbox local ya conserva proyecciones/fuentes mínimas sin exportar agregados incrementales, nombres, secretos o snapshots de reanudación. historical_import conserva cobertura histórica desconocida; no inventa muertes/tiempos/reinicios y completed difiere de final_pending. Las partidas cerradas autorizadas se probaron en fixtures sin crear telemetría inexistente. No captura/backfill real, ingesta/Atlas ni estadísticas globales disponibles. Un recibo simulado de Outbox no acredita cobertura remota ni permite contabilizar métricas en panel.

Contrato, tablas, transiciones, operaciones, limitaciones, pruebas, inventario y plan runtime en [B05_LOCAL_OUTBOX_IMPLEMENTATION.md](B05_LOCAL_OUTBOX_IMPLEMENTATION.md). No inicia B05.3B ni autoriza tocar runtime, HTTP o Atlas. B00 sigue pendiente; sin cambios ACL/propietario/herencia.
