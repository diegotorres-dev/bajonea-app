# Progreso — Fase 3: Direcciones múltiples del Cliente

Una línea por bloque. Estados: pendiente, en curso, hecho (pendiente de confirmación de Diego).

| Bloque | Estado | Detalle |
|---|---|---|
| Auditoría | hecho (2026-10-24), pendiente de la confirmación de Diego | `docs/AUDITORIA-FASE3-DIRECCIONES.md`; solo lectura, sin código ni commit; 2 preguntas menores abiertas con recomendación |
| A1 — V42 y entidades | hecho (2026-10-24), pendiente de la confirmación de Diego; V42 verificada sobre una copia de practicas3 y aplicada por Flyway en bajonea_test | Columnas `nombre`, `referencia`, índice único generado de "una por defecto", seis columnas `entrega_*` en `pedido`, backfill |
| A2 — CRUD de direcciones | hecho (2026-10-24), sin tests propios todavía (A4) | `DireccionClienteService`, cinco endpoints bajo `/api/v1/clientes/direcciones`, DTOs, cupo de 5, última dirección |
| A3 — Snapshot en el pedido | hecho (2026-10-24), sin tests propios todavía (A4) | Lectura bloqueante de la dirección en `confirmarPedido`; respuestas de pedido desde la copia |
| A4 — Tests Java | hecho (2026-10-24): 60 tests nuevos contra `bajonea_test`, `mvnw test` 1231 + 6 sin fallas | Unitarios, integración, concurrencia, snapshot; ajuste de seis tests con `PedidoService` |
| A5 — Newman y Playwright de API | hecho (2026-10-24): carpeta `78` (77 requests, 107 assertions) y spec `80` (16 tests) | Carpeta `78` y spec `80` |
| A6 — Estrés y mutaciones | hecho (2026-10-24): 5 escenarios sin problemas; 14 mutaciones detectadas (M4 requirió un test nuevo) | `stress-locks-tramoDirecciones.mjs` (5 escenarios) y mutaciones |
| A7 — Regresión y documentación | hecho (2026-10-24): Newman 3743/5788 sin fallas, Playwright 1221/1223 (2 inestables conocidos que pasan aislados), 24 estreses sin deadlocks; diccionario v1.27, `CLAUDE.md`, `DECISIONES.md`, mapeo | Diccionario v1.27, `CLAUDE.md`, `docs/DECISIONES.md`, mapeo de archivos |
| B0 — Mockups | hecho | Mockups aprobados por Diego antes de codificar: lista variante B, formulario A, checkout variante A |
| Paso 0 (entrega B) | hecho (2026-10-25) | Estrés `carrito` con el backend apuntando al stub de Mercado Pago: 8 rondas, 5 escenarios, sin problemas, 0 "Deadlock found" y 0 "Lock wait timeout" (había que crear una categoría en `bajonea_test` porque el script toma la primera). `12:150` aislado 5/5 (ver el reporte). Estado de los comercios: no hizo falta tocarlos; las pruebas usan `bajonea_test` y `bajonea_practicas3` no se tocó |
| B1 — Mis direcciones (perfil) | hecho (2026-10-25), pendiente de la confirmación de Diego | `js/direcciones.js` nuevo; fila "Mis direcciones (N)", vista con lista (radio + ⋮), formulario a pantalla completa, baja con `alertdialog`, aviso con "Deshacer", cupo lleno. El perfil no tenía bloque de dirección, no se sacó nada |
| B2 — Checkout | hecho (2026-10-25), pendiente de la confirmación de Diego | Tarjetas en `radiogroup` con la predeterminada preseleccionada, alta encima del checkout, cupo lleno con enlace, "Administrar mis direcciones" conserva modalidad y elección, `404` de dirección inexistente recarga la lista |
| B3 — Referencia en detalles de pedido | hecho (2026-10-25), pendiente de la confirmación de Diego | Línea "Referencia: …" en el detalle del Cliente, del Dueño y del Empleado; el alias no viaja |
| B4 — Spec 81 y regresión de UI | hecho (2026-10-25), pendiente de la confirmación de Diego | Spec `81` (20 tests); ajustes a `12` (intercepta `GET /clientes/direcciones`) y `63:402` (también lee el listado); `05` no cambió; 17 capturas en `docs/capturas-direcciones/` |
