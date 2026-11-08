# B05.2D.1 — Plan de pruebas de persistencia

Diseño, 2026-10-27 Guatemala. NO ejecutado en esta fase. Los 89 aprobados (39 legacy + 50 JWT) pertenecen a B05.2C.

## Capas y aislamiento

M: repositorio en memoria, reloj/proveedor falsos; prueba reglas y fallos inyectados, nunca durabilidad.
D: MongoDB sintético aislado con replica set para transacciones, namespace aleatorio exclusivo, índices reales y datos generados.
P: dos procesos Node independientes, mismo D y proveedor de claves sintéticas persistente fuera del proyecto/OneDrive, ubicación previamente autorizada.
C: contrato de cliente offline con adaptador falso; después integración cliente solo con autorización propia.

No instalar MongoDB, levantar servidores ni ejecutar pruebas ahora. La futura batería no carga backend/.env: configuración explícita, guardas de lectura, Vitest envDir=false, sin dotenv ni descubrimiento de configuración real. No Atlas/AWS/credenciales reales. Las tres bases protegidas no son fixtures ni destinos temporales. Token/secreto/PHC/privada solo en memoria o almacén de prueba protegido, no stdout/reportes. IPC de reinicio protegido, limpiado al terminar; reporte solo IDs sintéticos/resultados. Limpieza restringida a namespace/ruta creados por el test, nunca comodines contra bases reales.

## Matriz propuesta

| Caso | Capa mínima | Resultado exigido |
| --- | --- | --- |
| 1 Identidad tras reinicio | D+P | Mismo accountId y binding, no registro nuevo |
| 2 Clave tras reinicio | P | Mismo kid/fingerprint, sin generación automática |
| 3 JWT previo tras reinicio | D+P | Mismo jti aceptado hasta exp con estado durable |
| 4 Credencial revocada | M+D | 401 y sesiones previas inválidas |
| 5 Instalación duplicada | M+D concurrente | Restricción real de vínculo; no apropiación por UUID |
| 6 Alta repetida | M+D | Mismo resultado con misma prueba de posesión |
| 7 Idempotencia/ACK perdido | D+P | Un receipt/cuenta/vínculo, reintento estable |
| 8 Colisiones UUID/registrationId | D concurrente | Ganador único, perdedor no sobrescribe ni filtra |
| 9 Credencial inválida | M+D | 401, sin sesión ni mutaciones de vínculo |
| 10 Credencial vencida | M+D reloj | Antes de expiresAt acepta; en/después rechaza; null no vence por accidente |
| 11 Privada faltante | M+P | Sin emisión/readiness; no fallback |
| 12 Clave corrupta/desparejada | M+P | Fallo saneado, nunca secretos en log |
| 13 Rotación A/B | M+P | Ambas públicas durante transición; A retirada/comprometida rechazada |
| 14 kid desconocido/alg/URL | M | 401 sin red, sin confusión de algoritmo |
| 15 Player pretende admin | M+D | Body estricto y rutas panel rechazan |
| 16 Identidad ajena | M+D | 403 y ninguna exposición de datos |
| 17 Admin sintético | M | Solo fixture explícito; no prueba de OIDC real |
| 18 Identidad inexistente | M+D | 401 genérico sin enumeración |
| 19 Almacén caído | M+D | 503 controlado, no sesión temporal ni fail-open |
| 20 Recuperación/reintento | D+P | Tras vuelta del almacén, mismo vínculo, sin duplicados |
| 21 Gameplay independiente | C | Fallo remoto solo deja sync pendiente |
| 22 Ausencia secretos reales | M+D+P | Guardas de IO/config/logs y hashes protegidos intactos |
| 23 Regresión B05.2C | M | Ejecutar nuevamente 39+50 cuando se autorice D.2 |

Añadir: carreras de alta simultánea con misma/diferente credencial, duplicados E11000, caída antes/después commit, reintento transaccional acotado, índices ausentes impiden readiness, sesión contra revocación mediante escritura CAS común, rotación de credencial/ACK perdido, suspensión/reactivación con versiones, cambio de rol servidor, borrado/TTL sin reutilizar IDs, reloj límites exactos, pool/rate limits multiinstancia, rechazo cruzado opaco/v1/v2, keyring desactualizado, reinicio durante cambio de firmante y pérdida de proveedor. Verificar que validación no almacene ni devuelva PHC, secreto o token en mensajes.

## Ensayo real de reinicio

1. Provisionar exclusivamente entorno sintético autorizado e índices; registrar hashes protegidos y configuración no secreta.
2. Proceso A carga clave sintética persistente, registra cuenta/vínculo, verifica credencial y emite JWT; conserva referencia protegida para B.
3. Detener A completamente. Proceso B arranca desde cero, misma base/keyring. Verificar mismo accountId, cv, bindingGeneration, authzVersion y jti; JWT anterior válido sin alta ni sesión nuevas.
4. Reiniciar otra vez tras revocación; JWT debe seguir inválido. Avanzar reloj después de exp; reinicio nunca amplía vigencia.
5. Controles negativos: mantener claves pero sustituir repositorio por Maps vacíos invalida sesión; mantener base pero quitar clave impide emisión; mantener cuenta pero perder sesión no acepta JWT.
6. Reiniciar en rotación A/B y probar retiro/compromiso. Registrar evidencia de procesos/estados/resultados sin material criptográfico.
7. Verificar integridad y limpiar solamente artefactos sintéticos.

Recrear createApp con el mismo objeto o serializar un Map entre dos instancias en un proceso NO demuestra persistencia. Un fake durable sirve para contrato, no sustituye al ensayo D+P con almacenamiento real y commit comprobado.

## Inventario previsto para implementación futura

Sujeto a autorización de B05.2D.2, no archivos creados ahora:
- Revisar src/modules/auth/auth-service.js, jwt-service.js, jwt-schemas.js y memory-repository.js; puerto asíncrono de repositorio en nuevo identity-repository.js; métodos actuales síncronos deben migrarse con await.
- Proponer mongo-identity-repository.js y modelos bajo src/modules/auth/persistence/; dependencias Mongoose/driver requieren aprobación de alcance, sin instalación aquí.
- Proponer src/config/key-provider.js y proveedor sintético privado; revisar config/jwt.js para keyring, ver/pair self-test y configuración explícita.
- Revisar src/app.js y middleware/authentication.js/authorization.js para rutas v2, errores 503 y aislamiento administrativo. No quitar bloqueo de producción incidentalmente.
- Proponer tests de contrato/concurrencia/reinicio bajo tests/identity-persistence y tests/jwt; revisar guardas existentes y configuración Vitest.
- Ningún archivo Godot, SQLite, .env o ACL autorizado por esta lista. Cliente protegido/enrollment/admin OIDC reales son trabajo posterior independiente.

Comandos futuros orientativos, NO ejecutados: npm test para regresiones; npx vitest run para suites autorizadas y scripts explícitos de dos procesos con configuración sintética. No usar npm start ni conexión ambiental real. Definir scripts exactos al existir el harness y aprobar puertos/rutas/servicio de prueba; no presentar comandos contra scripts inexistentes como ejecutables actuales.

## Aceptación y bloqueos

Requerir evidencia D+P, unicidad/transacciones reales, continuidad/revocación tras reinicio, roles/propiedad correctos, rotación segura, fallos cerrados, cero secretos y bases protegidas intactas. Reportar regresiones históricas por separado de resultados nuevos.

Pendientes: autorización D.2; proveedor de base sintética sin Atlas; ubicación privada y custodia de claves; política de recuperación/retención/admin; contrato v2 y adaptación async. B00 sigue pendiente por dos Allow no resueltas y restauración ACL ensayada solo de manera limitada; no extender esa prueba a garantías productivas.

Esta fase solo modifica nueve documentos autorizados. No inicia B05.3, cliente Godot, servicios ni persistencia.



## B05.2D.2 — Batería implementada y evidencia (2026-10-27 Guatemala)

Se agregaron 35 pruebas: 26 con fake en memoria/HTTP y 9 de archivos/aislamiento, incluidos ensayos con procesos backend Node independientes. Las 89 anteriores se conservan sin editar sus casos. Comando completo: npm test; runner Vitest incluye tests/jwt y tests/identity-persistence con envDir=false y guardas .env en padre/workers/subprocesos.

Cobertura nueva: puerto async, binding/ID estable, Argon2id real, idempotencia concurrente y tras reapertura, conflicto de secreto/IDs, schemas/rol, JWT ver2 y versiones vivas, firma/alg/iss/aud/kid inválidos, expiración exacta, credencial con vencimiento sintético, revocación de jti/cv/identidad, carrera revocación-sesión, ownership HTTP, rechazo cruzado legacy/v1/v2, outage con 503/reintento, rollback ante fallo previo a commit, fichero incompleto/corrupto, maestra incorrecta, clave ausente/corrupta/desparejada, privacidad de datos cifrados, y dos instancias sobre mismo fichero con lock/503/reintento.

Ensayo de reinicio: A emite token y termina; B tiene PID distinto, misma clave/kid/fingerprint/cuenta/jti y acepta JWT por servicio y ruta HTTP; otro proceso rechaza exp exacta; otro revoca identidad y uno posterior sigue rechazando el token anterior. Tokens solo pasan por IPC, no se imprimen. Ensayo de interrupción termina abruptamente un hijo antes del commit: snapshot anterior idéntico, JWT anterior verificable, nueva escritura bloqueada por lock residual. No se finge un ACK de la revocación interrumpida.

No se ejecutó MongoDB/Atlas: las capas D y D+P con base sintética real siguen pendientes. El archivo autorizado por B05.2D.2 demuestra continuidad en almacenamiento temporal, no índices/transacciones/durabilidad de Atlas. El ensayo de lock permite escrituras secuenciales y rechaza contención con 503; no hay cola/reintento automático, stale-lock recovery, concurrencia distribuida ni garantía ante apagón.

Incidencias: primera ejecución bloqueada antes de casos por spawn EPERM del sandbox; reejecutada con permiso de procesos/loopback y archivos privados, sin modificar ACL. Primera batería nueva pasó 32/34; dos fallos de bootstrap corregidos usando URL file:// para --import en Windows. Los dos focalizados pasaron; luego batería completa y nueva comprobación de confinamiento de rutas. No se ocultaron esos intentos ni se cuentan repeticiones como casos nuevos.

No se ejecutó Godot ni las 598 pruebas históricas del videojuego. Su aislamiento se acredita aquí por ausencia de integración cliente y comparación de archivos/bases, no por una sesión de gameplay nueva. Producción incompleta sigue rechazada, admin solo fixture interno v1 (regresiones), sin JWT v2 administrativo.


### Cierre verificado B05.2D.2 — 2026-10-27 Guatemala

**COMPLETADA EN CÓDIGO, únicamente en el ámbito sintético autorizado.** Resultado final de npm test: **124 aprobadas, 0 fallidas, 0 omitidas**: 39 legacy node:test + 50 regresiones JWT B05.2C + 35 nuevas (26 memoria/contrato/HTTP y 9 archivo/aislamiento). No sumar reejecuciones. Todos los procesos Node y listeners de ensayo terminaron; cero directorios identity-d2-* de ensayo restantes.

Inventario final: 23 archivos deliberados (15 existentes modificados y 8 nuevos): seis código/config de pruebas existentes, un puerto src nuevo, siete archivos nuevos de batería/soporte y nueve documentos autorizados. De 4.839 archivos iniciales inventariados fuera de .git/node_modules/.godot y .env separado, 4.824 permanecen idénticos en hash/tamaño/mtime; ocho añadidos, cero eliminados. No otros cambios de contenido detectados. El lector del manifiesto usa UTF-8 explícito para no confundir nombres con Ñ como altas/bajas.

Tres bases protegidas y nueve archivos asociados: hash/tamaño/mtime idénticos. Backend/.env coincide con referencia histórica y conserva tamaño, fecha y descriptor/propietario; sin lectura de valores. SDDL/owner de raíz, backend, .env y .git idénticos antes/después; no comandos de cambio ACL/herencia/owner. No se afirma una nueva auditoría completa de ACL por archivo de todo el árbol. B00 sigue pendiente con ambas Allow investigadas y cuatro Deny Git conservadas.

No dependencias nuevas, Atlas, AWS, Godot, SQLite/SQL/migración, secretos reales ni producción. Persistencia Mongo/índices/transacciones, recuperación de usuario, DPAPI, keyring/rotación productivos y admin OIDC pendientes. El ensayo de archivo no acredita Atlas ni recuperación de apagón o fin del orquestador. Recomendación: revisión y autorización específica antes de cualquier B05.3; **B05.3 no iniciada, trabajo detenido**.
