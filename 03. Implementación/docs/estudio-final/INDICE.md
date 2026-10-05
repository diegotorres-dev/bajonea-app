# Material de estudio — Final del TFC Bajoneá

Material armado sobre el **código real** del proyecto para preparar el final: entender qué hace cada
cosa y cómo se conecta con el resto, en criollo, sin tecnicismo innecesario.

**Generado el 2026-09-05**, sobre el estado del código a esa fecha.

---

## Por dónde empezar

Si tenés poco tiempo, el orden recomendado es:

1. **ESTUDIO-CAPAS-Y-ARQUITECTURA.md** — para tener el mapa mental del sistema.
2. **ESTUDIO-FLUJOS.md** — las historias que vas a contar en la mesa.
3. **ESTUDIO-GLOSARIO.md** — para las preguntas conceptuales.
4. **ESTUDIO-CONFIG.md** (la parte de seguridad) — el tema más preguntable.
5. **ESTUDIO-SERVICES.md** — donde vive toda la lógica.

El resto son referencias para consultar por tema puntual.

---

## Los 14 documentos

### Transversales — los que hay que leer sí o sí

| # | Documento | Qué contiene |
|---|---|---|
| **14** | [ESTUDIO-CAPAS-Y-ARQUITECTURA.md](ESTUDIO-CAPAS-Y-ARQUITECTURA.md) | Cómo interactúan todas las capas, la responsabilidad de cada una, y el viaje completo de un dato desde el navegador hasta la base y de vuelta. Incluye cómo contarlo en la mesa en 30 segundos y en 2 minutos. |
| **11** | [ESTUDIO-FLUJOS.md](ESTUDIO-FLUJOS.md) | **El más importante para rendir.** Los 12 flujos del sistema contados como historias que podés relatar de memoria: registro, login, pedido completo, alta de producto, aprobación de comercio, recuperación de contraseña, notificaciones y más. |
| **13** | [ESTUDIO-GLOSARIO.md](ESTUDIO-GLOSARIO.md) | ~60 conceptos técnicos (DTO, JWT, ORM, ACID, BCrypt, N+1, IDOR, Flyway...) explicados en criollo, cada uno con cómo se usa concretamente en Bajoneá. Para las preguntas teóricas. |

### Por capa del backend

| # | Documento | Qué contiene |
|---|---|---|
| **1** | [ESTUDIO-CONFIG.md](ESTUDIO-CONFIG.md) | Las 10 clases de `config/`, incluida **toda la seguridad**: JWT, filtros, permisos por rol, BCrypt, CORS, rate limiting. **El tema más candidato a pregunta de mesa.** |
| **2** | [ESTUDIO-CONTROLLERS.md](ESTUDIO-CONTROLLERS.md) | Los 16 controllers con **todos sus endpoints**: método HTTP, ruta completa, qué recibe, qué devuelve y a qué service llama. |
| **3** | [ESTUDIO-DTO.md](ESTUDIO-DTO.md) | Los 62 DTOs (30 request + 32 response), con todos sus atributos y las validaciones de cada campo explicadas. Incluye por qué no se devuelven las entidades. |
| **4** | [ESTUDIO-ENTITIES.md](ESTUDIO-ENTITIES.md) | Las 27 entidades: qué representa cada una, sus atributos, y las relaciones explicadas en criollo. Incluye la cadena de identidad con `@MapsId` y el mapa completo de relaciones. |
| **5** | [ESTUDIO-ENUMS.md](ESTUDIO-ENUMS.md) | Los 24 enums con todos sus valores y qué significa cada uno en el negocio. |
| **6** | [ESTUDIO-EXCEPTIONS.md](ESTUDIO-EXCEPTIONS.md) | Las 4 excepciones custom y el `GlobalExceptionHandler`: cuándo se dispara cada una y a qué código HTTP se traduce. |
| **7** | [ESTUDIO-REPOSITORIES.md](ESTUDIO-REPOSITORIES.md) | Los 26 repositories con sus métodos custom explicados. Incluye el bloqueo pesimista y las query methods de Spring Data. |
| **8** | [ESTUDIO-SERVICES.md](ESTUDIO-SERVICES.md) | **La carpeta más importante del código.** Los 18 services con sus reglas de negocio, qué valida cada método y con qué otras clases interactúa. |
| **9** | [ESTUDIO-UTIL.md](ESTUDIO-UTIL.md) | Las 2 clases utilitarias: normalización de texto compartida con el frontend, y la regla de modalidades de entrega. |
| **10** | [ESTUDIO-VALIDATION.md](ESTUDIO-VALIDATION.md) | Las 12 anotaciones custom y sus validadores: qué regla valida cada una y dónde se usa. |

### Frontend

| # | Documento | Qué contiene |
|---|---|---|
| **12** | [ESTUDIO-JAVASCRIPT-REFERENCIA.md](ESTUDIO-JAVASCRIPT-REFERENCIA.md) | Referencia superficial de los 16 archivos JS: las funciones que hacen `fetch` al backend y las de validación de formularios, con 2-3 líneas cada una. |

---

## Los temas que más chances tienen de caer

| Tema | Dónde está |
|---|---|
| **Cómo funciona la autenticación con JWT** | CONFIG §2, FLUJOS §2 |
| **Por qué la tabla `Sesion` si el JWT es stateless** | CONFIG §2.3, GLOSARIO "Stateless" |
| **Por qué usás DTOs y no las entidades** | DTO (intro), GLOSARIO "DTO" |
| **Cómo modelaste los tipos de usuario** | ENTITIES §Grupo 1 |
| **Un pedido de principio a fin** | FLUJOS §3 |
| **Por qué separaste en capas** | CAPAS-Y-ARQUITECTURA §2 y §9 |
| **Dónde va cada validación** | CAPAS-Y-ARQUITECTURA §5 y §6 |
| **401 vs 403 vs 409** | CONFIG §2.6, EXCEPTIONS |
| **Por qué `BigDecimal` y no `double`** | DTO §1.3, GLOSARIO "BigDecimal" |
| **El snapshot de precio del pedido** | ENTITIES §5.2, FLUJOS §3 |
| **Cómo subís las imágenes sin que pasen por el servidor** | SERVICES §5.2, FLUJOS §4 |
| **Notificaciones: polling vs WebSockets** | FLUJOS §7, GLOSARIO |

---

## Anécdotas de bugs reales (buen material si preguntan "¿qué problema difícil resolviste?")

| Bug | Dónde está contado |
|---|---|
| El contador de intentos fallidos que nunca subía por el rollback de `@Transactional` | SERVICES §1.1, FLUJOS §2 |
| Un parámetro faltante devolvía 401 en vez de 400, por el forward interno a `/error` | EXCEPTIONS §Handler 4, CONFIG §2.4 |
| Los mensajes de validación no determinísticos, que cambiaban entre corridas | EXCEPTIONS §Handler 1 |
| El carrito que quedaba "atado" a un comercio después de vaciarse | SERVICES §2.1, FLUJOS §4 |
| El 404 real que contradecía el mensaje ambiguo y filtraba qué emails existían | SERVICES §1.1, FLUJOS §6 |
| El bug de unicidad al editar una categoría sin cambiarle el nombre | SERVICES §2.3, FLUJOS §10 |

---

## Advertencia sobre el alcance

Varios de estos documentos marcan explícitamente **qué está implementado y qué no**. El modelo de
datos del proyecto es más amplio que la lógica construida hasta hoy: hay estados, columnas y tipos
de notificación declarados que corresponden a tramos todavía sin implementar (MercadoPago, empleados,
reclamos, la máquina de estados completa del pedido).

**Está marcado a propósito.** En una mesa, decir "esa columna existe en el modelo pero la lógica
todavía no está implementada, es un tramo pendiente" es mucho más sólido que presentar como
terminado algo que no lo está — y evita que te hagan una repregunta que no puedas sostener.

Donde algo no quedó claro leyendo el código, aparece marcado como **"a confirmar"** en vez de
asumido.
