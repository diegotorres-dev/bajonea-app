# Auditoría exhaustiva de formularios de Comercio (2026-09-03)

> **Documento de auditoría pura — no se implementó ni corrigió nada.** Mismo criterio y
> metodología que `docs/AUDITORIA-EXHAUSTIVA-CLIENTE.md` (lectura directa del código real:
> backend `entities/`/`dto/request/`/`validation/`/`services/`/`controllers/`, frontend
> `frontend/*.html` + `frontend/js/*.js`), aplicado ahora al rol Comercio/Dueño.
> `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` (2026-09-01) se usó como punto de partida a
> contrastar, nunca como fuente de verdad — varios de sus hallazgos sobre Comercio ya no
> reflejan el código actual (ver Parte 3). Fase 1 únicamente: inventario, tabla campo por
> campo, discrepancias y valores límite — sin armar ninguna matriz de testeo nueva (esa
> queda para un prompt aparte, igual que se hizo para Cliente).

---

## Parte 1 — Listado completo y confirmado de formularios/flujos de Comercio

Recorrido completo de `frontend/*.html` + `frontend/js/comercio.js`/`cloudinary.js`/`crop.js`,
cruzado contra `backend/src/main/java/com/bajonea/backend/dto/request/`,
`controllers/`, `services/`. `comercio-detalle.html` se descartó del inventario: su script
(`<script type="module">import { initComercioDetalle } from './js/catalogo.js';`, línea 31)
confirma que es una pantalla del rol **Cliente** viendo el detalle de un comercio, no una
pantalla operada por el Comercio — no tiene relación con este documento.

### 1. Wizard de registro de Comercio (4 pasos)

- **Pantalla:** `registro-comercio.html`, con las 4 secciones/tabs de progreso reales
  (`step-progress__labels`, líneas 25-30): **"1. Negocio"**, **"2. Legales"**,
  **"3. Horarios"**, **"4. Redes sociales"** — coinciden exactamente con lo asumido en el
  prompt original.
- **JS:** `js/auth.js`, función `initRegistroComercio` (líneas 632-1281).
- **Endpoints:** `POST /api/v1/auth/registro/comercio` (alta) + `POST
  /api/v1/auth/registro/comercio/foto-firma` (firma Cloudinary de la foto de perfil,
  obligatoria — a diferencia del registro de Cliente, donde la foto es opcional).
- **DTO:** `RegistroComercioRequestDTO` — combina en un único body plano los campos de
  `PersonaJuridica` + `PersonaFisica` (representante) + `Comercio` + credenciales de acceso
  + `List<HorarioRequestDTO> horarios` + `List<RedSocialRequestDTO> redesSociales`
  (`RegistroComercioRequestDTO.java:79-213`).
- **Paso "1. Negocio":** nombre, descripción (opcional), teléfono, email de contacto, tipo de
  comercio (select, `TipoComercio`, 12 valores), modalidades de entrega (2 switches,
  "al menos una"), foto de perfil (obligatoria, con recorte 1:1), dirección completa
  (calle/número/piso-depto/código postal/provincia/localidad).
- **Paso "2. Legales":** datos del representante (nombre, apellido, DNI, fecha de nacimiento,
  teléfono) + datos legales del comercio (razón social, CUIT, fecha de inicio de actividades,
  tipo de sociedad, condición ante el IVA, domicilio fiscal) + credenciales de acceso (email,
  password, confirmar password).
- **Paso "3. Horarios":** confirmado un rediseño real no mencionado en la lista de partida del
  prompt — dos tabs, **"Horario fijo"** (bloque de "franja rápida": tildar días + una franja
  Desde/Hasta, aplicable a varios días a la vez) y **"Personalizado"** (filas individuales,
  una por franja). Ambos tabs escriben sobre el mismo array de filas subyacente
  (`horario-list`), es una sola fuente de datos con dos formas de cargarla — ya documentado en
  `CLAUDE.md` §6 (Tramo del "rediseño de 3. Horarios con pestañas") y confirmado vigente hoy.
- **Paso "4. Redes sociales":** lista dinámica de filas (tipo + URL), 1 obligatoria, 5 como
  máximo, mismo componente visual que las filas de horario.
- **Sin cobertura de Figma discutida en este documento** (fuera de alcance de esta auditoría).

### 2. Login

Mismo formulario compartido con Cliente/Administrador (`login.html`, `LoginRequestDTO`) — ya
auditado en `docs/AUDITORIA-EXHAUSTIVA-CLIENTE.md` Parte 2, punto 2. Sin diferencias por rol
a nivel de campos — no se re-audita acá.

### 3. Verificación de cuenta / Recuperación de contraseña / Reactivación de cuenta

Mismos 3 flujos compartidos con Cliente (`verificar-email.html`, `recuperar-password.html`,
`reactivar-cuenta.html`), mismos DTOs (`VerificarCodigoRequestDTO`,
`ReenviarVerificacionRequestDTO`, `RecuperacionPasswordRequestDTO`,
`ValidarCodigoRecuperacionRequestDTO`, `ConfirmarRecuperacionPasswordRequestDTO`,
`ReactivacionCuentaRequestDTO`, `ConfirmarReactivacionCuentaRequestDTO`) — ya auditados
campo por campo en `docs/AUDITORIA-EXHAUSTIVA-CLIENTE.md` Parte 2, puntos 3-5. Sin
diferencias por rol. Único matiz específico de Comercio, ya documentado en `CLAUDE.md` §Tabla
de fases (Fase 17): al reactivarse/desbloquearse la cuenta del Dueno, el estado de sus
comercios en `CERRADO_TEMPORALMENTE`/`INACTIVO` también se restaura — comportamiento de
`ComercioService`/`AuthService`, no de estos formularios en sí.

### 4. Edición de perfil de Comercio

- **Pantalla:** `comercio-perfil.html`, vista `view-editar-perfil`.
- **JS:** `js/comercio.js`, función `initComercioPerfil` (líneas 836-1082, bloque del
  formulario en 949-1007).
- **Endpoint:** `GET /api/v1/comercios/perfil` (precarga) + `PUT /api/v1/comercios/perfil`
  (guardar).
- **DTO:** `ComercioPerfilRequestDTO` (`nombre`, `descripcion`, `telefono`, `emailContacto`,
  `aceptaDelivery`, `aceptaRetiro`). No incluye datos legales (`razonSocial`/`cuit`/etc., de
  solo lectura en la vista `view-datos-legales`, con aviso "Si necesitás modificar tus datos
  legales, comunicate con soporte") ni `fotoPerfilUrl` (flujo aparte, ver punto 5).

### 5. Foto de perfil de Comercio

- **Pantalla:** `comercio-perfil.html` (avatar clickeable en `view-editar-perfil`, botón
  "Cambiar foto").
- **JS:** `js/comercio.js` (líneas 904-935) + `js/cloudinary.js`
  (`subirFotoPerfilComercio`) + `js/crop.js` (recorte 1:1 antes de subir).
- **Endpoints:** `POST /api/v1/comercios/perfil/foto/firma` (firma) + `PUT
  /api/v1/comercios/perfil/foto` (guardar URL).
- **DTO:** `FotoPerfilComercioRequestDTO` (`url`, único campo, nunca tipeado por el usuario —
  sale de `uploadData.secure_url`). Sin endpoint de eliminación (a diferencia de la foto de
  perfil de Usuario/Cliente, que sí tiene `DELETE`) — coherente con que
  `Comercio.fotoPerfilUrl` es `NOT NULL` en el modelo (`docs/diccionario-de-datos.md:670`),
  nunca puede quedar sin foto una vez registrado.

### 6. Cambio de contraseña desde perfil

Mismo endpoint (`POST /auth/cambiar-password`) y mismo `CambioPasswordPerfilRequestDTO` que
Cliente, con implementación JS prácticamente duplicada carácter por carácter
(`js/comercio.js:1009-1081` vs. `js/cliente.js`, ya señalado como candidato a refactor en
`docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` punto 8). Se detalla campo por campo en la Parte 2
porque el texto exacto del mensaje de contraseña insegura difiere sutilmente entre los dos
archivos duplicados (ver Parte 3, punto 2).

### 7. CRUD de productos — alta y edición

- **Pantallas:** `comercio-producto-form.html` (alta/edición) + `comercio-productos.html`
  (listado).
- **JS:** `js/comercio.js`, funciones `initComercioProductoForm` (líneas 1394-1773) e
  `initComercioProductos` (líneas 1262-1392).
- **Endpoints:** `POST /api/v1/productos` (alta) + `PUT /api/v1/productos/{id}` (edición) +
  `GET /api/v1/productos` (listado propio).
- **DTO:** `ProductoRequestDTO` (`nombre`, `descripcion`, `precio`, `categoriaId`, `tagIds`).
  Ya auditado parcialmente en `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` (nombre/precio/
  categoriaId resueltos en el tramo del 2026-09-02) — `descripcion` y `tagIds`, no cubiertos
  ahí, se detallan en la Parte 2 de este documento.

### 8. Cambio de estado de producto (Disponible / Agotado / Descontinuar)

- **Pantallas:** `comercio-productos.html` (menú de 3 puntitos por fila) y
  `comercio-producto-form.html` (link "Descontinuar producto" en modo edición).
- **JS:** `js/comercio.js`, `mostrarModalAccionProducto` (1141-1227) y
  `mostrarModalConfirmarDescontinuar` (1228-1261).
- **Endpoint:** `PATCH /api/v1/productos/{id}/estado`.
- **DTO:** `CambioEstadoProductoRequestDTO` (`estado`, único campo, `EstadoProducto` enum
  cerrado de 3 valores). No es un formulario de texto — son botones de un modal de acción, sin
  ningún campo tipeado por el usuario. Se incluye en el inventario por ser un flujo de mutación
  real con su propio DTO/endpoint, pero no aporta filas a la tabla de la Parte 2 más allá de
  la nota de "sin validación de formato posible, es un enum".

### 9. Gestión de imágenes de producto (galería, orden, recorte)

- **Pantalla:** `comercio-producto-form.html` (tile de galería con drag-and-drop).
- **JS:** `js/comercio.js` (funciones `renderGaleria`/`moverImagenSubida`/`moverFotoStaged`,
  1483-1699) + `js/cloudinary.js` (`subirImagenProducto`, `eliminarImagenProducto`,
  `reordenarImagenProducto`, `recortarImagenProducto`).
- **Endpoints:** `POST /productos/{id}/cloudinary/firma` (firma) + `POST
  /productos/{id}/imagenes` (agregar, `ImagenProductoRequestDTO`) + `DELETE
  /productos/{id}/imagenes/{imagenId}` (eliminar) + `PATCH
  /productos/{id}/imagenes/{imagenId}/orden` (reordenar, `OrdenImagenRequestDTO`) + `POST
  /productos/{id}/imagenes/{imagenId}/recorte/firma` (firma de recorte) + `PATCH
  /productos/{id}/imagenes/{imagenId}/url` (actualizar URL tras recorte, `UrlImagenRequestDTO`).
- **DTOs:** `ImagenProductoRequestDTO` (`url`, `orden`, `esPrincipal`), `OrdenImagenRequestDTO`
  (`orden`), `UrlImagenRequestDTO` (`url`). Los 3 son puramente técnicos — ningún campo
  tipeado a mano, mismo criterio ya documentado para las variantes de Cliente/registro.
  Límite de 5 imágenes por producto (`MAX_IMAGENES_POR_PRODUCTO`, tanto en
  `js/cloudinary.js:5` como en `ProductoService.java:62`, `409` real al intentar la 6ª —
  confirmado por Postman, carpeta `04 - Productos`).

### 10. Rechazo de pedido

- **Pantalla:** `comercio-pedido-detalle.html` — el modal se inyecta dinámicamente desde JS
  (`mostrarModalRechazarPedido`, `js/comercio.js:528-603`), invocado desde
  `renderAccionesPendiente` (605-651), que a su vez solo se renderiza en
  `renderPedidoDetalleComercio` — confirma que el modal vive en la pantalla de detalle, no en
  el listado `comercio-pedidos.html` (que solo lista tarjetas, sin acciones de
  aceptar/rechazar inline).
- **Endpoint:** `PUT /api/v1/pedidos/comercio/{id}/rechazar`.
- **DTO:** `RechazoPedidoRequestDTO` (`motivo` enum `MotivoRechazo`, 7 valores — confirmados
  1 a 1 contra el frontend: `SIN_STOCK`, `CERRADO`, `ALTO_VOLUMEN_PEDIDOS`,
  `PRODUCTO_NO_DISPONIBLE_TEMPORAL`, `SIN_DELIVERY_DISPONIBLE`, `PROBLEMA_TECNICO`, `OTRO`;
  `comentario`, texto libre con obligatoriedad condicional cuando `motivo=OTRO`). Ya resuelto
  en ambas capas desde el tramo del 2026-09-02 (`docs/DECISIONES.md`) — confirmado vigente
  hoy, sin re-auditar campo por campo salvo la constatación de valores límite (Parte 4).

### 11. Aceptar pedido

- **Pantalla:** `comercio-pedido-detalle.html`, mismo bloque `renderAccionesPendiente`.
- **Endpoint:** `PUT /api/v1/pedidos/comercio/{id}/aceptar`. Sin body — no es un formulario,
  un botón simple. Se menciona por completitud del flujo de "pedidos recibidos", sin fila en
  la Parte 2.

### 12. Búsqueda de productos propios (listado)

- **Pantalla:** `comercio-productos.html`, input `buscar-producto-input`.
- **JS:** `js/comercio.js:1382-1385`.
- **Hallazgo:** es un input de texto real que el Comercio tipea, **pero es 100% client-side**
  — filtra el array `productos` ya traído por `GET /productos` (sin `@RequestParam`, sin
  ningún endpoint de búsqueda del lado del backend, sin debounce, sin `maxlength`). No hay
  DTO ni validación de ningún tipo porque nunca viaja al backend como parámetro de búsqueda.
  Se incluye en el inventario por ser un campo real de input de usuario, con la salvedad de
  que no aplica ninguna fila de "Backend" en la Parte 2 (no existe ese lado).

### 13. Filtros de pedidos y productos (chips)

- **Pantallas:** `comercio-pedidos.html` (`FILTROS_PEDIDOS`, filtro por estado) y
  `comercio-productos.html` (chips Todos/Disponibles/Agotados/Descontinuados).
- Confirmado por lectura de `initComercioPedidos` (444-505) e `initComercioProductos`
  (1262-1392): ambos son filtros 100% client-side sobre el array ya cargado, sin
  `@RequestParam` ni query al backend — mismo patrón que el punto 12. No son formularios de
  texto, son chips/botones, sin campo que audite la Parte 2.

### 14. Aprobación/rechazo de Comercio por el Administrador — mención, no auditoría propia

`AprobacionComercioRequestDTO` (`aprobar` + `motivo`) es una acción que el **Administrador**
ejecuta sobre un Comercio (`admin-comercios-pendientes.html`/`admin-comercio-detalle.html`,
`js/admin.js`), no un formulario que el propio Comercio complete — se incluye en la lista de
DTOs de partida del prompt, pero corresponde al inventario del rol Administrador, no al de
este documento. Ya está relevado en `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` punto 6, sin
cambios detectados en esta pasada — no se re-audita acá.

### Formularios/flujos confirmados como INEXISTENTES

- **Edición de horarios ya cargados** (fuera del wizard de registro): confirmado, no existe.
  `grep` de "horario"/"Horario" sobre `frontend/*.html` fuera de `registro-comercio.html`
  solo devuelve lecturas de solo-mostrar (`comercio-dashboard.html` para calcular
  abierto/cerrado, `js/catalogo.js`/`js/checkout.js` para el catálogo público) — sin ningún
  formulario de edición. `HorarioRepository`/`HorarioService` no existen como tal; el único
  punto de escritura es `RegistroService.guardarHorarios`, exclusivo del alta.
- **Edición de Redes Sociales fuera del wizard de registro: ESTO ES UN HALLAZGO REAL, no una
  confirmación de ausencia** — ver Parte 3, punto 1. Existe un backend completo
  (`RedSocialController`, `GET`/`POST`/`PUT`/`DELETE /api/v1/comercios/redes-sociales`) que
  ningún archivo de `frontend/` invoca fuera del payload de registro.
- **Empleado / Soporte:** confirmado sin pantalla implementada. `grep` de "empleado" (case
  insensitive) sobre `frontend/*.html` no devuelve ningún archivo; `grep` de "soporte"/
  "reclamo" tampoco. Coincide con `CLAUDE.md` §1bis (ambos en la lista de tramos nuevos sin
  implementar).
- **Vinculación de MercadoPago:** confirmado sin ningún rastro en el código, ni siquiera un
  botón placeholder. `grep -rli "mercadopago"` sobre `frontend/` y
  `backend/src/main/java` no devuelve ningún archivo. Coincide con `CLAUDE.md` §1bis
  (`CuentaMercadoPago`/`ConfiguracionTarifa`/`Pago` en la lista de tramos nuevos sin
  implementar) y con el hecho de que `Comercio.java` (entidad JPA real) no tiene la columna
  `mp_vinculado` que sí describe `docs/diccionario-de-datos.md:679` (modelo completo v1.5,
  todavía no portado a este tramo).
- **Suspensión de Comercio por Administrador / cierre manual del propio Comercio
  (`cerrado_manualmente`):** sin rastro en código — ninguno de los dos campos/acciones existe
  todavía (`Comercio.java` no tiene columna `cerrado_manualmente`). Consistente con
  `CLAUDE.md` §1bis.

---

## Parte 2 — Tabla campo por campo por formulario

Formato: `Campo | Backend | Frontend | Alineación`, mismo criterio que
`docs/AUDITORIA-EXHAUSTIVA-CLIENTE.md`. Cobertura de test relevada contra
`postman/Bajonea-MVP.postman_collection.json` (223 → 410 requests tras el tramo de matriz de
Cliente del 2026-09-03, folders `00` a `32`) y `testing/playwright/tests/*.spec.ts` (12
specs).

### 1. Wizard de registro — Paso "1. Negocio"

| Campo | Backend | Frontend | Alineación |
|---|---|---|---|
| `nombre` | `@NotBlank("El nombre del comercio es obligatorio")` + `@Pattern(".*[\p{L}0-9].*", "Ingresá un nombre de comercio válido")` + `@Size(max=150)` sin mensaje. Persistido vía `TextoUtils.aTitleCase(...)` (`RegistroService.java:164`). | `esTextoConContenidoValido` con `validarCampoRequeridoYValido` — separa vacío ("El nombre del comercio es obligatorio") de formato ("Ingresá un nombre de comercio válido.") (`auth.js:731`). `maxlength="150"`. | **Alineado**, mensajes separados en ambas capas. |
| `descripcion` (opcional) | `@Size(max=2000)` sin mensaje. | Sin validación JS (correcto, opcional). `maxlength="2000"` (`registro-comercio.html:57`), coincide exacto con el backend. | Sin divergencia funcional — falta mensaje en español del `@Size` (ya señalado como pendiente para varios DTOs en `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md`, nunca alcanzable en la práctica por el `maxlength` del HTML). |
| `telefono` | `@NotBlank("El teléfono de contacto es obligatorio")` + `@ValidarTelefonoArgentino` (prefijo fijo `+549` + 10 dígitos) + `@Size(max=30)`. | `esTelefonoValido` con `validarCampoRequeridoYValido`, mensajes separados (`auth.js:732`). Bloqueo de teclado a solo dígitos + tope 10 (`auth.js:713-715`). Sin `maxlength` HTML (el tope real lo impone el JS). | **Alineado.** |
| `emailContacto` | `@NotBlank("El email de contacto es obligatorio")` + `@Email("Ingresá un email de contacto con formato válido")` (Hibernate, blanco-tolerante) + `@Size(max=150)`. | `esEmailValido` con `validarCampoRequeridoYValido`, mensajes separados (`auth.js:733`, `716`). Sin `maxlength` HTML. | **Alineado** en la regla; nota menor: backend usa `@Email` (Hibernate) mientras que la edición de perfil (`ComercioPerfilRequestDTO`) usa `@ValidarFormatoEmail` (custom) para el mismo campo lógico — dos anotaciones distintas para la misma regla en dos DTOs del mismo dominio, resultado equivalente pero inconsistencia de estilo. |
| `tipoComercio` | `@NotNull("Seleccioná el tipo de comercio")`, enum `TipoComercio` (12 valores). | `<select>` poblado por `poblarSelect`, chequeo `validarCamposSilencioso` con mensaje "Seleccioná el tipo de comercio." (`auth.js:693-694`, `741`). | **Alineado**, sin validación de formato posible (enum cerrado). |
| `aceptaDelivery` / `aceptaRetiro` | Sin anotación de Bean Validation individual (son `boolean` primitivos) — regla "al menos una" aplicada en `RegistroService.registrarComercio` vía `ComercioValidaciones.validarModalidadesEntrega(...)` (línea 128), mensaje "El comercio debe ofrecer al menos una modalidad de entrega (delivery o retiro)". | JS chequea manualmente ambos switches antes de avanzar de paso, mensaje "Debés ofrecer al menos una modalidad de entrega." (`auth.js:754-758`). | **Alineado** — regla de negocio presente en ambas capas. |
| `fotoPerfilUrl` | `@NotBlank("Agregá una foto de perfil de tu comercio")` + `@ValidarUrlCloudinary` + `@Size(max=500)`. **Obligatorio**, a diferencia de Cliente (opcional). | Flujo de Cloudinary con recorte 1:1, chequeo manual `if (!fotoComercioStaged)` antes de avanzar, mensaje "Agregá una foto de perfil de tu comercio" (`auth.js:748-752`). No aplica "formato inválido" desde la UI. | **Alineado.** |
| `direccion.*` (calle/número/pisoDepto/codigoPostal/provincia/localidad) | Mismas anotaciones de `DireccionRequestDTO` ya auditadas en `docs/AUDITORIA-EXHAUSTIVA-CLIENTE.md` Parte 2, punto 1 (`calle`: `@NotBlank`+`@Pattern`+`@Size(max=150)`; `numero`: `@NotBlank`+`@Size(max=10)`+`@Pattern("^\d+$")`; `pisoDepto`: opcional, `@Size(max=30)`+`@Pattern` blanco-tolerante; `codigoPostal`: `@NotBlank`+`@ValidarCodigoPostalArgentino`; `localidadId`: `@NotBlank`+`@Size(max=15)`). | Mismos validadores JS que Cliente (`esCalleValida`, `esNumeroDireccionValido`, `esTextoConContenidoValido`, `esCodigoPostalValido`), mismo patrón de mensajes separados (`auth.js:717-737`). Único campo con `maxlength` explícito distinto: ninguno de los 5 tiene `maxlength` HTML propio (mismo patrón "sin maxlength, solo backend + bloqueo de teclado" que Cliente). | **Alineado**, idéntico a Cliente — es literalmente el mismo `DireccionRequestDTO` reusado. |

### 2. Wizard de registro — Paso "2. Legales"

| Campo | Backend | Frontend | Alineación |
|---|---|---|---|
| `razonSocial` | `@NotBlank("La razón social es obligatoria")` + `@Pattern(".*[\p{L}0-9].*", "La razón social no puede contener solo caracteres especiales")` + `@Size(max=150)`. Persistido con `TextoUtils.aTitleCase(...)`. | `esTextoConContenidoValido` con `validarCampoRequeridoYValido`, mensajes separados (`auth.js:778`, `810`). `maxlength="150"`. | **Alineado.** |
| `cuit` | `@NotBlank("El CUIT es obligatorio")` + `@ValidarCuit("El CUIT debe tener 11 dígitos numéricos")`. Setter propio sanitiza a solo dígitos (`RegistroComercioRequestDTO.java:187-189`), **sin setter público** (`@Setter(AccessLevel.NONE)` a nivel de campo, solo el setter manual). | `esCuitValido` (dígito verificador módulo 11 completo, no solo longitud) con `validarCampoRequeridoYValido`, mensajes separados. Bloqueo de teclado a solo dígitos + tope 11 (`auth.js:779-783`). `maxlength="11"` HTML. | **Alineado**, incluye el algoritmo completo de dígito verificador AFIP en ambas capas (no solo longitud). |
| `condicionIva` | `@NotNull("Seleccioná la condición ante el IVA")`, enum `CondicionIva` (5 valores). | `<select>`, chequeo con mensaje "Seleccioná la condición ante el IVA." (`auth.js:814`). | **Alineado.** |
| `tipoSociedad` | `@NotNull("Seleccioná el tipo de sociedad")`, enum `TipoPersonaJuridica` (18 valores). | `<select>`, mensaje "Seleccioná el tipo de sociedad." (`auth.js:814`). | **Alineado.** |
| `domicilioFiscal` | `@NotBlank("El domicilio fiscal es obligatorio")` + `@Pattern(".*[\p{L}0-9].*", "El domicilio fiscal no puede contener solo caracteres especiales")` + `@Size(max=255)`. | `esTextoConContenidoValido` con mensajes separados (`auth.js:785`, `817`). `maxlength="255"`. | **Alineado.** |
| `fechaInicioActividades` | `@NotNull("La fecha de inicio de actividades es obligatoria")` + `@PastOrPresent("La fecha ingresada no es válida")` — sin piso de antigüedad mínima. | `esFechaNoFuturaValida` con mensaje "La fecha ingresada no es válida" (`auth.js:784`, `812`). Input `type="date"`. | **Alineado.** |
| `nombreRepresentante` | `@NotBlank("El nombre es obligatorio")` + `@ValidarFormatoNombre("El nombre solo puede contener letras")` + `@Size(max=100)`. Setter propio con `trim()` + colapso de espacios (`normalizarEspacios`, líneas 195-197, 207-212), **sin setter público** (`@Setter(AccessLevel.NONE)`). | `esNombreClienteValido` (mismo charset acotado que el registro de Cliente — A-Z + vocales acentuadas + Ñ + guion/apóstrofe/espacio) con mensajes separados (`auth.js:786`, `818`). `maxlength="100"`. | **Alineado.** |
| `apellidoRepresentante` | Igual patrón que `nombreRepresentante`, mensaje "El apellido solo puede contener letras". | Igual patrón (`auth.js:787`, `819`). `maxlength="100"`. | **Alineado.** |
| `dniRepresentante` | `@NotBlank("El DNI es obligatorio")` + `@ValidarFormatoDni` (mensaje default "El DNI debe tener un formato válido") — regex `^\d{7,8}$` tras sanitizar `[.\-\s]`. Setter propio (líneas 203-205), sin setter público. | `esDniClienteValido` (mismo regex tras `sanitizarDni`), mensajes separados (`auth.js:792`, `820`). Bloqueo de teclado a solo dígitos + tope 8 (`auth.js:789-791`). `maxlength="8"` HTML. | **Alineado.** |
| `telefonoRepresentante` | `@NotBlank("El teléfono es obligatorio")` + `@ValidarTelefonoArgentino` + `@Size(max=30)` — mismo validador que `telefono` del comercio (campo distinto, misma regla). | `esTelefonoValido`, mensajes separados (`auth.js:804`, `822`). Bloqueo de teclado + tope 10 (`auth.js:800-803`). | **Alineado.** |
| `fechaNacimientoRepresentante` | `@NotNull("La fecha de nacimiento es obligatoria")` + `@Past("La fecha ingresada no es válida")` + `@MayorDeEdad` (18 años) — **única fecha de nacimiento del proyecto que retiene el piso de edad mínima** tras la enmienda del 2026-09-01 que se lo quitó a `RegistroClienteRequestDTO.fechaNacimiento` (decisión de negocio explícita, documentada en el Javadoc del DTO, líneas 54-58). | `validarFechaNacimientoRepresentante` (función dedicada, no reutiliza directamente `esFechaNacimientoValida` de `validators.js` sino que se invoca vía import específico de `auth.js` — confirma la misma regla de 18 años del lado cliente). | **Alineado**, incluye el piso de edad en ambas capas, consistente con la decisión documentada de mantenerlo solo acá. |
| `email` (credencial de login) | `@NotBlank("El email es obligatorio")` + `@ValidarFormatoEmail` + `@Size(max=254)`. Setter propio `trim().toLowerCase()` (líneas 191-193), sin setter público. | `esEmailValido`, mensajes separados (`auth.js:805`, `823`). `maxlength="254"`. | **Alineado.** |
| `password` | `@NotBlank("La contraseña es obligatoria")` + `@ValidarPasswordSegura` + `@Size(max=72, message="La contraseña no puede superar los 72 caracteres")` — **este `@Size` explícito y redundante sigue presente**, a diferencia de `RegistroClienteRequestDTO.password` (removido el 2026-09-03, ver Parte 3 punto 3). | `esPasswordSegura` (8-72, mayúscula+minúscula+número), mensaje "Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número" (`auth.js:834-835`, ya menciona minúscula). Input `minlength="8"`, sin `maxlength`. | Alineado en la regla; **ver Parte 3 punto 3 para el bug real de mensaje no determinístico en el caso límite de 73+ caracteres**, todavía sin corregir en este DTO. |
| `confirmarPassword` (solo frontend) | No aplica — nunca viaja al backend. | `!==` contra `password`, mensajes "Debes confirmar la contraseña" (vacío) / "Las contraseñas no coinciden" (`auth.js:840-849`). | Correcto tal cual. |

### 3. Wizard de registro — Paso "3. Horarios"

| Campo | Backend | Frontend | Alineación |
|---|---|---|---|
| `horarios` (lista completa) | `@NotEmpty("No debe estar vacío")` + `@Valid` sobre `List<HorarioRequestDTO>` (`RegistroComercioRequestDTO.java:146-148`). | Chequeo manual: lista vacía → "Cargá al menos una franja horaria de atención." (`auth.js:1091-1095`). | **Alineado.** |
| `horarios[].diaSemana` | `@NotNull`, enum `DiaSemana` (7 valores) (`HorarioRequestDTO.java:17-18`). | `<select>` poblado por `poblarSelect`; fila "parcial" (algún campo cargado pero no todos) rechazada con "Completá el día y el horario de todas las franjas cargadas." (`auth.js:1083-1089`). | **Alineado.** |
| `horarios[].horaApertura` / `horaCierre` | `@NotNull` cada uno (`HorarioRequestDTO.java:20-24`). Regla de negocio en `RegistroService.validarHorarios` (líneas 217-239): `horaCierre` debe ser posterior a `horaApertura` (`!isAfter` → 400 "La hora de cierre debe ser posterior a la hora de apertura") + **detección de superposición por pares dentro del mismo día** (mensaje con detalle: `"Ya tenés un horario cargado el %s de %s a %s, que se superpone con este"`, día/horas del conflicto interpolados). | Inputs `type="time"`. JS replica ambas reglas exactamente: `horaCierre <= horaApertura` → mismo mensaje de cierre posterior a apertura (`auth.js:910-914`, `1097-1101`); `buscarConflictoEntreFilas`/bucle O(n²) sobre pares completos → mismo mensaje de superposición interpolado vía `mensajeConflictoHorario` (`auth.js:886-898`, `916-920`, `1103-1111`). | **Alineado** — la lógica de superposición está duplicada byte a byte en intención entre `RegistroService.java` y `auth.js`, ambas O(n²) sobre pares del mismo día. |
| Bloque "franja rápida" (`franja-rapida-desde`/`hasta` + chips de día) | No es un campo propio del DTO — es azúcar sintáctico de UI que termina generando N filas de `horarios[]` normales al aplicar. | Mismas 2 validaciones (día tildado + horario completo + cierre>apertura + sin superposición contra lo ya cargado) aplicadas antes de expandir a filas individuales (`auth.js:1040-1075`). | N/A — no tiene contraparte de backend porque nunca es su propia estructura de datos, se aplana a `horarios[]` antes de construir el payload. |

### 4. Wizard de registro — Paso "4. Redes sociales"

| Campo | Backend | Frontend | Alineación |
|---|---|---|---|
| `redesSociales` (lista completa) | `@NotEmpty("Debés cargar al menos una red social")` + `@Size(max=5, message="No podés cargar más de 5 redes sociales")` + `@Valid` (`RegistroComercioRequestDTO.java:182-185`). Regla adicional de negocio en `RegistroService.validarRedesSociales` (líneas 189-194): tipos duplicados → 400 "No podés cargar dos redes sociales del mismo tipo". | Chequeo manual: lista vacía → "Cargá al menos una red social." (`auth.js:1179-1183`); botón "Agregar" se oculta al llegar a 5 (`actualizarLimiteRedesSociales`, `auth.js:1121-1125`); tipos duplicados → "No podés cargar dos redes sociales del mismo tipo. Eliminá la que se repite." (`auth.js:1201-1206`). | **Alineado en los 3 aspectos** (mínimo, máximo, sin duplicados) — la validación de duplicados existe en ambas capas con el mismo criterio, no solo en el backend. |
| `redesSociales[].tipo` | `@NotNull("Seleccioná el tipo de red social")`, enum `TipoRedSocial` (7 valores: `INSTAGRAM`, `FACEBOOK`, `TIKTOK`, `WHATSAPP`, `X`, `SITIO_WEB`, `OTRO`). | `<select>` poblado por `poblarSelect`; fila sin tipo → "Seleccioná el tipo de cada red social cargada." (`auth.js:1186-1190`). | **Alineado.** |
| `redesSociales[].url` | `@NotBlank("El link es obligatorio")` + `@Pattern("^(?=.*\p{L})(?=.*\.)\S+$", "Ingresá un link válido")` + `@Size(max=500)`. Setter propio normaliza esquema (`TextoUtils.normalizarUrlConEsquema`, antepone `https://` si falta) — **sin setter público** (`@Setter(AccessLevel.NONE)`, `RedSocialRequestDTO.java:27-32`). | `esUrlRedSocialValida` (mismo regex: al menos 1 letra + 1 punto + sin espacios) + `normalizarUrlRedSocial` (mismo criterio de anteponer `https://`), mensajes separados: vacío → "El link es obligatorio en cada red social cargada." / formato → "Ingresá un link válido para cada red social cargada." (`auth.js:1191-1200`). | **Alineado**, incluyendo la normalización de esquema idéntica en ambas capas. |

### 5. Edición de perfil de Comercio — `ComercioPerfilRequestDTO`

| Campo | Backend | Frontend | Alineación |
|---|---|---|---|
| `nombre` | `@NotBlank("No debe estar vacío")` + `@Pattern(".*[\p{L}0-9].*", "Ingresá un nombre de comercio válido")` + `@Size(max=150)` sin mensaje. | `esTextoConContenidoValido` con `validarCamposRequeridosSilencioso` — **YA separa vacío ("Ingresá el nombre de tu comercio.") de formato ("El nombre no puede contener solo caracteres especiales.")** (`comercio.js:956`). | **Alineado — contradice `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` punto 2**, que afirmaba "un único mensaje" para este campo (ver Parte 3, punto 4). `maxlength="150"`. |
| `descripcion` (opcional) | `@Size(max=2000, message="La descripción no puede superar los 2000 caracteres.")` — **YA tiene mensaje en español**, a diferencia de lo que registraba `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` (que decía "sin mensaje", mismo criterio que `ProductoRequestDTO.descripcion`). | Sin validación JS (correcto, opcional). `maxlength="2000"`, coincide. | Sin divergencia — mensaje ya en español desde el lado del backend (ver Parte 3, punto 5). |
| `telefono` | `@NotBlank("No debe estar vacío")` + `@ValidarTelefonoArgentino` + `@Size(max=30)` sin mensaje. | `esTelefonoValido` con mensajes separados: "Ingresá tu teléfono." / "Ingresá un teléfono argentino válido (código de área + número)." (`comercio.js:957`). Bloqueo de teclado + tope 10 (`comercio.js:887-890`). | **Alineado — misma corrección real que `nombre`**, contradice la auditoría previa. |
| `emailContacto` | `@NotBlank("No debe estar vacío")` + **`@ValidarFormatoEmail(message="Ingresá un email de contacto con formato válido")`** — ya NO es la combinación redundante `@Email`+`@Pattern` que documentaba `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` punto 2 (`ComercioPerfilRequestDTO.java:44-47`). | `esEmailValido` con mensajes separados: "El email de contacto es obligatorio." / "Ingresá un email de contacto con formato válido." (`comercio.js:958`). | **Alineado — la recomendación de "reusar con adaptación" de la auditoría previa (usar `@ValidarFormatoEmail` en vez de `@Email`+`@Pattern`) ya está aplicada en el código actual** (ver Parte 3, punto 6). |
| `aceptaDelivery` / `aceptaRetiro` | **YA validado**: `ComercioService.editarPerfil` invoca `ComercioValidaciones.validarModalidadesEntrega(request.isAceptaDelivery(), request.isAceptaRetiro())` como primera línea del método (`ComercioService.java:53-54`), mismo mensaje que en el registro ("El comercio debe ofrecer al menos una modalidad de entrega (delivery o retiro)"). | JS chequea manualmente ambos switches, mensaje "Debés ofrecer al menos una modalidad de entrega." (`comercio.js:964-968`). | **Alineado — GAP DE BACKEND YA CERRADO.** `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` punto 2 documentaba esto como "gap real de backend, no de mensajes" (sin validación en `editarPerfil`). El código actual demuestra lo contrario — ver Parte 3, punto 7 (hallazgo más relevante de todo este documento). |

### 6. Cambio de contraseña desde perfil de Comercio — `CambioPasswordPerfilRequestDTO`

| Campo | Backend | Frontend | Alineación |
|---|---|---|---|
| `passwordActual` | `@NotBlank("No debe estar vacío")`, sin regla de formato. | Chequeo de solo vacío: "Ingresá tu contraseña actual." (`comercio.js:1031`). `401` del backend → "La contraseña actual no es correcta." + aviso de intentos restantes (`comercio.js:1066-1073`). | Alineado. |
| `passwordNueva` | `@NotBlank` + `@ValidarPasswordSegura` — sin `@Size(max=72)` propio (mismo caso que Cliente, ver `docs/AUDITORIA-EXHAUSTIVA-CLIENTE.md` Parte 3 punto 4). | Vacío: "Ingresá una nueva contraseña." Formato: `esPasswordSegura(...)`, mensaje **"Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número."** (`comercio.js:1039-1040`) — ya incluye "minúscula", texto idéntico palabra por palabra al de `cliente.js:305` (confirma la corrección del 2026-09-01/02 se aplicó también acá, ver Parte 3 punto 2). | **Alineado**, sin ninguna divergencia de mensaje pendiente. |
| `passwordConfirmar` (solo frontend) | No aplica. | `!==` contra `passwordNueva`, "Las contraseñas ingresadas no coinciden." (`comercio.js:1045-1046`). | Correcto. |

Comportamiento adicional confirmado (idéntico a Cliente): al cambiar la contraseña con éxito,
`clearSesion()` + redirect a `login.html?passwordActualizada=1` (`comercio.js:1061-1063`).

### 7. CRUD de productos — `ProductoRequestDTO`

| Campo | Backend | Frontend | Alineación |
|---|---|---|---|
| `nombre` | `@NotBlank("No debe estar vacío")` + `@Pattern("^[\p{L}0-9][\p{L}0-9 ]*$", "Ingresá un nombre de producto válido (letras, números y espacios)")` + `@Size(max=150)` sin mensaje. Normalizado a Title Case en el `blur` del input, no en el backend (`comercio.js:1423-1427`, `TextoUtils` no se invoca acá del lado servidor para `Producto.nombre`). | `esNombreProductoValido` con `validarCamposRequeridosSilencioso`, mensajes separados: "El nombre del producto es obligatorio." / "Ingresá un nombre válido (letras, números y espacios, sin símbolos)." (`comercio.js:1707`). `maxlength="150"`. | **Alineado** — ya resuelto en el tramo del 2026-09-02 (`docs/AUDITORIA-FORMULARIOS-PENDIENTES.md`), confirmado vigente. |
| `descripcion` (opcional) | `@Size(max=2000)` **sin mensaje** — confirmado que sigue siendo el único de los DTOs de Comercio auditados en este documento sin mensaje en español para este `@Size` puntual (a diferencia de `ComercioPerfilRequestDTO.descripcion`, que ya lo tiene). | Sin validación JS (correcto, opcional). `maxlength="2000"` (`comercio-producto-form.html:30`), coincide con el backend. | Sin divergencia funcional — mismo gap cosmético ya señalado en `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` Parte 3, no cerrado en este tramo (**campo no cubierto por esa auditoría, confirmado ahora por primera vez**). |
| `precio` | `@NotNull("No debe estar vacío")` + `@Positive("El precio debe ser mayor a $0")` + `@Digits(integer=8, fraction=0, message="El precio no puede tener más de 8 dígitos y no admite centavos")` — `BigDecimal`, sin decimales reales admitidos pese al tipo. | `esPrecioValido` (1-8 dígitos tras sanitizar) + chequeo manual de `precio <= 0`, 3 mensajes separados: vacío "El precio es obligatorio.", formato "El precio no puede tener más de 8 dígitos.", rango "El precio debe ser mayor a $0." (`comercio.js:1715-1730`). Input bloqueado a solo dígitos, reformateado en vivo con separador de miles (`formatearMilesInput`/`precioDesdeInput`, `comercio.js:102-114`, `1429-1433`). `maxlength="10"` HTML (deliberadamente mayor a 8 dígitos reales para dejar espacio a los puntos de miles insertados en vivo). | **Alineado**, ya resuelto en el tramo del 2026-09-02. |
| `categoriaId` | `@NotNull` sin mensaje (`ProductoRequestDTO.java:43-44`). | `<select>` poblado con `GET /categorias` filtrado a `activo=true`, chequeo `validarCamposSilencioso` con mensaje "Seleccioná una categoría." (`comercio.js:1709`). | **Alineado.** |
| `tagIds` (opcional, lista) | `@Size(max=5, message="No podés seleccionar más de 5 tags")` — sin `@NotNull`/`@NotEmpty` (lista vacía es válida, un producto puede no tener tags). | Chips seleccionables poblados con `GET /tags` filtrado a `activo=true`; tope de 5 aplicado en el propio handler de click del chip, **antes** de que el usuario pueda seleccionar un 6°, mensaje "Podés seleccionar hasta 5 tags." (`comercio.js:1464-1467`) — mensaje ligeramente distinto en texto al del backend ("No podés seleccionar más de 5 tags") pero equivalente en sentido. Sin límite de longitud aplicable (es una lista de ids, no texto). | **Alineado en la regla**, con una diferencia cosmética de redacción entre el mensaje backend y el mensaje frontend (**campo no cubierto por la auditoría previa, confirmado ahora por primera vez**) — no es un bug, ambos comunican el mismo límite de 5. |

### 8. Cambio de estado de producto — `CambioEstadoProductoRequestDTO`

| Campo | Backend | Frontend | Alineación |
|---|---|---|---|
| `estado` | `@NotNull("El estado es obligatorio")`, enum `EstadoProducto` (`DISPONIBLE`, `AGOTADO`, `DESCONTINUADO`). Máquina de estados real en `ProductoService.TRANSICIONES_VALIDAS` (`ProductoService.java:57-60`): `DISPONIBLE↔AGOTADO`, ambos → `DESCONTINUADO` (terminal, sin transición de salida) — violación → `409` "No se puede pasar de X a Y". | No es un campo de formulario — 3 acciones de un modal (`mostrarModalAccionProducto`) más el link dedicado "Descontinuar producto" del formulario de edición. Sin forma estructural de enviar un valor fuera del enum. | **Alineado** — el frontend nunca ofrece una transición inválida (ej. no muestra "Descontinuar" si ya está descontinuado, oculta el formulario entero en ese caso — `comercio.js:1627-1631`), la máquina de estados real vive solo en el backend. |

### 9. Gestión de imágenes de producto

| Campo | Backend | Frontend | Alineación |
|---|---|---|---|
| `ImagenProductoRequestDTO.url` | `@NotBlank("No debe estar vacío")` + `@ValidarUrlCloudinary` + `@Pattern("(?i).*\.(jpg\|jpeg\|png\|webp)$", "La URL debe apuntar a un archivo jpg, jpeg, png o webp")`. | Nunca tipeada — sale de `uploadData.secure_url` tras `subirArchivoConFirma`. Validación de archivo previa (`validarArchivoImagen`): MIME en `{image/jpeg, image/png, image/webp}`, tamaño ≤ 5 MB (`js/cloudinary.js:9-17`). | **Alineado**, mismo patrón que la foto de perfil de Usuario ya documentado para Cliente. |
| `ImagenProductoRequestDTO.orden` | `@NotNull("El orden es obligatorio")` + `@PositiveOrZero("El orden debe ser un valor positivo")`. | Calculado automáticamente por posición (`orden: imagenes.length` al agregar), nunca tipeado. Drag-and-drop reordena y dispara `PATCH .../orden` con el índice de destino (`comercio.js:1522-1539`). | **Alineado**, sin input directo — estructuralmente siempre `≥0`. |
| `ImagenProductoRequestDTO.esPrincipal` | `boolean` primitivo, sin anotación posible. Primera imagen subida se marca `esPrincipal` automáticamente si `existentes==0` (`ProductoService.java:284`, lado backend) — el frontend también lo calcula (`esPrincipal: imagenes.length === 0`, `comercio.js:1686`), doble cálculo del mismo criterio en ambas capas. | Igual. | **Alineado**, redundante mas no contradictorio — ambos lados llegan al mismo resultado por el mismo criterio ("si es la primera, es la principal"). |
| `OrdenImagenRequestDTO.orden` | `@NotNull` + `@PositiveOrZero`, igual que arriba. | Igual, generado por drag-and-drop. | **Alineado.** |
| `UrlImagenRequestDTO.url` | `@NotBlank` + `@ValidarUrlCloudinary` — **sin el `@Pattern` de extensión de archivo** que sí tiene `ImagenProductoRequestDTO.url` (`UrlImagenRequestDTO.java:14-19` vs. `ImagenProductoRequestDTO.java:19-23`) — usado exclusivamente por el flujo de recorte (`PATCH .../imagenes/{id}/url`), donde la imagen ya fue subida a Cloudinary como JPEG por el editor de recorte (`recortarImagenProducto`, siempre genera `image/jpeg`), así que el `@Pattern` de extensión sería redundante en este flujo puntual — no es un descuido, es un DTO deliberadamente más laxo para un caso de uso más acotado. | No tipeada — sale de la respuesta de Cloudinary tras el recorte (`js/crop.js` + `subirArchivoConFirma`). | **Alineado**, diferencia de estrictez entre `ImagenProductoRequestDTO`/`UrlImagenRequestDTO` es intencional y coherente con su caso de uso distinto, no una inconsistencia real. |

### 10. Rechazo de pedido — `RechazoPedidoRequestDTO`

| Campo | Backend | Frontend | Alineación |
|---|---|---|---|
| `motivo` | `@NotNull` sobre `MotivoRechazo` (enum cerrado, 7 valores). | `<select required>`, chequeo `if (!motivo)` → "Seleccioná un motivo de rechazo." (`comercio.js:587-589`). | **Alineado**, sin novedad respecto a `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md`. |
| `comentario` | `@Size(max=500)` + obligatoriedad condicional en `PedidoService.rechazarPedido` cuando `motivo=OTRO` (regla sumada el 2026-09-02). | Label dinámico ("Comentario (opcional)" / "Comentario" según `motivo`), error propio cuando `motivo=OTRO` y el campo queda vacío tras `trim()`: "Ingresá un comentario para especificar el motivo del rechazo." (`comercio.js:573-576`, `593-598`). `maxlength="500"` HTML, coincide con el backend. | **Alineado**, confirmado vigente. |

---

## Parte 3 — Discrepancias contra documentación previa

Listado de todo lo que no coincide entre `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` (y en
menor medida `docs/diccionario-de-datos.md`/`docs/DECISIONES.md`) y el estado real del código
a esta fecha. Nada de esto se corrigió.

### 1. Existe un CRUD backend completo de RedSocial (GET/POST/PUT/DELETE) que ningún archivo de `frontend/` invoca fuera del registro — hallazgo más relevante de este documento junto con el punto 7

`backend/src/main/java/com/bajonea/backend/controllers/RedSocialController.java` expone
`@RequestMapping("/api/v1/comercios/redes-sociales")` con los 4 verbos completos: `GET`
(listar activas), `POST` (agregar, con reglas de negocio reales: tope de 5 activas, tipo ya
activo → `409`, reactivación de un tipo dado de baja), `PUT /{id}` (editar url), `DELETE /{id}`
(baja lógica, `fecha_baja`). `RedSocialService.java` tiene las 5 reglas de negocio completas
implementadas y probadas (confirmado en Postman, carpeta `21 - Redes Sociales`, 17 requests
incluyendo tenant isolation, reactivación de tipo dado de baja, y 4 negativos de formato de
`url`). **Ningún archivo de `frontend/*.html` ni `frontend/js/*.js` llama a este endpoint
fuera de la carga inicial dentro de `POST /auth/registro/comercio`** — confirmado por `grep`
de "redes-sociales" sobre `frontend/js/*.js` y `frontend/*.html`, único resultado real fuera
de `js/auth.js`/`js/validators.js` (que solo arman el payload de registro) son las 2 líneas
estáticas de `registro-comercio.html`. `ComercioResponseDTO` (perfil propio del Comercio,
`GET /comercios/perfil`) tampoco incluye `redesSociales` en su lista de campos (confirmado
leyendo el DTO completo) — ni siquiera hay forma de **ver** las redes sociales cargadas desde
`comercio-perfil.html`, mucho menos editarlas. Esto es distinto de "Horario", que si bien
tampoco tiene edición, sí se **muestra** de solo lectura en varios lugares (`ComercioResponseDTO.horarios`,
poblado en 3 sitios según `CLAUDE.md` §6 Tramo 16a) — RedSocial no tiene ni siquiera esa
lectura de perfil. `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` (Hallazgo adicional, punto
final de la Parte 1) decía "no existe ninguna pantalla de edición de Redes Sociales fuera
del wizard de registro" — cierto en cuanto a UI, pero **no menciona que el backend ya tiene el
CRUD completo esperando ser consumido**, que es la pieza nueva y relevante de este hallazgo.

### 2. El mensaje de contraseña insegura de `comercio.js` ya menciona la minúscula

`docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` puntos 8/9 señalaba `comercio.js:1010` (línea
vieja) como uno de los 3 lugares con el mensaje desactualizado ("...una mayúscula y un
número", sin "minúscula"). Releyendo `comercio.js:1039-1040` hoy: `'Debe tener mínimo 8
caracteres, una mayúscula, una minúscula y un número.'` — ya corregido, texto idéntico al de
`cliente.js:305`. Mismo hallazgo ya confirmado para Cliente en
`docs/AUDITORIA-EXHAUSTIVA-CLIENTE.md` Parte 3 punto 2, que ya anticipaba "razonable esperar
que también esté corregido [en `comercio.js`] — a confirmar en una auditoría de Comercio" —
**confirmado ahora**.

### 3. `RegistroComercioRequestDTO.password` conserva el `@Size(max=72)` redundante que sí se quitó de `RegistroClienteRequestDTO.password` — bug real de mensaje no determinístico, no corregido

`docs/AUDITORIA-EXHAUSTIVA-CLIENTE.md` Parte 3 punto 9 documenta que el 2026-09-03 se
corrigió el orden no determinístico de `ConstraintViolation` en
`RegistroClienteRequestDTO.password` **eliminando el `@Size(max=72)` explícito**, porque
`@ValidarPasswordSegura` ya acota la longitud en su propio regex (`.{8,72}`) — dejando ese
DTO con el mismo criterio que ya usaban `CambioPasswordPerfilRequestDTO`/
`ConfirmarRecuperacionPasswordRequestDTO`. El arreglo transversal del `GlobalExceptionHandler`
(2026-09-01, `docs/DECISIONES.md`) resuelve el caso "vacío vs. formato" para **todos** los
DTOs del proyecto (prioriza siempre `@NotBlank`/`@NotNull`/`@NotEmpty`), pero deja
explícitamente sin cubrir el caso residual de **2 violaciones de formato simultáneas, ninguna
de las dos de obligatoriedad** — exactamente lo que ocurre hoy con
`RegistroComercioRequestDTO.password` (`RegistroComercioRequestDTO.java:137-140`, todavía con
`@NotBlank` + `@ValidarPasswordSegura` + `@Size(max=72, message="La contraseña no puede
superar los 72 caracteres")`): un password de 73+ caracteres que igual cumple
mayúscula+minúscula+número viola **tanto** `@ValidarPasswordSegura` (su regex `.{8,72}` no
matchea) **como** `@Size(max=72)` — ninguna de las dos es una anotación de obligatoriedad, así
que el mensaje que gana depende del orden interno de Hibernate Validator, no determinístico
entre corridas (mismo patrón exacto que el bug ya confirmado y corregido para Cliente). **No
detectado ni corregido en este tramo** — el fix de Cliente del 2026-09-03 no tocó
`RegistroComercioRequestDTO`, y esta auditoría confirma que el DTO de Comercio sigue expuesto
al mismo bug.

### 4. `ComercioPerfilRequestDTO.nombre`/`telefono` ya separan vacío de formato en el frontend — contradice la auditoría previa

`docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` punto 2 decía: "`validador: esTextoConContenidoValido`,
**un único mensaje** 'Ingresá el nombre de tu comercio.' para vacío y formato" (para `nombre`)
y "`validador: esTelefonoValido`, **un único mensaje**... para vacío y para formato inválido"
(para `telefono`). Releyendo `comercio.js:955-959` hoy, ambos campos (más `emailContacto`) usan
`validarCamposRequeridosSilencioso` con `mensajeVacio`/`mensajeInvalido` explícitos y
distintos entre sí — el mismo patrón de separación de dos pasos que la auditoría de Cliente ya
identificó como "ya corregido, sin entrada de `docs/DECISIONES.md` localizada que lo
documente explícitamente por su nombre" para el caso análogo de `ClienteEditarPerfilRequestDTO`.
Mismo patrón acá: corrección real ya aplicada, sin rastro de una entrada dedicada en
`docs/DECISIONES.md` bajo ese nombre exacto.

### 5. `ComercioPerfilRequestDTO.descripcion` ya tiene mensaje en español para su `@Size`

`docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` punto 2 no marcaba explícitamente el mensaje de
`descripcion` como faltante, pero sí lo agrupaba implícitamente bajo "falta mensaje en
español del `@Size` (mismo patrón ya señalado... para `ProductoRequestDTO.descripcion`)".
Releyendo `ComercioPerfilRequestDTO.java:36`: `@Size(max = 2000, message = "La descripción no
puede superar los 2000 caracteres.")` — **ya tiene mensaje en español**, a diferencia de
`ProductoRequestDTO.descripcion` (`ProductoRequestDTO.java:35`, sin `message`, confirmado
todavía pendiente — ver Parte 2, tabla 7). Es decir: de los 2 campos `descripcion` que la
auditoría previa agrupaba bajo el mismo gap, solo uno de los dos (`Producto`) sigue teniendo
el problema hoy; el otro (`Comercio`) ya se corrigió sin que quede una entrada de
`docs/DECISIONES.md` que lo documente por separado del resto.

### 6. `ComercioPerfilRequestDTO.emailContacto` ya usa `@ValidarFormatoEmail` en vez de la combinación redundante `@Email`+`@Pattern`

`docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` punto 2 documentaba: "`@NotBlank` + `@Email` +
`@Pattern` redundante (mismo regex que `@ValidarFormatoEmail`, sin usar la anotación custom ya
existente)" y recomendaba en la Parte 3 "cambiar el `@Email` + `@Pattern` redundante del
backend por `@ValidarFormatoEmail`". Releyendo `ComercioPerfilRequestDTO.java:44-47` hoy:
`@NotBlank(message = "No debe estar vacío")` + `@ValidarFormatoEmail(message = "Ingresá un
email de contacto con formato válido")` + `@Size(max = 150)` — **la recomendación ya está
aplicada**, sin `@Email` ni `@Pattern` redundante. Mismo patrón que los puntos 4/5: corrección
real sin entrada dedicada localizada en `docs/DECISIONES.md`.

### 7. `ComercioPerfilRequestDTO.aceptaDelivery`/`aceptaRetiro` YA tienen la validación de "al menos una modalidad" en `ComercioService.editarPerfil` — el gap de integridad que el prompt pedía confirmar YA NO EXISTE

Este es el hallazgo de mayor impacto real (no solo de mensajes) de todo el documento, y
contradice directamente lo que `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` punto 2 documentaba
como un gap de integridad abierto: *"**Sin ninguna validación de 'al menos una modalidad' en
este DTO ni en `ComercioService.editarPerfil`** — confirmado por lectura de código:
`validarModalidades(...)` existe solo en `RegistroService` (registro inicial), nunca se
invoca desde la edición de perfil"*, con la conclusión de que *"un comercio podría, llamando
`PUT /comercios/perfil` directo (Postman/curl), guardar `aceptaDelivery=false,
aceptaRetiro=false` sin que el backend lo impida — la única barrera hoy es la UI"*.

Releyendo `ComercioService.java:53-54` hoy:

```java
public ComercioResponseDTO editarPerfil(Integer usuarioId, ComercioPerfilRequestDTO request) {
    ComercioValidaciones.validarModalidadesEntrega(request.isAceptaDelivery(), request.isAceptaRetiro());
    Comercio comercio = obtenerComercioDelUsuario(usuarioId);
    ...
```

La validación (`ComercioValidaciones.validarModalidadesEntrega`, `util/ComercioValidaciones.java:17-21`,
lanza `ValidacionException("El comercio debe ofrecer al menos una modalidad de entrega
(delivery o retiro)")` cuando ambos flags son `false`) es la **primera línea** del método,
antes incluso de resolver el comercio del usuario autenticado. Es la misma función estática
que usa `RegistroService.registrarComercio` (línea 128) — **un método compartido, reusado en
ambos puntos de entrada**, exactamente la recomendación que la propia auditoría previa
proponía en su Parte 3 ("extraer a un lugar compartido o llamar desde
`ComercioService.editarPerfil` directamente") — ya implementada. No hay ninguna entrada de
`docs/DECISIONES.md` localizada con un título que documente este cierre puntual — es posible
que haya quedado mezclada dentro de otra entrada de un tramo posterior al 2026-09-01 sin
mención explícita por nombre, mismo patrón que los puntos 2/4/5/6 de esta Parte 3. **Sea cual
sea el motivo de la falta de registro explícito, el código real hoy demuestra que el gap ya
no existe** — el prompt original de esta auditoría pedía "CONFIRMÁ que sigue así en el código
actual" asumiendo que probablemente seguía abierto; la confirmación real es la contraria.

### 8. `Comercio.java` (entidad JPA real) no tiene las columnas `cerrado_manualmente`, `fecha_resolicitud`, `mp_vinculado` que sí describe `docs/diccionario-de-datos.md` v1.5

No es una discrepancia inesperada — es exactamente lo que `CLAUDE.md` §1bis ya anuncia como
tramo de portabilidad no realizado todavía (`CuentaMercadoPago`/`ConfiguracionTarifa`/`Pago`
en la lista de tramos nuevos sin planificar). Se deja documentado acá porque es relevante para
quien arme la matriz de testeo a partir de este documento: la regla de negocio completa que
describe `docs/diccionario-de-datos.md:688` ("Un comercio puede recibir pedidos si: `estado =
APROBADO AND mp_vinculado = true AND cerrado_manualmente = false AND ...`") **no es la regla
real hoy** — `ComercioService.validarAceptaPedidos` (líneas 88-91) solo chequea `estado !=
APROBADO`, sin ningún concepto de `mp_vinculado`/`cerrado_manualmente` (columnas que ni
siquiera existen en la entidad). Cualquier test que asuma la regla completa del diccionario
fallaría contra el backend real hoy — comportamiento esperado, no un bug.

### 9. `RechazoPedidoRequestDTO` — confirmado ya resuelto, sin discrepancia

A diferencia de los puntos anteriores, este campo **sí** coincide exactamente entre lo
documentado y el código real: `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` punto 5 (actualizado
2026-09-02) ya reflejaba la obligatoriedad condicional de `comentario` cuando `motivo=OTRO`,
implementada en ambas capas — releyendo el código hoy (`RechazoPedidoRequestDTO.java`,
`PedidoService.rechazarPedido`, `comercio.js:573-598`) se confirma sin cambios. Se deja
constancia explícita de "sin discrepancia" para que quede claro que no todos los puntos de la
auditoría previa están desactualizados — varios sí siguen vigentes tal cual se documentaron.

---

## Parte 4 — Valores límite exactos

Extraídos del código real, listos para armar la matriz de casos de Postman sin volver a leer
código.

### Longitudes (columna física / `docs/diccionario-de-datos.md` vs. límite de validación real)

| Campo | Columna física | Límite de validación real |
|---|---|---|
| `Comercio.nombre` | VARCHAR(150) | `@Size(max=150)` en registro y edición — coincide. |
| `Comercio.descripcion` | TEXT (sin límite físico real) | `@Size(max=2000)` en ambos DTOs (registro y edición) — límite de aplicación, no de columna. |
| `Comercio.telefono` | VARCHAR(30) | Formato válido real: `+549` + 10 dígitos = 14 caracteres, `@Size(max=30)` como techo adicional nunca alcanzable con formato válido — idéntico a Cliente. |
| `Comercio.email` (contacto) | VARCHAR(150) | `@Size(max=150)` en registro (`emailContacto`) y en `ComercioPerfilRequestDTO` — coincide. |
| `Comercio.foto_perfil_url` | VARCHAR(500) | `@Size(max=500)` en `RegistroComercioRequestDTO.fotoPerfilUrl`. `FotoPerfilComercioRequestDTO.url` (edición posterior) **no tiene `@Size` propio** — asimetría real no señalada antes: el registro topea a 500, la edición de foto de perfil no, aunque la columna física es la misma. |
| `PersonaJuridica.razon_social` | VARCHAR(150) (inferido, no confirmado línea por línea en `diccionario-de-datos.md` en esta pasada) | `@Size(max=150)`. |
| `PersonaJuridica.cuit` | Formato fijo 11 dígitos | Sin `@Size` propio — el regex de `@ValidarCuit` ya acota a exactamente 11. |
| `PersonaJuridica.domicilio_fiscal` | — | `@Size(max=255)`. |
| `PersonaFisica.nombre`/`apellido` (representante) | VARCHAR(100) (mismo patrón que Cliente) | `@Size(max=100)` en ambos. |
| `PersonaFisica.dni` (representante) | VARCHAR(10) | Formato válido real: 7-8 dígitos, sin `@Size` propio (mismo patrón que Cliente). |
| `PersonaFisica.telefono` (representante) | VARCHAR(30) | `@Size(max=30)`, formato real 14 caracteres (`+549` + 10 dígitos). |
| `Usuario.email` (login) | VARCHAR(254) | `@Size(max=254)` — idéntico a Cliente. |
| `Usuario.password_hash` | VARCHAR(255) (hash) | Valor crudo: 8-72 caracteres. `RegistroComercioRequestDTO.password` **todavía tiene** `@Size(max=72)` explícito y redundante (ver Parte 3 punto 3) — a diferencia de `RegistroClienteRequestDTO.password`, ya limpiado. |
| `Producto.nombre` | VARCHAR(150) (inferido) | `@Size(max=150)`. |
| `Producto.descripcion` | TEXT | `@Size(max=2000)`, sin mensaje custom (gap confirmado, ver Parte 2 tabla 7). |
| `Producto.precio` | DECIMAL(10,2) | `@Digits(integer=8, fraction=0)` — 8 dígitos enteros reales, sin decimales admitidos pese al `DECIMAL(10,2)` físico (margen a futuro, ver `docs/DECISIONES.md` 2026-09-02). |
| `ProductoTag` (vía `tagIds`) | N/A (tabla de unión) | `@Size(max=5)` sobre la lista — igual límite que el chip-picker del frontend. |
| `ImagenProducto` (por producto) | N/A | Tope de 5 imágenes por producto, `MAX_IMAGENES_POR_PRODUCTO` en `ProductoService.java:62` y `js/cloudinary.js:5` — `409` real en la 6ª (confirmado Postman). |
| `RedSocial.url` | VARCHAR(500) | `@Size(max=500)` en `RedSocialRequestDTO.url` — coincide, tanto en el flujo de registro como en el CRUD dedicado (mismo DTO reusado). |
| `RechazoPedidoRequestDTO.comentario` | VARCHAR(500) (inferido de `Pedido.comentario_rechazo`) | `@Size(max=500)`, `maxlength="500"` HTML — coincide. |
| `AprobacionComercioRequestDTO.motivo` | VARCHAR(500) (inferido) | `@Size(max=500)`, `maxlength="500"` HTML (rol Administrador, mención únicamente). |

### Regex exactos

| Validación | Regex (backend, Java) | Regex/lógica (frontend, JS) |
|---|---|---|
| Nombre de Comercio / Razón social / Domicilio fiscal (texto libre permisivo) | `.*[\p{L}0-9].*` (al menos un alfanumérico) | `esTextoConContenidoValido`: `/[\p{L}0-9]/u` — idéntico. |
| Nombre de Producto | `^[\p{L}0-9][\p{L}0-9 ]*$` (empieza con alfanumérico, luego alfanumérico o espacios — sin símbolos en ninguna posición) | `esNombreProductoValido`: `^[\p{L}0-9][\p{L}0-9 ]*$` tras `.trim()` — idéntico. |
| Nombre/Apellido del representante (`@ValidarFormatoNombre`) | `^[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+(?:[-' ][A-Za-zÁÉÍÓÚáéíóúÑñÜü]+)*$` | `esNombreClienteValido`: idéntico — mismo patrón que Cliente en el registro (no el de `@ValidarNombrePropio`/`esNombrePropioValido`, Unicode completo, que usa la edición de perfil de Cliente). |
| DNI del representante (`@ValidarFormatoDni`) | `\d{7,8}` tras sanitizar `[.\-\s]` | `esDniClienteValido`: `^\d{7,8}$` tras `sanitizarDni` — idéntico. |
| Teléfono argentino (comercio y representante, `@ValidarTelefonoArgentino`) | `^\+549\d{10}$` tras sanitizar `[ ()\-]` | `esTelefonoValido` — idéntico, mismo algoritmo que Cliente. |
| Email de contacto (registro, `@Email` Hibernate) | RFC estándar de Hibernate Validator | `esEmailValido`: `^[^\s@]+@[^\s@]+\.[^\s@]+$` (regex acotado, no el interno de Hibernate — mismo patrón "librería vs. función propia" que Cliente). |
| Email de contacto (edición de perfil, `@ValidarFormatoEmail`) | `^[^\s@]+@[^\s@]+\.[^\s@]+$` | `esEmailValido` — idéntico, esta vez sí backend y frontend comparten literalmente el mismo regex. |
| CUIT (`@ValidarCuit`) | 11 dígitos + dígito verificador módulo 11 AFIP (multiplicadores `[5,4,3,2,7,6,5,4,3,2]`) | `esCuitValido` — mismo algoritmo completo, no solo longitud. |
| Contraseña segura (`@ValidarPasswordSegura`) | `^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,72}$` | `esPasswordSegura`: longitud 8-72 + `/[A-Z]/` + `/[a-z]/` + `/[0-9]/` — idéntico en resultado. |
| Código postal (`@ValidarCodigoPostalArgentino`) | Clásico `^\d{4}$` o CPA `^[A-Za-z]\d{4}[A-Za-z]{3}$` | `esCodigoPostalValido` — idéntico, mismo par de patrones que Cliente. |
| URL de red social (`@Pattern` en `RedSocialRequestDTO.url`) | `^(?=.*\p{L})(?=.*\.)\S+$` (al menos 1 letra + 1 punto + sin espacios) | `esUrlRedSocialValida`: `^(?=.*\p{L})(?=.*\.)\S+$/u` — idéntico, incluye la misma normalización de esquema (`normalizarUrlConEsquema`/`normalizarUrlRedSocial`, antepone `https://` si falta). |
| URL de Cloudinary — foto de perfil de Comercio (`FotoPerfilComercioRequestDTO`) | Esquema `https` + host `res.cloudinary.com` + `(?i).*\.(jpg\|jpeg\|png\|webp)$` | No aplica (URL nunca tipeada). |
| URL de Cloudinary — imagen de producto (`ImagenProductoRequestDTO`) | Idéntico patrón al anterior. | No aplica. |
| URL de Cloudinary — recorte de imagen (`UrlImagenRequestDTO`) | Solo `@ValidarUrlCloudinary` (dominio), **sin** el `@Pattern` de extensión — ver Parte 2 tabla 9 para el porqué. | No aplica. |

### Rangos numéricos y enums cerrados

| Campo | Rango / valores |
|---|---|
| `ProductoRequestDTO.precio` | Entero positivo, 1 a 8 dígitos (`1` a `99999999`), sin decimales — `@Positive` + `@Digits(integer=8, fraction=0)`. |
| `ProductoRequestDTO.tagIds` | Lista de 0 a 5 ids (`@Size(max=5)`, sin mínimo). |
| `ImagenProductoRequestDTO`/`OrdenImagenRequestDTO.orden` | Entero `≥0` (`@PositiveOrZero`), sin tope explícito en la anotación — el tope real de "cuántas imágenes puede haber" (5) lo impone el conteo en `ProductoService.agregarImagen`, no el valor de `orden` en sí. |
| Imágenes por producto | 0 a 5 (`MAX_IMAGENES_POR_PRODUCTO`), `409` en el intento número 6. |
| Redes sociales activas por comercio | 1 a 5 (`@NotEmpty` + `@Size(max=5)` en el registro; `MAX_REDES_SOCIALES_ACTIVAS=5` en `RedSocialService.java:22` para el CRUD dedicado — mismo número en 2 lugares del código, sin una constante compartida entre `RegistroComercioRequestDTO`/`RedSocialService`). |
| `TipoComercio` | 12 valores: `RESTAURANTE`, `EMPRENDIMIENTO`, `ROTISERIA`, `HELADERIA`, `CAFETERIA`, `PANADERIA`, `PIZZERIA`, `PARRILLA`, `BAR`, `KIOSCO`, `FOOD_TRUCK`, `OTRO`. |
| `TipoPersonaJuridica` | 18 valores: `SA`, `SRL`, `SAS`, `SC`, `SCS`, `SCRL`, `SCSA`, `SCCS`, `CC`, `CS`, `CCSA`, `CA`, `SP`, `ST`, `ACP`, `EMP`, `EU`, `UTE`. |
| `CondicionIva` | 5 valores: `RESPONSABLE_INSCRIPTO`, `EXENTO`, `NO_INSCRIPTO`, `MONOTRIBUTO`, `RESPONSABLE_NACIONAL`. |
| `DiaSemana` | 7 valores: `LUNES` a `DOMINGO`. |
| `TipoRedSocial` | 7 valores: `INSTAGRAM`, `FACEBOOK`, `TIKTOK`, `WHATSAPP`, `X`, `SITIO_WEB`, `OTRO`. |
| `MotivoRechazo` | 7 valores: `SIN_STOCK`, `CERRADO`, `ALTO_VOLUMEN_PEDIDOS`, `PRODUCTO_NO_DISPONIBLE_TEMPORAL`, `SIN_DELIVERY_DISPONIBLE`, `PROBLEMA_TECNICO`, `OTRO` — `comentario` obligatorio únicamente para `OTRO`. |
| `EstadoProducto` | 3 valores, máquina de estados real: `DISPONIBLE↔AGOTADO`, ambos → `DESCONTINUADO` (terminal). |
| `EstadoComercio` | 6 valores en el enum backend (`PENDIENTE`, `APROBADO`, `RECHAZADO`, `SUSPENDIDO`, `INACTIVO`, `CERRADO_TEMPORALMENTE`) — sin máquina de transiciones explícita revisada en esta pasada (fuera del alcance puntual de "formularios"). |
| Archivo de imagen (foto de perfil de Comercio, foto de producto) | MIME en `{image/jpeg, image/png, image/webp}`, tamaño ≤ 5 MB — mismos límites que Cliente, mismo módulo compartido `js/cloudinary.js`. |

### Cobertura de test — resumen por formulario (estado a esta fecha, sin matriz nueva armada)

| # | Formulario | Cobertura Postman | Cobertura Playwright |
|---|---|---|---|
| 1 | Registro de Comercio (4 pasos) | Solo flujo feliz (Comercio A/B) + 3 negocios (`CUIT duplicado`, `DNI representante duplicado cross-role`, `horarios vacío`) — **cero negativos de formato campo por campo** (a diferencia de Cliente, que ya tiene la carpeta `22` completa). | 3 tests: flujo feliz completo, campo vacío bloquea paso 1, CUIT de longitud incorrecta bloquea paso 2 — sin cobertura de bloqueo de teclado en tiempo real (sí existe para Cliente), sin cobertura de horarios superpuestos, redes sociales duplicadas, ni dígito verificador de CUIT inválido (solo longitud). |
| 2 | Edición de perfil de Comercio | Solo `PUT` válido + 1 negocio ("intentando cambiar razonSocial/cuit, se ignoran") — **sin ningún negativo de formato de campo**, sin ningún test de la regla "al menos una modalidad" en este endpoint puntual (confirmado en Parte 3 punto 7 que la regla existe en el backend, pero no está testeada). | **Ninguno.** Sin spec dedicado equivalente a `11-perfil-cliente.spec.ts`. |
| 3 | Cambio de contraseña desde perfil (Comercio) | **Ninguno propio** — la cobertura existente en la colección (carpeta `09`) es sobre la cuenta de Cliente, no hay un request equivalente para Comercio. | **Ninguno.** |
| 4 | Foto de perfil de Comercio | 2 requests (firma + `PUT`), sin negativos de formato/límite (a diferencia de la foto de perfil de Usuario/Cliente, que si bien tampoco tenía cobertura al momento de la auditoría de Cliente, luego se cubrió en la matriz — folder `29`). | **Ninguno.** |
| 5 | CRUD de productos | Buena cobertura de reglas de negocio (tenant isolation, límite de 5 imágenes, ciclo de estados completo, producto descontinuado no editable) — **sin negativos de formato campo por campo de `nombre`/`precio`/`descripcion`/`tagIds`** (solo el flujo feliz y los negocios ya mencionados). | 4 tests: alta con imagen real, edición con reemplazo de foto, ciclo de estados completo, "casos negativos" (nombre vacío, precio negativo, límite de 5 fotos) — mejor cobertura negativa de Comercio en todo el rol. |
| 6 | Cambio de estado de producto | Cubierto dentro del ciclo de vida de folder `14` (DISPONIBLE→AGOTADO→DISPONIBLE→DESCONTINUADO, más transición inválida desde terminal). | Cubierto en el mismo test de "ciclo de estados" de `06-crud-productos.spec.ts`. |
| 7 | Gestión de imágenes de producto | Cobertura amplia en folder `14` (agregar, reordenar, actualizar URL vía recorte, eliminar, eliminar ya eliminada) — sin negativos de formato de `url` en `ImagenProductoRequestDTO`/`UrlImagenRequestDTO`. | Cubierto parcialmente (subida real + reemplazo en `06-crud-productos.spec.ts`), sin cobertura de reordenamiento por drag-and-drop ni de recorte. |
| 8 | Rechazo de pedido | 1 request (flujo feliz con motivo) — **sin negativo de `motivo` faltante, sin test de la obligatoriedad condicional de `comentario` cuando `motivo=OTRO`** (regla real sin ningún test automatizado, ni Postman ni Playwright). | Cubierto solo el flujo feliz de rechazo (`05-pedido-flujo-completo.spec.ts`, "retiro en el local: el comercio rechaza el pedido con un motivo") — con motivo distinto de `OTRO`, así que tampoco ejercita la regla condicional. |
| 9 | Redes Sociales (CRUD dedicado) | **Cobertura excelente** — folder `21`, 17 requests: tope de 5 activas, tipo ya activo, reactivación de tipo dado de baja, tenant isolation (editar/eliminar de otro comercio), 4 negativos de formato de `url`. | **Ninguno** — no hay ningún test de Playwright que interactúe con este endpoint (coherente con que no hay ninguna pantalla que lo use, ver Parte 3 punto 1). |
| 10 | Búsqueda de productos propios (client-side) | No aplica (no hay backend que testear). | No aplica. |

---

## Hallazgos adicionales

1. **El backend de RedSocial es funcionalmente un CRUD completo y bien probado (Postman) sin
   ningún consumidor en el frontend fuera del registro** — ver Parte 3 punto 1. Es la pieza
   más sorprendente de esta auditoría, análoga en espíritu a `explorar.html` en la auditoría
   de Cliente (una funcionalidad real, probada, que no está reflejada en ningún inventario de
   pantallas), pero en sentido inverso: acá es el **backend** el que está completo y sin
   consumidor, no una pantalla nueva sin documentar.
2. **`RegistroComercioRequestDTO.password` quedó fuera del alcance del fix de
   no-determinismo del 2026-09-03** — ver Parte 3 punto 3. Es un bug real, de bajo impacto
   práctico (solo observable con un password de 73+ caracteres bien formado, enviado
   directamente por API) pero con evidencia clara y ya reproducida para su análogo de
   Cliente.
3. **Constante `MAX_REDES_SOCIALES_ACTIVAS`/`MAX_REDES_SOCIALES` duplicada en 2 lugares**
   (`RedSocialService.java:22` = 5, `auth.js:1116` = 5) sin una fuente única — mismo patrón ya
   aceptado en el proyecto para otros límites (`MAX_IMAGENES_POR_PRODUCTO` también está
   duplicado entre `ProductoService.java` y `js/cloudinary.js`), no es un hallazgo nuevo de
   arquitectura, se deja registrado por completitud de la Parte 4.
4. **`FotoPerfilComercioRequestDTO.url` no tiene `@Size(max=500)` propio**, a diferencia de
   `RegistroComercioRequestDTO.fotoPerfilUrl` — mismo patrón de asimetría ya documentado para
   Cliente (`FotoPerfilUsuarioRequestDTO`, corregido el 2026-09-03 agregando el `@Size`
   faltante). Acá el `@Size` sigue faltando, sin corregir — candidato directo a un mismo tipo
   de bug (500 genérico en vez de 400 con mensaje) para una URL de más de 500 caracteres,
   aunque en la práctica una URL real de Cloudinary nunca se acerca a ese límite.
5. **No se auditó `AprobacionComercioRequestDTO` campo por campo en este documento** (ver
   Parte 1, punto 14) por ser una acción del rol Administrador sobre un Comercio, no un
   formulario que el propio Comercio completa — decisión de alcance explícita, no un olvido.

---

No cerrado — a la espera de que Diego confirme el checklist completo antes de dar por
terminada esta fase.
