# B05 C.2 — ejecución real en Atlas: resultado

Análisis realizado el 2026-10-30T02:52–02:56Z (UTC), solo con archivos locales sanitizados. **El agente no ejecutó el lanzador, no pidió contraseñas, no conectó MongoDB Atlas y no modificó el resultado del run.** Quien ejecutó fue el usuario, en su consola.

## 1. Resultado general

**ÉXITO SEGÚN EL RESULTADO SANITIZADO LOCAL (`status: passed`, `code: OK`), sin incertidumbre registrada y con la limpieza completada. Aún sin verificación remota independiente y con la rotación de la credencial pendiente de confirmar.**

No se asume el éxito por el mensaje «Receptor C.2 finalizado»: se leyó el resultado. El lanzador solo imprime ese mensaje si el hijo terminó con código 0, sin salida por stdout/stderr, y `result.json` dice `passed` con el mismo run y modo (`c2-receiver.ps1`); aquí el contenido de `result.json` lo confirma por sí mismo.

| Pregunta | Respuesta | Estado |
|---|---|---|
| ¿Run consumido? | **Sí** | Confirmado |
| ¿Hubo conexión a Atlas? | **Sí** (`atlasConnected: true`) | Confirmado por el resultado del receptor |
| ¿Escenarios A/B/C? | Los tres con evidencia positiva (sección 3) | Confirmado a nivel de evidencia exportada |
| ¿Commit incierto? | **No** (`uncertain: false`; sin escrituras pendientes que bloquearan la limpieza) | Confirmado por el resultado |
| ¿Limpieza? | **Ejecutada** (`cleanup: done`, 16 documentos) | Confirmado por el resultado; no verificada remotamente |
| ¿Cierre de recursos? | **Sí** (`resourcesClosed: true`) | Confirmado por el resultado |
| ¿Fence C.2A preservado? | Evidencia **local e indirecta** a favor (sección 6) | No verificado remotamente |
| ¿Rotación de la credencial? | **Pendiente / no confirmada** | Desconocido |

## 2. Archivos sanitizados leídos

Ruta: `C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\c2-4d2193d364587b1eed72b7e6ef8345b6\runs\2c541441db11c34b6807a21f4794c30b\`

| Archivo | Bytes | Escrito (UTC) | SHA-256 |
|---|---:|---|---|
| `launcher-attempt.started` | 0 | 02:50:30.931 | — (marcador) |
| `receiver-attempt.started` | 0 | 02:50:50.689 | — (marcador) |
| `synthetic-plan.json` | 1.725 | 02:50:50.697 | `4E7B1B75B74A4A9342CFA5EB5CE1F408DDE6515E8AD130196A483255E3F72966` |
| `result.json` | 454 | 02:51:13.263 | `0E696FA17068D7692F58655CB94217CE3BB5CA835CDFB4CF4D29A20FEC8CE9B0` |
| `temp\` | — | — | vacío |
| `C2Runtime\consumed\c2-4d2193d3….json` | 239 | 02:50:30.925 | registro de consumo |

Solo se leyeron estos archivos. No se abrió `backend/.env`, SQLite ni Godot, y no hay contraseñas, tokens ni claves en ellos: `synthetic-plan.json` contiene únicamente nombres de colecciones e IDs sintéticos de tres actores, y `result.json` solo códigos y booleanos.

**Línea de tiempo (UTC):** 02:50:30.9 el lanzador reserva el intento (registro de consumo, run y marcador) y muestra el aviso. 02:50:50.7 el hijo recibe la credencial, abre la integración y guarda el plan sintético (unos 20 s después, el tiempo de teclear). 02:51:13.3 se escribe `result.json`. **Unos 22,6 s** entre el inicio del hijo y el resultado, muy por debajo de los 120 s. Todo ocurrió dentro de la ventana autorizada (02:39:39 → 06:39:39).

## 3. Resultado de los escenarios

`result.json` (completo):

```json
{"version":1,"mode":"c2-remote-once","runId":"2c541441db11c34b6807a21f4794c30b","status":"passed","code":"OK","atlasConnected":true,"uncertain":false,"cleanup":"done","resourcesClosed":true,"evidence":{"revocationFirst":true,"noNewReceipt":true,"operationRevision":2,"revocationRevision":3,"historicalReceiptPreserved":true,"receiptRecovered":true,"foreignBindingRejected":true,"revokedTokenRejected":true,"persistedReceipt":true,"cleanedDocuments":16}}
```

El receptor solo escribe el bloque `evidence` cuando el arnés devuelve `completed: true`; cualquier fallo de una aserción interna del arnés daría `EXECUTION_FAILED` y no `passed`. Por eso un `passed` con `evidence` presente implica que el arnés terminó sus tres escenarios y la reapertura.

| Escenario | Evidencia exportada | Resultado |
|---|---|---|
| **A** — la revocación confirma primero | `revocationFirst: true` (revocación confirmada), `noNewReceipt: true` (no se creó recibo nuevo tras revocar) | **Positivo** |
| **B** — la ingesta confirma primero | `operationRevision: 2` < `revocationRevision: 3` (revisión de la operación anterior a la de la revocación), `historicalReceiptPreserved: true` | **Positivo** |
| **C** — respuesta perdida y desvinculación | `receiptRecovered: true` (mismo `operationId` recupera el recibo), `foreignBindingRejected: true` (vínculo ajeno rechazado) | **Positivo** |
| **Reapertura** — tercer cliente | `revokedTokenRejected: true`, `persistedReceipt: true` | **Positivo** |

**Alcance de esta lectura:** los booleanos exportados son un subconjunto de las aserciones del arnés (por ejemplo, el resultado no exporta uno a uno «duplicado posterior rechazado» o «desvinculación persistida»). Que `passed` implique que esas aserciones internas se cumplieron se deduce del diseño revisado del receptor; no se volvió a auditar el arnés en esta fase. Los resultados por escenario son **confirmados a nivel de evidencia local**, no re-observados en el servidor.

**Comportamiento de las revocaciones:** conforme al diseño (A: tras confirmar la revocación no se persiste operación ni recibo nuevo; B: se conserva el recibo histórico y el token queda rechazado; C: la desvinculación se persiste y el uso posterior se rechaza). Las dos cifras de revisión (2 y 3) muestran que la revocación quedó ordenada después de la operación.

## 4. Clientes, envíos y operaciones

**No registrado en el resultado sanitizado.** `result.json` no contiene cantidad de clientes, de envíos, de sesiones ni de comandos MongoDB. Lo que sí se puede afirmar:

- Límites vigentes en el supervisor: 3 clientes, 8 envíos (A=2, B=2, C=4), 2 sesiones explícitas y 2 implícitas simultáneas, 120 s globales. Superarlos detiene la ejecución con error; no hubo error, así que **no se superaron**.
- **Cifras exactas de clientes y envíos: desconocidas.** Los tres actores sintéticos A/B/C y sus IDs están en `synthetic-plan.json`.
- Operaciones confirmadas por el resultado: A/B/C y la reapertura (arriba), y 16 documentos borrados. Rechazos esperados dentro de los escenarios (revocado, duplicado, vínculo ajeno, token antiguo) son parte de lo que `passed` exige; no se exportan como lista.
- Errores registrados: **ninguno** (`code: OK`). Operaciones rechazadas inesperadas: ninguna reportada.

## 5. Commits inciertos y limpieza

- **Commits inciertos: ninguno** (`uncertain: false`; el receptor lo fuerza a `COMMIT_UNCERTAIN` si el runtime lo detecta y no habría limpiado).
- **Limpieza: ejecutada** (`cleanup: done`, `cleanedDocuments: 16`). Coincide con el inventario esperado: 2 ops + 2 facts + 3 identities + 3 ownerGuards + 3 identitySessions + 3 revocations = 16 filas eliminables, con 0 en authorization. No fue omitida ni bloqueada.
- La limpieza solo corre si el runtime está sin incertidumbre ni escrituras pendientes, y borra por `_id` exacto confirmando `deletedCount = 1`; el éxito del resultado implica que eso se cumplió. **No se verificó en el servidor** que las filas ya no existan: eso requeriría una conexión, que no se hizo.

## 6. Fence C.2A

- **Evidencia local, indirecta:** `cleanedDocuments` es 16 y no 17; la fila 17 es el fence, que el diseño nunca elimina (SU/FR03/FR04). Las revisiones registradas (2 y 3) muestran que **avanzó** más allá de la revisión inicial 0.
- **Valor final de la revisión: desconocido.** Solo se conocen las revisiones 2 y 3 exportadas; el valor tras cerrar no está en el resultado.
- **No hay verificación remota.** Que el fence siga presente y en qué revisión exacta solo puede confirmarse con otra conexión autorizada.
- Consecuencia ya aceptada (R10): no se puede asumir revisión 0 ni reiniciarlo; otra ejecución C.2 sobre este ámbito no es posible sin una decisión nueva.

## 7. Integridad local tras la ejecución (solo lectura)

| Comprobación | Resultado |
|---|---|
| Archivos de `package` frente al manifiesto | 1.894 de 1.894 coinciden; 0 diferencias, 0 ausentes, 0 enlaces |
| Digest de `manifest.json` | Sin cambios: `47F4250B…62BDD` |
| Temporal del run | Vacío |
| Procesos `node` del receptor | Ninguno en marcha |
| Release bloqueada `c2-ba006dea…` | Sin cambios: `A24EDEE0…D57A8`, `runs` vacío |
| Release `c2-4d2193d3…` | Consumida; **no puede volver a ejecutarse** |

Nota: el verificador de lectura ya no daría PASS en esta release por diseño (falla cuando existe el registro de consumo y `runs` no está vacío), así que no se usó; la comprobación anterior se hizo con hashes directos contra el manifiesto.

## 8. Rotación de la credencial

**Estado: PENDIENTE / NO CONFIRMADA.** El agente no puede ver Atlas ni verificar el cambio. La contraseña se tecleó a las 02:50 UTC; desde entonces no se ha informado de ninguna rotación.

Según el plan aprobado (`B05_C2_INTEGRATION_CREDENTIAL_ROTATION_PLAN.md`, §5 y lista del §9), **la credencial debe rotarse ahora**, también aunque la ejecución haya terminado bien:
1. Cambiar la contraseña de `twosides_integration_test` desde Atlas a un valor nuevo y aleatorio que no se anote.
2. Retirar del gestor de contraseñas la entrada de la contraseña utilizada.
3. Cerrar herramientas que la retengan y la consola del lanzador.
4. Comprobar el cambio con el registro de actividad de Atlas y la hora de modificación del usuario (sin probar la contraseña antigua).
5. Registrar fecha, resultado y responsable, sin secretos.
6. Si la rotación falla, registrar el incidente y no hacer otra conexión.

## 9. Incertidumbres y limitaciones

| Asunto | Estado |
|---|---|
| Estado remoto real (documentos borrados, fence, colecciones) | **No verificado**; se apoya en el resultado del receptor |
| Cifras exactas de clientes, envíos, sesiones y comandos | **Desconocidas** (no se exportan) |
| Revisión final del fence | **Desconocida** |
| Rotación de la contraseña | **Sin confirmar** |
| Memoria del proceso | Residual aceptado (R5); proceso terminado |
| B00 | **Sigue pendiente**; esta ejecución no lo resuelve ni lo agrava |
| Qué significa este resultado | Valida en Atlas, con datos sintéticos y en este ámbito limitado, el comportamiento de revocación durable de los escenarios A/B/C y la reapertura. **No** declara resuelta la revocación general, ni habilita F.2, ni B05.5 |

## 10. Qué no se hizo

No se ejecutó C.2 de nuevo, no se conectó Atlas, no se pidieron contraseñas, no se ejecutó F.2, no se modificó el resultado del run ni los marcadores, ni SQLite, Godot, `backend/.env`, ACL o propietarios. No se tocó `two_sides_db` ni `twosides_backend`.

**Resultado: C.2 ejecutada una vez, con éxito según el resultado sanitizado local; verificación remota y rotación pendientes. Detenido.**
