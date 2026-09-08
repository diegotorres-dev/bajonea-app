flowchart LR
    CLIENTE["Cliente"]
    DUENO["Dueño"]
    EMPLEADO["Empleado"]
    ADMIN["Administrador"]
    MP["MercadoPago"]

    SISTEMA(("App Bajoneá"))

    CLIENTE  -- "Registro, sesión,\npedidos y reclamos"      --> SISTEMA
    SISTEMA  -- "Comercios, menús,\nnotificaciones y estados" --> CLIENTE

    DUENO    -- "Datos fiscales, comercios,\nempleados y Mercado Pago" --> SISTEMA
    SISTEMA  -- "Aprobaciones, notificaciones\ny estado de sus comercios" --> DUENO

    EMPLEADO -- "Gestión de productos\ny pedidos del comercio asignado" --> SISTEMA
    SISTEMA  -- "Pedidos entrantes\ny notificaciones" --> EMPLEADO

    ADMIN    -- "Gestión de comercios,\nusuarios, catálogo y tarifas" --> SISTEMA
    SISTEMA  -- "Solicitudes, listados\ny reclamos pendientes"  --> ADMIN

    MP       -- "Webhook de pago\ny confirmación de reembolso" --> SISTEMA
    SISTEMA  -- "Solicitud de cobro\ny reembolso"               --> MP
