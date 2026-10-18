# Lista de despliegue

Todo lo que hay que revisar antes de subir Bajoneá al servidor final y que no es código de una funcionalidad. Se armó en el bloque A5 del tramo E3 (2026-10-14) consolidando los pendientes que estaban dispersos en `CLAUDE.md` (§9), `docs/APRENDIZAJES-TECNICOS.md` ("Lista de despliegue") y los informes de cada bloque. Cada ítem dice **qué revisar**, **por qué** y **dónde está el detalle**. Los ítems están ordenados por riesgo, no por fecha.

## 1. Zona horaria del servidor (todavía sin definir)

- **Qué revisar:** la zona horaria de la JVM, la de la base de datos y la de la aplicación tienen que ser la misma.
- **Recomendación:** arrancar el backend con `-Duser.timezone=America/Argentina/Ushuaia` (o con la variable `TZ` equivalente en el contenedor), junto con `app.zona-horaria=America/Argentina/Ushuaia` (es el valor por defecto en el código, no hace falta definirla salvo que se quiera otra zona), y revisar la zona de la base (`SELECT @@global.time_zone, @@session.time_zone, NOW();`).
- **Por qué:** desde el bloque A2b de E3 el reloj de la aplicación (`ClockConfig`) usa `America/Argentina/Ushuaia`, pero quedan unos 100 `LocalDateTime.now()` que usan la zona de la JVM (altas y modificaciones, sesiones, tokens, `historial_estado_comercio`, notificaciones, notas de crédito, pagos). Con la JVM en UTC (lo normal en un contenedor Linux) las dos zonas difieren en tres horas y las comparaciones entre fechas de uno y otro grupo dan resultados incorrectos entre las 21:00 y las 24:00. Hoy anda solo porque la máquina de desarrollo está en UTC-3.
- **Pruebas:** desde el bloque A5, `mvnw test` fija `-Duser.timezone=America/Argentina/Ushuaia` en el surefire (`pom.xml`) y los tests de Playwright, Newman y los estreses calculan "hoy" y "hace N minutos" en esa zona (variable `E2E_ZONA_HORARIA` para cambiarla), así que ya no dependen de la zona de la máquina.
- **Detalle:** `docs/DECISIONES.md` (E3, bloque A2b) y la "Lista de pulido" de `CLAUDE.md` §9, punto 5.
- **El frontend tiene la zona escrita una vez:** `ZONA_COMERCIO` en `frontend/js/fechas.js` (`America/Argentina/Ushuaia`). Se usa para decidir qué día es "hoy" y "ayer" al mostrar horas de pedidos y de la actividad (las fechas del servidor llegan sin zona, en hora del comercio). Si se cambia `app.zona-horaria`, hay que cambiar también esa constante: no se lee del servidor.

## 2. Perfil de Spring y atajos de test

- **Qué revisar:** el servidor **nunca** puede arrancar con el perfil `test` (`SPRING_PROFILES_ACTIVE` tiene que ser `production`, sin `test`). Con ese perfil `/api/v1/test/**` sería público y devolvería códigos de verificación y recuperación de cualquier cuenta, vincularía cuentas de Mercado Pago simuladas y dispararía los procesos de pedidos.
- **Qué hay:** dos protecciones independientes. `TestController` y `TestSupportService` llevan `@Profile("test")` (sin el perfil no existe la ruta: `404` con sesión) y, desde el bloque A5, el matcher público de `/api/v1/test/**` en `SecurityConfig` solo se registra con el perfil `test` activo (sin él, anónimo da `401`). Lo comprueban `AtajosDeTestFueraDelPerfilTest` (por reflexión sobre los 14 atajos) y `AtajosDeTestEnElPerfilTestTest`.
- **Además:** `MERCADOPAGO_API_BASE_URL` **no debe estar definida** en el servidor final (es solo para pruebas; apunta la API de Mercado Pago a un servidor local). Revisarla en el panel del servidor y en cualquier `.env` o script de arranque. Sin la variable el código usa `https://api.mercadopago.com`. El cliente de reembolsos y el de OAuth tienen la URL fija.

## 3. Contraseñas y credenciales del repositorio (repositorio privado)

- **`postman/Bajonea-Local.postman_environment.json` está versionado con 44 variables `*_password` con valor** (10 de tipo `secret` y 34 `default`), incluida `admin_password`. Son contraseñas de cuentas descartables de `bajonea_test` que cada corrida crea, salvo la del administrador de test. Mientras el repositorio sea privado se acepta; **antes de que deje de serlo** hay que vaciarlas o pasarlas a variables de entorno.
- **La contraseña del administrador de producción tiene que ser distinta** de la de `admin@bajonea.ar` en `bajonea_test`, y de cualquier contraseña que haya figurado alguna vez en el repositorio (el valor de test sigue en el historial de git y en el environment de Postman).
- **Desde el bloque A5 la contraseña del administrador de test se define solo con la variable de entorno `ADMIN_PASSWORD`** (la leen `helpers/backend.ts`, `preparar-entorno-test.sh`/`entorno-test.mjs` y los estreses; los runners `correr-newman.mjs` y `correr-estreses.mjs`, si falta, la toman en memoria del environment de Postman sin imprimirla). Se sacaron los literales de los 6 estreses, de `preparar-entorno-test.sh`, del helper y del README. Quedan en el repositorio, versionadas, dos copias del valor: el environment de Postman (variable `admin_password`) y `docs/_backups/2026-10-05-antes-de-limpieza/DECISIONES.md`.
- `docs/CUENTAS-DE-PRUEBA.local.md` está ignorado por git; las contraseñas de las cuentas de prueba no se pegan en chats ni en prompts.

## 4. Red, proxy y base de datos

- **IP real detrás del proxy.** Sin `server.forward-headers-strategy` en `application-production.properties`, `request.getRemoteAddr()` es la IP del proxy: todos los clientes comparten el contador de `RateLimitPublicoFilter` (firma de fotos del registro y validar o aceptar invitaciones) y `Sesion.ip_origen` guarda la IP del proxy. Verificarlo en el entorno real antes de contar con el límite por IP.
- **`sql_mode`** del servidor de producción en modo estricto (ver `docs/APRENDIZAJES-TECNICOS.md`).
- **Migraciones:** el último Flyway es `V35`. `V29` (estado `ACTIVO`/`INACTIVO` de `empleado_comercio`) tiene que salir en el mismo release que el enum Java `EstadoEmpleadoComercio`; antes de aplicarla en un entorno con datos, correr las consultas de la sección 13 de `docs/entregables-01-02/AUDITORIA-EMPLEADO-FASE1.md`. `V34` agrega `NO_RETIRADO` y `PEDIDO_NO_RETIRADO` a los ENUM y `V35` agrega `EMPLEADO_REACTIVADO` al ENUM de `notificacion.tipo` (ambos, cambios de metadatos que no reescriben filas; el valor nuevo va al final y el enum Java `TipoNotificacion` tiene que salir en el mismo release). En `bajonea_practicas3`, Diego verifica que no queden filas con `fuente_entrega = 'COMERCIO_SIN_RETIRO'`.
- **Datos existentes:** las filas anteriores al reloj único (A2b) no se migraron; las fechas viejas quedaron en la zona con la que se escribieron.

## 5. Variables de entorno del servidor

- `JWT_SECRET`, `RESEND_API_KEY` y `MAIL_FROM`, `CLOUDINARY_CLOUD_NAME`/`_API_KEY`/`_API_SECRET`, `MERCADOPAGO_CLIENT_ID`/`_CLIENT_SECRET`/`_REDIRECT_URI`, `MERCADOPAGO_TOKEN_ENCRYPTION_KEY`, `FRONTEND_BASE_URL` y `BACKEND_BASE_URL` (ver `application-production.properties`).
- **`MERCADOPAGO_WEBHOOK_SECRET`:** sin ella la validación de `x-signature` se omite con un `log.warn`. No es un agujero (el webhook siempre vuelve a pedirle el estado real a Mercado Pago), pero tiene que estar definida en producción.
- `MERCADOPAGO_TEST_TOKEN` define si una cuenta vinculada es de prueba.
- **Cloudinary: upload preset a crear a mano.** Además de las tres variables `CLOUDINARY_*`, el backend necesita que exista en la cuenta de Cloudinary el upload preset `bajonea_imagenes_mvp`, creado a mano con estas opciones: modo **signed**, formatos permitidos jpg, jpeg, png y webp, tamaño máximo de archivo 5 MB, y transformación entrante con ancho máximo 1200 px (`crop: limit`) y `quality: auto`. Sin el preset, las subidas firmadas fallan.
- **Cloudinary: producción usa una cuenta distinta** a la de desarrollo y pruebas (los tests de Playwright suben imágenes reales, ver `docs/APRENDIZAJES-TECNICOS.md`). Cada cuenta necesita su propio preset `bajonea_imagenes_mvp`.

## 6. Frontend

- **Las fuentes (Nunito e Inter) se piden a Google Fonts por internet** desde `frontend/css/styles.css` (`@import`). Cada carga de página depende de esa red. Empaquetar las fuentes en `frontend/` es una mejora de producción pendiente (ver la "Lista de pulido" de `CLAUDE.md` §9). Los tests de Playwright las bloquean con un fixture para ser deterministas.
- `frontend/js/api.js` fija `http://localhost:8080/api/v1`: el despliegue tiene que reemplazarlo por la URL del backend (hoy se cambia a mano; para probar en otro puerto, `scripts/entorno-test.mjs` sirve una copia temporal).
- WebKit/iPhone real sin probar en ningún tramo de UI (Windows bloquea el navegador en la máquina de Diego).

## 7. Cosas que se aceptaron y conviene saber

- **Tope de 3 emails de regularización por destinatario:** el conteo y la escritura no están serializados entre Dueños distintos que inviten a la misma cuenta a la vez; el tope puede excederse en uno o dos envíos (escenario S10 del estrés de E1).
- **Retención de `notificacion`:** cada evento operativo genera `1 + N` filas (N = Empleados activos) y no hay proceso que borre avisos viejos. Política pendiente (por ejemplo, borrar las leídas con más de 90 días).
- **Retención de `historial_empleado_comercio`:** sin borrado (solo inserción); una fila por invitación, aceptación, baja, renuncia o reactivación, volumen bajo.
- **Retención de `historial_edicion_comercio`:** sin borrado. Estimación: menos de 10 MB por comercio y año.
- **El costo de cada página de la actividad crece con el historial del comercio** (recorre las cuatro fuentes, con la del equipo desde E4): 256 ms por página con 30000 pedidos. Si hiciera falta, sumar `comercio_id` a `historial_estado_pedido` con un índice `(comercio_id, fecha_hora, id)`.
- **El Dueño puede editar productos y perfil con el comercio `SUSPENDIDO`** (hueco conocido; se resuelve en el tramo de rediseño de la suspensión).

## 8. Hallazgos del bloque A5 (resueltos en el bloque A5b, ver `docs/DECISIONES.md`)

- **A5-1, A5-2 y A5-3: resueltos (bloque A5b, 2026-10-14).** Las firmas de Cloudinary revalidan la relación y el estado del comercio; las cuatro escrituras de imagen serializan por producto (la segunda recibe `404` en vez de `500`); y todas las escrituras del catálogo, del Dueño y del Empleado, toman el comercio compartido antes que el producto (se acabó el deadlock de tres con `cerrar`, `abrir` y `datos-operativos`). Orden y tabla de cada método en `docs/CONCURRENCIA-Y-TRANSACCIONES.md`. **Sin cambios de despliegue.**
