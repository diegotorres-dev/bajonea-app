# Mapeo pantallas ↔ archivos — Tramo 16.27 (correcciones sobre el Tramo 16.26)

Ronda de 3 correcciones puntuales, continuación directa del Tramo 16.26. Puntos 1 y 2 verificados con interacción real en navegador contra el backend real (perfil default, MySQL real, cuentas demo reales). Punto 3 es documentación pura, sin cambios de código. Ver `docs/DECISIONES.md`, entrada "Tramo 16.27" del 2026-07-30, para el detalle completo.

**Nota de entorno:** el panel del navegador sigue sin compositar frames (`screenshot` falla con "the Browser pane is not displayed", probado de nuevo al inicio de esta sesión). Se usó `visualize` como apoyo adicional para el punto 1, sin reemplazar la verificación real en navegador (login real, producto real agregado al carrito, `getComputedStyle` contra el DOM real).

---

## Bug real encontrado y corregido (punto 1)

`const label` declarado dos veces en la misma función (`renderConProductos`, `carrito.js`) — `SyntaxError` que dejaba `carrito.html` en blanco. Corregido renombrando la segunda variable a `subtotalLabel`.

**Hallazgo sobre la herramienta de verificación:** `node --check archivo.js` no detectó este error porque el archivo usa `import`/`export` sin un `package.json` con `type:module` cerca — Node autodetecta ESM pero por esa vía `--check` no valida redeclaración de `const` en el mismo scope (confirmado con reproducción mínima). A partir de este tramo, verificar copiando a `.mjs` antes de `node --check`, o confiar en la verificación real en navegador.

## Punto 1 — Rediseño del bloque de comercio en `carrito.html` + separador consistente

| Archivo | Cambio |
|---|---|
| `frontend/js/carrito.js` | `crearAccionVaciarHeader`: ícono de tacho eliminado, queda solo `textContent = 'Vaciar todo'`. `renderConProductos`: `.cart-comercio-header` (fila) reemplazado por `.cart-comercio-card` (columna centrada: avatar, label gris, nombre negro peso 600). |
| `frontend/css/styles.css` | `.cart-comercio-header*` eliminadas, reemplazadas por `.cart-comercio-card`/`__avatar`/`__label`/`__nombre`. `.cart-comercio-card` usa `border-bottom: 1px solid var(--color-border)` — mismo valor literal que `.cart-item`, no uno nuevo. `.top-bar__vaciar-btn` simplificada (sin regla de `svg`, ya no aplica). |

Verificado real: carrito con producto agregado (Comercio Filtros Test) — tarjeta centrada con fondo `var(--color-surface-alt)`, separador idéntico al de entre productos (`rgb(238,233,228)` a `1px` en ambos, confirmado por `getComputedStyle`), botón de header sin ningún `<svg>`. Caso vacío también confirmado (sin tarjeta, sin botón).

## Punto 2 — Consistencia visual del stats bar con "Pedidos activos"

| Archivo | Cambio |
|---|---|
| `frontend/css/styles.css` | `.stats-bar` suma `box-shadow: var(--shadow-card)` — el `background: var(--color-surface)` ya coincidía con `.pedido-card` desde el Tramo 16.26, no hacía falta tocarlo. |

Verificado real: `.stats-bar` y `.pedido-card` con `background-color`, `box-shadow` y `border-color` idénticos por `getComputedStyle`. Layout de 3 columnas y cálculo de métricas sin cambios.

## Punto 3 — Ubicación exacta del espaciado de tarjetas (documentación, sin código)

Todas las reglas en `frontend/css/styles.css`:

| Espacio | Selector | Línea | Propiedad | Valor actual |
|---|---|---|---|---|
| Título → tipo/horario | `.comercio-card__meta` | 1472-1476 | `margin-top` (línea 1475) | `8px` |
| Tipo/horario → pills | `.comercio-card__body .pill-row` | 1478-1480 | `margin-top` (línea 1479) | `12px` |
| Título a 1 línea (afecta lo anterior) | `.comercio-card__top h3` | 1463-1470 | `white-space`/`overflow`/`text-overflow` (1467-1469) | fuerza 1 línea siempre |

Explicación en `docs/DECISIONES.md` de por qué el 3er selector condiciona el resultado de los 2 primeros (si el título pudiera ocupar 2 líneas, la altura de la tarjeta dejaría de ser constante). Sin cambios de código en este punto.

---

## Verificado en esta sesión (cierre formal)

- `node --check` sobre copias `.mjs` de los 3 archivos JS tocados — sin errores de sintaxis (método corregido tras el hallazgo de este tramo).
- Conteo de llaves de `styles.css` balanceado.
- Cero comentarios confirmado por `grep`.
- Backend y frontend reiniciados al inicio de la sesión (caída de infraestructura entre tramos).
- Puntos 1 y 2 verificados contra datos reales, sin mockear nada.
- Sin errores de consola tras la corrección del bug.

---

## Resumen numérico

| | Cantidad |
|---|---|
| Puntos del tramo | 3 (2 con código, 1 solo documentación) |
| Archivos backend tocados | 0 |
| Archivos frontend modificados | 2 (`js/carrito.js`, `css/styles.css`) |
| Bugs reales encontrados y corregidos en el camino | 1 (`SyntaxError` por `const` duplicado, carrito.html en blanco) |

**Pendiente de confirmación del usuario:** este tramo no se cierra hasta que Diego confirme el checklist punto por punto — ver el mensaje de cierre de la sesión para el detalle completo.
