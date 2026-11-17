# Requisitos Funcionales — Cliente

---

## Registro y Perfil

- El sistema debe permitir el registro de nuevos clientes solicitando: nombre, apellido, DNI, fecha de nacimiento, teléfono, email, nombre de usuario, contraseña y una dirección de entrega inicial (que queda registrada automáticamente como dirección principal), y exigir que el cliente acepte los Términos y Condiciones: el servidor rechaza el registro (400) si el campo `aceptaTerminos` falta o es falso. La línea de la casilla enlaza con los Términos y Condiciones y la Política de Privacidad vigentes (versión 1.0), que se abren en una pestaña nueva y son públicos. La aceptación se valida pero no se guarda (sin fecha ni versión); estar registrado da por aceptados los términos.
- La dirección inicial debe estar en una localidad habilitada: Río Grande, Ushuaia o Tolhuin (Tierra del Fuego). Con otra localidad el servidor responde 400 con el error de campo "Esa localidad todavía no está disponible".
- Si la persona ya cargó datos y quiere salir del registro, la aplicación le pregunta si descarta lo escrito; el navegador también avisa al cerrar o recargar la pestaña.
- El cliente debe tener 14 años o más al registrarse, contados con la fecha del día del servidor: cumplir los 14 ese mismo día ya alcanza. Con menos edad el servidor rechaza el registro (400) con el mensaje "Tenés que tener al menos 14 años para registrarte" en el campo de la fecha de nacimiento. La edad es la que el cliente declara: el sistema no verifica identidad ni DNI. La regla se evalúa solo al registrarse; una cuenta ya existente no se revisa.
- El cliente debe poder editar sus datos personales (nombre, apellido, teléfono) desde su perfil autenticado.
- El cliente debe poder cambiar su nombre de usuario desde su perfil autenticado, hasta 3 veces cada 30 días corridos (ventana deslizante hacia atrás desde el momento del intento, no mes calendario). El sistema debe registrar cada cambio y, al alcanzar el límite, informar los días reales que faltan para volver a poder cambiarlo.
- El cambio de nombre de usuario requiere confirmar la contraseña actual. Una contraseña incorrecta cuenta como intento fallido, con el mismo bloqueo de cuenta a los 3 intentos que el login y el cambio de contraseña, y con el mismo aviso previo ("Cuidado: si fallás una vez más, tu cuenta se bloqueará.").
- El cambio de nombre de usuario no cierra las sesiones existentes.
- El cliente debe poder cargar y editar una foto de perfil desde su perfil autenticado. Es opcional.
- El cliente debe poder gestionar hasta 5 direcciones de entrega activas (sección "Mis direcciones" del perfil): agregar, editar, eliminar y designar una como predeterminada. Cada dirección puede llevar un nombre privado (alias de hasta 40 caracteres, repetible) y una referencia de entrega (hasta 150 caracteres).
- Solo hay una dirección predeterminada y la primera que se registra lo es sola. Eliminar es una baja lógica: las eliminadas no cuentan para el máximo de 5. No se puede eliminar la última dirección activa (conflicto 409, código ULTIMA_DIRECCION) y, si se elimina la predeterminada, pasa a serlo la más reciente. Con 5 activas no se puede agregar otra (conflicto 409, código DIRECCIONES_CUPO_MAXIMO) y la pantalla lo explica.
- Las direcciones nuevas o editadas deben estar en una localidad habilitada (Río Grande, Ushuaia o Tolhuin); editar una dirección, aunque solo se cambie el nombre, vuelve a exigirlo. Las direcciones anteriores en otras localidades se siguen leyendo y sirven para pedir.
- Si la persona sale del formulario de una dirección con cambios sin guardar, la aplicación pregunta "¿Descartar los cambios?" con "Seguir editando" y "Descartar".
- En escritorio el perfil se recorre por secciones (datos, direcciones, contraseña) sin recargar la página; cada sección tiene su enlace (`perfil.html?seccion=datos|direcciones|password`).

---

## Exploración de Comercios y Menús

- El sistema debe mostrar el listado de comercios disponibles de forma pública, sin requerir autenticación. Solo se muestran comercios en estado Apto para Venta (APTO_VENTA: Aprobado, con la cuenta de MercadoPago de su Dueño vinculada y su documentación aprobada), o comercios en estado Cerrado Temporalmente. Un comercio suspendido, inactivo, pendiente o rechazado no aparece. Estos últimos aparecen con indicador visual de "temporalmente cerrado" y sin posibilidad de realizar pedidos.
- Los comercios que están cerrados, ya sea fuera de su horario de atención o pausados a mano por su Dueño, se muestran atenuados en el listado, con una etiqueta al final de la tarjeta ("Cerrado" por horario o por pausa a mano del Dueño, "Cerrado temporalmente" cuando la cuenta del Dueño está bloqueada). Los comercios abiertos se listan primero y el filtro "Abierto ahora" deja solo los abiertos. El estado de apertura lo informa el servidor; el navegador no lo calcula con su propio reloj.
- El detalle de un comercio cerrado muestra la misma etiqueta y el aviso de cuándo reabre ("Reabre hoy a las HH:mm", "Reabre mañana a las HH:mm" o "Reabre el <día> a las HH:mm"), y no ofrece agregar productos al carrito. Un comercio cerrado porque su Dueño tiene la cuenta bloqueada se ve distinto del cerrado a mano: la etiqueta dice "Cerrado temporalmente" y no hay aviso de cuándo reabre.
- Si el comercio se cierra después de que el cliente abrió el producto o el checkout, al agregar al carrito o al confirmar el pedido el sistema responde con el mensaje del servidor ("Este comercio está cerrado en este momento") en un aviso de error con un botón "Volver al catálogo". Abrir el carrito con un comercio cerrado no muestra ningún aviso anticipado.
- El cliente debe poder acceder al menú de un comercio y visualizar sus productos activos con nombre, descripción, precio, foto, categoría y tags.
- El cliente debe poder filtrar productos dentro de un menú por categoría y/o tags.
- La pantalla Explorar tiene un buscador con un botón para borrar el texto, un contador de resultados y la opción "Limpiar filtros". En escritorio la búsqueda también está en la barra superior y lleva a Explorar con el texto (`explorar.html?q=texto`).
- El sistema debe informar al usuario no autenticado que debe iniciar sesión para poder realizar un pedido.
- El detalle del comercio muestra: nombre, descripción, tipo de comercio, horarios de atención, dirección, teléfono, enlaces a sus redes sociales cargadas (si tiene) y modalidades disponibles (delivery, retiro en local o ambas).

---

## Carrito de Compras

- El cliente autenticado debe poder agregar productos al carrito, especificando cantidad (entre 1 y 20 unidades) y una nota opcional por ítem. Los extras de producto (grupos de extras y opciones adicionales) fueron descartados del alcance de esta versión: el modelo de datos conserva sus tablas, pero no hay pantallas ni reglas que las usen.
- Si el producto que se agrega ya está en el carrito, el sistema debe sumar la cantidad indicada a la cantidad ya existente del ítem (no rechazar la operación ni crear un ítem duplicado), respetando el máximo de 20 unidades por ítem — si la suma lo supera, la cantidad queda en 20. La nota del ítem se reemplaza por la última recibida.
- El carrito debe restringir la selección a productos de un único comercio por sesión. Intentar agregar un producto de otro comercio devuelve un error 409 solicitando vaciar el carrito primero.
- El cliente debe poder modificar la cantidad de un ítem, eliminarlo individualmente o vaciar el carrito completo.
- El sistema debe calcular y mostrar el subtotal del carrito en tiempo real. Con una sola unidad, el control "−" de un ítem queda deshabilitado y el ícono de la derecha es el único que quita el producto.
- Si el comercio cambia el precio de un producto que el cliente ya tiene en el carrito, el sistema cobra el precio vigente y lo avisa en esa línea: el precio que el cliente vio al agregarlo, tachado, el nuevo al lado y el texto "Cambió el precio". El subtotal, el cargo por servicio y el total del carrito ya muestran los valores nuevos. El aviso no se apaga al cambiar la cantidad del ítem; se va cuando el ítem sale del carrito o el pedido se paga.
- El carrito debe vincularse a la sesión activa del cliente, pasando a estado inactivo al expirar la sesión o al inactivarse la cuenta.
- El carrito solo se limpia automáticamente una vez confirmado el pago (transición del pedido a estado PENDIENTE_CONFIRMACION_COMERCIO), y solo si el carrito actual es del mismo comercio del pedido pagado. En caso de pago fallido o timeout de pago, el carrito permanece intacto.

---

## Pedidos

- El cliente autenticado puede tener múltiples pedidos activos simultáneamente, siempre que cada pedido individual sea de un único comercio.
- El cliente autenticado debe poder confirmar su pedido desde el carrito, seleccionando la modalidad de entrega: retiro en el local o envío a domicilio. La opción de envío a domicilio solo se muestra si el comercio lo acepta; la de retiro, solo si el comercio lo acepta. Elegir la modalidad avanza al paso siguiente sin un botón "Continuar"; si el comercio ofrece una sola modalidad, el paso se omite.
- En un pedido a domicilio el cliente elige la dirección de entrega entre sus direcciones activas (viene preseleccionada la predeterminada); elegir otra vale solo para ese pedido y no cambia la predeterminada. Desde el checkout puede agregar una dirección o administrarlas, y vuelve al mismo paso con lo elegido. El pedido guarda una copia de la dirección (calle, número, piso o departamento, código postal, localidad y referencia, sin el nombre privado): editar o eliminar la dirección después no modifica el pedido. En el checkout el resumen del pedido y el total se ven siempre.
- El sistema debe validar, al momento de confirmar el pedido: que el comercio esté en estado APTO_VENTA (Aprobado y con la cuenta de MercadoPago de su Dueño vinculada), que esté dentro de su horario de atención, que todos los productos sigan activos, y —en caso de domicilio— que el cliente haya elegido una dirección de entrega activa propia (por omisión, la predeterminada).
- El sistema debe registrar el pedido con todos sus ítems, precios al momento de la compra, comercio, modalidad de entrega, tarifa de servicio vigente al cliente y al comercio (ambas persistidas en el registro del pedido), y fecha.
- El resumen del pedido debe mostrar: subtotal, cargo de servicio al cliente (valor vigente al momento del pedido) y total a pagar.
- Al confirmar el pedido, el sistema envía el total que el cliente vio en el resumen. Si ese total ya no coincide con el que se cobraría (porque cambió el precio de algún producto o el cargo por servicio), no se crea el pedido: el resumen se vuelve a mostrar con los montos nuevos, un aviso "Los montos de tu pedido cambiaron. Revisá el nuevo total antes de pagar." (o "El cargo por servicio cambió…" si ningún precio cambió) y el botón "Confirmar con el nuevo total - $X"; recién con ese segundo paso se crea el pedido.
- El cliente debe poder visualizar el historial completo de sus pedidos con su estado actual y detalle de cada uno. Los estados se muestran con textos pensados para el cliente: el pedido que espera al comercio dice "Esperando al comercio" (el comercio lo ve como "Pendiente"). En escritorio la lista y el detalle del pedido elegido están en la misma pantalla (`pedidos.html?id=N`) y se puede filtrar por En curso, Entregados y Cancelados.
- El pedido que todavía no se pagó dice "Todavía no pagaste este pedido."; al volver de MercadoPago a la espera de la confirmación dice "Estamos confirmando tu pago. Esta pantalla se actualiza sola."; con el pago rechazado dice "No pudimos procesar tu pago. Podés intentar de nuevo.".
- El cliente puede cancelar un pedido que todavía no pagó: no genera devolución ni aviso al comercio. Cancelar un pedido o confirmar su recepción pide una confirmación que explica la consecuencia; cancelar un pedido ya pagado informa cuánto se devuelve.
- El cliente puede cancelar su pedido según modalidad:
  - **Domicilio:** hasta el momento en que el comercio lo marca como EN_CAMINO (estados cancelables: PENDIENTE_CONFIRMACION_COMERCIO y EN_PREPARACION).
  - **Retiro:** hasta el momento en que el comercio lo marca como LISTO_PARA_RETIRAR (estados cancelables: PENDIENTE_CONFIRMACION_COMERCIO y EN_PREPARACION).
- En pedidos a domicilio en estado EN_CAMINO, el cliente debe poder confirmar la recepción del pedido. Esta confirmación cierra el pedido como ENTREGADO.
- En pedidos de retiro, la confirmación de entrega la realiza el comercio.
- Si el cliente no pasa a buscar un pedido de retiro que quedó listo, el comercio (o el sistema, si el comercio fue suspendido) lo cierra como NO_RETIRADO y el cliente recibe el aviso "Tu pedido #N no fue retirado y el comercio lo cerró. Como ya estaba preparado, no hay devolución del pago." El pedido se muestra como "No retirado", sin reembolso, y no se informa quién lo cerró.
- El cliente debe poder reclamar un pedido ENTREGADO (a domicilio o de retiro, también el que el sistema autoconfirmó) con el pago aprobado, dentro de los 7 días corridos desde la entrega. El plazo no se pausa si la cuenta está suspendida (mientras tanto no puede crear reclamos). Un pedido admite un solo reclamo, que no se puede editar ni cancelar.
- El reclamo lleva un motivo (No recibí el pedido, solo en pedidos a domicilio; Faltan productos; Productos equivocados; Producto en mal estado; Cobro incorrecto; Otro problema) y un mensaje de 10 a 1000 caracteres, y puede incluir hasta 3 fotos opcionales de hasta 5 MB cada una, en formato JPG, PNG o WebP (las fotos HEIC de iPhone se rechazan con un mensaje claro). Si una foto no es válida no se crea el reclamo. El pedido no cambia de estado.
- El detalle del pedido muestra "¿Tuviste un problema con este pedido? Tenés hasta el {fecha} para reclamar." con el botón "Tuve un problema con este pedido"; con el plazo vencido el botón queda deshabilitado y dice "Pasaron los 7 días para reclamar este pedido."; un pedido que no se puede reclamar por otro motivo no muestra nada. La pantalla no calcula plazos ni elegibilidad: lo informa el servidor.
- El cliente ve el estado de su reclamo: en revisión, aprobado (con el monto que se le devuelve, total o parcial, y si el reembolso está en proceso) o rechazado (con el motivo y un acceso a Soporte). Recibe un aviso dentro de la app y un email cuando se resuelve. Solo ve cuántas fotos adjuntó, no las fotos. En el listado de pedidos un pedido con reclamo lleva una marca ("Reclamo en revisión", "Reclamo aprobado" o "Reclamo rechazado").
- Cuando el sistema marca un pedido como entregado por su cuenta, el aviso al cliente dice: "Marcamos tu pedido #N como entregado. Si tuviste algún problema, podés reclamar dentro de los 7 días desde esta fecha.".

---

## Seguimiento de Estado

- El sistema debe notificar al cliente ante cada cambio de estado de su pedido: aceptado, en preparación, en camino o listo para retirar, entregado, no retirado, rechazado, cancelado o anulado.
- Cada aviso de la lista se toca entero: si tiene una pantalla relacionada (el pedido, el reclamo, el carrito o la consulta a Soporte) lleva a ella y se marca como leído; si es solo informativo (por ejemplo, cuenta suspendida o inactivada) se marca como leído sin navegar. El aviso no leído se distingue por un fondo suave, un punto y el texto accesible "No leída", no solo por el color.
- La lista de avisos se carga de a 20 con un botón "Ver más" al final; el punto de la campana y el contador cuentan todos los avisos sin leer. El cliente puede marcar todos sus avisos personales como leídos con "Marcar todas".
- Los avisos que el sistema genera por la suspensión del comercio dicen "Cancelamos tu pedido #N porque el comercio no está disponible. Te devolvemos el dinero.".
- El cliente debe poder visualizar el historial completo de estados por los que pasó cada pedido, con las fechas y horas correspondientes.

---

## Pagos

- El cliente debe poder abonar su pedido a través de MercadoPago como único medio de pago disponible en la plataforma.
- Ante rechazo del pedido por el comercio, anulación por el comercio, cancelación por el cliente, expiración por falta de respuesta del comercio, cancelación por la suspensión del comercio o de su Dueño, o un pago aprobado que llega con la cuenta del cliente suspendida o sobre un pedido ya cancelado, el cliente debe recibir el reembolso del monto total abonado mediante nota de crédito procesada vía MercadoPago. La aprobación de un reclamo da un reembolso total o parcial según lo resuelva el Administrador. Un reembolso puede demorar en verse en la cuenta y, si MercadoPago no puede hacerlo (por ejemplo, el comercio desvinculó su cuenta), queda para revisión manual del Administrador.
- Si MercadoPago rechaza un pago, el pedido no se cancela: permanece pendiente de pago y el cliente puede reintentar sobre el mismo link hasta que se apruebe un pago o venza el plazo de pago (30 minutos desde la creación del pedido). El link de pago vence junto con el pedido.
- Si un pago está en revisión en MercadoPago (`pending` o `in_process`), el sistema no permite iniciar otro checkout hasta que se resuelva o venza el pedido.
- Al volver del checkout, el sistema verifica el estado real del pago en MercadoPago; si el pedido ya está pagado se informa sin abrir un nuevo checkout.

---

## Pedidos de un comercio suspendido o sin atención

- Un pedido que todavía no se pagó de un comercio suspendido figura como "Sin pagar" y dice "Este comercio no está recibiendo pedidos por ahora.". En su detalle el botón "Ir a pagar" está deshabilitado, se explica "Vas a poder pagar cuando el comercio vuelva a estar disponible, si el pedido no venció." y el cliente puede cancelarlo. Si levantan la suspensión y el pedido no venció, "Ir a pagar" vuelve a funcionar. Un pedido sin pagar no se cancela por la suspensión: sigue su vencimiento normal por falta de pago.
- Si el comercio todavía no había aceptado el pedido ya pagado, el sistema lo rechaza en el acto, devuelve el pago y avisa; el pedido figura como Rechazado con el texto "El comercio no estaba disponible. Te devolvemos el dinero." y el cliente ve el estado del reembolso.
- Un pedido ya aceptado que el comercio no atiende se cancela con reembolso total a los 90 minutos de la suspensión; un pedido de retiro listo que nadie entrega se cierra como no retirado, sin reembolso, a los 90 minutos contados desde que quedó listo o desde la suspensión. Un pedido en camino no se modifica. Si la suspensión es de la cuenta del Dueño y el comercio no tiene ningún Empleado activo, los pedidos en preparación o listos para retirar se anulan o cancelan de inmediato con reembolso total; el pedido figura como "Cancelado" con el texto "El comercio no estaba disponible. Te devolvemos el dinero.".
- Los pedidos anteriores siguen mostrando el nombre y la foto del comercio aunque esté suspendido.
- Si el comercio se suspende mientras el cliente arma el pedido, al confirmar ve "Este comercio no está recibiendo pedidos por ahora. Probá con otro comercio." con el botón "Volver al catálogo", y el carrito se conserva.

---

## Cuenta suspendida o inactiva

- Cuando el Administrador suspende la cuenta de un cliente, se cierra su sesión y no puede iniciar sesión ni operar (checkout, pago, carrito): el inicio de sesión, con la contraseña correcta, muestra una hoja con el motivo y el acceso a "Contactar a Soporte"; con una sesión abierta aparece una pantalla de cuenta suspendida. El carrito se conserva, los pedidos ya pagados siguen su curso y los pedidos sin pagar se cancelan. Al levantar la suspensión, la cuenta vuelve al estado que tenía antes. Recibe un aviso dentro de la app y un email (un solo intento) al suspenderla y al levantarla.
- Una cuenta suspendida puede entrar a Soporte y a "Mis consultas" con la sesión que tenía abierta; el resto de la aplicación le muestra la pantalla de suspensión.
- Una cuenta de cliente sin uso durante 3 meses pasa a inactiva sin aviso previo, salvo que tenga un pedido en curso. Al iniciar sesión con usuario y contraseña correctos, la pantalla "Tu cuenta está inactiva" ofrece "Reactivar mi cuenta" (entra en el acto), "Contactar a Soporte" o "Volver a ingresar". También reactiva la cuenta recuperar la contraseña o el Administrador. Recibe un email al inactivarse.

---

## Ayuda, Soporte e información legal

- El cliente tiene una pantalla "Ayuda" en su perfil con Preguntas frecuentes, Escribir a Soporte, Mis consultas a Soporte, Términos y condiciones y Política de privacidad. Los Términos, la Política y las Preguntas frecuentes son páginas públicas (accesibles sin sesión) y están enlazadas desde el ingreso, el registro y Soporte.
- El cliente puede escribir a Soporte con o sin sesión, también con la cuenta suspendida (formulario con tipo de consulta, email y mensaje de 10 a 1000 caracteres). Recibe el código de la consulta; con sesión ve sus consultas en "Mis consultas a Soporte" (con un contador de las que esperan su respuesta) y sin sesión entra con su email y el código. La conversación es por turnos, con un máximo de 20 mensajes, y solo Soporte la cierra.

---

## Identidad y accesibilidad de la interfaz

- Al iniciar sesión, la aplicación saluda por el nombre de pila («Hola, Lucía»); si no está disponible, saluda con «Hola». El cambio de nombre en el perfil se refleja sin volver a iniciar sesión.
- Las pantallas muestran un indicador de carga (esqueleto) mientras llegan los datos y, si falla la primera carga, un error con "Reintentar". Un corte de conexión no expulsa a la persona ni borra lo escrito.
- En pantallas de 1024 píxeles o más el cliente dispone de una interfaz de escritorio: barra superior de navegación, catálogo en grilla, carrito y checkout con resumen fijo, "Mis pedidos" con lista y detalle, perfil por secciones y avisos como tabla. La versión para celulares no cambia. El botón "Volver" lleva a un destino definido y previsible.
