# Requisitos Funcionales — Dueño

Requisitos de identidad de cuenta, datos fiscales, medio de cobro y administración de
la relación con Empleados y con los distintos comercios que un mismo Dueño puede
operar. Los requisitos operativos del negocio en sí (productos, extras, pedidos,
horarios) están en Requisitos Funcionales — Comercio, ejecutables tanto por el Dueño como
por un Empleado autorizado, con las excepciones indicadas en Permisos Exclusivos del Dueño
(entre ellas, los enlaces a redes sociales).

---

## Registro y Datos Fiscales

- El sistema debe permitir el registro de un Dueño nuevo solicitando en un mismo flujo:
  los datos de la persona jurídica (CUIT y domicilio fiscal, obligatorios; razón social,
  condición frente al IVA, tipo de sociedad e inicio de actividades, opcionales), los datos del
  representante y los datos de su primer comercio (ver Requisitos Funcionales — Comercio,
  sección Perfil del Negocio). Para registrarse tiene que aceptar los Términos y Condiciones
  y la Política de Privacidad (el servidor rechaza con 400 si `aceptaTerminos` falta o es falso;
  la aceptación se valida y no se guarda). El alta de un comercio adicional pide la misma
  aceptación; la corrección de un comercio rechazado no.
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
  para venta, o si tiene al menos un comercio y todos están en Rechazo definitivo.
- El nombre de un comercio es único en toda la plataforma, sin importar el Dueño ni la
  dirección. Se compara sin distinguir mayúsculas, tildes ni espacios de más (y la "ñ" cuenta
  como "n": "Cafetería Ñandú" y "Cafeteria Nandu" son el mismo nombre). Cuentan todos los
  estados salvo Rechazo definitivo, que libera el nombre; un comercio Rechazado lo conserva
  (para usarlo de nuevo se corrige y se vuelve a solicitar el mismo comercio). Al registrar,
  agregar, corregir o editar un comercio, el formulario avisa en vivo si el nombre está
  disponible o no, y el servidor lo verifica de todos modos al guardar. Un nombre tomado
  por una cuenta que nunca llegó a verificarse queda retenido.
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

> **Estado de implementación (2026-10-15):** invitar, reenviar, cancelar, la vista del equipo y la
> pestaña Actividad están implementados (tramos E1 y E3). Desactivar, reactivar y el historial del equipo
> tienen el backend hecho (E4, bloques A1 a A3) y las pantallas del Dueño hechas en E4, entrega B1
> (Activos e Inactivos, menú de tres puntos, desactivar con confirmación, reactivar directo, filtro
> "Equipo" en Actividad); los textos son los de esa entrega.

- El Dueño, desde el panel de un comercio puntual, debe poder acceder a una sección
  "Mi equipo" para invitar personas a operar ese comercio como Empleado, ingresando su
  email. La invitación es por comercio. Solo se puede invitar mientras el comercio sea
  operativo (Aprobado o Apto para Venta).
- El sistema genera una invitación propia (`InvitacionEmpleado`, no un token): código de
  6 dígitos, vencimiento a 7 días, y se envía por email con el código en el texto y un
  enlace genérico a la pantalla de invitación. El invitado se identifica con email y
  código (ver Requisitos Funcionales — Empleado, sección Invitación y Alta).
- Cada envío es una fila: reenviar crea una invitación nueva. La anterior queda Reemplazada
  solo si era una Pendiente todavía vigente; una Vencida (o una Pendiente pasada de fecha, que
  se marca Vencida) y una con el código bloqueado conservan su estado, para no pisar la causa
  original. El Dueño puede reenviar una invitación Pendiente, Vencida o con el código
  bloqueado (una Aceptada, Cancelada o Reemplazada ya no se puede reenviar), y cancelar
  una invitación pendiente, vencida o con el código bloqueado (queda Cancelada, sin borrar
  nada; una ya resuelta no se puede cancelar). Solo se puede reenviar o cancelar la invitación
  más reciente de cada email en el comercio: si ya hay una más nueva (por ejemplo, la que nació
  al reenviar una vencida), la anterior ya no se reenvía ni se cancela y el sistema responde
  que no se puede. Límites: 5 envíos por hora por comercio (sirve también
  como tope de reenvíos) y 5 intentos fallidos por código (después se invalida y hay que
  reenviar); no hay tope de empleados por comercio.
- **Matriz de combinaciones de roles al invitar:** si el email pertenece a un Dueño o a
  un Administrador, no se crea la invitación y el servidor responde 409 con el mensaje genérico
  "No se puede invitar a este email" (no revela el tipo de cuenta). La matriz se vuelve a
  validar al aceptar.
- **Aviso único de rechazo:** en pantalla, todas las causas de rechazo (Dueño, Administrador, cuenta
  no apta, menor de 18) muestran el mismo aviso fijo debajo del campo del email, que no se cierra solo:
  "No pudimos invitar a este email. Por privacidad no podemos contarte el motivo. Podés pedirle a esta
  persona que revise su correo y volver a intentar más tarde." El aviso no afirma que se haya enviado un
  email. El botón de invitar queda deshabilitado para ese email mientras la hoja siga abierta y se
  habilita si el email cambia o se reabre la hoja. Al reenviar se muestra el mismo aviso en una hoja
  con el botón "Entendido". El servidor mantiene el 409 genérico, sin discriminar la causa.
- **Edad mínima:** si el email pertenece a una cuenta activa cuya fecha de nacimiento declarada da
  menos de 18 años, tampoco se crea la invitación y el Dueño ve el mismo mensaje genérico, sin
  enviar email de regularización. La regla se evalúa después de la matriz de roles y del estado
  de la cuenta; un email sin cuenta no tiene edad conocida y se controla al aceptar.
- **Cuentas no aptas:** si el email pertenece a una cuenta bloqueada, suspendida, inactiva
  o sin verificar, tampoco se crea la invitación y el Dueño ve el mismo mensaje genérico.
  A la persona le llega un email de regularización con el motivo (bloqueada: recuperar la
  contraseña; suspendida: contactar a soporte; inactiva: iniciar sesión para reactivar;
  sin verificar: verificar el email) y se le sugiere pedir que la vuelvan a invitar.
  El email de regularización nombra solo al comercio que invita, nunca al Dueño.
  Máximo 3 emails de regularización por día por destinatario, contados sobre la tabla de
  notificaciones con canal Email. No se envía a Dueños ni a Administradores.
- El Dueño debe poder ver el equipo de cada comercio en dos pestañas con su contador:
  "Mi equipo · N" (el contador cuenta solo los integrantes con la relación Activa; debajo
  hay dos filtros, "Activos · N" —el que se ve por defecto— e "Inactivos · N", donde cada integrante muestra
  el motivo: "Dado de baja el DD/MM" o "Renunció el DD/MM", o solo "Inactivo" (sin fecha) si no hay registro
  de la baja; cada fila lleva un menú de tres puntos) y "Solicitudes · N" (las invitaciones, una línea por email con la más reciente:
  Pendiente con "vence en N días", Vencida con "Vencida hace N días" y "Código bloqueado";
  todas las líneas llevan un menú de tres puntos con "Reenviar" y "Cancelar"; las aceptadas
  pasan a "Mi equipo" y las canceladas y reemplazadas no se muestran). Una invitación
  Pendiente es la que está dentro del plazo en que se puede aceptar, reenviar o cancelar: al
  cumplirse los 7 días el sistema la pasa a Vencida con un proceso automático que corre cada
  minuto (Vencida es un estado guardado en la base). Se puede reenviar y cancelar una
  invitación Pendiente, Vencida o con el código bloqueado; una aceptada, cancelada o
  reemplazada ya no. Una invitación invalidada por cinco intentos fallidos se muestra como
  "Código bloqueado". Desde la etapa 4 de la entrega B de E3 esta vista
  ("Ver equipo") tiene una tercera pestaña, "Actividad" (sin contador), que muestra la lista de
  actividad del comercio (`GET /api/v1/comercios/equipo/actividad`) con filtros "Todo",
  "Pedidos", "Ediciones", "Cierres" y "Equipo" (lo que pasó con el equipo: invitaciones, aceptaciones,
  bajas, renuncias y reactivaciones). En esa pestaña el botón "Invitar" no se muestra, porque
  no corresponde.
- El Dueño debe poder desactivar la relación de un Empleado con un comercio puntual en
  cualquier momento (queda Inactiva con motivo `BAJA_DUENO`), sin afectar las relaciones
  de ese Empleado con otros comercios, propios o de otros Dueños. El Empleado desactivado
  recibe una notificación. Puede reactivarlo directamente, sin código, solo si lo dio de
  baja el propio Dueño; si el Empleado renunció, o si la invitación se canceló, hace falta
  una invitación nueva.
  En pantalla: el menú de tres puntos de un integrante activo tiene una sola acción, "Desactivar", que
  pide una única confirmación ("¿Desactivar a {Nombre}?", con el aviso de que pierde el acceso y se le
  avisa, y se puede reactivar desde Inactivos); el menú de uno inactivo dado de baja por el Dueño ofrece
  "Reactivar" ("Vuelve al equipo ahora, sin invitación"), que actúa sin confirmación; el de quien renunció
  explica que dejó el equipo por su cuenta y ofrece "Invitar de nuevo", que abre la hoja de invitar con su
  email; y el de un inactivo sin registro de la baja ofrece solo "Invitar de nuevo". Si reactivar falla
  (invitación pendiente, renuncia, comercio fuera de servicio o cuenta no apta) el motivo se ve dentro de la
  misma hoja y no se revela el estado de la cuenta. Al desactivar o reactivar con éxito se muestra un aviso con el
  nombre: "Desactivaste a {Nombre}" o "Reactivaste a {Nombre}".
- El Dueño debe poder ver el historial del equipo de cada comercio (invitación,
  aceptación, invitación cancelada, baja, renuncia y reactivación, con quién lo hizo y
  cuándo) y la actividad del comercio (quién hizo qué: crear, editar, eliminar, cambiar
  estado, abrir y cerrar). La actividad es una sola lista, de la más nueva a la más vieja,
  que junta las ediciones del catálogo y el perfil (productos, imágenes, datos del comercio y
  redes sociales), todo lo que le pasó a sus pedidos desde que el comercio los ve (aceptar,
  rechazar, despachar, entregar, anular y cerrar como no retirado, hechos por el Dueño o un Empleado; cancelar y
  confirmar la recepción, hechos por el Cliente; y las acciones del sistema: "Pedido recibido"
  cuando llega un pedido ya pagado, el vencimiento sin respuesta, la autoconfirmación de la
  entrega, el cierre automático como no retirado de un retiro con el comercio suspendido y la cancelación por
  la suspensión del comercio) y los cierres y reaperturas del comercio; el pedido que todavía
  no se pagó, o que venció por falta de pago, no aparece porque el comercio nunca lo vio;
  cada línea trae el nombre y el rol (Dueño, Empleado o Cliente) de quien actuó, y en las
  acciones del sistema solo el rol "Sistema" (con un engranaje en lugar de las iniciales), qué hizo y cuándo
  (la hora, con separadores por día: "Hoy", "Ayer" o la fecha), y se pide de a 30 líneas con
  "ver más". Los filtros "Pedidos", "Ediciones" y "Cierres" le piden al servidor solo esa fuente
  (parámetro opcional `fuente`: `PEDIDO`, `EDICION` o `CIERRE`; un valor distinto es un error
  400; sin parámetro se ve todo, igual que antes); cambiar de filtro o de pestaña vuelve a
  empezar la lista, y la actualización automática del equipo no toca la lista de actividad.
  La actividad la ve el Dueño completa; el Empleado no la
  ve (ni la pestaña ni la pantalla de equipo) y el Administrador la ve en solo lectura.
- El Dueño recibe una notificación cuando el invitado acepta la invitación (T33) y cuando
  un Empleado renuncia (T34).
- El Dueño recibe, igual que cada Empleado Activo, el aviso T30 cuando el sistema confirma solo
  la entrega de un pedido a domicilio porque el Cliente no respondió en el plazo configurado
  (90 minutos por defecto): cada uno tiene su propia copia, con el comercio, que marca como
  leída por separado.
- El Dueño ve el nombre de quien hizo cada cambio de estado de un pedido y cada cierre o
  reapertura del comercio, incluso si el Empleado ya está inactivo. El recorrido de un
  pedido (`GET /api/v1/pedidos/comercio/{id}/trazabilidad`) lo ven el Dueño y los Empleados
  activos; el Dueño figura en él con su nombre y apellido. El Dueño no recibe la marca
  `esPedidoPropio` (nunca es Cliente de su comercio) y puede gestionar cualquier pedido,
  incluido el de un Empleado que compró en el comercio.

---

## Gestión de Múltiples Comercios

- El Dueño debe poder dar de alta comercios adicionales bajo su propia cuenta, cada uno
  con sus propios datos, horarios, productos, extras, redes sociales y equipo de
  empleados, sin límite de cantidad.
- El Dueño debe poder dar de baja o cerrar definitivamente un comercio puntual sin que
  esto afecte a sus demás comercios ni a su cuenta de MercadoPago vinculada.

---

## Resumen del Turno en el Panel

- El panel de cada comercio muestra el turno en curso o, entre turnos, el último turno terminado, con su horario y un rótulo ("En curso", "Terminó", "Terminó ayer", "Sin turno por ahora"), y tres contadores: "Vendido en el turno" (el subtotal de los pedidos facturados del turno, sin descontar cargos), "Pedidos del turno" y "Pendientes" (todos los del comercio).
- El Dueño puede desplegar, debajo de los contadores, la comisión de plataforma del turno y el neto del turno (el vendido menos la comisión). La comisión y el neto son exclusivos del Dueño: un Empleado ve el mismo resumen sin esos dos datos.
- Un pedido pertenece al turno en el que se confirmó su pago (el turno que empezó el día anterior si el pago fue de madrugada y el turno cruza la medianoche); si el pago cayó fuera de toda franja, al último turno terminado de los 7 días anteriores. Editar los horarios después no cambia el turno de los pedidos ya pagados.

---

## Precios de los Productos

- El precio de un producto no se puede cambiar mientras el comercio está dentro de uno de sus horarios de atención (aunque el comercio esté cerrado a mano o cerrado temporalmente: cuenta el horario, no el estado). Las demás partes del producto (nombre, descripción, categoría, tags, fotos, estado) se siguen editando con normalidad, y el alta de un producto nuevo con su precio no tiene restricción. Un comercio sin horarios cargados no tiene esta restricción.
- En el formulario de edición, mientras el precio está bloqueado, el campo aparece deshabilitado con un candado y la leyenda "Se puede cambiar fuera de tu horario de atención"; el precio se conserva sin cambios al guardar los demás datos. Si el horario de atención termina con el formulario abierto, el campo se habilita solo a esa hora. Si el servidor igualmente rechaza el cambio, el mensaje "No podés cambiar precios mientras tu comercio está en horario de atención. Hacelo fuera de ese horario." aparece en un aviso fijo y el campo vuelve a su valor.
- Este bloqueo vale por igual para el Dueño y para el Empleado.

---

## Permisos Exclusivos del Dueño

Las siguientes acciones no son delegables a un Empleado, aunque este tenga acceso
Activo al comercio:

- Editar los datos fiscales y de persona jurídica.
- Cambiar el nombre, la foto, la dirección y el tipo de comercio y las
  modalidades de entrega (la edición completa del perfil). De todo el perfil, el Empleado solo
  edita la descripción y el teléfono, por una ruta aparte que rechaza cualquier otro campo; el
  Dueño también puede usarla.
- Vincular o desvincular la cuenta de MercadoPago.
- Ver la comisión y el neto del turno en el panel.
- Invitar, reenviar y cancelar invitaciones, desactivar y reactivar Empleados, y ver el
  historial del equipo y la actividad del comercio.
- Gestionar los enlaces a redes sociales del comercio.
- Todo lo relacionado con MercadoPago, incluido ver el enlace de pago de un pedido.
- Corregir y volver a solicitar un comercio rechazado, y dar de alta comercios adicionales.
- La futura documentación de habilitación del comercio.
- Dar de baja o cerrar definitivamente un comercio puntual.
- Crear comercios nuevos bajo su propio perfil de Dueño.

Con el comercio Suspendido o Cerrado Temporalmente, hoy el Dueño no tiene las restricciones
que sí tiene el Empleado (por ejemplo, puede editar productos y perfil con el comercio
Suspendido): es un hueco conocido que se resuelve en el tramo de rediseño de la suspensión.

Todo lo que no esté explícitamente clasificado como delegable (ver Requisitos Funcionales
— Empleado, sección Permisos Delegados) queda reservado al Dueño por defecto.
