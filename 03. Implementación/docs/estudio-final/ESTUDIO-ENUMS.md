# ESTUDIO — Carpeta `enums/`

> Material de estudio para el final del TFC Bajoneá. Basado en el código real de
> `backend/src/main/java/com/bajonea/backend/enums/` — **24 enums**.

---

## Qué es un enum y por qué el proyecto usa tantos

Un **enum** es un tipo de dato con **una lista cerrada de valores posibles**. En vez de guardar el
estado de un pedido como un `String` (donde alguien podría escribir `"pendiente"`, `"PENDIENTE"` o
`"pendinte"`), lo guardás como un enum: **solo existen los valores que declaraste, y punto.**

### Las tres ventajas, para contarlas en la mesa

1. **El compilador te protege.** Si escribís `EstadoPedido.PENDIETE`, el proyecto **no compila**.
   Con un String, ese error recién aparecería en producción.
2. **Es autodocumentado.** Mirás el enum y sabés todos los valores posibles sin buscar en la base.
3. **Validación gratis.** Si el frontend manda un valor que no existe, Jackson falla al convertir
   el JSON y Spring devuelve un **400** solo, sin que escribas ni un `if`.

### `@Enumerated(EnumType.STRING)` — la decisión importante

En todas las entidades los enums se guardan con `@Enumerated(EnumType.STRING)`. Eso significa que
en MySQL la columna guarda el **texto** `"PENDIENTE"`, no un número.

**Por qué es crucial:** la alternativa (`EnumType.ORDINAL`) guarda la **posición** del valor en la
lista — `0`, `1`, `2`. El problema es que si mañana insertás un valor nuevo en el medio del enum,
**todas las filas ya guardadas cambian de significado en silencio**. Un pedido que decía `ENTREGADO`
pasaría a decir `RECHAZADO` sin que nadie toque la base. Es un bug catastrófico y silencioso.

Con `STRING` eso no puede pasar: el texto guardado siempre significa lo mismo. Además podés abrir
phpMyAdmin y leer la tabla sin traducir números mentalmente.

---

# GRUPO 1 — ROLES Y ESTADOS DE USUARIO

## 1.1 `RolUsuario` — quién es cada uno

| Valor | Qué significa en el negocio |
|---|---|
| `CLIENTE` | El comprador. Navega el catálogo, arma el carrito y hace pedidos. |
| `DUENO` | El dueño de uno o más comercios. Gestiona productos y responde pedidos. |
| `ADMINISTRADOR` | El gestor de la plataforma. Aprueba comercios y administra categorías y tags. |

**Este enum es el que viaja adentro del JWT** como claim `rol`, y es lo que `SecurityConfig` usa
para decidir a qué rutas entra cada uno. `JwtAuthenticationFilter` lo convierte en
`ROLE_CLIENTE`, `ROLE_DUENO` o `ROLE_ADMINISTRADOR`.

**Dato que puede caer:** se llama **`DUENO`** y no `COMERCIO`. Eso cambió cuando el proyecto pasó
del MVP al modelo completo: antes un usuario **era** un comercio; ahora un usuario es un **dueño**
que puede tener varios comercios. El rol pertenece a la persona, no al negocio.

---

## 1.2 `EstadoUsuario` — el ciclo de vida de una cuenta

| Valor | Qué significa | Puede loguearse |
|---|---|---|
| `PENDIENTE` | Se registró pero **todavía no verificó su email**. | No |
| `ACTIVO` | Cuenta normal, funcionando. | Sí |
| `BLOQUEADO` | Se bloqueó por **3 intentos fallidos** de contraseña. | No |
| `SUSPENDIDO` | El administrador la suspendió. | No |
| `INACTIVO` | Cuenta dada de baja (por inactividad o a pedido). | No, pero se puede reactivar |

**El recorrido normal de una cuenta:**

```
   Registro
      |
      v
  PENDIENTE ---(verifica el email)---> ACTIVO
                                         |
             +---------------------------+---------------------------+
             |                           |                           |
       3 fallos de login          el admin actúa            baja / inactividad
             |                           |                           |
             v                           v                           v
        BLOQUEADO                   SUSPENDIDO                   INACTIVO
             |                                                       |
      (recuperar contrasena)                              (token de reactivacion)
             |                                                       |
             +--------------------> ACTIVO <-------------------------+
```

**Detalles concretos del proyecto:**
- El bloqueo se destraba **por el flujo de recuperación de contraseña**, que además pone
  `intentosFallidos = 0`.
- La reactivación usa un token con **24 horas** de vigencia.
- Al bloquear una cuenta, **se cierran sus sesiones activas** (`Sesion.activa = false`).

---

## 1.3 `TipoCierreSesion` — por qué se cerró una sesión

| Valor | Qué significa |
|---|---|
| `MANUAL` | El usuario hizo logout él mismo. |
| `AUTOMATICO` | La cerró el sistema (por ejemplo, por vencimiento). |
| `FORZADO` | Se cerró por seguridad: bloqueo de cuenta, cambio de contraseña, login concurrente. |

Es **auditoría real**: mirando la tabla `sesion` podés distinguir un logout normal de un cierre por
seguridad.

---

## 1.4 `TipoToken` y `EstadoToken`

### `TipoToken` — para qué sirve el código

| Valor | Qué significa | Vigencia |
|---|---|---|
| `VERIFICACION_EMAIL` | Confirmar que el email existe, al registrarse. | — |
| `RECUPERACION_PASSWORD` | Resetear la contraseña olvidada. | **30 minutos** |
| `REACTIVACION_CUENTA` | Volver a activar una cuenta `INACTIVO`. | **24 horas** |

### `EstadoToken` — en qué anda ese código

| Valor | Qué significa |
|---|---|
| `PENDIENTE` | Generado y todavía sin usar. Es el único que sirve. |
| `UTILIZADO` | Ya se consumió. **Un solo uso.** |
| `EXPIRADO` | Se pasó de la fecha de vencimiento. |

**Por qué un token es de un solo uso:** si pudieras reutilizarlo, alguien que consiga acceso a tu
correo viejo podría resetear tu contraseña muchas veces. Marcarlo `UTILIZADO` lo quema al instante.

---

# GRUPO 2 — COMERCIO

## 2.1 `EstadoComercio` — el ciclo de aprobación

| Valor | Qué significa | Aparece en el catálogo público |
|---|---|---|
| `PENDIENTE` | Se registró y **espera que el admin lo revise**. | No |
| `APROBADO` | El admin lo aprobó. Puede operar. | **Sí** |
| `RECHAZADO` | El admin lo rechazó, con motivo. | No |
| `SUSPENDIDO` | El admin lo suspendió después de haberlo aprobado. | No |
| `INACTIVO` | Dado de baja. | No |
| `CERRADO_TEMPORALMENTE` | El comercio se cerró por su cuenta un tiempo (vacaciones, reformas). | No |

**Lo importante:** `CatalogoService` filtra por `estado = APROBADO`. **Un comercio pendiente o
rechazado es invisible para el público**, aunque exista en la base.

**Nota honesta sobre el alcance:** el flujo implementado hoy cubre `PENDIENTE → APROBADO` y
`PENDIENTE → RECHAZADO`. Los estados `SUSPENDIDO`, `INACTIVO` y `CERRADO_TEMPORALMENTE` están
declarados en el modelo de datos completo pero **no tienen todavía un flujo de API que los
produzca**. *(Si te preguntan, decilo así — es más sólido que inventar un flujo que no existe.)*

**Dónde queda el motivo del rechazo:** en la tabla `HistorialEstadoComercio`, no en una columna del
comercio. Esa tabla es la única fuente del motivo.

---

## 2.2 `TipoComercio` — qué clase de negocio es

12 valores: `RESTAURANTE`, `EMPRENDIMIENTO`, `ROTISERIA`, `HELADERIA`, `CAFETERIA`, `PANADERIA`,
`PIZZERIA`, `PARRILLA`, `BAR`, `KIOSCO`, `FOOD_TRUCK`, `OTRO`.

Sirve para clasificar el comercio en el catálogo y para los chips de filtro. **Incluir `OTRO` es
buena práctica**: siempre va a haber un caso que no encaje, y sin ese valor el usuario quedaría
trabado en el formulario.

---

## 2.3 `TipoRedSocial` — dónde encontrar al comercio

| Valor | Qué es |
|---|---|
| `INSTAGRAM`, `FACEBOOK`, `TIKTOK`, `WHATSAPP`, `X` | Las redes. |
| `SITIO_WEB` | La web propia del comercio. |
| `OTRO` | Cualquier otra cosa. |

`X` es el nombre actual de Twitter.

---

## 2.4 `DiaSemana`

`LUNES`, `MARTES`, `MIERCOLES`, `JUEVES`, `VIERNES`, `SABADO`, `DOMINGO`.

Sin acentos ni eñes, porque un identificador de Java conviene tenerlo en ASCII puro y así el valor
que se guarda en MySQL nunca depende de la codificación.

Se usa en `Horario`: **una fila por franja**. Un día sin ninguna fila significa cerrado; dos filas
del mismo día es un horario partido.

---

# GRUPO 3 — DATOS FISCALES

## 3.1 `CondicionIva` — la situación impositiva

| Valor | Qué significa en criollo |
|---|---|
| `RESPONSABLE_INSCRIPTO` | Inscripto en IVA; factura A y discrimina el impuesto. |
| `EXENTO` | Exento de IVA por ley. |
| `NO_INSCRIPTO` | No está inscripto en IVA. |
| `MONOTRIBUTO` | Régimen simplificado, el más común en comercios chicos. |
| `RESPONSABLE_NACIONAL` | Otra categoría del régimen impositivo. |

---

## 3.2 `TipoPersonaJuridica` — la forma societaria

18 valores. Los más conocidos:

| Valor | Qué es |
|---|---|
| `SA` | Sociedad Anónima. |
| `SRL` | Sociedad de Responsabilidad Limitada — la más común en pymes. |
| `SAS` | Sociedad por Acciones Simplificada. |
| `EU` | Empresa Unipersonal. |
| `UTE` | Unión Transitoria de Empresas. |

El resto (`SC`, `SCS`, `SCRL`, `SCSA`, `SCCS`, `CC`, `CS`, `CCSA`, `CA`, `SP`, `ST`, `ACP`, `EMP`)
son otras formas societarias del derecho argentino, incluidas para cubrir el abanico completo.

---

# GRUPO 4 — PRODUCTO

## 4.1 `EstadoProducto`

| Valor | Qué significa | Se puede pedir |
|---|---|---|
| `DISPONIBLE` | Se puede comprar. | Sí |
| `AGOTADO` | Se acabó **por ahora**. Vuelve. | No |
| `DESCONTINUADO` | Ya no se vende más. Baja definitiva. | No |

**La diferencia entre `AGOTADO` y `DESCONTINUADO` es de negocio:** el primero es temporal (se
acabó la milanesa de hoy), el segundo es permanente (se sacó del menú). Se distinguen para que el
comercio pueda reactivar uno y archivar el otro.

**Un producto siempre nace `DISPONIBLE`** — lo decide `ProductoService`, no viene en el DTO. Se
cambia después con `PATCH /productos/{id}/estado`.

**Regla de negocio importante:** cuando un producto pasa a `AGOTADO`, **se limpia de los carritos
activos** que lo tuvieran. Ese es el método `limpiarCarritosActivos` de `ProductoService` — y ahí
apareció un bug real: cuando un carrito quedaba vacío por eso, no se le reseteaba el campo
`comercio`, así que el cliente quedaba "atado" a un comercio sin tener nada en el carrito.

---

# GRUPO 5 — PEDIDO (el grupo más grande)

## 5.1 `EstadoPedido` — 11 valores, pero no todos en uso

| Valor | Qué significa |
|---|---|
| `PENDIENTE_PAGO` | Esperando que se acredite el pago (MercadoPago). |
| `PENDIENTE` | Hecho, esperando que el comercio lo acepte o rechace. |
| `EN_PREPARACION` | El comercio lo aceptó y lo está cocinando. |
| `EN_CAMINO` | Salió para entrega a domicilio. |
| `LISTO_PARA_RETIRAR` | Listo, esperando que el cliente pase a buscarlo. |
| `ENTREGADO` | Terminado con éxito. |
| `RECHAZADO` | El comercio no lo tomó, con motivo. |
| `CANCELADO` | Lo canceló el cliente o el comercio. |
| `ANULADO` | Se anuló después de haber sido aceptado. |
| `CANCELADO_POR_SISTEMA` | Lo canceló un proceso automático. |
| `EXPIRADO` | Nadie respondió a tiempo. |

### Lo que hay que saber contar honestamente

**El enum tiene 11 valores, pero la lógica implementada hoy solo maneja estas transiciones:**

```
PENDIENTE ---(el comercio acepta)---> EN_PREPARACION
    |
    +-------(el comercio rechaza)---> RECHAZADO
```

**No hay `ENTREGADO`, ni `EN_CAMINO`, ni cancelaciones.** Los otros 8 valores pertenecen al modelo
de datos completo (con MercadoPago, timers de expiración y la máquina de estados extendida), que
está declarado en el modelo pero **cuya lógica de negocio todavía no está implementada en los
services**. Está registrado como tramo pendiente en CLAUDE.md §1bis.

**Consecuencia concreta que salió en la construcción del frontend:** la pantalla de detalle de
pedido del comercio (CO21) quedó deliberadamente de **solo lectura** cuando el pedido está
`EN_PREPARACION` — no hay ningún botón que sugiera una acción que el backend no soporta. Es un
criterio de diseño consciente: **nunca mostrar un control que no hace nada**.

**Y otra:** el resumen del día del dashboard cuenta `EN_PREPARACION` como "facturado hoy", porque
sin `ENTREGADO` no hay un estado final de éxito. Está documentado como deuda técnica, no como
descuido.

---

## 5.2 `MotivoRechazo` — el único enum con etiquetas

Es el único del proyecto que **tiene un atributo y un método propios**:

| Valor | Etiqueta (`getEtiqueta()`) |
|---|---|
| `SIN_STOCK` | "Sin stock" |
| `CERRADO` | "Comercio cerrado" |
| `ALTO_VOLUMEN_PEDIDOS` | "Alto volumen de pedidos" |
| `PRODUCTO_NO_DISPONIBLE_TEMPORAL` | "Producto no disponible temporalmente" |
| `SIN_DELIVERY_DISPONIBLE` | "Sin delivery disponible" |
| `PROBLEMA_TECNICO` | "Problema técnico" |
| `OTRO` | "Otro" |

### Cómo está hecho

```java
private final String etiqueta;
MotivoRechazo(String etiqueta) { this.etiqueta = etiqueta; }
public String getEtiqueta() { return etiqueta; }
```

**Por qué existe la etiqueta:** el valor técnico (`ALTO_VOLUMEN_PEDIDOS`) es feo de mostrarle a un
usuario. La etiqueta es el texto legible ("Alto volumen de pedidos"). Así **el código y la interfaz
están sincronizados**: si mañana cambia el texto, se cambia en un solo lugar, sin buscar en el
frontend.

Esto muestra algo que a veces sorprende: **un enum en Java no es solo una lista de constantes**,
puede tener atributos, constructor y métodos, como cualquier clase.

---

## 5.3 `EstadoDetallePedido` — el estado línea por línea

| Valor | Qué significa |
|---|---|
| `ACTIVO` | La línea es válida y cuenta para el total. |
| `CANCELADO` | Se dio de baja esa línea puntual. |
| `ANULADO` | Se anuló esa línea. |

**Por qué el detalle tiene su propio estado:** para poder anular **un producto** del pedido sin
cancelar el pedido entero. Si de tres cosas se acabó una, el comercio anula esa línea y entrega las
otras dos.

---

## 5.4 `EstadoPagoPedido`

| Valor | Qué significa |
|---|---|
| `PENDIENTE` | Todavía no se pagó. |
| `PAGADO` | Pago acreditado. |
| `RECHAZADO` | El pago falló. |

Pertenece al tramo de MercadoPago, todavía sin lógica implementada en los services.

---

## 5.5 `TipoEntrega`

| Valor | Qué significa |
|---|---|
| `DOMICILIO` | Delivery. **Requiere `direccionId`.** |
| `RETIRO` | El cliente pasa a buscarlo. **No requiere dirección.** |

Es el enum del que depende una de las validaciones condicionales más citadas del proyecto:
`PedidoRequestDTO.direccionId` **no tiene `@NotNull`**, porque solo es obligatorio si el tipo es
`DOMICILIO`. Eso se valida en `PedidoService`, no con una anotación.

---

## 5.6 `CanceladoPor` y `FuenteEntrega`

### `CanceladoPor`

| Valor | Quién canceló |
|---|---|
| `CLIENTE` | El cliente se arrepintió. |
| `COMERCIO` | El comercio no pudo cumplir. |
| `SISTEMA` | Un proceso automático (timeout, etc.). |

### `FuenteEntrega`

| Valor | Qué significa |
|---|---|
| `CLIENTE` | El cliente retira. |
| `COMERCIO` | El comercio entrega. |
| `COMERCIO_SIN_RETIRO` | El comercio entrega y no ofrece retiro. |
| `SISTEMA` | Lo determinó el sistema. |

Ambos pertenecen a la máquina de estados extendida, todavía sin flujo implementado.

---

# GRUPO 6 — NOTIFICACIONES

## 6.1 `TipoNotificacion` — 31 valores

El enum más grande del proyecto. Agrupados por tema:

**Sobre pedidos (14):** `NUEVO_PEDIDO`, `PEDIDO_ACEPTADO`, `PEDIDO_RECHAZADO`,
`PEDIDO_EN_CAMINO`, `PEDIDO_LISTO_RETIRO`, `AVISO_75MIN_SIN_CONFIRMACION`,
`PEDIDO_AUTOCONFIRMADO`, `PEDIDO_CANCELADO_CLIENTE`, `PEDIDO_ANULADO_COMERCIO`,
`PEDIDO_CANCELADO_SISTEMA`, `PEDIDO_EXPIRADO_CLIENTE`, `PEDIDO_EXPIRADO_COMERCIO`,
`PEDIDO_CERRADO_TIMER_SUSPENSION`, `PEDIDO_AUTOCONFIRMADO_COMERCIO`.

**Sobre comercios (6):** `COMERCIO_APROBADO`, `COMERCIO_RECHAZADO`, `COMERCIO_SUSPENDIDO`,
`NUEVO_COMERCIO_PENDIENTE`, `NUEVA_RESOLICITUD_COMERCIO`, `COMERCIO_INACTIVADO`.

**Sobre reclamos y soporte (4):** `NUEVO_RECLAMO`, `RECLAMO_APROBADO`, `RECLAMO_RECHAZADO`,
`NUEVO_MENSAJE_SOPORTE`.

**Sobre cuentas (4):** `CUENTA_INACTIVADA`, `CLIENTE_SUSPENDIDO`, `SUSPENSION_LEVANTADA`,
`REEMBOLSO_FALLIDO_DEFINITIVO`.

**Otras (3):** `PRODUCTO_REMOVIDO_CARRITO`, `INVITACION_EMPLEADO`, `EMPLEADO_DESACTIVADO`.

**Los que efectivamente se disparan hoy** son los 5 sitios reales de creación de notificaciones en
`PedidoService` (nuevo pedido, aceptado, rechazado), `ProductoService` (producto removido del
carrito) y `AdministradorService` (comercio aprobado/rechazado). El resto están declarados para
funcionalidades del modelo completo todavía sin implementar (empleados, reclamos, soporte,
reembolsos).

---

## 6.2 `TipoEntidadNotificacion`

| Valor | Qué significa |
|---|---|
| `PEDIDO` | La notificación es sobre un pedido. |
| `COMERCIO` | Es sobre un comercio. |

Se combina con `entidadId` para armar la **referencia polimórfica**: `entidadTipo = PEDIDO` +
`entidadId = 42` significa "esta notificación se refiere al pedido 42". Antes había un campo
`pedido_id` fijo; con este par la tabla sirve para cualquier entidad.

---

## 6.3 `CanalNotificacion` y `EstadoEnvioNotificacion`

### `CanalNotificacion`

| Valor | Qué significa |
|---|---|
| `PUSH` | La notificación in-app (la campanita, con polling cada 15 segundos). |
| `EMAIL` | Por correo. |

### `EstadoEnvioNotificacion`

| Valor | Qué significa |
|---|---|
| `PENDIENTE` | Todavía no se envió. |
| `ENVIADO` | Salió bien. |
| `FALLIDO` | No se pudo enviar. |

Sirve para poder reintentar los envíos que fallaron sin duplicar los que salieron bien.

---

# Tabla resumen de los 24 enums

| Enum | Valores | Dónde se usa |
|---|:---:|---|
| `RolUsuario` | 3 | `Usuario.rol`, claim del JWT |
| `EstadoUsuario` | 5 | `Usuario.estado` |
| `TipoCierreSesion` | 3 | `Sesion.tipoCierre` |
| `TipoToken` | 3 | `Token.tipo` |
| `EstadoToken` | 3 | `Token.estado` |
| `EstadoComercio` | 6 | `Comercio.estado`, `HistorialEstadoComercio` |
| `TipoComercio` | 12 | `Comercio.tipoComercio` |
| `TipoRedSocial` | 7 | `RedSocial.tipo` |
| `DiaSemana` | 7 | `Horario.diaSemana` |
| `CondicionIva` | 5 | `PersonaJuridica.condicionIva` |
| `TipoPersonaJuridica` | 18 | `PersonaJuridica.tipoSociedad` |
| `EstadoProducto` | 3 | `Producto.estado` |
| `EstadoPedido` | 11 | `Pedido.estado` |
| `MotivoRechazo` | 7 | `Pedido.motivoRechazo` (**tiene etiqueta**) |
| `EstadoDetallePedido` | 3 | `DetallePedido.estado` |
| `EstadoPagoPedido` | 3 | `Pedido.pagoEstado` |
| `TipoEntrega` | 2 | `Pedido.tipoEntrega` |
| `CanceladoPor` | 3 | `Pedido.canceladoPor` |
| `FuenteEntrega` | 4 | `Pedido.fuenteEntrega` |
| `TipoNotificacion` | 31 | `Notificacion.tipo` |
| `TipoEntidadNotificacion` | 2 | `Notificacion.entidadTipo` |
| `CanalNotificacion` | 2 | `Notificacion.canal` |
| `EstadoEnvioNotificacion` | 3 | `Notificacion.estado` |

---

# Preguntas típicas de mesa

**"¿Por qué usás enums en vez de Strings?"**
Porque el compilador me protege de errores de tipeo, el código se autodocumenta, y si el frontend
manda un valor inválido Spring devuelve 400 solo, sin que yo escriba nada.

**"¿Cómo se guardan en la base?"**
Con `@Enumerated(EnumType.STRING)`, o sea como texto. Nunca ORDINAL, porque si insertás un valor en
el medio del enum, todas las filas guardadas cambian de significado en silencio.

**"¿Cuántos estados tiene un pedido?"**
El enum declara 11, del modelo completo. La lógica implementada hoy maneja `PENDIENTE →
EN_PREPARACION` y `PENDIENTE → RECHAZADO`. El resto corresponde a tramos —MercadoPago, timers,
cancelaciones— todavía no implementados en los services.

**"¿Cuál es la diferencia entre AGOTADO y DESCONTINUADO?"**
Agotado es temporal (se acabó hoy, vuelve mañana), descontinuado es definitivo (se sacó del menú).

**"¿Qué es la etiqueta de MotivoRechazo?"**
Es un atributo del enum con el texto legible para el usuario. `ALTO_VOLUMEN_PEDIDOS` es el valor
técnico, "Alto volumen de pedidos" es lo que ve la persona. Así el texto vive en un solo lugar.

---

# Índice de enums cubiertos en este documento

| Archivo | Para qué sirve |
|---|---|
| `RolUsuario.java` | Los 3 roles del sistema. |
| `EstadoUsuario.java` | Ciclo de vida de una cuenta. |
| `TipoCierreSesion.java` | Por qué se cerró una sesión. |
| `TipoToken.java` | Qué clase de código temporal es. |
| `EstadoToken.java` | Si el código sigue sirviendo. |
| `EstadoComercio.java` | Ciclo de aprobación del comercio. |
| `TipoComercio.java` | Qué clase de negocio es. |
| `TipoRedSocial.java` | Qué red social es. |
| `DiaSemana.java` | Los días para los horarios. |
| `CondicionIva.java` | Situación impositiva de la empresa. |
| `TipoPersonaJuridica.java` | Forma societaria (SA, SRL, SAS...). |
| `EstadoProducto.java` | Disponible, agotado o descontinuado. |
| `EstadoPedido.java` | Los 11 estados del pedido (2 transiciones implementadas). |
| `MotivoRechazo.java` | Por qué el comercio rechazó un pedido, con etiqueta legible. |
| `EstadoDetallePedido.java` | Estado de una línea puntual del pedido. |
| `EstadoPagoPedido.java` | Estado del pago. |
| `TipoEntrega.java` | Domicilio o retiro. |
| `CanceladoPor.java` | Quién canceló el pedido. |
| `FuenteEntrega.java` | Quién realiza la entrega. |
| `TipoNotificacion.java` | Los 31 tipos de aviso del sistema. |
| `TipoEntidadNotificacion.java` | A qué entidad apunta una notificación. |
| `CanalNotificacion.java` | Por dónde se manda (push o email). |
| `EstadoEnvioNotificacion.java` | Si el envío salió bien. |
