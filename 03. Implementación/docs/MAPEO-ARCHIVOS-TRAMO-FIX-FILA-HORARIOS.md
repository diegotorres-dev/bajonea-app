# Mapeo de archivos — Fila de horarios en pantallas angostas (390px y 360px)

Fecha: 2026-09-30. Objetivo: que en pantallas angostas se lea el día elegido completo, se lean las horas y el botón de quitar se pueda tocar. Sigue a `docs/MAPEO-ARCHIVOS-TRAMO-FIX-IPHONE-WEBKIT.md`. Sin backend ni base de datos.

## Frontend

| Archivo | Por qué |
|---|---|
| `frontend/js/comercio-form.js` | `crearFilaHorario` (componente compartido, lo usan `registro-comercio.html` y `agregar-comercio.html`; no hay otra pantalla que use la fila de horarios): el select del día queda en una línea propia, y debajo van la hora de apertura, una "a", la hora de cierre y el botón de quitar, dentro de un contenedor nuevo `schedule-row__horas`. Se conservan las clases `horario-dia`, `horario-apertura`, `horario-cierre`, `schedule-chip__remove`, el atributo `data-horario-row` y los cuatro `data-testid` (`fila-horario`, `select-dia-horario`, `input-apertura-horario`, `input-cierre-horario`, `btn-eliminar-horario`). Se sacaron los `style="flex:1;"` de los tres bloques (el ancho lo manejan las clases) y el botón de quitar pasa de 32px a 44px de ancho. |
| `frontend/css/styles.css` | `.schedule-row[data-horario-row]` (columna, tarjeta con borde suave `--color-border`, radio `--radius-lg`, padding de 12px), `.schedule-row__horas`, `.schedule-row__horas .input-shell` (`flex: 1`, `min-width: 0`, padding de 12px) y `.schedule-row__separador`. Acotado con el atributo `data-horario-row`: no toca la fila de redes sociales (`data-red-social-row`) ni la fila de `admin.js` que usa `.schedule-row` sin atributo. |

## Tests

| Archivo | Por qué |
|---|---|
| `testing/playwright/playwright.config.ts` | Queda solo con el proyecto `chromium`: `npm test` y `npx playwright test` sin indicar proyecto no intentan WebKit. |
| `testing/playwright/playwright.webkit.config.ts` (nuevo) | Reusa la configuración base y deja solo el proyecto `webkit` (iPhone 13). |
| `testing/playwright/package.json` | Script nuevo `test:webkit`. |
| `testing/playwright/README.md` | Documenta los dos comandos y que WebKit no corre en la máquina de Diego por la directiva de Control de aplicaciones de Windows. |
| Specs | Ninguno necesitó cambios. |

## Documentación

| Archivo | Por qué |
|---|---|
| `docs/DECISIONES.md` | Entrada "Fila de horarios: el día en una línea propia y las horas abajo". |

## Temporal, sin versionar (a decidir)

| Archivo | Por qué |
|---|---|
| `testing/playwright/tmp-capturas/horarios.spec.ts`, `playwright.horarios.config.ts` y `salida-horarios/` | Capturas 390×844 y 360×800 de la fila de horarios en `registro-comercio.html` y `agregar-comercio.html`, antes y después, más las medidas (`medidas-*.json`: ancho de cada elemento, si la hora queda recortada, tamaño del botón de quitar). Borrar si no hace falta. |
