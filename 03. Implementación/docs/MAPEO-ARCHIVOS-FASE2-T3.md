# Mapeo de archivos: Fase 2, tramo T3 (2026-10-22)

Precio no modificable dentro de una franja, aviso de precio cambiado en el carrito y total esperado en el pedido. Plan en `docs/PLAN-FASE2-T3.md`, avance en `docs/PROGRESO-FASE2-T3.md`, decisiones en `docs/DECISIONES.md` (entrada del 2026-10-22). La entrega A (backend y tests) está en el commit `2336402`; la entrega B (frontend, tests de UI y documentación) está sin commit.

## Entrega A: backend, tests y estrés (commit `2336402`)

| Archivo | Cambio |
|---|---|
| `backend/src/main/resources/db/migration/V40__item_carrito_precio_visto.sql` | Nuevo: `item_carrito.precio_visto DECIMAL(10,2) NULL` |
| `entities/ItemCarrito.java` | Campo `precioVisto` |
| `config/PrecioBloqueoProperties.java` | Nuevo: `precio.bloqueo-en-franja.habilitado` (`true` por defecto) |
| `services/ProductoService.java` | Guard de precio en `editarProducto` (después de los guards existentes); `precioBloqueado` y `precioBloqueadoHasta` en la respuesta |
| `services/DisponibilidadComercioService.java` | `franjaContinuaDe`: fin de la cadena de franjas continuas |
| `services/CarritoService.java` | Estampa `precio_visto` al insertar; `precioCambio`, `hayCambioDePrecio` y `total` |
| `services/PedidoService.java` | `totalEsperado` contra el total calculado: `409 PRECIO_CAMBIO` |
| `dto/request/PedidoRequestDTO.java`, `dto/response/ItemCarritoResponseDTO.java`, `CarritoResponseDTO.java`, `ProductoResponseDTO.java` | Campos nuevos |
| `exceptions/ConflictoComercioException.java` | `PRECIO_BLOQUEADO_EN_FRANJA` y `PRECIO_CAMBIO` |
| `controllers/TestController.java`, `resources/application-test.properties` | Atajo `PUT /api/v1/test/precio-bloqueo`; propiedad apagada en test |
| Tests Java | Nuevos: `ProductoServicePrecioFranjaTest`, `ProductoPrecioFranjaIntegrationTest`, `CarritoPrecioVistoIntegrationTest`, `PedidoTotalEsperadoIntegrationTest`, `PrecioBloqueoConcurrenciaIntegrationTest`; ajustados `AtajosDeTestEnElPerfilTestTest` y `CarritoIntegrationBase` |
| `testing/playwright/tests/74-precio-franja-api.spec.ts`, `75-pedido-total-esperado-api.spec.ts`, `helpers/backend.ts` | Specs de API nuevos; helpers `bloqueoDePrecioTest` y `conBloqueoDePrecio` |
| `testing/playwright/scripts/build-precio-franja-tramoT3-postman.mjs` | Nuevo: carpeta `75` de Newman (va última) |
| `testing/playwright/scripts/stress-locks-tramoPrecios.mjs`, `correr-estreses.mjs` | Estrés nuevo (4 escenarios), registrado como `precios` |
| `postman/Bajonea-MVP.postman_collection.json` | Carpeta 75 |

## Entrega B: frontend y tests de UI (sin commit)

| Archivo | Cambio |
|---|---|
| `frontend/comercio-producto-form.html` | `icono-precio-bloqueado` (candado a la derecha del campo precio) y `leyenda-precio-bloqueado` |
| `frontend/js/comercio.js` | `initComercioProductoForm`: bloquea y habilita el campo precio (`bloquearPrecio`, `desbloquearPrecio`, temporizador con `milisegundosHasta`), manda el precio original si está bloqueado y trata el `409 PRECIO_BLOQUEADO_EN_FRANJA` por `data.codigo` |
| `frontend/js/precio-cambio.js` | Nuevo: `crearPrecioUnitario` (precio viejo tachado, nuevo y "Cambió el precio") y `formatearPrecioEntero` |
| `frontend/js/carrito.js` | Usa `crearPrecioUnitario` y el `total` del servidor |
| `frontend/js/checkout.js` | Envía `totalEsperado`; ante `PRECIO_CAMBIO` repinta el paso 3, muestra `aviso-total-cambio` y `btn-confirmar-nuevo-total`; `renderBanner` acepta un `data-testid` |
| `frontend/css/styles.css` | `.precio-unitario__*` y `.order-line__detalle` |
| `testing/playwright/tests/76-precio-franja-ui.spec.ts` | Nuevo (10 tests) |
| `docs/DATA-TESTID-FASE17.md`, `docs/DECISIONES.md`, `docs/diccionario-de-datos.md` (v1.25), `docs/APRENDIZAJES-TECNICOS.md`, `docs/CONCURRENCIA-Y-TRANSACCIONES.md`, `docs/LISTA-DE-DESPLIEGUE.md`, `docs/PROGRESO-FASE2-T3.md`, `CLAUDE.md`, `testing/playwright/README.md` | Documentación del tramo |
| `docs/entregables-01-02/` (`CAMBIOS.md`, `diccionario-de-datos.md`, requisitos funcionales del Comercio, del Dueño, del Empleado y del Cliente, historias de usuario del Comercio, del Dueño, del Empleado y del Cliente) | Versiones nuevas de los documentos de `01.` y `02.` (Diego las copia a mano) |

El backend no cambia en la entrega B.
