# Tarjetas basadas en progreso confirmado

El menú admitido crea un solo BiomeCardController compartido por las cinco
tarjetas. Los valores de TipoNivel se mapean explícitamente a ocean, jungle,
desert, forest y tundra. No se consultan los resultados estáticos de
VariablesGlobales para representar ni permitir la selección.

| Bioma | Decisión humana | Inicio animal |
| --- | --- | --- |
| ocean | DesicionDelfin.tscn | bioma_mar.tscn |
| jungle | DesicionMono.tscn | bioma_selva.tscn |
| desert | DesicionRataCanguro.tscn | bioma_desierto.tscn |
| forest | DesicionZorro.tscn | bioma_bosque.tscn |
| tundra | DesicionNieve.tscn | bioma_nieve.tscn |

Todas las rutas pertenecen a scenes/levels. Son las mismas decisiones configuradas
en las tarjetas y los mismos destinos animales de las pantallas informativas.
EscenaNivel se conserva serializada para compatibilidad, pero la selección real
usa este catálogo explícito según el estado confirmado.

human_pending usa TexturaNoJugado y mantiene el ambiente null. No se asigna un
ambiente por defecto ni se usa el booleano global para decidir la navegación.
animal_pending usa su ambiente confirmado y salta la decisión y pantalla
informativa para iniciar una instancia nueva del segmento animal. completed usa
el resultado good/bad para su textura y bloquea la selección. Los cinco biomas
incompletos se pueden seleccionar en cualquier orden; elegir no escribe progreso.

Los biomas, jugadores, fuentes de recursos y enemigos leen BiomaSaludable en
Ready, incluidos nodos hijos que se inicializan antes de la raíz. Por eso se
amplió Transicion con CambiarEscenaValidadaAsync: después de fundir a negro y
justo antes de ChangeSceneToPacked vuelve a validar admisión, sesión, partida,
revisión y segmento. Solo entonces asigna healthy/degraded al booleano legado,
antes de inicializar cualquier nodo animal. Las llamadas existentes a
CambiarEscena mantienen su comportamiento. Sin Transicion se aplica la misma
validación inmediatamente antes del cambio directo. No se toca el booleano al
seleccionar human_pending; el booleano legado no representa el null del backend.

Un único plan pendiente bloquea clics en todas las tarjetas. Si cambian la sesión
o revisión durante el fundido se cancela la entrada; una confirmación vieja nunca
se aplica. El menú protegido redirige a recuperación o login cuando pierde su
admisión. No se hace HTTP ni se crean decisiones al elegir una tarjeta.

Pendientes: confirmaciones animal-completions/animal-restarts, finales, retorno
completo entre segmentos y supervisor de conectividad. Sin supervisor esta
comprobación local no detecta una desconexión remota antes de la siguiente
solicitud. Las reglas actuales de FinNivel/GameOver permanecen sin integrar.
La apariencia, el fundido y la inicialización real requieren revisión posterior
en Godot; esta entrega solo ejecuta comprobaciones simuladas y compilación.
