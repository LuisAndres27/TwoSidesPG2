# B05 C.2 — preparación del mecanismo de activación de un solo uso

Fecha: 2026-10-29. **LISTO CON CONDICIONES** (sección 9). Se preparó y probó offline el mecanismo. **No se generó ningún manifiesto de activación remota, no se pidió ninguna contraseña, no se conectó Atlas, no se ejecutó C.2/F.2.** B00 sigue sin resolver y B05.5 no se inició.

## 1. Mecanismo preparado

No hizo falta escribir código nuevo del mecanismo: `c2-receiver-core.js`, `c2-receiver-entry.js` y `c2-receiver.ps1` de la release sellada ya lo implementan y son **byte a byte idénticos** a los del workspace (SHA-256 comparados: núcleo `BACE3274…9BEF`, entrada `6DBC4E78…0E02`, lanzador `7033A154…2187`). Se contrastaron los diez puntos pedidos contra el código real y contra pruebas:

| # | Requisito | Dónde se impone | Prueba |
|---|---|---|---|
| 1 | Vinculado al identificador exacto de la release | JS: `releaseId` del manifiesto = nombre del directorio y `payloadSha256` = hash de la lista de archivos (`assertActivation`, `payloadDigest`). PS: `Test-C2PayloadBinding` y rutas bajo `C2Runtime\c2-<hex32>` | AC01, SU02 |
| 2 | Exige el SHA-256 de la referencia externa | `--manifest-sha256` / `-ManifestSha256` obligatorio; debe coincidir con los bytes de `manifest.json` (PS: `Get-FileHash` con el archivo abierto sin escritura; JS: hash recalculado) | SU02, RX21 |
| 3 | Rechaza digests incorrectos | Mayúsculas exactas de 64 hex; ausente, en minúsculas o distinto → `ACTIVATION_REJECTED` / `hash` | SU02, RX02, RX21 |
| 4 | Limita a C.2 | `mode='c2-remote-once'`, `remoteEnabled=true`, `version=2`, ámbito de esquema `10ef4f6d…` fijo y escenarios exactamente `A,B,C` en ese orden | SU01 |
| 5 | Un solo intento A/B/C | `runs/` debe estar **vacío** y el run nuevo; el núcleo reserva con marcador `wx` | SU04, SU06 |
| 6 | Sin reutilización tras fallo o cancelación | La carpeta del run y `launcher-attempt.started` quedan; un segundo intento (mismo o distinto `executionId`) se rechaza con 0 pulsaciones solicitadas | SU04, SU06 |
| 7 | Ventana máxima de 4 h | `expires − created ≤ 4 h`, `expires > created`, `now < expires`, arranque hasta 60 s antes. Exactamente 4 h pasa; 4 h + 1 ms no. El permiso del arnés caduca con la ventana | SU01, SU05 |
| 8 | Reserva antes de pedir la contraseña | PS: run, marcador, `temp` y ACL antes del prompt. Núcleo: `claimRun` antes de `receiveAtlasCredential` | SU03, SU06 |
| 9 | Destino y alcance no modificables | Solo existen tres argumentos; el destino es constante en PS y en el núcleo (`same()` sobre `target`); `user`, `database`, `host`, `authSource`, mecanismo y TLS se comparan uno a uno | SU01, RX03 |
| 10 | Falla cerrado | Cualquier discrepancia lanza código fijo y no escribe resultado ni lee stdin; sin generador de manifiestos en `scripts/` ni `src/` | SU01–SU08, AR02 |

Pruebas nuevas (`backend/tests/sync/c2-single-use-activation.test.js`, SU01–SU09):

- **SU01** comprueba que las puertas de JavaScript y de PowerShell responden igual a 23 variantes (ventana, host, usuario, `two_sides_db`, `twosides_backend`, scope, escenarios, modos). Antes solo se probaba cada lado por separado.
- **SU05** cubre permiso opaco, no falsificable, ligado a un run y caducado con la ventana.
- **SU08** verifica en solo lectura que la release sellada sigue bloqueada.

## 2. Release y digest asociados

| Dato | Valor |
|---|---|
| Release | `c2-22fa685aef680f59de7e52427a42d647` en `%LOCALAPPDATA%\TwoSides\C2Runtime\` |
| SHA-256 de `manifest.json` (referencia externa) | `0A8C7D973CE35BFD31D697C5E87B9432D7AC591D1BFBE93E3DCD882F83AA7579` |
| Archivos | 1.894 |
| Estado del manifiesto | `version 2`, `mode c2-blocked`, `remoteEnabled false`, `activation null` |
| `runs` / `temp` | 0 / 0 elementos |

Se ejecutó otra vez, solo lectura, el verificador de la release con el digest leído de la descarga externa (`Downloads\C2_Referencia_Nueva\C2_Nueva_1894\manifest.sha256.txt`): `C2_ACTIVATABLE_REFERENCE_CHECK=PASS files=1894 mode=c2-blocked`, código 0. Eso verifica integridad contra la referencia; no certifica procedencia ni B00.

## 3. Resultado de pruebas offline

- Pruebas nuevas SU01–SU09: **9 aprobadas**.
- Conjunto relacionado (receptor, activación, activatable, composición final, esta suite, preflight durable, operativo, coordinación, revocación durable y canal de credencial; 10 archivos): **202 aprobadas, 2 omitidas, 0 fallos**.
  - Las omitidas son RX17, que necesita la release offline histórica, y AC04, que necesita una copia desechable completa de la release. Ambas se aprobaron en fases anteriores y no se repitieron.
  - Tres pruebas (entre ellas FR05 y FR06) fallaron la primera vez por no definir `C2_FINAL_TEST_ROOT`, la raíz desechable que exigen. No es una regresión de código. Se repitieron con una raíz desechable propia, ya eliminada, y pasaron.
- Cobertura de lo pedido:

| Comprobación | Pruebas |
|---|---|
| Sin autorización | RX01, FR02, SU08 |
| Autorización vencida | RX02, RX21, SU01 |
| Reutilización | RX06, SU04, SU06 |
| Digest incorrecto | RX02, RX21, SU02 |
| Destino incorrecto | RX02, RX03, SU01 |
| Alcance distinto | SU01, AR01 |
| Reserva antes de leer el secreto | SU03, SU06 |
| Sin contraseña en argumentos, entorno o logs | RX08, RX22, SU07 |
| Límites de tiempo, clientes y sesiones | RX10, RX13, SU05 |
| Limpieza segura ante incertidumbre | RX11, RX12, FR03/FR04 |

- Datos y entorno: solo credencial ficticia `FAKE-SYNTHETIC-CREDENTIAL-0001`, sin red. Los manifiestos abiertos de las pruebas viven en directorios desechables (eliminados), con `releaseId` aleatorio distinto del real. **El entrypoint real nunca se arrancó con una puerta abierta**: ahora incluye la fábrica real de conexión, y los casos de PowerShell usan un entrypoint-señuelo.
- Sin red por construcción: SU03–SU07 inyectan dobles o un señuelo, nunca la fábrica real.
- Sin hallazgos de secretos: SU07 comprobó ausencia en argumentos, entorno (exactamente 8 variables), salida y archivos.

## 4. Barreras todavía activas

1. Manifiesto: `c2-blocked`, `remoteEnabled false`, `activation null`. Ni el lanzador ni el núcleo aceptan ese estado (SU08).
2. No existe generador de manifiestos de activación en `scripts/` ni `src/` (AR02), y el único manifiesto que habría que escribir es el de la release sellada, que **no** se tocó.
3. Digest externo, ventana ≤ 4 h, run único y `runs/` vacío.
4. Permiso opaco del arnés ligado al run y al vencimiento; sin él `executeDurableAtlasRun` lanza `DURABLE_REVOCATION_C2_NOT_AUTHORIZED`.
5. Autorización del usuario: no existe una para ejecutar.

**Cambio respecto de la revisión anterior (honesto):** la barrera «la entrada no incluye fábrica de conexión» **ya no existe** en esta release. `c2-release-integration.js` incluye `nativeC2Connection`. Si alguien consiguiera un manifiesto válido con digest correcto, esta release podría conectar. Eso eleva la importancia de las barreras 1, 3 y 5 y de B00.

## 5. Archivos modificados

- Creados en el workspace: `backend/tests/sync/c2-single-use-activation.test.js` y este informe.
- Sin cambios: la release sellada (verificador PASS 1.894, `runs`/`temp` vacíos), los scripts C.2, `backend/.env`, SQLite, Godot, ACL, propietarios, Atlas, y las releases anteriores. Los temporales de prueba se eliminaron.

## 6. Hallazgos de las pruebas

- **G1 — `executionId` igual al identificador de esquema.** El plan exige que el `executionId` nuevo sea **distinto** del identificador C.2A `10ef4f6d…`, pero el código **lo acepta** (SU09 lo registra como brecha conocida). No se corrigió porque cambiaría bytes de la release sellada. Mitigación: al revisar el futuro manifiesto debe comprobarse a mano que el `executionId` sea otro, y conviene corregir la brecha en una release posterior si se sigue adelante.
- **G2 — El «una sola vez» entre ejecuciones distintas depende del lanzador.** Que `runs/` esté vacío lo exige solo el lanzador PowerShell. El núcleo solo bloquea el mismo run. Quien pueda borrar `runs/<id>` con la misma cuenta Windows (B00) puede rearmar el intento; no hay bloqueo del sistema operativo.
- **G3 — Chequeo de `target` de PowerShell más laxo que el de JS.** PowerShell compara los seis campos, mientras que JS además exige que no haya claves extra (`same()`). Un manifiesto con clave extra pasaría el lanzador, se pediría la contraseña y el hijo lo rechazaría antes de leer stdin. Es poco probable (el manifiesto lo fija el digest externo), pero habría que decir que la contraseña se escribiría igualmente.
- **G4 — «Digest externo» es procedimental.** El código solo compara el digest que se le pasa; no puede saber si lo leyó el usuario de una copia independiente. Si se pasa el digest del propio `manifest.json` local, el control se vacía (B00).
- **G5 — Ventana.** El permiso caduca con la ventana, pero la ejecución real la acota el supervisor de 120 s. Una vez recibida una operación, MongoDB no garantiza abortarla.

## 7. Riesgos residuales (no se declaran resueltos)

- **B00 sin resolver:** SID desconocidos A y B con Modify heredado en el proyecto original (incluido `.env`) y SID C con Modify explícito en el Temp del usuario; no se identificaron. Procesos de la misma cuenta pueden atacar código o referencias antes de las comprobaciones.
- **Permisos adicionales en el proyecto original y en `.env`:** siguen igual; no se leyó ni modificó el archivo.
- **Copias en memoria:** Node.js, el driver y el sistema pueden conservar copias de la contraseña hasta terminar el proceso; no se promete borrado completo.
- **Commit incierto:** un commit enviado puede confirmarse después de una interrupción; cerrar o matar el proceso no acredita rollback. Los residuos se conservan.
- **Garantías de Windows limitadas:** los manejadores sin escritura y las ACL mitigan sustitución, no aíslan la cuenta. El respaldo en `C:\TwoSides_Backup_Integridad` es escribible por Authenticated Users.
- **Rol amplio:** `twosides_integration_test` tiene `readWrite` sobre toda su base, más que los documentos autorizados.
- **Referencia externa:** su procedencia (Google Drive) la confirmó el usuario, no la observó el agente.
- El fence avanzará aunque la limpieza sea completa y no podrá restablecerse sin autorización.

Esta autorización de preparación **no** equivale a aceptar estos riesgos para una ejecución real.

## 8. Rotación de la contraseña después del intento (procedimiento previsto)

Responsable: el usuario, desde la administración de Atlas bajo su control. Nadie le entrega al agente la contraseña antigua ni la nueva, y no se usa una cuenta administrativa en el arnés.

1. Tras el único intento (éxito, fallo o cancelación), esperar a que el receptor termine y cerrar la consola que lo lanzó.
2. Conservar `runs/<executionId>/result.json` y, si existe, `synthetic-plan.json`; ninguno contiene la contraseña.
3. **Cambiar la contraseña de `twosides_integration_test`** siempre, incluso si no llegó a autenticarse pero se tecleó en el canal. No alterar roles, red, otros usuarios ni bases.
4. Cerrar las herramientas que pudieran retener la credencial (Compass u otras sesiones) y actualizar sus datos solo si hace falta.
5. Confirmación manual de la rotación. Sin conexión adicional para probar la clave nueva ni la antigua, salvo autorización aparte.
6. Cambiar la contraseña no cancela sesiones ya autenticadas ni deshace commits. Si el resultado fue `COMMIT_UNCERTAIN` o `CLOSE_FAILED`, registrarlo y pedir una decisión explícita sobre cualquier intervención; no limpiar restos sin autorización propia.

## 9. Condiciones pendientes para una única ejecución real

1. **Aceptación expresa y escrita** de los riesgos de la sección 7, incluidos B00 y el rol amplio.
2. **Decidir sobre G1** (`executionId` ≠ identificador de esquema) y G3: aceptar el control manual o autorizar una release nueva con la corrección. Un cambio de código implica nueva release, nuevo inventario y nueva referencia externa.
3. **Autorización aparte para generar el manifiesto de activación** con `executionId` nuevo y ventana ≤ 4 h. Eso modifica `manifest.json` de la release sellada; su nuevo digest necesita una referencia externa propia, recuperada y verificada antes de teclear nada.
4. **Autorización para entregar la credencial** al canal oculto y acuerdo de rotación (sección 8).
5. Ejecutar y aprobar `c2-hidden-input-selftest.ps1` en consola interactiva (modos Accept y Cancel), pendiente de la fase anterior.
6. Confirmar que no corre otra ejecución incompatible y que el fence y el inventario C.2A siguen en su estado inicial (esto solo se puede confirmar dentro del ensayo).
7. Autorización explícita de la ejecución, ligada a release, digest, `executionId`, ventana y comando exactos.

Hasta que se cumplan, el estado correcto es **bloqueado por decisión, no por defecto técnico**.

## 10. Detención

No se pidieron credenciales reales. No se conectó MongoDB Atlas, ni siquiera de lectura. No se generó ninguna activación remota válida ni se modificó la release sellada, `backend/.env`, SQLite, Godot, ACL o propietarios. No se ejecutaron C.2, F.2 ni A36. No se ejecutó `private-workspace.ps1`. No se declaró B00 resuelto ni se inició B05.5.

**LISTO CON CONDICIONES. Detenido antes de cualquier activación.**
