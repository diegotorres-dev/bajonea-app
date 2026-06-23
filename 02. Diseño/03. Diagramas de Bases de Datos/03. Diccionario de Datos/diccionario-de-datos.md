# Diccionario de Datos — Bajoneá

**Proyecto:** Bajoneá — Plataforma de pedidos gastronómicos en línea  
**Motor de base de datos:** MySQL (InnoDB)  
**ORM / Migraciones:** Spring Data JPA + Hibernate / Flyway  
**Versión del modelo:** 1.0  

---

## Convenciones

| Símbolo | Significado |
|---------|-------------|
| PK | Clave primaria |
| FK | Clave foránea |
| UQ | Restricción UNIQUE |
| NN | NOT NULL |
| AI | AUTO_INCREMENT |
| — | No aplica / valor NULL permitido |

- Todos los campos de tipo `datetime` se mapean a `DATETIME` en MySQL (precisión de segundos).
- El tipo `boolean` se almacena como `TINYINT(1)` en MySQL.
- Los ENUMs pueden implementarse como tipo `ENUM` nativo de MySQL o como `VARCHAR` con validación en la capa de aplicación (Spring). Ambas estrategias son válidas; la elección se delega a la implementación con Flyway.
- Los identificadores de `Provincia` y `Localidad` provienen del dataset Georef (datos.gob.ar) y se cargan mediante ETL inicial. No se crean desde la aplicación.
- Los campos `fecha_modificacion`, `fecha_baja`, `fecha_uso`, `fecha_resolucion` y similares son `NULL` hasta que ocurra el evento correspondiente.
- Las URLs almacenadas apuntan a recursos en Cloudinary. El backend valida el límite de 5 imágenes por producto antes de emitir firmas de subida.
- Los campos `access_token` y `refresh_token` de `CuentaMercadoPago` se almacenan como texto; en producción se recomienda cifrado a nivel de columna.

---

## 1. Tipos Enumerados (ENUMs)

---

### ENUM: RolUsuario

Define el rol funcional de un usuario dentro del sistema.

| Valor | Descripción |
|-------|-------------|
| `CLIENTE` | Usuario final que realiza pedidos. Asociado a `PersonaFisica` → `Cliente`. |
| `COMERCIO` | Representante de un comercio gastronómico. Asociado a `PersonaFisica` y a `PersonaJuridica` mediante `Comercio`. |
| `ADMINISTRADOR` | Operador interno con acceso a la gestión global de la plataforma. Asociado a `PersonaFisica` → `Administrador`. |

---

### ENUM: EstadoUsuario

Ciclo de vida del usuario en el sistema.

| Valor | Descripción |
|-------|-------------|
| `PENDIENTE` | Registrado pero con email aún sin verificar. No puede operar. |
| `ACTIVO` | Email verificado; puede operar con normalidad. |
| `BLOQUEADO` | Bloqueado tras 3 intentos fallidos de login o 3 intentos fallidos en el flujo de cambio de contraseña desde perfil. Desbloqueable exclusivamente mediante recuperación de contraseña por email. |
| `SUSPENDIDO` | Suspendido manualmente por el Administrador con motivo. Puede enviar mensaje de soporte para solicitar revisión. |
| `INACTIVO` | Inactivado automáticamente por el sistema tras 3 meses sin actividad (`fecha_ultimo_acceso`). Reactivable mediante token de reactivación. |

---

### ENUM: CondicionIva

Situación fiscal del titular del comercio ante la AFIP (Argentina).

| Valor | Descripción |
|-------|-------------|
| `RESPONSABLE_INSCRIPTO` | Inscripto en IVA; emite factura A o B con IVA discriminado. |
| `EXENTO` | Exento del pago del IVA por disposición legal. |
| `NO_INSCRIPTO` | No inscripto en el IVA. |
| `MONOTRIBUTO` | Adherido al régimen simplificado para pequeños contribuyentes. |
| `RESPONSABLE_NACIONAL` | Inscripción especial ante tributos nacionales (categoría residual). |

---

### ENUM: TipoPersonaJuridica

Formas jurídicas reconocidas en Argentina para la constitución de personas jurídicas con fines comerciales o cooperativos.

| Valor | Descripción |
|-------|-------------|
| `SA` | Sociedad Anónima |
| `SRL` | Sociedad de Responsabilidad Limitada |
| `SAS` | Sociedad por Acciones Simplificada (Ley 27.349) |
| `SC` | Sociedad Colectiva |
| `SCS` | Sociedad en Comandita Simple |
| `SCRL` | Sociedad Cooperativa de Responsabilidad Limitada |
| `SCSA` | Sociedad en Comandita por Acciones |
| `SCCS` | Sociedad en Comandita por Cuotas Sociales |
| `CC` | Cooperativa de Consumo |
| `CS` | Cooperativa de Servicios |
| `CCSA` | Cooperativa de Crédito Sociedad Anónima |
| `CA` | Cooperativa Agraria |
| `SP` | Sociedad de Participación |
| `ST` | Sociedad de Trabajadores |
| `ACP` | Asociación Civil con Personería Jurídica |
| `EMP` | Emprendedor / empresa en formación simplificada |
| `EU` | Empresa Unipersonal |
| `UTE` | Unión Transitoria de Empresas |

---

### ENUM: TipoComercio

Categoría de negocio del comercio dentro de la plataforma.

| Valor | Descripción |
|-------|-------------|
| `RESTAURANTE` | Establecimiento gastronómico formal con local físico. |
| `EMPRENDIMIENTO` | Negocio gastronómico informal o de pequeña escala (cocina emprendedora, delivery casero, etc.). |

---

### ENUM: EstadoComercio

Ciclo de vida del comercio en la plataforma.

| Valor | Descripción |
|-------|-------------|
| `PENDIENTE` | Solicitud de alta enviada; pendiente de revisión por el Administrador. No visible en el catálogo. |
| `APROBADO` | Aprobado por el Administrador. Visible y operable en la plataforma (sujeto a horario y `cerrado_manualmente`). |
| `RECHAZADO` | Solicitud rechazada por el Administrador con motivo. Puede presentar una re-solicitud de aprobación. |
| `SUSPENDIDO` | Suspendido por el Administrador. Oculto del catálogo. El representante puede enviar mensaje de soporte. |
| `INACTIVO` | Inactivado por propagación desde el usuario representante (3 meses sin actividad). Oculto del catálogo. |
| `CERRADO_TEMPORALMENTE` | Cerrado automáticamente por bloqueo del usuario representante. Se restaura a `APROBADO` al recuperar la contraseña. |

> **Regla de visibilidad:** El comercio se muestra como abierto únicamente si `estado = APROBADO AND usuario.estado = ACTIVO AND cerrado_manualmente = false AND hora actual dentro de alguna franja de Horario`.

---

### ENUM: DiaSemana

Días de la semana para la configuración de horarios del comercio.

| Valor | Descripción |
|-------|-------------|
| `LUNES` | Lunes |
| `MARTES` | Martes |
| `MIERCOLES` | Miércoles |
| `JUEVES` | Jueves |
| `VIERNES` | Viernes |
| `SABADO` | Sábado |
| `DOMINGO` | Domingo |

---

### ENUM: TipoAccionComercio

Tipo de acción administrativa registrada en `HistorialAccionComercio`.

| Valor | Descripción |
|-------|-------------|
| `APROBACION` | El Administrador aprobó la solicitud del comercio. |
| `RECHAZO` | El Administrador rechazó la solicitud del comercio. |
| `SUSPENSION` | El Administrador suspendió el comercio. |
| `REACTIVACION` | El Administrador levantó la suspensión del comercio. |

---

### ENUM: TipoToken

Propósito funcional del token de seguridad de un solo uso.

| Valor | Descripción |
|-------|-------------|
| `VERIFICACION_EMAIL` | Token enviado al registrarse para verificar la dirección de email. |
| `RECUPERACION_PASSWORD` | Token enviado para restablecer la contraseña olvidada. También desbloquea usuarios en estado `BLOQUEADO`. |
| `REACTIVACION_CUENTA` | Token enviado para reactivar una cuenta en estado `INACTIVO`. |

> Todos los tokens se generan como UUID v4, se almacenan en la tabla `Token` discriminada por `tipo`, expiran según la duración definida para cada tipo, y se invalidan tras su primer uso.

---

### ENUM: EstadoToken

Estado del ciclo de vida de un token.

| Valor | Descripción |
|-------|-------------|
| `PENDIENTE` | Token generado y aún no utilizado ni expirado. |
| `UTILIZADO` | Token consumido exitosamente. Fecha registrada en `fecha_uso`. |
| `EXPIRADO` | Token vencido según `fecha_vencimiento`. Un job periódico actualiza el estado de `PENDIENTE` a `EXPIRADO` cuando `fecha_vencimiento <= NOW()`. |

---

### ENUM: TipoCierreSesion

Motivo del cierre de una sesión de usuario.

| Valor | Descripción |
|-------|-------------|
| `MANUAL` | Cierre explícito realizado por el usuario (acción de logout). |
| `AUTOMATICO` | Cierre por expiración del tiempo de sesión inactiva. |
| `FORZADO` | Cierre forzado por el sistema: cambio de contraseña, bloqueo de cuenta, suspensión, inactivación o apertura de sesión concurrente. |

---

### ENUM: EstadoProducto

Estado de disponibilidad del producto en el catálogo.

| Valor | Descripción |
|-------|-------------|
| `DISPONIBLE` | Producto publicado y disponible para agregar al carrito. |
| `AGOTADO` | Sin stock temporalmente. Al marcarlo, el sistema elimina el ítem de los carritos activos y emite notificación T23 a los clientes afectados. Puede volver a `DISPONIBLE`. |
| `DESCONTINUADO` | Dado de baja lógica de forma definitiva. Al marcarlo, el sistema elimina el ítem de los carritos activos y emite notificación T23. No puede volver a `DISPONIBLE`. |

---

### ENUM: ModalidadEntrega

Forma de entrega elegida por el cliente al confirmar el pedido.

| Valor | Descripción |
|-------|-------------|
| `DOMICILIO` | El comercio envía el pedido al domicilio del cliente. Requiere `Pedido.direccion_id` no nulo. |
| `RETIRO` | El cliente retira el pedido en el local del comercio. `Pedido.direccion_id` es NULL. |

---

### ENUM: MotivoRechazo

Motivo estructurado por el cual el comercio rechazó un pedido en estado `PENDIENTE`.

| Valor | Descripción |
|-------|-------------|
| `SIN_STOCK` | Uno o más productos del pedido no están disponibles en stock. |
| `CERRADO` | El comercio no está atendiendo en este momento. |
| `ALTO_VOLUMEN_PEDIDOS` | El comercio tiene más pedidos de los que puede gestionar simultáneamente. |
| `PRODUCTO_NO_DISPONIBLE_TEMPORAL` | Algún producto del pedido está temporalmente no disponible. |
| `SIN_DELIVERY_DISPONIBLE` | No hay personal de reparto disponible para realizar la entrega. |
| `PROBLEMA_TECNICO` | Inconveniente técnico interno del comercio. |
| `OTRO` | Motivo no categorizado; se complementa con `Pedido.detalle_rechazo` en texto libre. |

---

### ENUM: EstadoPedido

Estados del ciclo de vida de un pedido.

| Valor | Descripción | ¿Genera reembolso? |
|-------|-------------|-------------------|
| `PENDIENTE_PAGO` | Pedido creado; cliente redirigido a MercadoPago. Esperando confirmación de cobro. | No |
| `PENDIENTE` | Pago confirmado por MP vía webhook. Esperando aceptación o rechazo del comercio. | No |
| `EN_PREPARACION` | Pedido aceptado por el comercio; en proceso de elaboración. | No |
| `EN_CAMINO` | Pedido despachado. Solo aplica a modalidad `DOMICILIO`. | No |
| `LISTO_PARA_RETIRAR` | Pedido listo para que el cliente lo retire. Solo aplica a modalidad `RETIRO`. | No |
| `ENTREGADO` | Pedido completado. Confirmado por cliente, comercio o sistema. Estado terminal positivo. | No |
| `RECHAZADO` | El comercio rechazó el pedido estando en `PENDIENTE`. | Sí |
| `CANCELADO` | Cancelado por el cliente antes del despacho (domicilio) o antes de estar listo (retiro). | Sí |
| `ANULADO` | Anulado por el comercio desde estado `EN_PREPARACION`. | Sí |
| `CANCELADO_POR_SISTEMA` | Cancelado automáticamente por el sistema (timeout de pago no confirmado, pago rechazado por MP, suspensión o inactivación del comercio). El reembolso se genera **solo** si el pago ya había sido confirmado previamente. | Condicional |
| `EXPIRADO` | El comercio no respondió dentro de 1 hora tras la confirmación del pago. | Sí |

---

### ENUM: EstadoPagoPedido

Estado del pago asociado al pedido, sincronizado con los webhooks de MercadoPago.

| Valor | Descripción |
|-------|-------------|
| `PENDIENTE` | Pago aún no confirmado por MercadoPago. Estado inicial. |
| `PAGADO` | Pago confirmado exitosamente vía webhook `payment.approved` de MP. |
| `RECHAZADO` | Pago rechazado por MercadoPago. El pedido pasa a `CANCELADO_POR_SISTEMA` sin reembolso. |

---

### ENUM: CanceladoPor

Actor que originó la cancelación de un pedido. Campo discriminador en `Pedido` e `HistorialEstadoPedido`.

| Valor | Descripción |
|-------|-------------|
| `CLIENTE` | Cancelación iniciada por el cliente (estado `CANCELADO`). |
| `COMERCIO` | Anulación iniciada por el comercio (estado `ANULADO`) o rechazo del comercio (estado `RECHAZADO`). |
| `SISTEMA` | Cancelación automática por el sistema (estados `CANCELADO_POR_SISTEMA` y `EXPIRADO`). |

> Se registra **únicamente** en estados terminales negativos: `RECHAZADO`, `CANCELADO`, `ANULADO`, `CANCELADO_POR_SISTEMA`, `EXPIRADO`. Es `NULL` en todos los demás estados.

---

### ENUM: FuenteEntrega

Actor que confirmó o cerró la entrega del pedido. Campo discriminador en `Pedido` e `HistorialEstadoPedido`.

| Valor | Descripción |
|-------|-------------|
| `CLIENTE` | El cliente confirmó haber recibido el pedido a domicilio. |
| `COMERCIO` | El comercio confirmó la entrega del pedido de retiro en el local. |
| `COMERCIO_SIN_RETIRO` | El comercio cerró el pedido de retiro por no presentarse el cliente dentro del plazo establecido. |
| `SISTEMA` | El sistema confirmó la entrega automáticamente (timer de 90 min en `EN_CAMINO` o timer de suspensión en `LISTO_PARA_RETIRAR`). |

> Se registra **únicamente** cuando `estado = ENTREGADO`. Es `NULL` en todos los demás estados.

---

### ENUM: EstadoNotaCredito

Estado del proceso de reembolso gestionado a través de la API de MercadoPago.

| Valor | Descripción |
|-------|-------------|
| `PENDIENTE` | Reembolso generado; aún no procesado por la API de MP. |
| `PROCESADO` | Reembolso confirmado exitosamente por MercadoPago. |
| `PENDIENTE_REINTENTO` | Primer intento de reembolso fallido; el job periódico lo reintentará. |
| `FALLIDO` | Máximo de 5 intentos alcanzado sin éxito. Requiere intervención manual del Administrador. Se emite notificación T27. |

---

### ENUM: EstadoReclamo

Estado de un reclamo iniciado por un cliente sobre un pedido.

| Valor | Descripción |
|-------|-------------|
| `PENDIENTE` | Reclamo enviado; pendiente de revisión por el Administrador. |
| `APROBADO` | Administrador aprobó el reclamo; se genera `NotaCredito` y se procesa el reembolso. Se emite notificación T20. |
| `RECHAZADO` | Administrador rechazó el reclamo con motivo. Se emite notificación T21. |

---

### ENUM: ResultadoSoporte

Resultado de la resolución de un mensaje de soporte por parte del Administrador.

| Valor | Descripción |
|-------|-------------|
| `REACTIVADO` | El Administrador levantó la suspensión del usuario tras revisar el mensaje. |
| `SUSPENSION_MANTENIDA` | El Administrador mantuvo la suspensión tras revisar el mensaje. |

---

### ENUM: CanalNotificacion

Canal de envío de la notificación al usuario.

| Valor | Descripción |
|-------|-------------|
| `PUSH` | Notificación in-app almacenada en la base de datos y consultada por el frontend mediante polling REST. |
| `EMAIL` | Notificación enviada mediante proveedor SMTP transaccional (Brevo u otro). |

> Cuando una notificación se envía por ambos canales, se crean **dos registros independientes** en la tabla `Notificacion`, uno por canal.

---

### ENUM: EstadoEnvioNotificacion

Estado de procesamiento del envío de la notificación.

| Valor | Descripción |
|-------|-------------|
| `PENDIENTE` | Notificación generada; aún no enviada al canal correspondiente. |
| `ENVIADO` | Notificación enviada exitosamente. |
| `FALLIDO` | Error en el envío al canal correspondiente. |

---

### ENUM: TipoNotificacion

Tipo de evento que originó la notificación. Corresponde a los códigos T1–T30 de los Requisitos Funcionales del Sistema.

| Valor | Cód. | Destinatario | Canal | Descripción |
|-------|------|-------------|-------|-------------|
| `NUEVO_PEDIDO` | T1 | Comercio | Push | Nuevo pedido recibido en estado `PENDIENTE`. |
| `PEDIDO_ACEPTADO` | T2 | Cliente | Push | Pedido aceptado por el comercio; pasa directamente a `EN_PREPARACION`. |
| `PEDIDO_RECHAZADO` | T3 | Cliente | Push | Pedido rechazado por el comercio con motivo. |
| `PEDIDO_EN_CAMINO` | T5 | Cliente | Push | Pedido despachado (modalidad `DOMICILIO`). |
| `PEDIDO_LISTO_RETIRO` | T6 | Cliente | Push | Pedido listo para retirar en el local (modalidad `RETIRO`). |
| `AVISO_75MIN_SIN_CONFIRMACION` | T7 | Cliente | Push | Aviso preventivo: 75 min en estado `EN_CAMINO` sin confirmación de recepción. |
| `PEDIDO_AUTOCONFIRMADO` | T8 | Cliente | Push | Pedido autoconfirmado como `ENTREGADO` a los 90 min. Incluye opciones para iniciar reclamo o contactar al comercio. |
| `PEDIDO_CANCELADO_CLIENTE` | T9 | Comercio | Push | El cliente canceló un pedido activo. |
| `PEDIDO_ANULADO_COMERCIO` | T10 | Cliente | Push | El comercio anuló el pedido desde `EN_PREPARACION`. |
| `PEDIDO_CANCELADO_SISTEMA` | T11 | Cliente | Push + Email | Pedido cancelado por el sistema con motivo (suspensión, timeout, pago rechazado). |
| `PEDIDO_EXPIRADO_CLIENTE` | T12 | Cliente | Push | El comercio no respondió en 1 hora; pedido expirado y reembolso en proceso. |
| `PEDIDO_EXPIRADO_COMERCIO` | T13 | Comercio | Push | Aviso al comercio de pedido expirado por falta de respuesta. |
| `COMERCIO_APROBADO` | T14 | Comercio | Push + Email | La solicitud del comercio fue aprobada por el Administrador. |
| `COMERCIO_RECHAZADO` | T15 | Comercio | Push + Email | La solicitud del comercio fue rechazada con motivo. |
| `COMERCIO_SUSPENDIDO` | T16 | Comercio | Push + Email | El comercio fue suspendido por el Administrador con motivo. |
| `NUEVO_COMERCIO_PENDIENTE` | T17 | Administrador | Push | Nueva solicitud de alta de comercio para revisar en el panel. |
| `NUEVA_RESOLICITUD_COMERCIO` | T18 | Administrador | Push | Re-solicitud de aprobación de un comercio rechazado. |
| `NUEVO_RECLAMO` | T19 | Administrador | Push | Nuevo reclamo iniciado por un cliente. |
| `RECLAMO_APROBADO` | T20 | Cliente | Push | Reclamo aprobado; reembolso en proceso. |
| `RECLAMO_RECHAZADO` | T21 | Cliente | Push | Reclamo rechazado con motivo por el Administrador. |
| `NUEVO_MENSAJE_SOPORTE` | T22 | Administrador | Push | Nuevo mensaje de soporte de un usuario suspendido. |
| `PRODUCTO_REMOVIDO_CARRITO` | T23 | Cliente | Push | Un producto fue eliminado del carrito activo por pasar a `AGOTADO` o `DESCONTINUADO`. |
| `CUENTA_INACTIVADA` | T24 | Cliente / Comercio | Email | Cuenta inactivada automáticamente por 3 meses sin actividad. |
| `COMERCIO_INACTIVADO` | T25 | Comercio | Email | Comercio inactivado automáticamente por inactividad del usuario representante. |
| `PEDIDO_CERRADO_TIMER_SUSPENSION` | T26 | Cliente | Push | Pedido `LISTO_PARA_RETIRAR` cerrado automáticamente por vencimiento del timer de 90 min durante la suspensión del comercio, sin reembolso. |
| `REEMBOLSO_FALLIDO_DEFINITIVO` | T27 | Administrador | Push + Email | Reembolso fallido tras 5 intentos; requiere intervención manual. |
| `CLIENTE_SUSPENDIDO` | T28 | Cliente | Push + Email | Cliente suspendido por el Administrador con motivo. |
| `SUSPENSION_LEVANTADA` | T29 | Cliente / Comercio | Push + Email | Suspensión levantada por el Administrador. |
| `PEDIDO_AUTOCONFIRMADO_COMERCIO` | T30 | Comercio | Push | El sistema autoconfirmó la entrega del pedido (timer 90 min). |

---

## 2. Módulo Geografía

---

### Tabla: Provincia

**Descripción:** Catálogo estático de provincias de Argentina. Precargado mediante ETL inicial desde la API Georef (datos.gob.ar). De solo lectura desde la aplicación.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | VARCHAR(2) | NO | — | PK | Código identificador de la provincia según la API Georef (ej. `"T"` para Tierra del Fuego). |
| `nombre` | VARCHAR(100) | NO | — | NN | Nombre completo de la provincia (ej. `"Tierra del Fuego, Antártida e Islas del Atlántico Sur"`). |

**Índices:** `PRIMARY KEY (id)`

---

### Tabla: Localidad

**Descripción:** Catálogo estático de localidades de Argentina. Precargado desde la API Georef. Cada localidad pertenece a una provincia.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | VARCHAR(15) | NO | — | PK | Identificador alfanumérico de la localidad según la API Georef. |
| `nombre` | VARCHAR(150) | NO | — | NN | Nombre de la localidad (ej. `"Río Grande"`). |
| `provincia_id` | VARCHAR(2) | NO | — | FK → Provincia.id, NN | Provincia a la que pertenece la localidad. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (provincia_id)`

---

### Tabla: Direccion

**Descripción:** Direcciones físicas asociadas a clientes (varias por cliente) o a comercios (exactamente una). Soporta baja lógica mediante `eliminada`. Los campos `cliente_id` y `comercio_id` son mutuamente excluyentes.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único de la dirección. |
| `calle` | VARCHAR(150) | NO | — | NN | Nombre de la calle. |
| `numero` | VARCHAR(10) | NO | — | NN | Número de puerta o altura. |
| `piso_depto` | VARCHAR(30) | SÍ | NULL | — | Piso y/o departamento (ej. `"3° B"`). Opcional. |
| `codigo_postal` | VARCHAR(10) | NO | — | NN | Código postal de la dirección. |
| `localidad_id` | VARCHAR(15) | NO | — | FK → Localidad.id, NN | Localidad donde se ubica la dirección. |
| `cliente_id` | INT | SÍ | NULL | FK → Cliente.id | FK al cliente propietario. Mutuamente excluyente con `comercio_id`. |
| `comercio_id` | INT | SÍ | NULL | FK → Comercio.id, UQ | FK al comercio propietario. UQ garantiza máximo una dirección por comercio. Mutuamente excluyente con `cliente_id`. |
| `principal` | TINYINT(1) | NO | `false` | NN | `true` si es la dirección principal del cliente (predeterminada al hacer pedidos). Solo aplica cuando `cliente_id` no es NULL. |
| `eliminada` | TINYINT(1) | NO | `false` | NN | Baja lógica: `true` = dirección eliminada por el cliente. No se muestra en la UI ni se usa en nuevos pedidos. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación del registro. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última edición de la dirección. |
| `fecha_baja` | DATETIME | SÍ | NULL | — | Fecha y hora de la eliminación lógica. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (comercio_id)` | `INDEX (cliente_id)` | `INDEX (localidad_id)`

**Reglas de negocio:**
- Exactamente uno de `cliente_id` o `comercio_id` debe estar poblado; el otro debe ser NULL.
- Un cliente puede tener múltiples direcciones activas. Solo una puede tener `principal = true`.
- La dirección del comercio no puede eliminarse lógicamente.

---

## 3. Módulo Identidad y Herencia

---

### Tabla: Usuario

**Descripción:** Entidad central del sistema de identidad. Almacena credenciales, estado del ciclo de vida y metadatos de seguridad para todos los actores del sistema. La PK (`id`) es compartida con `Persona` mediante herencia por tabla.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del usuario. Compartido con `Persona` (mismo valor). |
| `email` | VARCHAR(150) | NO | — | NN, UQ | Dirección de email. Identificador de acceso único en toda la plataforma. |
| `password_hash` | VARCHAR(255) | NO | — | NN | Hash de la contraseña generado con BCrypt. Nunca se almacena en texto plano. |
| `rol` | ENUM RolUsuario | NO | — | NN | Rol funcional: `CLIENTE`, `COMERCIO` o `ADMINISTRADOR`. Determina las entidades asociadas y los permisos de la API. |
| `estado` | ENUM EstadoUsuario | NO | `'PENDIENTE'` | NN | Estado del ciclo de vida del usuario. |
| `email_verificado` | TINYINT(1) | NO | `false` | NN | `true` una vez que el usuario consumió exitosamente el token de `VERIFICACION_EMAIL`. |
| `intentos_fallidos` | INT | NO | `0` | NN | Contador de intentos fallidos de login o de cambio de contraseña desde perfil. Se resetea al autenticarse correctamente. Al llegar a 3, el usuario pasa a `BLOQUEADO`. |
| `fecha_registro` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación del registro de usuario. |
| `fecha_ultimo_acceso` | DATETIME | SÍ | NULL | — | Fecha y hora del último inicio de sesión exitoso. Es el criterio para detectar inactividad (3 meses sin actualización = `INACTIVO`). |
| `fecha_bloqueo` | DATETIME | SÍ | NULL | — | Fecha y hora en que el usuario pasó a estado `BLOQUEADO`. |
| `fecha_suspension` | DATETIME | SÍ | NULL | — | Fecha y hora en que el Administrador aplicó la suspensión. |
| `motivo_suspension` | VARCHAR(500) | SÍ | NULL | — | Motivo de la suspensión ingresado por el Administrador. Obligatorio al suspender; NULL en otros estados. |
| `fecha_inactivo` | DATETIME | SÍ | NULL | — | Fecha y hora en que el sistema inactivó automáticamente al usuario. |
| `fecha_reactivacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última reactivación del usuario desde estado `INACTIVO`. |
| `fecha_actualizacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última modificación de cualquier campo del registro. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (email)` | `INDEX (rol)` | `INDEX (estado)`

**Reglas de negocio:**
- Al registrarse: `estado = PENDIENTE`, `email_verificado = false`.
- Tras 3 intentos fallidos: `estado → BLOQUEADO`, `intentos_fallidos` se resetea a 0.
- `fecha_ultimo_acceso` se actualiza en cada login exitoso y es el único criterio para la inactivación por 3 meses.

---

### Tabla: Persona

**Descripción:** Nodo intermedio de la jerarquía de herencia. Vincula `Usuario` con su subtipo concreto (`PersonaFisica` o `PersonaJuridica`). Comparte PK con `Usuario`.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | — | PK, FK → Usuario.id | Mismo valor que `Usuario.id`. No usa AUTO_INCREMENT propio. |

**Índices:** `PRIMARY KEY (id)`

---

### Tabla: PersonaFisica

**Descripción:** Datos personales de los usuarios con identidad individual (Clientes y Administradores). El `id` es el mismo que el de `Persona`.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | — | PK, FK → Persona.id | Mismo valor que `Persona.id`. |
| `nombre` | VARCHAR(100) | NO | — | NN | Nombre(s) de pila del individuo. |
| `apellido` | VARCHAR(100) | NO | — | NN | Apellido(s) del individuo. |
| `dni` | VARCHAR(10) | NO | — | NN, UQ | Documento Nacional de Identidad argentino. Único en toda la plataforma. |
| `fecha_nacimiento` | DATE | NO | — | NN | Fecha de nacimiento. |
| `telefono` | VARCHAR(30) | NO | — | NN | Número de teléfono con código de área. Se usa para generar enlaces `wa.me` hacia WhatsApp. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última actualización del perfil personal. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (dni)`

---

### Tabla: PersonaJuridica

**Descripción:** Datos fiscales y comerciales del titular de un comercio. El `id` es el mismo que el de `Persona`.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | — | PK, FK → Persona.id | Mismo valor que `Persona.id`. |
| `razon_social` | VARCHAR(150) | NO | — | NN | Nombre legal o razón social de la empresa. |
| `cuit` | VARCHAR(11) | NO | — | NN, UQ | Clave Única de Identificación Tributaria (11 dígitos, sin guiones). Único en toda la plataforma. |
| `condicion_iva` | ENUM CondicionIva | NO | — | NN | Situación ante el IVA según AFIP. |
| `tipo_sociedad` | ENUM TipoPersonaJuridica | NO | — | NN | Forma jurídica con la que está constituida la empresa. |
| `domicilio_fiscal` | VARCHAR(255) | NO | — | NN | Domicilio fiscal declarado ante AFIP. Puede diferir del domicilio operativo registrado en `Direccion`. |
| `fecha_inicio_actividades` | DATE | NO | — | NN | Fecha de inicio de actividades declarada ante AFIP. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (cuit)`

---

### Tabla: Cliente

**Descripción:** Subtipo de `PersonaFisica` con rol `CLIENTE`. Tabla de identidad que actúa como nodo de unión para sus pedidos, carrito y direcciones. No tiene columnas propias más allá de la PK.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | — | PK, FK → PersonaFisica.id | Mismo valor que `PersonaFisica.id`. |

**Índices:** `PRIMARY KEY (id)`

---

### Tabla: Administrador

**Descripción:** Subtipo de `PersonaFisica` con rol `ADMINISTRADOR`. Tabla de identidad que actúa como nodo de unión para las acciones administrativas (historial de comercios, reclamos, mensajes de soporte). No tiene columnas propias más allá de la PK.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | — | PK, FK → PersonaFisica.id | Mismo valor que `PersonaFisica.id`. |

**Índices:** `PRIMARY KEY (id)`

---

## 4. Módulo Comercio

---

### Tabla: Comercio

**Descripción:** Entidad principal que representa a un comercio gastronómico en la plataforma. Vinculado a una `PersonaJuridica` como titular legal. Tiene estado propio que puede ser afectado automáticamente por el estado de su usuario representante.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del comercio. |
| `persona_juridica_id` | INT | NO | — | FK → PersonaJuridica.id, NN | Persona jurídica titular del comercio. Por regla de negocio de esta versión, una PersonaJuridica representa exactamente un Comercio. |
| `nombre` | VARCHAR(150) | NO | — | NN | Nombre comercial o de fantasía del comercio. |
| `descripcion` | TEXT | SÍ | NULL | — | Descripción libre del comercio: propuesta de valor, especialidades, etc. |
| `foto_perfil_url` | VARCHAR(500) | NO | — | NN | URL de la imagen de perfil del comercio almacenada en Cloudinary. |
| `telefono` | VARCHAR(30) | NO | — | NN | Teléfono de contacto del comercio. Se usa para generar enlace `wa.me`. |
| `email` | VARCHAR(150) | NO | — | NN | Email de contacto del comercio (puede ser distinto al email del usuario representante). |
| `tipo_comercio` | ENUM TipoComercio | NO | — | NN | Categoría del negocio: `RESTAURANTE` o `EMPRENDIMIENTO`. |
| `acepta_delivery` | TINYINT(1) | NO | `false` | NN | `true` si el comercio ofrece entrega a domicilio. |
| `acepta_retiro` | TINYINT(1) | NO | `false` | NN | `true` si el comercio permite retiro en el local. |
| `estado` | ENUM EstadoComercio | NO | `'PENDIENTE'` | NN | Estado del ciclo de vida del comercio en la plataforma. |
| `cerrado_manualmente` | TINYINT(1) | NO | `false` | NN | `true` si el comerciante cerró manualmente su tienda. Independiente del estado y del horario. Se combina con ambos para determinar la disponibilidad real. |
| `motivo_rechazo` | VARCHAR(500) | SÍ | NULL | — | Motivo ingresado por el Administrador al rechazar la solicitud. NULL en otros estados. |
| `fecha_rechazo` | DATETIME | SÍ | NULL | — | Fecha y hora en que el Administrador rechazó la solicitud. |
| `fecha_resolicitud` | DATETIME | SÍ | NULL | — | Fecha y hora en que el comercio presentó una nueva solicitud de aprobación tras ser rechazado. |
| `fecha_suspension` | DATETIME | SÍ | NULL | — | Fecha y hora de la última suspensión administrativa. |
| `motivo_suspension` | VARCHAR(500) | SÍ | NULL | — | Motivo de la suspensión ingresado por el Administrador. NULL en otros estados. |
| `mp_vinculado` | TINYINT(1) | NO | `false` | NN | `true` si existe una `CuentaMercadoPago` activa para este comercio. Se actualiza al vincular o desvincular. |
| `fecha_aprobacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última aprobación por el Administrador. |
| `fecha_registro` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación del comercio en el sistema. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última modificación del perfil del comercio. |
| `fecha_reactivacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última reactivación (levantamiento de suspensión o restauración desde `CERRADO_TEMPORALMENTE`). |

**Índices:** `PRIMARY KEY (id)` | `INDEX (persona_juridica_id)` | `INDEX (estado)`

**Reglas de negocio:**
- Un comercio puede recibir pedidos si: `estado = APROBADO AND mp_vinculado = true AND cerrado_manualmente = false AND usuario representante ACTIVO AND hora actual dentro de Horario`.
- Propagación automática desde el estado del usuario: `BLOQUEADO → CERRADO_TEMPORALMENTE`; `INACTIVO → INACTIVO`; `SUSPENDIDO → SUSPENDIDO`.
- Al recuperar contraseña (desbloqueo del usuario): si `estado = CERRADO_TEMPORALMENTE`, se restaura automáticamente a `APROBADO`.

---

### Tabla: Horario

**Descripción:** Franjas horarias de atención del comercio por día de la semana. Un comercio puede tener múltiples registros por día (horario partido) o uno por cada día que opere.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del registro de horario. |
| `comercio_id` | INT | NO | — | FK → Comercio.id, NN | Comercio al que pertenece este horario. |
| `dia_semana` | ENUM DiaSemana | NO | — | NN | Día de la semana al que aplica la franja horaria. |
| `hora_apertura` | TIME | NO | — | NN | Hora de inicio de la franja de atención. Formato `HH:MM:SS`. |
| `hora_cierre` | TIME | NO | — | NN | Hora de fin de la franja de atención. Formato `HH:MM:SS`. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (comercio_id)`

**Reglas de negocio:**
- Se pueden definir múltiples registros por día para cubrir horarios partidos (ej. mediodía y noche).
- El sistema compara la hora actual del servidor contra las franjas del día correspondiente para determinar si el comercio está "dentro del horario".

---

### Tabla: CuentaMercadoPago

**Descripción:** Credenciales OAuth del comercio en MercadoPago bajo el modelo Marketplace con split de pagos. El `access_token` permite al backend crear preferencias de pago con `application_fee` en nombre del comercio.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del registro. |
| `comercio_id` | INT | NO | — | FK → Comercio.id, NN, UQ | Comercio al que pertenece la cuenta vinculada. UNIQUE: un solo registro por comercio. |
| `mp_user_id` | VARCHAR(50) | NO | — | NN | ID del usuario en la plataforma de MercadoPago (obtenido durante el flujo OAuth). |
| `access_token` | VARCHAR(255) | NO | — | NN | Token de acceso OAuth para llamadas a la API de MP en nombre del comercio. Sensible: considerar cifrado en reposo. |
| `refresh_token` | VARCHAR(255) | NO | — | NN | Token de renovación OAuth para obtener un nuevo `access_token` antes de que expire. Sensible. |
| `public_key` | VARCHAR(255) | SÍ | NULL | — | Clave pública del comercio en MercadoPago. Puede usarse para inicializar el SDK en el frontend. |
| `activa` | TINYINT(1) | NO | `true` | NN | `true` si la vinculación está activa. Pasa a `false` al desvincular. |
| `fecha_vinculacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora en que el comercio completó el flujo OAuth exitosamente. |
| `fecha_desvinculacion` | DATETIME | SÍ | NULL | — | Fecha y hora en que el comercio desvinculó su cuenta. Se popula al desvincular. |
| `token_expira` | DATETIME | SÍ | NULL | — | Fecha y hora de expiración del `access_token`. El sistema debe renovar antes de que venza. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (comercio_id)`

**Reglas de negocio:**
- Al desvincular: `activa = false`, `fecha_desvinculacion = NOW()`, `Comercio.mp_vinculado = false`.
- Al vincular (nueva o renovación): `activa = true`, `Comercio.mp_vinculado = true`.

---

### Tabla: HistorialAccionComercio

**Descripción:** Registro de auditoría inmutable de todas las acciones administrativas sobre comercios. Cada registro es de solo inserción; no se modifica ni elimina.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del registro. |
| `comercio_id` | INT | NO | — | FK → Comercio.id, NN | Comercio sobre el que se ejecutó la acción. |
| `administrador_id` | INT | NO | — | FK → Administrador.id, NN | Administrador que ejecutó la acción. |
| `tipo_accion` | ENUM TipoAccionComercio | NO | — | NN | Tipo de acción: `APROBACION`, `RECHAZO`, `SUSPENSION` o `REACTIVACION`. |
| `motivo` | VARCHAR(500) | SÍ | NULL | — | Motivo de la acción. Obligatorio para `RECHAZO` y `SUSPENSION`. Opcional para `APROBACION` y `REACTIVACION`. |
| `estado_resultante` | ENUM EstadoComercio | NO | — | NN | Estado del comercio inmediatamente después de ejecutar la acción. Permite reconstruir la secuencia de estados. |
| `fecha_hora` | DATETIME | NO | `NOW()` | NN | Fecha y hora exacta de ejecución de la acción. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (comercio_id)` | `INDEX (administrador_id)`

---

### Tabla: ConfiguracionTarifa

**Descripción:** Historial de configuraciones de tarifas de servicio. La tarifa vigente es la del registro con `fecha_vigencia` más alta. Cada cambio genera un nuevo registro (política append-only). Los valores se congelan en cada `Pedido` al momento de su creación.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del registro de tarifa. |
| `administrador_id` | INT | NO | — | FK → Administrador.id, NN | Administrador que definió esta configuración. |
| `cargo_cliente` | DECIMAL(10,2) | NO | — | NN | Cargo de servicio sobre el total del pedido aplicado al cliente (porcentaje o monto fijo según definición de negocio). |
| `cargo_comercio` | DECIMAL(10,2) | NO | — | NN | Comisión de plataforma cobrada al comercio por cada pedido completado (porcentaje o monto fijo). |
| `fecha_vigencia` | DATETIME | NO | `NOW()` | NN | Fecha y hora desde la cual esta configuración está vigente. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (administrador_id)` | `INDEX (fecha_vigencia)`

**Reglas de negocio:**
- Al crear un pedido, el backend obtiene el registro con `MAX(fecha_vigencia)` y aplica sus valores como `Pedido.cargo_servicio_cliente` y `Pedido.cargo_servicio_comercio`. Estos valores quedan congelados en el pedido.

---

## 5. Módulo Seguridad y Sesiones

---

### Tabla: Token

**Descripción:** Tokens de un solo uso para operaciones críticas de seguridad. Tabla discriminada por el campo `tipo` que unifica los tres flujos de tokenización del sistema. Los tokens se generan como UUID v4 y se envían al usuario por email como parte de un enlace de acción.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del registro de token. |
| `usuario_id` | INT | NO | — | FK → Usuario.id, NN | Usuario al que pertenece el token. |
| `tipo` | ENUM TipoToken | NO | — | NN | Propósito del token: `VERIFICACION_EMAIL`, `RECUPERACION_PASSWORD` o `REACTIVACION_CUENTA`. |
| `token` | VARCHAR(36) | NO | — | NN, UQ | Valor UUID v4 del token. Se incluye en el enlace enviado al usuario. UNIQUE para garantizar irrepetibilidad global. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de generación del token. |
| `fecha_vencimiento` | DATETIME | NO | — | NN | Fecha y hora de expiración. Calculada al crear el token según la duración configurada para cada tipo. |
| `fecha_uso` | DATETIME | SÍ | NULL | — | Fecha y hora en que el usuario consumió el token. Se registra al pasar a `UTILIZADO`. |
| `estado` | ENUM EstadoToken | NO | `'PENDIENTE'` | NN | Estado del ciclo de vida del token. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (token)` | `INDEX (usuario_id, tipo, estado)`

**Reglas de negocio:**
- Un job periódico actualiza a `EXPIRADO` todos los tokens donde `fecha_vencimiento <= NOW() AND estado = 'PENDIENTE'`.
- Al consumirse: `estado = UTILIZADO`, `fecha_uso = NOW()`. No puede reutilizarse.
- Al reenviar un token del mismo tipo para el mismo usuario, los tokens `PENDIENTE` anteriores del mismo tipo deben invalidarse.

---

### Tabla: Sesion

**Descripción:** Historial completo de sesiones de usuarios. Cada inicio de sesión exitoso genera un nuevo registro. Permite auditoría de accesos y gestión de sesiones concurrentes.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único de la sesión. |
| `usuario_id` | INT | NO | — | FK → Usuario.id, NN | Usuario que inició la sesión. |
| `activa` | TINYINT(1) | NO | `true` | NN | `true` mientras la sesión sigue abierta. `false` al cerrarse por cualquier motivo. |
| `fecha_inicio` | DATETIME | NO | `NOW()` | NN | Fecha y hora del inicio de sesión exitoso (login). |
| `fecha_cierre` | DATETIME | SÍ | NULL | — | Fecha y hora del cierre de la sesión. NULL mientras está activa. |
| `tipo_cierre` | ENUM TipoCierreSesion | SÍ | NULL | — | Motivo del cierre: `MANUAL`, `AUTOMATICO` o `FORZADO`. NULL mientras está activa. |
| `ip_origen` | VARCHAR(45) | NO | — | NN | Dirección IP del cliente al momento del login. Admite IPv4 (hasta 15 chars) e IPv6 (hasta 45 chars). |
| `navegador` | VARCHAR(255) | SÍ | NULL | — | User-Agent del navegador al momento del login. NULL si no se puede detectar. |
| `dispositivo` | VARCHAR(255) | SÍ | NULL | — | Información del dispositivo (SO, modelo). NULL si no se puede detectar. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (usuario_id, activa)`

**Reglas de negocio:**
- Al bloquear, suspender o inactivar un usuario: se fuerzan el cierre de todas sus sesiones activas (`activa = false`, `tipo_cierre = FORZADO`, `fecha_cierre = NOW()`).
- Al cambiar contraseña: se fuerza el cierre de todas las sesiones activas del usuario.
- Al detectar login con sesión ya activa: se fuerza el cierre de la sesión anterior; se envía notificación de cierre de sesión por email (por fuera del sistema de notificaciones push).

---

## 6. Módulo Notificaciones

---

### Tabla: Notificacion

**Descripción:** Registro de todas las notificaciones emitidas por el sistema. Soporta notificaciones in-app (canal `PUSH`, consultadas por polling REST) y por email (canal `EMAIL`). Cada combinación evento+canal genera un registro independiente.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único de la notificación. |
| `usuario_id` | INT | NO | — | FK → Usuario.id, NN | Usuario destinatario de la notificación. |
| `tipo` | ENUM TipoNotificacion | NO | — | NN | Tipo de evento que originó la notificación (ver tabla T1–T30). |
| `mensaje` | VARCHAR(500) | NO | — | NN | Texto legible de la notificación mostrado al usuario. Puede incluir datos dinámicos del contexto (nombre del comercio, motivo de cancelación, etc.). |
| `leida` | TINYINT(1) | NO | `false` | NN | `true` una vez que el usuario marcó la notificación como leída. Solo tiene sentido funcional para canal `PUSH`. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de generación de la notificación. |
| `canal` | ENUM CanalNotificacion | NO | — | NN | Canal de envío: `PUSH` o `EMAIL`. |
| `estado` | ENUM EstadoEnvioNotificacion | NO | `'PENDIENTE'` | NN | Estado del procesamiento del envío. |
| `fecha_envio` | DATETIME | SÍ | NULL | — | Fecha y hora en que el envío fue procesado. NULL hasta que se envíe. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (usuario_id, leida)` | `INDEX (estado)`

---

## 7. Módulo Atención y Soporte

---

### Tabla: Soporte

**Descripción:** Mensajes de descargo enviados por usuarios suspendidos al Administrador. Permite al usuario contestar la suspensión y solicitar su revisión. El Administrador puede levantar la suspensión o mantenerla.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del mensaje de soporte. |
| `usuario_id` | INT | NO | — | FK → Usuario.id, NN | Usuario que envió el mensaje (debe estar en estado `SUSPENDIDO`). |
| `mensaje_descargo` | TEXT | NO | — | NN | Texto libre con el descargo o justificación del usuario. |
| `fecha_envio` | DATETIME | NO | `NOW()` | NN | Fecha y hora en que el usuario envió el mensaje. |
| `atendido` | TINYINT(1) | NO | `false` | NN | `true` una vez que un Administrador revisó y resolvió el mensaje. |
| `administrador_id` | INT | SÍ | NULL | FK → Administrador.id | Administrador que atendió el mensaje. NULL mientras está sin atender. |
| `resultado` | ENUM ResultadoSoporte | SÍ | NULL | — | Resultado de la resolución: `REACTIVADO` o `SUSPENSION_MANTENIDA`. NULL mientras no fue atendido. |
| `fecha_resolucion` | DATETIME | SÍ | NULL | — | Fecha y hora de resolución por el Administrador. NULL mientras no fue atendido. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (usuario_id)` | `INDEX (atendido)`

---

### Tabla: Reclamo

**Descripción:** Reclamos iniciados por clientes sobre pedidos autoconfirmados como entregados o con entrega cuestionada. Un pedido puede tener como máximo un reclamo (UNIQUE en `pedido_id`). Si el reclamo se aprueba, se genera una `NotaCredito` para el reembolso.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del reclamo. |
| `pedido_id` | INT | NO | — | FK → Pedido.id, NN, UQ | Pedido sobre el que se realiza el reclamo. UNIQUE: máximo un reclamo por pedido. |
| `descripcion` | TEXT | NO | — | NN | Descripción detallada del reclamo ingresada por el cliente. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación del reclamo. |
| `estado` | ENUM EstadoReclamo | NO | `'PENDIENTE'` | NN | Estado del reclamo en el flujo de resolución. |
| `administrador_id` | INT | SÍ | NULL | FK → Administrador.id | Administrador que resolvió el reclamo. NULL mientras está `PENDIENTE`. |
| `motivo_rechazo` | VARCHAR(500) | SÍ | NULL | — | Motivo por el que el Administrador rechazó el reclamo. NULL si fue aprobado o está pendiente. |
| `fecha_resolucion` | DATETIME | SÍ | NULL | — | Fecha y hora de resolución por el Administrador. NULL mientras está `PENDIENTE`. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (pedido_id)` | `INDEX (estado)`

---

## 8. Módulo Catálogo de Productos

---

### Tabla: Categoria

**Descripción:** Categorías de clasificación para los productos del catálogo. Gestionadas exclusivamente por el Administrador. Un producto pertenece a exactamente una categoría. Soporta baja lógica.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único de la categoría. |
| `nombre` | VARCHAR(100) | NO | — | NN, UQ | Nombre único de la categoría (ej. `"Pizzas"`, `"Empanadas"`). |
| `activo` | TINYINT(1) | NO | `true` | NN | `true` si está activa y disponible para asignar a productos. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última modificación del nombre. |
| `fecha_baja` | DATETIME | SÍ | NULL | — | Fecha y hora de desactivación lógica. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (nombre)`

---

### Tabla: Tag

**Descripción:** Etiquetas transversales para enriquecer búsqueda y filtrado de productos. Gestionadas por el Administrador. Un producto puede tener múltiples tags (relación M:N a través de `ProductoTag`).

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del tag. |
| `nombre` | VARCHAR(100) | NO | — | NN, UQ | Nombre único del tag (ej. `"Vegano"`, `"Sin TACC"`, `"Picante"`). |
| `activo` | TINYINT(1) | NO | `true` | NN | `true` si está activo y disponible para asignar a productos. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última modificación del nombre. |
| `fecha_baja` | DATETIME | SÍ | NULL | — | Fecha y hora de desactivación lógica. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (nombre)`

---

### Tabla: Producto

**Descripción:** Productos ofrecidos por los comercios en el catálogo. El precio se congela en `DetallePedido.precio_unitario` al confirmar cada pedido. Al pasar a `AGOTADO` o `DESCONTINUADO`, el sistema elimina automáticamente las apariciones del producto en carritos activos.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del producto. |
| `comercio_id` | INT | NO | — | FK → Comercio.id, NN | Comercio propietario del producto. |
| `categoria_id` | INT | NO | — | FK → Categoria.id, NN | Categoría a la que pertenece el producto. |
| `nombre` | VARCHAR(150) | NO | — | NN | Nombre del producto. |
| `descripcion` | TEXT | SÍ | NULL | — | Descripción detallada: ingredientes, tamaño, opciones, alérgenos, etc. |
| `precio` | DECIMAL(10,2) | NO | — | NN | Precio unitario en pesos argentinos (ARS). Se congela en `DetallePedido.precio_unitario` al momento del pedido; los cambios no afectan pedidos existentes. |
| `estado` | ENUM EstadoProducto | NO | `'DISPONIBLE'` | NN | Estado de disponibilidad del producto en el catálogo. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de publicación del producto. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última modificación (nombre, descripción, precio, categoría). |
| `fecha_baja` | DATETIME | SÍ | NULL | — | Fecha y hora en que el producto fue descontinuado (baja lógica definitiva). |

**Índices:** `PRIMARY KEY (id)` | `INDEX (comercio_id)` | `INDEX (categoria_id)` | `INDEX (estado)`

**Reglas de negocio:**
- Máximo 5 imágenes por producto; validado en el backend antes de emitir la firma de subida a Cloudinary.
- Un producto `DESCONTINUADO` no puede revertir a `DISPONIBLE`.

---

### Tabla: ImagenProducto

**Descripción:** Imágenes asociadas a un producto. Las URLs apuntan a recursos en Cloudinary. Máximo 5 imágenes por producto; una se designa como principal (portada en el catálogo).

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único de la imagen. |
| `producto_id` | INT | NO | — | FK → Producto.id, NN | Producto al que pertenece la imagen. |
| `url` | VARCHAR(500) | NO | — | NN | URL pública en Cloudinary de la imagen. |
| `orden` | INT | NO | `0` | NN | Orden de visualización en la galería del producto (0 = primera posición). |
| `es_principal` | TINYINT(1) | NO | `false` | NN | `true` si esta imagen es la imagen de portada del producto (miniatura en el catálogo). Solo una imagen por producto puede tener este valor en `true`. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (producto_id)`

---

### Tabla: ProductoTag

**Descripción:** Tabla de unión M:N entre `Producto` y `Tag`. Permite asignar múltiples tags a un producto y un mismo tag a múltiples productos.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `producto_id` | INT | NO | — | PK (componente), FK → Producto.id | Producto que tiene el tag. |
| `tag_id` | INT | NO | — | PK (componente), FK → Tag.id | Tag asignado al producto. |

**Índices:** `PRIMARY KEY (producto_id, tag_id)` | `INDEX (tag_id)`

---

## 9. Módulo Operaciones y Ventas

---

### Tabla: Carrito

**Descripción:** Carrito de compras del cliente. Existe exactamente uno por cliente (persistente a lo largo de las sesiones). Solo puede contener productos de un único comercio a la vez. `comercio_id` se asigna al agregar el primer ítem y se limpia al vaciar el carrito o al confirmar el pago.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del carrito. |
| `cliente_id` | INT | NO | — | FK → Cliente.id, NN, UQ | Cliente propietario del carrito. UNIQUE: un solo carrito por cliente. |
| `comercio_id` | INT | SÍ | NULL | FK → Comercio.id | Comercio del cual provienen los productos actuales. NULL si el carrito está vacío. |
| `activo` | TINYINT(1) | NO | `true` | NN | `true` mientras la sesión del cliente está activa. `false` al cerrar sesión o al inactivarse la cuenta. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (cliente_id)` | `INDEX (comercio_id)`

**Reglas de negocio:**
- El carrito **no** se limpia al crear el pedido en `PENDIENTE_PAGO`. Se limpia únicamente al recibir el webhook de pago aprobado (transición del pedido a `PENDIENTE`).
- Si el pago expira (timeout 30 min) o es rechazado por MP, el carrito permanece intacto para permitir el reintento del cliente.
- Al agregar un producto de un comercio diferente al `comercio_id` actual, el sistema solicita al cliente confirmar el vaciado del carrito.

---

### Tabla: ItemCarrito

**Descripción:** Ítems individuales dentro del carrito de un cliente. Cada registro representa un producto con su cantidad y nota opcional. Los ítems de productos `AGOTADO` o `DESCONTINUADO` se eliminan automáticamente.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del ítem de carrito. |
| `carrito_id` | INT | NO | — | FK → Carrito.id, NN | Carrito al que pertenece el ítem. |
| `producto_id` | INT | NO | — | FK → Producto.id, NN | Producto representado por el ítem. |
| `cantidad` | INT | NO | — | NN | Cantidad de unidades solicitadas. Valor mínimo: 1. |
| `nota` | VARCHAR(255) | SÍ | NULL | — | Nota o aclaración del cliente para ese ítem (ej. `"Sin cebolla"`, `"Extra salsa"`). |

**Índices:** `PRIMARY KEY (id)` | `INDEX (carrito_id)` | `INDEX (producto_id)`

---

### Tabla: Pedido

**Descripción:** Pedido generado por un cliente. Cubre el ciclo completo desde la creación (antes del pago) hasta la entrega. Contiene el snapshot de montos al momento de la transacción, los metadatos del ciclo de vida y los campos discriminadores de estados terminales. El `id` del pedido se usa como `external_reference` en MercadoPago para correlacionar webhooks.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del pedido. Usado como `external_reference` en MercadoPago. |
| `cliente_id` | INT | NO | — | FK → Cliente.id, NN | Cliente que realizó el pedido. |
| `comercio_id` | INT | NO | — | FK → Comercio.id, NN | Comercio receptor del pedido. |
| `direccion_id` | INT | SÍ | NULL | FK → Direccion.id | Dirección de entrega. Obligatorio para `DOMICILIO`; NULL para `RETIRO`. |
| `modalidad_entrega` | ENUM ModalidadEntrega | NO | — | NN | Modalidad elegida por el cliente: `DOMICILIO` o `RETIRO`. |
| `estado` | ENUM EstadoPedido | NO | `'PENDIENTE_PAGO'` | NN | Estado actual del pedido en su ciclo de vida. |
| `pago_estado` | ENUM EstadoPagoPedido | NO | `'PENDIENTE'` | NN | Estado del pago asociado. Se actualiza al recibir webhooks de MercadoPago. |
| `cancelado_por` | ENUM CanceladoPor | SÍ | NULL | — | Actor que originó la cancelación. Solo se registra en estados terminales negativos. NULL en todos los demás estados. |
| `motivo` | VARCHAR(500) | SÍ | NULL | — | Motivo libre de anulación ingresado por el comercio (solo para estado `ANULADO`). |
| `fuente_entrega` | ENUM FuenteEntrega | SÍ | NULL | — | Actor que confirmó la entrega. Solo se registra cuando `estado = ENTREGADO`. NULL en todos los demás estados. |
| `fecha_entrega` | DATETIME | SÍ | NULL | — | Fecha y hora real en que el pedido fue entregado o confirmado como entregado. |
| `suspension_retiro_expira` | DATETIME | SÍ | NULL | — | Fecha y hora de expiración del timer de 90 minutos para pedidos `LISTO_PARA_RETIRAR` afectados por la suspensión del comercio. NULL si no aplica. |
| `primer_aviso_emitido` | TINYINT(1) | NO | `false` | NN | Flag de idempotencia: `true` una vez emitido el aviso de los 75 minutos (T7) para pedidos en `EN_CAMINO`. Evita duplicados en reintentos del job periódico. |
| `motivo_rechazo` | ENUM MotivoRechazo | SÍ | NULL | — | Motivo estructurado del rechazo por el comercio. Solo se registra cuando `estado = RECHAZADO`. |
| `detalle_rechazo` | VARCHAR(500) | SÍ | NULL | — | Texto libre complementario al `motivo_rechazo`. Particularmente útil cuando `motivo_rechazo = OTRO`. |
| `subtotal` | DECIMAL(10,2) | NO | — | NN | Suma de todos los `DetallePedido.subtotal` al momento de confirmar el pedido. Valor congelado. |
| `cargo_servicio_cliente` | DECIMAL(10,2) | NO | — | NN | Cargo de servicio aplicado al cliente, congelado desde la `ConfiguracionTarifa` vigente al momento del pedido. |
| `cargo_servicio_comercio` | DECIMAL(10,2) | NO | — | NN | Comisión de plataforma del comercio, congelada desde la `ConfiguracionTarifa` vigente al momento del pedido. |
| `total` | DECIMAL(10,2) | NO | — | NN | Monto total cobrado al cliente: `subtotal + cargo_servicio_cliente`. Debe coincidir con `Pago.monto`. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación del pedido (previo al pago). |
| `fecha_pago` | DATETIME | SÍ | NULL | — | Fecha y hora de confirmación del pago por MercadoPago vía webhook `payment.approved`. |
| `fecha_aceptacion` | DATETIME | SÍ | NULL | — | Fecha y hora en que el comercio aceptó el pedido. |
| `fecha_listo` | DATETIME | SÍ | NULL | — | Fecha y hora en que el pedido pasó a `LISTO_PARA_RETIRAR` (retiro) o `EN_CAMINO` (domicilio). |
| `fecha_despacho` | DATETIME | SÍ | NULL | — | Fecha y hora en que el pedido fue despachado (pasó a `EN_CAMINO`). Solo aplica a `DOMICILIO`. |
| `fecha_cancelacion` | DATETIME | SÍ | NULL | — | Fecha y hora en que el pedido alcanzó un estado terminal negativo (`RECHAZADO`, `CANCELADO`, `ANULADO`, `CANCELADO_POR_SISTEMA` o `EXPIRADO`). |

**Índices:** `PRIMARY KEY (id)` | `INDEX (cliente_id)` | `INDEX (comercio_id)` | `INDEX (estado)` | `INDEX (fecha_creacion)`

**Reglas de negocio:**
- `cancelado_por` y `fuente_entrega` son mutuamente excluyentes: en un pedido terminal solo puede estar poblado uno de los dos.
- Si llega un webhook de pago aprobado y el pedido ya está en `CANCELADO_POR_SISTEMA` (por timeout procesado primero), el sistema debe generar el reembolso inmediatamente.
- Los valores de `subtotal`, `cargo_servicio_cliente`, `cargo_servicio_comercio` y `total` son inmutables una vez registrados.

---

### Tabla: DetallePedido

**Descripción:** Snapshot de cada ítem del pedido al momento de su confirmación. `precio_unitario` se congela desde `Producto.precio` al crear el pedido, garantizando trazabilidad histórica ante cambios futuros de precios.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del ítem del pedido. |
| `pedido_id` | INT | NO | — | FK → Pedido.id, NN | Pedido al que pertenece el ítem. |
| `producto_id` | INT | NO | — | FK → Producto.id, NN | Producto pedido. Referencia histórica: el producto puede haber cambiado de precio, nombre o estado desde entonces. |
| `cantidad` | INT | NO | — | NN | Cantidad de unidades pedidas del producto. |
| `precio_unitario` | DECIMAL(10,2) | NO | — | NN | Precio del producto **al momento del pedido** (congelado desde `Producto.precio`). Inmutable. |
| `nota` | VARCHAR(255) | SÍ | NULL | — | Nota o aclaración del cliente para ese ítem. Copiada desde `ItemCarrito.nota` al confirmar el pedido. |
| `subtotal` | DECIMAL(10,2) | NO | — | NN | Valor calculado y congelado: `precio_unitario × cantidad`. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (pedido_id)`

---

### Tabla: HistorialEstadoPedido

**Descripción:** Registro inmutable de cada transición de estado que experimenta un pedido. Un registro por cada cambio de estado. Permite la auditoría y reconstrucción completa del ciclo de vida de cualquier pedido.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del registro de historial. |
| `pedido_id` | INT | NO | — | FK → Pedido.id, NN | Pedido al que corresponde la transición de estado. |
| `estado` | ENUM EstadoPedido | NO | — | NN | Estado alcanzado en esta transición. |
| `cancelado_por` | ENUM CanceladoPor | SÍ | NULL | — | Actor de la cancelación, si aplica. Solo para estados terminales negativos. |
| `fuente_entrega` | ENUM FuenteEntrega | SÍ | NULL | — | Actor de la entrega, si aplica. Solo para estado `ENTREGADO`. |
| `fecha_hora` | DATETIME | NO | `NOW()` | NN | Fecha y hora exacta de la transición. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (pedido_id, fecha_hora)`

---

### Tabla: Pago

**Descripción:** Registro del pago de un pedido. Se crea al confirmarse el pago vía webhook de MercadoPago. Exactamente uno por pedido (UNIQUE en `pedido_id`). El `id_transaccion_mp` (`payment_id` de MP) es necesario para emitir reembolsos.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del pago. |
| `pedido_id` | INT | NO | — | FK → Pedido.id, NN, UQ | Pedido al que corresponde el pago. UNIQUE: un solo pago por pedido. |
| `monto` | DECIMAL(10,2) | NO | — | NN | Monto total cobrado. Debe coincidir con `Pedido.total`. |
| `metodo_pago` | VARCHAR(30) | SÍ | NULL | — | Método de pago reportado por MercadoPago (ej. `"credit_card"`, `"debit_card"`, `"account_money"`). NULL hasta que se confirme el pago. |
| `id_transaccion_mp` | VARCHAR(50) | SÍ | NULL | — | `payment_id` de MercadoPago. Se popula al recibir el webhook de pago aprobado. Requerido para emitir reembolsos. No se almacena en `Pedido`; la correlación webhook → pedido se hace por `external_reference = Pedido.id`. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación del registro de pago (momento de procesamiento del webhook). |
| `fecha_confirmacion` | DATETIME | SÍ | NULL | — | Fecha y hora en que MercadoPago confirmó el pago exitosamente. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (pedido_id)`

---

### Tabla: NotaCredito

**Descripción:** Solicitud de reembolso al cliente. Se genera automáticamente ante eventos que implican devolución de dinero. Vinculada 1:1 con `Pago`. El job periódico reintenta los reembolsos fallidos hasta un máximo de 5 intentos; al superarlos, emite la notificación T27 al Administrador.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único de la nota de crédito. |
| `pago_id` | INT | NO | — | FK → Pago.id, NN, UQ | Pago sobre el cual se realiza el reembolso. UNIQUE: una sola nota de crédito por pago. |
| `monto` | DECIMAL(10,2) | NO | — | NN | Monto a reembolsar. En la versión actual siempre igual al `Pago.monto` (no se admiten reembolsos parciales). |
| `estado` | ENUM EstadoNotaCredito | NO | `'PENDIENTE'` | NN | Estado del proceso de reembolso ante la API de MercadoPago. |
| `intentos` | INT | NO | `0` | NN | Contador de intentos de solicitud de reembolso realizados. Máximo: 5. Al alcanzarlo sin éxito, `estado → FALLIDO`. |
| `refund_id_mp` | VARCHAR(50) | SÍ | NULL | — | ID del reembolso en MercadoPago (`refund_id`). Se popula al confirmar el reembolso exitoso por la API. |
| `fecha_emision` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación de la nota de crédito (momento en que se origina la solicitud de reembolso). |
| `fecha_proceso` | DATETIME | SÍ | NULL | — | Fecha y hora en que el reembolso fue procesado exitosamente por MercadoPago. Se registra al pasar a `PROCESADO`. |
| `fecha_fallido` | DATETIME | SÍ | NULL | — | Fecha y hora en que se alcanzó el máximo de intentos fallidos. Se emite notificación T27 al Administrador en este momento. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (pago_id)` | `INDEX (estado)`

**Reglas de negocio:**
- El job periódico procesa registros con `estado = PENDIENTE_REINTENTO`.
- Flujo de reintentos: `PENDIENTE → [primer fallo] → PENDIENTE_REINTENTO → [fallo hasta 5 intentos] → FALLIDO`.
- Al alcanzar 5 intentos: `estado = FALLIDO`, `fecha_fallido = NOW()`, notificación T27 al Administrador.
- El reembolso para `CANCELADO_POR_SISTEMA` se genera solo si `Pago.id_transaccion_mp` no es NULL (pago confirmado previamente).

---

## 10. Relaciones entre Tablas

| # | Tabla Origen | Campo FK | Tabla Destino | Tipo | Cardinalidad | Descripción |
|---|-------------|---------|--------------|------|-------------|-------------|
| 1 | `Localidad` | `provincia_id` | `Provincia` | N:1 | N localidades → 1 provincia | Cada localidad pertenece a una provincia. |
| 2 | `Persona` | `id` | `Usuario` | 1:1 | 1 persona = 1 usuario | Herencia por tabla compartida; PK idéntica. |
| 3 | `PersonaFisica` | `id` | `Persona` | 1:1 | 1 persona física = 1 persona | Subtipo concreto de Persona. |
| 4 | `PersonaJuridica` | `id` | `Persona` | 1:1 | 1 persona jurídica = 1 persona | Subtipo concreto de Persona. Mutuamente excluyente con PersonaFisica. |
| 5 | `Cliente` | `id` | `PersonaFisica` | 1:1 | 1 cliente = 1 persona física | Rol de negocio. Mutuamente excluyente con Administrador. |
| 6 | `Administrador` | `id` | `PersonaFisica` | 1:1 | 1 administrador = 1 persona física | Rol de negocio. Mutuamente excluyente con Cliente. |
| 7 | `Comercio` | `persona_juridica_id` | `PersonaJuridica` | N:1 | N comercios → 1 persona jurídica | Titular legal del comercio. Por regla de negocio de v1: 1:1. |
| 8 | `Direccion` | `localidad_id` | `Localidad` | N:1 | N direcciones → 1 localidad | Ubicación geográfica de la dirección. |
| 9 | `Direccion` | `cliente_id` | `Cliente` | N:1 | N direcciones → 1 cliente | Direcciones de entrega registradas por el cliente. |
| 10 | `Direccion` | `comercio_id` | `Comercio` | 1:1 | 1 dirección ↔ 1 comercio | Dirección operativa única del comercio (UNIQUE). |
| 11 | `Horario` | `comercio_id` | `Comercio` | N:1 | N horarios → 1 comercio | Franjas horarias de atención del comercio. |
| 12 | `Token` | `usuario_id` | `Usuario` | N:1 | N tokens → 1 usuario | Tokens de seguridad generados para el usuario. |
| 13 | `Sesion` | `usuario_id` | `Usuario` | N:1 | N sesiones → 1 usuario | Historial de sesiones del usuario. |
| 14 | `Notificacion` | `usuario_id` | `Usuario` | N:1 | N notificaciones → 1 usuario | Notificaciones emitidas al usuario. |
| 15 | `Soporte` | `usuario_id` | `Usuario` | N:1 | N mensajes → 1 usuario | Mensajes de soporte enviados por el usuario. |
| 16 | `Soporte` | `administrador_id` | `Administrador` | N:1 | N mensajes → 1 administrador | Administrador que atendió el mensaje. |
| 17 | `Reclamo` | `pedido_id` | `Pedido` | 1:1 | 1 reclamo ↔ 1 pedido | Un reclamo por pedido (UNIQUE). |
| 18 | `Reclamo` | `administrador_id` | `Administrador` | N:1 | N reclamos → 1 administrador | Administrador que resolvió el reclamo. |
| 19 | `HistorialAccionComercio` | `comercio_id` | `Comercio` | N:1 | N registros → 1 comercio | Auditoría de acciones admin sobre el comercio. |
| 20 | `HistorialAccionComercio` | `administrador_id` | `Administrador` | N:1 | N registros → 1 administrador | Administrador que ejecutó la acción. |
| 21 | `ConfiguracionTarifa` | `administrador_id` | `Administrador` | N:1 | N configs → 1 administrador | Configuraciones de tarifa registradas por el admin. |
| 22 | `CuentaMercadoPago` | `comercio_id` | `Comercio` | 1:1 | 1 cuenta ↔ 1 comercio | Credenciales OAuth MP del comercio (UNIQUE). |
| 23 | `Producto` | `comercio_id` | `Comercio` | N:1 | N productos → 1 comercio | Catálogo de productos del comercio. |
| 24 | `Producto` | `categoria_id` | `Categoria` | N:1 | N productos → 1 categoría | Clasificación del producto. |
| 25 | `ImagenProducto` | `producto_id` | `Producto` | N:1 | N imágenes → 1 producto | Galería de imágenes del producto (máx. 5). |
| 26 | `ProductoTag` | `producto_id` | `Producto` | N:1 | N registros → 1 producto | Unión M:N: tags de un producto. |
| 27 | `ProductoTag` | `tag_id` | `Tag` | N:1 | N registros → 1 tag | Unión M:N: productos con un tag dado. |
| 28 | `Carrito` | `cliente_id` | `Cliente` | 1:1 | 1 carrito ↔ 1 cliente | Carrito persistente y único por cliente (UNIQUE). |
| 29 | `Carrito` | `comercio_id` | `Comercio` | N:1 | N carritos → 1 comercio | Comercio activo en el carrito del cliente. |
| 30 | `ItemCarrito` | `carrito_id` | `Carrito` | N:1 | N ítems → 1 carrito | Contenido del carrito. |
| 31 | `ItemCarrito` | `producto_id` | `Producto` | N:1 | N ítems → 1 producto | Producto incluido en el ítem del carrito. |
| 32 | `Pedido` | `cliente_id` | `Cliente` | N:1 | N pedidos → 1 cliente | Pedidos realizados por el cliente. |
| 33 | `Pedido` | `comercio_id` | `Comercio` | N:1 | N pedidos → 1 comercio | Pedidos recibidos por el comercio. |
| 34 | `Pedido` | `direccion_id` | `Direccion` | N:1 | N pedidos → 1 dirección | Dirección de entrega (solo `DOMICILIO`). |
| 35 | `DetallePedido` | `pedido_id` | `Pedido` | N:1 | N detalles → 1 pedido | Ítems snapshooteados al confirmar el pedido. |
| 36 | `DetallePedido` | `producto_id` | `Producto` | N:1 | N detalles → 1 producto | Referencia histórica al producto detallado. |
| 37 | `HistorialEstadoPedido` | `pedido_id` | `Pedido` | N:1 | N registros → 1 pedido | Trazabilidad de transiciones de estado. |
| 38 | `Pago` | `pedido_id` | `Pedido` | 1:1 | 1 pago ↔ 1 pedido | Pago asociado al pedido (UNIQUE). |
| 39 | `NotaCredito` | `pago_id` | `Pago` | 1:1 | 1 nota ↔ 1 pago | Solicitud de reembolso asociada al pago (UNIQUE). |

---

## 11. Restricciones UNIQUE — Resumen

| Tabla | Campo(s) | Descripción |
|-------|----------|-------------|
| `Usuario` | `email` | Email único en toda la plataforma. |
| `PersonaFisica` | `dni` | DNI único en toda la plataforma. |
| `PersonaJuridica` | `cuit` | CUIT único en toda la plataforma. |
| `Direccion` | `comercio_id` | Un comercio tiene exactamente una dirección. |
| `Token` | `token` | UUID de token irrepetible. |
| `CuentaMercadoPago` | `comercio_id` | Un comercio tiene como máximo una cuenta MP. |
| `Categoria` | `nombre` | Nombre de categoría único. |
| `Tag` | `nombre` | Nombre de tag único. |
| `Carrito` | `cliente_id` | Un cliente tiene exactamente un carrito. |
| `Reclamo` | `pedido_id` | Máximo un reclamo por pedido. |
| `Pago` | `pedido_id` | Exactamente un pago por pedido. |
| `NotaCredito` | `pago_id` | Exactamente una nota de crédito por pago. |
| `ProductoTag` | `(producto_id, tag_id)` | PK compuesta; evita tags duplicados por producto. |

---

## 12. Reglas de Negocio Transversales

### Ciclo de vida del usuario y propagación al comercio

| Evento | Estado Usuario resultante | Estado Comercio resultante |
|--------|--------------------------|--------------------------|
| Registro (sin verificar email) | `PENDIENTE` | — |
| Verificación de email | `ACTIVO` | — |
| 3 intentos fallidos de login o cambio de contraseña | `BLOQUEADO` | `CERRADO_TEMPORALMENTE` |
| Recuperación de contraseña exitosa (desbloqueo) | `ACTIVO` | `APROBADO` (si era `CERRADO_TEMPORALMENTE`) |
| Suspensión por Administrador | `SUSPENDIDO` | `SUSPENDIDO` |
| Levantamiento de suspensión por Administrador | `ACTIVO` | `APROBADO` |
| Inactivación automática (3 meses sin actividad) | `INACTIVO` | `INACTIVO` |
| Reactivación por token de reactivación | `ACTIVO` | `APROBADO` (si era `INACTIVO`) |

### Ciclo de vida del pedido

```
PENDIENTE_PAGO ──[webhook aprobado]──→ PENDIENTE ──[comercio acepta]──→ EN_PREPARACION
                                                                              │
                                                          DOMICILIO: ──→ EN_CAMINO ──→ ENTREGADO
                                                          RETIRO:    ──→ LISTO_PARA_RETIRAR ──→ ENTREGADO

PENDIENTE_PAGO ──[timeout 30 min]──────────────────────→ CANCELADO_POR_SISTEMA (sin reembolso)
PENDIENTE_PAGO ──[pago rechazado por MP]───────────────→ CANCELADO_POR_SISTEMA (sin reembolso)
PENDIENTE      ──[timeout 1 hora]──────────────────────→ EXPIRADO (con reembolso)
PENDIENTE      ──[comercio rechaza]────────────────────→ RECHAZADO (con reembolso)
EN_PREPARACION ──[comercio anula]──────────────────────→ ANULADO (con reembolso)
PENDIENTE / EN_PREPARACION ──[suspensión comercio]─────→ CANCELADO_POR_SISTEMA (con reembolso)
EN_CAMINO      ──[90 min sin confirmación]─────────────→ ENTREGADO (fuente_entrega: SISTEMA)
LISTO_PARA_RETIRAR ──[90 min durante suspensión]───────→ ENTREGADO (fuente_entrega: SISTEMA, sin reembolso)
```

> **Caso borde webhook:** Si llega `payment.approved` y el pedido ya está en `CANCELADO_POR_SISTEMA` (timeout procesado antes del webhook), se genera el reembolso inmediatamente ya que el cobro efectivamente ocurrió.

### Integridad de montos en pedidos

- `DetallePedido.precio_unitario` = `Producto.precio` al momento de confirmar. Inmutable post-inserción.
- `DetallePedido.subtotal` = `precio_unitario × cantidad`. Calculado al insertar.
- `Pedido.subtotal` = suma de todos los `DetallePedido.subtotal` del pedido. Calculado al crear.
- `Pedido.total` = `subtotal + cargo_servicio_cliente`. Calculado al crear.
- `Pago.monto` = `Pedido.total`. Verificado al procesar el webhook.

### Gestión de reembolsos

- Los reembolsos siempre se canalizan a través de `NotaCredito`. Nunca se emiten directamente desde `Pedido`.
- `CANCELADO_POR_SISTEMA` sin pago confirmado (timeout de `PENDIENTE_PAGO` o pago rechazado) **no** genera `NotaCredito`.
- Máximo 5 intentos de reembolso vía API de MP. Al agotar los intentos: `estado = FALLIDO`, notificación T27.

### Gestión del carrito

- El carrito persiste entre sesiones; es el mismo registro siempre (no se crea uno nuevo por sesión).
- El carrito pasa a `activo = false` al cerrar sesión, inactivarse la cuenta o expirar la sesión.
- El carrito se limpia (ítems eliminados, `comercio_id = NULL`) únicamente al recibir confirmación de pago.
- Ante timeout o rechazo de pago: el carrito permanece intacto para facilitar el reintento del cliente.

---

*Diccionario de Datos — Proyecto Bajoneá — Versión 1.0*
