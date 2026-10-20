# Progreso de la entrega A del tramo T1 de la Fase 2 (2026-10-19)

A2 se omite (Diego: Q1, Q2, Q4, Q6 y Q7 vacías, Q3 solo 00:00-23:59; no hay V39; T2 arranca en V39). A7 incluye el hueco "cerrado a mano sin franjas". La entrega B no empezó.

| Bloque | Estado | Verificado |
|---|---|---|
| A1 Migración V38 y entidad | hecho | V38 aplicada por reset-db sobre bajonea_test (con DROP KEY del índice viejo); SHOW CREATE TABLE ok; el CHECK rechaza hasta < desde; entidad con defaults |
| A3 Repositorio y DisponibilidadComercioService | hecho | findVigentesDesde/In/Pendientes y la variante con bloqueo; cruce, vigencia, turnoDe, ultimoTurnoTerminado, finDelTurno, vigentesEn; `DisponibilidadComercioServiceTurnosTest` 16/16 |
| A4 Validador de franjas | hecho | `ValidadorHorarios` usado por registro, alta adicional, corrección y edición; texto legible con (+1); `ValidadorHorariosTest` 12/12 |
| A5 Servicio y endpoint de edición | hecho | `HorarioEdicionService`, PUT /comercios/perfil/horarios, DelegacionEmpleado en 24 rutas; `HorarioEdicionServiceTest` 10/10, `HorarioEdicionIntegrationTest` 18/18, `HorarioEdicionConcurrenciaIntegrationTest` 4/4 |
| A6 Lecturas y DTOs | hecho | lecturas vigentes en ComercioService, Cierre, MisComercios*, Administrador y TestSupport; DTOs con horariosPendientes, horariosRigenDesde y cruzaMedianoche; listarAprobados en lote |
| A7 Bandera de reapertura y hueco sin franjas | hecho | comercio.reapertura.job-habilitado (false en test); reabrirSiVencido reabre sin franjas con log.warn; tests ajustados |
| A8 Pruebas Java | hecho | `mvnw test` pasada 1: 960 tests, 2 fallos por contrato cambiado (24 rutas y 2 campos nuevos del DTO del Empleado), corregidos y repasados en verde; pasada 2: 6/6 |
| A9 API, Newman y estrés | hecho | Newman completo desde base reseteada: 3443 requests, 5378 assertions, 0 fallos (carpeta 73 de 43 requests); Playwright API: 465 de 469 en la corrida de 24 specs, specs 68 y 69 nuevos 19/19, los 2 fallos (spec 37 por el contrato nuevo y spec 45 por un tope de 300 s con la base cargada) pasan aislados 48/48, y 2 no corrieron por depender del 45; estreses: 20 de 20 en verde, 0 Deadlock found y 0 Lock wait timeout en toda la corrida (80,7 min) |
| A10 Verificación final | hecho | mutaciones M1 a M7 ejecutadas; ver el informe |

Hallazgos durante la entrega A:
- `HorarioEdicionConcurrenciaIntegrationTest` mordió un defecto real de la primera versión: la edición leía `horario` con una consulta común después de esperar el bloqueo del comercio, pero la foto de la transacción se había fijado en la primera lectura (`findById`), así que dos ediciones simultáneas no veían los cambios de la otra (quedaban 15 filas pendientes). Se corrigió leyendo las filas con `FOR UPDATE` (`findVigentesDesdeConBloqueo`).
- `stress-locks-tramoE3-A1.mjs` generaba a veces una contraseña sin dígito (falla propia del script, anterior a este tramo); se le agregó un dígito fijo.
- Contratos que cambiaron de significado y se actualizaron: cierre menor que apertura ahora es válido (turno que cruza) y cierre igual da `400` con el mensaje nuevo (specs 22 y 24, carpetas 9, 35 y 50 de Newman), el DTO reducido del Empleado suma `horariosPendientes` y `horariosRigenDesde` (spec 37, builder de E2 y su carpeta de Newman), y la lista delegable pasa de 23 a 24 rutas (spec 50, carpeta 66).

## Entrega B (pantallas y tests de UI, 2026-10-19)

Decisiones de Diego: M1-A (tarjeta "Rige hoy" / "Desde mañana" más el asistente del registro), M2-B (fila propia "Editar horarios" para el Dueño y el Empleado), M3-A (dos campos de hora y leyenda automática con luna). Nunca "+1": en listas y resúmenes, "20:00 a 02:00 (día siguiente)".

| Bloque | Estado | Verificado |
|---|---|---|
| B1 initHorarios y validación | hecho | módulo nuevo `js/horarios.js` (intervalos de semana circular, leyenda, textos); `comercio-form.js` usa superposición circular, cierre igual rechazado, leyenda por fila y en el horario fijo; spec 70 |
| B2 Vista "Editar horarios" | hecho | `view-editar-horarios` en `comercio-perfil.html`, filas para Dueño y Empleado, `enlazarEdicionDeHorarios` en `comercio.js`; spec 70 |
| B3 Textos en el resto del frontend | hecho | `resumenHorarioHoy` (catálogo, dashboard) con cola de ayer, `admin.js`, "Ver datos del comercio" del Empleado con "Desde mañana"; `ComercioTextoLegible` con "(día siguiente)" y su test |
| B4 Pruebas de UI | en curso | spec 70 nuevo; specs afectados 13, 23, 25, 31, 33, 38, 53, 60, 61 |
| B5 Cierre | pendiente | documentación y regresión completa |
