# Mapeo de archivos — Tramo: Correcciones UX/UI y Bugs Varios (15 puntos)

Fecha: 2026-09-04. Detalle completo de decisiones y evidencia de verificación en `docs/DECISIONES.md`, entrada del mismo día ("Tramo de correcciones UX/UI y bugs varios (15 puntos)"). Este archivo es solo el índice archivo por archivo — no repite el detalle de decisiones.

## Punto 01 — "Cerrado ahora · Cerrado hoy" duplicado

- `frontend/js/catalogo.js` — `estadoHorario()` suma el flag `cerradoTodoElDia`; el render de `comercio-detalle.html` (mismo archivo, más abajo) lo usa para no concatenar los dos textos.

## Punto 02 — Modal de bloqueo por contraseña incorrecta

- `frontend/js/api.js` — `showSesionCerradaModal`/nueva `mostrarModalCuentaBloqueada` refactorizadas sobre un constructor compartido `crearModalSesionCerrada()`.
- `frontend/js/catalogo.js` — nueva función exportada `manejarBloqueoPorCambioPassword(error)`, compartida entre Cliente y Comercio.
- `frontend/js/cliente.js` — catch de `cambiar-password` usa la función compartida.
- `frontend/js/comercio.js` — ídem.

## Punto 03 — Textos del paso Horarios en registro de Comercio

- `frontend/registro-comercio.html` — "Ya cargaste" → "Tus horarios"; se quita "(ej. horario cortado)" del hint de formato 24hs.

## Punto 04 — Rediseño de `comercio-pendiente.html`

- `frontend/comercio-pendiente.html` — `.revision-alert` reestructurado a card horizontal (ícono + texto + pill).
- `frontend/css/styles.css` — nuevas clases `.revision-alert__icon`, `.revision-alert__body`, `.revision-alert__title`, `.revision-alert__text`, `.revision-alert__pill`; `.revision-alert` reescrita (antes vertical/centrada, ahora horizontal con borde).

## Punto 05 — "Río Grande" → "Tierra del Fuego"

- `frontend/js/catalogo.js:480`
- `frontend/js/explorar.js:136`
- `frontend/index.html:6`
- `backend/src/main/java/com/bajonea/backend/config/OpenApiConfig.java` — además se quitó el sufijo "— MVP" (ya no aplica desde la enmienda §1bis).

## Punto 06 — Contador de intentos en `reactivar-cuenta.html`

- `backend/src/main/java/com/bajonea/backend/services/AuthService.java` — `obtenerTokenValidoPorCodigo` ahora agrega `data.intentosRestantes` al `CredencialesInvalidasException` de código incorrecto (antes solo iba en el texto del mensaje).
- `frontend/js/otp.js` — nuevo método `setDisabled(bool)` en el objeto devuelto por `crearInputOtp`.
- `frontend/js/auth.js` — `initReactivarCuentaSolicitar`: nueva variable `intentosAgotados`, deshabilita `confirmarSubmitBtn` + OTP al recibir `409`, los reactiva en un reenvío exitoso.

## Punto 07 — Quitar "Cambiar foto" de `admin-dashboard.html`

- `frontend/admin-dashboard.html` — se quita el botón `cambiar-foto-admin-btn` y su `<input type="file">`.
- `frontend/js/admin.js` — se quita el handler correspondiente y los imports que quedaron sin uso (`validarArchivoImagen`, `subirFotoPerfilUsuario`, `CloudinaryUploadError` de `cloudinary.js`; `abrirEditorRecorte` de `crop.js`).

## Punto 08 — Badge de comercios pendientes no debe mostrarse en 0

- `frontend/js/admin.js` — `initAdminComerciosPendientes`: `headerBadge.style.display` condicional a `comercios.length > 0`.

## Punto 09 — Motivo de rechazo en `comercio-rechazado.html`

- `backend/src/main/java/com/bajonea/backend/repositories/HistorialEstadoComercioRepository.java` — nuevo finder `findTopByComercioIdOrderByFechaHoraDesc`.
- `backend/src/main/java/com/bajonea/backend/dto/response/ComercioResponseDTO.java` — nuevo campo `motivoRechazo` (nullable).
- `backend/src/main/java/com/bajonea/backend/services/ComercioService.java` — nueva dependencia `HistorialEstadoComercioRepository`, nuevo método privado `obtenerMotivoRechazo`, usado en `aResponseDTO`.
- `frontend/comercio-rechazado.html` — nuevo slot `#motivo-rechazo-slot`, poblado con el componente `.aviso-punto--rechazo` cuando `comercio.motivoRechazo` existe.

## Punto 10 — Modal de foto en `comercio-perfil.html`

- `frontend/comercio-perfil.html` — avatar de la vista principal pasa a `<button>` + `<input type="file">` propio; se quita el bloque de foto de "Editar datos del comercio" (`editar-avatar`, `input-avatar` viejo, `cambiar-foto-btn`).
- `frontend/js/comercio.js` — nueva función `mostrarModalFotoPerfilComercio({ onEditar })` (sin opción de eliminar); `initComercioPerfil` reescribe el manejo de avatar/`input-avatar` sobre la nueva ubicación y agrega el click-to-open-modal.

## Punto 11 — Foto obligatoria en producto

- `frontend/comercio-producto-form.html` — nuevo `div.field__error#error-producto-fotos`.
- `frontend/js/comercio.js` — `renderGaleria()` deshabilita `guardar-producto-btn` cuando no hay fotos; submit del formulario valida mínimo 1 foto (create y edit) antes de continuar; `limpiarErrorCampo('error-producto-fotos')` al agregar una foto.
- `backend/src/main/java/com/bajonea/backend/services/ProductoService.java` — `editarProducto` rechaza con `ConflictoDeNegocioException` (409) si `imagenProductoRepository.countByProductoId(productoId) == 0`.

## Punto 12 — Foto opcional en registro de Cliente

- `frontend/registro-cliente.html` — nuevo `<span class="field__label-badge field__label-badge--opcional">Opcional</span>`.
- `frontend/css/styles.css` — nueva clase `.field__label-badge--opcional` (gris `#8a8580`).

## Punto 13 — "Ver en comercio" → "Ver" en `explorar.html`

- `frontend/js/explorar.js` — texto del CTA a "Ver", se mueve fuera de `.explore-product-card__body` (hijo directo de la card).
- `frontend/css/styles.css` — `.explore-product-card` con `position:relative` + `padding-bottom`; `.explore-product-card__cta` reposicionado con `position:absolute` (esquina inferior derecha).

## Punto 14 — Overflow de `DECIMAL(10,2)` en subtotal/total

- `backend/src/main/java/com/bajonea/backend/services/PedidoService.java` — nueva constante `SUBTOTAL_MAXIMO`, validación por ítem y sobre el total antes de persistir `Pedido`/`DetallePedido` (`ValidacionException` → 400).
- `frontend/js/carrito.js` — nueva constante `SUBTOTAL_MAXIMO_ITEM`; el click del botón "+" del stepper bloquea el incremento y muestra un toast cuando `precio × cantidad` superaría el máximo.
- `frontend/js/checkout.js` — **sin cambios**: el catch genérico ya existente (`renderBanner` con `error.message`) alcanza para mostrar el nuevo 400 de forma clara, confirmado por lectura de código (antes hubiera sido un 500 interceptado por el redirect genérico de `apiFetch`).

## Punto 15 — Color del badge "X nuevo" en `comercio-dashboard.html`

- `frontend/js/comercio.js` — `renderPedidosActivos`: la clase del badge pasa de `status-badge--pendiente` a `status-badge--nueva` (ambas ya existentes en `styles.css`, sin CSS nueva).

## Archivos tocados que no correspondían a ningún punto individual

- `docs/DECISIONES.md` — entrada de cierre de este tramo.
- Este archivo (`docs/MAPEO-ARCHIVOS-TRAMO-CORRECCIONES-UX-15PTS.md`).

## Verificación

Evidencia real completa (curl, SELECT/INSERT contra `bajonea_final`, capturas de navegador) documentada en `docs/DECISIONES.md`. Resumen de cobertura:

| Punto | Backend verificado | Frontend verificado |
|---|---|---|
| 01 | — | ✅ navegador (comercio real sin horario de hoy) |
| 02 | ✅ curl + SQL | ✅ navegador end-to-end |
| 03 | — | Cambio textual directo, sin lógica |
| 04 | — | ✅ navegador (cuenta de prueba PENDIENTE) |
| 05 | ✅ (`OpenApiConfig`, revisión de código) | ✅ navegador (título de `index.html`) |
| 06 | ✅ curl (mecanismo compartido vía `VERIFICACION_EMAIL`) | Solo revisión de código (requeriría cuenta INACTIVO real) |
| 07 | N/A (sin cambios de backend) | Solo revisión de código — sin credenciales de Administrador |
| 08 | N/A | Solo revisión de código — sin credenciales de Administrador |
| 09 | ✅ curl + SQL | ✅ navegador |
| 10 | N/A (sin cambios de backend) | ✅ navegador |
| 11 | ✅ curl | ✅ navegador (botón deshabilitado) |
| 12 | N/A | ✅ navegador |
| 13 | N/A | ✅ navegador (click real navega) |
| 14 | ✅ curl + SQL (sin pedido huérfano) | ✅ navegador (toast real) |
| 15 | N/A | Solo revisión de código — sin pedido PENDIENTE real a mano |

**Pendiente de confirmación explícita de Diego** antes de dar el tramo por cerrado, en particular los puntos 07/08/15 (sin verificación visual en esta sesión).
