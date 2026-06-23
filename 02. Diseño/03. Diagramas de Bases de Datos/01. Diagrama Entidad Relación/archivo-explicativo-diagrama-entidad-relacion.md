# Entidades, Relaciones y Cardinalidades — Bajoneá

## Catálogo Geográfico

- Provincia (1) - Tiene - (1,N) Localidad --- Justificación: Una provincia debe tener una o muchas localidades.
  - (1,N) en Localidad: 1 porque los datos geográficos están precargados desde el inicio (no son dinámicos como el resto), por lo que toda provincia siempre tiene al menos una localidad; N porque agrupa muchas.

- Localidad (1) - Ubica - (0,N) Direccion --- Justificación: Una localidad puede no tener ninguna dirección registrada, o tener varias.
  - (0,N) en Direccion: 0 porque una localidad puede no tener direcciones registradas todavía; N porque varias direcciones pueden pertenecer a la misma localidad.

## Identidad y Herencia

- Usuario (1) - Es - (1) Persona --- Justificación: Un usuario es exactamente una persona, y una persona es exactamente un usuario.

- Persona (1) - Es - (0,1) PersonaFisica --- Justificación: Una persona puede no ser una persona física (si es jurídica), o serlo, pero solo una.
  - (0,1) en PersonaFisica: 0 porque esa Persona podría ser PersonaJuridica en cambio; 1 porque si es física, es una sola.

- Persona (1) - Es - (0,1) PersonaJuridica --- Justificación: Una persona puede no ser una persona jurídica (si es física), o serlo, pero solo una.
  - (0,1) en PersonaJuridica: 0 porque esa Persona podría ser PersonaFisica en cambio; 1 porque si es jurídica, es una sola.

- Usuario (1) - Genera - (0,N) Token --- Justificación: Un usuario puede no tener ningún token generado, o tener varios.
  - (0,N) en Token: 0 porque un usuario puede no tener tokens activos en este momento; N porque puede generar varios (verificación, recuperación, reactivación).

- Usuario (1) - Abre - (0,N) Sesion --- Justificación: Un usuario puede no tener ninguna sesión registrada, o tener varias.
  - (0,N) en Sesion: 0 porque un usuario recién registrado aún no inició sesión; N porque acumula historial de sesiones.

- Usuario (1) - Recibe - (0,N) Notificacion --- Justificación: Un usuario puede no tener ninguna notificación, o tener varias.
  - (0,N) en Notificacion: 0 porque un usuario puede no tener notificaciones todavía; N porque recibe muchas a lo largo del tiempo.

- Usuario (1) - Envía - (0,N) Soporte --- Justificación: Un usuario puede no enviar ningún mensaje de soporte, o enviar varios.
  - (0,N) en Soporte: 0 porque la mayoría de los usuarios nunca es suspendido; N porque podría enviar varios mensajes si lo suspenden más de una vez.

## Roles de Negocio

- PersonaFisica (1) - Es - (0,1) Cliente --- Justificación: Una persona física puede no ser cliente (si es administrador), o serlo, pero solo una vez.
  - (0,1) en Cliente: 0 porque esa PersonaFisica podría ser Administrador en cambio; 1 porque si es cliente, es uno solo.

- PersonaFisica (1) - Es - (0,1) Administrador --- Justificación: Una persona física puede no ser administrador (si es cliente), o serlo, pero solo una vez.
  - (0,1) en Administrador: 0 porque esa PersonaFisica podría ser Cliente en cambio; 1 porque si es administrador, es uno solo.

- PersonaJuridica (1) - Representa - (1,N) Comercio --- Justificación: Una persona jurídica debe representar uno o muchos comercios.
  - (1,N) en Comercio: 1 porque toda cuenta de Comercio se crea junto con su persona jurídica, nunca queda sin representar; N porque, por escalabilidad, el modelo de datos permite que una misma persona jurídica represente más de un comercio a futuro. **Para esta versión** la cardinalidad real queda limitada a 1 por regla de negocio. La relación ER admite N, pero el sistema valida que sea exactamente 1 — documentado en alcance-y-limitaciones.md.

## Direcciones y Horarios

- Cliente (1) - Registra - (1,N) Direccion --- Justificación: Un cliente debe tener al menos una dirección registrada, y puede tener varias.
  - (1,N) en Direccion: 1 porque toda cuenta de cliente requiere una dirección obligatoria al registrarse; N porque puede agregar más direcciones después.

- Comercio (1) - Opera en - (1) Direccion --- Justificación: Un comercio opera en exactamente una dirección, y esa dirección corresponde a exactamente un comercio.

- Comercio (1) - Define - (1,N) Horario --- Justificación: Un comercio debe tener uno o muchos horarios.
  - (1,N) en Horario: 1 porque debe definir al menos una franja horaria de atención; N porque puede definir varias (distintos días u horarios).

## Pagos del Comercio

- Comercio (0,1) - Vincula - (1) CuentaMercadoPago --- Justificación: Un comercio puede no tener ninguna cuenta de MercadoPago vinculada, o tener como máximo una.
  - (0,1) en Comercio: 0 porque un comercio recién aprobado todavía no vinculó su cuenta de MP; 1 porque como máximo puede vincular una sola cuenta.

## Supervisión Administrativa

- Comercio (1) - Posee - (0,N) HistorialAccionComercio --- Justificación: Un comercio puede no tener ninguna acción registrada en su historial, o tener varias.
  - (0,N) en HistorialAccionComercio: 0 porque un comercio nuevo puede no tener acciones administrativas registradas; N porque acumula historial con el tiempo.

- Administrador (1) - Ejecuta - (0,N) HistorialAccionComercio --- Justificación: Un administrador puede no haber ejecutado ninguna acción, o haber ejecutado varias.
  - (0,N) en HistorialAccionComercio: 0 porque un administrador podría no haber ejecutado ninguna acción todavía; N porque puede ejecutar muchas.

- Administrador (1) - Configura - (0,N) ConfiguracionTarifa --- Justificación: Un administrador puede no haber configurado ninguna tarifa, o haber configurado varias.
  - (0,N) en ConfiguracionTarifa: 0 porque un administrador podría no haber modificado las tarifas todavía; N porque puede registrar varios cambios a lo largo del tiempo.

## Reclamos y Soporte

- Administrador (0,1) - Resuelve - (0,N) Reclamo --- Justificación: Un administrador puede resolver ningún o varios reclamos, y un reclamo puede no estar resuelto, o estar resuelto por un solo administrador.
  - (0,1) en Administrador: 0 porque el reclamo puede estar todavía sin resolver; 1 porque, una vez resuelto, lo resuelve un solo administrador.
  - (0,N) en Reclamo: 0 porque un administrador puede no tener reclamos asignados; N porque puede resolver muchos.

- Administrador (0,1) - Atiende - (0,N) Soporte --- Justificación: Un administrador puede atender ningún o varios mensajes de soporte, y un mensaje puede no estar atendido, o estar atendido por un solo administrador.
  - (0,1) en Administrador: 0 porque el mensaje puede estar todavía sin atender; 1 porque lo atiende un solo administrador.
  - (0,N) en Soporte: 0 porque un administrador puede no tener mensajes asignados; N porque puede atender muchos.

- Pedido (1) - Origina - (0,1) Reclamo --- Justificación: Un pedido puede no originar ningún reclamo, o originar como máximo uno.
  - (0,1) en Reclamo: 0 porque la mayoría de los pedidos no genera un reclamo; 1 porque si lo genera, es un solo reclamo.

## Catálogo de Productos

- Categoria (1) - Clasifica - (0,N) Producto --- Justificación: Una categoría puede no tener ningún producto asignado, o tener varios.
  - (0,N) en Producto: 0 porque una categoría recién creada puede no tener productos asignados; N porque agrupa muchos productos.

- Producto (0,M) - Etiqueta - (0,N) Tag --- Justificación: Un producto puede no tener ningún tag, o tener varios; y un tag puede no estar asignado a ningún producto, o estarlo en varios.
  - (0,M) en Producto: 0 porque los tags son opcionales (un producto puede no tener ninguno); M porque puede tener varios.
  - (0,N) en Tag: 0 porque un tag puede no estar asignado a ningún producto todavía; N porque puede aplicarse a varios productos.

- Comercio (1) - Ofrece - (0,N) Producto --- Justificación: Un comercio puede no ofrecer ningún producto, o ofrecer varios.
  - (0,N) en Producto: 0 porque un comercio recién aprobado puede no tener productos cargados; N porque puede ofrecer muchos.

- Producto (1) - Muestra - (1,N) ImagenProducto --- Justificación: Un producto debe tener una o varias imágenes.
  - (1,N) en ImagenProducto: 1 porque toda publicación requiere al menos una imagen; N porque puede tener hasta 5 (tope de negocio).

## Carrito de Compras

- Cliente (1) - Posee - (1) Carrito --- Justificación: Un cliente posee exactamente un carrito, y ese carrito pertenece a exactamente un cliente.

- Comercio (0,1) - Referenciado en - (0,N) Carrito --- Justificación: Un comercio puede no estar referenciado en ningún carrito, o estarlo en varios; y un carrito puede no tener ningún comercio asignado, o tener como máximo uno.
  - (0,1) en Comercio: 0 porque el carrito puede estar vacío (sin comercio asignado todavía); 1 porque, una vez con productos, pertenece a un solo comercio.
  - (0,N) en Carrito: 0 porque un comercio puede no estar referenciado en ningún carrito en este momento; N porque puede estar en los carritos de muchos clientes distintos.

- Carrito (1) - Contiene - (0,N) ItemCarrito --- Justificación: Un carrito puede no contener ningún ítem, o contener varios.
  - (0,N) en ItemCarrito: 0 porque un carrito puede estar vacío; N porque puede tener varios ítems.

- Producto (1) - Incluido en - (0,N) ItemCarrito --- Justificación: Un producto puede no estar incluido en ningún ítem de carrito, o estarlo en varios.
  - (0,N) en ItemCarrito: 0 porque un producto puede no estar en ningún carrito en este momento; N porque puede estar en los carritos de varios clientes.

## Pedidos

- Cliente (1) - Realiza - (0,N) Pedido --- Justificación: Un cliente puede no haber realizado ningún pedido, o haber realizado varios.
  - (0,N) en Pedido: 0 porque un cliente recién registrado puede no haber hecho pedidos todavía; N porque puede hacer muchos a lo largo del tiempo.

- Comercio (1) - Recibe - (0,N) Pedido --- Justificación: Un comercio puede no haber recibido ningún pedido, o haber recibido varios.
  - (0,N) en Pedido: 0 porque un comercio recién aprobado puede no haber recibido pedidos todavía; N porque puede recibir muchos.

- Direccion (0,1) - Entrega en - (0,N) Pedido --- Justificación: Una dirección puede no estar asociada a ningún pedido, o estarlo en varios; y un pedido puede no tener ninguna dirección de entrega (si es retiro), o tener como máximo una.
  - (0,1) en Direccion: 0 porque el pedido puede ser para retirar en el local (sin dirección de entrega); 1 porque, si es a domicilio, usa una sola dirección.
  - (0,N) en Pedido: 0 porque una dirección puede no haberse usado en ningún pedido todavía; N porque puede usarse en varios pedidos.

- Pedido (1) - Contiene - (1,N) DetallePedido --- Justificación: Un pedido debe tener uno o varios ítems.
  - (1,N) en DetallePedido: 1 porque todo pedido requiere al menos un ítem; N porque puede tener varios productos distintos.

- Producto (1) - Incluido en - (0,N) DetallePedido --- Justificación: Un producto puede no estar incluido en ningún detalle de pedido, o estarlo en varios.
  - (0,N) en DetallePedido: 0 porque un producto puede no haberse vendido nunca; N porque puede aparecer en muchos pedidos distintos (histórico).

- Pedido (1) - Registra - (1,N) HistorialEstadoPedido --- Justificación: Un pedido debe tener uno o varios registros de historial de estado.
  - (1,N) en HistorialEstadoPedido: 1 porque todo pedido nace con un estado inicial registrado; N porque acumula varias transiciones a lo largo de su ciclo de vida.

## Pagos y Reembolsos

- Pedido (1) - Genera - (1) Pago --- Justificación: Un pedido genera exactamente un pago, y un pago corresponde a exactamente un pedido.

- Pago (1) - Reembolsa - (0,1) NotaCredito --- Justificación: Un pago puede no tener ninguna nota de crédito, o tener como máximo una.
  - (0,1) en NotaCredito: 0 porque la mayoría de los pagos no se reembolsa; 1 porque, si se reembolsa, es un único reembolso total.