# Mapeo DFD Nivel 2, Tramo B — Complemento (solo lectura)

Fecha de lectura: 2026-11-16. Complemento a `MAPEO-DFD2-TRAMO-B.md`. Todo sale del código tal como está en el árbol de trabajo; no se modificó ningún archivo del proyecto. Rutas relativas a `03. Implementación/`. Los textos van literales entre comillas.

Prefijos: `BE` = `backend/src/main/java/com/bajonea/backend/`, `FE` = `frontend/js/`.

---

## 1. Mensajes de nombre de usuario ocupado o reservado

### 1.1 Texto literal de `MENSAJE_NO_DISPONIBLE`

`BE validation/NombreUsuarioPolicy.java:15`:

```java
public static final String MENSAJE_NO_DISPONIBLE = "Ese nombre de usuario ya está en uso";
```

### 1.2 Dónde sale ese mensaje (y cuál es el único texto para "ocupado" y para "reservado")

No hay un mensaje distinto para "reservado": un nombre de la lista de reservados y uno ya tomado devuelven exactamente el mismo texto y el mismo `409` (`ConflictoDeNegocioException` → `GlobalExceptionHandler.handleConflictoDeNegocio`, `data = null`). La lista (`NombreUsuarioPolicy.RESERVADOS`, comparación exacta en minúsculas) es: `administrador`, `administrator`, `bajonea`, `soporte`, `support`, `comercio`, `cliente`, `empleado`, `duenio`, `superadmin`.

| # | Dónde | Caso en que sale | Texto literal | Status |
|---|---|---|---|---|
| 1 | `BE services/RegistroService.java` → `validarNombreUsuarioDisponible` (línea 273; llamado desde las líneas 102 y 134: alta de Cliente —la cadena compartida con la cuenta nueva por invitación— y registro de Comercio) | El nombre normalizado está en `RESERVADOS` o ya existe en `usuario` (`existsByNombreUsuario`), validado antes de escribir nada | `NombreUsuarioPolicy.MENSAJE_NO_DISPONIBLE` = "Ese nombre de usuario ya está en uso" | 409 |
| 2 | `BE services/RegistroService.java` → `crearUsuario` (líneas 290-296) | Carrera: dos altas simultáneas con el mismo nombre; el `UNIQUE` `uq_usuario_nombre_usuario` rechaza el segundo `saveAndFlush` (`DataIntegrityViolationException`, el mensaje de la causa contiene `uq_usuario_nombre_usuario`) | `NombreUsuarioPolicy.MENSAJE_NO_DISPONIBLE` = "Ese nombre de usuario ya está en uso" | 409 |
| 3 | `BE services/AuthService.java` → `cambiarNombreUsuario` (línea 361-363) | Cambio de nombre desde el perfil del Cliente: el nuevo está en `RESERVADOS` o ya existe | `NombreUsuarioPolicy.MENSAJE_NO_DISPONIBLE` = "Ese nombre de usuario ya está en uso" | 409 |
| 4 | `BE exceptions/GlobalExceptionHandler.java` → `handleDataIntegrityViolation` (línea 81-84) | Red de seguridad para cualquier `DataIntegrityViolationException` por `uq_usuario_nombre_usuario` que no haya traducido antes un service (ej. carrera en el cambio de nombre, que no tiene su propio `try/catch`) | "Ese nombre de usuario ya está en uso" (literal duplicado en el handler, no usa la constante) | 409 |

### 1.3 Otros mensajes relacionados con el nombre de usuario (no son "ocupado" ni "reservado")

| Dónde | Caso | Texto literal | Status |
|---|---|---|---|
| `AuthService.cambiarNombreUsuario` (línea 358) | El nombre nuevo es igual al actual (se evalúa después de validar la contraseña y antes de reservados/ocupados) | "Ingresá un nombre de usuario distinto al actual" (`ValidacionException`) | 400 |
| `AuthService.cambiarNombreUsuario` (líneas 375-377) | Ya hubo 3 cambios en los últimos 30 días (se evalúa después de reservados/ocupados) | "Ya alcanzaste el máximo de 3 cambios de nombre de usuario en los últimos 30 días. Podés volver a intentarlo en N día." / "… N días." (N = días hasta que sale de la ventana el más antiguo, mínimo 1) | 409 |
| `AuthService.cambiarNombreUsuario` (líneas 349-353) | Contraseña actual incorrecta | "La contraseña actual es incorrecta" con `data = {intentosRestantes: n}` (suma intento fallido, ver punto 2) | 401 |
| `NombreUsuarioPolicy.mensajeDeFormatoInvalido` (usado por `NombreUsuarioValidator` → `@ValidarNombreUsuario` en los DTOs de registro y de cambio, y por `RegistroService.consultarDisponibilidadNombreUsuario`) | Formato inválido | "El nombre de usuario es obligatorio" (vacío) · "Solo se permiten letras y números" · "El nombre de usuario debe contener al menos una letra." · "El nombre de usuario debe tener al menos 8 caracteres" · "El nombre de usuario no puede superar los 20 caracteres" (el DTO además lleva `@NotBlank` "El nombre de usuario es obligatorio" y `@Size(max = 20)` con el mismo texto de 20) | 400 (por campo `nombreUsuario` en `MethodArgumentNotValidException`; en el endpoint de disponibilidad, `ValidacionException` con el texto suelto) |
| `GET /api/v1/auth/nombre-usuario/disponibilidad` (`AuthController` línea 57 → `RegistroService.consultarDisponibilidadNombreUsuario`, línea 261) | Consulta en vivo | No devuelve texto de "ocupado": responde `200` con `{ disponible: true|false }` (`false` si es reservado o existe) y mensaje "Consulta realizada correctamente". El texto "Ese nombre de usuario ya está en uso" lo pone el frontend/registro al enviar, no este endpoint | 200 |

---

## 2. `manejarBloqueoPorCambioPassword` y su uso en el cambio de nombre de usuario

### 2.1 La función (`FE catalogo.js:129-139`)

```js
export function manejarBloqueoPorCambioPassword(error) {
  if (!(error instanceof ApiError) || error.status !== 401) {
    return false;
  }
  const intentosRestantes = error.data && typeof error.data.intentosRestantes === 'number' ? error.data.intentosRestantes : null;
  if (intentosRestantes === 0) {
    mostrarModalCuentaBloqueada();
    return true;
  }
  return false;
}
```

Solo actúa con un `401` cuyo `data.intentosRestantes` sea exactamente `0`; en cualquier otro caso devuelve `false` y deja que el llamador siga.

### 2.2 `mostrarModalCuentaBloqueada` (`FE api.js:336-344`), paso a paso

1. `clearSesion()`: borra la sesión **local** (el frontend no llama a ningún endpoint de logout; la sesión del servidor ya la cerró el backend, ver 2.4).
2. Crea (si no existe ya) el modal `cuenta-bloqueada-modal` vía `crearModalSesionCerrada` (`api.js:288-322`): es un modal bloqueante sin botón de cancelar.
   - Título: "Cuenta bloqueada"
   - Texto: "Tu contraseña fue ingresada incorrectamente varias veces y tu cuenta fue bloqueada por seguridad. Para volver a ingresar, recuperá tu contraseña."
   - Único botón (`#cuenta-bloqueada-modal-cta`): "Ir al inicio de sesión".
3. Interacción: click en el botón o tecla `Escape` → `redirectTo('login.html')` (se resuelve relativo a la carpeta actual, sin parámetro `retorno`); `Tab` queda atrapado en el botón. El botón recibe el foco al abrirse.

No cierra otras hojas por su cuenta ni toasts: eso lo hace el llamador.

### 2.3 Uso en el cambio de nombre de usuario (`FE perfil-cuenta.js`)

Flujo: en "Editar datos personales" el submit hace primero `PUT /clientes/perfil` (nombre, apellido, teléfono) y, **ya guardado eso**, si el nombre de usuario cambió abre `mostrarModalConfirmarNombreUsuario` (líneas 62-138), cuyo `onConfirmar` hace `PUT /clientes/perfil/nombre-usuario` con `{ nombreUsuario, passwordActual }` y `handle401Globally: false` (para que un `401` de contraseña incorrecta no dispare el modal global de "Sesión cerrada").

Textos del modal de confirmación: título "Confirmá tu contraseña"; texto "Por seguridad, ingresá tu contraseña para confirmar el cambio de nombre de usuario."; placeholder "Tu contraseña actual"; botones "Confirmar" / "Cancelar" (mientras envía "Confirmando...").

Manejo del error en el `catch` del botón Confirmar (líneas 116-131), en este orden:

1. `manejarBloqueoPorCambioPassword(error)` es `true` (401 con `intentosRestantes === 0`) → muestra el modal "Cuenta bloqueada" (sesión local borrada, ver 2.2), llama `cerrar()` (cierra la hoja de confirmación) y hace `return`. No muestra ningún otro mensaje, no navega a otra vista ni cambia el nombre en pantalla. El botón de "Ir al inicio de sesión" lleva a `login.html`.
2. Si no, y es `ApiError` con `status === 401`: deja la hoja abierta, marca el campo con error y muestra "La contraseña actual no es correcta."; si `intentosRestantes === 1` muestra además el aviso "Cuidado: si fallás una vez más, tu cuenta se bloqueará.".
3. Cualquier otro error (409 "Ese nombre de usuario ya está en uso", 409 del tope de 3 cambios, 400 "Ingresá un nombre de usuario distinto al actual", 5xx, etc.): `cerrar()` y `onErrorNoPassword(error)` → `mostrarVista('view-editar-datos')`; si el error trae mapa por campo (`error.data`) se pinta bajo `error-editar-nombre-usuario`, si no un banner de error con `error.message` (o "No pudimos actualizar tu nombre de usuario. Intentá nuevamente.").
4. En `finally` el botón vuelve a "Confirmar" solo si la hoja sigue en el DOM.

En éxito: `cliente.nombreUsuario` se actualiza, `mostrarVista('view-principal')` y toast "Nombre de usuario actualizado correctamente". No cierra la sesión (el JWT usa el id como `sub`).

### 2.4 Lo que hizo el backend antes de responder ese `401` con `0` (contexto)

`AuthService.cambiarNombreUsuario` → `registrarIntentoFallido` (línea 452): suma 1 a `intentosFallidos`; al llegar a 3 (`MAX_INTENTOS_FALLIDOS`) llama `estadoUsuarioService.cambiar(usuario, BLOQUEADO, …)`, `cerrarSesionActivaSiExiste(usuario, TipoCierreSesion.FORZADO)` y `propagarBloqueoAComercio(usuario)`; devuelve `max(3 - intentos, 0)`. La excepción es `CredencialesInvalidasException("La contraseña actual es incorrecta", Map.of("intentosRestantes", n))` → `401` con `data = {intentosRestantes: n}`. `ClienteService.cambiarNombreUsuario` lleva `noRollbackFor = { CredencialesInvalidasException.class, ConflictoDeNegocioException.class }` para que el bloqueo se confirme.

Otros usos de la misma función (no pedidos, solo para ubicarla): `FE perfil-cuenta.js:302` (cambio de contraseña desde perfil; ahí además, en éxito, `clearSesion()` y redirección a `login.html?passwordActualizada=1`) y `FE comercio.js:2877`.

---

## 3. Reenviar email de suspensión: Cliente y Dueño

Endpoints (`BE controllers/AdministradorController.java`, prefijo `/api/v1/administrador`, rol Administrador por el matcher de `/administrador/**`):

- `POST /clientes/{clienteId}/suspension/reenviar-email` (línea 242) → `SuspensionUsuarioService.reenviarEmail(clienteId, administradorId)` (línea 148).
- `POST /duenos/{duenoId}/suspension/reenviar-email` (línea 196) → `SuspensionDuenoService.reenviarEmail(duenoId, administradorId)` (línea 322).

(Existe un tercero, `POST /comercios/{comercioId}/suspension/reenviar-email`, no pedido; usa `AvisoCuentaService.reenviarEmailComercioFallido` y no valida objetivo, solo el último email fallido del comercio.)

### 3.1 Precondiciones, en orden

**Cliente** (`SuspensionUsuarioService.validarObjetivo`, línea 153, y luego `AvisoCuentaService.prepararReenvio`, línea 304):

| Orden | Condición | Mensaje literal | Status |
|---|---|---|---|
| 1 | `usuarioId` igual al del Administrador que llama | "No podés suspender tu propia cuenta" (`MENSAJE_PROPIA_CUENTA`; el texto dice "suspender" aunque la operación sea reenviar) | 409 |
| 2 | No existe el usuario (`findRolById` vacío) | "Usuario no encontrado" | 404 |
| 3 | El usuario es Administrador | "No se puede suspender a un Administrador" | 409 |
| 4 | El usuario es Dueño | "Un Dueño se suspende desde la lista de Dueños" | 409 |
| 5 | (en `prepararReenvio`, dentro de una transacción) `findById` falla | "Usuario no encontrado" | 404 |
| 6 | No hay una fila `notificacion` de canal `EMAIL` y estado `FALLIDO` como **último** email del tipo que corresponde al estado actual de la cuenta | "No hay ningún email fallido para reenviar" | 409 |

**Dueño** (`SuspensionDuenoService.validarObjetivo`, línea 337, y luego `AvisoCuentaService.prepararReenvioDueno`, línea 251):

| Orden | Condición | Mensaje literal | Status |
|---|---|---|---|
| 1 | `duenoId` igual al del Administrador | "No podés suspender tu propia cuenta" | 409 |
| 2 | No existe el usuario | "Dueño no encontrado" | 404 |
| 3 | Es Administrador | "No se puede suspender a un Administrador" | 409 |
| 4 | Existe pero su rol no es `DUENO` (ej. Cliente) | "Dueño no encontrado" | 404 |
| 5 | `findById` falla dentro de `prepararReenvioDueno` | "Dueño no encontrado" | 404 |
| 6 | No hay último email `FALLIDO` del tipo que corresponde | "No hay ningún email fallido para reenviar" | 409 |

Sobre la condición 6 (importante para el DFD): **el servicio no exige que la cuenta siga suspendida**. Elige el tipo de aviso según el estado *actual*: si `usuario.estado == SUSPENDIDO` busca el último email de `CLIENTE_SUSPENDIDO` (Cliente) o `DUENO_SUSPENDIDO` (Dueño) y reenvía el mail de suspensión con el motivo vigente (`usuario.getMotivoSuspension()`; el Dueño además con la lista de nombres de sus comercios `SUSPENDIDO` con `suspension_origen = DUENO`); si la cuenta ya no está suspendida busca el último email de `SUSPENSION_LEVANTADA` (Cliente) o `DUENO_SUSPENSION_LEVANTADA` (Dueño) y reenvía el de levantamiento (motivo tomado de la última fila de `historial_estado_usuario` con origen `SUSPENDIDO`; para el Dueño además restaurados y los que siguen suspendidos). Por lo tanto "suspendido pero el último mail de suspensión salió bien" y "nunca suspendido" dan ambos el mismo `409` "No hay ningún email fallido para reenviar".

La búsqueda del último email es `NotificacionService.ultimoEmail(usuarioId, tipo)` → `findTopByUsuarioIdAndCanalAndTipoOrderByIdDesc(usuarioId, EMAIL, tipo)`; solo cuenta si esa última fila está `FALLIDO`.

### 3.2 Respuestas

Mismo código en los dos endpoints (`AdministradorController` líneas 245-250 y 199-204):

- Éxito (`EstadoEnvioNotificacion.ENVIADO`): `200`, mensaje "Email reenviado correctamente", `data = null`.
- Falla del envío (`FALLIDO`): `502 Bad Gateway`, mensaje "No se pudo reenviar el email. Probá de nuevo más tarde", `data = null`.

### 3.3 Qué escribe en `notificacion`

No inserta una fila nueva. `AvisoCuentaService.reenviarEmailFallido` / `reenviarEmailDuenoFallido` (líneas 215 y 242): (1) prepara el envío en una transacción (solo lectura); (2) **envía fuera de toda transacción**, un solo intento (`enviar(...)` captura cualquier `RuntimeException` y cuenta como no enviado); (3) en una transacción corta llama `NotificacionService.marcarResultadoEmail(notificacionId, fecha, salio)` (línea 155) que hace `UPDATE` sobre **la misma fila** `FALLIDO`: `estado = ENVIADO` y `fecha_envio = fecha` si salió, o `estado = FALLIDO` y `fecha_envio = null` si no (`fecha` = `LocalDateTime.now(clock)` truncada a segundos). No toca `mensaje`, `leida`, `fecha_creacion`, `canal`, `tipo` ni `comercio_id`, ni crea avisos in-app. No toma bloqueos sobre `usuario` ni `notificacion` (dos reenvíos simultáneos pueden mandar dos mails).

### 3.4 Cómo lo muestra el frontend

`FE admin-clientes.js:319-332` y `FE admin-duenos.js:176-189`: `apiFetch(..., { method: 'POST', handle5xxGlobally: false, handleRedGlobally: false })`; éxito → `showToast('Email reenviado')`; error → `showToast(mensajeDeError(error, 'No pudimos reenviar el email. Probá de nuevo.'), 'error')` donde `mensajeDeError` (`FE documentos-comun.js:81`) devuelve `error.message` del servidor si existe (por eso el `502` se ve como "No se pudo reenviar el email. Probá de nuevo más tarde" y los `409`/`404` con su texto). Después recarga la lista (si falla: toast de error "No pudimos actualizar la lista").

---

## 4. `ComercioDatosOperativosRequestDTO` y `ComercioService.editarDatosOperativos`

Endpoint: `PUT /api/v1/comercios/perfil/datos-operativos` (`BE controllers/ComercioController.java:173`). Ruta delegable (`BE config/security/DelegacionEmpleado.java:40`): la pueden usar el Dueño y el Empleado. Con `X-Comercio-Id` obligatorio.

### 4.1 Campos que acepta y validaciones (`BE dto/request/ComercioDatosOperativosRequestDTO.java`)

| Campo | Anotaciones | Mensaje literal |
|---|---|---|
| `descripcion` | `@Size(max = 2000)` (opcional, puede ser `null`) | "La descripción no puede superar los 2000 caracteres." |
| `telefono` | `@NotBlank` | "No debe estar vacío" |
| `telefono` | `@ValidarTelefonoArgentino` | "Ingresá un número de teléfono válido (cod. área + número)" (valor por defecto de la anotación) |
| `telefono` | `@Size(max = 30)` | Sin mensaje propio: sale el predeterminado de Bean Validation |
| (cualquier otra propiedad del JSON) | Se recoge con `@JsonAnySetter campoNoPermitido` en un mapa interno; `@AssertTrue isSoloDescripcionYTelefono()` falla si el mapa no está vacío | "Solo se pueden enviar la descripción y el teléfono" |

Formato del `400`: `GlobalExceptionHandler.handleMethodArgumentNotValid` arma `data = {campo: mensaje}` y `mensaje = "campo: texto; campo: texto"`. El error de campos extra sale bajo el nombre de propiedad `soloDescripcionYTelefono`. Un `PUT` con un JSON mal formado da `400` "El cuerpo de la solicitud contiene datos con formato inválido". No hay normalización del teléfono en el DTO (el setter es el de Lombok).

### 4.2 Qué hace `editarDatosOperativos` (`BE services/ComercioService.java:119-144`)

Orden:

1. `historialEdicionComercioService.iniciarEscritura(actor)`: bloquea primero la fila del usuario que actúa y revalida la relación del Empleado dentro de la transacción (relación `ACTIVO`; si no, el `404` `COMERCIO_NO_DISPONIBLE`).
2. Carga el comercio y le hace `entityManager.refresh(comercio, PESSIMISTIC_WRITE)` (`FOR UPDATE`).
3. `ComercioActivoService.validarComercioModificable(actor, estado)` sobre el estado ya bloqueado (`ComercioActivoService.java:151`):
   - Empleado con un estado al que no accede → `404` `COMERCIO_NO_DISPONIBLE`.
   - `SUSPENDIDO` → `409` `COMERCIO_SUSPENDIDO`, "El comercio está suspendido: por ahora no se puede modificar."
   - `INACTIVO` → `409` `COMERCIO_INACTIVO`, "El comercio está inactivo: por ahora no se puede modificar."
   - Observación: este guard del código aplica **a cualquier actor** (también al Dueño), no solo al Empleado como dice el javadoc de `editarDatosOperativos`; el javadoc del propio `validarComercioModificable` (líneas 148-149) sí lo dice ("El Dueño tiene el mismo guard para SUSPENDIDO"). Con `CERRADO_TEMPORALMENTE` y los operativos se puede editar.
4. Compara con `Objects.equals` y arma la lista de campos cambiados: `"descripción"`, `"teléfono"`.
5. Escribe en `comercio`: `descripcion = request.getDescripcion()`, `telefono = request.getTelefono()` (ambos **siempre**, aunque no hayan cambiado) y `fecha_modificacion = LocalDateTime.now()` (hora de la JVM, no el `Clock` único); `comercioRepository.save`. Como `descripcion` se asigna sin condición, un body sin `descripcion` (o con `null`) **la borra**.
6. Solo si hubo cambio efectivo: `historialEdicionComercioService.registrar(actor, TipoEntidadEdicion.COMERCIO, comercio.getId(), comercio.getNombre(), AccionEdicion.EDITAR, detalleDeEdicion(camposCambiados))` → fila en `historial_edicion_comercio` en la misma transacción (con el rol real del actor, nombres de campos y nunca valores). Sin cambio, no escribe historial.
7. Respuesta `200`, mensaje "Perfil actualizado correctamente"; `data` = `ComercioEmpleadoResponseDTO` (reducido) si el actor es Empleado, `ComercioResponseDTO` completo si es Dueño.

No toca nombre, foto, dirección, modalidades, email de contacto, estado, horarios, redes sociales ni datos fiscales. No valida nombre único ni modalidades.

### 4.3 Diferencia con `editarPerfil` (`ComercioService.java:146-183`, `PUT /comercios/perfil`)

| | `editarDatosOperativos` | `editarPerfil` |
|---|---|---|
| Quién puede | Dueño y Empleado (ruta en `DelegacionEmpleado`) | Solo Dueño (`hasRole("DUENO")` sobre `/api/v1/comercios/**`; un Empleado recibe `403`) |
| Body | `ComercioDatosOperativosRequestDTO`: solo `descripcion` y `telefono`; **rechaza** propiedades desconocidas con `400` | `ComercioPerfilRequestDTO`: `nombre`, `descripcion`, `telefono`, `aceptaDelivery`, `aceptaRetiro`; las propiedades desconocidas se **ignoran en silencio** (Jackson por defecto) |
| Validaciones de `descripcion`/`telefono` | Iguales | Iguales |
| Validaciones extra | Ninguna | `nombre`: `@NotBlank` "No debe estar vacío", `@Pattern` "Ingresá un nombre de comercio válido", `@Size(max = 150)`; `ComercioValidaciones.validarModalidadesEntrega(aceptaDelivery, aceptaRetiro)`; nombre normalizado con `TextoUtils.aTitleCase` y, si cambió, `nombreComercioService.validar` (`409` "Ya existe un comercio con ese nombre. Elegí otro."; ver `NombreComercioService.MENSAJE_NOMBRE_EN_USO`) |
| Escribe | `descripcion`, `telefono`, `fecha_modificacion`; `save` | Además `nombre`, `acepta_delivery`, `acepta_retiro`; `saveAndFlush` (para que el `UNIQUE` del nombre salte dentro de la transacción) |
| Campos del historial | `descripción`, `teléfono` | Además `nombre`, `modalidades de entrega` |
| Respuesta | DTO según actor (reducido para el Empleado) | Siempre `ComercioResponseDTO` |

### 4.4 Qué NO puede tocar el Empleado y qué pasa si lo manda igual

- Por `PUT /comercios/perfil/datos-operativos`: si el JSON trae `nombre`, `emailContacto`, `aceptaDelivery`, `aceptaRetiro`, `fotoPerfilUrl`, dirección, `tipoComercio`, datos fiscales o cualquier otra propiedad → `400` "Solo se pueden enviar la descripción y el teléfono" (clave `soloDescripcionYTelefono`) y **no se cambia nada** (la validación corre antes del servicio).
- Por las rutas exclusivas del Dueño (`PUT /comercios/perfil`, `PUT /comercios/perfil/foto`, `POST /comercios/perfil/foto/firma`, redes sociales, equipo, datos fiscales y Mercado Pago): el Empleado recibe `403` de la seguridad (ninguna está en `DelegacionEmpleado.RUTAS`); como el Empleado es un `CLIENTE`, no llega ni a ejecutarse el controller.
- Lo que sí puede el Empleado sobre el comercio: esta edición (descripción y teléfono), `PUT /comercios/perfil/horarios` (ruta delegable, versionada; el javadoc de `ComercioDatosOperativosRequestDTO` todavía dice que "los horarios no tienen todavía un endpoint de edición", desactualizado respecto del código), `PUT /comercios/cerrar` y `PUT /comercios/abrir`.
- Un Empleado sin relación `ACTIVO` con el comercio, o con el comercio en un estado no accesible, recibe `404` con `data.codigo = COMERCIO_NO_DISPONIBLE` (también si el cuerpo es inválido: el resolver de `ComercioActivo` corre antes de leer el cuerpo).

---

## Observaciones sobre desfasajes (sin corregir)

1. `CLAUDE.md` (§1bis, bloque A2 de E3 y lista de pulido, §9) todavía dice que el Dueño puede editar productos y perfil con el comercio `SUSPENDIDO`; `ComercioActivoService.validarComercioModificable` hoy lo bloquea también para el Dueño (`SUSPENDIDO` e `INACTIVO`).
2. Javadoc de `ComercioService.editarDatosOperativos` y de `ComercioDatosOperativosRequestDTO` desactualizados (ver 4.2 punto 3 y 4.4).
3. Los textos de `MENSAJE_PROPIA_CUENTA` y `MENSAJE_ADMINISTRADOR` dicen "suspender" también cuando la operación es reenviar un email.
4. El literal "Ese nombre de usuario ya está en uso" está duplicado en `GlobalExceptionHandler` (línea 83) y en `NombreUsuarioPolicy.MENSAJE_NO_DISPONIBLE`.
