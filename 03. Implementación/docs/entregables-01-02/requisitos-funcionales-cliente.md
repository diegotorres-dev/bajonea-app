# Requisitos Funcionales — Cliente

---

## Registro y Perfil

- El sistema debe permitir el registro de nuevos clientes solicitando: nombre, apellido, DNI, fecha de nacimiento, teléfono, email, nombre de usuario, contraseña y una dirección de entrega inicial (que queda registrada automáticamente como dirección principal), y exigir que el cliente acepte los Términos y Condiciones: el servidor rechaza el registro (400) si el campo `aceptaTerminos` falta o es falso. La aceptación se valida pero no se guarda (sin fecha, versión ni página de Términos); estar registrado da por aceptados los términos.
- El cliente debe tener 14 años o más al registrarse, contados con la fecha del día del servidor: cumplir los 14 ese mismo día ya alcanza. Con menos edad el servidor rechaza el registro (400) con el mensaje "Tenés que tener al menos 14 años para registrarte" en el campo de la fecha de nacimiento. La edad es la que el cliente declara: el sistema no verifica identidad ni DNI. La regla se evalúa solo al registrarse; una cuenta ya existente no se revisa.
- El cliente debe poder editar sus datos personales (nombre, apellido, teléfono) desde su perfil autenticado.
- El cliente debe poder cambiar su nombre de usuario desde su perfil autenticado, hasta 3 veces cada 30 días corridos (ventana deslizante hacia atrás desde el momento del intento, no mes calendario). El sistema debe registrar cada cambio y, al alcanzar el límite, informar los días reales que faltan para volver a poder cambiarlo.
- El cambio de nombre de usuario requiere confirmar la contraseña actual. Una contraseña incorrecta cuenta como intento fallido, con el mismo bloqueo de cuenta a los 3 intentos que el login y el cambio de contraseña, y con el mismo aviso previo ("Cuidado: si fallás una vez más, tu cuenta se bloqueará.").
- El cambio de nombre de usuario no cierra las sesiones existentes.
- El cliente debe poder cargar y editar una foto de perfil desde su perfil autenticado. Es opcional.
- El cliente debe poder gestionar múltiples direcciones de entrega: agregar, editar, eliminar y designar una como dirección principal. La dirección principal no puede eliminarse si es la única registrada; primero debe designarse otra como principal.

---

## Exploración de Comercios y Menús

- El sistema debe mostrar el listado de comercios disponibles de forma pública, sin requerir autenticación. Solo se muestran comercios en estado Apto para Venta (APTO_VENTA: Aprobado, con la cuenta de MercadoPago de su Dueño vinculada), o comercios en estado Cerrado Temporalmente. Estos últimos aparecen con indicador visual de "temporalmente cerrado" y sin posibilidad de realizar pedidos.
- Los comercios que están cerrados, ya sea fuera de su horario de atención o pausados a mano por su Dueño, se muestran atenuados en el listado, con una etiqueta al final de la tarjeta ("Cerrado" por horario, "Cerrado temporalmente" por pausa del Dueño). Los comercios abiertos se listan primero y el filtro "Abierto ahora" deja solo los abiertos. El estado de apertura lo informa el servidor; el navegador no lo calcula con su propio reloj.
- El detalle de un comercio cerrado muestra la misma etiqueta y el aviso de cuándo reabre ("Reabre hoy a las HH:mm", "Reabre mañana a las HH:mm" o "Reabre el <día> a las HH:mm"), y no ofrece agregar productos al carrito. Un comercio cerrado temporalmente porque su Dueño tiene la cuenta bloqueada se ve igual ("Cerrado temporalmente"), pero sin aviso de cuándo reabre.
- Si el comercio se cierra después de que el cliente abrió el producto o el checkout, al agregar al carrito o al confirmar el pedido el sistema responde con el mensaje del servidor ("Este comercio está cerrado en este momento") en un aviso de error con un botón "Volver al catálogo". Abrir el carrito con un comercio cerrado no muestra ningún aviso anticipado.
- El cliente debe poder acceder al menú de un comercio y visualizar sus productos activos con nombre, descripción, precio, foto, categoría y tags.
- El cliente debe poder filtrar productos dentro de un menú por categoría y/o tags.
- El sistema debe informar al usuario no autenticado que debe iniciar sesión para poder realizar un pedido.
- El detalle del comercio muestra: nombre, descripción, tipo de comercio, horarios de atención, dirección, teléfono, enlaces a sus redes sociales cargadas (si tiene) y modalidades disponibles (delivery, retiro en local o ambas).

---

## Carrito de Compras

- El cliente autenticado debe poder agregar productos al carrito, especificando cantidad (entre 1 y 20 unidades), una nota opcional por ítem y, si el producto ofrece grupos de extras, los extras elegidos para ese ítem. Si un grupo de extras es obligatorio, el sistema exige al menos una selección de ese grupo antes de permitir agregar el ítem al carrito. Si el grupo permite una única opción (`cantidad_maxima = 1`), elegir un nuevo extra del mismo grupo reemplaza al anteriormente seleccionado; si permite más de una, se acumulan hasta el máximo configurado.
- Si el producto que se agrega ya está en el carrito, el sistema debe sumar la cantidad indicada a la cantidad ya existente del ítem (no rechazar la operación ni crear un ítem duplicado), respetando el máximo de 20 unidades por ítem — si la suma lo supera, la cantidad queda en 20. La nota del ítem se reemplaza por la última recibida.
- El carrito debe restringir la selección a productos de un único comercio por sesión. Intentar agregar un producto de otro comercio devuelve un error 409 solicitando vaciar el carrito primero.
- El cliente debe poder modificar la cantidad de un ítem, eliminarlo individualmente o vaciar el carrito completo.
- El sistema debe calcular y mostrar el subtotal del carrito en tiempo real, incluyendo el precio de los extras seleccionados en cada ítem.
- El carrito debe vincularse a la sesión activa del cliente, pasando a estado inactivo al expirar la sesión o al inactivarse la cuenta.
- El carrito solo se limpia automáticamente una vez confirmado el pago (transición del pedido a estado PENDIENTE_CONFIRMACION_COMERCIO), y solo si el carrito actual es del mismo comercio del pedido pagado. En caso de pago fallido o timeout de pago, el carrito permanece intacto.

---

## Pedidos

- El cliente autenticado puede tener múltiples pedidos activos simultáneamente, siempre que cada pedido individual sea de un único comercio.
- El cliente autenticado debe poder confirmar su pedido desde el carrito, seleccionando la modalidad de entrega: retiro en el local o envío a domicilio. La opción de envío a domicilio solo se muestra si el comercio lo acepta; la de retiro, solo si el comercio lo acepta.
- El sistema debe validar, al momento de confirmar el pedido: que el comercio esté en estado APTO_VENTA (Aprobado y con la cuenta de MercadoPago de su Dueño vinculada), que esté dentro de su horario de atención, que todos los productos sigan activos, que se haya seleccionado al menos un extra en cada grupo obligatorio, y —en caso de domicilio— que el cliente tenga una dirección principal configurada.
- El sistema debe registrar el pedido con todos sus ítems, precios al momento de la compra, comercio, modalidad de entrega, tarifa de servicio vigente al cliente y al comercio (ambas persistidas en el registro del pedido), y fecha.
- El resumen del pedido debe mostrar: subtotal, cargo de servicio al cliente (valor vigente al momento del pedido) y total a pagar.
- El cliente debe poder visualizar el historial completo de sus pedidos con su estado actual y detalle de cada uno.
- El cliente puede cancelar su pedido según modalidad:
  - **Domicilio:** hasta el momento en que el comercio lo marca como EN_CAMINO (estados cancelables: PENDIENTE_CONFIRMACION_COMERCIO y EN_PREPARACION).
  - **Retiro:** hasta el momento en que el comercio lo marca como LISTO_PARA_RETIRAR (estados cancelables: PENDIENTE_CONFIRMACION_COMERCIO y EN_PREPARACION).
- En pedidos a domicilio en estado EN_CAMINO, el cliente debe poder confirmar la recepción del pedido. Esta confirmación cierra el pedido como ENTREGADO.
- En pedidos de retiro, la confirmación de entrega la realiza el comercio.
- El cliente debe poder iniciar un reclamo ante un pedido a domicilio marcado como ENTREGADO que no fue recibido. El sistema también debe ofrecer la opción de contactar directamente al comercio como vía alternativa.

---

## Seguimiento de Estado

- El sistema debe notificar al cliente ante cada cambio de estado de su pedido: aceptado, en preparación, en camino o listo para retirar, entregado, rechazado, cancelado o anulado.
- El cliente debe poder visualizar el historial completo de estados por los que pasó cada pedido, con las fechas y horas correspondientes.

---

## Pagos

- El cliente debe poder abonar su pedido a través de MercadoPago como único medio de pago disponible en la plataforma.
- Ante rechazo del pedido por el comercio, anulación por el comercio, cancelación por el cliente, expiración por falta de respuesta del comercio o aprobación de un reclamo, el cliente debe recibir el reembolso del monto total abonado mediante nota de crédito procesada vía MercadoPago.
- Si MercadoPago rechaza un pago, el pedido no se cancela: permanece pendiente de pago y el cliente puede reintentar sobre el mismo link hasta que se apruebe un pago o venza el plazo de pago (30 minutos desde la creación del pedido). El link de pago vence junto con el pedido.
- Si un pago está en revisión en MercadoPago (`pending` o `in_process`), el sistema no permite iniciar otro checkout hasta que se resuelva o venza el pedido.
- Al volver del checkout, el sistema verifica el estado real del pago en MercadoPago; si el pedido ya está pagado se informa sin abrir un nuevo checkout.
