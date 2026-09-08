# Mapeo pantallas ↔ archivos — Fase 16, Tramo 7

Relación exacta entre las 4 pantallas lógicas del catálogo de Fase 15 correspondientes a este tramo (Comercio: pedidos recibidos) y los archivos generados en `frontend/`. Mismo formato que `docs/MAPEO-ARCHIVOS-TRAMO1.md`–`TRAMO6.md`.

---

## CO — Comercio (4 pantallas → 2 archivos `.html` nuevos + `js/comercio.js` ampliado)

| Pantalla(s) | Archivo | Relación |
|---|---|---|
| CO18 (Lista de Pedidos: Con Pedidos Activos) | `frontend/comercio-pedidos.html` (+ `js/comercio.js`, función `initComercioPedidos`) | Ya estaba enrutada desde el Tramo 5 (`renderBottomNavComercio` apuntaba a `comercio-pedidos.html` desde antes de que existiera el archivo). 4 chips de filtro por estado real de `EstadoPedido` (`Todos`/`Pendientes`/`En preparación`/`Rechazados`) — mismo patrón exacto que los 4 chips de `comercio-productos.html` (Tramo 6), sin inventar un quinto filtro "Activos" que la guía de Figma no respalda con ningún campo real. Lista ordenada por prioridad de estado (`PENDIENTE` → `EN_PREPARACION` → `RECHAZADO`, pendientes primero) y, dentro de cada grupo, por fecha descendente — reutiliza `renderPedidoActivoCard` del dashboard (Tramo 5), con `ESTADO_BADGE_COMERCIO` ampliado para incluir `RECHAZADO` (el dashboard solo necesitaba `PENDIENTE`/`EN_PREPARACION` porque filtra a pedidos activos; la lista completa de este tramo necesita las 3). |
| CO19 (Detalle de Pedido: PENDIENTE), CO21 (Detalle de Pedido: EN_PREPARACIÓN) | `frontend/comercio-pedido-detalle.html` (+ `js/comercio.js`, función `initComercioPedidoDetalle`) | 2 pantallas, 1 archivo — mismo criterio ya usado en `pedido-detalle.html` del Cliente (Tramo 4): un único detalle cuyo contenido (ícono, texto de estado, acciones) se resuelve por el `estado` real que devuelve el backend, no un archivo por estado. También resuelve el estado `RECHAZADO` (sin pantalla propia en el catálogo de Fase 15 para el lado Comercio, pero alcanzable navegando desde CO18) con el mismo banner de motivo/comentario que ya usa el Cliente, en vez de dejar un estado sin cobertura visual. |
| CO20 (Modal: Rechazar Pedido con Motivo) | Sin archivo propio — función `mostrarModalRechazarPedido` en `js/comercio.js`, invocada desde el botón "Rechazar pedido" de CO19 | Reutiliza `.product-modal-sheet` (el mismo bottom sheet ya usado para el kebab de productos en el Tramo 6) en vez de `.modal-sheet` (reservado a confirmaciones simples de icono+texto+2 botones) porque este modal necesita un formulario real: `<select>` con las 7 opciones de `MotivoRechazo` (`.select-shell`, mismo componente que el selector de categoría de `comercio-producto-form.html`) y un `<textarea>` opcional para el comentario (`.textarea-shell`). Validación nativa (`select` `required` + `form.reportValidity()`) bloquea el submit sin motivo — probado real, sin ningún request disparado. |

**Modificado (no nuevo):** `frontend/js/comercio.js` — suma `initComercioPedidos`, `initComercioPedidoDetalle`, `mostrarModalRechazarPedido`, `renderAccionesPendiente`, `renderPedidoDetalleComercio`, `renderPedidoNoEncontrado`, más el ícono `truck` (copiado de `js/pedidos.js`, mismo SVG) y las constantes `MOTIVOS_RECHAZO`/`MOTIVO_RECHAZO_LABEL`/`ESTADO_DETALLE_COMERCIO`/`FILTROS_PEDIDOS`/`PRIORIDAD_ESTADO_PEDIDO`. `renderPedidoActivoCard` (dashboard, Tramo 5) corregida: el `href` de cada card apuntaba a `comercio-pedidos.html` como placeholder porque el detalle todavía no existía — ahora apunta a `comercio-pedido-detalle.html?id=<id>`, mismo patrón que `renderPedidoCard` del lado Cliente. `ESTADO_BADGE_COMERCIO` (dashboard) ampliado con la variante `RECHAZADO`.

**Sin cambios:** `css/styles.css` — las 4 pantallas se armaron reutilizando componentes ya existentes de tramos anteriores (`.chip-row`/`.chip`, `.pedido-card`, `.status-badge` con sus 3 variantes, `.pedido-detail__*`, `.summary-card`, `.order-line`, `.section-heading`, `.state-page`, `.product-modal-sheet`, `.select-shell`, `.textarea-shell`, `.btn-primary`/`.btn-secondary`/`.btn-tertiary`) — ninguna clase nueva hizo falta.

---

## Resumen numérico

| | Cantidad |
|---|---|
| Pantallas lógicas del tramo | 4 (CO18, CO19, CO20, CO21) |
| Construidas | 4 |
| Archivos `.html` nuevos | 2 (`comercio-pedidos.html`, `comercio-pedido-detalle.html`) |
| Archivos `.js` nuevos | 0 |
| Archivos `.js` modificados | 1 (`js/comercio.js`) |
| Archivos `.css` modificados | 0 |

---

## Endpoints reales usados (confirmados antes de programar, ninguno inventado)

- `GET /api/v1/pedidos/comercio` — listado propio del comercio (CO18), y también reutilizado en `comercio-pedido-detalle.html` para resolver el pedido a mostrar por `id` — no existe `GET /pedidos/comercio/{id}`, mismo patrón ya usado en `pedido-detalle.html` del Cliente (Tramo 4) y en `comercio-producto-form.html` (Tramo 6) para resolver por `id` sobre un listado ya filtrado por JWT.
- `PUT /api/v1/pedidos/comercio/{id}/aceptar` — acción "Aceptar pedido" (CO19); `409` real si el pedido ya no está `PENDIENTE`.
- `PUT /api/v1/pedidos/comercio/{id}/rechazar` — acción "Rechazar pedido" tras confirmar el modal CO20, body `{ motivo, comentario }` (`RechazoPedidoRequestDTO`).

**Confirmado, no inventado — sin transición posterior a `EN_PREPARACION`:** `EstadoPedido` (`backend/.../enums/EstadoPedido.java`) tiene exactamente 3 valores (`PENDIENTE`, `EN_PREPARACION`, `RECHAZADO`), y `PedidoController`/`PedidoService` no exponen ningún endpoint que mueva un pedido fuera de `EN_PREPARACION` (no hay `ENTREGADO`, `LISTO_PARA_RETIRAR`, etc. en el MVP — ver `docs/modelo-mvp.md`, nota de alcance 9, y `CLAUDE.md` §1 "Explícitamente fuera del MVP"). CO21 se construyó deliberadamente de solo lectura: mismo bloque `pedido-detail__*` que CO19/CO19-rechazado, sin ningún botón, aviso de "próximamente", ni texto que sugiera una acción que no existe — `renderAccionesPendiente` solo se invoca cuando `pedido.estado === 'PENDIENTE'`.

---

## Cobertura de Figma en este tramo

Cuota mensual del MCP de Figma (plan Starter) seguía agotada — confirmado con un intento real de `get_metadata` sobre el nodo raíz de la página "MVP" (`140:2`), que devolvió el mismo error de límite de los Tramos 5/6. Fallback de navegador contra el archivo real (`https://www.figma.com/design/C4MQqdvDqGL45sbEcmOozB/Bajoneá?node-id=140-2`): el archivo cargó correctamente (confirmado por consola — sesión de multiplayer conectada, versión del archivo sincronizada) y `read_page`/`read_console_messages` funcionaron con normalidad, pero la herramienta de captura de pantalla (`computer` → `screenshot`) dio timeout sistemático contra el lienzo de Figma en cada intento (5 intentos, con esperas crecientes entre cada uno) — a diferencia del resto de la sesión, donde la misma herramienta funcionó sin problema contra `localhost` (frontend real). No se identificó la causa exacta (posible conflicto entre el motor de renderizado WebGL del lienzo de Figma y el mecanismo de captura), pero se descartó que fuera un problema de permisos o de la página: la accesibilidad del lienzo de Figma está deshabilitada por diseño de la propia aplicación ("La compatibilidad con lectores de pantalla para el tablero está deshabilitada actualmente"), así que tampoco había forma de minar texto real vía `read_page` como en Tramos 2/6. **Cero contenido visual o textual nuevo se extrajo de Figma en este tramo.**

Las 4 pantallas se construyeron replicando el sistema de diseño ya establecido en los Tramos 4/5/6 (paleta `--color-*`, tipografía `Nunito`/`Inter`, iconografía lineal `stroke="currentColor"`, componentes `pedido-card`/`pedido-detail__*`/`product-modal-sheet` ya existentes) y el contrato real del backend, sin ningún texto ni referencia visual extraída de Figma en esta sesión — mismo criterio y misma advertencia que se dejó para el Tramo 4 (única otra sesión con cobertura de Figma nula). Si una auditoría futura encuentra diferencias de copy o layout contra el Figma real, el origen es este gap de cobertura, no una decisión deliberada de desvío.

---

## Verificación cruzada Comercio → Cliente (lo más importante del tramo)

Probado con el backend Spring Boot real (perfil `test`) y el frontend servido localmente. Se usó `cliente.demo@bajonea.test` / `comercio1.demo@bajonea.test` (contraseña `Demo1234` para ambos, ver entrada de `docs/DECISIONES.md`).

1. Se crearon 2 pedidos nuevos reales contra `comercio1.demo` (Sabores Fueguinos) desde `cliente.demo`: pedido `#17` (Empanada de Pollo, RETIRO) y `#18` (Milanesa Napolitana, RETIRO), vía el flujo real de carrito + checkout (API, no simulado).
2. Con `notificaciones.html` de `cliente.demo` ya abierto (polling de 15s activo, construido en el Tramo 4) y **sin recargar la pestaña**, se aceptó el pedido `#17` desde una sesión de `comercio1.demo` independiente (`PUT /pedidos/comercio/17/aceptar`). Tras ~18 segundos de espera real, la notificación "Tu pedido fue aceptado y está en preparación." apareció sola en la lista del Cliente — confirmado por `read_network_requests` mostrando múltiples `GET /api/v1/notificaciones` disparados por el `setInterval` durante la espera, no una recarga manual.
3. Mismo procedimiento para el pedido `#18`, rechazado (`PUT /pedidos/comercio/18/rechazar`, motivo `ALTO_VOLUMEN_PEDIDOS`) — la notificación "Tu pedido #18 fue rechazado por el comercio. Motivo: Alto volumen de pedidos. Prueba cruzada Tramo 7" apareció sola en la misma pestaña, sin recargar, unos segundos después de la anterior.
4. Confirmado también en `pedidos.html` del Cliente (con recarga, comportamiento esperado — esa pantalla no hace polling, solo `notificaciones.js` lo hace, decisión ya tomada en el Tramo 4): `#17` con badge "En preparación", `#18` con badge "Rechazado", el resto de los pedidos sin cambios.
5. **Conclusión: el mecanismo de polling construido en el Tramo 4 (16.4) efectivamente levanta el cambio de estado disparado desde el lado Comercio de este tramo, de punta a punta contra el backend real, sin intervención manual en la sesión del Cliente.**

---

## Probado end-to-end contra el backend real (no simulado)

1. **CO18 con datos reales:** login como `comercio1.demo` → `comercio-pedidos.html` muestra los 7 pedidos reales del comercio, ordenados correctamente (pendientes primero, luego en preparación, luego rechazados, cada grupo por fecha descendente), badges correctos por estado.
2. **Filtros de CO18 probados reales:** el chip "Pendientes" filtra correctamente a solo el pedido `#16` (único `PENDIENTE` del comercio en ese momento) — confirmado con el contenido real del DOM tras el click.
3. **CO19 (PENDIENTE) con datos reales:** pedido `#16` — cliente, modalidad (retiro), desglose, total y los 2 botones de acción, todos con datos reales.
4. **CO21 (EN_PREPARACIÓN) con datos reales:** pedido `#13` — mismo layout que CO19 pero sin ningún botón de acción, dirección de envío a domicilio real renderizada con el ícono de camión.
5. **Detalle en estado RECHAZADO (alcanzable desde CO18, sin pantalla propia en el catálogo de Fase 15 pero cubierto por el mismo archivo):** pedido `#14` — banner real con motivo "Sin stock" y comentario real de una sesión anterior.
6. **Flujo real de aceptación vía UI (no API cruda):** pedido `#20` (creado para esta prueba) → botón "Aceptar pedido" → `PUT /pedidos/comercio/20/aceptar` real (`200`) → la misma pantalla se vuelve a renderizar en el lugar (sin navegación) mostrando "En preparación", sin los botones de acción — confirmado con captura de pantalla real antes y después.
7. **Flujo real de rechazo vía UI, incluida la validación del modal:** pedido `#19` (creado para esta prueba) → "Rechazar pedido" → modal CO20 → submit sin motivo seleccionado → bloqueado por validación nativa, confirmado que ningún `PUT /rechazar` se disparó (`read_network_requests` vacío para ese patrón) → motivo "Problema técnico" + comentario real seleccionados → submit → `PUT /pedidos/comercio/19/rechazar` real (`200`) → detalle re-renderizado en el lugar mostrando "Rechazado" con el motivo y comentario reales.
8. **Aislamiento por tenant, `comercio2.demo` contra un pedido de `comercio1.demo`:** `comercio-pedido-detalle.html?id=20` (pedido real de `comercio1.demo`) logueado como `comercio2.demo` → "No encontramos este pedido", sin ningún dato del pedido ajeno visible en ningún momento — mismo mecanismo que el resto del proyecto: `GET /pedidos/comercio` ya viene filtrado por JWT del lado del backend (`PedidoService.listarPedidosComercio`), así que el pedido ajeno ni siquiera llega al navegador. Confirmado también que `comercio-pedidos.html` de `comercio2.demo` solo lista su propio pedido (`#15`), ninguno de los de `comercio1.demo`.
9. **Casos de error probados reales:** `comercio-pedido-detalle.html?id=999999` (inexistente) y `comercio-pedido-detalle.html` sin `?id=` → mismo estado "No encontramos este pedido" en ambos casos, sin excepciones de JS en consola.
10. **Dashboard (Tramo 5) corregido y verificado:** las cards de "Pedidos activos" en `comercio-dashboard.html`, que hasta este tramo enlazaban al placeholder `comercio-pedidos.html`, ahora enlazan realmente a `comercio-pedido-detalle.html?id=<id>` — confirmado leyendo los `href` reales del DOM tras cargar el dashboard.
11. Consola del navegador revisada en cada paso (`read_console_messages`) — sin errores en ningún punto del recorrido.
12. Regla de "cero comentarios en `frontend/`" verificada con `grep` sobre los 2 archivos `.html` nuevos y sobre el bloque nuevo de `js/comercio.js`.

**Incidente de entorno, no de código:** la herramienta de automatización de navegador (`computer` → `left_click` por coordenadas o por `ref`) falló de forma intermitente durante esta sesión — varios clicks sobre botones reales (login, "Rechazar pedido", los chips de filtro) no dispararon el evento a pesar de reportar éxito, mientras que un `.click()` real disparado por JavaScript sobre el mismo elemento del DOM sí funcionó siempre. Se usó ese método como respaldo cuando un click por coordenadas no producía ningún request de red tras 1-2 reintentos, y se re-verificó visualmente con captura de pantalla que el resultado fuera el mismo que produciría un click real de usuario. No se encontró ninguna causa relacionada con el código de este tramo — el mismo patrón de fallo intermitente ya se había visto contra el lienzo de Figma (ver sección de cobertura arriba).

**Contraseña fijada para `comercio2.demo@bajonea.test`:** no estaba documentada de sesiones anteriores (a diferencia de `comercio1.demo`/`cliente.demo`, fijadas en el Tramo 6). Se fijó a `Demo1234` vía el flujo real de recuperación de contraseña (mismo procedimiento y mismo valor que las otras 2 cuentas demo), para poder probar el aislamiento por tenant sin inventar una cuenta nueva. Ver `docs/DECISIONES.md`.

**Datos que quedan en la base al cierre de esta sesión** (mismo criterio que tramos anteriores — cuenta demo persistente, útil para sesiones futuras):
- Pedido `#17` (Empanada de Pollo, `cliente.demo` → `comercio1.demo`) → `EN_PREPARACION`.
- Pedido `#18` (Milanesa Napolitana, `cliente.demo` → `comercio1.demo`) → `RECHAZADO`, motivo `ALTO_VOLUMEN_PEDIDOS`.
- Pedido `#19` (2x Empanada de Pollo, `cliente.demo` → `comercio1.demo`) → `RECHAZADO`, motivo `PROBLEMA_TECNICO`, rechazado vía el modal real de la UI.
- Pedido `#20` (Empanada de Pollo, `cliente.demo` → `comercio1.demo`) → `EN_PREPARACION`, aceptado vía el botón real de la UI.
- Pedido `#16` (2x Empanada de Carne, `cliente.demo` → `comercio1.demo`) → sin tocar, sigue `PENDIENTE` (se dejó deliberadamente intacto para no perder el único caso `PENDIENTE` real de la cuenta demo).
- `comercio2.demo@bajonea.test` → contraseña fijada a `Demo1234` (antes desconocida).

## Checklist de cierre del Tramo 7

- [x] Checklist del Tramo 6 confirmado 100% cerrado antes de arrancar este tramo (revisado contra `docs/MAPEO-ARCHIVOS-TRAMO6.md` y la entrada de `docs/DECISIONES.md` correspondiente — los 9 puntos del checklist ya estaban en `[x]`).
- [x] Nombres exactos de capa (CO18, CO19, CO20, CO21) confirmados contra `docs/PANTALLAS-MVP-FASE15.md` antes de programar.
- [x] Endpoints reales inventariados antes de programar — confirmado que `EstadoPedido` no tiene transición posterior a `EN_PREPARACION`, CO21 construida de solo lectura en consecuencia, sin inventar ningún botón ni endpoint.
- [x] CO18 con los 3 estados reales de pedido y su indicador visual, más el filtro "Todos", datos reales del comercio de prueba, orden por prioridad de estado.
- [x] CO19/CO21 con exactamente las acciones que el backend soporta para cada estado.
- [x] CO20 con validación real de motivo obligatorio, las 7 opciones reales de `MotivoRechazo`, comentario opcional.
- [x] Verificación cruzada Comercio → Cliente confirmada de punta a punta contra el backend real: el polling del Tramo 4 levanta el cambio de estado sin recargar la pestaña del Cliente (accept y reject, ambos casos).
- [x] Aislamiento por tenant probado real en ambos sentidos (comercio2 no ve ni opera pedidos de comercio1; comercio1 conserva acceso normal a los suyos).
- [x] Casos de error (id inexistente, sin `?id=`) probados reales, sin excepciones de consola.
- [x] Bug preexistente del Tramo 5 corregido de paso: las cards de "Pedidos activos" del dashboard ahora enlazan al detalle real, no al placeholder.
- [x] Las 4 pantallas generadas reutilizando componentes existentes de `styles.css`/`js/api.js`/`js/catalogo.js`/`js/comercio.js`, sin CSS nuevo.
- [x] Regla de "cero comentarios en `frontend/`" verificada con `grep`.
- [x] Datos que quedan en la base documentados explícitamente, incluida la contraseña nueva de `comercio2.demo`.
- [x] Gap total de cobertura del MCP de Figma en este tramo (cuota agotada + timeout sistemático del fallback de navegador contra el lienzo) documentado explícitamente, no ocultado.

Con esto, el Tramo 7 de 9 de la Fase 16 queda cerrado. Siguen los tramos 8 y 9 (panel de Administrador, integración final) en sesiones futuras.
