# Bajoneá — Memoria de proyecto

Bajoneá es una plataforma web de pedidos gastronómicos para Río Grande, Tierra del Fuego, con tres roles (Cliente, Comercio, Administrador); esta etapa implementa únicamente el **MVP** definido en la sección 0 de `GUIA-IMPLEMENTACION-MVP-BAJONEA.md` — no el proyecto completo.

Este archivo es la memoria persistente de proyecto para Claude Code. Se mantiene entre 300 y 500 líneas y se actualiza a medida que avanzan las fases. **No contiene el detalle histórico de decisiones** (eso vive en [docs/DECISIONES.md](docs/DECISIONES.md)) ni el detalle de columnas del modelo de datos (eso vive en `docs/modelo-mvp.md`, a generar en la Fase 2).

**Fuente de verdad del plan de implementación:** [docs/GUIA-IMPLEMENTACION-MVP-BAJONEA.pdf](docs/GUIA-IMPLEMENTACION-MVP-BAJONEA.pdf) (siempre revisar en esa ruta exacta). Este `CLAUDE.md` es un resumen operativo de esa guía, no un reemplazo — ante cualquier duda de secuencia o detalle de una fase, la guía completa manda.

---

## 1. Alcance del MVP (resumen — el detalle vinculante está en la sección 0 de la guía)

**SÍ entra al MVP:**
- Registro Cliente, Registro Comercio, Login (3 roles), Logout (3 roles).
- Verificación de cuenta por token real + email real vía SMTP.
- Aprobación/Rechazo de Comercio por Administrador.
- CRUD de Producto (Comercio) con galería de imágenes vía Cloudinary (hasta 5 imágenes, una principal).
- CRUD de Categoría y Tag (Administrador).
- Catálogo público de comercios y productos.
- Carrito simplificado: 1 registro por cliente, 1 comercio a la vez, sin expiración/timeout.
- Pedido simulado: nace directo en estado `PENDIENTE`, el comercio acepta o rechaza, se notifica in-app a cada parte.
- Direcciones con modelo completo (calle, número, piso/depto, código postal, localidad) y selector Provincia → Localidad dependiente, precargado por ETL desde la API Georef.
- Notificaciones solo in-app vía polling REST (sin email para pedidos).
- Autenticación JWT (jjwt) con rol embebido en el token. **Enmendado en la Fase 7** (ver `docs/DECISIONES.md`, entrada del 2026-07-17 "Enmienda formal de alcance del MVP"): dejó de ser puramente stateless — incorpora tabla `Sesion` (reincorporada del diccionario completo) y claim `sesionId` en el JWT, para poder invalidar sesiones de forma real en recuperación de contraseña, bloqueo de cuenta y login concurrente. `SessionCreationPolicy.STATELESS` de Spring Security se mantiene sin cambios (no hay `HttpSession`/cookie de servlet); lo que cambia es que ahora existe una tabla de sesión propia a nivel de aplicación, validada por `JwtAuthenticationFilter` en cada request.
- Recuperación de contraseña (token, 30 min), bloqueo de cuenta tras 3 intentos fallidos de login o de cambio de contraseña desde perfil, y reactivación de cuenta (token, 24hs) — los 3 sumados al MVP en la misma enmienda de la Fase 7. Sin tabla de historial de transiciones de estado (`HistorialEstadoUsuario`/`HistorialEstadoComercio` siguen fuera), sin suspensión por Administrador, sin job automático de inactivación por 3 meses.

**Explícitamente fuera del MVP:** MercadoPago/Pago, WhatsApp, reclamos, soporte, reembolsos, jobs de expiración/timeout, suspensión de comercio/cliente por Administrador, historial de estados (`HistorialEstadoUsuario`/`HistorialEstadoComercio`/`HistorialEstadoPedido`), múltiples direcciones de cliente, horarios de atención granulares, `PENDIENTE_PAGO`.

**Figma:** se define primero un checklist cerrado de 17 pantallas (Fase 15) y recién con eso aprobado se diseña — no se tocan las ~100 pantallas del proyecto completo.

---

## 2. Stack tecnológico

- **Backend:** Java 21, Spring Boot 3.x, Maven.
- **Persistencia:** MySQL + Flyway (`ddl-auto=validate`, nunca `update`/`create` — el esquema lo gestiona exclusivamente Flyway). Inspección visual vía phpMyAdmin.
- **Seguridad:** Spring Security + JWT (`jjwt`: api, impl, jackson), rol embebido en el token, `SessionCreationPolicy.STATELESS`.
- **Imágenes:** Cloudinary, subida firmada desde el frontend (el backend nunca recibe el binario).
- **Email:** Resend (API REST), vía `com.resend:resend-java`. Reemplaza a Brevo/SMTP (migración Fase 10, ver `docs/DECISIONES.md`, 2026-07-20) — `EmailService` ya no depende de `JavaMailSender`/Spring Mail.
- **Frontend:** HTML/CSS/JS vanilla (sin framework).
- **Documentación de API:** springdoc-openapi (Swagger UI).
- **Testing:** Postman (API) + Playwright (E2E).
- **Puerto:** `8080`, configurado explícitamente en `application.properties`. Nunca hardcodear el puerto en otro lugar.

---

## 3. Estructura de paquetes del backend (Fase 3)

```
com.bajonea.backend/
├── BajoneaApplication.java
├── config/
│   ├── security/
│   │   ├── SecurityConfig.java          <- cadena de filtros, reglas por endpoint
│   │   ├── JwtAuthenticationFilter.java
│   │   └── JwtService.java              <- generar/validar/parsear el token
│   ├── OpenApiConfig.java
│   ├── MailConfig.java                   <- bean del cliente Resend con la API key (Fase 10)
│   └── CloudinaryConfig.java            <- bean del cliente Cloudinary con credenciales
├── enums/                                <- HERMANO de entities/, no adentro (ajustado en la Fase 3)
│   ├── RolUsuario.java
│   ├── EstadoUsuario.java
│   ├── EstadoComercio.java
│   ├── EstadoProducto.java
│   ├── EstadoPedido.java
│   ├── TipoEntrega.java
│   ├── TipoToken.java                    <- ampliado a 3 valores en la Fase 7 (ver docs/DECISIONES.md)
│   ├── TipoCierreSesion.java             <- agregado en la Fase 7 junto con Sesion
│   ├── MotivoRechazo.java
│   ├── CondicionIva.java
│   ├── TipoPersonaJuridica.java
│   └── TipoComercio.java
├── validation/                           <- agregado en la Fase 3, no estaba en el plan original
│   ├── annotations/                      <- @interface custom (ej. @ValidarCuit)
│   └── validators/                       <- ConstraintValidator correspondientes
├── dto/
│   ├── request/
│   │   ├── RegistroClienteRequestDTO.java
│   │   ├── RegistroComercioRequestDTO.java
│   │   ├── DireccionRequestDTO.java     <- calle, numero, pisoDepto, codigoPostal, localidad
│   │   ├── LoginRequestDTO.java
│   │   ├── ProductoRequestDTO.java
│   │   ├── ImagenProductoRequestDTO.java <- url (post-Cloudinary), orden, esPrincipal
│   │   ├── CategoriaRequestDTO.java
│   │   ├── TagRequestDTO.java
│   │   ├── ItemCarritoRequestDTO.java
│   │   ├── PedidoRequestDTO.java
│   │   ├── RechazoPedidoRequestDTO.java
│   │   └── AprobacionComercioRequestDTO.java
│   └── response/
│       ├── ApiResponse.java             <- envoltorio estándar {mensaje, data}
│       ├── UsuarioResponseDTO.java
│       ├── DireccionResponseDTO.java
│       ├── ComercioResponseDTO.java
│       ├── ProductoResponseDTO.java
│       ├── ImagenProductoResponseDTO.java
│       ├── CategoriaResponseDTO.java
│       ├── TagResponseDTO.java
│       ├── CarritoResponseDTO.java
│       ├── PedidoResponseDTO.java
│       ├── NotificacionResponseDTO.java
│       ├── ProvinciaResponseDTO.java
│       ├── LocalidadResponseDTO.java
│       └── CloudinarySignatureResponseDTO.java <- firma de subida para el frontend
├── entities/
│   ├── Provincia.java
│   ├── Localidad.java
│   ├── Usuario.java
│   ├── PersonaFisica.java
│   ├── PersonaJuridica.java
│   ├── Cliente.java
│   ├── Comercio.java
│   ├── Administrador.java
│   ├── Direccion.java
│   ├── Token.java
│   ├── Categoria.java
│   ├── Tag.java
│   ├── Producto.java
│   ├── ImagenProducto.java
│   ├── ProductoTag.java
│   ├── Carrito.java
│   ├── ItemCarrito.java
│   ├── Pedido.java
│   ├── DetallePedido.java
│   ├── Notificacion.java
│   └── Sesion.java                       <- agregada en la Fase 7 (ver docs/DECISIONES.md)
├── repositories/         <- un XxxRepository por cada entidad de arriba (JpaRepository<Entidad, PK>)
├── services/
│   ├── AuthService.java
│   ├── RegistroService.java
│   ├── GeografiaService.java            <- listar provincias/localidades para los selectores
│   ├── ComercioService.java
│   ├── AdministradorService.java
│   ├── CategoriaService.java
│   ├── TagService.java
│   ├── ProductoService.java
│   ├── CatalogoService.java             <- delgado, delega en ComercioService/ProductoService
│   ├── CarritoService.java
│   ├── PedidoService.java
│   ├── NotificacionService.java
│   ├── EmailService.java
│   ├── CloudinaryService.java           <- generar firma de subida, validar límite de imágenes
│   └── TestSupportService.java          <- exclusivo del perfil `test` (Fase 14), atajo de token sin email real
├── controllers/
│   ├── HealthController.java            <- GET /api/v1/health, implementado en la Fase 3
│   ├── AuthController.java
│   ├── ComercioController.java
│   ├── AdministradorController.java
│   ├── CategoriaController.java
│   ├── TagController.java
│   ├── ProductoController.java
│   ├── CatalogoController.java          <- endpoints públicos de exploración
│   ├── GeografiaController.java         <- GET /provincias, GET /localidades?provinciaId=
│   ├── CarritoController.java
│   ├── PedidoController.java
│   ├── NotificacionController.java
│   └── TestController.java              <- exclusivo del perfil `test` (Fase 14), GET /test/token(-verificacion)
├── exceptions/
│   ├── GlobalExceptionHandler.java      <- @RestControllerAdvice
│   ├── RecursoNoEncontradoException.java
│   ├── ConflictoDeNegocioException.java
│   └── ValidacionException.java
└── mappers/              <- opcional; MVP usa mapeo manual en el Service, no MapStruct
```

**Separación de responsabilidades:** la lógica de negocio vive en `services/`; `repositories/` queda "tonto" (solo queries derivadas o `@Query`); `controllers/` queda aún más tonto (solo mapear HTTP ↔ DTO y delegar al service). Mapeo Entity↔DTO manual dentro del Service, no MapStruct — más explícito para este proyecto.

**Ajustes hechos durante la Fase 3** respecto al árbol original: `enums/` se implementó como paquete hermano de `entities/` (no `entities/enums/`), porque los enums no dependen de que las Entities existan y así quedan disponibles antes de la Fase 4. Se agregó además el paquete `validation/` (`annotations/` + `validators/`), no previsto en la estructura original de la guía, para las anotaciones de Bean Validation custom (ej. `@ValidarCuit`) que se van a usar en los DTOs de request a partir de la Fase 5 — nunca en las Entities de JPA.

Convenciones de nombres: Entities en singular (`Producto`), DTOs `<Entidad>RequestDTO` / `<Entidad>ResponseDTO`, Controllers con `@RequestMapping("/api/v1/<recurso-en-plural>")`.

### 3.1 Convención de respuesta HTTP estándar (Fase 3.3 de la guía)

```java
public class ApiResponse<T> {
    private String mensaje;
    private T data;
    // constructores, getters
}
```

Todo controller devuelve `ResponseEntity<ApiResponse<XxxResponseDTO>>` (o `ApiResponse<List<XxxResponseDTO>>` para listados). Nunca se expone la entidad, siempre DTO envuelto, y siempre hay `mensaje`.

---

## 4. Reglas transversales no negociables

Estas reglas se aplican siempre, sin excepción. Varias se refuerzan con hooks (ver `.claude/hooks/`, Anexo C de la guía) precisamente para no depender de que se recuerden en cada prompt.

1. **`List<T>` como colección por defecto** en toda la capa de servicios y repositorios. `Set<T>` solo con razón concreta (ej. evitar duplicados en `ProductoTag`), `Map` solo cuando el acceso es por clave. Cualquier excepción se justifica con un comentario breve en el código.
2. **Los controllers nunca devuelven una entidad JPA directamente.** Siempre un DTO de respuesta (`XxxResponseDTO`) envuelto en `ResponseEntity<ApiResponse<...>>`.
3. **Toda respuesta HTTP de mutación** (POST/PUT/PATCH/DELETE) devuelve un cuerpo con al menos un campo `mensaje` (clase `ApiResponse<T>` estándar), además del recurso si corresponde.
4. **Códigos de estado HTTP explícitos y semánticos**, nunca `200` por defecto para todo:
   - `201 Created` al crear.
   - `200 OK` para lecturas y actualizaciones.
   - `204 No Content` para eliminaciones sin cuerpo (en este proyecto se prioriza devolver `mensaje`, ver Fase 9 de la guía).
   - `400 Bad Request` para validaciones de entrada fallidas.
   - `401 Unauthorized` para token ausente/inválido.
   - `403 Forbidden` para rol sin permiso.
   - `404 Not Found` para recurso inexistente.
   - `409 Conflict` para violaciones de estado/regla de negocio (email duplicado, producto de otro comercio en el carrito, límite de imágenes superado, etc.).
5. **Nunca hardcodear el puerto** en ningún lado más que `application.properties`.
6. **Nunca commitear credenciales** (contraseña de MySQL, SMTP, `jwt.secret`, credenciales de Cloudinary) — siempre vía variables de entorno o `application-local.properties` ignorado por git.
7. **Convenciones Lombok en toda Entity JPA** (`entities/`, Fase 4 en adelante):
   - `@Getter` a nivel de clase.
   - `@Setter` **campo por campo, nunca a nivel de clase** (evita `@Data`, que generaría `equals`/`hashCode` sobre todos los campos con riesgo de recursión infinita en relaciones bidireccionales).
   - **El campo `id` nunca lleva `@Setter`, sin excepción**, ni en entidades con id autogenerado (`@GeneratedValue`) ni en las de id externo (ej. `Provincia`/`Localidad`, cargadas por el ETL de Fase 2bis). El resto de los campos sí llevan `@Setter` individual.
   - `@EqualsAndHashCode(of = "id")` explícito en toda entidad.
   - Esta regla aplica a **toda** entidad del proyecto, pasada, presente y futura — no es un caso puntual de ninguna entidad en particular.
   - **`ProductoTag` es la única entidad del proyecto con clave compuesta** (`@EmbeddedId` sobre `ProductoTagId`, con `@MapsId("productoId")`/`@MapsId("tagId")` en sus dos `@ManyToOne`). No es una inconsistencia con el resto de las entidades (todas con PK escalar `Integer`/`String`) — es el mapeo estándar de JPA para una tabla de unión N:M con atributos propios de la relación (`producto_tag`, PK compuesta `(producto_id, tag_id)`). `ProductoTagId` es un `@Embeddable`, no una `@Entity`: no tiene tabla propia, y como no tiene un campo literal `id`, sus dos campos (`productoId`, `tagId`) sí llevan `@Setter` individual sin violar la regla de "el campo `id` nunca tiene `@Setter`".
8. **Cero comentarios dentro de `entities/`**, sin excepción: nada de Javadoc de clase, nada de comentarios inline, nada de comentarios de campo. Las clases de `entities/` quedan autoexplicativas por nombre de clase, nombre de campo y anotaciones únicamente. Cualquier explicación de diseño (por qué un id no es autogenerado, por qué un campo no tiene setter, notas de alcance del modelo, etc.) vive en `CLAUDE.md` o en `docs/modelo-mvp.md`, nunca en el código de la entidad. Esta regla es exclusiva del paquete `entities/` — el resto del proyecto (`repositories/`, `services/`, `controllers/`, `dto/`, etc.) sigue documentándose con normalidad donde corresponda.
9. **Ninguna fase se da por cerrada, ni se avanza a la siguiente, sin que todos los sub-puntos de su sección en `GUIA-IMPLEMENTACION-MVP-BAJONEA.pdf` tengan evidencia real documentada en `docs/DECISIONES.md`.** "Evidencia real" significa: para un punto de comportamiento (una regla de negocio, una validación, un flujo completo), una prueba end-to-end contra la base real (`curl` + verificación de la fila resultante cuando aplica) — `./mvnw compile`/`BUILD SUCCESS` alcanza únicamente para puntos de sintaxis (que el código compile), nunca como sustituto de probar que el comportamiento es correcto. Si un sub-punto queda fuera de una fase a propósito (porque depende de infraestructura de una fase posterior, ej. Cloudinary real), tiene que quedar diferido **explícitamente**, con destino a la fase que lo va a cubrir — mismo formato ya usado para `LoginRequestDTO`/`RechazoPedidoRequestDTO`/`AprobacionComercioRequestDTO`/`ImagenProductoRequestDTO`/`CloudinarySignatureResponseDTO` (`docs/DECISIONES.md`, entrada "DTOs de auth y pedido/comercio diferidos..."). Nunca queda como omisión silenciosa — ni un sub-punto sin mencionar, ni un "ya probado" sin la prueba real detrás. Antes de cerrar una fase o dar por buena la anterior al pasar a la siguiente, repasar el checklist real de esa sección de la guía punto por punto, no solo lo que ya quedó escrito en `docs/DECISIONES.md` de sesiones previas.
10. **Un commit de Git por cada cierre formal de fase.** El repo vive en la raíz real del proyecto (`Bajoneá/`, no `03. Implementación/` — ver `git remote -v` para confirmar el remoto configurado), con un `.gitignore` de raíz que complementa a `backend/.gitignore` sin duplicar sus reglas (ver el propio `.gitignore` de raíz para el detalle). Cada vez que una fase pasa de 🔄/⬜ a ✅ en la tabla de §6 (incluida una reapertura puntual que vuelve a cerrar una fase ya cerrada, ej. Fase 8 el 2026-07-18), corresponde un commit local con un mensaje descriptivo del estado alcanzado — nunca se agrupan varias fases en un solo commit salvo que ya vinieran así de antes de esta regla (el commit inicial del 2026-07-18 agrupó las Fases 1-9 precisamente porque no existía ningún commit previo). Antes de cada commit: revisar `git status` para no arrastrar cambios fuera del alcance de la fase que se está cerrando (ver `docs/DECISIONES.md`, entrada del 2026-07-18 "Primer commit versionado del proyecto" — un archivo modificado de `01. Análisis de Requerimientos` quedó deliberadamente fuera del primer commit por este mismo criterio), y confirmar que ningún archivo con credenciales reales (`application-local.properties`, `.env`, o cualquier valor real de SMTP/Cloudinary/`JWT_SECRET`/password de MySQL) esté en el diff staged. Push a GitHub queda fuera de esta regla — es una decisión aparte que toma el usuario explícitamente, no automática por cierre de fase.

---

## 5. Las 20 entidades del modelo MVP

Detalle completo de columnas y relaciones en `docs/modelo-mvp.md` (a generar en la Fase 2). Acá solo el rol de cada una:

1. **Provincia** — catálogo estático de provincias argentinas, precargado por ETL desde Georef (Fase 2bis).
2. **Localidad** — catálogo estático de localidades, FK a Provincia, precargado por el mismo ETL.
3. **Usuario** — identidad base (email, password hash, rol, estado); Cliente/Comercio/Administrador cuelgan de acá.
4. **PersonaFisica** — datos de persona física (nombre, apellido, DNI); subtipo de Usuario vía `@MapsId`.
5. **PersonaJuridica** — datos de persona jurídica (razón social, CUIT); subtipo de Usuario vía `@MapsId`.
6. **Cliente** — rol de comprador, extiende PersonaFisica, tiene direcciones y carrito.
7. **Comercio** — rol de vendedor, extiende PersonaJuridica, tiene estado de aprobación y productos.
8. **Administrador** — rol de gestión interna, extiende PersonaFisica, sin registro público (se siembra por Flyway).
9. **Direccion** — modelo completo (calle, número, piso/depto, código postal, localidad), FK mutuamente excluyente a Cliente o Comercio.
10. **Token** — token de un solo uso; tipos `VERIFICACION_EMAIL`, `RECUPERACION_PASSWORD`, `REACTIVACION_CUENTA` (los 2 últimos sumados en la Fase 7, ver `docs/DECISIONES.md`).
11. **Categoria** — clasificación de productos, gestionada por el Administrador.
12. **Tag** — etiqueta libre de productos, gestionada por el Administrador.
13. **Producto** — ítem del catálogo de un Comercio, con precio y estado (disponible/agotado/descontinuado).
14. **ImagenProducto** — una fila por imagen de la galería de un Producto (hasta 5, una marcada como principal), URL provista por Cloudinary.
15. **ProductoTag** — tabla de relación N:M entre Producto y Tag.
16. **Carrito** — un registro por Cliente, atado a un único Comercio a la vez.
17. **ItemCarrito** — línea de producto + cantidad dentro de un Carrito.
18. **Pedido** — pedido confirmado por un Cliente a un Comercio, estado recortado a `PENDIENTE → ACEPTADO/RECHAZADO`.
19. **DetallePedido** — línea de producto + cantidad + precio snapshot (inmutable) dentro de un Pedido.
20. **Notificacion** — mensaje in-app para un usuario (leída/no leída), consumido por polling.
21. **Sesion** — historial de sesiones de un usuario; `activa=true` identifica la sesión vigente, consultada por `JwtAuthenticationFilter` en cada request. Reincorporada en la Fase 7 mediante enmienda formal de alcance (ver `docs/DECISIONES.md` y `docs/modelo-mvp.md` nota de alcance 12) — habilita invalidar sesiones de forma real en bloqueo, recuperación de contraseña y login concurrente, algo que un JWT puramente stateless no puede cumplir.
22. **HistorialEstadoComercio** — registro histórico append-only de las transiciones de `Comercio.estado`, con motivo obligatorio en rechazo. Reincorporada en la Fase 8 con el mismo criterio que `Sesion` (ver `docs/DECISIONES.md` y `docs/modelo-mvp.md` nota de alcance 13) — única fuente fiel al modelo para el motivo de rechazo, ya que el diccionario completo eliminó `Comercio.motivo_rechazo` en v1.1 a favor de esta tabla.

**Entidades del modelo completo que NO entran al MVP:** `HistorialEstadoUsuario`, `HistorialEstadoPedido`, `Soporte`, `Reclamo`, `ConfiguracionTarifa`, `CuentaMercadoPago`, `Pago`, `NotaCredito`.

---

## 5bis. Validaciones (Fase 5 en adelante)

Todas viven en `validation/` (`validation/annotations/` + `validation/validators/`), hermano de `entities/` (ver §3). Se aplican **solo en `dto/request/`**, nunca en las Entities. Detalle completo, con guía de dónde aplicar cada una, en [.claude/skills/skill-validaciones/SKILL.md](.claude/skills/skill-validaciones/SKILL.md) — acá solo el catálogo y la regla general.

**Regla general:** usar `jakarta.validation` estándar (`@NotBlank`, `@NotNull`, `@Email`, `@Size`, `@Pattern`, `@Positive`, `@PositiveOrZero`, `@Past`, `@PastOrPresent`, `@Future`, `@Min`, `@Max`, `@Digits`) directo en el campo siempre que alcance. Crear/usar una anotación custom **únicamente** cuando hace falta lógica real que un `@Pattern` no resuelve (dígito verificador, normalización, coherencia entre campos, regla de negocio).

**Las 9 anotaciones custom del catálogo** (target `FIELD` salvo la última, que es `TYPE`):

1. `@ValidarCuit` — CUIT, 11 dígitos + dígito verificador módulo 11 (AFIP).
2. `@ValidarDni` — DNI, 7-8 dígitos, rango [1.000.000, 99.999.999].
3. `@ValidarTelefonoArgentino` — teléfono argentino, tolerante a +54/9/0/15.
4. `@ValidarNombrePropio` — nombre/apellido, solo letras Unicode + espacios + guiones.
5. `@ValidarPasswordSegura` — mínimo 8 caracteres, 1 mayúscula, 1 número (sin símbolo).
6. `@ValidarCodigoPostalArgentino` — 4 dígitos clásico o CPA alfanumérico de 8.
7. `@MayorDeEdad` — sobre `LocalDate`, 18 años o más.
8. `@ValidarUrlCloudinary` — esquema `https` + host `res.cloudinary.com`.
9. `@DireccionExclusionMutua` — nivel de clase, exactamente uno de `clienteId`/`comercioId`.

**Aplicado en Fase 5** (tanda "cadena de identidad", ver `docs/DECISIONES.md`): los campos de `PersonaFisica` + `Usuario` no tienen DTO propio — se plegaron en `RegistroClienteRequestDTO` (`dto/request/`), el body real de `POST /api/v1/auth/registro/cliente`, con `@ValidarNombrePropio` (`nombre`, `apellido`), `@ValidarDni` (`dni`), `@Past` + `@MayorDeEdad` (`fechaNacimiento`), `@ValidarTelefonoArgentino` (`telefono`), `@Email` + `@NotBlank` (`email`), `@ValidarPasswordSegura` (`password`). Todavía sin el campo `direccion` (se agrega cuando exista `DireccionRequestDTO`). `UsuarioResponseDTO` (`id`, `email`, `rol`, `estado`, sin password) ya generado.

**Aplicado en Fase 5** (tanda de Comercio): `PersonaJuridica` tampoco tiene DTO propio — sus campos se plegaron en `RegistroComercioRequestDTO` (`dto/request/`), el body real de `POST /api/v1/auth/registro/comercio`, con `@ValidarCuit` (`cuit`), `@NotBlank` + `@Size` (`razonSocial`, `domicilioFiscal`, `nombre`), `@PastOrPresent` (`fechaInicioActividades`), `@ValidarTelefonoArgentino` (`telefono`), `@ValidarPasswordSegura` (`password`), `@Email` (`email` de login y `emailContacto` público del comercio, a propósito distintos), `@Valid` anidado sobre `DireccionRequestDTO`.

**Aplicado en Fase 11** (galería de producto + foto de perfil de comercio, vía Cloudinary): `ImagenProductoRequestDTO` (`url` con `@NotBlank` + `@ValidarUrlCloudinary`, `orden` con `@NotNull` + `@PositiveOrZero`, `esPrincipal` sin validación por ser `boolean` primitivo) y `FotoPerfilComercioRequestDTO` (`url` con `@NotBlank` + `@ValidarUrlCloudinary`), ambos DTOs nuevos de esta fase. `@ValidarUrlCloudinary` sigue validando solo dominio, no propiedad — el gap de suplantación queda mitigado por el propio flujo de firma (`CloudinaryService`, scoped por `comercioId`/`productoId` resueltos desde el JWT), no por la anotación; detalle completo en [.claude/skills/skill-validaciones/SKILL.md](.claude/skills/skill-validaciones/SKILL.md).

---

## 6. Índice de fases (dónde estamos, qué sigue)

Secuencia completa definida en `GUIA-IMPLEMENTACION-MVP-BAJONEA.md`. Estado actual: **Fase 10 cerrada (migración a Resend); Fase 15 cerrada; siguiente: Fase 16.**

| Fase | Nombre | Estado |
|---|---|---|
| 0 | Preparación del entorno de trabajo con Claude Code | ✅ cerrada |
| 1 | Inicialización del proyecto Spring Boot | ✅ cerrada |
| 2 | Base de datos: modelo MVP, Flyway y phpMyAdmin | ✅ cerrada |
| 2bis | Carga del catálogo geográfico (ETL Georef) | ✅ cerrada |
| 3 | Estructura de capas y convenciones de código | ✅ cerrada |
| 4 | Entities (JPA) | ✅ cerrada |
| 5 | DTOs y mapeo | ✅ cerrada |
| 6 | Repositories | ✅ cerrada |
| 7 | Configuración: seguridad, JWT y autorización por rol | ✅ cerrada — checklist en §6.7bis. Alcance ampliado (ver `docs/DECISIONES.md`, 2026-07-17): reincorpora `Sesion`, agrega recuperación de contraseña, bloqueo de cuenta y reactivación de cuenta. |
| 8 | Services (lógica de negocio) | ✅ cerrada — `RegistroService` (8.1), `GeografiaService` (8.1bis), `AdministradorService` (8.3, aprobación de comercios + `gestionarCategoria`/`gestionarTag` vía `CategoriaService`/`TagService` separados), `ProductoService`/`ComercioService` (8.4; `editarPerfil` + `verPerfil` — este último reabierto y cerrado el 2026-07-18 tras el inventario de Fase 9, ver `docs/DECISIONES.md`; gestión de galería `ImagenProducto` diferida explícitamente a Fase 11), `CarritoService` (8.5), `PedidoService` (8.6) y `NotificacionService` (8.7, incluye `contarNoLeidas` para el badge de polling) implementados y probados end-to-end contra la base real, todos los sub-puntos de 8.1 a 8.8 con evidencia documentada (ver `docs/DECISIONES.md`, 2026-07-17 y 2026-07-18 — regla transversal 9 de §4). Bug real encontrado y corregido probando `GeografiaService`: excepción no cubierta en un endpoint público se enmascaraba como `401` en vez de su status real (`SecurityConfig`/`GlobalExceptionHandler`, ver misma entrada). Ver `docs/CONCURRENCIA-Y-TRANSACCIONES.md` (aprobado 2026-07-17) para las decisiones de concurrencia por módulo, y las skills actualizadas en `.claude/skills/` para los patrones recurrentes ya establecidos. |
| 9 | Controllers y contrato de respuestas HTTP | ✅ cerrada — inventario completo del 2026-07-18 contra 9.3 (ver `docs/DECISIONES.md`): `ComercioController` completado (reapertura puntual de Fase 8); 3 deviaciones de path/verbo HTTP (`AdministradorController`/`PedidoController`/`NotificacionController`) confirmadas como decisión de diseño (§7bis); `CatalogoController`/`CatalogoService` implementados y probados end-to-end. Checklist formal de cierre de la guía (3 puntos) corrido contra los 11 Controllers en una sola entrada: único hueco real es la galería de `ProductoController`, diferida a Fase 11; 2 casos de status HTTP sin evidencia previa (`POST /auth/cambiar-password`, regla `hasRole("CLIENTE")`) probados ahora sin sorpresas; los 12 Controllers actuales pasan el hook `bloquear-entity-en-controller.js` real (cobertura histórica de los 9 escritos en sesiones previas no verificable — sin git history en el proyecto — dejado explícito, no asumido). |
| 10 | Email real para verificación de cuenta | ✅ cerrada — Brevo/SMTP bloqueado permanentemente (`502 SMTP account is not yet activated`, sin resolución posible tras contactar soporte); migrado a Resend (API REST, `com.resend:resend-java`). `EmailService` reescrito sobre el cliente de Resend (misma firma pública, `MailConfig` ahora expone el bean `Resend` igual que `CloudinaryConfig`), `spring-boot-starter-mail`/`spring.mail.*` eliminados por completo (no comentados). Probado de punta a punta con email real (`bukle.arg@gmail.com`): Resend devolvió un id real de envío, el usuario confirmó recepción (remitente `info@bajonea.ar`, SPF/DKIM ok), verificación con el token real del email → `usuario.estado` `PENDIENTE → ACTIVO`, login posterior `200`. Regresión Postman completa (perfil `test`): 49/49 requests, 113/113 assertions, 0 fallos. Mismo endpoint validado también desde Swagger UI (`Try it out` real, no simulado) con transición `PENDIENTE → ACTIVO` confirmada en base. Ver `docs/DECISIONES.md`, 2026-07-20. |
| 11 | Cloudinary: subida firmada de imágenes de producto | ✅ cerrada — galería de `ProductoController` (los 3 endpoints diferidos de Fase 9) + `POST /productos/{id}/cloudinary/firma` + foto de perfil de `Comercio` (`POST /comercios/perfil/foto/firma` + `PUT /comercios/perfil/foto`, ver §7bis). Credenciales de una cuenta de Cloudinary de prueba, cuenta definitiva pendiente de `info@bajonea.ar` — ver `docs/DECISIONES.md`, 2026-07-18. |
| 12 | Notificaciones in-app (polling) | ✅ cerrada — mayormente construida por adelantado en Fases 8/9 (`Notificacion`/`NotificacionRepository`/`NotificacionService`/`NotificacionController`, 5 sitios de `notificacionService.crear` en `PedidoService`/`ProductoService`/`AdministradorService`). Esta fase fue inventario + evidencia faltante, no código nuevo: los 3 sitios de `PedidoService` (nuevo pedido, aceptado, rechazado) solo tenían prueba **anterior** a la centralización del 2026-07-18 — probados ahora contra el código post-refactor. Ver `docs/DECISIONES.md`, 2026-07-19. |
| 13 | Documentación automática (springdoc-openapi) | ✅ cerrada — `OpenApiConfig` (bean `OpenAPI`, esquema `bearerAuth` HTTP/Bearer/JWT). Bug real encontrado y corregido en `SecurityConfig`: `/swagger-ui.html` (el link literal de la guía) no estaba cubierto por `/swagger-ui/**` — es un redirect propio de springdoc, no un subpath — y daba `401`; agregado como entrada propia. 43 endpoints confirmados en el spec (incluida la galería/foto de perfil de Fase 11), sin campos sensibles en los 58 schemas generados. Flujo "Authorize" probado de punta a punta vía la UI real (no solo `curl`) para los 3 roles. Ver `docs/DECISIONES.md`, 2026-07-19. |
| 14 | Testing de API con Postman | ✅ cerrada — colección de 49 requests (9 carpetas) armada vía MCP de Postman en workspace dedicado (`Bajoneá MVP`), corrida completa con Newman (49/49 requests, 113/113 assertions, 0 fallos) contra el backend real; exportada a `postman/`, fuente de verdad versionada. `TestController`/`TestSupportService` (`@Profile("test")`) generalizados a `GET /api/v1/test/token?email=&tipo=` para cubrir también recuperación de contraseña, no solo verificación de cuenta — queda permanente bajo el perfil `test`, no es un atajo con fecha de vencimiento. **Limitación confirmada del MCP de Postman** (no del proyecto): la copia alojada en la nube tiene los 49 requests completos (método/URL/headers/body, re-verificado con `getCollection`) pero sin los scripts de la pestaña "Tests" — `putCollection` los descarta en silencio en items anidados, `updateCollectionRequest` da `404` en cualquier item dentro de una carpeta, y el servidor MCP no expone ningún tool de borrado para reconstruir sin duplicar. Decisión aceptada: no forzar más escritura vía API: `postman/Bajonea-MVP.postman_collection.json` es la única fuente con los scripts. Ver `docs/DECISIONES.md`, 2026-07-19 (entrada original + entrada de re-verificación). |
| 15 | Figma: checklist de pantallas MVP | ✅ cerrada — catálogo cerrado en [docs/PANTALLAS-MVP-FASE15.md](docs/PANTALLAS-MVP-FASE15.md): 87 pantallas confirmadas IN de las ~150 del proyecto completo (+ 1 pantalla nueva a diseñar en Fase 16, `CO33` — dashboard de Comercio aprobado/operando sin MercadoPago, sin equivalente en el listado original), 66 OUT categorizadas (exclusión de alcance §1, sin mecanismo real verificado en código, búsqueda/filtro global inexistente, o sin backend construido — 4 categorías distintas, no todas por la misma razón). 4 puntos ambiguos resueltos con el usuario antes de cerrar (direcciones de cliente, búsqueda/filtros, dashboard de Comercio, pantallas sin backend). Sin tocar Figma — el usuario arma la página nueva a mano copiando las capas del checklist. |
| 16 | Frontend HTML/CSS/JS | ⬜ pendiente |
| 17 | Testing E2E con Playwright | ⬜ pendiente |
| 18 | Integración final y checklist de cierre | ⬜ pendiente |

No se pasa a la fase siguiente sin cerrar el checklist de la fase actual (definido en la guía, sección correspondiente).

**Qué se actualiza siempre al cerrar una fase**, además del checklist específico de esa fase:

1. Esta tabla de fases y cualquier otra sección de `CLAUDE.md` que la fase haya afectado (§3 estructura, §5 entidades, §7 seguridad, etc.).
2. `docs/DECISIONES.md` — una entrada cronológica propia por cada decisión real tomada (nunca una nota de paso mezclada dentro de otra entrada), con destino explícito para cualquier pieza diferida a una fase futura.
3. **Revisar si esta fase introdujo un patrón recurrente nuevo** (no una decisión puntual de una sola tabla/campo) y, si es así, reflejarlo en la skill correspondiente — `.claude/skills/generar-capa-crud/SKILL.md` para patrones de código/estructura, `.claude/skills/skill-validaciones/SKILL.md` para patrones de validación — **antes** de dar la fase por cerrada, con una referencia corta a la entrada de `docs/DECISIONES.md` donde se originó, para trazabilidad. Las skills son la guía de "cómo hacerlo de acá en adelante"; `docs/DECISIONES.md` sigue siendo el registro de "por qué se decidió así" — no duplicar el historial completo en la skill.

### 6.1 Checklist de cierre de la Fase 0 — ✅ cerrada

- [x] Estructura de carpetas (`.claude/skills/`, `.claude/agents/`, `.claude/hooks/`, `docs/`, `backend/`, `frontend/`, `postman/`, `testing/playwright/`) creada.
- [x] `CLAUDE.md` revisado y aprobado por el usuario.
- [x] `docs/DECISIONES.md` creado vacío con encabezado y una línea de propósito.
- [ ] Skills, agentes y hooks del Anexo A/B/C creados (se abordan más adelante, no bloqueó el cierre de la Fase 0).

### 6.2 Checklist de cierre de la Fase 1 — ✅ cerrada

- [x] `mvn clean compile` sin errores (`BUILD SUCCESS`).
- [x] Estructura estándar Maven (`src/main/java`, `src/main/resources`, `src/test/java`).
- [x] `pom.xml` con todas las dependencias pedidas (Web, Data JPA, MySQL Driver, Security, Validation, Lombok, springdoc-openapi-starter-webmvc-ui, Mail, flyway-core, flyway-mysql) + jjwt (api/impl/jackson) y Cloudinary SDK agregados a mano.
- [x] `application.properties` con placeholders de variables de entorno, sin credenciales reales.
- [x] `./mvnw spring-boot:run` arranca Tomcat en el puerto 8080 y llega hasta el intento de conexión a MySQL (falla con `Unknown database 'bajonea'`, código 1049 — esperado, se resuelve en la Fase 2).

### 6.3 Checklist de cierre de la Fase 2 — ✅ cerrada

- [x] `docs/modelo-mvp.md` aprobado (21 tablas, tres rondas de revisión).
- [x] Migraciones V1 a V10 generadas en `backend/src/main/resources/db/migration/`, revisadas por el usuario columna por columna contra `docs/modelo-mvp.md` antes de aplicarlas.
- [x] `./mvnw spring-boot:run` aplicó las 10 migraciones sin error (`Successfully applied 10 migrations to schema \`bajonea\`, now at version v10`) y la app terminó de arrancar (`Started BajoneaApplication`).
- [x] Verificado contra la base: 21 tablas de dominio presentes (`SHOW TABLES` en `bajonea`) + `flyway_schema_history`.
- [x] `flyway_schema_history` con exactamente 10 filas, las 10 con `success = 1`.
- [x] Ningún dato ni tabla del alcance completo (Pago, Reclamo, Sesion, Soporte, historiales, etc.) presente.

### 6.4 Checklist de cierre de la Fase 2bis — ✅ cerrada

- [x] `provincia` cargada completa (24 registros).
- [x] `localidad` cargada completa (4037 registros, sin duplicados).
- [x] Río Grande / Tierra del Fuego verificados presentes y correctos (incluyendo verificación de codificación UTF-8 byte a byte tras corregir un incidente de re-encoding durante la carga — ver `docs/DECISIONES.md`).
- [x] El script (`backend/scripts/etl-georef/etl-georef.mjs`) es re-ejecutable sin romper nada: corrido dos veces, mismos conteos (24 / 4037) en ambas corridas, sin errores.

### 6.5 Checklist de cierre de la Fase 3 — ✅ cerrada

- [x] Estructura de paquetes creada (`config/`, `enums/`, `validation/`, `dto/`, `entities/`, `repositories/`, `services/`, `controllers/`, `exceptions/`), con los 11 enums del MVP ya implementados (`docs/modelo-mvp.md` §1) y los placeholders de `config/` sin anotaciones de Spring (no alteran el arranque antes de sus fases).
- [x] `ApiResponse<T>` implementado (`mensaje` + `data`, constructor, `@Getter`).
- [x] `GlobalExceptionHandler` (`@RestControllerAdvice`) mapea `RecursoNoEncontradoException`→404, `ConflictoDeNegocioException`→409, `ValidacionException`→400, y `MethodArgumentNotValidException`→400 con el detalle de campos inválidos — todas las respuestas de error usan `ApiResponse<T>`.
- [x] `validation/` creado con un ejemplo de referencia completo (`@ValidarCuit` + `CuitValidator`, algoritmo módulo 11 de AFIP) y un `package-info.java` documentando que estas anotaciones son exclusivas de `dto/request/`, nunca de `entities/`.
- [x] `mvn clean compile` sin errores (`BUILD SUCCESS`, 27 archivos fuente).
- [x] `GET /api/v1/health` probado contra la app levantada: `{"mensaje":"Bajoneá backend operativo","data":null}` con status `200` (autenticado con las credenciales HTTP Basic que Spring Security autogenera por defecto — `SecurityConfig` real recién se implementa en la Fase 7, hasta entonces todos los endpoints quedan protegidos por el auto-config de Spring Security).

### 6.6 Checklist de cierre de la Fase 4 — ✅ cerrada

- [x] Las 21 entidades creadas y compilando (`mvn clean compile`, `BUILD SUCCESS`): las 20 del modelo MVP + `Persona` (nodo intermedio real de la jerarquía de herencia, incorporado en `docs/modelo-mvp.md`, nota de alcance 1) — más `ProductoTagId` como `@Embeddable` de apoyo, sin tabla propia.
- [x] Cadena `@MapsId` encadenada verificada: `Usuario` (raíz, `@GeneratedValue`) → `Persona` → `PersonaFisica`/`PersonaJuridica` → `Cliente`/`Administrador`, sin saltear el nodo `Persona`.
- [x] `ProductoTag` con `@EmbeddedId` (`ProductoTagId`) y `@MapsId("productoId")`/`@MapsId("tagId")` en sus dos `@ManyToOne` — única entidad del proyecto con clave compuesta (ver nota en §4.7).
- [x] `./mvnw spring-boot:run` levantado contra la base real (`bajonea`, MySQL vía XAMPP): arranca sin ninguna excepción de Hibernate (`Started BajoneaApplication in 5.661 seconds`). El riesgo marcado durante la Fase 4 (falso "wrong column type" de Hibernate al validar `ENUM` nativo de MySQL contra `@Enumerated(EnumType.STRING)`) **no se materializó** — `ddl-auto=validate` pasó limpio en las 21 entidades sin necesidad de ningún ajuste.
- [x] Verificado contra la base: `SHOW TABLES` en `bajonea` devuelve 21 tablas de dominio + `flyway_schema_history`, con correspondencia 1 a 1 exacta contra las 21 entidades (sin faltantes ni sobras) — ver tabla de mapeo en la sesión que cerró esta fase.
- [x] Todas las entidades cumplen las convenciones de §4.7/§4.8: `@Getter` de clase, `@Setter` campo por campo (nunca en `id`), `@EqualsAndHashCode(of = "id")`, `fetch = FetchType.LAZY` en toda relación, `@Table(name = "...")` explícito, cero comentarios.
- [x] `Producto` sin columna de imagen propia — la relación a `ImagenProducto` es `@OneToMany(mappedBy = "producto")`.

### 6.7bis Checklist de cierre de la Fase 7 — ✅ cerrada

Alcance ampliado respecto al plan original de la guía (login + JWT + roles) — ver `docs/DECISIONES.md`, 2026-07-17 "Enmienda formal de alcance del MVP": suma recuperación de contraseña, bloqueo de cuenta, reactivación de cuenta y la tabla `Sesion`. Checklist de la guía original (4 puntos) + verificaciones propias de la ampliación, todas probadas con `curl` contra la app levantada y la base real (usuario de prueba sembrado por SQL, sin `RegistroService` — Fase 8 — todavía no hay alta vía API):

- [x] Login exitoso devuelve un JWT válido con rol embebido (`sub`, `userId`, `rol`, `sesionId`).
- [x] Endpoint protegido devuelve `403` con rol insuficiente (probado CLIENTE contra ruta ADMINISTRADOR — mismo mecanismo que CLIENTE/COMERCIO que pide la guía).
- [x] Endpoint protegido devuelve `401` sin token, con token corrupto, y con token de firma válida pero sesión cerrada (caso propio de la ampliación, no estaba en el checklist original).
- [x] Endpoints públicos alcanzables sin token: login, verificación de email (catálogo y registro todavía no existen — Fase 8/9 — no probados por no tener código que probar).
- [x] Bloqueo tras 3 intentos fallidos: `409` en el 4° intento, `usuario.estado = BLOQUEADO` persistido.
- [x] Recuperación de contraseña completa: token generado y persistido pese a fallo de envío SMTP (Fase 10 pendiente), `estado → ACTIVO`, `intentos_fallidos → 0`, contraseña vieja deja de servir, cierre forzado de sesión activa verificado.
- [x] Reactivación de cuenta completa: login bloqueado en `INACTIVO` (`409`), reactivación por token, login vuelve a funcionar.
- [x] Logout real (no simbólico): cierra la `Sesion`, mismo JWT deja de servir en la siguiente request.
- [x] `./mvnw compile` → `BUILD SUCCESS` (122 archivos). App levantada 3 veces contra la base real durante la sesión de pruebas, sin errores de arranque ni de validación de schema.
- [x] Bug real encontrado y corregido durante las pruebas: `@Transactional` de `AuthService` deshacía el contador de intentos fallidos al lanzar `CredencialesInvalidasException` — resuelto con `noRollbackFor` (ver `docs/DECISIONES.md`).
- [x] `@Transactional(noRollbackFor = CredencialesInvalidasException.class)` verificado: acotado a esa única clase, ningún otro `RuntimeException` pierde su rollback por defecto. Repasados los 6 puntos donde se lanza esa excepción en `AuthService` — ninguno deja mutación parcial sin revertir cuando corresponde revertir.
- [ ] Sin probar todavía: envío real de email (bloqueado por SMTP, Fase 10), endpoints de registro (Fase 8/9 no implementadas), Swagger/OpenAPI describiendo estos endpoints (Fase 13).

Cierre confirmado por el usuario el 2026-07-17.

### 6.7 Checklist de cierre de la Fase 5 — ✅ cerrada

- [x] 8 `RequestDTO` implementados en `dto/request/`: `RegistroClienteRequestDTO`, `RegistroComercioRequestDTO`, `DireccionRequestDTO`, `CategoriaRequestDTO`, `TagRequestDTO`, `ProductoRequestDTO`, `ItemCarritoRequestDTO`, `PedidoRequestDTO`. `LoginRequestDTO`, `ImagenProductoRequestDTO`, `RechazoPedidoRequestDTO` y `AprobacionComercioRequestDTO` quedan diferidos a las fases que los consumen directamente (7/9 auth, 11 Cloudinary, 8/9 flujo de pedido y aprobación de comercio) en vez de crearse sin service/controller que los use.
- [x] 12 `ResponseDTO` implementados en `dto/response/` (más `ApiResponse<T>`, ya cerrado en la Fase 3): `UsuarioResponseDTO`, `DireccionResponseDTO`, `ComercioResponseDTO`, `ProductoResponseDTO`, `ImagenProductoResponseDTO`, `CategoriaResponseDTO`, `TagResponseDTO`, `CarritoResponseDTO`, `ItemCarritoResponseDTO`, `PedidoResponseDTO`, `DetallePedidoResponseDTO`, `NotificacionResponseDTO`. `ProvinciaResponseDTO`, `LocalidadResponseDTO` y `CloudinarySignatureResponseDTO` quedan diferidos por el mismo criterio (geografía y Cloudinary todavía sin service/controller propio).
- [x] Validaciones custom del catálogo (§5bis) aplicadas en las dos tandas de identidad ya cubiertas: `RegistroClienteRequestDTO` (`@ValidarNombrePropio`, `@ValidarDni`, `@MayorDeEdad`, `@ValidarTelefonoArgentino`, `@ValidarPasswordSegura`) y `RegistroComercioRequestDTO` (`@ValidarCuit`, `@ValidarTelefonoArgentino`, `@ValidarPasswordSegura`, `@Valid` anidado sobre `DireccionRequestDTO`).
- [x] Mapeo Entity↔DTO confirmado como manual (sin MapStruct), a resolver en los Services de la Fase 8 — ningún DTO de esta fase depende de un mapper generado.
- [x] `./mvnw compile` — `BUILD SUCCESS` (106 archivos fuente, Java 21) verificado el 2026-07-17 tras el corte de infraestructura que había dejado esta fase sin confirmar.

### 6.8 Checklist de cierre de la Fase 6 — ✅ cerrada

- [x] 21 Repository implementados en `repositories/`, uno por cada una de las 21 entidades de la Fase 4 (correspondencia 1 a 1 verificada por nombre de archivo), todos `JpaRepository<Entidad, PK>`.
- [x] Patrón de colección por defecto respetado (§4.1): queries derivadas que devuelven múltiples filas usan `List<T>` (ej. `ProductoRepository.findByComercioIdAndEstadoNot`, `findByComercioIdAndCategoriaId`).
- [x] `repositories/` queda "tonto" — solo queries derivadas por nombre de método o `@Query`, sin lógica de negocio (verificado en `ProductoRepository`, patrón consistente con el resto).
- [x] `./mvnw compile` — `BUILD SUCCESS` (mismo run que la Fase 5, ambas fases comparten los mismos 106 archivos fuente) verificado el 2026-07-17.

---

### 6.9 Checklist de cierre de la Fase 15 — ✅ cerrada

- [x] Las ~150 pantallas del proyecto completo (capas Figma, formato mobile) cruzadas una por una contra `CLAUDE.md` §1 y contra los endpoints/lógica de negocio reales (12 Controllers, `EstadoPedido`/`EstadoComercio`/`EstadoUsuario` de `docs/modelo-mvp.md`, `CatalogoService`, `CategoriaService`/`TagService`, `AdministradorService`, `AuthService`) — no solo contra la memoria de `CLAUDE.md`.
- [x] Catálogo cerrado documentado en [docs/PANTALLAS-MVP-FASE15.md](docs/PANTALLAS-MVP-FASE15.md): 87 pantallas IN (nombre exacto de capa), 66 OUT categorizadas en 4 motivos distintos (exclusión de alcance §1, sin mecanismo real verificado en código, búsqueda/filtro global inexistente, sin backend construido — nunca mezcladas como si fueran la misma razón).
- [x] 4 puntos genuinamente ambiguos (direcciones de cliente C39/C40/C41, búsqueda/filtros C07/C08, dashboard de Comercio operando CO03/CO05, pantallas sin backend AD07/08/11/12+G15/16) resueltos explícitamente con el usuario antes de cerrar el catálogo — ninguno asumido.
- [x] 1 hueco real de diseño detectado (no una pantalla mal clasificada): ninguna pantalla del listado original cubre el dashboard normal de un Comercio ya aprobado y operando sin lenguaje de MercadoPago — especificado funcionalmente en `docs/PANTALLAS-MVP-FASE15.md` §4.3 como `CO33` (nueva), a diseñar recién en la Fase 16.
- [x] Sin tocar Figma — el cruce es puramente documental, el usuario arma la página nueva a mano copiando las pantallas del checklist.

---

## 7. Seguridad, JWT y autorización por rol (Fase 7 de la guía)

> Alcance ampliado respecto al plan original de la guía — ver `docs/DECISIONES.md` (2026-07-17, "Enmienda formal de alcance del MVP"). El JWT deja de ser puramente stateless: incorpora un claim `sesionId` validado contra la tabla `Sesion` en cada request.

- **`JwtService`:** genera el token al login (claims: `sub`=email, `rol`, `userId`, `sesionId`, expiración), lo valida y extrae claims. Usa `jwt.secret` y `jwt.expiration-ms` de `application.properties`.
- **`JwtAuthenticationFilter`:** `OncePerRequestFilter` que lee `Authorization: Bearer <token>`, valida la firma vía `JwtService`, y **además** consulta `SesionRepository` para confirmar que la `Sesion` del claim `sesionId` sigue con `activa = true` — si la firma es válida pero la sesión fue cerrada (bloqueo, recuperación/cambio de contraseña, login concurrente, logout), responde `401` igual. Si todo es válido, carga el `Authentication` en el `SecurityContextHolder` con el rol como `GrantedAuthority` (`ROLE_CLIENTE`, `ROLE_COMERCIO`, `ROLE_ADMINISTRADOR`).
- **Endpoints públicos (sin auth):** `POST /api/v1/auth/registro/cliente`, `POST /api/v1/auth/registro/comercio`, `POST /api/v1/auth/login`, `GET /api/v1/auth/verificar/{token}`, `POST /api/v1/auth/recuperar-password`, `POST /api/v1/auth/recuperar-password/confirmar`, `POST /api/v1/auth/reactivar-cuenta`, `POST /api/v1/auth/reactivar-cuenta/confirmar`, `GET /api/v1/catalogo/**`, `GET /api/v1/geografia/provincias`, `GET /api/v1/geografia/localidades`, Swagger UI, `/api/v1/test/**` (Fase 14 — listado en `RUTAS_PUBLICAS` pero solo alcanzable bajo `spring.profiles.active=test`, ver §9 y `docs/DECISIONES.md`).
- **Endpoints por rol:** `/api/v1/productos/**` (COMERCIO), `/api/v1/categorias/**`, `/api/v1/tags/**` y `/api/v1/administrador/**` (ADMINISTRADOR), `/api/v1/carrito/**` y `/api/v1/pedidos/cliente/**` (CLIENTE), `/api/v1/pedidos/comercio/**` (COMERCIO). El cambio de contraseña desde perfil (`POST /api/v1/auth/cambiar-password`) requiere cualquier rol autenticado.
- `sessionCreationPolicy(SessionCreationPolicy.STATELESS)` — sin cambios: esto es sobre el `HttpSession`/cookie de servlet de Spring Security, no sobre la tabla `Sesion` propia de la aplicación (ver nota de alcance arriba). No hay contradicción entre ambas.
- CORS habilitado para el origen del frontend durante desarrollo.
- Passwords hasheadas con `BCryptPasswordEncoder` (bean único).
- Logout (`POST /api/v1/auth/logout`, autenticado) deja de ser simbólico: cierra la `Sesion` activa del usuario (`activa = false`, `tipo_cierre = MANUAL`) — resuelve el pendiente que estaba abierto en la sección 9.

### 7.1 `application.properties` — claves relevantes (Fase 1.3)

```properties
server.port=8080
spring.datasource.url=jdbc:mysql://localhost:3306/bajonea
spring.jpa.hibernate.ddl-auto=validate
spring.flyway.enabled=true
spring.flyway.locations=classpath:db/migration
jwt.secret=${JWT_SECRET:cambiar-en-produccion-por-variable-de-entorno}
jwt.expiration-ms=86400000
```

Usuario/contraseña de MySQL, SMTP y las credenciales de Cloudinary se leen siempre de variables de entorno (`${DB_USER}`, `${DB_PASSWORD}`, `${SMTP_HOST}`, etc.) — nunca valores reales en este archivo ni en el repo.

---

## 7bis. Contrato real de endpoints — deviaciones confirmadas contra la sección 9.3 de la guía

El inventario de Controllers de la Fase 9 (2026-07-18) encontró 3 endpoints donde el path o el verbo HTTP real difiere del literal de la sección 9.3 de `GUIA-IMPLEMENTACION-MVP-BAJONEA.pdf`. Las 3 quedan **confirmadas como decisión de diseño, no como pendiente de renombrar** — el path/verbo real de cada una es la fuente de verdad de acá en adelante, esta sección existe precisamente para que una auditoría futura no las vuelva a marcar como deviación sin revisar antes esta nota. Motivo de por qué se dejan así: son decisiones ya justificadas en `docs/DECISIONES.md` en el momento en que se construyó cada Controller (no accidentes de esta sesión), y no hay ningún consumidor real (Postman, frontend) todavía construido que dependa del path literal de la guía — cambiarlos ahora no evita romper nada existente, solo generaría trabajo sin beneficio.

| Controller | Guía (9.3) | Real | Motivo |
|---|---|---|---|
| `AdministradorController` | `PUT /administrador/comercios/{id}/resolucion` | `PUT /administrador/comercios/{id}/resolver` | Nombre de acción en infinitivo (`resolver`), consistente con el resto de los paths de mutación del proyecto (`/reactivar`, `/aceptar`, `/rechazar`) — la guía usa un sustantivo (`resolucion`) que rompe ese patrón. |
| `PedidoController` | `POST /pedidos` (crear) | `POST /pedidos/cliente` | Segmento de rol en la URL, mismo patrón que `/carrito` (CLIENTE) vs `/pedidos/comercio/**` (COMERCIO) ya usado en `SecurityConfig` — permite que la regla de autorización por rol matchee por prefijo de path sin depender de lógica adicional en el Controller. |
| `PedidoController` | `PATCH /pedidos/{id}/resolucion` (1 endpoint, body `aceptar` + `motivo`) | `PUT /pedidos/comercio/{id}/aceptar` + `PUT /pedidos/comercio/{id}/rechazar` (2 endpoints) | Decisión tomada al construir `PedidoService`/`PedidoController` (`docs/DECISIONES.md`, 2026-07-17): mismo criterio de nombrado `<Acción><Recurso>RequestDTO` ya establecido para `RechazoPedidoRequestDTO` — dos endpoints con intención explícita en el nombre en vez de un flag `aceptar: boolean` genérico. `PUT`, no `PATCH`, porque cada uno reemplaza el estado completo del recurso a un valor conocido, no aplica un parche parcial. |
| `NotificacionController` | `PATCH /notificaciones/{id}/leida` | `PUT /notificaciones/{id}/leida` | Mismo criterio que el resto del proyecto: `PUT` para una transición de estado completa y conocida (`leida: false → true`), reservando `PATCH` para cuando en el futuro haga falta una actualización parcial genuina (no hay ningún caso así todavía en el proyecto). |

**Endpoints agregados que la guía no lista en 9.3 pero sí exige en secciones de Service** (no son deviaciones, son adiciones justificadas): `AuthController` suma 5 endpoints de la ampliación de alcance de Fase 7 (recuperación de contraseña, bloqueo, reactivación — ver §7); `NotificacionController` suma `GET /notificaciones/no-leidas/contador`, exigido por 8.7 ("para el badge de polling") aunque 9.3 no lo liste explícitamente; `ProductoController` suma `POST /productos/{id}/cloudinary/firma`, exigido por 11.3 aunque 9.3 (escrita antes de la Fase 11) no lo liste; `ComercioController` suma `POST /comercios/perfil/foto/firma` + `PUT /comercios/perfil/foto` (Fase 11) — flujo de foto de perfil separado del de la galería de producto, sin límite de cantidad, confirmado con el usuario antes de implementarlo (`docs/DECISIONES.md`, 2026-07-18) porque `docs/modelo-mvp.md` ya marcaba `Comercio.foto_perfil_url` como "a incluir en el alcance del MVP" desde la Fase 2, distinta de la galería de `ImagenProducto`.

---

## 8. Dónde vive cada cosa

- **Plan completo, detalle de cada fase, checklists de cierre:** `GUIA-IMPLEMENTACION-MVP-BAJONEA.md` (fuente de verdad).
- **Decisiones puntuales tomadas durante la implementación** (con fecha y justificación): [docs/DECISIONES.md](docs/DECISIONES.md).
- **Diccionario de datos recortado del MVP** (columnas, tipos, PK/FK): `docs/modelo-mvp.md` (se genera en la Fase 2).
- **Análisis de riesgo de concurrencia/transacciones por módulo, criterio de qué se implementa en el MVP vs. v2:** [docs/CONCURRENCIA-Y-TRANSACCIONES.md](docs/CONCURRENCIA-Y-TRANSACCIONES.md) (Fase 8, aprobado 2026-07-17). Consultar antes de escribir cualquier Service nuevo que mute estado compartido (aprobaciones, pedidos, imágenes, carrito).
- **Skills, agentes y hooks del asistente:** `.claude/skills/`, `.claude/agents/`, `.claude/hooks/` (detalle completo en Anexos A, B y C de la guía).
- **Backend:** `backend/` (Spring Boot, Fase 1 en adelante).
- **Frontend:** `frontend/` (HTML/CSS/JS vanilla, Fase 16).
- **Colecciones de API:** `postman/` (Fase 14).
- **Specs E2E:** `testing/playwright/` (Fase 17).

---

## 9. Pendientes de confirmar

- ~~Proveedor de email para verificación de cuenta (Fase 10)~~ — resuelto: Brevo quedó descartado por un bloqueo de activación de cuenta sin solución posible (ver `docs/DECISIONES.md`, 2026-07-20); se migró a Resend, probado de punta a punta con email real, Postman y Swagger UI. Fase 10 cerrada.
- ~~Recuperación de contraseña~~ — resuelto: sumado al MVP en la Fase 7 mediante enmienda formal de alcance (ver `docs/DECISIONES.md`, 2026-07-17), junto con bloqueo de cuenta y reactivación de cuenta.
- ~~Endpoint de logout real vs. simbólico~~ — resuelto: con la reincorporación de `Sesion` en la Fase 7, el logout es real (cierra la `Sesion` activa), no simbólico. Ver §7.
- ~~Endpoint auxiliar de bypass de verificación para testing~~ — resuelto: implementado en la Fase 14 como `TestController`/`TestSupportService` (`@Profile("test")`), `GET /api/v1/test/token-verificacion?email=` (verificación de cuenta) y `GET /api/v1/test/token?email=&tipo=` (generalizado, cualquier `TipoToken` — usado también para fijar una contraseña de admin conocida vía el flujo real de recuperación, sin tocar la base a mano). Permanente bajo el perfil `test`, no tiene fecha de remoción — ver `docs/DECISIONES.md`, 2026-07-19.
