# Mapeo del tramo — Matriz exhaustiva de testeo de Postman (Cliente), 2026-09-03

Insumo: `docs/AUDITORIA-EXHAUSTIVA-CLIENTE.md` (2026-09-02), Partes 1, 2 y 4. Cubre los 12
formularios/flujos de Cliente ahí inventariados, campo por campo, con la matriz completa
(vacío, formato inválido ×2, límite inferior, límite superior boundary, caso válido, formato
alternativo donde aplica) descripta en el prompt de este tramo. **No cerrado — pendiente de
confirmación explícita de Diego**, mismo criterio que el resto de los tramos del proyecto.

---

## 1. Decisión de infraestructura: `bajonea_test`, no `bajonea_final`

El prompt de este tramo pedía evaluar el cambio y avisar antes de tocar el hábito establecido
de correr Postman contra `bajonea_final`. Investigando en vivo se encontró que **no había
tal hábito establecido que preservar**: el bypass de verificación que casi toda la colección
usa (`GET /api/v1/test/token(-verificacion)`, `TestController`) es exclusivo del perfil Spring
`test` (`@Profile("test")`), y ese mismo perfil (`application-test.properties`) fija
`spring.datasource.url=jdbc:mysql://localhost:3306/bajonea_test` — es decir, es
**arquitectónicamente imposible** ejercitar la colección completa (bypass incluido) contra
`bajonea_final`, porque el perfil que la habilita apunta siempre a `bajonea_test`. Los 7
usuarios `postman.*@bajonea.test` encontrados en `bajonea_final` al arrancar esta sesión eran
residuo de una corrida accidental de esta misma sesión (backend arrancado sin el perfil
`test`, ver Parte 2 del resumen de sesión) — no evidencia de un uso real previo. Confirmado y
limpiado antes de continuar. Se corrió la colección completa contra `bajonea_test`, mismo
mecanismo de perfil que usa Playwright (Fase 17) — sin usar `reset-db.mjs` (eso hubiera
borrado datos de Playwright ajenos a este tramo); en su lugar se usó el mismo
`postman/limpiar-datos-postman.sql` de siempre, ahora corregido (ver punto 2).

## 2. Corrección de `postman/limpiar-datos-postman.sql` (colección desalineada, Parte 3 #8 de la auditoría)

El script de limpieza estaba roto desde la migración Comercio → Dueño (Tramo 6 de
portabilidad, 2026-08-27) y desde el cambio de `Notificacion` a `entidad_tipo`/`entidad_id`
(Tramo 5): filtraba `comercio` por `persona_juridica_id` (columna que ya no existe — ahora es
`comercio.dueno_id`, con `dueno.id = persona_juridica.id = persona.id = usuario.id` vía la
cadena `@MapsId`) y borraba `notificacion` por `pedido_id` (columna reemplazada por
`entidad_tipo`/`entidad_id`). El segundo `DELETE` fallaba con "Unknown column" y abortaba el
resto del script silenciosamente en cada corrida — por eso había residuo acumulándose entre
ejecuciones. Reescrito con la cadena de ids correcta, sumando limpieza de tablas nuevas desde
entonces sin cobertura previa: `dueno` (+ el `persona_fisica_id` de su representante, que no
cuelga de ningún `usuario` propio), `red_social`, `historial_estado_comercio`,
`historial_estado_pedido`, `historial_estado_usuario`, `item_carrito_extra`,
`detalle_pedido_extra`. Confirmado re-ejecutable y completo: `SELECT` final de esta sesión con
cero filas remanentes (ver punto 8).

## 3. Bugs reales encontrados por la matriz (no corregidos — reportados para decisión de Diego)

1. **`FotoPerfilUsuarioRequestDTO.url` sin `@Size(max=500)` → 500 en vez de 400.** Un valor de
   501 caracteres (formato válido, pasa `@ValidarUrlCloudinary` y el `@Pattern` de extensión)
   llega a la capa de persistencia y excede `usuario.foto_perfil_url` VARCHAR(500); el error de
   base de datos se escapa como `500 "No se pudo procesar la solicitud, intentá nuevamente"` en
   vez de un `400` de validación limpio. A diferencia de otros DTOs de imagen del proyecto
   (`ImagenProductoRequestDTO`, por ejemplo), este es el único sin `@Size` explícito atado a su
   columna física. Reproducido de forma determinística (ver `29 - Matriz Cliente - Foto de
   perfil (Usuario)`, request `[BUG REAL] Foto perfil Usuario - url por encima del limite...`).
   Fix trivial sugerido (no aplicado): agregar `@Size(max = 500)` al campo.
2. **Mensaje de `@Size` sin `message` custom, locale-dependiente.** Los dos únicos campos del
   proyecto con `@Size` sin mensaje propio (`ClienteEditarPerfilRequestDTO.nombre`/`apellido`,
   `@Size(max = 100)`) devuelven el mensaje default de Hibernate Validator, y ese mensaje **varía
   según el `Accept-Language` (o la resolución de locale) del cliente HTTP que hace la request** —
   confirmado en vivo: `curl` (sin header) devolvió `"size must be between 0 and 100"`, la misma
   request vía Newman devolvió `"el tamaño debe estar entre 0 y 100"`. No es un bug funcional
   (el status 400 y el campo son correctos en ambos casos), pero es una inconsistencia de UX real
   — el mensaje que ve un usuario real depende de configuración del cliente, no es determinístico
   del lado del servidor. La matriz acepta ambas variantes documentadas explícitamente en el test.
   Ya estaba señalado como deuda pendiente en `CLAUDE.md` §9 ("Tramo aparte, futuro, dedicado a
   mensajes de validación en inglés sin traducir" — `ClienteEditarPerfilRequestDTO` nombrado ahí
   explícitamente) — este hallazgo agrega el matiz del locale, no es una regresión nueva.
3. **Orden de `ConstraintViolation` no determinístico cuando dos constraints compiten en el mismo
   campo.** `RegistroClienteRequestDTO.password` tiene tanto `@Size(max = 72)` como
   `@ValidarPasswordSegura` (cuyo propio regex incluye `.{8,72}`). Para un valor de exactamente
   73 caracteres — inválido para ambas reglas a la vez — qué mensaje gana es no determinístico:
   se repitió la misma request 5 veces seguidas contra el mismo proceso backend corriendo y el
   mensaje alternó entre `"La contraseña no puede superar los 72 caracteres"` (3 de 5) y
   `"Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número"` (2 de 5) — mismo
   input exacto, mismo proceso, sin reinicios entre medio. La matriz acepta ambos mensajes
   posibles para este caso puntual con una nota explicando el hallazgo (`22 - Matriz Cliente -
   Registro`, request `Registro Cliente - password por encima del limite...`). Funcionalmente
   correcto (`400` en ambos casos), pero UX-inconsistente. No aplica a `CambioPasswordPerfilRequestDTO`/
   `ConfirmarRecuperacionPasswordRequestDTO` (sin `@Size` propio, ver Parte 3 #4 de la auditoría) —
   ahí el mensaje de complejidad es la única fuente posible y es 100% determinístico, confirmado.

Ninguno de los 3 se corrigió — quedan documentados acá con evidencia real (request + respuesta)
para que Diego decida.

## 4. Corrección aplicada a la colección existente (fuera de los formularios de Cliente, pero bloqueaba la matriz)

- **`precio` con decimales en 2 requests de `04 - Productos`** (`Crear producto (Comercio A)` y
  `(Comercio B)`, `1500.00`/`3200.00`): `ProductoRequestDTO.precio` tiene
  `@Digits(integer = 8, fraction = 0)` — un `BigDecimal` con escala 2, aunque matemáticamente
  entero, viola `fraction = 0` (Hibernate Validator mira la escala real del valor serializado, no
  si los decimales son cero). Corregido a `1500`/`3200` — este era el bloqueo real que hacía
  fallar en cascada toda la creación de productos (y por lo tanto carrito/checkout) al correr la
  colección base contra el estado actual del backend. No es un hallazgo de esta auditoría de
  Cliente — es infraestructura compartida que había quedado desalineada.
- **`21 - Redes Sociales` chocaba con el registro de Comercio.** Las 4 requests de `Registro
  Comercio A/B/C/D/duplicados` ya cargan `redesSociales: [{"tipo": "INSTAGRAM", ...}]` en el
  propio alta (`RegistroComercioRequestDTO.redesSociales` es `@NotEmpty`, tramo posterior al
  cierre original de la carpeta 21). Las dos primeras requests de esa carpeta
  (`Agregar red social 1 - Instagram (Comercio A)` / `(Comercio B, Instagram)`) intentaban
  crearla de nuevo y chocaban con `409 "ya tiene una red social activa de tipo INSTAGRAM"`.
  Convertidas en requests de **lectura** (`GET /comercios/redes-sociales`, obtienen el id de la
  Instagram ya sembrada en el registro) en vez de alta — el resto del flujo (Facebook, TikTok,
  WhatsApp, X hasta el límite de 5, baja/reactivación, edición, aislamiento entre comercios)
  sigue exactamente igual que antes.

## 5. Carpetas nuevas agregadas (11 carpetas, 187 requests nuevos)

| Carpeta | Formulario(s) de la auditoría | Requests |
|---|---|---|
| `22 - Matriz Cliente - Registro (campo por campo)` | 1. Registro de Cliente | 54 |
| `23 - Matriz Cliente - Login` | 2. Login | 3 |
| `24 - Matriz Cliente - Verificacion de cuenta` | 3. Verificación de cuenta | 11 |
| `25 - Matriz Cliente - Recuperacion de password` | 4. Recuperación de contraseña | 18 |
| `26 - Matriz Cliente - Reactivacion de cuenta` | 5. Reactivación de cuenta | 7 |
| `27 - Matriz Cliente - Perfil (datos personales)` | 6. Edición de perfil | 20 |
| `28 - Matriz Cliente - Cambio de password desde perfil` | 7. Cambio de contraseña | 11 |
| `29 - Matriz Cliente - Foto de perfil (Usuario)` | 8. Foto de perfil de Cliente | 12 |
| `30 - Matriz Cliente - Carrito (alta y edicion de cantidad)` | 9 + 10. Carrito (alta y edición) | 29 |
| `31 - Matriz Cliente - Checkout` | 11. Checkout | 15 |
| `32 - Matriz Cliente - Explorar (busqueda y filtros del catalogo)` | 12. Explorar | 7 |

Cada carpeta que necesita estado real (cuenta verificada, comercio aprobado, producto real)
arma su propio setup encadenado con variables de entorno dedicadas con prefijo `matriz_*`
(nunca reutiliza `token_cliente`/`token_comercio` de la colección base, salvo `token_admin`
para las 2 aprobaciones de comercio que hacen falta) — así la matriz no depende de en qué
estado haya quedado el cliente/comercio fijo de la colección original tras correr todas las
carpetas anteriores, y es re-ejecutable de forma aislada.

## 6. Evidencia de la corrida final

- Antes de este tramo: 223 requests, 441 assertions (colección tal cual estaba, sin correr —
  la primera corrida real de esta sesión reveló que estaba rota, ver DECISIONES pendiente).
- Después de este tramo: **410 requests, 794 assertions**, corrido 2 veces consecutivas desde
  `bajonea_test` limpia con resultado idéntico: **792/794 en verde** — el único fallo aceptado
  es `[negativo] Pedir firma foto de registro de comercio (6/5, rate limit)`
  (`09 - Auth avanzado`), que no puede dispararse bajo el perfil `test` porque
  `application-test.properties` sube el límite de 5/min a 1000/min a propósito (para no
  bloquear la suite de Playwright) — limitación **del entorno de esta sesión**, no de la
  colección ni un bug real; vuelve a funcionar corriendo bajo el perfil default.
- Limpieza final confirmada: `SELECT` sobre `usuario`/`categoria`/`tag`/`comercio`/`dueno`
  filtrados por marcador `postman` → **0 filas** en las 5 tablas.

## 7. Pendiente, no resuelto en este tramo

- Los 3 bugs reales del punto 3 (fix sugerido documentado, no aplicado).
- Caso "Cliente sin dirección intenta checkout DOMICILIO" (formulario 11): confirmado que no
  hay vía real de API para crearlo — `RegistroClienteRequestDTO.direccion` es obligatorio, no
  existe ningún endpoint que borre la única dirección de un Cliente. Mismo gap ya documentado
  en la auditoría (formulario 6, sin endpoint de baja de dirección). Omitido, no simulable.
- Formulario 8 (foto de perfil): los casos de formato/límite de la URL están cubiertos
  completos (no dependen de Cloudinary real, el DTO solo valida el string). La subida real de
  un archivo a través de la firma de Cloudinary sigue sin cobertura de Postman — mismo gap ya
  señalado en la auditoría (Parte 2, formulario 8) y en `docs/DECISIONES.md` para el resto del
  proyecto (Fase 17 sí sube archivos reales, Postman históricamente no).

**No cerrado.** A la espera de que Diego confirme el checklist completo antes de dar por
terminado este tramo — mismo criterio que el resto de los tramos del proyecto.
