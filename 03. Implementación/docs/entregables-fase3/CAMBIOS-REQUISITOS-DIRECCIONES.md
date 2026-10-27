# Cambios sugeridos a los requisitos del Cliente por las direcciones múltiples (Fase 3)

Para que Diego los copie a `01. Análisis de Requerimientos/04. Requisitos Funcionales/requisitos-funcionales-cliente.md` y a las historias de usuario del Cliente. La implementación vigente es la del backend (entrega A) y las pantallas (entrega B).

## Reemplazo de la línea sobre direcciones (línea 14 del archivo actual)

Texto actual:

> El cliente debe poder gestionar múltiples direcciones de entrega: agregar, editar, eliminar y designar una como dirección principal. La dirección principal no puede eliminarse si es la única registrada; primero debe designarse otra como principal.

Texto propuesto:

> El cliente debe poder gestionar hasta 5 direcciones de entrega desde "Mis direcciones" en su perfil: agregar, editar, eliminar y elegir cuál es la predeterminada. Cada dirección puede tener un nombre propio opcional (por ejemplo "Casa" o "Trabajo", de hasta 40 caracteres, que solo ve el cliente) y una referencia opcional para el repartidor (hasta 150 caracteres). Solo se aceptan direcciones de Río Grande, Ushuaia y Tolhuin. La primera dirección (la del registro) queda como predeterminada. No se puede eliminar la última dirección. Si se elimina la predeterminada y quedan otras, la más reciente pasa a ser la predeterminada y el sistema lo avisa antes de confirmar. Al cambiar la predeterminada se avisa y se puede deshacer durante unos segundos. Con 5 direcciones no se pueden agregar más hasta eliminar alguna.

## Línea sobre el checkout (línea 48 del archivo actual)

Reemplazar "y —en caso de domicilio— que el cliente tenga una dirección principal configurada" por:

> y —en caso de domicilio— que el cliente haya elegido una de sus direcciones guardadas.

## Línea nueva para el pedido a domicilio

> En el pedido a domicilio el cliente elige la dirección de entrega entre sus direcciones guardadas (la predeterminada viene preseleccionada) o agrega una nueva sin salir del pedido. Elegir otra vale solo para ese pedido y no cambia la predeterminada. El pedido guarda una copia de la dirección elegida (calle, número, piso/depto, código postal, localidad y referencia): editar o eliminar la dirección después no cambia los pedidos ya hechos. El comercio y su equipo ven la referencia; no ven el nombre propio de la dirección.
