# Mapeo de archivos — Tramo E4: pulido final del escritorio

Fecha: 2026-11-13. Solo frontend, pruebas y documentación: el backend no cambió, no hay migraciones ni endpoints nuevos. Pendiente de la confirmación de Diego (sin commit; el árbol conserva sin commitear los tramos B1 y E3 y este).

## Alcance

Revisión visual de las cuatro interfaces (acceso, Comercio —Dueño y Empleado—, Administrador y Cliente) a 1024, 1280, 1440 y 1920 px, más 1023 y 700 px; corrección de los defectos bloqueantes e importantes; Reclamos en tabla; paginación de Dueños; accesibilidad y teclado; las decisiones cerradas 3 a 8; estabilidad de pruebas; y la demostración global de que la versión móvil (menos de 1024 px) no cambió respecto del commit anterior al escritorio (`43cf16f`, «Pulido P1a y P1b…»).

## Hallazgos de la revisión visual (Bloque 0)

288 capturas de 72 páginas a 1024, 1280, 1440 y 1920 px y 144 a 1023 y 700 px, en `docs/capturas-escritorio-e4/` con prefijo `antes-` (y `despues-` de lo corregido). `antes-informe.json` y `antes-informe-inter.json` traen, por página y ancho, el desborde horizontal, los controles de menos de 32 px y los errores de consola. **Ninguna página tiene scroll horizontal a ningún ancho y ninguna tira errores de consola** (salvo los 404 de una consulta de Soporte que mi escenario le pedía al Dueño con el id de otra cuenta: error del script, no de la aplicación).

| # | Prioridad | Hallazgo | Estado |
|---|---|---|---|
| 1 | Importante | Reembolsos entre 1024 y 1279 px era una sola tarjeta de móvil estirada, con la etiqueta y el valor separados por 600 px | Corregido: grilla de tarjetas de 340 px o más, con etiqueta e valor juntos |
| 2 | Importante | Clientes y Dueños entre 1024 y 1279 px: los chips de filtro quedaban desalineados al lado del buscador y se partían en tres filas | Corregido: el buscador arriba y los chips en una fila debajo |
| 3 | Importante | Reclamos era una lista de tarjetas angostas con el resto de la pantalla vacío | Corregido (decisión 1): tabla real con encabezado |
| 4 | Importante | Ayuda del Dueño y del Empleado era una tarjeta de 460 px sola, sin barra lateral | Corregido: usa la barra lateral del comercio |
| 5 | Importante | Soporte con sesión mostraba la pantalla partida de marketing | Corregido (decisión 8): barra superior del Cliente o lateral del comercio |
| 6 | Importante | Los enlaces legales blancos sobre el naranja daban 3,3:1 | Corregido (decisión 3) |
| 7 | Importante | Tres controles de sonido apilados en el panel del comercio | Corregido (decisión 4) |
| 8 | Menor | El saludo del panel del Dueño se cortaba en «Hola, Represe…» con espacio de sobra | Corregido: el nombre se parte en el espacio y el saludo no se corta |
| 9 | Menor | Hojas del selector de comercios y de «Cambiar de cuenta» no recibían el foco al abrir en escritorio (el asa estaba oculta) | Corregido en `hoja.js` y en los dos selectores |
| 10 | Menor | `registro-tipo-cuenta`: dos tarjetas de 190 px en 1440 px | Abierto (menor): composición aceptada en E0b |
| 11 | Menor | Mis consultas, conversación de Soporte, reclamo y Ayuda del Cliente usan tarjetas de 390 a 600 px con el resto vacío | Abierto (menor): son formularios y conversaciones; se evitó rediseñar lo aprobado |
| 12 | Menor | Entre el aviso «Tu comercio está abierto ahora» y el rótulo del turno hay un hueco de unos 50 px en el panel del Dueño | Abierto (menor) |
| 13 | Menor | Las 30 columnas del gráfico de Estadísticas miden unos 10 px de ancho | Abierto: deuda documentada desde T5 y K04 |
| 14 | Menor | El desborde de 9 px de `admin-comercios-pendientes` a 390 px | Corregido (excepción a): el email largo de la tarjeta no se partía |

**Cambio de tamaño en vivo (1440 a 800 px y vuelta).** Se comprobó con el spec `146`. Defecto real: en Mis pedidos del Cliente, al pasar de 1440 a 800 px la lista seguía armada para escritorio y tocar un pedido no mostraba nada (el panel de detalle queda oculto por debajo de 1024 px). Criterio simple, sin reescribir: la página se recarga al cruzar los 1024 px (`recargarAlCambiarDeModo` en `js/escritorio.js`). Los otros cuatro casos (pedidos del comercio, Soporte del Administrador, perfil del Cliente y perfil del comercio) ya se adaptaban solos.

## Cambios por área

### Administrador

- `js/admin-reclamos.js`, `css/escritorio-admin-tablas.css`: Reclamos es una tabla (`tabla--reclamos`, cuatro columnas: Reclamo, Comercio, Estado, Total y fecha; la fila entera sigue siendo el enlace al detalle). Los `data-testid` de la fila no cambian.
- `js/admin-duenos.js`: la lista muestra 30 dueños y «Ver más» (`btn-ver-mas-duenos`, `duenos-pie`) suma otros 30; la búsqueda y los filtros vuelven a la primera página; el contador dice «Mostrando 30 de 65 dueños» solo cuando hay más. Solo frontend: la API ya devuelve todos. **Aplica también a la móvil** cuando hay más de 30 dueños (con 30 o menos no cambia nada).
- `css/styles.css`: `.request-card__rows .comercio-info__row > span { min-width: 0; overflow-wrap: anywhere }` corrige el desborde de 9 px de Pendientes a 390 px con un email largo.
- `css/escritorio-admin-tablas.css`: ajustes de 1024 a 1279 px de Clientes, Dueños y Reembolsos.

### Acceso

- Los enlaces legales (`panel-legal`, con sus tres `data-testid`) salieron del panel naranja y están al pie de la columna blanca (`nav.acceso-legal`, hermana del panel; texto gris oscuro, 4,66:1 sobre blanco). Cambia el HTML de las diez pantallas partidas (`login`, `bienvenida`, `recuperar-password`, `soporte`, `invitacion-empleado`, `reactivar-cuenta`, `verificar-email`, `comercio-pendiente`, `comercio-rechazado`, `comercio-rechazo-definitivo`). En la móvil el `<nav>` queda `hidden`.
- `css/escritorio-acceso.css`: el shell `app-shell--acceso` pasa a tres filas `auto 1fr auto` (encabezado de la invitación, contenido y pie legal); el panel naranja conserva logo, titular y bajada y ocupa las tres.

### Comercio

- `js/sonido-interruptor.js`, `css/escritorio-comercio.css`: en escritorio el control de sonido del panel y del perfil del comercio es un solo botón («Sonido activado» / «Sonido desactivado», con ícono, 44 px, `role="switch"`, `switch-sonido-avisos`). El texto de la tarjeta y la perilla se ocultan solo en escritorio; el aviso «Activar sonido» sigue apareciendo cuando el navegador bloquea el audio.
- `css/escritorio-comercio.css`: el saludo del panel no se corta.
- `js/ayuda.js`: Ayuda con la barra lateral del comercio (`montarBarraLateralCompartida`).

### Cliente

- `js/catalogo.js`: el rótulo decorativo de la tarjeta de producto pasa de «Agregar» a «Ver y agregar» (decisión 7; solo escritorio).
- `js/soporte.js`: con sesión, `soporte.html` deja la pantalla partida y usa la barra superior del Cliente (o la lateral del comercio).
- `js/pedidos.js`: recarga al cruzar los 1024 px.

### Transversal

- `js/validators.js` y `js/api.js`: `aTitleCaseNombre` respeta «de», «del», «la», «las», «los» y «y» en minúscula (salvo la primera palabra); `getNombre()` la usa (decisión 5; excepción b).
- `js/escritorio.js`: `montarSaltarAlContenido` (decisión 6) y `recargarAlCambiarDeModo`. El enlace es un `<button class="saltar-contenido" hidden>` creado al montar la barra lateral del Administrador, la lateral del comercio o la superior del Cliente: primer elemento enfocable del `<body>`, visible solo con foco, lleva el foco a `<main>` (`tabindex="-1"`) sin tocar la URL (la regla de no usar anchors `#`). No existe en móvil (`hidden` y sin CSS de móvil).
- `css/escritorio-base.css`: estilos del enlace, y `prefers-reduced-motion: reduce` anula animaciones y transiciones en todo el escritorio.
- `js/hoja.js` (`activarHoja`, `apilarHoja`): pila de hojas (solo la de arriba atiende `Escape` y `Tab`; hace falta cuando se abre el zoom de una foto sobre el diálogo del producto y cuando la hoja de suspender, que usa `atraparFoco` de `documentos-comun.js`, se abre sobre el detalle del comercio: `atraparFoco` usa la misma pila); el foco inicial ignora elementos ocultos (`getClientRects`) y, si no hay ninguno visible, cae en la propia hoja (`tabindex="-1"`, sin anillo: `[role='dialog'][tabindex='-1']:focus` en `styles.css`).

### Hojas migradas a `activarHoja` (Bloque 3)

Migradas, sin cambiar su aspecto: detalle de comercio, categoría, tag y nueva tarifa (`admin.js`); foto de perfil del Cliente (`cliente.js`) y del comercio, acciones de producto y «Vas a pasar a tu cuenta personal» (`comercio.js`); salir con cambios sin guardar (`comercio-form.js`); conflicto de comercio al agregar al carrito y zoom de foto (`catalogo.js`); confirmar contraseña para cambiar el nombre de usuario (`perfil-cuenta.js`); invitar al equipo, avisos y menús de miembros e invitaciones (`equipo-comercio.js`, vía `crearHoja`); confirmar el cierre del comercio (`cierre-comercio.js`); panel «Tus comercios» y «Cambiar de cuenta» (`selector-comercio.js`, `selector-contexto.js`); y el recorte de imagen (`crop.js`, que informa `onCancelar` por cualquier cierre que no sea confirmar).

No migradas, con su razón: las dos hojas bloqueantes de `api.js` (sesión terminada y acceso perdido) tienen un solo botón y redirigen; ahí se agregó el atrapado de `Tab` en su propio `keydown`, porque `api.js` no puede importar `hoja.js` sin crear una dependencia circular. Ya cumplían `role="dialog"`, `Escape`, foco atrapado y devolución del foco con `atraparFoco`/`devolverFoco`: descartar cambios de dirección y de documento, subir documento, el visor de documentos, motivo y aprobar de documentos, las seis hojas de suspender y levantar, reactivar cuenta, resolver reclamo y la hoja de cuenta suspendida. Quedan fuera por su flujo propio las hojas de Mercado Pago (`activarHoja` desde P1a).

## Archivos nuevos

| Archivo | Para qué |
|---|---|
| `testing/playwright/tests/143-escritorio-pulido-e4-ui.spec.ts` | Enlaces legales, Reclamos, Dueños, sonido, nombre, «Saltar al contenido», Ayuda, Soporte con sesión, hojas y 1024/1920 px sin desborde en todas las páginas |
| `testing/playwright/tests/144-pulido-e4-movil-ui.spec.ts` | Móvil: el desborde de Pendientes, los nombres con partículas y lo que no existe en móvil |
| `testing/playwright/tests/145-escritorio-teclado-foco-movimiento-ui.spec.ts` | Recorrido con Tab (anillo, pantalla, sin perder el foco), movimiento reducido y nada que dependa del hover |
| `testing/playwright/tests/146-escritorio-redimension-en-vivo-ui.spec.ts` | Cambio de tamaño de la ventana con la página abierta |
| `testing/playwright/playwright.capturas.config.ts`, `capturas/` | Herramientas de revisión (no son parte de la suite): `capturar.spec.ts` (capturas con informe), `hoja.spec.ts` (hojas de contacto), `movil-comparar.spec.ts` (comparador móvil contra un commit) y `escenario.ts` |
| `docs/capturas-escritorio-e4/` | Capturas `antes-` y `despues-`, informes JSON y `movil-diferencias/` |

## Pruebas

Corrida final: Playwright completo 2041 de 2041 (50,6 min), WebKit de los specs 101 a 146 con 248 pasados y 2 omitidos por diseño; demostración de la móvil: 172 de 210 comparaciones idénticas y 38 explicadas (ver `docs/DECISIONES.md`, entrada del 2026-11-13). Specs existentes cambiados: `126` (la espera del hover usa `expect.poll`), `69` y `79` (`evitarMedianoche` en el `beforeAll`), `89` (el contador acepta «30 de N» y se busca al dueño antes de esperarlo) y `06` y `53` (esperan `networkidle` antes de tocar «Nuevo producto»). Ningún spec dependía de los enlaces legales dentro del panel naranja: los `data-testid` se conservaron.

## Estado final de `docs/AUDITORIA-NIELSEN.md`

| Estado | Hallazgos |
|---|---|
| Resueltos | T01, T02, T03, T04, T05, T06, T07, T09, T11, T12, T13, T14, T15, T16, T17 (todos de P1 y del tramo de pulido); C01, C02, C03; K01, K02, K05; A01, A02, A03, A04, A05; T10 en escritorio (foco visible y `:hover` solo bajo `(hover: hover)` en las hojas de escritorio, sin ninguna acción que dependa del hover; verificado con el spec `145`; en móvil las reglas `:hover` de `styles.css` no se tocaron) |
| Descartados por decisión de Diego | T08 (contraste del naranja de marca: se conserva `#ff4700`; limitación documentada) y K03 (despachar sin confirmación) |
| Abiertos, deuda de producto fuera del escritorio | P01 (registros largos sin aviso al salir), P02 (el splash espera 900 ms), P03 (el código de verificación no dice cuánto vale), P04 («Volver al inicio» de los errores va siempre a `index.html`), C04 (buscador de Explorar sin etiqueta propia ni botón de borrar), C05 (paso de modalidad del checkout), C06 («Marcar todas» del Cliente fuera de un comercio, pide un endpoint) |
| Aceptado como limitación | K04 (columnas de 10 px del gráfico de Estadísticas; el detalle del día se alcanza por teclado y por el listado) |

## El cierre del escritorio

**Qué pantallas existen en cada rol.** Acceso: pantalla partida (login, bienvenida, verificación, recuperación, reactivación, invitación, soporte, estados del comercio, errores) y asistente con pasos al costado (registros). Comercio (Dueño y Empleado): barra lateral de 264 px, panel, productos, pedidos con detalle sin navegar, estadísticas, documentación, equipo, avisos en tabla, perfil por secciones y las pantallas a pantalla completa (alta y corrección de comercio). Administrador: barra lateral oscura con 12 ítems, tablas (Clientes, Dueños, Comercios, Reembolsos, Reclamos, Categorías), grillas de tarjetas, revisión de documentos en dos paneles, Soporte con lista y detalle, Tarifas con el formulario en línea. Cliente: barra superior de 72 px, catálogo y Explorar en grilla, ficha del comercio, carrito y checkout con resumen fijo, Mis pedidos con detalle, perfil con menú, direcciones y avisos en tabla.

**Excepciones a «la móvil no cambia» en todo el escritorio (E0 a E4).** T11 (destinos explícitos de «Volver»), áreas táctiles de 44 px de «Cerrar sesión» y «Ver detalle» del Administrador, la hoja «Antes → Ahora» de la tarifa (A03), el saludo con nombre (K05), el desborde de 9 px de Pendientes, los nombres con partículas en minúscula, el atrapado y la devolución del foco en las hojas manuales, la paginación de Dueños (más de 30), el atrapado de `Tab` en las hojas bloqueantes de `api.js` y la recarga de Mis pedidos al cruzar los 1024 px (solo escritorio). Además, la comparación contra `43cf16f` encontró una diferencia entre 640 y 1023 px que viene de antes de este tramo (ver el informe del tramo): `overflow: clip` en `.app-shell` hace que el pie de acciones sea de verdad pegajoso a 700 px en las pantallas de detalle del Administrador y en el carrito.

**Limitaciones que quedan.** La tablet de 640 a 1023 px no tiene diseño propio (sigue la tarjeta de 460 px); el contraste del naranja de marca (texto blanco sobre `#ff4700`: 3,41:1) se conserva por decisión de Diego; y una persona que es Dueño y Cliente en la misma cuenta no tiene un selector propio (el multirol físico no existe: el Dueño no es Cliente). iPhone real sin probar.
