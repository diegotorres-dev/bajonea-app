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
la información visible y actualizada. Sé que la foto de perfil del comercio es propia de
ese negocio y obligatoria, distinta de la foto de perfil personal del Dueño. Como
Empleado no veo la razón social, el CUIT ni los demás datos fiscales o del representante,
y puedo editar los horarios. Un cambio de horarios rige desde mañana: veo qué rige hoy y qué
regirá desde mañana, y puedo cancelar el cambio programado. Un turno puede terminar al día
siguiente (por ejemplo, de 20:00 a 02:00).

## HU-CO02: Gestionar mis Redes Sociales

Como Dueño, quiero cargar, editar y dar de baja los enlaces a mis redes sociales y
canales de contacto (Instagram, WhatsApp, sitio web, entre otros), para que los clientes
puedan encontrarme y contactarme fuera de la plataforma. Esta acción es exclusiva del
Dueño: un Empleado no gestiona los enlaces a redes sociales.

## HU-CO03: Crear un Producto

Como Dueño o Empleado autorizado, quiero crear productos con nombre, descripción,
precio, categoría obligatoria, tags opcionales, grupos de extras opcionales y fotos,
para armar mi menú digital.

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

## HU-CO06: Gestionar Grupos de Extras y Extras de un Producto

Como Dueño o Empleado autorizado (el Empleado, una vez que exista la función), quiero crear grupos de extras (por ejemplo,
"Agregados" o "Elegí tu salsa") con sus opciones y precios, y asociarlos a mis
productos, para ofrecer variantes y agregados personalizables en cada pedido.

## HU-CO07: Ver Pedidos Entrantes

Como Dueño o Empleado autorizado, quiero recibir notificaciones de nuevos pedidos y
verlos listados en mi panel, para gestionarlos a tiempo y no perder ventas.

## HU-CO08: Aceptar un Pedido

Como Dueño o Empleado autorizado, quiero aceptar un pedido pendiente, para confirmarle
al cliente que su compra está siendo procesada. Sé que dispongo de 30 minutos para
responder antes de que el pedido expire automáticamente.

## HU-CO09: Rechazar un Pedido

Como Dueño o Empleado autorizado, quiero rechazar un pedido seleccionando un motivo
predefinido de una lista (sin stock, local cerrado, alto volumen de pedidos, etc.) y
agregar un comentario adicional si es necesario, para informarle al cliente la razón
por la cual no puedo atender su solicitud y garantizarle el reembolso.

## HU-CO10: Gestionar el Estado de un Pedido

Como Dueño o Empleado autorizado, quiero actualizar el estado de un pedido a lo largo
de su ciclo (en preparación, en camino o listo para retirar), para mantener al cliente
informado en cada etapa del proceso de entrega.

## HU-CO11: Confirmar Entrega de Retiro

Como Dueño o Empleado autorizado, quiero confirmar la entrega de un pedido de retiro
cuando el cliente se presenta, o cerrarlo como "no retirado" cuando no vino (pasados 60
minutos desde que quedó listo), para registrar el cierre del pedido en ambos casos sin
marcar como entregado un pedido que nadie retiró.

## HU-CO12: Anular un Pedido

Como Dueño o Empleado autorizado, quiero anular un pedido que ya acepté seleccionando
un motivo predefinido de una lista, para gestionar situaciones imprevistas (como
quedarse sin stock durante la preparación) y garantizar el reembolso automático al
cliente.

## HU-CO13: Cerrar o Abrir mi Comercio Manualmente

Como Dueño o Empleado autorizado, quiero poder cerrar temporalmente mi local desde el
panel aunque todavía esté dentro de mi horario de atención, para detener la recepción
de pedidos cuando me quedo sin stock u ocurre algo imprevisto, y reabrirlo cuando esté
listo, sin que esto afecte el estado de la cuenta ni los pedidos ya en curso.

**Criterios de aceptación:**
- Solo puedo cerrar o abrir mi comercio dentro de una franja de mi horario de atención
  y mientras esté Aprobado o Apto para Venta; si no, el sistema me lo explica.
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

Como Dueño o Empleado autorizado, veo la campana en el panel con el contador de avisos sin leer del comercio que tengo abierto, y en la pantalla de notificaciones puedo abrir cada pedido con "Ver pedido" y dejar leídos todos mis avisos del comercio con "Marcar todas". Cada persona del equipo tiene su propia copia de cada aviso, así que lo que lee una no cambia lo de las demás.

## HU-CO14: Ver Solo los Pedidos ya Pagados

Como Dueño o Empleado autorizado, quiero ver únicamente los pedidos cuyo pago ya fue
confirmado, con la fecha en que se pagaron y los contadores del turno (vendido, pedidos
del turno y pendientes), para gestionar solo ventas reales y tener un resumen fiel de mi
turno. El panel me dice si el turno está en curso o ya terminó, y se actualiza solo cuando
termina. Como Dueño puedo desplegar además la comisión y el neto del turno.

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
