# DOCUMENTACIÓN MERCADO PAGO — BAJONEÁ (Checkout Pro vía Preferencias + Split Payments)

> Última revisión: verificado contra la documentación oficial en vivo (mercadopago.com.ar/developers)
> el 2026-09-17, tras detectar contaminación cruzada entre secciones en el scrape original.

## Decisión de arquitectura vigente

**Camino elegido: Checkout Pro vía API de Preferencias (`POST /checkout/preferences`), NO la Orders API nueva (`POST /v1/orders`).**

Motivo: el mecanismo de split de marketplace (`marketplace_fee`) que Bajoneá necesita para
quedarse con el 1% del comercio + $200 fijos del cliente por pedido **solo existe documentado
para dos caminos**: Checkout Pro vía Preferencias (`marketplace_fee` en `/checkout/preferences`)
y Checkout API/Transparente (`application_fee` en `/v1/payments`). La Orders API nueva
(`/v1/orders`) **no tiene** un campo equivalente documentado en ningún lado de la documentación
oficial de MP a la fecha. La decisión anterior de usar la Orders API se tomó sin este dato —
queda revertida.

Con Checkout Pro vía Preferencias además se obtiene PCI DSS categoría SAQ-A (mínima carga de
cumplimiento), porque el comprador es redirigido a la página de MP y Bajoneá nunca toca datos
de tarjeta — el mismo argumento de seguridad que motivó la elección original de Checkout Pro
sigue siendo válido, solo cambia la sub-API (Preferencias, no Orders).

## `marketplace_fee` — lo confirmado

- Va en el body del `POST /checkout/preferences`, mismo nivel que `items`, `back_urls`, etc.
- Es un **monto absoluto en la moneda local (ARS)**, NO un porcentaje. Default: 0.
- Error validado por MP: `invalid_marketplace_fee` → "marketplace_fee must not be greater than
  total amount." — confirma que es un monto y que no puede superar el total de la preferencia.
- Bajoneá debe calcular el monto final en pesos (1% del subtotal + $200 fijos, ya resuelto en
  `PedidoService.confirmarPedido` / `ConfiguracionTarifa`) y pasarlo ya calculado en este campo.
- La preferencia se crea usando el `access_token` del Dueño del comercio (obtenido vía OAuth),
  de forma que el dinero se acredita directamente en la cuenta MP del comercio, y MP le
  descuenta automáticamente el `marketplace_fee` para acreditárselo a la cuenta de Bajoneá.
- Orden de descuentos (documentado): primero la comisión propia de MP (variable, según plazo de
  acreditación elegido por el comercio), después el `marketplace_fee` de Bajoneá sobre el saldo
  restante. La comisión de MP no la paga Bajoneá directamente.

## Split implementado y verificado (2026-09-25)

Código: `MercadoPagoPagoService` (creación de la preferencia y verificación del split),
`AlertaWebhookMpService`, migración `V22`. Decisión completa en `docs/DECISIONES.md`, entrada
del 2026-09-25 "Split real de pagos con MercadoPago".

**`marketplace_fee` vs `application_fee` — aclaración obligatoria antes de tocar el split:**
- El campo que **Bajoneá envía** es `marketplace_fee`, en el body de `POST /checkout/preferences`
  (Checkout Pro vía Preferencias). Es el único mecanismo de split que usa el sistema.
- `application_fee` es el campo del **otro** mecanismo (Checkout API / pagos directos en
  `/v1/payments`). **No lo usamos ni debe reintentarse** en la creación de la preferencia:
  Checkout Pro se eligió a propósito para mantenerse en PCI SAQ-A (el comprador paga en la página
  de MercadoPago y Bajoneá nunca toca datos de tarjeta).
- Al **leer** un pago (`GET /v1/payments/{id}`), la entrada de `fee_details` que informa nuestra
  comisión de marketplace llega con `type = "application_fee"`. Es solo el nombre que MercadoPago
  usa para esa entrada en su respuesta: **no significa que estemos usando el otro mecanismo**. Por
  eso el código filtra `fee_details` por `"application_fee"` aunque lo que se envió fue
  `marketplace_fee`.

**Cálculo.** `marketplace_fee = cargoServicioCliente ($200 fijos) + cargoServicioComercio (1% del
subtotal)`, sumados en un solo monto absoluto en pesos, ya calculado con la tarifa vigente
(`ConfiguracionTarifa`) y persistido en el pedido. El campo no admite fórmulas ni desglose. El
dinero se acredita completo en la cuenta del comercio y MercadoPago transfiere el `marketplace_fee`
a la cuenta dueña de la aplicación.

**Requisito de configuración.** La aplicación de MercadoPago debe estar registrada bajo la cuenta
de MercadoPago de Bajonea Split (la que recibe la comisión); sin eso el split no llega a la cuenta
esperada en sandbox.

**Verificación.** Al aprobarse un pago se lee `fee_details` y se compara la entrada
`application_fee` contra el monto esperado (tolerancia de $0,01). Si falta o no coincide, se
registra una alerta `SPLIT_NO_APLICADO` con `monto_esperado`/`monto_capturado` en
`alerta_webhook_mp`. La alerta **nunca** bloquea ni revierte el pedido ni el pago del cliente.
Verificado con pagos reales de sandbox (montos de `fee_details` coincidentes con los esperados).

**Cuenta de prueba (`es_cuenta_prueba`).** El flag de `cuenta_mercado_pago` se fija por la variable
de entorno `MERCADOPAGO_TEST_TOKEN` en el momento de vincular (el backend envía `test_token` en el
intercambio del código de OAuth), no inspeccionando la cuenta real. Si el backend arranca sin esa
variable, una vinculación nueva queda como no-test aunque la cuenta de MercadoPago sea de prueba, y
el pago devuelve el `init_point` de producción (síntoma típico: "Oh, no, algo anduvo mal" al pagar
con tarjeta nueva, aunque la tarjeta guardada funcione). El backend emite un WARN al arrancar si la
variable no está seteada explícitamente. Procedimiento para una cuenta de prueba: setear
`MERCADOPAGO_TEST_TOKEN=true` **antes** de arrancar el backend (PowerShell:
`$env:MERCADOPAGO_TEST_TOKEN="true"`), vincular la cuenta y recién ahí probar el pago; una cuenta
ya vinculada sin la variable hay que re-vincularla.

## Estructura de este documento

1. **Endpoints verificados por fetch directo** (sección `00`-`02` — fuente de verdad exacta,
   sin ambigüedad, confirmados contra la doc oficial en vivo el día de esta sesión)
2. **Contenido del scrape original, filtrado y curado** (resto del documento) — conceptos
   genéricos de MP (OAuth conceptual, credenciales, cuentas/tarjetas de test, PCI/OWASP,
   rechazos de pago) que no dependen de qué endpoint de creación de pago se use.

Se descartó del scrape original todo lo específico de: Orders API nueva (`checkout-pro-orders`,
`checkout-api-orders`), Checkout API/Transparente (`checkout-api-payments`), Checkout Bricks
(widget embebido, no es el camino elegido), Point/QR presencial, Suscripciones, SDKs móviles
nativos, e integraciones con plataformas de e-commerce de terceros. También se descartó la
sección de "reference API" del scrape original por tener contenido cruzado entre secciones
(el mismo bug de scraping que affecta al sitio real de MP, donde varias URLs bajo
`reference/online-payments/checkout-pro/` corresponden ambiguamente tanto a Orders API como a
Preferencias) — esa sección fue reemplazada por los tres endpoints verificados por fetch directo.

## Pendiente de verificar en próximas sesiones (no bloqueante para el diseño actual)
- El flujo completo de autorización OAuth previo al POST de token (URL exacta de redirect al
  Dueño, parámetros `response_type`, `platform_id`, scopes por defecto).
- El campo `marketplace` (visto como `"NONE"` o `"MP-MKT-xxxxx"` en los ejemplos) — si Bajoneá
  necesita configurarlo manualmente o se completa solo según la cuenta que crea la preferencia.
- Confirmar el endpoint exacto y payload de los webhooks de notificación de pago para
  Preferencias (IPN vs Webhooks v2) — no llegó a verificarse por fetch en esta sesión.
- Confirmar `search-payments` / `get-payment` (para consultar el estado real de un pago tras
  recibir el webhook) contra la fuente oficial.

**Actualización 2026-09-20 — estado de los cuatro puntos, verificado contra el código:**
- **Flujo de autorización OAuth:** resuelto e implementado (`MercadoPagoOAuthService`): URL `auth.mercadopago.com.ar/authorization` con `response_type=code`, `platform_id=mp`, `state` y `code_challenge` (S256, PKCE), e intercambio del código en `POST /oauth/token`.
- **Campo `marketplace`:** no se envía en la preferencia (`PreferenciaRequest` no lo incluye).
- **Webhook:** se procesa la notificación de tipo `payment`. Se leen únicamente los query params `data.id` y `type`, más un `pedidoId` propio agregado a la `notification_url` de cada preferencia; el body no se usa. El pago se consulta siempre a MercadoPago y se cruza su `external_reference` con el pedido.
- **`GET /v1/payments/{id}` y `GET /v1/payments/search`** (por `external_reference`): implementados y en uso, con el token del Dueño.
- **Sigue pendiente (no documentado en este archivo como resuelto):** refresh de tokens OAuth, verificación del monto del pago y obligatoriedad de la firma `x-signature` del webhook (hoy se omite si `MERCADOPAGO_WEBHOOK_SECRET` está vacío).

---

# Origen (verificado por fetch directo): https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro-preferences/create-preference/post

# Create preference

Generate a preference with the information of a product or service and obtain the necessary URL to start the payment flow.

**POST** `https://api.mercadopago.com/checkout/preferences`

## Request parameters

### Header
- `Authorization` (string, REQUIRED) — Access Token obtained through the developer panel. Must be sent in all requests.

### Body (campos relevantes para Bajoneá)
- `items` (array, REQUIRED) — items information (id, title, description, picture_url, category_id, quantity, currency_id, unit_price)
- `payer` (object) — name, surname, email, phone, identification, address, date_created
- `payment_methods` (object) — excluded_payment_methods, excluded_payment_types, default_payment_method_id, installments, default_installments
- `shipments` (object) — local_pickup, dimensions, cost, free_shipping, receiver_address
- `back_urls` (object) — success, pending, failure
- `notification_url` (string) — URL de webhook para notificaciones de este pago
- `additional_info` (string)
- `auto_return` (string) — "approved" (redirige automático solo si aprobado) | "all"
- `external_reference` (string) — referencia externa, ideal para el ID del Pedido de Bajoneá
- `expires` (boolean), `expiration_date_from`, `expiration_date_to`
- `marketplace` (string) — identificador del marketplace (visto en ejemplos como "NONE" o un ID tipo "MP-MKT-xxxxx"; se completa automáticamente según la cuenta usada, no hay que setearlo manualmente en la mayoría de los casos — a confirmar en el flujo real)
- **`marketplace_fee` (number)** — CAMPO CLAVE PARA BAJONEÁ. Monto en la moneda local (ARS) que se le cobra al vendedor (comercio) sobre el total de la preferencia. Default: 0. Se resta del total antes de acreditarle al vendedor.
- `differential_pricing` (object) — { id }
- `tracks` (array) — integración con Google Ads / Facebook Ads (no aplica a Bajoneá)

## Response parameters (campos relevantes)
- `id` — ID de la preferencia
- `init_point` — URL de producción para redirigir al comprador
- `sandbox_init_point` — URL de test/sandbox para redirigir al comprador
- `collector_id` — ID del vendedor (comercio) que recibe el pago
- `client_id` — ID de la aplicación usada para crear la preferencia
- `marketplace`, `marketplace_fee` — ecos de lo enviado
- `preference_expired` (boolean)
- `date_created`

## Errores documentados (400)
- `collector_does_not_comply_with_current_regulation` — la cuenta del vendedor (collector_id) tiene validaciones de identidad/regulatorias pendientes para este país. Hay que resolverlas antes de crear una preferencia nueva. **Relevante: el Dueño de cada comercio debe tener su cuenta MP verificada antes de poder recibir pagos vía split.**
- `invalid_collector_id` — collector_id inválido
- `invalid_sponsor_id` — sponsor_id no es un usuario activo
- `invalid_collector_email` — collector no es dueño de collector_email
- `invalid_operation_type` — operation_type inválido
- `invalid_expiration_date_to` / `invalid_expiration_date_from` — fechas de expiración inválidas
- `invalid_items` — unit_price inválido
- `invalid_back_urls` — back_urls con formato incorrecto
- `invalid_payment_methods` — installments debe ser un número entre 1 y 36
- **`invalid_marketplace_fee` — "marketplace_fee must not be greater than total amount." Confirma que marketplace_fee es un MONTO ABSOLUTO en pesos, no un porcentaje, y que no puede superar el total de la preferencia.**
- `invalid_id` — preference_id no encontrado
- `invalid_access_token` — acceso denegado
- `invalid_shipments` — tipo inválido para shipments.cost
- `invalid_binary_mode` — binary_mode debe ser boolean
- `sponsor_id site must be the same as collector_id` — el sitio del sponsor_id debe ser el mismo que el del collector_id

## Ejemplo de request real (Argentina, ARS)
```json
{
  "items": [
    {
      "id": "Sound system",
      "title": "Dummy Title",
      "description": "Dummy description",
      "picture_url": "https://www.myapp.com/myimage.jpg",
      "category_id": "car_electronics",
      "quantity": 1,
      "currency_id": "ARS",
      "unit_price": 24.5
    }
  ],
  "payer": {
    "name": "María",
    "surname": "González",
    "email": "test@testuser.com",
    "phone": { "area_code": "11", "number": 2323 },
    "identification": { "type": "DNI", "number": "12345678" },
    "address": { "zip_code": "C1264AAK", "street_name": "Example Street", "street_number": 3039 },
    "date_created": "2024-04-01T00:00:00Z"
  },
  "payment_methods": {
    "excluded_payment_methods": [{ "id": "master" }],
    "excluded_payment_types": [{ "id": "ticket" }],
    "default_payment_method_id": "master",
    "installments": 10,
    "default_installments": 5
  },
  "shipments": {
    "local_pickup": false,
    "dimensions": "32 x 25 x 16",
    "cost": 20,
    "free_shipping": false,
    "receiver_address": {
      "zip_code": "C1264AAK",
      "street_name": "Street address test",
      "city_name": "Buenos Aires",
      "state_name": "CABA",
      "street_number": 3039,
      "country_name": "Argentina"
    }
  },
  "back_urls": {
    "success": "https://test.com/success",
    "pending": "https://test.com/pending",
    "failure": "https://test.com/failure"
  },
  "notification_url": "https://notificationurl.com",
  "additional_info": "Discount 12.00",
  "auto_return": "approved",
  "external_reference": "1643827245",
  "expires": false,
  "expiration_date_from": "2022-11-17T09:37:52.000-04:00",
  "expiration_date_to": "2022-11-17T10:37:52.000-05:00",
  "marketplace": "NONE",
  "marketplace_fee": 0,
  "differential_pricing": { "id": 1 },
  "tracks": [
    { "type": "google_ad", "values": { "conversion_id": 123, "conversion_label": "abc", "pixel_id": "abc" } }
  ]
}
```

## Ejemplo de response real
```json
{
  "collector_id": 202809963,
  "items": [
    { "title": "Dummy Item", "description": "Multicolor Item", "currency_id": "ARS", "quantity": 1, "unit_price": "24.50" }
  ],
  "payer": { "email": "test@testuser.com", "phone": {}, "identification": { "type": "DNI" }, "address": {} },
  "back_urls": { "success": "https://test.com/success", "pending": "https://test.com/pending", "failure": "https://test.com/failure" },
  "auto_return": "approved",
  "payment_methods": { "excluded_payment_methods": [{}], "excluded_payment_types": [{}] },
  "client_id": "6295877106812064",
  "marketplace": "MP-MKT-6295877106812064",
  "marketplace_fee": 0,
  "shipments": { "receiver_address": {} },
  "notification_url": "https://notificationurl.com",
  "statement_descriptor": "MERCADOPAGO",
  "expiration_date_from": "2022-11-17T09:37:52.000-04:00",
  "expiration_date_to": "2022-11-17T10:37:52.000-05:00",
  "date_created": "2022-11-17T10:37:52.000-05:00",
  "id": "202809963-920c288b-4ebb-40be-966f-700250fa5370",
  "init_point": "https://www.mercadopago.com/mla/checkout/start?pref_id=202809963-920c288b-4ebb-40be-966f-700250fa5370",
  "preference_expired": true,
  "sandbox_init_point": "https://sandbox.mercadopago.com/mla/checkout/pay?pref_id=202809963-920c288b-4ebb-40be-966f-700250fa5370",
  "metadata": {}
}
```
# Origen (verificado por fetch directo): https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro-preferences/get-preference/get

# Get preference

Check all the payment information for a product or service with the ID of the preference of your choice.

**GET** `https://api.mercadopago.com/checkout/preferences/{id}`

## Request parameters
### Header
- `Authorization` (string, REQUIRED)
### Path
- `id` (string, REQUIRED) — Preference ID.

## Response parameters (relevantes)
- `id`, `init_point`, `sandbox_init_point`, `collector_id`, `client_id`
- `marketplace`, `marketplace_fee`
- `items`, `payer`, `payment_methods`, `shipments`, `back_urls`
- `auto_return`, `statement_descriptor`
- `date_created`, `expiration_date_from`, `expiration_date_to`
- `preference_expired` (boolean)

## Ejemplo de response real
```json
{
  "auto_return": "approved",
  "back_urls": {},
  "client_id": 6295877106812064,
  "collector_id": 202809963,
  "date_created": "2022-11-17T09:37:52.000-04:00",
  "expiration_date_from": "2022-11-17T09:37:52.000-04:00",
  "expiration_date_to": "2022-11-17T10:37:52.000-05:00",
  "id": "202809963-a2201f8d-11cb-443f-adf6-de5a42eed67d",
  "init_point": "https://www.mercadopago.com/mla/checkout/start?pref_id=202809963-a2201f8d-11cb-443f-adf6-de5a42eed67d",
  "items": [
    {
      "id": "item-ID-1234",
      "currency_id": "ARS",
      "title": "Practical Granite Shirt",
      "picture_url": "https://placehold.it/350x150",
      "description": "This is my description",
      "quantity": 2,
      "unit_price": "24.50"
    }
  ],
  "marketplace": "MP-MKT-6295877106812064",
  "marketplace_fee": 0,
  "statement_descriptor": "MERCADOPAGO",
  "payer": {
    "phone": { "number": "2323-5555" },
    "address": { "zip_code": "C1264AAK", "street_name": "Marjory Stream", "street_number": 941 },
    "email": "test@testuser.com",
    "identification": { "number": "12345678", "type": "DNI" }
  },
  "payment_methods": { "excluded_payment_methods": [{}], "excluded_payment_types": [{}] },
  "preference_expired": true,
  "sandbox_init_point": "https://sandbox.mercadopago.com/mla/checkout/pay?pref_id=202809963-a2201f8d-11cb-443f-adf6-de5a42eed67d",
  "shipments": { "receiver_address": {} }
}
```

## Errores (mismo set que create-preference)
Ver `00-create-preference.md`.

---

# SITEMAP OFICIAL VERIFICADO (extraído del menú lateral de la doc real de MP Argentina)

Este listado es la fuente de verdad sobre qué endpoints pertenecen a qué API — resuelve la ambigüedad/contaminación encontrada en el scrape original.

## Checkout Pro vía Orders API (endpoint /v1/orders) — NO USAMOS
- Overview: /reference/online-payments/checkout-pro-orders/overview
- Create order POST: /reference/online-payments/checkout-pro/create-order/post
- Search order GET: /reference/online-payments/checkout-pro/search-orders/get
- Get order by ID GET: /reference/online-payments/checkout-pro/get-order/get
- Cancel order by ID POST: /reference/online-payments/checkout-pro/cancel-order/post
- Refund order POST: /reference/online-payments/checkout-pro/refund-order/post
- Get payment methods GET: /reference/online-payments/checkout-pro/payment-methods/get
- Obtain installment payment options GET: /reference/online-payments/checkout-pro/payment-methods/installments/get
- Create cancellation PUT: /reference/online-payments/checkout-pro/create-cancellation/put
- Create refund POST: /reference/online-payments/checkout-pro/create-refund/post
- Get specific refund GET: /reference/online-payments/checkout-pro/get-refund/get
- Get refunds list GET: /reference/online-payments/checkout-pro/get-refunds/get
- Chargebacks: /reference/online-payments/checkout-pro/chargebacks/*

## Checkout Pro vía Preferences API (endpoint /checkout/preferences) — LA QUE USAMOS
- Overview: /reference/online-payments/checkout-pro-preferences/overview
- **Create preference POST: /reference/online-payments/checkout-pro-preferences/create-preference/post**
- Search preferences GET: /reference/online-payments/checkout-pro-preferences/search-preferences/get
- **Get preference GET: /reference/online-payments/checkout-pro-preferences/get-preference/get**
- Update preference PUT: /reference/online-payments/checkout-pro-preferences/update-preference/put
- Create refund POST: /reference/online-payments/checkout-pro-preferences/create-refund/post
- Get specific refund GET: /reference/online-payments/checkout-pro-preferences/get-refund/get
- Get refunds list GET: /reference/online-payments/checkout-pro-preferences/get-refunds/get
- Create cancellation PUT: /reference/online-payments/checkout-pro-preferences/create-cancellation/put
- **Search payments GET: /reference/online-payments/checkout-pro-preferences/search-payments/get**
- **Get payment GET: /reference/online-payments/checkout-pro-preferences/get-payment/get**
- Search merchant orders GET: /reference/online-payments/checkout-pro-preferences/merchant-orders/search-merchant-order/get
- Get merchant order GET: /reference/online-payments/checkout-pro-preferences/merchant-orders/get-merchant-order/get
- Update merchant order PUT: /reference/online-payments/checkout-pro-preferences/merchant-orders/update-merchant-order/put
- Get payment methods GET: /reference/online-payments/checkout-pro-preferences/payment-methods/get
- Obtain installment payment options GET: /reference/online-payments/checkout-pro-preferences/payment-methods/installments/get
- Chargebacks: /reference/online-payments/checkout-pro-preferences/chargebacks/*

## Checkout API — Orders API (endpoint /v1/orders para pago embebido) — NO USAMOS
- Overview: /reference/online-payments/checkout-api/overview
- Create order POST: /reference/online-payments/checkout-api/create-order/post
- (resto de operaciones sobre /v1/orders/{id}/... : capture, transactions, process, etc.)

## Payments API (legacy, endpoint /v1/payments, "Checkout Transparente") — NO USAMOS PARA CREAR PAGOS, pero puede ser útil GET/search
- Create payment POST: /reference/online-payments/checkout-api-payments/create-payment/post
- Search payments GET: /reference/online-payments/checkout-api-payments/search-payments/get
- Get payment GET: /reference/online-payments/checkout-api-payments/get-payment/get
(Nota: Preferencias también tiene su propio "search-payments"/"get-payment" que apunta a /v1/payments/* — es el mismo recurso de pagos, MP simplemente lo referencia desde varias secciones de su doc. Usar los que cuelgan de checkout-pro-preferences.)

## OAuth (autenticación — compartido entre todas las APIs)
- Overview: /reference/authentication/oauth/overview
- Create and refresh token POST: /reference/authentication/oauth/_oauth_token/post

## Reportes
- Releases (liberación de dinero): /reference/releases-report/*
- Account money (saldo en cuenta): /reference/settlements-report/*
# Origen (verificado por fetch directo): https://www.mercadopago.com.ar/developers/en/reference/authentication/oauth/_oauth_token/post

# Create and refresh token (OAuth)

Este endpoint es el que usa Bajoneá para: (a) obtener el `access_token` de cada Dueño de comercio tras el flujo de autorización OAuth (vincular su cuenta MP), y (b) refrescar ese token cuando expire.

**POST** `https://api.mercadopago.com/oauth/token`

## Request parameters (Body)
- `client_secret` (string, REQUIRED) — clave privada de la aplicación de Bajoneá en MP.
- `client_id` (string, REQUIRED) — ID único de la aplicación de Bajoneá en MP.
- `grant_type` (string, REQUIRED) — tipo de flujo:
  - `authorization_code` — flujo basado en redirect, requiere intervención del usuario (el Dueño) para autorizar explícitamente. Usa un `code` que da el servidor de autenticación. **ESTE ES EL QUE USA BAJONEÁ para vincular la cuenta del Dueño.**
  - `refresh_token` — si el access_token generado por `authorization_code` expiró o es inválido, se usa este flujo con el `refresh_token` para renovarlo sin pedirle al usuario que vuelva a autorizar.
  - `client_credentials` — para obtener un access_token sin interacción del usuario, cuando la app accede a sus propios recursos (no en nombre de un Dueño). No es el caso principal de Bajoneá para el split, pero puede ser útil para operaciones propias de la cuenta de Bajoneá.
- `code` (string) — código provisto por el servidor de autenticación tras la autorización del Dueño. Válido por 10 minutos desde su generación. Requerido cuando `grant_type=authorization_code`.
- `code_verifier` (visto en el ejemplo, relacionado a PKCE)
- `redirect_uri` (string) — debe coincidir exactamente con el configurado en la aplicación.
- `refresh_token` (string) — requerido cuando `grant_type=refresh_token`.
- `test_token` (boolean/string) — para generar tokens de prueba.

## Response parameters
- `access_token` (string) — identifica al usuario (Dueño), sus privilegios, y la aplicación. Formato: `APP_USR-<client_id>-<fecha_creación_MMddHH>-<hash>` en producción, o prefijo `TEST-` en sandbox. Vigencia determinada por `expires_in`.
- `token_type` (string) — "bearer"
- `expires_in` (number) — segundos de vigencia. **Default: 180 días (15552000 segundos).**
- `scope` (string) — scopes otorgados: "read", "write", "offline_access" (por defecto se dan todos salvo que se pida otra cosa).
- `user_id` (number) — ID de usuario MP del Dueño que autorizó.
- `refresh_token` (string) — para renovar el access_token sin pedir autorización de nuevo.
- `public_key` (string) — clave pública asociada al Dueño.
- `live_mode` (boolean)

## Errores (400)
- `invalid_client` — client_id y/o client_secret inválido
- `invalid_grant` — el authorization_code o refresh_token es inválido, expiró, fue revocado, se envió en el flujo incorrecto, pertenece a otro client, o el redirect_uri no coincide con el configurado
- `invalid_scope` — scope inválido, desconocido o mal formado (valores permitidos: "offline_access", "write", "read")
- `invalid_request` — falta un parámetro requerido, hay uno no soportado, duplicado, o está mal formado
- `unsupported_grant_type` — valores permitidos para grant_type: "authorization_code" o "refresh_token"
- `forbidden` — la llamada no autoriza acceso, posiblemente se está usando el token de otro usuario
- `unauthorized_client` — la aplicación no tiene un grant con el usuario, o los permisos (scopes) que tiene con este usuario no permiten crear un token

## Errores (429)
- `local_rate_limited` — la llamada no autoriza acceso, reintentar

## Ejemplo de request
```json
{
  "client_secret": "client_secret",
  "client_id": "client_id",
  "grant_type": "client_credentials",
  "code": "TG-XXXXXXXX-241983636",
  "code_verifier": "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU",
  "redirect_uri": "https://www.mercadopago.com.br/developers/example/redirect-url",
  "refresh_token": "TG-XXXXXXXX-241983636",
  "test_token": "false"
}
```

## Ejemplo de response
```json
{
  "access_token": "APP_USR-4934588586838432-XXXXXXXX-241983636",
  "token_type": "bearer",
  "expires_in": 15552000,
  "scope": "read write offline_access",
  "user_id": 241983636,
  "refresh_token": "TG-XXXXXXXX-241983636",
  "public_key": "APP_USR-d0a26210-XXXXXXXX-479f0400869e",
  "live_mode": true
}
```

## NOTA IMPORTANTE PARA EL DISEÑO
- El `access_token` obtenido acá es el que Bajoneá debe guardar por cada Dueño/comercio (relacionado a su cuenta), y es el que se usa como Authorization Bearer al llamar `POST /checkout/preferences` para crear la preferencia de pago EN NOMBRE de ese comercio (así el dinero llega directo a la cuenta MP del comercio, con el split vía `marketplace_fee` descontándose la comisión de Bajoneá).
- Expira a los 180 días por defecto — hay que implementar el refresh automático con `refresh_token` antes de que expire, o el comercio dejaría de poder cobrar sin que nadie se dé cuenta hasta que falle una preferencia.
- El flujo de autorización previo (antes de este POST) es: redirigir al Dueño a una URL de autorización de MP (`https://auth.mercadopago.com.ar/authorization?client_id=...&response_type=code&platform_id=mp&redirect_uri=...`), el Dueño loguea con SU cuenta de MP y autoriza, MP lo redirige de vuelta a `redirect_uri` con el `code` en query param, y ahí Bajoneá hace este POST con `grant_type=authorization_code` para obtener el `access_token` final. (Este paso previo de redirect no vino en este fetch — pendiente verificar el detalle exacto de esa URL de autorización si hace falta.)
# Origen (verificado por búsqueda + doc oficial): flujo previo de autorización OAuth
# https://www.mercadopago.com.ar/developers/en/docs/security/oauth/creation

# Paso previo al POST /oauth/token: pedir autorización al Dueño del comercio

Antes de poder hacer el POST a `/oauth/token` con `grant_type=authorization_code` (ver
`02-oauth-token.md`), Bajoneá debe redirigir al Dueño del comercio a esta URL para que
autorice el acceso desde SU cuenta de Mercado Pago:

```
https://auth.mercadopago.com.ar/authorization?client_id=APP_ID&response_type=code&platform_id=mp&redirect_uri=REDIRECT_URI
```

## Parámetros de la URL de autorización
- `client_id` — el ID de la aplicación de Bajoneá en Mercado Pago.
- `response_type=code` — fijo, siempre este valor.
- `platform_id=mp` — fijo.
- `redirect_uri` — debe coincidir EXACTAMENTE con la "Redirect URL" configurada en la
  aplicación de Bajoneá (no puede tener info variable en la URL misma; para pasar contexto
  adicional, como por ejemplo qué Dueño está autorizando, se usa el parámetro `state`).
- `state` (opcional, recomendado) — un ID random que Bajoneá genera y controla, para poder
  identificar de vuelta a qué Dueño/comercio corresponde esta autorización cuando MP redirija
  de vuelta. Útil para evitar CSRF y para saber "quién" autorizó sin depender de sesión.
- `code_challenge` / `code_challenge_method` (opcional, PKCE) — para mayor seguridad.

## Flujo completo end-to-end
1. Bajoneá genera la URL de arriba (con `state` identificando al Dueño/comercio que está
   vinculando su cuenta) y lo redirige ahí (por ejemplo desde una pantalla de "Configurar mi
   comercio" del Dueño en Bajoneá).
2. El Dueño es llevado a la página de Mercado Pago, inicia sesión con SU cuenta de MP (no la de
   Bajoneá) y ve una pantalla de consentimiento explícito sobre qué accesos está otorgando.
3. Si el Dueño autoriza, MP lo redirige de vuelta a `redirect_uri` con un query param `code`
   (formato `TG-XXXXXXXX-...`), válido por 10 minutos.
4. Bajoneá (desde el backend, NUNCA desde el frontend) hace el POST a `/oauth/token` con
   `grant_type=authorization_code`, el `code` recibido, `client_id`, `client_secret` y el mismo
   `redirect_uri` exacto, y recibe el `access_token` + `refresh_token` + `user_id` del Dueño.
5. Bajoneá guarda ese `access_token`/`refresh_token` asociado al Dueño/comercio en su base de
   datos (de forma segura — no en texto plano si se puede evitar).

## Validaciones que hace Mercado Pago del lado del vendedor (documentadas)
- El `redirect_uri` debe coincidir exactamente con lo configurado en la aplicación.
- Debe verificarse que el vendedor esté logueando con su cuenta principal, no una cuenta
  colaboradora.
- Se valida que el vendedor tenga el KYC correcto y no esté bloqueado por incumplimiento de
  políticas — esto conecta directo con el error `collector_does_not_comply_with_current_regulation`
  que puede aparecer después al crear la preferencia (ver `00-create-preference.md`): si el
  Dueño no completó la verificación de identidad en MP, no va a poder recibir pagos aunque el
  OAuth se haya completado "bien".

## Nota de seguridad (documentada explícitamente por MP)
> "Remember that you will use sensitive information from your sellers. Make sure you store it
> safely. Do not use it in the authentication URL and manage the entire process only from your
> server."

Esto confirma: todo el intercambio del `code` por el `access_token` (paso 4) tiene que hacerse
desde el backend de Bajoneá, nunca desde JS en el navegador del Dueño.
# Notas finales de verificación (esta sesión)

## Campo `marketplace` en la preferencia
No encontré una definición explícita del campo `marketplace` en la documentación indexada.
En todos los ejemplos reales de MP (request y response) aparece como un valor con formato
`MP-MKT-<número>`, generado y devuelto por MP mismo — nunca como un valor que el desarrollador
deba calcular o setear a mano. Conclusión razonable (no verificada al 100%): es un identificador
interno de MP para la relación marketplace-vendedor, que se resuelve solo según la cuenta/token
usada para crear la preferencia. Recomendación: no enviarlo en el request de Bajoneá (dejar que
MP lo complete), y revisarlo si en el futuro aparece algún error relacionado a este campo.

## GET /v1/payments/{id} (confirmar estado de un pago)
No llegué a verificar el detalle exacto por fetch en esta sesión (no apareció indexado bajo la
URL `checkout-pro-preferences/get-payment/get`). Es un endpoint estándar y muy documentado de
Mercado Pago en general — la forma es `GET https://api.mercadopago.com/v1/payments/{id}` con
Bearer token, devuelve entre otros: `status` (approved, pending, rejected, etc.),
`status_detail`, `transaction_amount`, `payer`, `external_reference`. Recomendación: verificar
esto puntualmente en el chat donde se diseñe el manejo del webhook, antes de que Claude Code
lo implemente — no es información que cambie la arquitectura general, así que no bloquea el
diseño de alto nivel del flujo.

## Webhooks / notificaciones de pago para Preferencias
Tampoco verificado por fetch directo en esta sesión. El scrape original tenía contenido sobre
IPN (Instant Payment Notification, el mecanismo más viejo) y Webhooks (el mecanismo más nuevo)
pero mezclado entre varias líneas de producto. Recomendación: cuando diseñemos el paso de
"Bajoneá recibe la notificación de que un pago se acreditó", conviene volver a la fuente oficial
puntualmente para ese endpoint/payload exacto, en vez de asumir el formato genérico de memoria.

## Por qué no seguí insistiendo con fetch en estos tres puntos
Son detalles de implementación (forma exacta de un payload, nombre exacto de un campo de
respuesta) que no cambian ninguna decisión de arquitectura ya tomada, y Claude Code va a poder
verificarlos con su propia herramienta de búsqueda en el momento de programarlos, con el
contexto específico de ese momento. Insistir ahora con más fetches solo demoraba la sesión sin
aportar a las decisiones que sí hacen falta cerrar ahora (qué API usar, cómo se calcula el
split, cómo se vincula OAuth).


# ==================== OAUTH (CONCEPTUAL Y BUENAS PRÁCTICAS) ====================

# Origen: https://www.mercadopago.com.ar/developers/es/docs/security/oauth/creation

# Get Access Token

Learn how to use the flows, also known as _grant types_, to obtain an Access Token and access the data exposed by an API. The existence of these flows arise to respond to all business scenarios that can appear in the consumption of APIs based on the type of consuming application, its degree of trust, and how the user interacts in the process.

The access flows available for generating the Access Token are:

- [Authorization code](/developers/en/docs/security/oauth/creation#bookmark_authorization_code): when credentials are to be used to access a resource on behalf of others.
- [Client credentials](/developers/en/docs/security/oauth/creation#bookmark_client_credentials): when credentials are to be used to access a resource on one's own behalf.

> WARNING
>
> Important
>
> If an Access Token generated from the **Authorization code** flow is invalid or expired, you can use the **Refresh Token** flow to exchange a temporary grant of type `refresh_token` for an Access Token. This means that the Access Token can be refreshed without the need for user interaction again after the authorization has been granted. For more information, visit [Renew Access Token](/developers/en/guides/additional-content/security/oauth/renewal).

## Authorization code

The flow is characterized by the intervention of the seller to explicitly authorize the application's access to their data and by the use of a code granted by the authentication server so that the application can obtain an Access Token and an associated refresh token.
 
Because it is a redirect-based flow, you must allow interaction with the seller's browser and receive the request through the authorization server redirect. In this flow, the application requests the seller's express consent to access the data by opening a web page in which the requested areas to be accessed are made explicit.

> WARNING
>
> Important
>
> Remember that you will use sensitive information from your sellers. Make sure you store it safely. Do not use it in the authentication URL and manage the entire process only from your server.
  
Once access is allowed, the server generates an access code that reaches the application through a redirect. In this step, the application requests access to the authentication server by sending the obtained code and application data. Once this is done, the server grants the Access Token and the refresh token to the application.

See below how to **configure the PKCE protocol** (a non-mandatory security protocol that provides an extra layer of protection, so it is recommended) and then **generate the Access Token**.

### Configure PKCE

The **PKCE** (Proof Key for Code Exchange) is a security protocol used with OAuth to protect against malicious code attacks during the exchange of authorization codes for an Access Token. It adds an extra layer of security by generating a verifier that is transformed into a challenge to ensure that even if the authorization code is intercepted, it is not useful without the original verifier.

Follow the steps below to enable and configure the use of the authorization code flow with PKCE.

1. First, on the [Application details](/developers/en/docs/your-integrations/application-details) screen, click **Edit** and **enable the use of the authorization code flow with PKCE**. With the field enabled, Mercado Pago will require the `code_challenge` and `code_method` fields in OAuth requests.
2. The fields can be generated in various ways, either through custom development or using SDKs. Follow the necessary steps described in [this official documentation](https://datatracker.ietf.org/doc/html/rfc7636#section-4) to generate the required fields.
3. After generating and encrypting the fields, it will be necessary to send the respective codes to Mercado Pago. To do this, send them via `query_params` using the authentication URL below.

```URL
https://auth.mercadopago.com/authorization?response_type=code&client_id=$APP_ID&redirect_uri=$YOUR_URL&code_challenge=$CODE_CHALLENGE&code_challenge_method=$CODE_METHOD
```

- **Redirect_uri**: URL provided in the "Redirect URL" field of [your application](/developers/en/docs/your-integrations/application-details).
- **Code_verifier**: code that should be generated, following the requirements for its functionality, which include: a random sequence of characters with a length between 43 and 128 characters, including uppercase letters, lowercase letters, numbers, and some special characters. For example: **47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU**.
- **Code_challenge**: next, it is necessary to create a `code_challenge` from the `code_verifier` using one of the following transformations:
  - If it's possible to use **S256**, it will be necessary to use this option by transforming the `code_verifier` into a `code_challenge` through `BASE64URL` encoding after applying the "SHA256" function.
  - If it's not possible to use **S256** for some technical reason and the server supports the **Plain** method, it's possible to set the c`ode_challenge` equal to the `code_verifier`.
- **Code_challenge_method**: is the method used to generate the `code_challenge`, as described in the above item. This field can be, for example, **S256** or **Plain**, depending on the encoding selected in the `code_challenge stage`. </br>

4. After correctly sending the codes to Mercado Pago, you will obtain the necessary authorization (`code_verifier`) for get the Access Token and perform PKCE verification on transactions made with OAuth.

### Get token

Access Token is the code used in different requests of public origin to access a protected resource. In this flow, that represents an authorization granted by a seller to a client application that contains scopes and a limited period of time for such access. Follow the steps below to obtain it.

> WARNING
>
> Attention
>
> It is recommended to carry out this procedure all at once together with the user, since the code received by the "Redirect URL" after authorization is valid for 10 minutes and the Access Token received through the endpoint is valid for 180 days (6 months).

1. Edit your application so that it contains your Redirect URL. See [Edit application](/developers/en/docs/your-integrations/application-details).
2. Send the **authentication URL** to the seller whose account you want to link to yours with the following fields:

  ```Authentication_URL
  https://auth.mercadopago.com/authorization?client_id=APP_ID&response_type=code&platform_id=mp&state=RANDOM_ID&redirect_uri= https://www.mercadopago.com.br/developers/example/redirect-url 
  ```

  |Field|Description|
  |---|---|
  |Client_id| Replace the "APP_ID" value with your **application number**. Check [Application ID](/developers/en/docs/your-integrations/application-details) for more information.|
  |State| Replace the "RANDOM_ID" value with an identifier that is unique for each attempt and does not include sensitive information so that you can identify who the received code is from. This way, you can ensure that the response belongs to a request initiated by the same application.|
  |Redirect_uri| Add the reported URL in the "Redirect URLs" field of your application. **Make sure that the redirect_uri is a static URL** Check [Application ID](/developers/en/docs/your-integrations/application-details) for more information.|

  > If you want to send additional parameters in the `redirect_uri`, use the `state` parameter to include that information. Otherwise, the call will receive an error response if the URL does not exactly match the application's configuration.

3. Wait for the seller to access the URL and allow access. Upon accessing the URL, the seller will be directed to Mercado Pago and must log into their account to carry out the authorization.
4. Check your server's **Redirect URL** to see the authorization code returned in the **code** parameter.
 
  ```Redirect_URL
  https://www.mercadopago.com.br/developers/example/redirect-url 
  ```
 
5. Send your [credentials](/developers/en/docs/your-integrations/credentials) (`client_id` and `client_secret`), the **authorization code** (`code`) returned and, if you have [configured the PKCE](/developers/en/docs/security/oauth/creation#bookmark_configure_pkce), the `code_verifier` to the [/oauth/token](/developers/en/reference/authentication/oauth/_oauth_token/post) endpoint to receive the Access Token in response.

[[[
```php
<?php
  $client = new OauthClient();
  $request = new OAuthCreateRequest();
  $request->client_secret = "CLIENT_SECRET";
  $request->client_id = "CLIENT_ID";
  $request->code = "CODE";
  $request->redirect_uri = "REDIRECT_URI";

  $client->create($request);
?>
```
```java

OauthClient client = new OauthClient();

String authorizationCode = "TG-XXXXXXXX-241983636";
client.createCredential(authorizationCode, null);
```
```node
const client = new MercadoPagoConfig({ accessToken: 'access_token', options: { timeout: 5000 } }); 

const oauth = new OAuth(client);

oauth.create({
	'client_secret': 'your-client-secret',
	'client_id': 'your-client-id',
	'code': 'return-of-getAuthorizationURL-function',
	'redirect_uri': 'redirect-uri'
}).then((result) => console.log(result))
	.catch((error) => console.log(error));
```
```curl
curl -X POST \
  'https://api.mercadopago.com/oauth/token'\
  -H 'Content-Type: application/json' \
  -d '{
  "client_id": "client_id",
  "client_secret": "client_secret",
  "code": "TG-XXXXXXXX-241983636",
  "grant_type": "authorization_code",
  "redirect_uri": " https://www.mercadopago.com.br/developers/example/redirect-url ",
  "test_token": "false"
}'
```
]]]

> To generate **sandbox** credentials for testing, send the `test_token` parameter with the value `true`.

## Client credentials

This flow is used when applications request an Access Token using only their own credentials and to access their own resources. The main difference compared to other flows is that the user does not interact in the process, and consequently, the application cannot act on behalf of the user.

### Get token

Access Token is the code used in different requests of public origin to access a protected resource. In this flow, the Access Token is obtained without user interaction and only to access the application's own resources.

Follow the steps below to obtain it.

1. Send your [credentials](/developers/en/docs/your-integrations/credentials) (`client_id` and `client_secret`) to the [/oauth/token](/developers/en/reference/authentication/oauth/_oauth_token/post) endpoint with the `client_credentials` code in the `grant_type` parameter to receive a new response with a new `access_token`.
2. Update the application with the Access Token received in the response. 

> WARNING
>
> Attention
> 
> **The received token is valid for 6 hours.** Don't forget to renew it before the expiration period so that your applications continue to work correctly.

[[[
```php
<?php
  $client = new OauthClient();
  $request = new OAuthCreateRequest();
  $request->client_secret = "CLIENT_SECRET";
  $request->client_id = "CLIENT_ID";

  $client->create($request);
?>
```
```node
const client = new MercadoPagoConfig({ accessToken: 'access_token', options: { timeout: 5000 } }); 

const oauth = new OAuth(client);

oauth.create({
	'client_secret': 'your-client-secret',
	'client_id': 'your-client-id',
}).then((result) => console.log(result))
	.catch((error) => console.log(error));
```
```curl
curl -X POST \
  'https://api.mercadopago.com/oauth/token'\
  -H 'Content-Type: application/json' \
  -d '{
  "client_id": "client_id",
  "client_secret": "client_secret",
  "grant_type": "client_credentials",
}'
```
]]]


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/security/oauth/best-practices

# Best practices for OAuth integration

When using OAuth, it is important to take certain aspects into account so that the integration works correctly.

Below, you will find a guide to possible errors and good practices to keep in mind.

## Correct use of values in request headers 

Always use the `accept` and `content-type` headers in your POST request. Be careful not to add values to headers that are not part of the integration to avoid getting a response error.

![oauth_header](/images/oauth/oauth_header-v1.png)

## Correct use of 'params' values

In your POST call, be careful to use only the requested `params` values. Do not add any other non-required values, otherwise you will receive an error code in response.

![oauth_params](/images/oauth/oauth-1-v1.png)

## Correct use of Query Params

Remember not to send any parameters inside Query Params. Send the parameters within the request body as indicated in [API Reference](/developers/en/reference/authentication/oauth/_oauth_token/post).

![oauth_queryparams](/images/oauth/oauth_queryparams_v2.png)

## Correct use of the 'grant_type' field

Always use the `grant_type` field in your requests with the `authorization_code` or `client_credentials` values. Remember that if you send another value, it is possible that you will receive an error in response.

![oauth_grant_type](/images/oauth/oauth_granttype_v2.png)

## Using the 'state' field in the 'authorization code' request

To enhance integration security, we recommend including the `state` parameter in the `authorization code` request flow. This way, you can ensure that the response belongs to a request initiated by the same application.

**Make sure that the `redirect_uri` is a static URL**. If you want to send additional parameters in that URL, use the `state` parameter to include that information. Otherwise, the call will receive an error response if the `redirect_uri` does not exactly match the application's configuration.

![oauth_state](/images/oauth/oauth_state_v4-v1.png)

To find more information about the request, its parameters, and the possible success and error responses you may receive, go to [API Reference](/developers/en/reference/authentication/oauth/_oauth_token/post) documentation.


---



---

**URL:** https://www.mercadopago.com.ar/developers/es/docs/security/oauth/introduction

[![Mercado Pago](https://http2.mlstatic.com/frontend-assets/dx-template-lib/assets/logo-mercadopago.svg)

DEVELOPERS](https://www.mercadopago.com.ar/developers/es)

[Ingresar](https://www.mercadolibre.com/jms/mla/lgz/login?platform_id=mp&go=)

Primeros pasos

Pagos online

Pagos presenciales

Apps para plataformas

Herramientas

APIs

SDKs

Recursos para IA

Copiar página para LLMsMostrar como Markdown

# OAuth

![](data:image/svg+xml;base64,PHN2ZyBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJub25lIiBvdmVyZmxvdz0idmlzaWJsZSIgc3R5bGU9ImRpc3BsYXk6IGJsb2NrOyIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxnIGlkPSJMaW5rIj4KPGcgaWQ9IlZlY3RvciI+CjxwYXRoIGQ9Ik0xMC4yMTc3IDcuMTIzMzRDMTEuNDc4IDcuMTIzMzUgMTIuNjg3IDcuNjIzNzggMTMuNTc4MSA4LjUxNDk0TDE0LjUzMTIgOS40NjgwNkMxNC44MjQxIDkuNzYwOTYgMTQuODI0MSAxMC4yMzY3IDE0LjUzMTIgMTAuNTI5NkMxNC4yMzg0IDEwLjgyMjEgMTMuNzYzNSAxMC44MjIxIDEzLjQ3MDcgMTAuNTI5NkwxMi41MTY2IDkuNTc1NDhDMTEuOTA2OCA4Ljk2NTg5IDExLjA4IDguNjIzMzUgMTAuMjE3NyA4LjYyMzM0QzkuMzU1MzYgOC42MjMzOCA4LjUyNzY5IDguOTY1NjggNy45MTc5MiA5LjU3NTQ4TDQuODg1NyAxMi42MDc3QzMuMzY1ODQgMTQuMTI4IDMuMzY1NjkgMTYuNTkzNCA0Ljg4NTcgMTguMTEzNkM2LjQwNTcxIDE5LjYzMzMgOC44NzAyOSAxOS42MzI5IDEwLjM5MDYgMTguMTEzNkwxMS4yNzgzIDE3LjIyNDlDMTEuNTcxIDE2LjkzMTkgMTIuMDQ1OCAxNi45MzIyIDEyLjMzODggMTcuMjI0OUMxMi42MzE3IDE3LjUxNzYgMTIuNjMyNSAxNy45OTI1IDEyLjMzOTggMTguMjg1NEwxMS40NTIxIDE5LjE3MzFDOS4zNDYwNyAyMS4yNzg3IDUuOTMxMTEgMjEuMjc5OCAzLjgyNTE1IDE5LjE3NDFDMS43MTk0MiAxNy4wNjgyIDEuNzE5NTQgMTMuNjUzMiAzLjgyNTE1IDExLjU0NzJMNi44NTczOCA4LjUxNDk0QzcuNzQ4NDUgNy42MjM4MSA4Ljk1NzUyIDcuMTIzMzggMTAuMjE3NyA3LjEyMzM0WiIgZmlsbD0iIzQzNENFNCIvPgo8cGF0aCBkPSJNMTIuNTQ3OCAzLjgyNDUxQzE0LjY1MzcgMS43MTg4NSAxOC4wNjg3IDEuNzE4OTggMjAuMTc0OCAzLjgyNDUxQzIyLjI4MDUgNS45MzA1MiAyMi4yODA1IDkuMzQ1NDUgMjAuMTc0OCAxMS40NTE1TDE3LjE0MjUgMTQuNDgzN0MxNi4yNTE0IDE1LjM3NDggMTUuMDQyNCAxNS44NzUzIDEzLjc4MjIgMTUuODc1M0MxMi41MjIgMTUuODc1MiAxMS4zMTI5IDE1LjM3NDggMTAuNDIxOCAxNC40ODM3TDkuNDY4NyAxMy41Mjk2QzkuMTc2MjcgMTMuMjM2NyA5LjE3NiAxMi43NjE4IDkuNDY4NyAxMi40NjlDOS43NjE0NiAxMi4xNzY1IDEwLjIzNjQgMTIuMTc2NyAxMC41MjkzIDEyLjQ2OUwxMS40ODI0IDEzLjQyMzFDMTIuMDkyMSAxNC4wMzI5IDEyLjkxOTkgMTQuMzc1MiAxMy43ODIyIDE0LjM3NTNDMTQuNjQ0NCAxNC4zNzUzIDE1LjQ3MTMgMTQuMDMyNyAxNi4wODEgMTMuNDIzMUwxOS4xMTMyIDEwLjM5MDlDMjAuNjMzMyA4Ljg3MDY2IDIwLjYzMzMgNi40MDUzIDE5LjExMzIgNC44ODUwNUMxNy41OTMxIDMuMzY1ODUgMTUuMTI5NCAzLjM2NTc5IDEzLjYwOTMgNC44ODUwNUwxMi43MjE2IDUuNzczNzNDMTIuNDI4OSA2LjA2NjY5IDExLjk1NDEgNi4wNjY0MiAxMS42NjExIDUuNzczNzNDMTEuMzY4NCA1LjQ4MDk5IDExLjM2NzUgNS4wMDYxMyAxMS42NjAxIDQuNzEzMThMMTIuNTQ3OCAzLjgyNDUxWiIgZmlsbD0iIzQzNENFNCIvPgo8L2c+CjwvZz4KPC9zdmc+Cg==)

OAuth es un protocolo de autorización que permite que las aplicaciones tengan acceso limitado a la información privada de las cuentas de Mercado Pago. A través del protocolo HTTP, introduce una capa de autenticación y autorización, que consiste en solicitar acceso a los recursos protegidos de los vendedores mediante un **Access token** limitado a una aplicación en particular. Esto se logra sin necesidad de obtener las credenciales de los vendedores a través de los **flujos de acceso**.

Nota

El uso del protocolo OAuth difiere del proceso de uso compartido de credenciales. OAuth no aborda cuestiones relacionadas con la autenticación del cliente, ni información relacionada con la misma. Su responsabilidad radica en los métodos de obtención de un token para acceder a un recurso.
  
  
A la hora de utilizar OAuth, es importante tener en cuenta ciertos aspectos para que la integración funcione correctamente. Accede a las [Buenas prácticas de integración de OAuth](/developers/es/docs/security/oauth/best-practices) y consulta una guía de posibles errores y de buenas prácticas a tener en cuenta.

## Access Token

![](data:image/svg+xml;base64,PHN2ZyBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJub25lIiBvdmVyZmxvdz0idmlzaWJsZSIgc3R5bGU9ImRpc3BsYXk6IGJsb2NrOyIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiB2aWV3Qm94PSIwIDAgMjAgMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxnIGlkPSJMaW5rIj4KPGcgaWQ9IlZlY3RvciI+CjxwYXRoIGQ9Ik04LjUxNDc3IDUuOTM2MTFDOS41NjQ5OCA1LjkzNjEyIDEwLjU3MjUgNi4zNTMxNSAxMS4zMTUxIDcuMDk1NzhMMTIuMTA5MyA3Ljg5MDA1QzEyLjM1MzQgOC4xMzQxMyAxMi4zNTM0IDguNTMwNTggMTIuMTA5MyA4Ljc3NDY1QzExLjg2NTMgOS4wMTgzOCAxMS40Njk2IDkuMDE4MzggMTEuMjI1NSA4Ljc3NDY1TDEwLjQzMDUgNy45Nzk1N0M5LjkyMjMzIDcuNDcxNTggOS4yMzMzIDcuMTg2MTIgOC41MTQ3NyA3LjE4NjExQzcuNzk2MTQgNy4xODYxNSA3LjEwNjQxIDcuNDcxNCA2LjU5ODI3IDcuOTc5NTdMNC4wNzE0MSAxMC41MDY0QzIuODA0ODcgMTEuNzczMyAyLjgwNDc1IDEzLjgyNzggNC4wNzE0MSAxNS4wOTQ2QzUuMzM4MDkgMTYuMzYxMSA3LjM5MTkxIDE2LjM2MDggOC42NTg4MiAxNS4wOTQ2TDkuMzk4NTYgMTQuMzU0MUM5LjY0MjUxIDE0LjExIDEwLjAzODIgMTQuMTEwMiAxMC4yODI0IDE0LjM1NDFDMTAuNTI2NCAxNC41OTggMTAuNTI3MSAxNC45OTM3IDEwLjI4MzIgMTUuMjM3OUw5LjU0MzQyIDE1Ljk3NzZDNy43ODgzOSAxNy43MzIzIDQuOTQyNTkgMTcuNzMzMiAzLjE4NzYyIDE1Ljk3ODRDMS40MzI4NSAxNC4yMjM1IDEuNDMyOTUgMTEuMzc3NyAzLjE4NzYyIDkuNjIyNjRMNS43MTQ0OCA3LjA5NTc4QzYuNDU3MDQgNi4zNTMxOCA3LjQ2NDYgNS45MzYxNSA4LjUxNDc3IDUuOTM2MTFaIiBmaWxsPSIjNDM0Q0U0Ii8+CjxwYXRoIGQ9Ik0xMC40NTY1IDMuMTg3MDlDMTIuMjExNSAxLjQzMjM3IDE1LjA1NzMgMS40MzI0OSAxNi44MTIzIDMuMTg3MDlDMTguNTY3MSA0Ljk0MjEgMTguNTY3MSA3Ljc4Nzg4IDE2LjgxMjMgOS41NDI4OEwxNC4yODU0IDEyLjA2OTdDMTMuNTQyOSAxMi44MTIzIDEyLjUzNTMgMTMuMjI5NCAxMS40ODUyIDEzLjIyOTRDMTAuNDM1IDEzLjIyOTMgOS40Mjc0IDEyLjgxMjMgOC42ODQ4NiAxMi4wNjk3TDcuODkwNTkgMTEuMjc0N0M3LjY0Njg5IDExLjAzMDYgNy42NDY2NyAxMC42MzQ4IDcuODkwNTkgMTAuMzkwOUM4LjEzNDU1IDEwLjE0NzEgOC41MzAzMiAxMC4xNDcyIDguNzc0MzggMTAuMzkwOUw5LjU2ODY1IDExLjE4NkMxMC4wNzY4IDExLjY5NDEgMTAuNzY2NiAxMS45NzkzIDExLjQ4NTIgMTEuOTc5NEMxMi4yMDM2IDExLjk3OTQgMTIuODkyNyAxMS42OTM5IDEzLjQwMDggMTEuMTg2TDE1LjkyNzcgOC42NTkwOUMxNy4xOTQ0IDcuMzkyMjIgMTcuMTk0NCA1LjMzNzc1IDE1LjkyNzcgNC4wNzA4OEMxNC42NjA5IDIuODA0ODggMTIuNjA3OCAyLjgwNDgzIDExLjM0MTEgNC4wNzA4OEwxMC42MDE0IDQuODExNDRDMTAuMzU3NCA1LjA1NTU4IDkuOTYxNzYgNS4wNTUzNSA5LjcxNzU3IDQuODExNDRDOS40NzM2NCA0LjU2NzQ5IDkuNDcyOTQgNC4xNzE3OCA5LjcxNjc2IDMuOTI3NjVMMTAuNDU2NSAzLjE4NzA5WiIgZmlsbD0iIzQzNENFNCIvPgo8L2c+CjwvZz4KPC9zdmc+Cg==)

És un código utilizado en diferentes *requests* de origen público para acceder a un recurso protegido y representa una autorización otorgada por un vendedor a una aplicación cliente, que contiene *scopes* y un tiempo de vigencia limitado para dicho acceso.

### Temporary grants

![](data:image/svg+xml;base64,PHN2ZyBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJub25lIiBvdmVyZmxvdz0idmlzaWJsZSIgc3R5bGU9ImRpc3BsYXk6IGJsb2NrOyIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiB2aWV3Qm94PSIwIDAgMjAgMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxnIGlkPSJMaW5rIj4KPGcgaWQ9IlZlY3RvciI+CjxwYXRoIGQ9Ik04LjUxNDc3IDUuOTM2MTFDOS41NjQ5OCA1LjkzNjEyIDEwLjU3MjUgNi4zNTMxNSAxMS4zMTUxIDcuMDk1NzhMMTIuMTA5MyA3Ljg5MDA1QzEyLjM1MzQgOC4xMzQxMyAxMi4zNTM0IDguNTMwNTggMTIuMTA5MyA4Ljc3NDY1QzExLjg2NTMgOS4wMTgzOCAxMS40Njk2IDkuMDE4MzggMTEuMjI1NSA4Ljc3NDY1TDEwLjQzMDUgNy45Nzk1N0M5LjkyMjMzIDcuNDcxNTggOS4yMzMzIDcuMTg2MTIgOC41MTQ3NyA3LjE4NjExQzcuNzk2MTQgNy4xODYxNSA3LjEwNjQxIDcuNDcxNCA2LjU5ODI3IDcuOTc5NTdMNC4wNzE0MSAxMC41MDY0QzIuODA0ODcgMTEuNzczMyAyLjgwNDc1IDEzLjgyNzggNC4wNzE0MSAxNS4wOTQ2QzUuMzM4MDkgMTYuMzYxMSA3LjM5MTkxIDE2LjM2MDggOC42NTg4MiAxNS4wOTQ2TDkuMzk4NTYgMTQuMzU0MUM5LjY0MjUxIDE0LjExIDEwLjAzODIgMTQuMTEwMiAxMC4yODI0IDE0LjM1NDFDMTAuNTI2NCAxNC41OTggMTAuNTI3MSAxNC45OTM3IDEwLjI4MzIgMTUuMjM3OUw5LjU0MzQyIDE1Ljk3NzZDNy43ODgzOSAxNy43MzIzIDQuOTQyNTkgMTcuNzMzMiAzLjE4NzYyIDE1Ljk3ODRDMS40MzI4NSAxNC4yMjM1IDEuNDMyOTUgMTEuMzc3NyAzLjE4NzYyIDkuNjIyNjRMNS43MTQ0OCA3LjA5NTc4QzYuNDU3MDQgNi4zNTMxOCA3LjQ2NDYgNS45MzYxNSA4LjUxNDc3IDUuOTM2MTFaIiBmaWxsPSIjNDM0Q0U0Ii8+CjxwYXRoIGQ9Ik0xMC40NTY1IDMuMTg3MDlDMTIuMjExNSAxLjQzMjM3IDE1LjA1NzMgMS40MzI0OSAxNi44MTIzIDMuMTg3MDlDMTguNTY3MSA0Ljk0MjEgMTguNTY3MSA3Ljc4Nzg4IDE2LjgxMjMgOS41NDI4OEwxNC4yODU0IDEyLjA2OTdDMTMuNTQyOSAxMi44MTIzIDEyLjUzNTMgMTMuMjI5NCAxMS40ODUyIDEzLjIyOTRDMTAuNDM1IDEzLjIyOTMgOS40Mjc0IDEyLjgxMjMgOC42ODQ4NiAxMi4wNjk3TDcuODkwNTkgMTEuMjc0N0M3LjY0Njg5IDExLjAzMDYgNy42NDY2NyAxMC42MzQ4IDcuODkwNTkgMTAuMzkwOUM4LjEzNDU1IDEwLjE0NzEgOC41MzAzMiAxMC4xNDcyIDguNzc0MzggMTAuMzkwOUw5LjU2ODY1IDExLjE4NkMxMC4wNzY4IDExLjY5NDEgMTAuNzY2NiAxMS45NzkzIDExLjQ4NTIgMTEuOTc5NEMxMi4yMDM2IDExLjk3OTQgMTIuODkyNyAxMS42OTM5IDEzLjQwMDggMTEuMTg2TDE1LjkyNzcgOC42NTkwOUMxNy4xOTQ0IDcuMzkyMjIgMTcuMTk0NCA1LjMzNzc1IDE1LjkyNzcgNC4wNzA4OEMxNC42NjA5IDIuODA0ODggMTIuNjA3OCAyLjgwNDgzIDExLjM0MTEgNC4wNzA4OEwxMC42MDE0IDQuODExNDRDMTAuMzU3NCA1LjA1NTU4IDkuOTYxNzYgNS4wNTUzNSA5LjcxNzU3IDQuODExNDRDOS40NzM2NCA0LjU2NzQ5IDkuNDcyOTQgNC4xNzE3OCA5LjcxNjc2IDMuOTI3NjVMMTAuNDU2NSAzLjE4NzA5WiIgZmlsbD0iIzQzNENFNCIvPgo8L2c+CjwvZz4KPC9zdmc+Cg==)

Los ***temporary grants*** son códigos temporales utilizados para ser intercambiados por un Access Token. A diferencia de los Access Token, sólo pueden ser usados para llamadas con el servidor de autorización y nunca se envían a servidores de recursos. Los tipos de *temporary grants* son:

* `authorization_code`: tiene una duración de 10 minutos y su uso es único.
* `refresh_token`: tiene una duración de 6 meses y puede ser reutilizado.

Si deseas conocer cómo obtener el Access Token, accede a [nuestra documentación](/developers/es/docs/additional-content/security/oauth/creation). También puedes consultar la información necesaria para saber cómo [renovarlo](/developers/es/docs/additional-content/security/oauth/renewal).

## Flujos de acceso (grant types)

![](data:image/svg+xml;base64,PHN2ZyBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJub25lIiBvdmVyZmxvdz0idmlzaWJsZSIgc3R5bGU9ImRpc3BsYXk6IGJsb2NrOyIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiB2aWV3Qm94PSIwIDAgMjAgMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxnIGlkPSJMaW5rIj4KPGcgaWQ9IlZlY3RvciI+CjxwYXRoIGQ9Ik04LjUxNDc3IDUuOTM2MTFDOS41NjQ5OCA1LjkzNjEyIDEwLjU3MjUgNi4zNTMxNSAxMS4zMTUxIDcuMDk1NzhMMTIuMTA5MyA3Ljg5MDA1QzEyLjM1MzQgOC4xMzQxMyAxMi4zNTM0IDguNTMwNTggMTIuMTA5MyA4Ljc3NDY1QzExLjg2NTMgOS4wMTgzOCAxMS40Njk2IDkuMDE4MzggMTEuMjI1NSA4Ljc3NDY1TDEwLjQzMDUgNy45Nzk1N0M5LjkyMjMzIDcuNDcxNTggOS4yMzMzIDcuMTg2MTIgOC41MTQ3NyA3LjE4NjExQzcuNzk2MTQgNy4xODYxNSA3LjEwNjQxIDcuNDcxNCA2LjU5ODI3IDcuOTc5NTdMNC4wNzE0MSAxMC41MDY0QzIuODA0ODcgMTEuNzczMyAyLjgwNDc1IDEzLjgyNzggNC4wNzE0MSAxNS4wOTQ2QzUuMzM4MDkgMTYuMzYxMSA3LjM5MTkxIDE2LjM2MDggOC42NTg4MiAxNS4wOTQ2TDkuMzk4NTYgMTQuMzU0MUM5LjY0MjUxIDE0LjExIDEwLjAzODIgMTQuMTEwMiAxMC4yODI0IDE0LjM1NDFDMTAuNTI2NCAxNC41OTggMTAuNTI3MSAxNC45OTM3IDEwLjI4MzIgMTUuMjM3OUw5LjU0MzQyIDE1Ljk3NzZDNy43ODgzOSAxNy43MzIzIDQuOTQyNTkgMTcuNzMzMiAzLjE4NzYyIDE1Ljk3ODRDMS40MzI4NSAxNC4yMjM1IDEuNDMyOTUgMTEuMzc3NyAzLjE4NzYyIDkuNjIyNjRMNS43MTQ0OCA3LjA5NTc4QzYuNDU3MDQgNi4zNTMxOCA3LjQ2NDYgNS45MzYxNSA4LjUxNDc3IDUuOTM2MTFaIiBmaWxsPSIjNDM0Q0U0Ii8+CjxwYXRoIGQ9Ik0xMC40NTY1IDMuMTg3MDlDMTIuMjExNSAxLjQzMjM3IDE1LjA1NzMgMS40MzI0OSAxNi44MTIzIDMuMTg3MDlDMTguNTY3MSA0Ljk0MjEgMTguNTY3MSA3Ljc4Nzg4IDE2LjgxMjMgOS41NDI4OEwxNC4yODU0IDEyLjA2OTdDMTMuNTQyOSAxMi44MTIzIDEyLjUzNTMgMTMuMjI5NCAxMS40ODUyIDEzLjIyOTRDMTAuNDM1IDEzLjIyOTMgOS40Mjc0IDEyLjgxMjMgOC42ODQ4NiAxMi4wNjk3TDcuODkwNTkgMTEuMjc0N0M3LjY0Njg5IDExLjAzMDYgNy42NDY2NyAxMC42MzQ4IDcuODkwNTkgMTAuMzkwOUM4LjEzNDU1IDEwLjE0NzEgOC41MzAzMiAxMC4xNDcyIDguNzc0MzggMTAuMzkwOUw5LjU2ODY1IDExLjE4NkMxMC4wNzY4IDExLjY5NDEgMTAuNzY2NiAxMS45NzkzIDExLjQ4NTIgMTEuOTc5NEMxMi4yMDM2IDExLjk3OTQgMTIuODkyNyAxMS42OTM5IDEzLjQwMDggMTEuMTg2TDE1LjkyNzcgOC42NTkwOUMxNy4xOTQ0IDcuMzkyMjIgMTcuMTk0NCA1LjMzNzc1IDE1LjkyNzcgNC4wNzA4OEMxNC42NjA5IDIuODA0ODggMTIuNjA3OCAyLjgwNDgzIDExLjM0MTEgNC4wNzA4OEwxMC42MDE0IDQuODExNDRDMTAuMzU3NCA1LjA1NTU4IDkuOTYxNzYgNS4wNTUzNSA5LjcxNzU3IDQuODExNDRDOS40NzM2NCA0LjU2NzQ5IDkuNDcyOTQgNC4xNzE3OCA5LjcxNjc2IDMuOTI3NjVMMTAuNDU2NSAzLjE4NzA5WiIgZmlsbD0iIzQzNENFNCIvPgo8L2c+CjwvZz4KPC9zdmc+Cg==)

Los flujos, también llamados *grant types*, se refieren a la forma en que una aplicación obtiene un Access Token, credencial permite acceder a los datos expuestos a través de una API. En el caso de Mercado Pago, hay tres flujos de acceso disponibles:

* **Authorization code**: flujo basado en redirección y que debe ser usado si se van a usar credenciales para acceder a un recurso a nombre de un tercero. Está caracterizado por la intervención del usuario para autorizar explícitamente el acceso a sus datos por medio de la aplicación, y por el uso de un código proporcionado por el servidor de autenticación para que esta aplicación pueda obtener un Access Token y un `refresh_token` asociado. Puedes ver más información dirigiéndote a [Obtener Access Token](/developers/es/docs/security/oauth/creation#bookmark_authorization_code).
* **Refresh token**: en caso de que un Access Token generado a partir del flujo *Authorization code* sea inválido o haya expirado, este flujo se utilizará para intercambiar una concesión temporal del tipo `refresh_token` por un Access Token. Es decir, permitirá que el Access Token se actualice sin una nueva interacción del usuario luego de haber concedido la autorización por el flujo *Authorization code*. Puedes ver más información accediendo a [Renovar Access Token](/developers/es/docs/additional-content/security/oauth/renewal).
* **Client credentials**: se van a usar credenciales para acceder a un recurso en nombre propio, o sea, se utiliza para obtener un Access Token sin interacción del usuario. Es útil para instancias en que las aplicaciones solicitan este Access Token usando solo sus propias credenciales para acceder a sus propios recursos, sin permitir actuar en nombre de un usuario ni acceder a sus datos. Puedes ver más información en la documentación [Obtener Access Token](/developers/es/docs/security/oauth/creation#bookmark_client_credentials).

PKCE (Proof Key for Code Exchange)

Si vas a utilizar el flujo **Authorization code** para obtener el Access Token, puedes configurar el **PKCE** (*Proof Key for Code Exchange*), un protocolo de seguridad utilizado con OAuth para proteger contra ataques de código malicioso durante el intercambio de códigos de autorización por Access Token. Añade una capa extra de seguridad generando un *verifier* que se transforma en un *challenge* para asegurar que, incluso si el código de autorización es interceptado, no sea útil sin el *verifier* original. Consulta [Configurar PKCE](/developers/es/docs/security/oauth/creation#:~:text=Access%20Token.-,Configurar%20PKCE,-El%20PKCE%20) para obtener más información.

[AnteriorIntroducciónConoce los protocolos y medidas de seguridad que aplicamos en Mercado Pago.](/developers/es/docs/security/landing-hub)

[PróximoObtener Access TokenAprende a utilizar los flujos (grant types) para obtener un Access Token y acceder a los datos expuestos por una API.](/developers/es/docs/security/oauth/creation)

¿Te sirvió este contenido?

SíNo


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/security/oauth/renewal

# Renew Access Token
 
The **Refresh token** flow is used to exchange a **temporary grants** of type `refresh_token` for an Access Token when the current Access Token**is close to expiry**. The Access Token received through the endpoint is **valid for 180 days**, after which the entire authorization flow must be reconfigured.
 
Additionally, the flow allows you to continue using a valid Access Token with the same characteristics as the original token without the need for a new interaction with the user. By performing this flow, the original token is exchanged for a new one which also offers the ability to limit scopes by returning a new refresh token for future exchange.
 
> WARNING
>
> Important
>
> This flow can only be used if the application return the `scope` parameter indicating the value `offline_access` and the vendor has previously authorized this action through the Authorization code flow.
 
Follow the steps below to renew the **Access Token**.
 
1. Send the `refresh_token` code, your [credentials](/developers/en/docs/your-integrations/credentials), and the `authorization_code` (see [Creation](/developers/en/docs/security/oauth/creation#bookmark_authorization_code)) to the [/oauth/token](/developers/en/reference/authentication/oauth/_oauth_token/post) endpoint with the `refresh_token` code in the `grant_type` string to receive a new response with a new `access_token` and a new `refresh_token`.
2. Update the application with the Access Token received in the response.
 
> WARNING
>
> Important
>
> Remember that every time you refresh the `access_token`, the `refresh_token` will also be refreshed, so you will need to store it again.

[[[
```php
<?php
  $client = new OauthClient();
  $request = new OAuthRefreshRequest();
  $request->client_secret = "CLIENT_SECRET";
  $request->client_id = "CLIENT_ID";
  $request->refresh_token = "REFRESH_TOKEN";

  $client->refresh($request);
?>
```
```java

OauthClient client = new OauthClient();

String refreshtoken = "TG-XXXXXXXX-241983636";
client.createCredential(refreshtoken, null);
```
```node
const client = new MercadoPagoConfig({ accessToken: 'access_token', options: { timeout: 5000 } });

const oauth = new OAuth(client);

oauth.refresh({
	'client_secret': 'your-client-secret',
	'client_id': 'your-client-id',
	'refresh_token': 'refresh-token'
}).then((result) => console.log(result))
	.catch((error) => console.log(error));
```
```curl
curl -X POST \
'https://api.mercadopago.com/oauth/token'\
-H 'Content-Type: application/json' \
-d '{
 "client_id": "client_id",
 "client_secret": "client_secret",
 "grant_type": "refresh_token",
 "refresh_token": "TG-XXXXXXXX-241983636"
}'
```
]]]


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/security/oauth/apis-map

# APIs map
 
The following actions are available for **OAuth**.

|Action|Description|
|---|---|
|[Create and refresh token](https://www.mercadopago[FAKER][URL][DOMAIN]/developers/en/reference/authentication/oauth/_oauth_token/post) | To create or refresh the necessary token to operate your application in the name of a seller. |


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/security/oauth/management

# Manage Access Token
 
Currently there are different ways in which the **Access tokens** and yours **temporary grants** created can be disabled and invalidated to authorize requests for protected resources or to exchange them for new tokens.
 
* **Expiration**: after the time set at the time of creation, the token automatically expires and cannot be obtained.
* **User password change**: there are password change flows where the seller can revoke all your credentials, including associated tokens and temporary grants.
* **Authorization revocation**: revoking an authorization between the seller and the application triggers the deletion of all tokens and temporary grants associated with them.
* **Laundering of credentials for fraud**: it is possible that the Information Security and Fraud Prevention department performs a complete update of a user's credentials. This triggers the deletion of all tokens and temporary grants associated with the seller in question.
* **User session cleanup**: enables refresh of all vendor tokens and temporary grants.
* **Application elimination**: when an application is eliminated, all tokens and temporary grants belonging to it are deleted.
 
You can receive webhook notifications every time a seller authorizes or deauthorizes your application. To configure them, read [Dashboard](/developers/en/guides/additional-content/your-integrations/dashboard).

To configure them, see more information on [Notifications](/developers/en/docs/your-integrations/notifications) documentation.


---

# Documentación - Mercado Pago Developers


---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/additional-content/security/oauth/api-map

# APIs map
 
The following actions are available for **OAuth**.

|Action|Description|
|---|---|
|[Create and refresh token](https://www.mercadopago[FAKER][URL][DOMAIN]/developers/en/reference/authentication/oauth/_oauth_token/post) | To create or refresh the necessary token to operate your application in the name of a seller. |


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/additional-content/security/oauth/creation

# Obtener Access Token

Aprende a utilizar los flujos, también conocidos como _grant types_, para obtener un Access Token y acceder a los datos expuestos por una API. Estos flujos responden  a todos los escenarios de negocios que pueden aparecer en el consumo de APIs con base en el tipo de aplicación consumidora, su grado de confianza y cómo es la interacción del usuario en el proceso.

Los flujos de acceso disponibles para la generación del Access Token son:

- [Authorization code](/developers/es/docs/security/oauth/creation#bookmark_authorization_code): se van a usar credenciales para acceder a un recurso a nombre de un tercero.
- [Client credentials](/developers/es/docs/security/oauth/creation#bookmark_client_credentials): se van a usar credenciales para acceder a un recurso en nombre propio.

> WARNING
>
> Importante
>
> Si un Access Token generado a partir del flujo **Authorization code** es inválido o ha expirado, podrás utilizar el flujo **Refresh Token** para intercambiar una concesión temporal del tipo `refresh_token` por un Access Token. Esto  permite que el Access Token se actualice sin la necesidad de una nueva interacción del usuario después de la autorización concedida. Para más información, visita la documentación [Renovar Access Token](/developers/es/guides/additional-content/security/oauth/renewal).

## Authorization code

Este flujo se caracteriza por la intervención del vendedor para autorizar explícitamente el acceso de la aplicación a sus datos, y por el uso de un código otorgado por el servidor de autenticación para que la aplicación pueda obtener un Access Token y un _refresh token_ asociado.
Como se trata de un flujo basado en la redirección, debes permitir la interacción con el navegador del vendedor y recibir el `request` a través de la redirección del servidor de autorización. En este flujo, la aplicación solicita al vendedor el consentimiento expreso para acceder a los datos mediante la apertura de una página web, en la que se explicitan los ámbitos para los que se solicita el acceso.

> WARNING
>
> Importante
>
> Recuerda que utilizarás información sensible de tus vendedores. Asegúrate de guardarla de forma segura. No la utilices en la URL de autenticación y gestiona todo el proceso únicamente desde tu servidor.

Una vez autorizado, el servidor genera un código de acceso que llega a la aplicación a través de una redirección. En este paso, la aplicación solicita acceso al servidor de autenticación enviando el código obtenido y sus datos. Una vez hecho esto, el servidor otorga el Access Token y el _refresh token_ a la aplicación.

Mira a continuación cómo **configurar el protocolo PKCE** (un protocolo de seguridad no obligatorio que brinda una capa de protección extra, por lo que es recomendado) y luego **generar el Access Token**.

### Configurar PKCE

El **PKCE** (_Proof Key for Code Exchange_) es un protocolo de seguridad utilizado con OAuth para proteger contra ataques de código malicioso durante el intercambio de códigos de autorización por Access Token. Añade una capa adicional de seguridad generando un _verifier_ que se transforma en un _challenge_ para asegurar que, incluso si el código de autorización es interceptado, no sea útil sin el _verifier_ original.

Siga los pasos a continuación para habilitar y configurar el uso del flujo de código de autorización con PKCE.

1. Primero, en la pantalla de [Detalles de aplicación](/developers/es/docs/your-integrations/application-details), haz clic en **Edita**r y **habilite el uso del flujo de código de autorización con PKCE**. Con el campo habilitado, Mercado Pago comenzará a **requerir como obligatorios** los campos `code_challenge` y `code_method` en las solicitudes de OAuth.
2. Los campos requeridos pueden generarse de varias formas, ya sea con desarrollo propio o mediante el uso de SDKs. Sigue los pasos necesarios descritos en [esta documentación oficial](https://datatracker.ietf.org/doc/html/rfc7636#section-4) para hacerlo.
3. Después de generar y cifrar los campos, será necesario enviar los códigos respectivos a Mercado Pago a través de `query_params`. Para eso, utiliza la URL de autenticación presentada a continuación, reemplazando los campos necesarios según se describen debajo.

```URL
https://auth.mercadopago.com/authorization?response_type=code&client_id=$APP_ID&redirect_uri=$YOUR_URL&code_challenge=$CODE_CHALLENGE&code_challenge_method=$CODE_METHOD
```

- **Redirect_uri**: URL proporcionada en el campo "URLs de redireccionamiento" de [tu aplicación](/developers/es/docs/your-integrations/application-details).
- **Code_verifier**: código que debe generarse, respetar los requisitos para su funcionamiento; es decir, ser una secuencia aleatoria de caracteres con una longitud de entre 43 y 128 caracteres, que incluya letras mayúsculas, minúsculas, números y algunos caracteres especiales. Por ejemplo: **47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU**.
- **Code_challenge**: a continuación, es necesario crear un `code_challenge`, a partir del `code_verifier`, utilizando una de las siguientes transformaciones:
 - Si es posible utilizar **S256**, será necesario seleccionar esta opción transformando el `code_verifier` en un `code_challenge` mediante una codificación `BASE64URL` después de aplicar la función "SHA256".
 - Si **no es posible utilizar S256** por alguna razón técnica, y el servidor admite el método **Plain**, es posible definir el `code_challenge` igual al `code_verifier`.
- **Code_challenge_method**: es el método utilizado para generar el `code_challenge`, según se describe en el ítem anterior. Este campo puede ser, por ejemplo, **S256** o **Plain**, dependiendo de la codificación seleccionada en la etapa de `code_challenge`. <br><br>

4. Después de enviar correctamente los códigos a Mercado Pago, obtendrás la autorización necesaria (`code_verifier`) para obtener el Access Token y realizar la verificación por PKCE en las transacciones realizadas con OAuth.

### Obtener token

El Access Token es el código utilizado en diferentes solicitudes de origen público para acceder a un recurso protegido. En este flujo, representa una autorización otorgada por un vendedor a una aplicación cliente, que contiene scopes y un tiempo de vigencia limitado para dicho acceso, y se concede por medio de una URL de redirección 

Sigue los pasos a continuación para obtenerlo.

> WARNING
>
> Atención
>
> Se recomienda realizar este procedimiento de una única vez junto con el usuario, ya que el código recibido por la "URL de redireccionamiento" después de la autorización tiene una validez de 10 minutos y el Access Token recibido a través del endpoint tiene una validez de 180 días (6 meses).

1. Edita tu aplicación para que contenga tu URLs de redireccionamiento. Consulta [Editar aplicación](/developers/es/docs/your-integrations/application-details).
2. Envía la **URL de autenticación** con los siguientes campos al vendedor con cuya cuenta deseas vincular la tuya:

   ```Authentication_URL
   https://auth.mercadopago.com/authorization?client_id=APP_ID&response_type=code&platform_id=mp&state=RANDOM_ID&redirect_uri=   https://www.mercadopago.com.br/developers/example/redirect-url 
   ```

   |Campos|Descripción|
   |---|---|
   |Client_id| Reemplaza el valor "APP_ID" con el **número de su aplicación**. Consulta [Detalles de aplicación](/developers/es/docs/your-integrations/application-details) para más información.|
   |State| Reemplaza el valor "RANDOM_ID" con un identificador que sea único para cada intento y que no incluya información sensible, de forma que pueda identificar de quién es el código recibido. Así, podrás garantizar que la respuesta pertenezca a una solicitud iniciada por la misma aplicación. |
   |Redirect_uri| Agrega la URL informada en el campo "URLs de redireccionamiento" de su aplicación. **Asegúrate de que el redirect_uri sea una URL estática**. Consulta [Detalles de aplicación](/developers/es/docs/your-integrations/application-details) para más información.|

   > Si deseas enviar parámetros adicionales en `redirect_uri`, utiliza el parámetro `state` para incluir esa información. De lo contrario, la llamada recibirá una respuesta de error si la URL no coincide exactamente con la configuración de la aplicación.

3. Espera a que el vendedor acceda a la URL y permita el acceso. Al ingresar a la URL, el vendedor será dirigido a Mercado Pago y deberá iniciar sesión en su cuenta para realizar la autorización.
4. Verifica la **URL de redireccionamiento** de tu servidor para ver el código de autorización devuelto en el parámetro de **code**.

   ```Redirect_URL
   https://www.mercadopago.com.br/developers/example/redirect-url 
   ```
  
5. Envía tus [credenciales](/developers/es/docs/your-integrations/credentials) (`client_id` y `client_secret`), el **código de autorización** que fue devuelto en la propiedad `code` y, si has [configurado el PKCE](/developers/es/docs/security/oauth/creation#bookmark_configurar_pkce), el valor `code_verifier` al endpoint [/oauth/token](/developers/es/reference/authentication/oauth/_oauth_token/post) para recibir el Access Token como respuesta.

[[[
```php
<?php
  $client = new OauthClient();
   $request = new OAuthCreateRequest();
     $request->client_secret = "CLIENT_SECRET";
     $request->client_id = "CLIENT_ID";
     $request->code = "CODE";
     $request->redirect_uri = "REDIRECT_URI";

  $client->create($request);
?>
```
```java

OauthClient client = new OauthClient();

String authorizationCode = "TG-XXXXXXXX-241983636";
client.createCredential(authorizationCode, null);
```
```node
const client = new MercadoPagoConfig({ accessToken: 'access_token', options: { timeout: 5000 } }); 

const oauth = new OAuth(client);

oauth.create({
	'client_secret': 'your-client-secret',
	'client_id': 'your-client-id',
	'code': 'return-of-getAuthorizationURL-function',
	'redirect_uri': 'redirect-uri'
}).then((result) => console.log(result))
	.catch((error) => console.log(error));
```
```curl
curl -X POST \
    'https://api.mercadopago.com/oauth/token'\
    -H 'Content-Type: application/json' \
    -d '{
  "client_id": "client_id",
  "client_secret": "client_secret",
  "code": "TG-XXXXXXXX-241983636",
  "grant_type": "authorization_code",
  "redirect_uri": "   https://www.mercadopago.com.br/developers/example/redirect-url ",
  "test_token": "false"
}'
```
]]]

> Para generar credenciales de _sandbox_ para pruebas, envía el parámetro `test_token` con el valor `true`.

## Client credentials

Este flujo se utiliza cuando las aplicaciones solicitan un Access Token usando solo sus propias credenciales y para acceder a sus propios recursos. La principal diferencia con respecto a los otros flujos es que el usuario no interactúa en el proceso y, por lo tanto, la aplicación no puede actuar en su nombre.

### Obtener token

Access Token es el código utilizado en diferentes solicitudes de origen público para acceder a un recurso protegido. En este flujo, se obtiene el Access Token sin interacción del usuario y solo para acceder a sus propios recursos.

Sigue los pasos a continuación para obtenerlo.

1. Envía tus [credenciales](/developers/es/docs/your-integrations/credentials) (`client_id` y `client_secret`) al endpoint [/oauth/token](/developers/es/reference/authentication/oauth/_oauth_token/post), incluyendo el código `client_credentials` en el parámetro `grant_type` para recibir una nueva respuesta con un nuevo `access_token`.
2. Actualiza la aplicación con el Access Token recibido en la respuesta. 

> WARNING
>
> Atención
>
> **El _token_ recibido tiene una validez de 6 horas.** No olvides renovarlo antes de este período de expiración para que sus aplicaciones sigan funcionando correctamente.

[[[
```php
<?php
  $client = new OauthClient();
   $request = new OAuthCreateRequest();
     $request->client_secret = "CLIENT_SECRET";
     $request->client_id = "CLIENT_ID";

  $client->create($request);
?>
```
```node
const client = new MercadoPagoConfig({ accessToken: 'access_token', options: { timeout: 5000 } }); 

const oauth = new OAuth(client);

oauth.create({
	'client_secret': 'your-client-secret',
	'client_id': 'your-client-id',
}).then((result) => console.log(result))
	.catch((error) => console.log(error));
```
```curl
curl -X POST \
    'https://api.mercadopago.com/oauth/token'\
    -H 'Content-Type: application/json' \
    -d '{
  "client_id": "client_id",
  "client_secret": "client_secret",
  "grant_type": "client_credentials",
}'
```
]]]


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/additional-content/security/oauth/introduction

# OAuth

OAuth es un protocolo de autorización que permite que las aplicaciones tengan acceso limitado a la información privada de las cuentas de Mercado Pago. A través del protocolo HTTP, introduce una capa de autenticación y autorización, que consiste en solicitar acceso a los recursos protegidos de los vendedores mediante un **Access token** limitado a una aplicación en particular. Esto se logra sin necesidad de obtener las credenciales de los vendedores a través de los **flujos de acceso**.

> NOTE
>
> Nota
>
> El uso del protocolo OAuth difiere del proceso de uso compartido de credenciales. OAuth no aborda cuestiones relacionadas con la autenticación del cliente, ni información relacionada con la misma. Su responsabilidad radica en los métodos de obtención de un token para acceder a un recurso.
> <br><br>
> A la hora de utilizar OAuth, es importante tener en cuenta ciertos aspectos para que la integración funcione correctamente. Accede a las [Buenas prácticas de integración de OAuth](/developers/es/docs/security/oauth/best-practices) y consulta una guía de posibles errores y de buenas prácticas a tener en cuenta. 

## Access Token

És un código utilizado en diferentes _requests_ de origen público para acceder a un recurso protegido y representa una autorización otorgada por un vendedor a una aplicación cliente, que contiene _scopes_ y un tiempo de vigencia limitado para dicho acceso.

### Temporary grants

Los **_temporary grants_** son códigos temporales utilizados para ser intercambiados por un Access Token. A diferencia de los Access Token, sólo pueden ser usados para llamadas con el servidor de autorización y nunca se envían a servidores de recursos. Los tipos de _temporary grants_ son:

- `authorization_code`: tiene una duración de 10 minutos y su uso es único.
- `refresh_token`: tiene una duración de 6 meses y puede ser reutilizado.

Si deseas conocer cómo obtener el Access Token, accede a [nuestra documentación](/developers/es/guides/additional-content/security/oauth/creation). También puedes consultar la información necesaria para saber cómo [renovarlo](/developers/es/guides/additional-content/security/oauth/renewal).

## Flujos de acceso (grant types)

Los flujos, también llamados _grant types_, se refieren a la forma en que una aplicación obtiene un Access Token, credencial permite acceder a los datos expuestos a través de una API. En el caso de Mercado Pago, hay tres flujos de acceso disponibles:

- **Authorization code**: flujo basado en redirección y que debe ser usado si se van a usar credenciales para acceder a un recurso a nombre de un tercero. Está caracterizado por la intervención del usuario para autorizar explícitamente el acceso a sus datos por medio de la aplicación, y por el uso de un código proporcionado por el servidor de autenticación para que esta aplicación pueda obtener un Access Token y un `refresh_token` asociado. Puedes ver más información dirigiéndote a [Obtener Access Token](/developers/es/docs/security/oauth/creation#bookmark_authorization_code).
- **Refresh token**: en caso de que un Access Token generado a partir del flujo _Authorization code_ sea inválido o haya expirado, este flujo se utilizará para intercambiar una concesión temporal del tipo `refresh_token` por un Access Token. Es decir, permitirá que el Access Token se actualice sin una nueva interacción del usuario luego de haber concedido  la autorización por el flujo _Authorization code_. Puedes ver más información accediendo a [Renovar Access Token](/developers/es/guides/additional-content/security/oauth/renewal).
- **Client credentials**: se van a usar credenciales para acceder a un recurso en nombre propio, o sea, se utiliza para obtener un Access Token sin interacción del usuario. Es útil para instancias en que  las aplicaciones solicitan este Access Token usando solo sus propias credenciales para acceder a sus propios recursos, sin permitir actuar en nombre de un usuario ni acceder a sus datos. Puedes ver más información en la documentación [Obtener Access Token](/developers/es/docs/security/oauth/creation#bookmark_client_credentials).

> NOTE
>
> PKCE (Proof Key for Code Exchange)
>
> Si vas a utilizar el flujo **Authorization code** para obtener el Access Token, puedes configurar el **PKCE** (_Proof Key for Code Exchange_), un protocolo de seguridad utilizado con OAuth para proteger contra ataques de código malicioso durante el intercambio de códigos de autorización por Access Token. Añade una capa extra de seguridad generando un _verifier_ que se transforma en un _challenge_ para asegurar que, incluso si el código de autorización es interceptado, no sea útil sin el _verifier_ original.  Consulta [Configurar PKCE](/developers/es/docs/security/oauth/creation#:~:text=Access%20Token.-,Configurar%20PKCE,-El%20PKCE%20) para obtener más información.


---

# Campos del reporte - Mercado Pago Developers


---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/additional-content/security/oauth/management

# Manage Access Token
 
Currently there are different ways in which the **Access tokens** and yours **temporary grants** created can be disabled and invalidated to authorize requests for protected resources or to exchange them for new tokens.
 
* **Expiration**: after the time set at the time of creation, the token automatically expires and cannot be obtained.
* **User password change**: there are password change flows where the seller can revoke all your credentials, including associated tokens and temporary grants.
* **Authorization revocation**: revoking an authorization between the seller and the application triggers the deletion of all tokens and temporary grants associated with them.
* **Laundering of credentials for fraud**: it is possible that the Information Security and Fraud Prevention department performs a complete update of a user's credentials. This triggers the deletion of all tokens and temporary grants associated with the seller in question.
* **User session cleanup**: enables refresh of all vendor tokens and temporary grants.
* **Application elimination**: when an application is eliminated, all tokens and temporary grants belonging to it are deleted.
 
You can receive webhook notifications every time a seller authorizes or deauthorizes your application. To configure them, read [Dashboard](/developers/en/guides/additional-content/your-integrations/dashboard).

To configure them, see more information on [Notifications](/developers/en/docs/your-integrations/notifications) documentation.


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/additional-content/security/oauth/renewal

# Renew Access Token
 
The **Refresh token** flow is used to exchange a **temporary grants** of type `refresh_token` for an Access Token when the current Access Token**is close to expiry**. The Access Token received through the endpoint is **valid for 180 days**, after which the entire authorization flow must be reconfigured.
 
Additionally, the flow allows you to continue using a valid Access Token with the same characteristics as the original token without the need for a new interaction with the user. By performing this flow, the original token is exchanged for a new one which also offers the ability to limit scopes by returning a new refresh token for future exchange.
 
> WARNING
>
> Important
>
> This flow can only be used if the application return the `scope` parameter indicating the value `offline_access` and the vendor has previously authorized this action through the Authorization code flow.
 
Follow the steps below to renew the **Access Token**.
 
1. Send the `refresh_token` code, your [credentials](/developers/en/docs/your-integrations/credentials), and the `authorization_code` (see [Creation](/developers/en/docs/security/oauth/creation#bookmark_authorization_code)) to the [/oauth/token](/developers/en/reference/authentication/oauth/_oauth_token/post) endpoint with the `refresh_token` code in the `grant_type` string to receive a new response with a new `access_token` and a new `refresh_token`.
2. Update the application with the Access Token received in the response.
 
> WARNING
>
> Important
>
> Remember that every time you refresh the `access_token`, the `refresh_token` will also be refreshed, so you will need to store it again.

[[[
```php
<?php
  $client = new OauthClient();
  $request = new OAuthRefreshRequest();
  $request->client_secret = "CLIENT_SECRET";
  $request->client_id = "CLIENT_ID";
  $request->refresh_token = "REFRESH_TOKEN";

  $client->refresh($request);
?>
```
```java

OauthClient client = new OauthClient();

String refreshtoken = "TG-XXXXXXXX-241983636";
client.createCredential(refreshtoken, null);
```
```node
const client = new MercadoPagoConfig({ accessToken: 'access_token', options: { timeout: 5000 } });

const oauth = new OAuth(client);

oauth.refresh({
	'client_secret': 'your-client-secret',
	'client_id': 'your-client-id',
	'refresh_token': 'refresh-token'
}).then((result) => console.log(result))
	.catch((error) => console.log(error));
```
```curl
curl -X POST \
'https://api.mercadopago.com/oauth/token'\
-H 'Content-Type: application/json' \
-d '{
 "client_id": "client_id",
 "client_secret": "client_secret",
 "grant_type": "refresh_token",
 "refresh_token": "TG-XXXXXXXX-241983636"
}'
```
]]]


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/additional-content/security/oauth/best-practices

# Best practices for OAuth integration

When using OAuth, it is important to take certain aspects into account so that the integration works correctly.

Below, you will find a guide to possible errors and good practices to keep in mind.

## Correct use of values in request headers 

Always use the `accept` and `content-type` headers in your POST request. Be careful not to add values to headers that are not part of the integration to avoid getting a response error.

![oauth_header](/images/oauth/oauth_header-v1.png)

## Correct use of 'params' values

In your POST call, be careful to use only the requested `params` values. Do not add any other non-required values, otherwise you will receive an error code in response.

![oauth_params](/images/oauth/oauth-1-v1.png)

## Correct use of Query Params

Remember not to send any parameters inside Query Params. Send the parameters within the request body as indicated in [API Reference](/developers/en/reference/authentication/oauth/_oauth_token/post).

![oauth_queryparams](/images/oauth/oauth_queryparams_v2.png)

## Correct use of the 'grant_type' field

Always use the `grant_type` field in your requests with the `authorization_code` or `client_credentials` values. Remember that if you send another value, it is possible that you will receive an error in response.

![oauth_grant_type](/images/oauth/oauth_granttype_v2.png)

## Using the 'state' field in the 'authorization code' request

To enhance integration security, we recommend including the `state` parameter in the `authorization code` request flow. This way, you can ensure that the response belongs to a request initiated by the same application.

**Make sure that the `redirect_uri` is a static URL**. If you want to send additional parameters in that URL, use the `state` parameter to include that information. Otherwise, the call will receive an error response if the `redirect_uri` does not exactly match the application's configuration.

![oauth_state](/images/oauth/oauth_state_v4-v1.png)

To find more information about the request, its parameters, and the possible success and error responses you may receive, go to [API Reference](/developers/en/reference/authentication/oauth/_oauth_token/post) documentation.


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/reference/authentication/oauth/_oauth_token/post

# Create and refresh token

This endpoint is used to create or refresh the necessary Access Token to operate your application.

**POST** `/oauth/token`

## Request parameters

- `client_secret` (string, optional)
  Private key to be used in some plugins to generate payments. One of the keys in the pair that make up the credentials that identify an application/integration in your account.

- `client_id` (string, optional)
  Unique ID that identifies your application/integration. One of the keys in the pair that make up the credentials that identify an application/integration in your account.

- `grant_type` (string, optional)
  Specify the type of operation to be performed to obtain your Access Token. In the case of Mercado Pago, there are three available access flows:
Possible enum values:

  - `authorization_code`
  A flow based on redirection, characterized by user intervention to explicitly authorize the application to access their data and by the use of a code provided by the authentication server so that the application can obtain an Access Token and an associated 'refresh_token'.

  - `refresh_token`
  If an Access Token generated from the 'authorization_code' flow is invalid or expired, this flow will be used to exchange a temporary grant of the 'refresh_token' type for an Access Token. This allows the Access Token to be refreshed without requiring further user interaction after the authorization granted by the 'authorization_code' flow.

  - `client_credentials`
  Used to obtain an Access Token without user interaction. This flow is used when applications request an Access Token using only their own credentials to access their own resources, without acting on behalf of a user or accessing their data.

- `code` (string, optional)
  Code provided by the authentication server so that the application can obtain an Access Token and an associated 'refresh_token'. It is valid for 10 minutes counted from its generation. Required when grant_type=authorization_code.

- `code_verifier` (string, optional)
  Code generated when PKCE verification has been enabled and configured for generating the Access Token from the 'authorization_code' flow.

- `redirect_uri` (string, optional)
  URL reported in the 'Redirect URLs' field of your application. Make sure that the 'redirect_uri' is a static URL. Required only when grant_type=authorization_code.

- `refresh_token` (string, optional)
  Value received when the Access Token is created. Only required when grant_type=refresh_token.

- `test_token` (string, optional)
  Added with value = true only when you want to generate credentials for testing.

## Response parameters

- `access_token` (string, optional)
  Security code that identifies the user, their privileges and an application used in different requests from public sources to access protected resources. Its validity is determined by the expires_in parameter and is similar to APP_USR-1585551492-030918-25######3458-2880736, which is composed of:
Possible enum values:

  - `Access Token type`
  APP_USR (application on behalf of a user), TEST (test, only valid in sandbox)

  - `Client ID`
  1585551492

  - `Creation date (MMddHH)`
  030918

  - `Security hash`
  25######3458

  - `User ID`
  2880736

- `token_type` (string, optional)
  necessary information for the token to be used correctly to access protected resources. The token of type "bearer" is the only one supported by the authorization server and is used when the Access Token is included as plain text in the request. It is understood that the bearer has direct access to the token.

- `expires_in` (number, optional)
  Fixed access_token expiration time expressed in seconds. By default, the expiration time is 180 days (15552000 seconds).

- `scope` (string, optional)
  Scopes are used in the API authorization and consent process and allow you to determine what access the application requests and what access the user grants. By default, the scopes associated with the token are the ones determined when creating the original token and configuring the application.

- `user_id` (number, optional)
  Identification number (Mercado Pago ID) generated automatically when creating a Mercado Pago account. It is a unique number that identifies the Mercado Pago seller and is the owner of the application.

- `refresh_token` (string, optional)
  Temporary grants code used to obtain access tokens so that authorization and access to resources remain valid before the end of the Access Token's validity period. They define an ID used to retrieve authorization information. Unlike access tokens, refresh tokens can only be used for calls on the authorization server and are never sent to resource servers. The 'refresh_token' can only be used once and only for the client_id it is associated with. After a refreh_token is used it will become invalid.

- `public_key` (string, optional)
  Public key of the application that will normally be used in the frontend and will allow, for example, knowing the means of payment and encrypting the card data. One of the keys in the pair that make up the credentials that identify an application/integration in your account.

- `live_mode` (boolean, optional)
  Indicates whether the application is in production or test mode.

## Errors

| Status | Error | Description |
| ------- | ------- | ----------- |
| 400 | invalid_client | The provided client_id and/or client_secret of your app is invalid. |
| 400 | invalid_grant | There are several reasons for this error, it could be because the authorization_code or refresh_token is invalid, expired or revoked, was sent in an incorrect flow, belongs to another client, or the redirect_uri used in the authorization flow does not match what your application has configured. |
| 400 | invalid_scope | The requested scope is invalid, unknown, or wrongly formed. The allowed values for the scope parameter are “offline_access”, ”write” or ”read”. |
| 400 | invalid_request | The request does not include a required parameter, includes an unsupported parameter or parameter value, has a duplicated value, or is otherwise malformed. |
| 400 | unsupported_grant_type | Allowed values for grant_type are “authorization_code” or “refresh_token”. |
| 400 | forbidden | The call does not authorize access, possibly another user's token is being used. |
| 400 | unauthorized_client | The application does not have a grant with the user or the permissions (scopes) that the application has with this user do not allow creating a token. |
| 429 | local_rate_limited | The call does not authorize access, please try again. |

## Request example

### cURL

```bash
curl -X POST \
  'https://api.mercadopago.com/oauth/token' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -d '{
  "client_secret": "client_secret",
  "client_id": "client_id",
  "grant_type": "client_credentials",
  "code": "TG-XXXXXXXX-241983636",
  "code_verifier": "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU",
  "redirect_uri": "https://www.mercadopago.com.br/developers/example/redirect-url",
  "refresh_token": "TG-XXXXXXXX-241983636",
  "test_token": "false"
  }'
```

## Response example

```json
{
  "access_token": "APP_USR-4934588586838432-XXXXXXXX-241983636",
  "token_type": "bearer",
  "expires_in": 15552000,
  "scope": "read write offline_access",
  "user_id": 241983636,
  "refresh_token": "TG-XXXXXXXX-241983636",
  "public_key": "APP_USR-d0a26210-XXXXXXXX-479f0400869e",
  "live_mode": true
}
```


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/reference/authentication/oauth/overview

---
product_landing_hero:
 - title: OAuth
 - message: La API de OAuth permite a tu aplicación obtener y renovar Access Tokens para autenticar llamadas a la API de Mercado Pago en nombre de vendedores. Esta referencia describe el endpoint disponible y cómo interactuar con él.
 - info: ¿Buscas más información? [Ir a la documentación de OAuth](/developers/es/docs/security/oauth)
---

## Endpoints disponibles

El único endpoint necesario para la integración con OAuth.

| Operación | Path | Descripción |
|---|---|---|
| :TagComponent{tag="POST" text="Crear y refrescar token" href="/developers/es/reference/authentication/oauth/_oauth_token/post" color="green"} | `/oauth/token` | Crea o renueva un `access_token` a partir de un `grant_type` (`authorization_code`, `refresh_token` o `client_credentials`); devuelve el token, su expiración y el `refresh_token` asociado. |

<br>
<br>

---
product_landing_how_integrate:
 - title: ¿Todo listo para empezar?
 - sub_title: Ve al endpoint y empieza a gestionar Access Tokens.
 - button_description: Crear token
 - button_link: /developers/es/reference/authentication/oauth/_oauth_token/post
---


---



---

**URL:** https://www.mercadopago.com.ar/developers/es/docs/additional-content/security/oauth/renewal

[![Mercado Pago](https://http2.mlstatic.com/frontend-assets/dx-template-lib/assets/logo-mercadopago.svg)

DEVELOPERS](https://www.mercadopago.com.ar/developers/es)

[Ingresar](https://www.mercadolibre.com/jms/mla/lgz/login?platform_id=mp&go=)

Primeros pasos

Pagos online

Pagos presenciales

Apps para plataformas

Herramientas

APIs

SDKs

# 404


---

# Introducción - Mercado Pago Developers


---

**URL:** https://www.mercadopago.com.ar/developers/es/docs/additional-content/security/oauth/creation

[![Mercado Pago](https://http2.mlstatic.com/frontend-assets/dx-template-lib/assets/logo-mercadopago.svg)

DEVELOPERS](https://www.mercadopago.com.ar/developers/es)

[Ingresar](https://www.mercadolibre.com/jms/mla/lgz/login?platform_id=mp&go=)

Primeros pasos

Pagos online

Pagos presenciales

Apps para plataformas

Herramientas

APIs

SDKs

# 404


---



---



# ==================== CREACIÓN DE APLICACIÓN Y CREDENCIALES ====================

# Origen: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/application-details

# Detalles de aplicación

Para acceder a los datos generales de tu aplicación, ve al [Panel del desarrollador](/developers/panel/app) y haz clic en la tarjeta de una aplicación para acceder a los **Detalles de aplicación**.

## Datos de la aplicación

Esta sección muestra los datos básicos de la aplicación, incluyendo:
  - **ID de usuario**: número de identificación de usuario, que es creado automáticamente.
  - **Número de aplicación**: número de identificación de la aplicación, que es creado automáticamente.
  - **Integración con**: el producto o plataforma integrada con la aplicación.
  - **Modelo de integración** (si corresponde): las opciones de modelo de integración se proporcionan según el producto o plataforma utilizada.

### Editar datos

Puedes hacer clic en el botón **Editar datos** para ver y editar las configuraciones básicas y avanzadas que incluyen los datos de tu aplicación y el producto a integrar. Estas son:

#### Configuraciones básicas

* **Logo**: imagen en formato JPG o PNG de hasta 1 MB.
* **Nombre de la aplicación**: sirve para identificar tus aplicaciones con más facilidad (permite un máximo de 50 caracteres).
* **Nombre corto de la aplicación**: identificador secundario de la aplicación (este campo no puede contener espacios ni caracteres especiales).
* **Descripción de la aplicación** (máximo 150 caracteres).
* **Sector**: elige la categoría que mejor describa tu negocio.
* **URL del sitio en producción** (opcional).
* **Solución de pago a integrar**: edita la solución de pago a integrar entre **Pagos online** y **Pagos presenciales**.
  - **Pagos online**: si vas a utilizar una plataforma de comercio electrónico, marca **Sí**. Luego, selecciona la **plataforma** con la que vas a integrar. Por último, selecciona el **producto** que estás integrando. Si no estás utilizando una plataforma de comercio electrónico, marca **No** y selecciona el **producto** que estás integrando. Opcionalmente, podrás seleccionar el/los modelos de integración.
  - **Pagos presenciales**: Selecciona el **producto** que estás integrando. ----[mlb]---- Si seleccionas la opción QR Code, opcionalmente también podrás elegir el/los modelos de integración. ------------ ----[mla, mlc, mlu]---- Si seleccionas la opción Código QR, opcionalmente también podrás elegir el/los modelos de integración. ------------

#### Configuraciones avanzadas

* **URLs de redireccionamiento**: URLs (en https) donde deseas recibir el código de autorización cuando tu integración sea configurada como Marketplace o se utilice el flujo **Authorization code** de OAuth. **Asegúrate de que sea una URL estática**. Consulta [OAuth](/developers/es/docs/security/oauth) para obtener más detalles.
* **Usar el flujo de código de autorización con PKCE**: en caso de que la integración se realice a través del flujo **Authorization code** de OAuth, puedes habilitar el PKCE (_Proof Key for Code Exchange_) para generar un código secreto adicional que se usará durante el proceso de autorización. Consulta [Configurar PKCE](/developers/es/docs/security/oauth/creation#:~:text=Access%20Token.-,Configurar%20PKCE,-El%20PKCE%20) para obtener más detalles. 
* **Permisos de la aplicación**: son opciones de acceso de tu aplicación, cómo **lectura**, **acceso offline** y **escritura**. Por defecto, tu aplicación se crea con todos los permisos activados, pero puedes desactivar un permiso haciendo clic en la casilla de verificación correspondiente al permiso que deseas cambiar.

### Eliminar aplicación

Para eliminar una aplicación, sigue estos pasos:

1. Accede a la página "Editar aplicación".
2. Desplázate hasta el final de la página y haz clic en el botón **Eliminar aplicación**.
De esta manera, la aplicación se eliminará correctamente.

> WARNING
>
> Al eliminar una aplicación, ten en cuenta que tu tienda perderá la capacidad de recibir pagos a través de la integración asociada. Además, se perderán todas las configuraciones, incluidas las credenciales que tengas asociadas. **Una vez eliminada una aplicación, no se puede recuperar**.

## Medición de calidad

La [medición de calidad](/developers/es/docs/integration-quality) es la última etapa del proceso de integración, donde podrás validar si cumple con los requisitos de calidad y seguridad necesarios para brindar la mejor experiencia tanto a vendedores como a compradores.

Existen 2 formas de medir la calidad de tu integración:
 * **Manual:** puedes realizar la medición por tu cuenta, cuando lo prefieras. Sólo necesitas contar con un `payment ID` de un pago realizado con credenciales de producción y acceder a **“Calidad de integración"**, dentro del menú lateral, donde podrás consultar el paso a paso. 

 * **Automática:**  del 1 al 7 de cada mes, Mercado Pago realiza una medición periódica de calidad para todas las integraciones con **Checkout Pro, Checkout ----[mla, mlm, mlu, mco, mlc, mpe]----API,------------ ----[mlb]----Transparente,------------ Checkout Bricks y Mercado Pago Point** que cuenten con un pago realizado con credenciales de producción.

----[mlb]----
> WARNING
>
> La única manera de evaluar la calidad de una integración con **QR Code** es realizando una medición manual. Por su parte, integraciones con **Plugins y Plataformas** no podrán ser evaluadas.

------------ 
----[mla, mlc, mlu]----
> WARNING
>
> La única manera de evaluar la calidad de una integración con **Código QR** es realizando una medición manual. Por su parte, integraciones con **Plugins y Plataformas** no podrán ser evaluadas.

------------

Como resultado de esta medición, obtendrás un puntaje que indica qué tan segura y alineada con las buenas prácticas de integración de Mercado Pago está la configuración de tu aplicación, junto con las recomendaciones necesarias para hacer ajustes en caso de que sea necesario. 

Para saber más detalles, accede a la documentación sobre [calidad de integración](/developers/es/docs/integration-quality).

## Prueba de integración

En esta sección, cuentas con una guía paso a paso para poder probar tu integración, que te permitirá validar estar cumpliendo con los requisitos necesarios en función del producto integrado. 

Además, cuentas con enlaces directos a la documentación correspondiente, así como con una barra de estado que te permitirá visualizar tus avances de manera sencilla.

![pantalla de validación de prueba de integración](/images/dashboard/testing-es-v1.png)


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/credentials

# Credentials

Credentials are unique access keys that we use to identify an integration in your account. They are directly linked to the :toolTipComponent[application]{link="/developers/en/docs/your-integrations/application-details" linkText="Application details" content="Entity registered in Mercado Pago that acts as an identifier to manage your integrations. For more information, access the link below."} you created for that integration and will allow you to develop your project with the best Mercado Pago security measures.

## Types of credentials

Credentials are divided into two types: **production credentials** and **test credentials**. Below, we explain what they are about.

:::::TabsComponent

::::TabComponent{title="Production credentials"}
### Production credentials

**Production credentials** are a set of keys that allow you to receive real payments in stores and other applications.

When accessing production credentials, the following credential pairs will be displayed: **Public Key and Access Token**, as well as **Client ID and Client Secret**.

### Public Key and Access Token
The **Public Key** and **Access Token** credentials are used, not necessarily together, in integrations made with Mercado Pago payment solutions. They are directly linked to the :toolTipComponent[application]{link="/developers/en/docs/your-integrations/application-details" linkText="Application details" content="Entity registered in Mercado Pago that acts as an identifier to manage your integrations. For more information, access the link below."} you created, so each credential pair is unique for each integration.

| Type | Description |
|---|---|
| Public Key | The application's public key is generally used in the frontend. It allows, for example, access to information about payment methods and encrypt card data. |
| Access Token | Application's private key that should always be used in the backend to generate payments. It is essential to keep this information safe on your servers. |

For more information on which credentials will be needed for your integration, see the [documentation](https://www.mercadopago[FAKER][URL][DOMAIN]/developers/es/docs) of the solution being integrated.

### Client ID and Client Secret

The **Client ID** and **Client Secret** credentials are used primarily in integrations that use [OAuth](/developers/en/docs/security/oauth) as a protocol for obtaining private information from Mercado Pago accounts. In particular, they are used during the **Client Credentials** flow (_grant type_), which allows you to access a resource on your own behalf and obtain an Access Token without user interaction.

They may also be required in some older integrations with e-commerce platforms.

| Type | Description |
|---|---|
| Client ID | Unique identifier that represents your integration. |
| Client Secret | Private key used in some plugins to generate payments. It is extremely important to keep this information secure on your servers and not allow access to any user of the system or intruder. | 

::::

::::TabComponent{title="Test credentials"}
### Test credentials

Test credentials are a set of keys that are used both in the development stage, to ensure secure settings, and in the testing stage, to test the integration.

> NOTE
> 
> Test credentials are only available for [Checkout API](https://www.mercadopago[FAKER][URL][DOMAIN]/developers/en/docs/checkout-api/landing) and [Checkout Bricks](https://www.mercadopago[FAKER][URL][DOMAIN]/developers/en/docs/checkout-bricks/landing) integrations.
---

---

When accessing the test credentials, the **Public Key and Access Token** credential pair will be displayed.

### Public Key and Access Token

The test **Public Key** and **Access Token** credentials are used in the same way as production credentials, but will not allow any real transactions to be made. In some integrations, they will be required during the development stage to simulate transactions and verify that your integration works correctly.

| Type | Description |
|---|---|
| Public Key | The application's public key is generally used in the frontend. It allows, for example, access to information about payment methods and encrypt card data. |
| Access Token | Application's private key that should always be used in the backend to generate payments. It is essential to keep this information safe on your servers. |

> NOTE
> 
> If when creating an application you selected a Mercado Pago product that does not require test credentials, you will not be able to use them. Instead, you must use the production credentials of a [test account](/developers/en/docs/your-integrations/test/accounts) to test your integration properly.

::::

:::::

## Get credentials

Mercado Pago credentials are created from a Mercado Pago application. That is, they are directly linked to the
:toolTipComponent[application]{link="/developers/es/docs/your-integrations/application-details" linkText="Application details" content="Entity registered in Mercado Pago that acts as an identifier to manage your integrations. For more information, see the documentation on [Application details](/developers/en/docs/your-integrations/application-details)."} that you created through Your integrations.

Below, learn how to get the credentials.

1. In the upper right corner of [Mercado Pago Developers](https://www.mercadopago[FAKER][URL][DOMAIN]/developers/panel/app), click **Log in** and fill in the required data with the information corresponding to your Mercado Pago account. Then, click on the **Your integrations** button located in the upper right corner.
2. Access your application or create one if you have not already done so.
3. You will find your credentials under the title **Testing > Test credentials** or **Production > Production credentials**, in the menu located on the left side of the screen.

![Cómo acceder a las credenciales a través de Tus Integraciones](/images/snippets/credentials-test-panel-es.jpg)

![Cómo acceder a las credenciales a través de Tus Integraciones](/images/snippets/credentials-prod-panel-es-v2.jpg)

### Activate production credentials
To obtain production credentials, you must **activate them** by completing some information about your business. Follow the steps below:

1. Go to [Your integrations](https://www.mercadopago[FAKER][URL][DOMAIN]/developers/panel/app) and select an application.
2. Go to the **Production credentials** section in the left side menu. You will find the **Public Key** and the **Access Token**.
3. In the **Industry** field, select from the drop-down menu the industry or category to which the business you are integrating belongs.
4. In the **Website (required)** field, complete with the URL of your business website.
5. Accept the [Privacy Statement](https://www.mercadopago[FAKER[URL][DOMAIN]]/privacidad) and the [Terms and Conditions](/developers/es/docs/resources/legal/terms-and-conditions). Fill in the reCAPTCHA and click on **Activate production credentials**.

When accessing production credentials, the following credential pairs will be displayed: **Public Key and Access Token**, as well as **Client ID and Client Secret**.

> NOTE
>
> Test credentials do not need to be activated. By simply creating an application, you can already use them.

## Share credentials

If you are developing for someone else or receiving help in the integration or configuration of your stores, you can securely share the credentials with another Mercado Pago account.

You can share credentials **up to a maximum of 10 times**. If you reach this limit, you must delete old permissions, without impacting already configured integrations.

In addition, if for security reasons you no longer want to share your credentials, you can cancel access.

Below, we show you how to share credentials.

1. In the upper right corner of [Mercado Pago Developers](https://www.mercadopago[FAKER][URL][DOMAIN]/developers/panel/app), click **Log in** and enter the required data with the information corresponding to your Mercado Pago account. Then, click on the **Your integrations** button located in the upper right corner.
2. Access the application of the integration for which you need to share the credentials.
3. Go to the **Testing** or **Production** section, depending on the type of credential you want to share. Remember that to access production credentials, you must activate them. If you don't know how to activate them, go to [Activate production credentials](/developers/en/docs/credentials#bookmark_activate_production_credentials).
4. Once you select the credentials, go to the *Share credentials with a developer* section and click on the **Share Credentials** button.
5. Enter the email address of the person you want to grant access to. **Remember**: it is mandatory that the email address is associated with a Mercado Pago account.

![Compartir credenciales en Tus Integraciones](/images/snippets/share-credentials-panel-es.jpg)

## Renew credentials

You can renew your **production credentials** for security reasons or any other relevant reason.

> WARNING
>
> Renewing credentials already configured in an integration will affect its operation. It is necessary that **you replace the old credentials with the ones obtained** after the renewal process to continue operating.

To renew a credential pair, follow the steps below.

1. Access your production credentials through [Your integrations](https://www.mercadopago[FAKER][URL][DOMAIN]/developers/panel/app).
2. Select the credential pair you want to renew. These can be **Public Key** and **Access Token** or **Client ID** and **Client Secret**. Keep in mind that both credentials in the pair you choose will be renewed.
3. Click on the three dots located to the right of the credential you want to renew and select **Renew**. Click on **Renew now** to confirm the change.

![Cómo renovar tus credenciales](/images/snippets/renew-credentials-es.jpg)

Ready, your credentials have been renewed.

## Security Recommendations

When integrating Mercado Pago solutions, you will handle sensitive data that you must protect from potential losses or vulnerabilities, such as your Mercado Pago access credentials, the keys you use in your integrations, or your customers' information.

We will show you how you can optimize the security of your integrations in a simple and quick way.

### Send the Access Token by header

Every time you make API calls, send the **Access Token** via _header_ instead of _query param_. This will allow you to protect it so that it is not exposed to anyone outside your integration.

For example, if you perform a **GET** request to the `/users/me` resource, it would be like this:

```curl
curl -H 'Authorization: Bearer {{YOUR_ACCESS_TOKEN}}' \
https://api.mercadolibre.com/users/me
```

### Use OAuth to manage third-party credentials

OAuth is an authorization protocol that allows applications to securely access user accounts in HTTP services without requiring the user to directly share their credentials. It works as an intermediary that facilitates controlled access to user data by third-party applications.

For more information, access the [documentation](/developers/en/docs/security/oauth).


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/dashboard

# Developer dashboard

In the [Developer dashboard](/developers/panel/app), you can find the listing of your applications.

Applications are different integrations contained within one or more stores. You can create an application for each solution you implement in order to keep everything organized and have better management control.

Each application has a set of credentials and the possibility to configure its own notifications. Each card represents a created application and displays the application name and number, along with a button that directs you to the **Application Details** where you can manage it.

## Create a new application

To create an application, you have three options available: with an **AI agent from your code editor**, with the **Mercado Pago Developers Assistant**, or **manually from the** [integration Panel](/developers/panel/app).

![Three options to create an application](/images/snippets/create-application/new-create-app-onboarding-es.png)

:::::TabsComponent
::::TabComponent{title="Create with AI"}

You can use our AI resources to create your application from your IDE or agent in 2 steps. The agent will take care of creating the application in the integration panel and guiding you through the entire configuration.

![Installing the Mercado Pago plugin](/images/snippets/create-application/new-create-app-ia-v2-es.png)

To do this, you have two options: installing the [Mercado Pago Plugin](/developers/en/docs/mp-plugin/overview), available for Claude Code and Codex, or configuring the [Mercado Pago MCP Server](/developers/en/docs/mcp-server/overview), available for editors such as VS Code and Cursor. Follow the instructions for the option you choose.

:::AccordionComponent{title="Plugin"}

### Claude Code

Run the following command to install the Mercado Pago plugin for Claude Code.

```bash
claude plugin install mercadopago@claude-plugins-official
```

Once installed, run the `/mp-connect` command to authorize the agent's access to your Mercado Pago account.

### Codex

Run the following commands to install the Mercado Pago plugin for Codex.

```bash
codex plugin marketplace add mercadopago/mercadopago-codex-marketplace
codex plugin add mercadopago@mercadopago-codex-marketplace
```

Once installed, run the `/mp-connect` command to authorize the agent's access to your Mercado Pago account.

:::

:::AccordionComponent{title="MCP"}

### VS Code

Add the following configuration to your `mcp.json` file.

```json
{
  "mcp": {
  "servers": {
  "mercadopago-mcp-server": {
  "type": "http",
  "url": "https://mcp.mercadopago.com/mcp"
  }
  }
  }
}
```

### Cursor

Add the following configuration to your `mcp.json` file.

```json
{
  "mcpServers": {
  "mercadopago-mcp-server": {
  "url": "https://mcp.mercadopago.com/mcp"
  }
  }
}
```

:::

Finally, ask the agent to create your application in Mercado Pago. If you'd like, you can copy and paste the following prompt.

```
I want to integrate with Mercado Pago. Recommend the ideal payment solution for my project, create the application, and guide me through the integration.
```

> NOTE
>
> You can complete the integration with AI support. If you need help, check the [Integrate with AI guide](/developers/en/docs/ai-resources).

::::
::::TabComponent{title="Create with the Assistant"}

You can use the **Mercado Pago Developers Assistant to create your application** conversationally, without filling out forms. To do this, follow the steps below.

1. Go to [Mercado Pago Developers](https://www.mercadopago[FAKER][URL][DOMAIN]/developers) and log in with your account.
2. In the bottom right corner of the screen, you'll see the **Assistant** widget. Click to open it.
3. From there, you can simply ask the Assistant to create your application conversationally, meaning you tell it you want to create an application and interact with the questions and answers.
3. Next, the Assistant will ask you to provide a series of details to complete the setup:
  - **Application name**: provide a name that lets you identify your integration. It accepts a maximum of 100 characters.
  - **Product to integrate**: from the list of all Mercado Pago payment solutions shown by the Assistant, select the one that best fits your business.
4. Finally, when the Assistant confirms your application has been created, it will show you the **App ID**, the **Product ID**, and the **integration type**, if applicable.

> NOTE
>
> Once your application is created, the Assistant can help you obtain test credentials, production credentials, or configure Webhooks, as well as suggest how to carry out your integration based on your stack.

::::
::::TabComponent{title="Create manually"}

If you prefer, you can **create your application manually** from the [integration Panel](/developers/panel/app) by following the steps below.

![Mercado Pago Developers panel](/images/snippets/create-application/new-create-app-panel1-v2-es.png)

1. Go to [Mercado Pago Developers](https://www.mercadopago[FAKER][URL][DOMAIN]/developers) with your Mercado Pago account.

2. On the home screen, select the **Create in the integration panel** option.

  > NOTE
  >
  > If you already have applications created, go to **Your integrations** and click **Create application**.

3. In **Choose a solution to integrate**, select the payment solution you want to integrate (for example, Checkout Pro, Checkout API, Mercado Pago Point, or QR Code), or, if your store uses an e-commerce platform, select **E-commerce platform**.

4. If you selected **E-commerce platform**, in **Choose the platform**, select the platform you will integrate with. If you selected a specific solution, this step does not apply.

5. In **Other information**, enter an **Application name** that lets you identify it.

6. Accept the [Privacy Statement](https://www.mercadopago[FAKER][URL][DOMAIN]/privacidad) and the [Terms and Conditions](/developers/en/docs/resources/legal/terms-and-conditions), and click **Create application**.

::::
:::::

For each created application, a new card containing the name, number, and quality status of the application is automatically generated in the [Developer dashboard](/developers/panel/app).

> You can measure your integration quality from the application panel, as long as your application uses one of the following supported products: [Checkout Pro](/developers/en/docs/checkout-pro/overview), [Checkout API](/developers/en/docs/checkout-api-payments/overview), [Checkout Bricks](/developers/en/docs/checkout-bricks/overview), or [Mercado Pago Point](/developers/en/docs/mp-point/overview).

## Accessing credentials for an application you don't manage

You can request access to application credentials from other people and integrate solutions for accounts other than your own. To securely request access to credentials for an application you don't manage, follow the steps below:

1. In the [Developer dashboard](/developers/panel/app), click on the **Request access to credentials** button.
2. Click on the "Request credentials" button.
3. Enter the email associated with the account for which the credentials are being requested.
4. Check the "I'm not a robot" checkbox.
5. Click on **Request credentials**.

Once access to the credentials is granted, you can use them to integrate solutions. After the integrations are completed, remove the access permissions for the shared credentials and ensure the security of the data.

> When requesting access to other credentials, you are asking other Mercado Pago accounts to share the public and private keys of their applications with you for integrations. Do not use the credentials of other accounts without proper consent.


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/additional-content/your-integrations/application-details

# Integration data

To access the general data of your integration, navigate to the [Developer Dashboard](/developers/panel/app) and click on the card of an application to access its data and find all useful resources and information. See below which information will be displayed on the screen.

![Datos de integración](/images/cow/integration-data-pro-es-v1.png)

:::AccordionComponent{title="Credenciales"}

This section displays the :toolTipComponent[credentials]{link="/developers/en/docs/checkout-pro-preferences/additional-content/credentials" linkText="Credenciais" content="Unique access keys we use to identify an integration in your account, linked to your application. For more information, access the link below."} of your application, which are:

- **Test credentials**: a set of keys used both during the development stage, to ensure secure configurations, and during the testing stage, to test the integration. When you create an application, test credentials are generated automatically.
- **Production credentials**: a set of keys that allow you to receive real payments in stores and other applications. To obtain production credentials, you must **activate them** y clicking on **Activate credentials** and filling in some information about your business.

For more information, see the [Credentials](/developers/en/docs/checkout-pro-preferences/additional-content/credentials) documentation.

:::
:::AccordionComponent{title="Integration data"}

This section displays the basic data of the application, including:

  - **User ID**: automatically generated user identification number.
  - **Application number**: automatically generated application identification number.
  - **Integrated product**: the product or platform integrated with the application.
  - **Integration model** (if applicable): integration model options are available depending on the used product or platform.

### Edit data

In the menu on the left side of the screen, you can **click the edit button above your application's name** to edit the **basic and advanced settings** that include your application's data and the product to be integrated. They are:

#### Basic settings

* **Logo**: JPG or PNG image format up to 1MB.
* **Application name**: to easily identify your applications (maximum of 50 characters).
* **Application short name**: secondary identifier of the application (this field cannot contain spaces or special characters).
* **Application description** (maximum of 150 characters).
* **Industry**: choose the category that best describes your business.
* **Production website URL** (optional).
* **Payment solution to be integrated**: edit the payment solution to be integrated between **Online Ppyments** and **In-person payments**.
  - **Online payments**: if you are going to use an e-commerce platform, mark **Yes** and select the **platform** you will integrate with. Finally, choose the **product** you are integrating. If you are not using an e-commerce platform, mark **No** and select the **product** you are integrating. Optionally, you can select the integration model(s).
  - **API to be used in the integration**: indicate which API will be used for the integration, which can be either the Orders API or the Payments API.
  - **In-person payments**: select the **product** you are integrating. If you select the QR Code option, optionally you can also choose the integration model(s).

#### Advanced settings

* **Redirect URL**: URL (in https) where you want to receive the authorization code when your integration is set up as a marketplace or performed through the flow **Authorization code** by OAuth. **Make sure that is a static URL**. Check out [OAuth](/developers/en/docs/security/oauth) documentation for more details.
* **Use the authorization code flow with PKCE**: if the integration is done with the flow **Authorization code** by OAuth, you can enable PKCE (Proof Key for Code Exchange) to generate an additional secret code to be used during the authorization process. Check out [Configure PKCE](/developers/en/docs/security/oauth/creation#:~:text=Access%20Token.-,Configure%20PKCE,-The%20PKCE%20) documentation for more details.
* **Application permissions**: options for accessing your application, including **read**, **offline access** and **write**. By default, your application is created with all permissions enabled, but you can disable a permission by unchecking the corresponding checkbox.

### Delete application

To remove an application, follow these steps:

1. Access the "Edit Application" page.
2. Scroll to the bottom of the page and click on the **Delete Application** button.
This way, the application will be successfully deleted.

> WARNING
>
> Attention
>
> When deleting an application, please note that your store will lose the ability to receive payments through the integration associated with that application. Additionally, all settings, including associated credentials, will be lost. **Once an application is deleted, it cannot be recovered**.

:::
:::AccordionComponent{title="Integration quality"}

The [quality measurement](/developers/en/docs/integration-quality) is the final stage of the integration process, where you can validate whether it meets the necessary quality and security requirements to provide the best experience for both sellers and buyers.

There are two ways to measure the quality of your integration:
 * **Manual:** you can conduct the measurement on your own whenever you prefer. You only need a `payment ID` from a payment made with production credentials and access **“Integration Quality"** in the side menu, where you can find the step-by-step instructions.

 * **Automatic:** From the 1st to the 7th of each month, Mercado Pago conducts a periodic quality measurement for all integrations with **Checkout Pro** that have a payment made with production credentials.

As a result of this measurement, you will receive a score indicating how secure and aligned your application's configuration is with Mercado Pago's best integration practices, along with necessary recommendations for adjustments if needed.

For more details, refer to the documentation on [integration quality](/developers/en/docs/integration-quality).

:::
:::AccordionComponent{title="Notifications"}

If you have already [set up your Webhook notifications](/developers/en/docs/checkout-pro-preferences/payment-notifications), this section will display the percentage of notifications successfully delivered for the integration in question.

:::


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/additional-content/your-integrations/credentials

# Credentials

Credentials are unique access keys that we use to identify an integration in your account. They are directly linked to the :toolTipComponent[application]{link="/developers/en/docs/your-integrations/application-details" linkText="Application details" content="Entity registered in Mercado Pago that acts as an identifier to manage your integrations. For more information, access the link below."} you created for that integration and will allow you to develop your project with the best Mercado Pago security measures.

## Types of credentials

Credentials are divided into two types: **production credentials** and **test credentials**. Below, we explain what they are about.

:::::TabsComponent

::::TabComponent{title="Production credentials"}
### Production credentials

**Production credentials** are a set of keys that allow you to receive real payments in stores and other applications.

When accessing production credentials, the following credential pairs will be displayed: **Public Key and Access Token**, as well as **Client ID and Client Secret**.

### Public Key and Access Token
The **Public Key** and **Access Token** credentials are used, not necessarily together, in integrations made with Mercado Pago payment solutions. They are directly linked to the :toolTipComponent[application]{link="/developers/en/docs/your-integrations/application-details" linkText="Application details" content="Entity registered in Mercado Pago that acts as an identifier to manage your integrations. For more information, access the link below."} you created, so each credential pair is unique for each integration.

| Type | Description |
|---|---|
| Public Key | The application's public key is generally used in the frontend. It allows, for example, access to information about payment methods and encrypt card data. |
| Access Token | Application's private key that should always be used in the backend to generate payments. It is essential to keep this information safe on your servers. |

For more information on which credentials will be needed for your integration, see the [documentation](https://www.mercadopago[FAKER][URL][DOMAIN]/developers/es/docs) of the solution being integrated.

### Client ID and Client Secret

The **Client ID** and **Client Secret** credentials are used primarily in integrations that use [OAuth](/developers/en/docs/security/oauth) as a protocol for obtaining private information from Mercado Pago accounts. In particular, they are used during the **Client Credentials** flow (_grant type_), which allows you to access a resource on your own behalf and obtain an Access Token without user interaction.

They may also be required in some older integrations with e-commerce platforms.

| Type | Description |
|---|---|
| Client ID | Unique identifier that represents your integration. |
| Client Secret | Private key used in some plugins to generate payments. It is extremely important to keep this information secure on your servers and not allow access to any user of the system or intruder. | 

::::

::::TabComponent{title="Test credentials"}
### Test credentials

Test credentials are a set of keys that are used both in the development stage, to ensure secure settings, and in the testing stage, to test the integration.

> NOTE
> 
> Test credentials are only available for [Checkout API](https://www.mercadopago[FAKER][URL][DOMAIN]/developers/en/docs/checkout-api/landing) and [Checkout Bricks](https://www.mercadopago[FAKER][URL][DOMAIN]/developers/en/docs/checkout-bricks/landing) integrations.
---

---

When accessing the test credentials, the **Public Key and Access Token** credential pair will be displayed.

### Public Key and Access Token

The test **Public Key** and **Access Token** credentials are used in the same way as production credentials, but will not allow any real transactions to be made. In some integrations, they will be required during the development stage to simulate transactions and verify that your integration works correctly.

| Type | Description |
|---|---|
| Public Key | The application's public key is generally used in the frontend. It allows, for example, access to information about payment methods and encrypt card data. |
| Access Token | Application's private key that should always be used in the backend to generate payments. It is essential to keep this information safe on your servers. |

> NOTE
> 
> If when creating an application you selected a Mercado Pago product that does not require test credentials, you will not be able to use them. Instead, you must use the production credentials of a [test account](/developers/en/docs/your-integrations/test/accounts) to test your integration properly.

::::

:::::

## Get credentials

Mercado Pago credentials are created from a Mercado Pago application. That is, they are directly linked to the
:toolTipComponent[application]{link="/developers/es/docs/your-integrations/application-details" linkText="Application details" content="Entity registered in Mercado Pago that acts as an identifier to manage your integrations. For more information, see the documentation on [Application details](/developers/en/docs/your-integrations/application-details)."} that you created through Your integrations.

Below, learn how to get the credentials.

1. In the upper right corner of [Mercado Pago Developers](https://www.mercadopago[FAKER][URL][DOMAIN]/developers/panel/app), click **Log in** and fill in the required data with the information corresponding to your Mercado Pago account. Then, click on the **Your integrations** button located in the upper right corner.
2. Access your application or create one if you have not already done so.
3. You will find your credentials under the title **Testing > Test credentials** or **Production > Production credentials**, in the menu located on the left side of the screen.

![Cómo acceder a las credenciales a través de Tus Integraciones](/images/snippets/credentials-test-panel-es.jpg)

![Cómo acceder a las credenciales a través de Tus Integraciones](/images/snippets/credentials-prod-panel-es-v2.jpg)

### Activate production credentials
To obtain production credentials, you must **activate them** by completing some information about your business. Follow the steps below:

1. Go to [Your integrations](https://www.mercadopago[FAKER][URL][DOMAIN]/developers/panel/app) and select an application.
2. Go to the **Production credentials** section in the left side menu. You will find the **Public Key** and the **Access Token**.
3. In the **Industry** field, select from the drop-down menu the industry or category to which the business you are integrating belongs.
4. In the **Website (required)** field, complete with the URL of your business website.
5. Accept the [Privacy Statement](https://www.mercadopago[FAKER[URL][DOMAIN]]/privacidad) and the [Terms and Conditions](/developers/es/docs/resources/legal/terms-and-conditions). Fill in the reCAPTCHA and click on **Activate production credentials**.

When accessing production credentials, the following credential pairs will be displayed: **Public Key and Access Token**, as well as **Client ID and Client Secret**.

> NOTE
>
> Test credentials do not need to be activated. By simply creating an application, you can already use them.

## Share credentials

If you are developing for someone else or receiving help in the integration or configuration of your stores, you can securely share the credentials with another Mercado Pago account.

You can share credentials **up to a maximum of 10 times**. If you reach this limit, you must delete old permissions, without impacting already configured integrations.

In addition, if for security reasons you no longer want to share your credentials, you can cancel access.

Below, we show you how to share credentials.

1. In the upper right corner of [Mercado Pago Developers](https://www.mercadopago[FAKER][URL][DOMAIN]/developers/panel/app), click **Log in** and enter the required data with the information corresponding to your Mercado Pago account. Then, click on the **Your integrations** button located in the upper right corner.
2. Access the application of the integration for which you need to share the credentials.
3. Go to the **Testing** or **Production** section, depending on the type of credential you want to share. Remember that to access production credentials, you must activate them. If you don't know how to activate them, go to [Activate production credentials](/developers/en/docs/credentials#bookmark_activate_production_credentials).
4. Once you select the credentials, go to the *Share credentials with a developer* section and click on the **Share Credentials** button.
5. Enter the email address of the person you want to grant access to. **Remember**: it is mandatory that the email address is associated with a Mercado Pago account.

![Compartir credenciales en Tus Integraciones](/images/snippets/share-credentials-panel-es.jpg)

## Renew credentials

You can renew your **production credentials** for security reasons or any other relevant reason.

> WARNING
>
> Renewing credentials already configured in an integration will affect its operation. It is necessary that **you replace the old credentials with the ones obtained** after the renewal process to continue operating.

To renew a credential pair, follow the steps below.

1. Access your production credentials through [Your integrations](https://www.mercadopago[FAKER][URL][DOMAIN]/developers/panel/app).
2. Select the credential pair you want to renew. These can be **Public Key** and **Access Token** or **Client ID** and **Client Secret**. Keep in mind that both credentials in the pair you choose will be renewed.
3. Click on the three dots located to the right of the credential you want to renew and select **Renew**. Click on **Renew now** to confirm the change.

![Cómo renovar tus credenciales](/images/snippets/renew-credentials-es.jpg)

Ready, your credentials have been renewed.

## Security Recommendations

When integrating Mercado Pago solutions, you will handle sensitive data that you must protect from potential losses or vulnerabilities, such as your Mercado Pago access credentials, the keys you use in your integrations, or your customers' information.

We will show you how you can optimize the security of your integrations in a simple and quick way.

### Send the Access Token by header

Every time you make API calls, send the **Access Token** via _header_ instead of _query param_. This will allow you to protect it so that it is not exposed to anyone outside your integration.

For example, if you perform a **GET** request to the `/users/me` resource, it would be like this:

```curl
curl -H 'Authorization: Bearer {{YOUR_ACCESS_TOKEN}}' \
https://api.mercadolibre.com/users/me
```

### Use OAuth to manage third-party credentials

OAuth is an authorization protocol that allows applications to securely access user accounts in HTTP services without requiring the user to directly share their credentials. It works as an intermediary that facilitates controlled access to user data by third-party applications.

For more information, access the [documentation](/developers/en/docs/security/oauth).


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/additional-content/your-integrations/application-details

# Application details

To access the general data of your application, navigate to the [Developer Dashboard](/developers/panel/app) and click on the card of an application to access the **Application details**.

## Application data

This section displays the basic data of the application, including:
  - **User ID**: Automatically generated user identification number.
  - **Application number**: Automatically generated application identification number.
  - **Integration with**: The product or platform integrated with the application.
  - **Integration model** (if applicable): Integration model options are available depending on the used product or platform.

### Edit data

You can click on the **Edit data** button to view and edit the basic and advanced settings that include the data of your application and the product to be integrated. They are:

#### Basic settings

* **Logo**: JPG or PNG image format up to 1MB.
* **Application name**: To easily identify your applications (maximum of 50 characters).
* **Application short name**: secondary identifier of the application (this field cannot contain spaces or special characters).
* **Application description** (maximum of 150 characters).
* **Industry**: Choose the category that best describes your business.
* **Production website URL** (optional).
* **Payment Solution to be Integrated**: Edit the payment solution to be integrated between **Online Ppyments** and **In-person payments**.
  - **Online payments**: If you are going to use an e-commerce platform, mark **Yes**. Then, select the **platform** you will integrate with. Finally, choose the **product** you are integrating. If you are not using an e-commerce platform, mark **No** and select the **product** you are integrating. Optionally, you can select the integration model(s).
  - **In-person payments**: Select the **product** you are integrating. If you select the QR Code option, optionally you can also choose the integration model(s).

#### Advanced settings

* **Redirect URL**: URL (in https) where you want to receive the authorization code when your integration is set up as a marketplace or performed through the flow **Authorization code** by OAuth. **Make sure that is a static URL**. Check out [OAuth](/developers/en/docs/security/oauth) documentation for more details.
* **Use the authorization code flow with PKCE**: If the integration is done with the flow **Authorization code** by OAuth, you can enable PKCE (Proof Key for Code Exchange) to generate an additional secret code to be used during the authorization process. Check out [Configure PKCE](/developers/en/docs/security/oauth/creation#:~:text=Access%20Token.-,Configure%20PKCE,-The%20PKCE%20) documentation for more details.
* **Application permissions**: Options for accessing your application, including **read**, **offline access** and **write**. By default, your application is created with all permissions enabled, but you can disable a permission by unchecking the corresponding checkbox.

### Delete application

To remove an application, follow these steps:

1. Access the "Edit Application" page.
2. Scroll to the bottom of the page and click on the **Delete Application** button.
This way, the application will be successfully deleted.

> WARNING
>
> Attention
>
> When deleting an application, please note that your store will lose the ability to receive payments through the integration associated with that application. Additionally, all settings, including associated credentials, will be lost. **Once an application is deleted, it cannot be recovered**.

## Application quality measurement

The [quality measurement](/developers/en/docs/integration-quality) is the final stage of the integration process, where you can validate whether it meets the necessary quality and security requirements to provide the best experience for both sellers and buyers.

There are two ways to measure the quality of your integration:
 * **Manual:** you can conduct the measurement on your own whenever you prefer. You only need a `payment ID` from a payment made with production credentials and access **“Integration Quality"** in the side menu, where you can find the step-by-step instructions.

 * **Automatic:** From the 1st to the 7th of each month, Mercado Pago conducts a periodic quality measurement for all integrations with **Checkout Pro, Checkout API , Checkout Bricks, and Mercado Pago Point** that have a payment made with production credentials.

> WARNING
>
> Important
>
> The only way to evaluate the quality of an integration with **QR Code** is by performing a manual measurement. Integrations with **Plugins and Platforms** cannot be evaluated.

As a result of this measurement, you will receive a score indicating how secure and aligned your application's configuration is with Mercado Pago's best integration practices, along with necessary recommendations for adjustments if needed.

For more details, refer to the documentation on [integration quality](/developers/en/docs/integration-quality).

## Integration test

In this section, you have a step-by-step guide to test your integration, which will allow you to validate that you are meeting the necessary requirements based on the integrated product. 

In addition, you have direct links to the corresponding documentation, as well as a status bar that will allow you to view your progress easily.


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/additional-content/your-integrations/dashboard

# Developer dashboard

In the [Developer dashboard](/developers/panel/app), you can find the listing of your applications.

Applications are different integrations contained within one or more stores. You can create an application for each solution you implement in order to keep everything organized and have better management control.

Each application has a set of credentials and the possibility to configure its own notifications. Each card represents a created application and displays the application name and number, along with a button that directs you to the **Application Details** where you can manage it.

## Create a new application

To create an application, you have three options available: with an **AI agent from your code editor**, with the **Mercado Pago Developers Assistant**, or **manually from the** [integration Panel](/developers/panel/app).

![Three options to create an application](/images/snippets/create-application/new-create-app-onboarding-es.png)

:::::TabsComponent
::::TabComponent{title="Create with AI"}

You can use our AI resources to create your application from your IDE or agent in 2 steps. The agent will take care of creating the application in the integration panel and guiding you through the entire configuration.

![Installing the Mercado Pago plugin](/images/snippets/create-application/new-create-app-ia-v2-es.png)

To do this, you have two options: installing the [Mercado Pago Plugin](/developers/en/docs/mp-plugin/overview), available for Claude Code and Codex, or configuring the [Mercado Pago MCP Server](/developers/en/docs/mcp-server/overview), available for editors such as VS Code and Cursor. Follow the instructions for the option you choose.

:::AccordionComponent{title="Plugin"}

### Claude Code

Run the following command to install the Mercado Pago plugin for Claude Code.

```bash
claude plugin install mercadopago@claude-plugins-official
```

Once installed, run the `/mp-connect` command to authorize the agent's access to your Mercado Pago account.

### Codex

Run the following commands to install the Mercado Pago plugin for Codex.

```bash
codex plugin marketplace add mercadopago/mercadopago-codex-marketplace
codex plugin add mercadopago@mercadopago-codex-marketplace
```

Once installed, run the `/mp-connect` command to authorize the agent's access to your Mercado Pago account.

:::

:::AccordionComponent{title="MCP"}

### VS Code

Add the following configuration to your `mcp.json` file.

```json
{
  "mcp": {
  "servers": {
  "mercadopago-mcp-server": {
  "type": "http",
  "url": "https://mcp.mercadopago.com/mcp"
  }
  }
  }
}
```

### Cursor

Add the following configuration to your `mcp.json` file.

```json
{
  "mcpServers": {
  "mercadopago-mcp-server": {
  "url": "https://mcp.mercadopago.com/mcp"
  }
  }
}
```

:::

Finally, ask the agent to create your application in Mercado Pago. If you'd like, you can copy and paste the following prompt.

```
I want to integrate with Mercado Pago. Recommend the ideal payment solution for my project, create the application, and guide me through the integration.
```

> NOTE
>
> You can complete the integration with AI support. If you need help, check the [Integrate with AI guide](/developers/en/docs/ai-resources).

::::
::::TabComponent{title="Create with the Assistant"}

You can use the **Mercado Pago Developers Assistant to create your application** conversationally, without filling out forms. To do this, follow the steps below.

1. Go to [Mercado Pago Developers](https://www.mercadopago[FAKER][URL][DOMAIN]/developers) and log in with your account.
2. In the bottom right corner of the screen, you'll see the **Assistant** widget. Click to open it.
3. From there, you can simply ask the Assistant to create your application conversationally, meaning you tell it you want to create an application and interact with the questions and answers.
3. Next, the Assistant will ask you to provide a series of details to complete the setup:
  - **Application name**: provide a name that lets you identify your integration. It accepts a maximum of 100 characters.
  - **Product to integrate**: from the list of all Mercado Pago payment solutions shown by the Assistant, select the one that best fits your business.
4. Finally, when the Assistant confirms your application has been created, it will show you the **App ID**, the **Product ID**, and the **integration type**, if applicable.

> NOTE
>
> Once your application is created, the Assistant can help you obtain test credentials, production credentials, or configure Webhooks, as well as suggest how to carry out your integration based on your stack.

::::
::::TabComponent{title="Create manually"}

If you prefer, you can **create your application manually** from the [integration Panel](/developers/panel/app) by following the steps below.

![Mercado Pago Developers panel](/images/snippets/create-application/new-create-app-panel1-v2-es.png)

1. Go to [Mercado Pago Developers](https://www.mercadopago[FAKER][URL][DOMAIN]/developers) with your Mercado Pago account.

2. On the home screen, select the **Create in the integration panel** option.

  > NOTE
  >
  > If you already have applications created, go to **Your integrations** and click **Create application**.

3. In **Choose a solution to integrate**, select the payment solution you want to integrate (for example, Checkout Pro, Checkout API, Mercado Pago Point, or QR Code), or, if your store uses an e-commerce platform, select **E-commerce platform**.

4. If you selected **E-commerce platform**, in **Choose the platform**, select the platform you will integrate with. If you selected a specific solution, this step does not apply.

5. In **Other information**, enter an **Application name** that lets you identify it.

6. Accept the [Privacy Statement](https://www.mercadopago[FAKER][URL][DOMAIN]/privacidad) and the [Terms and Conditions](/developers/en/docs/resources/legal/terms-and-conditions), and click **Create application**.

::::
:::::

For each created application, a new card containing the name, number, and quality status of the application is automatically generated in the [Developer dashboard](/developers/panel/app).

> You can measure your integration quality from the application panel, as long as your application uses one of the following supported products: [Checkout Pro](/developers/en/docs/checkout-pro/overview), [Checkout API](/developers/en/docs/checkout-api-payments/overview), [Checkout Bricks](/developers/en/docs/checkout-bricks/overview), or [Mercado Pago Point](/developers/en/docs/mp-point/overview).

## Accessing credentials for an application you don't manage

You can request access to application credentials from other people and integrate solutions for accounts other than your own. To securely request access to credentials for an application you don't manage, follow the steps below:

1. In the [Developer dashboard](/developers/panel/app), click on the **Request access to credentials** button.
2. Click on the "Request credentials" button.
3. Enter the email associated with the account for which the credentials are being requested.
4. Check the "I'm not a robot" checkbox.
5. Click on **Request credentials**.

Once access to the credentials is granted, you can use them to integrate solutions. After the integrations are completed, remove the access permissions for the shared credentials and ensure the security of the data.

> When requesting access to other credentials, you are asking other Mercado Pago accounts to share the public and private keys of their applications with you for integrations. Do not use the credentials of other accounts without proper consent.


---

# Introducción - Mercado Pago Developers


---

**URL:** https://www.mercadopago.com.ar/developers/es/docs/additional-content/your-integrations/application-details

[![Mercado Pago](https://http2.mlstatic.com/frontend-assets/dx-template-lib/assets/logo-mercadopago.svg)

DEVELOPERS](https://www.mercadopago.com.ar/developers/es)

[Ingresar](https://www.mercadolibre.com/jms/mla/lgz/login?platform_id=mp&go=)

Primeros pasos

Pagos online

Pagos presenciales

Apps para plataformas

Herramientas

APIs

SDKs

# 404


---

# Documentação - Mercado Pago Developers


---

**URL:** https://www.mercadopago.com.ar/developers/es/docs/additional-content/your-integrations/credentials

[![Mercado Pago](https://http2.mlstatic.com/frontend-assets/dx-template-lib/assets/logo-mercadopago.svg)

DEVELOPERS](https://www.mercadopago.com.ar/developers/es)

[Ingresar](https://www.mercadolibre.com/jms/mla/lgz/login?platform_id=mp&go=)

Primeros pasos

Pagos online

Pagos presenciales

Apps para plataformas

Herramientas

APIs

SDKs

# 404


---

# Documentação - Mercado Pago Developers


---



# ==================== CUENTAS Y TARJETAS DE PRUEBA ====================

# Origen: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/test/accounts

# Test accounts

Use test accounts to ensure that your integration supports all possible flows and scenarios. They have the same features as a real Mercado Pago account, which allows you to test the functioning of the integrations you are developing.

Test accounts are **automatically created** after the application is created. If you prefer to create them manually, follow the steps below. You can generate **up to 15 test user accounts** simultaneously, and for now, it is not possible to delete them.

> WARNING
>
> Integrations with [Checkout Bricks](/developers/en/docs/checkout-bricks/overview) do not support test accounts for integration testing. For more information, please refer to the documentation [Make test purchase](/developers/en/docs/checkout-bricks/integration-test/test-payment-flow) with Checkout Bricks.

To perform the test, you must have at least two accounts:

* **Seller**: account required to **configure application and credentials**. This is your user account.
* **Buyer**: account required to **test the purchase process**.
* **Integrator**: account used in **marketplace model integrations**.

In addition to these accounts, it is also important to use [test cards](/developers/en/docs/your-integrations/test/cards) to test payment integration and simulate the purchase process, as well as **balance in the test user's Mercado Pago account**. See more details below.

![create test user](/images/snippets/test-cross/test-user-es-create-seller-v1.png)

To create accounts and test how the integrations work, follow the steps below.

1. On the [Devsite](/developers/en/docs), navigate to **[Your integrations](/developers/panel/app)** and click on the card corresponding to your application.
2. On the application page, go to the **Test accounts** section and click the **+ Create test account** button.
3. In the "Create new account" screen, select the **operating country** for the account. This information **cannot be edited later**, and furthermore, the Buyer and Seller users need to be from the same country.
4. Then, enter a description to identify the account. For example: "Seller - Store 1".
5. Next, select the type of account you want to create. This can be **Seller**, **Buyer** or **Integrator**.
6. If the test account requires it, enter a **fictional money value** that will serve as a reference for testing your applications. This value will appear as the balance in the Mercado Pago account of the test user and can be used for payment simulation, just like with the [test cards](/developers/en/docs/your-integrations/test/cards).
7. Authorize the use of your personal data in accordance with the [Privacy Statement](https://www.mercadopago[FAKER][URL][DOMAIN]/privacidad) and ensure that your account uses Mercado Pago's tools in accordance with the [Terms and Conditions](https://www.mercadopago.com.br/developers/en/docs/resources/legal/terms-and-conditions) by checking the checkbox.
8. Click on **Create test account**.

Done! The test account has been created and will be displayed in the table with the information below.

![access test user](/images/snippets/test-cross/test-user-es-list-full-v1.png)

* **Country**: Origin location of the account selected in your registration.
* **User ID**: User identification number, which is created automatically.
* **User**: Automatically generated username of the test account. This is the username used to log in with the test user.
* **Password**: Automatically generated password to access the test user account. To generate a new password, click on the vertical ellipsis (three dots) at the end of the table row and select the **Generate new password** option.
* **Verification code**: 6-digit number that you must enter in case email verification is requested when logging in with the test account.

> NOTE
>
> To edit the **account identification** or **add more fictional money** to test your applications, click on the **vertical ellipsis** (three dots) at the end of the table row and select the **Edit data** option.

## Validate login with test accounts

If an email authentication is requested when logging in with test accounts, enter the **6-digit verification code** of that test account. You can find it in **[Your integrations](/developers/panel/app) > *Your application* > Tests > Test accounts**.

Please note that when you log in with a test account, you will not have access to certain sections within the Developer Dashboard, such as **Test Credentials** or **Integration Quality**. These are sections that are not only not necessary for this type of accounts, but can also interfere with their proper and desired use.


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/test/cards

# Test cards

Mercado Pago provides **test cards** that will allow you to test payments without using a real card.

Their data, such as number, security code, and expiration date, can be combined with the **data relating to the cardholder**, which will allow you to test different payment scenarios. That is, **you can use the information of any test card and test different payment results based on the cardholder's data**.

Below, you can see the data of the **test debit and credit cards**. Select the one you want to use to test your integration.

| Card type | Flag | Number | Security code | Expiration date |
| :--- | :---: | :---: | :---: | :---: |
| Credit card | Mastercard | 5031 7557 3453 0604 | 123 | 11/30 |
| Credit card | Visa | 4509 9535 6623 3704 | 123 | 11/30 |
| Credit card | American Express | 3711 803032 57522 | 1234 | 11/30 |
| Debit card | Mastercard | 5287 3383 1025 3304 | 123 | 11/30 |
| Debit card | Visa | 4002 7686 9439 5619 | 123 | 11/30 |

Next, choose which payment scenario to test and fill in the **cardholder's information** (First name and last name, Document type and number) as indicated in the table below.

| Payment Status | Cardholder’s first and last name | Identity document |
| --- | --- | --- |
| Approved payment | `APRO` | (DNI) 12345678|
| Declined for general error | `OTHE` | (DNI) 12345678 |
| Pending payment | `CONT` | - |
| Declined with validation to authorize | `CALL` | - |
| Declined for insufficient amount | `FUND` | - |
| Declined for invalid security code | `SECU` | - |
| Declined due to due date issue | `EXPI` | - |
| Declined due to form error | `FORM` | - |
| Rejected for missing card_number | `CARD` | - |
| Rejected for invalid installments | `INST` | - |
| Rejected for duplicate payment | `DUPL` | - |
| Rejected for disabled card | `LOCK` | - |
| Rejected for non-permitted card type | `CTNA` | - |
| Rejected due to exceeded PIN attempts | `ATTE` | - |
| Rejected for being on the blacklist | `BLAC` | - |
| Not supported | `UNSU` | - |
| Used to apply amount rules | `TEST` | - |


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/additional-content/your-integrations/test/cards

# Test cards

Mercado Pago provides **test cards** that will allow you to test payments without using a real card.

Their data, such as number, security code, and expiration date, can be combined with the **data relating to the cardholder**, which will allow you to test different payment scenarios. That is, **you can use the information of any test card and test different payment results based on the cardholder's data**.

Below, you can see the data of the **test debit and credit cards**. Select the one you want to use to test your integration.

| Card type | Flag | Number | Security code | Expiration date |
| :--- | :---: | :---: | :---: | :---: |
| Credit card | Mastercard | 5031 7557 3453 0604 | 123 | 11/30 |
| Credit card | Visa | 4509 9535 6623 3704 | 123 | 11/30 |
| Credit card | American Express | 3711 803032 57522 | 1234 | 11/30 |
| Debit card | Mastercard | 5287 3383 1025 3304 | 123 | 11/30 |
| Debit card | Visa | 4002 7686 9439 5619 | 123 | 11/30 |

Next, choose which payment scenario to test and fill in the **cardholder's information** (First name and last name, Document type and number) as indicated in the table below.

| Payment Status | Cardholder’s first and last name | Identity document |
| --- | --- | --- |
| Approved payment | `APRO` | (DNI) 12345678|
| Declined for general error | `OTHE` | (DNI) 12345678 |
| Pending payment | `CONT` | - |
| Declined with validation to authorize | `CALL` | - |
| Declined for insufficient amount | `FUND` | - |
| Declined for invalid security code | `SECU` | - |
| Declined due to due date issue | `EXPI` | - |
| Declined due to form error | `FORM` | - |
| Rejected for missing card_number | `CARD` | - |
| Rejected for invalid installments | `INST` | - |
| Rejected for duplicate payment | `DUPL` | - |
| Rejected for disabled card | `LOCK` | - |
| Rejected for non-permitted card type | `CTNA` | - |
| Rejected due to exceeded PIN attempts | `ATTE` | - |
| Rejected for being on the blacklist | `BLAC` | - |
| Not supported | `UNSU` | - |
| Used to apply amount rules | `TEST` | - |


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/additional-content/your-integrations/test/accounts

# Test accounts

Use test accounts to ensure that your integration supports all possible flows and scenarios. They have the same features as a real Mercado Pago account, which allows you to test the functioning of the integrations you are developing.

Test accounts are **automatically created** after the application is created. If you prefer to create them manually, follow the steps below. You can generate **up to 15 test user accounts** simultaneously, and for now, it is not possible to delete them.

> WARNING
>
> Integrations with [Checkout Bricks](/developers/en/docs/checkout-bricks/overview) do not support test accounts for integration testing. For more information, please refer to the documentation [Make test purchase](/developers/en/docs/checkout-bricks/integration-test/test-payment-flow) with Checkout Bricks.

To perform the test, you must have at least two accounts:

* **Seller**: account required to **configure application and credentials**. This is your user account.
* **Buyer**: account required to **test the purchase process**.
* **Integrator**: account used in **marketplace model integrations**.

In addition to these accounts, it is also important to use [test cards](/developers/en/docs/your-integrations/test/cards) to test payment integration and simulate the purchase process, as well as **balance in the test user's Mercado Pago account**. See more details below.

![create test user](/images/snippets/test-cross/test-user-es-create-seller-v1.png)

To create accounts and test how the integrations work, follow the steps below.

1. On the [Devsite](/developers/en/docs), navigate to **[Your integrations](/developers/panel/app)** and click on the card corresponding to your application.
2. On the application page, go to the **Test accounts** section and click the **+ Create test account** button.
3. In the "Create new account" screen, select the **operating country** for the account. This information **cannot be edited later**, and furthermore, the Buyer and Seller users need to be from the same country.
4. Then, enter a description to identify the account. For example: "Seller - Store 1".
5. Next, select the type of account you want to create. This can be **Seller**, **Buyer** or **Integrator**.
6. If the test account requires it, enter a **fictional money value** that will serve as a reference for testing your applications. This value will appear as the balance in the Mercado Pago account of the test user and can be used for payment simulation, just like with the [test cards](/developers/en/docs/your-integrations/test/cards).
7. Authorize the use of your personal data in accordance with the [Privacy Statement](https://www.mercadopago[FAKER][URL][DOMAIN]/privacidad) and ensure that your account uses Mercado Pago's tools in accordance with the [Terms and Conditions](https://www.mercadopago.com.br/developers/en/docs/resources/legal/terms-and-conditions) by checking the checkbox.
8. Click on **Create test account**.

Done! The test account has been created and will be displayed in the table with the information below.

![access test user](/images/snippets/test-cross/test-user-es-list-full-v1.png)

* **Country**: Origin location of the account selected in your registration.
* **User ID**: User identification number, which is created automatically.
* **User**: Automatically generated username of the test account. This is the username used to log in with the test user.
* **Password**: Automatically generated password to access the test user account. To generate a new password, click on the vertical ellipsis (three dots) at the end of the table row and select the **Generate new password** option.
* **Verification code**: 6-digit number that you must enter in case email verification is requested when logging in with the test account.

> NOTE
>
> To edit the **account identification** or **add more fictional money** to test your applications, click on the **vertical ellipsis** (three dots) at the end of the table row and select the **Edit data** option.

## Validate login with test accounts

If an email authentication is requested when logging in with test accounts, enter the **6-digit verification code** of that test account. You can find it in **[Your integrations](/developers/panel/app) > *Your application* > Tests > Test accounts**.

Please note that when you log in with a test account, you will not have access to certain sections within the Developer Dashboard, such as **Test Credentials** or **Integration Quality**. These are sections that are not only not necessary for this type of accounts, but can also interfere with their proper and desired use.


---



---



# ==================== GUÍA DE INTEGRACIÓN — CHECKOUT PRO (OVERVIEW GENERAL) ====================

# Origen: https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/overview

---
product_landing_hero:
 - title: Integrate Checkout Pro and set up a predesigned experience
 - message: With this solution, your customers buy on your website and pay in the Mercado Pago environment with their saved payment methods.
 - product_svg_image: checkout-pro-en
 - benefit_icon: categories
 - benefit_title: Agile integration
 - benefit_icon: link
 - benefit_title: For web, Android, and iOS
 - benefit_icon: edit
 - benefit_title: Pre-built experience
 - benefit_icon: sort
 - benefit_title: With redirection to Mercado Pago
 - info: Looking for development-free options? Explore [more solutions](/developers/pt/docs#online-payments).
---

---
product_landing_what_it_offers:
 - title: What it offers
 - message: Combine different features to ensure transaction security and conversion.
 - benefit_title: Customization
 - benefit_bullet: Financing in installments
 - benefit_bullet: Return URL after payment approval
 - benefit_bullet: Appearance and style of the payment button
 - benefit_bullet: Customizable payment methods with the option to split the total amount into 2 parts
 - benefit_title: Conversion
 - benefit_bullet: Quick payment with the payment methods saved in Mercado Pago
 - benefit_bullet: Option to pay without a Mercado Pago account, as a guest user
 - benefit_bullet: Online and offline payment methods, such as cards and account money
 - benefit_bullet: Recovery of rejected payments
 - benefit_title: Payment approval
 - benefit_bullet: 3DS 2.0 technology for transaction authentication
 - benefit_bullet: Fraud prevention tools and customer identity verification
 - benefit_bullet: Transaction validation using industry-specific data
 - benefit_title: Fraud protection
 - benefit_bullet: OWASP and PCI DSS protocols
 - benefit_bullet: Buyer identity verification
 - benefit_bullet: Facial recognition with FaceAuth to access the Mercado Pago account
---

---
product_landing_how_works:
 - title: How it works
 - message: The customer chooses the product or service on your site, pays in Mercado Pago’s secure environment, and returns to your website or the configured destination.
 - sub_title: Payment process
 - image: https://http2.mlstatic.com/storage/dx-devsite/docs-assets/custom-upload/2025/3/25/1745607187974-choproes990px.gif
 - image_text: Simulate the payment processing
 - image_text_link: /developers/en/live-demo/checkout-pro
 - list_title: The buyer checks out their shopping cart on your website and chooses to pay with Mercado Pago.
 - list_title: They’re redirected to the payment form, where they decide whether to proceed with their Mercado Pago account or as a guest user.
 - list_title: They can choose their preferred payment method, whether it’s one saved in their account or a new one they entered.
 - list_title: Once the purchase is completed, they are redirected to your website or the configured destination.
 - button_description: How to integrate
 - button_link: /developers/en/docs/checkout-pro-preferences/create-application
---

---
product_landing_what_differentiates:
 - title: What sets it apart
 - message: Compare our checkouts and choose the option that best fits your business. Check the [rates](/developers/es/support/37740).
 - highlight_text: You are here
 - column_product_svg_image: checkout-pro-en
 - column_product: Checkout Pro
 - column_button_text: How to integrate
 - column_button_link: /developers/en/docs/checkout-pro-preferences/create-application
 - column_product_svg_image: checkout-api-en
 - column_product: Checkout API
 - column_button_text: Go to the overview
 - column_button_link: /developers/en/docs/checkout-api-payments/overview
 - column_product_svg_image: checkout-bricks-en
 - column_product: Checkout Bricks
 - column_button_text: Go to the overview
 - column_button_link: /developers/en/docs/checkout-bricks/overview
 - line_text: Integration effort
 - line_type: dots
 - line_values: 2|5|3
 - line_text: Customization level
 - line_type: dots
 - line_values: 2|5|3
 - line_text: Design ready to set up
 - line_type: check
 - line_values: true|false|true
 - line_text: Collection experience
 - line_type: text
 - line_values: In Mercado Pago|In your site|In your site
 - line_text: Recurring payments
 - line_type: check
 - line_values: false|true|true
 - line_text: Payment methods
 - line_type: text
 - line_values: Credit or debit card, Rapipago, Pago Fácil, Mercado Pago Account and Installments without Card|Credit or debit card, Rapipago, Pago Fácil, Mercado Pago Account and Installments without Card|Credit or debit card, Rapipago, Pago Fácil, Mercado Pago Account and Installments without Card
 - line_text: Availability by country
 - line_type: sites
 - line_values: all|all|all
---

---
product_landing_how_integrate:
 - title: How to integrate
 - sub_title: Learn about the steps you need to follow to integrate this solution.
 - requirement_title: Prerequisites
 - requirement_table_title: Seller account
 - requirement_table_list: To integrate Checkout Pro, you need to access Mercado Pago and [create a seller account](https://www.mercadopago[FAKER][URL][DOMAIN]/hub/registration/landing).
 - requirement_table_title: SSL Certificate (Secure Sockets Layer)
 - requirement_table_list: Allows secure browsing and the protection of your data during information transfers.
---
|||column1|||

---
product_landing_how_integrate:
 - list_title: Integration process
 - list_item: [Create an application](/developers/es/docs/checkout-pro-preferences/create-application) from [Your integrations](/developers/panel/app).
 - list_item: [Configure the development environment](/developers/es/docs/checkout-pro-preferences/configure-development-enviroment).
 - list_item: [Create and configure your payment preference](/developers/en/docs/checkout-pro-preferences/create-payment-preference).
 - list_item: [Configure the Back URLs](/developers/en/docs/checkout-pro-preferences/configure-back-urls).
 - list_item: [Add the SDK to the frontend and initialize the checkout](/developers/en/docs/checkout-pro-preferences/web-integration/add-frontend-sdk).
 - list_item: [Configure the payment notifications](/developers/en/docs/checkout-pro-preferences/payment-notifications).
 - list_item: [Test your integration](/developers/en/docs/checkout-pro-preferences/integration-test).
 - list_item: [Go to production](/developers/en/docs/checkout-pro-preferences/go-to-production).
 - button_description: I want to start integrating
 - button_link: /developers/en/docs/checkout-pro-preferences/create-application
---
|||column2|||
<div class="mermaid-overview">
  <pre class="mermaid">
  flowchart TD
  A["Access Your integrations"] --> B["Create application"]
  B --> C["Build the environment"]
  C --> D["Create payment preferences"]
  D -- Amount, payment methods, details, others --> F["Configure notifications"]
  F -- Webhooks and IPN --> E["Test the integration"]
  E -- Successful tests --> H["Go to production"]
  E -- Errors detected --> I["Fix configuration"]
  I --> H
  H --> J["Measure quality"]
  </pre>
</div>
|||


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/landing

---
product_landing_hero:
 - title: Integrate Checkout Pro and set up a predesigned experience
 - message: With this solution, your customers buy on your website and pay in the Mercado Pago environment with their saved payment methods.
 - product_svg_image: checkout-pro-en
 - benefit_icon: categories
 - benefit_title: Agile integration
 - benefit_icon: link
 - benefit_title: For web, Android, and iOS
 - benefit_icon: edit
 - benefit_title: Pre-built experience
 - benefit_icon: sort
 - benefit_title: With redirection to Mercado Pago
 - info: Looking for development-free options? Explore [more solutions](/developers/pt/docs#online-payments).
---

---
product_landing_what_it_offers:
 - title: What it offers
 - message: Combine different features to ensure transaction security and conversion.
 - benefit_title: Customization
 - benefit_bullet: Financing in installments
 - benefit_bullet: Return URL after payment approval
 - benefit_bullet: Appearance and style of the payment button
 - benefit_bullet: Customizable payment methods with the option to split the total amount into 2 parts
 - benefit_title: Conversion
 - benefit_bullet: Quick payment with the payment methods saved in Mercado Pago
 - benefit_bullet: Option to pay without a Mercado Pago account, as a guest user
 - benefit_bullet: Online and offline payment methods, such as cards and account money
 - benefit_bullet: Recovery of rejected payments
 - benefit_title: Payment approval
 - benefit_bullet: 3DS 2.0 technology for transaction authentication
 - benefit_bullet: Fraud prevention tools and customer identity verification
 - benefit_bullet: Transaction validation using industry-specific data
 - benefit_title: Fraud protection
 - benefit_bullet: OWASP and PCI DSS protocols
 - benefit_bullet: Buyer identity verification
 - benefit_bullet: Facial recognition with FaceAuth to access the Mercado Pago account
---

---
product_landing_how_works:
 - title: How it works
 - message: The customer chooses the product or service on your site, pays in Mercado Pago’s secure environment, and returns to your website or the configured destination.
 - sub_title: Payment process
 - image: https://http2.mlstatic.com/storage/dx-devsite/docs-assets/custom-upload/2025/3/25/1745607187974-choproes990px.gif
 - image_text: Simulate the payment processing
 - image_text_link: /developers/en/live-demo/checkout-pro
 - list_title: The buyer checks out their shopping cart on your website and chooses to pay with Mercado Pago.
 - list_title: They’re redirected to the payment form, where they decide whether to proceed with their Mercado Pago account or as a guest user.
 - list_title: They can choose their preferred payment method, whether it’s one saved in their account or a new one they entered.
 - list_title: Once the purchase is completed, they are redirected to your website or the configured destination.
 - button_description: How to integrate
 - button_link: /developers/en/docs/checkout-pro-preferences/create-application
---

---
product_landing_what_differentiates:
 - title: What sets it apart
 - message: Compare our checkouts and choose the option that best fits your business. Check the [rates](/developers/es/support/37740).
 - highlight_text: You are here
 - column_product_svg_image: checkout-pro-en
 - column_product: Checkout Pro
 - column_button_text: How to integrate
 - column_button_link: /developers/en/docs/checkout-pro-preferences/create-application
 - column_product_svg_image: checkout-api-en
 - column_product: Checkout API
 - column_button_text: Go to the overview
 - column_button_link: /developers/en/docs/checkout-api-payments/overview
 - column_product_svg_image: checkout-bricks-en
 - column_product: Checkout Bricks
 - column_button_text: Go to the overview
 - column_button_link: /developers/en/docs/checkout-bricks/overview
 - line_text: Integration effort
 - line_type: dots
 - line_values: 2|5|3
 - line_text: Customization level
 - line_type: dots
 - line_values: 2|5|3
 - line_text: Design ready to set up
 - line_type: check
 - line_values: true|false|true
 - line_text: Collection experience
 - line_type: text
 - line_values: In Mercado Pago|In your site|In your site
 - line_text: Recurring payments
 - line_type: check
 - line_values: false|true|true
 - line_text: Payment methods
 - line_type: text
 - line_values: Credit or debit card, Rapipago, Pago Fácil, Mercado Pago Account and Installments without Card|Credit or debit card, Rapipago, Pago Fácil, Mercado Pago Account and Installments without Card|Credit or debit card, Rapipago, Pago Fácil, Mercado Pago Account and Installments without Card
 - line_text: Availability by country
 - line_type: sites
 - line_values: all|all|all
---

---
product_landing_how_integrate:
 - title: How to integrate
 - sub_title: Learn about the steps you need to follow to integrate this solution.
 - requirement_title: Prerequisites
 - requirement_table_title: Seller account
 - requirement_table_list: To integrate Checkout Pro, you need to access Mercado Pago and [create a seller account](https://www.mercadopago[FAKER][URL][DOMAIN]/hub/registration/landing).
 - requirement_table_title: SSL Certificate (Secure Sockets Layer)
 - requirement_table_list: Allows secure browsing and the protection of your data during information transfers.
---
|||column1|||

---
product_landing_how_integrate:
 - list_title: Integration process
 - list_item: [Create an application](/developers/es/docs/checkout-pro-preferences/create-application) from [Your integrations](/developers/panel/app).
 - list_item: [Configure the development environment](/developers/es/docs/checkout-pro-preferences/configure-development-enviroment).
 - list_item: [Create and configure your payment preference](/developers/en/docs/checkout-pro-preferences/create-payment-preference).
 - list_item: [Configure the Back URLs](/developers/en/docs/checkout-pro-preferences/configure-back-urls).
 - list_item: [Add the SDK to the frontend and initialize the checkout](/developers/en/docs/checkout-pro-preferences/web-integration/add-frontend-sdk).
 - list_item: [Configure the payment notifications](/developers/en/docs/checkout-pro-preferences/payment-notifications).
 - list_item: [Test your integration](/developers/en/docs/checkout-pro-preferences/integration-test).
 - list_item: [Go to production](/developers/en/docs/checkout-pro-preferences/go-to-production).
 - button_description: I want to start integrating
 - button_link: /developers/en/docs/checkout-pro-preferences/create-application
---
|||column2|||
<div class="mermaid-overview">
  <pre class="mermaid">
  flowchart TD
  A["Access Your integrations"] --> B["Create application"]
  B --> C["Build the environment"]
  C --> D["Create payment preferences"]
  D -- Amount, payment methods, details, others --> F["Configure notifications"]
  F -- Webhooks and IPN --> E["Test the integration"]
  E -- Successful tests --> H["Go to production"]
  E -- Errors detected --> I["Fix configuration"]
  I --> H
  H --> J["Measure quality"]
  </pre>
</div>
|||


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/integrate-preferences

# Create application

**Applications** are registered entities within Mercado Pago that act as a unique identifier for managing the authentication and authorization of your integrations. They represent the link between your development and Mercado Pago and constitute the first stage in carrying out the integration.

To create an application, you have three options available: with an **AI agent from your code editor**, with the **Mercado Pago Developers Assistant**, or **manually from the** [integration Panel](/developers/panel/app).

![Three options to create an application](/images/snippets/create-application/new-create-app-onboarding-es.png)

:::::TabsComponent
::::TabComponent{title="Create with AI"}

You can use our AI resources to create your application from your IDE or agent in 2 steps. The agent will take care of creating the application in the integration panel and guiding you through the entire configuration.

![Installing the Mercado Pago plugin](/images/snippets/create-application/new-create-app-ia-v2-es.png)

To do this, you have two options: installing the [Mercado Pago Plugin](/developers/en/docs/mp-plugin/overview), available for Claude Code and Codex, or configuring the [Mercado Pago MCP Server](/developers/en/docs/mcp-server/overview), available for editors such as VS Code and Cursor. Follow the instructions for the option you choose.

:::AccordionComponent{title="Plugin"}

### Claude Code

Run the following command to install the Mercado Pago plugin for Claude Code.

```bash
claude plugin install mercadopago@claude-plugins-official
```

Once installed, run the `/mp-connect` command to authorize the agent's access to your Mercado Pago account.

### Codex

Run the following commands to install the Mercado Pago plugin for Codex.

```bash
codex plugin marketplace add mercadopago/mercadopago-codex-marketplace
codex plugin add mercadopago@mercadopago-codex-marketplace
```

Once installed, run the `/mp-connect` command to authorize the agent's access to your Mercado Pago account.

:::

:::AccordionComponent{title="MCP"}

### VS Code

Add the following configuration to your `mcp.json` file.

```json
{
  "mcp": {
  "servers": {
  "mercadopago-mcp-server": {
  "type": "http",
  "url": "https://mcp.mercadopago.com/mcp"
  }
  }
  }
}
```

### Cursor

Add the following configuration to your `mcp.json` file.

```json
{
  "mcpServers": {
  "mercadopago-mcp-server": {
  "url": "https://mcp.mercadopago.com/mcp"
  }
  }
}
```

:::

Finally, ask the agent to create your application in Mercado Pago. If you'd like, you can copy and paste the following prompt.

```
I want to integrate with Mercado Pago. Recommend the ideal payment solution for my project, create the application, and guide me through the integration.
```

> NOTE
>
> You can complete the integration with AI support. If you need help, check the [Integrate with AI guide](/developers/en/docs/ai-resources).

::::
::::TabComponent{title="Create with the Assistant"}

You can use the **Mercado Pago Developers Assistant to create your application** conversationally and easily, without navigating through forms. To do this, follow the steps below.

1. Go to [Mercado Pago Developers](https://www.mercadopago[FAKER][URL][DOMAIN]/developers) and log in with your account.
2. In the bottom right corner of the screen, you'll see the **Assistant** widget. Click to open it.
3. From there, you can simply ask the Assistant to create your application conversationally, meaning you tell it you want to create an application and interact with the questions and answers.
3. Next, the Assistant will ask you to provide a series of details to complete the setup:
  - **Application name**: provide a name that lets you identify your integration. It accepts a maximum of 100 characters.
  - **Product to integrate**: from the list of all Mercado Pago payment solutions shown by the Assistant, select the one that best fits your business.
4. Finally, when the Assistant confirms your application has been created, it will show you the **App ID**, the **Product ID**, and the **integration type**, if applicable.

> NOTE
>
> Once your application is created, the Assistant can help you obtain test credentials, production credentials, or configure Webhooks, as well as suggest how to carry out your integration based on your stack.

::::
::::TabComponent{title="Create manually"}

If you prefer, you can **create your application manually** from the [integration Panel](/developers/panel/app) by following the steps below.

![Mercado Pago Developers panel](/images/snippets/create-application/new-create-app-panel1-v2-es.png)

1. Go to [Mercado Pago Developers](https://www.mercadopago[FAKER][URL][DOMAIN]/developers) with your Mercado Pago account.

2. On the home screen, select the **Create in the integration panel** option.

  > NOTE
  >
  > If you already have applications created, go to **Your integrations** and click **Create application**.

3. In **Choose a solution to integrate**, select **Checkout Pro**.
4. In **Other information**:
  - **API type**: select **Preferences API**.
  - **Application name**: enter a name that lets you identify it.
5. Accept the [Privacy Statement](https://www.mercadopago[FAKER][URL][DOMAIN]/privacidad) and the [Terms and Conditions](/developers/en/docs/resources/legal/terms-and-conditions) and click **Create application**.

![Application creation form (Checkout Pro / Preferences API)](/images/snippets/create-application/new-create-app-panel2-choprolegacy-es.png)

::::
:::::

In [Your integration](/developers/panel/app), you will be able to view the list of all your created applications and access the [Integration data](/developers/en/docs/checkout-pro-preferences/resources/application-details) for each of them.

> NOTE
>
> If you wish, you can edit or delete an application. In the latter case, keep in mind that your store will lose the ability to receive payments through the Mercado Pago integration associated with that application. For more information, please refer to the [Integration data](/developers/en/docs/checkout-pro-preferences/resources/application-details).

## Access test credentials

After creating your application, the :toolTipComponent[test credentials]{link="/developers/en/docs/checkout-pro-preferences/resources/credentials" linkText="Credentials" content="Unique access keys that we use to identify an integration in your account, linked to your application. For more information, see the link below."} will also be automatically created. Use the **test credentials** to perform all necessary configurations and validations in a secure test environment.

When accessing test credentials, the following credential pairs will be displayed: :toolTipComponent[Public Key]{content="Public key used in the frontend to access information and encrypt data. You can access it through *Your integrations > Integration data > Tests > Test credentials*."} and the :toolTipComponent[Access Token]{content="Private key of the application created in Mercado Pago, that must be used in the backend. You can access it through *Your integrations > Integration data > Tests > Test credentials*."}. The test Access Token starts with the prefix `APP_USR`, just like your production Access Token.

![test credentials](/images/snippets/credentials/app-data-test-credentials-es-v1.png)

> NOTE
>
> If you are using an existing application, you will need to activate the test credentials. For more information, see the [Credentials](/developers/en/docs/checkout-pro-preferences/additional-content/credentials) documentation.


---



---



# ==================== CHARGEBACKS / CONTRACARGOS (REFERENCE) ====================

# Origen: https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/chargebacks/search-chargebacks/get

# Search chargebacks

This endpoint allows you to search for all chargeback cases associated with a `payment_id`, returned from a notification configured for the `chargebacks` topic. The requester must be the seller of the queried payment, and the response will include pagination and the full details of each case found, including the status of its supporting documentation. In case of success, the request will return a response with status 200.

**GET** `/v1/chargebacks/search`

## Request parameters

### Header

- `X-Caller-Id` (integer, required)
  ID of the authenticated user (`seller ID`) and owner of the requested resource.

### Query

- `payment_id` (integer, required)
  ID of the payment for which chargeback cases are to be searched, obtained from a notification configured for the `chargebacks` topic.

- `offset` (integer, optional)
  Number of results to skip for pagination. The minimum and default value is 0.

- `limit` (integer, optional)
  Number of results per page. The minimum value is 1 and the default value is 10.

## Response parameters

- `paging` (object, optional)
  Pagination metadata.

  - `paging.offset` (integer, optional)
  Index of the first returned result.

  - `paging.limit` (integer, optional)
  Maximum number of results per page.

  - `paging.total` (integer, optional)
  Total results available for the search.

- `results` (array, optional)
  List of chargeback cases found.

  - `results[].id` (string, optional)
  Unique identifier of the case.

  - `results[].payments` (array, optional)
  IDs of the payments associated with the case. May include multiple payments when they are cart or bundle purchases.

  - `results[].currency` (string, optional)
  Currency in which the disputed amount is.

  - `results[].amount` (number, optional)
  Total disputed amount.

  - `results[].reason` (string, optional)
  Human-readable reason for the chargeback, as provided by the payment method or card network.

  - `results[].reason_id` (string, optional)
  Identifier of the chargeback reason.

  - `results[].coverage_applied` (boolean, optional, nullable)
  Indicates whether Mercado Pago applied coverage to the seller. A value of `true` means coverage was applied, so the money is not frozen and the seller is protected by the coverage policy. A value of `false` means coverage was not applied.

  - `results[].coverage_eligible` (boolean, optional)
  Indicates whether the case meets the coverage eligibility criteria based on the payment flow and product classification. A value of `true` means the case is eligible, while `false` means it is not.

  - `results[].documentation_required` (boolean, optional)
  Legacy field. Regardless of whether the returned value is `true` or `false`, always submit supporting documentation to substantiate the chargeback dispute and demonstrate the validity of the sale.

  - `results[].documentation_status` (string, optional)
  Status of the supporting documentation submitted by the seller.
Possible enum values:

  - `pending`
  The supporting documentation has not yet been submitted by the seller.

  - `review_pending`
  The supporting documentation was submitted and is pending review by the Mercado Pago team.

  - `valid`
  The submitted supporting documentation was reviewed and considered valid.

  - `invalid`
  The submitted supporting documentation was reviewed and considered invalid.

  - `not_supplied`
  No supporting documentation was submitted within the established deadline.

  - `not_applicable`
  The API classified supporting documentation as not applicable to this case. This returned status is independent of the legacy `documentation_required` field; submit files when `documentation_status` is `pending`.

  - `results[].documentation` (array, optional)
  List of supporting documentation files already uploaded for the case.

  - `results[].documentation[].type` (string, optional)
  Party responsible for uploading the supporting documentation. The only allowed value is `collector`, used for files uploaded by the seller.
Possible enum values:

  - `collector`
  The only allowed value. Identifies supporting documentation files uploaded by the seller.

  - `results[].documentation[].url` (string, optional)
  URL to access or view the supporting file.

  - `results[].documentation[].description` (string, optional)
  Descriptive text identifying the type of evidence in the supporting file. For example: invoice, shipping proof, screenshot, etc.

  - `results[].documentation[].uuid` (string, optional)
  Unique identifier of the supporting file. Used as the `uuid` parameter in the `GET /v1/chargebacks/documentation/{type}/{uuid}` endpoint to download or render the file.

  - `results[].date_documentation_deadline` (string, optional, nullable)
  Deadline date and time to submit the supporting documentation, in ISO 8601 format. Returns `null` when the API does not provide a deadline.

  - `results[].date_created` (string, optional)
  Date the case was opened in ISO 8601 format.

  - `results[].date_last_updated` (string, optional)
  Date of the last update to the case in ISO 8601 format.

  - `results[].live_mode` (boolean, optional)
  Indicates whether the case corresponds to a production environment. When `true`, the case corresponds to real transactions, not test ones.

## Errors

| Status | Error | Description |
| ------- | ------- | ----------- |
| 400 | invalid_payment_id | The `payment_id` parameter is missing or invalid. Check the notification received for the `chargebacks` topic to obtain the correct ID. |
| 403 | unauthorized_payment_access | The requester is not authorized to query the indicated payment. Only the seller account associated with the payment can perform this query. |
| 500 | internal_error | A generic error occurred. Check the request and try again. |

## Request example

### cURL

```bash
curl -X GET \
  'https://api.mercadopago.com/v1/chargebacks/search?payment_id=<PAYMENT_ID>&offset=<OFFSET>&limit=<LIMIT>' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

## Response example

```json
{
  "paging": {
  "offset": 0,
  "limit": 10,
  "total": 1
  },
  "results": [
  {
  "id": "123456789",
  "payments": [
  987654321
  ],
  "currency": "ARS",
  "amount": "50.00",
  "reason": "unauthorized",
  "reason_id": "6",
  "coverage_applied": true,
  "coverage_eligible": true,
  "documentation_required": true,
  "documentation_status": "pending",
  "documentation": [
  {
  "type": null,
  "url": null,
  "description": null,
  "uuid": null
  }
  ],
  "date_documentation_deadline": "2024-02-15T23:59:59.000-03:00",
  "date_created": "2024-02-01T10:30:00.000-03:00",
  "date_last_updated": "2024-02-03T14:00:00.000-03:00",
  "live_mode": true
  }
  ]
}
```


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/chargebacks/get-chargeback/get

# Save card

Store the card reference used by the customer in the payment securely on our servers to avoid asking for all the data in future transactions.

**POST** `/v1/customers/{customer_id}/cards`

## Request parameters

### Path

- `customer_id` (string, required)
  Customer's Id

- `token` (string, optional)
  Card Token

## Response parameters

- `id` (string, optional)
  id

- `expiration_month` (number, optional)
  expiration_month

- `expiration_year` (number, optional)
  expiration_year

- `first_six_digits` (string, optional)
  first_six_digits

- `last_four_digits` (string, optional)
  last_four_digits

- `payment_method` (object, optional)
  payment_method

  - `payment_method.id` (string, optional)
  id

  - `payment_method.name` (string, optional)
  name

  - `payment_method.payment_type_id` (string, optional)
  payment_type_id

  - `payment_method.thumbnail` (string, optional)
  thumbnail

  - `payment_method.secure_thumbnail` (string, optional)
  secure_thumbnail

- `security_code` (object, optional)
  security_code

  - `security_code.length` (number, optional)
  length

  - `security_code.card_location` (string, optional)
  card_location

- `issuer` (object, optional)
  issuer

  - `issuer.id` (number, optional)
  id

  - `issuer.name` (string, optional)
  name

- `cardholder` (object, optional)
  cardholder

  - `cardholder.name` (string, optional)
  name

  - `cardholder.identification` (object, optional)
  identification

  - `cardholder.identification.number` (string, optional)
  number

  - `cardholder.identification.type` (string, optional)
  type

- `date_created` (string, optional)
  date_created

- `date_last_updated` (string, optional)
  date_last_updated

- `customer_id` (string, optional)
  customer_id

- `user_id` (string, optional)
  user_id

- `live_mode` (boolean, optional)
  live_mode

## Errors

| Status | Error | Description |
| ------- | ------- | ----------- |
| 400 | 100 | the credentials are required. |
| 400 | 101 | the customer already exist. |
| 400 | 102 | missing customer id. |
| 400 | 103 | parameter must be an object |
| 400 | 104 | parameter length is too large. |
| 400 | 105 | the customer id is invalid. |
| 400 | 106 | the email format is invalid. |
| 400 | 107 | the first_name is invalid. |
| 400 | 108 | the last_name is invalid. |
| 400 | 109 | the phone.area_code is invalid. |
| 400 | 110 | the phone.number is invalid. |
| 400 | 111 | the identification.type is invalid. |
| 400 | 112 | the identification.number is invalid. |
| 400 | 113 | the address.zip_code is invalid. |
| 400 | 114 | the address.street_name is invalid. |
| 400 | 115 | the date_registered format is invalid. |
| 400 | 116 | the description is invalid. |
| 400 | 117 | the metadata is invalid. |
| 400 | 118 | the body must be a Json object |
| 400 | 119 | the card is required. |
| 400 | 120 | card not found. |
| 400 | 121 | the card is invalid. |
| 400 | 122 | the card data is invalid. |
| 400 | 123 | the payment_method_id is required. |
| 400 | 124 | the issuer_id is required. |
| 400 | 125 | invalid parameters. |
| 400 | 126 | invalid parameter. You cannot update the email. |
| 400 | 127 | invalid parameter. Cannot resolve the payment method of card, check the payment_method_id and issuer_id. |
| 400 | 128 | the email format is invalid. Use 'test_payer_[0-9]{1,10}@testuser.com'. |
| 400 | 129 | the customer has reached the maximum allowed number of cards. |
| 400 | 140 | invalid card owner. |
| 400 | 150 | invalid users involved. |
| 400 | 200 | invalid range format (range=:date_parameter:after::date_from,before::date_to). |
| 400 | 201 | range attribute must belong to date entity. |
| 400 | 202 | invalid 'after' parameter. It should be date[iso_8601]. |
| 400 | 203 | invalid 'before' parameter. It should be date[iso_8601]. |
| 400 | 204 | invalid filters format. |
| 400 | 205 | invalid query format. |
| 400 | 206 | attributes to sort must belong to 'customer' entity. |
| 400 | 207 | order filter must be 'asc' or 'desc'. |
| 400 | 208 | invalid 'sort' parameter format. |
| 401 | unauthorized | unauthorized. |
| 404 | cards API unavailable for legal reasons | Error returned when the email used by the payer requests cancellation from Mercado Pago. |
| 451 | Unavailable for legal reasons | Error returned when the email used by the payer requests cancellation from Mercado Pago. |

## Request example

### cURL

```bash
curl -X POST \
  'https://api.mercadopago.com/v1/customers/{customer_id}/cards' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -d '{
  "token": "9b2d63e00d66a8c721607214ceda233a"
  }'
```

## Response example

```json
{
  "id": 1562188766852,
  "expiration_month": 6,
  "expiration_year": 2023,
  "first_six_digits": 423564,
  "last_four_digits": 5682,
  "payment_method": {
  "id": "master",
  "name": "master",
  "payment_type_id": "credit_card",
  "thumbnail": "http://img.mlstatic.com/org-img/MP3/API/logos/visa.gif",
  "secure_thumbnail": "https://www.mercadopago.com/org-img/MP3/API/logos/visa.gif"
  },
  "security_code": {
  "length": 3,
  "card_location": "back"
  },
  "issuer": {
  "id": 25,
  "name": "master"
  },
  "cardholder": {
  "name": "APRO",
  "identification": {
  "number": 19119119100,
  "type": "DNI"
  }
  },
  "date_created": "2019-07-03T21:15:35.000Z",
  "date_last_updated": "2019-07-03T21:19:18.000Z",
  "customer_id": "448870796-7ZjwhKGxILixxN",
  "user_id": 448870796,
  "live_mode": true
}
```


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/chargebacks/upload-supporting-documentation/post

# Upload supporting documentation

This endpoint allows you to upload supporting documentation files to dispute a chargeback case. Supported file types: `image/jpeg`, `image/png`, and `application/pdf`. Before uploading documentation, verify the case status with `GET /v1/chargebacks/{id}` to confirm that `documentation_status=pending`, since documentation can only be uploaded once per case. In case of success, the request will return a response with status 200.

**POST** `/v1/chargebacks/{id}/documentation`

## Request parameters

### Header

- `X-Caller-Id` (integer, required)
  ID of the authenticated user (`seller ID`) and owner of the requested resource.

### Path

- `id` (string, required)
  Numeric `case_id` of the chargeback case to upload the supporting documentation for.

## Response parameters

This endpoint has no response body.

## Errors

| Status | Error | Description |
| ------- | ------- | ----------- |
| 400 | missing_required_params | The `case_id` of the chargeback or the `X-Caller-Id` parameter is missing. Resend the request with the required information. |
| 400 | missing_files | No supporting files were sent in the request. Resend the request including the required files. |
| 400 | empty_file | The uploaded supporting file is empty. Resend the request with valid files. |
| 400 | documentation_already_submitted | The case already has supporting documentation submitted (`documentation_status` is not `pending`). Send a request to the retrieval endpoint (`GET /v1/chargebacks/{id}`) to check the file that was already submitted. |
| 403 | invalid_user_for_operation | The caller does not have permission to access the requested resource (not the owner of the case or supporting file). |
| 413 | too_many_files | More than 10 supporting files were sent, exceeding the allowed limit. |
| 413 | file_size_exceeded | The total size of the supporting files exceeds 10 MB, exceeding the allowed limit. |
| 415 | unsupported_file_type | The supporting file format is invalid. Only JPEG, PNG, and PDF files are supported. |
| 500 | internal_error | A generic error occurred. Check the request and try again. |

## Request example

### cURL

```bash
curl -X POST \
  'https://api.mercadopago.com/v1/chargebacks/{id}/documentation' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

## Response example

```json
[
  {
  "type": "collector",
  "url": "https://storage.mlstatic.com/op/123/456789/comprobante.pdf",
  "description": "Chargeback 1",
  "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
]
```


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/chargebacks/get-supporting-documentation/get

# Get supporting documentation file

This endpoint allows you to download or render inline a documentation file previously uploaded to a chargeback case. The file is identified by its unique `uuid` and returned with its original MIME type, allowing it to be viewed directly in the browser. In case of success, the request will return a response with status 200.

**GET** `/v1/chargebacks/documentation/{type}/{uuid}`

## Request parameters

### Header

- `X-Caller-Id` (integer, required)
  ID of the authenticated user (`seller ID`) and owner of the requested resource.

### Path

- `type` (string, required)
  Type of the requested document. The only allowed value is `collector`, used for files uploaded by the seller.

- `uuid` (string, required)
  Unique identifier of the supporting documentation file, obtained from the `documentation` array in the response of `GET /v1/chargebacks/{id}`.

## Response parameters

This endpoint has no response body.

## Errors

| Status | Error | Description |
| ------- | ------- | ----------- |
| 400 | invalid_path_param | One or more parameters provided in the request path are invalid. Please confirm them and provide valid values to try again. |
| 403 | invalid_user_for_operation | The caller does not have permission to access the requested resource (not the owner of the case or supporting file). |
| 500 | internal_error | A generic error occurred. Check the request and try again. |

## Request example

### cURL

```bash
curl -X GET \
  'https://api.mercadopago.com/v1/chargebacks/documentation/{type}/{uuid}' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```


---



---



# ==================== RECHAZOS DE PAGO ====================

# Origen: https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/how-tos/improve-payment-approval/reasons-for-rejection

# Why is a payment rejected?

> RED_MESSAGE
>
> This documentation is intended for integrators. If you are a buyer and your payment was declined when using Mercado Pago, please check [this article](https://www.mercadopago.com.ar/ayuda/25671) in our Help Center for guidance on how to proceed.

Payment declines are a reality in the world of online sales and can happen for various reasons. **A payment may be declined due to**:

* An error with the payment method;
* Incorrect information entered by the customer;
* Card with insufficient funds;
* Violation of necessary security requirements;
* Suspicious movements indicating fraud risk;
* Communication issues between acquirers and sub-acquirers.

You can find **information and check the status of a payment** via API through the endpoint :TagComponent{tag="API" text="Get payments" href="/developers/en/reference/online-payments/checkout-pro-preferences/get-payment/get"}. The `status` field indicates whether the payment was approved or not, while the `status_detail` field provides more details, including reasons for decline.

```curl
{
  "status": "rejected",
  "status_detail": "cc_rejected_insufficient_amount",
  "id": 47198050,
  "payment_method_id": "master",
  "payment_type_id": "credit_card",
  ...
}
```

> SUCCESS_MESSAGE
>
> You can also find more information about payments in your [Mercado Pago](https://www.mercadopago[FAKER][URL][DOMAIN]/activities) account activity.

:::AccordionComponent{title="Declines due to input errors"} 
These decline reasons occur due to **errors during checkout**. This can happen for various reasons, such as misunderstanding of the payment screen, buyer experience issues, lack of field validation, or errors that the buyer may make when entering their data, especially card information.

In these cases, the `status_detail` field will return: 

* `cc_rejected_bad_filled_card_number`
* `cc_rejected_bad_filled_date`
* `cc_rejected_bad_filled_other`
* `cc_rejected_bad_filled_security_code`

:::
:::AccordionComponent{title="Declines by the issuing bank"} 
When making a **credit or debit card payment**, for example, the issuing bank may decline the charge for different reasons, such as expired expiration date, insufficient balance or credit limit, disabled card, or card blocked for online purchases.

In these cases, the `status_detail` field may return: 

* `cc_rejected_call_for_authorize`
* `cc_rejected_card_disabled`
* `cc_rejected_duplicated_payment`
* `cc_rejected_insufficient_amount`
* `cc_rejected_invalid_installments`
* `cc_rejected_max_attempts`

:::
:::AccordionComponent{title="Declines due to fraud prevention"} 
We monitor transactions in real-time looking to **recognize suspicious patterns and resources** that indicate a fraud attempt. This is done by both Mercado Pago's algorithms and banks, all to minimize chargebacks as much as possible.

When our fraud prevention system detects a suspicious payment, the `status_detail` field may return:

* `cc_rejected_blacklist`
* `cc_rejected_high_risk`
* `cc_rejected_other_reason`

The response `cc_rejected_other_reason` is a status given by the bank that doesn’t mention the reason of the rejection, but indicates a fraude risk estimation. However, there may be other reasons why this status is returned. In case of doubt, it is recommended to choose other payment method to fulfill the transaction or to get in touch with the issuer bank institution.

> WARNING
>
> In some cases, the `high_risk` response may occur when two consecutive payments are made with the same items or with very similar parameters (such as identical `payer` and `items` values in both payments made). This can trigger the anti-fraud engine, which may interpret the attempt as duplicate and reject it as a precaution. As a consequence, subsequent payments may be temporarily blocked. It is recommended to implement controls to prevent immediate new attempts with the same payment data.

```json
 {
  "status": "rejected",
  "status_detail": "cc_rejected_high_risk",
  "id": 47198050,
  "payment_method_id": "master",
  "payment_type_id": "credit_card",
  ...
}
```

:::


---



---



# ==================== SEGURIDAD GENERAL (PCI DSS, OWASP) ====================

# Origen: https://www.mercadopago.com.ar/developers/es/docs/security/landing-hub

# Security

At Mercado Pago, we have implemented a series of security measures designed to protect customer and user payments, ensure confidentiality and integrity in all processes, and provide greater security in the integrations that our payment solutions offer.

Next, we present the protocols used by Mercado Pago.

## OAuth

OAuth (Open Authorization) is an authorization protocol that allows applications to gain limited access to user accounts on an HTTP service, such as social networks, without the user having to share their credentials. Instead, OAuth defines a method for users to grant third-party applications access to their data without needing to reveal their login information.

For more information, access the [documentation](/developers/en/docs/security/oauth).

## OWASP

OWASP (Open Web Application Security Project) is an open and secure community that provides tools and standards for the development and maintenance of web applications. It aims to promote the research and development of security in applications. Through its initiatives, OWASP contributes to raising the security standard in the software industry and creating a safer online community.

For more information, access the [documentation](/developers/es/docs/security/owasp).

## PCI DSS

PCI DSS (Payment Card Industry Data Security Standard) is an international security standard that all entities storing, processing, or transmitting card data must comply with. It is one of the most demanding security standards in the payment industry, which Mercado Pago adheres to, allowing it to operate with credit and debit cards.

For more information, access the [documentation](/developers/en/docs/security/pci).


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/security/pci

# PCI DSS

At Mercado Pago we ensure the Confidentiality, Availability and Integrity of all our processes following the best market practices so that you can use all our products safely. 

In addition, for Mercado Pago to be able to operate with credit and debit cards, we must comply with one of the most demanding security standards in the payment industry: Payment Card Industry Data Security Standard.

## Definition and context
If you have ever stored, processed or transmitted card data in your company, you have probably heard of PCI. From Mercado Pago we want to help you and simplify the task of understanding these regulations and the different associated responsibilities.

As a Service Provider, we must meet regulatory and security responsibilities towards card brands and acquirers, but even so, security throughout the payment process is the obligation of both parties. Merchants and / or e-commerce platforms that are integrated with payment processors such as Mercado Pago must meet minimum security requirements to mitigate risks of fraud and information leakage, securing user data.

PCI DSS (Payment Card Industry Data Security Standard) is an international security standard that must be met by all entities that store, process or transmit card data.

PCI regulations establish a basic level of protection for cardholders (cardholders) and help reduce fraud and data breaches within the entire payments ecosystem. 

Compliance with PCI regulations involves 3 important aspects:

- Securely transmit the information corresponding to cardholder data.
- Store data according to the best security practices in the industry, under 12 regulatory requirements that are included in the PCI Standard.
- Annual validation of compliance with the security controls and evaluation forms proposed by the PCI Council. 

We recommend that you visit the [official PCI site](https://www.pcisecuritystandards.org/) for more information. Here is a summary of the objectives of PCI security controls.

**Objective** | **Requirement**
------------- | ---------------
CREATE AND MAINTAIN SECURE SYSTEMS AND NETWORK | Install and maintain a firewall configured to protect cardholder data. Do not use vendor-supplied defaults for system passwords and other security parameters.|
PROTECT THE DATA OF THE CARD HOLDERS | Protect the stored cardholder data. Encrypt the transmission of cardholder data on open or public networks.
MAINTAIN A VULNERABILITY MANAGEMENT PROGRAM | Protect all systems against malicious software and regularly update antivirus software. Develop and maintain secure systems and applications.
SOLID CONTROL MEASURES APPLYING ACCESS | Restrict access to data accordance with the need to know who has the organization. Identify and authenticate access to system components. Restrict physical access to cardholder data.
MONITOR AND PERIODICALLY VERIFY NETWORKS | Track and monitor all access to network resources and cardholder data. Periodically verify security systems and processes.
HAVE AN INFORMATION SECURITY POLICY | Have a policy that includes information security for all personnel. |

> Read the PCI DSS - Data Security Standard document for more details. The document is available in the [document library of the PCI official site](https://www.pcisecuritystandards.org/document_library).

For each of the twelve PCI requirements, there are basically four different levels of compliance, typically based on the volume of card transactions your processes organization annually, and each level has a set of obligations.

* **Level 1:** (i) Organizations that process more than 6 million transactions per year for Visa or MasterCard, or more than 2.5 million for American Express; (ii) organizations in which there has been a data breach; (iii) organizations considered level 1 by any card association.
  * Annual Compliance Report (ROC) by a Qualified Security Assessor (QSA) or Internal Auditor.
  * Quarterly Network Scanning by Approved Vendor (ASV).
  * Compliance Certification (AOC).
  <br>
* **Level 2**: Organizations that process between 1 and 6 million transactions per year.
  * Corresponding annual PCI Self-Assessment Questionnaire (SAQ).
  * Quarterly Network Scanning by Approved Vendor (ASV).
  * Compliance Certification (AOC) for each of two corresponding SAQs.
  <br>
* **Level 3**: Organizations that process between 20,000 and 1 million online transactions per year and organizations that process less than 1 million transactions in total.
  * Corresponding annual PCI Self-Assessment Questionnaire (SAQ).
  * Quarterly Network Scanning by Approved Vendor (ASV).
  * Compliance Certification (AOC) for each of two corresponding SAQs.
  <br>
* **Level 4**: Organizations that process less than 20,000 online transactions per year and organizations that process up to 1 million total transactions per year. 
  * Corresponding annual PCI Self-Assessment Questionnaire (SAQ).
  * Quarterly Network Scanning by Approved Vendor (ASV).
  * Compliance Certification (AOC) for each of two corresponding SAQs.

> The [SAQ (Self-Assessment Questionnaire)](https://www.pcisecuritystandards.org/pci_security/completing_self_assessment) is a PCI self-assessment form that must be completed by those businesses or service providers that are not eligible to complete a Level 1 Compliance Report, and whose purpose is to validate regulatory compliance through a series of controls summarized in "yes" or "no" questions.

## Compliance

Mercado Pago is responsible for ensuring the cardholder data information once they enter its environment, so it is important that businesses and/or e-commerce platforms comply with the appropriate security controls to transmit them correctly. As a service provider, Mercado Pago can validate compliance by requesting evidence of the corresponding PCI documentation according to the product used.

Mercado Pago considerably simplifies the burden of compliance with this regulation for organizations that adopt Checkout Pro and Checkout API since they use fields that originate directly from our servers in a secure area for the entry of card data from the client. In this way, most of the PCI DSS requirements fall on Mercado Pago and it will considerably reduce its efforts in security controls.

To comply with PCI DSS, demonstrate your compliance, and in turn protect your customers' card details, it is important that you use this type of integrations to ensure that cardholder data does not reach your servers.

As we saw in the previous sections, for level 1, it is necessary to perform an audit with an external consultant. On the other hand, for levels 2 to 4, there are different types of SAQ depending on which payment integration method you use. We Recommend that you complete the corresponding SAQ according to the type of Checkout chosen due to the obligations imposed by the PCI regulations. 

Here we summarize what type of SAQ you must complete for each solution integration offered by Mercado Pago.

**Solution** | **SAQ**
------ | ------
Checkout Pro | A
Web Tokenize Checkout | A-EP
Checkout Transparente | A

> Remember that Mercado Pago may require this documentation due to its role as a PSP.

## Advantages of a SAQ-A

The Self-Assessment Questionnaire A (SAQ A) is applicable to the previously mentioned products, and it is important to understand that the greatest advantage of these integrations is that they almost entirely delegate the security controls to Mercado Pago, which is certified in PCI-DSS.

The document has only 22 security requirements that must be applied and audited annually, such as policies, access controls, network maintenance and secure applications, as well as restrictions on physical access to card data environments, if applicable.

Unlike other types of documents such as the Self-Assessment Questionnaire D(*) (applicable to our old integrations via API) or Self-Assessment Questionnaire A-EP(**), you will considerably reduce your workload in terms of controls of security and delegating responsibility to a certified third party.

> (*) The Self-Assessment Questionnaire D for Businesses consists of 250 security requirements that must be audited and met annually.
> <br>
> (**) The Self-Assessment Questionnaire A-EP is made up of 191 security requirements that must be audited and met annually.

In addition, it considerably reduces the risk of your integration, since the card data environment is located in a secure area hosted by Mercado Pago and you will not need to store any type of sensitive cardholder information.

It is important that you consider migrating to the new Checkout API solution with Secure Fields in case you are integrated via API in order to facilitate your PCI compliance, secure the payment channel, reducing the risk of any type of attack and damage to data of your clients and Mercado Pago.

> See the **SAQ Instructions and Guidelines document** [official PCI library](https://www.pcisecuritystandards.org/document_library) for details of the description of each SAQ.


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/security/owasp

# OWASP

At Mercado Pago, we protect the payments of our clients and users so that they are processed safely on all web and mobile platforms. To do this, we implement security controls that maintain the confidentiality, integrity, and availability of the information we process through integrations.
  
Open Web Application Security Project (OWASP) is an open community that provides tools and standards for developing and maintaining secure web applications. It seeks to promote application security research and development. 

OWASP Top 10 is a classification of the most common vulnerabilities in conjunction with their mitigation to protect applications from these types of attacks. We recommend that you visit the [official Owasp Top 10 site](https://owasp.org/www-project-top-ten/) for more information.

Due to the integration you are doing with Mercado Pago, to protect us against the most common vulnerabilities, we suggest you follow the guidelines on Input Validation and Server-Side Request Forgery Prevention. [See OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/index.html)for more information.

>NOTE
>
>Note
>
>It is important to follow good coding practices at all stages of the software's development life cycle to maintain security in all transactions. 

### Input validation

The [input validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html) guarantees that all data is syntactically and semantically correct before entering our system's workflow, allowing us to detect unauthorized inputs before they are processed by the application.

In this way, we prevent incorrect data from persisting in our databases and consequently causing a malfunction in our system. All data from unreliable sources should be subject to this validation. 

For its implementation, any programming technique that allows the efficient application of input-data correction is used, namely:

* Validators of data types available natively in web application frameworks.
* Validation against the JSON schema and XML schema for input in these formats.
* Data type conversion with strict exception handling.
* Minimum and maximum value range verification for numeric parameters and dates, minimum and maximum length verification for character strings.

It is critical to ensure that any input validation performed on the client-side also should be performed on the server-side since they could be bypassed on the client-side by an attacker. 

### Server-Side Request Forgery (SSRF)

[Server-Side Request Forgery](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) (SSRF) is an attack vector that abuses an application to interact with the internal and/or external network, or with our application machine itself. Depending on the functionality and requirements of the application, there are two use cases in which SSRF can occur:

1. **The application can send a request only to identified and trusted applications**

  This case occurs when an application needs to request another one, which is usually localized on another network, to perform a specific task. In this case, it is possible to use an app-allowed-list approach. We can protect ourselves through the Application and Network layers. 

  - **Application Layer**: Through input validation, we can apply the approach of the allowed-applications list. The format of the information expected from the user is already known. In this context, validations can also be added to ensure that the input string respects the expected format. 
  - **Network Layer:** the goal is to prevent arbitrary calls from applications. A firewall can be used to limit application access and, in turn, limit the impact of an application vulnerable to SSRF. 
  <br>

2. **The application can send requests to any external IP address or domain name**

This case occurs when a user can control a URL to an external resource, and the application requests this URL. When we say **external resource**, we mean any IP that does not belong to the internal network and must be reached through the Internet in a public way. 

In this case, it is not possible to use lists of allowed applications as they are initially unknown and change dynamically.


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/additional-content/security/owasp

# OWASP

At Mercado Pago, we protect the payments of our clients and users so that they are processed safely on all web and mobile platforms. To do this, we implement security controls that maintain the confidentiality, integrity, and availability of the information we process through integrations.
  
Open Web Application Security Project (OWASP) is an open community that provides tools and standards for developing and maintaining secure web applications. It seeks to promote application security research and development. 

OWASP Top 10 is a classification of the most common vulnerabilities in conjunction with their mitigation to protect applications from these types of attacks. We recommend that you visit the [official Owasp Top 10 site](https://owasp.org/www-project-top-ten/) for more information.

Due to the integration you are doing with Mercado Pago, to protect us against the most common vulnerabilities, we suggest you follow the guidelines on Input Validation and Server-Side Request Forgery Prevention. [See OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/index.html)for more information.

>NOTE
>
>Note
>
>It is important to follow good coding practices at all stages of the software's development life cycle to maintain security in all transactions. 

### Input validation

The [input validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html) guarantees that all data is syntactically and semantically correct before entering our system's workflow, allowing us to detect unauthorized inputs before they are processed by the application.

In this way, we prevent incorrect data from persisting in our databases and consequently causing a malfunction in our system. All data from unreliable sources should be subject to this validation. 

For its implementation, any programming technique that allows the efficient application of input-data correction is used, namely:

* Validators of data types available natively in web application frameworks.
* Validation against the JSON schema and XML schema for input in these formats.
* Data type conversion with strict exception handling.
* Minimum and maximum value range verification for numeric parameters and dates, minimum and maximum length verification for character strings.

It is critical to ensure that any input validation performed on the client-side also should be performed on the server-side since they could be bypassed on the client-side by an attacker. 

### Server-Side Request Forgery (SSRF)

[Server-Side Request Forgery](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) (SSRF) is an attack vector that abuses an application to interact with the internal and/or external network, or with our application machine itself. Depending on the functionality and requirements of the application, there are two use cases in which SSRF can occur:

1. **The application can send a request only to identified and trusted applications**

  This case occurs when an application needs to request another one, which is usually localized on another network, to perform a specific task. In this case, it is possible to use an app-allowed-list approach. We can protect ourselves through the Application and Network layers. 

  - **Application Layer**: Through input validation, we can apply the approach of the allowed-applications list. The format of the information expected from the user is already known. In this context, validations can also be added to ensure that the input string respects the expected format. 
  - **Network Layer:** the goal is to prevent arbitrary calls from applications. A firewall can be used to limit application access and, in turn, limit the impact of an application vulnerable to SSRF. 
  <br>

2. **The application can send requests to any external IP address or domain name**

This case occurs when a user can control a URL to an external resource, and the application requests this URL. When we say **external resource**, we mean any IP that does not belong to the internal network and must be reached through the Internet in a public way. 

In this case, it is not possible to use lists of allowed applications as they are initially unknown and change dynamically.


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/security/landing-hub

# Security

At Mercado Pago, we have implemented a series of security measures designed to protect customer and user payments, ensure confidentiality and integrity in all processes, and provide greater security in the integrations that our payment solutions offer.

Next, we present the protocols used by Mercado Pago.

## OAuth

OAuth (Open Authorization) is an authorization protocol that allows applications to gain limited access to user accounts on an HTTP service, such as social networks, without the user having to share their credentials. Instead, OAuth defines a method for users to grant third-party applications access to their data without needing to reveal their login information.

For more information, access the [documentation](/developers/en/docs/security/oauth).

## OWASP

OWASP (Open Web Application Security Project) is an open and secure community that provides tools and standards for the development and maintenance of web applications. It aims to promote the research and development of security in applications. Through its initiatives, OWASP contributes to raising the security standard in the software industry and creating a safer online community.

For more information, access the [documentation](/developers/es/docs/security/owasp).

## PCI DSS

PCI DSS (Payment Card Industry Data Security Standard) is an international security standard that all entities storing, processing, or transmitting card data must comply with. It is one of the most demanding security standards in the payment industry, which Mercado Pago adheres to, allowing it to operate with credit and debit cards.

For more information, access the [documentation](/developers/en/docs/security/pci).


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/additional-content/security/pci

# PCI DSS

At Mercado Pago we ensure the Confidentiality, Availability and Integrity of all our processes following the best market practices so that you can use all our products safely. 

In addition, for Mercado Pago to be able to operate with credit and debit cards, we must comply with one of the most demanding security standards in the payment industry: Payment Card Industry Data Security Standard.

## Definition and context
If you have ever stored, processed or transmitted card data in your company, you have probably heard of PCI. From Mercado Pago we want to help you and simplify the task of understanding these regulations and the different associated responsibilities.

As a Service Provider, we must meet regulatory and security responsibilities towards card brands and acquirers, but even so, security throughout the payment process is the obligation of both parties. Merchants and / or e-commerce platforms that are integrated with payment processors such as Mercado Pago must meet minimum security requirements to mitigate risks of fraud and information leakage, securing user data.

PCI DSS (Payment Card Industry Data Security Standard) is an international security standard that must be met by all entities that store, process or transmit card data.

PCI regulations establish a basic level of protection for cardholders (cardholders) and help reduce fraud and data breaches within the entire payments ecosystem. 

Compliance with PCI regulations involves 3 important aspects:

- Securely transmit the information corresponding to cardholder data.
- Store data according to the best security practices in the industry, under 12 regulatory requirements that are included in the PCI Standard.
- Annual validation of compliance with the security controls and evaluation forms proposed by the PCI Council. 

We recommend that you visit the [official PCI site](https://www.pcisecuritystandards.org/) for more information. Here is a summary of the objectives of PCI security controls.

**Objective** | **Requirement**
------------- | ---------------
CREATE AND MAINTAIN SECURE SYSTEMS AND NETWORK | Install and maintain a firewall configured to protect cardholder data. Do not use vendor-supplied defaults for system passwords and other security parameters.|
PROTECT THE DATA OF THE CARD HOLDERS | Protect the stored cardholder data. Encrypt the transmission of cardholder data on open or public networks.
MAINTAIN A VULNERABILITY MANAGEMENT PROGRAM | Protect all systems against malicious software and regularly update antivirus software. Develop and maintain secure systems and applications.
SOLID CONTROL MEASURES APPLYING ACCESS | Restrict access to data accordance with the need to know who has the organization. Identify and authenticate access to system components. Restrict physical access to cardholder data.
MONITOR AND PERIODICALLY VERIFY NETWORKS | Track and monitor all access to network resources and cardholder data. Periodically verify security systems and processes.
HAVE AN INFORMATION SECURITY POLICY | Have a policy that includes information security for all personnel. |

> Read the PCI DSS - Data Security Standard document for more details. The document is available in the [document library of the PCI official site](https://www.pcisecuritystandards.org/document_library).

For each of the twelve PCI requirements, there are basically four different levels of compliance, typically based on the volume of card transactions your processes organization annually, and each level has a set of obligations.

* **Level 1:** (i) Organizations that process more than 6 million transactions per year for Visa or MasterCard, or more than 2.5 million for American Express; (ii) organizations in which there has been a data breach; (iii) organizations considered level 1 by any card association.
  * Annual Compliance Report (ROC) by a Qualified Security Assessor (QSA) or Internal Auditor.
  * Quarterly Network Scanning by Approved Vendor (ASV).
  * Compliance Certification (AOC).
  <br>
* **Level 2**: Organizations that process between 1 and 6 million transactions per year.
  * Corresponding annual PCI Self-Assessment Questionnaire (SAQ).
  * Quarterly Network Scanning by Approved Vendor (ASV).
  * Compliance Certification (AOC) for each of two corresponding SAQs.
  <br>
* **Level 3**: Organizations that process between 20,000 and 1 million online transactions per year and organizations that process less than 1 million transactions in total.
  * Corresponding annual PCI Self-Assessment Questionnaire (SAQ).
  * Quarterly Network Scanning by Approved Vendor (ASV).
  * Compliance Certification (AOC) for each of two corresponding SAQs.
  <br>
* **Level 4**: Organizations that process less than 20,000 online transactions per year and organizations that process up to 1 million total transactions per year. 
  * Corresponding annual PCI Self-Assessment Questionnaire (SAQ).
  * Quarterly Network Scanning by Approved Vendor (ASV).
  * Compliance Certification (AOC) for each of two corresponding SAQs.

> The [SAQ (Self-Assessment Questionnaire)](https://www.pcisecuritystandards.org/pci_security/completing_self_assessment) is a PCI self-assessment form that must be completed by those businesses or service providers that are not eligible to complete a Level 1 Compliance Report, and whose purpose is to validate regulatory compliance through a series of controls summarized in "yes" or "no" questions.

## Compliance

Mercado Pago is responsible for ensuring the cardholder data information once they enter its environment, so it is important that businesses and/or e-commerce platforms comply with the appropriate security controls to transmit them correctly. As a service provider, Mercado Pago can validate compliance by requesting evidence of the corresponding PCI documentation according to the product used.

Mercado Pago considerably simplifies the burden of compliance with this regulation for organizations that adopt Checkout Pro and Checkout API since they use fields that originate directly from our servers in a secure area for the entry of card data from the client. In this way, most of the PCI DSS requirements fall on Mercado Pago and it will considerably reduce its efforts in security controls.

To comply with PCI DSS, demonstrate your compliance, and in turn protect your customers' card details, it is important that you use this type of integrations to ensure that cardholder data does not reach your servers.

As we saw in the previous sections, for level 1, it is necessary to perform an audit with an external consultant. On the other hand, for levels 2 to 4, there are different types of SAQ depending on which payment integration method you use. We Recommend that you complete the corresponding SAQ according to the type of Checkout chosen due to the obligations imposed by the PCI regulations. 

Here we summarize what type of SAQ you must complete for each solution integration offered by Mercado Pago.

**Solution** | **SAQ**
------ | ------
Checkout Pro | A
Web Tokenize Checkout | A-EP
Checkout Transparente | A

> Remember that Mercado Pago may require this documentation due to its role as a PSP.

## Advantages of a SAQ-A

The Self-Assessment Questionnaire A (SAQ A) is applicable to the previously mentioned products, and it is important to understand that the greatest advantage of these integrations is that they almost entirely delegate the security controls to Mercado Pago, which is certified in PCI-DSS.

The document has only 22 security requirements that must be applied and audited annually, such as policies, access controls, network maintenance and secure applications, as well as restrictions on physical access to card data environments, if applicable.

Unlike other types of documents such as the Self-Assessment Questionnaire D(*) (applicable to our old integrations via API) or Self-Assessment Questionnaire A-EP(**), you will considerably reduce your workload in terms of controls of security and delegating responsibility to a certified third party.

> (*) The Self-Assessment Questionnaire D for Businesses consists of 250 security requirements that must be audited and met annually.
> <br>
> (**) The Self-Assessment Questionnaire A-EP is made up of 191 security requirements that must be audited and met annually.

In addition, it considerably reduces the risk of your integration, since the card data environment is located in a secure area hosted by Mercado Pago and you will not need to store any type of sensitive cardholder information.

It is important that you consider migrating to the new Checkout API solution with Secure Fields in case you are integrated via API in order to facilitate your PCI compliance, secure the payment channel, reducing the risk of any type of attack and damage to data of your clients and Mercado Pago.

> See the **SAQ Instructions and Guidelines document** [official PCI library](https://www.pcisecuritystandards.org/document_library) for details of the description of each SAQ.


---



---

**URL:** https://www.mercadopago.com.ar/developers/es/docs/additional-content/security/pci

[![Mercado Pago](https://http2.mlstatic.com/frontend-assets/dx-template-lib/assets/logo-mercadopago.svg)

DEVELOPERS](https://www.mercadopago.com.ar/developers/es)

[Ingresar](https://www.mercadolibre.com/jms/mla/lgz/login?platform_id=mp&go=)

Primeros pasos

Pagos online

Pagos presenciales

Apps para plataformas

Herramientas

APIs

SDKs

# 404


---

# Documentação - Mercado Pago Developers


---

**URL:** https://www.mercadopago.com.ar/developers/es/docs/additional-content/security/owasp

[![Mercado Pago](https://http2.mlstatic.com/frontend-assets/dx-template-lib/assets/logo-mercadopago.svg)

DEVELOPERS](https://www.mercadopago.com.ar/developers/es)

[Ingresar](https://www.mercadolibre.com/jms/mla/lgz/login?platform_id=mp&go=)

Primeros pasos

Pagos online

Pagos presenciales

Apps para plataformas

Herramientas

APIs

SDKs

# 404


---



---



# ==================== OTROS ====================

# Origen: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/introduction

# Your integrations

Your Integrations is your integration management environment automatically created with a user ID (the Mercado Pago ID) when you open an account on Mercado Pago. In it, you can create a new application in the [Developer Dashboard](/developers/panel/app) or access the [Application details](/developers/en/guides/additional-content/your-integrations/application-details) page for each listed application, as well as request access to credentials for an application you don't manage.

> WARNING
> 
> Important
>
> For security reasons related to Mercado Pago, the environment **"Your integrations" is not available for users under the age of majority**.

## Application details

The [Application details](/developers/en/guides/additional-content/your-integrations/application-details) page consists of different sections, each with a different purpose.
* **General Information**: displays general information about the application.
* **Testing**: test the integration's functionality, perform tests, and simulate different transactions with [Credentials](/developers/en/guides/additional-content/your-integrations/credentials), [Test accounts](/developers/en/guides/additional-content/your-integrations/test-accounts), and [Test cards](/developers/en/guides/additional-content/your-integrations/test-cards).
* **Notifications**: configure the application to receive notifications for transaction-related events, such as payment alerts, fraud notifications, disputes, etc. There are two types of notifications available for configuration:
  1. [Webhooks](/developers/en/guides/additional-content/your-integrations/webhooks)
  2. [IPN](/developers/en/guides/additional-content/your-integrations/ipn)
* **Production**: activate **Production Credentials** to start receiving payments in your online store and other applications.
* **Evaluation**: validate the [quality of your integration](/developers/en/guides/additional-content/homologator/homologator) to ensure that your development meets the necessary quality and security requirements to provide both the seller and the buyer with the best experience with Mercado Pago.


---



---

# Origen: https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/additional-content/your-integrations/introduction

# Your integrations

Your Integrations is your integration management environment automatically created with a user ID (the Mercado Pago ID) when you open an account on Mercado Pago. In it, you can create a new application in the [Developer Dashboard](/developers/panel/app) or access the [Application details](/developers/en/guides/additional-content/your-integrations/application-details) page for each listed application, as well as request access to credentials for an application you don't manage.

> WARNING
> 
> Important
>
> For security reasons related to Mercado Pago, the environment **"Your integrations" is not available for users under the age of majority**.

## Application details

The [Application details](/developers/en/guides/additional-content/your-integrations/application-details) page consists of different sections, each with a different purpose.
* **General Information**: displays general information about the application.
* **Testing**: test the integration's functionality, perform tests, and simulate different transactions with [Credentials](/developers/en/guides/additional-content/your-integrations/credentials), [Test accounts](/developers/en/guides/additional-content/your-integrations/test-accounts), and [Test cards](/developers/en/guides/additional-content/your-integrations/test-cards).
* **Notifications**: configure the application to receive notifications for transaction-related events, such as payment alerts, fraud notifications, disputes, etc. There are two types of notifications available for configuration:
  1. [Webhooks](/developers/en/guides/additional-content/your-integrations/webhooks)
  2. [IPN](/developers/en/guides/additional-content/your-integrations/ipn)
* **Production**: activate **Production Credentials** to start receiving payments in your online store and other applications.
* **Evaluation**: validate the [quality of your integration](/developers/en/guides/additional-content/homologator/homologator) to ensure that your development meets the necessary quality and security requirements to provide both the seller and the buyer with the best experience with Mercado Pago.


---



---

**URL:** https://www.mercadopago.com.ar/developers/es/docs/additional-content/your-integrations/introduction

[![Mercado Pago](https://http2.mlstatic.com/frontend-assets/dx-template-lib/assets/logo-mercadopago.svg)

DEVELOPERS](https://www.mercadopago.com.ar/developers/es)

[Ingresar](https://www.mercadolibre.com/jms/mla/lgz/login?platform_id=mp&go=)

Primeros pasos

Pagos online

Pagos presenciales

Apps para plataformas

Herramientas

APIs

SDKs

# 404


---



---

