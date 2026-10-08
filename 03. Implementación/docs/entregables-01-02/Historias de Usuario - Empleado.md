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
  nueva y declaro entre 14 y 17 años, el sistema me avisa debajo de la fecha de nacimiento
  ("Tenés que tener 18 años o más para trabajar en un comercio") y no crea nada; con menos de
  14 rige además el mínimo del registro de Cliente. Si ya tengo cuenta y declaré menos de 18
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
- El sistema recuerda el último contexto que elegí y entra directo; el selector aparece la
  primera vez o cuando el último ya no es válido, y puedo cambiar desde el perfil sin
  cerrar sesión.
- Con un solo comercio entro directo a ese comercio.
- Si inicio sesión en otro dispositivo, mi sesión anterior se cierra en ambos contextos.

## HU-E03: Gestionar Productos y Pedidos del Comercio Asignado

Como Empleado activo en un comercio, quiero crear y editar productos, gestionar los
pedidos entrantes (aceptar, rechazar, despachar, entregar y anular), ver el historial y
las ventas, abrir y cerrar el comercio, y editar sus datos y su foto, para cumplir con mis
tareas diarias del mismo modo que lo haría el Dueño. Recibo las notificaciones operativas
del comercio (pedido nuevo, cancelaciones, vencimientos).

## HU-E04: Operar dentro de mis Permisos

Como Empleado, entiendo que no tengo acceso a los datos fiscales del Dueño, a MercadoPago,
a los enlaces a redes sociales, a la gestión del equipo ni a la actividad del comercio, ni
puedo dar de alta comercios, para que quede claro qué decisiones quedan reservadas
exclusivamente al Dueño. Todo lo que no está explícitamente permitido me queda bloqueado.

Criterios de aceptación adicionales:
- Si el comercio está suspendido o cerrado temporalmente lo veo con un aviso y no puedo
  operarlo, salvo terminar lo que ya estaba en marcha (entregar pedidos listos para retirar
  y confirmar entregas en camino).
- Puedo pedir en mi propio comercio como Cliente, pero no gestionar mis propios pedidos:
  los veo con la etiqueta "Tu pedido", sin botones.

## HU-E05: Perder Acceso a un Comercio Desactivado

Como Empleado, cuando el Dueño desactiva mi relación con un comercio puntual, quiero
perder el acceso a ese comercio sin que se vean afectadas mis relaciones activas con otros
comercios, y ser llevado al selector (o ver "Ya no tenés acceso a ningún comercio" con el
botón "Entrar como Cliente" si no me queda ninguno), para seguir operando con normalidad
en los demás lugares donde trabajo o usar la plataforma como Cliente. Recibo una
notificación de la desactivación y mi sesión no se cierra.

## HU-E06: Renunciar a un Comercio

Como Empleado, quiero dejar de trabajar en un comercio con un botón "Dejar de trabajar en
este comercio" y una doble confirmación, para terminar mi relación sin tener que pedírselo
al Dueño. Entiendo que para volver a ese comercio hace falta una invitación nueva. El Dueño
recibe una notificación y la renuncia queda en el historial del equipo.
