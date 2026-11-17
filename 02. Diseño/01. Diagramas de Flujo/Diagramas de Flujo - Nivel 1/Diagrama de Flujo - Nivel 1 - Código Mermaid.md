flowchart LR
    %% ── Entidades Externas ───────────────────────────────
    VISITANTE[Visitante<br>sin sesión]
    CLIENTE[Cliente]
    DUENO[Dueño]
    EMPLEADO[Empleado]
    ADMIN[Administrador]
    MP[MercadoPago]

    %% ── Sistema Bajoneá ──────────────────────────────────
    subgraph Bajoneá
        P1([P1<br>Usuarios y<br>Sesiones])
        P2([P2<br>Comercios y<br>Catálogo])
        P3([P3<br>Exploración<br>y Menús])
        P4([P4<br>Pedidos y<br>Carrito])
        P5([P5<br>Procesamiento<br>de Pagos])
        P6([P6<br>Notificaciones])
        P7([P7<br>Automatismos y<br>Configuración])
        P8([P8<br>Soporte])
    end

    %% ── Interacciones del Visitante ──────────────────────
    VISITANTE -- Consulta sin sesión\ny código de acceso --> P8
    P8 -- Código de consulta\ny respuestas --> VISITANTE

    %% ── Interacciones del Cliente ────────────────────────
    CLIENTE -- Registro, credenciales,\ndirecciones y reactivación --> P1
    P1 -- Códigos, confirmación,\nvista previa de reactivación\ny estado de cuenta --> CLIENTE

    CLIENTE -- Búsqueda y filtros --> P3
    P3 -- Comercios y menús --> CLIENTE

    CLIENTE -- Carrito, pedidos,\ncancelaciones y reclamos con fotos --> P4
    P4 -- Detalle, estados\ny resolución de reclamos --> CLIENTE

    CLIENTE -- Consultas a Soporte --> P8
    P8 -- Respuestas\nde Soporte --> CLIENTE

    %% ── Interacciones del Dueño ───────────────────────────
    DUENO -- Registro, credenciales,\nfoto personal y datos fiscales --> P1
    P1 -- Códigos y confirmación\nde cuenta --> DUENO

    DUENO -- Invitar, activar\ny desactivar empleados --> P1
    P1 -- Estado de invitaciones\nde empleados --> DUENO

    DUENO -- Datos de sus comercios, productos,\nhorarios, redes sociales\ny documentos de habilitación --> P2
    P2 -- Estado de aprobación, aptitud para vender,\nestado de documentos e historial --> DUENO

    DUENO -- Gestión de pedidos\nde sus comercios --> P4
    P4 -- Pedidos entrantes, reclamos\ny ventas por turno --> DUENO

    DUENO -- Vinculación OAuth\nde Mercado Pago --> P5
    P5 -- Confirmación de vinculación --> DUENO

    DUENO -- Consultas a Soporte --> P8
    P8 -- Respuestas\nde Soporte --> DUENO

    %% ── Interacciones del Empleado ────────────────────────
    EMPLEADO -- Aceptar invitación\ny credenciales --> P1
    P1 -- Códigos y confirmación\nde alta --> EMPLEADO

    EMPLEADO -- Productos, horarios\ny redes sociales de comercios asignados --> P2
    P2 -- Comercios asignados\ny su estado --> EMPLEADO

    EMPLEADO -- Gestión de pedidos\nde comercios asignados --> P4
    P4 -- Pedidos entrantes --> EMPLEADO

    EMPLEADO -- Consultas a Soporte --> P8
    P8 -- Respuestas\nde Soporte --> EMPLEADO

    %% ── Interacciones del Administrador ──────────────────
    ADMIN -- Credenciales --> P1
    ADMIN -- Gestión de cuentas\n(suspensión y levantamiento\nde Clientes y Dueños) --> P1
    P1 -- Listados de Clientes\ny Dueños --> ADMIN

    ADMIN -- Aprobaciones, rechazos, suspensiones,\nrevisión de documentos y catálogo --> P2
    P2 -- Solicitudes pendientes, documentos\npor revisar, listados y re-solicitudes --> ADMIN

    ADMIN -- Resolución de reclamos\n(total, parcial o rechazo) --> P4
    P4 -- Reclamos pendientes\ny fotos adjuntas --> ADMIN

    ADMIN -- Configuración de tarifas --> P7
    P7 -- Historial de tarifas --> ADMIN

    ADMIN -- Respuestas y cierre\nde consultas --> P8
    P8 -- Bandeja de consultas\ny conversaciones --> ADMIN

    %% ── Interacciones de MercadoPago ─────────────────────
    MP -- Webhook de pago\ny estado de reembolso --> P5
    P5 -- Solicitud de cobro,\nsplit y reembolso --> MP

    %% ── Flujos internos: Pagos ───────────────────────────
    P4 -- Solicitud de pago\n(PENDIENTE_PAGO) --> P5
    P5 -- Confirmación de pago\no rechazo vía webhook --> P4
    P4 -- Solicitud de reembolso --> P5
    P5 -- Resultado de reembolso --> P4

    %% ── Flujos internos: Catálogo y Exploración ──────────
    P2 -- Productos activos\ny comercios disponibles --> P3

    %% ── Flujos internos: Notificaciones ──────────────────
    P4 -- Eventos de pedido,\npago y reclamo --> P6
    P2 -- Eventos de comercio y documentos\n(aprobación, suspensión, aptitud) --> P6
    P1 -- Eventos de usuario\n(suspensión, inactivación, invitación) --> P6
    P7 -- Eventos de automatismo\n(vencimientos, cierre de turno) --> P6
    P8 -- Respuesta de Soporte --> P6

    P6 -- Avisos en la app\ny email --> CLIENTE
    P6 -- Avisos en la app\ny email --> DUENO
    P6 -- Avisos en la app\ny email --> EMPLEADO
    P6 -- Email de respuesta\ny de código --> VISITANTE

    %% ── Flujos internos: Automatismos ────────────────────
    P7 -- Vencimiento de PENDIENTE_PAGO (30 min),\nde PENDIENTE_CONFIRMACION_COMERCIO (30 min)\ny autoconfirmación de EN_CAMINO (90 min) --> P4
    P7 -- Rechazo, cancelación y cierre\nde pedidos por suspensión del comercio --> P4
    P7 -- Inactivación automática de cuentas\n(3 meses sin uso) --> P1
    P7 -- Propagación de estado\nDueño → sus comercios --> P2
    P7 -- Cierre de turno\ny email de resumen --> P2
    P7 -- Tarifa vigente\nal crear pedido --> P4
    P4 -- Tarifas almacenadas\nen pedidos históricos --> P7
