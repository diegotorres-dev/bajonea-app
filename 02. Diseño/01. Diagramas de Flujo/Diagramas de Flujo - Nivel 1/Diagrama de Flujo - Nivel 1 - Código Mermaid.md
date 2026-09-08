flowchart LR
    %% ── Entidades Externas ───────────────────────────────
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
    end

    %% ── Interacciones del Cliente ────────────────────────
    CLIENTE -- Registro, credenciales\ny reactivación --> P1
    P1 -- Tokens, confirmación\ny estado de cuenta --> CLIENTE

    CLIENTE -- Búsqueda y filtros --> P3
    P3 -- Comercios y menús --> CLIENTE

    CLIENTE -- Carrito, extras,\npedidos y reclamos --> P4
    P4 -- Detalle, estados\ny reclamos --> CLIENTE

    %% ── Interacciones del Dueño ───────────────────────────
    DUENO -- Registro, credenciales,\nfoto personal y datos fiscales --> P1
    P1 -- Tokens y confirmación\nde cuenta --> DUENO

    DUENO -- Invitar, activar\ny desactivar empleados --> P1
    P1 -- Estado de invitaciones\nde empleados --> DUENO

    DUENO -- Datos de sus comercios,\nproductos, extras, horarios\ny redes sociales --> P2
    P2 -- Estado de aprobación,\nhistorial y comercios administrados --> DUENO

    DUENO -- Gestión de pedidos\nde sus comercios --> P4
    P4 -- Pedidos entrantes --> DUENO

    DUENO -- Vinculación OAuth\nde Mercado Pago --> P5
    P5 -- Confirmación de vinculación --> DUENO

    %% ── Interacciones del Empleado ────────────────────────
    EMPLEADO -- Aceptar invitación\ny credenciales --> P1
    P1 -- Tokens y confirmación\nde alta --> EMPLEADO

    EMPLEADO -- Productos, extras, horarios\ny redes sociales de comercios asignados --> P2
    P2 -- Comercios asignados\ny su estado --> EMPLEADO

    EMPLEADO -- Gestión de pedidos\nde comercios asignados --> P4
    P4 -- Pedidos entrantes --> EMPLEADO

    %% ── Interacciones del Administrador ──────────────────
    ADMIN -- Credenciales --> P1
    ADMIN -- Gestión de usuarios\n(suspensión y reactivación) --> P1

    ADMIN -- Aprobaciones, rechazos,\nsuspensiones y catálogo --> P2
    P2 -- Solicitudes pendientes,\nlistados y re-solicitudes --> ADMIN

    ADMIN -- Resolución de reclamos --> P4
    P4 -- Reclamos pendientes --> ADMIN

    ADMIN -- Configuración de tarifas --> P7
    P7 -- Historial de tarifas --> ADMIN

    %% ── Interacciones de MercadoPago ─────────────────────
    MP -- Webhook de pago\ny estado de reembolso --> P5
    P5 -- Solicitud de cobro,\nsplit y reembolso --> MP

    %% ── Flujos internos: Pagos ───────────────────────────
    P4 -- Solicitud de pago\n(PENDIENTE_PAGO) --> P5
    P5 -- Confirmación de pago\no rechazo vía webhook --> P4
    P4 -- Solicitud de reembolso --> P5
    P5 -- Resultado de reembolso --> P4

    %% ── Flujos internos: Catálogo y Exploración ──────────
    P2 -- Productos activos, extras\ny comercios disponibles --> P3

    %% ── Flujos internos: Notificaciones ──────────────────
    P4 -- Eventos de pedido,\npago y reclamo --> P6
    P2 -- Eventos de comercio\n(aprobación, suspensión) --> P6
    P1 -- Eventos de usuario\n(bloqueo, inactivación, invitación) --> P6
    P7 -- Eventos de automatismo\n(timeout, expiración) --> P6

    P6 -- Notificaciones push\ny email --> CLIENTE
    P6 -- Notificaciones push\ny email --> DUENO
    P6 -- Notificaciones push\ny email --> EMPLEADO
    P6 -- Notificaciones push --> ADMIN

    %% ── Flujos internos: Automatismos ────────────────────
    P7 -- Timeout PENDIENTE_PAGO\n(30 min) y PENDIENTE (1 h) --> P4
    P7 -- Reintento de reembolsos\nfallidos --> P5
    P7 -- Inactivación automática\nde usuarios (90 días) --> P1
    P7 -- Propagación de estado\nDueño → sus comercios --> P2
    P7 -- Tarifa vigente\nal crear pedido --> P4
    P4 -- Tarifas almacenadas\nen pedidos históricos --> P7
