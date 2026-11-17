# MAPEO DFD NIVEL 2 — TRAMO G (P5 Pagos y P6 Notificaciones)

Relevamiento de solo lectura, hecho el 2026-11-16 sobre el código real (`backend/` y `frontend/`). Ningún archivo del proyecto fue modificado. Donde el código difiere de la documentación manda el código y queda como desvío (D-41 en adelante). Las decisiones que tiene que tomar Diego van como dudas (C-26 en adelante). Lo no leído figura como **NO RELEVADO**.

Rutas de código: `B:` = `backend/src/main/java/com/bajonea/backend/`, `F:` = `frontend/`. Las líneas son aproximadas.

No se repite lo ya relevado en los Tramos A a F (ver sus mapeos). Cuando un flujo toca algo de esos tramos (carrito, turnos, suspensiones, reclamos, documentos) se cita y se completa solo lo nuevo.

---

## 0. Resumen ejecutivo para los diagramas

| Proceso | Disparador | Punto de entrada | Lo central |
|---|---|---|---|
| P5.01 Vinculación OAuth | Dueño toca "Vincular Mercado Pago" | `GET /oauth/mercadopago/iniciar` → navegador a MP → `GET /oauth/mercadopago/callback` (público) | PKCE S256, `state` de un solo uso, intercambio de código sin transacción, cuenta única por Dueño y por `mp_user_id`, recalculo de aptitud de los comercios |
| P5.02 Cobro | Cliente toca "Ir a pagar con Mercado Pago" | `POST /pedidos/cliente/{id}/pago` | tres pasos (leer / llamar a MP / guardar), preferencia con `marketplace_fee`, vence con el pedido, verificación previa contra MP antes de reabrir un checkout |
| P5.03 Webhook | MP notifica | `POST /webhooks/mercadopago?pedidoId=&data.id=&type=payment` (público) | firma `x-signature` (solo si hay secreto), el pedido se cruza por `external_reference`, `aplicarResultadoPago` idempotente, pago tardío → reembolso |
| P5.04 Reembolso | Cambio de estado del pedido con pago aprobado | `ReembolsoService.generarNotaYReembolsarTotal` | nota de crédito en la misma transacción, llamada a MP después del commit, un solo intento |
| P5.05 Reintento manual | Administrador | `POST /administrador/reembolsos/{id}/reintentar` | sincrónico en la request, sin job de reintentos |
| P6.01 Emisión | Cada servicio de negocio | `NotificacionService.crearPara*` | una copia por destinatario, audiencia fija por tipo, canal PUSH in-app y rastro EMAIL |
| P6.02 Consulta y lectura | Polling del frontend | `GET /notificaciones` (cursor), contador, marcar | 15 s exactos, `visibilitychange`, destino por tipo en `destino-aviso.js` |

Hallazgos que cambian dibujos: **no existe refresh de tokens, ni job de reintento de reembolsos, ni emisor de T27, T17, T18, T19, T22 ni T26** (ver D-41 a D-45); el Administrador no tiene pantalla de notificaciones (D-43).

---

## P5.01 — Vinculación de la cuenta de Mercado Pago del Dueño (OAuth)

### 1. Endpoints

Controller: `B:controllers/MercadoPagoOAuthController.java`. Seguridad (`SecurityConfig`): `/api/v1/oauth/mercadopago/**` exige `hasRole("DUENO")` salvo `/callback`, que está en `RUTAS_PUBLICAS`. Ninguno usa `X-Comercio-Id` (actúan sobre el Dueño, no sobre un comercio). El Empleado no puede (rutas exclusivas del Dueño). `api.js` no manda el header en estas rutas (`RUTAS_DEL_DUENO` no las incluye).

| Método y ruta | Rol | Entrada | Respuesta |
|---|---|---|---|
| `GET /api/v1/oauth/mercadopago/iniciar` | Dueño | — | `200` "URL de autorización generada correctamente", `data: { url }` |
| `GET /api/v1/oauth/mercadopago/callback?code=&state=` | público (lo invoca el navegador por redirect de MP) | query `code`, `state` (opcionales) | siempre `302` a `{app.frontend-base-url}/comercio-perfil.html?vinculacionMp={resultado}` con cuerpo "Redirigiendo a Bajoneá" |
| `GET /api/v1/oauth/mercadopago/cuenta` | Dueño | — | `200` "Estado de vinculación obtenido correctamente", `data: { vinculada, mpUserId, fechaVinculacion }` (nulos si no hay cuenta activa; nunca expone tokens) |
| `GET /api/v1/oauth/mercadopago/desvinculacion/previa` | Dueño | — | `200` "Previa de desvinculación obtenida correctamente", `data: { puedeDesvincular, comercios[{id,nombre,pedidosEnCurso[{estado,cantidad}],cantidadPagosPendientes}], pagosPendientes{cantidadTotal, puedeReintentarDesde} }` |
| `DELETE /api/v1/oauth/mercadopago/desvincular` | Dueño | — | `200` "Cuenta de Mercado Pago desvinculada correctamente" |

Resultados del callback (`vinculacionMp`): `exito`, `cuenta-en-uso` (`CuentaMercadoPagoEnUsoException`), `cuenta-ya-vinculada` (`CuentaMercadoPagoYaVinculadaException`), `error` (falta `code` o `state` o cualquier otra `RuntimeException`; el detalle se pierde, no hay log en el controller).

### 2. Pasos en orden (`B:services/MercadoPagoOAuthService.java`)

**Inicio** (`iniciarVinculacion`, `@Transactional`):
1. Lee `dueno` (404 "Dueño no encontrado").
2. Si hay cuenta activa (`cuenta_mercado_pago.activa = 1`) → `409` `CuentaMercadoPagoYaVinculadaException`.
3. Borra los intentos pendientes del Dueño (`CodigoVinculacionMPRepository.eliminarIntentosPendientesDelDueno`): un solo intento vigente por Dueño.
4. Genera `code_verifier` (32 bytes aleatorios, base64url sin relleno) y `state` (24 bytes, base64url). Guarda `codigo_vinculacion_mp` (`dueno_id`, `identificador_intento` = state, `codigo_verificacion` = verifier, `fecha_creacion`, `usado = false`). No hay vencimiento del intento (no se compara `fecha_creacion` en ningún punto leído).
5. Arma la URL `https://auth.mercadopago.com.ar/authorization` con `client_id`, `response_type=code`, `platform_id=mp`, `redirect_uri`, `state`, `code_challenge` (SHA-256 del verifier, base64url) y `code_challenge_method=S256`.

**Callback** (`procesarCallback`, sin `@Transactional` de método; regla 17 de CLAUDE.md: tres pasos):
1. Transacción corta (con `entityManager.clear()`): busca el intento por `state` con `usado = false`; si no existe → `409` "El intento de vinculación con Mercado Pago no es válido o ya fue usado". Devuelve (id, duenoId, verifier).
2. Sin transacción: `POST {MERCADOPAGO_API_BASE_URL | https://api.mercadopago.com}/oauth/token` con JSON `{client_secret, client_id, grant_type:"authorization_code", code, code_verifier, redirect_uri, test_token:"<true|false>"}`. Tiempos: conexión 5 s, lectura 10 s. Sin reintentos. Errores: respuesta nula o sin `access_token` → `409` "Mercado Pago no devolvió un access_token válido"; HTTP de error → `409` "No se pudo completar la vinculación con Mercado Pago: {statusText}". Si el intercambio falla el intento queda sin usar (se puede reintentar con el mismo `state`).
3. Transacción corta: `marcarUsadoSiNoLoEstaba(id)` (si devuelve 0 → mismo `409` del intento inválido: carrera de dos vueltas o intento reemplazado); `ComercioService.duenoBloqueadoConBloqueo(duenoId)` (lee estado del usuario con `LOCK IN SHARE MODE`); `CuentaMercadoPagoService.vincular(...)`; `AptitudVentaComercioService.recalcularComerciosDelDueno(duenoId, EntradasDueno(duenoBloqueado, true), MP_VINCULADO)`.

**`CuentaMercadoPagoService.vincular`** (`B:services/CuentaMercadoPagoService.java`, `@Transactional` de clase): busca la fila única del Dueño (`UNIQUE dueno_id`). Si está activa y el `mp_user_id` es otro → `409` "Ya tenés una cuenta de Mercado Pago vinculada. Desvinculala antes de vincular otra." Si otra fila **activa** de otro Dueño tiene ese `mp_user_id` → `409` "Esa cuenta de Mercado Pago ya está en uso por otro Dueño. Usá otra cuenta, o pedí que la desvinculen primero." Si no hay fila: la crea; si hay: pone `fecha_vinculacion = ahora` y `fecha_desvinculacion = null`. Guarda `mp_user_id`, `access_token`, `refresh_token`, `public_key`, `es_cuenta_prueba` (= `mercadopago.test-token`), `activa = true`, `token_expira = ahora + expires_in`. `saveAndFlush` (para respetar el orden de bloqueo cuenta → comercio). La violación del índice `uq_cuenta_mp_user_id_activo` (V27, columna generada `mp_user_id_activo`) se traduce a la misma excepción de cuenta en uso. Tokens cifrados con AES-GCM por `MercadoPagoTokenConverter` (clave `MERCADOPAGO_TOKEN_ENCRYPTION_KEY`).

**Efecto en los comercios:** `AptitudVentaComercioService` (NO RELEVADO en detalle; ver Tramo de Fase 4 y la regla de CLAUDE.md §1bis): con cuenta activa + documentación aprobada los `APROBADO` pasan a `APTO_VENTA`; con la cuenta del Dueño `BLOQUEADO` pasan a `CERRADO_TEMPORALMENTE`. El aviso T40 al Dueño sale desde ese servicio ("Tu comercio {X} ya puede recibir pedidos.", líneas ~292).

**Desvinculación previa** (`previaDesvinculacion`, `@Transactional(readOnly)`): `404` "El Dueño no tiene ninguna cuenta de Mercado Pago vinculada" sin cuenta activa. Una consulta agrupada cuenta pedidos por comercio y estado (`PENDIENTE_CONFIRMACION_COMERCIO`, `EN_PREPARACION`, `EN_CAMINO`, `LISTO_PARA_RETIRAR` y `PENDIENTE_PAGO`). `puedeReintentarDesde` = creación del pedido `PENDIENTE_PAGO` más reciente + `pedido.timeout.pago-minutos`.

**Desvinculación** (`desvincular`, `@Transactional`): orden de bloqueo: usuario del Dueño (compartido) → `cuenta_mercado_pago` `FOR UPDATE` → todos los comercios del Dueño `FOR UPDATE` → pedidos `PENDIENTE_PAGO` de esos comercios con `LOCK IN SHARE MODE` (filas, no conteo).
- Algún comercio `SUSPENDIDO` → `409` `ConflictoComercioException.SUSPENDIDO` "No podés desvincular Mercado Pago mientras un comercio tuyo esté suspendido. Se usa para devolver el dinero de los pedidos."
- Hay pedidos `PENDIENTE_PAGO` → `409` `DesvinculacionBloqueadaException`: "Hay 1 pedido de un cliente que todavía está pagando. Probá de nuevo alrededor de las HH:mm." (o "Hay N pedidos de clientes que todavía están pagando. ..."), con `data: { cantidadPagosPendientes, puedeReintentarDesde }`.
- Si no: `activa = false`, `fecha_desvinculacion = ahora` (los tokens no se borran) y `recalcularComerciosDelDueno(..., EntradasDueno(false,false), MP_DESVINCULADO)` (los `APTO_VENTA` vuelven a `APROBADO`). Los demás pedidos en curso siguen su flujo; un reembolso posterior queda `PENDIENTE_REVISION_MANUAL` (P5.04).
- Sin cuenta activa → `404` con el mismo mensaje de arriba.

### 3. Decisiones

| Decisión | Valores → destino |
|---|---|
| ¿Cuenta activa al iniciar? | sí → 409 ya vinculada; no → sigue |
| ¿`code`/`state` presentes en el callback? | no → redirect `error` |
| ¿Intento válido y sin usar? | no → 409 intento inválido → redirect `error` |
| ¿MP devolvió `access_token`? | no → 409 → redirect `error` |
| ¿Misma cuenta del mismo Dueño ya activa? | sí → idempotente (refresca datos) |
| ¿Otra cuenta distinta con una activa? | sí → `cuenta-ya-vinculada` |
| ¿Cuenta activa en otro Dueño? | sí → `cuenta-en-uso` |
| ¿Dueño `BLOQUEADO`? | sí → comercios a `CERRADO_TEMPORALMENTE` sin pasar por `APTO_VENTA` |
| Al desvincular: ¿comercio suspendido / pagos pendientes? | suspendido → 409 / pagos → 409 con hora / ninguno → desvincula |

### 4. Errores y qué queda en la base

| Código | Texto | Base |
|---|---|---|
| 404 | "Dueño no encontrado" | nada |
| 409 | "Ya tenés una cuenta de Mercado Pago vinculada. Desvinculala antes de vincular otra." | el `iniciar` no escribe |
| 409 | "El intento de vinculación con Mercado Pago no es válido o ya fue usado" | intento sin cambios |
| 409 | "No se pudo completar la vinculación con Mercado Pago: {statusText}" / "Mercado Pago no devolvió un access_token válido" | intento queda `usado = false` |
| 409 | "Esa cuenta de Mercado Pago ya está en uso por otro Dueño. Usá otra cuenta, o pedí que la desvinculen primero." | transacción revertida: el intento vuelve a `usado = false` |
| 404 | "El Dueño no tiene ninguna cuenta de Mercado Pago vinculada" | nada |
| 409 | desvinculación bloqueada (ver arriba) | nada |

En el callback todo error se vuelve `302` (el frontend nunca ve el 4xx).

### 5. Pantallas y textos (`F:comercio-perfil.html`, `F:js/comercio.js` ~1895–2210 y ~2660–2705, `F:js/pasos-vender.js`)

Vista `view-mercadopago` (fila "Mercado Pago" del perfil del Dueño, `?vista=mercadopago` también la abre):
- Encabezado "Cobros con Mercado Pago".
- Sin cuenta: "Empezá a cobrar con Mercado Pago" / "Tu comercio todavía no se encuentra visible para tus clientes. Vinculá tu cuenta de Mercado Pago para empezar a recibir pedidos y cobrar directo en tu cuenta." / "Esta cuenta va a cobrar por todos tus comercios" / botón "Vincular Mercado Pago" (`btn-vincular-mercadopago`) → `GET /iniciar` y `window.location.href = url`. Error: toast "No pudimos iniciar la vinculación con Mercado Pago" (o el mensaje del servidor).
- Con cuenta: "Cuenta vinculada", "Cuenta de Mercado Pago vinculada: {mpUserId}", "Vinculada el {fecha}", "Esta cuenta cobra por todos tus comercios", lista de comercios operativos, botón "Desvincular cuenta" (`btn-desvincular-mercadopago`; deshabilitado con comercio suspendido: "No se puede desvincular mientras un comercio tuyo esté suspendido").
- Toasts por `vinculacionMp` (se limpia de la URL): `exito` "Tu cuenta de Mercado Pago quedó vinculada" (success), `error` "No pudimos vincular tu cuenta de Mercado Pago. Probá de nuevo.", `cuenta-en-uso` "Esa cuenta de Mercado Pago ya está en uso por otro Dueño. Usá otra cuenta, o pedí que la desvinculen primero.", `cuenta-ya-vinculada` "Ya tenés una cuenta de Mercado Pago vinculada. Desvinculala antes de vincular otra." (los tres últimos tipo error).
- Estado de carga: caja `mp-estado-cargando`; error al leer: toast "No pudimos obtener el estado de Mercado Pago".
- Hoja de desvinculación (`abrirModalDesvincularMp`): carga con esqueleto, luego uno de dos modos:
  - Bloqueo: "No podés desvincular ahora" / "Hay 1 cliente pagando un pedido en Mercado Pago ({Comercio}: N). Si desvinculás ahora, ese pago no se podría confirmar." (plural: "N clientes pagando un pedido ... esos pagos no se podrían confirmar") / pie "Probá de nuevo alrededor de las HH:mm. Un pedido sin pagar vence a los 30 minutos." (el "30" está escrito en el frontend) / si hay comercios cerrables: "Cerrá el comercio para que no entren más pedidos mientras esperás." con botón "Cerrar comercio" ("Cerrar comercios") y toast "Cerraste el comercio" / "Cerraste N comercios"; botón "Entendido".
  - Confirmación: "¿Desvincular Mercado Pago?" / "Tus comercios dejarán de recibir pedidos nuevos y saldrán del catálogo hasta que vuelvas a vincular una cuenta." / "Pedidos en curso, siguen su camino" (o "No tenés pedidos en curso") / nota "Si hay que devolver el dinero de alguno de estos pedidos, lo gestiona el equipo de Bajoneá de forma manual." / botones "Desvincular" ("Desvinculando…") y "Cancelar".
  - Un `409` del DELETE vuelve a pedir la previa y repinta; un `404` refresca y avisa; otro error se muestra inline (`role="alert"`) o con "No pudimos desvincular la cuenta. Probá de nuevo.". Éxito: toast con el mensaje del servidor "Cuenta de Mercado Pago desvinculada correctamente".
- Bloque "Para empezar a vender" (`F:js/pasos-vender.js`): paso "Vincular Mercado Pago" con texto "Es la cuenta donde vas a cobrar tus ventas." (hecho: "Mercado Pago vinculado").
- Alta de comercio adicional (`F:js/agregar-comercio.js`): "Usamos los datos fiscales y la cuenta de MercadoPago de tu cuenta. No hace falta cargarlos de nuevo." (o sin "y la cuenta de MercadoPago").

### 6. Propiedades

| Propiedad / variable | Valor |
|---|---|
| `mercadopago.client-id` / `client-secret` / `redirect-uri` / `webhook-secret` | `${MERCADOPAGO_CLIENT_ID:}`, `${MERCADOPAGO_CLIENT_SECRET:}`, `${MERCADOPAGO_REDIRECT_URI:}`, `${MERCADOPAGO_WEBHOOK_SECRET:}` (vacías por defecto) |
| `mercadopago.test-token` | `${MERCADOPAGO_TEST_TOKEN:false}`; se manda como `test_token` y se guarda como `es_cuenta_prueba`. `MercadoPagoConfig` loguea un WARN al arrancar si la variable no está seteada |
| `mercadopago.token-encryption-key` | `${MERCADOPAGO_TOKEN_ENCRYPTION_KEY:}` |
| `MERCADOPAGO_API_BASE_URL` | `https://api.mercadopago.com` (solo pruebas la cambian; no definir en el servidor final) |
| `app.frontend-base-url` | dev `http://localhost:5501`; producción `${FRONTEND_BASE_URL:https://bajonea.ar}` |
| constantes del código | `URL_AUTORIZACION_MP = https://auth.mercadopago.com.ar/authorization`, `TIMEOUT_CONEXION_MS = 5000`, `TIMEOUT_LECTURA_MS = 10000`, `CODE_VERIFIER_BYTES = 32`, `STATE_BYTES = 24` |

### 7. Jobs

Ninguno. No hay refresco de tokens (`refresh_token` y `token_expira` se guardan y nunca se leen; confirmado con grep), ni limpieza de intentos `codigo_vinculacion_mp` vencidos.

### 8. Notificaciones de estos flujos

| Tipo (T-xx) | Destinatario | Canal | Texto | Entidad | Destino al tocarlo |
|---|---|---|---|---|---|
| `COMERCIO_APTO_VENTA` (T40) | Dueño | PUSH | "Tu comercio {X} ya puede recibir pedidos." | COMERCIO | `comercio-dashboard.html`, "Ir al panel" |
| `COMERCIO_SIN_APTITUD` (T41) | Dueño | PUSH | "Tu comercio {X} dejó de recibir pedidos: {faltante}." (el armado de `{faltante}` no se leyó) | COMERCIO | `comercio-dashboard.html`, "Ver qué falta" |

(Emisión en `AptitudVentaComercioService`; textos tomados de las líneas ~292 y ~295. No se verificó cuándo se emiten exactamente en vincular/desvincular.)

### 9. Comparación con la documentación

- `requisitos-funcionales-dueño.md` §"Vinculación de Mercado Pago" coincide con el código (cuenta única por Dueño, cuenta en un solo Dueño, previa de desvinculación, bloqueo por pagos pendientes). La documentación ya dice que el refresh no existe (`diccionario-de-datos.md` y `alcance-y-limitaciones.md`): sin desvío.
- Observación (C-26, C-27 abajo): el intento de OAuth no vence.

---

## P5.02 — Cobro del pedido

### 1. Endpoints (`B:controllers/PedidoController.java`, `B:services/MercadoPagoPagoService.java`)

| Método y ruta | Rol | `X-Comercio-Id` | Entrada | Respuesta |
|---|---|---|---|---|
| `POST /api/v1/pedidos/cliente/{id}/pago` | Cliente | no | — | `200` "Link de pago generado correctamente", `data: PagoResponseDTO {pedidoId, estado, monto, urlPago, fechaCreacion, fechaConfirmacion, yaPagado, enRevision}` |
| `POST /api/v1/pedidos/cliente/{id}/pago/sincronizar` | Cliente | no | cuerpo opcional `{ paymentId }` (regex `[0-9]{1,20}`, `400` "El identificador de pago solo puede contener dígitos") | `200` "Pago sincronizado correctamente", `data: PedidoResponseDTO` |
| `GET /api/v1/pedidos/cliente/{id}/pago` | Cliente | no | — | `200` "Pago obtenido correctamente" (el frontend **no** lo usa: grep) |
| `GET /api/v1/pedidos/comercio/{id}/pago` | Dueño (exclusiva, no delegable) | sí, obligatorio | — | `200` "Pago obtenido correctamente" (el frontend **no** lo usa) |

`PagoResponseDTO` no tiene campo `procesando`: ese concepto vive solo en el frontend (ver §5).

### 2. Pasos de "Ir a pagar" (`iniciarOReusarPago`, sin `@Transactional` de método)

**Paso 1 — transacción corta (`prepararPago`):**
1. `EstadoUsuarioService.exigirNoSuspendido(usuarioId)` (lectura con bloqueo compartido; cuenta `SUSPENDIDO` → `CuentaSuspendidaException`, cuyo texto no se leyó).
2. `obtenerPedidoDelCliente` (404 "Pedido no encontrado" si no es suyo). Busca `pago` del pedido.
3. Si `pedido.pago_estado = PAGADO` → respuesta directa `yaPagado = true`, `enRevision = false`, `urlPago = null` (sin llamar a MP).
4. Si `pedido.estado != PENDIENTE_PAGO` → `409` "El pedido no está esperando el pago".
5. Si el comercio está `SUSPENDIDO` → `409` "Este comercio no está disponible en este momento".
6. Cuenta activa del Dueño; si no hay → `409` "El comercio de este pedido no tiene una cuenta de Mercado Pago vinculada. No se puede procesar el pago."
7. Si el `pago` ya tiene `mp_preferencia_id` → no se arma preferencia nueva (se verificará con MP); si no, `construirPreferencia`.

**Armado de la preferencia (`construirPreferencia`):** `items` = un ítem por `detalle_pedido` (`id` = producto, `title` = nombre, `quantity`, `currency_id = ARS`, `unit_price = precio_unitario`) más `{id:"cargo-servicio", title:"Cargo por servicio Bajoneá", quantity:1, unit_price: cargo_servicio_cliente}`; `back_urls` `{success, pending, failure}` = `{app.frontend-base-url}/pedido-detalle.html?id={id}&pago=exito|pendiente|fallo`; `notification_url = {app.backend-base-url}/api/v1/webhooks/mercadopago?pedidoId={id}`; `auto_return = "approved"`; `external_reference = {id}`; `marketplace_fee = cargo_servicio_cliente + cargo_servicio_comercio`; `expires = true`; `expiration_date_from` = ahora truncado a segundos y `expiration_date_to` = ahora + (`pedido.timeout.pago-minutos` − tiempo ya transcurrido desde `pedido.fecha_creacion`), con formato `yyyy-MM-dd'T'HH:mm:ss.SSSxxx` y desfase fijo `-03:00` (constante `ZONA_PREFERENCIA`). Si el restante ≤ 0 → `409` "El pedido venció, ya no se puede pagar". No usa `binary_mode` ni `payer`.

**Paso 2 — sin transacción (tiempos 5 s conexión y 5 s lectura, sin reintentos):**
- Preferencia nueva: `POST {api}/checkout/preferences` con `Authorization: Bearer {access_token del Dueño}`. `RestClientResponseException` → `409` "No se pudo generar el link de pago con Mercado Pago: {statusText}" (con `log.error`); respuesta sin `id` → `409` "Mercado Pago no devolvió una preferencia de pago válida".
- Preferencia existente: `GET {api}/v1/payments/search?external_reference={id}&sort=date_created&criteria=desc&limit=20`. Elige el primer pago `approved` o, si no hay, el más reciente por `date_created`. Cualquier `RestClientException` (red, tiempo agotado, HTTP) → `503` "No pudimos verificar el estado de tu pago. Probá de nuevo en unos segundos."

**Paso 3 — transacción corta:**
- Preferencia nueva (`guardarPreferencia`): `PedidoService.bloquearParaActualizar(pedidoId)` (usuarios S → pedido X); revalida dueño del pedido (404) y estado (`409` "El pedido no está esperando el pago"); `PagoService.crearPreferenciaSiNoExiste` inserta con `INSERT ... ON DUPLICATE KEY UPDATE` (sin lectura previa, por un deadlock de bloqueos de intervalo; según Javadoc) y relee la fila `FOR UPDATE`: si otra solicitud simultánea ya guardó su preferencia se usa esa y la de más se descarta (vence sola). Respuesta con `urlPago` = `mp_sandbox_init_point` si la cuenta `es_cuenta_prueba`, si no `mp_init_point`.
- Preferencia existente (`resolverPagoExistente`): si hay un pago, `validarYAplicarResultado` (la misma rutina del webhook, P5.03). Luego: pedido `PAGADO` → `yaPagado = true`; si el estado del pago de MP no es `approved`, `rejected` ni `cancelled` (por ejemplo `pending`, `in_process`) → `enRevision = true` sin link (queda así hasta que se resuelva o venza el pedido, a propósito); si no hay pago o está rechazado → vuelve a entregar el link existente.

**Sincronización (`sincronizarPago`)**, al volver del checkout:
1. Transacción: pedido del Cliente; si ya no está `PENDIENTE_PAGO` o no tiene `pago` → devuelve el detalle actual sin llamar a MP.
2. Sin transacción: con `paymentId` → `GET {api}/v1/payments/{paymentId}` (error HTTP → `409` "No se pudo consultar el pago {id} en Mercado Pago: {statusText}"; respuesta nula → `409` "Mercado Pago no devolvió información del pago {id}"). Sin `paymentId` → búsqueda por `external_reference` (`buscarMejorPagoPorReferencia`: un `RestClientResponseException` se traga y devuelve el detalle actual; una falla de red `ResourceAccessException` **no** se captura aquí → 500, ver C-28).
3. Transacción: `validarYAplicarResultado`; devuelve el detalle del pedido. Nunca confía en el `paymentId` que manda el frontend: siempre se cruza `external_reference`.

**Vencimiento del link:** la preferencia vence con el pedido (ver `expiration_date_to`). Job `expirarPagosVencidos` cada 60 s (ver §7).

### 3. Decisiones

| Rombo | Valores → destino |
|---|---|
| `pedido.pago_estado` | `PAGADO` → respuesta `yaPagado` / otro → sigue |
| `pedido.estado` | `PENDIENTE_PAGO` → sigue / otro → 409 |
| estado del comercio | `SUSPENDIDO` → 409 / otro → sigue |
| ¿cuenta de MP activa? | no → 409 |
| ¿`pago.mp_preferencia_id` cargado? | no → crear preferencia / sí → verificar contra MP |
| estado del pago más relevante de MP | `approved` → `yaPagado` (y confirma el pedido) / `pending`, `in_process` u otro no resuelto → `enRevision` / `rejected`, `cancelled` o sin pagos → entrega el link de nuevo |
| ¿Verificación a MP falla? | sí → 503 |
| ¿Pedido vencido al armar la preferencia? | sí → 409 |
| `es_cuenta_prueba` | sí → `sandbox_init_point` / no → `init_point` |

### 4. Errores

| Código | Texto literal | Base |
|---|---|---|
| 404 | "Pedido no encontrado" | nada |
| 409 | "El pedido no está esperando el pago" | nada |
| 409 | "Este comercio no está disponible en este momento" | nada |
| 409 | "El comercio de este pedido no tiene una cuenta de Mercado Pago vinculada. No se puede procesar el pago." | nada |
| 409 | "El pedido venció, ya no se puede pagar" | nada |
| 409 | "No se pudo generar el link de pago con Mercado Pago: {statusText}" | nada (no se guarda preferencia) |
| 409 | "Mercado Pago no devolvió una preferencia de pago válida" | nada |
| 503 | "No pudimos verificar el estado de tu pago. Probá de nuevo en unos segundos." | nada |
| 409 (sync) | "No se pudo consultar el pago {id} en Mercado Pago: {statusText}" | nada |
| 409 | `CuentaSuspendidaException` (texto NO RELEVADO) | nada |

### 5. Pantallas y textos

**Checkout, paso 4** (`F:js/checkout.js` ~616–676): título "Pago", "Te vamos a redirigir a Mercado Pago para completar el pago.", línea "Total", botón "Ir a pagar con Mercado Pago" (mientras llama: "Generando link de pago..."). `yaPagado` → toast "Tu pago se realizó correctamente" y navega a `pedido-detalle.html?id={id}&pago=exito`; `enRevision` → toast "Tu pago está pendiente de confirmación" y reactiva el botón; si no, `window.location.href = urlPago`. Error 503 → toast con el mensaje (tipo error); otro error → banner "No pudimos generar el link de pago. Intentá nuevamente." o el mensaje del servidor.

**Detalle de pedido** (`F:js/pedidos.js`): el estado `PENDIENTE_PAGO` ofrece el mismo botón (`btn-ir-a-pagar`). Con `comercioNoDisponible`: botón deshabilitado + "Vas a poder pagar cuando el comercio vuelva a estar disponible, si el pedido no venció." + "Cancelar pedido". Con `procesando` (volvió con `?pago=exito|pendiente` y el pedido sigue `PENDIENTE_PAGO`/`PENDIENTE`): botón deshabilitado "El pago se está procesando". `yaPagado` → toast "Tu pago se realizó correctamente" y recarga el pedido. Error → toast "No pudimos generar el link de pago" (o el mensaje del servidor).

Textos de estado: "Esperando pago" / "Todavía no pagaste este pedido." / con `pagoEstado = RECHAZADO`: "No pudimos procesar tu pago. Podés intentar de nuevo." / "Estamos confirmando tu pago. Esta pantalla se actualiza sola.".

**Vuelta de Mercado Pago** (`?pago=exito|pendiente|fallo`, `payment_id` o `collection_id` de solo dígitos): `ciclo()` llama a `POST .../pago/sincronizar` cada 3000 ms hasta 15 intentos (1 si `fallo`), parando cuando el pedido deja de estar en espera; solo 401 y 404 cortan; con error en el último intento muestra el resultado igual. Toasts: pagado "Tu pago se realizó correctamente"; rechazado (error) 'El pago no se pudo procesar. Podés intentar de nuevo desde la sección "Mis pedidos".'; en espera "Tu pago se está procesando. Esto puede tardar unos segundos." (con `exito` y sin finalizar) o "Tu pago está pendiente de confirmación.". La lista de pedidos se refresca cada 15000 ms (`INTERVALO_LISTA_MS`).

### 6. Propiedades

| Propiedad | Valor |
|---|---|
| `pedido.timeout.pago-minutos` | `30` |
| `pedido.timeout.respuesta-comercio-minutos` | `30` |
| `app.backend-base-url` | `${BACKEND_BASE_URL:}` (vacía por defecto; sin ella `notification_url` queda relativa: ver C-29) |
| `app.frontend-base-url` | ver P5.01 |
| `app.zona-horaria` | `America/Argentina/Ushuaia` (valor en el código) |
| Constantes | `TIMEOUT_MP_MS = 5000`, `MONEDA = "ARS"`, `ZONA_PREFERENCIA = -03:00` |

### 7. Jobs relacionados (`B:services/PedidoSchedulerService.java`)

`expirarPagosVencidos`: `@Scheduled(fixedDelay = 60_000)`, activo con `pedido.jobs.habilitado` (por defecto `true`, `false` en el perfil `test`). Busca `PENDIENTE_PAGO` con `fecha_creacion` anterior a `ahora − 30 min`; un pedido por transacción (`bloquearParaActualizar` → revalida estado y fecha): `CANCELADO_POR_SISTEMA`, `cancelado_por = SISTEMA`, `motivo` "Pago rechazado" (si `pago_estado = RECHAZADO`) o "Pago no confirmado", historial con `TIMEOUT_PAGO`, aviso T11 (ver P5.03 §8). Sin reembolso (no hay pago aprobado). Otros procesos de pedidos (ya relevados en Tramos anteriores): `avisar75MinYAutoconfirmar` (60 s), `expirarPedidosSinRespuestaComercio` (300 s, dispara P5.04), `autoconfirmarRetirosPorSuspension` (300 s), `cancelarPreparacionPorSuspension` (60 s), `rechazarPendientesPorSuspension` (60 s), `procesarPedidosSinAtencionPorSuspensionDeDueno` (60 s).

### 8. Notificaciones

Ninguna se emite al crear la preferencia. Las del pago aprobado/vencido están en P5.03 §8.

### 9. Comparación con la documentación

`requisitos-funcionales-sistema.md` §"Pago con MercadoPago" coincide con el código (preferencia, `marketplace_fee`, vencimiento con el pedido, verificación previa, 503, sincronización con cruce de `external_reference`). Diferencia menor: el `GET /pedidos/comercio/{id}/pago` solo funciona para pedidos que ya llegaron pagados (usa `obtenerPedidoDelComercio`, que exige `llegoPagado`); ver C-30.

---

## P5.03 — Webhook de Mercado Pago

### 1. Endpoint (`B:controllers/MercadoPagoWebhookController.java`)

`POST /api/v1/webhooks/mercadopago` — público (`RUTAS_PUBLICAS`), sin JWT, sin rol, sin `X-Comercio-Id`. Se leen solo query params y headers (no el cuerpo): `pedidoId` (propio de Bajoneá, agregado a la `notification_url`), `data.id`, `type`, headers `x-signature` y `x-request-id`. El filtro `RateLimitPublicoFilter` no cubre esta ruta (grep).

| Caso | Respuesta |
|---|---|
| `type != "payment"`, o falta `data.id` o `pedidoId` | `200` "Notificación ignorada" |
| firma inválida | `401` "Firma inválida" |
| `pedidoId` no numérico | `500` (`Integer.valueOf` sin capturar; reconocido en `alcance-y-limitaciones.md`) |
| procesada | `200` "Notificación procesada" |
| MP falla al consultar el pago, o el comercio no tiene cuenta activa | `409` con el texto de la excepción (MP reintenta la notificación) |

### 2. Pasos (`procesarNotificacion`, `validarYAplicarResultado`, `aplicarResultadoPago`)

1. **Firma** (`validarFirma`): si `mercadopago.webhook-secret` está vacío → se omite con `log.warn` ("mercadopago.webhook-secret no configurado — se omite la validación de x-signature del webhook") y devuelve `true`. Con secreto: exige `x-signature`; extrae `ts` y `v1`; arma el manifest `id:{data.id en minúsculas};request-id:{x-request-id};ts:{ts};`; HMAC-SHA256 hexadecimal; compara sin distinguir mayúsculas (no es comparación en tiempo constante). No valida la antigüedad de `ts`.
2. **Transacción corta**: busca `pago` por `pedidoId`; si no existe → `log.warn` "Webhook de MercadoPago para pedidoId=... sin ninguna preferencia de pago creada por Bajoneá — se ignora" y termina con `200`. Lee el `access_token` activo del Dueño del comercio del pedido (si no hay cuenta → 409).
3. **Sin transacción**: `GET {api}/v1/payments/{data.id}` con el token del Dueño (5 s / 5 s). Error HTTP → `409` "No se pudo consultar el pago {id} en Mercado Pago: {statusText}".
4. **Transacción** (`entityManager.clear()` al empezar): `validarYAplicarResultado`: si `external_reference` ≠ `pedidoId` → `log.warn` y alerta `EXTERNAL_REFERENCE_MISMATCH` (pedido reclamado, `mp_payment_id`, `mp_external_reference`, IP de origen `request.getRemoteAddr()`) y termina sin tocar nada. Si coincide → `aplicarResultadoPago`.
5. **`aplicarResultadoPago`** (idempotente). Bloqueos: con `approved`, `PedidoService.bloquearParaPago` (usuarios de Cliente, Dueño y Empleados activos con `LOCK IN SHARE MODE` en id ascendente → relaciones → estado del comercio → pedido `FOR UPDATE`; lee también el estado del Cliente y del comercio); con cualquier otro estado, solo el pedido `FOR UPDATE`. Después el `pago` `FOR UPDATE`. Si no hay `pago` → `log.warn` y termina.

### 3. Decisiones: estados de MP y qué pasa

`yaHayPagoAprobado` = `pago.fecha_confirmacion != null`.

| Estado del pago en MP | Condición | Resultado |
|---|---|---|
| `approved` | `yaHayPagoAprobado` y `paymentId` distinto del guardado | alerta `PAGO_APROBADO_DUPLICADO` (idempotente por pedido+pago+motivo) y termina; no toca `pago` ni pedido (no devuelve el dinero del duplicado) |
| `approved` | si no | `PagoService.registrarResultado` (`id_transaccion_mp`, `mp_estado`, `metodo_pago`, `fecha_confirmacion` solo si estaba nula); luego según el pedido (ver abajo); después `verificarSplitAplicado` |
| `rejected`, `cancelled` | `yaHayPagoAprobado` | no hace nada |
| `rejected`, `cancelled` | si no | `registrarResultado` (aprobado = false) y `marcarPagoRechazado`: si el pedido sigue `PENDIENTE_PAGO` y no está `PAGADO` → `pago_estado = RECHAZADO` (el pedido NO se cancela; el Cliente puede reintentar sobre la misma preferencia hasta el vencimiento) |
| cualquier otro (`pending`, `in_process`, `authorized`, `refunded`, `charged_back`, ...) | `yaHayPagoAprobado` | no hace nada |
| cualquier otro | si no | solo `registrarResultado` (`mp_estado` queda con el valor crudo); el pedido no cambia |

`approved` sobre el pedido:

| Pedido | Resultado |
|---|---|
| `PENDIENTE_PAGO` y Cliente `SUSPENDIDO` | `CANCELADO_POR_SISTEMA`, `cancelado_por = SISTEMA`, `pago_estado = PAGADO`, historial con motivo `SUSPENSION_CLIENTE`, nota de crédito `SUSPENSION_CLIENTE` por el total (P5.04) y aviso T11 |
| `PENDIENTE_PAGO` y comercio `SUSPENDIDO` | igual, sin motivo de timeout, nota `SUSPENSION_COMERCIO`, aviso T11 "comercio no disponible" |
| `PENDIENTE_PAGO` (caso normal) | `pago_estado = PAGADO`, `estado = PENDIENTE_CONFIRMACION_COMERCIO`, `fecha_pago_confirmado` = un solo instante (reloj único, truncado a segundos), turno asignado (`TurnoPedidoService.asignar`, Tramo de turnos), fila de historial actor `SISTEMA` con ese instante, aviso T1 al equipo y, como último paso, `CarritoService.vaciarSiEsDelComercio` (el carrito es la última hoja del orden de bloqueos) |
| no `PENDIENTE_PAGO` y `pago_estado != PAGADO` (vencido, cancelado por el Cliente, etc.) | alerta `PAGO_APROBADO_SOBRE_PEDIDO_CANCELADO` (idempotente) + `reembolsarPagoTardio`: nota por el total con motivo `SUSPENSION_CLIENTE`, `SUSPENSION_COMERCIO` o `PAGO_TARDIO` según el estado del Cliente y del comercio |
| no `PENDIENTE_PAGO` y `pago_estado = PAGADO` | nada (notificación repetida del mismo pago) |

**Verificación del split** (`verificarSplitAplicado`, solo con `approved` y nunca bloquea): compara la entrada `fee_details[type = "application_fee"].amount` con `cargo_servicio_cliente + cargo_servicio_comercio`, tolerancia `0,01`. Si coincide → `log.info`; si no → `log.warn` y alerta `SPLIT_NO_APLICADO` (con `monto_esperado` y `monto_capturado`). Se evalúa también en el caso de pago tardío.

### 4. Errores y base

| Código | Texto | Base |
|---|---|---|
| 401 | "Firma inválida" | nada |
| 409 | "No se pudo consultar el pago {id} en Mercado Pago: {statusText}" / "Mercado Pago no devolvió información del pago {id}" | nada |
| 409 | "El comercio de este pedido no tiene una cuenta de Mercado Pago vinculada. No se puede procesar el pago." | nada |
| 500 | `pedidoId` no numérico | nada |
| 200 | pedido sin pago asociado, o `external_reference` distinto | solo alerta (mismatch) o nada |

### 5. Pantallas

No hay pantalla del webhook ni de las alertas (`alerta_webhook_mp` sin controller ni endpoint de lectura: `AlertaWebhookMpRepository` solo lo usa `AlertaWebhookMpService`). El efecto visible es el estado del pedido (P5.02 §5).

### 6. Propiedades

`mercadopago.webhook-secret` (`MERCADOPAGO_WEBHOOK_SECRET`, vacía por defecto → se omite la firma); `MERCADOPAGO_API_BASE_URL`; `TOLERANCIA_SPLIT = 0.01`; `TIMEOUT_MP_MS = 5000`; `app.backend-base-url` (construye la `notification_url`).

### 7. Jobs

Ninguno propio. El pago aprobado que llega después del vencimiento convive con `expirarPagosVencidos` (60 s): si el job gana, el webhook entra por la rama "pago tardío".

### 8. Notificaciones emitidas en P5.03 y en el cobro (con P5.04 incluido)

Códigos T-xx según `diccionario-de-datos.md` §TipoNotificacion.

| Tipo (T-xx) | Cuándo | Destinatario | Canal | Texto literal | Entidad | Destino al tocarlo |
|---|---|---|---|---|---|---|
| `NUEVO_PEDIDO` (T1) | pago aprobado normal | Dueño y cada Empleado activo (copia por persona, sin el Cliente del pedido si es Empleado del comercio), con `comercio_id` | PUSH | "Pedido nuevo #{id} de {Nombre} {Apellido}." | PEDIDO | `comercio-pedido-detalle.html?id={id}`, "Ver pedido" |
| `PEDIDO_CANCELADO_SISTEMA` (T11) | pago aprobado con Cliente suspendido | Cliente | PUSH | "Tu pedido #{id} fue cancelado automáticamente: tu cuenta fue suspendida y estamos gestionando la devolución de tu pago." (sin la segunda parte si no hay devolución en gestión) | PEDIDO | `pedido-detalle.html?id={id}`, "Ver pedido" |
| `PEDIDO_CANCELADO_SISTEMA` (T11) | pago aprobado con comercio suspendido; también pedidos cancelados por suspensiones | Cliente | PUSH | "Cancelamos tu pedido #{id} porque el comercio no está disponible. Te devolvemos el dinero." | PEDIDO | ídem |
| `PEDIDO_CANCELADO_SISTEMA` (T11) | `expirarPagosVencidos` | Cliente | PUSH | "Tu pedido #{id} fue cancelado automáticamente: no se confirmó el pago a tiempo." | PEDIDO | ídem |
| pago tardío (`PAGO_TARDIO`) | webhook aprobado sobre pedido ya cancelado | nadie | — | **no se emite ningún aviso** al Cliente por el reembolso (solo alerta y nota); ver C-31 | — | — |

Observaciones: no se emite aviso por pago rechazado; el pedido solo cambia `pago_estado`. El único email de estos flujos no existe (T11 está documentado con email, ver D-44).

### 9. Comparación con la documentación

- `requisitos-funcionales-sistema.md` §"Webhook" coincide, incluido el reembolso inmediato ante un pago aprobado sobre un pedido `CANCELADO_POR_SISTEMA` (el código lo hace para cualquier pedido que ya no esté `PENDIENTE_PAGO`).
- `alcance-y-limitaciones.md` línea ~223 dice que el pago tardío "solo genera una alerta ... No se devuelve el dinero": contradice el código (D-47).
- Coincide en lo no implementado: la firma se omite sin secreto, no se verifica el monto, `pedidoId` no numérico da 500, no hay pantalla de alertas.

---

## P5.04 — Reembolso

### 1. Endpoints

No hay endpoint propio del reembolso: se dispara desde transiciones del pedido. Disparadores (todos llaman a `ReembolsoService.generarNotaYReembolsarTotal(pedido, motivo)` dentro de la transacción del cambio de estado, con el pedido ya bloqueado):

| Motivo (`MotivoNotaCredito`) | Disparador | Servicio y línea |
|---|---|---|
| `RECHAZO_COMERCIO` | el comercio rechaza (`PUT /pedidos/comercio/{id}/rechazar`) | `PedidoService.rechazarPedido` ~667 |
| `CANCELACION_CLIENTE` | el Cliente cancela un pedido ya pagado (`PUT /pedidos/cliente/{id}/cancelar`); un pedido `PENDIENTE_PAGO` se cancela sin nota | `cancelarPedido` ~858 |
| `ANULACION_COMERCIO` | el comercio anula en preparación | `anularPedido` ~890 |
| `EXPIRACION_SIN_RESPUESTA` | job `expirarPedidosSinRespuestaComercio` | ~1062 |
| `SUSPENSION_COMERCIO` | suspensión del comercio (pendientes, preparación, sin atención, pago aprobado sobre comercio suspendido) | ~1150, 1203, 1267, 1275, 315 |
| `SUSPENSION_CLIENTE` | pago aprobado con Cliente suspendido | ~310 |
| `PAGO_TARDIO` | webhook aprobado sobre pedido ya cancelado | `reembolsarPagoTardio` ~375 |
| `RECLAMO` | reclamo aprobado (total o parcial); usa `generarNotaDeReclamo`, ver Tramo de Reclamos | `ReembolsoService` ~109 |

El Administrador lo reintenta por P5.05. Un reembolso parcial por ítem no existe (solo el parcial de un reclamo).

### 2. Pasos (`B:services/ReembolsoService.java`, `NotaCreditoService.java`, `MercadoPagoReembolsoClient.java`)

**`generarNotaYReembolsarTotal`** (exige transacción activa con el pedido bloqueado; si no, `IllegalStateException`):
1. `prepararIntento`: `pago` del pedido `FOR UPDATE`. Sin `pago` o pago no reembolsable → `SIN_NOTA` (no hay nada que devolver; el pedido cambia de estado igual). Pago reembolsable = `mp_estado = "approved"` **y** `fecha_confirmacion` no nula **y** `id_transaccion_mp` no nulo.
2. Busca la cuenta activa del Dueño (lectura común). Si no hay: nota `PENDIENTE_REVISION_MANUAL` con `ultimo_error` "La cuenta de Mercado Pago del comercio está desvinculada: el reembolso no se intentó automáticamente"; si hay: nota `PENDIENTE`. Monto = `pago.monto` (reembolso total). Se inserta `nota_credito` (`pago_id`, `monto`, `motivo`, `estado`, `intentos = 0`, `mp_payment_id` = `pago.id_transaccion_mp`, `fecha_emision`).
3. `otrasNotasCubrenElPago`: lee las demás notas del pago con bloqueo después de insertar la propia; si ya cubren el monto completo (estados `PENDIENTE`, `PROCESADO`, `PENDIENTE_REINTENTO`, `PENDIENTE_REVISION_MANUAL`; `FALLIDO` no cuenta) borra la nota recién creada (no duplica) y devuelve que hay nota. Si no hay cuenta, termina aquí con la nota pendiente de revisión manual.
4. Con cuenta: registra con `EjecucionPostCommit.ejecutar` la llamada a MP; corre después del commit de la transacción más externa y solo si el commit ocurre (una transición que pierde una carrera nunca pide plata).
5. Devuelve `true` si el pedido tiene nota (recién creada o ya existente); eso decide el texto "devolución en gestión" en los avisos.

**Llamada a MP (`solicitarYRegistrar`, fuera de transacción):** clave de idempotencia `"nc-" + notaId + "-" + (intentos + 1)`. Si `monto < monto del pago` → `solicitarReembolsoParcial` (cuerpo `{"amount": monto}`), si no `solicitarReembolsoTotal` (cuerpo `{}`). `POST {api}/v1/payments/{paymentId}/refunds` con `Authorization: Bearer {access_token del Dueño}` y `X-Idempotency-Key`. Tiempos 5 s conexión y 5 s respuesta (Apache HttpClient). Nunca lanza: devuelve `ResultadoReembolsoMp`. Éxito = respuesta con `id` y `status` `approved` o `in_process`. Luego una transacción corta: éxito → `registrarReembolsoExitoso` (`PROCESADO`, `intentos + 1`, `refund_id_mp`, `ultimo_error = null`, `fecha_proceso`); fallo → `registrarReembolsoFallido` (`FALLIDO`, `intentos + 1`, `ultimo_error` recortado a 500, `fecha_fallido`). Si el registro del resultado falla, solo se loguea (`log.error`).

Resultados de error de MP (texto que queda en `ultimo_error`):
- "Mercado Pago no devolvió un id de reembolso"
- "Mercado Pago devolvió el reembolso {id} con status {status}"
- "Mercado Pago respondió {código}: {cuerpo recortado a 300}"; si el cuerpo coincide con `insufficient|not enough|enough funds|saldo|fondos|no_funds|not_enough_funds` se antepone "El comercio no tiene saldo suficiente en Mercado Pago para este reembolso. "
- "No se pudo contactar a Mercado Pago: {mensaje}"

**Cuenta desvinculada:** la nota nace `PENDIENTE_REVISION_MANUAL` y no se llama a MP. La retoma el Administrador cuando el Dueño vuelve a vincular una cuenta (P5.05).

### 3. Decisiones

| Rombo | Valores → destino |
|---|---|
| ¿pago aprobado y confirmado? | no → sin nota, pedido cambia de estado igual / sí → sigue |
| ¿cuenta activa del Dueño? | no → nota `PENDIENTE_REVISION_MANUAL` / sí → nota `PENDIENTE` + llamada post-commit |
| ¿otras notas ya cubren el total? | sí → se borra la nueva, sin llamada / no → sigue |
| ¿monto < pago? | sí (solo reclamo parcial) → cuerpo con `amount` / no → total |
| respuesta de MP | `approved`/`in_process` → `PROCESADO` / otro status, sin id, HTTP error, red → `FALLIDO` |

Estados de `nota_credito.estado` (`EstadoNotaCredito`): `PENDIENTE`, `PROCESADO`, `PENDIENTE_REINTENTO` (sin ninguna escritura en el código; solo se cuenta como cubierta y se traduce a `EN_PROCESO` para el Empleado), `FALLIDO`, `PENDIENTE_REVISION_MANUAL`. Nunca se llega a un estado de "fallido definitivo": un solo intento automático.

### 4. Errores

- Si la nota no se puede escribir, la transacción del pedido se revierte (el pedido no cambia de estado).
- Fallas de MP: no rompen nada; quedan en `nota_credito` (`FALLIDO`, `ultimo_error`).
- Excepciones inesperadas del reembolso post-commit: `log.error("Reembolso del pedidoId={} ({}) terminó con un error inesperado")`; la nota puede quedar `PENDIENTE` sin resultado (ver C-32).

### 5. Pantallas y textos (visibles para el Cliente, `F:js/pedidos.js`)

Solo en pedidos `RECHAZADO`, `CANCELADO`, `ANULADO`, `CANCELADO_POR_SISTEMA`, `EXPIRADO` y con `reembolsoEstado`:
- `PROCESADO`: "Te devolvimos {monto} a tu medio de pago."
- `FALLIDO` o `PENDIENTE_REVISION_MANUAL`: "No pudimos completar la devolución de tu pago automáticamente. La estamos revisando manualmente."
- resto (`PENDIENTE`, `PENDIENTE_REINTENTO`): "Estamos procesando la devolución de {monto}."

Otros textos: cancelar pedido pagado: hoja "¿Cancelar el pedido #{id}?" / "Ya lo pagaste. Si lo cancelás, te devolvemos los {total} a Mercado Pago. Puede demorar en verse en tu cuenta." / "Sí, cancelar pedido"; sin pagar: "Todavía no lo pagaste, así que no se te cobra nada."; toast de éxito "Pedido cancelado" (+ ". Estamos gestionando la devolución de tu pago." si hay `reembolsoEstado`). Cancelado: "Cancelaste este pedido. Estamos gestionando la devolución de tu pago." / "Cancelaste este pedido.". Suspensión del comercio: "El comercio no estaba disponible. Te devolvemos el dinero.". `NO_RETIRADO`: "... no hay devolución del pago.".
Comercio (`F:js/comercio.js` ~1144): "El cliente recibe la devolución de todo el pago por Mercado Pago. Puede demorar en verse en su cuenta.". El Dueño ve `reembolsoEstado` crudo; el Empleado ve `EstadoReembolsoEmpleado` (`SIN_REEMBOLSO`, `EN_PROCESO`, `REEMBOLSADO`, `EN_REVISION`, mapeo `PENDIENTE`/`PENDIENTE_REINTENTO` → `EN_PROCESO`, `FALLIDO`/`PENDIENTE_REVISION_MANUAL` → `EN_REVISION`).
`PedidoResponseDTO` lleva `reembolsoEstado`, `reembolsoMonto`, `reembolsoMotivo` de la última nota que no sea de reclamo.

### 6. Propiedades

`TIMEOUT_MP_MS = 5000` (cliente de reembolsos), `LARGO_MAXIMO_CUERPO_ERROR = 300`, `LARGO_MAXIMO_ERROR = 500`, `MERCADOPAGO_API_BASE_URL`. Sin propiedades de reintentos ni de máximo de intentos.

### 7. Jobs

Ninguno de reembolsos. `PENDIENTE_REINTENTO` no tiene emisor ni job (D-41). El único reintento es manual (P5.05).

### 8. Notificaciones del reembolso

Los reembolsos no emiten aviso propio: el aviso lo emite la transición (P5.03 §8 y ver abajo). Textos de las transiciones que reembolsan (todos PUSH al Cliente, entidad PEDIDO, destino `pedido-detalle.html?id=`):

| Tipo (T-xx) | Texto literal |
|---|---|
| `PEDIDO_RECHAZADO` (T3) | "Tu pedido #{id} a {Comercio} fue rechazado por el comercio. Motivo: {etiqueta}." + (" Estamos gestionando la devolución de tu pago." si hay nota) + (" {comentario}" si lo hay) |
| `PEDIDO_ANULADO_COMERCIO` (T10) | "Tu pedido #{id} a {Comercio} fue anulado por el comercio" + (" y estamos gestionando la devolución de tu pago") + ". Motivo: {motivo}" |
| `PEDIDO_EXPIRADO_CLIENTE` (T12) | "El comercio no respondió en {30} minutos tu pedido #{id}. Se canceló y estamos gestionando la devolución de tu pago; podés ver su estado en el detalle del pedido." |
| `PEDIDO_EXPIRADO_COMERCIO` (T13) | al equipo: "El pedido #{id} se canceló porque nadie lo respondió a tiempo." (destino `comercio-pedido-detalle.html?id=`) |
| `PEDIDO_CANCELADO_CLIENTE` (T9) | al equipo: "El cliente canceló el pedido #{id}." (solo si el pedido ya estaba pagado) |
| `RECLAMO_APROBADO` (T20), `RECLAMO_RECHAZADO` (T21) | ver `AvisoReclamoService`: "Aprobamos tu reclamo del pedido #{id} y te vamos a devolver {monto}. El reembolso puede tardar unos días en acreditarse." / "Revisamos tu reclamo del pedido #{id} y no pudimos aprobarlo. Motivo: {motivo}"; ambos con email (un intento) |
| `RECLAMO_REEMBOLSO_DUENO` (sin T-xx en el diccionario) | al Dueño con `comercio_id`: "Reembolsamos {monto} al Cliente por un reclamo del pedido #{id}." |

La cancelación del Cliente no le avisa al propio Cliente (solo toast); ver C-31.

### 9. Comparación con la documentación

Ver D-41 (job de reintento y máximo de 5 intentos), D-42 (T27), D-48 (`NotaCredito` en el diccionario dice que `CANCELADO`/`ANULADO` están pendientes con TODO) y D-49 (sección 7 del documento de concurrencia).

---

## P5.05 — Reintento manual del reembolso por el Administrador

### 1. Endpoints (`B:controllers/AdministradorController.java` ~272–285, `B:services/NotaCreditoAdminService.java`)

Rol Administrador (`/api/v1/administrador/**`), sin `X-Comercio-Id`.

| Método y ruta | Respuesta |
|---|---|
| `GET /api/v1/administrador/reembolsos` | `200` "Reembolsos pendientes de revisión obtenidos correctamente", lista de `NotaCreditoAdminResponseDTO {id, codigo, pedidoId, nombreCliente, nombreComercio, monto, fechaEmision, motivo, estado, ultimoError, intentos}` con las notas `PENDIENTE_REVISION_MANUAL` y `FALLIDO`, de la más nueva a la más vieja por `fecha_emision`. `codigo` se deriva: `NC-{año}-{id con 5 dígitos}` |
| `POST /api/v1/administrador/reembolsos/{notaCreditoId}/reintentar` | `200` siempre que la corrida termine: mensaje "Reembolso procesado correctamente" si la nota queda `PROCESADO`, "Mercado Pago rechazó el reintento del reembolso" si no; `data` = la nota actualizada |

### 2. Pasos (`ReembolsoService.reintentarNotaCredito`)

1. Transacción: nota `FOR UPDATE` (`obtenerParaActualizar`), después `pago` `FOR UPDATE` (orden nota → pago, distinto del de P5.04; ver C-33).
2. Valida: estado de la nota `PENDIENTE_REVISION_MANUAL` o `FALLIDO`; pago reembolsable; que `montoCubiertoExcluyendo(pago, nota) + nota.monto ≤ pago.monto`; cuenta activa del Dueño.
3. `marcarEnProceso`: pone la nota en `PENDIENTE` (sin incrementar `intentos`) antes de llamar a MP. Calcula `numeroIntento = intentos + 1` para la clave `nc-{id}-{n}`.
4. Fuera de la transacción: `solicitarYRegistrar` en el hilo de la request (sincrónico, hasta ~5 s de conexión y 5 s de lectura): mismo cliente y mismo registro de resultado que P5.04.
5. La respuesta relee la nota y devuelve su estado (`PROCESADO` o `FALLIDO`).

### 3. Decisiones

| Rombo | Valores → destino |
|---|---|
| estado de la nota | `PENDIENTE_REVISION_MANUAL`, `FALLIDO` → sigue / `PROCESADO` → 409 "Este reembolso ya se procesó" / `PENDIENTE` o `PENDIENTE_REINTENTO` → 409 "Este reembolso ya está en proceso o ya no requiere revisión" |
| ¿pago reembolsable? | no → 409 |
| ¿otro reembolso ya cubre el pago? | sí → 409 |
| ¿Dueño con cuenta activa? | no → 409 |
| resultado de MP | éxito → `PROCESADO` / error → `FALLIDO` (200 con "Mercado Pago rechazó el reintento del reembolso") |

### 4. Errores

| Código | Texto literal | Base |
|---|---|---|
| 404 | "Nota de crédito no encontrada" | nada |
| 404 | "El pedido de la nota de crédito no tiene ningún pago asociado" | nada |
| 409 | "Este reembolso ya se procesó" | nada |
| 409 | "Este reembolso ya está en proceso o ya no requiere revisión" | nada |
| 409 | "El pago del pedido no está aprobado en Mercado Pago: no hay nada que reembolsar" | nada |
| 409 | "El pago ya tiene otro reembolso registrado: reintentar este duplicaría la devolución" | nada |
| 409 | "La cuenta de Mercado Pago del comercio sigue desvinculada. El comercio tiene que volver a vincularla para poder reintentar el reembolso" | nada |
| 200 con error | MP falla | nota `FALLIDO`, `intentos + 1`, `ultimo_error` actualizado |

### 5. Pantalla (`F:admin-reembolsos.html`, `F:js/admin.js` ~1899–2053)

Título del encabezado "Reembolsos"; tabla con columnas "Reembolso", "Pedido", "Cliente", "Comercio", "Monto", "Fecha", "Motivo" y acción. Chips de filtro: "Todos", "Revisión manual", "Fallidos". Cada fila: código (`NC-AAAA-00001`), estado "Revisión manual" o "Fallido" (otro valor: "Estado no disponible"), "Pedido #{id}", Cliente, Comercio, Monto, Fecha, Motivo (`Rechazo del comercio`, `Cancelación del cliente`, `Anulación del comercio`, `Suspensión del comercio`, `Sin respuesta del comercio`, `Suspensión de cuenta`, `Pago tardío`, `Reclamo`; sin valor: "—"), `ultimoError` en rojo si existe, botón "Reintentar reembolso" ("Reintentando...").
Tras reintentar: éxito → toast "Reembolso procesado correctamente" y recarga la lista; MP rechaza → toast "Mercado Pago rechazó el reintento del reembolso" (error) y recarga (la nota sigue como "Fallido" con el nuevo error); `ApiError`: el mensaje del servidor queda inline bajo la fila y, si el código fue 409, además toast "No se pudo reintentar el reembolso" (error). Estado vacío: "No hay reembolsos pendientes de revisión" (`estado-vacio`). Desde Reclamos: enlace "Ir a Reembolsos para reintentar" (`admin-reembolsos.html`, sin parámetros).
Navegación: ítem "Reembolsos" de la barra lateral del Administrador con insignia de cantidad (sondeo de 15000 ms, `INTERVALO_INSIGNIAS_MS` en `admin-shell.js`); tarjeta del panel con subtítulo "Revisión manual", "Sin reembolsos para revisar" o "N para revisar" (sondeo del panel de 30000 ms, `INTERVALO_PANEL_ADMIN_MS` en `admin.js`).

### 6. Propiedades

Las de P5.04. Sin límite de reintentos manuales.

### 7. Jobs

Ninguno.

### 8. Notificaciones

El reintento no emite ninguna. `REEMBOLSO_FALLIDO_DEFINITIVO` (T27) no tiene emisor (D-42).

### 9. Comparación con la documentación

El diccionario (`NotaCredito.fecha_fallido`) y `requisitos-funcionales-sistema.md` describen: máximo 5 intentos automáticos, job periódico de `PENDIENTE_REINTENTO` y T27 al Administrador con email. Nada de eso existe (D-41, D-42).

---

## P6.01 — Emisión de notificaciones

### 1. Endpoints

No hay endpoint de emisión: la emiten los servicios de negocio dentro de sus transacciones.

### 2. Pasos (`B:services/NotificacionService.java`)

Servicio `@Transactional` de clase. Tabla `notificacion` (`usuario_id`, `tipo`, `mensaje` (varchar 500, se trunca), `leida`, `fecha_creacion` (reloj único), `canal`, `estado`, `fecha_envio`, `entidad_tipo`, `entidad_id`, `comercio_id` sin FK desde V33). Caminos de creación (cada uno llama a `exigirAudiencia` y lanza `IllegalArgumentException` si el tipo no corresponde):

| Método | Audiencia aceptada | Destinatarios | `comercio_id` |
|---|---|---|---|
| `crearParaCliente` | `CLIENTE`, `CLIENTE_O_DUENO` | una fila para el usuario | `null` |
| `crearParaDueno` | `DUENO`, `CLIENTE_O_DUENO` | una fila para el Dueño | el comercio |
| `crearParaEquipo` | `EQUIPO` | una copia por Dueño y por cada Empleado destinatario, en id ascendente (`TreeSet`), `saveAll` | el comercio |
| `crearParaEmpleados` | `EMPLEADOS` | una copia por Empleado, sin el Dueño | el comercio |
| `registrarEmailEnviado` | — | fila `canal = EMAIL`, `estado = ENVIADO`, `fecha_envio = fecha` (significa "se intentó"; lo usa el aviso de regularización de invitaciones) | — |
| `registrarResultadoEmail` | — | fila `EMAIL` con `ENVIADO` o `FALLIDO` según `salio`; `fecha_envio` solo si salió; con o sin `comercio_id` | opcional |
| `marcarResultadoEmail` | — | actualiza una fila `EMAIL` (reenvío desde el listado de cuentas) | — |

Quien llama ya tomó los bloqueos (usuarios y relaciones antes del pedido): `PedidoService.bloquearParaActualizarConEquipo` / `bloquearParaPago` resuelven el equipo (Empleados `ACTIVO` del comercio, sin el Cliente del pedido). Un administrador **no tiene** camino de creación (no existe `crearParaAdministrador`).

**Audiencia por tipo** (`TipoNotificacion`, 41 valores): `EQUIPO`: `NUEVO_PEDIDO`, `PEDIDO_CANCELADO_CLIENTE`, `PEDIDO_EXPIRADO_COMERCIO`, `PEDIDO_AUTOCONFIRMADO_COMERCIO`; `DUENO`: `COMERCIO_APROBADO`, `COMERCIO_RECHAZADO`, `COMERCIO_SUSPENDIDO`, `COMERCIO_INACTIVADO`, `INVITACION_EMPLEADO`, `DOCUMENTO_APROBADO`, `DOCUMENTO_RECHAZADO`, `COMERCIO_APTO_VENTA`, `COMERCIO_SIN_APTITUD`, `DUENO_SUSPENDIDO`, `DUENO_SUSPENSION_LEVANTADA`, `RECLAMO_REEMBOLSO_DUENO`; `EMPLEADOS`: `COMERCIO_SUSPENDIDO_EQUIPO`, `COMERCIO_SUSPENSION_LEVANTADA_EQUIPO`; `CLIENTE_O_DUENO`: `SUSPENSION_LEVANTADA`, `EMPLEADO_DESACTIVADO`, `EMPLEADO_REACTIVADO`; `ADMINISTRADOR`: `NUEVO_COMERCIO_PENDIENTE`, `NUEVA_RESOLICITUD_COMERCIO`, `NUEVO_RECLAMO`, `NUEVO_MENSAJE_SOPORTE`, `REEMBOLSO_FALLIDO_DEFINITIVO`; `CLIENTE`: el resto.

**Tipos sin emisor en el código** (grep, solo aparecen en el enum): `NUEVO_COMERCIO_PENDIENTE` (T17), `NUEVA_RESOLICITUD_COMERCIO` (T18), `NUEVO_RECLAMO` (T19), `NUEVO_MENSAJE_SOPORTE` (T22), `REEMBOLSO_FALLIDO_DEFINITIVO` (T27), `PEDIDO_CERRADO_TIMER_SUSPENSION` (T26).

**Emails y canal.** `EmailService` (Resend, `com.resend:resend-java`, un solo intento, sin reintentos; `email.envio-habilitado` `true`, `false` en `test`; remitente `${MAIL_FROM}`; clave `resend.api-key` leída por `MailConfig`) envía en el código leído:
- verificación de cuenta, recuperación de contraseña, reactivación (6 dígitos; sin rastro en `notificacion`),
- invitación de Empleado y aviso de regularización (este último con fila `EMAIL` por `registrarEmailEnviado`; tope de 3 por día),
- resumen de turno (con reintentos propios, Tramo T4),
- cuenta suspendida, cuenta inactivada, suspensión levantada, Dueño suspendido/levantado, comercio suspendido/levantado (rastro `EMAIL` con `ENVIADO` o `FALLIDO`, `AvisoCuentaService.enviarYRegistrar`),
- reclamo resuelto (`enviarReclamoResuelto`, rastro `EMAIL` con `registrarResultadoEmail`),
- Soporte (tres emails, sin rastro en `notificacion`).
Los emails de aviso salen **después del commit** (`EjecucionPostCommit.ejecutar`): nunca dentro de la transacción. Un fallo de email no deshace nada.
**No hay email** para: pedidos (T1 a T13 y T36, incluido T11), reembolsos, pagos, T14, T15 (ver D-44 y D-45), `RECLAMO_REEMBOLSO_DUENO` ni los avisos in-app de T25 (el email de T24 los nombra dentro de un solo mensaje; ver D-46).

### 3. Decisiones

| Rombo | Valores → destino |
|---|---|
| audiencia del tipo vs camino | no coincide → `IllegalArgumentException` (se detecta en tests, no en producción) |
| ¿destinatario del equipo? | Dueño siempre; Empleados con relación `ACTIVO` resuelta con bloqueo; el Cliente del pedido, si es Empleado del comercio, se excluye |
| ¿envío de email? | `email.envio-habilitado=false` → no envía y devuelve `deshabilitado()` / `true` → Resend |
| resultado del email | `ENVIADO` o `FALLIDO` en la fila `EMAIL`; un Administrador puede reenviar los fallidos de cuenta |

### 4. Errores

Una excepción al crear una notificación dentro de una transacción de negocio la revierte (la notificación y el cambio van juntos). Un error de Resend se traga y queda `FALLIDO`; el `log.warn` de `EmailService` no incluye datos del destinatario en los emails de Soporte.

### 5. Pantallas

No hay pantalla de emisión. Visibilidad: ver P6.02.

### 6. Propiedades

| Propiedad | Valor |
|---|---|
| `email.envio-habilitado` | `true` (en `application-test.properties`: `false`) |
| `mail.from` | `${MAIL_FROM:}` |
| `resend.api-key` | (NO RELEVADO su definición en `application*.properties`; `MailConfig` la lee sin valor por defecto) |
| `NotificacionService.LIMITE_POR_DEFECTO` / `LIMITE_MAXIMO` | 20 / 50 |
| mensaje de notificación | máximo 500 caracteres (truncado) |

### 7. Jobs

Ninguno de notificaciones. Hay procesos de pedidos que emiten avisos (P5.03 §7).

### 8. Notificaciones emitidas

Para no repetir tramos anteriores, solo se listan las de estos flujos (P5 y reclamos): ver las tablas de P5.01 §8, P5.03 §8 y P5.04 §8. Otras con T-xx y texto leídos en esta pasada:

| Tipo (T-xx) | Destinatario | Canal | Texto literal | Entidad |
|---|---|---|---|---|
| `PEDIDO_ACEPTADO` (T2) | Cliente | PUSH | "Tu pedido a {Comercio} fue aceptado y está en preparación." | PEDIDO |
| `PEDIDO_EN_CAMINO` (T5) | Cliente | PUSH | "Tu pedido de {Comercio} fue despachado y está en camino." | PEDIDO |
| `PEDIDO_LISTO_RETIRO` (T6) | Cliente | PUSH | "Tu pedido de {Comercio} está listo para retirar en el local." | PEDIDO |
| `AVISO_75MIN_SIN_CONFIRMACION` (T7) | Cliente | PUSH | "Tu pedido #{id} sigue en camino. Si ya lo recibiste, confirmalo para cerrarlo." | PEDIDO |
| `PEDIDO_AUTOCONFIRMADO` (T8) | Cliente | PUSH | "Marcamos tu pedido #{id} como entregado. Si tuviste algún problema, podés reclamar dentro de los 7 días desde esta fecha." | PEDIDO |
| `PEDIDO_AUTOCONFIRMADO_COMERCIO` (T30) | equipo | PUSH | "El pedido #{id} se confirmó automáticamente como entregado porque el cliente no respondió en {90} minutos." | PEDIDO |
| `PEDIDO_NO_RETIRADO` (T36) | Cliente | PUSH | "Tu pedido #{id} no fue retirado y el comercio lo cerró. Como ya estaba preparado, no hay devolución del pago." | PEDIDO |
| `PRODUCTO_REMOVIDO_CARRITO` (T23) | Cliente | PUSH | "El producto '{nombre}' ya no está disponible y fue eliminado de tu carrito." | sin entidad (destino `carrito.html`, "Ver carrito") |
| `COMERCIO_APROBADO` (T14) | Dueño | PUSH | "Tu comercio {X} fue aprobado" / "Tu comercio {X} fue aprobado y ya podés vender" | COMERCIO |
| `COMERCIO_RECHAZADO` (T15) | Dueño | PUSH | "Tu comercio {X} fue rechazado. Motivo: {motivo}. Corregilo y volvé a solicitarlo." / "Tu comercio {X} fue rechazado de forma definitiva. Motivo: {motivo}" | COMERCIO |
| `CLIENTE_SUSPENDIDO` (T28) | Cliente | PUSH + rastro EMAIL | "Tu cuenta fue suspendida. Motivo: {motivo}" | sin entidad |
| `SUSPENSION_LEVANTADA` (T29) | Cliente | PUSH + EMAIL | "Levantamos la suspensión de tu cuenta." + (" Mensaje del equipo: {motivo}") | sin entidad |
| `CUENTA_INACTIVADA` (T24) | Cliente | PUSH + EMAIL | "Tu cuenta quedó inactiva por falta de uso." | sin entidad |
| `COMERCIO_INACTIVADO` (T25) | Dueño | PUSH | "Tu comercio '{nombre}' dejó de estar disponible porque tu cuenta quedó inactiva." | COMERCIO |
| `COMERCIO_SUSPENDIDO` (T16) por suspensión del Dueño | Dueño | PUSH | "Tu cuenta fue suspendida y tu comercio '{nombre}' quedó suspendido. Motivo: {motivo}" | COMERCIO |

### 9. Comparación con la documentación

Ver D-43 a D-46 y D-51.

---

## P6.02 — Consulta y lectura de notificaciones

### 1. Endpoints (`B:controllers/NotificacionController.java`)

Base `/api/v1/notificaciones`. Seguridad: `authenticated()` (cualquier rol); solo `PUT /comercio/**` exige `hasRole("DUENO")`.

| Método y ruta | Rol | `X-Comercio-Id` | Respuesta |
|---|---|---|---|
| `GET /notificaciones?limite=&cursor=` | Cliente, Dueño, Empleado (Cliente con header), Administrador | Dueño: obligatorio. Cliente: opcional (con header se trata como Empleado de ese comercio). Administrador: se ignora | `200` "Notificaciones obtenidas correctamente", `data` = arreglo `{id, mensaje, leida, fechaCreacion, entidadTipo, entidadId, tipo}`; si hay otra página, cabecera `X-Siguiente-Cursor` (formato `{fecha ISO}_{id}`) |
| `GET /notificaciones/no-leidas/contador` | ídem | ídem | `200` "Contador de notificaciones no leídas obtenido correctamente", `data` = número |
| `PUT /notificaciones/{id}/leida` | cualquier usuario autenticado, solo las propias | no | `200` "Notificación marcada como leída", `data` = la notificación |
| `PUT /notificaciones/leidas` | Dueño y Empleado activo | obligatorio | `200` "Notificaciones del comercio marcadas como leídas", `data` = cantidad marcada |
| `PUT /notificaciones/personales/leidas` | cualquier usuario | no | `200` "Notificaciones personales marcadas como leídas", `data` = cantidad |
| `PUT /notificaciones/comercio/{comercioId}/leidas` | solo Dueño | no (el comercio va en la ruta) | `200` "Notificaciones del comercio marcadas como leídas", `data` = cantidad; `404` "Comercio no encontrado" si no es suyo |

### 2. Pasos (`NotificacionService`)

- **Listar:** `limite` por defecto 20, tope 50; `limite < 1` → `400` "El límite tiene que ser de al menos 1". Cursor `{LocalDateTime}_{id}`; un cursor mal formado → `400` "El cursor no es válido". Pide `limite + 1` filas ordenadas por `(fecha_creacion desc, id desc)` para saber si hay otra página. `ComercioActivoService.resolverSiCorresponde(usuario, header)` decide: con comercio (Dueño siempre; Cliente con header) → `findByUsuarioIdAndComercioId`; sin comercio → `findPersonalesPushByUsuarioId` (solo `comercio_id IS NULL` y `canal = PUSH`; el Administrador cae acá). Las filas `EMAIL` nunca salen en la campana.
- **Contar:** `countNoLeidasByUsuarioIdAndComercioId` o `countPersonalesPushNoLeidasByUsuarioId`.
- **Marcar una:** `404` "Notificación no encontrada" si no existe o no es del usuario; si lleva `comercio_id`, exige además que siga siendo Dueño de ese comercio o su Empleado `ACTIVO` con comercio accesible (si no, el mismo `404`).
- **Marcar todas (comercio / personales / por ruta):** lee los ids no leídos y los actualiza por clave primaria en lotes de 500 (`LOTE_MARCADO`), idempotente (repetir devuelve 0).
- **Contador del comercio en el frontend:** no usa el endpoint del contador: viene dentro de `GET /comercios/mis-comercios` (Dueño) o `GET /empleados/mis-comercios` (Empleado) como `cantidadNotificacionesNoLeidas` por comercio.

### 3. Decisiones

| Rombo | Valores → destino |
|---|---|
| ¿hay comercio abierto? | Dueño → siempre; Cliente con `X-Comercio-Id` → como Empleado (`404` `COMERCIO_NO_DISPONIBLE` si no tiene relación `ACTIVO`; `400` si no es numérico); sin header → personales |
| ¿`siguienteCursor`? | sí → "Ver más" / no → sin pie |
| ¿aviso con `comercio_id` y sin acceso? | `404` |

### 4. Errores

`400` "El límite tiene que ser de al menos 1" / "El cursor no es válido"; `400` si falta `X-Comercio-Id` para el Dueño (texto neutro del resolver, no leído); `404` "Notificación no encontrada"; `404` "Comercio no encontrado"; `404` `COMERCIO_NO_DISPONIBLE` (Empleado sin acceso).

### 5. Pantalla y textos (`F:notificaciones.html`, `F:js/notificaciones.js`, `F:js/destino-aviso.js`)

Acceso: solo roles `CLIENTE` y `DUENO` (`initNotificaciones` redirige a `login.html` si el rol es otro, o sea el Administrador **no tiene pantalla de avisos**). Un Cliente resuelve primero el contexto de la pestaña (`resolverContextoDeLaPestania`); sin contexto va a `seleccionar-contexto.html`; en contexto Empleado muestra los avisos de ese comercio.
- Título de la barra: "Notificaciones"; botón "Marcar todas" (`btn-marcar-todas-leidas`; deshabilitado si no hay sin leer; en contexto Cliente se oculta si no hay; en contextos de comercio queda visible); volver a `comercio-dashboard.html` (comercio) o `index.html` (Cliente).
- Estado vacío: "Todavía no tenés notificaciones" / Cliente: "Te vamos a avisar acá cuando haya novedades sobre tus pedidos." / comercio: "Te vamos a avisar acá cuando haya novedades en este comercio.".
- Lista tipo tabla: cabecera "Aviso", "Fecha", "Estado"; cada fila con texto, fecha ("{d MMM yyyy}, HH:mm" en `es-AR`), estado "Leído" / "Sin leer" (más texto de lector de pantalla "No leída. "), etiqueta de destino y chevron si hay enlace.
- Esqueleto de carga ("avisos"); error de carga: "No pudimos cargar tus avisos."; paginación: botón "Ver más" ("Cargando…"), error "No pudimos cargar más avisos." con botón "Reintentar".
- "Marcar todas": toast "Marcaste todos los avisos como leídos"; error "No pudimos marcar las notificaciones como leídas" (error). Cliente: `PUT /notificaciones/personales/leidas`; comercio: `PUT /notificaciones/leidas`.
- Tocar una notificación: con destino navega (marca como leída antes con un tope de 1500 ms `TOPE_MARCA_ANTES_DE_NAVEGAR_MS`; con Ctrl/Cmd/Shift/Alt o botón distinto marca sin navegar); sin destino pero no leída, marca como leída y reemplaza el elemento.

**Destinos por tipo (`destinoDeAviso`, `ROL_AVISO` = `CLIENTE`, `DUENO`, `EMPLEADO`):**
- Cualquier tipo con `entidadTipo = PEDIDO` y `entidadId` entero → `pedido-detalle.html?id={id}` (Cliente) o `comercio-pedido-detalle.html?id={id}` (Dueño y Empleado); texto "Ver pedido", o "Ver reclamo" para `RECLAMO_APROBADO`, `RECLAMO_RECHAZADO`, `RECLAMO_REEMBOLSO_DUENO`.
- Dueño: `COMERCIO_APROBADO`, `COMERCIO_SUSPENDIDO`, `SUSPENSION_LEVANTADA` → `comercio-dashboard.html` "Ver panel"; `COMERCIO_APTO_VENTA` → "Ir al panel"; `COMERCIO_SIN_APTITUD` → "Ver qué falta"; `DOCUMENTO_APROBADO`/`DOCUMENTO_RECHAZADO` → `comercio-documentacion.html` "Ver documentación"; `INVITACION_EMPLEADO`/`EMPLEADO_DESACTIVADO` → `comercio-perfil.html?vista=equipo` "Ver equipo"; `COMERCIO_RECHAZADO` con `entidadId` → `comercio-rechazo-definitivo.html?id=` / `comercio-rechazado.html?id=` ("Ver comercio") o `comercio-dashboard.html` ("Ver panel") según el estado del comercio en memoria.
- Empleado: `COMERCIO_SUSPENDIDO_EQUIPO`, `COMERCIO_SUSPENSION_LEVANTADA_EQUIPO` → `comercio-dashboard.html` "Ver panel".
- Cliente: `EMPLEADO_REACTIVADO` → `seleccionar-contexto.html` "Cambiar de cuenta"; `PRODUCTO_REMOVIDO_CARRITO` → `carrito.html` "Ver carrito".
- El resto no tiene destino (se marca leído al tocar). No hay destino para `CLIENTE_SUSPENDIDO`, `CUENTA_INACTIVADA`, `COMERCIO_INACTIVADO`, `DUENO_SUSPENDIDO`, etc.

### 6. Propiedades y constantes del frontend

| Constante | Valor | Archivo |
|---|---|---|
| `POLLING_INTERVAL_MS` | **15000** | `F:js/notificaciones.js:11` |
| `TOPE_MARCA_ANTES_DE_NAVEGAR_MS` | 1500 | ídem |
| `HEADER_SIGUIENTE_CURSOR` | `X-Siguiente-Cursor` | ídem |
| `INTERVALO_AVISOS_MS` (campana y menú del Cliente) | 15000 | `F:js/cliente-escritorio.js:13` |
| `INTERVALO_CAMPANA_CLIENTE_MS` | 15000 | `F:js/catalogo.js:16` (uso no leído) |
| `INTERVALO_POLLING_COMERCIOS_MS` (contadores del Dueño/Empleado vía `mis-comercios`, y pérdida de acceso) | 15000 | `F:js/comercio-activo.js:17` |
| `INTERVALO_INSIGNIAS_MS` (Administrador) / `INTERVALO_PANEL_ADMIN_MS` | 15000 / 30000 | `F:js/admin-shell.js`, `F:js/admin.js` |
| `REQUEST_TIMEOUT_MS` | 15000 | `F:js/api.js:29` |

Backend: `LIMITE_POR_DEFECTO = 20`, `LIMITE_MAXIMO = 50`, `LOTE_MARCADO = 500`, `X-Siguiente-Cursor`.

### 7. Polling, `visibilitychange` y otros automatismos

- `notificaciones.js`: `setInterval` cada 15000 ms que solo corre si `document.visibilityState !== 'hidden'` y pide la primera página en segundo plano (`segundoPlano: true`, sin pantallas de error); además un oyente de `visibilitychange` que recarga al volver a verse; se limpia en `beforeunload`. La primera página se fusiona con lo ya cargado (`fusionarPrimeraPagina`) para no perder las páginas más viejas; el repintado solo ocurre si cambia la firma (ids, leídos, cursor).
- Campana del Cliente: cada 15000 ms si `!document.hidden`; se refresca al marcar (`refrescarAvisosCliente`).
- Dueño y Empleado: un solo sondeo a `mis-comercios` cada 15000 ms alimenta campana, punto de la franja y contadores (`comercio-activo.js`, `iniciarPollingComercios`), con `vigilarAvisos(...)` (`F:js/sonido-avisos.js`, NO RELEVADO) para el sonido.

### 8. Notificaciones

Ver P6.01 §8 y las tablas de P5.

### 9. Comparación con la documentación

El requisito de "polling cada 15 segundos" coincide. Los endpoints `PUT /notificaciones/personales/leidas` y el botón "Marcar todas" del Cliente no figuran en `requisitos-funcionales-*.md` (búsqueda de "personales/leidas" y "Marcar todas": 0 coincidencias; solo en documentos de auditoría y `DECISIONES.md`): D-52.

---

## Sesión expirada y 401/403 (cierre de lo no relevado en tramos anteriores)

`F:js/api.js` (centralizado; `F:js/auth.js` solo lo consume):
- `401` con token y `handle401Globally` (por defecto `true`) → `clearSesion()` + modal **"Sesión cerrada" / "Tu sesión terminó. Iniciá sesión de nuevo." / botón "Ir al inicio de sesión"** (`Escape` también lleva al login; `Tab` queda en el botón); `redirectTo('login.html')`.
- `401` o `409` con `data.codigo = CUENTA_SUSPENDIDA` → `mostrarPantallaCuentaSuspendida` (motivo; "Cerrar sesión" borra la sesión y va a `login.html`).
- `403` con token → `redirectTo('errores/acceso-denegado.html')`.
- `404` con `X-Comercio-Id` en contexto Empleado y `data.codigo = COMERCIO_NO_DISPONIBLE` → `perderAccesoAlComercio()`.
- `5xx` según `modo5xx`: `redirigir` → `errores/500.html`; `silencioso` y `aviso` para segundo plano.
- Red o tiempo (15 s): `redirigir` → `errores/timeout.html` (si `AbortError`) o `errores/sin-conexion.html`; las lecturas `GET` se reintentan una vez tras una pausa; con `noIdempotente` el timeout muestra un aviso con enlace en vez de redirigir (el checkout lo usa en `POST /pedidos/cliente`: "Mis pedidos" → `pedidos.html`).
- `mostrarModalCuentaBloqueada()`: "Cuenta bloqueada" / "Tu contraseña fue ingresada incorrectamente varias veces y tu cuenta fue bloqueada por seguridad. Para volver a ingresar, recuperá tu contraseña.".
- `auth.js` `resolverHomePorRol`: `CLIENTE` → `comercio-dashboard.html` si el contexto guardado es Empleado, si no `index.html`; `ADMINISTRADOR` → `admin-dashboard.html`; Dueño → comercio activo resuelto (`destinoDeNavegacion`: dashboard o pantalla de estado; `null` si no hay comercios operativos ni pendientes). Login con `409` de `CUENTA_SUSPENDIDA` o `CUENTA_INACTIVA` abre sus pantallas propias (ya relevado en tramos de S1/S6).
- `FE/direcciones.js` y `DireccionClienteService`: no intervienen en P5/P6 (el cobro no lee direcciones; la copia de la dirección se hace al crear el pedido, Fase 3). NO RELEVADO en este tramo.

---

## Desvíos (código ≠ documentación) — D-41 en adelante

- **D-41. Reintento automático de reembolsos y máximo de 5 intentos.** `requisitos-funcionales-sistema.md` ("Gestión de Reembolsos": job que reintenta `PENDIENTE_REINTENTO`) y `diccionario-de-datos.md` (`NotaCredito.intentos`: "Diseño: máximo 5 con job de reintentos (pendiente)") describen un reintento automático. Código: no existe job, un solo intento (`solicitarYRegistrar`) y `PENDIENTE_REINTENTO` no se escribe en ningún lado; solo se cuenta como "cubierta" (`NotaCreditoService` ~30) y se traduce a `EN_PROCESO` para el Empleado. El único reintento es el manual del Administrador (P5.05). (`diccionario` ya lo marca como pendiente; `requisitos-funcionales-sistema.md` lo presenta como requisito sin aclarar que falta.)
- **D-42. T27 `REEMBOLSO_FALLIDO_DEFINITIVO` no se emite.** Documentado (requisitos, diccionario `fecha_fallido`) como notificación al Administrador, Push + Email, a los 5 intentos. Código: el tipo existe en el enum y en el ENUM de la base, sin ningún emisor; el Administrador solo ve las notas `FALLIDO` / `PENDIENTE_REVISION_MANUAL` en la pantalla de reembolsos y la insignia del menú.
- **D-43. T17, T18, T19 y T22 no se emiten y el Administrador no tiene pantalla de avisos.** `requisitos-funcionales-sistema.md` los lista como Push + Panel al Administrador (T18 aclara que no se notifica). El código define las audiencias `ADMINISTRADOR` pero ningún servicio las crea (no existe `crearParaAdministrador`) y `initNotificaciones` redirige al login para el rol `ADMINISTRADOR`. El diccionario ya dice "hoy no se emiten"; `requisitos-funcionales-sistema.md` no.
- **D-44. T11 sin email.** `requisitos-funcionales-sistema.md` y el diccionario dan a `PEDIDO_CANCELADO_SISTEMA` canal "Push + Email". Código: solo `crearParaCliente` (PUSH); `EmailService` no tiene método para pedidos.
- **D-45. T14 y T15 sin email.** Documentados Push + Email al Dueño. Código: `AdministradorService` (~360–375) solo llama a `notificacionService.crearParaDueno`; no hay método de email de comercio aprobado/rechazado en `EmailService` (T16, suspensión, sí lleva email por `AvisoCuentaService`).
- **D-46. T24 y T25 tienen aviso in-app.** Documentados canal "Email" únicamente. Código: `CUENTA_INACTIVADA` crea además un aviso PUSH al usuario, `COMERCIO_INACTIVADO` crea un aviso PUSH al Dueño por comercio, y el email es uno solo por cuenta (con la lista de comercios). El "email de T25" no existe como mensaje propio.
- **D-47. Pago tardío sí se reembolsa.** `alcance-y-limitaciones.md` (~línea 223) dice "un pago aprobado sobre un pedido ya cancelado ... solo genera una alerta ... No se devuelve el dinero". Código: además de la alerta `PAGO_APROBADO_SOBRE_PEDIDO_CANCELADO`, `PedidoService.reembolsarPagoTardio` crea la nota (`PAGO_TARDIO`, `SUSPENSION_CLIENTE` o `SUSPENSION_COMERCIO`) y pide el reembolso total. El pago duplicado sí es solo alerta. `requisitos-funcionales-sistema.md` ya coincide con el código; falta corregir el alcance.
- **D-48. `NotaCredito` del diccionario con la implementación atrasada.** La descripción de la tabla dice que el reembolso total está implementado solo para `RECHAZADO`, `EXPIRADO` y la suspensión de comercio y que `CANCELADO`/`ANULADO` "siguen pendientes, marcados con TODO en `PedidoService`". Código: cancelación del Cliente, anulación, rechazo, expiración, suspensión (comercio y Cliente), pago tardío y reclamo ya generan nota (bloques A0 y A0b de E3 y Tramo de Reclamos). Además `motivo` documentado como "nullable por compatibilidad": coincide (columna `NULL`).
- **D-49. `CONCURRENCIA-Y-TRANSACCIONES.md` §7 desactualizada.** El título de la sección sigue siendo "Módulo Pago / MercadoPago — fuera de alcance del MVP ... documentado para v2" (línea ~131) aunque el módulo está implementado y las secciones posteriores ya describen el orden real. Solo se leyó el encabezado y el índice de la sección.
- **D-50. Orden de bloqueo del reintento manual.** `CONCURRENCIA-Y-TRANSACCIONES.md` (nivel 5: "`pago` ... y recién después los inserts: `nota_credito`") describe pago antes que nota. `ReembolsoService.prepararReintento` toma la nota `FOR UPDATE` y después el pago `FOR UPDATE` (orden inverso al de `prepararIntento` y `generarNotaDeReclamo`). Ver C-33.
- **D-51. Audiencia `EMPLEADOS` no documentada.** El diccionario (nota de audiencias, línea ~671) lista cinco audiencias (equipo, Dueño, Cliente o Dueño, Administrador, Cliente); el código tiene seis (`EMPLEADOS`: `COMERCIO_SUSPENDIDO_EQUIPO` y `COMERCIO_SUSPENSION_LEVANTADA_EQUIPO`). En la tabla de tipos del diccionario sí figuran esos dos tipos. Además `RECLAMO_REEMBOLSO_DUENO` no aparece en el diccionario (la tabla leída termina en T41), y la columna `tipo` dice "ver tabla T1–T35" cuando son T1–T41.
- **D-52. "Marcar todas" del Cliente y `PUT /notificaciones/personales/leidas`.** Existen en backend y frontend; no figuran en `requisitos-funcionales-cliente.md`, `-comercio.md` ni `-generales.md`.
- **D-53. Endpoint del Dueño `GET /pedidos/comercio/{id}/pago`.** `requisitos-funcionales-dueño.md` (~línea 322) lo lista como capacidad exclusiva del Dueño ("ver el enlace de pago de un pedido"). Código: solo funciona para pedidos que ya llegaron pagados (`obtenerPedidoDelComercio` exige `llegoPagado`) y el frontend no lo consume; el enlace de un pedido sin pagar nunca se puede ver desde el comercio.

---

## Dudas (decisiones para Diego) — C-26 en adelante

- **C-26.** El intento de vinculación OAuth (`codigo_vinculacion_mp`) nunca vence: un `state` abandonado sigue siendo válido hasta que el Dueño inicie otro intento o lo use. ¿Se agrega un vencimiento (por ejemplo, 10 minutos desde `fecha_creacion`)? Hoy el callback es público y se liga al Dueño solo por el `state`.
- **C-27.** La vinculación no renueva tokens (`refresh_token` y `token_expira` sin uso). El token vence a los ~6 meses y el cobro y los reembolsos dejarían de funcionar sin aviso. ¿Se dibuja el flujo de refresh como pendiente o se implementa antes de la entrega?
- **C-28.** `sincronizarPago` sin `paymentId` captura solo `RestClientResponseException`; una falla de red o un tiempo agotado contra MP termina en `500` (el frontend sigue reintentando cada 3 s). El mismo método con `paymentId` y el webhook convierten el error de MP en `409`. ¿Se documenta tal cual?
- **C-29.** `app.backend-base-url` queda vacía si no se define `BACKEND_BASE_URL`: la `notification_url` de la preferencia sería relativa y MP no podría notificar. ¿Se considera un requisito de despliegue (ya lo es para ngrok en pruebas) y se dibuja un fallo en el diagrama?
- **C-30.** `GET /pedidos/comercio/{id}/pago` solo sirve para pedidos ya pagados y el frontend no lo usa. ¿Se deja fuera de los diagramas del Dueño o se documenta como endpoint sin consumidor?
- **C-31.** Sin aviso al Cliente cuando: se confirma que un pago tardío se le va a reembolsar (solo recibió el aviso de cancelación), y cuando él mismo cancela un pedido pagado (solo toast). Tampoco hay aviso cuando una nota pasa a `PROCESADO` ni cuando falla. ¿Se dibuja así?
- **C-32.** Si el hilo post-commit del reembolso se cae entre el commit y el registro del resultado, la nota queda `PENDIENTE` y nadie la retoma (no hay job y la pantalla del Administrador solo lista `PENDIENTE_REVISION_MANUAL` y `FALLIDO`). Lo mismo si el servidor se reinicia después del commit. ¿Se documenta como limitación?
- **C-33.** Orden de bloqueos del reintento manual (nota → pago) contra el de `generarNotaDeReclamo` (pago → luego `FOR UPDATE` sobre las otras notas del pago): por lectura de código, un reintento de una nota y la resolución de un reclamo del mismo pedido podrían interbloquearse. No lo probé ni existe un estrés citado en lo que leí. ¿Se confirma con un estrés antes de afirmarlo en el DFD?
- **C-34.** La clave de idempotencia `nc-{id}-{intentos+1}` cambia en cada reintento. Si un intento anterior expiró por tiempo pero MP sí hizo el reembolso, el reintento manual usa otra clave y podría pedir un reembolso de más (MP lo rechazaría por exceder el monto, pero el resultado sería `FALLIDO` con un reembolso ya hecho). ¿Se dibuja este caso?
- **C-35.** Un pago `refunded` o `charged_back` de MP posterior al `approved` se ignora (con `yaHayPagoAprobado` el webhook no hace nada), y el pedido no se entera de un contracargo. ¿Se muestra como "no manejado" en el DFD?
- **C-36.** Los recorridos de un `409` en el webhook (MP reintenta) y el `500` por `pedidoId` no numérico: ¿se dibujan como respuestas distintas o se resume "error → MP reintenta"?
- **C-37.** El texto "30 minutos" de la hoja de desvinculación (`textoPieBloqueo`) está escrito en el frontend y ya no coincide si cambia `pedido.timeout.pago-minutos`. ¿Se dibuja con el valor fijo?

---

## NO RELEVADO

- `AptitudVentaComercioService` salvo las líneas ~290–296 (textos de T40/T41 y su `faltante`); cuándo exactamente emite T40/T41 al vincular y al desvincular.
- `MercadoPagoTokenConverter` (más allá del encabezado y del mensaje de la clave), `PagoInsercionRepository` (lo dicho sale de sus comentarios en `PagoService`), `CodigoVinculacionMPRepository` y `CodigoVinculacionMP` (consultas y columnas), `PagoRepository`, `NotaCreditoRepository`, `NotificacionRepository` (queries).
- `CuentaSuspendidaException` y `ComercioActivoService.resolverSiCorresponde` (textos y reglas del `400`/`404`).
- `EmailService` líneas 1–130 y 260–300 (verificación, recuperación, reactivación, invitación, resumen de turno, Soporte, simuladores) salvo los métodos citados.
- `TestController` y `TestSupportService` (atajos `pago-aprobado`, `mercadopago-simulada`, etc.): se vio solo que existen.
- `SecurityConfig` completo (se vieron los matchers de OAuth, notificaciones y rutas públicas por búsqueda).
- `GlobalExceptionHandler` fuera de los handlers de `DesvinculacionBloqueada`, `ServicioNoDisponible` y `LimiteSoporte`.
- Código del frontend no leído: `F:js/sonido-avisos.js`, `F:js/catalogo.js` (la campana del Cliente, solo la constante `INTERVALO_CAMPANA_CLIENTE_MS`), `F:js/cliente-escritorio.js` (solo `consultarAvisos`/`suscribirAvisosCliente`), `F:js/selector-comercio.js` (panel "Tus comercios" y su aviso de Mercado Pago), `F:js/auth.js` fuera de `resolverHomePorRol` y de las coincidencias de `grep`, `F:js/direcciones.js`, `F:js/pedidos-nuevos.js` y `F:js/comercio-pedido-detalle`.
- Texto del hueco de `PedidoService` entre líneas ~530 y ~650 (continuación de `bloquear`), y de las líneas ~1084–1296 (procesos de suspensión), salvo lo citado.
- Documentación no leída: `Historias de Usuario - *.md` (solo una búsqueda de "reembolso" en la de Administrador), `requisitos-funcionales-cliente.md`, `-comercio.md`, `-administrador.md`, `-generales.md` (solo búsquedas), `requisitos-no-funcionales.md` (solo búsqueda), `AUDITORIA-NOTIFICACIONES.md`, `docs/DECISIONES.md`, `docs/MERCADOPAGO-BAJONEA-FINAL.md`.
- Migraciones: se leyeron V1 (tablas), V14, V16, V23, V27 (por `cat`/`grep`); no se leyeron V33, V35, V43 a V50 completas más allá de las líneas citadas.
- Postman y Playwright: solo se listaron los specs (`20-reembolsos-admin`, `09`, `45`, `54`, `108`, `109`, `112` a `114`); no se revisó su contenido.

---

## Archivos revisados

**Backend (`backend/src/main/java/com/bajonea/backend/`)**, lectura completa salvo aclaración:
`services/MercadoPagoOAuthService.java`, `services/CuentaMercadoPagoService.java`, `services/MercadoPagoPagoService.java`, `services/MercadoPagoReembolsoClient.java`, `services/ReembolsoService.java`, `services/NotaCreditoService.java`, `services/NotaCreditoAdminService.java`, `services/PagoService.java`, `services/AlertaWebhookMpService.java`, `services/NotificacionService.java`, `services/AvisoReclamoService.java`, `services/AvisoCuentaService.java` (parcial, ~40–130), `services/EmailService.java` (parcial, ~30–60, 130–260, 296–361), `services/PedidoService.java` (parcial: 270–530, 630–712, 826–910, 935–1090, 1195–1210, 1296–1430), `services/PedidoSchedulerService.java` (parcial), `services/AdministradorService.java` (parcial, ~355–385), `services/CarritoService.java` (parcial, ~190–202), `services/EstadoUsuarioService.java` (parcial), `controllers/MercadoPagoOAuthController.java`, `controllers/MercadoPagoWebhookController.java`, `controllers/NotificacionController.java`, `controllers/PedidoController.java` (parcial, líneas del pago), `controllers/AdministradorController.java` (parcial, reembolsos), `config/MercadoPagoConfig.java`, `config/MailConfig.java`, `config/PedidoTimeoutProperties.java`, `config/security/SecurityConfig.java` (por búsqueda), `enums/` (`TipoNotificacion`, `AudienciaNotificacion`, `CanalNotificacion`, `EstadoEnvioNotificacion`, `TipoEntidadNotificacion`, `EstadoNotaCredito`, `MotivoNotaCredito`, `MotivoAlertaWebhookMp`, `EstadoPagoPedido`, `EstadoReembolsoEmpleado`), `dto/response/` (`NotaCreditoAdminResponseDTO`, `PagoResponseDTO`, `CuentaMercadoPagoResponseDTO`, `NotificacionResponseDTO`), `dto/request/SincronizarPagoRequestDTO.java`, `exceptions/` (`CuentaMercadoPagoYaVinculadaException`, `CuentaMercadoPagoEnUsoException`, `DesvinculacionBloqueadaException`, `ServicioNoDisponibleException`, `GlobalExceptionHandler` parcial).

**Recursos del backend:** `application.properties`, `application-production.properties`, `application-test.properties` (por `grep`), `db/migration/V1__baseline_bajonea_final.sql` (tablas `pago`, `nota_credito`, `notificacion`, `cuenta_mercado_pago`), `V14`, `V16`, `V23`, `V27`, `V33`/`V50` (líneas citadas).

**Frontend (`frontend/`):** `admin-reembolsos.html`, `notificaciones.html`, `comercio-perfil.html` (vista `view-mercadopago`), `js/config.js`, `js/notificaciones.js`, `js/destino-aviso.js`, `js/comercio-activo.js`, `js/api.js` (parcial: 296–345, 600–705), `js/auth.js` (parcial: 60–100 y `grep`), `js/checkout.js` (560–700), `js/pedidos.js` (parcial: 36–200, 395–530, 585–655, 755–965), `js/comercio.js` (parcial: ~1140–1150, 1890–2210, 2660–2705), `js/admin.js` (parcial: 188–260, 1899–2053), `js/admin-shell.js` (por `grep`), `js/cliente-escritorio.js` (parcial), `js/pasos-vender.js` (parcial), `js/agregar-comercio.js` (por `grep`).

**Documentación contrastada:** `docs/entregables-01-02/requisitos-funcionales-sistema.md` (74–215), `requisitos-funcionales-dueño.md` (74–100 y búsquedas), `alcance-y-limitaciones.md` (222–240), `docs/diccionario-de-datos.md` (`CuentaMercadoPago`, `Pago`, `NotaCredito`, `Notificacion`, ENUM `TipoNotificacion`), `docs/CONCURRENCIA-Y-TRANSACCIONES.md` (por `grep`).
