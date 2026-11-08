# Two Sides

Juego 2D hecho con **Godot 4.6 (C# / .NET)** sobre la relación entre las decisiones del jugador y el estado de un ecosistema. El jugador recorre varios biomas, toma decisiones y ve cómo cambia el estado del entorno según sus elecciones. El proyecto incluye además una capa opcional de **estadísticas anónimas** con un panel de análisis.

## Cómo ejecutar el juego

1. Instala [Godot 4.6.x con soporte .NET (mono)](https://godotengine.org/download) y el SDK de .NET compatible.
2. Abre `project.godot` con Godot.
3. Pulsa *Ejecutar proyecto* (F5). La escena principal es el menú.

El progreso se guarda en local, en una base SQLite de la cuenta de Windows que ejecuta el juego.

## Arquitectura

```
Juego (Godot/C#)  →  SQLite (local)  →  Express (local)  →  MongoDB Atlas  →  Metabase
```

| Pieza | Función |
|---|---|
| **Juego** | Niveles, decisiones y finales. Escribe el progreso y los eventos en SQLite. |
| **SQLite** | Guardado local del jugador; el juego funciona sin red. |
| **Express** (`backend/`) | Recibe lotes de eventos de estadísticas (contrato `statistics-only-v1`), los valida y los escribe en Atlas con una identidad de solo ingesta. |
| **MongoDB Atlas** | Almacena los contadores y los datos analíticos agregados. |
| **Metabase** | Panel de solo lectura sobre los datos agregados. |

Las estadísticas están **desactivadas por defecto**: solo se activan en una compilación de demostración, con una cuenta dedicada y un kit de credenciales de corta duración. Los detalles, los avisos de seguridad y la guía de despliegue están en `backend/docs/` (empieza por `B87_EXPRESS_Y_JUEGO.md` y `B87_GUIA_AWS_METABASE.md`).

## Estructura

- `scripts/`, `scenes/`, `assets/` — juego (Godot).
- `local-persistence/`, `integration/` — persistencia SQLite y sus comprobaciones.
- `backend/` — Express, herramientas de estadísticas, pruebas y documentación.

## Créditos

Agradecimiento a Nayelhi Flores por su apoyo en una versión inicial.
