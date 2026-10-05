# Mapeo de archivos — Pago múltiple y panel del comercio (2026-09-20)

Sin commitear. Cero comentarios en `.html/.css/.js`.

## Backend

| Archivo | Cambio | Por qué |
|---|---|---|
| `db/migration/V18__alerta_webhook_mp_pago_aprobado_duplicado.sql` (nuevo) | Amplía el ENUM `alerta_webhook_mp.motivo` con `PAGO_APROBADO_DUPLICADO` | Mismo patrón que V17 |
| `enums/MotivoAlertaWebhookMp.java` | Nuevo valor `PAGO_APROBADO_DUPLICADO` | A |
| `services/AlertaWebhookMpService.java` | `registrarPagoAprobadoDuplicado`, idempotente por (pedido, pago, motivo) | A |
| `services/MercadoPagoPagoService.java` | `aplicarResultadoPago` registra la alerta en vez de `log.warn`; `iniciarOReusarPago` verifica con MercadoPago antes de devolver el link (`yaPagado` / `enRevision` / 503); búsqueda estricta `buscarMejorPagoOFallar`; `RestClient` con timeout de 5 s; la preferencia nueva lleva `expires`, `expiration_date_from` y `expiration_date_to` | A, B, D |
| `exceptions/ServicioNoDisponibleException.java` (nuevo) + `GlobalExceptionHandler.java` | Mapea a 503 | B.4 |
| `dto/response/PagoResponseDTO.java`, `services/PagoService.java` | Campos `yaPagado` y `enRevision`; `aResponseDTOSinLink` | B |
| `repositories/PedidoRepository.java` | `findLlegadosPagadosByComercioId` y `llegoPagado` (EXISTS sobre el historial): único filtro de visibilidad | E.3 |
| `repositories/HistorialEstadoPedidoRepository.java` | `findPrimeraEntradaAEstadoPorPedido` (fechas en lote, sin N+1) | E.1 |
| `dto/response/PedidoResponseDTO.java` | Campo `fechaPagoAprobado` | E.1 |
| `services/PedidoService.java` | `listarPedidosComercio` y `obtenerResumenHoy` por el filtro central y por `fechaPagoAprobado`; Facturado suma `EN_PREPARACION`/`EN_CAMINO`/`LISTO_PARA_RETIRAR`/`ENTREGADO`; `obtenerPedidoDelComercio` da 404 si el pedido nunca llegó pagado (cierra `GET /comercio/{id}/pago` y las acciones); `aResponseDTO` resuelve `fechaPagoAprobado` | E |

## Frontend

| Archivo | Cambio |
|---|---|
| `js/pedidos.js` | "Ir a pagar": `yaPagado` → toast verde + recarga del pedido; `enRevision` → toast "Tu pago está pendiente de confirmación" y botón activo; 503 → toast rojo |
| `js/checkout.js` | Igual; `yaPagado` navega a `pedido-detalle.html?id=N&pago=exito`; solo el 503 y los dos casos nuevos usan toast, el resto sigue con banner |
| `js/comercio.js` | Fecha y orden por `fechaPagoAprobado` (líneas 336, 369, 506, 844) |

## Corrección durante V6

| Archivo | Cambio |
|---|---|
| `js/api.js` | Nueva opción `handle5xxGlobally` (por defecto `true`, sin cambio de comportamiento para el resto): con `false`, un 5xx no redirige a `errores/500.html` y el llamador recibe el `ApiError` |
| `js/pedidos.js`, `js/checkout.js` | Las llamadas `POST /pedidos/cliente/{id}/pago` pasan `handle5xxGlobally: false`, para que el 503 llegue como toast rojo y no se pise con la página de error |
