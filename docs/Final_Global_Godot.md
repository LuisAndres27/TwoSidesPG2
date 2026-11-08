# Final confirmado y salida

Final.cs conserva los textos y la animación de escritura de Final.tscn. Ya no
utiliza resultado estático ni un final predeterminado. Solo muestra el ending
good/medium/bad de un snapshot final_pending validado de la sesión actual.
Una entrada inválida redirige a login o recuperación, sin calcular el final.

El quinto completado conduce al final después del POST y GET confirmados. Al
reconectar, Recuperación permite Ver final confirmado. Abrir la escena, terminar
su animación o cerrar Godot no llama final-exit. El clic/espacio explícito después
de leer envía la salida; el primer clic durante escritura solo completa el texto.

Services.Endings guarda un único eventId, expectedRevision y gameId en memoria.
Timeout, red, 401 o 409 conservan la operación. Cada reintento explícito usa ese
mismo contenido. Con recibo conocido solo vuelve a recuperar la partida actual.
Un 401 requiere login de la misma cuenta; desde Recuperación, Reintentar resuelve
el comando pendiente. Logout explícito borra pendientes y cambio de cuenta los
invalida; las respuestas tardías no restauran otra sesión.

La salida se confirma solo si el recibo corresponde al evento y partida y GET
devuelve exactamente su successorGameId: in_progress, revisión cero y cinco
biomas disponibles sin decisión, ambiente ni resultado. Solo entonces se limpian
los indicadores locales antiguos. El backend archiva y conserva el historial;
Godot no borra ni escribe decisiones previas. Se vuelve a recuperación antes
de permitir el acceso protegido a biomas.

Las pruebas son simuladas; historial y transacciones siguen siendo responsabilidad
del backend previamente probado. La animación, distribución del mensaje de error
y cambios de escena requieren revisión visual posterior. No se inició el motor.
Pendientes: persistencia user:// y supervisor de conectividad. Sin este último
no se detecta inmediatamente la pérdida de red en periodos sin solicitudes.
