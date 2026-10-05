# Análisis previo — Tramo 6: Comercio → Dueño

Fecha: 2026-08-27
Alcance: SOLO análisis. Cero cambios de código en esta sesión.

Fuentes leídas en esta sesión: `docs/diccionario-de-datos.md` v1.5 (tablas `Usuario`, `Persona`, `PersonaFisica`, `PersonaJuridica`, `Cliente`, `Administrador`, `Empleado`, `Dueño`, `Comercio`, ENUM `RolUsuario`), `docs/bajonea_final.sql` (líneas 110-390, `CREATE TABLE usuario/persona/persona_fisica/persona_juridica/cliente/administrador/empleado/dueno/comercio/horario` + FKs), `docs/MAPEO-IMPACTO-PORTABILIDAD-BAJONEA-FINAL.md` completo (punto de partida explícito), `docs/DECISIONES.md` (entrada más reciente sobre `Dueño`), `CLAUDE.md` completo, y lectura directa de código real: 6 Entities (`Comercio`, `PersonaFisica`, `PersonaJuridica`, `Cliente`, `Administrador`, `Persona`, `Usuario`, `Token`), 2 Repositories (`ComercioRepository`, `AdministradorRepository`), 6 Services completos o parciales (`ComercioService` completo, `RegistroService` completo, `AdministradorService` completo, fragmentos de `ProductoService`/`PedidoService`/`AuthService`), 5 DTOs (`RegistroComercioRequestDTO`, `ComercioResponseDTO`, `ComercioAdminResponseDTO`, `RepresentanteResponseDTO`), `SecurityConfig.java` (bloque de autorización), y en frontend: `registro-comercio.html` completo, `js/admin.js` (sección representante), grep completo de `COMERCIO` sobre `frontend/`.

## Resumen ejecutivo

Este tramo es más chico de lo que el mapeo de portabilidad anterior hacía suponer — no porque el cambio de modelo sea trivial, sino porque **buena parte del trabajo que se esperaba tener que hacer ya está hecho**, de sesiones anteriores que no sabían que se estaba preparando este cambio: `RegistroComercioRequestDTO` ya captura los 5 campos personales del representante (nombre, apellido, DNI, teléfono, fecha de nacimiento) desde la corrección retroactiva del Tramo 16.8; el formulario de registro de Comercio (`registro-comercio.html`) ya es un wizard de 3 pasos que ya pide esos 5 campos en el paso 2 ("Datos del representante"); `AdministradorService`/`admin-comercio-detalle.html` ya arman y muestran una sección "Representante Legal" completa; y el registro sigue siendo, y puede seguir siendo, un único `POST` final. Ninguna de esas piezas necesita tocarse. Lo que realmente cambia es **puramente interno**: una Entity nueva (`Dueno`, sin `Repository` con métodos propios), un cambio de relación en `Comercio` (`OneToOne→PersonaJuridica` pasa a `ManyToOne→Dueno`), un rename de enum (`COMERCIO`→`DUENO`) que se propaga a 2 líneas de `SecurityConfig`, 6 Services de backend, y 12 comparaciones de string literal en 4 archivos de frontend (no 11 como decía el mapeo anterior, que además no había detectado 2 de esos 12 casos porque nunca miró `js/catalogo.js`).

El punto de mayor riesgo no es el volumen de archivos — es doble: (1) la Entity `Dueno` necesita **dos relaciones `@OneToOne` simultáneas con semántica distinta** (una `@MapsId` hacia `PersonaJuridica`, que define su propia PK, y una común hacia `PersonaFisica` por una columna `persona_fisica_id` separada) — un patrón que no existe hoy en ninguna otra Entity del proyecto, así que no hay un ejemplo directo para copiar y la integridad entre ambas relaciones (que apunten a la misma `Persona`) no está protegida por ninguna FK, según el propio diccionario; y (2) el diccionario v1.5 describe para `Comercio` una lógica de propagación de estado bastante más rica que la que existe hoy en código (`AuthService.propagarBloqueoAComercio`/`restaurarComercioSiCorresponde`, hoy escritos para un único comercio) — hacia "TODOS los comercios que administra" un Dueño, más el campo calculado `mp_vinculado` — que **no es parte del objetivo acotado de portabilidad** que Diego fijó para esta etapa ("no busco ampliaciones, solo estar en el mismo punto pero con la nueva base"). El riesgo real es que, al tener el diccionario tan bien escrito, se termine implementando esa lógica nueva "porque ya que estamos" sin que sea lo pedido — ver Pregunta 1 más abajo, es la de mayor impacto de esta lista.

Nota aparte, no de diseño sino de nomenclatura: el propio `bajonea_final.sql` aclara en un comentario que la tabla se llama `dueno` **sin ñ**, "por decisión de Diego — evita riesgos de encoding en entidades JPA, filesystem y herramientas". El diccionario en prosa (`docs/diccionario-de-datos.md`) sigue usando "Dueño" con ñ en varios lugares — incluida la columna `dueño_id` de la tabla `Comercio`, que en el `.sql` real es `dueno_id` sin ñ — y el prompt que originó este análisis también usa "Dueño.java" en todos lados. Este análisis asume que el criterio ya fijado en el `.sql` (sin ñ) es el vigente para nombres de archivo, clase e identificadores Java, y lo señala como inconsistencia de documentación a corregir, no como pregunta abierta — ver Sección 3.

## 1. Archivos Java afectados

### Entities (`backend/src/main/java/com/bajonea/backend/entities/`)

- **`Dueno.java`** (archivo nuevo, sin ñ — ver nota de nomenclatura arriba). Mismo patrón general que `Cliente.java`/`Administrador.java` (identidad delgada, sin lógica), pero con dos relaciones en vez de una:
  - `id` — `@Id @Column(name = "id")`, sin `@GeneratedValue` (mismo criterio que el resto de la cadena de herencia).
  - `personaJuridica: PersonaJuridica` — `@OneToOne @MapsId @JoinColumn(name = "id")`, idéntico al patrón que ya usan `Cliente.personaFisica`/`Administrador.personaFisica` hoy (la relación que define la PK).
  - `personaFisica: PersonaFisica` — `@OneToOne @JoinColumn(name = "persona_fisica_id", nullable = false, unique = true)`, **sin** `@MapsId` (no participa de la PK, es una FK secundaria `UNIQUE`). Este es el único punto del proyecto con una segunda relación `@OneToOne` no-PK en una entidad de identidad — no hay ejemplo previo para calcar, ver Riesgo R2 en la Sección 5.
  - `fechaCreacion: LocalDateTime` — `@Column(name = "fecha_creacion", nullable = false, updatable = false)`, mismo criterio que `Empleado.fecha_creacion` en el diccionario (columna propia real, no heredada).
- **`Comercio.java`** — reemplazar el bloque actual (líneas 38-41):
  ```java
  @Setter
  @OneToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "persona_juridica_id", nullable = false)
  private PersonaJuridica personaJuridica;
  ```
  por:
  ```java
  @Setter
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "dueno_id", nullable = false)
  private Dueno dueno;
  ```
  (`@ManyToOne`, no `@OneToOne`, porque la FK física de `bajonea_final.comercio` no tiene `UNIQUE` sobre `dueno_id` — mismo razonamiento que ya valía para `persona_juridica_id` en la base vieja, que tampoco era `UNIQUE`).
- **`PersonaFisica.java`, `PersonaJuridica.java`** — **sin cambios**. Se revisó explícitamente si hace falta agregar una relación inversa (`@OneToOne(mappedBy = ...)`) para poder navegar `PersonaFisica → Dueno` o `PersonaJuridica → Dueno` en el otro sentido: **no hace falta y no correspondería agregarla** — ninguna Entity del proyecto usa hoy el lado `mappedBy` de una relación (`Cliente`, `Administrador`, `PersonaFisica`, `PersonaJuridica` son todas unidireccionales hijo→padre, confirmado leyendo las 4 clases). `Dueno` sigue el mismo patrón: navega hacia sus dos padres, nadie navega hacia él desde ahí.
- **`Usuario.java`** — sin cambios. `foto_perfil_url` ya está mapeado (Tramo 2 ya cerrado a nivel código), no es parte de este tramo.

### Enums (`backend/src/main/java/com/bajonea/backend/enums/`)

- **`RolUsuario.java`** (3 líneas hoy: `CLIENTE, COMERCIO, ADMINISTRADOR`) — rename de valor `COMERCIO` → `DUENO`. Confirmado por grep: solo 5 sitios en todo el backend usan `RolUsuario.COMERCIO` (2 en `AuthService.java`, 1 en `RegistroService.java`) más 2 literales `"COMERCIO"` en `SecurityConfig.java` — ningún otro archivo Java lo referencia.

### Repositories (`backend/src/main/java/com/bajonea/backend/repositories/`)

- **`DuenoRepository.java`** (archivo nuevo) — `public interface DuenoRepository extends JpaRepository<Dueno, Integer> {}`, sin métodos propios, idéntico a `AdministradorRepository.java` (confirmado, es literalmente 3 líneas de cuerpo).
- **`ComercioRepository.java`** — único cambio: `Optional<Comercio> findByPersonaJuridicaId(Integer personaJuridicaId)` → `Optional<Comercio> findByDuenoId(Integer duenoId)`. Es el único método del repositorio además de `findByEstado`, confirmado leyendo el archivo completo (14 líneas).

### DTOs (`backend/src/main/java/com/bajonea/backend/dto/`)

**Ningún DTO necesita campos nuevos ni cambia de forma.** Confirmado leyendo los 4 DTOs relevantes completos:
- `RegistroComercioRequestDTO.java` ya tiene los 5 campos de representante (`nombreRepresentante`, `apellidoRepresentante`, `dniRepresentante`, `telefonoRepresentante`, `fechaNacimientoRepresentante`) con las mismas anotaciones de validación que usa `RegistroClienteRequestDTO` para los mismos datos — agregados en la corrección retroactiva de Tramo 16.8, antes de que este tramo existiera como concepto. Cero cambios.
- `ComercioResponseDTO.java`, `ComercioAdminResponseDTO.java`, `RepresentanteResponseDTO.java` — mismos campos, mismo constructor, sin ningún campo que dependa de `PersonaJuridica` directamente (ya son `razonSocial`/`cuit` planos, no el objeto). Lo único que cambia es **cómo el Service arma esos valores internamente** (ver Services abajo), no la forma del DTO.
- `ComercioPublicoResponseDTO.java` — no llegó a leerse línea por línea en esta sesión pero, por construcción (no incluye `representante` ni ningún dato de `PersonaFisica`/`PersonaJuridica` más allá de `razonSocial`/`cuit`, confirmado en `ComercioService.aPublicoResponseDTO`), tampoco necesita cambios.

### Services (`backend/src/main/java/com/bajonea/backend/services/`)

Confirmados los mismos 6 Services que ya señalaba el mapeo anterior, con el detalle línea por línea verificado contra el código real de esta sesión (los números de línea pueden haberse corrido levemente desde que se escribió el mapeo anterior, por trabajo de los Tramos 2/3 de portabilidad ya aplicado):

- **`ComercioService.java`** (206 líneas, archivo completo leído):
  - `obtenerComercioDelUsuario(Integer usuarioId)` (línea 118-121): `comercioRepository.findByPersonaJuridicaId(usuarioId)` → `findByDuenoId(usuarioId)`. Sin más cambios en este método — sigue funcionando igual porque `Dueno.id == Usuario.id` (misma cadena `@MapsId`).
  - `aResponseDTO(Comercio comercio)` (línea 123-150): la línea 126 hace hoy `personaFisicaRepository.findById(comercio.getPersonaJuridica().getPersona().getId())` para llegar al representante — con `Dueno` esto se puede resolver directo, sin ir al repositorio, como `comercio.getDueno().getPersonaFisica()`. Las líneas 141-146 (`comercio.getPersonaJuridica().getRazonSocial()/getCuit()/getCondicionIva()/getTipoSociedad()/getDomicilioFiscal()/getFechaInicioActividades()`) pasan a `comercio.getDueno().getPersonaJuridica().get...()`.
  - `aPublicoResponseDTO(Comercio comercio)` (línea 152-171): líneas 167-168, mismo cambio de traversal (`getPersonaJuridica()` → `getDueno().getPersonaJuridica()`), sin el representante (este DTO nunca lo incluyó).
  - Nota: la Entity `Comercio` no importa hoy `PersonaFisicaRepository` directamente — es `ComercioService` quien lo inyecta como dependencia solo para resolver el representante. Si se toma la simplificación de la línea 126 (ver arriba), `PersonaFisicaRepository` deja de usarse en esta clase — ver Pregunta 4.
- **`ProductoService.java`**: un solo método, `obtenerComercioDelUsuario` (líneas 391-394, idéntico al de `ComercioService`) — mismo rename de finder, sin ningún uso de `getPersonaJuridica()` en esta clase (confirmado, `ProductoService` nunca arma un DTO que incluya datos del representante).
- **`PedidoService.java`**: 4 sitios confirmados —
  - Línea 119, dentro de `confirmarPedido(...)`: `comercio.getPersonaJuridica().getPersona().getUsuario().getId()` (para notificar al comercio de un pedido nuevo) → `comercio.getDueno().getPersonaJuridica().getPersona().getUsuario().getId()` (o, más directo, si se agrega un getter de conveniencia, simplemente resolver el `Usuario` desde `Dueno` sin pasar por `PersonaJuridica` — ambos caminos llegan al mismo `Persona`/`Usuario`, cualquiera de los dos es válido).
  - Líneas 175, 183, 203 (`listarPedidosComercio`, `obtenerResumenHoy`, `obtenerPedidoDelComercio`): las 3 son `comercioRepository.findByPersonaJuridicaId(usuarioId)` → `findByDuenoId(usuarioId)`, sin más cambios en el cuerpo de esos métodos.
- **`AuthService.java`**: 4 sitios confirmados, los 4 dentro de dos métodos privados hermanos:
  - `propagarBloqueoAComercio(Usuario usuario)` (líneas 293-303): línea 294 `usuario.getRol() != RolUsuario.COMERCIO` → `!= RolUsuario.DUENO`; línea 297 `comercioRepository.findByPersonaJuridicaId(usuario.getId())` → `findByDuenoId(usuario.getId())`.
  - `restaurarComercioSiCorresponde(Usuario usuario, EstadoComercio estadoOrigenEsperado)` (líneas 305-315): mismo cambio, línea 306 y línea 309.
  - Ambos métodos hoy asumen **un único comercio por usuario** (`.ifPresent(comercio -> ...)` sobre un `Optional`, no una lista) — ver Riesgo R5, es exactamente el punto que un futuro tramo de "varios comercios por Dueño" va a tener que reabrir, pero no corresponde tocarlo en este tramo (ver Pregunta 1).
- **`AdministradorService.java`** (203 líneas, archivo completo leído): 5 sitios confirmados, todos en dos métodos —
  - `resolverAprobacion(...)`, línea 133: `comercio.getPersonaJuridica().getPersona().getUsuario().getId()` (para notificar al comercio de la resolución) → mismo cambio de traversal vía `getDueno()`.
  - `aAdminResponseDTO(Comercio comercio)` (línea 136-176): línea 153 (misma redundancia que `ComercioService` línea 126 — lookup vía `personaFisicaRepository.findById(...)` que puede simplificarse a `comercio.getDueno().getPersonaFisica()`), línea 164 (`comercio.getPersonaJuridica().getPersona().getUsuario().getEmail()`), líneas 169-171 (`getRazonSocial()/getCuit()/getCondicionIva()`).
- **`RegistroService.java`** (250 líneas, archivo completo leído), método `registrarComercio(RegistroComercioRequestDTO request)` (líneas 105-164):
  - Línea 116: `RolUsuario.COMERCIO` → `RolUsuario.DUENO`.
  - Después de crear y guardar `personaFisica` (línea 119-127) y `personaJuridica` (línea 129-138), agregar la creación de `Dueno`:
    ```java
    Dueno dueno = Dueno.builder()
            .personaJuridica(personaJuridica)
            .personaFisica(personaFisica)
            .fechaCreacion(LocalDateTime.now())
            .build();
    duenoRepository.save(dueno);
    ```
    (nueva dependencia `DuenoRepository duenoRepository` inyectada en el constructor de la clase, mismo patrón que las demás).
  - Línea 140-141: `Comercio.builder().personaJuridica(personaJuridica)` → `.dueno(dueno)`.
  - El resto del método (validación de horarios, dirección, envío de verificación) no cambia.
  - Nota sobre integridad: el diccionario es explícito en que `dueno.persona_fisica_id` debe corresponder siempre al mismo `Persona` del que desciende `dueno.id` (vía `PersonaJuridica`), y que **no hay FK que lo garantice** — acá, dentro de una única transacción con las mismas variables locales `persona`/`personaFisica`/`personaJuridica`, ese invariante se cumple por construcción (no hay forma de que se desalinee sin un bug explícito de copy-paste). Ver Riesgo R3.

### Controllers (`backend/src/main/java/com/bajonea/backend/controllers/`)

- **Ningún endpoint cambia de contrato.** Confirmado: `AuthController.registrarComercio` (línea 58-63) ya expone un único `POST /api/v1/auth/registro/comercio` que recibe `RegistroComercioRequestDTO` completo de una sola vez — no hay ningún cambio de path, verbo, ni forma de body que hacer acá (ver también Pregunta ya resuelta en Sección 3, punto sobre el flujo de un solo POST).
- El único cambio de superficie HTTP es de **valor**, no de forma: el claim `rol` del JWT y el campo `rol` de `UsuarioResponseDTO`/`LoginResponseDTO` van a empezar a devolver `"DUENO"` en vez de `"COMERCIO"` — ninguno de los dos es un cambio de código en el Controller, ya eran `String`/enum genérico.

### Configuración

- **`SecurityConfig.java`** — 2 líneas exactas: línea 92 (`.requestMatchers("/api/v1/productos/**", "/api/v1/comercios/**").hasRole("COMERCIO")`) y línea 99 (`.requestMatchers("/api/v1/pedidos/comercio/**").hasRole("COMERCIO")`) → `hasRole("DUENO")`.

## 2. Archivos frontend afectados

**Inventario de `'COMERCIO'` como literal de comparación de rol, re-grepeado en esta sesión — 12 sitios reales en 4 archivos, no 11 como decía el mapeo anterior:**

| Archivo | Líneas | Detalle |
|---|---|---|
| `js/comercio.js` | 169, 188, 425, 724, 790, 1201, 1326 | 7 guardas `usuario.rol !== 'COMERCIO'` (el mapeo anterior decía 8 — recontado en esta sesión con `grep -c`, son 7; las otras 4 apariciones de la palabra "COMERCIO" en este archivo son nombres de constantes internas, `ESTADO_BADGE_COMERCIO`/`ESTADO_DETALLE_COMERCIO`, que no comparan contra `usuario.rol` y no necesitan tocarse). |
| `js/catalogo.js` | 129, 141 | 2 sitios — **el mapeo anterior no había detectado este archivo en absoluto.** Línea 129: `(usuario.rol === 'CLIENTE' \|\| usuario.rol === 'COMERCIO')` para decidir si mostrar la campana de notificaciones. Línea 141: `usuario.rol === 'COMERCIO' ? 'comercio-perfil.html' : 'perfil.html'` para el link del avatar en el header compartido — usado por todas las pantallas que importan `renderTopBar`. |
| `js/notificaciones.js` | 70, 102 | 2 sitios, ya identificados por el mapeo anterior: armado de `href` del deep-link y guarda de acceso a la pantalla. |
| `splash.html` | 73 | 1 sitio, ya identificado: redirección post-splash según rol. |

- **`js/auth.js`** — confirmado sin cambios: tiene 5 apariciones de la palabra "COMERCIO" pero las 5 son nombres de constantes (`CAMPOS_STEP1_BACKEND_COMERCIO`, `CAMPOS_STEP2_BACKEND_COMERCIO`, `MAPA_ERRORES_REGISTRO_COMERCIO`) usadas para mapear errores de validación del backend a los pasos del wizard — no comparan contra `usuario.rol` en ningún punto. `resolverHomePorRol(...)` (mencionado por el mapeo anterior) resuelve Cliente/Administrador por nombre y cae al branch de Comercio por `else`, confirmado sin cambios necesarios.
- **`registro-comercio.html`** — leído completo (352 líneas). **Cero cambios necesarios.** Ya es un wizard de 3 pasos (`step-1` "Datos de tu negocio", `step-2` "Información legal" — que incluye una subsección completa "Datos del representante" con los 5 campos: `nombreRepresentante`, `apellidoRepresentante`, `dniRepresentante`, `fechaNacimientoRepresentante`, `telefonoRepresentante` —, `step-3` "Horarios de atención"), y ya envía todo en un único submit al final del paso 3 (confirmado en `js/auth.js`, `initRegistroComercio`). No hace falta agregar ningún campo nuevo ni reestructurar el formulario.
- **`admin-comercio-detalle.html` / `js/admin.js`** — confirmado sin cambios: `js/admin.js` (líneas 484-493) ya arma una sección "Representante Legal" completa (nombre + apellido, DNI, teléfono, fecha de nacimiento) leyendo `comercio.representante`, condicionada a que el campo no sea `null`. Como la forma de `ComercioAdminResponseDTO` no cambia (Sección 1), esta pantalla sigue funcionando sin tocarla.
- **Cualquier otra pantalla que muestre `razonSocial`/`cuit`/`condicionIva`/`domicilioFiscal`** (perfil propio de Comercio, `comercio-perfil.html`, y el resto de pantallas de catálogo/admin que listan comercios) — no fue necesario revisarlas una por una porque todas consumen los mismos DTOs de la Sección 1, cuya forma no cambia. El único vector de rotura real para el frontend es el literal `'COMERCIO'` de la tabla de arriba.

## 3. Preguntas de diseño para Diego

1. **[LA DE MAYOR IMPACTO] ¿El alcance de este tramo se limita estrictamente a portar el comportamiento actual (1 comercio, sin `mp_vinculado`, sin propagación a "todos los comercios"), o corresponde ya empezar a construir la lógica más rica que describe el diccionario v1.5 para `Comercio`** (propagación de `BLOQUEADO`/`INACTIVO`/`SUSPENDIDO` del Dueño hacia **todos** sus comercios, cálculo de `mp_vinculado`, `cerrado_manualmente` combinado con horario)? El código actual de `AuthService` (`propagarBloqueoAComercio`/`restaurarComercioSiCorresponde`) ya hace una versión acotada de esto para un único comercio — con el rename mínimo de finder sigue funcionando igual que hoy, sin ampliar nada. Dado que la instrucción explícita de Diego para esta etapa es "no busco ampliaciones, solo estar en el mismo punto pero con la nueva base", este análisis asume que la respuesta es "portar tal cual, sin tocar la lógica de propagación" — pero como el diccionario describe esa lógica con mucho detalle, vale la pena una confirmación explícita antes de escribir código, para no terminar ampliando algo por inercia de estar leyendo la especificación completa.
2. **Nomenclatura sin ñ** (`Dueno` en vez de `Dueño`, ya asumido como criterio vigente en este documento — ver Resumen ejecutivo): ¿confirmar que aplica también a nombres de variable/getter (`comercio.getDueno()`, no `getDueño()`) y que corresponde corregir la prosa de `docs/diccionario-de-datos.md` (que todavía dice `dueño_id` en la tabla `Comercio` y "Dueño" en varios lugares) para que coincida con el `.sql` real? Es una corrección de documentación, no de código, pero afecta cómo se nombra todo lo nuevo de este tramo.
3. **Simplificación opcional en `ComercioService.aResponseDTO`/`AdministradorService.aAdminResponseDTO`**: ambos métodos hoy resuelven el representante con una vuelta extra a `PersonaFisicaRepository.findById(...)`, que con `Dueno.personaFisica` disponible directamente deja de ser necesaria (`comercio.getDueno().getPersonaFisica()` alcanza sin ir al repositorio). ¿Se aprovecha este tramo para sacar esa dependencia redundante de ambas clases, o se prefiere no tocar más código del estrictamente necesario y dejarlo para otra oportunidad? Es un cambio de bajo riesgo pero no es parte de portar el comportamiento tal cual — es una mejora incidental.
4. **`RolUsuario.EMPLEADO`** — mismo punto ya abierto por el mapeo anterior, sigue sin resolver: ya que hay que tocar `RolUsuario.java` para el rename `COMERCIO`→`DUENO`, ¿se agrega también el valor `EMPLEADO` (declarado pero sin usar en ningún lado todavía), o se prefiere agregarlo recién cuando se planifique ese tramo?
5. **Enforcement de "1 Dueño = 1 Comercio"** — con `ComercioRepository.findByDuenoId(Integer)` devolviendo `Optional<Comercio>` (no una lista), un segundo `Comercio` para el mismo `Dueño` rompería ese método en tiempo de ejecución (JPA lanza excepción ante más de un resultado sobre un finder que no devuelve lista). Hoy esto no puede pasar porque cada registro de Comercio crea un `Dueno` nuevo desde cero — pero, igual que ya pasaba con `persona_juridica_id` en el modelo viejo, no hay ningún `UNIQUE` en `comercio.dueno_id` que lo impida a nivel de base. ¿Confirmar que se deja exactamente así (sin agregar ninguna restricción nueva), mismo criterio que ya regía antes de este tramo?

## 4. Propuesta de orden de sub-pasos

Borrador pensado para que, si hay que cortar la sesión de implementación a la mitad, el estado intermedio sea lo más manejable posible — no es una decisión cerrada.

1. **`RolUsuario.java`** — rename `COMERCIO`→`DUENO`. Rompe la compilación de 3 archivos (`AuthService`, `RegistroService`, `SecurityConfig`) de inmediato — se hace primero precisamente para que el compilador vaya marcando todo lo que falta, en vez de tener que recordarlo a mano.
2. **`Dueno.java` (Entity nueva) + `DuenoRepository.java` (nuevo)** — no rompen nada por sí solos, se pueden agregar y compilar en verde antes de tocar `Comercio`.
3. **`Comercio.java`** (relación `personaJuridica`→`dueno`) **+ `ComercioRepository.findByDuenoId`** — este es el paso que definitivamente deja el proyecto sin compilar hasta el paso 5. Se hace en un commit/paso separado igual, para que el diff de "qué cambió en el modelo" quede aislado del diff de "quién lo consume".
4. **`SecurityConfig.java`** (2 líneas `hasRole`) — trivial, se puede hacer en cualquier punto entre el paso 1 y el 5, se agrupa acá por prolijidad (va de la mano del rename del rol).
5. **`RegistroService.java`** — restaura el flujo de alta de Comercio (crea `Dueno`, usa `RolUsuario.DUENO`, usa `.dueno(...)` en el builder). Con este paso, el registro de un Comercio nuevo ya vuelve a ser posible end-to-end.
6. **Los 5 Services restantes en un solo paso** (`ComercioService`, `ProductoService`, `PedidoService`, `AuthService`, `AdministradorService`) — se agrupan porque comparten el mismo `findByDuenoId`/`getDueno()...` y dejarlos a medias no compila; separarlos no ahorra nada porque ninguno es usable de forma aislada hasta que los 5 estén.
7. **Verificación de backend**: `mvn compile` (`BUILD SUCCESS`) primero, después contra la base real (`bajonea_final`, una vez apuntado `application.properties` si no lo está ya): registro de Comercio completo → verificación de email → aprobación por Administrador → producto → pedido → aceptar/rechazar, más una prueba puntual de `propagarBloqueoAComercio`/`restaurarComercioSiCorresponde` (bloquear por intentos fallidos, confirmar `CERRADO_TEMPORALMENTE`, recuperar contraseña, confirmar que vuelve a `APROBADO`) para no dar por sentado que el rename de finder no rompió ese flujo silenciosamente.
8. **Frontend — los 12 literales `'COMERCIO'`→`'DUENO'`** (`js/comercio.js`, `js/catalogo.js`, `js/notificaciones.js`, `splash.html`) — recién acá, porque hasta que el backend no emite `DUENO` de verdad en el JWT no hay forma de probar el cambio contra datos reales.
9. **Verificación end-to-end final**: login de Comercio real desde el navegador (splash → dashboard), campana de notificaciones, perfil, y una pasada por Postman de los requests que tocan estos endpoints (aunque no cambien de contrato, conviene confirmar que ninguno quedó afectado indirectamente por el nuevo valor de `rol`).

## 5. Riesgos y puntos de mayor cuidado

- **R1 — Scope creep hacia la lógica de propagación/`mp_vinculado` del diccionario** (ver Pregunta 1). Es el riesgo de mayor impacto: el diccionario está escrito como una especificación funcional completa, y es fácil que una implementación cuidadosa termine "corrigiendo" `AuthService` para que propague a todos los comercios de un Dueño o que empiece a mantener `mp_vinculado`, sin que eso haya sido pedido. Mitigación: dejar el código de propagación funcionalmente idéntico al actual (mismo alcance de un único comercio), solo con el rename de finder/rol, y no tocar `mp_vinculado`/`cerrado_manualmente` en absoluto en este tramo.
- **R2 — La doble relación `@OneToOne` de `Dueno` es un patrón nuevo sin precedente en el proyecto.** Cada otra Entity de identidad (`Cliente`, `Administrador`, `PersonaFisica`, `PersonaJuridica`, `Persona`) tiene exactamente una relación que además define su PK vía `@MapsId`. `Dueno` necesita esa misma relación hacia `PersonaJuridica` (correcta, ya tiene ejemplo para copiar) **más** una segunda relación hacia `PersonaFisica` que es una FK común (`persona_fisica_id`, `NOT NULL`, `UNIQUE`) — no participa de la PK. Un error de anotación acá (por ejemplo, agregar `@MapsId` también en el lado de `PersonaFisica` por copiar el patrón de la primera relación sin pensarlo, o dejar de marcar `unique = true` en el `@JoinColumn`) compilaría sin errores pero generaría un mapeo incorrecto contra el schema real — se detectaría recién al intentar un `INSERT`/`SELECT` real contra la base, no en compilación. Mitigación: revisar esta Entity con especial atención antes de dar el paso 2 por cerrado, comparando explícitamente contra `bajonea_final.sql` líneas 231-241.
- **R3 — Integridad `Dueno.persona_fisica_id` ↔ `Dueno.id` (vía `PersonaJuridica`) sin FK que la garantice.** El diccionario es explícito: ambas relaciones deben apuntar a la misma `Persona`, y esto es responsabilidad exclusiva de `RegistroService`. Hoy, dentro de la misma transacción de `registrarComercio(...)`, ambas entidades (`personaFisica`, `personaJuridica`) se construyen a partir del mismo objeto `persona` local — el riesgo de que se desalineen es bajo mientras el código siga teniendo esa forma, pero es exactamente el tipo de invariante silencioso que un refactor futuro (por ejemplo, si se separa la creación de `PersonaFisica` en un método reutilizable compartido con `Empleado`) podría romper sin que ningún test lo note, porque no hay una excepción de base de datos que lo impida.
- **R4 — Los ~8 sitios de traversal `getPersonaJuridica()`→`getDueno().getPersonaJuridica()`/`getPersonaFisica()` repartidos entre `ComercioService` y `AdministradorService` son casi copy-paste entre sí** (`aResponseDTO` y `aAdminResponseDTO` arman DTOs casi idénticos). Un find-replace mecánico corre el riesgo de mezclar `getPersonaJuridica()` con `getPersonaFisica()` en algún punto puntual (son navegaciones distintas ahora, antes convergían todas en el mismo `getPersonaJuridica().getPersona()...`). Mitigación: revisar los dos métodos lado a lado después del cambio, campo por campo, contra lo que devolvían antes.
- **R5 — `propagarBloqueoAComercio`/`restaurarComercioSiCorresponde` (`AuthService`) asumen un único comercio por usuario vía `Optional`, no `List`.** No es un problema para este tramo (la regla de negocio sigue siendo 1:1 en la práctica, ver Pregunta 5), pero es exactamente el punto exacto que un futuro tramo de "varios comercios por Dueño" va a tener que reabrir — vale la pena dejarlo señalado para no perderlo de vista, sin tocarlo ahora (ligado a R1/Pregunta 1: no es tarea de este tramo anticiparlo).

## Confirmación de alcance de esta sesión

No se escribió, editó ni generó ningún archivo de `backend/` ni de `frontend/`. No se modificó `docs/DECISIONES.md` ni `CLAUDE.md`. No se conectó ni modificó ninguna base de datos (ninguna consulta SQL se ejecutó; toda la comparación estructural se hizo contra `docs/bajonea_final.sql`, ya versionado en el repo). El único archivo nuevo de esta sesión es este mismo documento, `docs/ANALISIS-PREVIO-TRAMO6-COMERCIO-DUENO.md`.
