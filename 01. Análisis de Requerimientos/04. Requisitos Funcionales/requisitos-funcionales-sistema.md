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

## Propagación Automática de Estados Usuario → Comercio

- Al pasar un usuario con rol Comercio a estado Bloqueado, el sistema debe cambiar automáticamente el estado del comercio asociado a Cerrado Temporalmente.
- Al pasar un usuario con rol Comercio a estado Inactivo, el sistema debe cambiar automáticamente el estado del comercio a Inactivo y ocultarlo del catálogo.
- Al pasar un usuario con rol Comercio a estado Suspendido, el sistema debe cambiar automáticamente el estado del comercio a Suspendido y ocultarlo del catálogo.
- Al revertirse el estado Bloqueado del usuario via recuperación de contraseña, el sistema debe restaurar automáticamente el estado del comercio a Aprobado, siempre que el comercio estuviera en estado Cerrado Temporalmente en ese momento.
- Al revertirse el estado Inactivo del usuario via token de reactivación de cuenta, el sistema debe restaurar automáticamente el estado del comercio a Aprobado, siempre que el comercio estuviera en estado Inactivo en ese momento.

---

## Gestión de Tokens

- El sistema debe expirar todos los tokens al vencer, invalidarlos tras su primer uso y registrar la fecha de expiración o uso: verificación de email, recuperación de contraseña y reactivación de cuenta.
- El sistema gestiona los tres tipos de token en una única tabla discriminada por tipo (VERIFICACION_EMAIL, RECUPERACION_PASSWORD, REACTIVACION_CUENTA), con campos: id, usuario_id, tipo, token, fecha_creacion, fecha_vencimiento, fecha_uso, estado (PENDIENTE, UTILIZADO, EXPIRADO).
- Un job periódico procesa los tokens con fecha_vencimiento <= NOW() y estado = PENDIENTE, actualizando su estado a EXPIRADO.

---

## Gestión de Pedidos

### Estados del Pedido

Los pedidos pueden encontrarse en los siguientes estados:

- **PENDIENTE_PAGO**: pedido creado, redirigido a MercadoPago, esperando confirmación de cobro.
- **PENDIENTE**: pago confirmado por MP vía webhook, esperando aceptación o rechazo por el comercio.
- **EN_PREPARACION**: pedido aceptado por el comercio, en proceso de preparación.
- **EN_CAMINO**: pedido despachado. Aplica solo a modalidad domicilio.
- **LISTO_PARA_RETIRAR**: pedido listo. Aplica solo a modalidad retiro.
- **ENTREGADO**: pedido completado, ya sea por confirmación del cliente, del comercio o por el sistema.
- **RECHAZADO**: el comercio rechazó el pedido estando en estado PENDIENTE. Genera reembolso automático.
- **CANCELADO**: cancelado por el cliente antes del despacho (domicilio) o antes de estar listo (retiro). Genera reembolso automático.
- **ANULADO**: anulado por el comercio desde estado EN_PREPARACION. Genera reembolso automático.
- **CANCELADO_POR_SISTEMA**: cancelado automáticamente por el sistema ante suspensión del comercio, pago no confirmado (timeout) o pago rechazado por MP. Genera reembolso solo si el pago fue previamente confirmado.
- **EXPIRADO**: el comercio no respondió dentro de la hora de margen tras la confirmación del pago. Genera reembolso automático al cliente.

### Campo Discriminador

La tabla Pedido incluye el campo `cancelado_por` (enum nullable: CLIENTE, COMERCIO, SISTEMA), que se registra únicamente en los estados terminales negativos: RECHAZADO, CANCELADO, ANULADO, CANCELADO_POR_SISTEMA y EXPIRADO.

### Creación de Pedido y Carrito

- El sistema crea el pedido en estado PENDIENTE_PAGO antes de redirigir al cliente a MercadoPago. El carrito no se limpia en este momento.
- El sistema limpia el carrito del cliente únicamente al recibir la confirmación exitosa de pago vía webhook de MP (transición a PENDIENTE).
- Si el carrito se limpia por timeout de PENDIENTE_PAGO, permanece intacto para que el cliente pueda reintentar.

### Webhook de MercadoPago

- El sistema debe exponer un endpoint seguro para recibir las notificaciones (webhooks) de MercadoPago, validando la autenticidad de cada notificación mediante la firma enviada por MP.
- Al recibir confirmación de pago aprobado: actualizar el pedido de PENDIENTE_PAGO a PENDIENTE, limpiar el carrito del cliente y notificar al comercio del nuevo pedido.
- Al recibir notificación de pago rechazado: actualizar el pedido de PENDIENTE_PAGO a CANCELADO_POR_SISTEMA (motivo: pago rechazado por MP, cancelado_por: SISTEMA), sin generar reembolso. El carrito del cliente permanece intacto.
- Si el webhook llega para un pedido ya en estado CANCELADO_POR_SISTEMA (por ejemplo, el timeout fue procesado antes de que llegara el webhook de pago aprobado), el sistema debe generar el reembolso correspondiente inmediatamente, ya que el cobro efectivamente se realizó.

### Timeouts Automáticos

- **Timeout PENDIENTE_PAGO (30 minutos):** un job periódico detecta pedidos en estado PENDIENTE_PAGO con más de 30 minutos de antigüedad sin recibir confirmación de MP. El sistema los cancela con estado CANCELADO_POR_SISTEMA (motivo: pago no confirmado, cancelado_por: SISTEMA), sin generar reembolso. El carrito permanece intacto.
- **Timeout PENDIENTE — Expiración por falta de respuesta del comercio (1 hora):** un job periódico detecta pedidos en estado PENDIENTE con más de 1 hora de antigüedad sin respuesta del comercio. El sistema cambia su estado a EXPIRADO (cancelado_por: SISTEMA), genera la nota de crédito y solicita el reembolso correspondiente, y notifica al cliente y al comercio.

### Timer de Entrega a Domicilio (75/90 minutos)

- El sistema emite un aviso al cliente (notificación T7) cuando su pedido a domicilio supera los 75 minutos en estado EN_CAMINO sin confirmación de recepción.
- Al cumplirse 90 minutos sin confirmación, el sistema cambia el pedido a ENTREGADO automáticamente (fuente_entrega: SISTEMA) y emite la notificación T8 con opciones para iniciar reclamo o contactar al comercio. No se emite aviso previo adicional en el momento de la autoconfirmación.
- Este automatismo no aplica a pedidos de retiro.

### Suspensión de Comercio — Gestión de Pedidos Activos

Al suspenderse un comercio por el Administrador, el sistema debe procesar los pedidos activos de la siguiente manera:

- **PENDIENTE y EN_PREPARACION:** cancelar con estado CANCELADO_POR_SISTEMA (motivo: comercio suspendido, cancelado_por: SISTEMA), generar nota de crédito y reembolso para cada pedido abonado, y notificar a cada cliente afectado con el motivo de la cancelación.
- **EN_CAMINO:** marcar automáticamente como ENTREGADO (fuente_entrega: SISTEMA). El envío ya estaba en curso y el comercio había cumplido su parte. Sin reembolso.
- **LISTO_PARA_RETIRAR:** iniciar un timer de 90 minutos para cada pedido en este estado. Si el cliente se presenta y el comercio (o el sistema) confirma el retiro antes del vencimiento, el pedido se marca ENTREGADO normalmente. Si vencen los 90 minutos sin retiro confirmado, el sistema marca el pedido como ENTREGADO automáticamente (fuente_entrega: SISTEMA, sin reembolso). El cliente es notificado de la situación al momento de la suspensión.

### Inactivación de Comercio — Gestión de Pedidos Activos

Al inactivarse automáticamente un comercio por inactividad (3 meses sin actividad del usuario representante), el sistema cancela los pedidos en estado PENDIENTE y EN_PREPARACION con estado CANCELADO_POR_SISTEMA, genera los reembolsos correspondientes y notifica a los clientes afectados. Los pedidos EN_CAMINO o LISTO_PARA_RETIRAR siguen su curso normal (la inactivación por 3 meses de inactividad implica que no hay entregas activas en ese momento).

---

## Historial de Acciones sobre Comercios

- El sistema debe registrar en la entidad HistorialAccionComercio cada acción administrativa realizada sobre un comercio: aprobación, rechazo, suspensión y reactivación por levantamiento de suspensión. Cada registro incluye: fecha y hora, rol e identificador del actor (administrador), tipo de acción, motivo (cuando aplica) y estado resultante del comercio.

---

## Notificaciones

El sistema emite notificaciones push (y en algunos casos email) ante los siguientes eventos:

| Código | Evento | Destinatario | Canal |
|--------|--------|-------------|-------|
| T1 | Nuevo pedido recibido | Comercio | Push + Panel |
| T2 | Pedido aceptado y en preparación | Cliente | Push + Panel |
| T3 | Pedido rechazado (con motivo y detalle) | Cliente | Push + Panel |
| T4 | *(fusionado con T2 — la aceptación implica inicio de preparación)* | — | — |
| T5 | Pedido en camino | Cliente | Push + Panel |
| T6 | Pedido listo para retirar | Cliente | Push + Panel |
| T7 | Aviso 75 min sin confirmación de entrega | Cliente | Push + Panel |
| T8 | Pedido auto-confirmado como entregado (incluye opciones: reclamo y contactar comercio) | Cliente | Push + Panel |
| T9 | Pedido cancelado por el cliente | Comercio | Push + Panel |
| T10 | Pedido anulado por el comercio (con motivo y detalle) | Cliente | Push + Panel |
| T11 | Pedido cancelado por sistema (con motivo) | Cliente | Push + Panel + Email |
| T12 | Pedido expirado por falta de respuesta del comercio | Cliente | Push + Panel |
| T13 | Pedido expirado — sin respuesta | Comercio | Push + Panel |
| T14 | Comercio aprobado | Comercio | Push + Panel + Email |
| T15 | Comercio rechazado (con motivo) | Comercio | Push + Panel + Email |
| T16 | Comercio suspendido (con motivo) | Comercio | Push + Panel + Email |
| T17 | Nuevo comercio pendiente de revisión | Administrador | Push + Panel |
| T18 | Nueva re-solicitud de comercio rechazado | Administrador | Push + Panel |
| T19 | Nuevo reclamo iniciado por cliente | Administrador | Push + Panel |
| T20 | Reclamo aprobado — reembolso en proceso | Cliente | Push + Panel |
| T21 | Reclamo rechazado (con motivo) | Cliente | Push + Panel |
| T22 | Nuevo mensaje de soporte (comercio o cliente suspendido) | Administrador | Push + Panel |
| T23 | Producto removido del carrito por agotado o descontinuado | Cliente | Push + Panel |
| T24 | Cuenta inactivada por inactividad | Usuario (cliente o comercio) | Email |
| T25 | Comercio inactivado automáticamente | Comercio | Email |
| T26 | Pedido LISTO_PARA_RETIRAR cerrado automáticamente por vencimiento del timer de suspensión del comercio (sin reembolso) | Cliente | Push + Panel |
| T27 | Reembolso fallido definitivamente tras 5 intentos — requiere intervención manual | Administrador | Push + Panel + Email |
| T28 | Cliente suspendido (con motivo) | Cliente | Push + Panel + Email |
| T29 | Suspensión levantada (comercio o cliente) | Cliente o Comercio | Push + Panel + Email |
| T30 | Pedido auto-confirmado como entregado por el sistema | Comercio | Push + Panel |

- Al auto-confirmar la entrega (T8), la notificación incluye botones para iniciar reclamo o contactar al comercio directamente.
- T2 y T4 corresponden al mismo evento: cuando el comercio acepta un pedido, este pasa directamente a EN_PREPARACION. La notificación al cliente unifica ambos conceptos en un único mensaje ("Tu pedido fue aceptado y ya está en preparación").
- La notificación de sesión cerrada en otro dispositivo se envía como email transaccional directo, no a través del sistema de notificaciones push.

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
- El sistema no limpia el carrito al crear un pedido en PENDIENTE_PAGO. Solo lo limpia al confirmar el pago (transición a PENDIENTE).

---

## Registro de Ejecución de Jobs

Todos los procesos automáticos descritos en este documento (expiración de tokens,
timeouts de pedidos, autoconfirmación de entrega, propagación de estados, timers de
suspensión y reintento de reembolsos) deben registrar su ejecución según la taxonomía
de logs definida en Requisitos No Funcionales — Registro de Eventos del Sistema
(categorías: ejecución de jobs, error, auditoría e idempotencia/casos borde).
