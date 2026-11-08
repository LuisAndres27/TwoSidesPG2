# Operaciones pendientes en user://

Producción utiliza `user://pending-operations/<userId>/<gameId>/<eventId>.json`.
La ubicación absoluta depende de Godot/OS y su carpeta de datos de usuario:
ProjectSettings.GlobalizePath resuelve el prefijo al componer el autoload.
No se lee backend/.env. Los tests usan directorios temporales exclusivos, nunca
la carpeta real del jugador. No se añaden dependencias.

El sobre versión 1 contiene solo version, userId, gameId, operation y command.
Los comandos conservan UUID, expectedRevision y campos originales del contrato.
No se guardan JWT, contraseñas, resultados, recibos ni snapshots. Es texto JSON
sin secretos; no es una firma ni una fuente de autoridad. El servidor valida la
sesión, propiedad, catálogo, revisión e idempotencia en cada POST.

PersistentApiClient escribe antes de entregar el POST al transporte. Si no puede
guardar, rechaza el envío. Usa archivo temporal exclusivo en el mismo directorio,
Flush(true) y renombrado sin reemplazar un evento existente. Un reintento solo
admite contenido idéntico. Un cierre entre guardar y enviar puede dejar un comando
no recibido todavía por el servidor: se concilia explícitamente de igual forma.

No se reproduce nada al arrancar o iniciar sesión. Primero /auth/me y recuperación
de progreso; RecoveryScreen carga solo la partición de la cuenta autenticada y
muestra los pendientes. Reintentar realiza conciliación de un comando por acción.
No cambia UUID/revisión, no actualiza progreso desde disco y no reduce revisiones.
El recibo debe confirmar el mismo evento y ser compatible con un GET vigente.
Solo entonces se elimina ese archivo. Los servicios también retiran el archivo
tras su confirmación normal y recuperación exitosa.

Los pendientes de otra partida no se aplican a la actual. Para final-exit con
sucesora ya actual se verifica el origen archivado mediante GET personal y el
recibo idempotente debe nombrar esa misma sucesora. El backend no vuelve a reiniciar
la sucesora. Si no puede demostrarse compatibilidad se conserva el archivo, sin
crear un evento nuevo. Comandos de partidas antiguas permanecen separados.

Logout limpia la memoria, no estos archivos. Otra cuenta no los carga ni reenvía.
El supervisor sigue bloqueando POST de juego sin conectividad recuperada; no se
añade ninguna excepción offline. El archivo por sí solo nunca autoriza avanzar.

Lectura estricta: claves exactas (sin duplicados), versión, IDs, UUID, revisión
entera segura, catálogo y opciones; máximo 8 KiB y límite de lectura de comandos.
Se rechazan enlaces/reparse points en los directorios propios. Corrupciones se
renombran .invalid-<UUID>; archivos temporales/incompatibles o cuarentena mantienen
el bloqueo. No se borran automáticamente. Durante desarrollo, revisar manualmente
solo la partición ficticia correspondiente, con el juego cerrado y después de
verificar el estado del backend. No borrar pendientes de usuarios reales para
forzar avance: faltaría resolver si el servidor confirmó el evento.

Riesgos pendientes de validación real: cierre brusco durante Flush/rename,
permisos/espacio en disco, dos procesos compartiendo user:// y orden de callbacks
de escena. La escritura reduce archivos parciales, pero no garantiza durabilidad
ante todas las fallas de hardware. Sin una API para resolver eventos rechazados,
un 409 no demostrable queda bloqueado para revisión; no se descarta por heurística.
No se ha ejecutado Godot, backend ni Atlas para estas comprobaciones.
