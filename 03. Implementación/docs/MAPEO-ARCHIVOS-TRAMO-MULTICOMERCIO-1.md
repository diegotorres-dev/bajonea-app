# Mapeo de archivos — Multi-comercio, tramo 1 (base)

Fecha: 2026-09-29. Objetivo: que el backend soporte N comercios por Dueño resolviendo el comercio activo en un único punto, sin cambios visibles con un solo comercio. Sin cambios en `frontend/`. Sin tablas ni columnas nuevas.

## Backend — resolución del comercio activo (archivos nuevos)

| Archivo | Por qué |
|---|---|
| `backend/.../config/security/ComercioActivo.java` | Record `(comercioId, duenoId)` que reciben los controllers de operaciones del Comercio. `duenoId` queda disponible donde el actor se registra (historial de pedido). |
| `backend/.../config/security/ComercioActivoArgumentResolver.java` | `HandlerMethodArgumentResolver`: lee el header `X-Comercio-Id` y el principal autenticado y delega en `ComercioActivoService`. Solo actúa en los controllers que declaran el parámetro; el resto ignora el header por construcción. No es un filtro; no toca `JwtAuthenticationFilter`, `SecurityConfig` ni el JWT. |
| `backend/.../config/WebMvcConfig.java` | Registra el resolver. |
| `backend/.../services/ComercioActivoService.java` | Toda la regla: header presente y numérico → `findByIdAndDuenoId` (404 genérico si no existe o es de otro Dueño); no numérico → 400; vacío o ausente → regla PROVISORIA aislada en un único método (`resolverPorDefecto`, marca `PROVISORIO_SELECTOR`). |

## Backend — repositorio

| Archivo | Cambio |
|---|---|
| `repositories/ComercioRepository.java` | Se elimina `Optional<Comercio> findByDuenoId`. Se agregan `findByDuenoIdOrderByFechaRegistroAscIdAsc` (lista ordenada) y `findByIdAndDuenoId`. |

## Backend — controllers (26 endpoints adaptados)

Los parámetros `@AuthenticationPrincipal AuthenticatedUser usuario` pasan a `ComercioActivo comercio`.

| Archivo | Endpoints |
|---|---|
| `controllers/ComercioController.java` | 4 (`GET/PUT /perfil`, `POST /perfil/foto/firma`, `PUT /perfil/foto`) |
| `controllers/RedSocialController.java` | 4 (listar, agregar, editar, dar de baja) |
| `controllers/ProductoController.java` | 10 (crear, editar, listar, estado, firma, agregar/eliminar/reordenar imagen, firma de recorte, url de imagen) |
| `controllers/PedidoController.java` (`/pedidos/comercio/**`) | 8 (listar, resumen-hoy, aceptar, rechazar, despachar, entregar, anular, `GET /{id}/pago`) |

Sin tocar: `/auth/**`, `/oauth/mercadopago/**`, `/notificaciones/**`, `/usuarios/**` (no declaran el parámetro).

## Backend — services

| Archivo | Cambio |
|---|---|
| `services/ComercioService.java` | `verPerfil`/`editarPerfil`/`generarFirmaFotoPerfil`/`actualizarFotoPerfil` reciben `comercioId`. `activarAptoVenta(duenoId)` y `desactivarAptoVenta(duenoId)` iteran todos los comercios del Dueño (mismo comportamiento por comercio, incluido el historial que escriben). Nueva sobrecarga `activarAptoVenta(Comercio)` para el atajo de test. |
| `services/ProductoService.java` | Los 10 métodos de Comercio reciben `comercioId`; `obtenerComercio(comercioId)` reemplaza a `obtenerComercioDelUsuario`. La verificación de pertenencia del producto al comercio ya existía. |
| `services/RedSocialService.java` | Los 4 métodos reciben `comercioId`. |
| `services/PedidoService.java` | `aceptar`/`rechazar`/`avanzarAEntregaEnCurso`/`confirmarEntregaComercio`/`anular` reciben `ComercioActivo` (necesitan `duenoId` para el actor del historial); `listarPedidosComercio`, `obtenerResumenHoy` y `obtenerPedidoDelComercio` reciben `comercioId`. |
| `services/MercadoPagoPagoService.java` | `consultarComoComercio` recibe `comercioId` (arrastrado por el cambio de firma de `obtenerPedidoDelComercio`). |
| `services/AuthService.java` | `propagarBloqueoAComercio` y `restaurarComercioSiCorresponde` iteran la lista completa de comercios del Dueño (bug real: con 2 comercios el `Optional` reventaba y el tercer intento fallido daba 500 y perdía el contador). Mismas reglas de hoy por comercio; no se cambió lo que escriben en el historial. |
| `services/TestSupportService.java` | Solo perfil `test`: `marcarAptoVenta` activa únicamente el comercio pedido; nuevos `clonarComercio` y `vincularCuentaMercadoPagoSimulada`. |

## Backend — otros

| Archivo | Por qué |
|---|---|
| `config/OpenApiConfig.java` | `ComercioActivo` se ignora como parámetro de request en springdoc (si no, aparecería como query params). |
| `controllers/TestController.java` | Solo perfil `test`: `POST /test/comercios/{id}/clonar` y `POST /test/duenos/{id}/mercadopago-simulada`. |
| `src/test/.../PedidoServiceReembolsoTest.java` | Adaptado a la nueva firma de `rechazarPedido`. |

## Testing

| Archivo | Por qué |
|---|---|
| `testing/playwright/tests/21-multicomercio-tramo1.spec.ts` | Spec a nivel API con los casos de aislamiento, header, regla provisoria y bloqueo/restauración con 2 comercios. |
| `testing/playwright/tests/helpers/backend.ts` | Helpers `apiConHeaders`, `clonarComercioTest`, `vincularMercadoPagoSimuladoTest`. |
| `testing/playwright/scripts/build-multicomercio-tramo1-postman.mjs` | Genera la carpeta 49 de la colección de Postman y sus variables de entorno. |
| `postman/Bajonea-MVP.postman_collection.json` | Carpeta nueva `49 - Multi-comercio Tramo 1`. |
| `postman/Bajonea-Local.postman_environment.json` | Variables `comercioM_*`, `comercioN_*` y de estado de la carpeta 49. |

## Documentación

`docs/DECISIONES.md` (entrada del tramo), este archivo, `docs/APRENDIZAJES-TECNICOS.md` (`BajoneaApplicationTests` no se corre sin perfil `test`) y `CLAUDE.md` (§1bis, único lugar que decía que había un comercio por Dueño).

## Scripts SQL para la base de desarrollo (los ejecuta Diego)

| Archivo | Por qué |
|---|---|
| `docs/db/multicomercio-tramo1-crear-segundo-comercio.sql` | Duplica el comercio más antiguo de un Dueño de prueba (con dirección y horarios) y muestra el id nuevo para usar en `X-Comercio-Id`. |
| `docs/db/multicomercio-tramo1-borrar-segundo-comercio.sql` | Borra ese comercio y lo que colgó de él; se niega si no termina en `(prueba multi)`, si es el más antiguo del Dueño o si tiene pedidos, extras o empleados. |
