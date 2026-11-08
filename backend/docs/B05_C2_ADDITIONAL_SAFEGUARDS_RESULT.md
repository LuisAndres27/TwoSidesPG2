# B05 C.2 — medidas adicionales previas a la aceptación de riesgos

Fecha: 2026-10-30 UTC (2026-10-29 America/Guatemala). Release: `c2-ba006dea951a180aabf7561b028ee1cb`, bloqueada y sin modificar. **No se aceptaron riesgos, no se autorizó ninguna activación ni conexión.** B00 sigue sin resolver.

## 1. Decisiones registradas

| Decisión del usuario | Registro |
|---|---|
| Opción C: medidas adicionales antes de aceptar R1–R10 | Registrada en `B05_C2_RESIDUAL_RISK_ACCEPTANCE.md` (encabezado y §3): «DECISIÓN: MEDIDAS ADICIONALES SOLICITADAS». Opciones A y B sin marcar |
| Plan de rotación manual tras cualquier intento | Aprobado. Registrado en `B05_C2_INTEGRATION_CREDENTIAL_ROTATION_PLAN.md`: «PLAN DE ROTACIÓN: APROBADO PARA UNA FUTURA EJECUCIÓN C.2» |
| No autorizar activación remota ni conexiones a MongoDB Atlas | Registrado en `B05_C2_FINAL_EXECUTION_DECISION.md` §9: ambas en «No» |

Esa aprobación del plan no es aceptación de riesgos ni autorización de ejecución. `B05_C2_FINAL_EXECUTION_DECISION.md` mantiene su estado global **PENDIENTE DE ACEPTACIÓN DE RIESGOS Y AUTORIZACIÓN DE EJECUCIÓN**.

## 2. Integridad de la futura activación

### 2.1 Lo que se confirmó hoy (sin generar ninguna versión activable)

- **El digest actual corresponde a `c2-blocked`.** `A24EDEE0CED4D6548AEEDCF5F72B8C2E689D31ABDEFA97B054A90538F5FD57A8` es el SHA-256 de un `manifest.json` con `version 2`, `mode c2-blocked`, `remoteEnabled false`, `activation null`. Coincide con el digest recuperado de la descarga externa (`C2_Final_BA006`). El verificador dio `PASS files=1894 mode=c2-blocked`, `runs` y `temp` vacíos, sin registro de consumo.
- **Cambiar `manifest.json` obliga a un digest nuevo.** Comprobado en una copia desechable (ya eliminada): tras modificar un solo campo del manifiesto, el verificador con el digest *anterior* devolvió `FAIL`, y con el digest recalculado devolvió `PASS`. Es el mismo mecanismo que usa el lanzador (`Get-FileHash` del manifiesto frente al digest suministrado). Por eso el digest `A24EDEE0…D57A8` **no puede** autorizar una versión activable.
- La release real mantuvo su digest antes y después.

### 2.2 Procedimiento previsto para la futura versión activable (aún no ejecutado)

Solo se inicia con una autorización explícita aparte. Esta fase no lo ejecutó ni lo prepara.

| Paso | Qué ocurre | Quién |
|---|---|---|
| 1 | Autorización aparte para generar el manifiesto de activación | Usuario |
| 2 | Generar el manifiesto con `mode c2-remote-once`, `remoteEnabled true`, `executionId` nuevo y distinto de `10ef4f6d…`, destino y escenarios fijos y fechas `AAAA-MM-DDThh:mm:ss[.mmm]Z`. **Recomendación a decidir entonces:** hacerlo en una copia con *releaseId* nuevo, para que `c2-ba006dea…` siga bloqueada como referencia comparable; hacerlo sobre la misma release también es posible pero la modifica | Agente, tras la autorización |
| 3 | Calcular el SHA-256 completo del nuevo `manifest.json`: es un digest **distinto** de `A24EDEE0…D57A8` | Agente |
| 4 | Crear un paquete de referencia nuevo de cinco archivos con ese digest (modo `c2-remote-once`) y entregárselo | Agente |
| 5 | Subirlo a una carpeta **nueva** de Drive, recuperarlo en otra ubicación y comunicar la ruta. El agente no sube ni descarga | Usuario |
| 6 | Comparar los cinco SHA-256 recuperados con el original; leer el digest del `manifest.sha256.txt` **recuperado**; comprobar el hash del verificador antes de ejecutarlo | Agente (lectura) |
| 7 | Ejecutar el verificador de la release con `-ExpectedMode c2-remote-once` y ese digest. Debe dar PASS, código 0 y la ventana vigente. **Todo esto ocurre antes de introducir ninguna credencial** | Agente (lectura) |
| 8 | El lanzador recibe el mismo digest, tomado de la copia recuperada. No se acepta uno copiado de la release | Usuario |
| 9 | Solo entonces, y con la autorización final, se introduce la credencial por la entrada oculta | Usuario |

**Reglas fijas:**
1. No se usan automáticamente hashes obtenidos de la misma release (`C2Runtime`), del proyecto, del respaldo local o de `reference.json` como referencia independiente. El verificador solo compara; no descubre ni genera digests.
2. Un PASS del verificador con digest local no cuenta como verificación externa (así se documentó en la fase de construcción).
3. Si cambia un solo byte del manifiesto, el paquete o la release entre el paso 6 y el 9, se repite desde el paso 3.

**Advertencia práctica sobre la ventana:** el núcleo rechaza una ventana que empiece más de 60 s en el futuro, de modo que las fechas deben ser las del momento de generar el manifiesto, y la ventana máxima de 4 h tiene que cubrir los pasos 5 a 9 (subida, descarga, verificación y ejecución). Si caduca, se genera un manifiesto nuevo con otro `executionId`, otro digest y otra referencia externa; la release no se consume mientras no haya un intento.

**Limitación que no desaparece (G4):** el código no puede saber si el digest que se le pasa procede de un medio independiente. La separación depende de seguir este procedimiento. El control técnico adicional es el registro de consumo, no el digest.

## 3. Alcance de la cuenta MongoDB: evidencias existentes

Usuario `twosides_integration_test`, base `two_sides_integration_test`, authSource `admin`. Se revisaron únicamente documentos ya existentes; **no se conectó Atlas, no se accedió a `two_sides_db` y no se tocó ningún usuario ni rol.** Las filas son hechos registrados en su momento, no el estado actual.

### 3.1 Qué se comprobó antes

| Qué | Cómo y cuándo | Fuente | Estado |
|---|---|---|---|
| Rol declarado `readWrite` sobre la base | **Declarado por el usuario** desde la interfaz de Atlas, 2026-10-28 | `B05_ATLAS_READONLY_CONNECTION_RESULT.md` | Declaración, no verificación del proceso |
| Intentos con autenticación fallida | 2026-10-28: `AUTHENTICATION_FAILURE`, error 8000, en D.1 y D.1B. Causa **no determinada**; después el usuario confirmó acceso por Compass | `B05_ATLAS_CONNECTION_DIAGNOSTIC.md`, `B05_ATLAS_AUTHENTICATION_DIAGNOSIS.md` | Histórico |
| Autenticación DEFAULT, identidad única en `admin`, destino exacto, TLS estricto | Conexión real de solo lectura, 2026-10-28 22:16 GT | `B05_ATLAS_DEFAULT_AUTH_RESULT.md` | Verificada en esa fecha |
| Privilegios efectivos: rol único `readWrite` sobre la base; recursos limitados a esa base «conforme a la política» | `connectionStatus` con `showPrivileges`, misma sesión | idem | Verificada en esa fecha |
| `listCollections` y `find` sobre toda la base | Sesión real 2026-10-28 | `B05_ATLAS_LISTCOLLECTIONS_ALTERNATIVE_RESULT.md` | Verificada en esa fecha |
| Escritura transaccional: `insert`, `update`, `remove` | Ensayo sintético real, 2026-10-28 | `B05_ATLAS_TRANSACTIONAL_INTEGRATION_RESULT.md` | Ejercida en esa fecha |
| `createCollection`, `createIndex`, `insert`, `listIndexes` | Creación del esquema C.2A, **2026-10-29 07:13:51 GT**. Es la **última conexión real conocida** | `B05_DURABLE_REVOCATION_ATLAS_SCHEMA_RESULT.md` | Ejercida y verificada en esa fecha |
| Nombre exacto del usuario, host, base y mecanismo | Validados por cada conexión | varios | Verificada en esas fechas |

### 3.2 Qué requiere una futura conexión autorizada

Nada de lo siguiente se puede afirmar hoy con certeza, y no se puede comprobar sin conectar:

| Pendiente | Por qué no puede asumirse |
|---|---|
| Que el usuario **sigue existiendo, activo y con caducidad vigente** | La última comprobación es de hace horas; nadie descarta cambios posteriores |
| Que **la contraseña** que se tecleará corresponde a él | Hubo fallos de autenticación sin causa determinada; la contraseña de la prueba será nueva |
| Que el rol **sigue siendo único `readWrite`** sobre la base | Un cambio en la consola de Atlas no deja rastro local. El receptor lo vuelve a comprobar con `connectionStatus` dentro de la ejecución, y se detiene si difiere |
| Que **no tiene acceso a otras bases** (`two_sides_db`, `admin`, `local`) | Los resultados antiguos validaron la política sobre los privilegios *informados*; **no se hicieron pruebas negativas de acceso** a otras bases, a propósito |
| Que su alcance por clúster y la **lista de accesos de red** permiten la conexión y no incluyen otros clústeres | No consta una revisión de esa configuración |
| El mecanismo SCRAM finalmente negociado | Nunca se observó; solo se solicitó DEFAULT |
| El catálogo, los índices y el fence C.2A actuales | Solo vistos al crear el esquema; pueden haber cambiado |
| Que el rol sea más amplio que lo necesario (R8) | Hecho conocido: `readWrite` cubre toda la base |

**Revisión manual posible sin conectar el receptor (decisión suya):** la revisión de su plan en la consola de Atlas (sección 1 y 2 del plan de rotación) puede hacerse con su propia sesión administrativa, solo de lectura, y anotar el resultado. No la hizo el agente y no sustituye la comprobación del receptor.

## 4. Procedimiento de rotación aprobado

Detalle completo en `B05_C2_INTEGRATION_CREDENTIAL_ROTATION_PLAN.md` (aprobado). La lista breve de comprobaciones manuales está en su §9 y cubre: confirmar qué cuenta se rota; cambiar la contraseña únicamente desde Atlas; no registrar el secreto en archivos, comandos ni mensajes; comprobar el cambio con el registro de actividad y la hora de modificación; documentar fecha, resultado y responsable; y qué hacer si falla.

Resumen: se rota **tras cualquier intento**, incluido el cancelado; a un valor aleatorio que nadie anota; se retira del gestor la entrada anterior; la prueba negativa con la contraseña antigua queda fuera salvo autorización aparte. No se generó ni cambió ninguna contraseña.

## 5. Riesgos residuales R1–R10

Siguen todos vigentes y sin resolver. Clasificación según lo que puede hacerse antes, lo que permanece durante la ejecución y lo que es independiente de C.2.

| ID | Riesgo | Se puede contener antes de C.2 | Permanece durante una ejecución limitada | Independiente de C.2 |
|---|---|---|---|---|
| R1 | B00 sin resolver | Parcialmente: sesión limpia, sin programas innecesarios; máquina virtual aislada (decisión suya) | **Sí** | No |
| R2 | SID desconocidos con permisos extra (proyecto y Temp); **sin evidencia de uso malicioso, no se les atribuye actividad** | Identificarlos con controles de Windows o de la herramienta; es opcional | Sí, sin efecto sobre la release (no están en `C2Runtime`) | **Sí**, afecta al proyecto original y a Temp |
| R3 | `backend/.env` legible por permisos existentes | Sí: moverlo fuera de OneDrive, revisar versiones, rotar su contenido | No hay relación: C.2 no lo lee | **Sí** |
| R4 | La misma cuenta puede borrar el registro de consumo | Parcialmente: registro manual externo de cada intento | **Sí** | No |
| R5 | Copias de la contraseña en memoria | No se elimina; solo se reduce su utilidad con una credencial exclusiva | **Sí**, hasta rotar | No |
| R6 | Commit posterior a un timeout | No | **Sí** | No |
| R7 | Referencia externa: integridad sin procedencia histórica | Parcialmente: segundo medio para el digest; historial de versiones en Drive | **Sí** | No |
| R8 | Rol `readWrite` amplio | Sí, pero cambiarlo obliga a revisar código y construir otra release (el receptor exige un único `readWrite`); o aceptarlo | **Sí**, si no se cambia | No |
| R9 | La release incluye la fábrica real de conexión | Sí: mantener el manifiesto bloqueado hasta autorizar | Sí, es la capacidad que se autorizaría | No |
| R10 | El fence C.2A avanza y no se reinicia | No: es consecuencia de ejecutar | **Sí** | No |

**B00 continúa pendiente.** No se atribuye actividad maliciosa a ningún SID: la única evidencia es que existen permisos asignados a identificadores sin cuenta local asociada.

## 6. Condiciones mínimas para solicitar una aceptación posterior

Para volver a presentar la decisión (no para ejecutar), conviene que antes:

1. **Usted decida o descarte las medidas contenibles**, cada una con una línea de registro: R2 (identificar los SID o aceptar que no), R3 (qué hace con `.env`), R7 (segundo medio para el digest), R8 (aceptar el rol o pedir un rol más estrecho con su revisión de código) y R1 (sesión limpia, máquina virtual o ninguna).
2. Opcionalmente, **revise en Atlas** (solo lectura, con su sesión) usuario, rol, alcance de clúster, caducidad y lista de accesos de red, y anote lo que vea. No sustituye la comprobación del receptor.
3. Se mantenga el estado actual: release bloqueada con el digest `A24EDEE0…D57A8`, `runs` vacío y sin registro de consumo. El agente lo re-verificará antes de presentar de nuevo.
4. Se le presente el texto final de la aceptación (opción A) con la lista exacta de riesgos aceptados, el alcance sintético, la exclusión expresa de `two_sides_db`, `twosides_backend`, `.env` y otros servicios, y el plan de rotación ya aprobado.
5. Esa aceptación se conceda **por separado** de la autorización de preparar el manifiesto de activación y de la autorización final de ejecutar, que exigen su propia decisión, referencia externa y verificación (sección 2.2).

## 7. Conclusión

**Las medidas adicionales están suficientemente preparadas para volver a presentar la decisión de riesgos, con condiciones.** Quedan hechas y documentadas: el registro de las decisiones, el procedimiento de verificación de la futura versión activable (con la comprobación de que un cambio de manifiesto exige un digest nuevo), el inventario de lo que se sabe y de lo que no se sabe de la cuenta MongoDB, la lista manual de rotación y la clasificación de R1–R10.

No están resueltos, y no pueden estarlo sin su acción o sin una conexión autorizada: B00, la identidad de los SID, el destino de `.env`, el rol amplio, el estado actual de la cuenta de Atlas, el catálogo y el fence actuales, y cualquier garantía frente a la memoria o a un commit incierto. La presentación debe decir expresamente que ese residual se acepta, no que se haya eliminado.

## 8. Qué no ocurrió

No se pidió ninguna contraseña. No se conectó MongoDB Atlas ni se accedió a `two_sides_db`. No se generó un manifiesto de activación ni una versión activable. No se ejecutó C.2 ni F.2. No se modificó ninguna release sellada (la única copia creada, desechable, se eliminó tras verificar su ruta y no contenía ningún manifiesto remoto), ni `backend/.env`, SQLite, Godot, ACL, propietarios, usuarios o roles de Atlas. B00 pendiente.

Escrituras de esta fase: este informe y las actualizaciones de `B05_C2_RESIDUAL_RISK_ACCEPTANCE.md`, `B05_C2_INTEGRATION_CREDENTIAL_ROTATION_PLAN.md` y `B05_C2_FINAL_EXECUTION_DECISION.md`.

**Detenido.**
