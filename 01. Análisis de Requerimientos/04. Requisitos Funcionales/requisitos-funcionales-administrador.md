# Requisitos Funcionales — Administrador

---

## Gestión de Comercios

- El administrador debe poder visualizar comercios pendientes de aprobación con sus datos de registro.
- El administrador debe poder aprobar un comercio, habilitándolo para operar y recibir pedidos. El sistema registra la transición de estado en el historial de estados del comercio (HistorialEstadoComercio).
- El administrador debe poder rechazar un comercio ingresando un motivo. El sistema registra la transición de estado en el historial.
- El administrador debe poder suspender un comercio activo ingresando un motivo. La suspensión es una acción sobre ese comercio puntual: cambia su estado a Suspendido sin afectar la cuenta del Dueño ni sus demás comercios, desencadena la cancelación de pedidos activos de ese comercio según las reglas del sistema, y registra la transición de estado en el historial.
- El administrador debe poder levantar la suspensión de un comercio, restaurando su estado a Aprobado. El sistema registra la transición de estado en el historial.
- El sistema debe registrar un historial de estados de cada comercio (HistorialEstadoComercio): por cada transición de estado, fecha y hora, estado de origen, estado resultante, motivo (cuando aplica) y administrador responsable (vacío cuando la transición es automática del sistema). No existe una columna de tipo de acción: aprobación, rechazo, suspensión o reactivación se deducen del estado resultante. Ver Alcance y Limitaciones — Limitaciones Conocidas de Implementación para las transiciones que hoy no registran historial.

---

## Gestión de Usuarios

- El administrador debe poder suspender un cliente ingresando un motivo. La suspensión invalida todas las sesiones activas del cliente.
- El administrador debe poder levantar la suspensión de un cliente, reactivando su cuenta.
- El sistema debe notificar al administrador ante nuevos comercios pendientes de revisión.

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

- El administrador debe poder visualizar el listado completo de comercios registrados con: nombre, tipo, estado actual, fecha de registro, Dueño titular y si ese Dueño tiene MP vinculado.
- El administrador debe poder visualizar el listado completo de clientes registrados con: nombre, DNI, estado actual y fecha de registro.
- Ambos listados deben soportar filtros por estado y búsqueda por nombre.

---

## Configuración de Tarifas de Servicio

- El administrador debe poder visualizar y configurar las tarifas de servicio de la plataforma: cargo al cliente y cargo al comercio por pedido procesado.
- Un cambio de tarifa entra en vigencia de forma inmediata (NOW()) y aplica únicamente a los nuevos pedidos creados a partir de ese momento. Los pedidos ya existentes conservan la tarifa que tenían al momento de su creación.
- El sistema debe registrar un historial de cambios de tarifas en la entidad `ConfiguracionTarifa`: cada registro incluye `fecha_vigencia`, `cargo_cliente`, `cargo_comercio` y el identificador del administrador que realizó el cambio. El registro vigente en un momento dado es siempre el de mayor `id` (equivalente al de mayor `fecha_vigencia`).

---

## Gestión de Reclamos

- El sistema debe notificar al administrador cuando un cliente inicie un reclamo por un pedido a domicilio no recibido.
- El administrador debe poder visualizar reclamos pendientes con el detalle del pedido, cliente y comercio involucrados.
- El administrador debe poder aprobar un reclamo, lo que genera automáticamente la nota de crédito y el reembolso correspondiente al cliente.
- El administrador debe poder rechazar un reclamo ingresando un motivo, notificando al cliente con la justificación de la decisión.

---

## Gestión de Re-solicitudes y Soporte

- El sistema no genera una notificación al administrador cuando un comercio rechazado envía una nueva solicitud de revisión (re-solicitud): la re-solicitud aparece en su propia bandeja, separada de las solicitudes nuevas, y el panel cuenta las dos por separado.
- El administrador debe poder visualizar las re-solicitudes pendientes con el detalle completo del comercio (datos fiscales incluidos), el número de intento sobre el máximo permitido (3 por comercio), el motivo del rechazo anterior y los datos que el Dueño cambió respecto de lo rechazado (valor anterior y nuevo).
- Al rechazar un comercio, el administrador puede indicar que el rechazo es definitivo: el comercio queda en estado Rechazo definitivo, sin posibilidad de corrección ni de nueva solicitud. Si rechaza una re-solicitud y el comercio ya usó todas las que tenía, el sistema lo pasa a rechazo definitivo por sí mismo.
- Al rechazar cualquier solicitud (nueva o re-solicitud), el modal de rechazo incluye un interruptor "Rechazo definitivo". Cuando se rechaza una re-solicitud que es el último intento, el modal avisa que el rechazo será definitivo y el interruptor queda activado y bloqueado.
- En la bandeja de re-solicitudes, cada una muestra el comercio, la fecha y "Intento N de 3"; su detalle muestra el motivo del rechazo anterior, una tarjeta por dato cambiado (antes y ahora; la foto, lado a lado) y, plegado, los datos que no cambiaron.
- Pendiente (no implementado): una pantalla del administrador que liste los comercios rechazados y los de rechazo definitivo.
- El sistema debe notificar al administrador cuando un comercio o cliente suspendido envíe una solicitud de contacto con su descargo.
- El administrador debe poder visualizar los mensajes de soporte recibidos y decidir manualmente si reactivar la cuenta o mantener la suspensión.
