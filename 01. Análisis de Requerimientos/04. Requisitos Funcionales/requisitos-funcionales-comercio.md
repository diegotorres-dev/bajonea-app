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
- **Rechazado:** solicitud denegada por el Administrador con motivo registrado.
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
  en estado Aprobado y con el Dueño en estado Activo. Se representa mediante el campo
  `cerrado_manualmente = true` en la tabla Comercio, sin alterar el estado del comercio
  ni el del Dueño. Aparece en el catálogo con indicador de "temporalmente cerrado" y no
  puede recibir pedidos. Se revierte exclusivamente de forma manual.

---

## Regla de Visibilidad en Catálogo

Un comercio aparece en el catálogo público si su estado es Aprobado con la cuenta de
MercadoPago de su Dueño vinculada, o si su estado es Cerrado Temporalmente. En el
segundo caso, aparece con indicador de "temporalmente cerrado" y sin posibilidad de
recibir pedidos.

Un comercio se muestra como abierto y disponible para recibir pedidos solo si se
cumplen simultáneamente:
- `Comercio.estado == APROBADO`
- `Comercio.dueño.mp_vinculado == true`
- `Comercio.dueño.usuario.estado == ACTIVO`
- El horario de consulta está dentro de las franjas horarias del comercio.
- `Comercio.cerrado_manualmente == false`

Un comercio aparece en el catálogo con indicador **"temporalmente cerrado"** — y sin
posibilidad de recibir pedidos — si se cumple alguna de estas condiciones:
- Su estado es `CERRADO_TEMPORALMENTE` (Dueño titular bloqueado), o
- Su estado es `APROBADO` con `cerrado_manualmente = true` (cierre manual voluntario).

---

## Cierre y Apertura Manual

- El Dueño o un Empleado autorizado de un comercio aprobado debe poder activar y
  desactivar el cierre manual desde el panel en cualquier momento dentro de su horario
  de atención, sin modificar el estado del comercio ni el del Dueño.
- Al activar el cierre manual (`cerrado_manualmente = true`), el comercio dejará de
  recibir nuevos pedidos y aparecerá en el catálogo con indicador de "temporalmente
  cerrado". Los pedidos ya en curso no se ven afectados.
- Al desactivar el cierre manual (`cerrado_manualmente = false`), el comercio vuelve a
  recibir pedidos si se cumplen las demás condiciones de visibilidad.
- El cierre manual no se revierte automáticamente; debe reabrirse manualmente.

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
  pedido entrante (estado PENDIENTE).
- El sistema debe validar que el horario de confirmación del pedido esté dentro de las
  franjas horarias del comercio. Si está cerrado, se informa al cliente el horario de
  atención disponible.
- El Dueño o un Empleado autorizado debe poder aceptar o rechazar un pedido en estado
  PENDIENTE. El rechazo requiere seleccionar un **motivo predefinido** de la siguiente
  lista: Sin Stock, Local Cerrado, Alto Volumen de Pedidos, Producto No Disponible
  Temporalmente, Sin Delivery Disponible, Problema Técnico u Otro. Si el motivo es
  "Otro", debe ingresar obligatoriamente una descripción adicional. Para cualquier
  motivo puede agregar comentarios adicionales opcionales. El estado resultante del
  rechazo es RECHAZADO.
- **Flujo de estados — Domicilio:** PENDIENTE → EN_PREPARACION → EN_CAMINO → ENTREGADO.
- **Flujo de estados — Retiro:** PENDIENTE → EN_PREPARACION → LISTO_PARA_RETIRAR →
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
- El pedido vence automáticamente (estado EXPIRADO) si nadie responde en 1 hora desde
  la confirmación del pago, generando el reembolso correspondiente al cliente.

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
  `application_fee` correspondiente: `application_fee = cargo_servicio_cliente +
  cargo_servicio_comercio`. La cuenta de MercadoPago del Dueño titular del comercio
  recibe automáticamente: `subtotal - cargo_servicio_comercio`.
