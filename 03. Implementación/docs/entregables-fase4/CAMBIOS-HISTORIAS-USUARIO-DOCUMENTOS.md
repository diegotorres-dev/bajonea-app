# Cambios sugeridos a las historias de usuario por los documentos del comercio (Fase 4, entrega A)

Actualizado con la entrega B (pantallas, 2026-10-26). Para que Diego los copie a `01. Análisis de Requerimientos/07. Historias de Usuario/` (Dueño y Administrador; Empleado y Cliente con un ajuste de una línea). Complementa a `CAMBIOS-REQUISITOS-DOCUMENTOS.md` (mismas reglas, redactadas como historias con criterios de aceptación). La implementación vigente es la del backend (entrega A); las pantallas son la entrega B y los criterios que dependen de ellas están marcados.

## Historias de Usuario - Dueño.md

### HU-D15: Subir los Documentos de mi Comercio (nueva)

Como Dueño, quiero subir los documentos de habilitación de cada uno de mis comercios (libreta sanitaria, carnet de manipulación de alimentos, habilitación comercial u otros) y ver si ya fueron revisados, para que mi comercio quede habilitado para recibir pedidos.

**Criterios de aceptación:**
- Elijo el tipo de documento y el archivo. Si elijo "Otro" tengo que contar qué documento es (hasta 100 caracteres); para los demás tipos no hace falta.
- Acepto PDF, JPG, PNG y WebP de hasta 8 MB. Si el archivo no es de un formato válido (aunque su nombre termine en .pdf), el sistema me lo dice. Si pesa más de 8 MB, el aviso dice cuánto pesa y cuál es el máximo.
- El documento nace "En revisión". Mientras tanto puedo eliminarlo; cuando ya está aprobado o rechazado no puedo.
- Puedo tener hasta 5 documentos en revisión a la vez y hasta 20 en total contando los rechazados; si llego al tope, el sistema me lo explica.
- Solo puedo subir documentos si mi comercio está Aprobado, Apto para venta o Cerrado temporalmente.
- Veo cada documento con su tipo, el nombre del archivo, la fecha y su estado ("En revisión", "Aprobado", "Rechazado"); si fue rechazado veo el motivo sin tener que tocar nada, y puedo subir uno nuevo.
- Puedo abrir mis documentos para verlos. Nadie más que el Administrador y yo puede verlos; un Empleado de mi comercio no.
- Recibo un aviso dentro de la aplicación cuando un documento se aprueba o se rechaza (con el motivo). No recibo email por esto.
- Veo la sección "Documentación" en el perfil del comercio (fila "Documentación", solo para el Dueño). Los documentos aparecen agrupados por estado, primero lo que pide acción: "Rechazados" (con el motivo y el botón "Subir uno nuevo"), "En revisión" (con ver y eliminar) y "Aprobados" (con ver). Si todavía no subí ninguno, la pantalla me explica qué puedo subir.
- Subo desde una hoja con el tipo, la descripción (solo para "Otro documento") y el archivo. Antes de enviar, la hoja me avisa si el formato no es válido o si el archivo pesa más del máximo ("El archivo pesa 11,4 MB y el máximo es 8 MB"), y mientras sube no puedo enviarlo dos veces. Si cierro la hoja con datos cargados, me pregunta si quiero descartarlos.
- Eliminar un documento en revisión pide confirmación. Si el Administrador lo resolvió mientras tanto, el sistema me lo explica y actualiza la lista.
- Abro el documento en un visor a pantalla completa (imagen o PDF), con la opción de abrirlo en una pestaña nueva; si está rechazado veo el motivo y puedo subir uno nuevo desde ahí.
- Los avisos de documento aprobado o rechazado me llevan a la pantalla "Documentación".

### HU-D16: Saber qué le Falta a mi Comercio para Vender (nueva)

Como Dueño, quiero ver qué le falta a cada comercio para empezar a recibir pedidos, para saber qué tengo que hacer.

**Criterios de aceptación:**
- Veo tres requisitos: comercio aprobado, MercadoPago vinculado y documentación aprobada, con lo que ya está cumplido y lo que falta. Si hay un documento en revisión lo veo como "en revisión".
- El comercio empieza a recibir pedidos cuando tiene MercadoPago vinculado, al menos un documento aprobado (de cualquier tipo) y ningún documento en revisión.
- Una vez que vende, sigue vendiendo aunque yo suba un documento nuevo o el Administrador rechace uno extra. Deja de recibir pedidos solo si desvinculo MercadoPago o el Administrador revoca mi último documento aprobado.
- Si mi comercio pierde la aptitud, desaparece del catálogo, no recibe pedidos nuevos (los ya aceptados siguen) y me llega un aviso que dice qué falta. Cuando vuelve a cumplir los requisitos, me llega otro aviso.
- Si mi cuenta está bloqueada, mis comercios no quedan a la venta aunque cumplan los requisitos; al recuperar la cuenta se vuelve a evaluar.
- El bloque "Para empezar a vender" del panel reemplaza al aviso "Vinculá Mercado Pago para empezar a vender": muestra los tres pasos (comercio aprobado, Mercado Pago, documentación) como una lista con lo hecho, lo que sigue y un botón en cada paso ("Vincular ahora", "Subir documentación" o "Ver documentación"). Si hay un documento en revisión lo dice ("Tenés 1 documento esperando la aprobación"); si hay uno rechazado y ninguno aprobado, pide atención. Con varios comercios, el bloque corresponde al comercio activo.
- Cuando el comercio empieza a recibir pedidos, el bloque muestra una sola vez "Tu comercio ya puede recibir pedidos." y desaparece. Si después pierde la aptitud, el bloque vuelve y dice qué falta. Los avisos de "ya puede recibir pedidos" y "dejó de recibir pedidos" me llevan al panel.
- El Empleado no ve el bloque ni la sección "Documentación".

### HU-D04: Vincular mi Cuenta de Mercado Pago (ajuste de una frase)

Texto actual: "...para habilitar la recepción de pagos y que todos mis comercios aprobados comiencen a aparecer en el catálogo y a recibir pedidos."

Texto propuesto: "...para habilitar la recepción de pagos; mis comercios aprobados comienzan a aparecer en el catálogo y a recibir pedidos cuando además tienen su documentación aprobada."

## Historias de Usuario - Administrador.md

### HU-A18: Revisar los Documentos de los Comercios (nueva)

Como administrador, quiero revisar los documentos que suben los comercios y aprobarlos o rechazarlos con un motivo, para asegurarme de que solo vendan comercios con la documentación en regla.

**Criterios de aceptación:**
- Veo la bandeja de documentos en revisión, del más antiguo al más nuevo, con el comercio, su Dueño, el tipo, el nombre del archivo y la fecha de subida. El panel muestra cuántos hay pendientes.
- Puedo abrir el archivo (PDF o imagen) dentro de la aplicación. No hay enlaces para compartirlo.
- Puedo aprobar un documento en revisión o rechazarlo; al rechazar tengo que escribir un motivo (hasta 255 caracteres).
- Puedo revocar un documento ya aprobado (pasarlo a rechazado con motivo). Si era el último aprobado del comercio, el comercio deja de recibir pedidos.
- No puedo volver a aprobar un documento rechazado: el Dueño sube uno nuevo.
- Desde el detalle de un comercio puedo ver todos sus documentos, de cualquier estado, aunque el comercio esté suspendido.
- Cada resolución le llega al Dueño como aviso dentro de la aplicación. Yo no recibo avisos por documentos nuevos: uso el contador y la bandeja.
- El panel tiene la tarjeta "Documentos por revisar" con el contador y cuánto lleva esperando el más antiguo ("El más antiguo lleva 3 días"); lleva a la bandeja, que muestra de cada documento el comercio, el tipo, el archivo y cuánto hace que se subió, con el botón "Revisar".
- La pantalla de revisión muestra los datos del comercio (Dueño, si tiene Mercado Pago vinculado y cuántos documentos tiene por estado), la vista previa del archivo con la opción de verlo en pantalla completa, los otros documentos del comercio y los botones "Rechazar" y "Aprobar". Aprobar pide una confirmación breve; rechazar y revocar piden el motivo (obligatorio, hasta 255 caracteres, con contador). Si el Dueño eliminó el documento o ya fue resuelto, la pantalla muestra el mensaje y se actualiza.
- Desde el detalle de un comercio en "Comercios" hay un botón "Ver documentos" que abre la revisión de ese comercio; ahí se puede revocar un documento aprobado.

### HU-A03: Aprobar un Comercio (ajuste de una frase)

Texto actual: "...para habilitarlo a operar y recibir pedidos una vez que complete la vinculación de su cuenta de MP."

Texto propuesto: "...para habilitarlo a operar; recibe pedidos una vez que complete la vinculación de su cuenta de MP y tenga su documentación aprobada."

## Historias de Usuario - Empleado.md

Agregar, donde se listan las cosas que el Empleado no puede hacer, o como criterio de la historia de acceso al comercio: "No veo los documentos de habilitación del comercio ni su estado de revisión."

## Historias de Usuario - Cliente.md

Sin cambios. Opcional, en la historia del catálogo: "Los comercios que todavía no tienen su documentación aprobada o su cuenta de cobro no aparecen en el catálogo."
