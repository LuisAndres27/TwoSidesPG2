# B09 — Investigación del origen de los SID de B00 (solo lectura)

Fecha: 2026-10-31. **No se modificó ninguna ACL, permiso ni propietario; no se abrió ningún archivo de credenciales ni `.env`; no se tocó Atlas, SQLite, Godot ni el backend; no se ejecutó ningún comando de reparación.** Solo se usaron: `LookupAccountSid`/`SecurityIdentifier.Translate`, `Get-Acl`, lectura de metadatos del registro (`ProfileList`, claves de OneDrive sin correos), `Get-CimInstance`, `Get-ScheduledTask`, `dsregcmd /status` (solo líneas de tipo de unión, sin identificadores), `git log` y fechas de archivos. **B00 sigue pendiente.**

SID A `S-1-5-21-452213140-3335518246-3718727391-3248334987` · SID B `S-1-5-21-307222809-3929607348-3502628415-466486063`

## 1. Hechos comprobados

| # | Hecho | Fuente |
|---|---|---|
| H1 | Ninguno de los dos SID **se resuelve** a un nombre (`LookupAccountSid`: error 1332, "no se asignó ningún nombre") | API local de Windows |
| H2 | Son SID de cuenta (`S-1-5-21-<3 subautoridades>-<RID>`), pero sus **identificadores de dominio difieren** del de esta máquina (`1972436287-3393038613-924685975`) **y entre sí**: A y B vienen de dos autoridades distintas | Comparación |
| H3 | Esta máquina: `WORKGROUP` (no pertenece a dominio, ni Entra ID join); sí tiene una cuenta "Workplace" registrada (`WorkplaceJoined: YES`) | `Win32_ComputerSystem`, `dsregcmd` |
| H4 | Cuentas locales: `Administrador`, `DefaultAccount`, `Invitado`, `luis2` (activa), `WDAGUtilityAccount`, `WsiAccount` — todas con el SID de esta máquina. Perfiles en disco: solo `luis2` y `WsiAccount`. Ni A ni B figuran en `ProfileList` ni en `HKEY_USERS` cargados | Registro, CIM |
| H5 | A y B **no están en el token de `luis2`**, no pertenecen a ningún grupo local, no son cuenta de ningún servicio (0) ni de tareas programadas (0). Recursos compartidos: solo `ADMIN$`, `C$`, `IPC$` | Token, CIM, SMB |
| H6 | Ninguna carpeta de OneDrive/Escritorio/Documentos/Descargas/Imágenes (95 directorios hasta profundidad 3) tiene A o B en su ACL. **Solo aparecen en `Two-Sides PRUEBA`** (explícitos en la raíz) | Escaneo de ACL |
| H7 | OneDrive Personal es dueño de `C:\Users\luis2\OneDrive`. Existe además una clave de cuenta **Business1** de OneDrive **sin carpeta vinculada** (cuenta de trabajo/escuela configurada antes y desvinculada) y una cuenta de trabajo registrada en el dispositivo. OneDrive **no sincroniza ACL NTFS** | Registro (sin leer correos), conocimiento de OneDrive |
| H8 | La raíz `Two-Sides PRUEBA` y su `.git` se **crearon el 2026-10-24 22:29:05**, 13 s después de `PRUEBA`; todos los archivos son posteriores a esa hora (0 con fecha de creación anterior). Es una **copia nueva en esta máquina**, no la carpeta original | Fechas de creación |
| H9 | La historia de Git se remonta a 2026-06-06 (primer commit) y el remoto es un repositorio de GitHub de otra persona del equipo; un `git clone` **no** transporta ACL, así que las ACE no vienen de GitHub | `git log`, `git remote` |
| H10 | `.git` lleva 4 ACE **DENY explícitas** (escritura/borrado/permisos) para A y B. Alguien o algo las puso a mano cuando ambos SID eran identidades resolubles | ACL |
| H11 | Los RID son altos y de aspecto no secuencial (`3248334987`, `466486063`); las cuentas locales y las de dominio clásicas usan RID pequeños y secuenciales desde 1000 | Valores |

## 2. Hipótesis (no comprobadas)

| Hipótesis | Apoyo | Contra |
|---|---|---|
| **Otro equipo o carpeta de origen:** el árbol se copió con sus ACL (por ejemplo con una herramienta que conserva seguridad, `robocopy /SEC`, restauración de copia de seguridad o desde un disco/equipo anterior) | H8 (copia nueva el 24-oct), H6 (solo este árbol), H10 (ACL puestas en el origen) | No se encontró rastro de la copia |
| **Cuentas de trabajo/escuela (Entra ID / dominio):** dos identidades de organización (la cuenta Business1 y la cuenta de trabajo registrada) con permiso de modificación | H7 (Business1, `WorkplaceJoined`), H11 (RID de aspecto derivado de la nube) | Los SID de ese tipo suelen aparecer como `S-1-12-1-…` en equipos unidos a Entra; no se puede vincular A/B con ese tenant sin consultar identificadores |
| **Cuentas locales antiguas de este mismo hardware** (reinstalación de Windows) | H3 muestra el SID actual distinto | Las cuentas locales de una instalación anterior comparten un único identificador de máquina; A y B tienen dominios distintos entre sí, lo que lo contradice |
| **Compartición con colaboradores** (el proyecto es de un equipo) | H9 | No hay recursos compartidos activos (H5); OneDrive no transfiere ACL |
| **Mecanismo de Windows o de una aplicación** que necesite acceso | — | No hay servicios, tareas, perfiles ni procesos que usen A o B (H4, H5); VS Code, Godot, Git, Node y OneDrive corren como `luis2` |

## 3. Origen: **no determinado**

No se puede establecer a qué cuentas pertenecen A y B ni cuándo se añadieron. Lo razonable es que fueran cuentas de otro equipo/organización cuyas ACL viajaron con la copia del 24-oct. Es una hipótesis, no un hecho. No hay evidencia de uso malicioso, ni de que alguien las esté utilizando.

## 4. Consecuencias de retirar sus permisos de `Two-Sides PRUEBA`

| Aspecto | Consecuencia |
|---|---|
| Este equipo | **Ninguna**: nada que corra aquí usa A ni B (H5). `luis2`, `SYSTEM` y `Administradores` conservan `FullControl` heredado de `C:\Users\luis2\OneDrive` |
| VS Code, Godot, Git, Node, Express, SQLite | Sin cambio: todos corren como `luis2` |
| OneDrive | Sin cambio: no sincroniza ACL y corre como `luis2` |
| Otro equipo / otra persona | Las ACL son **por copia**; otra copia del proyecto en otro equipo no se ve afectada. Si alguien accediera a *esta* copia con esas identidades (no hay compartición activa), perdería la escritura |
| Reversibilidad | Total: `acl-before.txt` (SHA-256 `16DD726B…CFA0`, 21 278 elementos) restaura el estado exacto con `icacls /restore` |
| Seguridad | Elimina la posibilidad de que identidades ajenas sustituyan código o lean secretos en este árbol. No resuelve el riesgo del mismo usuario |
| `.git` | Los 4 DENY de A/B quedarían inertes; se pueden dejar o limpiar después (decisión separada) |

## 5. Recomendación

**Retirar** los dos `Modify` explícitos de la raíz (comando mínimo de B08 §5.2: `icacls $root /remove:g $A $B`), y **conservar por ahora** los 4 DENY de `.git`.

Fundamento:
1. **Ningún mecanismo comprobado depende de A/B** en esta máquina (H4–H6).
2. Son identidades que **no pueden existir localmente** (dominios ajenos, sin perfil ni grupo): su único efecto práctico es abrir una superficie de escritura sobre el código y los secretos del backend.
3. El coste de equivocarse es **bajo y reversible** (respaldo íntegro verificado, restauración documentada, sin cambio de propietarios ni de herencia).
4. Mantenerlos obliga a aceptar indefinidamente un riesgo de integridad sin ningún beneficio demostrado, y bloquea el cierre de B00.

Una única condición razonable antes de aplicar: **confirmar tú** que ninguna otra persona o equipo (colaborador, equipo de la escuela/trabajo, otro portátil) accede a *esta* carpeta con esas identidades. Si dudas, la acción sigue siendo reversible. Si resultara que alguien necesita acceso, debe concederse a una cuenta nombrada y explícita, no a un SID huérfano.

Nota de proceso: al consultar cuentas guardadas, `cmdkey /list` mostró nombres de destino del Administrador de credenciales (no contraseñas ni tokens). No se copiaron al informe; se ignoran.

## 6. Estado

Sin cambios de seguridad. **Esperando confirmación explícita** para ejecutar B08 §5.2. B00 permanece pendiente.
