# Requisitos Funcionales — Dueño

Requisitos de identidad de cuenta, datos fiscales, medio de cobro y administración de
la relación con Empleados y con los distintos comercios que un mismo Dueño puede
operar. Los requisitos operativos del negocio en sí (productos, extras, pedidos,
horarios, redes sociales) están en Requisitos Funcionales — Comercio, ejecutables tanto
por el Dueño como por un Empleado autorizado.

---

## Registro y Datos Fiscales

- El sistema debe permitir el registro de un Dueño nuevo solicitando en un mismo flujo:
  los datos de la persona jurídica (razón social, CUIT, domicilio fiscal, condición
  frente al IVA, tipo de sociedad e inicio de actividades) y los datos de su primer
  comercio (ver Requisitos Funcionales — Comercio, sección Perfil del Negocio).
- Un Dueño que ya tiene una cuenta activa debe poder dar de alta un comercio adicional
  desde su panel sin volver a solicitar sus datos fiscales, ya cargados en su registro
  como persona jurídica.
- El Dueño debe poder cargar y editar su foto de perfil personal desde su cuenta
  autenticada. Es opcional y es un dato de identidad de la persona, independiente de
  la foto de perfil de cada comercio que administra (que es obligatoria y propia de
  cada comercio — ver Requisitos Funcionales — Comercio).
- Todo comercio registrado por un Dueño queda en estado Pendiente hasta ser aprobado de
  forma individual por el Administrador, incluso si el Dueño ya tiene otros comercios
  aprobados.
- Un comercio rechazado puede solicitar una revisión de su solicitud desde el panel del
  Dueño, pudiendo editar sus datos antes de reenviarla. Al hacerlo vuelve a estado
  Pendiente y el Administrador recibe una nueva notificación.
- Un Dueño con un comercio suspendido puede contactar al soporte desde su panel
  completando un formulario con su descargo. El Administrador recibe la solicitud y
  decide manualmente.

---

## Selector de Comercio Activo

- El panel del Dueño debe presentar un selector de "comercio activo" cuando administre
  más de un comercio, de forma que toda acción operativa (productos, extras, pedidos,
  horarios, redes sociales) se ejecute siempre sobre el comercio seleccionado en ese
  momento.

---

## Vinculación de Mercado Pago

- El Dueño debe vincular una única cuenta de MercadoPago mediante OAuth. Esta
  vinculación habilita el cobro en todos los comercios aprobados que administre; no se
  repite por cada comercio.
- Sin esta vinculación, ninguno de sus comercios puede recibir pagos ni pedidos, y
  ninguno aparece en el catálogo público.
- Al desvincular la cuenta, todos los comercios del Dueño quedan bloqueados para
  nuevos pedidos y desaparecen del catálogo hasta que se vuelva a vincular.
- El monto recibido en cada cobro refleja el total menos el cargo de servicio vía split
  de pagos (ver Requisitos Funcionales — Comercio, sección Gestión de Valores en
  Pedidos).

---

## Gestión de Empleados

- El Dueño, desde el panel de un comercio puntual, debe poder acceder a una sección
  "Mi equipo" para invitar personas a operar ese comercio como Empleado, ingresando su
  email.
- El sistema debe generar una invitación mediante un token de tipo
  `INVITACION_EMPLEADO`. Si el email ya corresponde a un Usuario existente en la
  plataforma (sea porque ya es Empleado en otro comercio, porque ya es Cliente, o
  cualquier otro rol), la invitación reutiliza ese Usuario: si aún no tiene registro de
  Empleado se lo crea, sin duplicar su identidad ni pedirle de nuevo datos que ya tiene
  cargados (nombre, apellido, DNI, contraseña); en cualquier caso se crea la relación
  con este comercio. Solo si el email no corresponde a ningún Usuario existente el
  sistema crea Usuario, PersonaFisica y Empleado desde cero.
- La relación queda en estado PENDIENTE hasta que el Empleado confirme su email (o el
  Dueño la active manualmente).
- El Dueño debe poder ver el listado de empleados de cada comercio con su estado
  (PENDIENTE, ACTIVO, DESACTIVADO).
- El Dueño debe poder pasar a DESACTIVADO la relación de un Empleado con un comercio
  puntual en cualquier momento, sin afectar las relaciones de ese Empleado con otros
  comercios, propios o de otros Dueños.

---

## Gestión de Múltiples Comercios

- El Dueño debe poder dar de alta comercios adicionales bajo su propia cuenta, cada uno
  con sus propios datos, horarios, productos, extras, redes sociales y equipo de
  empleados, sin límite de cantidad.
- El Dueño debe poder dar de baja o cerrar definitivamente un comercio puntual sin que
  esto afecte a sus demás comercios ni a su cuenta de MercadoPago vinculada.

---

## Permisos Exclusivos del Dueño

Las siguientes acciones no son delegables a un Empleado, aunque este tenga acceso
Activo al comercio:

- Editar los datos fiscales y de persona jurídica.
- Vincular o desvincular la cuenta de MercadoPago.
- Invitar, activar o desactivar Empleados.
- Dar de baja o cerrar definitivamente un comercio puntual.
- Crear comercios nuevos bajo su propio perfil de Dueño.
