# Mapeo de archivos: Fase 2, tramo T5 (2026-10-24)

Estadísticas del Dueño. Plan en `docs/PLAN-FASE2-T5.md`, avance en `docs/PROGRESO-FASE2-T5.md`, decisiones en `docs/DECISIONES.md` (entradas del 2026-10-24). Sin migración: el diccionario de datos no cambia.

## Entrega A: backend, tests y estrés (commit `248ad6b`)

| Archivo | Cambio |
|---|---|
| `controllers/EstadisticasComercioController.java` | Nuevo: `GET /api/v1/comercios/estadisticas?desde=&hasta=&agrupar=DIA o TURNO`, `ComercioActivo` primero; exclusivo del Dueño (fuera de `DelegacionEmpleado`) |
| `services/EstadisticasComercioService.java` | Nuevo: validaciones, dos consultas nativas, días vacíos en modo día, períodos por turno, totales, neto y ticket |
| `repositories/PedidoRepository.java` | `estadisticasPorTurno` y `estadisticasSinTurno` (nativas, estado como texto por el literal viejo `PENDIENTE`) |
| `enums/CategoriaResultadoPedido.java`, `enums/AgrupacionEstadisticas.java` | Nuevos |
| `dto/response/EstadisticasComercioResponseDTO.java`, `PeriodoEstadisticasResponseDTO.java`, `CifrasEstadisticasResponseDTO.java`, `TurnoEstadisticasResponseDTO.java` | Nuevos |
| `services/ResumenTurnoService.java` | `ESTADOS_FACTURADOS` pasa a público: única lista de "facturable" |
| Tests Java | Nuevos: `CategoriaResultadoPedidoTest`, `EstadisticasComercioServiceTest`, `EstadisticasComercioIntegrationTest`, `EstadisticasComercioHttpIntegrationTest`; `ClasificacionRutasComercioTest` suma la ruta exclusiva |
| `testing/playwright/tests/78-estadisticas-api.spec.ts` | Spec de API nuevo (10 tests) |
| `testing/playwright/scripts/build-estadisticas-tramoT5-postman.mjs`, `postman/Bajonea-MVP.postman_collection.json` | Carpeta `77` de Newman (va última) |
| `testing/playwright/scripts/stress-locks-tramoEstadisticas.mjs`, `correr-estreses.mjs` | Estrés nuevo (id `estadisticas`) con escenario de volumen |

## Entrega B: pantalla y tests de UI (sin commit)

| Archivo | Cambio |
|---|---|
| `frontend/comercio-estadisticas.html` | Nueva: página propia del Dueño (barra superior con volver, franja del comercio, chips de rango, contenido y navegación inferior con "Panel" activo) |
| `frontend/js/estadisticas.js` | Nuevo: `initComercioEstadisticas` (guard `exigirDueno`; dos consultas por rango, `DIA` y `TURNO`, guardadas en memoria; cifras, gráfico de barras, detalle del día, resultados, esqueleto, error con reintento y estado sin datos) |
| `frontend/js/comercio.js` | `montarEnlaceEstadisticas`: crea el enlace `btn-estadisticas` bajo `metrics-row` solo si `esContextoDueno()` |
| `frontend/js/api.js` | `comercios/estadisticas` suma a `RUTAS_DEL_DUENO` (manda `X-Comercio-Id`) |
| `frontend/js/fechas.js` | `sumarDias` y `diaDeLaSemanaDe` |
| `frontend/js/turno-resumen.js` | `formatearPrecio` se exporta |
| `frontend/css/styles.css` | Clases `enlace-estadisticas*` y `estadisticas-*` (cifras, gráfico, eje, detalle, turnos, resultados, vacío, error, esqueleto) |
| `testing/playwright/tests/79-estadisticas-ui.spec.ts` | Spec nuevo: 14 tests (enlace del Dueño y ausencia para el Empleado, cifras contra la API, resultados, una barra por día con aria-label, detalle y turnos, sin turno asignado, turno que cruza la medianoche, cambio de rango, vacío con y sin botón, teclado, error y reintento, 375 px) |
| `docs/` | `CLAUDE.md`, `DECISIONES.md`, `APRENDIZAJES-TECNICOS.md`, `DATA-TESTID-FASE17.md`, `PROGRESO-FASE2-T5.md`, `entregables-01-02/` (requisitos y HU-D14 del Dueño, `CAMBIOS.md`), `testing/playwright/README.md` |
