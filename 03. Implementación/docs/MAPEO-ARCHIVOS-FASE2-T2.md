# Mapeo de archivos: Fase 2, tramo T2 (2026-10-20)

Pedido por turno y "Vendido en el turno". Plan en `docs/PLAN-FASE2-T2.md`, avance en `docs/PROGRESO-FASE2-T2.md`, decisiones en `docs/DECISIONES.md` (entrada del 2026-10-20). La entrega A (backend y tests) está en el commit `a2d9b81`; la entrega B (frontend, tests de UI y documentación) está sin commit.

## Entrega A: backend, tests y estrés (commit `a2d9b81`)

| Archivo | Cambio |
|---|---|
| `backend/src/main/resources/db/migration/V39__pedido_turno.sql` | Nuevo: `fecha_pago_confirmado`, `turno_fecha`, `turno_horario_id`, tres índices, `fk_pedido_turno_horario` sin cascada y el `UPDATE` de `fecha_pago_confirmado` desde el historial |
| `entities/Pedido.java` | Tres campos nuevos (`fechaPagoConfirmado`, `turnoFecha`, `turnoHorarioId`) |
| `services/TurnoPedidoService.java` | Nuevo: `asignar(comercioId, instante)` (turno del instante o último terminado dentro de `turno.pago-fuera-franja-dias`, 7 por defecto) |
| `services/PedidoService.java` | `confirmarPagoAprobado` estampa un solo instante en el historial, `fecha_pago_confirmado` y el turno; sobrecarga con instante para los atajos de test; se eliminan el resumen de hoy y sus ayudas |
| `services/ResumenTurnoService.java`, `enums/EstadoResumenTurno.java` | Nuevos: `EN_CURSO`, `TERMINADO` y `SIN_TURNO`; agregación por turno y conteo de pendientes |
| `dto/response/ResumenTurnoResponseDTO.java`, `ResumenTurnoEmpleadoResponseDTO.java`, `TurnoResumenResponseDTO.java` | Nuevos (el DTO del Empleado no lleva `comision` ni `neto`); se borran `ResumenPedidosHoyResponseDTO` y `ResumenPedidosHoyEmpleadoResponseDTO` |
| `controllers/PedidoController.java` | `GET /comercio/resumen-turno` reemplaza a `resumen-hoy` |
| `config/security/DelegacionEmpleado.java` | La ruta delegable cambia (siguen 24) |
| `repositories/PedidoRepository.java` | Agregación del turno y conteo de pendientes |
| `services/TurnoBackfillService.java`, `services/TurnoBackfillRunner.java` | Nuevos: asignación de `turno_*` a los pedidos anteriores, una vez al arrancar y con `turno.backfill.habilitado` |
| `services/TestSupportService.java`, `controllers/TestController.java` | `?ahora=` en `pago-aprobado` y `POST /api/v1/test/jobs/backfill-turnos` |
| `resources/application-test.properties` | `turno.backfill.habilitado=false` |
| Tests Java | Nuevos: `TurnoPedidoServiceTest`, `ResumenTurnoServiceTest`, `PedidoTurnoEstampadoIntegrationTest`, `TurnoBackfillIntegrationTest`, `TurnoEstampadoConcurrenciaIntegrationTest`, `ResumenTurnoHttpIntegrationTest`, `TurnoIntegrationBase`; reescritos `PedidoNoRetiradoServiceTest`, `PedidoNoRetiradoHttpIntegrationTest`, `PedidoServiceVistaEmpleadoTest`, `ClasificacionRutasComercioTest`; ajustados por el constructor de `PedidoService`: `PedidoServiceCarreraTest`, `PedidoServiceConfirmarPedidoLockTest`, `PedidoServiceReembolsoTest`, `PedidoServiceRelojTest` |
| `testing/playwright/tests/71-pedido-turno-api.spec.ts`, `72-pedido-turno-backfill-api.spec.ts` | Nuevos |
| `testing/playwright/tests/21`, `37`, `47`, `50`, `59` y `helpers/backend.ts` | Ruta y campos nuevos |
| `testing/playwright/scripts/build-pedido-turno-tramoT2-postman.mjs` | Nuevo: carpeta `74` de Newman (va última) |
| `testing/playwright/scripts/build-empleado-tramoE2-postman.mjs`, `build-multicomercio-tramo1-postman.mjs`, `build-pedidos-no-retirado-tramoE3-A4b-postman.mjs`, `build-empleado-tramoE3-A5-postman.mjs` | Ruta y campos nuevos (carpetas 57, 49, 64 y 66); la carpeta 17 se parchó a mano en la colección |
| `testing/playwright/scripts/stress-locks-tramoTurnos.mjs`, `correr-estreses.mjs`, `stress-locks-empleado-e2.mjs`, `stress-locks-tramoE3-A4b.mjs` | Estrés nuevo (5 escenarios) y lectura de `resumen-turno` en los dos existentes |
| `postman/Bajonea-MVP.postman_collection.json` | Carpeta 74 y las carpetas 17, 49, 57, 64 y 66 ajustadas |
| `docs/PLAN-FASE2-T2.md`, `docs/PROGRESO-FASE2-T2.md` | Plan y avance |

## Entrega B: frontend y tests de UI (sin commit)

| Archivo | Cambio |
|---|---|
| `frontend/js/turno-resumen.js` | Nuevo: `normalizarResumenTurno` (el desglose se decide por la presencia de `comision` y `neto`), `textoRotuloTurno`, `renderResumenTurno` (rótulo, barra de tres columnas y desglose plegable), `programarRecargaAlFinDelTurno` |
| `frontend/js/comercio.js` | El panel llama a `/pedidos/comercio/resumen-turno` y usa el módulo nuevo; se eliminan `normalizarResumen` y `renderMetricas` ("Facturado hoy", "Ventas de hoy" y "Pedidos hoy" ya no existen) |
| `frontend/js/fechas.js` | `milisegundosHasta`: milisegundos hasta una fecha del servidor con la hora de pared de la zona del comercio |
| `frontend/css/styles.css` | `.resumen-turno`, `.turno-rotulo*` y `.desglose-turno*` |
| `testing/playwright/tests/73-pedido-turno-ui.spec.ts` | Nuevo (19 tests) |
| `testing/playwright/tests/38-empleado-acceso-ui.spec.ts` | Rótulos y ruta nuevos; el Dueño ve el desglose y el Empleado no |
| `docs/DATA-TESTID-FASE17.md` | `turno-rotulo`, `turno-estado`, `metrica-*` y `desglose-turno-*` |
| `docs/DECISIONES.md`, `docs/diccionario-de-datos.md` (v1.24), `docs/APRENDIZAJES-TECNICOS.md`, `docs/CONCURRENCIA-Y-TRANSACCIONES.md`, `docs/LISTA-DE-DESPLIEGUE.md`, `CLAUDE.md` | Documentación del tramo |
| `docs/entregables-01-02/` (`CAMBIOS.md`, `diccionario-de-datos.md`, requisitos funcionales del Comercio, del Dueño y del Empleado, historias de usuario del Comercio, del Dueño y del Empleado) | Versiones nuevas de los documentos de `01.` y `02.` (Diego las copia a mano) |

`frontend/comercio-dashboard.html` y el backend no cambian en la entrega B.
