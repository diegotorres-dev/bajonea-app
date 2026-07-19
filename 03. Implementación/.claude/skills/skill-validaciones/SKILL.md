---
name: skill-validaciones
description: Catálogo de validaciones Bean Validation del backend Bajoneá — estándar de jakarta.validation y las 9 anotaciones custom del paquete validation/ (CUIT, DNI, teléfono argentino, nombre propio, password segura, código postal argentino, mayoría de edad, URL de Cloudinary, exclusión mutua cliente/comercio en Direccion). Consultar antes de escribir o editar cualquier RequestDTO con campos de tipo CUIT, DNI, teléfono, nombre/apellido, password, código postal, fecha de nacimiento, URL de imagen, o el par clienteId/comercioId de Direccion.
---

# Validaciones (Fase 5 en adelante)

Todas las anotaciones de esta skill viven en el paquete `validation/`
(`backend/src/main/java/com/bajonea/backend/validation/`), hermano de `entities/`:
`validation/annotations/` para las `@interface`, `validation/validators/` para sus
`ConstraintValidator`. Se aplican **exclusivamente en los DTOs de request**
(`dto/request/`), nunca en las Entities de JPA — las Entities representan el dato ya
persistido y válido; la validación de entrada ocurre en el borde HTTP, disparada por
`@Valid` en la firma del método del controller.

## Regla general: estándar cuando alcanza, custom solo cuando hay lógica real

Antes de crear o usar una anotación custom, preguntarse si `jakarta.validation` estándar
ya resuelve el caso: `@NotBlank`, `@NotNull`, `@Email`, `@Size`, `@Pattern`, `@Positive`,
`@PositiveOrZero`, `@Past`, `@PastOrPresent`, `@Future`, `@Min`, `@Max`, `@Digits`. Usar
estas directo en el campo del DTO siempre que alcancen.

Se crea (o se usa, si ya existe) una anotación custom **únicamente** cuando la regla
necesita lógica real que un `@Pattern` no puede resolver: dígito verificador,
normalización de formato, coherencia entre campos, o una regla de negocio (ej. mayoría de
edad). Las 9 anotaciones de abajo son exactamente ese catálogo — no crear una anotación
custom nueva para algo que ya cubre una de estas o un validador estándar.

## Catálogo de anotaciones custom

| Anotación | Target | Tipo de campo | Qué valida |
|---|---|---|---|
| `@ValidarCuit` | `FIELD` | `String` | 11 dígitos + dígito verificador módulo 11 real (algoritmo AFIP). Rechaza CUITs bien formados pero matemáticamente inválidos. |
| `@ValidarDni` | `FIELD` | `String` | 7 u 8 dígitos, rango [1.000.000, 99.999.999]. |
| `@ValidarTelefonoArgentino` | `FIELD` | `String` | Normaliza y valida teléfono argentino tolerando +54, 9, 0 de larga distancia y 15 (formato histórico de celular). Ver Javadoc de `TelefonoArgentinoValidator` para el algoritmo exacto de normalización. |
| `@ValidarNombrePropio` | `FIELD` | `String` | Solo letras Unicode (incluye acentos y ñ), espacios y guiones; rechaza números, símbolos, vacío y solo-espacios. Usar en `nombre`/`apellido`. |
| `@ValidarPasswordSegura` | `FIELD` | `String` | Mínimo 8 caracteres, al menos 1 mayúscula, al menos 1 número. No exige símbolo (decisión explícita del MVP). |
| `@ValidarCodigoPostalArgentino` | `FIELD` | `String` | Formato clásico de 4 dígitos, o CPA alfanumérico de 8 caracteres (ej. `C1425DJP`). Ambos formatos son válidos en Argentina. |
| `@MayorDeEdad` | `FIELD` | `LocalDate` | La fecha (ej. `fechaNacimiento`) implica 18 años o más al momento de la validación. |
| `@ValidarUrlCloudinary` | `FIELD` | `String` | Esquema `https` y host exactamente `res.cloudinary.com`. **Valida dominio, no propiedad del recurso** — ver advertencia debajo antes de usarla en un campo editable por el cliente. |
| `@DireccionExclusionMutua` | `TYPE` (nivel de clase) | — | Sobre el DTO completo de Direccion: exactamente uno de `clienteId`/`comercioId` debe ser no nulo, nunca ambos ni ninguno. Sube a anotación declarativa la regla documentada en `docs/modelo-mvp.md`, tabla `direccion`. Se aplica sobre la propia clase del DTO (`@DireccionExclusionMutua` encima de `public class XxxDireccionDTO { ... }`), no sobre un campo. |

Todas menos `@DireccionExclusionMutua` son `null`-tolerantes (devuelven `true` si el valor
es `null`): la ausencia de valor es responsabilidad de `@NotNull`/`@NotBlank` en el mismo
campo, combinada según corresponda; cada validador custom solo se expide sobre el
formato/regla cuando el valor está presente.

## `@ValidarUrlCloudinary` no alcanza sola para un campo editable por el cliente

`@ValidarUrlCloudinary` valida **únicamente** que la URL pertenezca al dominio
`res.cloudinary.com` — no valida que el recurso pertenezca a quien lo manda. Si se
usa sola en un DTO de request editable (ej. `fotoPerfilUrl` en un DTO de perfil),
cualquier usuario autenticado puede pegar la URL de un asset subido por **otro**
usuario/comercio (o cualquier asset público de la cuenta de Cloudinary del proyecto)
y la validación pasa igual, porque el dominio coincide.

**Regla:** no agregar esta anotación a un campo de un DTO de request que el cliente
pueda escribir libremente si no hay ningún mecanismo previo que garantice que la URL
salió de una firma generada para ese usuario/comercio puntual — el campo **no va en
ese DTO** hasta que exista ese mecanismo, porque dejarlo abierto no habilita una
funcionalidad real, solo el vector de suplantación. Ver `docs/DECISIONES.md`, entrada
*"Corrección: `ComercioPerfilRequestDTO.fotoPerfilUrl` sacado del DTO"*, 2026-07-17 —
el gap se encontró y corrigió ahí (el campo llegó a estar en el DTO real por un turno
antes de sacarse).

**Resuelto en Fase 11:** el mecanismo es el flujo de firma de Cloudinary
(`CloudinaryService`). `@ValidarUrlCloudinary` sola sigue sin probar propiedad —
sigue validando solo dominio — pero en los DTOs donde se usa desde Fase 11
(`ImagenProductoRequestDTO.url`, `FotoPerfilComercioRequestDTO.url`) el gap de
suplantación queda mitigado por otra vía, no por la anotación: el backend valida el
límite/folder **antes** de firmar (`CloudinaryService.generarFirma*`, apoyado en
`ImagenProductoRepository.countByProductoId` para la galería de producto), y cada
folder de subida está scoped por `comercioId`/`productoId` real (resuelto desde el
JWT, nunca desde el body) — un comercio no puede generar una firma válida para el
folder de otro. Sigue siendo cierto que, una vez que el cliente tiene *cualquier* URL
válida de `res.cloudinary.com` en la mano, nada impide técnicamente que la pegue en el
body de otro comercio: el costo residual de eso es bajo para un TFC (más un problema
de que la imagen "no es del producto/comercio esperado" que de seguridad real), y no
se agregó una anotación custom de "verificar propiedad exacta del asset" — no está en
el catálogo de las 9 y no se justificó un caso nuevo para esto.

**Formato y tamaño de archivo: van en la firma de Cloudinary, no acá.** Ni
`ImagenProductoRequestDTO` ni `FotoPerfilComercioRequestDTO` validan el formato o el
peso del binario con Bean Validation — no hay ninguna anotación posible que pueda
hacerlo, porque el backend nunca recibe el archivo (solo genera la firma antes de la
subida y recibe la URL ya subida después). Esa restricción vive del lado de Cloudinary,
vía el Upload Preset `bajonea_imagenes_mvp` (`allowed_formats: jpg,jpeg,png,webp` +
transformación entrante `c_limit,w_1200,q_auto`, creado manualmente en el dashboard de
Cloudinary, no por código) referenciado en la firma con `upload_preset=...`. El tope de
tamaño de archivo **no** se pudo fijar en 5MB propio: el campo "Max file size" no está
expuesto en la UI de Upload Presets en el plan/versión de la cuenta usada — sí existe
como parámetro de la Admin API, pero se decidió no crear el preset por ese camino solo
para ganar esto (más superficie de infraestructura por 5MB de diferencia, no se
justificó para un TFC). El tope real de tamaño queda en el límite de cuenta del plan
free de Cloudinary (10MB por imagen, confirmado en el panel "Usage Limits" del
dashboard), verificado con un archivo real de ~20MB rechazado con
`"Maximum is 10485760"`. Un `@Pattern` liviano sobre la extensión de la URL sigue
presente en ambos DTOs como defensa de bajo costo adicional (no reemplaza nada de lo
anterior, ver "Dónde aplicar cada una" abajo). Ver `docs/DECISIONES.md`, entrada de
esta mejora puntual sobre la Fase 11 ya cerrada.

## Dónde aplicar cada una (guía rápida para Fase 5)

- `RegistroClienteRequestDTO` / `PersonaFisica` en general: `nombre`/`apellido` →
  `@ValidarNombrePropio` + `@NotBlank`; `dni` → `@ValidarDni` + `@NotBlank`;
  `fechaNacimiento` → `@MayorDeEdad` + `@NotNull` + `@Past`; `telefono` →
  `@ValidarTelefonoArgentino` + `@NotBlank`; `password` → `@ValidarPasswordSegura` +
  `@NotBlank`.
- `RegistroComercioRequestDTO` / `PersonaJuridica`: `cuit` → `@ValidarCuit` + `@NotBlank`;
  `razonSocial`, `domicilioFiscal` → `@NotBlank` + `@Size` estándar (no necesitan anotación
  custom).
- `DireccionRequestDTO`: `codigoPostal` → `@ValidarCodigoPostalArgentino` + `@NotBlank`.
  Si más adelante se crea un DTO administrativo que sí exponga `clienteId`/`comercioId`
  explícitos, va con `@DireccionExclusionMutua` a nivel de clase.
- `ProductoRequestDTO` (Fase 8.4) **no** lleva `url`/imágenes — la galería se gestiona
  aparte, vía firma de Cloudinary (Fase 11), ver javadoc del propio DTO.
- `ImagenProductoRequestDTO` (Fase 11): `url` → `@NotBlank` + `@ValidarUrlCloudinary` +
  `@Pattern(regexp = "(?i).*\\.(jpg|jpeg|png|webp)$")` (defensa de bajo costo adicional
  sobre la extensión, no reemplaza la restricción real de formato/tamaño que aplica
  Cloudinary vía el Upload Preset — ver nota arriba); `orden` → `@NotNull` +
  `@PositiveOrZero`. La URL la genera el propio flujo de subida firmada
  (`POST /productos/{id}/cloudinary/firma`), no un campo libre.
- `ComercioPerfilRequestDTO` (Fase 8.4) **sigue sin** llevar `fotoPerfilUrl` — ver la
  advertencia de `@ValidarUrlCloudinary` arriba. Ese campo tiene su propio DTO desde
  Fase 11: `FotoPerfilComercioRequestDTO` (`url` → `@NotBlank` + `@ValidarUrlCloudinary` +
  el mismo `@Pattern` de extensión que `ImagenProductoRequestDTO`), consumido por
  `PUT /comercios/perfil/foto`, precedido siempre por `POST /comercios/perfil/foto/firma`.
  `ComercioResponseDTO` tampoco lleva validación (es de response, no de request).

## Un campo "motivo" no siempre es un candidato a validación custom

No todo campo de texto libre necesita (ni admite) una anotación de este catálogo. Si
el campo representa un motivo de rechazo/cancelación, el tipo correcto (`String` vs.
un `enum` ya existente en `enums/`) depende de si el diccionario completo define un
`ENUM` cerrado para ese motivo puntual — no es una decisión de validación, es una
decisión de modelado de datos. Ver
`.claude/skills/generar-capa-crud/SKILL.md`, sección "Campo 'motivo'...", para el
criterio completo con los dos casos reales del proyecto (`Pedido.motivo_rechazo` con
`ENUM`, `HistorialEstadoComercio.motivo` sin él).

## Referencias

- Implementación completa: `backend/src/main/java/com/bajonea/backend/validation/`.
- Catálogo y regla estándar-vs-custom también resumidos en `CLAUDE.md` §5 (validaciones).
- Convenciones de DTOs en general: `.claude/skills/generar-capa-crud/SKILL.md`, sección
  "## 2. DTOs".
- Registro cronológico de las decisiones que originaron el catálogo y sus correcciones
  (el "por qué", no el "cómo" — eso vive acá): [docs/DECISIONES.md](../../../docs/DECISIONES.md).
