# Mapeo de archivos — Multi-comercio, tramo 4, Entrega B (frontend y backend estricto)

Fecha: 2026-10-02. Objetivo: el selector de comercio del Dueño (header `X-Comercio-Id` real desde el frontend, franja y panel "Tus comercios", pantallas de estado por `?id`, avatar del footer con gesto de mantener apretado, polling unificado) y, como último paso, el backend estricto (el header pasa a ser obligatorio para el Dueño). **Sin tablas, columnas, valores de ENUM ni migraciones nuevas.** Nada para el Empleado. Mercado Pago real y la evidencia del ticket (Dueño 185, pago `181440408054`, nota de crédito 4, `NC-2026-00003`, cuenta del `dueno_id` 259) no se tocaron; todo lo que escribe datos fue contra `bajonea_test`.

## Frontend nuevo

| Archivo | Por qué |
|---|---|
| `frontend/js/comercio-activo.js` (nuevo) | Resuelve una vez por carga de página el comercio activo del Dueño con una sola consulta a `GET /comercios/mis-comercios` (memoizada). Orden: selección de la pestaña (si sigue siendo operativa), último usado (si es operativo), operativo más antiguo; sin operativos, por pantalla de estado (rechazado, pendiente, rechazo definitivo) con `?id`; con solo suspendidos, cerrados o inactivos, `ninguno`. Lista vacía = `sin-comercios`. Guarda `comercio` activo solo si es operativo. Tienda en memoria con suscriptores, polling único cada 15 s (`iniciarPollingComercios`) que alimenta campana, punto de la franja, contadores del panel y avatar del footer, y que vuelve a resolver y redirige si el comercio activo dejó de ser operativo. Importa solo `api.js`. |
| `frontend/js/selector-comercio.js` (nuevo) | Franja (`montarFranjaComercio`, con esqueleto de carga), panel "Tus comercios" (`abrirPanelComercios`: bottom sheet con `.modal-backdrop` y la estructura de `.product-modal-sheet`, grupos Operativos / Pendientes / Rechazados / Otros, filas con foto o iniciales, tilde o etiqueta, subtítulos y contador, "Agregar comercio" solo si es elegible), gesto de mantener apretado (`enlazarMantenerApretado`: Pointer Events, solo `touch`, 500 ms, se cancela con `pointerup`, `pointercancel` o movimiento mayor a 8 px, suprime el `click` siguiente, `contextmenu` bloqueado) y `prepararPaginaDueno` (guarda común de las pantallas del Dueño). Sin `innerHTML`: los íconos se arman con `createElementNS`. |

## Frontend modificado

| Archivo | Por qué |
|---|---|
| `frontend/js/api.js` | `apiFetch` inyecta `X-Comercio-Id` solo si el rol es `DUENO`, hay token y la ruta es de operación (`/comercios/perfil`, `/comercios/redes-sociales`, `/productos`, `/pedidos/comercio`, `/notificaciones`, excepto `/notificaciones/comercio/…`); opciones `comercioId` (sobrescribe) y `sinComercio`. Sin selección guardada no manda header (no inventa un comercio). Almacenamiento: `sessionStorage['bajonea_comercio_activo']` = `{usuarioId, comercioId}` (por pestaña, se descarta si el `usuarioId` no coincide) y `localStorage['bajonea_ultimo_comercio_<usuarioId>']`. `clearSesion` borra la primera y no toca la segunda. La subida a Cloudinary (`cloudinary.js`, `fetch` directo) nunca recibe el header. |
| `frontend/js/auth.js` | `resolverHomePorRol` usa el resolutor (mis-comercios) en vez de `/comercios/perfil`; devuelve el dashboard o la pantalla de estado con `?id`; `sin-comercios` lanza error; `ninguno` conserva el banner del login. |
| `frontend/js/comercio.js` | `initComercioEstadoPagina(estado)` ahora lee `?id` (sin `?id` o inválido aplica la regla por defecto y redirige con `?id`; estado distinto redirige a la pantalla que corresponde con el mismo `?id`; operativo lo activa y va al dashboard), llama a `GET /comercios/perfil` con el header sobrescrito, marca como leídas las notificaciones del comercio y engancha "Volver a mis comercios". El dashboard, Pedidos, Productos y Perfil montan la franja (`prepararPaginaDueno` con slot) y arrancan el polling; el detalle de pedido y el formulario de producto usan `prepararPaginaDueno` sin franja. `renderBottomNavComercio`: el avatar sale de mis-comercios (se repinta solo si cambió foto o nombre) y el ítem Perfil admite mantener apretado. La campana del dashboard usa el contador del comercio activo (se quitó su `setInterval` propio). El perfil refresca la tienda tras cambiar foto o datos. Se quitó `RUTA_POR_ESTADO` local (ahora en `comercio-activo.js`). |
| `frontend/js/catalogo.js` | La campana del Dueño usa el contador del comercio activo; el Cliente conserva `GET /notificaciones/no-leidas/contador` sin cambios. |
| `frontend/js/notificaciones.js` | Para el Dueño llama a `prepararPaginaDueno` antes de pedir la lista (el header lo agrega `apiFetch`). No se tocó el armado de enlaces. |
| `frontend/comercio-dashboard.html`, `comercio-productos.html`, `comercio-pedidos.html`, `comercio-perfil.html` | Slot `franja-comercio-slot` debajo del header. |
| `frontend/comercio-pendiente.html`, `comercio-rechazado.html`, `comercio-rechazo-definitivo.html` | Botón "Volver a mis comercios" (`btn-volver-a-mis-comercios`). |
| `frontend/css/styles.css` | Clases nuevas `selector-avatar*`, `comercio-franja*`, `panel-comercios*` y `bottom-nav__item--selector` (`-webkit-touch-callout`, `user-select`, `touch-action`). Cada contenedor con ícono tiene su regla de tamaño (`.comercio-franja__cambiar svg`, `.panel-comercios__tilde svg`, `.panel-comercios__agregar svg`). |
| `frontend/js/comercio-corregir.js`, `frontend/js/agregar-comercio.js` | Sin cambios. Terminan en `comercio-dashboard.html`: si el comercio queda pendiente y no hay operativo, la guarda del dashboard lleva a `comercio-pendiente.html?id=N` (cubierto por el spec `25`); con un operativo, vuelve a su dashboard. |

## Backend (paso final)

| Archivo | Por qué |
|---|---|
| `backend/src/main/java/com/bajonea/backend/services/ComercioActivoService.java` | Se eliminó `resolverPorDefecto` y la marca `PROVISORIO_SELECTOR`. Sin header, vacío o en blanco: `400` ("El header X-Comercio-Id es obligatorio para el Dueño"), también con un solo comercio. No numérico: `400`. Ajeno o inexistente: `404` idéntico. |
| `backend/src/main/java/com/bajonea/backend/services/NotificacionService.java` | Solo el Javadoc de `listar`. |
| `backend/src/test/java/com/bajonea/backend/services/ComercioActivoServiceResolverSiCorrespondeTest.java` | El test de la regla provisoria pasa a afirmar `400` (sin header, vacío, en blanco y no numérico, sin tocar el repositorio). `mvnw test`: 167 (166 − 1 + 2). `PedidoServiceReembolsoTest` no dependía de la regla. |

## Tests

| Archivo | Por qué |
|---|---|
| `testing/playwright/tests/27-multicomercio-tramo4-selector.spec.ts` (nuevo) | 52 tests, viewport 390×844: orden de entrada al login, último usado válido e inválido, Dueño distinto en la misma pestaña, franja en las 4 pestañas y ausente en detalle y formularios, 360 px sin pisar el header, esqueleto, grupos, etiquetas y contadores del panel, cierre por Escape, fondo y asa, cambio de comercio, pantallas de estado (con `?id`, sin `?id`, estado distinto, operativo, id inválido o ajeno), "Volver a mis comercios", marcado de leídas, campana y lista por comercio, dos pestañas, una consulta de polling por ciclo con reloj virtual, redirección si el activo deja de ser operativo, mis-comercios vacío, Cliente sin cambios, gesto de mantener apretado (con dedo, toque corto, mouse, movimiento) y header (nunca hacia Cloudinary, ni hacia mis-comercios ni elegibilidad). |
| `testing/playwright/tests/helpers/selector.ts` (nuevo) | `abrirComoUsuarioConComercio`, `seleccionarComercioEnPanel`, `abrirPanel`, `comercioActivoEnSesion`, `ultimoComercioGuardado`, `mantenerApretado`. |
| `testing/playwright/tests/21-multicomercio-tramo1.spec.ts` | Los tests de la regla provisoria (sin header con un comercio, con dos, fallback entre estados) pasan a afirmar `400`; con header propio siguen igual. |
| `testing/playwright/tests/26-multicomercio-tramo4-api.spec.ts` | "sin header sigue funcionando" y "header vacío" pasan a un test que afirma `400` en la lista y en el contador. |
| `testing/playwright/tests/08-aprobacion-comercio.spec.ts` | La notificación de rechazo del Dueño se verifica por API: sin comercio operativo, `notificaciones.html` redirige a la pantalla de estado (no hay campana ahí, decisión 10). |
| `testing/playwright/tests/08`, `17`, `18`, `25` | `waitForURL` de las pantallas de estado ahora con `?id=*`. |
| `testing/playwright/scripts/build-multicomercio-tramo1-postman.mjs`, `build-multicomercio-tramo3a-postman.mjs`, `build-multicomercio-tramo4a-postman.mjs` | Los requests de "sin header" (y "header vacío") pasan a afirmar `400`; los que necesitaban el comercio por defecto ahora mandan su header (tramo 1: crear y listar productos, redes, pedidos y resumen de N con su header; tramo 3A: los `[aviso]` mandan el comercio). **Orden de ejecución de los builders: `1`, `2a`, `3a`, `4a`** (el `1` reemplaza la carpeta 49 entera y el `4a` agrega los `[T4A]` y reaplica los scripts centrales de las carpetas 49-51, así que va siempre último). |
| `postman/Bajonea-MVP.postman_collection.json` | Regenerada con los builders en ese orden: 1256 requests. |

## Receta de prueba manual en `bajonea_practicas3`

Ver la sección "Receta" del informe del tramo en `docs/DECISIONES.md` (entrada del 2026-10-02).
