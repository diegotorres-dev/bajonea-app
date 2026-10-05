# Mapeo de archivos — Fase 3: UX de "Franja rápida" en horarios de atención

Detalle completo de la decisión y de la verificación en `docs/DECISIONES.md`
(entrada "2026-08-31 — Fase 3: UX de 'Franja rápida' en horarios de atención (registro de
comercio)"). Este archivo solo lista qué se tocó y por qué.

## Archivos modificados

### `frontend/registro-comercio.html`

Sección `#step-3` (paso "Horarios de atención" del wizard de registro de Comercio). Se agregó un
bloque nuevo `.quick-schedule` (Modo A, "Franja rápida") arriba de `#horario-list` (Modo B, la
lista manual ya existente, sin cambios):

- Contenedor `.quick-schedule` con título ("Franja rápida"), texto de ayuda, chips de día
  (`L M M J V S D`, uno por `DiaSemana`), inputs `Desde`/`Hasta` (`type="time"`) y botón
  "Aplicar a los días seleccionados".
- Texto "Formato 24 hrs (00:00 a 23:59 hrs)" agregado dos veces: una dentro del bloque de Franja
  rápida, otra debajo del botón "+ Agregar franja" existente (Modo B).
- El resto de `#step-3` (lista manual, botón "+ Agregar franja", botón "Continuar") no cambió de
  posición relativa entre sí — solo quedó debajo del bloque nuevo.

### `frontend/css/styles.css`

Una sola clase nueva: `.quick-schedule` (fondo `--color-primary-soft`, borde `--color-primary`,
`--radius-lg`, padding). Todo lo demás del bloque nuevo reutiliza clases ya existentes en el
proyecto (`.chip` / `.chip-row--wrap` para los chips de día — mismo patrón que los chips de tags
de `comercio-producto-form.html` —, `.field` / `.input-shell` para Desde/Hasta, `.field__hint`
para el texto de formato, `.field__error` para el error local del bloque, `.section-heading` /
`.section-note` para el título y la bajada, `.btn-secondary` para el botón "Aplicar").

### `frontend/js/auth.js`

- Dos constantes nuevas cerca de `LABELS_DIA_SEMANA`: `ORDEN_DIAS_SEMANA` (array con el orden
  Lunes→Domingo) y `LABELS_DIA_SEMANA_CORTO` (una letra por día, para los chips).
- Dentro de `initRegistroComercio()`, un bloque nuevo que arma los 7 chips de día (toggle
  `aria-pressed`, mismo patrón multi-select ya usado en el proyecto para tags de producto) y el
  handler de clic de "Aplicar a los días seleccionados": valida mínimamente (al menos un día
  tildado, ambas horas cargadas), limpia una fila inicial vacía si corresponde (ver
  `docs/DECISIONES.md`, punto 1 de "Decisiones de detalle"), y por cada día tildado genera una
  fila nueva llamando a la función **ya existente** `crearFilaHorario()` — la misma que usa
  "+ Agregar franja" de Modo B.
- `crearFilaHorario()`, `recolectarHorarios()` y la validación del botón `continuar-btn-3` **no
  se modificaron** — Modo B sigue funcionando exactamente igual que antes de esta fase.

## Archivos nuevos

- `docs/MAPEO-ARCHIVOS-FASE3.md` (este archivo).

## Archivos de documentación actualizados

- `docs/DECISIONES.md` — entrada completa de la Fase 3, con las decisiones de detalle UX
  dejadas a criterio de la sesión y la evidencia real de los 7 casos de prueba.
