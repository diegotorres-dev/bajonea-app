# Mapeo de archivos — Fase 3, direcciones múltiples del Cliente (entrega A, backend)

Fecha: 2026-10-24. Pendiente de la confirmación de Diego. Migración `V42`, spec `80` (API), carpeta `78` de Newman. La entrega B (pantallas) no está hecha.

## Backend — nuevos

| Archivo | Qué es |
|---|---|
| `backend/src/main/resources/db/migration/V42__direccion_multiple_cliente.sql` | `direccion`: `nombre`, `referencia`, columna generada `principal_activa_cliente_id` + `UNIQUE`, índice `(cliente_id, eliminada)`. `pedido`: seis columnas `entrega_*`. Backfill de la predeterminada y de la copia |
| `controllers/DireccionClienteController.java` | `GET`, `POST`, `PUT /{id}`, `PUT /{id}/principal`, `DELETE /{id}` bajo `/api/v1/clientes/direcciones` (cubiertos por el matcher `hasRole("CLIENTE")` de `/clientes/**`; no van en `DelegacionEmpleado`) |
| `services/DireccionClienteService.java` | Cupo de 5, una predeterminada, baja lógica, última dirección. Toda escritura empieza por `usuario FOR UPDATE` |
| `dto/request/DireccionClienteRequestDTO.java` | Extiende `DireccionRequestDTO` con `nombre` (40) y `referencia` (150). `principal` solo lo lee el alta |
| `dto/response/DireccionClienteResponseDTO.java` | Dirección del Cliente con alias, referencia y `principal` |
| `dto/response/DireccionEntregaResponseDTO.java` | Copia de la dirección de un pedido (sin alias, sin `id`, sin `principal`) |

## Backend — modificados

| Archivo | Cambio |
|---|---|
| `entities/Direccion.java` | `nombre`, `referencia` |
| `entities/Pedido.java` | `entregaCalle`, `entregaNumero`, `entregaPisoDepto`, `entregaCodigoPostal`, `entregaLocalidadId`, `entregaReferencia` y la asociación de solo lectura `entregaLocalidad` (sin FK en la base) |
| `repositories/DireccionRepository.java` | Consultas del CRUD, `leerParaEntregaConBloqueoCompartido` (nativa, `LOCK IN SHARE MODE`); se eliminó `findByClienteId` (devolvía `Optional` y rompía con 2 direcciones) |
| `services/PedidoService.java` | `confirmarPedido` lee la dirección con bloqueo compartido y copia el snapshot en la misma transacción; las respuestas arman la dirección desde la copia |
| `services/ClienteService.java` | `GET /clientes/perfil` toma la predeterminada activa |
| `services/ValidadorDatosNegocioComercio.java` | `obtenerLocalidad(id, campo)`: el CRUD informa el error en `localidadId` |
| `exceptions/ConflictoComercioException.java` | Códigos `DIRECCIONES_CUPO_MAXIMO` y `ULTIMA_DIRECCION` |
| `dto/response/PedidoResponseDTO.java`, `PedidoEmpleadoResponseDTO.java` | `direccion` pasa a `DireccionEntregaResponseDTO` |

## Pruebas — nuevas

| Archivo | Qué cubre |
|---|---|
| `backend/src/test/.../DireccionClienteServiceTest.java` | Orden de sentencias (usuario bloqueado antes de contar, bajar antes de subir), cupo, última dirección, promoción |
| `.../DireccionClienteIntegrationTest.java` | CRUD por HTTP contra `bajonea_test` (26 tests) |
| `.../DireccionClienteConcurrenciaIntegrationTest.java` | Cupo, predeterminada, bajas y copia del pedido con hilos reales (7 tests) |
| `.../DireccionRepositoryIntegrationTest.java` | El índice único, las consultas y que la lectura con bloqueo espera a una escritura de la misma dirección (6 tests) |
| `.../PedidoSnapshotDireccionIntegrationTest.java` | La copia del pedido, el alias que no viaja, el retiro sin copia (10 tests) |
| `.../PedidoServiceConfirmarPedidoLockTest.java` | +2 tests: la dirección se lee con bloqueo compartido y nunca con `findById` |
| `testing/playwright/tests/80-direcciones-api.spec.ts` | API real, 16 tests |
| `testing/playwright/scripts/build-direcciones-fase3-postman.mjs` | Carpeta `78` de Newman (va última) |
| `testing/playwright/scripts/stress-locks-tramoDirecciones.mjs` | Estrés de 5 escenarios (id `direcciones` en `correr-estreses.mjs`) |

## Documentación

`docs/diccionario-de-datos.md` (v1.27), `docs/DECISIONES.md`, `CLAUDE.md` (§1bis), este archivo, `docs/PROGRESO-FASE3-DIRECCIONES.md`.

## Cosas que NO cambian

- El registro de Cliente y el alta por invitación (la dirección sigue siendo obligatoria y queda predeterminada).
- `GET /clientes/perfil`: conserva el campo `direccion` (la predeterminada).
- Las direcciones de los comercios.
- `PedidoRequestDTO` (el checkout sigue mandando `direccionId`).

---

# Entrega B (pantallas) — 2026-10-25

Solo frontend y pruebas: el backend no se tocó. Pendiente de la confirmación de Diego.

## Frontend — nuevos

| Archivo | Qué es |
|---|---|
| `frontend/js/direcciones.js` | Módulo compartido: `cargarDirecciones`, `abrirFormularioDireccion` (pantalla completa para el alta y la edición), `abrirConfirmacionBaja` (`alertdialog`), `initMisDirecciones` (lista del perfil: radio, menú ⋮, aviso con "Deshacer", cupo lleno), `crearTarjetaDireccionEntrega` (checkout), ayudas de teclado para los `radiogroup` y `mostrarAvisoConAccion` |

## Frontend — modificados

| Archivo | Cambio |
|---|---|
| `frontend/perfil.html`, `js/cliente.js` | Fila "Mis direcciones (N)" (`btn-mis-direcciones`) y vista `view-direcciones`; el perfil acepta `?vista=direcciones` y `&desde=checkout` (la flecha de volver regresa al checkout) |
| `frontend/js/checkout.js` | El paso de entrega pasa de una dirección fija a tarjetas seleccionables (`radiogroup-direcciones`, `tarjeta-direccion-{id}`); ya no pide `GET /clientes/perfil`; "Agregar otra dirección", cupo lleno con enlace, "Administrar mis direcciones" (guarda `{comercioId, tipoEntrega, direccionId}` en `sessionStorage['bajonea_checkout_pendiente']` y lo consume una vez al volver); `404` de dirección inexistente |
| `frontend/js/pedidos.js`, `js/comercio.js` | Línea `referencia-entrega-pedido` ("Referencia: …") bajo la dirección del detalle de pedido del Cliente y del Dueño/Empleado (el detalle del Empleado usa la misma pantalla) |
| `frontend/css/styles.css` | `pantalla-completa`, `direccion-item*`, `chip-predeterminada`, `direccion-tarjeta*`, `btn-punteado`, `aviso-accion*`, `app-header__back--tactil` y `referencia-entrega` |

## Pruebas

| Archivo | Qué cubre |
|---|---|
| `testing/playwright/tests/81-direcciones-ui.spec.ts` | 20 tests contra el backend real a 375 px: lista con 1 y con 5, menú ⋮, alta con errores locales y del servidor, edición (la predeterminada bloqueada, otra que pasa a predeterminada), volver y Esc, cambio de predeterminada con "Deshacer" y lista deshabilitada, bajas común y de la predeterminada, cupo lleno, checkout (preselección, teclado, alta con interruptor apagado, cupo lleno, administrar y volver, dirección eliminada, sin direcciones, dirección vieja fuera de las localidades) y la referencia en los tres detalles; genera las capturas |
| `testing/playwright/tests/12-carrito-checkout-explorar.spec.ts` | El test de "sin dirección" ahora intercepta `GET /clientes/direcciones` |
| `testing/playwright/tests/63-registro-comercio-fase1-api.spec.ts` | La dirección vieja fuera de la lista también se lee por el listado |
| `docs/capturas-direcciones/` | 17 capturas a 375 px (las genera el spec 81) |

## Decisiones tomadas en la entrega B

Ver `docs/DECISIONES.md`, 2026-10-25.
