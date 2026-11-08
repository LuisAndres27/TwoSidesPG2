# B05 C.2 — preparación del manifiesto de activación de un solo uso

## VERIFICACIÓN EXTERNA — PASS (2026-10-30T02:45:27Z)

**VERIFICADA EN INTEGRIDAD: PASS, 1.894 archivos, código 0, dentro de la ventana de validez.** La release **sigue sin ejecutar ni consumir**. No se ejecutó el lanzador real, no se pidió ninguna contraseña y no se conectó Atlas. La procedencia de Google Drive la confirma el usuario; el agente no observó la cuenta ni su historial. B00 permanece pendiente. Esta verificación no autoriza una ejecución.

Ruta descargada (confirmada por el usuario): `C:\Users\luis2\Downloads\C2_Final_4D2193`.

| # | Comprobación (solo lectura) | Resultado |
|---|---|---|
| 1 | Cinco archivos correctos | **Sí.** Exactamente `INSTRUCCIONES.md`, `manifest.json`, `manifest.sha256.txt`, `reference.json`, `verifier.sha256.txt`; sin ausentes, duplicados, subcarpetas, elementos adicionales ni enlaces |
| 2 | Cinco hashes coinciden con el paquete original | **Sí, los cinco** (tabla abajo) |
| 3 | `reference.json` identifica la nueva release | **Sí:** `releaseId c2-4d2193d364587b1eed72b7e6ef8345b6`, `mode c2-remote-once`, `remoteEnabled true`, `executionId 2c541441…c30b`, ventana 02:39:39.489Z → 06:39:39.489Z. El `manifest.json` descargado dice lo mismo (1.894 archivos, escenarios A,B,C) |
| 4 | Digest procedente del `manifest.sha256.txt` descargado | **Sí.** Se leyó de `C2_Final_4D2193\manifest.sha256.txt`: `47F4250BFA0DF6A052BC7E616961B28ABF7C63F1C40629B68CFF5AF176762BDD`. Coincide con el valor esperado por el usuario, con el SHA-256 del `manifest.json` descargado y con `reference.json`. No se usó un digest tomado de C2Runtime ni del proyecto |
| 5 | Verificador | **PASS, `files=1894 mode=c2-remote-once`, código 0.** Antes de ejecutarlo se comprobó que el hash del script de la release (`EFA7AD7C…1272EE0E7`) coincide con el `verifier.sha256.txt` descargado. Se ejecutó con `-NoProfile -File`, `ExpectedMode c2-remote-once` y el digest recuperado |
| 6 | Ventana de validez | **Vigente.** A 02:45:32Z faltaban 3 h 54 min 07 s para el vencimiento (06:39:39.489Z). El propio verificador valida la ventana en modo `c2-remote-once` |
| 7 | La release real sin registros de ejecución ni consumo | **Sí:** `runs` y `temp` con 0 elementos; la raíz es solo `package`, `manifest.json`, `runs`, `temp`; no existe `C2Runtime\consumed` ni `consumed\c2-4d2193….json`; el manifiesto local sigue teniendo el digest `47F4250B…62BDD` |

Hashes comparados (descarga = original, todos coinciden):

| Archivo | Bytes | SHA-256 |
|---|---:|---|
| INSTRUCCIONES.md | 4509 | `0C2EEF3DB37B60BDB12D61DE814EB79743C5CB6B982F5D4D07064935B9B4DC1D` |
| manifest.json | 343906 | `47F4250BFA0DF6A052BC7E616961B28ABF7C63F1C40629B68CFF5AF176762BDD` |
| manifest.sha256.txt | 65 | `5C39E3C1CA5C814BEC1CCDDDABEC634215F4929C4BC27BF6A0ED6A97F6325FD9` |
| reference.json | 986 | `6ABC7A95E66088B20B7B14A4F91195C084B031129FEB71C3814F40A21B4701F1` |
| verifier.sha256.txt | 65 | `004FA2848E07E29E50264ADB1072E85BCF0A4A2AEE78C35A2C67A7512DAB2EB4` |

Los hashes de los `.sha256.txt` son los de los bytes de esos archivos, no los digests que contienen.

**Alcance y límites.** PASS acredita que la descarga y la release local coinciden y que la release pasa el verificador. No certifica procedencia histórica, independencia de la cuenta de Drive ni resuelve B00 (R7, G4). No autoriza ejecutar. **La ventana sigue corriendo:** vence a las 06:39:39Z (00:39 en Guatemala). Si vence antes de la autorización de ejecución, hay que preparar otra release con otro digest y otra referencia.

**Pendiente para ejecutar:** la autorización de ejecución, expresa y separada, que fije release, digest `47F4250B…62BDD`, `executionId`, ventana y comando; contraseña exclusiva preparada solo entonces; sesión limpia; plan de rotación aprobado. Nada de esto se ha hecho.

---

Fecha: 2026-10-30 UTC (2026-10-29 America/Guatemala). **PREPARADO OFFLINE, NO ACTIVADO.** Se generó el manifiesto de activación en una release nueva y su paquete de referencia para Google Drive. No se pidió ninguna contraseña, no se conectó MongoDB Atlas, no se ejecutó C.2 ni F.2 y la ejecución real sigue sin autorizar. B00 sigue pendiente.

## 1. Autorización utilizada

Autorización expresa del usuario (2026-10-30 UTC), limitada a: copia nueva con identificador distinto; release original bloqueada intacta; manifiesto de un solo uso offline; alcance A/B/C y límites ya aceptados; manifiesto de integridad y paquete de cinco archivos para Drive; comprobaciones offline; documentar identificador, digest y ventana. El usuario confirmó que puede subir, descargar y verificar dentro de la ventana de 4 h. **No** se autorizó introducir contraseñas, conectar Atlas, ejecutar C.2/F.2 ni tocar la base principal, ACL, propietarios, SQLite, Godot o `.env`. La aceptación de riesgos R1, R4–R10 (limitada a C.2) ya estaba registrada.

## 2. Datos de la release activable

| Dato | Valor |
|---|---|
| **Identificador de release (nuevo)** | `c2-4d2193d364587b1eed72b7e6ef8345b6` |
| Ruta | `C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\c2-4d2193d364587b1eed72b7e6ef8345b6` |
| **executionId** | `2c541441db11c34b6807a21f4794c30b` (distinto del identificador de esquema `10ef4f6d…`) |
| **SHA-256 del manifiesto (nuevo)** | `47F4250BFA0DF6A052BC7E616961B28ABF7C63F1C40629B68CFF5AF176762BDD` |
| SHA-256 del verificador | `EFA7AD7C88168EF25A0BCCE23C82262D9BB7D2DC82B3F0DC1B32A071272EE0E7` (sin cambios) |
| SHA-256 del payload | `35502ABC9C42F00E474259267E7A08594AFD643627806B4C36E3022030A0CBC7` (idéntico al de la release bloqueada) |
| Archivos | 1.894 |
| **Ventana de validez** | **2026-10-30T02:39:39.489Z → 2026-10-30T06:39:39.489Z** (exactamente 4 h). En hora de Guatemala: 20:39:39 → 00:39:39 del día siguiente |
| mode / remoteEnabled | `c2-remote-once` / `true` |
| Escenarios / ámbito | `A, B, C` / esquema C.2A `10ef4f6d653f4ee4a1d1b2e6591013c2` |
| Destino | TwoSidesCluster, `<cluster>.<id>.mongodb.net`, usuario `twosides_integration_test`, base `two_sides_integration_test`, authSource `admin`, DEFAULT, TLS estricto |
| Release de origen | `c2-ba006dea951a180aabf7561b028ee1cb`, **sin cambios**: manifiesto `c2-blocked`, digest `A24EDEE0…D57A8`, huella completa de su árbol idéntica antes y después, `runs` y `temp` vacíos |

El digest `47F4250B…62BDD` es **distinto** del de la release bloqueada, como corresponde: cambiar el manifiesto cambia el digest. No se reutilizó ningún digest anterior.

**La ventana corre desde la generación.** El código no admite fechas futuras de más de 60 s, de modo que no era posible fechar el manifiesto para más adelante. Si se agota sin intento, la release no queda consumida, pero el manifiesto deja de ser válido y habría que preparar otro con otro `executionId`, otro digest y otra referencia externa.

## 3. Qué cambió

Respecto de `c2-ba006dea…`: **solo `manifest.json`** (nuevo `releaseId`, `createdAt`, `mode`, `remoteEnabled`, el bloque `activation`, `parentReleaseId`, `parentManifestSha256`, `changes: []`). Los 1.894 archivos de `package` son idénticos byte a byte (`diff -rq` sin diferencias), no se instaló nada y no se modificó ningún script. La raíz contiene solo `package`, `manifest.json`, `runs` y `temp`; `runs` y `temp` están vacíos.

Archivos del workspace: se añadió la prueba SU14 a `tests/sync/c2-single-use-activation.test.js` y se creó el paquete de referencia (sección 5), más este informe. Se actualizaron `B05_C2_FINAL_EXECUTION_DECISION.md` y `B05_C2_RESIDUAL_RISK_ACCEPTANCE.md` para reflejar la autorización de preparación.

## 4. Comprobaciones offline

| Comprobación | Resultado |
|---|---|
| Verificador de la release nueva, modo `c2-remote-once`, digest `47F4250B…62BDD` | `PASS files=1894 mode=c2-remote-once`, código 0. **Con el digest local de generación: no es verificación externa** |
| Puerta completa del lanzador sobre una **copia desechable** con los mismos bytes de `package` y un manifiesto de prueba propio (otro `releaseId`, otro `executionId`, ventana de 1 h) | Dió la respuesta esperada en cada caso: |
| — digest equivocado | rechazado en `hash`, 0 pulsaciones solicitadas |
| — `executionId` distinto del manifiesto | rechazado en `activation`, 0 pulsaciones |
| — identificador de esquema como `executionId` | rechazado en `args`, 0 pulsaciones |
| — tras los rechazos | sin registro de consumo, sin carpeta de run |
| — manifiesto válido | pasó **todas** las comprobaciones reales (entorno, ACL, 1.894 hashes, firma y hash de Node, temporal) y llegó al aviso de la contraseña |
| — se canceló con Escape en el aviso | rechazo `input`; el hijo **no se arrancó**, no se leyó ninguna credencial, no hubo resultado ni red |
| — tras cancelar | existe el run, el marcador y el registro de consumo; un segundo intento → `reuse`, 0 pulsaciones; el verificador pasa a FAIL |
| Limpieza de esa copia | Eliminada tras comprobar ruta exacta y marcador; eliminado su registro de consumo y el directorio `consumed` (vacío). No queda residuo |
| Prueba SU14 (lectura de la release real y de su paquete) | Aprobada: paquete de 5 archivos coincide con el manifiesto; el núcleo acepta el manifiesto **solo dentro de la ventana** (rechaza 61 s antes, y desde el vencimiento), rechaza digest erróneo, `runs`/`temp` vacíos y sin registro de consumo |
| Regresión relacionada (6 archivos: receptor, activación, composición final, activable, esquema, unicidad) | 66 aprobadas, 2 omitidas (RX17 y AC04, que necesitan sus propias copias), 0 fallos |

**Lo que NO se ejecutó** sobre la release real: ni el lanzador, ni el receptor, ni una activación, ni el aviso de contraseña. Su `runs` sigue vacío y no existe `consumed\c2-4d2193d3….json`. La copia desechable se usó con un `KeySource` que siempre cancela, de modo que no se arrancó ningún proceso hijo.

## 5. Paquete de referencia para Google Drive

```text
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\docs\c2-reference\c2-4d2193d364587b1eed72b7e6ef8345b6-20261030T024009Z\
```

Cinco archivos: `manifest.json` (copia exacta), `manifest.sha256.txt`, `verifier.sha256.txt`, `reference.json` e `INSTRUCCIONES.md`. No contiene contraseñas, `.env`, bases de datos, claves ni ningún comando de ejecución. El `INSTRUCCIONES.md` incluye el procedimiento de recuperación y verificación en modo `c2-remote-once`.

### Qué debe hacer usted ahora (antes de 2026-10-30T06:39:39Z)

1. Suba esos **cinco archivos** a una carpeta **nueva** de Google Drive. No sobrescriba los paquetes anteriores.
2. Descargue la carpeta desde la interfaz de Drive a otra ubicación nueva (por ejemplo `C:\Users\luis2\Downloads\C2_Activable_4D21`) y envíeme la ruta.
3. Yo, en solo lectura: compararé los cinco SHA-256 con el original, leeré el digest del `manifest.sha256.txt` **descargado** (no de la release), contrastaré el hash del verificador y ejecutaré el verificador con `-ExpectedMode c2-remote-once`. Debe dar `PASS files=1894 mode=c2-remote-once` y código 0, **antes de cualquier credencial**.

Para verificar usted mismo, el `INSTRUCCIONES.md` del paquete contiene el bloque de PowerShell, que solo compara y no activa nada.

## 6. Barreras que siguen en pie

El manifiesto de la release nueva es ahora un manifiesto de activación válido dentro de su ventana, así que **la barrera «no existe un manifiesto de activación» ya no se aplica a esta release** (sí a `c2-ba006dea…`). Siguen vigentes:

1. **No existe ninguna contraseña**: no se ha creado, pedido ni introducido; sin ella el receptor no puede autenticar.
2. **No hay autorización de ejecución ni de conexión** y no se ha generado ningún comando de activación.
3. Digest externo: el lanzador exige el digest del manifiesto como argumento y verifica los bytes; la independencia depende del procedimiento (G4).
4. Registro de consumo, ventana de 4 h, `runs` vacío, permiso del arnés y verificación de permisos efectivos antes de escribir.
5. Límites: 3 clientes, 8 envíos, 120 s, 16 documentos, fence protegido, detención ante discrepancias o commits inciertos.

Quien tuviera a la vez este manifiesto, su digest y una contraseña válida del usuario de integración podría lanzarlo dentro de la ventana; el riesgo es el R9 que usted aceptó, y no cambia por haber preparado el archivo.

## 7. Riesgos residuales

Siguen vigentes los R1–R10 tal como están registrados; la aceptación (R1, R4, R5, R6, R7, R8, R9, R10) cubre una única ejecución sintética C.2. R2 y R3 siguen su vía. **B00 continúa pendiente**: esta preparación no lo resuelve. Procedencia de Drive: sólo la confirma el usuario.

## 8. Condiciones pendientes para una única ejecución

1. ~~Verificación externa de `c2-4d2193d3…` con el digest recuperado~~ **Cumplida** (PASS, 02:45:27Z; ver el encabezado).
2. **Autorización de ejecución, expresa y separada**, que fije release, digest `47F4250B…62BDD`, `executionId`, ventana y comando.
3. Contraseña exclusiva preparada solo en ese momento, según el plan de rotación aprobado, y disposición a rotarla inmediatamente después de cualquier intento.
4. Sesión limpia y, antes de empezar, `runs` vacío y sin registro de consumo.
5. Si la ventana vence antes de lo anterior: nueva preparación, nuevo digest, nueva referencia.

## 9. Detención

Sin contraseñas reales. Sin conexión a MongoDB Atlas. Sin C.2, F.2 ni A36. Sin cambios en `two_sides_db`, `backend/.env`, SQLite, Godot, ACL ni propietarios, ni en usuarios o permisos de Atlas. La release `c2-ba006dea…` y las anteriores no se modificaron.

**PREPARADA, VERIFICADA EXTERNAMENTE, NO ACTIVADA. Detenido a la espera de la autorización de ejecución.**
