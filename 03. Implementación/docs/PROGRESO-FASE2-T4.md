# Progreso de la Fase 2, tramo T4 (email por cierre de turno), entrega A

Una línea por bloque. Estados: pendiente, en curso, hecho.

| Bloque | Estado | Qué se verificó |
|---|---|---|
| A1 migración, entidad, repositorios y propiedades | hecho | reset-db aplicó V41 sobre bajonea_test (flyway 41 success), SHOW CREATE TABLE coincide con el plan, EnumsContraBaseDeDatosIntegrationTest 6/6 con el ENUM nuevo. Alta del cierre por INSERT con captura de clave duplicada (no ON DUPLICATE KEY UPDATE: el conector no distingue inserción de fila existente) |
| A2 EmailService con resultado y armador del mensaje | hecho | EmailServiceTest 13/13 (tres resultados, fallas simuladas, clave de idempotencia, los cinco métodos viejos siguen tragando la excepción); ResumenTurnoMensajeBuilderTest 7/7 con asunto y cuerpo exactos |
| A3 turnos terminados y cifras compartidas | hecho | `turnosTerminadosEntre` (5 tests nuevos: fin exacto, cruce de medianoche, varios días ordenados, versión cerrada por edición, 23:59) y `ResumenTurnoService.cifras` público que usan el panel y el cierre; DisponibilidadComercioService* 20+21, ResumenTurnoServiceTest 9 y ResumenTurnoHttpIntegrationTest 6 en verde sin cambios |
| A4 CierreTurnoService (foto) | hecho | `candidatos` (3 consultas) y `cerrar` (una transacción por comercio y turno, sin bloqueos): CierreTurnoServiceTest 15/15. Desvío del plan: el piso de los candidatos es el fin del último cierre del comercio (no la lista de claves existentes), para que tras el primer cierre de un comercio nuevo no se cierren los 3 días anteriores |
| A5 envío y job | hecho | CierreTurnoEnvioService (recuperación, reclamo por clave primaria, un mail por Dueño, retroceso 10/30/60/60, tope 5, OMITIDO) y CierreTurnoJob (dos fases independientes): CierreTurnoEnvioServiceTest 11/11, CierreTurnoJobTest 7/7. La prueba de concurrencia encontró que la recuperación de un ENVIANDO podía pisar un reclamo reciente: ahora repite la condición de antigüedad |
| A6 atajos de test y limpieza | hecho | POST /test/jobs/cierre-turnos, GET /test/cierres-turno, PUT /test/email-resumen-turno/fallas; turno.cierre.job-habilitado=false en application-test.properties; DELETE de cierre_turno en limpiar-datos-postman.sql; nota en el README de Playwright; AtajosDeTest* 6+3 en verde (mínimo de atajos 19) |
| A7 pruebas Java | hecho (falta la pasada completa en A9) | CierreTurnoServiceTest 15, CierreTurnoEnvioServiceTest 11, CierreTurnoJobTest 7, EmailServiceTest 13, ResumenTurnoMensajeBuilderTest 7, CierreTurnoIntegrationTest 25 (cifras = panel, gracia, total 0, idempotencia, un mail por Dueño, OMITIDO, reintentos, FALLIDO, pago tardío, pagos sin resolver y tope, cruce de medianoche, suspendido, ENVIANDO huérfano, envío sin transacción abierta, corrida programada apagada en el perfil test), CierreTurnoConcurrenciaIntegrationTest 4, AtajosDeTest* y EnumsContraBase en verde |
| A8 API, Newman y estrés | hecho (falta la corrida completa en A9) | Spec 77 (13 tests, 13/13 contra el backend de test), carpeta 76 de Newman (`build-cierre-turno-tramoT4-postman.mjs`, 40 requests, 41 ejecutados, 68 assertions, 0 fallas, va última), `stress-locks-tramoCierreTurno.mjs` (escenarios 1 a 3 por defecto y 4 = volumen con ESCENARIO=4) registrado como `cierres` en el runner; con 2 rondas sin problemas ni Deadlock. Volumen medido con 2000 comercios, 30000 pedidos y 20 Dueños: 16,0 s la corrida que cierra y envía los 2000 (12,0 s cierres, 4,0 s envíos) y 0,7 s la corrida sin nada que cerrar. Una primera medición dio 290 s por un artefacto: el atajo corría el job en el hilo de la petición HTTP y la sesión abierta por la vista (open-in-view) acumulaba las 28000 franjas; ahora el atajo lo corre en su propio hilo, como el programador |
| A9 verificación completa y mutaciones | hecho (pendiente de la confirmación de Diego) | `mvnw clean` + pasada 1 (1127 tests, 0 fallas) + pasada 2 (6 tests, 0 fallas) sobre base reseteada con categoría sembrada. Newman completo sobre base reseteada: 3596 requests, 5592 assertions, 0 fallas, 606 s. Playwright de API (30 specs, workers 1, base reseteada): la primera corrida se cortó (el log terminaba en el spec 30 sin resumen); repetida completa: 437 pasaron, 0 fallaron, 0 inestables, 7,3 min. Estreses: los 22 scripts OK en 53,2 min (`cierres` incluido, 189 s) y carrito aparte con el stub de Mercado Pago OK en 102 s; 0 `Deadlock found` y 0 `Lock wait timeout` en todos los logs del backend. Mutaciones (22, `mutaciones.mjs` con línea base sin mutar de 75 tests que pasó antes de cada tanda): las 22 muerden; archivos restaurados con huellas idénticas y `uq_cierre_turno` y las dos claves foráneas intactos. `CierreTurnoRepositoryIntegrationTest` (4 tests) se agregó porque M11 no la detectaba ningún test existente |

## Mutaciones de A9 (22; la línea base sin mutar, 75 tests de las clases `CierreTurno*` y `ResumenTurnoServiceTest`, pasó antes de cada tanda)

| # | Mutación | Resultado |
|---|---|---|
| M1 | Cerrar sin esperar la gracia | Muerde (5 tests) |
| M2 | Sin diferimiento por `PENDIENTE_PAGO` | Muerde (3) |
| M3 | Sin tope de espera | Muerde (2) |
| M4 | Cifras con otra lista de estados facturables | Muerde (2) |
| M5 | Pendientes dentro del neto | Muerde (2) |
| M6 | No enviar con total cero | Muerde (13) |
| M7 | Un mail por cierre en vez de por Dueño | Muerde (2) |
| M8 | Enviar con la cuenta bloqueada | Muerde (2) |
| M9 | Enviar desde dentro de una transacción | Muerde (1) |
| M10 | Omitir el reclamo por clave primaria (doble envío) | Muerde (5) |
| M11 | Resultado sin la condición `email_estado = ENVIANDO` | Muerde (2, ambos de `CierreTurnoRepositoryIntegrationTest`, test agregado por esta mutación) |
| M12 | No capturar la excepción de un Dueño | Muerde (1) |
| M13 | No avanzar `email_intentos` | Muerde (5) |
| M14 | Retroceso fijo | Muerde (2) |
| M15 | No recuperar el `ENVIANDO` huérfano | Muerde (3) |
| M16 | Ignorar el `UNIQUE` (índice y clave foránea soltados en la base durante la prueba y restaurados) | Muerde (4) |
| M17 | Recorrer 3 días para un comercio sin historial | Muerde (4) |
| M18 | Quitar la bandera del job en el perfil `test` | Muerde (1) |
| M19 | Un comercio que falla frena a los demás | Muerde (1) |
| M20 | Los comercios aprobados sin cuenta de cobro generan cierre | Muerde (2) |
| M21 | Un comercio suspendido sin pedidos también avisa | Muerde (2) |
| M22 | El piso de candidatos ignora el último cierre | Muerde (3) |

Los archivos mutados se restauraron desde copias en memoria y se comprobó la huella de cada uno; `cierre_turno` quedó con `uq_cierre_turno` y sus dos claves foráneas. Dos tandas: la primera dejó 8 como "no aplicable" (los fuentes tienen fines de línea CRLF y el texto buscado tenía `
`) y M16 como "sobrevive" (el índice lo usa una clave foránea y el `DROP INDEX` falló); se corrigió el script y se repitieron esas nueve.

## Entrega de cierre (2026-10-24)

| Punto | Estado | Evidencia |
|---|---|---|
| Qué pasa con un comercio cuyo último cierre es viejo | hecho | `CierreTurnoIntegrationTest` 2/2 corridos solos: con el último cierre a 4 días se cierran los turnos de hoy, ayer y anteayer y el de hace 3 días queda sin cerrar; con el último a 10 días se cierra solo el de hoy. Distinto del plan para el segundo caso: ver `docs/DECISIONES.md`, 2026-10-24 |
| Documentación | hecho | `CLAUDE.md`, `DECISIONES.md`, diccionario v1.26 y su copia, `CONCURRENCIA-Y-TRANSACCIONES.md`, `APRENDIZAJES-TECNICOS.md`, `LISTA-DE-DESPLIEGUE.md`, requisitos del Dueño, del Comercio y del Empleado, historias HU-D13 y HU-CO14, `CAMBIOS.md`, README de Playwright, `MAPEO-ARCHIVOS-FASE2-T4.md` |
| Regresión: Playwright completo | hecho, con 3 fallos explicados | 1161 pasaron, 3 fallaron y 19 no corrieron (26,3 min, base reseteada, `workers: 1`, 0 `Deadlock found`). `27:497`: inestable conocido, pasó aislado. `70:128`: falla los sábados (franja de todo el día de hoy contra el turno de viernes 21:00 a 03:00 del test), preexistente del T1, independiente del T4; dejó sin correr 7 tests de ese spec; corregido después (el test elige el día de la franja rápida como hoy + 2 en la zona de Ushuaia): spec 70 completo (10 tests) y spec 77 completo (13) 23/23 un sábado. `77:140`: defecto de mi spec (aserción global sobre la corrida de las 18:00), corregido; spec 77 aislado 13/13 y junto con 70 y 27: 67 pasaron. Los specs del panel (`73`, `37`, `38`, `52`, `53`) pasaron |
