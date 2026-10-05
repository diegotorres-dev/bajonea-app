# Mapeo de archivos — NotaCredito y reembolso total (Fase 2, 2026-09-25)

Implementación posterior a `docs/AUDITORIA-NOTACREDITO-REEMBOLSO-TOTAL.md` (Fase 1, solo lectura). Cablea el reembolso total para `RECHAZADO`, `EXPIRADO` y la cancelación por suspensión de comercio (`CANCELADO_POR_SISTEMA`). `CANCELADO`, `ANULADO` y el reembolso parcial por ítem quedan fuera (tareas 2 y 3).

## Base de datos

| Archivo | Cambio |
|---|---|
| `backend/src/main/resources/db/migration/V23__nota_credito_motivo_error_payment.sql` | Nuevo. `nota_credito`: agrega `motivo` (ENUM, nullable), `mp_payment_id` VARCHAR(50), `ultimo_error` VARCHAR(500); amplía el ENUM `estado` con `PENDIENTE_REVISION_MANUAL`. |

## Backend (`backend/src/main/java/com/bajonea/backend/`)

| Archivo | Cambio |
|---|---|
| `enums/MotivoNotaCredito.java` | Nuevo: `RECHAZO_COMERCIO`, `CANCELACION_CLIENTE`, `ANULACION_COMERCIO`, `SUSPENSION_COMERCIO`, `EXPIRACION_SIN_RESPUESTA` (los 2 del medio esperan a la tarea 2). |
| `enums/EstadoNotaCredito.java` | Suma `PENDIENTE_REVISION_MANUAL`. |
| `entities/NotaCredito.java` | `@OneToOne(unique = true)` → `@ManyToOne` (1 pago : N notas); campos `motivo`, `mpPaymentId`, `ultimoError`. |
| `repositories/NotaCreditoRepository.java` | `findByPagoId` devuelve `List<NotaCredito>` (antes `Optional`); suma `findByPagoPedidoIdIn`. |
| `repositories/PagoRepository.java` | Suma `findByPedidoIdParaActualizar` (`PESSIMISTIC_WRITE`) para serializar reembolsos del mismo pedido. |
| `services/PagoService.java` | Suma `buscarPorPedidoParaActualizar`. |
| `services/NotaCreditoService.java` | Reescrito: `crear(pago, monto, motivo)`, `crearPendienteRevisionManual`, `montoCubierto`, `registrarReembolsoExitoso`, `registrarReembolsoFallido`, `listarPorPago/Pedidos/Estado`. `intentos` cuenta solo intentos reales contra MercadoPago. Se eliminaron `obtenerPorPago` y `actualizarEstado` (sin ningún llamador). |
| `services/MercadoPagoReembolsoClient.java` | Nuevo. Cliente HTTP puro de `POST /v1/payments/{id}/refunds` (body vacío, `X-Idempotency-Key`, token del comercio, timeouts 5 s). Nunca lanza: devuelve `ResultadoReembolsoMp`. |
| `services/ReembolsoService.java` | Nuevo. `procesarReembolsoTotal(Pedido, MotivoNotaCredito)`: valida, crea la nota, llama a MP fuera de transacción y registra el resultado. Diferido a `afterCommit` si lo invoca una transacción. Nunca lanza. |
| `services/PedidoService.java` | Inyecta `ReembolsoService` y `NotaCreditoService`. `rechazarPedido` (`RECHAZO_COMERCIO`), `cancelarPedidosPorSuspensionComercio` (`SUSPENSION_COMERCIO`, solo si `pagoEstado = PAGADO`) y `expirarPedidosSinRespuestaComercio` (`EXPIRACION_SIN_RESPUESTA`) llaman al reembolso. Los TODO de `cancelarPedido`/`anularPedido` se conservan. Texto de la notificación T12 ya sin "1 hora"/"reembolso está en proceso": usa el plazo configurado y "estamos gestionando la devolución". `aResponseDTO` agrega el estado/monto de la nota más reciente. |
| `services/PedidoSchedulerService.java` | Solo el comentario de umbrales (60 → 30). |
| `dto/response/PedidoResponseDTO.java` | Suma `reembolsoEstado` (`EstadoNotaCredito`) y `reembolsoMonto`, nulos si no hay nota. |
| `resources/application.properties` | `pedido.timeout.respuesta-comercio-minutos` 60 → 30. |

## Frontend (`frontend/js/`)

| Archivo | Cambio |
|---|---|
| `pedidos.js` | El texto de `EXPIRADO` ya no promete un reembolso; nueva `textoReembolso(pedido)` según `reembolsoEstado` (procesado / en proceso / revisión manual) para `RECHAZADO`, `CANCELADO`, `ANULADO`, `CANCELADO_POR_SISTEMA`, `EXPIRADO`. |
| `catalogo.js` | `renderPedidoEstadoHeader` acepta `reembolsoTexto` opcional (retrocompatible), con `data-testid="estado-reembolso"`. |

## Tests nuevos (`backend/src/test/java/com/bajonea/backend/services/`)

| Archivo | Cubre |
|---|---|
| `ReembolsoServiceTest.java` (11) | Criterio de pago aprobado, nota en éxito y en falla, excepción inesperada no se propaga, pedido sin pago, pago rechazado con `id_transaccion_mp`, aprobado sin `fecha_confirmacion`, cuenta desvinculada → revisión manual sin llamar a MP, no duplicar, diferido a `afterCommit`, rollback no reembolsa. |
| `MercadoPagoReembolsoClientTest.java` (6) | Cabeceras (token + `X-Idempotency-Key`), `approved`/`in_process`, 400 con cuerpo real, 500, respuesta sin id, status inesperado. |
| `NotaCreditoServiceTest.java` (5) | `crear`, revisión manual, `montoCubierto` (excluye `FALLIDO`), éxito y falla (error recortado a 500). |
| `PedidoServiceReembolsoTest.java` (9) | Los 3 disparos, timeout de 30 min (29 min no expira), `CANCELADO_POR_SISTEMA` sin pago confirmado y timeout de pago no reembolsan, `cancelarPedido` sigue sin reembolso, DTO con/sin nota. |

## Documentación

`docs/diccionario-de-datos.md` v1.7 → v1.8 (y su copia en `02. Diseño/.../Diccionario de Datos/`): tabla `NotaCredito`, ENUM `EstadoNotaCredito`, ENUM nuevo `MotivoNotaCredito`, criterio de pago reembolsable corregido, "1 hora" → "30 minutos". `docs/DECISIONES.md`: entrada del 2026-09-25.

## No tocado a propósito

`CANCELADO`/`ANULADO` (tarea 2), `EstadoDetallePedido`/reembolso parcial (tarea 3), job de reintentos, notificación T27, colecciones Postman/specs Playwright (ninguno dependía del valor de 60 minutos).

---

# Cierre de la tarea 1 (2026-09-25): pantalla de Admin para revisión manual, clave `nc-` y "30 minutos" en el análisis

Adelanto de alcance decidido por Diego: la pantalla de Admin que originalmente iba después de la tarea 2 se construye acá, como parte del cierre de la tarea 1. Lo de arriba queda como estaba, salvo la mención a la pantalla de Admin en "No tocado a propósito", que ya no aplica.

## Backend (`backend/src/main/java/com/bajonea/backend/`)

| Archivo | Cambio |
|---|---|
| `services/ReembolsoService.java` | Nuevo `reintentarNotaCredito(notaId)`: mismo flujo en 3 pasos (transacción corta que valida y marca la nota `PENDIENTE` → llamada a MercadoPago sin transacción → transacción corta que registra el resultado), pero sobre la nota existente y **lanzando** las excepciones de negocio (`409` si la nota no es `PENDIENTE_REVISION_MANUAL`/`FALLIDO`, si el pago ya no está aprobado, si otra nota ya cubre el pago, o si la cuenta de MercadoPago del comercio **sigue desvinculada**). Extraído `solicitarYRegistrar` (compartido con el reembolso original). Clave de idempotencia `bajonea-nc-{id}-1` → `nc-{id}-{intentos + 1}`: ahora el número es el intento real, así un reintento de una nota `FALLIDO` no reutiliza la clave del intento anterior. |
| `services/NotaCreditoService.java` | Suma `obtenerParaActualizar` (lock pesimista sobre la nota, para que dos clics o dos admins no reembolsen dos veces), `marcarEnProceso`, `montoCubiertoExcluyendo`, `listarPorEstados`; `obtener` pasa a público. |
| `repositories/NotaCreditoRepository.java` | Suma `findByEstadoInOrderByFechaEmisionDesc` y `findByIdParaActualizar` (`PESSIMISTIC_WRITE`). |
| `services/NotaCreditoAdminService.java` | Nuevo. `listarPendientesDeRevision()` y `reintentar(id)`. Sin `@Transactional` de clase a propósito (la llamada a MercadoPago no puede correr dentro de una transacción); las lecturas usan un `TransactionTemplate` de solo lectura. Deriva el código visible `NC-{año de fecha_emision}-{id, 5 dígitos}`. |
| `dto/response/NotaCreditoAdminResponseDTO.java` | Nuevo: `id`, `codigo`, `pedidoId`, `nombreCliente`, `nombreComercio`, `monto`, `fechaEmision`, `motivo`, `estado`, `ultimoError`, `intentos`. |
| `controllers/AdministradorController.java` | `GET /api/v1/administrador/reembolsos` (solo `PENDIENTE_REVISION_MANUAL` y `FALLIDO`, más nuevas primero) y `POST /api/v1/administrador/reembolsos/{notaCreditoId}/reintentar` (devuelve la nota actualizada; `200` tanto si se procesó como si MercadoPago volvió a rechazar: el `estado` de la respuesta dice cuál). Ambos ya quedan bajo `hasRole("ADMINISTRADOR")` por el matcher existente de `/administrador/**` en `SecurityConfig`. |

## Frontend (`frontend/`)

| Archivo | Cambio |
|---|---|
| `admin-reembolsos.html` | Nuevo. Mismo esqueleto que `admin-clientes.html`, más un slot para los chips de filtro. |
| `js/admin.js` | `initAdminReembolsos`, `renderReembolsoRow`; ícono `refund`; tile "Reembolsos" en el dashboard. Reusa `detailRow`, `cliente-admin-row`, `cliente-estado` (puntito de estado), `chip-row`/`chip`, `state-page` y `showToast`. El motivo por el que un reintento no se pudo hacer (por ejemplo la cuenta desvinculada) se muestra dentro de la propia fila, no solo en un toast que desaparece. |
| `css/styles.css` | `.reembolso-row .btn` y `.reembolso-row__error`/`__aviso` (bloque rojo suave, mismo criterio de color de error que el resto). |

## Tests

| Archivo | Cubre |
|---|---|
| `backend/src/test/.../ReembolsoServiceReintentoTest.java` (6) | Reintento de nota en revisión manual con cuenta vinculada (clave `nc-900-1`), reintento de una `FALLIDO` (clave `nc-900-2`), cuenta todavía desvinculada (informa y no llama a MercadoPago ni cambia la nota), nota ya procesada o en proceso, pago no aprobado, otra nota ya cubre el pago. |
| `backend/src/test/.../MercadoPagoReembolsoClientTest.java`, `ReembolsoServiceTest.java` | Solo el prefijo de la clave (`bajonea-nc-` → `nc-`). |
| `testing/playwright/tests/20-reembolsos-admin.spec.ts` (3) | Listado con datos sintéticos (código, estado, pedido, cliente, comercio, monto, motivo, error, chips de filtro); reintento con la cuenta desvinculada contra el backend real (`409`, aviso en la fila, la nota no cambia en la base); reintento exitoso con la respuesta de MercadoPago simulada por `page.route` (la fila desaparece). Nunca llama a MercadoPago. |
| `postman/Bajonea-MVP.postman_collection.json`, carpeta nueva `48 - Administrador - Reembolsos (revision manual)` (12 requests) | 3 logins de renovación de sesión, `401`/`403` (Cliente y Comercio) sobre ambos endpoints, `404` nota inexistente, `400` id no numérico, `200` del listado validando la forma de cada fila. |

## Documentación

Los 4 archivos de `01. Análisis de Requerimientos` que decían "1 hora" pasan a "30 minutos": `03. Alcance y Limitaciones/alcance-y-limitaciones.md` (2 lugares), `04. Requisitos Funcionales/requisitos-funcionales-comercio.md`, `requisitos-funcionales-sistema.md` (2 lugares), `07. Historias de Usuario/Historias de Usuario - Comercio.md`. Las copias de `docs/_backups/` no se tocan (son fotos históricas). `docs/DECISIONES.md`: entrada nueva del 2026-09-25.
