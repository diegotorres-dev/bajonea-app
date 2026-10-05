# Mapeo de archivos — Perfeccionamiento de validaciones: Categoría, Tag, Rechazo de pedido, Aprobación de comercio, Horario individual (2026-09-02)

> Pendiente de confirmación explícita de Diego antes de cerrarse. Ver entrada completa en
> `docs/DECISIONES.md`, "2026-09-02 — Perfeccionamiento de validaciones: Categoría, Tag, Rechazo
> de pedido, Aprobación de comercio, Horario individual".

Quinto y último tramo de la lista de prioridad original de perfeccionamiento de formularios.
Mapeo consolidado en un solo archivo (no uno por formulario): de los 5 formularios en alcance,
solo uno (Rechazo de pedido) recibió cambios de código — los otros 4 ya estaban completos y solo
se les juntó evidencia. Un archivo por formulario habría dejado 4 documentos casi vacíos.

## Archivos tocados

| Archivo | Cambio |
|---|---|
| `backend/src/main/java/com/bajonea/backend/services/PedidoService.java` | `rechazarPedido`: nuevo chequeo condicional — si `motivo=OTRO` y `comentario` nulo/blanco, `ValidacionException("Ingresá un comentario para especificar el motivo del rechazo.")`, antes de mutar el pedido. Imports nuevos: `MotivoRechazo`, `ValidacionException`. |
| `frontend/js/comercio.js` | `mostrarModalRechazarPedido`: label del campo comentario (`#rechazo-comentario-label`) ahora dinámico según `motivo` seleccionado; error propio `#rechazo-error-comentario` + clase `textarea-shell--error` sobre el shell; submit bloquea el envío si `motivo=OTRO` y comentario vacío, con el mismo mensaje que el backend; error se limpia al tipear o al cambiar de motivo. |
| `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` | Punto 5 (Rechazo de pedido) actualizado en 2 lugares (tabla de la Parte 1, recomendación de la Parte 3) — de "ya bien resuelto, comentario opcional siempre" a "obligatorio condicional si motivo=OTRO, resuelto en este tramo". |
| `docs/DECISIONES.md` | Entrada nueva con el detalle completo de la auditoría, la discrepancia encontrada, la implementación y la evidencia. |

**Categoría, Tag, Aprobación de comercio y Horario individual: sin cambios de código** — ya
cumplían el patrón vacío/formato pedido, confirmado por auditoría propia antes de implementar
nada (ver discrepancia abajo).

## Discrepancia real encontrada (resuelta con Diego antes de implementar)

El prompt de arranque asumía trabajo pendiente en los 5 formularios. La auditoría propia (antes
de tocar código) encontró que **4 de los 5 ya estaban completos**:

- **Categoría** (`admin.js:768-909`, `CategoriaService.java`) y **Tag** (`admin.js:1028-1170`,
  `TagService.java`): vacío con mensaje propio, unicidad de `nombre` ya resuelta en backend
  (409) y ya manejada en frontend como error de campo, `maxlength` coincide con `@Size`.
- **Aprobación de comercio** (`admin.js:356-433`, `AdministradorService.java:105-108`):
  backend ya exige `motivo` solo si `aprobar=false`, frontend ya tiene 2 modales separados con
  el campo motivo apareciendo únicamente en el de rechazo.
- **Horario individual** (`auth.js:854-1150` en `registro-comercio.html`): ya resuelto en el
  tramo "CUIT solo dígitos, rediseño de 3. Horarios..." del 2026-09-01 — vacío/parcial,
  cierre≤apertura y superposición con mensajes propios y distintos.

Esto coincidía con lo que ya documentaba `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` (auditoría
del 2026-09-01, sin implementación) para estos mismos 4 puntos.

Confirmado con Diego (pregunta explícita antes de proceder, ver conversación): implementar
únicamente el gap real (Rechazo de pedido) y juntar evidencia de los 5, sin tocar código donde
no hacía falta.

**El gap real — y su propia discrepancia contra la auditoría previa:** `docs/
AUDITORIA-FORMULARIOS-PENDIENTES.md` (2026-09-01) había marcado "Rechazo de pedido" como ya
resuelto, tratando `comentario` como opcional en todos los casos. El prompt de este tramo trae
una regla de negocio nueva y explícita (confirmada por Diego): `comentario_rechazo` es
obligatorio únicamente cuando `motivo=OTRO`. No es un error de la auditoría anterior — es una
regla que no existía como tal hasta este tramo. Corregida la entrada de esa auditoría para
reflejar el estado real (ver tabla de archivos tocados arriba).

## Evidencia (resumen — detalle completo en `docs/DECISIONES.md`)

Backend levantado contra `bajonea_final` real. Datos de prueba dedicados: administrador id 145
(insertado directo, sin tocar `admin@bajonea.com`), comercios id 53/54, cliente id 148,
categoría id 36, tag id 30 — todos armados vía endpoints reales de registro/alta, con
verificación de email por código real leído de `token`.

- **Categoría/Tag**: `curl` — vacío → 400 específico; duplicado → 409 específico; alta válida →
  201. Confirmado también en navegador real (DOM manipulado directamente — el panel de captura
  de pantalla de esta sesión no renderizó frames, misma limitación ya documentada en Fase 16
  Tramos 16.25/16.26).
- **Aprobación de comercio**: `curl` — rechazar sin motivo → 400; aprobar sin motivo → 200;
  rechazar con motivo → 200, persistido en `historial_estado_comercio` con el texto exacto. En
  navegador real: botón de confirmar rechazo deshabilitado mientras el motivo está vacío
  (probado sobre el comercio pendiente preexistente id 48, sin enviar el formulario — se dejó
  intacto).
- **Horario individual**: `curl` contra el registro real de comercio — lista vacía → 400; cierre
  ≤ apertura → 400; superposición → 400 con el detalle de la franja en conflicto; alta válida →
  201, persistido. Los mismos 4 casos reproducidos en navegador real sobre el tab
  "Personalizado" de `registro-comercio.html`.
- **Rechazo de pedido (el gap)**: `curl` + `SELECT` — `motivo=OTRO` + comentario vacío/blanco →
  400 "Ingresá un comentario para especificar el motivo del rechazo."; `motivo≠OTRO` sin
  comentario → 200, persistido con `comentario_rechazo=NULL`; `motivo=OTRO` con comentario real
  → 200, persistido exacto. Repetido de punta a punta en navegador real (login real del comercio
  de prueba, `comercio-pedido-detalle.html`): label dinámico confirmado, error específico al
  enviar vacío, error se limpia al tipear, envío final resuelve el pedido y persiste en
  `bajonea_final`.
- **Sintaxis verificada** (`node --check` sobre copia `.mjs`) para `comercio.js`. Cero
  comentarios agregados en los archivos `.html`/`.js`/`.java` tocados.
- **Limpieza completa de `bajonea_final`**: toda la cadena de datos de prueba (administrador,
  2 comercios con sus productos/horarios/redes sociales/direcciones/historial de estado,
  cliente con sus pedidos/carrito/dirección, categoría, tag) eliminada con `DELETE` directo,
  confirmado con `SELECT COUNT(*)` en cero para cada tabla y conteos base restaurados exactos
  (6 clientes, 3 comercios, 22 categorías, 17 tags, 1 administrador). El comercio pendiente
  preexistente (id 48, ajeno a este tramo) quedó sin tocar. `bajonea_test` no fue tocada — no
  hizo falta el atajo del perfil `test`.
