# Aprendizajes técnicos — Bajoneá

> Las contraseñas de prueba que figuraban en este documento se reemplazaron por referencias `‹CP-n›`; la correspondencia está en `docs/CUENTAS-DE-PRUEBA.local.md` (archivo local, no versionado).

Lecciones operativas y de herramientas que no son decisiones de diseño (esas viven en `docs/DECISIONES.md`) pero que conviene no volver a descubrir. Cada entrada nombra el síntoma, la causa real y qué hacer; el contexto completo está en la entrada de `docs/DECISIONES.md` que se cita.

---

## MercadoPago

### `es_cuenta_prueba` depende de `MERCADOPAGO_TEST_TOKEN` al momento de vincular

- **Síntoma:** al pagar con una tarjeta nueva aparece "Oh, no, algo anduvo mal", aunque el pago con una tarjeta guardada funcione. El pago devuelve el `init_point` de producción.
- **Causa:** `cuenta_mercado_pago.es_cuenta_prueba` se decide por la variable de entorno `MERCADOPAGO_TEST_TOKEN` cuando se vincula la cuenta (el backend manda `test_token` en el intercambio del código de OAuth), **no** inspeccionando la cuenta real. Si el backend arrancó sin la variable, cualquier vinculación nueva queda como no-test aunque la cuenta sea de prueba.
- **Qué hacer:** setear `MERCADOPAGO_TEST_TOKEN=true` **antes** de arrancar el backend (PowerShell: `$env:MERCADOPAGO_TEST_TOKEN="true"`), vincular la cuenta de prueba y recién ahí pagar. Una cuenta ya vinculada sin la variable hay que re-vincularla. El backend emite un WARN al arrancar (`MercadoPagoConfig`) si la variable no está seteada explícitamente; si lo ves y vas a usar una cuenta de prueba, frená y setéala.
- Ver `docs/DECISIONES.md`, 2026-09-25.

### `fee_details` devuelve `type = application_fee` aunque el split use `marketplace_fee`

- **Causa:** es solo el nombre con que MercadoPago informa nuestra comisión de marketplace en la respuesta de `GET /v1/payments/{id}`. No significa que se esté usando el mecanismo `application_fee` de la API de Pagos.
- **Qué hacer:** no "corregir" el filtro de `MercadoPagoPagoService` a `marketplace_fee` (la entrada de respuesta nunca se llama así) ni reintentar `application_fee` al crear la preferencia. Ver `docs/MERCADOPAGO-BAJONEA-FINAL.md`, sección "Split implementado y verificado".

### La aplicación de MercadoPago tiene que estar bajo la cuenta de Bajonea Split

- Para que el `marketplace_fee` llegue a la cuenta esperada en sandbox, `MERCADOPAGO_CLIENT_ID`/`_SECRET` deben ser los de una aplicación registrada bajo la cuenta de MercadoPago de Bajonea Split. Es un requisito de configuración, no de código.

---

## Base de datos y concurrencia

### Orden de bloqueo entre Dueño, Mercado Pago, comercio y usuario (tramo multi-comercio 2A)

- **Regla:** las transacciones que escriben estas filas las toman siempre en este orden: `dueno` → `cuenta_mercado_pago` → `comercio` → (las filas que se insertan referenciando a un padre, como `usuario` por la notificación). Ninguna transacción pide un bloqueo "hacia atrás".
- **Quién toma qué:** el alta adicional bloquea la fila del `dueno` (`SELECT … FOR UPDATE`, primera sentencia) y no espera a nadie más. La aprobación de un comercio bloquea la cuenta de Mercado Pago del Dueño (con la fila, o con el hueco del índice único si no hay) y recién después escribe el comercio. La vinculación/desvinculación escribe la cuenta y después lee los comercios con `FOR UPDATE`. El bloqueo de cuenta por intentos fallidos bloquea el `usuario` y actualiza comercios con lecturas comunes, sin `FOR UPDATE`.
- **Trampa real que apareció probando (deadlock de MySQL, reproducido con `testing/playwright/scripts/stress-locks-tramo2a.mjs`):** `repository.save(entidad)` sobre una entidad ya cargada **no ejecuta el `UPDATE` en ese momento**: Hibernate lo difiere hasta el commit, y una consulta posterior solo dispara el flush si toca las mismas tablas. La vinculación hacía `save(cuenta)` y después leía los comercios con `FOR UPDATE`, así que el `UPDATE` de la cuenta corría *después* de bloquear los comercios: orden invertido respecto de la aprobación → deadlock. Se arregló con `saveAndFlush` en `CuentaMercadoPagoService.vincular`/`desvincular`. **Cuando el orden de bloqueo importa, usar `saveAndFlush` (o un `FOR UPDATE` explícito), no `save`.** Un `INSERT` con `IDENTITY` sí se ejecuta enseguida.
- **`REPEATABLE READ` y lecturas comunes:** la foto de la transacción se toma en la primera lectura común. Una transacción que vio "no hay comercio aprobado" al principio no lo ve aunque otro lo confirme después. Por eso `ComercioService.activarAptoVenta(duenoId)`/`desactivarAptoVenta(duenoId)` leen los comercios con `FOR UPDATE` (una lectura con bloqueo ve siempre lo último confirmado): sin eso, una vinculación que llegara a mitad de una aprobación dejaba el comercio `APROBADO` con la cuenta ya vinculada.
- **Cada `INSERT` con clave foránea toma un bloqueo compartido sobre la fila padre.** Insertar en `historial_estado_comercio` pide S sobre la fila de `comercio`; insertar en `notificacion` pide S sobre la de `usuario`; insertar en `comercio` o en `cuenta_mercado_pago` pide S sobre la de `dueno`. Hay que contarlos al razonar sobre ciclos.
- **Lo que no hay que hacer:** bloquear el comercio antes que la cuenta (invierte el orden con la vinculación), ni usar `FOR UPDATE` en el bloqueo por intentos fallidos (esperaría la fila de un comercio que la aprobación ya tiene mientras la aprobación espera el `usuario` para la notificación).
- **Pendiente conocido, anterior a este tramo:** dos *primeras* vinculaciones simultáneas del mismo Dueño chocan por el `UNIQUE (dueno_id)` de `cuenta_mercado_pago`.

### Corrección de comercios rechazados: el mismo orden de bloqueo y por qué la resolución lee primero solo el id del Dueño (tramo multi-comercio 3A)

- **Regla (la misma del tramo 2A, extendida):** `dueno` → `cuenta_mercado_pago` → `comercio` → tablas hijas. El reenvío del Dueño (`ComercioCorreccionService.reSolicitar`) bloquea la fila de `dueno` como primera sentencia y después la del comercio (`findByIdAndDuenoIdConBloqueo`, `FOR UPDATE`); no toca `cuenta_mercado_pago`. La resolución del Administrador (`AdministradorService.resolverAprobacion`) lee solo el id del Dueño con una consulta escalar (`findDuenoIdById`), toma la cuenta de Mercado Pago con bloqueo (solo al aprobar) y recién después bloquea el comercio (`findByIdConBloqueo`) y revalida que siga `PENDIENTE`.
- **Por qué escalar:** el código anterior hacía `findById(comercio)` antes de pedir la cuenta. Eso carga la entidad en el contexto de persistencia y, en `REPEATABLE READ`, congela una foto de su estado: dos resoluciones simultáneas del mismo comercio podían las dos ver `PENDIENTE` y las dos escribir. Con la consulta escalar no queda ninguna entidad en memoria, así que la lectura `FOR UPDATE` trae lo último confirmado y el segundo en llegar ve que ya no está pendiente (`409`).
- **Token de versión del reenvío:** es el id de la fila de historial del último rechazo del comercio (`0` si no hay ninguna). El `PUT` lo compara dentro del bloqueo: una pestaña vieja (otro reenvío ya hecho, o un rechazo nuevo del Administrador) da `409` sin gastar un intento.
- **Una excepción dentro de la transacción revierte todo.** El reenvío aplica las ediciones en el lugar y, si ninguna cambió nada, lanza `409`; por eso cada operación de `ComercioEdicionService` escribe solo cuando el dato realmente cambió (un reenvío sin cambios no borra y vuelve a insertar los horarios).
- **Medido con `CASO=tramo3a` de `testing/playwright/scripts/stress-locks-tramo2a.mjs`** (12 rondas: dos reenvíos idénticos de cada comercio rechazado, doble resolución, aprobaciones de otros comercios del mismo Dueño, vinculación y desvinculación de Mercado Pago, alta adicional y bloqueo de cuenta, a la vez; y una segunda fase con rechazos del Administrador contra reenvíos con token viejo): sin ningún `5xx`, un solo ganador por carrera y `cantidad_resolicitudes` igual a las filas `RECHAZADO → PENDIENTE` del historial.
- **Dos Dueños que corrigen hacia el mismo CUIT:** el segundo espera el índice único `uq_persona_juridica_cuit` hasta que el primero confirma y recibe `409` (se atrapa `DataIntegrityViolationException`); no hay ciclo porque ninguno necesita nada del otro.

### Lecturas con bloqueo compartido: `FOR SHARE` no existe en MariaDB 10.4 (tramo multi-comercio 5A)

- **Síntoma:** `@Lock(LockModeType.PESSIMISTIC_READ)` sobre una consulta JPQL falla en el motor local con `You have an error in your SQL syntax ... near 'share'`: Hibernate genera `... for share` y MariaDB 10.4.32 solo entiende `LOCK IN SHARE MODE`. MySQL 8 acepta las dos formas. Lo encontró el test de integración contra `bajonea_test`; los tests con Mockito no lo habrían visto.
- **Qué se hizo:** las dos lecturas con bloqueo compartido del tramo (los pedidos `PENDIENTE_PAGO` de la desvinculación y el estado del comercio al crear un pedido) son consultas nativas con `LOCK IN SHARE MODE` (`PedidoRepository.findPendientesPagoDeComerciosConBloqueoCompartido`, `ComercioRepository.leerEstadoConBloqueoCompartido`), que funciona en MariaDB y en MySQL. Es sintaxis deprecada en MySQL 8 (todavía válida en 8.4); si algún día se retira, el reemplazo es `FOR SHARE` y hay que revisar el dialecto.
- **El estado se lee de la consulta, no de la entidad:** `entityManager.refresh(comercio, PESSIMISTIC_READ)` habría sido una alternativa, pero el `SELECT` nativo devuelve el estado confirmado más reciente y `PedidoService.confirmarPedido` valida con ese valor (`ComercioService.validarAceptaPedidos(comercio, estadoActual)`). Una lectura común posterior, en `REPEATABLE READ`, devolvería la foto de la transacción y dejaría crear un pedido sobre un comercio recién desvinculado.
- **Orden de bloqueo de la desvinculación:** `cuenta_mercado_pago` (`FOR UPDATE`) → todos los comercios del Dueño (`FOR UPDATE`) → pedidos `PENDIENTE_PAGO` de esos comercios (compartido, filas y no un `COUNT`). Es el orden de siempre (`dueno` → `cuenta_mercado_pago` → `comercio` → hijas) con los pedidos al final. Crear un pedido toma solo el comercio (compartido) y después inserta el pedido (el bloqueo de la clave foránea sobre el comercio ya lo tiene): no pide la cuenta. El webhook y la sincronización toman el pedido `FOR UPDATE` y leen la cuenta con lectura común: no hay ciclo con la desvinculación (que espera al pedido, no al revés). La cascada de suspensión de un comercio toma comercio y después pedidos, el mismo orden.
- **Por qué los comercios se bloquean antes de mirar los pedidos:** si la desvinculación mirara los pedidos primero, un pedido creado entre medio quedaría sobre una cuenta ya desvinculada. Con el comercio bloqueado `FOR UPDATE`, una creación de pedido en curso termina antes (la desvinculación espera) o espera a que la desvinculación termine (y ve el comercio en `APROBADO`).
- **Medido con `testing/playwright/scripts/stress-locks-tramo5a.mjs`** (15 rondas por escenario): dos Dueños vinculando la misma cuenta a la vez (exactamente un `200` y un `409`), pedidos creados mientras se desvincula (en ninguna ronda quedó un pedido `PENDIENTE_PAGO` sobre una cuenta inactiva), desvincular con un pago pendiente (`409` siempre) y vincular/desvincular intercalados del mismo Dueño. Sin ningún `5xx` ni deadlock; el log del backend solo muestra las violaciones esperadas de los índices únicos.
- **Dos primeras vinculaciones simultáneas del mismo Dueño** siguen chocando por `UNIQUE (dueno_id)` y responden `409` con el texto genérico "Ya existe un registro con alguno de los datos ingresados" (no con el de cuenta en uso). Es el pendiente conocido de antes de este tramo; no se corrigió.

### Toda transición de estado de un pedido: primero los usuarios, después el pedido (tramo E3, bloque A0)

- **Regla:** `PedidoService.bloquearParaActualizar(pedidoId, actorUsuarioId)` es el único camino para cambiar el estado de un pedido existente (acciones del comercio, del Cliente, webhook de pago, procesos automáticos y suspensión). Toma `LOCK IN SHARE MODE` sobre los usuarios involucrados (quien actúa, el Cliente, el usuario del Dueño; ascendente) y recién después `FOR UPDATE` sobre el pedido; vuelve a validar el estado y calcula la hora **después**. Detalle del inventario y del orden global en `docs/CONCURRENCIA-Y-TRANSACCIONES.md` (§5bis y cierre).
- **Por qué los usuarios antes que el pedido:** cada `INSERT` en `historial_estado_pedido`, `notificacion` y `nota_credito` pide un bloqueo compartido sobre la fila de un usuario (clave foránea). En InnoDB ese pedido de bloqueo compartido se encola detrás de un `FOR UPDATE` ya en espera —el del login—, así que una acción que ya tiene el pedido puede quedar esperando a un login que a su vez espera a otra transacción que necesita ese pedido. Razonado sobre el orden de la cola, no reproducido; se evitó tomando los usuarios primero, la misma regla que ya había arreglado el cierre manual (tramo C2). Las acciones de pedido **no** bloquean el comercio: el único camino que sostiene el comercio y después pide pedidos es la suspensión, siempre en ese orden.
- **El `refresh` es lo que hace efectivo el lock:** con `open-in-view` la entidad ya está en el contexto de persistencia (`obtenerPedidoDelComercio` la carga para verificar la pertenencia), y una consulta con `FOR UPDATE` no la actualiza. `entityManager.refresh(pedido, PESSIMISTIC_WRITE)` emite el `SELECT ... FOR UPDATE` y vuelve a hidratar con lo último confirmado. Sin esa línea fallan 7 de los 13 tests de `PedidoTransicionesIntegrationTest` (se comprobó quitándola).
- **Qué tocar al sumar un destinatario de avisos:** el fan-out a Empleados (E3, bloque A4) agrega usuarios que se van a escribir dentro de la transacción del pedido; tienen que entrar al conjunto de `bloquearParaActualizar` (ascendente) antes del pedido, no leerse después.

### Procesos automáticos: ids sin bloqueo y una transacción corta por pedido (tramo E3, bloque A0)

- Los cuatro `@Scheduled` de pedidos leían todos los candidatos y los resolvían en una sola transacción larga, sin bloqueo. Ahora eligen los ids sin lock (`PedidoRepository.findIds...`) y resuelven cada pedido con un `TransactionTemplate`: bloquean el pedido, revalidan estado y condición de tiempo con el pedido ya bloqueado y escriben. Un pedido que cambió entre la lectura y el bloqueo (lo aceptó el comercio, lo confirmó el Cliente, lo pagó el webhook) se salta sin dejar nada.
- Los métodos públicos del proceso son `@Transactional(propagation = SUPPORTS)` y no `REQUIRED`: el servicio es `@Transactional` de clase y, si el método abriera una transacción, las de cada pedido se unirían a ella y volvería a haber una sola transacción grande con bloqueos acumulados. Con `SUPPORTS` abre cada pedido su transacción cuando el proceso corre solo, y se une a la del test cuando se lo llama desde una prueba transaccional.
- Un pedido que falla se registra en el log (`El proceso ... falló para el pedidoId=...`) y los demás siguen; antes un solo error revertía toda la corrida.
- Cada proceso acepta la hora a usar (`expirarPedidosSinRespuestaComercio(LocalDateTime)`, etc.) y la lee con un `Supplier` **después** del bloqueo. `PedidoSchedulerService` los expone para las pruebas con `ejecutar(nombre, ahora)` y `pedido.jobs.habilitado=false` (perfil `test`) los apaga: `POST /api/v1/test/jobs/pedidos/{nombre}?ahora=` con `expirar-pagos`, `avisar-y-autoconfirmar`, `expirar-sin-respuesta` o `autoconfirmar-retiros`. **Cuidado:** el proceso recorre todos los pedidos que cumplan la condición, no solo los del test; Playwright y el estrés envejecen el historial por SQL (`UPDATE historial_estado_pedido SET fecha_hora = ...`) en vez de pasar una hora futura, para no expirar pedidos ajenos; la carpeta 58 de Newman, que no tiene SQL, sí pasa una hora futura y por eso tiene que seguir siendo la última de la colección.

### La nota de crédito nace en la transacción del cambio de estado; solo Mercado Pago es `afterCommit` (tramo E3, bloques A0 y A0b)

- `ReembolsoService.procesarReembolsoTotal` difiere **todo**, incluida la nota, a después del commit y en una transacción nueva; un fallo ahí solo se registra y el pedido ya cambió de estado. Desde el bloque A0b ningún flujo de pedidos lo usa. Un pedido no puede quedar en un estado con devolución sin su nota, así que anular, rechazar, la expiración sin respuesta, la cancelación por suspensión del comercio y la cancelación del Cliente usan `generarNotaYReembolsarTotal`: la misma rutina de preparación (`prepararIntento`: pago `FOR UPDATE`, criterio de pago reembolsable, monto ya cubierto, cuenta del Dueño) corre dentro de la transacción de la anulación y solo la llamada HTTP a Mercado Pago y el registro de su resultado van `afterCommit`. Orden de bloqueo coherente con el resto: usuarios, pedido, pago, y recién después el `INSERT` de la nota.
- **Consecuencia visible:** la respuesta de `anular`, `rechazar` y de la cancelación del Cliente trae `reembolsoEstado` y `reembolsoMonto` (la nota ya existe cuando se arma el DTO).
- **Qué pasa si falla la escritura de la nota:** en las acciones de una persona el error sube y la transacción se revierte entera (estado, historial y avisos quedan como estaban). En los procesos automáticos cada pedido tiene su transacción: se revierte solo ese pedido, el error se registra con su id y la corrida siguiente lo reintenta. La suspensión del comercio corre dentro de la transacción del Administrador: un error revierte la suspensión completa. Probado con `PedidoTransicionesIntegrationTest` (se simula el fallo de `NotaCreditoService.crear`).
- **Un pedido sin pago aprobado y confirmado no genera nota** (devuelve `false` y el aviso no promete devolución). En producción un pedido `EN_PREPARACION` siempre tiene pago aprobado; el caso existe por el atajo de test que confirma el pago sin registrarlo. `PUT /api/v1/test/pedidos/{id}/pago-aprobado?registrarPago=true` deja además la fila de `pago` que dejaría el webhook (`approved`, id de transacción sintético), que es lo que usan las pruebas de reembolso.
- **No se agregó ninguna restricción única en la base:** `nota_credito` es N:1 con `pago` a propósito (reembolso parcial por ítem). La idempotencia ante dos anulaciones simultáneas la da el lock del pedido, con el monto ya cubierto del pago como segunda defensa.

### Probar con la base de test mientras hay otro backend en el 8080

- El backend de desarrollo (por ejemplo contra `bajonea_practicas3`) y el de test no pueden compartir el 8080. `preparar-entorno-test.sh` **mata** lo que escuche en el 8080, así que no sirve si hay uno ajeno. `reset-db.mjs` usa el 8091 para migrar y no molesta. Alternativa verificada: levantar el de test en otro puerto (`./mvnw spring-boot:run -Dspring-boot.run.profiles=test -Dspring-boot.run.arguments=--server.port=8081`), comprobar que sus conexiones van a `bajonea_test` (`SELECT db, COUNT(*) FROM information_schema.processlist GROUP BY db`) y usar `E2E_API_BASE_URL` en Playwright, `--env-var base_url=...` en Newman y `E2E_API_BASE_URL` en los scripts de estrés.
- Los specs de pantalla pegan contra el backend que el frontend tiene fijo en `frontend/js/api.js` (`http://localhost:8080`). Para no tocar el frontend ni el 5501 de desarrollo: copiar `frontend/` a una carpeta temporal, cambiar el puerto en la copia de `api.js`, servirla con `python .claude/scripts/dev-server-no-cache.py 5502 <carpeta>` y correr con `E2E_FRONTEND_URL=http://localhost:5502`. El spec 38 tenía el `baseURL` de un segundo contexto fijo en `localhost:5501`; ahora respeta `E2E_FRONTEND_URL`. Borrar la copia al terminar.

### Normalización de texto para comparar (`TextoUtils.normalizarParaComparar`)

- Para decidir si dos textos escritos por personas son "el mismo": descompone en NFD, quita las marcas diacríticas (`\p{M}`), pasa a minúsculas, recorta y colapsa espacios. `null` y `""` dan lo mismo. La `ñ` se compara como `n` (también la quita, aunque para nombres de comercio y calles es lo que se busca).
- Solo para comparar: nunca para guardar ni mostrar (lo guardado sigue pasando por `aTitleCase`). Ambos lados de la comparación tienen que pasar por la función (lo guardado ya está en Title Case).
- El chequeo de comercio duplicado no tiene un `UNIQUE` en la base que lo respalde (no se puede expresar con esta normalización): lo hace la aplicación y se serializa con el bloqueo de la fila del Dueño.

### El fan-out de avisos y el purgado de la activación no admiten bloqueos de rango ni una FK a `comercio` (tramo E3, bloque A4)

- **Sin FK a `comercio` en `notificacion.comercio_id`.** Una FK haría que cada `INSERT` de un aviso tomara un bloqueo compartido sobre el comercio, con el pedido ya bloqueado. La suspensión del Administrador toma el comercio y después sus pedidos: se cruzan. `entidad_id` ya funcionaba así (sin FK).
- **`UPDATE ... WHERE empleado_id AND comercio_id` bloquea a los vecinos.** En MariaDB 10.4 el optimizador usa `index_merge` con `idx_empleado_comercio_empleado` y `idx_empleado_comercio_comercio` y bloquea todas las relaciones del comercio que recorre; el `SELECT ... FOR UPDATE` con los mismos predicados usa `uq_empleado_comercio` (`const`). Se vio como 36 `Deadlock found` en el arnés del estrés (un `UPDATE` de desactivación contra tres eventos que sostenían bloqueos compartidos sobre la relación vecina). Regla: actualizar `empleado_comercio` siempre `WHERE id = ?`. E4 tiene que respetarlo.
- **Marcar todas por ids, no por rango**, y purgar por ids: ver `docs/CONCURRENCIA-Y-TRANSACCIONES.md`.
- **Hallazgo previo (fuera de A4), resuelto después en el mini-tramo del carrito de E3 (2026-10-14, ver `docs/CONCURRENCIA-Y-TRANSACCIONES.md`, punto 6 del orden global):** dos pedidos distintos del mismo Cliente que se pagan a la vez fallan uno con `500` (`ObjectOptimisticLockingFailureException` sobre `ItemCarrito`): las dos confirmaciones de pago vacían el mismo carrito con `deleteByCarritoId`, que borra entidad por entidad, y la segunda borra filas que ya no existen. Con Mercado Pago el webhook se reintenta y la segunda vez funciona, pero conviene reemplazarlo por un `DELETE` en bloque (`@Modifying @Query`). El estrés usa un comprador distinto por cada pedido que paga en paralelo.

---

### Dos operadores del mismo comercio: si no todos toman el comercio y el producto en el mismo orden, un `FOR UPDATE` del comercio cierra un ciclo de tres (tramo E3, bloque A5b)

- **Síntoma:** `500` (`Deadlock found`) en `cerrar`, `abrir` y `datos-operativos` solo cuando el **Dueño y un Empleado** escribían productos a la vez. Un solo tipo de operador, con los mismos pedidos, nunca fallaba (0 deadlocks en 175 solicitudes de cada lado; 150 a 222 en 250 con los dos).
- **Causa:** el Dueño tomaba el producto (`UPDATE`, o compartido por la clave foránea de la imagen) y recién en el `INSERT` del historial el comercio compartido; el Empleado tomaba el comercio compartido (guard de estado) y después el producto. Un `FOR UPDATE` del comercio se encola detrás del compartido del Empleado, y el compartido que el Dueño pide después **se encola detrás de ese exclusivo** (InnoDB no deja pasar a un compartido nuevo si hay un exclusivo esperando adelante). Los tres se esperan en círculo. `SHOW ENGINE INNODB STATUS` solo imprime dos de los tres: la víctima (el exclusivo) y la que tiene el compartido; el tercero hay que deducirlo.
- **Qué hacer:** un orden único para todos los actores (usuario, relación, comercio compartido, producto exclusivo, lecturas comunes); no condicionar la lectura del comercio al rol. Ver `docs/CONCURRENCIA-Y-TRANSACCIONES.md`, "Bloque A5b de E3", con la tabla de cada método.
- **Cómo se confirmó sin tocar el código:** tres sesiones de `mysql.exe` con `SLEEP` (A: comercio compartido y después producto; B: producto y después comercio compartido; C: comercio exclusivo, 0,5 y 1 s después). Con B en el orden viejo, C muere con el error 1213; con B en el orden nuevo, nadie.

### Una lectura común antes del bloqueo fija la foto y el que llega segundo escribe sobre filas que ya no existen (tramo E3, bloque A5b)

- **Síntoma:** `500` (`StaleObjectStateException` sobre `ImagenProducto`) en `eliminarImagen`, `reordenarImagen` y `actualizarUrlImagen` cuando dos operadores tocan la misma imagen, o cuando uno borra otra imagen del mismo producto (`recalcularImagenPrincipal` actualiza filas que el otro ya borró). Sin pérdida de datos: la transacción perdedora se revierte entera.
- **Causa:** bajo REPEATABLE READ la foto se fija en la primera lectura **común** (aquí la del comercio, por `findById`). Esa transacción veía la imagen aunque la otra ya la hubiera borrado (sin confirmar), y su `DELETE`/`UPDATE` con `WHERE id = ?` devolvía 0 filas. Bloquear solo la imagen no alcanza: `recalcularImagenPrincipal` lee todas las imágenes del producto.
- **Qué hacer:** serializar por producto: el producto `FOR UPDATE` como primera lectura del producto y **ninguna lectura común antes** (las lecturas `LOCK IN SHARE MODE` y `FOR UPDATE` no fijan la foto). El que llega segundo espera, y su primera lectura común ya ve lo confirmado: una imagen borrada es `404`. Es el mismo patrón que `cambiarEstado`.
- **Descartado:** bloquear todas las imágenes del producto por `producto_id`: toma bloqueos de siguiente clave sobre el índice de la clave foránea y puede interbloquear inserts de imágenes de productos vecinos.

## Testing

### Contar `Deadlock found` en el log: el archivo rota a los 10 MB (tramo E3, bloque A5b)

- **Síntoma:** un estrés largo informó `-888 deadlocks` en una combinación: el contador "después menos antes" del log dio negativo.
- **Causa:** `--logging.file.name` rota el log (`backend-test.log.AAAA-MM-DD.N.gz`) al llegar a 10 MB; el conteo sobre el archivo activo pierde lo rotado, y cortar por `bytes` desde el inicio pierde líneas. Un estrés con muchas solicitudes puede rotar varias veces.
- **Qué hacer:** `stress-locks-tramoE3-A5.mjs` suma el archivo activo y los `.gz` rotados (`contarEnElLog`). Los demás estreses y `correr-estreses.mjs` todavía cortan por bytes desde el inicio: con corridas que no llegan a rotar alcanza; si algún día un estrés largo muestra números raros, revisar esto primero.

### Detener una transacción de un `@Service` en un test: espiar un colaborador que no sea transaccional-obligatorio (tramo E3, bloque A5b)

- **Qué pasó:** para armar una carrera determinista hay que detener un hilo justo antes de que su transacción inserte en el historial. Espiar `HistorialEdicionComercioService.registrar` con `@MockitoSpyBean` falla (`doAnswer(...).when(spy).registrar(...)` ejecuta la llamada a través del proxy y su `@Transactional(MANDATORY)` exige una transacción que el test no tiene).
- **Qué hacer:** espiar `DisponibilidadComercioService.ahora()` (`@Transactional(readOnly = true)`, no obligatoria), que `registrar` pide justo después de volcar las escrituras pendientes y antes del `INSERT`; un `ThreadLocal<Runnable>` con el gancho hace que solo se detenga el hilo que lo puso. El gancho puede llamar a `entityManager.flush()` para que el hilo tenga tomado en el motor lo mismo que tendrá al insertar. Ver `EscriturasCatalogoOrdenDeBloqueoIntegrationTest`.

### Precondición de Newman: la contraseña de `admin@bajonea.ar` tras un reset

- **Síntoma:** todas las corridas de la colección de Postman fallan en cascada con un `401` del admin.
- **Causa:** `testing/playwright/scripts/reset-db.mjs` siembra `admin@bajonea.ar` (`nombre_usuario` `adminbajonea`) con un hash bcrypt de una contraseña desconocida. La colección espera `‹CP-1›` (variable del environment `postman/Bajonea-Local.postman_environment.json`).
- **Qué hacer:** con el backend en perfil `test`, fijar la contraseña por el flujo real de recuperación antes de correr Newman: (1) `POST /api/v1/auth/recuperar-password` con `{ "email": "admin@bajonea.ar" }`; (2) obtener el código real con `GET /api/v1/test/token?email=admin@bajonea.ar&tipo=RECUPERACION_PASSWORD`; (3) `POST /api/v1/auth/recuperar-password/confirmar` con `{ "email": "admin@bajonea.ar", "codigo": "<código>", "nuevaPassword": "‹CP-1›" }`. Es el mismo mecanismo que documenta la descripción de `admin_password` en el environment. Los specs de Playwright no lo necesitan: lo resuelven cada uno con `fijarPasswordAdminYLoguear` (`tests/helpers/backend.ts`).
- **Sugerencia futura, no implementada:** automatizar este paso dentro de `reset-db.mjs`.

### Playwright corre siempre con `workers: 1`

- No es una optimización pendiente. `admin@bajonea.ar` es una cuenta real compartida por 13 de los 19 archivos de spec y Bajoneá tiene **sesión única por cuenta** (`Sesion.activa`): un login nuevo invalida el anterior de la misma cuenta, por UI o por API. Con más de un worker dos specs se pisan y rompe el que pierde la carrera. Además el backend único de desarrollo y Cloudinary no toleran la concurrencia real: con paralelismo por defecto fallaban ~45 tests. Convención para specs nuevos: todo el setup por API de una cuenta va antes que su login por UI dentro del mismo test.

### `waitForURL` necesita comodín final cuando la redirección agrega query string

- **Síntoma:** un test de Playwright cuelga hasta el timeout en un `waitForURL` aunque la pantalla de destino ya cargó.
- **Causa:** las redirecciones posteriores a un alta o a una resolución agregan query string (por ejemplo `?productoCreado=1` o `?comercioResuelto=1`), y un patrón sin comodín final no matchea esa URL.
- **Qué hacer:** terminar el patrón con comodín: `**/pantalla.html*`.

### Los atajos de test no reemplazan la integración real

- `GET /api/v1/test/token`, `PUT /api/v1/test/comercios/{id}/apto-venta` y `PUT /api/v1/test/pedidos/{id}/pago-aprobado` existen solo bajo `@Profile("test")`. Saltean el paso externo pero ejecutan el mismo código de negocio que el flujo real. Sirven para poder testear, no prueban que MercadoPago funcione.

### Las URL de imágenes de la colección de Postman salen de la firma, no se escriben a mano (tramo E3, bloque A0)

- Desde el A0 `PUT /comercios/perfil/foto`, `POST /productos/{id}/imagenes` y `PATCH .../imagenes/{id}/url` exigen que la URL esté en la carpeta que firma el servidor (`comercios/{id}/perfil/` y `productos/{comercio}/{producto}/`) y en la cuenta de Cloudinary configurada. Una URL de ejemplo `res.cloudinary.com/demo/...` da `400`. Las requests de la colección piden antes la firma (`POST .../firma`), guardan `cloudName` y `folder` en el environment (`cloudinary_cloud_name` y `cloudinary_folder` en la carpeta 04, `cloudinary_foto_*` en la 13, `cloudinary_b_*` en la 14, `matriz_foto_*` y `matriz_img_*` en las matrices 38 y 40, `a0_cloud` en la 58) y arman la URL con eso. Los `400` de validación del DTO (`url` vacía, dominio ajeno, extensión) no cambian: el DTO se valida antes que la carpeta.
- Los specs de Playwright que suben imágenes reales a Cloudinary usan la URL que devuelve la subida (`secure_url`), que ya está en la carpeta correcta; los que solo prueban la validación arman la URL con el `cloudName` de la firma y no suben ningún archivo.

### `mysql.exe` desde Node devuelve a veces una salida vacía (tramo E3, bloque A4)

- **Síntoma:** fallos intermitentes y no reproducibles de los estreses y de algunos specs que consultan la base con el cliente `mysql.exe` (`execFileSync`): "0 notas de crédito (se esperaba 1)", "sin historial", un estado vacío, una lista vacía. Al mirar la base un instante después, los datos estaban bien. Un `SELECT COUNT(*)` —que no puede devolver una salida vacía— la devolvió vacío en una de las corridas con el instrumento que registraba esas lecturas; repetido de inmediato, dio el valor correcto.
- **Causa:** el cliente de línea de comandos, lanzado muchas veces por segundo desde Node en Windows, a veces termina con código `0` sin salida. No es un dato de la aplicación ni de la base.
- **Qué se hizo:** `sql` (los estreses) y `sqlTest` (`tests/helpers/backend.ts`) repiten hasta dos veces una consulta `SELECT` cuya salida vino vacía. Con eso las corridas repetidas dejaron de fallar. Si un fallo de un estreses o de un spec dice "vacío" o "0" sobre algo que existe, repetir la corrida antes de buscar un defecto de la aplicación.

### `mvnw test` completo: dos pasadas, no una con el perfil `test` forzado

- `AtajosDeTestFueraDelPerfilTest` comprueba que **sin** el perfil `test` no existen los atajos de `/api/v1/test/**`; forzar `-Dspring.profiles.active=test` en toda la corrida lo hace fallar (2 falsos fallos). Pasada 1: `./mvnw test -Dspring.profiles.active=test -Dtest='!AtajosDeTestFueraDelPerfilTest'`. Pasada 2: `./mvnw test -Dtest=AtajosDeTestFueraDelPerfilTest` (esa clase fija por su cuenta la base `bajonea_test`). Nunca `mvnw test` a secas ni contra otra base.
- Después de cambiar la firma de un constructor, `mvnw test-compile` puede decir `Nothing to compile - all classes are up to date` y dejar tests desactualizados; usar `./mvnw clean test-compile` para ver los errores reales.

### El atajo de clonar comercios no copia las redes sociales

- `POST /api/v1/test/comercios/{id}/clonar` copia el comercio, su dirección y sus horarios, pero no sus redes sociales. Un clon no se puede reenviar en la corrección (exige al menos una red): el spec `24` copia las redes del original por SQL (`clonarConRedes`) después de clonar, y el caso `tramo3a` del script de estrés hace lo mismo.
- El clon tampoco tiene fila de historial aunque se cree `RECHAZADO` o `RECHAZO_DEFINITIVO`: la corrección lo trata como un rechazo sin motivo y con versión `0`.

### `BajoneaApplicationTests` no se corre con `mvn test` sin perfil `test`

- **Riesgo:** `BajoneaApplicationTests` es un `@SpringBootTest` que levanta el contexto completo. En el perfil por defecto usa el `spring.datasource.url` del entorno (`bajonea_final` en `application.properties`; `bajonea_practicas3` en el entorno de desarrollo de Diego), y con `flyway.enabled=true` migraría esa base y arrancaría los `@Scheduled` contra datos reales.
- **Qué hacer:** correr los tests unitarios de a uno con `mvnw test -Dtest=NombreDelTest` (los de `services/` y `validation/` son Mockito puro y no tocan ninguna base), o correr `mvn test` únicamente con el perfil `test` activo (apunta a `bajonea_test`). Nunca `mvn test` a secas.
- **Origen:** tramo multi-comercio 1 (`docs/DECISIONES.md`, 2026-09-29).

---

## Frontend / herramientas

### `node --check` no detecta la redeclaración de `const` en archivos `.js` con `import`/`export`

- **Síntoma:** un `SyntaxError` (por ejemplo `const label` duplicado en la misma función) deja la pantalla en blanco en el navegador, pero `node --check archivo.js` pasa.
- **Causa:** sin un `package.json` de tipo módulo, la autodetección de ESM de Node no cubre ese caso puntual.
- **Qué hacer:** verificar copiando el archivo a `.mjs` y corriendo `node --check` sobre la copia, o confiando en la carga real en el navegador. Ver `docs/DECISIONES.md` (Tramo 16.27) y `docs/MAPEO-ARCHIVOS-TRAMO16.27.md`.

### Un heredoc de Bash puede colapsar las barras invertidas y fallar con comillas

- **Síntoma:** un archivo escrito con `cat > archivo <<'EOF'` desde la herramienta de Bash llegó con `\\p{L}` convertido en `\p{L}` (una barra de menos) y no compiló ("illegal escape character"); otros comandos largos con heredocs fallaron con "unexpected EOF while looking for matching".
- **Qué hacer:** escribir los archivos con la herramienta de escritura de archivos (o con un script que se guarde con ella) y no con heredocs; después de escribir un `.java` con expresiones regulares, compilar y mirar las barras. Al editar archivos con Python en Windows, leer y escribir con `newline=''` para no cambiar los finales de línea (los archivos del proyecto son CRLF en el árbol de trabajo).

### Cada contenedor de íconos necesita su propia regla de tamaño (no hay una global)

- **Síntoma:** un ícono SVG nuevo se ve bien en Chromium pero queda invisible (0×0) en iPhone.
- **Causa:** ningún SVG del proyecto tiene `width`/`height` como atributos, y `styles.css` no tiene un `svg { ... }` general: el tamaño sale de una regla `.contenedor svg { width; height }` por cada contenedor. WebKit renderiza en 0×0 un SVG con `viewBox` y sin tamaño; Chromium lo estira al ancho del contenedor y por eso no avisa. Caso real: la "X" de `.schedule-chip__remove` (2026-09-30).
- **Qué hacer:** al agregar un ícono en un contenedor nuevo (o generado por JS con `innerHTML`), agregar la regla `.contenedor svg` con su tamaño en el mismo cambio. Para chequearlo sin un iPhone: un observador de DOM que marque todo `svg` sin atributos `width`/`height` y sin ninguna regla CSS con `width`/`height` que le aplique (así se encontró el caso). Ver `docs/DECISIONES.md` (2026-09-30, "Arreglos para iPhone/Safari") y `docs/MAPEO-ARCHIVOS-TRAMO-FIX-IPHONE-WEBKIT.md`.

### Los campos de texto tienen que tener 16px o más (zoom de iOS)

- **Síntoma:** en iPhone, al tocar un campo la página hace zoom y queda ampliada.
- **Causa:** iOS Safari hace zoom al enfocar un `input`, `select` o `textarea` con `font-size` menor a 16px.
- **Qué hacer:** `.input-shell input`, `.select-shell select` y `.textarea-shell textarea` van en 16px (hecho el 2026-09-30); los campos nuevos fuera de esos contenedores (estilos inline incluidos) también. Subir el tamaño puede cambiar el ancho intrínseco del campo y desbordar filas flex: revisar las filas de 3 o más columnas.

### WebKit de Playwright no arranca con una directiva de Control de aplicaciones de Windows

- **Síntoma:** `browserType.launch: Host system is missing dependencies` (`ngtcp2.dll`, `libsharpyuv.dll`, `libxml2.dll`, `libegl.dll`), aunque los archivos están en la carpeta del navegador; con la validación salteada el proceso muere con `exitCode=3236495362`.
- **Causa:** Windows bloquea esas DLL ("Una directiva de Control de aplicaciones bloqueó este archivo"); se ve corriendo `PrintDeps.exe` (en `ms-playwright/winldd-*`) sobre cada DLL.
- **Qué hacer:** no es un problema del proyecto ni de Playwright; hace falta decidir si se ajusta la directiva en esa máquina o se corre WebKit en otra (Mac, Linux o CI). Mientras tanto, `--project=chromium`.

### Dos primeras vinculaciones simultáneas de MercadoPago del mismo Dueño

Medido el 2026-09-30 (`CASO=primera-vinculacion` en `testing/playwright/scripts/stress-locks-tramo2a.mjs`): con un Dueño sin fila en `cuenta_mercado_pago`, dos vinculaciones a la vez dan `200 + 409` (o `200 + 200` si la segunda ya ve la fila de la primera). El `409` sale del manejador genérico de violación de integridad por `uq_cuenta_mp_dueno`; nunca aparece un `500`, queda una sola fila y el estado de los comercios es coherente. El perdedor recibe un mensaje genérico ("Ya existe un registro con alguno de los datos ingresados"). Detalle en `docs/DECISIONES.md`, 2026-09-30 (Entrega B).

### Una edición con script que corta "desde un texto hasta otro" puede duplicar o perder media archivo

- **Síntoma:** al mover el paso Legales de `auth.js` con un script de Python que recortaba `s[:a] + nuevo + s[b:]`, el archivo quedó con la mitad duplicada (`initRegistroComercio` contenía el código del registro de Cliente). Pasó el chequeo de sintaxis, así que solo se vio al leer el resultado.
- **Causa:** el texto de cierre (`const passwordInput = …`) aparecía antes que el de inicio, en otra función; con `b < a` el recorte repite lo que está entre los dos. El archivo tenía cambios sin commitear, así que `git` no tenía de dónde restaurarlo.
- **Qué hacer:** en cualquier edición con script, buscar cada marcador desde la posición del anterior, afirmar `a < b` antes de recortar, copiar el archivo a un lugar temporal antes de tocarlo y mirar el `diff` contra la copia. Si ya se rompió y no hay commit: el historial de archivos de Claude Code guarda la versión anterior a la primera edición de la sesión (`~/.claude/file-history/<id de sesión>/<hash>@v1`; se identifica por tamaño y por contenido). Contar finales de línea con Python (`bytes.count(b'\r\n')`), no con `grep -c $'\r'`, que dio resultados distintos entre invocaciones. Ver `docs/DECISIONES.md` (2026-10-01, Entrega B del tramo 3).

### `addInitScript` vuelve a escribir el `localStorage` en cada navegación

- **Síntoma:** un test que arma la sesión con `abrirComoUsuario` (init script con el token de la API) y después inicia sesión por la pantalla de login queda con la sesión vieja en la siguiente carga, y el backend responde `401` ("Sesión cerrada"): el login por UI invalidó la sesión anterior de esa cuenta (sesión única) y el init script vuelve a poner el token viejo antes de que corra la página.
- **Qué hacer:** si un test necesita las dos cosas con la misma cuenta, usar un contexto de navegador nuevo para el login por UI (o no armar la sesión por init script en esa página). Con cuentas distintas no hay problema.

### Un `FOR UPDATE` por consulta no refresca una entidad que ya está cargada (open-in-view)

- **Síntoma esperado, no ocurrido:** al cerrar un comercio, `findByIdConBloqueo` (JPQL con `PESSIMISTIC_WRITE`) devolvía la instancia que la resolución de `X-Comercio-Id` ya había cargado, con el valor de `cerrado_manualmente` de antes de esperar el bloqueo: dos cierres simultáneos habrían visto `false` los dos y habrían escrito dos filas `CERRADO`.
- **Causa:** `spring.jpa.open-in-view` está en su valor por defecto (activo), así que el `EntityManager` de la request es el mismo en la resolución del comercio activo y en el servicio. Hibernate no pisa el estado de una entidad ya administrada con el resultado de una consulta; solo aplica el bloqueo.
- **Qué hacer:** tomar la entidad con `findById` y llamar a `entityManager.refresh(entidad, LockModeType.PESSIMISTIC_WRITE)`, que emite el `SELECT ... FOR UPDATE` y vuelve a hidratar el estado con lo último confirmado (patrón de `CierreComercioService.bloquearComercio`, ya usado en `PedidoService`). Calcular la hora de la operación **después** del bloqueo: si se calcula antes, una transacción que esperó puede escribir una `fecha_hora` anterior a la fila previa. Probado con `CierreComercioIntegrationTest` y con `stress-locks-tramoC1.mjs`.
- **`@DynamicUpdate` en `Comercio`:** sin él, un `save` de una entidad que se leyó sin bloqueo (por ejemplo `editarPerfil`) escribe todas las columnas, incluida `cerrado_manualmente` con el valor viejo, y pisa un cierre confirmado en el medio. Con él solo se escriben las columnas que cambiaron. `CierreComercioIntegrationTest.unSaveConUnaEntidadCargadaAntesDelCierreNoPisaLaBandera` falla si se quita la anotación.
- **Proyección nativa con `LOCK IN SHARE MODE`:** `ComercioRepository.leerEstadoConBloqueoCompartido` devuelve una interfaz (`EstadoYCierreComercio`) con alias en la consulta nativa; el `tinyint(1)` se convierte bien a `boolean`. MariaDB 10.4 no entiende el `FOR SHARE` que genera Hibernate, de ahí la consulta nativa (ver la entrada del tramo 5).

### El bloqueo de cuenta del login y el cierre manual se cruzaban en deadlock (tramo C2)

- **Síntoma:** `stress-locks-tramoC2.mjs`, escenario 2 (tres intentos fallidos del Dueño contra `cerrar`/`abrir` del mismo comercio): 19 de 48 logins respondían `500` (`Deadlock found when trying to get lock`) y, cuando perdían dos, el comercio quedaba en `APTO_VENTA` con el Dueño bloqueado. Venía desde el C1 (el bloqueo ya actualizaba los comercios), solo que ningún test lo cruzaba.
- **Causa:** el login toma la fila del `usuario` con `FOR UPDATE` y después escribe el comercio (usuario → comercio). `cerrar` tomaba el comercio con `FOR UPDATE` y después insertaba la fila de `historial_cierre_comercio`, cuya clave foránea `actor_usuario_id` pide bloqueo compartido sobre el `usuario` (comercio → usuario). Ciclo clásico de dos transacciones.
- **Regla:** quien va a escribir una fila con clave foránea a un usuario **y** a bloquear otra fila toma primero el usuario (`UsuarioRepository.leerIdConBloqueoCompartido`, consulta nativa `LOCK IN SHARE MODE`) y recién después la otra. La que llega segunda espera a que la primera termine; si ganó el bloqueo de cuenta, el comercio ya no es operativo y el cierre da `409`. La reapertura automática (`SISTEMA`, sin usuario) no lo necesita.
- **Comportamiento conocido, no se corrige (decisión del tramo C3):** cualquier otra transacción que tome un comercio `FOR UPDATE` y después escriba algo con clave foránea al usuario del Dueño (la suspensión de un comercio por el Administrador, que notifica al Dueño) puede cruzarse con el tercer intento fallido de ese mismo Dueño. La ventana es de milisegundos y nunca apareció en el estrés; el arreglo sería el mismo (tomar el usuario antes).

### Bloquear todos los comercios del Dueño en el bloqueo de cuenta no es la solución (tramo C2)

- Lo pedía la intención de "decidir con lo último confirmado" y está documentado como trampa en la entrada del tramo 2A: una lectura `FOR UPDATE` de todos los comercios del Dueño espera la fila de un comercio pendiente que la aprobación ya tiene mientras la aprobación espera el `usuario` (que el login tiene bloqueado) para la notificación.
- **Qué se hace en cambio** (`ComercioService.cerrarTemporalmentePorBloqueoDeCuenta`): los candidatos salen de una lectura común (foto) y cada uno se vuelve a leer con `refresh` + `PESSIMISTIC_WRITE` por clave primaria. Un `APROBADO` de la foto entra como candidato por si una vinculación de Mercado Pago lo acaba de pasar a `APTO_VENTA`; un `APTO_VENTA` de la foto que una desvinculación acaba de pasar a `APROBADO` no se toca. Nunca se bloquea un comercio pendiente. El escenario 5 del estrés (aprobar un comercio pendiente contra el bloqueo) lo confirma sin deadlocks.

### Dos confirmaciones simultáneas del mismo código de recuperación restauraban dos veces (tramo C2)

- **Síntoma:** escenario 4 del estrés: tres `POST /auth/recuperar-password/confirmar` en paralelo con el mismo código respondían `200` las tres y cada comercio del Dueño recibía tres filas `CERRADO_TEMPORALMENTE → APTO_VENTA` (historial con la cadena rota).
- **Causa:** `confirmarRecuperacionPassword` leía el código pendiente con una lectura común: las tres transacciones lo veían pendiente antes de que la primera lo marcara usado.
- **Arreglo:** tomar primero la fila del usuario con `findByEmailConBloqueo` (mismo patrón y mismo orden que el login). La segunda y la tercera esperan, encuentran el código usado y responden `401` "Código incorrecto o vencido". Si el email no existe no hay fila que bloquear y sigue el mismo error genérico. **El mismo defecto estaba en `confirmarReactivacionCuenta`** (restaura los comercios `INACTIVO` con el mismo patrón) y se corrigió en el tramo C3 con el mismo arreglo (ver la entrada "Reactivación de cuenta: la confirmación también se serializa por usuario").

### Reactivación de cuenta: la confirmación también se serializa por usuario (tramo C3)

- **Síntoma esperado (mismo que el de la recuperación, tramo C2):** tres `POST /auth/reactivar-cuenta/confirmar` simultáneos con el mismo código respondían `200` y restauraban los comercios `INACTIVO` varias veces, con filas de historial duplicadas.
- **Arreglo:** `AuthService.confirmarReactivacionCuenta` toma primero la fila del usuario (`findByEmailConBloqueo`, `SELECT ... FOR UPDATE`) y recién después lee el código. La segunda y la tercera esperan, encuentran el código usado y responden `401`; hay una sola restauración y una sola fila `INACTIVO → APTO_VENTA` (o `APROBADO`) por comercio. Medido con el escenario 1 de `stress-locks-tramoC3.mjs` (12 rondas, tres confirmaciones simultáneas: siempre `200,401,401`).
- **Tests:** `AuthServiceBloqueoComercioTest` (el bloqueo de fila va antes de leer el código, con `inOrder`), `BloqueoVigenteIntegrationTest` (una segunda confirmación da `401` y el historial queda en una fila) y el spec `34`.

### Regla del bloqueo vigente: leer el estado del Dueño con bloqueo antes de la cuenta de cobro y el comercio (tramo C3)

- **Regla de negocio:** con la cuenta del Dueño `BLOQUEADO`, ningún camino puede dejar un comercio en `APTO_VENTA`. La aprobación del Administrador (con cuenta de Mercado Pago activa) y la vinculación de Mercado Pago (sobre los `APROBADO`) dejan el comercio en `CERRADO_TEMPORALMENTE`; un comercio que no llegaría a `APTO_VENTA` (un `APROBADO` sin cuenta de cobro) no cambia. Al desbloquear, la restauración de siempre lo pasa a `APTO_VENTA`/`APROBADO` según la cuenta activa.
- **Orden de bloqueo ampliado:** `usuario` → `cuenta_mercado_pago` → `comercio` → tablas hijas. `ComercioService.duenoBloqueadoConBloqueo` lee el estado con una consulta nativa `LOCK IN SHARE MODE` (`UsuarioRepository.leerEstadoConBloqueoCompartido`; devuelve lo último confirmado, no la foto de la transacción) y los tres llamadores la invocan **antes** de tomar la cuenta: `AdministradorService.resolverAprobacion` (solo al aprobar), `MercadoPagoOAuthService.procesarCallback` y el atajo de test `TestSupportService`. `ComercioService.activarAptoVenta` recibe el resultado como parámetro (no lo relee) para que nadie pueda olvidar el orden.
- **Por qué antes y no dentro de `activarAptoVenta`:** una lectura tardía del usuario (con la cuenta o el comercio ya bloqueados) vuelve a poner un bloqueo "hacia atrás". En InnoDB un pedido de bloqueo compartido que llega detrás de un `FOR UPDATE` ya en espera se encola, así que una vinculación con la cuenta bloqueada que pidiera el usuario tarde podría formar el ciclo aprobación → vinculación → login → aprobación. Es razonamiento sobre el orden de la cola; no se reprodujo, se evitó. Con la lectura al principio, además, desaparece la forma del deadlock documentado en el tramo 2A (la aprobación con el comercio bloqueado esperando el `usuario` para la notificación): ahora la aprobación ya tiene el `usuario` compartido cuando llega a la notificación.
- **Historial coherente:** la aprobación con el Dueño bloqueado deja dos filas (`PENDIENTE → APROBADO` del Administrador y `APROBADO → CERRADO_TEMPORALMENTE` automática, motivo "Bloqueo de cuenta vigente al aprobar"); la vinculación deja una (`APROBADO → CERRADO_TEMPORALMENTE`, "Bloqueo de cuenta vigente al vincular Mercado Pago"). No se escribe el paso intermedio por `APTO_VENTA` porque el comercio nunca estuvo ahí; la cadena (cada fila sale de donde terminó la anterior) se mantiene.
- **Cruce con el login:** el bloqueo por intentos fallidos toma el `usuario` con `FOR UPDATE`, y su lectura común posterior (la sesión activa) establece la foto de la transacción **después** de esa espera, así que ve lo que la aprobación o la vinculación ya confirmaron y lo cierra; si gana el bloqueo de cuenta, la aprobación lo ve `BLOQUEADO`. En los dos órdenes el comercio termina en `CERRADO_TEMPORALMENTE`.
- **Medido con `stress-locks-tramoC3.mjs`** (12 rondas por escenario): aprobaciones contra el bloqueo, vinculación contra el bloqueo, las tres cosas a la vez sobre el mismo Dueño, y un control con el Dueño activo (tres aprobaciones simultáneas siempre terminan `APTO_VENTA` con las dos filas de siempre). Invariante revisada en cada ronda con una consulta sobre toda la base: ningún comercio `APTO_VENTA` con el Dueño `BLOQUEADO`. Sin ningún `5xx` ni deadlock.


### Aceptar una invitación: insertar y capturar el choque, no leer con `FOR UPDATE` una fila que puede no existir (tramo E1, bloque A3)

- **Riesgo:** un `SELECT ... FOR UPDATE` por una clave que todavía no existe toma, bajo `REPEATABLE READ`, un bloqueo de intervalo (gap lock) y no uno de registro. Dos aceptaciones simultáneas de personas distintas toman el mismo intervalo de `empleado` o de `empleado_comercio` (el índice único `uq_empleado_comercio`) y después las dos insertan en él: cada una espera el intervalo de la otra y la base responde interbloqueo (`1213`). Con la tabla vacía, todas las altas caen en el mismo intervalo.
- **Arreglo:** `EmpleadoInsercionRepository` inserta por JDBC y captura `DuplicateKeyException` ("insertar y, si ya existe, no hacer nada"). Solo cuando el `INSERT` chocó se lee la fila existente con `FOR UPDATE`, ya por clave exacta (bloqueo de registro, sin intervalo) para reactivarla. Un `INSERT` duplicado por JDBC revierte únicamente su sentencia; un `save` de JPA marcaría la transacción como rollback-only (mismo motivo que `TokenInsercionRepository` e `InvitacionInsercionRepository`).
- **Detalle:** antes de insertar por JDBC hay que vaciar el contexto de persistencia (`flush`): `persona_fisica` y `cliente` tienen id asignado y Hibernate los escribe recién al vaciar, y `empleado` tiene una clave foránea hacia ellos.
- **Dos aceptaciones del mismo invitado en comercios distintos** se serializan por la fila de `usuario` del invitado (`FOR UPDATE`, tomada antes que las invitaciones), de modo que la segunda ve la fila de `empleado` que creó la primera sin necesitar ninguna lectura con bloqueo de una fila ausente.

### Leer antes de bloquear con proyecciones, no con entidades (tramo E1, bloque A3)

- Aceptar necesita conocer al Dueño antes de bloquear las invitaciones (el orden es `usuario` primero), así que lee las pendientes del email sin bloqueo. Esa lectura previa devuelve una proyección (`InvitacionPendienteVista`) y el id del invitado (`UsuarioRepository.findIdByEmail`), nunca entidades: una entidad ya cargada haría que la lectura posterior con `FOR UPDATE` devuelva la copia vieja del contexto de persistencia y no el estado confirmado (ver "Un `FOR UPDATE` por consulta no refresca una entidad que ya está cargada").
- Si entre la lectura previa y el bloqueo la invitación cambió (la reemplazó otra transacción), la rutina la trata como un código incorrecto en vez de bloquear filas fuera de orden.

### Un `409` de aceptar revierte todo, y por eso el estado del comercio se comprueba con la relación ya tocada (tramo E1, bloque A3)

- Solo `CodigoInvitacionInvalidoException` está en `noRollbackFor` de `validar` y `aceptar`: el contador de intentos tiene que sobrevivir al `401`. Cualquier otro error (`InvitacionNoAptaException`, `ConflictoDeNegocioException`, `ValidacionCamposException`) revierte la transacción completa, incluida la cuenta nueva ya escrita. Para respetar el orden de bloqueo `usuario` → invitaciones → `empleado_comercio` → `comercio`, el estado del comercio se lee con `LOCK IN SHARE MODE` después de tocar la relación, y un comercio no aceptable deshace las altas por rollback (la prueba `conElComercioEnUnEstadoNoPermitidoDa409YElRollbackNoDejaNadaConfirmado` lo verifica con datos confirmados de verdad; una prueba dentro de una transacción de test no puede, porque ve sus propias escrituras).

### El MariaDB local de test no tiene `STRICT_TRANS_TABLES` (tramo E1, bloque A3)

- **Síntoma:** un valor de `ENUM` inválido (por ejemplo un estado mal escrito en un `INSERT` por JDBC) se guarda como cadena vacía en vez de fallar.
- **Qué hacer:** no confiar en esa conducta ni en que "pasa en test". Verificar `SELECT @@sql_mode` en el servidor de producción (y en `bajonea_practicas3`) antes de desplegar: con el modo estricto un `INSERT` así falla. Los valores de `ENUM` de las altas por JDBC (`EmpleadoInsercionRepository`, `InvitacionInsercionRepository`) están escritos como literales o con `Enum.name()`, y los tests leen el estado de vuelta para detectarlo.

### Un `SELECT ... FOR UPDATE` por rango sobre un índice único parcial se interbloquea con el `UPDATE` que cambia la columna generada (tramo E1, bloque A5b)

- **Síntoma:** el estrés de E1 (escenarios S2 y S7) dio `500` con `Deadlock found when trying to get lock` en `validar` y `aceptar` de invitaciones: dos aceptaciones simultáneas del mismo código (un `200` y un `500` en vez de `200` y `401`) y veinte códigos erróneos en paralelo. No aparecía en las pruebas de Java de A3 (dos hilos) ni en Newman: hacen falta varias transacciones sobre el mismo email al mismo tiempo.
- **Causa:** `resolver` bloqueaba las invitaciones con `SELECT ... WHERE email = ? AND estado = ? FOR UPDATE`. Para esa consulta MariaDB elige uno de los índices que empiezan por `email` (`uq_inv_pendiente_email_codigo` en el caso medido) y toma bloqueos de siguiente clave y de hueco. El `UPDATE` que pasa una invitación a `INVALIDADA` o `ACEPTADA` mueve su entrada en los índices únicos de `V30` (la columna generada `pendiente_clave` pasa a `NULL`), y para insertar la entrada nueva necesita un bloqueo de intención de inserción en un hueco que otra transacción ya tiene bloqueado mientras espera el registro de la primera. `SHOW ENGINE INNODB STATUS` lo mostró así: la transacción que invalida mantiene el registro y espera el hueco; la otra mantiene el hueco y espera el registro.
- **Arreglo:** bloquear por clave primaria. `validar` y `aceptar` leen sin bloqueo los ids de las pendientes vigentes (la proyección que ya tenían) y las bloquean con `findByIdInConBloqueo` (`WHERE id IN :ids ORDER BY id`): bloqueo de registro por clave, sin huecos, y siempre en id ascendente. La transacción que llega después solo espera.
- **Segundo cruce del mismo tipo:** invitar y reenviar del Dueño (`findByComercioIdAndEmailAndEstadoConBloqueo`) hacían el mismo rango por el índice único del par: tomaban el índice y después la clave primaria, al revés que el `UPDATE` de un código erróneo (clave primaria y después índice). Apareció al agregar el escenario S12 del estrés (códigos erróneos que invalidan contra reenviar e invitar). Ahora el método lee los ids sin bloqueo y bloquea por clave primaria igual que el otro. No hay riesgo de una fila nueva entre las dos lecturas: solo invitar y reenviar crean invitaciones del par y las dos empiezan bloqueando la fila del Dueño.
- **Qué recordar:** en este esquema, cuando una fila tiene índices únicos parciales sobre una columna generada, cualquier lectura con bloqueo por rango sobre esos índices choca con las transiciones de estado de esa fila. Bloquear siempre por clave primaria y en orden ascendente, y comparar el orden "índice, clave primaria" contra el orden "clave primaria, índice" del `UPDATE`. Pruebas: `veinteCodigosErroneosEnParaleloConElCorrectoMezcladoInvalidanSinInterbloqueos` y `codigosErroneosQueInvalidanContraReenviarEInvitarDelDuenoNoSeInterbloquean` en `InvitacionEmpleadoAceptacionIntegrationTest` (fallan con 14 interbloqueos si se vuelve al bloqueo por rango) y los escenarios S2, S7 y S12 de `stress-locks-empleado-e1.mjs`.
### Un estado que se calcula al listar y también se materializa no se puede filtrar por estado (tramo E1, bloque A7)

- **Síntoma:** en "Ver equipo" una invitación vencida desaparecía de la lista en vez de verse como "Vencida" apenas el Dueño volvía a invitar o reenviar a ese email.
- **Causa:** "vencida" existe de dos formas: calculada (la fila sigue `PENDIENTE` con la fecha pasada y el DTO la informa como `VENCIDA`) y materializada (al invitar o reenviar, la rutina de envío la guarda como `VENCIDA`). El listado traía solo las filas en `PENDIENTE` e `INVALIDADA`, así que la forma calculada se veía y la materializada no; además reenviar dejaba la anterior en `REEMPLAZADA`, también oculta.
- **Qué recordar:** cuando un estado tiene versión calculada y versión guardada, el filtro de la consulta tiene que incluir ambas, y lo que se quiere mostrar es "el último de cada clave" (acá, `id = (SELECT MAX(id) ... WHERE email = i.email)`), no "las filas en tal estado". Una fila anterior ya reemplazada por otra más nueva no tiene que seguir apareciendo ni ocultar a la nueva.
- **Corolario:** un estado "de reemplazo" (`REEMPLAZADA`) no debe pisar la causa original de una fila cerrada (`INVALIDADA`, `VENCIDA`): se pierde la explicación de por qué la persona no pudo aceptar. Solo la pendiente todavía vigente queda reemplazada.

> **Actualización (bloque A8):** la doble forma de "vencida" de este aprendizaje se redujo a una sola en lo que importa: desde A8 "Vencida" es un estado guardado que asigna un proceso automático cada minuto. La versión calculada al listar y la materialización al invitar o reenviar quedan solo como red de seguridad por si el proceso se atrasa; el criterio del listado ("el último de cada clave", sin filtrar por una única forma del estado) sigue siendo el correcto.

### Un proceso que cambia el estado de muchas filas no puede bloquear por rango: ids sin bloqueo y después `UPDATE` por clave primaria (tramo E1, bloque A8)

- **Contexto:** el vencimiento automático de invitaciones (`InvitacionVencimientoJob`) tenía que pasar a `VENCIDA` toda `PENDIENTE` con `fecha_vencimiento <= ahora`. El `UPDATE ... WHERE estado = 'PENDIENTE' AND fecha_vencimiento <= ?` directo toma bloqueos por rango sobre los índices de la tabla, justo el patrón que se interbloqueaba con aceptar, invitar y reenviar (ver el aprendizaje del bloque A5b).
- **Decisión:** lectura sin bloqueo de los ids vencidos (lotes de 500, orden ascendente) y un único `UPDATE ... WHERE id IN (:ids) AND estado = 'PENDIENTE' AND fecha_vencimiento <= :ahora SET estado = 'VENCIDA', fecha_resolucion = fecha_vencimiento` por lote. Los filtros se repiten en el `UPDATE` porque es una lectura actual: si aceptar, cancelar, reenviar o un código erróneo cambiaron la fila entre las dos consultas, el `UPDATE` la salta; por eso es idempotente y no hace falta coordinar instancias. Los bloqueos son de registro, por clave primaria y en id ascendente, igual que `findByIdInConBloqueo`.
- **Borde con aceptar:** `aceptar` revalida estado y vigencia con la fila ya bloqueada y con su propio `ahora`. Si el proceso gana, aceptar ve `VENCIDA` y da el mismo `401`; si aceptar gana, el `UPDATE` ve `ACEPTADA` y no toca nada. Cubierto por `elProcesoYAceptarEnElBordeDeLaVigenciaDejanSiempreUnEstadoCoherente` (Java) y el escenario S13 del estrés.
- **Comparación:** `fecha_vencimiento <= ahora` es el complemento exacto de `fecha_vencimiento.isAfter(ahora)` que usa el servicio; el reloj es el `Clock` de la aplicación, el mismo con el que se escribe la fecha, nunca `NOW()` de la base.
- **Observación:** la consulta de ids recorre la tabla (no hay un índice por `(estado, fecha_vencimiento)`); con el volumen esperado de invitaciones no se justifica una migración.

### Una validación del DTO base alcanza a todos los que lo usan, anidados incluidos (tramo E1, bloque A7)

- **Síntoma:** al aceptar una invitación con una cuenta nueva de 13 años aparecía el mensaje de 14 años del registro de Cliente ("Tenés que tener al menos 14 años para registrarte"), un texto que no corresponde a ese flujo.
- **Causa:** `@EdadMinima(anios = 14)` estaba en `DatosClienteRequestDTO`, que comparten el registro de Cliente y el campo anidado `cuentaNueva` de la invitación (`@Valid`); el DTO se valida antes que el servicio, así que la regla de 14 ganaba a la de 18.
- **Arreglo:** la regla de 14 salió de la clase base y vive en un getter sobrescrito de `RegistroClienteRequestDTO.getFechaNacimiento()` (la anotación ahora admite `METHOD`); Hibernate Validator suma las restricciones de un getter sobrescrito (se puede agregar una condición sobre el valor devuelto, no quitar una heredada) y la ruta del error sigue siendo `fechaNacimiento`. Si una regla es propia de un solo flujo, no va en el DTO que otros reutilizan.

---

### Una fila de historial con claves foráneas a `usuario` y `comercio` se interbloquea con el bloqueo de cuenta si el usuario no se toma primero (tramo E3, bloque A1)

- `historial_edicion_comercio` tiene claves foráneas a `comercio` y a `usuario`: el `INSERT` toma un bloqueo compartido sobre las dos filas padre (primero la del comercio, que es la primera clave declarada). El bloqueo de cuenta por intentos fallidos del login toma el usuario del Dueño con `FOR UPDATE` y después pide el comercio. Una escritura que toma el comercio (o lo escribe, como `editarPerfil`) y recién al registrar pide el usuario queda esperando al login, que a su vez espera al comercio: interbloqueo.
- Regla: quien escribe y va a registrar toma **primero** la fila del usuario que actúa con `LOCK IN SHARE MODE` (`HistorialEdicionComercioService.iniciarEscritura`, primera instrucción de cada escritura auditada). Es el mismo patrón que el cierre manual del comercio y el orden global de `docs/CONCURRENCIA-Y-TRANSACCIONES.md`.
- La prueba `HistorialEdicionComercioLockIntegrationTest` simula el login (toma el usuario y después el comercio) mientras otro hilo edita el perfil. Se verificó que muerde: sin la línea de `iniciarEscritura` en `editarPerfil` falla con `Deadlock found when trying to get lock`; con la línea las dos transacciones terminan.
- **Segundo cruce, por mejora de bloqueo (encontrado por el estrés, no por la prueba anterior):** Hibernate difiere los `UPDATE` de las entidades modificadas hasta el flush del commit, pero el `INSERT` de una entidad con id autogenerado se ejecuta en el acto. Si una escritura modifica el comercio (`editarPerfil`) y registra después en el historial, el orden real en la base es `INSERT` (bloqueo **compartido** sobre el comercio por la clave foránea) y recién después `UPDATE comercio` (bloqueo **exclusivo**). Dos transacciones así se quedan cada una con el compartido esperando el exclusivo: `Deadlock found`. También se cruza con `cerrar`, `abrir` y el bloqueo de cuenta, que piden el exclusivo del comercio. Regla: antes de insertar una fila con clave foránea al mismo padre que la escritura va a modificar, volcar la escritura pendiente (`entityManager.flush()`); `HistorialEdicionComercioService.registrar` lo hace por todos. Probado con seis hilos editando el perfil a la vez (falla sin el volcado, pasa con él) y con `stress-locks-tramoE3-A1.mjs` (255 deadlocks antes, 0 después).
- `registrar` e `iniciarEscritura` son `Propagation.MANDATORY`: llamarlos sin transacción en curso es un error (el registro nunca se escribe por su cuenta, siempre en la transacción de la escritura que audita).

### Los nombres de clave foránea son únicos por base, no por tabla; los prefijos de abreviatura se agotan (tramo E3, bloque A1)

- El diccionario proponía `fk_hec_comercio` y `idx_hec_*` para `historial_edicion_comercio`, pero `fk_hec_comercio` ya existe en `historial_estado_comercio` (V1) y MariaDB exige nombres de restricción únicos en toda la base (los de índice solo por tabla). V31 ya había tenido que usar `hec2`. `V32` usa `hed`. Antes de nombrar restricciones en una migración nueva: `grep -rhoE "(fk|ck|uk)_[a-z0-9]+_" backend/src/main/resources/db/migration | sort | uniq -c`.

### Paginar por cursor una lista que mezcla varias tablas: el orden total necesita un desempate por fuente (tramo E3, bloque A1)

- La actividad del comercio mezcla tres historiales. El orden es `(fecha_hora desc, fuente, id desc)`: dos filas de tablas distintas pueden tener la misma fecha (columnas `datetime` sin fracciones) y sin un desempate fijo el cursor repetiría o saltearía filas en el límite de una página. El cursor lleva `(fecha, fuente, id)` de la última fila entregada; cada tabla se consulta con `fecha < F o (fecha = F y id <= M)`, donde `M` es el mayor id aún no entregado de esa fuente en la fecha del cursor (todo si la fuente va después de la del cursor, nada si va antes, `id - 1` si es la misma) y un tope de `limite + 1`. Las primeras `limite + 1` filas del total siempre están entre las primeras `limite + 1` de alguna fuente, así que tres consultas por página alcanzan. Probado recorriendo con límites de 1 a 4 sobre filas empatadas.

### Spring Boot ignora las propiedades desconocidas del JSON; `@JsonIgnoreProperties(ignoreUnknown = false)` no lo cambia (tramo E3, bloque A2)

Para que un cuerpo rechace los campos que no conoce (el Empleado que manda `nombre` o `emailContacto` a la ruta de datos operativos no puede recibir un 200 que los descarte en silencio), no alcanza con anotar la clase: `ignoreUnknown = false` es el valor por defecto de la anotación y no pisa la configuración global del `ObjectMapper` (`FAIL_ON_UNKNOWN_PROPERTIES` apagado en Spring Boot). La solución del proyecto es recoger las propiedades desconocidas con `@JsonAnySetter` en un mapa `@JsonIgnore` y exponer un `@AssertTrue` (`isSoloDescripcionYTelefono`) que falla si el mapa no está vacío: el `MethodArgumentNotValidException` ya existente lo traduce a `400`. Ver `ComercioDatosOperativosRequestDTO`.

### Leer con bloqueo compartido y después escribir la misma fila es una mejora de bloqueo: dos transacciones iguales se interbloquean (tramo E3, bloque A2)

Para aplicar el guard de suspensión del Empleado, la primera idea fue leer el estado del comercio con `LOCK IN SHARE MODE` y después actualizar la misma fila (`editarDatosOperativos` escribe el comercio). Con dos ediciones a la vez cada una queda con el bloqueo compartido esperando que la otra lo suelte para tomar el exclusivo. Se reprodujo con `stress-locks-tramoE3-A2.mjs` (escenario 4): 126 `Deadlock found` y `500` en `cerrar`, `abrir` y la edición. Regla: una operación que va a escribir el comercio lo toma con `FOR UPDATE` directo (`refresh` con `PESSIMISTIC_WRITE`) y valida el estado sobre esa fila; el bloqueo compartido solo se usa cuando la operación no escribe el comercio (productos, imágenes y aceptar un pedido, donde únicamente los inserts de historial toman un compartido sobre sus claves foráneas, compatible con otro compartido).

### Un `INSERT` con clave foránea antes de un `UPDATE` diferido de la misma fila es una mejora de bloqueo escondida: revisar las operaciones que escriben un comercio y guardan su historial (tramo E3, bloque A2)

`AdministradorService.suspenderComercio` hacía `comercio.setEstado(...)`, `save(comercio)` y `save(historial)`. El `save` de la entidad no escribe: Hibernate difiere el `UPDATE` hasta el `flush`; el `INSERT` del historial sí sale antes (id autoincremental) y su clave foránea toma un bloqueo compartido sobre el comercio; cuando el `UPDATE` sale, pide el exclusivo. Dos transacciones así (o esta y una que toma el comercio `FOR UPDATE`) se interbloquean. Receta: tomar el comercio `FOR UPDATE` (`refresh` con `PESSIMISTIC_WRITE`) como primera lectura de la operación, o volcar (`flush`) antes del `INSERT` del historial como hace `HistorialEdicionComercioService.registrar`. Se descubrió con el estrés de A2 y el informe de `SHOW ENGINE INNODB STATUS` (sección `LATEST DETECTED DEADLOCK`), que sigue disponible después de la corrida.

### Cómo probar una carrera contra una desactivación que todavía no existe: una sesión de MySQL que retiene la fila (tramo E3, bloque A2)

La desactivación real del Empleado llega en E4. Para probar hoy que las escrituras delegadas la esperan, el estrés abre una sesión de `mysql.exe` aparte que toma `empleado_comercio` con `FOR UPDATE`, duerme 1,5 segundos, la pasa a `INACTIVO` y confirma (`desactivarMientrasOpera`). Las escrituras HTTP que llegan en ese lapso pasan el resolver (lee sin bloqueo y ve `ACTIVO`) y se quedan esperando en la revalidación de la transacción; al despertar ven `INACTIVO` y responden 404. Sin la revalidación, las mismas escrituras terminan en 200 y el estrés lo reporta. Es determinista y no depende de acertar una ventana de milisegundos. El atajo de test `cambiarEstadoRelacionEmpleado` toma la relación `FOR UPDATE` por el mismo motivo.

### Un solo reloj para lo que se guarda y se compara: probar la zona con un segundo backend en otra zona de la JVM (tramo E3, bloque A2b)

- **Regla:** toda hora que se escribe y se compara contra otra escrita (historiales, `fecha_creacion` y plazos de los pedidos, invitaciones, horarios de los comercios) sale del bean `Clock` (`ClockConfig`, propiedad `app.zona-horaria`, por defecto `America/Argentina/Ushuaia`). Un `LocalDateTime.now()` suelto usa la zona de la JVM: sirve mientras la JVM esté en la misma zona y se rompe en silencio en otro servidor. Ejemplo real encontrado: `MercadoPagoPagoService` restaba `pedido.getFechaCreacion()` (reloj único) a `LocalDateTime.now()` (JVM).
- **Cómo se audita:** listar las columnas que salen del `Clock`, buscar cada lector (`getFechaCreacion()`, `getFechaHora()`, consultas con `fecha_*`) y cada `NOW()`/`current_timestamp` (los `DEFAULT current_timestamp()` de algunas tablas no se usan porque las inserciones mandan la fecha). Un valor que solo se guarda y se muestra puede seguir en la zona de la JVM.
- **Cómo se prueba la zona:** un test de unidad con un `Clock` fijo en una zona lejana (`PedidoServiceRelojTest`, `Pacific/Auckland`) y, para la integración, un segundo backend de test con la JVM en otra zona: `./mvnw spring-boot:run -Dspring-boot.run.profiles=test "-Dspring-boot.run.jvmArguments=-Duser.timezone=UTC" -Dspring-boot.run.arguments=--server.port=8082` y el spec 43 con `E2E_API_BASE_URL=http://localhost:8082/api/v1`. Con la escritura del historial de pedidos en `LocalDateTime.now()` suelto, el test de orden entre fuentes falla (la fila del pedido sale 3 horas "en el futuro"); con el `Clock`, pasa. Los procesos automáticos se disparan con `ahora=` calculado en la zona de la aplicación (`Date.now() - 3 h`), no con la zona de quien corre la prueba.
- **No migrar filas:** al cambiar la zona de un entorno con datos en otra zona, solo los pedidos en vuelo se ven desplazados esas horas, de forma transitoria.

### `mysql.exe` en Windows devuelve `\r\n`: cortar con `/\r?\n/` en los scripts de Node (tramo E3, bloque A2b)

- **Síntoma:** el estrés comparaba el conjunto de ids de la API con el de `mysql.exe` y reportaba "faltan" y "sobran" las mismas filas.
- **Causa:** `split('\n')` deja un `\r` pegado a cada id menos el último (`execFileSync(...).trim()`).
- **Qué hacer:** `split(/\r?\n/)` siempre que se parsee la salida de `mysql.exe` desde Node.

### Estrés de una lista paginada por cursor: qué se puede afirmar y cómo se mide el volumen (tramo E3, bloque A2b)

- **Qué se afirma con escrituras en paralelo:** (1) ningún id se repite en un recorrido; (2) el orden es el total `(fecha desc, fuente, id desc)`; (3) toda fila que ya existía al empezar el recorrido aparece (las nuevas van arriba, no se garantiza verlas); (4) con todo quieto, el recorrido es exactamente el conjunto visible en la base, con cualquier límite. Se comparan contra una consulta SQL independiente que repite la regla de visibilidad.
- **Volumen sintético:** `INSERT ... SELECT` sobre el motor de secuencias de MariaDB (`seq_1_to_N`) con horas repetidas a propósito (30000 pedidos sobre 5000 minutos: muchos empates entre pedidos y entre fuentes); se borra al terminar. Con 30000 pedidos y 90302 filas visibles: 256 ms de mediana por página de 100 filas, 444 ms en el percentil 95; seis lectores en paralelo, 1,1 s de mediana. El costo de una página crece con el historial del comercio (recorre y ordena todas sus filas) y es CPU de la base, no bloqueos.

### Un borrado derivado (`deleteBy...`, `delete(entidad)`) borra por id lo que cargó con la foto de la transacción: si otra transacción ya lo borró, falla (mini-tramo del carrito de E3)

- **Qué pasa.** `deleteByCarritoId` carga los ítems con una lectura común (la foto de `REPEATABLE READ`) y emite un `DELETE ... WHERE id = ?` por cada uno. Si otra transacción ya los borró y confirmó, el `DELETE` afecta 0 filas y Hibernate lanza `StaleObjectStateException` (Spring: `ObjectOptimisticLockingFailureException`) en el flush, que puede ser mucho después, en la próxima consulta o en el commit. La transacción entera se revierte. Aquí fue el pago aprobado de un pedido: el pedido quedaba `PENDIENTE_PAGO` aunque el pago estuviera aprobado en Mercado Pago.
- **Qué hacer.** Un `@Modifying @Query("DELETE FROM ... WHERE ...")` en bloque: es una lectura actual y con 0 filas devuelve 0. Sin `clearAutomatically` si la transacción sigue usando entidades (limpiar el contexto las deja desconectadas); con `flushAutomatically`.
- **Cuándo se fija la foto.** Con `REPEATABLE READ`, en la primera lectura **común** de la transacción (una lectura con `FOR UPDATE` o `LOCK IN SHARE MODE` y una escritura no la fijan). El webhook de Mercado Pago empieza con `buscarPorPedido` (lectura común) y llama a Mercado Pago (hasta 5 s) **antes** de bloquear el pedido: su foto es vieja cuando llega a vaciar el carrito.
- **Bloquear solo no alcanza.** Bloquear la fila `carrito` y dejar el borrado derivado también falla: tras el bloqueo, la lectura de los ítems sigue siendo la foto. Y las sentencias en bloque sin bloqueo dejan la decisión (¿el carrito sigue siendo del comercio de este pedido?) sobre una foto vieja. Se necesitan las dos (ver `docs/CONCURRENCIA-Y-TRANSACCIONES.md`, §4).
- **Cómo se probó que las dos hacen falta.** Mutaciones aplicadas y revertidas: bloqueo sin sentencias en bloque, 3 pruebas de integración fallan; sentencias en bloque sin bloqueo, 4 fallan; el código original, 11 de 13. El arnés "pago con foto temprana" fija la foto antes de que la otra operación confirme, como el webhook.
- **Origen:** mini-tramo del carrito de E3 (`docs/DECISIONES.md`, 2026-10-14).

### Crear una fila única bajo concurrencia: `INSERT ... ON DUPLICATE KEY UPDATE` como primera sentencia (mini-tramo del carrito de E3)

- **Riesgo.** El carrito se crea en el primer acceso de cada Cliente. Un `SELECT ... FOR UPDATE` sobre una clave ausente toma un bloqueo de intervalo, y dos primeras llamadas simultáneas se interbloquean al insertar; un `save` da error de clave duplicada; una lectura común antes fija la foto y la lectura posterior de la fila recién creada por otra transacción no la ve (`Cliente no encontrado` falso, reproducido en una prueba).
- **Qué hacer.** `INSERT ... ON DUPLICATE KEY UPDATE cliente_id = cliente_id` por JDBC (`CarritoInsercionRepository`) como primera sentencia, y recién después el `SELECT ... FOR UPDATE` que carga la entidad (más `refresh` con `PESSIMISTIC_WRITE` si la entidad ya está en el contexto). Sobre una fila existente toma un bloqueo exclusivo, no uno compartido que haya que mejorar, así que las llamadas se encolan. No lee, no fija la foto.
- **Otras operaciones de lectura** (`verCarrito`) que no encuentran la fila hacen la misma secuencia; una lectura común posterior a la creación no sirve.

### Probar el webhook y la sincronización de Mercado Pago sin Mercado Pago: `MERCADOPAGO_API_BASE_URL` y un servidor local (mini-tramo del carrito de E3)

- `MercadoPagoPagoService` lee la base de la API de `${MERCADOPAGO_API_BASE_URL:https://api.mercadopago.com}` (el valor por defecto está en el código; `application.properties` no cambia). Con la variable de entorno apuntando a un servidor local que responde `POST /checkout/preferences`, `GET /v1/payments/{id}` y `GET /v1/payments/search`, los caminos reales (`procesarNotificacion`, `sincronizarPago`, "Ir a pagar") corren con su lectura inicial, su demora y su bloqueo posterior, sin red.
- Java: `CarritoVaciadoWebhookIntegrationTest` levanta un `com.sun.net.httpserver.HttpServer` y lo registra con `@DynamicPropertySource`. Estrés: `stress-locks-tramoE3-carrito.mjs` levanta su servidor Node en `MP_STUB_PORT` (9099) y el backend de test se arranca con `MERCADOPAGO_API_BASE_URL=http://localhost:9099`. Newman y Playwright usan el atajo de test `PUT /test/pedidos/{id}/pago-aprobado`, que recorre `confirmarPagoAprobado` pero no la lectura inicial ni la llamada a Mercado Pago.
- **No definir esa variable en el servidor final** (ver "Lista de despliegue").

### Armar el `ALTER ... MODIFY` de un ENUM a partir del esquema real, no de `V1`, y comprobarlo con una prueba (tramo E3, bloque A4b)

- Un `MODIFY COLUMN ... enum(...)` reemplaza la lista entera: si se copia de `V1` se pierden los valores que sumaron las migraciones posteriores. `V34` se armó con `SHOW CREATE TABLE` sobre `bajonea_test` con todas las migraciones aplicadas (en `notificacion.tipo` coincidía con `V1`, pero en `pedido.estado` y `historial_estado_pedido.estado` hay un literal `PENDIENTE` heredado de `V6`). El valor nuevo va al final: es un cambio de metadatos, no reescribe la tabla.
- `EnumsContraBaseDeDatosIntegrationTest` compara, contra el esquema real que deja Flyway, los valores del enum Java con el ENUM de `pedido.estado`, `historial_estado_pedido.estado`, `notificacion.tipo` y `historial_estado_pedido.motivo_timeout`: cada valor de Java tiene que estar en la columna y la columna no puede tener otros salvo los heredados que se declaran en la prueba. Sin ella, un valor que falta aparece recién en tiempo de ejecución como un error de datos truncados.

### Una carpeta de Newman sola no tiene el estado de las anteriores; y la colección inyecta `X-Comercio-Id` por su cuenta (tramo E3, bloque A4b)

- `newman run ... --folder "<carpeta>"` corre sin las variables que dejan las carpetas anteriores (`localidad_id`, por ejemplo): los registros dan `400`. Se pasa con `--env-var localidad_id=<id de Río Grande>` (se obtiene de `GET /geografia/localidades`).
- El pre-request script de la colección agrega el header `X-Comercio-Id` a toda request con `Authorization` de un Dueño a las rutas de operación si conoce su comercio. Por eso un request "Dueño sin header" no puede probarse en Newman (responde `200`, no `400`); esa regla la cubren las pruebas Java y Playwright.

### `mysql.exe` en Windows devuelve texto con acentos mal decodificado si no se le pide UTF-8 (tramo E3, bloque A4b)

- Un script de Node que lee un texto con acentos con `mysql.exe -N -B` (por ejemplo el mensaje de un aviso) lo recibe con caracteres de reemplazo y falla al compararlo con el texto esperado. Se pasa `--default-character-set=utf8mb4`.

## Lista de despliegue

Pendientes que no son código y hay que revisar en cada entorno antes de contar con la función:

- **IP real detrás del proxy.** Sin `server.forward-headers-strategy` en `application-production.properties` (Railway), `request.getRemoteAddr()` es la IP del proxy: todos los clientes comparten el contador de `RateLimitPublicoFilter` (firma de fotos del registro y validar o aceptar invitaciones) y `Sesion.ip_origen` guarda la IP del proxy. Verificarlo en el entorno real antes de contar con el límite por IP. Decidido el 2026-10-06: queda acá, no se resuelve en el tramo E1.
- **`sql_mode` del servidor.** Ver la entrada de arriba: confirmar que el servidor de producción tiene el modo estricto.
- **Migraciones del rol Empleado.** `V29` (estado `ACTIVO`/`INACTIVO` de `empleado_comercio`) tiene que salir en el mismo release que el enum Java `EstadoEmpleadoComercio`; antes de aplicarla en un entorno con datos, confirmar con las consultas de la sección 13 de `docs/entregables-01-02/AUDITORIA-EMPLEADO-FASE1.md` que `empleado_comercio` no tiene filas con estados viejos.
- **Tope de 3 emails de regularización por destinatario.** El conteo y la escritura no están serializados entre Dueños distintos que inviten a la misma cuenta a la vez: el tope puede excederse en uno o dos envíos. Se acepta y no justifica un bloqueo (escenario S10 del estrés de E1).
- **Contraseñas en el environment de Postman.** `postman/Bajonea-Local.postman_environment.json` tiene 44 variables `*_password` con valor (10 `secret`, 34 `default`), todas de cuentas descartables que cada corrida crea y elimina. Antes de que el repositorio deje de ser privado hay que pasarlas a variables de entorno o dejarlas vacías (revisado el 2026-10-08, sin modificar el archivo).
- **`MERCADOPAGO_API_BASE_URL` no debe estar definida en el servidor final.** Es una variable solo para pruebas (apunta la API de Mercado Pago a un servidor local). Si estuviera definida en producción, la creación de preferencias y la consulta de pagos (webhook, sincronización, "Ir a pagar") irían a esa dirección y no a Mercado Pago. Sin la variable, el código usa `https://api.mercadopago.com`. Revisar en el panel de Railway y en cualquier `.env` o script de arranque antes del primer despliegue (el cliente de reembolsos, `MercadoPagoReembolsoClient`, y el de OAuth tienen la URL fija y no la leen).

---

## Cierre del backend de E3, bloque A5 (2026-10-14)

### Levantar el backend de test desde Node en Windows pierde su salida

- **Síntoma:** el backend arrancaba bien pero el archivo de log quedaba en 0 bytes; los estreses (que cuentan `Deadlock found` en ese archivo) decían "sin problemas" sin haber leído nada.
- **Causa:** con `spawn(..., { shell: true, detached: true, windowsHide: true })` la salida del proceso hijo no llega ni a un `stdio` de archivo ni a una redirección `> log 2>&1`: Maven forkea la JVM de la aplicación y esa hereda un handle de consola que no existe. Con `mvnw -l archivo` queda solo la salida de Maven.
- **Solución (`scripts/entorno-test.mjs`):** pedirle a Spring que escriba su propio archivo (`-Dspring-boot.run.arguments="--server.port=… --logging.file.name=<ruta con barras>"`) y a Maven el suyo aparte (`-l <log>.maven`). El script verifica que el backend responda en el puerto elegido y deja los PID propios en `%TEMP%/bajonea-entorno-test.json`; solo detiene esos. Los estreses de E3 no se afectaron (siempre levantaron el backend con `nohup` de bash).

### Playwright

- **El reporter de la línea de comandos reemplaza al de la configuración.** `--reporter=list` apaga el reporter JSON de `playwright.config.ts` (`reportes/resultados.json`, que alimenta `scripts/analizar-duraciones.mjs`). Para tener los dos: `--reporter=list,json` con `PLAYWRIGHT_JSON_OUTPUT_NAME=<archivo>`, o no pasar `--reporter`.
- **El reporter `html` sin `open: 'never'` se queda sirviendo el informe (y bloquea la terminal) cuando hay fallas.** La configuración lo fija en `never`.
- **Sin `retries` y con `trace: 'on-first-retry'` localmente no se grababa nunca una traza.** Ahora `trace`, `video` y `screenshot` son `retain-on-failure`/`only-on-failure`.
- **Google Fonts por internet:** `css/styles.css` hace `@import` de `fonts.googleapis.com`. Cada `page.goto` espera ese CSS antes de `load`, y el ancho del texto cambia entre la fuente web y la de respaldo (desbordes de 1 a 3 px a 375 px) y retrasa el `load` más que la vida del toast (2,2 s). El fixture `tests/helpers/prueba.ts` bloquea el CSS y las fuentes en cada contexto (`BLOQUEAR_FUENTES=0` lo apaga para comparar). Todos los specs importan `test` y `expect` de ahí. Empaquetar las fuentes en `frontend/` es una mejora de producción pendiente.
- **Hora y día en los tests:** `new Date().getDay()` y `getHours()` usan la zona de la máquina; el backend usa la zona del reloj de la aplicación (`America/Argentina/Ushuaia`). Los helpers de `tests/helpers/zona.ts` y `scripts/lib/zona.mjs` calculan en esa zona (`E2E_ZONA_HORARIA` para cambiarla); el surefire fija `-Duser.timezone=America/Argentina/Ushuaia`; los scripts de pre-request de Newman usan `toLocaleDateString('sv-SE', { timeZone })`.
- **Una sola contraseña de administrador de test.** Antes Playwright fijaba una (`fijarPasswordAdminYLoguear`) y Newman y los estreses esperaban otra: correr Playwright dejaba al administrador con la contraseña equivocada para los otros. Ahora todos usan `ADMIN_PASSWORD`.

### Reflexión para no olvidar un atajo de test

- `AtajosDeTestFueraDelPerfilTest` recorre por reflexión las anotaciones de `TestController` (los 14 atajos de hoy; falla si hay menos de 14) y comprueba que sin el perfil `test` ninguno existe (`404` con sesión, `401` sin ella) y que solo `TestController` y `TestSupportService` llevan `@Profile`. `ClassPathScanningCandidateComponentProvider` evalúa las condiciones de `@Profile` contra su propio entorno: hay que darle un `StandardEnvironment` con el perfil `test` activo o no encuentra las clases que justamente busca.

### Newman: re-ejecución sin reset

- Las carpetas 56 a 66 se pueden correr dos veces seguidas sobre la misma base sin reiniciarla (verificado en A5: dos vueltas de 58 a 66, 1092 requests y 1595 assertions cada una, 0 fallas). Los constructores viejos de identidades fijas (matriz de Cliente y de Comercio, multi-comercio 2a a 8a) no se probaron así: siguen necesitando base reseteada. `scripts/correr-newman.mjs <prefijos> [--repeticiones N]` corre carpetas contra otro puerto (`E2E_API_BASE_URL`), resuelve la localidad y toma `admin_password` de `ADMIN_PASSWORD` o del environment sin imprimirla.

## E4, bloque A1 (2026-10-14)

### La primera lectura simple de la transacción fija la foto: decidir con la relación bloqueada y antes de cualquier otra lectura

- En InnoDB con `REPEATABLE READ` la foto de la transacción se fija en la **primera lectura simple** (un `SELECT` sin `FOR UPDATE` ni `LOCK IN SHARE MODE`), no al empezar. Una lectura con bloqueo siempre ve lo último confirmado, pero una lectura simple posterior ve la foto vieja. `GestionMiembroEquipoService.reactivar` decide con el motivo de la última baja, la invitación pendiente y la aptitud de la cuenta: si cualquiera de esas lecturas simples corre **antes** de esperar el bloqueo de la relación, puede no ver una renuncia (o una baja) que se confirmó mientras esperaba, y reactivar a quien acaba de renunciar. Por eso el orden es: usuarios (lecturas con bloqueo), relación `FOR UPDATE`, estado del comercio (lectura con bloqueo) y recién después las lecturas simples. La mutación M8 (leer el historial antes de los bloqueos) lo reproduce en el estrés y en un test con latches.
- Cargar la entidad antes del bloqueo tiene el mismo problema en otro nivel: una consulta con bloqueo que devuelve una entidad que el contexto de persistencia ya tiene no refresca su estado (por eso `findByEmpleadoIdAndComercioIdConBloqueo` tiene que ser la primera lectura de esa fila; el resolver del Dueño no la carga antes, y por eso con `open-in-view` activo no hay una entidad vieja esperando en el contexto).

### Probar el orden de fechas con un reloj de segundos

- Las filas de los historiales llevan fecha sin fracciones. Para demostrar que una baja se fecha **después** de una escritura que ya estaba en curso, un estrés con escrituras rápidas casi nunca cruza un segundo. La prueba que muerde es determinista: una sesión de `mysql.exe` toma la relación en modo compartido (lo que hace una escritura delegada al revalidar), duerme 1,5 segundos y escribe una fila marcada con `NOW()`; el endpoint real de desactivar se lanza a los 400 ms. Con el bloqueo exclusivo la baja espera y se fecha después de la marca; sin él se fecha antes (la diferencia de un segundo se ve aunque el reloj no tenga fracciones). En Java se hace con un `TransactionTemplate` que llama a `ComercioActivoService.exigirRelacionActiva` y duerme.

### Node en Windows: `mysql.exe` devuelve `\r\n`

- Al leer varias filas de `mysql.exe -N -B` desde un script de Node hay que cortar con `/\r?\n/`; cortar por `'\n'` deja un `'\r'` al final de cada valor menos el último y las comparaciones con strings fallan de a una (un invariante que "contaba una baja de más" fue en realidad `'BAJA_DUENO\r' !== 'BAJA_DUENO'`).

### `mvnw test`: dos precondiciones de la base que no son defectos

- Sobre una base recién reseteada (`entorno-test.mjs preparar`) fallan los 15 tests de `CarritoVaciado*`: `CarritoIntegrationBase.producto` toma `SELECT id FROM categoria ORDER BY id LIMIT 1` y ningún test anterior creó una categoría (el resto de la suite crea categorías con nombres propios, pero según el orden de las clases ninguna corrió antes). Sobre una base con restos de varias corridas falla `TokenEspacioLlenoIntegrationTest` (el relleno de códigos pares queda por debajo de 499000 porque ya hay códigos ocupados). La receta que da la suite completa verde es: `preparar`, `detener`, sembrar una categoría (`INSERT INTO categoria (nombre, activo) VALUES ('Cat base mvn', 1)`) y correr las dos pasadas. Pendiente (no es de este bloque): que `CarritoIntegrationBase` cree su propia categoría.

### Comandos largos en segundo plano desde Bash

- Un `A && ( B ) &` pierde el trabajo cuando la herramienta termina el comando; una sola orden en segundo plano que invoca un script (`bash script.sh`) sí queda viva. Para corridas largas (Playwright completo, Newman, estreses) se escribe un script en el directorio temporal de la sesión y se lanza con `run_in_background`.

## E4, bloque A2 (2026-10-15)

### Cuando hay que conocer algo antes del bloqueo, leerlo en una transacción aparte (la renuncia y el `dueno_id`)

- La renuncia necesita el id del Dueño para bloquear su usuario junto al del Empleado en id ascendente, pero quien llama es el Empleado y no tiene el comercio abierto. Leerlo dentro de la transacción de la renuncia (aunque sea un `SELECT c.dueno.id`) es una lectura simple y fija la foto de la transacción **antes** de esperar la relación `FOR UPDATE`: el purgado de avisos que viene después (una lectura simple de los ids) podría no ver un aviso que un fan-out confirmó mientras se esperaba. Tomar el comercio con `LOCK IN SHARE MODE` para evitarlo no sirve: queda antes que la relación en el orden y se interbloquea con una escritura delegada (relación compartida, después comercio `FOR UPDATE`).
- Lo que se hizo: `GestionMiembroEquipoService.renunciar` **no** es `@Transactional`; lee el id con `ComercioRepository.findDuenoIdById` (una consulta escalar con su propia transacción, ya cerrada) y ejecuta todo el resto en un `TransactionTemplate`. Sirve porque el Dueño de un comercio no cambia. Es el mismo criterio por el que el resolver de comercio activo (transacción de solo lectura) no estorba a la baja del Dueño.

### Un 404 idéntico incluye al propio cuerpo: lanzar siempre la misma excepción

- `ComercioNoDisponibleException` (con el código `COMERCIO_NO_DISPONIBLE` en `data`) es la única excepción que produce ese cuerpo; una `RecursoNoEncontradoException("Comercio no encontrado")` tiene el mismo mensaje pero `data` nulo y se distingue. Por eso `bloquearUsuarios` del servicio de gestión del equipo recibe ahora quién lanzar cuando falta un usuario: la baja del Dueño sigue con "Miembro no encontrado" y la renuncia con `ComercioNoDisponibleException`. Las pruebas comparan los cuerpos completos (sin relación, comercio ajeno y comercio inexistente).

### La seguridad por rol de una ruta con variable de ruta se declara con la variable, no con un comodín

- `requestMatchers(HttpMethod.PUT, "/api/v1/empleados/comercios/{comercioId}/renunciar").hasRole("CLIENTE")`: una ruta exacta con su variable. Un `/**` en `/api/v1/empleados/**` habría abierto cualquier ruta futura del prefijo a `CLIENTE`. `ClasificacionRutasComercioTest` falla si el mapping no está clasificado; sus rutas `PROPIO` bajo `/api/v1/empleados/comercios/` esperan `404` del `CLIENTE` de la prueba (no tiene relación) y `403` del Dueño y del Administrador: el rechazo es de la seguridad y no llega al servicio.

### Archivos con finales de línea mezclados al parchearlos desde Node

- Varios archivos de `testing/` y `docs/` tienen líneas `LF` y `CRLF` mezcladas. Un parche en Node que busca un texto de varias líneas con `\n` no encuentra nada en un archivo `CRLF` (el síntoma fue una función duplicada: el reemplazo del encabezado no corrió y el segundo reemplazo sí). Se normaliza a `LF`, se parchea y se vuelve a `CRLF` si el archivo lo usaba en su mayoría. `file` informa "with CRLF line terminators" aunque haya líneas `LF`; contar con `(texto.match(/\r\n/g) || []).length`.
- Los pegados de código con muchas comillas dentro de un `cat <<'EOF'` en la terminal de la herramienta pueden cortarse con "unexpected EOF"; se escriben con la herramienta de escritura de archivos y se anexan con `cat >>`.

### Un test de Java con DNI aleatorio puede chocar con un DNI ya cargado (flake de datos de prueba, preexistente)

- `DatosPruebaEmpleado.dniAleatorio()` sortea un número de ocho cifras sin comprobar que no esté en `bajonea_test`; en una corrida con la base llena de restos puede salir `Ya existe una cuenta registrada con ese DNI` (se vio una vez, durante una mutación). La probabilidad por alta es chica y crece con los datos acumulados. Pendiente de endurecer el helper (reintentar con otro DNI), sin urgencia.

## E4, bloque A3 (2026-10-15)

### Una mutación que no muerde con una tormenta aleatoria se demuestra reteniendo un bloqueo en otra sesión

- M5 (el fan-out lee a sus destinatarios sin bloquear las relaciones) pasó 6 rondas de pagos y bajas simultáneos sin un solo problema: la ventana entre "leer los candidatos" y "escribir las copias" es de milisegundos. La prueba que muerde es determinista y reutiliza la técnica del bloque A2: una sesión `mysql.exe` toma el pedido `FOR UPDATE` y lo retiene 1,8 s; se lanza el pago (el fan-out lee que el miembro está activo, toma sus usuarios y espera el pedido), y a los 500 ms se da de baja al miembro con el endpoint real. Con el código real la baja espera (el fan-out ya tiene la relación compartida); con la mutación la baja gana, purga, y el fan-out inserta una copia para alguien ya inactivo. Para cada escenario de estrés conviene preguntarse qué bloqueo hay que retener para que el orden malo sea el único posible, y no confiar en que la carrera aparezca sola.

### Una mutación de orden tiene que respetar *quién* toma qué antes: M6 no es "tomar el comercio", es tomarlo antes que la relación

- La auditoría suponía que `desactivar` con el comercio `FOR UPDATE` se interbloqueaba con la suspensión del Administrador y con el bloqueo de cuenta del Dueño. No es así: la suspensión cancela los pedidos con `bloquearParaActualizar` (sin los destinatarios del equipo), así que nunca pide una relación. El ciclo real es contra la escritura delegada del propio miembro, que toma la relación compartida y después el comercio `FOR UPDATE`; para provocarlo hay que tomar el comercio **antes** que la relación y hacer que el miembro al que se da de baja también esté escribiendo (cerrar, abrir, datos operativos). Con el comercio después de la relación (la forma ingenua de agregar un bloqueo) no hay ciclo. Resultado: 42 `Deadlock found` en 6 rondas.

### `DELETE ... WHERE usuario_id AND comercio_id` solo muerde contra otro escritor de las mismas filas

- Mientras la relación del miembro está tomada, ningún fan-out inserta copias para él: el bloqueo de hueco del `DELETE` por rango no estorba a los pedidos. Lo que sí se interbloquea con él es el marcado de avisos como leídos (`UPDATE ... WHERE id IN (...)` por clave primaria) de esos mismos avisos: dos transacciones que recorren las mismas filas con distinto orden de índice. Con 400 avisos sembrados y el miembro, el Dueño y un Empleado marcando todas como leídas mientras se purga: 3 `Deadlock found` y un `500` en `PUT /notificaciones/leidas`. La regla "purgar por clave primaria" se mantiene, pero la razón no es el fan-out sino el marcado de leídas.
- Una mutación con `@Modifying(clearAutomatically = true)` rompe `aceptar` con un `LazyInitializationException` (el contexto de persistencia limpiado deja proxies sin sesión): para mutar sin ruido se usa `flushAutomatically` solo.

### El valor por defecto de un parámetro de TypeScript se aplica también a `undefined`

- En un helper de Playwright con `token: string | undefined = adminToken`, pasar `undefined` para probar el caso "sin sesión" usa el token del Administrador (y devuelve `200`, no `401`). Para el anónimo se pasa `''` (la cabecera `Authorization` solo se manda con un valor verdadero).

### Un chip de etiqueta con un nombre larguísimo desbordaba la pantalla (dato de la base cargada)

- `.chip` tiene `white-space: nowrap` y `flex-shrink: 0`; en `.chip-row--wrap` (la fila de etiquetas del formulario de producto) una etiqueta de 100 caracteres, que los tests de validación de etiquetas crean, ensanchaba el documento a 857 px y rompía `sinScrollHorizontal` (el `53:364` mostraba además la carrera del botón "Guardar", que tapaba este defecto: el test nunca llegaba al final). Con la base chica no aparece. Se corrigió con `max-width: 100%`, `overflow: hidden` y `text-overflow: ellipsis` en `.chip-row--wrap .chip`.

### `diasRestantes` de una invitación lo calcula el servidor

- `Math.max(1, Math.ceilDiv(milisegundos hasta fecha_vencimiento, 86 400 000))`, con `ahora` del reloj único (zona `America/Argentina/Ushuaia`). Es el mismo cálculo que hacía la pantalla (`Math.ceil` con un mínimo de 1) pero ya no depende de la zona del navegador (`Date.parse` de un `LocalDateTime` sin zona lo interpretaba en la zona de quien miraba). Solo tiene valor en una `PENDIENTE` vigente: una `PENDIENTE` cuya fecha pasó se informa `VENCIDA` y no lleva el campo.

## E4, cierre — bloque A4 (2026-10-15)

### Una mutación probabilística hay que repetirla antes de decir que no muerde (M7)

- `DELETE ... WHERE usuario_id AND comercio_id` (mutación M7) volvió a interbloquearse contra el marcado de leídas solo en una de tres corridas del escenario S9 (cuatro rondas sin problemas, doce rondas sin problemas, doce rondas con dos `500` y 6 `Deadlock found`). El cruce depende de qué transacción recorre primero las filas del índice, y eso cambia con el tamaño de la tabla. Regla: una mutación que no falla en una corrida no demuestra que el código sobra; se repite con más rondas y, si sigue siendo intermitente, se anota como tal en vez de omitirla.
- Si una mutación tiene que ser determinista, se arma con una sesión de `mysql.exe` que retiene las filas (técnica de M5 en el bloque A3), no con una tormenta aleatoria.

### `27:497` falla corriendo el spec 27 completo y pasa solo

- En el cierre de E4, `27-multicomercio-tramo4-selector.spec.ts:497` ("una sola consulta de polling por ciclo…") falló en la corrida completa y otra vez al correr el spec 27 entero sobre una base recién reseteada, y pasó 3 de 3 corriéndolo solo. No tiene relación con E4. Sigue en la lista de inestables conocidos.

