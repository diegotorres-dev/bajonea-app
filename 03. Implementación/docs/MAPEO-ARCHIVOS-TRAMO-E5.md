# Mapeo de archivos — Tramo E5: diferencia de la móvil entre 640 y 1023 px y pulido de acceso y checkout

Fecha: 2026-11-13. Solo frontend, pruebas y documentación: el backend no cambió, no hay migraciones ni endpoints nuevos. Pendiente de la confirmación de Diego (sin commit; el árbol conserva sin commitear los cambios de capturas anteriores).

## Alcance

1. Cerrar la diferencia real de la móvil que encontró la comparación contra `43cf16f`: `overflow: clip` en `.app-shell` (desde `b3e4a74`, E1) hacía pegajoso el pie de acciones entre 640 y 1023 px.
2. Cerrar los hallazgos de `docs/AUDITORIA-NIELSEN.md` que quedaban abiertos de acceso y checkout: P01, P02, P03, P04, C04 y C05. Estos cambian la móvil a propósito (y el escritorio).

## Bloque 1: `overflow: clip` solo en escritorio

`frontend/css/styles.css` vuelve a `overflow: hidden` en el contenedor `.app-shell` desde 640 px (como en `43cf16f`) y `frontend/css/escritorio-base.css` agrega `.app-shell { overflow: clip }` dentro de `@media (min-width: 1024px)`. Todas las variantes de escritorio (`app-shell--escritorio`, `--cliente`, `--lateral`, `--lateral-admin`) ya declaraban `overflow: visible` por su cuenta, así que ahí no cambia nada: la regla nueva solo vale para un `.app-shell` sin variante (el instante antes de que el JavaScript le sume la clase de escritorio), y los `position: sticky` de escritorio siguen funcionando (spec `139`, spec `149`).

## Bloque 2: hallazgos de Nielsen

| Id | Qué se cambió | Archivos |
|---|---|---|
| P01 | Los registros de Cliente y de Comercio piden confirmar el descarte si la persona escribió algo: «¿Descartar los cambios?», con «Descartar» (rojo) y «Seguir editando» (foco inicial). Alcanza a «Volver» del primer paso, «Cancelar», «Salir del registro» y cualquier enlace que saque de la pantalla (también el pie legal), y el navegador avisa al cerrar o recargar la pestaña (`beforeunload`). Se apaga al registrarse con éxito. Solo cuenta lo que la persona escribió (eventos de confianza), no los valores por defecto. | `js/descarte.js` (nuevo), `js/auth.js` |
| P02 | Con sesión iniciada el splash redirige de inmediato (`location.replace`); sin sesión (primera visita) conserva los 900 ms. | `splash.html` |
| P03 | El texto de `verificar-email` dice que el código vence y que se puede pedir uno nuevo. **No dice cuánto**: el valor vive en el backend y el frontend no lo conoce (no se inventó un número). «Reenviar código» y «Pedir un código nuevo» quedan en espera 30 s con cuenta regresiva en el rótulo («Reenviar código (28 s)») después de un reenvío exitoso. Los 30 s son un freno de interfaz, no un dato del servidor. | `js/auth.js` |
| P04 | «Volver al inicio» de las cinco páginas de error resuelve el destino por rol: sin sesión `index.html`, Dueño, Administrador y Cliente en contexto Empleado al panel (el rótulo pasa a «Volver al panel»). «Reintentar» sin `retorno` usa el mismo destino. `acceso-denegado` queda con el mismo botón. | `js/errores.js` (nuevo), `errores/404.html`, `500.html`, `acceso-denegado.html`, `sin-conexion.html`, `timeout.html` |
| C04 | El buscador de Explorar tiene `aria-label`, botón de borrar (44 px, devuelve el foco), contador «N resultados» (`role="status"`) y «Limpiar filtros» cuando hay búsqueda, categoría o tags activos. Reutiliza `.cliente-busqueda__limpiar` y `.cliente-contador`. Las dos filas de chips con scroll horizontal no se tocaron. | `explorar.html`, `js/explorar.js`, `css/styles.css` (`.explorar-resumen*`) |
| C05 | Tocar una modalidad avanza al paso siguiente. Con una sola modalidad el primer paso se saltea (y «Volver» del segundo lleva al carrito; el resumen no ofrece «Editar» modalidad). «Continuar» solo aparece al volver al primer paso con una elección hecha; en escritorio, la acción del resumen se oculta mientras no hay botón principal. | `checkout.html`, `js/checkout.js` |

Cómo se ve: en móvil, el campo de búsqueda suma la cruz a la derecha y, bajo los chips, una fila con el contador a la izquierda y «Limpiar filtros» (naranja) a la derecha; en escritorio es la misma fila a todo el ancho de la grilla. El descarte usa la hoja de siempre (inferior en móvil, diálogo centrado en escritorio).

## Pruebas

Specs nuevos: `147-acceso-pulido-nielsen-ui` (P01 a P04), `148-cliente-explorar-checkout-nielsen-ui` (C04 y C05) y `149-movil-pie-pegajoso-ui` (Bloque 1). Specs existentes cambiados: `05`, `107`, `12`, `139`, `31`, `33`, `76`, `81` y `86` (el paso de modalidad ya no tiene «Continuar» tras elegir; se sacó ese clic y, en `12` y `139`, se reescribieron las aserciones del botón). Resultados en `docs/DECISIONES.md` (2026-11-13, tramo E5).

## Estado de `docs/AUDITORIA-NIELSEN.md` tras E5

| Estado | Hallazgos |
|---|---|
| Resueltos en E5 | P01, P02, P03 (sin cifra de vencimiento), P04, C04, C05 |
| Abierto, requiere backend | C06 («Marcar todas» del Cliente fuera de un comercio: necesita un endpoint de avisos personales) |
| Descartados por decisión de Diego | T08 y K03 |
| Aceptado como limitación | K04 |
| Deuda de despliegue ya anotada | paginación en el servidor del catálogo de comercios y de la lista de Dueños (`docs/LISTA-DE-DESPLIEGUE.md`) |
