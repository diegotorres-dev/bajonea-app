flowchart LR
    VISITANTE["Visitante\n(sin sesión)"]
    CLIENTE["Cliente"]
    DUENO["Dueño"]
    EMPLEADO["Empleado"]
    ADMIN["Administrador"]
    MP["MercadoPago"]

    SISTEMA(("App Bajoneá"))

    VISITANTE -- "Consultas a Soporte\ny acceso a su conversación" --> SISTEMA
    SISTEMA   -- "Código de consulta,\nrespuestas y términos públicos" --> VISITANTE

    CLIENTE  -- "Registro, sesión, direcciones,\npedidos, reclamos y consultas" --> SISTEMA
    SISTEMA  -- "Comercios, menús, avisos\ny estado de pedidos y reclamos" --> CLIENTE

    DUENO    -- "Datos fiscales, comercios, documentos,\nempleados y Mercado Pago" --> SISTEMA
    SISTEMA  -- "Aprobaciones, avisos, estadísticas\ny estado de sus comercios" --> DUENO

    EMPLEADO -- "Gestión de productos\ny pedidos del comercio asignado" --> SISTEMA
    SISTEMA  -- "Pedidos entrantes\ny avisos" --> EMPLEADO

    ADMIN    -- "Gestión de comercios, documentos, cuentas,\nreclamos, soporte, catálogo y tarifas" --> SISTEMA
    SISTEMA  -- "Solicitudes, listados, consultas\ny reclamos pendientes"  --> ADMIN

    MP       -- "Webhook de pago\ny confirmación de reembolso" --> SISTEMA
    SISTEMA  -- "Solicitud de cobro\ny reembolso"               --> MP
