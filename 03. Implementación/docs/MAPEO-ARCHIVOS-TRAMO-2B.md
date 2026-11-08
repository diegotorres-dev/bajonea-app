# Mapeo de archivos — Tramo 2B: notificaciones (solo frontend) y diagnóstico de WebKit (2026-11-07)

Solo frontend, pruebas y documentación. Sin backend ni migraciones. Pendiente de la confirmación de Diego.

## Qué hace

- **Tarjeta de aviso tocable y accesible.** Toda la tarjeta es un enlace (`<a href>`) si el aviso tiene destino y un botón (`<button type="button">`) si no lo tiene; ninguna es un `div` con `onclick`. Con destino lleva un chevron a la derecha y, abajo, una etiqueta con el texto del destino ("Ver pedido", "Ver reclamo", "Ver documentación", "Ver equipo", "Ver panel", "Ver carrito", "Cambiar de cuenta", "Ver comercio"). Zona táctil de al menos 44 px, contorno de foco de 3 px. Las no leídas llevan el fondo suave `--color-primary-soft` (el de "Nuevo") además del punto, y el texto oculto "No leída." al principio del nombre accesible: el estado no depende del color. Sin negrita parcial.
- **Marca de lectura que no se pierde al navegar.** Un clic común espera la marca (`PUT /notificaciones/{id}/leida`) con un tope de 1,5 s y recién entonces navega; si la marca falla o tarda, se navega igual (el error se ignora, como antes). Un clic con Ctrl, Cmd, Mayús, Alt o el botón del medio deja que el navegador abra el enlace aparte y marca la lectura sin esperar. Se eligió esperar con tope (y no `keepalive`) porque `apiFetch` no usa `fetch` con `keepalive` y no hacía falta tocar `api.js` para esto. La marca pasa `handleRedGlobally: false` y `handle5xxGlobally: false` para que un corte no abra el aviso de reintento sobre una pantalla que está por irse.
- **Aviso sin destino.** Un clic lo marca leído (sin toast: el punto y el fondo cambian en el acto) y queda sin acción (`disabled`). Los ya leídos y sin destino nacen `disabled`.
- **Destinos por tipo y por rol** (módulo nuevo `js/destino-aviso.js`, función pura `destinoDeAviso(notificacion, rol, comercios)`; el rol es `CLIENTE`, `DUENO` o `EMPLEADO`). Tabla en la sección siguiente.
- **`?vista=equipo` en `comercio-perfil.html`**, con el mismo mecanismo que `?vista=mercadopago`: abre la vista de equipo y limpia el parámetro de la URL. Solo en contexto Dueño (el Empleado no tiene esa vista y se queda en su perfil).
- **La lista deja de sondear con la pestaña oculta** y refresca apenas vuelve a verse (`visibilitychange`).
- **Salida del pedido no encontrado.** El estado vacío "No encontramos este pedido" del Cliente ya tenía un botón ("Explorar comercios", que no resuelve el problema); ahora ofrece "Ver mis pedidos" (`btn-ver-mis-pedidos`, a `pedidos.html`). `renderEmptyState` de `pedidos.js` recibe la acción por parámetro (el resto de los usos conserva "Explorar comercios").
- **Aviso de otro comercio.** En el panel "Tus comercios", tocar la fila de un comercio seleccionable con notificaciones sin leer lo activa y abre `notificaciones.html` (antes abría el panel). Sin notificaciones sin leer, igual que antes. Las notificaciones de B siguen sin aparecer en la lista de A.
- **Pantallas de espera del Dueño** (`comercio-pendiente`, `comercio-rechazado`, `comercio-rechazo-definitivo`). Verificado con una prueba antes de cambiar nada: un Dueño con un único comercio pendiente **sí** inicia sesión y ve la pantalla de espera, pero la pantalla **no reaccionaba sola** (no había ningún sondeo: ni cambio de pantalla ni sonido). Ahora consulta `GET /comercios/perfil` (con `segundoPlano`, solo con la pantalla visible) cada 15 s y apenas vuelve a verse; si el estado cambia suena el aviso (si el interruptor está encendido, y se espera 0,7 s para que se oiga antes de navegar) y lleva a la pantalla que corresponde (aprobado a `comercio-dashboard.html` con el toast "Tu comercio fue aprobado"; rechazado o rechazo definitivo a su pantalla; pendiente de nuevo a la espera). Con un comercio aprobado y otro pendiente el Dueño trabaja en el aprobado: el otro cambia de etiqueta en el panel "Tus comercios" y suma su notificación, sin sonido ni salto.
- **Panel del Administrador.** (1) La tarjeta de Reembolsos cuenta los reembolsos para revisar (el listado existente: revisión manual y fallidos): "N para revisar" o "Sin reembolsos para revisar", y si el listado no se puede leer conserva "Revisión manual". (2) Las seis tarjetas con acción (comercios pendientes, re-solicitudes, documentos, soporte, reclamos y reembolsos) usan el mismo contador redondo (`alert-card__count--numero`; el de comercios pendientes pasó de punto a número). (3) Las tarjetas con algo pendiente van primero, en las dos secciones, con el orden original como desempate; el orden se calcula solo en la carga inicial. (4) Actualización cada 30 s con la pestaña visible (`segundoPlano`: un fallo no redirige ni avisa), sin tocar el DOM si los números no cambiaron y sin mover tarjetas.

## Equivalencia entre el nombre del aviso y su código T

Fuente: `docs/diccionario-de-datos.md`, tabla de `TipoNotificacion`. "Destino" es el que aplica el Tramo 2B.

| Tipo | Código | Destino (rol) |
|---|---|---|
| `NUEVO_PEDIDO` | T1 | Detalle del pedido del comercio (Dueño, Empleado) |
| `PEDIDO_ACEPTADO` | T2 | Detalle del pedido (Cliente) |
| `PEDIDO_RECHAZADO` | T3 | Detalle del pedido (Cliente) |
| *(sin tipo en el enum)* | T4 | No existe: el diccionario salta del T3 al T5 |
| `PEDIDO_EN_CAMINO` | T5 | Detalle del pedido (Cliente) |
| `PEDIDO_LISTO_RETIRO` | T6 | Detalle del pedido (Cliente) |
| `AVISO_75MIN_SIN_CONFIRMACION` | T7 | Detalle del pedido (Cliente) |
| `PEDIDO_AUTOCONFIRMADO` | T8 | Detalle del pedido (Cliente) |
| `PEDIDO_CANCELADO_CLIENTE` | T9 | Detalle del pedido del comercio |
| `PEDIDO_ANULADO_COMERCIO` | T10 | Detalle del pedido (Cliente) |
| `PEDIDO_CANCELADO_SISTEMA` | T11 | Detalle del pedido (Cliente) |
| `PEDIDO_EXPIRADO_CLIENTE` | T12 | Detalle del pedido (Cliente) |
| `PEDIDO_EXPIRADO_COMERCIO` | T13 | Detalle del pedido del comercio |
| `COMERCIO_APROBADO` | T14 | Panel (Dueño) |
| `COMERCIO_RECHAZADO` | T15 | Pantalla de estado según el comercio, o panel si ya es operativo (Dueño) |
| `COMERCIO_SUSPENDIDO` | T16 | Panel (Dueño) |
| `NUEVO_COMERCIO_PENDIENTE` | T17 | Sin emisor |
| `NUEVA_RESOLICITUD_COMERCIO` | T18 | Sin emisor |
| `NUEVO_RECLAMO` | T19 | Sin emisor |
| `RECLAMO_APROBADO` | T20 | Detalle del pedido, "Ver reclamo" (Cliente) |
| `RECLAMO_RECHAZADO` | T21 | Detalle del pedido, "Ver reclamo" (Cliente) |
| `NUEVO_MENSAJE_SOPORTE` | T22 | Sin emisor |
| `PRODUCTO_REMOVIDO_CARRITO` | T23 | `carrito.html` (Cliente) |
| `CUENTA_INACTIVADA` | T24 | Sin destino: solo se marca leída |
| `COMERCIO_INACTIVADO` | T25 | Sin destino: solo se marca leída |
| `PEDIDO_CERRADO_TIMER_SUSPENSION` | T26 | Sin emisor |
| `REEMBOLSO_FALLIDO_DEFINITIVO` | T27 | Sin emisor |
| `CLIENTE_SUSPENDIDO` | T28 | Sin destino: solo se marca leída |
| `SUSPENSION_LEVANTADA` | T29 | Panel (Dueño); sin destino (Cliente) |
| `PEDIDO_AUTOCONFIRMADO_COMERCIO` | T30 | Detalle del pedido del comercio |
| `INVITACION_EMPLEADO` | T31 (T33 y T35 reutilizan este tipo) | Vista de equipo, `?vista=equipo` (Dueño) |
| `EMPLEADO_DESACTIVADO` | T32 (T34 reutiliza este tipo) | Vista de equipo (Dueño, el aviso de la renuncia); sin destino (Cliente que fue dado de baja) |
| *(reutiliza `INVITACION_EMPLEADO`)* | T33 | Vista de equipo (Dueño): una persona aceptó la invitación |
| *(reutiliza `EMPLEADO_DESACTIVADO`)* | T34 | Vista de equipo (Dueño): el Empleado renunció |
| *(reutiliza `INVITACION_EMPLEADO`, canal `EMAIL`)* | T35 | No se ve en la campana (solo rastro de email) |
| `PEDIDO_NO_RETIRADO` | T36 | Detalle del pedido (Cliente) |
| `EMPLEADO_REACTIVADO` | T37 | `seleccionar-contexto.html` (Cliente) |
| `DOCUMENTO_APROBADO` | T38 | `comercio-documentacion.html` (Dueño) |
| `DOCUMENTO_RECHAZADO` | T39 | `comercio-documentacion.html` (Dueño) |
| `COMERCIO_APTO_VENTA` | T40 | Panel (Dueño) |
| `COMERCIO_SIN_APTITUD` | T41 | Panel (Dueño) |

Tipos que **no tienen código T** en el diccionario (marcados con `—`): `COMERCIO_SUSPENDIDO_EQUIPO` (destino: panel, Empleado), `COMERCIO_SUSPENSION_LEVANTADA_EQUIPO` (panel, Empleado), `DUENO_SUSPENDIDO` y `DUENO_SUSPENSION_LEVANTADA` (solo rastro de email, nunca en la campana). `RECLAMO_REEMBOLSO_DUENO` (destino: detalle del pedido del comercio, "Ver reclamo", Dueño) **tampoco figura en la tabla del diccionario**: existe en el enum desde el tramo S5 sin código T asignado.

## Archivos modificados y creados

| Archivo | Cambio |
|---|---|
| `frontend/js/destino-aviso.js` | **Nuevo.** `destinoDeAviso` y `ROL_AVISO`. |
| `frontend/js/notificaciones.js` | Tarjeta como enlace o botón, chevron, etiqueta de destino, "No leída." accesible, marca con tope de 1,5 s, clic con modificadores, sondeo que respeta la visibilidad. Se sacó `DESTINO_POR_TIPO`. |
| `frontend/css/styles.css` | `.notification-item` (enlace o botón, fondo de no leída, foco, 44 px), `.notification-item__chevron`, `.notification-item__destino`, `.stat-tile` relativo con `.stat-tile__contador`. |
| `frontend/js/comercio.js` | `?vista=equipo`; `llevarAlEstadoActual` y `vigilarCambioDeEstadoDelComercio` (sondeo de las pantallas de espera con sonido y toast). |
| `frontend/js/pedidos.js` | El estado vacío de "No encontramos este pedido" ofrece "Ver mis pedidos". |
| `frontend/js/selector-comercio.js` | Una fila con notificaciones sin leer abre `notificaciones.html`. |
| `frontend/js/admin.js`, `frontend/admin-dashboard.html` | Panel del Administrador: contadores, orden por urgencia y actualización automática. |
| `frontend/js/api.js` | **Defecto real hallado en el diagnóstico de WebKit (Bloque 0):** una lectura (`GET`) que falla por red se reintenta una vez a los 250 ms antes de mandar a `errores/sin-conexion.html`. |

## Pruebas

Specs nuevos (375 px): `108-notificaciones-tarjeta-ui` (10 tests), `109-notificaciones-destinos-ui` (10), `110-comercio-espera-ui` (7) y `111-admin-panel-urgencia-ui` (9). Specs existentes actualizados por el nuevo formato de la tarjeta: `09-notificaciones` (la tarjeta navega, así que la marca se verifica al volver a la lista), `54-empleado-notificaciones-ui` (el `href` está en la tarjeta, no en la etiqueta), `83-documentos-comercio-ui` (cinco destinos, con "Ver panel"), `96-reclamos-dueno-empleado-ui` (el aviso es el enlace; "Ver reclamo"). Specs actualizados por el diagnóstico de WebKit: `91` (sin `clipboard-write` en WebKit) y `105` (reloj pausado en los tests del toast). Resultados: ver la entrada del 2026-11-07 de `docs/DECISIONES.md`.
