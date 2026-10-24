# Historias de Usuario — Dueño

Identidad de cuenta, datos fiscales, medio de cobro y administración de la relación
con Empleados y con los distintos comercios que un mismo Dueño puede operar. Las
historias operativas del negocio (productos, pedidos, horarios) están en Historias de
Usuario — Comercio.

## HU-D01: Registrarme como Dueño

Como Dueño, quiero registrarme eligiendo un nombre de usuario para mi cuenta, con mis datos de persona jurídica (CUIT y domicilio fiscal; razón social,
condición frente al IVA, tipo de sociedad e inicio de actividades son opcionales y van en una sección plegable "Datos adicionales (opcional)")
junto con los datos de mi primer comercio (tipo de comercio, modalidades de entrega,
horarios de atención), para solicitar mi habilitación con información completa desde
un único flujo.

## HU-D02: Verificar mi Cuenta

Como Dueño, quiero verificar mi dirección de email tras el registro, para activar mi
cuenta y quedar en espera de aprobación administrativa de mi primer comercio.

## HU-D03: Cargar mi Foto de Perfil Personal

Como Dueño, quiero cargar y editar mi foto de perfil personal (opcional), como dato de
mi identidad como persona, independiente de la foto de perfil de cada comercio que
administro.

## HU-D04: Vincular mi Cuenta de Mercado Pago

Como Dueño, quiero vincular mi cuenta de MercadoPago a la plataforma mediante el
proceso de autorización OAuth una única vez, para habilitar la recepción de pagos y que
todos mis comercios aprobados comiencen a aparecer en el catálogo y a recibir pedidos.

**Criterios de aceptación adicionales (multi-comercio, tramo 5):**
- Tengo una sola cuenta de MercadoPago para todos mis comercios: si ya tengo una activa, el
  sistema no me deja iniciar otra vinculación ni vincular otra distinta sin desvincular antes.
- Una cuenta de MercadoPago no puede estar activa en dos Dueños a la vez; si la que quiero
  usar ya está en uso, el sistema me lo dice (sin decirme quién la tiene) y puedo usar otra.
- En la pantalla de mi cuenta de cobro veo la lista de mis comercios operativos y un texto
  que aclara que la cuenta cobra (o, si todavía no la vinculé, va a cobrar) por todos ellos.
- Mientras alguno de mis comercios operativos no esté listo para vender por falta de una
  cuenta vinculada, el panel "Tus comercios" me muestra el aviso "Vinculá Mercado Pago para
  empezar a vender" con un acceso directo a la pantalla de la cuenta de cobro; el aviso no se
  puede cerrar y desaparece apenas vinculo la cuenta.
- Antes de desvincular veo un resumen de mis comercios con sus pedidos en curso (por estado)
  y los clientes que todavía están pagando; si hay clientes pagando, en lugar de la
  confirmación veo un mensaje que me indica a qué hora aproximada puedo volver a intentarlo.
- No puedo desvincular mientras algún cliente esté pagando un pedido de cualquiera de mis
  comercios: el sistema me indica a qué hora aproximada puedo volver a intentarlo y, para
  mis comercios abiertos que estén dentro de su horario, me ofrece "Cerrar comercio" (o
  "Cerrar comercios") para que no entren pedidos nuevos mientras vencen los pendientes. Si
  ya están todos cerrados, solo veo el texto de espera.
- Al desvincular, todos mis comercios vuelven a Aprobado (dejan de aparecer en el catálogo y
  de recibir pedidos nuevos), mis pedidos en curso siguen su flujo, y los reembolsos que
  hagan falta después quedan para revisión manual del Administrador.

## HU-D05: Administrar Múltiples Comercios

Como Dueño, quiero dar de alta comercios adicionales bajo mi cuenta sin volver a cargar
mis datos fiscales, y elegir desde un selector sobre cuál de mis comercios estoy
operando en cada momento, para gestionar varios negocios desde una única cuenta. Sé que
el nombre de cada comercio tiene que ser distinto del de cualquier otro comercio de la
plataforma, y que el formulario me avisa en vivo si el nombre que elegí ya está tomado.

## HU-D06: Dar de Baja un Comercio

Como Dueño, quiero poder dar de baja o cerrar definitivamente uno de mis comercios sin
que esto afecte a mis demás comercios ni a mi cuenta de MercadoPago vinculada, para
discontinuar un local puntual cuando lo necesite.

## HU-D07: Invitar a un Empleado

Como Dueño, quiero invitar a una persona por email a operar uno de mis comercios como
Empleado, para delegar la gestión diaria de productos y pedidos sin compartir mi
contraseña. Sé que la invitación es por comercio, que solo puedo invitar mientras el
comercio esté operativo, que vence a los 7 días y que puedo enviar hasta 5 invitaciones
por hora por comercio.

Criterios de aceptación adicionales:
- Si el email pertenece a un Dueño o a un Administrador, a una cuenta bloqueada,
  suspendida, inactiva o sin verificar, o a una cuenta activa con menos de 18 años declarados, veo siempre el mismo
  aviso fijo debajo del campo del email: "No pudimos invitar a este email. Por privacidad no podemos contarte el
  motivo. Podés pedirle a esta persona que revise su correo y volver a intentar más tarde." (no se revela el
  motivo ni el tipo de cuenta, y el aviso no afirma que se haya enviado un email). El botón de invitar queda
  deshabilitado para ese mismo email mientras la hoja siga abierta y se habilita de nuevo si cambio el email o
  vuelvo a abrir la hoja. Al reenviar una invitación el aviso es el mismo, en una hoja con el botón "Entendido".
  A una cuenta bloqueada, suspendida, inactiva o sin verificar le llega un email que le explica cómo
  regularizarla.
- Puedo reenviar y cancelar una invitación pendiente, vencida o con el código bloqueado. Al reenviar, solo una
  invitación pendiente todavía vigente queda reemplazada: una invitación vencida o con el código bloqueado
  conserva su estado y sigue explicando por qué la persona no pudo aceptar. Una invitación cancelada, aceptada
  o reemplazada ya no se puede cancelar. Tampoco puedo reenviar ni cancelar una invitación vieja si ya existe
  una más nueva para el mismo email en ese comercio: la lista solo muestra la más reciente y esa es la única
  sobre la que se puede actuar.
- Si invito de nuevo a un email que ya tenía una invitación vencida, la lista muestra una sola línea para ese
  email, con la invitación nueva.
- Recibo una notificación cuando el invitado acepta.

## HU-D08: Gestionar mi Equipo de Empleados

Como Dueño, quiero ver el equipo de cada uno de mis comercios con el estado de cada
empleado (activo o inactivo) y de cada invitación (pendiente, vencida o con el código bloqueado), y poder
desactivar a un empleado en un comercio puntual en cualquier momento y reactivarlo sin
una invitación nueva si fui yo quien lo dio de baja, para mantener el control de quién
opera cada uno de mis negocios.

Criterios de aceptación adicionales:
- "Ver equipo" tiene tres pestañas: "Mi equipo · N" (los integrantes activos) y
  "Solicitudes · N" (las invitaciones), cada una con su contador, y "Actividad", sin contador. El botón
  "Invitar" se ve en las dos primeras y no en "Actividad".
- En "Mi equipo" elijo entre "Activos · N" (se ve por defecto) e "Inactivos · N". Cada integrante tiene un
  menú de tres puntos: en un activo, "Desactivar", que pide una sola confirmación antes de dar de baja
  ("¿Desactivar a {Nombre}?"); en uno inactivo que di de baja yo, "Reactivar", que lo devuelve al equipo
  al instante, sin invitación y sin otra confirmación; en uno que renunció, "Invitar de nuevo" (abre la
  hoja de invitar con su email); y en uno sin registro de la baja, solo "Invitar de nuevo". Si no se
  puede reactivar, la misma hoja me dice por qué.
- "Actividad" muestra una línea por cada cosa que pasó en el comercio, de la más nueva a la más vieja,
  agrupadas por día ("Hoy", "Ayer" o la fecha): el avatar con las iniciales de quien actuó (un engranaje
  si fue el sistema), su nombre, su rol (Dueño, Empleado, Cliente o Sistema; el sistema sin nombre), qué
  hizo y a qué hora. Muestra 30 líneas y un botón "Ver más" trae las siguientes. Arriba hay cinco filtros
  ("Todo", "Pedidos", "Ediciones", "Cierres", "Equipo"); al elegir uno la lista vuelve a empezar solo con esa
  clase de cosas. Si todavía no hay nada, o no hay nada de lo filtrado, lo dice; si falla la carga,
  muestra el error con "Reintentar" y los filtros siguen a la vista. Mientras miro la actividad, la
  actualización automática del equipo no me mueve ni me borra la lista.
- "Solicitudes" tiene una línea por email, la de su invitación más reciente: Pendiente ("vence en N días"),
  Vencida ("Vencida hace N días") o con el código bloqueado ("Código bloqueado"). Todas las líneas llevan un
  menú de tres puntos con "Reenviar" y "Cancelar". Una invitación aceptada pasa a "Mi equipo"; las canceladas y
  las reemplazadas no se muestran. Una invitación pasa a Vencida cuando termina su plazo de 7 días: el sistema
  la marca solo, en un proceso automático que corre cada minuto.
- Si un empleado renunció, o una invitación se canceló, solo puedo volver a sumarlo con una
  invitación nueva.
- Veo el historial del equipo (invitación, aceptación, cancelación, baja, renuncia,
  reactivación, con quién lo hizo y cuándo) y la actividad del comercio (quién hizo qué,
  incluido lo que hicieron el Cliente y el sistema con mis pedidos, como "Pedido recibido"
  o la cancelación del Cliente; el pedido que nunca se pagó no aparece).
- Veo el nombre de quien hizo cada cambio de estado de un pedido y cada cierre o
  reapertura, incluso si el empleado ya está inactivo. En el detalle de cada pedido veo
  su recorrido completo (quién, cuándo y, en rechazos y anulaciones, el motivo).
- Puedo gestionar cualquier pedido del comercio, incluido el de un empleado que compró
  como cliente; mis empleados no pueden gestionar los suyos.
- Recibo una notificación cuando un empleado renuncia.
- Cada aviso de pedido (pedido nuevo, cancelación del Cliente, vencimiento sin respuesta) me llega a mí y a cada empleado activo del comercio, como una copia de cada uno: que un empleado lo lea no cambia el mío. Los avisos de administración (aprobación, suspensión, altas del equipo) me llegan solo a mí. Con varios comercios, veo en cada uno solo sus avisos.

## HU-D09: Solicitar Revisión de Solicitud Rechazada

Como Dueño con un comercio rechazado, quiero poder corregir sus datos (y, si todavía no
tuve ningún comercio aprobado, también los fiscales y los del representante) y reenviar
la solicitud de habilitación del mismo comercio, para tener la oportunidad de corregir
los motivos del rechazo y volver a ser evaluado por el administrador. Tengo hasta 3
intentos por comercio, y veo cuántos me quedan; después de eso, o si el administrador lo
rechaza de forma definitiva, el comercio ya no se puede corregir y solo veo una pantalla
informativa.

## HU-D10: Contactar Soporte ante Suspensión

Como Dueño con un comercio suspendido, quiero poder enviar un mensaje al administrador
explicando mi situación, para solicitar la revisión de la suspensión de ese comercio.

## HU-D11: Ver Cuánto Vendí en el Turno

Como Dueño, quiero ver en el panel de cada comercio cuánto se vendió en el turno en curso (o en el último turno terminado, aclarando que ya terminó), cuántos pedidos tuvo y cuántos están pendientes, y poder desplegar la comisión de plataforma y el neto del turno, para saber cuánto factura el comercio y cuánto me queda sin tener que sumar a mano. Un turno que cruza la medianoche cuenta como un solo turno, y el panel me avisa "Sin turno por ahora" cuando no hay ninguno.

## HU-D12: Cambiar Precios Fuera del Horario de Atención

Como Dueño, quiero que el precio de mis productos no se pueda cambiar mientras mi comercio está en horario de atención, para que los clientes que están pidiendo no vean precios que cambian en medio de la compra. En el formulario del producto veo el campo precio deshabilitado con un candado y la leyenda "Se puede cambiar fuera de tu horario de atención", sigo editando el resto del producto, y el campo se habilita solo cuando termina el horario. Dar de alta un producto nuevo no tiene esta restricción.

## HU-D13: Recibir el Resumen del Turno por Email

Como Dueño, quiero recibir por email, al terminar cada turno de mis comercios, un resumen con lo que se vendió, la comisión, el neto y cuántos pedidos quedaron sin responder, para conocer el resultado del turno sin tener que entrar al panel. Si tengo varios comercios que cierran juntos, quiero un solo mensaje con un bloque por comercio; si un turno no tuvo pedidos, quiero que me avise igual. El asunto me tiene que mostrar el neto del turno. Los pedidos sin responder no se suman a los montos. Si el servicio de email falla, el sistema tiene que reintentar solo y no perder el resumen; y si mi cuenta no está activa en ese momento, no tiene que mandarme nada.

**Criterios de aceptación:**
- El email sale unos 30 minutos después del fin del turno, con las cifras que mostraba el panel.
- Un solo email por vez con todos mis turnos cerrados; incluye los turnos sin pedidos.
- El asunto lleva el neto del turno ("Cerró tu turno en Pizzería Popular: neto $127.116"), o "sin pedidos".
- El cuerpo muestra vendido, comisión, neto, pedidos del turno y, si los hay, los pedidos sin responder al cierre (fuera de los montos).
- Si el envío falla se reintenta a los 10, 30, 60 y 60 minutos; tras 5 intentos fallidos queda registrado como no enviado.
- No recibo el email si mi cuenta está bloqueada, suspendida o inactiva.
- Un Empleado no recibe este email.
