# Mapeo de archivos — Tramo E6: correcciones de la crítica de diseño

Fecha: 2026-11-13. Solo frontend, pruebas y documentación: el backend no cambió, no hay migraciones ni endpoints nuevos. Pendiente de la confirmación de Diego (sin commit). Diego conserva el naranja `#ff4700`: ningún token de color de marca cambió.

A diferencia de E4 y E5, este tramo cambia la móvil a propósito en los puntos marcados con (M). Todo lo demás de la móvil tiene que seguir idéntico (ver la comparación contra `f906b5b` en `docs/DECISIONES.md`).

## Estado de cada punto de la lista

Capturas «después»: `docs/capturas-critica-despues/` (47 pantallas a 390, 1440, 1024 y 1280 px; no se versiona por el patrón `capturas-*`).

| # | Punto | Estado | Qué se hizo y dónde |
|---|---|---|---|
| 1 | G02 (M) errores de campo | Cumplido | `css/styles.css`: `.input-shell`, `.select-shell` y `.textarea-shell` con un control `[aria-invalid="true"]` adentro (`:has`) pasan a borde y fondo de error; con foco, borde naranja. `.otp-input[aria-invalid]` igual. El mecanismo común (`enlazarControlConError`, `js/validators.js`) ya ponía `aria-invalid` en todos los campos: no hubo que tocar JavaScript. |
| 2 | G04 (M) «Cancelar» ambiguo | Cumplido | `js/comercio.js`: «Volver» en la hoja de anular/rechazar un pedido y en la de «Cerrar como no retirado». La hoja de cancelar un pedido del Cliente ya decía «Volver». Los `data-testid` no cambiaron. No se tocó ningún «Cancelar» de formulario. |
| 3 | G05 (M) doble ícono de eliminar | Cumplido | `js/carrito.js`: el «−» siempre lleva el ícono de resta y queda `disabled` con cantidad 1; el ícono de la derecha es el único que quita el producto. Spec `62` ajustado. |
| 4 | G06 (M) restos en la hoja de producto | Cumplido | Causa: `js/catalogo.js` agregaba un `div.divider` vacío; la clase está pensada para «línea — texto — línea» y sin texto dibuja dos tramos cortos. Se quitó (el espacio lo da `sep-t-20`). |
| 5 | M01 (M) Mis pedidos | Cumplido | `js/pedidos.js` y `css/styles.css`: el estado va en su propia fila (`pedido-card__top--estado-aparte`); el bloque del nombre ya no desborda (`min-width: 0`). Solo la lista del Cliente. |
| 6 | M02 (M) catálogo | Cumplido | `css/styles.css`: `.comercio-card__top` en columna; el nombre hasta 2 líneas. |
| 7 | M03 y N02 (M) tags vacíos | Cumplido | `js/explorar.js` oculta «Filtrar por tags» y su fila; `js/comercio.js` oculta el campo «Tags / Preferencias alimentarias» del formulario de producto. Los elementos quedan en el DOM. |
| 8 | M06 (M) título duplicado | Cumplido | `js/admin-reclamos.js` y `js/admin-soporte.js`: el `h1` lleva `titulo-pagina-escritorio` (oculto solo para lectores de pantalla en móvil, visible en escritorio). El resto de las páginas del Administrador no duplica el título (se revisaron las 18). |
| 9 | D01 checkout | Cumplido | Un solo botón principal por paso (`btn-resumen-accion`); el de la tarjeta queda en el DOM y se oculta en escritorio. La tarjeta mide lo que mide su contenido; «Volver» es una fila propia al pie, a la izquierda. `js/checkout.js` ya no mueve botones. El botón del resumen usa el mismo naranja: lo que se veía más oscuro era el estado hover del botón recién clicado (ver «Decisiones»). En el paso 4 no hay «Volver»: el pedido ya se creó. |
| 10 | D04 botón «‹» | Cumplido | `renderTopBar` suma la opción `primerNivel` (`js/catalogo.js`); Mis pedidos, Mi carrito y Notificaciones la usan y `css/escritorio-cliente.css` la oculta desde 1024 px. |
| 11 | D09, D10, D13, D14 | Cumplido | Soporte con H1 visible; Reclamos con «Ver detalle ›» (`reclamo-item-ver-detalle`); «Requieren atención» y tarjetas durazno por conteo (`alert-card--acento` según `comerciosPendientes`, `resolicitudesPendientes` y `documentosPendientes`); avisos del Cliente con «Ver pedido» naranja en la misma línea (`css/escritorio-cliente-perfil.css`). |
| 12 | N01 (M) código de verificación | Cumplido | `css/styles.css`: borde `#918980` (≈3,5:1) y naranja con foco. |
| 13 | N02 fotos del producto | Cumplido | `css/escritorio-comercio.css`: la tira de fotos ocupa una fila a todo el ancho sobre los campos (`flex-wrap`), casillas de 112 px. |
| 14 | N03 documentación | Cumplido | Causa de los títulos ocultos: una regla de `escritorio-admin-paginas.css` (`.doc-seccion__titulo { display: none }`) se aplicaba a todas las páginas; ahora solo a `#revision-contenido`. «Subir uno nuevo» limita su ancho. |
| 15 | N04 (M) sonido en el perfil | Cumplido | `comercio-perfil.html` suma `sonido-slot-perfil` (`padding: 0 20px`). **Desvío del enunciado:** el resto de los bloques de esa pantalla usa 20 px, no 16, así que se alineó con ellos (ver «Decisiones»). |
| 16 | N06 «Novedades» | Cumplido | `observarColumnaNovedades` (`js/tabla-admin.js`) y `tabla--sin-novedades` en Clientes y Dueños. |
| 17 | N07 Reembolsos | Cumplido | Columna de acción de 150 a 200 px y `white-space: nowrap`. |
| 18 | N08 Pendientes | Cumplido | El contador del encabezado queda junto al título (`margin-left: 0`; también Re-solicitudes). |
| 19 | G01 (M) filtros activos | Cumplido | Se quitó la regla que pintaba de negro los chips activos de Equipo; los demás usan `.chip[aria-pressed='true']` (naranja). |
| 20 | G03 tipografía | Cumplido | `css/escritorio-tipografia.css` (nuevo, importado desde `escritorio.css`): `--fs-xs` pasa a 13 px y unas 80 reglas pasan a 12 o 13 px según el color. Medición antes y después en `docs/DECISIONES.md`. |
| 21 | D02 tarjeta de producto | Cumplido | `css/escritorio-cliente.css`: grilla de la tarjeta, precio de 20 px/800 y «Ver y agregar» compacto junto al precio; 4 columnas desde 1280 px (3 a 1024). La foto ya era 4:3. En Explorar solo se agrandó el precio (esa tarjeta no tiene acción). |
| 22 | D03 un solo buscador | Cumplido | La barra del Cliente es el único buscador en escritorio: `js/cliente-escritorio.js` emite `barra-busqueda` y `js/explorar.js` filtra sin recargar. El campo de la página (`#explorar-buscador-propio`) queda en el DOM, oculto. |
| 23 | M04, M07 y D05 (M) sonido | Cumplido | Móvil: una sola tarjeta con el aviso adentro, solo si el audio está bloqueado. Escritorio: fila compacta de 44 px (`css/escritorio-base.css`), junto al interruptor de pedidos; el panel de menos de 1280 px acomoda el encabezado en dos filas. Horario: se quitó la línea «Tu comercio está abierto ahora. HH:mm a HH:mm» y queda el rótulo del turno («En curso · HH:mm a HH:mm»); el banner solo aparece si el comercio está cerrado. Perfil del Cliente: el bloque va debajo del menú en móvil y arriba en el riel de escritorio. Perfil del comercio: fila compacta. |
| 24 | D06 riel del Cliente | Cumplido | Riel de 280 px, email cortado con puntos suspensivos y `title`, sonido con la misma fila compacta. |
| 25 | D08 Comercios del Administrador | Cumplido | La columna «Tipo» pasó a «Localidad» (`direccion.nombreLocalidad`, ya viene en la API); toda la fila abre el detalle en escritorio, con hover. |
| 26 | D11 bienvenida | Cumplido | `bienvenida.html`: el titular de la columna blanca queda solo para lectores de pantalla en escritorio. |
| 27 | D12 registros | Cumplido | `css/escritorio-acceso.css`: «Cancelar» de los dos registros como enlace de texto. |

## Archivos modificados

Frontend: `admin-dashboard.html`, `bienvenida.html`, `comercio-perfil.html`, `explorar.html`, `perfil.html`; `css/escritorio.css`, `escritorio-acceso.css`, `escritorio-admin.css`, `escritorio-admin-paginas.css`, `escritorio-admin-tablas.css`, `escritorio-base.css`, `escritorio-cliente.css`, `escritorio-cliente-pedidos.css`, `escritorio-cliente-perfil.css`, `escritorio-comercio.css`, `styles.css`; `js/admin.js`, `admin-clientes.js`, `admin-duenos.js`, `admin-reclamos.js`, `admin-soporte.js`, `carrito.js`, `catalogo.js`, `checkout.js`, `cliente.js`, `cliente-escritorio.js`, `comercio.js`, `explorar.js`, `notificaciones.js`, `pedidos.js`, `tabla-admin.js`.

Archivo nuevo: `css/escritorio-tipografia.css`.

Pruebas: specs nuevos `150-e6-correcciones-movil-ui` y `151-e6-correcciones-escritorio-ui`; specs ajustados `62`, `138` y `139`; `capturas/critica.spec.ts` suma `ANCHOS`, `MEDIR_TIPOGRAFIA` y mueve el mouse antes de cada captura.

## Funciones no pedidas (todas de escritorio, para que lo pedido se vea bien)

- Encabezado del panel del comercio en dos filas por debajo de 1280 px (en 1024 px el saludo quedaba de una palabra por línea).
- Lista de pedidos del comercio de 340 px entre 1024 y 1279 px (el detalle quedaba de 230 px).
- `max-width` del encabezado del panel del Administrador por debajo de 1280 px (la tarjeta del Administrador tapaba la bajada).
- Casillas de fotos del producto de 112 px en escritorio (con 12 px la insignia «Principal» tapaba la cruz de quitar).
- `.comercio-estado-badge` de 13 px y 24 px de alto en escritorio (por la regla de tipografía).
- Sin funciones de interfaz nuevas fuera de las descritas.

## Pruebas

Specs nuevos: `150` (móvil, 14 tests) y `151` (escritorio, 16 tests). Specs existentes cambiados: `58`, `60`, `62`, `125`, `128`, `132`, `138`, `139`, `141`, `143` y `148` (la causa de cada uno está en `docs/DECISIONES.md`). Resultados y causa de cada falla de las corridas completas: `docs/DECISIONES.md`, entrada del 2026-11-13 (Tramo E6). Números vigentes: spec de Playwright `151`; el próximo libre es `152`.

