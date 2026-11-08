# C.2 — Revisión y preparación offline del receptor

Fecha: 2026-10-29. **Resultado: DISEÑO Y PRUEBAS OFFLINE COMPLETADOS — NO ACTIVABLE.** El receptor existe como código fuente y como pruebas con credenciales ficticias, pero no forma parte de ninguna release sellada, ninguna release puede activarlo y la conexión real a Atlas sigue deshabilitada en tres puntos independientes (§4). No se pidió ni introdujo ninguna contraseña real, no se conectó Atlas, no se ejecutó C.2/F.2, no se inició B05.5. B00 continúa pendiente.

Parte de `B05_C2_LOCAL_MANIFEST_BACKUP_RESULT.md` y `B05_C2_WINDOWS_CREDENTIAL_RECEIVER_RESULT.md`. Se reconoce, como indicó, que el respaldo local **no** es una referencia independiente ni resuelve B00.

## 1. Estado de lo existente (verificado hoy)

| Elemento | Resultado |
|---|---|
| Respaldo local `C:\TwoSides_Backup_Integridad\C2\backup-…` | `manifest.json` `8DCCBF59…FB0AE` y `c2-verify-reference.ps1` `AF0318F2…E9BCD`: coinciden con el informe del respaldo y con los archivos actuales |
| Copia sellada C2Runtime `c2-67d95728…` | `c2-verify-reference.ps1` → `PASS files=1890`, antes y después de todo el trabajo de hoy. `runs/` sigue con un único run (el offline consumido). Cero escrituras en la copia |
| Referencia independiente | **Sigue pendiente.** El respaldo local comparte equipo, disco e identidades con la copia |

## 2. Revisión del código ejecutable y de sus dependencias

### 2.1 Dependencias (23 paquetes, bytes idénticos al registro npm según la fase anterior)

Búsqueda estática de capacidades sobre `package/node_modules` de la copia sellada (solo lectura, sin ejecutar nada):

| Capacidad | Dónde aparece | Evaluación |
|---|---|---|
| `child_process` | `mongodb` (`mongocryptd_manager`, `auto_encrypter`: cifrado en cliente, no configurado), `@node-rs/argon2/index.js` (`ldd --version`, solo Linux/musl), `bson` y `mongodb` `etc/prepare.js` (gancho de desarrollo, no se ejecuta al instalar desde registro) | No alcanzable con la composición C.2 |
| Código dinámico | `sift` (`new Function` para el operador `$where`), `whatwg-url` (`globalObject.eval` de una cadena constante) | No alcanzable: el proyecto no pasa filtros `$where` ni entradas externas a `sift` |
| Red | solo `mongodb` (`net`, `tls`, `dns`; los demás paquetes no importan módulos de red) | Esperado |
| Escritura de archivos | solo `@mongodb-js/saslprep/dist/generate-code-points.js` (herramienta de generación, no se carga en ejecución) | Sin impacto |
| Variables de entorno leídas | `@node-rs/argon2`: `NAPI_RS_NATIVE_LIBRARY_PATH` (carga un módulo nativo por ruta), `NAPI_RS_FORCE_WASI`, `NAPI_RS_WASI_FLAVOR`, `NAPI_RS_ENFORCE_VERSION_CHECK`; `mongodb`: `MONGODB_LOG_*` (incluye `MONGODB_LOG_PATH`), `MONGODB_CRYPT_DEBUG`, `OIDC_TOKEN_FILE`; `mongoose`: `SUPPRESS_JEST_WARNINGS`; `sift`: `CSP_ENABLED` | Justifica una **lista exacta** de variables en el hijo, no solo una lista de prohibidas (§3) |

### 2.2 Código propio (29 fuentes de la copia sellada + código nuevo)

- Solo hay una lectura de entorno en el código propio: `NODE_ENV` en `config/jwt.js`. Un `import()` dinámico con ruta fija en `mongo-identity-repository.js`. Los `require(...)` de `relations.js` y `schemas.js` son validadores locales, no cargadores. Ningún uso de `child_process`, `eval`, `fetch` ni de módulos de red en el código propio.
- **Hallazgo R1 (relevante para el receptor).** `openAtlasIntegration` entrega al conector opciones que **no coinciden** con las que el supervisor exige: `retryWrites:true` frente a `retryWrites:false`, y sin `timeoutMS`. El supervisor rechazaría esa conexión (`CLIENT_OPTIONS_REJECTED`). El receptor no usa esas opciones: toma todas las opciones del supervisor (`makeRuntimeConnector`, §3) y solo añade la contraseña.
- **Hallazgo R2.** `atlas-policy.js` no admite la capacidad C.2 (`persistenceTest` solo acepta `B05.4C.2D.2`, `2D.2E` y `2F.1C.2A`). Con el receptor actual, aunque todo lo demás se activara, `openAtlasIntegration` rechaza la configuración C.2. Es una barrera adicional intencionalmente no retirada (prueba RX09).
- **Hallazgo R3.** La contraseña, una vez dentro del proceso Node, pasa por `TextDecoder.decode` (cadena inmutable) y termina en `credentials.password` del cliente MongoDB. Los `Buffer` se ponen a cero, **las cadenas de JavaScript no**. Es un límite del lenguaje y del driver.
- **Hallazgo R4.** `receiveAtlasCredential` impone 1.024 bytes, sin CR/LF/NUL y 30 s, pero no longitud mínima. El lanzador exige entre 8 y 256 caracteres antes de enviar.
- **Hallazgo R5 (heredado, copia sellada).** Fuera del manifiesto hay 542 archivos de caché de compilación en `temp/` y 50 en `support/npm-cache`. Ninguna fuente activa `NODE_COMPILE_CACHE`, pero el lanzador asigna `TEMP`/`TMP` a ese directorio. La próxima release debe usar un temporal vacío por ejecución e incluirlo en la regla de inventario.

## 3. Diseño del receptor (archivos nuevos, fuera de cualquier release)

Se creó código en `backend/` únicamente. Nada se copió a C2Runtime.

| Archivo | SHA-256 | Función |
|---|---|---|
| `scripts/c2-receiver-core.js` | `3075976A…FCD71C` | Núcleo: argumentos, entorno exacto, activación de un solo uso, reserva de run, recepción por stdin, orquestación, resultado fijo |
| `scripts/c2-receiver-entry.js` | `A2260CEA…CAE362` | Entrada del proceso hijo; en este estado siempre rechaza |
| `scripts/c2-receiver.ps1` | `F875F74B…B6E1` | Lanzador: entorno, verificación de integridad y ACL, entrada oculta, tubería a stdin |
| `tests/sync/c2-receiver.test.js` | `3BB3FDB8…389DD` | 23 pruebas (22 siempre + 1 con la ruta sellada) con credenciales ficticias |

**Flujo y orden (cada paso falla cerrado; ninguna entrada ni excepción se imprime):**
1. Lanzador: variables peligrosas del padre (`NODE_OPTIONS`, `NODE_PATH`, `NODE_COMPILE_CACHE`, `NODE_EXTRA_CA_CERTS`, `NODE_TLS_REJECT_UNAUTHORIZED`, `NAPI_RS_*`, `MONGO*`, `DOTENV*`, `NPM_CONFIG_*`, `LD_*`, `DYLD_*`, `OPENSSL_*`, proxies) → rechazo.
2. Ruta: debe ser un subdirectorio `c2-<32 hex>` directo de `%LOCALAPPDATA%\TwoSides\C2Runtime`, sin OneDrive ni reparse points en toda la cadena.
3. **Referencia independiente:** SHA-256 de `manifest.json`, leído por un handle que bloquea escritores, debe igualar el digest que el usuario aporta desde el medio externo.
4. **Compuerta de activación de un solo uso** (en el lanzador y repetida en el núcleo): `version 2`, `mode 'c2-remote-once'`, `remoteEnabled true`, destino exacto, `activation.executionId` igual al RunId, ámbito `10ef4f6d…`, escenarios exactamente `A,B,C`, ventana de validez futura y de **máximo 4 h**. El manifiesto offline sellado actual **no puede** cumplirla.
5. ACL del árbol (propietario y escritores solo usuario/SYSTEM/Administradores; ninguno de los dos SID B00), inventario exacto y SHA-256 de cada archivo con handles de lectura sin escritura compartida, hash y firma de `node.exe`.
6. Entrada interactiva obligatoria (se rechaza si la entrada del lanzador está redirigida).
7. **Se reserva el run antes de pedir el secreto** (directorio + marcador `CreateNew`; el núcleo añade un segundo marcador `wx`). Un intento cancelado o fallido consume el run.
8. **Solo ahora** se lee la contraseña: teclas ocultas a un `char[]` fijo (retroceso, Esc cancela, control ignorado; 8–256 caracteres), a UTF‑8 con validación estricta, trama `[longitud uint32 BE][bytes]`, un único `Write` a **stdin anónimo** del hijo, cierre del flujo y puesta a cero de los arreglos. Sin argumentos, variables, archivos, `SecureString` ni transcripciones.
9. Hijo con entorno reconstruido de exactamente ocho nombres (`SystemRoot`, `WINDIR`, `SystemDrive`, `LOCALAPPDATA`, `PATH`=solo System32, `TEMP`, `TMP` dentro de la release, `NODE_ENV=test`); el núcleo vuelve a exigir **ese conjunto exacto** (nada más, `TEMP==TMP`).
10. Núcleo: recibe la trama con el código existente `receiveAtlasCredential`, abre la integración, ejecuta, y **solo si no hay commit incierto ni escrituras pendientes** invoca la limpieza. Siempre: credencial destruida, integración cerrada, supervisor terminado, resultado de esquema fijo escrito con `wx`.
11. Destino: solo constantes (`<cluster>.<id>.mongodb.net`, `twosides_integration_test`, `two_sides_integration_test`, `authSource admin`, `DEFAULT`, TLS). **No existe ningún argumento** para host, usuario, base, URI o contraseña (RX03). Las opciones de conexión las fija el supervisor (`makeRuntimeConnector`); la URI no contiene credenciales.
12. Límites conservados tal cual: 3 clientes, 2 sesiones simultáneas, 3 callbacks, 120 s, I/O de 10 s, fence preservado, 16 filas propias.

Resultado público (campos fijos): `version, mode, runId, status, code, atlasConnected, uncertain, cleanup, resourcesClosed`. Códigos: `ARGS_REJECTED, ENV_REJECTED, ACTIVATION_REJECTED, REUSE_REJECTED, CREDENTIAL_REQUIRED, CONNECTION_REJECTED, EXECUTION_FAILED, COMMIT_UNCERTAIN, CLEANUP_BLOCKED, CLOSE_FAILED`.

## 4. Por qué sigue sin poder conectarse (tres barreras independientes)

1. **Compuerta de manifiesto:** no existe ningún manifiesto `c2-remote-once`; el único sellado es `offline-only`. Con él, el lanzador rechaza antes de pedir nada y el núcleo antes de leer stdin (RX01, RX21 y comprobación sobre la copia sellada real).
2. **Sin fábrica de conexión:** `c2-receiver-entry.js` instala un `openIntegration` que siempre rechaza; no importa `mongoose` ni crea conexiones (RX15).
3. **Política y ejecución:** `atlas-policy.js` rechaza la configuración C.2 (RX09) y `executeDurableAtlasRun` sigue lanzando `DURABLE_REVOCATION_C2_NOT_AUTHORIZED`.

Habilitar el receptor exige modificar archivos sellados (política, integración, entrada, arnés) y, por tanto, **una release nueva con manifiesto y digest externo nuevos**. No basta cambiar un indicador.

## 5. Pruebas offline (todas con credenciales ficticias, sin Atlas, sin A36, sin ACL históricos)

```text
node --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run --config vitest.config.js --configLoader native --pool threads --testTimeout 90000 tests/sync/c2-receiver.test.js
Tests 22 passed | 1 skipped (23)       # RX17 aprobada aparte con TWOSIDES_C2_OFFLINE_ROOT (solo lectura del manifiesto sellado)
Regresión conjunta final (preflight + operativo + preparación + receptor): 89 passed | 15 skipped
```
Los 15 omitidos son los 14 de la suite que modifica la copia sellada (no se ejecuta contra ella) y RX17 en esa corrida. Estas cifras no se suman a las de fases anteriores.

| Verificación | Casos |
|---|---|
| Destino distinto / ámbito / escenarios / ventana / versión / digest rechazados | RX02, RX03, RX21 |
| Sin argumento para host, usuario, base, URI o contraseña | RX03 |
| Entorno exacto de ocho nombres; 17 variables peligrosas rechazadas | RX04, RX20 |
| Reutilización (marcador, resultado, run ausente) sin tocar el resultado guardado | RX06, RX22 |
| Paquete modificado, archivo extra, faltante o anidado extra | RX23 (lanzador, antes de pedir el secreto) |
| Credencial ausente/vacía/truncada/sobredimensionada/con CR‑LF‑NUL/UTF‑8 inválido/tardía | RX07 |
| El secreto ficticio nunca aparece en resultados, errores, consola, stdout/stderr, archivos de la release ni argumentos/entorno del hijo; el manejador se destruye | RX08, RX22 |
| Entrada oculta: trama exacta, retroceso, control ignorado, no‑BMP; Esc, corta y larga rechazadas | RX18, RX19 |
| Opciones fijadas por el supervisor; 4.º cliente y 3.ª sesión rechazados | RX10 |
| Commit incierto bloquea la limpieza; escritura pendiente la bloquea; limpieza limpia una sola vez | RX11, RX12 |
| Supervisor temporal y cierre ordenado (incluido fallo de cierre) | RX13, RX14 |
| Fence C.2A y limpieza exacta de filas sintéticas | Regresión RC02, RC07, RC18–RC21, RC24, RC30, RC31 |
| Flujo completo con hijo sintético: entrada oculta → stdin → hijo con 8 variables → resultado | RX22 |
| Entrada real rechaza (salida 1, sin salida ni archivos), también con entorno hostil | RX16 |
| Fuentes sin `console`/`process.stdout`, núcleo sin `process.env`, lanzador sin `Read-Host`/`SecureString`/`Out-File` | RX15 |
| Compuerta sobre la **copia sellada real** (solo lectura): `ACTIVATION` rechazada, secreto no solicitado, `runs/` sin cambios | Comprobación manual + RX17 |

**Qué NO está probado:**
- La entrada oculta con la consola interactiva real (`[Console]::ReadKey`); se probó con una fuente de teclas simulada.
- El flujo completo con el **hijo real** (`entry` + núcleo + arnés): no es ejecutable por diseño; RX22 usa un hijo sintético.
- Una conexión real `mongoose.createConnection` y la compatibilidad de la nueva política C.2: no existen aún.
- Rechazo por ACE de los dos SID B00 y por escritores ajenos: el código lo implementa (copiado del lanzador offline ya probado), pero crear esas ACE habría exigido modificar ACL, así que no se probó con ACE reales. De hecho, el ensayo RX22 falló inicialmente por ACL (véase §6), lo que confirma que la compuerta funciona.

## 6. Hallazgo nuevo de B00: tercer SID desconocido

`C:\Users\luis2\AppData\Local\Temp` tiene una ACE **explícita** (no heredada), `Allow Modify, Synchronize`, con herencia a contenedores y objetos, para `S-1-5-21-3342353714-372166548-3825597654-3326500402`. Es el mismo patrón que los dos SID de B00 en la raíz del proyecto.

- No se resuelve a ninguna cuenta de esta máquina y no está en el token del usuario. Su prefijo difiere del SID del equipo (`S-1-5-21-1972436287-3393038613-924685975`) y de los otros dos.
- Los demás ancestros revisados (`AppData`, `AppData\Local`, `TwoSides`, `C2Runtime`) **no** lo tienen. La copia sellada y sus 2.780 objetos siguen sin él.
- Hipótesis (**no demostradas**): el patrón coincide con concesiones de acceso hechas por una herramienta de aislamiento para un SID sintético sobre el directorio de trabajo y el temporal. Se comprobó, por consulta de solo lectura sobre el token del proceso de PowerShell de esta sesión, que ese proceso **no** es restringido y no tiene SID restrictivos, así que esa hipótesis **no quedó confirmada**; el token de la otra herramienta de la sesión no se examinó. Otras explicaciones posibles: ACL copiadas desde otro perfil o máquina.
- Efecto práctico: cualquier ejecución que dependa de `%TEMP%` del usuario no puede considerarse privada frente a ese principal. El diseño ya evita esa dependencia: el hijo usa el `temp` de la release, y el lanzador rechaza ACL con escritores ajenos. Fue la propia compuerta la que rechazó, por ACL, el primer intento de RX22 en `%TEMP%`; por eso las pruebas de lanzador usan un directorio temporal en `%LOCALAPPDATA%\TwoSides\C2ReceiverTests`, creado y eliminado por la prueba.
- Verificación sugerida (solo lectura, sin cambiar nada): comprobar si estos tres SID aparecen únicamente en el directorio de trabajo y en el temporal de la sesión, y si dejan de aparecer en sesiones nuevas con el aislamiento de la herramienta desactivado. No se hizo.

## 7. Riesgos B00 y residuales (siguen abiertos)

- **B00 no resuelta:** los dos SID del proyecto y el tercero de `Temp` siguen sin identificar; `backend/.env` permanece en el árbol con las ACE heredadas; su exposición no se evaluó ni se tocó.
- El usuario actual (y SYSTEM/Administradores) conserva `FullControl` sobre la copia: un proceso hostil con esa identidad puede alterar la release entre verificación y uso o leer la memoria del lanzador, del hijo o del driver. Los handles sin escritura compartida mitigan sustitución de archivos existentes; no certifican directorios, DLL ni memoria.
- La contraseña existe en memoria administrada (caracteres transitorios en PowerShell, cadena inmutable en Node, copia en el cliente MongoDB). No hay forma garantizada de borrarla. Un volcado de memoria podría contenerla.
- El código propio sigue sin procedencia independiente; el respaldo local no la crea.
- El lanzador y el hijo se verifican a sí mismos solo en parte: el lanzador se ejecuta antes de poder comprobar su propio hash. El control real es ejecutar `c2-verify-reference.ps1` con el digest externo **antes** de lanzar.
- Los scripts de prueba que ejecuta Vitest se generan en `%TEMP%` (modificable por el tercer SID); afecta solo a la integridad de las pruebas, no a la release.

## 8. Condiciones mínimas para una futura activación

1. **Referencia independiente real**: manifiesto y digest (y el digest del verificador y de los tres scripts nuevos) guardados fuera del equipo y contrastados con `c2-verify-reference.ps1` → `PASS`.
2. **Aceptación escrita** del riesgo residual de §7 y decisión sobre B00 (al menos: identificar o descartar los tres SID y evaluar `backend/.env`).
3. **Release nueva y sellada** que incluya: capacidad C.2 exclusiva en `atlas-policy.js`, fábrica de conexión real (`mongoose.createConnection(...).asPromise()`) con las opciones del supervisor, entrada que sustituya el rechazo, `execute` real, un temporal vacío por ejecución y reglas de inventario para `temp/`/`support/`; manifiesto `c2-remote-once` con la compuerta de §3 para **una** ejecución; digest externo nuevo.
4. **Revisión de ese código nuevo** y repetición de las pruebas offline de este informe contra la release nueva, usando una copia desechable para las pruebas que alteran archivos.
5. **Prueba interactiva sin credenciales** de la entrada oculta en la consola real (con una cadena ficticia).
6. **Autorización explícita** para una única activación, con rotación posterior de la contraseña de integración y procedimiento de reconciliación si el commit es incierto.
7. Antes de escribir remotamente: permisos efectivos del usuario, catálogo completo sin filtro, índices exactos y fence `ingestion-v1` inicial; cualquier discrepancia detiene sin crear, borrar ni adoptar nada.

## 9. Protección y cierre

- No se leyó `backend/.env`; no se tocaron SQLite, Godot, ACL, propietarios, usuarios ni permisos de Atlas; no se accedió a credenciales; no se creó ningún receptor activable ni release.
- Consultas ACL: solo lectura y solo sobre C2Runtime (2.780 objetos), sus ancestros directos y `%LOCALAPPDATA%\Temp`.
- Escrituras en el proyecto: los cuatro archivos de §3 y este informe. Fuera del proyecto: directorios temporales de prueba en `%LOCALAPPDATA%\TwoSides\C2ReceiverTests` (eliminados al terminar) y herramientas de verificación en la carpeta temporal de la sesión. La copia sellada y el respaldo no recibieron escrituras.
- No se usó la red en esta fase; el contraste con el registro npm es de la fase anterior. Tras las pruebas finales, `c2-verify-reference.ps1` volvió a dar `PASS files=1890` sobre la copia sellada.

**Detenido.** Sin contraseñas, sin Atlas, sin C.2/F.2/B05.5.
