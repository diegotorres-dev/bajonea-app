# Cambios en los documentos de 01. y 02.

Los documentos de `01. Análisis de Requerimientos` y `02. Diseño` no se editan: las versiones nuevas viven en esta carpeta. Cada tramo agrega su sección arriba.

> **Nota (2026-10-05):** las secciones del tramo C1 y del tramo 5 se reconstruyeron desde git, en modo solo lectura, comparando `01. Análisis de Requerimientos` y `02. Diseño` entre commits: el tramo C1 con `git diff 90933b8 a812465` y el tramo 5 con `git diff c081fb6 90933b8`. Se perdieron cuando se creó este archivo en el tramo C2. Lo que dicen esas dos secciones es lo que muestran los diffs, ni más ni menos. Tener en cuenta que el intervalo `c081fb6..90933b8` no se puede recortar al tramo 5: `c081fb6` es la última actualización de documentación anterior (2026-09-20), así que ese diff reúne todo lo que cambió en `01.` y `02.` hasta el tramo 5B (login por nombre de usuario, verificación del split, reembolsos y expiración de 30 minutos, corrección de comercios rechazados, cuenta de MercadoPago única y desvinculación, entre otros). La sección lo detalla por documento.


## Ajustes del rol Empleado tras la prueba manual: cierre manual, cargo del cliente y mensajes (2026-10-18)

Tres ajustes que cambian lo que ven el público, el Empleado y quien opera un pedido. Sin migraciones; el diccionario de datos no cambia de versión (solo se actualizó el texto de la regla de visibilidad).

1. **Cierre manual contra bloqueo de la cuenta, en el catálogo del Cliente.** Un comercio cerrado a mano se ve como "Cerrado" y, en el detalle, con el aviso de cuándo reabre. Un comercio cerrado porque la cuenta de su Dueño está bloqueada se ve como "Cerrado temporalmente", sin aviso de cuándo reabre. Esta regla **reemplaza a la del tramo C2**, que mostraba los dos casos con la misma etiqueta.
2. **El Empleado ve el cargo por servicio que paga el cliente.** En el detalle del pedido aparece la línea "Cargo por servicio del cliente" entre "Subtotal" y "Total pagado". Sigue sin ver el cargo del comercio, la comisión, el neto ni datos de Mercado Pago. "Ventas de hoy" no cambia.
3. **Mensajes de pedido y de comercio sin nombres internos.** Ejemplo: "El pedido ya fue resuelto" en lugar de "El pedido ya fue resuelto, no está en estado …". Cuando el pedido todavía no se aceptó o está en preparación o en camino, el texto dice qué falta hacer.

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano):
- `requisitos-funcionales-cliente.md`: copiar a `01. Análisis de Requerimientos/04. Requisitos Funcionales/`. Las etiquetas "Cerrado" y "Cerrado temporalmente" del catálogo.
- `requisitos-funcionales-comercio.md`: copiar a `01. Análisis de Requerimientos/04. Requisitos Funcionales/`. Qué indicador ve el público en cada caso de cierre.
- `requisitos-funcionales-empleado.md`: copiar a `01. Análisis de Requerimientos/04. Requisitos Funcionales/`. El cargo del cliente en el detalle del pedido y lo que sigue oculto.
- `Historias de Usuario - Cliente.md`: copiar a `01. Análisis de Requerimientos/07. Historias de Usuario/`. Criterios de aceptación de HU-C06.
- `Historias de Usuario - Empleado.md`: copiar a `01. Análisis de Requerimientos/07. Historias de Usuario/`. Qué ve el Empleado en los pedidos.
- `alcance-y-limitaciones.md`: copiar a `01. Análisis de Requerimientos/03. Alcance y Limitaciones/`. El texto del bloqueo del Dueño y el catálogo.
- `diccionario-de-datos.md`: copiar a `02. Diseño/03. Diagramas de Bases de Datos/03. Diccionario de Datos/`. El indicador de apertura `CERRADO_MANUAL` en la regla de visibilidad y venta.

**No cambiaron:** los requisitos de Dueño, Administrador, Sistema y generales, los requisitos no funcionales, las historias de Dueño, Comercio y Administrador, los DFD ni los diagramas.

**Pruebas:** ver `docs/DECISIONES.md`, 2026-10-18, y `docs/MAPEO-ARCHIVOS-TRAMO-AJUSTES-EMPLEADO.md`.


## Toast de éxito en toda acción que modifica datos (2026-10-15)

Toda acción que modifica datos y termina bien muestra ahora un aviso breve (toast), en todos los roles; quedan fuera las que solo navegan y las que terminan en su propia pantalla de confirmación. Se agregó a: abrir y cerrar el comercio, el cierre masivo de la desvinculación de Mercado Pago, "Marcar todas" las notificaciones, vaciar y quitar productos del carrito, eliminar, reordenar, recortar y agregar fotos de un producto guardado y descontinuar un producto desde su formulario. El aviso se anuncia a lectores de pantalla (`role="status"`).

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano):
- `requisitos-no-funcionales.md`: copiar a `01. Análisis de Requerimientos/` (la carpeta donde viva la versión vigente de los requisitos no funcionales). Suma, en "Usabilidad", el requisito del aviso de éxito.

**No cambiaron:** el diccionario de datos (sigue en la v1.20), los requisitos funcionales, las historias de usuario, el alcance ni los diagramas.

**Pruebas:** ver `docs/DECISIONES.md`, 2026-10-15, "Toast de éxito en toda acción que modifica datos, y regresión final de E4".


## El Administrador ve todos los comercios, sin importar el estado (2026-10-15)

`GET /api/v1/administrador/comercios` y la pantalla `admin-comercios.html` muestran ahora todos los comercios en cualquier estado, con una etiqueta de estado en cada tarjeta; "Ver equipo" está disponible en todos los estados. Las bandejas de solicitudes siguen mostrando solo los pendientes.

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano):
- `requisitos-funcionales-administrador.md`: copiar a `01. Análisis de Requerimientos/04. Requisitos Funcionales/`. Suma el requisito de ver todos los comercios sin importar el estado.
- `Historias de Usuario - Administrador.md`: copiar a `01. Análisis de Requerimientos/07. Historias de Usuario/`. HU-A07 suma criterios de aceptación.
- `alcance-y-limitaciones.md`: copiar a `01. Análisis de Requerimientos/03. Alcance y Limitaciones/`. Se actualiza la limitación (b) de la corrección de comercios rechazados.

**No cambiaron:** el diccionario de datos (sigue en la v1.20), los requisitos de Dueño, Empleado, Sistema, Comercio, Cliente y generales, ni las historias de Dueño y Empleado.

**Pruebas:** ver `docs/DECISIONES.md`, 2026-10-15, "El Administrador ve todos los comercios, sin importar el estado".

## Tramo E4, bloque A4: cierre y verificación (2026-10-15)

Cierre de E4 (sin código nuevo de la aplicación): se volvió a probar todo y se limpiaron los documentos de requisitos que seguían diciendo "planificado" o "no existe código". Cambios de contenido en esta carpeta:

- `requisitos-funcionales-sistema.md`: las secciones "Invitaciones de Empleado" e "Historial del Equipo de un Comercio" pasan de "planificado" a implementado; el vencimiento de invitaciones deja de decir "no hay un job" (es un proceso automático desde el tramo E1, bloque A8); se agregan la gestión directa del miembro (desactivar y reactivar con sus reglas), la renuncia y la lectura del Administrador; la lista de actividad pasa de tres a cuatro fuentes (con `EQUIPO` y el parámetro `fuente`) y el Administrador "la lee" en lugar de "la va a leer".
- `requisitos-funcionales-empleado.md`: el encabezado deja de decir que todo está planificado; "Vencida" ya no es "calculada sin un proceso automático".
- `alcance-y-limitaciones.md`: el rol Empleado pasa de "planificado, hoy no existe código" a implementado; se agregan las limitaciones de E4 (reactivación directa solo tras la baja del Dueño, sin email de reactivación, cuenta de Empleado bloqueada que no cambia la relación, Administrador de solo lectura, sin nombre del comercio en las respuestas del equipo); se actualizan "no retirado", "Actividad" y la regla de nombre de usuario por invitación.
- `Historias de Usuario - Empleado.md`: el encabezado pasa a "implementadas".

**Qué copiar a mano a `01.` y `02.`** (comparado con las copias actuales; los demás ya están iguales):
- `requisitos-funcionales-administrador.md`, `requisitos-funcionales-empleado.md`, `requisitos-funcionales-sistema.md` y `requisitos-funcionales-generales.md`: copiar a `01. Análisis de Requerimientos/04. Requisitos Funcionales/`.
- `Historias de Usuario - Administrador.md` y `Historias de Usuario - Empleado.md`: copiar a `01. Análisis de Requerimientos/07. Historias de Usuario/`.
- `alcance-y-limitaciones.md`: copiar a `01. Análisis de Requerimientos/03. Alcance y Limitaciones/`.

**No cambiaron en este bloque** (y ya están iguales en `01.` y `02.`): `diccionario-de-datos.md` (sigue en la v1.20), `requisitos-no-funcionales.md`, `requisitos-funcionales-dueño.md`, `requisitos-funcionales-comercio.md`, `requisitos-funcionales-cliente.md` y `Historias de Usuario - Dueño.md`.

**Pruebas:** ver `docs/DECISIONES.md`, 2026-10-15, "Tramo E4, bloque A4".

## Tramo E4, entrega B3: pantallas del Administrador (2026-10-15)

Tercera y última entrega de pantallas de E4 (solo frontend y pruebas, sin cambios de backend ni de datos): el Administrador ve el equipo y la actividad de cualquier comercio, en solo lectura. El modal de detalle del comercio suma el resumen "N activos · N inactivos" y el botón "Ver equipo"; hay una página del equipo (Miembros con Activos e Inactivos, y Solicitudes) y una página de la Actividad con los filtros Todo, Pedidos, Ediciones, Cierres y Equipo.

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.`):
- `requisitos-funcionales-administrador.md`: copiar a `01. Análisis de Requerimientos/04. Requisitos Funcionales/` (junto a los demás `requisitos-funcionales-*.md`). Cambia la sección "Ver Equipo de un Comercio": pasa de planificada a implementada y describe el botón, el resumen, las pestañas Miembros y Solicitudes, el motivo de la baja de un inactivo, la Actividad con el filtro Equipo y la regla de solo lectura.
- `Historias de Usuario - Administrador.md`: copiar a `01. Análisis de Requerimientos/07. Historias de Usuario/`. HU-A17 suma los criterios de aceptación.

**No cambiaron:** el diccionario de datos (sigue en la v1.20), los requisitos de Dueño, Empleado y Sistema, `alcance-y-limitaciones.md` ni las historias de Dueño y Empleado. Las copias de `01.` de los documentos de B1 y B2 (`requisitos-funcionales-dueño.md`, `requisitos-funcionales-empleado.md` y las dos historias) siguen pendientes si todavía no las copiaste.

**Pruebas:** ver `docs/DECISIONES.md`, 2026-10-15, "Tramo E4, entrega B3".

## Tramo E4, entrega B2: pantallas del Empleado y ajuste B1.1 (2026-10-15)

Segunda entrega de pantallas de E4 (solo frontend y pruebas, sin cambios de backend ni de datos): el Empleado puede dejar un comercio desde su perfil, la hoja de pérdida de acceso dice la causa real (baja del dueño, renuncia en otro dispositivo, comercio no disponible o neutra) y se verificaron los avisos T32 y T37. Aparte, el ajuste B1.1 de la pantalla del Dueño (toasts con el nombre y "Inactivo" sin fecha).

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `requisitos-funcionales-empleado.md`: copiar a `01. Análisis de Requerimientos/` (carpeta de requisitos funcionales, junto a los demás `requisitos-funcionales-*.md`). Cambian la regla de la hoja de pérdida de acceso (cuatro causas), la sección "Renuncia" (una sola hoja con casilla, en lugar de la doble confirmación) y la descripción del perfil del Empleado (sección "Mi lugar en el equipo").
- `Historias de Usuario - Empleado.md`: copiar a `01. Análisis de Requerimientos/` (carpeta de historias de usuario). HU-E05 y HU-E06 suman criterios de aceptación.
- `requisitos-funcionales-dueño.md`: copiar a `01. Análisis de Requerimientos/` (misma carpeta). Solo el ajuste B1.1: "Inactivo" sin fecha para un inactivo sin registro de la baja y los avisos "Desactivaste a {Nombre}" y "Reactivaste a {Nombre}".

**No cambiaron:** el diccionario de datos (sigue en la v1.20), los requisitos de Sistema y Administrador, `alcance-y-limitaciones.md` ni `Historias de Usuario - Dueño.md`.

**Pruebas:** ver `docs/DECISIONES.md`, 2026-10-15, "Tramo E4, entrega B2".

## Tramo E4, entrega B1: pantallas del Dueño (2026-10-15)

Primera entrega de pantallas de E4 (solo frontend y pruebas, sin cambios de backend ni de datos): "Mi equipo" con Activos e Inactivos, menú de tres puntos por integrante, desactivar con confirmación única, reactivar directo, "Invitar de nuevo" y el filtro "Equipo" en la Actividad.

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `requisitos-funcionales-dueño.md`: copiar a `01. Análisis de Requerimientos/` (carpeta de requisitos funcionales, junto a los demás `requisitos-funcionales-*.md`). Cambia el estado de implementación de "Gestión de Empleados", los filtros Activos e Inactivos de "Mi equipo", el filtro "Equipo" de Actividad y el comportamiento en pantalla de desactivar, reactivar e "Invitar de nuevo".
- `Historias de Usuario - Dueño.md`: copiar a `01. Análisis de Requerimientos/` (carpeta de historias de usuario). HU-D08 suma los criterios de Activos/Inactivos y de los menús, y pasa de cuatro a cinco filtros de Actividad.

**No cambiaron:** el diccionario de datos (sigue en la v1.20), los requisitos de Empleado, Sistema y Administrador, ni `alcance-y-limitaciones.md`; se actualizan con B2 y B3.

**Pruebas:** ver `docs/DECISIONES.md`, 2026-10-15, "Tramo E4, entrega B1".

## Tramo E4, bloque A3: historial del equipo en la Actividad y lectura del Administrador (2026-10-15)

Tercer bloque de backend de E4 (sin pantallas ni migraciones): la actividad del comercio suma una cuarta fuente, `EQUIPO`, con lo que pasó en el equipo (invitaciones, aceptaciones, bajas, renuncias y reactivaciones); el Administrador puede leer el equipo y la actividad de cualquier comercio; las invitaciones traen `diasRestantes` calculado por el servidor. Aparte, dos arreglos de frontend (Paso 0): el botón "Guardar" del formulario de producto y el desborde de etiquetas con nombre muy largo.

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `diccionario-de-datos.md`: **pasa de la v1.19 a la v1.20** (también cambió `docs/diccionario-de-datos.md`, que es idéntico). Copiar a `02. Diseño/03. Diagramas de Bases de Datos/03. Diccionario de Datos/diccionario-de-datos.md`. Solo comportamiento, sin tablas ni columnas: fuente `EQUIPO` de la actividad con el texto de cada motivo, la regla de que la `REACTIVACION` de una aceptación no se muestra, los dos endpoints del Administrador y `diasRestantes`.

**No cambiaron todavía** los requisitos funcionales (`-dueño`, `-empleado`, `-sistema`, `-administrador`), las historias de usuario ni `alcance-y-limitaciones.md`: se actualizan junto con las pantallas (bloques B1 a B3), cuando los textos estén definidos en los mockups. Los textos de la fuente `EQUIPO` son provisorios.

**Pruebas:** ver `docs/DECISIONES.md`, 2026-10-15, "Tramo E4, bloque A3".

## Tramo E4, bloque A2: renuncia del Empleado y acceso propio (2026-10-15)

Segundo bloque de backend de E4 (sin pantallas): el propio Empleado puede dejar un comercio, y un endpoint de solo lectura le dice al frontend por qué perdió el acceso. Sin migraciones.

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `diccionario-de-datos.md`: **pasa de la v1.18 a la v1.19** (también cambió `docs/diccionario-de-datos.md`, que es idéntico). Solo comportamiento, sin tablas ni columnas: la renuncia (`PUT /api/v1/empleados/comercios/{comercioId}/renunciar`) escribe la fila `RENUNCIA` de `HistorialEmpleadoComercio` y el aviso T34 al Dueno; nuevo `GET /api/v1/empleados/comercios/{comercioId}/acceso`; las notas de `MotivoHistorialEmpleado`, `EMPLEADO_DESACTIVADO`, el purgado de avisos y la regla de la relación indican que la renuncia ya está implementada.

**No cambiaron todavía** los requisitos funcionales (`-dueño`, `-empleado`, `-sistema`, `-administrador`), las historias de usuario ni `alcance-y-limitaciones.md`: se actualizan junto con las pantallas (bloques B1 a B3), cuando los textos y los flujos estén definidos en los mockups. El texto de T34 es provisorio.

**Pruebas:** ver `docs/DECISIONES.md`, 2026-10-15, "Tramo E4, bloque A2".

## Tramo E4, bloque A1: desactivar y reactivar al miembro del equipo (2026-10-14)

Primer bloque de backend de E4 (sin pantallas): el Dueño da de baja y reactiva directamente a un miembro del equipo, con historial, avisos y reglas de reactivación. Una migración (`V35`: tipo de aviso `EMPLEADO_REACTIVADO`, T37).

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `diccionario-de-datos.md`: **pasa de la v1.17 a la v1.18** (también cambió `docs/diccionario-de-datos.md`, que es idéntico). Nuevo tipo de aviso `EMPLEADO_REACTIVADO` (T37) con su audiencia; `MotivoHistorialEmpleado` indica qué motivos escribe el código hoy; la fila `REACTIVACION` puede ser directa (sin invitación) o por invitación; nota sobre `motivoBaja` y `puedeReactivar` del listado del equipo, calculados de la última baja del historial; T32 aclarado.

**No cambiaron todavía** los requisitos funcionales (`-dueño`, `-empleado`, `-sistema`, `-administrador`), las historias de usuario ni `alcance-y-limitaciones.md`: se actualizan junto con las pantallas (bloques B1 a B3), cuando los textos y los flujos estén definidos en los mockups. Los textos de T32, T34 y T37 son provisorios.

**Pruebas:** ver `docs/DECISIONES.md`, 2026-10-14, "Tramo E4, bloque A1".

## Tramo E3, entrega B, etapa 4: pestaña Actividad del Dueño (2026-10-14)

Última etapa de la entrega B. La vista "Ver equipo" del Dueño suma una tercera pestaña, "Actividad", con la lista de actividad del comercio (quién hizo qué) y filtros "Todo", "Pedidos", "Ediciones" y "Cierres". Backend: `GET /api/v1/comercios/equipo/actividad` suma el parámetro opcional `fuente` (`PEDIDO`, `EDICION` o `CIERRE`), compatible hacia atrás.

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `requisitos-funcionales-dueño.md`: "Ver equipo" tiene tres pestañas; la actividad se agrupa por día, tiene los cuatro filtros y el parámetro `fuente`; la actualización automática no pisa la lista.
- `Historias de Usuario - Dueño.md`: criterios nuevos de la pestaña Actividad (tres pestañas, botón "Invitar" solo en las dos primeras, filas, filtros, "Ver más", vacío y error).
- `requisitos-funcionales-sistema.md`: la lista de actividad acepta el filtro opcional `fuente` (valor inválido: 400).
- `diccionario-de-datos.md`: **pasa de la v1.16 a la v1.17** (solo documentación, sin migración ni cambio de tablas; también cambió `docs/diccionario-de-datos.md`, que es idéntico). En la tabla `HistorialEdicionComercio` se anota el filtro `fuente` y se corrige la frase desactualizada sobre qué filas de pedidos entran en la actividad (desde el bloque A2b entran las de cualquier actor, no solo Dueño y Empleado, con "Pedido recibido" y sin el nacimiento ni el vencimiento por falta de pago).
- `requisitos-funcionales-empleado.md`: una frase (la pestaña ya no "llega en la entrega B"; el Empleado no ve la pantalla de equipo).

**No cambiaron** `requisitos-funcionales-comercio.md`, `requisitos-funcionales-administrador.md`, `-cliente.md`, `-generales.md`, `requisitos-no-funcionales.md`, `alcance-y-limitaciones.md`, `Historias de Usuario - Administrador.md`, `- Cliente.md`, `- Comercio.md` ni `- Empleado.md`, ni los diagramas.

**Pruebas:** ver `docs/DECISIONES.md`, 2026-10-14, "Tramo E3, entrega B, etapa 4".

## Tramo E3, entrega B, etapa 3: campana y notificaciones del Empleado (2026-10-14)

Pantallas: la campana con contador en el panel del comercio para el Empleado, la pantalla de notificaciones dentro del contexto del comercio, "Ver pedido" hacia el detalle del comercio y el botón "Marcar todas". Solo frontend y pruebas: sin cambios de backend, sin migraciones, sin tablas ni columnas nuevas.

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `requisitos-funcionales-empleado.md`: el Empleado ve la campana (ya no "sin campana"); nueva sección "Notificaciones en Pantalla"; se actualiza la nota de estado de E2.
- `Historias de Usuario - Empleado.md`: criterio nuevo en HU-E04 (campana, contador, "Ver pedido", "Marcar todas").
- `Historias de Usuario - Comercio.md`: nota de la etapa 3 sobre las notificaciones del comercio en pantalla.

**No cambiaron** `requisitos-funcionales-comercio.md`, `requisitos-funcionales-dueño.md`, `requisitos-funcionales-sistema.md`, `requisitos-funcionales-administrador.md`, `-cliente.md`, `-generales.md`, `requisitos-no-funcionales.md`, `alcance-y-limitaciones.md`, `diccionario-de-datos.md`, las demás historias ni los diagramas Mermaid (sin cambios de esquema ni de flujo).

**Pruebas:** ver `docs/DECISIONES.md`, 2026-10-14, "Tramo E3, entrega B, etapa 3".

## Tramo E3, entrega B, etapa 2: edición del comercio, productos y cierre en pantalla (2026-10-14)

Pantallas del Empleado para editar la descripción y el teléfono del comercio, gestionar productos y abrir o cerrar el comercio, más un ajuste de la etapa 1 (el detalle del pedido se refresca solo tras un conflicto 409). Solo frontend y pruebas: sin cambios de backend, sin migraciones, sin tablas ni columnas nuevas.

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `requisitos-funcionales-empleado.md`: nueva sección "Edición del Comercio, Productos y Cierre en Pantalla"; el perfil del Empleado pasa a cinco filas sin "Cambiar contraseña" (los datos personales y la contraseña se editan desde la cuenta de Cliente, con una hoja de aviso); se actualizan las notas de estado de E2 y la sección "Sesiones".
- `requisitos-funcionales-comercio.md`: el aviso fijo de los conflictos 409 en el interruptor de cierre y en la gestión de productos; el Empleado autorizado ve el mismo interruptor.
- `Historias de Usuario - Empleado.md`: criterios nuevos en HU-E04 (detalle que se refresca tras un conflicto, edición de descripción y teléfono con campos bloqueados, hoja "Vas a pasar a tu cuenta personal", productos y cierre con aviso fijo).
- `Historias de Usuario - Comercio.md`: HU-CO04 y HU-CO13 (aviso fijo de los rechazos del servidor; el Empleado autorizado ve el interruptor).

**No cambiaron** `requisitos-funcionales-dueño.md`, `requisitos-funcionales-administrador.md`, `-cliente.md`, `-generales.md`, `-sistema.md`, `requisitos-no-funcionales.md`, `alcance-y-limitaciones.md`, `diccionario-de-datos.md`, `Historias de Usuario - Dueño.md`, `-Cliente.md` ni `-Administrador.md`, ni los diagramas Mermaid (sin cambios de esquema ni de flujo).

**Pruebas:** ver `docs/DECISIONES.md`, 2026-10-14, "Tramo E3, entrega B, etapa 2".

## Tramo E3, entrega B, etapa 1: pedidos del comercio en pantalla (2026-10-14)

Pantallas de la lista y el detalle de pedidos del comercio para el Dueño y el Empleado (chip "Tu pedido", recorrido del pedido, "Entregar", "Cerrar como no retirado" con espera, avisos fijos para los conflictos 409), y dos campos de solo lectura en los pedidos del comercio (`noRetiradoDisponibleDesde`, `noRetiradoMinutosRestantes`). Sin migraciones, sin tablas ni columnas nuevas.

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `requisitos-funcionales-empleado.md`: nueva sección "Pedidos en Pantalla"; "Pedidos Propios" describe la nota del detalle; la trazabilidad ya tiene pantalla.
- `requisitos-funcionales-comercio.md`: la lista y las acciones del comercio traen la espera del cierre como no retirado.
- `Historias de Usuario - Empleado.md` y `Historias de Usuario - Comercio.md`: criterios de la fila "Tu pedido", los avisos, el botón apagado y el recorrido.

**No cambiaron** `requisitos-funcionales-dueño.md` (la pestaña Actividad es de la etapa 4), `requisitos-funcionales-administrador.md`, `-cliente.md`, `-generales.md`, `-sistema.md`, `requisitos-no-funcionales.md`, `alcance-y-limitaciones.md`, `diccionario-de-datos.md` ni los diagramas Mermaid (sin cambios de esquema ni de flujo).

**Pruebas:** ver `docs/DECISIONES.md`, 2026-10-14, "Tramo E3, entrega B, etapa 1".

## Tramo E3, bloque A5: cierre y verificación del backend de E3 (2026-10-14)

Solo pruebas, scripts y documentación interna; una excepción de seguridad en el backend (el matcher público de `/api/v1/test/**` de `SecurityConfig` solo se registra con el perfil `test`). Sin migraciones, sin tablas ni columnas nuevas y sin cambios de reglas de negocio ni de pantallas.

**Documentos de esta carpeta que cambiaron:** ninguno. No hay nada que copiar a `01. Análisis de Requerimientos` ni a `02. Diseño`.

**Diagramas Mermaid que cambian:** ninguno.

**Documentos internos que sí cambiaron** (fuera de esta carpeta): `docs/LISTA-DE-DESPLIEGUE.md` (nuevo), `docs/AUDITORIA-E3.md` (banner de histórico), `docs/CONCURRENCIA-Y-TRANSACCIONES.md` (punto 3 del orden global), `docs/APRENDIZAJES-TECNICOS.md`, `docs/DECISIONES.md`, `CLAUDE.md` (correcciones factuales) y `testing/playwright/README.md`.

## Tramo E3, bloque A6: aviso T30 al equipo cuando el sistema autoconfirma la entrega (2026-10-14)

Backend, pruebas y documentación; sin migraciones ni pantallas. Cuando el proceso automático confirma solo la entrega de un pedido a domicilio porque el Cliente no respondió (90 minutos por defecto, configurable), el Dueño y cada Empleado Activo del comercio reciben su propia copia del aviso T30 (sin el Cliente del pedido si es Empleado del comercio). El aviso al Cliente (T8) no cambia.

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `diccionario-de-datos.md` (**v1.16**, cambio solo de documentación, sin esquema): T30 pasa de "no se emite a nadie" a implementado, con el texto y las reglas del aviso.
- `Modelo Relacional-v3 - Código Mermaid.md`: solo el encabezado (versión v1.16 y la aclaración de que no cambia ninguna tabla ni columna).
- `requisitos-funcionales-sistema.md`: la autoconfirmación a los 90 minutos emite T8 al Cliente y T30 al equipo; T30 implementado en la tabla de notificaciones y en la regla de notificaciones del Empleado.
- `requisitos-funcionales-empleado.md`: T30 deja de ser "al final del tramo E3" y se describe.
- `requisitos-funcionales-dueño.md`: el Dueño recibe T30 junto con los Empleados Activos.
- `alcance-y-limitaciones.md`: T30 deja de ser "no se emite a nadie"; limitaciones conocidas (quien se suma después no lo ve; el cierre de un retiro no avisa al equipo).

**Diagramas Mermaid que cambian:** ninguno. No hay migración, tablas, columnas ni claves nuevas; el diagrama entidad-relación es conceptual y los de flujo no listan avisos por tipo. El modelo relacional solo cambia su encabezado.

**No cambiaron** `requisitos-funcionales-administrador.md`, `-cliente.md`, `-comercio.md`, `-generales.md`, `requisitos-no-funcionales.md` ni las Historias de Usuario (ninguna menciona T30).

**Pruebas:** ver `docs/DECISIONES.md`, 2026-10-14, bloque A6. `mvnw test` 781 (778 + 3), Newman 2799 requests y 4349 assertions sin fallos (carpeta 65 nueva), Playwright 772/774 (los dos fallos son inestables sin relación con el bloque y pasaron aislados; spec 49 nuevo de 8 tests), estrés `stress-locks-tramoE3-A6.mjs` nuevo y los anteriores sin problemas, 0 `Deadlock found` y 0 `Lock wait timeout`.

## Tramo E3, bloque A4b: un retiro que el cliente no pasó a buscar se cierra como "No retirado" (V34) (2026-10-14)

Backend, una migración (`V34`), pruebas, documentación y un mínimo de frontend (la etiqueta "No retirado" en las listas y los detalles de pedidos, y un estado por defecto para que un estado desconocido no rompa la pantalla); sin botón ni pantallas nuevas. En el sistema: un pedido de retiro que quedó "Listo para retirar" y el cliente no retiró se cierra como **No Retirado**, por el Dueño o un Empleado (pasados 60 minutos desde que quedó listo; la espera es configurable y no aplica a "Entregar") o por el sistema cuando el comercio está suspendido y vence el plazo de 90 minutos (antes el sistema lo marcaba "Entregado", lo cual era falso). No hay devolución: el comercio se queda el pago porque el pedido ya estaba preparado. El cliente lo ve como "No retirado" y recibe el aviso T36; el pedido cuenta en "Facturado hoy"; "Entregado" queda reservado para entregas reales.

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `diccionario-de-datos.md` (**v1.15**): `NO_RETIRADO` y T36 pasan de planificados a implementados; `TIMEOUT_RETIRO_SUSPENSION` ahora termina en `NO_RETIRADO`; T26 queda sin emisor; `COMERCIO_SIN_RETIRO` sin uso (sale del enum Java, queda en el ENUM físico); el ciclo de vida del pedido suma las dos vías hacia `NO_RETIRADO`.
- `Modelo Relacional-v3 - Código Mermaid.md`: solo el encabezado (versión v1.15 y la aclaración de que no cambia ninguna tabla ni columna).
- `requisitos-funcionales-comercio.md`: el cierre como No Retirado deja de ser "pendiente, no implementado" (espera, 409 con minutos, comercio suspendido, cierre automático).
- `requisitos-funcionales-empleado.md`: 18 escrituras delegables (6 de pedidos) y la notificación T36 implementada.
- `requisitos-funcionales-sistema.md`: el estado `NO_RETIRADO`, el cierre automático del retiro de un comercio suspendido (ya no `ENTREGADO`), T26 sin emisor y T36 implementada.
- `requisitos-funcionales-dueño.md`: la lista de actividad suma "cerrar como no retirado" y el cierre automático como no retirado.
- `requisitos-funcionales-cliente.md`: el aviso y la etiqueta "No retirado", sin reembolso.
- `requisitos-no-funcionales.md`: la espera mínima configurable.
- `Historias de Usuario - Comercio.md` (HU-CO11): confirmar la entrega o cerrar como "no retirado".

**Diagramas Mermaid que cambian:** ninguno. `V34` solo agrega valores a tres ENUM (`pedido.estado`, `historial_estado_pedido.estado` y `notificacion.tipo`): no hay tablas, columnas ni claves nuevas, el diagrama entidad-relación es conceptual y los de flujo no listan estados. **No hay que regenerar ningún PNG.** Si en `01.` o `02.` existe un diagrama de estados del pedido o un caso de uso "Confirmar entrega de retiro", convendría sumarle `NO_RETIRADO` / "Cerrar pedido como no retirado".

**No cambiaron** `requisitos-funcionales-administrador.md`, `-generales.md`, `alcance-y-limitaciones.md`, `Historias de Usuario - Cliente/Dueño/Empleado/Administrador.md` (las del Empleado ya describían el cierre con la espera de 60 minutos), ni los DFD.

**Pruebas:** ver `docs/DECISIONES.md`, 2026-10-14, bloque A4b. `mvnw test` 766 (763 + 3), Newman 2713 requests y 4235 assertions sin fallos (carpeta 64 nueva), Playwright 765/766 (specs 47 y 48 nuevos; el único fallo es el inestable conocido `36:578`, 10/10 aislado), estrés `stress-locks-tramoE3-A4b.mjs` nuevo y los demás sin problemas, y 0 `Deadlock found` y 0 `Lock wait timeout` en los logs del backend.

## Mini-tramo del carrito (E3): el pago, las bajas y los cambios del carrito no fallan cuando se cruzan (2026-10-14)

Backend, pruebas y documentación; sin migraciones y sin pantallas. En el sistema: confirmar un pago nunca falla ni queda a medias porque el cliente esté editando su carrito, porque otro pedido suyo se esté pagando o porque el comercio esté agotando un producto en ese momento; el carrito se vacía solo si sigue siendo del comercio del pedido pagado, y nunca queda con ítems y sin comercio ni con comercio y sin ítems; un producto agotado no queda en ningún carrito, y solo se avisa a quien realmente perdió un ítem. Repetir una baja o cambiar la cantidad de un ítem que ya no está responde "Ítem no encontrado" (404).

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `requisitos-funcionales-sistema.md`: en "Creación de Pedido y Carrito", la regla de que la confirmación del pago no falla ni deja inconsistencias por operaciones simultáneas sobre el carrito; en "Gestión de Productos", que un producto agotado o descontinuado no puede quedar en ningún carrito y que el aviso (T23) es solo para quien perdió un ítem.
- `requisitos-no-funcionales.md`: la serialización por carrito de todas las modificaciones y que la URL base de MercadoPago es configurable solo para pruebas y no debe estar definida en el servidor final.

**No cambiaron** el resto de los documentos de esta carpeta, ni los diagramas Mermaid (modelo relacional, entidad-relación, flujo de nivel 0 y nivel 1): no hay tablas ni columnas nuevas.

**Pruebas:** ver `docs/DECISIONES.md`, 2026-10-14. `mvnw test` 725 (722 + 3), Newman 2579 requests y 4046 assertions sin fallos (carpeta 63 nueva), Playwright 748/749 (spec 46 nuevo; el único fallo, `38:921`, pasó 66/66 al correr el spec 38 solo), estrés `stress-locks-tramoE3-carrito.mjs` nuevo y los anteriores sin problemas, y 0 `Deadlock found` y 0 `Lock wait timeout` en los logs del backend.

## Tramo E3, bloque A4: avisos del comercio con una copia por persona del equipo, separados por comercio (V33) (2026-10-13)

Backend, una migración (`V33`), pruebas y documentación; sin pantallas. En el sistema: los avisos operativos del comercio (pedido nuevo T1, pedido cancelado por el Cliente T9 y pedido vencido sin respuesta T13) le llegan al Dueño y a cada Empleado activo, cada uno con su propia copia y su propio estado de lectura; los avisos de administración (aprobación, rechazo, suspensión, altas del equipo) le llegan solo al Dueño. Cada aviso del comercio lleva el comercio, así que cada contexto (un Dueño o un Empleado con varios comercios) ve solo los del comercio que tiene abierto, y la campana personal del Cliente ya no los mezcla. Quien se suma o se reactiva ve solo los avisos posteriores a su alta; quien es desactivado deja de recibir avisos y de ver los del comercio. El Cliente de un pedido que además es Empleado de ese comercio no recibe el aviso del equipo de su propio pedido.

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `diccionario-de-datos.md` (v1.14): la columna `comercio_id` y su índice en `Notificacion`, la audiencia de cada tipo (nota debajo de la tabla T1–T35), las reglas de lectura y de purgado, y las referencias de `NO_RETIRADO` y T36, que pasan de la migración `V33` a `V34`.
- `Modelo Relacional-v3 - Código Mermaid.md`: la tabla `Notificacion` suma `entidad_tipo`, `entidad_id` (que ya existían y faltaban en el diagrama) y `comercio_id`. **Hay que regenerar el PNG del modelo relacional.**
- `requisitos-funcionales-sistema.md`: las notificaciones del Empleado (una copia por persona, el Cliente del pedido excluido, audiencia por tipo), la consulta con el comercio abierto y el marcado de todas las no leídas.
- `requisitos-funcionales-empleado.md`: el estado de las notificaciones del Empleado (copia propia, solo avisos posteriores a su alta, 404 al desactivarlo, separación por comercio) y que no recibe el aviso de su propio pedido.
- `requisitos-funcionales-comercio.md`: el aviso de pedido nuevo, cancelación y vencimiento para el Dueño y cada Empleado activo.
- `Historias de Usuario - Dueño.md` (HU-D08) y `Historias de Usuario - Empleado.md`: criterios de las copias individuales y la separación por comercio.
- `AUDITORIA-E1.md`: solo una frase ("No hay `V33`" ahora dice "No hay migración").

**Diagramas Mermaid que cambian:** solo el **modelo relacional** (columna nueva en `Notificacion`). **No cambian** el diagrama entidad-relación (conceptual, no lista columnas), el diagrama de flujo de nivel 0 ni el de nivel 1.

**No cambiaron** `requisitos-funcionales-dueño.md`, `-cliente.md`, `-administrador.md`, `-generales.md`, `requisitos-no-funcionales.md`, `alcance-y-limitaciones.md` ni los DFD.

**Pruebas:** ver `docs/DECISIONES.md`, 2026-10-13, bloque A4. `mvnw test` 702 (699 + 3), Newman 2521 requests y 3963 assertions sin fallos (carpeta 62 nueva), Playwright 742/742 (spec 45 nuevo), estrés `stress-locks-tramoE3-A4.mjs` nuevo y los demás sin problemas, y 0 `Deadlock found` y 0 `Lock wait timeout` en el log del backend.

## Tramo E3, bloque A2b: la actividad del comercio suma lo que hicieron el Cliente y el sistema con los pedidos, y el sistema usa un único reloj con zona configurable (2026-10-13)

Backend, pruebas y documentación; sin migraciones y sin pantallas. En el sistema: la lista de actividad del Dueño muestra ahora todo lo que le pasó a cada pedido desde que el comercio lo ve, sea quien sea el actor (el Dueño, los Empleados, el Cliente que cancela o confirma la recepción, y el sistema: "Pedido recibido" cuando llega el pedido ya pagado, el vencimiento sin respuesta del comercio, la autoconfirmación de la entrega, el cierre automático de un retiro con el comercio suspendido y la cancelación por la suspensión); no muestra el pedido que todavía no se pagó ni el que venció por falta de pago, porque el comercio nunca lo vio. En las acciones del sistema no hay nombre ni usuario (la pantalla escribirá "Sistema"), y el Cliente aparece con su nombre completo. Además, todas las horas de los historiales, los plazos de los pedidos, las invitaciones y los horarios de atención salen de un único reloj, en la zona de la propiedad `app.zona-horaria` (por defecto Ushuaia, UTC-03:00), así que el orden de la lista y los plazos no dependen de la zona de la máquina donde corra el servidor; una zona inválida impide arrancar. Las filas ya guardadas no se migraron.

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `requisitos-funcionales-sistema.md`: la lista de actividad (qué entra de los pedidos, qué no, cómo se muestra cada actor) y un requisito nuevo, "Zona horaria única".
- `requisitos-funcionales-dueño.md`: la actividad del comercio con las acciones del Cliente y del sistema y sin el pedido que nunca se pagó.
- `requisitos-funcionales-empleado.md`: la descripción de la pestaña Actividad ("Ver equipo") con las tres fuentes y lo que entra de los pedidos.
- `requisitos-funcionales-comercio.md`: el historial de estados del pedido con la hora del reloj único y lo que de él muestra la actividad.
- `requisitos-no-funcionales.md`: un único reloj y una única zona horaria configurable (en "Disponibilidad y Confiabilidad").
- `Historias de Usuario - Dueño.md`: HU-D08, la actividad incluye lo que hicieron el Cliente y el sistema con sus pedidos.
- `alcance-y-limitaciones.md` (Limitaciones conocidas): la entrada "Zona horaria" se reescribió (reloj único, qué fechas quedan en la zona de la JVM y el efecto transitorio de no migrar filas).

**No cambiaron** `diccionario-de-datos.md` (sin migraciones), los diagramas ER y relacional, `-cliente.md`, `-administrador.md`, `-generales.md`, las historias de usuario del Empleado, el Comercio, el Cliente y el Administrador ni los DFD. Fuera de esta carpeta: `CLAUDE.md`, `docs/DECISIONES.md`, `docs/CONCURRENCIA-Y-TRANSACCIONES.md`, `docs/APRENDIZAJES-TECNICOS.md` y `testing/playwright/README.md`.

**Corregida la línea del bloque A1** que decía que de los pedidos entran solo las acciones del Dueño y los Empleados: en `requisitos-funcionales-sistema.md` ("Las acciones del Cliente y del sistema sobre los pedidos no aparecen"), en `CLAUDE.md` (§1bis, bloque A1), en el comentario de `ActividadComercioService`, en la entrada del bloque A1 de `docs/DECISIONES.md` y en la sección del bloque A1 de este mismo archivo (con una aclaración que remite a este bloque).

**Pruebas:** `mvnw test` 660/660 en las dos pasadas (12 tests nuevos); Playwright 722/722 (spec 43 nuevo de 10 tests); Newman 2275 requests y 3596 assertions sin fallos (carpeta 60 nueva); estrés nuevo con volumen sintético de 30000 pedidos (una página de la actividad tarda 256 ms de mediana y 444 ms en el percentil 95; el recorrido completo trae exactamente las 90302 filas, sin repetidos ni saltos); los demás estreses sin problemas. Detalle en `docs/DECISIONES.md`, 2026-10-13, bloque A2b.


## Tramo E3, bloque A2: escrituras delegadas al Empleado (productos, descripción y teléfono, abrir y cerrar, y las cinco acciones de pedido) con revalidación de la relación, reglas por estado del comercio y actor real (2026-10-13)

Backend, pruebas y documentación; sin migraciones y sin pantallas. En el sistema: el Empleado puede hacer las 17 escrituras delegables (9 de productos e imágenes, la edición de descripción y teléfono del comercio por una ruta propia, abrir y cerrar, y aceptar, rechazar, despachar, entregar y anular pedidos); cada una vuelve a comprobar, dentro de su propia operación, que su relación con el comercio siga Activa y, si el Dueño la desactivó mientras tanto, responde "comercio no encontrado" (404) sin cambiar nada; las acciones y las ediciones quedan registradas con su rol y su usuario; con el comercio Suspendido no puede modificar productos, imágenes, descripción ni teléfono, y no puede aceptar pedidos nuevos con el comercio Suspendido o Cerrado Temporalmente (sí rechazarlos); cerrar y abrir tienen códigos de error estables. El Cliente que manda un comercio en las notificaciones se trata como Empleado de ese comercio.

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `requisitos-funcionales-empleado.md`: el estado del Empleado con el comercio Suspendido o Cerrado Temporalmente (catálogo y perfil, aceptar, abrir y cerrar, cierre manual), el estado de implementación (las 17 escrituras ya las abre el servidor; las pantallas son de la entrega B), el email de contacto en solo lectura, la edición de descripción y teléfono por su ruta propia, abrir un cierre manual del Dueño y que PUT del perfil completo, la foto y su firma son exclusivos del Dueño.
- `requisitos-funcionales-comercio.md`: la regla del comercio no operativo (catálogo y perfil, pedidos, cierre manual) con los códigos, y cerrar y abrir dentro del horario y con el comercio operativo.
- `requisitos-funcionales-dueño.md`: que el nombre, la foto, la dirección, el tipo de comercio, el email de contacto y las modalidades de entrega son exclusivos del Dueño (el Empleado solo edita descripción y teléfono) y el hueco conocido de que el Dueño no tiene los guards del comercio suspendido.
- `requisitos-funcionales-sistema.md`: las notificaciones con el comercio en la consulta, la revalidación de la relación en cada escritura, los códigos de conflicto del comercio y el estado de la actividad (el Empleado ya se registra).
- `Historias de Usuario - Empleado.md`: HU-E04 con la regla completa por estado del comercio.
- `alcance-y-limitaciones.md` (Limitaciones conocidas): el guard del comercio no operativo pasa a implementado (con el hueco del Dueño anotado) y la actividad registra al Empleado.

**No cambiaron** `diccionario-de-datos.md` (sin migraciones), los diagramas ER y relacional, `-cliente.md`, `-administrador.md`, `-generales.md`, `requisitos-no-funcionales.md`, las historias de usuario del Comercio, el Dueño, el Cliente y el Administrador ni los DFD. Fuera de esta carpeta: `CLAUDE.md`, `docs/DECISIONES.md` (entrada nueva del 2026-10-13, bloque A2, y correcciones en la decisión 2 de "Decisiones no previstas" y la pregunta 2 del bloque A0b), `docs/CONCURRENCIA-Y-TRANSACCIONES.md` y `docs/APRENDIZAJES-TECNICOS.md`.

**Pruebas:** `mvnw test` 648/648 (645 con el perfil test sin la clase de los atajos y 3 de esa clase sola; 37 tests nuevos respecto del bloque A1); Newman 2187 requests, 3476 assertions, 0 fallos (carpeta 59 nueva de 166 requests); Playwright 712/712 en 18,7 min (workers 1) (spec 42 nuevo de 31 tests); estrés `stress-locks-tramoE3-A2.mjs` (6 escenarios) sin 5xx, sin inconsistencias y sin Deadlock found ni Lock wait timeout.


## Tramo E3, bloque A1: historial de ediciones (V32), lista de actividad del Dueño y reglas del Empleado con el comercio no operativo y del pedido no retirado (2026-10-12)

Backend, pruebas y documentación; una migración (`V32`); sin pantallas. En el sistema aparece la tabla `historial_edicion_comercio` (quién cambió qué en productos, imágenes, perfil y redes sociales del comercio, en la misma operación que el cambio y solo ante un cambio efectivo, sin guardar valores) y el endpoint `GET /api/v1/comercios/equipo/actividad` (solo Dueño), que junta en una lista paginada las ediciones, las acciones del Dueño y los Empleados sobre los pedidos (corregido en el bloque A2b: desde entonces entra todo lo que el comercio vio de sus pedidos, también lo del Cliente y del sistema) y los cierres y reaperturas del comercio. El resto del bloque es documentación de reglas ya aprobadas, todavía sin implementar: qué puede hacer un Empleado con el comercio Suspendido o Cerrado Temporalmente según el estado de cada pedido, y el nuevo estado final "No retirado" de un pedido de retiro (con su espera de 60 minutos, sin devolución del pago y la notificación T36).

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `diccionario-de-datos.md` v1.13 (y copia idéntica en `docs/diccionario-de-datos.md`): la tabla `HistorialEdicionComercio` pasa de planificada a implementada, con el DDL aplicado (nombres de índices y claves foráneas con el prefijo `hed`, porque `fk_hec_comercio` ya existía en el historial de estados del comercio) y las reglas de la lista de actividad; los ENUM `TipoEntidadEdicion` y `AccionEdicion` implementados; el estado `NO_RETIRADO` del pedido y la notificación T36 `PEDIDO_NO_RETIRADO`, marcados como planificados (migración `V34`, bloque A4b); `FuenteEntrega.COMERCIO_SIN_RETIRO` sin uso.
- `Diagrama Entidad-Relación-v3 - Código Mermaid.md` y `Modelo Relacional-v3 - Código Mermaid.md`: `HistorialEdicionComercio` deja de figurar como planificada (relaciones sin la marca, enum del rol del actor con su nombre real). **Los PNG de ambos diagramas hay que regenerarlos.** Las marcas "planificada" de `InvitacionEmpleado` y `HistorialEmpleadoComercio` (E1) siguen en el diagrama relacional: ya estaban desactualizadas antes de este bloque y no se tocaron.
- `requisitos-funcionales-empleado.md`: la regla del comercio no operativo por estado del pedido (solo rechazar un pendiente, despachar o anular uno en preparación, nada con uno en camino, entregar o cerrar como no retirado uno listo para retirar), el cierre como No Retirado (60 minutos, sin devolución, T36), 18 escrituras delegables cuando llegue ese cierre y el estado de implementación de la actividad.
- `requisitos-funcionales-comercio.md`: el flujo de retiro con No Retirado, la regla del comercio no operativo por estado del pedido y "facturado hoy" con No Retirado.
- `requisitos-funcionales-dueño.md`: la lista de actividad (qué junta, qué muestra cada línea, paginación) y que la pestaña en pantalla llega en la entrega de pantallas.
- `requisitos-funcionales-sistema.md`: la notificación T36 en el catálogo y, en "Actividad del Comercio", qué se registra hoy, el estado de implementación y la lista de actividad con su paginación y su autorización.
- `Historias de Usuario - Empleado.md`: HU-E04 con la regla por estado del pedido y el cierre como no retirado.
- `alcance-y-limitaciones.md` (Limitaciones conocidas): el guard del comercio no operativo por estado del pedido, el pedido de retiro no retirado (planificado), los tres tramos futuros anotados (edición de horarios, rediseño de la suspensión, reclamo del Cliente por un retiro cerrado por error) y que "Ver equipo" ya tiene la actividad en el servidor pero no en pantalla.

**No cambiaron** `requisitos-funcionales-cliente.md`, `-administrador.md`, `-generales.md`, `requisitos-no-funcionales.md`, las historias de usuario del Comercio, el Dueño, el Cliente y el Administrador ni los DFD. Fuera de esta carpeta: `CLAUDE.md`, `docs/DECISIONES.md` (entrada nueva del 2026-10-12, bloque A1, y notas en las decisiones 17 y 27 del 2026-10-05), `docs/CONCURRENCIA-Y-TRANSACCIONES.md`, `docs/APRENDIZAJES-TECNICOS.md` (tres entradas nuevas), `docs/AUDITORIA-E3.md` (nota en la sección 6) y `testing/playwright/README.md`.

**Pruebas:** `mvnw test` 611/611 (608 en la pasada con el perfil `test` y 3 de la clase que exige no tenerlo); Newman 2028 requests y 3234 assertions, 0 fallos (carpeta 58 con 25 requests nuevas); Playwright 681/681 desde una base reseteada (sin specs nuevos); estrés `stress-locks-tramoE3-A1.mjs` (4 escenarios, 10 rondas) sin `5xx`, sin filas de historial inconsistentes y sin `Deadlock found` en el log (la primera corrida, antes de volcar las escrituras pendientes antes de insertar el historial, dio 255). Detalle en `docs/DECISIONES.md`, 2026-10-12, bloque A1.


## Tramo E3, bloque A0b: toda devolución nace con su nota en la transacción, motivo de anulación por lista y decisiones de E3 (2026-10-12)

Continuación del bloque A0 (backend, pruebas y documentación; sin migraciones). Cambia el comportamiento en cuatro puntos: el rechazo, el vencimiento por falta de respuesta, la cancelación por suspensión del comercio y la cancelación del Cliente crean la nota de crédito en la misma operación que el cambio de estado (si no se puede escribir, el pedido no cambia); la cancelación del Cliente con pago aprobado ya genera reembolso; el motivo de anulación pasa a ser uno de la lista de motivos de rechazo (más comentario, obligatorio con "Otro"); y se documentan las decisiones de E3 tomadas hasta ahora.

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `requisitos-funcionales-empleado.md`: el Empleado con el comercio Suspendido o Cerrado Temporalmente puede despachar, entregar y anular pedidos ya aceptados (no acepta pedidos nuevos, no toca productos ni perfil, no abre ni cierra); las entregas En Camino las confirma el Cliente o el sistema; edita solo descripción, teléfono y horarios (nombre, foto, dirección, tipo de comercio, datos fiscales, redes sociales, MercadoPago y equipo son exclusivos del Dueño); 17 escrituras delegables; `HistorialEdicionComercio` en lugar de `ActividadComercio`; pendiente del aviso por el cierre de un retiro sin presentación.
- `Historias de Usuario - Empleado.md`: HU-E03 y HU-E04 (qué edita el Empleado y qué puede hacer con el comercio no operativo).
- `requisitos-funcionales-comercio.md`: edición del Empleado, nota de crédito en la misma operación en rechazo, vencimiento, suspensión y cancelación del Cliente, lista de motivos de la anulación, entregas En Camino, comercio no operativo y la nota sobre el cierre de retiro sin presentación (hoy no existe).
- `requisitos-funcionales-sistema.md`: el registro de ediciones (`HistorialEdicionComercio`).
- `alcance-y-limitaciones.md` (Limitaciones conocidas): la cancelación del Cliente ya devuelve el dinero; queda sin implementar solo el reembolso parcial por ítem.
- `diccionario-de-datos.md` (y copia idéntica en `docs/diccionario-de-datos.md`): la tabla planificada `V32` pasa de `ActividadComercio` a `HistorialEdicionComercio` (nuevos ENUM `TipoEntidadEdicion` y `AccionEdicion`, sin `PEDIDO`, `ABRIR` ni `CERRAR`; sin `actor_nombre`; DDL propuesto, sin aplicar); `Pedido.motivo`, `motivo_rechazo` y `comentario_rechazo` también para la anulación; la regla del comercio no operativo y los permisos delegables de la sección 12.
- `Diagrama Entidad-Relación-v3 - Código Mermaid.md` y `Modelo Relacional-v3 - Código Mermaid.md`: la entidad planificada se renombra a `HistorialEdicionComercio`. **Los PNG de ambos diagramas hay que regenerarlos.**

**No cambiaron** `requisitos-funcionales-dueño.md`, `-cliente.md`, `-administrador.md`, `-generales.md`, `requisitos-no-funcionales.md` ni las historias de usuario del Comercio, el Dueño, el Cliente y el Administrador. Fuera de esta carpeta: `docs/DECISIONES.md` (decisiones 17, 25 y 27 del 2026-10-05 anotadas y entrada nueva del 2026-10-12), `CLAUDE.md`, `docs/CONCURRENCIA-Y-TRANSACCIONES.md`, `docs/APRENDIZAJES-TECNICOS.md`, `docs/AUDITORIA-E3.md` (aviso de que el DDL de la sección 6 fue reemplazado) y `docs/DATA-TESTID-FASE17.md`.


## Tramo E3, bloque A0: anular genera la nota de crédito, una sola transición ganadora por pedido y fotos solo de su carpeta (2026-10-12)

Endurecimiento previo a delegar escrituras al Empleado (backend y pruebas; sin pantallas ni migraciones). Cambia el comportamiento del Dueño en tres puntos: anular un pedido crea siempre la nota de crédito por el total en la misma operación (si el reembolso en Mercado Pago no se puede procesar, la nota queda en la pantalla de reembolsos del Administrador) y el aviso al Cliente dice que la devolución está en gestión; toda transición de estado de un pedido se atiende de a una (gana la primera, la segunda recibe "el pedido ya fue resuelto" y no deja historial, aviso ni reembolso), incluidos los procesos automáticos; la foto del comercio y las imágenes de producto solo se aceptan de la carpeta que firmó el servidor para ese comercio o producto.

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `alcance-y-limitaciones.md` (Limitaciones conocidas, "Nota de crédito y reembolso"): la anulación ya devuelve el dinero; queda sin devolver solo la cancelación del Cliente.
- `requisitos-funcionales-sistema.md` (T10): el aviso de anulación indica que la devolución del pago está en gestión.
- `requisitos-funcionales-comercio.md` (anular un pedido y reglas del panel de pedidos): la nota de crédito se crea en la misma operación que la anulación, qué pasa ante una segunda anulación o una acción simultánea, y la regla de "gana la primera" para acciones simultáneas.
- `requisitos-no-funcionales.md` (Integración con MercadoPago y seguridad): serialización de las transiciones de estado del pedido y validación de la carpeta de las imágenes.

**No cambiaron** `diccionario-de-datos.md` (sin tablas, columnas, estados ni restricciones nuevas: `nota_credito` sigue siendo N:1 con `pago`), los requisitos e historias de Empleado, Dueño, Cliente y Administrador, las historias de usuario del Comercio (HU-CO12 ya decía que anular garantiza el reembolso automático), los DFD ni los diagramas ER y relacional.

**Pendientes que el bloque deja a la vista** (no son cambios de documento): la cancelación del Cliente sigue sin reembolso; el motivo de anulación es texto libre en el código y "motivo predefinido" en los requisitos; el rechazo, la expiración y la suspensión crean su nota después de confirmar el cambio de estado (la anulación, dentro). Ver `docs/DECISIONES.md`, 2026-10-12.

**Pruebas:** `mvnw test` 575/575; Playwright 664/665 desde una base reseteada (spec `39-pedidos-anulacion-concurrencia-api` nuevo de 12 tests; el único fallo, el inestable conocido de 375 px del spec 36); Newman 1999 requests y 3181 assertions sin fallos (carpeta 58 nueva de 91 requests); estrés `stress-locks-tramoE3-A0.mjs` de 8 escenarios y los estreses anteriores de bloqueos sin `5xx` ni deadlocks. Detalle en `docs/DECISIONES.md`, 2026-10-12.

Fuera de esta carpeta: `CLAUDE.md`, `docs/DECISIONES.md`, `docs/CONCURRENCIA-Y-TRANSACCIONES.md`, `docs/APRENDIZAJES-TECNICOS.md`, `testing/playwright/README.md`, la colección y el environment de `postman/`.

## Tramo E2, entrega B6: ajustes de interfaz de los perfiles y aviso de pérdida de acceso (2026-10-12)

Ajustes de la prueba manual sobre la entrega B de E2 (solo frontend y pruebas de pantalla; el servidor no cambió). Los perfiles del Cliente y del Empleado pasan a ser una sola lista de filas sin títulos de sección; el Empleado edita sus datos personales y cambia su contraseña dentro del layout del comercio (sin pasar por las pantallas de Cliente); y la pérdida de acceso a un comercio se avisa con una hoja inferior ("Ya no tenés acceso a este comercio", con el nombre del comercio y el botón "Entendido") en lugar del toast.

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `requisitos-funcionales-empleado.md` (Acceso a Comercios y Reglas Generales): descripción de la hoja de pérdida de acceso con sus dos variantes, y del perfil del Empleado como lista única con edición de datos personales y contraseña dentro del comercio (la foto personal se cambia desde la cuenta de Cliente).
- `requisitos-funcionales-generales.md` (selector de contexto): la desactivación de la relación muestra la hoja y recién al cerrarla redirige.
- `Historias de Usuario - Empleado.md` (HU-E05): la hoja de aviso con el botón "Entendido".

**No cambiaron** los requisitos e historias del Cliente (no describen el orden ni los títulos del perfil), ni los del Dueño, Comercio y Administrador, `diccionario-de-datos.md`, `alcance-y-limitaciones.md`, `requisitos-no-funcionales.md`, los DFD ni los diagramas.

**Pruebas:** spec `38-empleado-acceso-ui` de 49 a 66 tests (hoja de pérdida de acceso con sus dos variantes, una sola vez, nombre desconocido, consulta fallida, Escape, sondeo; lista única del Empleado y del Cliente con y sin "Cambiar de cuenta"; "Ver datos del comercio"; datos personales y contraseña dentro del layout del comercio; `perfil.html` redirige; regresión del perfil del Dueño; 375 px). Playwright completo, `workers: 1`, desde una base reseteada: **653/653** (19,9 min), sin fallas conocidas reapareciendo. Sin cambios de backend (no se corrió `mvnw test`, Newman ni estrés). WebKit/iPhone sin probar. Capturas a 375 px en `testing/playwright/tmp-capturas/e2b-b6-*.png`.

Fuera de esta carpeta: `CLAUDE.md`, `docs/DECISIONES.md` y `docs/DATA-TESTID-FASE17.md`.

## Tramo E2, entrega B: pantallas del acceso del Empleado (2026-10-11)

Segunda y última entrega del tramo E2 (frontend y pruebas de pantalla; el servidor no cambió). El Empleado ya puede usar la aplicación: si su cuenta de Cliente es además Empleado de al menos un comercio, después de iniciar sesión ve un selector con "Cliente" y cada comercio (con el último que usó resaltado) y entra al que elija; si no es Empleado de ningún comercio entra directo como Cliente. Una pestaña nueva con la sesión ya iniciada entra directo al último contexto. Desde el perfil, "Cambiar de cuenta" abre una hoja con las mismas opciones. Dentro de un comercio el Empleado ve un panel de solo lectura: el mismo panel con las cuatro pestañas (Panel, Productos, Pedidos, Perfil), el distintivo "Empleado" debajo del nombre del comercio, "Ventas de hoy", los pedidos con el reembolso en términos simples ("Reembolso en proceso", "Reembolsado" o "Reembolso en revisión", con el monto), la lista de productos sin botones y un perfil con los datos operativos del comercio; sin campana de notificaciones, sin interruptor de cierre, sin acciones de pedidos y sin datos legales, equipo ni Mercado Pago. Si pierde el acceso a un comercio mientras lo usa, la aplicación lo detecta (en la próxima acción o en el sondeo de cada 15 segundos), le muestra "Ya no tenés acceso a este comercio" y lo lleva al selector, o al inicio de Cliente si no le queda ningún comercio.

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `requisitos-funcionales-empleado.md` (Acceso a Comercios): el login muestra el selector si hay al menos un comercio (ya no "con un solo comercio entra directo"), el Empleado no tiene la franja de selección del Dueño sino "Cambiar de cuenta" en el perfil, el estado de lo implementado en E2, y el contador "Ventas de hoy".
- `requisitos-funcionales-generales.md` (Selector de contexto): comportamiento del selector, de la pestaña nueva y de "Cambiar de cuenta", y que las pantallas de Cliente llevan al panel cuando la pestaña está en un comercio.
- `Historias de Usuario - Empleado.md` (HU-E02): mismo cambio, desde el punto de vista del Empleado.

**No cambiaron** `diccionario-de-datos.md` (sin tablas, columnas ni estados nuevos), `requisitos-no-funcionales.md`, los requisitos e historias de Administrador, Cliente, Comercio y Dueño, `alcance-y-limitaciones.md`, los DFD ni los diagramas ER y relacional.

**Cambio de comportamiento a confirmar:** con un solo comercio el login ahora muestra igual el selector (era "entra directo" en los requisitos anteriores). Es lo que pidió la consigna de esta entrega; si se prefiere entrar directo al único comercio, es un cambio chico.

**Pruebas:** Playwright 636/636 desde una base reseteada (`workers: 1`, 17,1 min; el spec `38-empleado-acceso-ui` nuevo de 49 tests; dos tests del spec `36` se actualizaron porque una cuenta recién invitada ahora pasa por el selector). Sin cambios de backend: no se corrió `mvnw test`, Newman ni los estreses.

Fuera de esta carpeta: `CLAUDE.md`, `docs/DECISIONES.md` y `docs/DATA-TESTID-FASE17.md`.

## Tramo E2, entrega A5: ajustes de los datos que ve el Empleado (2026-10-11)

Ajuste chico sobre la entrega A de E2. Dos cambios en lo que el servidor le devuelve al Empleado: el perfil del comercio suma el tipo de comercio, las modalidades de entrega, si puede cambiar el cierre y el texto de reapertura (el email de contacto sigue afuera hasta E3), y los pedidos y el resumen del día pasan a un formato reducido: el Empleado ve lo necesario para operar y atender al cliente (número y estado, nombre del cliente, entrega y dirección, ítems con precios, subtotal, total pagado, motivo de rechazo o anulación y fechas) y el estado del reembolso en términos simples (sin reembolso, en proceso, reembolsado o en revisión) con el monto, pero no los cargos de servicio, la comisión, el neto a cobrar ni nada de MercadoPago. El "facturado hoy" del Empleado es el subtotal de los productos facturados, sin descontar el cargo del comercio; el Dueño sigue viendo el neto y todo lo demás sin cambios.

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `requisitos-funcionales-empleado.md` (Acceso a Comercios y Permisos Delegados): el perfil reducido incluye ahora tipo de comercio, modalidades, cierre y reapertura; qué ve el Empleado de los pedidos y qué no, el reembolso en términos simples y el facturado bruto.
- `Historias de Usuario - Empleado.md` (HU-E03): mismo criterio, desde el punto de vista del Empleado.

**No cambiaron** `diccionario-de-datos.md` (sin tablas, columnas ni estados nuevos), `requisitos-no-funcionales.md`, `requisitos-funcionales-generales.md`, los requisitos e historias de Administrador, Cliente, Comercio y Dueño, `alcance-y-limitaciones.md`, los DFD ni los diagramas ER y relacional. Observación sin corregir: `requisitos-funcionales-comercio.md` describe el "facturado hoy" del Dueño como la suma del subtotal, pero el sistema suma el subtotal menos el cargo de servicio del comercio.

**Pruebas:** `mvnw test` 530/530 (524 + 6 nuevos); Playwright 587/587 desde una base reseteada (`workers: 1`, 16,8 min; el spec `37` pasa de 30 a 38 tests; los specs 22, 26, 35 y 37 juntos dieron 146/146); Newman con la carpeta 57 de 138 requests y 205 assertions definidas (antes 118 y 168), colección completa 1901 requests ejecutados (1846 definidos) y 3034 assertions con 0 fallos; estrés del tramo E2 (S1 a S4) sin problemas y sin `Deadlock found` ni `Lock wait timeout`. No reapareció ninguna de las fallas no reproducidas conocidas.

Fuera de esta carpeta: `CLAUDE.md`, `docs/DECISIONES.md`, `postman/Bajonea-MVP.postman_collection.json` y `postman/Bajonea-Local.postman_environment.json` (carpeta 57 regenerada).

## Tramo E2, entrega A: acceso de lectura del Empleado (2026-10-10)

Primera entrega del tramo E2 (backend y tests, sin pantallas). El servidor ya reconoce al Empleado como actor sobre un comercio y le abre cuatro lecturas: el perfil del comercio con un conjunto reducido de datos (nombre, foto, descripción, dirección del local, teléfono, horarios, estado y si está abierto o cerrado manualmente; sin datos fiscales ni del titular), la lista de productos, la lista de pedidos y el resumen de pedidos del día. Las acciones siguen cerradas al Empleado hasta el tramo E3. Un Empleado tiene acceso a los comercios Aprobados, Aptos para Venta, Suspendidos y Cerrados Temporalmente donde su relación está Activa; cualquier otro caso (comercio inexistente, de otro Dueño, sin relación Activa, en otro estado) responde exactamente lo mismo, un "no encontrado" (404) con el mismo mensaje y el mismo código. Hay además una lista propia, "mis comercios", para el Empleado. **La decisión 7 de este tramo (aviso corto y redirección, sin pantalla "Ya no tenés acceso") reemplaza a la 22 del 2026-10-05**, que preveía una pantalla "Ya no tenés acceso a ningún comercio" con el botón "Entrar como Cliente".

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `requisitos-funcionales-empleado.md` (Acceso a Comercios): aviso corto y redirección en lugar de la pantalla dedicada, "no encontrado" idéntico para todos los casos de rechazo, la relación se comprueba en cada solicitud, y una nota del estado de implementación de E2.
- `Historias de Usuario - Empleado.md` (HU-E05): mismo cambio, desde el punto de vista del Empleado.
- `requisitos-funcionales-generales.md` (Autenticación y selector de contexto): mismo cambio.

**No cambiaron** `diccionario-de-datos.md` (sin tablas, columnas ni estados nuevos), `requisitos-no-funcionales.md`, los requisitos e historias de Administrador, Cliente, Comercio y Dueño, `alcance-y-limitaciones.md`, los DFD ni los diagramas ER y relacional.

**Pruebas:** `mvnw test` 524/524 (495 + 29 nuevos: 19 del resolver con actor, 6 de la prueba de clasificación de rutas y 4 de `mis-comercios` y el perfil reducido). Playwright, con el spec `37-empleado-acceso-api` nuevo de 30 tests: 579 tests en total; la corrida completa desde una base reseteada (`workers: 1`, 14,7 min) dio 579/579, sin ninguno de los inestables conocidos. Una corrida anterior, también desde base reseteada, dio 566 pasados y 1 fallo en `28-multicomercio-tramo5-api:154` (una consulta de `cuenta_mercado_pago` que devolvió 0 filas donde esperaba 1), tras el cual el modo serial del spec dejó 12 sin correr; el spec 28 solo dio 15/15 y con `--repeat-each=6` dio 90/90, así que no se reprodujo y queda como intermitente observado, sin relación con este tramo (no toca Mercado Pago). Newman: carpeta 57 nueva de 118 requests y 168 assertions definidas; colección completa desde base reseteada, 1881 requests ejecutados (1826 definidos) y 2997 assertions con 0 fallos; una primera corrida marcó 4 fallos esperables (el negativo de la carpeta 13 que esperaba 403 para un Cliente, reescrito como 404, y los dos "header ausente del Dueño" de la carpeta 57, que el script global de la colección completaba con el comercio activo hasta que se le agregó a la carpeta el script que lo quita). Estrés `stress-locks-empleado-e2.mjs` (S1 lecturas contra activar y desactivar la relación, S2 lecturas contra cambios de estado del comercio, S3 `mis-comercios` contra cambios de relación y de estado, S4 el Dueño abriendo y cerrando mientras el Empleado lee; 10 rondas cada uno): sin problemas, solo `200` y `404` (y en S4 `200` en cierre y apertura), con el `404` siempre idéntico, y 0 `Deadlock found` ni `Lock wait timeout` en el log del backend. En las corridas de este tramo no reapareció ninguna de las fallas conocidas de otros tramos (`36:485` con 376 a 378 px contra 375 y el test del proceso de vencimiento pasaron; el estrés de E1, donde apareció "avisos al Dueño 1" en S2, no se volvió a correr porque el tramo no toca invitaciones).

Fuera de esta carpeta: `CLAUDE.md`, `docs/DECISIONES.md`, `postman/Bajonea-MVP.postman_collection.json` y `postman/Bajonea-Local.postman_environment.json` (carpeta 57 nueva y un negativo de la carpeta 13 reescrito: el Cliente sin relación ya no recibe 403 sino 404 en `GET /comercios/perfil`). El `README` de Playwright no se actualizó (pendiente: el orden de los constructores de Newman termina ahora en `build-empleado-tramoE2-postman.mjs`).


## Tramo E1, bloque A9: reenviar y cancelar solo la invitación más reciente de cada email (2026-10-10)

Ajuste chico de integridad. Hasta A8 la API dejaba reenviar o cancelar por id una invitación vieja aunque ya existiera otra más nueva del mismo email en el mismo comercio (por ejemplo, la 10 quedó vencida, se reenvió y nació la 11; cancelar la 10 la pasaba a Cancelada y escribía un evento de cancelación en el historial con la 11 todavía vigente). La pantalla no lo permitía porque solo lista la más reciente, pero la API sí. Ahora una invitación solo se reenvía o se cancela si es la más reciente (mayor id) de su comercio y email, sea cual sea su estado; si hay una más nueva, el sistema responde 409 y no escribe nada. Mensajes: al reenviar, si la más nueva es una pendiente vigente se conserva "Ya hay una invitación pendiente para ese email. Podés reenviarla."; en cualquier otro caso, "Esta invitación ya no se puede reenviar"; al cancelar, siempre "Esta invitación ya no se puede cancelar". Sin cambios de pantalla ni de base de datos.

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `diccionario-de-datos.md` (`EstadoInvitacionEmpleado.CANCELADA` e `InvitacionEmpleado`): regla de la invitación más reciente y su forma de resolverla sin bloqueos nuevos; se corrigió además una frase vieja que decía que cancelar acepta solo las pendientes. También se actualizó la copia de `docs/diccionario-de-datos.md` (idéntica).
- `requisitos-funcionales-dueño.md` (Gestión de Empleados): reenviar y cancelar solo sobre la invitación más reciente de cada email.
- `Historias de Usuario - Dueño.md` (HU-D07 y HU-D08): mismo criterio, desde el punto de vista del Dueño.
- `alcance-y-limitaciones.md`: la limitación de las invitaciones vencidas suma la misma regla.

**No cambiaron** `requisitos-no-funcionales.md`, los requisitos e historias de Cliente, Empleado y Administrador, los DFD ni los diagramas ER y relacional (sin tablas, columnas ni flujos nuevos).

**Pruebas:** `mvnw test` 495/495; Playwright (specs 35 y 36) 97/97; Newman 1761 requests y 2829 assertions con 0 fallos; estrés de E1 (S1–S13) sin problemas y sin `Deadlock found` ni `Lock wait timeout` (una primera corrida marcó un faltante en S2 que no se repitió en 90 rondas aisladas ni en una corrida completa posterior; en una corrida de los specs 35 y 36 falló una vez el test del proceso de vencimiento, que no toca esta regla, y no se reprodujo en las tres corridas siguientes).

Fuera de esta carpeta: `CLAUDE.md`, `docs/DECISIONES.md`, `postman/Bajonea-MVP.postman_collection.json` y `postman/Bajonea-Local.postman_environment.json` (carpeta 56 regenerada).

## Tramo E1, bloque A8: vencimiento automático de invitaciones, cancelar ampliado y menú en todas las filas (2026-10-10)

Cuatro cambios tras la prueba manual de A7. **"Vencida" es un estado guardado:** un proceso automático (cada minuto) pasa a `VENCIDA` toda invitación `PENDIENTE` cuyo plazo de 7 días terminó; "Pendiente" pasa a significar "dentro del plazo en que se puede aceptar, reenviar o cancelar". Reemplaza la decisión de A7 (estado calculado al consultar, materialización perezosa). **Cancelar** acepta invitaciones pendientes, vencidas y con el código bloqueado. En **Solicitudes** todas las filas llevan el menú de tres puntos con "Reenviar" y "Cancelar" (se quitó el botón directo "Reenviar" de A7). Y en la hoja de invitar, el texto de promesa del código se oculta mientras se muestra el aviso de rechazo.

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `diccionario-de-datos.md` (`EstadoInvitacionEmpleado` e `InvitacionEmpleado`): `PENDIENTE` y `VENCIDA` redefinidos (estado guardado, proceso automático cada minuto, red de seguridad si se atrasa), `CANCELADA` con los estados cancelables. También se actualizó la copia de `docs/diccionario-de-datos.md` (idéntica).
- `requisitos-funcionales-dueño.md` (Gestión de Empleados): vista del equipo con menú en todas las filas, proceso automático de vencimiento y estados cancelables y reenviables.
- `Historias de Usuario - Dueño.md` (HU-D07 y HU-D08): reenviar y cancelar pendiente, vencida o con código bloqueado; menú en todas las líneas; Vencida marcada por el sistema.
- `alcance-y-limitaciones.md`: la limitación "Invitaciones vencidas sin job" se reescribe (hay proceso automático; qué pasa si estuviera detenido).

**No cambiaron** `requisitos-no-funcionales.md`, los requisitos e historias de Cliente y Empleado, los DFD ni los diagramas ER y relacional (sin tablas, columnas ni flujos nuevos hacia afuera: el proceso es interno).

**Nota para el checklist manual:** desde A8, "Vencida" es un estado guardado en la base; una invitación pasa a `VENCIDA` sola, hasta un minuto después de cumplirse su fecha de vencimiento.

**Pruebas:** `mvnw test` 490/490; Playwright 548/548; Newman 1755 requests y 2815 assertions con 0 fallos; estrés de E1 (S1–S13) sin problemas y sin `Deadlock found` ni `Lock wait timeout`.

Fuera de esta carpeta: `CLAUDE.md`, `docs/DECISIONES.md`, `docs/APRENDIZAJES-TECNICOS.md`, `testing/playwright/README.md`, `postman/Bajonea-MVP.postman_collection.json` y `postman/Bajonea-Local.postman_environment.json` (carpeta 56 regenerada). `.claude/skills/skill-validaciones/SKILL.md` no cambió: no hay validaciones nuevas.

## Tramo E1, bloque A7: ajustes tras la prueba manual (2026-10-09)

Cuatro cambios de producto y un bug. **Bug "Vencida desaparece":** el listado de "Ver equipo" solo traía las invitaciones `PENDIENTE` e `INVALIDADA`, así que una invitación vencida dejaba de verse en cuanto se materializaba (al invitar de nuevo o reenviar al mismo email); ahora se muestra una línea por email con su invitación más reciente. **`REEMPLAZADA`** ya no pisa la causa original: al reenviar, solo una pendiente todavía vigente queda reemplazada; una vencida o con el código bloqueado conserva su estado. **Edad:** el alta de Empleado por invitación exige 18 años y nunca muestra el mensaje de 14 (el de 14 queda solo en el registro de Cliente); la pantalla avisa en tiempo real apenas se completa la fecha. **"Ver equipo"** pasa a dos pestañas con contador ("Mi equipo · N" y "Solicitudes · N"). **Rechazo al invitar:** un único aviso fijo, sin revelar el motivo, con el botón deshabilitado para ese email.

**Documentos de esta carpeta que cambiaron** (Diego los copia a mano a `01.` y `02.`):
- `diccionario-de-datos.md` (`EstadoInvitacionEmpleado` e `InvitacionEmpleado`): reglas de `REEMPLAZADA` (solo la pendiente vigente), `VENCIDA` calculada contra materializada, listado de una línea por email y reglas de reenvío. También se actualizó la copia de `docs/diccionario-de-datos.md` (idéntica).
- `Historias de Usuario - Dueño.md` (HU-D07 y HU-D08): aviso único de rechazo, reenvío sin pisar el estado, una sola línea por email, pestañas "Mi equipo" y "Solicitudes".
- `requisitos-funcionales-dueño.md` (Gestión de Empleados): reenvío, aviso único de rechazo y vista del equipo con pestañas.
- `Historias de Usuario - Empleado.md` (HU-E01) y `requisitos-funcionales-empleado.md` (Edad mínima): 18 años con cualquier edad menor, aviso en tiempo real, nunca el mensaje de 14.
- `Historias de Usuario - Cliente.md` (HU-C01): el aviso de 14 años aparece al completar la fecha.
- `alcance-y-limitaciones.md`: la limitación de las invitaciones vencidas suma que en la base la fila sigue Pendiente hasta materializarse.

**No cambiaron** `requisitos-no-funcionales.md`, `requisitos-funcionales-cliente.md` (el servidor conserva su texto de 14 años), los DFD ni los diagramas ER y relacional (sin tablas, columnas ni flujos nuevos).

**Nota para el checklist manual:** "Vencida" es un estado calculado al listar; en la base la fila sigue `PENDIENTE` hasta que se materializa (al invitar o reenviar al mismo email).

**Pruebas:** `mvnw test` 480/480; Playwright 543/543; Newman 1737 requests y 2786 assertions con 0 fallos; estrés de E1 sin problemas y sin `Deadlock found` ni `Lock wait timeout`.

Fuera de esta carpeta: `CLAUDE.md`, `docs/DECISIONES.md`, `docs/APRENDIZAJES-TECNICOS.md`, `testing/playwright/README.md`, `.claude/skills/skill-validaciones/SKILL.md`, `postman/Bajonea-MVP.postman_collection.json` y `postman/Bajonea-Local.postman_environment.json` (carpeta 56 regenerada).

## Tramo E1, bloque A6: edad mínima, 14 años para Cliente y 18 para Empleado (2026-10-08)

Reglas nuevas: el registro de Cliente y la cuenta nueva por invitación exigen 14 años cumplidos (anotación `@EdadMinima`, validada en el DTO) y el Empleado, 18 (regla del servicio de invitaciones: cuenta nueva de 14 a 17 años = 400 en `cuentaNueva.fechaNacimiento`; cuenta existente menor de 18 = 409 al validar y aceptar; invitar o reenviar a una cuenta activa menor de 18 = el 409 genérico "No se puede invitar a este email", sin email de regularización). La edad se calcula con la fecha del día del servidor (cumplir los años ese mismo día alcanza) y es la declarada: no se verifica identidad ni DNI. Sin migraciones; las cuentas existentes no se revisan. Backend, Newman (carpeta 56 de 125 a 158 requests y 4 requests de borde en la 22), Playwright (spec 35 +5 tests, spec 36 +2) y estreses; sin cambios de frontend de producción.

**Documentos de esta carpeta que cambiaron** (las carpetas `01.` y `02.` no se editaron):
- `requisitos-funcionales-cliente.md` (sección Registro y Perfil): viñeta nueva con el mínimo de 14 años, el mensaje, que la edad es declarada y que solo se evalúa al registrarse.
- `Historias de Usuario - Cliente.md` (HU-C01): el cliente tiene que tener 14 años o más; si no, el aviso va bajo la fecha de nacimiento y no se crea la cuenta.
- `requisitos-funcionales-empleado.md` (Invitación y Alta): viñeta "Edad mínima" con los 18 años, los dos 400 y 409 y los tres mensajes.
- `Historias de Usuario - Empleado.md` (HU-E01): criterio nuevo de 18 años, con la regla de 14 del registro y la edad declarada.
- `requisitos-funcionales-dueño.md` (Gestión de Empleados): viñeta "Edad mínima" al invitar (409 genérico, sin email de regularización, orden después del rol y del estado).
- `Historias de Usuario - Dueño.md` (HU-D07): el mensaje "No se puede invitar a este email" suma a la cuenta activa con menos de 18 años declarados.
- `alcance-y-limitaciones.md`: limitación "Edad mínima declarada" (sin verificación de identidad; la regla de 14 no se aplica a cuentas existentes; Dueño y Comercio no cambian).

**No cambiaron** `requisitos-no-funcionales.md`, `diccionario-de-datos.md` ni los DFD y diagramas (no hay datos ni flujos nuevos: la fecha de nacimiento ya existía).

**Pruebas:** `mvnw test` 478/478; Playwright 534 tests (533 en la corrida completa más un inestable conocido que falló una vez y pasó 20/20 tras ajustar su espera); Newman 1734 requests y 2777 assertions con 0 fallos; los seis estreses sin problemas y sin `Deadlock found` ni `Lock wait timeout`.

Fuera de esta carpeta: `CLAUDE.md` (fila E1, §1bis, §3 y §5bis), `docs/DECISIONES.md` (entrada nueva), `testing/playwright/README.md`, `.claude/skills/skill-validaciones/SKILL.md` (fila de `@EdadMinima`), `postman/Bajonea-MVP.postman_collection.json` y `postman/Bajonea-Local.postman_environment.json` (carpetas 22 y 56 y 47 variables `e1_*` vacías nuevas).

## Tramo E1, bloque B3: "Ver equipo" del Dueño y carrera del perfil del Comercio (2026-10-08)

Solo frontend y pruebas; backend, migraciones, Newman y estreses sin cambios. Vista "Ver equipo" dentro de `comercio-perfil.html` (`js/equipo-comercio.js`, nuevo): lista de miembros e invitaciones del comercio activo con su estado (Activo, Inactivo, Pendiente con "vence en N días", Vencida, Código bloqueado), hoja "Invitar al equipo" con los errores del servidor bajo el campo, menú de las invitaciones (Reenviar código; Cancelar invitación con confirmación), estado vacío, skeletons, error con "Reintentar" y actualización cada 15 s. Además, corrección de la carrera del perfil del Comercio (los botones del perfil nacen deshabilitados hasta terminar de enlazar y cargar). Playwright: spec 36 ampliado con 20 tests (38 en total), 526/527 desde base reseteada (el fallo es una intermitencia de un test de B2, aislado 15/15).

**Un documento de esta carpeta se corrigió:** `AUDITORIA-E1.md` (sección 8, tabla de archivos). Decía que `invitacion-empleado.html` era un "asistente de tres pasos"; la pantalla tiene cuatro vistas (código, cuenta existente, cuenta nueva y éxito) y la cuenta nueva usa el asistente de dos pasos del registro de Cliente (datos personales con la cuenta, y dirección). Se corrigió en el mismo archivo (es un documento de trabajo de esta carpeta, no una copia de `01.` ni `02.`). **No cambia ningún otro documento de esta carpeta** (requisitos, historias, diccionario y DFD ya describen el flujo; el barrido de menciones de "3 pasos" o "tres pasos" no encontró otras sobre la invitación). Las carpetas `01.` y `02.` no se editaron.

Fuera de esta carpeta: `CLAUDE.md` (fila E1, §3 y la lista de inestables), `docs/DECISIONES.md` (entrada nueva) y `testing/playwright/README.md` (estado, inestables y spec 36).

## Tramo E1, bloque B2: pantalla pública de invitación, enlaces y aviso en el login (2026-10-08)

Solo frontend y pruebas; backend, migraciones, Newman y estreses sin cambios. Pantalla nueva `invitacion-empleado.html` (`js/invitacion-empleado.js`): paso del código (email y OTP de 6 dígitos, `validar`), confirmación para cuenta existente, creación de cuenta con el asistente de dos pasos del registro de Cliente (sin un tercer paso) y pantalla de éxito con "Iniciar sesión" (aceptar no inicia sesión); enlace "Tengo una invitación" en el pie del login y línea "¿Te invitaron a trabajar en un comercio? Tengo una invitación" en la elección del tipo de cuenta; aviso verde de un solo uso en el login tras aceptar. Spec 36 (18 tests, primera parte); Playwright 507/507 desde base reseteada.

**Ningún documento de esta carpeta necesitó cambios:** `Historias de Usuario - Empleado.md` (HU-E01) y `requisitos-funcionales-empleado.md` (sección Invitación y Alta) ya describen el recorrido implementado: llegada desde el enlace del email, el botón del login o la línea del registro; los mismos datos del registro de Cliente (incluida la dirección) con Términos validados en el servidor; solo email y código para una cuenta existente; y el paso al login sin sesión automática. Las carpetas `01.` y `02.` no se editaron.

Fuera de esta carpeta: `CLAUDE.md` (fila E1 y §3), `docs/DECISIONES.md` (entrada nueva) y `testing/playwright/README.md` (spec 36 y estado).

## Tramo E1, bloque B1: asistente de registro de Cliente extraído a un módulo compartido (2026-10-08)

Refactor del frontend sin cambios de comportamiento ni de aspecto: `js/cliente-form.js` (`montarFormularioCliente`) y `js/form-utils.js` nuevos, `js/auth.js` y `registro-cliente.html` adelgazados. Lo van a usar el registro de Cliente y, en B2, la pantalla pública de invitación.

**No cambia ningún documento de esta carpeta** (requisitos, historias, diccionario y DFD quedan igual: el comportamiento del registro es el mismo). Las carpetas `01.` y `02.` no se editaron.

**Pruebas:** Playwright completo 485/485 desde base reseteada (sin tests nuevos); capturas del registro en móvil y escritorio, 7 estados cada una, idénticas antes y después (13 de 14 byte a byte; la restante varía entre 22 y 117 píxeles entre corridas del mismo código) y DOM idéntico salvo el `id` agregado a `<main>`. No se corrieron `mvnw test`, Newman ni estreses porque el backend no cambió.

Fuera de esta carpeta: `CLAUDE.md` (fila E1 y §3), `docs/DECISIONES.md` (entrada nueva) y `testing/playwright/README.md` (inestables conocidos).

## Tramo E1, bloque A5b: pruebas de las invitaciones y arreglo de interbloqueos (2026-10-08)

Último bloque de la entrega A de E1: spec de Playwright a nivel API (`35-empleado-invitacion-api`, 37 tests), carpeta `56` de Newman (125 requests y 201 assertions definidas, constructor `build-empleado-tramoE1-postman.mjs`) y el estrés `stress-locks-empleado-e1.mjs` (S1 a S11 y un S12 extra). El estrés encontró dos interbloqueos reales en `validar`/`aceptar` y en invitar/reenviar; se arreglaron bloqueando las invitaciones por clave primaria (`InvitacionEmpleadoRepository.findByIdInConBloqueo`) con dos tests de regresión en Java. Sin frontend ni migraciones.

**No cambia ningún documento de esta carpeta** (requisitos, historias, diccionario y DFD quedan igual: el comportamiento ya estaba decidido y documentado; el arreglo solo cambia cómo se toman los bloqueos). Las carpetas `01.` y `02.` no se editaron.

**Pruebas:** `mvnw test` 451/451; Playwright 485/485; Newman 1697 requests y 2716 assertions con 0 fallos (colección con la carpeta nueva); los seis estreses sin problemas y sin `Deadlock found` en el log del backend.

Fuera de esta carpeta: `CLAUDE.md` (fila E1 y orden de bloqueo), `docs/DECISIONES.md` (entrada nueva), `docs/APRENDIZAJES-TECNICOS.md` (entrada nueva sobre el bloqueo por rango), `testing/playwright/README.md`, `postman/Bajonea-MVP.postman_collection.json` y `postman/Bajonea-Local.postman_environment.json` (solo se agregan la carpeta `56` y 103 variables `e1_*` vacías).

## Tramo E0: mantenimiento previo a E1 (2026-10-08)

Mantenimiento sin código de producción: referencias a las contraseñas de prueba, eliminación del puntero `docs/CAMBIOS.md` y estabilización del test 12:251 de Playwright.

**No cambia ningún documento de esta carpeta** (requisitos, historias, diccionario y DFD quedan igual). Las carpetas `01.` y `02.` no se editaron.

**Archivos tocados fuera de esta carpeta:** `CLAUDE.md` (fila E1 y lista de despliegue), `docs/APRENDIZAJES-TECNICOS.md`, `docs/DECISIONES.md` (entrada nueva y tres notas al pie), `docs/MAPEO-ARCHIVOS-TRAMO7.md`, `testing/playwright/tests/12-carrito-checkout-explorar.spec.ts` y `testing/playwright/README.md`. Eliminado: `docs/CAMBIOS.md` (puntero a este archivo; este es el registro activo).

**Pruebas:** spec 12 completo con `--repeat-each=10` desde una base reseteada: 70/70 (12:251 10/10). No se corrieron `mvnw test`, Newman ni estreses porque el backend y el frontend no cambiaron.

## Tramo E1, bloque A5a: mantenimiento de pruebas (2026-10-08)

Alineación del constructor de Newman de comercio con la colección commiteada y estabilización del spec 11 de Playwright. Solo cambian scripts y pruebas; no hay cambios de backend ni de frontend.

**No cambia ningún documento de esta carpeta** (requisitos, historias, diccionario y DFD quedan igual).

**Pruebas:** Newman 1571 requests y 2515 assertions con 0 fallos; spec 11 con 20 repeticiones 200/200; Playwright completo 448/448.

Fuera de esta carpeta, en `docs/`: `DECISIONES.md` (entrada nueva) y `CLAUDE.md` (fila E1). En `testing/playwright/README.md` se actualizan los tests inestables conocidos (salen `11:74` y `11:134`) y se anota el estado de los constructores.

## Tramo E1, bloque A4: endpoints del equipo del Dueño, validar con 409 y atajos de test (2026-10-06)

Quinto bloque del tramo E1: la capa web del equipo del Dueño (`GET /comercios/equipo`, `POST /comercios/equipo/invitaciones`, `POST .../{id}/reenviar`, `PUT .../{id}/cancelar`), el ajuste de `validar` y los atajos de test del perfil `test`. Es solo backend y pruebas Java; no hay migraciones, specs, requests de Newman ni estreses nuevos (A5) ni pantallas (entrega B). Las carpetas `01.` y `02.` no se editaron.

| Documento | Qué cambia |
|---|---|
| `requisitos-funcionales-empleado.md` | Sección Invitación y Alta: la pantalla de invitación prueba el código antes de pedir datos y, después de verificarlo, responde 409 (sin consumir la invitación) si la cuenta existente no es apta o es de Dueño o Administrador, o si el comercio no se puede aceptar; con un código incorrecto sigue la respuesta 401 única. |
| `requisitos-funcionales-dueño.md` | Gestión de Empleados: se precisa qué invitaciones se pueden reenviar (Pendiente, Vencida o con el código bloqueado) y cancelar (solo Pendiente; una ya resuelta no). |

Nada cambia en las historias, el diccionario, los requisitos del sistema ni los DFD.

**Pruebas:** `mvnw test` 449/449 (20 tests Java nuevos), Playwright 448/448, Newman 1571 requests y 2515 assertions con 0 fallos y los cinco estreses existentes sin problemas; sin deadlocks ni esperas de bloqueo en el log del backend.

Fuera de esta carpeta, en `docs/`: `DECISIONES.md` (entrada nueva, con el cambio de `validar` a 409 y por qué) y `CLAUDE.md` (§1bis, §3, §6 y §7bis).

## Tramo E1, bloque A3: validar y aceptar invitaciones de empleado (2026-10-06)

Cuarto bloque del tramo E1: del lado del invitado, probar el código de una invitación y aceptarla (con una cuenta existente o creando una cuenta nueva), con el aviso al Dueño y los dos endpoints públicos con su límite por IP. Es solo backend y pruebas Java; no hay migraciones, endpoints del Dueño (A4), specs, requests de Newman ni estreses nuevos (A5) ni pantallas (entrega B). Las carpetas `01.` y `02.` no se editan.

**No cambia ningún documento de esta carpeta.** El comportamiento implementado ya estaba decidido y escrito en `requisitos-funcionales-empleado.md`, `requisitos-funcionales-sistema.md` y `alcance-y-limitaciones.md` (respuesta `401` idéntica sin intentos restantes, 5 intentos y código invalidado, relación que nace `ACTIVO` o se reactiva reutilizando la fila, estados del comercio aceptables, aceptar y reenviar con `200`, la aceptación de los Términos validada y no guardada, la IP real detrás del proxy en la lista de despliegue) y se verificó contra el código. El diccionario de datos tampoco cambia: no hay columna ni tabla nueva. Detalles de implementación que ningún requisito menciona y que quedan solo en `docs/DECISIONES.md`: el límite de 10 pedidos por minuto por IP para validar y aceptar (compartido entre las dos rutas), el formato `cuentaNueva.campo` de los errores de validación de los datos de la cuenta nueva y el orden de bloqueo.

**Pruebas:** `mvnw test` 429/429 (40 tests Java nuevos), Playwright 447/448 (el fallo, `11:74`, pasó 30/30 aislado), Newman 1571 requests y 2515 assertions con 0 fallos y los cinco estreses existentes sin problemas; sin deadlocks ni esperas de bloqueo en el log del backend.

Fuera de esta carpeta, en `docs/`: `DECISIONES.md` (entrada nueva), `APRENDIZAJES-TECNICOS.md` (cuatro entradas y la sección nueva "Lista de despliegue") y `CLAUDE.md` (§1bis, §3, §5bis, §7, §7bis, §9 y la fila E1). En `testing/playwright/README.md` se anotan los resultados de esta corrida y los tests inestables conocidos (`01:100`, `11:134`, `12:251` y `14:124`).

## Tramo E1, bloques A1 y A2: esquema y servicios de invitación de empleado (2026-10-06)

Primer código del rol Empleado: migraciones `V29` a `V31`, entidades, repositorios y los servicios de invitar, reenviar, cancelar y listar el equipo, con los emails de invitación y de regularización. Todavía no hay endpoints ni pantallas (bloques A3 a A5 y entrega B). Las carpetas `01.` y `02.` no se editaron.

| Documento | Qué cambia |
|---|---|
| `diccionario-de-datos.md` (v1.12, y copia idéntica en `docs/diccionario-de-datos.md`) | `InvitacionEmpleado` (`V30`), `HistorialEmpleadoComercio` (`V31`) y el nuevo `EstadoEmpleadoComercio` (`V29`) pasan de "planificados" a "implementados"; `ActividadComercio` (`V32`) sigue planificada y se aplica en el tramo E3, no en E1. Se anotan el orden de bloqueo real al invitar, reenviar y cancelar, qué estados de invitación y motivos de historial escribe hoy el código (los demás llegan con A3 y E4), que la campana del Cliente filtra `canal = PUSH` y que los emails de invitación llevan un enlace genérico. Los cuatro estados de `EstadoInvitacionEmpleado` y los seis motivos no cambian. |

**Regla de emails que cambia (a revisar por Diego en los requisitos):** hasta ahora los emails de código (verificación, recuperación y reactivación de cuenta) no llevan enlaces al frontend y piden ingresar el código en la pantalla de la app. El email de **invitación** de empleado es la excepción decidida: lleva el código y un **enlace genérico** a `{app.frontend-base-url}/invitacion-empleado.html`, sin código, sin email y sin `#` en la URL. Los requisitos y las historias del Empleado ya describen la entrada por esa pantalla; no hace falta reescribirlos, pero si algún documento afirma que ningún email del sistema lleva enlaces, esa frase ya no vale para la invitación.

Nada cambia en los requisitos, las historias ni los DFD en estos bloques. Fuera de esta carpeta, en `docs/`: `DECISIONES.md` (entrada nueva) y `CLAUDE.md` (§1bis, §3, §5 y las filas E1 de la tabla de fases).

## Registro de Cliente: `aceptaTerminos` validado en el servidor, y precisiones del tramo E1 (2026-10-06)

Primer bloque de E1 (A0). El registro de Cliente exige `aceptaTerminos` en el servidor; la aceptación se valida y **no se guarda** (decisión de Diego: no hay trazabilidad, versión, fecha ni página de Términos, y no se planea hacerla). Además se anotan los puntos (a) a (g) de las decisiones de E1 en los documentos del Empleado. Las carpetas `01.` y `02.` no se editaron.

| Documento | Qué cambia |
|---|---|
| `requisitos-funcionales-cliente.md` | Registro: el servidor rechaza (400) si `aceptaTerminos` falta o es falso; la aceptación se valida y no se guarda. |
| `Historias de Usuario - Cliente.md` | HU-C01: el cliente tiene que aceptar los Términos y Condiciones para registrarse. |
| `requisitos-funcionales-empleado.md` | Código incorrecto: 401 idéntico, sin intentos restantes, con el texto fijado; se puede aceptar con el comercio aprobado, apto para venta, cerrado temporalmente o suspendido y no con el comercio pendiente, rechazado, con rechazo definitivo o inactivo; reenviar y aceptar responden 200. |
| `requisitos-funcionales-dueño.md` | "Ver equipo": la invitación invalidada se muestra como "Código bloqueado" con el botón "Reenviar", y en E1 no hay pestaña Actividad (la tabla `V32` se aplica en E3); el email de regularización nombra solo al comercio. |
| `requisitos-funcionales-sistema.md` | Invitaciones: los mismos puntos (401 idéntico, estados del comercio al aceptar, 200 en reenviar y aceptar, email de regularización sin el Dueño, `V32` en E3). |
| `alcance-y-limitaciones.md` | Limitaciones del Empleado: invitación invalidada, aceptar según el estado del comercio, "Ver equipo" sin actividad en E1, email de regularización, IP real detrás del proxy en la lista de despliegue; y una limitación nueva: los Términos y Condiciones se validan sin guardarse (y no se planea guardarlos). |
| `AUDITORIA-E1.md`, `AUDITORIA-EMPLEADO-FASE1.md` | Notas de actualización del 2026-10-06: Q2 resuelta (no se guarda), Q4 y Q8 decididas, H11 resuelto. |

Fuera de esta carpeta, en `docs/`: `AUDITORIA-EXHAUSTIVA-CLIENTE.md` (nota de actualización sobre `aceptaTerminos`), `DECISIONES.md` (entrada nueva y nota en la entrada del 2026-10-05) y `CLAUDE.md` (§1bis, §5bis, §9 y las filas E1 y E3 de la tabla de fases).

No cambian los PNG ni los DFD. Nada de este cambio requiere actualizar `diccionario-de-datos.md`: no hay columna ni tabla nueva.

## Rol Empleado — corrección de requisitos no funcionales y DFD, solo documentación (2026-10-05)

Segundo tramo de solo documentación del rol Empleado: alinea con las decisiones 1 a 34 los documentos que el tramo anterior había dejado con el diseño viejo. Todo lo nuevo está marcado como **planificado, tramos E1 a E4**. Las imágenes no se tocan: Diego regenera los PNG de Casos de Uso y de los DFD al final del bloque.

| Documento | Qué cambia |
|---|---|
| `requisitos-no-funcionales.md` | Seguridad: la línea sobre "más de un rol asociado simultáneamente" y el "rol activo elegido en el selector de contexto" se reemplaza por el diseño decidido: sin multirol físico (un solo rol en la base y en el token) y autorización del contexto "Empleado de un comercio" resuelta en cada request con el comercio activo y la relación Activa comprobada contra la base, con respuesta idéntica ante un comercio inexistente o ajeno. El resto no cambia. |
| `Diagrama de Flujo - Nivel 1 - Código Mermaid.md` | Dueño → P1: "Invitar, reenviar, cancelar, desactivar y reactivar empleados" (antes "Invitar, activar y desactivar"; no existe activación manual). P1 → Dueño: "Estado de invitaciones y del equipo de empleados". Empleado → P1: "Aceptar invitación, credenciales y renuncia". P1 → Empleado: "Confirmación de alta" (antes "Tokens y confirmación de alta"; la invitación no usa tokens). Empleado → P2: "Datos básicos, productos y apertura o cierre de comercios asignados" (antes incluía extras, horarios y redes sociales, que no son delegables hoy). Sintaxis validada con el parser de Mermaid 10. |
| `Diagrama de Flujo - Nivel 0 - Código Mermaid.md` | Empleado → Sistema: "Aceptación de invitación, productos y pedidos de los comercios asignados" (antes hablaba de un solo "comercio asignado" y no incluía el alta por invitación). Sintaxis validada. |

No cambian los PNG ni ningún documento de `01.` y `02.` (las versiones nuevas viven en esta carpeta). Fuera de esta carpeta, en `docs/`: `recorrido-trabajo-final.md` (ítem 11 del Bloque 3, reescrito con el diseño decidido y con la redacción anterior señalada), `modelo-mvp.md` (nota en las dos filas "mutuamente excluyente" entre `cliente` y `administrador`: son la regla del MVP, no la vigente) y `CLAUDE.md` (pendientes del rol Empleado).

## Rol Empleado — decisiones de diseño, solo documentación (2026-10-05)

Tramo de solo documentación: deja escrito el estado decidido del rol Empleado (decisiones 1 a 34 de `docs/DECISIONES.md`, entrada del 2026-10-05, apoyadas en `AUDITORIA-EMPLEADO-FASE1.md`). Todo lo nuevo está marcado como **planificado, se implementa en los tramos E1 a E4**: no existe código, migración ni pantalla, y no se aplicó `V29` a `V32`. Los documentos de `01.` y `02.` no se editaron. Cinco de los archivos de esta carpeta (`requisitos-funcionales-empleado.md`, `-generales.md`, `-administrador.md`, `Historias de Usuario - Empleado.md` y `- Administrador.md`) se copiaron desde `01. Análisis de Requerimientos` en su versión vigente antes de editarlos; el resto ya estaba acá. Para publicarlos, Diego copia cada archivo a mano a su carpeta de `01.` o `02.`.

| Documento | Qué cambia |
|---|---|
| `requisitos-funcionales-empleado.md` | Reescrito. Nuevas secciones: Modelo de Cuenta del Empleado (sin multirol físico, `rol = CLIENTE`, contexto por comercio activo, regla de combinaciones y su alcance), Invitación y Alta (estructura propia por comercio, código de 6 dígitos, cuenta nueva con datos del registro de Cliente y Términos validados en el servidor, cuenta existente con email y código, revalidación de la matriz al aceptar, va al login, 5 intentos y que un ex Empleado no puede registrar un comercio), Estados de la Relación (`ACTIVO`/`INACTIVO` en base; Pendiente y Vencida derivados de las invitaciones; baja, renuncia y reactivación), Acceso a Comercios (selector, comercios no operativos, qué ve y qué no, pantalla "Ya no tenés acceso"), Permisos Delegados (con DTO reducido; extras y horarios como futuros delegables), Restricciones (sumadas redes sociales, MercadoPago completo, actividad y alta/corrección de comercios; todo lo no clasificado bloqueado), Pedidos Propios, Trazabilidad, Notificaciones, Renuncia y Sesiones. Quita "PENDIENTE hasta confirmar el email", "DESACTIVADO" y la edición de redes sociales y horarios. |
| `requisitos-funcionales-dueño.md` | Sección Gestión de Empleados reescrita (invitación propia por comercio, solo con el comercio operativo, reenviar y cancelar, límites de 5 envíos por hora y 5 intentos, mensaje genérico para Dueños, Administradores y cuentas no aptas, email de regularización con tope de 3 por día, estados Activo/Inactivo/Pendiente/Vencida, desactivar, reactivar sin código solo si lo dio de baja el Dueño, historial y actividad, notificaciones T33 y T34, nombre de quien actuó). Permisos Exclusivos del Dueño ampliados (equipo, redes sociales, MercadoPago incluido el enlace de pago, corrección de comercios, documentación de habilitación, todo lo no delegable por defecto). La introducción ya no dice que las redes sociales son ejecutables por el Empleado. |
| `requisitos-funcionales-generales.md` | Autenticación: se reemplaza "más de un rol activo" por el modelo real (un rol en la base y en el token, contexto por comercio activo), se escribe la regla de combinaciones con su alcance y se agrega la subsección Selector de contexto (último contexto recordado, un comercio entra directo, sesión única en ambos contextos, "Ya no tenés acceso a ningún comercio", botón "Tengo una invitación"). Nombre de Usuario: el Empleado define el suyo al aceptar una invitación. Gestión de Tokens: pasan a tres tipos (las invitaciones tienen estructura propia). |
| `requisitos-funcionales-sistema.md` | Gestión de Tokens: tres tipos y remisión a las invitaciones. Propagación: las relaciones con Empleados no se tocan por cambios de estado de un comercio. Notificaciones: T16 solo al Dueño (el Empleado ve el estado en el selector), T30 marcada como planificada al final del E3, T31 solo por email, nuevos T33 (invitación aceptada), T34 (renuncia) y T35 (aviso de regularización), reglas de fan-out a cada Empleado, separación del listado del Cliente y filtro de canal Push. Secciones nuevas: Invitaciones de Empleado, Historial del Equipo de un Comercio y Actividad del Comercio. |
| `requisitos-funcionales-administrador.md` | Sección nueva "Ver Equipo de un Comercio" (botón en el modal de detalle del comercio, solo lectura de equipo, relaciones, invitaciones, historial y actividad; sin controles sobre cuentas de usuario). |
| `requisitos-funcionales-comercio.md` | El perfil del Empleado queda en datos reducidos y foto (horarios, cuando exista la función); las redes sociales son solo del Dueño; los extras se delegan al Empleado cuando exista la función. |
| `Historias de Usuario - Empleado.md` | Reescrito: HU-E01 con cuenta nueva o existente y el botón del login, HU-E02 con último contexto y sesión única, HU-E03 con los permisos reales, HU-E04 con las restricciones nuevas, comercios no operativos y pedido propio, HU-E05 con la pantalla "Ya no tenés acceso", y HU-E06 nueva (renuncia). |
| `Historias de Usuario - Dueño.md` | HU-D07 (invitar: matriz, mensaje genérico, reenviar, cancelar, notificación al aceptar) y HU-D08 (equipo: estados, reactivar, historial, actividad, nombre de quien actuó, renuncia). |
| `Historias de Usuario - Administrador.md` | HU-A17 nueva: Ver el equipo de un comercio (solo lectura). |
| `Historias de Usuario - Comercio.md` | HU-CO01 (el Empleado no ve datos fiscales y los horarios se habilitan después), HU-CO02 (redes sociales exclusivas del Dueño) y HU-CO06 (extras para el Empleado cuando exista la función). |
| `diccionario-de-datos.md` (y copia idéntica `docs/diccionario-de-datos.md`) | Versión 1.11 con estado "planificado". `RolUsuario.EMPLEADO`, `TipoToken.INVITACION_EMPLEADO`, `ActorCierre.EMPLEADO` y `ActorPedido.EMPLEADO`: sin uso. `EstadoEmpleadoComercio`: `ACTIVO`/`INACTIVO` (migración `V29` planificada). ENUM nuevos planificados: `EstadoInvitacionEmpleado`, `MotivoHistorialEmpleado`, `TipoEntidadActividad`, `AccionActividad`. `TipoNotificacion`: T1 a T35 y nota de reutilización de tipos (T33 a T35). Tablas: `Empleado` (se crea al aceptar, `rol` queda `CLIENTE`), `EmpleadoComercio` (nace al aceptar, `INACTIVO`, motivo en el historial) y tres tablas nuevas planificadas, `InvitacionEmpleado` (`V30`), `HistorialEmpleadoComercio` (`V31`) y `ActividadComercio` (`V32`). `Usuario.rol`, `Notificacion` (filtro de canal y del Cliente) y `RedSocial` (solo Dueño). Relaciones: se corrigen las filas 5 a 7 ("mutuamente excluyentes") y se suman las 59 a 67, y los UNIQUE nuevos. Sección 12: regla "Combinaciones de roles y contexto del Empleado". Corrige el hallazgo H4 de la auditoría. |
| `Diagrama Entidad-Relación-v3 - Código Mermaid.md` | Nueve relaciones nuevas, marcadas como planificadas, de `InvitacionEmpleado`, `HistorialEmpleadoComercio` y `ActividadComercio`. |
| `Modelo Relacional-v3 - Código Mermaid.md` | Encabezado a v1.11 con 49 tablas; entidades `InvitacionEmpleado`, `HistorialEmpleadoComercio` y `ActividadComercio` (marcadas como planificadas) y sus nueve relaciones. |
| `alcance-y-limitaciones.md` | Usuarios contemplados: Empleado reescrito, regla de combinaciones, contexto de operación sin multirol físico. Notificaciones: la invitación y el aviso de regularización. Limitaciones: no hay tope de empleados. Limitaciones Conocidas de Implementación: la línea "Empleado" se reemplaza por la lista de limitaciones del diseño decidido (sin multirol físico, un Cliente no pasa a Dueño, ex Empleado no registra comercio, intentos del código gastables por terceros, sesión única en ambos contextos, alta con dirección, T30 programado, horarios y extras sin endpoint, guard solo para el Empleado, suspensión rediseñada en un tramo aparte, invitaciones vencidas sin job y aviso de regularización) y la del nombre de usuario del Empleado. |

No cambian `requisitos-funcionales-cliente.md`, `Historias de Usuario - Cliente.md` ni `requisitos-no-funcionales.md`. **Los pendientes de revisión que dejaba este tramo se resolvieron en la sección siguiente** (`requisitos-no-funcionales.md`, DFD Nivel 1 y barrido de términos); los PNG de Casos de Uso y de DFD siguen sin regenerar.

## Tramo C3 — Bloqueo vigente al aprobar y al vincular, y confirmación única de la reactivación (2026-10-05)

Cierra dos comportamientos que el tramo C2 había dejado documentados como conocidos.

| Documento | Qué cambia |
|---|---|
| `diccionario-de-datos.md` | `EstadoComercio.CERRADO_TEMPORALMENTE`: también es el destino de un comercio que, con la cuenta del Dueño bloqueada, iba a quedar a la venta. Reglas de `Comercio`: nueva "regla del bloqueo vigente" (lectura del estado de la cuenta con bloqueo compartido antes de tocar la cuenta de cobro y el comercio, orden `usuario` → `cuenta_mercado_pago` → `comercio`; la aprobación deja dos filas de historial, la del Administrador y una automática `APROBADO → CERRADO_TEMPORALMENTE`; la vinculación deja una automática; un comercio que no llegaría a `APTO_VENTA` no cambia). `HistorialEstadoComercio`: los dos motivos automáticos nuevos. Tabla de eventos: aprobación y vinculación con el Dueño bloqueado, y la reactivación restaura una sola vez. (Copia idéntica en `docs/diccionario-de-datos.md`.) |
| `requisitos-funcionales-comercio.md` | Estado Cerrado Temporalmente: con el Dueño bloqueado ningún comercio queda a la venta (aprobación o vinculación de MercadoPago mientras la cuenta está bloqueada); un Aprobado sin cuenta de cobro no cambia. |
| `requisitos-funcionales-sistema.md` | Propagación Dueño → comercios: ningún camino deja un comercio en Apto para Venta con el Dueño Bloqueado (lectura con bloqueo de fila antes de decidir, fila de historial automática). La confirmación del código de reactivación de cuenta es única: una segunda confirmación, aun simultánea, se rechaza y cada comercio deja una sola fila de historial. |
| `alcance-y-limitaciones.md` | Se quita el comportamiento conocido "comercios aprobados o vinculados con la cuenta ya bloqueada que quedan a la venta" y se reemplaza por la regla nueva. Se agrega el comportamiento conocido: la suspensión de un comercio por el Administrador puede cruzarse con el tercer intento fallido del mismo Dueño (ventana de milisegundos, sin aparecer nunca en el estrés). |

No cambian el modelo relacional ni el diagrama entidad-relación (sin migraciones en este tramo). El botón "Volver al catálogo" del checkout con el comercio cerrado es solo de interfaz y no modifica ningún documento de requisitos.

## Tramo C2 — Bloqueo del Dueño y catálogo con comercios cerrados temporalmente (2026-10-04)

Pasajes que el tramo C1 había dejado como "diseño pendiente" y que ahora son comportamiento implementado.

| Documento | Qué cambia |
|---|---|
| `diccionario-de-datos.md` | `EstadoComercio.CERRADO_TEMPORALMENTE`: solo llegan los comercios que estaban en `APTO_VENTA`; sigue visible en el catálogo sin hora de reapertura. "Regla de visibilidad y venta": el catálogo lista `APTO_VENTA` y `CERRADO_TEMPORALMENTE`, orden de las validaciones de pedido, `estadoApertura`, `textoReapertura` nulo y `estado` público siempre `APTO_VENTA`; se quita el "diseño pendiente de implementar" de la aparición de los comercios bloqueados. Reglas de `Comercio`: la propagación del bloqueo es solo para `APTO_VENTA` y relee el estado con bloqueo de fila. `HistorialEstadoComercio`: el bloqueo y la restauración ya escriben historial. Tabla de eventos: el bloqueo solo cierra los `APTO_VENTA`. (Copia idéntica en `docs/diccionario-de-datos.md`.) |
| `requisitos-funcionales-comercio.md` | Estado Cerrado Temporalmente: solo desde Apto para Venta, un Aprobado sin cuenta de cobro no cambia, sin hora de reapertura, restauración según la cuenta de MercadoPago y cierre manual previo que sigue vigente. Regla de visibilidad: sin aviso de cuándo reabre, estado público siempre Apto para Venta y mismo mensaje de `409` que el cierre manual. |
| `requisitos-funcionales-cliente.md` y `Historias de Usuario - Cliente.md` | El comercio cerrado por bloqueo del Dueño se ve con la misma etiqueta, sin aviso de cuándo reabre. |
| `requisitos-funcionales-sistema.md` | Propagación del bloqueo solo a los comercios `APTO_VENTA` (una fila de historial por comercio, pedidos en curso sin tocar); restauración a Apto para Venta o Aprobado según la cuenta de MercadoPago; una segunda confirmación del mismo código de recuperación se rechaza. |
| `alcance-y-limitaciones.md` | Se quita la limitación "el catálogo no muestra los Cerrado Temporalmente" y se reemplaza por el comportamiento conocido: pedidos en curso de un Dueño bloqueado sin tocar, cierre manual previo que la reapertura automática puede apagar durante el bloqueo, comercios aprobados o vinculados con la cuenta ya bloqueada que quedan a la venta, restauración según la cuenta activa y sin avisos del bloqueo. |

No cambian el modelo relacional ni el diagrama entidad-relación (sin migraciones en este tramo).

## Tramo C1 — Cierre manual del comercio (commit `a812465`, 2026-10-04) — reconstruido desde `git diff 90933b8 a812465`

| Documento | Qué cambia |
|---|---|
| `diccionario-de-datos.md` | Versión 1.10. Dos ENUM nuevos: `AccionCierre` (`CERRADO`, `REABIERTO`) y `ActorCierre` (`DUENO`, `EMPLEADO` reservado, `SISTEMA`). Tabla nueva `HistorialCierreComercio` (`comercio_id`, `accion`, `actor_usuario_id` nulo solo para `SISTEMA`, `actor_rol`, `fecha_hora`; migración `V28`; reglas: alternan `CERRADO`/`REABIERTO` y la última coincide con la bandera, se escriben con el comercio bloqueado y se puede consultar la última fila `CERRADO`). `Comercio.cerrado_manualmente`: solo se prende y apaga dentro de una franja con el comercio `APROBADO` o `APTO_VENTA`, se apaga solo al empezar la primera franja posterior al cierre y cada cambio deja una fila de historial. "Regla de visibilidad y venta": el pedido también exige `cerrado_manualmente = false` (orden: estado, cierre manual, horario) y el comercio cerrado manualmente sigue en el catálogo como "temporalmente cerrado" (`estadoApertura`). Reglas de negocio de `Comercio`: la condición de recibir pedidos incluye el cierre manual, el cierre manual solo frena pedidos nuevos, cerrar dos veces no escribe una segunda fila, reapertura automática (job cada 60 segundos, se pone al día si el backend estuvo caído) y la limitación conocida de las franjas que cruzan la medianoche. Relaciones 24c y 24d. |
| `Diagrama Entidad-Relación-v3 - Código Mermaid.md` | Dos relaciones nuevas: `Comercio` — `HistorialCierreComercio` ("cierra_y_abre") y `Usuario` — `HistorialCierreComercio` ("ejecuta"). |
| `Modelo Relacional-v3 - Código Mermaid.md` | Encabezado actualizado a `diccionario-de-datos.md` v1.10 con 46 tablas (suma `HistorialCierreComercio` y `HistorialCambioComercio`, que el encabezado anterior no contaba). Entidad `HistorialCierreComercio` y sus dos relaciones. |
| `requisitos-funcionales-comercio.md` | El cierre manual solo con comercio Aprobado o Apto para Venta, Dueño Activo y dentro de una franja; se revierte a mano o al empezar la primera franja posterior. El catálogo muestra como "temporalmente cerrado" a un Apto para Venta con cierre manual (antes figuraba Aprobado) y como cerrado por horario al que está fuera de todas las franjas, con aviso de cuándo reabre. Cerrar o abrir dos veces no es error y no registra una segunda acción. Registro de quién y cuándo (`HistorialCierreComercio`). Interruptor del panel con tres estados ("Recibiendo pedidos", "Pedidos pausados", "Fuera de horario"), confirmación solo al cerrar, interruptor y chips solo para Apto para Venta, chip "Cerrado" en el selector, reapertura automática y franjas que cruzan la medianoche. |
| `requisitos-funcionales-cliente.md` | Comercios cerrados atenuados con etiqueta al final ("Cerrado" o "Cerrado temporalmente"), abiertos primero y filtro "Abierto ahora"; el estado lo informa el servidor. El detalle muestra el aviso de cuándo reabre ("Reabre hoy a las HH:mm", etc.) y no ofrece agregar al carrito. Si el comercio se cierra mientras se agrega un producto o se confirma el pedido, aviso de error con botón "Volver al catálogo"; el carrito no avisa antes. |
| `requisitos-funcionales-dueño.md` | Bloqueo de la desvinculación de MercadoPago por clientes que todavía pagan: botón "Cerrar comercio" ("Cerrar comercios") para los comercios Aptos para Venta abiertos y dentro de su horario, sin confirmación adicional; los comercios fuera de horario o no operativos cuentan como cerrados; el mensaje informa los nombres si alguno falla y, al terminar, queda solo el texto de espera. |
| `requisitos-funcionales-sistema.md` | Sección nueva "Reapertura Automática del Cierre Manual de Comercios": job cada 60 segundos, una transacción por comercio con el comercio bloqueado, puesta al día tras una caída, aviso en el log si la bandera estaba prendida sin fila `CERRADO`, y sin franjas no se reabre solo. El job se suma a la lista de procesos que registran su ejecución. |
| `alcance-y-limitaciones.md` | El catálogo muestra el cierre manual sobre Apto para Venta, que solo se activa dentro del horario y se apaga solo al empezar la próxima franja. La limitación del cierre manual que "ningún código usaba" se reemplaza por las franjas partidas o que cruzan la medianoche (la reapertura puede ocurrir al empezar el segundo tramo, 23:59 se interpreta como fin del día, sin franjas no se reabre, sin pantalla de historial ni avisos de cierre). La desvinculación de MercadoPago deja de decir que el cierre manual no está implementado. |
| `Historias de Usuario - Cliente.md` | Criterios de aceptación para ver los comercios cerrados atenuados con etiqueta, abiertos primero, filtro "Abierto ahora", detalle con cuándo reabre y aviso con botón para volver al catálogo. |
| `Historias de Usuario - Comercio.md` | Criterios de aceptación del cierre manual: solo dentro de una franja y con el comercio Aprobado o Apto para Venta, efectos sobre el carrito, el pedido y el catálogo, doble toque sin error, reapertura automática, registro de quién y cuándo, interruptor con tres estados, confirmación solo al cerrar, interruptor solo con Apto para Venta y chip "Cerrado" en el selector. |
| `Historias de Usuario - Dueño.md` | La desvinculación bloqueada ofrece "Cerrar comercio" ("Cerrar comercios") para los comercios abiertos dentro de su horario; si ya están todos cerrados, solo el texto de espera. |

## Tramo 5 (5A y 5B) — reconstruido desde `git diff c081fb6 90933b8` (intervalo completo, ver la nota de arriba)

| Documento | Qué cambia |
|---|---|
| `diccionario-de-datos.md` | Versión 1.9. `TipoComercio.HAMBURGUESERIA` (`V20`). `EstadoComercio.RECHAZADO` (se puede corregir y re-solicitar hasta 3 veces, `comercio.resolicitudes.max`) y `RECHAZO_DEFINITIVO` (estado terminal). `EstadoPedido.EXPIRADO` (30 minutos, `pedido.timeout.respuesta-comercio-minutos`), el valor `TIMEOUT_RESPUESTA_COMERCIO` del ENUM de timeouts automáticos, el valor `SPLIT_NO_APLICADO` del ENUM de causas de alerta de `AlertaWebhookMp` (`V22`), los estados `FALLIDO` y `PENDIENTE_REVISION_MANUAL` del proceso de reembolso, el ENUM nuevo `MotivoNotaCredito` (cinco valores) y el tipo de notificación `PEDIDO_EXPIRADO_CLIENTE`. `Usuario`: `nombre_usuario` (credencial de login, `V19`: 8 a 20 caracteres, solo letras y números, minúsculas, único, `utf8mb4_bin` con `CHECK`), `email` ya no es credencial y pasa a `VARCHAR(254)`, el `sub` del JWT es el id del usuario. Tabla nueva `HistorialCambioNombreUsuario` (`V21`, máximo 3 cambios cada 30 días corridos). `Comercio`: `tipo_comercio` (13 valores), `fecha_resolicitud`, `cantidad_resolicitudes` y las reglas de corrección y re-solicitud, elegibilidad para agregar un comercio adicional y que un `RECHAZO_DEFINITIVO` no se puede suspender. `CuentaMercadoPago`: `dueno_id` único (una sola cuenta por Dueño, compartida por todos sus comercios), `mp_user_id` único entre cuentas activas vía la columna generada `mp_user_id_activo` (`V27`), desvinculación que pasa todos los `APTO_VENTA` a `APROBADO` y se rechaza con pagos pendientes, vinculación que pasa todos los `APROBADO` a `APTO_VENTA`, creación de pedido con lectura del comercio con bloqueo compartido. `HistorialEstadoComercio`: motivo obligatorio también en `RECHAZO_DEFINITIVO`, re-solicitud con motivo fijo, `RECHAZO_DEFINITIVO` en los dos ENUM (`V24`) y cómo obtener el último rechazo. Tabla nueva `HistorialCambioComercio` (`V26`, una fila por campo cambiado en cada re-solicitud). Pagos: monto esperado y capturado del split en `AlertaWebhookMp`. |
| `Diagrama Entidad-Relación-v3 - Código Mermaid.md` | Relaciones nuevas: `Usuario` — `HistorialCambioNombreUsuario` y `HistorialEstadoComercio` — `HistorialCambioComercio`. |
| `Modelo Relacional-v3 - Código Mermaid.md` | Encabezado actualizado a `diccionario-de-datos.md` v1.7 con 44 tablas. `Usuario.nombre_usuario`, entidades `HistorialCambioNombreUsuario` y `HistorialCambioComercio`, `Comercio.cantidad_resolicitudes`, `CuentaMercadoPago.mp_user_id_activo`, `AlertaWebhookMp.monto_esperado` y `monto_capturado`, y sus relaciones. |
| `alcance-y-limitaciones.md` | Expiración del pedido a los 30 minutos sin respuesta del comercio (flujo de pago y tabla de estados). Limitaciones conocidas nuevas: verificación del split que solo deja rastro (`SPLIT_NO_APLICADO`), cuenta de prueba que depende de `MERCADOPAGO_TEST_TOKEN`, etiqueta fija del cargo al comercio, desvinculación de MercadoPago (hasta 30 minutos por pagos pendientes, plan B), una cuenta por Dueño y una cuenta en un solo Dueño, historial de estados del comercio, corrección y re-solicitud de comercios rechazados y login y registro por nombre de usuario (el login revela el estado de cuentas no activas, el aviso de intentos revela que el usuario existe, el endpoint de disponibilidad sin límite de consultas, solo el Cliente cambia su nombre de usuario). Se aclara que lo listado son funcionalidades especificadas y todavía no implementadas, con fecha 2026-09-25. |
| `requisitos-funcionales-administrador.md` | Re-solicitudes en una bandeja propia, sin notificación, con detalle completo, intento sobre el máximo de 3, motivo anterior y datos cambiados (antes y ahora). Rechazo definitivo a pedido del administrador, o automático al agotar las re-solicitudes, con un interruptor en el modal de rechazo (activado y bloqueado en el último intento). Pendiente: pantalla de comercios rechazados y de rechazo definitivo. |
| `requisitos-funcionales-cliente.md` | Registro con nombre de usuario. El cliente cambia su nombre de usuario desde el perfil, hasta 3 veces cada 30 días corridos, con la contraseña actual (mismo bloqueo a los 3 intentos) y sin cerrar las sesiones existentes. |
| `requisitos-funcionales-comercio.md` | Estados Rechazado (se puede corregir, hasta 3 veces) y Rechazo definitivo. Vencimiento del pedido a los 30 minutos. `marketplace_fee` como mecanismo de split y `application_fee` como nombre de la respuesta de MercadoPago. El panel muestra el cargo al comercio y, como total, lo que el comercio factura; "Facturado hoy" con el mismo criterio neto. |
| `requisitos-funcionales-dueño.md` | El registro pide nombre de usuario. Corrección y re-solicitud de un comercio rechazado (qué datos se pueden corregir, hasta 3 intentos, pantallas de rechazo y de rechazo definitivo) y regla para agregar un comercio nuevo. Una sola cuenta de MercadoPago activa por Dueño y una cuenta activa en un solo Dueño; pantalla de la cuenta de cobro con los comercios operativos; aviso "Vinculá Mercado Pago para empezar a vender"; resumen previo a la desvinculación y bloqueo por pedidos esperando el pago con la hora para reintentar; los tokens no se borran; monto recibido por cobro con el split. |
| `requisitos-funcionales-generales.md` | Inicio de sesión por nombre de usuario (el email queda para verificación, recuperación y reactivación). Sección nueva "Nombre de Usuario" (formato, minúsculas, único, reservados, alta, disponibilidad en vivo, mensaje de login genérico, `sub` del token = id del usuario). La pantalla de verificación funciona con y sin el email en la dirección. |
| `requisitos-funcionales-sistema.md` | Link de pago por Checkout Pro con `marketplace_fee` y `external_reference`. Verificación del split de un pago aprobado contra `fee_details` con alerta `SPLIT_NO_APLICADO`. Alertas por pago tardío, duplicado, referencia que no coincide o split no aplicado. Expiración por falta de respuesta del comercio (job cada 5 minutos, 30 minutos). Historial de estados del comercio con rechazo definitivo, re-solicitud y cambios por campo (`HistorialCambioComercio`). Notificación T18 (nueva re-solicitud: no se notifica al Administrador). |
| `requisitos-no-funcionales.md` | La verificación del split es informativa: ante una diferencia registra una alerta y nunca bloquea ni revierte el pago. |
| `Historias de Usuario - Administrador.md` | Historia de la bandeja de re-solicitudes y del rechazo definitivo. |
| `Historias de Usuario - Cliente.md` | Registro con nombre de usuario y nueva HU-C17 "Cambiar mi Nombre de Usuario". |
| `Historias de Usuario - Comercio.md` | El comercio dispone de 30 minutos para responder un pedido. |
| `Historias de Usuario - Dueño.md` | Registro con nombre de usuario, criterios de aceptación adicionales de la cuenta de MercadoPago única, la pantalla de la cuenta de cobro, el aviso de vinculación y la desvinculación, y corrección y re-solicitud de un comercio rechazado con hasta 3 intentos. |

## Mantenimiento previo a B2 — carrera del perfil del Cliente y banners sin HTML (2026-10-08)

Solo frontend y pruebas; backend, migraciones, Newman y estreses sin cambios. `perfil.html`: los botones de editar datos, cambiar contraseña y foto nacen deshabilitados y `js/cliente.js` los habilita al terminar de enlazar los manejadores (causa raíz de la inestabilidad de `11:74`, `11:134` y `19:635`); "Cerrar sesión" se enlaza antes de cargar el perfil. `renderBanner` (`js/form-utils.js`, `js/cliente.js`, `js/comercio.js`) deja de interpretar el mensaje como HTML; los avisos del login con enlace se arman con `renderBannerConEnlace` (`js/auth.js`). Playwright: 489/489 (4 tests nuevos: specs 01, 02 y 11); spec 11 ×10 = 120/120 y spec 19 ×10 = 380/380. Documentación: `docs/DECISIONES.md`, `CLAUDE.md` y `testing/playwright/README.md`. Los demás documentos de esta carpeta no cambian.

## Tramo E3, bloque A3: pedido propio y trazabilidad del pedido (2026-10-13)

Backend y pruebas; sin migraciones ni pantallas. Implementa la decisión 28 ("pedido propio" = el Empleado es el Cliente del pedido): sus cinco acciones del comercio y la trazabilidad responden `409` `PEDIDO_PROPIO`; la vista del Empleado trae `esPedidoPropio`; comprar en el comercio propio sigue permitido. Suma `GET /api/v1/pedidos/comercio/{id}/trazabilidad` (recorrido del pedido para el Dueño y los Empleados). Las carpetas `01.` y `02.` no se editaron: hay que copiar los archivos de la tabla.

| Documento | Qué cambia |
|---|---|
| `requisitos-funcionales-empleado.md` | "Pedidos Propios" reescrita (implementada: `PEDIDO_PROPIO`, `esPedidoPropio`, solo falta el aviso de A4; "pedido propio" y "Tu pedido" significan siempre "soy el Cliente"). "Trazabilidad": el recorrido del pedido y sus reglas de visibilidad. |
| `requisitos-funcionales-comercio.md` | Regla del pedido propio en "Gestión de Pedidos" y el recorrido del pedido en "Historial y Seguimiento". |
| `requisitos-funcionales-dueño.md` | El recorrido del pedido; el Dueño no recibe la marca y gestiona cualquier pedido. |
| `requisitos-funcionales-sistema.md` | "Trazabilidad de un pedido" y "Pedido propio" en el historial de estados del pedido. |
| `Historias de Usuario - Empleado.md` | Pedido propio con el mensaje, actuar sobre pedidos que aceptó otra persona y ver el recorrido. |
| `Historias de Usuario - Dueño.md` | Recorrido de cada pedido y gestión de cualquier pedido. |
| `Historias de Usuario - Comercio.md` | HU-CO15 nueva, "Ver Quién Atendió un Pedido". |

No cambian el diccionario de datos ni los diagramas (sin migración). Otros documentos del repositorio: `docs/DECISIONES.md` (entrada del bloque A3 y la decisión 28 marcada como implementada), `docs/CONCURRENCIA-Y-TRANSACCIONES.md` (nota del bloque A3 en 5bis), `docs/AUDITORIA-E3.md` (`esPropio` renombrado a `esPedidoPropio`) y `CLAUDE.md`.


## Tramo E3, bloque A5b: orden único de bloqueo del catálogo (2026-10-14)

Corrige tres hallazgos de producción del estrés de A5 (deadlock de tres entre escrituras de producto del Dueño y del Empleado y `cerrar`/`abrir`/`datos-operativos`; `500` al escribir sobre una imagen que otro acababa de borrar; las dos firmas de Cloudinary sin revalidar la relación). **No cambia ningún documento de `01.` ni de `02.`: no hay nada que copiar.** Lo único visible para quien opera es que un Empleado desactivado o con el comercio suspendido recibe `404`/`409` también al pedir una firma de subida, y que la segunda persona que toca una imagen ya borrada recibe `404` "Imagen no encontrada" en vez de un error genérico. Sin migraciones, sin cambios en el diccionario de datos ni en los diagramas. Detalle en `docs/DECISIONES.md`, `docs/CONCURRENCIA-Y-TRANSACCIONES.md` (con la tabla de cada método de `ProductoService`) y `docs/APRENDIZAJES-TECNICOS.md`.
