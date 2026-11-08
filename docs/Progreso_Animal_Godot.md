# Confirmación del segmento animal

`Services.Animals` es único y persiste entre escenas. Envía DTO existentes a
animal-completions y animal-restarts con propietario implícito en JWT, gameId y
revisión del progreso confirmado. No transmite coordenadas, vida, recursos,
ambiente ni resultados como autoridad. Un comando UUID inmutable permanece en
memoria hasta confirmar y aplicar la acción local. Logout lo elimina; un 401
requiere autenticarse con la misma cuenta para reintentarlo. Otra cuenta no puede
acceder al pendiente.

FinNivel identifica el bioma por escena y comprueba su configuración. La meta
pausa el juego y confirma, sin calcular resultados ni finales locales. GameOver
envía death; el menú de pausa envía voluntary. Solo se permite iniciar en
in_progress y animal_pending. Después del POST se recupera el snapshot completo:
el recibo parcial no reemplaza ni reduce la revisión. Se contrastan evento,
revisión, operación, ambiente, decisión humana, resultado, fechas y final.

Un único aviso modal bloquea movimiento y continuación durante confirmación o
incertidumbre. Reintentar reutiliza exactamente el comando. Un 409 requiere GET
antes del reintento; un recibo conocido solo requiere recuperar, nunca repetir
POST. Un 429 respeta Retry-After y nunca se repite automáticamente. El aviso
permite ir a recuperación/login sin resolver localmente la incertidumbre.
En recuperación, Reintentar abre el comando pendiente si existe. Las tarjetas
quedan bloqueadas mientras haya una operación animal pendiente.

Reiniciar carga una instancia nueva de la escena animal existente. Su posición
es la configurada en escena, los jugadores restauran CurrentHealth=MaxHealth y
Estadisticas inicializa Agua/Comida a sus máximos. Se aplica el ambiente confirmado
antes de inicializar la escena. No se reenvía la decisión ni se tocan otros biomas.
Transicion reconoce la acción justo después de aceptar el cambio de escena y
antes de Ready; una carga fallida conserva el recibo para reintentar.

Completar conduce a recuperación, desde donde se puede validar el acceso al menú
protegido. El quinto bioma conserva final_pending y ending del backend, sin abrir
Final.cs ni ejecutar final-exit. El aviso nunca permite reanudar un recorrido
incierto desde el menú de pausa. Salir al menú desde derrota/pausa va por
recuperación, no por acceso directo a MenuNiveles.

Al reiniciar Godot solo se recupera progreso backend: animal_pending vuelve a la
escena inicial desde las tarjetas; no hay guardado del recorrido. Los comandos
inciertos se pierden al cerrar el proceso hasta implementar user://. Antes de una
nueva operación debe recuperarse la revisión vigente; el servidor mantiene su
idempotencia y control de concurrencia.

Límite: esta entrega detiene el juego ante fallos conocidos de estas solicitudes.
Sin el supervisor posterior no puede detectar inmediatamente una pérdida de red
durante un recorrido sin solicitudes. Las pruebas usan HTTP simulado y verifican
las inicializaciones existentes por lectura de código. Posición, recursos,
pausa y transiciones reales requieren comprobación visual autorizada en Godot.
