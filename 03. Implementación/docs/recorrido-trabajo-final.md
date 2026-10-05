# Recorrido de Trabajo — Etapa 2 (Trabajo Final)

**Fecha de creación:** 2026-09-15
**Contexto:** el MVP de Bajoneá fue aprobado con nota 10 en la mesa final de Prácticas 2. Arranca la segunda etapa: 2 meses (plazo formal, instancia de graduación) para llevar el proyecto al 100% del alcance ya diseñado, más las recomendaciones de los profesores.

**Base de este plan:** `docs/mvp-terminado.md` (auditoría exhaustiva de gaps, 19 puntos). Ningún punto auditado está completo end-to-end. Las 41 tablas del diseño ya existen en `docs/bajonea_final.sql` — todo el trabajo pendiente es capa de aplicación (Entity JPA → Repository → Service → Controller → frontend), no modelado de datos.

**Criterio de orden:** por dependencia técnica, no por calendario. Cada bloque se cierra 100% testeado (Postman + Playwright) antes de avanzar al siguiente, siguiendo la metodología ya establecida del proyecto (Fase 1 auditoría → corrección → Fase 2 Postman → Fase 4 Playwright).

---

## Bloque 1 — Núcleo del Pedido + MercadoPago

El bloque de mayor riesgo y complejidad técnica. Se ataca primero porque casi todo lo demás depende de él (reembolsos, reclamos, cancelaciones). Corresponde a los puntos 5, 6, 9, 10, 11, 13 de la auditoría.

1. **Máquina de estados completa del Pedido** — pasar de 3 a 11 estados reales (`PENDIENTE_PAGO`, `EN_CAMINO`, `LISTO_PARA_RETIRAR`, `ENTREGADO`, `CANCELADO`, `ANULADO`, `CANCELADO_POR_SISTEMA`, `EXPIRADO` faltan hoy), con sus transiciones válidas y los 4 jobs `@Scheduled` (expiración de pago a 30min, timeout de respuesta del comercio a 1h, timer de retiro de 90min durante suspensión, aviso a los 75min) — hoy el proyecto no tiene ningún `@Scheduled`. **Estado (2026-09-20):** implementado y probado en vivo (11 estados, historial con actor y motivo de timeout, 4 jobs `@Scheduled`, `PENDIENTE_CONFIRMACION_COMERCIO`); pendiente del cierre formal de Diego (Fase 19). Los estados con reembolso cambian de estado pero no devuelven el dinero hasta implementar el punto 4.
2. **`ConfiguracionTarifa`** — CRUD del Administrador + aplicación real de la tarifa vigente al crear un pedido. Hoy `cargoServicioCliente`/`cargoServicioComercio` están hardcodeados a `BigDecimal.ZERO`. Se hace antes que MercadoPago porque el split de pago necesita un cargo real, no cero. **Estado (2026-09-20):** implementado (CRUD de Administrador y tarifa vigente aplicada en `PedidoService.confirmarPedido`: $200 fijo al cliente y 1% del subtotal al comercio); pendiente de confirmación de cierre y de número de fase (la Fase 20 está reservada).
3. **Integración MercadoPago Marketplace** — alta OAuth de cuenta por Dueño (`CuentaMercadoPago`, con refresh de tokens), creación de `preference` con `marketplace_fee`, recepción y verificación de webhooks asíncronos, correlación por `external_reference`, idempotencia ante reintentos de MP. Antes de este punto no había lógica de pago ni webhook (el pedido nacía simulado); la integración se hace con `RestClient`, sin SDK. **Estado (2026-09-20):** implementado salvo el refresh de tokens, que sigue pendiente. Hecho: vinculación OAuth con PKCE, estado `APTO_VENTA`, preferencia de Checkout Pro con `marketplace_fee`, webhook idempotente con verificación cruzada de `external_reference`, sincronización de pago y alertas en `alerta_webhook_mp`. Limitaciones conocidas: sin verificación del monto y firma del webhook opcional. **Actualización 2026-09-25:** el split quedó verificado de punta a punta: `marketplace_fee` (cargo al cliente + cargo al comercio, sumados) en la preferencia, y al aprobarse el pago se compara `fee_details` contra el monto esperado; si no coincide se registra la alerta `SPLIT_NO_APLICADO` (`alerta_webhook_mp`, migración `V22`) sin bloquear el pago. Verificado con pagos reales de sandbox. Ver `docs/DECISIONES.md` (2026-09-25) para la aclaración `marketplace_fee` vs `application_fee`.
4. **`NotaCredito` — reembolso total** (depende de 1 y 3) — flujo completo de reembolso vía API de MP.
5. **Cancelación/anulación de pedido completo** (depende de 1 y 4) — por Cliente (`cancelar`) y por Comercio (`anular`), con generación de `NotaCredito` asociada.
6. **`NotaCredito` — reembolso parcial por ítem** (depende de 4 y 5) — cancelar/anular un ítem puntual del pedido sin afectar el resto. Va al final del bloque por ser la extensión más fina; hoy solo existen 2 campos en `DetallePedido` y una columna física sin mapear.

---

## Bloque 2 — Dueño

Todo lo que el Dueño necesita para operar múltiples comercios. Corresponde a los puntos 1, 2, 12, 16 de la auditoría.

7. **Multi-comercio por Dueño** — endpoint de alta de comercio adicional sin recargar datos fiscales, más selector de comercio activo en el frontend. Hoy el modelo soporta N:1 pero la capa de servicio (`ComercioRepository.findByDuenoId` devuelve `Optional`, no `List`) asume 1 comercio por Dueño.
8. **Redes sociales del comercio** — quick win: el backend ya está completo y correcto (punto 16, único 🟡 SOLO BACKEND de toda la auditoría), solo falta conectarlo a una UI de gestión y al catálogo público.
9. **Cierre manual del comercio** (`cerrado_manualmente`) — la columna física existe en la base pero no está mapeada en la Entity; falta el toggle en el dashboard y el chequeo real en `validarAceptaPedidos`.
10. **Direcciones múltiples del Cliente** — agregar, editar, eliminar (baja lógica) y marcar principal. No es una función del Dueño, pero se agrupa acá por ser un CRUD del mismo tamaño y estilo técnico que 7 y 9.

---

## Bloque 3 — Empleado

Rol nuevo completo, tratado aparte del Bloque 2 por decisión explícita: primero se cierran todas las funcionalidades del Dueño, después todas las del Empleado, y recién al final se conectan por frontend y relaciones. Corresponde al punto 4 de la auditoría — el nivel más bajo de toda la auditoría (ni siquiera `RolUsuario` contempla `EMPLEADO` hoy).

11. **`EmpleadoComercio` completo** — nuevo valor de rol en `RolUsuario` con reglas de autorización propias en `SecurityConfig` (cambio que toca JWT/autenticación, marcado como de mayor riesgo arquitectónico), flujo de invitación por email con nuevo tipo de token (`INVITACION_EMPLEADO`), lógica de reutilización de Usuario existente si el email ya está registrado, selector de contexto Cliente↔Empleado y de comercio activo entre varios, y permisos delegados (CRUD de productos, gestión de pedidos, cierre/apertura de comercio, edición de datos/horarios/redes — sin acceso a datos fiscales ni MercadoPago).

---

## Bloque 4 — Módulos independientes restantes

No dependen de los bloques anteriores ni entre sí — se pueden trabajar en cualquier orden dentro del bloque. Corresponde a los puntos 3, 7, 8 de la auditoría, más trazabilidad y notificaciones.

12. **Extras de producto** (`GrupoExtra`/`Extra`) — toca Catálogo (UI de configuración de grupos/extras), Carrito (selección al agregar producto, recálculo de subtotal) y Pedido (snapshot inmutable en `DetallePedidoExtra`). Hoy el cálculo de totales es puramente `precio × cantidad` en `CarritoService` y `PedidoService`.
13. **Reclamo** (depende de `NotaCredito`, Bloque 1) — creación por Cliente sobre un pedido, resolución por Administrador, genera `NotaCredito` al aprobar.
14. **Soporte** — mensaje de descargo de un usuario suspendido/bloqueado, resolución por Administrador. Hoy solo hay 4 mensajes estáticos de UI ("Contactá a soporte") sin ningún link ni formulario real detrás.
15. **Trazabilidad de Historial** (`HistorialEstadoUsuario`, `HistorialEstadoComercio`, `HistorialEstadoPedido`) — se va tejiendo *durante* cada bloque anterior, no como tramo aparte al final: es agregar un INSERT en cada punto donde ya se muta un estado que se va a estar tocando de todos modos. Ojo particular con los 2 huecos ya detectados en `AuthService.propagarBloqueoAComercio`/`restaurarComercioSiCorresponde`.
16. **Notificaciones** — ídem, se implementan a medida que se construye cada flujo (hoy solo 6 de 31 notificaciones documentadas disparan, y ninguna llega por email todavía pese a estar esperado en varios casos del diccionario).

---

## Bloque 5 — Recomendaciones de la mesa final

Independientes de todo lo anterior, se pueden intercalar en cualquier momento sin bloquear nada.

17. **Carnet/libreta sanitaria** — campo 100% nuevo, sin ningún vestigio en ninguna capa del proyecto (ni siquiera en el diseño original). Exigir a cualquiera que venda comida, sin importar el producto.
18. **Tope de año en fecha de nacimiento del Cliente** — hoy el Cliente no tiene piso de edad (a diferencia del representante de Comercio, que sí exige 18+ por decisión deliberada documentada). Falta bloquear año en curso/futuro también para el Cliente, y agregar `max`/`min` a los inputs HTML (hoy el bloqueo es solo vía JS/backend al perder foco o enviar).
19. **Testing cross-browser/cross-device** — hoy la suite de Playwright corre solo sobre Chromium Desktop. Conviene aplicarlo al final de cada bloque ya cerrado, no como tramo único al final de todo el proyecto.

---

## Bloque 6 — Integraciones nuevas (fuera del alcance original)

Ideas propias de Diego, no forman parte del diseño ya documentado en el diccionario de datos. Se ubican al final del recorrido.

20. **Google Maps / geolocalización** — filtro de comercios cercanos en el catálogo público. Integración chica, sin dependencias del resto del proyecto. Tiene más sentido una vez que el catálogo tenga variedad real de comercios cargados.

---

## Trabajo transversal fuera de los bloques (2026-09-25)

- **Login por nombre de usuario** (migración `V19`, más `V21` para el cambio de nombre desde el perfil del Cliente): el login pasa a ser exclusivamente por nombre de usuario; el email queda para verificación, recuperación y reactivación. Implementado para Cliente y Dueño; Dueño, Administrador y Empleado quedan sin edición ni pantalla de datos personales hasta el tramo de multirol (Bloque 3). Ver `docs/DECISIONES.md`, 2026-09-25.
- **Testing:** Playwright 137/137 sin exclusiones, con `--workers=1` permanente; colección de Postman sin requests bloqueados por MercadoPago. Ver `testing/playwright/README.md`.

---

## Fuera de este plan (post-entrega)

21. **Rol de repartidor + tracking de pedido en tiempo real** — queda último en la lista, por si se llega a implementar dentro de los 2 meses una vez cerrado todo lo anterior. A diferencia del resto del plan, esto no tiene ningún modelo de datos diseñado todavía (no está en el diccionario de datos ni en `bajonea_final.sql`) — implicaría diseñar un rol nuevo completo desde cero, gestión de ubicación en tiempo real (WebSockets o polling) y algún proveedor externo de rutas. Dado el estado real actual (ningún punto de la auditoría está completo end-to-end, 5 gaps de alta complejidad en danza), se trata como trabajo post-entrega y no como parte del compromiso de los 2 meses.
