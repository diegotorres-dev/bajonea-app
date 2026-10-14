# Lista de despliegue

Todo lo que hay que revisar antes de subir Bajoneá al servidor final y que no es código de una funcionalidad. Se armó en el bloque A5 del tramo E3 (2026-10-14) consolidando los pendientes que estaban dispersos en `CLAUDE.md` (§9), `docs/APRENDIZAJES-TECNICOS.md` ("Lista de despliegue") y los informes de cada bloque. Cada ítem dice **qué revisar**, **por qué** y **dónde está el detalle**. Los ítems están ordenados por riesgo, no por fecha.

## 1. Zona horaria del servidor (todavía sin definir)

- **Qué revisar:** la zona horaria de la JVM, la de la base de datos y la de la aplicación tienen que ser la misma.
- **Recomendación:** arrancar el backend con `-Duser.timezone=America/Argentina/Ushuaia` (o con la variable `TZ` equivalente en el contenedor), junto con `app.zona-horaria=America/Argentina/Ushuaia` (es el valor por defecto en el código, no hace falta definirla salvo que se quiera otra zona), y revisar la zona de la base (`SELECT @@global.time_zone, @@session.time_zone, NOW();`).
- **Por qué:** desde el bloque A2b de E3 el reloj de la aplicación (`ClockConfig`) usa `America/Argentina/Ushuaia`, pero quedan unos 100 `LocalDateTime.now()` que usan la zona de la JVM (altas y modificaciones, sesiones, tokens, `historial_estado_comercio`, notificaciones, notas de crédito, pagos). Con la JVM en UTC (lo normal en un contenedor Linux) las dos zonas difieren en tres horas y las comparaciones entre fechas de uno y otro grupo dan resultados incorrectos entre las 21:00 y las 24:00. Hoy anda solo porque la máquina de desarrollo está en UTC-3.
- **Pruebas:** desde el bloque A5, `mvnw test` fija `-Duser.timezone=America/Argentina/Ushuaia` en el surefire (`pom.xml`) y los tests de Playwright, Newman y los estreses calculan "hoy" y "hace N minutos" en esa zona (variable `E2E_ZONA_HORARIA` para cambiarla), así que ya no dependen de la zona de la máquina.
- **Detalle:** `docs/DECISIONES.md` (E3, bloque A2b) y la "Lista de pulido" de `CLAUDE.md` §9, punto 5.

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
- **Migraciones:** el último Flyway es `V34`. `V29` (estado `ACTIVO`/`INACTIVO` de `empleado_comercio`) tiene que salir en el mismo release que el enum Java `EstadoEmpleadoComercio`; antes de aplicarla en un entorno con datos, correr las consultas de la sección 13 de `docs/entregables-01-02/AUDITORIA-EMPLEADO-FASE1.md`. `V34` agrega `NO_RETIRADO` y `PEDIDO_NO_RETIRADO` a los ENUM (cambio de metadatos). En `bajonea_practicas3`, Diego verifica que no queden filas con `fuente_entrega = 'COMERCIO_SIN_RETIRO'`.
- **Datos existentes:** las filas anteriores al reloj único (A2b) no se migraron; las fechas viejas quedaron en la zona con la que se escribieron.

## 5. Variables de entorno del servidor

- `JWT_SECRET`, `RESEND_API_KEY` y `MAIL_FROM`, `CLOUDINARY_CLOUD_NAME`/`_API_KEY`/`_API_SECRET`, `MERCADOPAGO_CLIENT_ID`/`_CLIENT_SECRET`/`_REDIRECT_URI`, `MERCADOPAGO_TOKEN_ENCRYPTION_KEY`, `FRONTEND_BASE_URL` y `BACKEND_BASE_URL` (ver `application-production.properties`).
- **`MERCADOPAGO_WEBHOOK_SECRET`:** sin ella la validación de `x-signature` se omite con un `log.warn`. No es un agujero (el webhook siempre vuelve a pedirle el estado real a Mercado Pago), pero tiene que estar definida en producción.
- `MERCADOPAGO_TEST_TOKEN` define si una cuenta vinculada es de prueba.

## 6. Frontend

- **Las fuentes (Nunito e Inter) se piden a Google Fonts por internet** desde `frontend/css/styles.css` (`@import`). Cada carga de página depende de esa red. Empaquetar las fuentes en `frontend/` es una mejora de producción pendiente (ver la "Lista de pulido" de `CLAUDE.md` §9). Los tests de Playwright las bloquean con un fixture para ser deterministas.
- `frontend/js/api.js` fija `http://localhost:8080/api/v1`: el despliegue tiene que reemplazarlo por la URL del backend (hoy se cambia a mano; para probar en otro puerto, `scripts/entorno-test.mjs` sirve una copia temporal).
- WebKit/iPhone real sin probar en ningún tramo de UI (Windows bloquea el navegador en la máquina de Diego).

## 7. Cosas que se aceptaron y conviene saber

- **Tope de 3 emails de regularización por destinatario:** el conteo y la escritura no están serializados entre Dueños distintos que inviten a la misma cuenta a la vez; el tope puede excederse en uno o dos envíos (escenario S10 del estrés de E1).
- **Retención de `notificacion`:** cada evento operativo genera `1 + N` filas (N = Empleados activos) y no hay proceso que borre avisos viejos. Política pendiente (por ejemplo, borrar las leídas con más de 90 días).
- **Retención de `historial_edicion_comercio`:** sin borrado. Estimación: menos de 10 MB por comercio y año.
- **El costo de cada página de la actividad crece con el historial del comercio** (recorre las tres fuentes): 256 ms por página con 30000 pedidos. Si hiciera falta, sumar `comercio_id` a `historial_estado_pedido` con un índice `(comercio_id, fecha_hora, id)`.
- **El Dueño puede editar productos y perfil con el comercio `SUSPENDIDO`** (hueco conocido; se resuelve en el tramo de rediseño de la suspensión).

## 8. Hallazgos abiertos del bloque A5 (decisión pendiente de Diego, ver `docs/DECISIONES.md`)

- **A5-1.** Las dos firmas de Cloudinary (`POST /productos/{id}/cloudinary/firma` y `.../recorte/firma`) no revalidan la relación del Empleado dentro de la transacción, a diferencia de las otras 16 escrituras: un Empleado que se está desactivando puede obtener una firma si su request pasó el resolver antes del commit de la desactivación. Severidad baja (la firma solo permite subir a la carpeta del comercio).
- **A5-2.** `eliminarImagen` responde `500` (`StaleObjectStateException` en `recalcularImagenPrincipal`) cuando dos operadores borran la misma imagen a la vez (Dueño más Empleado, o dos Empleados); debería ser `200` y `404`. No hay pérdida de datos. Arreglo propuesto: leer la imagen con bloqueo (`PESSIMISTIC_WRITE`) en `obtenerImagenDelProducto` para que el segundo espere y vea `404`.
- **A5-3.** Interbloqueo (`Deadlock found`, `500` en `cerrar`) entre un `cerrar`/`abrir`/`datos-operativos` y las escrituras de productos de **dos operadores distintos** (Dueño más Empleado). Causa (leída del último deadlock de InnoDB y del código, hipótesis fundada, no probada con un arreglo): el `cambiarEstado` del **Dueño** toma el producto `FOR UPDATE` como primera lectura y recién después el comercio en compartido (la clave foránea del `INSERT` del registro de ediciones), mientras que las escrituras del **Empleado** (y `agregarImagen`) toman el comercio en compartido (guard de estado) y después el producto; si en el medio llega un `cerrar`, que pide el comercio exclusivo, el compartido nuevo se encola detrás de él y se cierra el ciclo de tres. Arreglo propuesto (código de producción, espera tu OK): que el `cambiarEstado` del Dueño también lea el comercio con `LOCK IN SHARE MODE` antes de bloquear el producto, como ya hace el del Empleado (es una lectura con bloqueo, no establece la foto de la transacción, así que no contradice el comentario del método). Reproducido con `stress-locks-tramoE3-A5.mjs` (`ESCENARIO=2`).
