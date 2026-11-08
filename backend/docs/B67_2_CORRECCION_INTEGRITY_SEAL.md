# B67.2 — Corrección de INTEGRITY_SEAL

Fecha: 2026-11-03, Guatemala. **Verificaciones locales completas y PASS. Accept y Cancel manuales NO ejecutados.** El canal sigue **NO APTO para credenciales reales** hasta que el propietario complete la comprobación manual sin fallos.

No se conectó Atlas, no se pidió ni usó una contraseña real, no se activó v5, no se iniciaron Express ni Caddy, no se abrió `.env` y no se tocaron SQLite real, Godot, F1/F2, `backend/src`, `backend/scripts`, `backend/tests` ni los cinco archivos de referencia B66. Sin commits ni push. Los despliegues B67 y B67.1 anteriores se conservan intactos.

## 1. Resultado manual analizado

```text
B67_SELFTEST=FAIL mode=Accept stage=integrity code=INTEGRITY_SEAL cleanup=ok
```

Sin prompt oculto. SHA-256 externos de `offline-selftest.ps1` y `deployment.json` correctos.

## 2. Causa

**Mecanismo confirmado por reproducción; el texto exacto que escribió el propietario no se conoce.**

En `offline-selftest.ps1` (B67.1), el parámetro `-DeploymentSha256` se validaba con `ValidatePattern('^[a-f0-9]{64}$')` y después se comparaba con el hash real del sello de forma **sensible a mayúsculas** (`-cne`) contra la forma minúscula:

- `ValidatePattern` de PowerShell es **insensible a mayúsculas**: aceptó el digest en MAYÚSCULAS sin error de parámetro.
- La comparación posterior (`Hash.ToLowerInvariant() -cne $DeploymentSha256`) lo rechazó, con el código genérico `INTEGRITY_SEAL`.

`Get-FileHash` imprime los hashes en mayúsculas. Quien usa esa salida como argumento (por ejemplo `$h = (Get-FileHash …deployment.json).Hash` y luego `-DeploymentSha256 $h`) obtiene exactamente este resultado.

### Por qué coincidían los hashes externos y fallaba la comprobación interna

Las verificaciones externas del propietario comparan el hash de los archivos con una constante usando `-ne` (insensible a mayúsculas) y por eso coincidían. La comprobación interna del selftest comparaba el **argumento** con la forma minúscula canónica en modo sensible a mayúsculas. Eran dos comprobaciones distintas sobre dos cosas distintas (archivo y argumento), con dos reglas de comparación distintas.

### Reproducción en el despliegue B67.1 actual (sin credenciales, sin red, `-Automation`)

| Digest pasado a `-DeploymentSha256` | Resultado |
|---|---|
| Minúsculas del informe B67.1 | PASS |
| Mismo hash en **MAYÚSCULAS** | `FAIL stage=integrity code=INTEGRITY_SEAL`, sin prompt, archivos íntegros |
| Mayúsculas y minúsculas mezcladas | igual FAIL |
| Hash de `offline-selftest.ps1` en lugar del sello | igual FAIL |

La línea de FAIL es idéntica a la reportada por el propietario.

### Qué se descartó

- **Errata en el informe B67.1:** los dos comandos del informe se extrajeron y se compararon carácter a carácter con el hash real del sello; son correctos.
- **Contenido del sello:** las otras condiciones del código `INTEGRITY_SEAL` (`kind`, `remoteEnabled`, `runId`, número de archivos) dependen solo de los bytes del sello, que son idénticos a los que pasan en mis ejecuciones.
- **Limitación honesta:** esto es confirmación por reproducción más eliminación, no por observación del equipo del propietario. Cualquier otro digest erróneo produce la misma línea, y el selftest B67.1 no lo distinguía. Por eso la corrección también separa los códigos (§3): si el siguiente fallo no es de este tipo, ya no quedará ambiguo.

### Segundo defecto encontrado (también corregido)

Al repetir la batería, el caso de error de transporte falló de forma intermitente con `cleanup=failed`. Causa: si un fallo anterior dejaba un receptor aún vivo, el bloque `finally` lo terminaba correctamente, pero lo contaba como fallo de limpieza (carrera de temporización que antes no se manifestaba). Un hijo terminado en la limpieza es lo esperado; solo debe fallar si no se puede terminar. Afectaba a B67.1 y a B67.2 antes de este arreglo; no al criterio de seguridad.

## 3. Corrección aplicada

Nuevo directorio `backend/tools/atlas-v2-first-read/b67-2/` (fuera del ámbito v5). Cambios exactos de `offline-selftest.ps1` respecto de B67.1 (`1FA746…CA6A`):

1. **Digest en cualquier caja, comparado exacto.** `ValidatePattern('\A[a-fA-F0-9]{64}\z')` (más estricto: sin `$` que admita salto de línea final) y, justo tras los parámetros, `$DeploymentSha256=$DeploymentSha256.ToLowerInvariant()`. Después se sigue comparando con `-cne` contra el hash real y se pasa al receptor en minúsculas. Un digest incorrecto se sigue rechazando; solo se acepta el mismo digest en otra caja.
2. **Código separado.** Nuevo `INTEGRITY_SEAL_ARG`: el argumento no coincide con el hash del sello. `INTEGRITY_SEAL` queda solo para contenido del sello (`kind`, `remoteEnabled`, `runId`, número de entradas).
3. **Nuevo modo `-Mode Check`:** ejecuta integridad y preflight completos y termina; **no pide entrada, no crea SecureString, no inicia el receptor de datos**. Línea de éxito: `B67_SELFTEST=PASS mode=Check syntheticOnly=True cleanup=True`.
4. **Limpieza:** un receptor aún vivo al llegar a `finally` se termina y espera hasta 5 s; es fallo de limpieza solo si no termina, o si el resultado era PASS (en ese caso se invalida).
5. `prepare.ps1` (copia del de B67.1) escribe `revision:"B67.2"` y toma el receptor de `b67/` verificando su hash. El receptor es idéntico (`4C9628…4E`).

Sin cambios en: controles de ubicación, DACL, propietario, reparse points, siete hashes, Node, handles sin compartir escritura, preflight anterior al prompt, sentinela único, comparación por unidades de carácter ni contrato del receptor.

## 4. Nuevos hashes y despliegue

```text
C:\Users\luis2\AppData\Local\TwoSides\AtlasV2FirstRead\16d15211f58844da811701d3d8fbd89b
```

| Archivo | SHA-256 |
|---|---|
| `offline-selftest.ps1` | `D9CAF38A63699D676D03D60C71DC5181B130C64DE8776E017BA883B431848545` |
| `deployment.json` | `F72A475063324F05AE7D54F50F03278CE2692E12A45C35079A20F1A1CB740F60` |
| `offline-receiver.mjs` | `4C96280821292EF01F961E1B2C8BD81B31FA6ACF66802756CFBD8A92F9AD4F6E` |
| `v5-reference.json` | `2A4956E951217DFF2501D3FFBD35C9024554166E9126AD0134D8FB58C77AD726` |
| B66 (`gate`, `probe`, `receiver`, `send-first-read`) | iguales a B66 |

Digest del sello en minúsculas: `f72a475063324f05ae7d54f50f03278ce2692e12a45c35079a20f1a1cb740f60` (con el cambio, también se acepta en mayúsculas).

Fuentes en `b67-2/` (no se despliegan salvo el selftest): `prepare.ps1` `353553F19534F8FC54DAF27F8758FE66C9A50D862B25A811D40D1F9E56E72610`; `run-tests.ps1` `9EA229A112BB4A0654B941C030732AF17F72470C0696FE41A3238D668746FCFD`; `console-inject.ps1` `67A73E91EDEBE619E855097E142B0DCC72D013F8E7AFB28831B46F9FD64C27A0`.

El directorio es nuevo, con DACL protegida (FullControl solo para el usuario actual, SYSTEM y Administradores) y exactamente 8 archivos.

## 5. Pruebas

Batería `run-tests.ps1` de B67.2, **una sola ejecución continua: 31 de 31 PASS**, con fixtures desechables que se eliminan, líneas de salida validadas contra una lista cerrada, ausencia de textos rechazados y de procesos residuales:

- **Heredadas de B67.1 (19):** Accept y Cancel válidos; archivo alterado, digest erróneo del sello y archivo ausente; preflight rechazado; receptor que rechaza, sale con error, responde basura o incumple el contrato; error de transporte; receptor sin respuesta (60 s); y siete casos en consola real oculta con teclas sintéticas (Accept válido, incorrecto, vacío, con espacio, con línea pegada; Cancel válido y con texto). El caso de digest erróneo ahora espera `INTEGRITY_SEAL_ARG`.
- **Nuevas (10):** S01 digest en mayúsculas → PASS; S02 mezclado → PASS; S03 hash de otro archivo → `INTEGRITY_SEAL_ARG`; S04 digest con un nibble distinto → `INTEGRITY_SEAL_ARG`; S05 sello con `remoteEnabled=true` (resellado) → `INTEGRITY_SEAL`; S06 sello con entrada extra → `INTEGRITY_SEAL`; S07 `runId` distinto → `INTEGRITY_SEAL`; K01 Check válido (sin etapas `input`, `compare` ni `receiver`); K02 Check con archivo alterado → `INTEGRITY_FILE_HASH`; K03 Check con preflight rechazado → `PREFLIGHT_REJECTED`.
- **Globales (2):** ninguna entrada rechazada aparece en las salidas; no queda ningún fixture.

El caso de error de transporte se repitió 3 veces seguidas tras corregir la limpieza: PASS.

## 6. Validación interna del sello en el despliegue nuevo

Ejecutada sobre `16d15211…` sin interacción, con el digest tal como lo imprime `Get-FileHash` (MAYÚSCULAS):

```text
-Mode Check:  integrity ok / preflight ok / cleanup ok → PASS mode=Check, exit 0
```

También PASS con el digest en minúsculas, y `-Automation` Accept y Cancel. Un digest erróneo sigue rechazándose con `INTEGRITY_SEAL_ARG`.

**No ejercitadas** (sin forma sintética no invasiva): `INTEGRITY_LOCATION/PATH/ACL/LOCK/NODE`, `PREFLIGHT_START/TIMEOUT`, `INPUT_READ_FAILED`, `COMPARE_CONVERT_FAILED`, `FRAME_FAILED`, `RECEIVER_START`, `CLEANUP_FAILED`.

## 7. Impacto sobre v5 y estado de integridad

- **Manifiesto v5:** sin cambios; `v5-reference.json` conserva `2A4956…D726`. El preflight de cada ejecución verifica el backend contra esa copia candidata (cero diferencias) y pasó en todas. `b67-2/` está fuera del ámbito del manifiesto (`src`, `scripts`, `node_modules`, archivos de paquete), así que no se requiere un manifiesto nuevo. El manifiesto instalado v4 no se tocó. v5 sigue sin activarse.
- **Despliegue B67 original:** 8 archivos, selftest `97033A…885D`, sello `A9372F…AA08`: sin cambios.
- **Despliegue B67.1:** 8 archivos, selftest `1FA746…CA6A`, sello `285C83…7DCD`: sin cambios.
- **Referencias B66:** `gate`, `probe`, `receiver`, `send-first-read` y manifiesto v5 con sus hashes originales.
- Sin procesos residuales; sin listeners en 3000, 8443 ni 27017; sin conexiones establecidas al 27017.

## 8. Comando de comprobación de integridad (no pide entrada)

Verifica los dos hashes y ejecuta integridad más preflight del backend contra v5. No solicita ninguna entrada ni inicia el receptor de datos. Se ejecuta tal cual; el digest se toma del propio archivo, sin pegarlo a mano:

```powershell
$d='C:\Users\luis2\AppData\Local\TwoSides\AtlasV2FirstRead\16d15211f58844da811701d3d8fbd89b'; $h=(Get-FileHash -LiteralPath "$d\deployment.json").Hash; if(((Get-FileHash -LiteralPath "$d\offline-selftest.ps1").Hash -ne 'D9CAF38A63699D676D03D60C71DC5181B130C64DE8776E017BA883B431848545') -or ($h -ne 'F72A475063324F05AE7D54F50F03278CE2692E12A45C35079A20F1A1CB740F60')){'HASH DIFERENTE - NO CONTINUAR'}else{powershell.exe -NoProfile -File "$d\offline-selftest.ps1" -Mode Check -DeploymentSha256 $h}
```

Resultado esperado: `B67_STAGE=integrity ok`, `B67_STAGE=preflight ok`, `B67_STAGE=cleanup ok` y `B67_SELFTEST=PASS mode=Check syntheticOnly=True cleanup=True`. Si falla, comunicar solo la línea `B67_SELFTEST=FAIL … stage=… code=…`. Evitar editar archivos del backend mientras se ejecuta (el preflight lo vuelve a verificar).

Los ensayos manuales **Accept** y **Cancel** quedan para una fase posterior con autorización; seguirán el mismo patrón con `-Mode Accept` o `-Mode Cancel`, ejecutados de uno en uno, sin pegar nada más y sin ninguna contraseña real.

## 9. Procedimiento de reversión

Esta corrección no modifica B67, B67.1 ni el backend; revertir es dejar de usarla.

1. No usar `16d15211…`. Los despliegues B67 y B67.1 siguen disponibles con sus hashes originales.
2. Para borrar el despliegue nuevo (no forma parte de esta fase): eliminar sus 8 archivos y luego el directorio `16d15211f58844da811701d3d8fbd89b`, nunca `TwoSides` o `AtlasV2FirstRead`, sin borrado recursivo.
3. Para quitar las fuentes: eliminar `backend/tools/atlas-v2-first-read/b67-2/` (cuatro archivos) y este informe. No afecta al manifiesto v5.

## 10. Riesgos residuales

- Se reprodujo la causa pero no se observó el comando exacto del propietario; si el próximo resultado fuese `INTEGRITY_SEAL_ARG`, el argumento pasado no es el hash del sello; si fuese otro código, indica directamente la etapa.
- El fallo manual anterior de B67 (antes de B67.1) sigue sin causa confirmada; el selftest instrumentado es el medio para identificarla.
- Un PASS local no valida Atlas. B00 y la activación v5 siguen pendientes y requieren autorización por separado.
- Una modificación de archivos cubiertos por v5 durante el ensayo haría fallar el preflight o el receptor.

**Estado: despliegue y verificaciones locales completos. Detenido; sin ensayos manuales.**
