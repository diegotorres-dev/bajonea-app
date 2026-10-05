# Mapeo de archivos — Arreglos para iPhone/Safari (WebKit), fase 2

Fecha: 2026-09-30. Objetivo: que los íconos y los campos de formulario se vean y se comporten bien en iPhone, a partir de la auditoría de solo lectura de la Entrega B del multi-comercio (tramo 2). Sin backend ni base de datos.

## Frontend

| Archivo | Por qué |
|---|---|
| `frontend/css/styles.css` | `font-size` de 15px a 16px en `.input-shell input` (402), `.textarea-shell textarea` (473) y `.select-shell select` (505); regla nueva `.schedule-chip__remove svg` de 18×18 (1285) para la "X" de quitar franja horaria y red social; regla nueva `.schedule-row[data-red-social-row] .input-shell { min-width: 0 }` (1249) para que la fila de redes sociales no se desborde con el 16px. |
| `frontend/comercio-productos.html` | El `font-size` inline del buscador de productos del Dueño pasa de 15px a 16px. |

## Tests

| Archivo | Por qué |
|---|---|
| `testing/playwright/playwright.config.ts` | Proyecto `webkit` (`devices['iPhone 13']`) junto al de `chromium`. |
| `testing/playwright/README.md` | Nota: con el proyecto nuevo hay que usar `--project=chromium` mientras WebKit no arranque en esa máquina. |

## Documentación

| Archivo | Por qué |
|---|---|
| `docs/DECISIONES.md` | Entrada "Arreglos para iPhone/Safari (WebKit), fase 2" con verificación, bloqueo de WebKit y deuda. |
| `docs/APRENDIZAJES-TECNICOS.md` | Tres notas: una regla de tamaño por contenedor de íconos, campos de 16px y el bloqueo de WebKit por la directiva de Windows. |

## Temporal, sin versionar (a decidir)

| Archivo | Por qué |
|---|---|
| `testing/playwright/tmp-capturas/` | Script y configuración de las capturas 390×844 (proyectos `chromium-390` y `webkit-iphone`) y la salida (`salida/`: capturas antes y después, comparativas, `fuentes-*.json` con los campos de menos de 16px y `desbordes-*.json`). Sirve para repetir las capturas en WebKit cuando arranque. Borrarla si no hace falta. |
