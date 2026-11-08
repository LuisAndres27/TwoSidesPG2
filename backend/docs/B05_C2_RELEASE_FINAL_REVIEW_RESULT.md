# B05 C.2 — revisión final de release y referencia independiente

Fecha: 2026-10-29. **LISTO PARA REFERENCIA EXTERNA.** La candidata está técnicamente preparada para conservar su referencia; todavía no está autorizada una conexión real. B00 pendiente, C.2 sin ejecutar, F.2 bloqueada y B05.5 no iniciada.

## 1. Release e integridad

Ruta revisada:

```text
C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\c2-19dcfa4b88b64813a334cc8ef2cc48ea
```

Manifiesto SHA-256: `D4A5ED8A8C0C61FFD59F60B30EEB4B678BBA3FCC7A9B3E42651A8B0727AD2AF8`.

Verificador `package/scripts/c2-final-verify-reference.ps1`, SHA-256: `9A9BE545381CBFF315317CBA3769077BB2ADFE9C48EF572A178C28EA5796C77E`.

Se ejecutó el verificador de lectura antes y después de las pruebas seleccionadas: **PASS, 1.895 archivos**, inventario exacto y hashes coincidentes, `mode=offline-only`, `remoteEnabled=false`. Se comprueba también estructura, ausencia de redirecciones y hash de Node. `temp` y `runs` continúan vacíos. No se escribió en la candidata.

La release anterior `c2-67d95728399e4e30a406eba7301979fd` conserva los **2.779 objetos** de la instantánea previa: rutas, hashes, tamaños y fechas de modificación coinciden. Su manifiesto sigue siendo `8DCCBF599E7C93B94386668F752DA4F1CFD58F35D9DCA39BDCED5A418D3FB0AE`. No se modificaron esa copia ni su verificador.

## 2. Revisión acotada del código ejecutable

Se inspeccionaron el núcleo, entrada y lanzador C.2, `c2-release-integration.js`, `atlas-policy.js`, `atlas-integration.js`, transporte `atlas-credentials.js`, arnés `durable-revocation-atlas-harness.js`, supervisor `durable-revocation-runtime.js` y verificadores de referencia. La revisión se concentró en su composición y rutas de credenciales, activación, recursos y limpieza. Los ocho hashes del cambio permanecen documentados en B05_C2_FINAL_RELEASE_PREPARATION_RESULT.md y cubiertos por el manifiesto. No se repitió una auditoría general ni se reinstalaron dependencias.

| Control | Resultado y alcance |
|---|---|
| Destino | Host <cluster>.<id>.mongodb.net, usuario twosides_integration_test, base two_sides_integration_test, admin, DEFAULT y TLS estricto fijados en código y comprobados contra el cliente conectado. No hay argumentos para cambiar usuario, URI o base. |
| Producción | No se admite configurarse como twosides_backend ni acceder a two_sides_db. No se consulta .env. El receptor no puede conocer la procedencia de una contraseña que alguien teclee: debe introducirse exclusivamente la de integración. |
| Entorno | El lanzador rechaza variables peligrosas y borra el entorno heredado al crear Node; entrega exactamente ocho variables. El núcleo rechaza otras. No se heredan NODE_OPTIONS, NODE_PATH, NAPI_RS_*, configuración MongoDB, proxies o rutas de bibliotecas mediante esas variables. Esto no aísla frente a código ya comprometido en el proceso padre o la misma cuenta Windows. |
| Transporte | Entrada oculta, trama UTF-8 por stdin anónimo, sin contraseña en argumentos ni variables de entorno. Buffers controlados se limpian; no se afirma borrado de todas las copias en strings/driver. |
| Temporal | TEMP/TMP exactos dentro de la release, directorio vacío y normal; sin support/cachés fuera del payload. Se reserva el run antes del prompt; cancelar consume el intento. |
| Integridad en ejecución | El lanzador mantiene handles de lectura que impiden escribir/borrar los archivos verificados mientras ejecuta el hijo. Verifica inventario, Node y su firma antes del prompt. No elimina el riesgo previo a abrir el propio script ni equivale a aislamiento del sistema operativo. |
| Preflight | Identidad y permisos efectivos, catálogo sin filtro, esquema e índices C.2A exactos e inventario inicial/fence comprobados antes de registros sintéticos. autoIndex y autoCreate desactivados; no hay reprovisión en el recorrido C.2. |
| Supervisor | Mantiene tres clientes, cupos de sesiones explícitas/implícitas, dos trabajos de aplicación concurrentes, presupuestos de reintentos e I/O y 120 s globales con cierre reservado. Los límites acotan el cliente, no demuestran rollback de trabajo ya enviado al servidor. |
| Limpieza | Validación de propiedad e IDs, inventario exacto comparado nuevamente en transacción, deleteOne por documento sintético y conservación del fence, índices y estructuras anteriores. Incertidumbre o escrituras pendientes bloquean limpiar. |
| Resultados | Campos sanitizados, sin mensajes originales, URI completa, tokens o contraseña. Plan de IDs sintéticos para conciliación; las discrepancias fallan cerradas. |

**No se identificó un defecto crítico nuevo en el recorrido revisado.** No se modificó código de la release ni se habilitaron capacidades durante esta revisión. Los riesgos de la cuenta Windows, dependencias y sustitución anterior al control son residuales conocidos; no evidencia de una explotación ocurrida.

## 3. Tres barreras de activación actuales

1. **Manifiesto:** el lanzador y núcleo exigen versión 2, c2-remote-once, permiso explícito, destino/escenarios exactos, digest y ventana positiva de máximo cuatro horas. El manifiesto conservado es versión 1 offline-only y no pasa antes de leer stdin.
2. **Política de integración:** configuración estricta con destino y ámbito C.2A fijados, comprobación del cliente y permisos efectivos. Una configuración distinta se rechaza. La capacidad C.2 existe en el código desde la preparación anterior; no es correcto afirmar que permanece ausente.
3. **Permiso opaco del arnés:** la composición exige una activación válida y emite un permiso ligado al executionId y vencimiento. execute sin ese permiso falla. Marcadores exclusivos, resultado existente y estado de uso de la composición impiden reutilizar el intento normal.

No son tres barreras de código ausente: la fábrica real y el ejecutor ya están instalados detrás de estas validaciones. Tampoco protegen contra un atacante que pueda reescribir todo el programa o borrar los marcadores con los permisos de la misma cuenta; esa limitación forma parte de B00. No se creó un manifiesto remoto ni se activó el receptor.

## 4. Pruebas offline necesarias

Selección ejecutada: **9 aprobadas, 34 fuera de selección**, sin repetir las 104 aprobadas de la fase anterior:

- RX01: manifiesto offline rechaza antes de consumir stdin o reclamar run.
- RX04: rechazo de variables fuera del entorno permitido.
- RX06: rechazo de reutilización sin tocar el resultado previo.
- RX09 y FR02: falta de permiso/activación impide conectar.
- RX11: commit incierto bloquea limpieza.
- FR04: fence inicial inesperado detiene antes de registrar/escribir.
- FR05: temporal exacto/vacío y rechazo de residuos externos.
- CP04: alteración del payload rechazada antes de ejecutar; restauración exacta en la copia desechable.

Archivos seleccionados: `c2-receiver.test.js`, `c2-final-release.test.js` y `c2-windows-runtime-preparation.test.js`; filtro `^(RX01 |RX04 |RX06 |RX09 |RX11 |FR02 |FR04 |FR05 |CP04 )`. Se utilizó el guard de entorno de pruebas y dobles; no hubo red. Las entradas son ficticias: no se entregó ningún secreto real al receptor.

CP04 se ejecutó únicamente sobre `C2Runtime/c2-9168a4248ca368ace2d22ec1fac77968`, copia nueva marcada y luego eliminada con comprobación de ruta y ausencia de enlaces. Los otros fixtures mutables usaron `backend/.work/c2-final-review-offline`. Ninguna prueba mutable se dirigió a las dos releases conservadas. A36 y auxiliares históricos de auditoría ACL no se ejecutaron. No se repitieron pruebas interactivas; sus dos PASS comunicados por el usuario siguen registrados como tales.

## 5. Paquete de referencia preparado

Ubicación local, sin sobrescribir respaldos:

```text
backend/docs/c2-reference/c2-19dcfa4b88b64813a334cc8ef2cc48ea-20261029T203514Z/
```

Contiene solamente cinco archivos: `manifest.json` copiado byte a byte, `manifest.sha256.txt`, `verifier.sha256.txt`, `reference.json` con identificador/ruta/fecha y `INSTRUCCIONES.md`. Generación: **2026-10-29T20:35:14.271Z**. La copia del manifiesto coincide exactamente con el original. No contiene .env, contraseñas, claves privadas, bases de datos ni contenidos de módulos.

Todavía **no es una referencia independiente**: se encuentra en este equipo y dentro del árbol OneDrive. No se subió nada automáticamente. El respaldo C:\TwoSides_Backup_Integridad tampoco constituye independencia.

El usuario debe subir manualmente los cinco archivos a almacenamiento en nube bajo su control, conservar su versión y recuperarlos desde allí para comprobar la referencia. Una carpeta sincronizada y modificable por la misma sesión no debe ser la única protección frente a sustitución; conviene separar acceso y conservar historial. Las instrucciones incluyen el comando de lectura que toma el digest descargado, verifica el manifiesto externo y el hash del verificador y compara los 1.895 archivos locales.

**Diferencia documental aclarada:** `c2-verify-reference.ps1` está fijado a la release anterior; usarlo con el digest nuevo produciría un rechazo. No se modificó para aparentar compatibilidad. El procedimiento para esta candidata utiliza el sucesor ya existente `c2-final-verify-reference.ps1`, con el hash indicado arriba. No hace falta reconstruir un componente.

La referencia externa acredita continuidad del estado conservado desde ese momento; no demuestra procedencia histórica, privacidad absoluta ni ausencia de compromiso previo.

## 6. Riesgo residual y pasos mínimos del usuario

El usuario limitado de Atlas reduce el alcance a la base de integración, siempre sujeto a verificar sus permisos efectivos en la futura sesión. Si se roba su contraseña, un tercero podría operar con sus permisos sobre esa base, aunque los datos sean sintéticos. Aceptar pérdida de datos no elimina ese riesgo. El entorno Windows y las dependencias pueden conservar o exponer copias de la contraseña en memoria hasta finalizar el proceso; no se promete eliminación completa. No se investigaron nuevamente los SID ni se declaró B00 resuelta.

Antes de autorizar una ejecución real, corresponde al usuario:

1. Guardar y recuperar el paquete externo; ejecutar su verificación de lectura y conservar el digest/versión fuera del control de escritura del mismo recorrido local.
2. Aceptar expresamente los riesgos residuales documentados y definir una credencial de integración de vida acotada, con rotación posterior, sin comunicarla por chat.
3. Autorizar por separado una única ejecución C.2 con sus límites y limpieza. Solo después podrá prepararse una activación nueva, vinculada a un run, ventana y digest revisados. Ese manifiesto tendría otro hash y requeriría preservar la nueva referencia antes de recibir secretos; el digest offline actual no autoriza una activación modificada.

Se conservarán las verificaciones de integridad, entorno, uso único, permisos e inventario. Un objeto inesperado o commit incierto detiene la operación, sin reprovisión, limpieza amplia ni reintentos automáticos.

**No existe un defecto nuevo demostrado que exija abrir otra fase diagnóstica.** Falta realizar y acreditar el paso externo y obtener la autorización independiente; esta fase no concede esa autorización.

## 7. Detención

No se accedió a backend/.env ni SQLite, ni se modificaron Godot, ACL, propietarios, usuarios Atlas o bases remotas. No se solicitaron contraseñas, conectó Atlas, ejecutó C.2/F.2, creó activación remota ni inició B05.5. No hubo instalación de dependencias ni cambios en las releases conservadas.

**LISTO PARA REFERENCIA EXTERNA. Detenido antes de toda activación remota. B00 continúa pendiente.**
