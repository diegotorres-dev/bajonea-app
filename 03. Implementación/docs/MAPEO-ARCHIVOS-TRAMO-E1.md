# Mapeo de archivos — Interfaz de escritorio, tramo E1: Comercio (Dueño y Empleado, 2026-11-08)

Solo frontend y pruebas. Sin cambios de backend, de colores, de permisos ni de la versión móvil (con la excepción acordada de los destinos de "Volver", ver "T11"). Se apoya en `docs/MAPEO-ARCHIVOS-TRAMO-E0.md` (base) y `docs/MAPEO-ARCHIVOS-TRAMO-E0B.md` (pantalla partida y asistente).

## Qué se hizo

- **Shell lateral** (`app-shell--lateral app-shell--comercio`): `frontend/js/comercio-escritorio.js` suma, dentro del `#bottom-nav-slot` de siempre y con el atributo `hidden`, el logo, el contenedor del selector de comercio, un grupo de cuatro ítems (Estadísticas, Documentación, Equipo y Avisos; el Empleado solo ve Avisos), las insignias de Pedidos y de Avisos y el pie con la persona y "Cerrar sesión". La hoja de escritorio los muestra y deja la barra fija de 264 px. El selector de comercio existente (`#franja-comercio-slot`) se mueve a la barra al pasar a escritorio y vuelve a su lugar al achicar la ventana. Las páginas sin barra (`comercio-producto-form`, `comercio-documentacion`, `notificaciones`, `mis-consultas`) crean una barra "solo escritorio" (el contenedor nace `hidden`).
- **Panel:** cabecera con el saludo y la bajada (nombre del comercio · fecha), el interruptor de cierre y el de sonido arriba a la derecha, cuatro cifras en tarjetas de 20 px (la cuarta, "En preparación", sale de la lista de pedidos que el panel ya tiene), "Pedidos activos" con "Ver todos" y filas de 64 px, y "Para empezar a vender" a la derecha cuando existe.
- **Pedidos:** lista de 440 px y detalle a la derecha (`seleccionar`, `renderPanel`, `crearPanelVacio` en `initComercioPedidos`). La URL refleja `?id=` con `history.replaceState` (sin `#`); el sondeo conserva la selección y no pisa un aviso visible; con la lista sin selección el panel dice "Elegí un pedido"; `comercio-pedido-detalle.html` redirige a `comercio-pedidos.html?id=` a partir de 1024 px. Flechas arriba y abajo recorren las tarjetas y `Enter` abre el detalle. Las acciones (aceptar, rechazar, despachar, entregar, anular, no retirado) son las de siempre y abren las hojas de P1a, que en escritorio son diálogos centrados.
- **Productos:** tabla (foto, nombre, categoría, precio, estado, "Editar" y el menú de tres puntos) con encabezado y hover; el botón "Nuevo producto" va en la cabecera y el flotante se oculta. **Formulario:** galería a la izquierda y campos a la derecha, "Cancelar" a la izquierda y "Guardar" a la derecha.
- **Perfil:** menú de secciones de 240 px (`SECCIONES_DEL_PERFIL`, `montarMenuDelPerfil`) y la sección activa en una tarjeta ancha; los campos se agrupan en dos columnas; `?seccion=` refleja la sección. El menú hace `click()` sobre las filas de siempre (las mismas validaciones, hojas y avisos). "Desvincular cuenta" usa `btn btn-peligro` sin estilos inline.
- **Equipo, estadísticas, documentación:** pestañas y botón de invitar a su ancho natural; cuatro cifras y gráfico de ancho real (barras proporcionadas, con hover); lista de documentos en una tabla y "Subir documento" a la derecha.
- **Estados y asistentes:** `comercio-pendiente`, `comercio-rechazado` y `comercio-rechazo-definitivo` con la pantalla partida de E0b; `agregar-comercio` y `comercio-corregir` con el asistente de pasos al costado de E0b (`montarPasosLaterales`, "Salir", "Cancelar" y "Atrás").
- **Compartidas:** `notificaciones.html` y `mis-consultas.html` usan el shell lateral **cuando la pestaña está en contexto de Dueño o de Empleado**; el shell se decide con `esContextoComercio()` y `montarBarraLateralCompartida` (en contexto de Cliente o de Administrador no se monta nada y siguen como estaban).

## Bloque 0: diagnóstico del estado anterior

Capturas `antes-*` en `docs/capturas-escritorio-e1/` (33 imágenes a 1440 px, Dueño, Empleado y estados). Todas fallaban la regla de oro en los puntos 1 (columna única de 460 px con 490 px vacíos a cada lado), 3 (barra inferior, encabezado de celular y botón flotante `+`) y 4 (sin composición propia).

**Inventario de estilos inline (antes del tramo):** HTML: `comercio-perfil` 35, `comercio-corregir` 55, `agregar-comercio` 40, `comercio-producto-form` 7, `comercio-dashboard` 3, `comercio-rechazado` 4, `comercio-rechazo-definitivo` 4 y `comercio-productos` 1. JavaScript (`.style.x =`): `comercio.js` 27, `selector-comercio.js` 3, `estadisticas.js` 1, `documentos.js` 3, `comercio-form.js` 1, `comercio-corregir.js` 2, `agregar-comercio.js` 2 y `hoja.js` 3, `selector-contexto.js` 3 (estos dos últimos y los que escriben `overflow` del `body` o la altura de una barra, valores dinámicos, no se tocaron).

**Mapa de `comercio.js` (3.500 líneas):** barra inferior y encabezado del panel (`renderBottomNavComercio`, `renderHeaderDashboard`), tarjeta de pedido (`renderPedidoActivoCard`), panel (`initComercioDashboard`), lista de pedidos (`initComercioPedidos`), detalle y acciones (`renderPedidoDetalleComercio` y `renderAcciones*`, que ya recibe el contenedor por parámetro y por eso sirve tal cual para el panel derecho), páginas de estado (`initComercioEstadoPagina`, `initComercioRechazado`, `initComercioRechazoDefinitivo`), perfil con las nueve vistas (`initComercioPerfil`, `iniciarPerfilDelEmpleado`, `mostrarVista`), productos (`renderProductoRow`, `initComercioProductos`) y formulario (`initComercioProductoForm`).

## Bloque 1: limpiezas previas (invisibles en móvil)

- **Estilos inline a clases:** 38 clases `u-*` al final de `frontend/css/styles.css` (nombre = propiedades abreviadas, p. ej. `u-mt-24px`, `u-h-48px-w-100-mb-16px`; las dos largas se renombraron: `u-boton-quitar-franja`, `u-boton-quitar-red`, `u-input-sin-borde`, `u-encabezado-seccion-fila`, `u-esqueleto-avatar-88`, `u-esqueleto-avatar-64`) más las asignaciones `.style.x =` de `comercio.js` (`classList.add`). Quedan inline los `style="display:none;"` que el JavaScript conmuta (54 en HTML) y `descontinuarLink.style.display`. `renderBannerTexto` (`form-utils.js`) usa `u-mb-20px`. Se eliminó `u-boton-error` (el botón de desvincular usa `btn-peligro`).
- **Detalle de pedido reutilizable:** `renderPedidoDetalleComercio(container, pedido, onActualizado, opciones)` ya era una función de un contenedor; se usa sin cambios en el panel derecho. Lo nuevo de escritorio vive en `comercio-escritorio.js` y en funciones locales de `initComercioPedidos`, para no engordar `comercio.js` más de lo necesario.
- **T11, destinos de Volver (`destinoVolver` de `renderTopBar`):** Pedidos → `comercio-dashboard.html`; detalle de pedido → `comercio-pedidos.html`; Mis productos → `comercio-dashboard.html`; formulario de producto → `comercio-productos.html`; Estadísticas → `comercio-dashboard.html`; Notificaciones (en contexto de comercio) → `comercio-dashboard.html`; Soporte, "Mis consultas" (en contexto de comercio) → `comercio-perfil.html`. Las vistas del perfil siguen volviendo a la vista principal (`data-volver-perfil`), y Documentación ya tenía destino explícito. **Es el único cambio de comportamiento móvil;** lo cubre el spec `129`.
- **Prueba de 0 diferencias:** `testing/playwright/tmp-capturas/e1-instantaneas.spec.ts` toma 105 instantáneas móviles (21 páginas del Dueño, 10 del Empleado, estado pendiente, rechazado con su corrección y rechazo definitivo, a 375, 390 y 700 px, con la hora fija) y `comparar-instantaneas.mjs` las compara píxel a píxel y por cajas del DOM. Línea base repetida: 101 de 105 idénticas y las 4 restantes entre 32 y 85 píxeles (cuenta regresiva y hover); tras la conversión de estilos inline: 100 de 105, con las mismas 5 diferencias de ese tipo.

## Archivos nuevos

| Archivo | Qué es |
|---|---|
| `frontend/js/comercio-escritorio.js` | Barra lateral (`completarBarraLateral`, `montarBarraLateralCompartida`), `agregarAccionEscritorio`, `informarPendientes`, `enEscritorio`, `alCambiarEscritorio` |
| `frontend/css/escritorio-comercio.css` | Toda la composición de escritorio del Comercio (importado desde `escritorio.css`) |
| `testing/playwright/tests/helpers/escritorio-comercio.ts` | Escenario compartido (Dueño con Mercado Pago, tres productos, seis pedidos en distintos estados, Empleado y Cliente) y las funciones para abrir como Dueño o Empleado |
| `testing/playwright/tests/126-escritorio-comercio-shell-ui.spec.ts` | Barra lateral, ítems, insignias, persona, selector, panel y sin scroll horizontal a cuatro anchos (20 tests) |
| `testing/playwright/tests/127-escritorio-comercio-pedidos-ui.spec.ts` | Lista y detalle, URL, redirección, teclado, selección y sondeo, acciones (13 tests) |
| `testing/playwright/tests/128-escritorio-comercio-pantallas-ui.spec.ts` | Productos, formulario, perfil, equipo, estadísticas, documentación, estados, asistentes y compartidas (15 tests) |
| `testing/playwright/tests/129-comercio-movil-sin-cambios-ui.spec.ts` | Nada de escritorio visible en móvil y los destinos de Volver (T11) (9 tests, proyecto `chromium`) |
| `testing/playwright/tests/130-escritorio-comercio-recorridos-ui.spec.ts` | Recorridos completos del Dueño y del Empleado a 1440 px (7 tests) |
| `testing/playwright/tmp-capturas/e1-*.spec.ts`, `comparar-instantaneas.mjs`, `bbox-diff.mjs`, `playwright.e1.config.ts` | Capturas a 1440 px, instantáneas móviles y su comparación (herramientas de verificación, no van al commit) |
| `docs/capturas-escritorio-e1/` | Capturas `antes-*` y `despues-*` a 1440 px (no van al commit) |
| `docs/MAPEO-ARCHIVOS-TRAMO-E1.md` | Este documento |

## Archivos modificados

- **HTML:** `comercio-dashboard`, `comercio-pedidos` (panel de detalle), `comercio-productos`, `comercio-perfil` (envoltorios del menú), `comercio-estadisticas`, `comercio-documentacion` (ranura de la barra), `comercio-producto-form` (barra de acciones y ranura), `comercio-pendiente`, `comercio-rechazado`, `comercio-rechazo-definitivo` (pantalla partida), `agregar-comercio` y `comercio-corregir` (asistente) y los estilos inline pasados a clases.
- **CSS:** `styles.css` (clases `u-*` y dos reglas `display: contents` para los envoltorios del perfil), `escritorio.css` (importa la hoja nueva).
- **JS:** `comercio.js` (barra, panel, pedidos, perfil, productos, T11), `comercio-form.js`, `form-utils.js` (clases en lugar de estilos inline), `turno-resumen.js` (cuarta cifra), `estadisticas.js`, `notificaciones.js`, `soporte-mis-consultas.js`, `documentos.js`, `agregar-comercio.js` y `comercio-corregir.js` (asistente, "Salir").

## Decisiones no previstas

1. **Insignias y cuarta cifra con datos que ya existen:** "En preparación" se cuenta de la lista de pedidos que el panel ya carga; la insignia de Pedidos sale de `resumen-turno` (`cantidadPendientes`), que ya se consultaba, con un sondeo propio de la barra cada 15 s solo en escritorio. No se agregó ningún endpoint.
2. **Nombre de la persona:** el login no lo devuelve y está fuera de alcance. El pie de la barra muestra el nombre del representante del comercio (Dueño, de `GET /comercios/perfil`) o el nombre de pila de la cuenta (Empleado, de `GET /clientes/perfil`) y, hasta que llegue, el rol.
3. **"Cambiar de comercio" siempre visible para el Dueño,** también con un solo comercio: el panel "Tus comercios" es el único camino a "Agregar comercio" y a los estados de los comercios pendientes, y los specs existentes lo abren con un solo comercio. Con un comercio sigue sin haber nada que cambiar, pero el bloque no es un texto muerto.
4. **El menú del perfil muestra solo lo que cada rol tiene:** el Dueño no tiene "Datos operativos" (esos campos están dentro de "Datos del comercio", que edita todo) y el Empleado no ve "Datos legales", "Equipo", "Mercado Pago" ni "Contraseña" (hoy no los tiene). "Documentación" no está en el menú del perfil porque es una página propia con su ítem en la barra.
5. **El botón "Ver estadísticas" del panel se oculta en escritorio** (la barra tiene "Estadísticas"); sigue en móvil.
6. **Soporte (`soporte.html`, `soporte-consulta.html`) queda con sus pantallas de E0b** (formulario público de pantalla partida y conversación): son páginas públicas con o sin sesión, comparten markup con la persona sin cuenta y no tienen contenido propio del comercio. Solo `mis-consultas.html` (la lista de la persona con sesión) usa el shell lateral. Se anota como pregunta abierta.
7. **El sonido es el componente de siempre** (tarjeta con interruptor y aviso "Activar sonido"), compactado en la cabecera; no se rehízo como un botón nuevo para no cambiar su lógica.
8. **Funciones no pedidas:** ninguna. Se sumaron el ítem "Avisos" de la barra (la campana del encabezado de celular no existe en escritorio) y el enlace "Ver todos" del mockup.

## Regla de oro: veredicto por pantalla (capturas `despues-*` a 1440 px en `docs/capturas-escritorio-e1/`)

Puntos 1 a 6 de la regla. "Pasa" = cumple los seis.

| Pantalla (Dueño y Empleado) | Captura | Veredicto |
|---|---|---|
| Panel | `despues-dueno-panel.png`, `despues-empleado-panel.png` | Pasa. Barra lateral, cabecera con interruptores, cuatro cifras, filas de 64 px. El Empleado ve su barra reducida y su insignia. |
| Pedidos | `despues-dueno-pedidos.png`, `despues-dueno-pedido-seleccionado.png`, `despues-empleado-pedidos.png` | Pasa. Lista de 440 px con la seleccionada resaltada y detalle a la derecha con acciones a la derecha. |
| Productos | `despues-dueno-productos.png`, `despues-empleado-productos.png` | Pasa. Tabla con encabezado, "Nuevo producto" arriba a la derecha y sin botón flotante. |
| Formulario de producto | `despues-dueno-producto-form-nuevo.png`, `despues-empleado-producto-form-nuevo.png` | Pasa. Dos columnas y barra de acciones. Con la tira de fotos en una fila de cinco. |
| Perfil (secciones) | `despues-dueno-perfil.png`, `despues-dueno-perfil-*.png`, `despues-empleado-perfil*.png` | Pasa. Menú a la izquierda y tarjeta ancha; Mercado Pago, equipo, horarios y contraseña con su ancho natural. |
| Estadísticas | `despues-dueno-estadisticas.png` | Pasa. Cuatro cifras y gráfico de ancho real. |
| Documentación | `despues-dueno-documentacion.png` | Pasa. "Subir documento" a la derecha; la tabla de documentos se ve cuando hay documentos. |
| Avisos y consultas | `despues-dueno-notificaciones.png`, `despues-dueno-mis-consultas.png`, `despues-empleado-notificaciones.png` | Pasa con una observación: la lista de avisos ocupa todo el ancho (un aviso por fila); no se rehízo como tabla porque el mockup no la define. |
| Estados (pendiente, rechazado, rechazo definitivo) | `despues-estado-pendiente.png`, `despues-estado-rechazado.png`, `despues-estado-rechazo-definitivo.png` | Pasa. Pantalla partida con panel de marca y acciones a su ancho natural. |
| Agregar comercio y corregir | `despues-dueno-agregar-comercio.png`, `despues-corregir.png` | Pasa. Pasos al costado, campos en dos columnas, "Cancelar" y "Continuar" en los extremos. |

## Cómo se demostró que la móvil no cambió

- 105 instantáneas móviles (3 anchos) contra la línea base tomada antes del tramo (ver Bloque 1): sin diferencias reales. Las únicas diferencias de píxeles son las de ruido ya presentes en la línea base repetida (cuenta regresiva de "Disponible en N min" y hover tras un clic). El único cambio de píxeles real que apareció (la insignia de pedidos pendientes en la barra inferior, 16 px más de alto del panel) se detectó y se corrigió: las insignias ahora solo se pintan en escritorio.
- Spec `129` (9 tests, `chromium` a 390 px): cuatro ítems en la barra inferior, la barra no es `fixed`, ningún elemento de escritorio visible en ninguna de las páginas, las vistas del perfil siguen yendo de a una y los nueve destinos de T11.
- Todo el CSS nuevo está dentro de `@media (min-width: 1024px)` y las únicas reglas de `styles.css` agregadas son las clases `u-*` (equivalentes a los estilos inline que reemplazan) y `display: contents` para los dos envoltorios del perfil.

## Pruebas

- **Específicas:** specs `126` (20), `127` (13), `128` (15) y `130` (7) en el proyecto `escritorio` (1440×900) y `129` (9) en `chromium` (390×844): 64 tests, todos verdes. Cubren estructura y medidas (barra de 264 px fija y a alto completo, ítem activo con fondo `#fff1ea` y texto `#a83100`, insignias, selector de 56 px o más, cuatro cifras en una fila con tarjetas de 20 px, lista de 440 px, tarjeta seleccionada con borde naranja y fondo `#fff7f2`, menú del perfil de 240 px, botones a su ancho natural, diálogos centrados), la URL (`?id=` y `?seccion=`, sin `#`), la redirección del detalle, el teclado (flechas, `Enter`, foco visible), el sondeo que conserva la selección, las acciones del pedido desde el panel (aceptar, anular con motivo en el diálogo, rechazar, entregar), sin scroll horizontal a 1024, 1280, 1440 y 1920 px en nueve páginas, los estados y asistentes, y los recorridos completos del Dueño y del Empleado (incluye crear un producto con foto real por el recorte y Cloudinary, editar los datos del comercio por sección, invitar a una persona, cambiar de comercio y cerrar sesión).
- **Corrida completa** (`npx playwright test`, proyectos `chromium` y `escritorio`, base reseteada, backend con `MERCADOPAGO_API_BASE_URL=http://localhost:9099`, 1875 tests, 1,1 h): **1848 pasaron, 4 fallaron y 23 no corrieron** (los siguientes a un fallo en bloques en serie). Causa de las 4 fallas: tres son de la medianoche (la corrida cruzó las 00:00 del 9 de noviembre y los specs `69` y `79` calculan el día de la semana al cargarse: "la cola de ayer", "la reapertura automática" y el alta de pedidos con el comercio "cerrado en este momento") y una, `53:308` ("crea un producto con foto desde la pantalla de nuevo producto", Empleado), un tiempo de espera de la navegación hacia el formulario que no se reprodujo (6 de 6 corridas aisladas pasaron y en la corrida completa fue la única vez). Repetidos esos tres specs completos (`53`, `69` y `79`) después de medianoche: **41 de 41 pasaron**, es decir, los 1875 tests pasan. No se registró ninguno de los inestables conocidos (`27:497`, `06:89`, `23:235`, `81:598`, `88:152`, `116:95`).
- **WebKit** (iPhone 13, specs `101` a `130`, tras el chequeo de conectividad con Cloudinary; los `@escritorio` no corren en WebKit): **210 pasaron, 2 se omitieron** a propósito (los de siempre) **y 1 falló, con 6 que no corrieron a continuación** (`120:154`, "un pedido sin pagar dice que todavía no se pagó", una página del Cliente sin relación con el tramo; repetido el spec `120` completo en WebKit pasó 13 de 13). El spec `129` (móvil sin cambios y T11) pasa también en WebKit.
- **Instantáneas móviles** (105, ver Bloque 1): final contra el frontend anterior al tramo, con la misma base de datos y la hora fija: 101 de 105 idénticas byte a byte. Las 4 restantes: las tres del pedido "listo para retirar" (40 a 58 píxeles, la cuenta regresiva "Disponible en N min") y `dueno-panel@375` (1038 píxeles dispersos con el mismo `cajas.json`; capturado de nuevo cuatro veces, dos con el frontend anterior y dos con el actual, las cuatro imágenes dan el mismo `md5`, o sea, ruido de renderizado de la corrida en lote). En las páginas con asistente o formulario de producto las listas de cajas difieren solo por los envoltorios nuevos (`.form-acciones` y `.acciones-paso`), con la imagen idéntica.

## Specs existentes cambiados

Ninguno: la suite anterior pasa sin tocarla (los destinos de Volver de T11 no cambian ningún test existente, porque ninguno comprobaba el historial de esas pantallas).

## Preguntas abiertas

1. **Soporte** (`soporte.html`, `soporte-consulta.html`) en el contexto de comercio: ¿el Dueño y el Empleado deberían ver la barra lateral al escribir o seguir una consulta? Hoy conservan la pantalla partida de E0b. Recomendación: dejarlas así hasta el tramo de limpieza (son páginas públicas con o sin sesión y llevar la barra obliga a bifurcar su markup).
2. **"Cambiar de comercio" con un solo comercio:** el mockup lo muestra solo con dos o más. Recomendación: dejarlo siempre (es la puerta a "Agregar comercio" y a los comercios pendientes) o, si preferís el mockup, agregar el acceso a "Agregar comercio" como ítem aparte de la barra.
3. **Nombre de la persona en la barra:** hoy sale del representante (Dueño) o del nombre de pila de la cuenta (Empleado) con dos consultas extra solo en escritorio. Recomendación: que el login devuelva el nombre (backend, tramo aparte) y reemplazar esas consultas.
4. **Sonido de avisos:** se conservó la tarjeta con interruptor (con su aviso "Activar sonido") en lugar del botón único del mockup. Recomendación: rehacerlo como botón en un tramo de pulido, porque mueve la lógica de desbloqueo de audio.
5. **Lista de avisos en escritorio:** ocupa todo el ancho, una fila por aviso. Recomendación: pasarla a tabla (aviso, fecha y acción) cuando se defina su mockup.
