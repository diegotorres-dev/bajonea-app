# Requisitos Funcionales — Comercio

Requisitos operativos del negocio en sí (el comercio como entidad). Estas acciones
pueden ser ejecutadas tanto por el Dueño titular del comercio como por un Empleado en
estado Activo dentro de ese comercio — ver Requisitos Funcionales — Empleado para el
detalle de permisos delegados. Los requisitos de identidad de cuenta, datos fiscales,
vinculación de MercadoPago, gestión de empleados y administración de múltiples
comercios se encuentran en Requisitos Funcionales — Dueño.

---

## Perfil del Negocio

- El Dueño debe poder registrar los datos propios de cada comercio que administra:
  nombre, descripción, foto de perfil del negocio, teléfono, email de contacto del
  negocio, dirección operativa, tipo de comercio (Restaurante, Emprendimiento,
  Rotisería, Heladería, Cafetería, Panadería, Pizzería, Parrilla, Bar, Kiosco, Food
  Truck u Otro) y modalidades de entrega aceptadas (acepta_delivery, acepta_retiro —
  al menos una obligatoria). La foto de perfil del comercio es obligatoria desde el
  alta inicial.
- El comercio debe definir al menos una franja horaria de atención al momento del alta,
  pudiendo agregar múltiples franjas que contemplen diferentes horarios por día.
- El Dueño o un Empleado autorizado debe poder editar los datos, la foto de perfil y
  los horarios del comercio desde el panel en cualquier momento posterior al alta.
- La foto de perfil del comercio es un dato propio de cada comercio, independiente de
  la foto de perfil personal de su Dueño (ver Requisitos Funcionales — Dueño). Si un
  Dueño administra varios comercios, cada uno mantiene su propia foto de negocio.
- Todo comercio nuevo queda en estado Pendiente hasta ser aprobado por el Administrador
  de forma individual, incluso si su Dueño ya tiene otros comercios aprobados.

---

## Gestión de Redes Sociales

- El comercio debe poder cargar, editar y dar de baja enlaces a sus redes sociales y
  canales de contacto: Instagram, Facebook, TikTok, WhatsApp, X, sitio web
  u otro. Puede cargar como máximo un enlace activo por tipo de red social; si da de
  baja un enlace, puede volver a cargar ese mismo tipo más adelante.
- Es recomendable que el comercio tenga al menos un enlace cargado, aunque no es un
  requisito bloqueante para operar.
- Estos enlaces son de carga y edición manual; no implican login social ni
  sincronización automática con la red externa (ver Alcance y Limitaciones).

---

## Estados del Comercio

- **Pendiente:** registrado y en espera de aprobación o rechazo por el Administrador.
- **Aprobado:** habilitado para operar. Aparece en catálogo solo si además su Dueño
  tiene la cuenta de MercadoPago vinculada y está en estado Activo, dentro del horario
  de atención del comercio, y `cerrado_manualmente = false`.
- **Apto para Venta (APTO_VENTA):** comercio Aprobado cuyo Dueño vinculó su cuenta de MercadoPago. Se alcanza automáticamente al vincular la cuenta y vuelve a Aprobado al desvincularla. Es el estado que habilita la visibilidad en el catálogo y la recepción de pedidos.
- **Rechazado:** solicitud denegada por el Administrador con motivo registrado. El Dueño puede corregir los datos y volver a solicitar la aprobación (hasta 3 veces por comercio).
- **Rechazo definitivo:** solicitud denegada de forma definitiva, a pedido del Administrador o porque se agotaron las re-solicitudes. No tiene salida desde la aplicación; no aparece en el catálogo ni recibe pedidos.
- **Suspendido:** inhabilitado por el Administrador ante una infracción. Se oculta del
  catálogo. Afecta únicamente a este comercio puntual, no a los demás comercios del
  mismo Dueño.
- **Inactivo:** el Dueño titular lleva 3 meses sin actividad. Se oculta del catálogo.
  Su información histórica, productos y pedidos se conservan en el sistema.
- **Cerrado Temporalmente:** el Dueño titular del comercio está en estado Bloqueado.
  Visible en el catálogo con indicador de "temporalmente cerrado" pero no puede recibir
  pedidos. Se revierte automáticamente al desbloquear la cuenta del Dueño vía
  recuperación de contraseña, restaurando a Aprobado todos los comercios de ese Dueño
  que estuvieran en este estado.
- **Cerrado Manualmente:** el comercio activó el cierre temporal desde su panel estando
  en estado Aprobado o Apto para Venta, con el Dueño en estado Activo y dentro de una
  franja de su horario de atención. Se representa mediante el campo
  `cerrado_manualmente = true` en la tabla Comercio, sin alterar el estado del comercio
  ni el del Dueño. Aparece en el catálogo con indicador de "temporalmente cerrado" y no
  puede recibir pedidos nuevos. Se revierte de forma manual o automáticamente al empezar
  la primera franja horaria posterior al momento del cierre.

---

## Regla de Visibilidad en Catálogo

Un comercio aparece en el catálogo público si su estado es Apto para Venta (Aprobado con
la cuenta de MercadoPago de su Dueño vinculada), o si su estado es Cerrado Temporalmente. En el
segundo caso, aparece con indicador de "temporalmente cerrado" y sin posibilidad de
recibir pedidos.

Un comercio se muestra como abierto y disponible para recibir pedidos solo si se
cumplen simultáneamente:
- `Comercio.estado == APTO_VENTA` (Aprobado, con la cuenta de MercadoPago del Dueño
  vinculada)
- `Comercio.dueño.usuario.estado == ACTIVO`
- El horario de consulta está dentro de las franjas horarias del comercio.
- `Comercio.cerrado_manualmente == false`

Un comercio aparece en el catálogo con indicador **"temporalmente cerrado"** — y sin
posibilidad de recibir pedidos — si se cumple alguna de estas condiciones:
- Su estado es `CERRADO_TEMPORALMENTE` (Dueño titular bloqueado), o
- Su estado es `APTO_VENTA` con `cerrado_manualmente = true` (cierre manual voluntario).

Un comercio `APTO_VENTA` fuera de todas las franjas de su horario se muestra como cerrado por
horario, también con el aviso de cuándo reabre.

---

## Cierre y Apertura Manual

- El Dueño o un Empleado autorizado de un comercio aprobado debe poder activar y
  desactivar el cierre manual desde el panel únicamente dentro de una franja de su
  horario de atención, sin modificar el estado del comercio ni el del Dueño. Fuera de
  horario, o con el comercio en un estado no operativo, el sistema no lo permite.
- Cerrar un comercio ya cerrado, o abrir uno ya abierto (por doble clic, dos personas a la
  vez o un reintento), no es un error: el sistema informa el estado actual y no registra
  una segunda acción en el historial.
- Cada cierre y cada reapertura quedan registrados con quién los hizo (Dueño, Empleado o
  sistema) y cuándo (HistorialCierreComercio).
- Al activar el cierre manual (`cerrado_manualmente = true`), el comercio dejará de
  recibir nuevos pedidos (no se puede agregar productos al carrito ni confirmar el
  pedido) y aparecerá en el catálogo con indicador de "temporalmente cerrado" y el aviso
  de cuándo reabre ("Reabre hoy a las HH:mm", "Reabre mañana a las HH:mm" o "Reabre el
  <día> a las HH:mm"). Los pedidos ya en curso, los pagos, los productos y el resto de la
  operación del comercio no se ven afectados.
- Al desactivar el cierre manual (`cerrado_manualmente = false`), el comercio vuelve a
  recibir pedidos si se cumplen las demás condiciones de visibilidad.
- En el panel del comercio, el Dueño dispone de un interruptor de recepción de pedidos con
  tres estados: "Recibiendo pedidos" (abierto, se puede pausar dentro del horario),
  "Pedidos pausados" (cerrado a mano, con el aviso de cuándo reabre) y "Fuera de horario"
  (apagado y bloqueado, porque el cierre y la apertura manual solo se permiten dentro de
  una franja). Mientras se cargan los datos se muestra un indicador de carga, nunca un
  estado por defecto.
- Cerrar desde el interruptor pide una confirmación breve ("¿Dejar de recibir pedidos?",
  con el aviso de que los pedidos en curso siguen su camino); cancelarla no cambia nada.
  Abrir no pide confirmación. Mientras se procesa un cambio, el interruptor no admite un
  segundo clic.
- El interruptor y las indicaciones de "Cerrado" solo se muestran para los comercios en
  estado Apto para Venta. Un comercio Aprobado sin cuenta de cobro, Pendiente, Suspendido
  u otro estado conserva su etiqueta habitual y no muestra interruptor ni indicación de
  cierre.
- En el selector de comercio (franja bajo el encabezado y panel "Tus comercios"), un
  comercio Apto para Venta cerrado, a mano o por horario, muestra la etiqueta "Cerrado"
  (y, en el panel, el aviso de cuándo reabre); uno abierto no muestra ninguna. Estos
  estados se actualizan solos, incluida la reapertura automática, sin recargar la
  pantalla.
- El cierre manual se revierte automáticamente al empezar la primera franja horaria
  posterior al momento del cierre (la próxima franja, incluso el mismo día), o antes si el
  comercio se reabre a mano. Las franjas que cruzan la medianoche se cargan como dos
  filas y no se unen (ver Alcance y Limitaciones).
- Un comercio fuera de su horario de atención también aparece como cerrado, con el aviso
  de cuándo reabre.

---

## Gestión de Productos

- El comercio aprobado con MP vinculado debe poder crear productos con nombre,
  descripción, precio, categoría (obligatoria), tags (opcionales), grupos de extras
  asociados (opcionales) e imágenes (entre 1 y 5; el comercio define el orden y cuál se
  muestra como principal).
- El Dueño o un Empleado autorizado debe poder editar los datos de los productos del
  comercio en cualquier momento.
- Cada producto puede encontrarse en uno de los siguientes estados:
  - **DISPONIBLE:** el producto es visible en el menú y puede ser agregado al carrito
    y pedido.
  - **AGOTADO:** el producto es visible en el menú con indicador "Agotado", pero no
    puede ser agregado al carrito ni incluido en nuevos pedidos. Esta acción elimina
    el producto de los carritos activos y notifica a los clientes afectados. Puede
    restaurarse a DISPONIBLE cuando se reponga el stock.
  - **DESCONTINUADO:** el producto fue retirado permanentemente. No aparece en el menú
    pero se conserva en el historial de pedidos. Esta acción es irreversible y también
    elimina el producto de los carritos activos, notificando a los clientes afectados.
- El sistema debe registrar las fechas de creación, modificación y baja de cada
  producto.
- Cada producto debe tener una categoría obligatoria y tags opcionales, seleccionados
  del catálogo gestionado por el Administrador. Solo pueden seleccionarse categorías y
  tags con estado activo.

---

## Gestión de Extras

- El Dueño o un Empleado autorizado debe poder crear, editar y dar de baja grupos de
  extras propios del comercio (por ejemplo, "Agregados" o "Elegí tu salsa"), definiendo
  nombre, cantidad máxima de opciones seleccionables y si el grupo es obligatorio para
  confirmar el pedido.
- Dentro de cada grupo, debe poder crear, editar y dar de baja extras individuales con
  nombre y precio adicional (se suma al precio del producto).
- Un mismo grupo de extras puede asociarse a uno o varios productos del comercio. Un
  producto sin grupos de extras asociados no ofrece extras.
- Dar de baja un grupo de extras o un extra es una baja lógica: no afecta los pedidos
  ya confirmados que lo incluyan (el precio queda congelado como snapshot histórico) ni
  los ítems ya presentes en carritos activos.
- Al confirmar un pedido, el sistema valida que todo grupo de extras obligatorio
  asociado a cada producto del pedido tenga al menos un extra elegido, rechazando la
  confirmación con un mensaje claro en caso contrario.

---

## Gestión de Pedidos

- El Dueño o un Empleado autorizado debe recibir una notificación ante cada nuevo
  pedido entrante (estado PENDIENTE_CONFIRMACION_COMERCIO).
- El sistema debe validar que el horario de confirmación del pedido esté dentro de las
  franjas horarias del comercio. Si está cerrado, se informa al cliente el horario de
  atención disponible.
- El Dueño o un Empleado autorizado debe poder aceptar o rechazar un pedido en estado
  PENDIENTE_CONFIRMACION_COMERCIO. El rechazo requiere seleccionar un **motivo predefinido** de la siguiente
  lista: Sin Stock, Local Cerrado, Alto Volumen de Pedidos, Producto No Disponible
  Temporalmente, Sin Delivery Disponible, Problema Técnico u Otro. Si el motivo es
  "Otro", debe ingresar obligatoriamente una descripción adicional. Para cualquier
  motivo puede agregar comentarios adicionales opcionales. El estado resultante del
  rechazo es RECHAZADO.
- **Flujo de estados — Domicilio:** PENDIENTE_CONFIRMACION_COMERCIO → EN_PREPARACION → EN_CAMINO → ENTREGADO.
- **Flujo de estados — Retiro:** PENDIENTE_CONFIRMACION_COMERCIO → EN_PREPARACION → LISTO_PARA_RETIRAR →
  ENTREGADO.
- El Dueño o un Empleado autorizado debe poder confirmar la entrega de un pedido de
  retiro cuando el cliente se presente a retirarlo (ENTREGADO, fuente: COMERCIO).
- El Dueño o un Empleado autorizado debe poder marcar como ENTREGADO un pedido de
  retiro cuando el cliente no se presente a retirarlo (ENTREGADO, fuente:
  COMERCIO_SIN_RETIRO), cerrando el pedido sin generar reembolso.
- El Dueño o un Empleado autorizado debe poder anular un pedido desde estado
  EN_PREPARACION, seleccionando un **motivo predefinido** de la lista de motivos de
  rechazo. Esta acción es irreversible y genera automáticamente la nota de crédito y el
  reembolso al cliente. No aplica desde estados posteriores.
- El pedido vence automáticamente (estado EXPIRADO) si nadie responde en 30 minutos desde
  la confirmación del pago, generando el reembolso correspondiente al cliente.
- El Dueño o un Empleado autorizado ve únicamente los pedidos que llegaron al comercio con el pago aprobado (los que pasaron por PENDIENTE_CONFIRMACION_COMERCIO). Un pedido que nunca llegó pagado no aparece en la lista, en el resumen ni en el detalle de pago, y sus acciones responden como recurso inexistente.
- La fecha de un pedido para el comercio es la de la confirmación del pago, no la de su creación, y es la que define qué pedidos cuentan como "de hoy".
- El panel muestra tres contadores del día: pedidos de hoy (los que llegaron pagados hoy, sin importar cómo terminaron), pendientes (los que están en PENDIENTE_CONFIRMACION_COMERCIO) y facturado hoy (suma del subtotal de los que llegaron pagados hoy y hoy están en EN_PREPARACION, EN_CAMINO, LISTO_PARA_RETIRAR o ENTREGADO).

---

## Historial y Seguimiento

- El Dueño o un Empleado autorizado debe poder visualizar el historial completo de
  pedidos del comercio con filtros por estado, fecha y cliente.
- El sistema debe notificar ante: nuevo pedido recibido, aprobación, rechazo o
  suspensión del comercio, pedido expirado por no respuesta.
- El sistema debe registrar el historial de estados de cada pedido con marcas de
  tiempo en cada transición.

---

## Gestión de Valores en Pedidos

- Al momento de crear un pedido, el sistema registra los valores vigentes de las
  tarifas de servicio (cargo al cliente y cargo al comercio) como campos propios del
  pedido (`cargo_servicio_cliente`, `cargo_servicio_comercio`). Estos valores no se
  modifican aunque las tarifas cambien posteriormente.
- El split de pagos con MercadoPago se configura en cada solicitud de cobro con el
  `marketplace_fee` correspondiente: `marketplace_fee = cargo_servicio_cliente +
  cargo_servicio_comercio`. La cuenta de MercadoPago del Dueño titular del comercio
  recibe automáticamente: `subtotal - cargo_servicio_comercio`.
- `marketplace_fee` es el campo que el sistema envía en la preferencia de Checkout Pro. Es un monto absoluto en pesos, ya calculado, que MercadoPago transfiere a la cuenta dueña de la aplicación; no admite fórmulas ni desglose. La entrada de la respuesta de MercadoPago que informa esa comisión se llama `application_fee` dentro de `fee_details`: es solo el nombre con que MercadoPago la devuelve y no implica usar el mecanismo `application_fee` de la API de Pagos.
- El panel del comercio debe mostrar en el detalle de cada pedido el cargo de servicio al comercio y, como total, lo que el comercio efectivamente factura (`subtotal - cargo_servicio_comercio`), no lo que pagó el cliente. El indicador "Facturado hoy" del panel se calcula con el mismo criterio neto.
