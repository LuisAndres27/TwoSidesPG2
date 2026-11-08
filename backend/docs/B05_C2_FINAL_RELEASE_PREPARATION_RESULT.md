# C.2 Windows — preparación final de la nueva release

Fecha: 2026-10-29. **Preparación offline completada; LISTO CON CONDICIONES para solicitar una autorización posterior. No activado.** B00 pendiente, C.2 sin ejecutar, F.2 bloqueada y B05.5 no iniciada.

## 1. Evidencia interactiva

El usuario comunicó los siguientes resultados, registrados también en B05_C2_RECEIVER_ACTIVATION_REVIEW.md:

```text
HIDDEN_INPUT_SELFTEST=PASS mode=Accept bytes=26
HIDDEN_INPUT_SELFTEST=PASS mode=Cancel
```

Son evidencia comunicada por el usuario, con entrada ficticia; no una ejecución interactiva observada por el agente. No se proporcionó hora exacta. No se repitieron estas pruebas ni se recibieron contraseñas reales. El selftest conserva SHA-256 `FFBECC5FF799623CCD0EC38EC47F790B238B8392FA466832F04DCC91B8B1431F`; no se modificó la función de lectura oculta del receptor.

## 2. Release preparada e integridad

Nueva candidata:

```text
C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\c2-19dcfa4b88b64813a334cc8ef2cc48ea
```

SHA-256 de manifest.json:

```text
D4A5ED8A8C0C61FFD59F60B30EEB4B678BBA3FCC7A9B3E42651A8B0727AD2AF8
```

Contiene 1.895 archivos de payload y únicamente `package/`, `manifest.json`, `runs/` y `temp/` en su raíz. `runs/` y `temp/` están vacíos. El manifiesto permanece en versión 1, `mode=offline-only`, `remoteEnabled=false`, sin bloque de activación, identificador autorizado ni ventana temporal remota.

El verificador de solo lectura ejecutado contra esta candidata devolvió:

```text
C2_FINAL_REFERENCE_CHECK=PASS files=1895 mode=offline-only
```

Se contrastaron inventario exacto, hashes, ausencia de enlaces, estructura y hash de Node. El verificador nuevo es `scripts/c2-final-verify-reference.ps1`, SHA-256 `9A9BE545381CBFF315317CBA3769077BB2ADFE9C48EF572A178C28EA5796C77E`. No se alteró el verificador histórico ligado a la release anterior.

Los hashes verifican continuidad y cambios posteriores respecto de esta captura local; no acreditan procedencia independiente ni resistencia frente a quien pueda modificar simultáneamente código, manifiesto y referencia. El respaldo local anterior pertenece a la release anterior y no certifica esta nueva candidata. No se generó automáticamente una referencia externa.

## 3. Cambios incrementales

Se reutilizaron el receptor, el supervisor, el arnés y los contratos existentes. No se reconstruyó el receptor ni se repitió la auditoría general.

| Archivo del payload actualizado o incorporado | SHA-256 |
|---|---|
| src/modules/sync/atlas-policy.js | F13AFC5E88601DCF8AEF16C39389B134C0B87E1FB53103489318450E21892AF8 |
| src/modules/sync/atlas-integration.js | 95A407EB64979F0880568DDB952EBEDB986DE696FCFD3A9051D98D79762A579F |
| scripts/durable-revocation-atlas-harness.js | 1E82F250A66A3567366893AAFC8A48A130D865F30224B75A375AF095ECBE5B61 |
| scripts/c2-receiver-core.js | EF846D3571B60ED3F111C34D5CC63E732E316CF7960E10C2EBED137B1A02EC1D |
| scripts/c2-receiver-entry.js | 94038B665A97E96F2A976F65A866E70A2B29028993B57CDAFCF6601692391B94 |
| scripts/c2-receiver.ps1 | 0A39FF66501EF3FFBA38BFDB871911A24DE8EF4B3A7217FDFBE44ABBB90FC912 |
| scripts/c2-release-integration.js | 6BDAB4ACBBB6D12C1876A2551C8AEF1A075429F51A7709F04B94A3B5A7714CE1 |
| scripts/c2-final-verify-reference.ps1 | 9A9BE545381CBFF315317CBA3769077BB2ADFE9C48EF572A178C28EA5796C77E |

La política incorpora la capacidad C.2 exclusiva, vinculada al esquema C.2A; los modos históricos conservan sus restricciones. La composición real abre Mongoose exclusivamente mediante el conector supervisado y utiliza los repositorios transaccionales existentes para A/B/C, reapertura, recibos y limpieza. Importar el módulo no conecta.

`executeDurableAtlasRun` exige ahora un permiso opaco ligado al identificador de ejecución y a una activación válida. Ya no se depende de una fábrica inexistente para bloquear la ejecución: el bloqueo efectivo reside en el manifiesto offline, la validación de activación y el permiso opaco. El valor informativo `remoteEnabled=false` del arnés no sustituye esos controles.

Antes de recibir entrada se comprueban digest, entorno, manifiesto, destino, escenarios exactamente A/B/C, ventana positiva de hasta cuatro horas y reserva de uso único. Se rechazan reutilización y activación ausente. No se incorporó un generador automático de manifiestos remotos.

Se implementaron las correcciones A1/A2: TEMP/TMP deben corresponder al `temp` propio de la release, normal y vacío, y se rechazan carpetas auxiliares inesperadas como `support`. La comprobación se repite en PowerShell y en el núcleo. El cierre vuelve a consultar incertidumbre: una escritura pendiente impide declarar éxito o limpiar.

## 4. Entorno, dependencias y copia anterior

La candidata se construyó mediante copias de bytes del payload anterior, previamente contrastado con su manifiesto, y los ocho archivos de la tabla. Se conservaron las 23 dependencias y sus 1.858 archivos sin instalar paquetes, ejecutar scripts npm ni usar red. Mongoose/driver y módulos importados siguen incluidos en el inventario. No se copiaron descriptores de seguridad desde el proyecto.

La inspección acotada de la candidata cubrió 2.085 objetos: cero escritores fuera de usuario actual, SYSTEM y Administrators, y cero SID investigados en ese inventario. No se cambiaron ACL ni propietarios. Es evidencia puntual del destino nuevo, no una nueva auditoría del proyecto ni una solución de B00. La misma cuenta Windows mantiene capacidad de modificarlo; no se elimina la posible sustitución entre comprobación y ejecución.

El temporal exclusivo de preparación fue:

```text
C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\stage-c2-final-eaa9e1a1205d4117963350636571b2a7\tests
```

Las pruebas mutables utilizaron ese temporal y una copia desechable independiente `c2-966dfdcfaa84437c9c537af22f3b1f6d`, eliminada después de comprobar su ruta, marcador y ausencia de enlaces. No se ejecutaron pruebas mutables contra las releases conservadas.

Release anterior intacta: `c2-67d95728399e4e30a406eba7301979fd`, manifiesto `8DCCBF599E7C93B94386668F752DA4F1CFD58F35D9DCA39BDCED5A418D3FB0AE`. Una instantánea de sus 2.779 objetos anterior y posterior coincide exactamente en inventario, contenido, tamaño y fechas de modificación. La comparación fue de lectura; no se afirma conservación del tiempo de último acceso.

## 5. Pruebas seleccionadas

Regresión explícita: `c2-final-release`, `c2-receiver`, `c2-receiver-activation`, `durable-revocation-atlas-preflight` y `durable-revocation-operational`: **100 aprobadas y 1 omitida** (RX17 requiere ruta de copia desechable).

Selección separada CP01, CP05, CP06 y RX17, con `TWOSIDES_C2_OFFLINE_ROOT` apuntando exclusivamente a la copia desechable: **4 aprobadas**, otros 33 casos fuera de selección. Total final: **104 pruebas aprobadas**, sin sumar los dos mensajes interactivos ni cifras históricas.

Se añadieron seis casos FR01–FR06: parser/conector nativo interceptado sin red; rechazo sin activación; composición de repositorios con tres clientes dobles, A/B/C y limpieza de 16 filas; rechazo del fence inesperado antes de escribir; temporal y estructura estrictos; resultado sanitizado con recibos, revisiones y cierre. Las pruebas de entrada interceptan MongoClient antes de DNS y bloquean sockets; los datos y las credenciales son ficticios. No validan concurrencia real de Atlas.

Se corrigieron dos fallos iniciales de pruebas: URL de preload de Windows para `--import` y expectativa de cierre ante incertidumbre. La batería final indicada pasó después de esas correcciones. Los archivos JS modificados y los dos scripts PowerShell superaron además las comprobaciones de sintaxis.

A36 continúa excluida y no aprobada: corresponde al lanzador histórico de fase D con consultas ACL. No se ejecutó `private-workspace.ps1` ni baterías generales que lo incluyan. Los controles del receptor C.2 se comprobaron con su propia selección.

## 6. Límites y protección conservados

Destino futuro fijo: `<cluster>.<id>.mongodb.net`, usuario `twosides_integration_test`, base `two_sides_integration_test`, authSource `admin`, mecanismo DEFAULT y TLS estricto. Se rechazan otros destinos; no se usa configuración de `.env`.

Antes de cualquier escritura futura, el arnés exige permisos efectivos, catálogo completo sin filtro, modelos e índices exactos y fence inicial esperado, con las otras siete colecciones C.2 vacías. No crea ni modifica estructuras y no adopta inventarios inesperados. Se conservan las estructuras anteriores.

Se mantienen tres clientes durante toda la ejecución, dos trabajos de aplicación concurrentes, dos sesiones explícitas y dos implícitas simultáneas como cupos separados, presupuestos históricos de transacciones y ocho envíos. El plazo global es 120 s, con 4 s reservados para cierre. Los límites no garantizan cancelar físicamente un commit ya enviado al servidor.

La limpieza transaccional sigue vinculada a IDs y propietarios sintéticos exactos: 16 filas propias al completar los escenarios, preservando el fence y sin restaurar su revisión. Incertidumbre, inventario inesperado o trabajo pendiente bloquean la limpieza. Un cierre no demuestra rollback.

Se registra antes de abrir la conexión un plan con IDs sintéticos suficientes para conciliación, sin secretos. El resultado conserva solamente campos seguros: estados, revisiones y validaciones de recibos. La contraseña circularía por entrada oculta/stdin y memoria, con reutilización interna acotada para las tres aperturas supervisadas; al cerrar se descarta la referencia. No se promete borrado físico inmediato de strings del heap, inmunidad frente a depuradores ni protección contra procesos de la misma cuenta.

## 7. Condiciones pendientes y detención

1. Revisar y conservar una referencia del digest de la nueva release conforme a la condición de referencia externa del informe de activación. Este digest local y el respaldo anterior no satisfacen por sí solos esa independencia.
2. Aceptar expresamente los riesgos residuales del entorno Windows/B00 y definir contraseña de integración de vida acotada y rotación posterior. Ni la ubicación LOCALAPPDATA ni los hashes garantizan confidencialidad frente a código de la misma cuenta.
3. Obtener autorización independiente para una única ejecución C.2. Solo entonces preparar una activación nueva, de un uso, con su digest y ventana vigentes. Cambiar el manifiesto cambia su hash: el digest offline actual no autoriza una versión remota.
4. Antes de introducir un secreto real, verificar nuevamente integridad, ausencia de enlaces, entorno exacto, temporal vacío, estado de uso único y precondiciones de acceso. Una discrepancia detiene sin desactivar controles. Posteriormente, el preflight remoto deberá comprobar permisos e inventario antes de escribir.
5. Conciliar cualquier commit incierto con autorización y alcance propios antes de limpiar; no reintentar ni ampliar operaciones automáticamente.

No se preparó ni ejecutó un comando de activación remota, ni se pidió una contraseña real. No hubo conexión Atlas, C.2, F.2, acceso a `backend/.env`, SQLite o Godot, ni modificación de permisos o propietarios. No se vuelve a declarar validada la persistencia o revocación remota mediante estas pruebas offline.

**Detenido antes de toda activación. B00 permanece pendiente.**
