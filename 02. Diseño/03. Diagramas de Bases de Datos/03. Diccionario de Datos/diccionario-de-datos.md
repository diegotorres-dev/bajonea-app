# Diccionario de Datos — Bajoneá

**Proyecto:** Bajoneá — Plataforma de pedidos gastronómicos en línea  
**Motor de base de datos:** MySQL (InnoDB)  
**ORM / Migraciones:** Spring Data JPA + Hibernate / Flyway  
**Versión del modelo:** 1.6  

## 1. Tipos Enumerados (ENUMs)

---

### ENUM: RolUsuario

Define el rol funcional de un usuario dentro del sistema.

| Valor | Descripción |
|-------|-------------|
| `CLIENTE` | Usuario final que realiza pedidos. Asociado a `PersonaFisica` → `Cliente`. |
| `DUENO` | Titular de uno o varios comercios gastronómicos. Asociado a `PersonaFisica` y a `PersonaJuridica` mediante `Dueno`. |
| `EMPLEADO` | Operador delegado por un Dueno para gestionar uno o varios comercios. Asociado a `PersonaFisica` → `Empleado`, vinculado a comercios mediante `EmpleadoComercio`. |
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
| `ROTISERIA` | Comidas elaboradas y platos listos para llevar. |
| `HELADERIA` | Heladería. |
| `CAFETERIA` | Cafetería. |
| `PANADERIA` | Panadería. |
| `PIZZERIA` | Pizzería. |
| `PARRILLA` | Parrilla / asador. |
| `BAR` | Bar. |
| `KIOSCO` | Kiosco / almacén de cercanía. |
| `FOOD_TRUCK` | Food truck / gastronomía móvil. |
| `OTRO` | Categoría no contemplada en los valores anteriores. |

> Clasificación informativa y visual; todos los tipos de comercio tienen las mismas funcionalidades dentro de la plataforma. Campo candidato a usarse como filtro del catálogo público en una futura versión (no implementado en esta).

---

### ENUM: TipoRedSocial

Plataforma o canal de contacto asociado a un link de red social cargado por el comercio.

| Valor | Descripción |
|-------|-------------|
| `INSTAGRAM` | Perfil de Instagram. |
| `FACEBOOK` | Página de Facebook. |
| `TIKTOK` | Perfil de TikTok. |
| `WHATSAPP` | Enlace directo de WhatsApp (`wa.me`), distinto del campo `Comercio.telefono`. |
| `X` | Perfil de X (ex Twitter). |
| `SITIO_WEB` | Sitio web propio del comercio. |
| `OTRO` | Otro canal no contemplado en los valores anteriores. |

---

### ENUM: EstadoComercio

Ciclo de vida del comercio en la plataforma.

| Valor | Descripción |
|-------|-------------|
| `PENDIENTE` | Solicitud de alta enviada; pendiente de revisión por el Administrador. No visible en el catálogo. |
| `APROBADO` | Aprobado por el Administrador. Visible y operable en la plataforma (sujeto a horario y `cerrado_manualmente`). |
| `RECHAZADO` | Solicitud rechazada por el Administrador con motivo. Puede presentar una re-solicitud de aprobación. |
| `SUSPENDIDO` | Suspendido por el Administrador. Oculto del catálogo. El Dueno titular puede enviar mensaje de soporte. |
| `INACTIVO` | Inactivado por propagación desde el Dueno titular (3 meses sin actividad). Oculto del catálogo. |
| `CERRADO_TEMPORALMENTE` | Cerrado automáticamente por bloqueo del Dueno titular. Se restaura a `APROBADO` al recuperar la contraseña. |

> **Regla de visibilidad:** El comercio se muestra como abierto únicamente si `estado = APROBADO AND Dueno.usuario.estado = ACTIVO AND cerrado_manualmente = false AND hora actual dentro de alguna franja de Horario`.

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


### ENUM: TipoToken

Propósito funcional del token de seguridad de un solo uso.

| Valor | Descripción |
|-------|-------------|
| `VERIFICACION_EMAIL` | Token enviado al registrarse para verificar la dirección de email. |
| `RECUPERACION_PASSWORD` | Token enviado para restablecer la contraseña olvidada. También desbloquea usuarios en estado `BLOQUEADO`. |
| `REACTIVACION_CUENTA` | Token enviado para reactivar una cuenta en estado `INACTIVO`. |
| `INVITACION_EMPLEADO` | Token enviado a la persona invitada por un Dueno para operar un comercio como Empleado. |

> **Nota de implementación (MVP, Tramo 16.12 de `03. Implementación`, 2026-07-28):** el MVP se apartó de este diseño original para los 3 tipos de token existentes en ese momento (`VERIFICACION_EMAIL`, `RECUPERACION_PASSWORD`, `REACTIVACION_CUENTA`) — se generan como un código numérico de 6 dígitos (no UUID v4), pensado para tipeo manual por el usuario en una pantalla de la app, no como parte de un link. `INVITACION_EMPLEADO` se incorpora con posterioridad a esa nota; salvo indicación en contrario en `docs/DECISIONES.md`, sigue el diseño original (UUID v4 como parte de un link de invitación por email). El resto del párrafo (tabla `Token` discriminada por `tipo`, expiración según duración por tipo, invalidación tras el primer uso) sigue vigente sin cambios. Detalle completo en `03. Implementación/docs/modelo-mvp.md` (tabla `token`) y `03. Implementación/docs/DECISIONES.md`.
>
> Todos los tokens se generan como UUID v4, se almacenan en la tabla `Token` discriminada por `tipo`, expiran según la duración definida para cada tipo, y se invalidan tras su primer uso.
---

### ENUM: EstadoEmpleadoComercio

Estado de la relación entre un Empleado y un Comercio puntual (tabla `EmpleadoComercio`).

| Valor | Descripción |
|-------|-------------|
| `PENDIENTE` | Invitación generada; el empleado aún no confirmó su alta en este comercio. |
| `ACTIVO` | El empleado opera este comercio con normalidad. |
| `DESACTIVADO` | El Dueno de este comercio desactivó la relación. No afecta las relaciones del empleado con otros comercios. |

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
| `OTRO` | Motivo no categorizado; se complementa con `Pedido.comentario_rechazo` en texto libre. |

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

### ENUM: EstadoDetallePedido

Estado individual de un ítem (`DetallePedido`) dentro de un pedido ya confirmado. Permite cancelar o anular un ítem puntual sin afectar el resto del pedido — agregado 2026-08-28, ver `docs/DECISIONES.md`.

| Valor | Descripción |
|-------|-------------|
| `ACTIVO` | Estado inicial de todo ítem al confirmarse el pedido. Sin cancelación ni anulación. |
| `CANCELADO` | El ítem fue cancelado (a pedido del cliente o del comercio, según la lógica de negocio que se defina en el tramo de implementación). Estado terminal. |
| `ANULADO` | El ítem fue anulado por el comercio con motivo (`motivo_anulacion`). Estado terminal. |

> `CANCELADO` y `ANULADO` son ambos terminales: un ítem que sale de `ACTIVO` no vuelve a `ACTIVO` ni cambia entre sí. La distinción exacta entre ambos valores (quién puede llevar un ítem a cada uno, y bajo qué circunstancia) es lógica de negocio pendiente del tramo que implemente los endpoints de cancelación/anulación parcial — fuera de alcance del tramo de modelo de datos que introdujo este ENUM.

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

### ENUM: ResolucionSoporte

Resolución de un ticket de soporte determinada por el Administrador.

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
| `NUEVO_PEDIDO` | T1 | Dueno y Empleados activos del comercio | Push | Nuevo pedido recibido en estado `PENDIENTE`. |
| `PEDIDO_ACEPTADO` | T2 | Cliente | Push | Pedido aceptado por el comercio; pasa directamente a `EN_PREPARACION`. |
| `PEDIDO_RECHAZADO` | T3 | Cliente | Push | Pedido rechazado por el comercio con motivo. |
| `PEDIDO_EN_CAMINO` | T5 | Cliente | Push | Pedido despachado (modalidad `DOMICILIO`). |
| `PEDIDO_LISTO_RETIRO` | T6 | Cliente | Push | Pedido listo para retirar en el local (modalidad `RETIRO`). |
| `AVISO_75MIN_SIN_CONFIRMACION` | T7 | Cliente | Push | Aviso preventivo: 75 min en estado `EN_CAMINO` sin confirmación de recepción. |
| `PEDIDO_AUTOCONFIRMADO` | T8 | Cliente | Push | Pedido autoconfirmado como `ENTREGADO` a los 90 min. Incluye opciones para iniciar reclamo o contactar al comercio. |
| `PEDIDO_CANCELADO_CLIENTE` | T9 | Dueno y Empleados activos del comercio | Push | El cliente canceló un pedido activo. |
| `PEDIDO_ANULADO_COMERCIO` | T10 | Cliente | Push | El comercio anuló el pedido desde `EN_PREPARACION`. |
| `PEDIDO_CANCELADO_SISTEMA` | T11 | Cliente | Push + Email | Pedido cancelado por el sistema con motivo (suspensión, timeout, pago rechazado). |
| `PEDIDO_EXPIRADO_CLIENTE` | T12 | Cliente | Push | El comercio no respondió en 1 hora; pedido expirado y reembolso en proceso. |
| `PEDIDO_EXPIRADO_COMERCIO` | T13 | Dueno y Empleados activos del comercio | Push | Aviso al comercio de pedido expirado por falta de respuesta. |
| `COMERCIO_APROBADO` | T14 | Dueno | Push + Email | La solicitud del comercio fue aprobada por el Administrador. |
| `COMERCIO_RECHAZADO` | T15 | Dueno | Push + Email | La solicitud del comercio fue rechazada con motivo. |
| `COMERCIO_SUSPENDIDO` | T16 | Dueno y Empleados activos del comercio | Push + Email | El comercio fue suspendido por el Administrador con motivo. |
| `NUEVO_COMERCIO_PENDIENTE` | T17 | Administrador | Push | Nueva solicitud de alta de comercio para revisar en el panel. |
| `NUEVA_RESOLICITUD_COMERCIO` | T18 | Administrador | Push | Re-solicitud de aprobación de un comercio rechazado. |
| `NUEVO_RECLAMO` | T19 | Administrador | Push | Nuevo reclamo iniciado por un cliente. |
| `RECLAMO_APROBADO` | T20 | Cliente | Push | Reclamo aprobado; reembolso en proceso. |
| `RECLAMO_RECHAZADO` | T21 | Cliente | Push | Reclamo rechazado con motivo por el Administrador. |
| `NUEVO_MENSAJE_SOPORTE` | T22 | Administrador | Push | Nuevo mensaje de soporte de un usuario suspendido. |
| `PRODUCTO_REMOVIDO_CARRITO` | T23 | Cliente | Push | Un producto fue eliminado del carrito activo por pasar a `AGOTADO` o `DESCONTINUADO`. |
| `CUENTA_INACTIVADA` | T24 | Cliente, Dueno o Empleado | Email | Cuenta inactivada automáticamente por 3 meses sin actividad. |
| `COMERCIO_INACTIVADO` | T25 | Dueno | Email | Comercio inactivado automáticamente por inactividad del Dueno titular. |
| `PEDIDO_CERRADO_TIMER_SUSPENSION` | T26 | Cliente | Push | Pedido `LISTO_PARA_RETIRAR` cerrado automáticamente por vencimiento del timer de 90 min durante la suspensión del comercio, sin reembolso. |
| `REEMBOLSO_FALLIDO_DEFINITIVO` | T27 | Administrador | Push + Email | Reembolso fallido tras 5 intentos; requiere intervención manual. |
| `CLIENTE_SUSPENDIDO` | T28 | Cliente | Push + Email | Cliente suspendido por el Administrador con motivo. |
| `SUSPENSION_LEVANTADA` | T29 | Cliente o Dueno | Push + Email | Suspensión levantada por el Administrador. |
| `PEDIDO_AUTOCONFIRMADO_COMERCIO` | T30 | Dueno y Empleados activos del comercio | Push | El sistema autoconfirmó la entrega del pedido (timer 90 min). |
| `INVITACION_EMPLEADO` | T31 | Persona invitada | Email (+ Push si ya tiene cuenta) | Invitación para operar un comercio como Empleado. |
| `EMPLEADO_DESACTIVADO` | T32 | Empleado | Push | El Dueno desactivó al empleado de un comercio puntual. |

---

### ENUM: TipoEntidadNotificacion

Tipo de entidad referenciada por `Notificacion.entidad_id`, cuando la notificación permite un deep-link a un recurso concreto (ej. "ver pedido" desde la campana de notificaciones). Diseño genérico (`entidad_tipo` + `entidad_id`) en vez de una columna `*_id` nullable por cada tipo de entidad referenciable — ver regla de negocio de integridad en `Tabla: Notificacion` más abajo.

| Valor | Descripción |
|-------|-------------|
| `PEDIDO` | `entidad_id` referencia un `Pedido.id`. |
| `COMERCIO` | `entidad_id` referencia un `Comercio.id`. |

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

**Descripción:** Catálogo estático de localidades de Argentina. Precargado desde la API Georef. Cada localidad pertenece a una provincia. **Excepción (MVP, Tramo 16.12):** la fila de Tolhuin (Tierra del Fuego) no viene de la API Georef — no existe en su endpoint /localidades— se cargó aparte vía migración Flyway; verdocs/modelo-mvp.md.

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

**Descripción:** Entidad central del sistema de identidad. Almacena credenciales, estado operacional actual y metadatos de seguridad para todos los actores del sistema. Las transiciones de estado y sus fechas se registran en `HistorialEstadoUsuario`. La PK (`id`) es compartida con `Persona` mediante herencia por tabla.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del usuario. Compartido con `Persona` (mismo valor). |
| `email` | VARCHAR(150) | NO | — | NN, UQ | Dirección de email. Identificador de acceso único en toda la plataforma. |
| `password_hash` | VARCHAR(255) | NO | — | NN | Hash de la contraseña generado con BCrypt. Nunca se almacena en texto plano. |
| `rol` | ENUM RolUsuario | NO | — | NN | Rol funcional: `CLIENTE`, `DUENO`, `EMPLEADO` o `ADMINISTRADOR`. Determina las entidades asociadas y los permisos de la API. |
| `estado` | ENUM EstadoUsuario | NO | `'PENDIENTE'` | NN | Estado operacional actual del usuario. Consultado en cada validación de seguridad. |
| `email_verificado` | TINYINT(1) | NO | `false` | NN | `true` una vez que el usuario consumió exitosamente el token de `VERIFICACION_EMAIL`. |
| `foto_perfil_url` | VARCHAR(500) | SÍ | NULL | — | URL en Cloudinary de la foto de perfil personal del usuario. Opcional para los cuatro roles. Campo independiente de `Comercio.foto_perfil_url` (logo del negocio): no se comparte entre los distintos comercios de un mismo Dueno. |
| `intentos_fallidos` | INT | NO | `0` | NN | Contador de intentos fallidos de login o de cambio de contraseña desde perfil. Se resetea al autenticarse correctamente. Al llegar a 3, el usuario pasa a `BLOQUEADO`. |
| `fecha_registro` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación del registro de usuario. Inmutable. |
| `fecha_ultimo_acceso` | DATETIME | SÍ | NULL | — | Fecha y hora del último inicio de sesión exitoso. Criterio para detectar inactividad (3 meses sin actualización = `INACTIVO`). |
| `fecha_actualizacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última modificación de cualquier campo del registro. |

> **Campos eliminados en v1.2:** `fecha_bloqueo`, `fecha_suspension`, `motivo_suspension`, `fecha_inactivo`, `fecha_reactivacion`. Todos se derivan desde `HistorialEstadoUsuario`: `SELECT estado_destino, motivo, fecha_hora FROM HistorialEstadoUsuario WHERE usuario_id = ? ORDER BY fecha_hora DESC`.

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (email)` | `INDEX (rol)` | `INDEX (estado)`

**Reglas de negocio:**
- Al registrarse: `estado = PENDIENTE`, `email_verificado = false`. Se inserta la primera fila en `HistorialEstadoUsuario` con `estado_origen = NULL`, `estado_destino = PENDIENTE`.
- Tras 3 intentos fallidos: `estado → BLOQUEADO`, `intentos_fallidos` se resetea a 0. Se inserta fila en `HistorialEstadoUsuario`.
- `fecha_ultimo_acceso` se actualiza en cada login exitoso y es el único criterio para la inactivación por 3 meses.
- Cada cambio de `estado` genera un INSERT en `HistorialEstadoUsuario` con `estado_origen` (estado previo) y `estado_destino` (nuevo estado).

---

### Tabla: HistorialEstadoUsuario

**Descripción:** Registro histórico de todas las transiciones de estado del usuario. Tabla de detalle 1:N de `Usuario`. Cada cambio de `Usuario.estado` genera una nueva fila. Patrón de máquina de estados: registra el estado previo y el estado resultante de cada transición. Permite auditoría completa del ciclo de vida del usuario sin sobreescribir datos.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del registro histórico. |
| `usuario_id` | INT | NO | — | FK → Usuario.id, NN | Usuario cuyo estado cambió. |
| `estado_origen` | ENUM EstadoUsuario | SÍ | NULL | — | Estado del usuario antes de la transición. NULL únicamente en el primer registro (creación del usuario, sin estado previo). |
| `estado_destino` | ENUM EstadoUsuario | NO | — | NN | Estado resultante del usuario tras la transición. |
| `motivo` | VARCHAR(500) | SÍ | NULL | — | Motivo de la transición. Obligatorio para `SUSPENDIDO`; opcional para los demás estados. El actor se infiere de la transición: `BLOQUEADO` = sistema, `SUSPENDIDO` = admin, `INACTIVO` = sistema. |
| `fecha_hora` | DATETIME | NO | `NOW()` | NN | Fecha y hora exacta de la transición. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (usuario_id)` | `INDEX (fecha_hora)`

**Reglas de negocio:**
- Tabla de solo inserción (append-only). No se modifica ni elimina ningún registro.
- El estado actual del usuario se obtiene desde `Usuario.estado`. El historial completo, desde esta tabla ordenada por `fecha_hora ASC`.
- Para obtener la última suspensión: `SELECT motivo, fecha_hora FROM HistorialEstadoUsuario WHERE usuario_id = ? AND estado_destino = 'SUSPENDIDO' ORDER BY fecha_hora DESC LIMIT 1`.

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

### Tabla: Empleado

**Descripción:** Subtipo de `PersonaFisica` con rol `EMPLEADO`. Tabla de identidad que actúa como nodo de unión entre el usuario y los comercios donde opera (relación M:N vía `EmpleadoComercio`). No tiene columnas propias más allá de la PK y el timestamp de creación.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | — | PK, FK → PersonaFisica.id | Mismo valor que `PersonaFisica.id`. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación del registro de empleado. |

**Índices:** `PRIMARY KEY (id)`

**Reglas de negocio:**
- No lleva `fecha_modificacion` ni `fecha_baja` propias: la baja de la cuenta se maneja vía `Usuario.estado` (`SUSPENDIDO`/`INACTIVO`), igual que `Cliente` y `Administrador`.
- La baja de un Empleado en un comercio puntual (sin afectar sus otras relaciones) se maneja vía `EmpleadoComercio.estado = DESACTIVADO`, no en esta tabla.

---

### Tabla: Dueno

**Descripción:** Subtipo de `PersonaJuridica` **y** de `PersonaFisica` simultáneamente, con rol `DUENO`. Tabla de identidad del titular de uno o varios `Comercio`. Representa que el titular legal del negocio (`PersonaJuridica`) es siempre la misma persona física (`PersonaFisica`) que se registró en la plataforma — ambas relaciones son 1:1 y corresponden al mismo `Persona`/`Usuario`. No tiene columnas propias más allá de la PK, la FK hacia `PersonaFisica` y el timestamp de creación: los datos personales viven en `PersonaFisica`, los datos fiscales en `PersonaJuridica` y los datos del negocio en `Comercio`.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | — | PK, FK → PersonaJuridica.id | Mismo valor que `PersonaJuridica.id`. |
| `persona_fisica_id` | INT | NO | — | FK → PersonaFisica.id, NN, UQ | Persona física titular del negocio. Misma persona que ya está asociada a este Usuario/Persona vía la relación de herencia estándar — esta FK existe para permitir navegar directamente de Dueno a sus datos personales sin atravesar el nodo Persona. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación del registro de Dueno. |

**Índices:** `PRIMARY KEY (id)`, `UNIQUE KEY (persona_fisica_id)`

**Reglas de negocio:**
- No lleva `fecha_modificacion` ni `fecha_baja` propias: la baja de la cuenta se maneja vía `Usuario.estado` (`SUSPENDIDO`/`INACTIVO`), igual que `Cliente` y `Administrador`.
- Un Dueno puede tener múltiples `Comercio` asociados (relación N:1 nativa desde `Comercio.dueno_id`).
- La vinculación de MercadoPago (`CuentaMercadoPago`) cuelga del Dueno, no de cada comercio: se vincula una sola vez y habilita el cobro en todos sus comercios aprobados.
- `persona_fisica_id` debe corresponder siempre a la misma fila de `PersonaFisica` asociada al `Persona` del cual este `Dueno` desciende (vía `PersonaJuridica.id = Dueno.id = Persona.id`). No se valida a nivel de FK que ambas relaciones apunten al mismo `Persona.id` — es responsabilidad del `RegistroService` garantizarlo al crear ambas filas en la misma transacción de registro.

---

## 4. Módulo Comercio

---

### Tabla: Comercio

**Descripción:** Entidad principal que representa a un comercio gastronómico en la plataforma. Vinculado a un `Dueno` como titular. Un mismo Dueno puede administrar varios comercios (relación N:1). Tiene estado propio que puede ser afectado automáticamente por el estado de su Dueno titular. Los motivos y fechas de cada transición de estado se registran exclusivamente en `HistorialEstadoComercio`; esta tabla conserva únicamente el estado operacional actual y los atributos que no tienen naturaleza histórica repetible.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del comercio. |
| `dueno_id` | INT | NO | — | FK → Dueno.id, NN | Dueno titular del comercio. Relación N:1: un mismo Dueno puede administrar varios comercios. |
| `nombre` | VARCHAR(150) | NO | — | NN | Nombre comercial o de fantasía del comercio. |
| `descripcion` | TEXT | SÍ | NULL | — | Descripción libre del comercio: propuesta de valor, especialidades, etc. |
| `foto_perfil_url` | VARCHAR(500) | NO | — | NN | URL del logo/imagen de perfil del comercio almacenada en Cloudinary. Campo propio de cada comercio: no se comparte entre los distintos comercios de un mismo Dueno, a diferencia de `Usuario.foto_perfil_url` (foto personal del Dueno/Empleado). |
| `telefono` | VARCHAR(30) | NO | — | NN | Teléfono de contacto del comercio. Se usa para generar enlace `wa.me`. |
| `email` | VARCHAR(150) | NO | — | NN | Email de contacto del comercio (puede ser distinto al email del Dueno titular). |
| `tipo_comercio` | ENUM TipoComercio | NO | — | NN | Categoría del negocio (ver ENUM TipoComercio, 12 valores). Clasificación informativa y visual; no altera funcionalidades. |
| `acepta_delivery` | TINYINT(1) | NO | `false` | NN | `true` si el comercio ofrece entrega a domicilio. |
| `acepta_retiro` | TINYINT(1) | NO | `false` | NN | `true` si el comercio permite retiro en el local. |
| `estado` | ENUM EstadoComercio | NO | `'PENDIENTE'` | NN | Estado operacional actual del comercio. Consultado en cada validación de pedido. |
| `cerrado_manualmente` | TINYINT(1) | NO | `false` | NN | `true` si el comerciante cerró manualmente su tienda. Independiente del estado y del horario. Se combina con ambos para determinar la disponibilidad real. |
| `fecha_resolicitud` | DATETIME | SÍ | NULL | — | Fecha y hora en que el comercio presentó una nueva solicitud de aprobación tras ser rechazado. Permite al Administrador distinguir re-solicitudes de solicitudes iniciales en el panel de revisión. |
| `mp_vinculado` | TINYINT(1) | NO | `false` | NN | `true` si el Dueno titular de este comercio tiene una `CuentaMercadoPago` activa. Se actualiza en TODOS los comercios del mismo Dueno al vincular o desvincular. |
| `fecha_registro` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación del comercio en el sistema. Inmutable. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última modificación del perfil del comercio (nombre, descripción, teléfono, foto, modalidades). |

> **Campos eliminados en v1.1:** `motivo_rechazo`, `fecha_rechazo`, `motivo_suspension`, `fecha_suspension`, `fecha_aprobacion`, `fecha_reactivacion`. Todos se obtienen desde `HistorialEstadoComercio` con `WHERE comercio_id = ? AND estado_destino = 'RECHAZADO' ORDER BY fecha_hora DESC LIMIT 1` (o el `estado_destino` correspondiente).

**Índices:** `PRIMARY KEY (id)` | `INDEX (dueno_id)` | `INDEX (estado)`

**Reglas de negocio:**
- Un comercio puede recibir pedidos si: `estado = APROBADO AND mp_vinculado = true AND cerrado_manualmente = false AND Dueno titular con Usuario.estado = ACTIVO AND hora actual dentro de Horario`.
- Propagación automática desde el estado del `Usuario` del Dueno titular hacia TODOS los comercios que administra: `BLOQUEADO → CERRADO_TEMPORALMENTE`; `INACTIVO → INACTIVO`; `SUSPENDIDO → SUSPENDIDO`.
- Al recuperar contraseña (desbloqueo del Dueno): se restaura automáticamente a `APROBADO` el estado de todos los comercios de ese Dueno que estuvieran en `CERRADO_TEMPORALMENTE`.
- Al reactivarse la cuenta del Dueno (token de reactivación): se restaura automáticamente a `APROBADO` el estado de todos los comercios de ese Dueno que estuvieran en `INACTIVO`.
- La suspensión de un comercio puntual por el Administrador es una acción a nivel `Comercio`: cambia el estado de ese comercio a `SUSPENDIDO` sin alterar el estado del Dueno ni el de sus demás comercios.
- Los cambios de estado sobre la cuenta de un Empleado no propagan ningún efecto sobre los comercios donde opera.
- Para obtener el motivo y fecha del último rechazo: `SELECT motivo, fecha_hora FROM HistorialEstadoComercio WHERE comercio_id = ? AND estado_destino = 'RECHAZADO' ORDER BY fecha_hora DESC LIMIT 1`.
- Para obtener el motivo y fecha de la última suspensión: ídem con `estado_destino = 'SUSPENDIDO'`.
- Para obtener la fecha de la última aprobación o reactivación: ídem con `estado_destino = 'APROBADO'`.

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

### Tabla: RedSocial

**Descripción:** Links de contacto y redes sociales cargados manualmente por el comercio (Dueno o Empleado autorizado), visibles en su perfil público. No implica integración OAuth ni sincronización automática con las plataformas externas — ver aclaración en Alcance y Limitaciones.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del link. |
| `comercio_id` | INT | NO | — | FK → Comercio.id, NN | Comercio Dueno del link. |
| `tipo` | ENUM TipoRedSocial | NO | — | NN | Plataforma o canal del link. |
| `url` | VARCHAR(500) | NO | — | NN | Link completo. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación del registro. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última edición de la url. |
| `fecha_baja` | DATETIME | SÍ | NULL | — | Baja lógica, si el comercio elimina el link. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (comercio_id)` | `UNIQUE (comercio_id, tipo)`

**Reglas de negocio:**
- El `UNIQUE (comercio_id, tipo)` aplica solo a filas activas (`fecha_baja IS NULL`) a nivel de validación de aplicación, no como constraint SQL — permite recargar un tipo de red social dado de baja anteriormente.
- Mínimo 1 fila por `comercio_id`, validado a nivel aplicación.

---

### Tabla: CuentaMercadoPago

**Descripción:** Credenciales OAuth del Dueno en MercadoPago bajo el modelo Marketplace con split de pagos. Se vincula una única vez por Dueno y habilita el cobro en todos los comercios que administra. El `access_token` permite al backend crear preferencias de pago con `application_fee` en nombre de esos comercios.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del registro. |
| `dueno_id` | INT | NO | — | FK → Dueno.id, NN, UQ | Dueno al que pertenece la cuenta vinculada. UNIQUE: un solo registro por Dueno, compartido por todos sus comercios. |
| `mp_user_id` | VARCHAR(50) | NO | — | NN | ID del usuario en la plataforma de MercadoPago (obtenido durante el flujo OAuth). |
| `access_token` | VARCHAR(255) | NO | — | NN | Token de acceso OAuth para llamadas a la API de MP en nombre del Dueno. Sensible: considerar cifrado en reposo. |
| `refresh_token` | VARCHAR(255) | NO | — | NN | Token de renovación OAuth para obtener un nuevo `access_token` antes de que expire. Sensible. |
| `public_key` | VARCHAR(255) | SÍ | NULL | — | Clave pública del Dueno en MercadoPago. Puede usarse para inicializar el SDK en el frontend. |
| `activa` | TINYINT(1) | NO | `true` | NN | `true` si la vinculación está activa. Pasa a `false` al desvincular. |
| `fecha_vinculacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora en que el Dueno completó el flujo OAuth exitosamente. |
| `fecha_desvinculacion` | DATETIME | SÍ | NULL | — | Fecha y hora en que el Dueno desvinculó su cuenta. Se popula al desvincular. |
| `token_expira` | DATETIME | SÍ | NULL | — | Fecha y hora de expiración del `access_token`. El sistema debe renovar antes de que venza. |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (dueno_id)`

**Reglas de negocio:**
- Al desvincular: `activa = false`, `fecha_desvinculacion = NOW()`; se actualiza `mp_vinculado = false` en TODOS los comercios de ese Dueno.
- Al vincular (nueva o renovación): `activa = true`; se actualiza `mp_vinculado = true` en TODOS los comercios de ese Dueno.

---

### Tabla: EmpleadoComercio

**Descripción:** Tabla puente M:N entre `Empleado` y `Comercio`. Cada fila representa la relación entre un empleado y un comercio puntual, controlada de forma independiente por el Dueno de ESE comercio — no afecta las relaciones del empleado con otros comercios, incluso si pertenecen a otro Dueno.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único de la relación. |
| `empleado_id` | INT | NO | — | FK → Empleado.id, NN | Empleado vinculado al comercio. |
| `comercio_id` | INT | NO | — | FK → Comercio.id, NN | Comercio donde opera el empleado. |
| `estado` | ENUM EstadoEmpleadoComercio | NO | `'PENDIENTE'` | NN | Estado de la relación empleado-comercio. |
| `fecha_alta` | DATETIME | NO | `NOW()` | NN | Fecha y hora en que se generó la invitación (creación de la fila). |
| `fecha_baja` | DATETIME | SÍ | NULL | — | Fecha y hora en que el Dueno de ese comercio desactivó la relación (`estado → DESACTIVADO`). |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (empleado_id, comercio_id)` | `INDEX (comercio_id)` | `INDEX (empleado_id)`

**Reglas de negocio:**
- Si el email invitado ya corresponde a un `Usuario` existente en la plataforma (sea `Cliente`, `Empleado` en otro comercio, u otro rol), la invitación reutiliza ese `Usuario`/`PersonaFisica`: si aún no tiene fila en `Empleado`, se crea únicamente esa fila (sin pedir de nuevo nombre, apellido, DNI o contraseña); en cualquier caso se crea la fila nueva en `EmpleadoComercio` para este comercio. Solo si el email no corresponde a ningún `Usuario` existente se crean `Usuario`/`PersonaFisica`/`Empleado` desde cero. Comportamiento intencional, no un bug a prevenir — ver `docs/DECISIONES.md`.
- El registro queda en `PENDIENTE` hasta que el empleado confirma su email (token `INVITACION_EMPLEADO`).
- El Dueno puede pasar el estado a `DESACTIVADO` en cualquier momento para su comercio puntual, sin afectar los otros comercios donde ese empleado esté `ACTIVO`.
- No lleva `fecha_modificacion`: no se registra el momento exacto de la transición `PENDIENTE → ACTIVO`.

---

### Tabla: HistorialEstadoComercio

**Descripción:** Registro histórico inmutable de todas las transiciones de estado del comercio. Tabla de detalle 1:N de `Comercio`. Patrón de máquina de estados: registra el estado previo (`estado_origen`) y el estado resultante (`estado_destino`) de cada transición. Cubre tanto acciones administrativas como transiciones automáticas del sistema. Cada registro es de solo inserción; no se modifica ni elimina.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del registro. |
| `comercio_id` | INT | NO | — | FK → Comercio.id, NN | Comercio cuyo estado cambió. |
| `administrador_id` | INT | SÍ | NULL | FK → Administrador.id | Administrador que ejecutó la transición. NULL cuando la transición es automática (sistema). |
| `estado_origen` | ENUM EstadoComercio | NO | — | NN | Estado del comercio antes de la transición. |
| `estado_destino` | ENUM EstadoComercio | NO | — | NN | Estado del comercio después de la transición. |
| `motivo` | VARCHAR(500) | SÍ | NULL | — | Motivo de la transición. Obligatorio para transiciones hacia `RECHAZADO` y `SUSPENDIDO`. Opcional en los demás casos. |
| `fecha_hora` | DATETIME | NO | `NOW()` | NN | Fecha y hora exacta de la transición. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (comercio_id)` | `INDEX (administrador_id)` | `INDEX (fecha_hora)`

**Reglas de negocio:**
- Tabla append-only. Nunca se modifica ni elimina ningún registro.
- `administrador_id = NULL` identifica transiciones automáticas del sistema (ej.: `APROBADO → CERRADO_TEMPORALMENTE` por bloqueo del Dueno titular).
- Para obtener el motivo y fecha del último rechazo: `SELECT motivo, fecha_hora FROM HistorialEstadoComercio WHERE comercio_id = ? AND estado_destino = 'RECHAZADO' ORDER BY fecha_hora DESC LIMIT 1`.
- Para obtener el motivo y fecha de la última suspensión: ídem con `estado_destino = 'SUSPENDIDO'`.

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

**Descripción:** Tokens de un solo uso para operaciones críticas de seguridad. Tabla discriminada por el campo `tipo` que unifica los tres flujos de tokenización del sistema. Los tokens se generan como UUID v4 y se envían al usuario por email como parte de un enlace de acción. **MVP (Tramo 16.12):** en vez de UUID v4 y de un enlace, el MVP usa un código numérico de 6 dígitos que el usuario tipea a mano en la app — ver nota en `ENUM: TipoToken` más arriba.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del registro de token. |
| `usuario_id` | INT | NO | — | FK → Usuario.id, NN | Usuario al que pertenece el token. |
| `tipo` | ENUM TipoToken | NO | — | NN | Propósito del token: `VERIFICACION_EMAIL`, `RECUPERACION_PASSWORD` o `REACTIVACION_CUENTA`. |
| `token` | VARCHAR(36) | NO | — | NN, UQ | Valor del token. Diseño original: UUID v4 incluido en un enlace. **MVP (Tramo 16.12):** código numérico de 6 dígitos, tipeado a mano por el usuario — la columna sigue en VARCHAR(36) sin angostar (ver `docs/modelo-mvp.md`). UNIQUE para garantizar irrepetibilidad global. || `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de generación del token. |
| `fecha_vencimiento` | DATETIME | NO | — | NN | Fecha y hora de expiración. Calculada al crear el token según la duración configurada para cada tipo. |
| `fecha_uso` | DATETIME | SÍ | NULL | — | Fecha y hora en que el usuario consumió el token. Se registra al pasar a `UTILIZADO`. |
| `estado` | ENUM EstadoToken | NO | `'PENDIENTE'` | NN | Estado del ciclo de vida del token. |
| `intentos_fallidos` | INT | NO | `0` | NN | Contador de intentos fallidos de verificación de este token (código de 6 dígitos). Protección anti-fuerza-bruta independiente del contador de intentos de login (`Usuario.intentos_fallidos`) — ambas columnas coexisten a propósito, cada una protege una amenaza distinta (login vs. verificación de OTP/token de un solo uso). |

**Índices:** `PRIMARY KEY (id)` | `UNIQUE (token)` | `INDEX (usuario_id, tipo, estado)`

**Reglas de negocio:**
- Un job periódico actualiza a `EXPIRADO` todos los tokens donde `fecha_vencimiento <= NOW() AND estado = 'PENDIENTE'`.
- Al consumirse: `estado = UTILIZADO`, `fecha_uso = NOW()`. No puede reutilizarse.
- Al reenviar un token del mismo tipo para el mismo usuario, los tokens `PENDIENTE` anteriores del mismo tipo deben invalidarse.
- Cada intento fallido de verificación (código incorrecto) incrementa `intentos_fallidos` en 1. Al alcanzar `MAX_INTENTOS_TOKEN_VERIFICACION = 5` intentos fallidos, el token deja de aceptar verificaciones aunque siga `PENDIENTE` y no haya vencido — el usuario debe solicitar un token nuevo.

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
| `entidad_tipo` | ENUM TipoEntidadNotificacion | SÍ | NULL | — | Tipo de entidad referenciada por `entidad_id`, para deep-link desde la notificación (ej. "ver pedido"). NULL si la notificación no referencia ninguna entidad concreta. Va siempre junto con `entidad_id`: ambas con valor o ambas `NULL`. |
| `entidad_id` | INT | SÍ | NULL | — | Id de la entidad referenciada, interpretado según `entidad_tipo`. Sin FK física (ver regla de negocio abajo). NULL si la notificación no referencia ninguna entidad concreta. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (usuario_id, leida)` | `INDEX (estado)`

**Reglas de negocio:**
- `entidad_tipo` + `entidad_id` es una referencia genérica opcional hacia cualquier entidad del sistema (hoy `PEDIDO` o `COMERCIO`, ver `ENUM: TipoEntidadNotificacion`), en vez de una columna `*_id` nullable dedicada por cada tipo de entidad referenciable — diseño abierto a sumar más valores de `entidad_tipo` a futuro sin alterar la estructura de la tabla.
- **Sin FK física:** MySQL no soporta una FK condicional/polimórfica que apunte a distintas tablas según el valor de otra columna. La integridad de `entidad_id` respecto a la tabla indicada por `entidad_tipo` se garantiza a nivel de aplicación, no de base de datos. Si la entidad referenciada se elimina físicamente en el futuro, corresponde limpiar o anular las notificaciones asociadas a nivel de servicio.

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
| `resolucion` | ENUM ResolucionSoporte | SÍ | NULL | — | Resolución del ticket: `REACTIVADO` o `SUSPENSION_MANTENIDA`. NULL mientras no fue atendido. |
| `fecha_resolucion` | DATETIME | SÍ | NULL | — | Fecha y hora de resolución por el Administrador. NULL mientras no fue atendido. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (usuario_id)` | `INDEX (atendido)`

---

### Tabla: Reclamo

**Descripción:** Reclamos iniciados por clientes sobre pedidos autoconfirmados como entregados o con entrega cuestionada. Un pedido puede tener como máximo un reclamo (UNIQUE en `pedido_id`). Si el reclamo se aprueba, se genera una `NotaCredito` para el reembolso.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del reclamo. |
| `pedido_id` | INT | NO | — | FK → Pedido.id, NN, UQ | Pedido sobre el que se realiza el reclamo. UNIQUE: máximo un reclamo por pedido. |
| `descripcion` | TEXT | NO | — | NN | Descripción del problema ingresada por el **cliente** al crear el reclamo. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación del reclamo. |
| `estado` | ENUM EstadoReclamo | NO | `'PENDIENTE'` | NN | Estado del reclamo en el flujo de resolución. |
| `administrador_id` | INT | SÍ | NULL | FK → Administrador.id | Administrador que resolvió el reclamo. NULL mientras está `PENDIENTE`. |
| `nota_resolucion` | VARCHAR(500) | SÍ | NULL | — | Nota del **Administrador** al resolver el reclamo, aplicable tanto a `APROBADO` como a `RECHAZADO`. NULL mientras está `PENDIENTE`. Semánticamente distinto de `descripcion` (cliente) y de `Pedido.motivo_rechazo` (comercio rechazando el pedido). |
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

### Tabla: GrupoExtra

**Descripción:** Grupo de opciones de personalización configurado por el comercio para uno o varios productos (ej. "Agregados", "Elegí tu salsa"). Un producto puede tener múltiples grupos asociados (M:N vía `ProductoGrupoExtra`).

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del grupo. |
| `comercio_id` | INT | NO | — | FK → Comercio.id, NN | Comercio Dueno del grupo. |
| `nombre` | VARCHAR(100) | NO | — | NN | Nombre del grupo (ej. "Agregados", "Elegí tu salsa"). |
| `cantidad_maxima` | INT | NO | `1` | NN | Máximo de opciones seleccionables del grupo. `1` = elegí solo una. |
| `obligatorio` | TINYINT(1) | NO | `false` | NN | `true` exige al menos 1 selección de este grupo antes de confirmar el pedido. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última modificación. |
| `fecha_baja` | DATETIME | SÍ | NULL | — | Baja lógica. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (comercio_id)`

---

### Tabla: Extra

**Descripción:** Opción individual dentro de un `GrupoExtra` (ej. "Panceta extra"). Su precio se suma al precio del producto al seleccionarse.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único del extra. |
| `grupo_extra_id` | INT | NO | — | FK → GrupoExtra.id, NN | Grupo al que pertenece. Un extra pertenece a un solo grupo (1:N). |
| `nombre` | VARCHAR(100) | NO | — | NN | Nombre del extra (ej. "Panceta extra"). |
| `precio` | DECIMAL(10,2) | NO | `0` | NN | Monto que se suma al precio del producto. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación. |
| `fecha_modificacion` | DATETIME | SÍ | NULL | — | Fecha y hora de la última modificación. |
| `fecha_baja` | DATETIME | SÍ | NULL | — | Baja lógica. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (grupo_extra_id)`

---

### Tabla: ProductoGrupoExtra

**Descripción:** Tabla de unión M:N entre `Producto` y `GrupoExtra`. Un producto sin filas en esta tabla no ofrece extras.

| Columna | Tipo MySQL | Nulo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `producto_id` | INT | NO | PK (componente), FK → Producto.id | Producto que ofrece el grupo de extras. |
| `grupo_extra_id` | INT | NO | PK (componente), FK → GrupoExtra.id | Grupo de extras ofrecido en el producto. |

**Índices:** `PRIMARY KEY (producto_id, grupo_extra_id)` | `INDEX (grupo_extra_id)`

**Reglas de negocio de Extras (a nivel aplicación):**
- Producto sin filas en `ProductoGrupoExtra` no ofrece extras.
- Al agregar un extra de un grupo con `cantidad_maxima = 1`: reemplaza cualquier otro extra del mismo grupo ya presente en ese ítem. Si `cantidad_maxima > 1`, acumula hasta el máximo.
- Al confirmar el pedido: se valida que todo `GrupoExtra` con `obligatorio = true` asociado al producto tenga al menos un `Extra` elegido, o se rechaza la confirmación con mensaje claro.
- El total del carrito suma `ItemCarritoExtra.precio_unitario` de todos los ítems.

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

### Tabla: ItemCarritoExtra

**Descripción:** Extras seleccionados por el cliente para un ítem del carrito. Tabla de borrador: si el cliente quita el extra, la fila se elimina físicamente (no hay baja lógica), mismo criterio que `ItemCarrito`.

| Columna | Tipo MySQL | Nulo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | INT | NO | PK, AI | Identificador único. |
| `item_carrito_id` | INT | NO | FK → ItemCarrito.id, NN | Ítem del carrito al que pertenece el extra. |
| `extra_id` | INT | NO | FK → Extra.id, NN | Extra seleccionado. |
| `precio_unitario` | DECIMAL(10,2) | NO | NN | Precio congelado al agregarse al carrito. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | Momento en que el cliente agregó este extra al ítem del carrito. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (item_carrito_id)` | `INDEX (extra_id)`

**Reglas de negocio:**
- No lleva `fecha_modificacion` ni `fecha_baja`: si el cliente quita el extra, la fila se elimina físicamente; si cambia de opinión, se inserta como fila nueva.
- **Confirmado con Diego (2026-08-26):** el costo del extra en el carrito es `precio_unitario × ItemCarrito.cantidad` del ítem padre (mismo criterio que en el pedido, ver `DetallePedidoExtra`). Ejemplo: 2 hamburguesas con panceta extra ($500 c/u) = $1.000 de panceta en el subtotal del carrito.

---

### Tabla: Pedido

**Descripción:** Pedido generado por un cliente. Cubre el ciclo completo desde la creación (antes del pago) hasta la entrega. Contiene el snapshot de montos al momento de la transacción y los metadatos del ciclo de vida. Los timestamps de cada transición de estado se registran exclusivamente en `HistorialEstadoPedido`; esta tabla conserva únicamente el estado operacional actual y `fecha_creacion` (evento único, no repetible). El `id` del pedido se usa como `external_reference` en MercadoPago para correlacionar webhooks.

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
| `comentario_rechazo` | VARCHAR(500) | SÍ | NULL | — | Texto libre complementario al `motivo_rechazo`. Particularmente útil cuando `motivo_rechazo = OTRO`. |
| `subtotal` | DECIMAL(10,2) | NO | — | NN | Suma de todos los `DetallePedido.subtotal` al momento de confirmar el pedido. Valor congelado. |
| `cargo_servicio_cliente` | DECIMAL(10,2) | NO | — | NN | Cargo de servicio aplicado al cliente, congelado desde la `ConfiguracionTarifa` vigente al momento del pedido. |
| `cargo_servicio_comercio` | DECIMAL(10,2) | NO | — | NN | Comisión de plataforma del comercio, congelada desde la `ConfiguracionTarifa` vigente al momento del pedido. |
| `total` | DECIMAL(10,2) | NO | — | NN | Monto total cobrado al cliente: `subtotal + cargo_servicio_cliente`. Debe coincidir con `Pago.monto`. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación del pedido (previo al pago). Inmutable. |

> **Campos eliminados en v1.1:** `fecha_pago`, `fecha_aceptacion`, `fecha_listo`, `fecha_despacho`, `fecha_cancelacion`. Todos se derivan desde `HistorialEstadoPedido` con `SELECT fecha_hora FROM HistorialEstadoPedido WHERE pedido_id = ? AND estado = 'ESTADO_BUSCADO' ORDER BY fecha_hora DESC LIMIT 1`.

**Índices:** `PRIMARY KEY (id)` | `INDEX (cliente_id)` | `INDEX (comercio_id)` | `INDEX (estado)` | `INDEX (fecha_creacion)`

**Reglas de negocio:**
- `cancelado_por` y `fuente_entrega` son mutuamente excluyentes: en un pedido terminal solo puede estar poblado uno de los dos.
- Si llega un webhook de pago aprobado y el pedido ya está en `CANCELADO_POR_SISTEMA` (por timeout procesado primero), el sistema debe generar el reembolso inmediatamente.
- Los valores de `subtotal`, `cargo_servicio_cliente`, `cargo_servicio_comercio` y `total` son inmutables una vez registrados.
- Cada cambio de estado del pedido genera un INSERT en `HistorialEstadoPedido`, que es la fuente canónica de todos los timestamps del ciclo de vida.

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
| `estado` | ENUM EstadoDetallePedido | NO | `'ACTIVO'` | NN | Estado individual del ítem: permite cancelar/anular un ítem puntual sin afectar el resto del pedido. Agregado 2026-08-28. |
| `motivo_anulacion` | VARCHAR(255) | SÍ | NULL | — | Motivo de la anulación, texto libre. Se completa únicamente cuando `estado = ANULADO`. Agregado 2026-08-28. |
| `nota_credito_id` | INT | SÍ | NULL | FK → NotaCredito.id | Nota de crédito parcial asociada a la cancelación/anulación de este ítem. Se completa únicamente cuando `estado != ACTIVO`. Agregado 2026-08-28. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (pedido_id)` | `INDEX (nota_credito_id)`

**Reglas de negocio:**
- `nota_credito_id` solo debe completarse cuando `estado != ACTIVO`.
- Una vez `CANCELADO` o `ANULADO`, el estado de un ítem es terminal — sin transición de vuelta a `ACTIVO` ni entre `CANCELADO`/`ANULADO`.
- `motivo_anulacion` se completa únicamente cuando `estado = ANULADO`.
- **Fuera de alcance del tramo que introdujo estas columnas (2026-08-28, ver `docs/DECISIONES.md`):** ningún Service/Controller/endpoint implementa todavía la cancelación o anulación de un ítem puntual, ni la generación de la nota de crédito parcial asociada. Estas 3 reglas están documentadas acá, no como constraint de base de datos ni como validación de aplicación — quedan para el tramo que implemente esa lógica.

---

### Tabla: DetallePedidoExtra

**Descripción:** Snapshot inmutable de los extras seleccionados para cada ítem del pedido al momento de su confirmación. Mismo criterio que `DetallePedido`: no se edita.

| Columna | Tipo MySQL | Nulo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | INT | NO | PK, AI | Identificador único. |
| `detalle_pedido_id` | INT | NO | FK → DetallePedido.id, NN | Ítem del pedido al que pertenece el extra. |
| `extra_id` | INT | NO | FK → Extra.id, NN | Extra pedido. Referencia histórica. |
| `precio_unitario` | DECIMAL(10,2) | NO | NN | Precio congelado al momento de confirmar el pedido, mismo criterio que `DetallePedido.precio_unitario`. |
| `fecha_creacion` | DATETIME | NO | `NOW()` | Momento de confirmación del pedido (mismo instante para todas las filas de un mismo pedido). |

**Índices:** `PRIMARY KEY (id)` | `INDEX (detalle_pedido_id)` | `INDEX (extra_id)`

**Reglas de negocio:**
- No lleva `fecha_modificacion` ni `fecha_baja`: es un registro histórico inmutable, igual que `DetallePedido`.
- **Confirmado con Diego (2026-08-26):** el costo total de un extra en el pedido es `precio_unitario × DetallePedido.cantidad` del ítem padre — los extras no tienen cantidad propia, se multiplican por la cantidad del producto al que pertenecen. Ejemplo: 2 hamburguesas con panceta extra ($500 c/u) = $1.000 de panceta en el subtotal, no $500 fijo.

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

**Descripción:** Solicitud de reembolso al cliente. Se genera automáticamente ante eventos que implican devolución de dinero. Vinculada N:1 con `Pago` — desde 2026-08-28 (ver `docs/DECISIONES.md`) un mismo pago puede tener más de una nota de crédito asociada, una por cada cancelación/anulación parcial de ítems de su pedido (además del caso de reembolso total ya existente). El job periódico reintenta los reembolsos fallidos hasta un máximo de 5 intentos; al superarlos, emite la notificación T27 al Administrador.

| Columna | Tipo MySQL | Nulo | Default | Restricciones | Descripción |
|---------|-----------|------|---------|---------------|-------------|
| `id` | INT | NO | AI | PK, AI | Identificador único de la nota de crédito. |
| `pago_id` | INT | NO | — | FK → Pago.id, NN | Pago sobre el cual se realiza el reembolso. Ya **no** es UNIQUE desde 2026-08-28: un mismo pago puede tener varias notas de crédito (reembolso total, o una por cada cancelación/anulación parcial de ítems). |
| `monto` | DECIMAL(10,2) | NO | — | NN | Monto a reembolsar. Antes de 2026-08-28 siempre igual al `Pago.monto` (solo reembolso total); con la cancelación parcial de ítems puede ser un monto parcial, igual a la suma de los `DetallePedido.subtotal` cancelados/anulados en esa nota. |
| `estado` | ENUM EstadoNotaCredito | NO | `'PENDIENTE'` | NN | Estado del proceso de reembolso ante la API de MercadoPago. |
| `intentos` | INT | NO | `0` | NN | Contador de intentos de solicitud de reembolso realizados. Máximo: 5. Al alcanzarlo sin éxito, `estado → FALLIDO`. |
| `refund_id_mp` | VARCHAR(50) | SÍ | NULL | — | ID del reembolso en MercadoPago (`refund_id`). Se popula al confirmar el reembolso exitoso por la API. |
| `fecha_emision` | DATETIME | NO | `NOW()` | NN | Fecha y hora de creación de la nota de crédito (momento en que se origina la solicitud de reembolso). |
| `fecha_proceso` | DATETIME | SÍ | NULL | — | Fecha y hora en que el reembolso fue procesado exitosamente por MercadoPago. Se registra al pasar a `PROCESADO`. |
| `fecha_fallido` | DATETIME | SÍ | NULL | — | Fecha y hora en que se alcanzó el máximo de intentos fallidos. Se emite notificación T27 al Administrador en este momento. |

**Índices:** `PRIMARY KEY (id)` | `INDEX (pago_id)` | `INDEX (estado)`

**Reglas de negocio:**
- El job periódico procesa registros con `estado = PENDIENTE_REINTENTO`.
- Flujo de reintentos: `PENDIENTE → [primer fallo] → PENDIENTE_REINTENTO → [fallo hasta 5 intentos] → FALLIDO`.
- Al alcanzar 5 intentos: `estado = FALLIDO`, `fecha_fallido = NOW()`, notificación T27 al Administrador.
- El reembolso para `CANCELADO_POR_SISTEMA` se genera solo si `Pago.id_transaccion_mp` no es NULL (pago confirmado previamente).
- **Agregado 2026-08-28:** una `NotaCredito` puede corresponder a un reembolso total del pedido (sin ningún `DetallePedido` asociado, criterio anterior a esta fecha) o a un reembolso parcial originado por uno o más `DetallePedido.nota_credito_id` apuntando a ella (cancelación/anulación de ítems puntuales). Sin ningún Service/Controller que implemente esta segunda vía todavía — ver nota de alcance en `Tabla: DetallePedido` y en `docs/DECISIONES.md`.

---

## 10. Relaciones entre Tablas

| # | Tabla Origen | Campo FK | Tabla Destino | Tipo | Cardinalidad | Descripción |
|---|-------------|---------|--------------|------|-------------|-------------|
| 1 | `Localidad` | `provincia_id` | `Provincia` | N:1 | N localidades → 1 provincia | Cada localidad pertenece a una provincia. |
| 2 | `Persona` | `id` | `Usuario` | 1:1 | 1 persona = 1 usuario | Herencia por tabla compartida; PK idéntica. |
| 3 | `PersonaFisica` | `id` | `Persona` | 1:1 | 1 persona física = 1 persona | Subtipo concreto de Persona. |
| 4 | `PersonaJuridica` | `id` | `Persona` | 1:1 | 1 persona jurídica = 1 persona | Subtipo concreto de Persona. Mutuamente excluyente con PersonaFisica. |
| 5 | `Cliente` | `id` | `PersonaFisica` | 1:1 | 1 cliente = 1 persona física | Rol de negocio. Mutuamente excluyente con Administrador y Empleado. |
| 6 | `Administrador` | `id` | `PersonaFisica` | 1:1 | 1 administrador = 1 persona física | Rol de negocio. Mutuamente excluyente con Cliente y Empleado. |
| 7 | `Empleado` | `id` | `PersonaFisica` | 1:1 | 1 empleado = 1 persona física | Rol de negocio. Mutuamente excluyente con Cliente y Administrador. |
| 8 | `Dueno` | `id` | `PersonaJuridica` | 1:1 | 1 Dueno = 1 persona jurídica | Rol de negocio. Titular de uno o varios comercios. |
| 9 | `Comercio` | `dueno_id` | `Dueno` | N:1 | N comercios → 1 Dueno | Un mismo Dueno puede administrar varios comercios. |
| 10 | `Direccion` | `localidad_id` | `Localidad` | N:1 | N direcciones → 1 localidad | Ubicación geográfica de la dirección. |
| 11 | `Direccion` | `cliente_id` | `Cliente` | N:1 | N direcciones → 1 cliente | Direcciones de entrega registradas por el cliente. |
| 12 | `Direccion` | `comercio_id` | `Comercio` | 1:1 | 1 dirección ↔ 1 comercio | Dirección operativa única del comercio (UNIQUE). |
| 13 | `HistorialEstadoUsuario` | `usuario_id` | `Usuario` | N:1 | N registros → 1 usuario | Historial de transiciones de estado del usuario. |
| 14 | `Horario` | `comercio_id` | `Comercio` | N:1 | N horarios → 1 comercio | Franjas horarias de atención del comercio. |
| 15 | `RedSocial` | `comercio_id` | `Comercio` | N:1 | N links → 1 comercio | Links de contacto y redes sociales del comercio. |
| 16 | `Token` | `usuario_id` | `Usuario` | N:1 | N tokens → 1 usuario | Tokens de seguridad generados para el usuario. |
| 17 | `Sesion` | `usuario_id` | `Usuario` | N:1 | N sesiones → 1 usuario | Historial de sesiones del usuario. |
| 18 | `Notificacion` | `usuario_id` | `Usuario` | N:1 | N notificaciones → 1 usuario | Notificaciones emitidas al usuario. |
| 19 | `Soporte` | `usuario_id` | `Usuario` | N:1 | N mensajes → 1 usuario | Mensajes de soporte enviados por el usuario. |
| 20 | `Soporte` | `administrador_id` | `Administrador` | N:1 | N mensajes → 1 administrador | Administrador que atendió el mensaje. |
| 21 | `Reclamo` | `pedido_id` | `Pedido` | 1:1 | 1 reclamo ↔ 1 pedido | Un reclamo por pedido (UNIQUE). |
| 22 | `Reclamo` | `administrador_id` | `Administrador` | N:1 | N reclamos → 1 administrador | Administrador que resolvió el reclamo. |
| 23 | `HistorialEstadoComercio` | `comercio_id` | `Comercio` | N:1 | N registros → 1 comercio | Historial de transiciones de estado del comercio. |
| 24 | `HistorialEstadoComercio` | `administrador_id` | `Administrador` | N:1 | N registros → 1 administrador | Administrador que ejecutó la transición (NULL si fue el sistema). |
| 25 | `ConfiguracionTarifa` | `administrador_id` | `Administrador` | N:1 | N configs → 1 administrador | Configuraciones de tarifa registradas por el admin. |
| 26 | `CuentaMercadoPago` | `dueno_id` | `Dueno` | 1:1 | 1 cuenta ↔ 1 Dueno | Credenciales OAuth MP del Dueno, compartidas por todos sus comercios (UNIQUE). |
| 27 | `EmpleadoComercio` | `empleado_id` | `Empleado` | N:1 | N relaciones → 1 empleado | Comercios donde opera el empleado. |
| 28 | `EmpleadoComercio` | `comercio_id` | `Comercio` | N:1 | N relaciones → 1 comercio | Empleados que operan el comercio. |
| 29 | `Producto` | `comercio_id` | `Comercio` | N:1 | N productos → 1 comercio | Catálogo de productos del comercio. |
| 30 | `Producto` | `categoria_id` | `Categoria` | N:1 | N productos → 1 categoría | Clasificación del producto. |
| 31 | `ImagenProducto` | `producto_id` | `Producto` | N:1 | N imágenes → 1 producto | Galería de imágenes del producto (máx. 5). |
| 32 | `ProductoTag` | `producto_id` | `Producto` | N:1 | N registros → 1 producto | Unión M:N: tags de un producto. |
| 33 | `ProductoTag` | `tag_id` | `Tag` | N:1 | N registros → 1 tag | Unión M:N: productos con un tag dado. |
| 34 | `GrupoExtra` | `comercio_id` | `Comercio` | N:1 | N grupos → 1 comercio | Grupos de extras configurados por el comercio. |
| 35 | `Extra` | `grupo_extra_id` | `GrupoExtra` | N:1 | N extras → 1 grupo | Opciones individuales dentro de un grupo. |
| 36 | `ProductoGrupoExtra` | `producto_id` | `Producto` | N:1 | N registros → 1 producto | Unión M:N: grupos de extras de un producto. |
| 37 | `ProductoGrupoExtra` | `grupo_extra_id` | `GrupoExtra` | N:1 | N registros → 1 grupo | Unión M:N: productos que ofrecen un grupo dado. |
| 38 | `Carrito` | `cliente_id` | `Cliente` | 1:1 | 1 carrito ↔ 1 cliente | Carrito persistente y único por cliente (UNIQUE). |
| 39 | `Carrito` | `comercio_id` | `Comercio` | N:1 | N carritos → 1 comercio | Comercio activo en el carrito del cliente. |
| 40 | `ItemCarrito` | `carrito_id` | `Carrito` | N:1 | N ítems → 1 carrito | Contenido del carrito. |
| 41 | `ItemCarrito` | `producto_id` | `Producto` | N:1 | N ítems → 1 producto | Producto incluido en el ítem del carrito. |
| 42 | `ItemCarritoExtra` | `item_carrito_id` | `ItemCarrito` | N:1 | N extras → 1 ítem | Extras seleccionados para un ítem del carrito. |
| 43 | `ItemCarritoExtra` | `extra_id` | `Extra` | N:1 | N registros → 1 extra | Extra elegido en el carrito. |
| 44 | `Pedido` | `cliente_id` | `Cliente` | N:1 | N pedidos → 1 cliente | Pedidos realizados por el cliente. |
| 45 | `Pedido` | `comercio_id` | `Comercio` | N:1 | N pedidos → 1 comercio | Pedidos recibidos por el comercio. |
| 46 | `Pedido` | `direccion_id` | `Direccion` | N:1 | N pedidos → 1 dirección | Dirección de entrega (solo `DOMICILIO`). |
| 47 | `DetallePedido` | `pedido_id` | `Pedido` | N:1 | N detalles → 1 pedido | Ítems snapshooteados al confirmar el pedido. |
| 48 | `DetallePedido` | `producto_id` | `Producto` | N:1 | N detalles → 1 producto | Referencia histórica al producto detallado. |
| 49 | `DetallePedidoExtra` | `detalle_pedido_id` | `DetallePedido` | N:1 | N extras → 1 detalle | Extras snapshooteados de un ítem del pedido. |
| 50 | `DetallePedidoExtra` | `extra_id` | `Extra` | N:1 | N registros → 1 extra | Referencia histórica al extra pedido. |
| 51 | `HistorialEstadoPedido` | `pedido_id` | `Pedido` | N:1 | N registros → 1 pedido | Trazabilidad de transiciones de estado. |
| 52 | `Pago` | `pedido_id` | `Pedido` | 1:1 | 1 pago ↔ 1 pedido | Pago asociado al pedido (UNIQUE). |
| 53 | `NotaCredito` | `pago_id` | `Pago` | N:1 | N notas → 1 pago | Solicitud(es) de reembolso asociadas al pago. Pasó de 1:1 a N:1 el 2026-08-28 (ya no UNIQUE) para permitir una nota de crédito parcial por cada cancelación/anulación de ítems, además de la nota de reembolso total. |
| 54 | `Dueno` | `persona_fisica_id` | `PersonaFisica` | 1:1 | 1 Dueno = 1 persona física | Titular legal del negocio, misma persona física que ya está asociada al mismo Usuario/Persona (UNIQUE). |
| 55 | `DetallePedido` | `nota_credito_id` | `NotaCredito` | N:1 | N ítems → 1 nota de crédito | Nota de crédito parcial asociada a la cancelación/anulación de este ítem puntual. Agregada 2026-08-28; NULL mientras `estado = ACTIVO`. |

---

## 11. Restricciones UNIQUE — Resumen

| Tabla | Campo(s) | Descripción |
|-------|----------|-------------|
| `Usuario` | `email` | Email único en toda la plataforma. |
| `PersonaFisica` | `dni` | DNI único en toda la plataforma. |
| `PersonaJuridica` | `cuit` | CUIT único en toda la plataforma. |
| `Direccion` | `comercio_id` | Un comercio tiene exactamente una dirección. |
| `Token` | `token` | Valor de token irrepetible (UUID v4 en el diseño original; código numérico de 6 dígitos en el MVP desde el Tramo 16.12 para los tipos existentes en ese momento — ver `docs/modelo-mvp.md`). |
| `CuentaMercadoPago` | `dueno_id` | Un Dueno tiene como máximo una cuenta MP, compartida por todos sus comercios. |
| `RedSocial` | `(comercio_id, tipo)` | Un comercio no puede tener dos links activos del mismo tipo (validado a nivel aplicación, solo filas activas). |
| `EmpleadoComercio` | `(empleado_id, comercio_id)` | Un empleado no puede tener más de una relación con el mismo comercio. |
| `Categoria` | `nombre` | Nombre de categoría único. |
| `Tag` | `nombre` | Nombre de tag único. |
| `Carrito` | `cliente_id` | Un cliente tiene exactamente un carrito. |
| `Reclamo` | `pedido_id` | Máximo un reclamo por pedido. |
| `Pago` | `pedido_id` | Exactamente un pago por pedido. |
| `ProductoTag` | `(producto_id, tag_id)` | PK compuesta; evita tags duplicados por producto. |
| `ProductoGrupoExtra` | `(producto_id, grupo_extra_id)` | PK compuesta; evita grupos de extras duplicados por producto. |
| `Dueno` | `persona_fisica_id` | Un Dueno tiene como máximo una `PersonaFisica` titular; cada `PersonaFisica` puede estar asociada a lo sumo un `Dueno`. |

---

## 12. Reglas de Negocio Transversales

### Ciclo de vida del usuario y propagación al comercio

> Aplica específicamente al rol Dueno: sus cambios de estado propagan a TODOS los comercios que administra. Los cambios de estado de un Empleado no propagan ningún efecto sobre los comercios donde opera — solo afectan su propio acceso (login/sesión).

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
- Si el ítem tiene extras seleccionados, el costo de los extras se suma al subtotal del ítem: `SUM(DetallePedidoExtra.precio_unitario) × DetallePedido.cantidad` — cada extra se multiplica por la cantidad del producto padre (criterio confirmado, ver tabla `DetallePedidoExtra`).
- `Pedido.subtotal` = suma de todos los `DetallePedido.subtotal` del pedido (incluyendo extras). Calculado al crear.
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

*Diccionario de Datos — Proyecto Bajoneá — Versión 1.5*
