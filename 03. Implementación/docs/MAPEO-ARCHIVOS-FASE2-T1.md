# Mapeo de archivos: Fase 2, tramo T1 (2026-10-19)

Turnos que cruzan la medianoche y edición de horarios. Plan en `docs/PLAN-FASE2-T1.md`, avance en `docs/PROGRESO-FASE2-T1.md`, decisiones en `docs/DECISIONES.md` (entrada del 2026-10-19). La entrega A (backend y tests) está en el commit `f59c95a`; esta lista detalla la entrega B (frontend y tests de UI) y el texto legible del backend.

## Entrega B: frontend y tests de UI (sin commit)

| Archivo | Cambio |
|---|---|
| `frontend/js/horarios.js` | Nuevo: etiquetas de los días, intervalos de una semana circular, superposición entre franjas, `textoRango` ("20:00 a 02:00 (día siguiente)"), leyendas de cruce, mensaje de conflicto estable y la franja de hoy con la cola de ayer |
| `frontend/js/comercio-form.js` | `initHorarios` usa la superposición circular y rechaza el cierre igual a la apertura; leyenda de cruce en cada fila y en el horario fijo; resumen con "(día siguiente)" |
| `frontend/js/comercio.js` | `enlazarEdicionDeHorarios` (tarjeta "Rige hoy" / "Desde mañana", guardar, cancelar el cambio, errores `400` y `409`); "Ver datos del comercio" del Empleado con el cambio programado |
| `frontend/comercio-perfil.html` | Filas "Editar horarios" (Dueño y Empleado) y la vista `view-editar-horarios` |
| `frontend/js/catalogo.js` | `resumenHorarioHoy` usa `textoRango` y suma la cola de ayer ("Hasta las 02:00") |
| `frontend/js/admin.js` | El modal del comercio y la comparación antes/ahora muestran "(día siguiente)" |
| `frontend/css/styles.css` | `.leyenda-cruce`, `.horarios-vigencia*`, `.horarios-aviso-vigencia` |
| `backend/src/main/java/com/bajonea/backend/util/ComercioTextoLegible.java` y su test | "(+1)" pasa a "(día siguiente)" |
| `testing/playwright/tests/70-horarios-edicion-ui.spec.ts` | Nuevo (10 tests) |
| `docs/DATA-TESTID-FASE17.md`, `docs/diccionario-de-datos.md` (v1.23), `docs/DECISIONES.md`, `docs/APRENDIZAJES-TECNICOS.md`, `docs/CONCURRENCIA-Y-TRANSACCIONES.md`, `docs/LISTA-DE-DESPLIEGUE.md`, `CLAUDE.md` | Documentación del tramo |
