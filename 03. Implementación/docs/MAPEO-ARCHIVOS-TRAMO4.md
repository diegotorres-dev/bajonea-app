# Mapeo pantallas ↔ archivos — Fase 16, Tramo 4

Relación exacta entre las 7 pantallas lógicas del catálogo de Fase 15 correspondientes a este tramo (Cliente: Pedidos y Notificaciones) y los archivos generados en `frontend/`. Mismo formato que `docs/MAPEO-ARCHIVOS-TRAMO1.md`/`TRAMO2.md`/`TRAMO3.md`.

---

## C — Cliente (7 pantallas del tramo → 3 archivos `.html` nuevos + 2 `.js` nuevos + 1 `.js` modificado)

| Pantalla(s) | Archivo | Relación |
|---|---|---|
| C33, C34 | `frontend/pedidos.html` (+ `frontend/js/pedidos.js`, función `initPedidosHistorial`) | 2 pantallas, 1 archivo. C33 (con pedidos) y C34 (empty state) son el mismo `GET /api/v1/pedidos/cliente` — lo que cambia es si la lista viene vacía o no, mismo criterio que C09/C10 (Tramo 3) y C01/C02/C03 (Tramo 2). |
| C22, C23, C28 | `frontend/pedido-detalle.html` (+ `frontend/js/pedidos.js`, función `initPedidoDetalle`) | 3 pantallas, 1 archivo. Un único detalle de pedido cuyo contenido (ícono, color, texto de estado, banner de motivo de rechazo) se resuelve por el `estado` real (`PENDIENTE`/`EN_PREPARACION`/`RECHAZADO`) que devuelve el backend — mismo criterio que C09/C10 y C01/C02/C03. |
| C44, C45 | `frontend/notificaciones.html` (+ `frontend/js/notificaciones.js`, función `initNotificaciones`) | 2 pantallas, 1 archivo. C44 (con notificaciones) y C45 (empty state) son el mismo `GET /api/v1/notificaciones` — variante de estado vacío, no un archivo aparte. |

**Modificado (no nuevo):** `frontend/js/catalogo.js` — `renderTopBar` (componente compartido desde el Tramo 2) suma un ícono de campana con badge numérico de no leídas (`GET /notificaciones/no-leidas/contador`), visible solo para usuario con sesión y rol `CLIENTE`, linkeando a `notificaciones.html`. Solo aparece en la variante "estándar" del top-bar (sin botón de volver) — la que usan `catalogo.html`, `perfil.html` (vista principal) y ahora `pedidos.html`; la variante con botón de volver no se tocó. `frontend/css/styles.css` suma las clases nuevas de este tramo (`.top-bar__action--bell`, `.top-bar__badge-dot`, `.pedido-list`, `.pedido-card` y sub-clases, `.status-badge` y sus 3 variantes, `.pedido-detail__*`, `.notification-list`, `.notification-item` y sub-clases), reutilizando los tokens de diseño existentes sin definir ninguno nuevo.

---

## Resumen numérico

| | Cantidad |
|---|---|
| Pantallas lógicas del tramo | 7 |
| Construidas | 7 |
| Archivos `.html` nuevos | 3 (`pedidos.html`, `pedido-detalle.html`, `notificaciones.html`) |
| Archivos `.js` nuevos | 2 (`js/pedidos.js`, `js/notificaciones.js`) |
| Archivos `.js` modificados | 1 (`js/catalogo.js`) |
| Pantallas sin archivo `.html` propio | 0 (a diferencia de tramos anteriores, este tramo no tuvo modales nuevos) |

---

## Cobertura real de Figma (MCP) en este tramo

A diferencia de los Tramos 2 y 3 — donde `get_design_context` fallaba por cuota agotada pero `get_metadata` seguía funcionando sin costo —, en este tramo **la primera llamada del tramo, un `get_metadata` sobre el nodo raíz del prototipo (`140:2`), ya devolvió el error de límite total de llamadas del plan Starter** ("You've reached the Figma MCP tool call limit on the Starter plan"), no solo el límite específico de `get_design_context` documentado en tramos previos. Es un límite distinto y más amplio: cubre todas las herramientas del MCP de Figma, no solo la de generación de código. No se reintentó contra el límite (mismo criterio ya establecido: no perder tiempo reintentando una cuota agotada) — **cero llamadas al MCP de Figma tuvieron éxito en este tramo**, ni siquiera de minería de texto vía metadata.

Las 7 pantallas se construyeron replicando el sistema de diseño ya establecido en los Tramos 1 a 3 (paleta de `--color-*`, tipografía `Nunito`/`Inter`, iconografía lineal `stroke="currentColor"`, componentes `state-page`/`summary-card`/`order-line`/`banner` ya existentes) y el contrato real del backend, sin ningún texto ni referencia visual extraída de Figma en esta sesión. Si una auditoría futura encuentra diferencias de copy o layout contra el Figma real, el origen es este gap de cobertura, no una decisión deliberada de desvío.

---

## Endpoints reales usados (confirmados antes de programar, ninguno inventado)

- `GET /api/v1/pedidos/cliente` — historial completo del cliente autenticado (filtrado por JWT). **No existe un endpoint de detalle por id** (`GET /api/v1/pedidos/cliente/{id}`) — `pedido-detalle.html` reutiliza este mismo listado y busca el pedido por id del lado del cliente. Confirmado leyendo `PedidoController`/`PedidoService` antes de programar, no asumido.
- `GET /api/v1/catalogo/comercios` (público) — usado para resolver `comercioId → nombre/dirección`, mismo patrón ya establecido en el Tramo 2 para `comercio-detalle.html` y en el Tramo 3 para `checkout.html` ("ausencia de un endpoint `GET /catalogo/comercios/{id}` singular resuelta trayendo la lista completa"). `PedidoResponseDTO` no expone `nombreComercio` ni la dirección del comercio (solo `comercioId` y, para `DOMICILIO`, la dirección del cliente) — no se amplió el backend porque el dato ya es público y accesible por este camino ya usado en tramos anteriores.
- `GET /api/v1/notificaciones` — listado del usuario autenticado, orden descendente por fecha (ya verificado por el backend en el cierre de la Fase 12).
- `PUT /api/v1/notificaciones/{id}/leida` — marca una notificación como leída al hacer click sobre ella en `notificaciones.html`.
- `GET /api/v1/notificaciones/no-leidas/contador` — badge de la campana en el top-bar.
- `PUT /api/v1/pedidos/comercio/{id}/aceptar` y `PUT /api/v1/pedidos/comercio/{id}/rechazar` — no consumidos por ninguna pantalla de este tramo (son de rol `COMERCIO`, fuera de alcance de "Cliente: pedidos y notificaciones"), pero sí usados manualmente contra el backend real para preparar los datos de prueba de `EN_PREPARACION`/`RECHAZADO` necesarios para probar C23/C28 (ver sección de pruebas).

---

## Intervalo de polling: decisión tomada en este tramo, no dato preexistente

La guía (`docs/GUIA-IMPLEMENTACION-MVP-BAJONEA.pdf`, sección 12.2) dice literalmente "el frontend hace polling cada X segundos (Fase 16)" — delega el número a esta fase sin fijarlo. No hay ningún valor ya decidido en `CLAUDE.md` ni en `docs/DECISIONES.md` de sesiones anteriores. Se fijó **15 segundos** (`POLLING_INTERVAL_MS` en `js/notificaciones.js`) como balance entre frescura percibida y volumen de requests contra un backend real sin caché de por medio — el `setInterval` se limpia con `beforeunload` y cada tick compara una firma liviana (`id:leida` de cada notificación) contra la anterior para repintar solo si hubo cambios reales, no en cada tick.

---

## Confirmado, no asumido: aislamiento por tenant en pedido-detalle

`pedido-detalle.html` no tiene un endpoint propio de "pedido por id" que pudiera devolver `403`/`404` — reutiliza `GET /pedidos/cliente`, que ya viene filtrado por JWT del lado del backend (mismo mecanismo verificado en el cierre de la Fase 12). Probado con un caso real: logueado como el cliente de prueba vacío (`cliente.vacio.tramo4@bajonea.test`, creado y eliminado en este mismo tramo) navegando directo a `pedido-detalle.html?id=13` (pedido real del cliente demo, otro usuario) → el listado propio del cliente vacío no contiene el id 13 → pantalla "No encontramos este pedido", sin ningún dato del pedido ajeno visible en ningún momento (ni en el DOM ni en Network). Mismo resultado para un id inexistente (`999999`) y para la URL sin `?id=`.

---

## Probado end-to-end contra el backend real (no simulado)

Con el backend Spring Boot real (perfil `test`) y el frontend servido por `python -m http.server`:

1. **Preparación de datos reales para cubrir los 3 estados de C22/C23/C28:** los pedidos `#13`/`#14`/`#15` (creados en el Tramo 3, los 3 en `PENDIENTE`) no cubrían `EN_PREPARACION` ni `RECHAZADO`. Se usó el endpoint real de rol `COMERCIO` (fuera del alcance de pantallas de este tramo, pero ya existente desde la Fase 8/9) para transicionarlos: `PUT /pedidos/comercio/13/aceptar` (como `comercio1.demo@bajonea.test`) → `#13` a `EN_PREPARACION`; `PUT /pedidos/comercio/14/rechazar` con `motivo=SIN_STOCK` → `#14` a `RECHAZADO`. `#15` quedó `PENDIENTE` sin tocar. Esto generó además 2 notificaciones reales nuevas para el cliente, sumadas a las 2 preexistentes del Tramo 3 (purga de carrito por producto agotado).
2. **C33 (historial con pedidos):** login con `cliente.demo@bajonea.test` → `pedidos.html` muestra los 3 pedidos reales, ordenados por fecha descendente, con badge de estado correcto por cada uno (`Pendiente`/`Rechazado`/`En preparación`), nombre real del comercio resuelto vía `/catalogo/comercios`, resumen de ítems y total reales.
3. **C22/C23/C28 (detalle en los 3 estados):** navegación real a `pedido-detalle.html?id=15` (`PENDIENTE`, delivery, dirección real del cliente), `?id=13` (`EN_PREPARACION`, ícono y color distintos) y `?id=14` (`RECHAZADO`, con el banner de motivo "Sin stock" + comentario real y la dirección del comercio para el caso de retiro). Los 3 verificados con captura de pantalla real.
4. **C44 (notificaciones con datos):** `notificaciones.html` muestra las 4 notificaciones reales con punto de no leída; click sobre la primera dispara `PUT /notificaciones/59/leida` real (confirmado en Network), el punto desaparece sin recargar la página.
5. **Polling real confirmado, no simulado:** con la pestaña abierta 18 segundos sobre `notificaciones.html`, `read_network_requests` mostró múltiples `GET /api/v1/notificaciones` adicionales espaciados en el tiempo más allá de la carga inicial — el `setInterval` efectivamente pega al backend cada 15 segundos, no es un timer decorativo.
6. **Badge de la campana:** en `catalogo.html`, la campana mostró "4" antes de marcar la notificación como leída y "3" después, en una recarga posterior de la página — confirmado con `document.querySelector('.top-bar__badge-dot').textContent` sobre el DOM real.
7. **C34/C45 (empty states):** se registró un cliente descartable (`cliente.vacio.tramo4@bajonea.test`) por el flujo real de registro + verificación (vía `GET /test/token`, perfil `test`), sin ningún pedido ni notificación. `pedidos.html` mostró el empty state real de C34; `notificaciones.html` mostró el empty state real de C45; la campana no mostró ningún badge (contador real en `0`). Cliente y sus filas dependientes (`persona`, `persona_fisica`, `cliente`, `direccion`) eliminados de la base al finalizar la prueba — a diferencia de la cuenta de demo persistente, este cliente era exclusivamente para esta prueba puntual.
8. **Aislamiento por tenant real:** logueado como el cliente descartable, `pedido-detalle.html?id=13` (pedido de otro cliente) y `?id=999999` (inexistente) mostraron el mismo estado "No encontramos este pedido", sin datos ajenos visibles — ver sección dedicada arriba.
9. **Sin `?id=`:** `pedido-detalle.html` sin query param también resuelve al mismo estado "no encontrado", sin excepción JS.
10. Consola del navegador revisada en cada paso (`read_console_messages`) — sin errores en ningún punto del recorrido.
11. Regla de "cero comentarios en frontend/" verificada con `grep` sobre los 3 archivos `.html` nuevos, los 2 `.js` nuevos, el `.js` modificado y el bloque nuevo de `styles.css` antes de cerrar el tramo.

## Checklist de cierre del Tramo 4

- [x] Confirmado antes de programar: no existe endpoint de detalle de pedido por id — resuelto reutilizando el listado, no inventado.
- [x] Confirmado antes de programar: `PedidoResponseDTO` no expone `nombreComercio` — resuelto reutilizando `/catalogo/comercios`, mismo patrón que Tramos 2/3, sin ampliar el backend.
- [x] Intervalo de polling (15s) decidido explícitamente y documentado, no hardcodeado sin justificar — la guía lo dejaba abierto a esta fase.
- [x] C23/C28 probados contra estados reales generados con el endpoint real de rol `COMERCIO` (no simulados, no editados directo en la base).
- [x] 7 pantallas del tramo construidas, ninguna con datos mockeados.
- [x] Polling real confirmado pegando al backend (no un `setInterval` decorativo) — verificado con `read_network_requests` durante 18s de espera real.
- [x] Aislamiento por tenant confirmado con un cliente real sin los pedidos ajenos, no asumido.
- [x] Empty states (C34/C45) probados con un cliente real sin datos, eliminado al finalizar.
- [x] Regla de "cero comentarios en frontend/" verificada con `grep`.
- [x] Gap total de cobertura del MCP de Figma en este tramo (ni siquiera `get_metadata` funcionó) documentado explícitamente, no ocultado.

Con esto, el Tramo 4 de 9 de la Fase 16 queda cerrado. Siguen los tramos 5 a 9 (panel de Comercio, panel de Administrador, etc.) en sesiones futuras.
