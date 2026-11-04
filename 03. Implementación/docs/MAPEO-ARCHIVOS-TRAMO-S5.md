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
