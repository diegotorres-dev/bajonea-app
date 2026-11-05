# Mapeo de archivos — Fase 5, tramo S5 (Reclamos), entrega A

Solo backend, migración, tests, scripts y documentación. Las pantallas (Cliente, Administrador y Dueño) son la entrega B; las fotos del reclamo son una sub-entrega al final de S5 (migración `V51`, otro prompt). Números usados: migración `V50`, carpeta de Newman `89`, estrés escenario `23`, diccionario de datos v1.35. El spec `94` de Playwright queda reservado para la entrega B.

## Migración

| Archivo | Qué hace |
|---|---|
| `backend/src/main/resources/db/migration/V50__reclamos.sql` | Amplía `reclamo` (`motivo`, `tipo_resolucion`, `monto_aprobado`, el `CHECK ck_reclamo_resolucion` y el índice `idx_reclamo_estado_fecha`), liga `nota_credito` al reclamo (`reclamo_id` con `UNIQUE uq_nota_credito_reclamo` y FK) y agrega `RECLAMO_REEMBOLSO_DUENO` al ENUM de `notificacion.tipo`. No borra ni inventa datos. |

## Backend nuevo (`backend/src/main/java/com/bajonea/backend/`)

| Archivo | Qué es |
|---|---|
| `entities/Reclamo.java` | Entidad del reclamo (ids como columnas simples, sin relaciones). |
| `enums/EstadoReclamo.java`, `MotivoReclamo.java`, `TipoResolucionReclamo.java` | Los tres enums del reclamo (6 motivos; `REEMBOLSO_TOTAL`, `REEMBOLSO_PARCIAL`, `RECHAZO`). |
| `repositories/ReclamoRepository.java` | Consultas del reclamo: por pedido, el id del pedido de un reclamo, lectura bloqueante `FOR UPDATE` por id, bandeja por filtro (nativas, una consulta por página) y contadores de los tres filtros. |
| `services/PoliticaReclamo.java` | Elegibilidad: `ENTREGADO`, pago aprobado y confirmado, fecha de entrega, plazo de `reclamo.plazo-dias` (7) días corridos, motivos disponibles según la modalidad. La usan la creación y el armado del bloque. |
| `services/ReclamoVistaService.java` | Arma el bloque `reclamo` de las respuestas de pedido por rol, para una lista de pedidos con tres consultas como máximo. |
| `services/ReclamoService.java` | Crear un reclamo (Cliente). |
| `services/ReclamoAdminService.java` | Bandeja, detalle y resolución (Administrador). |
| `services/AvisoReclamoService.java` | Avisos de la resolución: aviso y email al Cliente, aviso al Dueño solo si hubo reembolso. |
| `controllers/ReclamoController.java` | `POST /api/v1/pedidos/cliente/{id}/reclamo`. |
| `controllers/ReclamoAdministradorController.java` | `GET /api/v1/administrador/reclamos`, `GET /{id}` y `PUT /{id}/resolver`. |
| `dto/request/ReclamoRequestDTO.java`, `ResolverReclamoRequestDTO.java` | Entradas. |
| `dto/response/ReclamoPedidoResponseDTO.java`, `ReclamoAdminResponseDTO.java` | Bloque por rol de las respuestas de pedido; bandeja, detalle y reembolso del Administrador. |

## Backend modificado

| Archivo | Cambio |
|---|---|
| `entities/NotaCredito.java` | Columna `reclamoId`. |
| `enums/TipoNotificacion.java` | `RECLAMO_REEMBOLSO_DUENO` (audiencia `DUENO`). |
| `repositories/NotaCreditoRepository.java`, `PagoRepository.java` | `findByReclamoIdIn`, `findByPedidoIdIn`. |
| `services/NotaCreditoService.java` | Notas de un reclamo (`crearDeReclamo`, `crearDeReclamoPendienteRevisionManual`), `montoCubiertoPorOtrasConBloqueo`, `ajustarMonto`, `listarPorReclamos`. |
| `services/MercadoPagoReembolsoClient.java` | `solicitarReembolsoParcial` (cuerpo `{"amount": monto}`), lectura defensiva de la respuesta y un texto propio para "saldo insuficiente". El total sigue mandando el cuerpo vacío. |
| `services/ReembolsoService.java` | `generarNotaDeReclamo` (nota dentro de la transacción de la resolución, llamada a Mercado Pago después del commit); `solicitarYRegistrar` manda el monto solo si es menor que el del pago, así que el reintento manda el monto de la nota. |
| `services/PedidoService.java` | Las respuestas del Cliente y del Dueño llevan el bloque `reclamo`; los campos `reembolso*` ignoran las notas de un reclamo. |
| `services/EmailService.java` | `enviarReclamoResuelto`. |
| `services/AdministradorService.java`, `dto/response/MetricasAdminResponseDTO.java` | `reclamosPendientes` en las métricas. |
| `dto/response/PedidoResponseDTO.java` | Campo `reclamo`. El DTO del Empleado no cambia. |

## Tests nuevos (`backend/src/test/java/com/bajonea/backend/services/`)

| Archivo | Tests | Qué cubre |
|---|---|---|
| `ReclamoIntegrationBase.java` | — | Base: pedido entregado con pago aprobado, cuenta de Mercado Pago, Mercado Pago y emails simulados. |
| `ReclamoCrearIntegrationTest.java` | 27 | Elegibilidad completa (cada estado, pago, fecha, plazo justo y vencido, retiro con `NO_RECIBI_PEDIDO`, ajeno, suspendido), un reclamo por pedido, el bloque del Cliente. |
| `ReclamoResolverIntegrationTest.java` | 23 | Las tres resoluciones, tope por saldo, nota ligada y única, falla de Mercado Pago, reintento de un parcial y de un total, cuenta desvinculada, avisos y emails, bloque del Dueño. |
| `ReclamoHttpIntegrationTest.java` | 9 | Contrato HTTP y seguridad, bloque por rol (el Empleado no recibe nada), bandeja, contador del panel, ausencia de N+1. |
| `ReclamoFotoDeLaTransaccionIntegrationTest.java` | 4 | Determinístico: la creación y la resolución esperan el bloqueo del pedido (y la resolución el del pago) y deciden con lo último confirmado. |
| `ReclamoConcurrenciaIntegrationTest.java` | 72 (9 × 8) | Las carreras pedidas, cada una repetida 8 veces. |
| `ReclamoPoolDiminutoIntegrationTest.java` | 1 | Ni el email ni Mercado Pago con una conexión tomada (pool de 3, 1,5 s de latencia). |
| `PoliticaReclamoTest.java`, `NotaCreditoServiceReclamoTest.java`, `EmailServiceReclamoTest.java` | 16, 6, 3 | Unitarios. |
| `MercadoPagoReembolsoClientTest.java` (ampliado) | +7 | Cuerpo con `amount`, lectura defensiva, saldo insuficiente. |
| `EnumsContraBaseDeDatosIntegrationTest.java`, `AudienciaNotificacionTest.java` (ampliados) | +1, +1 fila | Enums nuevos contra la base. |
| `MercadoPagoSimulado.java` (ampliado) | — | Registra los cuerpos y las claves de los reembolsos y permite hacerlos fallar. |
| `PedidoService*Test.java` (6 clases) y `AdministradorServiceResolucionTest.java` | — | Solo el argumento nuevo del constructor. |

## Scripts y colecciones (`testing/playwright/scripts/`)

| Archivo | Qué es |
|---|---|
| `build-reclamos-fase5s5-postman.mjs` | Constructor de la carpeta `89` de Newman (va última; necesita el Mercado Pago simulado). |
| `mp-simulado.mjs` | El simulado registra el cuerpo y la clave de cada reembolso (`GET /__control/reembolsos`) y puede hacerlos fallar (`PUT /__control/reembolsos/falla?mensaje=`). |
| `stress-locks-tramoReclamos.mjs` | Estrés, escenario `23` (id `reclamos` del runner). |
| `mutaciones-reclamos-s5.mjs` | 20 mutaciones con corrida base verde obligatoria. |
| `correr-estreses.mjs` | Registra el estrés `reclamos`. |

## Atajo de test nuevo

`PUT /api/v1/test/pedidos/{id}/envejecer-entrega?dias=` (perfil `test`): retrocede `fecha_entrega` para probar el plazo de 7 días sin esperar (`TestController`, `TestSupportService`).

# Entrega B (pantallas, specs y capturas), 2026-11-05

Frontend, tres specs de Playwright, capturas y documentación. Sin migraciones. Números: specs `94`, `95` y `96` (Newman, estrés y diccionario no cambian; próximos libres: `V51`, carpeta `90`, spec `97`, estrés `24`, diccionario v1.36). Las fotos del reclamo (`V51`) no se hicieron: ninguna pantalla tiene campos, botones ni placeholders de fotos.

## Frontend nuevo (`frontend/`)

| Archivo | Qué es |
|---|---|
| `js/reclamos-comun.js` | Etiquetas de los motivos y de los estados, formato de montos con centavos solo cuando los hay (`$1.250,50`), el chip del listado y los bloques de solo lectura del Cliente ("Tu reclamo") y del Dueño ("Reclamo del Cliente"). Los textos del Cliente y del Administrador se escriben siempre con `textContent`. |
| `reclamo-nuevo.html`, `js/reclamo-nuevo.js` | Formulario del Cliente (`?pedido=N`): motivos del desplegable según `reclamo.motivosDisponibles` (los textos solo son etiquetas del enum), contador "N / 1000 · mínimo 10", envío con "Enviando…", errores del servidor por campo o en un aviso con foco, y la pantalla "Recibimos tu reclamo". Un pedido ajeno, inexistente, ya reclamado o fuera de plazo muestra el motivo y "Volver al pedido". |
| `admin-reclamos.html`, `js/admin-reclamos.js` | Bandeja (tres filtros con los contadores de la API; vacío por filtro; reintentar ante un error) y detalle (`?id=N`) con la resolución: tres opciones, monto que solo acepta números con dos decimales, motivo con contador "N / 500 · mínimo 10", modal de confirmación con "Cancelar" y la salida de un reclamo ya resuelto (incluido el reembolso que no se pudo hacer, con el motivo y el enlace a Reembolsos). Solo `ADMINISTRADOR` (si no, `login.html`). |

## Frontend modificado

| Archivo | Cambio |
|---|---|
| `js/pedidos.js` | Detalle del Cliente: `renderReclamoCliente` (botón y aviso de plazo, el aviso de plazo vencido con el botón deshabilitado, o el bloque "Tu reclamo") debajo del total; chip de reclamo en la tarjeta del listado, con el bloque que ya llega en `GET /pedidos/cliente` (sin consultas nuevas). |
| `js/comercio.js` | Detalle del pedido del Dueño: bloque de solo lectura debajo del total. El Empleado no lo recibe: la API no manda `reclamo` en su DTO y el código lo ignora si llegara con `vistaReducida`. |
| `js/admin.js` | Entrada "Reclamos" en la grilla de gestión del panel, con `reclamosPendientes`. |
| `css/styles.css` | `reclamo-ofrecimiento`, `reclamo-bloque` y sus partes, `reclamo-chip-lista`, `reclamo-opciones` y `reclamo-opcion`, `reclamo-saldo`. |

## Backend (cambios mínimos autorizados)

| Archivo | Cambio |
|---|---|
| `services/PedidoService.java` | El aviso de autoconfirmación al Cliente dice "Marcamos tu pedido #N como entregado. Si tuviste algún problema, podés reclamar dentro de los 7 días desde esta fecha." (el `7` está escrito en el texto, como en la pantalla del servidor para el plazo vencido: si se cambia `reclamo.plazo-dias` hay que cambiarlo acá). |
| `dto/response/ReclamoPedidoResponseDTO.java`, `services/ReclamoVistaService.java`, `services/PoliticaReclamo.java` | Campo nuevo `avisoPlazoVencido`: el texto "Pasaron los 7 días para reclamar este pedido." solo para un pedido que se podía reclamar en todo lo demás (entregado, pago aprobado, con fecha de entrega) y cuyo plazo venció. Sin él el frontend no puede distinguir un plazo vencido de un pedido que nunca fue reclamable sin calcular fechas. `PoliticaReclamo.avisoPlazoVencido` lo calcula con la misma regla que `motivoDeNoElegible`. |

## Tests

| Archivo | Tests | Qué cubre |
|---|---|---|
| `tests/94-reclamos-cliente-ui.spec.ts` | 14 | Botón solo cuando corresponde (ausente en rechazado, cancelado, en preparación y no retirado), plazo vencido deshabilitado, motivos de domicilio y de retiro, validaciones por campo con foco y contador, envío con "Enviando…" sin doble envío, error del servidor visible con foco, segundo reclamo imposible, pedido ajeno o inexistente, los tres resultados (aprobado total, parcial con el reembolso en proceso, rechazado con el motivo literal y el botón a Soporte), HTML mostrado literal, chips del listado y el aviso de entrega automática con el texto nuevo. |
| `tests/95-reclamos-administrador-ui.spec.ts` | 13 | Tarjeta y contador del panel, bandeja (filtros con contadores, más viejos arriba, vacío por filtro, error con reintento), detalle de un pendiente (mensaje literal, productos, saldo), sin opción elegida, reembolso total con modal y "Cancelar", parcial (solo números con dos decimales, tope, monto con decimales), rechazo (motivo mínimo y máximo, aviso al Cliente), segundo intento con el reclamo ya resuelto, reembolso fallido con el motivo y el camino a Reembolsos, reclamo resuelto en solo lectura, reclamo inexistente y acceso denegado a otros roles. |
| `tests/96-reclamos-dueno-empleado-ui.spec.ts` | 8 | Bloque del Dueño en los tres estados (sin el mensaje del Cliente ni el motivo del rechazo), sin bloque cuando no hay reclamo, aviso del reembolso en la campana y navegación al pedido, ningún aviso en un rechazo, el Empleado sin bloque ni aviso ni campo en la respuesta, y el comercio suspendido en solo lectura. |
| `tests/helpers/reclamos.ts` | — | Escenario (Dueño con Mercado Pago simulada, producto, Cliente), pedido entregado por el camino real (preferencia y webhook contra el simulado), reclamo y resolución por API, reembolsos que fallan y capturas. |
| `PoliticaReclamoTest`, `ReclamoCrearIntegrationTest`, `PedidoAutoconfirmadoEquipoIntegrationTest` | +1, +2 aserciones, +1 aserción | `avisoPlazoVencido` y el texto nuevo del aviso. |
| `tests/49-pedidos-autoconfirmado-equipo-api.spec.ts`, `build-pedidos-autoconfirmado-tramoE3-A6-postman.mjs` y la colección de Newman | — | La aserción del texto del aviso del Cliente. |

Capturas a 375 px en `docs/capturas-reclamos/`, una por pantalla y estado (los specs las regeneran).
