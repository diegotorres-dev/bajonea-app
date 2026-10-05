# Auditoría (solo lectura) — NotaCredito y reembolso total

Fecha: 2026-09-25. Alcance: Fase 1 del tramo de reembolsos. No se modificó código, schema ni datos. Toda consulta a base fue `SHOW`/`DESCRIBE`/`SELECT` contra `bajonea_practicas3` (Flyway V22), y se contrastó con `bajonea_final` y `bajonea_test` (ambas en V22, con `nota_credito`, `pago` y `alerta_webhook_mp` vacías).

## 0. Resumen ejecutivo

1. **La premisa "NotaCredito es solo tabla física sin capa Java" está desactualizada.** Desde el tramo MercadoPago 01 (2026-09-17, `docs/DECISIONES.md`) existen `NotaCredito`, `NotaCreditoRepository`, `NotaCreditoService` y `EstadoNotaCredito`. Faltan Controller y cualquier llamador: nadie invoca `NotaCreditoService` (grep en todo `backend/src`).
2. **Bug latente ya presente:** la migración V2 (2026-08-28) soltó el `UNIQUE` de `nota_credito.pago_id` (N:1), pero `NotaCredito.java` sigue con `@OneToOne(... unique = true)` y `NotaCreditoRepository.findByPagoId` devuelve `Optional`. Con una segunda nota sobre el mismo pago, `obtenerPorPago` lanzaría `IncorrectResultSizeDataAccessException`. Hay que corregirlo en la Fase 2 sí o sí.
3. **`pago.id_transaccion_mp` NO alcanza para saber si un pago está aprobado**: la columna también se completa con pagos rechazados (3 filas reales lo confirman). La regla del diccionario (línea 1434, "se genera solo si `id_transaccion_mp` no es NULL") generaría reembolsos de pagos rechazados. Hay que usar `mp_estado = 'approved'` + `fecha_confirmacion`.
4. **`pedido.pago_estado` tampoco es fiable como criterio**: existe un pago aprobado (pago 20, pedido 34) cuyo pedido quedó `CANCELADO_POR_SISTEMA` con `pago_estado = RECHAZADO`.
5. **Hace falta decidir cambios de schema antes de la Fase 2** (sección 9, punto 1): `nota_credito` no tiene `motivo`, ni quién la originó, ni el último error de MercadoPago, ni el `payment_id` a reembolsar.
6. **Supuesto no verificado:** que MercadoPago reparta el reembolso "proporcionalmente" entre comercio y cuenta Bajonea Split. La documentación que tenemos en el repo y la página oficial de *Create refund* no lo dicen. Es el riesgo de negocio más importante de esta tarea, porque la regla cerrada es "Bajoneá no se queda con nada". Debe validarse en sandbox antes de darlo por bueno (sección 7).
7. **Los pagos reales aprobados están casi todos en una cuenta de producción** (dueño 185, `es_cuenta_prueba = 0`). Un reembolso ahí mueve plata real. El único pago aprobado en cuenta de prueba (dueño 259) es el del pedido 50.

## 1. Estado real de la entidad NotaCredito

| Capa | Estado | Archivo |
|---|---|---|
| Tabla | Existe desde `V1`; `V2` la modificó | `V1__baseline_bajonea_final.sql:299`, `V2__cancelacion_parcial_detalle_pedido.sql:24` |
| Entity | Existe | `entities/NotaCredito.java` |
| Enum | Existe: `PENDIENTE`, `PROCESADO`, `PENDIENTE_REINTENTO`, `FALLIDO` | `enums/EstadoNotaCredito.java` |
| Repository | Existe: `findByPagoId` (Optional), `findByEstado` | `repositories/NotaCreditoRepository.java` |
| Service | Existe, persistencia mínima: `crear(pago, monto)`, `obtenerPorPago`, `listarPorEstado`, `actualizarEstado(id, estado, refundId)` | `services/NotaCreditoService.java` |
| Controller / DTO | No existen | — |
| Llamadores | Ninguno | grep `notaCreditoService`/`NotaCreditoService` solo devuelve el propio archivo |
| `DetallePedido` ↔ `NotaCredito` | La columna `detalle_pedido.nota_credito_id` existe en base, pero `DetallePedido.java` no la mapea (grep `notaCredito` sin resultados). Pendiente documentado para la tarea 3 | `DECISIONES.md` ~línea 3688 |

Observaciones sobre el Service existente:
- `actualizarEstado` suma `intentos + 1` en **cada** cambio de estado. Sirve si se llama una vez por intento real contra MP; no sirve para transiciones administrativas.
- No hay lógica de tope de 5 intentos, ni de pasar a `FALLIDO`, ni de notificar T27: todo eso queda para la Fase 2.
- Todo el Service es `@Transactional` a nivel de clase (patrón general del proyecto). Ver riesgo de llamadas HTTP dentro de transacción en la sección 5.

## 2. Columnas reales de `nota_credito`

`SHOW CREATE TABLE bajonea_practicas3.nota_credito` (idéntica en las 3 bases):

```
id            int(11)  NOT NULL AUTO_INCREMENT  PK
pago_id       int(11)  NOT NULL                 FK -> pago.id (fk_nota_credito_pago), KEY idx_nota_credito_pago (NO único)
monto         decimal(10,2) NOT NULL
estado        enum('PENDIENTE','PROCESADO','PENDIENTE_REINTENTO','FALLIDO') NOT NULL DEFAULT 'PENDIENTE'   KEY idx_nota_credito_estado
intentos      int(11)  NOT NULL DEFAULT 0
refund_id_mp  varchar(50) NULL
fecha_emision datetime NOT NULL DEFAULT current_timestamp()
fecha_proceso datetime NULL
fecha_fallido datetime NULL
```

Contra lo que pide el objetivo (pedido, pago, monto, motivo, fecha, quién la generó):

| Dato | ¿Está? | Comentario |
|---|---|---|
| Pago asociado | Sí (`pago_id`) | |
| Pedido asociado | Indirecto | `nota_credito → pago → pedido` (`pago.pedido_id` es UNIQUE). Suficiente para consultar. |
| Monto | Sí | |
| Fecha | Sí (`fecha_emision`, `fecha_proceso`, `fecha_fallido`) | |
| **Motivo** | **No** | No hay columna. Hoy solo se deduce del estado final del pedido, y no sirve para pago tardío (pedido ya cancelado) ni para duplicados. |
| **Quién la generó** | **No** | Sin actor. Solo se deduce (parcialmente) de `historial_estado_pedido.actor_rol`. |
| **Último error de MP** | **No** | Con reintentos y "saldo insuficiente" hace falta guardar por qué falló para que el Admin pueda actuar. |
| **Payment id de MP a reembolsar** | **No** | Se asumiría `pago.id_transaccion_mp`, pero eso falla con pagos duplicados (sección 3). |
| Código visible `NC-{año}-{id}` | No hace falta columna | Se calcula: año de `fecha_emision` + `id` con padding. Recomiendo derivarlo en el DTO, sin tocar schema. |

Estado actual de los datos: 0 filas en las 3 bases.

## 3. Estado real de `Pago`

`SHOW CREATE TABLE pago` (`Pago.java` coincide 1 a 1 con la tabla):

```
id, pedido_id (UNIQUE uq_pago_pedido), mp_preferencia_id varchar(120), mp_init_point varchar(500),
mp_sandbox_init_point varchar(500), monto decimal(10,2) NOT NULL, metodo_pago varchar(30),
mp_estado varchar(30), id_transaccion_mp varchar(50), fecha_creacion, fecha_confirmacion
```

`pago` es 1:1 con `pedido` y guarda **un solo** `id_transaccion_mp`. Datos reales (`bajonea_practicas3`, 44 pagos):

| `mp_estado` | `id_transaccion_mp` no nulo | `fecha_confirmacion` no nula | `mp_preferencia_id` | filas |
|---|---|---|---|---|
| NULL | 0 | 0 | sí | 27 |
| approved | 1 | 1 | sí | 14 |
| rejected | **1** | 0 | sí | **3** |

Hallazgos:

1. **`id_transaccion_mp` se completa también en pagos rechazados** (`PagoService.registrarResultado` lo setea siempre, línea 66). Criterio confiable de "reembolsable": `mp_estado = 'approved' AND fecha_confirmacion IS NOT NULL AND id_transaccion_mp IS NOT NULL`.
2. **`pago.mp_estado` seguirá en `approved` después de reembolsar.** Cuando MP notifique el cambio a `refunded`, `aplicarResultadoPago` cae en la rama "no aprobado" y, como `yaHayPagoAprobado`, retorna sin tocar nada (`MercadoPagoPagoService:292-294`). No corrompe, pero significa que la elegibilidad no puede basarse solo en `mp_estado`: hay que restar lo ya reembolsado por notas de crédito.
3. **Pagos aprobados duplicados** (alertas 4 y 5, pedido 44): MP aprobó 3 pagos (`179016521721` registrado, más `180005281188` y `179016798885` solo en `alerta_webhook_mp`). El pago duplicado **no está en `pago.id_transaccion_mp`**, por lo que un reembolso construido como `nota_credito.pago_id → pago.id_transaccion_mp` nunca podría alcanzarlo. Se resuelve con una columna `mp_payment_id` en `nota_credito` (punto de decisión, sección 9).
4. **Pago tardío** (alerta 2, pago 20 / pedido 34): pago aprobado con pedido `CANCELADO_POR_SISTEMA` y `pedido.pago_estado = RECHAZADO`. Prueba de que `pedido.pago_estado` no sirve como criterio.
5. **4 pedidos "legacy" sin fila en `pago`** (ids 1, 3, 5, 8: `EXPIRADO`/`CANCELADO`/`RECHAZADO`/`ANULADO` con `pago_estado = PAGADO`, de la época del pago simulado). No son reembolsables por MP: la Fase 2 debe rechazarlos limpiamente ("sin pago de MercadoPago asociado").

Pagos aprobados hoy en negativo terminal (candidatos reales), `bajonea_practicas3`:

| Estado del pedido | Pagos aprobados | Monto |
|---|---|---|
| EXPIRADO | 8 (pedidos 30, 31, 35, 36, 37, 44, 45, 51) | $180.800 |
| ANULADO | 1 (pedido 42) | $28.500 |
| CANCELADO_POR_SISTEMA (pago tardío) | 1 (pedido 34) | $3.600 |

Casi todos son de la cuenta de producción (dueño 185). Ver sección 4.

## 4. Cómo se obtiene el `access_token` del vendedor

- Cadena real: `Pedido → Comercio → Dueno → CuentaMercadoPago`, ya implementada en `MercadoPagoPagoService.obtenerCuentaDelComercio` (líneas 370-378) vía `CuentaMercadoPagoService.obtenerActivaPorDueno` → `CuentaMercadoPagoRepository.findByDuenoIdAndActivaTrue`.
- `CuentaMercadoPago.accessToken`/`refreshToken` se cifran/descifran de forma transparente con `MercadoPagoTokenConverter` (`@Convert`). Llegan en claro a quien llame a `getAccessToken()`.
- `MercadoPagoConfig` **no** guarda ningún token: solo `clientId`, `clientSecret`, `redirectUri`, `webhookSecret` y el flag `testToken`. No existe un token único de la app. Consistente con la premisa del prompt.

Riesgos que el reembolso hereda de este diseño:

1. **Desvincular la cuenta bloquea los reembolsos.** `obtenerActivaPorDueno` filtra `activa = true`; `desvincular` la deja en `false`. Un comercio que se desvincula con reembolsos pendientes (o con reintentos en curso) haría fallar el reembolso con un `409` engañoso. Decisión pendiente: ¿el reembolso puede usar una cuenta inactiva (token todavía válido), o se exige `activa` y se deja `PENDIENTE_REINTENTO`/`FALLIDO`?
2. **No existe refresh de tokens.** `grant_type` solo se usa en el intercambio `authorization_code`; `tokenExpira` se guarda pero nadie lo lee (grep). Hoy los `token_expira` reales están en 2027-03, pero un reembolso con token vencido daría `401` de MP y necesita un camino de error propio. El refresh ya figura como pendiente en `CLAUDE.md` §6.
3. **Dos tipos de cuenta conviven en la misma base.** Dueño 259: `es_cuenta_prueba = 1` (sandbox). Dueño 185: `es_cuenta_prueba = 0` (producción, `APP_USR-`, dinero real). Los pagos reembolsables de la sección 3 son casi todos del 185.
4. **Supuesto a verificar:** que el reembolso deba hacerse con el token del vendedor (el pago se cobró en su cuenta con `marketplace_fee`). La doc local menciona que el reembolso puede pedirlo "collector, operator, owner of the marketplace" (`mercadopago_documentacion_completa.md` ~línea 69047), lo cual no es concluyente sobre cuál token corresponde con `marketplace_fee`. Validar en sandbox.

## 5. Patrón de los servicios que ya hablan con MercadoPago

`MercadoPagoPagoService` (517 líneas), `MercadoPagoOAuthService`. Patrón observado, a replicar:

- **Cliente HTTP:** `RestClient` propio con `SimpleClientHttpRequestFactory` y timeouts de 5000 ms de conexión y lectura (`crearRestClient`).
- **Autenticación:** `.header("Authorization", "Bearer " + accessToken)`; `contentType(APPLICATION_JSON)` en POST; DTOs internos como `record` con `@JsonProperty`.
- **Errores:** `catch (RestClientResponseException ex)` → `log.error(... ex.getStatusCode(), ex.getResponseBodyAsString())` → `ConflictoDeNegocioException` con `ex.getStatusText()`. Variante estricta `buscarMejorPagoOFallar` usa `catch (RestClientException)` → `ServicioNoDisponibleException` (503). Loggers `slf4j` por clase.
- **Idempotencia:** ninguna llamada usa `X-Idempotency-Key` hoy (el header no aparece en el código Java). Para reembolsos **es requisito de MP** (la doc de *Create refund* lo lista como requerido). La idempotencia actual del webhook es propia (locks + `existsBy...` en alertas), no la de MP.
- **Concurrencia:** `PedidoService.bloquearParaActualizar` (`SELECT ... FOR UPDATE` vía `entityManager.refresh(..., PESSIMISTIC_WRITE)`); patrón a reutilizar para serializar reembolsos del mismo pedido.
- **Riesgo estructural:** los Services son `@Transactional` a nivel de clase y `MercadoPagoPagoService` hace llamadas HTTP (hasta 5 s) dentro de esa transacción, con el pedido bloqueado. Para el reembolso conviene **no** repetirlo: persistir la nota en una transacción corta, llamar a MP fuera de transacción y registrar el resultado en otra. Como el self-invocation de Spring ignora `@Transactional`, esto pide un componente separado (o `TransactionTemplate`).
- **Jobs:** `PedidoSchedulerService` con `@Scheduled(fixedDelay = ...)`, `@EnableScheduling` ya activo. Sirve de molde para el job de reintentos.
- **Tamaño:** `MercadoPagoPagoService` ya es grande; el cliente de reembolso debería vivir en una clase nueva (`MercadoPagoReembolsoService` o similar), no ampliar esa.

## 6. `alerta_webhook_mp`: ¿reusarla para reembolsos fallidos?

Estructura real (`AlertaWebhookMp.java`, migraciones V15/V17/V18/V22): `id`, `pedido_id` (nullable), `mp_payment_id` (NOT NULL), `mp_external_reference`, `monto_esperado`, `monto_capturado`, `motivo` (enum: `EXTERNAL_REFERENCE_MISMATCH`, `PAGO_APROBADO_SOBRE_PEDIDO_CANCELADO`, `PAGO_APROBADO_DUPLICADO`, `SPLIT_NO_APLICADO`), `fecha_creacion`, `ip_origen`. Sin Controller. Datos reales: 4 filas en `practicas3`. Es un log append-only, idempotente por (pedido, pago, motivo), pensado para lo que llega por webhook.

**Recomendación: no usarla como registro del fallo de reembolso.** Sí usarla (ya existe) como *disparador* de dos casos.

| | A favor de reusarla | En contra |
|---|---|---|
| Fuente única de "cosas a revisar" para la futura pantalla de Admin | Un solo listado | La pantalla igual necesita leer `nota_credito` para reembolsos pendientes/fallidos |
| Costo | Ya existe | Requiere migración (ampliar el `ENUM motivo`, como V17/V18/V22) |
| Semántica | — | Es "alerta de **webhook**": incluye `ip_origen`, sin significado en un job interno; `mp_payment_id` es NOT NULL |
| Estado del problema | — | La alerta es un evento puntual, el reembolso fallido tiene ciclo de vida (intentos, reintento, fallido definitivo). Eso ya lo modela `nota_credito.estado/intentos/fecha_fallido` |
| Notificación al Admin | — | Ya existe `TipoNotificacion.REEMBOLSO_FALLIDO_DEFINITIVO` (T27, Push + Email al Administrador, diccionario línea 454) diseñada exactamente para esto |

Propuesta: `nota_credito` es la fuente de verdad del fallo; T27 avisa al Admin al pasar a `FALLIDO`; la pantalla futura de Admin unifica ambas fuentes. Las alertas `PAGO_APROBADO_SOBRE_PEDIDO_CANCELADO` y `PAGO_APROBADO_DUPLICADO` quedan como *origen* de una nota (el comentario del propio código ya las llama "punto de enganche del reembolso futuro", `AlertaWebhookMpService:61`). Nota: T27 sería la primera notificación dirigida a un Administrador (`AD36` de la Fase 15 confirmó que hoy ninguna lo es); hay que definir a cuál/cuáles usuarios Admin va (`crear` recibe un `usuarioId`).

## 7. Sobre la API de reembolso (lo verificado y lo que no)

Verificado contra la documentación oficial (página *Create refund* y documentación local `docs/mercadopago_documentacion_completa.md`, líneas ~23670-23684):

- `POST /v1/payments/{id}/refunds`; total = body vacío; parcial = campo `amount`.
- `X-Idempotency-Key` requerido (en la doc de Orders el máximo es 128 caracteres y reusar una clave da `409`; asumo el mismo criterio acá, a confirmar).
- Plazo: 180 días desde la aprobación. Requiere saldo suficiente en la cuenta que reembolsa, si no la operación se rechaza.
- Respuesta: `id`, `payment_id`, `amount`, `status`, `date_created`. Errores documentados: `400` (estado inválido / monto), `401` (token), `404` (pago no encontrado / demasiado viejo).

**NO verificado** (la doc consultada explícitamente no lo cubre): el reparto automático y proporcional del monto entre comercio y cuenta Bajonea Split cuando el cobro llevó `marketplace_fee`. La consecuencia depende de eso:
- Si MP devuelve la comisión desde la cuenta marketplace, se cumple "Bajoneá no se queda con nada" y el comercio recupera todo.
- Si no, el comercio termina devolviendo el 100% pagado habiendo recibido solo `monto − fee`, y Bajoneá conserva la comisión, contra la regla cerrada.

Antes de dar por buena la implementación hay que **medir un reembolso total real en sandbox** (saldos de ambas cuentas antes/después). Candidato natural: pago 34 del pedido 50 (cuenta de prueba, dueño 259, $10.200, `EN_PREPARACION`), o uno nuevo generado para la prueba. Los pagos de la cuenta 185 son de producción y no deben usarse para experimentar.

## 8. Testing existente relacionado

- Postman (`postman/`) y Playwright (`testing/playwright/`): **cero referencias** a `NotaCredito`, `reembolso` o `refund` (grep en `postman`, `testing`, `frontend`). No hay carpetas ni specs bloqueados por este motivo.
- Único rastro en frontend: `frontend/js/pedidos.js:110` muestra "El comercio no respondió a tiempo. El reembolso está en proceso." Y `PedidoService:534` notifica lo mismo. **La UI ya le promete al Cliente un reembolso que hoy no ocurre** (sección 9, punto 5).
- **Obstáculo para testear:** el endpoint de test `PUT /api/v1/test/pedidos/{id}/pago-aprobado` (`TestController:52`) llama a `pedidoService.confirmarPagoAprobado` directo y **no crea ninguna fila en `pago`** ni `id_transaccion_mp`. Sin un pago real ni un stub no se puede ejercitar el reembolso ni en Newman ni en Playwright. Ver propuesta de diseño (cliente de MP detrás de una interfaz con implementación stub en perfil `test`).
- Las bases `bajonea_test`/`bajonea_final` tienen 0 pagos: el ciclo real solo se puede probar en `bajonea_practicas3`.

## 9. Inconsistencias y gaps (no se corrigió nada)

1. **Entity vs. tabla:** `@OneToOne(unique = true)` en `NotaCredito.pago` contradice la tabla N:1 desde V2; `findByPagoId` con `Optional` rompe con más de una nota por pago. (`ddl-auto=validate` no valida `UNIQUE`, por eso arranca bien.)
2. **Diccionario, `NotaCredito` línea 1434:** "solo si `Pago.id_transaccion_mp` no es NULL" es incorrecta en la práctica (se completa con rechazados). Idem la línea 1579 sobre `CANCELADO_POR_SISTEMA`.
3. **Diccionario dice** "el job periódico reintenta hasta 5 intentos" y "T27 al Administrador" (diseño). Nada de eso existe: sin job de reintentos, sin notificación T27 emitida.
4. **Diccionario / `DECISIONES.md`:** el caso "pago tardío" prevé "generar el reembolso inmediatamente"; hoy solo deja alerta. Sin resolver y sin dueño asignado.
5. **Copy de UI/notificación prometen un reembolso** que hoy no se dispara (`pedidos.js:110`, `PedidoService:534`).
6. **5 sitios con `// TODO: genera reembolso, pendiente de NotaCredito`** en `PedidoService`: `rechazarPedido` (285), `cancelarPedido` (363), `anularPedido` (384), `cancelarPedidosPorSuspensionComercio` (459), `expirarPedidosSinRespuestaComercio` (531). Solo dos corresponden a los botones de la tarea 2; los otros tres (rechazo, suspensión, expiración por job) también necesitan el mecanismo. Hay que decidir en qué tarea se cablea cada uno.
7. **`pago.mp_estado` no refleja el reembolso** (queda `approved`); `Pago.monto = Pedido.total` no se verifica contra MP (ya documentado como pendiente).
8. **Cabecera `PedidoService` (línea 67-68):** "sin `NotaCredito` en este tramo" — vigente hasta que se implemente.
9. **CLAUDE.md §5** no lista `NotaCredito` entre las entidades implementadas, aunque existe desde 2026-09-17.
10. **`EstadoPedido` en base** conserva el valor legacy `PENDIENTE` en el ENUM (V6 lo dejó a propósito); irrelevante para esta tarea, solo evitar usarlo como criterio.

## 10. Propuesta de diseño técnico para la Fase 2

### 10.0 Decisiones que necesito de Diego ANTES de arrancar (la primera es de schema)

**Decisión 1 — Schema (`V23`), pedir aprobación:**

| Columna nueva en `nota_credito` | Para qué | Mi recomendación |
|---|---|---|
| `motivo` (`ENUM`: p. ej. `RECHAZO_COMERCIO`, `CANCELACION_CLIENTE`, `ANULACION_COMERCIO`, `EXPIRACION_SIN_RESPUESTA`, `SUSPENSION_COMERCIO`, `PAGO_TARDIO`, `PAGO_DUPLICADO`, `MANUAL_ADMIN`) | Trazabilidad y reporting; único modo de distinguir pago tardío/duplicado | **Sí** |
| `ultimo_error` `VARCHAR(255) NULL` | Guardar el último error de MP (saldo insuficiente, token vencido) para reintentos y para el Admin | **Sí** |
| `mp_payment_id` `VARCHAR(50) NULL` | Payment id a reembolsar cuando no coincide con `pago.id_transaccion_mp` (duplicados) | Recomendado; si se prefiere dejar los duplicados para más adelante, se agrega entonces |
| Actor (`generada_por`/`usuario_id`) | Quién la originó | **No hace falta**: `historial_estado_pedido.actor_rol/actor_usuario_id` ya lo registra para los casos de pedido, y `motivo` cubre los automáticos |
| Código `NC-{año}-{id}` | — | **No**: se deriva |

Alternativa sin cambios de schema: derivar el motivo del estado del pedido y no persistir errores. Funciona para el reembolso "feliz" pero deja sin cubrir pago tardío/duplicado y obliga a buscar el error en logs.

**Decisión 2 — Alcance del cableado en Fase 2:** ¿la Fase 2 solo construye el mecanismo (recomendado, según el enunciado) o también reemplaza los 5 TODO de `PedidoService`? Propongo mecanismo solamente, más la corrección de los 3 sitios que no son botones (rechazo, suspensión, expiración) en la tarea 2, para no dispersar el riesgo.

**Decisión 3 — Backlog de pedidos ya reembolsables:** hay 10 pagos aprobados en negativo terminal (sección 3), casi todos en la cuenta de producción 185. Recomiendo **no** reembolsarlos automáticamente ni al desplegar: exponer un método manual/administrativo y decidir uno por uno con Diego.

**Decisión 4 — Cuenta desvinculada:** ¿el reembolso puede usar una cuenta con `activa = false`? Recomiendo permitirlo (token todavía válido) y fallar con error explícito si no lo está.

**Decisión 5 — Copy de UI:** mientras no haya reembolso real, ¿se ajusta el texto "el reembolso está en proceso"? Lo pongo como recordatorio, no bloquea.

### 10.1 Piezas nuevas / modificadas (asumiendo Decisión 1 aprobada)

| Pieza | Cambio |
|---|---|
| `V23__nota_credito_motivo_error_payment.sql` | Agrega las columnas aprobadas. Nada de datos que migrar (tabla vacía). |
| `NotaCredito` (Entity) | `@OneToOne` → `@ManyToOne`; campos nuevos; sin comentarios (regla §4.8) |
| `enums/MotivoNotaCredito` | Nuevo, según Decisión 1 |
| `NotaCreditoRepository` | `findByPagoId` → `List<NotaCredito>`; query de suma de montos no `FALLIDO` por pago; `findByEstadoAndIntentosLessThan` para el job |
| `MercadoPagoReembolsoService` (nuevo) | Cliente HTTP puro: `POST /v1/payments/{id}/refunds` con `Authorization` del vendedor y `X-Idempotency-Key`; devuelve un resultado tipado (`APROBADO(refundId)`, `RECHAZO_DEFINITIVO`, `REINTENTABLE`) mapeando 400/401/404/5xx/timeouts. Mismo `RestClient` y timeouts. Reconciliación antes de reintentar tras timeout: `GET /v1/payments/{id}/refunds`, para no duplicar |
| Interfaz `ReembolsoGateway` + stub en `@Profile("test")` | Permite Newman/Playwright sin pegarle a MP; la implementación real es la de arriba |
| `ReembolsoService` (nuevo, orquestador) | `reembolsarTotal(pedidoId, motivo)`: (1) tx corta: bloquear pedido (`bloquearParaActualizar`), validar elegibilidad, crear nota `PENDIENTE`; (2) llamada a MP fuera de transacción con clave `nc-{id}-{intento}`; (3) tx corta: `PROCESADO` + `refundIdMp`, o `PENDIENTE_REINTENTO` + `ultimoError`; al 5.º fallo → `FALLIDO` + `fecha_fallido` + notificación T27 |
| Elegibilidad | Pago existe; `mp_estado = 'approved'` y `fecha_confirmacion` y `id_transaccion_mp` no nulos; ≤ 180 días; cuenta del vendedor disponible (Decisión 4); `SUM(notas no FALLIDO) + monto ≤ pago.monto` (evita dobles reembolsos con el UNIQUE ya soltado); si no hay pago (legacy) → error claro |
| `NotaCreditoService` | Corregir la semántica de `intentos` (contar solo intentos reales contra MP) y agregar el tope de 5; agregar `codigo` derivado |
| Job de reintentos | Nuevo `@Scheduled` en `PedidoSchedulerService` (o clase hermana), reintenta `PENDIENTE_REINTENTO` |
| DTO `NotaCreditoResponseDTO` | Con `codigo` (`NC-2026-00001`); **sin Controller** en esta fase salvo que se decida (los endpoints de Admin vienen después) |
| `PedidoService` | Sin cambios en esta fase (Decisión 2) |

### 10.2 Plan de verificación de la Fase 2 (evidencia real, regla §4.9)

1. `mvnw compile` (solo sintaxis).
2. Con el stub (`test`): estados `PENDIENTE → PROCESADO`, `PENDIENTE → PENDIENTE_REINTENTO → … → FALLIDO` (5 intentos), idempotencia (segunda invocación no crea segunda nota), pago rechazado/legacy/sin `approved` rechazados, suma nunca > `pago.monto`.
3. **Sandbox real** con la cuenta de prueba (dueño 259): un reembolso total real, `SELECT` de la nota (`refund_id_mp`, `PROCESADO`) y comparación de saldos de ambas cuentas para validar el reparto de la comisión (sección 7). Sin esto no se cierra la fase.
4. Caso "saldo insuficiente" del comercio, si es reproducible en sandbox; si no, documentarlo como diferido.
5. Nunca ejecutar reembolsos sobre la cuenta de producción (dueño 185) como prueba.
6. Al cerrar: `docs/DECISIONES.md` (entrada propia), `docs/diccionario-de-datos.md` (columnas nuevas, corrección de las líneas 1434/1579, versión), `CLAUDE.md` (§5 y tabla de fases), skill de generación de capas si se estableció un patrón nuevo (llamada externa fuera de transacción).

## 11. Parada

No se implementó nada. Espero el OK explícito de Diego y las respuestas a las Decisiones 1 a 4 (la 1 es la puerta de entrada porque toca el schema) antes de arrancar la Fase 2.
