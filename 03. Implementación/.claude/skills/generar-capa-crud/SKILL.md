---
name: generar-capa-crud
description: Genera la capa completa (Entity + DTOs request/response + Repository + Service + Controller) para un recurso del backend Bajoneá, siguiendo las convenciones fijadas en la Fase 3 de GUIA-IMPLEMENTACION-MVP-BAJONEA.pdf (ApiResponse<T>, paquetes enums/ y validation/ hermanos de entities/, mapeo manual en el Service, status HTTP semánticos, List<T> por defecto). Usar cuando el usuario pida "agregá el CRUD de X", "necesito un nuevo recurso Y", "creá la entidad Z con su repositorio/service/controller", o cuando en la conversación aparezca el patrón "entidad + repositorio + service + endpoint" para algo del modelo MVP, incluso si no se usan esas palabras exactas.
---

# Generar capa CRUD (Anexo A.1 de la guía)

Esta skill reproduce, para un recurso nuevo, todo lo que ya se decidió en la Fase 3
(`CLAUDE.md` §3 y §4) para el resto del backend. No reinventa convenciones — las aplica.

Antes de generar nada:

1. Confirmar contra [docs/modelo-mvp.md](../../../docs/modelo-mvp.md) las columnas, tipos,
   nullability, PK/FK y relaciones exactas del recurso. Si el recurso no está en
   `modelo-mvp.md`, parar y preguntar — no inventar columnas.
2. Confirmar si el recurso ya tiene Entity creada (Fase 4). Si no la tiene, esta skill la
   crea como parte del mismo pedido; si ya existe, no tocarla salvo que el usuario pida
   explícitamente modificarla.
3. Revisar si el recurso necesita algún enum nuevo (van en `enums/`, package hermano de
   `entities/`, nunca dentro de `entities/enums/` — ver ajuste documentado en Fase 3 de
   `CLAUDE.md`).

## 1. Entity (`entities/<Recurso>.java`)

- `@Entity`, `@Table(name = "<tabla_snake_case>")` explícito.
- `@Id @GeneratedValue(strategy = GenerationType.IDENTITY)`, salvo que el recurso use
  `@MapsId` (patrón Persona/Usuario) o un ID no autogenerado (patrón Provincia/Localidad,
  cargado por ETL).
- Lombok: `@Getter` a nivel de clase, `@NoArgsConstructor @AllArgsConstructor @Builder`.
  Nunca `@Data` a secas (genera `equals`/`hashCode` sobre todos los campos, riesgo de
  recursión infinita con relaciones bidireccionales). Usar
  `@EqualsAndHashCode(of = "id")` explícito.
- `@Setter` va **campo por campo, nunca a nivel de clase**. El campo `id` **nunca**
  lleva `@Setter` propio — ni en entidades con `@GeneratedValue` ni en las de id
  externo (patrón `Provincia`/`Localidad`, cargadas por ETL). Esta regla aplica sin
  excepción a toda entidad del proyecto (ver `CLAUDE.md` §4.7).
- **Cero comentarios en el archivo**: nada de Javadoc de clase, nada de comentarios
  inline, nada de comentarios de campo. Ninguna Entity generada por esta skill debe
  incluir comentarios — la clase queda autoexplicativa por nombre y anotaciones
  únicamente; cualquier explicación de diseño va en `CLAUDE.md` o `docs/modelo-mvp.md`
  (ver `CLAUDE.md` §4.8). Esta regla es exclusiva de `entities/`; el resto de los
  archivos que genera esta skill (DTOs, Repository, Service, Controller) sí llevan
  comentarios donde agregan valor, como en cualquier otra parte del proyecto.
- Relaciones `@ManyToOne` con `fetch = FetchType.LAZY` siempre, salvo justificación
  puntual documentada con un comentario breve en el código.
- `List<T>` como colección por defecto en cualquier relación `@OneToMany`. `Set<T>` solo
  con una razón concreta (ej. evitar duplicados en una relación N:M como
  `ProductoTag`), documentada con un comentario `// justificacion: ...` en la misma
  línea o la anterior.
- Nunca se expone esta clase como tipo de retorno de un `@RestController` — lo bloquea
  el hook `bloquear-entity-en-controller.js`.

## 2. DTOs (`dto/request/<Recurso>RequestDTO.java`, `dto/response/<Recurso>ResponseDTO.java`)

- Un DTO de request nunca incluye campos que el cliente no debe poder setear (`id`,
  `estado`, `fechaCreacion`). Usar `jakarta.validation` (`@NotBlank`, `@Email`,
  `@Positive`, `@Size`, etc.) directamente en los campos.
- Para campos con formato o regla de negocio propios del dominio argentino (CUIT, DNI,
  teléfono, nombre/apellido, password, código postal, mayoría de edad, URL de Cloudinary,
  exclusión mutua cliente/comercio en Direccion), usar el catálogo ya existente en
  `validation/` **antes** de escribir un `@Pattern` a mano — ver
  [.claude/skills/skill-validaciones/SKILL.md](../skill-validaciones/SKILL.md) para el
  catálogo completo de las 9 anotaciones custom y dónde aplicar cada una. Solo crear una
  anotación custom nueva si ninguna de las 9 cubre el caso y `jakarta.validation` estándar
  tampoco alcanza.
- Un DTO de response nunca incluye campos sensibles (`passwordHash`) ni la entidad
  relacionada completa cuando alcanza con su id + un par de campos descriptivos (ej.
  `ProductoResponseDTO` lleva `comercioId` + `nombreComercio`, no un
  `ComercioResponseDTO` entero anidado).
- Nombres: `<Recurso>RequestDTO` / `<Recurso>ResponseDTO`. Si hace falta una acción
  distinta de crear/editar (ej. rechazo, aprobación), usar
  `<Accion><Recurso>RequestDTO` (ver `RechazoPedidoRequestDTO`,
  `AprobacionComercioRequestDTO` como referencia).

### Campo "motivo" (rechazo, cancelación, etc.): `ENUM` o texto libre, según el diccionario — nunca un criterio único para todos los casos

Antes de tipar un campo `motivo` como `String` o como un `enum`, revisar si
[`diccionario-de-datos.md`](../../../../02.%20Diseño/03.%20Diagramas%20de%20Bases%20de%20Datos/03.%20Diccionario%20de%20Datos/diccionario-de-datos.md)
define un `ENUM` cerrado para ese motivo puntual. Si lo define (ej.
`Pedido.motivo_rechazo` → `MotivoRechazo`), usar ese enum. Si no lo define (ej.
`HistorialEstadoComercio.motivo`, que en el diccionario completo es `VARCHAR(500)`
suelto, sin ningún `ENUM` de motivo de rechazo de Comercio documentado en ningún
lado), el campo va como `String` libre — eso es ser fiel al modelo, no una
simplificación a corregir después. Ver `docs/DECISIONES.md`, entrada *"`HistorialEstadoComercio`
reincorporada (Fase 8.3)"*, 2026-07-17.

### Campo/DTO sin consumidor todavía: diferir con destino explícito, nunca dejarlo como nota de paso

Si un campo de `CLAUDE.md` §3 (o un DTO entero) no se genera en la fase actual porque
el Service/Controller que lo va a usar todavía no existe, no es un pendiente suelto:
documentarlo en `docs/DECISIONES.md` como entrada propia (no una frase dentro de otra
decisión) con el formato *"`<Campo/DTO>` → Fase `<N>`, junto con `<Service>`, por
`<motivo>`"* — igual que se hizo con `LoginRequestDTO` (→ Fase 7, con `AuthService`),
`RechazoPedidoRequestDTO`/`AprobacionComercioRequestDTO` (→ Fase 9, con
`PedidoService`/`AdministradorService`), o `ComercioService.editarPerfil` (→ Fase 8.4,
junto con `ProductoService`, por compartir el patrón de resolución de dueño del
recurso — ver más abajo). Esto le permite a cualquier sesión futura confirmar el
destino sin tener que revisar el historial de chat.

## 3. Repository (`repositories/<Recurso>Repository.java`)

- `extends JpaRepository<<Recurso>, <TipoPK>>`.
- Devuelve siempre `List<T>` en los métodos de listado (nunca `Set`, salvo la misma
  excepción justificada de la Entity).

### Ningún finder sin call site real ya identificado

**No agregar un método a un Repository (derivado o `@Query`) sin mostrar antes el
punto exacto del Service donde se va a usar** — no "por si acaso", no porque el
diccionario completo sugiere una consulta que "podría servir después". Al proponer un
finder nuevo, mostrar el método completo *y* el fragmento del Service que lo llama en
el mismo turno, antes de darlo por aceptado.

Ejemplos reales de este proyecto: `ComercioRepository.findByPersonaJuridicaId` se
aceptó porque tenía 3 call sites reales en `AuthService` (bloqueo, recuperación,
reactivación) desde el principio, y después sumó un 4° y 5° call site real en
`ProductoService`/`ComercioService` sin cambiar de forma — eso confirma que un finder
bien justificado se reutiliza. En cambio,
`HistorialEstadoComercioRepository.findFirstByComercioIdAndEstadoDestinoOrderByFechaHoraDesc`
—sugerido por el propio diccionario completo para "último motivo de rechazo"— se
descartó en el momento de escribir `AdministradorService` porque no había re-solicitud
de comercio implementada todavía: sin esa lectura real, el repository quedó sin
finders custom (`ver docs/DECISIONES.md`, entrada *"Fase 8.3: piezas diferidas con
destino explícito"*, 2026-07-17). Se agrega el día que exista el consumidor, no antes.

## 4. Service (`services/<Recurso>Service.java`)

- Clase concreta directa, sin interfaz, salvo que ya haya más de una implementación
  real prevista (no sobre-diseñar).
- Acá vive toda la lógica de negocio: validaciones de reglas (no las de formato, esas
  las resuelve Bean Validation en el DTO), transiciones de estado, mapeo manual
  Entity ↔ DTO (este proyecto no usa MapStruct — ver nota de Fase 3 de la guía).
- Cualquier violación de regla de negocio (duplicados, estado inválido, recurso de
  otro dueño, etc.) lanza `ConflictoDeNegocioException` (→ 409) o
  `RecursoNoEncontradoException` (→ 404) según corresponda — nunca dejar que una
  excepción de Hibernate/JPA llegue cruda al cliente.
- Métodos típicos a cubrir: `crear`, `listar` (o `listarPor<Filtro>`), `obtenerPorId`,
  `actualizar`, `eliminar` (baja lógica si el recurso la usa, física si no aplica baja
  lógica en el modelo).

### Constraint de BD como última línea de defensa contra condiciones de carrera

Cualquier validación de unicidad en el Service (`existsByEmail`, `existsByNombre`,
etc.) es una lectura *check-then-act* sin lock — dos requests casi simultáneas pueden
ambas pasar la validación antes de que la primera haga commit. El `UNIQUE` de la base
es la última línea de defensa real para ese caso, y ya está cubierta de forma
**transversal** en `GlobalExceptionHandler.handleDataIntegrityViolation`
(`DataIntegrityViolationException` → `409` con `ApiResponse`) — no hace falta ni se
debe reimplementar esto en cada Service nuevo, alcanza con dejar que la excepción de
Hibernate se propague sin capturarla a mano. Ver `docs/DECISIONES.md`, entrada *"Gap
real encontrado en `RegistroService`"*, 2026-07-17 (verificado con una carrera real:
2 registros simultáneos con el mismo DNI, uno `201` y el otro `409`, no un `500`).

### Concurrencia: cuándo usar `@Lock(LockModeType.PESSIMISTIC_WRITE)`

No es una decisión a improvisar por Service. Antes de escribir un método nuevo que
mute un recurso compartido, aplicar la sección
**"Criterio general para decidir '¿se implementa ahora?'"** (el bloque de 2 viñetas al
principio de
[docs/CONCURRENCIA-Y-TRANSACCIONES.md](../../../docs/CONCURRENCIA-Y-TRANSACCIONES.md),
justo después de la intro, antes de la tabla del primer módulo) — es la regla que
decide si el escenario se mitiga ahora o se documenta para v2:

> **Sí**, si el escenario ya afecta código que ya existe y ya se probó, y la causa
> realista no es "carga concurrente real" sino algo que puede pasar en una prueba
> manual acotada (doble click, dos pestañas). **No** (se documenta para v2), si
> depende de un módulo que todavía no existe y el volumen de evaluación esperado hace
> la colisión improbable — salvo que el disparador no dependa del volumen de usuarios
> (ej. reintentos garantizados por un proveedor externo).

Aplicado a `@Lock` puntualmente: agregar un finder con
`@Lock(LockModeType.PESSIMISTIC_WRITE)` (patrón
`UsuarioRepository.findByEmailConBloqueo`/`findByIdConBloqueo`, sección 1 del
documento) **solo si el método ya existe y ya se probó, y muta un contador o un
estado de seguridad** (intentos fallidos, bloqueo, sesión única) donde el disparador
realista es un doble click o un reintento de red — exactamente los 2 casos ya
resueltos así en la tabla de la sección 1 (`Autenticación`). Si el método nuevo no
tiene código previo probado (recién se está escribiendo), el criterio "Sí" no aplica
todavía — documentar el escenario en la tabla del módulo correspondiente (agregar una
fila nueva si el módulo no tiene sección propia) como candidato a v2, siguiendo el
mismo criterio "No" salvo que aplique la excepción de disparador externo garantizado.

### `@Transactional(noRollbackFor = ...)` cuando hay un efecto secundario antes de una excepción de negocio

Si un método `@Transactional` persiste un efecto secundario (ej. incrementar un
contador de intentos fallidos) y **después** lanza una excepción de negocio para
señalar el fallo al llamador, el rollback por defecto de Spring ante cualquier
`RuntimeException` deshace también ese efecto secundario — el contador nunca queda
persistido. Si el Service necesita que ese efecto secundario sobreviva aunque el
método termine lanzando la excepción, agregar
`@Transactional(noRollbackFor = XxxException.class)` a nivel de clase, acotado
**exactamente** a esa excepción — nunca un `noRollbackFor` genérico que pueda
enmascarar un rollback necesario en otro punto del mismo método. Antes de aceptarlo,
repasar cada punto donde se lanza esa excepción y confirmar que ninguno deja una
mutación parcial sin revertir cuando sí correspondería revertir. Ver
`docs/DECISIONES.md`, entradas *"Pruebas end-to-end de Fase 7: bug real encontrado y
corregido"* (el bug original, detectado porque un 4° intento de login con contraseña
correcta logueó en vez de dar `409` tras 3 fallos reales) y *"`cambiarPasswordDesdePerfil`
suma el mismo lock que `login()`"* (2026-07-17).

### Resolver el "dueño" de un recurso a partir del JWT, nunca confiar en un id que manda el cliente

Cuando un endpoint opera sobre "mi propio recurso" (perfil de comercio, productos del
comercio autenticado, etc.), el Service resuelve la entidad dueña a partir del
`usuarioId` que sale de `AuthenticatedUser` (el JWT ya validado), nunca de un
`comercioId`/`clienteId` que venga suelto en el body o el path del request. Ojo
especial cuando la PK del recurso dueño **no** coincide con `Usuario.id`: `Cliente` y
`Administrador` sí encadenan `@MapsId` hasta `Usuario` (mismo `id`), pero `Comercio`
tiene PK propia autogenerada — hace falta resolverlo vía
`ComercioRepository.findByPersonaJuridicaId(usuarioId)` antes de poder validar
ownership sobre cualquier recurso del comercio. Ver `docs/DECISIONES.md`, entrada
*"Fase 8.4: `ProductoService`/`ComercioService.editarPerfil`"*, 2026-07-17.

### Aislamiento entre tenants: `RecursoNoEncontradoException` (404), no un 403 de ownership

Cuando un recurso existe pero pertenece a otro usuario/comercio (ej. comercio B
intentando editar un producto del comercio A), la respuesta es **`404`, no `403`** —
tratarlo igual que "no existe", no como "existe pero no tenés permiso". Esto evita
revelar la existencia de recursos ajenos a través del código de estado. El `403` de
este proyecto queda reservado para lo que ya cubre `CustomAccessDeniedHandler`: rol
insuficiente a nivel de ruta (`SecurityConfig`), no ownership a nivel de dato. Ver
`docs/DECISIONES.md`, entrada *"Fase 8.4"*, 2026-07-17.

### Operaciones secundarias no críticas: no perder una mutación de negocio ya persistida

Si un Service dispara una operación secundaria que puede fallar por una razón externa
esperada (ej. `EmailService`/Resend con la API caída o rechazando el envío), esa operación **no debe relanzar la excepción** si eso
significa perder (por rollback) una mutación de negocio que ya se persistió en el
mismo método (ej. el `Token` generado justo antes de intentar el envío). Loguear la
falla (`log.warn`) y seguir — no usar el mismo criterio para operaciones que sí son el
propósito central del método. Ver `docs/DECISIONES.md`, entrada *"Enmienda formal de
alcance del MVP"* (2026-07-17), sección sobre `EmailService`.

### Reincorporar una tabla del diccionario completo que se había recortado del MVP

A veces, al construir un Service nuevo, se descubre que necesita de forma real (no
hipotética) una tabla que `docs/modelo-mvp.md`/`CLAUDE.md` habían excluido
explícitamente del MVP (ej. `Sesion`, `HistorialEstadoComercio`). Esto es válido, pero
sigue un proceso fijo, no una decisión ad hoc:

1. Verificar primero contra la sección 0 de la guía (o `CLAUDE.md` §1/§5) que la tabla
   efectivamente está excluida y por qué — no asumir.
2. Confirmar que no hay una alternativa fiel al modelo que evite reincorporarla (ej.
   agregar una columna nueva a otra tabla) — si el diccionario completo ya descartó
   esa alternativa en una revisión previa (buscar notas de versión tipo "eliminado en
   v1.1"), no proponerla de nuevo.
3. Acotar el alcance exacto de la reincorporación — documentar explícitamente qué SÍ
   entra y qué NO, para no deslizar hacia el resto del módulo relacionado completo.
4. Archivos que **siempre** se tocan: `docs/modelo-mvp.md` (nueva nota de alcance
   numerada + tabla completa con todas sus columnas + actualizar el conteo total de
   tablas + sacarla de la sección de exclusiones + agregar sus relaciones), nueva
   migración Flyway, nueva Entity (sin comentarios, mismas convenciones de siempre),
   nuevo Repository (sin finders hasta que haya un call site real — ver arriba),
   `CLAUDE.md` (lista de entidades §5, sacarla de "NO entran al MVP"), y una entrada
   propia en `docs/DECISIONES.md` (no mezclada con otras decisiones de la misma
   sesión).

Ver `docs/DECISIONES.md`, entradas *"Enmienda formal de alcance del MVP: reincorporación
de `Sesion`"* y *"`HistorialEstadoComercio` reincorporada (Fase 8.3)"*, ambas
2026-07-17, para los dos casos reales completos.

### Mapeo Entity↔DTO: convención fija del proyecto

Todo mapeo Entity↔DTO vive **acá, en el Service**, escrito a mano dentro del propio
método (Opción 1: constructor/builder manual). **Nunca** en:

- la Entity (nada de `toDTO()` en `Categoria.java`),
- el DTO (nada de `toEntity()` en `CategoriaRequestDTO.java`),
- una clase `Mapper` separada (este proyecto no usa MapStruct ni un paquete `mappers/`
  con lógica real — ver nota de Fase 3 de la guía).

Ejemplo de referencia con `Categoria` (`nombre`, `descripcion`) — el mismo patrón se
replica para cualquier otro recurso:

```java
@Service
@RequiredArgsConstructor
public class CategoriaService {

    private final CategoriaRepository categoriaRepository;

    public CategoriaResponseDTO crear(CategoriaRequestDTO request) {
        if (categoriaRepository.existsByNombre(request.getNombre())) {
            throw new ConflictoDeNegocioException("Ya existe una categoría con ese nombre.");
        }

        // RequestDTO -> Entity: builder de Lombok, a mano, acá mismo.
        Categoria categoria = Categoria.builder()
                .nombre(request.getNombre())
                .descripcion(request.getDescripcion())
                .activo(true)
                .build();

        Categoria guardada = categoriaRepository.save(categoria);

        // Entity -> ResponseDTO: constructor, a mano, acá mismo.
        return new CategoriaResponseDTO(
                guardada.getId(),
                guardada.getNombre(),
                guardada.getDescripcion(),
                guardada.getActivo()
        );
    }
}
```

No delegar ninguna de las dos conversiones a un método de la Entity, del DTO, ni a una
clase auxiliar — si el mapeo empieza a repetirse mucho entre métodos del mismo Service,
extraer un método `private` dentro del propio Service (ej.
`private CategoriaResponseDTO aResponseDTO(Categoria c) { ... }`), nunca sacarlo del
Service.

## 5. Controller (`controllers/<Recurso>Controller.java`)

- `@RestController`, `@RequestMapping("/api/v1/<recurso-en-plural>")`.
- Recibe DTO validado con `@Valid @RequestBody`, llama **un** método del Service,
  envuelve el resultado en `ApiResponse<T>`, devuelve `ResponseEntity`. Nada de lógica
  condicional de negocio en el controller.
- Status HTTP semánticos según el verbo (regla no negociable de `CLAUDE.md` §4):
  - `POST` (creación) → `201 Created`.
  - `GET`/`PUT`/`PATCH` (lectura/actualización) → `200 OK`.
  - `DELETE` → priorizar devolver `mensaje` en el body (no `204 No Content` a secas),
    salvo que el usuario pida explícitamente lo contrario para ese endpoint.
  - Las excepciones de negocio ya las traduce `GlobalExceptionHandler` a 400/404/409 —
    el controller no captura excepciones a mano.

### Patrón de referencia (idéntico al de la guía, Fase 9.2):

```java
@PostMapping
public ResponseEntity<ApiResponse<XxxResponseDTO>> crear(
        @Valid @RequestBody XxxRequestDTO request) {
    XxxResponseDTO resultado = xxxService.crear(request);
    ApiResponse<XxxResponseDTO> body = new ApiResponse<>("Xxx creado.", resultado);
    return ResponseEntity.status(HttpStatus.CREATED).body(body);
}
```

## Checklist de validación post-generación

Antes de dar por terminada la generación, verificar en el propio código (no solo
confiar en que "se siguió la plantilla"):

- [ ] El controller devuelve siempre `ResponseEntity<ApiResponse<...>>`, nunca la
      Entity ni un DTO suelto sin envolver.
- [ ] El status HTTP de cada endpoint es el correcto según el verbo (tabla de arriba).
- [ ] La Entity tiene `@EqualsAndHashCode(of = "id")` explícito, no `@Data` a secas.
- [ ] El campo `id` nunca tiene `@Setter` propio (ni a nivel de clase, ni individual);
      el resto de los campos sí tienen `@Setter` individual.
- [ ] La Entity no tiene ningún comentario (ni Javadoc ni inline).
- [ ] Ningún DTO de response expone `passwordHash` u otro campo sensible.
- [ ] El Repository no tiene métodos que el Service no use.
- [ ] Las colecciones son `List<T>` salvo excepción justificada con comentario.
- [ ] Si el recurso tiene reglas de negocio del modelo MVP (unicidad, límites, estado),
      están validadas en el Service, no solo confiadas a una constraint de base de datos
      — pero la constraint de BD sigue estando ahí como última línea de defensa
      (`GlobalExceptionHandler` ya la cubre, no reimplementar por Service).
- [ ] Cada finder nuevo del Repository tiene su call site real mostrado antes de
      aceptarlo — ninguno quedó "por si acaso" ni copiado del diccionario completo sin
      un consumidor identificado.
- [ ] Si el Service muta un recurso "propio" del usuario autenticado (perfil, recursos
      del comercio, etc.), resuelve al dueño a partir del `usuarioId` del JWT, no de un
      id que llega en el body/path — y si un producto/recurso pertenece a otro
      usuario/comercio, la respuesta es `404`, no `403`.
- [ ] Si el Service registra un efecto secundario (contador, intento fallido) antes de
      poder lanzar una excepción de negocio en el mismo método, se revisó si hace falta
      `@Transactional(noRollbackFor = ...)` acotado a esa excepción puntual.
- [ ] Si el Service dispara una operación secundaria que puede fallar por una razón
      externa esperada (ej. envío de email vía Resend rechazado o caído), esa falla no
      hace perder una mutación de negocio ya persistida en el mismo método.
- [ ] Si el recurso introduce una operación de alta frecuencia de "doble submit"
      (login, cambio de contraseña, o cualquier mutación sobre un contador/estado de
      seguridad), se revisó contra `docs/CONCURRENCIA-Y-TRANSACCIONES.md` si necesita
      `@Lock(PESSIMISTIC_WRITE)`.
- [ ] `mvn clean compile` sin errores tras generar los archivos.

## Referencias

- Columnas/relaciones exactas: [docs/modelo-mvp.md](../../../docs/modelo-mvp.md).
- Convenciones completas de la Fase 3: [CLAUDE.md](../../../CLAUDE.md) §3 y §4.
- Detalle fase por fase: `docs/GUIA-IMPLEMENTACION-MVP-BAJONEA.pdf`, Fases 3 a 9 y
  Anexo A.1.
- Análisis de riesgo de concurrencia por módulo, criterio de `@Lock`/qué se implementa
  en el MVP vs. v2: [docs/CONCURRENCIA-Y-TRANSACCIONES.md](../../../docs/CONCURRENCIA-Y-TRANSACCIONES.md).
- Registro cronológico de las decisiones que originaron cada patrón de esta skill (el
  "por qué", no el "cómo" — eso vive acá): [docs/DECISIONES.md](../../../docs/DECISIONES.md).
