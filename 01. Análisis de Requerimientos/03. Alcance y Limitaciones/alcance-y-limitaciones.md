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
El sistema clasifica a los comercios en dos categorías: **Restaurante** y **Emprendimiento
gastronómico**. Esta clasificación es informativa y visual; ambas categorías tienen las
mismas funcionalidades dentro de la plataforma.

### Usuarios contemplados
El sistema gestiona tres roles: Cliente, Comercio y Administrador. Cualquier comercio
gastronómico de Río Grande puede registrarse, quedando habilitado tras la aprobación
del Administrador y la vinculación de su cuenta de MercadoPago.

### Acceso público
La visualización de comercios y menús es pública y no requiere registro. El catálogo
muestra los comercios que cumplen las siguientes condiciones:
- Estado **Aprobado** con cuenta de MercadoPago vinculada y `cerrado_manualmente = false`:
  aparecen como disponibles si están dentro de su horario de atención.
- Estado **Aprobado** con `cerrado_manualmente = true`: aparecen en el catálogo con
  indicador visual de "temporalmente cerrado", sin posibilidad de recibir pedidos.
- Estado **Cerrado Temporalmente** (representante con cuenta bloqueada): aparecen en el
  catálogo con indicador visual de "temporalmente cerrado", sin posibilidad de recibir
  pedidos.

Los comercios en estado Pendiente, Rechazado, Suspendido o Inactivo no aparecen en
el catálogo. Para realizar pedidos, el usuario debe contar con una cuenta activa y
verificada.

Un comercio puede recibir pedidos únicamente si se cumplen en simultáneo todas las
siguientes condiciones:
- `Comercio.estado == APROBADO`
- `Comercio.mp_vinculado == true`
- `Usuario.estado == ACTIVO`
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
   al recibir esta confirmación el pedido avanza al estado **Pendiente** (esperando
   al comercio) y el carrito se limpia.
3. Si el pago no se confirma en 30 minutos, el pedido expira automáticamente
   sin generar reembolso (no hubo cobro).
4. Si el comercio no responde al pedido en 1 hora desde la confirmación del pago,
   el pedido pasa a estado **Expirado** y se genera el reembolso completo al cliente.

Cada transacción aplica automáticamente las tarifas de servicio configuradas por el
Administrador: un cargo al cliente sumado al subtotal y un cargo al comercio
descontado de su cobro mediante split automático. Las transacciones en efectivo
u otros métodos externos quedan fuera del alcance del sistema.

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
| Pendiente | Pago confirmado, esperando respuesta del comercio (1 h de margen) |
| En Preparación | Pedido aceptado por el comercio |
| En Camino | Pedido despachado (solo domicilio) |
| Listo para Retirar | Pedido listo para ser retirado (solo retiro) |
| Entregado | Pedido completado |
| Rechazado | Comercio rechazó el pedido en estado Pendiente. Genera reembolso |
| Cancelado | Cliente canceló antes del despacho o de que estuviera listo. Genera reembolso |
| Anulado | Comercio anuló desde En Preparación. Genera reembolso |
| Cancelado por Sistema | Cancelación automática (suspensión del comercio, pago rechazado). Genera reembolso si hubo cobro |
| Expirado | Comercio no respondió en 1 hora. Genera reembolso automático |

---

## Limitaciones

- **Sin rol de repartidor:** No se incluye un módulo de gestión de repartidores. El
  seguimiento del envío es manual y responsabilidad del comercio.

- **Sin cálculo de costo de envío:** La plataforma no gestiona ni calcula tarifas de
  envío en esta versión.

- **Un solo comercio por pedido:** Un pedido individual no puede combinar productos de
  distintos comercios. Sin embargo, un cliente puede tener varios pedidos activos
  simultáneos, cada uno de un comercio diferente.

- **Una cuenta de Comercio = un negocio:** El modelo de datos contempla que una misma
  persona jurídica pueda operar más de un comercio (relación 1:N). En esta versión,
  sin embargo, cada cuenta de Comercio (persona jurídica) está limitada a operar un
  único comercio. La gestión de múltiples comercios desde una misma cuenta queda
  planteada como mejora para versiones futuras.

- **Cobertura geográfica limitada:** El sistema no contempla operaciones fuera de
  Río Grande en esta versión, si bien el modelo de direcciones admite localidades de
  todo el país de cara a una futura expansión.

- **Sin app móvil nativa:** La experiencia mobile se resuelve mediante diseño responsivo;
  no se desarrollan apps para iOS ni Android.

- **Sin integración con redes sociales:** No se contempla login social ni sincronización
  con plataformas externas como Instagram o WhatsApp.

- **Pedidos en camino durante suspensión:** Si un comercio es suspendido mientras tiene
  pedidos en estado En Camino, esos pedidos se completan automáticamente como entregados.
  No se generan reembolsos en ese caso, ya que el envío ya estaba en curso.

- **Timer de retiro durante suspensión:** Si un comercio es suspendido y tiene pedidos
  en estado Listo para Retirar, el cliente dispone de 90 minutos para presentarse. Si
  no lo hace, el pedido se cierra automáticamente sin reembolso.
