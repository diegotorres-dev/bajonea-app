# Requisitos Funcionales — Generales

Requisitos aplicables a todos los roles del sistema: Cliente, Comercio y Administrador.

---

## Autenticación

- El sistema debe permitir el inicio de sesión mediante email y contraseña.
- El sistema debe soportar tres roles de usuario: Cliente, Comercio y Administrador.
- El sistema debe bloquear la cuenta tras tres intentos fallidos consecutivos de inicio de sesión.
- El sistema debe bloquear la cuenta tras tres intentos fallidos de ingreso de contraseña actual en el flujo de cambio de contraseña desde perfil, invalidando la sesión activa.
- El sistema debe permitir únicamente una sesión activa por usuario a la vez.
- El sistema debe permitir el cierre de sesión manual por parte del usuario.

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

---

## Recuperación de Contraseña

- El sistema debe permitir recuperar la contraseña mediante un token enviado por email, con validez de 30 minutos.
- El flujo de recuperación de contraseña debe estar disponible tanto para usuarios en estado Activo como para usuarios en estado Bloqueado, ya que es el mecanismo principal de desbloqueo de cuenta.
- El sistema debe registrar el estado del token, su fecha de creación, uso y vencimiento.
- Al utilizar el token exitosamente, la contraseña se actualiza, el estado del usuario se restablece a Activo, el contador de intentos fallidos se pone en cero, y todas las sesiones activas se cierran forzadamente.
- Si el usuario que recuperó la contraseña tiene rol Comercio y su comercio estaba en estado Cerrado Temporalmente, el sistema debe restaurar automáticamente el estado del comercio a Aprobado al completar el reset.

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
  - **Comercio:** relación 1:1. Un comercio tiene una única dirección fiscal/operativa registrada al momento del registro.
- El cliente puede agregar, editar, eliminar y cambiar su dirección principal desde su perfil autenticado en cualquier momento posterior al registro. No puede eliminar la dirección principal si es la única registrada.
- Toda Dirección debe estar asociada a una Localidad (`localidad_id`), de la cual se deriva su Provincia mediante la relación Localidad → Provincia. El formulario de alta/edición de dirección presenta un selector de Provincia y un selector dependiente de Localidad (filtrado por la provincia seleccionada), cubriendo la totalidad del territorio nacional.

---

## Catálogo Geográfico (Provincia / Localidad)

- El sistema debe contar con las entidades `Provincia` y `Localidad` como catálogo de referencia, precargadas en base de datos a partir de la API Georef (georef-ar-api, datos.gob.ar):
  - `Provincia`: `id` (código oficial), `nombre`.
  - `Localidad`: `id` (código oficial), `nombre`, `provincia_id` (FK a `Provincia`).
- La carga del catálogo se realiza mediante un proceso de ETL ejecutado como tarea de configuración inicial del sistema, no como una operación disponible para ningún rol en tiempo de ejecución. Su actualización ante eventuales altas de localidades por parte de Georef es manual/periódica y queda fuera del flujo operativo del sistema.

---

## Gestión de Tokens (Arquitectura)

Los tokens de verificación, recuperación de contraseña y reactivación de cuenta se gestionan en una única tabla `Token` discriminada por tipo. Estructura:

- `id`, `id_usuario`, `tipo` (VERIFICACION_EMAIL / RECUPERACION_PASSWORD / REACTIVACION_CUENTA), `token` (UUID), `fecha_creacion`, `fecha_vencimiento`, `fecha_uso`, `estado` (PENDIENTE / UTILIZADO / EXPIRADO).

Un token solo es válido si existe en BD, no fue utilizado (estado = PENDIENTE) y no venció (fecha_vencimiento > NOW()). El tipo de token valida que no pueda usarse para una acción distinta a la prevista.
