# Mapeo de archivos — Bloque 1, punto 2: ConfiguracionTarifa (2026-09-16)

Segundo tramo del Bloque 1 de `docs/recorrido-trabajo-final.md`. Detalle completo de decisiones y evidencia en `docs/DECISIONES.md`, entrada "2026-09-16 — Bloque 1, punto 2: `ConfiguracionTarifa`". Este archivo solo lista qué se tocó y por qué.

## Base de datos

| Archivo | Motivo |
|---|---|
| `backend/src/main/resources/db/migration/V10__configuracion_tarifa_tipo_cargo.sql` | Agrega `tipo_cargo_cliente`/`tipo_cargo_comercio` (`ENUM('FIJO','PORCENTAJE')`) a `configuracion_tarifa` y siembra la fila vigente ($200 FIJO cliente / 1% PORCENTAJE comercio) resolviendo `administrador_id` por email del admin ya sembrado. |
| `docs/diccionario-de-datos.md` | Tabla `ConfiguracionTarifa` actualizada: 2 columnas nuevas, reglas de negocio (cálculo sobre subtotal, exclusión de la comisión de MercadoPago). |

## Backend — nuevo

| Archivo | Motivo |
|---|---|
| `backend/src/main/java/com/bajonea/backend/enums/TipoCargo.java` | `FIJO`/`PORCENTAJE`, usado por ambos cargos de `ConfiguracionTarifa`. |
| `backend/src/main/java/com/bajonea/backend/entities/ConfiguracionTarifa.java` | Entity de la tabla (append-only — solo `INSERT`, nunca `UPDATE`/`DELETE` desde el Service). |
| `backend/src/main/java/com/bajonea/backend/repositories/ConfiguracionTarifaRepository.java` | `findTopByOrderByFechaVigenciaDesc` (vigente), `findAllByOrderByFechaVigenciaDesc` (historial). |
| `backend/src/main/java/com/bajonea/backend/dto/request/ConfiguracionTarifaRequestDTO.java` | Body de `POST /administrador/tarifas` — `@NotNull`/`@DecimalMin("0")`. |
| `backend/src/main/java/com/bajonea/backend/dto/response/ConfiguracionTarifaResponseDTO.java` | Respuesta de los 3 endpoints nuevos. |
| `backend/src/main/java/com/bajonea/backend/services/ConfiguracionTarifaService.java` | `obtenerVigente`/`obtenerHistorial`/`crear` + `calcularCargoCliente`/`calcularCargoComercio` (lógica FIJO vs. PORCENTAJE, documentada con Javadoc como pidió Diego). |

## Backend — modificado

| Archivo | Motivo |
|---|---|
| `backend/src/main/java/com/bajonea/backend/services/PedidoService.java` | `confirmarPedido`: los 2 `BigDecimal.ZERO` hardcodeados de `cargoServicioCliente`/`cargoServicioComercio` reemplazados por el cálculo real contra la tarifa vigente. |
| `backend/src/main/java/com/bajonea/backend/controllers/AdministradorController.java` | 3 endpoints nuevos: `GET /tarifas/vigente`, `GET /tarifas/historial`, `POST /tarifas` (todos bajo `hasRole("ADMINISTRADOR")`, ya cubierto por el matcher existente de `SecurityConfig`, sin tocarlo). |

## Frontend — nuevo

| Archivo | Motivo |
|---|---|
| `frontend/admin-tarifas.html` | Pantalla nueva: card "Tarifa vigente" + card "Historial". |

## Frontend — modificado

| Archivo | Motivo |
|---|---|
| `frontend/js/admin.js` | Tile "Tarifas" en `admin-dashboard.html` (ícono `percent` nuevo en `ICONS`); `initAdminTarifas`, `mostrarModalNuevaTarifa` (formulario), `mostrarModalConfirmarTarifa` (segundo modal de confirmación apilado, pedido explícito de Diego), `crearCampoCargo` (fila select+input reutilizable), `formatearCargo`/`labelResumenCargo` (helpers de presentación). |

## No tocado (a propósito)

- `SecurityConfig.java` — el matcher `/api/v1/administrador/**` ya cubre los 3 endpoints nuevos.
- Split de pago / MercadoPago — explícitamente fuera de este tramo, según el prompt original.
- `Pedido`/`DetallePedido` (entidades) — ya tenían los campos `cargoServicioCliente`/`cargoServicioComercio`, sin cambio de estructura.
