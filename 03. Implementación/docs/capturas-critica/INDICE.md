# Capturas para la crítica de diseño

Juego de 94 capturas de página completa (47 pantallas × 2 anchos) tomadas el 2026-11-13 contra `bajonea_test` con datos sembrados (11 comercios con foto y productos, 25+ pedidos en todos los estados, Empleado, reclamo, consultas de Soporte, documentos). 390 px = móvil, 1440 px = escritorio, ambos con `deviceScaleFactor: 2` (el PNG mide el doble en píxeles).

**Cómo leerlas.** Las imágenes de comercios y productos son ilustraciones sintéticas (degradado con un emoji): sirven para juzgar proporciones, recortes y jerarquía, no el aspecto de fotos reales. Las hojas y diálogos abiertos (11, 44) son capturas del viewport, no de página completa, porque una hoja fija dentro de una captura alta aparece en un lugar que el usuario nunca ve. Los pasos del checkout (13 a 16) se alcanzan haciendo clic; el paso 4 crea un pedido real en `PENDIENTE_PAGO`.

| Archivo | Rol | Pantalla | Ancho | URL usada | Tamaño (px) | Notas |
|---|---|---|---|---|---|---|
| `01-acceso-login-1440.png` | acceso | login | 1440 | `/login.html` | 2880×1800 |  |
| `01-acceso-login-390.png` | acceso | login | 390 | `/login.html` | 780×1688 |  |
| `02-acceso-bienvenida-1440.png` | acceso | bienvenida | 1440 | `/bienvenida.html` | 2880×1800 |  |
| `02-acceso-bienvenida-390.png` | acceso | bienvenida | 390 | `/bienvenida.html` | 780×1688 |  |
| `03-acceso-registro-tipo-cuenta-1440.png` | acceso | registro-tipo-cuenta | 1440 | `/registro-tipo-cuenta.html` | 2880×1800 |  |
| `03-acceso-registro-tipo-cuenta-390.png` | acceso | registro-tipo-cuenta | 390 | `/registro-tipo-cuenta.html` | 780×1688 |  |
| `04-acceso-registro-cliente-paso1-1440.png` | acceso | registro-cliente-paso1 | 1440 | `/registro-cliente.html` | 2880×2518 |  |
| `04-acceso-registro-cliente-paso1-390.png` | acceso | registro-cliente-paso1 | 390 | `/registro-cliente.html` | 780×2860 |  |
| `05-acceso-registro-comercio-paso1-1440.png` | acceso | registro-comercio-paso1 | 1440 | `/registro-comercio.html` | 2880×3108 |  |
| `05-acceso-registro-comercio-paso1-390.png` | acceso | registro-comercio-paso1 | 390 | `/registro-comercio.html` | 780×3388 |  |
| `06-acceso-verificar-email-1440.png` | acceso | verificar-email | 1440 | `/verificar-email.html?email=lucia.fernandez%40ejemplo.com` | 2880×1800 |  |
| `06-acceso-verificar-email-390.png` | acceso | verificar-email | 390 | `/verificar-email.html?email=lucia.fernandez%40ejemplo.com` | 780×1688 |  |
| `07-acceso-recuperar-password-1440.png` | acceso | recuperar-password | 1440 | `/recuperar-password.html` | 2880×1800 |  |
| `07-acceso-recuperar-password-390.png` | acceso | recuperar-password | 390 | `/recuperar-password.html` | 780×1688 |  |
| `08-cliente-catalogo-1440.png` | cliente | catalogo | 1440 | `/index.html` | 2880×2426 |  |
| `08-cliente-catalogo-390.png` | cliente | catalogo | 390 | `/index.html` | 780×3004 |  |
| `09-cliente-explorar-filtros-1440.png` | cliente | explorar-filtros | 1440 | `/explorar.html` | 2880×1800 | con una categoría seleccionada |
| `09-cliente-explorar-filtros-390.png` | cliente | explorar-filtros | 390 | `/explorar.html` | 780×1688 | con una categoría seleccionada |
| `10-cliente-ficha-comercio-1440.png` | cliente | ficha-comercio | 1440 | `/comercio-detalle.html?id=1` | 2880×5564 |  |
| `10-cliente-ficha-comercio-390.png` | cliente | ficha-comercio | 390 | `/comercio-detalle.html?id=1` | 780×3542 |  |
| `11-cliente-producto-hoja-1440.png` | cliente | producto-hoja | 1440 | `/comercio-detalle.html?id=1` | 2880×1800 | hoja o diálogo del producto abierto (captura del viewport) |
| `11-cliente-producto-hoja-390.png` | cliente | producto-hoja | 390 | `/comercio-detalle.html?id=1` | 780×1688 | hoja o diálogo del producto abierto (captura del viewport) |
| `12-cliente-carrito-1440.png` | cliente | carrito | 1440 | `/carrito.html` | 2880×1800 | con 3 productos en el carrito |
| `12-cliente-carrito-390.png` | cliente | carrito | 390 | `/carrito.html` | 780×1766 | con 3 productos en el carrito |
| `13-cliente-pedidos-1440.png` | cliente | pedidos | 1440 | `/pedidos.html` | 2880×7614 |  |
| `13-cliente-pedidos-390.png` | cliente | pedidos | 390 | `/pedidos.html` | 780×8340 |  |
| `14-cliente-pedido-detalle-en-curso-1440.png` | cliente | pedido-detalle-en-curso | 1440 | `/pedidos.html?id=7` | 2880×7614 |  |
| `14-cliente-pedido-detalle-en-curso-390.png` | cliente | pedido-detalle-en-curso | 390 | `/pedido-detalle.html?id=7` | 780×1688 |  |
| `15-cliente-pedido-detalle-entregado-1440.png` | cliente | pedido-detalle-entregado | 1440 | `/pedidos.html?id=8` | 2880×7614 |  |
| `15-cliente-pedido-detalle-entregado-390.png` | cliente | pedido-detalle-entregado | 390 | `/pedido-detalle.html?id=8` | 780×1688 |  |
| `16-cliente-perfil-1440.png` | cliente | perfil | 1440 | `/perfil.html?seccion=datos` | 2880×1882 |  |
| `16-cliente-perfil-390.png` | cliente | perfil | 390 | `/perfil.html` | 780×1688 |  |
| `17-cliente-direcciones-1440.png` | cliente | direcciones | 1440 | `/perfil.html?seccion=direcciones` | 2880×1882 |  |
| `17-cliente-direcciones-390.png` | cliente | direcciones | 390 | `/perfil.html?vista=direcciones` | 780×1688 |  |
| `18-cliente-avisos-1440.png` | cliente | avisos | 1440 | `/notificaciones.html` | 2880×4064 |  |
| `18-cliente-avisos-390.png` | cliente | avisos | 390 | `/notificaciones.html` | 780×5422 |  |
| `19-cliente-checkout-1-modalidad-1440.png` | cliente | checkout-1-modalidad | 1440 | `/checkout.html` | 2880×1800 |  |
| `19-cliente-checkout-1-modalidad-390.png` | cliente | checkout-1-modalidad | 390 | `/checkout.html` | 780×1688 |  |
| `20-cliente-checkout-2-direccion-1440.png` | cliente | checkout-2-direccion | 1440 | `/checkout.html` | 2880×1800 |  |
| `20-cliente-checkout-2-direccion-390.png` | cliente | checkout-2-direccion | 390 | `/checkout.html` | 780×1688 |  |
| `21-cliente-checkout-3-resumen-1440.png` | cliente | checkout-3-resumen | 1440 | `/checkout.html` | 2880×1800 |  |
| `21-cliente-checkout-3-resumen-390.png` | cliente | checkout-3-resumen | 390 | `/checkout.html` | 780×1688 |  |
| `22-cliente-checkout-4-pago-1440.png` | cliente | checkout-4-pago | 1440 | `/checkout.html` | 2880×1800 | crea el pedido y queda en el paso de pago |
| `22-cliente-checkout-4-pago-390.png` | cliente | checkout-4-pago | 390 | `/checkout.html` | 780×1688 | crea el pedido y queda en el paso de pago |
| `23-dueno-panel-1440.png` | dueno | panel | 1440 | `/comercio-dashboard.html` | 2880×1956 |  |
| `23-dueno-panel-390.png` | dueno | panel | 390 | `/comercio-dashboard.html` | 780×3064 |  |
| `24-dueno-pedidos-1440.png` | dueno | pedidos | 1440 | `/comercio-pedidos.html?id=1` | 2880×5704 | en escritorio con un pedido seleccionado |
| `24-dueno-pedidos-390.png` | dueno | pedidos | 390 | `/comercio-pedidos.html` | 780×6686 | en escritorio con un pedido seleccionado |
| `25-dueno-pedido-detalle-1440.png` | dueno | pedido-detalle | 1440 | `/comercio-pedidos.html?id=3` | 2880×5704 |  |
| `25-dueno-pedido-detalle-390.png` | dueno | pedido-detalle | 390 | `/comercio-pedido-detalle.html?id=3` | 780×1804 |  |
| `26-dueno-productos-1440.png` | dueno | productos | 1440 | `/comercio-productos.html` | 2880×2338 |  |
| `26-dueno-productos-390.png` | dueno | productos | 390 | `/comercio-productos.html` | 780×2748 |  |
| `27-dueno-producto-form-1440.png` | dueno | producto-form | 1440 | `/comercio-producto-form.html?id=1` | 2880×1800 | edición de un producto con imágenes |
| `27-dueno-producto-form-390.png` | dueno | producto-form | 390 | `/comercio-producto-form.html?id=1` | 780×1760 | edición de un producto con imágenes |
| `28-dueno-estadisticas-1440.png` | dueno | estadisticas | 1440 | `/comercio-estadisticas.html` | 2880×2318 |  |
| `28-dueno-estadisticas-390.png` | dueno | estadisticas | 390 | `/comercio-estadisticas.html` | 780×2268 |  |
| `29-dueno-equipo-1440.png` | dueno | equipo | 1440 | `/comercio-perfil.html?seccion=equipo` | 2880×1800 |  |
| `29-dueno-equipo-390.png` | dueno | equipo | 390 | `/comercio-perfil.html` | 780×1688 |  |
| `30-dueno-documentacion-1440.png` | dueno | documentacion | 1440 | `/comercio-documentacion.html` | 2880×1800 |  |
| `30-dueno-documentacion-390.png` | dueno | documentacion | 390 | `/comercio-documentacion.html` | 780×1762 |  |
| `31-dueno-perfil-1440.png` | dueno | perfil | 1440 | `/comercio-perfil.html?seccion=perfil` | 2880×1800 |  |
| `31-dueno-perfil-390.png` | dueno | perfil | 390 | `/comercio-perfil.html` | 780×2400 |  |
| `32-empleado-panel-1440.png` | empleado | panel | 1440 | `/comercio-dashboard.html` | 2880×1844 |  |
| `32-empleado-panel-390.png` | empleado | panel | 390 | `/comercio-dashboard.html` | 780×2902 |  |
| `33-empleado-pedidos-1440.png` | empleado | pedidos | 1440 | `/comercio-pedidos.html` | 2880×5704 |  |
| `33-empleado-pedidos-390.png` | empleado | pedidos | 390 | `/comercio-pedidos.html` | 780×6700 |  |
| `34-admin-panel-1440.png` | admin | panel | 1440 | `/admin-dashboard.html` | 2880×1800 |  |
| `34-admin-panel-390.png` | admin | panel | 390 | `/admin-dashboard.html` | 780×2578 |  |
| `35-admin-comercios-pendientes-1440.png` | admin | comercios-pendientes | 1440 | `/admin-comercios-pendientes.html` | 2880×1800 |  |
| `35-admin-comercios-pendientes-390.png` | admin | comercios-pendientes | 390 | `/admin-comercios-pendientes.html` | 780×1688 |  |
| `36-admin-comercios-1440.png` | admin | comercios | 1440 | `/admin-comercios.html` | 2880×1960 |  |
| `36-admin-comercios-390.png` | admin | comercios | 390 | `/admin-comercios.html` | 780×3382 |  |
| `37-admin-documento-revision-1440.png` | admin | documento-revision | 1440 | `/admin-documento-revision.html?comercioId=2&id=3` | 2880×1800 |  |
| `37-admin-documento-revision-390.png` | admin | documento-revision | 390 | `/admin-documento-revision.html?comercioId=2&id=3` | 780×2028 |  |
| `38-admin-soporte-ticket-abierto-1440.png` | admin | soporte-ticket-abierto | 1440 | `/admin-soporte.html?id=2` | 2880×1800 | con una consulta abierta |
| `38-admin-soporte-ticket-abierto-390.png` | admin | soporte-ticket-abierto | 390 | `/admin-soporte.html?id=2` | 780×1688 | con una consulta abierta |
| `39-admin-reclamos-1440.png` | admin | reclamos | 1440 | `/admin-reclamos.html` | 2880×1800 |  |
| `39-admin-reclamos-390.png` | admin | reclamos | 390 | `/admin-reclamos.html` | 780×1688 |  |
| `40-admin-reembolsos-1440.png` | admin | reembolsos | 1440 | `/admin-reembolsos.html` | 2880×1800 |  |
| `40-admin-reembolsos-390.png` | admin | reembolsos | 390 | `/admin-reembolsos.html` | 780×1688 |  |
| `41-admin-clientes-1440.png` | admin | clientes | 1440 | `/admin-clientes.html` | 2880×1800 |  |
| `41-admin-clientes-390.png` | admin | clientes | 390 | `/admin-clientes.html` | 780×1846 |  |
| `42-admin-duenos-1440.png` | admin | duenos | 1440 | `/admin-duenos.html` | 2880×2050 |  |
| `42-admin-duenos-390.png` | admin | duenos | 390 | `/admin-duenos.html` | 780×3782 |  |
| `43-admin-tarifas-1440.png` | admin | tarifas | 1440 | `/admin-tarifas.html` | 2880×1800 |  |
| `43-admin-tarifas-390.png` | admin | tarifas | 390 | `/admin-tarifas.html` | 780×1688 |  |
| `44-dueno-estado-hoja-anular-pedido-1440.png` | dueno | estado-hoja-anular-pedido | 1440 | `/comercio-pedidos.html?id=3` | 2880×1800 | hoja de anulación abierta (captura del viewport) |
| `44-dueno-estado-hoja-anular-pedido-390.png` | dueno | estado-hoja-anular-pedido | 390 | `/comercio-pedido-detalle.html?id=3` | 780×1688 | hoja de anulación abierta (captura del viewport) |
| `45-acceso-estado-error-de-campo-1440.png` | acceso | estado-error-de-campo | 1440 | `/registro-cliente.html` | 2880×2674 | Continuar sin completar el paso 1 |
| `45-acceso-estado-error-de-campo-390.png` | acceso | estado-error-de-campo | 390 | `/registro-cliente.html` | 780×3174 | Continuar sin completar el paso 1 |
| `46-cliente-estado-vacio-sin-pedidos-1440.png` | cliente (sin pedidos) | estado-vacio-sin-pedidos | 1440 | `/pedidos.html` | 2880×1800 |  |
| `46-cliente-estado-vacio-sin-pedidos-390.png` | cliente (sin pedidos) | estado-vacio-sin-pedidos | 390 | `/pedidos.html` | 780×1688 |  |
| `47-acceso-estado-error-404-1440.png` | acceso | estado-error-404 | 1440 | `/errores/404.html` | 2880×1800 |  |
| `47-acceso-estado-error-404-390.png` | acceso | estado-error-404 | 390 | `/errores/404.html` | 780×1688 |  |

## Conteo

- acceso · 1440: 9
- acceso · 390: 9
- cliente · 1440: 15
- cliente · 390: 15
- dueno · 1440: 10
- dueno · 390: 10
- empleado · 1440: 2
- empleado · 390: 2
- admin · 1440: 10
- admin · 390: 10
- cliente (sin pedidos) · 1440: 1
- cliente (sin pedidos) · 390: 1

Total: 94 archivos, 26.8 MB.
