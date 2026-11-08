# C.2 — verificación de referencia externa

Fecha: 2026-10-29. **VERIFICADA: integridad de los cinco archivos descargados y verificación de la release con su digest recuperado, PASS.** La procedencia desde la nube es comunicada por el usuario, no observada directamente. B00 continúa pendiente. Este informe no autoriza activación, Atlas, C.2 ni F.2.

## Evidencia disponible y límite

En la primera revisión el usuario comunicó la subida, sin proporcionar todavía una descarga. Por ello se dejó el resultado pendiente y no se ejecutó entonces el verificador. En esta continuación confirmó la recuperación desde la nube y proporcionó la ruta que se inspeccionó directamente:

```text
C:\Users\luis2\OneDrive\Desktop\DESCARGA NUBE\hash
```

Se siguió B05_C2_RELEASE_FINAL_REVIEW_RESULT.md e INSTRUCCIONES.md. No se accedió directamente al servicio de nube: la recuperación es evidencia comunicada por el usuario. Sí se verificaron directamente los archivos de la ruta suministrada, sin sustituirlos por copias del proyecto.

La búsqueda acotada contempló subcarpetas; encontró los cinco archivos directamente en `hash`, sin subcarpetas, archivos adicionales ni nombres duplicados. El directorio de descarga y sus archivos no presentaron enlaces. La comprobación inicial genérica de ancestros se detuvo por atributos ReparsePoint de OneDrive/Desktop; se inspeccionaron sus etiquetas de solo lectura (`0x9000701a` y `0x9000601a`, respectivamente), correspondientes a puntos cloud, sin destino de enlace simbólico o junction. No se modificó configuración de OneDrive ni se confundieron esos atributos con una modificación del paquete.

| Comprobación | Estado |
|---|---|
| Subida a la nube | Comunicada por el usuario; no observada directamente |
| Descarga desde la nube | Confirmada por el usuario; archivos inspeccionados en la ruta indicada |
| Inventario descargado | PASS: cinco nombres exactos, ninguno ausente, adicional o duplicado |
| Comparación SHA-256 de los cinco archivos descargados | PASS: los cinco coinciden con el original |
| Digest del manifiesto | Leído de manifest.sha256.txt descargado y contrastado con manifest.json descargado |
| Verificador con digest leído de la descarga | PASS, 1.895 archivos, salida 0, offline-only |
| Independencia del almacenamiento respecto del equipo | No certificada por el agente; persiste la limitación de la misma cuenta/sincronización |

## Archivos descargados y comparación completa

Los hashes siguientes se calcularon sobre los cinco archivos de la descarga. Se recalcularon también los del original `backend/docs/c2-reference/c2-19dcfa4b88b64813a334cc8ef2cc48ea-20261029T203514Z/`: todos coinciden. La comparación no utilizó solamente el proyecto local.

| Archivo descargado (directamente en hash) | Bytes | SHA-256, coincidente con el original |
|---|---:|---|
| INSTRUCCIONES.md | 3977 | F05540D4732DD9728AD1A5E1F8305CD3CBF7F280CF11BC22B2424F65DC33FE97 |
| manifest.json | 305057 | D4A5ED8A8C0C61FFD59F60B30EEB4B678BBA3FCC7A9B3E42651A8B0727AD2AF8 |
| manifest.sha256.txt | 65 | FA808D0AB664BBC2C75684D2B9E303C14A1BB3B2AB1179970BF50A9B48DF00B1 |
| reference.json | 573 | 83CE5587E1570CCC89A29EE2031F818E01E7CBB8BB95AE653EEE33339A32715F |
| verifier.sha256.txt | 65 | 8D4FD5D9FC348C66EE177109C021BE6EBAE6609C92247C5D65A6AD8EF77E1C8B |

El hash del archivo `verifier.sha256.txt` es distinto del valor que contiene. Su contenido esperado es el SHA-256 del verificador: `9A9BE545381CBFF315317CBA3769077BB2ADFE9C48EF572A178C28EA5796C77E`.

## Verificación ejecutada con el digest descargado

Hora de comprobación: **2026-10-29T20:50:41.5087888Z**. No se encontraron discrepancias que requirieran detener la comparación ni se reemplazó ningún archivo.

Fuentes utilizadas, ambas de la descarga suministrada:

```text
C:\Users\luis2\OneDrive\Desktop\DESCARGA NUBE\hash\manifest.sha256.txt
C:\Users\luis2\OneDrive\Desktop\DESCARGA NUBE\hash\verifier.sha256.txt
```

Digest del manifiesto recuperado: `D4A5ED8A8C0C61FFD59F60B30EEB4B678BBA3FCC7A9B3E42651A8B0727AD2AF8`. Se confirmó que coincide con el SHA-256 del manifest.json descargado. Hash del verificador recuperado: `9A9BE545381CBFF315317CBA3769077BB2ADFE9C48EF572A178C28EA5796C77E`; se cotejó contra el script antes de ejecutarlo.

Se aplicó el procedimiento de INSTRUCCIONES.md con `$referenceDownload` apuntando a la descarga. Se ejecutó exclusivamente el verificador de lectura:

```text
C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\c2-19dcfa4b88b64813a334cc8ef2cc48ea\package\scripts\c2-final-verify-reference.ps1
```

contra esa misma release, pasando como `ExpectedManifestSha256` el valor leído del archivo descargado, mediante PowerShell con `-NoProfile -File`. No se pasó un digest leído del proyecto local ni se ejecutó el receptor.

Salida real:

```text
ALL_FIVE_FILES_MATCH=PASS
C2_FINAL_REFERENCE_CHECK=PASS files=1895 mode=offline-only
Coincidencia con el digest aportado; no certifica independencia, B00 ni autorizacion remota.
VERIFIER_EXIT_CODE=0
```

El histórico c2-verify-reference.ps1 está fijado a la release anterior. Conforme a la aclaración documentada y comunicada antes de ejecutar, se utilizó su sucesor c2-final-verify-reference.ps1 para esta candidata; no se modificó ninguno de los dos scripts para cambiar de destino. La release conserva su manifiesto offline y no se activó.

## Garantías y detención

No se modificaron la carpeta descargada, las releases selladas, ACL, propietarios, recursos protegidos o el paquete original. Las operaciones fueron de lectura, salvo la actualización de este informe. No se accedió a .env, SQLite o Godot. No se solicitaron ni utilizaron contraseñas reales; no se conectó Atlas, ejecutó C.2/F.2 ni generó una activación.

**La referencia externa queda VERIFICADA en integridad**, tomando la procedencia desde la nube como confirmación del usuario: cinco archivos descargados coincidentes y release de 1.895 archivos PASS con el digest recuperado. No se certifica directamente la cuenta, versión, independencia de escritura o historial del servicio externo. La descarga está en OneDrive y el almacenamiento sincronizado modificable por la misma cuenta mantiene las limitaciones documentadas. La coincidencia acredita continuidad respecto del estado conservado, no procedencia histórica ni resolución de B00.

**VERIFICADA — PASS. B00 pendiente. Detenido sin activación remota.**
