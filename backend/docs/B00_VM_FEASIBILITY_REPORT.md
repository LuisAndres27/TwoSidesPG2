# B00.4 — Evaluación de viabilidad de una VM para C.2

2026-10-29, America/Guatemala. **VIABLE CON CONDICIONES; aún no implementable ni certificado.** Esta evaluación fue de lectura y diseño. No creó/inició una VM, instaló software, alteró Windows, consultó ACL, ni conectó MongoDB Atlas.

## 1. Documentos, comandos y límites

Se revisaron los seis informes requeridos. Consultas locales no mutantes: lectura de valores de versión del registro de Windows, información de CPU/disk via APIs locales, consulta de registro del producto VirtualBox, búsqueda de ejecutables por rutas concretas, disponibilidad de comandos/servicios, CIM, contadores de memoria y estado de funciones opcionales.

El acceso CIM devolvió Access Denied. `Get-WindowsOptionalFeature` indicó que se requiere elevación. `systeminfo` terminó con código 1 sin devolver campos del sistema utilizables; el contador de memoria no pudo leerse. No se elevaron permisos ni se intentaron consultas de BIOS/UEFI, firmware, red o ACL que ampliaran el alcance. No se ejecutó VirtualBox ni `VBoxManage`.

## 2. Capacidades observadas

| Recurso | Evidencia local | Evaluación |
|---|---|---|
| Windows | Registro: `ProductName=Windows 10 Home Single Language`, `EditionID=CoreSingleLanguage`, `DisplayVersion=26H2`, `CurrentBuild=26300.9711`. Los valores ProductName/build no son coherentes entre sí. Microsoft publicó Windows 11 26H2 en la familia 26300; por tanto Windows 11 26H2 es una inferencia probable, no una identificación final. Verificar `winver`/Configuración antes de la implementación |
| Arquitectura/CPU | AMD64; registro identifica AMD Ryzen 5 8645HS w/ Radeon 760M; el host expone 12 procesadores lógicos. AMD especifica 6 núcleos/12 hilos y AMD-V en ese modelo |
| Virtualización de firmware | No verificada. La especificación del CPU admite AMD-V, pero no demuestra que SVM esté activado en UEFI/BIOS |
| RAM instalada/libre | No disponible por la restricción de consultas locales; CIM, contador y `systeminfo` no dieron datos. No se puede acreditar una asignación de RAM |
| Disco C: | 113,784,418,304 bytes libres de 510,866,223,104 (aprox. 106 GiB libres de 476 GiB) |
| VirtualBox | Registro de desinstalación y archivos concretos indican Oracle VirtualBox 7.2.16 (`VBoxManage.exe` y `VirtualBox.exe`, versión de archivo 7.2.16.174877 en `C:\Program Files\Oracle\VirtualBox`). El programa no está en PATH. No se lanzó, por lo que su estado funcional, driver y acceso efectivo no se prueban |
| Hyper-V | La edición registrada es Home Single Language. Microsoft no admite el rol Hyper-V en Windows Home. El estado de `VirtualMachinePlatform`/`Windows Hypervisor Platform` no se pudo leer. Se encontró `vmcompute.exe`, servicio detenido; eso no demuestra que el hipervisor esté activado |
| Windows Sandbox | No disponible por edición Home, si la edición del registro es correcta. No se intentó activar |
| Red/firewall | No se pudo verificar una política de salida ni las reglas de firewall. No se consultó DNS ni se contactó el clúster |

La identificación exacta del Windows anfitrión queda pendiente por la inconsistencia del registro: el nombre indica Windows 10 Home Single Language mientras `DisplayVersion=26H2`/build 26300 apunta a Windows 11 26H2. El estado `EditionID=CoreSingleLanguage` corresponde a Home Single Language, edición que no soporta Hyper-V o Sandbox según la documentación de Microsoft.

## 3. Hipervisor viable

### Windows Sandbox y Hyper-V

No son opciones viables en la edición Home registrada. Hyper-V requiere una edición compatible, CPU SLAT/VM Monitor Mode, virtualización de firmware activada y suficiente memoria; Sandbox requiere igualmente firmware habilitado y una edición admitida. No se cambia edición ni se habilitan funciones en esta fase.

### Oracle VirtualBox

VirtualBox 7.2.16 está registrado e instalado en una ruta concreta. Su manual 7.2 incluye hosts Windows x64 compatibles y Windows 10/11 como huéspedes. El CPU identificado soporta AMD-V. Esto da un candidato técnicamente razonable en Windows Home, **condicionado a verificar** que AMD-V esté activado en firmware, que el servicio/driver de VirtualBox funcione sin elevación de ejecución, que el estado del hipervisor Windows no cause conflicto y que haya memoria suficiente. La documentación de Oracle indica que, si corre Windows Hypervisor Platform/Hyper-V, VirtualBox puede usarlo con posible degradación; recomienda no ejecutar hipervisores competidores simultáneamente. El estado de esas funciones no se conoce aquí.

**Candidato:** una VM x86-64 única en VirtualBox, no Hyper-V ni Windows Sandbox. No se eligió una imagen/ISO ni se comprobó una licencia del huésped. No instalar ni reparar VirtualBox sin autorización separada.

## 4. Recursos para una VM C.2

Windows 11 en VM requiere como mínimo 2 procesadores virtuales, 4 GB de RAM y 64 GB de disco, además de sus requisitos de seguridad/configuración. Eso es un mínimo del sistema operativo y no garantiza buen rendimiento con Node.js, Mongoose, el controlador MongoDB, el addon nativo Argon2, el sistema de archivos y las pruebas.

Estimación de ingeniería para una sola ejecución limitada:

- 2 vCPU como base; 4 si hay margen.
- 8 GB de RAM invitada como objetivo operativo; 4 GB sería solo el mínimo del huésped. El anfitrión debe conservar memoria suficiente para su propio sistema. Como la RAM instalada/libre no pudo leerse, esta condición está **sin comprobar**.
- Disco dinámico con máximo de 80 GB para el invitado y el bundle, sin snapshots; es una estimación, no un requisito de Oracle/Microsoft. Los ~106 GiB libres actuales parecen suficientes en disco para un solo disco de ese máximo, dejando alrededor de 26 GiB si llega a llenarse. Se debe revalidar espacio inmediatamente antes de crear la VM y reservar margen para actualizaciones/temp.
- Sin asignación de GPU, USB ni virtualización anidada para C.2.

No hay resultados de benchmark. La VM no debe usarse para carga/estrés; C.2 tiene un número fijo y pequeño de operaciones.

## 5. Modelo de aislamiento recomendado

Una VM bajo la misma cuenta anfitriona `luis2` **no resuelve** el riesgo B00/same-user: un proceso hostil con el mismo token anfitrión podría manipular los archivos VDI/estado, sustituir la imagen antes del arranque o acceder al proceso de VirtualBox. Una cuenta estándar dentro del guest tampoco separa esos procesos del anfitrión. La VM protege frente a algunas fallas de aislamiento del guest, pero el anfitrión, administrador/SYSTEM e hipervisor siguen siendo parte de la base de confianza.

Arquitectura candidata, no creada:

1. Una cuenta local **anfitriona** dedicada y estándar `C2HostRunner`, separada de la cuenta de desarrollo. Iniciar sesión de forma interactiva en esa cuenta para el ensayo; no correr VirtualBox como administrador. No mantener simultáneamente sesiones/procesos del usuario de desarrollo que puedan acceder al mismo contexto de ejecución.
2. VDI/configuración bajo `C:\Users\C2HostRunner\AppData\Local\TwoSides\C2\<run-id>\`, accesible a esa cuenta y a las identidades de mantenimiento del sistema. Paquete e imagen aprobados previamente. La ruta solo es una propuesta: su existencia/ACL se verificará bajo autorización propia.
3. Una imagen invitada Windows x64 soportada y licenciada, actualizada durante preparación sin secretos, con usuario invitado estándar `C2Runner`; una cuenta de mantenimiento de la VM no participa en la ejecución. El invitado recibe un paquete de solo lectura desde ISO validado. No compartir carpetas del host durante la prueba.
4. Sin Guest Additions salvo necesidad demostrada. Desactivar shared folders, shared clipboard, drag-and-drop, USB passthrough, carpetas automontadas, sesión remota y todo dispositivo/redirección no requerido. VirtualBox tiene opciones para compartir carpetas/clipboard; dejarlas deshabilitadas reduce puentes entre guest y host.
5. Guardar solo salidas sanitizadas en `C:\Users\C2Runner\AppData\Local\TwoSides\C2\runs\<run-id>\` dentro del guest. No guardar credenciales en imagen, VDI, snapshot, pagefile intencionalmente exportado, log, argumento, entorno o archivo de canal. No capturar snapshot/estado suspendido después de introducir el secreto.

La creación de la cuenta anfitriona puede requerir privilegios administrativos. Si se requieren, deben autorizarse explícitamente como operación independiente; no se presupone ni se solicita elevación aquí. Si no puede establecerse una sesión host separada de forma verificable y no administrativa para ejecutar la VM, mantener C.2 bloqueada en este equipo.

## 6. Procedencia e integridad del paquete

El bundle debe contener solo el arnés C.2, los módulos first-party efectivamente cargados, configuración no secreta y todas las dependencias directas/transitivas/nativas exactas. Node se fija por versión/arquitectura; el resultado C.2A registró Node 24.19.0, Mongoose 9.11.2, mongodb 7.7 y otras versiones para esa fase, pero se debe cotejar la versión requerida por la fase C.2 antes de construir.

Fuente de confianza requerida: commit/revisión revisada y una firma/atestación aprobada por un custodio independiente; la clave pública/ancla debe estar en la imagen limpia o verificarse por un canal aparte, no confiarse al mismo ISO/VM. Construir el bundle desde esa fuente en un entorno confiable, con dependencias fijadas, contenidos de paquetes y binarios cotejados, inventario completo y firma del manifiesto. No ejecutar scripts npm de origen no verificado ni descargar dependencias durante la fase con credencial. Revisar módulos nativos de plataforma, DLL y resolución del loader.

Los 45 archivos de la instantánea C.2A coinciden con su manifiesto histórico, pero ese manifiesto está en el entorno de usuario y las fuentes actuales heredan permisos de escritura de los SID B00. **Copiar esos archivos y volver a calcular un hash no demuestra que sean confiables**: solo congela lo que haya en ese momento. Sin una fuente revisada y una firma/ancla independiente, el paquete no se admite.

Antes de importar, verificar firma y hashes en el invitado, ruta final, formato/tipo, ausencia de links/reparse/hardlinks no previstos, versión/arquitectura y destino fijo. Montar el paquete ISO en solo lectura; no ejecutar fuentes desde OneDrive, AppData de desarrollo, la staging host ni una carpeta compartida. La imagen/disco del sistema se actualiza antes de recibir credenciales y luego se congela para ese run.

## 7. Red y acceso Atlas

VirtualBox NAT permite tráfico de salida al exterior y NAT también presenta a la VM un camino al loopback del anfitrión en la configuración predeterminada; NAT por sí solo **no** es una regla de salida “solo Atlas”. Bridged networking no se propone. Host-only o red deshabilitada impedirían Atlas.

Para una fase remota futura se requeriría política deny-by-default comprobada, sin acceso a loopback/servicios LAN del host, que permita únicamente DNS requerido y los endpoints de réplica Atlas de `<cluster>.<id>.mongodb.net` en su puerto MongoDB. Las respuestas SRV/host/IP pueden cambiar; la lista debe obtenerse y revisarse inmediatamente antes de esa fase y limitarse a ese destino, conservando TLS/hostname. Debe comprobarse que reglas de host/guest realmente bloquean otros destinos. No se efectuó resolución DNS, conexión, ni verificación de reglas; esta capacidad es una condición pendiente y puede bloquear el plan si no se demuestra con la política disponible.

La política, si se prepara, debe incluir denegación de egress por defecto en el guest y un límite de red anfitrión para el usuario/proceso VM; permitir solo la lista temporal autorizada. No permitir acceso a subredes privadas, red de desarrollo, loopback del host, proxy con credenciales almacenadas ni otros servicios. No exponer ningún puerto entrante. Eliminar toda regla de run al destruir el entorno, bajo autorización separada.

## 8. Encaje con C.2 y restricciones de datos

La VM x64 puede alojar Node/Mongoose y las pruebas transaccionales en principio. Las transacciones Atlas fueron probadas en D.2E y el esquema C.2A ya creó ocho colecciones, cinco índices secundarios y fence inicial en `two_sides_integration_test`. No es necesario ni autorizado volver a aprovisionar ese esquema.

El preflight del arnés durable existe, con actores sintéticos, dos intercalaciones de revocación, errores/conflictos, reintento, recibo, reapertura y limpieza exacta. Sin embargo, la ejecución remota está bloqueada por código. La adaptación C.2 para reconocer el esquema de C.2A y el inventario actual de doce objetos debe revisarse/autorizarse por separado; el preflight antiguo no se salta silenciosamente. El modo Atlas continúa cerrado por defecto. Por tanto, no se declara que el arnés actual se ejecute en esta VM ni que C.2 esté lista.

Las pruebas solo podrán utilizar la base `two_sides_integration_test`, identidad/IDs sintéticos exclusivos de run y limpieza de los IDs creados por ese run. Deben abortar ante cualquier objeto/colección inesperado. No `two_sides_db`, no `twosides_backend`, no escritura fuera del esquema autorizado. No abrir `.env`, SQLite runtime/históricas, Godot, cuentas reales ni claves privadas.

## 9. Riesgos mitigados y residuales

| Riesgo | Mitigación esperada | Límite residual |
|---|---|---|
| SID B00 con Modify en el proyecto | El runtime no carga archivos del árbol OneDrive/proyecto; bundle firmado y solo lectura | Si la fuente se copió tras adulteración o firma no es independiente, el bundle puede ser malicioso sin desviarse del hash local |
| Proceso de desarrollo bajo `luis2` | VM iniciada desde una identidad anfitriona separada; sesión de desarrollo separada | No protege frente a SYSTEM/admin/hipervisor/firmware comprometido ni malware en la identidad dedicada |
| Escritura/sustitución del bundle | ISO read-only, verify inside guest, sin shares ni imports dinámicos | Host admin/operador que controla la firma, cambios en la configuración VM antes de la ejecución, vulnerabilidad del hypervisor |
| Persistencia de contraseña | Entrada directa dentro del guest, no archivos/snapshots, logs sanitizados y destrucción de VM | La contraseña existe en memoria; dumps/pagefile/crash capture/host privilegiado no pueden excluirse por completo |
| Red no deseada | Regla temporal deny-by-default de host+guest y Atlas-only | No verificada; DNS SRV puede cambiar; NAT solo no limita destinos y puede alcanzar loopback del host |
| OneDrive/ACL del proyecto | Ninguna carpeta compartida, paquete separado de solo lectura | ISO de staging puede ser sustituida antes de arrancar si no verifica una firma independiente |

## 10. Creación y destrucción futura (no autorizadas ahora)

### Puertas para crear

1. Confirmar edición/versión exacta del anfitrión con la interfaz del sistema y que el usuario anfitrión separado está autorizado. No actualizar Windows ni tocar BIOS en esta fase.
2. Obtener prueba local de AMD-V activado, estado de hipervisor/VirtualBox y memoria disponible mediante consultas autorizadas de lectura. No elevar automáticamente.
3. Confirmar licencia/imagen Windows invitada, mínimo de recursos y política de disco. Revalidar espacio libre; reservar 80 GB máximo más margen. Si RAM total es menor a 16 GB o la asignación 8 GB deja al host sin margen operativo, revisar el tamaño o declarar no viable; no inferir RAM de CPU.
4. Identificar commit fuente revisado, firma independiente, cierre de dependencias y el ajuste C.2 al esquema C.2A. Sin esos artefactos la VM sería solo un guest vacío.
5. Autorizar identidad/carpeta/ACL de la cuenta host, preparar imagen y bundle sin secretos, verificarlo sin red Atlas, probar usuario invitado estándar y salida limpia.
6. Diseñar y validar el egress Atlas-only con destinos vigentes y sin loopback/LAN; si no se demuestra, no introducir credenciales.
7. Revisar un preflight final de archivos, hashes/firma, configuración, destino, límites, IDs y limpieza. La activación de la contraseña y la conexión remota requieren autorización independiente de C.2.

### Destrucción y retención

Cerrar la conexión y procesos, exportar solo resultado/log sanitizado, apagar completamente guest/VirtualBox (sin guardar estado), quitar la regla de red temporal, eliminar la VM/VDI/ISO/staging/snapshots/config propios con inventario exacto y verificar que no quedan referencias. No eliminar archivos fuera del directorio de run. Conservar solo el informe sanitizado y evidencia no secreta requerida. En almacenamiento SSD/NTFS, paginación, snapshots o backups no se promete borrado físico seguro; la medida es no persistir la credencial deliberadamente y destruir el entorno/cifrado según la política previamente acordada.

## 11. Condiciones de autorización y conclusión

Requerirán nuevas autorizaciones independientes: crear una cuenta host estándar; instalar/habilitar componentes; crear imagen/VM/VDI/directorios y sus ACL; fuente/commit y firma del bundle; cualquier regla de firewall/red; cualquier canal de credenciales; conexión Atlas y ejecución de C.2; exportación/limpieza final. Este informe no concede ninguna de ellas.

No consulté credenciales ni secretos, no abrí `.env` o SQLite, no modifiqué ACL/Windows/Godot, no creé VM/disco/canal, no ejecuté C.2/F.2/B05.5 y no conecté Atlas. C.2A permanece como esquema histórico ya provisionado; C.2 y F.2 están bloqueadas; B00 sigue pendiente.

**Resultado: VIABLE CON CONDICIONES.** VirtualBox 7.2.16 es un candidato instalado compatible por documentación con un host Windows x64, y CPU/disco parecen adecuados. No puede avanzarse a implementación hasta verificar firmware, RAM, estado del hipervisor, licencia/imagen, identidad host separada, procedencia del paquete y filtrado de red. Una VM bajo `luis2` sin separación anfitriona no satisface el objetivo. No declarar el entorno seguro o certificado.

## Fuentes técnicas oficiales consultadas

- [Microsoft: requisitos de Hyper-V](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/host-hardware-requirements) y [ediciones admitidas para instalar Hyper-V](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/get-started/install-hyper-v?pivots=windows).
- [Microsoft: instalación/requisitos de Windows Sandbox](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-install) y [ediciones, red predeterminada y naturaleza desechable de Sandbox](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/).
- [Microsoft: requisitos de Windows 11 en máquinas virtuales](https://learn.microsoft.com/en-us/windows/whats-new/windows-11-requirements) y [anuncio oficial de la familia 26H2/build 26300](https://blogs.windows.com/windows-insider/2026/08/27/releasing-windows-11-version-26h2-to-the-release-preview-channel/).
- [AMD: especificaciones del Ryzen 5 8645HS](https://www.amd.com/en/products/processors/laptop/ryzen/8000-series/amd-ryzen-5-8645hs.html).
- [Oracle VirtualBox 7.2: instalación/hosts Windows](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/installation.html), [introducción y hosts x64](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/Introduction.html), [redes virtuales/NAT](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/networkingdetails.html), [uso con Hyper-V](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/EN-VBOX-7-2-USER.pdf) y [carpetas compartidas/clipboard/drag-and-drop](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/guestadditions.html).
