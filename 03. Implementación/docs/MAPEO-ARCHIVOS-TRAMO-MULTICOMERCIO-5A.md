# Mapeo de archivos — Multi-comercio, tramo 5, Entrega A (Mercado Pago con varios comercios: backend y tests)

Fecha: 2026-10-03. Objetivo: una sola cuenta de Mercado Pago por Dueño para todos sus comercios, una cuenta activa en un solo Dueño, una previa informativa de la desvinculación, la desvinculación rechazada mientras haya pedidos en `PENDIENTE_PAGO`, y crear un pedido revalidando `APTO_VENTA` con bloqueo. Solo backend y tests: no se tocó el frontend (Entrega B). Una migración, `V27`. Sin notificaciones.

## Base de datos

| Archivo | Por qué |
|---|---|
| `backend/src/main/resources/db/migration/V27__cuenta_mercado_pago_mp_user_id_activo_unico.sql` (nuevo) | Columna generada `mp_user_id_activo` (`STORED`, vale `mp_user_id` si `activa = 1` y `NULL` si no) con `UNIQUE uq_cuenta_mp_user_id_activo`. Dos filas activas con la misma cuenta dan clave duplicada; una activa y una inactiva, o dos inactivas, conviven. La entidad JPA no la mapea. DDL aprobado por Diego, aplicado sin cambios en MariaDB 10.4.32. |

## Backend nuevo

| Archivo | Por qué |
|---|---|
| `exceptions/CuentaMercadoPagoYaVinculadaException.java` | `409`. El Dueño ya tiene una cuenta activa y quiere iniciar otra vinculación o vincular una distinta. Mensaje fijo en la constante `MENSAJE`. Hereda de `ConflictoDeNegocioException`. |
| `exceptions/CuentaMercadoPagoEnUsoException.java` | `409`. La cuenta ya está activa en otro Dueño; el mensaje no dice quién. Hereda de `ConflictoDeNegocioException`. |
| `exceptions/DesvinculacionBloqueadaException.java` | `409`. Hay pedidos en `PENDIENTE_PAGO`; trae cantidad y `puedeReintentarDesde`. |
| `dto/response/DesvinculacionBloqueadaResponseDTO.java` | `data` del `409` de desvincular: `cantidadPagosPendientes` y `puedeReintentarDesde`. |
| `dto/response/DesvinculacionPreviaResponseDTO.java` | Respuesta de la previa: `puedeDesvincular`, `comercios[]` (`id`, `nombre`, `pedidosEnCurso[]` con los 4 estados en orden fijo, `cantidadPagosPendientes`) y `pagosPendientes` (`cantidadTotal`, `puedeReintentarDesde`). |

## Backend modificado

| Archivo | Por qué |
|---|---|
| `services/CuentaMercadoPagoService.java` | `vincular` valida antes de escribir (otra cuenta activa del mismo Dueño: `YaVinculada`; la misma cuenta activa en otro Dueño: `EnUso`; la misma cuenta del mismo Dueño: idempotente) y traduce la violación de `uq_cuenta_mp_user_id_activo` a `EnUso`. `desvincular` ahora recibe la cuenta ya bloqueada. Nuevo `obtenerActivaConBloqueo`. Texto del `404` corregido ("El Dueño no tiene ninguna cuenta de Mercado Pago vinculada"). |
| `services/MercadoPagoOAuthService.java` | `iniciarVinculacion` da `409` con cuenta activa. `desvincular`: cuenta (`FOR UPDATE`) → comercios (`FOR UPDATE`) → pedidos `PENDIENTE_PAGO` (lectura con bloqueo compartido, filas) → `409` con la hora o desvincula. Nuevo `previaDesvinculacion` (una consulta agrupada por Dueño). |
| `controllers/MercadoPagoOAuthController.java` | Nuevo `GET /oauth/mercadopago/desvinculacion/previa`. El callback mapea las dos excepciones nuevas a `vinculacionMp=cuenta-en-uso` y `vinculacionMp=cuenta-ya-vinculada` (el resto sigue yendo a `error`). |
| `services/PedidoService.java` | `confirmarPedido` lee el estado del comercio con bloqueo compartido y revalida `APTO_VENTA` dentro de la transacción. |
| `services/ComercioService.java` | Sobrecarga `validarAceptaPedidos(comercio, estadoActual)`: valida con el estado leído bajo bloqueo y no con el de la entidad (que puede ser una foto vieja). La firma de un argumento no cambió. |
| `repositories/PedidoRepository.java` | `findPendientesPagoDeComerciosConBloqueoCompartido` (nativa, `LOCK IN SHARE MODE`, devuelve la proyección `PagoPendienteBloqueado`) y `contarPorComercioYEstadoDeDueno` (agrupada). |
| `repositories/ComercioRepository.java` | `leerEstadoConBloqueoCompartido` (nativa, `LOCK IN SHARE MODE`). |
| `repositories/CuentaMercadoPagoRepository.java` | `findByMpUserIdAndActivaTrue`. |
| `exceptions/GlobalExceptionHandler.java` | Handler de `DesvinculacionBloqueadaException`: `409` con `data`. Las otras dos excepciones nuevas salen por el de `ConflictoDeNegocioException`. |
| `controllers/TestController.java`, `services/TestSupportService.java` | `POST /test/duenos/{id}/mercadopago-simulada` acepta `?mpUserId=` opcional (por defecto `test-mp-{duenoId}`). |

## Tests

| Archivo | Por qué |
|---|---|
| `backend/src/test/.../services/CuentaMercadoPagoServiceTest.java` (nuevo, 10) | Reglas de `vincular`, traducción del índice único, `desvincular`, `404`. Mockito. |
| `backend/src/test/.../services/MercadoPagoOAuthServiceDesvinculacionTest.java` (nuevo, 9) | `iniciar` `409`, orden de bloqueo (`InOrder`), desvincular con y sin pagos pendientes (singular/plural, hora), `404`, previa. Mockito. |
| `backend/src/test/.../services/PedidoServiceConfirmarPedidoLockTest.java` (nuevo, 2) | `confirmarPedido` valida con el estado leído bajo bloqueo. Mockito. |
| `backend/src/test/.../services/MercadoPagoCuentaUnicaIntegrationTest.java` (nuevo, 3) | Contra `bajonea_test`: el índice único real, las consultas con bloqueo compartido y la agrupada en el motor real, y la desvinculación completa con historial. Dentro de una transacción que se revierte. |
| `backend/src/test/.../controllers/MercadoPagoOAuthControllerCallbackTest.java` (nuevo, 5) | Los códigos de redirección del callback. |
| `testing/playwright/tests/28-multicomercio-tramo5-api.spec.ts` (nuevo, 15) | Unicidad entre Dueños, un Dueño una cuenta, iniciar, previa (forma, aislamiento, `404`, `403`, ignora el header), desvincular con y sin `PENDIENTE_PAGO`, pedidos en curso que siguen su flujo, nota en revisión manual, segunda desvinculación `404`, crear pedido sobre un comercio `APROBADO`. |
| `testing/playwright/scripts/build-multicomercio-tramo5a-postman.mjs` (nuevo) | Carpeta `52` de la colección: 94 requests, los mismos escenarios en versión secuencial. Va **último** en el orden de builders (`1`, `2a`, `3a`, `4a`, `5a`). |
| `testing/playwright/scripts/stress-locks-tramo5a.mjs` (nuevo) | Estrés con 4 escenarios (a-d). Solo mide. |
| `postman/Bajonea-MVP.postman_collection.json`, `postman/Bajonea-Local.postman_environment.json` | Generados por el builder `5a` (carpeta `52` y variables `t5_*`). |
| `postman/limpiar-datos-postman.sql` | Borra también `cuenta_mercado_pago` de los Dueños de prueba: la carpeta `52` usa `mp_user_id` fijos y una fila activa huérfana bloquearía la corrida siguiente. |

## Documentación

`docs/DECISIONES.md` (entrada del tramo), `docs/APRENDIZAJES-TECNICOS.md` (bloqueo compartido en MariaDB y orden de bloqueo de la desvinculación), `CLAUDE.md` §1bis, `docs/diccionario-de-datos.md` y su copia canónica en `02. Diseño`, `Modelo Relacional-v3`, `requisitos-funcionales-dueño.md`, `Historias de Usuario - Dueño.md` (HU-D04) y `alcance-y-limitaciones.md`. El diagrama Entidad-Relación v3 no lleva atributos y no cambia.
