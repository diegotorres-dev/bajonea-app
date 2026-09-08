# Mapeo pantallas ↔ archivos — Fase 16, Tramo 9 (último de la Fase 16)

Relación exacta entre las 8 pantallas lógicas del catálogo de Fase 15 correspondientes a este tramo (Administrador: categorías y tags) y los archivos generados en `frontend/`. Mismo formato que `docs/MAPEO-ARCHIVOS-TRAMO1.md`–`TRAMO8.md`.

Capturas adjuntadas directamente por el usuario en dos tandas (Parte A: categorías; Parte B: tags), mismo criterio que el Tramo 8 — sin MCP de Figma ni fallback de navegador, por instrucción explícita (cuota y timeout ya documentados en Tramos 5-8).

---

## Parte A — AD: Categorías (5 pantallas lógicas → 1 archivo `.html` nuevo + funciones en `js/admin.js`)

| Pantalla(s) | Archivo | Relación |
|---|---|---|
| AD15 (Listado de Categorías) | `frontend/admin-categorias.html` (+ `js/admin.js`, función `initAdminCategorias`) | Chips `.chip-row`/`.chip` (Todas/Activas/Inactivas, reutilizados tal cual del filtro de pedidos de Comercio, Tramo 7) con conteos reales calculados client-side sobre `GET /categorias`. Filas `.categoria-row` (clase nueva: ícono cuadrado redondeado + nombre + "N productos asociados" + kebab), atenuada/en cursiva vía `.categoria-row--inactivo` cuando `activo=false`. Estado vacío con `.state-page` reutilizado. FAB `.fab` reutilizado tal cual (mismo patrón que `comercio-productos.html`). |
| AD15 (tres puntitos) | Función `mostrarMenuAccionesCategoria` en `js/admin.js` | Bottom sheet `.product-modal-sheet` con `.profile-link-list` (mismo patrón que `mostrarModalAccionProducto` de Comercio, Tramo 6): "Editar categoría" / "Eliminar categoría" (`.profile-link--danger`) / "Cancelar", los 3 como filas de la misma lista — sin botón de cancelar separado, a diferencia del patrón de Comercio, para calcar más de cerca la captura de Figma de este tramo. |
| AD16 (Modal Crear Categoría) | Función `mostrarModalCategoria(null, ...)` en `js/admin.js` | Bottom sheet con `.field`/`.input-shell` (nombre) + `.switch-row`/`.switch` (toggle "Categoría activa", reutilizado tal cual de "Modalidades de entrega" de `comercio-perfil.html`) + `.field__hint`. Toggle en ON por defecto. |
| AD17 (Modal Editar Categoría) | Misma función `mostrarModalCategoria(categoriaExistente, ...)` | Mismo modal que AD16, título/botón condicionados por `esEdicion`, precargado con `nombre`/`activo` reales de la categoría. |
| AD19 (Modal Eliminar Categoría Confirmación) | Función `mostrarModalEliminarCategoria` en `js/admin.js` | **Copy reescrito respecto a la captura de Figma** — ver nota de riesgo más abajo. |

## Parte B — AD: Tags (3 pantallas lógicas → 1 archivo `.html` nuevo, mismo patrón)

| Pantalla(s) | Archivo | Relación |
|---|---|---|
| AD20 (Listado de Tags) / tres puntitos | `frontend/admin-tags.html` (+ `js/admin.js`, función `initAdminTags`, `mostrarMenuAccionesTag`) | Calco exacto de AD15 (mismas clases `.categoria-row`/`.categoria-list`/`.chip-row`, reutilizadas sin duplicar CSS — visualmente idénticas, solo cambia el ícono, `ICONS.hash` en vez de `ICONS.tag`), consumiendo `GET /tags` en vez de `/categorias`. |
| AD21 (Modal Crear Tag) | Función `mostrarModalTag(null, ...)` en `js/admin.js` | Calco de AD16, con placeholder "Ej: Vegano, Sin TACC..." (único agregado propio de este modal, tomado de la captura). |
| AD23 (Modal Eliminar Tag Confirmación) | Función `mostrarModalEliminarTag` en `js/admin.js` | Mismo copy reescrito que AD19 (ver nota de riesgo). |

**Nota sobre "Editar Tag":** la captura de este tramo la etiquetó informalmente como "AD22", pero el catálogo cerrado de `docs/PANTALLAS-MVP-FASE15.md` (§1 y §2.2) reserva `AD22` para la pantalla de "tag bloqueado por estar en uso" — excluida, mismo motivo que `AD18` (categoría bloqueada por uso): esa validación no existe en el backend. El modal de edición de tag no tiene ningún código de capa propio en el catálogo cerrado (a diferencia de `AD17` para categorías); se construyó igual, calcando `AD17`/`mostrarModalCategoria`, porque la funcionalidad de editar (y con ella, reactivar vía el toggle) es simétrica a categorías y necesaria por el mismo motivo.

**Nuevo:** ninguna función nueva compartida entre categorías y tags — se construyeron funciones paralelas (`mostrarModalCategoria`/`mostrarModalTag`, `mostrarMenuAccionesCategoria`/`mostrarMenuAccionesTag`, `mostrarModalEliminarCategoria`/`mostrarModalEliminarTag`, `renderCategoriaRow`/`renderTagRow`) en vez de una única función parametrizada — mismo criterio de "tres líneas similares es mejor que una abstracción prematura" ya aplicado en otros pares de flujos casi idénticos del proyecto (ej. `mostrarModalConfirmarAprobacion` vs `mostrarModalRechazarPedido`, Tramos 7/8). Sí se reutiliza la función `labelCantidadProductos` (genérica, sin acoplarse a "categoría" ni "tag" en su texto).

**Modificado (no nuevo):**
- `frontend/js/admin.js` — tile "Categorías" del dashboard (`initAdminDashboard`) gana `href: 'admin-categorias.html'`; tile "Tags" gana `href: 'admin-tags.html'` (ambos sin href hasta este tramo, ver `docs/MAPEO-ARCHIVOS-TRAMO8.md`). Los tiles "Comercios"/"Clientes" siguen sin href (gap de Fase 15 §2.4, AD07/AD11, sin backend).
- `frontend/css/styles.css` — clases nuevas: `.categoria-list`, `.categoria-row*` (compartidas por categorías y tags). Corrección de un bug real preexistente (ver más abajo): `.field__error svg` gana tamaño explícito.

---

## Gap real de backend encontrado y resuelto con el usuario antes de programar: conteo de productos asociados

AD15/AD20 muestran "N productos asociados" por categoría/tag. Ningún DTO ni endpoint existente exponía ese conteo — `Producto` está scoped por comercio (no hay listado global de productos), así que no era calculable del lado del frontend sin un endpoint nuevo. Confirmado con el usuario (2 opciones planteadas, eligió la primera): se agregó el campo real `cantidadProductos` a `CategoriaResponseDTO` y `TagResponseDTO`, respaldado por 2 finders nuevos:

- `ProductoRepository.countByCategoriaId(Integer categoriaId)`.
- `ProductoTagRepository.countByTagId(Integer tagId)`.

`CategoriaService.aResponseDTO`/`TagService.aResponseDTO` ahora inyectan `ProductoRepository`/`ProductoTagRepository` respectivamente para poblar el campo. Mismo criterio que `MetricasAdminResponseDTO` (Tramo 8): conteo agregado real, sin inventar ningún listado ni lógica de negocio nueva. Sin migración Flyway (no es una columna, es un `COUNT` en tiempo de lectura).

---

## Nota de riesgo confirmada (AD18/AD22, Fase 15 §2.2): sin bloqueo de borrado por uso

`CategoriaService.baja()`/`TagService.baja()` (idéntico patrón, releído antes de programar este tramo) nunca validan si la categoría/tag está en uso por algún producto — siempre hacen baja lógica (`activo=false`) sin bloquear. Confirmado, no es un hueco: es la misma decisión de diseño de Fase 15 (`AD18`/`AD22`, pantallas de "bloqueado por uso", quedaron **fuera** del catálogo cerrado precisamente porque esa regla no existe). `AD19`/`AD23` (modales de confirmación de borrado de este tramo) no simulan ningún bloqueo — el borrado siempre procede.

## Copy reescrito en AD19/AD23 — decisión confirmada con el usuario

La captura de Figma de `AD19` (y por extensión `AD23`, mismo patrón) dice **"Esta acción no se puede deshacer"** con botón "Eliminar definitivamente". Esto es materialmente falso contra el backend real: `baja()` es una baja lógica reversible (`activo=false`), y ya existe `PUT /categorias/{id}/reactivar` / `PUT /tags/{id}/reactivar` desde la Fase 8. Se le presentaron 2 opciones al usuario (reescribir el copy vs. dejar el texto literal de Figma) — eligió reescribir. Texto final:

- Título: "¿Dar de baja esta categoría?" / "¿Dar de baja este tag?"
- Cuerpo: `El/La {tag/categoría} "{nombre}" dejará de estar disponible para asignarse a productos. Podés reactivarlo/la más tarde volviendo a editarlo/la.`
- Botón de confirmación: "Dar de baja" (en vez de "Eliminar definitivamente"), mismo color `var(--color-error)` que ya usaban `mostrarModalConfirmarDescontinuar`/`mostrarModalRechazarComercio`.

La reactivación en sí no tiene un botón dedicado en el menú de 3 puntitos (no hay captura de Figma para ese estado) — se resuelve reutilizando el toggle "Categoría activa"/"Tag activo" del modal Editar (`AD17`/análogo de tag): si el admin lo prende estando en `false`, se llama a `reactivar()` al guardar; si lo apaga estando en `true`, se llama a `baja()`. Mismo criterio para "Nueva Categoría"/"Nuevo Tag" con el toggle en OFF: se crea vía `POST` (que siempre nace `activo=true` en el service) y, si el toggle estaba apagado, se encadena un `DELETE` inmediatamente después.

---

## Bug real encontrado y corregido en el camino: ícono sin tamaño en `.field__error`

Al mostrar el error de nombre duplicado (409 real, "Ya existe una categoría/un tag con ese nombre") se detectó que el ícono SVG dentro de `.field__error` (patrón `${ICONS.xCircle}<span>...</span>`, ya usado desde el Tramo 8 en el motivo de rechazo de comercio, `#rechazo-error`) no tenía tamaño explícito — se renderizaba al tamaño intrínseco del navegador (mucho más grande de lo esperado), igual que el bug ya documentado de `.detail-row svg` en el Tramo 8. Corregido con `.field__error svg { width: 16px; height: 16px; flex-shrink: 0; margin-top: 1px; }` en `css/styles.css` — corrige de paso el mismo ícono en el modal de rechazo de comercio (Tramo 8), sin que ese modal fuera tocado directamente en este tramo.

---

## Probado end-to-end contra el backend real

**Categorías:** alta con toggle ON (categoría queda `activo=true`) y alta con toggle OFF (crear + baja encadenados, confirmado `activo=false` real); edición de nombre; reactivación vía el toggle del modal Editar (confirmado `PUT /categorias/{id}/reactivar` real); baja vía AD19 (confirmado `DELETE /categorias/{id}` real); nombre duplicado → `409` real con el copy correcto; filtros Todas/Activas/Inactivas con conteos reales recalculados en cada cambio; link del tile "Categorías" del dashboard de Administrador.

**Tags:** mismos 7 casos que categorías, contra `GET`/`POST`/`PUT`/`DELETE /tags` reales — alta ON/OFF, edición, reactivación, baja, nombre duplicado (`409`, "Ya existe un tag con ese nombre"), filtros, link del tile "Tags".

Sin errores de consola en ningún paso (`read_console_messages`, ambas partes). Backend reiniciado una vez al principio del tramo para cargar los cambios de `cantidadProductos` (confirmado el `GET /categorias`/`GET /tags` devolviendo el campo nuevo antes de programar el frontend). Datos de prueba creados durante el testing (`Postres Test` en categorías, `Test Tag Tramo9` en tags) eliminados de la base con `DELETE` directo al finalizar cada parte — confirmado con `SELECT` que ambas tablas volvieron a su estado real preexistente (`Comidas Rapidas` / `Vegetariano`, únicas filas reales).

Regla de "cero comentarios en `frontend/`" verificada con `grep` sobre `admin-categorias.html`, `admin-tags.html`, el bloque nuevo de `js/admin.js` y el bloque nuevo de `css/styles.css` — cero coincidencias.

---

## Resumen numérico

| | Cantidad |
|---|---|
| Pantallas lógicas del tramo | 8 (AD15, AD16, AD17, AD19, AD20, AD21, AD23 + AD15/AD20 tres-puntitos) |
| Construidas | 8 |
| Archivos `.html` nuevos | 2 (`admin-categorias.html`, `admin-tags.html`) |
| Funciones nuevas en `js/admin.js` | 8 (`initAdminCategorias`, `mostrarMenuAccionesCategoria`, `mostrarModalCategoria`, `mostrarModalEliminarCategoria`, `renderCategoriaRow`, `initAdminTags`, `mostrarMenuAccionesTag`, `mostrarModalTag`, `mostrarModalEliminarTag`, `renderTagRow`, `labelCantidadProductos` — 11 en total) |
| Endpoints backend nuevos | 0 (los 4 CRUD de categorías/tags ya existían desde la Fase 8/9) |
| Campos de respuesta nuevos | 2 (`cantidadProductos` en `CategoriaResponseDTO` y `TagResponseDTO`) |
| Finders de repositorio nuevos | 2 (`ProductoRepository.countByCategoriaId`, `ProductoTagRepository.countByTagId`) |

Con esto, el Tramo 9 de 9 de la Fase 16 queda cerrado — última pieza de contenido nuevo de la fase. Sigue la verificación global de cierre de Fase 16 (ver `docs/DECISIONES.md`, entrada de esta misma fecha).
