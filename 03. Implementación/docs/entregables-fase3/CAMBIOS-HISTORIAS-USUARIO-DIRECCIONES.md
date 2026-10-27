# Cambios sugeridos a las historias de usuario del Cliente por las direcciones múltiples (Fase 3)

Para que Diego los copie a `01. Análisis de Requerimientos/07. Historias de Usuario/Historias de Usuario - Cliente.md`. Complementa a `CAMBIOS-REQUISITOS-DIRECCIONES.md` (mismas reglas, redactadas como historias con criterios de aceptación). La implementación vigente es la del backend (entrega A) y las pantallas (entrega B, con el aviso de descartar cambios).

## HU-C01: Registrarse como Cliente (ajuste de una frase)

Texto actual: "...con una dirección principal ya configurada desde el comienzo."

Texto propuesto: "...con una dirección predeterminada ya configurada desde el comienzo." (la dirección del registro queda como la primera dirección guardada y como la predeterminada).

## HU-C05: Editar mi Perfil y Direcciones (reemplaza el texto actual)

Texto actual:

> Como cliente, quiero editar mis datos personales, cargar una foto de perfil opcional y gestionar mis direcciones de entrega (agregar, editar, eliminar y cambiar la principal), para mantener mi información actualizada.

Texto propuesto:

> Como cliente, quiero editar mis datos personales, cargar una foto de perfil opcional y gestionar hasta 5 direcciones de entrega desde "Mis direcciones" (agregar, editar, eliminar y elegir cuál es la predeterminada), para mantener mi información actualizada y no tener que escribir la dirección en cada pedido.
>
> **Criterios de aceptación:**
> - "Mis direcciones (N)" en mi perfil muestra la lista con la predeterminada marcada. Tocar el círculo de otra dirección la deja como predeterminada al instante, el sistema me avisa y me deja deshacerlo durante unos segundos.
> - Cada dirección tiene calle, número, piso/depto opcional, código postal y localidad. Solo se aceptan direcciones de Río Grande, Ushuaia y Tolhuin.
> - Puedo ponerle un nombre propio opcional (por ejemplo "Casa" o "Trabajo", hasta 40 caracteres) que solo veo yo, y una referencia opcional para el repartidor (hasta 150 caracteres).
> - Con 5 direcciones no puedo agregar otra: el botón queda deshabilitado con un aviso que me dice que elimine alguna.
> - Para eliminar una dirección el sistema me pide confirmación. No puedo eliminar mi única dirección. Si elimino la predeterminada y quedan otras, la más reciente pasa a ser la predeterminada y la confirmación me lo dice antes de eliminar.
> - Eliminar o editar una dirección no cambia los pedidos que ya hice con ella.
> - Si estoy cargando o editando una dirección y salgo con la flecha de volver o con la tecla Esc teniendo cambios sin guardar, el sistema me pregunta "¿Descartar los cambios?" con "Seguir editando" y "Descartar". Sin cambios, vuelvo directo. Guardar no pregunta nada.
> - Al volver de la edición o del alta, el foco queda en el botón desde el que abrí la pantalla.

## HU-C10: Realizar un Pedido (agregar un párrafo)

Agregar al final del texto actual:

> En un pedido a domicilio elijo la dirección de entrega entre mis direcciones guardadas: la predeterminada viene preseleccionada. Si necesito otra, la agrego sin salir del pedido; elegir otra dirección vale solo para ese pedido y no cambia mi predeterminada. Si tengo 5 direcciones, el botón para agregar otra queda deshabilitado y un enlace me lleva a "Mis direcciones". Si la dirección que elegí se eliminó antes de confirmar, el sistema me avisa con claridad y recarga la lista. El pedido guarda una copia de la dirección elegida (calle, número, piso/depto, código postal, localidad y referencia).

## HU-C12: Seguir el Estado de mi Pedido (agregar una línea)

> En el detalle de un pedido a domicilio veo la dirección de entrega con la que lo hice, incluida la referencia si la cargué, tal como estaba al confirmar el pedido aunque después la haya editado o eliminado.

## Historias de otros roles afectadas (para que no queden desfasadas)

- Comercio, Dueño y Empleado, historia de ver el detalle de un pedido: en un pedido a domicilio ven la dirección de entrega y su referencia. No ven el nombre propio que el cliente le puso a la dirección.
