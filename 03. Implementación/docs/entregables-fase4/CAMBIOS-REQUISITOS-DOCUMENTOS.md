# Cambios sugeridos a los requisitos por los documentos del comercio y la nueva regla de "apto para venta" (Fase 4, entrega A)

Para que Diego los copie a `01. Análisis de Requerimientos/04. Requisitos Funcionales/` (Dueño, Empleado, Administrador y Sistema). La implementación vigente es la del backend (entrega A, migración `V43`); las pantallas son la entrega B, así que los textos que hablan de pantallas están marcados "(entrega B)" y se pueden dejar para cuando existan. Complementa a `CAMBIOS-HISTORIAS-USUARIO-DOCUMENTOS.md`.

## requisitos-funcionales-dueño.md

### Sección nueva "Documentos de Habilitación del Comercio" (antes de "Permisos Exclusivos del Dueño")

> ## Documentos de Habilitación del Comercio
>
> - Para vender, un comercio necesita tener documentación aprobada por el Administrador además de la cuenta de MercadoPago vinculada. El Dueño sube los documentos de cada comercio por separado: libreta sanitaria, carnet de manipulación de alimentos, habilitación comercial u otro documento (en este último caso tiene que contar de qué documento se trata, hasta 100 caracteres).
> - Los formatos aceptados son PDF, JPG, PNG y WebP, de hasta 8 MB cada uno. El sistema comprueba el contenido real del archivo, no solo su extensión. Si el archivo pesa más que el máximo, el aviso dice cuánto pesa y cuál es el máximo ("El archivo pesa 11,4 MB y el máximo es 8 MB").
> - Los documentos son privados del comercio: solo los ve el Dueño de ese comercio y el Administrador. Un Empleado no los ve ni los sube.
> - Solo se pueden subir documentos con el comercio Aprobado, Apto para venta o Cerrado temporalmente.
> - Cada documento nace "En revisión". El Administrador lo aprueba o lo rechaza; al rechazarlo indica un motivo (hasta 255 caracteres) que el Dueño ve junto al documento. Un documento rechazado queda en la lista y el Dueño sube uno nuevo; el sistema no lo vuelve a revisar.
> - El Administrador también puede revocar un documento ya aprobado (pasarlo a rechazado, con motivo), por ejemplo si venció o resultó inválido.
> - Documentos sin vencimiento: el sistema no los da de baja con el tiempo.
> - Límites por comercio: hasta 5 documentos en revisión al mismo tiempo y hasta 20 documentos en total, contando los rechazados. Superado el tope, el sistema lo informa y no recibe el archivo.
> - El Dueño solo puede eliminar un documento propio que todavía esté en revisión. No puede eliminar documentos aprobados ni rechazados.
> - El Dueño recibe un aviso dentro de la aplicación (sin email) cuando un documento se aprueba o se rechaza (con el motivo), cuando el comercio queda listo para recibir pedidos y cuando deja de estarlo.
> - Pantallas (entrega B): sección "Documentación" del perfil del comercio, hoja de subida, visor del archivo y el bloque "Para empezar a vender" del panel, que reemplaza al aviso actual "Vinculá Mercado Pago para empezar a vender" y muestra qué falta: comercio aprobado, MercadoPago vinculado y documentación aprobada.

### Regla de "apto para venta" (agregar en "Vinculación de Mercado Pago")

Reemplazar la viñeta "Sin esta vinculación, ninguno de sus comercios puede recibir pagos ni pedidos, y ninguno aparece en el catálogo público." por:

> - Un comercio puede recibir pedidos y aparecer en el catálogo público solo si está Apto para venta. Para pasar a ese estado necesita tener la cuenta de MercadoPago del Dueño vinculada, al menos un documento aprobado (de cualquier tipo) y ningún documento en revisión. Una vez que vende, sigue vendiendo aunque el Dueño suba un documento nuevo o el Administrador rechace uno extra: deja de ser Apto para venta solo si se desvincula MercadoPago o se revoca su último documento aprobado.
> - Si un comercio pierde la aptitud, vuelve a Aprobado, desaparece del catálogo igual que cuando se desvincula MercadoPago y no recibe pedidos nuevos; los pedidos ya aceptados siguen su curso. El Dueño recibe un aviso que le dice qué falta.
> - Si la cuenta del Dueño está bloqueada, ningún comercio queda Apto para venta: el que cumpliría los requisitos queda Cerrado temporalmente hasta que el Dueño recupere su cuenta.

### Línea 324 (Permisos Exclusivos del Dueño)

Texto actual: "- La futura documentación de habilitación del comercio."

Texto propuesto: "- Subir, ver y eliminar los documentos de habilitación del comercio (el Empleado no tiene ningún acceso a ellos)."

## requisitos-funcionales-empleado.md

### Línea 312

Texto actual: "- No puede acceder a la futura documentación de habilitación del comercio."

Texto propuesto: "- No puede ver ni subir los documentos de habilitación del comercio ni ver su estado de revisión."

## requisitos-funcionales-administrador.md

### Sección nueva "Revisión de Documentos de Comercios" (después de "Gestión de Comercios")

> ## Revisión de Documentos de Comercios
>
> - El administrador debe poder ver una bandeja con los documentos de comercios que esperan revisión, del más antiguo al más nuevo, con el comercio, su Dueño, el tipo de documento y la fecha de subida.
> - El administrador debe poder abrir el archivo de un documento (PDF o imagen) para revisarlo. El archivo solo se muestra dentro de la aplicación, con la sesión iniciada; no hay enlaces para compartir.
> - El administrador debe poder aprobar un documento en revisión, o rechazarlo ingresando un motivo obligatorio. Un documento rechazado no se puede volver a aprobar: el Dueño sube uno nuevo.
> - El administrador debe poder revocar un documento aprobado (pasarlo a rechazado con motivo obligatorio). Si era el último aprobado del comercio, el comercio deja de ser Apto para venta.
> - El administrador debe poder ver todos los documentos de un comercio, de cualquier estado, desde el detalle del comercio.
> - El administrador no recibe notificaciones por documentos nuevos: el panel muestra el total de documentos pendientes de revisión como contador del dashboard.
> - Cada resolución le llega al Dueño como aviso dentro de la aplicación.

### Gestión de Comercios — viñeta de aprobar

Texto actual: "El administrador debe poder aprobar un comercio, habilitándolo para operar y recibir pedidos."

Texto propuesto: "El administrador debe poder aprobar un comercio, habilitándolo para operar. Para recibir pedidos el comercio además necesita tener la cuenta de MercadoPago del Dueño vinculada y la documentación aprobada (ver Revisión de Documentos de Comercios)."

### Supervisión General

Agregar: "- El panel del administrador debe mostrar la cantidad de documentos de comercios pendientes de revisión."

## requisitos-funcionales-sistema.md (avisos)

Agregar a la tabla de notificaciones:

| Cód. | Evento | Destinatario | Canal |
|------|--------|--------------|-------|
| T38 | Documento aprobado | Dueño | Push (dentro de la aplicación) |
| T39 | Documento rechazado o revocado, con el motivo | Dueño | Push |
| T40 | El comercio ya puede recibir pedidos (pasó a Apto para venta) | Dueño | Push |
| T41 | El comercio dejó de recibir pedidos (perdió la aptitud) con lo que falta | Dueño | Push |

Y una regla de sistema: "El sistema decide si un comercio es Apto para venta con una única regla, que se recalcula cada vez que cambia algo que la afecta: se sube, aprueba, rechaza, revoca o elimina un documento; se vincula o desvincula MercadoPago; se bloquea o se recupera la cuenta del Dueño; se aprueba el comercio."

## requisitos-funcionales-cliente.md

Sin cambios de texto: el catálogo ya muestra solo comercios aptos para vender (más los cerrados temporalmente por bloqueo del Dueño). Opcional, donde se describe el catálogo: "Un comercio sin documentación aprobada o sin MercadoPago vinculado no aparece."

## alcance-y-limitaciones.md

Quitar, si figura, la documentación del comercio como funcionalidad futura, y dejar como limitación vigente: no hay antivirus (se valida el formato por los bytes del archivo pero no su contenido), no hay vencimiento de documentos y no hay lista de tipos obligatorios (cualquier documento aprobado alcanza).
