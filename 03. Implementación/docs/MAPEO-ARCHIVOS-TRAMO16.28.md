# Mapeo pantallas ↔ archivos — Tramo 16.28 (correcciones sobre el Tramo 16.27)

Ronda de 6 correcciones puntuales, continuación directa del Tramo 16.27. Todo verificado con interacción real en navegador contra el backend real (sesiones reales de Cliente, Comercio y Administrador). Ver `docs/DECISIONES.md`, entrada "Tramo 16.28" del 2026-07-31, para el detalle completo.

**Nota de entorno:** el panel del navegador sigue sin compositar frames (`screenshot` falla con "the Browser pane is not displayed", probado de nuevo al inicio de esta sesión). Verificación vía `getComputedStyle`/`getBoundingClientRect` contra el DOM real.

**Método de verificación de sintaxis:** copia `.mjs` antes de `node --check` en los 5 archivos JS tocados, según lo decidido al cierre del Tramo 16.27.

---

## Punto 1 — Corrección del bloque de comercio en `carrito.html`

| Archivo | Cambio |
|---|---|
| `frontend/css/styles.css` | `.cart-comercio-card` pierde `background: var(--color-surface-alt)` (agregado por error en el Tramo 16.27) — queda transparente. Resto de la tarjeta (padding, centrado, separador) sin cambios. |

## Punto 2 — Ícono de estado sin círculo, más grande, componente compartido

| Archivo | Cambio |
|---|---|
| `frontend/js/catalogo.js` | `renderPedidoEstadoHeader(container, { iconClass, icono, label, texto, numeroTexto })` nueva y exportada — reemplaza la construcción del header de estado duplicada en `pedidos.js` y `comercio.js`. |
| `frontend/js/pedidos.js` | `initPedidoDetalle` usa `renderPedidoEstadoHeader` en vez de armar el header manualmente. |
| `frontend/js/comercio.js` | `renderPedidoDetalleComercio` usa `renderPedidoEstadoHeader` en vez de su copia duplicada. |
| `frontend/css/styles.css` | `.pedido-detail__icon`: círculo (`border-radius`/`background` por estado) eliminado, ícono de `30px` → `60px`. Colores recalibrados: `--pendiente` de `#8a5a00` a `var(--color-warning)`, `--preparacion` de `var(--color-primary)` (naranja, bug real) a `var(--color-success)` (verde), `--rechazado` sin cambio de color (ya era `var(--color-error)`). |

**Bug de color real corregido:** el ícono de "en preparación" usaba naranja en vez de verde, desalineado del mapeo de colores ya establecido para pedidos.

Verificado real en las 2 pantallas × 3 estados (6 combinaciones): pedidos #16/#19/#20, `pedido-detalle.html` (Cliente) y `comercio-pedido-detalle.html` (Comercio).

## Punto 3 — Avisos de "agotado"/"comercio cerrado" a puntito

| Archivo | Cambio |
|---|---|
| `frontend/js/catalogo.js` | `crearAvisoPunto(texto)` nueva (local). Los 2 usos de `.banner.banner-warning` en `abrirModalProducto` reemplazados por `crearAvisoPunto(...)` — 2 elementos separados cuando ambos avisos aplican. |
| `frontend/css/styles.css` | Nuevas: `.aviso-punto`, `.aviso-punto__dot` (amarillo, `var(--color-warning)`). |

Verificado real con "Empanada de Carne" (agotado, comercio cerrado) — ambos avisos simultáneos, 2 líneas separadas, mismo color de dot.

## Punto 4 — Tarjeta "Comercios Pendientes" en `admin-dashboard.html`

| Archivo | Cambio |
|---|---|
| `frontend/css/styles.css` | `.alert-card`: `background`/`border-left` → `background: var(--color-surface)` + `border: 1px solid var(--color-border)` (idéntico a `.stat-tile`). `.alert-card__count`: círculo de `24px` con número → dot de `8px` sin texto. |
| `frontend/admin-dashboard.html` | `<span class="alert-card__count" data-count>0</span>` → sin el `0` inicial. |
| `frontend/js/admin.js` | Deja de escribir el número en el dot — ahora hace `display:block`/`none` según `comerciosPendientes > 0`. |

**Decisión de criterio:** sin número junto al dot — el subtítulo ya existente ("N solicitudes de aprobación") ya comunica la cifra, evita duplicarla.

## Punto 5 — Headers de Administrador: naranja → negro

| Archivo | Cambio |
|---|---|
| `frontend/admin-categorias.html` | `color:var(--color-primary)` → `color:var(--color-text)` en el `<span class="app-header__title">`. |
| `frontend/admin-comercio-detalle.html` | Ídem. |
| `frontend/admin-clientes.html` | Ídem. |
| `frontend/admin-comercios.html` | Ídem. |
| `frontend/admin-tags.html` | Ídem. |
| `frontend/admin-comercios-pendientes.html` | Ídem. |

`admin-dashboard.html` sin cambios (header de logo centrado, no tiene este patrón). Confirmado por `grep` sobre toda `frontend/` que no hay ninguna otra pantalla con el mismo patrón sin tocar.

## Punto 6 — Badges de estado de cliente a puntito (`admin-clientes.html`)

| Archivo | Cambio |
|---|---|
| `frontend/js/admin.js` | `CLASE_ESTADO_USUARIO` → `DOT_ESTADO_USUARIO` (clases `cliente-estado__dot--*`). `renderClienteAdminRow` arma `.cliente-estado` + dot en vez de `.status-badge`. |
| `frontend/css/styles.css` | Nuevas: `.cliente-estado`, `.cliente-estado__dot` (+ 5 modificadores de color). `status-badge--activo`/`status-badge--rechazado` (huérfanas) eliminadas. |

Mapeo de color (confirmado 1 a 1 contra el enum real `EstadoUsuario`, sin estados adicionales): Activo verde, Pendiente amarillo, Inactivo gris medio (`--color-text-muted`), Bloqueado rojo, Suspendido gris claro (`--color-text-placeholder`, tercer tono para diferenciarlo del texto negro y del gris de Inactivo).

Verificado real: 10 clientes Activo + 1 Pendiente (datos reales). Bloqueado/Suspendido/Inactivo verificados por inyección de clase CSS (sin clientes reales en esos estados en este momento).

---

## Verificado en esta sesión (cierre formal)

- `node --check` sobre copias `.mjs` de los 5 archivos JS tocados — sin errores de sintaxis.
- Conteo de llaves de `styles.css` balanceado.
- Cero comentarios confirmado por `grep` en todos los archivos tocados (JS, CSS, 7 HTML de Admin).
- Backend reiniciado al inicio de la sesión (caída de infraestructura), perfil `test` usado solo temporalmente para resetear la contraseña del admin, revertido a perfil default al cerrar.
- Sin errores de consola en ninguna pantalla recorrida.

---

## Resumen numérico

| | Cantidad |
|---|---|
| Puntos del tramo | 6 |
| Archivos backend tocados | 0 |
| Archivos frontend modificados | 12 (`js/catalogo.js`, `js/comercio.js`, `js/pedidos.js`, `js/admin.js`, `css/styles.css`, `admin-dashboard.html`, `admin-categorias.html`, `admin-comercio-detalle.html`, `admin-clientes.html`, `admin-comercios.html`, `admin-tags.html`, `admin-comercios-pendientes.html`) |
| Bugs reales encontrados y corregidos en el camino | 2 (fondo sólido mal interpretado en 16.27, color naranja incorrecto en ícono "en preparación") |

**Pendiente de confirmación del usuario:** este tramo no se cierra hasta que Diego confirme el checklist punto por punto — ver el mensaje de cierre de la sesión para el detalle completo.
