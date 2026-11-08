# B65 — Prevuelo de migración B00

Fecha: 2026-11-03, Guatemala. **Comprobaciones locales completadas; contraste externo y habilitación real pendientes.** Revisados B59, B60, B62, B63 y B64, junto con la matriz efectiva de permisos y los componentes del canal B64.

Único entregable nuevo: este informe. No se conectó Atlas, creó/modificó una cuenta, introdujo un secreto real, activó v5, inició Express/Caddy, abrió `.env` o SQLite real, modificó Godot, cuotas, documentos remotos, ACL, certificados, manifiestos o código de producción. Sin F3.10, commits ni push. Las pruebas seleccionadas utilizaron únicamente dobles, credenciales ficticias y archivos temporales desechables.

## 1. Resultado de las comprobaciones

| Comprobación | Resultado B65 |
|---|---|
| SHA-256 del candidato v5 | **Coincide** con la referencia aprobada por el propietario |
| treeDigest v5 | **Coincide** con la referencia aprobada por el propietario |
| Árbol protegido actual | **PASS: 3172 archivos, cero diferencias, código 0**, también después de las pruebas |
| Artefactos de sonda/canal | **4 de 4 hashes coinciden** con B64 |
| Pruebas locales seleccionadas | **63 PASS, 0 fallidas, código 0**, en 2 archivos |
| Launcher B64 sin autorización | **Rechazo antes del prompt**, salida esperada 1; comprobación de ese negativo PASS, código 0 |
| Referencia externa independiente v5 | **PENDIENTE / NO VERIFICADA**: no hay una descarga identificada y acreditada en B59–B64 ni una ruta aportada para esta fase |
| Canal privado real | **Plantilla disponible y componentes probados offline; no desplegado ni certificado para recibir secretos reales** |
| Manifiesto instalado | Sigue siendo **v4**, sin sustitución |
| Respaldo de código v4 | **PASS: 3169 archivos, cero diferencias**, verificador oficial con código 0 |
| Cuenta nueva y roles actuales en Atlas | Configuración requerida confirmada por código; **existencia/estado remoto no consultados** |
| Cuentas anteriores | **Ninguna operación aplicada por B65**; estado remoto actual no certificado sin consultar Atlas |
| 2151 operaciones SQLite reales | **Fuera del procedimiento**; no se abrió la base ni se recontaron/importaron sus operaciones |

Los 63 casos de B65 son una selección, no una repetición de las 150 pruebas de B64 ni una validación remota.

## 2. Evidencia de integridad local

### Candidato v5, no activado

Ruta: `%LOCALAPPDATA%\TwoSidesMainIntegrity\backend-integrity-manifest.v5-B62.json`.

```text
SHA-256:   2A4956E951217DFF2501D3FFBD35C9024554166E9126AD0134D8FB58C77AD726
treeDigest: 1f3f507348a479d88362767e9e548200003d646ad8930f54cbfc9efc6a9f8c28
fileCount:  3172
added: 0; removed: 0; modified: 0; problems: 0
```

Se ejecutó `verifyBackend` del bootstrap B64: SHA y metadatos fijados, rutas normales, hashes/tamaños de los archivos listados antes de importar módulos protegidos, y posteriormente `verifyManifestFile` **oficial** con el ancla v5. Resultado verdadero y proceso con código 0. Se repitió tras las pruebas: mismo resultado.

Hashes actuales de los artefactos fuera del ámbito v5, contrastados con B64:

| Archivo en `backend/tools/atlas-v2-first-read/` | SHA-256 |
|---|---|
| `gate.mjs` | `E1FA695193BB716DC45DB24DC27F9B36625CBB5E1313391D87071040D3F8A695` |
| `probe.mjs` | `FB7B63C429C3CDE1055561038173068E0525F247F70EE064B8D248832B032080` |
| `receiver.mjs` | `11FC67BC135EF4CCAC0A8623EC5529818A400829FE12D428DA68AE3473C13354` |
| `send-first-read.ps1` | `E6090C57B6D3EA3FA98B9F592557C737DF55F0291C6DEE354E659BF7F0D36051` |

No se movieron al árbol protegido ni se generó otro manifiesto. Su coincidencia con B64 acredita continuidad local, **no custodia independiente**.

## 3. Contraste independiente: evidencia y condición pendiente

B62 registra explícitamente ese contraste como pendiente. B63 define cómo recuperar la referencia externa; B64 sigue sin registrar una recuperación contrastada. Las referencias externas verificadas de C.2 pertenecen a otro paquete y **no acreditan v5 ni estos cuatro artefactos B64**.

Los valores de esta solicitud permiten contrastar el cálculo actual contra una referencia aprobada fuera de esta ejecución. No prueban que exista una copia previamente custodiada del manifiesto completo, ni sustituyen la recuperación independiente exigida en B63. No se creó una copia local para presentarla como descarga, se inventó un registro de custodia, exploraron carpetas personales indiscriminadamente ni accedió a un servicio externo.

Procedimiento pendiente, ejecutable sin contactar Atlas cuando el propietario identifique la copia recuperada:

1. Recuperar del medio externo previamente custodiado el JSON v5 original, sin reserializarlo, a una carpeta local nueva. Identificar ruta exacta, origen/versionado y referencias conservadas con independencia del workspace.
2. Calcular SHA-256 sobre **ese archivo recuperado**; exigir el SHA completo anterior. Leer de él treeDigest y fileCount, y contrastarlos con la referencia aprobada independiente.
3. Ejecutar el verificador oficial con el archivo recuperado y su ancla contrastada contra el backend actual: exigir 3172, cero diferencias y código 0. Comparar además sus bytes con el candidato local.
4. Registrar procedencia, ruta, hashes y resultado. Una coincidencia entre dos copias locales sin procedencia acreditada no se eleva a referencia externa verificada.
5. Contrastar igualmente los cuatro artefactos B64 y sus referencias antes de desplegar un receptor para secretos reales.

Si no existe una custodia anterior, el propietario deberá establecer y aprobar una referencia independiente siguiendo B63; no atribuirle una fecha o procedencia que no tuvo. **En B65 el contraste queda PENDIENTE.** No se solicita contraseña ni acceso a una cuenta de nube.

## 4. Canal privado: qué quedó comprobado

Se ejecutó desde backend:

```powershell
node --import ./tests/jwt/env-guard.js ./node_modules/vitest/vitest.mjs run --config vitest.config.js tests/sync/atlas-v2-first-read.test.js tests/sync/main-credential-channel.test.js
```

Resultado: **2 archivos PASS, 63 pruebas PASS, 0 fallidas, código 0; 3,19 s**.

La selección comprende los 61 casos de B64 y dos regresiones del transporte existente. Comprueba conversión SecureString/UTF-8 con caracteres ficticios, conservación de espacios y caracteres especiales, framing binario, consumo por stdin, ausencia de secreto ficticio en argumentos/entorno/salida, errores sanitizados, cierre, destino/TLS/SCRAM efectivos con el driver interceptado, integridad y uso único sobre fixtures desechables.

Se hizo además un negativo sobre **el launcher B64 real**, con argumentos públicos ficticios y sin `-AuthorizedFirstRead`: terminó con código 1 y mensaje sanitizado, antes de cualquier prompt. La comprobación externa del negativo terminó con código 0. No se ejecutó el receptor autorizado ni se emitió un `authorization.json` real.

Límites de esta evidencia:

- La prueba extremo a extremo de stdin usa una copia desechable del transporte existente con un receptor ficticio; la nueva plantilla B64 tiene pruebas de parseo, conversión y barreras. **No se ensayó como canal real desplegado con v5 activo**, que continúa sin autorizarse.
- No se realizó prueba interactiva con una contraseña real ni se certificó la privacidad de un directorio privado nuevo.
- No se ejecutaron consultas ACL ni auxiliares históricos de permisos. El rechazo temprano del launcher ocurre antes de esas consultas.
- Las comprobaciones de uso único utilizan marcadores ficticios, no autorizaciones remotas reales.

Por ello, «disponible» significa **código y componentes disponibles**, no un canal listo para recibir secretos. Continúan pendientes el despliegue exclusivo fuera de OneDrive/proyecto, revisión acotada autorizada de permisos y ancestros, confianza en Node/PowerShell, integridad externa de los artefactos y ensayo local de ese despliegue. Ninguna localización por sí sola prueba privacidad.

La futura entrada exige v5 instalado, hashes aprobados, autorización de uso único vigente y preflight antes de recibir el secreto. No admite `.env`, usuario anterior, URI con contraseña, fallback SHA-1/DEFAULT, destino alternativo ni ampliación automática de permisos. Los handles de lectura reducen sustitución de artefactos; no eliminan el riesgo de otro proceso bajo la misma cuenta Windows. No se garantiza borrado verificable de strings o memoria de procesos.

## 5. Cuenta candidata y privilegios exactos

El código actual fija `twosides_backend_v2@admin`, host `<cluster>.<id>.mongodb.net`, base `two_sides_db`, **SCRAM-SHA-256 explícito** y TLS estricto. Rol único requerido: `two_sides_main_runtime_v1@admin`. Se compara la unión efectiva de acciones por recurso, no solo el nombre del rol.

| Base | Colección/recurso | Acciones exactas de aplicación |
|---|---|---|
| `two_sides_db` | `collection:''`, metadatos de base | `listCollections` |
| `two_sides_db` | `main_v2_operations` | `find`, `insert`, `update`, `listIndexes` |
| `two_sides_db` | `main_v2_facts` | `find`, `insert`, `update`, `listIndexes` |
| `two_sides_db` | `main_v2_fences` | `find`, `insert`, `update`, `listIndexes` |
| `two_sides_db` | `main_v2_identities` | `find`, `insert`, `update`, `listIndexes` |
| `two_sides_db` | `main_v2_ownerGuards` | `find`, `insert`, `update`, `listIndexes` |
| `two_sides_db` | `main_v2_identitySessions` | `find`, `insert`, `update`, `listIndexes` |
| `two_sides_db` | `main_v2_revocations` | `find`, `insert`, `update`, `listIndexes` |

Sin roles heredados amplios, comodines, otras bases, permisos de datos sobre históricos, `main_v2_authorization`, remove, DDL, administración de usuarios o bypass de validación. `admin` identifica la autenticación/namespace del rol; no concede permisos sobre sus documentos.

La sonda B64 ejerce únicamente lectura, sin modelos ni DDL. Inspecciona insert/update para acreditar que el rol de aplicación está completo, pero no realiza escrituras para probarlos. Si solo se acreditan permisos de lectura, el receptor no aprueba la preparación de la aplicación. Un permiso de colección no proporciona aislamiento por jugador ni protege documentos de esa colección frente a código comprometido.

**Intervención manual obligatoria del propietario:** configuración de rol y usuario mediante el plano de control de Atlas, almacenamiento de una contraseña nueva fuera del chat/código, restricción de clúster/red y conservación de evidencia sanitizada. La sonda y el arranque normal no crean usuarios/roles ni ajustan privilegios. B65 no automatiza esas acciones.

No se modificaron `twosides_backend`, `twosides_integration_test` ni otras cuentas. Esto describe las acciones de esta fase; **no es una comprobación de su estado actual en el proveedor**, prohibida aquí. La próxima revisión manual deberá confirmar que no hay objetos inesperados o modificaciones ajenas antes de crear nada.

## 6. Disponibilidad de v4 y reversión

Referencias comprobadas:

```text
Instalado: %LOCALAPPDATA%\TwoSidesMainIntegrity\backend-integrity-manifest.json
Respaldo de referencia: local-persistence/.work/pre-B60-abe56b01/v4-reference.json
Código de reversión:   local-persistence/.work/pre-B60-abe56b01/backend/

SHA-256 v4, idéntico en ambas referencias:
7DEC55E3E1053F7F63A0D2B859ACB0A56FF931E82DB7BBB2625734326D6C3E8B

treeDigest v4:
aea04105001d5ca324f817602e781cf5118789f9187c8424c204551ac800e27e
```

El verificador oficial utilizó el manifiesto instalado, ubicado fuera del proyecto, con raíz apuntando **solo al código del respaldo** y ancla v4: `ok:true`, expectedFiles **3169**, added/removed/modified/problems **0**, código 0. No se ejecutó ni restauró código del respaldo.

La primera invocación intentó usar `v4-reference.json` directamente como archivo del verificador; fue rechazada por su política de ubicación dentro del proyecto/OneDrive. Se corrigió la invocación para usar la referencia instalada idéntica y la raíz del respaldo. **No se alteró el verificador ni se copió/modificó un manifiesto para superar el control.** La igualdad SHA de la copia se verificó por separado.

La comprobación actual cubre los 3169 archivos protegidos del respaldo; la verificación histórica de los 3473 archivos del respaldo ampliado corresponde a B60. No se afirma haber repetido todo ese inventario ni restaurado nada en B65. No utilizar el primer respaldo incompleto señalado en B60.

Condiciones de reversión futura:

1. Conservar candidato v5, referencia externa y respaldo v4; no borrar ni sobrescribir respaldos.
2. Activar/restaurar la referencia instalada solo con autorización propia, servicios detenidos y procedimiento B63, incluida conservación de metadatos y respaldo exclusivo previo. El reemplazo real no se ejecutó ni ensayó aquí.
3. **Restaurar solo v4 no habilita el código B60 actual.** Para arrancar la versión anterior, restaurar también exclusivamente los archivos inventariados pertinentes y validar el paquete contra sus 3169 entradas.
4. No revertir SQLite, documentos, recibos, identidades de jugador, claves o contraseñas junto con código. Ninguna reversión local revierte commits remotos.
5. Una cuenta nueva no validada queda sin uso; retirada/cambio posterior necesita autorización manual. No eliminar la cuenta anterior antes de aceptar la nueva, ni volver automáticamente a una credencial expuesta.

## 7. Exclusión de la cola real y del videojuego

Las 2151 operaciones históricas se toman del contexto/documentación, **sin leer SQLite para verificarlas**. La sonda no importa Godot, SyncHost, el cliente Outbox, adaptadores SQLite, configuración del jugador ni HTTP; tampoco recibe rutas de partidas o lotes como argumentos. No inicia main ni un worker de sincronización.

La primera lectura futura se limita a identidad/permisos, hello, catálogo, siete consultas de índices y la semilla proyectada del fence: máximo 11 comandos. No acepta lotes de jugador, transacciones de ingesta ni ACK/recibos de operaciones reales. Mantener detenidos el backend principal y el cliente de sincronización durante esa sesión será una precondición de su autorización. Una campaña sintética de escritura o Godot requiere un alcance posterior separado; no se autoriza importar la cola histórica.

## 8. Primer paso real mínimo recomendado

**No ejecutado ni autorizado por B65.** Solicitar posteriormente una autorización acotada al propietario para revisar manualmente en el plano de control Atlas el proyecto/clúster y la ausencia de los nombres `two_sides_main_runtime_v1` y `twosides_backend_v2`. No utilizar Compass o la sonda para esta revisión ni establecer una conexión DB desde el agente.

La **primera mutación mínima** propuesta, tras esa revisión y autorización expresa, es **crear únicamente el rol `two_sides_main_runtime_v1` con la tabla exacta anterior**, sin usuario ni contraseña todavía. Si el nombre ya existe, las acciones no están disponibles, aparece un objeto inesperado o la UI no expresa el alcance exacto, detenerse sin sobrescribir ni conceder `readWrite`. Guardar solo evidencia de nombre, recursos, acciones, clúster/proyecto y fecha, sin secretos. No modificar red, colecciones o cuentas existentes como efecto lateral.

Esta separación reduce el primer cambio remoto y no requiere recibir credenciales. La creación posterior de `twosides_backend_v2` requiere una autorización manual propia: rol único, secreto nuevo en gestor privado y restricciones de clúster/red específicas. Crear un rol/cuenta no activa v5 ni autoriza su uso desde Windows.

El contraste externo y la certificación del canal **impiden autorizar todavía el uso de credenciales/primera conexión de la sonda**. No son un requisito técnico para configurar manualmente un rol sin utilizarlo, pero no se dan por resueltos ni se omiten para avanzar a la conexión. El orden recomendado sigue siendo cerrar la referencia externa, preparar/ensayar el despliegue local, autorizar por separado la activación v5 y la configuración manual Atlas, y finalmente autorizar una sesión de lectura.

## 9. Bloqueos y autorizaciones pendientes

| Pendiente | Evidencia requerida antes de avanzar |
|---|---|
| Contraste independiente | Ruta y procedencia de la referencia recuperada v5/artefactos, hashes aprobados, verificador PASS |
| Canal privado desplegado | RunId nuevo, privacidad y ancestros inspeccionados con alcance autorizado, integridad externa, ensayo local sin secretos reales |
| Activación v5 | Autorización expresa, respaldo exclusivo, ensayo de reemplazo sintético y comprobación posterior; v4 preservado |
| Configuración Atlas | Autorización manual de objetos exactos, nombres no ocupados, matriz y clúster/red confirmados; cuentas anteriores intactas |
| Primera lectura | Nueva autorización de una sesión, activación manual de canal vigente, SHA-256/TLS fijos, controles de esquema y cierre; sin escritura/HTTP/Godot |

**B00 continúa pendiente.** SCRAM-SHA-256 y el rol mínimo están preparados localmente, no validados aún con la cuenta real. B11 documentó la retirada de las ACE investigadas; B65 no repite ni deshace esa etapa. Persisten riesgos bajo la misma cuenta Windows, procedencia/TOCTOU de código y dependencias, exposición en memoria y copias históricas de secretos. Mantener la cuenta anterior temporalmente no valida sus credenciales ni resuelve esos riesgos.

**Conclusión: prevuelo local aprobado dentro de su alcance; contraste externo y canal real pendientes. No listo para una conexión real.** Puede proponerse la autorización manual acotada indicada, sin inferir autorización de activación o conexión. B65 termina aquí, sin acciones reales en Atlas.
