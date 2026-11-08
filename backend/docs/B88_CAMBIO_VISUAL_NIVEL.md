# B88 — Cambio visual: bioma terminado atenuado y mensaje «Nivel terminado»

Solo visual. No cambia progreso, guardado, SQLite, decisiones, finales ni estadísticas. **No se ejecutó el juego**: no se ha visto ni probado en pantalla.

## Archivos cambiados (existentes; para la revisión del manifiesto v5)
1. `scripts/TarjetaNivel.cs` — `Modulate` atenuado (gris, 60 % opacidad) cuando `state.Activity == "completed"`; si no, restaura el `Modulate` original. El bloqueo del clic ya existía (`Disabled`).
2. `scripts/AnimalSegmentFlow.cs` — tras guardar y registrar la finalización (ya hecho por `ConfirmLocalCompletion`), en lugar de navegar de inmediato se muestra «Nivel terminado / <bioma> / Estado del ecosistema: saludable|degradado» y el botón «Continuar» (el mismo botón de reintento, renombrado); «Continuar» ejecuta la navegación existente a la selección. Método nuevo `ShowLevelFinished`, dos campos y `using System.Linq;`.

Anteriores de B87 que siguen en la lista: `local-persistence/src/StatisticsTelemetry.cs.txt` (un método). Nuevos de B87: ver `B87_EXPRESS_Y_JUEGO.md`.

## Por qué no interrumpe guardado ni estadísticas
* El mensaje aparece **después** de `CompleteAnimalAsync` y de `Telemetry.CompletionConfirmed`; la navegación no se ha tocado.
* El árbol sigue en pausa y el observador queda en estado `Loading` (`Open` llama a `Loading()` al abrir y `CompletionConfirmed` fija `_terminal/_blocked` y `Loading`): por lectura de código, el tiempo con el mensaje abierto no se proyecta como tiempo efectivo (solo `ActiveHuman`/`ActiveAnimal`). No medido en ejecución.
* Si la navegación falla, el reintento sigue sin volver a completar el bioma.

## Alcance y límites
* El quinto bioma (final) mantiene su flujo: va al final sin este mensaje.
* El estado del ecosistema sale de `ActiveGame.Environments`; si no está disponible, la línea se omite.
* Texto con el estilo existente (fondo oscuro, `Label`/`Button` por defecto del aviso modal); no hay pantalla nueva.

## Verificación
Compila (0 errores, 0 advertencias en la última compilación incremental). Pruebas: comprobaciones del kit 37/37, SQLite 43/43, sync HTTP 36/36. Ninguna cubre estas dos clases (están en el proyecto de Godot).

Ejecutable: `C:\TwoSidesBuild\TwoSides-win64-B88-StatsDemo\` (mismo `override.cfg` y lanzador que B87; B75, B78 y B87 intactos).
