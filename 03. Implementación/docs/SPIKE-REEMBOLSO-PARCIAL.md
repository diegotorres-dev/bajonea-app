# Spike: reembolso parcial de un pago con `marketplace_fee` (Mercado Pago)

**Fecha:** 2026-11-04. Paso 0 de S5. **Estado: la prueba real en el sandbox NO se pudo hacer todavía** (falta una acción manual de Diego, ver la sección 3). Lo que sigue separa lo que dice la documentación de lo que se verificó realmente (nada contra Mercado Pago, por lo que se explica abajo).

## 1. Qué dice la documentación

Fuentes leídas el 2026-11-04: la página de reembolsos y cancelaciones de Checkout Pro (`mercadopago.com.ar/developers/en/docs/checkout-pro-preferences/additional-settings/refunds-and-cancellations`), la guía de Split Payments / Marketplace y la copia local de la documentación (`docs/mercadopago_documentacion_completa.md`, 10 MB).

| Tema | Lo que dice |
|---|---|
| Parcial vs. total | Se pide con `POST /v1/payments/{id}/refunds`. En un reembolso **total el cuerpo va vacío**; en uno **parcial el monto se indica en el cuerpo** (`{"amount": N}`). |
| Varios parciales | Para órdenes de Point/Orders se dice que se pueden emitir varios parciales mientras la suma no supere lo pagado. Para Checkout Pro, la página de reembolsos **no cubre** varios parciales ni el tope. |
| Plazo | Hasta 180 días después de la aprobación del pago. |
| Saldo | La cuenta que reembolsa debe tener saldo disponible suficiente; si no, la transacción se rechaza. |
| Destino | Tarjeta de crédito: al resumen; otros medios: a la cuenta del pagador. |
| Marketplace | En el modelo de split el reembolso "se divide y se resta de la cuenta del vendedor y de la del marketplace **en forma proporcional** a las partes". Si el vendedor no tiene fondos, el marketplace debe reembolsar el equivalente a su parte y resolver el resto por otro medio. La comisión de Mercado Pago se descuenta primero del vendedor y la del marketplace del resto. Los parámetros: `marketplace_fee` en `/checkout/preferences` (Checkout Pro) y `application_fee` en `/v1/payments` (Checkout API); el proyecto usa el primero. |
| Estados después del reembolso, códigos de error, estado del pago luego de un parcial | **No aparecen en lo leído.** Para órdenes de Point se documenta `processed`/`partially_refunded` y `refunded`; para pagos de Checkout Pro hay que probar qué devuelve `GET /v1/payments/{id}` (`status`, `status_detail`, `transaction_amount_refunded`). |

## 2. Lo que sigue sin respuesta (y por qué importa)

1. **Cómo se reparte un parcial entre el Dueño y la plataforma:** la documentación dice "proporcional", sin fórmula. De eso depende cuánto se le descuenta al Dueño y el texto del aviso `RECLAMO_REEMBOLSO_DUENO`.
2. **Si la comisión de la plataforma (`marketplace_fee`) se devuelve en un parcial** y en qué parte, y qué pasa con el saldo reembolsable al sumar parciales.
3. **Si Mercado Pago acepta varios parciales sobre un pago de Checkout Pro** y qué devuelve al superar el saldo (código y mensaje de error).
4. **Estado del pago y de `GET /v1/payments/{id}/refunds` entre un parcial y otro,** y si la repetición con la misma `X-Idempotency-Key` devuelve el mismo reembolso.
5. **Si el reembolso lo puede pedir la cuenta del Dueño con su token OAuth** como hoy (reembolso total), o si un parcial exige otra cosa.

## 3. Qué se intentó y por qué no se completó

- Ya existía `testing/mp-spike/spike.mjs` (septiembre de 2026), que crea pagos de prueba con un vendedor de prueba, la tarjeta de prueba y un comprador de prueba; **no usa comisión**, así que no sirve para este caso. Se escribió `testing/mp-spike/reembolso-parcial.mjs` (fuera de `src/`, no forma parte de la aplicación): crea un pago de $1000 con `application_fee` de $200 (el equivalente por API directa del `marketplace_fee` de la preferencia), muestra su estado, pide un parcial de $300, repite la misma clave de idempotencia, pide un segundo parcial de $200, intenta superar el saldo (600 sobre 500), un monto cero, el saldo exacto y un reembolso sobre un pago ya reembolsado, y guarda todo en `resultado-reembolso-parcial.json` sin credenciales. La sintaxis y la falta de configuración se verificaron; **no se ejecutó contra Mercado Pago**.
- **Por qué no se ejecutó:** el pago con comisión exige el access_token de un vendedor de prueba **obtenido por OAuth para la aplicación Bajoneá** (un token común del vendedor no puede cobrar comisión del marketplace). Ese token se obtiene autorizando la aplicación desde el navegador con la cuenta de prueba, una acción que no puedo hacer: en el entorno hay credenciales de la aplicación (`MERCADOPAGO_CLIENT_ID`/`SECRET`), pero obtener un token con ellas sin pasar por la autorización devolvería el de la cuenta dueña de la aplicación, que es una cuenta real, y el encargo prohíbe usar cuentas reales. Tampoco se tocó la cuenta de Mercado Pago real que está vinculada en `bajonea_practicas3`.

## 4. Pasos exactos para Diego (una sola vez)

1. En el panel de Mercado Pago Developers, con la aplicación Bajoneá, crear (o reutilizar) dos **usuarios de prueba**: un **vendedor** y un **comprador** (Argentina).
2. Autorizar la aplicación con el usuario de prueba **vendedor** (el mismo flujo OAuth de "Vincular Mercado Pago", pero con el usuario de prueba) y copiar el `access_token` y la `public_key` que resultan. Alternativa sin pasar por el sitio: abrir la URL de autorización de la aplicación en un navegador con el vendedor de prueba logueado y cambiar el `code` por tokens con `POST https://api.mercadopago.com/oauth/token` (`grant_type=authorization_code`, `test_token=true`).
3. Copiar `testing/mp-spike/.env.example` a `testing/mp-spike/.env` (ignorado por git) y completar `MP_SELLER_OAUTH_TOKEN`, `MP_SELLER_PUBLIC_KEY` y `MP_BUYER_EMAIL` (el email del comprador de prueba). Ninguno de estos valores se pega en un chat ni se commitea.
4. Ejecutar:

```bash
node testing/mp-spike/reembolso-parcial.mjs
```

5. Devolver el archivo `testing/mp-spike/resultado-reembolso-parcial.json` (no lleva credenciales) y yo completo este documento: cómo quedó el pago después de cada reembolso, qué dijo Mercado Pago al superar el saldo y cómo se repartió el parcial entre el vendedor y el marketplace (para eso, en la cuenta del vendedor y en la del marketplace de prueba, anotar el saldo antes y después; si no se puede ver, queda sin verificar).

## 5. Recomendación técnica para S5 (sujeta a lo que muestre la prueba)

1. **Pedir el parcial con el cuerpo `{"amount": monto}`** y el token del Dueño, igual que el total, con `X-Idempotency-Key = nc-{notaId}-{intento}` (ya existe). Agregar el monto al cliente HTTP y al registro `IntentoReembolso`; el reintento del Administrador debe mandar el monto de la nota, no el del pago.
2. **Guardar una nota de crédito por reembolso** (ya es posible: 1 pago : N notas), con el motivo `RECLAMO` y una columna que la ligue al reclamo. El saldo reembolsable es `pago.monto − suma de notas vivas` (`PENDIENTE`, `PROCESADO`, `PENDIENTE_REINTENTO`, `PENDIENTE_REVISION_MANUAL`); el servidor no deja crear un parcial que lo supere, y la nota se crea dentro de la transacción de la resolución, con el pedido y el pago bloqueados.
3. **Falla del reembolso:** el reclamo queda "aprobado, reembolso en proceso" y la nota sigue en `FALLIDO` o `PENDIENTE_REVISION_MANUAL`, que ya se ve y se reintenta en `admin-reembolsos.html`. Una falla por saldo insuficiente del Dueño es el caso más probable en un reclamo (días después de la venta) y debe tener un mensaje propio en el aviso al Administrador.
4. **Mientras no esté verificado el reparto, el aviso `RECLAMO_REEMBOLSO_DUENO` no debe afirmar cuánto se le descuenta al Dueño:** debe decir el monto reembolsado al Cliente y que "se descuenta de tu cuenta de Mercado Pago en la parte que te corresponde".
5. **Plazo:** 180 días de Mercado Pago contra 7 de reclamo más el tiempo de resolución: no es un límite real.
