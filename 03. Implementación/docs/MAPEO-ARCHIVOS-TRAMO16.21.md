# Mapeo pantallas ↔ archivos — Tramo 16.21 (corrección UI/UX del rol Administrador)

Ronda de pulido UI/UX sobre las 5 pantallas ya construidas del rol Administrador (Tramos 8/9), última de la ronda de correcciones que ya cerró para Cliente y Comercio en tramos previos. Sin pantallas nuevas de Figma — refinamiento sobre lo existente, más 2 pantallas nuevas (`admin-comercios.html`, `admin-clientes.html`) resueltas con 2 gaps de backend confirmados y cerrados en el mismo tramo, nunca mockeados en el frontend.

Todo lo documentado acá fue verificado con interacción real en navegador contra el backend real (perfil `test`, MySQL real) — ver `docs/DECISIONES.md`, entrada "Tramo 16.21" del 2026-07-29, para el detalle completo de decisiones y evidencia.

---

## Punto 1 — Headers blancos con logo/título centrado

| Archivo | Cambio |
|---|---|
| `frontend/admin-dashboard.html` | `<header class="app-header app-header--accent">` reemplazado por `<div id="top-bar-slot"></div>`. `<h3>Bajoneá App</h3>` → `<h3 id="admin-nombre">Cargando...</h3>`. |
| `frontend/js/admin.js` | `initAdminDashboard`: `renderTopBar(..., { mostrarPerfil: false, mostrarCampana: false, centrarLogo: true })` nuevo (import agregado desde `catalogo.js`); `apiFetch('/administrador/perfil')` nuevo (en paralelo con `/administrador/metricas` vía `Promise.all`), rellena `#admin-nombre` con `${perfil.nombre} ${perfil.apellido}`. Tiles "Comercios"/"Clientes" suman `href: 'admin-comercios.html'`/`'admin-clientes.html'`. |
| `frontend/admin-comercios-pendientes.html` | `app-header--accent` quitado. Título suma `color:var(--color-primary)` inline. |
| `frontend/admin-categorias.html` | Ídem. |
| `frontend/admin-tags.html` | Ídem. |
| `frontend/admin-comercio-detalle.html` | Ídem, más el `<span>Nueva</span>` del header eliminado (ver Punto 2). |
| `frontend/css/styles.css` | `.app-header__badge` (contador de `admin-comercios-pendientes.html`): `border` blanco (pensado para fondo naranja) reemplazado por `background: var(--color-primary)` sólido, visible sobre fondo blanco. |
| `backend/.../dto/response/AdministradorResponseDTO.java` | Nuevo — `id`, `nombre`, `apellido`. |
| `backend/.../services/AdministradorService.java` | `obtenerPerfil(administradorId)` nuevo — resuelve `Administrador → PersonaFisica`. |
| `backend/.../controllers/AdministradorController.java` | `GET /administrador/perfil` nuevo. |

---

## Punto 2 — Limpieza de `admin-comercio-detalle.html`

| Archivo | Cambio |
|---|---|
| `frontend/js/admin.js` | `renderDetalle`: placeholder `.request-hero__logo` ("Logo") → `.comercio-detail-header__avatar` (circular, 88px, reusa `pintarAvatarComercio` de `catalogo.js`, import agregado). Pills de tipo/modalidad (`.pill-row`) eliminadas del hero. `labelModalidades` eliminada del archivo (quedó sin llamador). Badge "Nueva" del header, en el `.html` (ver Punto 1). Pill con el nombre del comercio, eliminada de `mostrarModalConfirmarAprobacion`. Toast unificado `"El comercio fue notificado de tu decisión"` en los 2 handlers (aprobar/rechazar), reemplaza `"Comercio aprobado"`/`"Comercio rechazado"`. |

---

## Punto 3 — Badge "Nueva" de `admin-comercios-pendientes.html`

| Archivo | Cambio |
|---|---|
| `frontend/js/admin.js` | `renderRequestCard`: clase del badge `status-badge status-badge--pendiente` → `status-badge status-badge--nueva`. |
| `frontend/css/styles.css` | `.status-badge--nueva` nueva (`background: var(--color-primary)`, `color: #ffffff`) — deliberadamente separada de `.status-badge--pendiente` (compartida con los badges de pedido de Cliente/Comercio) para no afectarlos. |

---

## Punto 4 — `admin-comercios.html` y `admin-clientes.html` (pantallas nuevas)

| Archivo | Cambio |
|---|---|
| `backend/.../dto/response/ComercioAdminResponseDTO.java` | Nuevo — reemplaza a `ComercioPendienteResponseDTO` (renombrado, mismo contenido + `fotoPerfilUrl` nuevo). Usado tanto para pendientes como para aprobados. |
| `backend/.../dto/response/ComercioPendienteResponseDTO.java` | Eliminado (renombrado a `ComercioAdminResponseDTO.java`). |
| `backend/.../dto/response/ClienteAdminResponseDTO.java` | Nuevo — `id`, `nombre`, `apellido`, `dni`, `email`, `estado`, `fechaRegistro`. |
| `backend/.../services/AdministradorService.java` | `listarComerciosAprobados()` nuevo (`findByEstado(APROBADO)`, mismo mapeo que pendientes). `listarClientes()` nuevo (`clienteRepository.findAll()`). `aPendienteResponseDTO` renombrado a `aAdminResponseDTO`, suma `comercio.getFotoPerfilUrl()`. `aClienteAdminResponseDTO` nuevo. |
| `backend/.../controllers/AdministradorController.java` | `GET /administrador/comercios` nuevo (aprobados). `GET /administrador/clientes` nuevo. |
| `frontend/admin-comercios.html` | Nuevo — header blanco/título naranja, `<div id="comercios-content">`. |
| `frontend/admin-clientes.html` | Nuevo — header blanco/título naranja, `<div id="clientes-content">`. |
| `frontend/js/admin.js` | `renderComercioDetailSections(body, comercio)` nueva — extraída de `renderDetalle` (las 6 secciones de detalle), reusada por `renderDetalle` y por el modal nuevo. `mostrarModalDetalleComercio(comercio)` nueva — modal de solo lectura (`.product-modal-sheet`, sin acciones). `renderComercioAdminRow`/`initAdminComercios` nuevas — lista de comercios aprobados con `pintarAvatarComercio`, `labelTipoComercio`, botón "Ver detalle". `renderClienteAdminRow`/`initAdminClientes` nuevas — lista de clientes con badge de estado (`LABELS_ESTADO_USUARIO`/`CLASE_ESTADO_USUARIO` nuevos), sin acciones. `formatearSoloFecha` nueva. |
| `frontend/css/styles.css` | `.comercio-admin-row`/`__avatar`/`__body`/`__detalle` nuevas. `.cliente-admin-list`/`.cliente-admin-row`/`__top` nuevas. `.status-badge--activo` nueva (verde, para estado `ACTIVO` de Cliente). |

---

## Punto 5 — `admin-categorias.html` y `admin-tags.html`

| Archivo | Cambio |
|---|---|
| `frontend/js/admin.js` | `mostrarModalCategoria`/`mostrarModalTag`: el bloque del switch "activa/o" + hint ahora condicional a `esEdicion` (antes siempre visible, incluso en creación). `mostrarMenuAccionesCategoria`/`mostrarMenuAccionesTag` eliminadas (menú de 3 puntitos). `mostrarModalEliminarCategoria`/`mostrarModalEliminarTag` eliminadas (modal de baja standalone, sin llamador tras quitar el menú). `renderCategoriaRow`/`renderTagRow`: botón `.product-row__kebab` (`ICONS.kebab`) → botón `.categoria-row__edit-btn` (`ICONS.edit`), `onclick` abre el modal de edición directo. `initAdminCategorias`/`initAdminTags`: `onEliminar` quitado de los call sites (el `DELETE` sigue disponible vía el toggle del modal de edición). `ICONS.kebab`/`ICONS.trash`/`ICONS.close` eliminados del mapa de íconos del archivo (quedaron sin ningún uso). |
| `frontend/css/styles.css` | `.categoria-row__icon`: `background`/`color` de `var(--color-primary-soft)`/`var(--color-primary)` (pastel) a `var(--color-primary)`/`#ffffff` (sólido). `.categoria-row__edit-btn` nueva (`color: var(--color-primary)`, mismo tamaño que el kebab viejo). |

---

## Verificado en esta sesión (cierre formal)

- `./mvnw compile` → `BUILD SUCCESS` tras los cambios de backend.
- Backend real levantado (perfil `test`), sesión de Administrador real (`admin@bajonea.ar`) vía login real en el navegador — contraseña de la cuenta reseteada a una conocida mediante el flujo real de recuperación de contraseña (Diego debe volver a cambiarla si quiere una propia).
- `GET /administrador/perfil`, `GET /administrador/comercios`, `GET /administrador/clientes` probados por `curl` con JWT real antes de tocar el navegador — respuestas correctas, campos esperados.
- Dashboard: header blanco confirmado (`getComputedStyle` → `rgb(255,255,255)`), nombre real del admin ("Admin Bajonea") en el cartel, tiles "Comercios"/"Clientes" navegando a las pantallas nuevas.
- 4 headers restantes: fondo blanco + título `rgb(255,71,0)` confirmado por `getComputedStyle` en las 4 pantallas.
- `admin-comercios-pendientes.html`: badge "Nueva" naranja/blanco confirmado.
- `admin-comercio-detalle.html`: sin badge "Nueva" en el header, sin `.pill-row`, avatar circular con fallback de inicial sin foto — confirmado por inspección del DOM. Flujo de aprobación real de punta a punta sobre el comercio de prueba `id 52`: modal sin pill de nombre → `PUT /administrador/comercios/52/resolver` → `200` → `estado` `APROBADO` confirmado por `SELECT` → **revertido a `PENDIENTE`** después de la prueba (`UPDATE` directo + limpieza de `historial_estado_comercio`/`notificacion` generados), sin dejar el fixture consumido.
- `admin-comercios.html`: 12 comercios aprobados listados, comercio con foto real mostrando la imagen de Cloudinary (no la inicial) en el avatar circular; modal de detalle de solo lectura confirmado (6 secciones completas, sin botones de aprobar/rechazar, solo "Cerrar").
- `admin-clientes.html`: 10 clientes listados, badges de estado con colores reales (`Activo` verde, `Pendiente` ámbar), sin ninguna acción.
- `admin-categorias.html`: modal de creación sin el toggle "activa" (confirmado por `read_page`); modal de edición con el toggle presente; ícono naranja sólido con SVG blanco confirmado; `.product-row__kebab` confirmado ausente de la página.
- `admin-tags.html`: mismo patrón que categorías, header confirmado.
- Confirmado por `grep` que `.categoria-row__edit-btn`/`.status-badge--nueva`/`.status-badge--activo` no se referencian fuera de `admin.js`, y que `comercio.js`/`pedidos.js` conservan intactos `ICONS.kebab`/`.product-row__kebab`/`.status-badge--pendiente` — sin regresión sobre Cliente/Comercio.
- Sin errores de consola en las 7 pantallas recorridas.

---

## Resumen numérico

| | Cantidad |
|---|---|
| Puntos del tramo | 5 |
| Archivos backend nuevos | 2 (`ComercioAdminResponseDTO.java`, `ClienteAdminResponseDTO.java`, `AdministradorResponseDTO.java` — 3 en total) |
| Archivos backend eliminados | 1 (`ComercioPendienteResponseDTO.java`, renombrado) |
| Archivos backend modificados | 2 (`AdministradorService.java`, `AdministradorController.java`) |
| Archivos frontend nuevos | 2 (`admin-comercios.html`, `admin-clientes.html`) |
| Archivos frontend modificados | 6 (`admin-dashboard.html`, `admin-comercios-pendientes.html`, `admin-categorias.html`, `admin-tags.html`, `admin-comercio-detalle.html`, `js/admin.js`, `css/styles.css` — 7 en total) |
| Datos de prueba tocados en la base real | Ninguno queda residual — comercio id 52 revertido a su estado original tras la prueba de aprobación; el resto de comercios/clientes usados solo se leyeron. Único cambio persistido a propósito: contraseña de `admin@bajonea.ar`. |

**Pendiente de confirmación del usuario:** este tramo no se cierra hasta que Diego confirme el checklist punto por punto — ver el mensaje de cierre de la sesión para el detalle completo.
