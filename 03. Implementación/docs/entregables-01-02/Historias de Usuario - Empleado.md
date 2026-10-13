# Historias de Usuario — Empleado

Persona invitada por un Dueño que opera, con permisos acotados, uno o varios comercios en
representación de sus respectivos Dueños. El Empleado es una persona con cuenta de Cliente
a la que se le suma el rol por invitación (ver Requisitos Funcionales — Empleado). Las
historias operativas que el Empleado ejecuta sobre un comercio (productos, pedidos) están
detalladas en Historias de Usuario — Comercio, compartidas con el rol Dueño.

> **Estado de implementación (2026-10-05):** todas estas historias están planificadas, se
> implementan en los tramos E1 a E4.

## HU-E01: Aceptar una Invitación para Operar un Comercio

Como persona invitada por un Dueño, quiero aceptar la invitación recibida por email con
mi email y el código de 6 dígitos que vino en el mensaje, para operar su comercio con mi
propio login sin compartir la contraseña del Dueño.

Criterios de aceptación adicionales:
- Llego a la pantalla de invitación desde el enlace del email, desde el botón "Tengo una
  invitación" del login o desde la línea del registro.
- Si no tengo cuenta, completo los mismos datos que el registro de Cliente (incluida la
  dirección) y acepto los Términos y Condiciones; mi cuenta queda activa sin otro código de
  verificación.
- Para trabajar en un comercio tengo que tener 18 años o más. Si me registro con una cuenta
  nueva y declaro menos de 18 años (con cualquier edad, incluso con menos de 14), el sistema me
  avisa debajo de la fecha de nacimiento apenas la completo ("Tenés que tener 18 años o más para
  trabajar en este comercio.") y no me deja seguir; si igual llegara al servidor, responde con el
  mismo mínimo de 18 y no crea nada. En este recorrido nunca aparece el mensaje de 14 años del
  registro de Cliente. Si ya tengo cuenta y declaré menos de 18
  años, el sistema me lo dice ("Tenés que tener 18 años o más para sumarte a un equipo"). La
  edad es la que declaro: el sistema no la verifica.
- Si ya tengo cuenta, alcanzan mi email y el código.
- La invitación vence a los 7 días y el código admite hasta 5 intentos fallidos; si falla,
  le pido al Dueño que la reenvíe.
- Al aceptar voy al login: no se inicia sesión automáticamente.

## HU-E02: Operar Varios Comercios con una Sola Cuenta

Como Empleado, quiero acceder con mi mismo login a todos los comercios donde tenga una
relación activa —incluso si pertenecen a Dueños distintos— y también a mi cuenta de
Cliente, y elegir desde un selector cuál estoy operando en cada momento, para trabajar en
más de un lugar sin conflictos de sesión entre mis distintos trabajos.

Criterios de aceptación adicionales:
- Al iniciar sesión veo un selector con "Cliente" y mis comercios, con el último contexto
  que usé resaltado; en una pestaña nueva con la sesión ya iniciada entro directo a ese
  último contexto, si sigue siendo válido. Puedo cambiar desde el perfil con "Cambiar de
  cuenta" sin cerrar sesión.
- Si no soy Empleado de ningún comercio, entro directo como Cliente.
- Si inicio sesión en otro dispositivo, mi sesión anterior se cierra en ambos contextos.

## HU-E03: Gestionar Productos y Pedidos del Comercio Asignado

Como Empleado activo en un comercio, quiero crear y editar productos, gestionar los
pedidos entrantes (aceptar, rechazar, despachar, entregar y anular), ver el historial y
las ventas, abrir y cerrar el comercio, y editar su descripción, su teléfono y sus
horarios, para cumplir con mis tareas diarias del mismo modo que lo haría el Dueño. El
nombre, la foto, la dirección y el tipo de comercio los veo, pero los cambia solo el Dueño. Recibo las notificaciones operativas
del comercio (pedido nuevo, cancelaciones, vencimientos). En los pedidos veo lo que
necesito para atender al cliente (ítems, subtotal, total pagado, motivo de rechazo o
anulación y el estado del reembolso en términos simples), pero no los cargos de servicio,
la comisión ni los datos de MercadoPago.

## HU-E04: Operar dentro de mis Permisos

Como Empleado, entiendo que no tengo acceso a los datos fiscales del Dueño, a MercadoPago,
a los enlaces a redes sociales, a la gestión del equipo ni a la actividad del comercio, ni
puedo dar de alta comercios ni cambiar el nombre, la foto, la dirección o el tipo de
comercio, para que quede claro qué decisiones quedan reservadas
exclusivamente al Dueño. Todo lo que no está explícitamente permitido me queda bloqueado.

Criterios de aceptación adicionales:
- Si el comercio está suspendido o cerrado temporalmente lo veo con un aviso. Según el
  estado de cada pedido: si está pendiente de confirmación solo puedo rechazarlo (el pago se
  devuelve en el acto) y no aceptarlo; si está en preparación puedo despacharlo o anularlo;
  si está en camino no puedo hacer nada (lo confirma el cliente o el sistema); si está
  listo para retirar puedo entregarlo o cerrarlo como no retirado cuando pasó la espera
  mínima de 60 minutos (sin devolución del pago). No toco productos ni el perfil y no abro
  ni cierro el comercio.
- Si un pedido de retiro quedó listo y el cliente no vino, puedo cerrarlo como "no
  retirado" pasados 60 minutos desde que quedó listo. Puedo entregarlo en cualquier
  momento, sin esperar.
- Puedo pedir en mi propio comercio como Cliente, pero no gestionar mis propios pedidos:
  los veo con la etiqueta "Tu pedido", sin botones.

## HU-E05: Perder Acceso a un Comercio Desactivado

Como Empleado, cuando el Dueño desactiva mi relación con un comercio puntual, quiero
perder el acceso a ese comercio sin que se vean afectadas mis relaciones activas con otros
comercios, y recibir una hoja de aviso con el nombre del comercio y un botón "Entendido"
que me lleva al selector (o a mi cuenta de Cliente si no me queda ninguno, sin una pantalla
dedicada), para seguir operando con normalidad en los demás
lugares donde trabajo o usar la plataforma como Cliente. Recibo una notificación de la
desactivación y mi sesión no se cierra.

## HU-E06: Renunciar a un Comercio

Como Empleado, quiero dejar de trabajar en un comercio con un botón "Dejar de trabajar en
este comercio" y una doble confirmación, para terminar mi relación sin tener que pedírselo
al Dueño. Entiendo que para volver a ese comercio hace falta una invitación nueva. El Dueño
recibe una notificación y la renuncia queda en el historial del equipo.
