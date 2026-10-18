# Mapeo de archivos — Ajustes del rol Empleado tras la prueba manual (2026-10-18)

Tres ajustes que Diego detectó probando el rol Empleado a mano: (1) el catálogo público distingue el bloqueo de la cuenta del Dueño del cierre manual, (2) el Empleado ve el cargo por servicio que paga el cliente y (3) ningún mensaje de negocio muestra nombres internos de estados. Se auditó primero (solo lectura) y se implementó en el orden bloque 1, bloque 3, bloque 2. **Sin migraciones.** La decisión, los resultados y las mutaciones están en `docs/DECISIONES.md` (2026-10-18).

## Bloque 1 — Cierre manual contra bloqueo de la cuenta (catálogo del Cliente)

Regla nueva (reemplaza a la de C2): bloqueo de la cuenta = `estadoApertura CERRADO_TEMPORALMENTE` ("Cerrado temporalmente", sin "Reabre…"); cierre manual = `CERRADO_MANUAL` ("Cerrado", con "Reabre…"). Si hay bloqueo y cierre manual a la vez, manda el bloqueo.

| Archivo | Cambio |
|---|---|
| `backend/.../enums/EstadoApertura.java` | Valor nuevo `CERRADO_MANUAL` (solo enum de la API, sin columna ni migración) |
| `backend/.../services/DisponibilidadComercioService.java` | `calcular`: bloqueo → `CERRADO_TEMPORALMENTE`, cierre manual → `CERRADO_MANUAL`, si no `ABIERTO` o `CERRADO_HORARIO` |
| `backend/.../services/ComercioService.java` | Solo comentario y Javadoc (el público ya no "no debe enterarse" del bloqueo) |
| `backend/src/test/.../DisponibilidadComercioServiceTest.java` | La línea ~206 espera `CERRADO_MANUAL`; test nuevo que compara los dos casos |
| `backend/src/test/.../ComercioServiceCatalogoPublicoTest.java` | Test nuevo del cierre manual en el catálogo (las líneas 121 y 133 siguen en `CERRADO_TEMPORALMENTE`: son bloqueo real) |
| `frontend/` | **Sin cambios**: `estaAbiertoParaClientes` compara con `'ABIERTO'`, `etiquetaCierrePublica` ya devolvía "Cerrado" para cualquier otro valor, `data-apertura` no tiene CSS |
| `testing/playwright/tests/30-cierre-manual-comercio-api.spec.ts` | El catálogo informa `CERRADO_MANUAL` |
| `testing/playwright/tests/31-cierre-manual-comercio-ui.spec.ts` | Tarjeta y detalle de un comercio cerrado a mano: "Cerrado" |
| `testing/playwright/tests/32-bloqueo-dueno-comercio-api.spec.ts` | Cierre manual previo al bloqueo: tras el desbloqueo informa `CERRADO_MANUAL` |
| `testing/playwright/tests/33-bloqueo-dueno-comercio-ui.spec.ts` | Test nuevo: bloqueo y cierre manual muestran textos distintos en la tarjeta y en el detalle |
| `testing/playwright/tests/34-bloqueo-vigente-api.spec.ts` | Sin cambios (todo es bloqueo real) |
| `testing/playwright/scripts/build-multicomercio-tramo6a-postman.mjs`, `...tramo7a-postman.mjs` | El catálogo informa `CERRADO_MANUAL` (carpetas 53 y 54); el `8a` (carpeta 55) no cambia |
| `testing/playwright/tests/helpers/backend.ts` | Respaldo de `subirFotoPreRegistro` ante `cloud_name is disabled` de Cloudinary (URL sintética) |
| `docs/diccionario-de-datos.md` y `docs/entregables-01-02/diccionario-de-datos.md` | Regla de visibilidad y venta: `CERRADO_MANUAL` |
| `docs/entregables-01-02/requisitos-funcionales-cliente.md`, `requisitos-funcionales-comercio.md`, `Historias de Usuario - Cliente.md`, `alcance-y-limitaciones.md` | Etiquetas y reglas que ve el público |

No se tocaron (estados reales, no el cierre manual): `selector-comercio.js:40`, `selector-contexto.js:24`, `comercio.js:507` y `:1955`, `admin.js:57`, ni los tests 38:217, 38:674, 38:676 y 61:122.

## Bloque 3 — Mensajes sin nombres internos

| Archivo | Cambio |
|---|---|
| `backend/.../services/PedidoService.java` | Constantes y mensajes por estado real en aceptar, rechazar, despachar, anular, entregar, cerrar como no retirado y confirmar la entrega del Cliente (`mensajeEntregaDelCliente`, `mensajeCierreDelComercio`) |
| `backend/.../services/AdministradorService.java` | "El comercio ya fue resuelto" |
| `backend/.../services/ActividadComercioService.java` | Rama por defecto: "Hizo un cambio" |
| `backend/.../services/ComercioActivoService.java` | Los dos `400` del header: "Falta indicar el comercio" y "El comercio indicado no es válido" |
| `frontend/js/admin.js`, `selector-comercio.js` | Fallbacks de estado: "Estado no disponible" (en `admin.js` el del motivo del reembolso cae a "—") |
| `frontend/js/comercio.js`, `pedidos.js` | Fallback del motivo de rechazo: "Motivo no disponible" |
| `backend/src/test/.../AdministradorServiceResolucionTest.java` | Texto nuevo |
| `testing/playwright/tests/47-pedidos-no-retirado-api.spec.ts` | `:195` espera "El pedido ya fue resuelto" |
| `testing/playwright/tests/63-mensajes-pedido-sin-nombres-internos.spec.ts` | **Nuevo**: 5 tests de API por estado y 2 de UI del aviso fijo "El pedido ya fue resuelto" |
| `testing/playwright/tests/21-multicomercio-tramo1.spec.ts`, `26-multicomercio-tramo4-api.spec.ts`, `37-empleado-acceso-api.spec.ts` | Los textos del header ya no nombran `X-Comercio-Id` |
| `testing/playwright/scripts/build-pedidos-tramoE3-A0-postman.mjs`, `build-pedidos-no-retirado-tramoE3-A4b-postman.mjs` | Mensajes nuevos (carpetas 58 y 64) |
| `testing/playwright/scripts/build-multicomercio-tramo1-postman.mjs`, `...tramo4a-postman.mjs`, `build-empleado-tramoE2-postman.mjs` | Textos del header en los builders (la carpeta 49 se editó directo en la colección, ver abajo) |
| `postman/Bajonea-MVP.postman_collection.json` | 33 items con aserciones de mensajes cambiadas: 25 de pedido y comercio (carpetas 10, 17, 42, 58 y 64), 6 del header en la carpeta 49 (editados directo, no se regenera) y 2 del header en la 57; sin items nuevos ni quitados |
| `docs/codigo-actual.md` | Texto del `409` de aceptar |

## Bloque 2 — Cargo por servicio del cliente para el Empleado

| Archivo | Cambio |
|---|---|
| `backend/.../dto/response/PedidoEmpleadoResponseDTO.java` | Campo `cargoServicioCliente`; Javadoc |
| `frontend/js/comercio.js` | Línea "Cargo por servicio del cliente" (`data-testid="cargo-servicio-cliente-pedido"`) entre "Subtotal" y "Total pagado", solo en la vista reducida del Empleado |
| `backend/src/test/.../PedidoServiceVistaEmpleadoTest.java` | `cargoServicioCliente` entra en la lista blanca; solo se excluye el del comercio; el total cierra |
| `backend/src/test/.../PedidoNoRetiradoHttpIntegrationTest.java`, `PedidoPropioYTrazabilidadHttpIntegrationTest.java` | El Empleado recibe `cargoServicioCliente` y no `cargoServicioComercio` |
| `testing/playwright/tests/37-…`, `42-…`, `44-…`, `47-…` | Listas de campos excluidos y de la lista blanca |
| `testing/playwright/tests/38-empleado-acceso-ui.spec.ts` | `:753` excluye solo `cargoserviciocomercio`; el test del detalle espera la línea nueva y que no aparezca "Cargo por servicio (1%)" |
| `testing/playwright/tests/64-cargo-servicio-cliente-empleado-ui.spec.ts` | **Nuevo**: 4 tests (orden y suma cerrada, sin cargo del comercio ni neto ni comisión, sigue visible tras aceptar, el Dueño no cambia) |
| `testing/playwright/scripts/build-empleado-tramoE2-postman.mjs`, `build-empleado-tramoE3-A2-postman.mjs`, `build-pedidos-trazabilidad-tramoE3-A3-postman.mjs`, `build-pedidos-no-retirado-tramoE3-A4b-postman.mjs` | Aserciones de campos (carpetas 57, 59, 61 y 64) |
| `postman/Bajonea-MVP.postman_collection.json` | 12 items con aserciones de campos cambiadas (2 de la carpeta 57, 8 de la 59, 1 de la 61 y 1 de la 64) |
| `docs/entregables-01-02/requisitos-funcionales-empleado.md`, `Historias de Usuario - Empleado.md` | El Empleado ve el cargo del cliente |
| `docs/DATA-TESTID-FASE17.md` | `cargo-servicio-cliente-pedido` |

## Todos los bloques

`CLAUDE.md` (§1bis), `docs/DECISIONES.md`, `docs/entregables-01-02/CAMBIOS.md`, `docs/APRENDIZAJES-TECNICOS.md` (constructores de Newman no idempotentes, Cloudinary deshabilitada), este archivo y `testing/playwright/README.md`.

## Resultados

| | Pruebas | Resultado |
|---|---|---|
| Bloque 1 | Java 2 clases; Playwright 30 a 34; Newman 53 a 55 | 20 + 21; 78/78; 219 requests y 316 assertions, 0 fallos |
| Bloque 3 | `mvnw` (perfil `test`) de pedido, actividad, comercio activo y `AdministradorServiceResolucionTest`; Playwright 47 y 63; Newman 00 a 17, 42, 58, 59, 61 y 64 | 216/216; 21/21; 737 requests y 1210 assertions, 0 fallos |
| Bloque 2 | `mvnw test` completo (dos pasadas); Playwright 37, 38, 42, 44, 47, 52 y 64; Playwright 21, 26 y 37; Newman 00 a 03, 49, 57, 59, 61 y 64 | 862 + 6; 186/186; 75/75; 719 requests y 1089 assertions, 0 fallos |

Mutaciones con sha1 (restauradas idénticas): `DisponibilidadComercioService.java` (`c2d708b6…`), `PedidoService.java` (`e2e269e5…`), `PedidoEmpleadoResponseDTO.java` (`49fdff1e…`) y `frontend/js/comercio.js` (`4aac70c8…`). No se repitió la regresión completa ni los estreses (no se tocó ningún bloqueo ni escritura). Cloudinary estaba deshabilitada, así que no se corrieron los specs que suben imágenes reales.

## Deuda anotada

- Incoherencia de montos del Dueño: la lista de pedidos muestra el total con el cargo del cliente y el detalle muestra el neto.
- Fallbacks de tipo (tipo de comercio y de red social, `admin.js`) pueden mostrar el valor crudo.
- Los `400` de parámetros numéricos inválidos usan la respuesta estándar de Spring, sin `mensaje`.
