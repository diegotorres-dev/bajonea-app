# Mapeo de archivos — Fase 5, tramo S3 (suspensión de la cuenta de un Dueño)

## Entrega A (backend, tests y documentación), 2026-10-30

### Migración

| Archivo | Qué |
|---|---|
| `backend/src/main/resources/db/migration/V48__suspension_dueno.sql` (nuevo) | Solo valores de ENUM, al final: `historial_estado_pedido.motivo_timeout` suma `SUSPENSION_DUENO_SIN_ATENCION`; `notificacion.tipo` suma `DUENO_SUSPENDIDO` y `DUENO_SUSPENSION_LEVANTADA`. Cambio de metadatos. |

### Backend — código nuevo

| Archivo | Qué |
|---|---|
| `services/SuspensionDuenoService.java` | Suspender, levantar, vista previa y reenvío del email de un Dueño, con la cascada a sus comercios. Orden de bloqueo: usuarios (id ascendente), relaciones, cuenta de Mercado Pago (al levantar), comercios (id ascendente). |
| `dto/response/SuspensionDuenoResponseDTO.java` | Respuesta de suspender y levantar: estado de la cuenta, comercios suspendidos, restaurados y que siguen suspendidos, pedidos pendientes rechazados y pedidos sin atención procesados. |
| `dto/response/SuspensionDuenoPreviaResponseDTO.java` | Vista previa: por comercio el efecto (`SE_SUSPENDE` o `QUEDA_COMO_ESTA` con su motivo), los pedidos por estado, los Empleados activos y quién atiende (`ATENDIDOS_POR_EMPLEADOS`, `SE_ANULAN_AL_INSTANTE`, `SIN_PEDIDOS_EN_PREPARACION`), más los topes de minutos. |
| `dto/response/DuenoAdminResponseDTO.java` | Una fila del listado de Dueños del Administrador. |

### Backend — código modificado

| Archivo | Cambio |
|---|---|
| `services/PedidoService.java` | `PedidoBloqueado` suma `estadoDueno` y `empleadosActivos`; `bloquearParaSinAtencion`; `procesarPedidosSinAtencionDelComercio`, `procesarPedidosSinAtencion` (el barrido) y `procesarPedidoSinAtencion` (una transacción por pedido). |
| `services/PedidoSchedulerService.java` | El séptimo proceso (cada 60 s) y su nombre para el atajo de test (`procesar-sin-atencion-suspension-dueno`). |
| `services/AvisoCuentaService.java` | `avisarSuspensionDueno`, `avisarLevantamientoDueno` (un solo email) y `reenviarEmailDuenoFallido`. |
| `services/EmailService.java` | `enviarDuenoSuspendido` y `enviarDuenoSuspensionLevantada`. |
| `services/AdministradorService.java` | `listarDuenos` y el `409` al aprobar con el Dueño suspendido. |
| `services/SuspensionComercioService.java` | No se levanta un comercio suspendido por separado mientras su Dueño está suspendido. |
| `services/SuspensionUsuarioService.java` | `estadoAlLevantar` visible en el paquete; el mensaje de la ruta de Clientes ante un Dueño. |
| `services/TextosPedidoActividad.java` | Texto de la actividad para la anulación del sistema. |
| `controllers/AdministradorController.java` | Los cinco endpoints nuevos. |
| `repositories/` (`ComercioRepository`, `DuenoRepository`, `EmpleadoComercioRepository`, `HistorialEstadoComercioRepository`, `PedidoRepository`) | `findIdsByDuenoId`, `contarComerciosPorDueno`, `findAllParaListadoAdmin`, `findEmpleadosActivosDeComercios`, `findRelacionesActivasDeComercios`, `findComerciosRestauradosPorLevantamientoDelDueno`, `findIdsDeComerciosSuspendidosConDuenoSuspendido`, `contarPorComercioYEstado`. |
| `enums/MotivoTimeoutPedido.java`, `enums/TipoNotificacion.java` | Los valores nuevos (audiencia `DUENO` los dos tipos). |

### Tests

| Archivo | Qué |
|---|---|
| `SuspensionDuenoTestBase.java` (nuevo) | Servicios, datos de prueba y lecturas directas. |
| `SuspensionDuenoIntegrationTest.java` (nuevo, 37 tests) | La cuenta, la cascada, la restauración, las aprobaciones, los pedidos con y sin Empleados, el barrido, los emails y avisos, la vista previa, el listado con el conteo de consultas y el rendimiento. |
| `SuspensionDuenoConcurrenciaIntegrationTest.java` (nuevo, 11 escenarios × 8 repeticiones) | Suspender contra login, aprobación, suspensión por separado, doble clic, levantar, acciones de un Empleado, pago aprobado, invitación, suspensión del Empleado y doble barrido. |
| `AudienciaNotificacionTest`, `SuspensionClienteIntegrationTest`, `AdministradorServiceResolucionTest` | Ajustes: los dos tipos nuevos, el mensaje de la ruta de Clientes ante un Dueño y el constructor del servicio. |
| `testing/playwright/scripts/mutaciones-suspension-s3.mjs` (nuevo) | 15 mutaciones con corrida base verde obligatoria. |
| `testing/playwright/scripts/build-suspension-dueno-fase5s3-postman.mjs` (nuevo) | Carpeta `85` de Newman (117 requests). |
| `testing/playwright/scripts/stress-locks-tramoSuspension.mjs` | Escenarios 15 a 21 (Dueños). |

### Documentación

`DECISIONES.md`, este archivo, `CONCURRENCIA-Y-TRANSACCIONES.md`, `APRENDIZAJES-TECNICOS.md`, `entregables-01-02/CAMBIOS.md`, `diccionario-de-datos.md` (v1.33) y la numeración en `CLAUDE.md`.
