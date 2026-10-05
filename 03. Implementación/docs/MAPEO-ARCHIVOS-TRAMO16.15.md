# Mapeo pantallas ↔ archivos — Tramo 16.15 (tercera ronda de testing manual, 14 puntos)

Tramo de corrección, no un tramo de contenido nuevo de la guía — 14 puntos de una tercera ronda de testing manual sobre Cliente y pantallas generales, varios de ellos ajustes finos sobre el componente OTP introducido en el Tramo 16.14. Mismo formato que `docs/MAPEO-ARCHIVOS-TRAMO16.14.md`: se mapea punto↔archivos en vez de pantalla↔archivos.

Todo lo documentado acá fue verificado con interacción real en navegador contra el backend real (perfil `test`, 1 cuenta Cliente real creada para esta sesión y eliminada de la base al finalizar) — 3 bugs reales encontrados y corregidos en el camino, ninguno pedido explícitamente: el guard `marcarError()` faltante en `verificar-email.html` para el caso de código incorrecto (401), el contador de intentos de login que vivía solo en el frontend (punto 12), y una condición de carrera en el buscador de `explorar.html` (punto 14) detectada recién al implementar la paginación.

---

## Punto 1 (General) — Header con logo centrado en 3 pantallas

| Archivo | Cambio |
|---|---|
| `frontend/login.html` | Flecha de volver quitada; header pasa a `app-header app-header--brand` (clase ya existente, usada en `comercio-pendiente.html`/`comercio-rechazado.html`), que centra el logo vía `justify-content: center` al ser el único hijo. |
| `frontend/recuperar-password.html` | Flecha se mantiene; header suma la clase nueva `app-header--logo-centrado`. |
| `frontend/reactivar-cuenta.html` | Ídem. |
| `frontend/css/styles.css` | Regla nueva `.app-header--logo-centrado .header-logo` (`position: absolute; left: 50%; transform: translateX(-50%)`, mismo mecanismo que `.app-header__title`) — necesaria porque con una flecha presente, `justify-content: center` no alcanza para centrar el logo respecto al header completo. Scoped a la clase nueva para no afectar `registro-tipo-cuenta.html`, que tiene el mismo patrón (flecha + logo) pero queda fuera de alcance de este tramo a propósito. |

---

## Punto 2 (General) — Componente OTP: color solo por resultado real del backend

| Archivo | Cambio |
|---|---|
| `frontend/js/otp.js` | Reescrito: `actualizarEstado()` ya no colorea casillero por casillero al completarse cada dígito. Método nuevo `marcarExito()` (simétrico a `marcarError()`, ya existente) — colorea los 6 casilleros de verde con check. `limpiarEstados()` (antes `limpiarError()`) limpia tanto error como éxito al tipear de nuevo. |
| `frontend/css/styles.css` | Clase `.otp-box--filled` renombrada a `.otp-box--exito` en sus 2 reglas (`.otp-box--exito .otp-input`, `.otp-box--exito .otp-box__check`) — el nombre anterior ya no describe el estado real (ya no se activa por tener un dígito tipeado). |
| `frontend/js/auth.js` | `otp.marcarExito()` agregado justo después de la llamada exitosa al backend en los 3 flujos: `initVerificarEmail` (antes de mostrar `estado-exito`), `initRecuperarPasswordSolicitar` (antes de `mostrarPasoPassword()`), `initReactivarCuentaSolicitar` (antes de mostrar `exito-container`). |

**Bug real encontrado y corregido durante la verificación (no pedido):** el catch de `initVerificarEmail` solo llamaba `otp.marcarError()` en la rama `409` (código vencido/máximo de intentos superado). El caso real y más común — código incorrecto con intentos disponibles — devuelve **401** (`"Código incorrecto. Te quedan N intento(s)."`), y los casilleros se quedaban en gris en vez de rojo, contradiciendo directamente el punto 2. Corregido para que `otp.marcarError()` se llame siempre que la validación del código falle (mismo patrón que ya usaban, correctamente, `initRecuperarPasswordSolicitar` y `initReactivarCuentaSolicitar`), con una rama nueva explícita para 401 que muestra el mensaje real del backend en `error-codigo`.

---

## Punto 3 (General) — Texto "6 dígitos, sin espacios" quitado

| Archivo | Cambio |
|---|---|
| `frontend/reactivar-cuenta.html` | `<p class="field__hint">6 dígitos, sin espacios.</p>` eliminado. |
| `frontend/verificar-email.html` | Nunca tuvo un `field__hint` propio para el código en la versión rediseñada de este tramo (ver Punto 7) — cubierto de paso. |

`recuperar-password.html` no tenía ese texto (verificado, no requería cambio).

---

## Punto 4 (Cliente) — Mensajes de error de DNI/Fecha de nacimiento simplificados

| Archivo | Cambio |
|---|---|
| `frontend/js/auth.js` (`initRegistroCliente`) | `bindValidacionCampo`/`validarCampo` de `dni`: mensaje → "Ingresá un DNI válido." (antes mencionaba "7 u 8 dígitos"). `fechaNacimiento`: mensaje → "Ingresá una fecha de nacimiento válida." (antes mencionaba mayoría de edad y fecha futura). Cada uno tenía 2 ocurrencias (validación on-blur + validación al continuar), las 2 corregidas. |

Nombre/Apellido ("solo letras, espacios y guiones") **sin tocar** — Diego confirmó que era una duda propia sobre por qué se permiten guiones (apellidos compuestos), no un pedido de cambio de código.

---

## Punto 5 (Cliente) — Link "¿Sos un comercio?" quitado de `registro-cliente.html`

| Archivo | Cambio |
|---|---|
| `frontend/registro-cliente.html` | `<p class="form-footer-link form-footer-link--small">¿Sos un comercio?...</p>` eliminado (ya se había quitado de `index.html`/`bienvenida.html` en un tramo anterior). |

---

## Punto 6 (Cliente) — Toasts nativos eliminados en el step 2 de `registro-cliente.html`

| Archivo | Cambio |
|---|---|
| `frontend/registro-cliente.html` | `<form id="form-step-2">` suma `novalidate` (no lo tenía — causa raíz real de los toasts nativos en Calle/Número/CP/Provincia/Localidad, los únicos 5 campos del step 2). Campo Provincia suma `<div class="field__error" id="error-provincia">` (no existía). |
| `frontend/js/auth.js` (`initRegistroCliente`) | Validación de Provincia agregada al submit del step 2 (`validarCamposSilencioso`, junto a Localidad). Listeners `change` en Provincia/Localidad para limpiar su error al reseleccionar. Mensaje de Número: "El número debe ser numérico." → "Solo se permiten números." (2 ocurrencias: on-blur + submit). |

Registro completo probado end-to-end en navegador (datos reales, dirección real de Río Grande) sin ningún toast nativo del navegador.

---

## Punto 7 (Cliente) — `verificar-email.html` rediseñada

| Archivo | Cambio |
|---|---|
| `frontend/verificar-email.html` | Reescrita: header sin flecha con logo centrado (Punto 1); campo de email (antes `readonly` con estilo de campo rellenable) reemplazado por `<p id="verificar-texto">`, texto fijo interpolado con el email real; único elemento interactivo de la pantalla es el componente OTP. |
| `frontend/js/auth.js` (`initVerificarEmail`) | Reescrita: el email ya no se lee de un `<input>`, se lee una sola vez de `?email=` y se interpola en `verificar-texto`. Si no hay `?email=` en la URL, se muestra la pantalla de error existente con un mensaje explicando que hay que volver a loguearse/registrarse (sin reintroducir un campo editable). |
| `frontend/js/auth.js` (`initLogin`, rama 409 "Verificá tu email...") | El link a `verificar-email.html` del banner de error pasa a incluir `?email=<el que el usuario tipeó>` (antes iba sin parámetro). Necesario para no perder el único caso legítimo de llegar a esta pantalla sin conocer el email de antemano — con este fix, todo camino real hacia `verificar-email.html` llega con el email en la URL. |

---

## Punto 8 (Cliente) — `perfil.html`: campana en vez de ícono de perfil

| Archivo | Cambio |
|---|---|
| `frontend/js/cliente.js` (`initPerfil`) | `renderTopBar(slot)` → `renderTopBar(slot, { mostrarPerfil: false })`. La campana de notificaciones ya se renderizaba sin condicionar a `mostrarPerfil` (solo al rol CLIENTE), así que queda visible sin cambios en `catalogo.js`. |

---

## Punto 9 (General) — Auditoría de mensajes de error en minúscula

| Archivo | Cambio |
|---|---|
| 19 DTOs de `backend/.../dto/request/`: `ClienteEditarPerfilRequestDTO`, `CambioPasswordPerfilRequestDTO`, `CategoriaRequestDTO`, `ComercioPerfilRequestDTO`, `ConfirmarRecuperacionPasswordRequestDTO`, `ConfirmarReactivacionCuentaRequestDTO`, `DireccionRequestDTO`, `FotoPerfilComercioRequestDTO`, `ImagenProductoRequestDTO`, `LoginRequestDTO`, `ProductoRequestDTO`, `ReactivacionCuentaRequestDTO`, `ReenviarVerificacionRequestDTO`, `RecuperacionPasswordRequestDTO`, `RegistroClienteRequestDTO`, `RegistroComercioRequestDTO`, `TagRequestDTO`, `ValidarCodigoRecuperacionRequestDTO`, `VerificarCodigoRequestDTO` | Los ~50 usos de `@NotBlank`/`@NotEmpty` sin `message` custom (confirmado por `grep` sobre todo `src/main/java`) devolvían el mensaje default de Hibernate Validator en español, `"no debe estar vacío"` — el caso reportado en `perfil.html` era solo la punta visible de un problema sistémico. Los 19 archivos suman `message = "No debe estar vacío"` (mismo texto, solo la mayúscula inicial) a cada anotación bare. |

**Gap identificado y deliberadamente NO corregido en este tramo:** otras anotaciones sin `message` (`@NotNull`, `@Email`, `@Size`, `@Positive`, `@PositiveOrZero`, `@Digits`, `@PastOrPresent`) tienen el mismo problema — sus mensajes default de Hibernate Validator también empiezan en minúscula. Corregirlas implica escribir texto nuevo (no solo capitalizar el existente, que sí pude verificar con confianza para `@NotBlank`/`@NotEmpty`), así que quedan señaladas para una decisión aparte de Diego, no asumidas silenciosamente.

---

## Punto 10 (Cliente) — Formato de teléfono consistente entre registro y edición de perfil

| Archivo | Cambio |
|---|---|
| `frontend/perfil.html` | Campo `#editar-telefono`: input suma `<span class="input-prefix">+54 9</span>` antes del `<input>` (mismo patrón ya usado en `comercio-perfil.html`), `inputmode="numeric"` y `placeholder="2964 000000"`. |
| `frontend/js/cliente.js` | Import de `construirTelefono` desde `auth.js`. Al abrir "Editar Datos Personales": `cliente.telefono.replace(/^\+549/, '')` (antes precargaba el valor crudo completo, con el prefijo, dentro de un input sin el span de prefijo — de ahí la inconsistencia visual). Al guardar: `construirTelefono(...)` reconstruye el formato completo antes de enviarlo al backend. |

---

## Punto 11 (Cliente) — Cambio de contraseña: campo de confirmación + error de contraseña actual

| Archivo | Cambio |
|---|---|
| `frontend/perfil.html` | Campo nuevo `#password-confirmar` (con su toggle de mostrar/ocultar y `#error-password-confirmar`) en el formulario de cambio de contraseña. |
| `frontend/js/cliente.js` | Validación de coincidencia `password-nueva` === `password-confirmar` antes de enviar al backend (mismo patrón que `registro-cliente.html`/`recuperar-password.html`). |

El error inline para "contraseña actual incorrecta" **ya existía** en el código (rama `error.status === 401`) — verificado en vivo que se muestra correctamente, no fue necesario agregarlo.

---

## Punto 12 (Cliente) — Login: contador de intentos real y dinámico

| Archivo | Cambio |
|---|---|
| `backend/.../exceptions/CredencialesInvalidasException.java` | Suma un campo opcional `data` (constructor de 1 argumento delega en uno de 2, con `data = null`) + `getData()`. |
| `backend/.../exceptions/GlobalExceptionHandler.java` | `handleCredencialesInvalidas` usa `ex.getData()` en vez de `null` fijo. |
| `backend/.../services/AuthService.java` | `registrarIntentoFallido` pasa de `void` a `int` (devuelve los intentos restantes = `MAX_INTENTOS_FALLIDOS - intentos`, nunca negativo). `login()` y `cambiarPasswordDesdePerfil()` (mismo bug, mismo mecanismo subyacente) arman `CredencialesInvalidasException` con `Map.of("intentosRestantes", intentosRestantes)`. |
| `frontend/js/auth.js` (`initLogin`) | Contador client-side `intentosConsecutivos` eliminado por completo. El aviso de bloqueo ahora lee `error.data.intentosRestantes` de la respuesta real y solo se muestra cuando vale `1` (último intento antes del bloqueo), con el número correcto embebido en el texto. |
| `frontend/js/cliente.js` | Mismo fix aplicado al cambio de contraseña desde perfil (mismo bug exacto, mismo `registrarIntentoFallido` de por medio) — no pedido explícitamente para este flujo, pero es el mismo código subyacente y quedaba con el mismo problema. |

**Bug real:** el aviso "si fallás una vez más..." se basaba en un contador `let` puramente client-side, reseteado a `0` en cada recarga de página — podía mostrarse de más (tras un reload a mitad de los intentos) o directamente nunca mostrarse, sin relación real con los intentos que el backend efectivamente tenía contados. Corregido para que el backend sea la única fuente de verdad. Verificado en vivo la secuencia completa con una cuenta real: intento 1 (sin aviso) → intento 2 (aviso "1 vez más", una sola vez) → intento 3 (sin aviso adicional, cuenta bloqueada en el backend) → intento 4 (`409` "Cuenta bloqueada").

---

## Punto 13 (Cliente) — `carrito.html`: botón "Vaciar" en vez de ícono de tacho

| Archivo | Cambio |
|---|---|
| `frontend/js/carrito.js` | Botón de vaciar carrito: clase `cart-item__remove` + ícono SVG de tacho → clase nueva `cart-vaciar-btn` + texto "Vaciar". Los tachos de cada ítem individual no se tocaron. |
| `frontend/css/styles.css` | Regla nueva `.cart-vaciar-btn` — texto en `var(--color-text)` (`#1a1a1a`, negro), sin fondo ni borde. |

---

## Punto 14 (Cliente) — `explorar.html`: productos en vez de comercios (+ endpoint nuevo)

Cambio de alcance real sobre lo implementado en el Tramo 16.14 — confirmado con Diego antes de tocar el backend, con el agregado del botón "Ver en comercio →" acordado en esa misma confirmación.

| Archivo | Cambio |
|---|---|
| `backend/.../dto/response/ProductosPaginadosResponseDTO.java` | Nuevo — `{productos, paginaActual, totalPaginas, totalProductos}`. |
| `backend/.../dto/response/CategoriaFiltroResponseDTO.java` | Nuevo — variante liviana de `CategoriaResponseDTO` (`{id, nombre}`, sin `activo`/`cantidadProductos`, que son admin-only y cuentan productos de cualquier comercio, no solo los visibles públicamente). |
| `backend/.../dto/response/FiltrosCatalogoResponseDTO.java` | Nuevo — `{categorias: List<CategoriaFiltroResponseDTO>, tags: List<String>}`. |
| `backend/.../repositories/ProductoRepository.java` | Método nuevo `findByComercio_EstadoAndEstadoNot(EstadoComercio, EstadoProducto)` — productos de todos los comercios `APROBADO`, excluidos los `DESCONTINUADO`. |
| `backend/.../services/ProductoService.java` | Métodos nuevos `listarCatalogoGlobal(categoriaId, tagId, busqueda, pagina)` (filtra por categoría/tag/texto, mezcla con `Collections.shuffle` — sin `ORDER BY RAND()` en SQL, catálogo del MVP chico, mismo criterio que el resto del catálogo público de filtrar en memoria — y pagina de a 20) y `listarFiltrosDisponibles()` (categorías/tags realmente en uso, independiente de la paginación). |
| `backend/.../services/CatalogoService.java` | 2 métodos delegados nuevos: `listarProductosGlobal(...)`, `listarFiltrosDisponibles()`. |
| `backend/.../controllers/CatalogoController.java` | `GET /catalogo/productos?categoriaId=&tagId=&q=&pagina=` y `GET /catalogo/filtros` — ambos bajo `/api/v1/catalogo/**`, ya público en `SecurityConfig`, sin cambios de seguridad necesarios. |
| `frontend/explorar.html` | Reescrita: `#producto-list` (antes `#comercio-list`) y `#pagination-slot` nuevo. Buscador ahora busca "producto por nombre" (antes "comercio por nombre"). |
| `frontend/js/explorar.js` | Reescrito: consume `GET /catalogo/filtros` una vez al cargar (para los chips, independiente de la paginación) y `GET /catalogo/productos` en cada cambio de filtro/búsqueda/página. Tarjeta de producto (`renderProductoCard`) muestra imagen, nombre, precio, nombre del comercio y un botón "Ver en comercio →" — la tarjeta en sí **no** es clickeable, solo el botón dispara la navegación a `comercio-detalle.html?id=<comercioId>` (confirmado con Diego). `renderPaginacion` con "Anterior"/"Siguiente" + "Página X de Y", oculta si hay 1 sola página. |
| `frontend/css/styles.css` | Reglas nuevas `.explore-product-card`/`__thumb`/`__thumb--agotado`/`__body`/`__price`/`__comercio`/`__cta` y `.explore-pagination`/`__label`/`__btn`. El botón "Ver en comercio →" usa `color: var(--color-primary)` (`#ff4700`), la variable de color naranja ya existente del proyecto — verificado en navegador (`rgb(255, 71, 0)`), sin ningún valor hardcodeado nuevo. |

**Bug real encontrado y corregido durante la verificación (no pedido, detectado recién al probar el buscador con búsquedas rápidas sucesivas):** `cargarYPintar()` no tenía ningún mecanismo de secuenciación de requests — si dos búsquedas disparaban sus fetches casi en simultáneo y las respuestas volvían en un orden distinto al que se dispararon, la búsqueda vieja podía pintar sus resultados (o su estado vacío) *después* de la búsqueda nueva, dejando la pantalla con resultados incorrectos o desactualizados. Corregido con un token de secuencia (`solicitudActual`/`solicitudId`): cada llamada se identifica al iniciar, y si al recibir la respuesta ya no es la más reciente, se descarta sin tocar el DOM. Verificado en vivo reproduciendo la carrera original (2 búsquedas disparadas con ~300ms de diferencia) y confirmando que el resultado final siempre corresponde a la última búsqueda, no a la que responda primero.

---

## Verificado en esta sesión

- `./mvnw clean compile` → `BUILD SUCCESS` en cada bloque de cambios de Java (auditoría de mensajes, contador de intentos, catálogo global de productos).
- Backend levantado con perfil `test` contra la base real; 1 cuenta Cliente real creada, verificada, logueada, editada y eliminada de la base al finalizar la sesión.
- Punto 1: `getBoundingClientRect()` del header y del logo comparados en las 3 pantallas — centro horizontal idéntico en los 3 casos, con y sin flecha presente.
- Punto 2: registro completo → código incorrecto (401 real) → los 6 casilleros en rojo con el mensaje real del backend → retipeo limpia el error → código correcto (vía `GET /test/token`) → cuenta verificada.
- Punto 4/5/6: mensajes de error confirmados por `dispatchEvent('blur')` real sobre los inputs; registro completo de un Cliente real (con dirección real de Río Grande) sin ningún toast nativo.
- Punto 7: `verificar-texto` interpolado con el email real confirmado; sin `<input id="email">` en el DOM.
- Punto 8: `top-bar__action` del DOM de `perfil.html` confirmado con un solo elemento (`notificaciones.html`), sin link a `perfil.html`.
- Punto 9: `PUT /clientes/perfil` con `nombre: ""` real contra el backend → `"No debe estar vacío"` con mayúscula, confirmado en la respuesta HTTP real.
- Punto 10: teléfono editado, guardado, reabierto — formato `2964555555` (sin prefijo) consistente en las 2 pantallas.
- Punto 11: contraseñas no coincidentes → error inline real; contraseña actual incorrecta → error inline real (ya existía); cambio exitoso → redirección a `login.html?passwordActualizada=1` confirmada.
- Punto 12: secuencia completa de 4 intentos fallidos con una cuenta real, contador dinámico confirmado en cada paso (incluida la recuperación de la cuenta bloqueada vía el flujo real de recuperación de contraseña para poder seguir probando).
- Punto 13: clase `cart-vaciar-btn` confirmada en el DOM real de un carrito con productos agregados vía API, color computado `rgb(26, 26, 26)`.
- Punto 14: `GET /catalogo/filtros` y `GET /catalogo/productos` probados con `curl` contra el backend real; navegación real desde el botón "Ver en comercio →" hasta `comercio-detalle.html?id=39` confirmada (`window.location.href` verificado); tarjeta confirmada no-clickeable (`cursor: auto`, no es un link ni tiene handler propio); buscador probado con resultado positivo, negativo, y la corrección de la condición de carrera.
- Cero comentarios (`//`, `/* */`, `<!-- -->`) confirmado sobre los archivos nuevos/tocados en este tramo.

---

## Resumen numérico

| | Cantidad |
|---|---|
| Puntos del tramo | 14 |
| Archivos backend modificados | 22 (19 DTOs del Punto 9 + `CredencialesInvalidasException.java`, `GlobalExceptionHandler.java`, `AuthService.java`, `ProductoRepository.java`, `ProductoService.java`, `CatalogoService.java`, `CatalogoController.java` — 7 de estos últimos sin contar los 19 del Punto 9) |
| Archivos backend nuevos | 3 (`ProductosPaginadosResponseDTO.java`, `CategoriaFiltroResponseDTO.java`, `FiltrosCatalogoResponseDTO.java`) |
| Endpoints backend nuevos | 2 (`GET /catalogo/productos`, `GET /catalogo/filtros`) |
| Bugs reales encontrados y corregidos durante la implementación (no reportados por Diego) | 3 (guard `marcarError()` faltante en `verificar-email.html`; contador de intentos de login solo client-side; condición de carrera en el buscador de `explorar.html`) |
| Archivos frontend modificados | 10 (`js/otp.js`, `css/styles.css`, `login.html`, `recuperar-password.html`, `reactivar-cuenta.html`, `js/auth.js`, `registro-cliente.html`, `perfil.html`, `js/cliente.js`, `js/carrito.js`) |
| Archivos frontend reescritos por completo | 3 (`verificar-email.html`, `explorar.html`, `js/explorar.js`) |
| Verificado con sesión real de navegador | 14 de 14 puntos |

Pendiente de confirmación final de Diego antes de cerrar el tramo. No se hizo commit.
