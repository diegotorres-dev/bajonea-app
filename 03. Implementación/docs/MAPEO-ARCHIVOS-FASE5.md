# Mapeo de archivos — Fase 5 (Producto: foto más grande + zoom con lupa)

Detalle de qué se tocó y por qué, punto por punto. Ver `docs/DECISIONES.md` (entrada del
2026-08-31, "Fase 5: Producto — foto más grande + zoom con lupa...") para el razonamiento
completo y la evidencia de verificación.

## Auditoría previa (sin cambios de código)

`.product-modal-sheet__gallery` (modal con 1 foto) y `.product-gallery__main` (modal con 2+ fotos)
tenían `height: 200px` fijo, mientras que `comercio.js` ya fuerza `aspectRatio: 4/3` en el editor
de recorte para toda foto de producto (Tramo 16.22). El contenedor del modal recortaba
(`object-fit: cover`) una foto que ya llegaba en 4:3 a un rectángulo mucho más chato — causa raíz
real de "se ve demasiado horizontal", no una cuestión de tamaño en sí. Confirmado que ambas clases
son exclusivas de este modal, sin uso en `comercio-productos.html`, `product-row__thumb` (listado)
ni `photo-gallery__item` (editor de subida) — cambio scoped sin riesgo de romper otro componente.

## 5.1 — Contenedor de imagen a 4:3

| Archivo | Cambio | Motivo |
|---|---|---|
| `frontend/css/styles.css` | `.product-modal-sheet__gallery` y `.product-gallery__main`: `height: 200px` → `aspect-ratio: 4 / 3` | Alinea el contenedor con lo que el editor de recorte ya produce (4:3), eliminando el recorte excesivo de `object-fit: cover`. |

Probado contra un producto real (comercio id 16 "camila", producto id 3, 2 imágenes): contenedor
pasó de 200px a 292.8px de alto sobre 390px de ancho (ratio 1.333 = 4:3 exacto), imagen fuente real
1200×900 confirmada por `naturalWidth`/`naturalHeight`.

## 5.2 — Resolución recomendada actualizada

| Archivo | Cambio | Motivo |
|---|---|---|
| `frontend/comercio-producto-form.html` | "Resolución recomendada: 1200 x 900 px (horizontal)" → "... (4:3)" | Los píxeles no cambiaron (1200×900 ya es 4:3, coincide con el editor de recorte) — solo se corrigió el calificativo "(horizontal)", que ya no describe la proporción real del contenedor tras 5.1. Sin validación de proporción en backend que ajustar (`@ValidarUrlCloudinary` solo valida dominio). |

## 5.3 — Botón de lupa con zoom adaptable

| Archivo | Cambio | Motivo |
|---|---|---|
| `frontend/css/styles.css` | Clases nuevas: `.gallery-zoom-btn`, `.image-zoom-backdrop`, `.image-zoom-backdrop img`, `.image-zoom-backdrop__close` | No existía ningún overlay de imagen a pantalla completa en el proyecto para reusar — implementado de cero, reusando el patrón de posicionamiento ya usado en `.product-modal-sheet__close`. |
| `frontend/js/catalogo.js` | `ICONS.zoom` nuevo (lupa). Función nueva `abrirZoomImagen(url)`. Botón `.gallery-zoom-btn` agregado en las 2 ramas de `abrirModalProducto` (1 imagen y 2+ imágenes, usando `mainImg.src`/`img.src` según corresponda) | Comportamiento pedido: overlay con `max-width: 100vw; max-height: 100vh; object-fit: contain` + botón "X", más cierre por click en el fondo — mismo patrón `event.target === backdrop` que ya usan `abrirModalProducto`/`mostrarModalConflictoComercio`. |

Verificado en navegador real: overlay único en el DOM (`z-index: 1100`, por encima del modal de
detalle en `1000`), imagen nunca excede el viewport probado (390×844) ni con la foto real (1200×900)
ni con 3 proporciones sintéticas generadas por `<canvas>` en el momento (vertical 900×1600, cuadrada
1000×1000, muy panorámica 2000×500 — nunca subidas a Cloudinary ni persistidas). Cierre confirmado
por "X" y por click en el fondo; clic sobre la imagen misma confirmado que **no** cierra el overlay.
Tras cerrar el zoom, el modal de detalle de producto original sigue intacto.

## Archivos nuevos

- `docs/DECISIONES.md` — entrada de Fase 5 + entrada de cierre del batch de 22 mejoras (Fases 1-5).
- `docs/MAPEO-ARCHIVOS-FASE5.md` — este archivo.

## Verificación

Backend real corriendo en `:8080` (`bajonea_final`, sin datos de prueba nuevos) + frontend estático
vía `.claude/scripts/dev-server-no-cache.py` en `:5501`. Capturas de pantalla reales del modal de
detalle de producto (5.1 antes/después de proporción, 5.3 con overlay de zoom abierto) tomadas
contra la app corriendo en vivo, viewport mobile 390×844. Texto de 5.2 verificado inyectando el
mismo markup (`<p class="field__hint">`) en una página servida con el CSS real del proyecto —
no se pudo autenticar como Comercio real para ver `comercio-producto-form.html` en vivo (sin
credenciales de prueba disponibles, y crear una cuenta descartable no se justificaba solo para un
cambio de texto estático sin lógica asociada). Sin datos de prueba creados ni modificados en
`bajonea_final` — toda la verificación usó datos reales ya existentes o imágenes sintéticas
descartadas en memoria del navegador.

**Pendiente de confirmación explícita de Diego para dar este punto — y el batch completo de 22
mejoras — por cerrado.**
