# Requisitos Funcionales — Comercio

---

## Registro y Perfil

- El sistema debe permitir el registro de nuevos comercios solicitando datos del representante (persona jurídica): razón social, CUIT, domicilio fiscal, condición frente al IVA, tipo de sociedad e inicio de actividades.
- El comercio debe poder registrar los datos propios del negocio: nombre, descripción, foto de perfil, teléfono, email, dirección operativa, tipo de comercio (Restaurante o Emprendimiento), modalidades de entrega aceptadas (acepta_delivery, acepta_retiro — al menos una obligatoria). La foto de perfil es obligatoria desde el registro inicial.
- El comercio debe definir al menos una franja horaria de atención durante el registro, pudiendo agregar múltiples franjas que contemplen diferentes horarios por día.
- El comercio debe poder editar sus datos, foto de perfil y horarios desde su perfil autenticado en cualquier momento posterior al registro.
- Todo comercio registrado queda en estado Pendiente hasta ser aprobado por el Administrador.
- Una vez aprobado, el comercio debe vincular su cuenta de MercadoPago mediante OAuth. Sin esta vinculación el comercio no puede recibir pagos ni pedidos, y no aparece en el catálogo público. Al desvincularla, el comercio queda bloqueado para nuevos pedidos y desaparece del catálogo hasta volver a vincularla. El monto recibido refleja el total menos el cargo de servicio via split de pagos.
- Un comercio rechazado puede solicitar una revisión de su solicitud desde su panel, pudiendo editar sus datos antes de reenviarla. Al hacerlo vuelve a estado Pendiente y el Administrador recibe una nueva notificación.
- Un comercio suspendido puede contactar al soporte desde su panel completando un formulario con su descargo. El Administrador recibe la solicitud y decide manualmente.

---

## Estados del Comercio

- **Pendiente:** registrado y en espera de aprobación o rechazo por el Administrador.
- **Aprobado:** habilitado para operar. Aparece en catálogo solo si además tiene `mp_vinculado = true` y el usuario representante está en estado Activo dentro del horario de atención, y `cerrado_manualmente = false`.
- **Rechazado:** solicitud denegada por el Administrador con motivo registrado.
- **Suspendido:** inhabilitado por el Administrador ante una infracción. Se oculta del catálogo.
- **Inactivo:** usuario representante con 3 meses sin actividad. Se oculta del catálogo. Su información histórica, productos y pedidos se conservan en el sistema.
- **Cerrado Temporalmente:** usuario representante en estado Bloqueado. Visible en el catálogo con indicador de "temporalmente cerrado" pero no puede recibir pedidos. Se revierte automáticamente al desbloquear la cuenta vía recuperación de contraseña.
- **Cerrado Manualmente:** el comercio activó el cierre temporal desde su panel estando en estado Aprobado y con usuario Activo. Se representa mediante el campo `cerrado_manualmente = true` en la tabla Comercio, sin alterar el estado del comercio ni del usuario. Aparece en el catálogo con indicador de "temporalmente cerrado" y no puede recibir pedidos. Se revierte exclusivamente de forma manual por el propio comercio.

---

## Regla de Visibilidad en Catálogo

Un comercio aparece en el catálogo público si su estado es Aprobado con `mp_vinculado = true`, o si su estado es Cerrado Temporalmente. En el segundo caso, aparece con indicador de "temporalmente cerrado" y sin posibilidad de recibir pedidos.

Un comercio se muestra como abierto y disponible para recibir pedidos solo si se cumplen simultáneamente:
- `Comercio.estado == APROBADO`
- `Comercio.mp_vinculado == true`
- `Usuario.estado == ACTIVO`
- El horario de consulta está dentro de las franjas horarias del comercio.
- `Comercio.cerrado_manualmente == false`

Un comercio aparece en el catálogo con indicador **"temporalmente cerrado"** — y sin posibilidad de recibir pedidos — si se cumple alguna de estas condiciones:
- Su estado es `CERRADO_TEMPORALMENTE` (usuario representante bloqueado), o
- Su estado es `APROBADO` con `cerrado_manualmente = true` (cierre manual voluntario).

---

## Cierre y Apertura Manual

- El comercio aprobado debe poder activar y desactivar el cierre manual desde su panel en cualquier momento dentro de su horario de atención, sin modificar su estado ni el del usuario representante.
- Al activar el cierre manual (`cerrado_manualmente = true`), el comercio dejará de recibir nuevos pedidos y aparecerá en el catálogo con indicador de "temporalmente cerrado". Los pedidos ya en curso no se ven afectados.
- Al desactivar el cierre manual (`cerrado_manualmente = false`), el comercio vuelve a recibir pedidos si se cumplen las demás condiciones de visibilidad.
- El cierre manual no se revierte automáticamente; el comercio debe reabrirlo manualmente.

---

## Gestión de Productos

- El comercio aprobado con MP vinculado debe poder crear productos con nombre, descripción, precio, categoría (obligatoria), tags (opcionales) e imágenes (entre 1 y 5; el comercio define el orden y cuál se muestra como principal).
- El comercio debe poder editar los datos de sus productos en cualquier momento.
- Cada producto puede encontrarse en uno de los siguientes estados:
  - **DISPONIBLE:** el producto es visible en el menú y puede ser agregado al carrito y pedido.
  - **AGOTADO:** el producto es visible en el menú con indicador "Agotado", pero no puede ser agregado al carrito ni incluido en nuevos pedidos. Esta acción elimina el producto de los carritos activos y notifica a los clientes afectados. El comercio puede restaurarlo a DISPONIBLE cuando reponga el stock.
  - **DESCONTINUADO:** el producto fue retirado permanentemente. No aparece en el menú pero se conserva en el historial de pedidos. Esta acción es irreversible y también elimina el producto de los carritos activos, notificando a los clientes afectados.
- El sistema debe registrar las fechas de creación, modificación y baja de cada producto.
- Cada producto debe tener una categoría obligatoria y tags opcionales, seleccionados del catálogo gestionado por el Administrador. Solo pueden seleccionarse categorías y tags con estado activo.

---

## Gestión de Pedidos

- El comercio debe recibir una notificación ante cada nuevo pedido entrante (estado PENDIENTE).
- El sistema debe validar que el horario de confirmación del pedido esté dentro de las franjas horarias del comercio. Si está cerrado, se informa al cliente el horario de atención disponible.
- El comercio debe poder aceptar o rechazar un pedido en estado PENDIENTE. El rechazo requiere seleccionar un **motivo predefinido** de la siguiente lista: Sin Stock, Local Cerrado, Alto Volumen de Pedidos, Producto No Disponible Temporalmente, Sin Delivery Disponible, Problema Técnico u Otro. Si el motivo es "Otro", debe ingresar obligatoriamente una descripción adicional. Para cualquier motivo puede agregar comentarios adicionales opcionales. El estado resultante del rechazo es RECHAZADO.
- **Flujo de estados — Domicilio:** PENDIENTE → EN_PREPARACION → EN_CAMINO → ENTREGADO.
- **Flujo de estados — Retiro:** PENDIENTE → EN_PREPARACION → LISTO_PARA_RETIRAR → ENTREGADO.
- El comercio debe poder confirmar la entrega de un pedido de retiro cuando el cliente se presente a retirarlo (ENTREGADO, fuente: COMERCIO).
- El comercio debe poder marcar como ENTREGADO un pedido de retiro cuando el cliente no se presente a retirarlo (ENTREGADO, fuente: COMERCIO_SIN_RETIRO), cerrando el pedido sin generar reembolso.
- El comercio debe poder anular un pedido desde estado EN_PREPARACION, seleccionando un **motivo predefinido** de la lista de motivos de rechazo. Esta acción es irreversible y genera automáticamente la nota de crédito y el reembolso al cliente. No aplica desde estados posteriores.
- El pedido vence automáticamente (estado EXPIRADO) si el comercio no responde en 1 hora desde la confirmación del pago, generando el reembolso correspondiente al cliente.

---

## Historial y Seguimiento

- El comercio debe poder visualizar el historial completo de pedidos con filtros por estado, fecha y cliente.
- El sistema debe notificar al comercio ante: nuevo pedido recibido, aprobación, rechazo o suspensión de cuenta, pedido expirado por no respuesta.
- El sistema debe registrar el historial de estados de cada pedido con marcas de tiempo en cada transición.

---

## Gestión de Valores en Pedidos

- Al momento de crear un pedido, el sistema registra los valores vigentes de las tarifas de servicio (cargo al cliente y cargo al comercio) como campos propios del pedido (`cargo_servicio_cliente`, `cargo_servicio_comercio`). Estos valores no se modifican aunque las tarifas cambien posteriormente.
- El split de pagos con MercadoPago se configura en cada solicitud de cobro con el `application_fee` correspondiente: `application_fee = cargo_servicio_cliente + cargo_servicio_comercio`. El comercio recibe automáticamente: `subtotal - cargo_servicio_comercio`.
