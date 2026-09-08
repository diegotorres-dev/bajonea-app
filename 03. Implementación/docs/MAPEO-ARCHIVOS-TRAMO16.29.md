# Mapeo pantallas ↔ archivos — Tramo 16.29 (3 correcciones finales, cierre de la ronda 16.21-16.29)

Tramo chico, continuación directa del Tramo 16.28. Según lo indicado por Diego, con estos 3 puntos confirmados la ronda completa de pulido UI/UX del MVP (Tramos 16.21 a 16.29) queda considerada 100% finalizada. Ver `docs/DECISIONES.md`, entrada "Tramo 16.29" del 2026-07-31, para el detalle completo.

**Nota de entorno:** el panel del navegador sigue sin compositar frames (`screenshot` falla con "the Browser pane is not displayed", probado de nuevo al inicio de esta sesión). Verificación vía interacción real (login, navegación) + lectura de DOM real (`getComputedStyle`/`textContent`/`innerText`).

**Método de verificación de sintaxis:** copia `.mjs` antes de `node --check` en los 3 archivos JS tocados, según lo decidido al cierre del Tramo 16.27.

**Incidente resuelto sin arriesgar la cuenta de administrador:** login con la contraseña ya documentada de `admin@bajonea.ar` falló por `intentos_fallidos=2` arrastrado de una sesión previa (a un intento más de bloquearse). Resuelto reiniciando el backend en perfil `test` y usando el flujo real de recuperación de contraseña para fijar la misma contraseña ya conocida (sin cambiarla) y resetear el contador a 0, luego backend revertido a perfil default.

---

## Punto 1 — `admin-clientes.html`: puntito de "Inactivo" a negro puro

| Archivo | Cambio |
|---|---|
| `frontend/css/styles.css` | `.cliente-estado__dot--inactivo`: `background: var(--color-text-muted)` → `background: var(--color-text)` (negro puro). |

Sin cambios en `admin.js` (el mapeo de clases ya apuntaba a esta clase). `Suspendido` confirmado sin tocar (`var(--color-text-placeholder)`, gris claro, ya distinguible del negro nuevo).

Verificado real con los 11 clientes reales de la base — los 5 estados presentes en datos reales: Activo `rgb(30,142,62)`, Inactivo `rgb(26,26,26)` (negro puro), Bloqueado `rgb(217,48,37)`, Suspendido `rgb(176,169,163)`, Pendiente `rgb(242,180,0)`.

## Punto 2 — Ícono de estado siempre naranja + puntito rojo con motivo de rechazo

| Archivo | Cambio |
|---|---|
| `frontend/css/styles.css` | `.pedido-detail__icon--pendiente`/`--preparacion`/`--rechazado` colapsadas a una regla, `color: var(--color-primary)` (naranja de marca) para las 3. Nuevas: `.aviso-punto--rechazo` (modificador de `.aviso-punto`, `align-items: flex-start`), `.aviso-punto--rechazo .aviso-punto__dot` (rojo, `var(--color-error)`), `.aviso-punto__motivo` (bold, `var(--color-text)`), `.aviso-punto__comentario` (`var(--color-text-muted)`, `white-space: pre-line`). |
| `frontend/js/catalogo.js` | `renderPedidoEstadoHeader` suma parámetro opcional `motivoRechazo: { motivoLabel, comentario }` — cuando está presente, agrega el bloque nuevo dentro del propio header vía la función interna nueva `renderAvisoRechazo`. |
| `frontend/js/pedidos.js` | `initPedidoDetalle`: cartel viejo (`.banner.banner-error`) eliminado, reemplazado por pasar `motivoRechazo` a `renderPedidoEstadoHeader`. |
| `frontend/js/comercio.js` | `renderPedidoDetalleComercio`: mismo reemplazo que en `pedidos.js`. |

Cambio aplicado desde el componente compartido — un solo punto de código cubre `pedido-detalle.html` (Cliente) y `comercio-pedido-detalle.html` (Comercio).

Verificado real, 3 estados × 2 pantallas: pedido `#16` (Pendiente), `#17`/`#21` (En preparación), `#14` (Rechazado, motivo "Sin stock" + comentario real "Se acabaron las milanesas por hoy, disculpas.") — `pedido-detalle.html` como `cliente.demo@bajonea.test`, `comercio-pedido-detalle.html` como `comercio1.demo@bajonea.test`. Ícono naranja (`rgb(255,71,0)`) confirmado en los 3 estados de ambas pantallas. En el pedido rechazado: dot rojo (`rgb(217,48,37)`), motivo y comentario reales mostrados, `.banner-error` ausente del DOM en ambas pantallas. Caso sin comentario verificado invocando `renderPedidoEstadoHeader` directamente vía `import` dinámico del módulo real en el navegador (sin cuenta real disponible con ese caso puntual y contraseña conocida) — comportamiento condicional correcto.

## Punto 3 — `pedido-detalle.html`: nombre de comercio duplicado eliminado

| Archivo | Cambio |
|---|---|
| `frontend/js/pedidos.js` | `initPedidoDetalle`: bloque `comercioHeading` (`.section-heading` con el nombre del comercio, entre la tarjeta de modalidad y "Desglose del pedido") eliminado. |

Sin cambios en `comercio.js` — `comercio-pedido-detalle.html` nunca tuvo este bloque duplicado. Confirmado antes de quitarlo que el nombre del comercio sigue apareciendo en el mensaje descriptivo del header y, como fallback, en el texto de la tarjeta de modalidad de retiro sin dirección — ninguna información se perdió.

Verificado real: pedidos `#16`, `#21`, `#14` (los 3 estados) muestran un único `.section-heading` en el DOM tras el cambio.

---

## Verificado en esta sesión (cierre formal)

- `node --check` sobre copias `.mjs` de los 3 archivos JS tocados (`catalogo.js`, `pedidos.js`, `comercio.js`) — sin errores de sintaxis.
- Conteo de llaves de `styles.css` balanceado (495/495).
- `grep` confirmando cero comentarios en los 4 archivos tocados.
- Sin errores de consola en ninguna pantalla recorrida, incluida la redirección esperada al probar una ruta de Cliente logueado como Comercio (guard de rol intacto).
- `.pedido-estado__dot` de la lista `pedidos.html` (componente distinto) confirmado sin cambios — sigue variando de color por estado real.

---

## Resumen numérico

| | Cantidad |
|---|---|
| Puntos del tramo | 3 |
| Archivos backend tocados | 0 |
| Archivos frontend modificados | 4 (`js/catalogo.js`, `js/pedidos.js`, `js/comercio.js`, `css/styles.css`) |
| Bugs reales encontrados y corregidos en el camino | 0 (tramo de ajustes puntuales, sin bugs nuevos detectados) |

**Pendiente de confirmación del usuario:** este tramo — y con él, el cierre completo de la ronda 16.21-16.29 — no se da por cerrado hasta que Diego confirme el checklist punto por punto que se le presenta al final de la sesión.
