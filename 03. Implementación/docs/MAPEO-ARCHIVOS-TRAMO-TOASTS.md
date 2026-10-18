# Mapeo de archivos — Toast de éxito en toda acción que modifica datos

Fecha: 2026-10-15. Regla de Diego: toda acción que modifica datos y termina bien muestra un toast, en toda la app y en todos los roles, para que la persona sepa que su acción se hizo. Quedan fuera las acciones que solo navegan (iniciar sesión, cerrar sesión, cambiar de cuenta) y las que ya terminan en su propia pantalla de confirmación (por ejemplo, el pedido confirmado). **Solo frontend y pruebas: sin cambios de backend, de escrituras ni de bloqueos, y sin migraciones.**

## Componente de toast (relevamiento)

`showToast(mensaje, kind = 'success')` en `frontend/js/catalogo.js`: un `div.toast` fijo a 90 px del borde inferior, centrado, con un `banner-success` (verde) o `banner-error` (rojo); dura 2,2 s y reemplaza al anterior (solo hay uno a la vez). Para que un toast sobreviva a una navegación hay dos mecanismos que ya existían: el parámetro de URL (`?productoCreado=1`, `?comercioResuelto=1`, `?passwordActualizada=1`) o `guardarToastPendiente` / `mostrarToastPendiente` (`sessionStorage`, lo usan la renuncia del Empleado y el selector de cuenta). No se creó ningún componente nuevo. **Único cambio al componente:** el `div.toast` ahora lleva `role="status"` y `aria-live="polite"` para que los lectores de pantalla lo anuncien (no se usó `role="alert"` porque varios tests cuentan los `alert` de la página).

## Auditoría: cada acción que escribe datos

Leyenda: **Ya tenía** = ya mostraba toast de éxito; **Agregado** = se agregó en este tramo; **Excluida** = navega o termina en su propia pantalla; **Dudosa** = se dejó fuera a propósito y se lista en el reporte.

### Cliente

| Pantalla | Archivo | Acción | Estado |
|---|---|---|---|
| Producto / detalle de comercio | `catalogo.js` | Agregar al carrito (y vaciar el carrito al cambiar de comercio) | Ya tenía "Producto agregado al carrito" |
| Carrito | `carrito.js` | Vaciar el carrito | **Agregado** "Vaciaste el carrito" |
| Carrito | `carrito.js` | Quitar un producto con el tacho | **Agregado** "Quitaste {producto} del carrito" |
| Carrito | `carrito.js` | Bajar la cantidad a cero con el "−" | **Agregado** (mismo texto) |
| Carrito | `carrito.js` | Sumar o restar cantidad sin llegar a cero | **Dudosa**: el número cambia en el momento y un toast por cada toque molestaría |
| Checkout | `checkout.js` | Confirmar el pedido | Excluida (termina en la pantalla del pedido confirmado) |
| Checkout / detalle de pedido | `checkout.js`, `pedidos.js` | Pago y sincronización del pago | Ya tenía |
| Detalle de pedido | `pedidos.js` | Cancelar el pedido, confirmar la entrega | Ya tenía |
| Perfil | `cliente.js` | Subir y eliminar la foto de perfil | Ya tenía |
| Perfil | `perfil-cuenta.js` | Editar datos personales, cambiar el nombre de usuario | Ya tenía |
| Perfil | `perfil-cuenta.js` | Cambiar la contraseña | Excluida (cierra sesión y va al login, que muestra "Listo, ya podés ingresar") |
| Notificaciones | `notificaciones.js` | Marcar una notificación como leída al tocarla | **Dudosa**: es implícita, no una acción pedida |
| Notificaciones | `notificaciones.js` | "Marcar todas" (Cliente: no existe fuera de un comercio) | Ver Dueño y Empleado |

### Dueño y Empleado

| Pantalla | Archivo | Acción | Estado |
|---|---|---|---|
| Panel | `cierre-comercio.js` | Cerrar y abrir el comercio con el interruptor | **Agregado** "Comercio cerrado" / "Comercio abierto" |
| Modal de desvincular Mercado Pago | `comercio.js` | "Cerrar comercio(s)" (cierre masivo) | **Agregado** "Cerraste el comercio" / "Cerraste N comercios" (solo los que se cerraron) |
| Modal de desvincular Mercado Pago | `comercio.js` | Desvincular la cuenta | Ya tenía (el mensaje del servidor) |
| Notificaciones | `notificaciones.js` | "Marcar todas" | **Agregado** "Marcaste todos los avisos como leídos" |
| Notificaciones | `comercio-activo.js` | Marcado automático al entrar a una pantalla de estado | **Dudosa**: no lo pide la persona |
| Productos | `comercio.js` | Crear y editar un producto | Ya tenía |
| Productos | `comercio.js` | Cambiar el estado, descontinuar desde la lista | Ya tenía |
| Formulario de producto | `comercio.js` | Descontinuar desde el formulario | **Agregado** "Producto descontinuado" (la lista lo muestra con `?productoDescontinuado=1`) |
| Formulario de producto | `comercio.js` | Eliminar una foto ya guardada | **Agregado** "Imagen eliminada" |
| Formulario de producto | `comercio.js` | Reordenar las fotos ya guardadas | **Agregado** "Orden de las fotos actualizado" (una vez por arrastre) |
| Formulario de producto | `comercio.js` | Recortar una foto ya guardada | **Agregado** "Imagen actualizada" |
| Formulario de producto | `comercio.js` | Subir una foto a un producto ya guardado | **Agregado** "Imagen agregada" |
| Formulario de producto | `comercio.js` | Quitar o agregar fotos de un producto que todavía no se creó | Excluida (no se guardó nada hasta "Crear producto") |
| Perfil del comercio | `comercio.js` | Editar datos, datos del comercio del Empleado, foto de perfil | Ya tenía |
| Pedidos | `comercio.js` | Aceptar, rechazar, despachar, entregar, anular, cerrar como no retirado | Ya tenía |
| Equipo | `equipo-comercio.js`, `renuncia-empleado.js` | Invitar, reenviar, cancelar, desactivar, reactivar, renunciar | Ya tenía |
| Alta y corrección de comercio | `agregar-comercio.js`, `comercio-corregir.js` | Enviar la solicitud | Excluida (termina en su pantalla de "está en revisión") |
| Cambio de comercio activo, cambio de cuenta | `selector-*.js` | Cambiar de contexto | Excluida (navega) |

### Administrador

| Pantalla | Archivo | Acción | Estado |
|---|---|---|---|
| Comercios pendientes y re-solicitudes | `admin.js` | Aprobar y rechazar | Ya tenía ("El comercio fue notificado de tu decisión", por `?comercioResuelto=1`) |
| Comercios | `admin.js` | Suspender | Ya tenía |
| Categorías y tags | `admin.js` | Crear, editar, activar, desactivar | Ya tenía |
| Tarifas | `admin.js` | Crear una tarifa | Ya tenía |
| Reembolsos | `admin.js` | Reintentar un reembolso | Ya tenía |

### Pantallas públicas

| Pantalla | Archivo | Acción | Estado |
|---|---|---|---|
| Registro de Cliente y de Comercio | `auth.js` | Registrarse | Excluida (termina en su pantalla de éxito) |
| Verificar cuenta, recuperar contraseña, reactivar cuenta | `auth.js` | Verificar, validar el código, confirmar | Excluida (cada paso termina en su pantalla de éxito) |
| Verificar cuenta | `auth.js` | Reenviar el código | **Dudosa**: ya muestra el aviso "Te enviamos un nuevo código." dentro de la pantalla |
| Invitación de Empleado | `invitacion-empleado.js` | Aceptar la invitación | Excluida (termina en su pantalla de éxito y el login muestra un toast) |
| Login y cierre de sesión | `auth.js` | Iniciar y cerrar sesión | Excluida (navega) |

## Archivos modificados

| Archivo | Qué cambia |
|---|---|
| `frontend/js/catalogo.js` | `showToast` suma `role="status"` y `aria-live="polite"`. |
| `frontend/js/cierre-comercio.js` | `ejecutar(accion, mensajeExito)`: avisa "Comercio cerrado" o "Comercio abierto" apenas responde el servidor, antes de refrescar. Un `409` sigue siendo el aviso fijo y un error de red el toast de error, sin toast de éxito. |
| `frontend/js/comercio.js` | Cierre masivo de la desvinculación de Mercado Pago; las cuatro acciones de fotos de un producto ya guardado; descontinuar desde el formulario (parámetro `productoDescontinuado=1` que la lista consume). |
| `frontend/js/notificaciones.js` | "Marcar todas" avisa después del `PUT`. |
| `frontend/js/carrito.js` | Vaciar, quitar con el tacho y quitar con el "−" cuando la cantidad era 1. |

## Pruebas

| Archivo | Qué cambia |
|---|---|
| `testing/playwright/tests/62-toasts-exito-ui.spec.ts` (nuevo, 14 tests, 375 px) | Región de estado accesible; cerrar y abrir; el `409` del cierre no da toast de éxito; "Marcar todas" y su error; carrito (tacho, "−" a cero sin avisar al bajar de 3 a 2, vaciar); fotos (eliminar, reordenar con eventos de arrastre, el fallo del reordenamiento, agregar con el editor de recorte y Cloudinary real, recortar); descontinuar desde el formulario. |
| `testing/playwright/tests/31-cierre-manual-comercio-ui.spec.ts` | El test del cierre masivo suma la comprobación del toast "Cerraste 3 comercios". |

## Documentación

`docs/DECISIONES.md`, `docs/DATA-TESTID-FASE17.md`, este archivo, `testing/playwright/README.md` y, en `docs/entregables-01-02/`: `requisitos-no-funcionales.md` (nuevo requisito de usabilidad) y `CAMBIOS.md`.
