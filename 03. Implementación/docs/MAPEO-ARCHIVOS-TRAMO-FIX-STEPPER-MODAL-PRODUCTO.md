# Mapeo de archivos — Fix: estado inicial del botón "−" del stepper de cantidad

## Contexto

Bug reportado como "el botón '−' del stepper de cantidad en el carrito no arranca deshabilitado
en cantidad 1". Auditoría real del código encontró una discrepancia con el enunciado del pedido:
el bug no está en `carrito.html`/`js/carrito.js` — ese stepper no deshabilita nunca el botón "−",
por diseño intencional (en cantidad 1 el ícono cambia a un tacho de basura para eliminar el ítem
completo, ver `js/carrito.js` líneas 147-151, confirmado correcto en
`docs/AUDITORIA-EXHAUSTIVA-CLIENTE.md` líneas 126-128).

El bug real, con el mismo síntoma descripto ("no reproduce el piso visualmente hasta el primer
click"), ya estaba documentado como no corregido en
`docs/MAPEO-ARCHIVOS-TRAMO-PLAYWRIGHT-MATRIZ-CLIENTE.md` (líneas 122-129, punto 8): el stepper del
**modal de producto** (`comercio-detalle.html`, función de render en `js/catalogo.js`).

Confirmado con Diego antes de tocar código (`AskUserQuestion`, opción elegida: "Corregir
catalogo.js") — se corrigió el componente real, no `carrito.js`.

## Archivos modificados

- [frontend/js/catalogo.js](../frontend/js/catalogo.js) — línea agregada `minusBtn.disabled = cantidad <= 1;`
  inmediatamente después de crear `minusBtn` (antes de `stepper.appendChild(minusBtn)`, dentro de la
  función que arma el modal de producto, cerca de la línea 718-736). `actualizarStepper()` (línea
  763-768) ya tenía la lógica correcta (`minusBtn.disabled = cantidad <= 1`) pero solo se invocaba
  desde los listeners de clic (`minusBtn`/`plusBtn`, líneas 770-777), nunca al crear el nodo. Fix
  mínimo y quirúrgico: una sola línea, sin tocar `actualizarStepper()` ni la lógica de clic (que ya
  funcionaba bien).

## Archivos NO modificados (auditados, descartados como ubicación del bug)

- `frontend/js/carrito.js` — stepper de `carrito.html`, diseño distinto e intencional (delete-on-1
  en vez de disable-on-1), sin bug.

## Archivos leídos como fuente/contexto

- `frontend/js/carrito.js` (líneas 96-194, componente `renderItem`)
- `frontend/js/catalogo.js` (líneas 700-790, modal de producto)
- `docs/AUDITORIA-EXHAUSTIVA-CLIENTE.md` (líneas 120-145, 300-320, 570-650)
- `docs/MAPEO-ARCHIVOS-TRAMO-PLAYWRIGHT-MATRIZ-CLIENTE.md` (líneas 105-230)
- `docs/DECISIONES.md` (búsqueda de contraseñas de cuentas demo, líneas 984-2280 aprox.)

## Verificación (navegador real, backend real)

**Backend detectado:** el proceso ya corriendo en el puerto 8080 (iniciado fuera de esta sesión)
resultó apuntar a **`bajonea_test`**, no a `bajonea_final` — confirmado comparando
`SELECT id, nombre FROM comercio` entre ambas bases vía `mysql.exe` (los ids/nombres de
`GET /catalogo/comercios` coincidieron exactamente con filas de `bajonea_test`, comercios `E2E` de
Playwright). El perfil `test` está activo (`GET /api/v1/test/token-verificacion` da 404 solo por
ausencia de token pendiente, no por perfil inactivo — confirmado con `TestController.java`,
`@Profile("test")`). Toda la evidencia de esta parte es contra `bajonea_test`, sin mezclar con
`bajonea_final`.

**Cuenta demo persistente `cliente.demo@bajonea.test` no usada:** el login con la contraseña
documentada (`Demo1234`) devolvió `401` tanto por `curl` como desde el navegador — esa cuenta vive
en `bajonea_final`, no en `bajonea_test` (el backend corriendo apunta a la segunda), así que el
fallo es esperable, no un incidente. Se descartó seguir intentando contra esa cuenta para no
arriesgar un bloqueo por intentos fallidos.

**Cuenta de verificación creada (descartable, limpiada al final):**
`verif.stepper.1788420497@bajonea.test`, registrada vía `POST /auth/registro/cliente` real,
verificada vía el bypass real de `GET /api/v1/test/token-verificacion` (perfil `test`) +
`POST /auth/verificar` con el código real devuelto. Login real por UI (`login.html`, con
`click()` disparado vía `javascript_tool` porque el click nativo del panel de navegador tiene un
timeout de compositing conocido en este entorno — confirmado documentado en sesiones previas del
propio proyecto, `docs/MAPEO-ARCHIVOS-TRAMO16.25.md`/`TRAMO16.26.md`).

**Casos probados en `comercio-detalle.html?id=2` (comercio `APROBADO`, abierto, con producto
`DISPONIBLE` real — "Comercio Abierto E2e 178841858961614164", producto id 1):**

1. Modal abierto por primera vez, cantidad inicial = 1 → `minusBtn.disabled === true` confirmado
   por inspección real del DOM (`document.querySelectorAll('.stepper__btn')`), sin ningún clic
   previo. Antes del fix este caso daba `false`.
2. Cantidad subida a 3 (2 clics reales en "+") → `minusBtn.disabled === false`, botón habilitado
   como corresponde.
3. Cantidad bajada de 3 a 1 (2 clics reales en "−", comportamiento post-clic que ya funcionaba) →
   `minusBtn.disabled === true` de nuevo — confirmado que el fix no rompe la lógica de clic
   existente.

## Limpieza de datos de prueba

Cuenta `verif.stepper.1788420497@bajonea.test` (`usuario.id = 54` en `bajonea_test`) eliminada por
completo vía `DELETE` directo, en orden seguro de FK: `item_carrito` → `carrito` → `notificacion`
→ `sesion` → `token` → `direccion` → `cliente` → `persona_fisica` → `persona` → `usuario`.
Confirmado con `SELECT COUNT(*)` sobre las 9 tablas afectadas filtrando por `id`/`usuario_id`/
`cliente_id = 54`: las 9 en cero filas.

Servidor de frontend (`preview_start name: "frontend"`, puerto 5501) detenido al finalizar. El
backend en el puerto 8080 no fue tocado (no se inició ni se detuvo desde esta sesión — ya estaba
corriendo antes de empezar).
