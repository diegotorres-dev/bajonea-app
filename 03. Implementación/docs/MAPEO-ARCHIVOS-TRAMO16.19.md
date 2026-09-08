# Mapeo pantallas ↔ archivos — Tramo 16.19 (ajustes de registro-comercio + notificaciones vinculadas a pedido)

Segundo sub-tramo del testing manual de Comercio, continuación directa del Tramo 16.18. Cubre 6 hallazgos nuevos de testing manual (puntos 14-19, ninguno en el relevamiento original) más el gap de modelo de notificaciones ya planificado (puntos 4/11/12 del relevamiento original). Se mapea punto↔archivos, mismo formato que `docs/MAPEO-ARCHIVOS-TRAMO16.18.md`.

Todo lo documentado acá fue verificado con interacción real en navegador contra el backend real (perfil `test`, credenciales reales de Cloudinary, MySQL real) — ver `docs/DECISIONES.md`, entrada "Tramo 16.19" del 2026-07-29, para el detalle completo de decisiones y evidencia.

---

## Punto 14 — CUIT: quitar hint, limitar a 11 dígitos, simplificar error

| Archivo | Cambio |
|---|---|
| `frontend/registro-comercio.html` | `<p class="field__hint">Sin guiones - validación automática.</p>` eliminado. Input `cuit` suma `maxlength="11"`. |
| `frontend/js/auth.js` | Listener nuevo en `cuit` (`input`): filtra a `replace(/\D/g,'').slice(0,11)`, impide tipear letras/símbolos o superar 11 dígitos. Mensaje de error simplificado a "Ingresá un CUIT válido." (2 ocurrencias: blur y submit). |

---

## Punto 15 — Placeholders de nombre/apellido genéricos (Cliente + Comercio)

| Archivo | Cambio |
|---|---|
| `frontend/registro-cliente.html` | `nombre`: placeholder "Diego" → "Nombre"; `apellido`: "Torres" → "Apellido". |
| `frontend/registro-comercio.html` | `nombreRepresentante`: "Diego" → "Nombre"; `apellidoRepresentante`: "Torres" → "Apellido". |

---

## Punto 16 — Sin toasts nativos en el paso Horarios

| Archivo | Cambio |
|---|---|
| `frontend/registro-comercio.html` | `form-step-3` suma `novalidate`. Causa raíz real: era el único de los 3 pasos con un botón `type="submit"`, y sin `novalidate` el navegador ejecutaba su validación nativa sobre los `required` de horario **antes** de que corriera el `submit` handler — que ya tenía lógica de validación propia con banner personalizado desde antes del Tramo 16.18, pero nunca llegaba a ejecutarse. |

Sin cambios de JS — la lógica de validación (banners `renderBanner`) ya existía en `js/auth.js` y quedó habilitada con el solo atributo.

---

## Punto 17 — Bloquear horarios duplicados exactos

| Archivo | Cambio |
|---|---|
| `frontend/js/auth.js` | `Set` de claves `"{diaSemana}|{horaApertura}|{horaCierre}"` agregado al loop de validación de horarios (mismo `submit` handler del Punto 16) — banner de error nuevo si una clave se repite. Solapamientos parciales quedan fuera de alcance (confirmado por Diego). |

---

## Punto 18 — Flecha de volver oculta en pantalla de éxito de registro

| Archivo | Cambio |
|---|---|
| `frontend/js/auth.js` | `#back-btn` recibe `.is-hidden` junto con `wizard-container`/`step-progress-container` al mostrar `exito-container`. |

**Fuera de alcance, dejado como observación:** `registro-cliente.html` tiene el mismo problema (header compartido, `#back-btn` no se oculta en su success screen) — no pedido para Cliente, sin tocar.

---

## Punto 19 — `comercio-pendiente.html`: texto roto + botón de acción

| Archivo | Cambio |
|---|---|
| `frontend/comercio-pendiente.html` | `<p>Sesión iniciada como {email}</p>` eliminado. Botón "Cerrar sesión" → "Ir a la pantalla principal", `addEventListener('click', () => logout('index.html'))`. |
| `frontend/js/auth.js` | `logout()` → `logout(destino = 'login.html')`. |
| `frontend/js/cliente.js` | `addEventListener('click', logout)` → `addEventListener('click', () => logout())` — fix defensivo obligatorio (ver nota abajo), sin cambio de comportamiento. |
| `frontend/js/comercio.js` | Ídem, mismo fix defensivo. |
| `frontend/comercio-rechazado.html` | Ídem, mismo fix defensivo — página no tocada en ningún otro aspecto. |

**Por qué se tocaron 3 archivos no pedidos:** `logout` se usaba en 4 lugares como referencia cruda de callback (`addEventListener('click', logout)`). Con la nueva firma `logout(destino = 'login.html')`, el `MouseEvent` del click hubiera llegado como `destino` y roto la redirección en los 4 casos (el `toString()` de un evento no es una URL válida). Envueltos en `() => logout()` para preservar exactamente el comportamiento que ya tenían (siguen yendo a `login.html`) — cambio defensivo obligatorio, no scope creep.

---

## Gap de modelo — `Notificacion.pedido_id` (puntos 4/11/12)

| Archivo | Cambio |
|---|---|
| `backend/.../db/migration/V17__notificacion_pedido_id.sql` | Nuevo — `ALTER TABLE notificacion ADD COLUMN pedido_id INT NULL, ADD CONSTRAINT fk_notificacion_pedido FOREIGN KEY (pedido_id) REFERENCES pedido (id)`. |
| `backend/.../entities/Notificacion.java` | Campo `pedido` nuevo (`@ManyToOne`, `nullable = true`). |
| `backend/.../dto/response/NotificacionResponseDTO.java` | Campo `pedidoId` nuevo (`Integer`, nullable). |
| `backend/.../services/NotificacionService.java` | `crear(usuarioId, mensaje)` delega en `crear(usuarioId, mensaje, pedidoId = null)` nuevo — los 2 call sites que no son de pedido (`AdministradorService`, `ProductoService`) no se tocaron. |
| `backend/.../services/AdministradorService.java` | Mensaje de aprobación: `"Tu comercio 'X' fue aprobado."` → `"Tu comercio fue aprobado."` (Punto 4). Rechazo sin cambios (no pedido). |
| `backend/.../services/PedidoService.java` | 3 sitios: nuevo pedido (suma apellido del cliente + `pedidoId`, Punto 11), aceptado (suma nombre del comercio al mensaje + `pedidoId`, Punto 12), rechazado (mensaje sin cambios, suma `pedidoId`). |
| `frontend/js/notificaciones.js` | Contenedor de cada notificación pasa de `<button>` a `<div>` (un `<a>` real no puede anidarse en `<button>`). Cuando `notificacion.pedidoId` existe, se agrega `<a class="link">Ver pedido</a>` → `comercio-pedido-detalle.html?id=X` (rol COMERCIO) o `pedido-detalle.html?id=X` (rol CLIENTE). Guard `event.target.closest('a')` para que clickear el link no dispare también el `PUT .../leida` del click-to-marcar-leída (se conserva sobre el resto del div). |

---

## Verificado en esta sesión (cierre formal)

- `./mvnw compile` → `BUILD SUCCESS` (2 veces: antes y después del gap de modelo).
- Migración V17 aplicada limpia contra la base real: `Successfully applied 1 migration to schema bajonea, now at version v17`.
- CUIT filtrado en tiempo real confirmado (`"abc123-456xyz789012"` → `"12345678901"`), mensaje de error simplificado confirmado.
- Dos franjas idénticas (lunes 09-20 repetido) bloqueadas con el banner nuevo, sin ningún toast nativo del navegador; franjas de días distintos aceptadas sin problema.
- Registro completo con `back-btn` confirmado oculto en la pantalla "Registro enviado".
- Flujo de pedido real de punta a punta: comercio nuevo aprobado → notificación "Tu comercio fue aprobado." (sin nombre, sin botón "Ver pedido" porque `pedidoId` es `null`) → producto creado → cliente real agrega al carrito y confirma pedido #30 → notificación de Comercio "Nuevo pedido recibido de Valentina Fernandez." con botón "Ver pedido" → click real navega a `comercio-pedido-detalle.html?id=30` con el pedido correcto → comercio acepta el pedido → notificación de Cliente "Tu pedido a Pizzeria Test 1619c fue aceptado y está en preparación." con botón "Ver pedido" → click real navega a `pedido-detalle.html?id=30`.
- Confirmado que clickear el texto de una notificación (no el link) sigue marcando como leída (`PUT /notificaciones/93/leida` → `200`) — sin regresión al cambiar `<button>` por `<div>`.
- Sin errores de consola en toda la sesión.

**Pendiente de verificación por Diego (comunicado explícitamente, no un gap silencioso):** el cambio de firma de `logout()` se probó de punta a punta solo en el flujo de `comercio-pendiente.html` (el pedido original). Diego va a probar por su cuenta los otros 4 usos ya existentes (modal de confirmación de logout en perfil de Cliente, perfil de Comercio, y `comercio-rechazado.html`) — si encuentra algo raro, lo reporta como corrección puntual.

---

## Resumen numérico

| | Cantidad |
|---|---|
| Puntos del tramo | 9 (14-19 + 4/11/12) |
| Archivos backend nuevos | 1 (`V17__notificacion_pedido_id.sql`) |
| Archivos backend modificados | 4 (`Notificacion.java`, `NotificacionResponseDTO.java`, `NotificacionService.java`, `PedidoService.java`, `AdministradorService.java` — 5 en total) |
| Archivos frontend modificados | 8 (`registro-comercio.html`, `registro-cliente.html`, `comercio-pendiente.html`, `comercio-rechazado.html`, `js/auth.js`, `js/cliente.js`, `js/comercio.js`, `js/notificaciones.js`) |
| Datos de prueba en la base real (a borrar por Diego) | Comercio id 49 "Pizzeria Test 1619" (`comercio1619b@bajonea.test`, sin pedidos); Comercio id 50 "Pizzeria Test 1619c" (`comercio1619c@bajonea.test`) con producto id 44 y pedido id 30 (`EN_PREPARACION`); Cliente `cliente1619@bajonea.test` (Valentina Fernandez); producto id 43 "Pizza Muzzarella" del comercio 49 |

Cierre confirmado por Diego el 2026-07-29.
