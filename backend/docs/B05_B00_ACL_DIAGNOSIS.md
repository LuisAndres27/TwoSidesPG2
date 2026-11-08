# B05.2A — Diagnóstico ACL de B00
2026-10-27 · Solo auditoría/diseño. No se aplicó ninguna corrección.

## Ruta, método y comparación
Archivo: C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\.env.
Raíz inspeccionada: C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA.
Get-Item muestra archivo, atributo Archive, sin ReparsePoint/LinkType. No se certifica ausencia de hardlinks o destino final de todos los ancestros: no se realizó una inspección de handles. OneDrive y Desktop tienen ReparsePoint con LinkType nulo; no se presume que sean un symlink arbitrario ni se identifica aquí el proveedor.

Se usó Get-Acl, traducción SecurityIdentifier→NTAccount, Get-LocalUser/Get-LocalGroup y token del propio proceso sin impersonación. Se consultaron solo ACL de cinco directorios ascendentes y cuatro muestras de la copia; no se enumeraron contenidos del proyecto original ni archivos del perfil. Hash únicamente para integridad, sin leer texto/variables. **Integridad: COINCIDE con la referencia histórica.** Modificación observada:2026-10-16T05:18:58.2771017Z; no se ajustaron fechas.

Propietario del archivo, backend y raíz: LAPTOP-F337QTKK\luis2. Herencia habilitada en los tres; archivo sin ACE explícitas. Se conserva en memoria un registro de SDDL/propietario de esos tres objetos para comparación posterior de esta auditoría; no se copiaron archivos o secretos. B00 registraba una ACE adicional0x1301bf; la ACE investigada sigue presente con esa máscara. El registro histórico incompleto no permite datar el segundo SID observado.

## ACL actuales identificadas
Para reducir repetición:
- SID A (investigado B00): S-1-5-21-452213140-3335518246-3718727391-3248334987.
- SID B (otro principal a evaluar): S-1-5-21-307222809-3929607348-3502628415-466486063.

| Principal | backend/.env | backend | raíz Two-Sides PRUEBA |
|---|---|---|---|
| SID A | Allow Modify,Synchronize, heredada | Allow M/S heredada, OI/CI | Allow M/S EXPLÍCITA, OI/CI |
| SID B | Allow Modify,Synchronize, heredada | Allow M/S heredada, OI/CI | Allow M/S EXPLÍCITA, OI/CI |
| NT AUTHORITY\SYSTEM | Allow FullControl heredada | FC heredada OI/CI | FC heredada OI/CI |
| BUILTIN\Administradores | Allow FullControl heredada | FC heredada OI/CI | FC heredada OI/CI |
| LAPTOP-F337QTKK\luis2 | Allow FullControl heredada | FC heredada OI/CI | FC heredada OI/CI |
| Everyone | No ACE en el archivo | Deny DeleteSubdirectoriesAndFiles heredada CI | Deny mismo derecho heredada CI |

OI=ObjectInherit, CI=ContainerInherit, sin NoPropagate. Archivo hereda como ACE efectiva sin flags de propagación. El Deny de directorio se origina explícitamente en OneDrive; lo heredan Desktop/PRUEBA/TWO SIDES PRUEBA/raíz/backend. No es Deny de lectura/escritura ni FullControl; no asumir que cancela todo Modify. FullControl declarado no es una prueba de éxito de borrado de hijos cuando otra ACE deniega un derecho. El grupo Windows Administradores no es un rol admin de la aplicación.

## Identificación y procedencia
Ambos SID fallan traducción con IdentityNotMappedException. No coinciden con usuarios/grupos locales devueltos por las consultas disponibles. Sus prefijos de cuenta no son el del usuario local actual y no están en el token consultado del proceso.

Conclusión exacta: **principales no resolubles actualmente en estas comprobaciones locales**. No existe evidencia suficiente de cuenta eliminada, atacante, dominio concreto, instalación anterior, servicio o herramienta que los añadió. No se realizaron búsquedas externas, cambios de grupos, prueba con otra cuenta o enumeración de tokens de otros procesos.

Cadena comprobada para A y B:
raíz Two-Sides PRUEBA (ACE explícita) → backend (heredada) → .env (heredada).
Los cinco ascendentes inmediatos consultados (TWO SIDES PRUEBA, PRUEBA, Desktop, OneDrive y perfil luis2) no contienen ACE de estos dos SID. El origen inmediato demostrado es la raíz de la copia, no un permiso heredado desde el Desktop. No se conoce la fecha/proceso que escribió las ACE.

Otros archivos con ambas ACE heredadas M/S comprobadas por muestra: backend/package.json, backend/docs/PHASES.md, scripts/Final.cs y scenes/levels/Final.tscn. Afecta por tanto más que .env. No se afirma inventario exhaustivo de descendientes: objetos con herencia protegida u otras ACL podrían diferir.

## Acceso comprobable y riesgo
Modify incluye lectura, escritura/añadido y eliminación del archivo; no equivale a permiso de cambiar ACL o propietario. Synchronize es coordinación de acceso, no un permiso de sincronización OneDrive. En .env no hay Deny observado que retire lectura/escritura a esas ACE. Si un token habilitado incluye esos SID y cumple los demás controles, esas entradas pueden contribuir a autorizar esos accesos.

El token del proceso identifica a luis2 y no contiene A ni B. Se verificó acceso de lectura a metadatos e integridad; no se probó escritura, borrado ni uso de credenciales. No se ejecutó AccessCheck completo sobre tokens ajenos, atributos de grupos restringidos, privilegios, integridad obligatoria, locks o políticas adicionales. Por ello no se declara que una cuenta activa específica esté usando el permiso ni que ninguna pueda usarlo.

Windows decide mediante ACE aplicables al token y su orden; una ACE huérfana/no resuelta no identifica por sí sola un usuario activo. [AccessCheck](https://learn.microsoft.com/en-us/windows/win32/secauthz/how-dacls-control-access-to-an-object). La propagación OI/CI explica las ACE observadas en hijos. [Reglas de herencia](https://learn.microsoft.com/en-us/windows/win32/secauthz/ace-inheritance-rules).

**Riesgo confirmado:** concesiones persistentes de lectura/modificación a dos principales no identificados/justificados en la copia y su archivo sensible. **Explotabilidad/compromiso: NO DETERMINADOS.** No se debe usar el archivo como almacén validado de secretos reales por conservar su hash. No demostrar uso indebido no justifica conservar acceso sin evaluar.

## Principales y permisos necesarios
- Usuario legítimo luis2: mantener su acceso de edición de proyecto y gestión autorizada de permisos. No reducirlo ni cambiar owner por inferencia.
- SYSTEM y Administradores Windows: conservar ACE existentes; no eliminarlas para “endurecer” sin necesidad.
- Godot, IDE, build y herramientas ejecutadas como luis2 normalmente usan ese token; no requieren un SID nuevo por nombre de aplicación. Esta fase no inventaría ni probaría sus tokens.
- Godot/build del flujo offline no requieren leer .env ni sus credenciales.
- Un futuro proceso Node solo necesita leer configuración privada si se autoriza; si usa identidad de servicio distinta, deberá especificarse y recibir solo lo necesario en su almacén, no FullControl global.
- OneDrive suele trabajar en el contexto del usuario, pero no se auditó su proceso/servicio; no se garantiza su funcionamiento tras cambiar ACL. Conservar el Deny existente y no añadir permisos a “OneDrive” por intuición.
- SID A/B: necesidad no demostrada. No son automáticamente maliciosos o descartables; posible dependencia de herramientas queda pendiente de validación.

## Corrección mínima propuesta para revisión, NO ejecutada
C1, estrictamente B00: retirar **solo la ACE Allow explícita de SID A, máscara0x1301bf, flags OI|CI, sin flags de propagación**, de la DACL de la raíz exacta de esta copia. Conservar todas las demás ACE, propietario, herencia y orden canónico. No aplicar un remove indiscriminado por SID a cada archivo ni una operación recursiva de reset.

Es una eliminación de UNA entrada en origen, pero su herencia puede cambiar ACL de muchos descendientes, incluidas escenas/archivos/almacén runtime. Por tanto **no es una autorización actual ni un cambio limitado al archivo .env**. Una futura ejecución necesita inventario de objetos afectados y autorización explícita de ese alcance; no tocar bases protegidas, metadata o archivos fuera de lo que esa autorización diga. Si no se autoriza ese impacto, C1 no se ejecuta.

C1 elimina la concesión investigada, pero SID B seguiría con M/S: NO bastaría para declarar seguros los secretos o resuelto todo el riesgo. C2 opcional y separada: retirar la ACE exactamente equivalente de SID B solo si tras evaluar su necesidad el usuario autoriza expresamente esa entrada. No incluirla automáticamente porque no se resuelve. Documento de aprobación debe enumerar A y, si corresponde, B.

Alternativa focalizada: proteger únicamente .env copiando las ACE heredadas a explícitas y retirar solo las dos autorizadas, conservando usuario/SYSTEM/Administradores. Requiere cambio de herencia expresamente aprobado y revisión de los derechos sobre backend/raíz; no evita por sí solo reemplazo/renombrado si un principal tiene permisos aplicables en ancestros. No se recomienda como solución completa sin ese análisis; no quitar todas las heredadas sin copiarlas.

Alternativa preferible para uso futuro de secretos: almacén privado fuera de OneDrive/repositorio, o gestor de secretos de servidor con identidad de workload, conservando juego offline sin dependencia de .env. Requiere ruta/namespace, permisos de ancestros, respaldo/cifrado, carga de config y rotación aprobados por separado. No se movió/copió ningún archivo.

## Riesgos de aplicación y reversión
Cambiar en raíz puede retirar acceso a una herramienta legítima no identificada, afectar OneDrive/automatización/compilaciones, y modificar herencia en objetos que no admitan escritura de DACL por el proceso. No prometer éxito completo ante errores parciales. No ejecutar con privilegios elevados por defecto ni continuar tras falla silenciosa.

Antes de aplicar C1/C2 en otra fase:
1. Confirmar raíz absoluta/copia y reparse/handles donde corresponda, proceso del usuario autorizado y ausencia de herramientas/escritores en conflicto.
2. Repetir DACL/owner/tamaño/fecha e integridad solo como comparación. Si difiere de esta evidencia, detener y revisar, no usar descriptor antiguo.
3. Inventariar únicamente metadatos de ACL de todos los afectados previstos, incluidos objetos protegidos contra herencia, sin seguir enlaces; acordar exclusiones/impacto de bases protegidas. Si no se puede garantizar el alcance, no aplicar.
4. Guardar respaldo PRIVADO de descriptores/owner/flags/rutas con nombre único y acceso autorizado; no respaldo del contenido de .env. No se creó ese respaldo ahora.
5. Construir DACL candidata en memoria, diferencia exacta de UNA/DOS ACE y reversión; verificar usuario/SYSTEM/Administradores y Deny ajenos intactos. Pedir aprobación de ese resultado y alcance.
6. Aplicar solo en la fase autorizada y verificar propagación por inventario; fallos parciales se informan, no reset global ni normalización oportunista.
7. Verificar archivo íntegro/mtime/owner y DACL candidata, muestras/bases sin cambios de contenido, usuario legítimo y herramientas con pruebas acotadas autorizadas. No probar credenciales reales ni Atlas para comprobar ACL.

Rollback propuesto: restaurar el descriptor DACL previamente capturado de los objetos realmente afectados, preservando el propietario actual esperado. Si hubo cambios concurrentes, detener y reconciliar, no sobrescribirlos con SDDL viejo. No usar takeown, no cambiar propietario, no restaurar contenido ni fechas ficticias. El respaldo debe permitir distinguir explícitas/heredadas/protección; verificar propagación y alcance tras restaurar. La capacidad del usuario para restaurar permisos debe comprobarse ANTES del cambio; propietario no equivale a garantía de cualquier operación del proceso.

No se ofrecen comandos ejecutables genéricos de corrección: el inventario y la identidad de B siguen pendientes y un comando ciego excedería el alcance seguro. Las comprobaciones y la corrección concreta requieren nueva autorización de B05.2B.

## Cierre de auditoría
No hubo Set-Acl, takeown, icacls de modificación, cuentas/grupos creados o eliminados, acceso al contenido, copia o movimiento de .env, cambios a código/SQLite/servicios. Descriptores de archivo/backend/raíz y metadata del archivo comparados antes/después; integridad COINCIDE. El diagnóstico no levanta B00 ni autoriza uso de secretos.

