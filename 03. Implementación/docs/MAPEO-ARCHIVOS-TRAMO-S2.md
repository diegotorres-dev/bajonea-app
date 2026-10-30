# Mapeo de archivos — Fase 5, tramo S2 (suspensión individual de un comercio)

Entrega A (backend, tests y documentación), 2026-10-29. Las entregas B1, B2, el cierre y la S2.1 siguen más abajo; todo el tramo S2 está hecho, commiteado y pusheado. Desde la S2.1 (2026-10-30) los pedidos pendientes de confirmación ya no quedan esperando: se rechazan solos al suspender (las secciones anteriores describen el comportamiento previo y la sección S2.1 lo reemplaza).

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

## Entrega B1 (2026-10-29): Administrador, rendimiento del listado de Clientes y specs

La entrega B se divide en dos. La B1 cubre el listado de Clientes, las etiquetas de reembolso, las pantallas del Administrador para suspender y levantar un comercio y el arreglo de los specs de Playwright. La B2 (panel del Dueño y del Empleado, selector, equipo, topes de 90 minutos en las acciones de pedidos y pantallas del Cliente) está hecha más abajo. Hecha y commiteada.

### Backend (solo el listado de Clientes, código de S1)

| Archivo | Cambio |
|---|---|
| `repositories/ClienteRepository.java` | `findAllParaListadoAdmin`: una consulta con `JOIN FETCH` de persona física, persona y usuario, por id. |
| `repositories/HistorialEstadoUsuarioRepository.java` | `findEstadoPrevioDeLaUltimaSuspension`: el estado de origen de la última suspensión de todos los Clientes suspendidos de la lista, en una sola consulta. |
| `services/AdministradorService.java` | `listarClientes` (ahora de solo lectura) usa las dos consultas anteriores y las dos de emails fallidos: cinco consultas fijas en total. Antes recorría `findAll()` y consultaba perfil, persona, usuario e historial de a uno por cliente. La respuesta es idéntica byte a byte (comparada con 2575 clientes). |
| `AdministradorListadoClientesConsultasIntegrationTest` (test nuevo, 2 tests) | La cantidad de consultas del listado no crece con la cantidad de Clientes ni de suspendidos (`Statistics` de Hibernate; con el código anterior falla: 7839 contra 7869 consultas), el estado previo de la suspensión y el orden por id. |

### Frontend

| Archivo | Qué |
|---|---|
| `js/admin-hojas.js` (nuevo) | Los componentes de las hojas que ya existían dentro de `admin-clientes.js` (`abrirHoja`, `cajaInformativa`, `campoTexto`, `texto`, `plural`, `fechaLegible`), ahora compartidos. `js/admin-clientes.js` los importa; sin cambios de comportamiento ni de `data-testid`. |
| `js/admin-comercio-suspension.js` (nuevo) | El bloque "Suspendido" del detalle del comercio (chip, desde cuándo, motivo, explicación del origen `DUENO`, "No se envió el email" con "Reenviar"), la hoja "Suspender {comercio}" con la vista previa (`lineasDeLaVistaPrevia`) y la hoja "Levantar suspensión". |
| `js/admin.js` | El modal de detalle de comercio usa `crearControlesSuspension`; se borró `mostrarModalSuspenderComercio` (el modal anterior, sin vista previa ni validación de 10 caracteres); `LABELS_MOTIVO_REEMBOLSO` suma `SUSPENSION_CLIENTE` ("Suspensión de cuenta"), `PAGO_TARDIO` ("Pago tardío") y `RECLAMO` ("Reclamo"). |
| `css/styles.css` | `.comercio-suspension*` (bloque del detalle) y un arreglo de una regresión de S1: `.cliente-admin-row` pasó a ser una fila `flex` y las tarjetas de `admin-reembolsos.html` (que reutilizan esa clase) quedaron con el contenido en columnas de una letra y 417 px de desborde horizontal a 375 px; se agrega `.cliente-admin-row.reembolso-row { display: block }`. |

El detalle del comercio suspendido vive en el modal "Ver detalle" de `admin-comercios.html` (el listado de todos los comercios, en cualquier estado), no en `admin-comercio-detalle.html`: esa pantalla solo carga las solicitudes pendientes y nunca recibe un comercio suspendido.

### Tests

| Archivo | Qué |
|---|---|
| `testing/playwright/tests/85-suspension-comercio-ui.spec.ts` (nuevo, 11 tests, 375 px) | Suspender sin pedidos y con pedidos de cada estado, validación y contador, doble clic, Escape y Cancelar, `409` por suspensión simultánea, levantar con y sin mensaje, comercio con y sin cuenta de cobro, origen `DUENO`, email fallido y reenviado, comercio no suspendible y etiquetas de reembolso. Capturas en `docs/capturas-suspension-comercio/`. |
| Specs `24`, `26`, `40`, `43`, `45`, `47` y `56` | Actualizados al comportamiento nuevo de S2 (detalle en `docs/DECISIONES.md`, 2026-10-29, entrega B1). Helper nuevo `sentenciaEstadoComercio` en `tests/helpers/backend.ts`; `ponerEstadoComercio` (`helpers/empleado.ts`) lo usa. |

## Entrega B2 (2026-10-29): Dueño, Empleado y Cliente con el comercio suspendido

Hecha y commiteada. Hechos con los mockups 5 (opción B), 6, 8 (opción A) y 9 (opción C) de la entrega A.

### Migración

| Archivo | Qué |
|---|---|
| `backend/src/main/resources/db/migration/V46__historial_pedido_cancelacion_sin_pago.sql` (nuevo) | Suma `CANCELACION_SIN_PAGO` al ENUM `historial_estado_pedido.motivo_timeout`. Lo escribe la cancelación de un pedido sin pagar por el Cliente y la actividad del comercio lo excluye (el comercio nunca vio ese pedido). **La numeración libre pasa a ser `V47`.** |

### Backend

| Archivo | Cambio |
|---|---|
| `dto/response/SuspensionComercioPreviaResponseDTO.java`, `services/SuspensionComercioService.java` | La vista previa trae `topePreparacionMinutos` y `topeRetiroMinutos`, leídos de `PedidoTimeoutProperties` (la misma propiedad que usan los procesos); el frontend dejó de decir "90" fijo. |
| `dto/response/PedidoResponseDTO.java`, `PedidoEmpleadoResponseDTO.java`, `services/PedidoService.java` | `limiteResolucionSuspension` (solo en las respuestas del comercio y del Empleado, con el comercio suspendido: `EN_PREPARACION` vence a `suspendido_desde` + tope; `LISTO_PARA_RETIRAR` al posterior entre que quedó listo y la suspensión + tope; el resto `null`), `comercioNoDisponible` (pedido `PENDIENTE_PAGO` de un comercio suspendido; solo lo lee el Cliente) y `reembolsoMotivo` (motivo de la nota de crédito más reciente; el Cliente lo usa para explicar una cancelación por suspensión). El DTO del Empleado suma solo el límite. |
| `services/PedidoService.cancelarPedido` | El Cliente puede cancelar un pedido `PENDIENTE_PAGO`: pasa a `CANCELADO` con su fila de historial (`CANCELACION_SIN_PAGO`), sin nota de crédito y sin aviso al equipo. Si un pago aprobado llega después, el flujo existente de pago tardío lo reembolsa. |
| `repositories/HistorialEstadoPedidoRepository.java` | La actividad del comercio y la trazabilidad excluyen `CANCELACION_SIN_PAGO` (como `TIMEOUT_PAGO`). |
| `services/ComercioService.validarAceptaPedidos`, `exceptions/ConflictoComercioException.java` | Con el comercio `SUSPENDIDO` responde `409` con el código `COMERCIO_SIN_PEDIDOS` y el texto "Este comercio no está recibiendo pedidos por ahora. Probá con otro comercio." (carrito y confirmación del pedido). Los demás estados conservan el texto genérico. |

### Frontend

| Archivo | Qué |
|---|---|
| `js/comercio-suspendido.js` (nuevo) | La tarjeta de estado del panel (`pintarTarjetaSuspension`), el bloqueo de controles con su frase (`protegerPorSuspension`, que se desbloquea solo al levantarse), la franja y el texto de cada pedido en curso. |
| `js/comercio-activo.js`, `js/selector-comercio.js` | Un comercio `SUSPENDIDO` es seleccionable para el Dueño (`esSeleccionable`): entra por el panel en vez de volver al login, aparece en el grupo "Suspendidos" del panel "Tus comercios" y la franja lleva el chip "Suspendido". |
| `js/comercio.js` | Tarjeta de estado en el panel; franja y textos en la lista de pedidos y en el detalle (sin "Aceptar pedido" con el comercio suspendido); la lista y el detalle se refrescan solos con el sondeo de 15 s mientras el comercio está suspendido y cuando se levanta; edición de comercio, horarios, foto y desvincular Mercado Pago bloqueados; productos en solo lectura con aviso. |
| `js/equipo-comercio.js` | Equipo en solo lectura: sin "Invitar", sin menú por miembro ni por invitación, con aviso. |
| `js/pedidos.js` (Cliente) | Chip "Sin pagar" y línea "Este comercio no está recibiendo pedidos por ahora." en la tarjeta; detalle con franja, "Ir a pagar" deshabilitado, la explicación y "Cancelar pedido"; texto "El comercio fue suspendido. Te devolvemos el dinero." para un pedido cancelado por la suspensión; nombre y foto del pedido desde la respuesta (un comercio suspendido ya no está en el catálogo); el detalle sondea cada 15 s mientras el pedido espera el pago. |
| `js/apertura-comercio.js` | `esConflictoDeCierre` también reconoce el código `COMERCIO_SIN_PEDIDOS`: el carrito, el modal de producto y el checkout muestran el aviso con "Volver al catálogo". |
| `js/admin-comercio-suspension.js` | Los minutos de la hoja "Suspender" salen de la vista previa. |
| `css/styles.css` | `.suspension-tarjeta*`, `.suspension-franja`, `.bloqueo-suspension__texto`, `.pedido-card__suspension`, `.pedido-card__aviso-comercio`, `.pedido-detalle__suspension`, chips de "Suspendido" y `.equipo-solo-lectura`. |

### Tests

| Archivo | Qué |
|---|---|
| `SuspensionComercioServiceVistaPreviaTest` (nuevo, 2 tests) | Los topes por defecto y los configurados. |
| `SuspensionComercioIntegrationTest` (+7 tests) | Los topes en la vista previa (con y sin cambiar la configuración), la hora límite por estado para el Dueño y el Empleado, su cálculo con topes configurados y su desaparición al levantar, `comercioNoDisponible`, el `409` con código, la cancelación de un pedido sin pagar (sin nota, sin aviso y fuera de la actividad) y el motivo del reembolso. |
| `SuspensionComercioConcurrenciaIntegrationTest` (+5 tests con 8 repeticiones) | Despachar y anular, como Dueño y como Empleado, contra el proceso de 90 minutos (un solo ganador, una sola nota); doble clic en despachar. |
| `ComercioServiceValidarAceptaPedidosTest` | El comercio suspendido tiene su propio texto y código. |
| `testing/playwright/scripts/build-suspension-comercio-b2-postman.mjs` | Carpeta `82` de Newman (71 requests). Se eligió una carpeta propia y no ampliar la 81 porque necesita un comercio, un Cliente y un Empleado nuevos y recorre dos suspensiones seguidas. |
| `testing/playwright/tests/86-suspension-comercio-paneles-ui.spec.ts` (nuevo, 16 tests a 375 px) | Todo lo de arriba en pantalla; capturas en `docs/capturas-suspension-comercio-b2/`. |
| `testing/playwright/scripts/stress-locks-tramoSuspension.mjs` | Escenario 13: despachar, anular y doble clic contra el proceso de 90 minutos. |
| Specs `27`, `37`, `38`, `44`, `52`, `53`, `70`, `83` | `27`: un comercio suspendido ya no queda en el login ni en "Otros" (el fixture grande usa `CERRADO_TEMPORALMENTE` y se agregan tests para el suspendido y el inactivo); `37` y `44` suman `limiteResolucionSuspension` a la lista blanca de campos del Empleado (y el constructor de la carpeta `57`); `38`, `52` y `53` pasan a los textos nuevos; `52`, `53` y `70` abren la pantalla con el comercio operativo y lo suspenden antes de la acción (pestaña vieja), porque ahora el botón viene bloqueado; `83` usa el `baseURL` de la configuración en vez del puerto fijo 5501. |

## Cierre (2026-10-30): documentos con el comercio suspendido, carrera del pago tardío y corridas finales

Hecho y commiteado. Sin migraciones.

### Backend

| Archivo | Cambio |
|---|---|
| `services/DocumentoComercioService.java` | `ESTADOS_QUE_PERMITEN_SUBIR` suma `SUSPENDIDO`; el Javadoc de la clase explica que el recálculo no mueve un comercio suspendido. Es el único cambio de la regla: `AptitudVentaComercioService` ya excluía a `SUSPENDIDO` del recálculo de documentos. |
| `services/ReembolsoService.java` | `prepararIntento` lee el monto ya cubierto con `montoCubiertoConfirmado` (transacción nueva, foto actual, sin bloqueos) en vez de una consulta común dentro de la transacción del webhook: corrige la doble nota de crédito de dos webhooks simultáneos (ver `docs/DECISIONES.md`, 2026-10-30). |

### Frontend

| Archivo | Cambio |
|---|---|
| `frontend/js/documentos.js`, `css/styles.css` | Aviso `aviso-comercio-suspendido` arriba de la pantalla de documentación con el comercio suspendido (`.doc-aviso-suspension` le da el margen). |
| `frontend/js/selector-contexto.js` | El comercio suspendido dice "Comercio suspendido. Solo podés resolver pedidos en curso." en la hoja "Cambiar de cuenta" y en el selector del Empleado. |

### Tests y scripts

| Archivo | Qué |
|---|---|
| `DocumentoComercioHttpIntegrationTest` (+3) | Subir, listar, ver, descargar y eliminar con el comercio suspendido; el Administrador aprueba, rechaza y revoca sin mover el estado; `404` para el Dueño ajeno y `403` para el Empleado. |
| `SuspensionComercioConcurrenciaIntegrationTest` (+3 con 8 repeticiones) | Subir contra levantar la suspensión (con y sin documento aprobado) y subir y aprobar contra suspender. |
| `ReembolsoFotoDeLaTransaccionIntegrationTest` (nuevo, 1 test) | Fija la foto vieja de una transacción y comprueba que no se crea una segunda nota. |
| `ReembolsoServiceTest`, `ReembolsoServiceReintentoTest` | Sin cambios netos (se ajustaron y se volvieron a su forma original al descartar el primer intento de arreglo). |
| `testing/playwright/scripts/build-suspension-comercio-cierre-postman.mjs` | Carpeta `83` de Newman (43 requests, multipart con el PDF de prueba). |
| `testing/playwright/scripts/mutaciones-suspension-s2-cierre.mjs` | Mutaciones C1 a C4 con corrida base obligatoria. |
| `testing/playwright/scripts/repetir-carrera-pago-suspension.sh` | Repite la carrera suspender contra pago tardío, sola y con tres procesos de Maven a la vez. |
| `testing/playwright/tests/87-suspension-comercio-documentos-ui.spec.ts` (nuevo, 4 tests a 375 px) | El Dueño sube con el comercio suspendido, el estado no cambia al subir, aprobar ni rechazar, al levantar queda según los documentos, y el Empleado ve el texto nuevo; capturas `13` a `16` de `docs/capturas-suspension-comercio-b2/`. |
| Specs `38`, `82`, `86` | Ajustados a la regla nueva (texto del Empleado, estados que permiten subir, subida ya no bloqueada). |

## S2.1 (2026-10-30): los pendientes de confirmación se rechazan solos al suspender

Reemplaza la regla de las secciones anteriores sobre los pedidos pendientes (decisión de Diego; detalle y respuestas a las verificaciones en `docs/DECISIONES.md`, 2026-10-30).

### Migración

| Archivo | Qué hace |
|---|---|
| `backend/src/main/resources/db/migration/V47__historial_pedido_rechazo_por_suspension.sql` | `historial_estado_pedido.motivo_timeout` suma `SUSPENSION_COMERCIO` al final del ENUM. |

### Backend

| Archivo | Cambio |
|---|---|
| `enums/MotivoTimeoutPedido.java` | Valor `SUSPENSION_COMERCIO`. |
| `services/PedidoService.java` | `rechazarPendientesDelComercioSuspendido(comercioId)`, `rechazarPendientesDeComerciosSuspendidos()` y `rechazarPendientePorSuspension` (una transacción por pedido, bloqueo del orden global, revalidación, nota `SUSPENSION_COMERCIO`, aviso al Cliente). |
| `services/SuspensionComercioService.java` | `suspender` llama al procesamiento después del commit; recibe `PedidoService` en el constructor. |
| `services/PedidoSchedulerService.java` | Proceso `rechazarPendientesPorSuspension` (60 s) y el nombre `rechazar-pendientes-suspension` para `ejecutar`. |
| `repositories/PedidoRepository.java` | `findIdsDeComerciosSuspendidos(estado)` (filtro grueso del barrido). |
| `services/TextosPedidoActividad.java` | Texto del rechazo del sistema en la actividad. |
| `services/TestSupportService.java`, `controllers/TestController.java` | Atajo `PUT /api/v1/test/comercios/{id}/reanudar-sin-procesar`. |

### Frontend

| Archivo | Cambio |
|---|---|
| `js/admin-comercio-suspension.js` | Línea de pendientes de la hoja (singular y plural). |
| `js/comercio-suspendido.js` | Texto "Se va a rechazar y reembolsar solo." |
| `js/pedidos.js` | Texto del Cliente para un `RECHAZADO` por la suspensión (`rechazadoPorSuspensionDelComercio`). |

### Tests y scripts

| Archivo | Qué cubre |
|---|---|
| `SuspensionComercioRechazoPendientesIntegrationTest` (nuevo, 37 tests) | Ver `docs/DECISIONES.md`. |
| `SuspensionComercioIntegrationTest`, `SuspensionComercioPagoIntegrationTest`, `SuspensionComercioConcurrenciaIntegrationTest`, `SuspensionComercioServiceVistaPreviaTest` | Ajustados a la regla nueva (aserciones reemplazadas, no debilitadas; el constructor suma `PedidoService`). |
| `scripts/build-suspension-comercio-s21-postman.mjs` | Carpeta `84` de Newman (73 requests, siempre después de la `83`). |
| `scripts/build-suspension-comercio-fase5s2-postman.mjs` | Carpeta `81` ajustada (pendientes rechazados; ventana por atajo). |
| `tests/88-suspension-comercio-pendientes-ui.spec.ts` (nuevo, 4 tests a 375 px) | Hoja, Dueño y Cliente; capturas `17` a `20` de `docs/capturas-suspension-comercio-b2/`. |
| Specs `40`, `85`, `86` | Ajustados a la regla nueva. |
| `scripts/stress-locks-tramoSuspension.mjs` | Escenario nuevo 14 y escenarios 6 y 7 actualizados. |
