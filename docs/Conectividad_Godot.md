# Supervisor de conectividad

GameApplicationContext compone el transporte supervisado y un aviso persistente.
Un Timer de Godot funciona incluso en pausa y llama al supervisor cada intervalo
(10 s por defecto). Autoload sin sesión no envía HTTP. El primer chequeo ocurre
tras un intervalo desde autenticarse; no existe garantía de conexión permanente.
ApiConfiguration admite timeout e intervalo configurables, positivos y finitos.
Cada HttpRequest utiliza su timeout configurado (10 s predeterminado).

GET /api/health requiere 200 y JSON status=ok, service=two-sides-backend. Solo
comprueba HTTP/Express: no valida JWT ni disponibilidad de MongoDB. El supervisor
distingue Inactive, Checking, Available, Unavailable y SessionInvalid. Expiración
local o 401 de los servicios sigue requiriendo autenticación; health no la sustituye.

Una sola comprobación puede estar activa. Se pospone cuando hay solicitudes de
negocio en vuelo; no las cancela ni repite. El transporte notifica timeout, red y
errores de servidor. Tras un fallo conocido bloquea nuevos POST de juego, conserva
snapshots y pendientes, y mantiene un aviso interactivo con el juego pausado.
Los servicios existentes siguen manejando errores e idempotencia de cada comando.

Al volver health, el coordinador valida /auth/me y recupera la partida antes de
declarar recuperado el servicio. Solo el error exacto CURRENT_GAME_NOT_FOUND puede
provocar creación mediante el flujo existente. No se reenvían decisiones, reinicios
ni final-exit ni se generan eventos de reintento. Los comandos inciertos se resuelven
posteriormente por sus flujos explícitos. Una respuesta de otra generación de
sesión se descarta. Logout detiene las solicitudes futuras y limpia supervisión.

No se reanuda automáticamente una escena: el aviso permite volver a Recuperación
tras validar el progreso, o al login si la sesión ya no sirve. Las autorizaciones
de entrada y las operaciones pendientes mantienen sus controles existentes.
La pausa se impone en cada frame sin enviar HTTP por frame, para resistir menús
legados que asignan Paused=false. Ademas se conserva el modo de procesamiento de
la raiz de la escena y se deshabilita temporalmente, sin recargarla ni cambiar sus
variables; al liberar el bloqueo se restaura el modo anterior. El aviso toma foco
para evitar activar por teclado botones de modales anteriores. No se despausa por cuenta propia una pausa previa
de derrota o menú. Al cambiar explícitamente a una pantalla segura se libera la
pausa del recorrido abandonado. El menú de pausa consulta también este bloqueo.

Riesgos pendientes de prueba visual: orden de callbacks de salida, fundidos,
pausa previa por GameOver/MenuPausa y apertura del aviso durante otro modal.
Los nodos con ProcessMode.Always continúan ejecutándose (interfaz y transporte);
movimiento y temporizadores heredados respetan SceneTree.Paused. No se ha iniciado
Godot para comprobarlo. El tiempo de detección incluye intervalo, timeout y
posposición por solicitudes activas; una caída no se detecta instantáneamente.
No hay persistencia user:// en esta entrega.
