# B05.5 Etapa 3 — Integración del worker HTTP en Godot

Continúa `B05_5_GODOT_HTTP_OFFLINE_RESULT.md`. No se reconstruyó el cliente HTTP, los repositorios SQLite ni el Outbox.

**Resumen honesto:** la política de ciclo de vida (iniciar una vez, detener, no duplicar, reconexión, cierre) está implementada y probada contra el Express offline real con SQLite desechables. El nodo de Godot que la usa **compila, pero no se ejecutó dentro del motor**: no hay ejecutable de Godot localizado en esta máquina y, además, arrancar el juego abriría la partida de ejecución real (`.work/runtime-game/save.sqlite3`), que está protegida. Por eso **no se afirma que funcione en el juego real**.

## 1. Punto de inicialización elegido

`GameApplicationContext` (el Autoload ya existente `res://scripts/network/GameApplicationContext.cs`). En `_Ready` crea, después de `LocalPersistence`, un único hijo `SyncHost` (`GameSyncHost`). No es un segundo Autoload y no pertenece a ninguna escena de bioma, por lo que cambiar de escena no lo crea, duplica ni detiene.

## 2. Archivos

| Archivo | Cambio |
|---|---|
| `local-persistence/sync-http/SyncWorkerLifecycle.cs.txt` | **Nuevo.** `SyncLocalMode`, `SyncBindingReader`, `SyncWorkerLifecycle` (C# puro, sin tipos de Godot). |
| `integration/sqlite/GameSyncHost.cs` | **Nuevo.** Nodo delgado: lee el argumento, programa ticks fuera del hilo principal. |
| `scripts/network/GameApplicationContext.cs` | Crea `SyncHost`; `Logout()` lo detiene. |
| `integration/sqlite/GamePersistenceContext.cs` | `SyncStorage` (solo lectura) y gancho `BeforeStorageClose`, esperado con límite de 3 s antes de cerrar la base. Solo se asigna con el modo de prueba activo. |
| `integration/sqlite/GamePersistenceAdapter.cs` | `SyncStorage`: expone el `ISaveDatabase` abierto (null al empezar el cierre). |
| `local-persistence/sync-http-tests/SyncHttpChecks.cs.txt` | +7 comprobaciones (total 21). |

No se tocaron: cliente HTTP, `SyncOutboxService`, esquema SQLite, biomas, decisiones, finales, `backend/.env`, ACL, C2Runtime, `project.godot`.

## 3. Modo de prueba y control de sesión

- **Deshabilitado por defecto.** Se habilita solo con el argumento de usuario exacto `--two-sides-sync-local-test` (`godot ... -- --two-sides-sync-local-test`).
- El destino es siempre `http://127.0.0.1:3000`. No hay argumento de host, puerto, esquema ni credencial; cualquier otro `--two-sides-sync*`, o el flag repetido, deja la sincronización deshabilitada.
- Cada 2 s `_Process` (solo si está habilitado) lanza un tick en un hilo de fondo. El tick arranca el worker **únicamente** si: hay perfil local listo (`State.Ready` y `Profile`), existe almacenamiento abierto y hay exactamente una instalación de sync registrada. Si falta algo espera (`SYNC_WAITING_SESSION/STORAGE/BINDING`); nunca inventa una instalación.
- Los ticks y el worker están serializados por un `SemaphoreSlim`: como máximo un worker y un `HttpClient`.

## 4. Inicio y detención

- **Inicio:** idempotente (`SYNC_STARTED` la primera vez, `SYNC_RUNNING` después). No necesita servidor: sin Express el worker deja las operaciones `retryable_failure`.
- **Detención ordenada y acotada:** cancela el worker (y con él la petición en curso), espera hasta el presupuesto, libera el `HttpClient` y deja el estado en `Stopped`. Si excede el presupuesto devuelve `SYNC_STOP_TIMEOUT` y el cierre del cliente aborta el socket.
- **Cuándo se detiene:** `Logout()`, cierre del juego (`QuitAsync` espera el gancho antes de cerrar SQLite) y `_ExitTree`.
- Las operaciones pendientes o con lease no se tocan al detener: los leases vencen y el siguiente arranque los recupera (`RecoverExpired`), reconciliando por recibos las que tengan más de un intento.

## 5. Pruebas aprobadas (disposable SQLite + Express offline real en 127.0.0.1)

Comprobaciones nuevas (todas pasan; 21/21 en el runner):

| # | Requisito | Comprobación |
|---|---|---|
| 1 | Inicialización única / deshabilitado por defecto | flag exacto, destino fijo, rechazo de variantes, sin cambios en el Outbox si está deshabilitado |
| 2, 4 | Inicio y no duplicar | 1 worker; 20 ticks concurrentes → `SYNC_RUNNING`, `WorkersCreated==1`; sin sesión/almacenamiento/instalación no arranca |
| 3 | Cierre | detención ordenada, doble stop inocuo, cliente liberado, reinicio con sesión nueva |
| 5, 6 | Sin servidor / reconexión | arranca sin Express, guarda localmente, tras levantar Express entrega los mismos `operationId` |
| 7, 8 | Sincronización / recibos | confirmación solo con recibo válido (suite previa de 14 + nuevas) |
| 9 | Sin bloqueos | 50 `Request()`/ticks con servidor mudo en < 1,5 s; stop con petición de 30 s en curso en < 7 s |
| 10 | Cierre durante operación pendiente | Outbox consistente, nada confirmado sin recibo, el siguiente arranque termina el trabajo |

Regresiones: Javascript `vitest` 575 aprobadas/16 omitidas (tres suites C.2 requieren `C2_FINAL_TEST_ROOT` apuntando a una raíz desechable; con ella pasan), checks SQLite 43/43, infraestructura 28/28, juego compila con 0 errores.

## 6. Pruebas manuales pendientes

1. Ejecutar el juego con `-- --two-sides-sync-local-test` contra `node scripts/run-offline-backend.js --port 3000` **usando almacenamiento desechable** (requiere un mecanismo de ruta de prueba no habilitado en producción; no se añadió para no abrir una vía a guardados reales).
2. Confirmar visualmente que no hay tirones al iniciar/parar y al cambiar entre biomas.
3. Cerrar la ventana con una petición en vuelo y comprobar que el cierre no supera ~3 s extra.
4. Verificar `GD.PushWarning("[Sync] …")` solo con el modo activo.

## 7. Limitaciones

- No se ejecutó Godot; el nodo `GameSyncHost` solo está validado por compilación y revisión. La lógica de política sí está probada.
- El `Request()` tras capturar hechos nuevos aún no se invoca desde el juego; el worker consulta cada 15 s en reposo.
- Tras `Logout()` el nodo queda detenido (`_closing`); `ResumeAfterLogout()` existe pero no hay flujo de login local que lo invoque todavía.
- Las llamadas SQLite del despachador compiten con el adaptador por la base; un `STORAGE_BUSY` se trata como reintento (`SYNC_STORAGE_*`).
- Secretos solo en memoria; falta almacén protegido (DPAPI). Sin TLS probado. Contrato `/api/v1` heredado sin tocar.

## 8. Próximo paso para Atlas real

Sin cambio respecto a la etapa 2 y todavía **no autorizado**: confirmar rotación de la contraseña de `twosides_integration_test`; definir el perfil `integration`; almacén protegido de credenciales; prueba manual en motor con almacenamiento desechable; y solo entonces validar contra Atlas con autorización expresa. No se conectó Atlas, no se ejecutó C.2/F.2 y B00 continúa pendiente.
