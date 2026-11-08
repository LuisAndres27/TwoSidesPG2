# C.2 — Respaldo local del manifiesto

**Resultado: respaldo local creado y verificado. C.2 no se desbloquea. B00 continúa pendiente.**

## Ubicación y fecha real

Carpeta solicitada: C:\TwoSides_Backup_Integridad\C2

Subcarpeta nueva, sin sobrescribir respaldos:

```text
C:\TwoSides_Backup_Integridad\C2\backup-20261029T184436770Z-73cbf57600424137b1ad02e167b08e6e
```

- Fecha local: 2026-10-29T12:44:36.7703781-06:00.
- Fecha UTC: 2026-10-29T18:44:36.7703781Z.
- Zona Windows: Central America Standard Time (UTC−06:00).

## Archivos copiados y hashes completos

| Archivo | Bytes | SHA-256 | Comparación |
|---|---:|---|---|
| manifest.json | 302767 | 8DCCBF599E7C93B94386668F752DA4F1CFD58F35D9DCA39BDCED5A418D3FB0AE | Coincidencia byte por byte y SHA-256 |
| c2-verify-reference.ps1 | 3103 | AF0318F2EF3076E39E71B0B240545420E9B8FC9D1EB0B187507EB96DE28E9BCD | Coincidencia byte por byte y SHA-256 |

Origen del manifiesto:

```text
C:\Users\luis2\AppData\Local\TwoSides\C2Runtime\c2-67d95728399e4e30a406eba7301979fd\manifest.json
```

Origen del verificador:

```text
C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\backend\scripts\c2-verify-reference.ps1
```

También se crearon, sin secretos:

- SHA256SUMS.txt: ambos SHA-256 completos junto a sus nombres.
- BACKUP_INFO.json: fecha, zona, rutas de origen/destino, tamaños, hashes, resultados de comparación y limitaciones del respaldo local.

El manifiesto coincide con el hash histórico registrado en la preparación de C2Runtime. El hash del verificador identifica los bytes observados y respaldados; no acredita su procedencia original.

## Comprobaciones realizadas

Se comprobaron atributos y tipo de los dos archivos fuente y la cadena de directorios existente del destino; no se detectaron enlaces/reparse points inesperados. Las carpetas que faltaban se crearon y se volvieron a comprobar. Se utilizó una subcarpeta de fecha/identificador único y CreateNew para cada archivo, sin sobrescrituras.

Los archivos fuente se mantuvieron abiertos solo para lectura y sin compartir escritura/borrado durante la copia. Se compararon tamaños, SHA-256 y todos los bytes de cada copia con el original. Se recalcularon los hashes fuente después de copiar y los del respaldo al terminar: **ambos archivos coinciden exactamente**.

No se ejecutó c2-verify-reference.ps1 ni ninguna prueba. No se escribió en C2Runtime ni se modificaron los contenidos fuente. No se consultaron/cambiaron ACL o propietarios; los archivos nuevos recibieron los permisos predeterminados de su destino al crearse. La revisión de rutas no equivale a una auditoría de permisos ni a una garantía absoluta contra sustitución posterior.

## Limitaciones de seguridad

**Este respaldo local NO es una referencia independiente fuera del equipo y NO desbloquea automáticamente C.2.**

Está separado de OneDrive y de la copia de ejecución por su ruta, pero sigue bajo el mismo Windows, almacenamiento y posibles identidades de acceso. Un proceso con permisos suficientes, compromiso del equipo, error de usuario o pérdida del disco puede afectar simultáneamente al runtime y al respaldo. No se certificó inmutabilidad ni protección de la carpeta contra otros procesos.

Los hashes permiten comparar con esta instantánea; generar una referencia nueva no demuestra la procedencia original del código. Conservar manifiesto y digest juntos en el mismo equipo tampoco crea independencia de confianza. Si posteriormente hay otro dispositivo o medio bajo control del usuario, podrá conservar allí estos archivos/digest sin que este respaldo local pretenda sustituirlo.

**B00 permanece pendiente.** No se modificaron ni remediaron las ACE investigadas y no se interpretó la elección de un respaldo local como aceptación de exposición de credenciales.

## Alcance y detención

No se copiaron contraseñas, .env, SQLite ni claves privadas. No se abrió backend/.env, se iniciaron servidores, se crearon receptores de credenciales ni se conectó Atlas. No se ejecutaron C.2, F.2 o B05.5, ni git add/commit/push.

Únicas escrituras: carpetas y cuatro archivos del respaldo nuevo, más este informe. Los respaldos anteriores y C2Runtime permanecen sin escrituras. Detenerse después de este resultado.
