# Auditoría de solo lectura para la interfaz de escritorio

Fecha: 2026-11-05. Alcance: `frontend/` (55 páginas HTML + 6 de error, 58 módulos JS, una hoja de estilos) y `testing/playwright/`. Nada se modificó, no se corrió el backend, la base ni ningún test; no se abrió el navegador. Por eso lo que dice "cómo se ve hoy" sale de leer el CSS, no de una captura, y está marcado donde corresponde.

Estado del repositorio durante la auditoría: sin cambios sin commitear en `frontend/` ni `testing/` (solo hay un cambio en el diccionario de datos de `02. Diseño` y capturas PNG de `docs/`). La otra sesión (S5, Reclamos) no tenía archivos del frontend en modificación al momento de leer.

---

## 0. Lo más importante, en diez líneas

1. El frontend es **mobile puro, sin framework ni build**: una sola hoja (`css/styles.css`, 8.498 líneas, 155 KB), módulos ES sin empaquetar y HTML casi vacío: cada página es un cascarón con "slots" que el JS llena.
2. **Hoy ya hay un "escritorio"**: a partir de 640 px la app es una tarjeta de 460 px centrada sobre fondo crema. Es la única `@media` de todo el CSS.
3. **Ya se intentó y se revirtió** (Tramo 16D-1, julio de 2026, ver `docs/DECISIONES.md`, 2026-07-31 y 2026-08-01): se revirtió por fecha de entrega del TFC, pero antes Diego había rechazado la primera versión por ser "una pantalla de celular flotando en una compu". La lección es de diseño, no técnica: hace falta composición real (barras laterales, grillas, dos columnas), no más ancho.
4. El layout está **poco acoplado al ancho en JS** (cero `matchMedia`, cero `innerWidth`, un solo gesto táctil real) y **muy acoplado en CSS** a una constante: `--screen-max-width: 460px`, usada en 7 reglas, más todo el sistema de capas fijas (modales, toasts, pantalla completa, visor).
5. Lo que más conviene cambiar antes: **268 `style="..."` en HTML y 203 asignaciones `.style.x =` en JS**. Un estilo inline le gana a cualquier `@media`, así que bloquean el escritorio, sobre todo en `registro-comercio`, `comercio-corregir`, `agregar-comercio` y `comercio-perfil`.
6. Las barras de navegación inferiores (`.bottom-nav`) son un `<nav>` con enlaces que arma el JS: **se pueden convertir en barra lateral solo con CSS** para Cliente, Dueño y Empleado. El Administrador **no tiene navegación** (solo dashboard y botón "volver"): ahí hace falta un componente nuevo.
7. Hay unos 40 lugares que arman a mano su propio `div.modal-backdrop`. No hay focus trap ni `inert` en ninguno. Es el mejor lugar para unificar antes de tocar escritorio.
8. **Playwright**: el proyecto `chromium` usa `devices['Desktop Chrome']` (1280×720). Solo 33 de los 95 specs fijan un viewport móvil. Los otros 62 **corren hoy a 1280 px dentro de la tarjeta de 460 px**. Si el escritorio empieza en 1024 px, esos 62 specs van a ver el layout nuevo sin que nadie lo haya decidido.
9. Se puede lograr gran parte del escritorio con **CSS solo** (shell, navegación, modales, grillas, formularios en columnas). Lo que necesita HTML/JS: navegación del Administrador, el selector de secciones del perfil (9 vistas en una página), la lista con detalle al costado de las bandejas, y la limpieza de estilos inline.
10. Estrategia recomendada: mejora progresiva con **un solo corte a 1024 px**, hojas nuevas separadas por rol que **no tocan la móvil**, cuatro tramos y un quinto de pulido (sección 10).

---

## 1. Arquitectura del CSS

| Aspecto | Hallazgo |
|---|---|
| Archivos | Uno solo: `frontend/css/styles.css` (8.498 líneas). Todas las páginas lo cargan con un `<link>`. Sin preprocesador ni minificado. |
| Orden de carga | `@import` de Google Fonts (Nunito 700/800/900 e Inter 400–700) en la primera línea, después `:root`, reseteo y `.app-shell`. El resto está **ordenado cronológicamente por tramo**: componentes base arriba, features agregados al final (equipo, documentos, soporte, suspensión). Lo último pisa a lo anterior. |
| Variables | `:root` tiene 26 tokens: colores (`--color-primary #ff4700`, `--color-page-bg #f2ece6`, superficie, bordes, estados), tipografía (`--font-display`, `--font-body`), radios (`--radius-lg/md/sm/pill`), sombras, `--header-height: 56px` y `--screen-max-width: 460px`. **No hay tokens de espaciado ni de tamaños de fuente**: los `px` están sueltos en cada regla. |
| Unidades | Casi todo en `px`. Sin `rem`, sin `clamp()`. `100vh` aparece 4 veces y `dvh` ninguna (esto último es un tema móvil, ver sección 9). |
| `@media` | **Una sola**, `@media (min-width: 640px)` sobre `.app-shell`. No hay `@container`, `@supports`, `prefers-reduced-motion` ni `(hover: hover)`. |
| `max-width` | 27 usos. Siete dependen de `var(--screen-max-width)`: `.app-shell`, `.modal-sheet`, `.crop-modal`, `.product-modal-sheet`, `.toast` (como `calc(... - 40px)`), `.pantalla-completa` y `.visor-documento`. El resto son `320px` para textos centrados, `100%` y `calc(100% - Npx)`. |
| Layout | 278 `display: flex` contra **3 `display: grid`** (`.stat-tile-grid`, `.estadisticas-cifras`, `.revision-acciones`, todas de 2 columnas). Todo lo demás es una columna de flex. |
| Duplicación | No hay duplicación por pantalla: las pantallas comparten clases. Las familias por feature son `.comercio-*` (74 reglas), `.equipo-*` (59), `.doc-*` (56), `.soporte-*` (47), `.cliente-*` (43), `.estadisticas-*` (40), `.pedido-*` (33). |
| Calidad | Sin comentarios (regla 11 de `CLAUDE.md`), 2 `!important`, 64 `cursor: pointer`, 18 `min-height: 44px` (el objetivo táctil de 44 px está cuidado). |
| Acople al ancho móvil | Alto en los **componentes de capa**: el modal es un bottom sheet (`align-items: flex-end`, bordes redondeados solo arriba), `.pantalla-completa` y `.visor-documento` son `position: fixed; inset: 0; max-width: 460px; margin: 0 auto`. Medio en los listados (columna única con `padding: 0 20px`). Bajo en los formularios (`.form-row` y `.field` ya reparten el ancho). |

Dos cosas del CSS que pueden morder en escritorio:

- `.app-shell` a partir de 640 px tiene `overflow: hidden`. **Hipótesis a verificar en el navegador**: un `position: sticky; bottom: 0` dentro de un ancestro con `overflow: hidden` queda pegado al ancestro y no a la ventana. Hay cuatro sticky (`.cart-footer`, `.request-footer`, `.equipo-footer`, encabezado de `.pantalla-completa`). Si se confirma, en escritorio esos pies de página no quedan fijos al hacer scroll.
- `.chip-row` (filtros del catálogo, de `explorar`, del detalle de comercio y de varias pantallas de Administrador) usa scroll horizontal **con la barra oculta** (`scrollbar-width: none`, 6 usos). Con mouse no se puede desplazar. En escritorio hay que pasarlo a varias líneas o agregar controles.

---

## 2. Layout base y cómo se ve hoy a 1440 px

**Estructura común de casi todas las páginas** (por ejemplo `index.html`, `comercio-dashboard.html`):

```
<div class="app-shell">                 contenedor: 100% de ancho, max 460 px, columna flex
  <div id="top-bar-slot">               cabecera (la arma renderTopBar o un header propio)
  <main class="app-main"> ... </main>   contenido (.screen-body con padding 28/20/40)
  <div id="bottom-nav-slot">            navegación inferior (Cliente y Comercio, no Administrador)
</div>
```

- `viewport`: `width=device-width, initial-scale=1.0` en las 55 páginas. Correcto.
- Cabecera: `renderTopBar` (`js/catalogo.js:123`) arma logo, campana y perfil; con `mostrarVolver` arma botón atrás (`history.back()`), título y un espaciador. Parte de su estilo se asigna inline desde JS (`titleEl.style.position`, `transform`, `fontSize`, `spacer.style.width`).
- Navegación inferior: `renderBottomNav` (Cliente: Inicio, Explorar, Carrito, Mis pedidos, Perfil) y `renderBottomNavComercio` (Dueño y Empleado: Panel, Productos, Pedidos, Perfil). **No es `position: fixed`**: es el último hijo del `.app-shell` flex, empujado al final por `min-height`.
- Capas flotantes (todas por JS): hojas inferiores `.modal-backdrop` + `.modal-sheet`, `.toast` (fijo, centrado, a 90 px del borde inferior), `.pantalla-completa` (formularios que ocupan toda la pantalla), `.visor-documento` y `.image-zoom-backdrop`.

**Cómo se ve hoy una pantalla típica a 1440×900** (deducido del CSS y confirmado por la entrada del 2026-08-01 de `docs/DECISIONES.md`; no es una captura):

- Fondo `#f2ece6` (crema) en toda la ventana. En el centro, una tarjeta blanca de **460 px de ancho**, a 24 px del borde superior e inferior, con esquinas de 24 px y una sombra grande. Quedan unos **490 px vacíos a cada lado**.
- Dentro, exactamente la pantalla móvil: lista de comercios en una columna, la barra de navegación en el pie de la tarjeta (no de la ventana).
- Los modales oscurecen toda la ventana pero la hoja sube pegada al **borde inferior de la ventana**, de 460 px de ancho, mientras el contenido está a 24 px del borde: se lee como una hoja de celular dentro de una compu.
- `.pantalla-completa` y `.visor-documento` ocupan el **alto completo** de la ventana (`inset: 0`) con 460 px de ancho; la tarjeta de atrás tiene 24 px de margen, así que no se alinean.
- Los toasts aparecen centrados, a 90 px del borde inferior de la ventana, de 420 px de ancho.

---

## 3. Inventario de pantallas por rol

Tamaños: bytes del HTML y líneas del módulo JS de entrada (los módulos compartidos están en la sección 4). Casi todo el contenido es dinámico: el HTML es un cascarón de 0,5 a 2 KB; las excepciones (las páginas "pesadas") tienen sus formularios escritos en el HTML.

Convenciones del patrón: **Lista**, **Detalle**, **Form**, **Panel**, **Visor**, **Wizard** (varios pasos), **Estado** (pantalla de un solo mensaje). 📱 marca componentes especialmente móviles.

### 3.1 Público y acceso (sin rol o antes de iniciar sesión)

| Página | JS de entrada | Tamaño | Patrón | Notas |
|---|---|---|---|---|
| `splash.html` | `api.js` (redirección a 900 ms) | 1,7 KB | Estado | Estilos propios dentro de la página |
| `bienvenida.html` | — | 1,5 KB | Estado/Landing | Dos botones; estilo inline |
| `login.html` | `auth.js` (841) | 4,1 KB | Form | Banners, hoja de cuenta suspendida 📱, botón "Tengo una invitación" |
| `registro-tipo-cuenta.html` | — | 2,9 KB | Selección | Dos tarjetas apiladas 📱 |
| `registro-cliente.html` | `auth.js` + `cliente-form.js` (502) | 1,6 KB | Wizard 2 pasos | Barra de pasos 📱, foto con recorte |
| `registro-comercio.html` | `auth.js` + `comercio-form.js` (966) | **30,6 KB**, 59 estilos inline | Wizard 3 pasos | Datos del negocio, legales, horarios; 5 `<select>`; recorte de foto; **la más delicada del acceso** |
| `verificar-email.html` | `auth.js` | 4,0 KB | Form (código) | Entrada OTP de 6 cajas |
| `recuperar-password.html` | `auth.js` | 7,7 KB | Wizard 3 pasos | OTP |
| `reactivar-cuenta.html` | `auth.js` | 3,8 KB | Form (código) | OTP |
| `invitacion-empleado.html` | `invitacion-empleado.js` (263) | 4,4 KB | Wizard | Cuatro vistas; reutiliza el formulario de Cliente |
| `seleccionar-contexto.html` | `selector-contexto.js` (285) | 1,1 KB | Selección | Tarjetas apiladas; solo Empleados |
| `terminos.html`, `privacidad.html` | — | 2 KB c/u | Texto | Provisorios |
| `soporte.html` | `soporte.js` (185) | 0,5 KB | Form | Sin sesión |
| `soporte-consulta.html` | `soporte-consulta.js` (240) | 0,6 KB | Conversación | Chat por turnos; el código viaja en el fragmento de la URL |
| `errores/*.html` (6) | — | ~1 KB | Estado | 404, 500, acceso denegado, sesión expirada, sin conexión, timeout |

### 3.2 Cliente (10 páginas)

| Página | JS de entrada | Patrón | Notas móviles |
|---|---|---|---|
| `index.html` | `catalogo.js` (1.245) | Lista | Saludo, `chip-row` con scroll horizontal 📱, una tarjeta de comercio por fila, navegación inferior |
| `explorar.html` | `explorar.js` (269) | Lista | Buscador y filtros 📱 |
| `comercio-detalle.html` | `catalogo.js` | Detalle + lista | Productos en filas; **modal de producto** (galería 4:3 con miniaturas) 📱, estepper de cantidad |
| `carrito.html` | `carrito.js` (324) | Lista + pie | Pie fijo `.cart-footer` 📱, modal de cambio de comercio |
| `checkout.html` | `checkout.js` (623) | Wizard 4 pasos | Entrega, dirección (tarjetas con radio), resumen, pago; **panel natural de dos columnas en escritorio** |
| `pedidos.html` | `pedidos.js` (758) | Lista | Tarjetas de pedido con estado y chevron |
| `pedido-detalle.html` | `pedidos.js` | Detalle | Encabezado de estado, motivo de rechazo, reclamo |
| `perfil.html` | `cliente.js` (218) + `perfil-cuenta.js` + `direcciones.js` (859) | Panel | **4 vistas en una página** (principal, direcciones, editar datos, contraseña) 📱, formulario de direcciones a pantalla completa 📱 |
| `notificaciones.html` | `notificaciones.js` (220) | Lista | "Marcar todas" |
| `mis-consultas.html` | `soporte-mis-consultas.js` (94) | Lista | Cualquier rol |

### 3.3 Dueño y Empleado

El Empleado **usa las mismas páginas** que el Dueño (el rol se resuelve por el contexto y el header `X-Comercio-Id`), con menos acciones. Todas se dibujan desde `comercio.js` (3.522 líneas: es el archivo más grande del proyecto y concentra panel, productos, pedidos, perfil y formularios).

| Página | JS de entrada | Tamaño | Patrón | Notas móviles |
|---|---|---|---|---|
| `comercio-dashboard.html` | `comercio.js` | 1,4 KB | Panel | Franja de comercio activo, "Para empezar a vender", interruptor de cierre, barra de 3 cifras, pedidos activos 📱 |
| `comercio-pedidos.html` | `comercio.js` | 0,8 KB | Lista | Filtros por estado (`chip-row`) 📱 |
| `comercio-pedido-detalle.html` | `comercio.js` | 0,5 KB | Detalle | Acciones (aceptar, rechazar, despachar, entregar, anular, no retirado) con modales 📱; recorrido (línea de tiempo) |
| `comercio-productos.html` | `comercio.js` | 1,7 KB | Lista | Botón flotante "+" (`.fab`) 📱, menú de acciones |
| `comercio-producto-form.html` | `comercio.js` | 5,0 KB | Form | Galería de hasta 5 fotos con recorte, etiquetas, precio bloqueado |
| `comercio-perfil.html` | `comercio.js` | **38,3 KB**, 35 estilos inline | Panel | **9 vistas en una página** (principal, editar perfil, datos legales, datos del comercio, datos operativos, horarios, equipo, Mercado Pago, contraseña) 📱; la más delicada del comercio |
| `comercio-estadisticas.html` | `estadisticas.js` (356) | 0,9 KB | Panel | Gráfico de barras hecho a mano de 160 px de alto: **30 columnas de 10 px** en móvil; objetivo táctil ya anotado como deuda |
| `comercio-documentacion.html` | `documentos.js` (670) | 1,2 KB | Lista + **Visor** | Hoja de subida, **visor de documento a pantalla completa** (PDF por `blob:`) 📱 |
| `comercio-pendiente.html`, `comercio-rechazado.html`, `comercio-rechazo-definitivo.html` | `comercio.js` + `auth.js` | 2–3 KB | Estado | |
| `comercio-corregir.html` | `comercio-corregir.js` (363) | **25,4 KB**, 55 estilos inline | Wizard 3–4 pasos | Reutiliza `comercio-form.js` |
| `agregar-comercio.html` | `agregar-comercio.js` (252) | 17,5 KB, 40 estilos inline | Wizard 3 pasos | Reutiliza `comercio-form.js` |
| Equipo (dentro de `comercio-perfil.html`) | `equipo-comercio.js` (782) | — | Lista con pestañas | Mi equipo, Solicitudes, Actividad 📱; hojas de invitar y de cancelar |

### 3.4 Administrador (17 páginas, sin navegación entre ellas)

| Página | JS | Patrón | Notas |
|---|---|---|---|
| `admin-dashboard.html` | `admin.js` (2.343) | Panel | Tarjetas de alerta con contadores y accesos (4 estilos inline, el HTML más largo de este rol: 4,4 KB) |
| `admin-comercios-pendientes.html` | `admin.js` | Lista | Tarjetas `request-card`; modales de aprobar y rechazar con interruptor |
| `admin-comercio-detalle.html` | `admin.js` | Detalle | Datos del comercio y del representante, equipo, actividad |
| `admin-comercios.html` | `admin.js` | Lista | Todos los estados, etiqueta de estado, modal de detalle, suspender |
| `admin-resolicitudes.html`, `admin-resolicitud-detalle.html` | `admin.js` | Lista + Detalle | Comparación "antes/ahora" por campo |
| `admin-categorias.html`, `admin-tags.html` | `admin.js` | Lista (CRUD) | Botón flotante, modal de edición |
| `admin-tarifas.html` | `admin.js` | Form + historial | |
| `admin-reembolsos.html` | `admin.js` | Lista | Reintento de notas de crédito |
| `admin-clientes.html` | `admin-clientes.js` (511) | Lista | Búsqueda, filtros por estado, menú de acciones, suspender y levantar |
| `admin-duenos.html` | `admin-duenos.js` (290) | Lista | Igual; hojas de suspensión con vista previa |
| `admin-documentos.html` | `admin-documentos.js` (464) | Lista | Bandeja de documentos por revisar |
| `admin-documento-revision.html` | `admin-documentos.js` | **Visor + acciones** | Vista previa del archivo, aprobar o rechazar con motivo, "otros documentos"; **el mejor candidato a dos paneles (archivo a la izquierda, decisión a la derecha)** |
| `admin-soporte.html` | `admin-soporte.js` (311) | Lista + Conversación | Bandeja Esperan/Respondidas/Cerradas, detalle con cuenta asociada: **lista con detalle al costado** |
| `admin-comercio-equipo.html`, `admin-comercio-actividad.html` | `admin-equipo.js` (299) | Lista | Solo lectura |

---

## 4. Componentes compartidos (un cambio afecta a muchas pantallas)

| Componente | Dónde vive | A quién afecta |
|---|---|---|
| `.app-shell`, `.app-main`, `.screen-body` | CSS base | **Las 61 páginas** |
| `renderTopBar` (cabecera con atrás, logo, campana, perfil, acción) | `catalogo.js` | Cliente, Dueño, Empleado y parte de Administrador |
| `renderBottomNav` / `renderBottomNavComercio` | `catalogo.js` / `comercio.js` | Cliente y comercio; estadísticas lo importa de `comercio.js` |
| Franja de comercio activo y panel "Tus comercios" | `selector-comercio.js` (568) | Las 4 pestañas del Dueño y las pantallas de estado |
| Selector de contexto y hoja "Cambiar de cuenta" | `selector-contexto.js` | Empleado, perfil de Cliente y de comercio |
| Hoja de pérdida de acceso (`perderAccesoAlComercio`) | `api.js` | Dueño y Empleado, cualquier pantalla |
| Pantalla/hoja de cuenta suspendida | `cuenta-suspendida.js` | Login y toda sesión abierta |
| `.modal-backdrop` + `.modal-sheet` (confirmaciones) | **~40 creaciones manuales** en `admin.js`, `comercio.js`, `catalogo.js`, `api.js`, `cliente.js`, `direcciones.js`, `documentos*.js`, `equipo-*.js`, `admin-*.js`… | Casi todo el proyecto |
| `.pantalla-completa` (formularios sobre la página) | `direcciones.js`, `documentos.js` y otros | Perfil de Cliente, documentación |
| Visor de documento | `documentos-comun.js` (268) | Dueño y Administrador |
| Editor de recorte `crop.js` | `crop.js` (163): marco fijo de 320 px | Fotos de perfil y de producto |
| `showToast` (`.toast`) | `catalogo.js` | Todas (93 referencias en los tests) |
| Banners (`renderBanner`, `mostrarAvisoFijo`) | `form-utils.js` | Formularios, pedidos |
| Tarjeta de comercio, tarjeta de pedido, chips y puntos de estado (`.pedido-estado`) | `catalogo.js`, `pedidos.js`, `comercio.js` | Catálogo, pedidos del Cliente, del comercio y dashboard |
| `renderEmptyState`, skeletons | `catalogo.js` | Casi todas las listas |
| Formularios: `.form`, `.field`, `.input-shell`, `.step-progress`, `.otp-*`, `.switch-row` | CSS + `form-utils.js` | Registro, perfil, invitaciones, checkout |
| `request-card` y `cliente-admin-row` (bandejas del Administrador) | `admin.js`, `admin-clientes.js`, `admin-duenos.js` | Las 17 pantallas de Administrador |
| Vistas de equipo (`equipo-vistas.js`) | 402 líneas | Equipo del Dueño y del Administrador |

---

## 5. JavaScript

**Dependencias de ancho o de táctil: casi ninguna.**

- `matchMedia`, `innerWidth`, `innerHeight`, `clientWidth`, `orientation`, `visualViewport`, `touchstart/move/end`: **cero**. `getBoundingClientRect` y `offsetWidth` no aparecen en el frontend (sí en 18 specs de tests).
- Eventos de puntero: `crop.js` (arrastrar la imagen, `pointerdown/up` sobre un canvas: funciona con mouse), `admin-clientes.js` (cierra el menú al tocar afuera, funciona con mouse) y **`selector-comercio.js:500`, mantener apretado el avatar de la barra inferior: solo `pointerType === 'touch'`**. En escritorio ese gesto no existe; el mismo selector se abre desde la franja bajo el header, que sí responde a clic, así que no hay pérdida funcional.
- Cálculos de tamaño en JS: marco del recorte de 320 px (`crop.js:22`) y la imagen de salida de hasta 1.200 px de ancho. El gráfico de estadísticas se calcula por porcentaje de altura; las barras se reparten por flex (no por píxeles).
- **Estilos desde JS: 203 asignaciones `.style.x =`** (`admin.js` 60, `comercio.js` 50, `checkout.js` 19, `catalogo.js` 16, `perfil-cuenta.js` 13, `pedidos.js` 11…). Ganan a cualquier `@media`. Son el mayor riesgo técnico del proyecto para este trabajo.
- Navegación: 74 usos de `location.href/assign/replace` y 3 de `history.back()`. Todo es navegación entre páginas HTML (no hay router). Un layout de dos columnas con lista y detalle no rompe nada técnicamente, pero **no existe** hoy: cada detalle es otra página con `?id=`. Convertirlo en maestro-detalle real exige JS nuevo (ver sección 9).
- Vistas dentro de una misma página: `comercio-perfil.html` (9) y `perfil.html` (4) alternan `view-*` mostrando y ocultando secciones; en escritorio se resuelve naturalmente como menú lateral + panel, pero el menú no existe como componente.
- `innerHTML =` aparece 201 veces: la mayor parte del markup nace en JS, así que cambios estructurales (por ejemplo agregar un contenedor) se hacen en JS, no en HTML.
- Teclado: hay 144 menciones de `keydown/Escape/focus()/tabindex`, repartidas en 12 archivos (OTP, menú del cliente, visor, estadísticas con flechas, cierre con Escape en varias hojas). **No hay focus trap ni `inert`** en ninguna hoja (el grep de `trapFocus/focusTrap/inert` dio vacío).

---

## 6. Imágenes y medios

- Logos en `assets/img/` (3 PNG). No hay otras imágenes locales; fotos de comercio, perfil y producto son URLs de Cloudinary.
- Recorte al subir (`crop.js`): se pide una relación de aspecto por uso (4:3 para producto, con salida máxima de 1.200 px de ancho; **recomendada 1200×900** según la interfaz del formulario).
- En el CSS hay 24 `object-fit: cover` y 2 `contain`. Aspecto fijo `4/3` en la galería del modal de producto y en la miniatura; avatares circulares de tamaño fijo en tarjetas, perfil y barra.
- **No se piden versiones reducidas ni `srcset`**: el `src` es la URL original (sin transformaciones `w_`, `f_auto` ni `q_auto`) y no hay `loading="lazy"`. En escritorio, una grilla de 3–4 columnas con 20–40 comercios cargaría todas las imágenes a tamaño completo. Conviene resolverlo (transformación de Cloudinary en el helper de avatar y lazy loading) antes de tener grillas.
- Las fotos de producto son 4:3 horizontales: encajan bien en una grilla de tarjetas. Los avatares de comercio (cuadrados o redondos de ~56 px) quedan chicos en una tarjeta de escritorio: habría que pensar una foto de portada o aceptar un avatar más grande (decisión de diseño).
- Documentos (PDF e imágenes) se muestran en el visor a partir de un `blob:` (CSP del `Caddyfile` ya contempla `frame-src blob:`). En una pantalla ancha el visor puede ocupar un panel propio.

---

## 7. Pruebas (Playwright)

- `playwright.config.ts`: un solo proyecto `chromium` con `devices['Desktop Chrome']` (**1280×720**), `workers: 1`, sin retry local. `playwright.webkit.config.ts`: un proyecto `webkit` con `devices['iPhone 13']`.
- 95 specs (37 de UI) con unos 1.386 tests; 37.850 líneas.
- **Contradicción con la documentación**: el README y `CLAUDE.md` hablan de "viewport móvil" para muchos tramos. En el código solo 33 specs fijan viewport (`390×844`, `375×812` o `E2E_ANCHO`/`E2E_ALTO`); **62 no lo fijan y corren a 1280×720**, es decir, dentro de la tarjeta de 460 px centrada. Es un detalle clave: la suite "móvil" es en buena parte una suite de escritorio sin adaptación.
- Dependencia del layout: los selectores son mayormente por `data-testid` (5.077 usos de `getByTestId`, 1.576 atributos en el frontend). Hay 347 `locator(...)`, de los cuales 194 usan clase o id CSS (la mayoría `.toast`, 93; y `.notification-item`, `.profile-link`, `.stats-bar__value`, `.comercio-card__avatar`, `.cart-item`…). 24 referencias a `bottom-nav` o `btn-nav-*`. 18 specs usan `boundingBox` (medidas de layout a 375/390 px).
- Helper `tests/helpers/layout.ts` (`sinScrollHorizontal`) sirve tal cual en cualquier ancho.
- Qué hace falta para correr una selección a escritorio **sin duplicar la suite**: un proyecto nuevo `escritorio` (1440×900) en la configuración, restringido por etiqueta (`@escritorio` en el título y `grep`) o por carpeta (`tests-escritorio/`), con 8 a 12 recorridos clave y verificaciones estructurales (barra lateral visible, `.bottom-nav` oculta, sin scroll horizontal a 1024, 1280, 1440 y 1920). Los helpers de datos (`prueba.ts`, `multicomercio.ts`, `empleado.ts`, `soporte.ts`) se reutilizan sin cambios.
- Riesgo a decidir antes: si el escritorio empieza en 1024 px, el proyecto `chromium` actual (1280 px) **va a pasar a ver el layout de escritorio**. Hay que fijarlo a un viewport móvil (390×844) y verificar que los 62 specs sin viewport sigan en verde antes de agregar nada.

---

## 8. Accesibilidad y teclado en escritorio

- Foco visible: solo 7 reglas `:focus-visible`, más 10 `:focus`, y **5 `outline: none`**. La mayoría de los botones y enlaces no tiene un estilo de foco propio (usan el del navegador, que se ve bien salvo en los casos con `outline: none`).
- Hover: 9 reglas `:hover` en total (botón principal, FAB, filas de panel, menú de cliente, gráfico de estadísticas, botones peligrosos). **Cero `@media (hover: hover)`**: en táctil dejaría "pegado" el hover. En escritorio faltan estados hover en tarjetas de comercio y de pedido, filas de lista, chips, ítems de navegación y filas de las bandejas del Administrador.
- Teclado: orden de tabulación natural del DOM (correcto mientras los slots se llenen en orden); no hay "saltar al contenido"; las hojas no atrapan el foco ni lo devuelven al abrir y cerrar (algunas sí devuelven el foco, como direcciones). 12 archivos manejan `Escape`.
- Roles ARIA: hay `role="dialog"` o `alertdialog` en 12 módulos, pestañas con `aria-selected` en equipo y horarios, `aria-current="page"` en la navegación, `role="switch"` en el cierre. Base razonable.
- Elementos pensados para el toque: `chip-row` sin barra, mantener apretado el avatar, botones de 44 px (en escritorio quedan grandes pero no estorban), gráficos con una columna táctil por día.
- Controles nativos: 14 `<select>` y `type="time"` / `type="file"` en formularios; en escritorio usan los controles del sistema (se ven bien; solo conviene revisarlos al ensanchar).
- Sin atajos de teclado propios y sin `prefers-reduced-motion`.

---

## 9. Riesgos y límites: qué se resuelve con qué

**Solo CSS** (una o varias hojas nuevas, sin tocar HTML ni JS):

- Contenedor ancho y centrado (`.app-shell`), con grilla de tres zonas.
- Barra inferior a barra lateral (Cliente, Dueño y Empleado): ya es un `<nav>` con enlaces que contienen ícono y rótulo; se cambia `flex-direction`, posición y márgenes.
- Modales: de bottom sheet a diálogo centrado. `.pantalla-completa`: a panel lateral o diálogo ancho. `.toast` y `.visor-documento`.
- Grillas: lista de comercios (`.comercio-list`), productos (`.product-row`), pedidos, estadísticas (`.estadisticas-cifras`), pestañas del Dueño, tarjetas de las bandejas.
- Formularios y wizards en dos columnas (ya existe `.form-row`).
- Hover, foco visible, tipografía y espaciados por tokens.

**Requiere cambios de HTML o JS:**

- Limpiar los estilos inline que contradicen el escritorio (268 en HTML y 203 en JS), sobre todo en las cuatro páginas pesadas.
- Navegación del **Administrador** (no existe): componente nuevo que se agregue a las 17 páginas (oculto por CSS en móvil).
- Menú de secciones para `comercio-perfil` (9 vistas) y `perfil` (4 vistas) con el patrón "menú a la izquierda, vista a la derecha".
- Lista con detalle al costado en las bandejas del Administrador (`admin-soporte`, `admin-documentos`, `admin-comercios`, `admin-comercios-pendientes`): hoy cada detalle es otra página.
- Unificar los ~40 constructores de modal en un único ayudante con foco atrapado, `Escape` y devolución de foco.
- Transformaciones y carga diferida de imágenes.
- Controles para el `chip-row` sin barra.

**Pantallas que conviene rediseñar y no solo estirar** (en orden de valor):

1. `admin-documento-revision`: archivo grande a la izquierda y decisión a la derecha.
2. `admin-soporte`: bandeja a la izquierda y conversación a la derecha.
3. `checkout`: formulario a la izquierda y resumen fijo a la derecha.
4. `comercio-pedidos`: pedidos por estado en columnas (o lista con detalle).
5. `comercio-dashboard` y `comercio-estadisticas`: tablero de varias columnas con el gráfico a un ancho de verdad (en móvil son columnas de 10 px).
6. `comercio-perfil` y `perfil`: menú lateral de ajustes.
7. `admin-comercios`, `admin-clientes`, `admin-duenos`: tabla o grilla de tarjetas.
8. `index` y `comercio-detalle`: grilla de comercios y de productos.

**Riesgos de proceso:**

- Ya se rechazó una vez una adaptación hecha solo con CSS y un contenedor más ancho. El riesgo es repetir el resultado "celular flotando": hace falta una referencia de diseño por rol antes de programar (ver decisión 8).
- Los 62 specs que corren a 1280 px (sección 7).
- Páginas como `comercio-perfil.html` (38 KB, 9 vistas, 35 estilos inline) y `comercio.js` (3.522 líneas) son el punto más frágil.
- La regla 11 de `CLAUDE.md` (cero comentarios en `frontend/`) y la skill de páginas web (sin `#` en URLs) siguen vigentes; los CSS nuevos tampoco llevan comentarios.

---

## 10. Propuesta

### 10.1 Estrategia: mejora progresiva con un corte a 1024 px

1. **No tocar la versión móvil.** Todo el trabajo de escritorio va en hojas nuevas (`css/escritorio-base.css`, `escritorio-comercio.css`, `escritorio-admin.css`, `escritorio-cliente.css`) condicionadas por `(min-width: 1024px)`. Dos maneras de cargarlas: `@import url('escritorio-x.css') (min-width: 1024px);` en la cabecera de `styles.css` (sin tocar ningún HTML; costo: una cadena de carga más en escritorio) o un `<link media="(min-width:1024px)">` por página (mecánico pero toca 61 HTML). **Recomiendo `@import`**; si el rendimiento molesta se pasa a `<link>` con un reemplazo masivo. Con 16D-1 todo iba dentro del mismo `styles.css`; una hoja aparte hace la reversión trivial y mantiene la móvil auditable.
2. **Un solo corte, 1024 px.** Entre 640 y 1023 px queda como hoy (tarjeta de 460 px): sin diseño de tablet. Por encima, contenedor con `max-width` de 1280 px (tope de 1440 para el Administrador) y centrado. Para pantallas de 1920 px o más, el contenedor deja márgenes.
3. **Modelo de shell según rol** (todo apoyado en las clases existentes):
   - Cliente y público: barra superior horizontal (logo, enlaces, carrito, campana, perfil) en lugar de la barra inferior; contenido ancho en grilla.
   - Dueño y Empleado: **barra lateral izquierda** (reutiliza `.bottom-nav` como `<nav>` vertical) con el logo arriba, la franja de comercio activo y el cambio de cuenta; contenido en tablero.
   - Administrador: barra lateral nueva (componente de JS) con Panel, Comercios, Pendientes, Re-solicitudes, Documentos, Soporte, Clientes, Dueños, Reembolsos, Tarifas, Categorías y Tags.
4. **Capas**: hojas a diálogos centrados (el patrón de 16D-1, con `max-width` de 440 a 560 px), `.pantalla-completa` a panel lateral derecho de ~520 px, visor de documento y recorte como diálogo ancho; `.toast` abajo a la derecha.
5. **Preservar la móvil**: al estar en archivos aparte y condicionados, no hay forma de que cambie la móvil, salvo por las "limpiezas previas" de la sección 11, que sí tocan código móvil y se prueban a 375 px antes y después (la suite de WebKit/iPhone ya existe).

Ventajas: reversible, sin riesgo para la móvil, reutiliza JS y tests. Riesgos: especificidad contra estilos inline (se resuelve con las limpiezas previas); una barra lateral con `position: fixed` o `sticky` dentro de `.app-shell` con `overflow: hidden` (ver sección 1); mantener dos conjuntos de CSS que se pisan.

### 10.2 Tramos recomendados

| Tramo | Contenido | Páginas | Dependencias |
|---|---|---|---|
| **E0 — Base y acceso** | Tokens de ancho y de corte, carga de las hojas nuevas, shell, modales/toasts/`pantalla-completa`/visor, formularios y wizards en columnas, hover y foco, **proyecto de Playwright a 1440**, limpiezas previas (sección 11) | `splash`, `bienvenida`, `login`, `registro-tipo-cuenta`, `registro-cliente`, `registro-comercio`, `verificar-email`, `recuperar-password`, `reactivar-cuenta`, `invitacion-empleado`, `seleccionar-contexto`, `terminos`, `privacidad`, `errores/*` | Nada. Es el cimiento de los siguientes |
| **E1 — Comercio (Dueño y Empleado)** | Barra lateral, tablero del panel, productos en grilla o tabla, pedidos con detalle al costado, perfil con menú lateral, estadísticas, documentación, equipo, wizards de agregar y corregir | `comercio-*` (13), `agregar-comercio` | E0. Es el rol que más sentido tiene en una notebook (mostrador) |
| **E2 — Administrador** | Componente de navegación lateral (JS), tablero, bandejas con tabla o maestro-detalle, revisión de documentos a dos paneles, soporte en dos paneles | `admin-*` (17) | E0 |
| **E3 — Cliente y público restante** | Barra superior, catálogo y explorar en grilla, detalle de comercio con productos en grilla y modal de producto como diálogo, carrito y checkout a dos columnas, pedidos, perfil, notificaciones, soporte | `index`, `explorar`, `comercio-detalle`, `carrito`, `checkout`, `pedidos`, `pedido-detalle`, `perfil`, `notificaciones`, `mis-consultas`, `soporte*` | E0 (y las imágenes con transformación, sección 11) |
| **E4 — Pulido** | Teclado y foco en todo el flujo, estados de hover, anchos intermedios (1024–1279) y grandes (1920+), revisión visual completa, unificación de modales si quedó pendiente, documentación | todas | E1–E3 |

Orden recomendado: **E0 → E1 → E2 → E3 → E4**. Si Diego prefiere el orden del ejemplo del pedido (base y Cliente primero), es viable porque E0 y E3 comparten el catálogo, pero el valor de uso real de un escritorio está en Comercio y Administrador.

### 10.3 Decisiones que tiene que tomar Diego antes de diseñar

| # | Decisión | Recomendación |
|---|---|---|
| 1 | Punto de corte | Uno solo a **1024 px**, sin tablet; 640–1023 sigue con la tarjeta de 460 px |
| 2 | Ancho máximo del contenido | 1280 px centrado para Dueño, Empleado y Cliente; 1440 px para el Administrador (tablas) |
| 3 | Navegación | Barra superior para Cliente; barra lateral para Dueño, Empleado y Administrador |
| 4 | Referencia de diseño | **Mockup por rol antes de programar** (Figma en la página "MVP" no tiene escritorio): al menos catálogo, panel de comercio, pedidos, revisión de documentos y checkout. Evita repetir lo que pasó con 16D-1 |
| 5 | Listas del Administrador | Tarjetas en grilla para todo y **tablas reales solo** en comercios, clientes y dueños; maestro-detalle solo en soporte y documentos |
| 6 | Maestro-detalle del Dueño en pedidos | Detalle en panel lateral sobre la lista (JS nuevo) o mantener páginas separadas y ensanchar. Recomiendo panel lateral solo si E1 llega con tiempo; si no, ensanchar |
| 7 | Comportamiento de hojas en escritorio | Diálogo centrado (recomendado) o panel derecho para formularios largos; el visor de documentos ocupa más ancho |
| 8 | Alcance de escritorio en el Cliente | Completo (grilla, checkout en dos columnas) o mínimo (mismo flujo en contenedor ancho). Recomiendo completo porque el catálogo es lo que más se ve |
| 9 | Proyecto de Playwright | Fijar `chromium` en 390×844 y agregar `escritorio` a 1440×900 con una selección etiquetada (8–12 recorridos) |
| 10 | Tamaño de las imágenes | Pedir versiones reducidas a Cloudinary y lazy loading antes de tener grillas |
| 11 | Fuentes | Mantener Google Fonts; empaquetarlas localmente ya figura como mejora de producción pendiente en `CLAUDE.md` |

### 10.4 Cómo probar el escritorio

- Proyecto `escritorio` de Playwright a 1440×900 y una pasada puntual a 1024, 1280 y 1920 con `sinScrollHorizontal`.
- Verificaciones estructurales: barra lateral visible, `.bottom-nav` no visible en los roles con barra lateral, cabecera correcta, cada hoja como diálogo centrado, foco devuelto al cerrar, orden de tabulación.
- Una pasada de WebKit/iPhone y otra de Chromium a 390 px en cada tramo para demostrar que la móvil no cambió.
- Capturas por rol y por tramo en `docs/capturas-escritorio-*/` (mismo criterio que las carpetas de capturas existentes).
- Recorrido manual de Diego en el navegador por cada tramo antes de pasar al siguiente (como en 16D-1).

---

## 11. Lo que conviene arreglar antes en el código móvil

En orden de prioridad (todo se puede hacer sin cambiar cómo se ve la móvil):

1. **Estilos inline a clases.** 268 `style="..."` en HTML (59 en `registro-comercio`, 55 en `comercio-corregir`, 40 en `agregar-comercio`, 35 en `comercio-perfil`, 11 en `perfil`) y 203 asignaciones en JS (`admin.js` 60, `comercio.js` 50, `checkout.js` 19, `catalogo.js` 16, `perfil-cuenta.js` 13). Pasar los que definen layout (anchos, márgenes, `display`, posición) a clases; los de color o dinámicos pueden quedar.
2. **Ayudante único de modal** (`abrirModal` / `abrirHoja`) para los ~40 constructores manuales: acá se agregan una sola vez el foco atrapado, `Escape`, la devolución de foco y la variante de escritorio (diálogo).
3. **Tokens de capas y de ancho**: renombrar `--screen-max-width` a algo que distinga "ancho de la tarjeta móvil" de "ancho de la hoja" y agregar variables de ancho del contenedor, tamaños de fuente y espaciados.
4. **`.app-shell` con `overflow: hidden` y los cuatro pies `position: sticky`**: verificar en el navegador si funcionan hoy en ≥640 px; si no, corregirlo (puede ser `overflow: clip` o mover el recorte de esquinas).
5. **Navegación del Administrador**: crear el componente (`renderAdminNav`) y agregarlo a las 17 páginas oculto en móvil, para que E2 solo sea CSS. Hoy el panel del Administrador es una pantalla sin navegación y una cadena de botones "volver".
6. **Imágenes**: ayudante de URL de Cloudinary con transformación de tamaño y `loading="lazy"`.
7. **`renderTopBar`**: sacar sus cuatro asignaciones inline (`position`, `transform`, `fontSize` y ancho del espaciador) a clases.
8. **`chip-row`**: agregar una variante con `flex-wrap` (existe `.chip-row--wrap` en el formulario de producto) o controles de desplazamiento para ratón.
9. **Estados `:hover` bajo `@media (hover: hover)`** y `:focus-visible` consistente en botones, enlaces y tarjetas clicables.
10. **`100vh` a `100dvh`** (`body`, `.app-shell`, zoom de imagen): mejora móvil real y evita saltos en escritorio con barras.
11. **Tests**: fijar el proyecto `chromium` en un viewport móvil (390×844), correr los 62 specs sin viewport y corregir lo que cambie; actualizar el README donde dice "viewport móvil" sin que sea cierto.
12. **Documentación**: `CLAUDE.md` dice que la única `@media` es la de 640 px y es correcto; conviene dejar una nota del Tramo 16D-1 (qué se intentó y por qué se revirtió) apuntando a este documento.

---

## 12. Contradicciones y observaciones

- `docs/DECISIONES.md` (2026-07-31) describe CSS de escritorio con `@media (min-width: 1024px)` y variables `--shell-max-width-desktop`; **no existe en el código actual** porque se revirtió el 2026-08-01 (confirmado con `grep`: una sola `@media`, a 640 px). No es una inconsistencia del repo, solo una entrada histórica que no describe el estado vigente.
- Los documentos de tramos hablan de "viewport móvil" para suites que, por configuración, corren a 1280 px (sección 7).
- Las páginas dicen tener "slots" para el contenido; en la práctica `comercio-perfil.html` y `registro-comercio.html` llevan buena parte del formulario escrito en el HTML. La auditoría trata esas dos como excepciones del patrón.
- No se pudo ejercitar: el rendimiento de carga de una hoja adicional con `@import` condicionado, el comportamiento real de los `sticky` dentro de `overflow: hidden` y el aspecto de los modales actuales a 1440 px. Los tres figuran como verificaciones a hacer al empezar E0.
