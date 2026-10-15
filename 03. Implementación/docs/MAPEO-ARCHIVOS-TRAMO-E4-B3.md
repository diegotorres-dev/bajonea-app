# Mapeo de archivos — Tramo E4, entrega B3 (pantallas del Administrador: Ver equipo, solo lectura)

Fecha: 2026-10-15. Objetivo: llevar a pantalla las dos lecturas del Administrador que dejó el bloque A3 (`GET /api/v1/administrador/comercios/{id}/equipo` y `/actividad`): el botón "Ver equipo" en el detalle del comercio, la página del equipo (Miembros y Solicitudes) y la página de la Actividad. **Sin cambios de backend, migraciones, Newman ni estreses.** Todo es de solo lectura: ninguna de las tres pantallas tiene un botón que escriba.

## Cómo era la pantalla real antes de esta entrega

El "detalle del comercio" del Administrador no es una página: es el **modal** `modal-detalle-comercio` que se abre desde "Ver detalle" en `admin-comercios.html` (función `mostrarModalDetalleComercio` de `js/admin.js`). Mostraba las secciones de datos del comercio y, al pie, "Suspender" (solo con el comercio `APROBADO` o `APTO_VENTA`) y "Cerrar", **apilados a ancho completo**, no lado a lado. No mostraba ningún dato del equipo. El listado `GET /administrador/comercios` trae solo `APROBADO`, `APTO_VENTA` y `SUSPENDIDO` (no `CERRADO_TEMPORALMENTE`), por lo que desde la lista no se llega al botón de un comercio cerrado temporalmente; la página nueva sí abre cualquier comercio por dirección directa.

## Frontend nuevo

| Archivo | Qué es |
|---|---|
| `frontend/admin-comercio-equipo.html` | Página del equipo (`?id=N`): encabezado con volver (a `admin-comercios.html`), título "Equipo", nombre del comercio y el enlace "Actividad" a la derecha; pestañas con subrayado; lista. |
| `frontend/admin-comercio-actividad.html` | Página de la Actividad (`?id=N`): título "Actividad", nombre del comercio y volver (a la página del equipo). |
| `frontend/js/admin-comercio-nombre.js` | Dos funciones sobre `sessionStorage['bajonea_admin_comercio_nombre']` (`{id, nombre}`): `recordarNombreDelComercio` (la llama el botón "Ver equipo" del modal) y `nombreRecordadoDelComercio(id)` (la leen las dos páginas; devuelve vacío si el id no coincide o el almacenamiento no está disponible). |
| `frontend/js/admin-equipo.js` | `initAdminComercioEquipo` e `initAdminComercioActividad`: carga (esqueleto, error con "Reintentar" salvo en el 404), pestañas Miembros y Solicitudes, chips Activos e Inactivos, filas de miembro (con "En el equipo desde" y la etiqueta del motivo de la baja) y de solicitud ("Invitada el", "Vence en N días"). Usa `requireAdmin` (ahora exportada desde `js/admin.js`): quien no es Administrador va a `login.html`. |
| `frontend/js/equipo-vistas.js` | **Módulo compartido** extraído de `js/equipo-comercio.js`: constantes (estados, filtros, figuras), `mensajeDeError`, `crearLinea`, `crearEstado`, avatares, `crearFilaMiembro` (con `accion`, `estado`, `etiqueta`, `lineaDesde` y `apagado` opcionales), `crearEsqueleto`, las filas, íconos y separadores de la Actividad y la fábrica `crearActividad({ contenedor, ruta, estaVisible })` que arma los cinco chips, la carga por cursor, el vacío, el error y "Ver más". La usan el Dueño y el Administrador. |

## Frontend modificado

| Archivo | Qué cambia y por qué |
|---|---|
| `frontend/js/equipo-comercio.js` | Pasa a importar de `equipo-vistas.js` todo lo compartido (el archivo pasó de 1101 a 755 líneas); la Actividad es ahora `crearActividad(...)` con `iniciar`, `reiniciar` e `invalidar`. La fila del Dueño es `crearFilaDeEquipo`, que llama a `crearFilaMiembro` con el estado y el botón ⋯. Sin cambios de comportamiento ni de testids para el Dueño. |
| `frontend/js/admin.js` | `requireAdmin` se exporta. El botón "Ver equipo" guarda el nombre del comercio antes de navegar. `mostrarModalDetalleComercio` suma: la sección "Equipo" ("2 activos · 1 inactivo", con esqueleto mientras carga; si la lectura falla la sección desaparece), el botón primario "Ver equipo" (un enlace a la página del equipo, con ícono de personas) y los botones "Suspender" y "Cerrar" **lado a lado** debajo (`comercio-modal-acciones`; con el comercio suspendido "Cerrar" ocupa todo el ancho). `cargarResumenEquipo` y `textoResumenEquipo` (singular y plural). |
| `frontend/js/fechas.js` | `fechaCompletaDe` (DD/MM/AAAA). |
| `frontend/css/styles.css` | Al final: `.equipo-header__titulos--con-accion`, `.equipo-header__accion`, `.equipo-tabs-linea`, `.equipo-tab` (+ `__cuenta`), `.equipo-chip__cuenta`, `.equipo-solo-lectura`, `.equipo-avatar--apagado`, `.equipo-motivo` (`--baja` con `--color-error-bg` y `--color-error`; `--renuncia` con `--color-surface-alt` y `--color-text-muted`), `.comercio-modal-equipo`, `.comercio-modal-acciones`, `.equipo-resumen__esqueleto`. Solo tokens que ya existían. |

## Tests

| Archivo | Qué cubre |
|---|---|
| `testing/playwright/tests/60-equipo-administrador-ui.spec.ts` (nuevo, 21 tests) | **Detalle:** Ver equipo arriba (primario, 44 px mínimo) con Suspender y Cerrar lado a lado y el resumen del equipo; comercio suspendido (sin Suspender, Cerrar a ancho completo, "0 activos · 0 inactivos"); falla de la lectura del equipo (el resumen desaparece, el botón sigue). **Miembros:** chips y contadores, Activos por defecto, "Solo lectura", "En el equipo desde", los tres motivos de baja con su etiqueta y clase, avatar apagado; vacíos de cada lista; comercio suspendido y cerrado temporalmente se ven igual; sin el nombre guardado el subtítulo se omite; ninguna acción de escritura en miembros, inactivos ni solicitudes (ni ⋯, ni botones de fila, ni "Invitar"). **Solicitudes:** "Vence en 7 días", "en 3 días" y "en 1 día" con datos reales, "Vence hoy" (respuesta modificada con `page.route`), vencida sin acciones. **Errores:** comercio inexistente e id inválido (sin "Reintentar"), 500 con "Reintentar" y recuperación, sin conexión. **Actividad:** botón "Actividad", cinco chips en dos filas sin scroll horizontal, la línea "Dio de baja a {Nombre}" con el rol "Dueño" y el ícono, vacío, comercio inexistente, "Ver más" con 30+ filas, volver a la página del equipo. **Acceso:** Cliente y Dueño van a `login.html` desde las dos páginas, sin sesión también, y reciben `403` en los endpoints del Administrador. Viewport 375 px. |

Sin cambios en los demás specs: el modal conserva los testids `btn-suspender-comercio` y `btn-cerrar-modal-detalle-comercio` que usan los specs 08 y 17.

## Documentación

`docs/DATA-TESTID-FASE17.md` (sección E4 B3), `docs/DECISIONES.md` (entrada de B3), `docs/entregables-01-02/` (`CAMBIOS.md`, `requisitos-funcionales-administrador.md`, `Historias de Usuario - Administrador.md`).

## Notas

- **Pestañas con subrayado:** el proyecto no tenía un componente de pestañas subrayadas (el del Dueño es un control segmentado). Se creó `.equipo-tabs-linea` con el naranja de marca bajo la pestaña activa. El contador de Solicitudes es una cápsula pequeña (`equipo-tab__cuenta`): el texto accesible queda "Solicitudes 2".
- **Colores:** igual que en B1, los tokens de la aplicación en lugar de una paleta de mockups: el chip seleccionado es `--color-text` con texto blanco, la etiqueta de la baja del dueño usa `--color-error-bg` y `--color-error`, la de la renuncia los grises. Ningún color nuevo.
- **Nombre del comercio:** el endpoint del equipo no lo trae y no hay un endpoint del Administrador que devuelva un comercio por id. La primera versión lo buscaba en `GET /administrador/comercios`, pero con una base grande (la de la suite completa de Playwright) esa lista tarda varios segundos, compite con la carga del equipo y hacía fallar cuatro tests en la corrida completa. Se descartó: el botón "Ver equipo" del modal guarda el nombre en `sessionStorage` (`js/admin-comercio-nombre.js`) y las dos páginas lo leen. Al abrir una página por dirección directa (sin pasar por el modal) o con otro comercio guardado, **el subtítulo se omite** y todo lo demás funciona. Mejora sugerida, fuera de esta entrega por ser de backend: sumar `nombreComercio` a las respuestas de `GET /administrador/comercios/{id}/equipo` y `/actividad`.
- **iPhone / WebKit:** sin probar (deuda declarada).
