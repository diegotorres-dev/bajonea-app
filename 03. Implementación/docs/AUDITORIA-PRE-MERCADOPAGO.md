# Auditoría pre-integración de MercadoPago (2026-09-17)

> **Documento de auditoría pura — no se implementó ni corrigió nada.** Mismo criterio y
> metodología que `docs/AUDITORIA-EXHAUSTIVA-COMERCIO.md`/`docs/AUDITORIA-EXHAUSTIVA-CLIENTE.md`
> (lectura directa del código real — `entities/`, `dto/`, `repositories/`, `services/`,
> `controllers/`, migraciones SQL reales en `backend/src/main/resources/db/migration/`,
> `frontend/*.html`/`js/*.js`, specs de Playwright, colección de Postman). **No se confió en
> `docs/mvp-terminado.md` ni en ninguna auditoría vieja** — cada afirmación de este documento
> está respaldada por una cita de código real con ruta y número de línea, o por el resultado
> literal de un `grep`. Decisión de arquitectura de MercadoPago (Checkout Pro vía API de
> Preferencias, split con `marketplace_fee`, OAuth por Dueño) **no se reabre** — esta auditoría
> solo determina el punto de partida real del código.

---

## 1. `ConfiguracionTarifa` y el cálculo de cargos en `PedidoService`

**Ya existe completo y en producción — no hay que crear nada de esto, solo reutilizarlo.**

### 1.1 Entity, Repository, Service, Controller

- **Entity:** [`entities/ConfiguracionTarifa.java`](../backend/src/main/java/com/bajonea/backend/entities/ConfiguracionTarifa.java) — tabla `configuracion_tarifa`, append-only (nunca `UPDATE`/`DELETE`, ver Javadoc de `ConfiguracionTarifaService`). Campos reales (líneas 33-63): `id` (PK autogenerado), `administrador` (`@ManyToOne` a `Administrador`), `cargoCliente` (`BigDecimal`, `precision=10, scale=2`), `tipoCargoCliente` (`TipoCargo`, enum `FIJO`/`PORCENTAJE`), `cargoComercio` (`BigDecimal`), `tipoCargoComercio` (`TipoCargo`), `fechaVigencia` (`LocalDateTime`).
- **Repository:** [`repositories/ConfiguracionTarifaRepository.java`](../backend/src/main/java/com/bajonea/backend/repositories/ConfiguracionTarifaRepository.java) — `findTopByOrderByFechaVigenciaDesc()` (la vigente) y `findAllByOrderByFechaVigenciaDesc()` (historial).
- **Service:** [`services/ConfiguracionTarifaService.java`](../backend/src/main/java/com/bajonea/backend/services/ConfiguracionTarifaService.java) — métodos públicos reales que la integración de MercadoPago debería reutilizar sin duplicar lógica:
  - `obtenerVigente()` (línea 49) — `ConfiguracionTarifa` vigente, o `ConflictoDeNegocioException` si no hay ninguna.
  - `calcularCargoCliente(BigDecimal subtotal, ConfiguracionTarifa tarifa)` (línea 86) y `calcularCargoComercio(BigDecimal subtotal, ConfiguracionTarifa tarifa)` (línea 95) — estos dos son los que hay que llamar para construir `marketplace_fee = cargoServicioCliente + cargoServicioComercio`.
  - `crear(ConfiguracionTarifaRequestDTO request, Integer administradorId)` (línea 64) — alta de una tarifa nueva (Administrador).
- **Controller:** `AdministradorController.java` líneas 85-102 — `GET /api/v1/administrador/tarifas/vigente`, `GET /api/v1/administrador/tarifas/historial`, `POST /api/v1/administrador/tarifas`.

### 1.2 De dónde salen `cargoServicioCliente`/`cargoServicioComercio` hoy — **no son `BigDecimal.ZERO`**

Fragmento exacto, `services/PedidoService.java:126-149` (método `confirmarPedido`):

```java
BigDecimal subtotalPedido = items.stream()
        .map(item -> item.getProducto().getPrecio().multiply(BigDecimal.valueOf(item.getCantidad())))
        .reduce(BigDecimal.ZERO, BigDecimal::add);
ConfiguracionTarifa tarifaVigente = configuracionTarifaService.obtenerVigente();
BigDecimal cargoServicioCliente = configuracionTarifaService.calcularCargoCliente(subtotalPedido, tarifaVigente);
BigDecimal cargoServicioComercio = configuracionTarifaService.calcularCargoComercio(subtotalPedido, tarifaVigente);
...
Pedido pedido = Pedido.builder()
        ...
        .subtotal(subtotalPedido)
        .cargoServicioCliente(cargoServicioCliente)
        .cargoServicioComercio(cargoServicioComercio)
        .total(subtotalPedido.add(cargoServicioCliente))
        ...
```

Es un cálculo real contra la tarifa vigente, no un literal hardcodeado. `Pedido` (entity, líneas 108-122) persiste los 4 montos (`subtotal`, `cargoServicioCliente`, `cargoServicioComercio`, `total`) — `cargoServicioComercio` **no se resta de `total`** (el comercio no lo paga en el pago del cliente, se lo retiene Bajoneá del lado del split, ver decisión de negocio ya tomada). Esto calza exacto con la fórmula de split confirmada (`marketplace_fee = cargo_servicio_cliente + cargo_servicio_comercio`): `PedidoService` ya calcula y persiste ambos términos por separado, listo para pasarlos a `create-preference`.

Decisión de negocio confirmada en el propio código (Javadoc de clase, `ConfiguracionTarifaService.java:20-37`): el cargo al comercio se calcula siempre sobre el **subtotal**, nunca sobre el total — y el modelo soporta cualquier combinación de `FIJO`/`PORCENTAJE` por cargo, aunque la decisión vigente sea cliente fijo ($200) / comercio porcentual (1%).

### 1.3 Pantalla `admin-tarifas.html`

Existe y funciona end-to-end. `frontend/admin-tarifas.html` (26 líneas) es un shell que delega en `initAdminTarifas()` de `frontend/js/admin.js`. Cubierta por el spec E2E real `testing/playwright/tests/18-configuracion-tarifas.spec.ts` (226 líneas) — flujo completo: navegar desde el dashboard → ver tarifa vigente real → validar formulario vacío → cancelar → confirmar tarifa nueva → verificar `POST /administrador/tarifas` real (`201`) → verificar aislamiento por rol (Cliente/Comercio redirigidos a `login.html`). **Sin evidencia de que este spec se haya corrido en esta sesión** (no hay carpeta de resultado en `testing/playwright/test-results/` para `18-configuracion-tarifas`, ver §6), pero el código de la pantalla y del test existen y son consistentes entre sí.

### 1.4 Nombres exactos para reutilizar desde el código nuevo de MercadoPago

| Qué necesita el código de MP | Método/clase real a reutilizar |
|---|---|
| Cargo total a cobrarle al cliente (además del subtotal) | `ConfiguracionTarifaService.calcularCargoCliente(subtotal, tarifa)` |
| Comisión de Bajoneá sobre el comercio | `ConfiguracionTarifaService.calcularCargoComercio(subtotal, tarifa)` |
| Tarifa vigente a usar en el cálculo | `ConfiguracionTarifaService.obtenerVigente()` |
| Montos ya calculados y persistidos en el pedido | `Pedido.getCargoServicioCliente()`, `Pedido.getCargoServicioComercio()`, `Pedido.getSubtotal()`, `Pedido.getTotal()` |

---

## 2. Máquina de estados de `Pedido`

### 2.1 `EstadoPedido` — 11 valores completos, ya en código

[`enums/EstadoPedido.java`](../backend/src/main/java/com/bajonea/backend/enums/EstadoPedido.java) completo:

```java
public enum EstadoPedido {
    PENDIENTE_PAGO,
    PENDIENTE_CONFIRMACION_COMERCIO,
    EN_PREPARACION,
    EN_CAMINO,
    LISTO_PARA_RETIRAR,
    ENTREGADO,
    RECHAZADO,
    CANCELADO,
    ANULADO,
    CANCELADO_POR_SISTEMA,
    EXPIRADO
}
```

Los 11 valores del diccionario nuevo confirmados en código Java — **ya no son 3 estados recortados**, esto ya se implementó (Fase 19, en curso según `CLAUDE.md`).

Columna física real (`pedido.estado`), migración `V6__rename_pendiente_a_pendiente_confirmacion_comercio.sql:12`:
```sql
enum('PENDIENTE_PAGO','PENDIENTE','PENDIENTE_CONFIRMACION_COMERCIO','EN_PREPARACION','EN_CAMINO','LISTO_PARA_RETIRAR','ENTREGADO','RECHAZADO','CANCELADO','ANULADO','CANCELADO_POR_SISTEMA','EXPIRADO')
```
(El literal viejo `PENDIENTE` se conserva sin uso desde Java, a pedido explícito de Diego, para no invalidar pedidos de prueba viejos en Railway — ver comentario en la propia migración, líneas 1-10.)

Enum complementario nuevo, `EstadoPagoPedido` (`enums/EstadoPagoPedido.java`): `PENDIENTE`, `PAGADO`, `RECHAZADO` — columna `pedido.pago_estado`, independiente de `estado`.

### 2.2 En qué estado nace hoy un Pedido — **ya nace en `PENDIENTE_PAGO`**

`PedidoService.confirmarPedido` (línea 143): `.estado(EstadoPedido.PENDIENTE_PAGO)`, `.pagoEstado(EstadoPagoPedido.PENDIENTE)` (línea 144). Ya no salta directo a otro estado — hay un paso de pago real en la máquina de estados, aunque **el pago en sí sigue siendo simulado**, no MercadoPago real:

- `PedidoService.confirmarPagoSimulado` (línea 174): `PENDIENTE_PAGO → PENDIENTE_CONFIRMACION_COMERCIO` (con `pagoEstado = PAGADO`), dispara la notificación de "nuevo pedido" al Dueño. Endpoint: `PUT /pedidos/cliente/{id}/pago/confirmar` (`PedidoController.java:50`, mensaje `"Pago confirmado correctamente"`).
- `PedidoService.rechazarPagoSimulado` (línea 193): `PENDIENTE_PAGO → CANCELADO_POR_SISTEMA` (con `pagoEstado = RECHAZADO`). Endpoint: `PUT /pedidos/cliente/{id}/pago/rechazar` (`PedidoController.java:57`).

Javadoc de clase de `PedidoService.java:52-61` lo dice explícitamente: *"El pago es SIMULADO en este tramo — sin integración real de MercadoPago — vía `confirmarPagoSimulado` / `rechazarPagoSimulado`."* Esto es exactamente el punto de inserción real para el `POST /checkout/preferences` de MercadoPago: hoy es un botón "Confirmar pago (simulado)" en el frontend (ver §5) que llama directo a `PUT /pedidos/cliente/{id}/pago/confirmar` sin ningún paso intermedio de pasarela.

Resto de la máquina de estados, confirmada con transiciones reales en código (`PedidoService.java`):
- `aceptarPedido` (211): `PENDIENTE_CONFIRMACION_COMERCIO → EN_PREPARACION`.
- `rechazarPedido` (229): `PENDIENTE_CONFIRMACION_COMERCIO → RECHAZADO`.
- `avanzarAEntregaEnCurso` (261): `EN_PREPARACION → EN_CAMINO` (domicilio) o `→ LISTO_PARA_RETIRAR` (retiro).
- `confirmarEntregaCliente` (288) / `confirmarEntregaComercio` (301): `EN_CAMINO`/`LISTO_PARA_RETIRAR → ENTREGADO`.
- `cancelarPedido` (314): `PENDIENTE_CONFIRMACION_COMERCIO`/`EN_PREPARACION → CANCELADO`.
- `anularPedido` (334): `EN_PREPARACION → ANULADO`.
- `cancelarPedidosPorSuspensionComercio` (406): pedidos activos → `CANCELADO_POR_SISTEMA` en cascada por suspensión de comercio.
- Los 4 jobs (`expirarPagosVencidos`, `avisar75MinYAutoconfirmar`, `expirarPedidosSinRespuestaComercio`, `autoconfirmarRetirosPorSuspension`) — ver §2.3.

**Todo estado terminal negativo con reembolso pendiente tiene un `// TODO` explícito en el código** (`PedidoService.java:204, 247, 325, 346, 414, 485`: *"TODO: genera reembolso, pendiente de NotaCredito."*) — el propio código ya marca dónde va a enganchar el reembolso real de MercadoPago (vía `NotaCredito`, ver §3).

### 2.3 Los 4 jobs `@Scheduled` — **los 4 ya existen y corren**

`@EnableScheduling` en `BajoneaApplication.java:8` — habilitado. Los 4 jobs viven en [`services/PedidoSchedulerService.java`](../backend/src/main/java/com/bajonea/backend/services/PedidoSchedulerService.java), cada uno delega en el método real de `PedidoService`:

| Job | Cron/delay | Método `PedidoService` | Umbral (configurable, ver abajo) |
|---|---|---|---|
| 1. Expiración de pago | `@Scheduled(fixedDelay = 60_000)` | `expirarPagosVencidos()` | `pedido.timeout.pago-minutos=30` |
| 2. Aviso + autoconfirmación en camino | `@Scheduled(fixedDelay = 60_000)` | `avisar75MinYAutoconfirmar()` | `aviso-en-camino-minutos=75` / `autoconfirmacion-en-camino-minutos=90` |
| 3. Timeout de respuesta del comercio | `@Scheduled(fixedDelay = 300_000)` | `expirarPedidosSinRespuestaComercio()` | `respuesta-comercio-minutos=60` |
| 4. Timer de retiro por suspensión | `@Scheduled(fixedDelay = 300_000)` | `autoconfirmarRetirosPorSuspension()` | `retiro-suspension-minutos=90` |

Umbrales reales en `application.properties` (líneas finales del archivo):
```properties
pedido.timeout.pago-minutos=30
pedido.timeout.aviso-en-camino-minutos=75
pedido.timeout.autoconfirmacion-en-camino-minutos=90
pedido.timeout.respuesta-comercio-minutos=60
pedido.timeout.retiro-suspension-minutos=90
```
Bean de configuración: `config/PedidoTimeoutProperties.java` (archivo nuevo sin commitear, ver `git status`). Los **4 jobs corren los 4** (nada a medio implementar) — las frecuencias de polling son fijas por decisión de Diego (comentario en `PedidoSchedulerService.java:8-10`), los umbrales de negocio sí son configurables vía esas 5 properties.

El job 1 (`expirarPagosVencidos`) es el que hoy resuelve el caso de "el cliente nunca confirmó el pago simulado" — con MercadoPago real, este mismo job es candidato a reemplazar por (o coexistir con) el webhook de notificación de pago vencido/expirado de la preferencia.

### 2.4 `HistorialEstadoPedido` — existe y se usa en cada transición real

- **Entity:** `entities/HistorialEstadoPedido.java`. **Repository:** `repositories/HistorialEstadoPedidoRepository.java`.
- Uso real: `PedidoService.registrarHistorial(...)` (líneas 531-545) se llama en **todas** las transiciones de estado del archivo (confirmarPedido, confirmarPagoSimulado, rechazarPagoSimulado, aceptarPedido, rechazarPedido, avanzarAEntregaEnCurso, confirmarEntregaCliente/Comercio, cancelarPedido, anularPedido, cancelarPedidosPorSuspensionComercio, y los 4 jobs) — columna `actor` propia (`ActorPedido`: `CLIENTE`/`DUENO`/`SISTEMA`, más `actorUsuario` y `motivoTimeout` opcional), ampliación sobre el diccionario original según `CLAUDE.md` §6 Fase 19. Es la fuente canónica de todos los timestamps del ciclo de vida — usada también para calcular cuánto tiempo lleva un pedido en un estado (`obtenerFechaEntradaAEstado`, línea 512, consumida por los jobs 2 y 3).

---

## 3. `Pago`, `NotaCredito`, `CuentaMercadoPago` — capa de aplicación inexistente, tablas físicas sí

**Resultado de la búsqueda exhaustiva:**
```
find backend/src/main/java -iname "*Pago*" -o -iname "*NotaCredito*" -o -iname "*CuentaMercadoPago*"
→ enums/EstadoPagoPedido.java   (único resultado — no es la entidad Pago)
```
```
grep -rn "\bPago\b" backend/src/main/java --include=*.java | grep -v "EstadoPago|PagoEstado|...PagoSimulado"
→ solo 2 literales de mensaje ("Pago confirmado correctamente"/"Pago rechazado correctamente") en PedidoController
```

**Confirmado explícitamente, para las 3 tablas:**

| Tabla/concepto | Entity JPA | Repository | Service | Controller |
|---|---|---|---|---|
| `Pago` | ❌ No existe | ❌ No existe | ❌ No existe | ❌ No existe |
| `NotaCredito` | ❌ No existe | ❌ No existe | ❌ No existe | ❌ No existe |
| `CuentaMercadoPago` | ❌ No existe | ❌ No existe | ❌ No existe | ❌ No existe |

No hay ningún esqueleto parcial de ninguna de las 3 — ni una clase vacía, ni un import suelto. Son **tres capas completas a crear desde cero**.

### 3.1 Columnas físicas reales de las 3 tablas (ya existen en la base, vía `V1__baseline_bajonea_final.sql`)

**`cuenta_mercado_pago`** (`V1__baseline_bajonea_final.sql:92-106`):
```sql
CREATE TABLE `cuenta_mercado_pago` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `dueno_id` int(11) NOT NULL,
  `mp_user_id` varchar(50) NOT NULL,
  `access_token` varchar(255) NOT NULL,
  `refresh_token` varchar(255) NOT NULL,
  `public_key` varchar(255) DEFAULT NULL,
  `activa` tinyint(1) NOT NULL DEFAULT 1,
  `fecha_vinculacion` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_desvinculacion` datetime DEFAULT NULL,
  `token_expira` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cuenta_mp_dueno` (`dueno_id`),
  CONSTRAINT `fk_cuenta_mp_dueno` FOREIGN KEY (`dueno_id`) REFERENCES `dueno` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
1:1 con `Dueno` (`UNIQUE KEY uq_cuenta_mp_dueno`) — calza con "cada Dueño vincula su cuenta de MP vía OAuth". Ya tiene columnas para `access_token`/`refresh_token`/`public_key`/`token_expira`, listas para el flujo `authorization_code` + PKCE.

**`pago`** (`V1__baseline_bajonea_final.sql:331-342`):
```sql
CREATE TABLE `pago` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pedido_id` int(11) NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `metodo_pago` varchar(30) DEFAULT NULL,
  `id_transaccion_mp` varchar(50) DEFAULT NULL,
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_confirmacion` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pago_pedido` (`pedido_id`),
  CONSTRAINT `fk_pago_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedido` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
1:1 con `Pedido` (`UNIQUE KEY uq_pago_pedido`) — sin columna de estado propia (a diferencia de `nota_credito`), sin `marketplace_fee` ni desglose cliente/comercio propio (esos valores ya viven en `Pedido.cargoServicioCliente`/`cargoServicioComercio`, ver §1.2 — `pago` solo necesita el monto total y el id de transacción de MP).

**`nota_credito`** (`V1__baseline_bajonea_final.sql:299-313`):
```sql
CREATE TABLE `nota_credito` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pago_id` int(11) NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `estado` enum('PENDIENTE','PROCESADO','PENDIENTE_REINTENTO','FALLIDO') NOT NULL DEFAULT 'PENDIENTE',
  `intentos` int(11) NOT NULL DEFAULT 0,
  `refund_id_mp` varchar(50) DEFAULT NULL,
  `fecha_emision` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_proceso` datetime DEFAULT NULL,
  `fecha_fallido` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_nota_credito_pago` (`pago_id`),
  KEY `idx_nota_credito_estado` (`estado`),
  CONSTRAINT `fk_nota_credito_pago` FOREIGN KEY (`pago_id`) REFERENCES `pago` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
1:1 con `Pago` — tiene `intentos`/`estado` (con `PENDIENTE_REINTENTO`), pensada para reintentar un refund que falló contra la API de MP. Esta es exactamente la tabla a la que apuntan los `// TODO: genera reembolso, pendiente de NotaCredito.` de `PedidoService` (§2.2).

**No hay ningún gap entre estas 3 tablas físicas y `docs/diccionario-de-datos.md`** verificado en esta auditoría — no se detectó ninguna discrepancia de columnas al leer el SQL real, a diferencia del gap histórico de `dueno.persona_fisica_id` que `CLAUDE.md` ya documenta como resuelto.

---

## 4. Dependencias y configuración

### 4.1 `pom.xml` — sin ninguna dependencia de MercadoPago

`grep -in "mercadopago" backend/pom.xml` → sin resultados. Lista completa de dependencias reales (`backend/pom.xml`): `spring-boot-starter-web`, `spring-boot-starter-data-jpa`, `spring-boot-starter-security`, `spring-boot-starter-validation`, `mysql-connector-j`, `flyway-core`, `flyway-mysql`, `lombok`, `springdoc-openapi-starter-webmvc-ui`, `jjwt-api`/`jjwt-impl`/`jjwt-jackson`, `cloudinary-http5`, `resend-java`, `spring-boot-starter-test`, `spring-security-test`. **`com.mercadopago:sdk-java` no está** — hay que agregarlo.

### 4.2 Patrón real de credenciales — cómo el proyecto maneja secretos hoy

`application.properties` (dev, valores reales nunca committeados):
```properties
resend.api-key=${RESEND_API_KEY:}
mail.from=${MAIL_FROM:}

cloudinary.cloud-name=${CLOUDINARY_CLOUD_NAME:}
cloudinary.api-key=${CLOUDINARY_API_KEY:}
cloudinary.api-secret=${CLOUDINARY_API_SECRET:}
```
`application-production.properties` (Railway) usa el mismo nombre de property con las variables de entorno reales del hosting (`${MYSQLUSER}`, etc., sin default vacío — falla explícito si falta en producción).

Inyección en código vía `@Value` a nivel de bean (`config/CloudinaryConfig.java:12-22`):
```java
@Bean
public Cloudinary cloudinary(
        @Value("${cloudinary.cloud-name}") String cloudName,
        @Value("${cloudinary.api-key}") String apiKey,
        @Value("${cloudinary.api-secret}") String apiSecret) {
    return new Cloudinary(Map.of("cloud_name", cloudName, "api_key", apiKey, "api_secret", apiSecret, "secure", true));
}
```
**Patrón a replicar para MercadoPago:** un `MercadoPagoConfig` nuevo en `config/`, con `mercadopago.client-id`/`mercadopago.client-secret`/`mercadopago.access-token` (o los nombres que pida el SDK) en `application.properties`/`application-production.properties` con el mismo formato `${ENV_VAR:}`, nunca un valor real committeado — cero excepciones a la regla transversal 6 de `CLAUDE.md` §4 ("nunca commitear credenciales").

No existe ningún archivo de configuración de MercadoPago todavía (`application-*.properties` no tiene ninguna property `mercadopago.*` ni `mp.*`).

### 4.3 Webhooks, OAuth, endpoints de pago — ninguno existe

```
grep -rn "webhook\|oauth\|mercadopago" backend/src/main/java -i
→ 1 solo resultado: un comentario Javadoc en PedidoService.java:57 mencionando "MercadoPago" en prosa, cero código.
```
No hay ningún controller, service, ni endpoint — ni placeholder vacío — relacionado a webhooks, OAuth, ni pagos reales. Toda esta capa (callback de OAuth, endpoint de recepción de webhook de notificación de pago de MP, endpoint de creación de preferencia) se crea desde cero.

---

## 5. Frontend

### 5.1 `checkout.html`/`checkout.js` — solo pago simulado, cero referencias a MercadoPago

`grep -in "mercadopago" frontend` → sin resultados en todo `frontend/`.

Flujo real de "confirmar pedido" (`frontend/js/checkout.js`):
1. **Paso 3** (`renderStep3`, líneas 273-358): botón `data-testid="btn-confirmar-pedido"`, texto `"Ir a pagar - $X"` (línea 334) → `POST /pedidos/cliente` (línea 339) → pedido nace en `PENDIENTE_PAGO` (backend) → `renderStep4(pedido)`.
2. **Paso 4** (`renderStep4`, líneas 360-415), título `"Pago"` (línea 365), texto: *"Tu pedido #{id} a {comercio} fue creado. Confirmá el pago (simulado) para que pase al comercio."* (línea 370) — dos botones:
   - `btn-confirmar-pago-simulado` → `PUT /pedidos/cliente/{id}/pago/confirmar` → redirige a `pedido-detalle.html?id={id}` (líneas 398-405).
   - `btn-rechazar-pago-simulado` → `PUT /pedidos/cliente/{id}/pago/rechazar` → mismo destino (líneas 407-414).

No hay ningún botón, texto, ni comentario que mencione MercadoPago — el paso 4 completo es el punto de reemplazo real: hoy son 2 botones que llaman directo a los endpoints simulados; con MP real, el flujo pasaría a redirigir a la URL de Checkout Pro (`init_point` de la preferencia) en vez de mostrar esos 2 botones.

### 5.2 Pantalla de "vincular MercadoPago" para el Dueño

No existe absolutamente nada — ni un botón deshabilitado. Confirmado por:
- `grep -rln "vincular" frontend -i` → sin resultados.
- `Dueno.java` (entity) no tiene ninguna relación a `CuentaMercadoPago` — solo `personaJuridica`, `personaFisica`, `fechaCreacion` (ver §3, no listado ahí porque no existe la entity `CuentaMercadoPago` para relacionar).
- `comercio-perfil.html`/`js/comercio.js` (pantalla de perfil del Dueño/Comercio) no tiene ninguna sección ni referencia a pagos/MercadoPago.

Esta pantalla (y su endpoint de "iniciar vinculación OAuth" + callback) se construye 100% desde cero.

---

## 6. Testing existente relacionado al pago

### 6.1 Postman — la colección no tiene ningún request de pago

```
grep -in "\"name\":.*pago\|mercadopago" postman/Bajonea-MVP.postman_collection.json
→ sin resultados
```
La carpeta `"07 - Pedidos"` de la colección (`Bajonea-MVP.postman_collection.json`, líneas 1768-2051) confirma directamente el request `"Confirmar pedido (Comercio A, retiro)"` **sin ningún paso previo de pago** — evidencia directa de que la colección quedó desactualizada desde antes de que existiera `PENDIENTE_PAGO` (consistente con lo que `CLAUDE.md` ya documenta como "colección desalineada con `bajonea_final`", pendiente actualizar). Cuando se agregue el flujo real de MercadoPago, la colección entera de la carpeta "07 - Pedidos" necesita actualizarse para insertar el paso de pago antes de que el comercio pueda ver/aceptar el pedido.

### 6.2 Playwright — hay specs que YA fallan por el paso de pago simulado, antes de tocar nada de MercadoPago

**Hallazgo real, no hipotético**: hay evidencia de corridas fallidas recientes (`testing/playwright/test-results/`, carpetas con mtime 2026-09-16, un día antes de esta auditoría) que confirman que la introducción del paso `PENDIENTE_PAGO` (Fase 19) **ya rompió 2 specs existentes**, sin que la integración de MercadoPago haya tocado nada todavía:

- **`05-pedido-flujo-completo.spec.ts`** — los 2 tests del archivo (envío a domicilio y retiro) fallan. Evidencia real (`test-results/05-pedido-flujo-completo-F-0c538-.../error-context.md:14-37`):
  ```
  Error: expect(locator).toBeVisible() failed
  Locator: getByTestId('modal-pedido-confirmado')
  ...
  - heading "Pago" [level=1]
  - paragraph: "Tu pedido #1 a ... fue creado. Confirmá el pago (simulado) para que pase al comercio."
  - button "Confirmar pago (simulado)"
  - button "Simular rechazo del pago"
  ```
  El test espera un modal `modal-pedido-confirmado` que **ya no existe en el frontend** — `grep -rn "modal-pedido-confirmado" frontend` no devuelve nada real, solo aparece en los propios `error-context.md` de los tests fallidos. El test tampoco hace click en `btn-confirmar-pago-simulado` en ningún momento, así que aunque se arreglara esa aserción, el pedido se queda en `PENDIENTE_PAGO` — y `PedidoService.listarPedidosComercio` (línea 371) **filtra explícitamente `PENDIENTE_PAGO`** de lo que ve el comercio, así que la siguiente aserción del test (que el comercio vea el pedido en `comercio-pedidos.html`) también fallaría.
- **`16-rechazo-pedido-validaciones.spec.ts`** — 4 de sus tests fallan con timeout esperando `btn-rechazar-pedido`, porque la pantalla de detalle del comercio muestra *"No encontramos este pedido — El pedido que buscás no existe o no pertenece a tu comercio"* (`error-context.md` de `16-rechazo-pedido-validaci-6a082-...`, líneas 22-27) — mismo motivo raíz: el pedido de prueba nunca sale de `PENDIENTE_PAGO`, así que el comercio no lo puede ver.

**Implicación directa para la integración de MercadoPago:** el helper de test compartido que crea un pedido y espera que el comercio lo vea (usado por `05` y `16`, y probablemente por otros specs que creen pedidos) necesita un paso explícito de "confirmar pago" insertado — hoy sería `PUT /pedidos/cliente/{id}/pago/confirmar` (simulado); con MercadoPago real, ese paso pasa a ser todo el flujo de Checkout Pro + webhook. **Esta reparación de specs es trabajo previo/paralelo a la integración de MercadoPago, no consecuencia de ella** — ya está rota hoy, sin que se haya escrito una sola línea de código de MercadoPago.

- **`18-configuracion-tarifas.spec.ts`** — sin carpeta de resultado en `test-results/`, no hay evidencia de que se haya corrido en la sesión que generó esos artifacts. El código del spec en sí es consistente con el backend real (mismos endpoints, mismos data-testid), pero no se puede confirmar "en verde" con la evidencia disponible en este repo.
- Ningún otro spec (`01` a `04`, `06` a `15`, `17`) tiene ninguna referencia a `pago` (case-insensitive) salvo `06-crud-productos.spec.ts`, que solo matchea la palabra "Agotado"/"agotarResponse" (falso positivo del grep, sin relación a pagos).

---

## Resumen ejecutivo

### Qué ya existe y hay que modificar/extender

- **`ConfiguracionTarifa` completo** (entity/repository/service/controller + pantalla admin) — reutilizar `ConfiguracionTarifaService.calcularCargoCliente`/`calcularCargoComercio`/`obtenerVigente` tal cual para armar `marketplace_fee`.
- **`EstadoPedido` con los 11 valores completos**, ya con `PENDIENTE_PAGO` como estado inicial real y `EstadoPagoPedido` (`PENDIENTE`/`PAGADO`/`RECHAZADO`) en `Pedido.pagoEstado`.
- **`PedidoService.confirmarPagoSimulado`/`rechazarPagoSimulado`** — es el punto de inserción exacto para el pago real: hoy son 2 métodos triviales que solo cambian estado; ahí va la llamada real a `POST /checkout/preferences` (para generar la preferencia) y el webhook de confirmación reemplaza al botón "Confirmar pago (simulado)".
- **Los 4 jobs `@Scheduled`** — los 4 corren; el job 1 (`expirarPagosVencidos`) es candidato a integrarse con la expiración real de la preferencia de MP.
- **`HistorialEstadoPedido`** — ya registra cada transición con actor; extender el `ActorPedido`/flujo si el pago real introduce un actor "MERCADOPAGO" (webhook) distinto de `SISTEMA`.
- **Tablas físicas `pago`/`nota_credito`/`cuenta_mercado_pago`** — ya existen en `bajonea_final` con columnas listas para `id_transaccion_mp`, `access_token`/`refresh_token`, `refund_id_mp` — falta toda la capa Java (Entity/Repository/Service/Controller) para las 3.
- **`checkout.js` paso 4** — hoy 2 botones de pago simulado; reemplazar por la redirección a Checkout Pro.
- **Colección de Postman ("07 - Pedidos")** y **specs `05`/`16` de Playwright** — ya están desalineados/rotos por el paso `PENDIENTE_PAGO` (evidencia real de fallos del 2026-09-16), necesitan reparación con o sin MercadoPago de por medio.

### Qué falta crear desde cero

- **Dependencia `com.mercadopago:sdk-java`** en `pom.xml` — no está.
- **Entities/Repository/Service/Controller de `Pago`, `NotaCredito`, `CuentaMercadoPago`** — cero código existente, solo tablas físicas.
- **`MercadoPagoConfig`** (bean de configuración, mismo patrón que `CloudinaryConfig`) + properties `mercadopago.*` en `application.properties`/`application-production.properties` — no existen.
- **Endpoints de OAuth** (iniciar vinculación PKCE, callback `/api/oauth/mercadopago/callback`) — cero código, ni placeholder.
- **Endpoint(s) de webhook** de notificación de pago de MercadoPago — cero código, ni placeholder.
- **Endpoint de creación de preferencia** (`POST /checkout/preferences` desde el backend hacia MP) — cero código.
- **Pantalla de "vincular MercadoPago"** para el Dueño (ni un botón deshabilitado existe hoy).
- **Reemplazo del paso 4 de `checkout.js`** (hoy simulado) por la redirección real a Checkout Pro.
- **Actualización de Postman** (carpeta "07 - Pedidos") y **reparación de los specs Playwright `05`/`16`** para incorporar el paso de pago (simulado primero, real después) antes de que el comercio pueda ver el pedido.

---

*Generado el 2026-09-17 por lectura directa del código fuente real — sin ejecutar ninguna migración, sin instalar dependencias, sin modificar ningún archivo del proyecto.*
