# B00.2 — Resultado de inspección controlada de permisos e integridad

2026-10-29, America/Guatemala. **B00 NO RESUELTA. CANAL PARA C.2 NO CERTIFICADO.** Se hicieron consultas de solo lectura sobre la lista nominal descrita abajo. No se cambiaron permisos, propietarios ni contenidos. No se creó un canal ni se conectó Atlas.

## 1. Alcance ejecutado

Se revisaron los cinco informes requeridos y el plan [B00.1](B00_CREDENTIAL_ENVIRONMENT_SECURITY_PLAN.md). La lista autorizada quedó materializada como **92 rutas individuales**: 38 directorios y 54 archivos. No se usó recorrido recursivo, `private-workspace.ps1` ni una batería de pruebas.

Las 54 rutas de archivo fueron:

- Los 45 archivos del manifiesto histórico C.2A, enumerados por el §6 del plan B00.1: `backend/package.json`, `backend/package-lock.json`, `backend/scripts/atlas-revocation-schema-suite.js`; `backend/src/app.js`, `server.js`, `config/{jwt.js,server.js}`, `middleware/{authentication.js,authorization.js,rate-limiter.js,security.js,sync-auth-context.js}`, `modules/auth/{auth-service.js,credential-hasher.js,identity-repository.js,jwt-schemas.js,jwt-service.js,memory-repository.js,mongo-identity-models.js,mongo-identity-repository.js}`, `modules/identity/identity.js`, `modules/sync/{atlas-credentials.js,atlas-error-diagnostic.js,atlas-integration.js,atlas-listcollections-probe.js,atlas-namespace-preflight.js,atlas-policy.js,atlas-readonly-connector.js,atlas-readonly-probe.js,atlas-unfiltered-collections-probe.js,budget.js,canonical-envelope.js,errors.js,ingestion-engine.js,ingestion-repository.js,ingestion-service.js,mongo-authorization-fence.js,mongo-ingestion-repository.js,mongo-models.js,relations.js,routes.js,schemas.js}`, `utils/{errors.js,work-pool.js}` y `tests/jwt/env-guard.js`.
- El arnès C.2 adicional: `backend/scripts/durable-revocation-atlas-harness.js`.
- Los seis artefactos de referencia del canal C.2A ya consumido, solo como metadatos: `atlas-revocation-schema-receiver.js`, `send-atlas-schema-credential.ps1`, `schema-preflight-manifest.json`, `schema-attempt.started`, `schema-progress.jsonl`, `schema-result.json` bajo `C:\Users\luis2\AppData\Local\TwoSides\AtlasIntegrationTests\b054c2c-10ef4f6d653f4ee4a1d1b2e6591013c2`.
- Los ejecutables de sistema `C:\Program Files\nodejs\node.exe` y `C:\windows\System32\WindowsPowerShell\v1.0\powershell.exe`.

Los 38 directorios consultados fueron exactamente:

```text
C:\
C:\Program Files
C:\Program Files\nodejs
C:\Users
C:\Users\luis2
C:\Users\luis2\AppData
C:\Users\luis2\AppData\Local
C:\Users\luis2\AppData\Local\TwoSides
C:\Users\luis2\AppData\Local\TwoSides\AtlasIntegrationTests
C:\Users\luis2\AppData\Local\TwoSides\AtlasIntegrationTests\b054c2c-10ef4f6d653f4ee4a1d1b2e6591013c2
C:\Users\luis2\OneDrive
C:\Users\luis2\OneDrive\Desktop
C:\Users\luis2\OneDrive\Desktop\PRUEBA
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\node_modules
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\node_modules\@node-rs
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\node_modules\@node-rs\argon2
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\node_modules\jose
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\node_modules\mongodb
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\node_modules\mongoose
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\node_modules\zod
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\scripts
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\src
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\src\config
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\src\middleware
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\src\modules
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\src\modules\auth
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\src\modules\identity
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\src\modules\sync
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\src\utils
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\tests
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\tests\jwt
C:\windows
C:\windows\System32
C:\windows\System32\WindowsPowerShell
C:\windows\System32\WindowsPowerShell\v1.0
```

Cada consulta fue literal e individual. No se enumeraron otros hijos.

Las 92 consultas de ACL/propietario finalizaron sin error y todas las rutas existían. Se consultaron los atributos de esas mismas rutas para identificar reparse points. Para los 52 artefactos del proyecto y del canal C.2A se enumeraron los hardlinks con `fsutil hardlink list`; no apareció ningún segundo nombre. Estas operaciones no abrieron archivos protegidos ni leyeron credenciales.

## 2. Hallazgos confirmados

### 2.1 Riesgo B00 en la copia y sus dependencias

La raíz `C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA` conserva dos ACE **Allow explícitas**:

| Principal | Permisos | Herencia/propagación | Observación |
|---|---|---|---|
| `S-1-5-21-452213140-3335518246-3718727391-3248334987` | Modify, Synchronize | ContainerInherit + ObjectInherit; sin Propagation | Permanece sin resolver |
| `S-1-5-21-307222809-3929607348-3502628415-466486063` | Modify, Synchronize | ContainerInherit + ObjectInherit; sin Propagation | Permanece sin resolver |

Ambas entradas aparecen heredadas en las **66 rutas inspeccionadas dentro del proyecto**, incluyendo las fuentes del manifiesto, el arnès y las raíces de dependencias Node. Las 45 fuentes del manifiesto y el paquete instalado señalado pueden, por tanto, ser modificados por cualquier principal al que esos SID representen si su token permite aplicar las ACE. No se consultó token/grupos de otras cuentas y no se atribuye identidad, actividad ni intención a esos SID.

La raíz también hereda la ACE `Deny Everyone: DeleteSubdirectoriesAndFiles` observada desde OneDrive. Esa denegación no elimina los Allow de escritura/modificación y no es una protección suficiente contra sustitución de código. El propietario de las rutas del proyecto inspeccionadas es `LAPTOP-F337QTKK\luis2`; las ACE ordinarias de SYSTEM, Administradores y el usuario se mantienen. No se encontró una ACE explícita local adicional en los archivos de código inspeccionados que quite la herencia problemática.

**Evaluación:** riesgo de integridad confirmado, no evidencia de explotación. Un hash comprobado antes de ejecutar no cierra la posibilidad de sustitución posterior cuando la ruta sigue siendo modificable.

### 2.2 Directorio privado de referencia bajo LOCALAPPDATA

En los ancestros y seis artefactos del canal C.2A, propietario y DACL mostraron únicamente ACE heredadas Allow para el usuario actual (`FullControl`), SYSTEM (`FullControl`) y Administradores (`FullControl`). No aparecieron ACE adicionales en esos objetos. Las DACL no estaban protegidas contra herencia. Las rutas consultadas no tenían reparse point.

Esto es evidencia favorable frente a permisos concedidos directamente a otras identidades locales en los objetos consultados. **No certifica privacidad absoluta:** el usuario actual conserva control total, de modo que otros procesos con su mismo token pueden leer o reemplazar el material; SYSTEM y Administradores también son identidades de confianza con control. No se inspeccionó el token efectivo, los grupos habilitados, acceso de procesos ajenos ni controles de memoria/dumps. El canal C.2A está consumido y no se reutilizará.

### 2.3 Redirecciones, reparse points y hardlinks

`C:\Users\luis2\OneDrive` y su subdirectorio `Desktop` son Microsoft-tagged reparse points de tipo directorio. Esto confirma que la ruta del proyecto atraviesa puntos de integración de OneDrive; **no demuestra que haya sincronización activa**, ni se siguió el destino final. En las rutas nominales del proyecto, los directorios, las fuentes y las dependencias examinadas no se marcaron como reparse points.

No se encontraron hardlinks adicionales para los 52 archivos del proyecto/canal consultados. `powershell.exe` aparece como hardlink del archivo de Windows `C:\Windows\WinSxS\amd64_microsoft-windows-powershell-exe_31bf3856ad364e35_10.0.26100.9549_none_04d05158b23eb255\powershell.exe`. No se inspeccionó la ruta WinSxS porque no pertenecía a la lista autorizada. El ejecutable consultado tiene propietario TrustedInstaller y ACL de lectura/ejecución para Usuarios, SYSTEM, Administradores y paquetes de aplicaciones. `node.exe` tiene propietario SYSTEM y ACL de lectura/ejecución para Usuarios y Authenticated Users, y FullControl para SYSTEM/Administradores. No se verificaron firmas digitales ni la cadena de DLL de ninguno de los ejecutables.

No se resolvió por handle la ruta final de los reparse points, ni se comprobó FileId/volumen para todos los objetos. La revisión no prueba ausencia universal de redirecciones fuera de las rutas especificadas.

## 3. Integridad de fuentes y carga de dependencias

El hash SHA-256 actual del manifiesto no secreto del canal C.2A coincide con el valor registrado para ese manifiesto en el resultado de esquema. Sus **45 entradas de dependencia** coinciden con el SHA-256 actual de los 45 archivos correspondientes: 45/45, cero diferencias. Esto demuestra coincidencia con esa instantánea registrada, no procedencia auténtica ni protección futura: el manifiesto y las fuentes permanecen dentro de un entorno con ACE de escritura heredadas. El arnès añadido y los artefactos del canal no forman parte de esas 45 comparaciones.

La revisión de código documentada en B00.1 confirma que el receptor histórico carga código y dependencias desde el proyecto/`node_modules`, no desde un paquete aislado. Las ACL inspeccionadas en `node_modules` y las raíces de Mongoose, MongoDB, JOSE, Zod y Argon2 heredan los dos Allow del proyecto. No se inspeccionó cada archivo/transitiva, el cierre nativo real, módulos DLL ni otras dependencias cargadas dinámicamente. Por tanto, el cierre ejecutable no está completo ni certificado.

## 4. Clasificación de riesgos

| Riesgo | Clasificación | Evidencia y límite |
|---|---|---|
| Dos SID desconocidos con Modify/Synchronize en la raíz del proyecto | **Confirmado** | ACE explícitas actuales; heredadas en código y dependencias. La identidad/actividad de los SID sigue sin demostrarse |
| Modificación o sustitución de código del proyecto antes/durante una futura ejecución | **Confirmado como capacidad ACL** | Las ACE permiten Modify; no se comprobó que un token concreto las use ni se observó sustitución |
| Exposición del canal C.2A a un usuario distinto del actual | **No demostrada en los objetos consultados** | DACL de tres principales; no es una prueba de todos los mecanismos/tokens del sistema |
| Riesgo de proceso hostil con el mismo usuario, SYSTEM o Administradores | **Confirmado como límite del modelo** | Esas identidades tienen FullControl en el directorio de referencia; no hay aislamiento entre programas del mismo usuario |
| Destino final del reparse de OneDrive/Desktop o estado de sincronización | **Pendiente** | Reparse points Microsoft detectados; no se resolvió destino ni se verificó servicio de sincronización |
| Escritura en dependencias transitivas/nativas no listadas | **Pendiente, con riesgo** | Raíces observadas heredan los SID; cierre instalado no inspeccionado archivo por archivo |
| Sustitución entre hash e importación por ruta | **No mitigada** | 45/45 coincide ahora con el manifiesto, pero no hay paquete aislado inmutable ni barrera TOCTOU certificada |
| Compromiso, filtración o uso malicioso anterior | **No demostrado** | Esta inspección no encontró evidencia que permita afirmarlo o descartarlo globalmente |

## 5. Propuesta mínima, no ejecutada

1. **No usar el árbol del proyecto ni sus `node_modules` para ejecutar código que reciba la credencial.** Mantener C.2 bloqueada mientras el receptor importe módulos desde ese árbol.
2. Preparar, bajo autorización separada, una versión cerrada del receptor y su cierre finito de dependencias en un directorio fuera de OneDrive y del proyecto. La ruta debe fijarse antes de inspeccionarla. Separar código de solo lectura/ejecución de los resultados de un solo run.
3. Usar una identidad de ejecución no elevada. Si se requiere separar el runtime de otros procesos bajo `luis2`, evaluar una identidad de runtime distinta; una ACL que da FullControl al mismo usuario no separa sus procesos. No crear cuentas aquí.
4. Para el paquete nuevo, esperar que solo la identidad de despliegue de confianza pueda publicar código; runtime necesita lectura/ejecución y no escritura, borrado, cambio de DACL/propietario o creación en el árbol de código. La salida debe permitir solamente el run propio. Aplicar ACL solo si una inspección posterior demuestra que hace falta y recibe autorización independiente.
5. Verificar procedencia del paquete, rutas finales, identidad del archivo y dependencias antes del secreto; evitar imports por rutas modificables, carga dinámica fuera del paquete y resolución ambigua de ejecutables/DLL. Un hash debe compararse con un ancla independiente del mismo directorio modificable. Los controles de handles/TOCTOU requieren diseño y ensayo sintético propios antes de considerar el canal.
6. Conservar stdin/RAM, prompt oculto, sin argv/variables de entorno/archivos/logs para credenciales, límites de tiempo, proceso no elevado y cierre controlado. Estos controles reducen persistencia, pero no protegen contra código receptor comprometido o lectura de memoria por principal privilegiado.

No propongo retirar ahora las dos ACE de la raíz: su propagación afectaría a la copia completa, incluidos componentes fuera del canal. La corrección del B00 original debe permanecer en una fase independiente que valide alcance, respaldo y reversión. No retirar SID globalmente ni desactivar herencia. Para un canal futuro, el cambio mínimo preferible es aislar y proteger únicamente un paquete y una salida nuevos, no propagar una corrección por todo el proyecto.

## 6. Respaldo y recuperación propuestos

Antes de cualquier futura modificación de ACL: autorización expresa de las rutas exactas, inventario actual, respaldo privado nuevo de las DACL afectadas, verificación de reconstrucción/hash y ensayo de restauración sobre fixtures sintéticos. El respaldo histórico no prueba que el estado actual sea idéntico ni autoriza restauración masiva. No restaurar propietario/SACL ni sobrescribir cambios concurrentes sin autorización específica.

Si una futura comprobación falla antes de recibir el secreto, detenerse y preservar únicamente evidencia no secreta. Si se sospecha que una credencial fue expuesta, cerrar el proceso y tratarla como potencialmente comprometida; evaluación/rotación requieren autorización independiente. No reutilizar ni reactivar un canal consumido.

## 7. Recursos protegidos, limitaciones y cierre

No se abrió ni leyó `backend/.env`, SQLite runtime o bases históricas; tampoco Godot, datos de jugadores o claves JWT. No se verificó su integridad en esta fase para evitar acceder a esos recursos. No se modificó ningún archivo, ACL, propietario, usuario de Atlas o dato remoto; la única escritura de esta fase es este informe. No se ejecutó Node.js, Godot, pruebas, C.2, F.2 ni B05.5. No se solicitaron credenciales ni se conectó Atlas.

**Estado:** las consultas aclaran que LOCALAPPDATA no hereda las ACE B00 del proyecto y presenta una DACL limitada a usuario/SYSTEM/Administradores en las rutas revisadas, pero la protección frente al mismo usuario no existe. El código/dependencias candidatos heredan dos concesiones Modify no resueltas y se ejecutan desde el proyecto. La inspección no resuelve B00.

**Conclusión: NO APTO para preparar o activar ahora un canal nuevo de C.2.** Primero se requiere diseño offline de paquete aislado y de su cierre de dependencias; después, autorización específica para inspeccionar sus ancestros/rutas finales y controles. C.2 y F.2 permanecen detenidas. Esperar autorización independiente para cualquier corrección o preparación posterior.
