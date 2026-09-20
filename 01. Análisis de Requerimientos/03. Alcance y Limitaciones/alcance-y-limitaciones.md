# Alcance y Limitaciones

## Alcance del Proyecto

### Cobertura geográfica
El sistema está diseñado para operar en la ciudad de Río Grande, Tierra del Fuego. La
expansión a otros municipios de la provincia queda fuera del alcance de esta versión.

El modelo de datos de direcciones (catálogo de Provincias y Localidades, basado en la
API Georef de datos.gob.ar) cubre la totalidad del territorio nacional, previendo una
eventual expansión a futuro. Esto no implica una ampliación de la cobertura operativa:
comercios, pedidos y envíos continúan limitados a Río Grande en esta versión.

### Plataforma
La aplicación es una plataforma web responsiva, accesible desde escritorio y dispositivos
móviles. No se contempla el desarrollo de aplicaciones nativas para iOS o Android.

### Tipos de comercio
El sistema clasifica a los comercios según su rubro gastronómico mediante el campo
`tipo_comercio`, que admite los siguientes valores: Restaurante, Emprendimiento,
Rotisería, Heladería, Cafetería, Panadería, Pizzería, Parrilla, Bar, Kiosco, Food Truck
y Otro. Esta clasificación es informativa y visual; todos los tipos de comercio tienen
las mismas funcionalidades dentro de la plataforma. Queda registrado como criterio para
una eventual futura versión que permita filtrar el catálogo público por este campo;
dicho filtro no se implementa en esta versión.

### Usuarios contemplados
El sistema gestiona cuatro roles: Cliente, Dueño, Empleado y Administrador.

- **Dueño:** titular de uno o varios comercios. Se registra completando sus datos
  fiscales (persona jurídica) junto con los datos de su primer comercio; desde su panel
  puede dar de alta comercios adicionales sin volver a cargar esos datos fiscales. Cada
  comercio que administra queda habilitado de forma individual tras la aprobación del
  Administrador. La cuenta de MercadoPago se vincula una única vez a nivel Dueño y
  habilita el cobro en todos los comercios aprobados de ese Dueño.
- **Empleado:** cuenta con login propio, invitada por un Dueño para operar el día a día
  de uno o varios comercios (gestión de productos y pedidos), sin acceso a los datos
  fiscales, a la cuenta de MercadoPago ni a la gestión de otros empleados. Un mismo
  Empleado puede operar comercios de Dueños distintos sin restricción.
- **Roles combinados:** una misma persona puede tener simultáneamente rol Cliente y
  rol Empleado bajo el mismo Usuario/login (por ejemplo, alguien que pide comida como
  Cliente y también trabaja operando el panel de un comercio como Empleado). El modelo
  de datos lo soporta sin cambios de estructura: Cliente y Empleado son subtipos
  independientes de PersonaFisica. Si el sistema detecta más de un rol activo para el
  mismo Usuario, el login presenta un selector de contexto ("¿Cómo querés entrar: como
  Cliente, o como Empleado de [comercio]?"), reutilizando el mismo mecanismo del
  selector de comercio activo del Dueño. No implica cerrar sesión para cambiar de
  contexto.

### Acceso público
La visualización de comercios y menús es pública y no requiere registro. El catálogo
muestra los comercios que cumplen las siguientes condiciones:
- Estado **Apto para Venta** (Aprobado, con la cuenta de MercadoPago de su Dueño vinculada) y
  `cerrado_manualmente = false`: aparecen como disponibles si están dentro de su
  horario de atención.
- Estado **Aprobado** con `cerrado_manualmente = true`: aparecen en el catálogo con
  indicador visual de "temporalmente cerrado", sin posibilidad de recibir pedidos.
- Estado **Cerrado Temporalmente** (Dueño con cuenta bloqueada): aparecen en el
  catálogo con indicador visual de "temporalmente cerrado", sin posibilidad de recibir
  pedidos.

Los comercios en estado Pendiente, Rechazado, Suspendido o Inactivo no aparecen en
el catálogo. Para realizar pedidos, el usuario debe contar con una cuenta activa y
verificada.

Un comercio puede recibir pedidos únicamente si se cumplen en simultáneo todas las
siguientes condiciones:
- `Comercio.estado == APTO_VENTA` (Aprobado, con la cuenta de MercadoPago del Dueño titular vinculada)
- `Dueño.usuario.estado == ACTIVO`
- El horario de consulta está dentro de las franjas horarias del comercio.
- `Comercio.cerrado_manualmente == false`

### Gestión de direcciones
- **Clientes:** pueden registrar una o más direcciones de entrega. La primera se
  registra de forma obligatoria al crear la cuenta y queda como dirección principal.
  Desde el perfil pueden agregar, editar, eliminar y cambiar la principal en cualquier
  momento.
- **Comercios:** tienen una única dirección operativa, registrada al momento del alta.
- Cada dirección se asocia a una Localidad (y por extensión a una Provincia) mediante
  un selector que cubre todo el país, alimentado por un catálogo precargado desde la
  API Georef (datos.gob.ar).

### Pagos
El sistema integra MercadoPago como único medio de pago bajo el modelo Marketplace
con split de pagos. El flujo de pago funciona de la siguiente manera:

1. El pedido se crea en estado **Pendiente de Pago** y el cliente es redirigido a MP.
2. La confirmación llega de forma asíncrona vía **webhook de MercadoPago**. Solo
   al recibir esta confirmación el pedido avanza al estado **Pendiente de Confirmación** (esperando
   al comercio) y el carrito se limpia.
3. Si el pago no se confirma en 30 minutos, el pedido expira automáticamente
   sin generar reembolso (no hubo cobro). Un pago rechazado no cancela el pedido: el
   cliente puede reintentar hasta que se apruebe un pago o venza el plazo, y el link de
   pago vence junto con el pedido.
4. Si el comercio no responde al pedido en 1 hora desde la confirmación del pago,
   el pedido pasa a estado **Expirado** y se genera el reembolso completo al cliente.

Cada transacción aplica automáticamente las tarifas de servicio configuradas por el
Administrador: un cargo al cliente sumado al subtotal y un cargo al comercio
descontado de su cobro mediante split automático. Las transacciones en efectivo
u otros métodos externos quedan fuera del alcance del sistema.

### Personalización de Productos (Extras)
Un producto puede ofrecer uno o más grupos de extras opcionales (por ejemplo,
"Agregados" o "Elegí tu salsa"), cada grupo con un máximo de opciones seleccionables y
la posibilidad de ser obligatorio. El cliente elige sus extras al agregar el producto
al carrito; el precio de cada extra elegido se suma al precio del producto.

### Notificaciones
Las notificaciones de estado (cambios de pedido, aprobaciones, rechazos, reclamos) se
gestionan mediante notificaciones push dentro de la plataforma.

El email se utiliza en los siguientes flujos:
- Verificación de cuenta (al registrarse)
- Recuperación de contraseña
- Reactivación de cuenta (usuario inactivo)
- Aviso de inactivación automática (al pasar a estado Inactivo)
- Aviso de suspensión (en casos de notificación crítica al comercio o cliente)
- Aviso de suspensión levantada (cuando el administrador reactiva una cuenta suspendida)
- Aviso de sesión cerrada en otro dispositivo (seguridad)
- Cancelación de pedido por suspensión del comercio (notificación a clientes afectados)
- Invitación a operar un comercio como Empleado (al email de la persona invitada)

### Gestión de pedidos
El sistema contempla retiro en el local y envío a domicilio, con la posibilidad de
que un comercio ofrezca una o ambas modalidades. Un cliente puede tener múltiples
pedidos activos simultáneamente, siempre que cada pedido pertenezca a un único
comercio diferente.

El comercio puede cerrar su local manualmente en cualquier momento desde su panel,
independientemente del horario configurado. Esta acción no modifica el estado del
comercio ni del usuario; solo detiene la recepción de nuevos pedidos hasta que el
comercio vuelva a abrirse manualmente.

Los pedidos atraviesan los siguientes estados a lo largo de su ciclo de vida:

| Estado | Descripción |
|--------|-------------|
| Pendiente de Pago | Pedido creado, esperando confirmación de pago por MP |
| Pendiente de Confirmación | Pago confirmado, esperando respuesta del comercio (1 h de margen) |
| En Preparación | Pedido aceptado por el comercio |
| En Camino | Pedido despachado (solo domicilio) |
| Listo para Retirar | Pedido listo para ser retirado (solo retiro) |
| Entregado | Pedido completado |
| Rechazado | Comercio rechazó el pedido en estado Pendiente de Confirmación. Genera reembolso |
| Cancelado | Cliente canceló antes del despacho o de que estuviera listo. Genera reembolso |
| Anulado | Comercio anuló desde En Preparación. Genera reembolso |
| Cancelado por Sistema | Cancelación automática (suspensión del comercio, pago no confirmado o rechazado al vencer el plazo). Genera reembolso si hubo cobro |
| Expirado | Comercio no respondió en 1 hora. Genera reembolso automático |

---

## Limitaciones

- **Sin rol de repartidor:** No se incluye un módulo de gestión de repartidores. El
  seguimiento del envío es manual y responsabilidad del comercio.

- **Sin niveles de permiso entre Empleados:** todo Empleado en estado Activo dentro de
  un comercio (relación EmpleadoComercio) cuenta con el mismo conjunto de permisos
  operativos (gestión de productos y pedidos). No existen sub-roles ni permisos
  diferenciados entre empleados de un mismo comercio.

- **Sin cálculo de costo de envío:** La plataforma no gestiona ni calcula tarifas de
  envío en esta versión.

- **Un solo comercio por pedido:** Un pedido individual no puede combinar productos de
  distintos comercios. Sin embargo, un cliente puede tener varios pedidos activos
  simultáneos, cada uno de un comercio diferente.

- **Cobertura geográfica limitada:** El sistema no contempla operaciones fuera de
  Río Grande en esta versión, si bien el modelo de direcciones admite localidades de
  todo el país de cara a una futura expansión.

- **Sin app móvil nativa:** La experiencia mobile se resuelve mediante diseño responsivo;
  no se desarrollan apps para iOS ni Android.

- **Sin integración con redes sociales:** No se contempla login social ni sincronización
  automática con plataformas externas como Instagram o WhatsApp. Esto no incluye la
  publicación de enlaces de contacto a las redes del comercio (Instagram, Facebook,
  TikTok, WhatsApp, X, sitio web u otro), que el comercio carga y edita
  manualmente como dato de contacto — ver Requisitos Funcionales del Comercio.

- **Pedidos en camino durante suspensión:** Si un comercio es suspendido mientras tiene
  pedidos en estado En Camino, esos pedidos se completan automáticamente como entregados.
  No se generan reembolsos en ese caso, ya que el envío ya estaba en curso.

- **Timer de retiro durante suspensión:** Si un comercio es suspendido y tiene pedidos
  en estado Listo para Retirar, el cliente dispone de 90 minutos para presentarse. Si
  no lo hace, el pedido se cierra automáticamente sin reembolso.

---

## Limitaciones Conocidas de Implementación

Diferencias entre lo especificado en este documento y en los Requisitos Funcionales, y lo implementado al 2026-09-20. Son funcionalidades especificadas y todavía no implementadas, no cambios de alcance.

**Pagos y reembolsos**
- **Nota de crédito y reembolso:** la entidad `NotaCredito` existe, pero el flujo de reembolso no. Los estados que la especificación marca "con reembolso" (rechazo, cancelación, anulación, expiración por falta de respuesta y cancelación por suspensión) hoy cambian el estado del pedido sin devolver el dinero; el código lo deja marcado con un TODO en `PedidoService`.
- **Pago tardío y pago duplicado:** un pago aprobado sobre un pedido ya cancelado, o un segundo pago aprobado sobre un pedido ya pagado, solo generan una alerta registrada en base de datos (`alerta_webhook_mp`). No se devuelve el dinero y la consulta de las alertas por pantalla no existe.
- **Cancelación y anulación con devolución de dinero** y **reembolso parcial por ítem:** sin implementar.
- **Pago en revisión:** mientras un pago está `pending` o `in_process` no se puede reintentar el pago hasta que se resuelva o venza el pedido. Es un comportamiento intencional.

**Integración con MercadoPago**
- **Renovación de tokens:** no existe refresh. El token de acceso de la cuenta vinculada vence a los ~6 meses.
- **Verificación del monto:** el webhook y la sincronización no verifican que el monto pagado coincida con el total del pedido.
- **Firma del webhook:** se valida solo si el secreto `MERCADOPAGO_WEBHOOK_SECRET` está configurado; sin él se omite y se registra una advertencia.
- **Identificador de pedido no numérico en el webhook:** responde con un error 500.
- **Loggers dedicados de MercadoPago** (`webhook.mercadopago`, `jobs.*`, `audit`): no existen; se usa el logger estándar de cada clase.

**Pedidos y comercios**
- **EN_CAMINO al suspender un comercio:** no está implementado. Al suspender, los pedidos en PENDIENTE_CONFIRMACION_COMERCIO y EN_PREPARACION se cancelan y los LISTO_PARA_RETIRAR inician el timer de 90 minutos, pero los EN_CAMINO no se modifican: siguen su curso normal (confirmación del cliente o autoconfirmación a los 90 minutos).
- **Cierre manual (`cerrado_manualmente`):** la columna existe en la base de datos, pero ningún código la usa: no hay control en el panel ni se verifica al recibir pedidos.
- **Catálogo y estado Cerrado Temporalmente:** el catálogo público lista únicamente comercios en estado APTO_VENTA; los comercios en CERRADO_TEMPORALMENTE no aparecen con el indicador de "temporalmente cerrado".
- **Historial de estados del comercio (`HistorialEstadoComercio`):** hoy se escribe solo al aprobar, rechazar y suspender un comercio (Administrador) y en las transiciones automáticas `APROBADO ↔ APTO_VENTA` al vincular o desvincular MercadoPago. No registran historial la propagación de bloqueo (`CERRADO_TEMPORALMENTE`), su restauración al recuperar la contraseña, la inactivación ni la restauración por reactivación de cuenta. El código lo deja documentado en `AuthService`.
- **Levantar la suspensión de un comercio:** no está implementado (no existe el endpoint ni el método de servicio), por lo que tampoco se registra esa transición.
- **Empleado:** no existe código que le permita ver ni operar pedidos.
- **Login y registro por nombre de usuario:** no implementados.
- **Zona horaria:** las fechas y el "hoy" del panel del comercio dependen de la zona horaria de la JVM del servidor (en local, -03:00). La verificación de horario de atención usa -03:00 fijo.
