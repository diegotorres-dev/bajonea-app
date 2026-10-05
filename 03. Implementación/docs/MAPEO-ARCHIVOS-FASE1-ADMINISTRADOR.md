# Mapeo de archivos — Auditoría exhaustiva de Administrador (2026-09-03)

Documento de trazabilidad puro: lista todos los archivos leídos como fuente real para producir
`docs/AUDITORIA-EXHAUSTIVA-ADMINISTRADOR.md`. Ningún archivo listado acá fue modificado — esta
tarea fue estrictamente de lectura, salvo la creación de los 2 documentos nuevos de este mismo
tramo (este archivo y `docs/AUDITORIA-EXHAUSTIVA-ADMINISTRADOR.md`). Este agente corrió sin
worktree aislado (falla de creación de worktree no relacionada, ver el prompt original de la
tarea) — se restringió a herramientas de lectura (Read/Grep/Glob/Bash de solo lectura) sobre
todo el código fuente, sin ningún `git checkout`/`reset`/edición de archivo existente.

## Documentación previa (contexto, no fuente de verdad)

- `docs/AUDITORIA-EXHAUSTIVA-COMERCIO.md` (documento completo, 629 líneas) — referencia de
  estructura/formato de las 4 partes, fuente de los formularios compartidos con Cliente/Comercio
  que no se re-auditaron campo por campo, y fuente del Hallazgo 1 (RedSocial sin consumidor en
  frontend) contrastado en la Parte 3, punto 2, de este documento.
- `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` (secciones leídas: líneas 60-199 y 255-329) —
  punto de partida a contrastar; reveló que `AprobacionComercioRequestDTO`/`CategoriaRequestDTO`/
  `TagRequestDTO` ya habían sido auditados campo por campo antes de este tramo (ver Parte 3,
  punto 1, del documento principal).
- `docs/diccionario-de-datos.md` — secciones "Tabla: HistorialEstadoUsuario" (525-544), "Tabla:
  ConfiguracionTarifa" (814-831), "Tabla: HistorialEstadoComercio" (800-811), "Módulo Atención y
  Soporte" (917-957, tablas `Soporte` y `Reclamo` completas), más `grep` global de
  "ConfiguracionTarifa|Reclamo|Soporte|HistorialEstadoUsuario|HistorialEstadoPedido|NotaCredito"
  sobre el archivo completo para ubicar todas las menciones relevantes.
- `../01. Análisis de Requerimientos/04. Requisitos Funcionales/requisitos-funcionales-administrador.md`
  (documento completo, 75 líneas) — fuente de los requisitos formales contrastados en la Parte 3,
  puntos 3, 5 y 7 del documento principal (filtros de listados, nombre de
  `HistorialAccionComercio` vs. `HistorialEstadoComercio`, bloqueo de baja de categoría/tag con
  productos asociados).
- `CLAUDE.md` (raíz del proyecto) — contexto general de fases (§6, Tramos 8/16.21/16.23 de Fase
  16, y Fase 17 para la cuenta `admin@bajonea.ar`), §1bis (alcance del proyecto completo, base
  para confirmar qué del rol Administrador pertenece al bloque nuevo sin planificar todavía).

## Backend — Controllers

- `backend/src/main/java/com/bajonea/backend/controllers/AdministradorController.java`
  (completo, 71 líneas) — 6 endpoints reales del rol.
- `backend/src/main/java/com/bajonea/backend/controllers/CategoriaController.java` (completo).
- `backend/src/main/java/com/bajonea/backend/controllers/TagController.java` (completo).
- `backend/src/main/java/com/bajonea/backend/controllers/UsuarioController.java` (completo) —
  flujo compartido de foto de perfil, usado también por Administrador.
- `backend/src/main/java/com/bajonea/backend/config/security/SecurityConfig.java` (completo) —
  confirmación de `hasRole("ADMINISTRADOR")` sobre `/api/v1/administrador/**`,
  `/api/v1/categorias/**`, `/api/v1/tags/**` (mutaciones).

## Backend — Services

- `backend/src/main/java/com/bajonea/backend/services/AdministradorService.java` (completo, 202
  líneas) — fuente principal de la Parte 2, punto 1, y de la mayoría de los hallazgos de
  ausencia de suspensión/reclamos/soporte en la Parte 1.
- `backend/src/main/java/com/bajonea/backend/services/CategoriaService.java` (completo).
- `backend/src/main/java/com/bajonea/backend/services/TagService.java` (completo).
- `backend/src/main/java/com/bajonea/backend/services/AuthService.java` (fragmentos vía `grep`
  con contexto: manejo de `EstadoUsuario.SUSPENDIDO` en el switch de login, líneas 225-277;
  asignación de `EstadoComercio.CERRADO_TEMPORALMENTE`/`INACTIVO`, líneas 198/253/299).

## Backend — DTOs

- `backend/src/main/java/com/bajonea/backend/dto/request/AprobacionComercioRequestDTO.java`
  (completo).
- `backend/src/main/java/com/bajonea/backend/dto/request/CategoriaRequestDTO.java` (completo).
- `backend/src/main/java/com/bajonea/backend/dto/request/TagRequestDTO.java` (completo).
- `backend/src/main/java/com/bajonea/backend/dto/response/ComercioAdminResponseDTO.java`
  (completo) — confirmación central del gap de RedSocial (Parte 3, punto 2).
- `backend/src/main/java/com/bajonea/backend/dto/response/ClienteAdminResponseDTO.java`
  (completo).
- `backend/src/main/java/com/bajonea/backend/dto/response/AdministradorResponseDTO.java`
  (completo).
- `backend/src/main/java/com/bajonea/backend/dto/response/MetricasAdminResponseDTO.java`
  (completo) — base del hallazgo de la Parte 3, punto 6 (`comerciosTotal` vs. listado filtrado).

## Backend — Enums

- `backend/src/main/java/com/bajonea/backend/enums/EstadoComercio.java` (completo, 6 valores).
- `backend/src/main/java/com/bajonea/backend/enums/EstadoUsuario.java` (completo, 5 valores).
- `backend/src/main/java/com/bajonea/backend/enums/TipoNotificacion.java` (completo, 30
  valores) — base del hallazgo de la Parte 3, punto 4.

## Backend — Confirmación de ausencia (búsquedas negativas)

- `Glob` de `backend/src/main/java/**/*.java` (214 archivos totales) — recorrido para confirmar
  que no existe ningún archivo con nombre `*Soporte*`, `*Reclamo*`, `*ConfiguracionTarifa*`,
  `*NotaCredito*`, `*ResolucionSoporte*`, `*EstadoReclamo*` en todo el backend.
- `Grep` de "Suspender|Suspension|SUSPENDIDO|Reclamo|Soporte|ConfiguracionTarifa|NotaCredito|Reembolso"
  sobre `backend/src/main/java` completo — 4 archivos con coincidencia, ninguno con lógica real
  de negocio de esas features (solo el valor de enum y el manejo defensivo del `switch` de
  login).
- `Grep` de "EstadoUsuario\.SUSPENDIDO" y de "EstadoComercio\.(SUSPENDIDO|INACTIVO|CERRADO_TEMPORALMENTE)"
  sobre `backend/src/main/java` completo — confirma que `SUSPENDIDO` nunca se asigna en ningún
  punto del código, en ninguno de los dos enums.
- `Grep` de "resolicit|re-solicit|nueva solicitud" (case-insensitive) sobre `backend/src/main/java`
  y `frontend/` — confirma ausencia total de re-solicitud de comercio rechazado.
- `Grep` de "TipoNotificacion\.(...)" con los 11 valores no-`COMERCIO_APROBADO`/`RECHAZADO`
  relacionados a Administrador, acotado a `backend/src/main/java/.../services/` — cero
  resultados, confirma que esos valores del enum nunca se instancian.

## Frontend — HTML

- `frontend/admin-comercios-pendientes.html`
- `frontend/admin-comercio-detalle.html`
- `frontend/admin-comercios.html`
- `frontend/admin-clientes.html`
- `frontend/admin-dashboard.html`
- `frontend/admin-categorias.html`
- `frontend/admin-tags.html`

(los 7 archivos `admin-*.html` que existen en `frontend/` — confirmado por `Glob` que no hay
ningún otro archivo con ese prefijo). Leídos en profundidad vía `grep -n "data-testid"` para
extraer la estructura real de cada pantalla (contenedores, botones, badges) sin necesidad de
levantar el servidor.

## Frontend — JS

- `frontend/js/admin.js` (archivo completo, 1288 líneas) — única fuente de la lógica de negocio
  del lado cliente para las 7 pantallas de Administrador. Leído íntegro en una sola pasada.

## Frontend — Confirmación de ausencia (búsquedas negativas)

- `Grep -i` de "suspender|suspension|reclamo|soporte|tarifa|reembolso|nota.?credito" sobre
  `frontend/` completo — 5 coincidencias, las 5 texto estático de contacto genérico
  ("contactá a soporte") en pantallas de error/perfil/rechazo, ninguna un formulario real.

## Postman

- `postman/Bajonea-MVP.postman_collection.json` — recorrido de nombres de carpeta vía script
  Node.js ad-hoc (no versionado) para listar las 39 carpetas de nivel superior (`00` a `39`),
  identificando `03 - Administrador`, `10 - Administrador (endpoints nuevos y reglas de
  aprobacion)` y `11 - Categorias y Tags (CRUD completo)` como las relevantes. Recorrido
  recursivo de los nombres de request dentro de esas 3 carpetas (mismo script). Lectura de body
  + test script completo de 5 requests puntuales de la carpeta `10` (`Aprobar Comercio A`,
  `[negativo] Resolver un comercio ya resuelto...`, `[negativo] Resolver un comercio
  inexistente`, `[negativo] Rechazar comercio sin motivo`, `Rechazar Comercio D con motivo`)
  para confirmar los mensajes exactos verificados por los tests automatizados.

## Playwright

- `testing/playwright/tests/08-aprobacion-comercio.spec.ts` (completo, 179 líneas).
- `testing/playwright/tests/07-crud-categorias-tags.spec.ts` (completo, 199 líneas).
- `Glob` de `testing/playwright/tests/*.spec.ts` (16 archivos) para confirmar que no existe
  ningún spec adicional que toque `admin-comercios.html`/`admin-clientes.html`/
  `admin-dashboard.html` fuera de los 2 ya listados (`08`/`07`), ni ningún spec de
  Suspensión/Reclamo/Soporte/ConfiguracionTarifa (coherente con que esas features no existen en
  código para testear).

## Comandos de búsqueda transversal (sin archivo de salida propio)

- `find backend/src/main/resources -iname "*ValidationMessages*" -o -iname "*messages*"` — sin
  resultados, confirma que no hay ningún archivo de mensajes de Bean Validation traducidos al
  español más allá de los `message = "..."` explícitos en cada anotación — usado para
  fundamentar la nota sobre `@NotNull`/`@Size` sin mensaje custom en `AprobacionComercioRequestDTO.aprobar`
  y `CategoriaRequestDTO`/`TagRequestDTO.nombre` (Parte 2 y Parte 4 del documento principal).
- `find backend/src/main/java -iname "*Administrador*" -o -iname "*SecurityConfig*"` — listado
  inicial de los 6 archivos backend directamente nombrados "Administrador".
