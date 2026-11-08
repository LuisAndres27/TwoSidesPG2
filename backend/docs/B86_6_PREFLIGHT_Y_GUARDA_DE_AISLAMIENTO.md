# B86.6 — Por qué el preflight falla y el diagnóstico sigue conectando

Fecha: 5 de noviembre de 2026. Atlas no se contactó en esta fase (solo lectura de código y pruebas locales).

## 1. Hallazgo
`tools/b86/atlas-session.mjs` importa `tools/b86/session.js`, y éste importa `tools/b84/demo-store.js`, que importa `tests/statistics/b81-container-instance.js`, que importa `tests/statistics/b80-isolation-guard.js`. Esa guarda de aislamiento de pruebas **parchea `net`, `tls` y `dns`** y lanza `Error('B80_EXTERNAL_NETWORK_REFUSED')` (o `…_DNS_…`) ante cualquier host que no sea loopback. Por eso:

| Herramienta | Importa `session.js` | Guarda instalada | Resultado frente a Atlas |
|---|---|---|---|
| `atlas-diagnose.mjs` (variantes A–E) | no | no | conecta (llegó a la autenticación: `bad auth`, luego C/D OK) |
| `atlas-session.mjs` (preflight) | **sí** | **sí** | `Error` genérico en `connect` → `unknown (connect) [error=Error, code=other]` |

Comprobado en local, sin Atlas: tras importar `session.js`, `tls.connect` a un host no loopback lanza `B80_EXTERNAL_NETWORK_REFUSED` antes de cualquier E/S; con `atlas-policy.js`, `atlas-connector.js` y `diagnose.js` no hay guarda. Un cliente `MongoClient` hacia una dirección de documentación reservada, con la guarda activa, termina en `unknown` con ese mensaje. Los tres preflight fallidos coinciden con este mecanismo (error genérico, sin código, en `connect`), con **una salvedad**: en la reproducción el nombre de la clase final es `MongoServerSelectionError` y en los preflight reales fue `Error`; no pude reproducir la ruta exacta con SRV sin hacer consultas DNS reales. La variante F del diagnóstico lo confirmará o refutará con el mensaje saneado.

## 2. Cambios de esta fase
- `diagnose.js`: variantes **E** (SCRAM-SHA-1 + todas las opciones del conector) y **F** (flujo real del preflight: carga `session.js` y ejecuta su acción `preflight`; sin lecturas de colecciones ni escrituras). `-Variants E,F` limita la ejecución; A–D ya son conocidas. Si C funciona y E falla se biseccionan las opciones sobre la base SHA-1.
- `atlas-connector.js`: el error clasificado lleva el error original bajo un símbolo **no enumerable** (`DIAGNOSTIC_SOURCE`); es invisible para `JSON.stringify`, `Object.keys`, `message` y `stack`.
- `atlas-session.mjs`: el fallo imprime la línea de antes más `detail: name=… code=… codeName=… frame=… causes=… message=…` mediante el mismo saneado que `diagnose.js`. Además **aborta con salida 2 antes de conectar** si detecta la guarda activa («Nothing was contacted»), para no repetir intentos a ciegas.
- `Run-Atlas-Diagnose.ps1`: parámetro `-Variants`.

## 3. Corrección aplicada en B86.7 (autorizada por el propietario)
Antes, mientras `session.js` cargaba la guarda, el preflight de Atlas no podía funcionar (y ahora lo decía sin contactar). Cambio aplicado: las constantes `B84_KEY`/`B84_KEY_CHECK` (lo único que `session.js` usaba de `demo-store.js`) pasan al módulo neutral `tools/b84/demo-key.js` (solo `node:crypto`); `demo-store.js` las reexporta, de modo que sus demás usuarios no cambian y sigue cargando la guarda para pruebas y demostraciones locales. `session.js` importa `demo-key.js`. No hay importaciones diferidas: ninguna acción de Atlas (`preflight`, `provision`, `seed`, `publish`, `read`) puede cargar `tests/` ni la guarda. El aborto de `atlas-session.mjs` ante una guarda activa se mantiene. La guarda (`tests/statistics/b80-isolation-guard.js`) no se modificó y no se añadió ninguna variable que la evite. Pruebas: `tests/b86/b86-session-flow.test.js` (recorrido del grafo de importaciones de cada entrada y acción, controles positivos, sonda en procesos reales, huella SHA-256 de la guarda) y `tests/b86/import-graph.js`.
