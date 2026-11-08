# B05 C.2 — plan de rotación de la credencial de integración

## PLAN DE ROTACIÓN: APROBADO PARA UNA FUTURA EJECUCIÓN C.2.

Aprobado por el usuario el 2026-10-30 (UTC), comunicado en la conversación, y **reconfirmado en la misma fecha** con este texto: «PLAN DE ROTACIÓN: APROBADO para la contraseña de twosides_integration_test después de cualquier intento, incluso fallido o cancelado.» Sigue aprobado y sin cambios. **La aprobación del plan no es una aceptación de riesgos ni una autorización de ejecución.** No autoriza activar C.2, conectar a MongoDB Atlas, generar un manifiesto de activación ni cambiar ahora ninguna contraseña, usuario o permiso. Si la futura ejecución se autoriza, este plan se aplica tras **cualquier** intento. La lista breve de comprobaciones manuales está en la sección 9.

Fecha de preparación: 2026-10-29. **Plan documental. No se ejecutó ningún paso, no se accedió a ninguna credencial existente, no se pidió ninguna contraseña y no se cambió ningún usuario, permiso ni contraseña de Atlas.** El usuario ejecuta todos los pasos de Atlas con sus propios controles administrativos; el agente nunca ve la contraseña antigua ni la nueva.

## 0. Alcance exclusivo

| Elemento | Valor |
|---|---|
| Clúster | TwoSidesCluster |
| Usuario | `twosides_integration_test` |
| Base | `two_sides_integration_test` |
| Authentication Database | `admin` (mecanismo DEFAULT, TLS estricto) |

Este plan **no** toca `twosides_backend`, `two_sides_db`, ningún usuario administrativo ni ninguna otra contraseña. Si cualquier paso pareciera requerir uno de ellos, detenerse.

Convenciones: «yo» es el usuario. El agente solo verá resultados sanitizados (códigos y marcas de tiempo), nunca contraseñas.

## 1. Confirmar el usuario de integración previsto

Antes de crear ninguna contraseña, en la consola de administración de Atlas (sección de acceso a bases de datos del proyecto):

1. Comprobar que existe exactamente un usuario `twosides_integration_test` y que el clúster del proyecto es TwoSidesCluster.
2. Comprobar que su base de autenticación es `admin` y que usa autenticación por contraseña (no certificado ni federada).
3. Comprobar que **no** es el mismo usuario que `twosides_backend` ni que ningún usuario con rol administrativo, y que `twosides_backend` no aparece en los datos que se usarán.
4. Anotar la fecha de la última modificación que muestre la consola. Sirve de línea base para el paso 6.
5. Si algo no coincide (nombre distinto, usuario duplicado, base de autenticación distinta): **detenerse**; no continuar con el plan.

## 2. Revisar sus permisos con controles administrativos

Solo lectura, desde la misma consola de administración. No se cambia nada.

| Qué comprobar | Resultado esperado |
|---|---|
| Rol asignado | `readWrite` sobre `two_sides_integration_test` y nada más |
| Alcance | Sin roles sobre `two_sides_db`, `admin`, `local` ni «todas las bases» |
| Roles integrados amplios | Ninguno (`atlasAdmin`, `readWriteAnyDatabase`, `dbAdmin` sobre otras bases, etc.) |
| Restricciones adicionales | Si el usuario tiene fecha de caducidad o alcance a clústeres concretos, anotarlo; si el alcance incluye otros clústeres, tratarlo como discrepancia |
| Lista de accesos de red | Anotar qué direcciones están permitidas; si incluye «cualquier dirección», decidir si se limita a la suya durante la prueba |

**Nota sobre el rol amplio (R8):** `readWrite` cubre toda su base, más que las ocho colecciones C.2A. Es un riesgo ya documentado. Antes de decidir, puede optar por: aceptarlo, o crear con sus propios medios un rol personalizado más estrecho o un usuario temporal. La receta exacta de privilegios y una eventual validación quedan para una fase posterior si usted la solicita. El receptor actual exige que el usuario autenticado tenga **un solo rol `readWrite` sobre la base autorizada** (`B05_C2_SINGLE_RUN_AUTHORIZATION_PLAN.md` §4, punto 2); un rol personalizado haría fallar esa comprobación y obligaría a revisar el código y a construir otra release. No lo haga sin esa revisión.

El propio receptor volverá a comprobar el rol efectivo durante la ejecución (`connectionStatus`, `showPrivileges`). Esa comprobación solo puede ocurrir **dentro** de una conexión autorizada.

## 3. Preparar una contraseña exclusiva para la prueba

1. Generar la contraseña con un gestor de contraseñas o con el generador de Atlas, **nunca** reutilizando otra.
2. Longitud de 24 a 32 caracteres y solo letras y dígitos ASCII (`A–Z`, `a–z`, `0–9`). El receptor la lee tecla a tecla con una distribución de teclado concreta: los símbolos y los caracteres que requieran teclas muertas, o los acentos, pueden teclearse mal y no son necesarios. El mínimo del receptor son 8 y el máximo 256 caracteres.
3. No usar nunca esta contraseña en `backend/.env`, en un archivo, en un correo, en el chat, en una URI ni en un script. Se teclea una sola vez, en el receptor.
4. La contraseña debe ser **de un solo uso**: el mismo valor no se vuelve a utilizar ni para otra prueba ni para otro servicio.
5. Si el gestor de contraseñas la guarda, borrar esa entrada tras la rotación del paso 5.
6. Establecerla en Atlas (editar el usuario, cambiar la contraseña) **solo en el momento que usted decida preparar la ejecución**, no antes, para acotar su vida. Este plan no hace ese cambio.

## 4. Introducirla en el receptor de entrada oculta

Solo después de que existan: aceptación de riesgos, un manifiesto de activación autorizado, su digest externo verificado y la autorización expresa de ejecutar. Nada de esto existe hoy.

1. Abrir una consola PowerShell **interactiva** nueva, sin otros programas que sean innecesarios. No pegar la contraseña en ningún otro lado.
2. El lanzador valida todo y reserva el intento (registro de consumo, run y marcador) **antes** de mostrar el aviso. Si algo falla, rechaza sin pedir la contraseña.
3. En el aviso de entrada oculta, teclear la contraseña. No se muestra nada. Enter confirma, Escape cancela (consume el intento igualmente), Retroceso corrige.
4. El valor viaja como bytes por la entrada estándar anónima del proceso hijo. Nunca por argumentos, variables de entorno, archivos o salida.
5. No intentar de nuevo si falla o se cancela: el intento queda consumido y la release no vuelve a aceptar uno.
6. Cerrar la consola al terminar.

Los comandos exactos **no están en este documento** y no se generan todavía.

## 5. Rotar manualmente después de cualquier intento

Se aplica en **todos** los casos: éxito, fallo, cancelación con Escape y rechazo después de teclear la contraseña. También si la contraseña se tecleó y el lanzador no llegó a conectar.

1. Esperar a que el receptor termine, o a que pasen los 120 s globales. No cambiar la contraseña con el proceso aún vivo si no hace falta.
2. Cerrar la consola que lanzó el receptor.
3. En Atlas, editar `twosides_integration_test` y establecer una contraseña **nueva y aleatoria** generada igual que en el paso 3, que **no** vuelva a anotar en ningún sitio. Es válido que nadie la conozca: el usuario puede quedar inutilizable hasta la próxima prueba. Alternativa más estricta, si usted la prefiere: eliminar el usuario de integración y volver a crearlo cuando haga falta (decisión suya; no forma parte de la autorización actual).
4. Borrar de su gestor de contraseñas la entrada de la contraseña utilizada.
5. Cerrar las herramientas que pudieran retener la credencial (Compass u otras sesiones de Atlas). No extraer secretos de ellas.
6. Si un resultado fue `COMMIT_UNCERTAIN` o `CLOSE_FAILED`, igualmente rotar: la rotación no limpia restos ni cancela sesiones ya autenticadas, solo evita nuevos usos.
7. No retrasar la rotación hasta saber si la prueba pasó.

## 6. Verificar que la contraseña anterior ya no es válida, sin exponer secretos

La prueba directa (conectarse con la contraseña antigua) tiene un coste: obliga a volver a introducir un secreto y es una conexión remota adicional. Por eso se ordena por preferencia:

| Prioridad | Método | Qué prueba | Exposición |
|---|---|---|---|
| 1 | Registro de actividad de Atlas | Muestra que el cambio de contraseña del usuario se hizo, con fecha y hora posteriores al intento | Ninguna: solo metadatos |
| 2 | Hora de última modificación del usuario en la consola | Que cambió respecto de la línea base del paso 1.4 | Ninguna |
| 3 | Revisión de conexiones activas del clúster | Que no quedan sesiones de ese usuario tras el cierre | Ninguna |
| 4 | Prueba negativa con la contraseña antigua | Que la autenticación falla | **Reintroduce el secreto antiguo y supone una conexión remota**: solo con **autorización aparte**, mediante el receptor de entrada oculta y nunca con herramientas gráficas |

Recomendación: aceptar 1 y 2 como evidencia suficiente. No se ejecuta el método 4 sin una autorización específica.

Cambiar la contraseña **no cancela** sesiones ya autenticadas ni revierte commits.

## 7. Qué hacer si la rotación falla

| Situación | Acción |
|---|---|
| No puede iniciar sesión en la consola o no encuentra el usuario | Detenerse; anotar la hora; intentar de nuevo con la autenticación habitual de su cuenta de Atlas; si no es posible, tratar la contraseña como comprometida y continuar con el punto siguiente |
| El cambio de contraseña no se guarda o da error | No volver a teclear la antigua para «probar»; reintentar una vez; si persiste, eliminar el usuario de integración y volver a crearlo cuando haga falta (con su decisión) |
| Aparecen sesiones activas del usuario tras la rotación | Quitar la dirección de red permitida de la lista de accesos o eliminar el usuario; revisar el registro de actividad; dejar el clúster sin acceso para ese usuario |
| Sospecha de que la contraseña quedó expuesta (pegada en el chat, en un archivo, en un volcado) | Rotar de inmediato, eliminar los archivos que la contengan, anotar el incidente sin copiar el valor |
| No se sabe si la rotación ocurrió | Considerar la contraseña expuesta. No usar el usuario; verificar por los métodos 1 y 2 |
| Resultado de la ejecución es `COMMIT_UNCERTAIN` o `CLOSE_FAILED` | Rotar igualmente. No limpiar restos ni repetir el ensayo; decidir en otra autorización cómo conciliar; el fence C.2A no se reinicia |

Nunca se debe «arreglar» una rotación fallida modificando roles de otros usuarios, `twosides_backend` ni `two_sides_db`.

## 8. Registrar el resultado sin guardar contraseñas

Anotar solo estos campos, a mano o en un documento, **sin** ningún valor secreto:

| Campo | Ejemplo de contenido permitido |
|---|---|
| Release y `executionId` | `c2-ba006dea…` y el id de 32 hex |
| Fecha y hora UTC del intento | Marca de tiempo |
| Código del resultado | `OK`, `CONNECTION_REJECTED`, `COMMIT_UNCERTAIN`, `CLOSE_FAILED`, etc. (de `result.json`) |
| Registro de consumo presente | Sí / No |
| Hora UTC de la rotación | Marca de tiempo |
| Método de verificación usado | Registro de actividad / hora de modificación / conexiones / prueba negativa autorizada |
| Contraseña anterior retirada del gestor | Sí / No |
| Observaciones | Texto libre sin secretos |

Está prohibido anotar: la contraseña antigua o nueva, parte de ellas, su longitud exacta, una pista de memoria, o capturas de pantalla donde aparezcan. `result.json` y `synthetic-plan.json` no contienen la contraseña, tokens ni claves; son los únicos archivos de ejecución que se conservan.

Guardar una copia del registro en un medio externo (correo o papel) para el control del riesgo R4.

## 9. Lista breve de comprobaciones manuales (aprobada)

Para marcar a mano el día de la rotación. Todo se hace desde su sesión de Atlas; nadie más ve ni recibe la contraseña. **Nada de esto se ha ejecutado.**

**A. Qué cuenta se rota**
- [ ] El usuario se llama exactamente `twosides_integration_test`; no `twosides_backend` ni ninguno administrativo.
- [ ] Clúster TwoSidesCluster, base de autenticación `admin`, autenticación por contraseña.
- [ ] Es el usuario cuyo rol está limitado a `two_sides_integration_test`. Si en pantalla hay dudas, detenerse.

**B. Cambio, solo desde Atlas**
- [ ] El cambio se hace únicamente en la consola de Atlas, editando ese usuario. No por mongosh, Compass, scripts, la API, el receptor ni el agente.
- [ ] La contraseña nueva es aleatoria, de un solo uso, y no la conoce nadie (o se retira del gestor al terminar).

**C. Sin registrar el secreto**
- [ ] No está en un archivo, en `.env`, en el historial de PowerShell, en un comando, en una URI, en un correo, en el chat ni en una captura.
- [ ] El portapapeles se vacía o sobrescribe tras usarla.
- [ ] La consola que lanzó el receptor se cierra; no se guarda su contenido.

**D. Comprobar el cambio con evidencias de Atlas**
- [ ] El registro de actividad de Atlas muestra la modificación del usuario con hora posterior al intento. Anotar la hora.
- [ ] La hora de última modificación del usuario en la consola cambió respecto de la línea base anotada antes de empezar.
- [ ] No quedan conexiones abiertas del usuario tras el cierre (si la consola ofrece esa vista).
- [ ] No se probó la contraseña antigua. La prueba negativa solo existe con autorización aparte.

**E. Documentar fecha, resultado y responsable** (sin secretos)
- [ ] Fecha y hora UTC de la rotación: ______  Responsable: ______
- [ ] Release y `executionId`: ______  Código de `result.json`: ______
- [ ] Verificación usada (actividad / hora de modificación / conexiones): ______
- [ ] Resultado de la rotación: correcto / fallido / incierto

**F. Si la rotación falla**
- [ ] Tratar la contraseña como expuesta; no reintentar con la antigua.
- [ ] Reintentar el cambio una vez; si persiste, eliminar el usuario de integración o quitar el acceso de red (decisión suya).
- [ ] No tocar `twosides_backend`, `two_sides_db` ni otros usuarios.
- [ ] Anotar el incidente sin copiar valores y avisar antes de cualquier otra ejecución. No hay nueva ejecución hasta resolverlo.

## 10. Lo que no se hizo en esta fase

No se accedió a ninguna credencial existente. No se pidió ninguna contraseña. No se conectó Atlas. No se cambiaron usuarios, permisos ni contraseñas. No se modificó `backend/.env`, SQLite, Godot, ACL ni propietarios. No se generó un manifiesto de activación. No se ejecutó C.2 ni F.2. B00 sigue sin resolver.
