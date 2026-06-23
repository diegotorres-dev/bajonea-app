# Objetivos

## Objetivo General

Desarrollar una aplicación para restaurantes y emprendimientos gastronómicos de la ciudad
de Río Grande, Tierra del Fuego, que centralice la recepción de pedidos y la visualización
de menús digitales, con el fin de agilizar la experiencia de compra del usuario y mejorar
la organización interna del comercio.

---

## Objetivos Específicos

### Gestión de usuarios y accesos

- Implementar un sistema de autenticación seguro que contemple el registro, verificación,
  recuperación y administración de cuentas para los distintos roles del sistema: Cliente,
  Comercio y Administrador, incluyendo mecanismos de bloqueo, reactivación y gestión
  de sesiones únicas por usuario.

### Experiencia del cliente

- Centralizar la experiencia de compra del cliente en una única plataforma, permitiéndole
  explorar comercios, visualizar menús, filtrar productos por categoría y preferencias
  alimentarias, y realizar pedidos sin necesidad de recurrir a canales externos.

- Ofrecer al cliente visibilidad y trazabilidad completa sobre el estado de sus pedidos,
  desde la confirmación del pago hasta la entrega o resolución, con notificaciones en
  tiempo real ante cada cambio de estado.

### Gestión operativa del comercio

- Brindar al comercio las herramientas necesarias para administrar su catálogo de
  productos y gestionar el ciclo completo de sus pedidos, contemplando tanto la modalidad
  de retiro en local como la de envío a domicilio, y diferenciando entre restaurantes
  y emprendimientos gastronómicos como tipos de comercio disponibles en la plataforma.

- Integrar un sistema de pagos con MercadoPago bajo el modelo Marketplace con split
  automático de cobros, que permita procesar transacciones de forma segura mediante
  confirmación por webhook, gestionar los casos de rechazo, expiración y anulación
  con sus correspondientes reembolsos.

### Supervisión administrativa

- Proveer al Administrador un módulo de control integral que le permita:
  - Supervisar y gestionar el alta, rechazo, suspensión y reactivación de comercios,
    asegurando la calidad y legitimidad de los participantes en la plataforma.
  - Gestionar la suspensión y reactivación de cuentas de clientes ante comportamientos
    que lo justifiquen.
  - Administrar el catálogo de categorías y tags disponibles para la clasificación
    de productos.
  - Configurar las tarifas de servicio de la plataforma (cargo al cliente y cargo al
    comercio), con registro histórico de cambios y aplicación inmediata a nuevos pedidos.
  - Resolver reclamos de clientes por pedidos no recibidos, con capacidad de aprobar
    reembolsos o rechazar solicitudes con justificación.

### Visibilidad y alcance

- Posicionar la plataforma como el punto de encuentro digital entre los comercios
  gastronómicos de Río Grande y sus clientes, mejorando la visibilidad de los negocios
  locales y facilitando el acceso a opciones adaptadas a distintas preferencias
  y necesidades alimentarias. Los comercios aparecen en el catálogo público desde el
  momento en que completan su configuración, incluyendo la vinculación de su cuenta
  de MercadoPago.

### Organización y toma de decisiones

- Reemplazar los procesos manuales de gestión por un sistema digital que permita a los
  comercios registrar, consultar y analizar la información de sus operaciones, sentando
  las bases para una toma de decisiones basada en datos. El sistema conserva el historial
  completo de pedidos, estados y acciones administrativas, garantizando la trazabilidad
  de toda la actividad de la plataforma.
