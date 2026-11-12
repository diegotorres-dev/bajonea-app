# Mapeo de archivos — Interfaz de escritorio, tramo E0: base y pantallas de acceso (2026-11-08)

> **Corrección (tramo E0b, 2026-11-08):** la composición de las pantallas de acceso que describe este documento (tarjeta centrada de 480 o 720 px) fue rechazada por Diego y se reemplazó en el tramo E0b por la pantalla partida con panel de marca y el asistente con pasos al costado; ver `docs/MAPEO-ARCHIVOS-TRAMO-E0B.md`. De este documento siguen vigentes la base técnica (hojas, capas, foco, hover, imágenes y pruebas) y todo lo que habla de la versión móvil.

Solo frontend y pruebas. Sin cambios de backend ni de colores. La versión móvil no cambia de aspecto ni de comportamiento (ver "Cómo se demostró"). Referencia: `docs/AUDITORIA-ESCRITORIO.md` (2026-11-05) y los mockups aprobados por Diego.

## Qué hace

- [Reemplazado por el tramo E0b] A partir de 1024 px las pantallas de acceso dejan de ser "una pantalla de celular flotando": cabecera blanca de 72 px con el logo a la izquierda, tarjeta centrada de 480 px (formularios cortos) o de 720 px (asistentes de registro y textos legales) con campos en dos columnas, fondo crema de la marca. `bienvenida` es una composición partida (logo naranja a la izquierda, acciones a la derecha) y `registro-tipo-cuenta` muestra las dos tarjetas lado a lado.
- Entre 640 y 1023 px sigue la tarjeta de 460 px de siempre. Debajo de 640 px, la versión móvil sin tocar.
- Las capas compartidas pasan a su forma de escritorio en **todas** las páginas (también en las que todavía no tienen su diseño de escritorio): las hojas son diálogos centrados con fondo oscuro, `.pantalla-completa` es un panel lateral derecho de 520 px (las pantallas de cuenta suspendida o inactiva, un diálogo centrado de 560 px), el visor de documentos y el recorte de foto son diálogos anchos y el toast sale abajo a la derecha.
- Foco visible consistente, estados `:hover` solo con `(hover: hover)`, `chip-row` en varias líneas y shells preparados (lateral para Dueño, Empleado y Administrador; superior para el Cliente) para E1 a E3.

## Archivos nuevos

| Archivo | Qué es |
|---|---|
| `frontend/css/escritorio.css` | Punto de entrada: dos `@import` (base y acceso). Revertir = borrar los `<link>` (o los dos `@import`) |
| `frontend/css/escritorio-base.css` | Capas, foco, hover, `chip-row`, shells `app-shell--escritorio`, `--cliente`, `--lateral`, `--lateral-admin` |
| `frontend/css/escritorio-acceso.css` | Composición de las pantallas de acceso: asistentes en dos columnas, bienvenida partida, enlaces de 44 px |
| `frontend/js/imagenes.js` | `urlImagen(url, uso)` y `pintarImagen(img, url, { uso, diferida })`: transformación de Cloudinary (`f_auto,q_auto,c_limit,w_N`) y `loading="lazy"` |
| `testing/playwright/tests/121-escritorio-base-ui.spec.ts` | 38 tests `@escritorio` de la base |
| `testing/playwright/tests/122-escritorio-acceso-recorridos-ui.spec.ts` | 8 recorridos completos `@escritorio` |
| `testing/playwright/tests/123-escritorio-movil-sin-cambios-ui.spec.ts` | 27 tests de que la móvil no cambió (corre en Chromium a 375 px y en WebKit) |
| `docs/capturas-escritorio-e0/` | Capturas a 1440 px de cada pantalla de acceso (no van al commit) |

## Archivos modificados

- **Todos los HTML** (65, incluidos los 6 de `errores/`): un `<link rel="stylesheet" href="css/escritorio.css" media="(min-width: 1024px)" />` después de `styles.css`.
- **Pantallas de acceso** (`bienvenida`, `login`, `registro-tipo-cuenta`, `registro-cliente`, `registro-comercio`, `verificar-email`, `recuperar-password`, `reactivar-cuenta`, `invitacion-empleado`, `seleccionar-contexto`, `terminos`, `privacidad`, `faq`, `soporte`, `soporte-consulta`, `errores/*`): clase `app-shell--escritorio` (y `--ancho` o `--partido`) en el contenedor; estilos inline de layout pasados a clases; `splash.html` sin su `<style>` (movido a `styles.css`). `registro-comercio.html`: `field--ancha` en calle y localidad.
- **`frontend/css/styles.css`**: tokens nuevos en `:root` (`--sheet-max-width`, `--container-max-width`, `--container-max-width-admin`, `--sidebar-width`, `--topbar-height-desktop`, `--color-border-strong`, `--color-primary-tint`, `--color-sidebar-dark`, `--color-overlay`, `--space-*`, `--fs-*`; ningún valor existente cambió); las capas usan `--sheet-max-width`; `100vh` con respaldo `100dvh` en `body`, `.app-shell` y el zoom de imagen; `overflow: clip` en `.app-shell` desde 640 px (arregla los pies `sticky`); clases nuevas (`u-mt-*`, `u-mb-*`, `field--centrado`, `pila-10`, `chip-row--lineas`, `imagen-avatar-previa`, `app-header__title--en-barra`, `top-bar__espaciador`, `splash-*`...); área táctil de 44 px de los enlaces de pie de formulario.
- **JS**: `catalogo.js` (`renderTopBar` sin `.style.x =`; imágenes con `pintarImagen`), `cliente-form.js`, `comercio-form.js` y `cuenta-inactiva.js` (clases en vez de estilos inline), `carrito.js`, `explorar.js`, `selector-comercio.js`, `invitacion-empleado.js`, `comercio.js` (imágenes con `pintarImagen`).
- **Pruebas**: `playwright.config.ts` (proyecto `chromium` a 390×844 y proyecto `escritorio` a 1440×900 por la etiqueta `@escritorio`), `playwright.webkit.config.ts` (excluye `@escritorio`), `package.json` (`test:escritorio`), `tests/helpers/layout.ts` (verificaciones estructurales), `README.md`.

## Decisiones no previstas

1. **`<link media>` en lugar de `@import` desde `styles.css`.** Un `@import` al tope de `styles.css` queda *antes* en la cascada que el resto del archivo, así que las reglas de escritorio perderían contra reglas de igual especificidad. El costo de carga medido de un `@import` condicionado fue de unos 15 ms frente a un `<link media>` (con 0 y con 100 ms de latencia emulada). Los dos `@import` viven ahora dentro de `escritorio.css`; revertir es quitar el `<link>` de las páginas.
2. **El shell de escritorio es opt-in** (`app-shell--escritorio`). Las páginas de Cliente, Dueño, Empleado y Administrador conservan la tarjeta de 460 px hasta sus tramos (E1 a E3); lo único que cambia en ellas a partir de 1024 px son las capas compartidas, el foco, el hover y el `chip-row`.
3. **El ancho de las páginas de acceso está en dos clases** (`--escritorio` 480 px, `--ancho` 720 px) y las columnas del asistente en la hoja de acceso, no en el HTML.
4. **Estilos inline que se dejaron:** `style="display:none;"` iniciales de los mensajes de error (los activa y desactiva el JavaScript con `style.display`; pasarlos a clase cambiaría la lógica) y los de elementos que arma el JavaScript en tiempo de ejecución (barra de seguridad de contraseña, filas de horario).
5. **Enlaces de texto de 44 px:** en móvil con un área táctil ampliada por `::after` (sin cambiar el ritmo vertical); en escritorio con 44 px reales de alto.
6. **Barra superior pública:** solo logo y botón de volver; los enlaces del Cliente (Inicio, Explorar, Mis pedidos, buscador, carrito) llegan con E3.
7. **Imágenes:** las miniaturas y avatares piden a Cloudinary el ancho justo (160, 240, 960 o 1600 px según el uso). El detalle de cambio de foto del Administrador (antes y ahora) conserva la URL original, porque una prueba la compara literal.

## Cómo se demostró que la móvil no cambió

- 78 capturas (26 páginas y estados × 375, 390 y 700 px) tomadas desde `HEAD` (servido en otro puerto) y desde el árbol de trabajo: idénticas byte a byte, y las cajas (posición y tamaño) de todos los elementos también.
- Los 219 tests de UI que no fijaban viewport pasaron 219/219 a 390×844 antes de tocar nada, y 200/200 de los relacionados con acceso después de las limpiezas.
- Spec `123` (27 tests): medidas del login, tarjeta de 460 px a 700 px, hoja inferior pegada al borde, toast a 90 px, pie `sticky`, 44 px, ausencia de estilos inline de layout en el HTML.

## Verificaciones del Bloque 0

- **`position: sticky` dentro de `.app-shell` con `overflow: hidden` a partir de 640 px: confirmado que falla** (el pie quedaba en `top: 2168` en una ventana de 700 px). Corregido con `overflow: clip`. Verificado a 390, 700 y 1440 px.
- **`@import` condicionado:** ver la decisión 1.
- **Hojas y toasts a 1440 px antes del cambio:** la hoja quedaba pegada al borde inferior de la ventana en una columna de 460 px y el toast encima de ella. Capturas en `docs/capturas-escritorio-e0/bloque0-*`.
