# Requisitos Funcionales — Dueño

Requisitos de identidad de cuenta, datos fiscales, medio de cobro y administración de
la relación con Empleados y con los distintos comercios que un mismo Dueño puede
operar. Los requisitos operativos del negocio en sí (productos, extras, pedidos,
horarios, redes sociales) están en Requisitos Funcionales — Comercio, ejecutables tanto
por el Dueño como por un Empleado autorizado.

---

## Registro y Datos Fiscales

- El sistema debe permitir el registro de un Dueño nuevo solicitando en un mismo flujo:
  los datos de la persona jurídica (razón social, CUIT, domicilio fiscal, condición
  frente al IVA, tipo de sociedad e inicio de actividades) y los datos de su primer
  comercio (ver Requisitos Funcionales — Comercio, sección Perfil del Negocio).
- El registro del Dueño solicita también el nombre de usuario de su cuenta, que es su credencial de login (ver Requisitos Funcionales — Generales, sección Nombre de Usuario). El Dueño no tiene, en esta versión, una pantalla para ver ni cambiar su nombre de usuario.
- Un Dueño que ya tiene una cuenta activa debe poder dar de alta un comercio adicional
  desde su panel sin volver a solicitar sus datos fiscales, ya cargados en su registro
  como persona jurídica.
- El Dueño debe poder cargar y editar su foto de perfil personal desde su cuenta
  autenticada. Es opcional y es un dato de identidad de la persona, independiente de
  la foto de perfil de cada comercio que administra (que es obligatoria y propia de
  cada comercio — ver Requisitos Funcionales — Comercio).
- Todo comercio registrado por un Dueño queda en estado Pendiente hasta ser aprobado de
  forma individual por el Administrador, incluso si el Dueño ya tiene otros comercios
  aprobados.
- Un comercio rechazado puede solicitar una revisión de su solicitud desde el panel del
  Dueño, pudiendo corregir sus datos antes de reenviarla (el mismo comercio, no uno
  nuevo). Al hacerlo vuelve a estado Pendiente y aparece en la bandeja de re-solicitudes
  del Administrador (no se le envía una notificación). Puede corregir todos los datos del
  negocio y, solo si nunca tuvo un comercio aprobado, también sus datos fiscales y los del
  representante; el usuario, el email de la cuenta y la contraseña no se modifican. Un
  reenvío sin ningún dato cambiado se rechaza. Cada comercio admite hasta 3 re-solicitudes;
  si el Administrador rechaza la tercera, o rechaza pidiendo que sea definitivo, el comercio
  pasa a Rechazo definitivo y ya no se puede corregir.
- La pantalla de un comercio rechazado muestra el motivo del rechazo y cuántos intentos le
  quedan, y ofrece corregir y volver a solicitar. La corrección es un formulario por pasos
  (Negocio, Legales solo si todavía no tuvo ningún comercio aprobado, Horarios y Redes) con
  todo precargado, que indica el número de intento y el motivo del rechazo. Si el comercio
  pasó a Rechazo definitivo, el Dueño solo ve una pantalla informativa con el motivo, desde
  la que puede agregar un comercio nuevo (únicamente si cumple la regla de más abajo) y,
  cuando exista el módulo de soporte, contactar al soporte.
- Un Dueño puede agregar un comercio nuevo si tiene al menos un comercio Aprobado o Apto
  para venta, o si tiene al menos un comercio y todos están en Rechazo definitivo. Un
  comercio en Rechazo definitivo cuenta como duplicado (mismo nombre en la misma dirección);
  uno solo Rechazado, no.
- Un Dueño con un comercio suspendido puede contactar al soporte desde su panel
  completando un formulario con su descargo. El Administrador recibe la solicitud y
  decide manualmente.

---

## Selector de Comercio Activo

- El panel del Dueño debe presentar un selector de "comercio activo" cuando administre
  más de un comercio, de forma que toda acción operativa (productos, extras, pedidos,
  horarios, redes sociales) se ejecute siempre sobre el comercio seleccionado en ese
  momento.

---

## Vinculación de Mercado Pago

- El Dueño debe vincular una única cuenta de MercadoPago mediante OAuth. Esta
  vinculación habilita el cobro en todos los comercios aprobados que administre; no se
  repite por cada comercio.
- Sin esta vinculación, ninguno de sus comercios puede recibir pagos ni pedidos, y
  ninguno aparece en el catálogo público.
- Al desvincular la cuenta, todos los comercios del Dueño quedan bloqueados para
  nuevos pedidos y desaparecen del catálogo hasta que se vuelva a vincular.
- Un Dueño tiene una sola cuenta de MercadoPago activa para todos sus comercios. Con una
  cuenta activa no puede iniciar otra vinculación ni vincular una cuenta distinta sin
  desvincular antes; volver a vincular la misma cuenta no tiene efecto adverso.
- Una cuenta de MercadoPago no puede estar activa en dos Dueños a la vez. Si ya está en
  uso por otro Dueño, el sistema lo informa sin revelar quién la tiene; se libera cuando
  ese otro Dueño la desvincula.
- La pantalla de la cuenta de cobro lista los comercios operativos del Dueño (Aprobados o
  Aptos para venta) e indica que la cuenta cobra por todos ellos, o que va a cobrar por
  todos ellos si todavía no hay una cuenta vinculada.
- Mientras algún comercio operativo del Dueño esté Aprobado (sin cuenta de cobro), el panel
  de comercios muestra el aviso "Vinculá Mercado Pago para empezar a vender" con un acceso
  directo a la pantalla de la cuenta de cobro. El aviso no se puede cerrar y solo aparece
  en el panel.
- Antes de desvincular, el Dueño ve qué pasaría: sus comercios (en cualquier estado) con
  la cantidad de pedidos en curso de cada uno y los clientes que todavía están pagando.
  La confirmación del Dueño no es vinculante para el sistema: lo único que se revalida
  siempre al desvincular es la regla siguiente.
- No se puede desvincular la cuenta mientras algún comercio del Dueño tenga pedidos
  esperando el pago (un cliente podría estar pagando contra esa cuenta): el sistema indica
  la hora aproximada para volver a intentarlo, que es cuando vence el pedido más reciente
  (30 minutos desde su creación). Sin pedidos esperando el pago, la cuenta se desvincula y
  los demás pedidos en curso siguen su flujo normal; un reembolso posterior queda en
  revisión manual porque ya no hay cuenta con la que devolver el dinero.
- Cuando el bloqueo se debe a clientes que todavía están pagando, el mensaje del Dueño
  ofrece el botón "Cerrar comercio" (o "Cerrar comercios", si son varios) siempre que
  tenga al menos un comercio Apto para Venta, abierto en este momento y dentro de su
  horario, con una línea que explica que cerrar evita que entren más pedidos mientras
  espera. Como la cuenta de cobro es una sola para todos sus comercios, el botón alcanza a
  todos los que cumplen esa condición, no solo a los que tienen pagos pendientes: cada uno
  deja de recibir pedidos nuevos (y de generar nuevos pagos pendientes), los pagos ya
  iniciados vencen en su plazo y el Dueño reintenta la desvinculación a la hora indicada.
  El botón cierra directamente, sin pedir una confirmación adicional.
- Los comercios que ya no estén dentro de su horario o que ya no estén operativos cuando se
  intenta cerrarlos se consideran cerrados y no generan error. Si el cierre de alguno falla
  por otro motivo (conexión, sesión o error del servidor), el mensaje lo informa con los
  nombres de esos comercios y el Dueño puede reintentar. Al terminar bien, el mensaje se
  actualiza solo: desaparece el botón y queda únicamente el texto de espera. Si todos los
  comercios ya estaban cerrados, el mensaje muestra solo el texto de espera. Cerrar no
  corta los pedidos ya pagados ni los que están en curso, y cada comercio se reabre solo al
  empezar su próxima franja o a mano desde el panel.
- Al desvincular, los tokens guardados no se borran: solo la cuenta pasa a inactiva.
- El monto recibido en cada cobro refleja el subtotal menos el cargo de servicio al comercio, vía split
  de pagos (ver Requisitos Funcionales — Comercio, sección Gestión de Valores en
  Pedidos).
- La vinculación se realiza mediante el flujo OAuth authorization_code con PKCE. Al completarla, los comercios Aprobados del Dueño pasan automáticamente a Apto para Venta (APTO_VENTA); al desvincular, vuelven a Aprobado.
- Los tokens de acceso y de renovación de MercadoPago se almacenan cifrados. La renovación automática del token no está implementada (ver Alcance y Limitaciones).

---

## Gestión de Empleados

- El Dueño, desde el panel de un comercio puntual, debe poder acceder a una sección
  "Mi equipo" para invitar personas a operar ese comercio como Empleado, ingresando su
  email.
- El sistema debe generar una invitación mediante un token de tipo
  `INVITACION_EMPLEADO`. Si el email ya corresponde a un Usuario existente en la
  plataforma (sea porque ya es Empleado en otro comercio, porque ya es Cliente, o
  cualquier otro rol), la invitación reutiliza ese Usuario: si aún no tiene registro de
  Empleado se lo crea, sin duplicar su identidad ni pedirle de nuevo datos que ya tiene
  cargados (nombre, apellido, DNI, contraseña); en cualquier caso se crea la relación
  con este comercio. Solo si el email no corresponde a ningún Usuario existente el
  sistema crea Usuario, PersonaFisica y Empleado desde cero.
- La relación queda en estado PENDIENTE hasta que el Empleado confirme su email (o el
  Dueño la active manualmente).
- El Dueño debe poder ver el listado de empleados de cada comercio con su estado
  (PENDIENTE, ACTIVO, DESACTIVADO).
- El Dueño debe poder pasar a DESACTIVADO la relación de un Empleado con un comercio
  puntual en cualquier momento, sin afectar las relaciones de ese Empleado con otros
  comercios, propios o de otros Dueños.

---

## Gestión de Múltiples Comercios

- El Dueño debe poder dar de alta comercios adicionales bajo su propia cuenta, cada uno
  con sus propios datos, horarios, productos, extras, redes sociales y equipo de
  empleados, sin límite de cantidad.
- El Dueño debe poder dar de baja o cerrar definitivamente un comercio puntual sin que
  esto afecte a sus demás comercios ni a su cuenta de MercadoPago vinculada.

---

## Permisos Exclusivos del Dueño

Las siguientes acciones no son delegables a un Empleado, aunque este tenga acceso
Activo al comercio:

- Editar los datos fiscales y de persona jurídica.
- Vincular o desvincular la cuenta de MercadoPago.
- Invitar, activar o desactivar Empleados.
- Dar de baja o cerrar definitivamente un comercio puntual.
- Crear comercios nuevos bajo su propio perfil de Dueño.
