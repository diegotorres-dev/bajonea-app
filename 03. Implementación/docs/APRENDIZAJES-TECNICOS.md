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

### Los tests de Playwright suben imágenes a Cloudinary y no las limpian

- Los specs que cubren fotos de comercio y de producto (por ejemplo el 06, el 53 y el 62, y los helpers `subirFotoPreRegistro`, `subirImagenProductoDirecto`, `subirFotoNuevoComercio` y `subirFotoCorreccionComercio` de `tests/helpers/backend.ts`) hacen subidas reales a la cuenta de Cloudinary y nada las borra después.
- **Hipótesis sin verificar:** esa acumulación de assets, sumada a las subidas de cada corrida completa, pudo agotar el límite de la cuenta anterior y provocar el `cloud_name is disabled` que se vio en la tanda de ajustes del rol Empleado (2026-10-18). No se comprobó con Cloudinary ni con el uso de la cuenta; es solo la explicación más probable. Ver la deuda anotada en `docs/DECISIONES.md`.

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



## Ajustes del rol Empleado (2026-10-18)

### Los constructores de Newman no son todos idempotentes: antes de regenerar una carpeta, comprobar cómo la escribe

- **Carpeta 58:** `build-pedidos-tramoE3-A0-postman.mjs` reemplaza la carpeta por su nombre exacto (`58 - Pedidos E3 A0 …`), pero `build-empleado-tramoE3-A1-postman.mjs` la renombra a `58 - Pedidos y actividad E3 …`. Correr solo el A0 deja las dos carpetas (la vieja y una nueva de 95 requests al final) y el A1 después toma la primera que empieza con `58 - `. Orden seguro: correr el A0, borrar la carpeta `58 - Pedidos y actividad …` vieja, correr el A1 y volver a poner la carpeta 58 entre la 57 y la 59.
- **Carpetas 49, 50 y 51:** los constructores `1`, `2a`, `3a` y `4a` las arman y después otros constructores les parchean pedidos y encabezados (por ejemplo, el `4a` ajusta requests de las tres). **Regenerarlas pierde esos parches** (los items de pedidos de la carpeta 49 pasaron a dar `400` por falta de `X-Comercio-Id`). Para cambiar una aserción de esas carpetas, editar los items en la colección con un script y comparar item por item (request completa, no solo scripts) contra una copia de seguridad.
- Los constructores que hacen `push` de su carpeta (A2, A3) la dejan al final de la colección: reordenar por el prefijo numérico después de correrlos.
- Una carpeta de las primeras (por ejemplo la 49, que usa `cliente_usuario` y `cliente_password`) no corre sola: necesita las carpetas 00 a 03, que registran al Cliente. La colección completa necesita además una base reseteada: las carpetas 49 y 21 (`spec 21`) comparten CUIT y fallan con `409` si se repiten sobre la misma base.

### Cloudinary deshabilitada

- Con la cuenta del proyecto deshabilitada, la subida de la foto de pre-registro devuelve `401 cloud_name is disabled`. El backend solo valida que la URL sea de la cuenta y esté en la carpeta correcta, así que las pruebas usan una URL sintética (`tests/helpers/backend.ts`, `subirFotoPreRegistro`). No sirve para los specs que suben imágenes reales de producto.

### `mvnw` y los tests de Playwright comparten `bajonea_test`

- Después de `mvnw test` o de una corrida de Playwright la base queda con restos; para correr Newman hay que volver a resetearla con `entorno-test.mjs preparar`.

## Nombre único de comercio (Tramo 2, 2026-10-19)

### Columna generada `STORED` con `REGEXP_REPLACE` y colación `utf8mb4_unicode_ci` (MariaDB 10.4)

- MariaDB 10.4 acepta `REGEXP_REPLACE` dentro de una columna generada `STORED` con `UNIQUE` (`V37`): `nombre_unico = CASE WHEN estado = 'RECHAZO_DEFINITIVO' THEN NULL ELSE TRIM(REGEXP_REPLACE(nombre,'[[:space:]]+',' ')) END`. `[[:space:]]` colapsa también tabulaciones y espacios no cortantes. La entidad JPA no mapea la columna (igual que `cuenta_mercado_pago.mp_user_id_activo`), así que `ddl-auto=validate` no la ve.
- Con `utf8mb4_unicode_ci` (y también con `utf8mb4_general_ci`) la `ñ` es igual a la `n`, y `é` a `e`: "Cafetería Ñandú" y "Cafeteria Nandu" son el mismo nombre. Es lo que se quiere para este requisito y queda anotado como regla de producto. La consulta nativa compara contra la columna, y la colación de la columna gana a la del literal, así que da lo mismo que el índice sin depender de la conexión.
- Cambiar el estado recalcula la columna. Volver un comercio de `RECHAZO_DEFINITIVO` a otro estado chocaría si el nombre se retomó, pero ningún código de la aplicación saca a un comercio de ese estado.
- La carrera entre dos altas del mismo nombre se resuelve con el índice (el perdedor recibe `409` por `GlobalExceptionHandler`, que mapea `uq_comercio_nombre_unico`); el estrés con 2, 3, 6 y 12 registros simultáneos no produjo `Deadlock found`, así que no hizo falta reintentar la transacción ni agregar un lock.

### Validación asíncrona en un formulario por pasos: orden de las validaciones y desplazamiento del layout

- **El error de "ocupado" tiene que escribirse al final.** `initCamposNegocio().validar()` pasó a ser asíncrono porque espera la consulta de disponibilidad. Si la comprobación de disponibilidad corre antes que las validaciones síncronas del mismo campo (`validarCampoRequeridoYValido` limpia el error cuando el formato es válido), el mensaje de ocupado se borra y el usuario ve que no avanza sin saber por qué. La disponibilidad se evalúa después de las síncronas y, si el estado es "ocupado", vuelve a mostrar el error (`validarParaContinuar`). El mismo orden rige en el guardado del perfil del Dueño.
- **Una línea de estado que aparece al salir del campo puede comerse el clic siguiente.** El `blur` se dispara con el `mousedown` sobre otro control; si en ese momento aparece "Nombre disponible" y empuja el formulario hacia abajo, el `mouseup` cae en otro elemento y el clic se pierde (lo detectó el spec `14` al tocar el switch de "Retiro" justo después de escribir el nombre). Para el nombre del comercio la línea de estado reserva su espacio (`reservarEspacio`: `visibility:hidden` con un espacio no cortante en vez de `display:none`). El campo de nombre de usuario sigue con `display:none` y tiene el mismo riesgo latente.
- Un error de red en la consulta deja el campo sin aviso (estado inactivo): el servidor vuelve a validar al guardar, así que no hay un hueco, pero el usuario no ve que la verificación no se hizo.

### Otros

- Los scripts que se escriben a mano con `node` desde una tubería de bash pierden los caracteres con tilde (`á` llega mal por la entrada estándar de Windows): para editar archivos con texto en español, usar un archivo `.mjs` o la herramienta de edición, no `node -e` ni un heredoc por la entrada estándar.
- Los archivos del frontend mezclan finales de línea LF y CRLF en el árbol de trabajo (git los normaliza): al reemplazar texto con un script hay que detectar el final de línea del archivo (`includes('\r\n')`) y convertir el patrón.


## Edición de horarios — Fase 2, tramo T1 (2026-10-19)

- **Una lectura común después de esperar un bloqueo ve la foto vieja.** La primera versión de `HorarioEdicionService` leía `horario` con una consulta común después de esperar el `FOR UPDATE` del comercio, pero la foto de la transacción ya se había fijado en la primera lectura (`findById`): dos ediciones simultáneas no veían los cambios de la otra y quedaban 15 filas pendientes. Se corrigió leyendo las filas con `FOR UPDATE` (`findVigentesDesdeConBloqueo`). Lo detectó `HorarioEdicionConcurrenciaIntegrationTest`.
- **Los dos extremos de `23:59`.** `23:59` vale `24:00` solo en una franja que no cruza la medianoche (`20:00` a `23:59` no cruza; `20:00` a `00:00` sí cruza y el cierre se cuenta como la hora literal). El validador del servidor (`ValidadorHorarios`) y el del cliente (`js/horarios.js`) tienen que mantener esa misma regla; cualquier cambio va en los dos.
- **El mensaje de una superposición entre días distintos tiene que ser estable.** El cliente valida la fila que el usuario acaba de editar, y esa puede ser la segunda en el orden de la semana; si el mensaje nombrara primero la fila editada, el texto cambiaría según qué campo se tocó. Se ordena por el inicio del turno dentro de la semana circular (el domingo que cruza va antes que el lunes).
- **La cola de un turno de hoy no se valida en el cliente.** Depende de qué día es hoy en el comercio y de lo que rige ahora, no solo de la lista que se está cargando; la valida el servidor y el cliente muestra su mensaje bajo el campo.
- **En Playwright, `fill` sobre un `input type="time"` dispara `input` y `change`**, así que las validaciones y la leyenda de cruce se actualizan solas.
- **Un `409` o un `400` dejan "Failed to load resource" en la consola del navegador.** Los tests que verifican "sin errores de consola" tienen que filtrar ese mensaje de red y mirar solo `pageerror` y los errores de JavaScript.
- **Anotado, sin arreglar:** `.field__hint` (`#b0a9a3` sobre blanco, unos 2,2:1 de contraste) está por debajo de 4,5:1 en todos los formularios; los botones de editar y quitar del resumen del horario fijo miden 32 px (menos de los 44 px recomendados para tocar).

## Pedido por turno — Fase 2, tramo T2 (2026-10-20)

- **Comparar un constructor de Newman con la colección sin tocar nada.** Los constructores resuelven la colección y el environment con `__dirname` (`../../../postman/`), así que se puede copiar `testing/playwright/scripts` y los dos JSON de `postman/` a una carpeta del scratchpad con la misma estructura (`sb/testing/playwright/scripts`, `sb/postman`), correr el constructor ahí sobre una copia de la colección y comparar carpeta por carpeta con `JSON.stringify`. Resultados de T2: la 57, la 64 y la matriz 66 salen idénticas (el constructor de la 66 solo la mueve al final); la 49 sale idéntica corriendo `tramo1`, `2a`, `3a` y `4a` en orden (`tramo1` solo deja 108 de sus 155 requests: el `4a` agrega los 47 `[T4A]`); la 50 y la 51 no coinciden (llevan parches de otros constructores, ver el aprendizaje de las carpetas 49 a 51 más arriba); la 22 cambia siempre porque calcula las fechas con el día de hoy; **la 17 no sale de ningún constructor** (se reconstruyó a mano el 2026-09-21), así que sus cambios se hacen sobre la colección con un script.
- **El hook de escritura del proyecto bloquea hasta el scratchpad.** `bloquear-escritura-fuera-de-proyecto.js` rechaza la herramienta de escritura fuera de `backend/`, `frontend/`, `postman/`, `testing/`, `docs/` y `.claude/`; para armar un sandbox hay que copiar con la terminal. Un comando de terminal con un heredoc largo en español que mencionaba un delimitador entre comillas falló con "unexpected EOF"; funcionó escribir un archivo temporal dentro de `docs/` con la herramienta de escritura y anexarlo.
- **Specs de UI con textos que dependen de la hora:** los rótulos reales ("En curso · 11:23 a 12:23") cambian según la hora a la que corre el test. Dos reglas: calcular la franja **una sola vez** en el `beforeAll` y compararla después contra esa constante (si se vuelve a evaluar `horaEn(-30)` dentro del test, un cambio de minuto entre el setup y la aserción lo rompe), y probar los textos que dependen de la fecha ("ayer", "el 17/10", cruce de medianoche, fin del turno) con la respuesta del servidor simulada por `page.route`, que es determinista; los números sí se comparan contra el servidor real.
- **Sesión única por cuenta en los specs de UI:** el login por API que abre la pantalla invalida el token del `beforeAll`; las funciones de apertura (`abrirComoDueno`, `abrirComoEmpleado`) devuelven la sesión y las aserciones contra la API usan **ese** token, no el del setup (con el del setup, el segundo test de la serie falla con `401`).
- **Un temporizador que espera una fecha del servidor** (la recarga al fin del turno) no puede usar `Date.parse` de una cadena sin zona: interpretaría la hora en la zona del navegador. `milisegundosHasta` (`js/fechas.js`) arma la hora de pared de la zona del comercio con `Intl.DateTimeFormat` y compara las dos como si fueran UTC; el tope de `setTimeout` es 2147483647 ms. Una recarga que llega antes de que el servidor cambie de turno programa otra a los 1,5 s, y así hasta que cambia.
- **Anotado, sin arreglar:** el panel repite el horario en el banner "Tu comercio está abierto ahora" y en el rótulo del turno; las etiquetas de la barra de métricas miden 11 px.
- **Después de probar una mutación, `./mvnw clean` antes de la pasada final.** En B4, `TurnoBackfillIntegrationTest.laEscrituraNoPisaUnTurnoQueSeAsignoDespuesDeLeerElLote` falló con "expected 1 but was 2" aunque el fuente estaba bien: `target/classes` conservaba la clase compilada con la mutación M3 de A7 (el `UPDATE` del backfill sin `AND turno_fecha IS NULL`), porque Maven no recompiló al revertir el archivo. El registro general de MySQL (`SET GLOBAL general_log=1` con `log_output='TABLE'`) mostró el `UPDATE` sin la condición. La prueba hizo su trabajo y el error era del artefacto, no del código. Regla: las pasadas finales de `mvnw test` y cualquier backend que se levante para Newman, Playwright o los estreses salen de un `./mvnw clean` hecho después de revertir las mutaciones.
- **`mvnw test` completo y "Too many connections".** Con 997 tests y al menos 16 contextos de Spring cacheados (pool de 10 conexiones por defecto en cada uno; causa probable, no medida) el servidor MySQL de XAMPP, con `max_connections = 151`, rechaza conexiones hacia el final y fallan los 4 tests de `TokenColisionIntegrationTest` (`HikariPool-16 ... Too many connections`, tras 30 s cada uno); solos pasan 7/7. Bajar el pool a 5 con `-Dspring.datasource.hikari.maximum-pool-size=5` los arregla pero rompe una prueba de concurrencia que necesita más conexiones (`PedidoAutoconfirmadoConcurrenciaIntegrationTest`). No se subió `max_connections` del servidor de Diego. Salida posible, sin implementar: un pool más chico solo en los contextos que no hacen concurrencia, o subir `max_connections` en la MariaDB de pruebas. Además, cada pasada completa necesita la base reseteada y la categoría sembrada (ver arriba): una segunda pasada sin reset falla por nombres de comercio repetidos (`uq_comercio_nombre_unico`) y por el espacio de códigos de token.

## Precio bloqueado en franja, aviso en el carrito y total esperado — Fase 2, tramo T3 (2026-10-22)

- **Un spec o un estrés que enciende el bloqueo de precio lo apaga siempre.** El bloqueo es una propiedad del bean `PrecioBloqueoProperties`, único por backend: si un test que lo enciende se cae sin restaurarlo, todos los tests siguientes que editan un precio fallan en cadena con `409`. Reglas: `conBloqueoDePrecio` (helper de `tests/helpers/backend.ts`) envuelve en `try/finally`, los `describe` que lo usan lo apagan en `afterEach`/`afterAll`, y los Java lo restauran en `@AfterEach`. No hay `globalSetup` (decisión de Diego: con `workers: 1` el `finally` alcanza).
- **El registro de comercios de prueba deja una franja `00:00` a `23:59` del día de registro.** Con el bloqueo encendido todo cambio de precio de ese comercio es `409` durante todo ese día de la semana y no otro: un test de precio que depende de la fecha sería intermitente. Los specs que prueban el bloqueo crean comercios con una franja calculada alrededor de ahora (`ahora - 30 min` a `ahora + 30 min` o `+2 h` a `+3 h`) y calculan la franja una sola vez.
- **Comparar precios con `compareTo`, nunca con `equals`:** `100` y `100.00` son el mismo `BigDecimal` para el negocio; con `equals` el guard bloquearía una edición que no toca el precio.
- **El formulario de producto muestra el entero truncado** (`Math.trunc`) y envía el entero; un producto cargado por API con centavos parecería "cambiado" al guardarlo desde la pantalla. Con el precio bloqueado la pantalla manda el valor original del producto (`productoActual.precio`), no el del campo.
- **Probar una respuesta que el servidor ya no da con un `page.route` que modifica la real:** para ver el `409` de respaldo del formulario (el servidor ya avisó con `precioBloqueado = true`), el spec `76` intercepta `GET /productos` con `route.fetch()` y pone `precioBloqueado = false`; para la habilitación automática pone `precioBloqueadoHasta` a unos segundos con la misma hora de pared de la zona del comercio (`fechaHoraSqlEnZona(...).replace(' ', 'T')`).
- **Un `console.error` de `Failed to load resource` no es un error de la página:** las imágenes de Cloudinary `demo` de los productos sembrados por SQL fallan sin red; los specs de UI que miran errores de consola filtran ese mensaje y siguen mirando `pageerror`.
- **Anotado, sin arreglar:** el campo precio deshabilitado usa el color de placeholder (bajo contraste); la leyenda es un `.field__hint` de 11 px.

## Cierre de turno y email al Dueño — Fase 2, tramo T4 (2026-10-24)

- **Un job medido desde un atajo HTTP corre distinto que el programado (open-in-view).** `spring.jpa.open-in-view` está activo (el valor por defecto): en el hilo de una petición HTTP todas las transacciones comparten una misma sesión de Hibernate hasta el final de la petición. `CierreTurnoService.candidatos` carga todas las franjas de la plataforma (28000 con 2000 comercios) y esas entidades quedan administradas en la sesión compartida; cada consulta que sigue (`cerrar` hace cuatro) dispara un `flush` que recorre todo lo administrado, y la corrida se vuelve cuadrática: 290 s para 2000 cierres contra 16 s. El programador (`@Scheduled`) corre en un hilo sin esa sesión: cada transacción tiene la suya y las entidades quedan sueltas al terminar `candidatos`. El atajo `POST /api/v1/test/jobs/cierre-turnos` ahora corre el job con `CompletableFuture.supplyAsync(...).join()`, en su propio hilo. Antes de culpar a la base por una medición lenta, revisar si el código bajo medida corre dentro de una petición.
- **`INSERT ... ON DUPLICATE KEY UPDATE` no dice si insertó.** Con el conector por defecto (que manda `CLIENT_FOUND_ROWS`) la cantidad de filas afectadas es 1 tanto para una fila nueva como para una existente "actualizada" sin cambios (según la documentación de MySQL y del conector; no se midió en este proyecto, se evitó el problema). Para saber quién ganó una carrera se hace el `INSERT` común y se captura `DuplicateKeyException`; la segunda inserción espera la confirmación de la primera y recibe la duplicada, sin interbloqueo mientras la primera confirme.
- **Un piso por fin del último cierre, no una lista de claves.** Para elegir los turnos pendientes de cerrar no alcanza con "no tiene fila dentro de la ventana": después del primer cierre de un comercio nuevo (que cierra solo su último turno), los otros días de la ventana quedan sin fila y se cerrarían al minuto siguiente. El piso `fin del último cierre` hace que cada comercio avance de a un turno y de adelante hacia atrás nunca; y se calcula con una consulta agrupada acotada por `turno_fecha` (el prefijo del índice único), no con la tabla entera.
- **`DROP INDEX` de un índice único falla si una clave foránea lo usa.** `uq_cierre_turno` empieza por `comercio_id`, así que `fk_cierre_turno_comercio` lo usa como índice propio; para probar la mutación "sin el `UNIQUE`" hay que soltar la clave foránea, crear un índice de reemplazo, soltar el único, y al restaurar borrar las filas duplicadas antes de volver a crear el índice único y la clave foránea. Si el `ALTER` falla a medias, la base queda como estaba (el script lo verificó con `SHOW CREATE TABLE`).
- **Mutaciones con `spawnSync` en Windows: el comando con ruta no ASCII y con `-Dtest=A,B,C` se rompe por `cmd.exe`.** Con `shell: true` la coma separa argumentos (hay que citar `"-Dtest=A,B,C"`), la ruta absoluta con `á` no se reconoce (hay que ejecutar `.\mvnw.cmd` con `cwd`; y la barra invertida no sobrevive a los heredocs de la herramienta: se arma con `String.fromCharCode(92)`), y los archivos con fines de línea CRLF no coinciden con un texto buscado de varias líneas con `\n` (se normaliza el fin de línea del texto antes de buscar). Una mutación que "no aplica" tiene que reportarse así y no contarse como detectada ni como sobreviviente.
- **El job cierra los turnos de todos los comercios de la base de pruebas.** Un test o un spec que llama al job con una hora fija crea cierres (y llama al `EmailService` simulado) también para los comercios de las demás pruebas que sigan siendo `APTO_VENTA`. Los tests miran solo las filas de los comercios que ellos crearon; los specs y el script de Newman **barren** primero (corren el job con la misma hora hasta que no cree nada) y recién después arman su escena, para que las cuentas de la corrida sean exactas. Con una base muy poblada (cientos de comercios con franjas de todo el día) las pruebas Java con horas distintas tardan mucho más: correr `mvnw test` sobre base reseteada.
- **Una prueba de `ahora` fijo sin depender del reloj.** Para comprobar que la corrida programada (el método sin argumentos) no hace nada en el perfil `test` se crea un comercio con una franja de todo el día de hace dos días (`hoy - 2`, `00:00` a `23:59`): su fin está siempre dentro de la ventana de 3 días y ya pasó la gracia, sea cual sea la hora a la que corra la prueba. Una versión con una franja relativa a "ahora" dependía de la hora del día.
- **Los resultados del envío se prueban contra la base real, no con mocks.** El test que faltaba para la mutación "el resultado sin la condición `email_estado = 'ENVIANDO'`" es de repositorio: pone una fila en cada estado distinto de `ENVIANDO`, llama a la sentencia y comprueba que afectó 0 filas y que la fila no cambió. Los tests unitarios con un repositorio simulado no pueden ver una condición que falta en la consulta. Cuidado con el orden al armar las filas: crear todas las filas **antes** de forzar sus estados, porque cada llamada al job para crear la siguiente procesa (y envía) las anteriores.

## Estadísticas del Dueño — Fase 2, tramo T5 (2026-10-24)

### Las consultas sobre `pedido.estado` que no sean de conteo tienen que ser nativas y leer el estado como texto

- **Riesgo:** el ENUM físico de `pedido.estado` conserva el literal viejo `PENDIENTE` (V6 no lo quitó) y el enum Java `EstadoPedido` no lo tiene. Una consulta JPQL que proyecte `p.estado` revienta al leer una fila con ese valor (`EnumsContraBaseDeDatosIntegrationTest` lo tolera a propósito).
- **Qué hacer:** consulta nativa con una interfaz de proyección que declare `String getEstado()`, y convertir con `CategoriaResultadoPedido.desde(String)`, que cuenta el literal viejo y cualquier valor desconocido como "en curso" (con `log.warn`). `EstadisticasComercioIntegrationTest` inserta filas con `PENDIENTE` por SQL.

### El plan de una agregación por rango cambia con el rango y con la cantidad de filas del comercio

- Con 30900 filas de un solo comercio, `GROUP BY turno_fecha, turno_horario_id, estado` usa `range` sobre `idx_pedido_turno` a 7 días, `ref` sobre el mismo índice a 30 y `ref` sobre `idx_pedido_comercio` a 92 (el rango cubre casi todo el historial); el tiempo de base de datos es el mismo que forzando `idx_pedido_turno` (27 a 45 ms). No se fuerza ningún índice: un `FORCE INDEX` acopla el código al nombre de un índice. Los tests no deben exigir un índice puntual: el estrés exige que el plan no recorra toda la tabla, y el test de integración solo exige que `idx_pedido_turno` sea elegible (`possible_keys`).
- Los parámetros de fecha de la consulta nativa se declaran como `LocalDate`/`LocalDateTime`, pero las columnas de fecha de la proyección vuelven como `java.sql.Date`: la interfaz de proyección las declara así y el servicio convierte con `toLocalDate()`.


## Estadísticas del Dueño: pantalla (Fase 2, T5, entrega B)

- **`.screen-body` ya trae `padding: 28px 20px 40px`.** Un bloque propio con su `padding: 0 20px` dentro de él duplica el margen lateral y le saca 40 px al gráfico: con 30 barras en 375 px, el ancho de la barra pasó de 6,9 px a unos 8,2 px al sacar el padding de más. Medir con `getBoundingClientRect` antes de dar por bueno un layout apretado (las capturas engañan: a 30 días la diferencia casi no se ve).
- **El gráfico por día es una fila de `<button>`, no un SVG.** Cada columna es un botón de alto completo (160 px) con `aria-label` "fecha: monto" y `aria-pressed`; así se toca en toda su altura, el teclado funciona sin código extra (Tab, Enter, Espacio) y se suman flechas, Home y End con un `keydown`. El alto de la barra interna se fija con `style.height` en porcentaje del máximo (mínimo 3 % si hay venta; un día en cero lleva una línea de 2 px).
- **El detalle de un día necesita las dos agrupaciones.** `agrupar=DIA` no trae los turnos y `agrupar=TURNO` no rellena los días vacíos, así que la pantalla pide las dos consultas en paralelo por rango y las guarda en memoria; el cambio de rango no vuelve a pedir lo ya cargado. Si el rango de 7 días está vacío se usa la consulta de 30 (ya en memoria, porque 30 es el que abre) para decidir si se ofrece el botón.
- **Un módulo de página no debe importar de `comercio.js` y a la vez ser importado por él.** El enlace "Ver estadísticas" se arma en `comercio.js` (no en `estadisticas.js`, que sí importa `renderBottomNavComercio` de `comercio.js`) para no dejar un ciclo de módulos.
- **El `annotations.push` de un test no sale en el reporte JSON de Playwright** (`reportes/resultados.json` trae las anotaciones declaradas, no las agregadas en ejecución); para registrar una medida hay que imprimirla o adjuntarla.

## Documentos del comercio y aptitud de venta (Fase 4, 2026-10-26)

### Un archivo grande necesita `max_allowed_packet` y no se deja decir "pesa N MB" si Spring corta antes

- `max_allowed_packet` de XAMPP es 1 MB: un `INSERT` de un `LONGBLOB` de 8 MB falla. Para probar sin tocar `my.ini`: `SET GLOBAL max_allowed_packet=67108864;` (vale hasta reiniciar MariaDB). En producción hay que pedir al menos 16 MB (`docs/LISTA-DE-DESPLIEGUE.md`).
- Con `spring.servlet.multipart.max-file-size` igual al máximo del negocio, Spring rechaza el pedido antes de llegar al controlador y la excepción no trae el tamaño real; además Tomcat puede cortar la conexión sin devolver el JSON si el cuerpo que sobra supera `maxSwallowSize`. Por eso el tope duro es el doble (16 MB) y el máximo del negocio se valida en el servicio; por encima del tope duro, el manejador usa el `Content-Length`.
- `@Lob byte[]` lo mapea Hibernate como `tinyblob` y la validación del esquema falla contra un `LONGBLOB`: se usa `@JdbcTypeCode(SqlTypes.LONGVARBINARY)`.
- `ContentDisposition.inline().filename(nombre, UTF_8)` de Spring 6.2 genera `filename="=?UTF-8?Q?…?="; filename*=UTF-8''…` también para nombres con acentos, y para un nombre ASCII no necesariamente `filename="x.pdf"`: no comparar la cabecera entera en los tests.

### El bloqueo de la cuenta de Mercado Pago no reemplaza al del comercio

- Con la cuenta activa, `SELECT … FOR UPDATE` sobre su fila ordena a todos los escritores de documentos del mismo Dueño. Sin cuenta (un comercio que todavía no vendió) el mismo `SELECT` sobre una fila inexistente toma solo un bloqueo de hueco, compatible con el de otro igual. Sin el bloqueo del comercio, seis subidas simultáneas hacen `LOCK IN SHARE MODE` del recuento y después `INSERT`: todas retienen el bloqueo compartido del rango y todas piden el de inserción, así que se interbloquean (`Deadlock found`, `500`). Un test con cuenta no lo ve; hace falta uno sin cuenta.

### Mutaciones: restaurar el archivo no recompila

- Una corrida de mutaciones que restaura el original con `Copy-Item` (que conserva la fecha de modificación vieja) deja la clase mutada en `target/`: Maven compara fechas y no vuelve a compilar. El backend de pruebas levantado después corría el código mutado y el estrés dio `500`. Después de mutar, tocar la fecha de los fuentes (o `mvnw clean`) antes de levantar nada. El síntoma que lo delató: el log general de MariaDB (`SET GLOBAL log_output='TABLE'; SET GLOBAL general_log=1;` y `SELECT … FROM mysql.general_log`) no mostraba ningún `select … from comercio … for update` dentro de la transacción de la subida. Apagarlo al terminar (`SET GLOBAL general_log=0;`).

### La suite completa de Java y las conexiones

- Cada contexto de Spring que la suite deja en caché mantiene un pool de Hikari que abre 10 conexiones de entrada. Con `max_connections=151` la suite llegaba al borde (`Max_used_connections` 152) y los últimos contextos (`TokenColisionIntegrationTest`) fallaban con "Too many connections" mientras el backend de pruebas estaba levantado. `application-test.properties` ahora fija `spring.datasource.hikari.minimum-idle=2`. Aun así, correr `mvnw test` con el backend de pruebas detenido.
- Varias pruebas viejas insertan comercios con nombre fijo y confirman (`Segundo comercio A4`): una segunda corrida completa sin resetear `bajonea_test` choca con el nombre único del tramo 2 de registro. Resetear la base entre corridas completas (`entorno-test.mjs preparar` y `detener`).


## Fase 5, tramo S1 (2026-10-27)

### Una lectura común antes de un `FOR UPDATE` fija el snapshot de la transacción

- En MariaDB con `REPEATABLE READ`, el snapshot de la transacción se crea en la primera lectura **no bloqueante**; las lecturas bloqueantes (`FOR UPDATE`, `LOCK IN SHARE MODE`) no lo crean y siempre ven lo último confirmado. Si una transacción empieza con `findById` y recién después toma el bloqueo (`entityManager.refresh(x, PESSIMISTIC_WRITE)`), cuando el bloqueo se concede el snapshot es anterior: las lecturas comunes que siguen (`SELECT` de sesiones, historial) no ven lo que otra transacción confirmó mientras esperaba. `SuspensionUsuarioService` lo sufrió: un login simultáneo dejaba una sesión activa en una cuenta suspendida. Regla: el bloqueo es la **primera** lectura de la transacción; recién después, `refresh` o lecturas comunes.
- Hibernate con `@DynamicUpdate` ausente escribe todas las columnas: cualquier flujo que cargue un `Usuario` sin bloquearlo y lo guarde puede pisar un `estado` cambiado en el medio. Por eso la verificación del email ahora toma la fila `FOR UPDATE` antes de leerla.

### Un `CHECK` de MariaDB 10.4 y las pruebas que escriben `usuario.estado` por SQL

- `ck_usuario_suspension` se escribió con `AND`/`OR` explícitos (sin comparar dos booleanos con `=`); se probó en una base descartable que acepta los casos válidos y rechaza los dos inválidos (estado `SUSPENDIDO` sin motivo y motivo sin suspensión).
- Todo helper de prueba que ponga `SUSPENDIDO` por SQL tiene que completar `motivo_suspension` y `suspendido_desde` (`DatosPruebaEmpleado.cambiarEstadoUsuario` y el spec `35`); si no, el `UPDATE` falla con `ck_usuario_suspension`.

### Un código de verificación del registro compite con el que crea la prueba

- `TokenService.crear` no invalida los códigos pendientes anteriores (lo hace `AuthService.generarToken`). Un test que crea su propio código de verificación para una cuenta registrada tiene que marcar antes el del registro como `UTILIZADO`; si no, `obtenerTokenValidoPorCodigo` toma "el más reciente" y con la misma `fechaCreacion` (precisión de segundos) puede elegir el del registro.

### Herramientas

- `python3` en este equipo es el alias de la Microsoft Store (no corre): usar `python`. Un script de Python dentro de un heredoc con `\n` o `\\n` en cadenas escribe saltos de línea reales en el archivo destino: para editar código con barras invertidas conviene la herramienta Edit o `String.fromCharCode(10)`.
- Un script de Node que invoca `mvnw` desde una ruta con espacios y tildes (`Bajoneá/03. Implementación`) con `shell: true` falla sin avisar: usar `execSync` con la ruta entre comillas. Un ejecutor de mutaciones tiene que exigir una corrida base verde y que Maven realmente haya corrido tests antes de dar "detectada" (la primera versión daba 15 de 15 "detectadas" sin haber corrido nada).
- Un `A | grep` en un comando en segundo plano no muestra nada hasta que termina (buffer de la tubería): no sirve para ver el avance.

### Entrega B de S1 (2026-10-28)

- **Una mutación que sobrevive puede ser un test mal armado, no código sin cubrir.** M19 (el listado mira siempre el email de la suspensión) sobrevivió porque el test dejaba fallar los dos emails a la vez: con los dos caminos fallidos no se distingue cuál se lee. El test tiene que dejar uno fallido y el otro enviado.
- **No editar fuentes mientras corre el ejecutor de mutaciones.** `mutaciones-suspension-s1.mjs` guarda el original de cada archivo y lo restaura al terminar la mutación: una edición propia en el mismo archivo durante esa ventana se pierde, y una compilación en el medio da un falso "ERROR DE COMPILACION".
- **`abrirComoUsuario` de Playwright vuelve a escribir la sesión en cada navegación** (`addInitScript` sin condición): para probar que una pantalla limpia la sesión se mira `localStorage` mientras la pantalla está abierta, antes de navegar.
- **Un estrés con datos propios puede necesitar una categoría sembrada.** `stress-locks-tramoE3-carrito.mjs` toma `SELECT id FROM categoria ORDER BY id LIMIT 1`: sobre `bajonea_test` recién reseteada falla con "Categoría no encontrada" hasta sembrar una (`INSERT INTO categoria (nombre, activo) VALUES ('Cat base estres', 1)`). Es preexistente (mismo origen que lo anotado para `CarritoIntegrationBase`).
- **Una corrida de Newman que cruza la medianoche rompe las pruebas de turnos.** La carpeta 76 ("el cierre guardado tiene las mismas cifras que mostraba el panel") dio 2 fallas en una corrida completa que atravesó las 00:00 y 0 fallas al repetirla sola.
- **El `fs.writeFileSync` de la colección de Postman puede fallar una vez con `UNKNOWN` en Windows** (archivo tomado un instante por otro proceso): reintentar.

### Entrega A de S2 (2026-10-29)

- **`mvnw test-compile` sin `clean` puede decir `BUILD SUCCESS` con tests que ya no compilan.** Después de borrar un método o un campo de una entidad, la compilación incremental no volvió a compilar los tests que lo usaban: la primera pasada dio verde y un `mvnw clean test-compile` mostró 21 errores. Para cambios que borran API conviene `clean` antes de dar por buena la compilación de los tests.
- **Un método con valor por defecto en una proyección de Spring Data no se llena desde la consulta.** `EstadoYCierreComercio` es una proyección de una consulta nativa; si `getSuspendidoDesde()` fuera `default`, Spring lo invocaría en vez de leer la columna. Los tests que la implementan a mano (clases anónimas) tienen que sobrescribir el getter nuevo; los que usan `mock(...)` lo ven como `null`.
- **Una columna `NOT NULL` o un `CHECK` nuevo obligan a todo el que escribe esa fila.** Con `ck_comercio_suspension`, cualquier `UPDATE comercio SET estado = 'SUSPENDIDO'` sin los tres campos falla en la base: se corrigieron `DatosPruebaEmpleado.cambiarEstadoComercio`, un test de concurrencia de horarios, el clon de `TestSupportService` y un test que armaba el timer viejo por SQL. El `CHECK` sirve de red de seguridad: cualquier camino nuevo que deje un comercio suspendido sin motivo o sin fecha se rompe en el primer test.
- **Un `DTO` que hereda de otro hereda también sus getters.** `MiComercioEmpleadoResponseDTO extends MiComercioResponseDTO`: al sumar `motivoSuspension` y `suspendidoDesde` a la clase base el Empleado los habría recibido. Se resolvió con `@JsonInclude(NON_NULL)` en la base y pasando `null` desde la subclase, con un test de contrato (`SuspensionComercioContratoTest`) que serializa los dos DTO.
- **Cuando un proceso programado deja de depender de una columna por pedido y pasa a depender de una columna del comercio, el filtro por SQL es solo un filtro grueso.** `findIdsDeComerciosSuspendidosDesde` devuelve candidatos; la decisión (estado del pedido, comercio todavía suspendido, minutos cumplidos) se toma dentro de la transacción de cada pedido con todo bloqueado. Dos tests mock (`PedidoServiceCarreraTest`, `PedidoNoRetiradoServiceTest`) cubren cada guarda por separado.
- **Un test de carrera con `@RepeatedTest` y `correrAlMismoTiempo` solo muerde una mutación de orden de bloqueo si el cruce necesita a los dos lados.** La mutación N6 (leer el comercio después del pedido en el camino del pago) no la detecta "suspender contra pago" (suspender no pide el pedido); la detecta "desvincular Mercado Pago contra pago", que sí cierra el ciclo.
- **El nombre de un comercio es único en la base y un test con nombre fijo falla en la segunda corrida.** `NotificacionesEquipoIntegrationTest` clonaba un comercio con un nombre literal; pasó a un nombre con sufijo aleatorio.
- **Los scripts de Python con `heredoc` y comillas triples en la herramienta Bash fallan con "unexpected EOF"**: para escribir parches conviene crear el archivo `.py` con la herramienta Write y ejecutarlo.

## Fase 5, tramo S2, entrega B1 (2026-10-29)

- **Una consulta con `JOIN FETCH` por la cadena `Cliente → PersonaFisica → Persona → Usuario` reemplaza las cuatro cargas perezosas por cliente.** El listado de Clientes del Administrador pasó de 7839 consultas con 2575 clientes (unos 6 segundos) a 5 consultas fijas (unos 0,1 segundos) con la respuesta idéntica byte a byte. El estado previo de la última suspensión de todos los suspendidos se pide con una sola consulta (`MAX(id)` por usuario) en vez de una por suspendido. El test de contrato compara la cantidad de consultas con pocos y con muchos clientes: no depende de un valor fijo.
- **Cambiar un estilo compartido (`.cliente-admin-row`) puede romper otra pantalla que reutiliza la clase sin que ningún test de texto lo note.** En S1 la clase pasó a ser una fila `flex` y `admin-reembolsos.html` (que la usa para sus tarjetas) quedó con el contenido en columnas de una letra y 417 px de desborde horizontal a 375 px; el spec `20` verifica textos y pasaba. Lo detectó la aserción `sinScrollHorizontal` del spec 85. Regla: toda pantalla que reutiliza una clase de otra tiene que tener al menos una aserción de layout.
- **Los specs no pueden poner un comercio en `SUSPENDIDO` por SQL con solo el estado:** el `CHECK ck_comercio_suspension` exige origen, fecha y motivo (y los exige nulos en cualquier otro estado). `sentenciaEstadoComercio` (`tests/helpers/backend.ts`) arma el `UPDATE` completo para cualquier estado, y `ponerEstadoComercio` la usa.
- **La campana lista solo `canal = PUSH`; un test que cuente avisos no leídos en la base tiene que filtrar igual.** Con el email de aviso registrado como fila `EMAIL`, el total de la base supera al de `mis-comercios` (spec 26).

## Fase 5, tramo S2, entrega B2 (2026-10-29)

- **Un comercio que no es "operativo" no es lo mismo que un comercio que el Dueño no puede abrir.** `MiComercioResponseDTO.operativo` vale `true` solo con `APROBADO` y `APTO_VENTA`, y `elegirDestino` (`js/comercio-activo.js`) mandaba al login al Dueño sin ningún comercio operativo. Para que un comercio `SUSPENDIDO` sea seleccionable sin tocar el significado de `operativo` (lo usan el cierre manual, el selector y Mercado Pago) se sumó `esSeleccionable` (`operativo` o `SUSPENDIDO`) y `elegirDestino` prefiere un comercio operativo cuando hay uno.
- **El sondeo de 15 s (`iniciarPollingComercios`) solo arranca donde hay franja de comercio o el actor es Empleado.** El detalle de un pedido del comercio no tiene franja, así que para el Dueño nunca refrescaba: el pedido cerrado por el proceso de los 90 minutos quedaba en pantalla con sus botones. `initComercioPedidoDetalle` ahora lo arranca a propósito. Toda pantalla que dependa del estado del comercio y no tenga franja tiene que hacer lo mismo.
- **Excluir de la actividad del comercio una transición que el comercio nunca vio requiere una marca en la fila, no una consulta que adivine.** La primera idea fue ocultar los `CANCELADO` de pedidos que nunca tuvieron la fila `PENDIENTE_CONFIRMACION_COMERCIO`: rompía los fixtures de `ActividadComercioIntegrationTest` (9 fallos), que insertan un `CANCELADO` del Cliente sin esa fila. Se resolvió como `TIMEOUT_PAGO`: un valor propio en `historial_estado_pedido.motivo_timeout` (`CANCELACION_SIN_PAGO`, migración `V46`) que las dos consultas excluyen. Lección: una regla de visibilidad se escribe en la fila que la causa, no se infiere de otras filas.
- **Un test con dos hilos que comparan el mismo pedido contra el proceso automático tiene que fijar la hora del proceso.** Los tests de despachar o anular contra el proceso de 90 minutos corren el proceso con `LocalDateTime.now()` después de adelantar `suspendido_desde` 200 minutos por SQL; sin ese adelanto el proceso nunca encuentra el pedido y la carrera no existe. Con la revalidación del estado quitada de `cancelarPreparacionPorSuspension` fallan 18 de 32 ejecuciones.
- **El texto de un `409` que tiene que mostrar una salida ("Probá con otro comercio") conviene con un código estable en `data.codigo`.** `esConflictoDeCierre` (`js/apertura-comercio.js`) buscaba textos dentro del mensaje; ahora también reconoce `COMERCIO_SIN_PEDIDOS`, así que el carrito, el modal de producto y el checkout muestran el aviso con "Volver al catálogo" sin copiar el texto del servidor.
- **Un `mis-comercios` de Dueño con un comercio suspendido necesita `suspendidoDesde` y `motivoSuspension`; el del Empleado no.** El contrato ya estaba en la entrega A (`SuspensionComercioContratoTest`); la pantalla del Empleado calcula la franja con la hora límite de cada pedido y no con la fecha de la suspensión, por eso `PedidoEmpleadoResponseDTO` suma solo `limiteResolucionSuspension`.

### La idempotencia de un reembolso no puede leer con la foto de una transacción que esperó un bloqueo (tramo S2, cierre)

- **Síntoma:** `SuspensionClientePagoIntegrationTest.suspenderContraUnPagoAprobadoTerminaSiempreEnUnSoloResultadoCoherente` falló una vez (dos notas de crédito para el mismo pedido) y no se reprodujo en corridas solas. Con tres procesos de Maven contra la misma base, 4 de 48 ejecuciones.
- **Causa:** `MercadoPagoPagoService` es `@Transactional` de clase, así que toda la transacción del webhook tiene una foto de lectura (REPEATABLE READ) fijada por su primera consulta común, antes de esperar los bloqueos del pedido y del pago. Una consulta común hecha después de esperar (`notaCreditoService.montoCubierto`) usa esa foto y no ve lo que otra transacción confirmó mientras esperaba. Las lecturas con `FOR UPDATE` o `LOCK IN SHARE MODE` sí leen lo último confirmado, por eso `buscarPorPedidoParaActualizar` veía el pago bien y la lectura de las notas no.
- **Qué NO hacer:** reemplazar esa lectura por `LOCK IN SHARE MODE` sobre `nota_credito WHERE pago_id = ?`. Cierra la doble nota, pero cuando el pago todavía no tiene notas la lectura toma un bloqueo de intervalo del índice de `pago_id` que bloquea las altas de notas de otros pagos vecinos: dos pagos distintos se interbloquean (`Deadlock found` en el `INSERT` de `nota_credito`, 3 ejecuciones en la corrida de verificación).
- **Qué se hizo:** `ReembolsoService.montoCubiertoConfirmado` lee el monto cubierto en una transacción nueva (`REQUIRES_NEW`): foto actual y sin ningún bloqueo. El precedente de una segunda conexión mientras se sostiene la primera ya existía (el registro del resultado del reembolso después del commit). La prueba determinista es `ReembolsoFotoDeLaTransaccionIntegrationTest` (fija la foto con una lectura, deja que otra transacción cree y confirme la nota, y llama de nuevo). Regla general: una decisión que depende de lo que otra transacción acaba de confirmar, tomada dentro de una transacción que ya leyó antes de esperar, se hace con una lectura bloqueante por clave primaria o con una lectura en una transacción nueva, nunca con una consulta común; y si la consulta no tiene un registro exacto que bloquear (puede devolver cero filas), la lectura bloqueante toma bloqueos de intervalo.
- **Pendiente anotado:** solo se revisó la lectura de las notas de crédito. Las demás decisiones del webhook (`aplicarResultadoPago`) que se toman con una consulta común después de esperar un bloqueo no se auditaron una por una; si aparece otro síntoma de "decidió con datos viejos" en una transacción de `MercadoPagoPagoService`, empezar por la foto fijada antes de esperar.

### Un `page.clock` con `fastForward` mezcla el sondeo de la pantalla y el tiempo máximo de la llamada (spec 27)

- Dos tests del spec `27` (`una sola consulta de polling por ciclo, sin header, y sin el contador viejo` y `si ya no queda ningún comercio operativo ni pantalla de estado, vuelve al login`) dependen de adelantar 15 segundos de reloj simulado. Con la máquina cargada (corrida completa de 38 minutos) el primero queda con una consulta de menos y el segundo recibe `errores/timeout.html` (el tiempo máximo de la llamada también corre con el reloj simulado). Aislados con `--repeat-each=5`: el primero 3 de 5, el segundo 5 de 5. No son de S2; siguen en la lista de inestables.

### Subir un documento con el comercio suspendido no pasa por la regla de aptitud (tramo S2, cierre)

- `AptitudVentaComercioService.recalcular` devuelve de inmediato para un estado que no participa (`participa`) y, aun si participara, `decidir` solo mueve a un comercio `SUSPENDIDO` con el motivo `SUSPENSION_LEVANTADA`. Cualquier test que quiera comprobar "no se movió" tiene que mirar también `historial_estado_comercio` (no solo `comercio.estado`): una promoción seguida de una suspensión de vuelta dejaría el mismo estado final.
