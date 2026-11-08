# B33 — Resultado del sondeo de latencia de Atlas y plan de F1 (Etapa 34)

Fecha: 2026-11-02. Sondeo ejecutado por el propietario (contraseña por prompt oculto) con `run-probe-latency.ps1` / `probe.mjs` (B33; solo `hello` y `connectionStatus`). Claude preparó la herramienta, verificó el entorno y redactó este informe. **Claude no se conectó a Atlas. No se modificó `src/` ni `scripts/` del backend, ni el manifiesto; no se implementó F1, F2 ni F3; no se ejecutó otra sincronización, ni sesiones nuevas, ni Express/Caddy/Godot; no se instaló ningún certificado; no se tocó SQLite ni las colecciones históricas; sin commits ni `push`. B00 sigue abierto.**
Añadido solo en `docs/` y `tests/`: `main-latency-probe-plan.test.js` (LT01–LT05), `docs/main-sync-test/probe-atlas-latency.mjs.template`, `run-probe-latency.ps1.template`, y `VL03` en `main-batch-latency-model.test.js`.

## 1. Resultados exactos (informados por el propietario)

| Campo | Valor |
|---|---|
| `atlasLatencyProbe` | `finished` · `executionId 237f3fd19a9ba6caf6c86d2e2a7bd598` |
| Cluster · base | `<cluster>.<id>.mongodb.net` · `two_sides_db` |
| DNS SRV | **68.3 ms** |
| Conexión + autenticación (SRV, TLS, SCRAM, descubrimiento) | **525.8 ms** (un solo bloque; el driver no lo separa) |
| `hello` | **30 intentos**, 0 errores |
| Mínimo | **48.9 ms** |
| Mediana | **49.5 ms** |
| Media | 49.9 ms |
| p95 (rango más cercano) | **50.6 ms** |
| Máximo | **62.6 ms** |
| Errores | **0** |
| Escrituras | **0** |
| Conexión cerrada | `true` |

No recibidos en el mensaje (no se inventan): los 30 tiempos individuales, los handshakes TLS por miembro (`tlsHandshakes`), `connectionStatusMs`, `commands`, fecha/hora de inicio y entorno (versión de Node/SO). Si se quieren archivar, pégalos y se añaden aquí. De lo informado: la dispersión es mínima (rango 48.9–62.6 ms; p95 − mediana = 1.1 ms), es decir, el enlace es estable; el máximo es un único valor aislado.

## 2. Qué NO representa `hello`

`hello` mide la ida y vuelta del driver con una conexión ya autenticada y un comando trivial sin lectura de datos, sin snapshot y sin escritura. **No representa el tiempo de una transacción MongoDB completa**, cuyos viajes pueden costar más por: lecturas con `readConcern: snapshot`, escrituras con `w: majority, j: true` (esperan journal y réplica), el `commitTransaction` (limitado a `maxCommitTimeMS: 1000`), conflictos de escritura/reintentos de `withTransaction`, y la apertura de conexiones nuevas del pool (≈ 525.8 − 68.3 ≈ **457 ms** por conexión nueva en frío, no por viaje). Por eso 49.5 ms es un **mínimo físico por viaje**, no el promedio efectivo.

## 3. Comparación con el modelo de B32

**Corrección de composición.** Midiendo con la composición de producción (`src/main/profile.js`: fence por propietario —lectura de la semilla + `upsert`— y **sin** la autorización de prueba que añade el doble por defecto) el total es el mismo: **34 viajes el primer envío y 26 el reenvío idéntico** (VL03; el doble por defecto usaba fence global y una escritura de autorización exclusiva de pruebas; ambas diferencias se compensan). El desglose de producción: `hello` 2, `listIndexes` 5, guardián 2, `identities` 10, `identitySessions` 5, fence 2, `operations`/`facts`/conteos 5, escrituras de hecho y operación 2, commit 1.

**Tiempo mínimo teórico con la mediana medida (49.5 ms/viaje):**

| Escenario | Viajes | Con 49.5 ms | % del límite de 2 000 ms |
|---|---|---|---|
| Primer envío (hoy) | 34 | **1 683 ms** | **84 %** |
| Reenvío idéntico (hoy) | 26 | 1 287 ms | 64 % |
| Primer envío con p95 (50.6 ms) | 34 | 1 720 ms | 86 % |
| Primer envío si **todos** los viajes fueran el máximo (62.6 ms) | 34 | 2 128 ms | 106 % |
| Primer envío F1 (≈ 14 viajes) | 14 | 693 ms | 35 % |
| Reenvío F1 (≈ 8 viajes) | 8 | 396 ms | 20 % |

**Sensibilidad (viaje efectivo = k × 49.5 ms por escrituras/commit/snapshot):**

| k | ms/viaje | 34 viajes (hoy) | 26 viajes (reenvío hoy) | 14 viajes (F1) | 8 viajes (F1 reenvío) |
|---|---|---|---|---|---|
| 1.0 | 49.5 | 1 683 | 1 287 | 693 | 396 |
| 1.2 | 59.4 | **2 020** | 1 544 | 832 | 475 |
| 1.4 | 69.3 | **2 356** | 1 802 | 970 | 554 |
| 2.0 | 99.0 | 3 366 | 2 574 | 1 386 | 792 |

**Conclusión de la comparación:** el modelo de B32 situaba la frontera del 503 en ≈ 55 ms/viaje (34 viajes ≈ 1 870 ms + el commit). La latencia real mínima (49.5 ms) deja solo ≈ 316 ms (16 %) de margen para todo lo que `hello` no mide. El incidente real —503 con commit correcto— exige un promedio efectivo ≥ 2 000/34 ≈ **59 ms/viaje (k ≈ 1.2)**: perfectamente compatible con escrituras `majority/journal` y el commit. La medición **respalda la hipótesis** (límite demasiado ajustado, no un fallo de red), pero **no la demuestra de forma directa**: sigue faltando la medición de una transacción real (telemetría por fase, F4).

## 4. Evaluación del límite actual de 2 000 ms

- Con la latencia real, el trabajo útil **mínimo** ya consume el 84 % del presupuesto; cualquier sobrecoste del 19 % (k ≈ 1.2) lo agota: es el punto de operación actual, no una cola rara.
- El reenvío (26 viajes) cabe por poco (64–77 %): un `duplicate` correcto puede fallar con 503 si el enlace empeora (k ≥ 1.55).
- Una conexión nueva en frío (+≈ 457 ms) hace imposible cumplir el plazo con el diseño actual (1 683 + 457 = 2 140 ms).
- El límite está **fijado en el código** (`operationBudgetMs ≤ 2000`): no es un parámetro de despliegue. No se modifica en esta etapa (F3).
- Veredicto: **demasiado ajustado para este enlace**; reducir viajes (F1) devuelve un margen de ≈ 2.9× sin tocar semántica, y F2 elimina el 503 falso. Subir el límite sin reducir viajes solo desplazaría la frontera.

## 5. Plan detallado de F1 (NO implementado; requiere aprobación)

### 5.1 Alcance exacto (dos archivos existentes y un módulo nuevo; sin tocar contratos ni endpoints)

- `src/modules/auth/mongo-identity-repository.js`: (a) lecturas de cuenta/sesión **memoizadas por transacción**; (b) comprobación de despliegue con opción `deployment: 'cached' | 'live'` (por defecto **`live`**).
- `src/modules/sync/mongo-ingestion-repository.js`: usa `deployment: 'cached'` solo en la ruta de ingesta y reutiliza la comprobación de la semilla.
- `src/modules/sync/deployment-check.js` (nuevo, ~50 líneas): cache con `ensure/invalidate`, de un solo vuelo.
- **No cambian:** `ingestion-engine.js`, `ingestion-service.js`, `budget.js`, `routes.js`, middleware, esquemas, JWT, contratos de recibo, endpoints, el límite de 2 000 ms, la configuración de conexión, los scripts operativos.

### 5.2 Qué se puede reutilizar y qué no

| Comprobación | Hoy (viajes) | F1 | Por qué es seguro |
|---|---|---|---|
| `hello` (réplica y primario escribible) | 2 | cacheada (TTL 30 s) y sembrada tras abrir | un cambio de primario hace fallar la transacción (`readPreference: primary`, `w: majority`); además invalida la caché (§5.3) |
| Definiciones de índices (5 `listIndexes`) | 5 | cacheadas (TTL 30 s) | ya se verifican al abrir (`inspectMainSchema`); la idempotencia de ingesta descansa en `_id` (`account:operationId`, `scope|sourceKey`), no en los índices secundarios |
| Semilla `ingestion-v1` (lectura) | 1 | cacheada | existencia ya exigida al abrir; solo evita una lectura por operación |
| Validación de cuenta + sesión en la misma transacción | 17 (con guardián) | **4** | las lecturas dentro de una transacción `snapshot` devuelven lo mismo; se memoizan **documentos**, no veredictos (la caducidad y `revoked` se reevalúan en cada llamada); una revocación concurrente toca el mismo guardián y provoca conflicto de escritura y reintento (ya probado por las suites de revocación) |
| **No reutilizable** | | | |
| Guardián (`touch`, CAS por `revision`) | 2 | igual | es la barrera de serialización frente a revocaciones |
| Autorización por transacción (decisión de `coordinate`) | incl. | igual | nunca cacheada entre transacciones |
| Verificación del JWT y `resolveSyncContext` | fuera del presupuesto | igual | por petición |
| Cuota, relaciones, lecturas de idempotencia, escrituras, commit | 9 | igual | son el trabajo de la operación |
| Rutas de registro, sesión y revocación | — | `deployment: 'live'` (como hoy) | las crean/alteran identidades y dependen de los índices únicos; son raras |

**Resultado estimado (por análisis del código; se fijará con la prueba de tope): primer envío ≈ 14 viajes (−20), reenvío ≈ 8 (−18).** Opcional F1-e: fusionar `find + updateOne` del guardián en un `findOneAndUpdate` (−1; 13 / 7), solo si el doble de pruebas lo soporta sin debilitar el CAS.

### 5.3 Invalidación de la caché de despliegue

La caché es **por conexión y ámbito** (`WeakMap`), solo la rellena una verificación en vivo correcta y no se puede sembrar desde fuera. Se invalida (y la siguiente operación verifica en vivo, con fallo cerrado) cuando:
1. **TTL**: 30 s (reloj monótono `performance.now()`).
2. **Cualquier error** de driver/almacenamiento en una transacción (`storage_unavailable`, conflicto no transitorio, commit desconocido): se descarta, no se cachean fallos.
3. **Eventos de conexión/topología**: `close`, `disconnected`, `reconnected`, cambio de primario (`serverDescriptionChanged`) → incrementa la generación.
4. **Cierre del ámbito** (`closeMainScope`) y reinicio del proceso (no persiste).
5. **Llamada explícita** `invalidate()` (pruebas y operaciones tras bootstrap/inspección).
6. **Un solo vuelo**: las operaciones concurrentes comparten la misma verificación en curso; si falla, todas fallan cerradas y nada queda en caché.
7. **Calentamiento al arrancar** (fuera de cualquier presupuesto) para que la primera operación no pague los ≈ 8 viajes.
La caché no contiene datos de identidades ni de jugadores (solo `{verifiedAt, generation}`).

### 5.4 Pruebas de regresión

Todas offline (doble de Mongo + el arnés de viajes de `main-batch-latency-model.test.js`, que pasa a configuración de producción). Las suites existentes **no se modifican ni se debilitan** (743 + 9, legacy 39).
- **Tope de viajes (F1-T1):** primer envío ≤ 16 y reenvío ≤ 10 (objetivos 14 y 8); falla si vuelve a crecer.
- **Concurrencia:** (T2) N primeras operaciones concurrentes ⇒ una sola verificación de despliegue (un `hello` e índices) y un único efecto; (T3) reenvíos idénticos concurrentes ⇒ una operación, un hecho, mismo recibo; (T4) revocación concurrente con ingesta (con inyección de conflicto transitorio) ⇒ o el recibo existe y la revocación llega después, o 401 sin documentos; **nunca** una operación confirmada tras la revocación; (T5) revocación durante la TTL de la caché ⇒ 401 inmediato (la caché de despliegue no afecta a la autorización).
- **Errores parciales:** (T6) fallo antes de escribir, rollback, conflicto transitorio y commit desconocido (M13–M15) con caché activa: se invalida y la siguiente operación verifica en vivo (`hello` aumenta); (T7) índice ausente tras vencer la TTL ⇒ `storage_unavailable`, sin escrituras; (T8) dentro de la TTL la ingesta sigue siendo idempotente por `_id` aunque falten los índices secundarios; (T9) registro/sesión/revocación siguen verificando en vivo (índice ausente ⇒ rechazo inmediato); (T10) la memoización se descarta al terminar o reintentar la transacción (un reintento no ve datos de la anterior).
- **Aislamiento entre identidades:** (T11) dos cuentas con el mismo `operationId`/`sourceKey` no colisionan; (T12) la cuenta B no obtiene recibos de A (`not_found`); (T13) la memoria de cuenta/sesión no se filtra entre transacciones ni entre cuentas; (T14) la caché de despliegue no contiene datos de identidades (forma del objeto).
- **Consistencia de recibos:** (T15) `duplicate` devuelve el mismo `receiptId`, `committedAtUtc` y `payloadHash`; (T16) reenvío contradictorio ⇒ 409 `idempotency_conflict` y el original intacto; (T17) `receipts/query` coincide; (T18) los guardianes y fences suben +1 por transacción como hoy (semántica de B31 sin cambios: tras sesión y una confirmación, `guard 2`, `fence 1`); (T19) **prueba diferencial**: los 63 vectores C# producen las mismas respuestas y filas (salvo ids y marcas de tiempo) con la implementación anterior y la nueva.

### 5.5 Nueva línea base de integridad tras modificaciones autorizadas

El manifiesto cubre `src`, `scripts`, `node_modules`, `package.json`, `package-lock.json`, `vitest.config.js`: cualquier cambio en `src/` lo invalida (B20 §6). Condiciones, en orden:
1. El propietario aprueba por escrito la lista de archivos y el alcance de F1 **antes** de escribir código; una fase por vez.
2. Antes del primer cambio, copia de seguridad protegida de `src/` y `scripts/` (fuera de OneDrive) con su SHA-256, como retorno; el repositorio de `backend/` no está versionado (decisión B00 pendiente).
3. Sin dependencias nuevas (`package-lock.json` intacto); si hiciera falta una, aprobación aparte.
4. Suite completa verde **dos veces seguidas**, legacy 39/39, escáner de secretos limpio, ACL `conforming`; revisión del *diff* (lista de archivos y líneas) por el propietario.
5. Un manifiesto **nuevo** (v3) en `TwoSidesMainIntegrity`, conservando el actual con fecha (procedimiento B21), y `verify` correcto.
6. Comprobar que el preflight con el ancla **antigua** falla (el tripwire funciona) y con la **nueva** pasa.
7. El propietario guarda el digest nuevo fuera de la máquina y lo pasa como `-ExpectedTreeDigest`; la huella JWT no cambia.
8. Primer arranque tras el cambio: solo `/api/health` y la verificación de solo lectura (B31); ninguna escritura hasta nueva autorización.

### 5.6 Riesgos

- **Ventana de deriva de despliegue** de hasta 30 s (índice o primario cambiado en caliente) en la ruta de ingesta; mitigada por TTL corto, invalidación por eventos y fallo cerrado; la corrección de datos no depende de los índices secundarios (T8).
- **Razonamiento sobre aislamiento snapshot**: la omisión de validaciones redundantes se apoya en el CAS del guardián y en el conflicto de escritura de MongoDB. El doble de pruebas lo imita pero no lo demuestra; el CAS ya existe y se prueba en B05/revocación; no hay entorno real de pruebas de concurrencia (no se escribirá en Atlas sin autorización).
- **Conexión en frío** (+≈ 457 ms) no se resuelve con F1; se mitiga con el calentamiento y se decide en F3 (p. ej. `minPoolSize`).
- **Modificar `src/`** invalida el manifiesto; hasta completar §5.5 el backend no debe arrancarse con la guardia.
- F1 **no corrige** el 503 falso (F2) ni el límite de 2 s (F3): reduce la probabilidad (de ≈ 84 % a ≈ 35 % del presupuesto) pero no elimina la ventana de «éxito tardío» si el enlace empeora.
- Los números de §3 son un mínimo teórico sobre una medición de `hello` (30 muestras, una sola ejecución, un solo momento).

### 5.7 Criterios de aceptación

1. Prueba de tope de viajes en verde: primer envío ≤ 16 y reenvío ≤ 10 en configuración de producción (objetivo 14 / 8).
2. Suite completa, legacy y todas las pruebas nuevas (T1–T19) en verde; ninguna prueba existente modificada para que pase.
3. Prueba diferencial de los 63 vectores sin diferencias semánticas.
4. Revocación efectiva de inmediato (T4, T5); sin filtraciones entre identidades (T11–T14); fallo cerrado ante cualquier error de verificación (T6, T7).
5. Contratos, endpoints, esquemas, JWT, recibos y el límite de 2 000 ms sin cambios; diff limitado a los archivos aprobados.
6. Procedimiento de §5.5 completo con línea base nueva verificada.
7. Con la latencia real medida (49.5 ms), el primer envío proyectado ≤ 40 % del presupuesto y el reenvío ≤ 25 %.
8. Validación real posterior solo con autorización nueva: prueba de sincronización controlada (idempotencia incluida) sin 503 y comprobada con la verificación de solo lectura de B31.

### 5.8 Secuencia propuesta

(1) Aprobación del alcance de F1 → (2) copia de seguridad y pruebas T1–T19 escritas primero (fallan donde corresponde) → (3) implementación mínima → (4) suite doble y revisión del diff → (5) línea base nueva (§5.5) → (6) arranque con solo `/api/health` → (7) autorización separada para la prueba real de idempotencia. F2 y F3 se tratan después, cada una con su aprobación.

## 6. Estado

Medición real incorporada; plan F1 listo para tu aprobación. Nada implementado, nada conectado, todo detenido.
