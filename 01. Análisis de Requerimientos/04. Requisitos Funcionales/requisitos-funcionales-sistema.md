# Requisitos Funcionales — Sistema

Acciones ejecutadas automáticamente por el sistema, sin intervención de ningún usuario.

---

## Gestión de Sesiones

- El sistema debe cerrar automáticamente una sesión al expirar, forzar el cierre ante cambio de contraseña o sesión simultánea, y registrar el tipo de cierre.

---

## Gestión de Estados de Usuario

- El sistema debe cambiar el estado a Bloqueado tras tres intentos fallidos de inicio de sesión.
- El sistema debe cambiar el estado a Bloqueado tras tres intentos fallidos de contraseña actual en el flujo de cambio de contraseña desde perfil, invalidando la sesión activa.
- El sistema debe cambiar el estado a Inactivo tras 3 meses sin actividad, reversible via reactivación.
- Al cambiar el estado de un usuario a Inactivo por inactivación automática, el sistema debe invalidar todas sus sesiones activas.
- Al cambiar el estado de un usuario a Suspendido por acción del Administrador, el sistema debe invalidar todas sus sesiones activas de forma inmediata.

---

## Propagación Automática de Estados Usuario (Dueño) → Comercios

- Al pasar un usuario con rol Dueño a estado Bloqueado, el sistema debe cambiar automáticamente a Cerrado Temporalmente el estado de los comercios que administra que estén en Apto para Venta, dejando una fila de historial por comercio. Los comercios en cualquier otro estado (por ejemplo Aprobado sin cuenta de MercadoPago vinculada, Suspendido o Inactivo) no se modifican. Los pedidos en curso no se modifican. Mientras la cuenta del Dueño siga Bloqueada, ningún camino debe dejar un comercio suyo en Apto para Venta: la aprobación de un comercio pendiente por el Administrador y la vinculación de la cuenta de MercadoPago leen el estado de la cuenta con bloqueo de fila antes de decidir y, si está Bloqueada, dejan el comercio en Cerrado Temporalmente con una fila de historial automática ("Bloqueo de cuenta vigente al aprobar" o "... al vincular Mercado Pago"), sin pasar por Apto para Venta. Un comercio que no llegaría a Apto para Venta no cambia.
- Al pasar un usuario con rol Dueño a estado Inactivo, el sistema debe cambiar automáticamente el estado de TODOS los comercios que administra a Inactivo y ocultarlos del catálogo.
- Si en algún momento se suspende directamente la cuenta de un Dueño (estado Suspendido a nivel Usuario, distinto de la suspensión de un comercio puntual descrita en Requisitos Funcionales — Administrador), el sistema debe cambiar automáticamente el estado de TODOS los comercios que administra a Suspendido y ocultarlos del catálogo.
- Al revertirse el estado Bloqueado del usuario vía recuperación de contraseña, el sistema debe restaurar automáticamente el estado de todos los comercios de ese Dueño que estuvieran en Cerrado Temporalmente en ese momento: a Apto para Venta si el Dueño tiene su cuenta de MercadoPago vinculada, o a Aprobado si no. Confirmar dos veces seguidas el mismo código de recuperación no debe restaurar dos veces: la segunda confirmación se rechaza.
- Al revertirse el estado Inactivo del usuario vía token de reactivación de cuenta, el sistema debe restaurar automáticamente a Aprobado el estado de todos los comercios de ese Dueño que estuvieran en Inactivo en ese momento. Confirmar dos veces seguidas (o a la vez) el mismo código de reactivación no debe restaurar dos veces: la segunda confirmación se rechaza y cada comercio deja una sola fila de historial.
- La suspensión de un comercio puntual por el Administrador (ver Requisitos Funcionales — Administrador) es una acción a nivel Comercio: cambia el estado de ese comercio a Suspendido sin alterar el estado de la cuenta del Dueño ni el de sus demás comercios.
- Los cambios de estado sobre la cuenta de un Empleado no propagan ningún efecto sobre los comercios donde opera: bloquear, suspender o inactivar a un Empleado solo afecta su propio acceso, dejando intactos el comercio y su Dueño.
- Los cambios de estado de un comercio (Suspendido, Cerrado Temporalmente, Inactivo, etc.) no modifican las relaciones `EmpleadoComercio` de sus Empleados: la relación sigue Activa y lo que cambia es lo que el Empleado puede hacer (ver Requisitos Funcionales — Empleado, sección Acceso a Comercios).

---

## Gestión de Tokens

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
- **ENTREGADO**: pedido completado, ya sea por confirmación del cliente, del comercio o por el sistema.
- **RECHAZADO**: el comercio rechazó el pedido estando en estado PENDIENTE_CONFIRMACION_COMERCIO. Genera reembolso automático.
- **CANCELADO**: cancelado por el cliente antes del despacho (domicilio) o antes de estar listo (retiro). Genera reembolso automático.
- **ANULADO**: anulado por el comercio desde estado EN_PREPARACION. Genera reembolso automático.
- **CANCELADO_POR_SISTEMA**: cancelado automáticamente por el sistema ante suspensión del comercio o por vencimiento del plazo de pago (pago no confirmado, o pago rechazado sin un reintento aprobado dentro del plazo). Genera reembolso solo si el pago fue previamente confirmado.
- **EXPIRADO**: el comercio no respondió dentro de la hora de margen tras la confirmación del pago. Genera reembolso automático al cliente.

### Campo Discriminador

La tabla Pedido incluye el campo `cancelado_por` (enum nullable: CLIENTE, COMERCIO, SISTEMA), que se registra únicamente en los estados terminales negativos: RECHAZADO, CANCELADO, ANULADO, CANCELADO_POR_SISTEMA y EXPIRADO.

### Creación de Pedido y Carrito

- El sistema crea el pedido en estado PENDIENTE_PAGO antes de redirigir al cliente a MercadoPago. El carrito no se limpia en este momento.
- El sistema limpia el carrito del cliente únicamente al recibir la confirmación exitosa de pago vía webhook de MP (transición a PENDIENTE_CONFIRMACION_COMERCIO), y solo si el carrito actual del cliente es del mismo comercio del pedido pagado.
- Ante un pago rechazado o el vencimiento del plazo de PENDIENTE_PAGO, el carrito permanece intacto para que el cliente pueda reintentar.

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
- Si el webhook llega para un pedido ya en estado CANCELADO_POR_SISTEMA (por ejemplo, el timeout fue procesado antes de que llegara el webhook de pago aprobado), el sistema debe generar el reembolso correspondiente inmediatamente, ya que el cobro efectivamente se realizó.
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
- Al cumplirse 90 minutos sin confirmación, el sistema cambia el pedido a ENTREGADO automáticamente (fuente_entrega: SISTEMA) y emite la notificación T8 con opciones para iniciar reclamo o contactar al comercio. No se emite aviso previo adicional en el momento de la autoconfirmación.
- Este automatismo no aplica a pedidos de retiro.

### Suspensión de Comercio — Gestión de Pedidos Activos

Al suspenderse un comercio por el Administrador, el sistema debe procesar los pedidos activos de la siguiente manera:

- **PENDIENTE_CONFIRMACION_COMERCIO y EN_PREPARACION:** cancelar con estado CANCELADO_POR_SISTEMA (motivo: comercio suspendido, cancelado_por: SISTEMA), generar nota de crédito y reembolso para cada pedido abonado, y notificar a cada cliente afectado con el motivo de la cancelación.
- **EN_CAMINO:** marcar automáticamente como ENTREGADO (fuente_entrega: SISTEMA). El envío ya estaba en curso y el comercio había cumplido su parte. Sin reembolso.
- **LISTO_PARA_RETIRAR:** iniciar un timer de 90 minutos para cada pedido en este estado. Si el cliente se presenta y el comercio (o el sistema) confirma el retiro antes del vencimiento, el pedido se marca ENTREGADO normalmente. Si vencen los 90 minutos sin retiro confirmado, el sistema marca el pedido como ENTREGADO automáticamente (fuente_entrega: SISTEMA, sin reembolso). El cliente es notificado de la situación al momento de la suspensión.

### Inactivación de Comercio — Gestión de Pedidos Activos

Al inactivarse automáticamente un comercio por inactividad (3 meses sin actividad del Dueño titular), el sistema cancela los pedidos en estado PENDIENTE_CONFIRMACION_COMERCIO y EN_PREPARACION con estado CANCELADO_POR_SISTEMA, genera los reembolsos correspondientes y notifica a los clientes afectados. Los pedidos EN_CAMINO o LISTO_PARA_RETIRAR siguen su curso normal (la inactivación por 3 meses de inactividad implica que no hay entregas activas en ese momento).

### Historial de Estados del Pedido

- Cada cambio de estado de un pedido genera un registro de historial con el estado resultante, la fecha y hora, el rol del actor (Cliente, Dueño, Empleado o Sistema), el usuario que ejecutó la transición (nulo cuando el actor es el Sistema) y, cuando la transición la produjo un timeout automático, el motivo del timeout (pago, respuesta del comercio, entrega o retiro por suspensión).
- El historial es la fuente de las fechas del ciclo de vida del pedido, en particular de la fecha de llegada al comercio con el pago aprobado.

---

## Historial de Estados de Comercios

- El sistema debe registrar en la entidad HistorialEstadoComercio cada transición de estado de un comercio: aprobación, rechazo (incluido el rechazo definitivo), re-solicitud del Dueño tras un rechazo, suspensión y reactivación por levantamiento de suspensión, además de las transiciones automáticas del sistema. Cada re-solicitud guarda además qué datos cambió el Dueño (HistorialCambioComercio: un registro por campo, con valor anterior y nuevo). Cada registro incluye: fecha y hora, estado de origen, estado resultante, motivo (cuando aplica) y el administrador responsable (vacío cuando la transición es automática). El tipo de acción se deduce del estado resultante.

---

## Notificaciones

El sistema emite notificaciones push (y en algunos casos email) ante los siguientes eventos:

| Código | Evento | Destinatario | Canal |
|--------|--------|-------------|-------|
| T1 | Nuevo pedido recibido | Dueño y Empleados activos del comercio | Push + Panel |
| T2 | Pedido aceptado y en preparación | Cliente | Push + Panel |
| T3 | Pedido rechazado (con motivo y detalle) | Cliente | Push + Panel |
| T4 | *(fusionado con T2 — la aceptación implica inicio de preparación)* | — | — |
| T5 | Pedido en camino | Cliente | Push + Panel |
| T6 | Pedido listo para retirar | Cliente | Push + Panel |
| T7 | Aviso 75 min sin confirmación de entrega | Cliente | Push + Panel |
| T8 | Pedido auto-confirmado como entregado (incluye opciones: reclamo y contactar comercio) | Cliente | Push + Panel |
| T9 | Pedido cancelado por el cliente | Dueño y Empleados activos del comercio | Push + Panel |
| T10 | Pedido anulado por el comercio (con motivo y detalle) | Cliente | Push + Panel |
| T11 | Pedido cancelado por sistema (con motivo) | Cliente | Push + Panel + Email |
| T12 | Pedido expirado por falta de respuesta del comercio | Cliente | Push + Panel |
| T13 | Pedido expirado — sin respuesta | Dueño y Empleados activos del comercio | Push + Panel |
| T14 | Comercio aprobado | Dueño | Push + Panel + Email |
| T15 | Comercio rechazado (con motivo) | Dueño | Push + Panel + Email |
| T16 | Comercio suspendido (con motivo) | Dueño (el Empleado ve el estado del comercio en su selector, con aviso) | Push + Panel + Email |
| T17 | Nuevo comercio pendiente de revisión | Administrador | Push + Panel |
| T18 | Nueva re-solicitud de comercio rechazado | — (no se notifica al Administrador: la re-solicitud aparece en su bandeja de re-solicitudes) | — |
| T19 | Nuevo reclamo iniciado por cliente | Administrador | Push + Panel |
| T20 | Reclamo aprobado — reembolso en proceso | Cliente | Push + Panel |
| T21 | Reclamo rechazado (con motivo) | Cliente | Push + Panel |
| T22 | Nuevo mensaje de soporte (comercio o cliente suspendido) | Administrador | Push + Panel |
| T23 | Producto removido del carrito por agotado o descontinuado | Cliente | Push + Panel |
| T24 | Cuenta inactivada por inactividad | Usuario (Cliente, Dueño o Empleado) | Email |
| T25 | Comercio inactivado automáticamente | Dueño | Email |
| T26 | Pedido LISTO_PARA_RETIRAR cerrado automáticamente por vencimiento del timer de suspensión del comercio (sin reembolso) | Cliente | Push + Panel |
| T27 | Reembolso fallido definitivamente tras 5 intentos — requiere intervención manual | Administrador | Push + Panel + Email |
| T28 | Cliente suspendido (con motivo) | Cliente | Push + Panel + Email |
| T29 | Suspensión levantada (comercio o cliente) | Cliente o Dueño | Push + Panel + Email |
| T30 | Pedido auto-confirmado como entregado por el sistema (planificado: se suma al final del tramo E3, hoy no se emite a nadie) | Dueño y Empleados activos del comercio | Push + Panel |
| T31 | Invitación para operar un comercio como Empleado | Persona invitada | Email (código en el texto; no genera notificación in-app) |
| T32 | Empleado desactivado de un comercio por el Dueño | Empleado | Push + Panel |
| T33 | Invitación de Empleado aceptada | Dueño | Push + Panel |
| T34 | Empleado renunció a un comercio | Dueño | Push + Panel |
| T35 | Aviso de regularización: se intentó invitar a una cuenta bloqueada, suspendida, inactiva o sin verificar | Persona con esa cuenta | Email |

- Al auto-confirmar la entrega (T8), la notificación incluye botones para iniciar reclamo o contactar al comercio directamente.
- T2 y T4 corresponden al mismo evento: cuando el comercio acepta un pedido, este pasa directamente a EN_PREPARACION. La notificación al cliente unifica ambos conceptos en un único mensaje ("Tu pedido fue aceptado y ya está en preparación").
- La notificación de sesión cerrada en otro dispositivo se envía como email transaccional directo, no a través del sistema de notificaciones push.
- **Notificaciones del Empleado (planificado, tramos E1 a E4):** las operativas (T1, T9, T13 y, al final del tramo E3, T30) se emiten una vez por cada Empleado Activo del comercio, además del Dueño, de modo que cada uno tiene su propia copia que marca como leída por separado. Las administrativas (T14 a T16) y las de cobro (T27 y todo lo de MercadoPago) van solo al Dueño. T33 y T34 se emiten al Dueño con el comercio asociado; T32 usa el mismo tipo `EMPLEADO_DESACTIVADO` que T34, con otro texto. T33 usa el tipo `INVITACION_EMPLEADO` dirigido al Dueño.
- El listado y el contador de notificaciones del contexto Cliente se separan de los del comercio: el Cliente ve solo las notificaciones sin entidad o de sus propios pedidos, y no las asociadas a un comercio (se deja pasar T32, que le concierne a la persona).
- El aviso de regularización (T35) se registra en la tabla de notificaciones con canal Email para poder contar el tope de 3 por día por destinatario; los listados y contadores in-app filtran por canal Push y no muestran esas filas.

---

## Gestión de Productos

- Al marcar un producto como AGOTADO, el sistema debe eliminar ese ítem de los carritos activos que lo contengan y notificar a los clientes afectados (T23), del mismo modo que con DESCONTINUADO.
- Al descontinuar un producto que se encuentre en carritos activos, el sistema debe eliminar ese ítem de los carritos afectados y notificar a los clientes (T23).
- Al visualizarse un carrito, si algún ítem hace referencia a un producto en estado AGOTADO o DESCONTINUADO (por desfase entre la notificación y la vista del carrito), el sistema debe eliminar ese ítem del carrito y notificar al cliente.

---

## Gestión de Reembolsos

- El sistema debe reintentar automáticamente los reembolsos en estado PENDIENTE_REINTENTO ante un fallo previo de MercadoPago.
- Un job periódico detecta las notas de crédito en estado PENDIENTE_REINTENTO y reintenta la solicitud de reembolso a MP.

---

## Gestión del Carrito

- El sistema debe pasar el carrito a estado inactivo al detectar que la sesión del cliente ha expirado o cerrado manualmente.
- El sistema debe pasar el carrito a estado inactivo cuando el usuario sea inactivado automáticamente.
- El sistema no limpia el carrito al crear un pedido en PENDIENTE_PAGO. Solo lo limpia al confirmar el pago (transición a PENDIENTE_CONFIRMACION_COMERCIO).

---

## Invitaciones de Empleado

> **Estado de implementación:** planificado, tramo E1. Estructura en las migraciones `V30` (`InvitacionEmpleado`), `V31` (`HistorialEmpleadoComercio`) y `V32` (`ActividadComercio`).

- Cada envío de una invitación es una fila de `InvitacionEmpleado`: email normalizado, comercio, código de 6 dígitos, estado (Pendiente, Aceptada, Cancelada, Reemplazada, Vencida, Invalidada), intentos fallidos, quién invitó, quién aceptó y vencimiento a 7 días. Reenviar crea una fila nueva y deja la anterior Reemplazada.
- A lo sumo una invitación Pendiente por comercio y email, y un código no puede repetirse entre invitaciones Pendientes del mismo email.
- Límites: máximo 5 envíos por hora por comercio (se cuenta sobre las filas creadas en la última hora) y 5 intentos fallidos por código, tras los cuales la invitación pasa a Invalidada. El sistema no cuenta los intentos por IP ni por persona: quien conozca un email puede gastar los intentos de una invitación, y el Dueño la reenvía.
- No hay un job de vencimiento: una invitación Pendiente con más de 7 días se considera Vencida al consultarla (y al invitar de nuevo se actualiza el estado de la anterior vencida en la misma operación).
- Aceptar con cuenta nueva crea Usuario, PersonaFisica, Cliente y Empleado en una sola transacción, con la aceptación de Términos y Condiciones validada en el servidor; aceptar con cuenta existente alcanza con email y código. Dos aceptaciones simultáneas del mismo código se resuelven en el servidor: gana una y la otra recibe el mismo error genérico de "código incorrecto o vencido". Lo mismo ocurre si se acepta mientras el Dueño cancela o reenvía.
- Al aceptar, el sistema revalida la regla de combinaciones de roles y, si la persona ya tenía una relación con el comercio, la reactiva (misma fila).
- Solo se puede invitar con el comercio Aprobado o Apto para Venta.
- La invitación a una cuenta bloqueada, suspendida, inactiva o sin verificar no se crea; se registra el aviso de regularización (T35), con tope de 3 por día por destinatario, y no se envía a Dueños ni Administradores.

---

## Historial del Equipo de un Comercio

> **Estado de implementación:** planificado, tramo E1 (estructura) y E4 (pantallas).

- El sistema debe registrar en `HistorialEmpleadoComercio` cada evento del equipo: invitación, aceptación, invitación cancelada, baja del Dueño, renuncia y reactivación, con quién lo hizo y cuándo. Los eventos de invitación cuelgan de la invitación; los demás, de la relación (con estado de origen y destino).
- Es una tabla de solo inserción. La ven el Dueño del comercio y, en solo lectura, el Administrador.

---

## Actividad del Comercio

> **Estado de implementación:** planificado, tramo E3 (la tabla se crea en E1).

- El sistema debe registrar en `ActividadComercio` quién hizo qué sobre el comercio: crear, editar, eliminar, cambiar estado, abrir y cerrar, sobre productos, imágenes, pedidos, datos del comercio, redes sociales y, cuando existan, horarios y extras. Guarda el usuario, su rol (Dueño o Empleado), el tipo y nombre de la entidad y un detalle breve, sin guardar valores anteriores.
- Se escribe desde los servicios, en la misma transacción que la escritura, y solo cuando hubo un cambio efectivo. Repite a propósito datos que ya guardan otras tablas (historial de estados del pedido, historial de cierre) para que la vista de equipo lea una sola tabla.
- La ve el Dueño completa y el Administrador en solo lectura; el Empleado no la ve.

---

## Registro de Ejecución de Jobs

Todos los procesos automáticos descritos en este documento (expiración de tokens,
timeouts de pedidos, autoconfirmación de entrega, propagación de estados, timers de
suspensión, reintento de reembolsos y reapertura del cierre manual de comercios) deben registrar su ejecución según la taxonomía
de logs definida en Requisitos No Funcionales — Registro de Eventos del Sistema
(categorías: ejecución de jobs, error, auditoría e idempotencia/casos borde).
