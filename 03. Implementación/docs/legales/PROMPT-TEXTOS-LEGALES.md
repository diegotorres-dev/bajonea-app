# Prompt para Claude Code: textos legales (Términos, Privacidad y Preguntas frecuentes)

Antes de pegarlo: copiá los tres archivos de texto (`TERMINOS-Y-CONDICIONES.md`, `POLITICA-DE-PRIVACIDAD.md`, `PREGUNTAS-FRECUENTES.md`) a `03. Implementación/docs/legales/`. Son la fuente de los textos y ya vienen sin la nota interna y sin domicilio.

---

## Contexto

Bajoneá cierra la Fase 5 (último commit `5939e1d`). Antes de la interfaz de escritorio hay que publicar los textos legales como páginas reales. Hoy `terminos.html` y `privacidad.html` existen como páginas provisorias de unos 2 KB. `faq.html` no existe. Los tres textos definitivos están en `docs/legales/` (Markdown, versión 1.0, 4 de noviembre de 2026). Este tramo no toca el backend ni la base de datos.

## Reglas (las de `CLAUDE.md`, más estas)

- Cero comentarios en `.html`, `.css`, `.js`, `.mjs` y `.ts`.
- `textContent`, nunca `innerHTML`. Sin anchors con `#` en las URLs. Sin JWT en URLs.
- Git solo en lectura. Nada de `checkout`, `restore`, `reset --hard` ni `clean`. No commitees: lo hace Diego.
- Si un hook o un permiso bloquea una acción, frená y preguntá. No lo esquives.
- Pruebas automáticas solo contra `bajonea_test`. No te conectes a `bajonea_practicas3`.
- Textos de interfaz cortos. Español con voseo.
- Aplicar las heurísticas de Nielsen donde correspondan (ver "Decisiones cerradas").

## Decisiones cerradas (Diego las confirmó)

1. **Domicilio fuera.** Los textos legales muestran solo el nombre del responsable (Diego Nicolás Torres Velásquez) y el email `info@bajonea.ar`. Ya está resuelto en los `.md` de `docs/legales/`. No lo vuelvas a agregar.
2. **Fidelidad al texto.** Convertí los `.md` a HTML sin reescribirlos, resumirlos ni cambiar el sentido. Si algo del texto no coincide con lo que hace el código, no lo corrijas por tu cuenta: reportalo en el informe (ver Bloque 0).
3. **Tres páginas públicas** (no piden sesión), en la raíz de `frontend/`, con el mismo estilo mobile (375 px) que el resto: `terminos.html`, `privacidad.html` y `faq.html`. Las dos primeras reemplazan a las provisorias. Si la convención de carpetas del proyecto indica otro lugar, usá esa y avisá en el informe.
4. **Nielsen aplicado a estas páginas:**
   - Visibilidad: título y "Versión 1.0 · Última actualización" a la vista; en la FAQ, el estado abierto o cerrado de cada pregunta bien marcado.
   - Mundo real: el lenguaje del texto, sin jerga técnica.
   - Control y libertad: botón "Volver" en la cabecera que regresa a la pantalla de origen (si no hay historial, a `login.html` o `index.html` según haya sesión).
   - Consistencia: mismas clases, cabecera, tipografía y espaciado que el resto de la app. Reutilizá lo que ya existe en `css/styles.css` antes de crear clases nuevas.
   - Reconocimiento: pie de página con los tres enlaces (Términos, Privacidad, Preguntas frecuentes) en las tres páginas, con la actual marcada.
   - Diseño minimalista: bloque "En pocas palabras" destacado arriba, secciones numeradas y legibles, sin adornos.
   - Ayuda: en la FAQ, agrupar por "Para Clientes", "Mi cuenta", "Soporte" y "Para Comercios", y cerrar con un enlace a Soporte ("¿No encontraste tu respuesta? Escribinos a Soporte").
   - Sin índice con anchors `#`. Para la FAQ usá acordeones con `<details>` y `<summary>` (accesibles con teclado, sin JavaScript).
5. **Enlaces nuevos:**
   - Pie con los tres enlaces en `login.html`, `registro-tipo-cuenta.html`, `registro-cliente.html` y `registro-comercio.html`.
   - En Soporte (`soporte.html` y, si aplica, `soporte-consulta.html`): la frase "Si tenés dudas sobre tus datos, leé nuestra Política de privacidad." con enlace a `privacidad.html`, y un enlace a `faq.html` antes del formulario.
   - Los enlaces a Términos y Privacidad de la casilla de aceptación del registro (y de `invitacion-empleado.html`) tienen que abrirse en una pestaña nueva (`target="_blank"` con `rel="noopener noreferrer"`) para no perder lo que la persona ya cargó en el asistente. Si hoy navegan en la misma pestaña, corregilo.
6. **Sin funciones nuevas.** Sin buscador, sin modo oscuro, sin versionado dinámico. Si ves algo que valga la pena, listalo en el informe.

## Tareas

### Bloque 0: auditoría de solo lectura (no cambies nada)

1. Leé `terminos.html` y `privacidad.html` actuales, `css/styles.css` y una pantalla pública parecida (por ejemplo `soporte.html`) para copiar su estructura de cabecera, contenedor y pie.
2. Buscá con `grep` todos los lugares que hoy enlazan a `terminos.html` y `privacidad.html` (HTML y JS) y cómo abren el enlace.
3. Buscá los tests de Playwright y los `data-testid` que dependan de las páginas provisorias o de la casilla de términos.
4. Verificá contra el código las reglas numéricas que dicen los textos y listá cualquier diferencia: pedido sin respuesta vence a los 30 minutos; entrega a domicilio se marca sola a los 90 minutos; reclamo dentro de 7 días corridos; hasta 3 consultas por día y 3 abiertas por email; 20 mensajes por consulta y 1000 caracteres por mensaje; inactivación a los 3 meses; edad mínima de 14 años; máximo de 3 cambios de nombre de usuario cada 30 días; 3 reenvíos de un comercio rechazado.
5. Línea de estado al terminar: "bloque 0 completo".

### Bloque 1: las tres páginas

1. Convertí los tres `.md` a HTML semántico (`<main>`, `<section>`, `<h1>`, `<h2>`, listas, `<details>` en la FAQ). El contenido va escrito en el HTML: es texto fijo, no datos del sistema.
2. Usá `data-testid` consistentes con la convención del proyecto (por ejemplo `legal-terminos`, `legal-privacidad`, `legal-faq`, `legal-pie`, `legal-volver`, `faq-pregunta`).
3. CSS: solo lo imprescindible, en `css/styles.css` o en la hoja que corresponda según la convención. Tipografía legible, interlineado cómodo, contraste suficiente, zonas táctiles de al menos 44 px en los enlaces y en los `<summary>`.
4. El botón "Volver" va con JavaScript mínimo en un archivo propio (por ejemplo `js/legal.js`), sin comentarios. Si ya existe un helper de "volver", usalo.
5. Línea de estado: "bloque 1 completo".

### Bloque 2: enlaces desde el resto de la app

1. Implementá los enlaces de la decisión 5. Reutilizá el estilo de los enlaces secundarios que ya existen en `login.html`.
2. No cambies la lógica de los formularios ni los ids existentes.
3. Línea de estado: "bloque 2 completo".

### Bloque 3: pruebas

1. Un spec nuevo de Playwright (siguiente número libre), viewport 375 px, que verifique: las tres páginas cargan sin sesión; cada una muestra su título y la versión; el pie navega entre las tres; "Volver" regresa a la pantalla de origen; los acordeones de la FAQ abren y cierran con teclado; los enlaces de la casilla de términos del registro abren pestaña nueva y no pierden lo cargado; el enlace de Soporte lleva a la política; no hay contenido con `Cámpora` ni con `Nota para Diego` en ninguna de las tres.
2. Corré la suite completa. Antes de cada corrida: `node testing/playwright/scripts/entorno-test.mjs preparar`. Compará contra la línea base (flake conocido: 27:497, y a veces 06:89 y 23:235, que pasan al repetir).
3. Si algún spec existente depende de las páginas provisorias y se rompe, ajustalo y reportalo en el informe como "test existente cambiado".
4. Línea de estado: "bloque 3 completo".

### Bloque 4: documentación

Actualizá `docs/DECISIONES.md`, `docs/APRENDIZAJES-TECNICOS.md`, `docs/DATA-TESTID-FASE17.md`, `docs/codigo-actual.md` y `docs/entregables-01-02/CAMBIOS.md`, y creá `docs/MAPEO-ARCHIVOS-TRAMO-TEXTOS-LEGALES.md`. No edites los documentos de las carpetas `01.` y `02.`. Dejá los entregables en `docs/entregables-01-02/`.

## Fuera de alcance

- Backend, base de datos y migraciones.
- La interfaz de escritorio (viene después).
- Versiones por idioma, buscador, analítica, cookies o banners de consentimiento.
- Revisión legal del contenido (la hará un abogado a futuro).
- Commit y push.

## Informe final

1. Resumen breve.
2. Archivos creados y modificados.
3. Resultados de las pruebas contra la línea base.
4. Diferencias entre los textos y el comportamiento real del código (Bloque 0, punto 4), con tu recomendación para cada una.
5. Tests existentes cambiados.
6. Decisiones no previstas.
7. Preguntas abiertas, con recomendación.
