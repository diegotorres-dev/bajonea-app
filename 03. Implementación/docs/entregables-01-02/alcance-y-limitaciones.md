# Alcance y Limitaciones

## Alcance del Proyecto

### Cobertura geográfica
El sistema está diseñado para operar en la ciudad de Río Grande, Tierra del Fuego. La
expansión a otros municipios de la provincia queda fuera del alcance de esta versión.

El modelo de datos de direcciones (catálogo de Provincias y Localidades, basado en la
API Georef de datos.gob.ar) cubre la totalidad del territorio nacional, previendo una
eventual expansión a futuro. Esto no implica una ampliación de la cobertura operativa:
comercios, pedidos y envíos continúan limitados a Río Grande en esta versión.

### Plataforma
La aplicación es una plataforma web responsiva, accesible desde escritorio y dispositivos
móviles. No se contempla el desarrollo de aplicaciones nativas para iOS o Android.

### Tipos de comercio
El sistema clasifica a los comercios según su rubro gastronómico mediante el campo
`tipo_comercio`, que admite los siguientes valores: Restaurante, Emprendimiento,
Rotisería, Heladería, Cafetería, Panadería, Pizzería, Parrilla, Bar, Kiosco, Food Truck
y Otro. Esta clasificación es informativa y visual; todos los tipos de comercio tienen
las mismas funcionalidades dentro de la plataforma. Queda registrado como criterio para
una eventual futura versión que permita filtrar el catálogo público por este campo;
dicho filtro no se implementa en esta versión.

### Usuarios contemplados
El sistema gestiona cuatro roles: Cliente, Dueño, Empleado y Administrador.

- **Dueño:** titular de uno o varios comercios. Se registra completando sus datos
  fiscales (persona jurídica) junto con los datos de su primer comercio; desde su panel
  puede dar de alta comercios adicionales sin volver a cargar esos datos fiscales. Cada
  comercio que administra queda habilitado de forma individual tras la aprobación del
  Administrador. La cuenta de MercadoPago se vincula una única vez a nivel Dueño y
  habilita el cobro en todos los comercios aprobados de ese Dueño.
- **Empleado:** persona invitada por un Dueño para operar el día a día de uno o varios
  comercios (productos, pedidos, apertura y cierre, datos y foto del comercio), sin acceso
  a los datos fiscales, a MercadoPago, a las redes sociales ni a la gestión del equipo. Un
  mismo Empleado puede operar comercios de Dueños distintos sin restricción. Entra solo por
  invitación (no existe un registro propio de Empleado) y la invitación es por comercio.
  *Planificado: se implementa en los tramos E1 a E4 (ver `docs/DECISIONES.md`, 2026-10-05).*
- **Combinaciones de roles (regla de negocio):** un Administrador es Administrador o
  Cliente; un Dueño es Dueño o Cliente; un Empleado es Empleado o Cliente. Un Cliente
  puede sumar el rol Empleado por invitación (por ejemplo, alguien que pide comida como
  Cliente y también trabaja operando el panel de un comercio). Un Dueño no puede ser
  Empleado de otro local y un Administrador no puede ser Empleado ni Dueño. **Alcance:**
  solo se construye y se hace cumplir "Empleado + Cliente" y que un Empleado nunca sea
  Dueño ni Administrador; "Dueño + Cliente" y "Administrador + Cliente" quedan como regla
  escrita sin mecanismo (ver Limitaciones Conocidas de Implementación).
- **Contexto de operación:** no existe multirol físico. Una sola columna de rol por usuario
  y un solo rol en el token de sesión; quien es Cliente y Empleado entra con su login y, si
  tiene más de un contexto (Cliente y uno o más comercios), el sistema recuerda el último
  que eligió y entra directo, o presenta un selector la primera vez o cuando el último ya
  no es válido. Se puede cambiar de contexto desde el perfil sin cerrar sesión, y el
  selector reutiliza la franja de selección de comercio del Dueño.

### Acceso público
La visualización de comercios y menús es pública y no requiere registro. El catálogo
muestra los comercios que cumplen las siguientes condiciones:
- Estado **Apto para Venta** (Aprobado, con la cuenta de MercadoPago de su Dueño vinculada) y
  `cerrado_manualmente = false`: aparecen como disponibles si están dentro de su
  horario de atención.
- Estado **Apto para Venta** con `cerrado_manualmente = true` (cierre manual del comercio,
  que solo se puede activar y desactivar dentro de su horario de atención y se apaga solo
  al empezar la próxima franja): aparecen en el catálogo con indicador visual de
  "temporalmente cerrado", sin posibilidad de recibir pedidos.
- Estado **Cerrado Temporalmente** (Dueño con cuenta bloqueada; solo pasan a este estado
  los comercios que estaban en Apto para Venta): aparecen en el catálogo con indicador
  visual de "temporalmente cerrado" y sin hora de reapertura, sin posibilidad de recibir
  pedidos.

Los comercios en estado Pendiente, Rechazado, Suspendido o Inactivo no aparecen en
el catálogo. Para realizar pedidos, el usuario debe contar con una cuenta activa y
verificada.

Un comercio puede recibir pedidos únicamente si se cumplen en simultáneo todas las
siguientes condiciones:
- `Comercio.estado == APTO_VENTA` (Aprobado, con la cuenta de MercadoPago del Dueño titular vinculada)
- `Dueño.usuario.estado == ACTIVO`
- El horario de consulta está dentro de las franjas horarias del comercio.
- `Comercio.cerrado_manualmente == false`

### Gestión de direcciones
- **Clientes:** pueden registrar una o más direcciones de entrega. La primera se
  registra de forma obligatoria al crear la cuenta y queda como dirección principal.
  Desde el perfil pueden agregar, editar, eliminar y cambiar la principal en cualquier
  momento.
- **Comercios:** tienen una única dirección operativa, registrada al momento del alta.
- Cada dirección se asocia a una Localidad (y por extensión a una Provincia) mediante
  un selector que cubre todo el país, alimentado por un catálogo precargado desde la
  API Georef (datos.gob.ar).

### Pagos
El sistema integra MercadoPago como único medio de pago bajo el modelo Marketplace
con split de pagos. El flujo de pago funciona de la siguiente manera:

1. El pedido se crea en estado **Pendiente de Pago** y el cliente es redirigido a MP.
2. La confirmación llega de forma asíncrona vía **webhook de MercadoPago**. Solo
   al recibir esta confirmación el pedido avanza al estado **Pendiente de Confirmación** (esperando
   al comercio) y el carrito se limpia.
3. Si el pago no se confirma en 30 minutos, el pedido expira automáticamente
   sin generar reembolso (no hubo cobro). Un pago rechazado no cancela el pedido: el
   cliente puede reintentar hasta que se apruebe un pago o venza el plazo, y el link de
   pago vence junto con el pedido.
4. Si el comercio no responde al pedido en 30 minutos desde la confirmación del pago,
   el pedido pasa a estado **Expirado** y se genera el reembolso completo al cliente.

Cada transacción aplica automáticamente las tarifas de servicio configuradas por el
Administrador: un cargo al cliente sumado al subtotal y un cargo al comercio
descontado de su cobro mediante split automático. Las transacciones en efectivo
u otros métodos externos quedan fuera del alcance del sistema.

### Personalización de Productos (Extras)
Un producto puede ofrecer uno o más grupos de extras opcionales (por ejemplo,
"Agregados" o "Elegí tu salsa"), cada grupo con un máximo de opciones seleccionables y
la posibilidad de ser obligatorio. El cliente elige sus extras al agregar el producto
al carrito; el precio de cada extra elegido se suma al precio del producto.

### Notificaciones
Las notificaciones de estado (cambios de pedido, aprobaciones, rechazos, reclamos) se
gestionan mediante notificaciones push dentro de la plataforma.

El email se utiliza en los siguientes flujos:
- Verificación de cuenta (al registrarse)
- Recuperación de contraseña
- Reactivación de cuenta (usuario inactivo)
- Aviso de inactivación automática (al pasar a estado Inactivo)
- Aviso de suspensión (en casos de notificación crítica al comercio o cliente)
- Aviso de suspensión levantada (cuando el administrador reactiva una cuenta suspendida)
- Aviso de sesión cerrada en otro dispositivo (seguridad)
- Cancelación de pedido por suspensión del comercio (notificación a clientes afectados)
- Invitación a operar un comercio como Empleado (al email de la persona invitada, con un código de 6 dígitos que vence a los 7 días) y aviso de regularización cuando se intenta invitar a una cuenta bloqueada, suspendida, inactiva o sin verificar

### Gestión de pedidos
El sistema contempla retiro en el local y envío a domicilio, con la posibilidad de
que un comercio ofrezca una o ambas modalidades. Un cliente puede tener múltiples
pedidos activos simultáneamente, siempre que cada pedido pertenezca a un único
comercio diferente.

El comercio puede cerrar su local manualmente en cualquier momento desde su panel,
independientemente del horario configurado. Esta acción no modifica el estado del
comercio ni del usuario; solo detiene la recepción de nuevos pedidos hasta que el
comercio vuelva a abrirse manualmente.

Los pedidos atraviesan los siguientes estados a lo largo de su ciclo de vida:

| Estado | Descripción |
|--------|-------------|
| Pendiente de Pago | Pedido creado, esperando confirmación de pago por MP |
| Pendiente de Confirmación | Pago confirmado, esperando respuesta del comercio (1 h de margen) |
| En Preparación | Pedido aceptado por el comercio |
| En Camino | Pedido despachado (solo domicilio) |
| Listo para Retirar | Pedido listo para ser retirado (solo retiro) |
| Entregado | Pedido completado |
| Rechazado | Comercio rechazó el pedido en estado Pendiente de Confirmación. Genera reembolso |
| Cancelado | Cliente canceló antes del despacho o de que estuviera listo. Genera reembolso |
| Anulado | Comercio anuló desde En Preparación. Genera reembolso |
| Cancelado por Sistema | Cancelación automática (suspensión del comercio, pago no confirmado o rechazado al vencer el plazo). Genera reembolso si hubo cobro |
| Expirado | Comercio no respondió en 30 minutos. Genera reembolso automático |

---

## Limitaciones

- **Sin rol de repartidor:** No se incluye un módulo de gestión de repartidores. El
  seguimiento del envío es manual y responsabilidad del comercio.

- **Sin niveles de permiso entre Empleados:** todo Empleado en estado Activo dentro de
  un comercio (relación EmpleadoComercio) cuenta con el mismo conjunto de permisos
  operativos (gestión de productos y pedidos). No existen sub-roles ni permisos
  diferenciados entre empleados de un mismo comercio. No hay tope de empleados por
  comercio.

- **Sin cálculo de costo de envío:** La plataforma no gestiona ni calcula tarifas de
  envío en esta versión.

- **Un solo comercio por pedido:** Un pedido individual no puede combinar productos de
  distintos comercios. Sin embargo, un cliente puede tener varios pedidos activos
  simultáneos, cada uno de un comercio diferente.

- **Cobertura geográfica limitada:** El sistema no contempla operaciones fuera de
  Río Grande en esta versión, si bien el modelo de direcciones admite localidades de
  todo el país de cara a una futura expansión.

- **Sin app móvil nativa:** La experiencia mobile se resuelve mediante diseño responsivo;
  no se desarrollan apps para iOS ni Android.

- **Sin integración con redes sociales:** No se contempla login social ni sincronización
  automática con plataformas externas como Instagram o WhatsApp. Esto no incluye la
  publicación de enlaces de contacto a las redes del comercio (Instagram, Facebook,
  TikTok, WhatsApp, X, sitio web u otro), que el comercio carga y edita
  manualmente como dato de contacto — ver Requisitos Funcionales del Comercio.

- **Pedidos en camino durante suspensión:** Si un comercio es suspendido mientras tiene
  pedidos en estado En Camino, esos pedidos se completan automáticamente como entregados.
  No se generan reembolsos en ese caso, ya que el envío ya estaba en curso.

- **Timer de retiro durante suspensión:** Si un comercio es suspendido y tiene pedidos
  en estado Listo para Retirar, el cliente dispone de 90 minutos para presentarse. Si
  no lo hace, el pedido se cierra automáticamente sin reembolso.

---

## Limitaciones Conocidas de Implementación

Diferencias entre lo especificado en este documento y en los Requisitos Funcionales, y lo implementado al 2026-09-25. Son funcionalidades especificadas y todavía no implementadas, no cambios de alcance.

**Pagos y reembolsos**
- **Nota de crédito y reembolso:** la entidad `NotaCredito` existe, pero el flujo de reembolso no. Los estados que la especificación marca "con reembolso" (rechazo, cancelación, anulación, expiración por falta de respuesta y cancelación por suspensión) hoy cambian el estado del pedido sin devolver el dinero; el código lo deja marcado con un TODO en `PedidoService`.
- **Pago tardío y pago duplicado:** un pago aprobado sobre un pedido ya cancelado, o un segundo pago aprobado sobre un pedido ya pagado, solo generan una alerta registrada en base de datos (`alerta_webhook_mp`). No se devuelve el dinero y la consulta de las alertas por pantalla no existe.
- **Cancelación y anulación con devolución de dinero** y **reembolso parcial por ítem:** sin implementar.
- **Pago en revisión:** mientras un pago está `pending` o `in_process` no se puede reintentar el pago hasta que se resuelva o venza el pedido. Es un comportamiento intencional.

**Integración con MercadoPago**
- **Verificación del split:** solo deja rastro. Si `fee_details` no trae la comisión de marketplace esperada o su monto no coincide, se registra una alerta `SPLIT_NO_APLICADO` en `alerta_webhook_mp` y no se hace nada más (no se bloquea ni se revierte el pago). La consulta de las alertas por pantalla no existe.
- **Cuenta de prueba:** que una cuenta vinculada quede marcada como de prueba (`es_cuenta_prueba`) depende de la variable de entorno `MERCADOPAGO_TEST_TOKEN` al momento de vincular, no de inspeccionar la cuenta real. Si el backend arranca sin ella, una cuenta de prueba queda marcada como de producción; el backend lo advierte con un WARN al arrancar.
- **Etiqueta del cargo al comercio:** el detalle de pedido del comercio muestra "Cargo por servicio (1%)" con el porcentaje fijo en la pantalla, aunque la tarifa es configurable por el Administrador; el monto sí es el real del pedido.
- **Renovación de tokens:** no existe refresh. El token de acceso de la cuenta vinculada vence a los ~6 meses.
- **Desvinculación de la cuenta (multi-comercio, tramo 5):** los tokens guardados no se borran, solo la cuenta pasa a inactiva. La desvinculación se rechaza mientras algún comercio del Dueño tenga pedidos en `PENDIENTE_PAGO`, así que puede demorar hasta 30 minutos (el vencimiento del pedido más reciente, con el job de vencimiento corriendo cada 60 segundos); con tráfico alto un cliente podría mantener el bloqueo de forma continua,; el cierre manual del comercio (botón "Cerrar comercio") frena los pedidos nuevos y evita ese bloqueo continuo, aunque los pagos ya iniciados siguen su curso hasta vencer. Plan B si molesta en el uso real: desvincular igual y seguir verificando solo los pagos de pedidos ya existentes con los tokens guardados, aunque la cuenta esté inactiva. Los pedidos en curso que quedan al desvincular (`PENDIENTE_CONFIRMACION_COMERCIO`, `EN_PREPARACION`, `EN_CAMINO`, `LISTO_PARA_RETIRAR`) siguen su flujo, y un reembolso posterior nace `PENDIENTE_REVISION_MANUAL`. La hora para reintentar es aproximada y se calcula en la zona horaria de la JVM, como el resto de las fechas.
- **Una cuenta por Dueño y una cuenta en un solo Dueño:** si dos Dueños intentan vincular la misma cuenta a la vez, uno gana y el otro recibe el error de cuenta en uso (lo garantiza un índice único en la base). Dos primeras vinculaciones simultáneas del mismo Dueño pueden dar un error genérico de dato duplicado en una de las dos (comportamiento anterior a este tramo).
- **Verificación del monto:** el webhook y la sincronización no verifican que el monto pagado coincida con el total del pedido.
- **Firma del webhook:** se valida solo si el secreto `MERCADOPAGO_WEBHOOK_SECRET` está configurado; sin él se omite y se registra una advertencia.
- **Identificador de pedido no numérico en el webhook:** responde con un error 500.
- **Loggers dedicados de MercadoPago** (`webhook.mercadopago`, `jobs.*`, `audit`): no existen; se usa el logger estándar de cada clase.

**Pedidos y comercios**
- **EN_CAMINO al suspender un comercio:** no está implementado. Al suspender, los pedidos en PENDIENTE_CONFIRMACION_COMERCIO y EN_PREPARACION se cancelan y los LISTO_PARA_RETIRAR inician el timer de 90 minutos, pero los EN_CAMINO no se modifican: siguen su curso normal (confirmación del cliente o autoconfirmación a los 90 minutos).
- **Cierre manual y franjas partidas:** las franjas horarias que cruzan la medianoche se cargan como dos filas del día y no se unen, y un día con horario partido tiene dos filas. La reapertura automática del cierre manual ocurre al empezar la primera franja posterior al momento del cierre, así que un cierre hecho en el primer tramo de un horario partido (o antes de la medianoche en una franja que sigue pasada la medianoche) se reabre al empezar el segundo tramo. Una franja que cierra a las 23:59 se interpreta como fin del día. Un comercio sin franjas cargadas no se reabre solo. No hay pantalla para consultar el historial de cierres (`HistorialCierreComercio`) y los cierres no generan notificaciones.
- **Bloqueo del Dueño y catálogo (tramo C2):** el catálogo público lista los comercios en `APTO_VENTA` y en `CERRADO_TEMPORALMENTE`; estos últimos aparecen con el indicador "Cerrado temporalmente", sin hora de reapertura y sin poder recibir pedidos (agregar al carrito y confirmar el pedido responden `409` "Este comercio está cerrado en este momento"). El campo `estado` del catálogo público informa siempre `APTO_VENTA`, para no revelar que el Dueño está bloqueado; lo que ve el público es `estadoApertura`. Al bloquearse la cuenta de un Dueño (tres intentos fallidos) solo sus comercios `APTO_VENTA` pasan a `CERRADO_TEMPORALMENTE`: un `APROBADO` (sin cuenta de cobro, que no está en el catálogo ni recibe pedidos) y cualquier otro estado no se tocan. Comportamiento conocido: (a) los pedidos en curso de un Dueño bloqueado no se modifican: el Dueño no puede iniciar sesión para atenderlos y los vencimientos automáticos (pago, respuesta del comercio, retiro) siguen su camino; (b) un cierre manual hecho antes del bloqueo no se borra y sigue vigente al desbloquear, pero la reapertura automática puede apagarlo mientras la cuenta sigue bloqueada (el estado `CERRADO_TEMPORALMENTE` es el que manda); (c) con la cuenta del Dueño bloqueada ningún comercio queda a la venta: si el Administrador aprueba un comercio pendiente del Dueño con la cuenta de MercadoPago vinculada, o llega la vinculación de MercadoPago sobre un comercio aprobado, el comercio queda en `CERRADO_TEMPORALMENTE` (con una fila de historial automática "Bloqueo de cuenta vigente al aprobar" o "... al vincular Mercado Pago") y pasa a vender al desbloquear la cuenta; un comercio que no llegaría a `APTO_VENTA` (por ejemplo un `APROBADO` sin cuenta de cobro) no cambia; (d) la restauración al recuperar la contraseña depende de la cuenta de MercadoPago activa en ese momento (si se desvinculó mientras estaba bloqueado, vuelve a `APROBADO`); (e) ninguna pantalla ni notificación avisa del bloqueo a los clientes ni al Administrador; (f) la suspensión de un comercio por el Administrador puede cruzarse con el tercer intento fallido de login del mismo Dueño: ambas transacciones pueden esperarse mutuamente y el motor revierte una (la ventana es de milisegundos y nunca apareció en las pruebas de estrés, pero no está cubierta como el resto de los cruces).
- **Historial de estados del comercio (`HistorialEstadoComercio`):** se escribe al aprobar, rechazar (incluido el rechazo definitivo) y suspender un comercio (Administrador), en las transiciones automáticas `APROBADO ↔ APTO_VENTA` al vincular o desvincular MercadoPago, en la propagación de bloqueo (solo los `APTO_VENTA`, a `CERRADO_TEMPORALMENTE`) y su restauración (recuperación de contraseña y reactivación de cuenta) y en la re-solicitud del Dueño (`RECHAZADO → PENDIENTE`). No registra la inactivación automática por inactividad (no implementada).
- **Corrección y re-solicitud de comercios rechazados (backend y pantallas implementados):** el Dueño puede corregir el mismo comercio y volver a solicitarlo (hasta 3 veces; la tercera rechazada o un rechazo pedido como definitivo lo deja en `RECHAZO_DEFINITIVO`). Limitaciones conocidas: (a) la pantalla de corrección se abre sola desde la pantalla de rechazo cuando el comercio rechazado es el único del Dueño; para un comercio rechazado que no es el que muestra el panel (un adicional) solo se abre por dirección directa (`comercio-corregir.html?id=…`) hasta el selector de comercios del tramo 4; (b) no hay una pantalla del Administrador que liste los comercios rechazados ni los de rechazo definitivo; (c) el backend no bloquea por estado las operaciones de un comercio rechazado o en rechazo definitivo (productos, pedidos y perfil siguen sin guarda de estado); (d) no se envían emails por estos cambios; (e) la notificación de rechazo no enlaza a la corrección (depende del selector de comercio del tramo 4); (f) el botón de contacto con soporte queda oculto hasta que exista el módulo de soporte; (g) reabrir un rechazo definitivo es una operación manual sobre la base (ver `docs/DECISIONES.md`).
- **Levantar la suspensión de un comercio:** no está implementado (no existe el endpoint ni el método de servicio), por lo que tampoco se registra esa transición.
- **Empleado (planificado, tramos E1 a E4):** hoy no existe ningún código del rol: ni invitaciones, ni selector de contexto, ni permisos delegados. Las tablas `Empleado` y `EmpleadoComercio` existen sin uso y las estructuras nuevas (`InvitacionEmpleado`, `HistorialEmpleadoComercio`, `ActividadComercio`, migraciones `V29` a `V32`) todavía no se crearon. Limitaciones conocidas del diseño decidido:
  - **Sin multirol físico:** `Usuario.rol` es una sola columna y el token lleva un solo rol. Solo se hace cumplir "Empleado + Cliente" y que un Empleado nunca sea Dueño ni Administrador. "Dueño + Cliente" y "Administrador + Cliente" son regla escrita sin mecanismo: ni el Dueño ni el Administrador tienen fila de Cliente y las rutas de Cliente exigen el rol Cliente.
  - **Un Cliente existente no puede pasar a Dueño:** registrar un comercio con un email o un DNI ya existentes responde conflicto (409) y no se construye en este bloque.
  - **Quien fue Empleado no puede registrar un comercio** con esa cuenta, aunque su relación esté inactiva. Los casos raros los resuelve el equipo del proyecto por soporte.
  - **Los intentos del código de invitación pueden ser gastados por terceros:** quien conozca el email de un invitado puede agotar los 5 intentos de una invitación; el Dueño la reenvía. No hay control por IP.
  - **Sesión única en ambos contextos:** iniciar sesión en otro dispositivo cierra la sesión del Cliente y del Empleado a la vez (es una sola sesión).
  - **Alta por invitación con dirección:** una cuenta nueva creada por invitación pide la dirección porque el Cliente no puede pedir con entrega a domicilio sin ella y todavía no existe una pantalla para gestionar direcciones.
  - **Pedido autoconfirmado (T30):** el aviso al Dueño y a los Empleados por un pedido autoconfirmado hoy no se emite a nadie; se programa como último ítem del tramo E3 y puede quedar fuera sin afectar el resto.
  - **Horarios y extras sin endpoint:** la edición de horarios de un comercio ya cargado y la gestión de extras y grupos de extras todavía no tienen endpoint, por lo que la delegación al Empleado se habilitará cuando existan.
  - **Guard de comercio no operativo solo para el Empleado:** el servidor responde conflicto (409) a las escrituras del Empleado sobre un comercio suspendido o cerrado temporalmente (salvo terminar entregas en marcha); aplicar el mismo guard al Dueño queda para el tramo de suspensión.
  - **Suspensión de comercio rediseñada en un tramo aparte** (fuera de este bloque): levantar la suspensión, qué pasa con los pedidos En Camino, el guard de estado para el Dueño y los reembolsos pendientes del ticket de MercadoPago WCS-52639.
  - **Invitaciones vencidas sin job:** la invitación pendiente con más de 7 días se muestra como Vencida al consultarla; no hay un proceso automático.
  - **Invitación invalidada:** al quinto intento fallido la invitación se muestra al Dueño como "Código bloqueado", con el botón "Reenviar". El invitado que ingresa un código incorrecto recibe siempre la misma respuesta (401), sin intentos restantes.
  - **Aceptar según el estado del comercio:** se puede aceptar con el comercio Aprobado, Apto para Venta, Cerrado Temporalmente o Suspendido, y no con el comercio Pendiente, Rechazado, con Rechazo Definitivo o Inactivo; invitar exige Aprobado o Apto para Venta.
  - **"Ver equipo" sin actividad en E1:** la tabla de actividad (`V32`) se aplica en el tramo E3, así que "Ver equipo" del tramo E1 no tiene pestaña Actividad.
  - **Email de regularización:** nombra solo al comercio, nunca al Dueño.
  - **IP real detrás del proxy (lista de despliegue):** sin configurar la estrategia de cabeceras reenviadas (`server.forward-headers-strategy`) en producción, el servidor ve la IP del proxy y todos los clientes comparten el mismo contador del límite por IP (también `Sesion.ip_origen`). Queda en la lista de despliegue; hay que verificarlo en el entorno de producción antes de contar con ese límite.
- **Términos y Condiciones en el registro de Cliente:** el servidor exige el campo `aceptaTerminos` en `true` (si falta o es falso responde 400), pero la aceptación no se guarda: no hay fecha, versión, trazabilidad ni página de Términos, y no se planea agregarlos (decisión de Diego, no es un requisito del proyecto). El hecho de estar registrado da por aceptados los términos. Lo mismo vale para el alta por invitación del Empleado.
  - **Aviso de regularización:** un invitado cuya cuenta no es apta no ve la invitación y debe pedir que se la reenvíen cuando regularice su cuenta.
- **Login y registro por nombre de usuario:** implementados para Cliente y Dueño (el login es exclusivamente por nombre de usuario; el email queda para verificación, recuperación y reactivación de cuenta). Limitaciones conocidas:
  - El login revela si una cuenta existe pero está en un estado distinto de activo (pendiente, bloqueada, inactiva o suspendida) antes de pedir la contraseña. Es comportamiento heredado y una decisión consciente de no cambiarlo.
  - El aviso de "intentos restantes" ante una contraseña incorrecta también revela que el usuario existe, por el mismo criterio.
  - El endpoint público de disponibilidad de nombre de usuario no tiene límite de consultas (rate limit).
  - Dueño y Administrador no ven su nombre de usuario en ninguna pantalla (no tienen pantalla de datos personales) y no pueden cambiarlo; solo el Cliente puede cambiarlo, desde su perfil.
  - El Empleado no tiene un alta propia: al aceptar una invitación con una cuenta nueva define su nombre de usuario con los mismos datos del registro de Cliente (planificado, tramo E1); con una cuenta existente conserva el suyo.
- **Zona horaria:** las fechas y el "hoy" del panel del comercio dependen de la zona horaria de la JVM del servidor (en local, -03:00). La verificación de horario de atención usa -03:00 fijo.
