# Mapeo de archivos — MercadoPago, tramo 1: capa de aplicación (2026-09-17)

Primer tramo de implementación de MercadoPago. Detalle completo de decisiones y evidencia en `docs/DECISIONES.md`, entrada "2026-09-17 — MercadoPago, tramo 1: capa de aplicación de `CuentaMercadoPago`/`Pago`/`NotaCredito`". Este archivo solo lista qué se tocó y por qué.

Alcance: solo Entity/Repository/Service de las 3 tablas que ya existían físicamente en `bajonea_final` sin ninguna clase Java. Sin Controller, sin DTOs, sin OAuth real, sin creación de preferencia, sin webhook, sin tocar `PedidoService` ni `frontend/`.

## Backend — nuevo

| Archivo | Motivo |
|---|---|
| `backend/src/main/java/com/bajonea/backend/enums/EstadoNotaCredito.java` | `PENDIENTE`/`PROCESADO`/`PENDIENTE_REINTENTO`/`FALLIDO`, mismos 4 valores de la columna `estado` de `nota_credito`. |
| `backend/src/main/java/com/bajonea/backend/entities/CuentaMercadoPago.java` | 1:1 con `Dueno` (`UNIQUE KEY uq_cuenta_mp_dueno`). `@OneToOne` con `@JoinColumn(name="dueno_id")` propio, sin `@MapsId` (tiene su propio `id` autogenerado, no comparte PK con `Dueno`). |
| `backend/src/main/java/com/bajonea/backend/entities/Pago.java` | 1:1 con `Pedido` (`UNIQUE KEY uq_pago_pedido`). Sin columna de estado propia (vive en `Pedido.pagoEstado`) ni de `marketplace_fee` (vive en `Pedido.cargoServicioCliente`/`cargoServicioComercio`). |
| `backend/src/main/java/com/bajonea/backend/entities/NotaCredito.java` | 1:1 con `Pago` (`UNIQUE KEY uq_nota_credito_pago`). `estado` mapeado a `EstadoNotaCredito`. |
| `backend/src/main/java/com/bajonea/backend/repositories/CuentaMercadoPagoRepository.java` | `findByDuenoId`, `findByDuenoIdAndActivaTrue`. |
| `backend/src/main/java/com/bajonea/backend/repositories/PagoRepository.java` | `findByPedidoId`. |
| `backend/src/main/java/com/bajonea/backend/repositories/NotaCreditoRepository.java` | `findByPagoId`, `findByEstado` (para un futuro job de reintento de `PENDIENTE_REINTENTO`). |
| `backend/src/main/java/com/bajonea/backend/services/CuentaMercadoPagoService.java` | `obtenerActivaPorDueno`, `vincular` (crea o actualiza la fila única del Dueño), `desvincular`. Sin intercambio OAuth real todavía — persiste lo que una capa futura resuelva externamente. |
| `backend/src/main/java/com/bajonea/backend/services/PagoService.java` | `crear`, `obtenerPorPedido`, `confirmar`. Sin creación de preferencia real contra MercadoPago. |
| `backend/src/main/java/com/bajonea/backend/services/NotaCreditoService.java` | `crear`, `obtenerPorPago`, `listarPorEstado`, `actualizarEstado` (genérico, sin presuponer reglas de reintento — ver `docs/DECISIONES.md`). |

## No tocado (a propósito)

- `PedidoService.java` — los `// TODO: genera reembolso, pendiente de NotaCredito.` siguen intactos, sin resolver en este tramo.
- `frontend/` — sin cambios.
- `SecurityConfig.java` — no hace falta, no hay ningún endpoint HTTP nuevo.
- Ninguna migración Flyway nueva — las 3 tablas ya existían físicamente desde `V1__baseline_bajonea_final.sql`.
- Ningún DTO (`dto/request/`/`dto/response/`) — no hay Controller que los consuma todavía.
- La dependencia `com.mercadopago:sdk-java` — no hizo falta para esta capa (solo JPA).

## Pendiente para la próxima sesión

- Endpoint de vinculación OAuth (`authorization_code` + PKCE) que llame a `CuentaMercadoPagoService.vincular`.
- Creación real de la preferencia de MercadoPago (`marketplace_fee`) al confirmar un pedido, usando `PagoService.crear`.
- Webhook que confirme el pago real (`PagoService.confirmar`) y dispare la transición de `Pedido` (reemplazo de `confirmarPagoSimulado`/`rechazarPagoSimulado`).
- Lógica de negocio de reembolsos: cuándo se genera una `NotaCredito` y cómo se llama al refund real de MercadoPago, en los 6 puntos de `PedidoService` ya marcados con el TODO.
- Configurar `MERCADOPAGO_TOKEN_ENCRYPTION_KEY` en Railway antes de que el flujo de vinculación OAuth real quede operativo en producción (ver sección de cifrado, abajo).

## Continuación del mismo tramo (2026-09-17): cifrado de `access_token`/`refresh_token`

Resuelve el "Decisión pendiente de Diego" que tenía esta misma sección hasta ahora (cifrado a nivel de columna). Detalle completo de algoritmo/clave/verificación en `docs/DECISIONES.md`, entrada "2026-09-17 — MercadoPago, tramo 1 (continuación): cifrado a nivel de columna de `access_token`/`refresh_token`". Acá solo el archivo por archivo.

### Backend — nuevo

| Archivo | Motivo |
|---|---|
| `backend/src/main/java/com/bajonea/backend/config/security/MercadoPagoTokenConverter.java` | `AttributeConverter<String,String>` de JPA, `@Component` de Spring para poder inyectarle `mercadopago.token-encryption-key` por `@Value` en el constructor. AES-256-GCM, IV aleatorio de 12 bytes por valor, `Base64(IV \|\| ciphertext \|\| tag)`. `autoApply = false` — se aplica explícito, nunca global. |
| `backend/src/main/resources/db/migration/V11__ampliar_cuenta_mercado_pago_tokens_cifrados.sql` | Amplía `access_token`/`refresh_token` de `VARCHAR(255)` a `VARCHAR(500)` — el cifrado + Base64 infla el valor original más allá de lo que 255 soportaba con margen seguro. |

### Backend — modificado

| Archivo | Motivo |
|---|---|
| `backend/src/main/java/com/bajonea/backend/entities/CuentaMercadoPago.java` | `@Convert(converter = MercadoPagoTokenConverter.class)` en `accessToken`/`refreshToken`, `length` de ambos campos actualizado a `500` para coincidir con `V11`. |
| `backend/src/main/resources/application.properties` | `mercadopago.token-encryption-key=${MERCADOPAGO_TOKEN_ENCRYPTION_KEY:}` (default vacío, mismo criterio que `CLOUDINARY_*`/`RESEND_API_KEY`). |
| `backend/src/main/resources/application-production.properties` | Misma propiedad, mismo default vacío — no bloquea el arranque en Railway; el converter falla explícito recién cuando se use de verdad. |

### No tocado (a propósito, mismo alcance acotado del tramo)

- `entities/Pago.java`, `entities/NotaCredito.java` — el prompt de este cifrado fue exclusivo de `CuentaMercadoPago`.
- `services/CuentaMercadoPagoService.java` — no necesitó ningún cambio, sigue trabajando con `String` en texto plano; el cifrado es transparente para el Service.
- `PedidoService.java`, `frontend/`, cualquier Controller/endpoint — sin cambios.
- Ningún test JUnit permanente — la verificación se hizo con un test temporal, corrido una sola vez y borrado (ver `docs/DECISIONES.md` para el detalle de qué probó), porque el proyecto testea con Postman/Playwright, no JUnit.
- `git commit` — lo hace Diego.
