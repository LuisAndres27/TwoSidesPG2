# B05.2B.1 — Propuesta controlada de corrección ACL
2026-10-27 · **Preparación/verificación completada; cambios NO aplicados.**
No autoriza B05.2B.2. Permisos Windows e identidad/autenticación del backend permanecen trabajos separados.

## 1. Proyecto, fuentes y método
Raíz exacta:
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA.

Revisados B05_B00_ACL_DIAGNOSIS, B05_IDENTITY_IMPLEMENTATION_PLAN, B05_IDENTITY_AND_SECURITY_PLAN, B05_IMPLEMENTATION_ROADMAP, PHASES, PHASE_HISTORY y DECISIONS. La evidencia nueva amplía la inspección por muestras de B05.2A a un recorrido de ACL de toda la copia, incluidos ocultos, dependencias y artefactos de build.

Get-Item/Get-ChildItem/Get-Acl, traducción Windows de SID y token propio; solo lectura. Recorrido mediante pila, sin seguir ReparsePoint, desde la raíz exacta y sin enumerar carpetas personales ajenas. El inventario inicial no encontró reparse points internos ni errores de lectura. No se leyeron textos/variables de .env; solo verificación de integridad. No se copió .env ni SQLite, no se ejecutaron pruebas, servidores o Godot. Una consulta de existencia de la ubicación privada propuesta no la creó.

El inventario se mantuvo en memoria y se resumió aquí: **no es todavía el respaldo durable para restaurar**. La futura aplicación deberá capturar uno nuevo verificable antes de modificar nada.

## 2. Inventario exacto de las dos ACE objeto de cambio
| Propiedad | Entrada A | Entrada B |
|---|---|---|
| SID | S-1-5-21-452213140-3335518246-3718727391-3248334987 | S-1-5-21-307222809-3929607348-3502628415-466486063 |
| Origen de concesión | Raíz exacta del proyecto | Misma raíz |
| Tipo | Allow | Allow |
| IsInherited en origen | false | false |
| Máscara exacta |0x001301BF |0x001301BF |
| Derechos | Modify,Synchronize | Modify,Synchronize |
| InheritanceFlags | ObjectInherit,ContainerInherit | ObjectInherit,ContainerInherit |
| PropagationFlags | None | None |
| Presente en backend/.env | Sí, heredada; sin flags de propagación en el archivo | Sí, heredada; sin flags de propagación en el archivo |
| Traducción actual | UNRESOLVED | UNRESOLVED |
| Presente en token propio consultado | No | No |

Propietario de raíz/backend/.env: LAPTOP-F337QTKK\luis2; herencia habilitada. B05.2A consultó usuarios/grupos locales sin coincidencias; esta fase repitió traducción y token, sin demostrar quién añadió las entradas. No se consideran maliciosas ni cuentas eliminadas por no resolverse.

Modify incluye lectura, escritura y eliminación; Synchronize es un derecho de coordinación, no autorización del servicio OneDrive. Estas concesiones no son FullControl ni conceden por sí mismas cambiar propietario/DACL. Ningún intento de escritura, borrado, impersonación o acceso con otra cuenta fue realizado.

## 3. Inventario adicional imprescindible: los mismos SID en .git
Se encontraron **cuatro ACE explícitas adicionales, todas DENY**, que no son objeto de retirada:
| Origen | SID | Tipo | Máscara | Herencia | Propagación |
|---|---|---|---|---|---|
| .git | A | Deny |0x40130156 | OI,CI | InheritOnly |
| .git | A | Deny |0x00130156 | None | None |
| .git | B | Deny |0x40130156 | OI,CI | InheritOnly |
| .git | B | Deny |0x00130156 | None | None |

0x00130156 corresponde a DeleteSubdirectoriesAndFiles,Write,Delete,ReadPermissions,Synchronize. 0x40130156 incluye el bit GENERIC_WRITE; conservar máscara y flags exactos, no convertirla en “Modify Allow”.

La comprobación detallada corrige expresamente la interpretación preliminar comunicada durante la inspección: esas entradas NO son concesiones residuales de escritura. Son denegaciones que se deben preservar. No se conoce el proceso/uso que las requiere; no atribuirlas a una herramienta específica.

En .git y sus directorios hay3 ACE por SID:2 Deny (una heredable/solo herencia según nivel) y1 Allow M/S heredada de raíz. En archivos hay2 por SID:1 Deny heredada0x00130156 y1 Allow M/S heredada0x001301BF. Tras retirar SOLO las Allow de raíz, la expectativa es2 Deny por SID en directorios .git y1 Deny por SID en archivos, sin ninguna modificación intencional de las cuatro Deny explícitas.

No usar un comando genérico que quite todas las ACE de un SID: eliminaría también esas protecciones. La propuesta selecciona por SID+Allow+explicit+mask+flags+origen, no solo por nombre.

## 4. Alcance completo observado
Inventario ANTERIOR a crear este documento:
-14.453 objetos:1.928 directorios y12.525 archivos, incluida la raíz.
-Ambos SID aparecen en los14.453 objetos.
-0 DACL protegidas y0 no canónicas;0 errores y0 objetos reparse omitidos.
-Únicos orígenes explícitos de estos SID: raíz (dos Allow objeto de cambio) y .git (cuatro Deny conservadas).
-Digest SHA-256 del manifiesto normalizado de ruta/tipo/owner/SDDL/clasificación del segundo recorrido: C38591E7ABFB3EFB894A70B7D8B63AE11EF4D6AC9D299856B53864AA0D7CB5EA. No es hash de contenidos, no firma contra manipulación y no sustituye un respaldo.
-Los conteos son una fotografía, no una condición estática del proyecto; nuevos documentos/builds/checkpoints requieren inventario nuevo y comparación antes de aplicar.

| Grupo dentro de la raíz | Objetos | Directorios | Archivos |
|---|---:|---:|---:|
| .git | 6584 | 281 | 6303 |
| .godot | 1136 | 115 | 1021 |
| Raíz | 1 | 1 | 0 |
| Archivos directos de raíz | 8 | 0 | 8 |
| assets | 385 | 24 | 361 |
| backend | 2156 | 666 | 1490 |
| docs | 15 | 1 | 14 |
| integration | 249 | 114 | 135 |
| local-persistence | 3686 | 709 | 2977 |
| scenes | 75 | 6 | 69 |
| scripts | 158 | 11 | 147 |

Fuera de .git, cada objeto inventariado tiene una ACE de A y una de B. En .git:281 directorios con3 por SID y6.303 archivos con2 por SID. No hay otros orígenes explícitos encontrados para estos SID en esta fotografía.

### Impacto por componente
| Componente | Evidencia / impacto esperado de retirar Allow en raíz |
|---|---|
| backend/.env y backend | Heredan ambas; cambian DACL, no contenido/owner/fecha de datos. Hash íntegro no prueba confidencialidad. |
| local-persistence y .work | Ambos SID heredados; incluye biblioteca, paquetes/cachés/fixtures/ejecutores y **base runtime, ownership.json y lease**. Su DACL puede cambiar aunque no se abra SQLite. |
| Dos bases AppData históricas | Fuera de la raíz; NO heredan este cambio. Solo integridad de protección, ninguna apertura SQL. |
| scripts/scenes/assets | Incluidos; sus ACL heredarían retirada. No editar código, escenas o recursos. |
| TwoSides.csproj/project.godot/solución | Ambos SID heredados; contenidos permanecen iguales. |
| integration/sqlite/.work y .godot | Artefactos y herramientas locales de build heredan. SDK/.NET/Godot instalados fuera de la raíz NO se recorrieron ni se modificarían. |
| .git | Alcance delicado: desaparece Allow heredada, permanecen Deny. DACL de metadatos Git cambia por propagación; no se modifica historia/contenido Git. |
| OneDrive | Archivos de la copia están bajo OneDrive y podrían tener comportamiento de sincronización afectado. DACL de OneDrive/Desktop/ancestros fuera de raíz NO se cambia. No deshabilitar OneDrive ni inferir qué SID usa su proceso. |

Que el cambio se escriba en un directorio no significa que solo cambie un objeto. Windows puede retirar las copias heredadas de sus descendientes, manteniendo explícitas ajenas; se debe verificar el resultado, no asumir propagación perfecta. [Microsoft: propagación automática](https://learn.microsoft.com/en-us/windows/win32/secauthz/automatic-propagation-of-inheritable-aces).

## 5. Corrección mínima exacta propuesta
**Propuesta C-AB**, dos retiradas en una única DACL candidata de raíz:
1. Retirar una sola ACE A con AccessControlType=Allow, IsInherited=false,mask0x001301BF,InheritanceFlags=OI|CI,PropagationFlags=None.
2. Retirar una sola ACE B con exactamente el mismo tipo/máscara/flags, en el mismo origen.
3. Ninguna otra eliminación, adición, normalización, cambio de propietario o herencia. Ningún borrado recursivo de ACE por SID y ningún acceso directo de escritura a DACL de .git como atajo.

La raíz actualmente tiene6 ACE; la candidata retiene4:
- Everyone: Deny DeleteSubdirectoriesAndFiles, heredada, CI,Propagation=None.
- SYSTEM: Allow FullControl heredada, OI/CI.
- BUILTIN\Administradores: Allow FullControl heredada, OI/CI.
- LAPTOP-F337QTKK\luis2: Allow FullControl heredada, OI/CI.
Se conservan orden canónico, estado de protección/herencia, owner y grupo originales. Las cuatro Deny explícitas de .git permanecen exactas. La selección de6→4 se comprobó solo por filtrado de reglas en memoria; no se escribió un descriptor.

Justificación: eliminar dos concesiones de modificación no identificadas/justificadas en esta copia sensible; no se trata de castigar un SID desconocido. La autorización debe aceptar explícitamente AMBAS retiradas después de ver esta evidencia y posibles dependencias. Si alguna tupla/numero de ACE cambia, detener; no quitar “la más parecida”.

### Permisos legítimos y dependencias
Conservar al usuario legítimo, SYSTEM y Administradores y todos los Deny ajenos. Herramientas ejecutadas como luis2 suelen usar su token; no se deduce que carezcan de un token restringido adicional. Esta sesión no inventaría ni probó la identidad de procesos Godot/IDE/build/OneDrive, por lo que no garantiza que ambos SID sean innecesarios para toda automatización.

El entorno de trabajo declara .git como área de solo lectura. No se debe eludir ese límite escribiendo el padre para provocar efectos que no estén autorizados por el entorno. Antes de C-AB, confirmar que los permisos de ejecución permiten la propagación prevista a .git y a los demás objetos afectados. Si no, aplicación BLOQUEADA hasta autorización/perfil de permisos compatibles; no cambiar herencia de .git para sortearlo.

La protección vigente de bases exige no modificarlas; la aplicación futura tendría que autorizar expresamente **cambio de DACL de runtime/manifest/lease por herencia**, manteniendo contenido/tamaño/mtime/owner. Si el usuario exige también DACL idéntica para la runtime, C-AB en raíz no es compatible con ese alcance y debe rediseñarse, no ocultar la excepción. Las AppData permanecen totalmente fuera.

## 6. Plan de respaldo de descriptores — diseñado, NO creado
Ubicación propuesta exacta:
C:\Users\luis2\AppData\Local\TwoSides\SecurityBackups\ACL\copy-06dc7ade-b3cd-425b-8d79-90dde8ef1ac6\B05.2B.2\<UTC-sin-dos-puntos>-<UUID>\

La carpeta base propuesta no existe en la comprobación actual. No se creó. Es una ruta fuera de OneDrive/workspace: su creación/escritura y protección privada requieren autorización de tarea y permisos del entorno. No almacenar este respaldo como documento público/Git ni usar rutas compartidas. Verificar ruta resuelta, ausencia de redirección/enlaces y permisos de ancestros; crear el directorio con acceso privado desde el origen (usuario legítimo/SYSTEM/Administradores según política aprobada), sin una ventana de escritura pública. No se cambia ACL del proyecto para poder respaldar.

### Alcance
Raíz y TODOS los objetos existentes normales del inventario justo antes de aplicar, incluidos ocultos/.git/.godot/node_modules/.work/runtime y documentos recién creados. No seguir enlaces; si aparecen reparse/hardlinks inesperados o identidad final fuera de raíz, detener para revisar. Hardlinks requieren inventario de identidad de archivo/volumen: una DACL pertenece al archivo, por lo que un nombre enlazado fuera del árbol podría ampliar alcance. Esta fase no certificó ausencia de hardlinks; es puerta obligatoria antes de modificar.

Archivos propuestos del respaldo:
- manifest.json: raíz absoluta/resuelta e identidad de volumen/directorio, UUID/UTC/herramienta, versión, rutas relativas normalizadas sin traversal, tipo, atributos, owner/grupo, protección/canonicalidad, control flags y estado de lectura.
- access-descriptors.jsonl: para cada objeto, DACL en SDDL de sección Access y representación binaria consistente, ACE ordenadas con SID/type/mask/inheritance/propagation/IsInherited. Guardar también estado null/empty DACL si apareciera.
- checksums.json: hash de manifest/descriptors, conteos, digest del inventario y del descriptor raíz; guardarlo sin sobrescribir otro backup.
- plan.json: las dos ACE exactas y diff candidato, alcance/limitaciones y referencias de los archivos realmente afectados durante la aplicación.
No se guarda contenido de .env, SQLite, código, .git/config o conexiones. Un hash de integridad de archivos protegidos se registra solo como evidencia privada; no es exportación de sus datos.

No prometer “descriptor completo con SACL” usando Get-Acl estándar: se respalda Access/DACL y se registra owner/grupo como referencia. No se toca ni restaura SACL, etiquetas de integridad o propietario. Si se requiere respaldarlos íntegramente, debe aprobarse otro alcance/privilegios. [READ_CONTROL/WRITE_DAC y secciones de seguridad](https://learn.microsoft.com/en-us/windows/win32/secauthz/standard-access-rights).

### Verificación del respaldo
Cerrar escritores/herramientas en conflicto de manera coordinada, sin deshabilitar OneDrive por esta tarea. Capturar inventario y verificar que cada objeto tiene exactamente un descriptor y viceversa; error de lectura→no aplicar. Deserializar de nuevo todos los registros, validar hashes y reconstruir DACL en memoria comparando ACE ordenadas/flags; comprobar explícitamente raíz con A/B Allow originales y .git con sus cuatro Deny. Comparar descriptor/owner de raíz y objetos protegidos una segunda vez antes del cambio para detectar concurrencia.

Un hash guardado junto al archivo detecta errores accidentales, no impide que alguien con acceso a ambos lo reescriba. La privacidad/integridad depende también del directorio seguro y su control de acceso. Backup legible por el operador legítimo y restauración ensayada en árbol SINTÉTICO aparte, solo si esa prueba/escritura se autoriza. Esta fase no ejecutó ensayos de restauración.

### Privilegios
Inventariar requiere READ_CONTROL; escribir/restaurar DACL requiere WRITE_DAC en objetos previstos. FullControl declarado y owner no prueban que un token restringido de la herramienta pueda realizarlo. No tomar propiedad, usar SetOwner ni activar privilegios/elevación por defecto. Si faltan permisos, detener y solicitar ejecución bajo una identidad ya autorizada; no otorgarse permisos a sí mismo. Respaldar SACL implicaría controles distintos, fuera de este diseño mínimo.

## 7. Aplicación futura y reversión
B05.2B.2 requerirá script/comando concreto revisable y autorizado, no redactado como permiso genérico para ejecutar cualquier icacls. Este documento no contiene ni ejecuta Set-Acl/takeown/icacls de modificación.

Preflight: comprobar integridad/identidad/ruta, inventario nuevo, enlaces/hardlinks, exactitud de las dos ACE, backup verificado/privado/legible, candidato y permisos legítimos. El resultado debe coincidir con el plan aprobado; cualquier diferencia detiene. La propagación de miles de DACL no es una transacción atómica: puede ser parcial y debe registrar cada resultado/objeto comparado. No cambiar contenido, owner o flags de herencia para “completar” el proceso.

Rollback planificado:
1. Suspender la operación ACL; registrar objetos realmente diferentes y errores. No iniciar código/gameplay para compensar.
2. Confirmar misma raíz/identidad de objetos y ausencia de cambios concurrentes; si existen, revisar antes de sobrescribir.
3. Restaurar únicamente DACL de raíz desde el respaldo para recuperar las dos Allow originales y su orden; dejar que la herencia revierta las copias conforme al modelo original.
4. Comparar TODOS los objetos con backup. Si hubo estado parcial que no vuelve a baseline, restaurar sección Access de los afectados desde registros exactos bajo autorización de rollback, preservando owner/grupo/herencia/protección originales y cualquier SACL ajena. No materializar heredadas como nuevas explícitas, ni tocar las Deny de .git.
5. Repetir inventario/descriptor/owner y comprobaciones de integridad. Si no puede restaurarse un objeto, detener e informar; no usar reset/takeown o elevación automática.
6. No eliminar archivos aparecidos después, no restaurar contenidos, no falsificar mtime para simular integridad. Un objeto borrado o reemplazado por otra actividad requiere revisión, no aplicar ACL a “la misma ruta” sin validar identidad.

La autorización futura debe incluir rollback limitado a esta corrección, con ubicación/operador/respaldo identificados; no es autorización para revertir cambios legítimos ajenos.

## 8. Validaciones posteriores planificadas
| Comprobación | Procedimiento futuro y criterio |
|---|---|
| Dos Allow retiradas | Raíz6→4 exacta; A/B Allow M/S ausentes en descendientes derivados; conservar las Deny de .git. No exigir “SID ausente en todo el árbol”. |
| Usuario/Windows | Owner/grupo y ACE legítimas iguales; lectura/escritura autorizada de prueba en archivo sintético, no .env/DB. Distinguir DACL declarada de acceso efectivo/token real. |
| Desarrolladores/build | Compilar con cachés y salida aisladas/fixtures;0 errores o advertencias nuevos y sin cambios de fuentes/config. Solo después de autorizar estos ensayos; no se compiló ahora. |
| Godot | Usuario abre manualmente la copia y comprueba carga/recursos, sin editar escenas; no iniciarlo automáticamente. |
| SQLite | Hash/tamaño/mtime de tres bases y manifiestos/leases antes/después. Ensayo de apertura/write solo en fixture sintética; no usar la partida manual para probar acceso sin permiso aparte. |
| .env | Coincide con referencia histórica; contenido/tamaño/mtime/owner sin cambios, solo diferencia DACL autorizada. No imprimir valores o hash observado si basta comparación. |
| OneDrive | Usuario verifica estado de sincronización/errores de ESTA copia y de la carpeta segura, sin deshabilitar cliente ni abrir otras carpetas personales. No afirmar que NTFS ACL se replica igual en la nube. |
| Git/herramientas restringidas | Comprobar que metadatos/contenidos Git intactos y Deny exactas conservadas. Pruebas de operación Git que escriban necesitan autorización distinta; lectura no prueba capacidad de escritura. |
| Reversibilidad | Backup y reconstrucción en memoria íntegros; ensayo de rollback solo en entorno sintético autorizado y revisión de baseline final si hubo rollback real. |

Las pruebas de desarrollo pueden crear artefactos/cambiar datos temporales; conservar un baseline separado y las exclusiones precisas, nunca mezclar esos cambios con el efecto de DACL. No ejecutar Godot/runtime real como “validación automática de permisos”.

## 9. Riesgos que permanecen y bloqueos
-La identidad/procedencia/necesidad de A/B sigue no determinada. No existe prueba de atacante ni de ausencia total de dependencia.
-Retirar sus dos concesiones no garantiza que una identidad no acceda por otros grupos, privilegios, tokens administrativos, respaldos o copias cloud. Las Deny específicas de .git se conservan y no son nuevos grants residuales.
-Riesgo de afectar herramientas con token restringido, compilación, OneDrive o acceso SQLite por metadatos, aunque luis2 conserve FullControl declarado.
-OneDrive/ancestros externos no se corrigen; posible acceso a copias sincronizadas/históricas sigue fuera de la prueba. Exposición previa y eventual rotación requieren evaluación independiente.
-Hardlinks/destinos finales, concurrencia, permisos de ejecución sobre .git y respaldo privado fuera del workspace no están resueltos por esta auditoría.
-La runtime heredará otra DACL: si la autorización no acepta expresamente ese efecto (sin cambiar datos), aplicación bloqueada. Dos bases AppData nunca incluidas como destino de corrección.
-No hay garantía de rollback atómico ni protección contra disco/credencial administrativa comprometidos.
-Identidad backend/JWT/roles y cola siguen fuera de alcance. Corregir Windows ACL no implementa autenticación ni hace al backend apto para despliegue.

## 10. Texto propuesto de autorización para B05.2B.2
NO es autorización recibida ni instrucción ejecutada:
> Autorizo preparar y verificar un respaldo privado de DACL y metadatos, sin contenidos, en la ruta SecurityBackups indicada, con UUID/fecha únicos y permisos privados revisados. Tras preflight sin diferencias no aprobadas, autorizo retirar exclusivamente las dos ACE Allow explícitas0x001301BF/OI|CI/Propagation=None de los SID A y B de la raíz exacta de la copia. Acepto la propagación de esas dos retiradas a los descendientes inventariados, incluidas DACL de runtime/manifiesto/lease y .git solo si el entorno permite legalmente ese alcance. No autorizo cambios de contenido, owner, herencia, otras ACE o las cuatro Deny de .git, ni tocar AppData DB/original/ancestros. Autorizo rollback limitado de DACL desde ese respaldo si falla la operación y solo tras verificar ausencia de cambios concurrentes. Cualquier diferencia, link/hardlink inesperado, error de lectura o impedimento de permisos detiene sin ampliar alcance.

Antes de ejecutar, el usuario debe confirmar ese alcance, y la herramienta deberá disponer de permisos compatibles. Si .git o cualquier parte sigue readonly por política, no aplicar por el padre como evasión. Los ensayos de build/fixture y apertura MANUAL de Godot se concretarán en esa autorización; no iniciar servidores, Atlas o B05.3.

## 11. Estado final de esta fase
Se creó solo este documento y se actualizaron PHASES/PHASE_HISTORY/DECISIONS. No se exportó respaldo ni se cambió una ACL, propietario o herencia. Integridad de .env: **COINCIDE con la referencia histórica**; tres bases protegidas y archivos asociados conservados. El inventario ACL de los objetos existentes y las verificaciones de protección se comparan al cerrar esta fase. Detenido a la espera de autorización expresa; B05.2B.2 NO iniciada.



## B05.2B.2A — Preflight y respaldo privado (2026-10-27 Guatemala)

**COMPLETADA como verificación, respaldo ACL y ensayo sintético limitado. Corrección real NO aplicada; B00 sigue pendiente.**
Reporte detallado: B05_B00_ACL_PREFLIGHT_REPORT.md.

Usuario informó OneDrive desactivado manualmente. OneDrive.Sync.Service permanece presente; no se interpretó como sync activa. Sin Godot/Node/build/ejecutores observados,13s de vigilancia sin cambios y2 capturas completas iguales de ACL/metadata/FileId/ruta final antes de exportar. No es garantía universal o VSS: CIM denegado y154 rutas de procesos no visibles, sin elevar privilegios. Lecturas estables suficientes para respaldo de metadatos, sin escrituras en proyecto.

Inventario actual14.465 objetos (1.931 directorios/12.534 archivos), todo dentro de raíz,0 reparse internos/errores,0 archivos con NumberOfLinks>1 o identidades duplicadas. fsutil confirmó una ruta para .env/runtime/manifest/lease/csproj. Dos Allow explícitas raíz0x001301BF/OI|CI/Propagation=None confirmadas y4 Deny .git intactas; no se identificó como malicioso un SID desconocido.

Respaldo creado en:
C:\Users\luis2\AppData\Local\TwoSides\PrivateBackups\B05_ACL\20261028T041722158Z-6ab71a16-74f2-4e64-b35c-802bc18133dc
acl-descriptors.jsonl:28756910bytes; SHA-256 E9372D35D31E53F9C8B6A8A1FEE58ED846043B49DF889852D9DA3FF5A837ABF6.
manifest.json:1041bytes; SHA-256 4AA511264176F97DF26504ACCF350A148A74715F0D8B1B7D780F01B9CD942609.
Fecha UTC 2026-10-28T04:17:39.7607628Z (2026-10-27 22:17:39.7607628 Guatemala).
Creador LAPTOP-F337QTKK\\luis2, token no administrador. Herencia privada existente solo usuario/SYSTEM/Administradores; no se deshabilitó herencia ni cambió propietario para proteger backup. Incluye DACL/ACE/owner-grupo de referencia/flags/rutas/identidad, SIN contenidos de archivos, secretos o datos SQLite. Lectura completa, reconstrucción binario/SDDL, digest/cantidad/manifiesto/hash verificados; respaldos anteriores no sobrescritos.

Ensayo: árboles sintéticos privados,2 directorios+1 archivo por prueba. Adición Deny WriteData solo sintética, escritura denegada, restauración sección Access, escritura permitida. Se conservan intentos: uno falló antes de DACL por envoltura de array JSON corregida; desde DACL nuevas Windows añadió AutoInherited tras restaurar (ACE/acceso recuperados pero SDDL no exacto). El ensayo final partió de una nueva línea base ya AutoInherited y recuperó exactamente AccessSddl/owner/grupo/protección en3 objetos. Todos los14.465 originales usan ese modelo AI, pero ello NO prueba restaurabilidad masiva/.git o privilegios WRITE_DAC en proyecto. No se probó ni modificó owner/SACL. Artefactos/evidencias sintéticos retenidos en privado; no ocultar resultados previos.

Comparación posterior de los14.465 originales: DACL/owner/grupo/protección/FileId idénticos; backup y hashes originales intactos. .env COINCIDE con referencia histórica y metadata/SDDL igual. Tres bases y9 archivos asociados idénticos en hash/tamaño/fecha;1.571 archivos fuera del alcance documental idénticos. No lectura de valores ni SQLite/SQL/migraciones.

Alternativas: A retirar exclusivamente2 Allow raíz conserva4 Deny Git pero requiere autorización de propagación a runtime/.git y permisos de entorno compatibles; backup no equivale a permiso WRITE_DAC. B usar ubicación privada para futuros secretos fuera de OneDrive reduce exposición de secretos nuevos, no corrige ACL de código o exposición histórica; no se movió ninguno. Recomendar B aun si se aprueba A; rotación/carga de configuración por separado.

Próxima aplicación exige nuevo preflight/backup actualizado, control de escritores/enlaces/FileId, aceptación del alcance y rollback limitado de DACL con owner/herencia intactos. Si el entorno mantiene .git readonly, no sortearlo escribiendo el padre. No se ejecutó corrección de seguridad real, Godot/Node/Atlas/AWS/JWT ni B05.3. Únicos cambios en proyecto: reporte nuevo y propuesta/PHASES/PHASE_HISTORY/DECISIONS. Detenido, pendiente de autorización expresa.
