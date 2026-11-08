# Pantallas de autenticación

Escenas nuevas: `res://scenes/auth/login.tscn` y `register.tscn`. Reutilizan
el fondo y tablero del menú principal, con un tema común y controles de texto
para teclado y ratón. Jugar abre el login si no hay sesión válida. Con sesión
válida solicita explícitamente validación y recuperación mediante el coordinador.
La carga del menú y del login no hace HTTP.

Los controladores resuelven únicamente `/root/GameApplicationContext`.
El login utiliza su SessionManager; el registro utiliza su AuthService.
No hay servicios, tokens, usuarios ni partidas alternativos.

Las validaciones reflejan `auth.schemas.js`: normalización NFKC, minúsculas y
espacios exteriores para las identidades; nombre de 3–32 caracteres a-z/0-9/_,
correo de hasta 254 caracteres con el patrón de Zod instalado; contraseñas de
12–128 caracteres para registro y 1–128 para login. La confirmación se compara
localmente y no se incluye en el DTO. El servidor sigue validando como autoridad.
Las contraseñas no se recortan ni se normalizan, y los campos no las truncan.

Los campos secretos se vacían inmediatamente al enviar (también si hay un error
de validación), al navegar y al salir del árbol. Las cadenas administradas y el
cuerpo de una petición en vuelo no admiten borrado criptográfico garantizado;
no se conservan credenciales en el estado del formulario, logs ni archivos.
Las señales se conectan en Ready y se desconectan en ExitTree, sin conexiones
serializadas adicionales. Durante una petición se bloquean campos y botones.

Un 429 deshabilita el envío hasta Retry-After (segundos o fecha HTTP). Si falta
o es inválido, se usa una pausa conservadora de 15 minutos para login y una hora
para registro. No se repite ninguna solicitud automáticamente. El contador es
solo de esta pantalla en memoria; el limitador del backend sigue siendo la
autoridad incluso si se abandona y vuelve a abrir. Los demás errores muestran
mensajes propios genéricos y nunca texto técnico de la API.

Registro correcto: vuelve al login sin autenticar automáticamente. Login correcto:
mantiene la sesión e inicia la validación de cuenta y recuperación. El login
permite reintentar manualmente la recuperación sin volver a enviar credenciales.
Si la sesión expira o es rechazada, vuelve a habilitar el formulario de login.
Los errores bloquean el avance y muestran mensajes seguros; no hay reintentos
automáticos. Volver conserva una sesión válida y regresa al menú principal.

El controlador efímero `EntryAccessController` utiliza exclusivamente el
coordinador compartido; no crea servicios ni sesiones. Los botones bloquean
solicitudes y transiciones simultáneas. Al abandonar la escena descarta su
presentación; el coordinador conserva el resultado confirmado. Los estados
in_progress y final_pending se presentan en `recuperacion_partida.tscn`. La
navegación a biomas utiliza la reserva y admisión descritas abajo; el final
permanece en lectura. Presentar una confirmación no consume su autorización.

## Recuperación visual

MenuPrincipal y LoginScreen abren RecoveryScreen después de recuperar, tanto
para resultados confirmados como para errores de una sesión todavía válida.
`LatestResult` y `RestoreResult()` transfieren el resultado vigente sin HTTP ni
consumir su ticket. Al abrir directamente la pantalla sin resultado se muestra
la recuperación requerida; solo el botón de reintento realiza solicitudes.
No se repite login. La primera partida solo se crea tras el error exacto
`CURRENT_GAME_NOT_FOUND`, mediante el servicio existente.

Un final pendiente se muestra en lectura como bueno, medio o malo, sin
recalcularlo, archivarlo ni ejecutar final-exit. El usuario puede volver al menú
con su sesión o cerrarla: logout limpia el contexto incluso durante una petición.
Los resultados tardíos de otra sesión se descartan. Ante expiración/401 aparece
Iniciar sesión. La pantalla desconecta señales y descarta su presentación al salir.

Continuar solo se habilita con sesión, progreso in_progress confirmado y permiso
vigente del coordinador. `BiomeMenuAccessGate` reserva la transferencia antes de
pedir el cambio de escena, sin consumirla. Un error de carga o de navegación
libera la reserva sin gastar el permiso. MenuNiveles consume el ticket al validar
la entrada real, vincula la admisión a esa instancia y solo entonces se muestra
y permite interacción. Una segunda instancia o una entrada directa se rechaza.
No se hace HTTP en el destino. La sesión, usuario (mediante generación y almacén
asociado), partida y revisión deben seguir vigentes; logout y cambio de cuenta
invalidan las reservas. Salir del menú libera la admisión, sin renovar el ticket.

Sin sesión se redirige al login; sin confirmación, con errores o final pendiente,
a recuperación. El final no se modifica. La escena permanece oculta y con proceso
deshabilitado mientras no esté autorizada. Una comprobación local por fotograma
detecta expiración o invalidación del estado; no comprueba conectividad remota.
Ante un fallo después de que Godot acepte el cambio pero antes de crear el destino,
una recuperación explícita nueva invalida la reserva antigua.

Las cinco tarjetas mantienen su diseño y selección libre. Ahora usan el progreso
confirmado para human_pending, animal_pending y completed; su navegación y el
orden de aplicación del ambiente se describen en `Tarjetas_Biomas_Godot.md`.
Todavía no hay supervisor de conectividad. La admisión de cliente no sustituye JWT
ni validaciones de propiedad y estado del backend.

Las comprobaciones locales prueban el estado del formulario con HTTP simulado
y la estructura de las escenas. La compilación verifica los controladores
contra GodotSharp. Quedan pendientes las comprobaciones visuales en Godot:
encuadre a 640x360 y otras resoluciones, foco/tabulación, campos ocultos,
clics, cambios de escena y lectura de mensajes. No se ha iniciado el motor.
