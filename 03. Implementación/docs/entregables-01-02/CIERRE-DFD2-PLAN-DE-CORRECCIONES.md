# CIERRE DFD NIVEL 2 — Plan de correcciones (solo clasificación)

Documento de solo lectura derivado de `INDICE-DFD2-DESVIOS-Y-CUESTIONES.md` (versión 2). No corrige nada ni inventa desvíos: toma la columna "Corregir en" y los hechos del índice. Las claves son las del índice (`tramo·id`). Los textos entre comillas son literales del índice, que a su vez los toma de los informes. "Qué dice hoy" es la columna "Qué dice la documentación" del índice; "Qué hace el código" es su columna homónima. Cuando una fila nombra varios documentos aparece en la sección de cada uno.

**Abreviaturas:** igual que el índice (RF-gen, RF-cli, RF-com, RF-due, RF-emp, RF-adm, RF-sis, RNF, HU-x, DIC, CONC, ALC, CLAUDE, N1).

**Contenido:** 1. Correcciones por documento destino · 2. Corregir en el código (clasificación) · 3. Decisiones de negocio pendientes · 4. Cierre del DFD Nivel 1 · 5. Estado del repositorio.

---

## 1. Correcciones por documento destino

### 1.1 `requisitos-funcionales-generales.md` (RF-gen)

13 filas.

| Clave | Línea o sección citada | Qué dice hoy | Qué hace el código |
|---|---|---|---|
| A·D-01 | RF-gen:66 | RF-gen:66: mensaje genérico (solo cubre el texto) | Lanza el 401 antes de llamar a BCrypt cuando el usuario no existe: responde más rápido que para uno existente |
| A·D-02 | RF-gen:73-75 | DIC: "Cierre por expiración del tiempo de sesión inactiva"; RF-gen:73-75 "cierre ... automático", "por vencimiento" | `AUTOMATICO` nunca se asigna; el JWT vence a las 24 h pero la fila de `sesion` queda `activa = true` hasta el próximo login; no hay job ni temporizador de frontend |
| A·D-03 | RF-gen:15 | RF-gen:15 (solo `SUSPENDIDO` e `INACTIVO` detrás de la contraseña) | Devuelve 409 de `PENDIENTE` y `BLOQUEADO` antes de comparar la contraseña; solo `SUSPENDIDO` e `INACTIVO` se protegen detrás de la contraseña; el login no tiene límite por IP |
| A·D-04 | no citada por el informe | Respuesta genérica (RF-gen) | El controlador responde 200 genérico "Si la cuenta existe y está pendiente de verificación, se envió un nuevo código" pero el servicio lanza 404 "No existe una cuenta con ese email" y 409 "Esta cuenta ya está verificada"; sin espera ni tope por hora en servidor (30 s solo en el frontend) |
| A·D-05 | RF-gen:46, 75 | RF-gen:46, 75: "el aviso lo dice" | El modal siempre dice "Tu sesión terminó. Iniciá sesión de nuevo."; no distingue login en otro dispositivo; sin email |
| A·D-10 | RF-gen:114 | RF-gen:114: "ser distinta a la contraseña anterior" | Solo el cambio con sesión valida "La nueva contraseña debe ser distinta a la actual" (400); la recuperación no lo exige; no hay email de aviso tras cambiar la contraseña |
| A·D-11 | no citada por el informe | Aviso de bloqueo | El 3.er intento fallido responde 401 con `intentosRestantes: 0` y deja `BLOQUEADO`; el frontend solo reacciona a `intentosRestantes === 1`, así que el bloqueo recién se ve en el 4.º intento (en el cambio desde perfil sí hay modal con `0`) |
| A·D-16 | no citada por el informe | Regla de 5 intentos por código y "sin links" | Sigue público; valida por el valor del código sin email ni contador de intentos; no lo usa el frontend |
| A·D-17 | RF-gen:104 | RF-gen:104 (consistente con "sin entrada") | Endpoints y pantalla vivos sin entrada desde ningún enlace; el código se genera para cualquier estado de cuenta |
| A·D-19 | no citada por el informe | — | Activa cuentas `PENDIENTE` (`cambiar(..., ACTIVO)`); para un `ACTIVO` cierra la sesión y restaura comercios aunque no haya nada que restaurar |
| B·D-01 | no citada por el informe | RF-due: "El Dueño debe poder cargar y editar su foto de perfil personal desde su cuenta autenticada"; RF-gen "Gestión de Foto de Perfil" (cuatro roles) | Los endpoints sirven a cualquier rol autenticado, pero solo `js/cliente.js` los usa; el perfil del Dueño solo sube la foto del comercio; el Administrador no tiene pantalla de perfil con foto |
| G·D-52 | no citada por el informe | No figuran en RF-cli, RF-com ni RF-gen | Existen en backend y frontend |
| I·D-63 | no citada por el informe | Habla de "consultas de la persona" sin precisar este cruce | "Mis consultas" y las operaciones con sesión se resuelven por `usuario_id = :id OR email = :email`: una consulta creada sin sesión con el email de la cuenta aparece en "Mis consultas" y la cuenta puede responderla con sesión |

### 1.2 `requisitos-funcionales-cliente.md` (RF-cli)

16 filas.

| Clave | Línea o sección citada | Qué dice hoy | Qué hace el código |
|---|---|---|---|
| B·D-12 | no citada por el informe | RF-cli: "La dirección principal no puede eliminarse si es la única registrada; primero debe designarse otra como principal." (sin tope ni campos) | Se puede eliminar la predeterminada si hay otra activa (se promueve la de mayor `id`); se bloquea eliminar la única activa (409 `ULTIMA_DIRECCION`); tope de 5 activas (409 `DIRECCIONES_CUPO_MAXIMO`); campos `nombre` y `referencia` |
| D·D-01 | no citada por el informe | — | Catálogo de comercios y de productos de un comercio incluyen `CERRADO_TEMPORALMENTE`; el catálogo global solo `APTO_VENTA` |
| D-COMPL·D-07 | ~línea 26 | RF-cli (~línea 26): "tipo de comercio, horarios de atención, dirección, teléfono, enlaces a sus redes sociales" | Muestra nombre, descripción, solo el horario de hoy, dirección y modalidades; no muestra tipo, teléfono, redes sociales ni la semana completa |
| D-COMPL·D-08 | no citada por el informe | Las historias y requisitos no dicen qué pasa | El Dueño o Administrador es redirigido solo desde `index.html`; en el detalle y en Explorar ve "Iniciá sesión para pedir" aunque ya inició sesión |
| D-COMPL·D-09 | no citada por el informe | RF-cli y HU-C08 solo hablan de filtrar productos dentro de un menú por categoría y/o tags y mencionan "Abierto ahora" | Explorar: búsqueda por nombre con debounce de 300 ms, categoría única y tags múltiples con AND, paginación de 20, orden aleatorio, contador y "Limpiar filtros"; campo "Buscar productos" en escritorio; filtros "Delivery" y "Retiro" **[corregido por J·D-78: los chips "Delivery", "Retiro" y "Abierto ahora" están en `initCatalogo` (`index.html`, filtro del lado cliente sobre `GET /catalogo/comercios`), no en Explorar; Explorar solo tiene categoría, tags, búsqueda por nombre de producto y paginación; no existe búsqueda por nombre de comercio]** |
| D-COMPL·D-12 | ~línea 34 | RF-cli (~línea 34) y HU-C09B describen extras con grupos y cálculo | No hay código de extras (solo 5 tablas del baseline, 2 valores de enum y ramas de texto de la Actividad) |
| E·D-18 | línea 48 | RF-cli (línea 48): validar al confirmar "que todos los productos sigan activos" | No revisa el estado de los productos al confirmar; solo al agregar ("El producto no está disponible") y por la baja de carritos al pasar a `AGOTADO`/`DESCONTINUADO` (`PRODUCTO_REMOVIDO_CARRITO`); `PUT /carrito/items/{id}` tampoco revalida |
| E·D-19 | línea 48 | RF-cli (línea 48): "que el cliente tenga una dirección principal configurada" | Exige un `direccionId` de una dirección activa del propio Cliente (no necesariamente la principal): 409 "La dirección es obligatoria para entrega a domicilio" o 404 "Dirección no encontrada" |
| E·D-20 | líneas 33 y 48 | RF-cli (líneas 33 y 48) y RF-com (~224) | Sin lógica de extras |
| E·D-21 | línea 39 | RF-cli (línea 39): vinculado a la sesión, "pasando a estado inactivo al expirar la sesión o al inactivarse la cuenta" | Un único registro por Cliente, sin estado ni vínculo con la sesión; no expira; solo se vacía por acciones del Cliente, pago aprobado o baja de un producto |
| E·D-22 | líneas 53-55, línea 58 | RF-cli (líneas 53-55), HU-C13: cancelación "según modalidad" con dos estados; RF-sis (línea 58): `CANCELADO` "genera reembolso automático" | No distingue modalidad (mismos estados); permite cancelar `PENDIENTE_PAGO` (409 "El pedido ya no se puede cancelar" para el resto); cancelar desde `PENDIENTE_PAGO` no genera reembolso (motivo `CANCELACION_SIN_PAGO`) |
| E·D-26 | no citada por el informe | RF-cli (~66): aviso ante "cancelado" | No se crea aviso para el Cliente; solo `PEDIDO_CANCELADO_CLIENTE` al equipo del comercio y solo si el pedido estaba pagado |
| F·D-31 | no citada por el informe | RF-cli (~65): notificar al cliente ante cada cambio de estado, "entregado" incluido | No llaman a `NotificacionService`: el Cliente no recibe aviso de `ENTREGADO` manual (solo T8 si lo autoconfirma el sistema) y el comercio no recibe aviso cuando el Cliente confirma |
| F·D-34 | línea 59, línea 76 | RF-cli (línea 59), HU-C14, HU-A13 y RF-adm (línea 76): reclamo por pedido a domicilio no recibido y contacto directo con el comercio | Reclamo sobre cualquier pedido `ENTREGADO` (domicilio o retiro, también autoconfirmado) con seis motivos (`NO_RECIBI_PEDIDO` solo domicilio) y fotos opcionales; no existe la opción "contactar directamente al comercio"; el único contacto es "Contactar a Soporte" tras un rechazo |
| G·D-52 | no citada por el informe | No figuran en RF-cli, RF-com ni RF-gen | Existen en backend y frontend |
| J·D-78 | no citada por el informe | Lo de D-COMPL·D-09 (RF-cli y HU-C08) | Los chips "Delivery", "Retiro" y "Abierto ahora" son un filtro del lado cliente sobre `GET /catalogo/comercios` (`index.html`); Explorar solo tiene categoría, tags, búsqueda por nombre de producto y paginación; no existe búsqueda por nombre de comercio. **Corrige a D-COMPL·D-09** |

### 1.3 `requisitos-funcionales-comercio.md` (RF-com)

12 filas.

| Clave | Línea o sección citada | Qué dice hoy | Qué hace el código |
|---|---|---|---|
| C·D-16 | no citada por el informe | — | Omitir la descripción la borra; no está documentado |
| D·D-03 | no citada por el informe | La documentación del cierre manual no lo aclara | Reabre aunque el comercio esté `SUSPENDIDO` o `INACTIVO` (solo apaga la bandera) y no emite avisos |
| D·D-06 | no citada por el informe | — | "Eliminar producto" no es baja física: es `DESCONTINUADO` (terminal); no hay reordenamiento de productos |
| D-COMPL·D-10 | ~líneas 113 a 119 | RF-com (~líneas 113 a 119) | Sin aviso propio para `CERRADO_TEMPORALMENTE` (el banner "Comercio cerrado temporalmente. No se aceptan pedidos nuevos." es solo del Empleado) |
| D-COMPL·D-11 | ~línea 315 | RF-com (~línea 315): "En curso", "Terminó" y "Terminó ayer" | Agrega "En curso desde ayer", "En curso desde el dd/mm", "Terminó el dd/mm" y una cuarta columna "En preparación" solo en escritorio |
| D-COMPL·D-12 | ~línea 34 | RF-cli (~línea 34) y HU-C09B describen extras con grupos y cálculo | No hay código de extras (solo 5 tablas del baseline, 2 valores de enum y ramas de texto de la Actividad) |
| D-COMPL·D-14 | ~línea 302 | RF-com (~línea 302): "El Dueño queda sin cambios por ahora" | El código ya impide editar con `SUSPENDIDO` (backend 409 y frontend) |
| E·D-20 | líneas 33 y 48 | RF-cli (líneas 33 y 48) y RF-com (~224) | Sin lógica de extras |
| E·D-23 | no citada por el informe | RF-com (~242): "Local Cerrado" | La etiqueta es "Comercio cerrado" (backend y frontend) |
| F·D-36 | no citada por el informe | Sin "historial de pedidos" acotado en los documentos leídos | Devuelve todo el historial pagado, sin ventana ni paginación; el panel muestra todo bajo "Todos" |
| F·D-40 | línea 232 | RF-com (línea 232): aviso "ante cada nuevo pedido entrante" | El sonido responde a cualquier aviso nuevo sin leer del comercio activo; la etiqueta "Nuevo" se basa en lo visto desde que se abrió el panel (`sessionStorage`) |
| G·D-52 | no citada por el informe | No figuran en RF-cli, RF-com ni RF-gen | Existen en backend y frontend |

### 1.4 `requisitos-funcionales-dueño.md` (RF-due)

8 filas.

| Clave | Línea o sección citada | Qué dice hoy | Qué hace el código |
|---|---|---|---|
| A·D-06 | RF-due:30 | RF-due:30: puede cargarla y editarla desde su cuenta | No existe foto personal del Dueño en el registro (`foto_perfil_url` queda `NULL`); la foto del comercio solo valida `https` y host `res.cloudinary.com` (no carpeta ni cuenta); tipo y tamaño solo en frontend (JPG/PNG/WebP, 5 MB) |
| B·D-01 | no citada por el informe | RF-due: "El Dueño debe poder cargar y editar su foto de perfil personal desde su cuenta autenticada"; RF-gen "Gestión de Foto de Perfil" (cuatro roles) | Los endpoints sirven a cualquier rol autenticado, pero solo `js/cliente.js` los usa; el perfil del Dueño solo sube la foto del comercio; el Administrador no tiene pantalla de perfil con foto |
| B·D-04 | §1bis, §9 | RF-due: "hoy el Dueño no tiene las restricciones que sí tiene el Empleado (por ejemplo, puede editar productos y perfil con el comercio Suspendido): es un hueco conocido" | 409 "El comercio está suspendido: por ahora no se puede modificar." y 409 "El comercio está inactivo: por ahora no se puede modificar." para Dueño y Empleado (`editarPerfil`, `actualizarFotoPerfil`, `editarDatosOperativos`, firma de foto) |
| B·D-11 | no citada por el informe | RF-due solo lo reconoce para el nombre de usuario | Ninguna pantalla del Dueño muestra nombre, apellido, DNI, teléfono personal ni fecha de nacimiento |
| B·D-14 | no citada por el informe | RF-due solo describe la regla de invitar | `invitar` y `reenviar` exigen `APROBADO`/`APTO_VENTA` (409 "Este comercio no puede invitar empleados en este momento"); `cancelar` y `desactivar` solo bloquean `SUSPENDIDO` (409 "El comercio está suspendido: el equipo se puede ver, pero no modificar"); `reactivar` exige operativo (409 "Este comercio no puede reactivar empleados en este momento", código `NO_OPERATIVO`) |
| B·D-16 | RF-sis:31-32 | RF-sis:31-32 coherente; no dice que no hay email | Desactivar y renunciar no cierran sesiones ni envían email; solo relación, historial y aviso in-app personal (sin `comercio_id`, llega a su cuenta de Cliente) |
| C·D-13 | no citada por el informe | RF-due / HU (describen la edición) | Endpoints sin pantalla; un comercio aprobado no puede editar redes desde la UI |
| G·D-53 | ~línea 322 | RF-due (~línea 322): "ver el enlace de pago de un pedido" | Solo funciona para pedidos que ya llegaron pagados (`llegoPagado`); el frontend no lo consume; el enlace de un pedido sin pagar nunca se ve desde el comercio |

### 1.5 `requisitos-funcionales-empleado.md` (RF-emp)

7 filas.

| Clave | Línea o sección citada | Qué dice hoy | Qué hace el código |
|---|---|---|---|
| B·D-03 | no citada por el informe | RF-emp: se puede aceptar con el comercio Aprobado, Apto para Venta, Cerrado Temporalmente o Suspendido | `{APROBADO, APTO_VENTA, CERRADO_TEMPORALMENTE}`; con `SUSPENDIDO`, `validar` y `aceptar` responden 409 "Esta invitación ya no está disponible" |
| B·D-05 | no citada por el informe | RF-emp: "No aparecen los comercios Inactivos, de Rechazo definitivo, Pendientes ni Rechazados" | Incluye `INACTIVO`; el selector tiene etiqueta solo para `SUSPENDIDO` y `CERRADO_TEMPORALMENTE`; un `INACTIVO` aparece sin etiqueta ni aviso |
| B·D-14 | no citada por el informe | RF-due solo describe la regla de invitar | `invitar` y `reenviar` exigen `APROBADO`/`APTO_VENTA` (409 "Este comercio no puede invitar empleados en este momento"); `cancelar` y `desactivar` solo bloquean `SUSPENDIDO` (409 "El comercio está suspendido: el equipo se puede ver, pero no modificar"); `reactivar` exige operativo (409 "Este comercio no puede reactivar empleados en este momento", código `NO_OPERATIVO`) |
| B·D-15 | no citada por el informe | RF-emp: "El código verifica el email" | La cuenta nueva por invitación queda activa sin verificación de email y el aviso de aceptación solo va al Dueño (nada al Empleado); informativo |
| B·D-16 | RF-sis:31-32 | RF-sis:31-32 coherente; no dice que no hay email | Desactivar y renunciar no cierran sesiones ni envían email; solo relación, historial y aviso in-app personal (sin `comercio_id`, llega a su cuenta de Cliente) |
| C·D-06 | no citada por el informe | RF-emp lista "email de contacto", que ya no existe (V36) | — |
| C·D-16 | no citada por el informe | — | Omitir la descripción la borra; no está documentado |

### 1.6 `requisitos-funcionales-administrador.md` (RF-adm)

9 filas.

| Clave | Línea o sección citada | Qué dice hoy | Qué hace el código |
|---|---|---|---|
| B·D-07 | no citada por el informe | RF-adm: "levantar la suspensión de un cliente, reactivando su cuenta" | Al levantar, la cuenta vuelve a `PENDIENTE` o `INACTIVO` si era el origen y a `ACTIVO` en los demás casos (incluida `BLOQUEADO`, con intentos en 0); también para el Dueño |
| B·D-08 | no citada por el informe | RF-adm "Gestión de Usuarios" solo habla del cliente | La suspensión de Dueño, su vista previa, el listado de Dueños, el reenvío de email y el mínimo 10 / máximo 500 caracteres del motivo no figuran en RF-adm (solo de forma indirecta en RF-sis:25-31) |
| D·D-04 | no citada por el informe | — | La suspensión de un comercio no cierra sesiones del Dueño ni de Empleados (la del Dueño, S3, sí cierra las del Dueño) |
| D·D-05 | no citada por el informe | Documento canónico | Coincide con el código pero omite que `PENDIENTE_PAGO` queda sin tocar y que un pago aprobado tardío se cancela y reembolsa |
| D-COMPL·D-13 | ~línea 12 | RF-adm (~línea 12): "restaurando su estado a Aprobado"; HU-A06 genérica | Restaura a `APTO_VENTA`, `APROBADO` o `CERRADO_TEMPORALMENTE` según cuenta de cobro, documentos y cuenta del Dueño |
| D-COMPL·D-15 | ~línea 11 | RF-adm (~línea 11): "desencadena la cancelación de pedidos activos … según las reglas del sistema" | Vista previa por pedidos; pendientes rechazados al instante; los demás con 90 minutos |
| D-COMPL·D-17 | no citada por el informe | Ningún requisito lo exige ni lo descarta | Solo el de Dueños tiene "Ver más" de a 30; Clientes, Comercios, Categorías, Tags y Reembolsos sin paginación |
| F·D-33 | línea 76 | RF-sis (~161) T19 "Push + Panel"; RF-adm (línea 76) | Existe y ningún servicio lo crea; el Administrador lo ve solo en el contador y la insignia |
| F·D-34 | línea 59, línea 76 | RF-cli (línea 59), HU-C14, HU-A13 y RF-adm (línea 76): reclamo por pedido a domicilio no recibido y contacto directo con el comercio | Reclamo sobre cualquier pedido `ENTREGADO` (domicilio o retiro, también autoconfirmado) con seis motivos (`NO_RECIBI_PEDIDO` solo domicilio) y fotos opcionales; no existe la opción "contactar directamente al comercio"; el único contacto es "Contactar a Soporte" tras un rechazo |

### 1.7 `requisitos-funcionales-sistema.md` (RF-sis)

23 filas.

| Clave | Línea o sección citada | Qué dice hoy | Qué hace el código |
|---|---|---|---|
| A·D-13 | no citada por el informe | — | La pantalla de éxito del registro de Dueño dice "te vamos a avisar por email cuando quede aprobado" y el código no manda email de aprobación; en P1.01 los 409 de email y DNI se muestran en el banner del paso 2 aunque son del paso 1; DIC de `Token` todavía menciona "UUID" y "enlace" |
| B·D-06 | RF-sis:27 | RF-sis:27: "cambiar automáticamente el estado de TODOS los comercios que administra a Suspendido" | Solo `APROBADO`, `APTO_VENTA` y `CERRADO_TEMPORALMENTE` pasan a `SUSPENDIDO`; `PENDIENTE`, `RECHAZADO`, `RECHAZO_DEFINITIVO` e `INACTIVO` quedan igual; los suspendidos por separado conservan su origen |
| C·D-01 | no citada por el informe | RF-sis T14/T15 "App + Email"; las pantallas de éxito del registro y `comercio-pendiente.html` prometen un email | Solo crea notificación in-app `COMERCIO_APROBADO` / `COMERCIO_RECHAZADO`; no manda email |
| D·D-04 | no citada por el informe | — | La suspensión de un comercio no cierra sesiones del Dueño ni de Empleados (la del Dueño, S3, sí cierra las del Dueño) |
| E·D-22 | líneas 53-55, línea 58 | RF-cli (líneas 53-55), HU-C13: cancelación "según modalidad" con dos estados; RF-sis (línea 58): `CANCELADO` "genera reembolso automático" | No distingue modalidad (mismos estados); permite cancelar `PENDIENTE_PAGO` (409 "El pedido ya no se puede cancelar" para el resto); cancelar desde `PENDIENTE_PAGO` no genera reembolso (motivo `CANCELACION_SIN_PAGO`) |
| E·D-24 | línea 61, línea 94 | RF-sis (línea 61): "dentro de la hora de margen"; la línea 94 del mismo archivo dice 30 | Umbral de 30 minutos y corrida cada 5 minutos: el vencimiento cae entre los 30 y 35 minutos |
| E·D-25 | línea 153 | RF-sis (línea 153, T11): "Push + Panel + Email" | Solo aviso in-app (`PUSH`); ningún aviso de pedido (T1, T2, T3, T5 a T13) envía email |
| F·D-31 | no citada por el informe | RF-cli (~65): notificar al cliente ante cada cambio de estado, "entregado" incluido | No llaman a `NotificacionService`: el Cliente no recibe aviso de `ENTREGADO` manual (solo T8 si lo autoconfirma el sistema) y el comercio no recibe aviso cuando el Cliente confirma |
| F·D-33 | línea 76 | RF-sis (~161) T19 "Push + Panel"; RF-adm (línea 76) | Existe y ningún servicio lo crea; el Administrador lo ve solo en el contador y la insignia |
| F·D-38 | líneas 107, 150, 180 | RF-sis (líneas 107, 150, 180): T8 "con opciones para iniciar reclamo o contactar al comercio" y "botones" | Texto con un único enlace "Ver pedido" (`destino-aviso.js`); sin botones; el `7` del plazo está escrito en el texto y no en `reclamo.plazo-dias` |
| F·D-39 | líneas 162-163 | RF-sis (líneas 162-163): T20/T21 "Push + Panel"; `RECLAMO_REEMBOLSO_DUENO` no figura en la tabla leída | T20/T21: aviso in-app más email (Resend) al Cliente; para el Dueño `RECLAMO_REEMBOLSO_DUENO` |
| G·D-41 | no citada por el informe | RF-sis "Gestión de Reembolsos": job que reintenta `PENDIENTE_REINTENTO`; DIC `NotaCredito.intentos`: "Diseño: máximo 5 con job de reintentos (pendiente)" | No existe job de reintento; un solo intento; `PENDIENTE_REINTENTO` no se escribe en ningún lado (solo se cuenta como "cubierta" y se traduce a `EN_PROCESO` para el Empleado); único reintento: el manual del Administrador |
| G·D-42 | no citada por el informe | RF-sis y DIC (`fecha_fallido`): notificación al Administrador, Push + Email, a los 5 intentos | Existe en enum y ENUM de base sin emisor; el Administrador solo ve las notas `FALLIDO` / `PENDIENTE_REVISION_MANUAL` y la insignia |
| G·D-43 | no citada por el informe | RF-sis las lista como Push + Panel (T18 aclara que no se notifica); DIC ya dice "hoy no se emiten" | Ningún servicio las crea (no existe `crearParaAdministrador`); `initNotificaciones` redirige al login para `ADMINISTRADOR` |
| G·D-44 | no citada por el informe | RF-sis y DIC: `PEDIDO_CANCELADO_SISTEMA` "Push + Email" | Solo PUSH; `EmailService` no tiene método para pedidos |
| G·D-45 | no citada por el informe | T14 y T15 documentados Push + Email al Dueño | Solo `notificacionService.crearParaDueno`; sin método de email de comercio aprobado/rechazado (T16, suspensión, sí lleva email por `AvisoCuentaService`) |
| G·D-46 | no citada por el informe | T24 y T25 documentados con canal "Email" únicamente | `CUENTA_INACTIVADA` crea además un aviso PUSH al usuario y `COMERCIO_INACTIVADO` un aviso PUSH al Dueño por comercio; el email es uno solo por cuenta (con la lista de comercios); el "email de T25" no existe como mensaje propio |
| H·D-54 | L46-48, L313, L118 | RF-sis L46-48: "Un job periódico procesa los tokens con `fecha_vencimiento <= NOW()` y `estado = PENDIENTE`"; L313; RNF L118 | Ningún `@Scheduled` de tokens y `EXPIRADO` no se escribe en ningún lugar de `backend/src/main/java` (grep sin resultados) |
| H·D-55 | L241-242, L2358 | RF-sis L241-242; DIC L2358: "pasa a `activo = false` al cerrar sesión, inactivarse la cuenta o expirar la sesión" | La columna existe (defecto 1) pero la entidad no la mapea y nada la escribe; la inactivación no toca el carrito |
| H·D-56 | L110 | RF-sis L110: "Un comercio sin franjas horarias cargadas no se reabre solo."; CLAUDE (tramo C1): "sin franjas no reabre" | Si `proximoInicioDeFranja` no halla franja vigente, el job reabre el comercio y deja `log.warn` |
| H·D-57 | L182, L689 | RF-sis L182 y DIC L689: T25 `COMERCIO_INACTIVADO` canal "Email" | Solo aviso en la app por comercio; el único email es el de T24 (nombra a los comercios) |
| H·D-58 | L311-317, L118 | RF-sis L311-317 y RNF L118: todos los procesos automáticos registran su ejecución según la taxonomía de logs | Registro de ejecución parcial: la inactivación siempre escribe el resumen; el cierre de turno solo si cerró, envió o falló algo; el vencimiento de invitaciones solo si venció alguna; la reapertura no escribe nada por corrida (solo `warn` por comercio y `error` por falla); `PedidoSchedulerService` no registra en esa clase |
| I·D-61 | no citada por el informe | CLAUDE y mensajes: "3 consultas hoy", "por día" | Ventana móvil de 24 horas, no día calendario; el mensaje dice "hoy" y "mañana" |

### 1.8 `Historias de Usuario - Cliente.md` (HU-Cliente)

9 filas.

| Clave | Línea o sección citada | Qué dice hoy | Qué hace el código |
|---|---|---|---|
| B·D-10 | no citada por el informe | — | Con el nombre de usuario modificado hace primero `PUT /clientes/perfil` y después abre "Confirmá tu contraseña"; si se toca "Cancelar" los datos ya quedaron guardados, sin toast |
| B·D-12 | no citada por el informe | RF-cli: "La dirección principal no puede eliminarse si es la única registrada; primero debe designarse otra como principal." (sin tope ni campos) | Se puede eliminar la predeterminada si hay otra activa (se promueve la de mayor `id`); se bloquea eliminar la única activa (409 `ULTIMA_DIRECCION`); tope de 5 activas (409 `DIRECCIONES_CUPO_MAXIMO`); campos `nombre` y `referencia` |
| D-COMPL·D-08 | no citada por el informe | Las historias y requisitos no dicen qué pasa | El Dueño o Administrador es redirigido solo desde `index.html`; en el detalle y en Explorar ve "Iniciá sesión para pedir" aunque ya inició sesión |
| D-COMPL·D-09 | no citada por el informe | RF-cli y HU-C08 solo hablan de filtrar productos dentro de un menú por categoría y/o tags y mencionan "Abierto ahora" | Explorar: búsqueda por nombre con debounce de 300 ms, categoría única y tags múltiples con AND, paginación de 20, orden aleatorio, contador y "Limpiar filtros"; campo "Buscar productos" en escritorio; filtros "Delivery" y "Retiro" **[corregido por J·D-78: los chips "Delivery", "Retiro" y "Abierto ahora" están en `initCatalogo` (`index.html`, filtro del lado cliente sobre `GET /catalogo/comercios`), no en Explorar; Explorar solo tiene categoría, tags, búsqueda por nombre de producto y paginación; no existe búsqueda por nombre de comercio]** |
| D-COMPL·D-12 | ~línea 34 | RF-cli (~línea 34) y HU-C09B describen extras con grupos y cálculo | No hay código de extras (solo 5 tablas del baseline, 2 valores de enum y ramas de texto de la Actividad) |
| E·D-22 | líneas 53-55, línea 58 | RF-cli (líneas 53-55), HU-C13: cancelación "según modalidad" con dos estados; RF-sis (línea 58): `CANCELADO` "genera reembolso automático" | No distingue modalidad (mismos estados); permite cancelar `PENDIENTE_PAGO` (409 "El pedido ya no se puede cancelar" para el resto); cancelar desde `PENDIENTE_PAGO` no genera reembolso (motivo `CANCELACION_SIN_PAGO`) |
| F·D-34 | línea 59, línea 76 | RF-cli (línea 59), HU-C14, HU-A13 y RF-adm (línea 76): reclamo por pedido a domicilio no recibido y contacto directo con el comercio | Reclamo sobre cualquier pedido `ENTREGADO` (domicilio o retiro, también autoconfirmado) con seis motivos (`NO_RECIBI_PEDIDO` solo domicilio) y fotos opcionales; no existe la opción "contactar directamente al comercio"; el único contacto es "Contactar a Soporte" tras un rechazo |
| F·D-35 | no citada por el informe | No se halló documento que lo exija (NO RELEVADO exhaustivo de las historias C-xx de pedidos) | Sin recorrido/trazabilidad del pedido para el Cliente (solo el comercio), sin "Volver a pedir", sin agrupación por día, sin paginación y sin separación activos/históricos en móvil |
| J·D-78 | no citada por el informe | Lo de D-COMPL·D-09 (RF-cli y HU-C08) | Los chips "Delivery", "Retiro" y "Abierto ahora" son un filtro del lado cliente sobre `GET /catalogo/comercios` (`index.html`); Explorar solo tiene categoría, tags, búsqueda por nombre de producto y paginación; no existe búsqueda por nombre de comercio. **Corrige a D-COMPL·D-09** |

### 1.9 `Historias de Usuario - Comercio.md` (HU-Comercio)

1 filas.

| Clave | Línea o sección citada | Qué dice hoy | Qué hace el código |
|---|---|---|---|
| D·D-06 | no citada por el informe | — | "Eliminar producto" no es baja física: es `DESCONTINUADO` (terminal); no hay reordenamiento de productos |

### 1.10 `Historias de Usuario - Dueño.md` (HU-Dueño)

1 filas.

| Clave | Línea o sección citada | Qué dice hoy | Qué hace el código |
|---|---|---|---|
| C·D-13 | no citada por el informe | RF-due / HU (describen la edición) | Endpoints sin pantalla; un comercio aprobado no puede editar redes desde la UI |

### 1.11 `Historias de Usuario - Empleado.md` (HU-Empleado)

Ninguna fila del índice nombra este documento en "Corregir en".

### 1.12 `Historias de Usuario - Administrador.md` (HU-Administrador)

5 filas.

| Clave | Línea o sección citada | Qué dice hoy | Qué hace el código |
|---|---|---|---|
| B·D-07 | no citada por el informe | RF-adm: "levantar la suspensión de un cliente, reactivando su cuenta" | Al levantar, la cuenta vuelve a `PENDIENTE` o `INACTIVO` si era el origen y a `ACTIVO` en los demás casos (incluida `BLOQUEADO`, con intentos en 0); también para el Dueño |
| B·D-08 | no citada por el informe | RF-adm "Gestión de Usuarios" solo habla del cliente | La suspensión de Dueño, su vista previa, el listado de Dueños, el reenvío de email y el mínimo 10 / máximo 500 caracteres del motivo no figuran en RF-adm (solo de forma indirecta en RF-sis:25-31) |
| D-COMPL·D-13 | ~línea 12 | RF-adm (~línea 12): "restaurando su estado a Aprobado"; HU-A06 genérica | Restaura a `APTO_VENTA`, `APROBADO` o `CERRADO_TEMPORALMENTE` según cuenta de cobro, documentos y cuenta del Dueño |
| D-COMPL·D-16 | no citada por el informe | HU-A07: "estado, tipo, fecha de registro, Dueño titular y si ese Dueño tiene MP vinculado" | La fila muestra nombre, tipo, localidad y estado; sin fecha de registro, Dueño ni MP; sin búsqueda ni filtros |
| F·D-34 | línea 59, línea 76 | RF-cli (línea 59), HU-C14, HU-A13 y RF-adm (línea 76): reclamo por pedido a domicilio no recibido y contacto directo con el comercio | Reclamo sobre cualquier pedido `ENTREGADO` (domicilio o retiro, también autoconfirmado) con seis motivos (`NO_RECIBI_PEDIDO` solo domicilio) y fotos opcionales; no existe la opción "contactar directamente al comercio"; el único contacto es "Contactar a Soporte" tras un rechazo |

### 1.13 `Historias de Usuario (el informe no indica el rol)` (HU)

2 filas.

| Clave | Línea o sección citada | Qué dice hoy | Qué hace el código |
|---|---|---|---|
| A·D-05 | RF-gen:46, 75 | RF-gen:46, 75: "el aviso lo dice" | El modal siempre dice "Tu sesión terminó. Iniciá sesión de nuevo."; no distingue login en otro dispositivo; sin email |
| A·D-11 | no citada por el informe | Aviso de bloqueo | El 3.er intento fallido responde 401 con `intentosRestantes: 0` y deja `BLOQUEADO`; el frontend solo reacciona a `intentosRestantes === 1`, así que el bloqueo recién se ve en el 4.º intento (en el cambio desde perfil sí hay modal con `0`) |

### 1.14 `requisitos-no-funcionales.md` (RNF)

4 filas.

| Clave | Línea o sección citada | Qué dice hoy | Qué hace el código |
|---|---|---|---|
| A·D-01 | RF-gen:66 | RF-gen:66: mensaje genérico (solo cubre el texto) | Lanza el 401 antes de llamar a BCrypt cuando el usuario no existe: responde más rápido que para uno existente |
| A·D-04 | no citada por el informe | Respuesta genérica (RF-gen) | El controlador responde 200 genérico "Si la cuenta existe y está pendiente de verificación, se envió un nuevo código" pero el servicio lanza 404 "No existe una cuenta con ese email" y 409 "Esta cuenta ya está verificada"; sin espera ni tope por hora en servidor (30 s solo en el frontend) |
| H·D-54 | L46-48, L313, L118 | RF-sis L46-48: "Un job periódico procesa los tokens con `fecha_vencimiento <= NOW()` y `estado = PENDIENTE`"; L313; RNF L118 | Ningún `@Scheduled` de tokens y `EXPIRADO` no se escribe en ningún lugar de `backend/src/main/java` (grep sin resultados) |
| H·D-58 | L311-317, L118 | RF-sis L311-317 y RNF L118: todos los procesos automáticos registran su ejecución según la taxonomía de logs | Registro de ejecución parcial: la inactivación siempre escribe el resumen; el cierre de turno solo si cerró, envió o falló algo; el vencimiento de invitaciones solo si venció alguna; la reapertura no escribe nada por corrida (solo `warn` por comercio y `error` por falla); `PedidoSchedulerService` no registra en esa clase |

### 1.15 `diccionario-de-datos.md` (DIC)

25 filas.

| Clave | Línea o sección citada | Qué dice hoy | Qué hace el código |
|---|---|---|---|
| A·D-02 | RF-gen:73-75 | DIC: "Cierre por expiración del tiempo de sesión inactiva"; RF-gen:73-75 "cierre ... automático", "por vencimiento" | `AUTOMATICO` nunca se asigna; el JWT vence a las 24 h pero la fila de `sesion` queda `activa = true` hasta el próximo login; no hay job ni temporizador de frontend |
| A·D-07 | no citada por el informe | DIC: `email_verificado` pasa a `true` al verificar; job periódico de expiración | La columna existe (`DEFAULT 0`) pero la entidad no la mapea y nada la escribe; `EXPIRADO` nunca se asigna y no hay job periódico; un token vencido queda `PENDIENTE` |
| A·D-09 | (tabla Usuario) | DIC (tabla Usuario): al registrarse se inserta fila con `estado_origen = NULL` y `estado_destino = PENDIENTE` | No escribe la fila inicial de `historial_estado_usuario`; la primera aparece al verificar (`PENDIENTE → ACTIVO`) |
| A·D-12 | no citada por el informe | DIC: tras 3 intentos fallidos se resetea a 0 | No se resetea al bloquear (queda en 3); se pone en 0 en la recuperación, en el login exitoso o en la reactivación |
| A·D-13 | no citada por el informe | — | La pantalla de éxito del registro de Dueño dice "te vamos a avisar por email cuando quede aprobado" y el código no manda email de aprobación; en P1.01 los 409 de email y DNI se muestran en el banner del paso 2 aunque son del paso 1; DIC de `Token` todavía menciona "UUID" y "enlace" |
| A·D-16 | no citada por el informe | Regla de 5 intentos por código y "sin links" | Sigue público; valida por el valor del código sin email ni contador de intentos; no lo usa el frontend |
| A·D-18 | §5bis | — (ver A·C-01) | No normalizan el email (sin `trim` ni minúsculas, a diferencia del registro y del login por nombre de usuario) |
| A·D-20 | no citada por el informe | DIC la declara nullable | `fecha_ultimo_acceso` quedó `NOT NULL DEFAULT current_timestamp()` y se completa en `@PrePersist` |
| C·D-01 | no citada por el informe | RF-sis T14/T15 "App + Email"; las pantallas de éxito del registro y `comercio-pendiente.html` prometen un email | Solo crea notificación in-app `COMERCIO_APROBADO` / `COMERCIO_RECHAZADO`; no manda email |
| D·D-03 | no citada por el informe | La documentación del cierre manual no lo aclara | Reabre aunque el comercio esté `SUSPENDIDO` o `INACTIVO` (solo apaga la bandera) y no emite avisos |
| E·D-21 | línea 39 | RF-cli (línea 39): vinculado a la sesión, "pasando a estado inactivo al expirar la sesión o al inactivarse la cuenta" | Un único registro por Cliente, sin estado ni vínculo con la sesión; no expira; solo se vacía por acciones del Cliente, pago aprobado o baja de un producto |
| E·D-25 | línea 153 | RF-sis (línea 153, T11): "Push + Panel + Email" | Solo aviso in-app (`PUSH`); ningún aviso de pedido (T1, T2, T3, T5 a T13) envía email |
| F·D-39 | líneas 162-163 | RF-sis (líneas 162-163): T20/T21 "Push + Panel"; `RECLAMO_REEMBOLSO_DUENO` no figura en la tabla leída | T20/T21: aviso in-app más email (Resend) al Cliente; para el Dueño `RECLAMO_REEMBOLSO_DUENO` |
| G·D-42 | no citada por el informe | RF-sis y DIC (`fecha_fallido`): notificación al Administrador, Push + Email, a los 5 intentos | Existe en enum y ENUM de base sin emisor; el Administrador solo ve las notas `FALLIDO` / `PENDIENTE_REVISION_MANUAL` y la insignia |
| G·D-44 | no citada por el informe | RF-sis y DIC: `PEDIDO_CANCELADO_SISTEMA` "Push + Email" | Solo PUSH; `EmailService` no tiene método para pedidos |
| G·D-45 | no citada por el informe | T14 y T15 documentados Push + Email al Dueño | Solo `notificacionService.crearParaDueno`; sin método de email de comercio aprobado/rechazado (T16, suspensión, sí lleva email por `AvisoCuentaService`) |
| G·D-46 | no citada por el informe | T24 y T25 documentados con canal "Email" únicamente | `CUENTA_INACTIVADA` crea además un aviso PUSH al usuario y `COMERCIO_INACTIVADO` un aviso PUSH al Dueño por comercio; el email es uno solo por cuenta (con la lista de comercios); el "email de T25" no existe como mensaje propio |
| G·D-48 | no citada por el informe | DIC: reembolso total solo para `RECHAZADO`, `EXPIRADO` y suspensión de comercio; `CANCELADO`/`ANULADO` "siguen pendientes, marcados con TODO en `PedidoService`" | Cancelación del Cliente, anulación, rechazo, expiración, suspensión (comercio y Cliente), pago tardío y reclamo ya generan nota |
| G·D-51 | ~línea 671 | DIC (nota de audiencias, ~línea 671): cinco audiencias; columna `tipo` dice "ver tabla T1–T35" (son T1–T41) | Seis audiencias (`EMPLEADOS`: `COMERCIO_SUSPENDIDO_EQUIPO` y `COMERCIO_SUSPENSION_LEVANTADA_EQUIPO`); `RECLAMO_REEMBOLSO_DUENO` no aparece en DIC (la tabla leída termina en T41) |
| H·D-55 | L241-242, L2358 | RF-sis L241-242; DIC L2358: "pasa a `activo = false` al cerrar sesión, inactivarse la cuenta o expirar la sesión" | La columna existe (defecto 1) pero la entidad no la mapea y nada la escribe; la inactivación no toca el carrito |
| H·D-57 | L182, L689 | RF-sis L182 y DIC L689: T25 `COMERCIO_INACTIVADO` canal "Email" | Solo aviso en la app por comercio; el único email es el de T24 (nombra a los comercios) |
| I·D-60 | DIC:651 | DIC:651: "Push al Administrador, nuevo mensaje de soporte de un usuario suspendido" | No emite nunca ese aviso (ni al crear ni al responder la persona); el Administrador solo ve el contador `consultasSoporteEsperando` con sondeo de 15 s |
| I·D-63 | no citada por el informe | Habla de "consultas de la persona" sin precisar este cruce | "Mis consultas" y las operaciones con sesión se resuelven por `usuario_id = :id OR email = :email`: una consulta creada sin sesión con el email de la cuenta aparece en "Mis consultas" y la cuenta puede responderla con sesión |
| I·D-64 | DIC:667 | DIC:667: T41 "dejó de recibir pedidos" (coincide, sin advertir el texto engañoso en el caso `INACTIVO`) | T41 se emite en toda transición con destino `APROBADO`, incluso al restaurar un comercio `INACTIVO` o `CERRADO_TEMPORALMENTE` (que no vendía), con el texto "dejó de recibir pedidos"; `DUENO_BLOQUEADO` existe con texto "Bloqueo de cuenta" pero ningún llamador lo usa |
| I·D-67 | no citada por el informe | La documentación la describe solo para respuestas de Soporte | Los mensajes de la persona se guardan con `email_enviado = true` siempre (no se envía email por ellos): la columna significa "enviado o no aplica" |

### 1.16 `docs/CONCURRENCIA-Y-TRANSACCIONES.md` (CONC)

5 filas.

| Clave | Línea o sección citada | Qué dice hoy | Qué hace el código |
|---|---|---|---|
| A·D-08 | §9 | Hecho canónico de zona única; pendiente en CLAUDE §9 | `LocalDateTime.now()` (zona de la JVM) en `fecha_ultimo_acceso`, `sesion.fecha_inicio`, `fecha_registro`, vencimientos de tokens; `EstadoUsuarioService` y los jobs usan el `Clock` de `America/Argentina/Ushuaia` |
| G·D-49 | ~línea 131, §7 | Título: "Módulo Pago / MercadoPago — fuera de alcance del MVP ... documentado para v2" (~línea 131) | El módulo está implementado |
| G·D-50 | no citada por el informe | CONC (nivel 5): pago antes que nota | Toma la nota `FOR UPDATE` y después el pago `FOR UPDATE` (orden inverso al de `prepararIntento` y `generarNotaDeReclamo`) |
| I·D-62 | no citada por el informe | CONC (Soporte): todas las claves como "contador" | Las claves `CREAR_EMAIL|` / `CREAR_IP|` no llevan conteo (cantidad siempre 0, solo cerrojo); el límite de creación se cuenta sobre `ticket_soporte`; solo `INTENTO_*` y `REENVIO_*` son contadores |
| I·D-66 | no citada por el informe | CONC (Soporte): "5 intentos por hora", "los 5 intentos por hora de su acceso"; el nombre del test cita "TreintaIntentos" | Permite 30 intentos fallidos por hora por email y 10 por IP |

### 1.17 `alcance-y-limitaciones.md` (ALC)

1 filas.

| Clave | Línea o sección citada | Qué dice hoy | Qué hace el código |
|---|---|---|---|
| G·D-47 | ~línea 223 | ALC (~línea 223): "solo genera una alerta ... No se devuelve el dinero" (RF-sis ya coincide) | Además de la alerta `PAGO_APROBADO_SOBRE_PEDIDO_CANCELADO`, crea la nota (`PAGO_TARDIO`, `SUSPENSION_CLIENTE` o `SUSPENSION_COMERCIO`) y pide el reembolso total; el pago duplicado sí es solo alerta |

### 1.18 `CLAUDE.md` (CLAUDE)

15 filas.

| Clave | Línea o sección citada | Qué dice hoy | Qué hace el código |
|---|---|---|---|
| A·D-08 | §9 | Hecho canónico de zona única; pendiente en CLAUDE §9 | `LocalDateTime.now()` (zona de la JVM) en `fecha_ultimo_acceso`, `sesion.fecha_inicio`, `fecha_registro`, vencimientos de tokens; `EstadoUsuarioService` y los jobs usan el `Clock` de `America/Argentina/Ushuaia` |
| A·D-15 | RF-gen:114, §5bis | CLAUDE §5bis: "mínimo 8 caracteres, 1 mayúscula, 1 número (sin símbolo)"; coincide con RF-gen:114 | Exige 8 a 72 caracteres con mayúscula, minúscula y número |
| A·D-18 | §5bis | — (ver A·C-01) | No normalizan el email (sin `trim` ni minúsculas, a diferencia del registro y del login por nombre de usuario) |
| B-COMPL·Obs-1 | §1bis, §9 | CLAUDE §1bis (bloque A2 de E3), lista de pulido y §9: el Dueño puede editar con `SUSPENDIDO` | Bloquea al Dueño con `SUSPENDIDO` e `INACTIVO` |
| B·D-02 | §5bis | (código/código; el comentario de `ComercioPerfilRequestDTO` ya reconoce que solo valida el dominio) | Solo se apoya en `@ValidarUrlCloudinary` (dominio + extensión); no hay validación de carpeta `usuarios/{id}/perfil/`, a diferencia de foto de comercio, comercio nuevo e imágenes de producto |
| B·D-04 | §1bis, §9 | RF-due: "hoy el Dueño no tiene las restricciones que sí tiene el Empleado (por ejemplo, puede editar productos y perfil con el comercio Suspendido): es un hueco conocido" | 409 "El comercio está suspendido: por ahora no se puede modificar." y 409 "El comercio está inactivo: por ahora no se puede modificar." para Dueño y Empleado (`editarPerfil`, `actualizarFotoPerfil`, `editarDatosOperativos`, firma de foto) |
| C·D-11 | no citada por el informe | — | `true` por defecto solo en la clase, no en `application.properties` |
| C·D-12 | §1bis | CLAUDE §1bis (C1/C2) la describe solo con Mercado Pago | La aptitud exige además documentos (Fase 4) |
| C·D-14 | §9 | CLAUDE §9: el Dueño puede editar con `SUSPENDIDO` | Bloquea al Dueño con `SUSPENDIDO` |
| D·D-02 | §9 | CLAUDE §9 (lista de pulido) dice que el Dueño puede editar con `SUSPENDIDO` | Bloquea al Dueño y al Empleado |
| D·D-05 | no citada por el informe | Documento canónico | Coincide con el código pero omite que `PENDIENTE_PAGO` queda sin tocar y que un pago aprobado tardío se cancela y reembolsa |
| E·D-27 | §7 | CLAUDE §7.2: "Aplicarlo al Dueño queda para el tramo de suspensión" | Ya aplica el guard al Dueño con `SUSPENDIDO` (409 `COMERCIO_SIN_OPERACION`, "El comercio está suspendido: no podés aceptar pedidos nuevos. Sí podés rechazarlos."); con `CERRADO_TEMPORALMENTE` el Dueño sigue pudiendo aceptar |
| E·D-29 | no citada por el informe | Anotada como deuda en CLAUDE | La tarjeta muestra `pedido.total` (con el cargo del Cliente) y el detalle muestra `pedido.neto` rotulado "Total" |
| H·D-56 | L110 | RF-sis L110: "Un comercio sin franjas horarias cargadas no se reabre solo."; CLAUDE (tramo C1): "sin franjas no reabre" | Si `proximoInicioDeFranja` no halla franja vigente, el job reabre el comercio y deja `log.warn` |
| I·D-61 | no citada por el informe | CLAUDE y mensajes: "3 consultas hoy", "por día" | Ventana móvil de 24 horas, no día calendario; el mensaje dice "hoy" y "mañana" |

### 1.19 `Diagrama de Flujo - Nivel 1 (`02. Diseño`)` (N1)

1 filas.

| Clave | Línea o sección citada | Qué dice hoy | Qué hace el código |
|---|---|---|---|
| J·D-71 | no citada por el informe | N1 (flujo 64): "Tarifas almacenadas en pedidos históricos" | El pedido guarda solo `subtotal`, `cargo_servicio_cliente`, `cargo_servicio_comercio` y `total`: sin id, tipo ni tasa de la configuración aplicada; ningún flujo va de `pedido` hacia `configuracion_tarifa` (el flujo 64 del N1 no existe). El cambio de tarifa no deja aviso ni auditoría más allá de `administrador_id` y `fecha_vigencia`; sobre un pedido en vuelo salta el 409 `PRECIO_CAMBIO` |

### 1.20 `Javadoc y código comentado` (JAVADOC)

4 filas.

| Clave | Línea o sección citada | Qué dice hoy | Qué hace el código |
|---|---|---|---|
| B-COMPL·Obs-2 | no citada por el informe | — | Desactualizados (ver §4.2 punto 3 y §4.4 del complemento) |
| C·D-05 | no citada por el informe | Desactualizado | Dice que no hay edición de horarios |
| H·D-59 | no citada por el informe | — | Javadoc: "Los 5 jobs" y "uno de los cuatro procesos"; hay 7 métodos `@Scheduled` |
| I·D-65 | no citada por el informe | DECISIONES/CLAUDE: "4 jobs" y "7 de la tabla" según la fecha | Javadoc "Los 5 jobs"; hay 7 métodos `@Scheduled` |

### 1.21 Otros destinos que el índice nombra (fuera de la lista de documentos del encargo)

| Destino | Clave | Qué dice hoy | Qué hace el código |
|---|---|---|---|
| skill-validaciones | A·D-15 | CLAUDE §5bis: "mínimo 8 caracteres, 1 mayúscula, 1 número (sin símbolo)"; coincide con RF-gen:114 | Exige 8 a 72 caracteres con mayúscula, minúscula y número |
| skill-validaciones | B·D-02 | (código/código; el comentario de `ComercioPerfilRequestDTO` ya reconoce que solo valida el dominio) | Solo se apoya en `@ValidarUrlCloudinary` (dominio + extensión); no hay validación de carpeta `usuarios/{id}/perfil/`, a diferencia de foto de comercio, comercio nuevo e imágenes de producto |
| skill-validaciones | B·D-09 | — | Nombre/apellido: "Debe contener solo letras, espacios y guiones" (registro: "El nombre solo puede contener letras"); teléfono vacío "No debe estar vacío" (registro: "El teléfono es obligatorio"); no normaliza (el teléfono se guarda como llegó); `@Size(max = 150)` y `@Size(max = 30)` del comercio sin mensaje propio |
| skill-validaciones | C·D-08 | — | Sin mensajes propios en `aprobar` / `motivo` |
| LISTA-DE-DESPLIEGUE | C·D-11 | — | `true` por defecto solo en la clase, no en `application.properties` |
| DECISIONES | I·D-65 | DECISIONES/CLAUDE: "4 jobs" y "7 de la tabla" según la fecha | Javadoc "Los 5 jobs"; hay 7 métodos `@Scheduled` |
| Textos de pantalla | A·D-13 | — | La pantalla de éxito del registro de Dueño dice "te vamos a avisar por email cuando quede aprobado" y el código no manda email de aprobación; en P1.01 los 409 de email y DNI se muestran en el banner del paso 2 aunque son del paso 1; DIC de `Token` todavía menciona "UUID" y "enlace" |
| Textos de pantalla | C·D-01 | RF-sis T14/T15 "App + Email"; las pantallas de éxito del registro y `comercio-pendiente.html` prometen un email | Solo crea notificación in-app `COMERCIO_APROBADO` / `COMERCIO_RECHAZADO`; no manda email |
| Textos de pantalla | J·D-73 | Texto de pantalla (modales del Administrador): "Solo las categorías activas pueden asignarse a productos." y "Solo los tags activos pueden asignarse a productos." | No validan `activo`: un `POST`/`PUT` de producto con categoría o tag inactivos se acepta |
| Encargo / mapeo de migraciones | F·D-32 | El encargo pedía "Resolución de reclamo por el Administrador (V51)" | Toda la resolución está en `V50`; `V51` es la de las fotos del Cliente |

### 1.22 Filas sin documento destino

Filas del índice cuya columna "Corregir en" es "—", "(código/código)" sola o "No indicado en el informe": no hay un documento para corregir; las que son del código están clasificadas en la sección 2.

| Clave | Corregir en (literal) |
|---|---|
| A·D-14 | (código/código) |
| B-COMPL·Obs-3 | (código/código) |
| B-COMPL·Obs-4 | (código/código) |
| B·D-13 | (código/código) |
| B·D-17 | (código/código) |
| B·D-18 | — |
| C·D-02 | No indicado en el informe |
| C·D-03 | — (sin corrección) |
| C·D-04 | (código/código) |
| C·D-07 | (código/código) |
| C·D-09 | (código/código) |
| C·D-10 | (código/código) |
| C·D-15 | (código/código) |
| E·D-28 | (código/código) |
| F·D-30 | — |
| F·D-37 | (código) |
| J·D-68 | No indicado en el informe |
| J·D-69 | (código/código); misma familia que A·D-08 |
| J·D-70 | (código/código) |
| J·D-72 | (código/código) |
| J·D-74 | (código/código) |
| J·D-75 | (código/código) |
| J·D-76 | (código/código) |
| J·D-77 | (código/código) |
| J·D-79 | (código/código) |

---

## 2. Corregir en el código (clasificación)

Solo se clasifica; no se corrige nada. **Tipo:** *Defecto* = el código contradice una regla clara (textos duplicados o distintos, mensajes sin texto propio, `LocalDateTime.now()` frente al `Clock`, literales que contradicen una configuración); *Decisión de negocio pendiente* = el código y la documentación difieren pero falta que Diego decida cuál es la regla (ver la sección 3); *Solo documentación* = el índice indica que lo que se corrige es un texto (Javadoc, DECISIONES, propiedades documentadas) y no el comportamiento.

| Clave | Tipo | Qué hace el código | Nota |
|---|---|---|---|
| A·D-08 | Defecto | `LocalDateTime.now()` (zona de la JVM) en `fecha_ultimo_acceso`, `sesion.fecha_inicio`, `fecha_registro`, vencimientos de tokens; `EstadoUsuarioService` y los jobs usan el `Clock` de `America/Argentina/Ushuaia` | `LocalDateTime.now()` de la JVM frente al `Clock` de `America/Argentina/Ushuaia`; pendiente anotado en CLAUDE §9. Mismo tema: B·C-04, H·C-45, J·D-69 |
| A·D-13 | Decisión de negocio pendiente | La pantalla de éxito del registro de Dueño dice "te vamos a avisar por email cuando quede aprobado" y el código no manda email de aprobación; en P1.01 los 409 de email y DNI se muestran en el banner del paso 2 aunque son del paso 1; DIC de `Token` todavía menciona "UUID" y "enlace" | La pantalla de éxito del registro de Dueño promete un email de aprobación que el código no manda (A·C-02; C·D-01, G·D-45); además el 409 de email y DNI se muestra en el banner del paso 2 aunque es del paso 1 |
| A·D-14 | Defecto | Backend: "Tenés que tener al menos 14 años para registrarte"; frontend: "Tenés que tener al menos 14 años para poder registrarte." | El mensaje de edad mínima difiere entre el backend ("…para registrarte") y el frontend ("…para poder registrarte.") |
| A·D-18 | Decisión de negocio pendiente | No normalizan el email (sin `trim` ni minúsculas, a diferencia del registro y del login por nombre de usuario) | Los DTO de verificación, recuperación y reactivación no normalizan el email; depende de A·C-01 (collation real de `Usuario.email`) |
| B-COMPL·Obs-2 | Solo documentación | Desactualizados (ver §4.2 punto 3 y §4.4 del complemento) | Javadoc de `ComercioService.editarDatosOperativos` y de `ComercioDatosOperativosRequestDTO` desactualizados |
| B-COMPL·Obs-3 | Defecto | Dicen "suspender" también cuando la operación es reenviar un email | `MENSAJE_PROPIA_CUENTA` y `MENSAJE_ADMINISTRADOR` dicen "suspender" también al reenviar un email |
| B-COMPL·Obs-4 | Defecto | El literal "Ese nombre de usuario ya está en uso" está duplicado | El literal "Ese nombre de usuario ya está en uso" está duplicado (`GlobalExceptionHandler` línea 83 y `NombreUsuarioPolicy.MENSAJE_NO_DISPONIBLE`) |
| B·D-02 | Decisión de negocio pendiente | Solo se apoya en `@ValidarUrlCloudinary` (dominio + extensión); no hay validación de carpeta `usuarios/{id}/perfil/`, a diferencia de foto de comercio, comercio nuevo e imágenes de producto | Foto de usuario sin validación de carpeta `usuarios/{id}/perfil/` a diferencia de las otras fotos; B·C-02 pregunta si debe validarse |
| B·D-09 | Defecto | Nombre/apellido: "Debe contener solo letras, espacios y guiones" (registro: "El nombre solo puede contener letras"); teléfono vacío "No debe estar vacío" (registro: "El teléfono es obligatorio"); no normaliza (el teléfono se guarda como llegó); `@Size(max = 150)` y `@Size(max = 30)` del comercio sin mensaje propio | Mensajes de validación distintos entre registro y edición de perfil; `@Size` sin mensaje propio en el comercio; el teléfono no se normaliza al editar |
| B·D-13 | Defecto | Frontend: "Llegaste al máximo de 5 direcciones. Podés eliminar alguna para agregar otra."; servidor: "Ya tenés el máximo de 5 direcciones. Eliminá una para agregar otra."; `pisoDepto` con solo espacios pasa (`\s*`) y se guarda sin recortar | Textos distintos entre frontend y servidor ante el tope de 5 direcciones; `pisoDepto` de solo espacios pasa y se guarda sin recortar |
| B·D-17 | Defecto | No distingue rol: dice "Tus pedidos ya pagados siguen su curso." y "No podés hacer pedidos nuevos." también para un Dueño suspendido; el email del Dueño dice otra cosa | `mostrarPantallaCuentaSuspendida` no distingue rol: dice "Tus pedidos ya pagados siguen su curso." y "No podés hacer pedidos nuevos." también para un Dueño |
| C·D-01 | Decisión de negocio pendiente | Solo crea notificación in-app `COMERCIO_APROBADO` / `COMERCIO_RECHAZADO`; no manda email | Aprobar o rechazar un comercio solo crea aviso in-app; las pantallas de éxito del registro y `comercio-pendiente.html` prometen un email (A·C-02; A·D-13, G·D-45) |
| C·D-04 | Decisión de negocio pendiente | No se valida contra carpeta ni cuenta de Cloudinary (solo dominio) | Foto del primer alta sin validar carpeta ni cuenta de Cloudinary mientras otros flujos sí; análogo a B·C-02 |
| C·D-05 | Solo documentación | Dice que no hay edición de horarios | Javadoc de `ComercioDatosOperativosRequestDTO` dice que no hay edición de horarios |
| C·D-07 | Defecto | Tope de 500 caracteres: correcto para comercios, incorrecto para documentos | El modal de rechazo permite hasta 500 caracteres: correcto para comercios, incorrecto para documentos |
| C·D-08 | Defecto | Sin mensajes propios en `aprobar` / `motivo` | `AprobacionComercioRequestDTO` sin mensajes propios en `aprobar` y `motivo` |
| C·D-09 | Defecto | Sin `ORDER BY`; el orden lo da el frontend | El repositorio de pendientes no tiene `ORDER BY`; el orden lo da el frontend (ver D-COMPL·C-09) |
| C·D-10 | Defecto | 500 en pantalla frente a 255 en servidor y base | Motivo de rechazo de documento: 500 en pantalla frente a 255 en servidor y base |
| C·D-11 | Solo documentación | `true` por defecto solo en la clase, no en `application.properties` | `comercio.documentacion.requerida` es `true` por defecto solo en la clase, no en `application.properties` |
| C·D-15 | Defecto | Mensajes distintos entre alta y edición | Mensajes de validación de teléfono distintos entre el alta y la edición |
| D·D-01 | Decisión de negocio pendiente | Catálogo de comercios y de productos de un comercio incluyen `CERRADO_TEMPORALMENTE`; el catálogo global solo `APTO_VENTA` | El catálogo de comercios y el de productos de un comercio incluyen `CERRADO_TEMPORALMENTE` y el catálogo global solo `APTO_VENTA` (D·C-01) |
| E·D-28 | Defecto | Escribe literal "Cargo por servicio (1%)" aunque la tarifa (`FIJO` o `PORCENTAJE`) es configurable | `comercio.js` escribe el literal "Cargo por servicio (1%)" aunque la tarifa (`FIJO` o `PORCENTAJE`) es configurable |
| E·D-29 | Defecto | La tarjeta muestra `pedido.total` (con el cargo del Cliente) y el detalle muestra `pedido.neto` rotulado "Total" | La tarjeta de pedido activo muestra `pedido.total` (con el cargo del Cliente) y el detalle muestra `pedido.neto` rotulado "Total"; deuda anotada en CLAUDE |
| F·D-37 | Defecto | Con `pedido = "el pedido"` resulta "Confirmó automáticamente la entrega de el pedido" (en la Actividad dice "de un pedido") | `textoDePedidoDelSistema` con `pedido = "el pedido"` resulta "Confirmó automáticamente la entrega de el pedido" |
| G·D-50 | Solo documentación | Toma la nota `FOR UPDATE` y después el pago `FOR UPDATE` (orden inverso al de `prepararIntento` y `generarNotaDeReclamo`) | CONC dice pago antes que nota y `prepararReintento` toma la nota y después el pago; G·C-33 deja abierto el riesgo de interbloqueo (no probado) |
| H·D-59 | Solo documentación | Javadoc: "Los 5 jobs" y "uno de los cuatro procesos"; hay 7 métodos `@Scheduled` | Javadoc de `PedidoSchedulerService` dice "Los 5 jobs" y "uno de los cuatro procesos"; hay 7 métodos `@Scheduled` |
| I·D-65 | Solo documentación | Javadoc "Los 5 jobs"; hay 7 métodos `@Scheduled` | Mismo Javadoc de `PedidoSchedulerService` ("Los 5 jobs"); DECISIONES y CLAUDE dicen "4 jobs" y "7 de la tabla" según la fecha |
| J·D-68 | Defecto | Siembra la tarifa inicial (200,00 `FIJO` al cliente; 1,00 `PORCENTAJE` al comercio) solo si existe un `usuario` con email `admin@bajonea.com`; sin esa fila no hay tarifa vigente y el carrito con ítems y `confirmarPedido` responden 409 "No hay ninguna configuración de tarifa vigente" (no se consultó cuál email tiene el Administrador de cada base) | La semilla de la tarifa inicial depende del email `admin@bajonea.com` y CLAUDE nombra `admin@bajonea.ar`; sin la fila no hay tarifa vigente. No verificado contra las bases (J lo deja NO RELEVADO). Relacionado: J·C-58 |
| J·D-69 | Defecto | `fecha_vigencia = LocalDateTime.now()` (zona de la JVM, no el `Clock`) en una columna `datetime` sin fracciones: dos altas dentro del mismo segundo empatan y `findTopByOrderByFechaVigenciaDesc` no desempata; no existe columna "vigencia hasta" | `fecha_vigencia` con `LocalDateTime.now()` de la JVM en columna `datetime` sin fracciones y sin desempate; misma familia que A·D-08 |
| J·D-70 | Decisión de negocio pendiente | Sin máximo, sin `@Digits` ni tope de porcentaje: el porcentaje puede superar 100 (la comisión supera el subtotal y el neto queda negativo), los dos cargos pueden ser 0, más de dos decimales los redondea la base y un valor mayor al `decimal(10,2)` falla en la base (resultado NO VERIFICADO) | Sin tope de porcentaje ni máximo para las tarifas (J·C-57) |
| J·D-71 | Decisión de negocio pendiente | El pedido guarda solo `subtotal`, `cargo_servicio_cliente`, `cargo_servicio_comercio` y `total`: sin id, tipo ni tasa de la configuración aplicada; ningún flujo va de `pedido` hacia `configuracion_tarifa` (el flujo 64 del N1 no existe). El cambio de tarifa no deja aviso ni auditoría más allá de `administrador_id` y `fecha_vigencia`; sobre un pedido en vuelo salta el 409 `PRECIO_CAMBIO` | El pedido no guarda referencia a la configuración de tarifa aplicada (J·C-60); el flujo 64 del N1 es además un cambio de documentación (DFD Nivel 1) |
| J·D-72 | Decisión de negocio pendiente | Editar cambiando solo mayúsculas o tildes responde 409 "Ya existe una categoría con ese nombre" / "Ya existe un tag con ese nombre": el `equals` de Java distingue mayúsculas pero `existsByNombre` (collation `utf8mb4_unicode_ci`) encuentra a la propia fila | Renombrar solo la capitalización da 409 (J·C-63) |
| J·D-73 | Decisión de negocio pendiente | No validan `activo`: un `POST`/`PUT` de producto con categoría o tag inactivos se acepta | El servidor no valida `activo` al asignar categoría o tag mientras los textos de pantalla dicen lo contrario (J·C-61) |
| J·D-74 | Decisión de negocio pendiente | La baja lógica no modifica ningún producto ni el catálogo: los filtros salen de los productos visibles sin mirar `activo` y los `GET` devuelven las inactivas a cualquier autenticado | La baja lógica de categoría o tag no cambia el catálogo (J·C-61) |
| J·D-75 | Decisión de negocio pendiente | Editar un producto cuya categoría está inactiva deja el selector sin valor; al guardar, `tagIds` reemplaza la lista y se pierden los tags inactivos | Producto con categoría inactiva: selector sin valor y pérdida de tags inactivos al guardar (J·C-62) |
| J·D-76 | Defecto | Sin `trim` ni normalización en el servidor (el frontend recorta); `@Size(max = 100)` sin mensaje propio; una carrera de altas devuelve el 409 genérico "Ya existe un registro con alguno de los datos ingresados" | Sin `trim` en el servidor, `@Size(max = 100)` sin mensaje propio y 409 genérico en la carrera de altas |
| J·D-77 | Decisión de negocio pendiente | Devuelve las estadísticas con el comercio en cualquier estado (no comprueba `APROBADO`, `APTO_VENTA`, `SUSPENDIDO`…); el Empleado y el Administrador reciben 403 de la capa de seguridad (la ruta no está en `DelegacionEmpleado`) | Estadísticas sin comprobar el estado del comercio y sin acceso del Empleado (J·C-64) |
| J·D-78 | Solo documentación | Los chips "Delivery", "Retiro" y "Abierto ahora" son un filtro del lado cliente sobre `GET /catalogo/comercios` (`index.html`); Explorar solo tiene categoría, tags, búsqueda por nombre de producto y paginación; no existe búsqueda por nombre de comercio. **Corrige a D-COMPL·D-09** | Corrige a D-COMPL·D-09; relacionado con la decisión J·C-65 (búsqueda de comercios por nombre) |
| J·D-79 | Decisión de negocio pendiente | `q` busca solo en `producto.nombre` con `contains` en minúsculas (sin normalizar tildes) y el servidor no limita su longitud (el frontend corta en 80); un parámetro de tipo inválido responde 400 "`<parámetro>`: valor inválido" | `q` solo busca en `producto.nombre`, sin normalizar tildes y sin tope de longitud en el servidor; el texto del 400 por tipo inválido es el genérico (J·C-65 en lo que toca a la búsqueda) |

**Cantidad por tipo:** Defecto 18 · Decisión de negocio pendiente 14 · Solo documentación 7 (total 39 filas).

---

## 3. Decisiones de negocio pendientes

Cuestiones del índice (§4) con un desvío vinculado de forma explícita en el índice (por mención de la clave, por la §1.4 o por el texto de la propia fila). La columna "Decisión de Diego" está vacía en el índice y se deja vacía acá. Las cuestiones que bloquean una corrección son las que tienen al menos un desvío vinculado.

| Cuestión | Resumen | Desvíos que afecta | Decisión de Diego |
|---|---|---|---|
| A·C-01 | ¿`Usuario.email` debe ser insensible a mayúsculas por collation? Los DTO comparan el email tal cual y no se verificó la collation real | A·D-18 | |
| A·C-02 | La pantalla de éxito del registro de Dueño promete un email al aprobar el comercio: ¿existe? (el informe C responde: no, solo aviso in-app) | A·D-13, C·D-01, G·D-45 | |
| A·C-03 | ¿Es intencional el 409 de `PENDIENTE` y `BLOQUEADO` antes de la contraseña? | A·D-03 | |
| A·C-04 | ¿Hay que cerrar la fila de `sesion` cuando vence el JWT (24 h) o `AUTOMATICO` queda como valor reservado? | A·D-02 | |
| A·C-05 | ¿El registro de Dueño debe aceptar foto personal? | A·D-06, B·D-01 | |
| B·C-01 | ¿El Dueño debe poder cargar su foto personal (B·D-01)? Si sí, falta pantalla; si no, corregir los requisitos | B·D-01 | |
| B·C-02 | ¿La foto de usuario debe validarse contra la carpeta `usuarios/{id}/perfil/` como las demás? | B·D-02, C·D-04 | |
| B·C-03 | Texto exacto de `NombreUsuarioPolicy.MENSAJE_NO_DISPONIBLE` no abierto; confirmar contra "Ese nombre de usuario ya está en uso" | B-COMPL·Obs-4 | |
| B·C-04 | El límite de 3 cambios de nombre de usuario usa `LocalDateTime.now()` de la JVM y no el `Clock`: con otra zona la ventana de 30 días se corre unas horas | A·D-08, J·D-69 | |
| B·C-06 | ¿Se avisa por email al Empleado dado de baja o que pierde acceso? Hoy solo recibe un aviso in-app personal | B·D-16 | |
| B·C-10 | Un Empleado de un comercio `INACTIVO` entra en solo lectura: ¿debe verlo en el selector? | B·D-05 | |
| D·C-01 | ¿Está bien que el catálogo global excluya `CERRADO_TEMPORALMENTE` (D·D-01)? | D·D-01 | |
| D·C-03 | ¿Los avisos de reapertura automática al Dueño o Empleados son un requisito? Hoy no hay | D·D-03 | |
| D·C-04 | Chips de 7/30 días de estadísticas y filtros de comercios: confirmar en el frontend (resuelto parcialmente en D-COMPL) | D-COMPL·D-09, J·D-78 | |
| D·C-05 | Orden de los productos de un comercio en el catálogo no definido en el servicio (D-COMPL lo confirma como C-09) | C·D-09, D-COMPL·C-09 | |
| D-COMPL·C-08 | ¿El Dueño debe ver una explicación de "Cerrado temporalmente" (cuenta bloqueada) en su panel? | D-COMPL·D-10 | |
| D-COMPL·C-09 | Orden de comercios y de productos del menú depende de la base (sin `ORDER BY`): ¿orden estable definido? | C·D-09 | |
| D-COMPL·C-10 | El catálogo de comercios no tiene búsqueda por nombre ni filtro por tipo ni localidad: ¿es el alcance definitivo? | D-COMPL·D-09, J·D-78 | |
| E·C-15 | `RechazoPedidoRequestDTO.motivo`, `AnulacionPedidoRequestDTO.motivo` y sus `@Size(max = 500)` sin `message` | B·D-09, C·D-08 | |
| E·C-16 | `PUT/POST /carrito/items` no controlan el subtotal máximo ($99.999.999) ni revalidan el producto | E·D-18 | |
| E·C-17 | El backend permite cancelar `PENDIENTE_PAGO` siempre; la pantalla solo lo ofrece con el comercio no disponible | E·D-22 | |
| E·C-18 | "Aceptar pedido" solo se oculta con `SUSPENDIDO`; con `CERRADO_TEMPORALMENTE` el Empleado lo ve y recibe 409 | E·D-27 | |
| E·C-19 | `totalEsperado` es opcional: otro consumidor de la API puede crear un pedido a un total distinto del visto | J·D-71 | |
| F·C-25 | ¿P4.11 debe mostrar un historial acotado en el tiempo? Hoy una lista única de todos los pagados | F·D-36 | |
| G·C-30 | `GET /pedidos/comercio/{id}/pago` solo para pedidos ya pagados y sin consumidor en el frontend | G·D-53 | |
| H·C-38 | Reactivar un Dueño: un comercio `INACTIVO` que vuelve a `APTO_VENTA` no genera aviso y uno que vuelve a `APROBADO` recibe T41 "dejó de recibir pedidos" aunque no vendía | I·D-64 | |
| H·C-39 | ¿Se implementa el pase del carrito a inactivo (H·D-55) o se corrige la documentación? | H·D-55, E·D-21 | |
| H·C-42 | Un solo hilo de programación: los 11 `@Scheduled` se serializan; un cierre de turno largo retrasa reaperturas, vencimientos y pedidos | I·C-56 (misma cuestión) | |
| H·C-43 | La inactivación no limpia `cerrado_manualmente` y la reapertura sigue evaluando comercios `INACTIVO` o `SUSPENDIDO` | D·D-03 | |
| H·C-45 | `AuthService.iniciarSesion`, sesiones y `ComercioService.registrarTransicionAutomatica` usan `LocalDateTime.now()` de la JVM | A·D-08, J·D-69 | |
| H·C-47 | `reactivar-cuenta.html` huérfana: ¿retirarla con `/auth/reactivar-cuenta` y `/confirmar` o dejarla de respaldo? | A·D-17 | |
| I·C-50 | El Administrador no recibe aviso por consulta nueva ni seguimiento: ¿se emite `NUEVO_MENSAJE_SOPORTE` (T22)? ¿hay tiempo máximo de respuesta? | I·D-60, F·D-33, G·D-43 | |
| I·C-56 | Scheduler de un solo hilo (por configuración, no verificado en ejecución); duplicada con H·C-42 | H·C-42 (misma cuestión) | |
| J·C-57 | ¿Debe el servidor validar un tope (por ejemplo porcentaje de 0 a 100) y un máximo para las tarifas? | J·D-70 | |
| J·C-58 | Sin tarifa vigente el carrito y los pedidos quedan bloqueados con 409: ¿es lo buscado o debe haber un valor por defecto? | J·D-68 | |
| J·C-59 | ¿Debe avisarse a Dueños y Clientes un cambio de tarifa o programarse una vigencia futura? Hoy se aplica siempre "desde ahora" y sin aviso | J·D-71 | |
| J·C-60 | ¿Debe el pedido conservar una referencia a la configuración de tarifa aplicada (flujo 64) además de los montos? | J·D-71 | |
| J·C-61 | ¿Debe desactivar una categoría o un tag impedir su asignación en el servidor y ocultarlos del catálogo del Cliente, o solo del selector del Dueño? | J·D-73, J·D-74 | |
| J·C-62 | ¿Un producto cuya categoría quedó inactiva debe seguir publicado? Hoy sí | J·D-75 | |
| J·C-63 | ¿Es la regla buscada que "Café" y "cafe" (y mayúsculas) cuenten como el mismo nombre, incluso al renombrar solo la capitalización? | J·D-72 | |
| J·C-64 | ¿Deben verse las estadísticas con el comercio en cualquier estado y debe el Empleado poder verlas? Hoy el servidor no mira el estado y el Empleado no | J·D-77 | |
| J·C-65 | ¿Hace falta una búsqueda de comercios por nombre (del servidor)? Hoy no existe: solo la de productos en Explorar | J·D-78, J·D-79, D-COMPL·D-09 | |

**Cuestiones sin desvío vinculado en el índice (53):** A·C-06, B·C-05, B·C-07, B·C-08, B·C-09, C·C-01, C·C-02, C·C-03, C·C-04, C·C-05, C·C-06, C·C-07, C·C-08, C·C-09, C·C-10, C·C-11, C·C-12, C·C-13, C·C-14, D·C-02, D-COMPL·C-06, D-COMPL·C-07, D-COMPL·C-11, D-COMPL·C-12, E·C-13, E·C-14, E·C-20, E·C-21, E·C-22, F·C-23, F·C-24, G·C-26, G·C-27, G·C-28, G·C-29, G·C-31, G·C-32, G·C-33, G·C-34, G·C-35, G·C-36, G·C-37, H·C-40, H·C-41, H·C-44, H·C-46, H·C-48, I·C-49, I·C-51, I·C-52, I·C-53, I·C-54, I·C-55.

**Totales de la sección:** 42 cuestiones con desvío vinculado + 53 sin vínculo = 95 cuestiones.

---

## 4. Cierre del DFD Nivel 1

Cambios concretos que el Nivel 1 (`02. Diseño`) necesitaría para coincidir con el código, tomados de las §5.1, §5.2 y §5.3 del índice. Formato: flujo actual → flujo según el código. Solo se describe; no se modifica ningún diagrama.

### 4.1 Flujos que el N1 dibuja y el código no ejecuta o ejecuta distinto

| Flujo actual | Flujo según el código |
|---|---|
| Flujo 53: P8 → P6 "Respuesta de Soporte" | No existe ese flujo: el email de respuesta lo envía P8 directo por `EmailService` y solo marca `ticket_soporte_mensaje.email_enviado`. |
| Flujo 61: P7 → P2 "Propagación de estado Dueño → sus comercios" | No es un proceso de P7: ocurre dentro de las transacciones de bloqueo, suspensión de Dueño (P1) e inactivación (P7.03). |
| Flujo 42: MP → P5 "Webhook de pago y estado de reembolso" | MP → P5 solo "Webhook de pago"; el resultado del reembolso es la respuesta síncrona de `POST …/refunds`; un `refunded` o `charged_back` posterior al `approved` se ignora. |
| Flujo 11: DUENO → P1 "Registro, credenciales, foto personal y datos fiscales" | Registro y credenciales; la foto personal no tiene pantalla ni se pide en el registro; los datos fiscales se cargan en el registro y en la corrección de un comercio rechazado, sin edición desde el perfil. |
| Flujo 15: DUENO → P2 "… redes sociales …" | Las redes sociales tienen endpoints pero no pantalla de edición. |
| Flujo 25: EMPLEADO → P2 "Productos, horarios y redes sociales de comercios asignados" | Productos, horarios, descripción y teléfono (datos operativos) y apertura o cierre del comercio; las redes sociales dan 403 para el Empleado. |
| Flujo 16: P2 → DUENO "Estado de aprobación, aptitud para vender, estado de documentos e historial" | La aprobación y el rechazo del comercio solo generan aviso in-app, sin email. |
| Flujos 54 a 56: P6 → CLIENTE / DUENO / EMPLEADO "Avisos en la app y email" | Los avisos de pedido (T1, T2, T3, T5 a T13), T11, T14 y T15 no envían email; los emails de cuenta y de reclamos salen por `AvisoCuentaService` y `AvisoReclamoService`. |
| Flujo 57: P6 → VISITANTE "Email de respuesta y de código" | Los emails al Visitante salen de P8 por `EmailService`, no de P6. |
| Flujo 52: P7 → P6 "Eventos de automatismo (vencimientos, cierre de turno)" | La reapertura y el vencimiento de invitaciones no emiten avisos ni emails; los jobs de pedidos y la inactivación crean avisos; el cierre de turno envía email directo (`CierreTurnoEnvioService`) y guarda su estado en `cierre_turno`. |
| Flujo 5: CLIENTE → P3 "Búsqueda y filtros" | `GET /catalogo/comercios` no recibe parámetros: búsqueda, tipo, modalidad y "abierto ahora" son del frontend (`initCatalogo`); Explorar usa `/catalogo/productos` (categoría, tags, `q` solo sobre `producto.nombre`, paginación) y `/catalogo/filtros`; no hay búsqueda de comercios por nombre del lado servidor (J·D-78). |
| Flujo 64: P4 → P7 "Tarifas almacenadas en pedidos históricos" | No existe (J1.6): ningún flujo va de `pedido` hacia `configuracion_tarifa`; el pedido guarda solo los montos. El único sentido es P7 → P4 (flujo 63). |
| Flujo 63: P7 → P4 "Tarifa vigente al crear pedido" | La tarifa se lee en `confirmarPedido` y también en cada `GET /carrito` con subtotal mayor a 0 (J1.4). |
| Flujo 43/47 y P5 ↔ MP "Solicitud de cobro, split y reembolso" | Además del cobro y el reembolso, P5 ↔ MP incluye el intercambio de código por tokens OAuth (P5.01). |
| Flujos 38 y 39: ADMIN ↔ P7 "Configuración de tarifas" / "Historial de tarifas" | Sin cambio: J1 confirma que el código los ejecuta (`POST /administrador/tarifas`, `GET …/vigente`, `GET …/historial`). |
| Flujo 34: ADMIN → P2 "… y catálogo" | Sin cambio: J2 confirma el CRUD de categorías y tags (baja lógica y reactivación). |

### 4.2 Flujos que el código ejecuta y el N1 no dibuja

| Flujo actual | Flujo según el código |
|---|---|
| (no existe) ADMIN → P1 "Reactivar cuenta" | ADMIN → P1 `PUT /administrador/cuentas/{id}/reactivar` con vista previa `GET …/reactivar/previa` (el N1 solo dice "suspensión y levantamiento"). |
| EMPLEADO → P1 "Aceptar invitación y credenciales" | Además "Renuncia" (`PUT /empleados/comercios/{id}/renunciar`) y acceso (`GET /empleados/comercios/{id}/acceso`). |
| EMPLEADO → P2 "Productos, horarios y redes sociales" | Además "Apertura o cierre del comercio" (`PUT /comercios/cerrar`, `/abrir`) y "descripción y teléfono" (`PUT /comercios/perfil/datos-operativos`). |
| (no existe) P7 → P2 "Reapertura automática de comercios" | `ReaperturaComerciosJob`; el único P7 → P2 dibujado es el cierre de turno y la propagación. |
| (no existe) P7 → P1 "Vencimiento de invitaciones de Empleado" | `InvitacionVencimientoJob`. |
| (no existe) P7 → P4 "Asignación de turnos al arrancar" y aviso de los 75 minutos | `TurnoBackfillRunner` (idempotente) y el aviso `AVISO_75MIN_SIN_CONFIRMACION` (idempotente). |
| (no existe) P5 → P2 "Recalcular aptitud al vincular o desvincular Mercado Pago" | `recalcularComerciosDelDueno`. |
| P2 → P3 "Productos activos y comercios disponibles" como único P2 hacia aguas abajo | P2 → P4 "Estado del comercio, horarios, aptitud y productos usados al agregar al carrito y al confirmar el pedido" y "baja de ítems del carrito por producto agotado o descontinuado". |
| P7 → P4 como único camino de la suspensión de comercio | P2 → P4 "Suspensión de comercio: rechazo, cancelación y cierre de pedidos hechos por el Administrador en el acto". |
| (no existe) P1 → P4 / P2 por la suspensión | P1 → P4 "La suspensión de Cliente cancela los pedidos sin pagar"; P1 → P4 / P2 "La suspensión de Dueño procesa pedidos y comercios". |
| (no existe) ADMIN ↔ P5 | ADMIN → P5 "Reintento manual de reembolsos" (`POST /administrador/reembolsos/{id}/reintentar`) y listado de reembolsos. |
| P6 → actores (solo salida) | Actores → P6 "Consulta y lectura de notificaciones" (`GET /notificaciones`, contador, marcar leídas, sondeo de 15 s). |
| CLIENTE → P1 "Registro, credenciales, direcciones y reactivación" | Además "Perfil, cambio de nombre de usuario, foto de perfil y cambio de contraseña". |
| (no existe) P1 → P6 / P7 "Reactivar cuenta: avisos T40 y T41" | Avisos T40 y T41 al restaurar comercios. |

### 4.3 Diferencias entre las dos copias del N1

La copia de `docs/entregables-01-02/Diagrama de Flujo - Nivel 1 - Código Mermaid.md` (4681 bytes) no coincide con la de `02. Diseño/`: carece de la entidad Visitante y del proceso P8 Soporte y conserva textos que el código no respalda ("extras", "1 h" para `PENDIENTE_CONFIRMACION_COMERCIO`, "90 días", "Reintento de reembolsos fallidos" P7 → P5, "P6 → ADMIN Notificaciones push"). El detalle fila por fila está en la §5.4 del índice; la copia de `02. Diseño/` es la que se contrastó.

---

## 5. Estado del repositorio (solo lectura)

Salida de `git status --porcelain -uall` con rutas relativas a la raíz del repositorio (`Bajoneá/`), consultada solo para leer. No se agregó nada al índice de git ni se hizo commit. Rama `main`.

### 5.1 Documentos del trabajo de DFD nivel 2 (`03. Implementación/docs/entregables-01-02/`)

| Archivo | Estado |
|---|---|
| `03. Implementación/docs/entregables-01-02/CIERRE-DFD2-PLAN-DE-CORRECCIONES.md` | sin seguimiento |
| `03. Implementación/docs/entregables-01-02/INDICE-DFD2-DESVIOS-Y-CUESTIONES.md` | sin seguimiento |
| `03. Implementación/docs/entregables-01-02/MAPEO-DFD2-TRAMO-A-COMPLEMENTO.md` | sin seguimiento |
| `03. Implementación/docs/entregables-01-02/MAPEO-DFD2-TRAMO-A.md` | sin seguimiento |
| `03. Implementación/docs/entregables-01-02/MAPEO-DFD2-TRAMO-B-COMPLEMENTO.md` | sin seguimiento |
| `03. Implementación/docs/entregables-01-02/MAPEO-DFD2-TRAMO-B.md` | sin seguimiento |
| `03. Implementación/docs/entregables-01-02/MAPEO-DFD2-TRAMO-C.md` | sin seguimiento |
| `03. Implementación/docs/entregables-01-02/MAPEO-DFD2-TRAMO-D-COMPLEMENTO.md` | sin seguimiento |
| `03. Implementación/docs/entregables-01-02/MAPEO-DFD2-TRAMO-D.md` | sin seguimiento |
| `03. Implementación/docs/entregables-01-02/MAPEO-DFD2-TRAMO-E.md` | sin seguimiento |
| `03. Implementación/docs/entregables-01-02/MAPEO-DFD2-TRAMO-F.md` | sin seguimiento |
| `03. Implementación/docs/entregables-01-02/MAPEO-DFD2-TRAMO-G.md` | sin seguimiento |
| `03. Implementación/docs/entregables-01-02/MAPEO-DFD2-TRAMO-H.md` | sin seguimiento |
| `03. Implementación/docs/entregables-01-02/MAPEO-DFD2-TRAMO-I.md` | sin seguimiento |
| `03. Implementación/docs/entregables-01-02/MAPEO-DFD2-TRAMO-J.md` | sin seguimiento |

Esta lista incluye este archivo (`CIERRE-DFD2-PLAN-DE-CORRECCIONES.md`) y la versión 2 del índice: ninguno de los dos, ni la versión 1 del índice, había sido agregado a git. Las rutas son relativas a la raíz del repositorio.

### 5.2 Carpeta `02. Diseño/01. Diagramas de Flujo`

Resumen: 4 modificados · 54 borrados del árbol de trabajo (versionados) · 163 sin seguimiento (archivos).

| Archivo | Estado |
|---|---|
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 0/Diagrama de Flujo - Nivel 0 - Código Mermaid.md` | modificado |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 0/Diagrama de Flujo - Nivel 0.png` | modificado |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 1/Diagrama de Flujo - Nivel 1 - Código Mermaid.md` | modificado |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 1/Diagrama de Flujo - Nivel 1.png` | modificado |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Administrador/01. Aprobación de Comercio - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Administrador/02. Rechazo de Comercio - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Administrador/03. Suspensión de Comercio - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Administrador/04. Suspensión de Cliente - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Administrador/05. Levantar Suspensión (Comercio y Cliente) - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Administrador/06. Gestión de Categorías y Tags - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Administrador/07. Configuración de Tarifas de Servicio - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Administrador/08. Gestión de Reclamos de Clientes - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Administrador/09. Gestión de Re-Solicitudes de Comercio Rechazado - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Administrador/10. Listado de Comercios y Clientes - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Autenticación y Seguridad/01. Registro de Cliente - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Autenticación y Seguridad/02. Registro de Comercio - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Autenticación y Seguridad/03. Verificación de Email - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Autenticación y Seguridad/04. Reenvío de Verificación de Email - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Autenticación y Seguridad/05. Inicio de Sesión - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Autenticación y Seguridad/06. Cierre de Sesión - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Autenticación y Seguridad/07. Recuperación de Contraseña - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Autenticación y Seguridad/08. Cambio de Contraseña via Token - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Autenticación y Seguridad/09. Cambio de Contraseña desde Perfil - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Autenticación y Seguridad/10. Solicitar Token de Reactivación de Cuenta - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Autenticación y Seguridad/11. Aplicar Token de Reactivación de Cuenta - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Cliente/01. Exploración de Comercios y Filtrado de Productos - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Cliente/02. Gestión de Items del Carrito - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Cliente/03. Ver y Vaciar Carrito - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Cliente/04. Flujo de Pedido a Domicilio - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Cliente/05. Flujo de Pedido de Retiro - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Cliente/06. Cancelación de Pedido por el Cliente - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Cliente/07. Confirmación de Recepción por el Cliente a Domicilio - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Cliente/08. Reclamo por Pedido no Recibido - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Cliente/09. Historial de Pedidos del Cliente - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Cliente/10. Editar Perfil y Gestión de Direcciones - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Cliente/11. Contactar Soporte ante Suspensión (Cliente) - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Comercio/01. Flujo Post-Aprobación y Recordatorio de Vincular MP - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Comercio/02. Vinculación y Desvinculación de Cuenta de MercadoPago - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Comercio/03. Creación de Producto - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Comercio/04. Edición de Producto - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Comercio/05. Baja Lógica, Agotado y Descontinuar Producto - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Comercio/06. Aceptar y Rechazar Pedido - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Comercio/07. Gestión de Estados del Pedido (En Preparación al Siguiente Estado) - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Comercio/08. Confirmar Entrega de Retiro y Cierre sin Retiro - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Comercio/09. Anular Pedido y Nota de Crédito - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Comercio/10. Historial de Pedidos del Comercio - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Comercio/11. Editar Perfil y Horarios del Comercio - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Comercio/12. Solicitar Revisión de Solicitud Rechazada - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Comercio/13. Apertura y Cierre Manual del Comercio - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Sistema/01. Webhook de MercadoPago - Confirmación de Pago - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Sistema/02. Timeout de Pedidos (Pendientes de Pago para 30 min - Pendiente para una hora) - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Sistema/03. Timer Listo para Retirar durante Suspensión de Comercio - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Sistema/04. Autoconfirmación de Entrega (Timer de 75 y 90 minutos) - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Sistema/05. Inactivación Automática de Usuarios - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Sistema/06. Restauración Automática de Comercio al Desbloquear Usuario - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Sistema/07. Expiración y Gestión de Tokens - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Sistema/08. Reintento Automático de Reembolsos Fallidos - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/Sistema/09. Flujo de Emisión de Notificaciones - DFD - Nivel 2.png` | borrado en el árbol de trabajo (estaba versionado) |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P1 - Usuarios y Sesiones/P1.01 - Registro de Cliente.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P1 - Usuarios y Sesiones/P1.02 - Registro de Dueño y su primer comercio.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P1 - Usuarios y Sesiones/P1.03 - Verificación de email y reenvío de código.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P1 - Usuarios y Sesiones/P1.04 - Inicio de sesión.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P1 - Usuarios y Sesiones/P1.05 - Cierre de sesión.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P1 - Usuarios y Sesiones/P1.06 - Recuperación de contraseña.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P1 - Usuarios y Sesiones/P1.07 - Reactivación de cuenta inactiva.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P1 - Usuarios y Sesiones/P1.08 - Perfil del Cliente.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P1 - Usuarios y Sesiones/P1.09 - Gestión de direcciones del Cliente.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P1 - Usuarios y Sesiones/P1.10 - Invitar, reenviar y cancelar invitación de Empleado.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P1 - Usuarios y Sesiones/P1.11 - Aceptar invitación y alta de Empleado.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P1 - Usuarios y Sesiones/P1.12 - Desactivar y reactivar miembro del equipo.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P1 - Usuarios y Sesiones/P1.13 - Suspender y levantar suspensión de Cliente.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P1 - Usuarios y Sesiones/P1.14 - Suspender Dueño con cascada a sus comercios.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P1 - Usuarios y Sesiones/P1.15 - Cambio de contraseña con sesión.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P1 - Usuarios y Sesiones/P1.16 - Selección de contexto del Empleado.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P1 - Usuarios y Sesiones/P1.17 - Consulta de disponibilidad de nombre.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P1 - Usuarios y Sesiones/P1.18 - Perfil del Dueño.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P1 - Usuarios y Sesiones/P1.19 - Renuncia del Empleado.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P1 - Usuarios y Sesiones/P1.20 - Levantar suspensión del Dueño y reenviar email de aviso.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P1 - Usuarios y Sesiones/P1.21 - Pérdida de acceso al comercio del Empleado.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P2 - Comercios y Documentos/P2.01 - Solicitud de alta de comercio.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P2 - Comercios y Documentos/P2.02 - Revisión de la solicitud y re-solicitud del comercio.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P2 - Comercios y Documentos/P2.03 - Subida de documentos del comercio.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P2 - Comercios y Documentos/P2.04 - Revisión de documentos y aptitud de venta.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P2 - Comercios y Documentos/P2.05 - Datos, descripción y horarios del comercio.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P2 - Comercios y Documentos/P2.06 - Turno del pedido y resumen del turno.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P2 - Comercios y Documentos/P2.07 - Estado operativo del comercio.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P2 - Comercios y Documentos/P2.08 - Gestión de productos.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P2 - Comercios y Documentos/P2.09 - Suspender y levantar suspensión de comercio.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P2 - Comercios y Documentos/P2.10 - Listados del Administrador.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P2 - Comercios y Documentos/P2.11 - Redes sociales del comercio.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P2 - Comercios y Documentos/P2.12 - Alta adicional de comercio.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P2 - Comercios y Documentos/P2.13 - Estadísticas del Dueño.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P2 - Comercios y Documentos/P2.14 - Categorías y tags del catálogo.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P2 - Comercios y Documentos/_fuentes/P2.13 - Estadísticas del Dueño.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P2 - Comercios y Documentos/_fuentes/P2.14 - Categorías y tags del catálogo.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P2 - Comercios y Documentos/_to_delete/P2.15 - Estadísticas del Dueño.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P2 - Comercios y Documentos/_to_delete/P2.15 - Estadísticas del Dueño.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P3 - Exploración y Menús/P3.01 - Catálogo de comercios.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P3 - Exploración y Menús/P3.02 - Menú de un comercio y catálogo global.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P3 - Exploración y Menús/P3.03 - Disponibilidad del comercio.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P3 - Exploración y Menús/P3.04 - Explorar productos.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P3 - Exploración y Menús/P3.05 - Detalle del comercio y agregar al carrito.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P4 - Pedidos y Carrito/P4.01 - Carrito, ver y agregar productos.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P4 - Pedidos y Carrito/P4.02 - Checkout, pantallas y modalidad.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P4 - Pedidos y Carrito/P4.03 - Aceptar, rechazar y expiración del pedido.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P4 - Pedidos y Carrito/P4.04 - Avance de estados del pedido.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P4 - Pedidos y Carrito/P4.05 - Cancelación por el Cliente.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P4 - Pedidos y Carrito/P4.06 - Anulación por el comercio.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P4 - Pedidos y Carrito/P4.07 - Entrega y cierre de retiros por el comercio.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P4 - Pedidos y Carrito/P4.08 - Reclamo del Cliente.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P4 - Pedidos y Carrito/P4.09 - Resolución del reclamo por el Administrador.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P4 - Pedidos y Carrito/P4.10 - Seguimiento de pedidos del Cliente.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P4 - Pedidos y Carrito/P4.11 - Pedidos del comercio, recorrido y sonido.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P4 - Pedidos y Carrito/P4.12 - Carrito, cantidad, quitar y vaciar.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P4 - Pedidos y Carrito/P4.13 - Carrito, baja automática y vaciado por pago.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P4 - Pedidos y Carrito/P4.14 - Vuelta del pago y vencimiento del pedido sin pagar.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P4 - Pedidos y Carrito/P4.15 - Confirmación del pedido y paso al pago.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P4 - Pedidos y Carrito/P4.16 - Recepción del Cliente y autoconfirmación.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P4 - Pedidos y Carrito/_fuentes/P4.07 - Entrega y cierre de retiros por el comercio.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P4 - Pedidos y Carrito/_fuentes/P4.08 - Reclamo del Cliente.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P4 - Pedidos y Carrito/_fuentes/P4.09 - Resolución del reclamo por el Administrador.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P4 - Pedidos y Carrito/_fuentes/P4.10 - Seguimiento de pedidos del Cliente.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P4 - Pedidos y Carrito/_fuentes/P4.11 - Pedidos del comercio, recorrido y sonido.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P4 - Pedidos y Carrito/_fuentes/P4.16 - Recepción del Cliente y autoconfirmación.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P5 - Pagos y Reembolsos/P5.01 - Vinculación de Mercado Pago (OAuth).png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P5 - Pagos y Reembolsos/P5.02 - Cobro del pedido y link de pago.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P5 - Pagos y Reembolsos/P5.03 - Webhook de Mercado Pago.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P5 - Pagos y Reembolsos/P5.04 - Reembolso del pago.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P5 - Pagos y Reembolsos/P5.05 - Reintento manual del reembolso.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P5 - Pagos y Reembolsos/P5.06 - Desvinculación de Mercado Pago.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P5 - Pagos y Reembolsos/P5.07 - Sincronización del pago al volver.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P5 - Pagos y Reembolsos/_fuentes/P5.01 - Vinculación de Mercado Pago (OAuth).mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P5 - Pagos y Reembolsos/_fuentes/P5.02 - Cobro del pedido y link de pago.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P5 - Pagos y Reembolsos/_fuentes/P5.03 - Webhook de Mercado Pago.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P5 - Pagos y Reembolsos/_fuentes/P5.04 - Reembolso del pago.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P5 - Pagos y Reembolsos/_fuentes/P5.05 - Reintento manual del reembolso.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P5 - Pagos y Reembolsos/_fuentes/P5.06 - Desvinculación de Mercado Pago.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P5 - Pagos y Reembolsos/_fuentes/P5.07 - Sincronización del pago al volver.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P6 - Notificaciones/P6.01 - Emisión de notificaciones y emails.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P6 - Notificaciones/P6.02 - Consulta y lectura de notificaciones.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P6 - Notificaciones/_fuentes/P6.01 - Emisión de notificaciones y emails.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P6 - Notificaciones/_fuentes/P6.02 - Consulta y lectura de notificaciones.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P7 - Procesos Automáticos/P7.01 - Reapertura automática de comercios.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P7 - Procesos Automáticos/P7.02 - Vencimiento de invitaciones de Empleados.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P7 - Procesos Automáticos/P7.03 - Inactivación de cuentas por falta de uso.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P7 - Procesos Automáticos/P7.04 - Reactivación de la cuenta inactiva.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P7 - Procesos Automáticos/P7.05 - Cierre de turno automático.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P7 - Procesos Automáticos/P7.06 - Procesos automáticos de pedidos.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P7 - Procesos Automáticos/P7.07 - Envío del resumen de turno por email.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P7 - Procesos Automáticos/P7.08 - Aviso de regularización de invitación.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P7 - Procesos Automáticos/P7.09 - Configuración de tarifas y tarifa vigente.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P7 - Procesos Automáticos/_fuentes/P7.01 - Reapertura automática de comercios.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P7 - Procesos Automáticos/_fuentes/P7.02 - Vencimiento de invitaciones de Empleados.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P7 - Procesos Automáticos/_fuentes/P7.03 - Inactivación de cuentas por falta de uso.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P7 - Procesos Automáticos/_fuentes/P7.04 - Reactivación de la cuenta inactiva.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P7 - Procesos Automáticos/_fuentes/P7.05 - Cierre de turno automático.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P7 - Procesos Automáticos/_fuentes/P7.06 - Procesos automáticos de pedidos.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P7 - Procesos Automáticos/_fuentes/P7.07 - Envío del resumen de turno por email.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P7 - Procesos Automáticos/_fuentes/P7.08 - Aviso de regularización de invitación.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P7 - Procesos Automáticos/_fuentes/P7.09 - Configuración de tarifas y tarifa vigente.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P8 - Soporte/P8.01 - Consulta a Soporte sin sesión.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P8 - Soporte/P8.02 - Consultas a Soporte con sesión y seguimiento.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P8 - Soporte/P8.03 - Acceso por código y seguimiento sin sesión.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P8 - Soporte/P8.04 - Reenvío de códigos de consulta.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P8 - Soporte/P8.05 - Bandeja de Soporte del Administrador.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P8 - Soporte/P8.06 - Respuesta, cierre y reenvío de email del Administrador.png` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P8 - Soporte/_fuentes/P8.01 - Consulta a Soporte sin sesión.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P8 - Soporte/_fuentes/P8.02 - Consultas a Soporte con sesión y seguimiento.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P8 - Soporte/_fuentes/P8.03 - Acceso por código y seguimiento sin sesión.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P8 - Soporte/_fuentes/P8.04 - Reenvío de códigos de consulta.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P8 - Soporte/_fuentes/P8.05 - Bandeja de Soporte del Administrador.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/P8 - Soporte/_fuentes/P8.06 - Respuesta, cierre y reenvío de email del Administrador.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P1.01.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P1.02.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P1.03.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P1.04.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P1.05.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P1.06.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P1.07.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P1.08.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P1.09.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P1.10.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P1.11.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P1.12.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P1.13.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P1.14.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P1.15.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P1.16.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P1.17.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P1.18.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P1.19.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P1.20.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P1.21.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P2.01.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P2.02.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P2.03.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P2.04.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P2.05.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P2.06.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P2.07.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P2.08.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P2.09.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P2.10.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P2.11.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P2.12.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P2.13.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P3.01.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P3.02.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P3.03.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P3.04.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P3.05.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P4.01.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P4.02.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P4.03.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P4.04.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P4.05.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P4.06.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P4.12.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P4.13.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P4.14.mmd` | sin seguimiento |
| `02. Diseño/01. Diagramas de Flujo/Diagramas de Flujo - Nivel 2/_fuentes/P4.15.mmd` | sin seguimiento |

Archivos sin seguimiento por carpeta: P1 - Usuarios y Sesiones = 21 · P2 - Comercios y Documentos = 14 · P3 - Exploración y Menús = 5 · P4 - Pedidos y Carrito = 16 · P5 - Pagos y Reembolsos = 7 · P6 - Notificaciones = 2 · P7 - Procesos Automáticos = 9 · P8 - Soporte = 6 · _fuentes = 81 · _to_delete = 2.

---

**Resumen: 137 filas de desvíos repartidas en 19 documentos destino (con repeticiones por fila multidocumento), 39 filas de código clasificadas (Defecto 18 · Decisión pendiente 14 · Solo documentación 7), 42 cuestiones con desvío vinculado de 95, 30 cambios de flujo del N1 (16 + 14), 15 archivos de trabajo de DFD2 sin commitear en `docs/entregables-01-02/` y 163 sin seguimiento más 4 modificados y 54 borrados en `02. Diseño`.**
