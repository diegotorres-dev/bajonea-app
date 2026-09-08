# Requisitos Funcionales — Empleado

Requisitos del rol Empleado: cuenta con login propio que opera, con permisos acotados,
uno o varios comercios en representación de sus respectivos Dueños.

---

## Invitación y Alta

- El Empleado accede a la plataforma a partir de una invitación enviada por un Dueño
  (ver Requisitos Funcionales — Dueño, sección Gestión de Empleados) mediante un token
  de tipo `INVITACION_EMPLEADO`.
- Si es la primera vez que la persona es invitada como Empleado en la plataforma y su
  email no corresponde a ningún Usuario existente, el sistema crea su Usuario, su
  PersonaFisica y su registro de Empleado al aceptar la invitación, junto con su
  contraseña de acceso.
- Si el email invitado ya corresponde a un Usuario existente en la plataforma (ya sea
  porque ya es Empleado en otro comercio, porque ya es Cliente, o cualquier otro rol),
  aceptar la invitación reutiliza esa cuenta: agrega el registro de Empleado si todavía
  no lo tiene y la relación con el nuevo comercio, sin crear una identidad duplicada ni
  pedir de nuevo datos ya cargados (nombre, apellido, DNI, contraseña).
- La relación entre el Empleado y un comercio queda en estado PENDIENTE hasta que
  confirme su email (o el Dueño la active manualmente), y pasa a ACTIVO al confirmarse.

---

## Acceso a Comercios

- El Empleado debe poder operar, con su mismo login, todos los comercios donde tenga
  una relación en estado ACTIVO, sin restricción de que pertenezcan al mismo Dueño.
- El panel del Empleado debe presentar un selector de comercio cuando tenga acceso a
  más de uno, de forma equivalente al selector de comercio activo del Dueño.
- Al desactivarse su relación con un comercio puntual (estado DESACTIVADO), el Empleado
  pierde acceso a ese comercio sin que se vean afectadas sus relaciones activas con
  otros comercios.

---

## Permisos Delegados

Por cada comercio donde el Empleado tenga una relación en estado ACTIVO, puede:

- Crear, editar y gestionar la disponibilidad de productos (y sus grupos de extras y
  extras asociados).
- Ver y gestionar los pedidos entrantes: aceptar, rechazar, cambiar de estado.
- Ver el historial y las ventas del comercio.
- Cerrar y abrir el comercio manualmente.
- Editar los datos y horarios del comercio, y sus enlaces a redes sociales.

---

## Restricciones

El Empleado no tiene acceso, en ningún comercio, a las acciones exclusivas del Dueño
(ver Requisitos Funcionales — Dueño, sección Permisos Exclusivos del Dueño):

- No puede ver ni editar los datos fiscales o de persona jurídica del Dueño.
- No puede vincular ni desvincular la cuenta de MercadoPago.
- No puede invitar, activar ni desactivar a otros Empleados.
- No puede dar de baja o cerrar definitivamente un comercio, ni crear comercios nuevos.

---

## Sesiones

- Cada Empleado es un Usuario independiente con su propio login. Dos Empleados
  operando comercios distintos en simultáneo son sesiones de usuarios distintos: la
  regla general de "un nuevo login invalida las sesiones previas del mismo usuario" se
  aplica sin cambios, ya que nunca hay dos logins compartiendo un mismo Usuario.
- Si ese mismo Usuario también tiene registro de Cliente (rol combinado Cliente +
  Empleado), sigue siendo un único Usuario con un único login y una única sesión: al
  iniciar sesión, el sistema presenta un selector de contexto activo para elegir entre
  operar como Cliente o como Empleado de un comercio puntual (ver Requisitos
  Funcionales — Generales, sección Autenticación).
