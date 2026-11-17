# Historias de Usuario — Administrador

Acciones y responsabilidades del rol Administrador dentro de la plataforma Bajoneá.

## HU-A01: Ver lo Pendiente en el Panel

Como administrador, quiero ver en mi panel cuántos comercios, re-solicitudes, documentos,
consultas de Soporte, reclamos y reembolsos esperan mi atención, para revisarlos sin demoras.

**Criterios de aceptación:**

- Cada tarjeta del panel muestra su contador y lo pendiente aparece primero.
- Los números se actualizan solos cada 30 segundos mientras la pestaña se ve.
- No recibo avisos ni campana: el panel es mi bandeja de entrada.
- En escritorio puedo ir a cualquier sección desde la barra lateral, sin pasar por el panel.

## HU-A02: Ver Solicitudes Pendientes de Comercios

Como administrador, quiero ver comercios pendientes con sus datos de registro completos
(incluyendo tipo de comercio, modalidades de entrega e historial de estados previos si
las hubiera), para evaluar cada solicitud de forma ordenada.

## HU-A03: Aprobar un Comercio

Como administrador, quiero aprobar la solicitud de un comercio, para habilitarlo a
operar y recibir pedidos una vez que complete la vinculación de su cuenta de MP y tenga
al menos un documento aprobado.

**Criterios de aceptación:**

- Al aprobar, el comercio queda Aprobado; pasa a Apto para Venta cuando el Dueño vincula MercadoPago y el comercio tiene un documento aprobado y ninguno en revisión.
- No puedo aprobar un comercio pendiente si la cuenta de su Dueño está suspendida (sí puedo rechazarlo).

## HU-A04: Rechazar un Comercio

Como administrador, quiero rechazar la solicitud de un comercio con un motivo, para
informarle las razones y permitirle corregir y reenviar su solicitud.

## HU-A05: Suspender un Comercio

Como administrador, quiero suspender un comercio aprobado, apto para venta o cerrado
temporalmente ingresando un motivo, para inhabilitarlo hasta que se resuelva el problema.

**Criterios de aceptación:**

- El motivo es obligatorio (de 10 a 500 caracteres) y lo ve el Dueño.
- Antes de confirmar veo qué va a pasar: el comercio deja de aparecer en el catálogo y cuántos pedidos tiene pendientes de confirmación, en preparación, listos para retirar, en camino y sin pagar, cada uno con lo que le va a pasar.
- Al confirmar, los pedidos pendientes de confirmación se rechazan y se reembolsan en el acto; los demás pedidos siguen su camino con los plazos de 90 minutos.
- Si el comercio estaba suspendido por la suspensión de su Dueño, puedo suspenderlo individualmente: pasa a una suspensión propia que conserva la fecha original.
- Si el email de aviso al Dueño falla, lo veo y puedo reenviarlo.

## HU-A06: Levantar la Suspensión de un Comercio

Como administrador, quiero levantar la suspensión de un comercio tras revisar su
descargo, para que vuelva a recibir pedidos cuando el problema se resolvió.

**Criterios de aceptación:**

- En el detalle del comercio suspendido veo desde cuándo está suspendido y el motivo, y el botón "Levantar suspensión".
- Puedo escribir un mensaje opcional de hasta 500 caracteres para el Dueño.
- El comercio vuelve a Apto para Venta si cumple los requisitos, a Aprobado si le falta la cuenta de cobro o un documento aprobado, o a Cerrado Temporalmente si la cuenta del Dueño está bloqueada.
- Si el comercio fue suspendido por la suspensión de su Dueño, no puedo levantarlo acá: veo el aviso de que hay que levantar la suspensión del Dueño y un enlace a su fila.
- Si el email al Dueño falló, puedo reenviarlo.

## HU-A07: Ver el Listado Completo de Comercios

Como administrador, quiero visualizar todos los comercios con su estado actual, tipo,
fecha de registro, Dueño titular y si ese Dueño tiene MP vinculado, para tener una
visión general de la plataforma y actuar cuando sea necesario.

**Criterios de aceptación:**

- El listado trae todos los comercios, sin importar su estado: pendientes, aprobados, listos para vender, rechazados, con rechazo definitivo, suspendidos, cerrados temporalmente e inactivos.
- Cada comercio muestra una etiqueta con su estado actual.
- Desde el detalle de cualquier comercio, en cualquier estado, puedo abrir su equipo con "Ver equipo".
- "Suspender" aparece cuando el comercio está aprobado, listo para vender o cerrado temporalmente, y "Levantar suspensión" cuando está suspendido por mí; en los demás estados no se ofrecen.
- Las pantallas de solicitudes pendientes y de re-solicitudes siguen mostrando solo los comercios que esperan resolución.
- Un comercio que su Dueño cerró a mano sigue apareciendo con su estado (aprobado o listo para vender).

## HU-A08: Ver el Listado Completo de Clientes

Como administrador, quiero visualizar todos los clientes con su estado actual, para
supervisar la base de usuarios.

**Criterios de aceptación:**

- Veo una lista con buscador por nombre o email y filtros por estado; cada cliente muestra su estado y, si está suspendido, desde cuándo y por qué.
- Desde el menú de cada cliente abro la acción que corresponde: suspender, levantar la suspensión, reactivar una cuenta inactiva o reenviar el email de aviso si falló.

## HU-A09: Suspender un Cliente

Como administrador, quiero suspender la cuenta de un cliente ingresando un motivo,
para restringir su acceso ante un comportamiento que lo justifique.

**Criterios de aceptación:**

- El motivo es obligatorio (de 10 a 500 caracteres) y se le muestra a la persona.
- Al confirmar, se cierra su sesión, sus pedidos sin pagar se cancelan y los pagados siguen su curso.
- No puedo suspender a un Administrador ni a mí mismo.
- La suspensión es indefinida y prevalece sobre un bloqueo previo.

## HU-A10: Levantar la Suspensión de un Cliente

Como administrador, quiero poder levantar la suspensión de un cliente tras revisar
su descargo, para reactivar su cuenta si corresponde.

**Criterios de aceptación:**

- El modal me dice a qué estado vuelve la cuenta (la que estaba bloqueada vuelve activa; la que estaba inactiva, inactiva).
- Puedo dejar un mensaje opcional de hasta 500 caracteres.
- Si el email de aviso falló, puedo reenviarlo.

## HU-A11: Gestionar Categorías de Productos

Como administrador, quiero crear, editar, activar, desactivar y eliminar categorías
de productos, para mantener un catálogo organizado que los comercios puedan utilizar.

## HU-A12: Gestionar Tags de Productos

Como administrador, quiero crear, editar, activar, desactivar y eliminar tags de
productos, para ofrecer opciones de etiquetado que ayuden a los clientes a filtrar mejor.

## HU-A13: Gestionar Reclamos de Clientes

Como administrador, quiero revisar y resolver los reclamos de clientes por un pedido
entregado (que no recibieron, incompleto, equivocado, en mal estado o con un cobro
incorrecto), para garantizar una resolución justa y gestionar los reembolsos cuando
corresponda.

**Criterios de aceptación:**

- La bandeja tiene tres filtros con contador: pendientes (los más viejos primero), con reembolso en proceso y resueltos.
- En el detalle veo el pedido, el mensaje del cliente, los productos, el saldo reembolsable y las fotos que adjuntó (que puedo ampliar).
- Resuelvo con un reembolso total, un reembolso parcial (un monto mayor que cero y menor que el saldo) o un rechazo con un motivo de 10 a 500 caracteres; siempre con una confirmación que avisa que no se puede deshacer.
- Si Mercado Pago no pudo hacer el reembolso, veo el motivo y puedo ir a Reembolsos a reintentarlo.
- El cliente recibe un aviso y un email con mi decisión.

## HU-A14: Configurar Tarifas de Servicio

Como administrador, quiero configurar los cargos de servicio al cliente y al comercio
por pedido procesado, para ajustar el modelo de negocio sin necesidad de modificar el
código del sistema. Los cambios aplican de forma inmediata a los nuevos pedidos,
preservando las tarifas históricas en los pedidos ya existentes.

**Criterios de aceptación:**

- Antes de guardar, una confirmación me muestra qué tarifa reemplaza y cuál es la nueva, y me recuerda que rige para los pedidos que se confirmen desde ahora.
- Veo la tarifa vigente y el historial de cambios.

## HU-A15: Gestionar Re-solicitudes de Comercios Rechazados

Como administrador, quiero ver en una bandeja propia (sin notificación) los comercios
rechazados que su Dueño corrigió y volvió a solicitar, con el motivo del rechazo anterior,
el número de intento y los datos que cambió, para evaluarlos con el historial de acciones
previas visible y poder rechazarlos de forma definitiva cuando corresponda (en el último
intento el rechazo definitivo es automático y así se me avisa).

## HU-A16: Atender Consultas de Soporte

Como administrador, quiero recibir y responder las consultas de Soporte de las personas
(con o sin sesión, también con la cuenta suspendida), para ayudarlas y decidir si
corresponde levantar una suspensión o mantenerla.

**Criterios de aceptación:**

- El panel me muestra cuántas consultas esperan mi respuesta y la bandeja tiene los filtros Esperan, Respondidas y Cerradas.
- En el detalle veo la conversación y, si el email coincide con un usuario, su cuenta con "Ver cuenta".
- La conversación es por turnos: solo respondo cuando me toca; a los 20 mensajes se cierra sola, y solo yo la cierro (con confirmación).
- Si el email de mi respuesta no salió, lo veo y puedo reenviarlo.
- En escritorio veo la lista a la izquierda y la conversación a la derecha.

## HU-A17: Ver el Equipo de un Comercio

Como administrador, quiero ver desde el detalle de un comercio su equipo de empleados (con
el estado de cada relación y de cada invitación) y la actividad del comercio, en modo de
solo lectura, para tener contexto de quién opera cada negocio al revisar un comercio.
Entiendo que desde esa vista no puedo modificar cuentas de usuario.

**Criterios de aceptación:**

- Desde el detalle de un comercio veo un resumen del equipo ("N activos · N inactivos") y un botón "Ver equipo" que se destaca por encima de "Suspender" y "Cerrar".
- En la pestaña "Miembros" veo los miembros activos por defecto y puedo pasar a los inactivos; cada filtro muestra su cantidad. Cada miembro muestra su nombre, su email y desde cuándo está en el equipo.
- Cada miembro inactivo dice por qué dejó el equipo y cuándo: dado de baja por el dueño o porque dejó de trabajar en el comercio.
- En la pestaña "Solicitudes" veo las invitaciones que el dueño envió y que todavía no se respondieron, con la fecha de envío y cuándo vencen.
- Si una lista está vacía, la pantalla me lo dice con un mensaje claro.
- Puedo ver el equipo de un comercio aunque esté suspendido o cerrado temporalmente.
- Desde el botón "Actividad" veo lo que pasó en el comercio (pedidos, ediciones, cierres y equipo), y puedo filtrar por cada tipo.
- Ninguna de estas pantallas tiene botones para invitar, desactivar, reactivar, cancelar ni reenviar: solo puedo mirar.
- Si el comercio no existe o hay un problema de conexión, la pantalla me avisa y, cuando tiene sentido, me deja reintentar.

## HU-A18: Suspender y Levantar la Suspensión de la Cuenta de un Dueño

Como administrador, quiero suspender la cuenta de un Dueño con un motivo y levantar la
suspensión después, para frenar a un Dueño que incumple las condiciones sin tener que
suspender uno por uno sus comercios.

**Criterios de aceptación:**

- El motivo es obligatorio (de 10 a 500 caracteres) y se le muestra al Dueño.
- Antes de confirmar veo, por cada comercio del Dueño, si se suspende o queda como está (y por qué), cuántos pedidos tiene por estado, cuántos Empleados activos tiene y qué va a pasar con sus pedidos en preparación o listos para retirar (los atiende el equipo con un tope de 90 minutos, o se anulan o cancelan ahora con reembolso porque nadie puede atenderlos).
- Al confirmar: la cuenta pasa a suspendida y se cierra su sesión; sus comercios aprobados, a la venta o cerrados temporalmente pasan a suspendidos (no los pendientes, rechazados e inactivos, ni los que ya estaban suspendidos por separado); los pedidos pendientes de confirmación se rechazan y se reembolsan en el acto.
- No puedo suspender a un Administrador ni a mí mismo. Mientras la cuenta esté suspendida no puedo aprobar un comercio pendiente del Dueño (sí rechazarlo) ni levantar la suspensión de un comercio suspendido por separado.
- Al levantar, la cuenta vuelve al estado que tenía antes y solo se restauran los comercios que la suspensión del Dueño había suspendido, cada uno según tenga cuenta de cobro y documentos aprobados; los pedidos ya rechazados, anulados o cancelados no se restauran. Puedo escribir un mensaje opcional.
- En la pantalla "Dueños" veo a todos los Dueños con su estado, el motivo y la fecha de la suspensión, cuántos comercios tienen y, si el email de aviso falló, puedo reenviarlo.
- En la ficha de un comercio suspendido junto con su Dueño veo que no se puede levantar solo ese comercio, con un enlace a la fila del Dueño, y puedo suspender solo ese comercio para que siga suspendido aunque levanten al Dueño.

## HU-A19: Reactivar una Cuenta Inactiva

Como administrador, quiero reactivar la cuenta de un cliente o de un Dueño que el sistema
inactivó por falta de uso, para ayudarlo a volver cuando no puede hacerlo solo.

**Criterios de aceptación:**

- La opción "Reactivar cuenta" aparece en el menú solo si la cuenta está inactiva (y el filtro "Inactivos" la encuentra entre los Dueños).
- Una confirmación me explica qué va a pasar: la persona podrá ingresar y comprar de nuevo, queda anotado en su historial que lo hice yo y, si es un Dueño, cuántos de sus comercios se restablecen, cuáles vuelven y cuál sigue suspendido aparte.

## HU-A20: Revisar los Documentos de un Comercio

Como administrador, quiero revisar los documentos de habilitación que sube el Dueño de un
comercio, para decidir si el comercio puede vender.

**Criterios de aceptación:**

- La bandeja lista los documentos pendientes, del más antiguo al más nuevo, y el panel muestra cuántos hay.
- Abro cada comercio en una pantalla que muestra sus documentos, el estado de su cuenta de MercadoPago y un visor del archivo (PDF, JPG, PNG o WebP).
- Puedo aprobar un documento, rechazarlo con un motivo o revocar uno ya aprobado con un motivo; un documento rechazado no se vuelve a resolver.
- Un solo documento aprobado alcanza para que el comercio sea apto para vender cuando tiene MercadoPago vinculado y ningún documento en revisión.
- Puedo revisar los documentos de un comercio suspendido sin que eso lo saque de la suspensión.
