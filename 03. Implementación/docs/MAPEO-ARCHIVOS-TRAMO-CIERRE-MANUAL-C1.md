# Mapeo de archivos — Cierre manual del comercio, tramo C1 (Entrega A: backend y tests)

Fecha: 2026-10-03. Objetivo: que el Dueño pueda cerrar y abrir un comercio a mano (solo dentro de una franja), que cerrar frene pedidos nuevos sin cortar los en curso, que el comercio se reabra solo en la próxima franja y que todo quede en un historial. Una migración, `V28`. Sin frontend (Entrega B) y sin la regla de bloqueo del Dueño con el catálogo mostrando `CERRADO_TEMPORALMENTE` (tramo C2).

## Base de datos

| Archivo | Por qué |
|---|---|
| `backend/src/main/resources/db/migration/V28__crear_historial_cierre_comercio.sql` (nuevo) | Tabla `historial_cierre_comercio` con el `CHECK` que exige usuario salvo `SISTEMA`. DDL aprobado por Diego, probado primero en `bajonea_test` (MariaDB 10.4.32 acepta el `CHECK` junto con la FK). |

## Backend nuevo

| Archivo | Por qué |
|---|---|
| `enums/AccionCierre.java`, `enums/ActorCierre.java`, `enums/EstadoApertura.java` | `CERRADO`/`REABIERTO`; `DUENO`/`EMPLEADO`/`SISTEMA`; `ABIERTO`/`CERRADO_HORARIO`/`CERRADO_TEMPORALMENTE`. |
| `entities/HistorialCierreComercio.java`, `repositories/HistorialCierreComercioRepository.java` | Fila de historial y la consulta de la última acción por comercio. |
| `services/DisponibilidadComercioService.java` | Única fuente de la hora (`-03:00`) y de las franjas: dentro de franja (23:59 = fin del día), próxima franja, texto de reapertura, estado de apertura. |
| `services/CierreComercioService.java` | Cerrar, abrir y reapertura de un comercio; bloqueo con `refresh(PESSIMISTIC_WRITE)`; bandera e historial en la misma transacción. |
| `services/ReaperturaComerciosJob.java` | `@Scheduled` cada 60 s; `reabrirComerciosVencidos(LocalDateTime ahora)`. |
| `dto/response/CierreComercioResponseDTO.java` | Respuesta de `cerrar` y `abrir`. |

## Backend modificado

| Archivo | Por qué |
|---|---|
| `entities/Comercio.java` | Mapea `cerrado_manualmente` y agrega `@DynamicUpdate`. |
| `repositories/ComercioRepository.java` | `leerEstadoConBloqueoCompartido` devuelve estado y cierre (`EstadoYCierreComercio`); `findIdsCerradosManualmente` para el job. |
| `repositories/HorarioRepository.java` | `findByComercioIdIn` para el listado `mis-comercios`. |
| `services/ComercioService.java` | `validarAceptaPedidos(comercio, estado, cerradoManualmente)` (estado → cierre manual → horario) usa el servicio de disponibilidad; los DTO propio y público suman los campos de apertura. |
| `services/PedidoService.java` | `confirmarPedido` lee estado y cierre en la misma lectura con bloqueo compartido. |
| `services/MisComerciosService.java` | Suma los cuatro campos de apertura a cada fila. |
| `controllers/ComercioController.java` | `PUT /comercios/cerrar` y `PUT /comercios/abrir`. |
| `controllers/TestController.java` | `POST /test/jobs/reapertura-comercios?ahora=` (perfil `test`). |
| `dto/response/ComercioResponseDTO.java`, `MiComercioResponseDTO.java`, `ComercioPublicoResponseDTO.java` | `cerradoManualmente`, `abiertoAhora`, `puedeCambiarCierre`, `textoReapertura`; el público suma `estadoApertura` y `textoReapertura`. |

## Tests

| Archivo | Por qué |
|---|---|
| `backend/src/test/.../DisponibilidadComercioServiceTest`, `CierreComercioServiceTest`, `ReaperturaComerciosJobTest`, `ComercioServiceValidarAceptaPedidosTest` (nuevos) | Franjas y 23:59, textos, cerrar/abrir, idempotencia, historial, job (próxima franja, no reabre dentro de la franja, se pone al día, bandera sin fila `CERRADO`), orden de validación. |
| `backend/src/test/.../CierreComercioIntegrationTest` (nuevo) | Contra `bajonea_test`: `CHECK` del actor, lectura compartida, `@DynamicUpdate`, bloqueo sobre una entidad ya cargada, job. |
| `backend/src/test/.../PedidoServiceConfirmarPedidoLockTest`, `MisComerciosServiceTest`, `BajoneaApplicationTests` (modificados) | Nueva firma y nueva proyección; `BajoneaApplicationTests` ahora usa el perfil `test` (antes migraba la base de desarrollo por defecto). |
| `testing/playwright/tests/30-cierre-manual-comercio-api.spec.ts` (nuevo) | 14 tests de API. |
| `testing/playwright/tests/helpers/multicomercio.ts` (modificado) | `registrarPendiente` y `prepararAprobado` aceptan horarios opcionales. |
| `testing/playwright/tests/26-multicomercio-tramo4-api.spec.ts`, `scripts/build-multicomercio-tramo4a-postman.mjs` (modificados) | El contrato de `mis-comercios` pasa de 7 a 11 campos. |
| `testing/playwright/scripts/build-multicomercio-tramo6a-postman.mjs` (nuevo) | Carpeta `53` de la colección (74 requests). |
| `testing/playwright/scripts/stress-locks-tramoC1.mjs` (nuevo) | Cinco escenarios de concurrencia. |

# Entrega B: frontend y tests de UI

Fecha: 2026-10-03. Objetivo: que el Dueño cierre y abra su comercio desde el panel con un interruptor, que el Cliente vea los comercios cerrados atenuados y que ninguna pantalla calcule "abierto" con el reloj del navegador. Sin backend nuevo, sin migraciones y sin tocar `explorar.js` ni el catálogo global de productos. Sin el bloqueo del Dueño (C2).

## Frontend nuevo

| Archivo | Por qué |
|---|---|
| `frontend/js/apertura-comercio.js` | Única fuente de las reglas de apertura para todas las pantallas (importa solo `api.js`): quién muestra cierre (`APTO_VENTA`), si está cerrado, qué etiqueta corresponde, qué comercios son "cerrables", el modo del interruptor, `cerrarComercio`/`abrirComercio` (con `comercioId`, sin redirigir ante `5xx` ni ante falla de red) y `cerrarVariosComercios` (un `409` de "fuera de horario" o "no operativo" cuenta como éxito). También el aviso de error con "Volver al catálogo" que comparten el modal de producto y el checkout. |
| `frontend/js/cierre-comercio.js` | Interruptor del dashboard (`montarSwitchCierre`): tarjeta con skeleton, tres modos, confirmación solo al cerrar, protección contra doble clic y re-render en el lugar con cada refresco de `mis-comercios` (no pierde el foco ni cierra el modal abierto). |

## Frontend modificado

| Archivo | Por qué |
|---|---|
| `frontend/js/api.js` | `comercios/(cerrar\|abrir)` en `RUTAS_DEL_DUENO` (mandan `X-Comercio-Id`); opción `handleRedGlobally` (en `false`, una falla de red lanza `ApiError(0)` en vez de redirigir a la pantalla de error, para poder avisar dentro de la pantalla). |
| `frontend/js/catalogo.js` | `estadoHorario` eliminado: queda `resumenHorarioHoy` (solo las franjas del día, para el texto de horario; no decide abierto/cerrado). Tarjetas cerradas atenuadas con la etiqueta al final, orden y filtro "Abierto ahora" por `estadoApertura`, detalle con etiqueta y `textoReapertura`, y el `409` de cierre en el modal de producto. `pintarEstadoComercio` recibe el comercio. |
| `frontend/js/checkout.js` | El bloqueo al abrir el paso y el `409` al confirmar el pedido usan el aviso con "Volver al catálogo"; el chequeo del reloj del navegador se reemplazó por `estadoApertura`. |
| `frontend/js/comercio.js` | Dashboard: interruptor, banner calculado con `abiertoAhora` y actualizado por el polling. Modal de bloqueo de la desvinculación: título "No podés desvincular ahora", línea y botón de cierre, falla parcial y paso a la variante 2; la lista de comercios se refresca antes de calcular los cerrables. |
| `frontend/js/selector-comercio.js` | Chip "Cerrado" en la franja y en la fila del panel (con `textoReapertura` en el subtítulo), solo para `APTO_VENTA`. |
| `frontend/comercio-dashboard.html` | Slot `cierre-comercio-slot` debajo del banner de estado. |
| `frontend/css/styles.css` | Estilos del interruptor, la tarjeta, el chip, las tarjetas cerradas del catálogo, el aviso de cierre y las líneas nuevas del modal. |

## Tests

| Archivo | Por qué |
|---|---|
| `testing/playwright/tests/31-cierre-manual-comercio-ui.spec.ts` (nuevo) | 27 tests de UI (viewport móvil): interruptor en sus tres estados y con skeleton, confirmación (Cancelar, Escape, fondo), doble clic, apertura directa, `409` y falla de red, chip en franja y panel, comercio `APROBADO` sin interruptor, reapertura automática sin recargar, catálogo (atenuado, etiqueta y orden, filtro, detalle), `409` al agregar al carrito y al confirmar el pedido, y el modal de desvinculación en sus dos variantes con cierre masivo y falla parcial. |
| `testing/playwright/tests/30-cierre-manual-comercio-api.spec.ts` (modificado) | +1 test: cierre masivo de un Dueño con tres comercios (abierto en franja, fuera de horario y ya cerrado a mano). |
| `testing/playwright/tests/29-multicomercio-tramo5-ui.spec.ts` (modificado) | El título del bloqueo pasó de "Todavía no se puede desvincular" a "No podés desvincular ahora" (2 aserciones). |
| `testing/playwright/tests/helpers/multicomercio.ts`, `backend.ts` (modificados) | `agregarComercioApto` y `reemplazarHorarios` (comercios del mismo Dueño con horarios distintos); `cerrar`/`abrir` en el regex de rutas del Dueño. |
| `testing/playwright/scripts/build-multicomercio-tramo6a-postman.mjs` (modificado) | La carpeta `53` suma el cierre masivo (alta adicional por API, tres comercios, estado final por `mis-comercios`): 74 → 84 requests. |
