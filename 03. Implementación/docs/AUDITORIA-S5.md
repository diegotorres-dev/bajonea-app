# Auditoría previa de S5 (Reclamos) — solo lectura

**Fecha:** 2026-11-04. Paso 0 del tramo S5 (Fase 5). No se creó ninguna tabla, migración ni pantalla de Reclamos. Todo lo de abajo sale de leer el código y de consultar el esquema real de `bajonea_test`. Numeración reservada para S5 (sin usar): migración `V50`, carpeta de Newman `89`, spec de Playwright `94`, escenario de estrés `23`, diccionario de datos `v1.35`.

Decisiones ya tomadas por Diego y usadas como contexto (no se discuten): el reclamo lo hace el Cliente sobre un pedido; uno por pedido; motivo entre seis; mensaje de hasta 1000 caracteres; hasta 3 fotos opcionales de 5 MB que solo ve el Administrador (sub-entrega al final de S5); plazo de 7 días corridos que no se pausa por una suspensión; el Administrador resuelve con reembolso total, reembolso parcial o rechazo con motivo de 10 a 500 caracteres; el reembolso genera una nota de crédito con motivo `RECLAMO`; si el reembolso en Mercado Pago falla el reclamo queda "aprobado, reembolso en proceso" y se reintenta a mano; el Dueño recibe un aviso `RECLAMO_REEMBOLSO_DUENO`; nada se borra.

## 1. Lo que condiciona el diseño (resumen)

1. **La tabla `reclamo` existe desde el baseline, vacía y sin una línea de código que la use** (no hay entidad, repositorio, servicio, controlador, DTO, pantalla ni test). Lo único vivo son tres valores de enum que ya están en la base y en Java: `motivo_nota_credito = RECLAMO` y los avisos `NUEVO_RECLAMO` (audiencia Administrador), `RECLAMO_APROBADO` y `RECLAMO_RECHAZADO` (Cliente). Se puede ampliar sin migrar datos.
2. **El reembolso es hoy total en todos los lugares:** `MercadoPagoReembolsoClient.solicitarReembolsoTotal` manda el cuerpo vacío y `ReembolsoService.generarNotaYReembolsarTotal` crea la nota por `pago.getMonto()`. Para un parcial hay que agregar un monto al cliente HTTP, al orquestador y al reintento; el modelo de datos (`nota_credito` N:1 con `pago`, sin `UNIQUE`) ya lo soporta. Un detalle que importa: `NotaCreditoService.otrasNotasCubrenElPago` ya compara contra el monto completo (`>=`), así que sirve para saldos parciales sin tocarlo.
3. **El reembolso lo pide la cuenta del Dueño, con el token del Dueño.** Mercado Pago exige saldo disponible en esa cuenta; con un parcial de un reclamo (días después de la venta) el riesgo de "sin saldo" es mayor que en los reembolsos inmediatos de hoy. El camino de falla ya existe (`FALLIDO` / `PENDIENTE_REVISION_MANUAL` + reintento del Administrador) y es el que el diseño de S5 usa.
4. **El reparto del dinero entre Dueño y plataforma en un parcial no está verificado** (ver `docs/SPIKE-REEMBOLSO-PARCIAL.md`): la documentación dice que se descuenta "proporcionalmente" de la cuenta del vendedor y de la del marketplace; no dice nada más. De eso depende el texto del aviso `RECLAMO_REEMBOLSO_DUENO` y si hay que devolverle algo de la comisión a la plataforma.
5. **No hay una fecha de "recibió el pedido" para todos los casos.** `pedido.fecha_entrega` existe y se completa en todo pedido `ENTREGADO` (cualquier fuente: Cliente, comercio o sistema; delivery y retiro), pero no en `NO_RETIRADO` (y un `NO_RETIRADO` no tiene sentido reclamarlo). Es la fecha natural para el plazo de 7 días.
6. **El historial de estados del pedido no tiene dónde guardar el reclamo** y no hace falta: el pedido no cambia de estado. El rastro del reclamo debe vivir en la propia fila (`administrador_id`, `fecha_resolucion`, motivo) y en la nota de crédito.
7. **Las fotos del reclamo:** el patrón a copiar es el de los documentos del comercio (binario en una tabla aparte, entrega por la API con sesión, firma de bytes, nunca por URL pública). Cloudinary no sirve: sus URL son públicas.

## 2. Reclamos hoy

| Elemento | Existe | Detalle |
|---|---|---|
| Tabla `reclamo` | Sí, vacía | `id`, `pedido_id` (NOT NULL, `UNIQUE uq_reclamo_pedido`, FK a `pedido`), `descripcion` (`text`), `fecha_creacion`, `estado` (`PENDIENTE`/`APROBADO`/`RECHAZADO`), `administrador_id` (nullable, FK), `nota_resolucion` (`varchar(500)`), `fecha_resolucion`; índices `idx_reclamo_estado` y por administrador. 0 filas en la base de test. |
| Entidad, repositorio, servicios, controladores, DTOs | No | Ninguna clase menciona `reclamo` salvo los enums. |
| Pantallas, tests, Newman, Playwright | No | — |
| Enums ya existentes | Sí | `MotivoNotaCredito.RECLAMO` (en el ENUM físico de `nota_credito.motivo` desde `V44`); `TipoNotificacion.NUEVO_RECLAMO` (Administrador), `RECLAMO_APROBADO` y `RECLAMO_RECHAZADO` (Cliente), todos en el ENUM físico de `notificacion.tipo`. |
| Texto que ya menciona el reclamo | Sí | Aviso de autoconfirmación (`PedidoService`, ~línea 1006): "Si no lo recibiste, podés iniciar un reclamo o contactar al comercio." Hay que revisarlo cuando exista la función. |

**¿La estructura actual permite el plan?** Casi. El `UNIQUE` por pedido y la FK al Administrador sirven tal cual. Hay que, en `V50`: cambiar `estado` (hoy no distingue "aprobado, reembolso en proceso"), agregar el motivo (6 valores), el tipo de resolución (total, parcial, rechazo), el monto aprobado, la fecha límite o de creación según el plazo, `descripcion` a `varchar(1000)` o conservar `text` con la validación en el DTO, y crear `reclamo_foto` (metadatos) y `reclamo_foto_archivo` (binario) siguiendo `documento_comercio` / `documento_comercio_archivo`. `nota_resolucion` de 500 caracteres cubre el motivo de rechazo de 10 a 500. Falta también el valor `RECLAMO_REEMBOLSO_DUENO` en `notificacion.tipo` (y su audiencia `DUENO` en `AudienciaNotificacion`), y una forma de ligar la nota de crédito al reclamo (columna `reclamo_id` en `nota_credito` o `nota_credito_id` en `reclamo`).

## 3. Pedido

| Pregunta | Respuesta del código |
|---|---|
| Estados | Java: `PENDIENTE_PAGO`, `PENDIENTE_CONFIRMACION_COMERCIO`, `EN_PREPARACION`, `EN_CAMINO`, `LISTO_PARA_RETIRAR`, `ENTREGADO`, `NO_RETIRADO`, `RECHAZADO`, `CANCELADO`, `ANULADO`, `CANCELADO_POR_SISTEMA`, `EXPIRADO`. El ENUM físico conserva además el literal viejo `PENDIENTE`. |
| Fecha para el plazo de 7 días | `pedido.fecha_entrega` (`datetime`), que escribe un solo método (`PedidoService.marcarEntregado`) en las tres vías que dejan un pedido en `ENTREGADO`: el Cliente, el comercio y el sistema (autoconfirmación a los 90 minutos); `fuente_entrega` dice cuál. Sirve para delivery y para retiro. No existe para `NO_RETIRADO` ni para ningún otro estado. Los pedidos entregados antes de que existiera el campo podrían tenerlo nulo (hay que revisar en `practicas3`). |
| Pedidos sobre los que tiene sentido reclamar | Solo `ENTREGADO`. `RECHAZADO`, `CANCELADO`, `ANULADO`, `CANCELADO_POR_SISTEMA` y `EXPIRADO` ya tuvieron reembolso total automático (nota de crédito creada en la misma transacción); `NO_RETIRADO` es un cierre por no presentación sin reembolso y el comercio se queda el pago a propósito. Recomendación: permitir reclamo solo en `ENTREGADO` y con pago aprobado y confirmado. |
| Un pedido que ya tuvo reembolso | Un `ENTREGADO` no tiene notas de crédito hoy. Si más adelante un caso permitiera reclamar y también reembolsar por otra vía, el tope es el saldo `pago.monto - suma de notas vivas`. |
| Detalle del pedido del Cliente | `frontend/pedido-detalle.html` + `frontend/js/pedidos.js` (758 líneas); ahí iría el botón "Tuve un problema con este pedido" y el estado del reclamo. |
| Detalle del Dueño y del Empleado | `frontend/comercio-pedido-detalle.html` + `frontend/js/comercio.js`; el Dueño ve el reclamo de solo lectura (y el aviso `RECLAMO_REEMBOLSO_DUENO`). El Empleado recibe el DTO reducido (`PedidoEmpleadoResponseDTO`); conviene no mostrarle nada del reclamo. |
| Exposición del reembolso en las respuestas | `PedidoService.ultimasNotasCredito` toma la nota de mayor `id` de cada pedido y la expone como `reembolsoEstado` / `reembolsoMonto` / `reembolsoMotivo`; la pantalla solo la muestra en `RECHAZADO`, `CANCELADO`, `ANULADO`, `CANCELADO_POR_SISTEMA` y `EXPIRADO` (`ESTADOS_CON_REEMBOLSO` en `pedidos.js`). Un reclamo sobre un `ENTREGADO` devolvería esos campos con la nota `RECLAMO`: no se mostrarían, pero viajarían. Hay que decidir si el reclamo tiene su propio bloque en la respuesta del pedido. |

## 4. Reembolsos

| Pieza | Hoy | Para un reembolso parcial |
|---|---|---|
| `MercadoPagoReembolsoClient.solicitarReembolsoTotal(paymentId, accessToken, idempotencyKey)` | `POST /v1/payments/{id}/refunds` con cuerpo `{}`, `Authorization: Bearer <token del Dueño>`, `X-Idempotency-Key`, timeouts de 5 s, nunca lanza; acepta `approved` e `in_process`; no lee el cuerpo de error más allá de 300 caracteres. | Agregar un método con `{"amount": monto}` (misma firma más el monto). La documentación indica que el monto va en el cuerpo y que sin cuerpo el reembolso es total. |
| `ReembolsoService.generarNotaYReembolsarTotal` | Crea la nota por `pago.getMonto()` dentro de la transacción del cambio de estado (con el pedido bloqueado), difiere el llamado a Mercado Pago a después del commit y registra el resultado en una transacción corta. Si ya hay notas que cubren el pago completo, no duplica. Cuenta desvinculada: nota `PENDIENTE_REVISION_MANUAL`. | Un método nuevo `generarNotaYReembolsarParcial(pedido, monto, motivo)` con el mismo esqueleto, validando `monto > 0` y `monto <= saldo`, donde el saldo es `pago.monto − montoCubierto`. Comparte `prepararIntento`, `solicitarYRegistrar` (hoy el monto sale del registro `IntentoReembolso`, que ya lleva `monto`) y el reintento. |
| `NotaCreditoService` | `crear`, `crearPendienteRevisionManual`, `montoCubierto` (suma las notas `PENDIENTE`, `PROCESADO`, `PENDIENTE_REINTENTO` y `PENDIENTE_REVISION_MANUAL`; las `FALLIDO` no cubren), `otrasNotasCubrenElPago` (lectura bloqueante), `registrarReembolsoExitoso/Fallido`. | Sirve tal cual para N notas por pago. |
| `nota_credito` | `pago_id` (sin `UNIQUE`; 1 pago : N notas), `monto`, `motivo` (incluye `RECLAMO`), `estado`, `intentos`, `refund_id_mp`, `mp_payment_id`, `ultimo_error`, `fecha_*`. | Soporta parciales sucesivos. Falta ligarla al reclamo. |
| Reintento | `ReembolsoService.reintentarNotaCredito(notaId)` (Administrador, `admin-reembolsos.html`): clave de idempotencia `nc-{id}-{intento}`; exige estado `PENDIENTE_REVISION_MANUAL` o `FALLIDO`, pago reembolsable, que sumar esta nota no pase del monto del pago y cuenta del Dueño vinculada; el monto que reintenta es `nota.monto`. | Ya reintenta el monto de la nota, no el total del pago, salvo que el cliente HTTP lo ignore: hay que pasarle el monto. |
| Pago reembolsable | `mp_estado = 'approved'`, `fecha_confirmacion` y `id_transaccion_mp` no nulos. | Igual. El plazo de Mercado Pago es de 180 días desde la aprobación: con 7 días de reclamo no importa. |
| Doble nota | La evita el bloqueo del pedido (y del pago), más la verificación posterior a insertar la nota. | El reclamo toma el pedido como cualquier transición; con un `ENTREGADO` nadie más escribe notas, salvo otro reclamo (imposible por el `UNIQUE`). |

## 5. Quién paga qué hoy

| Concepto | Valor |
|---|---|
| Lo que paga el Cliente | `pedido.total = subtotal + cargo_servicio_cliente`. La preferencia lleva los productos y un renglón "Cargo por servicio Bajoneá". `pago.monto` es ese total. |
| Comisión de la plataforma | `marketplace_fee = cargo_servicio_cliente + cargo_servicio_comercio` (`MercadoPagoPagoService`, ~línea 527); Mercado Pago la descuenta del monto del vendedor, después de su propia comisión. |
| Lo que cobra el Dueño | `total − marketplace_fee = subtotal − cargo_servicio_comercio`, menos la comisión de Mercado Pago. |
| Reembolso total hoy | Se pide con el token del Dueño por el monto completo del pago; según la documentación el reembolso se descuenta de las dos cuentas en forma proporcional. No hay verificación propia de cuánto se descontó a cada uno. |
| Reembolso parcial | Sin verificar. Hipótesis de la documentación: proporcional entre vendedor y marketplace. Hay que probarlo en el sandbox para saber cuánto absorbe el Dueño, si la plataforma devuelve su parte de la comisión, y qué saldo queda. Es la base del texto de `RECLAMO_REEMBOLSO_DUENO`. |

## 6. Fotos

| Tema | Hoy |
|---|---|
| Cloudinary | Fotos de producto y de perfil del comercio; URL pública; firma en el servidor por carpeta; el backend no recibe el binario. No sirve para evidencia que solo ve el Administrador. |
| Documentos del comercio (Fase 4) | Binario en `documento_comercio_archivo` (`longblob`, tabla aparte para que ningún listado lo lea), metadatos en `documento_comercio`; subida `multipart` validada por firma de bytes (`util/FirmaArchivo`; PDF, JPG, PNG, WebP); tope de negocio de 8 MB, tope duro de Spring de 16 MB por archivo y 17 MB por pedido, `server.tomcat.max-swallow-size=32MB`; entrega por la API con `fetch` y `Authorization` a un blob, con `Content-Disposition: inline`, `nosniff` y `no-store`; el Empleado recibe `403`. |
| `max_allowed_packet` | El servidor de la base debe tener al menos 16 MB (en XAMPP viene en 1 MB; `docs/LISTA-DE-DESPLIEGUE.md`). Con fotos de 5 MB alcanza con 8 MB, pero conviene exigir el mismo mínimo. |
| Borrado | Los documentos rechazados se conservan y cuentan para el tope; el Dueño solo borra un `PENDIENTE` propio. "Nada se borra" en reclamos es coherente con eso. |
| Qué reutilizar | Casi todo: el servicio de validación y entrega de `DocumentoComercioService`, el visor de `js/documentos-comun.js` y el patrón de cupos. Hay que decidir si el Cliente puede ver o borrar sus propias fotos antes de enviar el reclamo (recomendación: las puede quitar mientras arma el reclamo; una vez enviado no ve ni descarga nada). |

## 7. Avisos y emails

| Elemento | Hoy |
|---|---|
| `NotificacionService` | Tres caminos por audiencia (`crearParaCliente`, `crearParaDueno`, `crearParaEquipo`), cada uno rechaza un tipo de otra audiencia; `AudienciaNotificacion` fija la audiencia por tipo. |
| `AvisoCuentaService` | Aviso + push + email (con reenvío si falló) para suspensiones y levantamientos; modelo para los avisos de resolución del reclamo. |
| `EmailService` | Un método por email, devolviendo `ResultadoEnvioEmail`; los emails salen por `EjecucionPostCommit`. No hay plantilla de reclamo. |
| Dónde irían | Email al Cliente cuando se resuelve (y `RECLAMO_APROBADO`/`RECLAMO_RECHAZADO` como aviso in-app, ya en el enum); `NUEVO_RECLAMO` al Administrador (ya en el enum; hoy el Administrador no recibe campana, así que alcanza con el contador del panel); `RECLAMO_REEMBOLSO_DUENO` (nuevo, audiencia `DUENO`, `V50`) con el monto y, según el spike, lo que se le descuenta. Hay que decidir si el Empleado se entera. |

## 8. Panel del Administrador

| Pieza | Hoy |
|---|---|
| Tarjetas del panel | `frontend/js/admin.js` arma las tarjetas desde `GET /administrador/metricas` (`MetricasAdminResponseDTO`, con `consultasSoporteEsperando` y `documentosPendientes`). Reclamos sería una tarjeta nueva con su contador (`reclamosPendientes`). |
| Modelo de bandeja y detalle | `admin-soporte.html` + `js/admin-soporte.js` (311 líneas) con `SoporteAdministradorController` y `SoporteAdminService`; `admin-documentos.html` y `admin-documento-revision.html` para revisión con visor de archivos y resolución con motivo. La resolución del reclamo se parece más a la revisión de documentos (aprobar/rechazar con motivo + visor) que a la conversación de Soporte. |
| Reembolsos fallidos | `admin-reembolsos.html` ya lista las notas `PENDIENTE_REVISION_MANUAL` y `FALLIDO` y permite reintentar; las del reclamo aparecerán ahí sin trabajo extra si el reintento usa el monto de la nota. |

## 9. Historial

| Evento | Cómo se registra hoy |
|---|---|
| Estado del pedido | `historial_estado_pedido` (actor, motivo); el reclamo no cambia el estado del pedido, así que no corresponde una fila. |
| Estado de cuenta | `historial_estado_usuario` solo por `EstadoUsuarioService`; no aplica. |
| Resolución del reclamo | Propuesta: la propia fila de `reclamo` (`administrador_id`, `fecha_resolucion`, tipo, monto, motivo) y la nota de crédito ligada. No hace falta una tabla de historial nueva si el reclamo no se vuelve a resolver (`RECHAZADO` y `APROBADO` son finales; el reembolso fallido se reintenta sobre la nota, no sobre el reclamo). |

## 10. Concurrencia

Orden global vigente (`docs/CONCURRENCIA-Y-TRANSACCIONES.md`): `usuario` (compartido, ascendente) → `empleado_comercio` → `dueno`/`cuenta_mercado_pago` → `comercio` → `pedido` (`FOR UPDATE`) → `pago` (`FOR UPDATE`) → inserts (`nota_credito`, historial, `notificacion`) → `carrito`.

| Operación de S5 | Bloqueos propuestos | Carrera a cubrir |
|---|---|---|
| Crear el reclamo (Cliente) | `usuario` del Cliente (compartido) → `pedido` (`FOR UPDATE`, para validar estado y plazo) → insert del reclamo (el `UNIQUE` por pedido es la red de seguridad). | Dos envíos del mismo Cliente (doble clic, dos pestañas): gana uno, el otro recibe `409` con el mismo texto. Crear contra la autoconfirmación o la entrega manual del pedido: el pedido bloqueado ordena. |
| Resolver con reembolso (Administrador) | `usuario` del Administrador y del Cliente (ascendente) → `reclamo` (`FOR UPDATE`) → `pedido` → `pago` → insert de la nota → commit; la llamada a Mercado Pago después del commit (regla 17). | Doble resolución por doble clic o dos pestañas: el segundo ve el reclamo ya resuelto y recibe `409`. Resolver contra otro reembolso del mismo pedido (suspensión, cancelación): un `ENTREGADO` ya no entra en esos caminos; el tope por saldo sigue valiendo. Atención al orden `reclamo` antes que `pedido`: ningún flujo existente toma el reclamo, pero hay que fijar `reclamo` en el orden global antes de `pedido` o después de `pago`; lo más simple es tomar `pedido` primero (como todos) y `reclamo` después, sin que nadie más lo tome antes. |
| Resolver con rechazo | `reclamo` / `pedido` como arriba, sin `pago`. | Igual. |
| Cliente cancela o edita el reclamo (si se permite) | Recomendación: no se permite (decisión de Diego pendiente); si se permitiera, tomaría `pedido` → `reclamo` igual que resolver. | Resolver mientras el Cliente cancela: el segundo en tomar el pedido ve el estado nuevo. |
| Reintento del reembolso (Administrador) | Igual que hoy (`ReembolsoService.reintentarNotaCredito`), sin cambios. | Ya cubierto por los estreses existentes. |
| Fotos | Insert de `reclamo_foto` y su binario dentro de la transacción de la creación del reclamo o en pasos posteriores (si se sube de a una foto, bloquear el reclamo `FOR UPDATE` para el tope de 3). | Dos subidas simultáneas que sumen más de 3 fotos. |

## 11. Otros hallazgos

- `PedidoService` (~línea 1006) dice "podés iniciar un reclamo" en el aviso de autoconfirmación; hoy no existe esa función. Después de S5 el texto queda correcto; antes de S5 es una promesa que el producto no cumple.
- El plazo de 7 días contado desde `fecha_entrega` no tiene en cuenta que un pedido autoconfirmado a los 90 minutos puede haber llegado antes de ese momento: el Cliente que no lo recibió tiene 7 días desde la autoconfirmación. Es una decisión de producto, no un defecto.
- El Empleado nunca recibe `clienteId` ni datos de pago; un reclamo no debe cambiar eso.
