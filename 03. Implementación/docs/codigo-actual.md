# Estado real del backend — Bajoneá (auditoría de código, previa a Fase 16)

> Generado leyendo el código fuente real del backend (`backend/src/main/java/com/bajonea/backend/`), `docs/DECISIONES.md` y los 5 documentos de `01. Análisis de Requerimientos/04. Requisitos Funcionales/`. No refleja lo que la guía planeó — refleja lo que el código hace hoy, 2026-07-20, con la Fase 14 cerrada y la Fase 15 (catálogo de pantallas Figma) también cerrada. Fuente de verdad para cruzar campo por campo contra las pantallas de Figma en la Fase 16.
>
> Metodología de roles: **ningún** Controller usa `@PreAuthorize`. Toda la autorización por rol vive en `SecurityConfig` (matchers por prefijo de path) — ver sección 6. Metodología de status codes: los Controllers son "tontos", no capturan excepciones; el único status **explícito** es el que fija el propio método (`ResponseEntity.status(...)`). Los códigos de error (400/401/403/404/409) los produce `GlobalExceptionHandler` o Spring Security — se marcan **(inferido de Service)** cuando se confirmó grepeando la excepción real en el Service, o **(inferido genérico)** cuando es el caso estándar del patrón del proyecto sin verificar línea por línea.

## Índice

1. [Inventario de Controllers](#1-inventario-de-controllers)
   - [1.0 DTOs transversales](#10-dtos-transversales)
   - [1.1 AdministradorController](#11-administradorcontroller--apiv1administrador)
   - [1.2 AuthController](#12-authcontroller--apiv1auth)
   - [1.3 CarritoController](#13-carritocontroller--apiv1carrito)
   - [1.4 CatalogoController](#14-catalogocontroller--apiv1catalogo)
   - [1.5 CategoriaController](#15-categoriacontroller--apiv1categorias)
   - [1.6 ComercioController](#16-comerciocontroller--apiv1comercios)
   - [1.7 GeografiaController](#17-geografiacontroller--apiv1geografia)
   - [1.8 HealthController](#18-healthcontroller--apiv1health)
   - [1.9 NotificacionController](#19-notificacioncontroller--apiv1notificaciones)
   - [1.10 PedidoController](#110-pedidocontroller--apiv1pedidos)
   - [1.11 ProductoController](#111-productocontroller--apiv1productos)
   - [1.12 TagController](#112-tagcontroller--apiv1tags)
   - [1.13 TestController (solo perfil `test`, fuera del contrato de producción)](#113-testcontroller-solo-perfil-test-fuera-del-contrato-de-producción)
   - [1.14 Catálogo de anotaciones de validación custom](#114-catálogo-de-anotaciones-de-validación-custom)
2. [Inventario de Entidades](#2-inventario-de-entidades)
3. [Inventario de Services](#3-inventario-de-services)
4. [Desviaciones y decisiones documentadas](#4-desviaciones-y-decisiones-documentadas)
5. [Qué NO existe todavía](#5-qué-no-existe-todavía)
6. [Roles y seguridad](#6-roles-y-seguridad)
7. [Hallazgos de esta auditoría](#7-hallazgos-de-esta-auditoría)

---

## 1. Inventario de Controllers

11 Controllers de producción, 51 endpoints. `TestController` (2 endpoints) es exclusivo del perfil `test` — documentado aparte en §1.13, no forma parte del contrato de producción.

### 1.0 DTOs transversales

Usados por más de un Controller — se definen acá una sola vez.

**`ApiResponse<T>`** (envoltorio estándar de toda respuesta) — `mensaje: String`, `data: T`.

**`DireccionRequestDTO`** (anidado dentro de `RegistroClienteRequestDTO`/`RegistroComercioRequestDTO`, ver §1.2):
| Campo | Tipo | Validación |
|---|---|---|
| calle | String | `@NotBlank @Size(max=150)` |
| numero | String | `@NotBlank @Size(max=10)` |
| pisoDepto | String | `@Size(max=30)` |
| codigoPostal | String | `@NotBlank @ValidarCodigoPostalArgentino` |
| localidadId | String | `@NotBlank @Size(max=15)` |
| principal | boolean | sin validación (primitivo) |

Nota: no lleva `clienteId`/`comercioId` ni `@DireccionExclusionMutua` — la exclusión mutua queda garantizada estructuralmente por los dos flujos de registro separados que lo contienen, no por la anotación (que existe en el catálogo pero **no está en uso** en ningún DTO real, ver §1.14 y §7).

**`DireccionResponseDTO`** (anidado dentro de `ComercioResponseDTO` y `PedidoResponseDTO`): `id: Integer`, `calle: String`, `numero: String`, `pisoDepto: String`, `codigoPostal: String`, `localidadId: String`, `nombreLocalidad: String`, `nombreProvincia: String`, `principal: boolean`.

---

### 1.1 AdministradorController — `/api/v1/administrador`
Rol: **ADMINISTRADOR** (path prefix, ver §6)

| Método | Path | DTO request | DTO response | Status explícito | Status inferido | Negocio |
|---|---|---|---|---|---|---|
| GET | `/api/v1/administrador/comercios/pendientes` | — | `List<ComercioResponseDTO>` | 200 | 401/403 | Lista comercios en estado `PENDIENTE` de aprobación |
| PUT | `/api/v1/administrador/comercios/{comercioId}/resolver` | `AprobacionComercioRequestDTO` | `Void` | 200 | 400 (validación); 401/403; 404 comercio inexistente (inferido genérico); 409 "El comercio ya fue resuelto, no está en estado PENDIENTE" (inferido de `AdministradorService`); 400 "El motivo es obligatorio al rechazar un comercio" vía `ValidacionException` (inferido de Service) | Aprueba o rechaza un comercio pendiente. Path real `/resolver`, no `/resolucion` como dice la guía — ver §4 |

**`AprobacionComercioRequestDTO`**: `aprobar: Boolean` (`@NotNull`), `motivo: String` (`@Size(max=500)`, sin `@NotNull`/`@NotBlank` — obligatorio solo si `aprobar=false`, validado a nivel Service, no Bean Validation).

**`ComercioResponseDTO`**: `id: Integer`, `nombre: String`, `descripcion: String`, `fotoPerfilUrl: String`, `telefono: String`, `emailContacto: String`, `tipoComercio: TipoComercio`, `aceptaDelivery: boolean`, `aceptaRetiro: boolean`, `estado: EstadoComercio`, `razonSocial: String`, `cuit: String`, `direccion: DireccionResponseDTO` (anidado).

---

### 1.2 AuthController — `/api/v1/auth`
Rol: público, salvo `cambiar-password` y `logout` (autenticado, cualquier rol)

| Método | Path | DTO request | DTO response | Status explícito | Status inferido | Negocio |
|---|---|---|---|---|---|---|
| POST | `/api/v1/auth/registro/cliente` | `RegistroClienteRequestDTO` | `UsuarioResponseDTO` | 201 | 400; 409 "Ya existe una cuenta registrada con ese DNI"/"...email" (inferido de `RegistroService`) | Alta de Cliente, envía verificación |
| POST | `/api/v1/auth/registro/comercio` | `RegistroComercioRequestDTO` | `UsuarioResponseDTO` | 201 | 400; 409 "Ya existe una cuenta registrada con ese CUIT"/"...email" (inferido de `RegistroService`) | Alta de Comercio, nace `PENDIENTE` |
| POST | `/api/v1/auth/login` | `LoginRequestDTO` | `LoginResponseDTO` | 200 | 401 "Email o contraseña incorrectos" (`CredencialesInvalidasException`, inferido); 409 "Verificá tu email/Cuenta bloqueada/Cuenta inactiva/Cuenta suspendida" (`ConflictoDeNegocioException` por estado de cuenta, inferido) | Login, devuelve JWT + rol |
| GET | `/api/v1/auth/verificar/{token}` | — (path var) | `Void` | 200 | 401 token inválido/expirado (inferido) | Verifica cuenta por token |
| POST | `/api/v1/auth/recuperar-password` | `RecuperacionPasswordRequestDTO` | `Void` | 200 | 400 | Genera token de recuperación (mensaje neutro, no filtra existencia de email) |
| POST | `/api/v1/auth/recuperar-password/confirmar` | `ConfirmarRecuperacionPasswordRequestDTO` | `Void` | 200 | 400; 401 token inválido/expirado (inferido) | Confirma nueva password vía token |
| POST | `/api/v1/auth/reactivar-cuenta` | `ReactivacionCuentaRequestDTO` | `Void` | 200 | 400 | Genera token de reactivación (mensaje neutro) |
| GET | `/api/v1/auth/reactivar-cuenta/confirmar/{token}` | — (path var) | `Void` | 200 | 401 token inválido/expirado (inferido) | Reactiva cuenta en estado `INACTIVO` |
| POST | `/api/v1/auth/cambiar-password` | `CambioPasswordPerfilRequestDTO` | `Void` | 200 | 400 "La nueva contraseña debe ser distinta a la actual" (`ValidacionException`, inferido); 401 "La contraseña actual es incorrecta" (`CredencialesInvalidasException`, inferido) | Cambio de password desde perfil, cualquier rol autenticado |
| POST | `/api/v1/auth/logout` | — | `Void` | 200 | 401 sin token | Cierra la `Sesion` activa del usuario (logout real, no simbólico) |

**`RegistroClienteRequestDTO`**:
| Campo | Tipo | Validación |
|---|---|---|
| nombre | String | `@NotBlank @ValidarNombrePropio @Size(max=100)` |
| apellido | String | `@NotBlank @ValidarNombrePropio @Size(max=100)` |
| dni | String | `@NotBlank @ValidarDni` |
| fechaNacimiento | LocalDate | `@NotNull @Past @MayorDeEdad` |
| telefono | String | `@NotBlank @ValidarTelefonoArgentino @Size(max=30)` |
| email | String | `@NotBlank @Email @Size(max=150)` |
| password | String | `@NotBlank @ValidarPasswordSegura @Size(max=72)` |
| direccion | DireccionRequestDTO | `@NotNull @Valid` |

**`RegistroComercioRequestDTO`**:
| Campo | Tipo | Validación |
|---|---|---|
| razonSocial | String | `@NotBlank @Size(max=150)` |
| cuit | String | `@NotBlank @ValidarCuit` |
| condicionIva | CondicionIva | `@NotNull` |
| tipoSociedad | TipoPersonaJuridica | `@NotNull` |
| domicilioFiscal | String | `@NotBlank @Size(max=255)` |
| fechaInicioActividades | LocalDate | `@NotNull @PastOrPresent` |
| nombre | String | `@NotBlank @Size(max=150)` |
| descripcion | String | `@Size(max=2000)` |
| telefono | String | `@NotBlank @ValidarTelefonoArgentino @Size(max=30)` |
| emailContacto | String | `@NotBlank @Email @Size(max=150)` |
| tipoComercio | TipoComercio | `@NotNull` |
| aceptaDelivery | boolean | sin validación (primitivo) |
| aceptaRetiro | boolean | sin validación (primitivo) |
| email | String | `@NotBlank @Email @Size(max=150)` (credencial de login, distinto de `emailContacto`) |
| password | String | `@NotBlank @ValidarPasswordSegura @Size(max=72)` |
| direccion | DireccionRequestDTO | `@NotNull @Valid` |

**`LoginRequestDTO`**: `email: String` (`@NotBlank @Email`), `password: String` (`@NotBlank`).

**`LoginResponseDTO`**: `token: String`, `usuario: UsuarioResponseDTO`.

**`UsuarioResponseDTO`**: `id: Integer`, `email: String`, `rol: RolUsuario`, `estado: EstadoUsuario` (nunca password).

**`RecuperacionPasswordRequestDTO`**: `email: String` (`@NotBlank @Email`).

**`ConfirmarRecuperacionPasswordRequestDTO`**: `token: String` (`@NotBlank`), `nuevaPassword: String` (`@NotBlank @ValidarPasswordSegura`).

**`ReactivacionCuentaRequestDTO`**: `email: String` (`@NotBlank @Email`).

**`CambioPasswordPerfilRequestDTO`**: `passwordActual: String` (`@NotBlank`), `passwordNueva: String` (`@NotBlank @ValidarPasswordSegura`).

---

### 1.3 CarritoController — `/api/v1/carrito`
Rol: **CLIENTE** (path prefix)

| Método | Path | DTO request | DTO response | Status explícito | Status inferido | Negocio |
|---|---|---|---|---|---|---|
| GET | `/api/v1/carrito` | — | `CarritoResponseDTO` | 200 | 401/403 | Ver carrito del cliente autenticado (get-or-create perezoso) |
| POST | `/api/v1/carrito/items` | `ItemCarritoRequestDTO` | `CarritoResponseDTO` | 201 | 400; 401/403; 409 "producto no disponible" / "comercio distinto en carrito" (inferido de `CarritoService`) | Agrega producto al carrito |
| PUT | `/api/v1/carrito/items/{id}` | `ActualizarCantidadItemCarritoRequestDTO` | `CarritoResponseDTO` | 200 | 400; 401/403; 404 "Ítem no encontrado" (inferido) | Cambia cantidad de un ítem |
| DELETE | `/api/v1/carrito/items/{id}` | — | `CarritoResponseDTO` | 200 | 401/403; 404 "Ítem no encontrado" (inferido) | Elimina un ítem del carrito |
| DELETE | `/api/v1/carrito` | — | `Void` | 200 | 401/403 | Vacía el carrito completo |

**`ItemCarritoRequestDTO`**: `productoId: Integer` (`@NotNull`), `cantidad: Integer` (`@NotNull @Min(1) @Max(20)`), `nota: String` (`@Size(max=255)`).

**`ActualizarCantidadItemCarritoRequestDTO`**: `cantidad: Integer` (`@NotNull @Min(1) @Max(20)`).

**`CarritoResponseDTO`**: `comercioId: Integer`, `nombreComercio: String`, `items: List<ItemCarritoResponseDTO>`, `subtotal: BigDecimal`.

**`ItemCarritoResponseDTO`**: `id: Integer`, `productoId: Integer`, `nombreProducto: String`, `precioUnitario: BigDecimal`, `cantidad: Integer`, `subtotal: BigDecimal`, `nota: String`.

---

### 1.4 CatalogoController — `/api/v1/catalogo`
Rol: público

| Método | Path | DTO request | DTO response | Status explícito | Status inferido | Negocio |
|---|---|---|---|---|---|---|
| GET | `/api/v1/catalogo/comercios` | — | `List<ComercioResponseDTO>` | 200 | — | Lista comercios aprobados (catálogo público, sin buscador/filtro) |
| GET | `/api/v1/catalogo/comercios/{id}/productos?categoriaId=&tagId=` | — (query params opcionales) | `List<ProductoResponseDTO>` | 200 | 404 comercio inexistente (inferido genérico) | Lista productos de un comercio, filtrable por categoría/tag |

**`ProductoResponseDTO`**: `id: Integer`, `nombre: String`, `descripcion: String`, `precio: BigDecimal`, `categoriaId: Integer`, `nombreCategoria: String`, `comercioId: Integer`, `nombreComercio: String`, `estado: EstadoProducto`, `imagenes: List<ImagenProductoResponseDTO>`, `tags: List<String>`.

**`ImagenProductoResponseDTO`**: `id: Integer`, `url: String`, `orden: Integer`, `esPrincipal: boolean`.

---

### 1.5 CategoriaController — `/api/v1/categorias`
Rol: **ADMINISTRADOR** (path prefix)

| Método | Path | DTO request | DTO response | Status explícito | Status inferido | Negocio |
|---|---|---|---|---|---|---|
| POST | `/api/v1/categorias` | `CategoriaRequestDTO` | `CategoriaResponseDTO` | 201 | 400; 401/403; 409 "Ya existe una categoría con ese nombre" (inferido) | Alta de categoría |
| PUT | `/api/v1/categorias/{id}` | `CategoriaRequestDTO` | `CategoriaResponseDTO` | 200 | 400; 401/403; 404 (inferido genérico); 409 nombre duplicado (inferido) | Edición de categoría |
| GET | `/api/v1/categorias` | — | `List<CategoriaResponseDTO>` | 200 | 401/403 | Lista todas las categorías (activas e inactivas) |
| DELETE | `/api/v1/categorias/{id}` | — | `Void` | 200 | 401/403; 404 (inferido genérico) | Baja lógica (`activo=false`) — **sin bloqueo si tiene productos asociados**, ver §7 |
| PUT | `/api/v1/categorias/{id}/reactivar` | — | `CategoriaResponseDTO` | 200 | 401/403; 404 (inferido genérico) | Reactiva categoría dada de baja |

**`CategoriaRequestDTO`**: `nombre: String` (`@NotBlank @Size(max=100)`).

**`CategoriaResponseDTO`**: `id: Integer`, `nombre: String`, `activo: boolean`.

---

### 1.6 ComercioController — `/api/v1/comercios`
Rol: **COMERCIO** (path prefix)

| Método | Path | DTO request | DTO response | Status explícito | Status inferido | Negocio |
|---|---|---|---|---|---|---|
| GET | `/api/v1/comercios/perfil` | — | `ComercioResponseDTO` | 200 | 401/403 | Ver perfil propio del comercio autenticado |
| PUT | `/api/v1/comercios/perfil` | `ComercioPerfilRequestDTO` | `ComercioResponseDTO` | 200 | 400; 401/403 | Edita perfil público (nombre, descripción, teléfono, email contacto, delivery/retiro) |
| POST | `/api/v1/comercios/perfil/foto/firma` | — | `CloudinarySignatureResponseDTO` | 200 | 401/403 | Genera firma de subida Cloudinary para foto de perfil (sin límite de cantidad, flujo separado de la galería de producto) |
| PUT | `/api/v1/comercios/perfil/foto` | `FotoPerfilComercioRequestDTO` | `ComercioResponseDTO` | 200 | 400; 401/403 | Persiste la URL de la foto de perfil ya subida |

**`ComercioPerfilRequestDTO`**:
| Campo | Tipo | Validación |
|---|---|---|
| nombre | String | `@NotBlank @Size(max=150)` |
| descripcion | String | `@Size(max=2000)` |
| telefono | String | `@NotBlank @ValidarTelefonoArgentino @Size(max=30)` |
| emailContacto | String | `@NotBlank @Email @Size(max=150)` |
| aceptaDelivery | boolean | sin validación (primitivo) |
| aceptaRetiro | boolean | sin validación (primitivo) |

**`FotoPerfilComercioRequestDTO`**: `url: String` (`@NotBlank @ValidarUrlCloudinary @Pattern(regexp="(?i).*\.(jpg|jpeg|png|webp)$")`).

**`CloudinarySignatureResponseDTO`**: `signature: String`, `timestamp: long`, `apiKey: String`, `cloudName: String`, `folder: String`, `uploadPreset: String`.

---

### 1.7 GeografiaController — `/api/v1/geografia`
Rol: público

| Método | Path | DTO request | DTO response | Status explícito | Status inferido | Negocio |
|---|---|---|---|---|---|---|
| GET | `/api/v1/geografia/provincias` | — | `List<ProvinciaResponseDTO>` | 200 | — | Lista las 24 provincias precargadas por ETL |
| GET | `/api/v1/geografia/localidades?provinciaId=` | — (`@RequestParam String provinciaId`, obligatorio) | `List<LocalidadResponseDTO>` | 200 | 400 "provinciaId: parámetro requerido ausente" (`MissingServletRequestParameterException`, confirmado) | Lista localidades de una provincia (selector dependiente) |

**`ProvinciaResponseDTO`**: `id: String`, `nombre: String`.

**`LocalidadResponseDTO`**: `id: String`, `nombre: String`, `provinciaId: String`.

---

### 1.8 HealthController — `/api/v1/health`
Rol: público

| Método | Path | DTO request | DTO response | Status explícito | Status inferido | Negocio |
|---|---|---|---|---|---|---|
| GET | `/api/v1/health` | — | `String` (dentro de `data`) | 200 | — | Endpoint de diagnóstico de arranque |

---

### 1.9 NotificacionController — `/api/v1/notificaciones`
Rol: cualquier rol autenticado — no matchea ningún prefijo con rol específico en `SecurityConfig`, cae en `anyRequest().authenticated()`

| Método | Path | DTO request | DTO response | Status explícito | Status inferido | Negocio |
|---|---|---|---|---|---|---|
| GET | `/api/v1/notificaciones` | — | `List<NotificacionResponseDTO>` | 200 | 401 | Lista notificaciones del usuario autenticado |
| PUT | `/api/v1/notificaciones/{id}/leida` | — | `NotificacionResponseDTO` | 200 | 401; 404 "Notificación no encontrada" (inferido) | Marca una notificación como leída. `PUT`, no `PATCH` como dice la guía — ver §4 |
| GET | `/api/v1/notificaciones/no-leidas/contador` | — | `Long` (dentro de `data`) | 200 | 401 | Contador para el badge de polling |

**`NotificacionResponseDTO`**: `id: Integer`, `mensaje: String`, `leida: boolean`, `fechaCreacion: LocalDateTime`.

---

### 1.10 PedidoController — `/api/v1/pedidos`
Rol: `/cliente/**` → **CLIENTE**; `/comercio/**` → **COMERCIO**

| Método | Path | DTO request | DTO response | Status explícito | Status inferido | Negocio |
|---|---|---|---|---|---|---|
| POST | `/api/v1/pedidos/cliente` | `PedidoRequestDTO` | `PedidoResponseDTO` | 201 | 400; 401/403; 409 "carrito vacío"/"comercio no ofrece delivery"/"...no permite retiro"/"dirección obligatoria para domicilio" (inferido de `PedidoService`); 404 "Dirección no encontrada" (inferido) | Confirma pedido desde el carrito, nace `PENDIENTE`. Path real `/pedidos/cliente`, no `POST /pedidos` como dice la guía — ver §4 |
| GET | `/api/v1/pedidos/cliente` | — | `List<PedidoResponseDTO>` | 200 | 401/403 | Lista pedidos del cliente autenticado |
| GET | `/api/v1/pedidos/comercio` | — | `List<PedidoResponseDTO>` | 200 | 401/403 | Lista pedidos recibidos por el comercio |
| PUT | `/api/v1/pedidos/comercio/{id}/aceptar` | — | `PedidoResponseDTO` | 200 | 401/403; 404 "Pedido no encontrado" (inferido); 409 "El pedido ya fue resuelto, no está en estado PENDIENTE" (inferido) | Comercio acepta pedido pendiente → `EN_PREPARACION`. Reemplaza el único `PATCH /resolucion` de la guía por 2 endpoints — ver §4 |
| PUT | `/api/v1/pedidos/comercio/{id}/rechazar` | `RechazoPedidoRequestDTO` | `PedidoResponseDTO` | 200 | 400; 401/403; 404 (inferido); 409 "ya fue resuelto" (inferido) | Comercio rechaza pedido pendiente con motivo |

**`PedidoRequestDTO`**: `tipoEntrega: TipoEntrega` (`@NotNull`), `direccionId: Integer` (sin Bean Validation — condicionalmente obligatorio si `tipoEntrega=DOMICILIO`, validado en `PedidoService`).

**`RechazoPedidoRequestDTO`**: `motivo: MotivoRechazo` (`@NotNull`), `comentario: String` (`@Size(max=500)`).

**`PedidoResponseDTO`**: `id: Integer`, `clienteId: Integer`, `comercioId: Integer`, `estado: EstadoPedido`, `tipoEntrega: TipoEntrega`, `direccion: DireccionResponseDTO` (anidado, solo si `DOMICILIO`), `motivoRechazo: MotivoRechazo` (nulo salvo `RECHAZADO`), `comentarioRechazo: String` (nulo salvo `RECHAZADO`), `fechaCreacion: LocalDateTime`, `detalles: List<DetallePedidoResponseDTO>`, `total: BigDecimal`.

**`DetallePedidoResponseDTO`**: `productoId: Integer`, `nombreProducto: String`, `precioUnitario: BigDecimal`, `cantidad: Integer`, `subtotal: BigDecimal`, `nota: String`.

---

### 1.11 ProductoController — `/api/v1/productos`
Rol: **COMERCIO** (path prefix)

| Método | Path | DTO request | DTO response | Status explícito | Status inferido | Negocio |
|---|---|---|---|---|---|---|
| POST | `/api/v1/productos` | `ProductoRequestDTO` | `ProductoResponseDTO` | 201 | 400; 401/403 | Alta de producto (nace `DISPONIBLE`) |
| PUT | `/api/v1/productos/{id}` | `ProductoRequestDTO` | `ProductoResponseDTO` | 200 | 400; 401/403; 409 "No se puede editar un producto descontinuado" (inferido) | Edita producto propio |
| GET | `/api/v1/productos` | — | `List<ProductoResponseDTO>` | 200 | 401/403 | Lista productos del comercio autenticado (todos los estados) |
| PATCH | `/api/v1/productos/{id}/estado` | `CambioEstadoProductoRequestDTO` | `ProductoResponseDTO` | 200 | 400; 401/403 | Cambia estado (`DISPONIBLE`/`AGOTADO`/`DESCONTINUADO`) según máquina de transiciones válidas |
| POST | `/api/v1/productos/{id}/cloudinary/firma` | — | `CloudinarySignatureResponseDTO` | 200 | 401/403; 409 límite de imágenes (inferido de `CloudinaryService`) | Genera firma de subida para una imagen de galería |
| POST | `/api/v1/productos/{id}/imagenes` | `ImagenProductoRequestDTO` | `ImagenProductoResponseDTO` | 201 | 400; 401/403; 409 límite de 5 imágenes (inferido de `ProductoService`) | Agrega imagen a la galería (máx. 5) |
| DELETE | `/api/v1/productos/{id}/imagenes/{imagenId}` | — | `Void` | 200 | 401/403; 404 "Imagen no encontrada" (confirmado) | Elimina imagen de la galería |
| PATCH | `/api/v1/productos/{id}/imagenes/{imagenId}/principal` | — | `ImagenProductoResponseDTO` | 200 | 401/403; 404 "Producto no encontrado" (confirmado) | Marca una imagen como principal (desmarca la anterior) |

**`ProductoRequestDTO`**: `nombre: String` (`@NotBlank @Size(max=150)`), `descripcion: String` (`@Size(max=2000)`), `precio: BigDecimal` (`@NotNull @Positive @Digits(integer=8, fraction=2)`), `categoriaId: Integer` (`@NotNull`), `tagIds: List<Integer>` (sin validación).

**`CambioEstadoProductoRequestDTO`**: `estado: EstadoProducto` (`@NotNull`).

**`ImagenProductoRequestDTO`**: `url: String` (`@NotBlank @ValidarUrlCloudinary @Pattern(regexp="(?i).*\.(jpg|jpeg|png|webp)$")`), `orden: Integer` (`@NotNull @PositiveOrZero`), `esPrincipal: boolean` (sin validación, primitivo).

(`ProductoResponseDTO`/`ImagenProductoResponseDTO` ya definidos en §1.4.)

---

### 1.12 TagController — `/api/v1/tags`
Rol: **ADMINISTRADOR** (path prefix) — estructura idéntica a `CategoriaController`

| Método | Path | DTO request | DTO response | Status explícito | Status inferido | Negocio |
|---|---|---|---|---|---|---|
| POST | `/api/v1/tags` | `TagRequestDTO` | `TagResponseDTO` | 201 | 400; 401/403; 409 "Ya existe un tag con ese nombre" (confirmado) | Alta de tag |
| PUT | `/api/v1/tags/{id}` | `TagRequestDTO` | `TagResponseDTO` | 200 | 400; 401/403; 404 (inferido genérico); 409 nombre duplicado (confirmado) | Edición de tag |
| GET | `/api/v1/tags` | — | `List<TagResponseDTO>` | 200 | 401/403 | Lista todos los tags |
| DELETE | `/api/v1/tags/{id}` | — | `Void` | 200 | 401/403; 404 (inferido genérico) | Baja lógica de tag — **sin bloqueo si tiene productos asociados**, ver §7 |
| PUT | `/api/v1/tags/{id}/reactivar` | — | `TagResponseDTO` | 200 | 401/403; 404 (inferido genérico) | Reactiva tag dado de baja |

**`TagRequestDTO`**: `nombre: String` (`@NotBlank @Size(max=100)`).

**`TagResponseDTO`**: `id: Integer`, `nombre: String`, `activo: boolean`.

---

### 1.13 TestController (solo perfil `test`, fuera del contrato de producción)

`@Profile("test")` — Spring nunca registra el bean/ruta fuera de ese perfil, sin importar que `/api/v1/test/**` figure en `RUTAS_PUBLICAS` de `SecurityConfig`.

| Método | Path | Response | Negocio |
|---|---|---|---|
| GET | `/api/v1/test/token-verificacion?email=` | `ApiResponse<String>` | Token de verificación de email pendiente (bypass de SMTP para testing) |
| GET | `/api/v1/test/token?email=&tipo=` | `ApiResponse<String>` | Token pendiente para cualquier `TipoToken` (generalizado en Fase 14) |

---

### 1.14 Catálogo de anotaciones de validación custom

| Anotación | Target | Mensaje default | ¿En uso? |
|---|---|---|---|
| `@ValidarCuit` | FIELD | "CUIT inválido" | Sí — `RegistroComercioRequestDTO.cuit` |
| `@ValidarDni` | FIELD | "DNI inválido" | Sí — `RegistroClienteRequestDTO.dni` |
| `@ValidarTelefonoArgentino` | FIELD | "Teléfono inválido" | Sí — 3 DTOs |
| `@ValidarNombrePropio` | FIELD | "Debe contener solo letras, espacios y guiones" | Sí — `RegistroClienteRequestDTO.nombre`/`apellido` |
| `@ValidarPasswordSegura` | FIELD | "La contraseña debe tener al menos 8 caracteres, una mayúscula y un número" | Sí — 4 DTOs |
| `@ValidarCodigoPostalArgentino` | FIELD | "Código postal inválido" | Sí — `DireccionRequestDTO.codigoPostal` |
| `@MayorDeEdad` | FIELD | "Debe ser mayor de 18 años" | Sí — `RegistroClienteRequestDTO.fechaNacimiento` |
| `@ValidarUrlCloudinary` | FIELD | "La URL debe pertenecer al dominio de Cloudinary" | Sí — 2 DTOs |
| `@DireccionExclusionMutua` | TYPE (clase) | "La dirección debe pertenecer a exactamente un cliente o un comercio, nunca a ambos ni a ninguno" | **No** — no está aplicada a ningún DTO real, ver §7 |

**Totales §1:** 51 endpoints de producción (+ 2 de `TestController`) en 11 Controllers, 37 DTOs (20 request + 17 response, incluye `ApiResponse<T>`), 9 anotaciones de validación custom.

---

## 2. Inventario de Entidades

24 archivos en `entities/`: 23 clases `@Entity` + 1 `@Embeddable` (`ProductoTagId`, sin tabla propia). 12 enums en `enums/`.

### Cadena de herencia real (vía `@MapsId`)

- **`Usuario`** (raíz) — `@Id @GeneratedValue(IDENTITY)`.
- **`Persona`** — `@Id` sin `@GeneratedValue`, `@OneToOne(LAZY)` a `Usuario` con `@MapsId` + `@JoinColumn(name="id")`.
- **`PersonaFisica`** / **`PersonaJuridica`** — mismo patrón, `@OneToOne(LAZY)` a `Persona` con `@MapsId` + `@JoinColumn(name="id")`.
- **`Cliente`** — `@OneToOne(LAZY)` a `PersonaFisica` con `@MapsId` → cadena completa `Usuario → Persona → PersonaFisica → Cliente`, mismo PK compartido en las 4 tablas.
- **`Administrador`** — idéntico patrón, `Usuario → Persona → PersonaFisica → Administrador`.
- **`Comercio`** — **NO sigue el patrón `@MapsId`** (ver hallazgo en §7): `@Id @GeneratedValue(IDENTITY)` propio, y `personaJuridica` es un `@OneToOne(LAZY) @JoinColumn(name="persona_juridica_id", nullable=false)` normal, sin `@MapsId`.

### Entidades

**Usuario** (`usuario`, raíz) — `id: Integer` (`@Id @GeneratedValue(IDENTITY)`), `email: String` (150, unique, not null), `passwordHash: String` (255, not null), `rol: RolUsuario` (`@Enumerated(STRING)`, not null), `estado: EstadoUsuario` (`@Enumerated(STRING)`, not null), `intentosFallidos: int`, `fechaRegistro: LocalDateTime` (not null, `updatable=false`), `fechaUltimoAcceso: LocalDateTime`, `fechaActualizacion: LocalDateTime`.

**Persona** (`persona`) — `id: Integer` (`@Id`, sin autogenerar), `usuario: Usuario` (`@OneToOne(LAZY) @MapsId @JoinColumn(name="id")`).

**PersonaFisica** (`persona_fisica`) — `id: Integer` (`@Id`), `persona: Persona` (`@OneToOne(LAZY) @MapsId`), `nombre: String` (100, not null), `apellido: String` (100, not null), `dni: String` (10, unique, not null), `fechaNacimiento: LocalDate` (not null), `telefono: String` (30, not null), `fechaModificacion: LocalDateTime`.

**PersonaJuridica** (`persona_juridica`) — `id: Integer` (`@Id`), `persona: Persona` (`@OneToOne(LAZY) @MapsId`), `razonSocial: String` (150, not null), `cuit: String` (11, unique, not null), `condicionIva: CondicionIva` (`@Enumerated(STRING)`, not null), `tipoSociedad: TipoPersonaJuridica` (`@Enumerated(STRING)`, not null), `domicilioFiscal: String` (255, not null), `fechaInicioActividades: LocalDate` (not null).

**Cliente** (`cliente`) — `id: Integer` (`@Id`), `personaFisica: PersonaFisica` (`@OneToOne(LAZY) @MapsId`). Referenciado desde `Direccion`, `Carrito`, `Pedido`.

**Comercio** (`comercio`) — `id: Integer` (`@Id @GeneratedValue(IDENTITY)`, **PK propia**), `personaJuridica: PersonaJuridica` (`@OneToOne(LAZY) @JoinColumn(name="persona_juridica_id", nullable=false)`, **sin `@MapsId`**), `nombre: String` (150, not null), `descripcion: String` (TEXT), `fotoPerfilUrl: String` (500), `telefono: String` (30, not null), `email: String` (150, not null), `tipoComercio: TipoComercio` (`@Enumerated(STRING)`, not null), `aceptaDelivery: boolean`, `aceptaRetiro: boolean`, `estado: EstadoComercio` (`@Enumerated(STRING)`, not null), `fechaRegistro: LocalDateTime` (not null, `updatable=false`), `fechaModificacion: LocalDateTime`. Referenciado desde `Producto`, `Carrito`, `Pedido`, `Direccion` (unique), `HistorialEstadoComercio`.

**Administrador** (`administrador`) — `id: Integer` (`@Id`), `personaFisica: PersonaFisica` (`@OneToOne(LAZY) @MapsId`). Referenciado desde `HistorialEstadoComercio.administrador`.

**Direccion** (`direccion`) — `id: Integer` (`@Id @GeneratedValue(IDENTITY)`), `calle: String` (150, not null), `numero: String` (10, not null), `pisoDepto: String` (30), `codigoPostal: String` (10, not null), `localidad: Localidad` (`@ManyToOne(LAZY)`, not null), `cliente: Cliente` (`@ManyToOne(LAZY)`, nullable), `comercio: Comercio` (`@OneToOne(LAZY)`, unique, nullable), `principal: boolean`, `eliminada: boolean`, `fechaCreacion: LocalDateTime` (not null), `fechaModificacion: LocalDateTime`, `fechaBaja: LocalDateTime`. `cliente`/`comercio` mutuamente excluyentes por diseño (no forzado por `@DireccionExclusionMutua`, ver §7).

**Provincia** (`provincia`) — `id: String` (`@Id`, 2, sin autogenerar — PK externa del ETL Georef), `nombre: String` (100, not null). Referenciada desde `Localidad`.

**Localidad** (`localidad`) — `id: String` (`@Id`, 15, sin autogenerar), `nombre: String` (150, not null), `provincia: Provincia` (`@ManyToOne(LAZY)`, not null).

**Token** (`token`) — `id: Integer` (`@Id @GeneratedValue(IDENTITY)`), `usuario: Usuario` (`@ManyToOne(LAZY)`, not null), `tipo: TipoToken` (`@Enumerated(STRING)`, not null), `token: String` (36, unique, not null), `fechaCreacion: LocalDateTime` (not null), `fechaVencimiento: LocalDateTime` (not null), `usado: boolean`, `fechaUso: LocalDateTime`.

**Categoria** (`categoria`) — `id: Integer` (`@Id @GeneratedValue(IDENTITY)`), `nombre: String` (100, unique, not null), `activo: boolean`, `fechaCreacion: LocalDateTime` (not null), `fechaModificacion: LocalDateTime`, `fechaBaja: LocalDateTime`. Referenciada desde `Producto.categoria`.

**Tag** (`tag`) — mismos campos que `Categoria` (`id`, `nombre` unique, `activo`, `fechaCreacion`, `fechaModificacion`, `fechaBaja`). Referenciada desde `ProductoTag.tag`.

**Producto** (`producto`) — `id: Integer` (`@Id @GeneratedValue(IDENTITY)`), `comercio: Comercio` (`@ManyToOne(LAZY)`, not null), `categoria: Categoria` (`@ManyToOne(LAZY)`, not null), `nombre: String` (150, not null), `descripcion: String` (TEXT), `precio: BigDecimal` (precision 10, scale 2, not null), `estado: EstadoProducto` (`@Enumerated(STRING)`, not null), `fechaCreacion: LocalDateTime` (not null), `fechaModificacion: LocalDateTime`, `fechaBaja: LocalDateTime`, `imagenes: List<ImagenProducto>` (`@OneToMany(mappedBy="producto", fetch=LAZY)`).

**ImagenProducto** (`imagen_producto`) — `id: Integer` (`@Id @GeneratedValue(IDENTITY)`), `producto: Producto` (`@ManyToOne(LAZY)`, not null), `url: String` (500, not null), `orden: Integer` (not null), `esPrincipal: boolean`.

**ProductoTag** (`producto_tag`, única entidad con `@EmbeddedId`) — `id: ProductoTagId` (`@EmbeddedId`), `producto: Producto` (`@ManyToOne(LAZY) @MapsId("productoId")`), `tag: Tag` (`@ManyToOne(LAZY) @MapsId("tagId")`).

**ProductoTagId** (`@Embeddable`, sin tabla propia) — `productoId: Integer`, `tagId: Integer` (ambos `@Setter` de campo, `@Getter`/`@Setter` de clase y `@EqualsAndHashCode` sin `of=` — consistente con no tener un `id` literal propio).

**Carrito** (`carrito`) — `id: Integer` (`@Id @GeneratedValue(IDENTITY)`), `cliente: Cliente` (`@OneToOne(LAZY)`, unique, not null — un carrito por cliente), `comercio: Comercio` (`@ManyToOne(LAZY)`, nullable).

**ItemCarrito** (`item_carrito`) — `id: Integer` (`@Id @GeneratedValue(IDENTITY)`), `carrito: Carrito` (`@ManyToOne(LAZY)`, not null), `producto: Producto` (`@ManyToOne(LAZY)`, not null), `cantidad: Integer` (not null), `nota: String` (255).

**Pedido** (`pedido`) — `id: Integer` (`@Id @GeneratedValue(IDENTITY)`), `cliente: Cliente` (`@ManyToOne(LAZY)`, not null), `comercio: Comercio` (`@ManyToOne(LAZY)`, not null), `direccion: Direccion` (`@ManyToOne(LAZY)`, nullable — retiro no requiere dirección), `tipoEntrega: TipoEntrega` (`@Enumerated(STRING)`, not null), `estado: EstadoPedido` (`@Enumerated(STRING)`, not null), `motivoRechazo: MotivoRechazo` (`@Enumerated(STRING)`, nullable), `comentarioRechazo: String` (500), `subtotal: BigDecimal` (precision 10, scale 2, not null), `fechaCreacion: LocalDateTime` (not null, `updatable=false`).

**DetallePedido** (`detalle_pedido`) — `id: Integer` (`@Id @GeneratedValue(IDENTITY)`), `pedido: Pedido` (`@ManyToOne(LAZY)`, not null), `producto: Producto` (`@ManyToOne(LAZY)`, not null), `cantidad: Integer` (not null), `precioUnitario: BigDecimal` (precision 10, scale 2, not null, `updatable=false` — snapshot inmutable), `nota: String` (255), `subtotal: BigDecimal` (precision 10, scale 2, not null).

**Notificacion** (`notificacion`) — `id: Integer` (`@Id @GeneratedValue(IDENTITY)`), `usuario: Usuario` (`@ManyToOne(LAZY)`, not null), `mensaje: String` (500, not null), `leida: boolean`, `fechaCreacion: LocalDateTime` (not null).

**Sesion** (`sesion`) — `id: Integer` (`@Id @GeneratedValue(IDENTITY)`), `usuario: Usuario` (`@ManyToOne(LAZY)`, not null), `activa: boolean`, `fechaInicio: LocalDateTime` (not null, `updatable=false`), `fechaCierre: LocalDateTime`, `tipoCierre: TipoCierreSesion` (`@Enumerated(STRING)`, nullable), `ipOrigen: String` (45, not null), `navegador: String` (255), `dispositivo: String` (255).

**HistorialEstadoComercio** (`historial_estado_comercio`) — `id: Integer` (`@Id @GeneratedValue(IDENTITY)`), `comercio: Comercio` (`@ManyToOne(LAZY)`, not null), `administrador: Administrador` (`@ManyToOne(LAZY)`, nullable), `estadoOrigen: EstadoComercio` (`@Enumerated(STRING)`, nullable), `estadoDestino: EstadoComercio` (`@Enumerated(STRING)`, not null), `motivo: String` (500), `fechaHora: LocalDateTime` (not null).

### Enums (12) — valores exactos

1. **CondicionIva**: `RESPONSABLE_INSCRIPTO`, `EXENTO`, `NO_INSCRIPTO`, `MONOTRIBUTO`, `RESPONSABLE_NACIONAL`
2. **EstadoComercio**: `PENDIENTE`, `APROBADO`, `RECHAZADO`, `SUSPENDIDO`, `INACTIVO`, `CERRADO_TEMPORALMENTE`
3. **EstadoPedido**: `PENDIENTE`, `EN_PREPARACION`, `RECHAZADO` (recortado a 3 valores para el MVP)
4. **EstadoProducto**: `DISPONIBLE`, `AGOTADO`, `DESCONTINUADO`
5. **EstadoUsuario**: `PENDIENTE`, `ACTIVO`, `BLOQUEADO`, `SUSPENDIDO`, `INACTIVO`
6. **MotivoRechazo** (con etiqueta legible): `SIN_STOCK` ("Sin stock"), `CERRADO` ("Comercio cerrado"), `ALTO_VOLUMEN_PEDIDOS` ("Alto volumen de pedidos"), `PRODUCTO_NO_DISPONIBLE_TEMPORAL` ("Producto no disponible temporalmente"), `SIN_DELIVERY_DISPONIBLE` ("Sin delivery disponible"), `PROBLEMA_TECNICO` ("Problema técnico"), `OTRO` ("Otro")
7. **RolUsuario**: `CLIENTE`, `COMERCIO`, `ADMINISTRADOR`
8. **TipoCierreSesion**: `MANUAL`, `AUTOMATICO`, `FORZADO`
9. **TipoComercio**: `RESTAURANTE`, `EMPRENDIMIENTO`
10. **TipoEntrega**: `DOMICILIO`, `RETIRO`
11. **TipoPersonaJuridica** (18 valores): `SA`, `SRL`, `SAS`, `SC`, `SCS`, `SCRL`, `SCSA`, `SCCS`, `CC`, `CS`, `CCSA`, `CA`, `SP`, `ST`, `ACP`, `EMP`, `EU`, `UTE`
12. **TipoToken**: `VERIFICACION_EMAIL`, `RECUPERACION_PASSWORD`, `REACTIVACION_CUENTA`

**Totales §2:** 23 entidades `@Entity` + 1 `@Embeddable`, 12 enums. Cero comentarios encontrados en `entities/` (cumple la regla §4.8 de `CLAUDE.md` sin excepción).

---

## 3. Inventario de Services

14 Services de producción (66 métodos públicos totales incluyendo `TestSupportService`; 64 en producción).

### AuthService
`@Transactional(noRollbackFor = CredencialesInvalidasException.class)` a nivel de clase.

| Método | Firma | Qué hace |
|---|---|---|
| login | `LoginResponseDTO login(LoginRequestDTO, String ipOrigen, String userAgent)` | Valida estado y password (lock pesimista), incrementa intentos fallidos si falla; en éxito resetea contador, cierra sesión previa, crea `Sesion` y emite JWT con `sesionId` |
| verificarEmail | `void verificarEmail(String token)` | Consume token `VERIFICACION_EMAIL`, `Usuario.estado → ACTIVO` |
| solicitarRecuperacionPassword | `void solicitarRecuperacionPassword(RecuperacionPasswordRequestDTO)` | Genera token `RECUPERACION_PASSWORD` (30 min), envía email |
| confirmarRecuperacionPassword | `void confirmarRecuperacionPassword(ConfirmarRecuperacionPasswordRequestDTO)` | Consume token, cambia password, resetea estado/intentos, fuerza cierre de sesión |
| cambiarPasswordDesdePerfil | `void cambiarPasswordDesdePerfil(Integer usuarioId, CambioPasswordPerfilRequestDTO)` | Valida password actual (lock pesimista), rechaza si nueva==actual, cierra sesión activa tras éxito |
| solicitarReactivacionCuenta | `void solicitarReactivacionCuenta(ReactivacionCuentaRequestDTO)` | Exige `estado==INACTIVO`, genera token `REACTIVACION_CUENTA` (24h) |
| confirmarReactivacionCuenta | `void confirmarReactivacionCuenta(String token)` | Consume token, `estado → ACTIVO` |
| logout | `void logout(Integer sesionId)` | Cierra la `Sesion` (`activa=false`, `tipoCierre=MANUAL`) |

### GeografiaService (sin `@Transactional`)
`listarProvincias(): List<ProvinciaResponseDTO>`; `listarLocalidadesPorProvincia(String provinciaId): List<LocalidadResponseDTO>`.

### EmailService (sin `@Transactional`)
`enviarVerificacion(String, String)`, `enviarRecuperacionPassword(String, String)`, `enviarReactivacionCuenta(String, String)` — todos `void`. Si el envío SMTP falla, se loguea `warn` y no se propaga.

### RegistroService (`@Transactional`)
`registrarCliente(RegistroClienteRequestDTO): UsuarioResponseDTO`; `registrarComercio(RegistroComercioRequestDTO): UsuarioResponseDTO`.

### CategoriaService (`@Transactional`)
`crear(CategoriaRequestDTO): CategoriaResponseDTO`; `editar(Integer, CategoriaRequestDTO): CategoriaResponseDTO`; `listar(): List<CategoriaResponseDTO>`; `baja(Integer): void`; `reactivar(Integer): CategoriaResponseDTO`.

### TagService (`@Transactional`)
Idéntica estructura a `CategoriaService`: `crear`, `editar`, `listar`, `baja`, `reactivar`.

### CarritoService (`@Transactional`)
`verCarrito(Integer usuarioId): CarritoResponseDTO`; `agregarItem(Integer, ItemCarritoRequestDTO): CarritoResponseDTO` (clamp de cantidad a 20); `actualizarCantidad(Integer, Integer itemId, Integer cantidad): CarritoResponseDTO`; `eliminarItem(Integer, Integer itemId): CarritoResponseDTO`; `vaciarCarrito(Integer): void`.

### PedidoService (`@Transactional`)
`confirmarPedido(Integer, PedidoRequestDTO): PedidoResponseDTO`; `aceptarPedido(Integer, Integer pedidoId): PedidoResponseDTO`; `rechazarPedido(Integer, Integer pedidoId, RechazoPedidoRequestDTO): PedidoResponseDTO`; `listarPedidosCliente(Integer): List<PedidoResponseDTO>`; `listarPedidosComercio(Integer): List<PedidoResponseDTO>`.

### AdministradorService (`@Transactional`)
`listarComerciosPendientes(): List<ComercioResponseDTO>`; `resolverAprobacion(Integer comercioId, Integer administradorId, AprobacionComercioRequestDTO): void` (registra fila en `HistorialEstadoComercio`).

### NotificacionService (`@Transactional`)
`crear(Integer usuarioId, String mensaje): void` (punto único de creación, trunca a 500 caracteres); `listar(Integer): List<NotificacionResponseDTO>`; `marcarLeida(Integer, Integer notificacionId): NotificacionResponseDTO`; `contarNoLeidas(Integer): long`.

### CatalogoService (sin `@Transactional` propio, delega)
`listarComerciosAprobados(): List<ComercioResponseDTO>`; `listarProductosDelComercio(Integer comercioId, Integer categoriaId, Integer tagId): List<ProductoResponseDTO>`.

### ProductoService (`@Transactional`)
`crearProducto(Integer, ProductoRequestDTO): ProductoResponseDTO`; `editarProducto(Integer, Integer productoId, ProductoRequestDTO): ProductoResponseDTO`; `listarProductosDelComercio(Integer): List<ProductoResponseDTO>`; `listarCatalogoDelComercio(Integer comercioId, Integer categoriaId, Integer tagId): List<ProductoResponseDTO>`; `cambiarEstado(Integer, Integer productoId, EstadoProducto): ProductoResponseDTO` (máquina de transiciones fija; limpia carritos y notifica si pasa a `AGOTADO`/`DESCONTINUADO`); `generarFirmaImagen(Integer, Integer productoId): CloudinarySignatureResponseDTO`; `agregarImagen(Integer, Integer productoId, ImagenProductoRequestDTO): ImagenProductoResponseDTO` (límite 5); `eliminarImagen(Integer, Integer productoId, Integer imagenId): void`; `marcarImagenPrincipal(Integer, Integer productoId, Integer imagenId): ImagenProductoResponseDTO`.

### ComercioService (`@Transactional`)
`verPerfil(Integer): ComercioResponseDTO`; `editarPerfil(Integer, ComercioPerfilRequestDTO): ComercioResponseDTO`; `generarFirmaFotoPerfil(Integer): CloudinarySignatureResponseDTO`; `actualizarFotoPerfil(Integer, FotoPerfilComercioRequestDTO): ComercioResponseDTO`; `listarAprobados(): List<ComercioResponseDTO>`; `buscarAprobadoPorId(Integer): ComercioResponseDTO`.

### CloudinaryService (sin `@Transactional`)
`generarFirmaImagenProducto(Integer comercioId, Integer productoId): CloudinarySignatureResponseDTO` (valida límite de 5 antes de firmar); `generarFirmaFotoPerfilComercio(Integer comercioId): CloudinarySignatureResponseDTO`. Upload Preset único (`bajonea_imagenes_mvp`) compartido.

### TestSupportService — exclusivo de `@Profile("test")`, no producción
`@Transactional(readOnly = true)`. `obtenerTokenVerificacionPendiente(String email): String`; `obtenerTokenPendiente(String email, TipoToken tipo): String`.

**Totales §3:** 14 Services de producción + 1 de testing = 15 clases, 66 métodos públicos totales (64 en producción). Único `@Transactional` con atributo no default: `noRollbackFor = CredencialesInvalidasException.class` en `AuthService`.

---

## 4. Desviaciones y decisiones documentadas

Citas textuales de `docs/DECISIONES.md`, orden cronológico.

**2026-07-17 — Enmienda formal de alcance del MVP (Fase 7): `Sesion`, recuperación de contraseña, bloqueo de cuenta, reactivación de cuenta**

> "La sección 0 de `GUIA-IMPLEMENTACION-MVP-BAJONEA.md` ('Decisiones cerradas de alcance del MVP') advierte explícitamente contra este patrón: *'Si en el camino aparece la tentación de agregar solo esto que ya está documentado en el proyecto completo, volver a este punto 0 primero.'* [...] la lista cerrada 'Roles y flujos incluidos' del MVP no menciona recuperación de contraseña, bloqueo ni reactivación; y la lista 'Entidades que NO entran al MVP' nombra `Sesion` explícitamente [...] La autenticación del MVP fue definida ahí como *'JWT (jjwt) con rol embebido en el token. Sin sesiones server-side'* — decisión cerrada, no una laguna."

> "Decisión: se amplía el alcance del MVP de forma consciente y explícita (no como corrección de un olvido) para incluir estos 3 flujos, porque están definidos como requisito funcional cerrado desde el inicio del proyecto en `01. Análisis de Requerimientos/04. Requisitos Funcionales/requisitos-funcionales-generales.md` [...] Un JWT puramente stateless no puede cumplir el requisito de invalidar sesiones activas de forma real [...], así que la reincorporación de `Sesion` es una consecuencia técnica directa de aceptar estos 3 flujos, no un agregado aparte."

> "Qué queda explícitamente fuera, incluso con esta enmienda: `HistorialEstadoUsuario` / `HistorialEstadoComercio` — sin tabla de auditoría de transiciones [...] Suspensión de cuenta/comercio por Administrador — sigue sin ningún endpoint ni lógica. El job periódico de inactivación automática por 3 meses sin actividad — sigue sin implementarse."

**2026-07-17 — `HistorialEstadoComercio` reincorporada (Fase 8.3)**

> "Segunda reincorporación de una entidad 'que no entra al MVP' según la sección 0 de la guía (mismo criterio que `Sesion` en Fase 7) [...] motivada porque `AdministradorService.resolverAprobacion` necesita persistir el motivo de rechazo de un `Comercio`, y el diccionario completo **eliminó** `Comercio.motivo_rechazo` en v1.1 a favor de centralizarlo en `HistorialEstadoComercio.motivo`: no existía una alternativa fiel al modelo que no fuera reincorporar la tabla."

**2026-07-17 — `PedidoService`/`PedidoController` implementados (origen de la desviación de paths de Pedido)**

> "Decisiones no explicitadas por la guía, resueltas con criterio propio: Dos endpoints separados (`/aceptar`, `/rechazar`) en vez de un único `resolverPedido` con `aceptar: boolean` — mismo criterio de nombrado `<Acción><Recurso>RequestDTO` ya establecido [...] para `RechazoPedidoRequestDTO`."

**2026-07-18 — Deviaciones de path/verbo HTTP confirmadas como decisión de diseño**

> "Deviaciones de `AdministradorController`/`PedidoController`/`NotificacionController`: confirmadas como decisión de diseño definitiva, no como pendiente de renombrar — ninguna se toca. Motivo: ya estaban justificadas en el momento en que se construyó cada Controller (no accidentes de esta sesión), y no existe ningún consumidor real (Postman, frontend) todavía construido que dependa del path literal de la guía, así que renombrar ahora no evita romper nada existente, solo generaría trabajo sin beneficio."

(La tabla exacta guía↔real↔motivo de las 3 desviaciones — `/resolver` vs `/resolucion`, `POST /pedidos` vs `POST /pedidos/cliente`, `PATCH .../resolucion` vs `PUT .../aceptar`+`PUT .../rechazar`, `PATCH /leida` vs `PUT /leida` — vive formalmente en `CLAUDE.md` §7bis.)

**2026-07-18 — Regla transversal 9 de `CLAUDE.md` (evidencia real obligatoria por sub-punto de fase)**

> "Regla transversal nueva en `CLAUDE.md` §4, punto 9 [...]: ninguna fase se da por cerrada ni se avanza a la siguiente sin que todos los sub-puntos de su sección en la guía tengan evidencia real en `docs/DECISIONES.md` — `BUILD SUCCESS` no alcanza para puntos de comportamiento, y cualquier sub-punto diferido a propósito tiene que quedar explícito con destino a otra fase, nunca como omisión silenciosa."

**2026-07-18 — Fase 10 (SMTP real) en pausa, no cancelada**

> "Decisión: Fase 10 queda formalmente en pausa, no cerrada y no salteada — mismo criterio que la regla transversal 9 de `CLAUDE.md` exige para cualquier punto diferido (destino explícito, no omisión silenciosa)."

**2026-07-19 — Fase 15 cerrada: catálogo de pantallas Figma cruzado contra el alcance real del MVP**

> "Direcciones de cliente (`C39`/`C40`/`C41`): el diccionario completo describe direcciones de cliente en plural, pero `CLAUDE.md` §1 excluye explícitamente 'múltiples direcciones de cliente' y el modelo real tiene exactamente 1 `Direccion` por cliente, fijada en el registro, sin endpoint de edición. Decisión: excluir `C39`/`C40` (implican lista); mantener `C41` renombrada a 'Editar mi dirección' (singular), pendiente de construir en Fase 16."

> "Dashboard de Comercio operando (`CO03`/`CO05`) [...] Esto es un hueco real de diseño, no una pantalla mal clasificada — el usuario pidió explícitamente la especificación funcional en vez de forzar una pantalla existente a cumplir ese rol."

> "Pendiente explícito para la Fase 16 (no bloquea el cierre de la Fase 15): construir un `ClienteController` (perfil + edición de la única dirección) para respaldar `C37`/`C38`/`C41`; diseñar `CO33` desde cero según la especificación funcional de arriba." — confirma que **`ClienteController` todavía no existe** (0 resultados por grep).

---

## 5. Qué NO existe todavía

> Los 5 documentos de requisitos funcionales describen el **proyecto completo**, no el MVP recortado. La mayoría de los `NO EXISTE` son exclusiones de alcance ya documentadas en `CLAUDE.md` §1/§5, no bugs.

| Ítem | Estado | Evidencia |
|---|---|---|
| Gestión de reclamos | **NO EXISTE** | Sin entidad `Reclamo`, sin Controller. Excluido en `CLAUDE.md` §1/§5 |
| Suspensión de comercio por Administrador | **NO EXISTE** | `AdministradorController` solo tiene `GET /comercios/pendientes` y `PUT .../resolver`. Excluido en `CLAUDE.md` §1 |
| Suspensión de cliente por Administrador | **NO EXISTE** | No existe `ClienteController` en absoluto. Excluido en `CLAUDE.md` §1 |
| Configuración de tarifas/comisiones | **NO EXISTE** | Sin `ConfiguracionTarifa`, sin campos de cargo de servicio en `Pedido`/`DetallePedido`. Excluido en `CLAUDE.md` §5 |
| Soporte / mesa de ayuda | **NO EXISTE** | Sin entidad `Soporte`, sin Controller. Excluido en `CLAUDE.md` §5 |
| MercadoPago (vinculación, webhooks, pagos) | **NO EXISTE** | Sin `CuentaMercadoPago`/`Pago`/`NotaCredito`. `Pedido` nace directo `PENDIENTE` (sin `PENDIENTE_PAGO`). Excluido en `CLAUDE.md` §1 |
| Notificaciones push (fuera de in-app/polling) | **EXISTE PARCIALMENTE** | `NotificacionController` cubre solo in-app por polling (5 sitios reales de creación); sin canal push/email para pedidos |
| Timers/jobs automáticos | **NO EXISTE** | `grep -r "@Scheduled"` → 0 resultados en todo el backend. Excluido en `CLAUDE.md` §1 |
| Reactivación de cuenta | **EXISTE** | `POST /api/v1/auth/reactivar-cuenta` + `GET .../confirmar/{token}`, ambos públicos, probados end-to-end (Fase 7) |
| Múltiples direcciones de cliente | **NO EXISTE** | Exactamente 1 `Direccion` por cliente, fijada en el registro, sin endpoint propio de edición (no existe `ClienteController`). Excluido en `CLAUDE.md` §1 |
| Horarios de atención granulares de comercio | **NO EXISTE** | Sin relación a franjas horarias en el modelo MVP. Excluido en `CLAUDE.md` §1 |
| Historial de estados de usuario/pedido | **NO EXISTE** | Sin `HistorialEstadoUsuario` ni `HistorialEstadoPedido` (solo existe `HistorialEstadoComercio`). Excluido en `CLAUDE.md` §5 |
| Listado general de comercios/clientes por Administrador (no solo pendientes) | **NO EXISTE** | `AdministradorController` solo expone `GET /comercios/pendientes` — hueco real de backend, no exclusión de alcance, señalado como pendiente de Fase 16 |
| Búsqueda/filtro global de comercios/productos | **NO EXISTE** | `CatalogoController` solo filtra dentro del menú de un comercio ya elegido (`categoriaId`/`tagId`), sin buscador global por texto |
| Cancelación de pedido por el cliente / estados `EN_CAMINO`, `LISTO_PARA_RETIRAR`, `ENTREGADO`, `CANCELADO`, `EXPIRADO`, `ANULADO` | **NO EXISTE** | `EstadoPedido` recortado a 3 valores (`PENDIENTE`, `EN_PREPARACION`, `RECHAZADO`). `PedidoController` sin endpoint de cancelar ni flujo de entrega |
| CRUD de Categoría/Tag (Administrador) | **EXISTE PARCIALMENTE** | 5 endpoints cada uno, probados end-to-end; pero la baja lógica no bloquea si la categoría/tag tiene productos asociados (ese sub-requisito puntual no está implementado) |
| Cloudinary: galería de producto + foto de perfil de comercio | **EXISTE** | 4 endpoints en `ProductoController` + 2 en `ComercioController`, Fase 11 cerrada, probado contra cuenta Cloudinary real |
| Carrito simplificado | **EXISTE** | 5 endpoints, `hasRole("CLIENTE")`, probado end-to-end |
| Verificación de cuenta por token + email real | **EXISTE PARCIALMENTE** | Lógica y endpoint completos; envío SMTP real en pausa (Fase 10, dominio `bajonea.ar` sin activar) — probado hoy vía bypass `@Profile("test")` |

**Resumen:** los 11 Controllers de producción cubren íntegramente el alcance MVP de `CLAUDE.md` §1. Los `NO EXISTE` corresponden a exclusiones de alcance ya documentadas, salvo dos huecos reales de backend aún sin construir y ya identificados por el propio equipo: **`ClienteController`** (perfil/dirección propia del Cliente) y el **listado general de comercios/clientes por Administrador** — ambos pendientes explícitos de Fase 16.

---

## 6. Roles y seguridad

Fuente: `SecurityConfig.java`. Ningún Controller usa `@PreAuthorize` — toda la autorización vive acá.

**Paths públicos (`permitAll`)**
```
/api/v1/auth/registro/**
/api/v1/auth/login
/api/v1/auth/verificar/**
/api/v1/auth/recuperar-password
/api/v1/auth/recuperar-password/confirmar
/api/v1/auth/reactivar-cuenta
/api/v1/auth/reactivar-cuenta/confirmar/**
/api/v1/catalogo/**
/api/v1/geografia/**
/api/v1/health
/swagger-ui.html
/swagger-ui/**
/v3/api-docs/**
/error
/api/v1/test/**   (solo alcanzable si spring.profiles.active=test)
```

**Reglas por rol (`hasRole`)**

| Prefijo | Rol |
|---|---|
| `/api/v1/productos/**` | `COMERCIO` |
| `/api/v1/comercios/**` | `COMERCIO` |
| `/api/v1/categorias/**` | `ADMINISTRADOR` |
| `/api/v1/tags/**` | `ADMINISTRADOR` |
| `/api/v1/administrador/**` | `ADMINISTRADOR` |
| `/api/v1/carrito/**` | `CLIENTE` |
| `/api/v1/pedidos/cliente/**` | `CLIENTE` |
| `/api/v1/pedidos/comercio/**` | `COMERCIO` |

**Solo autenticado, sin rol específico (`anyRequest().authenticated()`)**: cualquier ruta no cubierta arriba — en la práctica, `POST /api/v1/auth/cambiar-password`, `POST /api/v1/auth/logout` y todo `/api/v1/notificaciones/**` (ambos roles Cliente/Comercio son destinatarios de notificaciones, por eso sin restricción de rol específica).

**Otros detalles de `SecurityConfig`:**
- `SessionCreationPolicy.STATELESS` — sobre el `HttpSession`/cookie de servlet de Spring Security; no tiene relación con la tabla `Sesion` propia de la app, validada por `JwtAuthenticationFilter` en cada request contra `Sesion.activa`.
- CORS: `allowedOriginPatterns=["*"]`, métodos `GET/POST/PUT/PATCH/DELETE/OPTIONS`, headers `["*"]`, `allowCredentials=true`, sobre `/**`.
- CSRF deshabilitado.
- `CustomAuthenticationEntryPoint` (401) y `CustomAccessDeniedHandler` (403) propios — ambos devuelven `ApiResponse`, no el default de Spring.
- `/error` público a propósito: sin esta entrada, una excepción no cubierta por `GlobalExceptionHandler` en un endpoint público se enmascaraba como `401` (bug real corregido en Fase 8).
- `/swagger-ui.html` está separado de `/swagger-ui/**` porque springdoc lo registra como redirect propio, no subpath — sin esta entrada daba `401` (bug real corregido en Fase 13).
- `BCryptPasswordEncoder` como único bean `PasswordEncoder`.

---

## 7. Hallazgos de esta auditoría

Hallazgos objetivos del código real que valen la pena señalar antes de arrancar la Fase 16, no necesariamente bugs:

1. **`Comercio` no sigue el patrón `@MapsId` que `CLAUDE.md` describe para toda la jerarquía.** `CLAUDE.md` dice que la cadena es "Usuario → Persona → PersonaFisica/PersonaJuridica → Cliente/Administrador (vía PersonaFisica) y Comercio (vía PersonaJuridica), todo vía `@MapsId` encadenado". En el código, `Cliente` y `Administrador` sí comparten PK con `Usuario` vía `@MapsId` encadenado; **`Comercio` no** — tiene `@Id @GeneratedValue(IDENTITY)` propio y una FK normal (`persona_juridica_id`) a `PersonaJuridica`, sin `@MapsId`. Es una desviación real de lo documentado, no verificada como bug funcional (compila y pasa Flyway/Postman), pero relevante si la Fase 16 necesita razonar sobre el id de un Comercio.
2. **`@DireccionExclusionMutua` está definida en el catálogo de validaciones (§1.14) pero no se usa en ningún DTO real.** `DireccionRequestDTO` no la lleva — la exclusión mutua cliente/comercio queda garantizada estructuralmente por los dos flujos de registro separados que la contienen, no por Bean Validation.
3. **Baja lógica de Categoría/Tag sin bloqueo por uso.** `CategoriaService.baja`/`TagService.baja` no validan si hay `Producto`/`ProductoTag` asociados antes de dar de baja — el requisito funcional lo describe, pero no está implementado (§5).
4. **No existe `ClienteController`.** Confirmado por grep (0 resultados) y por la propia entrada de cierre de Fase 15 en `DECISIONES.md`. El Cliente no tiene endpoint de perfil ni de edición de su única dirección — pendiente explícito de Fase 16.
5. **Las 3 desviaciones de path/verbo HTTP** (`/resolver` vs `/resolucion`, `POST /pedidos/cliente` vs `POST /pedidos`, 2×`PUT` vs 1×`PATCH` en Pedido, `PUT` vs `PATCH` en Notificación) están confirmadas como decisión de diseño permanente — no son inconsistencias a corregir, ver §4.

---

## Resumen de completitud

- **Controllers:** 11 de producción, 51 endpoints documentados + 2 endpoints de `TestController` (perfil `test`, aparte).
- **DTOs:** 37 (20 request + 17 response, incluye `ApiResponse<T>`), con validaciones campo por campo.
- **Entidades:** 23 `@Entity` + 1 `@Embeddable` (`ProductoTagId`) = 24 clases en `entities/`, 12 enums.
- **Services:** 14 de producción (64 métodos públicos) + 1 de testing (`TestSupportService`, 2 métodos) = 66 métodos públicos totales.
- **Anotaciones de validación custom:** 9 catalogadas, 8 en uso real, 1 sin uso (`@DireccionExclusionMutua`).
