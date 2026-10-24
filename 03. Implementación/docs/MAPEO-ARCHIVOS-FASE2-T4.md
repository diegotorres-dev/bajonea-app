# Mapeo de archivos: Fase 2, tramo T4 (2026-10-24)

Cierre de turno y email de resumen al Dueño. Plan en `docs/PLAN-FASE2-T4.md`, avance en `docs/PROGRESO-FASE2-T4.md`, decisiones en `docs/DECISIONES.md` (entrada del 2026-10-24). Sin pantallas ni cambios de frontend. La entrega A (backend, tests y estrés) está en el commit `57dd580`; la entrega de cierre (documentación, dos tests de la ventana de cierres viejos, una corrección del spec 77 y la regresión de Playwright) está sin commit.

## Entrega A: backend, tests y estrés (commit `57dd580`)

| Archivo | Cambio |
|---|---|
| `backend/src/main/resources/db/migration/V41__cierre_turno.sql` | Nuevo: tabla `cierre_turno` con `UNIQUE (comercio_id, turno_fecha, horario_id)` y claves foráneas a `comercio` y `horario` |
| `entities/CierreTurno.java`, `enums/EstadoEmailCierreTurno.java` | Nuevos |
| `config/TurnoCierreProperties.java` | Nuevo: `turno.cierre.*` (gracia 30, espera máxima 120, 3 días, 5 intentos, retroceso `10,30,60`, envío vencido 15) |
| `repositories/CierreTurnoRepository.java` | Nuevo: último cierre de cada comercio acotado por `turno_fecha`, cierres por enviar (con comercio, Dueño y horario), reclamo, omisión, resultado, falla con reintento, falla definitiva y recuperación, todos por clave primaria con la condición del estado |
| `repositories/CierreTurnoInsercionRepository.java` | Nuevo: `INSERT` por JDBC; `false` si la clave ya existe |
| `repositories/ComercioRepository.java`, `PedidoRepository.java` | `findElegiblesParaCierreDeTurno`; `existsByComercioIdAndEstadoCreadoAntesDe` |
| `services/CierreTurnoService.java` | Nuevo: `candidatos` (tres consultas, solo lectura) y `cerrar` (una transacción `REPEATABLE_READ` por comercio y turno) |
| `services/CierreTurnoEnvioService.java` | Nuevo: recuperación, reclamo, un mail por Dueño, resultado, retroceso y omisión; escrituras de cada Dueño en una transacción corta |
| `services/CierreTurnoJob.java` | Nuevo: `@Scheduled(fixedDelay = 60_000)`, `abrirYCerrarTurnos(LocalDateTime)`, dos fases independientes |
| `services/ResumenTurnoMensajeBuilder.java`, `ResultadoEnvioEmail.java` | Nuevos: asunto y cuerpo (función pura); resultado del envío |
| `services/EmailService.java` | `enviarResumenTurno` (devuelve el resultado, manda `Idempotency-Key`) y fallas simuladas; los otros cinco métodos comparten el núcleo y siguen igual |
| `services/ResumenTurnoService.java` | `cifras` público (compartido con el panel) |
| `services/DisponibilidadComercioService.java` | `turnosTerminadosEntre` |
| `controllers/TestController.java`, `dto/response/CierreTurnoTestResponseDTO.java`, `resources/application-test.properties` | Atajos `POST /test/jobs/cierre-turnos` (en su propio hilo), `GET /test/cierres-turno`, `PUT /test/email-resumen-turno/fallas`; `turno.cierre.job-habilitado=false` |
| Tests Java | Nuevos: `CierreTurnoServiceTest`, `CierreTurnoEnvioServiceTest`, `CierreTurnoJobTest`, `ResumenTurnoMensajeBuilderTest`, `CierreTurnoIntegrationBase`, `CierreTurnoIntegrationTest`, `CierreTurnoConcurrenciaIntegrationTest`; ampliados `EmailServiceTest`, `DisponibilidadComercioServiceTurnosTest`, `EnumsContraBaseDeDatosIntegrationTest`, `AtajosDeTestFueraDelPerfilTest` (mínimo de atajos 19) |
| `testing/playwright/tests/77-cierre-turno-api.spec.ts`, `helpers/backend.ts` | Spec de API nuevo (13 tests); helpers `ejecutarCierreTurnosTest`, `cierresDeTurnoTest`, `fallasDelEmailDeResumenTest` y `conFallasDelEmailDeResumen` |
| `testing/playwright/scripts/build-cierre-turno-tramoT4-postman.mjs` | Nuevo: carpeta `76` de Newman (va última); no toca el environment |
| `testing/playwright/scripts/stress-locks-tramoCierreTurno.mjs`, `correr-estreses.mjs` | Estrés nuevo (3 escenarios y el de volumen aparte), registrado como `cierres` |
| `postman/Bajonea-MVP.postman_collection.json`, `postman/limpiar-datos-postman.sql` | Carpeta 76; `DELETE FROM cierre_turno` antes de borrar `horario` y `comercio` |
| `testing/playwright/README.md` | Atajos nuevos y la regla de apagar siempre las fallas simuladas |

## Entrega de cierre (sin commit)

| Archivo | Cambio |
|---|---|
| `backend/src/test/java/com/bajonea/backend/services/CierreTurnoRepositoryIntegrationTest.java` | (4 tests; ya está en el commit de la entrega A, pero se agregó después de la pasada completa de Java) cada escritura del envío solo aplica sobre una fila en el estado esperado; la recuperación solo sobre un `ENVIANDO` más viejo que el límite |
| `backend/src/test/java/com/bajonea/backend/services/CierreTurnoIntegrationTest.java` | +2 tests: comercio con el último cierre a 4 días y a 10 días |
| `testing/playwright/tests/77-cierre-turno-api.spec.ts` | La comprobación de la corrida de las 18:00 mira solo el comercio del test (antes afirmaba que no se creaba ningún cierre en toda la base) |
| `testing/playwright/tests/70-horarios-edicion-ui.spec.ts` | El test `el horario fijo avisa si el turno cruza la medianoche` elige el día de la franja rápida como hoy + 2 en la zona de Ushuaia (antes `VIERNES` fijo, que se pisaba con la franja de todo el día de hoy los viernes y los sábados) |
| `CLAUDE.md` | §1bis (ítem del T4), §3 (componentes), §5 (entidad 28) y §9 (pendientes) |
| `docs/DECISIONES.md` | Entrada del 2026-10-24: decisiones de Diego, desvíos del plan, qué turnos se cierran con un último cierre viejo, pruebas, mutaciones, costo y límites |
| `docs/diccionario-de-datos.md` y su copia `docs/entregables-01-02/diccionario-de-datos.md` | v1.26: tabla `CierreTurno` y enum `EstadoEmailCierreTurno` |
| `docs/CONCURRENCIA-Y-TRANSACCIONES.md` | Sección del T4: `cierre_turno` es una hoja, el cierre no bloquea, el envío no sostiene transacción, la recuperación con antigüedad |
| `docs/APRENDIZAJES-TECNICOS.md` | Sección del T4: open-in-view y el atajo del job, `ON DUPLICATE KEY UPDATE`, el piso por último cierre, el índice único con clave foránea, mutaciones con `spawnSync` en Windows |
| `docs/LISTA-DE-DESPLIEGUE.md` | Sección del T4: `TURNO_CIERRE_JOB_HABILITADO=false` en `practicas3`, plan de Resend, `RESEND_API_KEY`, instancia única, `V41`, `turno.cierre.*`, primer arranque, el SQL de reencolado |
| `docs/entregables-01-02/` | `requisitos-funcionales-dueño.md`, `-comercio.md`, `-empleado.md`, `Historias de Usuario - Dueño.md` (HU-D13), `Historias de Usuario - Comercio.md` (HU-CO14) y `CAMBIOS.md` |
| `testing/playwright/README.md` | Spec 77, aislamiento de cuentas, Newman, estrés y mutaciones |
| `docs/PROGRESO-FASE2-T4.md`, `docs/MAPEO-ARCHIVOS-FASE2-T4.md` | Avance y este mapa |
