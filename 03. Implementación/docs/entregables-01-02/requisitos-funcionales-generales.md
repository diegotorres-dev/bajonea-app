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

> **Estado de implementación:** planificado, tramo E2 (ver `docs/DECISIONES.md`, 2026-10-05).

- Al iniciar sesión, si la cuenta tiene más de un contexto (Cliente y uno o más
  comercios), el sistema recuerda el último contexto elegido por esa persona y entra
  directo a él. El selector aparece la primera vez, o cuando el último contexto ya no es
  válido (por ejemplo, la relación con el comercio se desactivó). Se puede cambiar de
  contexto desde el perfil, sin cerrar sesión.
- Un Empleado con un solo comercio entra directo a ese comercio. Con varios comercios usa
  el mismo panel y la misma franja de selección que el Dueño, sin la opción "Agregar
  comercio" ni los avisos de cobro.
- Al iniciar sesión en otro dispositivo, la sesión única cierra la sesión anterior en
  ambos contextos; el selector lo comunica.
- Si a un Empleado se le desactiva su última relación, su próxima acción sobre ese
  comercio lo lleva al selector; si no le queda ningún comercio ve "Ya no tenés acceso a
  ningún comercio" con el botón "Entrar como Cliente". Su sesión no se cierra.
- Entrada para quien fue invitado como Empleado: el login ofrece el botón "Tengo una
  invitación", y el registro una línea que lleva a la misma pantalla (ver Requisitos
  Funcionales — Empleado). No existe un registro propio de Empleado.

---

## Nombre de Usuario

- Todo usuario tiene un nombre de usuario, que es su credencial de login. Debe tener entre 8 y 20 caracteres, solo letras y números (sin espacios ni símbolos) y al menos una letra.
- El sistema debe normalizar el nombre de usuario a minúsculas al guardarlo y al mostrarlo, y debe garantizar que sea único en toda la plataforma sin importar el rol, incluso a nivel de base de datos.
- El sistema debe rechazar una lista de nombres reservados (por ejemplo "administrador", "bajonea", "soporte"), comparados de forma exacta.
- El nombre de usuario se solicita en el registro de Cliente y en el registro de Dueño. El de Administrador se crea junto con su cuenta sembrada. El Empleado no tiene un alta propia: si la persona no tiene cuenta, la crea al aceptar una invitación (con los mismos datos que el registro de Cliente, incluido el nombre de usuario); si ya tiene cuenta, conserva su nombre de usuario. Planificado, tramo E1.
- Los formularios de registro deben informar en vivo si un nombre de usuario está disponible, mediante un endpoint público de consulta de disponibilidad.
- Ante credenciales inválidas en el login, el sistema debe mostrar un mensaje genérico ("Usuario o contraseña incorrectos") que no distinga entre un usuario inexistente y una contraseña incorrecta. En el registro y en la consulta de disponibilidad sí se informa si un nombre de usuario ya está en uso.
- El identificador que viaja en el token de sesión es el id del usuario, no su nombre de usuario ni su email; por eso un cambio de nombre de usuario no invalida las sesiones existentes.

---

## Gestión de Sesiones

- El sistema debe registrar por sesión: usuario, estado, fechas de inicio y cierre, tipo de cierre (manual, automático o forzado), IP de origen, navegador y dispositivo.
- El sistema debe actualizar el campo `fecha_ultimo_acceso` del usuario en cada inicio de sesión exitoso.

---

## Verificación de Cuenta

- Todo usuario debe verificar su dirección de email para acceder a todas las funcionalidades del sistema.
- El sistema debe generar un token único de verificación con fecha de creación, uso y vencimiento de 24 horas, registrando si fue utilizado.
- Un usuario sin email verificado permanece en estado Pendiente.
- Ante token expirado o inválido, el sistema debe permitir reenviar la verificación.
- La pantalla de verificación debe funcionar tanto cuando se llega con el email en la dirección (flujo normal posterior al registro) como cuando se llega sin él (por ejemplo desde el aviso de "cuenta no verificada" del login, que no tiene el email a mano); en este segundo caso el sistema debe pedir el email como paso previo.

---

## Recuperación de Contraseña

- El sistema debe permitir recuperar la contraseña mediante un token enviado por email, con validez de 30 minutos.
- El flujo de recuperación de contraseña debe estar disponible tanto para usuarios en estado Activo como para usuarios en estado Bloqueado, ya que es el mecanismo principal de desbloqueo de cuenta.
- El sistema debe registrar el estado del token, su fecha de creación, uso y vencimiento.
- Al utilizar el token exitosamente, la contraseña se actualiza, el estado del usuario se restablece a Activo, el contador de intentos fallidos se pone en cero, y todas las sesiones activas se cierran forzadamente.
- Si el usuario que recuperó la contraseña tiene rol Dueño, el sistema debe restaurar automáticamente a Aprobado el estado de todos sus comercios que estuvieran en Cerrado Temporalmente al completar el reset.

---

## Reactivación de Cuenta

- El sistema debe permitir al usuario con estado Inactivo solicitar la reactivación de su cuenta desde el formulario de inicio de sesión.
- El sistema debe generar un token de reactivación enviado por email, con validez de 24 horas.
- Al utilizar el token, el sistema debe actualizar el estado del usuario a Activo.

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
- **Suspendido:** estado aplicado exclusivamente por el Administrador. Conlleva invalidación inmediata de todas las sesiones activas.
- **Inactivo:** usuario sin actividad durante 3 meses. Reversible mediante token de reactivación enviado por email. Conlleva invalidación de sesiones activas.

El rol Administrador no es susceptible de inactivación automática. Solo puede estar en estado Activo o Bloqueado.

---

## Registro de Actividad

- El sistema debe registrar la fecha y hora del último acceso exitoso de cada usuario en el campo `fecha_ultimo_acceso` de la tabla Usuario, actualizándolo en cada inicio de sesión exitoso.
- Este campo es la referencia utilizada por el sistema para determinar si un usuario califica para inactivación automática por los 3 meses sin actividad.

---

## Gestión de Direcciones

- La entidad Dirección es independiente y se relaciona con los usuarios según el rol:
  - **Cliente:** relación 1:N. Un cliente puede tener una o más direcciones de entrega. Una de ellas es designada como dirección principal. Al registrarse, el cliente debe ingresar obligatoriamente su primera dirección, que queda automáticamente como principal.
  - **Comercio:** relación 1:1. Un comercio tiene una única dirección operativa registrada al momento de su alta. El domicilio fiscal es un dato propio del Dueño (persona jurídica), independiente de esta relación.
- El cliente puede agregar, editar, eliminar y cambiar su dirección principal desde su perfil autenticado en cualquier momento posterior al registro. No puede eliminar la dirección principal si es la única registrada.
- Toda Dirección debe estar asociada a una Localidad (`localidad_id`), de la cual se deriva su Provincia mediante la relación Localidad → Provincia. El formulario de alta/edición de dirección presenta un selector de Provincia y un selector dependiente de Localidad (filtrado por la provincia seleccionada), cubriendo la totalidad del territorio nacional.

---

## Catálogo Geográfico (Provincia / Localidad)

- El sistema debe contar con las entidades `Provincia` y `Localidad` como catálogo de referencia, precargadas en base de datos a partir de la API Georef (georef-ar-api, datos.gob.ar):
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

Los tokens de verificación, recuperación de contraseña y reactivación de cuenta se gestionan en una única tabla `Token` discriminada por tipo. Las invitaciones de Empleado no usan esa tabla: viven en `InvitacionEmpleado` (planificado, tramo E1), porque el invitado puede no tener cuenta y `Token.usuario_id` es obligatorio. El valor `INVITACION_EMPLEADO` del ENUM `TipoToken` existe en la base pero no se usa. Estructura:

- `id`, `id_usuario`, `tipo` (VERIFICACION_EMAIL / RECUPERACION_PASSWORD / REACTIVACION_CUENTA), `token` (UUID), `fecha_creacion`, `fecha_vencimiento`, `fecha_uso`, `estado` (PENDIENTE / UTILIZADO / EXPIRADO).

Un token solo es válido si existe en BD, no fue utilizado (estado = PENDIENTE) y no venció (fecha_vencimiento > NOW()). El tipo de token valida que no pueda usarse para una acción distinta a la prevista.
