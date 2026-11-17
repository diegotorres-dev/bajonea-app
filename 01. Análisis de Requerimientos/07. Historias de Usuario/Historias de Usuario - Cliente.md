# Historias de Usuario — Cliente

## HU-C01: Registrarse como Cliente

Como cliente, quiero registrarme en la plataforma eligiendo un nombre de usuario (de 8 a 20 caracteres) y mi
contraseña, e ingresando mis datos personales y una dirección de entrega inicial, para poder realizar pedidos en los comercios
disponibles con una dirección predeterminada ya configurada desde el comienzo. Por ahora la plataforma funciona solo en Tierra del Fuego: puedo elegir Río Grande, Ushuaia o Tolhuin, y si escribo otra localidad el sistema me dice "Esa localidad todavía no está disponible". Para crear la cuenta tengo que aceptar los Términos y Condiciones y la Política de Privacidad, que puedo leer antes de aceptar en páginas públicas; el sistema no me deja registrarme sin aceptarlos. Si salgo del registro con datos cargados, la aplicación me avisa antes de descartarlos. También tengo que tener 14 años o más (los cumplo ese mismo día y ya alcanza); si no, el sistema me avisa debajo de la fecha de nacimiento apenas la completo ("Tenés que tener al menos 14 años para poder registrarme.") y no me deja seguir ni crea la cuenta. La edad es la que declaro: el sistema no la verifica.

## HU-C02: Verificar mi Cuenta

Como cliente, quiero verificar mi dirección de email tras el registro con un código de 6 dígitos que me llega por email,
para activar mi cuenta y acceder a todas las funcionalidades del sistema. Si pido otro código tengo que esperar 30 segundos.

## HU-C03: Recuperar mi Contraseña

Como cliente, quiero recuperar mi contraseña a través de mi email, tanto si la olvidé
como si mi cuenta fue bloqueada por intentos fallidos, con un código de 6 dígitos que vale 30 minutos, para retomar el acceso a mi
cuenta y restaurarla a estado activo. Recuperar la contraseña no levanta una suspensión.

## HU-C04: Reactivar mi Cuenta

Como cliente, quiero reactivar mi cuenta cuando esté inactiva por falta de uso,
para volver a acceder a la plataforma sin perder mi historial de pedidos ni mis
direcciones registradas.

**Criterios de aceptación:**
- Si inicio sesión con mi usuario y contraseña correctos y mi cuenta está inactiva, veo la pantalla "Tu cuenta está inactiva" ("Pasaron más de 3 meses sin que ingresaras, así que la dejamos en pausa.") con un botón para reactivarla; al tocarlo entro en el acto, sin otro código.
- Si pongo una contraseña incorrecta veo el mensaje genérico de siempre, sin que se revele el estado de la cuenta.

## HU-C05: Editar mi Perfil y Direcciones

Como cliente, quiero editar mis datos personales, cargar una foto de perfil opcional y
gestionar mis direcciones de entrega (agregar, editar, eliminar y cambiar la
predeterminada), para mantener mi información actualizada.

**Criterios de aceptación:**
- Puedo tener hasta 5 direcciones activas; con 5, "Agregar" me avisa que llegué al máximo (409 DIRECCIONES_CUPO_MAXIMO) y tengo que eliminar una antes.
- Una sola es la predeterminada; la primera que cargo lo es automáticamente. Puedo cambiar cuál es la predeterminada.
- Cada dirección puede llevar un alias (hasta 40 caracteres, por ejemplo "Casa") y una referencia (hasta 150, por ejemplo "portón negro"). Las localidades que se ofrecen son solo las habilitadas.
- No puedo eliminar mi última dirección (409 ULTIMA_DIRECCION). Si elimino la predeterminada, pasa a serlo la más reciente. Eliminar es una baja lógica: mis pedidos viejos conservan una copia de la dirección con la que se hicieron.
- Antes de eliminar una dirección o de salir de un formulario con cambios sin guardar, el sistema me pregunta ("¿Descartar los cambios?").
- Mi perfil está organizado por secciones y puedo editar mi nombre de usuario, mis datos, mi contraseña y mi foto desde ahí.

## HU-C06: Explorar Comercios

Como cliente, quiero ver el listado de comercios disponibles sin necesidad de
registrarme, para descubrir opciones gastronómicas antes de crear una cuenta. Quiero
poder distinguir los comercios que están abiertos en este momento de los que están
temporalmente cerrados.

**Criterios de aceptación:**
- Los comercios cerrados (fuera de su horario o pausados por su Dueño) se ven atenuados en
  el listado y llevan una etiqueta al final de la tarjeta: "Cerrado" si están fuera de
  horario o si el Dueño los pausó a mano.
- Los comercios abiertos aparecen primero, y el filtro "Abierto ahora" muestra solo los
  abiertos.
- El detalle de un comercio cerrado muestra la misma etiqueta y cuándo reabre (por
  ejemplo, "Reabre hoy a las 19:00"), y no permite agregar productos al carrito.
- Si el comercio está cerrado sin fecha de regreso porque su Dueño tiene la cuenta
  bloqueada, la etiqueta dice "Cerrado temporalmente" (distinta de la del cierre a mano),
  no hay aviso de cuándo reabre, y tampoco permite agregar productos al carrito.
- Si el comercio se cierra mientras estoy agregando un producto o confirmando mi pedido,
  el sistema me avisa con un mensaje claro y un botón para volver al catálogo.
- Solo veo comercios aprobados con su cuenta de cobro vinculada y su documentación aprobada; un comercio suspendido, inactivo o sin esos requisitos no aparece.
- Puedo buscar por nombre; el buscador tiene un botón de borrar, un contador de resultados y "Limpiar filtros".

## HU-C07: Ver el Menú de un Comercio

Como cliente, quiero ver el menú de un comercio con todos sus productos activos,
incluyendo nombre, descripción, precio, categoría, tags y foto, para conocer la oferta
disponible antes de realizar un pedido.

## HU-C08: Filtrar Productos

Como cliente, quiero filtrar los productos de un menú por categoría y/o tags, para
encontrar opciones que se adapten a mis preferencias alimentarias (vegano, sin TACC,
vegetariano, etc.).

## HU-C09: Gestionar mi Carrito

Como cliente, quiero agregar, modificar y eliminar productos de mi carrito, para armar
mi pedido de forma flexible antes de confirmarlo. Entiendo que cada carrito puede
contener productos de un solo comercio, pero puedo tener varios pedidos activos de
distintos comercios al mismo tiempo. Si el comercio cambia el precio de un producto que ya
tengo en el carrito, veo el precio anterior tachado, el nuevo al lado y el aviso "Cambió el
precio", con los totales ya actualizados.

## HU-C09B: Elegir Extras al Armar mi Pedido *(descartada: fuera de alcance)*

Los extras de producto fueron descartados del alcance de esta versión (decisión del 18/10/2026). No existen pantallas ni reglas para elegirlos; el modelo de datos conserva las tablas, sin uso. Queda como posible trabajo futuro.

## HU-C10: Realizar un Pedido

Como cliente, quiero confirmar mi carrito eligiendo la modalidad de entrega (domicilio
o retiro en local, según las opciones que ofrezca el comercio), para concretar mi
compra de manera simple desde la plataforma. Si entre que armé el resumen y confirmé cambió
el precio de algún producto o el cargo por servicio, el pedido no se crea con un monto que
no vi: me muestran el resumen con los montos nuevos y el botón "Confirmar con el nuevo
total", y recién ahí se crea.

**Criterios de aceptación:**
- Al elegir la modalidad (domicilio o retiro) la pantalla sigue sin un botón "Continuar" intermedio.
- Para domicilio uso mi dirección predeterminada, y puedo elegir otra de mis direcciones activas solo para este pedido, sin cambiar mi predeterminada; el pedido guarda una copia de la dirección elegida.
- Si estoy suspendido o el comercio está suspendido, no puedo confirmar ni pagar y el mensaje me lo explica con un botón para volver al catálogo con mi carrito intacto (409 CUENTA_SUSPENDIDA en el primer caso).

## HU-C11: Pagar mi Pedido

Como cliente, quiero abonar mi pedido a través de MercadoPago, para completar la
transacción de forma segura dentro de la plataforma.

**Criterios de aceptación:**
- Un pedido sin pagar dice "Todavía no pagaste este pedido."; al volver de Mercado Pago veo "Estamos confirmando tu pago. Esta pantalla se actualiza sola."; con el pago rechazado, "No pudimos procesar tu pago. Podés intentar de nuevo."
- Si el comercio se suspende mientras tanto, "Ir a pagar" queda bloqueado y puedo cancelar el pedido; si ya había pagado y el comercio no lo atendió a tiempo, veo el pedido cancelado y que me devuelven el dinero.

## HU-C12: Seguir el Estado de mi Pedido

Como cliente, quiero visualizar el estado actual de mis pedidos y recibir notificaciones
ante cada cambio, para saber en todo momento cómo va mi compra. Quiero poder ver el
historial completo de estados por los que pasó cada pedido.

**Criterios de aceptación:**
- Mientras el comercio no responde, mi pedido figura como "Esperando al comercio".
- Cada aviso se toca entero y me lleva a la pantalla donde actúo (el pedido, el reclamo, el carrito); los informativos solo se marcan como leídos. Uno sin leer se distingue por un fondo suave, un punto y el texto "No leída".
- La lista de avisos se carga de a 20 con "Ver más", y "Marcar todas" deja leídos mis avisos personales.
- Un pedido que se cancela porque el comercio no estaba disponible figura como "Cancelado" y dice "El comercio no estaba disponible. Te devolvemos el dinero.", con el reembolso total.

## HU-C13: Cancelar un Pedido

Como cliente, quiero cancelar mi pedido antes de que sea despachado (domicilio) o
marcado como listo (retiro), para revertir una compra que ya no deseo concretar y
recibir el reembolso correspondiente. Antes de cancelar, el sistema me pide confirmación y me muestra qué pasa: si el pedido ya estaba pagado, cuánto dinero me devuelven.

## HU-C14: Reclamar un Pedido

Como cliente, quiero reclamar un pedido que recibí mal o que no recibí, para obtener el reembolso total o parcial que corresponda.

**Criterios de aceptación:**
- Puedo reclamar solo un pedido entregado (a domicilio o de retiro, también los que el sistema confirmó solo) con el pago aprobado, dentro de los 7 días desde la entrega; el detalle del pedido me dice si puedo reclamar y hasta cuándo. Se puede reclamar una sola vez por pedido y el reclamo no se edita.
- Elijo uno de seis motivos (no recibí el pedido, solo en pedidos a domicilio; faltan productos; productos equivocados; producto en mal estado; cobro incorrecto; otro) y escribo un mensaje de 10 a 1000 caracteres.
- Puedo adjuntar hasta 3 fotos de hasta 5 MB (JPG, PNG o WebP; las HEIC se rechazan con un mensaje claro). Las ve solo el Administrador; yo veo cuántas adjunté.
- El reclamo no cambia el estado del pedido. El Administrador lo resuelve con reembolso total, reembolso parcial o rechazo con motivo; la resolución es final.
- Al resolverse me llega un aviso y un email: si se aprobó, el monto que me devuelven y que puede tardar unos días; si se rechazó, el motivo.
- Si mi cuenta está suspendida no puedo crear reclamos, aunque el plazo de 7 días sigue corriendo.

## HU-C15: Contactar a Soporte

Como cliente, quiero escribirle al equipo de Soporte, con o sin sesión y también si mi cuenta está suspendida, para hacer una consulta o pedir la revisión de una suspensión y tener la oportunidad de recuperar mi cuenta si corresponde.

**Criterios de aceptación:**
- Elijo uno de cinco tipos de consulta y escribo mi mensaje desde la pantalla de Ayuda o desde la de cuenta suspendida.
- La consulta es una conversación por turnos con un máximo de 20 mensajes; solo Soporte la cierra. En "Mis consultas a Soporte" veo mis consultas, cuáles esperan mi respuesta (con un contador en mi perfil) y su estado.
- Si no tengo sesión, accedo a mi consulta con mi email y un código; hay límites contra abuso (3 consultas por día y 3 abiertas a la vez por email).
- Si se corta la conexión al enviar una consulta nueva, el sistema me avisa que revise "Mis consultas a Soporte" antes de volver a enviar, para no duplicarla.

## HU-C16: Reintentar y Verificar mi Pago

Como cliente, quiero poder volver al checkout de MercadoPago si mi pago fue rechazado
y ver el estado real de mi pago al volver, para completar mi pedido sin pagar dos veces
ni perderlo mientras el plazo de pago siga vigente.

## HU-C17: Cambiar mi Nombre de Usuario

Como cliente, quiero poder cambiar mi nombre de usuario desde mi perfil, confirmando mi
contraseña actual, para mantener una credencial de acceso que me resulte cómoda, con un
límite de 3 cambios cada 30 días que evita abusos.

## HU-C18: Ver que mi Cuenta Fue Suspendida y Por Qué

Como cliente, quiero saber que mi cuenta fue suspendida y cuál es el motivo, para entender qué puedo y qué no puedo hacer mientras tanto.

**Criterios de aceptación:**
- Si inicio sesión con mi contraseña correcta, una hoja me muestra el motivo de la suspensión; con una contraseña incorrecta veo el mensaje de siempre.
- Si tenía una sesión abierta, en mi siguiente acción veo una pantalla completa que dice que mi cuenta fue suspendida, el motivo y qué pasa con mis pedidos, y solo puedo cerrar sesión o escribir a Soporte.
- Mientras dure no puedo hacer pedidos nuevos, pagar ni iniciar reclamos; mi carrito se conserva. Los pedidos ya pagados siguen su curso; los que no pagué se cancelan y, si un pago llega sobre un pedido cancelado, me lo devuelven completo.
- Recibo un aviso y un email con el motivo al suspenderla y otro, con el mensaje del equipo si lo hay, al levantarla. Al levantarla vuelvo al estado que tenía antes.

## HU-C19: Ver un Pedido de un Comercio Suspendido

Como cliente, quiero saber qué pasó con mi pedido cuando el comercio se suspende, para decidir si lo cancelo o espero.

**Criterios de aceptación:**
- Si no pagué, veo el pedido como "Sin pagar", no puedo pagarlo mientras el comercio esté suspendido y puedo cancelarlo.
- Si estaba esperando al comercio, el sistema lo rechaza solo y me devuelve el dinero: "Cancelamos tu pedido #N porque el comercio no está disponible. Te devolvemos el dinero."
- Si estaba en preparación o listo para retirar y el comercio no lo atiende a tiempo, veo el pedido cancelado y que me devuelven el dinero; un pedido de retiro que nadie retiró se cierra como "No retirado", sin reembolso. Un pedido en camino sigue su curso normal.
- Si el comercio se suspende mientras armo el pedido, al confirmar veo un mensaje claro y puedo volver al catálogo con mi carrito intacto.
- Si el comercio quedó sin quien lo atienda por la suspensión de su Dueño, el pedido se cancela y recibo el mismo aviso con el reembolso total.

## HU-C20: Ayuda e Información Legal

Como cliente, quiero encontrar ayuda dentro de la aplicación, para resolver dudas sin salir de ella.

**Criterios de aceptación:**
- Desde mi perfil entro a "Ayuda", que reúne las Preguntas frecuentes, escribir a Soporte, mis consultas a Soporte, los Términos y Condiciones y la Política de Privacidad.
- Esas páginas son públicas: las puedo leer sin iniciar sesión, y llevan la versión y la fecha (v1.0, 6/11/2026).
- Al iniciar sesión, la aplicación me saluda por mi nombre de pila ("Hola, Lucía").
- La interfaz se adapta a pantalla de escritorio desde 1024 px, con todas las funciones de la versión móvil.
