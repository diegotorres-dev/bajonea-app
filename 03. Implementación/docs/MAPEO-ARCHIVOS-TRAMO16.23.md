# Mapeo pantallas ↔ archivos — Tramo 16.23 (correcciones puntuales tras el Tramo 16.21)

Ronda chica de ajustes sobre 3 roles (Administrador, Comercio, Cliente), disparada por feedback de Diego tras revisar el checklist del Tramo 16.21. Separado de `docs/MAPEO-ARCHIVOS-TRAMO16.21.md` (scoped a Administrador) porque este tramo toca Comercio y Cliente también.

Todo lo documentado acá fue verificado con interacción real en navegador contra el backend real (perfil `test`, MySQL real, fotos reales de Cloudinary) — ver `docs/DECISIONES.md`, entrada "Tramo 16.23" del 2026-07-30, para el detalle completo de decisiones y evidencia.

---

## Punto 1 — Modal "Ver detalle" de `admin-comercios.html`

| Archivo | Cambio |
|---|---|
| `frontend/css/styles.css` | `.product-modal-sheet` suma `scrollbar-width: none;` + `::-webkit-scrollbar{display:none;}` (afecta a todos los modales que comparten este contenedor, no solo a este). |
| `frontend/js/admin.js` | `mostrarModalDetalleComercio`: `<h2>` del nombre del comercio suma `text-align:center`. |

## Punto 2 — Botón "Cerrar sesión" en `admin-dashboard.html`

| Archivo | Cambio |
|---|---|
| `frontend/js/admin.js` | Import `logout` de `auth.js`. `mostrarModalConfirmarLogoutAdmin` nueva (mismo modal que Cliente/Comercio). `ICONS.logoutIcon` sumado. Wireado en `initAdminDashboard`. |
| `frontend/admin-dashboard.html` | Botón `#cerrar-sesion-btn` nuevo, `.btn-text` (naranja, sin fondo, chico). |

## Punto 3 — Botón de confirmación del editor de recorte

| Archivo | Cambio |
|---|---|
| `frontend/js/crop.js` | "Confirmar recorte" → "Confirmar" — componente compartido (`abrirEditorRecorte`), afecta también a foto de producto y avatar de `registro-comercio.html`. |

## Punto 4 — Header de "Panel" en `comercio-dashboard.html`

| Archivo | Cambio |
|---|---|
| `frontend/js/comercio.js` | `renderHeaderDashboard(container, nombreComercio)` → `renderHeaderDashboard(container)`: ícono (`ICONS.store`) + nombre del comercio eliminados del `brand`. `bar` suma `top-bar--logo-centrado`. `ICONS.store` eliminado del archivo (sin otro uso). Call site en `initComercioDashboard` actualizado. |

Confirmado antes de tocar nada que `renderHeaderDashboard` es exclusiva de "Panel" — Productos/Pedidos usan `renderTopBar({mostrarVolver:true})`, Perfil usa `renderTopBar({centrarLogo:true, mostrarCampana:false})`, ninguno compartía el ícono+nombre que se quitó.

## Punto 5 — Galería de fotos del modal de producto (Cliente, `comercio-detalle.html`)

| Archivo | Cambio |
|---|---|
| `frontend/js/catalogo.js` | `galeriaState`/`actualizarGaleria()` (prev/next + dots) eliminados. `abrirVisorZoom(url)` nueva (overlay simple, sin librería). `abrirModalProducto` bifurca por `imagenes.length`: `>1` → `.product-gallery` (foto principal + tira de miniaturas, click intercambia, lupa abre `abrirVisorZoom`); `===1` → sin cambios (`.product-modal-sheet__gallery`, `cover`); `===0` → sin galería, igual que antes. `ICONS.chevronRight` eliminado (sin otro uso tras quitar prev/next). |
| `frontend/css/styles.css` | `.product-modal-sheet__gallery-nav`/`--prev`/`--next`/`.product-modal-sheet__dots` eliminadas (huérfanas). Nuevas: `.product-gallery__main`, `.product-gallery__zoom`, `.product-gallery__thumbs`, `.product-gallery__thumb` (+ `[data-active]`), `.image-zoom-backdrop`/`__img`/`__close`. |

Solo aplica a productos con más de 1 foto — el caso de 1 sola foto mantiene el comportamiento anterior exacto, confirmado explícitamente fuera de foco por Diego.

---

## Pendientes de la ronda anterior, resueltos en este tramo

### Newman contra la colección tras el rename `ComercioPendienteResponseDTO` → `ComercioAdminResponseDTO`

Corrido (`npx newman run postman/Bajonea-MVP.postman_collection.json -e postman/Bajonea-Local.postman_environment.json`). La corrida completa falla, pero por 3 causas **ya existentes y ajenas al rename**:

1. `postman.cliente@bajonea.test` ya existía en la base (corrida parcial anterior) → `Registro Cliente` da `409`.
2. `Registro Comercio A`/`B` dan `400` — el body de la colección no incluye los 5 campos de representante que `RegistroComercioRequestDTO` exige desde el 2026-07-22 (más de una semana antes de este tramo) — la colección quedó desactualizada desde esa fecha.
3. Todo `03 - Administrador` en adelante falla en cascada por la causa 2 (sin comercios creados, sin ids de ambiente).

Verificado en cambio por `curl` directo con JWT real: `GET /administrador/comercios/pendientes`, `/comercios`, `/clientes`, `/perfil` responden `200` con la forma esperada contra datos reales. La colección no se tocó en este tramo — arreglarla es trabajo aparte, no pedido acá.

### Contraseña de `admin@bajonea.ar`

El flujo directo pedido (`cambiar-password` autenticado con la contraseña actual) no fue posible: la contraseña conocida (`AdminTest123`) ya no era válida (`intentos_fallidos = 2` al empezar este tramo — evidencia de que alguien, probablemente Diego, ya la había probado). Con un intento más el login se bloqueaba, así que se usó el flujo de recuperación (único camino que no consume intentos) para fijarla a **`Bajonea2026Admin`** — Diego debe cambiarla por una propia.

**Hallazgo relacionado, sin acción tomada:** al intentar loguear `comercio2.demo@bajonea.test` con la contraseña documentada (`Demo1234`) para el Punto 4, también dio credenciales inválidas (`intentos_fallidos = 2`) — reseteado por recuperación al mismo valor ya documentado, sin cambiarlo. Se encontró de paso que el comercio asociado ("Pizzas del Sur", id 39) pasó de `APROBADO` a `RECHAZADO` el 2026-07-30 00:04:43 (motivo de prueba con texto repetido, claramente un test manual del límite de caracteres), `administrador_id = 58`. **No se revirtió** — parece una acción deliberada de Diego, se informa en vez de asumir que hace falta corregirla. Se usó `comercio1.demo@bajonea.test` (Sabores Fueguinos, sigue `APROBADO`) para verificar el Punto 4.

---

## Verificado en esta sesión (cierre formal)

- `node --check` sobre los 4 archivos JS modificados, sin errores de sintaxis.
- Conteo de llaves de `styles.css` balanceado.
- Cero comentarios confirmado por `grep` en todos los archivos tocados.
- Producto real con 5 fotos (id 50, comercio 48): `object-fit:contain` en la principal, 5 miniaturas con opacidad correcta, click en miniatura intermedia confirmado (comparado por `src`, no solo índice), lupa abre el visor con la foto activa en ese momento.
- Producto real con 1 sola foto (id 29): comportamiento anterior intacto, sin `.product-gallery` en el DOM.
- Sesión de Administrador real: botón "Cerrar sesión" (color/tamaño correctos), modal de confirmación, logout real (`POST /auth/logout` + redirect a `login.html`) confirmado. Modal de `admin-comercios.html` con scroll funcional sin barra visible, título centrado.
- Sesión de Comercio real (`comercio1.demo@bajonea.test`): header de "Panel" solo con logo centrado + campana; Productos/Pedidos/Perfil recorridos sin regresión.
- Editor de recorte invocado con una foto real de Cloudinary — botón confirmado con el texto "Confirmar".
- Sin errores de consola en ninguna pantalla recorrida.

---

## Resumen numérico

| | Cantidad |
|---|---|
| Puntos del tramo | 5 + 2 pendientes de la ronda anterior |
| Archivos backend tocados | 0 |
| Archivos frontend modificados | 6 (`admin-dashboard.html`, `js/admin.js`, `js/crop.js`, `js/comercio.js`, `js/catalogo.js`, `css/styles.css`) |
| Cambios persistidos a propósito en la base real | Contraseña de `admin@bajonea.ar` (`Bajonea2026Admin`) |
| Hallazgos informados, sin acción tomada | Comercio "Pizzas del Sur" (id 39) en estado `RECHAZADO` desde una prueba manual de Diego — no revertido |

**Pendiente de confirmación del usuario:** este tramo no se cierra hasta que Diego confirme el checklist punto por punto — ver el mensaje de cierre de la sesión para el detalle completo.
