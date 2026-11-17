# Requisitos Funcionales — Generales

Requisitos aplicables a todos los roles del sistema: Cliente, Dueño, Empleado y Administrador.

---

## Autenticación

- El sistema debe permitir el inicio de sesión mediante nombre de usuario y contraseña. El email no es credencial de login: se usa para la verificación de cuenta, la recuperación de contraseña y la reactivación de cuenta.
- El sistema debe soportar cuatro roles de usuario: Cliente, Dueño, Empleado y Administrador.
- El sistema debe bloquear la cuenta tras tres intentos fallidos consecutivos de inicio de sesión.
- El sistema debe bloquear la cuenta tras tres intentos fallidos de ingreso de contraseña actual en el flujo de cambio de contraseña desde perfil, invalidando la sesión activa.
- El sistema debe permitir únicamente una sesión activa por usuario a la vez.
- El sistema debe permitir el cierre de sesión manual por parte del usuario.
- Con la contraseña correcta, el inicio de sesión de una cuenta suspendida responde con el motivo de la suspensión (sin crear sesión) y el de una cuenta inactiva con la pantalla "Tu cuenta está inactiva" (ver Estados de Usuario). Con una contraseña incorrecta, el mensaje es siempre el genérico: el sistema no revela el estado de una cuenta suspendida ni inactiva a quien no conoce la contraseña.
- La respuesta del inicio de sesión incluye el nombre de pila de la persona (el del representante, en el caso del Dueño) para que la aplicación la salude; no viaja en el token de sesión y ninguna respuesta de error lo incluye.
- Un mismo Usuario puede operar en más de un contexto: como Cliente y como Empleado de
  uno o más comercios. No existe multirol en la base de datos: el Usuario tiene un solo
  rol (`Usuario.rol`) y el token de sesión lleva un solo rol; el contexto "Empleado de un
  comercio" se resuelve por request mediante el comercio activo y la relación Activa
  comprobada contra la base (ver Requisitos Funcionales — Empleado).
- **Regla de combinaciones de roles:** un Administrador es Administrador o Cliente; un
  Dueño es Dueño o Cliente; un Empleado es Empleado o Cliente. Un Cliente puede sumar el
  rol Empleado por invitación. Un Dueño no puede ser Empleado de otro local y un
  Administrador no puede ser Empleado ni Dueño. Hoy solo se construye y se hace cumplir
  "Empleado + Cliente" y que un Empleado nunca sea Dueño ni Administrador; "Dueño +
  Cliente" y "Administrador + Cliente" quedan como regla escrita sin mecanismo.

### Selector de contexto

> **Estado de implementación:** implementado en el tramo E2, entrega B (ver `docs/DECISIONES.md`, 2026-10-11).

- Al iniciar sesión, si la cuenta es de Cliente y además es Empleado de uno o más
  comercios, el sistema muestra un selector a pantalla completa con "Cliente" y cada
  comercio (con el último contexto usado resaltado); si no es Empleado de ningún comercio,
  entra directo como Cliente. Si la consulta de sus comercios falla, entra como Cliente.
  El último contexto se recuerda por persona: una pestaña nueva con la sesión ya iniciada
  entra directo a él, validando que siga existiendo (si ya no existe, va al selector o, si
  no le queda ningún comercio, a su cuenta de Cliente). Se puede cambiar de contexto desde
  el perfil con "Cambiar de cuenta" (una hoja inferior con las mismas opciones), sin
  cerrar sesión.
- Dentro de un comercio, el Empleado usa el mismo panel que el Dueño, sin la opción
  "Agregar comercio", sin el panel "Tus comercios" ni los avisos de cobro. Con la pestaña
  en un comercio, las pantallas de Cliente (inicio, explorar, carrito, pedidos) llevan al
  panel del comercio; para usarlas hay que pasar por "Cambiar de cuenta".
- Al iniciar sesión en otro dispositivo, la sesión única cierra la sesión anterior en
  ambos contextos; el selector lo comunica.
- Si a un Empleado se le desactiva una relación, su próxima acción sobre ese comercio
  responde "no encontrado" y la aplicación le muestra una hoja inferior "Ya no tenés
  acceso a este comercio" (con el nombre del comercio y el botón "Entendido"); al cerrarla
  lo lleva al selector, o a su cuenta de Cliente si no le queda ningún comercio (sin una
  pantalla dedicada). Su sesión no se cierra.
- Entrada para quien fue invitado como Empleado: el login ofrece el botón "Tengo una
  invitación", y el registro una línea que lleva a la misma pantalla (ver Requisitos
  Funcionales — Empleado). No existe un registro propio de Empleado.

---

## Nombre de Usuario

- Todo usuario tiene un nombre de usuario, que es su credencial de login. Debe tener entre 8 y 20 caracteres, solo letras y números (sin espacios ni símbolos) y al menos una letra.
- El sistema debe normalizar el nombre de usuario a minúsculas al guardarlo y al mostrarlo, y debe garantizar que sea único en toda la plataforma sin importar el rol, incluso a nivel de base de datos.
- El sistema debe rechazar una lista de nombres reservados (por ejemplo "administrador", "bajonea", "soporte"), comparados de forma exacta.
- El nombre de usuario se solicita en el registro de Cliente y en el registro de Dueño. El de Administrador se crea junto con su cuenta sembrada. El Empleado no tiene un alta propia: si la persona no tiene cuenta, la crea al aceptar una invitación (con los mismos datos que el registro de Cliente, incluido el nombre de usuario); si ya tiene cuenta, conserva su nombre de usuario. Solo el Cliente puede cambiar su nombre de usuario desde su perfil (ver Requisitos Funcionales — Cliente).
- Los formularios de registro deben informar en vivo si un nombre de usuario está disponible, mediante un endpoint público de consulta de disponibilidad.
- Ante credenciales inválidas en el login, el sistema debe mostrar un mensaje genérico ("Usuario o contraseña incorrectos") que no distinga entre un usuario inexistente y una contraseña incorrecta. En el registro y en la consulta de disponibilidad sí se informa si un nombre de usuario ya está en uso.
- El identificador que viaja en el token de sesión es el id del usuario, no su nombre de usuario ni su email; por eso un cambio de nombre de usuario no invalida las sesiones existentes.

---

## Gestión de Sesiones

- El sistema debe registrar por sesión: usuario, estado, fechas de inicio y cierre, tipo de cierre (manual, automático o forzado), IP de origen, navegador y dispositivo.
- El sistema debe actualizar el campo `fecha_ultimo_acceso` del usuario en cada inicio de sesión exitoso, en la reactivación de la cuenta, en la verificación del email, en el desbloqueo y al terminar una suspensión.
- Una sesión puede cerrarse por cierre manual, por vencimiento, por inicio de sesión en otro dispositivo, por suspensión de la cuenta o por inactividad. Cuando la sesión termina porque se inició sesión en otro dispositivo, el aviso lo dice; los demás cierres no afirman que se haya iniciado sesión en otro lado.

---

## Verificación de Cuenta

- Todo usuario debe verificar su dirección de email para acceder a todas las funcionalidades del sistema.
- El sistema debe generar un código único de verificación de 6 dígitos, con fecha de creación, uso y vencimiento de 24 horas, registrando si fue utilizado. Cada código admite como máximo 5 intentos fallidos; superados, hay que pedir uno nuevo.
- Un usuario sin email verificado permanece en estado Pendiente.
- Ante código expirado o inválido, el sistema debe permitir reenviar la verificación. La pantalla indica que el código vence y que se puede pedir uno nuevo, y exige una espera corta entre reenvíos (30 segundos, de interfaz).
- La pantalla de verificación debe funcionar tanto cuando se llega con el email en la dirección (flujo normal posterior al registro) como cuando se llega sin él (por ejemplo desde el aviso de "cuenta no verificada" del login, que no tiene el email a mano); en este segundo caso el sistema debe pedir el email como paso previo.

---

## Recuperación de Contraseña

- El sistema debe permitir recuperar la contraseña mediante un código de 6 dígitos enviado por email, con validez de 30 minutos. El email no lleva enlace: la persona escribe el código y la nueva contraseña en la misma pantalla.
- El flujo de recuperación de contraseña debe estar disponible tanto para usuarios en estado Activo como para usuarios en estado Bloqueado, ya que es el mecanismo principal de desbloqueo de cuenta.
- El sistema debe registrar el estado del código, su fecha de creación, uso y vencimiento.
- Al utilizar el código exitosamente, la contraseña se actualiza, el estado del usuario se restablece a Activo, el contador de intentos fallidos se pone en cero, y todas las sesiones activas se cierran forzadamente.
- Si el usuario que recuperó la contraseña tiene rol Dueño, el sistema debe restaurar automáticamente sus comercios que estuvieran en Cerrado Temporalmente: vuelven a Apto para Venta si siguen cumpliendo la regla de seguir vendiendo (cuenta de MercadoPago activa y al menos un documento aprobado) y a Aprobado si no.
- Recuperar la contraseña de una cuenta suspendida cambia la contraseña pero no levanta la suspensión; recuperar la de una cuenta inactiva la reactiva.

---

## Reactivación de Cuenta

- El sistema debe permitir que quien tiene la cuenta inactiva la reactive desde el inicio de sesión: al escribir bien su usuario y contraseña, ve la pantalla "Tu cuenta está inactiva" ("Pasaron más de 3 meses sin que ingresaras, así que la dejamos en pausa. Tus datos y tus pedidos están a salvo.") con tres salidas: "Reactivar mi cuenta" (la deja entrar en el acto, con el aviso "Cuenta reactivada. ¡Qué bueno verte de nuevo!"), "Contactar a Soporte" y "Volver a ingresar". Si la persona es un Dueño, la pantalla le informa qué pasa con cada comercio ("{nombre} vuelve a estar disponible." o "{nombre} sigue suspendido. Si creés que es un error, escribinos.").
- La contraseña escrita en el inicio de sesión no se guarda en ningún lado (ni almacenamiento del navegador ni dirección): vive solo en memoria mientras la pantalla está abierta.
- También reactivan la cuenta "¿Olvidaste tu contraseña?" (recuperar la contraseña) y el Administrador desde la ficha de la persona. La reactivación por código enviado por email existe en el servidor pero la pantalla ya no la ofrece.
- Tres intentos de contraseña incorrecta en una cuenta inactiva la dejan a la espera de recuperar la contraseña, sin cambiar de estado.
- Al reactivar, el estado del usuario pasa a Activo, se renueva su último acceso y, si es un Dueño, sus comercios inactivos vuelven al estado que tenían (Apto para Venta o Aprobado, según la cuenta de MercadoPago y los documentos).

---

## Gestión de Contraseña

- El sistema debe permitir el cambio de contraseña desde el perfil autenticado, requiriendo la contraseña actual como validación.
- Todas las contraseñas deben almacenarse hasheadas en la base de datos utilizando BCrypt.
- La nueva contraseña debe tener entre 8 y 72 caracteres, contener al menos una mayúscula, una minúscula y un número, y ser distinta a la contraseña anterior.

---

## Estados de Usuario

El sistema gestiona cinco estados posibles para todos los roles:

- **Pendiente:** usuario registrado que aún no verificó su email.
- **Activo:** usuario con email verificado y sin restricciones.
- **Bloqueado:** usuario que agotó los intentos de inicio de sesión o de cambio de contraseña desde perfil. Reversible mediante recuperación de contraseña por email.
- **Suspendido:** estado aplicado exclusivamente por el Administrador, con un motivo de 10 a 500 caracteres que la persona ve. Es indefinido y prevalece sobre el bloqueo. Conlleva el cierre inmediato de todas las sesiones activas. Aplica a Clientes (Empleados incluidos) y a Dueños; no a Administradores ni a uno mismo. Mientras dura, la persona no opera (solo puede usar Soporte y "Mis consultas" con la sesión que tenía). Al levantarla, la cuenta vuelve al estado que tenía antes de la suspensión (una cuenta bloqueada vuelve activa). Se avisa dentro de la aplicación y por email, con un solo intento que el Administrador puede reenviar si falló.
- **Inactivo:** cuenta sin uso durante 3 meses calendario (configurable), que el sistema inactiva sola, una vez por día, sin aviso previo. Excepciones: el Administrador, las cuentas suspendidas, pendientes de verificar o bloqueadas, y toda cuenta con un pedido en curso (como comprador o, si es Dueño, en cualquiera de sus comercios). Un Dueño cuenta como activo si alguno de sus comercios recibió un pedido en los últimos 3 meses. Al inactivar a un Dueño, sus comercios aprobados, aptos para vender o cerrados temporalmente pasan a Inactivo (salen del catálogo y no reciben pedidos); los suspendidos por separado siguen suspendidos. La persona recibe un email una sola vez. Conlleva el cierre de sesiones. Es reversible (ver Reactivación de Cuenta). El proceso trata como máximo 200 cuentas por corrida, cada una en su propia transacción.

El rol Administrador no es susceptible de inactivación automática ni de suspensión. Solo puede estar en estado Activo o Bloqueado.

---

## Registro de Actividad

- El sistema debe registrar la fecha y hora del último acceso exitoso de cada usuario en el campo `fecha_ultimo_acceso` de la tabla Usuario, actualizándolo en cada inicio de sesión exitoso.
- Este campo es la referencia utilizada por el sistema para determinar si un usuario califica para inactivación automática por los 3 meses sin actividad (ver Estados de Usuario).

---

## Gestión de Direcciones

- La entidad Dirección es independiente y se relaciona con los usuarios según el rol:
  - **Cliente:** relación 1:N. Un cliente puede tener una o más direcciones de entrega. Una de ellas es designada como dirección principal. Al registrarse, el cliente debe ingresar obligatoriamente su primera dirección, que queda automáticamente como principal.
  - **Comercio:** relación 1:1. Un comercio tiene una única dirección operativa registrada al momento de su alta. El domicilio fiscal es un dato propio del Dueño (persona jurídica), independiente de esta relación.
- El cliente puede agregar, editar, eliminar y cambiar su dirección principal desde su perfil autenticado en cualquier momento posterior al registro, con un máximo de 5 direcciones activas, una sola predeterminada y baja lógica. No puede eliminar su última dirección activa; si elimina la predeterminada, pasa a serlo la más reciente (ver Requisitos Funcionales — Cliente). El pedido a domicilio guarda una copia de la dirección elegida.
- Toda Dirección debe estar asociada a una Localidad (`localidad_id`), de la cual se deriva su Provincia mediante la relación Localidad → Provincia. Las direcciones nuevas o editadas (de Clientes y de Comercios) solo admiten las localidades habilitadas: Río Grande, Ushuaia y Tolhuin, en la provincia de Tierra del Fuego. Los formularios muestran solo esas localidades; otra localidad existente se rechaza con "Esa localidad todavía no está disponible". Las direcciones anteriores en otras localidades se siguen leyendo.

---

## Catálogo Geográfico (Provincia / Localidad)

- El sistema debe contar con las entidades `Provincia` y `Localidad` como catálogo de referencia, precargadas en base de datos a partir de la API Georef (georef-ar-api, datos.gob.ar), que cubre todo el país previendo una expansión futura (la operación se limita a las localidades habilitadas: ver Gestión de Direcciones). Tolhuin, que Georef no trae como localidad, se carga con una migración:
  - `Provincia`: `id` (código oficial), `nombre`.
  - `Localidad`: `id` (código oficial), `nombre`, `provincia_id` (FK a `Provincia`).
- La carga del catálogo se realiza mediante un proceso de ETL ejecutado como tarea de configuración inicial del sistema, no como una operación disponible para ningún rol en tiempo de ejecución. Su actualización ante eventuales altas de localidades por parte de Georef es manual/periódica y queda fuera del flujo operativo del sistema.

---

## Gestión de Foto de Perfil

- Todo usuario debe poder cargar y editar una foto de perfil personal desde su cuenta
  autenticada, almacenada en Cloudinary (campo `Usuario.foto_perfil_url`). Es opcional
  para los cuatro roles: Cliente, Dueño, Empleado y Administrador. Es un dato de
  identidad de la persona, sin relación con ningún comercio puntual.
- Esta foto de perfil personal es independiente de la foto de perfil de cada comercio
  (campo `Comercio.foto_perfil_url`, obligatoria — ver Requisitos Funcionales —
  Comercio). Un Dueño con varios comercios tiene una única foto personal, pero cada
  comercio conserva su propia foto de negocio.

## Gestión de Tokens (Arquitectura)

Los códigos de verificación, recuperación de contraseña y reactivación de cuenta (tres tipos, siempre un código numérico de 6 dígitos que la persona escribe a mano, sin enlaces) se gestionan en una única tabla `Token` discriminada por tipo. Las invitaciones de Empleado no usan esa tabla: viven en `InvitacionEmpleado` (planificado, tramo E1), porque el invitado puede no tener cuenta y `Token.usuario_id` es obligatorio. El valor `INVITACION_EMPLEADO` del ENUM `TipoToken` existe en la base pero no se usa. Estructura:

- `id`, `id_usuario`, `tipo` (VERIFICACION_EMAIL / RECUPERACION_PASSWORD / REACTIVACION_CUENTA), `token` (código de 6 dígitos), `fecha_creacion`, `fecha_vencimiento`, `fecha_uso`, `estado` (PENDIENTE / UTILIZADO / EXPIRADO).

Un token solo es válido si existe en BD, no fue utilizado (estado = PENDIENTE) y no venció (fecha_vencimiento > NOW()). El tipo de token valida que no pueda usarse para una acción distinta a la prevista. Cada código admite hasta 5 intentos fallidos.

---

## Ayuda, Soporte y Páginas Legales

- Los Términos y Condiciones, la Política de Privacidad y las Preguntas frecuentes (versión 1.0, 6 de noviembre de 2026) son páginas públicas, accesibles sin sesión y enlazadas desde el ingreso, el registro y Soporte. En las pantallas de acceso de escritorio los enlaces están al pie de la columna blanca. Su revisión por un profesional queda fuera del alcance del proyecto.
- Cliente, Dueño y Empleado tienen una pantalla "Ayuda" en su perfil con Preguntas frecuentes, Escribir a Soporte, Mis consultas a Soporte, Términos y condiciones y Política de privacidad. El Administrador no la tiene.
- Toda persona puede escribirle a Soporte, con o sin sesión y también con la cuenta suspendida. Sin sesión, la persona recibe un código de consulta y entra a la conversación con su email y ese código. La conversación es por turnos (habla primero la persona, cada mensaje pasa el turno) con un máximo de 20 mensajes; solo Soporte la cierra. Las consultas no se borran. Los tipos de consulta son: apelación de cuenta, apelación de comercio, no puedo entrar, comercio rechazado por documentos o cobros, y otra consulta. Límites: 3 consultas por día y 3 abiertas a la vez por email, 10 por día por IP, 30 accesos fallidos por hora por email y 10 por IP, y 3 reenvíos de códigos por hora.
- Los emails de Soporte (recepción de la consulta, respuesta y reenvío de códigos) se envían una sola vez, sin reintentos automáticos.

---

## Interfaz y Accesibilidad Transversales

- La interfaz se diseña primero para móvil y se adapta a escritorio a partir de 1024 px (con un único punto de corte). Cliente, Comercio (Dueño y Empleado) y Administrador tienen composición de escritorio propia; la versión móvil mantiene todas las funciones.
- Toda acción que modifica datos y termina bien se confirma con un aviso breve; las confirmaciones de acciones destructivas o irreversibles se comportan igual en toda la aplicación (ver Requisitos No Funcionales).
