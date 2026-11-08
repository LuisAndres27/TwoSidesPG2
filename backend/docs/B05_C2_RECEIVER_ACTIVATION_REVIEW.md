# C.2 — Revisión final del receptor y riesgos residuales

Fecha: 2026-10-29. Parte de `B05_C2_RECEIVER_OFFLINE_PREPARATION_RESULT.md`. El receptor no se rehízo ni se tocó (los SHA-256 de `c2-receiver-core.js`, `c2-receiver-entry.js` y `c2-receiver.ps1` son los mismos del informe anterior).

**Conclusión corta:** no hay ningún bloqueo técnico que exija una máquina virtual ni la resolución de B00. Para autorizar **una** ejecución C.2 limitada faltan seis cosas concretas (§9), de las cuales solo una (la release nueva con la conexión real) es trabajo de ingeniería importante; el resto son comprobaciones y decisiones de pocos minutos. **B00 no se declara resuelto.**

No se conectó Atlas, no se pidió ninguna contraseña real, no se habilitó el receptor, no se modificó ninguna barrera de autorización ni ACL, SQLite, Godot o `backend/.env` (este último solo se consultó por ruta, atributos y permisos; no se abrió).

## 1. Las tres barreras de activación

| # | Barrera | Dónde vive | Qué impide |
|---|---|---|---|
| 1 | Compuerta de un solo uso: manifiesto `c2-remote-once`, `remoteEnabled:true`, destino exacto, ejecución = RunId, escenarios `A,B,C`, ventana ≤ 4 h, digest externo | `c2-receiver.ps1` (`Test-C2Activation`) y `c2-receiver-core.js` (`assertActivation`), duplicada a propósito | Que el lanzador pida el secreto o el hijo lo lea |
| 2 | Sin fábrica de conexión | `c2-receiver-entry.js` (`openIntegration` siempre rechaza; no importa `mongoose`) | Que, con la compuerta abierta, exista una conexión |
| 3 | Política y ejecución | `atlas-policy.js` rechaza la capacidad C.2 (`persistenceTest`); `executeDurableAtlasRun` lanza `DURABLE_REVOCATION_C2_NOT_AUTHORIZED` | Que, con 1 y 2 abiertas, se conecte o se ejecute algo |

**Cada una cierra por sí sola** (prueba AR01, con los módulos reales): con la compuerta 1 cerrada y las otras dos "abiertas", rechaza y no escribe nada; con la 2 cerrada, rechaza con `CONNECTION_REJECTED`; con 1 y 2 abiertas, la política rechaza la configuración y el conector no se llama; con las tres primeras abiertas, `executeDurableAtlasRun` falla y la limpieza no corre.

**Comprobaciones de que no se omiten por accidente:**
- AR03 ejecuta el **punto de entrada real** (copia de las fuentes reales en un paquete sintético, `node_modules` por junction), lanzado como lo hace el lanzador (.NET, entorno limpio): con la compuerta **abierta** y una credencial ficticia por stdin termina en `CONNECTION_REJECTED`, `atlasConnected:false`, salida 1, sin stdout ni stderr, sin secreto en ningún archivo. Un segundo intento sobre el mismo run se rechaza sin tocar el resultado. Con el manifiesto offline sellado, con una variable sobrante o con un digest que no coincide, rechaza **antes** de reclamar el run o leer el secreto. El control con entorno y digest correctos sí llega al paso de conexión, así que los rechazos anteriores son reales.
- AR02: la cadena `c2-remote-once` solo aparece en `c2-receiver-core.js` y `c2-receiver.ps1`: **no existe ningún generador** de manifiestos de activación. `executeDurableAtlasRun` solo lo referencian la entrada del receptor, la entrada offline y el propio arnés.
- Sobre la copia sellada real (solo lectura): el lanzador rechaza con `activation` y el secreto no se solicita.

**Debilidades reales (no explotadas):**
1. La barrera 1 depende del digest que el usuario aporta. Si se genera un manifiesto nuevo y se pasa su propio digest desde el mismo equipo, la barrera 1 se abre. Las barreras 2 y 3 siguen cerradas, y abrirlas obliga a editar archivos sellados, es decir, a sellar una release nueva con un digest nuevo. No es accidental, pero depende de que el digest venga de un medio independiente (§5).
2. El lanzador no puede verificar su propio hash antes de ejecutarse; el control es correr `c2-verify-reference.ps1` primero.
3. Las dos copias de la compuerta (PowerShell y JS) pueden divergir; si lo hacen, fallan cerradas (basta con que una rechace).

## 2. Alcance efectivo del tercer SID (`…-3326500402`, "SID C")

Consultas de solo lectura; no se cambió ningún permiso y no se atribuye actividad.

| Hecho | Resultado |
|---|---|
| Dónde está la ACE | Explícita (no heredada) en `C:\Users\luis2\AppData\Local\Temp`: `Allow Modify, Synchronize`, con herencia a carpetas y archivos |
| Dónde NO está | `AppData`, `AppData\Local`, `TwoSides`, `C2Runtime` (y sus 2.780 objetos), `~/.claude`, el árbol del proyecto, la carpeta de respaldo |
| Alcance dentro de Temp | De los primeros 20.000 objetos de Temp, 19.908 la tienen (heredada); 91 carpetas, creadas por programas con ACL propia (`AMDAutodetect`, `hsperfdata_luis2`, `two-sides-acquisition-28O-*`…), no la tienen; 1 ilegible |
| Cuenta | No resuelve a ninguna cuenta de esta máquina; no está en el token del usuario; su prefijo de autoridad difiere del del equipo (`S-1-5-21-1972436287-…`) y de los otros dos SID |
| Cuentas locales | Solo `luis2` está habilitada. `Administrador`, `Invitado`, `DefaultAccount`, `WDAGUtilityAccount` y `WsiAccount` están deshabilitadas |
| Qué puede hacer | Crear, modificar y borrar dentro de Temp. Es una **capacidad de acceso**, no un hecho de uso |
| Qué depende de Temp en el flujo C.2 | **Nada**: ver §3. El lanzador no usa `Add-Type`, `GetTempPath` ni `%TEMP%` |
| Residuo en Temp | Cuatro ensamblados `two-sides-27DR-*.dll` (≈46 KB, 24-oct) de fases anteriores, en una ubicación modificable. No los carga el receptor |

Los tres SID comparten el mismo patrón de ACE (`Modify, Synchronize`, heredable) y los tres son prefijos distintos que no pertenecen a esta máquina. Una explicación posible es que una herramienta de aislamiento conceda esos permisos a identidades sintéticas sobre el directorio de trabajo y el temporal. **No está demostrada**: el token del PowerShell de esta sesión no es restringido ni tiene SID restrictivos.

Hallazgo relacionado: `spawnSync` de Node, lanzado desde la herramienta Bash de esta sesión, **añade 10 variables** (`HOMEDRIVE`, `HOMEPATH`, `LOGONSERVER`, `PATH`, `SYSTEMDRIVE`, `TEMP`, `USERDOMAIN`, `USERNAME`, `USERPROFILE`, `WINDIR`) al hijo aunque se le dé un entorno explícito, mientras que `System.Diagnostics.Process` desde PowerShell entrega **exactamente** lo indicado. Esto no afecta al lanzador real (usa .NET; AR04 comprueba 8 nombres exactos), pero invalidaba la prueba RX16 como comprobación del entorno (pasaba por una razón distinta). AR03 la sustituye. Puede indicar una capa de interposición propia de esa herramienta; no se pudo confirmar.

**Verificaciones cheap que sigue pudiendo hacer el usuario (solo lectura):** ver si el SID aparece únicamente en el directorio de trabajo y en `Temp`; ver si desaparece de sesiones nuevas con el aislamiento de la herramienta desactivado; buscar en la configuración de la extensión si el aislamiento está activo. No se hizo.

## 3. Directorio temporal exclusivo de la ejecución

- El lanzador fija `TEMP` y `TMP` a `<release>\temp` y limpia el resto del entorno; `PATH` es solo `System32`. No usa `Add-Type`, `GetTempPath`, `%TEMP%` ni archivos temporales.
- **Verificado con el flujo completo (AR04)**, con un hijo sintético y credencial ficticia: `TEMP`, `TMP` y `os.tmpdir()` del hijo son exactamente `<release>\temp`, distintos del Temp del usuario; el directorio de trabajo es `package`; `PATH` es `System32`; el hijo ve exactamente 8 nombres de variable.
- **Brecha confirmada (baja):** el núcleo del hijo solo exige `TEMP === TMP`, no que sea el `temp` de la release (RX04 acepta `C:\t`). Hoy lo cubre el lanzador; si alguien invocara el hijo con otro lanzador, el núcleo no lo detectaría. Corrección para la release nueva: `TEMP` debe igualar `join(dirname(packageRoot),'temp')` y estar **vacío** al arrancar.
- **Residuo confirmado (baja):** `temp/node-compile-cache` tiene 542 archivos y `support/npm-cache` 50, fuera del manifiesto. Ninguna fuente activa la caché de compilación, pero la nueva release debe usar un temporal vacío por ejecución e incluir ambos directorios en la regla de inventario.
- `LOCALAPPDATA` sí se pasa al hijo; ningún código lo usa para escribir.

## 4. Riesgo de `backend/.env` (solo rutas, permisos y documentación)

El archivo **no se abrió ni se hasheó**.

| Aspecto | Hecho |
|---|---|
| Archivo | `backend\.env`, 278 bytes, modificado 2026-10-16, atributo solo `Archive` (sin marcas de marcador de posición ni anclaje de OneDrive) |
| Permisos | Propietario `luis2`; SID A y SID B con `Modify` heredado (pueden leerlo); SID C no; sin denegaciones propias |
| Ubicación | Dentro de `Desktop`, redirigido por OneDrive (reparse point). Proceso OneDrive **no se está ejecutando** ahora; si el archivo se sincronizó antes, no se puede saber desde aquí |
| Git | Ignorado por `backend/.gitignore`; `backend/` ni siquiera está versionado |
| `Respaldo_ENV` | Carpeta **vacía** (creada y modificada el 2026-10-27) |
| Quién lo lee | **Nada**: no hay `dotenv` en `src` ni `scripts`; `env-guard.js` e `isolation-guard.js` bloquean su lectura en las pruebas; el receptor y la copia sellada no lo incluyen |
| Documentación | `AUTH_SECURITY_DESIGN.md` (línea 183) lo registra como riesgo conocido sin resolver: SID A con `Modify` sobre `.env`. Los demás informes lo declaran fuera de alcance |
| Contenido | No inspeccionado; 278 bytes es compatible con una o dos variables de configuración. Qué secretos contiene es una **inferencia a confirmar por el usuario**, no un hecho |

Clasificación: **capacidad de acceso no explotada** (A y B pueden leerlo) más **posible exposición en reposo** (OneDrive). Es **independiente de C.2**: el ensayo no lo toca. La decisión sobre qué hacer con él (moverlo fuera de OneDrive, comprobar el historial de versiones en onedrive.com, rotar lo que contenga) es del usuario y no bloquea C.2.

**Hallazgo adicional sobre el respaldo local:** `C:\TwoSides_Backup_Integridad` (y sus 4 archivos) heredan de `C:\` `Authenticated Users: Modify` y `Users: ReadAndExecute`. Como solo `luis2` está habilitado, el efecto práctico lo tienen cuentas de servicio y cualquier cuenta que se habilite, pero el respaldo **no está protegido contra otros principales** y es más débil como ancla de lo que su ruta sugería. Refuerza la necesidad de la referencia fuera del equipo (§5).

## 5. Referencia independiente en almacenamiento externo (evaluación; nada se subió)

El objetivo es que el digest **no pueda alterarse desde una sesión comprometida de este equipo después de haberse registrado**. Solo hace falta el digest (64 caracteres hexadecimales), no el manifiesto.

| Medio | Independiente de este equipo | Detecta alteración posterior | Notas |
|---|---|---|---|
| Correo a uno mismo (se envía una vez) | Sí, tras enviar | Sí (no editable) | El más simple; legible desde otro dispositivo |
| Nota en gestor de contraseñas / cuenta en la nube con 2FA | Sí | Parcial (versiones) | Escribirla o pegarla desde otro dispositivo |
| Repositorio privado en una cuenta propia | Parcial | Sí (historial) | Cuidado: el `origin` actual es de otra cuenta; si el token está en este equipo, también es modificable |
| Papel / memoria USB desconectada | Sí | Sí | Sin dependencia de cuentas |
| Carpeta de OneDrive de esta misma cuenta | **No** | No (se sincroniza el cambio) | No cuenta como independiente |
| `C:\TwoSides_Backup_Integridad` | **No** | No | §4 |

**Recomendación:** dos de las cuatro primeras filas, por ejemplo correo y papel, con fecha y medio anotados. No subir ni enviar nunca `.env`, bases SQLite, claves, tokens ni contraseñas; tampoco hace falta subir el manifiesto. **No se subió ni se enviará nada automáticamente.**

**Registro de referencia provisional** (estos valores cambiarán al sellar la release final; hoy sirven como práctica, no como ancla definitiva):

```text
Release sellada actual: c2-67d95728399e4e30a406eba7301979fd (offline-only)
manifest.json            8DCCBF599E7C93B94386668F752DA4F1CFD58F35D9DCA39BDCED5A418D3FB0AE
preparation.json         CB232EC095C97B8FEEA0013AF745A4941E409EBDA74D659E57E6AF7C60BFC971
c2-verify-reference.ps1  AF0318F2EF3076E39E71B0B240545420E9B8FC9D1EB0B187507EB96DE28E9BCD
c2-receiver-core.js      3075976A9A8BE0353CD3FBBC1554FD3B2F7F2D3EC570A310B82CC3752CFCD71C
c2-receiver-entry.js     A2260CEA5D3C81CFA300983046F36DF2CD589DD5F05CF952603D9CF386CAE362
c2-receiver.ps1          F875F74BCEA573CF4E701416EED7F019A163147EB509EE9E716D1C84B817B6E1
c2-hidden-input-selftest.ps1  FFBECC5FF799623CCD0EC38EC47F790B238B8392FA466832F04DCC91B8B1431F
```

Uso posterior: `c2-verify-reference.ps1 -ExpectedManifestSha256 <digest leído del medio externo>`; debe dar `PASS` antes de lanzar. Un digest guardado hoy ancla hacia adelante: no demuestra que el código fuera auténtico antes de la revisión.

## 6. Prueba interactiva de entrada oculta (offline, contraseña ficticia)

Script nuevo `backend/scripts/c2-hidden-input-selftest.ps1` (SHA‑256 en §5). No es el receptor: no crea run, manifiesto, proceso hijo ni red, y no escribe nada. Reutiliza sin cambios `Read-C2HiddenCredential`.

Ejecución por el usuario, en una consola real (PowerShell o el terminal de VS Code):

```powershell
# Desde backend. Escriba EXACTAMENTE el texto ficticio que muestra el script; no escriba ninguna contraseña real.
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\c2-hidden-input-selftest.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\c2-hidden-input-selftest.ps1 -Mode Cancel   # pulse Esc
```

Resultado esperado: `HIDDEN_INPUT_SELFTEST=PASS mode=Accept bytes=26` y `...PASS mode=Cancel`. Debe comprobar a ojo que **no se muestra nada** al teclear y que Retroceso funciona. Si se escribe otra cosa solo informa `FAIL` y descarta la entrada.

Probado por mí (AR05, con teclas simuladas): acepta solo el texto ficticio, retroceso, rechaza texto distinto, Esc en `Accept`, y Enter en `Cancel`; se niega a leer de una tubería (`REFUSED`); el script no contiene `Read-Host`, `SecureString`, escritura de archivos ni red. **No pude ejecutarla yo en una consola interactiva real: queda pendiente de que la pase usted.**

## 7. Las 15 pruebas omitidas

Eran 14 casos de `c2-windows-runtime-preparation.test.js` (que alteran la copia sellada, por eso no se ejecutan contra ella) y RX17 (necesita la ruta sellada).

- Se creó una **copia desechable** de la release como carpeta hermana dentro de `C2Runtime` (solo bytes, sin ACL copiadas), se ejecutaron los 14 casos y se **eliminó**. Resultado: **14 de 14 aprobados**. `C2Runtime` volvió a contener solo la release sellada, que sigue en `PASS files=1890`, con un único run.
- RX17 se ejecutó antes en solo lectura sobre la sellada: aprobada.

| Casos | Contenido | ¿Pertinentes para activar? |
|---|---|---|
| CP01 | Los 1.890 hashes y las 4 dependencias directas | **Sí**, como regresión sobre la release final (copia desechable) |
| CP05, CP06 | Arranque offline real con Argon2 nativo, supervisor y rechazo de reutilización; hashes intactos tras los casos negativos | **Sí**: demuestran que el paquete final carga el binario nativo y respeta límites |
| CP02 ×3 | Rechazo de base, usuario y host distintos (lanzador offline) | Informativos: el receptor tiene sus propias pruebas (RX02, RX03, RX21) |
| CP03 ×7 | Siete variables peligrosas (lanzador offline) | Informativos: cubiertos por RX04, RX20 y AR03 |
| CP04 | Alteración de una fuente y restauración exacta | Informativo: cubierto para el lanzador nuevo por RX23 |
| RX17 | El manifiesto sellado real no puede activar | **Sí**, cada vez que se vuelva a sellar |

Regla para la release final: ejecutar CP01, CP05, CP06 y RX17 sobre una copia desechable **antes** de calcular el digest definitivo, y no ejecutar nunca las destructivas sobre la sellada.

## 8. Riesgos que permanecerían tras estas verificaciones

**A. Defectos confirmados y corregibles**

| # | Riesgo | Gravedad | Corrección |
|---|---|---|---|
| A1 | El núcleo no exige que `TEMP` sea el `temp` de la release (§3) | Baja | Comprobarlo y exigir directorio vacío en la release nueva |
| A2 | 542 + 50 archivos de caché fuera del manifiesto | Baja | Temporal vacío por ejecución; incluirlos en el inventario |
| A3 | El respaldo local es escribible por `Authenticated Users` (§4) | Media como ancla | Referencia externa (§5) |
| A4 | Cuatro `.dll` antiguos en `Temp` | Informativa | Borrarlos el usuario cuando confirme que no los necesita |

**B. Capacidades de acceso no explotadas (no se pueden eliminar sin tocar B00)**

| # | Capacidad | Qué afecta a C.2 |
|---|---|---|
| B1 | SID A y B con `Modify` sobre todo el árbol del proyecto, incluido `.env`, fuentes y `node_modules` | Nada del flujo C.2 se ejecuta desde ahí: la release vive en `LOCALAPPDATA\TwoSides\C2Runtime` sin esas ACE (2.780 objetos verificados). Afecta a la procedencia del código en el proyecto original |
| B2 | SID C con `Modify` sobre `Temp` | Nada del flujo C.2 usa `Temp` (AR04) |
| B3 | El usuario, SYSTEM y Administradores con `FullControl` sobre la release | Un proceso con esa identidad puede alterar la release o leer memoria. No separable en Windows sin otra cuenta ni VM |
| B4 | La capa de interposición no identificada de la herramienta Bash (§2) | No afecta al lanzador real; sí a la fidelidad de las pruebas lanzadas con `spawn` de Node |

**C. Riesgos aceptables para datos sintéticos (propuesta, a decidir por el usuario)**

| # | Riesgo | Por qué es proporcionado |
|---|---|---|
| C1 | La contraseña vive en memoria administrada (PowerShell, Node, cliente MongoDB) y no se puede borrar | El usuario `twosides_integration_test` solo tiene `readWrite` sobre `two_sides_integration_test`, con datos sintéticos; se rota o caduca al terminar |
| C2 | Hash y firma de `node.exe`, DLL y cadena de carga no certificados | Firma Authenticode válida y hash del manifiesto verificados; el resto exige a un atacante con el mismo usuario |
| C3 | Una ejecución cancelada o fallida consume el run | Es el comportamiento deseado de uso único |

**D. Requieren decisión del usuario**

| # | Decisión |
|---|---|
| D1 | ¿Aceptar la capacidad de A, B y C como riesgo de B00, o identificarlos primero con las verificaciones de §2? |
| D2 | ¿Qué hacer con `backend/.env` (mover, comprobar versiones de OneDrive, rotar)? Independiente de C.2 |
| D3 | Medios para la referencia externa (§5) |
| D4 | Ciclo de vida de la credencial Atlas: usuario temporal con caducidad de horas o rotación posterior |
| D5 | ¿Autoriza el endurecimiento A1/A2 dentro de la release nueva? (Recomendado) |
| D6 | ¿Se borran los `.dll` de `Temp` (A4)? |

## 9. Conclusiones

**Bloqueos estrictamente necesarios para autorizar una única ejecución C.2**
1. **Release nueva y sellada** con la capacidad C.2 en `atlas-policy.js`, la fábrica de conexión real (con las opciones del supervisor), la entrada que sustituya el rechazo, `execute` real, temporal vacío por ejecución (A1/A2) y un manifiesto `c2-remote-once` para **una** ejecución. Es el único trabajo de ingeniería grande.
2. **Revisión del código nuevo** (solo la diferencia) antes de ejecutarlo con la credencial.
3. **Referencia externa del digest de esa release final** y `PASS` del verificador (§5).
4. **Pruebas offline sobre una copia desechable de la release final**: CP01, CP05, CP06, RX17, las pruebas del receptor y la prueba interactiva de §6 pasada por el usuario.
5. **Credencial Atlas con ciclo de vida acotado** (D4) y comprobación previa de permisos efectivos, catálogo, índices y fence antes de escribir.
6. **Aceptación escrita** de los riesgos de las secciones B y C (D1) y autorización explícita para esa única ejecución.

**No son bloqueos:** resolver B00, identificar los tres SID, decidir sobre `.env`, borrar los `.dll` de Temp, la VM. Son decisiones o saneamiento que conviene tomar, pero no impiden una prueba con datos sintéticos si el flujo no depende de esas rutas, y eso está comprobado (§2, §3, B1 y B2).

**Controles ya implementados:** tres barreras independientes (AR01) y sin generador de manifiestos (AR02); compuerta de un solo uso con ventana ≤ 4 h; entorno exacto de 8 variables y temporal propio (AR04); reserva del run antes de pedir el secreto; entrada oculta con trama por stdin anónimo; destino fijo sin argumentos; verificación de integridad, ACL y firma de Node; límites de clientes, sesiones, callbacks y tiempo; limpieza bloqueada ante commit incierto; resultado de campos fijos; 94 pruebas offline aprobadas (más 14 sobre copia desechable).

**¿Puede continuar la preparación sin VM?** **Sí.** Los riesgos que una VM resolvería (B1–B3) no están en la ruta de ejecución de C.2, y los que sí lo están se mitigan con la release aislada, la referencia externa, la credencial acotada y los datos sintéticos. La VM no es una dependencia técnica ni de procedimiento.

## 10. Protección y cierre

- No se leyó ni modificó `backend/.env`; no se tocaron ACL, SQLite ni Godot; no se accedió a credenciales reales ni se habilitó el receptor.
- Consultas ACL de solo lectura sobre: el árbol del proyecto, `.env` y `Respaldo_ENV` (solo seguridad y atributos), `Temp` (muestra de 20.000 objetos), la carpeta de respaldo y `C2Runtime`.
- Escrituras en el proyecto: `scripts/c2-hidden-input-selftest.ps1`, `tests/sync/c2-receiver-activation.test.js` y este informe. Fuera del proyecto: una copia desechable dentro de `C2Runtime` (eliminada), directorios temporales de prueba (eliminados) y herramientas en la carpeta temporal de la sesión. La release sellada y el respaldo no recibieron escrituras.
- Resultados: `c2-receiver-activation.test.js` 5/5; regresión conjunta 94 aprobadas y 15 omitidas (las del §7); 14/14 sobre la copia desechable.

**Detenido.** Sin contraseñas, sin Atlas, sin habilitar el receptor.

## Actualización — resultado interactivo comunicado por el usuario

El usuario comunicó en la continuación de preparación offline ambos resultados:

```text
HIDDEN_INPUT_SELFTEST=PASS mode=Accept bytes=26
HIDDEN_INPUT_SELFTEST=PASS mode=Cancel
```

Se registra como evidencia de la ejecución interactiva del usuario con entrada ficticia; no como una ejecución observada por el agente ni una validación de autenticación Atlas. No se aportó hora exacta de ejecución. Se cierra ese requisito interactivo de preparación, conservando la necesidad de autorización independiente antes de cualquier credencial real o conexión. B00 continúa pendiente.
