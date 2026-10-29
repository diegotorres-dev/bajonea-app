# Mapeo de archivos — Fase 5, tramo S2 (suspensión individual de un comercio)

Entrega A (backend, tests y documentación), 2026-10-29. La entrega B (pantallas y specs de Playwright de UI) no está hecha. Pendiente de la confirmación de Diego.

## Migración

| Archivo | Qué |
|---|---|
| `backend/src/main/resources/db/migration/V45__suspension_comercio.sql` (nuevo) | `comercio.suspension_origen`, `suspendido_desde`, `motivo_suspension`, el índice `idx_comercio_suspension` y el `CHECK ck_comercio_suspension` (antes del `CHECK` completa los comercios que ya estaban `SUSPENDIDO` con origen `INDIVIDUAL`, la fecha y el motivo de su historial); `historial_estado_comercio.suspension_origen` (y marca `INDIVIDUAL` las filas que ya llevaban a `SUSPENDIDO`); `historial_estado_pedido.motivo_timeout` + `TIMEOUT_PREPARACION_SUSPENSION`; `nota_credito.motivo` + `PAGO_TARDIO`; `notificacion.tipo` + `COMERCIO_SUSPENDIDO_EQUIPO` y `COMERCIO_SUSPENSION_LEVANTADA_EQUIPO`. Probada sobre una copia descartable de `bajonea_practicas3` (ya borrada). |

## Backend — código nuevo

| Archivo | Qué |
|---|---|
| `services/SuspensionComercioService.java` | Suspender (con la conversión de origen `DUENO` a `INDIVIDUAL`), levantar, vista previa y reenvío del email. Orden de bloqueo: usuarios del Dueño y de los Empleados activos (compartido, id ascendente), relaciones, cuenta de Mercado Pago (solo al levantar) y comercio. |
| `enums/OrigenSuspensionComercio.java` | `INDIVIDUAL`, `DUENO`. |
| `dto/response/SuspensionComercioResponseDTO.java`, `SuspensionComercioPreviaResponseDTO.java` | Respuesta de suspender y levantar, y vista previa con los pedidos por estado. |

## Backend — código modificado

| Archivo | Cambio |
|---|---|
| `entities/Comercio.java`, `entities/HistorialEstadoComercio.java` | Los campos nuevos. `Pedido.suspensionRetiroExpira` salió de la entidad (la columna queda sin uso). |
| `services/PedidoService.java` | Se eliminó `cancelarPedidosPorSuspensionComercio`; los procesos de 90 minutos (`autoconfirmarRetirosPorSuspension` reescrito y `cancelarPreparacionPorSuspension` nuevo, un pedido por transacción); `bloquearParaTopeDeSuspension`; `PedidoBloqueado` suma `suspendidoDesde`; aceptar bloquea al Dueño con el comercio suspendido; el pago aprobado con el comercio suspendido cancela y reembolsa; `reembolsarPagoTardio` con `SUSPENSION_CLIENTE`, `SUSPENSION_COMERCIO` o `PAGO_TARDIO`; el reparto de avisos excluye a los Empleados con la cuenta suspendida; `PedidoResponseDTO` con `comercioNombre` y `comercioFotoUrl`. |
| `services/PedidoSchedulerService.java` | El quinto proceso (cada 60 s) y su nombre para el atajo de test (`cancelar-preparacion-suspension`). |
| `services/AptitudVentaComercioService.java` | La rama `SUSPENDIDO` de `decidir` (solo con `SUSPENSION_LEVANTADA`) y `destinoAlLevantarSuspension`. `participa` no cambia: la suspensión prevalece sobre cualquier otro recálculo. |
| `services/ComercioActivoService.java` | `validarComercioModificable` y `validarComercioAceptaPedidosNuevos` valen también para el Dueño con el comercio suspendido; `exigirComercioModificable` (lectura compartida del estado). |
| `services/ComercioService.java`, `services/RedSocialService.java`, `services/HorarioEdicionService.java` (sin cambios: ya llamaba al guard) | El perfil y la foto toman el comercio `FOR UPDATE` y validan sobre la fila bloqueada; la firma de la foto y las redes validan con lectura compartida. |
| `services/MercadoPagoOAuthService.java`, `services/MercadoPagoPagoService.java` | Desvincular da `409` con un comercio suspendido; "Ir a pagar" da `409`. |
| `services/GestionMiembroEquipoService.java`, `services/InvitacionEmpleadoService.java` | Desactivar y cancelar una invitación dan `409` con el comercio suspendido; aceptar una invitación ya no es posible con el comercio `SUSPENDIDO`. |
| `services/AvisoCuentaService.java`, `services/EmailService.java`, `services/NotificacionService.java`, `repositories/NotificacionRepository.java` | Avisos T16 y T29 al Dueño con email de un solo intento y rastro por comercio, reenvío, y los dos avisos solo de la app para los Empleados (`crearParaEmpleados`). |
| `enums/AudienciaNotificacion.java`, `TipoNotificacion.java`, `MotivoNotaCredito.java`, `MotivoTimeoutPedido.java` | Valores nuevos (al final); audiencia nueva `EMPLEADOS`. |
| `services/AdministradorService.java`, `controllers/AdministradorController.java` | Se quitó `suspenderComercio`; endpoints `PUT /comercios/{id}/suspender` (ahora devuelve datos), `PUT .../levantar-suspension`, `GET .../suspension/previa`, `POST .../suspension/reenviar-email`; el listado trae origen, fecha, motivo y `ultimoEmailAvisoFallido` (consulta `NotificacionRepository.findComercioIdsConUltimoEmailFallido`, una por tipo de aviso). |
| `dto/request/SuspensionComercioRequestDTO.java` | Motivo de 10 a 500 caracteres. |
| `dto/response/ComercioAdminResponseDTO.java` (suma `ultimoEmailAvisoFallido`), `ComercioResponseDTO.java`, `MiComercioResponseDTO.java` (+ `MiComercioEmpleadoResponseDTO.java`, `services/MisComerciosService.java`) | Origen, fecha y motivo solo para el Administrador; fecha y motivo para el Dueño; el Empleado nunca los recibe (campos nulos que no se serializan). |
| `repositories/ComercioRepository.java`, `PedidoRepository.java`, `HistorialEstadoComercioRepository.java` | La lectura con bloqueo compartido trae `suspendido_desde`; consultas de los topes; se quitaron las dos consultas de `suspension_retiro_expira`. |
| `config/PedidoTimeoutProperties.java` | `preparacionSuspensionMinutos` (90). |
| `controllers/ComercioController.java` | La firma de la foto recibe el comercio activo completo. |
| `controllers/TestController.java`, `services/TestSupportService.java` | Atajos del perfil `test`: `PUT /test/comercios/{id}/suspension?origen=&minutos=&motivo=` y `PUT /test/comercios/{id}/envejecer-suspension?minutos=`; el clon de un comercio suspendido cumple el `CHECK`. |

## Tests

| Archivo | Qué |
|---|---|
| `SuspensionComercioIntegrationTest` (37 tests; 35 de la primera pasada más 2 del campo `ultimoEmailAvisoFallido` del listado de comercios) | Suspender y levantar (estados, conversión de origen, historial, avisos, emails con falla y reenvío, equipo, Empleado suspendido, Dueño bloqueado, cierre manual intacto, la suspensión prevalece), las restricciones del Dueño y del Empleado, los pedidos por estado, los dos topes de 90 minutos, el nombre y la foto del comercio, "Ir a pagar" y el `CHECK`. |
| `SuspensionComercioPagoIntegrationTest` (7 tests, 21 ejecuciones con las repeticiones de las carreras) | Webhook con Mercado Pago simulado: pago con el comercio suspendido, antes, tardío (`PAGO_TARDIO`) y tardío con el comercio suspendido; carreras suspender contra pago y desvincular contra pago. |
| `SuspensionComercioConcurrenciaIntegrationTest` (8 tests, 58 ejecuciones con las repeticiones) | Suspender contra aceptar, despachar y anular, crear pedidos, cerrar y abrir, Mercado Pago y documentos; levantar contra el tope; doble suspensión; suspender contra levantar. |
| `AptitudVentaComercioServiceTest` (26 tests, 82 ejecuciones con los parámetros; la rama `SUSPENDIDO` suma 5 tests con parámetros), `SuspensionComercioContratoTest` (5) | La rama `SUSPENDIDO` de `decidir` y el contrato de lo que ve cada actor. |
| Tests existentes ajustados | `AudienciaNotificacionTest`, `AdministradorServiceResolucionTest`, los tres `ComercioService*Test`, `PedidoNoRetiradoServiceTest`, `PedidoServiceCarreraTest`, `PedidoServiceRelojTest`, `PedidoServiceReembolsoTest`, `PedidoServiceVistaEmpleadoTest`, `PedidoServiceConfirmarPedidoLockTest`, `PedidoTransicionesIntegrationTest`, `PedidoNoRetiradoConcurrenciaIntegrationTest`, `PedidoAutoconfirmadoEquipoIntegrationTest`, `CierreTurnoConcurrenciaIntegrationTest`, `NotificacionesEquipoIntegrationTest`, `EscriturasEmpleado*`, `EscriturasCatalogoOrdenDeBloqueoIntegrationTest`, `GestionMiembroEquipoIntegrationTest`, `HorarioEdicion*`, `SuspensionClientePagoIntegrationTest`, `DatosPruebaEmpleado`. |
| `testing/playwright/scripts/build-suspension-comercio-fase5s2-postman.mjs` | Carpeta `81` de Newman (187 requests; incluye los tres casos del listado de comercios con el email enviado, fallido y reenviado). |
| `testing/playwright/scripts/stress-locks-tramoSuspension.mjs` (+ descripción en `correr-estreses.mjs`) | Escenarios 5 a 12 de comercio. |
| `testing/playwright/scripts/mutaciones-suspension-s2.mjs` | Ejecutor de las mutaciones N1 a N19 (N5 corre también `PedidoServiceCarreraTest`). |
| `PedidoServiceCarreraTest` (17 tests) | Los dos casos del tope de preparación (89 y 91 minutos desde `suspendido_desde`, con el pedido creado tres horas antes). |

## Documentación

`docs/diccionario-de-datos.md` (v1.30), `docs/DECISIONES.md`, `docs/APRENDIZAJES-TECNICOS.md`, `docs/CONCURRENCIA-Y-TRANSACCIONES.md`, `docs/entregables-01-02/CAMBIOS.md` (sección "Fase 5, tramo S2"), este archivo.
