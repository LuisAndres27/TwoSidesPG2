# B05 C.2 — registro de riesgos residuales y decisión de aceptación

Fecha de preparación: 2026-10-29 (UTC 2026-10-30). Release: `c2-ba006dea951a180aabf7561b028ee1cb`.

> **ACEPTACIÓN DE RIESGOS: APROBADA EXCLUSIVAMENTE PARA C.2.**
> **AUTORIZACIÓN DE PREPARACIÓN DE ACTIVACIÓN: CONCEDIDA el 2026-10-30 UTC** (solo preparación offline; ver `B05_C2_ACTIVATION_MANIFEST_PREPARATION_RESULT.md`).
> **AUTORIZACIÓN DE CONEXIÓN A ATLAS: NO CONCEDIDA.**
> **AUTORIZACIÓN DE EJECUCIÓN C.2: NO CONCEDIDA.**
>
> Decisión del usuario (opción A), 2026-10-30 UTC: acepta expresamente R1, R4, R5, R6, R7, R8, R9 y R10, limitada a **una única ejecución sintética C.2** con el usuario `twosides_integration_test`, la base `two_sides_integration_test` y el clúster TwoSidesCluster. Historial: antes eligió la opción C (medidas adicionales), cumplida en `B05_C2_ADDITIONAL_SAFEGUARDS_RESULT.md`. Esta aceptación **no** autoriza preparar el manifiesto, conectar ni ejecutar, y **no resuelve** ningún riesgo: B00 sigue pendiente.

> **Nota histórica:** este documento se preparó para que el usuario decidiera; la autorización para redactarlo no era una aceptación. La aceptación solo existe desde la decisión registrada en la sección 3. Ninguno de los riesgos está resuelto.

Fuentes: `B05_C2_SINGLE_RUN_AUTHORIZATION_PLAN.md`, `B05_C2_SINGLE_USE_ACTIVATION_PREPARATION_RESULT.md`, `B05_C2_ACTIVATION_GAPS_FIX_RESULT.md`, `B05_C2_ACTIVATION_GAPS_FIX_VERIFICATION_RESULT.md`, `B05_C2_RECEIVER_ACTIVATION_REVIEW.md`, `B05_C2_WINDOWS_FINAL_BLOCKERS_RESULT.md`. No se repitió ninguna auditoría. No se leyó `backend/.env`.

## 1. Alcance de lo que se le pediría aceptar

Solo una ejecución sintética C.2 (A/B/C, reapertura y limpieza condicional) con:

| Elemento | Valor fijo |
|---|---|
| Clúster / host | TwoSidesCluster / `<cluster>.<id>.mongodb.net` |
| Usuario | `twosides_integration_test` (authSource `admin`, mecanismo DEFAULT, TLS estricto) |
| Base | `two_sides_integration_test`, ámbito de esquema C.2A `10ef4f6d653f4ee4a1d1b2e6591013c2` |
| Datos | Exclusivamente sintéticos; tres actores generados en memoria; sin Outbox ni identidad Godot reales |

**Queda fuera de cualquier aceptación:** `two_sides_db` (base principal), `twosides_backend`, usuarios administrativos, cualquier otro clúster, base o servicio, el backend normal, el juego, `backend/.env` y la rotación de credenciales de otros servicios. Aceptar estos riesgos no extiende permisos a nada de esa lista.

## 2. Registro de riesgos

Cada riesgo usa los mismos siete campos. «Afecta a» distingue C.2 de otros componentes.

### R1 — B00 continúa sin resolverse

| Campo | Contenido |
|---|---|
| 1. Evidencia | B00 es el problema de ACL no resuelto registrado desde `AUTH_SECURITY_DESIGN.md` y en `B05_C2_WINDOWS_FINAL_BLOCKERS_RESULT.md` y `B05_C2_RECEIVER_ACTIVATION_REVIEW.md`. Ninguno de los tres informes de esta serie lo cierra; la verificación externa de la release declara expresamente que no lo certifica |
| 2. Alcance | La cuenta Windows `luis2` y todo proceso que corra con ella. No se demostró que ningún proceso ajeno la use |
| 3. Controles | Release fuera del proyecto, en `%LOCALAPPDATA%\TwoSides\C2Runtime`; 1.894 archivos con SHA-256 abiertos sin escritura durante el hijo; lectura de ACL de 1.894 objetos nuevos sin escritores ni SID prohibidos; entorno del hijo de 8 variables; digest externo del manifiesto; registro de consumo; destino fijo |
| 4. Consecuencias | Un proceso con la misma cuenta podría sustituir código o referencias *antes* de las comprobaciones, leer la memoria del receptor, o manipular marcadores. El efecto máximo dentro de C.2 es operar con el usuario de integración sobre datos sintéticos, o leer su contraseña mientras está en uso |
| 5. Riesgo restante | Alto en confianza, acotado en impacto. Las comprobaciones detectan alteración de bytes, no a un proceso que actúe con los mismos derechos |
| 6. Afecta a | C.2 y, por su naturaleza, a todo lo que esa cuenta toca |
| 7. Contención | Ejecutar en una sesión limpia, con el mínimo de programas abiertos; no lanzar el receptor desde una consola con herramientas ajenas; rotar la contraseña inmediatamente después (ver plan de rotación); no declarar B00 resuelto |

### R2 — SID desconocidos con permisos adicionales sobre rutas del equipo

| Campo | Contenido |
|---|---|
| 1. Evidencia | Tres SID de la forma `S-1-5-21-…`: A `…-3248334987` y B `…-466486063` con `Modify` heredado en el árbol del proyecto (incluido `backend/.env`); C `…-3326500402` con `Modify` explícito en `%LOCALAPPDATA%\Temp`. Ninguno resuelve a una cuenta local ni está en el token. Solo `luis2` está habilitada |
| 2. Alcance | A y B: el proyecto original. C: Temp del usuario. No están en `C2Runtime` (verificado en la release actual) ni en la carpeta de la release |
| 3. Controles | La release y su Temp propio (`runs/<id>/temp`) viven fuera de esas rutas; el lanzador rechaza esos SID como escritores (`forbiddenSids`); el hijo no usa el Temp del usuario (AR04) |
| 4. Consecuencias | Quien opere con esas identidades podría modificar archivos del proyecto original o de Temp. Es una **capacidad de acceso**, no un hecho de uso |
| 5. Riesgo restante | Sin identificar. Se descartó que afecten a la release; no se descartó que afecten al proyecto original |
| 6. Afecta a | Proyecto original y Temp; **no** al flujo C.2 según las comprobaciones |
| 7. Contención | No ejecutar nada desde el proyecto original; no usar Temp; verificar de nuevo que la release no tenga esos SID antes de activar (lo hace el lanzador) |

**Sobre su naturaleza:** los informes solo establecen que son identificadores sin cuenta asociada y que comparten un patrón de permisos. Una explicación posible es un mecanismo de aislamiento de la herramienta, **no demostrada**. No hay evidencia de actividad maliciosa de ninguno de los tres y este documento no la atribuye.

### R3 — `backend/.env`: riesgo de lectura por permisos existentes

| Campo | Contenido |
|---|---|
| 1. Evidencia | Revisado solo por ruta, atributos y permisos: 278 bytes, modificado 2026-10-16, propietario `luis2`, SID A y B con `Modify` heredado, dentro de una carpeta redirigida por OneDrive, ignorado por `.gitignore`; `Respaldo_ENV` vacía. Su contenido **no** se abrió ni se hasheó |
| 2. Alcance | Ese archivo del proyecto original. Qué secretos contiene es una inferencia a confirmar por usted |
| 3. Controles | El flujo C.2 no lo lee: no hay `dotenv` en `src` ni `scripts`; `env-guard.js` e `isolation-guard.js` lo bloquean en pruebas; el receptor y la release no lo incluyen; el lanzador rechaza variables `DOTENV*` y `MONGO*` |
| 4. Consecuencias | Exposición de lo que contenga para quien pueda leerlo o recuperar versiones sincronizadas |
| 5. Riesgo restante | No cuantificable sin conocer el contenido |
| 6. Afecta a | **Otros componentes** (backend normal y lo que configure ese archivo), no a C.2 |
| 7. Contención | Decisión de usted, independiente de C.2: moverlo fuera de OneDrive, revisar su historial de versiones, rotar lo que contenga. **La contraseña de integración C.2 no debe guardarse nunca en `.env`** |

### R4 — Procesos de la misma cuenta podrían manipular el registro local de consumo

| Campo | Contenido |
|---|---|
| 1. Evidencia | SU12 demuestra que borrar `runs/<id>` no rearma la release gracias al registro `C2Runtime\consumed\<releaseId>.json`, y que borrar también el registro sí la rearma. Está documentado en `B05_C2_ACTIVATION_GAPS_FIX_RESULT.md` §1.3 y §4 |
| 2. Alcance | Cualquier proceso con la cuenta `luis2`. Se evaluaron registro de Windows, segundo archivo, solo lectura y manejadores: ninguno resiste a la misma cuenta sin cambiar ACL o privilegios |
| 3. Controles | Registro exclusivo fuera de `runs`; lo exige el hijo; lo verifica el verificador; atado a la release, no solo al `executionId`; carpeta `runs` debe estar vacía |
| 4. Consecuencias | Un segundo intento sobre la misma release; el fence ya habría avanzado y el inventario no estaría en estado inicial, por lo que el preflight lo detendría antes de escribir |
| 5. Riesgo restante | Reintento deliberado por un proceso hostil: **no impedido** |
| 6. Afecta a | C.2 |
| 7. Contención | Anotar a mano cada intento en un medio externo (correo o papel), único control fuera de la cuenta; no aceptar resultados de una release cuyo registro desapareció; tras cualquier intento tratar la release como consumida; el preflight exige fence en revisión 0 e inventario inicial exacto |

### R5 — Node.js y MongoDB pueden conservar credenciales en memoria

| Campo | Contenido |
|---|---|
| 1. Evidencia | `B05_C2_SINGLE_RUN_AUTHORIZATION_PLAN.md` §2 y `B05_C2_SINGLE_USE_ACTIVATION_PREPARATION_RESULT.md` §7: no se garantiza el borrado total |
| 2. Alcance | Procesos: consola PowerShell, hijo Node.js y driver. La contraseña viaja por teclado oculto, un `char[]` que se limpia, un `byte[]` que se limpia y la entrada estándar anónima del hijo |
| 3. Controles | Nunca en argumentos, variables, archivos ni logs (SU07, RX08, RX22); marco con longitud, destrucción del manejador tras el uso; entorno del hijo de 8 variables; límite de 120 s |
| 4. Consecuencias | Quien lea la memoria del proceso mientras vive, o un volcado, podría obtener la contraseña |
| 5. Riesgo restante | Copias internas de cadenas del runtime y del driver que no se pueden limpiar desde el código |
| 6. Afecta a | C.2 |
| 7. Contención | Contraseña exclusiva y de un solo uso, **rotada después de cualquier intento**; no generar volcados; cerrar la consola al terminar; ver el plan de rotación |

### R6 — Una transacción puede confirmarse tras un timeout o pérdida de respuesta

| Campo | Contenido |
|---|---|
| 1. Evidencia | Plan §2 y §6: cerrar o matar el proceso no acredita rollback. RX11 y RX12 prueban el comportamiento ante incertidumbre y escrituras pendientes |
| 2. Alcance | Las escrituras de las ocho colecciones C.2A |
| 3. Controles | Un commit incierto o una escritura pendiente detiene etapas nuevas, bloquea la limpieza, no reintenta y conserva IDs en `synthetic-plan.json`; máximo 8 envíos y 3 intentos supervisados por transacción; 120 s globales |
| 4. Consecuencias | Documentos sintéticos que permanecen aunque el resultado diga que no se confirmó; el fence puede haber avanzado |
| 5. Riesgo restante | El estado real del servidor puede diferir del informado hasta una conciliación posterior |
| 6. Afecta a | C.2 (solo datos sintéticos propios) |
| 7. Contención | No repetir el ensayo; no limpiar a ciegas; conciliar con una autorización aparte; el fence **no** se reinicia |

### R7 — La referencia externa verifica integridad, no procedencia histórica

| Campo | Contenido |
|---|---|
| 1. Evidencia | `B05_C2_ACTIVATION_GAPS_FIX_VERIFICATION_RESULT.md`: PASS, 1.894 archivos, código 0; cinco hashes coinciden; digest `A24EDEE0…D57A8`. Confirmado hoy: el manifiesto local sigue teniendo ese mismo digest |
| 2. Alcance | Demuestra que el paquete recuperado de Google Drive y la release local coinciden. La procedencia desde Drive la confirmó el usuario; el agente no observó la cuenta ni su historial |
| 3. Controles | Digest suministrado desde una copia recuperada, no generado desde la release; hash del verificador contrastado antes de ejecutarlo; verificación repetida en el momento de activar |
| 4. Consecuencias | Si la referencia y la release se alteraron juntas, o la cuenta de nube la controla el mismo atacante, la comprobación no lo detectaría |
| 5. Riesgo restante | No se certificó independencia de escritura, historial ni cuenta de nube |
| 6. Afecta a | C.2 |
| 7. Contención | Conservar el digest también en un medio distinto (papel o correo); comparar a ojo los primeros y últimos caracteres con `A24EDEE0…D57A8`; usar la versión del servicio con historial |

### Riesgos adicionales ya documentados, no incluidos en su lista

Se muestran por completitud. Puede aceptarlos, rechazarlos o pedir medidas igual que los demás.

| ID | Riesgo | Evidencia | Contención |
|---|---|---|---|
| R8 | El rol `readWrite` de `twosides_integration_test` cubre toda su base, más que los documentos autorizados; el aislamiento es de código, no de permisos | Plan §2 | Base solo de integración; ocho colecciones fijas; revisión de privilegios previa; rotación |
| R9 | La release incluye la fábrica real de conexión; solo la frenan el manifiesto bloqueado, el digest, el registro de consumo y la autorización | `B05_C2_SINGLE_USE_ACTIVATION_PREPARATION_RESULT.md` §4 | Ningún manifiesto remoto existe; no generar uno sin autorización |
| R10 | El fence C.2A avanza si hay commits y no puede reiniciarse; otra ejecución no podrá asumir revisión 0 | Plan §6 | Se conserva; se asume que habrá que usar otro ámbito si hiciera falta repetir |

## 2.1 Decisiones expresas del usuario sobre medidas (registradas textualmente)

Comunicadas por el usuario el 2026-10-30 (UTC) en la conversación. **No son una aceptación automática de R1–R10 y no autorizan activar C.2 ni conectarse a Atlas.**

| Riesgo | Decisión textual | Qué cambia y qué no |
|---|---|---|
| R2 | «Mantener documentados los SID desconocidos sin modificar ACL ni propietarios.» | Se mantienen documentados. Sin cambios de ACL ni propietarios. El riesgo **no se resuelve**; no se atribuye actividad a esos SID |
| R3 | «Tratar backend/.env por separado de C.2. Revisar y rotar credenciales principales potencialmente expuestas antes de utilizar datos reales, mediante una actividad independiente y autorizada.» | R3 sale del alcance de C.2 y pasa a una actividad **independiente y autorizada aparte**, previa al uso de datos reales. Esa actividad no se ha iniciado y no se abrió `.env` |
| R7 | «Utilizar Google Drive como referencia externa para verificar la integridad de las releases.» | Drive queda como referencia externa. Sigue valiendo lo ya documentado: acredita integridad, no procedencia histórica |
| R8 | «Mantener el rol readWrite limitado a two_sides_integration_test. Exigir verificación de permisos efectivos antes de cualquier escritura remota.» | Se mantiene el rol amplio de su base (no se estrecha). La verificación de permisos efectivos (`connectionStatus` con `showPrivileges`: usuario, rol único y recursos) es un control ya existente del receptor, que se ejecuta al abrir cada cliente y detiene la ejecución si falla, antes de las escrituras. Queda como condición expresa |
| Rotación | «PLAN DE ROTACIÓN: APROBADO para la contraseña de twosides_integration_test después de cualquier intento, incluso fallido o cancelado.» | Aprobado (ver plan de rotación). No es una autorización de ejecución |

### Riesgos que aún requieren aceptación para una ejecución sintética limitada

| ID | Riesgo | Estado tras las decisiones |
|---|---|---|
| R1 | B00 sin resolver | **Permanece.** Requiere aceptación |
| R2 | SID desconocidos | **Permanece documentado.** No afecta a la release (no están en `C2Runtime`); requiere darse por enterado |
| R3 | `backend/.env` | **Fuera del alcance de C.2** por decisión del usuario; actividad independiente. No forma parte de esta aceptación |
| R4 | Registro de consumo manipulable por la misma cuenta | **Permanece.** Requiere aceptación |
| R5 | Credencial en memoria | **Permanece.** Requiere aceptación |
| R6 | Commit tras timeout | **Permanece.** Requiere aceptación |
| R7 | Referencia externa: integridad, no procedencia | **Permanece** con Drive como referencia. Requiere aceptación |
| R8 | Rol `readWrite` amplio | **Permanece** (rol mantenido), con verificación de permisos efectivos exigida antes de escribir. Requiere aceptación |
| R9 | Release con fábrica real de conexión | **Permanece**; solo la frenan el manifiesto bloqueado y la autorización. Requiere aceptación |
| R10 | El fence C.2A avanza y no se reinicia | **Permanece.** Requiere aceptación |

Resumen: **8 riesgos permanecen para decidir (R1, R4, R5, R6, R7, R8, R9, R10), 1 se da por enterado (R2) y 1 va por otra vía (R3).** Ninguno está resuelto.

### Resumen breve para decidir

Lo que usted aceptaría con la opción A: que una prueba sintética, de una sola vez, con una contraseña exclusiva que se rota después, puede (1) ser atacada por un proceso que ya controle su cuenta de Windows antes de que las comprobaciones lo detecten (R1, R4), (2) dejar la contraseña un tiempo en la memoria de Node.js y del driver (R5), (3) dejar documentos sintéticos confirmados aunque el resultado diga que no (R6), (4) apoyarse en una referencia de Drive que prueba integridad pero no procedencia (R7), (5) operar con un rol que cubre toda su base de integración, aunque se exija verificarlo antes de escribir (R8), (6) usar una release que incluye la capacidad real de conectar, hoy bloqueada (R9), y (7) avanzar el fence para siempre (R10). Los SID desconocidos (R2) quedan documentados sin efecto conocido sobre la release. `.env` (R3) se trata aparte y no se incluye.

Lo que **no** se acepta con eso: `two_sides_db`, `twosides_backend`, otros clústeres o servicios, el backend normal, datos reales y la rotación de credenciales principales. Y aunque se acepte, **no** se autoriza ejecutar: eso exige además generar el manifiesto, su referencia externa nueva y una autorización final.

## 3. Decisión del usuario

**Estado actual: OPCIÓN A REGISTRADA (aceptación limitada, 2026-10-30 UTC).** La opción C anterior quedó cumplida; la opción B no se eligió. La aceptación vale solo para lo que se indica a continuación y **no autoriza ejecutar**.

- [x] **A. ACEPTAR** los riesgos R1, R4, R5, R6, R7, R8, R9 y R10 **exclusivamente para una única ejecución sintética C.2** contra `two_sides_integration_test` (usuario `twosides_integration_test`, clúster TwoSidesCluster), con el alcance de la sección 1. La aceptación **no** cubre `two_sides_db`, `twosides_backend`, otros clústeres, `backend/.env`, el backend normal, datos reales ni otros servicios, y **no** autoriza la ejecución: esa se decide aparte en `B05_C2_FINAL_EXECUTION_DECISION.md`.
  - Riesgos aceptados: R1 [x]  R2 [ ] *(documentado, sin aceptación: «dado por enterado»)*  R3 [ ] *(fuera de C.2: actividad independiente)*  R4 [x]  R5 [x]  R6 [x]  R7 [x]  R8 [x]  R9 [x]  R10 [x]
  - **Condiciones que la acompañan, tal como las fijó el usuario:** verificación de permisos efectivos antes de escribir; máximo tres clientes; máximo ocho envíos; limpieza condicional de hasta 16 documentos sintéticos propios; protección del fence C.2A; detención ante discrepancias o commits inciertos; rotación manual de la contraseña después de cualquier intento, incluso fallido o cancelado. Si alguna deja de cumplirse, la aceptación no cubre esa ejecución.
- [ ] **B. RECHAZAR** los riesgos y **mantener bloqueada** la ejecución C.2.
- [x] **C. SOLICITAR MEDIDAS ADICIONALES** antes de decidir. Medidas pedidas (resumen de la solicitud del usuario): (1) documentar el procedimiento para verificar la futura versión activable con un digest nuevo de referencia externa; (2) revisar las evidencias sobre el alcance de la cuenta MongoDB sin asumir permisos actuales; (3) lista manual de comprobaciones de rotación; (4) distinguir qué riesgos pueden contenerse antes de C.2, cuáles permanecen y cuáles son independientes. Resultado: `B05_C2_ADDITIONAL_SAFEGUARDS_RESULT.md`.

Sugerencias que no están decididas ni preparadas: identificar los tres SID con los controles administrativos de Windows; mover `.env` y rotar su contenido; decidir si se acepta un rol de Atlas más estrecho o un usuario temporal para la prueba; guardar el digest en un segundo medio; ejecutar en una sesión limpia o máquina virtual.

| Campo | Registro |
|---|---|
| Decisión (A / B / C) | **A — aceptación limitada de R1, R4, R5, R6, R7, R8, R9 y R10** (antes: C, ya cumplida) |
| Fecha y hora (UTC) | 2026-10-30, comunicada en la conversación; hora exacta no proporcionada |
| Nombre de quien decide | El usuario del proyecto (decisión comunicada por escrito en la conversación; sin firma adicional) |
| Observaciones | Aceptación válida solo para una única ejecución sintética C.2. Decisiones previas vigentes: R2 documentado sin modificar permisos; R3 por separado y antes de usar datos reales; R7 Google Drive como referencia externa; R8 `readWrite` limitado a `two_sides_integration_test`. Autorización de preparación de activación: **no concedida**. Conexión a Atlas: **no concedida**. Ejecución C.2: **no concedida**. B00 pendiente |

## 4. Qué no ocurrió

No se pidió ni se recibió ninguna contraseña. No se conectó MongoDB Atlas. No se generó un manifiesto de activación. No se ejecutó C.2 ni F.2. No se modificó ninguna release, `backend/.env`, SQLite, Godot, ACL, propietarios, usuarios o permisos de Atlas. B00 sigue **sin resolver**.
