# Mapeo de archivos — Tramo E3: Cliente en escritorio

Fecha: 2026-11-12. Solo frontend y pruebas: el backend no cambió, no hay endpoints ni migraciones nuevas. Pendiente de la confirmación de Diego (sin commit).

## Alcance

Todo el lado Cliente tiene composición de escritorio desde 1024 px: barra superior de 72 px con navegación, buscador, carrito, campana y menú del avatar; catálogo y Explorar en grilla; detalle del comercio con ficha de dos columnas, productos en grilla de 3 y diálogo de producto; carrito y checkout con el resumen fijo de 380 px a la derecha; Mis pedidos con lista de 440 px y detalle sin navegar; perfil con menú de secciones de 240 px y direcciones en grilla; avisos como tabla (Cliente y Comercio); y las páginas restantes (consultas, conversación de soporte con sesión, reclamo, ayuda) con la barra superior y tarjetas propias. Debajo de 1024 px nada cambia de aspecto, con la excepción acordada de los destinos de «Volver» (T11).

## Archivos nuevos

| Archivo | Para qué |
|---|---|
| `frontend/js/escritorio.js` | `MEDIA_ESCRITORIO`, `enEscritorio()` y `alCambiarEscritorio()` (antes vivían en `comercio-escritorio.js`, que ahora los reexporta). |
| `frontend/js/cliente-escritorio.js` | `montarBarraCliente` / `montarBarraClienteEnEscritorio`: la barra superior (se arma solo cuando la pantalla es de escritorio), el menú del avatar accesible, el contador del carrito y el sondeo único de avisos (`suscribirAvisosCliente`, `refrescarAvisosCliente`). |
| `frontend/css/escritorio-cliente.css` | Barra superior, encabezado de página, catálogo, Explorar, ficha del comercio, productos y diálogo de producto. |
| `frontend/css/escritorio-cliente-pedidos.css` | Carrito, checkout y Mis pedidos (lista con detalle). |
| `frontend/css/escritorio-cliente-perfil.css` | Perfil, direcciones y la tabla de avisos (`notification-list--tabla`, también para el Comercio). |
| `frontend/css/escritorio-cliente-otras.css` | Reclamo, conversación de soporte, Mis consultas y Ayuda. |
| `testing/playwright/tests/helpers/escritorio-cliente.ts` | `prepararEscenarioCliente` (comercio operativo con delivery, tres direcciones, pedidos en todos los estados, uno en camino, uno sin pagar, uno reclamable, una consulta), `dejarCarritoConItems` y `abrirComoCliente`. |
| `testing/playwright/tests/138` a `142` | Specs nuevos (ver abajo). |
| `docs/capturas-escritorio-e3/` | `antes-*` y `despues-*` a 1440 px. |

## Archivos modificados

- `frontend/js/catalogo.js`: monta la barra en el catálogo y el detalle; el sondeo de avisos del Cliente pasa a `suscribirAvisosCliente`; `actualizarContadorCarrito` agrupa las consultas simultáneas y actualiza la insignia de la barra; el avatar del pie móvil sale de la sesión (sin `GET /clientes/perfil` si la sesión trae `nombre` y `fotoPerfilUrl`); portada responsive en las tarjetas de comercio; cada producto suma el rótulo «Agregar» (solo escritorio); el diálogo de producto usa `activarHoja` en escritorio (foco, Tab y Escape); destinos de «Volver» del detalle.
- `frontend/js/explorar.js`: monta la barra, acepta `?q=` (lo manda el buscador de la barra) e imágenes responsive.
- `frontend/js/carrito.js`, `checkout.js`: barra; destino de «Volver» del carrito; el checkout arma el resumen fijo de la derecha (`#checkout-resumen`, con el total y el botón principal espejado) y la fila «Volver» + botón principal de cada paso (`.step-acciones-escritorio`).
- `frontend/js/pedidos.js`: el detalle del pedido pasó a un componente reutilizable (`crearDetallePedido`: render, vuelta de Mercado Pago y sincronización); la lista suma la vista de escritorio (`iniciarVistaMaestroDetalle`: filtros, selección con `?id=`, flechas, sondeo que conserva la selección); `pedido-detalle.html?id=N` redirige a `pedidos.html?id=N` en escritorio.
- `frontend/js/cliente.js`: menú de secciones del perfil (`?seccion=`), foto de perfil que actualiza la sesión.
- `frontend/js/notificaciones.js`: tabla (cabecera y columna de estado), barra del Cliente, `refrescarAvisosCliente`.
- `frontend/js/api.js`: `actualizarFotoSesion`. `frontend/js/imagenes.js`: `pintarImagenResponsiva`.
- `frontend/js/soporte-mis-consultas.js`, `reclamo-nuevo.js`, `soporte-consulta.js`, `ayuda.js`: barra del Cliente y destinos de «Volver».
- `frontend/js/perfil-cuenta.js`, `cliente.js`, `checkout.js`, `pedidos.js`: estilos inline de layout reemplazados por clases utilitarias.
- `frontend/css/styles.css` (al final): valores por defecto «ocultos» de los elementos que solo existen en escritorio y las clases que reemplazan los estilos inline (`sep-t-*`, `sep-b-*`, `ancho-completo`, etc.).
- `frontend/css/escritorio.css`: cuatro `@import` nuevos.
- HTML: `comercio-detalle.html` (envoltorio `.comercio-ficha`, que en móvil es `display: contents`), `checkout.html` (título, `#checkout-resumen` y el botón «Volver» de escritorio, ocultos en móvil), `explorar.html` y `perfil.html` (clases en lugar de estilos inline, `.app-main--perfil`).

## Pruebas

- `138` (17): barra, menú del avatar con teclado, buscador, insignias, grilla del catálogo a 3 y 4 columnas, Explorar, ficha del comercio, diálogo de producto y anchos de 1024 a 1920 px.
- `139` (10): carrito y checkout en dos columnas, resumen fijo en los cuatro pasos, recorrido hasta el pago simulado.
- `140` (12): Mis pedidos (lista, selección, URL, redirección, filtros, cancelar, confirmar recepción, reclamo, sondeo, avisos de la campana).
- `141` (14): perfil, secciones, direcciones y panel lateral, tabla de avisos (Cliente y Dueño), páginas restantes, anchos.
- `142` (9, móvil): ningún elemento de escritorio en 14 páginas, destinos de «Volver» (T11) y avatar sin consulta al perfil.

## Cómo se demostró que la móvil no cambió

Instantáneas a 375, 390 y 700 px de 21 páginas del Cliente (63 imágenes) con la hora fija y el catálogo ordenado por id, antes de tocar código y después del Bloque 1: 63 de 63 idénticas píxel a píxel y 63 de 63 listas de cajas idénticas, salvo un parpadeo conocido de 208 px en el perfil a 375 y 390 px que ocurre también entre dos corridas del mismo código. Ver `docs/DECISIONES.md`.
