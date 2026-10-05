# Mapeo de archivos — Fase 1 (bugfix urgente)

Detalle de qué archivos se tocaron en cada punto de la Fase 1 y por qué. Fuente de verdad de las
decisiones y evidencia completa: `docs/DECISIONES.md`, entradas del 2026-08-31.

---

## 1.A — Confirmación de pedido rota ("Ya existe un registro con alguno de los datos ingresados")

| Archivo | Cambio | Por qué |
|---|---|---|
| `backend/src/main/java/com/bajonea/backend/services/PedidoService.java` | Import de `EstadoDetallePedido` + `.estado(EstadoDetallePedido.ACTIVO)` agregado al builder de `DetallePedido` en `confirmarPedido()`. | Causa raíz del bug: la columna `detalle_pedido.estado` (agregada 2026-08-28, NOT NULL) nunca se seteaba en el builder — Hibernate mandaba `NULL` explícito, pisando el `DEFAULT 'ACTIVO'` de MySQL, y la base rechazaba el INSERT con `ERROR 1048`. |
| `backend/src/main/java/com/bajonea/backend/exceptions/GlobalExceptionHandler.java` | El handler de `DataIntegrityViolationException` pasa de devolver siempre el mismo mensaje/status a distinguir 2 casos: violación real de UNIQUE (código nativo MySQL `1062`) mantiene `409` + "Ya existe un registro..."; cualquier otro caso (NOT NULL, FK) devuelve `500` + "No se pudo procesar la solicitud, intentá nuevamente", con `log.error(...)` del stack trace completo del lado del servidor. | El handler genérico original enmascaraba el bug real: cualquier `DataIntegrityViolationException` (sin importar la causa) devolvía el mismo texto de "duplicado", que no tenía nada que ver con lo que realmente estaba pasando (un NOT NULL). Sin esta separación, un futuro NOT NULL en otra tabla iba a volver a fallar en silencio con el mismo mensaje engañoso. |
| `docs/DECISIONES.md` | 1 entrada nueva ("Bugfix 1.A..."), cronológica, con diagnóstico, evidencia antes/después y detalle de limpieza. | Regla no negociable del proyecto: toda decisión de diseño y todo bug real corregido se documenta ahí. |

**No se tocó ningún archivo de `frontend/`** para 1.A — el bug era exclusivamente de backend
(`checkout.js` ya llamaba correctamente a `POST /pedidos/cliente` y mostraba el `error.message`
tal cual lo devolvía el backend).

**Evidencia de cierre:** reproducción del bug antes del fix (SQL aislado + E2E real vía `curl`
contra `bajonea_final`), fix aplicado, reproducción exitosa después del fix con las 2 modalidades
de entrega (RETIRO → Pedido #28, DOMICILIO → Pedido #29), `SELECT` confirmando `estado = 'ACTIVO'`
en ambos `DetallePedido`, y limpieza completa de los datos de prueba (cliente temporal `id 55` y
todo lo que colgaba de él) confirmada con `COUNT(*) = 0`. Detalle completo en
`docs/DECISIONES.md`. **Pendiente de confirmación explícita de Diego para darse por cerrado.**

---

## 1.B — Contador del carrito no reactivo al volver atrás

| Archivo | Cambio | Por qué |
|---|---|---|
| `frontend/js/catalogo.js` | Listener `window.addEventListener('pageshow', (event) => { if (event.persisted) { actualizarContadorCarrito(); } })` agregado en `renderBottomNav()` y en `initComercioDetalle()`. | La navegación "atrás" restaura la página desde bfcache sin re-ejecutar el `<script type="module">`, así que el refetch normal del badge (que ya existía y funcionaba en cargas normales) nunca se repetía. `renderBottomNav()` cubre con un solo cambio el badge del footer en todas las pantallas de Cliente con nav inferior; `initComercioDetalle()` cubre el badge del header en `comercio-detalle.html`. Mismo patrón `pageshow`/`event.persisted` ya usado en el proyecto (`comercio.js`, dashboard de Comercio, Tramo 16.5) — no se introdujo ningún mecanismo nuevo. |
| `docs/DECISIONES.md` | 1 entrada nueva ("Bugfix 1.B..."). | Regla no negociable del proyecto. |

**No se tocó ningún archivo de backend** — el bug era puramente de sincronización del DOM en el
frontend; `actualizarContadorCarrito()` ya calculaba la cantidad real correctamente a partir de
`GET /carrito`, solo faltaba que se disparara también tras una restauración desde bfcache.

**Evidencia de cierre:** verificación end-to-end en el navegador real (Browser pane) reproduciendo
el flujo exacto reportado por Diego — agregar producto en `comercio-detalle.html` → botón `<` →
badge del footer en `index.html` actualizado sin F5 — repetido además para aumentar cantidad,
reducir cantidad y vaciar el carrito por completo, los 3 casos confirmados correctos leyendo el
DOM directamente (no solo visualmente). Detalle completo en `docs/DECISIONES.md`. **Pendiente de
confirmación explícita de Diego para darse por cerrado.**
