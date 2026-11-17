# Requisitos Funcionales — Sistema

Acciones ejecutadas automáticamente por el sistema, sin intervención de ningún usuario.

---

## Gestión de Sesiones

- El sistema debe cerrar automáticamente una sesión al expirar, forzar el cierre ante cambio de contraseña o sesión simultánea, y registrar el tipo de cierre.
- El sistema debe registrar el cierre de una sesión por suspensión de la cuenta con un tipo de cierre propio, distinto del cierre manual, por expiración o por sesión simultánea. La siguiente acción hecha con una de esas sesiones muestra el aviso de cuenta suspendida con el motivo, en lugar de un cierre de sesión sin explicación.

---

## Gestión de Estados de Usuario

- El sistema debe cambiar el estado a Bloqueado tras tres intentos fallidos de inicio de sesión.
- El sistema debe cambiar el estado a Bloqueado tras tres intentos fallidos de contraseña actual en el flujo de cambio de contraseña desde perfil, invalidando la sesión activa.
- **Inactivación automática por falta de uso.** Un proceso corre una vez por día, de madrugada y en una sola instancia, y pasa a Inactivo a toda cuenta que lleve más de 3 meses calendario sin usarse (el plazo es configurable), contados desde su última actividad (`fecha_ultimo_acceso`). No inactiva: al Administrador, las cuentas Suspendidas, Pendientes de verificar o Bloqueadas, ni ninguna cuenta con un pedido en curso (como comprador o, si es Dueño, en cualquiera de sus comercios). Un Dueño cuenta como activo si alguno de sus comercios recibió un pedido en los últimos 3 meses, aunque él no haya iniciado sesión. No hay aviso previo. Procesa como máximo 200 cuentas por corrida, cada una en su propia transacción: si una falla, las demás se procesan igual y la fallida se reintenta en la corrida siguiente. La persona recibe un único email, sin reintentos, y un aviso dentro de la aplicación ("Tu cuenta quedó inactiva por falta de uso."). Es reversible mediante reactivación.
- Al cambiar el estado de un usuario a Inactivo por inactivación automática, el sistema debe invalidar todas sus sesiones activas.
- Al cambiar el estado de un usuario a Suspendido por acción del Administrador, el sistema debe invalidar todas sus sesiones activas de forma inmediata y guardar el motivo y la fecha de la suspensión.
- Todo cambio de estado de un usuario debe pasar por un único punto del sistema, que cambia el estado y escribe la fila del historial de estados del usuario en la misma transacción.
- Una cuenta Suspendida nunca vuelve a Activa por iniciar sesión, por recuperar la contraseña ni por verificar el email. Solo la levanta el Administrador. La verificación de email solo activa cuentas Pendientes.
- Al levantar una suspensión, el sistema debe devolver la cuenta al estado que tenía antes (el de origen de la última suspensión que figura en el historial); si no hay historial, la cuenta queda Activa.
- Cuando el sistema cancela pedidos de un Cliente suspendido, o recibe un pago aprobado sobre un pedido ya cancelado, genera la nota de crédito y reembolsa el total.
- Mientras la cuenta de un Cliente está Suspendida, el sistema rechaza crear pedidos y pagar (409, código CUENTA_SUSPENDIDA): los pedidos que ya estaban pagados siguen su curso normal, los pedidos sin pagar se cancelan y su carrito se conserva. El acceso a Soporte sigue disponible con la sesión suspendida.
- Tres intentos de contraseña incorrecta en una cuenta Inactiva la dejan a la espera de recuperar la contraseña (sin cambiar de estado).

---

## Propagación Automática de Estados Usuario (Dueño) → Comercios

- Al pasar un usuario con rol Dueño a estado Bloqueado, el sistema debe cambiar automáticamente a Cerrado Temporalmente el estado de los comercios que administra que estén en Apto para Venta, dejando una fila de historial por comercio. Los comercios en cualquier otro estado (por ejemplo Aprobado sin cuenta de MercadoPago vinculada, Suspendido o Inactivo) no se modifican. Los pedidos en curso no se modifican. Mientras la cuenta del Dueño siga Bloqueada, ningún camino debe dejar un comercio suyo en Apto para Venta: la aprobación de un comercio pendiente por el Administrador y la vinculación de la cuenta de MercadoPago leen el estado de la cuenta con bloqueo de fila antes de decidir y, si está Bloqueada, dejan el comercio en Cerrado Temporalmente con una fila de historial automática ("Bloqueo de cuenta vigente al aprobar" o "... al vincular Mercado Pago"), sin pasar por Apto para Venta. Un comercio que no llegaría a Apto para Venta no cambia.
- Al pasar un usuario con rol Dueño a estado Inactivo, el sistema debe cambiar automáticamente a Inactivo el estado de los comercios que administra que estén Aprobados, Aptos para Venta o Cerrados Temporalmente, y ocultarlos del catálogo. Los comercios suspendidos por separado siguen Suspendidos. Como una cuenta con pedidos en curso nunca se inactiva, estos comercios no tienen pedidos en curso.
- **Suspensión de la cuenta de un Dueño por el Administrador.** El sistema debe cambiar automáticamente a Suspendido el estado de todos los comercios del Dueño que estén Aprobados, Aptos para Venta o Cerrados Temporalmente, y ocultarlos del catálogo. La suspensión de un comercio puntual por separado no se modifica y sobrevive al levantamiento de la del Dueño. Los pedidos en curso se tratan como en la suspensión de un comercio (ver "Suspensión de Comercio — Gestión de Pedidos Activos"), con una diferencia: si el comercio queda sin Empleados activos que lo atiendan (el Dueño no puede iniciar sesión), los pedidos en preparación y listos para retirar se anulan o cancelan al instante con reembolso total y aviso al Cliente (motivo de timeout: suspensión del Dueño sin atención). Un barrido de seguridad procesa los pedidos que hayan quedado sin atender. El Dueño recibe un solo email por suspensión y otro por levantamiento, con la lista de sus comercios afectados; al levantarla, los comercios que fueron suspendidos junto con él vuelven a operar (Apto para Venta, Aprobado o Cerrado Temporalmente, según corresponda) y los suspendidos por separado siguen suspendidos.
- Al revertirse el estado Bloqueado del usuario vía recuperación de contraseña, el sistema debe restaurar automáticamente el estado de todos los comercios de ese Dueño que estuvieran en Cerrado Temporalmente en ese momento: a Apto para Venta si el Dueño tiene su cuenta de MercadoPago vinculada y la documentación aprobada, o a Aprobado si no. Confirmar dos veces seguidas el mismo código de recuperación no debe restaurar dos veces: la segunda confirmación se rechaza. La recuperación no levanta una suspensión.
- Al revertirse el estado Inactivo del usuario por la reactivación (usuario y contraseña desde el inicio de sesión, desde la ficha del Administrador o por el código por email que conserva el servidor), el sistema debe restaurar automáticamente los comercios de ese Dueño que estuvieran en Inactivo en ese momento: a Apto para Venta si cumplen la regla de seguir vendiendo (cuenta de MercadoPago vinculada y documentación aprobada) o a Aprobado si no. Los comercios suspendidos por separado no se tocan. Confirmar dos veces seguidas (o a la vez) la misma reactivación no debe restaurar dos veces: la segunda se rechaza y cada comercio deja una sola fila de historial.
- La suspensión de un comercio puntual por el Administrador (ver Requisitos Funcionales — Administrador) es una acción a nivel Comercio: cambia el estado de ese comercio a Suspendido sin alterar el estado de la cuenta del Dueño ni el de sus demás comercios. El Administrador puede levantar la suspensión; el comercio vuelve a Apto para Venta si cumple los requisitos para seguir vendiendo (cuenta de cobro vinculada y al menos un documento aprobado), a Aprobado si le falta alguno, o a Cerrado Temporalmente si cumple pero la cuenta del Dueño está bloqueada. El cierre manual no se modifica. Mientras el comercio esté suspendido ningún otro evento (aprobar documentos, vincular la cuenta de cobro, bloquear o restaurar la cuenta del Dueño, abrir o cerrar) lo saca de ese estado.
- Los cambios de estado sobre la cuenta de un Empleado no propagan ningún efecto sobre los comercios donde opera: bloquear, suspender o inactivar a un Empleado solo afecta su propio acceso, dejando intactos el comercio y su Dueño. Un Empleado con la cuenta suspendida, bloqueada o inactiva no cuenta como equipo activo para atender pedidos.
- Los cambios de estado de un comercio (Suspendido, Cerrado Temporalmente, Inactivo, etc.) no modifican las relaciones `EmpleadoComercio` de sus Empleados: la relación sigue Activa y lo que cambia es lo que el Empleado puede hacer (ver Requisitos Funcionales — Empleado, sección Acceso a Comercios).

---

## Gestión de Tokens

- Los tres tipos de token son códigos de 6 dígitos que la persona escribe en la pantalla: no hay enlaces con token. El código de recuperación de contraseña vale 30 minutos. La reactivación de una cuenta inactiva se ofrece por usuario y contraseña desde el inicio de sesión; el código por email para reactivar existe en el servidor, pero la pantalla ya no lo ofrece.
- El sistema debe expirar todos los tokens al vencer, invalidarlos tras su primer uso y registrar la fecha de expiración o uso: verificación de email, recuperación de contraseña y reactivación de cuenta. Las invitaciones de Empleado no usan la tabla de tokens (ver la sección Invitaciones de Empleado).
- El sistema gestiona los tres tipos de token en una única tabla discriminada por tipo (VERIFICACION_EMAIL, RECUPERACION_PASSWORD, REACTIVACION_CUENTA), con campos: id, usuario_id, tipo, token, fecha_creacion, fecha_vencimiento, fecha_uso, estado (PENDIENTE, UTILIZADO, EXPIRADO).
- Un job periódico procesa los tokens con fecha_vencimiento <= NOW() y estado = PENDIENTE, actualizando su estado a EXPIRADO.

---

## Gestión de Pedidos

### Estados del Pedido

Los pedidos pueden encontrarse en los siguientes estados:

- **PENDIENTE_PAGO**: pedido creado, redirigido a MercadoPago, esperando confirmación de cobro.
- **PENDIENTE_CONFIRMACION_COMERCIO**: pago confirmado por MP vía webhook, esperando aceptación o rechazo por el comercio.
- **EN_PREPARACION**: pedido aceptado por el comercio, en proceso de preparación.
- **EN_CAMINO**: pedido despachado. Aplica solo a modalidad domicilio.
- **LISTO_PARA_RETIRAR**: pedido listo. Aplica solo a modalidad retiro.
- **ENTREGADO**: pedido completado, ya sea por confirmación del cliente, del comercio o por el sistema (autoconfirmación de un envío a los 90 minutos). Es un estado reservado para entregas reales.
- **NO_RETIRADO**: pedido de retiro que quedó LISTO_PARA_RETIRAR y el cliente no pasó a buscar. Lo alcanza el cierre manual del Dueño o de un Empleado (tras una espera mínima de 60 minutos configurable) o el sistema al vencer el plazo de un comercio suspendido. Estado terminal, sin reembolso: el comercio se queda el pago porque el pedido ya estaba preparado.
- **RECHAZADO**: el comercio rechazó el pedido estando en estado PENDIENTE_CONFIRMACION_COMERCIO, o lo rechazó el Sistema cuando se suspende el comercio. Genera reembolso automático.
- **CANCELADO**: cancelado por el cliente antes del despacho (domicilio) o antes de estar listo (retiro). Genera reembolso automático.
- **ANULADO**: anulado por el comercio desde estado EN_PREPARACION (o por el Sistema cuando el comercio quedó sin quien lo atienda; para el Dueño y el Empleado dice "Este pedido se anuló automáticamente."). Genera reembolso automático. El Cliente lo ve como "Cancelado".
- **CANCELADO_POR_SISTEMA**: cancelado automáticamente por el sistema por haberse cumplido los 90 minutos de un pedido en preparación de un comercio suspendido, por un pago aprobado que llega con el comercio o la cuenta del Cliente suspendidos, por el cierre de un comercio sin quien lo atienda, o por vencimiento del plazo de pago (pago no confirmado, o pago rechazado sin un reintento aprobado dentro del plazo). Genera reembolso solo si el pago fue previamente confirmado.
- **EXPIRADO**: el comercio no respondió dentro de los 30 minutos posteriores a la confirmación del pago. Genera reembolso automático al cliente.

### Campo Discriminador

La tabla Pedido incluye el campo `cancelado_por` (enum nullable: CLIENTE, COMERCIO, SISTEMA), que se registra únicamente en los estados terminales negativos: RECHAZADO, CANCELADO, ANULADO, CANCELADO_POR_SISTEMA y EXPIRADO.

### Creación de Pedido y Carrito

- El sistema crea el pedido en estado PENDIENTE_PAGO antes de redirigir al cliente a MercadoPago. El carrito no se limpia en este momento.
- El sistema limpia el carrito del cliente únicamente al recibir la confirmación exitosa de pago vía webhook de MP (transición a PENDIENTE_CONFIRMACION_COMERCIO), y solo si el carrito actual del cliente es del mismo comercio del pedido pagado.
- Ante un pago rechazado o el vencimiento del plazo de PENDIENTE_PAGO, el carrito permanece intacto para que el cliente pueda reintentar.
- La confirmación de un pago nunca debe fallar ni quedar a medias porque el cliente esté modificando su carrito, porque otro pedido del mismo cliente se esté pagando o porque el comercio esté marcando un producto como agotado en ese mismo momento. El carrito se evalúa y se vacía sobre su estado más reciente: si el cliente lo vació, le quitó ítems o lo cambió a otro comercio mientras tanto, el pago se confirma igual, y solo se vacía el carrito si sigue siendo del comercio del pedido pagado. Un carrito nunca queda con ítems y sin comercio, ni con comercio y sin ítems.

### Pago con MercadoPago (Checkout Pro)

- El sistema genera el link de pago creando una preferencia de Checkout Pro con el access token del Dueño titular del comercio. El cargo total de servicio (`cargo_servicio_cliente + cargo_servicio_comercio`) se envía como `marketplace_fee`, e `external_reference` es el identificador del pedido. Cada pedido tiene a lo sumo un registro de pago. `marketplace_fee` es el único mecanismo de split que usa el sistema; la entrada `application_fee` que MercadoPago devuelve dentro de `fee_details` es solo el nombre con que informa esa misma comisión.
- El link de pago vence junto con el pedido: la preferencia se crea con el tiempo restante del plazo de pago (30 minutos desde la creación del pedido).
- Al pedir el link de un pedido que ya tiene preferencia, el sistema consulta primero el estado real del pago en MercadoPago: si ya está aprobado informa que el pedido está pagado sin abrir un nuevo checkout; si el pago está en revisión (`pending` o `in_process`) no abre el checkout hasta que se resuelva o venza el pedido; si la verificación falla o tarda responde con un error de servicio no disponible.
- Al volver del checkout, el cliente puede sincronizar el pago del pedido: el sistema aplica el resultado con la misma rutina que el webhook, sin confiar en el identificador de pago que envía el frontend (se cruza siempre el `external_reference`).

- Al confirmarse un pago aprobado, el sistema debe verificar que el split se aplicó: consulta el pago a MercadoPago (`GET /v1/payments/{id}`), lee la comisión de marketplace de `fee_details` y la compara contra el monto esperado (`cargo_servicio_cliente + cargo_servicio_comercio`, con tolerancia de $0,01). Si la entrada falta o el monto no coincide, registra una alerta `SPLIT_NO_APLICADO` con el monto esperado y el capturado. Esta verificación nunca bloquea ni revierte el pago ni el pedido del cliente.

### Webhook de MercadoPago

- El sistema debe exponer un endpoint seguro para recibir las notificaciones (webhooks) de MercadoPago, validando la autenticidad de cada notificación mediante la firma enviada por MP. La notificación debe ser de tipo `payment`; el sistema no confía en su contenido: consulta el pago a MercadoPago con el token del Dueño y cruza su `external_reference` con el pedido. El procesamiento es idempotente.
- Al recibir confirmación de pago aprobado: actualizar el pedido de PENDIENTE_PAGO a PENDIENTE_CONFIRMACION_COMERCIO, limpiar el carrito del cliente y notificar al comercio del nuevo pedido.
- Al recibir notificación de pago rechazado (`rejected` o `cancelled`): el pedido NO se cancela. Permanece en PENDIENTE_PAGO con el estado de pago RECHAZADO, de modo que el cliente pueda reintentar sobre la misma preferencia, hasta que se apruebe un pago o venza el plazo de pago. El carrito del cliente permanece intacto.
- Si el webhook llega para un pedido ya cancelado por cualquier causa (por ejemplo, el timeout fue procesado antes de que llegara el webhook de pago aprobado, o el comercio o la cuenta del Cliente están suspendidos), el sistema debe generar siempre la devolución total inmediatamente (nota de crédito con el motivo que corresponda: pago tardío, suspensión del comercio o suspensión del Cliente), ya que el cobro efectivamente se realizó. Nunca queda dinero retenido.
- El sistema debe registrar en la base de datos una alerta cuando detecta un caso que no puede resolver automáticamente: pago aprobado sobre un pedido ya cancelado (pago tardío), segundo pago aprobado con otro identificador sobre un pedido ya pagado (pago duplicado), o `external_reference` que no coincide con el pedido, o split no aplicado (la comisión de marketplace no figura en `fee_details` o su monto no coincide con el esperado). Las alertas solo dejan rastro (motivo, pedido, identificador de pago, IP de origen y fecha): no modifican el pedido ni el pago. La consulta de las alertas por pantalla está pendiente de implementación.

### Timeouts Automáticos

- **Timeout PENDIENTE_PAGO (30 minutos):** un job periódico detecta pedidos en estado PENDIENTE_PAGO con más de 30 minutos de antigüedad sin recibir confirmación de MP (el plazo es configurable y el job corre cada 60 segundos). El sistema los cancela con estado CANCELADO_POR_SISTEMA (cancelado_por: SISTEMA, motivo: `Pago no confirmado` si no hubo un pago resuelto, o `Pago rechazado` si el último pago fue rechazado), sin generar reembolso. El carrito permanece intacto.
- **Timeout PENDIENTE_CONFIRMACION_COMERCIO — Expiración por falta de respuesta del comercio (30 minutos):** un job periódico (cada 5 minutos, plazo configurable) detecta pedidos en estado PENDIENTE_CONFIRMACION_COMERCIO con más de 30 minutos en ese estado, medida desde la confirmación del pago, sin respuesta del comercio. El sistema cambia su estado a EXPIRADO (cancelado_por: SISTEMA), genera la nota de crédito y solicita el reembolso correspondiente, y notifica al cliente y al comercio.

### Reapertura Automática del Cierre Manual de Comercios

- **Reapertura del cierre manual (cada 60 segundos):** un job periódico recorre los comercios con `cerrado_manualmente = true` y apaga el cierre de cada uno cuando ya empezó la primera franja horaria posterior al momento del cierre (la fecha y hora de la última acción `CERRADO` de HistorialCierreComercio). Registra una acción `REABIERTO` con actor `SISTEMA`, sin usuario, con la hora real en que corrió.
- Cada comercio se evalúa en su propia transacción y con el comercio bloqueado, de modo que un fallo en uno no frena a los demás y el job convive sin conflicto con el cierre y la apertura manual.
- Si el backend estuvo caído horas o días, el job se pone al día en la primera corrida: cada comercio se evalúa contra el momento de su propio cierre, no contra la última ejecución del job.
- Si un comercio tiene el cierre manual prendido y ninguna acción `CERRADO` registrada, el job lo reabre igual, registra la acción `REABIERTO` y deja un aviso en el log.
- Un comercio sin franjas horarias cargadas no se reabre solo.

### Timer de Entrega a Domicilio (75/90 minutos)

- El sistema emite un aviso al cliente (notificación T7) cuando su pedido a domicilio supera los 75 minutos en estado EN_CAMINO sin confirmación de recepción.
- Al cumplirse 90 minutos sin confirmación, el sistema cambia el pedido a ENTREGADO automáticamente (fuente_entrega: SISTEMA) y emite la notificación T8 al Cliente con opciones para iniciar reclamo o contactar al comercio y, en la misma operación, la notificación T30 al equipo del comercio (el Dueño y los Empleados Activos, sin el Cliente del pedido si es Empleado de ese comercio): "El pedido #N se confirmó automáticamente como entregado porque el cliente no respondió en M minutos", donde M es el plazo configurado (90 por defecto). No se emite aviso previo adicional en el momento de la autoconfirmación. La confirmación del Cliente antes del plazo, y el cierre de un retiro, no generan T30.
- Este automatismo no aplica a pedidos de retiro.

### Suspensión de Comercio — Gestión de Pedidos Activos

Al suspenderse un comercio, el sistema aplica estas reglas a sus pedidos, contando los plazos desde el momento en que se suspendió el comercio:

- **PENDIENTE_CONFIRMACION_COMERCIO:** el sistema los rechaza de inmediato (RECHAZADO, cancelado por el Sistema, sin motivo de rechazo del comercio), genera la nota de crédito por el monto pagado (motivo suspensión del comercio), pide el reembolso total y avisa al Cliente: "Cancelamos tu pedido #N porque el comercio no está disponible. Te devolvemos el dinero.". No se avisa al Dueño ni a los Empleados de cada pedido (reciben el aviso de comercio suspendido). Si el reembolso falla para un pedido, ese pedido queda rechazado y el reembolso queda en la pantalla de reembolsos pendientes del Administrador; los demás se procesan igual. Un proceso de seguridad que corre cada minuto rechaza los pendientes de un comercio suspendido que hayan quedado sin procesar (por ejemplo, si el servidor se cayó); es idempotente: nunca duplica la nota ni el aviso. Mientras el pedido siga pendiente (una ventana de segundos), el comercio no puede aceptarlo y sí puede rechazarlo. Levantar la suspensión no deshace los rechazos.
- **EN_PREPARACION:** el comercio puede despacharlo o anularlo. Si no hace ninguna de las dos cosas, el sistema lo cancela a los 90 minutos de la suspensión (CANCELADO_POR_SISTEMA, motivo de timeout de preparación por suspensión), genera la nota de crédito y el reembolso total y avisa al Cliente (T11). Si la suspensión se levanta antes, el plazo deja de correr y el pedido sigue normalmente.
- **EN_CAMINO:** no se modifica. El pedido sigue su camino normal: lo confirma el Cliente o el sistema (aviso a los 75 minutos y autoconfirmación a los 90).
- **LISTO_PARA_RETIRAR:** el comercio puede entregarlo o cerrarlo como NO_RETIRADO (con la espera mínima del cierre manual). Si no lo hace, el sistema lo cierra como NO_RETIRADO, sin reembolso, a los 90 minutos contados desde el momento en que el pedido quedó listo o desde la suspensión del comercio, lo que haya ocurrido después (actor Sistema, motivo de timeout de retiro por suspensión, sin la espera mínima del cierre manual), y avisa al Cliente (T36). Si la suspensión se levanta antes, el plazo deja de correr.
- **PENDIENTE_PAGO:** el botón "Ir a pagar" queda bloqueado con un mensaje claro. Si el pago aprobado llega con el comercio suspendido, el sistema cancela el pedido (CANCELADO_POR_SISTEMA) y genera la devolución total en el acto (nota de crédito por suspensión del comercio). Un pedido sin pagar no se cancela por la suspensión: sigue su vencimiento normal por falta de pago.
- **Pago aprobado sobre un pedido ya cancelado, por cualquier causa:** el sistema siempre genera la devolución total del pago. Nunca queda dinero retenido.

Cada pedido se procesa en su propia transacción: si un pedido falla, los demás se procesan igual y el pedido fallido se reintenta en la corrida siguiente. Los procesos son idempotentes y vuelven a comprobar, con el comercio y el pedido bloqueados, que el comercio siga suspendido y que el pedido siga en el mismo estado.

Rechazo automático de un pedido pendiente de confirmación al suspender el comercio: actor Sistema, motivo de timeout: suspensión del comercio.

### Inactivación de Comercio — Gestión de Pedidos Activos

Un comercio se inactiva solo cuando se inactiva la cuenta de su Dueño, y el proceso de inactivación no toca una cuenta con pedidos en curso en ninguno de sus comercios. Por eso un comercio Inactivo no tiene pedidos en curso que gestionar: ni cancelaciones ni reembolsos automáticos. El comercio queda oculto del catálogo y no recibe pedidos nuevos.

### Historial de Estados del Pedido

- Cada cambio de estado de un pedido genera un registro de historial con el estado resultante, la fecha y hora, el rol del actor (Cliente, Dueño, Empleado o Sistema), el usuario que ejecutó la transición (nulo cuando el actor es el Sistema) y, cuando la transición la produjo un timeout automático, el motivo del timeout (pago, respuesta del comercio, entrega o retiro por suspensión).
- El historial es la fuente de las fechas del ciclo de vida del pedido, en particular de la fecha de llegada al comercio con el pago aprobado.
- **Trazabilidad de un pedido.** El sistema debe ofrecer al Dueño y a los Empleados activos del comercio el recorrido de un pedido (`GET /api/v1/pedidos/comercio/{id}/trazabilidad`) a partir de este historial, con las mismas reglas de visibilidad que la actividad del comercio (sin el pedido todavía no pagado ni su vencimiento por falta de pago; el sistema sin nombre; el Cliente, el Dueño y los Empleados con nombre y apellido). Es una lectura sin bloqueos, en dos consultas dentro de una misma transacción de solo lectura, sin ids de usuario ni datos personales en la respuesta. Un Empleado que es el Cliente del pedido recibe `409` `PEDIDO_PROPIO`.
- **Pedido propio.** Una acción del comercio (aceptar, rechazar, despachar, entregar, anular) de un Empleado sobre un pedido cuyo Cliente es ese mismo Empleado se rechaza con `409` `PEDIDO_PROPIO` y no deja historial, aviso ni reembolso. Se valida por id de usuario dentro de la transacción de la acción, después de bloquear el pedido y leyendo el Cliente de la fila bloqueada.

---

## Historial de Estados de Comercios

- El sistema debe registrar en la entidad HistorialEstadoComercio cada transición de estado de un comercio: aprobación, rechazo (incluido el rechazo definitivo), re-solicitud del Dueño tras un rechazo, suspensión y reactivación por levantamiento de suspensión, además de las transiciones automáticas del sistema. Cada re-solicitud guarda además qué datos cambió el Dueño (HistorialCambioComercio: un registro por campo, con valor anterior y nuevo). Cada registro incluye: fecha y hora, estado de origen, estado resultante, motivo (cuando aplica) y el administrador responsable (vacío cuando la transición es automática). El tipo de acción se deduce del estado resultante.

---

## Notificaciones

El sistema emite notificaciones dentro de la aplicación (consulta periódica desde el panel; no hay notificaciones fuera de la aplicación ni al celular) y, en algunos casos, email ante los siguientes eventos. El Administrador no recibe avisos ni tiene campana: su panel muestra contadores de lo pendiente que se actualizan solos cada 30 segundos con la pestaña visible.

| Código | Evento | Destinatario | Canal |
|--------|--------|-------------|-------|
| T1 | Nuevo pedido recibido ("Pedido nuevo #N de {Nombre Apellido}.") | Dueño y Empleados activos del comercio | App |
| T2 | Pedido aceptado y en preparación | Cliente | App |
| T3 | Pedido rechazado (con motivo y detalle; con la suspensión del comercio: "Cancelamos tu pedido #N porque el comercio no está disponible. Te devolvemos el dinero.") | Cliente | App |
| T4 | *(no usado: fusionado con T2 — la aceptación implica inicio de preparación; el código no existe)* | — | — |
| T5 | Pedido en camino | Cliente | App |
| T6 | Pedido listo para retirar | Cliente | App |
| T7 | Aviso 75 min sin confirmación de entrega ("Tu pedido #N sigue en camino. Si ya lo recibiste, confirmalo para cerrarlo.") | Cliente | App |
| T8 | Pedido auto-confirmado como entregado (incluye opciones: reclamo y contactar comercio) | Cliente | App |
| T9 | Pedido cancelado por el cliente | Dueño y Empleados activos del comercio | App |
| T10 | Pedido anulado por el comercio (con motivo y detalle; avisa que la devolución del pago está en gestión cuando el pedido tenía un pago aprobado; si se anuló por falta de atención: "Cancelamos tu pedido #N porque el comercio no está disponible. Te devolvemos el dinero.") | Cliente | App |
| T11 | Pedido cancelado por sistema (con motivo; con la suspensión del comercio, el mismo texto que T3) | Cliente | App + Email |
| T12 | Pedido expirado por falta de respuesta del comercio | Cliente | App |
| T13 | Pedido expirado — sin respuesta ("El pedido #N se canceló porque nadie lo respondió a tiempo.") | Dueño y Empleados activos del comercio | App |
| T14 | Comercio aprobado | Dueño | App + Email |
| T15 | Comercio rechazado (con motivo; si todavía se puede corregir, se agrega "Corregilo y volvé a solicitarlo.") | Dueño | App + Email |
| T16 | Comercio suspendido (con motivo) | Dueño | App + Email |
| T17 | Nuevo comercio pendiente de revisión | Administrador (sin emisor: se ve en el contador del panel) | — |
| T18 | Nueva re-solicitud de comercio rechazado | — (no se notifica al Administrador: la re-solicitud aparece en su bandeja de re-solicitudes) | — |
| T19 | Nuevo reclamo iniciado por cliente | Administrador (sin emisor: se ve en el contador del panel) | — |
| T20 | Reclamo aprobado — reembolso en proceso | Cliente | App + Email |
| T21 | Reclamo rechazado (con motivo) | Cliente | App + Email |
| T22 | Nuevo mensaje de soporte | Administrador (sin emisor: se ve en el contador del panel) | — |
| T23 | Producto removido del carrito por agotado o descontinuado | Cliente | App |
| T24 | Cuenta inactivada por falta de uso ("Tu cuenta quedó inactiva por falta de uso."; el email conserva la instrucción de reactivar) | Usuario (Cliente, Dueño o Empleado) | App + Email |
| T25 | Comercio inactivado automáticamente | Dueño | Email |
| T26 | (Sin emisor desde el tramo E3 bloque A4b: el cierre automático por vencimiento del timer de suspensión del comercio ahora cierra como NO_RETIRADO y avisa con T36) | Cliente | — |
| T27 | Reembolso fallido — requiere intervención manual (tipo `REEMBOLSO_FALLIDO_DEFINITIVO`) | Administrador (sin emisor: se ve en el contador de Reembolsos del panel) | — |
| T28 | Cliente suspendido (con motivo) | Cliente | App + Email |
| T29 | Suspensión levantada (comercio, cuenta de Cliente o cuenta de Dueño, con el mensaje opcional del Administrador) | Cliente o Dueño | App + Email |
| T30 | Pedido auto-confirmado como entregado por el sistema | Dueño y Empleados activos del comercio | App |
| T31 | Invitación para operar un comercio como Empleado | Persona invitada | Email (código en el texto; no genera notificación in-app) |
| T32 | Empleado desactivado de un comercio por el Dueño | Empleado | App |
| T33 | Invitación de Empleado aceptada | Dueño | App |
| T34 | Empleado renunció a un comercio | Dueño | App |
| T35 | Aviso de regularización: se intentó invitar a una cuenta bloqueada, suspendida, inactiva o sin verificar | Persona con esa cuenta | Email |
| T36 | Pedido de retiro cerrado como No Retirado, por el Dueño, por un Empleado o por el sistema al vencer el plazo de un comercio suspendido ("Tu pedido #12 no fue retirado y el comercio lo cerró. Como ya estaba preparado, no hay devolución del pago.") | Cliente | App |
| T37 | Empleado reactivado por el Dueño | Empleado | App |
| T38 | Documento de un comercio aprobado ("Tu documento «{tipo}» de {comercio} fue aprobado.") | Dueño | App |
| T39 | Documento de un comercio rechazado o revocado ("Tu documento «{tipo}» de {comercio} fue rechazado. Motivo: {motivo} Subí uno nuevo.") | Dueño | App |
| T40 | El comercio pasó de Aprobado a Apto para Venta ("Tu comercio {comercio} ya puede recibir pedidos.") | Dueño | App |
| T41 | El comercio dejó de cumplir la regla de venta y volvió a Aprobado ("Tu comercio {comercio} dejó de recibir pedidos: falta vincular Mercado Pago / falta tener un documento aprobado.") | Dueño | App |
| T42 | Reclamo resuelto con reembolso ("Reembolsamos {monto} al Cliente por un reclamo del pedido #N.") — tipo `RECLAMO_REEMBOLSO_DUENO` (código sugerido) | Dueño | App |
| T43 | Comercio suspendido, sin motivo ("El comercio '{nombre}' fue suspendido. Mientras dure no se aceptan pedidos nuevos.") — tipo `COMERCIO_SUSPENDIDO_EQUIPO` (código sugerido) | Empleados activos del comercio (no el Dueño) | App |
| T44 | Suspensión del comercio levantada, sin mensaje ("Levantaron la suspensión del comercio '{nombre}'. Ya vuelve a funcionar con normalidad.") — tipo `COMERCIO_SUSPENSION_LEVANTADA_EQUIPO` (código sugerido) | Empleados activos del comercio (no el Dueño) | App |
| T45 | Cuenta del Dueño suspendida — tipo `DUENO_SUSPENDIDO` (código sugerido) | Dueño | Solo el rastro del email |
| T46 | Suspensión de la cuenta del Dueño levantada — tipo `DUENO_SUSPENSION_LEVANTADA` (código sugerido) | Dueño | Solo el rastro del email |

- T38 a T41 corresponden a los tipos `DOCUMENTO_APROBADO`, `DOCUMENTO_RECHAZADO`, `COMERCIO_APTO_VENTA` y `COMERCIO_SIN_APTITUD` (ver Documentación de Habilitación en Requisitos Funcionales — Dueño). T42 a T46 son códigos sugeridos para tipos que existen en el sistema sin código T; no existe T4.
- Cada aviso con una pantalla relacionada (el pedido, el reclamo, la documentación, el equipo, el panel, el carrito, el cambio de cuenta) lleva a ella al tocarlo entero y se marca leído; los informativos (cuenta inactivada o suspendida, comercio inactivado, baja del equipo) solo se marcan como leídos. Un Empleado nunca recibe un destino que no puede ver. La lista se entrega por páginas de 20 (50 como máximo) con un cursor; el contador de no leídas cuenta todos los avisos, no solo los cargados. "Marcar todas como leídas" existe para el Cliente (avisos personales), el Dueño y el Empleado (los del comercio abierto).
- Las pantallas de espera del Dueño (comercio pendiente, rechazado o con rechazo definitivo) reflejan el cambio de estado sin recargar (consulta cada 15 segundos con la pantalla visible).
- Los avisos de autoconfirmación de la entrega (T8 y T30) conservan su texto. Los avisos ya creados conservan el texto con el que se crearon: cambiar un texto no reescribe los anteriores.
- Los 6 tipos sin emisor (`NUEVO_COMERCIO_PENDIENTE`, `NUEVA_RESOLICITUD_COMERCIO`, `NUEVO_RECLAMO`, `NUEVO_MENSAJE_SOPORTE`, `REEMBOLSO_FALLIDO_DEFINITIVO` y `PEDIDO_CERRADO_TIMER_SUSPENSION`) quedan documentados y no se eliminan.
- **Email de suspensión y de Soporte.** Los emails de suspensión y levantamiento (de comercio, de Cliente y de Dueño) se envían una sola vez, sin reintento automático; si falla, la ficha o la lista del Administrador lo muestra ("No se envió el email") y ofrece "Reenviar email". Lo mismo vale para la respuesta de Soporte.

- Al auto-confirmar la entrega (T8), la notificación incluye botones para iniciar reclamo o contactar al comercio directamente.
- T2 y T4 corresponden al mismo evento: cuando el comercio acepta un pedido, este pasa directamente a EN_PREPARACION. La notificación al cliente unifica ambos conceptos en un único mensaje ("Tu pedido fue aceptado y ya está en preparación").
- La notificación de sesión cerrada en otro dispositivo se envía como email transaccional directo, no a través del sistema de notificaciones de la aplicación.
- **Notificaciones del Empleado (T1, T9 y T13 implementadas en el tramo E3, bloque A4, y T30 en el bloque A6; el resto, en E1 a E4):** las operativas (T1, T9, T13 y T30) se emiten una vez por cada Empleado Activo del comercio, además del Dueño, de modo que cada uno tiene su propia copia que marca como leída por separado. El Cliente del pedido, si es Empleado de ese comercio, no recibe la copia del equipo de su propio pedido (recibe solo sus avisos de comprador). La lista de destinatarios se resuelve bloqueando antes del pedido a los usuarios y las relaciones, de modo que un Empleado desactivado en medio del hecho queda afuera y quien se suma después del hecho no lo ve. Cada tipo de notificación tiene una audiencia fija (equipo, solo Dueño, Cliente, Cliente o Dueño, Administrador) y el sistema rechaza crear un aviso por un camino que no le corresponde. Las administrativas (T14 a T16) y las de cobro (T27 y todo lo de MercadoPago) van solo al Dueño. T33 y T34 se emiten al Dueño con el comercio asociado; T32 usa el mismo tipo `EMPLEADO_DESACTIVADO` que T34, con otro texto. T33 usa el tipo `INVITACION_EMPLEADO` dirigido al Dueño.
- **Notificaciones con el comercio en la consulta (tramo E3, bloque A2):** el listado y el contador de notificaciones los usan varios roles. Sin el comercio en la consulta, un Cliente ve las suyas. Si manda el comercio, se lo trata como Empleado de ese comercio: tiene que tener una relación Activa (si no, el mismo "comercio no encontrado" 404 de siempre) y el valor tiene que ser un número (si no, 400); el listado y el contador traen solo los avisos de ese usuario sobre ese comercio (los del equipo y, para el Dueño, también los de administración). Sin el comercio, el Cliente y el Administrador ven solo los avisos personales: nunca los del comercio. El Dueño sigue exigiendo el comercio y el Administrador lo ignora. Marcar todas las no leídas del comercio abierto (`PUT /notificaciones/leidas`, con el comercio en el header) sirve al Dueño y al Empleado Activo; marcar una sola como leída exige, si es un aviso de comercio, ser el Dueño de ese comercio o su Empleado Activo. La consulta del listado de comercios del Empleado trae su contador real de avisos sin leer por comercio.
- **Revalidación de la relación del Empleado en cada escritura:** además de comprobarla al resolver el comercio, toda escritura delegada vuelve a comprobar, dentro de su propia operación y con la fila bloqueada, que la relación siga Activa; si el Dueño la desactivó mientras tanto, la escritura responde el mismo 404 y no cambia nada.
- **Códigos de conflicto del comercio:** los conflictos por el estado del comercio llevan un código estable en la respuesta además del texto: COMERCIO_SUSPENDIDO (modificar productos, imágenes, horarios, redes o datos operativos con el comercio suspendido), COMERCIO_SIN_OPERACION (aceptar un pedido nuevo con el comercio suspendido o cerrado temporalmente), COMERCIO_NO_OPERATIVO (abrir o cerrar un comercio que no está operativo) y FUERA_DE_HORARIO (abrir o cerrar fuera de un horario de atención).
- El listado y el contador de notificaciones del contexto Cliente se separan de los del comercio: el Cliente ve solo las notificaciones sin entidad o de sus propios pedidos, y no las asociadas a un comercio (se deja pasar T32, que le concierne a la persona).
- El aviso de regularización (T35) se registra en la tabla de notificaciones con canal Email para poder contar el tope de 3 por día por destinatario; los listados y contadores in-app filtran por canal Push y no muestran esas filas.

---

## Gestión de Productos

- Al marcar un producto como AGOTADO, el sistema debe eliminar ese ítem de los carritos activos que lo contengan y notificar a los clientes afectados (T23), del mismo modo que con DESCONTINUADO.
- Un producto AGOTADO o DESCONTINUADO no puede quedar en ningún carrito, aunque un cliente lo esté agregando en el mismo momento: o el cliente lo agrega antes y el sistema lo elimina y lo avisa, o lo intenta después y recibe que el producto no está disponible. Se avisa (T23) únicamente a los clientes a los que realmente se les quitó un ítem, y el carrito que queda vacío queda sin comercio.
- Al descontinuar un producto que se encuentre en carritos activos, el sistema debe eliminar ese ítem de los carritos afectados y notificar a los clientes (T23).
- Al visualizarse un carrito, si algún ítem hace referencia a un producto en estado AGOTADO o DESCONTINUADO (por desfase entre la notificación y la vista del carrito), el sistema debe eliminar ese ítem del carrito y notificar al cliente.

---

## Gestión de Reembolsos

- Cada reembolso se intenta una sola vez contra MercadoPago. Si falla, la nota de crédito queda en estado FALLIDO y el Administrador la reintenta a mano desde su pantalla de Reembolsos. El estado PENDIENTE_REINTENTO existe pero no se usa: el job periódico de reintentos automáticos (hasta 5 intentos) estaba diseñado y no se construyó.

---

## Gestión del Carrito

- El sistema debe pasar el carrito a estado inactivo al detectar que la sesión del cliente ha expirado o cerrado manualmente.
- El sistema debe pasar el carrito a estado inactivo cuando el usuario sea inactivado automáticamente.
- El sistema no limpia el carrito al crear un pedido en PENDIENTE_PAGO. Solo lo limpia al confirmar el pago (transición a PENDIENTE_CONFIRMACION_COMERCIO).

---

## Invitaciones de Empleado

> **Estado de implementación:** implementado en el tramo E1 (2026-10-06 a 2026-10-10). Estructura en las migraciones `V30` (`InvitacionEmpleado`) y `V31` (`HistorialEmpleadoComercio`); la tabla de ediciones del comercio (`HistorialEdicionComercio`, `V32`) se describe más abajo, en "Actividad del Comercio".

- Cada envío de una invitación es una fila de `InvitacionEmpleado`: email normalizado, comercio, código de 6 dígitos, estado (Pendiente, Aceptada, Cancelada, Reemplazada, Vencida, Invalidada), intentos fallidos, quién invitó, quién aceptó y vencimiento a 7 días. Reenviar crea una fila nueva y deja la anterior Reemplazada.
- A lo sumo una invitación Pendiente por comercio y email, y un código no puede repetirse entre invitaciones Pendientes del mismo email.
- Límites: máximo 5 envíos por hora por comercio (se cuenta sobre las filas creadas en la última hora) y 5 intentos fallidos por código, tras los cuales la invitación pasa a Invalidada. El sistema no cuenta los intentos por IP ni por persona: quien conozca un email puede gastar los intentos de una invitación, y el Dueño la reenvía.
- Un proceso automático (cada minuto) pasa a Vencida, en la base, toda invitación Pendiente cuya fecha de vencimiento (7 días) ya pasó; no escribe historial ni avisa a nadie. Hasta la corrida siguiente, el listado ya la informa como Vencida, y al invitar o reenviar de nuevo se actualiza el estado de la anterior vencida en la misma operación.
- Aceptar con cuenta nueva crea Usuario, PersonaFisica, Cliente y Empleado en una sola transacción, con la aceptación de Términos y Condiciones validada en el servidor; aceptar con cuenta existente alcanza con email y código. Dos aceptaciones simultáneas del mismo código se resuelven en el servidor: gana una y la otra recibe el mismo error genérico de "código incorrecto o vencido". Lo mismo ocurre si se acepta mientras el Dueño cancela o reenvía.
- Al aceptar, el sistema revalida la regla de combinaciones de roles y, si la persona ya tenía una relación con el comercio, la reactiva (misma fila).
- Solo se puede invitar con el comercio Aprobado o Apto para Venta.
- La invitación a una cuenta bloqueada, suspendida, inactiva o sin verificar no se crea; se registra el aviso de regularización (T35), con tope de 3 por día por destinatario, y no se envía a Dueños ni Administradores. El email de regularización nombra solo al comercio, nunca al Dueño.
- Un código de invitación incorrecto o de una invitación ya no vigente recibe siempre la misma respuesta 401, sin intentos restantes: "El código es incorrecto o la invitación ya no está vigente. Pedí que te reenvíen la invitación." Reenviar y aceptar responden 200.
- Se puede aceptar una invitación con el comercio Aprobado, Apto para Venta o Cerrado Temporalmente, y no con el comercio Suspendido, Pendiente, Rechazado, con Rechazo Definitivo o Inactivo.
- La pestaña Actividad de "Ver equipo" (que lee la tabla de ediciones, `V32`, y las demás fuentes) se implementó en los tramos E3 y E4; ver "Actividad del Comercio".

---

## Historial del Equipo de un Comercio

> **Estado de implementación:** implementado. La estructura, en el tramo E1; la baja del Dueño, la reactivación directa y la renuncia, en el tramo E4 (bloques A1 y A2); la lectura en la Actividad y la del Administrador, en el bloque A3, y las pantallas, en las entregas B1 a B3.

- El sistema debe registrar en `HistorialEmpleadoComercio` cada evento del equipo: invitación, aceptación, invitación cancelada, baja del Dueño, renuncia y reactivación, con quién lo hizo y cuándo. Los eventos de invitación cuelgan de la invitación; los demás, de la relación (con estado de origen y destino). La reactivación directa del Dueño no lleva invitación; la que escribe aceptar una invitación estando inactivo sí.
- Es una tabla de solo inserción. La ven el Dueño del comercio y, en solo lectura, el Administrador, como la cuarta fuente (`EQUIPO`) de la lista de actividad: "Invitó a {email}", "Canceló la invitación a {email}", "Aceptó la invitación", "Dio de baja a {Nombre}", "Dejó de trabajar en el comercio" y "Reactivó a {Nombre}". La reactivación que produce aceptar una invitación no se muestra aparte: la línea es una sola, "Aceptó la invitación".
- **Gestión directa del miembro (tramo E4).** El Dueño puede dar de baja (desactivar) y reactivar a un miembro del equipo. Desactivar funciona con el comercio en cualquier estado; reactivar exige el comercio operativo, que la baja la haya dado el Dueño (si la persona renunció o no hay registro de la baja hace falta una invitación nueva), que no haya una invitación pendiente vigente para esa persona en ese comercio y que la cuenta siga siendo apta (rol, estado y edad); si la cuenta no es apta el Dueño recibe un mensaje genérico, sin el motivo ni un email de regularización. Repetir una de estas operaciones responde correctamente sin escribir historial ni avisos. Al desactivar o al renunciar se borran los avisos del comercio de esa persona y ella pierde el acceso en la siguiente solicitud. Avisos: T32 a la persona dada de baja, T37 a la reactivada y T34 al Dueño cuando alguien renuncia.
- **Renuncia (tramo E4).** El Empleado puede dejar un comercio por su cuenta, con el comercio en cualquier estado; solo vuelve si el Dueño lo invita de nuevo. Quien pierde el acceso puede consultar la causa (baja del Dueño, renuncia o comercio no disponible) sin que un tercero pueda saber si una relación existe.
- **Lectura del Administrador (tramo E4).** El Administrador ve en solo lectura el equipo (miembros activos e inactivos con el motivo de la baja, e invitaciones) y la actividad de cualquier comercio existente, en cualquier estado. No puede modificar nada.

---

## Actividad del Comercio

> **Estado de implementación:** la tabla, el registro de las escrituras del Dueño y la lista de actividad están implementados (tramo E3, bloque A1). Desde el bloque A2 las escrituras de un Empleado (productos, imágenes y descripción y teléfono del comercio) se registran con su rol y su usuario, y los historiales de pedidos y de cierres guardan al Empleado como actor; la pestaña en pantalla llega en la entrega B.

- El sistema debe registrar en `HistorialEdicionComercio` las altas, ediciones, bajas y cambios de estado de productos, imágenes, perfil y horarios del comercio, hechos por el Dueño o por un Empleado (los extras de producto fueron descartados del alcance). Guarda el usuario, su rol (Dueño o Empleado), el tipo y el nombre de la entidad en ese momento y un detalle breve, sin guardar valores anteriores ni el nombre de quien actuó. Los pedidos y los cierres y aperturas no se registran ahí: ya tienen `HistorialEstadoPedido` e `HistorialCierreComercio`, y la pestaña Actividad junta las tres fuentes en una lista por fecha.
- Se escribe desde los servicios, en la misma transacción que la escritura (si la escritura falla no queda registro y si el registro falla la escritura no se confirma), y solo cuando hubo un cambio efectivo. Hoy se registran las altas, ediciones, bajas y cambios de estado de productos, las altas, el orden, el reemplazo y la baja de imágenes de producto, los cambios del perfil del comercio (descripción, teléfono, datos de contacto, modalidades de entrega y foto) y las altas, ediciones y bajas de redes sociales; la apertura y el cierre del comercio no van a esta tabla.
- La ve el Dueño completa y el Administrador en solo lectura; el Empleado no la ve.
- **Lista de actividad.** El sistema debe ofrecer al Dueño una lista de la actividad de su comercio (`GET /api/v1/comercios/equipo/actividad`) que junta, ordenada de la más nueva a la más vieja, cuatro fuentes: el registro de ediciones; todo lo que le pasó a sus pedidos desde que el comercio los ve, sea quien sea el actor (acciones del Dueño y de los Empleados; del Cliente, que cancela o confirma la recepción; y del sistema: la llegada del pedido ya pagado, que se muestra como "Pedido recibido", el vencimiento sin respuesta del comercio, la autoconfirmación de la entrega, el cierre automático de un retiro con el comercio suspendido y la cancelación por la suspensión del comercio); los cierres y reaperturas del comercio (incluidas las automáticas del sistema); y los eventos del equipo (ver "Historial del Equipo de un Comercio"). No aparecen el nacimiento del pedido a la espera del pago ni su vencimiento por falta de pago: el comercio nunca vio ese pedido. Cada línea trae quién actuó (nombre completo y rol: Dueño, Empleado o Cliente; en las acciones del sistema el rol es Sistema y no hay nombre ni usuario), qué hizo en texto legible, sobre qué entidad y cuándo. Se pagina por cursor ("ver más"): 30 líneas por página por defecto, 100 como máximo; una línea nueva no repite ni saltea líneas de las páginas ya entregadas. El parámetro opcional `fuente` (`PEDIDO`, `EDICION`, `CIERRE` o `EQUIPO`) limita la lista a una de las cuatro fuentes, con el mismo orden y el mismo cursor; sin él se devuelve todo, y cualquier otro valor es un error de validación (400). Un usuario que no es el Dueño del comercio recibe "comercio no encontrado" (404) o, si es un Empleado, acceso denegado: el Empleado no ve la actividad. El Administrador la lee en solo lectura con el mismo servicio (`GET /api/v1/administrador/comercios/{id}/actividad`, tramo E4), para cualquier comercio existente.
- **Zona horaria única.** El sistema debe guardar y comparar todas las horas de los historiales de pedidos, de ediciones y de cierres, los plazos de los pedidos (pago, respuesta del comercio, entrega, retiro con el comercio suspendido), las invitaciones y los horarios de atención con un único reloj, en la zona configurable `app.zona-horaria` (por defecto `America/Argentina/Ushuaia`, UTC-03:00), sin depender de la zona de la máquina donde corra el servidor. Una zona inválida impide arrancar. Las filas ya guardadas no se migran.

---

## Soporte

- El sistema debe permitir que una persona escriba a Soporte con o sin sesión, también con la cuenta suspendida. Cada consulta es una conversación por turnos (la persona escribe, el Administrador responde, y así), de hasta 20 mensajes, que solo Soporte cierra. Hay cinco tipos de consulta (entre ellos, la apelación de un comercio suspendido y la de una cuenta suspendida). Las consultas viven en `ticket_soporte`, `ticket_soporte_mensaje` y `soporte_limite`; la tabla `Soporte` anterior desapareció.
- Límites contra abuso: 3 consultas por día y 3 abiertas a la vez por email, 10 consultas por día por IP, 30 accesos fallidos con código por hora por email y 10 por IP, y 3 reenvíos de códigos por hora. Nada se borra. Los emails de Soporte no se reintentan solos: el Administrador puede reenviar el de una respuesta que no salió.
- La conversación del lado de la persona no tiene tiempo real. El Administrador ve las consultas que esperan su respuesta en el contador de su panel (sin aviso interno nuevo).

---

## Reclamos de Pedidos

- Un Cliente puede reclamar un pedido ENTREGADO (a domicilio o de retiro, también los autoconfirmados por el sistema) con el pago aprobado, dentro de los 7 días corridos desde la entrega; el plazo no se pausa si el Cliente está suspendido (mientras tanto no puede crear reclamos). Un reclamo por pedido; no se edita. El pedido no cambia de estado y nadie recibe un aviso al crearlo: el Administrador lo ve en el contador del panel. Motivos: no recibí el pedido (solo a domicilio), faltan productos, productos equivocados, producto en mal estado, cobro incorrecto y otro. El mensaje es de 10 a 1000 caracteres y puede llevar hasta 3 fotos de 5 MB (JPG, PNG o WebP; HEIC se rechaza), que ve solo el Administrador y se sirven con `nosniff` y sin caché.
- El Administrador lo resuelve de forma final (no se reabre): reembolso total (lo que quede por reembolsar del pago), reembolso parcial (mayor que cero y menor que lo que queda; si es igual se pide el total) o rechazo con motivo de 10 a 500 caracteres. El reembolso genera una nota de crédito con motivo reclamo, ligada al reclamo (una por reclamo), que se pide a Mercado Pago con la cuenta del Dueño; si falla (por ejemplo, sin saldo) el reclamo queda aprobado con el reembolso en proceso y el Administrador reintenta desde Reembolsos. Una resolución nunca deja dos notas ni dos reembolsos aunque haya varios Administradores o pestañas, y el email y la llamada a Mercado Pago no se hacen con una conexión de la base tomada.
- Al resolverse, el Cliente recibe un aviso y un email (aprobado: el monto y que puede tardar unos días; rechazado: el motivo). El Dueño recibe un aviso solo cuando hubo reembolso. Ver Requisitos Funcionales — Cliente, Dueño y Administrador.

---

## Resumen del Turno

- Todo pedido pertenece al turno en el que se confirmó su pago; el sistema calcula por turno lo vendido, la comisión de plataforma y el neto, y guarda una foto de esas cifras 30 minutos después del fin del turno (esperando, hasta dos horas, a un pedido sin pagar creado antes del fin). Con esa foto envía al Dueño el email de cierre de turno, con reintentos a los 10, 30, 60 y 60 minutos y, tras 5 intentos fallidos, lo deja sin enviar. Las estadísticas del comercio (7 o 30 días) se calculan en vivo con el estado actual de los pedidos. Ver Requisitos Funcionales — Dueño.

---

## Registro de Ejecución de Jobs

Todos los procesos automáticos descritos en este documento (expiración de tokens,
timeouts de pedidos, autoconfirmación de entrega, propagación de estados, timers de
suspensión, reapertura del cierre manual de comercios, inactivación diaria de cuentas, rechazo y cancelación por suspensión, y cierre de turno) deben registrar su ejecución según la taxonomía
de logs definida en Requisitos No Funcionales — Registro de Eventos del Sistema
(categorías: ejecución de jobs, error, auditoría e idempotencia/casos borde).
