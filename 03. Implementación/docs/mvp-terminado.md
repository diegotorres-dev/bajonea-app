# Auditoría de gaps — MVP aprobado → Proyecto completo (Trabajo Final)

**Fecha:** 2026-09-15
**Motivo:** el MVP de Bajoneá fue aprobado (nota 10) en la mesa final de Prácticas 2. Arranca la segunda etapa del proyecto: 2 meses para llevarlo al 100% del alcance diseñado, como Trabajo Final de la carrera. Este documento es un inventario de gaps entre el diseño formal (`docs/diccionario-de-datos.md` v1.5, `01. Análisis de Requerimientos/*`, `01. Análisis de Requerimientos/03. Alcance y Limitaciones/alcance-y-limitaciones.md`) y lo que existe realmente en código hoy — **no es una auditoría de bugs.**

**Actualización 2026-09-20:** este documento es un snapshot del 2026-09-15 y sus cuerpos no se reescriben. Desde entonces se implementaron (con la verificación indicada en `docs/DECISIONES.md`) los puntos 6 (`ConfiguracionTarifa`), 13 (máquina de estados del Pedido y sus 4 jobs) y la parte del punto 5 (MercadoPago) que no depende de reembolsos; ver la nota de actualización bajo cada uno. Los puntos 9 y 10 (nota de crédito y reembolso), 11 (cancelación y anulación con devolución de dinero) y el refresh de tokens de MercadoPago siguen pendientes.

> **Actualización 2026-09-25:** el login pasó de email a nombre de usuario (`V19`) y el split de MercadoPago se verifica contra `fee_details` con alerta `SPLIT_NO_APLICADO` (`V22`); ver `docs/DECISIONES.md`, entradas del 2026-09-25. El cuerpo de este snapshot no se reescribe.

**Metodología:** para cada punto se leyó el código fuente real (Entity → Repository → Service → Controller → frontend HTML/JS que lo consuma), nunca se asumió nada por el nombre de una clase o archivo. Se usan 4 niveles:
- ❌ **NO EXISTE** (ni modelo, ni código)
- 🟡 **SOLO MODELO DE DATOS** (tabla/columna existe en `docs/bajonea_final.sql`, sin Service/Controller que la use — o, en algunos casos, un Entity/campo Java existe pero nadie lo escribe después de la creación)
- 🟡 **SOLO BACKEND** (Service/Controller existen y funcionan, sin frontend que los consuma)
- ✅ **COMPLETO END-TO-END** (backend + frontend funcionando de punta a punta)

Se trabajó exclusivamente en modo lectura — ningún archivo de código fue modificado para producir este reporte.

**Dato de contexto clave, confirmado transversalmente en casi todos los puntos:** el schema físico `docs/bajonea_final.sql` (base de datos definitiva del proyecto, 41 tablas, v1.5) ya tiene las **41 tablas** completas del diseño — incluidas las 15 que no tienen ningún código Java detrás (`empleado`, `empleado_comercio`, `cuenta_mercado_pago`, `configuracion_tarifa`, `historial_estado_usuario`, `historial_estado_pedido`, `soporte`, `reclamo`, `grupo_extra`, `extra`, `producto_grupo_extra`, `item_carrito_extra`, `detalle_pedido_extra`, `pago`, `nota_credito`). Es decir: el modelo de datos como diseño está terminado; lo que falta en casi todos los casos es la capa de aplicación completa (Entity JPA → arriba).

---

## 1. Multi-comercio por Dueño

**Nivel: 🟡 SOLO MODELO DE DATOS**

El modelo soporta la cardinalidad N:1 correctamente:
- [`backend/src/main/java/com/bajonea/backend/entities/Comercio.java:39-42`](../backend/src/main/java/com/bajonea/backend/entities/Comercio.java) — `dueno` es `@ManyToOne` con `@JoinColumn(name = "dueno_id", nullable = false)`, no un residuo de relación 1:1.
- `entities/Dueno.java:27-42` — subtipo simultáneo de `PersonaJuridica` (vía `@MapsId`) y `PersonaFisica` (vía `persona_fisica_id`), coherente con el diseño.

Pero la capa de acceso a datos y de servicio asume 1 comercio por Dueño, no N:
- `repositories/ComercioRepository.java` expone `Optional<Comercio> findByDuenoId(Integer duenoId)` — no `List<Comercio>`. Si un Dueño tuviera 2 filas en `comercio`, esta query derivada de Spring Data lanzaría `IncorrectResultSizeDataAccessException` en runtime.
- `services/ComercioService.java:124-127`, método `obtenerComercioDelUsuario`, usa exactamente ese método para resolver "el comercio del usuario logueado" — escrito asumiendo singularidad.

**Sin endpoint de alta de comercio adicional:** `controllers/ComercioController.java` (85 líneas) solo expone `GET /comercios/perfil`, `PUT /comercios/perfil`, `POST /comercios/perfil/foto/firma`, `PUT /comercios/perfil/foto` — los 4 son autoservicio del único comercio del usuario logueado. No existe `POST /comercios` ni ningún `DuenoController`/`DuenoService`. El único punto de creación de un `Comercio` en todo el backend es `services/RegistroService.registrarComercio` (líneas 118-187), que siempre construye la cadena completa desde cero (`Usuario` → `Persona` → `PersonaFisica` → `PersonaJuridica` → `Dueno` → `Comercio`) a partir de un `RegistroComercioRequestDTO` que exige `cuit`, `razonSocial`, `dniRepresentante`, etc. siempre — no hay ninguna rama que reciba un `duenoId` existente y solo pida los datos del comercio nuevo.

**Frontend:** `frontend/registro-comercio.html` es el único formulario de alta de comercio, y es el wizard completo de registro inicial. Grep de `agregar.*comercio|nuevo comercio|selector.*comercio|cambiar.*comercio` sobre toda la carpeta `frontend/` no arrojó resultados — no hay selector de "comercio activo" en ningún header/nav, ni botón "agregar comercio" en `comercio-dashboard.html`/`comercio-perfil.html`.

**Conclusión:** hoy un Dueño no puede dar de alta un segundo comercio por ningún camino que no sea repetir `POST /auth/registro/comercio` completo — y eso además fallaría con `409` porque el email/CUIT/DNI ya existen como únicos.

---

## 2. Direcciones múltiples del Cliente

**Nivel: 🟡 SOLO MODELO DE DATOS**, desglosado por operación:

| Operación | Estado |
|---|---|
| Lectura de la dirección | ✅ (pero solo hay **una**, no una lista) |
| Agregar dirección adicional | ❌ NO EXISTE |
| Editar dirección | ❌ NO EXISTE |
| Eliminar (baja lógica) | ❌ NO EXISTE |
| Marcar como principal | ❌ NO EXISTE |

El modelo de datos ya tiene los campos necesarios: [`entities/Direccion.java:66-72`](../backend/src/main/java/com/bajonea/backend/entities/Direccion.java) define `principal` (boolean) y `eliminada` (boolean). Pero `repositories/DireccionRepository.java` solo expone:
```java
Optional<Direccion> findByComercioId(Integer comercioId);
Optional<Direccion> findByClienteId(Integer clienteId);
```
Ambos devuelven **un solo registro**, no `List<Direccion>` — la capa de datos sigue modelada como "1 cliente = 1 dirección". **No existe `DireccionController.java`** en `controllers/` — no hay ningún endpoint HTTP para gestionar direcciones como recurso propio.

`services/ClienteService.java` (94 líneas) confirma el alcance: sus únicos 2 métodos públicos son `verPerfil()` y `editarPerfil()`; este último solo toca `PersonaFisica.nombre/apellido/telefono` (líneas 46-61), nunca instancia, guarda ni modifica `Direccion`. El único uso de `direccionRepository` en el Service es una lectura de mapeo a DTO (línea 70). `controllers/ClienteController.java` (38 líneas) confirma esto a nivel HTTP: solo `GET /api/v1/clientes/perfil` y `PUT /api/v1/clientes/perfil`, ninguno de direcciones.

**Grep de escrituras reales sobre `principal`/`eliminada` en todo el backend:** `direccion.setPrincipal(true)` aparece **una sola vez en todo el proyecto**, en `services/RegistroService.java:110`, al crear la dirección inicial del Cliente — se persiste con `principal=true` sin alternativa nunca más. `direccion.setEliminada(...)` **no aparece ni una sola vez** en ningún archivo — la única lectura de `isEliminada()` está en `PedidoService.java:92` (validación de que la dirección usada en un pedido no esté de baja), pero nada la da de baja jamás.

**Frontend:** `frontend/perfil.html` no tiene ningún campo de dirección (grep de `direccion|calle|numero|pisoDepto|codigoPostal|localidad` sin coincidencias). `frontend/js/cliente.js` (`initPerfil`) hace `normalizarCampos(cliente.direccion, ['calle'])` (línea 134) pero ese valor nunca se renderiza ni se edita — el único formulario de edición del perfil (líneas 150-158, 227-272) guarda exclusivamente `nombre`/`apellido`/`telefono`. `frontend/js/checkout.js` usa siempre `cliente.direccion` (singular) para el envío a domicilio (líneas 97-106, 182-223, 286-288, 338), sin selector entre varias; si el cliente no tiene dirección, el flujo se bloquea con un banner de error sin ofrecer cargarla ahí mismo.

---

## 3. Grupos de extras y extras en Producto

**Nivel: ❌ NO EXISTE**

**Modelo de datos (SQL, confirmado):** las 5 tablas están en `docs/bajonea_final.sql` con sus columnas reales:
- `grupo_extra` (línea 585): `id, comercio_id, nombre, cantidad_maxima, obligatorio, fecha_creacion, fecha_modificacion, fecha_baja`.
- `extra` (línea 603): `id, grupo_extra_id, nombre, precio, fecha_creacion, fecha_modificacion, fecha_baja`.
- `producto_grupo_extra` (línea 620): PK compuesta `(producto_id, grupo_extra_id)`.
- `item_carrito_extra` (línea 673): `id, item_carrito_id, extra_id, precio_unitario, fecha_creacion`.
- `detalle_pedido_extra` (línea 747): `id, detalle_pedido_id, extra_id, precio_unitario, fecha_creacion`.

**Código Java: cero.** `grep -rn "Extra|GrupoExtra" backend/src/main/java` solo devuelve 3 falsos positivos por la palabra "extraer"/"extraída" (`JwtAuthenticationFilter.java`, `JwtService.java`, `ComercioValidaciones.java`) — nada relacionado al dominio. No hay `Entity`, `Repository`, `Service` ni `Controller` para ninguna de las 5 tablas.

`entities/Producto.java` (12 campos: `id, comercio, categoria, nombre, descripcion, precio, estado, fechaCreacion, fechaModificacion, fechaBaja, imagenes`) no tiene ninguna relación a `GrupoExtra`. `dto/request/ProductoRequestDTO.java` (líneas 28-48) documenta explícitamente en su propio Javadoc qué se dejó fuera a propósito y no menciona extras. `entities/ItemCarrito.java` (5 campos) tampoco tiene relación a `ItemCarritoExtra`; `dto/request/ItemCarritoRequestDTO.java` (líneas 16-28) solo acepta `productoId`, `cantidad`, `nota`.

**Cálculo de totales — puramente `precio × cantidad`, sin ningún concepto de extra:**
```java
// CarritoService.java:148-166
BigDecimal subtotal = item.getProducto().getPrecio().multiply(BigDecimal.valueOf(item.getCantidad()));
```
```java
// PedidoService.java:105-107
BigDecimal subtotalPedido = items.stream()
        .map(item -> item.getProducto().getPrecio().multiply(BigDecimal.valueOf(item.getCantidad())))
        .reduce(BigDecimal.ZERO, BigDecimal::add);
```

**Frontend: cero coincidencias.** Grep de `extra` (excluyendo falsos positivos "extraer"/"extraordinario") sobre `frontend/` no devuelve resultados. No hay ningún modal, sección ni control de selección de extras en `frontend/comercio-detalle.html` (modal de producto del Cliente) ni en `frontend/comercio-producto-form.html` (alta/edición de producto del Comercio).

---

## 4. EmpleadoComercio completo

**Nivel: ❌ NO EXISTE** — más allá del modelo de datos crudo en `bajonea_final.sql`. Es el nivel más bajo de todos los puntos auditados.

**Ausencia total confirmada** de `Empleado.java`, `EmpleadoComercio.java` y de cualquier Repository/Service/Controller/DTO relacionado, en `entities/`, `repositories/`, `services/`, `controllers/`, `dto/`.

**`RolUsuario.java` — el enum de rol ni siquiera contempla EMPLEADO**, evidencia estructural fuerte:
```java
// backend/src/main/java/com/bajonea/backend/enums/RolUsuario.java
public enum RolUsuario {
    CLIENTE,
    DUENO,
    ADMINISTRADOR
}
```
Sin `EMPLEADO`, el JWT (`JwtService`/`JwtAuthenticationFilter`) no puede emitir ni autorizar ese rol bajo ningún escenario.

**`TipoToken.java` — sin `INVITACION_EMPLEADO`:**
```java
public enum TipoToken {
    VERIFICACION_EMAIL,
    RECUPERACION_PASSWORD,
    REACTIVACION_CUENTA
}
```
El token que debería soportar el flujo de invitación por email (T31) no existe ni como valor de enum.

**Únicas 4 menciones reales de "empleado" en todo el backend Java:**
- `enums/TipoNotificacion.java:33-34` — 2 valores de enum sin uso: `INVITACION_EMPLEADO`, `EMPLEADO_DESACTIVADO` (confirmado que no se referencian en ningún otro punto del código).
- `services/CloudinaryService.java:36` y `services/UsuarioService.java:17` — comentarios de intención futura ("...con vista a Dueño/Empleado a futuro...").

**Frontend: cero ocurrencias.** Grep de `empleado` (case-insensitive) sobre toda la carpeta `frontend/` no devuelve ningún resultado.

**Modelo de datos — sí existe en `docs/bajonea_final.sql`, con columnas reales:**
```sql
CREATE TABLE empleado (
    id              INT      NOT NULL,
    fecha_creacion  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_empleado_persona_fisica FOREIGN KEY (id) REFERENCES persona_fisica (id)
) ENGINE=InnoDB ...;

CREATE TABLE empleado_comercio (
    id            INT       NOT NULL AUTO_INCREMENT,
    empleado_id   INT       NOT NULL,
    comercio_id   INT       NOT NULL,
    estado        ENUM('PENDIENTE','ACTIVO','DESACTIVADO') NOT NULL DEFAULT 'PENDIENTE',
    fecha_alta    DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_baja    DATETIME  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_empleado_comercio (empleado_id, comercio_id)
) ENGINE=InnoDB ...;
```
(`docs/bajonea_final.sql` líneas ~219-225 y ~336-351). Pero esto vive únicamente en el archivo SQL/migración baseline — sin ninguna Entity JPA mapeada, `ddl-auto=validate` ni siquiera las toca.

**Conclusión:** no hay flujo de invitación, no hay selector de comercio activo para Empleado, no hay permisos delegados de ningún tipo. Consistente con `CLAUDE.md` §1bis, que ya lo lista como pendiente de una sesión de planificación aparte, sin número de fase asignado.

---

## 5. Integración real con MercadoPago

**Nivel: 🟡 SOLO MODELO DE DATOS (parcial)** — sin SDK, sin lógica de pago, sin webhook. El pedido nace simulado, igual que en el MVP original.

> **Actualización 2026-09-20:** el nivel ya no es "solo modelo de datos". Implementado: vinculación OAuth con PKCE, estado `APTO_VENTA`, preferencia de Checkout Pro con `marketplace_fee` (con `RestClient`, sin SDK), webhook idempotente con verificación cruzada de `external_reference`, sincronización de pago y alertas en `alerta_webhook_mp`. Pendiente: refresh de tokens, verificación del monto, firma obligatoria del webhook y reembolsos (puntos 9 y 10).

`backend/pom.xml` completo no declara ninguna dependencia de MercadoPago — ni `com.mercadopago:sdk-java` ni ningún artefacto relacionado. Las únicas dependencias de terceros además de Spring son `mysql-connector-j`, `flyway-core/mysql`, `lombok`, `springdoc-openapi-starter-webmvc-ui`, `jjwt-api/impl/jackson`, `cloudinary-http5` y `resend-java`.

`grep -ri "mercadopago|mercado.pago|\bmp\b" backend/src/main/java -r` → **0 resultados**. `entities/Comercio.java` no tiene ningún campo `mpVinculado` ni relación a `CuentaMercadoPago`. La clase `CuentaMercadoPago.java` no existe en `entities/`, pese a que `docs/bajonea_final.sql:316-331` define la tabla física completa (`dueno_id` UNIQUE, `mp_user_id`, `access_token`, `refresh_token`, `public_key`, `activa`, `fecha_vinculacion`, `fecha_desvinculacion`, `token_expira`).

**Creación real de un Pedido hoy** (`services/PedidoService.java:116-152`):
```java
Pedido pedido = Pedido.builder()
        .cliente(cliente)
        .comercio(comercio)
        .direccion(direccion)
        .tipoEntrega(request.getTipoEntrega())
        .estado(EstadoPedido.PENDIENTE)
        .pagoEstado(EstadoPagoPedido.PENDIENTE)
        .subtotal(subtotalPedido)
        .cargoServicioCliente(cargoServicioCliente)
        .cargoServicioComercio(cargoServicioComercio)
        .total(subtotalPedido.add(cargoServicioCliente))
        .fechaCreacion(LocalDateTime.now())
        .build();
pedidoRepository.save(pedido);
```
El pedido nace directo en `EstadoPedido.PENDIENTE` — nunca en `PENDIENTE_PAGO` (que sí existe como valor de enum) — sin redirección a MercadoPago, sin `preference`, sin fila en `pago`. `cargoServicioCliente`/`cargoServicioComercio` están hardcodeados a `BigDecimal.ZERO` (líneas 108-109, ver también Punto 6). `EstadoPagoPedido` (3 valores: `PENDIENTE`, `PAGADO`, `RECHAZADO`) se setea una vez a `PENDIENTE` y nunca se vuelve a tocar en todo `PedidoService.java`.

**Hallazgo de portabilidad de modelo:** `enums/EstadoPedido.java` ya tiene los 11 valores completos (Tramo 4 de portabilidad, ver `CLAUDE.md` §1bis), pero es solo el *enum* el que fue portado — la *máquina de estados real* en `PedidoService.java` sigue siendo la de 3 estados del MVP recortado (ver Punto 13).

`controllers/PedidoController.java`: `POST /cliente`, `GET /cliente`, `GET /comercio`, `GET /comercio/resumen-hoy`, `PUT /comercio/{id}/aceptar`, `PUT /comercio/{id}/rechazar` — ningún endpoint de pago, preferencia ni webhook. `grep -rn "webhook|Webhook" backend/src/main/java` → **0 resultados** en todo el backend.

**Frontend:** grep de `mercadopago|checkout.*pro|preference` sobre `frontend/checkout.html` y sobre toda la carpeta → **0 resultados**. No hay ningún SDK JS de MP cargado, ni botón "Pagar con MercadoPago".

---

## 6. ConfiguracionTarifa: CRUD Admin + aplicación real de tarifas

**Nivel: ❌ NO EXISTE**

> **Actualización 2026-09-20:** implementado: CRUD de Administrador y aplicación real de la tarifa vigente al crear el pedido ($200 fijo al cliente, 1% del subtotal al comercio).

**Modelo de datos (SQL, confirmado):** `docs/bajonea_final.sql:377-388`:
```sql
CREATE TABLE configuracion_tarifa (
    id                INT           NOT NULL AUTO_INCREMENT,
    administrador_id  INT           NOT NULL,
    cargo_cliente     DECIMAL(10,2) NOT NULL,
    cargo_comercio    DECIMAL(10,2) NOT NULL,
    fecha_vigencia    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
    ...
```

**Código Java: cero.** `grep -rn "ConfiguracionTarifa" backend/` → 0 coincidencias en todo el backend. No existe `entities/ConfiguracionTarifa.java` ni ningún Repository/Service/Controller.

**`entities/Pedido.java` sí tiene los campos de destino** (líneas 112-118), ya portados desde el schema completo:
```java
@Column(name = "cargo_servicio_cliente", precision = 10, scale = 2, nullable = false)
private BigDecimal cargoServicioCliente;

@Column(name = "cargo_servicio_comercio", precision = 10, scale = 2, nullable = false)
private BigDecimal cargoServicioComercio;
```

**Pero `PedidoService.java` los hardcodea en cero al crear el pedido**, sin consultar ninguna tarifa vigente (`PedidoService.java:105-129`):
```java
BigDecimal cargoServicioCliente = BigDecimal.ZERO;
BigDecimal cargoServicioComercio = BigDecimal.ZERO;
```
No es un `TODO` ni una llamada a un service inexistente — son literales `BigDecimal.ZERO` explícitos en el código. `total` queda siempre igual a `subtotalPedido` porque el cargo es cero.

`controllers/AdministradorController.java` expone exactamente 6 endpoints (`GET /comercios/pendientes`, `GET /comercios`, `GET /clientes`, `GET /perfil`, `GET /metricas`, `PUT /comercios/{id}/resolver`) — ninguno referencia tarifas/comisión/cargo de servicio.

**Frontend:** grep de `tarifa|comision|cargo.*servicio` sobre toda la carpeta `frontend/` (incluido `admin-dashboard.html`) → **0 resultados**.

---

## 7. Reclamo

**Nivel: ❌ NO EXISTE**

**Modelo de datos (confirmado):** `docs/bajonea_final.sql:818-834`:
```sql
CREATE TABLE reclamo (
    id                  INT           NOT NULL AUTO_INCREMENT,
    pedido_id           INT           NOT NULL,
    descripcion         TEXT          NOT NULL,
    fecha_creacion      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado              ENUM('PENDIENTE','APROBADO','RECHAZADO') NOT NULL DEFAULT 'PENDIENTE',
    administrador_id    INT           NULL,
    nota_resolucion     VARCHAR(500)  NULL,
    fecha_resolucion    DATETIME      NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_reclamo_pedido (pedido_id)
    ...
```

**Backend:** `grep -rn -i "reclamo" backend/src/main/java/` devuelve un único archivo real: `enums/TipoNotificacion.java:21-23` — 3 constantes de enum (`NUEVO_RECLAMO`, `RECLAMO_APROBADO`, `RECLAMO_RECHAZADO`) sin ningún `NotificacionService.crear(...)` que las use. No existe `Reclamo.java`, ni Repository/Service/Controller, ni `EstadoReclamo.java` como enum Java (confirmado por el listado completo de 22 archivos en `enums/`, ninguno se llama así).

**Frontend:** `grep -rln -i "reclamo" frontend/` → **0 archivos**. El campo T8 del diccionario ("Incluye opciones para iniciar reclamo" sobre `PEDIDO_AUTOCONFIRMADO`) no tiene ni siquiera un placeholder de UI en `frontend/pedido-detalle.html`/`frontend/js/pedidos.js`.

---

## 8. Soporte

**Nivel: ❌ NO EXISTE en código de aplicación** — hay 4 mensajes estáticos de UI que mencionan "soporte" sin ningún flujo, formulario ni endpoint real detrás.

**Modelo de datos (confirmado):** `docs/bajonea_final.sql:477-493`:
```sql
CREATE TABLE soporte (
    id                 INT       NOT NULL AUTO_INCREMENT,
    usuario_id         INT       NOT NULL,
    mensaje_descargo   TEXT      NOT NULL,
    fecha_envio        DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atendido           TINYINT(1) NOT NULL DEFAULT 0,
    administrador_id   INT       NULL,
    resolucion         ENUM('REACTIVADO','SUSPENSION_MANTENIDA') NULL,
    fecha_resolucion   DATETIME  NULL
    ...
```

**Backend:** `grep -rn -i "soporte" backend/src/main/java/` devuelve un único match: `enums/TipoNotificacion.java:24` (`NUEVO_MENSAJE_SOPORTE`), sin ningún sitio que lo dispare. No existe `Soporte.java` ni `ResolucionSoporte.java` como enum Java.

`EstadoUsuario` sí incluye `SUSPENDIDO` hoy (`enums/EstadoUsuario.java:3-9`: `PENDIENTE, ACTIVO, BLOQUEADO, SUSPENDIDO, INACTIVO`).

**Comportamiento real hoy ante login de un usuario `SUSPENDIDO`** (`services/AuthService.java`, método `validarEstadoParaLogin`, líneas 271-282):
```java
case SUSPENDIDO -> throw new ConflictoDeNegocioException("Cuenta suspendida");
```
`ConflictoDeNegocioException` se mapea a **HTTP 409** (`GlobalExceptionHandler.java:74-77`) — sin token, sin dato adicional, sin ningún camino de acción. No hay endpoint de descargo/apelación en ningún Controller.

**Frontend — el mensaje se traduce a texto estático sin ninguna acción real.** `frontend/js/auth.js:68-81`:
```javascript
const MENSAJES_LOGIN_CONFLICTO = {
  'Cuenta suspendida': {
    kind: 'error',
    html: 'Tu cuenta fue suspendida. Contactá a soporte para más información.',
  },
};
```
"Contactá a soporte" es texto plano sin link, sin `mailto:`, sin formulario — a diferencia de las entradas hermanas del mismo objeto (bloqueo/inactivo), que sí enlazan a `recuperar-password.html`/`reactivar-cuenta.html`. El mismo patrón estático se repite en 3 lugares más, ninguno con acción real: `frontend/js/auth.js:150` (banner de comercio no operativo), `frontend/comercio-perfil.html:119`, `frontend/comercio-rechazado.html:20`, `frontend/errores/acceso-denegado.html:20`.

---

## 9. NotaCredito — reembolso TOTAL

**Nivel: ❌ NO EXISTE**

`grep -rn "PagoService|PagoController|NotaCreditoService|NotaCreditoController|MercadoPagoService|CuentaMercadoPagoService"` sobre `backend/src/main/java` → **0 resultados**, ni siquiera un nombre de clase planeado en `docs/DECISIONES.md`. `Pago.java` y `NotaCredito.java` no existen en `entities/`.

Tablas físicas completas en `docs/bajonea_final.sql`:
- `pago` (líneas 781-793): `id, pedido_id (UNIQUE), monto, metodo_pago, id_transaccion_mp, fecha_creacion, fecha_confirmacion`.
- `nota_credito` (líneas 798-814): `id, pago_id, monto, estado (ENUM), intentos, refund_id_mp, fecha_emision, fecha_proceso, fecha_fallido`.

El único vestigio real en código es `enums/TipoNotificacion.java:29` (`REEMBOLSO_FALLIDO_DEFINITIVO`, T27) — confirmado sin uso en ningún otro lugar. No hay ningún job periódico de reintentos, ninguna clase de servicio, ningún endpoint de reembolso.

---

## 10. NotaCredito — reembolso PARCIAL por ítem

**Nivel: 🟡 SOLO MODELO DE DATOS (parcial)** — ni siquiera existe la Entity `NotaCredito`; solo se agregaron 2 campos a `DetallePedido` y una columna FK física sin mapear. Confirmado con evidencia fresca (2026-09-15) que sigue exactamente así.

Entrada de origen exacta: `docs/DECISIONES.md`, **"2026-08-28 — Modelo de datos: cancelación/anulación parcial de ítems de un pedido"**. Cita textual del alcance delimitado en esa misma entrada: *"sin tocar todavía ningún Service/Controller/endpoint, solo el impacto en base de datos física y su mapeo ORM (...) La lógica de negocio real (...) queda explícitamente para un tramo posterior."*

Lo único real que se hizo ese día: `entities/DetallePedido.java` ganó los campos `estado` (`EstadoDetallePedido`: `ACTIVO/CANCELADO/ANULADO`) y `motivoAnulacion` (`String`), y la migración `V2__cancelacion_parcial_detalle_pedido.sql` agregó la columna física `nota_credito_id` a `detalle_pedido`. Esa columna **deliberadamente no está mapeada en el Entity** — `docs/DECISIONES.md` lo documenta explícito: *"la columna física `nota_credito_id` sí se creó (...) pero no está mapeada todavía en el Entity (...) pendiente explícito: agregar el campo `notaCredito` (`@ManyToOne`) a `DetallePedido.java` en el mismo tramo futuro que cree `NotaCredito.java`"* — precisamente porque `NotaCredito.java` no existe.

Verificación de que ningún tramo posterior avanzó esto: recorrido completo de `docs/DECISIONES.md` desde el 2026-08-28 hasta la última entrada (2026-09-04) — ninguna de las ~20 entradas posteriores contiene "nota de crédito", "NotaCredito", "reembolso parcial", "cancelación de ítem" ni "anulación de ítem". `CLAUDE.md` §6 sigue listando esto dentro del "Bloque de fases nuevas (...) pendientes de definir orden e implementación, sin número asignado todavía".

---

## 11. Cancelación/anulación de pedido completo vs. anulación de ítem puntual

**Nivel: ❌ NO EXISTE (pedido completo, por Cliente o por Comercio) / 🟡 SOLO MODELO DE DATOS (ítem puntual)**

```
grep -in "cancelar\|anular" PedidoService.java PedidoController.java  →  0 resultados
```
No existe `PUT /pedidos/.../cancelar` (Cliente) ni `PUT /pedidos/.../anular` (Comercio). Ningún endpoint, ningún método de servicio. Consistente con el Punto 13: los estados `CANCELADO` y `ANULADO` del enum son literales sin código. Tampoco hay generación de `NotaCredito`/reembolso en ningún punto de `PedidoService.java`.

**Anulación de ítem puntual (`DetallePedido.estado`):** `entities/DetallePedido.java` sí tiene el campo (líneas 63-66):
```java
@Setter
@Enumerated(EnumType.STRING)
@Column(name = "estado", nullable = false)
private EstadoDetallePedido estado;
```
Y el enum `EstadoDetallePedido` (`ACTIVO, CANCELADO, ANULADO`) existe completo. Pero el único lugar donde se setea es en la creación del pedido (`PedidoService.java:140`, `.estado(EstadoDetallePedido.ACTIVO)`) — no hay ningún método posterior, ni en `PedidoService` ni en ningún otro Service/Controller (no existe `DetallePedidoService`/`DetallePedidoController`), que lea o modifique este campo después. `motivoAnulacion` tampoco se usa nunca.

---

## 12. Cierre manual del comercio (`cerrado_manualmente`)

**Nivel: ❌ NO EXISTE en código** — solo columna física en la base, sin mapear en la Entity JPA.

```sql
-- docs/bajonea_final.sql:261 (tabla comercio)
cerrado_manualmente   TINYINT(1)    NOT NULL DEFAULT 0,
```
```
grep -rin "cerrado_manualmente|cerradoManualmente" backend/src/main/java  →  0 resultados
```
`entities/Comercio.java` completo (88 líneas) no mapea esta columna — sus campos son `id, dueno, nombre, descripcion, fotoPerfilUrl, telefono, email, tipoComercio, aceptaDelivery, aceptaRetiro, estado, fechaRegistro, fechaModificacion`. Al no estar mapeada, JPA/Hibernate nunca la lee ni la escribe.

**Cómo resuelve hoy el proyecto "abierto/cerrado"** (`services/ComercioService.java:93-115`):
```java
public void validarAceptaPedidos(Comercio comercio) {
    if (comercio.getEstado() != EstadoComercio.APROBADO) {
        throw new ConflictoDeNegocioException("Este comercio no está aceptando pedidos en este momento");
    }
    List<Horario> horarios = horarioRepository.findByComercioId(comercio.getId());
    if (!estaAbiertoAhora(horarios)) {
        throw new ConflictoDeNegocioException(
                "Este comercio está cerrado en este momento. Podés hacer tu pedido dentro de su horario de atención.");
    }
}
```
Es exclusivamente `EstadoComercio.APROBADO` + rango horario de `Horario` (con `ZONA_HORARIA_COMERCIO`, el mismo patrón del bug de timezone corregido recientemente en los commits `1519ae7`/`b9f776b`) — **sin ningún chequeo de `cerrado_manualmente`**. `frontend/js/catalogo.js` replica el mismo criterio del lado cliente.

**Frontend:** grep de `cerrar.*local|abrir.*local|cerrado.*manual` sobre `frontend/js/comercio.js`/`frontend/comercio-dashboard.html` → **0 resultados**. No hay ningún toggle de "cerrar temporalmente" en el dashboard del Comercio.

---

## 13. Máquina de estados completa del Pedido

**Nivel: 🟡 SOLO MODELO DE DATOS (parcial)** — el enum y la Entity `Pedido` están preparados para los 11 estados del diseño completo, pero el código de negocio implementa exactamente **3 transiciones reales**: `PENDIENTE → EN_PREPARACION` y `PENDIENTE → RECHAZADO` (el pedido nace directo en `PENDIENTE`).

> **Actualización 2026-09-20:** implementado y probado en vivo: los 11 estados con sus transiciones, historial con actor, 4 jobs `@Scheduled` y el estado `PENDIENTE_CONFIRMACION_COMERCIO` (antes `PENDIENTE`). Los estados con reembolso no devuelven el dinero todavía (puntos 9 y 10). Pendiente del cierre formal de Diego.

**`services/PedidoService.java` — métodos públicos (286 líneas totales):**

| Método | Línea | Qué hace |
|---|---|---|
| `confirmarPedido` | 64-153 | Crea el `Pedido` directo en `EstadoPedido.PENDIENTE` (línea 121) |
| `aceptarPedido` | 155-170 | `PENDIENTE → EN_PREPARACION` (línea 162) |
| `rechazarPedido` | 172-199 | `PENDIENTE → RECHAZADO` (línea 184) |
| `listarPedidosCliente` / `listarPedidosComercio` / `obtenerResumenHoy` | 201-233 | Solo lectura/agregación |

No hay `cancelarPedido`, `anularPedido`, `despacharPedido`, `marcarListoParaRetirar`, `entregarPedido`, `expirarPedido`, ni nada que toque `pagoEstado`, `canceladoPor`, `fuenteEntrega`, `fechaEntrega`, `suspensionRetiroExpira` o `primerAvisoEmitido` — campos que sí existen en la Entity (`entities/Pedido.java:68-97`) pero nunca se setean fuera del `@Builder` inicial.

**`controllers/PedidoController.java` (6 endpoints reales):** `POST /pedidos/cliente`, `GET /pedidos/cliente`, `GET /pedidos/comercio`, `GET /pedidos/comercio/resumen-hoy`, `PUT /pedidos/comercio/{id}/aceptar`, `PUT /pedidos/comercio/{id}/rechazar`. Ninguno de cancelación/anulación/despacho/entrega.

**Estado por estado, de los 11 valores del enum:**

| Estado | ¿Transición real? | Evidencia |
|---|---|---|
| `PENDIENTE_PAGO` | ❌ | El pedido nunca nace acá — nace directo en `PENDIENTE` (`PedidoService.java:121`). Sin integración real de MercadoPago en el ciclo de vida. |
| `PENDIENTE` | ✅ | Estado inicial, `PedidoService.java:121` |
| `EN_PREPARACION` | ✅ | `aceptarPedido`, `PedidoService.java:162` |
| `EN_CAMINO` | ❌ | Sin ocurrencias fuera del enum |
| `LISTO_PARA_RETIRAR` | ❌ | Sin ocurrencias fuera del enum |
| `ENTREGADO` | ❌ | Sin ocurrencias — `EN_PREPARACION` es terminal en la práctica |
| `RECHAZADO` | ✅ (sin reembolso) | `rechazarPedido`, `PedidoService.java:184` — solo persiste estado y notifica, sin `NotaCredito` |
| `CANCELADO` | ❌ | `grep -in "cancelar"` sin resultados |
| `ANULADO` | ❌ | `grep -in "anular"` sin resultados |
| `CANCELADO_POR_SISTEMA` | ❌ | Sin disparador (ni suspensión de comercio, ni rechazo de pago) |
| `EXPIRADO` | ❌ | Sin timer de 1h implementado |

**Jobs/schedulers automáticos:**
```
grep -rn "@Scheduled" backend/src/main/java   →  0 resultados
```
**Ninguno** de los 4 timers automáticos del diseño está implementado: ni expiración de pago (30 min), ni timeout de respuesta del comercio (1h → `EXPIRADO`), ni timer de retiro (90 min), ni aviso a los 75 min.

**Frontend:** `frontend/js/pedidos.js` (Cliente) y `frontend/js/comercio.js` (Comercio) solo mapean/renderizan `PENDIENTE`, `EN_PREPARACION`, `RECHAZADO` — cero referencias a `EN_CAMINO`, `LISTO_PARA_RETIRAR`, `ENTREGADO`, `CANCELADO`, `ANULADO`, `EXPIRADO`, `CANCELADO_POR_SISTEMA` o `PENDIENTE_PAGO` en ningún archivo.

---

## 14. Trazabilidad real: HistorialEstadoUsuario, HistorialEstadoComercio, HistorialEstadoPedido

**Nivel: mixto — `HistorialEstadoComercio` 🟡 parcial (con huecos reales); `HistorialEstadoUsuario` ❌; `HistorialEstadoPedido` ❌.**

### HistorialEstadoComercio — 🟡 parcial

**Insertado en:** `services/AdministradorService.java:123-131`, dentro de `resolverAprobacion()` — cubre `PENDIENTE → APROBADO` / `PENDIENTE → RECHAZADO` por el Administrador, con `estadoOrigen`, `estadoDestino`, `motivo` y `administrador` reales.

**NO insertado — huecos reales encontrados:**
- `services/AuthService.java:298-308` (`propagarBloqueoAComercio`) — muta `comercio.setEstado(EstadoComercio.CERRADO_TEMPORALMENTE)` (línea 304) cuando el Dueño se bloquea, **sin** insertar fila. `AuthService.java` ni siquiera tiene el repository de historial inyectado.
- `services/AuthService.java:310-319` (`restaurarComercioSiCorresponde`) — muta `comercio.setEstado(EstadoComercio.APROBADO)` (línea 316) al recuperar contraseña/reactivar cuenta del Dueño, **sin** insertar fila.
- `EstadoComercio.SUSPENDIDO`/`INACTIVO` — no hay ningún `setEstado(EstadoComercio.SUSPENDIDO)` en todo el backend; no existe mecanismo de suspensión de Comercio por Administrador implementado.

De los 3 sitios reales que mutan `Comercio.estado`, solo 1 de 3 escribe historial.

### HistorialEstadoUsuario — ❌ NO EXISTE

Confirmado por ausencia total de `HistorialEstadoUsuario.java` en `entities/`/`repositories/`. La tabla `historial_estado_usuario` sí existe en `docs/bajonea_final.sql:138-150` (`usuario_id, estado_origen, estado_destino, motivo, fecha_hora`) — gap real backend-vs-schema. `services/AuthService.java` tiene **5 transiciones reales** de `Usuario.estado` sin ningún registro de historial (ni tabla, ni campo de texto): `verificarEmail`/`verificarEmailConCodigo`/`confirmarRecuperacionPassword`/`confirmarReactivacionCuenta` (línea 123, 141, 193, 255) → `ACTIVO`; `registrarIntentoFallido` (línea 289) → `BLOQUEADO`. Ningún motivo ni timestamp de transición queda registrado — solo el valor actual de `Usuario.estado` persiste.

### HistorialEstadoPedido — ❌ NO EXISTE

Confirmado por ausencia total de `HistorialEstadoPedido.java`. La tabla `historial_estado_pedido` sí existe en `docs/bajonea_final.sql:765-776` (`pedido_id, estado, cancelado_por, fuente_entrega, fecha_hora`) — mismo patrón de gap. `Pedido.estado` se sobrescribe directo en `aceptarPedido`/`rechazarPedido` sin ningún historial paralelo.

---

## 15. Notificaciones (catálogo T1–T32)

**Nivel: 🟡 PARCIAL** — el enum `TipoNotificacion` está 100% completo (31 valores, coincide exacto con el diseño sin T4), pero solo **6 de 31** se disparan realmente, y **ninguna** de las que el diseño marca como Push+Email tiene su parte de Email implementada.

`grep` exhaustivo de `notificacionService.crear(...)` en todo el backend da exactamente **6 invocaciones**, repartidas en 3 services (`PedidoService.java`, `AdministradorService.java`, `ProductoService.java`) — `RegistroService`, `ComercioService`, `AuthService`, `CarritoService` nunca llaman a `notificacionService.crear`.

`services/EmailService.java` (82 líneas) tiene exactamente 3 métodos: `enviarVerificacion`, `enviarRecuperacionPassword`, `enviarReactivacionCuenta` — todos de autenticación, ninguno vinculado al catálogo T1-T32. El canal Email de notificaciones no existe en absoluto más allá de esos 3 emails transaccionales.

| Tipo | Cód | Push | Email | Observación |
|---|---|---|---|---|
| NUEVO_PEDIDO | T1 | ✅ `PedidoService.java:147-150` | ❌ | Dispara al Dueño, no a Empleados (no portado) |
| PEDIDO_ACEPTADO | T2 | ✅ `PedidoService.java:165-167` | ❌ | Completo |
| PEDIDO_RECHAZADO | T3 | ✅ `PedidoService.java:195-196` | ❌ | Completo, incluye motivo |
| PEDIDO_EN_CAMINO | T5 | ❌ | ❌ | `EN_CAMINO` sin transición real (Punto 13) |
| PEDIDO_LISTO_RETIRO | T6 | ❌ | ❌ | `LISTO_PARA_RETIRAR` sin transición real |
| AVISO_75MIN_SIN_CONFIRMACION | T7 | ❌ | ❌ | Sin job/`@Scheduled` |
| PEDIDO_AUTOCONFIRMADO | T8 | ❌ | ❌ | Requiere job de 90min, inexistente |
| PEDIDO_CANCELADO_CLIENTE | T9 | ❌ | ❌ | Sin endpoint de cancelación |
| PEDIDO_ANULADO_COMERCIO | T10 | ❌ | ❌ | Sin anulación desde `EN_PREPARACION` |
| PEDIDO_CANCELADO_SISTEMA | T11 | ❌ | ❌ (Push+Email esperado) | Sin job de cancelación automática |
| PEDIDO_EXPIRADO_CLIENTE | T12 | ❌ | ❌ | Sin job de expiración 1h |
| PEDIDO_EXPIRADO_COMERCIO | T13 | ❌ | ❌ | Idem |
| COMERCIO_APROBADO | T14 | ✅ `AdministradorService.java:136-139` | ❌ (Push+Email esperado) | Falta el Email |
| COMERCIO_RECHAZADO | T15 | ✅ `AdministradorService.java:136-139` | ❌ (Push+Email esperado) | Falta el Email |
| COMERCIO_SUSPENDIDO | T16 | ❌ | ❌ (Push+Email esperado) | Sin mecanismo real de suspensión |
| NUEVO_COMERCIO_PENDIENTE | T17 | ❌ | ❌ | `RegistroService` no notifica al Admin |
| NUEVA_RESOLICITUD_COMERCIO | T18 | ❌ | ❌ | Sin flujo de re-solicitud |
| NUEVO_RECLAMO | T19 | ❌ | ❌ | Sin `Reclamo` (Punto 7) |
| RECLAMO_APROBADO | T20 | ❌ | ❌ | Idem |
| RECLAMO_RECHAZADO | T21 | ❌ | ❌ | Idem |
| NUEVO_MENSAJE_SOPORTE | T22 | ❌ | ❌ | Sin `Soporte` (Punto 8) |
| PRODUCTO_REMOVIDO_CARRITO | T23 | ✅ `ProductoService.java:370-372` | ❌ | Completo |
| CUENTA_INACTIVADA | T24 | ❌ | ❌ (Email esperado) | Sin job de inactivación por 3 meses |
| COMERCIO_INACTIVADO | T25 | ❌ | ❌ (Email esperado) | Idem |
| PEDIDO_CERRADO_TIMER_SUSPENSION | T26 | ❌ | ❌ | Depende de suspensión de pedido inexistente |
| REEMBOLSO_FALLIDO_DEFINITIVO | T27 | ❌ | ❌ (Push+Email esperado) | Sin `Pago`/`NotaCredito` (Punto 9) |
| CLIENTE_SUSPENDIDO | T28 | ❌ | ❌ (Push+Email esperado) | Sin suspensión de Cliente por Admin |
| SUSPENSION_LEVANTADA | T29 | ❌ | ❌ (Push+Email esperado) | Idem |
| PEDIDO_AUTOCONFIRMADO_COMERCIO | T30 | ❌ | ❌ | Depende del job inexistente de T8 |
| INVITACION_EMPLEADO | T31 | ❌ | ❌ (Email esperado) | Sin `Empleado`/`EmpleadoComercio` (Punto 4) |
| EMPLEADO_DESACTIVADO | T32 | ❌ | ❌ | Idem |

**Resumen:** 6/31 implementadas como push real y funcional end-to-end (consumidas por polling en `frontend/js/notificaciones.js`); 0/31 con su parte de Email implementada (incluidas T14/T15, que sí tienen push); 25/31 sin ningún disparo.

**Mecanismo real (`services/NotificacionService.java`, confirmado completo):** puramente push in-app vía polling REST — `frontend/js/notificaciones.js:140` usa `window.setInterval(...)`; sin WebSocket, SSE, Service Worker ni Web Push API en ningún lugar de `frontend/`. `crear(...)` persiste siempre con `canal = CanalNotificacion.PUSH` y `estado = EstadoEnvioNotificacion.PENDIENTE` hardcodeados — no hay lógica que decida canal según `TipoNotificacion`.

---

## 16. Redes sociales del comercio

**Nivel: 🟡 SOLO BACKEND**, desglosado:

| Operación | Estado |
|---|---|
| Carga inicial (registro del comercio) | ✅ completo end-to-end |
| Alta/edición/baja vía API dedicada | 🟡 backend completo, sin frontend posterior |
| Gestión posterior desde el panel del Comercio | ❌ NO EXISTE — cero UI |
| Visualización en el perfil público del catálogo | ❌ NO EXISTE — el DTO público ni lo incluye |

**Backend — completo y correcto.** `entities/RedSocial.java` (63 líneas): `comercio`, `tipo` (`TipoRedSocial`), `url`, `fechaCreacion`/`fechaModificacion`/`fechaBaja`. `repositories/RedSocialRepository.java`: `findByComercioIdAndFechaBajaIsNull`, `countByComercioIdAndFechaBajaIsNull`, `findByComercioIdAndTipo`. `services/RedSocialService.java` (105 líneas) implementa CRUD real: `listarActivas`, `agregar` (valida duplicado de tipo activo + tope `MAX_REDES_SOCIALES_ACTIVAS = 5`), `editar`, `darDeBaja` (soft delete real).

```java
// controllers/RedSocialController.java
@RequestMapping("/api/v1/comercios/redes-sociales")
GET    /api/v1/comercios/redes-sociales          → listar()
POST   /api/v1/comercios/redes-sociales          → agregar()   (201)
PUT    /api/v1/comercios/redes-sociales/{id}      → editar()    (200)
DELETE /api/v1/comercios/redes-sociales/{id}      → darDeBaja() (200)
```
Rol requerido (`SecurityConfig.java:92`): `.hasRole("DUENO")` vía el matcher `/api/v1/comercios/**`. La regla de "mínimo 1 fila activa por comercio" de la especificación **no está implementada** — `darDeBaja()` no impide dejar al comercio en 0 redes sociales activas.

**Carga inicial — sí es end-to-end.** `RegistroService.registrarComercio()` llama `validarRedesSociales()`/`guardarRedesSociales()` (líneas 189-206). `frontend/registro-comercio.html:376-380` + `frontend/js/auth.js:1122-1211` implementan el wizard completo (mínimo 1, máximo 5, validación de tipo/URL/duplicados).

**Gestión posterior — no existe ninguna UI.** Grep de `red.?social|instagram|facebook` sobre `frontend/comercio-perfil.html`, `frontend/js/comercio.js`, `frontend/comercio-detalle.html` → **0 resultados** en los 3 archivos. `frontend/js/api.js` no tiene ninguna referencia a `redes-sociales` fuera del registro.

**Visualización pública — no existe.** `ComercioPublicoResponseDTO.java` (usado por `CatalogoController`) **no tiene campo `redesSociales`** entre sus 14 campos. Curiosamente, tampoco lo tiene `ComercioResponseDTO.java` (el propio perfil del Comercio autenticado) — sus 20 campos no lo incluyen. El único DTO que sí lo expone es `ComercioAdminResponseDTO.java:46`, consumido únicamente por `frontend/js/admin.js:500-502` en `admin-comercio-detalle.html` — **hoy solo el Administrador ve las redes sociales de un comercio**, ni el propio Comercio dueño ni el catálogo público.

---

## 17. Testing cross-browser/cross-device

**Nivel: 🟡 PARCIAL** — una única configuración (Chromium Desktop), sin cobertura real cross-browser ni cross-device.

`testing/playwright/playwright.config.ts`:
```ts
projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
```
Un solo `project`, un solo browser engine — sin `firefox`/`webkit`, sin ningún viewport mobile (`Pixel 5`, `iPhone 13`, etc.) ni tablet configurado a nivel global. Grep de `test.use`/`viewport`/`devices\[` sobre los 17 archivos `*.spec.ts` de `testing/playwright/tests/` → **0 coincidencias** — ningún spec simula mobile de forma aislada tampoco.

**17 specs reales** (no 9): `01-registro-y-verificacion` a `09-notificaciones` (los 9 originales de Fase 17) más `10-recuperacion-y-reactivacion`, `11-perfil-cliente`, `12-carrito-checkout-explorar`, `13-registro-comercio-wizard`, `14-perfil-comercio`, `15-crud-productos-validaciones`, `16-rechazo-pedido-validaciones`, `17-validaciones-administrador` (agregados en fechas 2026-09-02 a 2026-09-04). **Drift de documentación real:** `testing/playwright/README.md` y `CLAUDE.md` §6 Fase 17 solo documentan el resultado agregado de los 9 specs originales (9 specs, 36 tests, 35/36 en verde, última re-verificación 2026-09-02) — los specs 10-17 tienen evidencia de corrida dispersa en documentos aparte (`docs/MAPEO-ARCHIVOS-FASE4-PLAYWRIGHT-ADMINISTRADOR.md`, `docs/MAPEO-ARCHIVOS-TRAMO-PLAYWRIGHT-MATRIZ-CLIENTE.md`/`-COMERCIO.md`), no en una cifra agregada única que cubra los 17 juntos.

En síntesis: sea cual sea el conteo total de tests, la totalidad de la suite corre exclusivamente contra Chromium Desktop — cero cobertura de Firefox, WebKit/Safari, o cualquier viewport mobile/tablet.

---

## Sección aparte — 2 puntos nuevos sugeridos por los profesores en la mesa final

### 18. Validación de fecha de nacimiento en el registro (año futuro/actual)

**Nivel: 🟡 PARCIAL** — el date picker HTML no bloquea nada por sí mismo (sin `max`), pero hay validación JS explícita en blur/submit y validación backend redundante, con una asimetría de reglas de negocio real entre Cliente y representante de Comercio.

**HTML — sin `max` en ningún input:**
- `frontend/registro-cliente.html:75` — `<input type="date" id="fechaNacimiento" required data-testid="input-fecha-nacimiento" />`
- `frontend/registro-comercio.html:213` — `<input type="date" id="fechaNacimientoRepresentante" required data-testid="input-fecha-nacimiento-representante" />`

Ninguno tiene `max` ni `min` — el widget nativo deja seleccionar libremente cualquier año, incluido 2027+ o el resto de 2026. El bloqueo no ocurre en el date picker, solo al perder foco o enviar.

**JS — validación real, pero distinta para Cliente que para el representante de Comercio:**

`frontend/js/validators.js:94-104` (Cliente, vía `auth.js:394`):
```js
export function esFechaNacimientoClientePlausible(fechaTexto) {
  if (fecha > hoy) return false;              // rechaza fecha futura
  const haceCientoVeinteAnios = new Date(hoy);
  haceCientoVeinteAnios.setFullYear(haceCientoVeinteAnios.getFullYear() - 120);
  return fecha >= haceCientoVeinteAnios;       // rechaza > 120 años atrás
}
```
Rechaza fecha futura y >120 años, **sin piso de 18 años** — una fecha de 2026-01-01 (año en curso, pasada) pasaría sin error.

`frontend/js/validators.js:51-63` (`esFechaNacimientoValida`, representante de Comercio vía `auth.js:279-291`/826) sí exige `edad >= 18`, lo que de hecho excluye cualquier fecha del año en curso.

**Esto es una decisión de negocio deliberada, documentada** en `docs/DECISIONES.md:6109`: *"Cliente usa `@ValidarFechaNacimientoPlausible` (solo plausibilidad, sin piso de edad); Comercio sí necesita el piso de 18 años porque el representante firma en nombre de la empresa. Divergencia de regla de negocio, no un descuido"*.

**Backend:** `RegistroClienteRequestDTO.java:53-55` → `@ValidarFechaNacimientoPlausible` (sin `@MayorDeEdad`); `FechaNacimientoPlausibleValidator.java:17-27` rechaza futuro y >120 años, sin piso de edad. `RegistroComercioRequestDTO.java:175-177` → `@ValidarFechaNacimientoRepresentante`; `FechaNacimientoRepresentanteValidator.java:27-35` rechaza futuro, >120 años, **y** <18 años.

**Sobre el commit `66b4dd4`** ("techo de 120 años en fecha de nacimiento del representante"): el diff real (`git show 66b4dd4`) agrega únicamente `esFechaNacimientoNoAnteriorA120Anios(...)` — un **límite inferior** (fecha más antigua permitida). El chequeo de fecha futura ya existía antes, sin cambios; el fix no tocó nada relacionado a año actual/futuro.

**Conclusión:** ningún input tiene `max` en el HTML; el bloqueo de años futuros existe vía JS+backend para ambos casos; pero el bloqueo específico de "año en curso" solo aplica al representante de Comercio (efecto colateral de la regla de 18 años) — para el Cliente, una fecha de nacimiento de 2026 pasa todas las validaciones actuales, por diseño documentado.

### 19. Campo de carnet/libreta sanitaria

**Nivel: ❌ NO EXISTE** — sin ningún vestigio en ninguna capa, confirmando que es 100% nuevo.

Cuatro búsquedas `grep -rni "carnet|libreta.*sanitaria|sanitario"` con cero coincidencias:
- `backend/src/main/java/com/bajonea/backend/` → 0
- `frontend/` → 0
- `docs/diccionario-de-datos.md` → 0
- `docs/bajonea_final.sql` → 0

No hay ninguna columna, entidad, DTO, campo de formulario ni mención textual relacionada, en ninguna capa del proyecto (código, base física, ni diseño). No hay modelo de datos previo que ampliar — ni en `Comercio`, ni en `Dueno`, ni en `Empleado`, ni en ninguna de las 41 tablas del diccionario.

---

## Resumen ejecutivo

### Distribución por nivel (19 puntos)

| Nivel | Cantidad | Puntos |
|---|---|---|
| ❌ NO EXISTE | **8** | 3 (Extras), 4 (EmpleadoComercio), 6 (ConfiguracionTarifa), 7 (Reclamo), 8 (Soporte), 9 (NotaCredito total), 11 (cancelación/anulación de pedido completo — la anulación de ítem puntual dentro de este mismo punto es 🟡 modelo), 19 (carnet sanitario) |
| 🟡 SOLO MODELO DE DATOS | **6** | 1 (multi-comercio Dueño), 2 (direcciones múltiples), 5 (MercadoPago), 10 (NotaCredito parcial), 12 (cierre manual — columna física sin mapear), 13 (máquina de estados Pedido, 3/11 reales) |
| 🟡 SOLO BACKEND | **1** | 16 (redes sociales — backend completo, sin frontend posterior ni visibilidad pública) |
| 🟡 PARCIAL / mixto (no encaja limpio en los 4 niveles) | **4** | 14 (Historial — 1 de 3 tablas parcialmente implementada, 2 de 3 inexistentes), 15 (Notificaciones — 6/31 push, 0/31 con su Email esperado), 17 (testing solo 1 browser/viewport), 18 (validación de fecha de nacimiento asimétrica) |
| ✅ COMPLETO END-TO-END | **0** | — |

**Ningún punto de los 19 auditados está completo end-to-end.** El más avanzado es el Punto 16 (Redes sociales), con un backend maduro y correcto que simplemente nunca se conectó a una UI de gestión posterior ni al catálogo público — sería el gap más rápido de cerrar.

**Confirmación transversal importante:** las 41 tablas del diseño completo YA existen en `docs/bajonea_final.sql`. Ninguno de los 19 puntos está bloqueado por falta de diseño de base de datos — en todos los casos donde el nivel es ❌ o 🟡 modelo, el trabajo pendiente es 100% capa de aplicación (Entity JPA → Repository → Service → Controller → frontend), no modelado de datos.

### Los 5 gaps de mayor esfuerzo de implementación (complejidad técnica, no prioridad de negocio)

1. **MercadoPago — Marketplace con split de pagos (Punto 5, ligado a 9 y 10).** El de mayor complejidad técnica de todos: alta OAuth de cuenta por Dueño (`CuentaMercadoPago`, con refresh de tokens), creación de `preference` con `application_fee`, recepción y verificación de webhooks asíncronos, correlación por `external_reference`, idempotencia ante reintentos de MP, reembolsos totales y parciales vía API con reintentos (hasta 5, con notificación de fallo definitivo), y la integración de todo esto en el ciclo de vida completo del Pedido (Punto 13). Toca `PedidoService`, `CarritoService`, un nuevo módulo de pagos completo, y necesita jobs periódicos que hoy no existen en el proyecto (cero `@Scheduled`).

2. **EmpleadoComercio + selector de contexto multi-rol (Punto 4).** Ya señalado en `CLAUDE.md` §1bis como "cambio arquitectónico de mayor riesgo, toca JWT/autenticación". Requiere: nuevo valor de rol en `RolUsuario` con reglas de autorización propias en `SecurityConfig`, flujo de invitación por email con nuevo tipo de token, lógica de "reutilizar Usuario existente si el email ya existe" (con sus edge cases), selector de contexto Cliente↔Empleado y de comercio activo entre varios, y permisos delegados que deben aplicarse consistentemente en CRUD de productos, gestión de pedidos y edición de comercio sin tocar datos fiscales ni MercadoPago.

3. **Máquina de estados completa del Pedido + los 4 timers automáticos (Punto 13).** Pasar de 3 a 11 estados reales implica: nuevas transiciones con sus validaciones de rol/estado-origen, 4 jobs `@Scheduled` (expiración de pago a 30min, timeout de respuesta del comercio a 1h, timer de retiro de 90min durante suspensión, aviso a los 75min) que no existen en absoluto hoy en el proyecto, coordinación con reembolsos (Punto 9/10) en los estados terminales negativos, y actualización de todo el frontend de Cliente y Comercio para reflejar los 8 estados nuevos.

4. **Extras de producto — GrupoExtra/Extra (Punto 3).** Toca transversalmente Catálogo (nueva UI de configuración de grupos/extras en el alta de producto del Comercio), Carrito (selección de extras al agregar producto, recálculo de subtotal, reemplazo automático en grupos de `cantidad_maxima=1`), y Pedido (snapshot inmutable en `DetallePedidoExtra`, validación de grupos obligatorios al confirmar). El cálculo de totales hoy es puramente `precio × cantidad` en 2 lugares distintos (`CarritoService`, `PedidoService>`) que habría que reescribir con la lógica de extras sin romper la trazabilidad de montos existente.

5. **Trazabilidad completa de Historial (Punto 14) + reembolsos parciales por ítem (Punto 10).** Individualmente son de menor complejidad que los anteriores (son principalmente "agregar un INSERT en cada punto donde ya se muta un estado"), pero se agrupan acá porque su complejidad real está en la **cobertura exhaustiva**: hay que auditar cada mutación de `Usuario.estado`/`Comercio.estado`/`Pedido.estado` en todo el código (incluidas las que hoy faltan, como las 2 detectadas en `AuthService.propagarBloqueoAComercio`/`restaurarComercioSiCorresponde`) y no dejar ningún hueco, más crear `NotaCredito.java` desde cero con su relación N:1 hacia `Pago` y hacia múltiples `DetallePedido` — trabajo transversal que fácilmente se subestima por parecer "solo un insert más".
