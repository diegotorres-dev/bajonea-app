# MAPEO DFD NIVEL 2 — TRAMO E (P4.01 a P4.06)

Informe de solo lectura. El código manda sobre la documentación. Numeración que continúa los tramos anteriores: desvíos desde D-18, dudas desde C-13. Los textos entre comillas son literales del código. No repite lo ya relevado hasta `POST /carrito/items` (P3.02, P3.05).

Convenciones de ruta: `BE` = `backend/src/main/java/com/bajonea/backend/`, `FE` = `frontend/`.

---

## 1. P4.02 — Checkout y creación del pedido

### 1.1 Archivos y funciones

| Capa | Archivo | Función |
|---|---|---|
| Pantalla | `FE/checkout.html` | cuatro `<section>` (`step-1` a `step-4`), barra de progreso de 4 pasos con rótulos "Modalidad", "Dirección / Retiro", "Resumen", "Pago", `aside#checkout-resumen` (solo escritorio) |
| JS | `FE/js/checkout.js` | `initCheckout`, `renderStep2`, `renderEntregaDomicilio`, `pintarEntregaDomicilio`, `renderStep3`, `renderStep4`, `pintarResumen` |
| JS | `FE/js/direcciones.js` | `cargarDirecciones`, `abrirFormularioDireccion`, `crearTarjetaDireccionEntrega`, `MAXIMO_DIRECCIONES`, `MENSAJE_CUPO_LLENO`, `RUTA_MIS_DIRECCIONES` |
| JS | `FE/js/precio-cambio.js` | `crearPrecioUnitario` (aviso "Cambió el precio") |
| JS | `FE/js/apertura-comercio.js` | `estaAbiertoParaClientes`, `esConflictoDeCierre`, `crearBannerCierre`, `crearBotonVolverAlCatalogo` |
| Controller | `BE/controllers/PedidoController.java` | `confirmarPedido` (`POST /api/v1/pedidos/cliente`), `iniciarPago` (`POST /api/v1/pedidos/cliente/{id}/pago`), `sincronizarPago` |
| Service | `BE/services/PedidoService.java` | `confirmarPedido` (línea 157), `registrarHistorial` |
| Service | `BE/services/ConfiguracionTarifaService.java` | `calcularCargoCliente`, `calcularCargoComercio`, `obtenerVigente` |
| Service | `BE/services/ComercioService.java` | `validarAceptaPedidos(comercio, estado, cerradoManualmente)` (línea 239) |
| Service | `BE/services/EstadoUsuarioService.java` | `exigirNoSuspendido` |
| Service | `BE/services/MercadoPagoPagoService.java` | `iniciarOReusarPago` (línea 156), `prepararPago`, `crearPreferenciaEnMercadoPago` |
| Repos | `PedidoRepository`, `DetallePedidoRepository`, `CarritoRepository`, `ItemCarritoRepository`, `DireccionRepository.leerParaEntregaConBloqueoCompartido`, `ComercioRepository.leerEstadoConBloqueoCompartido`, `HistorialEstadoPedidoRepository` | |

### 1.2 Endpoints

| Método y ruta | Rol | `X-Comercio-Id` | Cuerpo |
|---|---|---|---|
| `POST /api/v1/pedidos/cliente` | `CLIENTE` (matcher de `/pedidos/cliente/**`) | no | `PedidoRequestDTO`: `tipoEntrega` (`DOMICILIO` o `RETIRO`), `direccionId` (opcional), `totalEsperado` (opcional) |
| `POST /api/v1/pedidos/cliente/{id}/pago` | `CLIENTE` | no | sin cuerpo (límite con P5.02) |

Respuesta de `POST /pedidos/cliente`: `201`, `mensaje` "Pedido confirmado correctamente", `data` = `PedidoResponseDTO` (estado `PENDIENTE_PAGO`, `pagoEstado` `PENDIENTE`).

### 1.3 Pantalla del checkout: qué muestra y de dónde sale cada dato

Carga inicial (`initCheckout`, en este orden):

1. `exigirContextoCliente()`; si no hay usuario o su rol no es `CLIENTE`, `window.location.href = 'login.html'`.
2. `GET /carrito`. Si falla (cualquier error) o `items` está vacío, redirige a `carrito.html` sin mensaje.
3. `GET /catalogo/comercios` (sin autenticación) y busca el comercio por `carrito.comercioId`. Si no aparece: banner de error "No pudimos cargar los datos del comercio. Volvé al carrito e intentá nuevamente." y el botón "Continuar" queda deshabilitado.
4. `estaAbiertoParaClientes(comercio)` (usa `estadoApertura` del catálogo). Si está cerrado: banner `crearBannerCierre('Este comercio está cerrado en este momento. No podés completar el pedido hasta que vuelva a abrir.')`, se oculta "Continuar" y aparece el botón "Volver al catálogo" (`btn-volver-al-catalogo`). La pantalla termina ahí (`return`).
5. Se restaura el checkout pendiente de `sessionStorage['bajonea_checkout_pendiente']` (`{comercioId, tipoEntrega, direccionId}`) si volvió de "Administrar mis direcciones": solo si el comercio coincide, la modalidad era `DOMICILIO` y el comercio acepta delivery.

**Paso 1 — Modalidad** (`step-1`):
- Título "¿Cómo querés recibir tu pedido?", subtítulo "Seleccioná la modalidad de tu pedido".
- Tarjetas según `comercio.aceptaDelivery` y `comercio.aceptaRetiro`: "Envío a domicilio" / "Recibís el pedido en tu dirección" y "Retiro en el local" / "Retirás tu pedido en {dirección del comercio o nombre}".
- Si no acepta ninguna: banner de error "Este comercio no tiene modalidades de entrega disponibles en este momento."
- Si hay una sola: `modalidadUnica = true`, la selecciona sola y avanza al paso 2 (el botón "Editar" del paso 3 deja de mostrarse y "Volver" del paso 2 vuelve al carrito).
- Con dos opciones, elegir una avanza sola (`avanzarAlElegir`) salvo en la primera carga; el botón "Continuar" (`btn-continuar-modalidad`) nace oculto y deshabilitado.

**Paso 2 — Retiro** (`renderStep2`, rama `RETIRO`): tarjeta con nombre del comercio y dirección ("Retiro en el local" si el comercio no tiene dirección), caja "¿Cómo funciona el retiro?" con las líneas "Confirmás el pedido.", "El comercio lo prepara y te avisa cuando está listo." y "Vas al local con tu nombre y número de pedido.", y botón "Confirmar retiro".

**Paso 2 — Domicilio** (`renderEntregaDomicilio` / `pintarEntregaDomicilio`):
- Título "¿Dónde recibís tu pedido?". Skeleton de dos tarjetas (`esqueleto-direcciones-entrega`, `aria-busy`) mientras carga `cargarDirecciones()` (lista de direcciones activas del Cliente, V42).
- Error de carga: banner "No pudimos cargar tus direcciones." y botón "Reintentar".
- Sin direcciones: banner "No tenés una dirección registrada. Agregá una para recibir tu pedido a domicilio." y botón "Agregar dirección" (abre el formulario de dirección; al guardar, la elige).
- Con direcciones: `radiogroup` "Dirección de entrega" con una tarjeta por dirección; elegida por defecto la que estaba elegida antes, si no la predeterminada (`principal`), si no la primera. Navegación por flechas.
- "Agregar otra dirección" (deshabilitado con 5 o más; muestra "Llegaste al máximo de 5 direcciones. Podés eliminar alguna para agregar otra." con enlace "Mis direcciones").
- "Administrar mis direcciones": guarda `{comercioId, tipoEntrega, direccionId}` en `sessionStorage` y va a `${RUTA_MIS_DIRECCIONES}&desde=checkout`.
- Botón "Confirmar dirección".
- El frontend **no compara** la localidad de la dirección con la del comercio ni con ninguna zona de reparto; tampoco la valida el backend (ver C-13).

**Paso 3 — Resumen** (`renderStep3`): título "Resumen de tu pedido"; tarjeta de modalidad ("Envío a domicilio" con la dirección formateada `calle número, piso/depto, localidad` y "Referencia: …" si tiene, o "Retiro en el local" con la dirección del comercio) con botón "Editar" (vuelve al paso 1; no aparece si `modalidadUnica`); "Desglose del pedido" con una línea `{cantidad}x {nombreProducto}` y el subtotal por ítem (si `item.precioCambio` muestra además el precio anterior tachado → precio actual); "Cargo por servicio" (`carrito.cargoServicioCliente`); "Total" = `subtotal + cargo`. Botón principal "Ir a pagar - $X". En escritorio el aside `checkout-resumen` repite las líneas, y su botón (`btn-resumen-accion`) replica el principal del paso.

**Paso 4 — Pago** (`renderStep4`): título "Pago", texto "Te vamos a redirigir a Mercado Pago para completar el pago.", total (`pedido.total` devuelto por el servidor) y botón "Ir a pagar con Mercado Pago". "Volver" oculto (`visibility: hidden`) y `checkout-volver` oculto en este paso.

**Lo que NO existe en el checkout:** no hay costo de envío ni tarifa por distancia (solo "Cargo por servicio"); no hay selección de método de pago (Mercado Pago es el único); no hay campo de notas del pedido (la única nota existe por ítem y se escribe al agregar al carrito, ver §2); no hay cupón ni propina.

### 1.4 Tarifa

- Única tarifa: `ConfiguracionTarifa` vigente (`configuracionTarifaService.obtenerVigente()`), leída en cada `GET /carrito` (previsualización) y de nuevo en `confirmarPedido` (valor real).
- `calcularCargoCliente`: si `tipoCargoCliente = FIJO` devuelve `cargoCliente` tal cual con 2 decimales (`HALF_UP`); si `PORCENTAJE`, `subtotal × valor / 100` con 2 decimales `HALF_UP`. El valor sembrado por `V10` es 200,00 `FIJO` para el cliente y 1,00 `PORCENTAJE` para el comercio (la tarifa vigente real la define el Administrador, ver P5 de otros tramos).
- El cargo del comercio (`calcularCargoComercio`) siempre es sobre el subtotal y no se muestra al Cliente.
- `total = subtotal + cargoServicioCliente`. No depende de la modalidad (retiro y domicilio pagan lo mismo).

### 1.5 `totalEsperado` y `precioVisto` (T3)

- `precio_visto` se estampa al **insertar** el ítem (`CarritoService.agregarItem`, `precioVisto(producto.getPrecio())`); no se actualiza al sumar cantidad a un ítem existente. Se compara solo en lectura (`ItemCarritoResponseDTO`): `precioCambio = precioVisto != null && precioVisto.compareTo(precioUnitario) != 0`, donde `precioUnitario` es el precio vigente del producto.
- El frontend envía `totalEsperado: totalConCargo` (`carrito.subtotal + cargoServicio` calculado en el cliente con el carrito cargado al entrar) en cada `POST /pedidos/cliente`.
- Backend (`confirmarPedido`, línea 224): si `totalEsperado != null` y `totalEsperado.compareTo(totalPedido) != 0` → `ConflictoComercioException` `409`, `data.codigo = "PRECIO_CAMBIO"`, mensaje "Los montos de tu pedido cambiaron. Revisá el nuevo total antes de pagar.", `data` con `subtotal`, `cargoServicioCliente`, `total` e `items` (lista de `ItemCarritoResponseDTO`). **No crea nada.** Si `totalEsperado` es `null` el servidor no compara.
- Reacción de la pantalla (`checkout.js`, líneas 579 a 595): reemplaza `carrito.items/subtotal/cargoServicioCliente/total` por los del `409`, pone `montosActualizados = true`, vuelve a dibujar el paso 3 y muestra un banner de advertencia (`aviso-total-cambio`): el texto del servidor si algún ítem trae `precioCambio`, o "El cargo por servicio cambió. Revisá el nuevo total antes de pagar." si ningún precio cambió. El botón cambia a "Confirmar con el nuevo total - $X" (testid `btn-confirmar-nuevo-total`). No hay límite de repeticiones.
- Texto por ítem: `<s>precio anterior</s> → {precio} c/u` y la etiqueta "Cambió el precio" (`crearPrecioUnitario`).

### 1.6 Validaciones de `confirmarPedido`, en orden

| # | Condición | Excepción / HTTP | Mensaje literal |
|---|---|---|---|
| 0 | `@Valid` de `PedidoRequestDTO`: `tipoEntrega` nulo | `400` | `tipoEntrega: Debés seleccionar una modalidad de entrega` (formato `campo: mensaje`, `data` = mapa campo→mensaje) |
| 0 | `totalEsperado` negativo o con más de 10 enteros / 2 decimales | `400` | "El total esperado no puede ser negativo" / "El total esperado no es válido" |
| 1 | Cliente `SUSPENDIDO` (`exigirNoSuspendido`, lectura con `LOCK IN SHARE MODE`) | `409` `CuentaSuspendidaException` (`data.codigo = CUENTA_SUSPENDIDA`) | el motivo de la suspensión; el frontend abre la pantalla de cuenta suspendida |
| 2 | no existe `Cliente` | `404` | "Cliente no encontrado" |
| 3 | no hay carrito o no tiene ítems | `409` | "El carrito está vacío" |
| 4 | comercio no encontrado al leer su estado | `404` | "Comercio no encontrado" |
| 5 | `validarAceptaPedidos` (estado y cierre leídos con `LOCK IN SHARE MODE`): `CERRADO_TEMPORALMENTE` | `409` | "Este comercio está cerrado en este momento" |
| 5b | `SUSPENDIDO` | `409` `COMERCIO_SIN_PEDIDOS` | "Este comercio no está recibiendo pedidos por ahora. Probá con otro comercio." |
| 5c | estado distinto de `APTO_VENTA` (aprobado sin cuenta de cobro/documentación, inactivo, etc.) | `409` | "Este comercio no está aceptando pedidos en este momento" |
| 5d | `cerrado_manualmente = true` | `409` | "Este comercio está cerrado en este momento" |
| 5e | fuera de toda franja horaria vigente | `409` | "Este comercio está cerrado en este momento. Podés hacer tu pedido dentro de su horario de atención." |
| 6 | `DOMICILIO` y el comercio no acepta delivery | `409` | "El comercio no ofrece entrega a domicilio" |
| 7 | `RETIRO` y el comercio no acepta retiro | `409` | "El comercio no permite retiro en el local" |
| 8 | `DOMICILIO` sin `direccionId` | `409` | "La dirección es obligatoria para entrega a domicilio" |
| 9 | la dirección no existe, es de otro Cliente o está eliminada (`leerParaEntregaConBloqueoCompartido`) | `404` | "Dirección no encontrada" |
| 10 | subtotal de un ítem (`precio × cantidad`) mayor que 99.999.999 | `400` `ValidacionException` | `El subtotal de "{producto}" supera el monto máximo permitido ($99999999)` |
| 11 | `subtotal + cargo` mayor que 99.999.999 | `400` | "El total del pedido supera el monto máximo permitido por el sistema ($99999999)" |
| 12 | `totalEsperado` distinto del total real | `409` `PRECIO_CAMBIO` | ver §1.5 |

Observaciones: la validación no revisa el estado de los productos del carrito (`DISPONIBLE`/`AGOTADO`/`DESCONTINUADO`): ese control se hace solo al agregar (`agregarItem`, "El producto no está disponible") y mediante la baja automática de carritos cuando el Dueño pasa un producto a `AGOTADO` o `DESCONTINUADO` (§2.7). Tampoco revisa explícitamente la cuenta de Mercado Pago del comercio: se infiere de `APTO_VENTA`; la verificación directa recién ocurre al crear la preferencia (`obtenerCuentaDelComercio`: `409` "El comercio de este pedido no tiene una cuenta de Mercado Pago vinculada. No se puede procesar el pago."). Un Cliente `BLOQUEADO` o `INACTIVO` no llega acá (su sesión se cierra).

### 1.7 Creación del pedido (pasos y escrituras)

Todo dentro de una sola transacción (`PedidoService` es `@Transactional` de clase) y con estos bloqueos, en orden: usuario del Cliente `LOCK IN SHARE MODE` (en `exigirNoSuspendido`), comercio `LOCK IN SHARE MODE` (`leerEstadoConBloqueoCompartido`, que además serializa contra cerrar el comercio y contra desvincular Mercado Pago), dirección `LOCK IN SHARE MODE` (`leerParaEntregaConBloqueoCompartido`). No toma `FOR UPDATE` sobre el carrito.

Escrituras:
1. `pedido` (`PedidoRepository.save`): `cliente_id`, `comercio_id`, `direccion_id` (origen, solo `DOMICILIO`), copia de entrega `entrega_calle`, `entrega_numero`, `entrega_piso_depto`, `entrega_codigo_postal`, `entrega_localidad_id`, `entrega_referencia` (todas nulas en `RETIRO`), `tipo_entrega`, `estado = PENDIENTE_PAGO`, `pago_estado = PENDIENTE`, `primer_aviso_emitido = false`, `subtotal`, `cargo_servicio_cliente`, `cargo_servicio_comercio`, `total`, `fecha_creacion = LocalDateTime.now(clock)` (reloj único, zona de `app.zona-horaria`). `turno_fecha`, `turno_horario_id` y `fecha_pago_confirmado` quedan nulos (se completan al pagar).
2. `detalle_pedido`: una fila por ítem con `producto_id`, `cantidad`, `precio_unitario` (precio vigente del producto en este instante), `nota` (la del ítem), `subtotal`, `estado = ACTIVO`. El nombre del producto **no se copia**: `DetallePedidoResponseDTO` lo lee del producto vivo (`detalle.getProducto().getNombre()`), así que un renombre posterior del producto se refleja en pedidos viejos (ver C-14).
3. `historial_estado_pedido`: una fila con `estado = PENDIENTE_PAGO`, `actor = CLIENTE`, `actor_usuario_id` = el Cliente, `motivo_timeout` nulo.

**El carrito NO se vacía acá.** Se vacía recién cuando el pago se aprueba (`confirmarOCancelarPagoAprobado` → `carritoService.vaciarSiEsDelComercio`, última hoja del orden de bloqueo). Un pago rechazado, un timeout o una cancelación sin pagar dejan el carrito intacto.

No hay llamada externa dentro de esta transacción. No se genera aviso in-app ni email al crear el pedido (el pedido recién nace; el comercio no lo ve hasta que se paga: `listarPedidosComercio` filtra por `findLlegadosPagadosByComercioId`, que exige una fila de historial en `PENDIENTE_CONFIRMACION_COMERCIO`).

### 1.8 Handoff a Mercado Pago (solo el límite con P5.02)

- Al terminar `POST /pedidos/cliente` la pantalla pasa al paso 4 con el pedido devuelto. El botón "Ir a pagar con Mercado Pago" se deshabilita, cambia a "Generando link de pago..." y llama `POST /pedidos/cliente/{id}/pago` con `handle5xxGlobally: false`.
- `iniciarOReusarPago` valida: Cliente no suspendido; el pedido es del Cliente (`404` "Pedido no encontrado" si no); si `pagoEstado = PAGADO` devuelve respuesta directa con `yaPagado = true`; si el estado no es `PENDIENTE_PAGO` → `409` "El pedido no está esperando el pago"; comercio `SUSPENDIDO` → `409` "Este comercio no está disponible en este momento"; sin cuenta de MP → `409` (texto en §1.6). Después crea la preferencia (o reusa la existente / busca el mejor pago) fuera de transacción.
- Lo que recibe la pantalla (`PagoResponseDTO`): `yaPagado`, `enRevision`, `urlPago`. Si `yaPagado`: toast "Tu pago se realizó correctamente" y redirige a `pedido-detalle.html?id={id}&pago=exito`. Si `enRevision`: toast "Tu pago está pendiente de confirmación" y reactiva el botón. Si no: `window.location.href = pago.urlPago`. Error `503`: toast de error con el mensaje del servidor y reactiva el botón. Cualquier otro error: banner de error con el mensaje o "No pudimos generar el link de pago. Intentá nuevamente.".
- `back_urls` de la preferencia (`MercadoPagoPagoService`, línea 522): `{app.frontend-base-url}/pedido-detalle.html?id={id}&pago=exito`, `...&pago=pendiente`, `...&pago=fallo`; `auto_return = "approved"`; la preferencia vence con el pedido.

### 1.9 Qué ve el Cliente al volver del pago

Página `pedido-detalle.html?id=N&pago=exito|pendiente|fallo` (+ `payment_id` o `collection_id`). En escritorio redirige a `pedidos.html` con el mismo `search`. `initPedidoDetalle` → `crearDetallePedido(...).ciclo()`:

- Si `pago` no es uno de los tres valores no hay ciclo: refresco cada 15 s del pedido mientras no esté en un estado final.
- Con `pago`, `ciclo()` llama `POST /pedidos/cliente/{id}/pago/sincronizar` (con `{paymentId}` si vino en la URL) hasta 15 veces cada 3 s (`MAX_INTENTOS_SINCRONIZACION`, `INTERVALO_SINCRONIZACION_MS`); con `pago=fallo` un solo intento. Mientras el pedido siga `PENDIENTE_PAGO` con `pagoEstado = PENDIENTE` y `pago` sea `exito` o `pendiente`, el encabezado dice "Estamos confirmando tu pago. Esta pantalla se actualiza sola." y el botón de pago muestra "El pago se está procesando" (deshabilitado).
- Toasts finales (`mostrarResultado`): `PAGADO` → "Tu pago se realizó correctamente"; `PENDIENTE_PAGO` con `pagoEstado = RECHAZADO` → "El pago no se pudo procesar. Podés intentar de nuevo desde la sección \"Mis pedidos\"." (error); `PENDIENTE_PAGO` con `exito` sin finalizar → "Tu pago se está procesando. Esto puede tardar unos segundos."; resto → "Tu pago está pendiente de confirmación."
- Estado del pedido en ese momento: `PENDIENTE_PAGO` (etiqueta "Esperando pago", texto "Todavía no pagaste este pedido.", o "No pudimos procesar tu pago. Podés intentar de nuevo." si `pagoEstado = RECHAZADO`) hasta que el webhook o la sincronización lo pasen a `PENDIENTE_CONFIRMACION_COMERCIO` ("Esperando al comercio": `Tu pedido fue enviado a {comercio}. Esperando confirmación.`). Con el comercio suspendido (`comercioNoDisponible`): etiqueta "Sin pagar", franja "Este comercio no está recibiendo pedidos por ahora." y ayuda "Vas a poder pagar cuando el comercio vuelva a estar disponible, si el pedido no venció."

### 1.10 Pedido en `PENDIENTE_PAGO` que no se paga (solo el límite)

`PedidoSchedulerService.expirarPagosVencidos` (`@Scheduled(fixedDelay = 60_000)`, `pedido.timeout.pago-minutos=30`): por cada pedido en `PENDIENTE_PAGO` con `fecha_creacion` anterior al corte, una transacción por pedido con `bloquearParaActualizar`; lo pasa a `CANCELADO_POR_SISTEMA`, `cancelado_por = SISTEMA`, `motivo = "Pago rechazado"` si `pagoEstado = RECHAZADO` o `"Pago no confirmado"` si no, historial con actor `SISTEMA` y `motivo_timeout = TIMEOUT_PAGO`, y aviso al Cliente `PEDIDO_CANCELADO_SISTEMA`: "Tu pedido #N fue cancelado automáticamente: no se confirmó el pago a tiempo.". Sin nota de crédito (no hubo pago). Estado final visible: "Cancelado" / "Tu pedido fue cancelado automáticamente.".

---

## 2. P4.01 — Gestión del carrito

### 2.1 Archivos y funciones

| Capa | Archivo | Función |
|---|---|---|
| Pantalla | `FE/carrito.html` | `#top-bar-slot`, `#carrito-content`, `#carrito-footer-slot`, `#bottom-nav-slot` |
| JS | `FE/js/carrito.js` | `initCarrito`, `pintar`, `renderConProductos`, `renderItem`, `renderVacio`, `crearAccionVaciarHeader`, `mostrarModalVaciarCarrito` |
| JS | `FE/js/catalogo.js` | `actualizarContadorCarrito` (contador del header y de la barra inferior), `renderTopBar`, `showToast` |
| JS | `FE/js/validators.js` | `excedeSubtotalMaximo`, `mensajeSubtotalMaximoExcedido` |
| Controller | `BE/controllers/CarritoController.java` | un método por endpoint |
| Service | `BE/services/CarritoService.java` | `verCarrito`, `agregarItem`, `actualizarCantidad`, `eliminarItem`, `vaciarCarrito`, `vaciarSiEsDelComercio`, `prepararQuitarProducto`, `quitarProductoDeLosCarritos` |
| Repos | `CarritoRepository`, `CarritoInsercionRepository` (`INSERT ... ON DUPLICATE KEY UPDATE`), `ItemCarritoRepository` (sentencias en bloque), `ProductoRepository.leerEstadoConBloqueoCompartido` | |

### 2.2 Endpoints (todos `CLIENTE`, sin `X-Comercio-Id`)

Base `/api/v1/carrito` (matcher `/carrito/**` = `hasRole("CLIENTE")`).

| Método y ruta | Cuerpo | HTTP | `mensaje` |
|---|---|---|---|
| `GET /carrito` | — | `200` | "Carrito obtenido correctamente" |
| `POST /carrito/items` | `ItemCarritoRequestDTO`: `productoId`, `cantidad`, `nota` | `201` | "Producto agregado al carrito" |
| `PUT /carrito/items/{id}` | `ActualizarCantidadItemCarritoRequestDTO`: `cantidad` | `200` | "Cantidad actualizada correctamente" |
| `DELETE /carrito/items/{id}` | — | `200` | "Ítem eliminado del carrito" |
| `DELETE /carrito` | — | `200` (`data: null`) | "Carrito vaciado correctamente" |

No existe un endpoint para editar solo la nota de un ítem: la nota solo se escribe en `POST /carrito/items` (y se sobrescribe si el producto ya estaba). La pantalla del carrito muestra la nota (`Nota: "{texto}"`) pero no permite editarla.

Respuesta de los cuatro que devuelven carrito: `CarritoResponseDTO` = `comercioId`, `nombreComercio`, `items[]`, `subtotal`, `cargoServicioCliente`, `total`, `hayCambioDePrecio`. Cada ítem: `id`, `productoId`, `nombreProducto`, `precioUnitario` (precio vigente), `cantidad`, `subtotal` (vigente × cantidad), `nota`, `precioVisto`, `precioCambio`.

### 2.3 Qué hace cada operación (orden exacto)

Regla común: toda operación que modifica el carrito toma la fila `carrito` con `FOR UPDATE` (`obtenerOCrearBloqueado`): `crearSiNoExiste` (`INSERT ... ON DUPLICATE KEY UPDATE`, primera sentencia), luego `findByClienteIdConBloqueo` y `entityManager.refresh(carrito, PESSIMISTIC_WRITE)`. El carrito se crea perezosamente (uno por Cliente). Si el usuario no existe: `404` "Cliente no encontrado".

**`GET /carrito`** (`verCarrito`): `findByClienteId`; si no existe, lo crea con el bloqueo; arma el DTO (`aResponseDTO`): lista los ítems, suma el subtotal con el precio vigente y, solo si `subtotal > 0`, calcula `cargoServicioCliente` con la tarifa vigente (con el carrito vacío el cargo es 0). La lectura no bloquea cuando el carrito ya existe.

**`POST /carrito/items`** (`agregarItem`):
1. `@Valid` (ver §2.4).
2. Lee el producto con `LOCK IN SHARE MODE` (`leerEstadoConBloqueoCompartido`) **antes** de bloquear el carrito: no existe → `404` "Producto no encontrado"; estado distinto de `DISPONIBLE` → `409` "El producto no está disponible".
3. Bloquea el carrito; vuelve a cargar el producto (`findById`).
4. `comercioService.validarAceptaPedidos(producto.getComercio())`: los mismos `409` de cierre, suspensión, no operativo y fuera de horario del §1.6 (filas 5 a 5e); ya relevado en P3.05.
5. Si el carrito no tiene comercio, lo fija al del producto. Si tiene otro: `409` "El carrito ya tiene productos de otro comercio. Vaciá el carrito para agregar de un comercio distinto."
6. Si el producto ya está en el carrito: suma la cantidad, con tope 20 (`Math.min(existente + nueva, 20)`, sin error), y reemplaza la nota por la recibida (incluso por `null`). **No toca `precio_visto`.** Si no está: inserta el ítem con `precio_visto = producto.precio` vigente.
7. Respuesta con el carrito completo.

**`PUT /carrito/items/{id}`** (`actualizarCantidad`): bloquea el carrito y ejecuta un `UPDATE` en bloque `actualizarCantidad(itemId, carritoId, cantidad)` (solo si el ítem es de ese carrito); 0 filas → `404` "Ítem no encontrado" (cubre ítem ajeno, inexistente o ya borrado). **No revalida** el estado del producto, el estado del comercio ni el subtotal máximo.

**`DELETE /carrito/items/{id}`** (`eliminarItem`): bloquea el carrito; `borrarDelCarrito` en bloque; 0 filas → `404` "Ítem no encontrado"; si no queda ningún ítem (`leerAlgunItemConBloqueo`), `carrito.comercio = null`.

**`DELETE /carrito`** (`vaciarCarrito`): bloquea el carrito, `borrarPorCarritoId`, `comercio = null`. Es idempotente (un carrito vacío responde `200` igual).

### 2.4 Validaciones y mensajes literales

| Dónde | Regla | HTTP | Mensaje |
|---|---|---|---|
| `ItemCarritoRequestDTO.productoId` | obligatorio | `400` | `productoId: El producto es obligatorio` |
| `ItemCarritoRequestDTO.cantidad` | obligatoria, 1 a 20 | `400` | `cantidad: La cantidad es obligatoria` / "La cantidad mínima es 1" / "La cantidad máxima es 20" |
| `ItemCarritoRequestDTO.nota` | hasta 255 caracteres | `400` | `nota: La nota no puede superar los 255 caracteres` |
| `ActualizarCantidadItemCarritoRequestDTO.cantidad` | igual que arriba | `400` | los mismos tres |
| `CarritoService.agregarItem` | producto inexistente / no disponible / otro comercio / comercio que no acepta pedidos | `404` / `409` | ver §2.3 |
| subtotal máximo | **no se valida en el backend del carrito**; solo en el frontend (`plusBtn`: `excedeSubtotalMaximo(precioUnitario, cantidad + 1)`, tope `99999999` por ítem) y en `confirmarPedido` | — | frontend: "No podés agregar más unidades: el subtotal de este producto superaría el máximo permitido ($99.999.999)." (toast de error) |

Formato del `400` de validación (`GlobalExceptionHandler.handleMethodArgumentNotValid`): `mensaje` = `campo: texto` unidos por `"; "`, `data` = mapa campo→texto. Un cuerpo ilegible da `400` "El cuerpo de la solicitud contiene datos con formato inválido".

### 2.5 Pantalla (`carrito.html` + `carrito.js`)

Carga (`initCarrito`): `exigirContextoCliente()`; si no es `CLIENTE`, `login.html`. Dibuja la barra inferior y, en escritorio, la barra de cliente. `mostrarEsqueleto(container, 'carrito')` (dos filas de skeleton y cabecera). `GET /carrito`: si falla, `mostrarErrorDeCarga` → "No pudimos cargar tu carrito." con botón "Reintentar" (`window.location.reload()`; `role="alert"`).

`pintar(carrito)`: normaliza nombres, llama `actualizarContadorCarrito()` y dibuja la barra superior con título "Mi carrito" y el destino de "Volver" (`comercio-detalle.html?id={comercioId}` si hay ítems, si no `index.html`). Con ítems, el encabezado trae la acción "Vaciar todo".

- **Estado vacío** (`renderVacio`): ícono de bolsa, "Tu carrito está vacío", "Explorá los comercios disponibles y agregá productos para comenzar tu pedido." y botón "Explorar comercios" (`index.html`). El pie se vacía.
- **Con productos** (`renderConProductos`): tarjeta del comercio ("Vas a hacer un pedido a" + nombre, con avatar), lista de ítems y pie (`cart-footer`): "Subtotal", "Cargo por servicio", "Total" y botón (enlace) "Confirmar pedido - $X" → `checkout.html`. Para las fotos y el avatar se piden `GET /catalogo/comercios` (una vez) y `GET /catalogo/comercios/{id}/productos`; si esta segunda falla (comercio ya no visible, por ejemplo), la pantalla sigue sin fotos y sin error.
- **Ítem** (`renderItem`): miniatura, nombre, precio unitario (`{precio} c/u`; con `precioCambio`: precio anterior tachado → precio vigente c/u y la etiqueta "Cambió el precio"), nota si existe, botón de tacho (`aria-label` "Eliminar {producto}"), stepper `−` / cantidad / `+` y subtotal del ítem.
- **Stepper:** `−` deshabilitado con cantidad 1 y `+` con cantidad 20. Ambos se deshabilitan mientras viaja el pedido. El código admite `cantidad < 1` (llamaría `DELETE` con toast "Quitaste {producto} del carrito") pero queda inalcanzable porque `−` está deshabilitado en 1. `PUT` exitoso: re-dibuja con la respuesta, sin toast. Error: toast de error con el mensaje del servidor o "No pudimos actualizar la cantidad.".
- **Quitar ítem:** **sin confirmación y sin "Deshacer"**. `DELETE /carrito/items/{id}`; toast "Quitaste {producto} del carrito"; re-dibuja con la respuesta (si queda vacío muestra el estado vacío). Error: toast "No pudimos eliminar el producto.".
- **"Vaciar todo"** (`btn-vaciar-carrito`): abre una hoja de confirmación con título "¿Vaciar el carrito?", texto "Vas a eliminar todos los productos del carrito. Esta acción no se puede deshacer.", acciones "Sí, vaciar carrito" (peligro; "Vaciando…" mientras envía; `DELETE /carrito`, toast "Vaciaste el carrito", re-dibuja vacío) y "Cancelar" (con el foco inicial).
- **Contador del carrito:** `actualizarContadorCarrito` (agrupa llamadas en vuelo) hace `GET /carrito`, suma las cantidades y pinta `header-carrito-badge` (con "9+" si supera 9) y `barra-carrito-badge` (oculto con 0; `aria-label` "Carrito, N producto(s)"). Solo para rol `CLIENTE`; cualquier error se ignora y queda en 0.

### 2.6 `precio_visto` (T3) en el carrito

- Se guarda al **insertar** el ítem (§2.3, paso 6). Sumar más unidades de un producto ya presente no lo actualiza.
- Se compara en cada respuesta (`ItemCarritoResponseDTO`): `precioCambio` verdadero si el precio vigente difiere. `CarritoResponseDTO.hayCambioDePrecio` es verdadero si algún ítem tiene `precioCambio`. El frontend del carrito no usa `hayCambioDePrecio`; usa `precioCambio` por ítem (`crearPrecioUnitario`).
- Subtotal, cargo y total del carrito ya se calculan con el precio vigente, así que el Cliente ve los valores nuevos antes de confirmar. El aviso desaparece cuando el ítem sale del carrito o el carrito se vacía tras el pago.

### 2.7 `PRODUCTO_REMOVIDO_CARRITO`

- **Quién lo genera:** `ProductoService.cambiarEstado` (Dueño o Empleado) cuando el producto pasa a `AGOTADO` o `DESCONTINUADO` (`quitaDeCarritos`). No ocurre al pasar a `DISPONIBLE` ni al editar el producto.
- **Mecánica:** `carritoService.prepararQuitarProducto(productoId)` (primera lectura común, después de bloquear el producto `FOR UPDATE`) busca los carritos que lo contienen y toma, en id ascendente, los usuarios de sus Clientes con `LOCK IN SHARE MODE`; luego `quitarProductoDeLosCarritos` bloquea los carritos afectados en id ascendente, borra los ítems de ese producto (`borrarPorCarritoIdYProductoId`), avisa a cada Cliente al que realmente se le borró un ítem y, si el carrito quedó vacío, `quitarComercio`. Es lo último que hace la transacción (el carrito es la última hoja del orden global).
- **A quién y con qué texto:** `notificacionService.crearParaCliente(clienteId, "El producto '{nombre}' ya no está disponible y fue eliminado de tu carrito.", PRODUCTO_REMOVIDO_CARRITO)`. Aviso in-app (canal `PUSH`), sin entidad asociada y sin email.
- **Cómo lo ve el Cliente:** en la campana de notificaciones; `FE/js/destino-aviso.js` le agrega el enlace "Ver carrito". El carrito, al recargarse (`carrito.js` no tiene refresco automático), ya no muestra el ítem.

### 2.8 Carrito de un comercio cerrado, suspendido o que dejó de aceptar pedidos

- **La pantalla del carrito no muestra ningún aviso anticipado** y el botón "Confirmar pedido" sigue activo (coincide con `requisitos-funcionales-cliente.md`, línea 23).
- Lo que lo impide: en `POST /carrito/items` el `409` de `validarAceptaPedidos`; en `checkout.html` el banner de cierre de §1.3 paso 4 (al entrar, con el estado del catálogo) y, al confirmar, los `409` de §1.6 (banner `crearBannerCierre` con "Volver al catálogo" si `esConflictoDeCierre`).
- `PUT /carrito/items/{id}`, `DELETE` de ítem y `DELETE /carrito` funcionan siempre: el Cliente puede vaciar un carrito de un comercio cerrado.
- Un comercio `SUSPENDIDO` o no visible deja de estar en `GET /catalogo/comercios`; el checkout lo trata como "No pudimos cargar los datos del comercio. Volvé al carrito e intentá nuevamente." (§1.3, paso 3).

### 2.9 Locks y orden de bloqueo (confirmado contra el código)

- Agregar: producto `LOCK IN SHARE MODE` → carrito `FOR UPDATE` (+ `refresh`) → lecturas comunes. Cambiar cantidad, quitar, vaciar: carrito `FOR UPDATE` → `UPDATE`/`DELETE` en bloque.
- `vaciarSiEsDelComercio` (pago aprobado): `bloquearPorClienteId` → filtra por comercio → `DELETE` + `quitarComercio`; no carga la entidad.
- Baja de un producto: usuarios (S, id ascendente) → carritos `FOR UPDATE` (id ascendente) → ítems → avisos.
- Orden global: `usuario` → … → `producto`/`pedido` → `pago` → `carrito` (última hoja). Coincide con `docs/CONCURRENCIA-Y-TRANSACCIONES.md` (punto 6).

---

## 3. P4.03 — Aceptar o rechazar un pedido (comercio)

### 3.1 Archivos y funciones

| Capa | Archivo | Función |
|---|---|---|
| Pantalla lista | `FE/comercio-pedidos.html` + `FE/js/comercio.js` | `initComercioPedidos`, `renderPedidoActivoCard`, `FILTROS_PEDIDOS`, `PRIORIDAD_ESTADO_PEDIDO` |
| Pantalla detalle | `FE/comercio-pedido-detalle.html` + `FE/js/comercio.js` | `initComercioPedidoDetalle`, `renderPedidoDetalleComercio`, `renderAccionesPendiente`, `abrirHojaMotivoPedido`, `mostrarErrorDeAccion` |
| Plazo | `FE/js/pedidos-nuevos.js` | `textoVencimientoPedido`, `esPedidoNuevo` |
| Controller | `BE/controllers/PedidoController.java` | `aceptarPedido`, `rechazarPedido`, `listarPedidosComercio`, `paraActor` |
| Service | `BE/services/PedidoService.java` | `aceptarPedido` (631), `rechazarPedido` (649), `obtenerPedidoDelComercioParaActualizar`, `bloquear`, `exigirQueNoSeaPedidoPropio`, `expirarPedidosSinRespuestaComercio` (1044) |
| Service | `ComercioActivoService.validarComercioAceptaPedidosNuevos`, `ReembolsoService.generarNotaYReembolsarTotal`, `NotificacionService.crearParaCliente` / `crearParaEquipo` | |
| Scheduler | `BE/services/PedidoSchedulerService.java` | `expirarPedidosSinRespuestaComercio` |

### 3.2 Endpoints

| Método y ruta | Rol | `X-Comercio-Id` | Cuerpo | Respuesta |
|---|---|---|---|---|
| `PUT /api/v1/pedidos/comercio/{id}/aceptar` | Dueño o Empleado activo (ruta delegable en `DelegacionEmpleado`) | **obligatorio**; sin header `400`, ajeno o inactivo `404` `COMERCIO_NO_DISPONIBLE` ("Comercio no encontrado") | sin cuerpo | `200`, "Pedido aceptado correctamente"; Dueño: `PedidoResponseDTO`; Empleado: `PedidoEmpleadoResponseDTO` |
| `PUT /api/v1/pedidos/comercio/{id}/rechazar` | ídem | ídem | `RechazoPedidoRequestDTO`: `motivo` (`MotivoRechazo`, `@NotNull`), `comentario` (`@Size(max = 500)`) | `200`, "Pedido rechazado correctamente" |
| `GET /api/v1/pedidos/comercio` | ídem | obligatorio | — | `200`, "Pedidos obtenidos correctamente" (solo pedidos que alguna vez llegaron pagados) |

`ComercioActivo` va primero en los parámetros para que el resolver corra antes de leer el cuerpo (un Empleado inactivo con un cuerpo inválido recibe el `404`, no el `400`).

### 3.3 Aceptar: pasos en orden

1. Resolver de comercio activo (`ComercioActivoService.resolver`): Dueño si el comercio es suyo; Empleado si hay relación `ACTIVO` y comercio `APROBADO`, `APTO_VENTA`, `SUSPENDIDO` o `CERRADO_TEMPORALMENTE`; si no, `404`.
2. `obtenerPedidoDelComercio(comercioId, pedidoId)`: lectura; `404` "Pedido no encontrado" si el pedido no existe, es de otro comercio o nunca llegó pagado (`llegoPagado`).
3. `bloquear(pedidoId, actorUsuarioId, comercioActivo, aceptaPedidoNuevo = true, ...)`: usuarios del actor, del Cliente y del Dueño con `LOCK IN SHARE MODE` en id ascendente (actor `SUSPENDIDO` → `CuentaSuspendidaException`, `409` con `data.codigo = CUENTA_SUSPENDIDA`) → si es Empleado, relación `LOCK IN SHARE MODE` (si ya no es `ACTIVO`, `404` `COMERCIO_NO_DISPONIBLE`) → estado del comercio `LOCK IN SHARE MODE` → pedido `FOR UPDATE` con `refresh`.
4. Guard del comercio (solo al aceptar): `validarComercioAceptaPedidosNuevos`:
   - Dueño con comercio `SUSPENDIDO` → `409` `COMERCIO_SIN_OPERACION`, "El comercio está suspendido: no podés aceptar pedidos nuevos. Sí podés rechazarlos." (con el comercio en `CERRADO_TEMPORALMENTE` el Dueño sí acepta).
   - Empleado con comercio fuera de `APROBADO`/`APTO_VENTA`/`SUSPENDIDO`/`CERRADO_TEMPORALMENTE` → `404`; con `SUSPENDIDO` o `CERRADO_TEMPORALMENTE` → `409` `COMERCIO_SIN_OPERACION`, "El comercio no está operativo: no podés aceptar pedidos nuevos. Sí podés rechazarlos.".
5. `exigirQueNoSeaPedidoPropio`: Empleado que es el Cliente del pedido → `409` `PEDIDO_PROPIO`, "No podés gestionar tus propios pedidos".
6. Estado distinto de `PENDIENTE_CONFIRMACION_COMERCIO` → `409` "El pedido ya fue resuelto".
7. Escrituras: `pedido.estado = EN_PREPARACION`; fila de `historial_estado_pedido` con `estado = EN_PREPARACION`, `actor = DUENO` o `EMPLEADO` y el usuario que actuó (sin `motivo_timeout`).
8. Aviso al Cliente (`crearParaCliente`, canal `PUSH`, tipo `PEDIDO_ACEPTADO`, entidad `PEDIDO`): "Tu pedido a {nombre del comercio} fue aceptado y está en preparación." (no incluye el número de pedido).
9. Devuelve `aResponseDTOParaComercio`. No hay llamada externa, no hay email y no cambia el turno (el turno del pedido se fijó al pagar).

### 3.4 Rechazar: pasos en orden

Pasos 1 a 3 y 5 y 6 iguales (sin el guard del paso 4: **rechazar no mira el estado del comercio**, ni siquiera `SUSPENDIDO`). Luego:

1. Estado distinto de `PENDIENTE_CONFIRMACION_COMERCIO` → `409` "El pedido ya fue resuelto".
2. `motivo = OTRO` con `comentario` nulo o en blanco → `400` `ValidacionException`, "Ingresá un comentario para especificar el motivo del rechazo.".
3. Escrituras: `pedido.estado = RECHAZADO`, `cancelado_por = COMERCIO`, `motivo_rechazo = {motivo}`, `comentario_rechazo = {comentario tal cual llegó}`; historial con actor `DUENO`/`EMPLEADO`.
4. `reembolsoService.generarNotaYReembolsarTotal(pedido, RECHAZO_COMERCIO)`: crea la `nota_credito` **en la misma transacción** (si no se puede escribir, el pedido no cambia de estado) y deja la llamada a Mercado Pago para después del commit (`EjecucionPostCommit`). Devuelve `true` si el pedido tiene nota (hay devolución en gestión). El detalle del reembolso es de P5.04.
5. Aviso al Cliente (tipo `PEDIDO_RECHAZADO`): `"Tu pedido #{id} a {comercio} fue rechazado por el comercio. Motivo: {etiqueta}."` + `" Estamos gestionando la devolución de tu pago."` si hay nota + `" {comentario}"` si hay comentario no vacío.
6. Respuesta con el estado del reembolso incluido (`reembolsoEstado`, `reembolsoMonto`, `reembolsoMotivo`).

**Motivo:** obligatorio, **lista cerrada** (`MotivoRechazo`, 7 valores) con etiqueta: `SIN_STOCK` "Sin stock", `CERRADO` "Comercio cerrado", `ALTO_VOLUMEN_PEDIDOS` "Alto volumen de pedidos", `PRODUCTO_NO_DISPONIBLE_TEMPORAL` "Producto no disponible temporalmente", `SIN_DELIVERY_DISPONIBLE` "Sin delivery disponible", `PROBLEMA_TECNICO` "Problema técnico", `OTRO` "Otro". Comentario opcional de hasta 500 caracteres (`@Size`, sin mensaje propio: ver C-15); obligatorio solo con `OTRO`.

### 3.5 Expiración sin respuesta (`EXPIRADO`)

- Job: `PedidoSchedulerService.expirarPedidosSinRespuestaComercio`, `@Scheduled(fixedDelay = 300_000)` (cada 5 minutos entre el fin de una corrida y el inicio de la siguiente); solo corre si `pedido.jobs.habilitado` (por defecto `true`; `false` en el perfil `test`).
- Umbral: `pedido.timeout.respuesta-comercio-minutos=30` en `application.properties` (`PedidoTimeoutProperties.respuestaComercioMinutos`). Se mide desde la **última fila del historial con estado `PENDIENTE_CONFIRMACION_COMERCIO`** (`obtenerFechaEntradaAEstado`), es decir, desde el momento del pago confirmado. Como el job corre cada 5 minutos, el vencimiento real ocurre entre 30 y 35 minutos.
- Por cada id en `PENDIENTE_CONFIRMACION_COMERCIO` (`findIdsByEstado`): una transacción propia (`enTransaccionPorPedido`; un error no frena a los demás, solo `log.error`), `bloquearParaActualizarConEquipo(pedidoId, null)` (usuarios del Cliente, del Dueño y de los Empleados candidatos con `LOCK IN SHARE MODE` y sus relaciones por clave primaria, luego el pedido `FOR UPDATE`), revalida el estado y el plazo con el pedido bloqueado.
- Efecto: `estado = EXPIRADO`, `cancelado_por = SISTEMA`, historial con actor `SISTEMA` y `motivo_timeout = TIMEOUT_RESPUESTA_COMERCIO`, nota de crédito `EXPIRACION_SIN_RESPUESTA` (misma transacción; llamada a Mercado Pago después del commit).
- Avisos: al Cliente (`PEDIDO_EXPIRADO_CLIENTE`): "El comercio no respondió en 30 minutos tu pedido #{id}. Se canceló y estamos gestionando la devolución de tu pago; podés ver su estado en el detalle del pedido." (el "30" sale de la propiedad); al equipo (Dueño y cada Empleado `ACTIVO`, sin el Cliente del pedido si es Empleado del comercio; `PEDIDO_EXPIRADO_COMERCIO`): "El pedido #{id} se canceló porque nadie lo respondió a tiempo.".
- Plazo visible para el comercio: `limiteRespuestaComercio` = fecha del pago + 30 minutos (`limiteRespuestaComercio(...)`), solo en `PENDIENTE_CONFIRMACION_COMERCIO`.

### 3.5b Aviso al comercio de un pedido nuevo (límite con P5.02)

Lo emite `confirmarOCancelarPagoAprobado` al pagarse: `crearParaEquipo(...)`: "Pedido nuevo #{id} de {nombre} {apellido}." (tipo `NUEVO_PEDIDO`, entidad `PEDIDO`) al Dueño y a cada Empleado `ACTIVO` (sin el Cliente si es Empleado del comercio).

### 3.6 Pantalla del comercio

**Lista** (`comercio-pedidos.html`, `initComercioPedidos`): barra "Pedidos"; `GET /pedidos/comercio`; chips (`FILTROS_PEDIDOS`) "Todos", "Pendientes", "En preparación", "En camino", "Listo para retirar", "Rechazados" (el filtro "Rechazados" filtra por `RECHAZADO` solamente, no incluye `ANULADO`); orden por prioridad de estado (pendientes primero, después preparación, en camino y listos, rechazados y anulados, finales, y `PENDIENTE_PAGO` al final). Tarjeta (`renderPedidoActivoCard`): nombre del Cliente, etiqueta "Nuevo" si `esPedidoNuevo`, chip "Tu pedido" si `esPedidoPropio`, "Pedido #N · {cantidad} producto(s) · {fecha/hora del pago}", texto de plazo (`textoVencimientoPedido`: "Respondé antes de 30 minutos" mientras es nuevo; después "Vence en N minutos" / "Vence en 1 minuto" / "Está por vencer"), estado con punto de color (`ESTADO_BADGE_COMERCIO`: "Nuevo" para `PENDIENTE_CONFIRMACION_COMERCIO`, "En preparación", "En camino", "Listo para retirar", "Entregado", "Rechazado", "Anulado", "Cancelado", "Expirado", "No retirado", y "Estado no disponible" por defecto), chip de reembolso, total (`pedido.total`) y chevron. Sondeo de la lista cada 15 s (`suscribirComercios`/`iniciarPollingComercios`). En escritorio la selección abre el detalle en un panel (`pedido-detalle-panel`) sin navegar.

**Detalle** (`comercio-pedido-detalle.html?id=N`, en escritorio redirige a `comercio-pedidos.html?id=N`; `renderPedidoDetalleComercio`):
- Encabezado de estado: `PENDIENTE_CONFIRMACION_COMERCIO` → "Pendiente" / "Este pedido está esperando tu confirmación." (Empleado: "Este pedido está esperando la confirmación del comercio."); `RECHAZADO` → "Rechazado" / "Rechazaste este pedido." (Empleado: "El comercio rechazó este pedido.") con el motivo (`motivoRechazo`) y el comentario.
- Tarjetas: Cliente, modalidad (dirección de entrega con "Referencia: …" o "El cliente retira el pedido en tu local."), desglose con `{cantidad}x {producto}` y `Nota: "…"` por ítem. Dueño: línea "Cargo por servicio (1%)" con `-$X` (el "1%" está escrito en el código del frontend, no sale de la tarifa) y "Total" = `pedido.neto`; Empleado (`vistaReducida`): "Subtotal", "Cargo por servicio del cliente" y "Total pagado" = `pedido.total`.
- Botones (solo si `contextoPuedeGestionarPedidos()`, el pedido no es propio y el estado es `PENDIENTE_CONFIRMACION_COMERCIO`): "Aceptar pedido" (`btn-aceptar-pedido`; **se oculta solo si el comercio activo está `SUSPENDIDO`**, `comercioActivoSuspendido()`; con `CERRADO_TEMPORALMENTE` el Empleado ve el botón y recibe el `409` del paso 4 del §3.3) y "Rechazar pedido" (`btn-rechazar-pedido`).
- Aceptar: botón "Aceptando..." (`setLoading`), éxito: toast "Pedido aceptado" y re-dibuja con el pedido devuelto (ya con "Marcar como despachado"/"Marcar como listo para retirar" y "Anular pedido"). Error `409`: `mostrarAvisoFijo` con el mensaje del servidor (aviso fijo `aviso-fijo` en `aviso-accion-slot`), y el botón vuelve a "Aceptar pedido"; otros errores: toast de error con el mensaje o "No pudimos aceptar el pedido".
- Rechazar: hoja `modal-rechazar-pedido`, título "¿Rechazar el pedido #N?", párrafos "El cliente recibe la devolución de todo el pago por Mercado Pago. Puede demorar en verse en su cuenta." y "Le avisamos el motivo y tu comentario.", campo "Motivo del rechazo" (placeholder "Seleccioná un motivo"), campo "Comentario (opcional)" que pasa a "Comentario" con `OTRO` (placeholder "Agregá una aclaración para el cliente"), validaciones locales "Seleccioná un motivo de rechazo." e "Ingresá un comentario para especificar el motivo del rechazo.", acciones "Rechazar pedido" ("Rechazando…") y "Volver" (foco inicial). Éxito: cierra la hoja, toast "Pedido rechazado" y re-dibuja en estado "Rechazado". Error: el mensaje del servidor queda dentro de la hoja (la hoja no se cierra) y, si fue `409`, el detalle se vuelve a pedir (`GET /pedidos/comercio`) y se muestra el aviso fijo con el estado real.
- Conflicto por otro integrante del equipo: gana la primera acción; la segunda recibe `409` "El pedido ya fue resuelto" y la pantalla se actualiza con el estado vigente (el aviso fijo se conserva, `avisoInicial`).
- Dueño frente a Empleado: el Empleado recibe `PedidoEmpleadoResponseDTO` (sin comisión ni neto, sin `clienteId`, sin datos de Mercado Pago; con `esPedidoPropio`), textos propios (`textoEmpleado`) y el mismo set de botones; el Dueño ve además `neto`, el cargo del comercio y el bloque de reclamo.
- Pedido propio de un Empleado: nota "Hiciste este pedido como cliente. No podés gestionarlo desde acá." y sin botones.
- Sección "Recorrido del pedido" (`GET /pedidos/comercio/{id}/trazabilidad`): "No pudimos cargar el recorrido del pedido." si falla (relevada en otro tramo).

---

## 4. P4.04 — Avance de estados del pedido

### 4.1 Tabla de transiciones tal como las implementa el código

| Desde | Hacia | Actor (en `historial_estado_pedido.actor`) | Disparador |
|---|---|---|---|
| (nace) | `PENDIENTE_PAGO` | `CLIENTE` | `POST /pedidos/cliente` |
| `PENDIENTE_PAGO` | `PENDIENTE_CONFIRMACION_COMERCIO` | `SISTEMA` | pago aprobado (webhook o `POST .../pago/sincronizar`), `confirmarOCancelarPagoAprobado` |
| `PENDIENTE_PAGO` | `CANCELADO_POR_SISTEMA` | `SISTEMA` | job de pago (60 s, 30 min); cancelación por suspensión del Cliente; pago aprobado con Cliente o comercio suspendido |
| `PENDIENTE_PAGO` | `CANCELADO` | `CLIENTE` | `PUT /pedidos/cliente/{id}/cancelar` (motivo de historial `CANCELACION_SIN_PAGO`) |
| `PENDIENTE_CONFIRMACION_COMERCIO` | `EN_PREPARACION` | `DUENO` o `EMPLEADO` | `PUT /pedidos/comercio/{id}/aceptar` |
| `PENDIENTE_CONFIRMACION_COMERCIO` | `RECHAZADO` | `DUENO` o `EMPLEADO`; `SISTEMA` por suspensión (Tramo D) | `PUT .../rechazar` |
| `PENDIENTE_CONFIRMACION_COMERCIO` | `EXPIRADO` | `SISTEMA` | job sin respuesta (5 min, 30 min) |
| `PENDIENTE_CONFIRMACION_COMERCIO` | `CANCELADO` | `CLIENTE` | `PUT .../cancelar` |
| `EN_PREPARACION` | `EN_CAMINO` (si `tipo_entrega = DOMICILIO`) o `LISTO_PARA_RETIRAR` (si `RETIRO`) | `DUENO` o `EMPLEADO` | `PUT .../despachar` |
| `EN_PREPARACION` | `ANULADO` | `DUENO` o `EMPLEADO` | `PUT .../anular` |
| `EN_PREPARACION` | `CANCELADO` | `CLIENTE` | `PUT .../cancelar` |
| `EN_PREPARACION` | `ANULADO` / `CANCELADO_POR_SISTEMA` | `SISTEMA` | topes de la suspensión (Tramo D) |
| `EN_CAMINO` | `ENTREGADO` | `CLIENTE` (`PUT /pedidos/cliente/{id}/entregar`) o `SISTEMA` (autoconfirmación a los 90 min) | Tramo F |
| `LISTO_PARA_RETIRAR` | `ENTREGADO` | `DUENO` o `EMPLEADO` (`PUT .../entregar`) | Tramo F |
| `LISTO_PARA_RETIRAR` | `NO_RETIRADO` | `DUENO`/`EMPLEADO` (`PUT .../no-retirado`) o `SISTEMA` (suspensión) | Tramo F |

`ActorPedido` tiene `CLIENTE`, `DUENO`, `EMPLEADO` y `SISTEMA`. Un domicilio nunca pasa por `LISTO_PARA_RETIRAR` y un retiro nunca por `EN_CAMINO` (el destino de `despachar` lo decide `tipoEntrega`). Estados finales: `ENTREGADO`, `NO_RETIRADO`, `RECHAZADO`, `CANCELADO`, `ANULADO`, `CANCELADO_POR_SISTEMA`, `EXPIRADO`.

### 4.2 Mensajes literales de transición inválida (todos `409`, `ConflictoDeNegocioException`)

| Acción | Condición | Mensaje |
|---|---|---|
| aceptar, rechazar | estado ≠ `PENDIENTE_CONFIRMACION_COMERCIO` | "El pedido ya fue resuelto" |
| despachar | `PENDIENTE_CONFIRMACION_COMERCIO` | "Primero tenés que aceptar el pedido" |
| despachar | cualquier otro estado ≠ `EN_PREPARACION` | "El pedido ya fue resuelto" |
| anular | `PENDIENTE_CONFIRMACION_COMERCIO` | "Un pedido sin aceptar no se anula, se rechaza" |
| anular | cualquier otro estado ≠ `EN_PREPARACION` | "El pedido ya no se puede anular" |
| entregar / no-retirado (comercio) | `PENDIENTE_CONFIRMACION_COMERCIO` / `EN_PREPARACION` / `EN_CAMINO` / otro | "Primero tenés que aceptar el pedido" / "El pedido todavía está en preparación" / "El pedido está en camino: lo confirma el cliente" / "El pedido ya fue resuelto" |
| confirmar entrega (Cliente) | `PENDIENTE_CONFIRMACION_COMERCIO` o `EN_PREPARACION` / `ENTREGADO` / otro | "Tu pedido todavía no está en camino" / "Este pedido ya figura como entregado" / "El pedido ya fue resuelto" |
| cancelar (Cliente) | fuera de `PENDIENTE_PAGO`, `PENDIENTE_CONFIRMACION_COMERCIO`, `EN_PREPARACION` | "El pedido ya no se puede cancelar" |

### 4.3 Transiciones de este tramo, una por una

**`EN_PREPARACION` → `EN_CAMINO` / `LISTO_PARA_RETIRAR`** (`avanzarAEntregaEnCurso`, `PUT /pedidos/comercio/{id}/despachar`, mismo rol, header y bloqueos que aceptar pero **sin** el guard de comercio no operativo, así que funciona con el comercio suspendido): escribe `pedido.estado` y el historial (actor del comercio). Aviso al Cliente (canal `PUSH`, entidad `PEDIDO`):
- domicilio, `PEDIDO_EN_CAMINO`: "Tu pedido de {comercio} fue despachado y está en camino.";
- retiro, `PEDIDO_LISTO_RETIRO`: "Tu pedido de {comercio} está listo para retirar en el local.".
Sin reembolso ni email. Respuesta `200` "Pedido despachado correctamente".

**`EN_PREPARACION` → `ANULADO`:** P4.06 (§6). **Cliente `→ CANCELADO`:** P4.05 (§5). **Aceptar / rechazar / expirar:** P4.03.

### 4.4 Pantallas

**Comercio** (`renderAccionesEnPreparacion`): en `EN_PREPARACION`, botón principal "Marcar como despachado" (domicilio) o "Marcar como listo para retirar" (retiro) (`btn-despachar-pedido`, "Actualizando..." mientras envía; toast "Pedido actualizado"; el `409` sale como aviso fijo) y "Anular pedido". En `EN_CAMINO` el comercio no tiene botones (encabezado "En camino": "Despachaste este pedido. Está en camino al cliente."; Empleado: "Este pedido está en camino al cliente."). En `LISTO_PARA_RETIRAR`: "Entregar" y "Cerrar como no retirado" (Tramo F).

**Cliente** (`pedido-detalle.html` / `pedidos.js`, `ESTADO_INFO`): etiqueta y texto por estado: `PENDIENTE_PAGO` "Esperando pago" / "Todavía no pagaste este pedido."; `PENDIENTE_CONFIRMACION_COMERCIO` "Esperando al comercio" / "Tu pedido fue enviado a {comercio}. Esperando confirmación."; `EN_PREPARACION` "En preparación" / "{comercio} aceptó tu pedido y lo está preparando."; `EN_CAMINO` "En camino" / "Tu pedido de {comercio} está en camino."; `LISTO_PARA_RETIRAR` "Listo para retirar" / "Tu pedido está listo para retirar en {comercio}."; `ENTREGADO` "Entregado" / "Tu pedido fue entregado.". Botones del Cliente: ver §5 (cancelar) y Tramo F (confirmar recepción). Se actualiza solo: sondeo de 15 s del pedido mientras el estado no sea final y la pestaña esté visible (`firmaDelPedido` compara estado, `pagoEstado`, `comercioNoDisponible`, `reembolsoEstado`).

### 4.5 Jobs que avanzan o cierran estados por tiempo (`PedidoSchedulerService`, todos `fixedDelay`)

| Job | Frecuencia | Umbral (`application.properties`) | Pertenece a |
|---|---|---|---|
| `expirarPagosVencidos` | 60 s | `pago-minutos=30` | P4.02 (límite) |
| `expirarPedidosSinRespuestaComercio` | 300 s | `respuesta-comercio-minutos=30` | **P4.03** |
| `avisar75MinYAutoconfirmar` | 60 s | `aviso-en-camino-minutos=75`, `autoconfirmacion-en-camino-minutos=90` | Tramo F |
| `autoconfirmarRetirosPorSuspension` | 300 s | `retiro-suspension-minutos=90` | Tramo D / F |
| `cancelarPreparacionPorSuspension` | 60 s | `preparacion-suspension-minutos` (90 por defecto en el código, sin entrada en `application.properties`) | Tramo D |
| `rechazarPendientesPorSuspension` | 60 s | — | Tramo D |
| `procesarPedidosSinAtencionPorSuspensionDeDueno` | 60 s | — | Tramo D |

No hay job que mueva `EN_PREPARACION` por tiempo salvo los de suspensión. `PedidoTimeoutProperties.noRetiradoEsperaMinutos` (60) no es de un job: es la espera del botón manual (Tramo F).

---

## 5. P4.05 — Cancelación por el Cliente

### 5.1 Archivos y funciones

`BE/controllers/PedidoController.cancelarPedido`; `BE/services/PedidoService.cancelarPedido` (línea 838), `bloquearParaActualizarConEquipo`, `ReembolsoService.generarNotaYReembolsarTotal`; `FE/js/pedidos.js`: `abrirHojaCancelarPedido`, `abrirHojaDeAccionCliente`, `renderAccionesCliente`.

### 5.2 Endpoint

`PUT /api/v1/pedidos/cliente/{id}/cancelar`: rol `CLIENTE`, sin cuerpo, sin `X-Comercio-Id`. Respuesta `200`, "Pedido cancelado correctamente", `PedidoResponseDTO` (vista del Cliente, con `reembolsoEstado`, `reembolsoMonto`, `reembolsoMotivo`).

### 5.3 Reglas y pasos

1. `obtenerPedidoDelCliente`: `404` "Pedido no encontrado" si no existe o es de otro Cliente.
2. `bloquearParaActualizarConEquipo(pedidoId, usuarioId)`: usuarios del Cliente (actor), del Dueño y de los Empleados candidatos `LOCK IN SHARE MODE` en id ascendente (si el Cliente está `SUSPENDIDO`, `CuentaSuspendidaException`: una cuenta suspendida **no puede cancelar**), relaciones de los candidatos, pedido `FOR UPDATE`.
3. Estados permitidos: `PENDIENTE_PAGO`, `PENDIENTE_CONFIRMACION_COMERCIO` y `EN_PREPARACION`. Cualquier otro: `409` "El pedido ya no se puede cancelar". **No hay plazo de tiempo, no depende de la modalidad y no mira el estado del comercio** (puede cancelar aunque el comercio esté suspendido o cerrado).
4. Escrituras: `pedido.estado = CANCELADO`, `cancelado_por = CLIENTE`.
5. Si venía de `PENDIENTE_PAGO`: historial (actor `CLIENTE`, usuario, `motivo_timeout = CANCELACION_SIN_PAGO`); **sin** nota de crédito, **sin** aviso y **sin** tocar el carrito (queda intacto); responde y termina.
6. Si venía de `PENDIENTE_CONFIRMACION_COMERCIO` o `EN_PREPARACION`: historial (actor `CLIENTE`); `generarNotaYReembolsarTotal(pedido, CANCELACION_CLIENTE)` — reembolso **total** del pago, nota creada en la misma transacción y llamada a Mercado Pago después del commit (detalle en P5.04); aviso al equipo del comercio (`PEDIDO_CANCELADO_CLIENTE`, Dueño y cada Empleado `ACTIVO`, sin el Cliente si es Empleado del comercio): "El cliente canceló el pedido #{id}.".
7. Al Cliente no se le crea aviso ni email (la acción es suya; la pantalla muestra el resultado). Si un pago aprobado llega después sobre un pedido cancelado sin pagar, el webhook lo devuelve (`reembolsarPagoTardio`, motivo `PAGO_TARDIO`).

### 5.4 Pantalla

- Botón "Cancelar pedido" (`btn-cancelar-pedido`, estilo peligro con contorno): aparece en `PENDIENTE_CONFIRMACION_COMERCIO` y `EN_PREPARACION`. En `PENDIENTE_PAGO` **solo aparece si `comercioNoDisponible` es verdadero** (comercio suspendido, junto con "Ir a pagar" deshabilitado y la ayuda "Vas a poder pagar cuando el comercio vuelva a estar disponible, si el pedido no venció."); en un `PENDIENTE_PAGO` normal no hay botón de cancelar aunque el backend lo permite. No aparece en `EN_CAMINO` ni en estados finales.
- Hoja de confirmación (`hoja-cancelar-pedido`): título "¿Cancelar el pedido #N?"; texto, si ya se pagó (`estado !== 'PENDIENTE_PAGO'`): "Ya lo pagaste. Si lo cancelás, te devolvemos los $X a Mercado Pago. Puede demorar en verse en tu cuenta."; si no: "Todavía no lo pagaste, así que no se te cobra nada."; acciones "Sí, cancelar pedido" (peligro, "Cancelando…") y "Volver" (foco inicial).
- Éxito: se cierra la hoja, toast "Pedido cancelado" o, si la respuesta trae `reembolsoEstado`, "Pedido cancelado. Estamos gestionando la devolución de tu pago.", y se re-dibuja el detalle: etiqueta "Cancelado", texto "Cancelaste este pedido. Estamos gestionando la devolución de tu pago." (con reembolso) o "Cancelaste este pedido.", y el bloque de reembolso (`textoReembolso`: "Te devolvimos $X a tu medio de pago.", "Estamos procesando la devolución de $X." o, en `FALLIDO`/`PENDIENTE_REVISION_MANUAL`, "No pudimos completar la devolución de tu pago automáticamente. La estamos revisando manualmente.").
- Error (por ejemplo `409` "El pedido ya no se puede cancelar"): el mensaje del servidor queda dentro de la hoja, que no se cierra, y el botón vuelve a "Sí, cancelar pedido"; el detalle **no** se refresca solo (lo hace el sondeo de 15 s).

---

## 6. P4.06 — Anulación por el comercio

### 6.1 Archivos y funciones

`BE/controllers/PedidoController.anularPedido`; `BE/services/PedidoService.anularPedido` (línea 867); `BE/dto/request/AnulacionPedidoRequestDTO`; `FE/js/comercio.js`: `renderAccionesEnPreparacion`, `mostrarModalAnularPedido`, `abrirHojaMotivoPedido`.

### 6.2 Endpoint

`PUT /api/v1/pedidos/comercio/{id}/anular`: Dueño o Empleado activo (delegable), `X-Comercio-Id` obligatorio, cuerpo `AnulacionPedidoRequestDTO` (`motivo`: `MotivoRechazo`, `@NotNull`, sin mensaje propio; `comentario`: `@Size(max = 500)`). Respuesta `200`, "Pedido anulado correctamente".

### 6.3 Pasos en orden

1. Resolver de comercio, `obtenerPedidoDelComercio` (`404` "Pedido no encontrado"), `bloquear` (usuarios, relación del Empleado, pedido `FOR UPDATE`; **sin** guard de estado del comercio: se puede anular con el comercio suspendido) y `exigirQueNoSeaPedidoPropio` (`409` "No podés gestionar tus propios pedidos").
2. Estado ≠ `EN_PREPARACION` → `409` "Un pedido sin aceptar no se anula, se rechaza" (si está `PENDIENTE_CONFIRMACION_COMERCIO`) o "El pedido ya no se puede anular" (resto: en camino, listo para retirar, finales).
3. `motivo = OTRO` sin comentario → `400` "Ingresá un comentario para especificar el motivo de la anulación.". El comentario se recorta (`trim`) y vacío pasa a `null`.
4. Escrituras: `estado = ANULADO`, `cancelado_por = COMERCIO`, `motivo_rechazo = {motivo}`, `comentario_rechazo = {comentario}`, `motivo = "{etiqueta}"` o `"{etiqueta}. {comentario}"` (texto legible que ve el Cliente); historial con actor `DUENO` o `EMPLEADO` y su usuario.
5. `generarNotaYReembolsarTotal(pedido, ANULACION_COMERCIO)`: **siempre** reembolso total cuando hay pago aprobado (en `EN_PREPARACION` el pedido siempre está pagado); nota en la misma transacción, llamada a Mercado Pago después del commit; con la cuenta del Dueño desvinculada la nota queda `PENDIENTE_REVISION_MANUAL` y la ve el Administrador (P5.04).
6. Aviso al Cliente (`PEDIDO_ANULADO_COMERCIO`): `"Tu pedido #{id} a {comercio} fue anulado por el comercio"` + `" y estamos gestionando la devolución de tu pago"` si hay nota + `". Motivo: {etiqueta}[. comentario]"`. Sin email.
7. Respuesta con `motivoAnulacion` (solo en `ANULADO`) y el estado del reembolso.

### 6.4 Diferencias exactas con rechazar y con la cancelación del sistema

| | Rechazar (P4.03) | Anular (P4.06) | Cancelación del sistema por suspensión (Tramo D) | Cancelar del Cliente (P4.05) |
|---|---|---|---|---|
| Estado de origen | solo `PENDIENTE_CONFIRMACION_COMERCIO` | solo `EN_PREPARACION` | pedidos pagados del comercio suspendido (pendientes y en preparación, según los topes) | `PENDIENTE_PAGO`, `PENDIENTE_CONFIRMACION_COMERCIO`, `EN_PREPARACION` |
| Estado final | `RECHAZADO` | `ANULADO` | `RECHAZADO` (pendientes, actor `SISTEMA`), `ANULADO` o `CANCELADO_POR_SISTEMA` (preparación) | `CANCELADO` |
| `cancelado_por` | `COMERCIO` | `COMERCIO` | `SISTEMA` | `CLIENTE` |
| Actor del historial | `DUENO` / `EMPLEADO` | `DUENO` / `EMPLEADO` | `SISTEMA` | `CLIENTE` |
| Motivo | lista de 7 (+ comentario) | la misma lista de 7 (+ comentario), más `pedido.motivo` legible | `motivo_timeout` (`SUSPENSION_COMERCIO`, etc.) | ninguno (salvo `CANCELACION_SIN_PAGO` en `PENDIENTE_PAGO`) |
| Nota de crédito | `RECHAZO_COMERCIO` | `ANULACION_COMERCIO` | `SUSPENSION_COMERCIO` | `CANCELACION_CLIENTE` (ninguna si no estaba pagado) |
| Guard de comercio suspendido | no | no | — | no |
| Aviso al Cliente | `PEDIDO_RECHAZADO` | `PEDIDO_ANULADO_COMERCIO` | `PEDIDO_CANCELADO_SISTEMA` (texto "El comercio no estaba disponible. Te devolvemos el dinero." en pantalla) | ninguno |

(Las filas de "sistema por suspensión" se tomaron de lo ya relevado en el Tramo D y de `cancelarPagoAprobadoPorSuspension` / `rechazarPendientePorSuspension`; no volví a recorrer las líneas 1075 a 1286 de `PedidoService`.)

### 6.5 Pantalla

- Botón "Anular pedido" (`btn-anular-pedido`, contorno peligro) solo en `EN_PREPARACION` y solo si el contexto puede gestionar pedidos y el pedido no es propio. Debajo de "Marcar como despachado"/"Marcar como listo para retirar".
- Hoja `modal-anular-pedido`: título "¿Anular el pedido #N?", párrafos "El cliente recibe la devolución de todo el pago por Mercado Pago. Puede demorar en verse en su cuenta." y "Le avisamos el motivo y tu comentario."; campo "Motivo de la anulación" (placeholder "Seleccioná un motivo", las 7 opciones), "Comentario (opcional)" / "Comentario" con `OTRO` (placeholder "Agregá una aclaración para el cliente"); validaciones locales "Seleccioná un motivo de anulación." e "Ingresá un comentario para especificar el motivo de la anulación."; acciones "Anular pedido" ("Anulando…") y "Volver". Éxito: toast "Pedido anulado", re-dibujo con encabezado "Anulado" / "Anulaste este pedido." (Empleado: "El comercio anuló este pedido."; si `canceladoPor = SISTEMA`: "Este pedido se anuló automáticamente.") y el motivo. Error: mensaje dentro de la hoja y, si fue `409`, refresco del detalle con aviso fijo.
- Lo que ve el Cliente: etiqueta "Anulado" / "{comercio} anuló tu pedido." con el motivo (`motivoRechazo` etiquetado o `motivoAnulacion`) y el bloque de reembolso.

---

## 7. Transversales

### 7.1 `apiFetch` (`FE/js/api.js`, `apiFetch` y `solicitar`, líneas 559 a 704)

Parámetros: `method`, `body` (JSON o `FormData`), `auth` (por defecto `true`), `handle401Globally` (`true`), `handle5xxGlobally` / `handleRedGlobally` (`undefined`, `false` o `true`), `segundoPlano`, `noIdempotente`, `comercioId`, `sinComercio`, `conMensaje`, `conCabeceras`, `comoBlob`, `timeoutMs` (por defecto `REQUEST_TIMEOUT_MS = 15000`). Si hay token agrega `Authorization: Bearer …` y, para el Dueño o el Empleado en rutas de operación del comercio, `X-Comercio-Id`.

Modo de falla (`modoDeFalla`): `segundoPlano` → `silencioso`; `handleXxx === false` → `lanzar`; sin valor explícito y la petición es una mutación (no `GET`) → `aviso`; en cualquier otro caso (lecturas) → `redirigir`. Se calcula por separado para la red caída/timeout (`modoRed`) y para los `5xx` (`modo5xx`).

| Situación | Lectura (`GET`, modo `redirigir`) | Mutación (modo `aviso`) | `handle…: false` | Segundo plano |
|---|---|---|---|---|
| Sin conexión (`fetch` falla) | un reintento a los 250 ms (no si fue timeout); si falla, `window.location` a `errores/sin-conexion.html` | `FalloRecuperable('red')` → `esperarReintento` (franja "Sin conexión · reintentando…" y aviso "Sin conexión. No perdiste nada: tus datos siguen acá.") | `ApiError(0, 'Sin conexión', null)` | `ApiError(0, 'Sin conexión')` y se registra el fallo |
| Timeout de 15 s (`AbortError`) | `errores/timeout.html` | igual que sin conexión, salvo que haya `noIdempotente` | ídem | ídem |
| Timeout con `noIdempotente` (lo usa `POST /pedidos/cliente`) | — | aviso "Se cortó la conexión." / "Puede que ya se haya enviado: revisá {Mis pedidos} antes de volver a enviar." con "Cerrar"; lanza `ApiError(0, 'Se cortó la conexión', {codigo: CODIGO_TIMEOUT_AVISADO})`; `esTimeoutAvisado(error)` lo reconoce y el checkout solo reactiva el botón | — | — |
| `5xx` | `errores/500.html` (y lanza `ApiError`) | `FalloRecuperable('servidor')` → reintento con "Algo falló de nuestro lado. No perdiste nada: tus datos siguen acá." | lanza `ApiError(status, mensaje, data)` (lo usa "Ir a pagar", que trata `503` aparte) | `ApiError` silencioso |
| `401` con token (y `handle401Globally`) | `clearSesion()` y modal "Sesión cerrada": "Tu sesión terminó. Iniciá sesión de nuevo." con botón "Ir al inicio de sesión" | ídem | — | — |
| `401` o `409` con `data.codigo = CUENTA_SUSPENDIDA` y token | pantalla de cuenta suspendida (con el motivo) y "Cerrar sesión" | ídem | — | — |
| `403` con token | `errores/acceso-denegado.html` | ídem | — | — |
| `404` con `COMERCIO_NO_DISPONIBLE`, header de comercio y contexto Empleado | `perderAccesoAlComercio()` (hoja bloqueante) | ídem | — | — |
| cualquier otro `4xx` (`400`, `404`, `409`, `422`…) | lanza `ApiError(status, parsed.mensaje, parsed.data)` | ídem | ídem | — |

No hay texto por defecto para los `4xx`: `ApiError.message` es el `mensaje` del servidor (cadena vacía si la respuesta no es JSON, `parseBody`); cada pantalla pone su propio texto de respaldo (por ejemplo, "No pudimos confirmar tu pedido. Intentá nuevamente."). Si hay `accesoPerdido` y la ruta es de comercio, la llamada ni se envía (`ApiError(0, 'Acceso perdido')`). `FE/js/auth.js` no fue revisado (ver NO RELEVADO).

### 7.2 Zona horaria en el frontend (`FE/js/fechas.js`)

- `ZONA_COMERCIO = 'America/Argentina/Ushuaia'` (única constante de zona del frontend). `diaDeHoyEnZonaComercio` y `diaDeAyerEnZonaComercio` calculan "hoy" y "ayer" con `Intl.DateTimeFormat` en esa zona; se usan para elegir entre "HH:mm" y "dd/mm HH:mm" (`horaConDiaDe`), los separadores "Hoy"/"Ayer" y la recarga al fin del turno.
- `horaMinutoDe`, `fechaCortaDe`, `fechaCompletaDe` no convierten zonas: cortan el texto que manda el servidor (`LocalDateTime` sin offset, ya en la zona de `app.zona-horaria`, por defecto `America/Argentina/Ushuaia`).
- Las pantallas de pedidos usan sus propias funciones y no la zona fija: `pedidos.js` (`formatearFecha`: `new Date(fechaIso)` + `toLocaleDateString('es-AR')` / `toLocaleTimeString('es-AR', hour12: false)`) y `comercio.js` (`formatearFecha`, `formatearFechaHoraCorta`). Como el servidor manda la fecha sin offset, `new Date` la interpreta en la zona del navegador y el reloj mostrado coincide con el escrito por el servidor; solo difiere de la zona de Ushuaia en los cálculos de "hoy" que usan `Date.now()` (por ejemplo `textoVencimientoPedido`, que resta contra `Date.now()` del navegador).

---

## 8. Desvíos (D-xx) — diferencias reales entre el código y la documentación

(Ubicaciones aproximadas, con las copias de `docs/entregables-01-02/`.)

- **D-18** — `requisitos-funcionales-cliente.md`, línea 48: exige validar al confirmar el pedido "que todos los productos sigan activos". `PedidoService.confirmarPedido` no revisa el estado de los productos; solo se controla al agregar (`CarritoService.agregarItem`, "El producto no está disponible") y mediante la baja automática de carritos al pasar un producto a `AGOTADO` o `DESCONTINUADO` (`PRODUCTO_REMOVIDO_CARRITO`). `PUT /carrito/items/{id}` tampoco lo revalida.
- **D-19** — `requisitos-funcionales-cliente.md`, línea 48: "en caso de domicilio, que el cliente tenga una dirección principal configurada". El código exige un `direccionId` de una dirección activa del propio Cliente (cualquiera, no necesariamente la principal): `409` "La dirección es obligatoria para entrega a domicilio" o `404` "Dirección no encontrada".
- **D-20** — `requisitos-funcionales-cliente.md`, líneas 33 y 48 (y `requisitos-funcionales-comercio.md` ~224): describen extras elegidos por ítem y grupos obligatorios al agregar y confirmar. El carrito, el checkout y el pedido no tienen ninguna lógica de extras (el bloque de Extras sigue sin implementar).
- **D-21** — `requisitos-funcionales-cliente.md`, línea 39: "El carrito debe vincularse a la sesión activa del cliente, pasando a estado inactivo al expirar la sesión o al inactivarse la cuenta". El carrito es un único registro por Cliente, sin estado ni vínculo con la sesión, que no expira nunca (CLAUDE.md §1 lo dice igual); solo se vacía por las acciones del Cliente, por pago aprobado o por baja de un producto.
- **D-22** — `requisitos-funcionales-cliente.md`, líneas 53 a 55 y `Historias de Usuario - Cliente.md`, HU-C13: la cancelación se describe "según modalidad" con dos estados cancelables. El código no distingue modalidad (mismos estados) y además permite cancelar `PENDIENTE_PAGO` (`409` "El pedido ya no se puede cancelar" para el resto). `requisitos-funcionales-sistema.md`, línea 58, dice que `CANCELADO` "genera reembolso automático": no lo genera si se canceló desde `PENDIENTE_PAGO` (no hay pago; motivo de historial `CANCELACION_SIN_PAGO`).
- **D-23** — `requisitos-funcionales-comercio.md`, línea ~242: la lista de motivos de rechazo dice "Local Cerrado". La etiqueta real del enum `MotivoRechazo.CERRADO` es "Comercio cerrado" (backend y frontend).
- **D-24** — `requisitos-funcionales-sistema.md`, línea 61 (EXPIRADO): "no respondió dentro de la hora de margen tras la confirmación del pago". El umbral real es de 30 minutos (`pedido.timeout.respuesta-comercio-minutos=30`), como dice la línea 94 del mismo archivo; la corrida es cada 5 minutos, así que el vencimiento real cae entre los 30 y los 35 minutos.
- **D-25** — `requisitos-funcionales-sistema.md`, línea 153 (T11, pedido cancelado por sistema): canal "Push + Panel + Email". `PedidoService.notificarCancelacionSistema` solo crea el aviso in-app (`PUSH`); ningún aviso de pedido (T1, T2, T3, T5 a T13) envía email: `PedidoService`, `ReembolsoService` y `NotificacionService` no usan `EmailService`.
- **D-26** — `requisitos-funcionales-cliente.md`, sección "Seguimiento de Estado" (~línea 66): el Cliente debe recibir aviso ante "cancelado". Cuando el propio Cliente cancela no se crea ningún aviso para él (solo el aviso `PEDIDO_CANCELADO_CLIENTE` al equipo del comercio, y solo si el pedido estaba pagado).
- **D-27** — CLAUDE.md §7.2 ("Comercio no operativo", "Aplicarlo al Dueño queda para el tramo de suspensión") frente al código: `ComercioActivoService.validarComercioAceptaPedidosNuevos` ya aplica el guard al Dueño con el comercio `SUSPENDIDO` (`409` `COMERCIO_SIN_OPERACION`, "El comercio está suspendido: no podés aceptar pedidos nuevos. Sí podés rechazarlos."); con `CERRADO_TEMPORALMENTE` el Dueño sigue pudiendo aceptar.
- **D-28** — Código contra código: el detalle del pedido del Dueño (`comercio.js`, ~1594) escribe literal "Cargo por servicio (1%)" aunque la tarifa del comercio (`cargoComercio`, `FIJO` o `PORCENTAJE`) es configurable por el Administrador (`ConfiguracionTarifa`); la etiqueta no sale de la tarifa vigente ni de la del pedido.
- **D-29** — Código contra código (ya anotado como deuda en CLAUDE.md, tramo de ajustes del Empleado): para el Dueño, la tarjeta de la lista (`comercio.js`, `renderPedidoActivoCard`) muestra `pedido.total` (con el cargo del Cliente) y el detalle muestra `pedido.neto` rotulado "Total".

---

## 9. Dudas (C-xx)

- **C-13** — `confirmarPedido` no valida que la localidad de la dirección de entrega esté habilitada ni que corresponda a la zona del comercio (solo se valida la localidad habilitada al crear o editar la dirección, Fase 3). Un Cliente con una dirección de otra localidad habilitada puede pedir a domicilio a cualquier comercio. ¿Es intencional que no exista zona de reparto?
- **C-14** — `detalle_pedido` guarda `precio_unitario` y `nota` pero no el nombre del producto: `DetallePedidoResponseDTO` lee `detalle.getProducto().getNombre()`. Un renombre posterior del producto cambia el nombre que se ve en pedidos viejos. El diccionario solo promete congelar el precio.
- **C-15** — `RechazoPedidoRequestDTO.motivo`, `AnulacionPedidoRequestDTO.motivo` y sus `@Size(max = 500)` no tienen `message`; el texto del `400` ante un motivo ausente o un comentario largo depende del mensaje por defecto de Bean Validation (idioma del servidor, no verificado). El frontend lo evita validando antes ("Seleccioná un motivo de rechazo." / "…de anulación.").
- **C-16** — `PUT /carrito/items/{id}` y `POST /carrito/items` no controlan el subtotal máximo (solo el frontend y `confirmarPedido`); una llamada directa puede dejar un ítem por encima de $99.999.999 que recién falla al confirmar (`400`). Tampoco `PUT` revalida el estado del producto o del comercio.
- **C-17** — El backend permite cancelar un pedido `PENDIENTE_PAGO` en cualquier caso, pero la pantalla solo ofrece "Cancelar pedido" en ese estado cuando el comercio no está disponible. ¿Es intencional que un Cliente con un `PENDIENTE_PAGO` normal no pueda cancelarlo desde la pantalla (queda a la espera del vencimiento de 30 minutos)?
- **C-18** — El botón "Aceptar pedido" solo se oculta con el comercio `SUSPENDIDO` (`comercioActivoSuspendido`); un Empleado con el comercio en `CERRADO_TEMPORALMENTE` lo ve y recibe un `409` ("El comercio no está operativo: no podés aceptar pedidos nuevos. Sí podés rechazarlos.") en el aviso fijo. ¿Se prefiere ocultarlo?
- **C-19** — `PedidoRequestDTO.totalEsperado` es opcional: si no viene, el servidor no compara montos. La pantalla siempre lo manda, pero otro consumidor de la API puede crear un pedido a un total distinto del que vio.
- **C-20** — Inconsistencia menor: `rechazarPedido` guarda `comentario_rechazo` tal cual llegó (sin `trim`, y vacío queda vacío), mientras `anularPedido` lo recorta y lo deja en `null` si está vacío.
- **C-21** — Un Cliente `SUSPENDIDO` no puede cancelar su propio pedido (`bloquear` lanza `CuentaSuspendidaException` si el actor está suspendido), aunque sus pedidos pagados sigan su curso (S1). ¿Es intencional?
- **C-22** — `textoVencimientoPedido` resta el plazo contra `Date.now()` del navegador, no contra la hora del servidor; con un reloj desfasado el "Vence en N minutos" se desvía. No hay corrección de desfase en esa pantalla.

---

## 10. NO RELEVADO

- `FE/js/auth.js` (manejo de errores y redirecciones por rol), y los helpers `esperarReintento` / `mostrarAvisoTimeout` solo hasta los textos citados (no leí su lógica completa de reintento).
- `FE/js/pedidos-nuevos.js` salvo `textoVencimientoPedido`; `esPedidoNuevo` y el sonido de pedido nuevo del panel del comercio.
- `FE/js/direcciones.js` (formulario de dirección y tarjeta de entrega) más allá de lo importado por el checkout; `DireccionClienteService` y sus mensajes.
- `FE/js/hoja.js` y `FE/js/form-utils.js` más allá de cómo manejan el error de una acción (la hoja queda abierta y muestra `fallo.message`); `campoTextarea` (si el textarea del comentario limita a 500 caracteres en pantalla).
- `PedidoService` líneas 1075 a 1286 (suspensión: `autoconfirmarRetirosPorSuspension`, `cancelarPreparacionPorSuspension`, `rechazarPendientePorSuspension`, `procesarPedidoSinAtencion`): se tomaron de lo ya relevado en el Tramo D y no se volvieron a leer.
- `ReembolsoService` más allá de `generarNotaYReembolsarTotal` (P5.04), `MercadoPagoPagoService` más allá del handoff (P5.02), `NotaCreditoService`, `PedidoResponseDTO`/`PedidoEmpleadoResponseDTO` campo por campo, `ComercioActivoService.resolver`, `TrazabilidadPedidoService`.
- Los textos de la campana de notificaciones y su agrupación por tipo (`notificaciones.js`).
- Pantalla de escritorio del checkout y del carrito más allá del aside de resumen (`css/escritorio-cliente*.css`).
- Pruebas automáticas (Playwright, Newman, Java) que confirman estos comportamientos: no se leyeron.
- Estado real de la base (`practicas3`/`bajonea_final`) y `GET /pedidos/comercio` con datos: todo el informe sale de lectura de código, no de ejecución.

---

## 11. Archivos revisados

Frontend: `frontend/checkout.html`, `frontend/carrito.html`, `frontend/js/checkout.js`, `frontend/js/carrito.js`, `frontend/js/api.js` (fragmentos: `modoDeFalla`, `apiFetch`, `solicitar`, `parseBody`, textos de sesión), `frontend/js/red-aviso.js` (fragmentos), `frontend/js/fechas.js` (fragmentos), `frontend/js/precio-cambio.js`, `frontend/js/pedidos.js` (líneas 40 a 330, 400 a 560, 590 a 955), `frontend/js/comercio.js` (líneas 130 a 160, 500 a 720, 805 a 890, 1030 a 1780), `frontend/js/pedidos-nuevos.js` (fragmento), `frontend/js/comercio-suspendido.js` (fragmento), `frontend/js/hoja.js` (fragmento), `frontend/js/esqueletos.js` (fragmento), `frontend/js/catalogo.js` (`actualizarContadorCarrito`), `frontend/js/destino-aviso.js` (fragmento), `frontend/js/validators.js` (fragmento).

Backend (`backend/src/main/java/com/bajonea/backend/`): `controllers/CarritoController.java`, `controllers/PedidoController.java`, `services/CarritoService.java`, `services/PedidoService.java` (líneas 110 a 1075 y 1286 a 1509), `services/PedidoSchedulerService.java`, `services/ConfiguracionTarifaService.java`, `services/ComercioService.java` (`validarAceptaPedidos`), `services/ComercioActivoService.java` (fragmento), `services/EstadoUsuarioService.java` (fragmento), `services/ReembolsoService.java` (encabezado y `generarNotaYReembolsarTotal`), `services/MercadoPagoPagoService.java` (`iniciarOReusarPago`, `prepararPago`, `back_urls`), `services/ProductoService.java` (`cambiarEstado`), `config/PedidoTimeoutProperties.java`, `resources/application.properties` (líneas de `pedido.timeout`), `resources/db/migration/V10__configuracion_tarifa_tipo_cargo.sql` (fragmento), DTOs `ItemCarritoRequestDTO`, `ActualizarCantidadItemCarritoRequestDTO`, `PedidoRequestDTO`, `RechazoPedidoRequestDTO`, `AnulacionPedidoRequestDTO`, `ItemCarritoResponseDTO`, `CarritoResponseDTO`, enums `EstadoPedido`, `MotivoRechazo`, `ActorPedido`, `MotivoNotaCredito`, `MotivoTimeoutPedido`, `exceptions/GlobalExceptionHandler.java` (fragmento), `ConflictoComercioException`, `ComercioNoDisponibleException`.

Documentación contrastada: `docs/entregables-01-02/requisitos-funcionales-cliente.md`, `requisitos-funcionales-comercio.md`, `requisitos-funcionales-sistema.md`, `Historias de Usuario - Cliente.md` (HU-C10 y HU-C13), `diccionario-de-datos.md` (referencias a `DetallePedido`), y `CLAUDE.md` (§1bis y §7.2).
