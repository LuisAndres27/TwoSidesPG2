# B00.1 — Plan de seguridad del entorno de credenciales Atlas

2026-10-29, America/Guatemala. **DIAGNÓSTICO DOCUMENTAL Y PROPUESTA COMPLETADOS. CANAL C.2 TODAVÍA NO CERTIFICADO.** Esta fase no autoriza ni ejecuta inspecciones de permisos, cambios de ACL/propietario, creación de canal, pruebas, contraseñas o conexiones Atlas. C.2/F.2 permanecen bloqueadas; B00 pendiente; B05.5 no iniciada.

## 1. Fuentes y alcance de esta revisión

Revisados los cinco documentos exigidos: B05_DURABLE_REVOCATION_C2B_CHANNEL_PREFLIGHT, B05_DURABLE_REVOCATION_ATLAS_SCHEMA_RESULT, B05_B00_ACL_DIAGNOSIS, B05_B00_ACL_CHANGE_PROPOSAL y B05_B00_ACL_PREFLIGHT_REPORT. Se contrastaron con el lanzador/receptor C.2A, atlas-credentials.js, atlas-integration.js y el conector Mongoose. Se leyó el manifiesto no secreto del canal consumido para conocer sus 45 rutas declaradas, sin consultar sus permisos.

Se resolvieron **solo los nombres de ejecutables**, sin ejecutarlos: node.exe aparece en C:\Program Files\nodejs\node.exe y powershell.exe en C:\windows\System32\WindowsPowerShell\v1.0\powershell.exe. Son rutas léxicas actuales de resolución, no una certificación de destino final, firma, propietario, token o integridad. No se consultaron ACL, propietarios, grupos o tokens actuales.

No se leyó el respaldo binario/JSONL de descriptores de B05.2B.2A: su contenido de seguridad no se necesita para esta planificación. Los datos ACL citados a continuación proceden exclusivamente de los informes históricos autorizados para lectura.

## 2. Hechos confirmados y puntos no verificados

| Hecho documentado o comprobado en código | Interpretación limitada |
|---|---|
| Dos Allow explícitas Modify/Synchronize en la raíz del proyecto, observadas en las auditorías anteriores; heredadas por código/dependencias de la copia | Riesgo B00 histórico. No se comprobó su presencia actual ni una cuenta activa que las utilice |
| C.2A ejecutó el esquema 8/5/1 y cerró la conexión | No demuestra privacidad Windows, revocación durable o protección de un paquete nuevo |
| C.2B se detuvo sin crear receptor | No hay un canal C.2B que se pueda activar, verificar o reutilizar |
| Receptor/lanzador privados, pero imports del receptor desde el proyecto | La frontera de confianza incluye también las fuentes y dependencias del proyecto |
| El manifiesto consumido enumera 45 archivos: fuentes, suite, guarda y package/lockfile | No incluye los bytes de todo node_modules, ejecutables o bibliotecas nativas cargadas |
| Verificación mediante hash seguida de import/ejecución por ruta | Existe una ventana de sustitución entre comprobación y uso; no se demostró una barrera que la cierre |
| Entrada oculta y stdin/RAM, sin credenciales intencionalmente escritas a archivos | Reduce persistencia del secreto; no certifica el entorno que ejecuta el código |
| Históricamente se verificó privacidad de carpetas AppData para respaldos/fixtures | Esa fotografía no certifica los directorios/código actuales del canal futuro |
| Batería histórica contenía private-workspace.ps1 con consultas ACL | Fue una incidencia de selección de pruebas; no fue una modificación de permisos ni evidencia de filtración |

No verificados ahora: DACL/propietario/herencia actuales; identidades/grupos efectivos del proceso futuro; permisos de reemplazo desde ancestros; destinos finales y enlaces actuales; capacidad de modificar binarios/módulos instalados; estado del código tras los hashes anteriores; políticas de dumps, acceso a memoria o persistencia del sistema. No hay evidencia nueva de compromiso, filtración o uso malicioso de los SID.

## 3. Relación con B00 original

Los informes identifican estos dos SID, sin resolver su identidad o necesidad:

- A: S-1-5-21-452213140-3335518246-3718727391-3248334987.
- B: S-1-5-21-307222809-3929607348-3502628415-466486063.

Ambas concesiones históricas: Allow explícita en la raíz de la copia, máscara 0x001301BF, ObjectInherit/ContainerInherit y Propagation=None. Los informes también registran cuatro Deny específicas en .git, que no se deben confundir con concesiones ni retirar indiscriminadamente. Principales no resueltos no equivalen a atacantes o cuentas eliminadas.

Los registros sitúan el origen en la raíz del proyecto; no documentan que esa herencia llegue a AppData, que pertenece a otra rama. Sin embargo, un receptor situado en AppData **sigue expuesto a los permisos del proyecto si importa código desde él**. Ese es el vínculo práctico entre B00 y el canal.

La propuesta antigua de retirar dos Allow en la raíz propagaba cambios a numerosos descendientes, incluidos recursos actualmente protegidos. No queda autorizada por este plan. El respaldo histórico y su ensayo de restauración sobre tres objetos sintéticos no son un permiso de corrección ni garantía de restauración global actual.

## 4. Frontera de confianza y amenaza que debe acordarse

Se propone proteger el secreto frente a otros principales locales sin autorización, escritores del proyecto o del paquete y sustitución de rutas/componentes durante una ejecución. Deben estar protegidos código, intérprete, dependencias, configuración, manifiesto, entrada de credenciales y resultados.

Una ACL por usuario no distingue automáticamente dos programas que ejecutan con la misma identidad. Un proceso malicioso bajo la cuenta autorizada, administrador/SYSTEM comprometido, depurador privilegiado o sistema operativo comprometido requieren controles adicionales; no se promete aislamiento frente a ellos. La certificación futura debe expresar esta frontera y las identidades de mantenimiento confiables. Si se exige separación respecto de otras herramientas de la misma cuenta, la opción fuerte es una identidad de ejecución distinta, no administrativa, o un entorno de ensayo administrado separado; no se crea ninguno ahora.

## 5. Objetos exactos que necesitarían inspección posterior

Abreviaturas para evitar ambigüedad:

- P = C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA.
- L = C:\Users\luis2\AppData\Local\TwoSides.
- R = L\AtlasIntegrationTests\b054c2c-10ef4f6d653f4ee4a1d1b2e6591013c2, canal consumido usado solo como referencia.

La autorización posterior debe usar una **lista cerrada de rutas individuales**, no Get-ChildItem/Get-Acl recursivos ni un escaneo de todo el perfil/proyecto. Para cada archivo aprobado se añaden solamente sus directorios padres necesarios, deduplicados. No se abre .env, ninguna SQLite o sus sidecars, Godot o .git.

| Grupo de objetos a autorizar | Objetos concretos y motivo de cada consulta |
|---|---|
| Ancestros privados | C:\; C:\Users; C:\Users\luis2; C:\Users\luis2\AppData; C:\Users\luis2\AppData\Local; L; L\AtlasIntegrationTests. Evaluar traversía, herencia y capacidad de renombrar/reemplazar hijos desde el padre |
| Directorio de referencia | R, solo sus metadatos de seguridad; conocer el estado del emplazamiento anterior, sin adoptarlo como canal nuevo |
| Seis artefactos de referencia | R\atlas-revocation-schema-receiver.js; R\send-atlas-schema-credential.ps1; R\schema-preflight-manifest.json; R\schema-attempt.started; R\schema-progress.jsonl; R\schema-result.json. Evaluar modificación, reemplazo y falsificación de código/estado. No ejecutarlos ni leer secretos |
| Cadena de la copia del proyecto | C:\Users\luis2\OneDrive; C:\Users\luis2\OneDrive\Desktop; C:\Users\luis2\OneDrive\Desktop\PRUEBA; C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA; P; P\backend. Cada objeto se consulta individualmente para atribuir herencia y reemplazo; no se enumeran sus otros hijos |
| Padres de fuentes aprobadas | P\backend\scripts; P\backend\src; sus directorios config, middleware, modules, modules\auth, modules\identity, modules\sync y utils; P\backend\tests y tests\jwt. Justificar la ruta efectiva y la herencia de los archivos enumerados abajo |
| Fuentes/guardas/manifiestos | Los 45 archivos explícitos del manifiesto C.2A, listados por grupos en el apartado 6. Sirven para delimitar el código que dependía del proyecto, sin tocar archivos protegidos |
| Arnés de carreras existente | P\backend\scripts\durable-revocation-atlas-harness.js y su padre ya incluido. Evaluar el código que necesitará el futuro paquete C.2 |
| Dependencias instaladas | P\backend\node_modules; P\backend\node_modules\mongoose; P\backend\node_modules\mongodb; P\backend\node_modules\jose; P\backend\node_modules\zod; P\backend\node_modules\@node-rs; P\backend\node_modules\@node-rs\argon2. Añadir solo archivos/transitivas y módulos nativos de una lista de carga offline aprobada, con sus padres. El lockfile no es un inventario de bytes instalado. No autorizar lectura recursiva ilimitada por anticipado |
| Node instalado | C:\Program Files; C:\Program Files\nodejs; C:\Program Files\nodejs\node.exe. Justificar protección del intérprete. Sus bibliotecas cargadas se añadirán nominalmente al inventario futuro si procede |
| PowerShell instalado | C:\windows; C:\windows\System32; C:\windows\System32\WindowsPowerShell; C:\windows\System32\WindowsPowerShell\v1.0; C:\windows\System32\WindowsPowerShell\v1.0\powershell.exe. Justificar intérprete y resolución sin PATH ambiguo; solo esos objetos, no todo Windows |
| Futuro paquete aislado | Ruta **a fijar antes de autorizar su creación**, con directorios separados de código y salida. No existe en esta fase; no se inventa una ruta inspeccionada. Se inspeccionará su padre antes de crear y los objetos nuevos después, bajo autorización propia |

Una raíz de paquete node_modules no permite certificar automáticamente todos sus archivos: puede haber ACE explícitas, enlaces o componentes dinámicos. Primero debe producirse una lista finita del cierre real de dependencias en una preparación offline autorizada; luego aprobarse esa lista para consultas individuales. Un objeto que falte, cambie de identidad o requiera ampliar rutas detiene la inspección. El alcance no incluye las bases históricas bajo ReconstructionTests ni el respaldo ACL de 27 MB.

## 6. Lista documental de las 45 fuentes de referencia

Rutas relativas a P. Se obtuvieron del manifiesto no secreto leído, **no mediante consultas ACL**:

| Padre | Archivos individuales |
|---|---|
| backend | package.json; package-lock.json |
| backend/scripts | atlas-revocation-schema-suite.js |
| backend/src | app.js; server.js |
| backend/src/config | jwt.js; server.js |
| backend/src/middleware | authentication.js; authorization.js; rate-limiter.js; security.js; sync-auth-context.js |
| backend/src/modules/auth | auth-service.js; credential-hasher.js; identity-repository.js; jwt-schemas.js; jwt-service.js; memory-repository.js; mongo-identity-models.js; mongo-identity-repository.js |
| backend/src/modules/identity | identity.js |
| backend/src/modules/sync | atlas-credentials.js; atlas-error-diagnostic.js; atlas-integration.js; atlas-listcollections-probe.js; atlas-namespace-preflight.js; atlas-policy.js; atlas-readonly-connector.js; atlas-readonly-probe.js; atlas-unfiltered-collections-probe.js; budget.js; canonical-envelope.js; errors.js; ingestion-engine.js; ingestion-repository.js; ingestion-service.js; mongo-authorization-fence.js; mongo-ingestion-repository.js; mongo-models.js; relations.js; routes.js; schemas.js |
| backend/src/utils | errors.js; work-pool.js |
| backend/tests/jwt | env-guard.js |

Esta lista histórica no define por sí sola el paquete mínimo futuro: contiene fuentes que C.2 podría no necesitar y excluye dependencias instaladas. El cierre de carga del arnés futuro debe justificarse, no copiar indiscriminadamente todo el proyecto o node_modules.

## 7. Permisos mínimos esperados y accesos que evaluar

Windows diferencia derechos sobre datos, ejecución, eliminación y seguridad. Deben evaluarse tanto archivo como directorios padres: un permiso de borrado de hijos en el padre puede permitir sustituir un archivo aunque su DACL individual parezca restrictiva. El propietario y la capacidad de cambiar DACL también importan; un listado de Allow no equivale a una prueba completa de acceso efectivo. Base técnica: [Microsoft, derechos de acceso a archivos](https://learn.microsoft.com/en-us/windows/win32/fileio/file-security-and-access-rights).

| Identidad/objeto | Necesidad propuesta | Derechos que no necesita para ejecutar el ensayo |
|---|---|---|
| Usuario legítimo como operador | Leer/verificar el paquete aprobado e iniciar una ejecución autorizada; acceder a la entrada oculta y leer resultados propios | Administración Windows/Atlas, modificar usuarios, leer .env/SQLite, cambiar DACL del proyecto |
| Identidad no elevada de PowerShell/Node | Lectura/ejecución y traversía del código/binarios; lectura de configuración/manifiesto no secreto; uso de handles de stdin; salida controlada en directorio dedicado | Escritura, append, delete, cambio de propietario/DACL sobre código, intérpretes o dependencias |
| Proceso sobre salida/journal/marcador | Crear exclusivamente archivos propios de un run, append del journal y escritura del resultado; limpieza local solo si se autoriza | Modificar fuentes, otros runs, respaldos, partidas o estructuras Atlas ajenas |
| Identidad de despliegue/mantenimiento confiable | Publicar/verificar una versión antes de usar secretos; administrar su seguridad según autorización | Permanecer escribiendo el paquete mientras la identidad de ejecución lo utiliza |
| SYSTEM/Administradores de mantenimiento | Tratamiento explícito como identidades confiables del sistema; preservar lo necesario tras inspección | Ejecutar el ensayo elevado o conceder privilegios nuevos por comodidad |
| Otros usuarios/grupos/principales no justificados | Ningún acceso al secreto o a su proveedor; ningún permiso de modificar/reemplazar código o estado del canal | Modify, WriteData/AppendData, Delete, DeleteChild, WriteDac o WriteOwner sobre esa frontera |

La lectura pública de código sin secretos no demuestra por sí sola exposición de una contraseña; la capacidad de escritura/reemplazo es una amenaza de integridad distinta. Para un directorio definido como privado deben comprobarse además sus accesos de lectura, según la política aprobada. No se eliminarán automáticamente ACE de Users/Everyone, entradas heredadas o SID no resueltos sin analizar su aplicabilidad y necesidad.

Godot, IDE, build y OneDrive no necesitan acceso a la contraseña Atlas del ensayo. Las aplicaciones usan identidades/tokens: no se inventará una ACE por nombre de aplicación ni se supondrá que un token restringido tiene el mismo acceso que otro proceso del usuario.

## 8. Procedimiento futuro de inspección acotada — NO EJECUTADO

Propuesta de una autorización posterior exclusivamente de lectura:

1. Aprobar la lista nominal del apartado 5 y el manifiesto finito de dependencias. Excluir explícitamente .env, SQLite, Godot, .git y otros archivos personales. Si falta el cierre de dependencias, la inspección inicial se limita a los objetos ya enumerados y no certifica todavía el canal.
2. Autorizar consulta del token **del propio proceso**: usuario/grupos habilitados/restringidos, nivel de integridad y elevación. Sin impersonación, búsquedas de cuentas externas o inspección de memoria/comandos de otros procesos.
3. Leer únicamente metadatos de cada ruta aprobada: tipo, atributos/reparse tag, identidad volumen+FileId, número de enlaces y ruta final por handle. No seguir enlaces a un destino nuevo sin revisar/autorizar su inclusión. OneDrive puede usar reparse points de proveedor: no confundirlos con un symlink malicioso; la propuesta elimina esa dependencia del entorno de ejecución.
4. Si se autoriza expresamente, consultar DACL/propietario/grupo y flags de herencia/protección de cada objeto de la lista, mediante APIs de lectura o Get-Acl literal sin recursión. Registrar SID, Allow/Deny, máscara, origen explícito/heredado y propagación. No solicitar SACL/auditoría, cambiar privilegios, abrir con WRITE_DAC/WRITE_OWNER o ensayar escrituras sobre objetos reales.
5. Comparar archivo y padres: lectura de datos, escritura/append, creación de hijos, borrado/renombrado, sustitución, cambio de seguridad y derechos del propietario. Distinguir ACE potencialmente aplicables al token de acceso efectivo; no probar otra cuenta. Si hiciera falta AccessCheck sobre el token propio, incluirlo en esa autorización y mantenerlo sin mutaciones.
6. Traducir SID solo mediante métodos locales autorizados cuando sea necesario; un SID no resuelto se registra así. No inferir que es eliminado o malicioso. No ejecutar un corrector de ACL como parte del inspector.
7. Repetir la captura acotada para detectar cambios durante la observación. Una coincidencia es evidencia de estabilidad observada, no protección continua; para ejecutar deben mantenerse las barreras del apartado 10.
8. Emitir un informe sin secretos con hallazgos, diferencias y rutas exactas. Ante permisos insuficientes, destino inesperado, múltiples enlaces, escritor no explicado o imposibilidad de verificar un objeto: detenerse y no elevar privilegios automáticamente.

La lectura de DACL/propietario necesita permisos de consulta de seguridad; los metadatos de atributos/ruta son otra categoría. La autorización debe separarlas para no repetir la incidencia de ejecutar un auxiliar que realiza consultas adicionales. No se presenta un comando operativo de inspección en esta fase: no debe confundirse el plan con permiso para ejecutarlo.

## 9. Evaluación de soluciones A–G

| Alternativa | Propuesta verificable | Límite/decisión |
|---|---|---|
| A. Directorio fuera del proyecto/OneDrive | Paquete versionado completo de código y dependencias; salida en otro subdirectorio; sin imports, caches o módulos ejecutables desde el proyecto | LOCALAPPDATA es solo una ubicación. Requiere verificar ancestros, DACL, propietario y carga real del paquete |
| B. Permisos mínimos | Lectura/ejecución para runtime; despliegue separado de ejecución; salida limitada al run; ningún acceso adicional no justificado | Si ya se cumplen no hace falta modificar permisos. Si no, proponer un cambio preciso sobre objetos nuevos/aislados, bajo otra autorización |
| C. Integridad | Revisar procedencia del código, cierre de dependencias y versiones; manifiesto de bytes reales, binarios y módulos nativos; ancla de confianza fuera del ámbito modificable | Hash y manifiesto editables por el mismo adversario no autentican procedencia. package-lock no verifica por sí solo el contenido instalado |
| D. Sustitución tras verificar | Proteger paquete/padres y mantener handles/controles de identidad durante el uso; impedir cargas fuera de la versión aprobada | La comprobación por ruta seguida de import no basta; hay que probar la barrera con sustituciones sintéticas autorizadas |
| E. Cuenta mínima | Ejecutar con token no elevado. Si se necesita separar otros programas del mismo usuario, evaluar identidad no administrativa o entorno aislado administrado | No se crea cuenta, se eleva Node o se cambia el usuario de Atlas en esta fase |
| F. Ciclo del secreto | Obtenerlo solo tras aprobar el paquete; stdin/RAM, sin fichero/entorno/argv/logs, tiempo limitado, cierre y limpieza verificables | El código que lo recibe necesariamente ve el secreto en memoria; GC, dumps y proceso comprometido limitan garantías absolutas |
| G. Proveedor estándar | Evaluar Windows Credential UI/Credential Manager con proveedor de ejecución confiable, o entorno de ensayo administrado con proveedor estándar de secretos | Reduce código personalizado de captura/custodia, pero no arregla un receptor/dependencias alterables; integración con Mongoose debe probarse sin credenciales reales |

Recomendación: inspección acotada autorizada primero; después preferir A+C+D+E con runtime íntegro y F. No basta proteger solo el receptor si este sigue importando desde P. La opción G es preferible cuando permite eliminar el bridge personalizado y su custodia con una implementación estándar revisada; no se presupone que esté integrada o instalada.

Credential Management proporciona APIs/UI estándar para obtener/gestionar credenciales; su mera disponibilidad no certifica este diseño. [Microsoft, Credentials Management](https://learn.microsoft.com/en-us/windows/win32/secauthn/credentials-management). Si se evalúa DPAPI para un almacén futuro, considerar su alcance de usuario/equipo: no impide que código comprometido bajo la identidad autorizada acceda al secreto después de descifrarlo. No se cifra/persiste un secreto aquí ni se crea una clave. [Microsoft, CryptProtectData](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata).

Compass o un cliente CLI pueden verificar su propia conexión, pero no sustituyen una validación del adaptador Mongoose. Una alternativa que los use debe mantener esa distinción. No se propone desplegar AWS, cambiar autenticación Atlas o suponer disponibilidad de mecanismos sin contraseña en el clúster Free; cualquier variante necesita evaluación y autorización propias.

## 10. Diseño de aislamiento y controles durante la ejecución

**Paquete:** publicar desde fuentes revisadas y estables un artefacto versionado fuera de P y OneDrive, con intérprete fijado, fuentes necesarias, dependencias transitivas/nativas y configuración no secreta. Aprobar su procedencia antes de copiarlo; un hash calculado sobre código ya alterado solo preserva esos bytes. Ninguna descarga, instalación, script npm, autoupdate, resolución desde el directorio de trabajo o fallback al proyecto durante el ensayo.

**Separación:** el runtime no debe poder modificar su paquete. El directorio de resultados debe permitir solo el estado propio y no participar en resolución de módulos/DLL/código. Si el runtime es también propietario capaz de cambiar DACL, no afirmar aislamiento frente a esa misma identidad; usar una frontera de despliegue/ejecución real o expresar el alcance limitado de confianza.

**Archivos/rutas:** abrir por rutas absolutas aprobadas y verificar identidad por handle, ruta final, enlaces y pertenencia al volumen/directorio esperado. Mantener protección de padres y del archivo durante el uso. Evaluar handles abiertos sin compartir escritura/borrado para los objetos necesarios; si existe un acceso incompatible, detenerse. No afirmar que un handle de archivo protege automáticamente todos sus ancestros, mappings, dependencias o un nuevo import por otra ruta. La implementación de Node y el método de publicación deberán probar esa compatibilidad antes de aceptar secretos.

[CreateFileW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew) documenta modos de compartición y su compatibilidad con handles abiertos. [GetFinalPathNameByHandleW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfinalpathnamebyhandlew) permite consultar la ruta final del objeto abierto. Esas herramientas forman parte de una propuesta; no se invocaron ahora.

**Enlaces:** atributos/reparse y nlink son controles iniciales, no prueba de identidad permanente. Rechazar sustitución del objeto/ancestro entre validaciones; resolver reparse tags y hardlinks con alcance autorizado y no reutilizar una ruta porque su texto coincida. [Microsoft, reparse points](https://learn.microsoft.com/en-us/windows/win32/fileio/reparse-points).

**Carga y procesos:** fijar C:\Program Files\nodejs\node.exe y la ruta PowerShell solo después de verificar destinos/firmas/integridad. No usar PATH sin resolver, perfiles, NODE_OPTIONS, NODE_PATH, loaders o preloads heredados, ni instalar paquetes al activar. Mantener entorno mínimo, cwd controlado y handles heredados explícitamente limitados. La resolución de DLL también cuenta: una ruta absoluta del primer módulo no controla por sí sola todas sus dependencias. [Microsoft, orden de búsqueda de DLL](https://learn.microsoft.com/en-us/windows/win32/dlls/dynamic-link-library-search-order).

**Estado y límites:** marcador exclusivo antes de consumir un secreto, manifiesto del run vinculado a destino/paquete, no reutilización, rechazo de resultados previos, timeout efectivo de I/O y supervisor, drenaje de tareas propias y cierre ordenado. Un fallo o cambio detectado invalida la ejecución y evita nuevos envíos; no levantar el bloqueo por un booleano. El canal C.2A permanece consumido.

## 11. Comprobación del ciclo de vida de credenciales

Plan de comprobación futura, exclusivamente con canarios sintéticos y autorización de pruebas:

1. Revisar el código de captura/encuadre UTF-8, límites, ausencia de recortes y cleanup BSTR/buffers. No probar contraseñas de usuario.
2. Registrar los puntos de adquisición, transferencia, conversión a string/opciones del driver y destrucción. El secreto no debe entrar en PowerShell history, argv, entorno, URI con credenciales, JSON de configuración o variables de diagnóstico serializadas.
3. Ejecutar un harness doblado con canario por stdin, sin Atlas; inventariar solo sus archivos de salida previstos y comprobar que no contengan canario, tokens o opciones completas. Verificar stdout/stderr y todas las rutas de error/cancelación, sin imprimir el canario encontrado.
4. Comprobar uso único, credencial ausente/inválida, paquete alterado, enlace/cambio de FileId y destino incorrecto. Toda precondición fallida debe rechazar antes del prompt/consumo y de cualquier conexión, según su etapa.
5. Cerrar conexión/streams/proceso, limpiar buffers y referencias bajo control de la aplicación. No prometer borrado perfecto de strings inmutables o de copias internas del driver.
6. Declarar el alcance de la comprobación: artefactos previstos del harness. No afirmar ausencia absoluta en pagefile, crash dumps, telemetría del sistema o memoria de terceros sin una evaluación específica. No buscar secretos en Compass, historial, procesos ajenos o todo el perfil para suplir esa falta de evidencia.

El secreto de Atlas debe pertenecer al usuario de integración autorizado y al destino fijo, con privilegios suficientes solo para el ensayo aprobado. No usar administrador ni twosides_backend. Una futura evaluación de permisos Atlas más limitados no autoriza ahora cambios de usuarios/roles. C.2 sin DDL debe conservar el esquema C.2A y su alcance aprobado.

## 12. Posibles cambios de ACL — solo propuestas

La inspección puede demostrar que los permisos del emplazamiento aislado ya son adecuados; en ese caso, **no hace falta cambiar ACL**. La certificación dependerá además del paquete, runtime y controles durante ejecución.

Si hay diferencias, la propuesta mínima preferida es corregir únicamente el futuro entorno aislado y sus objetos aprobados: mantener administrador de despliegue/owner confiable, runtime con RX, escritura solo en resultados y concesiones del sistema justificadas. Enumerar las ACE y su origen/efecto exactos antes de cualquier aprobación. Separar cualquier cambio de herencia, propietario o identidad de ejecución; no tratarlos como consecuencias implícitas de quitar un SID.

No retirar en esta fase las dos Allow de P, resetear ACL, quitar todas las heredadas, deshabilitar OneDrive, modificar las Deny de .git o propagar cambios hacia SQLite/Godot. Corregir B00 en la raíz exigiría inventario/backup y autorización de impacto propios; no es requisito automático si se consigue un runtime realmente independiente, pero el riesgo del proyecto seguirá abierto.

## 13. Recuperación y respuesta a fallos

Ante modificación de paquete, identidad/ruta inesperada, permisos no verificables o fallo de integridad: detener antes de aceptar credenciales; conservar únicamente evidencias no secretas. No ejecutar desde un paquete anterior por fallback ni reactivar un marcador consumido.

Si el secreto ya entró en un entorno cuya integridad queda en duda, clasificar exposición como posible/no determinada según evidencia; cerrar/drenar el proceso y comunicarlo. No declarar que el borrado del directorio revierte una exposición. Cualquier rotación/revocación de credenciales reales necesita instrucción independiente; no se realiza automáticamente.

Antes de un futuro cambio ACL autorizado, capturar un respaldo **nuevo y acotado** de DACL/owner/flags/identidad de los objetos que se modificarán, en ubicación y con privacidad aprobadas. Verificar reconstrucción y ensayo sintético bajo autorización propia; no reutilizar a ciegas el respaldo histórico del árbol completo. Restaurar solo diferencias del cambio autorizado después de comprobar FileId/ruta y ausencia de cambios concurrentes; sin takeown, reset global o restauración de contenidos/fechas. Owner/SACL/herencia solo si estuvieran expresamente incluidos en esa futura autorización.

Un fallo remoto futuro con commit incierto no autoriza limpiar datos o repetir la carrera: conservar IDs/resultados seguros y solicitar la instrucción pertinente. En B00.1 no hay conexiones, secretos recibidos, cambios ACL o datos que restaurar.

## 14. Condiciones para certificar y continuar C.2

La siguiente autorización recomendada es **solo inspección acotada de lectura** de las rutas/identidad propias definidas, con exclusiones expresas y sin credenciales, red, canales nuevos o modificaciones. Su informe debe separar hechos actuales de los antecedentes B00.

Antes de certificar un canal deberán cumplirse todos estos puntos:

- Frontera de amenaza e identidades confiables aprobadas; runtime no elevado y derechos mínimos verificables.
- Privacidad/control de modificación de archivos **y ancestros** acreditados mediante inspección autorizada vigente o garantía equivalente específicamente verificada; LOCALAPPDATA/hash/stdin por separado no bastan.
- Paquete completo con procedencia y dependencias instaladas/binarios/nativos incluidos en la verificación; ningún import ejecutable desde el proyecto mutable.
- Barrera de sustitución mantenida durante ejecución y probada con alteraciones/enlaces sintéticos, no solo dos hashes antes/después.
- Destino Atlas fijo, manifiesto y marcador nuevos, límites/cierre, diagnósticos seguros y pruebas de ciclo de vida sin credenciales reales.
- Selección cerrada de pruebas sin private-workspace.ps1 u otras consultas no autorizadas. No ejecutar la batería completa por comodidad; no modificar el auxiliar para ocultar su comportamiento.
- Revisión de C.2 para usar exclusivamente el esquema existente C.2A, con preflight/identidades/limpieza del ensayo acotados. La provisión del esquema no valida las carreras.

Si algún punto no puede demostrarse, mantener el canal NO APTO y no pedir contraseñas. Resolver condiciones de este entorno no cierra automáticamente B00 original ni habilita F.2. Una futura activación C.2 requerirá autorización independiente y manual; B05.5 seguirá fuera de alcance.

## 15. Cierre de esta fase

Única escritura: este documento. No se ejecutaron Get-Acl, icacls, consultas de propietario/token, inspecciones recursivas, APIs de seguridad, tests, receptores o servidores. No se crearon carpetas/cuentas/canales, copiaron paquetes o modificaron ACL/owner. No se accedió a backend/.env, bases SQLite protegidas, Godot, secretos Compass, proyecto original o MongoDB Atlas. No se recalcularon hashes de archivos protegidos ni se cambiaron referencias históricas.

Se consultó documentación pública oficial de Windows para fundamentar las propuestas; no se contactó el clúster. Las verificaciones de permisos, handles, firmas, canarios y recuperación aquí descritas son **procedimientos futuros no ejecutados**. Diagnóstico/propuesta B00.1 entregados; detenerse y esperar autorización.
