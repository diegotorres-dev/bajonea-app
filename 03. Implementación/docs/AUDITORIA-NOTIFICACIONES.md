# Auditoría de notificaciones (Tramo 2A, bloque 2)

Fecha: 2026-11-07. Solo lectura: no se modificó ningún archivo de código para escribir este documento. Fuentes: `TipoNotificacion`, `AudienciaNotificacion`, `NotificacionService`, `NotificacionController`, `NotificacionRepository`, todos los sitios que crean avisos (`PedidoService`, `AdministradorService`, `AptitudVentaComercioService`, `AvisoCuentaService`, `AvisoReclamoService`, `RevisionDocumentoService`, `CarritoService`, `GestionMiembroEquipoService`, `InvitacionEmpleadoService`), y en el frontend `notificaciones.js`, `sonido-avisos.js`, `comercio-activo.js`, `selector-comercio.js`, `admin.js`.

## Resumen ejecutivo

- El enum tiene **42 tipos** (el código no usa la numeración T1 a T41; este documento identifica cada tipo por su nombre). **36 tienen emisor** y se ven en la campana (canal `PUSH`); **6 no tienen emisor** (código muerto): `NUEVO_COMERCIO_PENDIENTE`, `NUEVA_RESOLICITUD_COMERCIO`, `NUEVO_RECLAMO`, `NUEVO_MENSAJE_SOPORTE`, `REEMBOLSO_FALLIDO_DEFINITIVO` y `PEDIDO_CERRADO_TIMER_SUSPENSION`. Dos más (`DUENO_SUSPENDIDO`, `DUENO_SUSPENSION_LEVANTADA`) solo se usan como rastro de un email (canal `EMAIL`), nunca aparecen en la campana.
- `entidad_tipo` solo admite `PEDIDO` y `COMERCIO`. De los 36 tipos con emisor: **19 guardan un pedido**, **15 guardan un comercio** (alcanza para abrir una pantalla del comercio, pero no distingue qué documento, qué invitación ni qué empleado) y **4 no guardan entidad** (`PRODUCTO_REMOVIDO_CARRITO`, `CUENTA_INACTIVADA`, `CLIENTE_SUSPENDIDO` y `SUSPENSION_LEVANTADA` del Cliente).
- **La tarjeta ya es tocable** en parte: al tocar cualquier tarjeta se marca leída y, si hay destino, se navega. Pero solo hay destino para los avisos con `entidad_tipo = PEDIDO` y para 4 tipos de comercio (`DOCUMENTO_*`, `COMERCIO_APTO_VENTA`, `COMERCIO_SIN_APTITUD`); los otros 11 avisos de comercio no llevan a ningún lado, y la tarjeta es un `div` con `onclick` sin `role`, `tabindex` ni soporte de teclado.
- **No hay paginación**: `GET /notificaciones` devuelve toda la historia del usuario, de la más nueva a la más vieja.
- **"Marcar todas" existe solo para el contexto de un comercio** (Dueño y Empleado). El Cliente no tiene endpoint ni botón.
- **Administrador**: sus 5 tipos de aviso no tienen emisor y la campana no existe; el panel muestra contadores de 4 de las 6 cosas que piden acción (comercios, re-solicitudes, documentos, soporte y reclamos, pero **no reembolsos** ni **suspensiones**) y se carga una sola vez, sin actualizarse.

## 2.1 Inventario por tipo

Canal `PUSH` salvo que se diga otra cosa. "Entidad" es `entidad_tipo/entidad_id` que guarda el aviso. El texto es el de hoy (`{x}` es un dato dinámico).

| Tipo | Recibe | Cuándo se dispara | Texto actual | Entidad |
|---|---|---|---|---|
| `NUEVO_PEDIDO` | Dueño y Empleados activos (copia por persona, sin el Cliente del pedido si trabaja ahí) | Se confirma el pago de un pedido | "Nuevo pedido recibido de {Nombre Apellido}." | PEDIDO/id |
| `PEDIDO_ACEPTADO` | Cliente | El comercio acepta | "Tu pedido a {comercio} fue aceptado y está en preparación." | PEDIDO/id |
| `PEDIDO_RECHAZADO` | Cliente | El comercio rechaza; también el rechazo automático por suspensión del comercio | "Tu pedido #{n} a {comercio} fue rechazado por el comercio. Motivo: {motivo}. [Estamos gestionando la devolución de tu pago.] [comentario]" / "Tu pedido se canceló porque el comercio no está disponible. Te devolvemos el dinero." | PEDIDO/id |
| `PEDIDO_EN_CAMINO` | Cliente | Despacho a domicilio | "Tu pedido de {comercio} fue despachado y está en camino." | PEDIDO/id |
| `PEDIDO_LISTO_RETIRO` | Cliente | Despacho de un retiro | "Tu pedido de {comercio} está listo para retirar en el local." | PEDIDO/id |
| `AVISO_75MIN_SIN_CONFIRMACION` | Cliente | Proceso: `EN_CAMINO` pasado el primer umbral | "Tu pedido #{n} está en camino hace un buen rato. Confirmá la recepción cuando llegue." | PEDIDO/id |
| `PEDIDO_AUTOCONFIRMADO` | Cliente | Proceso: autoconfirma la entrega | "Marcamos tu pedido #{n} como entregado. Si tuviste algún problema, podés reclamar dentro de los 7 días desde esta fecha." | PEDIDO/id |
| `PEDIDO_CANCELADO_CLIENTE` | Dueño y Empleados | El Cliente cancela | "El cliente canceló el pedido #{n}." | PEDIDO/id |
| `PEDIDO_ANULADO_COMERCIO` | Cliente | El comercio anula; también anulación automática por suspensión del Dueño | "Tu pedido #{n} a {comercio} fue anulado por el comercio [y estamos gestionando la devolución de tu pago]. Motivo: {motivo}" / texto de suspensión | PEDIDO/id |
| `PEDIDO_CANCELADO_SISTEMA` | Cliente | Proceso: falta de pago, rechazo de pago o suspensión | "Tu pedido #{n} fue cancelado automáticamente: {motivo}." / texto de suspensión | PEDIDO/id |
| `PEDIDO_EXPIRADO_CLIENTE` | Cliente | Proceso: el comercio no respondió | "El comercio no respondió en {m} minutos tu pedido #{n}. Se canceló y estamos gestionando la devolución de tu pago; podés ver su estado en el detalle del pedido." | PEDIDO/id |
| `PEDIDO_EXPIRADO_COMERCIO` | Dueño y Empleados | Proceso: el comercio no respondió | "El pedido #{n} expiró por falta de respuesta." | PEDIDO/id |
| `PEDIDO_AUTOCONFIRMADO_COMERCIO` | Dueño y Empleados | Proceso: autoconfirma la entrega | "El pedido #{n} se confirmó automáticamente como entregado porque el cliente no respondió en {m} minutos." | PEDIDO/id |
| `PEDIDO_NO_RETIRADO` | Cliente | El comercio (o el proceso por suspensión) cierra un retiro no retirado | "Tu pedido #{n} no fue retirado y el comercio lo cerró. Como ya estaba preparado, no hay devolución del pago." | PEDIDO/id |
| `RECLAMO_APROBADO` | Cliente (también `EMAIL`) | El Administrador aprueba | "Aprobamos tu reclamo del pedido #{n} y te vamos a devolver {monto}. El reembolso puede tardar unos días en acreditarse." | PEDIDO/id |
| `RECLAMO_RECHAZADO` | Cliente (también `EMAIL`) | El Administrador rechaza | "Revisamos tu reclamo del pedido #{n} y no pudimos aprobarlo. Motivo: {motivo}" | PEDIDO/id |
| `RECLAMO_REEMBOLSO_DUENO` | Dueño (solo el Dueño) | Reclamo con reembolso | "Reembolsamos {monto} al Cliente por un reclamo del pedido #{n}. Mercado Pago lo descuenta de tu cuenta en la parte que te corresponde." | PEDIDO/id (con `comercio_id`) |
| `COMERCIO_APROBADO` | Dueño | El Administrador aprueba | "Tu comercio {nombre} fue aprobado [y ya podés vender]" | COMERCIO/id |
| `COMERCIO_RECHAZADO` | Dueño | El Administrador rechaza (también el definitivo) | "Tu comercio {nombre} fue rechazado [de forma definitiva]. Motivo: {motivo}" | COMERCIO/id |
| `COMERCIO_SUSPENDIDO` | Dueño | Se suspende el comercio, o la cuenta del Dueño (un aviso por comercio) | "Tu comercio '{nombre}' fue suspendido. Motivo: {motivo}" / "Tu cuenta fue suspendida y tu comercio '{nombre}' quedó suspendido. Motivo: {motivo}" (también `EMAIL`) | COMERCIO/id |
| `SUSPENSION_LEVANTADA` | Cliente o Dueño | Se levanta la suspensión de la cuenta o del comercio | Cliente: "Levantamos la suspensión de tu cuenta. [Mensaje del equipo: …]"; Dueño: "Levantamos la suspensión de tu cuenta y tu comercio '{nombre}' volvió a operar." / "…de tu comercio '{nombre}'." | Cliente: sin entidad; Dueño: COMERCIO/id |
| `COMERCIO_APTO_VENTA` | Dueño | Cumple los requisitos para vender | "Tu comercio {nombre} ya puede recibir pedidos." | COMERCIO/id |
| `COMERCIO_SIN_APTITUD` | Dueño | Deja de cumplirlos (Mercado Pago, documentos) | "Tu comercio {nombre} dejó de recibir pedidos: {falta}." | COMERCIO/id |
| `COMERCIO_INACTIVADO` | Dueño | Inactivación por falta de uso | "Tu comercio '{nombre}' dejó de estar disponible porque tu cuenta quedó inactiva." (también `EMAIL`) | COMERCIO/id |
| `CUENTA_INACTIVADA` | Cliente (cualquier rol de cuenta) | Inactivación por falta de uso | "Tu cuenta quedó inactiva por falta de uso. Iniciá sesión para reactivarla." (también `EMAIL`) | Sin entidad |
| `CLIENTE_SUSPENDIDO` | Cliente | El Administrador suspende la cuenta | "Tu cuenta fue suspendida. Motivo: {motivo}" (también `EMAIL`) | Sin entidad |
| `COMERCIO_SUSPENDIDO_EQUIPO` | Empleados (sin el Dueño) | Se suspende el comercio | "El comercio '{nombre}' fue suspendido. Mientras dure no se aceptan pedidos nuevos." | COMERCIO/id |
| `COMERCIO_SUSPENSION_LEVANTADA_EQUIPO` | Empleados | Se levanta | "Levantaron la suspensión del comercio '{nombre}'. Ya vuelve a funcionar con normalidad." | COMERCIO/id |
| `DOCUMENTO_APROBADO` | Dueño | El Administrador aprueba un documento | "Tu documento «{tipo}» de {comercio} fue aprobado." | COMERCIO/id |
| `DOCUMENTO_RECHAZADO` | Dueño | Rechaza o revoca | "Tu documento «{tipo}» de {comercio} fue rechazado. Motivo: {motivo}" / "Se revocó la aprobación de …" | COMERCIO/id |
| `INVITACION_EMPLEADO` | Dueño | Una persona acepta la invitación | "{Nombre Apellido} aceptó tu invitación y ya es parte del equipo de {comercio}" (el mismo tipo se usa con canal `EMAIL` como rastro del email de regularización a quien se invitó) | COMERCIO/id |
| `EMPLEADO_DESACTIVADO` | Empleado (lo da de baja el Dueño) o Dueño (renuncia) | Baja o renuncia | Empleado: "{comercio} te dio de baja del equipo. Ya no tenés acceso a ese comercio."; Dueño: "{Nombre Apellido} dejó de trabajar en {comercio}." | COMERCIO/id |
| `EMPLEADO_REACTIVADO` | Empleado | El Dueño lo reactiva | "{comercio} te reactivó en el equipo. Ya podés volver a trabajar ahí." | COMERCIO/id |
| `PRODUCTO_REMOVIDO_CARRITO` | Cliente | El producto se agota o se da de baja | "El producto '{nombre}' ya no está disponible y fue eliminado de tu carrito." | Sin entidad |
| `DUENO_SUSPENDIDO`, `DUENO_SUSPENSION_LEVANTADA` | (nadie en la campana) | Solo rastro de email de la suspensión de la cuenta del Dueño | n/a | n/a |
| `NUEVO_COMERCIO_PENDIENTE`, `NUEVA_RESOLICITUD_COMERCIO`, `NUEVO_RECLAMO`, `NUEVO_MENSAJE_SOPORTE`, `REEMBOLSO_FALLIDO_DEFINITIVO` | Administrador | **Sin emisor** | n/a | n/a |
| `PEDIDO_CERRADO_TIMER_SUSPENSION` | Cliente | **Sin emisor** (reemplazado por `PEDIDO_NO_RETIRADO`) | n/a | n/a |

Entidades que no alcanzan para abrir una pantalla puntual:

- Los 15 avisos de comercio guardan `COMERCIO/id` pero no la entidad relacionada: sirven para llevar al comercio, no al documento, la invitación o el empleado concretos. Para las pantallas actuales alcanza (la documentación es una lista por comercio y el equipo es una vista por comercio).
- Los avisos de `RECLAMO_*` guardan el pedido (no el reclamo): alcanza porque el reclamo vive dentro del detalle del pedido.
- `EMPLEADO_DESACTIVADO` y `EMPLEADO_REACTIVADO` para el Empleado guardan el comercio pero **no llevan `comercio_id`** (son avisos personales, para que se vean sin tener acceso). Es correcto, pero el destino no puede ser una pantalla del comercio.
- `PEDIDO_RECHAZADO`, `PEDIDO_ANULADO_COMERCIO` y `PEDIDO_CANCELADO_SISTEMA` se reutilizan para cancelaciones por suspensión con un texto genérico: el tipo no distingue la causa.

## 2.2 Destino propuesto

URLs reales, sin anchors ni JWT. "Hoy" indica si el destino ya funciona con la tarjeta actual.

| Tipo | Rol | Destino propuesto | Estado hoy |
|---|---|---|---|
| `NUEVO_PEDIDO`, `PEDIDO_CANCELADO_CLIENTE`, `PEDIDO_EXPIRADO_COMERCIO`, `PEDIDO_AUTOCONFIRMADO_COMERCIO` | Dueño y Empleado | `comercio-pedido-detalle.html?id={entidadId}` | Funciona (`entidad_tipo = PEDIDO` y contexto de comercio) |
| `RECLAMO_REEMBOLSO_DUENO` | Dueño | `comercio-pedido-detalle.html?id={entidadId}` (muestra el bloque de reclamo en solo lectura) | Funciona |
| Los 10 `PEDIDO_*` del Cliente y `RECLAMO_APROBADO`/`RECLAMO_RECHAZADO` | Cliente | `pedido-detalle.html?id={entidadId}` (muestra el bloque "Tu reclamo") | Funciona; el enlace dice "Ver pedido" también para un reclamo |
| `COMERCIO_APTO_VENTA`, `COMERCIO_SIN_APTITUD` | Dueño | `comercio-dashboard.html` | Funciona (mapeado) |
| `DOCUMENTO_APROBADO`, `DOCUMENTO_RECHAZADO` | Dueño | `comercio-documentacion.html` | Funciona (mapeado) |
| `COMERCIO_APROBADO` | Dueño | `comercio-dashboard.html` | Falta mapear |
| `COMERCIO_RECHAZADO` | Dueño | La pantalla de estado del comercio (`rutaDeEstado(comercio)`: `comercio-rechazado.html?id=` o `comercio-rechazo-definitivo.html?id=`) | Falta mapear; `rutaDeEstado` ya existe en `comercio-activo.js` |
| `COMERCIO_SUSPENDIDO`, `SUSPENSION_LEVANTADA` (Dueño) | Dueño | `comercio-dashboard.html` (muestra el banner de estado) | Falta mapear |
| `COMERCIO_SUSPENDIDO_EQUIPO`, `COMERCIO_SUSPENSION_LEVANTADA_EQUIPO` | Empleado | `comercio-dashboard.html` | Falta mapear |
| `INVITACION_EMPLEADO`, `EMPLEADO_DESACTIVADO` (renuncia) | Dueño | "Ver equipo" de `comercio-perfil.html` | **Falta agregar** `?vista=equipo`: hoy el parámetro `vista` solo reconoce `mercadopago` (`comercio.js:2565`) |
| `EMPLEADO_REACTIVADO` | Empleado (como Cliente) | `seleccionar-contexto.html` (para elegir ese comercio) | Falta mapear |
| `EMPLEADO_DESACTIVADO` (baja) | Empleado (como Cliente) | Ninguno: ya no tiene acceso; solo marcar leído | Hoy no tiene enlace (correcto) |
| `PRODUCTO_REMOVIDO_CARRITO` | Cliente | `carrito.html` | Falta mapear |
| `COMERCIO_INACTIVADO`, `CUENTA_INACTIVADA`, `CLIENTE_SUSPENDIDO`, `SUSPENSION_LEVANTADA` (Cliente) | Dueño o Cliente | Ninguno útil: la persona solo ve estos avisos después de reactivar o de que levanten la suspensión; solo marcar leído | Hoy sin enlace (correcto) |

Verificaciones pedidas:

1. **Que la pantalla exista y acepte el parámetro.** Todas existen, salvo la vista de equipo con parámetro (hay que sumar `?vista=equipo` a `comercio-perfil.html`, el mismo mecanismo que `?vista=mercadopago`) y la entrada de `seleccionar-contexto.html`, que no necesita parámetro.
2. **Entidad inexistente o sin acceso.** El backend responde el `404` de siempre y nunca `403` (el Cliente ajeno recibe `404` en el detalle de pedido porque se busca dentro de su propia lista). Las pantallas dan una salida: `comercio-pedido-detalle.html` muestra "No encontramos este pedido" con el botón "Ver mis pedidos"; `pedido-detalle.html` muestra el mismo estado vacío **sin botón de salida** (hay que agregarlo en el tramo 2B). Un Empleado que perdió el acceso recibe la hoja de pérdida de acceso del tramo E4.
3. **Multi-comercio.** El problema planteado (aviso del comercio B estando activo el A) **no ocurre en la lista**: la lista y el contador filtran por el comercio activo (`X-Comercio-Id`), así que desde A nunca se ve una tarjeta de B. El aviso de B se ve en el punto de la franja y en el panel "Tus comercios". Para llegar a él hay que activar B (tocar la fila en el panel hace `activarComercio` y va al panel). Lo que falta es que, desde un aviso pendiente de B, tocar su fila lleve directo a `notificaciones.html` de B y no al panel (ver la decisión D4). Un enlace de aviso no necesita llevar el comercio en la URL porque el comercio activo ya es el dueño del aviso; si se agregara un `?comercio=` habría que validar que sea del Dueño (el `404` idéntico ya existe) y activarlo antes de abrir.
4. **Empleado.** Los avisos de pedido del equipo abren `comercio-pedido-detalle.html`, que el Empleado puede ver (con su DTO reducido y el `409 PEDIDO_PROPIO` si es su pedido). Los avisos exclusivos del Dueño (`COMERCIO_*`, `DOCUMENTO_*`, `INVITACION_EMPLEADO`, `RECLAMO_REEMBOLSO_DUENO`) no le llegan nunca (audiencia `DUENO`). Lo que sí le llega a un Empleado y no debería abrir una pantalla vedada: `COMERCIO_SUSPENDIDO_EQUIPO` y su levantamiento (destino `comercio-dashboard.html`, que sí puede ver) y los dos avisos personales de alta y baja (destino selector de contexto o ninguno). `comercio-documentacion.html` y la vista de equipo redirigen al Empleado al panel: no se le deben ofrecer.
5. **Dos avisos al mismo destino o informativos.** Es el caso de `COMERCIO_APTO_VENTA`, `COMERCIO_SIN_APTITUD`, `COMERCIO_APROBADO`, `COMERCIO_SUSPENDIDO` y su levantamiento (todos al panel), de los tres `EQUIPO` de pedido de cierre (`PEDIDO_CANCELADO_CLIENTE`, `PEDIDO_EXPIRADO_COMERCIO`, `PEDIDO_AUTOCONFIRMADO_COMERCIO`, informativos del pedido ya cerrado) y de los avisos sin destino útil. Propuesta: el panel muestra el estado vigente, así que ahí tocar solo abre el panel; para los informativos sin destino, tocar solo marca leído y la tarjeta no se ve "tocable" (sin chevron).

## 2.3 Comportamiento actual de la tarjeta y de la lista

- **Tocar la tarjeta.** El `div` `notification-item` tiene un `click`: llama a `PUT /notificaciones/{id}/leida` (si no estaba leída) y, si hay destino, navega. El enlace "Ver pedido" o "Ver documentación" dentro de la tarjeta hace lo mismo. Si la marca de lectura falla se ignora el error y se navega igual.
- **Accesibilidad.** La tarjeta no es un botón ni un enlace: sin `role`, sin `tabindex`, sin foco por teclado, sin `aria-label`. Solo el enlace interno es accesible. Zona táctil: la tarjeta completa mide al menos unos 70 px de alto (padding de 16 px y dos líneas de texto), el enlace interno tiene 14 px de texto sin padding propio (menos de 44 px).
- **Leída frente a no leída.** Punto naranja de 8 px (`var(--color-primary)`) a la izquierda de las no leídas, y el texto pasa de `--color-text` a `--color-text-muted` en las leídas. La diferencia es sutil y depende del color y de un punto de 8 px (no hay tipografía más gruesa).
- **Marcar leída.** Una por una al tocar. "Marcar todas" solo en contexto de comercio (ver 2.4).
- **Paginación y límite.** Ninguno: el backend devuelve todo (ordenado por fecha descendente, sin `LIMIT`) y el frontend dibuja todo. Con volumen alto (un comercio con cientos de pedidos por día) la lista y el sondeo se vuelven pesados.
- **Estado vacío.** "Todavía no tenés notificaciones" con un texto propio para el comercio o el Cliente. Funciona.
- **Sondeo.** La pantalla de la lista hace su propio `setInterval` de 15 s a `GET /notificaciones` (`segundoPlano`, sin pintar si la lista no cambió, comparando por `id:leida`). Aparte, la campana del Cliente hace un sondeo de 15 s al contador y el Dueño y el Empleado usan el sondeo único de `mis-comercios` / `empleados/mis-comercios`. Conviven sin pisarse (el contador de la campana y la lista son independientes); el costo es que con la lista abierta hay dos o tres pedidos cada 15 s. No se detiene con la pestaña oculta (la campana sí lo hace con `document.hidden`).
- **Roles.** `initNotificaciones` solo acepta `CLIENTE` y `DUENO`; un Administrador va al login.

## 2.4 "Marcar todas"

- **Endpoints de hoy:** `PUT /api/v1/notificaciones/{id}/leida` (cualquier rol, una propia), `PUT /api/v1/notificaciones/leidas` (Dueño y Empleado activos; header `X-Comercio-Id` obligatorio; marca las del comercio abierto) y `PUT /api/v1/notificaciones/comercio/{comercioId}/leidas` (solo Dueño; ruta con el comercio; lo usan las pantallas de estado).
- **Pantallas:** el botón `btn-marcar-todas-leidas` está en `notificaciones.html` solo en contexto de comercio (Dueño y Empleado). El Cliente no lo tiene.
- **Para el Cliente haría falta:**
  - Backend: que `PUT /notificaciones/leidas` acepte la llamada **sin** header y en ese caso marque los avisos personales (`comercio_id IS NULL`, canal `PUSH`) en lotes por clave primaria, como ya hace `marcarLeidasDelUsuarioEnComercio`. Hoy `marcarLeidasDelComercioActivo` exige el comercio (`resolver` falla sin header). Conviene un método nuevo (`marcarLeidasPersonales`) y que el controller decida por la presencia del header, o una ruta nueva `PUT /notificaciones/personales/leidas`. Tests: Java (solo marca las propias, no toca las de comercio, idempotente, `0` la segunda vez), carpeta de Newman nueva y estrés corto contra el fan-out (marcar mientras llegan avisos).
  - Frontend: mostrar el botón también en el contexto de Cliente (`crearAccionMarcarTodas` ya existe), con el mismo toast.
  - Detalle: el Administrador no necesita nada (no tiene campana).

## 2.5 Textos (heurísticas de Nielsen)

Criterios: lenguaje cotidiano, qué pasó y qué hacer, sin jerga ni códigos, y que no se revele al rol lo que no puede ver.

| Tipo | Problema | Propuesta |
|---|---|---|
| `NUEVO_PEDIDO` | No lleva el número del pedido: en la lista es difícil saber a cuál se refiere | "Pedido nuevo #{n} de {Nombre Apellido}." |
| `AVISO_75MIN_SIN_CONFIRMACION` | "hace un buen rato" es vago | "Tu pedido #{n} sigue en camino. Si ya lo recibiste, confirmalo para cerrarlo." (el umbral es configurable, así que no conviene poner "75 minutos" en el texto) |
| `PEDIDO_RECHAZADO` (suspensión) | El tipo dice rechazado y el texto dice cancelado; sin número de pedido | "Cancelamos tu pedido #{n} porque el comercio no está disponible. Te devolvemos el dinero." |
| `PEDIDO_ANULADO_COMERCIO`, `PEDIDO_CANCELADO_SISTEMA` (suspensión) | Mismo texto sin número de pedido | Mismo texto que el anterior, con número |
| `PEDIDO_CANCELADO_CLIENTE` | Sin qué hacer | Puede quedar: es informativo |
| `PEDIDO_EXPIRADO_COMERCIO` | "expiró por falta de respuesta" no dice que el Cliente recibe la devolución ni el límite | "El pedido #{n} se canceló porque nadie lo respondió a tiempo." |
| `COMERCIO_RECHAZADO` | No dice qué hacer | Agregar "Corregilo y volvé a solicitarlo" cuando todavía es posible (no cuando es definitivo) |
| `DOCUMENTO_RECHAZADO` | No dice qué hacer | Agregar "Subí uno nuevo." |
| `COMERCIO_SIN_APTITUD` | Con el sufijo ": {falta}." sale "…dejó de recibir pedidos: falta vincular Mercado Pago." Está bien; sin pantalla destino ("Ver qué falta" ya existe) | Sin cambio de texto |
| `CUENTA_INACTIVADA`, `CLIENTE_SUSPENDIDO` | **Quedan viejos**: el aviso dice "Iniciá sesión para reactivarla" o "tu cuenta fue suspendida" y la persona solo lo lee cuando la cuenta ya volvió | Mostrarlos con el texto en pasado ("Tu cuenta estuvo inactiva por falta de uso y la reactivaste.") o no mostrarlos en la campana (ya hay email) |
| `RECLAMO_REEMBOLSO_DUENO` | "Mercado Pago lo descuenta de tu cuenta en la parte que te corresponde" afirma algo sobre un reparto que **no está verificado contra Mercado Pago real** (queda anotado en la lista de despliegue) | Cambiar a "Reembolsamos {monto} al Cliente por un reclamo del pedido #{n}." sin la segunda oración hasta verificarlo |
| `EMPLEADO_DESACTIVADO` (baja) | Tono correcto, pero el aviso no tiene destino | Sin cambio de texto |
| `PEDIDO_AUTOCONFIRMADO_COMERCIO` | Correcto | Sin cambio |
| `NUEVO_PEDIDO` para el Empleado | Lleva el nombre del Cliente. El DTO del Empleado también lo muestra (`nombreCliente`), así que no se revela algo nuevo | Sin cambio |

Los avisos de pedido nunca incluyen datos reservados del Dueño (comisión, neto, Mercado Pago): los textos de arriba lo cumplen. El único texto de comercio con dinero es `RECLAMO_REEMBOLSO_DUENO`, que solo recibe el Dueño.

## 2.6 Sonido

El sonido (tramo 1) lo dispara `vigilarAvisos(clave, noLeidas)` cuando el **contador de no leídas sube** y existe un id de aviso sin leer más nuevo que el último visto (`sonido-avisos.js`). Por eso:

- Suena para cualquier tipo que aparece en la lista del rol: el Cliente con `GET /notificaciones/no-leidas/contador` (clave `cliente`), y el Dueño y el Empleado con `cantidadNotificacionesNoLeidas` del comercio **activo** de `mis-comercios` (clave `comercio-{id}`).
- **Excepciones:**
  1. **Comercios no activos.** Un aviso del comercio B estando activo el A no suena (solo se vigila el activo). Aparece como punto en la franja y en el panel, sin sonido. Decisión D4.
  2. **Pantallas de estado** (`comercio-pendiente`, `comercio-rechazado`, `comercio-rechazo-definitivo`): el comercio de la pantalla no está operativo y no es el activo; hay que verificar si `COMERCIO_APROBADO` y `COMERCIO_RECHAZADO` suenan mientras el Dueño espera ahí (la lectura del código dice que no; **sin comprobar con una prueba**).
  3. **Primera carga.** No suena (queda la línea base), a propósito.
  4. **Lectura y sonido en la misma pasada.** Si el usuario lee un aviso y llega otro en el mismo intervalo, el contador no sube y no suena (limitación aceptada del tramo 1).
  5. **Pestaña oculta o audio bloqueado.** Sin gesto previo el navegador no deja sonar (ya cubierto por el interruptor y el aviso de audio bloqueado).
  6. **Administrador.** No tiene campana ni avisos: no suena nada.
  7. **Avisos del Cliente en contexto de Empleado.** Un Empleado que está dentro de un comercio vigila los del comercio; los personales de su cuenta de Cliente (por ejemplo, el aviso de que lo reactivaron) no suenan hasta que cambia de cuenta.

## 2.7 Panel del Administrador

El Administrador no tiene campana ni avisos personales (la audiencia `ADMINISTRADOR` tiene 5 tipos sin emisor). Su panel (`admin-dashboard.html`, `initAdminDashboard` en `admin.js`) hoy:

- **Deja claro qué requiere acción** para comercios pendientes (tarjeta con contador y enlace), re-solicitudes (contador en la tarjeta), documentos por revisar (tarjeta), soporte (subtítulo "N esperan tu respuesta") y reclamos (subtítulo "N pendientes de revisar").
- **No lo deja claro** para: **reembolsos** (la tarjeta dice "Revisión manual" fija, sin contar cuántos hay en `PENDIENTE_REVISION_MANUAL` o `FALLIDO`; el dato existe en `GET /administrador/reembolsos`), **suspensiones** (nada que revisar por diseño, salvo "email no enviado" de Dueños y Clientes) y **consultas de Soporte** y **reclamos** con el subtítulo gris cuando son cero (correcto) pero sin énfasis cuando son más de cero.
- **No se actualiza solo**: la carga es única (`Promise.all` de métricas y perfil, sin `setInterval`). Un contador cambia solo al recargar.

Mejoras baratas, solo frontend, con datos que ya existen:

1. **Tarjeta de Reembolsos con contador**: pedir `GET /administrador/reembolsos` (o reutilizar la lista que ya devuelve) y mostrar "N para revisar" con el mismo estilo del contador de re-solicitudes. Sin backend nuevo, pero un pedido más al cargar.
2. **Énfasis visual homogéneo**: usar el mismo contador redondo (hoy comercios, re-solicitudes y documentos lo tienen; soporte y reclamos usan solo subtítulo) en las 5 tarjetas con acción.
3. **Ordenar el panel por urgencia**: las tarjetas con algo pendiente primero (hoy el orden es fijo).
4. **Actualización automática**: repetir `GET /administrador/metricas` cada 30 a 60 s mientras la pestaña esté visible, sin pintar si no cambió (el mismo patrón que la lista de avisos). Un pedido de métricas es una consulta de conteos.
5. **Indicador de "email no enviado"** (hoy solo se ve dentro de las listas de Dueños y Clientes): sumar un contador en las tarjetas "Clientes" y "Dueños" usando los listados que ya existen. Costo medio.

Sin campana ni backend nuevo, como se pidió.

## 2.8 Plan del Tramo 2B

Propuesta ordenada, con lo que toca backend.

1. **Bloque 1: tarjeta tocable y accesible.** Convertir la tarjeta en un enlace (`<a>`) o un botón con `role`, `tabindex` y estados de foco, destino único por tipo, chevron solo si hay destino, zona táctil de 44 px, texto del enlace correcto ("Ver reclamo" en vez de "Ver pedido" para `RECLAMO_*`). Tabla `DESTINO_POR_TIPO` completa según 2.2, separada por contexto (Cliente, Dueño, Empleado). **Frontend**, sin backend.
2. **Bloque 2: destinos faltantes y salidas.** `?vista=equipo` en `comercio-perfil.html`; botón de salida en el estado "No encontramos este pedido" del Cliente; `rutaDeEstado` para `COMERCIO_RECHAZADO`; selector de contexto para `EMPLEADO_REACTIVADO`. **Frontend**.
3. **Bloque 3: "Marcar todas" para el Cliente.** Backend chico (método y endpoint o rama sin header, tests Java, Newman, estrés corto) más frontend. **Toca backend.**
4. **Bloque 4: paginación o tope de la lista.** `GET /notificaciones?limite=&cursor=` con cursor por `(fecha, id)` y "Ver más" (como la Actividad del Dueño), o un tope de las últimas N con un aviso. **Toca backend.**
5. **Bloque 5: textos.** Los cambios de 2.5 que Diego apruebe. Cambiar un texto de un aviso nuevo **no migra los viejos** (quedan con el texto con que se crearon). **Backend** (solo literales y los tests que los comparan).
6. **Bloque 6: avisos que quedan viejos.** Decidir qué hacer con `CUENTA_INACTIVADA` y `CLIENTE_SUSPENDIDO` (ver 2.5). **Backend o frontend**, según la decisión.
7. **Bloque 7: panel del Administrador.** Las mejoras 1 a 4 de 2.7. **Frontend**.
8. **Bloque 8: limpieza.** Eliminar o documentar los 6 tipos sin emisor. Eliminarlos exige una migración del ENUM de la base y de `EnumsContraBaseDeDatosIntegrationTest`; conviene dejarlos documentados y no tocarlos.

Estimación: bloques 1, 2, 7 son solo frontend (el grueso), 3 y 4 tocan backend, 5 toca backend sin lógica.

### Decisiones que necesita Diego (con recomendación)

- **D1. Forma de la tarjeta.** (a) toda la tarjeta es un enlace; (b) la tarjeta marca leída y un botón "Ver…" navega. **Recomendación: (a)**, con el chevron solo si hay destino y marcar leída al tocar.
- **D2. Avisos informativos sin destino útil** (cuenta suspendida, inactivada, baja del equipo). **Recomendación:** tocar solo marca leída, sin chevron.
- **D3. Avisos viejos de cuenta** (`CUENTA_INACTIVADA`, `CLIENTE_SUSPENDIDO`). **Recomendación:** dejarlos de crear en la campana (ya llegan por email y la persona los ve en pantalla al ingresar); los viejos se pueden ocultar con un filtro por tipo en el listado.
- **D4. Avisos de otro comercio del Dueño.** (a) dejar como hoy (punto en la franja y en el panel, sin sonido); (b) además hacer sonar cualquier comercio del Dueño. **Recomendación: (a)** y sumar que tocar la fila de B en el panel, si tiene avisos sin leer, abra `notificaciones.html` de B. El sonido de todos los comercios molestaría a quien mira uno solo.
- **D5. Paginación.** Cursor con "Ver más" (como la Actividad) o tope fijo de 50. **Recomendación:** cursor, porque el historial no se borra nunca.
- **D6. Marcar todas del Cliente.** **Recomendación:** sí, con la rama sin header del mismo endpoint (menos superficie que una ruta nueva).
- **D7. Los 6 tipos sin emisor.** **Recomendación:** dejarlos y documentarlos; borrarlos exige tocar los ENUM de la base.
- **D8. Texto de `RECLAMO_REEMBOLSO_DUENO`.** **Recomendación:** quitar la segunda oración hasta verificar el reparto en Mercado Pago real.
- **D9. Panel del Administrador.** **Recomendación:** hacer las mejoras 1 a 4 de 2.7 y dejar la 5 para después.

### Preguntas abiertas

- ¿La numeración T1 a T41 de los documentos de análisis debe llevarse al código (por ejemplo, como un campo del enum) o queda solo en los documentos?
- ¿Hay que verificar con una prueba si los avisos `COMERCIO_APROBADO` y `COMERCIO_RECHAZADO` suenan en las pantallas de estado (2.6, excepción 2)?
- ¿Se quiere que un Empleado reciba también `PEDIDO_CANCELADO_CLIENTE` y los otros informativos de cierre, o alcanza con `NUEVO_PEDIDO` y los de acción?
