# MAPEO DFD NIVEL 2 — TRAMO D — COMPLEMENTO (frontend y pendientes)

> **Alcance.** Complementa `MAPEO-DFD2-TRAMO-D.md` (backend de P2.06 a P2.10, P3.02 y P3.03). No repite lo ya dicho ahí. Se relevó el frontend de P3.01, P3.02 y las pantallas de P2.06 a P2.10, las migraciones `V38` a `V41`, los restos de Extras, el orden de los listados y la comparación contra la documentación. Solo lectura: no se tocó código, no se hizo commit ni `git add`. Numeración de desvíos desde D-07 y de dudas desde C-06.
>
> **Qué documentación se comparó:** las copias de `docs/entregables-01-02/` (`requisitos-funcionales-*.md`, `Historias de Usuario - *.md`, `diccionario-de-datos.md`), que son las versiones corregidas más nuevas. No se compararon las de `01. Análisis de Requerimientos/` (según `CLAUDE.md` Diego las copia a mano).
>
> **Lo que NO se relevó** está marcado "NO RELEVADO". No se leyeron las hojas CSS: los colores, íconos y tamaños de los estados no se verificaron (solo las clases y los textos).

---

## 1. P3.01 Búsqueda y filtros de comercios (pantalla)

### 1.1 Hay dos pantallas distintas; la búsqueda de texto es de productos, no de comercios

- **Catálogo de comercios** (`index.html` + `js/catalogo.js`, función `initCatalogo`): **no tiene búsqueda de texto**. Solo cuatro chips de filtro y un orden fijo.
- **Explorar** (`explorar.html` + `js/explorar.js`, `initExplorar`): es un buscador de **productos** (título "Explorar productos", campo "Buscar producto por nombre"), no de comercios.
- La barra superior de escritorio (`js/cliente-escritorio.js`, línea ~257) tiene un campo "Buscar productos" (`maxlength` 80) que va a `explorar.html?q=…`. No busca comercios.
- **No existe ningún filtro por tipo de comercio, ni por localidad, ni orden elegible por el usuario.** El `tipoComercio` solo se muestra como texto en la tarjeta.

### 1.2 Catálogo de comercios: endpoints y filtros

- **Llamada:** una sola, `GET /catalogo/comercios` (sin parámetros, `auth: false`) al cargar, dentro de `try/catch`. Se pide una vez; los chips filtran en memoria sin volver a llamar.
- **Chips** (`filtros` en `initCatalogo`; `data-testid="chip-filtro-<key>"`, `aria-pressed`; uno solo activo; arranca "Todos"):

| Chip | Condición exacta |
|---|---|
| "Todos" | siempre verdadero |
| "Delivery" | `comercio.aceptaDelivery` |
| "Retiro" | `comercio.aceptaRetiro` |
| "Abierto ahora" | `comercio.estadoApertura === 'ABIERTO'` (`estaAbiertoParaClientes`) |

- **Orden:** después de filtrar, `.sort` por `estaAbiertoParaClientes` (abiertos primero). Dentro de cada grupo el orden es el que devuelve el servidor (el sort de JavaScript es estable). El servidor no ordena (ver §4.3).
- No hay debounce, ni chips de "filtros activos", ni botón de limpiar, ni paginación, ni "Ver más" en el catálogo de comercios: se pintan todos.
- **No se usa la localidad ni la dirección del Cliente** en el catálogo. La única localidad que aparece es `direccion.nombreLocalidad` en el detalle de un comercio. Tampoco se usa en Explorar.
- Se normalizan `nombre`, `razonSocial` y `direccion.calle` con `normalizarCampos` (Title Case).

### 1.3 Explorar productos: endpoints, filtros, paginación

- **Al cargar:** `GET /catalogo/filtros` (categorías y tags en uso, `auth: false`; **sin `try/catch`** en `initExplorar`, el error lo trata `apiFetch`). Muestra primero el esqueleto `productos`.
- **Lista:** `GET /catalogo/productos?categoriaId=&tagIds=&tagIds=&q=&pagina=` (`auth: false`). Se vuelve a llamar con cada cambio de filtro, búsqueda o página (la respuesta de una solicitud vieja se descarta con `solicitudActual`).
- **Búsqueda de texto:** campo `buscador-input`, **debounce de 300 ms** (`setTimeout`), `trim().toLowerCase()`; el valor inicial sale de `?q=` (`trim()`, máximo 80 caracteres). No normaliza tildes del lado del cliente: manda el texto en minúsculas al servidor, que busca en el nombre del producto (ver informe parcial, P3.02).- **Chips de categoría:** fila "Filtrar por categoría" con "Todas" + una por categoría; **una sola categoría activa** (volver a tocar la activa la desactiva). Cada cambio vuelve a la página 1.
- **Chips de tags:** fila "Filtrar por tags", **varios activos a la vez** (se mandan como `tagIds` repetidos; el servidor los combina con AND). Si no hay tags, la fila y su título se ocultan (`is-hidden`).
- **Contador:** `role="status"`, "1 resultado" o "N resultados" (con `totalProductos`). Se vacía mientras se limpian los filtros.
- **"Limpiar filtros"** (`btn-limpiar-filtros-explorar`): visible si hay búsqueda, categoría o algún tag; limpia todo y devuelve el foco al campo. **Borrar búsqueda** (`btn-limpiar-busqueda-explorar`, ícono X): visible si el campo no está vacío; limpia solo el texto.
- **Paginación:** botones numerados con flechas (`explore-pagination`), 20 productos por página (lo decide el servidor; el cliente usa `paginaActual`/`totalPaginas` de la respuesta). Hasta 7 páginas se muestran todas; con más, se muestra 1-2-3 … último, primero … 3 últimas, o primero … anterior-actual-siguiente … último, con `···`. Al cambiar de página hace `scrollTo` arriba con `behavior: 'smooth'`. Sin la barra de paginación si `totalPaginas <= 1`.
- **Orden:** el que devuelve el servidor, aleatorio en cada request (informe parcial). Por eso al cambiar de página el orden se vuelve a sortear.
- **Tarjeta de producto** (`renderProductoCard`): foto principal (o la primera), nombre, precio (`$` con puntos de miles, sin centavos), nombre del comercio. Un producto `AGOTADO` lleva la clase `explore-product-card__thumb--agotado` (se ve atenuado) pero **sigue siendo tocable**: lleva a `comercio-detalle.html?id=<comercioId>&producto=<id>`.

### 1.4 Estados de la pantalla (textos literales)

| Pantalla | Estado | Texto |
|---|---|---|
| Catálogo | carga | esqueleto `comercios` (3 tarjetas; texto oculto "Cargando…") |
| Catálogo | error de carga | "No pudimos cargar los comercios." + botón "Reintentar" (recarga la página) |
| Catálogo | sin comercios (lista vacía del servidor) | título "Todavía no hay comercios disponibles"; texto "Estamos incorporando negocios locales en Tierra del Fuego. Volvé a revisar pronto." |
| Catálogo | filtro sin resultados | título "Sin resultados para este filtro"; texto "Probá con otro filtro para ver más comercios disponibles." |
| Explorar | carga | esqueleto `productos` (3 tarjetas) |
| Explorar | sin productos y sin filtros | título "Todavía no hay productos disponibles"; texto "Estamos incorporando negocios locales en Tierra del Fuego. Volvé a revisar pronto." |
| Explorar | con filtros o búsqueda | título "Sin resultados"; texto "Probá con otro filtro o con otra búsqueda para ver más productos." |
| Explorar | error de carga | **sin tratamiento propio** (la llamada de lista no está en `try/catch`); NO hay botón de reintento en esta pantalla |

### 1.5 Quién ve qué

- **Visitante sin sesión:** ve el catálogo completo. Saludo: "Iniciá sesión para bajonear ;)" y sin subtítulo. En el menú del producto aparece "Iniciá sesión para pedir" (enlace a `login.html`) en vez de agregar.
- **Cliente con sesión:** saludo "Hola, {nombre} 👋" y subtítulo "¿Qué comemos hoy?" (`pintarSaludo`; sin nombre, "Hola 👋"). Si es además Empleado de algún comercio y no eligió contexto, `exigirContextoCliente` lo manda al selector de contexto; si el contexto elegido es Empleado, lo manda al inicio del comercio.
- **Dueño o Administrador que entra a `index.html`:** `initCatalogo` los redirige a `resolverHomePorRol(usuario)` (o `login.html` si eso falla). **No** ven el catálogo.
- **`explorar.html` y `comercio-detalle.html` no redirigen al Dueño ni al Administrador:** un Dueño puede abrir el detalle de un comercio; ahí, como no es `CLIENTE`, el menú del producto le ofrece "Iniciá sesión para pedir" (comportamiento del código; ver D-08).

### 1.6 Cómo se muestra cada `estadoApertura`

Lógica en `js/apertura-comercio.js` (`estaAbiertoParaClientes`, `etiquetaCierrePublica`) y `js/catalogo.js` (`renderComercioCard`, `pintarEstadoComercio`):

| `estadoApertura` | En el listado | En el detalle |
|---|---|---|
| `ABIERTO` | tarjeta normal (`comercio-card`), chip "Abierto" con punto (`comercio-estado-badge--open`) arriba junto al nombre | chip "Abierto"; fila de horario "Abierto ahora · {resumen de hoy}" (o solo el resumen si "Cerrado hoy") |
| `CERRADO_HORARIO` | tarjeta atenuada (`comercio-card--cerrado`), chip "Cerrado" **al final** de la tarjeta (`comercio-card__cierre`); sin chip arriba | chip "Cerrado"; fila de horario con solo el resumen de hoy |
| `CERRADO_MANUAL` | igual que `CERRADO_HORARIO`: chip "Cerrado" | igual |
| `CERRADO_TEMPORALMENTE` | atenuada; chip "Cerrado temporalmente" | chip "Cerrado temporalmente" |

- **Cualquier valor distinto de `ABIERTO` se trata como cerrado** (incluso uno desconocido), con la etiqueta "Cerrado".
- `data-apertura` de la tarjeta lleva el valor crudo de `estadoApertura`.
- **`textoReapertura`:** se muestra **solo en el detalle**, como una fila de información extra (`data-testid="texto-reapertura-comercio"`) cuando `!abierto && comercio.textoReapertura`. **No se muestra en la tarjeta del listado.** Con `CERRADO_TEMPORALMENTE` el servidor lo manda nulo, así que la fila no aparece.
- Los estilos de color/ícono (punto verde, gris) viven en `css/`: NO RELEVADO.
- **Un comercio cerrado sí se puede abrir:** la tarjeta sigue siendo un enlace (`<a href="comercio-detalle.html?id=…">`), y el detalle carga igual. Lo que no se puede es agregar al carrito (ver §2.4).
- Cada texto de horario ("Hasta las HH:mm" para una cola de ayer que cruza la medianoche, rangos "HH:mm a HH:mm", "Cerrado hoy", "Sin horario cargado") sale de `resumenHorarioHoy` (`js/horarios.js`) **calculado con el día del reloj del navegador** (`new Date().getDay()`), no con el del servidor. Solo afecta al texto del resumen, no al estado abierto/cerrado.

---

## 2. P3.02 Detalle de comercio y menú (pantalla)

### 2.1 De dónde sale cada dato

- **No hay endpoint de detalle de comercio.** `initComercioDetalle` vuelve a pedir `GET /catalogo/comercios` (sin parámetros, `auth: false`, **sin `try/catch`**) y busca el comercio por `id` en la lista (`comercios.find`).
- **Productos:** `GET /catalogo/comercios/{id}/productos` (una vez, sin `try/catch`). Con una categoría activa vuelve a llamar con `?categoriaId=`; el filtro por tag es en memoria.

### 2.2 Qué muestra

- Foto de portada (avatar del comercio), nombre (`h1`), chip de estado, descripción (si no tiene, se elimina el bloque), fila de horario de **hoy** (no la semana completa), fila de `textoReapertura` (si aplica), fila de dirección ("{calle} {número}, {localidad}") y pills "Delivery" y "Retiro" según modalidades.
- **No muestra** tipo de comercio, teléfono, redes sociales ni los horarios de toda la semana (la página `comercio-detalle.html` solo tiene los contenedores `comercio-hero`, `comercio-nombre`, `comercio-estado-badge`, `comercio-info`, `comercio-descripcion`, `chip-row` y `product-list`; el código de `catalogo.js` no pinta redes ni teléfono). Ver D-07.
- La barra superior lleva el nombre del comercio como título y el botón volver: a `explorar.html` si la URL trae `?producto=`, si no a `index.html`. Si el usuario es `CLIENTE`, suma el ícono del carrito con contador.

### 2.3 Filtros y orden de los productos

- Fila de chips: "Todos" + una por categoría (en el orden de **primera aparición** en la lista) + una por tag (`#tag`, también por primera aparición). **Una categoría y un tag pueden estar activos a la vez** (se combinan con AND); "Todos" limpia ambos. Los chips se ocultan si el comercio no tiene productos.
- Los productos se agrupan por categoría (`<h2>` por categoría, en orden de aparición) y, dentro, en el orden del servidor (sin `ORDER BY`, ver §4.3).
- Cada fila (`renderProductoRow`): nombre, descripción (si hay), precio ($ con puntos), foto y, a la derecha, el texto "Ver y agregar" o, si el producto está `AGOTADO`, "Agotado" (foto atenuada con `product-row__thumb--agotado`).
- **Un producto `AGOTADO` sí se puede tocar:** abre el menú del producto igual (los dos estados son un `<button>`). Dentro, aparece el aviso "Este producto está agotado en este momento." y no hay stepper ni botón de agregar (solo se ofrecen con `estado === 'DISPONIBLE'` y comercio abierto).
- Estados: sin productos: "Este comercio aún no cuenta con productos" + enlace "Explorá otros comercios →"; filtro sin coincidencias: título "Sin productos para este filtro", texto "Probá con otro filtro para ver más opciones del menú.".
- Si llegó con `?producto=<id>` y el producto existe en la lista, abre su menú automáticamente.

### 2.4 Agregar al carrito: mensajes literales

Menú del producto (`abrirModalProducto`) con un `CLIENTE`, producto `DISPONIBLE` y comercio abierto:

- Campos: "Cantidad" (stepper 1 a 20; "−" deshabilitado en 1, "+" deshabilitado en 20), "Nota (opcional)" (máximo 255, placeholder "Ej: sin cebolla") y botón "Agregar al carrito - {precio × cantidad}".
- Validación local: si `excedeSubtotalMaximo(precio, cantidad)` → toast de error con `mensajeSubtotalMaximoExcedido()` (el texto vive en `js/validators.js`: NO RELEVADO).
- Mientras envía: el botón pasa a "Agregando...".
- Éxito: se cierra el menú, toast verde "Producto agregado al carrito" y se actualiza el contador del carrito.
- Avisos fijos dentro del menú (`crearAvisoPunto`, punto + texto): "Este producto está agotado en este momento." (si `AGOTADO`) y "Este comercio está cerrado en este momento." (si el comercio se ve cerrado en el listado, sea por horario, pausa o bloqueo). Con comercio cerrado no se ofrece agregar (la decisión es del cliente a partir de `estadoApertura`, no del servidor).
- **Respuestas `409` del servidor** (`validarAceptaPedidos` y carrito):
  - mensaje que contiene "otro comercio" → se cierra el menú y se abre el modal de conflicto (abajo);
  - mensaje que empieza con "Este comercio está cerrado" o "Este comercio no está aceptando" (o `data.codigo === 'COMERCIO_SIN_PEDIDOS'`) → el botón se **reemplaza** por un aviso de error `role="alert"` (`banner-cierre-comercio`) con el texto literal del servidor y un botón "Volver al catálogo" (`crearAvisoCierre`);
  - cualquier otro error: toast de error con `error.message` (o "No pudimos agregar el producto. Intentá nuevamente." si no es un `ApiError`) y el botón vuelve a habilitarse.
  - Por lo tanto los textos que ve el Cliente son los que manda el servidor (informe parcial, P3.02): "Este comercio está cerrado en este momento", "Este comercio está cerrado en este momento. Podés hacer tu pedido dentro de su horario de atención.", "Este comercio no está aceptando pedidos en este momento" y el de "El producto no está disponible" (este último como toast). **El mensaje de `SUSPENDIDO` ("Este comercio no está recibiendo pedidos por ahora. Probá con otro comercio.") no empieza con ninguno de los dos prefijos que el frontend reconoce como cierre**, así que se muestra como toast y no como aviso fijo con "Volver al catálogo" (C-06). En la práctica un comercio suspendido ni siquiera aparece en el catálogo.
- **Modal de conflicto de comercio** (`mostrarModalConflictoComercio`): pide `GET /carrito`; título "Tu carrito tiene productos de otro comercio"; texto `Para agregar productos de "{nuevo}" necesitás vaciar el carrito con los artículos de "{actual}".`; dos tarjetas "Comercio actual" (con "N producto(s)") y "Nuevo pedido" ("1 producto"); botones "Vaciar carrito y agregar" y "Cancelar". "Vaciar carrito y agregar" → "Vaciando..." → `DELETE /carrito` y luego `POST /carrito/items`; éxito: toast "Producto agregado al carrito"; error: toast con el mensaje del servidor o "No pudimos completar la acción. Intentá nuevamente.".
- **Acción de vaciar carrito en la pantalla del carrito** (`carrito.html` / `js/carrito.js`): NO RELEVADO en esta pasada más allá del encabezado "Vaciar todo" ya descrito en `CLAUDE.md`.

### 2.5 Si el comercio ya no está visible

- No hay `404` ni redirección: como el detalle busca en la lista pública, un comercio que dejó de estar visible simplemente no se encuentra. Se muestra la barra superior (con volver) y el estado vacío: título "Comercio no encontrado", texto "Este comercio no está disponible en este momento." (si el `id` de la URL no es numérico o es 0: "El enlace que seguiste no es válido."). No hay botón de acción.
- Si el comercio sí está en la lista pero el segundo pedido (`/catalogo/comercios/{id}/productos`) devolviera `404`, no hay `try/catch`: lo trata el manejo global de `apiFetch` (NO RELEVADO su comportamiento exacto) (C-07).

---

## 3. Pantallas de P2.06 a P2.10

### 3.1 P2.06 Panel de pedidos del comercio: "Vendido en el turno"

`initComercioDashboard` (`js/comercio.js`) + `js/turno-resumen.js`. Pide en paralelo `GET /pedidos/comercio/resumen-turno` y `GET /pedidos/comercio` (con `segundoPlano` en las recargas). Dibuja solo si cambió la "firma" del resumen y los pedidos activos.

- **Rótulo del turno** (`textoRotuloTurno`, punto verde si `EN_CURSO`, gris si no):
  - `SIN_TURNO` (o sin turno): "Sin turno por ahora".
  - `EN_CURSO`: "En curso · {rango}" si el turno abrió hoy; "En curso desde ayer · {rango}" si abrió ayer; "En curso desde el {dd/mm} · {rango}" si abrió antes.
  - `TERMINADO`: "Terminó · {rango}" (hoy); "Terminó ayer · {rango}"; "Terminó el {dd/mm} · {rango}".
  - `{rango}` = "HH:mm a HH:mm" y, si cruza la medianoche, " (día siguiente)"; un fin a las 00:00 en un turno que no cruza se muestra "23:59".
- **Tres contadores** (barra `stats-bar`): "Vendido en el turno" (con `$`), "Pedidos del turno" y "Pendientes". En `SIN_TURNO`, los dos primeros muestran "–" y "Pendientes" su cifra. En escritorio se suma una cuarta columna oculta en móvil, "En preparación" (cuenta los pedidos `EN_PREPARACION` de la lista; **no sale del servidor**).
- **Comisión y neto:** solo se dibujan si la respuesta trae las propiedades `comision` y `neto` (el frontend decide por presencia, no por rol). Aparece el botón "Ver comisión y neto" / "Ocultar comisión y neto" (`aria-expanded`), con las filas "Comisión" y "Neto del turno". El estado abierto/cerrado se recuerda mientras no se recargue la página (variable de módulo). No se muestra en `SIN_TURNO`.
- **Recarga automática** al terminar el turno en curso (`setTimeout` hasta `turno.fin` + 1,5 s). Además recarga cada vez que cambia la lista de comercios en memoria (sondeo de 15 s), al volver a la pestaña y al volver desde el caché del navegador.
- Banners del panel (prioridad): tarjeta de suspensión (§3.5); aviso de "no operativo" solo para el Empleado: "Comercio cerrado temporalmente. No se aceptan pedidos nuevos."; si no, si `abiertoAhora` es falso: "Tu comercio está cerrado en este momento" ("Este comercio está…" para el Empleado).
- El resto del panel (lista de pedidos activos, chips de la pantalla de pedidos) queda fuera de este complemento: NO RELEVADO.

### 3.2 P2.06 Pantalla de estadísticas del Dueño

`comercio-estadisticas.html` + `js/estadisticas.js` (`initComercioEstadisticas`). Entrada: enlace "Ver estadísticas" (`btn-estadisticas`) debajo de las métricas del panel, creado por JavaScript **solo si `esContextoDueno()`**. La pantalla exige Dueño (`exigirDueno`).

- **Chips de 7 y 30 días: son del frontend.** `RANGOS = [7 días, 30 días]`; por defecto 30. Mandan `hasta = diaDeHoyEnZonaComercio()` y `desde = hasta − (N − 1) días` (el rango **incluye hoy**: "últimos 7 días" = hoy y los 6 anteriores). `diaDeHoyEnZonaComercio()` usa una zona fija del frontend (`js/fechas.js`), no el reloj del navegador.
- **Dos llamadas por rango, en paralelo:** `GET /comercios/estadisticas?desde=&hasta=&agrupar=DIA` y `…&agrupar=TURNO`. El gráfico y los totales salen de `DIA`; el detalle de cada día, de `TURNO`. Se guardan en un `Map` (`cache`) mientras no se recargue la página: volver a elegir un rango ya pedido no vuelve a llamar. Un error borra la entrada del caché.
- **Selector DIA/TURNO: no existe en pantalla** (siempre se piden los dos).
- **Cuatro cifras** (`estadisticas-cifras`): "Vendido", "Comisión", "Neto", "Ticket promedio"; con `totales.pedidos === 0` o valor nulo muestran "–".
- Texto del período: "Del {dd/mm} al {dd/mm}".
- **Gráfico de barras** hecho a mano ("Vendido por día"): una barra por día (botón, `aria-pressed`, `aria-label` "dd/mm: $monto"), altura proporcional al máximo con un piso del 3 %; los días en cero llevan la clase `--vacia`. Teclado: flecha izquierda/derecha, Inicio y Fin. Eje con la primera y la última fecha. Nota fija: "Cada pedido cuenta en el día en que abrió su turno."
- **Detalle del día** (zona `aria-live="polite"`): al principio "Tocá una barra para ver el detalle de ese día."; al elegir una barra: título "{día de la semana} {dd/mm}", "Vendido $X", "N pedido(s)" y la lista de turnos "{rango o 'Sin turno asignado'} — $X · N pedido(s)". Un día sin pedidos: "No hubo pedidos este día.". Volver a tocar la barra elegida la deselecciona.
- **Resultados** ("Cómo terminaron los pedidos"): siete filas fijas, con cantidad (las de cantidad 0 llevan `--cero`): "Entregados", "No retirados", "Rechazados", "Cancelados", "Anulados", "Sin respuesta" (`EXPIRADO`) y "En curso".
- **Estados:** carga: esqueleto (4 cifras, gráfico y lista); error: banner "No pudimos cargar las estadísticas. Probá de nuevo." + botón "Reintentar"; vacío: "No hubo pedidos en los últimos {7|30} días." y, solo en el rango de 7 días **si** en 30 hubo pedidos, botón "Ver los últimos 30 días".
- Solo se arma la pantalla; el título de la barra superior es "Estadísticas" con volver a `comercio-dashboard.html`.

### 3.3 P2.07 Cerrar y abrir el comercio (pantalla)

`js/cierre-comercio.js` (`montarSwitchCierre`), montado en el panel solo si `contextoPuedeCerrarComercio()` (Dueño o Empleado) y, dentro, solo si el comercio activo es `APTO_VENTA` (`tieneCierre`); con otro estado la tarjeta no se dibuja.

- **Tarjeta con interruptor** (`role="switch"`), tres modos según `modoSwitchCierre`:
  - `ABIERTO` (no cerrado a mano y `abiertoAhora`): título "Recibiendo pedidos", subtítulo "Pausalo cuando quieras dentro de tu horario", interruptor encendido.
  - `PAUSADO` (`cerradoManualmente`): título "Pedidos pausados", subtítulo = `textoReapertura` (vacío = oculto), interruptor apagado.
  - `FUERA_DE_HORARIO` (no abierto ahora y no pausado): título "Fuera de horario", subtítulo "Podés pausar dentro de tu horario", apagado.
  - Si `puedeCambiarCierre` es falso, el interruptor queda deshabilitado (clase `cierre-card--bloqueado`). En `FUERA_DE_HORARIO` el clic no hace nada.
- **Cerrar** pide confirmación (hoja): título "¿Dejar de recibir pedidos?", texto "Los pedidos en curso siguen su camino.", botones "Cerrar" y "Cancelar" (foco inicial en "Cancelar"). **Abrir es directo, sin confirmación.**
- **Toasts:** "Comercio cerrado" / "Comercio abierto". Error `409` con mensaje: aviso fijo en `aviso-cierre-slot` con el texto del servidor (p. ej. "Solo podés abrir o cerrar dentro de tu horario", "Este comercio no está operativo"); otro error: toast "No pudimos actualizar el estado. Probá de nuevo.". Siempre se refresca la lista de comercios.
- Carga: esqueleto con un interruptor gris.
- **Qué ve cada uno:** el Dueño y el Empleado ven la misma tarjeta y el mismo texto. **Con `CERRADO_TEMPORALMENTE` o `SUSPENDIDO` la tarjeta no existe** (no hay mensaje en esa tarjeta). El texto del estado `CERRADO_TEMPORALMENTE` aparece en otros lugares:
  - Panel del **Empleado**: banner "Comercio cerrado temporalmente. No se aceptan pedidos nuevos." (el Dueño **no** ve ese banner; con el comercio en `CERRADO_TEMPORALMENTE` el Dueño ve solo "Tu comercio está cerrado en este momento" cuando `abiertoAhora` es falso, ver C-08).
  - Perfil del comercio (`textoEstadoDelComercio`): "Cerrado temporalmente" (y "Suspendido", "Pedidos pausados", "Abierto ahora" o "Cerrado en este momento").
  - Catálogo público: "Cerrado temporalmente" (§1.6).
  - Panel de Administrador: chip "Cerrado temporalmente" (`BADGE_ESTADO_COMERCIO`).
  - Por lo tanto **el texto es el mismo ("Cerrado temporalmente") en las cuatro pantallas donde aparece; lo que varía es el contexto, no la palabra.** Detalle del avisos del panel del Dueño: ver D-10.

### 3.4 P2.08 Productos del comercio (pantallas)

**Lista** (`comercio-productos.html`, `initComercioProductos`). `GET /productos` al cargar; todo lo demás es en memoria.

- Filtros por estado (chips): "Todos", "Disponibles", "Agotados", "Descontinuados". Búsqueda por nombre (`buscar-producto-input`, `includes` en minúsculas, **sin debounce, sin quitar tildes**). Orden: los `DESCONTINUADO` al final, el resto en el orden del servidor.
- Tabla de escritorio con columnas "Producto", "Categoría", "Precio", "Estado" y "Acciones" (botón "Editar"). Estado en texto: "Disponible", "Agotado", "Descontinuado"; en móvil, insignia solo para Agotado y Descontinuado.
- Vacío: "Todavía no cargaste ningún producto. Usá el botón + para crear el primero." (Empleado: "Este comercio todavía no tiene productos cargados. Usá el botón + para crear el primero."); sin coincidencias: "No encontramos productos con ese filtro.".
- Menú de acciones por producto (hoja): "Editar producto"; "Marcar como agotado" (si `DISPONIBLE`) o "Marcar como disponible" (si `AGOTADO`); "Descontinuar producto" (peligro); "Cancelar". Un `DESCONTINUADO`: "Este producto está descontinuado y no admite más cambios." sin acciones.
- Cambio de estado: toast "Estado del producto actualizado". Errores `409`: aviso fijo con el mensaje del servidor; otros: toast con el mensaje o "No pudimos actualizar el estado".
- **Descontinuar:** hoja `¿Descontinuar "{nombre}"?` con el texto "Esta acción no se puede deshacer. El producto va a dejar de mostrarse en tu catálogo público, se va a quitar de los carritos activos que lo tengan, y no vas a poder volver a marcarlo como disponible.", casilla obligatoria "Entiendo que esta acción es irreversible" (el botón queda deshabilitado hasta marcarla), botones "Sí, descontinuar" ("Descontinuando…") y "Cancelar". Toast "Producto descontinuado".
- Toasts al volver del formulario: "Producto creado con éxito", "Producto actualizado con éxito", "Producto descontinuado".
- Con el comercio `SUSPENDIDO` (Dueño y Empleado): botón "+" y botón "Nuevo producto" ocultos, sin menú de acciones, y aviso "El comercio está suspendido: los productos están en solo lectura." (`aviso-productos-suspendido`).

**Formulario** (`comercio-producto-form.html`, `initComercioProductoForm`):

- Título "Nuevo producto" / "Editar producto"; botón "Crear producto" / "Guardar cambios" ("Guardando..."); el botón nace deshabilitado y se habilita al haber al menos una foto.
- **Validaciones del cliente (textos):** nombre vacío: "El nombre del producto es obligatorio."; nombre con símbolos: "Ingresá un nombre válido (letras, números y espacios, sin símbolos)." (regex `^[\p{L}0-9][\p{L}0-9 ]*$`); categoría: "Seleccioná una categoría."; fotos: "Agregá al menos una foto del producto."; precio vacío: "El precio es obligatorio."; más de 8 dígitos: "El precio no puede tener más de 8 dígitos."; precio 0: "El precio debe ser mayor a $0."; tags: "Podés seleccionar hasta 5 tags.".
- El precio se escribe con puntos de miles (solo dígitos, máximo 8) y sin centavos; al salir del campo nombre se aplica Title Case.
- Selector de categoría: solo las `activo`; placeholder "Seleccioná una categoría". Tags: chips de los `activo`; el bloque se oculta si no hay tags.
- **Imágenes:** hasta 5 (`MAX_IMAGENES_POR_PRODUCTO`); formatos JPG, PNG o WEBP; máximo 5 MB. Errores literales: "Formato no permitido. Usá JPG, PNG o WEBP." y "La imagen no puede superar los 5 MB." (como toast); "Ya alcanzaste el máximo de 5 fotos por producto." (al crear). Ayuda: "Resolución recomendada: 1200 x 900 px (4:3)". Cada foto pasa por el editor de recorte con proporción 4:3 (`abrirEditorRecorte`); la etiqueta "Principal" marca la primera; se reordenan arrastrando (en edición, cada movimiento pega `PATCH …/orden`; toast "Orden de las fotos actualizado"); botón de recorte solo en edición ("Imagen actualizada"); quitar: "Imagen eliminada" (edición) o sin toast (todavía no subidas). Subida: banner "Subiendo imagen..." y toast "Imagen agregada". En alta, las fotos se suben **después** de crear el producto; si falla alguna, redirige a `?id=<nuevo>&fotosParcial=1` con el banner "Creamos el producto, pero no pudimos subir todas las fotos. Podés agregar o reintentar las que falten acá abajo.".
- **Precio bloqueado en franja:** si `precioBloqueado`, el campo queda deshabilitado con un candado y la leyenda "Se puede cambiar fuera de tu horario de atención"; se rehabilita solo cuando llega `precioBloqueadoHasta`. Si aun así el servidor responde `409` con `data.codigo === 'PRECIO_BLOQUEADO_EN_FRANJA'`: aviso fijo con el texto del servidor, el campo vuelve al precio guardado y se bloquea.
- Un producto `DESCONTINUADO` no se puede abrir: banner "Este producto está descontinuado y no se puede editar." y el formulario se oculta; producto inexistente: "No encontramos este producto.".
- Errores del servidor: `409` → aviso fijo; errores por campo (`nombre`, `precio`, `categoriaId`) → junto al campo; otros → banner "No pudimos guardar el producto." (o el mensaje del servidor).
- En edición hay un enlace "Descontinuar" que abre la misma hoja de confirmación.

### 3.5 P2.09 Suspensión de comercio (pantallas)

**Administrador** (`js/admin-comercio-suspension.js`, desde el modal de detalle de un comercio en `admin-comercios.html`):

- Botón "Suspender" (solo estados `APROBADO`, `APTO_VENTA` y `CERRADO_TEMPORALMENTE`) o "Levantar suspensión" (si `SUSPENDIDO`).
- **Hoja "Suspender {nombre}":** resumen "Deja de aparecer en el catálogo." y un bloque "Ver detalle" con la vista previa de `GET /administrador/comercios/{id}/suspension/previa` (mientras carga: "Cargando…"). Líneas literales: "N pedido(s) pendiente(s): se rechaza(n) ahora y se reembolsa(n). No se puede deshacer."; "N pedido(s) en preparación: tiene(n) {tope} minutos para despacharlo(s) o se cancela(n) con reembolso."; "N pedido(s) listo(s) para retirar: …entregarlo(s) o se cierra(n) como no retirado(s)."; "N pedido(s) en camino sigue(n) igual."; "N pedido(s) sin pagar no se puede(n) pagar."; "No tiene pedidos en curso.". Si falla la vista previa: aviso "{mensaje} Igual podés suspender el comercio.".
- **Motivo:** campo "Motivo (lo va a ver el Dueño)", placeholder "Contale al Dueño por qué se suspende el comercio", **mínimo 10 caracteres** (el botón "Suspender comercio" queda deshabilitado hasta tenerlos; el máximo de 500 lo valida el servidor, ver informe parcial). Mientras envía: "Suspendiendo…". Éxito: toast "Comercio suspendido" y se recarga la lista. `409`: "{mensaje del servidor}. Cerrá esta ventana: la lista se actualiza." y se refresca la lista.
- **Hoja "Levantar suspensión":** muestra "Suspendido desde {fecha}" y el motivo actual; texto "Vuelve a vender si tiene cuenta de cobro activa y documentación aprobada. Si no, queda aprobado sin poder vender."; campo opcional "Mensaje para el Dueño (opcional)"; botón "Levantar suspensión" ("Levantando…"); toast "Suspensión levantada".
- Bloque de estado dentro del modal cuando está `SUSPENDIDO`: chip "Suspendido", "desde {fecha}", el motivo, y: si el origen es el Dueño, "Suspendido junto con el Dueño" y la explicación "No se puede levantar solo este comercio. Para reactivarlo hay que levantar la suspensión del Dueño." con enlace "Ir al Dueño" (el botón "Levantar" queda deshabilitado) más el botón "Suspender solo este comercio" (aviso: "Va a seguir suspendido aunque levanten la suspensión del Dueño. Después lo vas a poder levantar desde acá."); si el Dueño tiene la cuenta suspendida: aviso "El Dueño tiene la cuenta suspendida. Primero levantá la suspensión del Dueño; después podés levantar este comercio." y "Levantar" deshabilitado.
- **Reenvío de email fallido:** si `ultimoEmailAvisoFallido`, aparece "No se envió el email" con el botón "Reenviar" ("Reenviando…"); toasts "Email reenviado" o el error ("No pudimos reenviar el email. Probá de nuevo.").

**Dueño y Empleado con el comercio suspendido** (`js/comercio-suspendido.js` y varios archivos):

- **Tarjeta en el panel** (`tarjeta-comercio-suspendido`, `role="status"`): título "Comercio suspendido" (Dueño) o "Este comercio está suspendido" (Empleado); solo el Dueño ve "Desde el {dd/mm} a las {HH:mm}" y "Motivo: {motivo}"; ayuda: Dueño "No recibe pedidos nuevos y no podés editarlo. Podés resolver los pedidos en curso, subir documentos y vincular Mercado Pago."; Empleado "No recibe pedidos nuevos. Podés resolver los pedidos en curso."; enlace "Contactar a Soporte" (`soporte.html?tipo=APELACION_COMERCIO`).
- **Franja en la pantalla de pedidos** (`pintarFranjaPedidos`): "Comercio suspendido. Tenés hasta las {hora} para resolver los pedidos en curso." (si hay un límite de 90 minutos), "Comercio suspendido. Resolvé los pedidos en curso." o "Comercio suspendido. No tenés pedidos en curso.".
- **Texto por pedido** (`textoDePedidoSuspendido`): "Se va a rechazar y reembolsar solo." (pendiente), "Despachalo o anulalo antes de las {hora}." (en preparación), "Entregalo o marcalo como no retirado antes de las {hora}." (listo para retirar), "Sigue su curso." (en camino).
- **Controles deshabilitados** (`protegerPorSuspension`): se deshabilitan con el texto "El comercio está suspendido" debajo (p. ej. editar perfil, editar horarios, la foto de perfil sin texto). La lista de productos queda en solo lectura (§3.4). El interruptor de cierre no se dibuja.

### 3.6 P2.10 Listados del Administrador (pantallas)

- **Dueños** (`admin-duenos.html`, `js/admin-duenos.js`): carga `GET /administrador/duenos` (completo); **todo el filtrado es del cliente**. Búsqueda "Nombre o email" (sin debounce, se aplica en cada tecla; ignora tildes y mayúsculas con `normalize('NFD')` en nombre y email), chips "Todos", "Suspendidos", "Bloqueados", "Inactivos" (por `estado`); orden por nombre (`localeCompare`); **"Ver más" de a 30** (`DUENOS_POR_PAGINA`; vuelve a 30 al cambiar filtro o búsqueda); contador "Mostrando N dueño(s)" / "Mostrando N de M dueños". Columnas "Nombre", "Contacto" (email · N comercios), "Estado", "Novedades" (motivo y fecha de la suspensión, "No se envió el email · Reenviar"). Vacíos: "No hay dueños registrados" (lista vacía del servidor) y "No hay dueños con esos filtros." Con `?id=N` muestra solo a ese Dueño con la caja "Mostrando a {nombre}" y "Ver todos". Error de carga: aviso con el mensaje y botón "Reintentar".
- **Clientes** (`admin-clientes.html`, `js/admin-clientes.js`): mismo diseño (búsqueda "Nombre o email", chips "Todos", "Suspendidos", "Bloqueados", "Inactivos", "Pendientes", orden por nombre) pero **sin "Ver más"** (no hay paginación). Columnas "Nombre", "Email", "Estado", "Novedades". Vacíos: "No hay clientes registrados" y "No hay clientes con esos filtros.". Acciones del menú: "Reactivar cuenta", "Levantar suspensión", "Suspender cuenta", "Reenviar email".
- **Comercios** (`admin-comercios.html`, `initAdminComercios` en `js/admin.js`): carga `GET /administrador/comercios` (todos los estados); **sin búsqueda, sin filtros, sin paginación**; orden por nombre (`localeCompare`). Columnas "Comercio", "Localidad", "Estado" y la acción "Ver detalle" (la fila entera es clicable solo en escritorio). Insignia de estado: "Aprobado", "Listo para vender" (`APTO_VENTA`), "Pendiente", "Rechazado", "Rechazo definitivo", "Suspendido", "Cerrado temporalmente", "Inactivo". Vacío: "No hay comercios". El contenido del modal de detalle (datos fiscales, redes, etc.): NO RELEVADO salvo los botones "Equipo", "Ver documentos", "Suspender"/"Levantar suspensión" y "Cerrar".
- **Categorías y Tags** (`js/admin.js`): chips de filtro (por activo/inactivo), tabla "Nombre"/"Productos"/"Estado"; vacíos "No hay categorías para mostrar" y "No hay tags para mostrar". Reembolsos: chips por estado; vacío "No hay reembolsos pendientes de revisión". Solicitudes pendientes: orden por `fechaRegistro` ascendente; vacío "No hay solicitudes pendientes". (Solo se listaron; sus detalles no se relevaron.)

---

## 4. Pendientes del backend

### 4.1 Migraciones `V38` a `V41` (y qué tramo es cada una)

Según el encabezado de los archivos y `CLAUDE.md` §1bis (tramos de la Fase 2):

| Migración | Archivo | Tramo | Objetivo |
|---|---|---|---|
| `V38` | `V38__horario_vigencia.sql` | **T1** | `horario.vigente_desde` (`date NOT NULL DEFAULT '2000-01-01'`) y `vigente_hasta` (`date NULL`), `CHECK chk_horario_vigencia`, índice `(comercio_id, vigente_desde, vigente_hasta)` en reemplazo de `idx_horario_comercio`. Habilita turnos que cruzan la medianoche (cierre menor que apertura) y la edición versionada de horarios. |
| `V39` | `V39__pedido_turno.sql` | **T2** | `pedido.fecha_pago_confirmado`, `turno_fecha`, `turno_horario_id` (todas `NULL`), tres índices, `fk_pedido_turno_horario`; y un `UPDATE` que completa `fecha_pago_confirmado` desde el mínimo `fecha_hora` del historial con estado `PENDIENTE_CONFIRMACION_COMERCIO`. |
| `V40` | `V40__item_carrito_precio_visto.sql` | **T3** | `item_carrito.precio_visto` (`decimal(10,2) NULL`), base del aviso "Cambió el precio". El bloqueo de precio en franja y `totalEsperado` no necesitan columnas. |
| `V41` | `V41__cierre_turno.sql` | **T4** | tabla `cierre_turno` (una fila por comercio, `turno_fecha` y `horario_id`; `UNIQUE uq_cierre_turno`; cifras congeladas y estado del email de envío; FKs a `comercio` y `horario`). |

**T5 (estadísticas del Dueño) no tiene migración.** `V42` en adelante son de otros tramos (Fase 3 direcciones, Fase 4 documentos, etc.).

### 4.2 Extras de producto: qué queda vivo

- **Base de datos:** las 5 tablas existen desde el baseline `V1__baseline_bajonea_final.sql` (`grupo_extra`, `extra`, `producto_grupo_extra`, `item_carrito_extra`, `detalle_pedido_extra`). Ninguna migración posterior las usa.
- **Backend:** no hay Entity, Repository, Service, Controller ni DTO de extras. **Restos de código:** `enums/TipoEntidadEdicion` tiene los valores `GRUPO_EXTRA` y `EXTRA`, y `ActividadComercioService` tiene las ramas "Creó/Editó/Eliminó un grupo de extras" y "… un extra" (ramas inalcanzables hoy, ningún servicio escribe esas filas). Comentarios que anticipan el bloque: `ItemCarritoRepository` (cada `DELETE` en bloque de ítems tendrá que borrar antes `item_carrito_extra`, porque `fk_item_carrito_extra_item` no tiene `ON DELETE CASCADE`) y `HistorialEdicionComercioService` ("horarios y extras cuando existan").
- **Frontend:** no hay código de extras (ni selector, ni carrito, ni formulario). Las coincidencias de "extra" en `js/` son palabras comunes (`extras` como parámetro, `stats-bar__escritorio`), no la funcionalidad.
- **Conclusión:** solo las 5 tablas sin uso más los dos valores de enum y las ramas de texto de la Actividad. La documentación sí describe el comportamiento (ver D-12).

### 4.3 Orden de los listados del catálogo

- `GET /catalogo/comercios`: `ComercioService.listarAprobados` → `comercioRepository.findByEstadoIn(ESTADOS_VISIBLES_EN_CATALOGO)`. **No hay `ORDER BY`** (consulta derivada de Spring Data sin ordenamiento): el orden es el que entrega la base (en la práctica por clave primaria, pero **no está garantizado**). El frontend solo reordena abiertos primero (§1.2). (C-05 del informe parcial: confirmado.)
- `GET /catalogo/comercios/{id}/productos`: `ProductoService.listarCatalogoDelComercio` → `findByComercioIdAndEstadoNot(comercioId, DESCONTINUADO)`, también **sin `ORDER BY`**; los filtros por categoría y tag son en memoria sobre esa lista. El frontend los agrupa por categoría en orden de primera aparición. Si el orden de la base cambia, cambia el menú. (C-09.)
- `GET /catalogo/productos` (Explorar): aleatorio en cada request (ya en el informe parcial).
- Listados del comercio (`GET /productos`): el frontend pone los `DESCONTINUADO` al final y respeta el orden del servidor.

### 4.4 ¿`CERRADO_TEMPORALMENTE` con otro texto en el panel del Dueño que en el catálogo?

Sí, **en la práctica el panel del Dueño no tiene un texto específico**:

- Catálogo: etiqueta "Cerrado temporalmente" (sin hora de reapertura).
- Perfil del comercio (Dueño y Empleado): "Cerrado temporalmente" (`textoEstadoDelComercio`).
- Panel (dashboard) del **Dueño**: no hay tarjeta de cierre (el interruptor solo existe con `APTO_VENTA`), no hay aviso de "cerrado temporalmente" (ese banner es solo para el Empleado) y solo se ve "Tu comercio está cerrado en este momento" si `abiertoAhora` es falso. El texto del bloqueo de cuenta no se le explica al Dueño en este panel (la explicación está en el login: ver `js/auth.js`, NO RELEVADO en esta pasada). Ver D-10 y C-08.

---

## 5. Comparación contra la documentación (solo desvíos concretos)

Archivos comparados: `requisitos-funcionales-cliente.md`, `-comercio.md`, `-dueño.md`, `-administrador.md`, `-empleado.md`, `-sistema.md`, `Historias de Usuario - Cliente/Comercio/Dueño/Administrador.md` y `diccionario-de-datos.md` (todos en `docs/entregables-01-02/`). Los números de línea son aproximados.

Hay **coincidencias verificadas** (no son desvíos): turnos y rótulos de turno en lo básico, "Vendido en el turno" con comisión y neto plegados, chips de 7 y 30 días con 30 por defecto, "Ver los últimos 30 días" solo si hay pedidos, gráfico de barras con teclado, siete categorías de resultados, "Sin turno asignado", precio bloqueado con la leyenda "Se puede cambiar fuera de tu horario de atención", interruptor "Recibiendo pedidos / Pedidos pausados / Fuera de horario", confirmación solo al cerrar, comercios cerrados atenuados con "Cerrado" y "Cerrado temporalmente", abiertos primero, "Abierto ahora", etiqueta "Cerrado temporalmente" sin hora de reapertura, avisos con "Volver al catálogo", producto agotado con aviso, y el aviso de producto removido del carrito (existe `TipoNotificacion.PRODUCTO_REMOVIDO_CARRITO`).

---

## 6. Desvíos (D-xx) y dudas (C-xx)

Continúan la numeración del informe parcial (D-01 a D-06, C-01 a C-05).

### Desvíos

- **D-07 (detalle del comercio).** `requisitos-funcionales-cliente.md` (~línea 26): "El detalle del comercio muestra: nombre, descripción, **tipo de comercio, horarios de atención, dirección, teléfono, enlaces a sus redes sociales** … y modalidades". El código (`js/catalogo.js`, `initComercioDetalle`, y `comercio-detalle.html`) muestra nombre, descripción, **solo el horario de hoy**, dirección y modalidades; **no** muestra tipo, teléfono, redes sociales ni la semana completa.
- **D-08 (Dueño o Administrador en las pantallas del Cliente).** Las historias y requisitos no dicen qué pasa si un Dueño abre `comercio-detalle.html` o `explorar.html`. El código redirige al Dueño/Administrador solo desde `index.html`; en el detalle y en Explorar les muestra el botón "Iniciá sesión para pedir" (porque el rol no es `CLIENTE`), aunque ya hayan iniciado sesión.
- **D-09 (búsqueda de productos no documentada).** La pantalla Explorar (búsqueda por nombre con debounce de 300 ms, filtros de categoría única y tags múltiples con AND, paginación de 20, orden aleatorio, contador y "Limpiar filtros") y el campo "Buscar productos" de la barra de escritorio **no figuran en `requisitos-funcionales-cliente.md` ni en `Historias de Usuario - Cliente.md`**, que solo hablan de "filtrar productos dentro de un menú por categoría y/o tags" (HU-C08). Tampoco hay requisito de filtros del catálogo "Delivery" y "Retiro" (el documento solo menciona "Abierto ahora").
- **D-10 (aviso de comercio cerrado temporalmente al Dueño).** `requisitos-funcionales-comercio.md` (~líneas 113 a 119) describe cómo se ve el comercio en `CERRADO_TEMPORALMENTE` para el público. El panel del Dueño no tiene un aviso propio para ese estado (el banner "Comercio cerrado temporalmente. No se aceptan pedidos nuevos." es solo del Empleado). Si la documentación quiere que el Dueño vea una explicación, hoy no existe en el panel.
- **D-11 (rótulo del turno).** `requisitos-funcionales-comercio.md` (~línea 315) lista como rótulos "En curso", "Terminó" y "Terminó ayer". El código agrega "En curso desde ayer" y "En curso desde el dd/mm" y "Terminó el dd/mm" (cuando el turno abrió antes), y una cuarta columna "En preparación" solo en escritorio que no sale del servidor ni está documentada.
- **D-12 (extras).** `requisitos-funcionales-cliente.md` (~línea 34, carrito) describe extras con grupos obligatorios y de una o varias opciones y el cálculo con extras; `HU-C09B` ("Elegir Extras…") también. **No hay ningún código de extras** (solo las tablas del baseline y dos valores de enum). La documentación describe una funcionalidad no implementada sin marcarla como tal en esos documentos (NO verificado si otro documento la marca como pendiente).
- **D-13 (levantar la suspensión de un comercio).** `requisitos-funcionales-administrador.md` (~línea 12): "restaurando su estado a **Aprobado**". El código lo restaura a `APTO_VENTA`, `APROBADO` o `CERRADO_TEMPORALMENTE` según la cuenta de cobro, los documentos y el estado de la cuenta del Dueño (`destinoAlLevantarSuspension`). La misma frase aparece en `HU-A06` de forma genérica ("reactivar su cuenta").
- **D-14 (suspensión: edición por el Dueño).** `requisitos-funcionales-comercio.md` (~línea 302): "El Dueño queda sin cambios por ahora (puede, por ejemplo, editar productos y perfil con el comercio Suspendido)". El código ya lo impide: backend `409 COMERCIO_SUSPENDIDO` para Dueño y Empleado (D-02 del informe parcial) y el frontend oculta "+" y menú de productos y deshabilita editar perfil/horarios para ambos (`pintarSoloLecturaDeProductos`, `protegerPorSuspension`).
- **D-15 (suspensión: pedidos pendientes).** `requisitos-funcionales-administrador.md` (~línea 11) dice que la suspensión "desencadena la cancelación de pedidos activos … según las reglas del sistema". No documenta la vista previa por pedidos ni que los pendientes se rechazan al instante y los demás tienen 90 minutos (el código y la hoja de suspensión lo muestran). (El informe parcial, D-05, ya notaba que otros documentos coinciden en lo esencial.)
- **D-16 (listado de comercios del Administrador).** `HU-A07` (`Historias de Usuario - Administrador.md`, ~línea 38): el listado muestra "estado, tipo, **fecha de registro, Dueño titular y si ese Dueño tiene MP vinculado**". La fila del listado (`renderComercioAdminRow`) muestra nombre, tipo, localidad y estado; fecha de registro, Dueño y MP no están en la fila (si están en el modal, no se relevó). Además no hay búsqueda ni filtros en ese listado, a diferencia de Clientes y Dueños.
- **D-17 (paginación).** Solo el listado de Dueños tiene "Ver más" de a 30. Clientes, Comercios, Categorías, Tags y Reembolsos se pintan completos sin paginación; ningún requisito lo exige ni lo descarta.

### Dudas

- **C-06.** El `409` de comercio `SUSPENDIDO` al agregar al carrito ("Este comercio no está recibiendo pedidos por ahora. Probá con otro comercio.") no empieza con los prefijos que `esConflictoDeCierre` reconoce ("Este comercio está cerrado", "Este comercio no está aceptando"), así que no usa el aviso fijo con "Volver al catálogo". ¿Es intencional? (Hoy un comercio suspendido no se lista en el catálogo, así que solo ocurriría por carrera.)
- **C-07.** Detalle del comercio: ni la lista de comercios ni la de productos tienen `try/catch`. ¿Se quiere un estado de error con reintento como en el catálogo ("No pudimos cargar los comercios.")? Hoy depende del manejo global de `apiFetch` (no relevado). Lo mismo en Explorar (`/catalogo/filtros` y `/catalogo/productos`).
- **C-08.** ¿Debe el Dueño ver una explicación de "Cerrado temporalmente" (cuenta bloqueada) en su panel? Hoy solo ve "Tu comercio está cerrado en este momento" (o nada si `abiertoAhora` es verdadero).
- **C-09.** El orden de los comercios y de los productos del menú depende de la base (sin `ORDER BY`). ¿Se quiere un orden estable definido (por nombre, por fecha, por categoría)? Cambiaría el menú sin avisar si la base reordena.
- **C-10.** El catálogo de comercios no tiene búsqueda por nombre ni filtro por tipo de comercio ni por localidad aunque el Cliente tiene direcciones; ¿es el alcance definitivo? (El diccionario y los requisitos no piden esos filtros; solo se anota para el DFD.)
- **C-11.** "Los últimos 7/30 días" incluye el día de hoy (rango de 7 o 30 fechas); el requisito dice "últimos 7 días" sin precisar. ¿Se documenta así?
- **C-12.** `resumenHorarioHoy` calcula "hoy" con el reloj del navegador (`new Date().getDay()`), mientras el estado abierto/cerrado lo da el servidor. Si el dispositivo está en otra zona horaria, el texto de horario puede mostrar el día equivocado aunque la etiqueta sea correcta.

---

## 7. Archivos revisados

**Frontend (`frontend/`):** `index.html`, `explorar.html`, `comercio-detalle.html` (solo ids, por `grep`), `comercio-producto-form.html` (solo ayudas, por `grep`), `js/catalogo.js` (completo salvo la barra superior y el carrito de cabecera), `js/explorar.js`, `js/apertura-comercio.js`, `js/esqueletos.js`, `js/saludo.js`, `js/cliente-escritorio.js` (solo la barra de búsqueda, por `grep`), `js/contexto.js` (`exigirContextoCliente`), `js/turno-resumen.js`, `js/estadisticas.js`, `js/cierre-comercio.js`, `js/comercio-suspendido.js`, `js/comercio.js` (dashboard, productos, formulario de producto y los banners; el resto por `grep` de funciones), `js/cloudinary.js` (validaciones), `js/validators.js` (`esNombreProductoValido`, `esPrecioValido`), `js/admin-comercio-suspension.js`, `js/admin-dueno-suspension.js` (textos por `grep`), `js/admin-duenos.js`, `js/admin-clientes.js` (por `grep`), `js/admin.js` (`initAdminComercios`, fila y modal de detalle, `BADGE_ESTADO_COMERCIO`, resto por `grep`).
**Backend:** `services/ProductoService.java` (`listarCatalogoDelComercio`), `services/ComercioService.java` (`listarAprobados`), `repositories/ComercioRepository.java` y `ProductoRepository.java` (por `grep`), `enums/TipoEntidadEdicion.java`, `services/ActividadComercioService.java` (por `grep`), `repositories/ItemCarritoRepository.java` (comentario), migraciones `V1__baseline_bajonea_final.sql` (por `grep`), `V38` a `V41`.
**Documentación (`docs/entregables-01-02/`):** `MAPEO-DFD2-TRAMO-D.md`, `requisitos-funcionales-cliente.md`, `-comercio.md`, `-dueño.md`, `-administrador.md`, `-empleado.md`, `-sistema.md` (por `grep`), `Historias de Usuario - Cliente.md`, `-Comercio.md`, `-Dueño.md`, `-Administrador.md`, `diccionario-de-datos.md` (por `grep`), `alcance-y-limitaciones.md` (por `grep`).
**No revisados:** hojas CSS (colores, íconos, tamaños), `js/carrito.js` y `checkout.js` (más allá del encabezado), `js/auth.js` y los avisos de login, `js/api.js` (manejo global de errores), contenido completo del modal de detalle de comercio del Administrador, pantallas de pedidos del comercio (lista y detalle) más allá de los banners, y `docs/DECISIONES.md`/`CAMBIOS.md`/`MAPEO-ARCHIVOS-TRAMO-*.md` (los tramos T1 a T5 se confirmaron con el encabezado de las migraciones y `CLAUDE.md`).
