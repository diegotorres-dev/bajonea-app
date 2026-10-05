# Catálogo cerrado de pantallas — Fase 15 (Figma)

Cruce de las ~150 pantallas ya diseñadas en Figma (proyecto completo, capas mobile) contra el alcance real del MVP (`CLAUDE.md` §1) y contra los endpoints/flujos efectivamente implementados hasta el cierre de la Fase 14. Nombres de capa copiados tal cual para armar la página nueva por copia directa.

Metodología: para cada pantalla se verificó, cuando fue posible, contra el código real (no solo contra la memoria de `CLAUDE.md`) — controllers (`grep` de los 12 Controllers reales), `EstadoPedido`/`EstadoComercio`/`EstadoUsuario` (`docs/modelo-mvp.md` §1), y la lógica de negocio de `CatalogoService`, `CategoriaService`/`TagService`, `AdministradorService`, `AuthService`. 4 puntos genuinamente ambiguos se resolvieron con el usuario antes de cerrar este documento (sección 4).

---

## 1. Pantallas que SÍ entran al MVP

### G — General / Errores (12)
G01, G05, G06, G07, G08, G09, G10, G11, G12, G13, G14, G17

> G07/G13, G08/G12 y G09/G14 son pares duplicados (dos capas distintas para el mismo error). Al armar la página nueva, usar una sola versión de cada par.

### A — Auth (15 de 16)
A01, A02, A03, A04, A06, A07, A08, A09, A10, A11, A12, A13, A14, A15, A16

### R — Registro Cliente (5 de 5)
R01, R02, R03, R04, R05

### RC — Registro Comercio (3 de 4)
RC01, RC02, RC04

### C — Cliente (27 de 48)
C01, C02, C03, C04, C06, C09, C10, C10b, C12, C13, C14, C15, C16, C22, C23, C28, C33, C34, C37, C38, C41 (renombrada — ver sección 4.1), C42, C43, C44, C45, C46

### CO — Comercio (13 de 32, + 1 pantalla nueva a diseñar — ver sección 4.3)
CO01, CO13, CO14, CO15, CO16, CO17, CO18, CO19, CO20, CO21, CO27, CO28, CO29
**+ CO33 (nueva, sin diseñar todavía)** — "Comercio — Dashboard: Aprobado y Operando"

### AD — Admin (12 de 34)
AD01, AD02, AD03, AD05, AD06, AD15, AD16, AD17, AD19, AD20, AD21, AD23

**Total pantallas confirmadas IN: 87 (+ 1 nueva a diseñar en Fase 16, CO33).**

---

## 2. Pantallas que NO entran al MVP

### 2.1 Exclusiones de alcance (§1 de `CLAUDE.md`, cerradas desde el inicio del proyecto)

| Categoría | Pantallas | Motivo (§1) |
|---|---|---|
| MercadoPago / Pago | CO02, CO03, CO06, CO07, CO08, CO09, CO10, C17, C19, C20, C21 | "Explícitamente fuera del MVP: MercadoPago/Pago". `C18` no se excluye del todo — ver resolución en 4.2. |
| Estados de pedido fuera del subconjunto MVP | C24, C25, C26, C27, C29, C30, C31, C32, CO22, CO23, CO24, CO25, CO26 | `EstadoPedido` del MVP tiene solo 3 valores reales: `PENDIENTE`, `EN_PREPARACION`, `RECHAZADO` (`docs/modelo-mvp.md` nota 9). `EN_CAMINO`/`LISTO_PARA_RETIRAR`/`ENTREGADO`/`ANULADO`/`EXPIRADO`/`CANCELADO_POR_SISTEMA` no existen en el enum del backend. |
| Reclamos / Soporte | C35, C36, C47, C48, AD24, AD25, AD26, AD27, AD30, AD31, AD32, AD33, CO31 | "Explícitamente fuera del MVP: ...reclamos, soporte". |
| Tarifas (ligadas a Pago) | AD28, AD29 | `ConfiguracionTarifa` explícitamente fuera del MVP. |
| Suspensión de cuenta/comercio + estados sin mecanismo | AD09, AD10, AD13, AD14, CO04, CO05, A05 | "Suspensión de comercio/cliente por Administrador" explícitamente fuera del MVP. Además, verificado en `docs/modelo-mvp.md` nota 2: `EstadoUsuario.SUSPENDIDO`, `EstadoComercio.SUSPENDIDO` **e `INACTIVO`** no tienen ningún mecanismo real de transición en el MVP. CO05 ("Dashboard: Inactivo") mapea a `EstadoComercio.INACTIVO`, sin mecanismo — resuelto con el usuario, ver 4.3. |
| Re-solicitud de comercio rechazado | AD04, CO32 | `Comercio.fecha_resolicitud` explícitamente excluida del modelo, sin endpoint que la gestione (`docs/modelo-mvp.md` nota 4). |
| Horarios de atención granulares | RC03, CO30 | "Explícitamente fuera del MVP: ...horarios de atención granulares". |
| Apertura/cierre manual de local | CO11, CO12 | `Comercio.cerrado_manualmente` explícitamente excluida de la columna del modelo (`docs/modelo-mvp.md` nota 4) — no hay mecanismo de apertura/cierre manual. |
| Múltiples direcciones de cliente | C39, C40 | "Explícitamente fuera del MVP: ...múltiples direcciones de cliente". Confirmado con el usuario (sección 4.1): solo `C41` entra, renombrada y singular. |

### 2.2 Sin mecanismo real de negocio (verificado contra código, no una exclusión nombrada en §1)

| Pantallas | Motivo (evidencia de código) |
|---|---|
| AD18, AD22 | `CategoriaService.baja()`/`TagService.baja()` (idéntico patrón): la baja lógica **nunca** valida si la categoría/tag está en uso por algún producto — siempre soft-deletea sin bloquear. La regla de "bloqueo por uso" que estas 2 pantallas representan no existe. |
| AD36 | Los 5 sitios reales de `notificacionService.crear(...)` (`PedidoService` x3, `AdministradorService` x1, `ProductoService` x1) nunca apuntan a un usuario con rol Administrador — el Admin no recibe notificaciones en este MVP. |
| C05 | `ComercioService.listarAprobados()` / `buscarAprobadoPorId()` filtran estrictamente `estado = APROBADO`. Un comercio no-aprobado queda **invisible** en el catálogo — no se muestra "cerrado", directamente no aparece (listado) ni resuelve (detalle, 404). Esta pantalla no es alcanzable por ningún flujo real. |

### 2.3 Búsqueda/filtro global inexistente (resuelto con el usuario, sección 4)

| Pantallas | Motivo |
|---|---|
| C07, C08 | El único filtro real es categoría/tag dentro del menú de UN comercio (`GET /catalogo/comercios/{id}/productos?categoriaId=&tagId=`). No hay búsqueda global por texto ni filtro entre comercios. Decisión del usuario: excluir ambas; ese filtro real se resuelve como control de UI dentro de `C04`, sin pantalla/modal propios. |

### 2.4 Sin backend construido — categoría distinta de una exclusión de alcance de §1

Estas 6 pantallas no corresponden a ninguna decisión de alcance cerrada en §1 (no están nombradas como excluidas) — simplemente no existe hoy ningún endpoint ni mecanismo que las respalde, y el usuario decidió no colarlas en el catálogo cerrado de Fase 15 sin una ampliación formal de alcance (mismo criterio que la enmienda de Fase 7 para `Sesion`).

| Pantallas | Qué faltaría |
|---|---|
| AD07 | Endpoint de listado completo de comercios (hoy `AdministradorController` solo expone `GET /comercios/pendientes`). |
| AD08 | Endpoint de detalle de un comercio ya aprobado desde el panel Admin. |
| AD11, AD12 | Cualquier endpoint de gestión/listado/detalle de clientes desde el rol Administrador — no existe. |
| G15 | Ningún mecanismo de rate limiting en el backend (verificado, sin librería ni filtro de ese tipo). |
| G16 | Ningún "modo mantenimiento" configurable en el backend. |

**Total pantallas confirmadas OUT: 66.**

---

## 3. Resumen numérico

| | Cantidad |
|---|---|
| IN (checklist final) | 87 (+ 1 a diseñar, CO33) |
| OUT — exclusión de alcance §1 | 47 |
| OUT — sin mecanismo real (código) | 5 |
| OUT — búsqueda/filtro global inexistente | 2 |
| OUT — sin backend construido | 6 |
| OUT — múltiples direcciones (dentro de exclusión §1) | incluidas arriba |
| **Total procesado** | **~153** (incluye 3 duplicados de capas en G y 2 duplicados de estado en C — ver notas) |

---

## 4. Puntos resueltos con el usuario (no asumidos)

### 4.1 Direcciones de cliente (C39/C40/C41)
**Decisión:** `C39` y `C40` quedan excluidas (implican una lista de varias direcciones, contrario a §1). `C41` entra, renombrada mentalmente a **"Editar mi dirección"** (singular, sin "agregar") — no tiene endpoint hoy (no existe `ClienteController` ni ruta de edición de `Direccion` post-registro); queda marcada como pendiente de construir en Fase 16, mismo criterio que `C37`/`C38` (perfil de Cliente).

### 4.2 Búsqueda/filtros (C07/C08)
**Decisión:** ambas excluidas. El filtro real (categoría/tag dentro del menú de un comercio) se resuelve como control de UI dentro de `C04`, sin pantalla ni modal propios.

### 4.3 Dashboard de Comercio operando (CO03/CO05) — hueco real de diseño, no de selección
**Decisión:** `CO05` mapea a `EstadoComercio.INACTIVO` (sin mecanismo real) — excluida, mismo criterio que el bucket 2.4. `CO03` **no se toca** ni se fuerza a cumplir el rol de dashboard operativo (está diseñada atada a lenguaje de MercadoPago). En su lugar, se identificó que **ninguna pantalla del listado original cubre el dashboard normal de un Comercio ya aprobado y operando** — hueco real, no una omisión de clasificación. Se diseña de cero en Fase 16 una pantalla nueva, especificada acá:

**CO33 — Comercio — Dashboard: Aprobado y Operando** *(numeración provisoria, siguiente disponible tras CO32)*

Disparador: `Comercio.estado = APROBADO`, usuario representante logueado (rol `COMERCIO`) — primera pantalla tras un login exitoso una vez que el comercio ya no está `PENDIENTE`.

Contenido, basado únicamente en endpoints ya implementados (sin ningún elemento de MercadoPago — vinculación, estado de cuenta, botón de "completar onboarding", etc. — el comercio queda 100% operativo apenas `APROBADO`, sin pasos adicionales):

- **Encabezado:** nombre comercial y foto de perfil (`GET /comercios/perfil`).
- **Resumen de pedidos activos:** contador de pedidos en `PENDIENTE` (requieren acción — aceptar/rechazar) y contador en `EN_PREPARACION` (en curso), derivados de `GET /pedidos/comercio`. Tocar cualquiera de los dos contadores lleva a `CO18` (Lista de Pedidos).
- **Accesos directos:** "Mis Productos" → `CO13`; "Crear Producto" → `CO14`; "Editar Perfil" → `CO29`.
- **Indicador de notificaciones no leídas:** badge numérico desde `GET /notificaciones/no-leidas/contador`. *(Nota al margen, no pedida explícitamente: el checklist actual no incluye una pantalla propia de "Centro de Notificaciones" para Comercio — a diferencia de Cliente (`C44`/`C45`) y de Admin (excluida en `AD36`). Queda anotado, no agregado, salvo que se pida.)*

### 4.4 Sin backend construido (AD07/AD08/AD11/AD12/G15/G16)
**Decisión:** las 6 quedan excluidas del catálogo cerrado de Fase 15. Si en el futuro hace falta gestión completa de comercios/clientes desde Admin, rate limiting o modo mantenimiento, se evalúa como una ampliación de alcance formal (mismo criterio que la enmienda de Fase 7 — `docs/DECISIONES.md`, 2026-07-17), no se cuela sin ese paso.

---

## 5. Pendiente para Fase 16 (no bloquea el cierre de Fase 15)

- Construir `ClienteController` (o equivalente) con `GET/PUT` de perfil y edición de la única dirección del cliente, para respaldar `C37`, `C38` y `C41`.
- Diseñar `CO33` (Dashboard: Aprobado y Operando) desde cero, según la especificación funcional de la sección 4.3.
