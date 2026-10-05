# Mapeo de archivos — MercadoPago, tramo 2: vinculación OAuth (authorization_code + PKCE) + estado `APTO_VENTA` (2026-09-17)

Segundo tramo de MercadoPago, sobre la base del tramo 1 (`docs/MAPEO-ARCHIVOS-TRAMO-MERCADOPAGO-01.md`: Entity/Repository/Service de `CuentaMercadoPago`/`Pago`/`NotaCredito` + cifrado AES-256-GCM de los tokens). Detalle completo de decisiones y evidencia en `docs/DECISIONES.md`, entrada "2026-09-17 — MercadoPago, tramo 2: vinculación OAuth + estado `APTO_VENTA`". Este archivo solo lista qué se tocó y por qué.

Alcance: vinculación/desvinculación OAuth completa (inicio, callback, intercambio real `authorization_code`→token contra la API de MercadoPago) + el estado nuevo `APTO_VENTA` de `EstadoComercio` con sus transiciones automáticas. **No** toca creación de preferencia de pago, webhook de confirmación, ni `PedidoService`/`PagoService` — eso queda para el próximo tramo.

## Backend — nuevo

| Archivo | Motivo |
|---|---|
| `backend/src/main/resources/db/migration/V12__agregar_apto_venta_a_estado_comercio.sql` | Agrega `APTO_VENTA` al ENUM de `comercio.estado` y de `historial_estado_comercio.estado_origen`/`estado_destino` — mismo patrón que `V6` (se repite la lista completa de valores, MySQL no tiene `ALTER TYPE` incremental). |
| `backend/src/main/resources/db/migration/V13__crear_codigo_vinculacion_mp.sql` | Tabla nueva `codigo_vinculacion_mp` (`dueno_id`, `identificador_intento` único, `codigo_verificacion`, `fecha_creacion`, `usado`) — guarda el `state`/`code_verifier` de PKCE entre el inicio de la vinculación y la vuelta del callback de MercadoPago. Sin equivalente en `docs/diccionario-de-datos.md`. |
| `backend/src/main/java/com/bajonea/backend/entities/CodigoVinculacionMP.java` | Entity de la tabla de arriba. Deliberadamente separada de `Token` (decisión de Diego, ver `docs/DECISIONES.md`): `Token` está pensada para códigos de 6 dígitos que un humano tipea a mano, esto es un string opaco que viaja automáticamente entre el backend y MP. |
| `backend/src/main/java/com/bajonea/backend/repositories/CodigoVinculacionMPRepository.java` | `findByIdentificadorIntentoAndUsadoFalse`, `eliminarIntentosPendientesDelDueno` (limpia intentos previos no usados del mismo Dueño antes de generar uno nuevo, mismo criterio que `AuthService.generarToken` con `Token`). |
| `backend/src/main/java/com/bajonea/backend/config/MercadoPagoConfig.java` | `client-id`/`client-secret`/`redirect-uri` de la aplicación "Bajonea" en MercadoPago, vía `@Value` sobre variables de entorno — nunca hardcodeadas. |
| `backend/src/main/java/com/bajonea/backend/services/MercadoPagoOAuthService.java` | Orquesta el flujo completo: `iniciarVinculacion` (genera PKCE, arma la URL de `https://auth.mercadopago.com.ar/authorization`, persiste el intento), `procesarCallback` (valida el `state`, marca el intento usado, intercambia el `code` por tokens contra `POST https://api.mercadopago.com/oauth/token`, llama a `CuentaMercadoPagoService.vincular` + `ComercioService.activarAptoVenta`), `desvincular` (llama a `CuentaMercadoPagoService.desvincular` + `ComercioService.desactivarAptoVenta`), `consultarEstado`. Sin dependencia nueva — usa `RestClient` de Spring (ya en el classpath vía `spring-boot-starter-web`). |
| `backend/src/main/java/com/bajonea/backend/controllers/MercadoPagoOAuthController.java` | `GET /api/v1/oauth/mercadopago/iniciar` (DUENO), `GET /api/v1/oauth/mercadopago/callback` (público, lo invoca el navegador por redirect de MP — nunca un fetch del frontend, siempre responde con un `302` de vuelta a `comercio-perfil.html?vinculacionMp=exito\|error`), `DELETE /api/v1/oauth/mercadopago/desvincular` (DUENO), `GET /api/v1/oauth/mercadopago/cuenta` (DUENO, estado de vinculación para pintar la pantalla). |
| `backend/src/main/java/com/bajonea/backend/dto/response/IniciarVinculacionMercadoPagoResponseDTO.java` | `{ url }` — la URL de autorización de MP a la que el frontend redirige al Dueño. |
| `backend/src/main/java/com/bajonea/backend/dto/response/CuentaMercadoPagoResponseDTO.java` | `{ vinculada, mpUserId, fechaVinculacion }` — nunca expone `accessToken`/`refreshToken`. |

## Backend — modificado

| Archivo | Motivo |
|---|---|
| `backend/src/main/java/com/bajonea/backend/enums/EstadoComercio.java` | Agrega el 7mo valor `APTO_VENTA` (comercio `APROBADO` + `CuentaMercadoPago` activa). |
| `backend/src/main/java/com/bajonea/backend/services/CuentaMercadoPagoService.java` | Agrega `buscarActivaPorDueno` (versión `Optional`, no lanza, para poder armar `CuentaMercadoPagoResponseDTO` sin excepción cuando no hay cuenta vinculada). Sin cambios en la lógica ya existente del tramo 1. |
| `backend/src/main/java/com/bajonea/backend/services/ComercioService.java` | `listarAprobados()`, `buscarAprobadoPorId()` y `validarAceptaPedidos()` pasan de filtrar por `EstadoComercio.APROBADO` a `EstadoComercio.APTO_VENTA` (decisión de Diego, ver `docs/DECISIONES.md` — ningún Cliente puede ver ni pedirle a un comercio no-`APTO_VENTA` por ningún camino). Agrega `activarAptoVenta(duenoId)`/`desactivarAptoVenta(duenoId)` (transición automática, no-operación si el comercio no está en el estado de origen esperado) + `registrarTransicionAutomatica` privado (mismo patrón `HistorialEstadoComercio.builder()...save()` que ya usaba `AdministradorService`, con `administrador=null`). |
| `backend/src/main/java/com/bajonea/backend/services/ProductoService.java` | `listarCatalogoGlobal()` y `listarFiltrosDisponibles()` — mismo cambio `APROBADO`→`APTO_VENTA` en el filtro `findByComercio_EstadoAndEstadoNot`, por la misma regla de negocio (decisión de Diego, punto 3 de las 4 preguntas de este tramo). |
| `backend/src/main/java/com/bajonea/backend/config/security/SecurityConfig.java` | `/api/v1/oauth/mercadopago/callback` agregado a `RUTAS_PUBLICAS` (lo invoca el navegador por redirect de MP, sin JWT de Bajoneá en ese momento). `/api/v1/oauth/mercadopago/**` agregado como `hasRole("DUENO")` (cubre `/iniciar`, `/desvincular`, `/cuenta` — el matcher público específico de `/callback` tiene precedencia por ir primero en la cadena). |
| `backend/src/main/resources/application.properties` | `mercadopago.client-id`/`client-secret`/`redirect-uri` (default vacío, mismo criterio que `CLOUDINARY_*`/`RESEND_API_KEY`/`MERCADOPAGO_TOKEN_ENCRYPTION_KEY`) + `app.frontend-base-url` (default `http://localhost:5501`, primera vez que el backend necesita conocer la URL del frontend — hasta ahora ningún flujo del proyecto redirigía el navegador de vuelta al frontend desde el backend). |
| `backend/src/main/resources/application-production.properties` | Mismas 3 propiedades de MercadoPago + `app.frontend-base-url` con default `https://bajonea.ar` — **asunción sin confirmar por Diego**, ver "Pendiente" abajo. |

## Frontend — modificado

| Archivo | Motivo |
|---|---|
| `frontend/comercio-perfil.html` | Nueva entrada `profile-link` "Cobros con Mercado Pago" en `view-principal` + nueva sección `view-mercadopago` con las 2 tarjetas de estado (pendiente de vincular / vinculada), siguiendo el mismo sistema de diseño ya usado en el resto del archivo (`.form-section`, `.section-heading`, `.section-note`, `.info-box`, mismo patrón de navegación por sub-vista + botón volver que ya usan "Editar datos del comercio"/"Ver datos legales"/"Cambiar contraseña"). Sin mockup adjunto real en el prompt de este tramo — diseñado replicando el sistema existente, no un mockup específico ya aprobado. |
| `frontend/js/comercio.js` | `cargarEstadoMercadoPago()` (fetch a `/oauth/mercadopago/cuenta`, alterna las 2 tarjetas), `mostrarModalConfirmarDesvincularMp()` (mismo patrón `modal-backdrop`/`.modal-sheet` que `mostrarModalConfirmarLogout`, confirmar en rojo como `mostrarModalAnularPedido`), wiring de los botones "Vincular"/"Desvincular" y lectura del query param `vinculacionMp` (`exito`/`error`) que deja el redirect del backend, con `showToast` — mismo patrón ya usado en `admin.js` para `comercioResuelto`. |

## No tocado (a propósito)

- `PedidoService.java`, `CarritoService.java` — siguen llamando a `comercioService.validarAceptaPedidos(...)` sin cambios en el call site; la condición cambió adentro del método ya existente, no la firma ni quién lo llama.
- Creación de preferencia de pago (`POST /checkout/preferences`), webhook de confirmación, `PagoService` — próximo tramo, tal como pidió el prompt explícitamente.
- `postman/Bajonea-MVP.postman_collection.json` — no ampliada con los endpoints nuevos en este tramo (deuda ya reconocida desde el tramo 1 de la portabilidad a `bajonea_final`, ver `CLAUDE.md` §1bis).
- `git commit` — lo hace Diego.
- La columna `comercio.mp_vinculado` (booleana, ya existe físicamente en `bajonea_final` desde el diccionario v1.5) — **hallazgo real, no tocado**: nunca estuvo mapeada en la Entity `Comercio` (confirmado antes de empezar este tramo), y este tramo modela "¿tiene MP vinculado?" enteramente vía `EstadoComercio.APTO_VENTA` + `CuentaMercadoPago.activa`, no vía esa columna. Queda como columna física sin uso — señalado para que Diego decida si se elimina en una migración futura o se ignora.
- La parte de la regla de visibilidad documentada en `CLAUDE.md` §16 sobre `Dueno.usuario.estado == ACTIVO` — confirmado que **nunca estuvo implementada en código** (ni antes de este tramo ni ahora); `listarAprobados()` solo filtra por `EstadoComercio`. Gap preexistente, no introducido por este tramo, fuera del alcance que pidió el prompt — señalado, no corregido.

## Pendiente

- **Confirmar `app.frontend-base-url` de producción.** Se asumió `https://bajonea.ar` en `application-production.properties` porque es el dominio que ya figura como `redirect_uri` configurada en el panel de MP para el callback del backend — pero no hay ninguna confirmación explícita de Diego de que el frontend en producción se sirva exactamente desde ese origen (sin subpath, sin subdominio distinto). Si no es así, hay que corregir esta propiedad antes de un deploy real.
- **Variables de entorno sin configurar todavía en ningún entorno real** (local de Diego, Railway): `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`, `MERCADOPAGO_REDIRECT_URI` (con el valor de ngrok mientras se prueba en local, y el de `https://bajonea.ar/api/v1/oauth/mercadopago/callback` en producción), más `MERCADOPAGO_TOKEN_ENCRYPTION_KEY` (ya señalada como pendiente desde el tramo 1). Sin esto, `iniciar`/`callback` arman URLs con `client_id` vacío y el intercambio de token siempre va a fallar con `invalid_client`.
- **Probar el flujo real contra MP con una cuenta de prueba real** — este tramo verificó la máquina de estados, la persistencia y el manejo de errores de red contra la API real de MP (ver "Verificación real" en `docs/DECISIONES.md`), pero no completó un intercambio `authorization_code` exitoso de punta a punta porque eso requiere: (a) las variables de entorno de arriba configuradas, (b) un túnel ngrok corriendo y agregado como Redirect URL adicional en el panel de MP, y (c) que Diego inicie sesión con una cuenta de prueba de Vendedor real en el navegador — ninguno de los tres es algo que este tramo pueda hacer de forma autónoma. Instrucciones concretas para que Diego lo pruebe, abajo.
- Próximo tramo: creación real de la preferencia de pago (`marketplace_fee`), webhook de confirmación, y la lógica de reembolsos de `PedidoService` que sigue con los `TODO` de `NotaCredito` sin resolver desde el tramo 1.

## Cómo probar el flujo real en local (ngrok, decisión de Diego)

1. Instalar/levantar `ngrok` apuntando al backend local: `ngrok http 8080`.
2. Copiar la URL HTTPS que da ngrok (ej. `https://algo-random.ngrok-free.app`).
3. En el panel de MP (aplicación "Bajonea"), agregar `https://algo-random.ngrok-free.app/api/v1/oauth/mercadopago/callback` como Redirect URL **adicional** (no reemplazar la de `bajonea.ar`).
4. Setear `MERCADOPAGO_REDIRECT_URI=https://algo-random.ngrok-free.app/api/v1/oauth/mercadopago/callback` en el entorno local antes de levantar el backend (además de `MERCADOPAGO_CLIENT_ID`/`MERCADOPAGO_CLIENT_SECRET`/`MERCADOPAGO_TOKEN_ENCRYPTION_KEY`).
5. Levantar el backend, loguearse en el frontend (`localhost:5501`) como un Dueño de comercio `APROBADO`, ir a "Mi comercio" → "Cobros con Mercado Pago" → "Vincular Mercado Pago".
6. El navegador va a MP, loguearse ahí con una cuenta de prueba de Vendedor (no la cuenta de Bajoneá) y autorizar.
7. MP redirige al túnel de ngrok → el backend procesa el callback → redirige de vuelta a `http://localhost:5501/comercio-perfil.html?vinculacionMp=exito` (o `error`).
8. Confirmar en la base: `SELECT estado FROM comercio WHERE id=...` debería ser `APTO_VENTA`, y `SELECT * FROM cuenta_mercado_pago WHERE dueno_id=...` debería tener una fila con `activa=1` y los tokens cifrados (no en texto plano — confirmable comparando contra lo que devolvió la consola de red del navegador en el paso 6, que nunca debería coincidir byte a byte con lo guardado en la columna).
