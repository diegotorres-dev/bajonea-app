# Mapeo pantallas ↔ archivos — Fase 16, Tramo 8

Relación exacta entre las 5 pantallas lógicas del catálogo de Fase 15 correspondientes a este tramo (Administrador: aprobación de comercios) y los archivos generados en `frontend/`. Mismo formato que `docs/MAPEO-ARCHIVOS-TRAMO1.md`–`TRAMO7.md`.

Primer tramo del rol Administrador. A diferencia de los Tramos 1-7, las capturas de las 5 pantallas fueron adjuntadas directamente por el usuario en el pedido — no se intentó ni el MCP de Figma (cuota agotada, confirmada de nuevo en Tramos 5-7) ni el fallback de navegador (timeout sistemático contra el lienzo, confirmado en Tramo 7), por instrucción explícita de no reintentar ninguno de los dos caminos en este tramo.

---

## AD — Administrador (5 pantallas → 3 archivos `.html` nuevos + `js/admin.js` nuevo)

| Pantalla(s) | Archivo | Relación |
|---|---|---|
| AD01 (Dashboard Principal) | `frontend/admin-dashboard.html` (+ `js/admin.js`, función `initAdminDashboard`) | Header estático "Administrador" sin bell de notificaciones (ver nota más abajo) + card `AD`/"Administrador"/"Bajoneá App" estático (sin `AdministradorController` de perfil propio, no existe en el MVP). Card "Comercios Pendientes" (`.alert-card`, clase nueva) con conteo real desde `GET /administrador/metricas`, enlaza a AD02. Grid 2x2 "Gestión" (`.stat-tile-grid`/`.stat-tile`, clases nuevas) con 4 tiles de solo lectura (Comercios/Clientes/Categorías/Tags, conteos reales) — sin `href`: los 3 primeros no tienen pantalla de destino en este tramo (Comercios/Clientes son gaps de Fase 15 §2.4 AD07/AD11; Categorías/Tags quedan para el Tramo 9), mostrar un link roto hubiera sido peor que no tener link. |
| AD02 (Listado Comercios Pendientes) | `frontend/admin-comercios-pendientes.html` (+ `js/admin.js`, función `initAdminComerciosPendientes`) | Header con back + badge circular (`.app-header__badge`, clase nueva) con el conteo real de pendientes. Lista de `.request-card` (clase nueva, mismo criterio de composición que `.pedido-card`/`.comercio-card` de tramos anteriores: título + badge "Nueva" reutilizando `.status-badge--pendiente`, 3 filas con `.comercio-info__row` reutilizado tal cual, footer "Ver solicitud" con chevron), ordenada por `fechaRegistro` ascendente (más antigua primero). Estado vacío con `.state-page` reutilizado. |
| AD03 (Detalle Comercio Pendiente) | `frontend/admin-comercio-detalle.html` (+ `js/admin.js`, función `initAdminComercioDetalle`) | `.request-hero` (clase nueva: logo placeholder, nombre, pills de tipo/modalidad reutilizando `.pill`/`.pill--primary`/`.pill--success`, nuevas variantes de color) + secciones `.detail-section`/`.detail-row` (clases nuevas, patrón fila label-valor) para Datos del Comercio, Datos Legales/Fiscales, Dirección, Modalidades de Entrega (con ícono check/x real por modalidad) y Horarios Registrados (lista simple ordenada Lunes→Domingo, sin fusionar rangos consecutivos como sugiere la captura de Figma — simplificación de presentación, dato real sin alterar). Sin sección "Representante Legal" — gap de modelo de datos, ver más abajo. Footer sticky `.request-footer` (clase nueva) con "Rechazar"/"Aprobar". |
| AD05 (Modal Confirmar Aprobación) | Sin archivo propio — función `mostrarModalConfirmarAprobacion` en `js/admin.js` | Reutiliza `.modal-sheet`/`.modal-sheet__icon--success` tal cual (mismo patrón que `mostrarModalConfirmarLogout` de `comercio.js`/`cliente.js`), con el nombre del comercio en un `.pill--primary` y el botón de confirmación con `background: var(--color-success)` inline — mismo criterio ya usado para el rojo de "Descontinuar producto" (Tramo 6) y "Rechazar pedido" (Tramo 7), override de color por semántica de la acción sobre `.btn-primary` en vez de una clase nueva de un solo uso. |
| AD06 (Modal Rechazar Comercio) | Sin archivo propio — función `mostrarModalRechazarComercio` en `js/admin.js` | Reutiliza `.product-modal-sheet` (mismo bottom sheet que `mostrarModalRechazarPedido` de Tramo 7), pero con `<textarea>` de motivo libre en vez de `<select>` — `AprobacionComercioRequestDTO.motivo` es `String` libre, no un `ENUM` como `MotivoRechazo` de Pedido (ver `docs/DECISIONES.md`, 2026-07-17, "campo motivo: ENUM o texto libre"). Contador de caracteres real (`.textarea-counter`, clase nueva) y botón "Confirmar Rechazo" deshabilitado hasta que el motivo tenga contenido real (no solo `required` nativo) — validación replicada también en el `submit` del formulario, con estado de error visual (`.textarea-shell--error`, clase nueva) si se fuerza un submit vacío. |

**Nuevo:** `frontend/js/admin.js` — `initAdminDashboard`, `initAdminComerciosPendientes`, `initAdminComercioDetalle`, `mostrarModalConfirmarAprobacion`, `mostrarModalRechazarComercio`, `renderRequestCard`, `renderDetalle`, `renderNoEncontrado`, `requireAdmin` (guard de rol, mismo patrón que `initComercioEstadoPagina`/las guards inline de `cliente.js`). Sin bottom nav: a diferencia de Cliente/Comercio, este tramo no tiene suficientes pantallas propias todavía para justificar una barra de navegación fija (3 pantallas navegables por drill-down, no por tabs) — se reevalúa en el Tramo 9 si las pantallas de Categorías/Tags lo ameritan.

**Modificado (no nuevo):**
- `frontend/js/auth.js` — `redirigirPostLogin` corregido: el placeholder `admin/pendientes.html` (subcarpeta nunca construida, dejado desde el Tramo 1 con un 404 esperado y documentado) pasa a `admin-dashboard.html`, mismo criterio de archivo plano ya usado por `comercio-dashboard.html` desde el Tramo 5.
- `frontend/css/styles.css` — clases nuevas agregadas al final del archivo: `.pill--primary`, `.pill--success`, `.app-header__badge`, `.stat-tile-grid`/`.stat-tile*`, `.alert-card*`, `.request-card*`, `.request-hero*`, `.detail-section*`, `.detail-row*`, `.request-footer`, `.textarea-shell--error`, `.textarea-counter`. Ninguna reemplaza una clase existente.

**Sin cambios:** `backend/.../SecurityConfig.java` — `GET /administrador/metricas` queda cubierto automáticamente por el matcher ya existente `/api/v1/administrador/**` → `hasRole("ADMINISTRADOR")` (Fase 7), sin necesitar ningún ajuste nuevo.

---

## Resumen numérico

| | Cantidad |
|---|---|
| Pantallas lógicas del tramo | 5 (AD01, AD02, AD03, AD05, AD06) |
| Construidas | 5 |
| Archivos `.html` nuevos | 3 (`admin-dashboard.html`, `admin-comercios-pendientes.html`, `admin-comercio-detalle.html`) |
| Archivos `.js` nuevos | 1 (`js/admin.js`) |
| Archivos `.js` modificados | 1 (`js/auth.js`, 1 línea) |
| Archivos `.css` modificados | 1 (`css/styles.css`, solo clases nuevas agregadas) |

---

## Endpoints/DTOs reales usados y ampliados (confirmados antes de programar)

- `GET /api/v1/administrador/comercios/pendientes` (ya existía, Fase 8.3) — ahora devuelve `ComercioPendienteResponseDTO` en vez de `ComercioResponseDTO` (DTO nuevo, admin-only, ver más abajo).
- `PUT /api/v1/administrador/comercios/{id}/resolver` (ya existía, Fase 8.3) — body `{ aprobar, motivo }` (`AprobacionComercioRequestDTO`), sin cambios.
- `GET /api/v1/administrador/metricas` — **endpoint nuevo de este tramo**, `MetricasAdminResponseDTO` (`comerciosPendientes`, `comerciosTotal`, `clientesTotal`, `categoriasActivas`, `tagsActivos`). `comerciosTotal`/`clientesTotal` son conteos agregados (`JpaRepository.count()`), no un listado — no existe ni existía antes de este tramo ningún endpoint de listado completo de comercios/clientes (gap ya documentado en `docs/PANTALLAS-MVP-FASE15.md` §2.4, AD07/AD11), así que el dashboard **no** intenta simular ese listado, solo muestra el número real. `categoriasActivas`/`tagsActivos` usan 2 finders nuevos (`CategoriaRepository.countByActivoTrue`, `TagRepository.countByActivoTrue`), con un call site real cada uno (este mismo método).
- `GET /api/v1/comercios/perfil` (ya existía, Fase 8.4) — reutilizado solo para la verificación cruzada de este tramo (confirmar `estado` real tras resolver desde Administrador), no consumido por ninguna pantalla nueva.

**`ComercioPendienteResponseDTO` — DTO nuevo, admin-only, no confundir con `ComercioResponseDTO`:** mismos campos base (`id`, `nombre`, `descripcion`, `telefono`, `emailContacto`, `tipoComercio`, `aceptaDelivery`, `aceptaRetiro`, `estado`, `razonSocial`, `cuit`, `direccion`, `horarios`) más 3 campos nuevos que **nunca** se agregaron al `ComercioResponseDTO` compartido con `ComercioController` (self-service) ni `CatalogoController` (público), para no filtrar datos de cuenta a través de esos 2 canales:
- `fechaRegistro` — necesario para "Registrado hace X" (AD02) y "Solicitud enviada: fecha" (AD03).
- `condicionIva` — mostrado en AD03, `PersonaJuridica.condicionIva` no estaba expuesto en ningún DTO hasta ahora.
- `emailCuenta` — el email de login (`Usuario.email`), distinto de `emailContacto` (contacto público del comercio). Mostrado como fila extra dentro de "Datos del Comercio" en AD03 y como una de las 3 filas de cada card en AD02.

---

## Gap real de modelo de datos: "Representante Legal" sin ningún dato que mostrar

La captura de AD03 incluye una sección "Representante Legal" con Nombre, DNI y Email de cuenta. Investigado antes de programar (no asumido): `Comercio` extiende `PersonaJuridica` (`razonSocial`, `cuit`, `condicionIva`, `tipoSociedad`, `domicilioFiscal`, `fechaInicioActividades`) → `Persona` → `Usuario`. A diferencia de `Cliente`/`Administrador` (que extienden `PersonaFisica`, con `nombre`/`apellido`/`dni`), **no existe en ningún lugar del modelo del MVP un campo de nombre, apellido o DNI de una persona física responsable de un Comercio** — ni en `RegistroComercioRequestDTO` (confirmado contra `CLAUDE.md` §5bis: sus campos de identidad son `razonSocial`/`cuit`/`condicionIva`/`tipoSociedad`/`domicilioFiscal`/`fechaInicioActividades`, todos de la persona jurídica, ninguno de un individuo) ni en `docs/modelo-mvp.md`.

Esto no es un DTO incompleto (como el gap de `fechaRegistro`/`condicionIva`/`emailCuenta`, resuelto arriba con un DTO nuevo) — es un dato que **no se captura en ningún punto del flujo de registro de Comercio**, así que ningún DTO nuevo puede exponerlo. Se resolvió:
- Omitiendo por completo la sección "Representante Legal" de AD03 (no se construyó con campos vacíos, "N/A" ni ningún placeholder — mismo criterio que CO21 en Tramo 7, nunca mostrar UI que sugiera un dato o una acción que no existe).
- `emailCuenta` (el único de los 3 campos de esa sección con dato real) se reubicó como una fila más dentro de "Datos del Comercio", sin promoverlo a su propia sección.

**2 opciones para el dueño del proyecto, ninguna aplicada todavía (mismo criterio que la enmienda de `Sesion` en Fase 7 — no se cuela sin decisión explícita):**
1. Dejarlo así de forma permanente: para un Administrador, el CUIT + razón social ya identifican legalmente a la persona jurídica responsable — un nombre/DNI individual no es estrictamente necesario para la decisión de aprobar/rechazar en este MVP.
2. Ampliar el alcance: agregar `nombreRepresentante`/`apellidoRepresentante`/`dniRepresentante` a `PersonaJuridica` (o una tabla nueva), lo que implica reabrir `docs/modelo-mvp.md`, una migración Flyway, sumar los 3 campos a `RegistroComercioRequestDTO` y a la pantalla de registro de Comercio del Tramo 1 (`registro-comercio.html`, ya cerrado) — comercios ya registrados quedarían con esos campos `NULL` sin backfill posible (el dato nunca se pidió).

---

## Verificación cruzada Administrador → Comercio (lo más importante del tramo)

Probado con el backend Spring Boot real y el frontend servido localmente. Se registraron 2 comercios descartables nuevos vía `POST /auth/registro/comercio` real (`tramo8.aprobar@bajonea.test` / comercio `id=42`, `tramo8.rechazar@bajonea.test` / comercio `id=41`, contraseña `Tramo81234` para ambos, CUITs matemáticamente válidos recalculados contra el algoritmo real de `CuitValidator` — un primer intento con un CUIT mal calculado a mano dio `400 "CUIT inválido"`, correcto, se recalculó bien antes de reintentar).

1. Login como `admin@bajonea.ar` (contraseña `AdminE2E1`, ya fijada en el cierre de Fase 16a, sin cambios) → `admin-dashboard.html` real vía la UI, métricas reales (`comerciosPendientes: 3` con los 2 nuevos + `Comercio Demo Pendiente` preexistente del Tramo 5, `comerciosTotal: 5`, `clientesTotal: 1`, `categoriasActivas: 1`, `tagsActivos: 1`).
2. `admin-comercios-pendientes.html` → 3 cards reales, orden correcto por antigüedad, badge del header en `3`.
3. `admin-comercio-detalle.html?id=41` (Tramo8 Comercio Rechazar) → todas las secciones con datos reales confirmados contra lo enviado en el registro. Botón "Rechazar" → modal AD06 real → motivo real ("Documentación incompleta — falta el comprobante de domicilio fiscal...") → `PUT /administrador/comercios/41/resolver` real (`200`) → vuelve a la lista, que baja a 2 cards.
4. `admin-comercio-detalle.html?id=42` (Tramo8 Comercio Aprobar) → botón "Aprobar" → modal AD05 real → "Confirmar Aprobación" → `PUT /administrador/comercios/42/resolver` real (`200`) → vuelve a la lista, que baja a 1 card (solo `Comercio Demo Pendiente`, sin tocar).
5. **Verificación cruzada real, backend levantado con `SPRING_PROFILES_ACTIVE=test` solo para poder verificar el email de los 2 comercios de prueba vía el endpoint de bypass** (sin SMTP real, Fase 10 sigue resuelta para verificación de cuenta pero no hacía falta un email real para esta prueba puntual): tras verificar, login de `tramo8.aprobar@bajonea.test` → `GET /comercios/perfil` real confirma `estado: APROBADO`, y el login real desde el navegador (`login.html` → `redirigirPostLogin`) llega a `comercio-dashboard.html` (mismo criterio de A08/A09 del Tramo 1, ahora `comercio-dashboard.html`/`comercio-rechazado.html` tras la corrección de Tramo 5). Login de `tramo8.rechazar@bajonea.test` → `estado: RECHAZADO` real, navegador llega a `comercio-rechazado.html` con el mensaje real de rechazo.
6. **Conclusión: resolver un comercio desde el panel de Administrador de este tramo cambia de verdad el flujo de login del comercio afectado, confirmado contra el backend real y desde el navegador, no asumido porque las pantallas ya existieran de otro tramo.**

---

## Probado end-to-end contra el backend real (no simulado)

1. Aislamiento por rol: usuario `COMERCIO` autenticado (`tramo8.rechazar`) navegando directo a `admin-comercio-detalle.html?id=999999` → redirigido a `login.html` por `requireAdmin()`, sin llegar a pedir ningún dato de administrador.
2. Aislamiento por tenant (o más bien, ausencia deliberada del mismo): confirmado que `AdministradorService.listarComerciosPendientes()` no filtra por ningún id de administrador — es una consulta global (`comercioRepository.findByEstado(PENDIENTE)`), a propósito distinto del resto del proyecto (Cliente/Comercio sí filtran por su propio usuario). El Administrador ve la totalidad de comercios pendientes sin excepción.
3. Caso de error: `admin-comercio-detalle.html?id=999999` (inexistente) → estado "No encontramos esta solicitud" real, sin excepciones de consola.
4. Bug real de layout encontrado y corregido en el camino: los íconos SVG de "Modalidades de Entrega" (AD03) no tenían `width`/`height` explícitos dentro de `.detail-row`, así que el navegador les aplicaba su tamaño intrínseco por defecto (mucho más grande de lo esperado), rompiendo el layout de esa sección — confirmado con captura de pantalla antes/después. Corregido con `.detail-row svg { width: 15px; height: 15px; flex-shrink: 0; }`.
5. Consola del navegador revisada en cada paso (`read_console_messages`) — sin errores en ningún punto del recorrido.
6. Regla de "cero comentarios en `frontend/`" verificada con `grep` sobre los 3 archivos `.html` nuevos, `js/admin.js` y el bloque nuevo de `css/styles.css` — cero coincidencias.

**Reinicio del backend, 3 veces durante esta sesión:** (1) perfil por defecto, para compilar y probar los endpoints/DTOs nuevos con el proceso que ya estaba corriendo desde una sesión anterior (detenido primero); (2) `SPRING_PROFILES_ACTIVE=test`, exclusivamente para verificar el email de los 2 comercios de prueba vía el endpoint de bypass, sin necesidad de SMTP real; (3) de vuelta a perfil por defecto al finalizar, para no dejar el entorno con rutas `/api/v1/test/**` alcanzables — confirmado con `GET /test/token-verificacion` → `404` tras el último reinicio.

**Datos de prueba, eliminados al finalizar (verificado con `SELECT` directo, no asumido):** los 2 usuarios/comercios descartables (`tramo8.aprobar@bajonea.test` id `88`/comercio `42`, `tramo8.rechazar@bajonea.test` id `87`/comercio `41`) y todas sus filas derivadas (`persona`, `persona_juridica`, `comercio`, `direccion`, `horario`, `historial_estado_comercio`, `notificacion`, `token`, `sesion`) eliminados en orden seguro de FK. Verificado después: `usuario` vuelve a tener exactamente las 5 filas preexistentes (`admin@bajonea.ar`, `cliente.demo`, `comercio1.demo`, `comercio2.demo`, `comercio.pendiente.demo`) — ninguna cuenta demo de otro tramo fue tocada.

## Checklist de cierre del Tramo 8

- [x] Checklist del Tramo 7 confirmado 100% cerrado antes de arrancar este tramo (revisado contra `docs/MAPEO-ARCHIVOS-TRAMO7.md` — los 13 puntos ya estaban en `[x]`).
- [x] Nombres exactos de capa (AD01, AD02, AD03, AD05, AD06) confirmados contra `docs/PANTALLAS-MVP-FASE15.md` antes de programar.
- [x] Endpoints/DTOs reales inventariados antes de programar; gap real de "Representante Legal" investigado a fondo (no asumido) y documentado con 2 opciones para el usuario, sin inventar el dato.
- [x] `GET /administrador/metricas` nuevo, admin-only, con conteos reales — sin simular ningún listado que no existe.
- [x] `ComercioPendienteResponseDTO` nuevo, separado del `ComercioResponseDTO` público/self-service, para no filtrar `fechaRegistro`/`condicionIva`/`emailCuenta` por otros canales.
- [x] AD01/AD02/AD03/AD05/AD06 construidas y probadas contra datos reales del comercio de prueba y el comercio demo preexistente.
- [x] Verificación cruzada Administrador → Comercio confirmada de punta a punta contra el backend real y desde el navegador: aprobar/rechazar desde este tramo cambia el resultado real del login del comercio afectado.
- [x] Aislamiento por rol probado real (Comercio no puede acceder a ninguna pantalla de Administrador).
- [x] Confirmado que el Administrador ve todos los comercios pendientes sin ningún filtro de tenant, a propósito distinto del resto del proyecto.
- [x] Caso de error (id inexistente) probado real, sin excepciones de consola.
- [x] Bug real de layout (íconos sin tamaño en `.detail-row`) encontrado y corregido en el momento.
- [x] Corrección del placeholder `admin/pendientes.html` heredado del Tramo 1, alineado a la convención flat-file del resto de `frontend/`.
- [x] Regla de "cero comentarios en `frontend/`" verificada con `grep`.
- [x] Datos de prueba eliminados y verificados; ninguna cuenta demo de otro tramo alterada; backend devuelto a perfil por defecto al finalizar.

Con esto, el Tramo 8 de 9 de la Fase 16 queda cerrado. Sigue el Tramo 9 (categorías/tags de Administrador, integración final) en una sesión futura.
