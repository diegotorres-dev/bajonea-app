# Requisitos Funcionales — Cliente

---

## Registro y Perfil

- El sistema debe permitir el registro de nuevos clientes solicitando: nombre, apellido, DNI, fecha de nacimiento, teléfono, email, contraseña y una dirección de entrega inicial (que queda registrada automáticamente como dirección principal).
- El cliente debe poder editar sus datos personales (nombre, apellido, teléfono) desde su perfil autenticado.
- El cliente debe poder gestionar múltiples direcciones de entrega: agregar, editar, eliminar y designar una como dirección principal. La dirección principal no puede eliminarse si es la única registrada; primero debe designarse otra como principal.

---

## Exploración de Comercios y Menús

- El sistema debe mostrar el listado de comercios disponibles de forma pública, sin requerir autenticación. Solo se muestran comercios con estado Aprobado que tengan su cuenta de MercadoPago vinculada (`mp_vinculado = true`), o comercios en estado Cerrado Temporalmente. Estos últimos aparecen con indicador visual de "temporalmente cerrado" y sin posibilidad de realizar pedidos.
- El cliente debe poder acceder al menú de un comercio y visualizar sus productos activos con nombre, descripción, precio, foto, categoría y tags.
- El cliente debe poder filtrar productos dentro de un menú por categoría y/o tags.
- El sistema debe informar al usuario no autenticado que debe iniciar sesión para poder realizar un pedido.
- El detalle del comercio muestra: nombre, descripción, tipo de comercio (Restaurante o Emprendimiento), horarios de atención, dirección, teléfono y modalidades disponibles (delivery, retiro en local o ambas).

---

## Carrito de Compras

- El cliente autenticado debe poder agregar productos al carrito, especificando cantidad (entre 1 y 20 unidades) y una nota opcional por ítem.
- El carrito debe restringir la selección a productos de un único comercio por sesión. Intentar agregar un producto de otro comercio devuelve un error 409 solicitando vaciar el carrito primero.
- El cliente debe poder modificar la cantidad de un ítem, eliminarlo individualmente o vaciar el carrito completo.
- El sistema debe calcular y mostrar el subtotal del carrito en tiempo real.
- El carrito debe vincularse a la sesión activa del cliente, pasando a estado inactivo al expirar la sesión o al inactivarse la cuenta.
- El carrito solo se limpia automáticamente una vez confirmado el pago (transición del pedido a estado PENDIENTE). En caso de pago fallido o timeout de pago, el carrito permanece intacto.

---

## Pedidos

- El cliente autenticado puede tener múltiples pedidos activos simultáneamente, siempre que cada pedido individual sea de un único comercio.
- El cliente autenticado debe poder confirmar su pedido desde el carrito, seleccionando la modalidad de entrega: retiro en el local o envío a domicilio. La opción de envío a domicilio solo se muestra si el comercio lo acepta; la de retiro, solo si el comercio lo acepta.
- El sistema debe validar, al momento de confirmar el pedido: que el comercio esté Aprobado, que tenga MP vinculado, que esté dentro de su horario de atención, que todos los productos sigan activos, y —en caso de domicilio— que el cliente tenga una dirección principal configurada.
- El sistema debe registrar el pedido con todos sus ítems, precios al momento de la compra, comercio, modalidad de entrega, tarifa de servicio vigente al cliente y al comercio (ambas persistidas en el registro del pedido), y fecha.
- El resumen del pedido debe mostrar: subtotal, cargo de servicio al cliente (valor vigente al momento del pedido) y total a pagar.
- El cliente debe poder visualizar el historial completo de sus pedidos con su estado actual y detalle de cada uno.
- El cliente puede cancelar su pedido según modalidad:
  - **Domicilio:** hasta el momento en que el comercio lo marca como EN_CAMINO (estados cancelables: PENDIENTE y EN_PREPARACION).
  - **Retiro:** hasta el momento en que el comercio lo marca como LISTO_PARA_RETIRAR (estados cancelables: PENDIENTE y EN_PREPARACION).
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
