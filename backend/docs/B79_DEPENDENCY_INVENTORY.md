# Inventario previo B79

2026-11-04. Revisados B68–B75, B77/B78, REQUIREMENTS/ARCHITECTURE y componentes reales antes de editar.

| Componente verificado | Uso/decisión |
| --- | --- |
| StatisticsTelemetry, GamePersistenceAdapter, LocalGameplayObserver | Reutilizar captura, IDs, leases y recibos. Añadir aplazamiento acotado sin cambiar el esquema SQLite. |
| GamePersistenceContext/GameSyncHost | Punto único de vida/cierre. Estadísticas mediante capacidad inyectada explícita, apagada por defecto. |
| TwoSides.SyncHttp, HttpClient, CancellationToken | Reutilizar biblioteca y TLS normal; nuevo transportador separado de SyncOutboxDispatcher. |
| Express 5.3.0, Zod 4.6.7, Vitest 5.0.5 instalados | Sin instalar dependencias. Aplicación de pruebas separada. |
| middleware/security.js, rate-limiter.js | Reutilizar cabeceras, errores seguros y limitador. No existe dependencia Helmet en package.json; conservar cabeceras equivalentes existentes. |
| sync/canonical-envelope.js parseStrict | Reutilizar parser puro que rechaza claves duplicadas; no importar servicios de ingesta. |
| composition/backend.js, auth/jwt-v2 y /api/v2/sync | No montar en la aplicación estadística. Mantener legacy intacto. |
| manifiesto v5 | Archivos nuevos en backend/src añadirán diferencias autorizadas. Preservar v5, no activarlo ni regenerarlo; backend principal debe seguir rechazando árbol desactualizado. |

Ruta elegida antes de implementar: POST /api/v1/statistics/events. Namespace propio, sin rutas públicas de consulta por instalación/sesión/partida. Contrato statistics-only-v1 encapsula el DTO B77 inmutable y su hash; no convierte game.report.

Conflictos: cuota legacy vitalicia 1000 no corresponde a telemetría; usar límites temporales nuevos solo en pruebas. La retención de deduplicación exige límite de admisión temporal para impedir recontar después de expirar. La emisión real/custodia de credenciales y el almacén transaccional Atlas quedan fuera de B79. Almacén falso persistente, identidades simuladas y puertos exclusivamente loopback. No habilitar recopilación distribuida silenciosa.

Respaldo de archivos existentes antes de editar: local-persistence/.work/b79/pre-B79; hashes before.json. No se accederá a .env ni a ningún PlayerData. Los resultados B78 aportados por el propietario (71 eventos, final good, 752279 ms, 71 pendientes, cero duplicados) se aceptan como evidencia del propietario, sin abrir esa base ni enviar esos eventos.
