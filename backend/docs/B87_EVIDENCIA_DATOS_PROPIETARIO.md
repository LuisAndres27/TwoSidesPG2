# B87 — Evidencia de extremo a extremo con datos del propietario

Fecha: 6-nov-2026. Fuente: **informe del propietario** (verificación hecha por él). Esta sesión de Claude Code no ejecutó ni observó la partida, Express, `publish`, Atlas ni Metabase con esos datos; lo que sigue es lo que el propietario comunicó, no una comprobación propia. Las bases se recrearon antes de jugar, por lo que no había datos sintéticos en Atlas.

## 1. Verificado de extremo a extremo con datos del propietario

Cadena: ejecutable `TwoSides-win64-B87-StatsDemo` → cuenta de Windows `TwoSidesDemo` → Express local (ingest) → Atlas `twosides_statistics_demo` → `publish` → `twosides_statistics_analytics_demo` → Metabase local 0.65.3.4 (`127.0.0.1:4387`).

| Eslabón | Resultado comunicado |
|---|---|
| Juego | Se jugaron Océano y Selva desde `TwoSidesDemo`. |
| Express → Atlas | 17 envíos aceptados (`http_200`). |
| `publish` | 3 documentos copiados a la base analítica. |
| Metabase (panel) | 1 instalación · 1 partida iniciada · 0 completadas · 1 sesión · 4,6 min de tiempo efectivo (Océano 1,68 + Selva 2,92) · 23 eventos únicos. |
| Decisiones | Coinciden con lo jugado. |

Coherencia interna: 1,68 + 2,92 = 4,60 min. Las 0 partidas completadas son coherentes con haber jugado solo dos biomas.

No consta (no se comunicó) la comparación numérica del panel contra los 3 documentos de `stats_v1_counters`; los 17 envíos y los 23 eventos únicos no se concilian aquí (un envío puede llevar hasta 5 eventos y los reintentos se cuentan como duplicados).

## 2. Sigue siendo de demostración

* Bases `*_demo` (`twosides_statistics_demo`, `twosides_statistics_analytics_demo`) y política de retención experimental (`b82-run-hybrid-v1`).
* Clave HMAC **pública** (B84): los identificadores hasheados no están protegidos frente a quien conozca esa clave.
* `publish` es **manual**: el panel no se actualiza solo.
* Express solo en `127.0.0.1`, lanzado a mano por el propietario, con un token de 1 h entregado por carpeta (`C:\TwoSidesStatsKit\hand-over`).
* Metabase local sin HTTPS, con H2 y sin 2FA; títulos de B85 renombrados a «Datos de prueba del propietario».
* `seed` y `read` comparan con el oráculo **sintético** y no sirven para validar estos datos (ver `B87_EXPRESS_Y_JUEGO.md`, §8).
* El ejecutable de prueba es un build aparte (`override.cfg` + argumentos + cuenta dedicada); la distribución normal no envía nada.

## 3. Falta

* **AWS:** Metabase accesible a evaluadores (guía `B87_GUIA_AWS_METABASE.md` escrita, **nada ejecutado** en AWS), incluidos IP elástica `/32` en Atlas y cuenta/usuario IAM limitado.
* **HTTPS:** certificado y proxy (Caddy) solo probados en local con la imagen desechable; sin dominio ni emisión real.
* **Producción:** base `twosides_statistics` de producción, clave HMAC secreta, retención definitiva, automatización de `publish`, Express/servicio persistente fuera de la máquina del propietario, autoridad de credenciales del juego.
* **B00:** no ejecutado.
* **Manifiesto v5:** no revisado ni modificado. Archivos existentes cambiados en B86/B87 pendientes de listar en esa revisión: ver `B87_EXPRESS_Y_JUEGO.md` §2 (`StatisticsTelemetry.cs.txt`, un método) y la lista de B86.
* Confirmación de que 0.65.3.4 corrige CVE-2026-72898 y GHSA-v44v-x8x4-mvcw (no confirmada; ver guía §4).
