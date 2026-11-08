# B05.5 Etapa 11 — Compatibilidad SCRAM del perfil `main`

Fecha: 2026-10-31. **El perfil `main` y su herramienta de inspección de `two_sides_db` ahora usan el mecanismo `DEFAULT` del driver oficial**, de modo que admiten el mecanismo SCRAM que Atlas anuncia para `twosides_backend` (hoy solo SCRAM-SHA-1). Todo se comprobó offline con dobles. **No se conectó a Atlas, no se usó ninguna contraseña real, no se leyó `backend/.env`, no se activó `main`, no se escribió en `two_sides_db`, no se generó ninguna autorización, y no se tocaron Godot, SQLite reales, ACL, C2Runtime, C.2/F.2 ni el perfil `integration`.** **B00 sigue pendiente; esta etapa no lo resuelve.**

## 1. Causa de la incompatibilidad

El perfil `main` pedía `authMechanism: 'SCRAM-SHA-256'` explícito. Con un mecanismo explícito el driver no consulta qué credenciales tiene el usuario y fuerza SHA-256; si el usuario no tiene credencial SHA-256 guardada, Atlas responde `bad auth` aunque la contraseña sea correcta. El mismo usuario y la misma contraseña autentican con SCRAM-SHA-1.

## 2. Evidencia de `saslSupportedMechs`

Observada por el usuario en MongoDB Compass y MongoDB Shell (no repetida aquí): para `twosides_backend` (authSource `admin`) `saslSupportedMechs` devuelve `["SCRAM-SHA-1"]`; SCRAM-SHA-1 conecta y SCRAM-SHA-256 da `bad auth` con la misma contraseña. Es coherente con el historial del repositorio (integración: SHA-256 explícito falló, `DEFAULT` funcionó) y con el código del driver (§4). La causa de que la cuenta carezca de credencial SHA-256 está en Atlas (cuenta/cluster), no en el código.

## 3. Archivos modificados

Solo `main` y su inspección; `integration` y `atlas-policy.js` no cambian.

| Archivo | Cambio |
|---|---|
| `src/main/policy.js` | Constante `MAIN_AUTH_MECHANISM = 'DEFAULT'` con la excepción documentada; `MAIN_CONFIG.authMechanism`; verificación post-conexión exige `credentials.mechanism === 'DEFAULT'`; ayudante `negotiatedScram()` |
| `src/main/profile.js` | El conector recibe `MAIN_CONFIG.authMechanism` |
| `src/config/database.js` | El conector de `main` exige exactamente `DEFAULT` y rechaza `authMechanismProperties` |
| `src/main/inspection.js` | Conector y verificación con `DEFAULT`; el `hello` incluye `saslSupportedMechs: admin.<usuario>` (solo nombres de mecanismos); el informe añade `scram {requested, advertised, negotiated, weaker}` |
| Pruebas actualizadas (cambio intencional de política, solo `main`) | `main-profile`, `main-readiness`, `main-inspection`, `support/inspection-double.js` |
| Pruebas nuevas | `tests/sync/main-scram.test.js` (MS01–MS08) y `tests/sync/support/main-auth-config-probe.mjs` |

## 4. Comportamiento exacto de `DEFAULT` (driver `mongodb` 7.7.0 instalado)

`node_modules/mongodb/lib/cmap/auth/mongo_credentials.js`, `getDefaultAuthMechanism(hello)`: si la respuesta del servidor contiene `saslSupportedMechs` como lista, usa **SCRAM-SHA-256 si la lista lo incluye y SCRAM-SHA-1 en caso contrario**; si no hay lista, SCRAM-SHA-256. `connect.js` pide esa lista al abrir cada conexión (`saslSupportedMechs = <authSource>.<usuario>`). Por construcción el resultado **solo puede ser SCRAM-SHA-256 o SCRAM-SHA-1**: no existe camino a PLAIN, X.509, AWS, GSSAPI u OIDC. Verificado con el código real del driver (MS01).

## 5. Pruebas aprobadas

| # | Cubre |
|---|---|
| MS01 | Negociación con el driver real: prefiere SHA-256 si se anuncia; SHA-1 solo cuando es lo único anunciado; nunca fuera de SCRAM; el mecanismo explícito sí fuerza SHA-256 (por qué fallaba) |
| MS02 | Configuración efectiva con mongoose/driver reales (red bloqueada, `connect()` interceptado): `DEFAULT`, `authSource` admin, TLS estricto, destino fijo, contraseña idéntica byte a byte (5 muestras con especiales/Unicode), sin credenciales ni mecanismo en la URL, fallo sanitizado |
| MS03 | Solo `DEFAULT` es aceptado: SHA-256/SHA-1 explícitos, PLAIN, X.509, AWS, GSSAPI, OIDC, CR, variantes de mayúsculas/espacios, vacío, nulo y `authMechanismProperties` se rechazan antes de conectar y, si el cliente efectivo trae otro, se cierra tras conectar |
| MS04 | No se relaja nada más: TLS, certificados, hostname, `authSource`, usuario, base, `autoIndex`/`autoCreate` y destino siguen rechazando (15 variantes + 6 post-conexión) |
| MS05 | `integration` intacto: sigue con SHA-256 explícito, su destino propio, rechaza `DEFAULT` y la configuración de `main`; ningún archivo de integración contiene el mecanismo de `main` |
| MS06 | Ninguna variable de entorno, URI, ni la autorización de inspección puede cambiar mecanismo, TLS o destino |
| MS07 | La inspección informa qué anuncia Atlas y cuál usará `DEFAULT`; marca `weaker` para SHA-1; sigue de solo lectura (operaciones ⊆ lista permitida), autorización de un solo uso, cierre ordenado y sin secretos |
| MS08 | La excepción SHA-1 está documentada en código y en este informe |
| MP*/MR*/IN* | Las pruebas existentes de `main` y de la inspección se actualizaron solo en lo que cambia por la política (mecanismo) y siguen pasando |

Resultado: regresión completa `run-backend-regression.js` **671 + 9 aprobadas, 15 + 1 omitidas, 0 fallos** (40 + 2 archivos); legacy 39/39; MS01–MS08 8/8. No se ejecutaron suites C# (no se tocó Godot ni la persistencia).

## 6. Riesgos de compatibilidad con SCRAM-SHA-1

- **SCRAM-SHA-1 es menos robusto** (usa SHA-1 y MD5 para derivar el verificador) y no hay forma de exigir SHA-256 con `DEFAULT`: si Atlas dejara de anunciarlo, la degradación sería silenciosa. Por eso la inspección ahora **muestra lo anunciado y marca `weaker: true`**, y el informe de cada ejecución real debe revisarse.
- Un servidor que anuncie solo mecanismos no SCRAM provoca fallo de autenticación (no hay fallback fuera de la familia SCRAM).
- La excepción está pensada para el usuario `twosides_backend` actual. **Recomendación pendiente:** habilitar SCRAM-SHA-256 para esa cuenta en Atlas (restablecer la contraseña regenera las credenciales; si no basta, recrear el usuario con el mismo nombre o contactar con soporte) y, cuando lo anuncie, volver a exigir `SCRAM-SHA-256` explícito en `main` (cambio de una constante y de las pruebas).
- La contraseña no se protege más ni menos por el mecanismo; sí se transmite siempre sobre TLS validado.

## 7. Controles de seguridad conservados

TLS obligatorio y validación de certificado y hostname (sin callbacks permisivos); `authSource=admin`; destino fijo `<cluster>.<id>.mongodb.net` / `two_sides_db` / `twosides_backend` (el usuario de integración se rechaza); ningún parámetro externo ni opción puede cambiar mecanismo, TLS o destino; JWT v2 con ámbito `main`; autorización por propietario; idempotencia y recibos; activación explícita (`-EnableMain`, `MAIN_ENABLE`, perfil, tubería); permisos verificados (rol único `readWrite` sobre `two_sides_db` para el backend; `read` para un inspector dedicado); inspección de lectura con lista cerrada de operaciones, sin modelos Mongoose, autorización de un solo uso y ventana ≤ 60 min; contraseña solo por entrada oculta y trama por stdin, sin registros ni archivos.

## 8. Condiciones para la primera inspección real

1. B00 aceptado o mitigado por escrito y contraseña de la identidad de inspección rotada o creada nueva (no la expuesta).
2. Preferible una identidad `dedicated-read-only` con un solo rol `read` sobre `two_sides_db`; si se usa `twosides_backend`, solo con su contraseña ya rotada.
3. Autorización emitida por el operador con `new-main-inspection-authorization.js` (no se generó ninguna).
4. Revisar en el informe de la ejecución: `scram.negotiated` (se espera `SCRAM-SHA-1` mientras el usuario no tenga SHA-256), `identity.role`, veredicto y conflictos.
5. Nada de esto autoriza escrituras ni la activación de `main`.

## 9. Limitaciones pendientes

- Nada se midió contra Atlas: la negociación real depende de lo que el servidor anuncie en cada conexión.
- Sigue sin existir herramienta de bootstrap de `main_v2` y el esquema remoto es desconocido.
- La excepción es por usuario y por proyecto: otro usuario o un clúster futuro con SHA-256 podría exigir revertir a la política estricta.
- Eventos `Died`/`RequestRestart` sin conectar, sin HTTPS desplegado, cuotas por jugador y demás pendientes de `B05_5_MAIN_ACTIVATION_READINESS_RESULT.md` no cambian.
- B00 continúa pendiente.

## 10. Cifras finales de la regresión

Vitest: 671 + 9 aprobadas, 15 + 1 omitidas, 0 fallos. Legacy: 39/39. Resultados de dobles y del código real del driver; ninguno describe a Atlas.
