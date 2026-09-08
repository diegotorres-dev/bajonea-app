# Mapeo pantallas ↔ archivos — Fase 16, Tramo 5

Relación exacta entre las 4 pantallas lógicas del catálogo de Fase 15 (+ ampliación CO33) correspondientes a este tramo (Comercio: dashboard y perfil) y los archivos generados en `frontend/`. Mismo formato que `docs/MAPEO-ARCHIVOS-TRAMO1.md`/`TRAMO2.md`/`TRAMO3.md`/`TRAMO4.md`.

---

## CO — Comercio (4 pantallas → 2 archivos `.html` nuevos + 1 `.js` nuevo + 2 `.html`/2 `.js` modificados)

| Pantalla(s) | Archivo | Relación |
|---|---|---|
| CO01 | `frontend/comercio-pendiente.html` (modificado — ya existía desde el Tramo 1 como placeholder estático) | Ya no muestra solo el email de la sesión: `initComercioEstadoPagina('PENDIENTE')` (`js/comercio.js`) confirma contra `GET /comercios/perfil` que el `estado` real del comercio logueado es `PENDIENTE` antes de renderizar; si no lo es, redirige a la pantalla real (`comercio-dashboard.html`/`comercio-rechazado.html`). |
| — (sin código de pantalla en Fase 15; ya existía como estado alcanzable desde el login) | `frontend/comercio-rechazado.html` (modificado, mismo criterio) | Mismo guard con `'RECHAZADO'`. No es una pantalla nueva de este tramo, pero quedó con el mismo nivel de verificación real que CO01 por consistencia — antes tampoco confirmaba el estado real contra el backend. |
| CO28, CO29 | `frontend/comercio-perfil.html` (+ `frontend/js/comercio.js`, función `initComercioPerfil`) | 2 pantallas, 1 archivo — mismo patrón vista+edición ya usado en C37/C38 (Tramo 2) para el perfil de Cliente. CO28 (vista principal: nombre, email de contacto, datos legales de solo lectura, cerrar sesión) y CO29 (edición: nombre, descripción, teléfono, email de contacto, modalidades de entrega) alternan con `.perfil-view`/`is-hidden`, sin recargar la página. |
| CO33 (nueva, numerada `CO03` en el Figma armado a mano por el dueño del proyecto — ver nota más abajo) | `frontend/comercio-dashboard.html` (+ `frontend/js/comercio.js`, función `initComercioDashboard`) | Dashboard operativo del comercio aprobado: header con nombre real + campana, banner abierto/cerrado real (reutiliza `estadoHorario`, exportada de `js/catalogo.js`), saludo + fecha, 3 métricas de `GET /pedidos/comercio/resumen-hoy`, y lista de pedidos activos (`PENDIENTE`/`EN_PREPARACION`) con badge de cantidad de nuevos. |

**Nuevo:** `frontend/js/comercio.js` — módulo central de las pantallas de Comercio de este tramo y de los que vengan (`initComercioEstadoPagina`, `renderBottomNavComercio`, `initComercioDashboard`, `initComercioPerfil`), mismo criterio de organización que `js/cliente.js` para el Cliente.

**Modificados (no nuevos):**
- `frontend/js/catalogo.js` — `estadoHorario` pasó a `export` (la usa `comercio.js` para el banner de CO33, evita duplicar la lógica de "¿está abierto ahora?" ya escrita en el Tramo 2). `renderTopBar`: el ícono de perfil ahora enruta según rol (`comercio-perfil.html` para `COMERCIO`, `perfil.html` para el resto) — antes apuntaba siempre a `perfil.html` sin importar el rol, un gap que no se había notado porque hasta este tramo ningún flujo de Comercio usaba la barra superior compartida.
- `frontend/js/auth.js` — `construirTelefono` pasó a `export` (la reutiliza `comercio.js` para el teléfono en CO29, mismo criterio de "+54 9" + dígitos ya usado en el registro de Comercio). `redirigirPostLogin`: el destino de un comercio `APROBADO` se corrigió de `comercio/dashboard.html` (ruta con subcarpeta, un placeholder puesto en el Tramo 1 antes de que la pantalla existiera) a `comercio-dashboard.html` (archivo plano, mismo criterio del resto de `frontend/`, sin subcarpetas). `initComercioEstado` (mostraba solo el email, sin verificar el estado real) se eliminó — reemplazada por `initComercioEstadoPagina` en `comercio.js`, que sí verifica.
- `frontend/css/styles.css` — suma `.metric-grid`/`.metric-card` (las 3 tarjetas de métricas de CO33; no existía ningún componente de "número grande + label" reutilizable, `.summary-card` es horizontal ícono+texto y no encaja). El resto de CO33 (`.banner-success`/`.banner-warning`, `.pedido-card`, `.status-badge`, `.bottom-nav`) reutiliza clases ya existentes de tramos anteriores, sin variantes nuevas.

---

## Resumen numérico

| | Cantidad |
|---|---|
| Pantallas lógicas del tramo | 4 (CO01, CO28, CO29, CO33) |
| Construidas | 4 |
| Archivos `.html` nuevos | 2 (`comercio-dashboard.html`, `comercio-perfil.html`) |
| Archivos `.js` nuevos | 1 (`js/comercio.js`) |
| Archivos `.html` modificados | 2 (`comercio-pendiente.html`, `comercio-rechazado.html`) |
| Archivos `.js` modificados | 2 (`js/catalogo.js`, `js/auth.js`) |

---

## Backend — endpoint nuevo de este tramo

`GET /api/v1/pedidos/comercio/resumen-hoy` (rol `COMERCIO`, ya cubierto por el matcher existente `/api/v1/pedidos/comercio/**` en `SecurityConfig` — sin cambios ahí) — `ResumenPedidosHoyResponseDTO` (`totalFacturadoHoy`, `cantidadPedidosHoy`, `cantidadPendientes`). Ver la entrada de `docs/DECISIONES.md` de este tramo para la regla de negocio completa (deuda técnica marcada explícitamente).

**Ampliación de `PedidoResponseDTO`:** suma `nombreCliente` (antes solo exponía `clienteId`). Gap real encontrado al diseñar la lista de "Pedidos activos" de CO33: el comercio necesita mostrar el nombre del cliente de cada pedido, y a diferencia del gap simétrico de `nombreComercio` (Tramo 4, resuelto trayendo `GET /catalogo/comercios` porque es dato público), acá no hay ningún catálogo público de clientes — los datos de un Cliente no son públicos. Se resolvió agregando el campo directamente al DTO (mismo criterio que la ampliación de `ClienteResponseDTO.direccion` en el Tramo 3): `PedidoService.aResponseDTO` ya tenía la entidad `Cliente` cargada, solo hacía falta exponer `personaFisica.nombre + " " + apellido`. Sin impacto en los consumidores existentes (`pedidos.html`/`pedido-detalle.html` del Cliente, Tramo 4) — es un campo agregado, no uno modificado.

---

## Endpoints reales usados (confirmados antes de programar, ninguno inventado)

- `GET /api/v1/comercios/perfil` — estado real del comercio logueado (CO01/CO28/CO33) y datos para precargar la edición (CO29).
- `PUT /api/v1/comercios/perfil` — edición de perfil (CO29), ya existente desde la Fase 11, sin cambios.
- `GET /api/v1/pedidos/comercio/resumen-hoy` — nuevo, ver arriba.
- `GET /api/v1/pedidos/comercio` — listado completo, filtrado del lado del cliente a `PENDIENTE`/`EN_PREPARACION` para la sección "Pedidos activos" de CO33 (no acotado a "hoy" — a diferencia de las 3 métricas, un pedido activo sigue siendo relevante mostrarlo aunque no sea de hoy, dado que el MVP no tiene ningún mecanismo de expiración de pedidos).
- `GET /api/v1/notificaciones/no-leidas/contador` — badge de la campana del header de CO33, mismo endpoint ya usado por el Cliente desde el Tramo 4 (genérico por usuario autenticado, sin restricción de rol en `SecurityConfig`).

**Confirmado, no agregado:** no existe un Centro de Notificaciones propio para Comercio (la campana de CO33 es solo indicador + contador, sin link — la nota de `docs/PANTALLAS-MVP-FASE15.md` §4.3 ya advertía este hueco explícitamente como "anotado, no agregado, salvo que se pida", y no se pidió en este tramo).

---

## Sobre la numeración CO33 vs. CO03

`docs/PANTALLAS-MVP-FASE15.md` §4.3 ya dejaba reservado el nombre `CO33` (numeración provisoria, siguiente disponible tras CO32) para esta pantalla, con una especificación funcional basada únicamente en endpoints ya implementados. El dueño del proyecto la agregó después a su propio Figma como **"CO03 · Comercio — Dashboard: Panel Completo (MP Vinculado, Operando)"** — verificado antes de nombrar el archivo que `CO03` ya está tomado en el catálogo cerrado de Fase 15 (`docs/PANTALLAS-MVP-FASE15.md` §2.1: `CO02`/`CO03`/`CO06`.../`CO10` excluidos por MercadoPago/Pago). Se usó `comercio-dashboard.html` como nombre de archivo (siguiendo `CO33`, no `CO03`, para evitar la colisión), con esta nota como referencia cruzada — mismo criterio que ya usan otras pantallas de este catálogo cuando el nombre de archivo y el código de capa de Figma no coinciden 1 a 1.

---

## Cobertura de Figma en este tramo — dos intentos, ambos sin éxito

1. **MCP de Figma:** se probó `whoami` (respondió normalmente, confirma que la sesión OAuth del MCP sigue activa como `bukle.arg@gmail.com`, plan Starter) seguido de `get_metadata` sobre el nodo raíz del prototipo (`140:2`) — mismo error de límite total de llamadas ya documentado en el Tramo 4 ("You've reached the Figma MCP tool call limit on the Starter plan"). La cuota no se restableció entre sesiones.
2. **Fallback con el navegador (Playwright vía Claude Browser) contra la URL pública del prototipo:** se navegó a la URL exacta provista (`.../Bajoneá?node-id=140-2&p=f&t=...`) en una pestaña nueva del panel de navegador. La página carga el canvas de edición de Figma (no requiere login para esa vista de solo lectura del lienzo, en modo "vista"). Pero tanto el botón **"Presentar"** como **"Vista de prototipo"** — los dos caminos para entrar al modo presentación real que pedía la consigna — disparan un modal **"Registrarse en Figma"** (Google / email), porque esta pestaña del navegador no tiene ninguna sesión de Figma iniciada (es un contexto de navegador distinto y sin cookies del token OAuth que usa el servidor MCP). No se intentó iniciar sesión — entrar credenciales de terceros en un formulario de login está fuera de lo que se puede hacer sin la acción explícita del usuario, y tampoco se tienen esas credenciales. Conclusión: el prototipo **no es alcanzable en modo presentación sin una sesión de Figma autenticada en el navegador**, más allá de si el archivo en sí tiene permisos de "cualquiera con el link" — la superficie de "Presentar"/"Vista de prototipo" exige login igual.

**Resultado:** cero cobertura real de Figma en este tramo, por dos motivos distintos e independientes (cuota agotada del lado del MCP, muro de login del lado del navegador). Las 4 pantallas se construyeron replicando el sistema de diseño ya establecido en los Tramos 1-4 (mismos tokens de `styles.css`, mismos componentes `summary-card`/`pedido-card`/`status-badge`/`bottom-nav`) más la referencia visual concreta que aportó el dueño del proyecto para CO33 (imagen adjunta en el pedido de esta sesión, no un archivo de Figma) — la única pantalla de este tramo con una referencia visual real detrás.

---

## Probado end-to-end contra el backend real (no simulado)

Con el backend Spring Boot real (perfil `test`, credenciales de Cloudinary provistas para esta sesión) y el frontend servido por `python -m http.server`:

1. **Cuentas de prueba preparadas:** contraseña de `comercio1.demo@bajonea.test` y `cliente.demo@bajonea.test` fijadas a un valor conocido (`Demo1234`) vía el flujo real de recuperación de contraseña (mismo mecanismo ya documentado para el admin en el cierre de Fase 16a) — no se tenían registradas de sesiones anteriores. Se creó además un comercio de prueba descartable, `comercio.pendiente.demo@bajonea.test` (comercio id 40, `PENDIENTE`, email verificado), porque los 2 comercios demo existentes (`Sabores Fueguinos`/`Pizzas del Sur`) ya estaban ambos `APROBADO` y este tramo necesitaba un caso `PENDIENTE` real.
2. **CO01 con el comercio realmente `PENDIENTE`:** login con `comercio.pendiente.demo@bajonea.test` → redirige a `comercio-pendiente.html` → contenido real (`GET /comercios/perfil` confirma `estado=PENDIENTE` antes de renderizar), sin errores de consola.
3. **Guard de estado confirmado en los 3 sentidos, no solo el pedido explícitamente:** con la sesión `PENDIENTE` activa, navegación directa a `comercio-dashboard.html` (URL) → redirige de vuelta a `comercio-pendiente.html` sin mostrar ningún dato — confirma que el backend no bloquea por estado (cualquier `COMERCIO` autenticado puede llamar `/pedidos/comercio/resumen-hoy`, el gate es 100% de frontend) pero el guard de `comercio.js` sí lo hace. Se repitió cambiando el comercio de prueba a `RECHAZADO` por `UPDATE` directo (temporal, revertido a `PENDIENTE` al terminar la prueba, como pedía la consigna): login → redirige a `comercio-rechazado.html`; navegación directa a `comercio-dashboard.html` → redirige de nuevo a `comercio-rechazado.html`. Y el caso inverso: con el comercio ya vuelto a `PENDIENTE`, navegación directa a `comercio-rechazado.html` → redirige a `comercio-pendiente.html`. Los 3 estados protegen contra los otros 2, no solo el caso pedido explícitamente.
4. **CO33 con datos reales de `comercio1.demo` (`Sabores Fueguinos`, `APROBADO`):** se prepararon 3 pedidos reales de hoy contra ese comercio — `#13` (`EN_PREPARACION`, $1.200, ya existente del Tramo 4), `#14` (`RECHAZADO`, $4.500, ya existente del Tramo 4) y `#16` (`PENDIENTE`, $2.400, creado en esta sesión agregando "Empanada de Carne" x2 al carrito de `cliente.demo` y confirmando el pedido como retiro). `GET /pedidos/comercio/resumen-hoy` devolvió `{totalFacturadoHoy: 1200.00, cantidadPedidosHoy: 1, cantidadPendientes: 1}` — confirma la regla de negocio exacta: el `RECHAZADO` de $4.500 no se sumó a ningún contador. Repetido contra la UI real (no solo `curl`): el dashboard mostró los mismos 3 números, más la lista de "Pedidos activos" con `#13` ("En preparación", "Hace 3 h") y `#16` ("Nuevo", "Recién"), badge "1 nuevo" junto al título de la sección, y el nombre real del cliente ("Maria Sosa") en ambas tarjetas — sin `#14` (`RECHAZADO`) en la lista.
5. **Banner de estado real:** con los horarios reales de `Sabores Fueguinos` cargados desde la Fase 16a (Lunes 11-15/20-23:30, etc.), el banner mostró "Tu comercio está cerrado en este momento. 11:00 - 15:00 / 20:00 - 23:30" — coincide con el horario real y la hora de la corrida de pruebas, reutilizando `estadoHorario` sin lógica duplicada.
6. **CO28 con datos reales:** nombre, email de contacto, razón social y CUIT del comercio real, todos desde `GET /comercios/perfil`.
7. **CO29 con edición real persistida, confirmada con un `GET` posterior, no solo por la respuesta del `PUT`:** se cambió la descripción del comercio, se guardó (`PUT /comercios/perfil` → `200`), se recargó la página completa (`navigate`, no solo re-render en memoria) y se confirmó con un `SELECT` directo contra `comercio.descripcion` en la base — la persistencia es real, no un eco del `PUT`. Confirmado también el prellenado correcto del formulario de edición: el teléfono real (`+5492964111111`) se mostró sin el prefijo `+549` en el campo (`2964111111`), y los switches de modalidad reflejaron el estado real (`true`/`true`). La descripción se dejó restaurada a su valor original limpio al finalizar la sesión de pruebas (no se dejó el texto de prueba visible en el catálogo público).
8. **Caso de error real:** edición con ambas modalidades de entrega desactivadas → banner "Debés ofrecer al menos una modalidad de entrega." y **ningún** `PUT` disparado (confirmado revisando la pestaña de red) — la validación de cliente cortó antes de llamar al backend, mismo criterio ya usado en `registro-comercio.html`.
9. **Links del bottom nav de Comercio a pantallas de tramos futuros** (`comercio-productos.html`, `comercio-pedidos.html`) → `404` real esperado, sin errores de JavaScript en consola — mismo criterio que los links de Cliente a `admin/pendientes.html` en el Tramo 1.
10. Consola del navegador revisada en cada paso (`read_console_messages`) — sin errores en ningún punto del recorrido.
11. Regla de "cero comentarios en `frontend/`" verificada con `grep` sobre `js/comercio.js`, `comercio-dashboard.html`, `comercio-perfil.html`, los 2 archivos `.html` modificados, `js/catalogo.js`, `js/auth.js` y el bloque nuevo de `styles.css`.

**Datos que quedan en la base al cierre de esta sesión (a diferencia de datos descartables de tramos anteriores):**
- Pedido `#16` (`PENDIENTE`, `cliente.demo` → `Sabores Fueguinos`, $2.400) — se suma a los pedidos `#13`/`#14`/`#15` ya dejados en el Tramo 3/4 como parte de la cuenta de demo persistente; útil para que una futura sesión de Comercio (aceptar/rechazar pedidos) tenga un pedido `PENDIENTE` real esperando acción.
- Comercio de prueba `comercio.pendiente.demo@bajonea.test` (id 40, `PENDIENTE`, email verificado, contraseña `Demo1234`) — dejado a propósito en ese estado para que la próxima sesión de Comercio siga teniendo un caso `PENDIENTE`/`RECHAZADO` real sin tener que crear uno de nuevo. Explícitamente descartable si una fase futura ya no lo necesita.
- Contraseñas de `comercio1.demo@bajonea.test` y `cliente.demo@bajonea.test` fijadas a `Demo1234` — sobrescriben cualquier contraseña previa de sesiones anteriores (mismo aviso ya dado para el admin en el cierre de Fase 16a).

## Checklist de cierre del Tramo 5

- [x] Confirmado antes de programar: `CO03` ya estaba tomado en el catálogo cerrado de Fase 15 — se usó `CO33`/`comercio-dashboard.html`, con la referencia de Figma del usuario documentada aparte, no como nombre real.
- [x] Confirmado antes de programar: el estado `RECHAZADO` de Comercio no requiere una pantalla de dashboard propia en el catálogo de Fase 15 — ya resuelto por `comercio-rechazado.html` desde el Tramo 1, ajena a este tramo salvo por el guard de estado real agregado ahora.
- [x] Backend: endpoint `GET /pedidos/comercio/resumen-hoy` nuevo, regla de negocio implementada exactamente como se pidió (`EN_PREPARACION` cuenta, `PENDIENTE` cuenta aparte, `RECHAZADO` no cuenta en nada) y verificada con datos reales incluyendo un `RECHAZADO` de hoy que efectivamente no sumó a ningún contador.
- [x] `PedidoResponseDTO.nombreCliente` agregado y confirmado sin romper los consumidores existentes del Cliente (Tramo 4).
- [x] Las 4 pantallas (CO01, CO28, CO29, CO33) construidas y probadas contra datos reales, ninguna con datos mockeados.
- [x] Guard de estado real (`PENDIENTE`/`APROBADO`/`RECHAZADO`) probado en los 3 sentidos, no solo el caso pedido explícitamente — confirmado que el backend no bloquea por estado y que el gate es responsabilidad del frontend.
- [x] Edición de perfil (CO29) probada con persistencia confirmada por recarga completa + `SELECT` directo, no solo la respuesta del `PUT`.
- [x] Caso de error de validación de cliente probado, confirmando que no llega a pegarle al backend.
- [x] Intento real de Figma (MCP + fallback de navegador) documentado con el motivo exacto de cada fallo, no asumido ni ocultado.
- [x] Regla de "cero comentarios en `frontend/`" verificada con `grep`.
- [x] Datos que quedan en la base (pedido `#16`, comercio de prueba `PENDIENTE`, contraseñas fijadas) documentados explícitamente, no dejados como residuo silencioso.

Con esto, el Tramo 5 de 9 de la Fase 16 queda cerrado. Siguen los tramos 6 a 9 (CRUD de Producto del Comercio, lista/gestión de Pedidos del Comercio, panel de Administrador, etc.) en sesiones futuras.
