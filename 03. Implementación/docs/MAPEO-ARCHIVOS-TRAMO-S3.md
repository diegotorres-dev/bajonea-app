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

## S3.1 (2026-10-30): conexiones anidadas y pool

Ninguna transacción pide una segunda conexión mientras sostiene la primera. Detalle del diseño en `docs/CONCURRENCIA-Y-TRANSACCIONES.md` ("Regla de las conexiones") y de la decisión en `docs/DECISIONES.md`.

### Código

| Archivo | Cambio |
|---|---|
| `util/ColaPostTransaccion.java` (nuevo) | Cola por hilo de los efectos hacia afuera (email, pedido a Mercado Pago, registro de su resultado) y contador de transacciones abiertas del hilo; los corre cuando termina la última. Sin un gestor que la vacíe (pruebas unitarias con la sincronización simulada) la acción corre en el acto. |
| `util/EjecucionPostCommit.java` | El `afterCommit` ya no corre la acción: la encola en `ColaPostTransaccion`. |
| `config/GestorTransacciones.java` (nuevo) | `JpaTransactionManager` que avisa a la cola cuándo empieza (`doBegin`) y cuándo termina (`doCleanupAfterCompletion`, después de soltar la conexión) cada transacción del hilo. |
| `config/TransaccionesConfig.java` (nuevo) | Registra ese gestor en lugar del que arma Spring Boot (mismos personalizadores). |
| `services/ReembolsoService.java` | Se fue `montoCubiertoConfirmado` (la transacción `REQUIRES_NEW` dentro de la del pedido). `prepararIntento` inserta la nota y verifica después, con una lectura bloqueante de las demás notas del pago, que no haya otra que ya cubra el monto (si la hay, borra la propia). La llamada a Mercado Pago y el registro de su resultado van por `EjecucionPostCommit` y una transacción normal (`REQUIRED`, ya no `REQUIRES_NEW`). |
| `services/NotaCreditoService.java`, `repositories/NotaCreditoRepository.java` | `otrasNotasCubrenElPago` (consulta nativa `FOR UPDATE` de estado y monto de las demás notas del pago) y `eliminar`. |
| `services/AvisoCuentaService.java` | `enviarYRegistrar` y los reenvíos usan una transacción normal en lugar de `REQUIRES_NEW`: el email sale cuando la transacción de negocio ya terminó y el rastro se escribe en una transacción corta propia. Los llamadores (suspensión de Cliente, de comercio y de Dueño, y sus levantamientos y reenvíos) no cambiaron. |
| `application.properties`, `application-test.properties` | El pool de Hikari con valores explícitos (20 conexiones, 15 s de espera, 5 ociosas, keepalive y fugas); el perfil de test conserva el tamaño y la espera por defecto (10 y 30 s). |

### Tests

| Archivo | Qué |
|---|---|
| `ConexionesAnidadasPoolDiminutoIntegrationTest.java` (nuevo, 7 ejecuciones) | Pool de 3 conexiones y 4 s de espera: 12 webhooks (6 pagos, 2 cada uno) con una nota por pago, 9 suspensiones de Clientes con email y 5 de Dueños. Con el código anterior las 7 ejecuciones fallan con `Connection is not available`. |
| `EfectosPosterioresSinTransaccionIntegrationTest.java` (nuevo, 6 tests) | El email de la suspensión de un Cliente, de un Dueño y de un comercio y el pedido a Mercado Pago salen sin transacción ni recursos atados al hilo y después del commit; un email que falla deja la suspensión y una fila `FALLIDO` con un solo intento; una transacción que se revierte no manda nada. |
| `ReembolsoServiceTest`, `NotaCreditoServiceTest` | Ajustes al nuevo `prepararIntento` y pruebas de `otrasNotasCubrenElPago`. |
| `ReembolsoFotoDeLaTransaccionIntegrationTest` | Sin cambios: sigue fallando sin la verificación de notas y pasando con ella. |

### Documentación

`DECISIONES.md`, este archivo, `CONCURRENCIA-Y-TRANSACCIONES.md`, `APRENDIZAJES-TECNICOS.md`, `LISTA-DE-DESPLIEGUE.md` y la regla 16 de `CLAUDE.md`.
