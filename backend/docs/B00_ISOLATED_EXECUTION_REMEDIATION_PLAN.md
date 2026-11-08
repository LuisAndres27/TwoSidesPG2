# B00.3 — Plan de remediación de ACL y aislamiento del entorno

2026-10-29, America/Guatemala. **Plan documental completado; no se modificaron ACL ni se creó un entorno.** C.2/F.2 siguen detenidas, B00 sigue pendiente y B05.5 no iniciada.

## 1. Base de evidencia y límites

Se revisaron B00.1, B00.2, los tres informes ACL históricos, el preflight C.2B y el resultado de esquema C.2A. No se repitieron consultas ACL ni se volvió a inspeccionar el árbol. Los hechos ACL actuales citados proceden de las 92 rutas nominales de B00.2; los recuentos de árbol completo citados en la alternativa A son solo la fotografía histórica de B05.2B.2A del 2026-10-28 y deberán actualizarse si alguna vez se considera una modificación.

Hechos relevantes:

- La raíz de la copia conserva dos ACE Allow explícitas `Modify/Synchronize`, con herencia a contenedores y archivos. Sus SID siguen sin resolverse. B00.2 comprobó propagación a las 66 rutas inspeccionadas del proyecto, incluidas las raíces Node examinadas.
- Los 45 archivos de dependencia coinciden con los hashes contenidos en el manifiesto C.2A, pero el manifiesto no es un ancla independiente y el árbol admite modificación. Esa coincidencia no evita sustitución posterior.
- `OneDrive` y `OneDrive\Desktop` son reparse points Microsoft; no se verificó destino final ni sincronización activa.
- La ruta AppData del canal C.2A mostró ACE heredadas para el usuario actual, SYSTEM y Administradores. El usuario conserva FullControl; no existe aislamiento entre sus procesos. El canal C.2A está consumido.
- C.2A creó y verificó ocho colecciones, cinco índices secundarios y el fence sintético autorizado. No probó carreras de revocación. No se declara privacidad del canal ni se reutiliza.
- No hay evidencia de intrusión o uso malicioso de los SID. Un principal desconocido no se considera automáticamente malicioso ni eliminado.

## 2. Alternativas

| Criterio | A — Quitar las dos ACE en la raíz del proyecto | B — Ejecutar en entorno separado con paquete de solo lectura |
|---|---|---|
| Cambio requerido | Retirar únicamente los dos Allow identificados en la raíz; preservar ACL legítimas, ACE OneDrive y las cuatro Deny históricas específicas de `.git` | Publicar una copia cerrada del arnès y dependencias fuera del proyecto/OneDrive; protegerla para que el runtime no pueda escribirla |
| Alcance | La herencia propaga el cambio a descendientes. La fotografía de 2026-10-28 registró 14.465 objetos, no un inventario vigente | Limita el cambio ACL a un paquete nuevo y su directorio de salida. No sanea las ACL del proyecto |
| Beneficio | Reduce la capacidad de los SID desconocidos sobre el proyecto si los tokens correspondientes pudieran usarla | Evita que el runtime importe código desde los objetos afectados por B00 y limita impacto de ACL al paquete nuevo |
| Riesgos | Aplicación no transaccional; puede afectar Godot, Git, OneDrive, herramientas, permisos heredados y archivos de juego. No se conoce la necesidad de esos SID | Depende de procedencia del paquete, cierre completo de dependencias, rutas finales e identidad separada. Un paquete local modificable por el mismo operador no resuelve sustitución |
| Reversión | Requiere backup DACL actual, inventario nuevo, reconciliación objeto por objeto y rollback de cambios parciales; no se restauran owner/SACL automáticamente | Revertir solo configuración/paquete nuevo desde copia verificada; conservar resultados no secretos. La reversión tampoco puede borrar evidencia o secretos de almacenamiento no volátil con garantía física |
| Conclusión | No preferida para habilitar C.2; requiere otra autorización de alcance global y confirmación de identidad/necesidad | Preferida para C.2, condicionada a un límite de confianza demostrable y a no importar desde el proyecto |

No recomiendo aplicar A como requisito previo del canal. Puede considerarse después en una fase ACL separada, con nueva fotografía completa, respaldo y autorización explícita que mencione el alcance de propagación. No retirar SID en todo el sistema ni restablecer ACL recursivamente.

## 3. Solución recomendada y estructura propuesta

La solución preferida es un **entorno efímero administrado y separado de la sesión ordinaria de desarrollo**, con un paquete C.2 versionado, cerrado y montado como solo lectura. La primera opción a evaluar es una VM/entorno aislado dedicado con una identidad estándar no administrativa. El usuario introduciría allí la credencial; no se transportaría desde la sesión de desarrollo ni desde un archivo. No se presupone que Windows Sandbox/VM esté habilitada o disponible: eso debe verificarse en una fase autorizada. No habilitar características de Windows ni crear cuentas en esta fase.

Estructura lógica futura (nombres ilustrativos; no son rutas existentes ni autorizadas para crear):

```text
<paquete-versionado-solo-lectura>/
  manifest.json                  # procedencia, versión, hashes y cierre de carga
  powershell/                    # solo si es estrictamente necesario y fijado
  node/                          # ejecutable fijado y sus componentes necesarios
  app/                           # receptor + arnès C.2 + módulos first-party mínimos
  node_modules/                  # dependencias exactas, transitivas y nativas
<salida-de-run-separada>/
  attempt.started                # creación exclusiva, sin sobrescribir
  progress.jsonl                 # solo eventos sanitizados
  result.json                    # resultado sanitizado, escritura de una ejecución
```

El paquete no contendrá secretos, `.env`, bases SQLite, datos reales, herramientas de Godot ni código ajeno al arnès. No habrá carga de módulos desde la copia, `%PATH%`, `NODE_PATH`, `NODE_OPTIONS`, perfiles de PowerShell, cachés escribibles ni descargas durante la ejecución. La salida queda separada del paquete. La ejecución remota futura seguirá fijada a `<cluster>.<id>.mongodb.net`, `two_sides_integration_test`, el usuario `twosides_integration_test`, `authSource=admin`, mecanismo `DEFAULT` y TLS estricto; el entorno por sí mismo no autoriza ninguna conexión.

Para que las siguientes autorizaciones puedan revisar rutas concretas, se propone este **layout candidato dentro de una VM efímera**, todo **NO CREADO**:

| Ruta candidata | Estado actual conocido | Estado esperado/permiso de diseño | Dependencias, riesgo y reversión |
|---|---|---|---|
| Host: `C:\Users\luis2\AppData\Local\TwoSides\C2Staging\release-<id>.iso` | No inventariada ni creada. El padre `TwoSides` se inspeccionó en B00.2, pero no se certifica protección contra procesos del mismo usuario | Artefacto de staging sin secretos. Verificar firma dentro del guest; no ejecutar directamente desde esta ruta | Origen sujeto a la misma identidad de host; la firma/ancla debe ser independiente. Reversión: retirar solo el ISO de staging bajo autorización posterior |
| Guest: `D:\TwoSidesC2\release-<id>\` (ISO montado read-only) | No existe; letra/unidad depende de la VM elegida | Solo lectura para `C2Runner`; contiene receptor/arnès/dependencias cerrados; no ACL de escritura desde runtime | Requiere ISO validado y runtime sin imports externos. No se altera el ISO durante el run |
| Guest: `C:\Users\C2Runner\AppData\Local\TwoSides\C2\runs\<run-id>\` | Cuenta/perfil/directorio no existen | Salida efímera del run; crear/escribir solo logs sanitizados, nunca secreto; no permiso de escritura sobre `D:` | Exportar únicamente resultados sanitizados luego de cerrar la conexión y apagar el guest; borrar la VM efímera según política, sin prometer borrado físico |
| Entrada de credencial: stdin/diálogo seguro en la consola guest | Ningún canal preparado | Entrada en memoria del proceso C2 dentro del guest; no archivo, clipboard, argv o entorno | Hypervisor/SYSTEM/admin del host sigue siendo límite confiable. Si no se puede verificar el aislamiento de consola/memoria, no introducir el secreto |

`<id>` y la letra `D:` son parámetros de publicación/VM que deben fijarse antes de la siguiente autorización. No son rutas existentes ni autorizan crear el staging, ISO, VM o perfil. Como la ubicación y el producto de virtualización todavía no se eligieron, no es posible especificar responsablemente una ACL real del host ni asegurar que crear la VM no requiera privilegios; esa puerta se mantiene bloqueada hasta revisar el producto/política y la lista de rutas exacta.

El cierre de carga debe ser generado y revisado desde un árbol de construcción confiable. No se puede derivar confiablemente del mero hecho de que una lista de fuentes coincida con los hashes del mismo entorno modificable. El bundle mínimo exacto aún no está determinado; no copiar todo el proyecto o `node_modules` sin justificar cada módulo.

## 4. Propietarios e identidades y permisos esperados

No se asigna aún una ruta física ni se cambia una ACL. Al elegir el entorno en la siguiente fase, primero se inspeccionan individualmente sus ancestros y DACL; la ubicación no se considera segura por llamarse `LOCALAPPDATA`, `ProgramData`, Sandbox o VM.

| Identidad/objeto | Estado esperado para el futuro diseño |
|---|---|
| Publicador/deployer de confianza, distinto del runtime | Propietario o principal autorizado a escribir/publicar el paquete y verificarlo antes del run; no ejecuta el proceso que recibe la contraseña |
| Runtime C.2, usuario estándar no administrador | Lectura/ejecución/traversía sobre el paquete y lectura de configuración no secreta. Sin WriteData, AppendData, Delete, DeleteChild, WriteDac o WriteOwner en paquete, ancestros que permitan sustituirlo, intérpretes o dependencias |
| Salida del run | Crear solo los marcadores/resultados de esa ejecución. No puede modificar el paquete ni sobrescribir runs previos |
| SYSTEM y Administradores | Identidades privilegiadas de confianza del host; se reconocen como límite, no se ejecuta el ensayo elevado |
| Procesos de la sesión de desarrollo habitual | No deben ejecutar con la identidad aislada ni acceder al stdin/memoria de la sesión de prueba. Si comparten la identidad que recibe el secreto, no hay aislamiento entre ellos |

Una ACL de solo lectura para el runtime no basta si el mismo token también puede cambiarla por ser propietario o tiene acceso de escritura desde un padre. El propietario/deployer, ancestros, derechos de borrado/reemplazo y derecho a cambiar seguridad se verifican junto con cada archivo. La identidad runtime no debe ser propietaria del paquete. Un proceso dentro del entorno aislado sigue siendo una entidad de confianza mientras recibe la credencial; el aislamiento no promete protección frente a su compromiso, SYSTEM, administrador o el hipervisor.

Si no se puede proporcionar la identidad/entorno separado sin privilegios administrativos no autorizados o sin conceder al runtime escritura de código, se mantiene **BLOQUEADO**; no se vuelve silenciosamente al usuario de desarrollo.

## 5. Cadena de integridad

1. **Procedencia:** fijar el commit/revisión autorizada y revisar los cambios de los archivos first-party. Registrar versión y fuentes aprobadas. Un SHA-256 solo prueba igualdad con el digest que se le entrega; no autentica quién creó ese digest.
2. **Manifiesto confiable:** firmar el manifiesto del paquete o guardar su digest en un canal/control independiente del directorio que ejecuta. La clave de firma debe quedar fuera del runtime y del paquete; definir custodio y verificación antes de crear artefactos. No se crea una clave aquí.
3. **Cierre de dependencias:** resolver desde lockfile fijado todas las dependencias realmente cargadas, incluidos addons nativos, scripts de carga y DLL. Preferir dependencias reproducibles/verificadas y excluir descargas o instalaciones al ejecutar. `package-lock.json` solo no acredita el contenido instalado ni la procedencia de una copia de `node_modules`.
4. **Binarios:** fijar rutas absolutas y procedencia de Node/PowerShell. Verificar firma/editor y hash desde una fuente de confianza; enumerar DLL y módulos nativos cargados relevantes. No depender de búsqueda ambigua por PATH.
5. **Destino:** el receptor fija host, base, usuario, authSource, mecanismo y TLS; credenciales y argumentos no pueden sustituirlos. TLS conserva validación de certificado/host. Preflight de destino y privilegios se realiza antes de toda escritura y con límites de tiempo.
6. **Rutas/enlaces:** validar tipo, reparse tag, ruta final, FileId/volumen y número de enlaces del paquete/archivos antes del run. No seguir un destino nuevo sin aprobarlo. Un archivo reemplazado después del hash invalida el chequeo.
7. **TOCTOU:** ACL de solo lectura al runtime más handles/identidad de archivo durante la carga, cuando el diseño lo permita; sin imports dinámicos externos. Probar la sustitución concurrente únicamente con archivos sintéticos. Si el loader Node no puede consumir de forma segura los mismos objetos ya verificados, la separación ACL/sandbox es el control principal y se documenta el residual; no afirmar que una segunda pasada de hashes elimina la carrera.
8. **Registro:** solo huellas de código/configuración pública, fase, run ID y resultados sanitizados. Nunca URI completa, contraseña, token, stack con configuración ni datos de jugadores.

## 6. Custodia temporal de la credencial

Preferir la captura directamente dentro del entorno aislado con UI segura del sistema o entrada oculta. Un gestor de credenciales estándar puede reducir código de captura, pero no sustituye el límite de confianza: el proceso autorizado debe recibir el secreto en memoria. Credential Manager puede persistir secretos; no usarlo sin diseñar explícitamente una entrada efímera y verificar que no queda una credencial guardada. DPAPI/Credential Manager no protegen contra un runtime o proceso comprometido bajo la identidad que puede descifrarlos.

Si la revisión futura conserva una tubería personalizada, deberá ser un canal nuevo de un solo uso: memoria/stdin, sin archivo, argumento, variable de entorno, clipboard, historial ni log; buffers de bytes minimizados y borrados al terminar; proceso con timeout, cierre/kill acotado y diagnóstico sanitizado. Strings inmutables, GC, pagefile, dumps, telemetría o captura privilegiada limitan cualquier promesa de borrado seguro. No guardar la contraseña para reintentos ni reusar artefactos ya consumidos.

Los archivos temporales no contendrán credenciales. Al terminar, cerrar procesos/handles, verificar un resultado no secreto y retirar solo archivos temporales propios no secretos según retención aprobada. No prometer borrado físico seguro en SSD/NTFS, journaling, snapshots o backups.

## 7. Backups y reversión

### Paquete nuevo

- Antes de publicar: conservar un artefacto no ejecutable y no secreto con UUID/versión, manifiesto firmado, commit base y hashes en almacenamiento privado independiente.
- No sobrescribir paquetes ni resultados de ejecuciones anteriores. Publicar en una versión nueva y atómica; runtime solo consume versión verificada.
- Si falla verificación o ejecución, no recibir la credencial. Conservar únicamente logs sanitizados, bloquear el run ID y no reintentar con el mismo canal.
- Reversión: seleccionar una versión anterior ya verificada y crear otro run ID; no cambiar ACL heredadas del proyecto para recuperar el entorno.

### Cualquier cambio futuro de ACL

Requiere autorización independiente que enumere ruta y ACE exacta, DACL actual nueva, alcance de propagación, backup privado actualizado, restauración sintética y rollback por cambios realmente divergentes. El backup histórico de B05.2B.2A no sustituye esa nueva fotografía ni restaura owner/SACL. Cambios ACL sobre árboles no son transaccionales; detenerse ante estado concurrente, objeto nuevo o propagación inesperada. Este plan no autoriza `Set-Acl`, `icacls`, `takeown` ni comandos equivalentes.

## 8. Plan de implementación por puertas

| Puerta futura | Trabajo permitido solo tras autorización independiente | Criterio de salida |
|---|---|---|
| 1. Arquitectura | Verificar disponibilidad/política del entorno aislado y definir identidad separada, ubicación y red | Puede ejecutar con permisos estándar sin acceder al proyecto en runtime; si no, BLOQUEADO |
| 2. Cierre offline | Revisar commit, listar el arnès y dependencias efectivamente cargadas; construir bundle reproducible/sin secretos | Lista finita de archivos, versiones, fuentes y binarios; sin import desde el proyecto |
| 3. Empaquetado sintético | Preparar copia sin secretos en ubicación nueva expresamente aprobada, manifiesto firmado y salida separada | Verificación de firma/hash y rutas finales repetible; directorios protegidos según inspección autorizada |
| 4. Ataques sintéticos | Probar reemplazo antes/durante hash, junction/symlink/hardlink, variable/argv/log, dependencia faltante, salida preexistente, destino cambiado y timeout | Todo fallo cierra antes de pedir secreto o conectar; paquete no cambia durante ejecución |
| 5. Privilegios y recuperación | Comprobar token estándar, acceso de runtime al paquete/salida, bloqueo de escritura al paquete, backup y rollback sobre fixtures | Sin elevación no justificada; recuperación ensayada fuera del proyecto |
| 6. Canal manual | Revisar receptor/lanzador y manifiesto nuevos por hash/firma; preparar canal one-shot, sin secreto | Autorización separada para activación; no se deduce de completar esta fase |
| 7. Validación remota C.2 | Activación manual separada para el arnès C.2 previamente autorizado, límites de concurrencia, datos sintéticos y limpieza exacta | Preflight del destino, resultados sanitizados, limpieza por IDs propios y cierre confirmado. No habilita F.2 |

No ejecutar estas puertas ahora. C.2A ya creó el esquema; no volver a crear ni alterar estructuras como parte de este plan. Las pruebas futuras deberán tomar como baseline los 12 objetos remotos ya documentados y proteger las estructuras previas. No incluye F.2, carga de estrés, writes fuera del fixture sintético aprobado ni B05.5.

## 9. Corrección ACL A — propuesta mínima no aplicada

Si se aprueba una fase específica de saneamiento del proyecto, el cambio acotado a evaluar es quitar **solo** los dos Allow `Modify/Synchronize` con SID citados en la raíz de la copia. Conservar ACE de usuario, SYSTEM, Administradores, la denegación heredada del proveedor y las cuatro Deny explícitas específicas de `.git`; no usar eliminación global por SID, reset, desactivar herencia ni cambiar propietarios.

Ruta origen: `C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA`. Alcance conocido: descendientes del proyecto por OI/CI; fotografía histórica de 14.465 objetos en 2026-10-28, no inventario actual. Estado esperado: esas dos ACE ya no conceden permisos efectivos a descendientes; resto de seguridad y contenidos sin cambio. Riesgos: SID aún sin identidad/justificación, propagación no atómica, `.git` y archivos de juego, OneDrive, procesos/build, herencia/ACL especiales y pérdida de acceso potencial para una dependencia desconocida.

Precondiciones: nueva inspección e inventario completo autorizados, identidad y dependencia de SID investigadas localmente, escritores detenidos, nuevo backup DACL verificado, permisos de rollback compatibles y autorización explícita que mencione `.git`, runtime, OneDrive y alcance total. Verificación posterior por comparación de descriptor/ruta y pruebas autorizadas de Git/build/Godot/SQLite solo en fixtures. Rollback objeto por objeto sin restaurar datos ni pisar cambios concurrentes. **No se recomienda este cambio para habilitar C.2 y no se aplica en B00.3.**

## 10. Condiciones para declarar el entorno apto

No basta con que una carpeta esté fuera de OneDrive o tenga una ACL aparentemente privada. Deben demostrarse todas estas condiciones para el paquete y la identidad futuros:

1. Identidad de ejecución estándar y separada de la sesión de desarrollo; el usuario no ejecuta elevado.
2. Paquete con procedencia y manifiesto anclado/firma confiable, cierre transitivo/nativo completo, sin archivos cargados desde el proyecto ni red de instalación.
3. Ancestros, archivos, ACL, propietarios, rutas finales, FileId/volumen y enlaces inspeccionados en lista cerrada y sin capacidad de sustitución no justificada.
4. Runtime no puede escribir/borrar el paquete ni cambiar su DACL/propietario; ningún padre permite sustituirlo. Administrador/SYSTEM/hipervisor se declaran límites confiables.
5. Pruebas sintéticas cubren TOCTOU, links, argumentos/configuración, logs, timeout, duplicados y limpieza; fallos cierran antes del secreto.
6. Contraseña introducida solo después de verificar receptor/configuración; no persistida conscientemente, ni expuesta en argv/env/log/archivo. Limitaciones de memoria/sistema declaradas.
7. Host/base/usuario/authSource/mecanismo/TLS fijados y comprobación de destino antes de acciones; solamente la activación manual de una fase remota distinta podría autorizar conectar.
8. Backup/reversión de paquete/ACL probado en fixtures y destino de resultados limitado a su run.

Si una condición no se puede comprobar sin ampliar rutas, instalar software, elevar permisos, crear cuentas o cambiar ACL, detenerse y pedir una autorización que nombre esa operación; no degradar el criterio para obtener APTO.

## 11. Alcance exacto de una siguiente implementación

Una siguiente fase, aún no autorizada, debería limitarse a:

- inspeccionar disponibilidad y política del mecanismo aislado elegido, sin habilitar componentes Windows;
- producir el inventario de dependencia de carga mediante análisis estático y construcción en un entorno confiable aprobado;
- diseñar un perfil/identidad de runtime no administrativa y package/output paths exactos;
- preparar y validar artefactos sintéticos sin credenciales y sin red Atlas;
- consultar ACL solo con autorización explícita sobre la nueva lista cerrada, sin recorrer proyecto ni `.env`/SQLite/Godot;
- presentar un preflight revisable y comando manual de activación solo tras una autorización de fase separada.

No crear todavía directorios protegidos, usuarios, ACL, receptores, manifiestos de uso real ni credenciales. No correr el arnès real.

## 12. Estado y recomendación

La alternativa B reduce mejor el alcance de cambios que A, pero **no está implementada ni certificada**. La solución elegida depende de una identidad/entorno aislado disponible y una cadena de publicación independiente. El directorio AppData actual no separa procesos de la cuenta `luis2`; el proyecto y dependencias continúan heredando las dos ACE desconocidas. A sigue como remediación separada, no requisito inmediato para un paquete externo.

**Recomendación: BLOQUEADO para preparar o ejecutar C.2 hoy.** Autorizar primero una fase offline separada de viabilidad del entorno aislado/cierre de dependencias. Solo un preflight posterior que cumpla los ocho criterios de la sección 10 puede proponer activación. No se autoriza alterar ACL, preparar canal o conectar Atlas con este plan.

## 13. Cierre de B00.3

Este archivo es la única escritura de B00.3. No se consultaron ACL o propietarios, no se copiaron ni crearon artefactos, no se abrió `.env` o SQLite, no se ejecutaron Node/Godot/scripts y no se contactó Atlas. No se modificaron ACL, propietarios, OneDrive, Godot ni usuarios. C.2/F.2 permanecen detenidas; B00 no resuelta; B05.5 no iniciada. Esperar autorización independiente.
