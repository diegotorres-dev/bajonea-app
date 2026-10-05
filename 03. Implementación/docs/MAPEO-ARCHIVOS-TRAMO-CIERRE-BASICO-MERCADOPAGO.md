# Mapeo de archivos: cierre básico de MercadoPago (Tramo 3)

Fecha: 2026-09-19. Sin commits (los hace Diego). Base de pruebas: `bajonea_practicas3`.

## Backend

| Archivo | Cambio y motivo |
|---|---|
| `backend/src/main/resources/db/migration/V17__alerta_webhook_mp_pago_aprobado_sobre_pedido_cancelado.sql` (nuevo) | Amplía el ENUM `alerta_webhook_mp.motivo` con `PAGO_APROBADO_SOBRE_PEDIDO_CANCELADO`. |
| `enums/MotivoAlertaWebhookMp.java` | Nuevo valor `PAGO_APROBADO_SOBRE_PEDIDO_CANCELADO`. |
| `repositories/AlertaWebhookMpRepository.java` | `existsByPedidoIdAndMpPaymentIdAndMotivo`, para que la alerta sea idempotente. |
| `services/AlertaWebhookMpService.java` | `registrarPagoAprobadoSobrePedidoCancelado` (no duplica por pedido + pago + motivo). |
| `services/PedidoService.java` | (a) `confirmarPedido` ya no vacía el carrito. (b) `confirmarPagoAprobado` vacía el carrito solo si su comercio coincide con el del pedido. (c) `marcarPagoRechazado` solo marca `pago_estado = RECHAZADO`: no cancela, no toca historial ni carrito, y nunca degrada un pedido pagado o fuera de `PENDIENTE_PAGO`. (d) `bloquearParaActualizar` (`SELECT ... FOR UPDATE` + refresh). (e) `obtenerDetalleCliente`. (f) `expirarPagosVencidos` carga `pedido.motivo` (`Pago no confirmado` / `Pago rechazado`). |
| `services/PagoService.java` | `refrescar(Pago)` para releer la fila tras tomar el lock. |
| `services/MercadoPagoPagoService.java` | Rutina única `aplicarResultadoPago` (webhook y sincronización), `sincronizarPago`, `buscarMejorPagoPorReferencia` (`GET /v1/payments/search`, prioriza aprobado y luego el más reciente). Se quitó el corte de idempotencia que impedía registrar la alerta de pago tardío. Un pago aprobado nunca se pisa. |
| `dto/request/SincronizarPagoRequestDTO.java` (nuevo) | `paymentId` opcional, solo dígitos (validación en el DTO). |
| `controllers/PedidoController.java` | `POST /api/v1/pedidos/cliente/{id}/pago/sincronizar` (body opcional, 404 si el pedido no es del cliente). |

## Frontend

| Archivo | Cambio y motivo |
|---|---|
| `frontend/js/pedidos.js` | `initPedidoDetalle`: lee `?pago=` y `payment_id`, sincroniza al volver (una vez con `fallo`, cada 3 s hasta 15 intentos con `exito`/`pendiente`, corta ante 401/404 o al salir de la pantalla). Toasts decididos por el estado real. `renderAccionesCliente`: botón deshabilitado con `El pago se está procesando`, oculto si el pago está PAGADO, activo si RECHAZADO. Sin comentarios. |

Sin cambios: `checkout.js`, `showToast`, CSS y el DTO de pedido.

## Documentación
- `docs/MAPEO-ARCHIVOS-TRAMO-CIERRE-BASICO-MERCADOPAGO.md` (este archivo).
- `docs/DECISIONES.md`: entrada del 2026-09-19 al final.
