# Mapeo de archivos — Tramo E2: Administrador en escritorio

Fecha: 2026-11-12. Solo frontend y pruebas: el backend no cambió, no hay endpoints ni migraciones nuevas. Pendiente de la confirmación de Diego (sin commit).

## Alcance

Todo el panel del Administrador (18 páginas `admin-*.html`) tiene composición de escritorio a partir de 1024 px: barra lateral oscura con navegación, tablas reales, lista con detalle en Soporte, revisión de documentos en dos paneles, tarifas en dos columnas con hoja de confirmación. Debajo de 1024 px la versión móvil no cambia (tres excepciones acordadas, ver más abajo).

## Archivos nuevos

| Archivo | Para qué |
|---|---|
| `frontend/js/admin-shell.js` | Se carga en las 18 páginas. `renderAdminNav` arma la barra lateral (12 ítems, insignias con sondeo de 15 s solo en escritorio, cierre de sesión con confirmación) y `enlazarVolver` resuelve `data-volver` (T11). |
| `frontend/js/tabla-admin.js` | `crearEncabezadoTabla(variante, columnas, testid)`: encabezado `hidden` + `aria-hidden` que solo se muestra en escritorio. |
| `frontend/css/escritorio-admin.css` | Shell, barra lateral, cabecera de página y panel. |
| `frontend/css/escritorio-admin-tablas.css` | Tablas (clientes, dueños, comercios, categorías y tags, reembolsos, equipo, actividad), grillas de tarjetas y alturas de 1024 a 1279 px. |
| `frontend/css/escritorio-admin-paginas.css` | Documentos, revisión en dos paneles, Soporte, Tarifas y detalles. |
| `testing/playwright/tests/helpers/admin-escritorio.ts` | `prepararEscenarioAdmin`: comercio operativo con equipo, pedidos y documentos, tres pendientes, una re-solicitud, consultas de Soporte en tres estados, un reclamo y un reembolso fallido. |
| `testing/playwright/tests/131` a `135` | Specs nuevos (ver más abajo). |
| `docs/capturas-escritorio-e2/` | `antes-*` y `despues-*` a 1440 px de las 19 vistas. |

## Archivos modificados

- Las 18 `admin-*.html`: `data-admin-nav`, script `admin-shell.js`, `data-volver` en lugar de `history.back()` (12 páginas), clases en lugar de estilos inline; el panel suma el envoltorio `#admin-alertas` y la cabecera de escritorio; Categorías y Tags suman el botón `Nueva …` de la cabecera; Comercios y Documentos suman la clase de tabla.
- `frontend/css/styles.css` (al final): clases que reemplazan los estilos inline y el área táctil de 44 px (`::after`).
- `frontend/css/escritorio.css`: tres `@import` nuevos.
- `frontend/js/admin.js`: encabezados de tabla, columna de estado de categorías y tags, formulario de tarifa reutilizable (`crearFormularioTarifa`), hoja de confirmación de tarifa con `abrirHoja` (A03), tabla de cambios de la re-solicitud con la marca "Cambió", las alertas del panel dentro de `#admin-alertas`.
- `frontend/js/admin-clientes.js`, `admin-duenos.js`, `admin-documentos.js`, `admin-equipo.js`, `equipo-vistas.js`: encabezados de tabla; documentos suma los títulos de la columna derecha, el desplegable de otros documentos y "Abrir en pestaña nueva".
- `frontend/js/admin-soporte.js`: lista con detalle (solo si la pantalla es de escritorio al cargar).
- `frontend/js/admin-reactivar.js`, `admin-dueno-suspension.js`, `admin-reclamos.js`: skeletons con clases.
- `testing/playwright/tests/18-configuracion-tarifas.spec.ts`: espera la hoja nueva.

## Hallazgos de la auditoría que se resuelven

A01 (navegación del Administrador), A02 parcial (la insignia de Reembolsos en la barra; el panel ya la tenía), A03 (hoja de confirmación de la tarifa), T09 en lo que toca a "Cerrar sesión" y "Ver detalle", T11 en las 12 páginas con `history.back()`.

## Excepciones acordadas a "la móvil no cambia"

1. **T11**: `data-volver` con un destino fijo por página (las 9 listas vuelven al panel; el detalle de una solicitud a Pendientes; el de una re-solicitud a Re-solicitudes; la revisión de un documento a Documentos).
2. **44 px**: "Cerrar sesión" del panel y "Ver detalle" de Comercios amplían su área de toque con `::after` sin mover nada.
3. **A03**: la confirmación de una tarifa nueva (también en el celular) muestra "Antes → Ahora" y el alcance; el botón se llama "Aplicar tarifa".

## Decisiones de composición

- Panel: tarjetas de atención en `repeat(auto-fit, minmax(240px, 1fr))` (hoy tres, a todo el ancho; con cuatro serían cuatro columnas) y la gestión en tres columnas (nueve tarjetas = 3 × 3).
- Reclamos no se pasó a tabla (no estaba en la lista del encargo): conserva sus tarjetas dentro del shell.
- Equipo: la pestaña Solicitudes también lleva encabezado (`Invitado`, `Enviada`, `Estado`).
- Entre 1024 y 1279 px Reembolsos vuelve a tarjetas dentro del shell (ocho columnas no entran en 680 px) y Clientes y Dueños pasan a cinco columnas más angostas.
- Soporte: `pushState` en cada selección (Atrás vuelve a la selección anterior o al estado vacío); el sondeo (15 s) actualiza las tres listas y repinta el detalle solo si no se está escribiendo.

## Pruebas

Ver `docs/DECISIONES.md` (2026-11-12, tramo E2) para las cifras finales. Specs: `131` (barra, panel, anchos, Volver), `132` (tablas y detalles), `133` (documentos, Soporte, Tarifas), `134` (recorridos), `135` (móvil sin cambios). Instantáneas móviles (375, 390 y 700 px, hora fija, 19 páginas): 57 de 57 idénticas píxel a píxel contra el commit anterior servido en otro puerto con los mismos datos; las listas de cajas difieren solo en el panel y en la revisión de documentos por nodos nuevos (el envoltorio de alertas y títulos ocultos de tamaño cero).
