# Mapeo pantallas ↔ archivos — Tramo 16.14 (segunda ronda de testing manual, 12 puntos)

Tramo de corrección, no un tramo de contenido nuevo de la guía — 12 puntos de una segunda ronda de testing manual post-cierre de Fase 16: 1 bug crítico de lógica de negocio, 6 puntos ya pedidos en rondas anteriores pero nunca ejecutados, un rediseño de componente (OTP de 6 casilleros + restructuración de `recuperar-password.html`), y 2 ajustes menores. Mismo formato que `docs/MAPEO-ARCHIVOS-TRAMO16.11.md`/`TRAMO16.12.md`: se mapea punto↔archivos en vez de pantalla↔archivos.

Todo lo documentado acá fue verificado con interacción real en navegador contra el backend real (perfil `test`, cuentas Cliente/Comercio/Administrador reales creadas para esta sesión) — ver `docs/DECISIONES.md`, entrada "Tramo 16.14" del 2026-07-28, para el detalle completo de decisiones y los 2 hallazgos reales no pedidos (gap de `CERRADO_TEMPORALMENTE`, bug del componente OTP).

---

## Punto 1 (Prioridad 1) — Bloquear pedidos a comercio cerrado

| Archivo | Cambio |
|---|---|
| `backend/.../services/ComercioService.java` | Método nuevo `validarAceptaPedidos(Comercio)`: `409` si `estado != APROBADO`, `409` si está fuera de horario (réplica en Java de `estadoHorario()` de `catalogo.js`, vía `DayOfWeek`/`LocalTime`). Suma import de `ConflictoDeNegocioException`/`DiaSemana`/`LocalTime`. |
| `backend/.../services/CarritoService.java` | Inyecta `ComercioService`; `agregarItem` llama `validarAceptaPedidos(producto.getComercio())` antes de agregar el ítem. |
| `backend/.../services/PedidoService.java` | Inyecta `ComercioService`; `confirmarPedido` llama `validarAceptaPedidos(comercio)` como segunda barrera (carrera de estados). |
| `frontend/js/catalogo.js` | Variable de módulo `comercioCerradoActual`, seteada en `initComercioDetalle`. `abrirModalProducto` no renderiza el stepper/botón "Agregar al carrito" si está cerrado — banner de aviso, mismo patrón visual que el de producto `AGOTADO` ya existente. |
| `frontend/js/checkout.js` | Import de `estadoHorario` desde `catalogo.js`. Chequeo al cargar el paso 1: si el comercio está cerrado, banner de error y `continuarBtn.disabled = true`. |

**Gap real encontrado de paso, no pedido:** `AuthService.propagarBloqueoAComercio` pone `Comercio.estado = CERRADO_TEMPORALMENTE` al bloquear la cuenta del comercio (3 intentos fallidos de login) — un carrito cargado antes del bloqueo podía seguir generando un pedido contra ese comercio, sin ningún chequeo hasta este tramo. Queda cubierto por el mismo `validarAceptaPedidos` (chequeo de `estado`), sin mecanismo aparte.

---

## Punto 2 (Prioridad 2) — `index.html` = catálogo (+ hallazgo: `splash.html` huérfano)

| Archivo | Cambio |
|---|---|
| `frontend/catalogo.html` → `frontend/index.html` | Renombrado (el catálogo pasa a ser el índice real de la app, logueado o no). |
| `frontend/index.html` → `frontend/bienvenida.html` | Renombrado (landing pre-login anterior; nombre elegido por Diego entre 3 opciones propuestas). |
| `frontend/bienvenida.html` | Botón "Explorar sin registrarme" → `index.html` (antes `catalogo.html`). |
| `frontend/splash.html` | **Huérfano, ningún archivo lo enlazaba** (hallazgo real de esta sesión). Corregido de paso por referenciar literalmente `index.html`/`catalogo.html`: sin sesión → `bienvenida.html`; CLIENTE → `index.html`; **`admin/pendientes.html` → `admin-dashboard.html`**; **`comercio/dashboard.html` → `comercio-dashboard.html`** (2 rutas rotas preexistentes, subcarpetas que nunca existieron, mismo patrón de bug ya corregido en `auth.js` en la Fase 16 Tramo 8 pero no acá, porque este archivo no estaba enlazado desde ningún flujo probado en ese momento). |
| `frontend/js/auth.js` | Línea 116 (`redirigirPostLogin` de CLIENTE): `catalogo.html` → `index.html`. |
| `frontend/js/carrito.js` | CTA de carrito vacío: `catalogo.html` → `index.html`. |
| `frontend/js/checkout.js` | CTA del modal de pedido confirmado: `catalogo.html` → `index.html`. |
| `frontend/js/pedidos.js` | CTA de estado vacío: `catalogo.html` → `index.html`. |
| `frontend/js/catalogo.js` | Bottom-nav: `Inicio` → `index.html` (antes `catalogo.html`); `Explorar` → `explorar.html` (antes también `catalogo.html`, sin distinción — ver Punto 5). |
| `frontend/errores/*.html` | Sin cambios — ya apuntaban a `../index.html`, y el archivo físico detrás de ese nombre pasa a ser el catálogo, comportamiento deseado sin tocar nada. |

---

## Punto 3 (Prioridad 2) — Header del catálogo sin ícono de perfil

| Archivo | Cambio |
|---|---|
| `frontend/js/catalogo.js` (`renderTopBar`) | Parámetro nuevo `mostrarPerfil = true` (default preserva el comportamiento existente en `perfil.html`/`comercio-perfil.html`, que también usan la rama por defecto de esta función compartida). El ícono de perfil solo se omite cuando se pasa `mostrarPerfil: false`. |
| `frontend/js/catalogo.js` (`initCatalogo`) | `renderTopBar(topBarSlot, { mostrarPerfil: false })`. |
| `frontend/js/explorar.js` (`initExplorar`) | Ídem, mismo criterio. |

La campana de notificaciones ya existía desde la Fase 16 Tramo 4 — sin cambios, solo confirmado que sigue ahí.

---

## Punto 4 (Prioridad 2) — Carrito flotante condicional por cantidad

| Archivo | Cambio |
|---|---|
| `frontend/js/catalogo.js` | `renderCarritoFab` (creaba el botón siempre para un Cliente logueado) y `actualizarBadgeCarritoFab` (solo el badge era condicional) se fusionan en una sola `actualizarBadgeCarritoFab` exportada: sin usuario CLIENTE o carrito vacío → el FAB se remueve del DOM si existe; con al menos 1 ítem → se crea si no existe y se actualiza el badge. Los 2 call-sites que llamaban `renderCarritoFab()` (`initCatalogo`, `initComercioDetalle`) pasan a llamar `actualizarBadgeCarritoFab()`. |

---

## Punto 5 (Prioridad 2) — `explorar.html` con filtros de categoría/tag + buscador

| Archivo | Cambio |
|---|---|
| `frontend/explorar.html` | Nuevo — buscador de texto + `chip-row` + `comercio-list`, mismo shell que `index.html`. |
| `frontend/js/explorar.js` | Nuevo — `initExplorar()`: `GET /catalogo/comercios` + `GET /catalogo/comercios/{id}/productos` por comercio en paralelo (`Promise.all`), deriva categorías/tags únicos de los productos (sin usar `GET /categorias`/`GET /tags`, que requieren rol autenticado desde la Fase 16 Tramo 6 y no sirven para un catálogo público), filtra comercios que tengan al menos un producto con la categoría/tag activa, más filtro de texto case-insensitive por `comercio.nombre`. Reusa `renderTopBar`/`renderBottomNav`/`actualizarBadgeCarritoFab`/`renderComercioCard`/`renderEmptyState` de `catalogo.js`. |
| `frontend/js/catalogo.js` | `renderComercioCard` y `renderEmptyState` pasan de privadas a `export function` para poder reusarlas desde `explorar.js`. |

Filtrado de productos sueltos entre comercios (no solo comercios) queda fuera de alcance, confirmado por Diego.

---

## Punto 6 (Prioridad 2) — Teléfono inválido no bloqueaba el step de `registro-cliente.html`

| Archivo | Cambio |
|---|---|
| `frontend/js/validators.js` | Función nueva `esTelefonoValido(telefono)` — puerto exacto (mismos pasos, mismos límites) del algoritmo de `backend/.../validation/validators/TelefonoArgentinoValidator.java`. |
| `frontend/js/auth.js` (`initRegistroCliente`) | Import de `esTelefonoValido`. Reemplaza la entrada de `telefono` en el array de `continuar-btn` (antes `validarCamposSilencioso` sin validador real, caía en `checkValidity()` nativo) por `validarCampo(..., esTelefonoValido, ...)`, mismo patrón que el resto de los campos del step 1. Suma `bindValidacionCampo('telefono', ...)` para validación on-blur. |

---

## Punto 7 (Prioridad 2) — Flecha del select desalineada (regresión del Tramo 16.13)

| Archivo | Cambio |
|---|---|
| `frontend/css/styles.css` | `.select-shell`: `justify-content: space-between` → `justify-content: flex-end`. Causa raíz real: el `<select>` es `position:absolute` (fuera del flujo), dejando solo la flecha SVG como hijo en flujo — `space-between` con un único ítem lo empuja al inicio, no es un problema del `<select>` nativo. Corrige uniformemente los 7 selects del proyecto (`registro-cliente.html` ×2, `registro-comercio.html` ×5, `comercio-producto-form.html` ×1) sin tocar HTML. |

---

## Punto 8 (Prioridad 3) — Componente OTP de 6 casilleros

| Archivo | Cambio |
|---|---|
| `frontend/js/otp.js` | Nuevo — `crearInputOtp(container, { onComplete })`: 6 `<input maxlength="1">` en `.otp-box`, auto-avance de foco, backspace retrocede el foco, paste de los 6 dígitos, auto-envío al completar (sin botón "Confirmar"), estados vacío/completo (check verde)/error. Expone `getValor()`/`focus()`/`reset()`/`marcarError()`. |
| `frontend/css/styles.css` | Reglas nuevas `.otp-row`/`.otp-box`/`.otp-input`/`.otp-box--filled`/`.otp-box--error`/`.otp-box__check`, con `--color-success`/`--color-success-bg`/`--color-error`/`--color-error-bg` ya existentes del proyecto (no los colores genéricos de la referencia visual). |
| `frontend/verificar-email.html` | Input único de 6 dígitos → `<div id="otp-container">`. |
| `frontend/reactivar-cuenta.html` | Ídem, dentro de `#confirmar-form` (sin restructurar en 2 pasos — ver Punto 10). |
| `frontend/recuperar-password.html` | Ídem, dentro del paso 1 del nuevo flujo de 2 pasos (ver Punto 10). |
| `frontend/js/auth.js` | `initVerificarEmail`, `initRecuperarPasswordSolicitar`, `initReactivarCuentaSolicitar` reescritas para usar `crearInputOtp` en vez de leer un `<input>` de texto libre. |

**Bug real encontrado y corregido durante la verificación (no pedido, encontrado en esta sesión):** el guard anti-doble-disparo de `onComplete` era un booleano (`notificado`), reseteado solo cuando el código volvía a estar incompleto. Si el usuario corregía un código incorrecto dígito por dígito (sin borrar todo primero), el valor nunca pasaba por un estado incompleto intermedio y `onComplete` no se volvía a disparar tras la corrección — quedaba trabado sin error visible. Corregido reemplazando el booleano por el último valor efectivamente notificado (`ultimoValorNotificado`), comparado por valor exacto en vez de por completitud.

---

## Punto 9 (Prioridad 3) — `verificar-email.html` con email de solo lectura

| Archivo | Cambio |
|---|---|
| `frontend/verificar-email.html` | Input de email pasa a `readonly` en el HTML estático. |
| `frontend/js/auth.js` (`initVerificarEmail`) | Si llega `?email=` por query param, precarga el valor y mantiene `readOnly = true`; si no llega (caso borde: acceso directo a la URL sin pasar por el registro), lo deja editable como fallback. |

---

## Punto 10 (Prioridad 3) — `recuperar-password.html` en 2 pasos reales + endpoint nuevo

| Archivo | Cambio |
|---|---|
| `backend/.../dto/request/ValidarCodigoRecuperacionRequestDTO.java` | Nuevo — `{email, codigo}`, mismas anotaciones que los 2 primeros campos de `ConfirmarRecuperacionPasswordRequestDTO`. |
| `backend/.../services/AuthService.java` | Método nuevo `validarCodigoRecuperacionPassword(request)` — reusa `obtenerTokenValidoPorCodigo(email, codigo, TipoToken.RECUPERACION_PASSWORD)` **sin** llamar `consumirToken`. Mismo límite de 5 intentos fallidos que los otros 2 tipos de token (heredado del método reusado, sin lógica nueva), sin tocar `Token.fechaVencimiento`. |
| `backend/.../controllers/AuthController.java` | `POST /api/v1/auth/recuperar-password/validar-codigo` (nuevo). |
| `backend/.../config/security/SecurityConfig.java` | `RUTAS_PUBLICAS` suma `/api/v1/auth/recuperar-password/validar-codigo`. |
| `frontend/recuperar-password.html` | Reestructurado: `codigo-container` pasa a tener un `step-progress` (mismo patrón que `registro-cliente.html`) con 2 `<section>` — `paso-codigo` (código OTP) y `paso-password` (nueva contraseña + confirmación, oculta hasta validar el código). |
| `frontend/js/auth.js` (`initRecuperarPasswordSolicitar`) | Reescrita: el `onComplete` del OTP llama a `validar-codigo`; si es válido, revela `paso-password` (actualiza `step-progress`); si no, error inline sobre el OTP sin avanzar. El submit final sigue llamando a `/recuperar-password/confirmar` (sin cambios en ese endpoint), que es el que efectivamente consume el token. |

`reactivar-cuenta.html` **no** se reestructuró en 2 pasos — su endpoint de confirmación no tiene segundo campo, ya es efectivamente 1 solo paso útil (solo recibió el componente OTP del Punto 8).

---

## Punto 11 (Prioridad 4) — DNI: `maxlength="8"`

| Archivo | Cambio |
|---|---|
| `frontend/registro-cliente.html` | Input `#dni` suma `maxlength="8"`, sin tocar la validación JS existente (`esDniValido`, ya acepta 7-8 dígitos). |

---

## Punto 12 (Prioridad 4) — Centrado en `comercio-detalle.html`

| Archivo | Cambio |
|---|---|
| `frontend/comercio-detalle.html` | `#comercio-info` suma la clase `comercio-info--center`. |
| `frontend/css/styles.css` | `.comercio-detail-header`/`.comercio-detail-header__body`/`.comercio-detail-header__top` (exclusivas de esta pantalla) pasan a layout de columna centrada. `.comercio-info--center` (modificador nuevo, **scoped**) centra `.comercio-info__row` y `.pill-row` solo dentro de esta pantalla — necesario porque esas 2 clases son compartidas con `admin-comercio-detalle.html` (vía `admin.js`), y centrarlas globalmente hubiera afectado esa pantalla, no pedido. `.comercio-description` (exclusiva de esta pantalla) suma `text-align: center`. |

El menú/chips de categoría y la lista de productos no se tocaron, según lo pedido.

---

## Verificado en esta sesión

- `./mvnw compile` → `BUILD SUCCESS` en cada bloque de cambios de Java (comercio cerrado, endpoint `validar-codigo`).
- Backend levantado con perfil `test` contra la base real; cuentas de prueba reales creadas: 1 Cliente (registro completo, verificación de email, login), 1 Comercio (registro completo, verificación, aprobado por Administrador, con 1 producto), reutilizando `admin@bajonea.ar` (contraseña de prueba fijada vía el flujo real de recuperación).
- Punto 1: `curl` autenticado como Cliente contra `POST /carrito/items` de un comercio cerrado → `409` real; modal de producto en navegador sin botón de agregar, banner visible.
- Punto 2: `splash.html` probado en navegador con sesión de Cliente (→ `index.html`) y sin sesión (→ `bienvenida.html`); botón "Explorar sin registrarme" de `bienvenida.html` → `index.html`.
- Punto 3/4: header sin ícono de perfil y campana presente, FAB ausente con carrito vacío y presente tras agregar un producto — todo con sesión de Cliente real, inspección de DOM (no solo visual).
- Punto 5: filtro por tag y buscador de texto probados contra los 2 comercios reales de la base.
- Punto 6: teléfono "123" bloquea el step con error real; teléfono válido avanza.
- Punto 7: estilo computado (`justifyContent: "flex-end"`) confirmado en los 3 archivos, 7 selects en total.
- Punto 8/9/10: flujo completo de `verificar-email.html` probado con teclado real (tecla por tecla); flujo completo de `recuperar-password.html` probado de punta a punta incluido el bug encontrado y su corrección, con login posterior confirmando la contraseña nueva. `reactivar-cuenta.html` verificado solo estructuralmente (ver limitación abajo).
- Punto 11/12: `maxLength` del input y estilos computados de centrado confirmados en navegador.
- `grep` sobre todo `frontend/` sin coincidencias de `catalogo.html` colgantes tras el renombre.
- Cero comentarios (`//`, `/* */`, `<!-- -->`) confirmado sobre los archivos nuevos/tocados en este tramo.

**Limitación documentada, no una falla de este tramo:** la confirmación real de `reactivar-cuenta.html` (`POST /auth/reactivar-cuenta/confirmar`) no se pudo ejercitar de punta a punta porque no existe, dentro del alcance actual del MVP, ningún mecanismo real para llevar una cuenta a `EstadoUsuario.INACTIVO` (sin suspensión de Administrador, sin job de inactividad — ambos fuera de alcance). Ver `docs/DECISIONES.md` para el detalle.

---

## Resumen numérico

| | Cantidad |
|---|---|
| Puntos del tramo | 12 |
| Archivos backend modificados | 5 (`ComercioService.java`, `CarritoService.java`, `PedidoService.java`, `AuthController.java`, `SecurityConfig.java`) |
| Archivos backend nuevos | 2 (`ValidarCodigoRecuperacionRequestDTO.java`, y el método nuevo en `AuthService.java` no cuenta como archivo nuevo) |
| Endpoints backend nuevos | 1 (`POST /auth/recuperar-password/validar-codigo`) |
| Bugs reales encontrados y corregidos durante la implementación (no reportados por Diego) | 2 (gap de `CERRADO_TEMPORALMENTE` en carrito/pedido; guard `onComplete` del componente OTP) |
| Archivos frontend renombrados | 2 (`catalogo.html` → `index.html`; `index.html` → `bienvenida.html`) |
| Archivos frontend nuevos | 3 (`explorar.html`, `js/explorar.js`, `js/otp.js`) |
| Archivos frontend modificados | 13 (`splash.html`, `js/auth.js`, `js/carrito.js`, `js/checkout.js`, `js/pedidos.js`, `js/catalogo.js`, `js/validators.js`, `css/styles.css`, `verificar-email.html`, `reactivar-cuenta.html`, `recuperar-password.html`, `registro-cliente.html`, `comercio-detalle.html`) |
| Verificado con sesión real de navegador | 11 de 12 puntos (todos salvo la confirmación final de `reactivar-cuenta.html`, limitación documentada arriba) |

Confirmado por Diego el 2026-07-28. No se hizo commit — queda a su criterio.
