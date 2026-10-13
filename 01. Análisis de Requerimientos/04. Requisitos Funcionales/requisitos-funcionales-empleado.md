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
  Dueño, con el distintivo "Empleado" debajo del nombre del comercio, sin campana de
  notificaciones, sin "Agregar comercio" ni avisos de cobro. Para cambiar de comercio o
  pasar a su cuenta de Cliente usa "Cambiar de cuenta" en su perfil.
- El selector del Empleado muestra los comercios donde su relación está Activa y el
  comercio es operativo (Aprobado o Apto para Venta), más los Suspendidos y los Cerrados
  Temporalmente con su estado y un aviso corto (se pueden elegir y entran en solo
  lectura). No aparecen los comercios Inactivos, de Rechazo definitivo, Pendientes ni
  Rechazados.
- Cuando el comercio no es operativo (Suspendido o Cerrado Temporalmente), el Empleado
  puede terminar lo que ya estaba en marcha: despachar, entregar (también un pedido Listo
  para Retirar) y anular los pedidos ya aceptados. No acepta pedidos nuevos, no toca
  productos ni el perfil, y no abre ni cierra el comercio. El servidor lo hace cumplir con
  un error de conflicto (409). Las entregas de los pedidos En Camino no las confirma el
  comercio: las confirma el Cliente o el sistema (aviso a los 75 minutos y autoconfirmación
  a los 90). Por ahora el Dueño queda sin cambios en estos estados; la diferencia entre el
  Dueño y el Empleado se resuelve en el tramo de rediseño de la suspensión. Los cambios de
  estado de un comercio no tocan las relaciones de sus Empleados.
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

> **Estado de implementación (tramo E2, entregas A y B):** el servidor ya resuelve el comercio
> del Empleado y le abre cuatro lecturas: el perfil del comercio con un conjunto reducido
> de datos (nombre, foto, descripción, dirección del local, teléfono, tipo de comercio,
> modalidades de entrega, horarios, estado, si está abierto o cerrado manualmente, si puede
> cambiar el cierre y el texto de reapertura), la lista de productos, la lista de pedidos y
> el resumen de pedidos del día, estos dos últimos sin los cargos de servicio ni los datos
> de Mercado Pago (ver Permisos Delegados). Las acciones (editar, abrir y cerrar, gestionar productos y
> pedidos) siguen cerradas al Empleado hasta el tramo E3. La entrega B de E2 suma las
> pantallas: selector de contexto después del login, "Cambiar de cuenta" en el perfil, y un
> panel de solo lectura (Panel con "Ventas de hoy", Productos y Pedidos sin acciones, y un
> Perfil con los datos operativos del comercio), con el reembolso de cada pedido en
> términos simples ("Reembolso en proceso", "Reembolsado" o "Reembolso en revisión", con el
> monto). Las notificaciones por comercio del Empleado quedan para E3: hasta entonces el
> Empleado no ve la campana dentro de un comercio. Si en medio del uso pierde el acceso a
> un comercio (su relación se desactiva), la aplicación lo detecta en la próxima acción o
> en el sondeo de cada 15 segundos, le muestra una hoja inferior "Ya no tenés acceso a este
> comercio" (con el nombre del comercio y el botón "Entendido") y, al cerrarla, lo lleva al
> selector, o al inicio de Cliente si no le queda ningún comercio. Su perfil dentro de un
> comercio es una sola lista (Ver datos del comercio, Editar datos personales, Cambiar
> contraseña, Cambiar de cuenta y Cerrar sesión): los datos personales y la contraseña se
> editan dentro del mismo layout del comercio, sin pasar por las pantallas de Cliente.

---

## Permisos Delegados

Por cada comercio donde el Empleado tenga una relación Activa y el comercio sea operativo,
puede:

- Ver el perfil del comercio con un conjunto reducido de datos (nombre, foto, descripción,
  dirección del local, teléfono, email de contacto, tipo de comercio, modalidades de
  entrega, horarios y estado de apertura) y editar solo tres: la descripción, el teléfono
  y los horarios. El nombre, la foto, la dirección y el tipo de comercio son de solo
  lectura para el Empleado y los cambia únicamente el Dueño (el email de contacto y las
  modalidades de entrega también quedan de solo lectura). El Empleado no ve la razón
  social, el CUIT, la condición de IVA, el tipo de sociedad, el domicilio fiscal, la fecha
  de inicio de actividades ni los datos del representante. (Hasta el tramo E3 el Empleado
  ve todos esos datos salvo el email de contacto. La edición de horarios todavía no existe
  para nadie: hoy los horarios solo se cargan en el alta y en la corrección de un comercio
  rechazado; el Empleado la tendrá cuando exista.)
- Abrir y cerrar el comercio manualmente (queda registrado con rol Empleado).
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
- En total son 17 escrituras delegables: 9 de productos (con imágenes y firmas de subida),
  3 de comercio (perfil, cerrar y abrir) y 5 de pedidos.
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

## Pedidos Propios

- Un Empleado puede hacer pedidos como Cliente en su propio comercio, pero no puede
  gestionar sus propios pedidos (se valida por el id del usuario): el pedido aparece en su
  panel con la etiqueta "Tu pedido" y sin botones de gestión, lo gestionan el Dueño u otro
  Empleado, no recibe la notificación de "pedido nuevo" de su propio pedido y, si intenta
  gestionarlo, ve "No podés gestionar tus propios pedidos".

---

## Trazabilidad

- El nombre de quien hizo cada cambio de estado de un pedido, y cada cierre o reapertura,
  se muestra en el detalle del panel del comercio (Dueño y Empleados), incluso si el
  Empleado ya está inactivo. El Cliente no ve qué empleado atendió su pedido.
- Las altas, ediciones, bajas y cambios de estado de productos, imágenes, perfil y
  horarios, hechos por el Dueño o por un Empleado, quedan en el registro de ediciones del
  comercio (`HistorialEdicionComercio`), sin guardar valores anteriores. Cada fila guarda el
  nombre de la entidad tal como estaba en ese momento, pero no el nombre de quien actuó: se
  lee del usuario. Los pedidos y los cierres y aperturas no se registran ahí, porque ya
  tienen su propio historial (`HistorialEstadoPedido` e `HistorialCierreComercio`). La
  pestaña Actividad de "Ver equipo" junta en una sola lista, ordenada por fecha, esas tres
  fuentes. El Empleado no ve esa pestaña: la ve el Dueño (tramo E3) y el Administrador, en
  solo lectura (tramo E4).

---

## Notificaciones

- Cada Empleado Activo recibe las notificaciones operativas del comercio (pedido nuevo
  T1, pedido cancelado por el cliente T9, pedido expirado sin respuesta T13 y, al final del
  tramo E3, el aviso de pedido autoconfirmado T30). No recibe las administrativas (aprobación,
  rechazo, suspensión) ni las de cobro.
- El listado y el contador de notificaciones del contexto Cliente quedan separados de los
  del comercio: el Cliente ve solo las suyas como cliente.
- **Pendiente, no implementado (tramo E3, bloque A4):** avisar al Cliente cuando el comercio
  cierra un pedido de retiro porque el cliente no se presentó. Ese cierre hoy no existe en
  el código: la fuente de entrega `COMERCIO_SIN_RETIRO` está en la base pero ningún
  endpoint la usa (el comercio solo confirma la entrega con la fuente `COMERCIO`).
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
  sin datos fiscales ni legales), "Editar datos personales", "Cambiar contraseña", "Cambiar
  de cuenta" y "Cerrar sesión". Los datos personales (nombre, apellido, teléfono y nombre de
  usuario) y el cambio de contraseña usan las mismas reglas y mensajes que el perfil del
  Cliente, pero se abren dentro del layout del comercio, con la barra inferior del
  comercio. La foto de perfil personal se cambia desde la cuenta de Cliente (Cambiar de
  cuenta).
