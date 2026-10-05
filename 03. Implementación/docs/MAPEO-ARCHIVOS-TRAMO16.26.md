# Mapeo pantallas ↔ archivos — Tramo 16.26 (correcciones sobre el Tramo 16.25)

Ronda de 6 correcciones puntuales, continuación directa del Tramo 16.25. Todo lo documentado acá fue verificado con interacción real en navegador contra el backend real (perfil default, MySQL real, cuentas demo reales) — ver `docs/DECISIONES.md`, entrada "Tramo 16.26" del 2026-07-30, para el detalle completo de decisiones y evidencia.

**Nota de entorno (confirmada de nuevo al inicio de esta sesión):** el panel del navegador no compositó frames — `screenshot` falla sistemáticamente con "the Browser pane is not displayed". Para los puntos 1 y 6 se generaron mockups visuales reales (herramienta `visualize`, con las clases y valores reales de `styles.css`) mostrados directamente en la conversación, como paliativo. El resto se verificó por lectura de DOM real (`getComputedStyle`/`getBoundingClientRect`).

---

## Punto 1 (prioridad máxima) — Espaciado de tarjetas de comercio, tercera vuelta

| Archivo | Línea | Cambio |
|---|---|---|
| `frontend/css/styles.css` | `.comercio-card__body` (antes 1434-1441) | `gap: 10px` eliminado del contenedor. |
| `frontend/css/styles.css` | `.comercio-card__meta` (1458-1462) | `margin-top: 8px` nuevo (gap título→meta). |
| `frontend/css/styles.css` | `.comercio-card__body .pill-row` (1464-1466) | Regla nueva, `margin-top: 12px` (gap meta→pills). |

Confirmado contra DOM real que el fix del Tramo 16.25 (título a 1 línea) seguía activo y sin overrides. Cambio de esta vuelta: gap asimétrico (8px/12px) en vez de uniforme, para compensar el peso visual distinto entre el título+pills (elementos "duros") y el texto de tipo+horario (texto gris "blando"). Verificado en los 11 comercios reales de la base: `8px`/`12px` exactos en todos. **Para ajustar a mano:** `margin-top` de `.comercio-card__meta` (línea 1458) y de `.comercio-card__body .pill-row` (línea 1464).

## Punto 2 — Simplificación del header de `carrito.html`

| Archivo | Cambio |
|---|---|
| `frontend/js/catalogo.js` | `renderTopBar` suma parámetro opcional `accion` (retrocompatible, default `null`) — en el modo `mostrarVolver`, reemplaza el spacer de 24px cuando se provee. |
| `frontend/js/carrito.js` | `crearAccionVaciarHeader(onConfirm)` nueva. `pintar()` llama a `renderTopBar` en cada re-render (antes solo en `initCarrito`), pasando la acción solo si `carrito.items.length > 0`. Botón viejo (`.cart-vaciar-btn`, debajo del texto de comercio) eliminado del bloque de texto. |
| `frontend/css/styles.css` | `.cart-vaciar-btn` (vertical, sin uso) → `.top-bar__vaciar-btn` (horizontal, ícono+texto). `.cart-comercio-header` simplificada (ya no necesita `justify-content:space-between`, un solo hijo). |

Verificado real: con productos, aparece "Vaciar todo" en el header; al confirmar vaciar, desaparece en el mismo re-render sin recargar.

## Punto 3 — Acortar texto de resolución recomendada

| Archivo | Cambio |
|---|---|
| `frontend/comercio-producto-form.html` | Texto acortado a "Resolución recomendada: 1200 x 900 px (horizontal)" — mismo elemento estático, cubre alta y edición. |

## Punto 4 — Texto redundante del aviso de cerrado

| Archivo | Cambio |
|---|---|
| `frontend/js/comercio.js` | Mensaje "cerrado" de `initComercioDashboard` fijo a `'Tu comercio está cerrado en este momento'`, sin sufijo `${resumenHoy}`. Mensaje "abierto" sin cambios. |

## Punto 5 — Empty state de "sin productos" en `comercio-detalle.html`

| Archivo | Cambio |
|---|---|
| `frontend/js/catalogo.js` | Call site de "Este comercio aún no cuenta con productos" (único uso con botón de `renderEmptyState`, de 10 usos totales) reemplazado por marcado propio `.product-empty-state` — sin ícono, texto 14px, link `.btn-text` en vez de `btn btn-primary`. Los otros 9 usos de `renderEmptyState` sin cambios. |
| `frontend/css/styles.css` | Nuevas: `.product-empty-state`, `.product-empty-state__text`. |

Verificado real con "Comercio Sin Productos Test" (id 53): sin ícono, texto y botón notablemente más chicos.

## Punto 6 — Métricas del dashboard → stats bar horizontal

| Archivo | Cambio |
|---|---|
| `frontend/js/comercio.js` | `renderMetricas`: 3 `.metric-card` con ícono → 3 `.stats-bar__col` sin ícono dentro de una sola `.stats-bar`. `ICONS.cash` eliminado (sin otro uso). |
| `frontend/css/styles.css` | `.metric-grid`/`.metric-card*` (huérfanas) reemplazadas por `.stats-bar`/`.stats-bar__col` (+ `border-left` vía selector `+`)/`.stats-bar__value` (peso 600, no 800)/`.stats-bar__label`. |

Sin cambios en el cálculo de métricas (mismo `GET /pedidos/comercio/resumen-hoy`). Verificado real: una sola superficie, divisores solo entre columnas, valores reales del día.

---

## Verificado en esta sesión (cierre formal)

- `node --check` sobre los 3 archivos JS tocados (`catalogo.js`, `carrito.js`, `comercio.js`) — sin errores de sintaxis.
- Conteo de llaves de `styles.css` balanceado.
- Cero comentarios confirmado por `grep` en todos los archivos tocados.
- Backend reiniciado una vez en esta sesión (caída entre tramos, ajena al código), perfil default.
- Todas las verificaciones contra datos reales — ningún punto mockeado.
- Sin errores de consola en ninguna pantalla recorrida.
- Mockups visuales reales generados para los puntos 1 y 6 (paliativo a la falta de screenshot del navegador).

---

## Resumen numérico

| | Cantidad |
|---|---|
| Puntos del tramo | 6 |
| Archivos backend tocados | 0 |
| Archivos frontend modificados | 5 (`comercio-producto-form.html`, `js/catalogo.js`, `js/carrito.js`, `js/comercio.js`, `css/styles.css`) |
| Líneas exactas dadas a Diego para ajuste manual (punto 1) | 2 (`styles.css:1458` y `styles.css:1464`) |

**Pendiente de confirmación del usuario:** este tramo no se cierra hasta que Diego confirme el checklist punto por punto — ver el mensaje de cierre de la sesión para el detalle completo.
