# Requisitos Funcionales — Empleado

Requisitos del rol Empleado: una persona invitada por un Dueño que opera, con permisos
acotados, uno o varios comercios en representación de sus respectivos Dueños.

> **Estado de implementación (2026-10-05):** todo lo descrito en este documento está
> **planificado**. Se implementa en los tramos E1 a E4 (ver Alcance y Limitaciones y
> `docs/DECISIONES.md`, entrada del 2026-10-05). Hoy no existe código, tablas ni pantallas
> de Empleado: el modelo de datos tiene las tablas `Empleado` y `EmpleadoComercio` sin
> uso, y las demás estructuras mencionadas acá (`InvitacionEmpleado`,
> `HistorialEmpleadoComercio`, `HistorialEdicionComercio`) se crean en las migraciones `V29` a
> `V32`.

---

## Modelo de Cuenta del Empleado

- No existe un rol físico "Empleado" en la cuenta. El Empleado es una persona con cuenta
  de Cliente (`Usuario.rol = CLIENTE`) a la que se le suma el registro `Empleado` y una o
  más relaciones con comercios (`EmpleadoComercio`). El valor `EMPLEADO` del ENUM de roles
  existe en la base pero no se usa.
- Un mismo Usuario tiene un solo rol en la base y un solo rol en el token de sesión. El
  "contexto" en el que opera (Cliente, o Empleado de un comercio puntual) se resuelve por
  request mediante el comercio activo (encabezado `X-Comercio-Id`, el mismo mecanismo del
  selector de comercio del Dueño) y la relación `ACTIVO` comprobada contra la base en
  cada pedido.
- Regla de combinaciones de roles (regla de negocio): un Administrador es Administrador o
  Cliente; un Dueño es Dueño o Cliente; un Empleado es Empleado o Cliente. Un Cliente
  puede sumar el rol Empleado por invitación. Un Dueño no puede ser Empleado de otro
  local, y un Administrador no puede ser Empleado ni Dueño.
- Alcance de esta regla: solo se construye y se hace cumplir "Empleado + Cliente" y que
  un Empleado nunca sea Dueño ni Administrador. "Dueño + Cliente" y "Administrador +
  Cliente" quedan como regla escrita sin mecanismo (ver Alcance y Limitaciones).

---

## Invitación y Alta

- El Empleado accede a la plataforma únicamente por una invitación enviada por un Dueño
  (ver Requisitos Funcionales — Dueño, sección Gestión de Empleados). No existe
  "Registrarme como empleado".
- La invitación es por comercio y vive en una estructura propia (`InvitacionEmpleado`),
  no en la tabla de tokens: guarda el email invitado, el comercio, un código de 6
  dígitos, el vencimiento (7 días), los intentos fallidos, el estado, quién invitó y quién
  aceptó. El invitado se identifica con su email y el código.
- El email de invitación lleva el código en el texto y un enlace genérico a la pantalla
  de invitación (`{app.frontend-base-url}/invitacion-empleado.html`), sin código, sin
  email y sin fragmento (`#`) en la dirección. Desde el login hay un botón "Tengo una
  invitación" y en el registro una línea que lleva a la misma pantalla.
- **Aceptar con una cuenta nueva** (el email no tiene Usuario): la persona completa los
  mismos datos que el registro de Cliente (nombre, apellido, DNI, fecha de nacimiento,
  teléfono, nombre de usuario, contraseña y dirección) y acepta los Términos y
  Condiciones; la aceptación se valida en el servidor (campo `aceptaTerminos`). El sistema
  crea Usuario, PersonaFisica, Cliente y Empleado en una sola transacción. El código
  verifica el email: no hay un segundo código de verificación y la cuenta queda Activa.
- **Edad mínima:** un Empleado debe tener 18 años o más, contados con la fecha del día
  del servidor (cumplirlos ese mismo día alcanza). Con una cuenta nueva, los datos son los
  del registro de Cliente, pero la edad mínima de 14 años es una regla del registro y no se
  aplica en este flujo: con menos de 18 años (cualquier edad) el servidor responde 400 en el
  campo `cuentaNueva.fechaNacimiento` con "Tenés que tener 18 años o más para trabajar en un
  comercio", antes de crear ninguna fila y sin gastar intentos del código; el mensaje de 14
  años nunca aparece en este flujo. La pantalla lo avisa antes, en tiempo real, apenas se
  completa la fecha ("Tenés que tener 18 años o más para trabajar en este comercio.") y no deja
  seguir. Con una cuenta existente cuya fecha de nacimiento da menos de 18 años, validar y
  aceptar responden 409 con "Tenés que tener 18 años o más para sumarte a un equipo". La
  edad es la declarada: el sistema no verifica identidad ni DNI.
- **Aceptar con una cuenta existente**: alcanzan el email y el código. Se agrega el
  registro `Empleado` si todavía no lo tiene y la relación con el comercio, sin pedir de
  nuevo datos ya cargados.
- Al aceptar, el sistema vuelve a validar la regla de combinaciones de roles (la persona
  pudo volverse Dueño o Administrador entre el envío y la aceptación).
- Después de aceptar, la persona va al login: el sistema no la loguea automáticamente.
- La relación entre el Empleado y el comercio nace al aceptar, ya en estado Activo, o se
  reactiva si ya existía (se reutiliza la misma fila).
- El código de la invitación admite como máximo 5 intentos fallidos; al quinto se
  invalida y el Dueño tiene que reenviar la invitación. Se acepta que quien conozca el
  email de un invitado pueda gastarle los intentos: el Dueño reenvía.
- Un código incorrecto, vencido o de una invitación ya no vigente recibe siempre la misma
  respuesta (401), sin decir cuántos intentos quedan, con el texto "El código es
  incorrecto o la invitación ya no está vigente. Pedí que te reenvíen la invitación."
- La pantalla de invitación prueba el código antes de pedir datos (paso "validar"). Recién
  después de verificar el código (quien llega hasta ahí ya lo probó, así que se le puede
  decir el motivo), el sistema aplica las mismas reglas que al aceptar y responde 409 sin
  consumir la invitación si: la cuenta existente está bloqueada, suspendida, inactiva o
  sin verificar (con el texto de regularización que corresponde), la cuenta es de un
  Dueño o un Administrador ("No se puede aceptar esta invitación con esta cuenta"), o el
  comercio no se puede aceptar ("Esta invitación ya no está disponible"). Con un código
  incorrecto sigue valiendo la respuesta 401 única, sin revelar nada de la cuenta.
- Se puede aceptar una invitación mientras el comercio esté Aprobado, Apto para Venta,
  Cerrado Temporalmente o Suspendido; no se puede si está Pendiente, Rechazado, con
  Rechazo Definitivo o Inactivo. (Para invitar, en cambio, el comercio tiene que estar
  Aprobado o Apto para Venta.)
- Reenviar y aceptar una invitación responden 200; no hay creación de recurso nuevo para
  quien las consume.
- Quien fue Empleado de un comercio, aunque su relación esté inactiva, no puede registrar
  un comercio con esa cuenta (ver Alcance y Limitaciones).

---

## Estados de la Relación con un Comercio

- En la base la relación tiene dos estados: **Activo** e **Inactivo**. No existe un estado
  "pendiente" de la relación: la fila no existe hasta que la invitación se acepta.
- Para el Dueño y para el Administrador la pantalla muestra además dos estados derivados
  de las invitaciones: **Pendiente** (invitación vigente) y **Vencida** (invitación
  pendiente con más de 7 días, calculada al consultar, sin un proceso automático).
- Pasa a Inactivo por baja del Dueño o por renuncia del propio Empleado; se registra el
  motivo (`BAJA_DUENO` o `RENUNCIA`), quién lo hizo y cuándo en el historial de la
  relación (`HistorialEmpleadoComercio`), sin motivo escrito.
- Reactivar: el Dueño puede reactivar directamente, sin código, la relación que él mismo
  dio de baja. Si el Empleado renunció, o si la invitación se canceló, hace falta una
  invitación nueva (que reutiliza la misma fila).
- Inactivar o reactivar la relación con un comercio no afecta las relaciones del Empleado
  con otros comercios, sean del mismo Dueño o de otros.

---

## Acceso a Comercios

- El Empleado puede operar, con su mismo login, todos los comercios donde tenga una
  relación Activa, sin restricción de que pertenezcan al mismo Dueño.
- Al iniciar sesión, si tiene al menos un comercio, ve un selector a pantalla completa con
  "Cliente" y cada comercio, y entra al contexto que elige (ver Requisitos Funcionales —
  Generales, sección Autenticación y selector de contexto). Dentro de un comercio ve el
  mismo panel y las mismas cuatro pestañas (Panel, Productos, Pedidos, Perfil) que el
  Dueño, con el distintivo "Empleado" debajo del nombre del comercio, con la campana de
  notificaciones del comercio abierto (con su contador), sin "Agregar comercio" ni avisos
  de cobro. Para cambiar de comercio o
  pasar a su cuenta de Cliente usa "Cambiar de cuenta" en su perfil.
- El selector del Empleado muestra los comercios donde su relación está Activa y el
  comercio es operativo (Aprobado o Apto para Venta), más los Suspendidos y los Cerrados
  Temporalmente con su estado y un aviso corto (se pueden elegir y entran en solo
  lectura). No aparecen los comercios Inactivos, de Rechazo definitivo, Pendientes ni
  Rechazados.
- Cuando el comercio no es operativo (Suspendido o Cerrado Temporalmente), lo que el
  Empleado puede hacer depende del estado de cada pedido:
  - **Pendiente de confirmación:** solo puede rechazarlo (con devolución inmediata del
    pago); no puede aceptarlo.
  - **En preparación:** puede despacharlo o anularlo.
  - **En camino:** no puede hacer nada. Lo confirma el Cliente o el sistema (aviso a los 75
    minutos y autoconfirmación a los 90).
  - **Listo para retirar:** puede entregarlo, o cerrarlo como No Retirado una vez cumplida
    la espera mínima (ver "Pedido no retirado").

  Sobre el catálogo y el perfil la regla depende del estado: con el comercio **Suspendido**
  no puede modificar productos, imágenes ni la descripción y el teléfono (responde conflicto
  409 con el código COMERCIO_SUSPENDIDO); con el comercio **Cerrado Temporalmente** sí puede
  hacerlo. En ambos estados no puede abrir ni cerrar el comercio (409 con el código
  COMERCIO_NO_OPERATIVO). Intentar aceptar un pedido nuevo responde 409 con el código
  COMERCIO_SIN_OPERACION. Con un comercio operativo cerrado a mano (la bandera de cierre
  manual encendida), el Empleado sí puede aceptar los pedidos pendientes: el cierre solo
  frena los pedidos nuevos de los Clientes. Rechazar, despachar, entregar y anular no
  tienen una regla propia del estado del comercio: las permite o no el estado de cada
  pedido, igual que para el Dueño. Por ahora el Dueño queda sin cambios en estos estados
  (puede, por ejemplo, editar productos y perfil con el comercio Suspendido: hueco conocido
  que se resuelve en el tramo de rediseño de la suspensión). Los cambios de estado de un
  comercio no tocan las relaciones de sus Empleados. *(Esta regla reemplaza a la del bloque
  A0b, donde rechazar con el comercio no operativo respondía 409; implementada en el bloque
  A2 de E3.)*
- Al desactivar su relación con un comercio, la próxima acción del Empleado sobre ese
  comercio responde "no encontrado" (404). La aplicación detecta la pérdida en esa acción
  o en el sondeo de cada 15 segundos y muestra, encima de la pantalla en la que está y
  bloqueando el fondo, una hoja con un candado tachado, el título "Ya no tenés acceso a
  este comercio", el texto "{nombre del comercio} te sacó del equipo." (o "El comercio te
  sacó del equipo." si no se conoce el nombre) y una segunda línea: "Elegí con qué cuenta
  seguir." si le quedan otros comercios, o "Se te redirigirá a tu cuenta de Cliente." si no
  le queda ninguno (también si no se pudo consultar). Al tocar "Entendido" (o al cerrar la
  hoja) va al selector de contexto o al inicio de Cliente, respectivamente. La hoja se
  muestra una sola vez aunque fallen varias llamadas a la vez; no hay una pantalla
  dedicada. Su sesión no se cierra.
- El servidor no revela por qué el Empleado no puede acceder a un comercio: un comercio
  que no existe, que es de otro Dueño, con el que no tiene relación Activa o que está en
  un estado al que no accede (Pendiente, Rechazado, Inactivo o Rechazo definitivo)
  responden exactamente lo mismo (404, mismo mensaje y mismo código). La relación se
  comprueba contra la base en cada solicitud, así que desactivarla corta el acceso en la
  solicitud siguiente, sin esperar a que venza ninguna sesión.
- Un Administrador no puede operar un comercio como Empleado (403), y el Dueño y el
  Administrador no tienen lista de "mis comercios" de Empleado.

> **Estado de implementación (tramo E2, entregas A y B, y tramo E3, bloque A2):** el servidor
> resuelve el comercio del Empleado y le abre cuatro lecturas: el perfil del comercio con un
> conjunto reducido de datos (nombre, foto, descripción, dirección del local, teléfono, email
> de contacto, tipo de comercio, modalidades de entrega, horarios, estado, si está abierto o
> cerrado manualmente, si puede cambiar el cierre y el texto de reapertura), la lista de
> productos, la lista de pedidos y el resumen de pedidos del día, estos dos últimos sin los
> cargos de servicio ni los datos de Mercado Pago (ver Permisos Delegados). **Desde el bloque
> A2 de E3 el servidor también le abre las 17 escrituras delegables** (productos e imágenes,
> descripción y teléfono, abrir y cerrar, y las cinco acciones sobre pedidos), con la relación
> revalidada dentro de cada operación, las reglas por estado del comercio descritas arriba y
> el actor real (Empleado) en todos los historiales; las pantallas con esas acciones llegan en
> la entrega B de E3 (las pantallas de pedidos llegaron en la etapa 1 y las de edición del
> comercio, productos y cierre en la etapa 2). La entrega B de E2 sumó las pantallas: selector
> de contexto después del login, "Cambiar de cuenta" en el perfil, y un panel (Panel con
> "Ventas de hoy", Productos, Pedidos y un Perfil con los datos operativos del comercio),
> con el reembolso de cada pedido en términos simples ("Reembolso en proceso", "Reembolsado"
> o "Reembolso en revisión", con el monto). Las notificaciones por comercio del Empleado
> llegan con el aviso al equipo (bloque A4, implementado): un Cliente que manda el comercio en la
> consulta de notificaciones se trata como Empleado de ese comercio (404 si no lo es) y
> recibe una copia propia de cada aviso operativo. Si en medio del uso pierde el acceso a un comercio (su relación
> se desactiva), la aplicación lo detecta en la próxima acción o en el sondeo de cada 15
> segundos, le muestra una hoja inferior "Ya no tenés acceso a este comercio" (con el nombre
> del comercio y el botón "Entendido") y, al cerrarla, lo lleva al selector, o al inicio de
> Cliente si no le queda ningún comercio. La pantalla de notificaciones y su campana llegaron
> en la etapa 3 de la entrega B de E3 (ver Notificaciones en Pantalla); la pérdida de acceso
> también se detecta ahí. Su perfil dentro de un
> comercio es una sola lista (Ver datos del comercio, Editar datos del comercio, Editar datos
> personales, Cambiar de cuenta y Cerrar sesión): para editar sus datos personales el
> Empleado pasa a su cuenta de Cliente (ver Edición del Comercio, Productos y Cierre en
> Pantalla).

---

## Permisos Delegados

Por cada comercio donde el Empleado tenga una relación Activa y el comercio sea operativo,
puede:

- Ver el perfil del comercio con un conjunto reducido de datos (nombre, foto, descripción,
  dirección del local, teléfono, email de contacto, tipo de comercio, modalidades de
  entrega, horarios y estado de apertura) y editar solo tres: la descripción, el teléfono
  y los horarios. El nombre, la foto, la dirección y el tipo de comercio son de solo
  lectura para el Empleado y los cambia únicamente el Dueño (el email de contacto y las
  modalidades de entrega también son de solo lectura: el Empleado los ve, no los cambia).
  La edición se hace por una ruta propia que solo acepta la descripción y el teléfono
  (cualquier otro campo, como el nombre o el email, da error de datos inválidos 400 y no
  cambia nada). El Empleado no ve la razón social, el CUIT, la condición de IVA, el tipo de
  sociedad, el domicilio fiscal, la fecha de inicio de actividades ni los datos del
  representante. La edición de horarios todavía no existe para nadie: hoy los horarios solo
  se cargan en el alta y en la corrección de un comercio rechazado; el Empleado la tendrá
  cuando exista.
- Abrir y cerrar el comercio manualmente (queda registrado con rol Empleado). Puede abrir un
  cierre manual aunque lo haya hecho el Dueño; solo dentro de un horario de atención y con
  el comercio operativo (si está Suspendido o Cerrado Temporalmente, o fuera de horario,
  responde conflicto 409).
- Crear, editar y gestionar la disponibilidad de los productos y sus imágenes
  (incluido descontinuarlos).
- Ver el historial de pedidos y las ventas del comercio. El Empleado ve lo necesario para
  operar y atender al cliente: el número y el estado del pedido, el nombre del cliente, la
  modalidad de entrega y la dirección, los ítems con cantidades y precios, el subtotal, el
  total que pagó el cliente, el motivo de un rechazo o una anulación y las fechas. También
  ve el estado del reembolso del pedido, solo para leer y en términos simples (sin
  reembolso, en proceso, reembolsado o en revisión) con el monto. No ve los cargos de
  servicio (ni el del cliente ni el del comercio), la comisión, el neto a cobrar por el
  comercio, ni ningún dato de MercadoPago o del detalle técnico de un reembolso. El
  contador del panel, que para el Empleado se llama "Ventas de hoy" (el Dueño ve
  "Facturado hoy"), suma el subtotal de los productos de los pedidos facturados, sin
  descontar el cargo de servicio del comercio (el Dueño ve esa misma suma ya neta); los
  contadores de pedidos de hoy y pendientes son los mismos para ambos.
- Aceptar, rechazar, despachar, entregar y anular pedidos. Las entregas de los pedidos En
  Camino no las confirma el comercio: las confirma el Cliente, o el sistema (aviso a los 75
  minutos y autoconfirmación a los 90). Al rechazar o anular un pedido ya pagado, la nota
  de crédito de la devolución se crea en la misma operación que el cambio de estado.
- En total son 18 escrituras delegables: 9 de productos (con imágenes y firmas de subida),
  3 de comercio (descripción y teléfono, cerrar y abrir) y 6 de pedidos (aceptar, rechazar,
  despachar, entregar, anular y, desde el tramo E3 bloque A4b, cerrar un retiro como No
  Retirado). El resto del perfil (edición completa, foto y su firma) es exclusivo del Dueño
  y el Empleado recibe 403.
- **Pedido no retirado.** Cuando un pedido de retiro quedó Listo para Retirar y el cliente
  no se presentó, el Empleado (y el Dueño) puede cerrarlo como No Retirado. Es un estado
  final que solo existe desde Listo para Retirar y solo en pedidos de retiro. No hay
  devolución: el comercio se queda con el pago, porque el pedido ya estaba preparado.
  "Entregado" queda reservado para entregas reales. Para cerrarlo tiene que haber pasado
  una espera mínima de 60 minutos desde que el pedido quedó Listo para Retirar (el valor es
  configurable); la espera aplica solo a este cierre: "Entregar" es inmediato. El Cliente
  ve el pedido como "No retirado", el pedido cuenta en "Facturado hoy" y el Cliente recibe
  la notificación T36.
- Recibir y ver las notificaciones operativas del comercio.

**Futuros delegables** (hoy no tienen endpoint): grupos de extras y extras. Se
clasificarán como delegables cuando existan. La edición de horarios también será delegable,
pero hoy no existe para nadie.

---

## Restricciones

El Empleado no tiene acceso, en ningún comercio, a las acciones exclusivas del Dueño
(ver Requisitos Funcionales — Dueño, sección Permisos Exclusivos del Dueño):

- No puede ver ni editar los datos fiscales o de persona jurídica del Dueño.
- No puede gestionar los enlaces a redes sociales del comercio.
- No puede cambiar el nombre, la foto, la dirección ni el tipo de comercio, ni el email de
  contacto ni las modalidades de entrega: los ve, pero no los edita.
- No puede ver ni usar nada de MercadoPago (vincular, desvincular, estado de la cuenta ni
  el enlace de pago de un pedido).
- No puede invitar, reenviar, cancelar invitaciones, desactivar ni reactivar a otros
  Empleados, ni ver la actividad del comercio.
- No puede dar de alta comercios adicionales ni corregir o re-solicitar un comercio
  rechazado.
- No puede acceder a la futura documentación de habilitación del comercio.

Todo endpoint o pantalla que no esté explícitamente clasificado como delegable queda
bloqueado para el Empleado por defecto.

---

## Pedidos en Pantalla

> **Estado de implementación:** tramo E3, entrega B, etapa 1.

- La lista de pedidos del comercio (y los "Pedidos activos" del panel) muestra cada pedido en una fila sin botones, con el cliente, el número, la cantidad de productos, la hora, el estado, el total y un chevron. Un pedido que el Empleado hizo como Cliente lleva además el chip "Tu pedido". Todas las acciones están dentro del detalle.
- Con el comercio Suspendido o Cerrado Temporalmente el Empleado ve arriba de la lista (y en el panel) el aviso "Comercio suspendido. No se aceptan pedidos nuevos." o "Comercio cerrado temporalmente. No se aceptan pedidos nuevos." El botón "Aceptar pedido" sigue habilitado: si el servidor lo rechaza, el motivo aparece en un aviso fijo.
- En el detalle de un pedido que no es propio, el Empleado tiene las mismas acciones que el Dueño según el estado: pendiente (aceptar, rechazar), en preparación (despachar o dejar listo, anular) y listo para retirar ("Entregar" y "Cerrar como no retirado"). Debajo ve el "Recorrido del pedido": una línea de tiempo con el texto de cada paso, la hora y "nombre, rol" de quien actuó (el sistema figura solo como "Sistema").
- "Entregar" está siempre habilitado. "Cerrar como no retirado" aparece apagado mientras no haya pasado la espera mínima, con la ayuda "Disponible en N min (desde las HH:mm)" que se actualiza sola; al cumplirse se habilita. Antes de cerrar, una confirmación avisa que no se devuelve el pago al Cliente.
- Cuando el servidor rechaza una acción por una regla de negocio (conflicto 409), el mensaje aparece en un aviso fijo rojo sobre los botones, que se queda hasta la próxima acción. Los demás errores se muestran como avisos temporales.

## Edición del Comercio, Productos y Cierre en Pantalla

> **Estado de implementación:** tramo E3, entrega B, etapa 2.

- En el perfil, la fila "Editar datos del comercio" abre una vista con dos campos editables, la descripción y el teléfono de contacto, y un botón "Guardar cambios". Debajo, bajo el título "Solo el Dueño puede cambiarlos", se muestran con un candado y sin posibilidad de edición el nombre, la foto, la dirección, el email de contacto y las modalidades de entrega. Al guardar solo se envían la descripción y el teléfono; si salió bien, la aplicación vuelve a la lista del perfil y avisa "Datos actualizados correctamente".
- El teléfono se valida en la pantalla (obligatorio y con formato argentino) antes de llamar al servidor. Si el servidor rechaza la edición por una regla de negocio (por ejemplo, con el comercio Suspendido), el mensaje aparece en un aviso fijo rojo dentro de la vista, que no se va solo.
- "Editar datos personales" ya no abre un formulario dentro del comercio: muestra una hoja con el título "Vas a pasar a tu cuenta personal" y los botones "Continuar" y "Cancelar". "Cancelar" cierra la hoja sin cambiar nada. "Continuar" pasa a la cuenta de Cliente y lleva al perfil de Cliente, donde el Empleado elige qué editar (datos personales, contraseña, foto). Dentro del comercio el Empleado ya no tiene "Cambiar contraseña".
- El Empleado ve el botón "+" de la lista de productos y el menú de cada producto (editar, marcar como agotado o disponible, descontinuar), y puede abrir el formulario de producto para crear o editar, con las mismas reglas que el Dueño. Con el comercio Cerrado Temporalmente puede editar productos; con el comercio Suspendido el servidor lo rechaza y el mensaje aparece en un aviso fijo (en la lista, en el formulario y también al pedir permiso para subir una foto, sin confundirse con el aviso del máximo de imágenes por producto).
- El panel del Empleado muestra el interruptor de cierre manual cuando el comercio está apto para vender y el servidor lo permite (dentro del horario de atención). Cerrar pide confirmación; abrir es directo; ambos quedan registrados con rol Empleado. Si el servidor rechaza el cambio por una regla de negocio, el mensaje aparece en un aviso fijo debajo del interruptor; un error de conexión sigue saliendo como aviso temporal.

## Notificaciones en Pantalla

> **Estado de implementación:** tramo E3, entrega B, etapa 3.

- En el panel del comercio el Empleado ve la campana en el encabezado, igual que el Dueño, con el contador de avisos sin leer del comercio que tiene abierto (el mismo valor que informa el servidor para ese comercio; "9+" a partir de diez). Al tocarla abre la pantalla de notificaciones sin salir del contexto del comercio.
- Cada contexto muestra solo lo suyo: dentro de un comercio el Empleado ve únicamente los avisos de ese comercio (los de su equipo), y en su cuenta de Cliente ve únicamente los avisos de sus propias compras, con su propia campana y contador. La campana de un contexto no cuenta los avisos del otro.
- En cada aviso de un pedido, "Ver pedido" lleva al detalle del pedido del comercio (el Cliente, al detalle de su pedido) y marca el aviso como leído; tocar el aviso entero hace lo mismo.
- En el encabezado de la pantalla hay un botón "Marcar todas" (también para el Dueño) que deja leídos todos los avisos del comercio abierto, solo los propios: no cambia los avisos del Dueño ni los de otros compañeros. Está apagado cuando no hay avisos sin leer y, si el servidor falla, muestra un aviso temporal y queda disponible. El Cliente, fuera de un comercio, no lo ve.
- Sin avisos, la pantalla dice "Te vamos a avisar acá cuando haya novedades en este comercio." dentro de un comercio, y "Te vamos a avisar acá cuando haya novedades sobre tus pedidos." en la cuenta de Cliente.
- Si el Empleado pierde la relación con el comercio, la pantalla de notificaciones muestra la hoja "Ya no tenés acceso a este comercio" en lugar de los avisos.

## Pedidos Propios

> **Estado de implementación:** la regla, la marca de la lista, la nota del detalle y la trazabilidad están implementadas (backend en el tramo E3, bloque A3; pantallas en la entrega B, etapa 1). Lo único que falta de esta sección es que el Empleado no reciba el aviso de "pedido nuevo" de su propio pedido: llega con el aviso al equipo del bloque A4.

En el detalle de su propio pedido el Empleado ve la nota "Hiciste este pedido como cliente. No podés gestionarlo desde acá.", sin botones y sin recorrido.

"Pedido propio" y "Tu pedido" significan siempre lo mismo: un pedido del que la persona que consulta es el Cliente. No tiene nada que ver con quién lo aceptó.

- Un Empleado puede hacer pedidos como Cliente en su propio comercio (el carrito y la
  confirmación del pedido no lo bloquean), pero no puede gestionar un pedido del que él mismo
  es el Cliente: aceptar, rechazar, despachar, entregar y anular responden `409` con el
  código `PEDIDO_PROPIO` y el mensaje "No podés gestionar tus propios pedidos". Se valida por
  el id del usuario, dentro de la transacción, después de bloquear el pedido y leyendo el
  Cliente de esa fila. Aplica solo al Empleado: el Dueño nunca es Cliente de su comercio.
- La regla se evalúa antes que el estado del pedido (un pedido propio en un estado que no
  corresponde a la acción también da `PEDIDO_PROPIO`). La única excepción es aceptar con el
  comercio suspendido o cerrado temporalmente, donde el aviso de comercio sin operación
  (`COMERCIO_SIN_OPERACION`) se evalúa antes, porque se comprueba antes de bloquear el pedido.
- La lista de pedidos y las respuestas de las cinco acciones, para el Empleado, traen el
  campo booleano `esPedidoPropio` (`true` cuando quien consulta es el Cliente del pedido). La
  pantalla muestra el pedido en su panel con la etiqueta "Tu pedido" y sin botones de
  gestión. El campo lo calcula el servidor y existe solo en la vista del Empleado: el Dueño y
  el Cliente no lo reciben.
- Cualquier otro Empleado, o el Dueño, puede gestionar ese pedido; y todos pueden actuar
  sobre un pedido que aceptó otra persona, sin restricción por quién lo aceptó.
- El Empleado que es el Cliente del pedido tampoco puede ver su trazabilidad: recibe el mismo
  `409` `PEDIDO_PROPIO`.
- No recibe la notificación de "pedido nuevo" (ni las de cancelación o expiración) de su propio pedido: como comprador recibe solo los avisos de un Cliente, en su campana personal (bloque A4, implementado).

---

## Trazabilidad

- El nombre de quien hizo cada cambio de estado de un pedido, y cada cierre o reapertura,
  se muestra en el detalle del panel del comercio (Dueño y Empleados), incluso si el
  Empleado ya está inactivo. El Cliente no ve qué empleado atendió su pedido.
- **Recorrido del pedido ("Atendido por").** El servidor ofrece `GET /api/v1/pedidos/comercio/{id}/trazabilidad`
  (bloque A3 del tramo E3; la pantalla se implementó en la entrega B, etapa 1), que devuelve, de la primera a
  la última, cada transición del pedido con su estado, la hora, un texto legible ("Aceptó el
  pedido"), el rol y el nombre y apellido de quien actuó y, en el rechazo y la anulación, el
  motivo. Lo ven el Dueño y todos los Empleados activos del comercio (con el comercio
  indicado en `X-Comercio-Id`). Reglas de visibilidad iguales a las de la actividad: no
  aparece el pedido todavía no pagado ni su vencimiento por falta de pago; el sistema va
  sin nombre; el Cliente figura con su nombre y apellido; el Dueño figura con su nombre y
  apellido, sin ningún otro dato. No lleva ids de usuario ni datos personales (DNI,
  teléfono, email), ni cargos de servicio ni datos de pago. Un pedido de otro comercio,
  inexistente o que nunca se pagó responde `404`; un Cliente sin relación con el comercio
  recibe `400` (sin header) o `404` `COMERCIO_NO_DISPONIBLE` (con header), nunca la trazabilidad;
  el Administrador recibe `403`. Es una lectura sin bloqueos: si el pedido cambia de estado
  mientras se lee, la respuesta muestra el recorrido de antes o el de después, nunca uno a medias.
- Las altas, ediciones, bajas y cambios de estado de productos, imágenes, perfil y
  horarios, hechos por el Dueño o por un Empleado, quedan en el registro de ediciones del
  comercio (`HistorialEdicionComercio`), sin guardar valores anteriores. Cada fila guarda el
  nombre de la entidad tal como estaba en ese momento, pero no el nombre de quien actuó: se
  lee del usuario. Los pedidos y los cierres y aperturas no se registran ahí, porque ya
  tienen su propio historial (`HistorialEstadoPedido` e `HistorialCierreComercio`). La
  pestaña Actividad de "Ver equipo" junta en una sola lista, ordenada por fecha, esas tres
  fuentes; de los pedidos entra todo lo que el comercio vio, sea quien sea el actor (las
  personas del comercio, el Cliente y el sistema), desde la llegada del pedido ya pagado
  ("Pedido recibido"), sin el pedido que todavía no se pagó ni el que venció por falta de
  pago. El Empleado no ve esa pestaña: la ve el Dueño (tramo E3) y el Administrador, en
  solo lectura (tramo E4). El servidor ya registra las ediciones del Dueño y ya ofrece la
  lista (`GET /api/v1/comercios/equipo/actividad`, solo Dueño; bloque A1 del tramo E3); las
  ediciones de un Empleado se registran con el rol Empleado cuando se habiliten sus
  escrituras (bloques A2 y A3), y la pestaña en pantalla llega en la entrega B.

---

## Notificaciones

- Cada Empleado Activo recibe las notificaciones operativas del comercio (pedido nuevo
  T1, pedido cancelado por el cliente T9, pedido expirado sin respuesta T13 y el aviso de
  pedido autoconfirmado T30, cuando el sistema confirma solo la entrega de un pedido a
  domicilio porque el Cliente no respondió en el plazo configurado, 90 minutos por defecto). No recibe las administrativas (aprobación,
  rechazo, suspensión) ni las de cobro.
- Cada Empleado tiene su propia copia de cada aviso: que otro lo lea (o el Dueño) no cambia
  el suyo, y viceversa. Solo ve los avisos posteriores a su alta o reactivación: al activarlo
  o reactivarlo se borran sus avisos anteriores de ese comercio. Si lo desactivan, deja de
  recibir avisos nuevos y de ver los del comercio (recibe el mismo 404 de siempre). Si trabaja
  en varios comercios, ve en cada uno solo los avisos de ese comercio (bloque A4, implementado).
- El listado y el contador de notificaciones del contexto Cliente quedan separados de los
  del comercio: sin comercio abierto, el Cliente ve solo las suyas como cliente.
- Cuando el comercio cierra como No Retirado un pedido de retiro (el Dueño o un Empleado, o
  el sistema al vencer el plazo de un comercio suspendido), el Cliente recibe la notificación
  T36 ("Tu pedido #12 no fue retirado y el comercio lo cerró. Como ya estaba preparado, no
  hay devolución del pago."); el equipo no recibe copia. Implementado en el tramo E3, bloque
  A4b; reemplaza a la fuente de entrega `COMERCIO_SIN_RETIRO`, que deja de ser necesaria.
  Si el cierre manual se intenta antes de la espera mínima, el Empleado recibe un 409 con el
  código RETIRO_EN_ESPERA, los minutos que faltan y la hora desde la que se puede.
- Al desactivarlo el Dueño, el Empleado recibe la notificación T32. Cuando renuncia, el
  Dueño recibe una notificación equivalente (T34). Cuando el invitado acepta, el Dueño
  recibe T33.

---

## Renuncia

- El Empleado puede dejar de trabajar en un comercio desde un botón "Dejar de trabajar en
  este comercio", con doble confirmación. La relación pasa a Inactivo con motivo
  `RENUNCIA`, el Dueño recibe una notificación y la renuncia queda en el historial. Para
  volver hace falta una invitación nueva.

---

## Sesiones

- Cada Empleado es un Usuario independiente con su propio login. Dos Empleados operando
  comercios distintos en simultáneo son sesiones de usuarios distintos.
- Sesión única por usuario, también para quien es Cliente y Empleado: iniciar sesión en
  otro dispositivo cierra la sesión del anterior en ambos contextos. El selector de
  contexto lo comunica.
- El perfil del Empleado dentro de un comercio es una sola lista de filas, sin títulos de
  sección: "Ver datos del comercio" (descripción, dirección, teléfono, horarios y estado,
  sin datos fiscales ni legales), "Editar datos del comercio" (descripción y teléfono),
  "Editar datos personales", "Cambiar de cuenta" y "Cerrar sesión". Los datos personales
  (nombre, apellido, teléfono, nombre de usuario), el cambio de contraseña y la foto de perfil
  personal se editan desde la cuenta de Cliente: "Editar datos personales" muestra antes una
  hoja "Vas a pasar a tu cuenta personal" y, al continuar, lleva al perfil de Cliente.
