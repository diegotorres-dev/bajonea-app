# Mapeo de archivos — Tramo Correcciones UX/UI — Ronda 3 (4 puntos)

Continuación directa de los tramos "Correcciones UX/UI y Bugs Varios (15 puntos)" y "Ronda 2 (7 puntos)", misma fecha (2026-09-04). Decisiones de diseño y evidencia de verificación completas en `docs/DECISIONES.md`, entrada "Tramo de correcciones UX/UI — Ronda 3 (4 puntos)". Este archivo es solo el mapeo pantalla ↔ archivo.

## Punto 4 (prioridad alta) — Límite de $99.999.999 en el modal de `comercio-detalle.html`

| Archivo | Cambio |
|---|---|
| `frontend/js/validators.js` | Nuevo: `SUBTOTAL_MAXIMO_ITEM` (constante, antes vivía duplicada como local en `carrito.js`), `excedeSubtotalMaximo(precioUnitario, cantidad)`, `mensajeSubtotalMaximoExcedido()`. |
| `frontend/js/carrito.js` | Deja de declarar `SUBTOTAL_MAXIMO_ITEM` localmente; importa y usa `excedeSubtotalMaximo`/`mensajeSubtotalMaximoExcedido` de `validators.js` en el handler del botón `+` del stepper de cada ítem. |
| `frontend/js/catalogo.js` | Importa `excedeSubtotalMaximo`/`mensajeSubtotalMaximoExcedido`. Modal de "agregar al carrito" (función que arma `product-modal-sheet`): el botón `+` del stepper ahora bloquea el incremento con el mismo toast que `carrito.js` cuando `precio × (cantidad + 1)` superaría el máximo; el botón "Agregar al carrito" repite el mismo chequeo como capa adicional antes de llamar a `agregarAlCarrito`. |

## Punto 3 — Pill "Obligatorio" en `comercio-producto-form.html`

| Archivo | Cambio |
|---|---|
| `frontend/comercio-producto-form.html` | Label "Fotos del producto" envuelto junto al pill en un nuevo `<div class="field__label-row">`; pill `<span class="field__label-badge">Obligatorio</span>` agregado (mismo componente que ya usa `registro-comercio.html` para la foto de perfil). Archivo único compartido por creación y edición de producto (confirmado por auditoría — un solo consumidor, `comercio.js`), sin necesidad de tocar dos pantallas. |
| `frontend/css/styles.css` | Nueva regla `.field__label-row` (`display:flex;align-items:center;gap:8px;margin-bottom:6px`) + `.field__label-row .field__label { margin-bottom:0 }`, para poner label + badge en la misma línea — los dos usos previos del pill (`registro-comercio.html`/`registro-cliente.html`) lo tenían apilado debajo del label dentro de un `.field` centrado, patrón que no aplicaba acá porque Diego pidió "al lado del texto". `.field__label-badge` en sí no se tocó. |

## Punto 1 — Centrado vertical de `comercio-pendiente.html`

| Archivo | Cambio |
|---|---|
| `frontend/css/styles.css` | Nueva regla `.state-page--centrado-vertical { justify-content: center; }`, modificador de `.state-page` (que ya existía y es compartida por otras 7 pantallas: `comercio-rechazado.html` + 6 páginas de `frontend/errores/`). Se agregó como modificador aparte, no tocando `.state-page` en sí, para no alterar el comportamiento de esas otras 7 pantallas que Diego no reportó ni pidió tocar. |
| `frontend/comercio-pendiente.html` | El `<div class="state-page">` pasa a `<div class="state-page state-page--centrado-vertical">`. Sin cambios de contenido, textos ni tamaños. |

## Punto 2 — URLs/textos largos desbordando en `admin-comercio-detalle.html`

| Archivo | Cambio |
|---|---|
| `frontend/css/styles.css` | `.detail-row span:last-child` suma `min-width: 0; overflow-wrap: break-word; word-break: break-word;`. Causa real: el span de valor es un ítem flex sin `min-width` explícito (default `auto`, que impide encogerse por debajo del ancho intrínseco de texto sin espacios como una URL), combinado con la falta de una propiedad de wrap. |

`detailRow()` (función compartida en `frontend/js/admin.js`, única en todo el proyecto — confirmado por `grep`) es el renderer de **todas** las filas `.detail-row` de `admin-comercio-detalle.html` (datos del comercio, datos legales, dirección, representante legal, horarios, redes sociales) y también del modal de detalle de `admin-clientes.html` — el fix en la regla CSS compartida cubre los 2 campos reportados por Diego (Instagram, y cualquier otro campo de texto libre/longitud variable) sin necesidad de tocarlos uno por uno.

## Verificación

- `frontend/js/validators.js`, `frontend/js/carrito.js`, `frontend/js/catalogo.js`: sintaxis verificada con `node --check` sobre copias `.mjs` (método ya establecido en tramos anteriores).
- Punto 4: backend levantado en vivo contra `bajonea_final` real (no `bajonea_test`), cliente de prueba registrado vía la API real de registro (`POST /auth/registro/cliente`), activado con un `UPDATE usuario SET estado='ACTIVO'` puntual (bypass de la verificación por email, no fabricación de datos — el resto del registro es 100% real) para poder loguearse en esta sesión no interactiva. Probado en el navegador real contra el comercio "Comerciox" (`id=65`) y su producto real de prueba "Dsa" (`id=19`, `precio=$11.111.111`, ya cargado de antes por el propio Diego): cantidad 9 → subtotal exactamente $99.999.999, sin bloqueo; cantidad 10 → bloqueado con el toast "No podés agregar más unidades: el subtotal de este producto superaría el máximo permitido ($99.999.999)." (mismo texto que `carrito.js`). Cuenta de prueba (`usuario.id=174`) y todas sus filas dependientes (`sesion`, `token`, `notificacion`, `persona`, `persona_fisica`) eliminadas al finalizar — `SELECT COUNT(*) = 0` confirmado. Backend detenido al terminar la prueba.
- Puntos 1, 2 y 3: verificados visualmente en el navegador con archivos de prueba temporales (`_test-*.html`, creados y eliminados dentro de esta misma sesión) que reproducen exactamente el markup/CSS real de cada pantalla — necesario porque `comercio-pendiente.html` y `comercio-producto-form.html` están protegidas por un guard de sesión/rol que redirige a `login.html` sin una sesión real de Comercio, y armar esa sesión completa no era necesario para validar cambios puramente de CSS/markup.
