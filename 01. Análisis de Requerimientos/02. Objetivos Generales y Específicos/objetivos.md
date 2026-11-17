# Objetivos

## Objetivo General

Desarrollar una aplicación para restaurantes y emprendimientos gastronómicos de Tierra del
Fuego (Río Grande, Ushuaia y Tolhuin), que centralice la recepción de pedidos y la visualización
de menús digitales, con el fin de agilizar la experiencia de compra del usuario y mejorar
la organización interna del comercio.

---

## Objetivos Específicos

### Gestión de usuarios y accesos

- Implementar un sistema de autenticación seguro que contemple el registro, verificación,
  recuperación y administración de cuentas para los distintos roles del sistema: Cliente,
  Dueño, Empleado y Administrador, incluyendo mecanismos de bloqueo, suspensión, inactivación automática por falta de
  uso, reactivación y gestión de sesiones únicas por usuario.

- Ofrecer a cualquier persona, con o sin sesión y también con la cuenta suspendida, un
  canal de Soporte por conversación con el equipo de la plataforma, junto con las
  preguntas frecuentes, los Términos y Condiciones y la Política de Privacidad
  accesibles dentro de la aplicación.

- Permitir que todo usuario cargue una foto de perfil personal desde su cuenta,
  opcional para los cuatro roles, y que cada comercio cargue su propia foto de perfil
  de negocio (obligatoria), independiente de la foto personal de su Dueño.

### Experiencia del cliente

- Centralizar la experiencia de compra del cliente en una única plataforma, permitiéndole
  explorar comercios, visualizar menús, filtrar productos por categoría y preferencias
  alimentarias, y realizar pedidos sin necesidad de recurrir a canales externos.

- Ofrecer al cliente visibilidad y trazabilidad completa sobre el estado de sus pedidos,
  desde la confirmación del pago hasta la entrega o resolución, con avisos dentro de la
  aplicación ante cada cambio de estado, y la posibilidad de gestionar varias direcciones
  de entrega y de reclamar, con fotos, un pedido entregado que llegó mal o no llegó.

### Gestión operativa del comercio

- Brindar al comercio las herramientas necesarias para administrar su catálogo de
  productos y gestionar el ciclo completo de sus pedidos, contemplando tanto la modalidad
  de retiro en local como la de envío a domicilio, y clasificando cada comercio según su
  rubro gastronómico (restaurante, rotisería, heladería, panadería, hamburguesería, entre
  otros tipos disponibles en la plataforma), y mostrándole el resultado de cada turno de
  atención (lo vendido, la comisión y el neto) en el panel, por email al cerrar el turno y
  en estadísticas de los últimos 7 o 30 días.

- Permitir que un mismo dueño administre uno o varios comercios bajo una única cuenta,
  y que pueda delegar la operación diaria de cada comercio (gestión de productos y
  pedidos) a Empleados con acceso propio, sin comprometer los datos fiscales ni las
  decisiones exclusivas del dueño.

- Permitir que cada comercio publique enlaces a sus redes sociales y canales de contacto
  directo (Instagram, WhatsApp, sitio web, entre otros) para reforzar su presencia
  digital. Los extras de producto (agregados o variantes de un plato) fueron descartados
  del alcance de esta versión.

- Exigir a cada comercio documentación de habilitación (libreta sanitaria, carnet de
  manipulación de alimentos, habilitación comercial u otra), revisada por el
  Administrador, como condición para aparecer en el catálogo y recibir pedidos.

- Integrar un sistema de pagos con MercadoPago bajo el modelo Marketplace con split
  automático de cobros, que permita procesar transacciones de forma segura mediante
  confirmación por webhook, gestionar los casos de rechazo, expiración y anulación
  con sus correspondientes reembolsos.

### Supervisión administrativa

- Proveer al Administrador un módulo de control integral que le permita:
  - Supervisar y gestionar el alta, rechazo, suspensión y reactivación de comercios,
    asegurando la calidad y legitimidad de los participantes en la plataforma, y revisar
    la documentación de habilitación de cada comercio.
  - Gestionar la suspensión y reactivación de cuentas de clientes y de dueños (con su
    efecto sobre los comercios y los pedidos en curso) ante comportamientos que lo
    justifiquen, y reactivar las cuentas inactivadas por falta de uso.
  - Atender las consultas de Soporte de los usuarios.
  - Administrar el catálogo de categorías y tags disponibles para la clasificación
    de productos.
  - Configurar las tarifas de servicio de la plataforma (cargo al cliente y cargo al
    comercio), con registro histórico de cambios y aplicación inmediata a nuevos pedidos.
  - Resolver reclamos de clientes sobre pedidos entregados (no recibidos, incompletos,
    equivocados o en mal estado), con capacidad de aprobar reembolsos totales o
    parciales o rechazar solicitudes con justificación, y supervisar los reembolsos
    pendientes de revisión.

### Visibilidad y alcance

- Posicionar la plataforma como el punto de encuentro digital entre los comercios
  gastronómicos de Tierra del Fuego y sus clientes, mejorando la visibilidad de los negocios
  locales y facilitando el acceso a opciones adaptadas a distintas preferencias
  y necesidades alimentarias. Los comercios aparecen en el catálogo público desde el
  momento en que completan su configuración, incluyendo la vinculación de la cuenta
  de MercadoPago de su dueño y la aprobación de su documentación.

### Organización y toma de decisiones

- Reemplazar los procesos manuales de gestión por un sistema digital que permita a los
  comercios registrar, consultar y analizar la información de sus operaciones, sentando
  las bases para una toma de decisiones basada en datos. El sistema conserva el historial
  completo de pedidos, estados y acciones administrativas, garantizando la trazabilidad
  de toda la actividad de la plataforma.