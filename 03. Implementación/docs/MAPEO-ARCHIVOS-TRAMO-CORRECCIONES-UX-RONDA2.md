# Mapeo de archivos — Tramo: Correcciones UX/UI — Ronda 2 (7 puntos)

Fecha: 2026-09-04. Continuación directa del tramo "Correcciones UX/UI y Bugs Varios (15 puntos)" de la misma fecha. Detalle completo de decisiones y evidencia de verificación en `docs/DECISIONES.md`, entrada "Tramo de correcciones UX/UI — Ronda 2 (7 puntos)". Este archivo es solo el índice archivo por archivo — no repite el detalle de decisiones.

## Punto 4 — Regresión 500 en `admin-comercios-pendientes.html`

Sin cambios de código. Causa real: dato de prueba huérfano en `bajonea_final` (`comercio.id=68` con `dueno_id` inexistente), no un bug — confirmado que `AdministradorService.java` no fue tocado desde el último commit. Limpieza de datos aplicada directo en la base (con confirmación explícita de Diego), documentada en `docs/DECISIONES.md`.

## Punto 2 — `reactivar-cuenta.html` uniforme sin importar el estado real de la cuenta

- `backend/src/main/java/com/bajonea/backend/services/AuthService.java` — `solicitarReactivacionCuenta` genera siempre un token real y manda el email de código, sin importar el estado de la cuenta (antes solo lo hacía si `estado == INACTIVO`). `confirmarReactivacionCuenta` ahora solo muta `estado → ACTIVO` (+ `restaurarComercioSiCorresponde`) cuando el estado real es `INACTIVO` al momento de confirmar; para cualquier otro estado consume el token igual pero sin efecto real, devolviendo el mismo mensaje de éxito.
- `backend/src/main/java/com/bajonea/backend/services/EmailService.java` — `enviarCuentaYaActiva` eliminado (quedó sin ningún uso tras el cambio de arriba).

## Punto 3 — Mensaje de "superaste el máximo de intentos" no se limpiaba al reenviar

- `frontend/js/auth.js` — `initReactivarCuentaSolicitar`, handler de `reenviarBtn`: agrega `limpiarErrorCampo('error-codigo')` al éxito del reenvío.

## Punto 5 — Texto "(al menos una obligatoria)" en `comercio-producto-form.html`

- `frontend/comercio-producto-form.html` — hint de la galería de fotos: "Agregá hasta 5 fotos." → "Agregá hasta 5 fotos (al menos una obligatoria)."

## Punto 6 — Tarjeta de producto clickeable en `explorar.html`, abre el modal directo del producto

- `frontend/js/explorar.js` — `renderProductoCard`: la card pasa de `<div>` + botón "Ver" interno a un único `<button>` que ocupa toda la tarjeta, navega a `comercio-detalle.html?id={comercioId}&producto={productoId}`. Botón "Ver" (`.explore-product-card__cta`, `data-testid="btn-ver-en-comercio-*"` del Punto 13 de la ronda anterior) eliminado.
- `frontend/js/catalogo.js` — `initComercioDetalle`: lee el query param `producto` y llama a `abrirModalProducto(...)` automáticamente si encuentra el producto correspondiente en la lista ya cargada.
- `frontend/css/styles.css` — `.explore-product-card` reseteada como botón (`border:none`, `width:100%`, `text-align:left`, `cursor:pointer`, `font:inherit`, `color:inherit`; se quita el `padding-bottom` reservado para la CTA absoluta); `.explore-product-card__cta` eliminada.

## Punto 7 — Tarjeta completa clickeable en `notificaciones.html`

- `frontend/js/notificaciones.js` — `renderNotificacion`: el `href` de destino (cuando `entidadTipo === 'PEDIDO'`) pasa a variable de closure; el listener de click de toda la tarjeta (ya existía, antes solo marcaba como leída) ahora también navega a ese `href`. El link "Ver pedido" no se modificó ni se quitó.

## Punto 1 — Ajustes de texto/estilo en `comercio-pendiente.html`

- `frontend/comercio-pendiente.html` — párrafo "Te vamos a avisar por email..." eliminado; texto de la card extendido con "Te informaremos vía email"; botón "Ir a la pantalla principal" pasa de `.btn-tertiary` a `.btn-primary`.

## Verificación

Backend: `curl`/`SELECT`/`INSERT` directo contra `bajonea_final` real, un reinicio del backend a mitad de sesión para levantar el fix de `AuthService`/`EmailService`, `./mvnw compile` → `BUILD SUCCESS`. Frontend: navegador real contra el dev server (`http://localhost:5501`) y el backend real, con `node --check` sobre copias `.mjs` de los 4 `.js` tocados. Datos de prueba (comercio huérfano del Punto 4, 3 cuentas descartables de los Puntos 2 y 7) eliminados al finalizar, `SELECT COUNT(*) = 0` confirmado.
