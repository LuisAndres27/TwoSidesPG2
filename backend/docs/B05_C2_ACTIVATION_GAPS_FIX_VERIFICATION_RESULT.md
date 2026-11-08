# B05 C.2 — verificación externa final y revisión SC01

Fecha local: 2026-10-29 (America/Guatemala). Inicio del verificador: **2026-10-30T02:09:24.5528229Z**. Cierre de comprobaciones: **2026-10-30T02:12:25.5611534Z**.

**Referencia VERIFICADA en integridad: PASS, 1.894 archivos, código 0. SC01 era una expectativa desactualizada; corregida únicamente en el workspace. Regresión seleccionada: 20 aprobadas.** La release permanece bloqueada y sin consumo. B00 pendiente; ninguna ejecución remota autorizada por este resultado.

## 1. Descarga e identidad

Ruta confirmada por el usuario como recuperación de Google Drive:

```text
C:\Users\luis2\Downloads\C2_Final_BA006\C2_Final_BA006
```

La carpeta existe. La búsqueda acotada incluyendo subcarpetas encontró exactamente los cinco archivos directamente en ella, sin nombres ausentes, duplicados o elementos adicionales. No se detectaron enlaces o redirecciones en la ruta y árbol inspeccionados.

reference.json descargado identifica **c2-ba006dea951a180aabf7561b028ee1cb**. Se contrastaron sus datos con el digest y referencia del verificador también descargados. La procedencia del servicio Google Drive queda registrada según la confirmación del usuario, sin acceso directo del agente a la cuenta o historial del servicio.

Paquete original de comparación:

```text
backend/docs/c2-reference/c2-ba006dea951a180aabf7561b028ee1cb-20261029T220011Z/
```

## 2. Cinco hashes completos

Se calcularon independientemente los SHA-256 de la descarga y los originales locales. Todos coinciden:

| Archivo descargado | Bytes | SHA-256 coincidente con el original |
|---|---:|---|
| INSTRUCCIONES.md | 3786 | BB8AFD00142A9D4476AB981F5E53AEEDC98809B394E1AC1405AB355054E9D3B1 |
| manifest.json | 344326 | A24EDEE0CED4D6548AEEDCF5F72B8C2E689D31ABDEFA97B054A90538F5FD57A8 |
| manifest.sha256.txt | 65 | BC8803B7BDEFACAD9AEBFB98C324F2BF5C3510E5A57BF0A1DC7EF939F33DE11D |
| reference.json | 818 | 7630BDF141E1EBB1B01EB4CBD0391F1EE419A89C4E4CEE0D3C17032B78C5E5C9 |
| verifier.sha256.txt | 65 | 004FA2848E07E29E50264ADB1072E85BCF0A4A2AEE78C35A2C67A7512DAB2EB4 |

Los hashes de los archivos .sha256.txt corresponden a sus bytes; se distinguen de los valores que contienen.

## 3. Verificador con digest recuperado

El argumento ExpectedManifestSha256 se obtuvo de:

```text
C:\Users\luis2\Downloads\C2_Final_BA006\C2_Final_BA006\manifest.sha256.txt
```

Valor recuperado: **A24EDEE0CED4D6548AEEDCF5F72B8C2E689D31ABDEFA97B054A90538F5FD57A8**. Coincide con el SHA-256 del manifest.json descargado, reference.json descargado y el valor esperado indicado por el usuario. No se sustituyó por un digest tomado de C2Runtime o del proyecto.

Se leyó verifier.sha256.txt de la misma descarga: **EFA7AD7C88168EF25A0BCCE23C82262D9BB7D2DC82B3F0DC1B32A071272EE0E7**. Antes de ejecutarlo se comprobó que coincide con el script de la release:

```text
C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\c2-ba006dea951a180aabf7561b028ee1cb\package\scripts\c2-activatable-verify-reference.ps1
```

Se utilizó este comprobador conforme a INSTRUCCIONES.md del paquete y a la aclaración comunicada al iniciar: c2-verify-reference.ps1 es el verificador histórico de otra release. No se modificó ni sustituyó un script para cambiar de destino.

Ejecución de lectura mediante PowerShell -NoProfile -File, ReleaseDirectory exacto, ExpectedManifestSha256 recuperado y ExpectedMode c2-blocked. Salida real:

```text
ALL_FIVE_HASHES_MATCH=PASS
C2_ACTIVATABLE_REFERENCE_CHECK=PASS files=1894 mode=c2-blocked
Digest comparison only; B00 and external provenance are not certified. No activation performed.
VERIFIER_EXIT_CODE=0
```

Estado leído de la release: releaseId correcto, mode=c2-blocked, remoteEnabled=false, activation=null, 1.894 archivos, runs vacío y temp vacío. Ausente el registro `C2Runtime/consumed/c2-ba006dea951a180aabf7561b028ee1cb.json`. Después de la regresión, hash del manifiesto idéntico, runs/temp todavía vacíos y registro de consumo todavía ausente.

## 4. SC01 — diagnóstico y corrección exclusiva de la prueba

Prueba: `backend/tests/sync/atlas-revocation-schema.test.js › SC01`.

La lista de configuraciones que esperaba rechazar incluía persistenceTest=B05.4C.2F.1C.2. Sin embargo, atlas-policy.js ya define esa fase como ATLAS_C2_PHASE y la admite exclusivamente con DEFAULT, escrituras autorizadas y el identificador fijo C.2A. La aceptación de esa configuración no emite por sí sola un permiso de ejecución ni activa el receptor.

Evidencia: la política del workspace y la de la release sellada tienen el mismo SHA-256 **F13AFC5E88601DCF8AEF16C39389B134C0B87E1FB53103489318450E21892AF8**. La capacidad no se añadió durante esta verificación. El informe B05_C2_ACTIVATION_GAPS_FIX_RESULT.md ya registraba la expectativa antigua.

**Conclusión: expectativa desactualizada, sin defecto real demostrado en la política examinada.**

Único cambio de código: SC01 y su importación de ATLAS_C2_PHASE en el archivo de prueba del workspace. Ahora verifica aceptación tanto del ámbito de esquema como del ámbito C.2 correcto; para ambos conserva los rechazos de runId equivocado, mecanismo incorrecto, base de producción, usuario prohibido, TLS desactivado, escrituras no autorizadas y falta de autorización. Sustituye el caso de fase C.2 legítima por una fase no reconocida, que debe rechazarse. La configuración vacía continúa rechazada.

SHA-256 del archivo de prueba actualizado: **9991EA1DB68756CF781A59E78EB9C3B6E990D289884027628FF7DC8EB12C9D5C**. No se modificaron atlas-policy.js, el receptor, el arnés, el manifiesto ni archivos dentro de releases selladas. Ninguna otra prueba se editó.

## 5. Regresión offline ejecutada

Selección exacta:

- Los 16 casos SC01–SC16 de atlas-revocation-schema.test.js: política, inventario, esquema e índices simulados, bloqueos, errores, cierre y ausencia de red. Las creaciones de esquema se realizan exclusivamente en dobles en memoria.
- SU01, SU02, SU09 y SU13 de c2-single-use-activation.test.js: equivalencia de validación JS/PowerShell, digest/vinculación, rechazo del executionId reservado e integridad/estado bloqueado de la release en lectura.

Comando desde backend, con NODE_ENV=test y TEMP/TMP/C2_FINAL_TEST_ROOT apuntando a un directorio desechable exclusivo bajo backend/.work/sc01-regression-<GUID>:

```text
node --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run --config vitest.config.js --configLoader native --pool threads tests/sync/atlas-revocation-schema.test.js tests/sync/c2-single-use-activation.test.js --testNamePattern '^(SC[0-9]{2} |SU01 |SU02 |SU09 |SU13 )'
```

**Resultado final: 2 archivos aprobados, 20 pruebas aprobadas, 9 fuera de selección.** No se repitió la batería completa ni se declara que los casos excluidos hayan pasado en esta fase. A36 y private-workspace.ps1 no se ejecutaron.

En la primera ejecución dentro del sandbox, 18 pasaron y SC16/SU01 devolvieron status=null al intentar iniciar sus subprocesos PowerShell. Se repitió la misma selección mediante la escalación autorizada para ejecutar fuera del sandbox: las 20 pasaron, sin cambios adicionales a pruebas o producción para ocultar esos fallos de entorno. Los fixtures fueron ficticios y desechables; ninguna prueba mutable se dirigió a la release sellada.

## 6. Barreras y riesgos pendientes

La nueva referencia externa queda verificada en integridad; no equivale a autorización de ejecución. El manifiesto bloqueado impide recibir entradas o conectar. La política mantiene destino y ámbito fijos; el permiso opaco del arnés exige activación válida. Se mantienen las verificaciones estrictas de tipos/fechas/ventana, executionId distinto del id de esquema, marcadores y registro de consumo persistente fuera de runs. Esta fase no reservó ni consumió un intento.

Límite conocido de B00: un proceso con control de la misma cuenta puede borrar también el registro de consumo o modificar código antes de los controles. No se promete resistencia absoluta ni independencia de escritura certificada de la cuenta de nube. Permanecen los riesgos de copia de credenciales en memoria, amplitud del rol readWrite, commits inciertos y revisión del fence que avanza tras escrituras futuras. No se investigaron nuevamente SID, ACL o propietarios.

SC01 ya no queda pendiente. Siguen requiriendo autorización independiente la aceptación expresa de riesgos, generación de un futuro manifiesto remoto con nueva referencia/digest y ejecución concreta, además del acuerdo de rotación manual de la contraseña. No se preparó ningún manifiesto remoto en este trabajo.

## 7. Detención

Escrituras de esta fase: únicamente la prueba SC01 del workspace, este informe y fixtures temporales de pruebas. Descarga, referencia y releases se usaron en lectura. No se solicitaron contraseñas reales, conectó MongoDB Atlas, ejecutó C.2/F.2 ni inició B05.5. Sin modificación o acceso a backend/.env, SQLite o Godot, ni cambios de ACL/propietarios.

**VERIFICADA — PASS, 1.894 archivos, código 0. SC01 corregida; 20 pruebas offline aprobadas. Release bloqueada, sin consumos. B00 pendiente. Detenido.**
