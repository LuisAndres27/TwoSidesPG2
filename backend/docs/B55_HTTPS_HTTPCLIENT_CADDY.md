# B55 — Validación HTTPS de HttpClient con Caddy

Fecha: 2026-11-03, Guatemala. **B55 CERRADA: validación HTTPS positiva `B55_RESULT=PASS`, código 0; retirada manual de la CA y cierre de recursos verificados.** No se declara validada la conexión Atlas.

## Alcance e integridad

Referencias: `B54_MANEJO_CUOTA_SYNC.md`, `B46_F1_F2_REAL_ATLAS_VALIDATION_RESULT.md`, configuración B44 existente. No se repitió la campaña Atlas B46.

- Manifiesto actual v4: verificación antes y después `backendIntegrity:ok`, 3169 archivos, cero añadidos/eliminados/modificados/problemas. Incluye `backend/src`, `scripts`, dependencias y archivos de paquete. No acredita por sí solo procedencia frente a procesos de la misma cuenta (B00).
- Los dos archivos de producción B54 conservan sus SHA-256 documentados: `SyncOutboxService.cs.txt` = `60474909D09A1D33DCDCF1A5646C2EBCE9ABBCBD117727F51486D3A299C334C1`; `SyncOutboxDispatcher.cs.txt` = `1DF47EF3CC8770B3EDC8A45D97517DCA661AACDC31D86FD632CC7F3D544B70C1`.
- No se modificó código de producción, cuotas, F1/F2, Godot, SQLite real, ACL, C2Runtime ni credenciales. No se abrió `.env`. No hubo commits/push, F3.10 ni conexión Atlas.

## Certificados comprobados

Lectura de certificados públicos existentes, sin exportar claves privadas. Fechas en Guatemala (UTC−06:00):

| Certificado | SHA-1 de identificación del certificado (thumbprint) | Vigencia |
|---|---|---|
| CA `Two Sides LOCAL TEST CA (remove after use)` | `F2BF0E8DC06AC9C4F12F27ECD6841438A5D412A7` | 2026-11-02 00:10:39 a 2026-12-02 00:10:39 |
| Servidor `CN=localhost` | `EA1A91F7DFE59D757B60AD4970217A492ADE0B51` | 2026-11-02 00:10:39 a 2026-11-16 00:10:39 |

SAN: `localhost`, `127.0.0.1`; uso servidor TLS. CA restringida a estos nombres/direcciones. Ambos vigentes en esta preparación. La huella SHA-1 identifica el certificado; no describe el cifrado TLS ni SCRAM.

CA ausente en `CurrentUser\Root` y `LocalMachine\Root`, antes y después de la prueba negativa. No se instaló ningún certificado automáticamente.

## Configuración y arnés independiente

Archivos nuevos, exclusivamente de pruebas:

- `local-persistence/sync-b55-tests/SyncB55.Checks.csproj` y `packages.lock.json`.
- `local-persistence/sync-b55-tests/Program.cs.txt`.
- `local-persistence/sync-b55-tests/loopback-only.mjs`.

Compila las bibliotecas reales de persistencia y HTTP, con fuentes de catálogo sin motor; no ejecuta Godot ni abre partidas reales. `SyntheticSandbox` solo puede crear bases nuevas propias bajo `local-persistence/.work/databases/<GUID>` y elimina exclusivamente sus archivos al disponerlo. El modo negativo termina antes de crear SQLite. El modo positivo usa perfil/partida/instalación nuevos; credenciales sintéticas y JWT solo en RAM.

Caddy existente: `%LOCALAPPDATA%\TwoSidesLocalProxy\bin\caddy.exe`, SHA-256 `5F93A9BD555F3AAC9D33AF2756BA14B3519D8CCA4FFD55256BDAEAB444C9DB2A`, igual a B44/B46. Caddyfile existente sin cambios: `127.0.0.1:8443`, TLS 1.2/1.3, `admin off`, `auto_https off`, `skip_install_trust`, `persist_config off`; Host `localhost` obligatorio (421), fuera de `/api/*` 404, proxy a `127.0.0.1:3000`; timeout dial 3 s/headers 15 s, cuerpo máximo 2 MB. Sin acceso-log con cuerpos o tokens.

Express: únicamente `scripts/run-offline-backend.js --port 3000 --exit-on-stdin-close`, repositorios sintéticos en memoria, clave RSA desechable. No carga Mongoose ni configuración del backend principal. Se limpia el entorno del subproceso, manteniendo solo `SystemRoot`, PATH de Windows y `NODE_ENV=test`; no se heredan URI, secretos, NODE_OPTIONS o perfiles de producción. El preload de pruebas rechaza conexiones salientes fuera de loopback y resolución DNS externa/SRV antes de despacharlas. Tres comprobaciones negativas de ese bloqueo pasaron sin enviar tráfico. Es un control de la prueba, no una frontera frente a código malicioso bajo la misma cuenta.

Cliente: `SyncHttpTransport` de producción con `SocketsHttpHandler` normal, proxy/redirects deshabilitados; HTTPS obligatorio; no callback de certificados ni almacén personalizado. La aceptación HTTPS y del nombre depende del almacén de confianza de Windows. El chequeo explícito X509Chain usa confianza normal y `NoCheck` para revocación; HttpClient conserva su configuración normal. Estos certificados locales no publican CRL/AIA: no se acredita revocación, como en B46. No se usa `--insecure`, `--ssl-no-revoke` ni excepción de confianza en HttpClient.

## Preparación y prueba negativa previa

| Comprobación | Resultado |
|---|---|
| Restauración de paquetes solo desde caché local | OK, sin NuGet remoto |
| Compilación .NET 8 del arnés y bibliotecas | 0 errores, 0 advertencias |
| Integridad backend / binario Caddy / certificados / puertos libres | PASS |
| Cadena con CA no instalada | Rechazada, como corresponde |
| Express offline-test y Caddy reales en loopback | Iniciados y comprobados |
| HttpClient real antes de instalar CA | `Status=0`, `NetworkUnavailable`: rechazo TLS esperado; PASS de prueba negativa |
| Registro/sesión/lote/recibos/reenvío/errores por HTTPS confiable | Ejecutado posteriormente; resultados en la sección siguiente |
| Express cerrado por comando stdin `shutdown` | Exit 0, ordenado |
| Caddy detenido | Terminación del proceso propio: `admin off` impide parada por API; no se afirma cierre ordenado |
| Listeners finales 3000, 3001, 8443 | Ninguno |
| CA al terminar | Ausente en ambos almacenes Root |

La preparación tuvo dos intentos locales fallidos del arnés por pasar una ruta absoluta Windows directamente a `node --import`. Se corrigió únicamente el arnés a URI `file:`; el ensayo negativo final devolvió `B55_RESULT=PASS`, código 0. No fue un defecto TLS ni de producción.

## Continuación autorizada: prueba positiva confirmada

El propietario confirmó instalación manual mediante certutil y autorizó expresamente la continuación. Antes de ejecutar se comprobó la CA exacta en `CurrentUser\Root`, su ausencia en `LocalMachine\Root`, certificado localhost vigente, hashes del arnés sin cambios respecto de la preparación y manifiesto v4 válido (3169 archivos, cero diferencias). No había procesos Node/Caddy ni listeners anteriores en 3000/3001/8443. El directorio de bases sintéticas estaba vacío.

Se ejecutó exclusivamente el binario ya compilado, sin editar ni recompilar el arnés:

```powershell
& 'local-persistence/.work/bin/SyncB55.Checks/Debug/net8.0/win-x64/SyncB55.Checks.exe' --trusted
```

Resultado real: **`B55_RESULT=PASS`, código 0**, duración aproximada 7,1 segundos.

| Comprobación real | Resultado |
|---|---|
| Cadena normal de Windows | PASS; termina en la CA de huella autorizada |
| HTTPS HttpClient a `https://localhost:8443/api/health` | HTTP 200; validación normal del certificado y nombre localhost |
| Registro técnico y sesión JWT sintéticos | PASS; sesión autenticada comprobada por `technical/me` |
| Lote desde SQLite sintética | Una operación confirmada y recibo guardado en Outbox |
| Reenvío idéntico | HTTP 200, `duplicate`, mismo receiptId |
| Consulta de recibos | HTTP 200, `found`, mismo receiptId |
| Token inválido | HTTP 401 |
| Lote mal formado | HTTP 400 |
| Ruta API inexistente | HTTP 404 |
| Recibo local después de errores/reenvío | Intacto |
| Express offline-test | Cierre ordenado mediante stdin, exit 0 |
| Caddy | Proceso propio terminado; `admin off`, sin afirmar apagado ordenado |
| Procesos Node/Caddy al terminar | 0 |
| Listeners 3000/3001/8443 al terminar | 0 |
| Entradas sintéticas restantes en `.work/databases` | 0; base y directorio desechables eliminados por el sandbox |
| Conexiones al puerto remoto 27017 al comprobar el cierre | 0 |
| Manifiesto v4 posterior | OK, 3169 archivos, cero diferencias |
| Fuentes de producción B54 | Ambos hashes idénticos a los registrados arriba |

Ausencia de Atlas: composición offline-test fija, repositorios en memoria, entorno del proceso sin credenciales reales y bloqueo de sockets/DNS no loopback. No se ejecutó Mongoose, backend principal ni una operación remota. La observación final del puerto 27017 es evidencia complementaria, no una captura de tráfico de toda la ejecución.

El propietario confirmó la retirada manual de la CA al terminar la prueba. La comprobación posterior encontró **0 coincidencias** de la huella `F2BF0E8DC06AC9C4F12F27ECD6841438A5D412A7` tanto en `CurrentUser\Root` como en `LocalMachine\Root`. Se verificaron nuevamente **0 procesos Node/Caddy, 0 listeners en 3000/3001/8443 y 0 entradas sintéticas restantes** en `.work/databases`. **B55 queda cerrada.** No se modificaron certificados desde el agente.

## Procedimiento aplicado de intervención del propietario

La fase 2 exige intervención y autorización expresa del propietario. **El agente no ejecutará instalación ni retirada de CA.** Si el propietario decide continuar, puede instalar manualmente esta CA pública verificada en su propio almacén:

```powershell
certutil -user -addstore Root "$env:LOCALAPPDATA\TwoSidesLocalProxy\tls\ca.crt"
```

Después de que confirme su instalación, comprobar nuevamente huella/vigencia/almacén y puertos, y ejecutar exclusivamente:

```powershell
& 'local-persistence/.work/bin/SyncB55.Checks/Debug/net8.0/win-x64/SyncB55.Checks.exe' --trusted
```

Ese modo vuelve a verificar certificados/binario, exige cadena confiable antes de iniciar servicios, comprueba HTTPS con hostname `localhost`, registro/sesión sintéticos, un lote de una operación desde SQLite desechable, recibo guardado, reenvío `duplicate` con mismo receiptId, consulta `found`, errores 401/400/404 y recibo local intacto. Finalmente dispone SQLite, detiene sus procesos y verifica puertos. Presupuesto de prueba 90 s; timeout de solicitud 15 s. No prueba la cuota ni cambia su valor.

Tras el ensayo, solicitar al propietario retirada manual inmediata, incluso si falla:

```powershell
certutil -user -delstore Root F2BF0E8DC06AC9C4F12F27ECD6841438A5D412A7
```

La ausencia en ambos almacenes Root, los puertos libres, la ausencia de procesos propios y la limpieza de SQLite sintética quedaron confirmadas después de la retirada manual. El procedimiento está finalizado; no se requiere otra ejecución.

## Riesgos y condiciones para una prueba futura con Atlas

B00 continúa pendiente: no se certifica aislamiento frente a procesos de la misma cuenta Windows. La confianza temporal se retiró y su ausencia quedó verificada. Certificados vigentes solo hasta las fechas anteriores; revalidar antes de otra ejecución. Prueba loopback: no acredita exposición pública, proxy remoto, revocación, persistencia MongoDB, recuperación tras caída de Atlas ni cuota de conteo MongoDB. La ausencia de conexiones Atlas se apoya en composición offline, entorno limpio, ausencia de credenciales y bloqueo de conexiones/DNS del subproceso; no es una captura de paquetes del equipo entero.

Atlas requerirá autorización independiente, cierre de B55 con resultados reales, control de integridad actualizado, identidad y credenciales específicas autorizadas, límites y limpieza remotos aprobados. Esta fase no autoriza la prueba final, F3.10, C.2 ni F.2.
