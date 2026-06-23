# Requisitos Funcionales — Administrador

---

## Gestión de Comercios

- El administrador debe poder visualizar comercios pendientes de aprobación con sus datos de registro.
- El administrador debe poder aprobar un comercio, habilitándolo para operar y recibir pedidos. El sistema registra la acción en el historial de acciones del comercio (HistorialAccionComercio).
- El administrador debe poder rechazar un comercio ingresando un motivo. El sistema registra la acción en el historial.
- El administrador debe poder suspender un comercio activo ingresando un motivo. La suspensión invalida todas las sesiones activas del usuario representante, desencadena la cancelación de pedidos activos según las reglas del sistema, y registra la acción en el historial.
- El administrador debe poder levantar la suspensión de un comercio, reactivando la cuenta del usuario y el estado del comercio a Aprobado. El sistema registra la acción en el historial.
- El sistema debe registrar un historial de acciones sobre cada comercio (HistorialAccionComercio): fecha y hora, administrador responsable, tipo de acción (aprobación, rechazo, suspensión, reactivación), motivo (cuando aplica) y estado resultante.

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

- El administrador debe poder visualizar el listado completo de comercios registrados con: nombre, tipo, estado actual, fecha de registro y si tiene MP vinculado.
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

- El sistema debe notificar al administrador cuando un comercio rechazado envíe una nueva solicitud de revisión.
- El administrador debe poder visualizar las re-solicitudes pendientes con el detalle del comercio y el historial de acciones previas.
- El sistema debe notificar al administrador cuando un comercio o cliente suspendido envíe una solicitud de contacto con su descargo.
- El administrador debe poder visualizar los mensajes de soporte recibidos y decidir manualmente si reactivar la cuenta o mantener la suspensión.
