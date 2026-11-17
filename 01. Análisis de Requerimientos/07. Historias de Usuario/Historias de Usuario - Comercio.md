# Historias de Usuario — Comercio

Historias operativas del negocio en sí. Pueden ser ejecutadas tanto por el Dueño
titular del comercio como por un Empleado en estado Activo dentro de ese comercio. Las
historias de identidad de cuenta, datos fiscales y Mercado Pago están en Historias de
Usuario — Dueño; las de invitación y permisos del rol Empleado, en Historias de Usuario
— Empleado.

## HU-CO01: Editar mi Perfil de Negocio y Horarios

Como Dueño o Empleado autorizado, quiero editar los datos del negocio (nombre,
descripción, foto de perfil del comercio, tipo de comercio, teléfono, email de
contacto, modalidades de entrega) y sus horarios de atención, para mantener
la información visible y actualizada. El tipo de comercio se elige entre 13 opciones (Restaurante, Emprendimiento, Rotisería, Heladería, Cafetería, Panadería, Pizzería, Parrilla, Bar, Kiosco, Food Truck, Hamburguesería u Otro) y el nombre tiene que ser único en toda la plataforma: el formulario me avisa en vivo si está disponible. Como Empleado solo edito la descripción, el teléfono y los horarios; el resto lo veo, pero lo cambia el Dueño. Sé que la foto de perfil del comercio es propia de
ese negocio y obligatoria, distinta de la foto de perfil personal del Dueño. Como
Empleado no veo la razón social, el CUIT ni los demás datos fiscales o del representante,
y puedo editar los horarios. Un cambio de horarios rige desde mañana: veo qué rige hoy y qué
regirá desde mañana, y puedo cancelar el cambio programado. Un turno puede terminar al día
siguiente (por ejemplo, de 20:00 a 02:00) y cuenta como un solo turno. Si el comercio está suspendido no puedo guardar cambios de horarios.

## HU-CO02: Gestionar mis Redes Sociales

Como Dueño, quiero cargar, editar y dar de baja los enlaces a mis redes sociales y
canales de contacto (Instagram, WhatsApp, sitio web, entre otros), para que los clientes
puedan encontrarme y contactarme fuera de la plataforma. Esta acción es exclusiva del
Dueño: un Empleado no gestiona los enlaces a redes sociales.

## HU-CO03: Crear un Producto

Como Dueño o Empleado autorizado, quiero crear productos con nombre, descripción,
precio, categoría obligatoria, tags opcionales y fotos,
para armar mi menú digital. Si se corta la conexión y no sé si el producto se creó, la aplicación me avisa que revise la lista de Productos antes de volver a enviarlo.

## HU-CO04: Editar un Producto

Como Dueño o Empleado autorizado, quiero editar los datos de mis productos en
cualquier momento, para mantener mi menú actualizado ante cambios de precio,
descripción o disponibilidad. Si el sistema no me deja (por ejemplo, el comercio está
suspendido), el motivo aparece en un aviso rojo fijo en la misma pantalla (lista,
formulario o subida de fotos). El precio de un producto no se puede cambiar mientras mi
comercio está dentro de uno de sus horarios de atención: el campo aparece deshabilitado
con un candado y la leyenda "Se puede cambiar fuera de tu horario de atención", y se
habilita solo cuando el horario termina; el resto del producto lo sigo editando.

## HU-CO05: Gestionar el Estado de Disponibilidad de un Producto

Como Dueño o Empleado autorizado, quiero poder marcar un producto como Agotado para
indicar que está temporalmente sin stock (aparece visible en el menú pero no se puede
pedir), restaurarlo a Disponible cuando tenga stock nuevamente, o descontinuarlo
permanentemente cuando ya no lo vaya a ofrecer más, para mantener mi menú siempre
actualizado sin perder el historial de ventas.

## HU-CO06: Gestionar Grupos de Extras y Extras de un Producto *(descartada: fuera de alcance)*

Los extras de producto fueron descartados del alcance de esta versión (decisión del 18/10/2026): no hay pantallas ni endpoints para crearlos ni asociarlos a productos. El modelo de datos conserva las tablas, sin uso. Queda como posible trabajo futuro.

## HU-CO07: Ver Pedidos Entrantes

Como Dueño o Empleado autorizado, quiero recibir notificaciones de nuevos pedidos y
verlos listados en mi panel, para gestionarlos a tiempo y no perder ventas.

**Criterios de aceptación:**
- La lista de pedidos y el panel se actualizan solos cada 15 segundos con la pantalla visible; un pedido que llegó queda marcado como nuevo hasta que abro su detalle.
- Puedo encender o apagar el "Sonido activado / desactivado": con la aplicación abierta suena un aviso cuando llega un pedido (no hay avisos fuera de la aplicación).
- En escritorio la lista tiene el detalle del pedido elegido al costado, y puedo resolverlo sin cambiar de página.

## HU-CO08: Aceptar un Pedido

Como Dueño o Empleado autorizado, quiero aceptar un pedido pendiente, para confirmarle
al cliente que su compra está siendo procesada. Sé que dispongo de 30 minutos para
responder antes de que el pedido expire automáticamente: cada pedido pendiente me dice "Vence en N minutos", calculado por el servidor desde que se confirmó el pago, y pasado ese plazo expira solo y se devuelve el pago al cliente. El cliente no ve ese plazo.

## HU-CO09: Rechazar un Pedido

Como Dueño o Empleado autorizado, quiero rechazar un pedido seleccionando un motivo
predefinido de una lista (sin stock, local cerrado, alto volumen de pedidos, etc.) y
agregar un comentario adicional si es necesario, para informarle al cliente la razón
por la cual no puedo atender su solicitud y garantizarle el reembolso. Antes de rechazar, el sistema me pide confirmación y me explica: "El cliente recibe la devolución de todo el pago por Mercado Pago. Puede demorar en verse en su cuenta. Le avisamos el motivo y tu comentario.".

## HU-CO10: Gestionar el Estado de un Pedido

Como Dueño o Empleado autorizado, quiero actualizar el estado de un pedido a lo largo
de su ciclo (en preparación, en camino o listo para retirar), para mantener al cliente
informado en cada etapa del proceso de entrega.

## HU-CO11: Confirmar Entrega de Retiro

Como Dueño o Empleado autorizado, quiero confirmar la entrega de un pedido de retiro
cuando el cliente se presenta, o cerrarlo como "no retirado" cuando no vino (pasados 60
minutos desde que quedó listo), para registrar el cierre del pedido en ambos casos sin
marcar como entregado un pedido que nadie retiró. "Cerrar como no retirado" aparece apagado con la ayuda "Disponible en N min (desde las HH:mm)" hasta que pasa la espera, y antes de cerrar el sistema me avisa que no se devuelve el pago al cliente.

## HU-CO12: Anular un Pedido

Como Dueño o Empleado autorizado, quiero anular un pedido que ya acepté seleccionando
un motivo predefinido de una lista, para gestionar situaciones imprevistas (como
quedarse sin stock durante la preparación) y garantizar el reembolso automático al
cliente. Antes de anular, el sistema me pide confirmación y me explica que el cliente recibe la devolución de todo el pago.

## HU-CO13: Cerrar o Abrir mi Comercio Manualmente

Como Dueño o Empleado autorizado, quiero poder cerrar temporalmente mi local desde el
panel aunque todavía esté dentro de mi horario de atención, para detener la recepción
de pedidos cuando me quedo sin stock u ocurre algo imprevisto, y reabrirlo cuando esté
listo, sin que esto afecte el estado de la cuenta ni los pedidos ya en curso.

**Criterios de aceptación:**
- Solo puedo cerrar o abrir mi comercio dentro de una franja de mi horario de atención
  y mientras esté Apto para Venta; si no (por ejemplo, está suspendido o cerrado
  temporalmente por el bloqueo de la cuenta del Dueño), el sistema me lo explica.
- Al cerrarlo, los clientes dejan de poder agregar productos al carrito y confirmar
  pedidos de mi comercio, y en el catálogo aparece como "temporalmente cerrado" con el
  aviso de cuándo reabre. Los pedidos que ya están en curso siguen su camino: puedo
  aceptarlos o rechazarlos, y los pagos que llegan se registran con normalidad.
- Si toco "Cerrar" o "Abrir" dos veces seguidas, el sistema no da error y muestra el
  estado actual.
- Si no lo reabro yo, el comercio se reabre solo al empezar la próxima franja de mi
  horario (incluso el mismo día).
- Cada cierre y cada reapertura quedan registrados con quién los hizo y cuándo.
- Desde el panel veo un interruptor que me dice en qué estado estoy: "Recibiendo pedidos"
  (puedo pausarlo dentro de mi horario), "Pedidos pausados" (con el aviso de cuándo
  reabre) o "Fuera de horario" (apagado y bloqueado, porque fuera de mi horario no puedo
  cambiarlo).
- Al cerrar, el sistema me pide una confirmación corta; si cancelo, no pasa nada. Al
  abrir no me pide confirmación.
- Solo veo el interruptor y la indicación de "Cerrado" si mi comercio está Apto para
  Venta; si todavía no vinculé Mercado Pago, veo mi comercio como siempre.
- Si manejo varios comercios, en el selector veo la etiqueta "Cerrado" en los que están
  cerrados, y se actualiza sola, incluso cuando un comercio se reabre automáticamente.
- Si el sistema rechaza el cierre o la apertura por una regla (por ejemplo, el comercio
  pasó a estar suspendido), el motivo aparece en un aviso rojo fijo debajo del
  interruptor y no se va solo. Un error de conexión sigue saliendo como aviso temporal.
- Como Empleado autorizado veo el mismo interruptor en el panel, con las mismas reglas.

## Nota de la etapa 3: notificaciones del comercio en pantalla

Como Dueño o Empleado autorizado, veo la campana en el panel con el contador de avisos sin leer del comercio que tengo abierto, y en la pantalla de notificaciones puedo abrir cada pedido con "Ver pedido" y dejar leídos todos mis avisos del comercio con "Marcar todas". Cada persona del equipo tiene su propia copia de cada aviso, así que lo que lee una no cambia lo de las demás. Tocar un aviso entero me lleva a la pantalla donde actúo (el pedido, el equipo, la documentación) y lo marca como leído; los informativos solo se marcan. Los no leídos se distinguen por un fondo suave, un punto y el texto "No leída", y la lista se carga de a 20 con "Ver más".

## HU-CO14: Ver Solo los Pedidos ya Pagados

Como Dueño o Empleado autorizado, quiero ver únicamente los pedidos cuyo pago ya fue
confirmado, con la fecha en que se pagaron y los contadores del turno (vendido, pedidos
del turno y pendientes), para gestionar solo ventas reales y tener un resumen fiel de mi
turno (en escritorio, también los pedidos en preparación). El panel me dice si el turno está en curso o ya terminó, y se actualiza solo cuando
termina. Como Dueño puedo desplegar además la comisión y el neto del turno.
Como Dueño recibo además, por email, el resumen de cada turno cuando termina.

## HU-CO15: Ver Quién Atendió un Pedido

Como Dueño o Empleado autorizado, quiero ver en el detalle de un pedido el recorrido de
cada paso (quién lo hizo, a qué hora y, si se rechazó o se anuló, el motivo) para saber
quién atendió cada pedido y resolver dudas con el cliente.

**Criterios de aceptación**
- Veo cada transición del pedido, de la primera a la última, con el nombre y apellido de
  quien actuó y su rol (Dueño, Empleado, Cliente o Sistema); el sistema figura sin nombre.
- En el rechazo y la anulación veo el motivo y el comentario.
- No veo el pedido todavía no pagado ni su vencimiento por falta de pago.
- El cliente no ve qué empleado atendió su pedido.
- Si soy Empleado y el pedido es uno que yo mismo hice como cliente, no puedo ver su
  recorrido ni gestionarlo ("No podés gestionar tus propios pedidos"); en el detalle veo una nota
  que lo explica.
- El recorrido es una línea de tiempo: texto de cada paso, hora y "nombre, rol"; el sistema
  figura solo como "Sistema".

## HU-CO16: Trabajar con mi Comercio Suspendido

Como Dueño o Empleado autorizado, quiero entender qué puedo hacer cuando el Administrador suspende mi comercio, para resolver los pedidos que ya tengo en curso sin perder el dinero de mis clientes.

**Criterios de aceptación:**
- Veo el panel en solo lectura: no puedo editar productos, precios, perfil, horarios ni redes sociales, ni abrir o cerrar el comercio, ni aceptar pedidos nuevos.
- Una franja arriba de la lista de pedidos dice hasta qué hora (90 minutos desde la suspensión) tengo para resolver los pedidos en curso, y cada pedido dice qué puedo hacer.
- Los pedidos que esperaban mi respuesta se rechazaron solos y se reembolsaron; si alguno todavía aparece, dice "Se va a rechazar y reembolsar solo." y no se puede aceptar.
- Un pedido en preparación lo puedo despachar o anular antes de la hora límite; después se cancela solo con reembolso total. Un pedido listo para retirar lo puedo entregar o cerrar como no retirado; después se cierra solo como no retirado, sin reembolso. Un pedido en camino sigue su curso.
- Un pedido que el sistema anuló porque el comercio quedó sin quien lo atienda dice "Este pedido se anuló automáticamente.".
- Cuando levantan la suspensión recibo un aviso (el Dueño, con el mensaje del equipo si lo hay).
- Si mi comercio está inactivo por falta de uso del Dueño, lo veo en solo lectura ("El comercio está inactivo: por ahora no se puede modificar.").

## HU-CO17: Ver el Reclamo de un Pedido

Como Dueño, quiero ver cuando un cliente reclamó un pedido de mi comercio y cómo se resolvió, para entender qué pasó con ese pedido.

**Criterios de aceptación:**
- En el detalle del pedido veo, en solo lectura, el estado del reclamo y su motivo; si hubo reembolso, "Se reembolsaron $X al Cliente." (o "Se están reembolsando $X al Cliente.").
- No veo el mensaje del cliente ni las fotos, y no resuelvo el reclamo.
- Recibo un aviso cuando un reclamo se resuelve con reembolso. El Empleado no ve nada del reclamo.
