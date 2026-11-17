# Alcance y Limitaciones

## Alcance del Proyecto

### Cobertura geográfica
El sistema opera en Tierra del Fuego, en tres localidades habilitadas: Río Grande,
Ushuaia y Tolhuin. Al registrarse, un Cliente, un Dueño o un comercio que elija otra
localidad recibe el mensaje "Esa localidad todavía no está disponible". La expansión a
otras localidades o provincias queda fuera del alcance de esta versión.

El modelo de datos de direcciones (catálogo de Provincias y Localidades, basado en la
API Georef de datos.gob.ar) cubre la totalidad del territorio nacional, previendo una
eventual expansión a futuro; las pantallas ofrecen solo las localidades habilitadas.
Esto no implica una ampliación de la cobertura operativa: comercios, pedidos y envíos
continúan limitados a las tres localidades en esta versión.

### Plataforma
La aplicación es una plataforma web responsiva, accesible desde escritorio y dispositivos
móviles. No se contempla el desarrollo de aplicaciones nativas para iOS o Android.

### Tipos de comercio
El sistema clasifica a los comercios según su rubro gastronómico mediante el campo
`tipo_comercio`, que admite los siguientes valores: Restaurante, Emprendimiento,
Rotisería, Heladería, Cafetería, Panadería, Pizzería, Parrilla, Bar, Kiosco, Food Truck,
Hamburguesería y Otro (13 valores). Esta clasificación es informativa y visual; todos los tipos de comercio tienen
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
  habilita el cobro en todos los comercios aprobados de ese Dueño; para vender, cada
  comercio necesita además documentación de habilitación aprobada. El registro pide el
  CUIT y el domicilio fiscal; la razón social, la condición frente al IVA, el tipo de
  sociedad y la fecha de inicio son opcionales, y no se pide un email del comercio.
- **Empleado:** persona invitada por un Dueño para operar el día a día de uno o varios
  comercios (productos, pedidos, apertura y cierre, y la descripción, el teléfono y los
  horarios del comercio), sin acceso a los datos fiscales, a MercadoPago, a las redes
  sociales, a los documentos ni a los reclamos, ni a la gestión del equipo. Un
  mismo Empleado puede operar comercios de Dueños distintos sin restricción. Entra solo por
  invitación (no existe un registro propio de Empleado) y la invitación es por comercio.
  *Implementado en los tramos E1 a E4 (ver `docs/DECISIONES.md`, 2026-10-05 a 2026-10-15).*
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
- Estado **Apto para Venta** (Aprobado, con la cuenta de MercadoPago de su Dueño vinculada y la
  documentación del comercio aprobada) y
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
- `Comercio.estado == APTO_VENTA` (Aprobado, con la cuenta de MercadoPago del Dueño titular vinculada y la documentación aprobada)
- `Dueño.usuario.estado == ACTIVO`
- El horario de consulta está dentro de las franjas horarias del comercio.
- `Comercio.cerrado_manualmente == false`

### Gestión de direcciones
- **Clientes:** pueden tener hasta 5 direcciones de entrega activas. La primera se
  registra de forma obligatoria al crear la cuenta y queda como predeterminada. Una sola es
  la predeterminada en todo momento. Desde el perfil pueden agregar, editar, eliminar y
  cambiar la predeterminada. Cada dirección puede llevar un alias (hasta 40 caracteres) y una
  referencia (hasta 150). La baja es lógica: la última dirección no se puede eliminar (409,
  código ULTIMA_DIRECCION), con el cupo lleno no se puede agregar otra (409, código
  DIRECCIONES_CUPO_MAXIMO) y, si se elimina la predeterminada, pasa a serlo la más reciente.
  En el checkout el Cliente puede elegir otra dirección solo para ese pedido, sin cambiar la
  predeterminada, y el pedido guarda una copia de la dirección usada. Antes de descartar cambios
  sin guardar la aplicación pregunta "¿Descartar los cambios?".
- **Comercios:** tienen una única dirección operativa, registrada al momento del alta, dentro
  de las localidades habilitadas.
- Cada dirección se asocia a una Localidad (y por extensión a una Provincia) de un catálogo
  precargado desde la API Georef (datos.gob.ar); el selector ofrece solo las localidades
  habilitadas.

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

Todo reembolso es total salvo el de un reclamo, que puede ser parcial. Un pago aprobado que
llega sobre un pedido ya cancelado, por cualquier causa (por ejemplo, el pedido venció o el
comercio o la cuenta del Cliente están suspendidos), se reembolsa siempre por completo. Los
reembolsos fallidos quedan para revisión del Administrador, que los reintenta a mano desde su
pantalla de Reembolsos (el reintento automático no se construyó). Hay una sola cuenta de MercadoPago por Dueño, compartida por todos sus comercios.

### Personalización de Productos (Extras)
**Fuera de alcance (decisión del 18/10/2026).** Los extras de producto (grupos de extras con
opciones adicionales y precio) fueron descartados de esta versión. No hay pantallas,
endpoints ni reglas de negocio que los usen. El modelo de datos conserva las tablas
(`GrupoExtra`, `Extra`, `ProductoGrupoExtra`, `ItemCarritoExtra` y `DetallePedidoExtra`)
sin uso, y queda registrado como posible trabajo futuro.

### Notificaciones
Las notificaciones de estado (cambios de pedido, aprobaciones, rechazos, documentos,
reclamos, suspensiones) se muestran dentro de la aplicación y se actualizan solas
(consulta periódica); no hay notificaciones fuera de la aplicación (push) ni para el
celular. Cada aviso se toca entero y lleva a la pantalla donde se actúa; la lista se carga
de a 20 con "Ver más" y "Marcar todas" deja leídos los avisos propios. El Administrador no
recibe avisos ni tiene campana: su panel muestra contadores de lo pendiente que se
actualizan solos. Los avisos del comercio los recibe el Dueño y cada Empleado activo, cada
uno con su propia copia.

El email (con Resend, remitente `info@bajonea.ar`) se utiliza en los siguientes flujos:
- Verificación de cuenta (al registrarse), recuperación de contraseña y reactivación por
  código: códigos de 6 dígitos, sin enlaces
- Aviso de inactivación automática (al pasar a estado Inactivo)
- Aviso de suspensión y de suspensión levantada de una cuenta de Cliente o de Dueño, y de un
  comercio (al Dueño), con el motivo o el mensaje del Administrador; un solo intento,
  reenviable por el Administrador
- Aviso de comercio aprobado o rechazado (al Dueño)
- Aviso de sesión cerrada en otro dispositivo (seguridad)
- Cancelación de pedido por suspensión del comercio (notificación a clientes afectados)
- Resultado de un reclamo (al Cliente)
- Respuestas de Soporte y los códigos de acceso a una consulta
- Resumen de cierre de turno (al Dueño)
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
| Pendiente de Confirmación | Pago confirmado, esperando respuesta del comercio (30 minutos de margen; el Cliente lo ve como "Esperando al comercio") |
| En Preparación | Pedido aceptado por el comercio |
| En Camino | Pedido despachado (solo domicilio) |
| Listo para Retirar | Pedido listo para ser retirado (solo retiro) |
| Entregado | Pedido completado (confirmado por el Cliente, por el comercio en un retiro, o por el sistema a los 90 minutos en un envío) |
| No Retirado | Pedido de retiro que quedó listo y nadie retiró; lo cierra el comercio o el sistema. Sin reembolso |
| Rechazado | Comercio rechazó el pedido en estado Pendiente de Confirmación, o el sistema lo rechazó al suspenderse el comercio. Genera reembolso |
| Cancelado | Cliente canceló antes del despacho o de que estuviera listo. Genera reembolso |
| Anulado | Comercio anuló desde En Preparación. Genera reembolso |
| Cancelado por Sistema | Cancelación automática (preparación vencida de un comercio suspendido, pago que llega con el comercio o la cuenta suspendidos, comercio sin quien lo atienda, pago no confirmado o rechazado al vencer el plazo). Genera reembolso si hubo cobro |
| Expirado | Comercio no respondió en 30 minutos. Genera reembolso automático |


### Documentación de habilitación
Cada comercio sube documentos de habilitación (libreta sanitaria, carnet de manipulación de
alimentos, habilitación comercial u otro; PDF, JPG, PNG o WebP de hasta 8 MB; hasta 5 en
revisión y 20 en total) y el Administrador los aprueba, rechaza (con motivo) o revoca. Un
comercio solo pasa a Apto para Venta con la cuenta de MercadoPago vinculada, al menos un
documento aprobado y ninguno en revisión; para seguir vendiendo alcanza con la cuenta y un
documento aprobado. Los documentos son privados: solo los ven el Dueño del comercio y el
Administrador. La exigencia se puede apagar con el interruptor de configuración
`comercio.documentacion.requerida` (activo por defecto).

### Turnos, resumen y estadísticas
Los horarios de atención tienen vigencia (un cambio rige desde el día siguiente) y un turno
puede cruzar la medianoche como una sola franja. Cada pedido pertenece al turno en que se
confirmó su pago. El panel muestra lo vendido en el turno (el Dueño, además, la comisión y el
neto; el Empleado no), el Dueño recibe por email el resumen al cerrar cada turno y ve las
estadísticas de los últimos 7 o 30 días de un comercio. Mientras el comercio está dentro de un
horario de atención no se puede cambiar el precio de un producto.

### Suspensiones e inactivación
- **Cliente:** el Administrador puede suspender su cuenta con un motivo de 10 a 500 caracteres.
  No puede iniciar sesión, hacer pedidos ni pagar; sus pedidos sin pagar se cancelan y los
  pagados siguen su curso. Puede escribir a Soporte. Al levantar la suspensión la cuenta vuelve al
  estado que tenía.
- **Comercio:** al suspender un comercio, los pedidos pendientes de confirmación se rechazan
  solos con reembolso total; los que están en preparación se pueden despachar o anular y, si
  nadie lo hace, el sistema los cancela con reembolso a los 90 minutos; los listos para retirar se
  entregan o se cierran como no retirados (o lo hace el sistema a los 90 minutos, sin reembolso);
  los que van en camino no se tocan. El Dueño y el Empleado ven el panel en solo lectura. Solo el
  Administrador levanta la suspensión.
- **Dueño:** suspender la cuenta de un Dueño suspende en cascada sus comercios aprobados, aptos
  para vender y cerrados temporalmente (una suspensión individual sobrevive); el Dueño recibe un
  solo email; si no hay Empleados activos, los pedidos en preparación o listos se anulan o
  cancelan al instante con reembolso.
- **Inactivación:** una vez por día el sistema pasa a Inactivas las cuentas con más de 3 meses
  sin uso, sin aviso previo, salvo el Administrador, las cuentas suspendidas, pendientes o
  bloqueadas, y las que tienen pedidos en curso (un Dueño cuenta como activo si algún comercio
  recibió pedidos en esos 3 meses); procesa hasta 200 cuentas por corrida. Los comercios del
  Dueño pasan a Inactivos. La persona reactiva su cuenta con su usuario y contraseña desde la
  pantalla "Tu cuenta está inactiva" o lo hace el Administrador.

### Soporte, reclamos y páginas legales
- **Soporte:** cualquier persona, con o sin sesión y con la cuenta suspendida, puede abrir una
  consulta (cinco tipos) que es una conversación por turnos de hasta 20 mensajes que cierra el
  Administrador, con límites contra abuso (3 consultas por día y 3 abiertas por email, 10 por
  día por IP, 30 accesos fallidos por hora por email y 10 por IP, 3 reenvíos de códigos por hora).
- **Reclamos:** el Cliente puede reclamar un pedido entregado con el pago aprobado dentro de los
  7 días, una sola vez por pedido, por uno de seis motivos, con un mensaje de 10 a 1000
  caracteres y hasta 3 fotos de 5 MB (JPG, PNG o WebP). El Administrador resuelve con reembolso
  total, parcial o rechazo con motivo; el Dueño ve el estado, el motivo y el monto sin el mensaje;
  el Empleado no ve nada.
- **Páginas legales y ayuda:** Términos y Condiciones, Política de Privacidad y Preguntas
  frecuentes (versión 1.0, 6/11/2026) son páginas públicas, accesibles también desde la pantalla
  "Ayuda" del perfil de Cliente, Dueño y Empleado. La aceptación de los términos al registrarse se
  valida pero no se guarda.

### Interfaz
La interfaz es responsiva: móvil y, desde 1024 px, una composición de escritorio propia para
todos los roles (con un único punto de corte y un ancho máximo de 1280 px; 1440 px el Administrador).
Se basa en las 10 heurísticas de Nielsen y cuida la accesibilidad (áreas táctiles de 44 px,
confirmaciones unificadas, reducción de movimiento y enlace "Saltar al contenido"). Al iniciar
sesión la aplicación saluda por el nombre de pila.

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

- **Cobertura geográfica limitada:** El sistema opera solo en Río Grande, Ushuaia y
  Tolhuin; cualquier otra localidad se rechaza ("Esa localidad todavía no está disponible"),
  si bien el modelo de direcciones admite localidades de todo el país de cara a una futura
  expansión.

- **Sin extras de producto:** los grupos de extras y los extras fueron descartados del
  alcance (ver "Personalización de Productos (Extras)").

- **Contraste del color de marca:** el naranja de la marca (`#ff4700`) no alcanza el contraste
  AA para texto pequeño. Se conserva por decisión de identidad; el texto pequeño sobre naranja se
  evita y los controles tienen otras señales además del color.

- **Tablet sin diseño propio:** por debajo de 1024 px se usa la versión móvil y desde 1024 px la
  de escritorio; no hay una composición pensada para tablet.

- **Paginación en el servidor pendiente:** el catálogo de comercios y la lista de Dueños del
  Administrador no se paginan en el servidor (la lista de Dueños se muestra de a 30 en pantalla); la
  paginación en el servidor queda como deuda para el despliegue (ver la lista de despliegue).

- **Términos y Condiciones y Política de Privacidad:** son páginas públicas (versión 1.0, 6/11/2026)
  con el email de contacto info@bajonea.ar como único canal; su texto todavía necesita la revisión de
  un abogado antes de salir a producción. La aceptación al registrarse no se guarda.

- **Reparto del reembolso por reclamo:** cómo Mercado Pago reparte entre la plataforma y el Dueño un
  reembolso por reclamo no está verificado con una cuenta real; por eso el aviso al Dueño solo informa
  el monto reembolsado y no afirma cuánto se le descuenta.

- **Sonido y aviso de conexión en dispositivos reales:** no se probaron en un iPhone ni en Safari
  reales (ver Limitaciones Conocidas de Implementación).

- **Sin app móvil nativa:** La experiencia mobile se resuelve mediante diseño responsivo;
  no se desarrollan apps para iOS ni Android.

- **Sin integración con redes sociales:** No se contempla login social ni sincronización
  automática con plataformas externas como Instagram o WhatsApp. Esto no incluye la
  publicación de enlaces de contacto a las redes del comercio (Instagram, Facebook,
  TikTok, WhatsApp, X, sitio web u otro), que el comercio carga y edita
  manualmente como dato de contacto — ver Requisitos Funcionales del Comercio.

- **Pedidos durante la suspensión de un comercio o de un Dueño:** los pedidos pendientes
  de confirmación se rechazan solos, en el acto, con reembolso total. Los que están en
  preparación se pueden despachar o anular y, si nadie lo hace, el sistema los cancela con
  reembolso total a los 90 minutos de la suspensión. Los pedidos en camino no se modifican:
  siguen su curso normal (el Cliente los confirma o, si no lo hace, el sistema los marca
  como entregados a los 90 minutos) y no generan reembolso.

- **Dueño y Cliente en una misma cuenta:** la combinación de Dueño y Cliente en una
  misma cuenta no está construida. Queda escrita como regla (un Dueño no pasa a Cliente
  ni un Cliente pasa a Dueño con la misma cuenta; se registra con otra) y como trabajo
  futuro. Hoy un Empleado es un Cliente al que se le suma la relación con cada comercio,
  y un Dueño no puede ser Empleado.

- **Timer de retiro durante suspensión:** Si un comercio es suspendido y tiene pedidos
  en estado Listo para Retirar, el equipo puede entregarlos o cerrarlos como No Retirados
  y el cliente dispone de 90 minutos (contados desde que quedaron listos o desde la
  suspensión, lo que haya pasado después) para presentarse. Si no lo hace, el sistema
  cierra el pedido como No Retirado, sin reembolso. Excepción: si se suspende la cuenta del
  Dueño y el comercio no tiene ningún Empleado activo, los pedidos en preparación y los
  listos para retirar se anulan o cancelan con reembolso total.

---

## Limitaciones Conocidas de Implementación

Diferencias entre lo especificado en este documento y en los Requisitos Funcionales, y lo implementado al 2026-11-13. Son funcionalidades especificadas y todavía no implementadas, o comportamientos conocidos, no cambios de alcance.

**Pagos y reembolsos**
- **Nota de crédito y reembolso:** el reembolso total ya funciona para el rechazo, la expiración por falta de respuesta, la cancelación por suspensión y la anulación del comercio (tramos de NotaCredito y E3, bloque A0). La anulación crea siempre la nota de crédito en la misma transacción en que el pedido pasa a Anulado (si el pedido no tiene un pago aprobado y confirmado no hay nada que devolver y se anula sin nota); el rechazo, la expiración por falta de respuesta, la cancelación por suspensión del comercio y la cancelación del Cliente la crean también en la misma transacción en que el pedido cambia de estado (si la nota no se puede escribir, el pedido queda como estaba); solo la llamada a MercadoPago ocurre después de confirmar.
- **Pago tardío y pago duplicado:** un pago aprobado sobre un pedido ya cancelado, por cualquier causa, se reembolsa siempre por completo (nota de crédito y reembolso). Un segundo pago aprobado con otro identificador sobre un pedido ya pagado (pago duplicado) solo genera una alerta registrada en base de datos (`alerta_webhook_mp`); la consulta de las alertas por pantalla no existe.
- **Reembolso parcial por ítem:** sin implementar. Existe el reembolso parcial por monto de un reclamo, resuelto por el Administrador.
- **Pago en revisión:** mientras un pago está `pending` o `in_process` no se puede reintentar el pago hasta que se resuelva o venza el pedido. Es un comportamiento intencional.

**Integración con MercadoPago**
- **Verificación del split:** solo deja rastro. Si `fee_details` no trae la comisión de marketplace esperada o su monto no coincide, se registra una alerta `SPLIT_NO_APLICADO` en `alerta_webhook_mp` y no se hace nada más (no se bloquea ni se revierte el pago). La consulta de las alertas por pantalla no existe.
- **Cuenta de prueba:** que una cuenta vinculada quede marcada como de prueba (`es_cuenta_prueba`) depende de la variable de entorno `MERCADOPAGO_TEST_TOKEN` al momento de vincular, no de inspeccionar la cuenta real. Si el backend arranca sin ella, una cuenta de prueba queda marcada como de producción; el backend lo advierte con un WARN al arrancar.
- **Etiqueta del cargo al comercio:** el detalle de pedido del comercio muestra "Cargo por servicio (1%)" con el porcentaje fijo en la pantalla, aunque la tarifa es configurable por el Administrador; el monto sí es el real del pedido.
- **Renovación de tokens:** no existe refresh. El token de acceso de la cuenta vinculada vence a los ~6 meses.
- **Desvinculación de la cuenta (multi-comercio, tramo 5):** los tokens guardados no se borran, solo la cuenta pasa a inactiva. La desvinculación se rechaza mientras algún comercio del Dueño tenga pedidos en `PENDIENTE_PAGO`, así que puede demorar hasta 30 minutos (el vencimiento del pedido más reciente, con el job de vencimiento corriendo cada 60 segundos); con tráfico alto un cliente podría mantener el bloqueo de forma continua,; el cierre manual del comercio (botón "Cerrar comercio") frena los pedidos nuevos y evita ese bloqueo continuo, aunque los pagos ya iniciados siguen su curso hasta vencer. Plan B si molesta en el uso real: desvincular igual y seguir verificando solo los pagos de pedidos ya existentes con los tokens guardados, aunque la cuenta esté inactiva. Los pedidos en curso que quedan al desvincular (`PENDIENTE_CONFIRMACION_COMERCIO`, `EN_PREPARACION`, `EN_CAMINO`, `LISTO_PARA_RETIRAR`) siguen su flujo, y un reembolso posterior nace `PENDIENTE_REVISION_MANUAL`. La hora para reintentar es aproximada y se calcula con el reloj único de la aplicación (zona `America/Argentina/Ushuaia`).
- **Una cuenta por Dueño y una cuenta en un solo Dueño:** si dos Dueños intentan vincular la misma cuenta a la vez, uno gana y el otro recibe el error de cuenta en uso (lo garantiza un índice único en la base). Dos primeras vinculaciones simultáneas del mismo Dueño pueden dar un error genérico de dato duplicado en una de las dos (comportamiento anterior a este tramo).
- **Verificación del monto:** el webhook y la sincronización no verifican que el monto pagado coincida con el total del pedido.
- **Firma del webhook:** se valida solo si el secreto `MERCADOPAGO_WEBHOOK_SECRET` está configurado; sin él se omite y se registra una advertencia.
- **Identificador de pedido no numérico en el webhook:** responde con un error 500.
- **Loggers dedicados de MercadoPago** (`webhook.mercadopago`, `jobs.*`, `audit`): no existen; se usa el logger estándar de cada clase.

**Pedidos y comercios**
- **EN_CAMINO al suspender un comercio:** no se modifica (decisión de diseño, no una omisión): el pedido sigue su curso normal (confirmación del Cliente o autoconfirmación a los 90 minutos). Los pendientes de confirmación se rechazan solos, los en preparación se cancelan a los 90 minutos si nadie los resuelve y los listos para retirar se cierran como No Retirados a los 90 minutos.
- **Cierre manual y franjas partidas:** una franja que cruza la medianoche es una sola fila (un turno), y un día con horario partido tiene dos filas. La reapertura automática del cierre manual ocurre al empezar la primera franja posterior al momento del cierre, así que un cierre hecho en el primer tramo de un horario partido se reabre al empezar el segundo tramo. Una franja que cierra a las 23:59 se interpreta como fin del día. Un comercio sin franjas cargadas no se reabre solo. No hay pantalla para consultar el historial de cierres (`HistorialCierreComercio`) y los cierres no generan notificaciones.
- **Bloqueo del Dueño y catálogo (tramo C2):** el catálogo público lista los comercios en `APTO_VENTA` y en `CERRADO_TEMPORALMENTE`; estos últimos aparecen con el indicador "Cerrado temporalmente", sin hora de reapertura y sin poder recibir pedidos (agregar al carrito y confirmar el pedido responden `409` "Este comercio está cerrado en este momento"). El campo `estado` del catálogo público informa siempre `APTO_VENTA`; lo que ve el público es `estadoApertura`, que distingue el bloqueo de la cuenta ("Cerrado temporalmente", sin hora de reapertura) del cierre manual ("Cerrado", con la hora de reapertura); esta regla del 2026-10-18 reemplaza a la de mostrar los dos casos iguales. Al bloquearse la cuenta de un Dueño (tres intentos fallidos) solo sus comercios `APTO_VENTA` pasan a `CERRADO_TEMPORALMENTE`: un `APROBADO` (sin cuenta de cobro, que no está en el catálogo ni recibe pedidos) y cualquier otro estado no se tocan. Comportamiento conocido: (a) los pedidos en curso de un Dueño bloqueado no se modifican: el Dueño no puede iniciar sesión para atenderlos y los vencimientos automáticos (pago, respuesta del comercio, retiro) siguen su camino; (b) un cierre manual hecho antes del bloqueo no se borra y sigue vigente al desbloquear, pero la reapertura automática puede apagarlo mientras la cuenta sigue bloqueada (el estado `CERRADO_TEMPORALMENTE` es el que manda); (c) con la cuenta del Dueño bloqueada ningún comercio queda a la venta: si el Administrador aprueba un comercio pendiente del Dueño con la cuenta de MercadoPago vinculada, o llega la vinculación de MercadoPago sobre un comercio aprobado, el comercio queda en `CERRADO_TEMPORALMENTE` (con una fila de historial automática "Bloqueo de cuenta vigente al aprobar" o "... al vincular Mercado Pago") y pasa a vender al desbloquear la cuenta; un comercio que no llegaría a `APTO_VENTA` (por ejemplo un `APROBADO` sin cuenta de cobro) no cambia; (d) la restauración al recuperar la contraseña depende de la cuenta de MercadoPago activa en ese momento (si se desvinculó mientras estaba bloqueado, vuelve a `APROBADO`); (e) ninguna pantalla ni notificación avisa del bloqueo a los clientes ni al Administrador; (f) la suspensión de un comercio por el Administrador puede cruzarse con el tercer intento fallido de login del mismo Dueño: ambas transacciones pueden esperarse mutuamente y el motor revierte una (la ventana es de milisegundos y nunca apareció en las pruebas de estrés, pero no está cubierta como el resto de los cruces).
- **Historial de estados del comercio (`HistorialEstadoComercio`):** se escribe al aprobar, rechazar (incluido el rechazo definitivo) y suspender un comercio (Administrador), en las transiciones automáticas `APROBADO ↔ APTO_VENTA` al vincular o desvincular MercadoPago, en la propagación de bloqueo (solo los `APTO_VENTA`, a `CERRADO_TEMPORALMENTE`) y su restauración (recuperación de contraseña y reactivación de cuenta) y en la re-solicitud del Dueño (`RECHAZADO → PENDIENTE`). Registra también la inactivación automática por falta de uso del Dueño, la suspensión y el levantamiento por la cuenta del Dueño, y la restauración al reactivar la cuenta.
- **Corrección y re-solicitud de comercios rechazados (backend y pantallas implementados):** el Dueño puede corregir el mismo comercio y volver a solicitarlo (hasta 3 veces; la tercera rechazada o un rechazo pedido como definitivo lo deja en `RECHAZO_DEFINITIVO`). Limitaciones conocidas: (a) la pantalla de corrección se abre sola desde la pantalla de rechazo cuando el comercio rechazado es el único del Dueño; para un comercio rechazado que no es el que muestra el panel (un adicional) solo se abre por dirección directa (`comercio-corregir.html?id=…`) hasta el selector de comercios del tramo 4; (b) el listado general de comercios del Administrador ya incluye los rechazados y los de rechazo definitivo (con su etiqueta de estado), pero no hay una pantalla propia ni un filtro por estado para encontrarlos entre los demás; (c) el backend no bloquea por estado las operaciones de un comercio rechazado o en rechazo definitivo (productos, pedidos y perfil siguen sin guarda de estado); (d) no se envían emails por estos cambios; (e) la notificación de rechazo no enlaza a la corrección (depende del selector de comercio del tramo 4); (f) el contacto con Soporte desde la pantalla de rechazo definitivo está disponible; (g) reabrir un rechazo definitivo es una operación manual sobre la base (ver `docs/DECISIONES.md`).
- **Levantar la suspensión de un comercio:** implementado (tramo S2). El comercio vuelve a Apto para Venta, a Aprobado o a Cerrado Temporalmente según cumpla la regla de seguir vendiendo; la transición queda en el historial de estados. Si el comercio está suspendido por la suspensión de su Dueño, no se puede levantar solo: se levanta la del Dueño.
- **Empleado (implementado en los tramos E1 a E4):** invitaciones, selector de contexto, permisos delegados, gestión del equipo, renuncia y pérdida de acceso están implementados (estructuras en las migraciones `V29` a `V35`). Limitaciones conocidas:
  - **Gestión del equipo (tramo E4):** el Dueño da de baja y reactiva directamente a un miembro; solo se puede reactivar directamente a quien dio de baja el Dueño (si la persona renunció, o la baja no quedó registrada, hace falta una invitación nueva). Una relación que quedó inactiva sin registro de la baja (por ejemplo, una cargada a mano) no se puede reactivar directamente. Reactivar a una persona cuya cuenta ya no es apta responde un mensaje genérico, sin decir el motivo y sin enviar el email de regularización. No hay email de reactivación: la persona se entera por el aviso dentro de la aplicación. Dar de baja o renunciar no reasigna nada (los pedidos no tienen un Empleado asignado) ni toca sus pedidos como Cliente. Cuando una persona pierde el acceso, la pantalla le informa la causa (baja del Dueño, renuncia en otro dispositivo, comercio no disponible o neutra) consultando su propia relación; un tercero no puede saber si una relación existe.
  - **Cuenta de Empleado bloqueada, suspendida o inactiva:** no cambia la relación con los comercios, que sigue Activa; el Empleado vuelve a operar apenas la cuenta se regulariza. Mientras tanto no cuenta como equipo activo (en el equipo del Dueño aparece como "Cuenta suspendida").
  - **El Administrador solo lee el equipo:** ve el equipo y la actividad de cualquier comercio en solo lectura y no puede invitar, dar de baja, reactivar ni cancelar. Las respuestas del equipo no traen el nombre del comercio (la pantalla del Administrador lo toma del detalle desde el que se abre; por dirección directa se omite el subtítulo).
  - **Sin multirol físico:** `Usuario.rol` es una sola columna y el token lleva un solo rol. Solo se hace cumplir "Empleado + Cliente" y que un Empleado nunca sea Dueño ni Administrador. "Dueño + Cliente" y "Administrador + Cliente" son regla escrita sin mecanismo: ni el Dueño ni el Administrador tienen fila de Cliente y las rutas de Cliente exigen el rol Cliente.
  - **Un Cliente existente no puede pasar a Dueño:** registrar un comercio con un email o un DNI ya existentes responde conflicto (409) y no se construye en este bloque.
  - **Quien fue Empleado no puede registrar un comercio** con esa cuenta, aunque su relación esté inactiva. Los casos raros los resuelve el equipo del proyecto por soporte.
  - **Los intentos del código de invitación pueden ser gastados por terceros:** quien conozca el email de un invitado puede agotar los 5 intentos de una invitación; el Dueño la reenvía. No hay control por IP.
  - **Sesión única en ambos contextos:** iniciar sesión en otro dispositivo cierra la sesión del Cliente y del Empleado a la vez (es una sola sesión).
  - **Alta por invitación con dirección:** una cuenta nueva creada por invitación pide la dirección porque el Cliente no puede pedir con entrega a domicilio sin ella; después la gestiona desde la pantalla de direcciones de su perfil.
  - **Pedido autoconfirmado (T30, implementado en el tramo E3, bloque A6):** cuando el sistema autoconfirma la entrega de un pedido a domicilio, el Dueño y los Empleados Activos reciben cada uno su aviso (sin el Cliente del pedido si es Empleado del comercio). Limitación conocida: el aviso se emite en la misma operación que la autoconfirmación, así que un Empleado que se suma después no lo ve; y el cierre de un retiro (que no se retira) no genera aviso al equipo.
  - **Horarios y extras:** la edición de horarios existe y es delegable al Empleado (tramo T1). Los extras fueron descartados del alcance.
  - **Guard de comercio no operativo (Dueño y Empleado, tramo S2):** con el comercio suspendido, el Dueño y el Empleado tienen el panel en solo lectura: no modifican productos, imágenes, descripción, teléfono, horarios ni redes (409, código COMERCIO_SUSPENDIDO), no abren ni cierran el comercio (409, código COMERCIO_NO_OPERATIVO) y no aceptan pedidos nuevos (409, código COMERCIO_SIN_OPERACION); sobre los pedidos en curso actúan según el estado de cada uno (ver Suspensiones e inactivación). Con el comercio cerrado temporalmente se pueden editar productos y perfil, pero no aceptar pedidos nuevos ni abrir o cerrar. Con un comercio operativo cerrado a mano el Empleado sí acepta pedidos pendientes. El Dueño puede, además, subir documentos y vincular Mercado Pago con el comercio suspendido.
  - **Pedido de retiro no retirado (implementado, tramo E3, bloque A4b):** un pedido listo para retirar que el cliente no retira se puede cerrar como "No retirado" pasados 60 minutos (configurable), sin devolución del pago.
  - **Tramo futuro anotado (sin fecha):** reclamo del Cliente cuando un retiro se cerró como no retirado por error.
  - **Invitaciones vencidas:** "Pendiente" es la invitación dentro del plazo en que se puede aceptar, reenviar o cancelar. Un proceso automático (cada minuto) pasa a Vencida, en la base, toda invitación Pendiente cuya fecha de vencimiento (7 días) ya pasó; no escribe historial ni avisa a nadie. Hasta la corrida siguiente el listado ya la informa como Vencida. Se puede reenviar y cancelar una invitación Pendiente, Vencida o con el código bloqueado; al reenviar, la vencida y la que tiene el código bloqueado conservan su estado y solo una pendiente todavía vigente queda Reemplazada. Reenviar y cancelar solo actúan sobre la invitación más reciente de cada email en el comercio: una más vieja que ya tiene otra más nueva responde "no se puede" y no se modifica. Si el proceso estuviera detenido, las invitaciones no se marcan hasta que vuelva a correr, y el sistema sigue mostrándolas y tratándolas como vencidas.
  - **Invitación invalidada:** al quinto intento fallido la invitación se muestra al Dueño como "Código bloqueado", con el botón "Reenviar". El invitado que ingresa un código incorrecto recibe siempre la misma respuesta (401), sin intentos restantes.
  - **Aceptar según el estado del comercio:** se puede aceptar con el comercio Aprobado, Apto para Venta o Cerrado Temporalmente, y no con el comercio Suspendido, Pendiente, Rechazado, con Rechazo Definitivo o Inactivo; invitar exige Aprobado o Apto para Venta.
  - **Actividad del comercio:** la tabla de ediciones (`V32`) y la lista de actividad (pedidos, ediciones, cierres y, desde el tramo E4, eventos del equipo) se implementaron en E3 y E4; el Dueño la ve como tercera pestaña de "Ver equipo" y el Administrador en una pantalla propia, en solo lectura. Se registran las ediciones del Dueño y las del Empleado (con su rol y su usuario). La lista recorre y ordena el historial completo del comercio en cada página; con los volúmenes esperados es instantáneo (con 30000 pedidos tarda unos 250 ms por página).
  - **Email de regularización:** nombra solo al comercio, nunca al Dueño.
  - **IP real detrás del proxy (lista de despliegue):** sin configurar la estrategia de cabeceras reenviadas (`server.forward-headers-strategy`) en producción, el servidor ve la IP del proxy y todos los clientes comparten el mismo contador del límite por IP (también `Sesion.ip_origen`). Queda en la lista de despliegue; hay que verificarlo en el entorno de producción antes de contar con ese límite.
- **Edad mínima declarada:** el registro de Cliente exige 14 años o más y el alta como Empleado, 18 años o más, calculados con la fecha del día del servidor. La edad es la que la persona declara en la fecha de nacimiento: no se verifica identidad ni DNI, de modo que una fecha falsa pasa. La regla de 14 años se evalúa solo al registrarse: una cuenta ya existente con menos de 14 años puede seguir usando la plataforma, y no hay migración ni baja de esas cuentas. Los registros de Dueño y de Comercio no cambian (el representante ya exigía 18 años).
- **Términos y Condiciones en el registro:** el servidor exige el campo `aceptaTerminos` en `true` (si falta o es falso responde 400), pero la aceptación no se guarda: no hay fecha ni versión aceptada ni trazabilidad, y no se planea agregarlos (decisión de Diego, no es un requisito del proyecto). Los Términos, la Política de Privacidad y las Preguntas frecuentes existen como páginas públicas (versión 1.0, 6/11/2026). El hecho de estar registrado da por aceptados los términos. Lo mismo vale para el alta del Dueño, el alta de un comercio adicional y el alta por invitación del Empleado.
  - **Aviso de regularización:** un invitado cuya cuenta no es apta no ve la invitación y debe pedir que se la reenvíen cuando regularice su cuenta.
- **Login y registro por nombre de usuario:** implementados para Cliente y Dueño (el login es exclusivamente por nombre de usuario; el email queda para verificación, recuperación y reactivación de cuenta). Limitaciones conocidas:
  - El login revela si una cuenta existe pero está pendiente de verificar o bloqueada antes de pedir la contraseña. Es comportamiento heredado y una decisión consciente de no cambiarlo. Una cuenta suspendida o inactiva solo informa su estado después de comprobar que la contraseña es correcta.
  - El aviso de "intentos restantes" ante una contraseña incorrecta también revela que el usuario existe, por el mismo criterio.
  - El endpoint público de disponibilidad de nombre de usuario no tiene límite de consultas (rate limit).
  - Dueño y Administrador no ven su nombre de usuario en ninguna pantalla (no tienen pantalla de datos personales) y no pueden cambiarlo; solo el Cliente puede cambiarlo, desde su perfil (3 cambios cada 30 días). El nombre de usuario tiene de 8 a 20 caracteres.
  - El Empleado no tiene un alta propia: al aceptar una invitación con una cuenta nueva define su nombre de usuario con los mismos datos del registro de Cliente (implementado, tramo E1); con una cuenta existente conserva el suyo.
- **Zona horaria:** desde el bloque A2b del tramo E3 hay un único reloj de la aplicación, en la zona de la propiedad `app.zona-horaria` (por defecto `America/Argentina/Ushuaia`, UTC-03:00; una zona inválida impide arrancar). Lo usan los tres historiales de la actividad (pedidos, ediciones y cierres), los plazos de los pedidos y el "hoy" del resumen del comercio, las invitaciones de empleado, los horarios de atención y los controles de edad. Las filas ya guardadas no se migraron: si un entorno con datos corría la JVM en otra zona, los pedidos en curso en el momento del cambio se ven desplazados esa diferencia de horas (solo las filas en vuelo, de forma transitoria). Quedan en la zona de la JVM, a propósito, las demás fechas que solo se guardan y se muestran (alta y modificación de registros, sesiones, tokens, historial de estados del comercio, notificaciones, notas de crédito); no se comparan con las del reloj único.
- **Avisos sonoros y de conexión (pulido 1 y 1b):** el sonido de los avisos nuevos y el aviso de "Sin conexión" se probaron en Chromium y en WebKit emulado (perfil iPhone 13 de Playwright), pero **no en un iPhone ni en Safari reales**. El sonido solo suena con la aplicación abierta y, como en cualquier navegador, hace falta un toque previo en la página para que el audio esté permitido; con la aplicación cerrada o en segundo plano no suena (haría falta una notificación push, fuera del alcance actual). En Safari un botón no recibe foco al tocarlo: la hoja de confirmación devuelve el foco al botón que la abrió de forma explícita para que funcione igual.
- **Reintento de una acción tras un corte de red:** el botón "Reintentar" repite la última acción. Si el primer envío sí había llegado al servidor (por ejemplo, una pérdida de la respuesta), repetir una acción sin protección propia (crear un producto, cargar un documento, enviar una consulta nueva a Soporte o crear un pedido desde el mismo carrito) puede generar un duplicado; el reclamo, el pago de un pedido, el mensaje de Soporte en turno y la categoría con el mismo nombre están protegidos y no se duplican. Para esos cuatro envíos sin protección, cuando el corte es un tiempo de espera agotado (la solicitud salió y no hubo respuesta), la aplicación ya no ofrece "Reintentar": avisa que puede que el envío haya llegado y manda a verificarlo en la lista correspondiente (Mis pedidos, Productos, Documentación, Mis consultas a Soporte o el email, si no hay sesión). Siguen pudiendo duplicarse si la persona vuelve a enviar a mano sin verificar, o ante un error del servidor (5xx) tras el que el aviso sí ofrece "Reintentar". El fallo inmediato de conexión (la solicitud no salió) es seguro de reintentar.
- **Tiempo para responder un pedido:** el comercio ve "Vence en N minutos" mientras el pedido espera su respuesta; el plazo lo calcula el servidor con la misma configuración del vencimiento automático (30 minutos desde que se confirma el pago). El valor se actualiza con la recarga automática de 15 segundos, no segundo a segundo.
- **Dueño y Cliente en una misma cuenta:** no está construido (ver Limitaciones). Un Dueño que también quiera comprar necesita otra cuenta.
- **Inactivación sin aviso previo:** el sistema inactiva las cuentas a los 3 meses sin uso sin avisar antes (decisión de Diego); la persona se entera al volver o por el email posterior.
- **Notificaciones del Administrador:** siguen sin existir avisos ni campana para el Administrador (su panel muestra contadores que se actualizan solos); seis tipos de aviso existen sin emisor (`NUEVO_COMERCIO_PENDIENTE`, `NUEVA_RESOLICITUD_COMERCIO`, `NUEVO_RECLAMO`, `NUEVO_MENSAJE_SOPORTE`, `REEMBOLSO_FALLIDO_DEFINITIVO` y `PEDIDO_CERRADO_TIMER_SUSPENSION`) y quedan documentados.
- **Reembolsos fallidos sin reintento automático:** si Mercado Pago rechaza un reembolso, la nota queda como fallida y se ve en la pantalla de Reembolsos del Administrador, que la reintenta a mano. El proceso que reintentaba solo (hasta 5 veces) y el aviso al Administrador (T27) estaban diseñados y no se construyeron.
- **Soporte sin tiempo real:** la conversación no se actualiza sola del lado de la persona; el Administrador ve las consultas que esperan su respuesta en el contador del panel.
- **Fotos de reclamo y documentos en la base:** se guardan en la base de datos (hace falta `max_allowed_packet` de al menos 16 MB) y los ve solo quien corresponde.
