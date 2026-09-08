# Auditoría exhaustiva de formularios de Cliente (2026-09-02)

> **Documento de auditoría pura — no se implementó ni corrigió nada.** Entregado como
> insumo para armar, en un prompt aparte, la matriz exhaustiva de testeo (Postman primero,
> Playwright después) de todos los formularios usados por el rol Cliente. Metodología:
> lectura directa del código real (backend `entities/`/`dto/request/`/`validation/`/
> `services/`/`controllers/`, frontend `frontend/*.html` + `frontend/js/*.js`), no de
> documentación previa — `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` (2026-09-01) y
> `docs/DECISIONES.md` se usaron solo como punto de partida a contrastar, nunca como
> fuente de verdad. Ver Parte 3 para los puntos donde el código real ya no coincide con lo
> documentado.

---

## Parte 1 — Listado completo y confirmado de formularios de Cliente

Se recorrió el árbol completo de `frontend/*.html` y `frontend/js/*.js`, y los paquetes
`controllers/`, `dto/request/`, `services/` del backend, filtrando por lo que un usuario
autenticado con rol `CLIENTE` puede efectivamente alcanzar (mismo criterio de
`SecurityConfig` — rutas `authenticated()` sin restricción de rol específico también
cuentan si la pantalla que las consume es de Cliente). La lista tentativa del prompt
original **no estaba completa**: falta un formulario real (búsqueda/filtros del catálogo)
que no figuraba en ningún documento previo — ver punto 12 y Parte 3.

### 1. Registro de Cliente (wizard, 2 pasos + foto opcional)

- **Pantallas:** `registro-cliente.html` (step-1: datos personales + contraseña; step-2:
  dirección).
- **JS:** `js/auth.js`, función `initRegistroCliente` (líneas 289-502).
- **Endpoints:** `POST /api/v1/auth/registro/cliente` (alta) + `POST
  /api/v1/auth/registro/cliente/foto-firma` (firma Cloudinary, solo si el usuario cargó
  foto).
- **DTO(s):** `RegistroClienteRequestDTO` (incluye `direccion: DireccionRequestDTO`
  anidado con `@Valid`, y `fotoPerfilUrl` opcional).
- **Estado:** ya auditado y con validaciones cerradas en un tramo previo (perfeccionamiento
  de "01. Datos Personales"/"02. Dirección", 2026-09-01) — confirmado en esta auditoría
  que el código real sigue coincidiendo con lo documentado entonces, campo por campo (ver
  Parte 2, tabla 1).

### 2. Login

- **Pantalla:** `login.html`.
- **JS:** `js/auth.js`, función `initLogin` (líneas 102-208).
- **Endpoint:** `POST /api/v1/auth/login`.
- **DTO:** `LoginRequestDTO`.
- Compartido con Comercio/Administrador (mismo formulario, sin distinción de rol hasta
  después del login) — se audita acá porque el Cliente lo usa igual que los otros roles.

### 3. Verificación de cuenta (código de 6 dígitos)

- **Pantalla:** `verificar-email.html`.
- **JS:** `js/auth.js`, función `initVerificarEmail` (líneas 1283-1367).
- **Endpoints:** `POST /api/v1/auth/verificar` (confirmar código) + `POST
  /api/v1/auth/reenviar-verificacion` (reenvío).
- **DTOs:** `VerificarCodigoRequestDTO`, `ReenviarVerificacionRequestDTO`.
- Compartido con Comercio (mismo flujo, mismo par de DTOs) — el Cliente llega acá desde el
  wizard de registro o desde el aviso de "cuenta sin verificar" del login.

### 4. Recuperación de contraseña (3 pasos: email → código → nueva contraseña)

- **Pantalla:** `recuperar-password.html`.
- **JS:** `js/auth.js`, función `initRecuperarPasswordSolicitar` (líneas 1369-1531).
- **Endpoints:** `POST /api/v1/auth/recuperar-password` (paso 1) + `POST
  /api/v1/auth/recuperar-password/validar-codigo` (paso 2) + `POST
  /api/v1/auth/recuperar-password/confirmar` (paso 3).
- **DTOs:** `RecuperacionPasswordRequestDTO`, `ValidarCodigoRecuperacionRequestDTO`,
  `ConfirmarRecuperacionPasswordRequestDTO`.

### 5. Reactivación de cuenta (2 pasos: email → código)

- **Pantalla:** `reactivar-cuenta.html`.
- **JS:** `js/auth.js`, función `initReactivarCuentaSolicitar` (líneas 1533-1631+).
- **Endpoints:** `POST /api/v1/auth/reactivar-cuenta` (paso 1) + `POST
  /api/v1/auth/reactivar-cuenta/confirmar` (paso 2, no pide contraseña nueva — a
  diferencia de recuperación, reactivar solo reabre la cuenta con la contraseña
  existente).
- **DTOs:** `ReactivacionCuentaRequestDTO`, `ConfirmarReactivacionCuentaRequestDTO`.

### 6. Edición de datos personales de perfil (Cliente)

- **Pantalla:** `perfil.html`, vista `view-editar-datos`.
- **JS:** `js/cliente.js`, función `initPerfil` (bloque del formulario en líneas 227-272).
- **Endpoint:** `GET /api/v1/clientes/perfil` (precarga) + `PUT /api/v1/clientes/perfil`
  (guardar).
- **DTO:** `ClienteEditarPerfilRequestDTO` (solo `nombre`/`apellido`/`telefono` — `email`/
  `dni`/`fechaNacimiento` de solo lectura, sin endpoint que los edite, confirmado por
  diseño desde Fase 16a). **No incluye dirección** — no existe ningún endpoint de edición
  de `Direccion` para Cliente (confirmado: `ClienteController` solo tiene `GET`/`PUT
  /perfil`, sin ninguna ruta de dirección; `docs/PANTALLAS-MVP-FASE15.md` ya documentaba
  esto como pantalla `C41` pendiente de construir, y sigue sin construirse).

### 7. Cambio de contraseña desde perfil

- **Pantalla:** `perfil.html`, vista `view-cambiar-password`.
- **JS:** `js/cliente.js`, mismo `initPerfil` (bloque del formulario en líneas 274-346).
- **Endpoint:** `POST /api/v1/auth/cambiar-password`.
- **DTO:** `CambioPasswordPerfilRequestDTO`.
- Patrón de código prácticamente duplicado con el equivalente de Comercio
  (`js/comercio.js`), ya señalado en la auditoría previa — sigue así, sin refactor.

### 8. Foto de perfil de Cliente

- **Pantalla:** `perfil.html` (avatar clickeable en la vista principal + modal "Foto de
  perfil" con Editar/Eliminar).
- **JS:** `js/cliente.js` (`mostrarModalFotoPerfil`, manejo del `<input type="file">`,
  líneas 62-97 y 165-213) + `js/cloudinary.js` (`subirFotoPerfilUsuario`,
  `eliminarFotoPerfilUsuario`) + `js/crop.js` (`abrirEditorRecorte`, recorte 1:1 antes de
  subir).
- **Endpoints:** `POST /api/v1/usuarios/{id}/foto-perfil/firma` (firma Cloudinary) + `PATCH
  /api/v1/usuarios/{id}/foto-perfil` (guardar URL) + `DELETE
  /api/v1/usuarios/{id}/foto-perfil` (eliminar).
- **DTO:** `FotoPerfilUsuarioRequestDTO` (usado solo en el `PATCH`).
- **Nota de diseño:** endpoint genérico sobre `Usuario` (no exclusivo de Cliente — lo
  comparte cualquier rol autenticado), con `{id}` de path siempre validado contra el
  usuario del JWT (`UsuarioService.validarPropioUsuario`, 404 si no coincide — nunca 403).
  No tiene ningún campo de texto tipeado por el usuario: la `url` sale siempre de
  `uploadData.secure_url` (respuesta real de Cloudinary), nunca de un input pegado a
  mano — mismo criterio ya documentado para los otros DTOs de imágenes en la auditoría
  previa.

### 9. Agregar producto al carrito

- **Pantalla:** modal de detalle de producto, abierto desde `comercio-detalle.html` (y
  reutilizado en otras pantallas de catálogo que abren el mismo modal).
- **JS:** `js/catalogo.js`, función que arma el modal (bloque de "Agregar al carrito",
  líneas 705-820) + `agregarAlCarrito` (líneas 822-827).
- **Endpoint:** `POST /api/v1/carrito/items`.
- **DTO:** `ItemCarritoRequestDTO` (`productoId`, `cantidad`, `nota` opcional).
- **Campos reales:** un stepper de cantidad (botones +/-, sin input tipeable — rango
  estructural 1 a 20, ver Parte 2) y un input de texto libre "Nota (opcional)" con
  `maxlength="255"`.

### 10. Gestión del carrito (modificar cantidad / eliminar ítem / vaciar carrito)

- **Pantalla:** `carrito.html`.
- **JS:** `js/carrito.js` (`renderItem` — stepper de cantidad y botón eliminar por línea,
  líneas 96-194; `mostrarModalVaciarCarrito`, líneas 61-94).
- **Endpoints:** `PUT /api/v1/carrito/items/{id}` (cambiar cantidad), `DELETE
  /api/v1/carrito/items/{id}` (eliminar un ítem — también se dispara automáticamente si el
  stepper baja de 1), `DELETE /api/v1/carrito` (vaciar todo, con modal de confirmación).
- **DTO:** `ActualizarCantidadItemCarritoRequestDTO` (`cantidad`, único campo del PUT). Los
  dos `DELETE` no llevan body.
- No hay forma de editar la `nota` de un ítem ya agregado desde `carrito.html` — solo se
  puede fijar al momento de agregarlo (formulario 9). Confirmado por lectura completa de
  `carrito.js`: no existe ningún input de nota ni llamado a un endpoint de edición de nota.

### 11. Checkout / Confirmar pedido

- **Pantalla:** `checkout.html` (3 pasos: modalidad de entrega → confirmar
  dirección/retiro → resumen y confirmar).
- **JS:** `js/checkout.js`, función `initCheckout` (todo el archivo, 51-382).
- **Endpoint:** `POST /api/v1/pedidos/cliente`.
- **DTO:** `PedidoRequestDTO` (`tipoEntrega`, `direccionId` condicional).
- **Campos reales:** no hay ningún input de texto — es una selección entre botones
  (`DOMICILIO`/`RETIRO`, según lo que el comercio acepte) más una serie de pantallas de
  confirmación de solo lectura. La única "dirección" que se puede usar es la ya cargada en
  el perfil del Cliente (`cliente.direccion`, de `GET /clientes/perfil`) — si el Cliente no
  tiene dirección cargada, el flujo de `DOMICILIO` se bloquea con un aviso y no ofrece
  cargar una nueva ahí mismo (correcto: no hay endpoint de alta de dirección post-registro,
  ver formulario 6).

### 12. Búsqueda y filtros del catálogo (Explorar) — **no estaba en ningún documento previo**

- **Pantalla:** `explorar.html`.
- **JS:** `js/explorar.js`, función `initExplorar` (todo el archivo).
- **Endpoint:** `GET /api/v1/catalogo/productos?q=&categoriaId=&tagIds=&pagina=` (público,
  sin autenticación) + `GET /api/v1/catalogo/filtros` (para poblar los chips).
- **DTO:** ninguno — los 4 parámetros son `@RequestParam` sueltos en
  `CatalogoController.listarProductosGlobal`, sin ningún `@Valid`/DTO de request ni
  anotación de Bean Validation. `q` es texto libre (sin límite de longitud en frontend ni
  backend), `categoriaId`/`tagIds` son ids numéricos que vienen de los chips (no tipeados a
  mano), `pagina` es un entero manejado por los botones de paginación.
- **Por qué es un hallazgo:** `docs/PANTALLAS-MVP-FASE15.md` (Fase 15, cierre 2026-07-22)
  documenta explícitamente en su sección 2.3 que "no hay búsqueda global por texto ni
  filtro entre comercios" y excluye las pantallas `C07`/`C08` por ese motivo. El código
  real de hoy contradice esa afirmación: existe una pantalla de búsqueda global real,
  con debounce de 300ms, filtro por categoría y por múltiples tags a la vez, y paginación
  real contra el backend — construida después del cierre de la Fase 15, documentada en
  `docs/DECISIONES.md` en varios tramos posteriores (no en `docs/PANTALLAS-MVP-FASE15.md`,
  que nunca se actualizó retroactivamente). Ver Parte 3, hallazgo #1.

---

### Formularios/acciones de Cliente confirmados como INEXISTENTES (no wishful thinking del prompt original)

- **Cancelación de pedido por parte del Cliente:** no existe. `grep` completo de
  "cancelar" (case-insensitive) sobre todo `backend/src/main/java` no devolvió ningún
  resultado. `PedidoController` no tiene ningún endpoint que el Cliente pueda invocar más
  allá de `POST /pedidos/cliente` (crear) y `GET /pedidos/cliente` (listar). Las acciones
  `aceptar`/`rechazar` son exclusivas del Comercio (`/pedidos/comercio/{id}/...`).
- **Calificación/reseña de pedido o de comercio:** no existe. `grep` de
  "calificacion"/"resena"/"rating" sobre `backend/src/main/java` no devolvió resultados, ni
  ninguna entidad ni tabla relacionada en `docs/diccionario-de-datos.md`.
- **Edición de dirección post-registro (`C41`):** confirmado que sigue sin construirse
  (ver formulario 6). `ClienteController` no tiene ninguna ruta de `Direccion`.
  `DireccionRepository.findByClienteId` devuelve `Optional<Direccion>` (una sola), no una
  lista — el modelo de datos vigente (`docs/diccionario-de-datos.md`, tabla `Direccion`)
  ya prevé "un cliente puede tener múltiples direcciones activas", pero la implementación
  actual sigue acotada a una sola, de solo lectura desde el punto de vista del Cliente.
- **Reseña/edición de nota de un ítem de carrito ya agregado:** no existe (ver formulario
  10).
- **Cualquier formulario de Administrador o self-service de Empleado:** fuera de alcance
  de este documento (rol distinto) y de todas formas no implementados (`Empleado` no tiene
  ninguna pantalla ni Controller propio todavía, confirmado por `CLAUDE.md` §1bis).

---

> **Actualización 2026-09-03 (tramo de matriz exhaustiva de Postman, no cerrado — pendiente de
> confirmación de Diego):** las columnas "Cobertura de test" de las 12 tablas de esta Parte 2
> describen el estado **al momento de esta auditoría** (2026-09-02), antes de armar la matriz.
> Después de ese tramo, los 12 formularios tienen cobertura negativa/boundary real por campo en
> Postman (vacío, formato inválido ×2, límite inferior, límite superior, formato alternativo
> donde aplica) — ver el detalle campo por campo en la Parte 5 al final de este documento y el
> mapeo completo en `docs/MAPEO-ARCHIVOS-TRAMO-MATRIZ-POSTMAN-CLIENTE.md`. Las celdas de esta
> Parte 2 se dejan **sin modificar** como registro histórico de lo que había antes del tramo.

## Parte 2 — Estado de validación campo por campo

### 1. Registro de Cliente — `RegistroClienteRequestDTO` (+ `DireccionRequestDTO` anidado)

| Campo | Backend | Frontend | Alineación | Cobertura de test |
|---|---|---|---|---|
| `nombre` | `usuario`/`persona_fisica.nombre` VARCHAR(100) NOT NULL. `@NotBlank("El nombre es obligatorio")` + `@ValidarFormatoNombre` (blanco-tolerante, `^[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+(?:[-' ][A-Za-zÁÉÍÓÚáéíóúÑñÜü]+)*$`) + `@Size(max=100)`. Setter normaliza (`trim` + colapso de espacios) antes de validar. | `esNombreClienteValido` (mismo charset exacto que el backend) con separación vacío/formato ya correcta (`validarCampoRequeridoYValido`). `maxlength="100"` en el HTML. | **Alineado** — charset idéntico en ambas capas, mensajes separados en ambas capas. | Playwright: solo "campo vacío" (spec 01, línea 227) y "email inválido" (línea 246) — **sin test de formato inválido de `nombre` ni de longitud límite**. Postman: sin ningún negativo de formato para este campo (solo duplicado de email/DNI y localidad inexistente). |
| `apellido` | Igual que `nombre`, mensaje de formato personalizado a "El apellido solo puede contener letras". | Igual patrón, `maxlength="100"`. | **Alineado.** | Mismo gap que `nombre` — sin cobertura de formato ni longitud en ningún test automatizado. |
| `dni` | `persona_fisica.dni` VARCHAR(10) NOT NULL UNIQUE. `@NotBlank` + `@ValidarFormatoDni` (`^\d{7,8}$` tras sanitizar puntos/espacios/guiones en el setter). | `esDniClienteValido` (mismo regex tras `sanitizarDni`). Input `inputmode="numeric"`, `maxlength="8"`, bloqueo de teclado a solo dígitos vía `input` listener (`dniInput.value.replace(/\D/g,'').slice(0,8)`). | **Alineado.** | Postman cubre el caso de **DNI duplicado** (negativo, carpeta 09) pero no formato inválido (letras, 6 dígitos, 9 dígitos). Playwright: sin ningún test de DNI. |
| `fechaNacimiento` | `persona_fisica.fecha_nacimiento` DATE NOT NULL. `@NotNull` + `@ValidarFechaNacimientoPlausible` (no futura, no anterior a 120 años desde hoy — **sin piso de 18 años**, retirado del Cliente el 2026-09-01). | `esFechaNacimientoClientePlausible` (mismo criterio: futura → inválida, más de 120 años → inválida). Input `type="date"` (el navegador ya bloquea formatos no-fecha). | **Alineado.** | Sin cobertura en Postman ni Playwright de los bordes de plausibilidad (fecha futura, fecha de hace 121 años) — ambos motores solo usan una fecha "normal" en los flujos felices. |
| `telefono` | `persona_fisica.telefono` VARCHAR(30) NOT NULL. `@NotBlank` + `@ValidarTelefonoArgentino` (prefijo fijo `+549` + exactamente 10 dígitos) + `@Size(max=30)`. El setter del DTO limpia espacios/paréntesis/guiones antes de validar. | `esTelefonoValido` (mismo algoritmo exacto: sanitiza, exige `+549` + 10 dígitos). El HTML solo expone el campo editable (10 dígitos locales); `construirTelefono()` antepone `+549` antes de enviar. Bloqueo de teclado a solo dígitos, tope de 10 (`telefonoInput.value.replace(/\D/g,'').slice(0,10)`). Sin `maxlength` HTML (el tope real lo impone el JS). | **Alineado** en la práctica — ningún camino de la UI permite enviar un teléfono sin el prefijo o con una cantidad de dígitos distinta de 10. | Sin cobertura de formato inválido en ningún test automatizado (Postman/Playwright) para este flujo — sí existe un negativo de formato de teléfono, pero en el formulario de *edición* de perfil (`12 - Cliente perfil`), no acá. |
| `email` | `usuario.email` VARCHAR(254) NOT NULL UNIQUE. `@NotBlank` + `@ValidarFormatoEmail` (`^[^\s@]+@[^\s@]+\.[^\s@]+$`) + `@Size(max=254)`. Setter hace `trim().toLowerCase()`. | `esEmailValido` (mismo regex exacto). `maxlength="254"`. | **Alineado.** | Playwright cubre formato inválido (spec 01, línea 246). Postman cubre **email duplicado** (negativo). Ninguno de los dos prueba el límite de 254 caracteres. |
| `password` | Sin columna propia editable por el usuario más allá de `usuario.password_hash` VARCHAR(255) (hash, no el valor crudo). `@NotBlank` + `@ValidarPasswordSegura` (8-72 caracteres, 1 mayúscula, 1 minúscula, 1 número — **sin símbolo obligatorio**) + `@Size(max=72, message="La contraseña no puede superar los 72 caracteres")` — **este DTO sí tiene el `@Size` explícito de 72**, a diferencia de `CambioPasswordPerfilRequestDTO`/`ConfirmarRecuperacionPasswordRequestDTO` (ver hallazgo Parte 3 #4). | `esPasswordSegura` (mismo patrón: 8-72, mayúscula+minúscula+número). Input `minlength="8" maxlength="72"`. Confirmación de contraseña (`confirmarPassword`) es un campo puramente de UX, no viaja al backend. | **Alineado**, incluyendo el caso límite de 72 caracteres (backend con mensaje dedicado). | Sin cobertura de password insegura ni de límite de longitud en ningún test automatizado. |
| `direccion.calle` | `direccion.calle` VARCHAR(150) NOT NULL. `@NotBlank` + `@Size(max=150)` + `@Pattern(".*[\p{L}0-9].*", "La calle no puede contener solo caracteres especiales")`. | `esCalleValida` (mismo regex de "al menos un alfanumérico"). **Sin `maxlength` en el HTML** (a diferencia de `numero`/`nombre`/`apellido`). | Alineado en la regla; el HTML no reproduce el tope de 150 (solo defensivo, el backend igual lo capea). | Sin cobertura de formato/longitud en ningún test automatizado. |
| `direccion.numero` | `direccion.numero` VARCHAR(10) NOT NULL. `@NotBlank` + `@Size(max=10)` + `@Pattern("^\d+$", "Solo se permiten números")`. | `esNumeroDireccionValido` (`^\d+$`). Bloqueo de teclado a solo dígitos + tope de 10 vía JS (`numeroInput.value.replace(/\D/g,'').slice(0,10)`), sin `maxlength` HTML. | **Alineado** en la práctica. | Sin cobertura específica en ningún test automatizado. |
| `direccion.pisoDepto` (opcional) | `direccion.piso_depto` VARCHAR(30) NULL. `@Size(max=30)` + `@Pattern("\s*|.*[\p{L}0-9].*", ...)` (acepta vacío/blanco o al menos un alfanumérico). | `esTextoConContenidoValido`, validado solo si no está vacío (`validarCampoOpcionalYValido`). Sin `maxlength` HTML. | **Alineado.** | Sin cobertura en ningún test automatizado. |
| `direccion.codigoPostal` | `direccion.codigo_postal` VARCHAR(10) NOT NULL. `@NotBlank` + `@ValidarCodigoPostalArgentino` (4 dígitos clásico `^\d{4}$` o CPA `^[A-Za-z]\d{4}[A-Za-z]{3}$`) — **sin `@Size` propio** (el formato regex ya acota a 4 u 8 caracteres, ambos por debajo del VARCHAR(10) físico). | `esCodigoPostalValido` (mismo regex) + `normalizarCodigoPostal` (mayúsculas si es CPA) aplicado antes de validar y antes de enviar. Sin `maxlength` HTML. | **Alineado.** | Sin cobertura de ninguno de los dos formatos (clásico vs. CPA) en ningún test automatizado — los flujos felices de Postman/Playwright usan siempre el mismo código postal de 4 dígitos de Río Grande. |
| `direccion.localidadId` | `direccion.localidad_id` VARCHAR(15) NOT NULL FK → `Localidad.id`. `@NotBlank` + `@Size(max=15)` (el id real de Georef, no un entero autogenerado). | `<select>` poblado por `initGeografiaSelects` (dependiente de la provincia elegida) — estructuralmente no permite enviar un valor fuera de catálogo salvo manipulando el DOM. | **Alineado.** | Postman cubre **localidadId inexistente** (negativo, carpeta 02) — único campo de la dirección con cobertura negativa real. |
| `direccion.principal` | `direccion.principal` TINYINT(1) NOT NULL — el DTO lo expone (`boolean`, sin anotación posible sobre un primitivo) pero el frontend siempre envía `true` (única dirección del Cliente en este punto del flujo, no hay UI para elegir). | No es un campo de formulario, hardcodeado en el payload. | N/A. | N/A. |
| `fotoPerfilUrl` (opcional) | `usuario.foto_perfil_url` VARCHAR(500) NULL. `@ValidarUrlCloudinary` + `@Size(max=500)` — **sin `@NotBlank`** (opcional). | Flujo de Cloudinary con recorte 1:1 (`crop.js`) — nunca un input de texto. Si el usuario no carga foto, se envía `fotoPerfilUrl: null` explícito. | **Alineado**, y no aplica "formato inválido" desde la UI (la URL siempre viene de la respuesta real de Cloudinary). | Sin cobertura de este campo específico en ningún test automatizado (ni Postman ni Playwright suben una foto real en el registro). |
| `aceptaTerminos` (checkbox, solo frontend) | No existe en el DTO — el backend no tiene ningún concepto de "términos aceptados". | `if (!checked) → "Tenés que aceptar los Términos y Condiciones para continuar."` | Sin contraparte de backend — puramente de UX, un cliente de API (Postman/curl) puede registrar una cuenta sin este chequeo. | No aplica (no hay nada que el backend pueda testear). |

### 2. Login — `LoginRequestDTO`

| Campo | Backend | Frontend | Alineación | Cobertura de test |
|---|---|---|---|---|
| `email` | `@NotBlank("No debe estar vacío")` + `@Email("Ingresá un email con formato válido")` (Hibernate, blanco-tolerante nativo). Sin `@Size` (no hace falta, ya está acotado por la columna en la tabla `usuario` en el momento del registro). | `validarCamposCompletos()` es un chequeo manual de "ambos campos no vacíos" — **no valida formato de email en absoluto** antes de enviar; deja que el backend responda y mapea el error genérico a `errorCredenciales`. | El backend valida formato, el frontend no — funciona porque un email mal formado nunca puede haberse registrado, así que en la práctica el único error real que ve el usuario es "Email o contraseña incorrectos" (401), no un 400 de formato. | Playwright cubre "contraseña incorrecta" (spec 02, línea 28) y "usuario no verificado" (línea 41). Postman cubre "password incorrecta" (negativo). Ninguno prueba un email con formato inválido contra este endpoint específico. |
| `password` | `@NotBlank("No debe estar vacío")`. Sin regla de formato (se compara contra el hash, no tiene "formato" propio en login). | Mismo chequeo manual de "no vacío". | Alineado. | Cubierto indirectamente por los tests de "contraseña incorrecta" de arriba. |

### 3. Verificación de cuenta — `VerificarCodigoRequestDTO` / `ReenviarVerificacionRequestDTO`

| Campo | Backend | Frontend | Alineación | Cobertura de test |
|---|---|---|---|---|
| `email` (ambos DTOs) | `@NotBlank` + `@Email`. | Tomado de un query param (`?email=`) al llegar a la pantalla, nunca tipeado por el usuario en este formulario puntual — si falta, la pantalla ni siquiera muestra el formulario (estado de error inmediato). | N/A — no es un campo editable acá. | N/A. |
| `codigo` | `@NotBlank` + `@Pattern("\d{6}", "El código debe tener 6 dígitos numéricos")`. | Input OTP de 6 casilleros (`js/otp.js`), cada uno acepta solo 1 dígito (`replace(/\D/g,'')`) — estructuralmente imposible enviar algo que no sean 6 dígitos una vez completo. Chequeo redundante de longitud (`otp.getValor().length !== 6`) antes de armar el request. | **Alineado por diseño estructural.** | Playwright cubre "código incorrecto marca error" (spec 01, línea 177) y el flujo feliz completo. Postman cubre "código incorrecto" (negativo, carpeta 09). Ninguno prueba enviar el `POST` directo con un código de longitud distinta de 6 o con letras (algo que la UI no permite pero un cliente de API sí podría intentar). |

### 4. Recuperación de contraseña — 3 DTOs

| Paso / campo | Backend | Frontend | Alineación | Cobertura de test |
|---|---|---|---|---|
| Paso 1, `email` (`RecuperacionPasswordRequestDTO`) | `@NotBlank` + `@Email`. | Ya separa vacío ("Ingresá tu email.") de formato (`esEmailValido` → "Ingresá un email con formato válido."). | **Alineado**, patrón de referencia. | Playwright cubre el flujo feliz completo (spec 02, línea 52). Sin cobertura de email con formato inválido contra este endpoint específico ni de "email inexistente" en Playwright (Postman sí lo cubre, negativo, "no revela existencia"). |
| Paso 2, `codigo` (`ValidarCodigoRecuperacionRequestDTO`) | `@NotBlank` + `@Pattern("\d{6}")`. | Mismo input OTP estructural que el punto 3. | Alineado. | Postman cubre "código incorrecto" (negativo). |
| Paso 3, `nuevaPassword` (`ConfirmarRecuperacionPasswordRequestDTO`) | `@NotBlank` + `@ValidarPasswordSegura` — **sin `@Size(max=72)` propio**, a diferencia de `RegistroClienteRequestDTO.password` (ver Parte 3 #4). | Vacío separado ("Ingresá una nueva contraseña."), formato vía `esPasswordSegura` con mensaje "Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número." (**ya actualizado, incluye "minúscula"** — ver Parte 3 #2). | Alineado en la regla de complejidad; el caso límite de >72 caracteres cae en el mensaje genérico de complejidad, no en uno dedicado de longitud (ver Parte 4). | Playwright cubre el flujo feliz completo con la contraseña nueva funcionando para loguearse. Sin cobertura de contraseña insegura ni de >72 caracteres. |
| Paso 3, confirmar contraseña (solo frontend) | No aplica. | `!==` contra `nuevaPassword`, mensaje "Las contraseñas ingresadas no coinciden." | Correcto tal cual. | Cubierto implícitamente por el flujo feliz. |

### 5. Reactivación de cuenta — 2 DTOs

| Campo | Backend | Frontend | Alineación | Cobertura de test |
|---|---|---|---|---|
| `email` (ambos pasos) | `@NotBlank` + `@Email`. | Mismo patrón de dos pasos que el punto 4. | Alineado. | Playwright cubre "solicitud llega a la pantalla de código" (spec 02, línea 104) y "código sin token pendiente es rechazado". Postman cubre "solicitar reactivación sobre cuenta ya activa" y "confirmar con código inexistente" (ambos negativos). |
| `codigo` | `@NotBlank` + `@Pattern("\d{6}")`. | Mismo input OTP estructural. | Alineado. | Ver arriba — cubierto por el mismo test de Playwright. |

### 6. Edición de perfil de Cliente — `ClienteEditarPerfilRequestDTO`

| Campo | Backend | Frontend | Alineación | Cobertura de test |
|---|---|---|---|---|
| `nombre` | `@NotBlank("El nombre es obligatorio")` + `@ValidarNombrePropio` (mensaje default "Debe contener solo letras, espacios y guiones", regex `^\p{L}[\p{L} '-]*$` — Unicode completo, **más permisivo que `@ValidarFormatoNombre`** del registro, que acota a un charset fijo latino) + `@Size(max=100)`. **Sin setter de normalización** — a diferencia de `RegistroClienteRequestDTO`, acá no hay `trim`/colapso de espacios internos antes de validar. | `validarCamposRequeridosSilencioso` con `validador: esNombrePropioValido` (mismo regex Unicode que el backend), `mensajeVacio: 'El nombre es obligatorio.'`, `mensajeInvalido: 'Debe contener solo letras, espacios y guiones'`. `maxlength="100"`. | **Alineado — y ya corregido respecto a lo que documentaba la auditoría previa** (ver Parte 3 #3): el frontend SÍ valida formato hoy, con mensajes separados. | Sin ningún test automatizado (Postman ni Playwright) que ejercite este formulario más allá de un PUT con datos válidos (Postman, carpeta 12) y un negativo de teléfono inválido. |
| `apellido` | Igual que `nombre`. | Igual patrón. | Alineado (misma corrección respecto a lo documentado). | Mismo gap de cobertura. |
| `telefono` | `@NotBlank("No debe estar vacío")` + `@ValidarTelefonoArgentino` + `@Size(max=30)`. | `validador: esTelefonoValido`, `mensajeVacio: 'Ingresá tu teléfono.'`, `mensajeInvalido: 'Ingresá un teléfono argentino válido (código de área + número).'` — **ya separa vacío de formato** (contradice lo documentado en la auditoría previa, que decía "un solo mensaje" — ver Parte 3 #3). Bloqueo de teclado a solo dígitos + tope 10 vía JS, sin `maxlength` HTML. | **Alineado.** | Postman cubre exactamente este caso: "[negativo] PUT clientes/perfil con telefono invalido (letras)" (carpeta 12) — único campo de este formulario con cobertura negativa real en algún test automatizado. |

Nota: `email`/`dni`/`fechaNacimiento` se muestran en la pantalla (`disabled`) pero no viajan
en el `PUT` — Postman confirma explícitamente que intentar cambiarlos "se ignoran"
(carpeta 12, request "PUT clientes/perfil intentando cambiar email/dni").

### 7. Cambio de contraseña desde perfil — `CambioPasswordPerfilRequestDTO`

| Campo | Backend | Frontend | Alineación | Cobertura de test |
|---|---|---|---|---|
| `passwordActual` | `@NotBlank("No debe estar vacío")`. Sin regla de formato (se compara contra el hash). | Chequeo de solo vacío ("Ingresá tu contraseña actual."). Si el backend devuelve `401`, se marca el campo con "La contraseña actual no es correcta." + aviso de intentos restantes si queda 1. | Alineado. | Postman cubre "cambiar password con la actual incorrecta" (negativo, carpeta 09) y "cambiar password nueva igual a la actual" (negativo) y el flujo feliz. |
| `passwordNueva` | `@NotBlank` + `@ValidarPasswordSegura` — **sin `@Size(max=72)` propio** (mismo caso que la recuperación, Parte 3 #4). | Vacío: "Ingresá una nueva contraseña." Formato: `esPasswordSegura(...)` con mensaje **"Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número."** — **ya menciona la minúscula** (contradice lo documentado en la auditoría previa, que decía que este mensaje en `cliente.js:298` estaba desactualizado — ver Parte 3 #2). Input `minlength="8"`, sin `maxlength`. | **Alineado**, salvo el matiz de mensaje de longitud (Parte 4). | Postman cubre el flujo feliz ("Cambiar password desde perfil") y ambos negativos de arriba, pero no un password inseguro por formato (mayúscula/minúscula/número faltante) ni por longitud excesiva. Sin ningún test de Playwright para este formulario específico. |
| `passwordConfirmar` (solo frontend) | No aplica. | `!==` contra `passwordNueva`, "Las contraseñas ingresadas no coinciden." | Correcto. | N/A. |

Comportamiento adicional confirmado: al cambiar la contraseña con éxito, el frontend hace
`clearSesion()` y redirige a `login.html` — coherente con que el backend invalida la
`Sesion` activa al cambiar contraseña (mismo mecanismo de la enmienda de Fase 7).

### 8. Foto de perfil de Cliente — `FotoPerfilUsuarioRequestDTO`

| Campo | Backend | Frontend | Alineación | Cobertura de test |
|---|---|---|---|---|
| `url` (solo interno, nunca tipeado) | `@NotBlank` + `@ValidarUrlCloudinary` (host exacto `res.cloudinary.com`, esquema `https`) + `@Pattern("(?i).*\.(jpg\|jpeg\|png\|webp)$")`. | No es un input de formulario — sale de `uploadData.secure_url` tras `subirArchivoConFirma`. Validación de archivo previa a la subida (`validarArchivoImagen`, `js/cloudinary.js`): tipo MIME en `{image/jpeg, image/png, image/webp}` y tamaño ≤ 5 MB, antes de siquiera pedir la firma. | Alineado — el archivo se valida en el cliente antes de subir, la URL resultante se valida en el backend antes de persistir. | **Sin ninguna cobertura en Postman** (no hay ninguna carpeta ni request para `/usuarios/{id}/foto-perfil*` en la colección actual — ver Parte 3 #5). Sin cobertura en Playwright tampoco (ningún spec sube o borra foto de perfil de Cliente). |

### 9. Agregar producto al carrito — `ItemCarritoRequestDTO`

| Campo | Backend | Frontend | Alineación | Cobertura de test |
|---|---|---|---|---|
| `productoId` | `item_carrito.producto_id` INT NOT NULL FK. `@NotNull`. | Siempre el id real del producto que se está viendo — no editable a mano. | N/A. | Cubierto implícitamente por cualquier test que agregue al carrito. |
| `cantidad` | `item_carrito.cantidad` INT NOT NULL. `@NotNull` + `@Min(1)` + `@Max(20)`. | Stepper de botones +/- (sin input tipeable), clampeado en JS entre 1 y 20 (`Math.max(1, ...)` / `Math.min(20, ...)`) — **imposible estructuralmente enviar un valor fuera de rango desde la UI**. | Alineado por diseño estructural. | Playwright cubre "modificar la cantidad... actualiza el total" (spec 04, línea 114) — pero sobre el carrito ya armado (`carrito.html`, formulario 10), no sobre este modal de alta. Postman no prueba límites de cantidad en este endpoint puntual (sí lo hace en el de actualización, carpeta 15). |
| `nota` (opcional) | `item_carrito.nota` VARCHAR(255) NULL. `@Size(max=255)`. Sin regla de formato — texto libre real. | Input de texto libre, `maxlength="255"` — coincide exacto con el backend. Se envía `undefined` si está vacío tras `trim()` (no `""`). | **Alineado, sin ninguna divergencia** — uno de los pocos formularios del proyecto donde frontend y backend comparten el mismo límite exacto sin necesidad de una función de validación de formato (no aplica, es texto libre). | Sin ningún test automatizado que ejercite este campo específico (ni feliz con nota, ni límite de 255 caracteres). |

### 10. Gestión del carrito — `ActualizarCantidadItemCarritoRequestDTO`

| Campo | Backend | Frontend | Alineación | Cobertura de test |
|---|---|---|---|---|
| `cantidad` | `@NotNull` + `@Min(1)` + `@Max(20)` (mismas reglas que el alta). | Mismo stepper de botones, mismo clamp 1-20; bajar de 1 dispara `DELETE` en vez de `PUT` con `cantidad=0`. | Alineado por diseño estructural. | Playwright cubre el caso feliz de modificar cantidad (spec 04, línea 114) y "quitar un ítem" (línea 139) y "vaciar el carrito completo" (línea 166). Postman cubre explícitamente el borde: **"[negativo] PUT actualizar cantidad por encima del máximo (21)"** (carpeta 15) y **"PUT actualizar cantidad de un item inexistente"** (negativo) — este es el campo con mejor cobertura negativa de todo el rol Cliente. |

### 11. Checkout / Confirmar pedido — `PedidoRequestDTO`

| Campo | Backend | Frontend | Alineación | Cobertura de test |
|---|---|---|---|---|
| `tipoEntrega` | `pedido.modalidad_entrega` ENUM NOT NULL (`TipoEntrega`: `DOMICILIO`, `RETIRO`). `@NotNull("Debés seleccionar una modalidad de entrega")`. Regla de negocio en `PedidoService.confirmarPedido`: rechaza con `409` ("El comercio no ofrece entrega a domicilio" / "El comercio no permite retiro en el local") si el comercio no acepta esa modalidad. | Dos botones (`DOMICILIO`/`RETIRO`), renderizados condicionalmente según `comercio.aceptaDelivery`/`comercio.aceptaRetiro` — si el comercio no acepta ninguna modalidad, se bloquea el botón "Continuar" con un banner de error; si acepta una sola, se auto-selecciona. No hay forma estructural de enviar una modalidad que el comercio no ofrece. | Alineado por diseño estructural — el backend igual la revalida (defensa en profundidad real, no redundancia inútil: un cliente de API podría mandar cualquier valor). | Playwright cubre ambos caminos completos ("envío a domicilio" y "retiro en el local", spec 05). Postman cubre "confirmar pedido DOMICILIO sin direccionId" y "con dirección de otro cliente/inexistente" (negativos, carpeta 17), pero no el caso de pedir una modalidad que el comercio no ofrece. |
| `direccionId` (condicional) | `pedido.direccion_id` INT NULL FK. Sin `@NotNull` a nivel DTO — obligatoriedad condicional en el Service: `409` "La dirección es obligatoria para entrega a domicilio" si `tipoEntrega=DOMICILIO` y viene `null`; `404` "Dirección no encontrada" si el id no existe, no es del Cliente autenticado, o está `eliminada`. | Siempre `cliente.direccion.id` (la única dirección del Cliente) o `undefined` si es `RETIRO` — no hay ningún input donde el Cliente elija o tipee un id de dirección. Si `cliente.direccion` es `null` (sin dirección cargada), el paso 2 de `DOMICILIO` se bloquea con un banner y no permite continuar. | Alineado — la única forma de violar esta regla es con un cliente de API fuera de contrato, ya cubierto por el Service. | Postman cubre ambos negativos mencionados arriba (carpeta 17) — es el campo con mejor cobertura de reglas de negocio de todo el checkout. Playwright no ejercita el caso "cliente sin dirección intenta DOMICILIO" (ambos specs de flujo usan clientes con dirección ya cargada). |

### 12. Búsqueda y filtros del catálogo (Explorar)

| Campo | Backend | Frontend | Alineación | Cobertura de test |
|---|---|---|---|---|
| `q` (texto de búsqueda) | `@RequestParam(required=false) String q` — **sin ninguna validación**: no hay `@Size`, no hay sanitización de caracteres especiales visible en el Controller (la lógica de matching vive en `CatalogoService.listarProductosGlobal`, no revisada en detalle en esta pasada por no ser parte de un DTO de request). | Input de texto libre, sin `maxlength`, con debounce de 300ms antes de disparar la búsqueda. Se envía `busqueda.trim().toLowerCase()`. | No hay "alineación" que evaluar en el sentido de las tablas anteriores — no existe una regla de negocio declarada en ninguna capa sobre este campo, es texto libre real por diseño (una búsqueda). | Postman cubre el flujo feliz ("búsqueda por texto, q=Empanada", carpeta 16) y "página fuera de rango (sin error)" pero **ningún negativo de `q` propiamente dicho** (string vacío ya cubierto implícitamente al no mandar el parámetro; sin test de caracteres especiales, SQL-injection-like strings, ni longitud extrema). Sin ningún test de Playwright para esta pantalla — `explorar.html`/`explorar.js` no tienen ningún spec dedicado. |
| `categoriaId` / `tagIds` (chips) | `@RequestParam(required=false) Integer categoriaId` / `List<Integer> tagIds` — sin validación, vienen de ids reales poblados por `GET /catalogo/filtros`. | Chips generados dinámicamente a partir de `filtros.categorias`/`filtros.tags` — no hay forma estructural de mandar un id fuera de catálogo desde la UI. | N/A (no son campos de texto). | Sin cobertura específica en ningún test automatizado (el feliz de Postman no combina categoría+tag+búsqueda a la vez). |
| `pagina` | `@RequestParam(required=false) Integer pagina` — sin validación de rango. | Botones "Anterior"/"Siguiente", deshabilitados en los extremos según `totalPaginas` que devuelve el propio backend. | N/A. | Postman cubre "página fuera de rango (999) sin error" (carpeta 16) — confirma que el backend no rompe con un valor fuera de rango, aunque no hay ninguna aserción de qué devuelve exactamente. |

---

## Parte 3 — Discrepancias encontradas

Listado de todo lo que no coincide entre lo documentado previamente
(`docs/AUDITORIA-FORMULARIOS-PENDIENTES.md`, `docs/PANTALLAS-MVP-FASE15.md`,
`docs/DECISIONES.md`) y el estado real del código a esta fecha. Nada de esto se corrigió.

### 1. Existe una pantalla de búsqueda/filtro global del catálogo que la Fase 15 dio por excluida

`docs/PANTALLAS-MVP-FASE15.md`, sección 2.3 (cierre 2026-07-22), dice textualmente: "El
único filtro real es categoría/tag dentro del menú de UN comercio... No hay búsqueda
global por texto ni filtro entre comercios" — y excluye las pantallas `C07`/`C08` con ese
motivo. Hoy existe `frontend/explorar.html` + `frontend/js/explorar.js`, con un input de
búsqueda con debounce real contra `GET /api/v1/catalogo/productos?q=...`, filtro por
categoría, filtro por múltiples tags a la vez, y paginación — todo contra endpoints reales
del backend (`CatalogoController.listarProductosGlobal`, `CatalogoService`). La colección
de Postman ya tiene una carpeta completa para esto ("16 - Catalogo extras (busqueda global,
filtros)").

Esto **sí está documentado** en `docs/DECISIONES.md` — solo no quedó indexado en la tabla
de fases de `CLAUDE.md` §6 bajo un tramo con nombre propio. Un `grep` de "explorar" sobre
`docs/DECISIONES.md` encuentra, entre otras, una entrada del tramo abierto el 2026-07-28
("5 correcciones de copy/validación... y 1 punto con gap real de API: filtros combinables
de `explorar.html`") con su propia sub-entrada "2026-07-28 — Punto 9: filtros combinables
de `explorar.html` — gap real de API, `tagId` único no alcanza", más menciones de
`explorar.html` en el Tramo 16.17 (logo centrado) y en la entrada de cierre de Fase 17
("16 — Catálogo extras: búsqueda global con y sin filtros..."). Es decir: la pantalla
existe, se construyó y se corrigió en varios tramos reales, con evidencia documentada —
lo que está desactualizado es específicamente `docs/PANTALLAS-MVP-FASE15.md` (nunca se
volvió a tocar después de su cierre) y la ausencia de esta pantalla en el índice de fases
de `CLAUDE.md` §6, que nunca nombra "Explorar" ni "búsqueda global" como su propio tramo.
Quien arme la matriz de testeo debería tratar `explorar.html` como un formulario más del
Cliente con historia real detrás, no como una funcionalidad no revisada.

### 2. El mensaje de contraseña insegura ya menciona la minúscula en los 3 lugares que la auditoría previa marcaba como desactualizados

`docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` (2026-09-01), puntos 8 y 9, afirma que el
mensaje JS hardcodeado en `cliente.js:298`, `comercio.js:1010` y `auth.js:1498` decía
"...una mayúscula y un número" sin mencionar la minúscula, pese a que el validador
(`esPasswordSegura`) ya la exigía desde el mismo tramo del 2026-09-01. Releyendo el código
real hoy:

- `frontend/js/cliente.js:305` → `'Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número.'`
- `frontend/js/auth.js:403` (registro) y `:1498` (recuperación) → `'Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número'` / `'...una mayúscula, una minúscula y un número.'`

Los 3 mensajes **ya incluyen "una minúscula"** en el texto actual. Esto significa que, en
algún momento entre el 2026-09-01 (fecha de esa auditoría) y hoy (2026-09-02), alguien ya
corrigió el texto de estos 3 mensajes — sin que quede registrado en `docs/DECISIONES.md`
como una entrada propia (no se encontró ninguna entrada con ese título exacto en la
revisión de este documento; posible que haya quedado mezclada dentro de otra entrada del
2026-09-02, como el tramo de `ProductoRequestDTO`, sin mención explícita). `comercio.js`
queda fuera del alcance de Cliente y no se releyó en detalle en esta pasada, pero dado que
es el mismo patrón duplicado, es razonable esperar que también esté corregido — a
confirmar en una auditoría de Comercio si hiciera falta.

### 3. El formulario de edición de perfil de Cliente (`nombre`/`apellido`/`telefono`) ya separa vacío de formato — contradice la auditoría previa

`docs/AUDITORIA-FORMULARIOS-PENDIENTES.md`, punto 1, dice que `nombre`/`apellido` en
`perfil.html` "no valida formato en absoluto" (solo `input.checkValidity()` nativo, sin
`pattern`) y que `telefono` usa "un único mensaje" para vacío y formato. Releyendo
`frontend/js/cliente.js:233-237` (función `initPerfil`, dentro del listener de submit de
`form-editar-datos`) hoy:

```js
const camposValidos = validarCamposRequeridosSilencioso([
  { inputId: 'editar-nombre', errorId: 'error-editar-nombre', validador: esNombrePropioValido, mensajeVacio: 'El nombre es obligatorio.', mensajeInvalido: 'Debe contener solo letras, espacios y guiones' },
  { inputId: 'editar-apellido', errorId: 'error-editar-apellido', validador: esNombrePropioValido, mensajeVacio: 'El apellido es obligatorio.', mensajeInvalido: 'Debe contener solo letras, espacios y guiones' },
  { inputId: 'editar-telefono', errorId: 'error-editar-telefono', validador: esTelefonoValido, mensajeVacio: 'Ingresá tu teléfono.', mensajeInvalido: 'Ingresá un teléfono argentino válido (código de área + número).' },
]);
```

Los 3 campos ya usan `validarCamposRequeridosSilencioso` (la función que sí separa
vacío de formato, con `validador`/`mensajeVacio`/`mensajeInvalido` explícitos) — no
`validarCamposSilencioso` sin validador, como decía la auditoría previa. Mismo caso que el
hallazgo #2: corrección real ya aplicada, sin una entrada de `docs/DECISIONES.md`
localizada que la documente explícitamente por su nombre.

### 4. `CambioPasswordPerfilRequestDTO` y `ConfirmarRecuperacionPasswordRequestDTO` no tienen `@Size(max=72)` explícito, a diferencia de `RegistroClienteRequestDTO`

> **Corregido en el tramo de corrección de bugs del 2026-09-03** (ver punto 9 más abajo y
> `docs/MAPEO-ARCHIVOS-TRAMO-BUGS-CLIENTE.md`): se quitó el `@Size(max=72)` explícito de
> `RegistroClienteRequestDTO.password`, que era el que generaba la asimetría descripta acá.
> Los 3 DTOs de password del proyecto (`RegistroClienteRequestDTO`,
> `CambioPasswordPerfilRequestDTO`, `ConfirmarRecuperacionPasswordRequestDTO`) usan ahora
> únicamente `@ValidarPasswordSegura` como fuente del límite de 72 caracteres — el texto
> original de este punto queda abajo como registro de cómo era antes de la corrección.

No es una contradicción con documentación previa (no estaba señalado en ningún documento
existente), es un hallazgo nuevo de esta auditoría, relevante para diseñar los casos de
borde de la matriz de testeo:

- `RegistroClienteRequestDTO.password` tenía `@ValidarPasswordSegura` **+**
  `@Size(max=72, message="La contraseña no puede superar los 72 caracteres")` — un
  password de 100 caracteres (aunque cumpla mayúscula/minúscula/número) devolvía el
  mensaje dedicado de longitud.
- `CambioPasswordPerfilRequestDTO.passwordNueva` y
  `ConfirmarRecuperacionPasswordRequestDTO.nuevaPassword` tienen **solo**
  `@ValidarPasswordSegura`, sin `@Size` propio. Como el regex del validador es
  `^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,72}$` (ancla `{8,72}` sobre el string completo), un
  password de más de 72 caracteres **también se rechaza** (el `.{8,72}` no matchea), pero
  con el mensaje genérico de complejidad ("Debe tener mínimo 8 caracteres, una mayúscula,
  una minúscula y un número") en vez de uno que hable de longitud — aunque el password
  cumpla perfectamente mayúscula/minúscula/número. Esto es funcionalmente correcto (rechaza
  igual, con `400`), pero el mensaje que ve el usuario en cambio de contraseña/recuperación
  sería engañoso en ese caso límite puntual, a diferencia del registro. Relevante para
  Parte 4 al diseñar el caso de "contraseña de 73+ caracteres, por lo demás válida".

### 5. Sin ninguna cobertura de Postman para el endpoint de foto de perfil de Usuario (`/usuarios/{id}/foto-perfil*`)

Confirmado por el listado completo de las 223 requests de `Bajonea-MVP.postman_collection.json`
(ver Parte 1, formulario 8): no existe ninguna carpeta ni request para
`POST /usuarios/{id}/foto-perfil/firma`, `PATCH /usuarios/{id}/foto-perfil` ni
`DELETE /usuarios/{id}/foto-perfil`. Este es un endpoint real, implementado y usado por
`perfil.html` (Cliente) — sin ningún dato de que también lo use `comercio-perfil.html`
(Comercio tiene su propio flujo de foto vía `ComercioController`, según
`CLAUDE.md` §7bis). Gap de cobertura a resolver en el prompt de la matriz de testeo.

### 6. La colección de Postman sigue usando el flujo de verificación por link (`GET /auth/verificar/{token}`) como camino principal en varias carpetas, no el flujo primario real por código

`CLAUDE.md` (Fase 10, reapertura del 2026-07-31) ya documenta que "desde el Tramo
16.11/16.12 el mecanismo primario es un código de 6 dígitos" y que el endpoint
`POST /auth/verificar` (con código) es el que se cerró y confirmó como flujo real. Sin
embargo, en la colección de Postman actual, las carpetas `02 - Auth`, `10 - Administrador
(...)` y `19 - Bloqueo de comercio (...)` siguen usando `GET
/test/token-verificacion?email=...` (bypass) seguido de `GET /auth/verificar/{{token}}`
(el endpoint de link, no de código) para activar las cuentas de prueba que necesitan para
sus propios escenarios — solo la carpeta `09 - Auth avanzado (...)` ejercita el flujo real
por código (`POST /auth/verificar` con `codigo`, más el negativo de código incorrecto).
Esto no es necesariamente un bug de la colección (el endpoint de link sigue existiendo y
funcionando, `AuthController.verificarEmail`, lo cual es válido como atajo de setup para
escenarios que no están probando verificación en sí) — pero confirma lo que `CLAUDE.md` ya
anotaba como pendiente ("actualización de la colección de Postman... desalineada con
`bajonea_final`") y es información relevante para decidir, en el prompt de la matriz, si
conviene migrar también estos usos de setup al flujo por código, por consistencia.

### 7. `docs/diccionario-de-datos.md` documenta múltiples direcciones activas por Cliente; la implementación real sigue acotada a una sola

No es una inconsistencia de código (ambas piezas son coherentes con lo que `CLAUDE.md`
ya declara como pendiente), pero vale dejarlo explícito para quien arme la matriz de
testeo a partir de este documento: la tabla `Direccion` en
`docs/diccionario-de-datos.md` (línea 486) dice "Un cliente puede tener múltiples
direcciones activas. Solo una puede tener `principal = true`" — describiendo el modelo de
datos **objetivo** del proyecto completo. La implementación real de hoy
(`DireccionRepository.findByClienteId` devuelve `Optional<Direccion>`, singular;
`ClienteResponseDTO.direccion` es un objeto único, no una lista; no existe ningún
Controller que liste o cree múltiples direcciones de un Cliente) sigue tratando la
dirección del Cliente como una sola, de solo lectura desde su perfil. Cualquier test que
asuma "un Cliente puede tener 2 direcciones" fallaría contra el backend real hoy — esto es
esperado y coherente con `CLAUDE.md` §1bis (múltiples direcciones de cliente sigue en la
lista de tramos nuevos sin planificar), no un bug.

### 8. `ItemCarritoRequestDTO`/`ActualizarCantidadItemCarritoRequestDTO` — la auditoría previa no cubrió estos DTOs; no hay contradicción, solo ausencia

`docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` explícitamente decía en su introducción que no
auditaba "el carrito/checkout, ya cerrados" (dándolos por ya resueltos en un tramo previo
a esa auditoría). Esta auditoría confirma que, en efecto, están correctamente
implementados y alineados (ver Parte 2, puntos 9-11) — se deja constancia de que no hubo
ninguna contradicción real encontrada en este bloque, solo se llenó el vacío de detalle
campo por campo que no existía en ningún documento previo.

### 9. Los 3 bugs reales encontrados por la matriz de Postman (`docs/MAPEO-ARCHIVOS-TRAMO-MATRIZ-POSTMAN-CLIENTE.md`, punto 3) ya fueron corregidos

Corregidos el 2026-09-03, con evidencia real (curl + `bajonea_test`) documentada en
`docs/MAPEO-ARCHIVOS-TRAMO-BUGS-CLIENTE.md`:

1. **`FotoPerfilUsuarioRequestDTO.url` sin `@Size(max=500)` → 500 en vez de 400.**
   Corregido agregando `@Size(max = 500, message = "La URL de la foto de perfil no puede
   superar los 500 caracteres")`. Verificado boundary exacto contra el backend real: 500
   caracteres → `200`, 501 → `400` con el mensaje nuevo (antes: `500` genérico).
2. **Mensaje de `@Size` sin `message` custom, locale-dependiente en
   `ClienteEditarPerfilRequestDTO`.** Corregido agregando `message` en español a `nombre` y
   `apellido`. **Hallazgo adicional no listado en el reporte original:** `telefono` en el
   mismo DTO tenía el mismo `@Size(max=30)` sin mensaje (la afirmación de "los dos únicos
   campos del proyecto" del reporte original no era exacta — había un tercero en el mismo
   archivo) — corregido con el mismo criterio. Verificado que los 3 mensajes ya no dependen
   de `Accept-Language`. Nota: `telefono` sigue pudiendo alternar entre dos mensajes
   distintos (el de `@Size` y el de `@ValidarTelefonoArgentino`) cuando ambas reglas fallan
   a la vez, por el mismo no-determinismo de orden del punto 3 de abajo — pero ahora ambas
   variantes están en español, así que deja de ser un bug de UX visible, solo queda la
   inconsistencia menor de cuál de las dos gana. No se tocó (fuera del alcance pedido para
   este tramo, que acotaba el fix de no-determinismo únicamente a `password`).
3. **Orden no determinístico de `ConstraintViolation` en `RegistroClienteRequestDTO.password`.**
   Corregido eliminando el `@Size(max = 72)` redundante — `@ValidarPasswordSegura` ya
   acotaba la longitud en su propio regex (`.{8,72}`), así que el `@Size` nunca aportaba una
   regla adicional, solo competía por el mensaje. Verificado con 5 llamados idénticos
   seguidos a un password de 73 caracteres: mensaje único y determinístico en las 5
   corridas. Ver también punto 4 de arriba — esto deja a `RegistroClienteRequestDTO` con el
   mismo criterio que ya usaban `CambioPasswordPerfilRequestDTO`/
   `ConfirmarRecuperacionPasswordRequestDTO`.

Colección de Postman actualizada acorde (3 requests, ver `docs/MAPEO-ARCHIVOS-TRAMO-BUGS-CLIENTE.md`)
y corrida completa 2 veces desde `bajonea_test` limpia: 793/795 en verde (los 2 restantes
son el mismo fallo ambiental de rate limit ya documentado en Parte 5, sin relación con
estos bugs). **No cerrado** — pendiente de confirmación explícita de Diego, mismo criterio
que el resto del proyecto.

---

## Parte 4 — Datos de referencia para armar la matriz de testeo

Valores límite exactos extraídos del código real (no inventados), para usar directamente
al diseñar los casos de prueba de la matriz. Todas las anotaciones custom están en
`backend/src/main/java/com/bajonea/backend/validation/` (catálogo también documentado en
`.claude/skills/skill-validaciones/SKILL.md`).

### Longitudes (columna física vs. límite de validación)

| Campo | Columna física (`docs/diccionario-de-datos.md` / entidades) | Límite de validación real |
|---|---|---|
| `nombre` (Cliente) | `persona_fisica.nombre` VARCHAR(100) | `@Size(max=100)` en registro y en edición de perfil — coinciden exactamente con la columna. |
| `apellido` (Cliente) | `persona_fisica.apellido` VARCHAR(100) | Igual que `nombre`. |
| `dni` | `persona_fisica.dni` VARCHAR(10) UNIQUE | Formato válido: exactamente 7 u 8 dígitos (`^\d{7,8}$`), sin `@Size` propio — la columna tiene margen de sobra (10) respecto al formato real exigido. |
| `telefono` | `persona_fisica.telefono` VARCHAR(30) | Formato válido: `+549` + exactamente 10 dígitos = 14 caracteres reales, con `@Size(max=30)` como techo adicional (nunca alcanzable con el formato válido). |
| `email` | `usuario.email` VARCHAR(254) | `@Size(max=254)` — coincide exactamente (254 es el máximo teórico RFC 5321/5322, documentado explícitamente en `docs/diccionario-de-datos.md` línea 502). |
| `password` (registro) | `usuario.password_hash` VARCHAR(255) (hash, no el valor crudo) | Valor crudo: 8 a 72 caracteres (72 = límite físico de bcrypt). `RegistroClienteRequestDTO` tiene `@Size(max=72)` explícito; `CambioPasswordPerfilRequestDTO`/`ConfirmarRecuperacionPasswordRequestDTO` no (ver Parte 3 #4) — el rechazo en >72 ocurre igual, vía el propio patrón `{8,72}` del validador. |
| `direccion.calle` | `direccion.calle` VARCHAR(150) | `@Size(max=150)` — coincide. |
| `direccion.numero` | `direccion.numero` VARCHAR(10) | `@Size(max=10)` + formato `^\d+$` — coincide. |
| `direccion.pisoDepto` | `direccion.piso_depto` VARCHAR(30), NULL | `@Size(max=30)`, opcional — coincide. |
| `direccion.codigoPostal` | `direccion.codigo_postal` VARCHAR(10) | Sin `@Size` propio; formato válido acota a 4 u 8 caracteres, ambos dentro del margen de la columna. |
| `direccion.localidadId` | `direccion.localidad_id` VARCHAR(15) | `@Size(max=15)` — coincide exactamente (son los ids reales de la API Georef, alfanuméricos). |
| `item_carrito.nota` | `item_carrito.nota` VARCHAR(255), NULL | `@Size(max=255)` — coincide exactamente, y el `maxlength="255"` del HTML también coincide. |

### Regex exactos

| Validación | Regex (backend, Java) | Regex (frontend, JS) — coincide salvo notación |
|---|---|---|
| Nombre/apellido — registro (`@ValidarFormatoNombre`) | `^[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+(?:[-' ][A-Za-zÁÉÍÓÚáéíóúÑñÜü]+)*$` | `esNombreClienteValido`: idéntico. |
| Nombre/apellido — edición de perfil (`@ValidarNombrePropio`) | `^\p{L}[\p{L} '-]*$` (Unicode completo — **charset distinto y más permisivo** que el de registro, acepta cualquier letra Unicode, no solo el subconjunto latino con acentos españoles) | `esNombrePropioValido`: `^\p{L}[\p{L} '-]*$/u` — idéntico. |
| DNI (`@ValidarFormatoDni`) | `\d{7,8}` (tras sanitizar `[.\-\s]`) | `esDniClienteValido`: `^\d{7,8}$` tras `sanitizarDni` — idéntico. |
| Teléfono argentino (`@ValidarTelefonoArgentino`) | `^\+549\d{10}$` (tras sanitizar `[ ()\-]`) | `esTelefonoValido`: mismo algoritmo — idéntico. |
| Email — formato acotado (`@ValidarFormatoEmail`) | `^[^\s@]+@[^\s@]+\.[^\s@]+$` | `esEmailValido`: idéntico. |
| Email — login/verificación/recuperación/reactivación (`@Email` de Hibernate) | RFC estándar de Hibernate Validator (más permisivo/distinto internamente que el regex custom de arriba — no se auditó su regex interno exacto en esta pasada, es una anotación de librería, no código propio del proyecto). | `esEmailValido` en los formularios que lo usan como validador propio (recuperación/reactivación) — mismo regex acotado, no el de Hibernate. |
| Password segura (`@ValidarPasswordSegura`) | `^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,72}$` | `esPasswordSegura`: longitud 8-72 + `/[A-Z]/` + `/[a-z]/` + `/[0-9]/` — mismo criterio, distinta notación (lookahead vs. tests separados), resultado idéntico. |
| Código postal argentino (`@ValidarCodigoPostalArgentino`) | Clásico `^\d{4}$` o CPA `^[A-Za-z]\d{4}[A-Za-z]{3}$` (sin distinguir mayúsculas/minúsculas) | `esCodigoPostalValido`: mismos 2 patrones — idéntico. |
| Calle / texto libre permisivo (`@Pattern` en `DireccionRequestDTO.calle`) | `.*[\p{L}0-9].*` (al menos un alfanumérico en cualquier posición) | `esCalleValida`: `/[\p{L}0-9]/u` — mismo criterio. |
| Número de dirección (`@Pattern`) | `^\d+$` | `esNumeroDireccionValido`: `^\d+$` — idéntico. |
| Piso/Depto (`@Pattern`) | `\s*|.*[\p{L}0-9].*` (vacío/blanco O al menos un alfanumérico) | `esTextoConContenidoValido`: `/[\p{L}0-9]/u`, invocado solo si el campo no está vacío — resultado equivalente. |
| Código de verificación/recuperación/reactivación (`@Pattern`) | `\d{6}` | Sin validador JS propio — se apoya en el input OTP estructural (`js/otp.js`, 6 casilleros de 1 dígito cada uno). |
| URL de Cloudinary (`@ValidarUrlCloudinary`) | Esquema exacto `https` + host exacto `res.cloudinary.com` | No aplica (la URL nunca la tipea el usuario). |
| Extensión de archivo de foto de perfil (`@Pattern` en `FotoPerfilUsuarioRequestDTO.url`) | `(?i).*\.(jpg\|jpeg\|png\|webp)$` | `validarArchivoImagen` (cliente): valida `file.type` MIME (`image/jpeg`, `image/png`, `image/webp`) antes de subir, no la extensión del nombre de archivo — validación equivalente mirando un atributo distinto del mismo archivo. |

### Rangos numéricos

| Campo | Rango |
|---|---|
| `ItemCarritoRequestDTO.cantidad` / `ActualizarCantidadItemCarritoRequestDTO.cantidad` | `@Min(1)` / `@Max(20)` — enteros, sin decimales. Frontend: stepper clampeado 1-20 en ambos formularios (alta y edición). |
| `fechaNacimiento` (plausibilidad, sin piso de edad para Cliente) | No futura (`≤ hoy`) y no anterior a 120 años desde hoy — sin mínimo de edad (18 años retirado del Cliente el 2026-09-01; sigue vigente solo para `fechaNacimientoRepresentante` de Comercio, fuera de alcance de este documento). |
| Código de verificación/recuperación/reactivación | Exactamente 6 dígitos, `0` a `9` en cada posición — sin rango numérico como tal, es un patrón de longitud fija. |
| Archivo de foto de perfil (Cliente) | Tamaño ≤ 5 MB (`TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024`, `js/cloudinary.js`) — límite exclusivamente de frontend, no hay validación de tamaño de archivo en el backend (el backend solo valida la URL resultante, no el binario, que nunca recibe — ver `CLAUDE.md` §2, "el backend nunca recibe el binario"). |

### Enums cerrados relevantes a Cliente

| Campo | Valores | Origen |
|---|---|---|
| `PedidoRequestDTO.tipoEntrega` | `DOMICILIO`, `RETIRO` (`TipoEntrega`) | `backend/src/main/java/com/bajonea/backend/enums/TipoEntrega.java` (no releído línea por línea en esta pasada, valores confirmados por uso real en `checkout.js`/`PedidoService`). |
| `Usuario.rol` (contexto, no editable por el Cliente) | `CLIENTE`, `DUENO`, `ADMINISTRADOR` — **ya no incluye `COMERCIO`** (renombrado a `DUENO` en el Tramo 6 de portabilidad, confirmado en `enums/RolUsuario.java`); `EMPLEADO` todavía no existe como valor del enum pese a estar en el diccionario de datos completo (`docs/diccionario-de-datos.md`), consistente con que `Empleado` sigue sin implementar. | `backend/src/main/java/com/bajonea/backend/enums/RolUsuario.java`. |

---

## Parte 5 — Cobertura de test tras el tramo de matriz exhaustiva de Postman (2026-09-03)

Actualización real, no cerrada — pendiente de confirmación de Diego (ver
`docs/MAPEO-ARCHIVOS-TRAMO-MATRIZ-POSTMAN-CLIENTE.md` para el detalle de infraestructura,
bugs encontrados y decisiones de este tramo). Por formulario, qué campos **ya tenían**
cobertura negativa/boundary antes de este tramo (según la Parte 2 de arriba) vs. qué quedó
cubierto **ahora**, campo por campo, en la carpeta de Postman correspondiente.

| # | Formulario | Antes (Parte 2) | Ahora | Carpeta Postman |
|---|---|---|---|---|
| 1 | Registro de Cliente | Solo `dni` (duplicado) y `localidadId` (inexistente) tenían negativo real | Los 11 campos propios + los 7 de `direccion` tienen vacío + 2 formatos inválidos + límite inferior/superior boundary donde aplica (incluye alterno CPA de código postal, DNI con separadores, teléfono con separadores, email/password/calle/numero/pisoDepto en su límite exacto). `password` de 73 caracteres: mensaje único y determinístico desde el 2026-09-03 (bug 3 corregido, ver Parte 3 punto 9) | `22 - Matriz Cliente - Registro (campo por campo)` (54 requests) |
| 2 | Login | Ninguno (solo credenciales incorrectas) | `email` vacío/formato inválido, `password` vacío | `23 - Matriz Cliente - Login` (3) |
| 3 | Verificación de cuenta | Solo el flujo feliz y "código incorrecto" | `email`/`codigo` vacío y formato inválido en ambos endpoints (`/verificar` y `/reenviar-verificacion`), longitud de código corta/larga, código real de 6 dígitos vía flujo encadenado | `24 - Matriz Cliente - Verificacion de cuenta` (11) |
| 4 | Recuperación de contraseña | Solo "email inexistente" y "código incorrecto" | Los 3 pasos completos: `email` vacío/inválido (paso 1 y 2), `codigo` vacío/formato/longitud (paso 2), `nuevaPassword` vacío/sin mayúscula/sin número/límite inferior/72 exacto vía flujo real, `codigo` real vía flujo encadenado — sin la asimetría de `@Size` con `RegistroClienteRequestDTO` desde el 2026-09-03 (Parte 3 punto 4/9) | `25 - Matriz Cliente - Recuperacion de password` (18) |
| 5 | Reactivación de cuenta | Solo "cuenta ya activa" y "código inexistente" | `email` vacío/inválido (ambos pasos), `codigo` vacío/formato/longitud | `26 - Matriz Cliente - Reactivacion de cuenta` (7) |
| 6 | Edición de perfil de Cliente | Solo `PUT` válido y teléfono inválido | `nombre`/`apellido` vacío + 2 formatos + límite superior boundary (mensaje único en español desde el 2026-09-03, bug 2 corregido, ver Parte 3 punto 9 — incluye el hallazgo adicional de `telefono` con el mismo gap), `telefono` vacío + 2 formatos + alterno con separadores | `27 - Matriz Cliente - Perfil (datos personales)` (20, incluye 5 de setup) |
| 7 | Cambio de contraseña desde perfil | Solo flujo feliz y 2 negocio (actual incorrecta, nueva=actual) | `passwordActual` vacío, `passwordNueva` vacío/sin mayúscula/sin número/límite inferior/73 caracteres/72 exacto vía flujo real (cliente aparte, ya que el cambio exitoso invalida la sesión) | `28 - Matriz Cliente - Cambio de password desde perfil` (11, incluye setup del caso 72) |
| 8 | Foto de perfil de Cliente | Ninguna (carpeta inexistente) | `url` vacío/host inválido/extensión inválida/esquema inválido/límite superior exacto (500, acepta)/501 (`400` limpio desde el 2026-09-03, bug 1 corregido, ver Parte 3 punto 9)/válida, aislamiento entre usuarios (404) | `29 - Matriz Cliente - Foto de perfil (Usuario)` (12, incluye setup) |
| 9 | Agregar producto al carrito | Cobertura de límites solo en el endpoint de edición, no en este | `cantidad` vacío/0/1/20/21, `productoId` vacío, `nota` vacío/255/256 | `30 - Matriz Cliente - Carrito (alta y edicion de cantidad)` (primera mitad de 29, comparte setup) |
| 10 | Gestión del carrito (editar cantidad) | Ya tenía el mejor cobertura negativa del rol Cliente (0, 21, item inexistente) | Igual + `cantidad` vacío explícito + límite inferior/superior exacto (1/20) confirmados con evidencia | `30 - Matriz Cliente - Carrito (alta y edicion de cantidad)` (segunda mitad) |
| 11 | Checkout / Confirmar pedido | `direccionId` con 2 negocios reales, `tipoEntrega` sin cobertura de "comercio no ofrece esa modalidad" | `tipoEntrega` vacío/fuera de enum (deserialización JSON, no Bean Validation)/DOMICILIO sin dirección/RETIRO válido/DOMICILIO contra comercio sin delivery (regla de negocio real) | `31 - Matriz Cliente - Checkout` (15, incluye setup de un segundo comercio) |
| 12 | Explorar (búsqueda y filtros) | Solo flujo feliz y "página fuera de rango sin error" | `q` vacío/SQL-injection-like/XSS-like (ambos confirmados como texto literal, sin romper — chequeo de seguridad básico), `categoriaId`/`tagIds` inexistentes, `pagina` fuera de rango/negativa | `32 - Matriz Cliente - Explorar (busqueda y filtros del catalogo)` (7) |

**Total agregado:** 187 requests nuevos (223 → 410), 353 assertions nuevas (441 → 794).
792/794 en verde en dos corridas consecutivas desde `bajonea_test` limpia — el único fallo es
ambiental (rate limit deshabilitado bajo el perfil `test`, no reproducible bajo perfil
default, sin relación con el rol Cliente). Limpieza final confirmada con `SELECT` en cero.

**Actualización del 2026-09-03 (tramo de corrección de bugs):** los 3 bugs reales
encontrados por esta matriz (ver Parte 3 punto 9) ya fueron corregidos, con la colección
actualizada acorde (1 assertion nueva sumada al request de foto de perfil, y los otros 2
ajustados de "acepta 2 mensajes posibles" a "mensaje único determinístico"). Corrida
completa 2 veces más desde `bajonea_test` limpia tras los fixes: **793/795 en verde**, mismo
único fallo ambiental de rate limit de siempre. Detalle completo en
`docs/MAPEO-ARCHIVOS-TRAMO-BUGS-CLIENTE.md`.

## Parte 5bis — Cobertura de test Playwright (2026-09-03)

Suma la cobertura de navegador real a la matriz de Postman de la Parte 5 — detalle completo
de infraestructura, hallazgos y bugs propios corregidos en
`docs/MAPEO-ARCHIVOS-TRAMO-PLAYWRIGHT-MATRIZ-CLIENTE.md`. Por diseño, no repite casos de
formato/límite que Postman ya prueba igual de bien a nivel de API — se concentra en lo que
solo el navegador puede probar de verdad (bloqueo de teclado, formateo en vivo, mensajes
cerca del campo, habilitación/deshabilitación de botones, boundary visual de HTML, pasos
intermedios de flujos multi-paso, debounce).

| # | Formulario | Cobertura de navegador nueva | Archivo(s) |
|---|---|---|---|
| 1 | Registro de Cliente | Bloqueo de teclado en tiempo real de DNI y teléfono (letras/símbolos descartados carácter por carácter, no solo al enviar) | `01-registro-y-verificacion.spec.ts` (+1 test sobre el archivo ya existente de Fase 17) |
| 4 | Recuperación de contraseña | Flujo completo de los 3 pasos por UI real (no solo por API): código incorrecto en el paso intermedio no deja avanzar; código real sí; fortaleza visual en vivo; confirmación que no coincide bloquea el submit; contraseña vieja deja de servir y la nueva sí loguea (persistencia real) | `10-recuperacion-y-reactivacion.spec.ts` |
| 5 | Reactivación de cuenta | Único caso real alcanzable (cuenta ya activa → sin token real → cualquier código se rechaza) probado por UI; OTP con bloqueo de teclado en tiempo real. Flujo feliz completo sigue sin cobertura real posible (mismo gap que Postman, sin vía de API para `EstadoUsuario.INACTIVO`) | `10-recuperacion-y-reactivacion.spec.ts` |
| 6 | Edición de perfil de Cliente | `maxlength=100` real de nombre/apellido (boundary visual, no solo de backend); bloqueo de teclado en tiempo real del teléfono; guardado válido con persistencia confirmada por `GET` después del toast | `11-perfil-cliente.spec.ts` |
| 7 | Cambio de contraseña desde perfil | Aviso real de "1 intento más y se bloquea" recién en el 2do intento fallido (contador real de `AuthService`, sin llegar a bloquear la cuenta); fortaleza visual en vivo; cambio exitoso invalida la sesión real y la contraseña nueva loguea | `11-perfil-cliente.spec.ts` |
| 8 | Foto de perfil de Cliente | Archivo >5MB / formato inválido rechazados en el cliente sin llegar a pedir la firma de Cloudinary (confirmado escuchando la red); flujo subir→editar→eliminar contra Cloudinary real con persistencia confirmada; aislamiento entre usuarios por UI+API | `11-perfil-cliente.spec.ts` |
| 9/10 | Carrito | Clampeo visual real en 1 y 20 (botones deshabilitados) en el modal de producto y en `carrito.html`, con persistencia confirmada por `SELECT`; `maxlength=255` real de la nota; **hallazgo real de UI no corregido:** el stepper del modal de producto no refleja el piso de cantidad=1 hasta el primer click (detalle completo en `docs/MAPEO-ARCHIVOS-TRAMO-PLAYWRIGHT-MATRIZ-CLIENTE.md`, punto 8) | `12-carrito-checkout-explorar.spec.ts` |
| 11 | Checkout | Botón "Continuar" del paso 1 con `disabled` real hasta elegir modalidad; bloqueo real de DOMICILIO sin dirección con mensaje visible (única excepción del proyecto a "nunca mockear" — sin vía real de API para simular un Cliente sin dirección, documentado en el propio test) | `12-carrito-checkout-explorar.spec.ts` |
| 12 | Explorar | Debounce real de 300ms probado con el reloj virtual de Playwright (no con esperas de tiempo real, que resultaron ser una carrera genuina); filtros de categoría+tag+texto combinados; mensaje real de "sin resultados" | `12-carrito-checkout-explorar.spec.ts` |

**Total agregado:** 23 tests nuevos (36 → 59 sobre el total de la suite completa de
Playwright, sumando los otros roles). 58/59 en verde en dos corridas consecutivas desde
`bajonea_test` recién reseteada (`npm run test:reset`, `--workers=1`) — el único fallo es el
mismo ya aceptado en el cierre de Fase 17 (bug de layout preexistente del FAB de
Administrador en `admin-categorias.html`, sin relación con Cliente ni con este tramo).
Persistencia real confirmada con `SELECT` directo (no solo la UI/API) para los formularios
6, 9/10 y 12. 4 bugs propios de los tests (no de la app) encontrados y corregidos en el
camino, detallados en el mapeo de Playwright.

**No cerrado.** Pendiente de confirmación de Diego, mismo criterio que el resto de tramos.

---

## Cierre

Inventario de 12 formularios/flujos reales de Cliente (11 esperados por el prompt original
+ 1 no documentado en ningún lugar previo — búsqueda/filtros del catálogo). Validación
campo por campo relevada para los 12, con su cobertura real de test (Postman/Playwright)
anotada campo por campo, no a nivel de formulario. 8 discrepancias documentadas contra el
estado previo, la más relevante siendo la pantalla de búsqueda global que la Fase 15 daba
por excluida y hoy existe y funciona contra el backend real.

**Actualización del 2026-09-03:** con el cierre de los 3 tramos derivados de esta auditoría
— corrección de los 3 bugs reales de Postman (Parte 3 punto 9), matriz exhaustiva de
Postman (Parte 5) y matriz exhaustiva de Playwright (Parte 5bis) — la cobertura exhaustiva
de los 12 formularios de Cliente queda completa a nivel de test (API + navegador). Sin
cerrar ninguno de los 3 tramos todavía — a la espera de que Diego confirme el checklist
completo de cada uno antes de dar por terminado este bloque de trabajo. Comercio y
Administrador quedan para tramos aparte, después de esa confirmación.
