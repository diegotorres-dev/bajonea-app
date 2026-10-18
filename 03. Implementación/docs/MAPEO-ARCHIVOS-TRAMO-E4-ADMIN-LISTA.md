# Mapeo de archivos — El Administrador ve todos los comercios, sin importar el estado

Fecha: 2026-10-15. Objetivo: que `GET /api/v1/administrador/comercios` y la pantalla `admin-comercios.html` muestren todos los comercios en cualquier estado, con una etiqueta de estado en cada tarjeta, para poder llegar a "Ver equipo" de cualquiera (por ejemplo, uno cerrado temporalmente). **Sin migraciones ni cambios en escrituras o bloqueos.**

## Backend modificado

| Archivo | Qué cambia y por qué |
|---|---|
| `backend/src/main/java/com/bajonea/backend/services/AdministradorService.java` | `listarComerciosAprobados()` pasa a `listarComercios()`: en vez de `findByEstadoIn(APROBADO, APTO_VENTA, SUSPENDIDO)` usa `comercioRepository.findAll(Sort.by("id"))`. Mismo DTO (`ComercioAdminResponseDTO`, que ya traía `estado`), mismos valores neutros (`duenoId` nulo, `esAdicional` falso, `otrosComercios` vacío). El Javadoc explica el cambio. Import de `Sort`. |
| `backend/src/main/java/com/bajonea/backend/controllers/AdministradorController.java` | El método del `GET /comercios` pasa a `listarComercios()` y llama al servicio renombrado. La ruta no cambia. |

## Frontend modificado

| Archivo | Qué cambia y por qué |
|---|---|
| `frontend/js/admin.js` | `renderComercioAdminRow` suma una etiqueta de estado (`status-badge` con las clases ya existentes de `BADGE_ESTADO_COMERCIO`, que ya cubría los ocho estados; `data-testid="estado-comercio-{id}"` y `data-estado`). El estado vacío dice "No hay comercios" (antes "No hay comercios aprobados"). El modal de detalle no cambia: "Ver equipo" y "Cerrar" aparecen siempre y "Suspender" solo con `APROBADO` o `APTO_VENTA`, que es lo que el backend permite. |
| `frontend/css/styles.css` | `.comercio-admin-row__body .status-badge { margin-top: 6px; }` (ningún color nuevo). |

## Pruebas nuevas o modificadas

| Archivo | Qué cambia |
|---|---|
| `backend/src/test/java/com/bajonea/backend/services/AdministradorListadoComerciosIntegrationTest.java` (nuevo, 6 tests) | Un comercio por cada uno de los ocho estados aparece con su estado; el listado trae tantos comercios como hay en la base; un comercio con cierre manual y uno cerrado temporalmente aparecen; orden por id y valores neutros; las solicitudes siguen siendo solo pendientes; solo el Administrador lo ve. |
| `testing/playwright/tests/61-admin-lista-comercios-estados-ui.spec.ts` (nuevo, 12 tests) | Un test por cada estado (etiqueta, clase, "Ver equipo" que navega, "Suspender" solo cuando corresponde), cierre manual y cerrado temporalmente con un miembro en "Ver equipo", los ocho estados a la vez a 375 px y las solicitudes solo pendientes. |
| `testing/playwright/scripts/build-admin-lista-comercios-tramoE4-postman.mjs` (nuevo) | Genera la carpeta 69 de Newman (21 requests): clona un comercio en cada estado, comprueba el listado, el equipo de cada uno, las solicitudes y la seguridad. Se corre después del constructor de la carpeta 68. |
| `postman/Bajonea-MVP.postman_collection.json` y `postman/Bajonea-Local.postman_environment.json` | Carpeta 69 y 16 variables `lc_*`. En la carpeta 10, el request "GET administrador/comercios" dejó de exigir que Comercio D no aparezca (ahora aparece, `PENDIENTE`); en la 50 se renombró un request ("listado general"), también en `build-multicomercio-tramo2a-postman.mjs`. |

## Documentación

`docs/DECISIONES.md`, `docs/DATA-TESTID-FASE17.md`, este archivo y, en `docs/entregables-01-02/`: `requisitos-funcionales-administrador.md`, `Historias de Usuario - Administrador.md` (HU-A07), `alcance-y-limitaciones.md` y `CAMBIOS.md`.
