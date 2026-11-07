# Mapeo de archivos — Textos legales: Términos, Privacidad y Preguntas frecuentes (2026-11-06)

Solo frontend y pruebas. Sin backend, sin base de datos y sin migraciones. Las fuentes de los textos (versión 1.0, 6 de noviembre de 2026; antes 4 de noviembre, ver "Corrección del 2026-11-06" al final) viven en `docs/legales/`.

## Qué hace

- `terminos.html` y `privacidad.html` dejan de ser páginas provisorias y publican los textos definitivos; `faq.html` es nueva. Las tres son públicas (no piden sesión), a 375 px, con el mismo estilo del resto de la app.
- Cada página: cabecera con "Volver" y un título corto ("Información legal" o "Ayuda"), título, "Versión 1.0 · Última actualización: 6 de noviembre de 2026", bloque "En pocas palabras" (Términos y Privacidad), secciones numeradas y un pie con los tres enlaces (la página actual marcada con `aria-current="page"`). Sin índice con `#`.
- La FAQ agrupa las preguntas en "Para Clientes", "Mi cuenta", "Soporte" y "Para Comercios" con acordeones `<details>`/`<summary>` (sin JavaScript; abren y cierran con Enter y Espacio) y cierra con "¿No encontraste tu respuesta? Escribinos a Soporte".
- "Volver" (`js/legal.js`): `history.back()` si hay historial; si no (la página se abrió en una pestaña nueva desde la casilla de términos), al login sin sesión o a `index.html` con sesión.
- Pie con los tres enlaces en `login.html`, `registro-tipo-cuenta.html`, `registro-cliente.html` y `registro-comercio.html` (clase `legal-pie--sitio`, debajo del `<main>`).
- Soporte (`soporte.html`): ya tenía "Si tenés dudas sobre tus datos, leé nuestra Política de privacidad."; se suma "¿Tenés una duda frecuente? Mirá las Preguntas frecuentes." antes del formulario.
- Los enlaces de la casilla de aceptación (registro de Cliente, de Comercio, alta adicional e invitación) ya abrían pestaña nueva; ahora llevan `rel="noopener noreferrer"`.

## Archivos

| Archivo | Cambio |
|---|---|
| `frontend/terminos.html` | Reescrita con el texto definitivo (16 secciones) |
| `frontend/privacidad.html` | Reescrita con el texto definitivo (11 secciones) |
| `frontend/faq.html` | Nueva: 4 grupos y 32 preguntas |
| `frontend/js/legal.js` | Nuevo: botón "Volver" |
| `frontend/css/styles.css` | Clases `legal-*` y `faq-*` al final del archivo (reutiliza `app-header`, `title-lg`, `section-heading`, `legal-texto` y `link`) |
| `frontend/login.html`, `registro-tipo-cuenta.html`, `registro-cliente.html`, `registro-comercio.html` | Pie con los tres enlaces |
| `frontend/js/soporte.js` | Enlace a las Preguntas frecuentes antes del formulario |
| `frontend/js/form-utils.js` | `rel="noopener noreferrer"` en los dos enlaces de la casilla de términos |
| `testing/playwright/tests/100-textos-legales-ui.spec.ts` | Spec nuevo (18 tests, 375 px) |
| `testing/playwright/tests/64-registro-comercio-fase1-ui.spec.ts` | Test existente cambiado: título y versión definitiva en vez del aviso provisorio; `rel` esperado `noopener noreferrer` (3 aserciones) |

## `data-testid`

Páginas: `legal-terminos`, `legal-privacidad`, `legal-faq` (el `<main>`), `titulo-terminos`, `titulo-privacidad`, `titulo-faq`, `legal-version`, `legal-resumen`, `legal-volver`, `legal-pie` y `legal-pie-terminos`, `legal-pie-privacidad`, `legal-pie-faq`; FAQ: `faq-pregunta` (un `<summary>` por pregunta), `faq-ayuda`, `faq-enlace-soporte`; Soporte: `texto-faq`, `enlace-faq`.

## Decisiones

1. Los textos se convirtieron sin reescribirlos; solo se agregaron `mailto:` al correo `info@bajonea.ar` y, en Términos, un enlace a la Política de Privacidad donde el texto la nombra (sección 9).
2. Se mantuvieron `titulo-terminos` y `titulo-privacidad` para no romper los tests existentes; el título del `<h1>` pasó a ser el largo del texto ("Términos y Condiciones de Uso de Bajoneá").
3. Pie de las pantallas de acceso en dos filas a 375 px (tres enlaces de 13 px no entran en una).
4. Diferencias entre los textos y el código: ver `docs/DECISIONES.md`, 2026-11-06. No se corrigieron.

## Corrección del 2026-11-06 (tres frases y fecha)

Solo textos y documentación. Sin backend, base de datos ni migraciones.

| Archivo | Cambio |
|---|---|
| `docs/legales/TERMINOS-Y-CONDICIONES.md` y `frontend/terminos.html` | Fecha 6 de noviembre de 2026; sección 3, la viñeta de roles dice "una cuenta de Cliente y, por invitación, Empleado en comercios ajenos; los Dueños no pueden ser Empleados" |
| `docs/legales/PREGUNTAS-FRECUENTES.md` y `frontend/faq.html` | Fecha; "Olvidé mi contraseña" habla de un código de 6 dígitos que vale 30 minutos; "Mi cuenta figura como inactiva" dice "Iniciá sesión y tocá 'Reactivar mi cuenta'" |
| `docs/legales/POLITICA-DE-PRIVACIDAD.md` y `frontend/privacidad.html` | Solo la fecha |
| `testing/playwright/tests/100-textos-legales-ui.spec.ts` | Test existente cambiado: la constante `VERSION` espera la fecha nueva |
| `docs/LISTA-DE-DESPLIEGUE.md` | Los textos dejan de ser provisorios; queda pendiente la revisión de un abogado antes de abrir al público |
| `docs/entregables-01-02/alcance-y-limitaciones.md` | Nueva limitación: Dueño + Cliente en una misma cuenta no está construida |
| `docs/entregables-01-02/CAMBIOS.md` | Entrada de esta corrección |
| `docs/APRENDIZAJES-TECNICOS.md` | La corrida completa de Playwright necesita el Mercado Pago simulado y `ADMIN_PASSWORD` |
| `docs/DECISIONES.md` | Entrada del 2026-11-06 con la corrección y las diferencias que quedan |

## Ajustes finales del 2026-11-06 (siete cambios de redacción y dos pendientes de documentación)

Solo textos y documentación. Sin backend, base de datos ni migraciones.

| Archivo | Cambio |
|---|---|
| `docs/legales/TERMINOS-Y-CONDICIONES.md` y `frontend/terminos.html` | Sección 5: se agrega que el reembolso a veces demora por una revisión manual; sección 9: se aclara qué pasa con los pedidos a domicilio que ya salieron, con los retiros ya listos (90 minutos, luego No Retirado sin devolución) y con el Dueño suspendido sin Empleados activos |
| `docs/legales/POLITICA-DE-PRIVACIDAD.md` y `frontend/privacidad.html` | Sección 4: se saca "teléfono" de lo que recibe el comercio y se suma la viñeta de Google Fonts; sección 9: una oración que remite a la sección 4 |
| `docs/legales/PREGUNTAS-FRECUENTES.md` y `frontend/faq.html` | "¿Cómo contacto a Soporte?" apunta al formulario público (enlace a `soporte.html`); "¿Puedo pausar mi comercio?" suma "dentro de tu horario"; la pregunta de suspensión suma las reglas de los pedidos a domicilio y de retiro |
| `docs/LISTA-DE-DESPLIEGUE.md` | Pendiente: probar el reparto de un reembolso parcial en el sandbox de Mercado Pago |
| `docs/APRENDIZAJES-TECNICOS.md` | La nota del Mercado Pago simulado nombra la ruta completa del script y su puerto |
| `docs/entregables-01-02/alcance-y-limitaciones.md` | Se corrigen las limitaciones sobre los pedidos durante la suspensión (los pedidos en camino no se completan por la suspensión; el retiro listo se cierra como No Retirado) |
| `docs/entregables-01-02/CAMBIOS.md` y `docs/DECISIONES.md` | Entradas de estos ajustes |
