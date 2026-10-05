# Mapeo pantallas ↔ archivos — Tramo 16.11 (corrección post-cierre de Fase 16)

Tramo de corrección, no un tramo de contenido nuevo de la guía — 12 inconsistencias detectadas por el usuario al recorrer el sistema ya construido en Fase 16. Mismo formato que `docs/MAPEO-ARCHIVOS-TRAMO1.md`–`TRAMO9.md`, adaptado: acá se mapea punto↔archivos en vez de pantalla↔archivos, porque varios puntos no tocan ninguna pantalla nueva.

Diagnóstico previo a programar cualquier cambio: para cada uno de los 12 puntos se confirmó primero, contra el código real (no contra la memoria de `CLAUDE.md`), si la causa que hipotetizó el usuario era exacta. En 5 de los 12 puntos (3 —excluido a propósito—, 7, 8, 10, 12) el código real no reproducía el bug tal como se describió; el detalle de cada caso está documentado en `docs/DECISIONES.md`, entrada "Tramo 16.11" del 2026-07-24.

---

## Punto 1 — Pantalla de ingreso de token de verificación

| Archivo | Cambio |
|---|---|
| `frontend/verificar-email.html` | Reescrita por completo: de una pantalla que solo leía `?token=` de la URL (flujo de link-click) a un formulario real con campos `email` (prefillable vía `?email=`) + `codigo` (6 dígitos) + botón "Verificar cuenta" + botón "Reenviar código", más los 2 estados (`estado-exito`/`estado-error`) ya existentes, reutilizados. |
| `frontend/js/auth.js` | `initVerificarEmail` reescrita: deja de llamar a `GET /auth/verificar/{token}` y pasa a llamar a `POST /auth/verificar` (`{email, codigo}`, endpoint nuevo del punto 2) y `POST /auth/reenviar-verificacion` (nuevo). Filtra el input de código a solo dígitos en tiempo real. |
| `frontend/registro-cliente.html` / `frontend/registro-comercio.html` | El CTA de la pantalla de éxito post-registro pasa de "Ir al inicio de sesión" a "Ingresar código de verificación", con `href` armado dinámicamente por `auth.js` (`verificar-email.html?email=<email del registro>`) para prefillear el campo. |
| Backend | Sin lógica nueva de validación — se confirmó que `AuthService` ya tenía las 4 validaciones pedidas (existe, no usado, no expirado, corresponde al usuario) implementadas desde la Fase 7; el gap era exclusivamente de frontend (no existía ninguna pantalla que las ejercitara manualmente). El endpoint nuevo (`POST /auth/verificar`, ver punto 2) reutiliza el mismo patrón de excepciones (`CredencialesInvalidasException`/`ConflictoDeNegocioException`) que ya usaba `verificarEmail(String token)`. |

---

## Punto 2 — Token de 6 dígitos + límite de intentos + email reescrito

| Archivo | Cambio |
|---|---|
| `backend/.../entities/Token.java` | Campo nuevo `intentosFallidos` (int, `@Setter`, columna `intentos_fallidos`). |
| `backend/.../db/migration/V15__token_intentos_fallidos.sql` | Migración nueva: `ALTER TABLE token ADD COLUMN intentos_fallidos INT NOT NULL DEFAULT 0`. La columna `token` **no cambia de tipo** (sigue `VARCHAR(36)`) — decisión documentada en `docs/DECISIONES.md`: solo `VERIFICACION_EMAIL` pasa a 6 dígitos, `RECUPERACION_PASSWORD`/`REACTIVACION_CUENTA` siguen UUID v4. |
| `backend/.../services/AuthService.java` | Método nuevo `verificarEmailConCodigo(VerificarCodigoRequestDTO)` (reemplaza al flujo primario de `verificarEmail(String)`, que se mantiene solo por compatibilidad con Postman/`TestSupportService`). Método nuevo `reenviarVerificacion(ReenviarVerificacionRequestDTO)`. Método nuevo `generarValorToken(TipoToken)` (6 dígitos para `VERIFICACION_EMAIL`, UUID para el resto) y `registrarIntentoFallidoToken(Token)` (mismo patrón que `registrarIntentoFallido` de `Usuario`, aplicado a `Token`). `@Transactional(noRollbackFor = ...)` ampliado a `ConflictoDeNegocioException.class` — **bug real encontrado y corregido durante la verificación de este mismo tramo**: sin este ajuste, el rollback por defecto deshacía el `save` que invalida el token al superar el máximo de intentos, permitiendo intentos infinitos (ver `docs/DECISIONES.md`). |
| `backend/.../services/RegistroService.java` | `enviarVerificacion` genera el token inicial con el mismo formato de 6 dígitos (`String.format("%06d", SecureRandom.nextInt(1_000_000))`). |
| `backend/.../services/EmailService.java` | `enviarVerificacion` reescrito: de un one-liner con el token pegado a un texto explicando qué hacer con el código, cuánto dura, qué pasa si se agotan los intentos, y qué hacer si no se solicitó la cuenta. |
| `backend/.../dto/request/VerificarCodigoRequestDTO.java` | Nuevo — `email` + `codigo` (`@Pattern(\\d{6})`). |
| `backend/.../dto/request/ReenviarVerificacionRequestDTO.java` | Nuevo — `email`. |
| `backend/.../controllers/AuthController.java` | 2 endpoints nuevos: `POST /auth/verificar` (email+código), `POST /auth/reenviar-verificacion`. |
| `backend/.../config/security/SecurityConfig.java` | `RUTAS_PUBLICAS` suma `/api/v1/auth/verificar` y `/api/v1/auth/reenviar-verificacion`. |
| `docs/DECISIONES.md` | Entrada nueva con la decisión completa (qué, por qué, alcance, mitigación de fuerza bruta, endpoints nuevos). |
| `docs/modelo-mvp.md` | Tabla `token` actualizada: columna `token` documenta el formato dual por `tipo`, fila nueva `intentos_fallidos`. |

---

## Punto 3 — Excluido de este tramo

Sin cambios, por instrucción explícita del usuario (rediseño de `comercio-dashboard.html`/CO33 pospuesto a un tramo de UI aparte).

---

## Punto 4 — Botón flotante de carrito

| Archivo | Cambio |
|---|---|
| `frontend/css/styles.css` | Clase nueva `.fab__badge` (badge blanco sobre el `.fab` naranja ya existente). |
| `frontend/js/catalogo.js` | Funciones nuevas `renderCarritoFab` (crea el botón, gated a rol CLIENTE, navega a `carrito.html`) y `actualizarBadgeCarritoFab` (consulta `GET /carrito` real, sin hardcodear). Se invoca desde `initCatalogo` e `initComercioDetalle`. Se re-invoca también tras un alta exitosa al carrito (`agregarAlCarrito`, en los 2 puntos donde el modal de producto confirma el alta) — bug real encontrado **durante la verificación de este mismo tramo**: sin este segundo llamado, el badge quedaba desactualizado hasta recargar la página, contradiciendo el propio pedido de que sea dinámico. |
| `frontend/checkout.html` | Sin cambios — no tiene `#top-bar-slot` ni se llama a `renderCarritoFab` ahí, así que el FAB queda ausente naturalmente durante el checkout, como se pidió. |

---

## Punto 5 — Selección Cliente/Comercio en el registro

| Archivo | Cambio |
|---|---|
| `frontend/registro-tipo-cuenta.html` | Nueva — 2 opciones (`.delivery-option`, patrón ya usado en el checkout) que navegan a `registro-cliente.html`/`registro-comercio.html`. |
| `frontend/index.html` | Botón "Crear cuenta" pasa de `registro-cliente.html` a `registro-tipo-cuenta.html`. El link secundario "¿Sos un comercio?" no se tocó (ya es una entrada explícita a RC01, no ambigua). |
| `frontend/login.html` | Link "Registrate" pasa de `registro-cliente.html` a `registro-tipo-cuenta.html`. |

---

## Punto 6 — Dashboard de Comercio: métricas no se actualizan

Ambigüedad de nombre documentada en `docs/DECISIONES.md`: el prompt dice "Panel de administrador" pero la descripción técnica corresponde al dashboard de **Comercio** (CO33) — el panel del rol Administrador no tiene ninguna métrica de facturación/pedidos.

| Archivo | Cambio |
|---|---|
| `frontend/js/comercio.js` | `initComercioDashboard` refactorizado: la carga de `resumen-hoy`+`pedidos` pasa a una función `cargarResumenYPedidos` reutilizable, invocada también en `pageshow` (bfcache) y `visibilitychange` — para que volver desde `comercio-pedido-detalle.html` tras aceptar/rechazar un pedido refresque los 3 contadores sin depender de una recarga manual. |
| Backend | Sin cambios — `PedidoService.obtenerResumenHoy` ya calculaba los 3 valores correctamente contra la base real en cada llamada (confirmado leyendo el código, sin caché ni valores hardcodeados). |

---

## Punto 7 — Login bloqueado fuera de horario

**No reproducido en el código.** Sin cambios de código — ver `docs/DECISIONES.md` para el detalle completo de la investigación (grep exhaustivo sobre "horario" en todo el backend, revisión completa de `AuthService.login`/`validarEstadoParaLogin`/`JwtAuthenticationFilter`). Verificado además en vivo: login real de `comercio2.demo@bajonea.test` contra el backend con la app corriendo, sin ningún bloqueo.

---

## Punto 8 — Auto-formateo de miles en precio

| Archivo | Cambio |
|---|---|
| `frontend/comercio-producto-form.html` | Input de precio pasa de `type="number"` a `type="text" inputmode="numeric"`, más un `field__hint` explicando el formato. |
| `frontend/js/comercio.js` | Funciones nuevas `formatearMilesInput` (progresión 10 → 100 → 1.000 → 10.000 mientras se tipea) y `precioDesdeInput` (limpia los puntos antes de mandar al backend). Aplicadas tanto al cargar el formulario en modo edición (formatea el valor existente) como al escribir. Validación nueva antes de enviar: precio parseado debe ser un número finito `> 0`. |

Confirmado por revisión de código que la hipótesis original de Diego (coma/punto mal interpretado) no se sostenía — el `type="number"` anterior ya normalizaba el valor correctamente. El auto-formateo se implementó igual, como mejora de UX pedida explícitamente, no como corrección de un bug.

---

## Punto 9 — Campanita de notificaciones del comercio

| Archivo | Cambio |
|---|---|
| `frontend/js/comercio.js` | `renderHeaderDashboard`: el `<span>` no clickeable de la campanita pasa a ser un `<a href="notificaciones.html">`. Función `cargarBadgeBell` renombrada a `actualizarBadgeBell` (limpia el badge anterior antes de re-consultar, para poder llamarse repetidas veces) y se agrega un `setInterval` de 15s (mismo intervalo que `js/notificaciones.js`) mientras el dashboard está abierto. |
| `frontend/js/notificaciones.js` | Guard de `initNotificaciones` ampliado de `rol !== 'CLIENTE'` a `rol !== 'CLIENTE' && rol !== 'COMERCIO'` — antes expulsaba a cualquier Comercio a `login.html`. |
| Backend | Sin cambios — confirmado que `PedidoService` ya notificaba al `usuarioId` correcto del Comercio en pedido nuevo, y que `GET /notificaciones`/`GET /notificaciones/no-leidas/contador` ya eran alcanzables por cualquier rol autenticado (`SecurityConfig` no los restringe a CLIENTE). El gap era 100% de frontend. |

---

## Punto 10 — Falta opción de retiro en checkout

**No reproducido en el código.** Sin cambios — `checkout.js` ya construye ambas opciones (DOMICILIO/RETIRO) dinámicamente según `comercio.aceptaDelivery`/`aceptaRetiro`, y `PedidoService.confirmarPedido` ya valida ambos flags y exige `direccionId` solo para DOMICILIO. Ver `docs/DECISIONES.md` para el detalle.

---

## Punto 11 — Subida de imágenes en creación de producto

| Archivo | Cambio |
|---|---|
| `frontend/js/comercio.js` | Flujo de creación pasa a 2 pasos transparentes: al crear (`POST /productos` exitoso), en vez de redirigir a `comercio-productos.html`, redirige a `comercio-producto-form.html?id=<id nuevo>&creado=1` — la misma pantalla, ahora en modo edición, donde la galería de fotos ya estaba habilitada desde antes. `initComercioProductoForm` muestra un banner informativo ("Producto creado. Ahora podés agregarle hasta 5 fotos.") cuando detecta `?creado=1`. |
| Backend | Sin cambios — confirmado que el diseño actual (galería requiere `productoId` real para firmar contra Cloudinary) es una restricción de diseño válida, no un bug; se resolvió del lado del flujo, no del backend. |

---

## Punto 12 — Doble confirmación al descontinuar producto

| Archivo | Cambio |
|---|---|
| `frontend/js/comercio.js` | `mostrarModalConfirmarDescontinuar`: se agrega un `checkbox-row` ("Entiendo que esta acción es irreversible") y el botón "Sí, descontinuar" arranca `disabled`, habilitándose solo al tildar el checkbox. No se tocó el flujo de "Agotado"/"Disponible" (reversible, sin este refuerzo). |

---

## Verificado end-to-end contra el backend y la base reales

Sesión completa con el backend levantado contra MySQL real (XAMPP) y el frontend servido por `python -m http.server` (`.claude/launch.json`):

- **Puntos 1/2:** registro de cliente real → token de 6 dígitos confirmado en la base (`SELECT`, `LENGTH=6`) → intento con código incorrecto → `401`, contador sube a 1 en la base → 4 intentos más → 5to intento → `409` "Superaste el máximo" → confirmado `usado=1`/`intentos_fallidos=5` en la base (bug de rollback encontrado y corregido en el camino, ver arriba) → `POST /auth/reenviar-verificacion` → nuevo token de 6 dígitos generado, el viejo queda invalidado → verificación con el código correcto → `200`, `usuario.estado` pasa a `ACTIVO` en la base → login exitoso con JWT real. Repetido además desde el navegador real (Browser pane) contra `verificar-email.html`: email prefilleado desde `?email=`, código tipeado, cuenta activada, confirmado en la base.
- **Punto 4:** login real como `cliente.demo`, agregado de un producto al carrito desde `comercio-detalle.html` → badge del FAB pasa de ausente a "1" sin recargar; segundo agregado → badge pasa a "2" en vivo. Confirmado ausente en `checkout.html`.
- **Punto 6:** `GET /pedidos/comercio/resumen-hoy` real devuelve `{totalFacturadoHoy:0, cantidadPedidosHoy:0, cantidadPendientes:0}` (correcto, sin pedidos nuevos hoy) contra el comercio demo real.
- **Punto 7:** login real de `comercio2.demo` exitoso con la app corriendo, sin ningún bloqueo.
- **Punto 8:** tipeado "10000" en el input de precio → se ve "10.000" en tiempo real → al crear el producto, `SELECT precio FROM producto` confirma `10000.00` (limpio, sin el punto).
- **Punto 9:** login real de `comercio2.demo` → campanita visible en el dashboard con badge "4" (coincide con `GET /notificaciones/no-leidas/contador` real) → click → `notificaciones.html` carga la lista real de notificaciones del comercio sin redirigir a `login.html`.
- **Punto 11:** creación real de un producto → redirección automática a `?id=<real>&creado=1` → banner mostrado → tile "Agregar" de fotos presente y habilitado (antes ausente en creación).
- **Punto 12:** modal de "Descontinuar" con el botón deshabilitado hasta tildar el checkbox, confirmado vía `element.disabled` antes/después del click.

Sin errores de consola en ningún paso de la verificación en el navegador (`read_console_messages`). Datos de prueba desechables (2 cuentas de cliente creadas para probar el flujo de verificación, 1 producto de prueba en `comercio2.demo`) eliminados de la base al finalizar; las contraseñas de `cliente.demo`/`comercio2.demo` fueron reseteadas vía el flujo real de recuperación de contraseña para poder loguearlas durante la verificación (mismo mecanismo que usa cualquier usuario real, sin acceso directo a la base).

`./mvnw compile` → `BUILD SUCCESS` en cada punto de control. `node --check` sin errores en los 4 archivos `.js` tocados. `grep` de comentarios (`//`, `/* */`, `<!-- -->`, excluyendo URLs) sobre los 12 archivos de `frontend/` tocados en este tramo: cero coincidencias.

---

## Resumen numérico

| | Cantidad |
|---|---|
| Puntos con causa confirmada = hipótesis del usuario | 7 (1, 2, 4, 5, 6, 9, 11) |
| Puntos con causa real distinta a la hipótesis (código ya correcto) | 4 (7, 8, 10, 12 — igual se implementó la mejora/refuerzo pedido en 8 y 12) |
| Puntos excluidos por instrucción explícita | 1 (3) |
| Archivos backend modificados | 6 (`Token.java`, `AuthService.java`, `RegistroService.java`, `EmailService.java`, `AuthController.java`, `SecurityConfig.java`) |
| Archivos backend nuevos | 3 (`V15__token_intentos_fallidos.sql`, `VerificarCodigoRequestDTO.java`, `ReenviarVerificacionRequestDTO.java`) |
| Endpoints backend nuevos | 2 (`POST /auth/verificar`, `POST /auth/reenviar-verificacion`) |
| Bugs reales encontrados y corregidos durante la verificación (no reportados por el usuario) | 2 (rollback de `ConflictoDeNegocioException` en el límite de intentos del token; badge del FAB de carrito no se refrescaba tras agregar un ítem) |
| Archivos frontend modificados | 9 (`verificar-email.html`, `registro-cliente.html`, `registro-comercio.html`, `index.html`, `login.html`, `comercio-producto-form.html`, `js/auth.js`, `js/catalogo.js`, `js/comercio.js`, `js/notificaciones.js`, `css/styles.css` — 11 en total) |
| Archivos frontend nuevos | 1 (`registro-tipo-cuenta.html`) |

Este tramo **no se cierra solo** — queda pendiente de que el dueño del proyecto confirme el checklist de cierre punto por punto (ver mensaje de cierre en la conversación) antes de poder avanzar a la Fase 17.
