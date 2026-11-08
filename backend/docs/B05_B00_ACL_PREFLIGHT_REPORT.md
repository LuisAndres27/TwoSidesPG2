# B05.2B.2A — Verificación previa y respaldo ACL
Fecha del informe:2026-10-27, America/Guatemala.
**COMPLETADA como inspección, respaldo privado y ensayo sintético con alcance limitado. NO se aplicó la corrección real.**

## 1. Alcance y autorización
Raíz:
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA.

Se revisaron B05_B00_ACL_DIAGNOSIS, B05_B00_ACL_CHANGE_PROPOSAL, B05_IDENTITY_AND_SECURITY_PLAN y B05_IMPLEMENTATION_ROADMAP. La autorización actual permite metadatos, hardlinks, respaldo privado y restauración SOLO sintética; no retirar Allow reales, modificar DACL/herencia/owner/.git/.env/SQLite o implementar JWT/cola.

El usuario informó durante esta fase que OneDrive estaba desactivado manualmente en Windows y pidió no interpretar OneDrive.Sync.Service por sí solo como sync activa. Se respetó: no se terminó ni deshabilitó ningún proceso.

## 2. Identidad, procesos y estabilidad observada
Windows: LAPTOP-F337QTKK\luis2; token no administrador. PowerShell5.1/CLR4.0.30319.42000. whoami /priv solo mostró SeChangeNotifyPrivilege habilitado; no se activó SeRestorePrivilege/SeBackupPrivilege/SeSecurityPrivilege ni se cambió propietario.

Get-Process no detectó Godot/Node/dotnet/MSBuild/compilador ni ejecutores de pruebas del proyecto. No hubo ejecutable visible iniciado desde dentro de la raíz. Está presente OneDrive.Sync.Service; no hay evidencia suficiente para atribuirle sync de esta carpeta. Dos ventanas FileSystemWatcher de8s y5s no observaron cambios; además se obtuvieron DOS capturas completas iguales de ruta final, identidad de archivo, enlaces, tamaño/mtime/atributos y descriptores de todos los objetos antes de exportar.

Eso acredita estabilidad observable suficiente para este respaldo de metadatos, no ausencia universal de escritores o snapshot atómico VSS. Una consulta adicional CIM/Win32_Process fue denegada (0x80041003), y154 procesos no mostraban ruta de ejecutable a este usuario. No se elevó privilegio para inspeccionarlos. Tampoco se consultó telemetría privada/interna de OneDrive: su inactividad global no quedó certificada. La afirmación del usuario y la estabilidad medida no garantizan que ningún proceso escriba después.

El respaldo se rechazaba si aparecía proceso conocido de juego/build, cambio entre capturas, reparse inesperado, hardlink múltiple, error de lectura o destino final fuera de la raíz. No se utilizó el respaldo para modificar el proyecto.

## 3. Inventario previo confirmado
14.465 objetos en la fotografía de esta fase:1.931 directorios y12.534 archivos, incluidos ocultos/.git/.godot/.work/dependencias y la runtime. La diferencia con14.453 de B05.2B.1 es una fotografía posterior, no un número que se haya forzado; el manifiesto actual es la referencia concreta de este respaldo.

Se verificaron de nuevo las dos ACE EXACTAS de raíz:
| SID | Tipo/estado | Máscara | Herencia | Propagación |
|---|---|---|---|---|
| S-1-5-21-452213140-3335518246-3718727391-3248334987 | Allow explícita |0x001301BF Modify,Synchronize | OI/CI | None |
| S-1-5-21-307222809-3929607348-3502628415-466486063 | Allow explícita |0x001301BF Modify,Synchronize | OI/CI | None |

Raíz conserva6 ACE; la corrección propuesta seguiría retirando solo esas2. Las4 Deny explícitas de .git permanecen; no se confunden con grants. A/B continúan sin identidad justificada: desconocido no equivale a malicioso/eliminado.

El respaldo contiene ACE ordenadas con SID/type/mask/Inherited/Inheritance/Propagation y binario/SDDL de seguridad legibles. Se comprobó que raíz tiene las2 Allow originales y .git sus4 Deny. Los14.465 descriptores originales tienen marca DiscretionaryAclAutoInherited; no hubo cambio de ese modelo en el proyecto.

## 4. Hardlinks, enlaces y alcance
Primero fsutil hardlink list en modo lectura para .env, runtime/save.sqlite3, ownership.json, store.lease y TwoSides.csproj: una ruta por archivo.
Después recorrido completo con handles Windows abiertos solo para FILE_READ_ATTRIBUTES, OPEN_REPARSE_POINT/BACKUP_SEMANTICS y compartición lectura/escritura/borrado, sin leer contenido. Se consultaron GetFileInformationByHandle (volumen/ID/NumberOfLinks) y GetFinalPathNameByHandle.

Resultados:
-14.465 objetos con ruta final dentro de la raíz exacta.
-12.534 archivos con NumberOfLinks=1; cero archivos multienlace.
-Cero identidades volumen+FileId duplicadas entre archivos del inventario.
-Cero reparse points internos omitidos y cero errores de inspección.
-Raíz/backend/local-persistence son directorios normales en esta fotografía. Hardlinks de archivo no se confunden con directorios/junctions.
-.env y los3 archivos runtime inspeccionados tienen1 enlace y ruta final propia dentro del proyecto.
-OneDrive/Desktop ascendentes conservan el antecedente de ReparsePoint; no se siguieron hacia otro proyecto. Los destinos finales medidos dentro de la copia no escaparon. No se certifica otro estado futuro del proveedor cloud.

No apareció hardlink relevante que exigiera listar alias adicionales. Si en la futura aplicación cambia NumberOfLinks, FileId, reparse o ruta final, esta evidencia deja de ser suficiente: detener y documentar TODAS las rutas identificables antes de tocar DACL. No se crearon/eliminaron enlaces.

## 5. Respaldo privado creado y verificado
Directorio exacto:
C:\Users\luis2\AppData\Local\TwoSides\PrivateBackups\B05_ACL\20261028T041722158Z-6ab71a16-74f2-4e64-b35c-802bc18133dc

Archivo principal: acl-descriptors.jsonl.
-Objetos cubiertos:14465.
-Tamaño:28756910 bytes.
-SHA-256:E9372D35D31E53F9C8B6A8A1FEE58ED846043B49DF889852D9DA3FF5A837ABF6.

Manifiesto: manifest.json.
-Tamaño:1041 bytes.
-SHA-256:4AA511264176F97DF26504ACCF350A148A74715F0D8B1B7D780F01B9CD942609.
-Tamaño de los2 archivos principales:28757951 bytes; no incluye fixtures/evidencias sintéticas añadidas después.
-Creación UTC:2026-10-28T04:17:39.7607628Z.
-Equivalente America/Guatemala:2026-10-27 22:17:39.7607628 (UTC−06:00).
-Creador:LAPTOP-F337QTKK\luis2; token Windows NO administrador. Permiso de ejecución fuera del workspace no implicó elevación UAC de Windows.

La ubicación autorizada bajo AppData\Local\TwoSides\PrivateBackups\B05_ACL está fuera de Git/OneDrive. AppData, Local y TwoSides existentes no mostraron reparse. Las nuevas carpetas heredaron exclusivamente Allow FullControl de usuario legítimo, SYSTEM y Administradores; se verificó privacidad después. **No se deshabilitó herencia ni se modificaron ACL de esas carpetas para proteger el respaldo**: la herencia privada existente ya satisfacía el criterio. No se creó un directorio en el namespace anterior SecurityBackups de la propuesta; se usó PrivateBackups indicado por la autorización actual.

Contenido de cada registro: ruta relativa/real, tipo, volumen+FileId/enlaces, tamaño/fecha/atributos de referencia, owner/grupo, protección/canonicalidad, AccessSddl, binario del descriptor disponible y ACE ordenadas. No hay contenido de .env/SQLite/código/Git/configuración, contraseñas, tokens o conexiones. No es un backup de partidas.

Verificación realizada:
1. Dos inventarios completos inmutables coincidentes antes de exportar, con identidad de objetos y metadatos.
2. Archivo nuevo con nombre/directorio UUID/UTC únicos, escritura durable y sin sobrescribir otro backup.
3. Lectura de TODAS las líneas, count exacto y validación de rutas relativas sin traversal.
4. Reconstrucción RawSecurityDescriptor desde binario; Access SDDL coincide con el campo guardado.
5. Digest del JSON normalizado leído de vuelta coincide con el capturado en memoria.
6. Manifiesto corresponde a raíz/RootFileId/cantidad/hash; hash del archivo principal y manifiesto volvió a coincidir después del ensayo.
7. Comparación posterior de los14.465 objetos originales: mismo FileId, DACL/owner/grupo/protección, sin diferencias.

El hash es evidencia de integridad accidental, no una firma que resista a un administrador capaz de reescribir archivo y manifiesto. No se eliminaron automáticamente evidencias ni otros respaldos.

## 6. Ensayo sintético de restauración
Solo bajo el directorio privado del respaldo, en árboles synthetic-<UUID>. Se conservaron archivos de evidencia con nombres únicos. No se ejecutó restauración en ningún objeto real.

Procedimiento: crear2 directorios y1 archivo sintético, capturar AccessSddl/owner/grupo/protección, guardar/leer backup JSON, añadir Deny WriteData al usuario actual sobre el directorio sintético con OI/CI, comprobar herencia al archivo y denegación de escritura, restaurar únicamente sección Access del directorio desde el registro y verificar propagación/permiso. Sin SetOwner, takeown, cambio de protección de herencia o privilegios elevados. La única DACL de escritura fue el directorio sintético.

Resultados y limitaciones conservados, sin ocultar intentos:
-Intento inicial detenido ANTES de modificar DACL: lectura del array JSON quedó envuelta en otro array por PowerShell5.1; se corrigió el lector, no el backup real JSONL.
-Dos ensayos desde DACL recién creadas restauraron las ACE/acceso y conservaron owner/grupo/protección, pero Windows añadió AutoInherited. SDDL original D: y posterior D:AI no eran idénticos. El intento de reescribir una ACL no marcada como modificada antes del baseline no preparó esa marca, por lo que tampoco se presentó como éxito.
-Se tomó una NUEVA línea base del árbol sintético ya restaurado y naturalmente AutoInherited, el mismo modelo de control encontrado en todos los objetos originales; se repitió la adición de Deny y restauración.

Ensayo final:
-Árbol:C:\Users\luis2\AppData\Local\TwoSides\PrivateBackups\B05_ACL\20261028T041722158Z-6ab71a16-74f2-4e64-b35c-802bc18133dc\synthetic-9cf7fe83-0ccd-41fb-af3b-855097022fd4.
-3 objetos comprobados.
-Modificación DACL detectada;1 Deny heredada de prueba en el archivo.
-Escritura denegada antes de restaurar y permitida después.
-**Access SDDL, owner, grupo y protección exactamente iguales a la línea base final en los3 objetos.**
-Herencia no deshabilitada, propietarios no modificados, proyecto no escrito.
-Hash del baseline sintético final:72E86324A6A5FBD3F5E682EE9BD344789269DEFB9E0C9FCB483D37CA663ADABC.
-UTC del resultado:2026-10-28T04:21:31.5586135Z.
-Evidencia synthetic-restore-result-<UUID>.json en el directorio privado; resultados anteriores false se conservan junto al resultado final true.

Este éxito demuestra reversión en3 objetos privados propios con ese modelo; NO garantiza restaurabilidad de14.465 objetos, una operación masiva, tokens restringidos o .git. Los ensayos con DACL no AutoInherited muestran explícitamente una diferencia de control que la operación definitiva debe detectar/explicar, no borrar con una comparación superficial de permisos.

## 7. Privilegios y restauración definitiva planificada
READ_CONTROL/lectura de atributos alcanzó todos los objetos inventariados. WRITE_DAC se demostró solo sobre objetos sintéticos propios. No se abrió ningún objeto real con intención de escribir DACL para “probar permisos”, no se activaron privilegios de backup/restore/seguridad y no se cambió owner.

El permiso suficiente para RESTAURAR toda la copia real sigue sin certificarse. .git es de solo lectura en el perfil de la herramienta; no se permite sortear ese límite modificando el padre para provocar una propagación no autorizada. La futura aplicación requiere permisos de entorno compatibles y autorización específica que incluya alcance completo/rollback. Ser owner o tener ACE FullControl no prueba que un proceso restringido pueda hacerlo.

El respaldo registra owner/grupo, pero el procedimiento actual solo restaura Access/DACL. No copia ni restaura SACL/auditoría/etiquetas de integridad y no autoriza restaurar propietario. No llamarlo “restauración completa de todo el descriptor de Windows”. Si owner/SACL cambian por otra actividad, detener para una autorización y diseño diferentes.

Procedimiento definitivo propuesto para futura autorización:
1. Mantener escritores coordinados; repetir procesos/estado OneDrive/identidad, inventario, hardlinks/final-path y comparación de ambas tuplas exactas. Nuevo fichero/descriptor o cambio no aprobado→detener/revisar.
2. Crear NUEVO backup privado actualizado con lectura/reconstrucción/hash verificadas; el de esta fase no debe sustituir baseline futuro si el proyecto cambió.
3. Construir solo DACL candidata de raíz con las2 Allow retiradas,6→4; mantener4 Deny de .git, owner/grupo, protección/herencia y demás ACE.
4. Aplicar únicamente con autorización del alcance de propagación a runtime/.git/artefactos, nunca con remove por SID indiscriminado ni reset masivo.
5. Registrar objetos modificados/resultados; propagación no es una transacción. Comparar inventario después y verificar integridades.
6. Ante fallo parcial, rollback limitado de DACL raíz y después objetos realmente divergentes desde backup con identidad validada; preservar owner/SACL/herencia, no convertir heredadas en explícitas ni pisar cambios concurrentes. No borrar objetos nuevos o restaurar datos/fechas.
7. Ensayos de build/SQLite solo en fixtures y apertura manual de Godot requieren alcance propio. No usar el guardado manual como prueba de escritura.

## 8. Dependencias que podrían perder acceso
| Dependencia | Hecho y límite |
|---|---|
| luis2/SYSTEM/Administradores | FullControl declarado se conservaría; prueba sintética no garantiza todo acceso real/restringido. |
| Godot | No ejecutándose en observación; identidad de su proceso futuro no probada. Abrir manualmente tras autorización. |
| .NET/compilación | Sin procesos build observados; SDK externo no cambia, cachés/outputs dentro de copia sí heredarían nueva DACL. No se compiló. |
| VS Code/Codex | IDE puede mantener documentos abiertos sin escribir. Token de esta ejecución es luis2, pero no se caracterizaron todos los tokens/restricciones; .git readonly permanece una puerta. |
| Git | Deny específicas se conservan. Leer ACL no prueba poder realizar operaciones de escritura Git. |
| OneDrive | Usuario informa desactivado; servicio presente no prueba actividad. No deshabilitado por Codex. Copias cloud/retención/acceso remoto no auditados. |
| SQLite | Ninguna apertura SQL. Runtime/manifest/lease heredarían cambio de DACL; datos permanecen protegidos. Dos bases AppData fuera del origen. |
| Node.js | No ejecutado; identidad de un futuro servicio y su lectura de secretos requieren diseño aparte. |
| Backup | Usuario no elevado pudo leer todos los descriptores, crear backup privado y restaurar fixture. Credenciales del entorno y permisos efectivos futuros no están garantizados. |

Los SID desconocidos no fueron atribuidos a esas herramientas ni declarados innecesarios de forma universal. No se puede verificar todo acceso posterior sin aplicar el cambio real, que sigue prohibido.

## 9. Alternativas
| Criterio | A: retirar2 Allow de raíz | B: futuros secretos en almacén privado independiente |
|---|---|---|
| Beneficio | Retira concesiones no justificadas de código/proyecto y archivo sensible | Evita que secretos nuevos dependan de permisos/replicación de esta copia OneDrive |
| Alcance | Propagación de DACL a miles de objetos, runtime y .git | Nueva ubicación privada y configuración de carga; no necesita tocar ACL de la copia para el secreto nuevo |
| Reversión | Backup DACL, inventario y permisos reales aún por validar; no atómico | Revertir configuración/ref protegida conservando el secreto; copia/movimiento/rotación requieren autorización |
| Dependencias | Riesgo de herramientas restringidas/OneDrive y errores parciales | Requiere gestión de secretos/custodia/identidad de servicio/backup fuera del repo |
| Límites | No prueba que secretos expuestos antes sigan seguros ni elimina acceso por otros grupos/admin | No corrige la integridad/acceso del código, ACL A/B de la copia siguen si no se aplica A |

Recomendación: planificar B para secretos operativos futuros incluso si se aprueba A; aplicar A solo tras autorización concreta de alcance y reversión. No mover secretos aquí. Rotación por posible exposición previa requiere evaluación/autorización independiente; no se leen credenciales para decidirlo.

## 10. Integridad y estado de cierre
.env: **COINCIDE con referencia histórica**; no contenido mostrado/leído como texto/copiado. Owner/SDDL/herencia/atributos/mtime se conservan.
Tres bases protegidas y9 archivos asociados: hash/tamaño/fecha sin cambios; no SQLite, migraciones, restauración de partidas o exportación de datos.
Comparación original del backup:14465 objetos,0 diferencias en DACL/owner/grupo/protección/identidad;2 Allow de raíz y4 Deny explícitas .git intactas. El reporte nuevo y las actualizaciones de documentación son posteriores a esa captura; no se anuncian cubiertos por un backup anterior.

Cambios autorizados: este reporte nuevo, B05_B00_ACL_CHANGE_PROPOSAL y PHASES/PHASE_HISTORY/DECISIONS; backup/metadatos/fixtures privados fuera del proyecto. No producción, JWT, servidores, Godot, Atlas/AWS, nueva cola B05.3 ni corrección real.

La fase cumple el respaldo verificado y un ensayo final satisfactorio en alcance sintético, con las limitaciones anteriores. **No habilita la aplicación real ni declara B00 resuelto.** Esperar autorización expresa para la siguiente fase; el texto de autorización debe enumerar ambas Allow, alcance de propagación (.git/runtime incluidos), backup actualizado, permisos compatibles y rollback permitido.

