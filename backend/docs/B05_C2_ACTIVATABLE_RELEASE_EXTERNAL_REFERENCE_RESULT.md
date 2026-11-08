# C.2 — referencia externa de la nueva release bloqueada

Última verificación: **2026-10-29T21:37:15.1123112Z** (inicio del comprobador). Los intentos anteriores se conservan como historial debajo.

**VERIFICADA EN INTEGRIDAD — PASS, 1.894 archivos, código 0.** La release sigue bloqueada; B00 continúa pendiente. La procedencia desde Google Drive es confirmada por el usuario, no observada directamente por el agente.

## Resultado vigente — descarga nueva correcta

Ruta inspeccionada en lectura:

```text
C:\Users\luis2\Downloads\C2_Referencia_Nueva\C2_Nueva_1894
```

La carpeta existe. La búsqueda acotada encontró directamente los cinco archivos esperados, sin ausentes, duplicados o elementos adicionales. No se encontraron enlaces o redirecciones en la ruta y el árbol inspeccionados. Se confirmó en reference.json descargado el releaseId **c2-22fa685aef680f59de7e52427a42d647**, mode c2-blocked y remoteEnabled false.

Se recalcularon los hashes tanto de la descarga como del paquete original `backend/docs/c2-reference/c2-22fa685aef680f59de7e52427a42d647-20261029T211031Z/`. Los cinco coinciden:

| Archivo descargado | Bytes | SHA-256 completo, coincidente con el original |
|---|---:|---|
| INSTRUCCIONES.md | 4091 | 4506541F2FC44948D4DBAFB48B76440D72FD39F17B8B67C2C2A783DA9973292F |
| manifest.json | 344387 | 0A8C7D973CE35BFD31D697C5E87B9432D7AC591D1BFBE93E3DCD882F83AA7579 |
| manifest.sha256.txt | 65 | AA2889197B7F116FD5A791790E3B66D7D831FB9F488B65E7BFDF44E20CF4A7DC |
| reference.json | 664 | C75E63B0F4291695F439AF765880FCD88DCE0A2328E69021FA60DB8E1537C415 |
| verifier.sha256.txt | 65 | C2C2419CDC1ED9DC2F7EB50B9B2FF67315F4ED11E5253F985C8F2A9EEEDDFE14 |

### Digest recuperado y ejecución real del verificador

El valor pasado al comprobador se leyó de **manifest.sha256.txt de esta descarga**, no del proyecto ni del manifest.json de C2Runtime:

```text
Origen: C:\Users\luis2\Downloads\C2_Referencia_Nueva\C2_Nueva_1894\manifest.sha256.txt
Digest: 0A8C7D973CE35BFD31D697C5E87B9432D7AC591D1BFBE93E3DCD882F83AA7579
```

Se contrastó con el hash del manifest.json descargado y con reference.json descargado. Se leyó también verifier.sha256.txt de esa carpeta: su contenido `8613935B3C844AAEB0840BC4CB41EE2B1DFE4D95BE0C860E12B98FA3FA1D8504` coincide con el hash del script ejecutado. Los hashes de los archivos .sha256.txt de la tabla corresponden a los bytes de esos archivos, no al digest que contienen.

Verificador utilizado:

```text
C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\c2-22fa685aef680f59de7e52427a42d647\package\scripts\c2-activatable-verify-reference.ps1
```

Se ejecutó con PowerShell -NoProfile -File, ReleaseDirectory de esa misma release, ExpectedManifestSha256 leído de la descarga y ExpectedMode c2-blocked. Se empleó este verificador conforme al procedimiento de la nueva release y la aclaración comunicada antes de ejecutar: el histórico c2-verify-reference.ps1 está fijado a una release anterior y no se modificó para cambiar de destino.

Salida real:

```text
C2_ACTIVATABLE_REFERENCE_CHECK=PASS files=1894 mode=c2-blocked
Digest comparison only; B00 and external provenance are not certified. No activation performed.
VERIFIER_EXIT_CODE=0
```

Comprobación adicional de lectura del estado efectivo: releaseId correcto, **1.894 archivos**, mode=c2-blocked, remoteEnabled=false, activation=null; runs y temp con **cero elementos**. No se ejecutó el receptor ni se crearon marcadores o manifiestos de activación.

### Alcance y cierre del resultado vigente

La referencia recuperada queda **VERIFICADA en integridad**, con procedencia Google Drive según confirmación del usuario. No se certificaron directamente la cuenta de nube, su historial, independencia de escritura o procedencia histórica del código. El PASS no elimina los riesgos de procesos de la misma cuenta Windows ni resuelve B00; tampoco autoriza una conexión o ejecución remota.

Solo se actualizó este informe. Las descargas y releases se utilizaron en lectura, sin reemplazarlas o modificarlas. No se accedió a .env, SQLite o Godot, ni se cambiaron ACL o propietarios. Sin contraseñas, conexión Atlas, C.2/F.2 o B05.5.

**Resultado vigente: VERIFICADA — PASS, 1.894 archivos, código 0. Release bloqueada. Detenido. B00 pendiente.**

## Historial de intentos anteriores — no describe el resultado vigente

## Ruta C2_Nueva_1894 — carpeta no encontrada

El usuario comunicó una nueva descarga de Google Drive en:

```text
C:\Users\luis2\Downloads\C2_Nueva_1894
```

Get-Item -LiteralPath devolvió PathNotFound / ItemNotFoundException. No existe una carpeta accesible en esa ruta en el momento de la comprobación. No se localizaron ni leyeron los cinco archivos, no se calcularon hashes nuevos y no se recuperó un digest de esta descarga. No se utilizó otro directorio o un digest local como sustituto.

Se detuvo la operación antes de ejecutar el comprobador. No hay PASS, FAIL del comprobador ni código de salida suyo para este intento. Esto es un problema de localización de la descarga; no demuestra discrepancia de contenido o que se haya descargado nuevamente el paquete anterior.

Pendiente: proporcionar la ruta existente de la carpeta extraída que contiene los cinco archivos nuevos. Si la descarga sigue siendo un ZIP, extraerla a una carpeta nueva y comunicar su ruta, sin reemplazar las descargas anteriores. No se buscaron archivos en otras carpetas personales.

Solo se actualizó este informe. No se modificaron releases, descargas, ACL, SQLite, Godot o backend/.env. No se solicitaron contraseñas ni se conectó Atlas o ejecutó C.2/F.2. **NO VERIFICADA; B00 pendiente.**

## Nueva descarga de Google Drive — 2026-10-29T21:29:17.7203241Z

El usuario confirmó una nueva recuperación desde Google Drive y proporcionó `C:\Users\luis2\Downloads\C2_Referencia_Nueva`. Se inspeccionó esa ruta y sus subcarpetas en lectura, sin enlaces ni redirecciones en la ruta comprobada. Se encontraron los cinco nombres esperados, sin ausentes ni duplicados, dentro de:

```text
C:\Users\luis2\Downloads\C2_Referencia_Nueva\hash
```

**Los cinco SHA-256 vuelven a coincidir exactamente con la columna “SHA-256 descargado” de la tabla de este informe, y los cinco difieren de la columna “SHA-256 del original nuevo”.** Por tanto, esta nueva carpeta también contiene el paquete anterior c2-19dcfa4b88b64813a334cc8ef2cc48ea, de 1.895 archivos. Su manifest.json sigue teniendo SHA-256 `D4A5ED8A8C0C61FFD59F60B30EEB4B678BBA3FCC7A9B3E42651A8B0727AD2AF8`, frente a `0A8C7D973CE35BFD31D697C5E87B9432D7AC591D1BFBE93E3DCD882F83AA7579` requerido para c2-22fa685aef680f59de7e52427a42d647.

Se encontró además el contenedor `hash-20261029T212815Z-1-001.zip` en la raíz de la descarga: 89.272 bytes, SHA-256 `A5E0D4953686777564425E2F6777F94BADB94FA10D6472EDB64B183C0EB24220`. No se extrajo ni se inspeccionó su contenido. El ZIP adicional no es la causa determinante de la detención: los cinco archivos extraídos ya demuestran la discrepancia de versión.

No se ejecutó el verificador, no hay código de salida suyo ni PASS nuevo. No se sustituyó el digest por uno local. Se detuvo el procedimiento al completar la comparación, sin modificar la descarga o acceder a las releases.

**Paso pendiente concreto:** subir manualmente a una carpeta nueva de Google Drive los cinco archivos de `backend/docs/c2-reference/c2-22fa685aef680f59de7e52427a42d647-20261029T211031Z/`, conservando el paquete anterior; descargar esa nueva carpeta a otra ubicación y facilitar su ruta. Renombrar la carpeta o volver a descargar los archivos anteriores no cambia su identidad. No hace falta reconstruir la release ni regenerar los hashes.

La procedencia Google Drive queda registrada según confirmación del usuario, sin observación directa del servicio. Solo se actualizó este informe. Sin contraseñas, conexiones Atlas, C.2/F.2, cambios de ACL o acceso a .env, SQLite o Godot. **Resultado actual: NO VERIFICADA; B00 pendiente.**

## Ruta e inventario

Ruta suministrada por el usuario como descarga de la nube:

```text
C:\Users\luis2\OneDrive\Desktop\DESCARGA NUBE\hash
```

La carpeta existe. La búsqueda acotada, incluyendo posibles subcarpetas, encontró exactamente los cinco archivos directamente en ella: INSTRUCCIONES.md, manifest.json, manifest.sha256.txt, reference.json y verifier.sha256.txt. Ninguno ausente, adicional o duplicado. No se encontraron enlaces dentro de la carpeta. La procedencia desde el servicio de nube es comunicada por el usuario, no observada directamente por el agente.

Se compararon en lectura contra el paquete nuevo:

```text
backend/docs/c2-reference/c2-22fa685aef680f59de7e52427a42d647-20261029T211031Z/
```

## SHA-256 completos y discrepancias

| Archivo | SHA-256 descargado | SHA-256 del original nuevo | Coincide |
|---|---|---|---|
| INSTRUCCIONES.md | F05540D4732DD9728AD1A5E1F8305CD3CBF7F280CF11BC22B2424F65DC33FE97 | 4506541F2FC44948D4DBAFB48B76440D72FD39F17B8B67C2C2A783DA9973292F | No |
| manifest.json | D4A5ED8A8C0C61FFD59F60B30EEB4B678BBA3FCC7A9B3E42651A8B0727AD2AF8 | 0A8C7D973CE35BFD31D697C5E87B9432D7AC591D1BFBE93E3DCD882F83AA7579 | No |
| manifest.sha256.txt | FA808D0AB664BBC2C75684D2B9E303C14A1BB3B2AB1179970BF50A9B48DF00B1 | AA2889197B7F116FD5A791790E3B66D7D831FB9F488B65E7BFDF44E20CF4A7DC | No |
| reference.json | 83CE5587E1570CCC89A29EE2031F818E01E7CBB8BB95AE653EEE33339A32715F | C75E63B0F4291695F439AF765880FCD88DCE0A2328E69021FA60DB8E1537C415 | No |
| verifier.sha256.txt | 8D4FD5D9FC348C66EE177109C021BE6EBAE6609C92247C5D65A6AD8EF77E1C8B | C2C2419CDC1ED9DC2F7EB50B9B2FF67315F4ED11E5253F985C8F2A9EEEDDFE14 | No |

Los cinco hashes descargados coinciden con los registrados para el **paquete anterior c2-19dcfa4b88b64813a334cc8ef2cc48ea**, de 1.895 archivos, en B05_C2_EXTERNAL_REFERENCE_VERIFICATION.md. Por tanto, esta carpeta no aporta la referencia nueva solicitada. Esto identifica una versión anterior del paquete; no demuestra corrupción o manipulación maliciosa.

El hash de los archivos .sha256.txt mostrado en la tabla corresponde a los bytes de esos archivos, no al digest que contienen. Tras detectar las diferencias no se continuó leyendo sus contenidos ni se tomó un digest del proyecto para sustituir la referencia externa.

## Detención y estado de la release

No se ejecutó c2-activatable-verify-reference.ps1 ni los verificadores anteriores: no existe un PASS con código 0 para la nueva referencia descargada. No se presenta el FAIL de comparación como una ejecución fallida del verificador.

La release nueva c2-22fa685aef680f59de7e52427a42d647 quedó documentada en su construcción con 1.894 archivos, mode=c2-blocked, remoteEnabled=false y activation=null. Esta fase no cambió ese estado ni lo revalidó tras la discrepancia: se detuvo antes de acceder a C2Runtime. Las releases anteriores tampoco recibieron escrituras.

Para continuar deberá recuperarse desde la nube el paquete **c2-22fa685aef680f59de7e52427a42d647-20261029T211031Z** a una carpeta nueva, sin reemplazar esta descarga. Su manifest.json debe tener SHA-256 `0A8C7D973CE35BFD31D697C5E87B9432D7AC591D1BFBE93E3DCD882F83AA7579`. Aún deben verificarse los cinco archivos y ejecutar el verificador usando el digest leído de esa nueva descarga.

Única escritura de esta fase: este informe. No se modificaron archivos descargados, paquetes de referencia, releases, ACL, propietarios, SQLite, Godot o backend/.env. No se crearon manifiestos de activación, solicitaron contraseñas ni conectó Atlas. C.2/F.2 no se ejecutaron.

**NO VERIFICADA. Detenido por discrepancia de versión. B00 pendiente.**
