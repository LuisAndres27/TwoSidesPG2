# B87 — Alcance de las pruebas de seguridad (Metabase «Datos de prueba del propietario»)

Documento para los **evaluadores**. Rellena los campos entre `[corchetes]` antes de compartirlo. Cada parte debe confirmarlo por escrito (correo) antes de empezar. No contiene secretos: las credenciales se entregan por otro canal.

## 1. Partes y contactos
| Rol | Nombre | Contacto |
|---|---|---|
| Propietario del proyecto | [nombre] | [correo / teléfono] |
| Titular de la cuenta AWS | [nombre de la compañera] | [correo] |
| Evaluador(es) | [nombres] | [correos] |
| Canal privado para hallazgos | [correo cifrado / canal acordado] | — |

## 2. Qué es y qué contiene
- Una instancia de **Metabase (edición abierta)** que muestra **estadísticas agregadas** (contadores) de un videojuego, generadas por el propietario con un ejecutable y un perfil de prueba. **No hay jugadores externos ni datos personales.**
- Versión desplegada: `[versión y digest, ej. v0.65.3.4 / sha256:e8f38a6d…]`. Se conoce que esta edición **no tiene 2FA** y usa una base de datos H2 local para su catálogo; no es necesario reportarlo.
- Fuente de datos: una base **analítica** de MongoDB Atlas con **un solo** conjunto de agregados, accedida con una cuenta de **solo lectura**.

## 3. Dentro del alcance
| Elemento | Detalle |
|---|---|
| URL | `https://[NOMBRE]` (puerto 443) — la **única** dirección en alcance |
| Cuenta proporcionada | Evaluador, **sin permisos de administrador** (credenciales aparte) |
| Pruebas permitidas | Pruebas web de la aplicación Metabase **con y sin autenticación**: control de acceso y escalada de privilegios (evaluador → administrador), gestión de sesiones y cookies, inyección (SQL/NoSQL/plantillas) a través de la interfaz y de la API, XSS/CSRF/SSRF, divulgación de información (versión, metadatos, secretos), configuración TLS y cabeceras, enumeración de usuarios, política de contraseñas |
| Herramientas | Escáneres web y proxies de interceptación, **a ritmo moderado** (máx. [10] peticiones/segundo) |
| Ventana | Del `[fecha y hora UTC]` al `[fecha y hora UTC]`. Fuera de ella el acceso estará cerrado |
| Orígenes | Desde las IP `[IP de los evaluadores]` (si no se facilitan, desde cualquier origen) |

## 4. Fuera del alcance (prohibido)
- La cuenta y la consola de **AWS**, otros servicios o recursos de AWS, otras cuentas, el sistema operativo y la red del servidor, Caddy como servicio de red distinto de la URL en alcance, y cualquier intento de acceder a la instancia por otro medio que no sea la URL anterior.
- **MongoDB Atlas** y cualquier otro sistema conectado (el ordenador del propietario, el backend local, otras máquinas de las partes). Si encuentras la forma de **dirigir Metabase hacia otro destino** o de extraer credenciales de conexión, **detente y repórtalo**: no las uses.
- Ingeniería social, phishing, acceso físico, ataques a las personas.
- **Denegación de servicio**, pruebas de carga o de estrés, inundación de peticiones, fuerza bruta masiva (máx. [5] intentos de contraseña por minuto), cualquier cosa que degrade el servicio.
- Modificar, borrar o dañar datos o configuración, crear persistencia, usar exploits que puedan dejar el servicio caído o comprometer a terceros, usar la instancia para atacar a otros.
- Conservar o difundir datos obtenidos más allá de lo necesario para el informe.

## 5. Reglas de actuación
1. **Detente y avisa de inmediato** (contacto de la §1) si: obtienes ejecución de código, acceso de administrador, lectura de archivos, credenciales o cualquier dato que no sean los contadores del panel; o si el servicio se degrada.
2. No encadenes un hallazgo para ir más allá de demostrar su existencia. Basta una prueba mínima.
3. **Hallazgos:** por el canal privado, con pasos para reproducirlos, fecha/hora UTC y la IP de origen. No los publiques hasta que el propietario lo autorice.
4. El propietario puede **cerrar el acceso en cualquier momento** y sin previo aviso (se avisa después).
5. Cumple la política de pruebas de seguridad de AWS vigente (<https://aws.amazon.com/security/penetration-testing/>; verifícala). El propietario y la titular de la cuenta autorizan solo lo descrito aquí.
6. Esta autorización cubre únicamente el sistema y la ventana indicados y no sustituye a ninguna otra.

## 6. Lo que hace el propietario durante la ventana
- Vigila los registros de acceso (Caddy y Metabase) y el presupuesto de AWS.
- Si hay actividad fuera de este alcance, **cierra el acceso** (borrando las reglas de entrada del grupo de seguridad y la entrada de red de Atlas) y lo comunica.
- Al terminar: cierra el acceso, rota las credenciales de la cuenta de evaluador, recoge el informe y borra la infraestructura (ver la guía, §13).

## 7. Aceptación
| Parte | Nombre | Fecha | Aceptado por correo |
|---|---|---|---|
| Propietario | | | ☐ |
| Titular de la cuenta AWS | | | ☐ |
| Evaluador(es) | | | ☐ |
