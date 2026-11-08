# B58 — Godot real con HTTPS, SQLite sintética y Express offline-test

Fecha: 2026-11-03, Guatemala. **B58 CERRADA DEFINITIVAMENTE: campaña real Godot/HTTPS PASS, código 0; retirada manual de la CA, cierre de procesos y limpieza sintética verificados.** Sin Atlas.

## Preparación comprobada

- B57 revisado: nueva bandera `--two-sides-sync-local-test-https` exige `--two-sides-test-storage=sandbox`; origen fijo `https://localhost:8443/`. La política rechaza la combinación incompleta antes del adaptador normal.
- `GameTestStorage` crea una base propia nueva y solo acepta el token `owned-outbox-fixture`. Credenciales técnicas en memoria; sin importar perfiles/partidas u operaciones históricas. El directorio `.work/databases` está vacío antes de esta campaña.
- Manifiesto backend v4 verificado: **3169 archivos, cero diferencias**. No se cambió el manifiesto ni código del producto, escenas o configuración Godot.
- SHA-256 B57 intactos: `SyncWorkerLifecycle.cs.txt` = `048F215EF20AE6389634FCCF9119C22BDBDFFD316814C55D44ED2062F2CFB505`; `GameSyncHost.cs` = `5E27E323A77BDE56E1C81EF78D734D8C4D96E5841A669FD843159FCCD517A4E2`.
- Biblioteca `TwoSides.SyncHttp.dll` de Godot idéntica a la compilada en B57: `3AB89CCDC87AD4AB5FAD5B078257C80336C8FD4BE937D141CD77377F674F36F1`.
- Cero procesos Node/Caddy/Godot previos; cero listeners 3000/3001/8443.
- CA ausente inicialmente en `CurrentUser\Root` y `LocalMachine\Root`. No se instalará ni retirará automáticamente.

## Certificados y configuración

| Objeto | Huella / hash | Vigencia Guatemala |
|---|---|---|
| CA temporal | `F2BF0E8DC06AC9C4F12F27ECD6841438A5D412A7` (thumbprint) | 2026-11-02 00:10:39 a 2026-12-02 00:10:39 |
| Servidor localhost | `EA1A91F7DFE59D757B60AD4970217A492ADE0B51` (thumbprint) | 2026-11-02 00:10:39 a 2026-11-16 00:10:39 |
| Caddy binario B46/B55 | SHA-256 `5F93A9BD555F3AAC9D33AF2756BA14B3519D8CCA4FFD55256BDAEAB444C9DB2A` | No se modificó |
| Caddyfile existente | SHA-256 `A7BAA861020DB335342F014F22CBB07F5F7A197E591AB9658AD22B80B2801655` | No se modificó |

Caddy loopback 8443, Host localhost obligatorio, TLS 1.2/1.3 con validación normal en el cliente, proxy loopback 3000; `admin off`, sin auto instalación de confianza. Certificados sin CRL/AIA: no se acreditará revocación mediante esta campaña (limitación B55).

## Procedimiento preparado

Directorio exclusivo de evidencias y entorno temporal:

```text
local-persistence/.work/b58-20261103T234759Z-c3195824dca64fea9bb58a5596915197/
```

Se creó ahí un **orquestador temporal de campaña**, `run-b58.py`, sin editar código del producto. Su sintaxis se comprobó antes de la instalación manual; posteriormente se ejecutó con la autorización explícita del propietario. `source-integrity-before.json` registra hashes de ocho fuentes/configuraciones del producto; no incluye secretos ni bases reales.

Una vez confirmada manualmente la CA: Express `scripts/run-offline-backend.js` con repositorios en memoria y RSA desechable; entorno limpio y preload de B55 que bloquea sockets/DNS no loopback. Caddy existente. Godot 4.6.1 Mono con las dos banderas B57, audio Dummy y APPDATA/LOCALAPPDATA/TEMP dirigidos exclusivamente al directorio de campaña. Sin modificar `project.godot`.

Plan de observación: Godot en menú con perfil sintético nuevo, verificar filas confirmadas/recibos; interrumpir Caddy unos 45 s manteniendo Express vivo; observar pendientes y reintentos; restablecer el proxy y comprobar mismos IDs/hashes y recibos previos intactos. Ventana de recuperación acotada. Muestreo TCP IPv4/IPv6 por PID y descendientes; detener ante conexión o listener no loopback. La observación es muestreada, no captura exhaustiva de paquetes ni una frontera frente a código malicioso.

SQLite se inspeccionará solo en la única carpeta recién creada del sandbox, en modo lectura. El orquestador no acepta una ruta de guardado; no consulta SQLite real, B52 ni `.env`. No exporta tokens/credenciales. Los snapshots de evidencia contienen únicamente estados, IDs sintéticos, hashes de contenido y receiptId.

Cierre previsto: WM_CLOSE a Godot (flujo normal de `QuitAsync`), stdin `shutdown` a Express y terminación de los procesos Caddy propios (`admin off`; no afirmar apagado ordenado de Caddy). El propio sandbox elimina sus datos. Si quedan elementos inesperados, no se borran automáticamente: se informa. Después solicitar retirada manual de CA y comprobar su ausencia.

## Intervención manual del propietario

Conforme a la fase 2 autorizada, el propietario debe instalar manualmente:

```powershell
certutil -user -addstore Root "$env:LOCALAPPDATA\TwoSidesLocalProxy\tls\ca.crt"
```

El propietario confirmó instalación en `CurrentUser\Root` y autorizó exclusivamente B58. Se comprobó nuevamente la huella, vigencia y ausencia de procesos/listeners/sandbox anteriores; después se inició la campaña. No se cambió confianza desde el agente. Al terminar se solicitó retirada manual:

```powershell
certutil -user -delstore Root F2BF0E8DC06AC9C4F12F27ECD6841438A5D412A7
```

## Resultados reales de la campaña

Orquestación ejecutada una vez con código 0. Godot mostró `v4.6.1.stable.mono.official.14d19694e`. Se arrancó el juego real con las banderas B57, audio Dummy y sin cambiar `project.godot`. El proceso envoltorio fue PID 24708 y la ventana del motor PID 30772. Express offline-test PID 7668; primer Caddy PID 33672. Solo se cerraron procesos propios.

| Etapa | Resultado confirmado |
|---|---|
| Arranque Godot | Correcto; perfil sintético disponible, un único worker (`workers=1/0` durante la campaña) |
| Origen seleccionado | Aviso esperado `Local test synchronization enabled: https://localhost:8443/` |
| Autenticación técnica | Sync v2 registró/inició sesión según el recorrido del cliente; las confirmaciones de operaciones protegidas y recibos acreditan funcionamiento autenticado. No se registraron tokens ni la contraseña sintética; no se capturaron por separado los estados HTTP de registro/sesión |
| Primer snapshot, aproximadamente a los 35 s | 1 operación confirmada con recibo y 1 pendiente |
| Interrupción de Caddy, aproximadamente 45 s | Express y Godot permanecieron vivos; cliente informó `SYNC_TIMEOUT` y conservó 2 operaciones en `retryable_failure`, 0 fallos permanentes; el recibo previo permaneció |
| Recuperación de Caddy | Reintento natural, sin resetear estado/IDs; primero seguían pendientes/reintentables, luego `SYNC_OK` |
| Snapshot final | **4 operaciones confirmadas, 4 recibos válidos**, sin pendientes/reintentables en ese instante |
| Conservación ante fallo | Las 2 operaciones afectadas acabaron confirmadas con los mismos `operationId` y `payloadHash`; el receiptId de la primera operación confirmada no cambió |
| Intentos finales | Por operación: 3, 1, 1 y 2; evidencia de reintento real, no de renumeración |
| Datos del sandbox | 1 perfil nuevo y 0 partidas; ensayo en menú, sin cargar una partida real ni jugar biomas |
| Cierre Godot | Mensaje WM_CLOSE a la ventana real → flujo normal `QuitAsync`, `OUTBOX_DRAINED`, **exit 0** |
| Cierre Express | Comando stdin `shutdown`, **exit 0** |
| Cierre Caddy | Terminación de los procesos propios; admin desactivado, no se afirma cierre ordenado |

El HTTPS aceptado ocurrió con el certificado vigente de localhost y la CA instalada manualmente; biblioteca cliente con hash B57, validación normal, sin bypass/callback de certificados. Una advertencia esperada al habilitar el modo de prueba; no se encontraron líneas `ERROR` o excepciones en el log Godot revisado.

### Operaciones, recibos y límites de la evidencia

Snapshots de solo lectura: `snapshot-healthy.json`, `snapshot-outage.json`, `snapshot-recovered.json`; resultado agregado `result.json`. Cada recibo final corresponde a su operationId, y el recibo previo se conserva. No se provocó una respuesta perdida después de commit ni un reenvío duplicado deliberado: eso estaba validado en B55/B57 y no se atribuye a esta campaña. Aquí se comprobaron reintentos por interrupción de red y confirmación posterior.

`OUTBOX_DRAINED` es vaciado del pump local al cerrar, **no prueba que los hechos terminales creados durante el cierre hayan llegado al servidor**: el worker se detiene antes del cierre de telemetría. Las cuatro confirmaciones corresponden al snapshot previo a cerrar. El sandbox es desechable y se elimina al terminar; no ofrece recuperación de una sesión de prueba posterior. No se ejecutó una prueba de decisiones/progreso, porque no se creó ninguna partida.

### Aislamiento y ausencia de Atlas

Base única creada por la campaña:

```text
local-persistence/.work/databases/ea8b8a8ba289460ab3c9ff439d59c617/07b311711de9463b9aed5ffc4f64a04a.sqlite3
```

Solo esa base se abrió para observar estados, con `mode=ro`. Se comprobó ubicación dentro de la raíz sintética y ausencia de reparse points. APPDATA y LOCALAPPDATA del proceso quedaron bajo el directorio exclusivo B58; no se usó el perfil de usuario real para los datos de Godot. No hubo credenciales DPAPI reales ni importación de las 2151 operaciones históricas.

**145 muestras TCP IPv4/IPv6** de procesos propios y descendientes: 0 conexiones externas, 0 destinos puerto 27017, ningún listener no loopback. Endpoints de aplicación observados: `127.0.0.1:3000`, `127.0.0.1:8443` y el intento de loopback IPv6 `::1:8443`; los demás puertos observados son extremos efímeros de conexiones locales. `0.0.0.0:0` representa extremo remoto sin conexión de una fila de escucha, no un destino externo.

Esto es observación **muestreada**, no captura exhaustiva de paquetes. La evidencia adicional es el perfil fijo offline-test, repositorios en memoria, entorno sin configuración/credenciales Atlas y preload que bloquea sockets/DNS externos de Node. No se conecta MongoDB, no se importa su driver en el lanzador offline y no se inició `main`.

### Cierre e integridad posterior

- Cero procesos Node/Caddy/Godot y cero listeners 3000/3001/8443 tras la campaña.
- Cero entradas restantes en `.work/databases`: la disposición normal de `GameTestStorage` eliminó la base y su carpeta propias. No se eliminó ninguna base ajena.
- Cero conexiones al puerto 27017 al comprobar el cierre.
- Manifiesto v4 posterior **OK, 3169 archivos, cero diferencias**.
- Los ocho hashes de `source-integrity-before.json` coinciden: `project.godot`, `TwoSides.csproj`, `SyncWorkerLifecycle.cs.txt`, `GameSyncHost.cs`, `GamePersistenceContext.cs`, `GameTestStorage.cs`, `SyncOutboxService.cs.txt`, `SyncOutboxDispatcher.cs.txt`. Comparación guardada en `source-integrity-after.json`.
- Durante la campaña no se abrieron ni hashearon SQLite reales o B52. Para el cierre definitivo, el propietario autorizó expresamente comprobar la integridad de la SQLite real: se leyó únicamente como archivo para calcular SHA-256 y metadatos, sin abrir una conexión SQLite ni consultar datos. `local-persistence/.work/runtime-game/save.sqlite3`: **5 697 536 bytes**, fecha de modificación `2026-10-31T07:05:07.5911246-06:00`, SHA-256 **`9FE793A26068A63C14FC76977FD4661E8C0BB55AC2E6DF69E6E76C45A8D0070C`**. Coincide exactamente con la referencia de B52 §integridad (tamaño, hash completo y fecha registrada a segundos). Archivo normal, sin reparse point. No se leyó ni modificó la copia B52.
- Después de la solicitud, el propietario confirmó retirada manual mediante certutil. La comprobación definitiva encontró **0 coincidencias** de la huella `F2BF0E8DC06AC9C4F12F27ECD6841438A5D412A7` en **CurrentUser\Root y LocalMachine\Root**. No se modificó confianza desde el agente.
- Se repitieron los controles de cierre: **0 procesos Node/Caddy/Godot/TwoSides, 0 listeners en 3000/3001/8443 y 0 entradas en `.work/databases`**. El manifiesto v4 volvió a dar **OK, 3169 archivos, cero diferencias**. No se reinició ningún servicio. **B58 queda cerrada definitivamente.**

## Riesgos pendientes

B00 permanece pendiente; esta prueba no certifica protección frente a procesos de la misma cuenta Windows, rendimiento Atlas, cuota Mongo, mecánicas/decisiones de los biomas ni persistencia remota duradera (Express offline-test guarda en memoria y pierde sus datos al cerrar). El orden de cierre de telemetría/worker limita las garantías sobre hechos terminales, según lo indicado arriba. La CA ya fue retirada manualmente y su ausencia quedó verificada. No se ejecutaron F3.10, C.2, F.2 ni una campaña real Atlas; no se comienza otra etapa.
