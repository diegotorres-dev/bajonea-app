# Mapeo de archivos — Cierre manual del comercio, tramo C3 (2026-10-05)

Botón "Volver al catálogo" del checkout, regla del bloqueo vigente (aprobación y vinculación con el Dueño bloqueado), confirmación única de la reactivación de cuenta, builder de Newman `8a` y estrés `C3`. Sin migraciones: no se crea ninguna tabla, columna, índice ni valor de ENUM.

## Backend

| Archivo | Cambio |
|---|---|
| `backend/src/main/java/com/bajonea/backend/repositories/UsuarioRepository.java` | `leerEstadoConBloqueoCompartido(id)`: consulta nativa `SELECT estado FROM usuario WHERE id = :id LOCK IN SHARE MODE` (devuelve lo último confirmado y deja el estado fijo hasta el final de la transacción). |
| `backend/src/main/java/com/bajonea/backend/services/ComercioService.java` | Recibe `UsuarioRepository`. `duenoBloqueadoConBloqueo(duenoId)`. `activarAptoVenta(Integer duenoId, boolean duenoBloqueado)` y `activarAptoVenta(Comercio, boolean, String motivoBloqueo)` reemplazan a las versiones sin el flag: con el Dueño bloqueado un `APROBADO` pasa directo a `CERRADO_TEMPORALMENTE` (fila automática con el motivo) y no a `APTO_VENTA`. Constantes `MOTIVO_BLOQUEO_VIGENTE_AL_APROBAR` y `MOTIVO_BLOQUEO_VIGENTE_AL_VINCULAR`. |
| `backend/src/main/java/com/bajonea/backend/services/AdministradorService.java` | `resolverAprobacion`: al aprobar, lee el estado del Dueño con bloqueo antes de tomar la cuenta de Mercado Pago y el comercio (orden `usuario` → `cuenta_mercado_pago` → `comercio`) y pasa el resultado a `activarAptoVenta`. Rechazar no lee el usuario. |
| `backend/src/main/java/com/bajonea/backend/services/MercadoPagoOAuthService.java` | `procesarCallback`: lee el estado del Dueño antes de `vincular` y lo pasa a `activarAptoVenta`. |
| `backend/src/main/java/com/bajonea/backend/services/TestSupportService.java` | Atajos de test `marcarAptoVenta` y `vincularCuentaMercadoPagoSimulada` con la misma lectura previa (siguen ejecutando el mismo código de negocio). |
| `backend/src/main/java/com/bajonea/backend/services/AuthService.java` | `confirmarReactivacionCuenta` toma primero la fila del usuario (`findByEmailConBloqueo`), igual que la recuperación de contraseña. |

## Frontend

| Archivo | Cambio |
|---|---|
| `frontend/js/apertura-comercio.js` | `crearBannerCierre` y `crearBotonVolverAlCatalogo` (el botón pasa a `btn-primary`); `crearAvisoCierre` las compone y sigue siendo la del modal de producto. Mismos textos y `data-testid`. |
| `frontend/js/checkout.js` | Con el comercio cerrado (al abrir el paso 1 o al recibir el `409` al confirmar) el banner queda arriba como aviso, el botón de acción ("Continuar" / "Ir a pagar") se oculta y "Volver al catálogo" ocupa su lugar al pie del paso. Título y subtítulo no cambian. |
| `carrito.js`, modal de `catalogo.js` | Sin cambios: el carrito no muestra aviso anticipado y el modal ya reemplaza el botón "Agregar al carrito" por el aviso, con el botón al pie. |

## Tests

| Archivo | Cambio |
|---|---|
| `backend/src/test/java/.../services/ComercioServiceBloqueoVigenteTest.java` (nuevo) | 17 tests con Mockito: las dos transiciones, todos los demás estados sin cambio con ambos valores del flag, la vinculación sobre varios comercios y la lectura del estado del Dueño con cada valor de `EstadoUsuario`. |
| `backend/src/test/java/.../services/BloqueoVigenteIntegrationTest.java` (nuevo) | 7 tests contra `bajonea_test` (transacción que se revierte): aprobación con la cuenta bloqueada, con el Dueño activo, sin cuenta de cobro, vinculación con la cuenta bloqueada y con el Dueño activo, atajo de test y reactivación de cuenta con una segunda confirmación (`401`, una sola fila). |
| `AdministradorServiceResolucionTest` | El test de orden de bloqueo suma la lectura del usuario entre el id del Dueño y la cuenta; la aprobación `APTO_VENTA` verifica la firma nueva; 3 tests nuevos (cuenta bloqueada, rechazar no lee el usuario, sin cuenta de cobro). |
| `AuthServiceBloqueoComercioTest` | 1 test nuevo: la confirmación de la reactivación toma la fila del usuario antes de leer el código. |
| `ComercioServiceCatalogoPublicoTest`, `ComercioServiceValidarAceptaPedidosTest` | Solo el constructor (suma `UsuarioRepository`). |
| `testing/playwright/tests/34-bloqueo-vigente-api.spec.ts` (nuevo) | 10 tests de API. |
| `testing/playwright/tests/31-cierre-manual-comercio-ui.spec.ts` | 3 tests de layout nuevos en viewport móvil (checkout cerrado al abrir, checkout cerrado al confirmar y modal de producto): botón visible y por debajo del banner y del título/resumen, "Continuar" y "Ir a pagar" no visibles, botón principal en el modal. |
| `testing/playwright/scripts/stress-locks-tramoC3.mjs` (nuevo) | 5 escenarios, ver `testing/playwright/README.md`. |
| `testing/playwright/scripts/build-multicomercio-tramo8a-postman.mjs` (nuevo) | Carpeta `55` de Newman (61 requests, solo agrega: reemplaza la carpeta por nombre si ya existe) y sus variables `c3_*` en el environment. |
| `postman/Bajonea-MVP.postman_collection.json`, `postman/Bajonea-Local.postman_environment.json` | Carpeta `55` y variables nuevas (solo inserciones). |

## Documentación

`docs/DECISIONES.md`, `CLAUDE.md`, `docs/APRENDIZAJES-TECNICOS.md` (dos entradas nuevas y dos actualizadas), `testing/playwright/README.md`, `docs/entregables-01-02/` (`CAMBIOS.md` reconstruido con las secciones C3, C2, C1 y tramo 5; versiones nuevas de `alcance-y-limitaciones.md`, `diccionario-de-datos.md` —copia idéntica en `docs/diccionario-de-datos.md`—, `requisitos-funcionales-comercio.md` y `requisitos-funcionales-sistema.md`).

## Caminos que dejan un comercio en `APTO_VENTA`

| Camino | Archivo y línea | Con el Dueño `BLOQUEADO` |
|---|---|---|
| Aprobación del Administrador con cuenta de Mercado Pago activa | `AdministradorService.resolverAprobacion` (246, 275) → `ComercioService.activarAptoVenta(Comercio, …)` (183) | `CERRADO_TEMPORALMENTE`, dos filas (Administrador + automática) |
| Vinculación de Mercado Pago (callback OAuth) | `MercadoPagoOAuthService.procesarCallback` (121, 131) → `ComercioService.activarAptoVenta(Integer, …)` (172) | `CERRADO_TEMPORALMENTE` los `APROBADO`, una fila automática cada uno |
| Atajo de test `marcarAptoVenta` | `TestSupportService` (77-78), solo perfil `test` | igual que la aprobación |
| Atajo de test vinculación simulada | `TestSupportService` (152, 155), solo perfil `test` | igual que la vinculación |
| Restauración por recuperación de contraseña | `AuthService` (217, 417) | no aplica: el usuario ya está `ACTIVO` cuando restaura |
| Restauración por reactivación de cuenta | `AuthService` (341, 417) | no aplica: el usuario ya está `ACTIVO` cuando restaura |
| Atajo de test `clonarComercio` con `estado` explícito | `TestSupportService` (99), solo perfil `test` | no aplica: fixture que fuerza el estado a propósito |

Registro, alta adicional, corrección de un rechazado y re-solicitud dejan el comercio `PENDIENTE`; ningún otro código escribe `APTO_VENTA`.
