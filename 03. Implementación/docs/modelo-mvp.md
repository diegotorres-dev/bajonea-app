# Modelo de datos — Bajoneá MVP

**Fuente:** recorte de [`diccionario-de-datos.md`](../../02.%20Diseño/03.%20Diagramas%20de%20Bases%20de%20Datos/03.%20Diccionario%20de%20Datos/diccionario-de-datos.md) (versión 1.2, modelo completo) a las entidades que sí entran al MVP, según la sección 0 de `GUIA-IMPLEMENTACION-MVP-BAJONEA.md` y la sección 5 de `CLAUDE.md`. Son **23 tablas**: las 20 de `CLAUDE.md` §5, más `Persona` (reincorporada en la segunda revisión, ver nota de alcance 1), más `Sesion` (reincorporada en la Fase 7 mediante enmienda formal de alcance, ver nota de alcance 12), más `HistorialEstadoComercio` (reincorporada en la Fase 8 con el mismo criterio, ver nota de alcance 13) — `CLAUDE.md` queda pendiente de actualizar en su próxima revisión.

**Motor:** MySQL (InnoDB). **Convención de nombres:** tablas y columnas en `snake_case`, PK `id`, FK `<entidad>_id`.

Este documento es el insumo directo para las migraciones Flyway (Fase 2.3) y las Entities JPA (Fase 4). Todavía **no** genera SQL.

---

## 0. Notas de alcance y criterios aplicados (revisar antes de aprobar)

El diccionario completo tiene más columnas y enums de los que necesita el MVP porque modela funcionalidad fuera de alcance (pagos/MercadoPago, historial de estados, suspensión operativa, horarios, soporte, reclamos). El criterio general fue: **tomar el diccionario completo como base de columnas/tipos para las entidades del MVP, y quitar únicamamente lo que depende de una funcionalidad explícitamente fuera de alcance** (sección 0 de la guía). Los puntos que vos cerraste explícitamente en tu mensaje (Provincia/Localidad, Direccion, ImagenProducto, `Pedido.estado`) se respetaron tal cual los pediste y no se reabrieron.

Puntos donde tuve que aplicar criterio propio — marcados para tu revisión:

1. **`Persona` se reincorpora tal cual el diccionario completo** (corrección tras primera revisión): es un nodo intermedio real de la jerarquía, con PK compartida con `Usuario` (`persona.id` FK → `usuario.id`), y tanto `PersonaFisica` como `PersonaJuridica` cuelgan de `Persona` (FK → `persona.id`), no directamente de `Usuario`. Esto sube el total de tablas del MVP a 21 (`CLAUDE.md` §5 listaba 20 sin `Persona`; a actualizar en su próxima revisión).
   > **Nota para la Fase 4 (Entities), no resolver ahora:** esta es una decisión de *modelo de datos*, separada de la decisión de *mapeo JPA*. La Fase 4.1 de la guía sugiere `@MapsId` directo `Usuario → PersonaFisica/PersonaJuridica` como simplificación de mapeo, pero esa recomendación asumía que `Persona` no existía como tabla física. Ahora que `Persona` sí existe en el schema, al mapear las Entities hay que encadenar la cadena completa `Usuario → Persona → PersonaFisica/PersonaJuridica`, ya sea con `@MapsId` encadenado en cada eslabón o con `@Inheritance(strategy = InheritanceType.JOINED)` sobre `Persona` — no saltear el nodo intermedio.
2. **`Usuario.estado` y `Comercio.estado` mantienen el enum completo del diccionario** (5 y 6 valores respectivamente), por fidelidad al modelo y porque no cuesta nada extra en el schema. Desde la enmienda de alcance de la Fase 7 (ver nota 12), `PENDIENTE`↔`ACTIVO` (verificación de email), `ACTIVO`↔`BLOQUEADO` (bloqueo por 3 intentos fallidos / desbloqueo por recuperación de contraseña) e `INACTIVO`→`ACTIVO` (reactivación por token) tienen mecanismo de transición real; en `Comercio`, `PENDIENTE`/`APROBADO`/`RECHAZADO` y la propagación `APROBADO`↔`CERRADO_TEMPORALMENTE` (espejo del bloqueo/desbloqueo del usuario representante) también. **Sigue sin haber mecanismo alguno para `SUSPENDIDO`** (ni en Usuario ni en Comercio — acción exclusiva de Administrador, explícitamente fuera de alcance) **ni para la transición automática `ACTIVO → INACTIVO`** (requiere el job de 3 meses sin actividad, explícitamente fuera de alcance; ver nota 12). Esos valores quedan declarados pero sin uso funcional en esta etapa.
3. **`Usuario` no incluye `email_verificado`, pero sí incluye `intentos_fallidos` desde la Fase 7** (ver nota 12). `email_verificado` sigue siendo redundante con `estado` (la transición `PENDIENTE → ACTIVO` ya representa la verificación). `intentos_fallidos` (`INT NOT NULL DEFAULT 0`) cuenta los intentos fallidos de login y de cambio de contraseña desde perfil; se resetea a 0 al autenticar con éxito o al recuperar la contraseña.
4. **`Comercio` reincorpora `foto_perfil_url`, nullable** (corrección tras la tercera revisión): `VARCHAR(500) NULL`, a diferencia del diccionario completo (que la define `NOT NULL`) porque en el MVP **no se pide en el registro** — el comercio la sube o reemplaza después desde la edición de su perfil. Esto resuelve la nota operativa que había quedado abierta en la segunda revisión. El MVP debe incluir un endpoint de edición de perfil de Comercio (`PUT /comercios/perfil`, ya previsto en `ComercioController`, Fase 9.3 de la guía) que permita setear/reemplazar `foto_perfil_url` después del registro — ya estaba implícito en el alcance general ("editar perfil del usuario"), ahora queda explícito para este campo puntual. `Comercio` sigue excluyendo `cerrado_manualmente` y `fecha_resolicitud` (sin endpoint que los gestione en la Fase 9) y `mp_vinculado` (MercadoPago, fuera de alcance). Mantiene `telefono`, `email`, `acepta_delivery`, `acepta_retiro`.
5. **`PersonaJuridica` reincorpora `condicion_iva`, `domicilio_fiscal` y `fecha_inicio_actividades`** (corrección tras primera revisión), tal cual el diccionario completo: son parte del registro real del comercio, no un detalle descartable. `condicion_iva` trae de vuelta el enum `CondicionIva` (ver sección 1). Se mantiene `razon_social`, `cuit`, `tipo_sociedad` con el enum `TipoPersonaJuridica` completo de 18 valores.
6. **`Token` usa un booleano `usado`** (más `fecha_uso` nullable) **en vez del enum `EstadoToken`** (`PENDIENTE`/`UTILIZADO`/`EXPIRADO`) del diccionario completo, siguiendo literalmente la Fase 4.2 de la guía. No hay job periódico de expiración en el MVP; la expiración se valida al consumir el token comparando `fecha_vencimiento` contra `NOW()`. Esta simplificación **se mantiene** tras la enmienda de la Fase 7 (nota 12): agregar los dos tipos de token nuevos no requiere el enum `EstadoToken` ni un job. El enum `tipo` originalmente se restringía a un solo valor (`VERIFICACION_EMAIL`); desde la Fase 7 incluye también `RECUPERACION_PASSWORD` y `REACTIVACION_CUENTA`, los 3 valores del diccionario completo (ver nota 12).
7. **`Carrito` no incluye `activo`.** En el diccionario completo depende del concepto de sesión server-side y de inactivación de cuenta. La justificación original de esta nota decía "el MVP usa JWT stateless sin tabla de sesiones" — desde la nota 12, `Sesion` sí existe en el MVP, pero **esta columna de `Carrito` no fue parte de la enmienda de la Fase 7** (que solo tocó autenticación: login, recuperación de contraseña, bloqueo, reactivación) y el job de inactivación de cuenta sigue fuera de alcance. `Carrito.activo` se mantiene excluido sin cambios.
8. **`DetallePedido` incluye `nota`** (no está en la lista abreviada de la Fase 4.2, pero sí en el diccionario completo, que documenta explícitamente que se copia desde `ItemCarrito.nota` al confirmar el pedido). Sin este campo, la aclaración del cliente ("sin cebolla") se perdería al pasar de carrito a pedido — se mantuvo por sentido funcional, ya que la Fase 4.2 aclara que sus listas son "atributos clave", no exhaustivas.
9. **`Pedido.estado` usa 3 valores del `EstadoPedido` del diccionario completo: `PENDIENTE`, `EN_PREPARACION`, `RECHAZADO`** (corrección tras primera revisión: la primera versión de este documento inventaba un valor `ACEPTADO` que no existe en el diccionario; `EN_PREPARACION` ya es semánticamente "el comercio aceptó el pedido y lo está preparando", así que es el valor correcto — no hacía falta un valor nuevo). Es un subconjunto real del `EstadoPedido` completo, no un enum aparte. El MVP corta el flujo apenas el comercio confirma que lo está preparando: no incluye `EN_CAMINO`, `LISTO_PARA_RETIRAR`, `ENTREGADO`, `ANULADO`, `EXPIRADO`, `CANCELADO_POR_SISTEMA`, ni `PENDIENTE_PAGO` (pago fuera de alcance).
10. **No se incluye `Horario`.** No está en la lista de 20 entidades del MVP (`CLAUDE.md` §5) y la guía es explícita: "horarios de atención granulares... no bloquea pedidos por horario" está fuera de alcance.
11. **Timestamps de auditoría** (`fecha_creacion` / `fecha_modificacion` / `fecha_baja` donde el diccionario completo los tiene) se mantuvieron en general por ser metadata de bajo riesgo sin dependencia de tablas de historial — no representan una decisión de alcance, solo trazabilidad básica. La única tabla donde se te repitió el listado exacto sin timestamps fue `ImagenProducto`, que en el diccionario completo tampoco los tiene.

12. **`Sesion` se reincorpora en la Fase 7 mediante enmienda formal de alcance del MVP** (no es un olvido corregido — la sección 0 de la guía excluye `Sesion` explícitamente por nombre y advierte contra reincorporar "algo ya documentado en el proyecto completo" sin volver a ese punto 0; la reincorporación fue una decisión consciente, documentada con su justificación completa en `docs/DECISIONES.md`, entrada del cierre de Fase 6 / inicio de Fase 7). Motivo: los requisitos funcionales de recuperación de contraseña, bloqueo de cuenta tras 3 intentos fallidos y reactivación de cuenta (`01. Análisis de Requerimientos/04. Requisitos Funcionales/requisitos-funcionales-generales.md`) exigen invalidar sesiones activas de forma real, algo que un JWT puramente stateless no puede cumplir sin alguna forma de estado server-side. Alcance exacto de la reincorporación (deliberadamente acotado, no el módulo de sesiones completo del diccionario):
    - Tabla `sesion` tal cual el diccionario completo, sin recortar ninguna columna (`id`, `usuario_id`, `activa`, `fecha_inicio`, `fecha_cierre`, `tipo_cierre`, `ip_origen`, `navegador`, `dispositivo` — `dispositivo` nullable, sin parser de user-agent implementado todavía, pero la columna existe), ver sección 5.
    - `Usuario.intentos_fallidos` (ver nota 3) y ampliación de `TipoToken` a 3 valores (ver nota 6).
    - **Explícitamente NO incluido** en esta enmienda, sigue fuera de alcance del MVP: `HistorialEstadoUsuario`, `HistorialEstadoComercio` (sin tabla de historial — las transiciones de estado no quedan auditadas, solo el estado actual), suspensión de cuenta/comercio por Administrador, el job de inactivación automática por 3 meses sin actividad, y la notificación por email de "cierre de sesión por login concurrente" que menciona el diccionario completo (se cierra la sesión anterior en silencio, sin notificación adicional). `confirmarReactivacionCuenta` se implementa igual en la Fase 7 aunque, sin el job, nada dispara `INACTIVO` todavía en la práctica — queda funcional para cuando el job exista.
    - El JWT deja de ser puramente stateless: incorpora un claim `sesionId`, y `JwtAuthenticationFilter` valida `Sesion.activa = true` en cada request además de la firma del token (ver `CLAUDE.md` §7, a actualizar).

13. **`HistorialEstadoComercio` se reincorpora en la Fase 8** mediante el mismo criterio de enmienda consciente que `Sesion` (nota 12) — nombrada explícitamente en "Entidades que NO entran al MVP" de la sección 0 de la guía, reincorporada porque `AdministradorService.resolverAprobacion` la necesita de forma real, no hipotética. Motivo concreto: el diccionario completo **eliminó** `Comercio.motivo_rechazo` en su versión v1.1 a favor de centralizar el motivo en `HistorialEstadoComercio.motivo` — no existe (ni existió) una alternativa de "agregar una columna a `Comercio`" fiel al modelo; la única forma correcta de persistir el motivo de un rechazo es esta tabla. Alcance exacto:
    - Tabla `historial_estado_comercio` tal cual el diccionario completo (`id`, `comercio_id`, `administrador_id` nullable, `estado_origen` nullable, `estado_destino`, `motivo`, `fecha_hora`), append-only (sin `UPDATE`/`DELETE` previstos, mismo patrón que `Sesion`).
    - Se inserta una fila en **cada** transición de `Comercio.estado` resuelta por `AdministradorService.resolverAprobacion` (aprobación y rechazo), no solo en rechazo — historial completo, mismo criterio que ya se sigue para `Usuario` en el diccionario.
    - `HistorialEstadoComercioRepository` queda **sin finders custom** por ahora (ver `docs/DECISIONES.md`, 2026-07-17): el finder de "último motivo de rechazo" que sugiere el diccionario completo no tiene consumidor real todavía (no hay flujo de re-solicitud en este MVP, `Comercio.fecha_resolicitud` sigue excluida). Se agrega cuando exista un caso de uso real, mismo estándar que se le exige a cualquier finder de este proyecto (ver nota de `ComercioRepository.findByPersonaJuridicaId`, Fase 7).
    - **No** se reincorpora `HistorialEstadoUsuario` en esta misma pasada — sigue explícitamente fuera de alcance hasta que algún Service la necesite de forma real, mismo criterio aplicado caso por caso, no una apertura general de todos los históricos del diccionario completo.

Si alguno de estos 13 puntos no es el criterio que querés, avisame antes de pasar a Flyway — es mucho más barato ajustarlo acá que después de tener migraciones aplicadas.

---

## 1. Enums utilizados en el MVP

| Enum | Valores | Notas |
|---|---|---|
| `RolUsuario` | `CLIENTE`, `COMERCIO`, `ADMINISTRADOR` | Sin cambios respecto al diccionario completo. |
| `EstadoUsuario` | `PENDIENTE`, `ACTIVO`, `BLOQUEADO`, `SUSPENDIDO`, `INACTIVO` | Solo `PENDIENTE`/`ACTIVO` tienen transición implementada en el MVP (ver nota 2). |
| `CondicionIva` | `RESPONSABLE_INSCRIPTO`, `EXENTO`, `NO_INSCRIPTO`, `MONOTRIBUTO`, `RESPONSABLE_NACIONAL` | Enum completo (5 valores), reincorporado en la segunda revisión junto con `PersonaJuridica.condicion_iva` (ver nota 5). |
| `TipoPersonaJuridica` | `SA`, `SRL`, `SAS`, `SC`, `SCS`, `SCRL`, `SCSA`, `SCCS`, `CC`, `CS`, `CCSA`, `CA`, `SP`, `ST`, `ACP`, `EMP`, `EU`, `UTE` | Enum completo (18 valores), sin recorte — así lo pide la Fase 4.2 de la guía. |
| `TipoComercio` | `RESTAURANTE`, `EMPRENDIMIENTO` | Sin cambios. |
| `EstadoComercio` | `PENDIENTE`, `APROBADO`, `RECHAZADO`, `SUSPENDIDO`, `INACTIVO`, `CERRADO_TEMPORALMENTE` | Solo `PENDIENTE`/`APROBADO`/`RECHAZADO` tienen transición implementada en el MVP (ver nota 2). |
| `TipoToken` | `VERIFICACION_EMAIL`, `RECUPERACION_PASSWORD`, `REACTIVACION_CUENTA` | Enum completo (3 valores), ampliado en la Fase 7 (ver nota 12). Originalmente restringido a 1 solo valor. |
| `TipoCierreSesion` | `MANUAL`, `AUTOMATICO`, `FORZADO` | Incorporado en la Fase 7 junto con `Sesion` (ver nota 12). En el MVP solo `MANUAL` (logout) y `FORZADO` (bloqueo, recuperación de contraseña, cambio de contraseña, login concurrente) tienen uso funcional; `AUTOMATICO` queda declarado sin uso (no hay timeout de sesión inactiva en el MVP). |
| `EstadoProducto` | `DISPONIBLE`, `AGOTADO`, `DESCONTINUADO` | Sin cambios; los 3 valores tienen uso funcional. |
| `TipoEntrega` | `DOMICILIO`, `RETIRO` | Equivalente al `ModalidadEntrega` del diccionario completo; renombrado según la Fase 3 de la guía (paquete `entities/enums/TipoEntrega.java`). |
| `MotivoRechazo` | `SIN_STOCK`, `CERRADO`, `ALTO_VOLUMEN_PEDIDOS`, `PRODUCTO_NO_DISPONIBLE_TEMPORAL`, `SIN_DELIVERY_DISPONIBLE`, `PROBLEMA_TECNICO`, `OTRO` | Enum completo (7 valores), sin recorte. |
| `EstadoPedido` (MVP) | `PENDIENTE`, `EN_PREPARACION`, `RECHAZADO` | Subconjunto real de 3 valores del `EstadoPedido` completo del diccionario (corregido en la segunda revisión — ver nota 9). |

**Enums del diccionario completo que NO entran al MVP** (tablas/columnas asociadas fuera de alcance): `DiaSemana`, `EstadoToken`, `EstadoPagoPedido`, `CanceladoPor`, `FuenteEntrega`, `EstadoNotaCredito`, `EstadoReclamo`, `ResolucionSoporte`, `CanalNotificacion`, `EstadoEnvioNotificacion`, `TipoNotificacion`.

---

## 2. Módulo Geografía

### Tabla: `provincia`

**Descripción:** catálogo estático de provincias de Argentina, precargado por ETL desde la API Georef (Fase 2bis). De solo lectura desde la aplicación.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---|---|---|---|---|---|
| `id` | VARCHAR(2) | NO | — | PK | Código Georef de la provincia (ej. `"T"` para Tierra del Fuego). |
| `nombre` | VARCHAR(100) | NO | — | NN | Nombre completo de la provincia. |

**Índices:** `PRIMARY KEY (id)`

---

### Tabla: `localidad`

**Descripción:** catálogo estático de localidades de Argentina, precargado por el mismo ETL. Cada localidad pertenece a una provincia. **Excepción puntual (Tramo 16.12, 2026-07-28, `docs/DECISIONES.md`):** Tolhuin (Tierra del Fuego) no existe en el endpoint `/localidades` de Georef — solo en `/municipios` — así que el ETL nunca la trae por más veces que se reejecute. Se cargó vía una migración Flyway dedicada (`V16__seed_localidad_tolhuin.sql`, id `940021` reutilizado de `/municipios`), no por el script — es la única fila de `provincia`/`localidad` que no viene del ETL.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---|---|---|---|---|---|
| `id` | VARCHAR(15) | NO | — | PK | Identificador alfanumérico Georef de la localidad. |
| `nombre` | VARCHAR(150) | NO | — | NN | Nombre de la localidad (ej. `"Río Grande"`). |
| `provincia_id` | VARCHAR(2) | NO | — | FK → `provincia.id`, NN | Provincia a la que pertenece. |

**Índices:** `PRIMARY KEY (id)` \| `INDEX (provincia_id)`

---

## 3. Módulo Identidad

### Tabla: `usuario`

**Descripción:** entidad central de identidad. Credenciales, rol y estado operacional. Sin tabla de historial de estados (fuera de alcance del MVP).

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---|---|---|---|---|---|
| `id` | INT | NO | AI | PK, AI | Identificador único. Compartido con `persona` (cadena `usuario` → `persona` → `persona_fisica`/`persona_juridica`). |
| `email` | VARCHAR(150) | NO | — | NN, UQ | Identificador de acceso, único en toda la plataforma. |
| `password_hash` | VARCHAR(255) | NO | — | NN | Hash BCrypt de la contraseña. |
| `rol` | ENUM `RolUsuario` | NO | — | NN | `CLIENTE`, `COMERCIO` o `ADMINISTRADOR`. |
| `estado` | ENUM `EstadoUsuario` | NO | `'PENDIENTE'` | NN | Ver nota de alcance 2. |
| `intentos_fallidos` | INT | NO | `0` | NN | Contador de intentos fallidos de login o de cambio de contraseña desde perfil. Se resetea a `0` al autenticar con éxito o al recuperar la contraseña. Al llegar a 3, `estado → BLOQUEADO` (agregado en la Fase 7, ver nota 12). |
| `fecha_registro` | DATETIME | NO | `NOW()` | NN | Fecha de creación del registro. Inmutable. |
| `fecha_ultimo_acceso` | DATETIME | SÍ | NULL | — | Fecha del último login exitoso. Informativo (sin job de inactivación en el MVP). |
| `fecha_actualizacion` | DATETIME | SÍ | NULL | — | Fecha de la última modificación del registro. |

**Índices:** `PRIMARY KEY (id)` \| `UNIQUE (email)` \| `INDEX (rol)` \| `INDEX (estado)`

---

### Tabla: `persona`

**Descripción:** nodo intermedio real de la jerarquía de herencia, tal cual el diccionario completo (reincorporada en la segunda revisión — ver nota de alcance 1). Vincula `usuario` con su subtipo concreto (`persona_fisica` o `persona_juridica`). Comparte PK con `usuario`.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---|---|---|---|---|---|
| `id` | INT | NO | — | PK, FK → `usuario.id` | Mismo valor que `usuario.id`. Sin `AUTO_INCREMENT` propio. |

**Índices:** `PRIMARY KEY (id)`

---

### Tabla: `persona_fisica`

**Descripción:** datos personales de usuarios con identidad individual (Cliente, Administrador). `id` comparte PK con `persona.id`.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---|---|---|---|---|---|
| `id` | INT | NO | — | PK, FK → `persona.id` | Mismo valor que `persona.id`. Sin `AUTO_INCREMENT` propio. |
| `nombre` | VARCHAR(100) | NO | — | NN | Nombre(s) de pila. |
| `apellido` | VARCHAR(100) | NO | — | NN | Apellido(s). |
| `dni` | VARCHAR(10) | NO | — | NN, UQ | DNI argentino, único en la plataforma. |
| `fecha_nacimiento` | DATE | NO | — | NN | Fecha de nacimiento. |
| `telefono` | VARCHAR(30) | NO | — | NN | Teléfono con código de área. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha de la última actualización del perfil. |

**Índices:** `PRIMARY KEY (id)` \| `UNIQUE (dni)`

---

### Tabla: `persona_juridica`

**Descripción:** datos fiscales del titular de un comercio. `id` comparte PK con `persona.id`.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---|---|---|---|---|---|
| `id` | INT | NO | — | PK, FK → `persona.id` | Mismo valor que `persona.id`. Sin `AUTO_INCREMENT` propio. |
| `razon_social` | VARCHAR(150) | NO | — | NN | Nombre legal de la empresa. |
| `cuit` | VARCHAR(11) | NO | — | NN, UQ | CUIT (11 dígitos, sin guiones), único en la plataforma. |
| `condicion_iva` | ENUM `CondicionIva` | NO | — | NN | Situación ante el IVA según AFIP (reincorporada en la segunda revisión — ver nota 5). |
| `tipo_sociedad` | ENUM `TipoPersonaJuridica` | NO | — | NN | Forma jurídica (18 valores, ver sección 1). |
| `domicilio_fiscal` | VARCHAR(255) | NO | — | NN | Domicilio fiscal declarado ante AFIP. Puede diferir del domicilio operativo en `direccion` (reincorporada en la segunda revisión). |
| `fecha_inicio_actividades` | DATE | NO | — | NN | Fecha de inicio de actividades declarada ante AFIP (reincorporada en la segunda revisión). |

**Índices:** `PRIMARY KEY (id)` \| `UNIQUE (cuit)`

---

### Tabla: `cliente`

**Descripción:** subtipo de `persona_fisica` con rol `CLIENTE`. Nodo de unión para direcciones, carrito y pedidos. Sin columnas propias.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---|---|---|---|---|---|
| `id` | INT | NO | — | PK, FK → `persona_fisica.id` | Mismo valor que `persona_fisica.id`. |

**Índices:** `PRIMARY KEY (id)`

---

### Tabla: `administrador`

**Descripción:** subtipo de `persona_fisica` con rol `ADMINISTRADOR`. Sin columnas propias. Sin flujo de auto-registro — se siembra por Flyway (Fase 14.5 de la guía).

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---|---|---|---|---|---|
| `id` | INT | NO | — | PK, FK → `persona_fisica.id` | Mismo valor que `persona_fisica.id`. |

**Índices:** `PRIMARY KEY (id)`

---

### Tabla: `direccion`

**Descripción:** modelo completo, tal cual el diccionario íntegro. Dirección física de un cliente (varias posibles) o de un comercio (exactamente una). `cliente_id` y `comercio_id` son mutuamente excluyentes.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---|---|---|---|---|---|
| `id` | INT | NO | AI | PK, AI | Identificador único. |
| `calle` | VARCHAR(150) | NO | — | NN | Nombre de la calle. |
| `numero` | VARCHAR(10) | NO | — | NN | Número o altura. |
| `piso_depto` | VARCHAR(30) | SÍ | NULL | — | Piso y/o departamento. Opcional. |
| `codigo_postal` | VARCHAR(10) | NO | — | NN | Código postal. |
| `localidad_id` | VARCHAR(15) | NO | — | FK → `localidad.id`, NN | Localidad de la dirección. |
| `cliente_id` | INT | SÍ | NULL | FK → `cliente.id` | Mutuamente excluyente con `comercio_id` (ver regla abajo). |
| `comercio_id` | INT | SÍ | NULL | FK → `comercio.id`, UQ | Mutuamente excluyente con `cliente_id`. UQ: máximo una dirección por comercio. |
| `principal` | TINYINT(1) | NO | `false` | NN | `true` = dirección predeterminada del cliente. Solo aplica si `cliente_id` no es NULL. |
| `eliminada` | TINYINT(1) | NO | `false` | NN | Baja lógica. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha de creación. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha de la última edición. |
| `fecha_baja` | DATETIME | SÍ | NULL | — | Fecha de eliminación lógica. |

**Índices:** `PRIMARY KEY (id)` \| `UNIQUE (comercio_id)` \| `INDEX (cliente_id)` \| `INDEX (localidad_id)`

**Regla de negocio (exclusión mutua):** exactamente uno de `cliente_id` / `comercio_id` debe estar poblado; el otro debe ser `NULL`. **No se fuerza con un constraint SQL simple** (un `CHECK` portable de "exactamente uno de dos" en MySQL 8 es posible pero fue evaluado como innecesariamente rígido para esta etapa); se valida en `RegistroService` / `ProductoService` a nivel aplicación antes de persistir.

---

## 4. Módulo Comercio

### Tabla: `comercio`

**Descripción:** comercio gastronómico. Vinculado a una `persona_juridica` titular. Ver nota de alcance 4 (`cerrado_manualmente`, `fecha_resolicitud` y `mp_vinculado` quedan excluidos del diccionario completo; el resto de las columnas se mantiene).

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---|---|---|---|---|---|
| `id` | INT | NO | AI | PK, AI | Identificador único. |
| `persona_juridica_id` | INT | NO | — | FK → `persona_juridica.id`, NN | Titular legal. Por regla de negocio, 1 PersonaJuridica = 1 Comercio (no forzado con UNIQUE, igual que en el diccionario completo). |
| `nombre` | VARCHAR(150) | NO | — | NN | Nombre comercial / de fantasía. |
| `descripcion` | TEXT | SÍ | NULL | — | Descripción libre del comercio. |
| `foto_perfil_url` | VARCHAR(500) | SÍ | NULL | — | URL de Cloudinary de la foto de perfil del comercio. Opcional: se puede cargar en el momento del registro (Tramo 16.22, firma pública scoped a `comercios/pre-registro/` porque el comercio todavía no tiene `id`) o subir/modificar después desde la edición de su perfil. Distinta de la galería de `imagen_producto` (Fase 11). |
| `telefono` | VARCHAR(30) | NO | — | NN | Teléfono de contacto. |
| `email` | VARCHAR(150) | NO | — | NN | Email de contacto (puede diferir del email del usuario representante). |
| `tipo_comercio` | ENUM `TipoComercio` | NO | — | NN | `RESTAURANTE` o `EMPRENDIMIENTO`. |
| `acepta_delivery` | TINYINT(1) | NO | `false` | NN | `true` si ofrece entrega a domicilio. |
| `acepta_retiro` | TINYINT(1) | NO | `false` | NN | `true` si permite retiro en el local. |
| `estado` | ENUM `EstadoComercio` | NO | `'PENDIENTE'` | NN | Ver nota de alcance 2. |
| `fecha_registro` | DATETIME | NO | `NOW()` | NN | Fecha de alta. Inmutable. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha de la última modificación del perfil. |

**Índices:** `PRIMARY KEY (id)` \| `INDEX (persona_juridica_id)` \| `INDEX (estado)`

---

### Tabla: `historial_estado_comercio`

**Descripción:** reincorporada en la Fase 8 (ver nota de alcance 13). Registro histórico append-only de las transiciones de `Comercio.estado`. Única fuente del motivo de rechazo — `Comercio` no tiene columna propia para esto (eliminada en v1.1 del diccionario completo a favor de esta tabla).

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---|---|---|---|---|---|
| `id` | INT | NO | AI | PK, AI | Identificador único. |
| `comercio_id` | INT | NO | — | FK → `comercio.id`, NN | Comercio cuyo estado cambió. |
| `administrador_id` | INT | SÍ | NULL | FK → `administrador.id` | Administrador que ejecutó la transición. `NULL` = transición automática del sistema (ej. bloqueo del usuario representante → `CERRADO_TEMPORALMENTE`, fuera de esta fase). |
| `estado_origen` | ENUM `EstadoComercio` | SÍ | NULL | — | Estado antes de la transición. `NULL` solo en el primer registro. |
| `estado_destino` | ENUM `EstadoComercio` | NO | — | NN | Estado resultante. |
| `motivo` | VARCHAR(500) | SÍ | NULL | — | Motivo de la transición. Obligatorio a nivel Service para `RECHAZADO` (validado en `AdministradorService`, no en el schema). |
| `fecha_hora` | DATETIME | NO | `NOW()` | NN | Fecha y hora exacta de la transición. |

**Índices:** `PRIMARY KEY (id)` \| `INDEX (comercio_id)`

**Reglas de negocio:** tabla de solo inserción (append-only); no se modifica ni elimina ningún registro. Se inserta una fila en cada transición resuelta por `AdministradorService.resolverAprobacion` (aprobación y rechazo).

---

## 5. Módulo Seguridad y Sesiones

### Tabla: `token`

**Descripción:** tokens de un solo uso. Desde la Fase 7, cubre verificación de email, recuperación de contraseña y reactivación de cuenta (ver nota de alcance 6 y 12). Desde el Tramo 16.11 (2026-07-24, ver `docs/DECISIONES.md`), suma el contador `intentos_fallidos` para limitar fuerza bruta. Desde el Tramo 16.12 (2026-07-28), los 3 tipos se consumen siempre por email+código, nunca por link — los endpoints que resolvían por link (`RECUPERACION_PASSWORD`/`REACTIVACION_CUENTA`) se eliminaron, no se mantuvieron en paralelo.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---|---|---|---|---|---|
| `id` | INT | NO | AI | PK, AI | Identificador único. |
| `usuario_id` | INT | NO | — | FK → `usuario.id`, NN | Usuario dueño del token. |
| `tipo` | ENUM `TipoToken` | NO | — | NN | `VERIFICACION_EMAIL` (24hs), `RECUPERACION_PASSWORD` (30min) o `REACTIVACION_CUENTA` (24hs). Duración validada en `AuthService`, no en el schema. |
| `token` | VARCHAR(36) | NO | — | NN, UQ | Código numérico de 6 dígitos (`String`, con ceros a la izquierda) para los 3 tipos, pensado para tipeo manual — `VERIFICACION_EMAIL` desde el Tramo 16.11, `RECUPERACION_PASSWORD`/`REACTIVACION_CUENTA` desde el Tramo 16.12 (`docs/DECISIONES.md`). La columna sigue en `VARCHAR(36)` pese a que ningún tipo usa más de 6 caracteres hoy — angostarla no aporta nada y generaría una migración sin beneficio real. Generación con reintento ante colisión (`AuthService.generarToken`, hasta 5 intentos) — el `UNIQUE` de esta columna es de por vida sobre toda la tabla (las filas usadas no se borran), así que la probabilidad de choque crece con el tiempo de vida real del sitio. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha de generación. |
| `fecha_vencimiento` | DATETIME | NO | — | NN | Fecha de expiración. |
| `usado` | TINYINT(1) | NO | `false` | NN | `true` una vez consumido, o al superar `intentos_fallidos` (invalidación por fuerza bruta). |
| `fecha_uso` | DATETIME | SÍ | NULL | — | Fecha en que se consumió/invalidó. `NULL` mientras `usado = false`. |
| `intentos_fallidos` | INT | NO | `0` | NN | Agregada en el Tramo 16.11 (migración `V15__token_intentos_fallidos.sql`), en ese momento exclusiva de `VERIFICACION_EMAIL`. Desde el Tramo 16.12 se incrementa para los 3 tipos, vía el helper compartido `AuthService.obtenerTokenValidoPorCodigo`; al llegar a 5, el token se marca `usado = true` y hay que solicitar uno nuevo. |

**Índices:** `PRIMARY KEY (id)` \| `UNIQUE (token)` \| `INDEX (usuario_id, tipo, usado)`

---

### Tabla: `sesion`

**Descripción:** reincorporada en la Fase 7 mediante enmienda formal de alcance del MVP (ver nota de alcance 12 y `docs/DECISIONES.md`). Habilita invalidación real de sesión — imposible con JWT puramente stateless — para los flujos de bloqueo de cuenta, recuperación de contraseña, cambio de contraseña y login concurrente. Una fila por sesión iniciada; `activa = true` identifica la sesión vigente de un usuario.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---|---|---|---|---|---|
| `id` | INT | NO | AI | PK, AI | Identificador único de la sesión. Es el valor del claim `sesionId` del JWT. |
| `usuario_id` | INT | NO | — | FK → `usuario.id`, NN | Usuario que inició la sesión. |
| `activa` | TINYINT(1) | NO | `true` | NN | `true` mientras la sesión sigue vigente. `JwtAuthenticationFilter` la consulta en cada request. |
| `fecha_inicio` | DATETIME | NO | `NOW()` | NN | Fecha y hora del login exitoso. |
| `fecha_cierre` | DATETIME | SÍ | NULL | — | Fecha y hora del cierre. `NULL` mientras `activa = true`. |
| `tipo_cierre` | ENUM `TipoCierreSesion` | SÍ | NULL | — | `MANUAL` (logout) o `FORZADO` (bloqueo, recuperación/cambio de contraseña, login concurrente). `NULL` mientras `activa = true`. `AUTOMATICO` declarado sin uso en el MVP (ver sección 1). |
| `ip_origen` | VARCHAR(45) | NO | — | NN | IP del cliente al login. Admite IPv4 e IPv6. |
| `navegador` | VARCHAR(255) | SÍ | NULL | — | User-Agent del navegador al login. |
| `dispositivo` | VARCHAR(255) | SÍ | NULL | — | Información del dispositivo (SO, modelo). Columna tal cual el diccionario completo — no recortada. `NULL` mientras no se implemente detección real (parseo de User-Agent); no bloquea el resto del flujo, la columna admite `NULL`. |

**Índices:** `PRIMARY KEY (id)` \| `INDEX (usuario_id, activa)`

**Reglas de negocio (alcance MVP, ver nota 12 para lo explícitamente excluido):**
- Al hacer login: si ya existe una `Sesion` con `activa = true` para ese `usuario_id`, se cierra (`activa = false`, `tipo_cierre = FORZADO`, `fecha_cierre = NOW()`) antes de crear la nueva — máximo una sesión activa por usuario.
- Al bloquear el usuario (3 intentos fallidos) o al recuperar/cambiar la contraseña: se cierra la `Sesion` activa del usuario (`FORZADO`).
- Al hacer logout manual: se cierra la `Sesion` activa del usuario (`MANUAL`).
- No incluye la notificación por email de "cierre por login concurrente" del diccionario completo (ver nota 12) — el resto de la tabla es fiel al diccionario completo, incluida `dispositivo`.

---

## 6. Módulo Catálogo de Productos

### Tabla: `categoria`

**Descripción:** clasificación de productos, gestionada por el Administrador. Baja lógica.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---|---|---|---|---|---|
| `id` | INT | NO | AI | PK, AI | Identificador único. |
| `nombre` | VARCHAR(100) | NO | — | NN, UQ | Nombre único. |
| `activo` | TINYINT(1) | NO | `true` | NN | `true` si está disponible para asignar a productos. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha de creación. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha de la última modificación del nombre. |
| `fecha_baja` | DATETIME | SÍ | NULL | — | Fecha de desactivación lógica. |

**Índices:** `PRIMARY KEY (id)` \| `UNIQUE (nombre)`

---

### Tabla: `tag`

**Descripción:** etiquetas transversales de productos, gestionadas por el Administrador. Misma forma que `categoria`.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---|---|---|---|---|---|
| `id` | INT | NO | AI | PK, AI | Identificador único. |
| `nombre` | VARCHAR(100) | NO | — | NN, UQ | Nombre único (ej. `"Vegano"`, `"Sin TACC"`). |
| `activo` | TINYINT(1) | NO | `true` | NN | `true` si está disponible para asignar a productos. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha de creación. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha de la última modificación del nombre. |
| `fecha_baja` | DATETIME | SÍ | NULL | — | Fecha de desactivación lógica. |

**Índices:** `PRIMARY KEY (id)` \| `UNIQUE (nombre)`

---

### Tabla: `producto`

**Descripción:** productos ofrecidos por los comercios. El precio se congela en `detalle_pedido.precio_unitario` al confirmar el pedido.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---|---|---|---|---|---|
| `id` | INT | NO | AI | PK, AI | Identificador único. |
| `comercio_id` | INT | NO | — | FK → `comercio.id`, NN | Comercio propietario. |
| `categoria_id` | INT | NO | — | FK → `categoria.id`, NN | Categoría del producto. |
| `nombre` | VARCHAR(150) | NO | — | NN | Nombre del producto. |
| `descripcion` | TEXT | SÍ | NULL | — | Ingredientes, tamaño, alérgenos, etc. |
| `precio` | DECIMAL(10,2) | NO | — | NN | Precio unitario en ARS. |
| `estado` | ENUM `EstadoProducto` | NO | `'DISPONIBLE'` | NN | `DISPONIBLE`, `AGOTADO` o `DESCONTINUADO`. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha de publicación. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha de la última edición. |
| `fecha_baja` | DATETIME | SÍ | NULL | — | Fecha en que pasó a `DESCONTINUADO`. |

**Índices:** `PRIMARY KEY (id)` \| `INDEX (comercio_id)` \| `INDEX (categoria_id)` \| `INDEX (estado)`

**Reglas de negocio:** un producto `DESCONTINUADO` no puede volver a `DISPONIBLE`. Al pasar a `AGOTADO` o `DESCONTINUADO`, se elimina de los carritos activos que lo contengan (a nivel aplicación, `CarritoService`/`ProductoService`).

---

### Tabla: `imagen_producto`

**Descripción:** tal cual el diccionario completo. Galería de imágenes de un producto, alojadas en Cloudinary.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---|---|---|---|---|---|
| `id` | INT | NO | AI | PK, AI | Identificador único. |
| `producto_id` | INT | NO | — | FK → `producto.id`, NN | Producto al que pertenece. |
| `url` | VARCHAR(500) | NO | — | NN | URL pública en Cloudinary. |
| `orden` | INT | NO | `0` | NN | Orden de visualización (0 = primera posición). |
| `es_principal` | TINYINT(1) | NO | `false` | NN | `true` = imagen de portada. Solo una por producto puede ser `true`. |

**Índices:** `PRIMARY KEY (id)` \| `INDEX (producto_id)`

**Reglas de negocio:** el máximo de **5 imágenes por producto** se valida a nivel aplicación (`CloudinaryService`/`ProductoService`), **no** con un constraint de schema — MySQL no tiene una forma nativa de limitar el conteo de filas relacionadas. Ídem para "solo una `es_principal = true` por producto".

---

### Tabla: `producto_tag`

**Descripción:** unión M:N entre `producto` y `tag`.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---|---|---|---|---|---|
| `producto_id` | INT | NO | — | PK (componente), FK → `producto.id` | Producto etiquetado. |
| `tag_id` | INT | NO | — | PK (componente), FK → `tag.id` | Tag asignado. |

**Índices:** `PRIMARY KEY (producto_id, tag_id)` \| `INDEX (tag_id)`

---

## 7. Módulo Operaciones

### Tabla: `carrito`

**Descripción:** carrito de compras del cliente. Exactamente uno por cliente, un único comercio a la vez. Sin campo `activo` (ver nota de alcance 7).

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---|---|---|---|---|---|
| `id` | INT | NO | AI | PK, AI | Identificador único. |
| `cliente_id` | INT | NO | — | FK → `cliente.id`, NN, UQ | Un solo carrito por cliente. |
| `comercio_id` | INT | SÍ | NULL | FK → `comercio.id` | Comercio de los ítems actuales. `NULL` si el carrito está vacío. |

**Índices:** `PRIMARY KEY (id)` \| `UNIQUE (cliente_id)` \| `INDEX (comercio_id)`

---

### Tabla: `item_carrito`

**Descripción:** ítems individuales del carrito.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---|---|---|---|---|---|
| `id` | INT | NO | AI | PK, AI | Identificador único. |
| `carrito_id` | INT | NO | — | FK → `carrito.id`, NN | Carrito al que pertenece. |
| `producto_id` | INT | NO | — | FK → `producto.id`, NN | Producto representado. |
| `cantidad` | INT | NO | — | NN | Mínimo 1 (validado en `CarritoService`). |
| `nota` | VARCHAR(255) | SÍ | NULL | — | Aclaración del cliente (ej. `"Sin cebolla"`). |

**Índices:** `PRIMARY KEY (id)` \| `INDEX (carrito_id)` \| `INDEX (producto_id)`

---

### Tabla: `pedido`

**Descripción:** pedido simulado. Ciclo de vida recortado del MVP: `PENDIENTE → EN_PREPARACION / RECHAZADO`. Sin pago, sin flujo de entrega/reembolso posterior a `EN_PREPARACION` (ver nota de alcance 9).

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---|---|---|---|---|---|
| `id` | INT | NO | AI | PK, AI | Identificador único. |
| `cliente_id` | INT | NO | — | FK → `cliente.id`, NN | Cliente que realizó el pedido. |
| `comercio_id` | INT | NO | — | FK → `comercio.id`, NN | Comercio receptor. |
| `direccion_id` | INT | SÍ | NULL | FK → `direccion.id` | Obligatorio si `tipo_entrega = DOMICILIO`; `NULL` si `RETIRO`. |
| `tipo_entrega` | ENUM `TipoEntrega` | NO | — | NN | `DOMICILIO` o `RETIRO`. |
| `estado` | ENUM `EstadoPedido` (MVP) | NO | `'PENDIENTE'` | NN | `PENDIENTE`, `EN_PREPARACION` o `RECHAZADO`. |
| `motivo_rechazo` | ENUM `MotivoRechazo` | SÍ | NULL | — | Solo poblado si `estado = RECHAZADO`. |
| `comentario_rechazo` | VARCHAR(500) | SÍ | NULL | — | Texto libre complementario. Obligatorio en la aplicación si `motivo_rechazo = OTRO`. |
| `subtotal` | DECIMAL(10,2) | NO | — | NN | Suma de `detalle_pedido.subtotal`. Congelado al crear. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha de creación. Inmutable. |

**Índices:** `PRIMARY KEY (id)` \| `INDEX (cliente_id)` \| `INDEX (comercio_id)` \| `INDEX (estado)` \| `INDEX (fecha_creacion)`

---

### Tabla: `detalle_pedido`

**Descripción:** snapshot de cada ítem del pedido al momento de confirmarse.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---|---|---|---|---|---|
| `id` | INT | NO | AI | PK, AI | Identificador único. |
| `pedido_id` | INT | NO | — | FK → `pedido.id`, NN | Pedido al que pertenece. |
| `producto_id` | INT | NO | — | FK → `producto.id`, NN | Producto pedido (referencia histórica). |
| `cantidad` | INT | NO | — | NN | Unidades pedidas. |
| `precio_unitario` | DECIMAL(10,2) | NO | — | NN | Congelado desde `producto.precio`. Inmutable. |
| `nota` | VARCHAR(255) | SÍ | NULL | — | Copiada desde `item_carrito.nota` al confirmar. |
| `subtotal` | DECIMAL(10,2) | NO | — | NN | `precio_unitario × cantidad`. |

**Índices:** `PRIMARY KEY (id)` \| `INDEX (pedido_id)`

---

## 8. Módulo Notificaciones

### Tabla: `notificacion`

**Descripción:** notificaciones in-app vía polling. Sin canal email, sin tipo estructurado (decisión cerrada en la sección 0 de la guía: "Tabla Notificacion básica (usuario, mensaje, leída, fecha)"). Ampliada en el Tramo 16.19 (ver `docs/DECISIONES.md`, 2026-07-29) con `pedido_id`, nullable a propósito — solo las notificaciones generadas desde `PedidoService` (nuevo pedido, aceptado, rechazado) la completan; el resto (aprobación de comercio, producto agotado en carrito) sigue sin vincularse a ningún pedido.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---|---|---|---|---|---|
| `id` | INT | NO | AI | PK, AI | Identificador único. |
| `usuario_id` | INT | NO | — | FK → `usuario.id`, NN | Destinatario. |
| `pedido_id` | INT | SÍ | — | FK → `pedido.id` | Pedido asociado, si corresponde (Tramo 16.19). |
| `mensaje` | VARCHAR(500) | NO | — | NN | Texto de la notificación. |
| `leida` | TINYINT(1) | NO | `false` | NN | `true` una vez marcada como leída. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha de generación. |

**Índices:** `PRIMARY KEY (id)` \| `INDEX (usuario_id, leida)`

---

## 9. Relaciones entre tablas

| # | Tabla origen | Campo FK | Tabla destino | Tipo | Cardinalidad | Descripción |
|---|---|---|---|---|---|---|
| 1 | `localidad` | `provincia_id` | `provincia` | N:1 | N localidades → 1 provincia | Ubicación geográfica jerárquica. |
| 2 | `persona` | `id` | `usuario` | 1:1 | PK compartida | Nodo intermedio de herencia (reincorporado en la segunda revisión — ver nota 1). |
| 3 | `persona_fisica` | `id` | `persona` | 1:1 | PK compartida | Subtipo concreto de `Persona`. |
| 4 | `persona_juridica` | `id` | `persona` | 1:1 | PK compartida | Subtipo concreto de `Persona`. Mutuamente excluyente con `persona_fisica`. |
| 5 | `cliente` | `id` | `persona_fisica` | 1:1 | PK compartida | Rol de negocio. Mutuamente excluyente con `administrador`. |
| 6 | `administrador` | `id` | `persona_fisica` | 1:1 | PK compartida | Rol de negocio. Mutuamente excluyente con `cliente`. |
| 7 | `comercio` | `persona_juridica_id` | `persona_juridica` | N:1 | 1:1 por regla de negocio | Titular legal del comercio. |
| 8 | `direccion` | `localidad_id` | `localidad` | N:1 | N direcciones → 1 localidad | Ubicación de la dirección. |
| 9 | `direccion` | `cliente_id` | `cliente` | N:1 | N direcciones → 1 cliente, nullable | Mutuamente excluyente con `comercio_id`. |
| 10 | `direccion` | `comercio_id` | `comercio` | 1:1 | UNIQUE, nullable | Dirección operativa única del comercio. |
| 11 | `token` | `usuario_id` | `usuario` | N:1 | N tokens → 1 usuario | Tokens de verificación de email. |
| 12 | `producto` | `comercio_id` | `comercio` | N:1 | N productos → 1 comercio | Catálogo del comercio. |
| 13 | `producto` | `categoria_id` | `categoria` | N:1 | N productos → 1 categoría | Clasificación. |
| 14 | `imagen_producto` | `producto_id` | `producto` | N:1 | N imágenes → 1 producto, máx. 5 | Galería del producto. |
| 15 | `producto_tag` | `producto_id` | `producto` | N:1 | — | Unión M:N: tags de un producto. |
| 16 | `producto_tag` | `tag_id` | `tag` | N:1 | — | Unión M:N: productos con un tag. |
| 17 | `carrito` | `cliente_id` | `cliente` | 1:1 | UNIQUE | Carrito único y persistente por cliente. |
| 18 | `carrito` | `comercio_id` | `comercio` | N:1 | nullable | Comercio activo en el carrito. |
| 19 | `item_carrito` | `carrito_id` | `carrito` | N:1 | N ítems → 1 carrito | Contenido del carrito. |
| 20 | `item_carrito` | `producto_id` | `producto` | N:1 | N ítems → 1 producto | Producto del ítem. |
| 21 | `pedido` | `cliente_id` | `cliente` | N:1 | N pedidos → 1 cliente | Pedidos del cliente. |
| 22 | `pedido` | `comercio_id` | `comercio` | N:1 | N pedidos → 1 comercio | Pedidos recibidos por el comercio. |
| 23 | `pedido` | `direccion_id` | `direccion` | N:1 | nullable, solo `DOMICILIO` | Dirección de entrega. |
| 24 | `detalle_pedido` | `pedido_id` | `pedido` | N:1 | N detalles → 1 pedido | Ítems snapshoteados del pedido. |
| 25 | `detalle_pedido` | `producto_id` | `producto` | N:1 | N detalles → 1 producto | Referencia histórica al producto. |
| 26 | `notificacion` | `usuario_id` | `usuario` | N:1 | N notificaciones → 1 usuario | Notificaciones del usuario. |
| 27 | `sesion` | `usuario_id` | `usuario` | N:1 | N sesiones → 1 usuario, máx. 1 con `activa = true` | Historial de sesiones (reincorporada en la Fase 7, ver nota 12). |
| 28 | `historial_estado_comercio` | `comercio_id` | `comercio` | N:1 | N transiciones → 1 comercio | Historial de estado (reincorporado en la Fase 8, ver nota 13). |
| 29 | `historial_estado_comercio` | `administrador_id` | `administrador` | N:1 | nullable | Administrador que ejecutó la transición. |

---

## 10. Restricciones UNIQUE — resumen

| Tabla | Campo(s) | Descripción |
|---|---|---|
| `usuario` | `email` | Email único en toda la plataforma. |
| `persona_fisica` | `dni` | DNI único en toda la plataforma. |
| `persona_juridica` | `cuit` | CUIT único en toda la plataforma. |
| `direccion` | `comercio_id` | Un comercio tiene exactamente una dirección. |
| `token` | `token` | UUID irrepetible. |
| `categoria` | `nombre` | Nombre único. |
| `tag` | `nombre` | Nombre único. |
| `carrito` | `cliente_id` | Un cliente tiene exactamente un carrito. |
| `producto_tag` | `(producto_id, tag_id)` | PK compuesta; evita tags duplicados por producto. |

---

## 11. Tablas del diccionario completo explícitamente excluidas del MVP

`Horario`, `CuentaMercadoPago`, `HistorialEstadoUsuario`, `HistorialEstadoPedido`, `ConfiguracionTarifa`, `Pago`, `NotaCredito`, `Reclamo`, `Soporte`.

`Sesion` **reincorporada en la Fase 7** (ver nota de alcance 12) — ya no está excluida. Ver sección 5.

`HistorialEstadoComercio` **reincorporada en la Fase 8** (ver nota de alcance 13) — ya no está excluida. Ver tabla `historial_estado_comercio`, sección 4 (Módulo Comercio).
