# Mapeo de archivos — Cierre manual del comercio, tramo C2 (backend, frontend y tests)

Fecha: 2026-10-04. Objetivo: que el bloqueo de la cuenta del Dueño cierre solo los comercios que venden, que el catálogo siga mostrando esos comercios como "Cerrado temporalmente" (sin revelar el bloqueo) y que ningún pedido nuevo entre mientras la cuenta está bloqueada. Sin migraciones, sin tablas, sin columnas y sin valores de ENUM nuevos. **Sin cambios de frontend:** los 9 tests de UI nuevos pasan con el frontend del C1.

## Backend modificado

| Archivo | Por qué |
|---|---|
| `services/AuthService.java` | `propagarBloqueoAComercio`: solo los candidatos `APROBADO`/`APTO_VENTA` de la lectura común llegan a `ComercioService.cerrarTemporalmentePorBloqueoDeCuenta`, que decide con el estado real; los demás estados nunca se tocan. `confirmarRecuperacionPassword` toma primero la fila del usuario (`findByEmailConBloqueo`, mismo orden que el login): dos confirmaciones simultáneas del mismo código ya no restauran dos veces (hallazgo del estrés, escenario 4). |
| `services/ComercioService.java` | `listarAprobados` y `buscarAprobadoPorId` incluyen `CERRADO_TEMPORALMENTE`; el `estado` del DTO público es siempre `APTO_VENTA`; `validarAceptaPedidos` responde `409` "Este comercio está cerrado en este momento" para `CERRADO_TEMPORALMENTE` antes del texto genérico; método nuevo `cerrarTemporalmentePorBloqueoDeCuenta` (refresh con `PESSIMISTIC_WRITE` por clave primaria, transición solo si el estado real es `APTO_VENTA`). |
| `services/DisponibilidadComercioService.java` | Un comercio en estado `CERRADO_TEMPORALMENTE` informa `estadoApertura = CERRADO_TEMPORALMENTE`, `abiertoAhora = false` y `textoReapertura = null`; `puedeCambiarCierre` ya era `false` (no es operativo). |
| `services/CierreComercioService.java` | `cerrar` y `abrir` toman con bloqueo compartido la fila del usuario que actúa **antes** de bloquear el comercio. Corrige un deadlock con el bloqueo de cuenta del login (usuario → comercio) que existía desde el C1: el historial de cierre tiene una FK al usuario que se pedía después de tener el comercio. La reapertura automática no actúa un usuario y no lo toma. |
| `repositories/UsuarioRepository.java` | `leerIdConBloqueoCompartido` (consulta nativa `LOCK IN SHARE MODE`, MariaDB 10.4 no entiende el `FOR SHARE` de Hibernate). |

## Frontend

Sin cambios. `catalogo.js`, `checkout.js` y el detalle ya usaban `estadoApertura`, toleraban `textoReapertura` nulo y reconocían el `409` por su texto. No se tocaron `explorar.js` ni el catálogo global de productos.

## Tests

| Archivo | Por qué |
|---|---|
| `backend/src/test/.../ComercioServiceCatalogoPublicoTest` (nuevo, 20) | Catálogo y detalle con `CERRADO_TEMPORALMENTE`, `estado` público siempre `APTO_VENTA`, `estadoApertura` y `textoReapertura` nulo, `404` para los demás estados, y `cerrarTemporalmentePorBloqueoDeCuenta` (solo `APTO_VENTA`, historial, decisión sobre el estado real tras el bloqueo). |
| `backend/src/test/.../AuthServiceBloqueoComercioTest` (nuevo, 4) | Solo los candidatos llegan al servicio de bloqueo (ningún otro estado, nada en un Cliente ni antes del tercer intento) y la confirmación de la recuperación toma primero la fila del usuario. |
| `backend/src/test/.../BloqueoComercioIntegrationTest` (nuevo, 4) | Contra `bajonea_test`: bloqueo y recuperación con comercios en todos los estados (con y sin cuenta de Mercado Pago), cierre manual previo que sigue vigente, un único `APROBADO` sin historial y la lectura bloqueada del estado real. |
| `ComercioServiceValidarAceptaPedidosTest`, `DisponibilidadComercioServiceTest`, `MisComerciosServiceTest`, `CierreComercioServiceTest` (modificados) | Casos nuevos de `CERRADO_TEMPORALMENTE` y del orden de bloqueo usuario → comercio; `CierreComercioServiceTest` suma el `UsuarioRepository` al constructor. |
| `testing/playwright/tests/32-bloqueo-dueno-comercio-api.spec.ts` (nuevo, 13) | Dueño con un comercio `APTO_VENTA`, otro `APROBADO` sin cobro y uno `SUSPENDIDO`: bloqueo, catálogo, productos, `409` de carrito y de pedido, recuperación, cierre manual previo, cuenta desvinculada durante el bloqueo, Dueño solo `APROBADO` y bloqueos repetidos. |
| `testing/playwright/tests/33-bloqueo-dueno-comercio-ui.spec.ts` (nuevo, 9) | Catálogo con la tarjeta atenuada y la etiqueta al final, filtro "Abierto ahora", detalle sin texto de reapertura, modal de producto sin "Agregar al carrito", `409` en el modal, en el checkout y al abrirlo, y carrito sin aviso anticipado; el desbloqueo devuelve la tarjeta a "Abierto". |
| `testing/playwright/tests/21-multicomercio-tramo1.spec.ts` (modificado) | El test de bloqueo con dos comercios: los `APROBADO` sin cobro ya no cambian ni escriben historial; el cierre por bloqueo y su restauración se prueban con cuenta de Mercado Pago. |
| `testing/playwright/tests/24-multicomercio-tramo3a-correccion-rechazados.spec.ts` (modificado) | El comercio base pasa a `APTO_VENTA` antes del bloqueo (si no, el bloqueo ya no lo mueve). |
| `testing/playwright/scripts/build-multicomercio-tramo1-postman.mjs` (modificado) | El catálogo después del bloqueo ahora trae a los dos comercios (estado público `APTO_VENTA`, `CERRADO_TEMPORALMENTE`, sin texto) en vez de ninguno. |
| `postman/Bajonea-MVP.postman_collection.json` (modificado) | Carpeta `19`: el `409` de agregar al carrito del comercio bloqueado ahora dice "Este comercio está cerrado en este momento". Carpetas `49` a `53` regeneradas por sus builders. |
| `testing/playwright/scripts/build-multicomercio-tramo7a-postman.mjs` (nuevo) | Carpeta `54` (60 requests): bloqueo de dos Dueños (uno con cierre manual previo), catálogo, productos, `409`, recuperación, estados restaurados y pedido nuevo. Va último en el orden de los builders. |
| `testing/playwright/scripts/stress-locks-tramoC2.mjs` (nuevo) | Cinco escenarios de concurrencia del bloqueo (ver el README de Playwright). |

## Sin cambios

`explorar.js`, el catálogo global de productos (`ProductoService`), el job de reapertura, `ComercioActivoService.esOperativo` y toda la lógica de restauración (`restaurarComercioSiCorresponde`). Cualquier cambio de esquema: ninguno.
