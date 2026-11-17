# Requisitos Funcionales — Administrador

---

## Gestión de Comercios

- El administrador debe poder visualizar comercios pendientes de aprobación con sus datos de registro.
- El administrador debe poder ver todos los comercios de la plataforma, sin importar su estado (Pendiente, Aprobado, Apto para Venta, Rechazado, Rechazo Definitivo, Suspendido, Cerrado Temporalmente e Inactivo), en un listado general. Cada comercio muestra una etiqueta con su estado actual, su localidad, su Dueño titular y si ese Dueño tiene MercadoPago vinculado, y se ordena el listado por nombre. Desde el detalle de cualquier comercio puede abrir su equipo ("Ver equipo"). "Suspender" se ofrece cuando el comercio está Aprobado, Apto para Venta o Cerrado Temporalmente, y "Levantar suspensión" cuando está suspendido por el Administrador. Las pantallas de solicitudes pendientes y de re-solicitudes siguen mostrando únicamente los comercios que esperan su resolución. Un comercio cerrado a mano por su Dueño sigue en su estado (Aprobado o Apto para Venta) y aparece con ese estado.
- El administrador debe poder aprobar un comercio, lo que lo deja Aprobado. El comercio pasa a Apto para Venta (visible en el catálogo y habilitado para recibir pedidos) cuando su Dueño tiene la cuenta de MercadoPago vinculada y el comercio tiene al menos un documento aprobado y ningún documento en revisión; mientras no lo cumpla queda Aprobado, sin vender. No se puede aprobar un comercio pendiente cuyo Dueño tiene la cuenta suspendida (sí se puede rechazar). El sistema registra la transición de estado en el historial de estados del comercio (HistorialEstadoComercio).
- El administrador debe poder rechazar un comercio ingresando un motivo. El sistema registra la transición de estado en el historial.
- El administrador debe poder suspender un comercio aprobado, apto para venta o cerrado temporalmente ingresando un motivo de 10 a 500 caracteres (el Dueño lo ve). La suspensión es una acción sobre ese comercio puntual: cambia su estado a Suspendido sin afectar la cuenta del Dueño ni sus demás comercios, es indefinida, y registra en el historial la transición con el administrador, el motivo y el origen (individual o por la suspensión del Dueño). Suspender no modifica ningún pedido en el momento por sí mismo salvo el rechazo automático de los pedidos pendientes de confirmación: los demás pedidos siguen las reglas del sistema para un comercio suspendido (ver Requisitos Funcionales — Sistema).
- Antes de suspender, el administrador ve qué va a pasar con el comercio y con sus pedidos: deja de aparecer en el catálogo y la cantidad de pedidos pendientes de confirmación ("se rechazan ahora y se reembolsan. No se puede deshacer."), en preparación, listos para retirar, en camino y sin pagar, cada uno con lo que le va a pasar (solo se muestran los estados que tienen pedidos). Suspender individualmente un comercio ya suspendido por la suspensión de su Dueño es válido: pasa a una suspensión propia, que conserva la fecha original y sigue aunque se levante la del Dueño.
- El detalle de un comercio suspendido muestra el estado, desde cuándo está suspendido y el motivo.
- El administrador debe poder levantar la suspensión de un comercio, con un mensaje opcional de hasta 500 caracteres que recibe el Dueño. La ventana explica que el comercio vuelve a vender si el Dueño tiene cuenta de cobro activa y documentación aprobada; si no, queda Aprobado sin poder vender, y si cumple pero la cuenta del Dueño está bloqueada queda Cerrado Temporalmente. El cierre manual no se modifica. Un comercio suspendido por la suspensión de su Dueño no se levanta individualmente: el botón está deshabilitado y el detalle explica que hay que levantar la suspensión del Dueño (con un enlace a su fila); y mientras el Dueño siga suspendido tampoco se puede levantar un comercio suspendido por separado.
- Mientras un comercio está suspendido ningún otro evento (aprobar o rechazar documentos, vincular la cuenta de cobro, bloquear o restaurar la cuenta del Dueño, abrir o cerrar) lo saca de ese estado: solo lo levanta el Administrador.
- Si el email de aviso al Dueño (suspensión o levantamiento) falló, el detalle lo indica ("No se envió el email") y permite reenviar el último.
- El sistema debe registrar un historial de estados de cada comercio (HistorialEstadoComercio): por cada transición de estado, fecha y hora, estado de origen, estado resultante, motivo (cuando aplica), origen de la suspensión (cuando aplica) y administrador responsable (vacío cuando la transición es automática del sistema). No existe una columna de tipo de acción: aprobación, rechazo, suspensión o reactivación se deducen del estado resultante. Ver Alcance y Limitaciones — Limitaciones Conocidas de Implementación para las transiciones que hoy no registran historial.

---

## Ver Equipo de un Comercio

> **Estado de implementación:** implementado, tramo E4 (backend en el bloque A3, pantallas en la entrega B3). Ver `docs/DECISIONES.md`, 2026-10-15.

- El administrador debe poder ver el equipo de cualquier comercio, en cualquier estado del comercio, desde el modal de detalle del comercio en el listado de comercios, mediante un botón "Ver equipo" que se muestra arriba de "Suspender" (o "Levantar suspensión") y "Cerrar". El modal muestra además un resumen del equipo ("N activos · N inactivos").
- La vista del equipo es de solo lectura y tiene dos pestañas:
  - **Miembros:** los filtros "Activos" (por defecto) e "Inactivos", cada uno con su cantidad. Cada miembro muestra su nombre, su email y desde cuándo está en el equipo. Un miembro inactivo muestra el motivo de su baja y la fecha: "Dado de baja por el dueño" o "Dejó de trabajar en el comercio"; si no hay registro de la baja, solo "Inactivo".
  - **Solicitudes:** las invitaciones que el dueño envió y que todavía no se respondieron, con el email, la fecha de envío y cuándo vencen ("Vence en N días", "Vence hoy"); también se muestran las vencidas y las que tienen el código bloqueado.
- El administrador puede abrir la actividad del comercio desde el botón "Actividad" de esa vista: la lista cronológica de lo que pasó en el comercio, con los filtros Todo, Pedidos, Ediciones, Cierres y Equipo (invitaciones, aceptaciones, bajas, renuncias y reactivaciones), con quién actuó y su rol.
- El administrador no tiene controles sobre las cuentas de usuario desde esas pantallas: no invita, no desactiva ni reactiva empleados, ni cancela o reenvía invitaciones. Cualquier otro rol que intente abrir estas pantallas o consultar estos datos es rechazado.

---

## Gestión de Usuarios

- El administrador debe poder suspender la cuenta de un cliente (un Empleado es un cliente) ingresando un motivo de 10 a 500 caracteres que la persona ve. La suspensión es indefinida, cierra de inmediato todas sus sesiones y prevalece sobre un bloqueo previo. No se puede suspender a un Administrador ni a uno mismo. Al confirmar, los pedidos sin pagar del cliente se cancelan y los ya pagados siguen su curso.
- El administrador debe poder levantar la suspensión de un cliente, con un mensaje opcional de hasta 500 caracteres. La cuenta vuelve al estado que tenía antes de la suspensión (una cuenta bloqueada vuelve activa, una pendiente de verificar vuelve pendiente, una inactiva vuelve inactiva). El modal muestra a qué estado vuelve.
- El administrador debe poder suspender y levantar la suspensión de la cuenta de un Dueño, con las mismas reglas de motivo y mensaje. Antes de confirmar ve, por cada comercio del Dueño, si se suspende o queda como está y por qué (ya estaba suspendido por separado, todavía no está aprobado, fue rechazado o está inactivo), cuántos pedidos tiene por estado, cuántos Empleados activos tiene y qué va a pasar con sus pedidos. Al confirmar: la cuenta pasa a suspendida y se cierra su sesión; sus comercios aprobados, aptos para vender o cerrados temporalmente pasan a suspendidos; los pedidos pendientes de confirmación se rechazan y se reembolsan en el acto; los que están en preparación o listos para retirar los atiende su equipo con un tope de 90 minutos o, si el comercio no tiene ningún Empleado activo, se anulan o cancelan ahora con reembolso total; los que están en camino siguen igual. Al levantar, la cuenta vuelve al estado que tenía y solo se restauran los comercios que esa suspensión había suspendido (cada uno según tenga cuenta de cobro y documentos aprobados); los comercios suspendidos por separado siguen suspendidos y los pedidos ya rechazados, anulados o cancelados no se restauran.
- La pantalla "Dueños" muestra a todos los Dueños con su estado, cuántos comercios tienen y, si están suspendidos, desde cuándo y por qué; tiene buscador por nombre o email y filtros Todos, Suspendidos, Bloqueados e Inactivos, y se carga de a 30 con "Ver más". La pantalla "Clientes" tiene el mismo formato. Desde el menú de cada fila el administrador suspende, levanta la suspensión, reactiva una cuenta inactiva o reenvía el email de aviso si falló.
- El administrador debe poder reactivar una cuenta inactiva (de un Cliente o de un Dueño) desde su fila. Antes de confirmar ve qué va a pasar ("Podrá ingresar y comprar de nuevo.", "Se anota en su historial que la reactivaste vos.") y, para un Dueño, "Se restablecen N de M comercios", cuáles vuelven y cuál sigue suspendido ("Se suspendió aparte. Hay que levantarlo desde su ficha.").
- El administrador no recibe avisos ni campana: el panel muestra contadores de lo que espera su atención (ver Panel del Administrador).

---

## Gestión de Categorías

- El administrador debe poder crear, editar y eliminar categorías para clasificación de productos.
- Las categorías del administrador son las únicas disponibles para clasificar productos.
- Cada categoría tiene un atributo `activo` (booleano). Solo las categorías activas pueden asignarse a productos nuevos o editados.
- No es posible eliminar una categoría que tenga productos asociados (activos o históricos). El administrador debe primero desactivarla o reasignar los productos.
- El error de duplicado en creación o edición debe indicar específicamente si el nombre ya existe como categoría.

---

## Gestión de Tags

- El administrador debe poder crear, editar y eliminar tags para descripción de productos.
- Los tags del administrador son los únicos disponibles para etiquetar productos.
- Cada tag tiene un atributo `activo` (booleano). Solo los tags activos pueden asignarse a productos nuevos o editados.
- No es posible eliminar un tag que tenga productos asociados (activos o históricos).
- El error de duplicado en creación o edición debe indicar específicamente si el nombre ya existe como tag.

---

## Supervisión General

- El administrador debe poder visualizar el listado completo de comercios registrados con: nombre, tipo, estado actual, fecha de registro, Dueño titular y si ese Dueño tiene MercadoPago vinculado.
- El administrador debe poder visualizar el listado completo de clientes y de Dueños registrados con: nombre, estado actual (y, si está suspendido, desde cuándo y por qué) y fecha de registro.
- Los listados deben soportar filtros por estado y búsqueda por nombre.

---

## Panel del Administrador

- El panel resume lo que espera la atención del administrador con contadores: comercios pendientes, re-solicitudes, documentos pendientes de revisión, consultas de Soporte que esperan su respuesta, reclamos pendientes y reembolsos para revisar. Lo pendiente aparece primero (al abrir el panel, sin moverse después) y los números se actualizan solos cada 30 segundos mientras la pestaña se ve. No hay avisos ni campana para el administrador.
- En escritorio (1024 px o más) el panel tiene una barra lateral permanente con las secciones (Comercios pendientes, Re-solicitudes, Documentos, Soporte, Reclamos, Reembolsos, Clientes, Dueños, Comercios, Categorías, Tags y Tarifas) con insignias de pendientes, listas como tablas y paneles de detalle; el botón "Volver" lleva siempre a la lista de la que se viene. En móvil todas las funciones se mantienen.

---

## Configuración de Tarifas de Servicio

- El administrador debe poder visualizar y configurar las tarifas de servicio de la plataforma: cargo al cliente y cargo al comercio por pedido procesado.
- Un cambio de tarifa entra en vigencia de forma inmediata (NOW()) y aplica únicamente a los nuevos pedidos creados a partir de ese momento. Los pedidos ya existentes conservan la tarifa que tenían al momento de su creación.
- El sistema debe registrar un historial de cambios de tarifas en la entidad `ConfiguracionTarifa`: cada registro incluye `fecha_vigencia`, `cargo_cliente`, `cargo_comercio` y el identificador del administrador que realizó el cambio. El registro vigente en un momento dado es siempre el de mayor `id` (equivalente al de mayor `fecha_vigencia`).
- Antes de guardar una tarifa nueva, el sistema abre una confirmación que muestra la tarifa vigente y la nueva ("Cargo al cliente: $200 → $250", "Cargo al comercio: 1% → 3%") y explica: "Se aplica a los pedidos que se confirmen desde ahora. Los pedidos ya creados conservan la tarifa con la que se confirmaron." y "Si un cliente está por confirmar su pedido, va a ver el total actualizado antes de pagar.". Un cliente que confirma con el total anterior recibe el aviso de precio cambiado.

---

## Gestión de Reclamos

- El administrador ve la cantidad de reclamos pendientes en el panel (no recibe un aviso). La bandeja de reclamos tiene tres filtros con contador: pendientes (los más viejos primero, con "hace cuánto"), con reembolso en proceso y resueltos.
- El administrador debe poder ver el detalle de un reclamo: el pedido, el cliente y el comercio involucrados, el mensaje del cliente, los productos, el saldo reembolsable, las fotos adjuntas (hasta 3, miniaturas que se amplían en un visor) y, si Mercado Pago no pudo hacer un reembolso, el motivo y un enlace a Reembolsos para reintentar. Solo el administrador ve las fotos.
- El administrador debe poder resolver un reclamo pendiente de tres maneras, siempre con una confirmación que avisa que no se puede deshacer y sin poder reabrirlo: reembolso total (lo que quede por reembolsar del pago), reembolso parcial (un monto mayor que cero y menor que el saldo reembolsable, con hasta dos decimales; si es igual al saldo se pide el total) o rechazo con un motivo de 10 a 500 caracteres.
- Un reembolso (total o parcial) genera una nota de crédito con motivo reclamo, ligada al reclamo, y se pide a Mercado Pago con la cuenta del Dueño. Si falla (por ejemplo, sin saldo) el reclamo queda aprobado con el reembolso en proceso y el administrador reintenta desde Reembolsos. Nunca se generan dos notas ni dos reembolsos por un reclamo, aunque haya varios administradores o pestañas.
- El cliente recibe un aviso dentro de la app y un email al resolverse (con el monto, o con el motivo del rechazo). El Dueño recibe un aviso solo cuando hubo reembolso. El Empleado no ve el reclamo.

---

## Gestión de Reembolsos

- El administrador debe poder ver los reembolsos que requieren su revisión (los que Mercado Pago no pudo procesar o que nacieron sin una cuenta de cobro activa) con su motivo en lenguaje claro: rechazo del comercio, cancelación del cliente, anulación del comercio, suspensión del comercio, sin respuesta del comercio, suspensión de cuenta, pago tardío o reclamo. Puede reintentar la devolución.

---

## Revisión de Documentos de Comercios

- El administrador debe poder ver la bandeja de documentos de habilitación pendientes de revisión (del más antiguo al más nuevo) y revisarlos en una pantalla por comercio, con el resto de los documentos de ese comercio, el estado de su cuenta de MercadoPago y un visor del archivo (PDF, JPG, PNG o WebP; nunca con un token en la dirección).
- El administrador debe poder aprobar un documento pendiente, rechazarlo con un motivo (de hasta 255 caracteres) o revocar uno ya aprobado, también con motivo. Un documento rechazado no se vuelve a resolver: el Dueño sube uno nuevo. Con cualquier documento aprobado alcanza para la aptitud de venta; no hay una lista de tipos obligatorios.
- Puede aprobar, rechazar y revocar documentos de un comercio suspendido; eso no cambia su estado.
- El Dueño recibe un aviso dentro de la app cuando se aprueba o rechaza un documento y cuando su comercio pasa a ser apto para vender o deja de serlo; no recibe email.

---

## Soporte

- El administrador debe poder ver la bandeja de consultas de Soporte, con los filtros Esperan, Respondidas y Cerradas (cada uno con su cantidad; las que esperan, primero y las más viejas arriba). Cada consulta muestra el tipo, el email, hace cuánto y las marcas "Cuenta suspendida" y "No se envió el email". En escritorio la lista está a la izquierda y la conversación a la derecha.
- El detalle de la consulta muestra la conversación completa y, si el email coincide con un usuario, su cuenta asociada (nombre, estado, rol y si es Empleado) con "Ver cuenta" (lleva a la ficha en Clientes o en Dueños).
- La conversación es por turnos: habla primero la persona y cada mensaje pasa el turno; el administrador solo responde cuando le toca. Al llegar a 20 mensajes la consulta se cierra sola. Solo Soporte cierra una consulta (con confirmación). Si el email de una respuesta no salió, el administrador puede reenviarlo.
- Es el camino para que una persona o un comercio suspendido, rechazado o inactivo pida revisión: el administrador decide levantar la suspensión desde la ficha correspondiente o mantenerla, y se lo responde por Soporte.

---

## Gestión de Re-solicitudes

- El sistema no genera una notificación al administrador cuando un comercio rechazado envía una nueva solicitud de revisión (re-solicitud): la re-solicitud aparece en su propia bandeja, separada de las solicitudes nuevas, y el panel cuenta las dos por separado.
- El administrador debe poder visualizar las re-solicitudes pendientes con el detalle completo del comercio (datos fiscales incluidos), el número de intento sobre el máximo permitido (3 por comercio), el motivo del rechazo anterior y los datos que el Dueño cambió respecto de lo rechazado (valor anterior y nuevo).
- Al rechazar un comercio, el administrador puede indicar que el rechazo es definitivo: el comercio queda en estado Rechazo definitivo, sin posibilidad de corrección ni de nueva solicitud. Si rechaza una re-solicitud y el comercio ya usó todas las que tenía, el sistema lo pasa a rechazo definitivo por sí mismo.
- Al rechazar cualquier solicitud (nueva o re-solicitud), el modal de rechazo incluye un interruptor "Rechazo definitivo". Cuando se rechaza una re-solicitud que es el último intento, el modal avisa que el rechazo será definitivo y el interruptor queda activado y bloqueado.
- En la bandeja de re-solicitudes, cada una muestra el comercio, la fecha y "Intento N de 3"; su detalle muestra el motivo del rechazo anterior, una tarjeta por dato cambiado (antes y ahora; la foto, lado a lado) y, plegado, los datos que no cambiaron.
- El listado general de comercios incluye los rechazados y los de rechazo definitivo con su etiqueta de estado; no hay una pantalla propia ni un filtro por estado para encontrarlos entre los demás.
