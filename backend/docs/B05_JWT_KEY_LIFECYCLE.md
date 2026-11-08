# B05.2D.1 — Ciclo de vida propuesto de claves JWT

Estado: diseño exclusivamente, 2026-10-27 Guatemala. Complementa B05_PERSISTENT_IDENTITY_CONTRACT.md; no cambia configuración ni genera claves.

## Auditoría RS256 real

tests/jwt/jwt.test.js genera parejas RSA de 2048 bits mediante generateKeyPair en beforeAll y otra pareja para negativos. El fixture usa kid fixture-key, texto repetido aunque las parejas cambien entre ejecuciones. No es un registro duradero de claves.

src/config/jwt.js acepta solo mode isolated-test, RS256, CryptoKey privada/pública RSA PKCS#1 v1.5 SHA-256 de al menos 2048 bits; issuer exacto https://two-sides.test.invalid y audiencia escalar exacta two-sides-isolated-api. La clave se inyecta, no se carga de archivo ni se genera desde app/server. NODE_ENV=production está bloqueado. Hoy se valida tipo/algoritmo de cada clave, pero no se prueba al arrancar que ambas formen pareja.

src/modules/auth/jwt-service.js firma con la clave privada configurada y valida con una pública fija. Header obligatorio alg RS256, typ at+jwt y kid configurado; rechaza headers adicionales, kid desconocido, algoritmos ajenos y ubicaciones remotas. No sigue jku/x5u. Claims requeridos: iss, aud, sub UUID cuenta, exp, iat, nbf, jti UUID sesión, role y cv. Duración exacta 900 s, nbf=iat, reloj tolerancia 0; compara tipos/fechas/rol/versiones contra repositorio.

No existe claim de versión de token. schemaVersion:1 es versión de HTTP; cv es versión de credencial; typ no constituye versión. Revocación actual es stateful mediante cuenta/sesión/versiones en Maps. Reiniciar pierde ese estado; conservar solo las claves NO permite validar las sesiones anteriores. Las 89 pruebas anteriores no prueban durabilidad.

## Materiales separados

| Material | Custodia propuesta | Nunca |
| --- | --- | --- |
| Privada RS256 servidor | Proveedor privado y referencia versionada | Godot, SQLite, repositorio, OneDrive, logs |
| Pública RSA/JWK/SPKI | Registro de validadores confiable | Tomarla de URL aportada por token |
| Credencial instalación | Cliente protegido; servidor solo Argon2id | Usarla como clave JWT |
| Secretos administrativos | Proveedor humano/servidor separado | Entregarlos al juego |

kid identifica de forma estable una pareja y fingerprint públicos. Nunca reutilizarlo con otra pareja. Estado proposed -> validating -> signing -> retiring -> retired, con compromised terminal. Una sola clave firma por entorno; varias públicas pueden validar durante transición. Metadatos públicos no incluyen privada.

## Carga y reinicio

Futuro proveedor recibe referencias aprobadas, issuer/audience exactos, kid activo, keyring público y versiones de almacén/token. No requiere backend/.env ni copia sus credenciales. No añadir ahora variables ni retirar guardia production.

Antes de habilitar autenticación: resolver referencias exactas, comprobar tipo/tamaño/algoritmo, fingerprint/kid, estado persistido y firma/verificación de desafío sintético para probar pareja. Comprobar acceso a identidades y sesiones persistentes, índices y reloj. No generar clave alternativa al faltar la configurada.

Reinicio correcto requiere las MISMAS identidades/verificadores/vínculos, sesiones no vencidas/revocadas, épocas y keyring confiable. Cargar clave activa existente, no cambiar kid ni reemitir identidades. JWT anterior continúa válido solo hasta exp y mientras jti/cuenta/versiones/clave sigan autorizados.

Clave ausente, corrupta, desparejada o referencia equivocada: fallo de readiness/arranque de autenticación, error saneado sin material secreto; nunca fallback a fixture, opaco, HS256 o clave nueva. Si se pierde privada pero se conserva pública, criptográficamente pueden verificarse tokens previos; emisión permanece bloqueada hasta restauración aprobada o rotación controlada. Caída de identidad/revocación produce 503, no autorización desde datos obsoletos ni cambio de identidad. El juego offline sigue independiente.

## Rotación planificada

1. Preparar B en proveedor privado, nuevo kid y fingerprint inmutable. No modificar A.
2. Distribuir pública B a todos los validadores; comprobar recepción y firmas de prueba antes de emitir B.
3. Cambiar firmante activo por CAS de signerEpoch; registrar última emisión A. Coordinar instancias para que ninguna siga firmando A.
4. A queda solo validación. Aceptar A hasta última emisión A + 900 s + margen operativo aprobado de propagación/reloj; propuesta inicial: tolerancia de validación 0, margen de retiro 60 s más demora máxima medida. No ampliar exp del token.
5. Retirar A del conjunto aceptado tras verificar ausencia de emisión tardía; conservar metadatos de auditoría. Retención/borrado de privada según recuperación aprobada, no por TTL improvisado.

Si no se puede acotar emisión tardía, no certificar retiro seguro; primero bloquear firmantes antiguos. Restaurar configuración anterior no debe resucitar una clave compromised ni retroceder épocas de revocación.

Compromiso: marcar kid compromised, bloquear emisión y validación de ese kid inmediatamente en todas las instancias, revocar sesiones asociadas, activar otra clave ya distribuida o suspender autenticación, exigir reautenticación con credenciales no comprometidas. Tokens firmados correctamente por clave comprometida se rechazan incluso antes de exp. Si se expusieron credenciales de instalación, rotarlas por mecanismo independiente; cambiar RSA no las recupera.

## Opciones de custodia y AWS futuro

Para ensayos duraderos: proveedor de archivo sintético privado fuera de repositorio/OneDrive, acceso mínimo, cifrado en reposo y respaldo privado; ruta y permisos deberán aprobarse antes de escribir. Sin claves reales, sin guardar en .env. Archivo cifrado requiere resolver custodia de su clave de cifrado; no guardarla al lado en texto plano.

Alternativa AWS Secrets Manager: versión concreta de privada cifrada, IAM de lectura limitado a secreto/versión necesarios, permiso KMS solo si aplica, rotación coordinada con keyring y auditoría; evitar credenciales AWS embebidas usando identidad de carga de trabajo. La aplicación recibe privada en RAM, por lo que el proceso comprometido sigue siendo riesgo. [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html).

Alternativa KMS: clave asimétrica RSA SIGN_VERIFY con RSASSA_PKCS1_V1_5_SHA_256, pública distribuible y privada no exportable. [AWS especificaciones KMS](https://docs.aws.amazon.com/kms/latest/developerguide/symm-asymm-choose-key-spec.html). Exige adaptador de firma remoto con límites/latencia/indisponibilidad y permisos kms:Sign mínimos; no es sustitución directa del CryptoKey actual de jose. Decisión entre proveedores y costes queda pendiente; no llamadas, cuentas ni despliegues AWS.

Respaldo cifrado/versionado con acceso separado, prueba sintética de restauración y comprobación de fingerprint. No copiar claves productivas a tests; backups no deben revertir revocación de cuentas/sesiones. B00 sin resolver impide certificar custodia segura dentro del árbol actual, incluso conservando owner legítimo.

Admins usarán otra cadena de confianza OIDC/MFA y audiencia/permisos separados; fixture admin de B05.2C no acredita esa integración. El panel no acepta tokens de jugador.

## Criterio futuro

Aprobación de proveedor/rutas, índices/transacciones, semántica v2, sesiones persistentes, reloj/rotación, almacenamiento cliente, política de recuperación, monitoreo y riesgo ACL pendientes. B05.2D.2 necesita autorización explícita; ni persistencia diseñada ni producción están habilitadas.



## B05.2D.2 — Proveedor sintético implementado (2026-10-27 Guatemala)

SyntheticKeyProvider, exclusivamente bajo tests/identity-persistence/support, inicializa explícitamente una pareja RS256 de prueba, kid UUID estable, PKCS8/SPKI dentro de archivo cifrado AES-256-GCM. load nunca genera reemplazos; valida config aislada y firma/verifica desafío aleatorio para detectar pareja desajustada. Fingerprint público permite comparar reinicios sin exponer claves. Ausencia/corrupción/clave de cifrado incorrecta produce 503 y no sustituye archivo existente.

Ubicación efímera autorizada elegida: %LOCALAPPDATA%/TwoSides/identity-d2-<UUID>. Se verifican en lectura propietario y Allow únicamente del usuario actual, SYSTEM y Administradores, sin reparse points; no se cambia ACL. Temp general tenía otra Allow no identificada y fue descartado. El adaptador rechaza carpetas de proyecto, runtime y Temp antes de abrir datos. Helper PowerShell crea y verifica solo un directorio UUID nuevo bajo el padre privado existente y elimina únicamente ese directorio validado al finalizar. Ningún respaldo histórico se toca.

Maestra de cifrado aleatoria solo en RAM del orquestador, transferida a hijos mediante IPC, nunca por argumentos, entorno, logs o disco. Lo mismo ocurre con credenciales y JWT usados entre procesos. Se guardan únicamente snapshots cifrados: claves de prueba y verificadores/sesiones; no contraseñas originales persistidas. La maestra no se guarda al lado. Este mecanismo prueba reinicio de procesos backend durante el ensayo; NO promete recuperación tras terminar el orquestador/reiniciar Windows ni implementa custodia productiva/DPAPI.

Escritura: lock exclusivo wx, snapshot temporal nuevo, FileHandle.sync y rename antes de ACK. No caché de autorización cuando falla lectura. Lock residual tras interrupción bloquea escrituras con 503; lecturas de la última versión completa siguen posibles. No se elimina lock automáticamente ni se afirma que la operación interrumpida fue confirmada. Limpieza del árbol sintético retira sus locks al final. Esto no demuestra durabilidad frente a pérdida de alimentación, fsync de directorio en Windows, múltiples hosts ni resistencia a rollback.

Prueba de continuidad real: procesos backend independientes cargan la misma clave/identidad/sesión; JWT anterior sigue válido, exp sigue vigente y revocación confirmada permanece tras otro reinicio. Todos los listeners son 127.0.0.1/puerto0 y cierran; worker interrumpido no abre listener.

Rotación de keyring A/B, registro de claves comprometidas multiinstancia, AWS, custodia operativa y respaldo productivo continúan como diseño, sin implementación en esta fase. No retirar bloqueo production ni usar credenciales reales. Referencias técnicas de primitivas: [Node 24 fs](https://nodejs.org/docs/latest-v24.x/api/fs.html), [Node 24 crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html) y [Node 24 IPC](https://nodejs.org/docs/latest-v24.x/api/child_process.html). Las garantías limitadas descritas son las ensayadas, no equivalencia con Atlas.


### Cierre verificado B05.2D.2 — 2026-10-27 Guatemala

**COMPLETADA EN CÓDIGO, únicamente en el ámbito sintético autorizado.** Resultado final de npm test: **124 aprobadas, 0 fallidas, 0 omitidas**: 39 legacy node:test + 50 regresiones JWT B05.2C + 35 nuevas (26 memoria/contrato/HTTP y 9 archivo/aislamiento). No sumar reejecuciones. Todos los procesos Node y listeners de ensayo terminaron; cero directorios identity-d2-* de ensayo restantes.

Inventario final: 23 archivos deliberados (15 existentes modificados y 8 nuevos): seis código/config de pruebas existentes, un puerto src nuevo, siete archivos nuevos de batería/soporte y nueve documentos autorizados. De 4.839 archivos iniciales inventariados fuera de .git/node_modules/.godot y .env separado, 4.824 permanecen idénticos en hash/tamaño/mtime; ocho añadidos, cero eliminados. No otros cambios de contenido detectados. El lector del manifiesto usa UTF-8 explícito para no confundir nombres con Ñ como altas/bajas.

Tres bases protegidas y nueve archivos asociados: hash/tamaño/mtime idénticos. Backend/.env coincide con referencia histórica y conserva tamaño, fecha y descriptor/propietario; sin lectura de valores. SDDL/owner de raíz, backend, .env y .git idénticos antes/después; no comandos de cambio ACL/herencia/owner. No se afirma una nueva auditoría completa de ACL por archivo de todo el árbol. B00 sigue pendiente con ambas Allow investigadas y cuatro Deny Git conservadas.

No dependencias nuevas, Atlas, AWS, Godot, SQLite/SQL/migración, secretos reales ni producción. Persistencia Mongo/índices/transacciones, recuperación de usuario, DPAPI, keyring/rotación productivos y admin OIDC pendientes. El ensayo de archivo no acredita Atlas ni recuperación de apagón o fin del orquestador. Recomendación: revisión y autorización específica antes de cualquier B05.3; **B05.3 no iniciada, trabajo detenido**.
