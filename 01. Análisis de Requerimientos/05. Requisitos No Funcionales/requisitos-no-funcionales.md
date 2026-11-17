# Requisitos No Funcionales

## Seguridad

- El sistema debe operar exclusivamente bajo protocolo HTTPS, garantizando el cifrado
  de toda comunicación entre el cliente y el servidor.
- La autenticación debe implementarse mediante tokens JWT, con expiración definida y
  validación en cada solicitud autenticada.
- Las contraseñas deben almacenarse en la base de datos utilizando el algoritmo de
  hashing BCrypt.
- El sistema debe permitir únicamente una sesión activa por usuario a la vez,
  invalidando la sesión anterior ante un nuevo inicio de sesión desde otro dispositivo.
- El sistema debe bloquear el acceso a una cuenta tras tres intentos fallidos
  consecutivos de inicio de sesión, o ante tres intentos fallidos de contraseña actual
  en el flujo de cambio de contraseña desde perfil.
- Los tokens de verificación de email, recuperación de contraseña y reactivación de
  cuenta son códigos de 6 dígitos (no hay enlaces con token), deben tener tiempo de
  expiración definido (30 minutos el de recuperación de contraseña) e invalidarse tras su
  primer uso.
- Las sesiones activas de un usuario deben invalidarse de forma inmediata cuando su
  cuenta pase a estado Suspendido (por acción del Administrador) o Inactivo (por
  inactivación automática del sistema). Una cuenta suspendida o inactiva solo revela su
  estado después de comprobar que la contraseña es correcta; con una contraseña incorrecta
  el mensaje es el genérico de siempre.
- El endpoint receptor de webhooks de MercadoPago debe validar la autenticidad de
  cada notificación mediante la firma provista por MP, rechazando cualquier solicitud
  que no supere esta verificación. Limitación actual: la verificación se aplica solo si el
  secreto de firma está configurado; sin él se omite y se registra una advertencia.
- Los tokens OAuth de MercadoPago (acceso y renovación) deben almacenarse cifrados en la base de datos (AES-GCM).
- El acceso a cada funcionalidad debe estar restringido según el rol del usuario
  autenticado (Cliente, Dueño, Empleado, Administrador), impidiendo el acceso a
  recursos no autorizados. Dentro de un mismo comercio, el sistema debe distinguir
  además los permisos exclusivos del Dueño de los permisos delegables a un Empleado.
- Un mismo Usuario puede operar en más de un contexto (Cliente y Empleado de uno o más
  comercios, ej.), pero no existe multirol físico: el Usuario tiene un solo rol y el token
  de sesión lleva un solo rol. La autorización del contexto "Empleado de un comercio" debe
  resolverse en cada request, a partir del comercio activo indicado por el cliente y de la
  relación Activa del Usuario con ese comercio comprobada contra la base de datos (no a
  partir del token), respondiendo de forma idéntica ante un comercio inexistente o ajeno.
  Implementado en los tramos E1 a E4.
- Los documentos de habilitación de un comercio y las fotos de un reclamo son privados: se
  validan por su contenido (firma de bytes) y no solo por la extensión, se sirven con
  `X-Content-Type-Options: nosniff` y sin caché, y solo los ve quien corresponde (el Dueño de
  ese comercio y el Administrador los documentos; solo el Administrador las fotos de reclamos).
  El Empleado no accede a ninguno de los dos.
- El Soporte, que se puede usar sin sesión, debe estar protegido contra abuso: 3 consultas por
  día y 3 abiertas a la vez por email, 10 consultas por día por IP, 30 accesos fallidos con
  código por hora por email y 10 por IP, y 3 reenvíos de códigos por hora.
- Los reintentos de una operación no deben duplicar lo que no tiene protección propia: ante un
  tiempo de espera agotado al crear un pedido, crear un producto, cargar un documento o enviar una
  consulta nueva a Soporte, la aplicación avisa dónde verificar antes de volver a enviar y no
  reenvía sola.

---

## Rendimiento

- El sistema debe soportar cientos de usuarios simultáneos sin degradación del tiempo
  de respuesta, gestionando la concurrencia de forma segura para evitar inconsistencias.
- El tiempo de respuesta de las operaciones comunes no debe superar los 3 segundos.

---

## Compatibilidad

- El sistema debe ser compatible con los navegadores modernos más utilizados:
  Google Chrome, Mozilla Firefox, Microsoft Edge y Safari.
- La interfaz debe ser completamente responsiva, adaptándose a escritorio y móviles
  sin pérdida de funcionalidad. A partir de 1024 px se usa una composición de escritorio propia
  (navegación lateral, listas con detalle al costado, tablas y menús de sección) con un único
  punto de corte y un ancho máximo de 1280 px (1440 px el panel del Administrador); por debajo de
  1024 px se usa la versión móvil, sin diseño específico para tablet.

---

## Usabilidad

- La interfaz debe ser intuitiva y consistente en todos los roles, minimizando la
  curva de aprendizaje para usuarios sin experiencia técnica.
- Los mensajes de error deben ser claros, descriptivos y orientados al usuario,
  evitando tecnicismos innecesarios.
- Toda acción del usuario que modifica datos y termina bien debe confirmarse con un aviso breve
  (toast) que diga qué se hizo, en todos los roles. Quedan fuera las acciones que solo navegan
  (iniciar sesión, cerrar sesión, cambiar de cuenta) y las que ya terminan en su propia pantalla
  de confirmación (por ejemplo, el pedido confirmado). El aviso es una región de estado accesible
  (`role="status"`) para que los lectores de pantalla lo anuncien. Los avisos de éxito desaparecen
  solos a los 2,5 segundos aunque el mouse esté encima; los de error duran 7 segundos, se pueden
  cerrar y se pausan mientras se los mira o se los toca.
- Toda acción destructiva o irreversible pide una confirmación en un diálogo modal que se cancela
  con `Escape` o tocando afuera, arranca con el foco en la opción segura, mantiene el foco adentro
  y lo devuelve al botón que la abrió, no se cierra mientras se envía, conserva lo escrito si falla
  (el error aparece adentro) y explica la consecuencia cuando hay dinero de por medio. Las acciones
  que destruyen son rojas; "Volver" o "Cancelar" es siempre un botón con borde.
- Toda pantalla muestra un indicador de carga (esqueleto) mientras llegan los datos y, si falla la
  primera carga, un error con la opción de reintentar. Ante un corte de conexión el sistema conserva
  lo que la persona estaba haciendo y permite reintentar sin recargar; las actualizaciones de fondo
  (cada 15 segundos en el comercio y las pantallas de espera, cada 30 en el panel del Administrador)
  solo corren con la pantalla visible y no interrumpen lo que la persona está haciendo.
- Accesibilidad: todo control interactivo tiene un área táctil de al menos 44 × 44 px (con tres enlaces
  de texto del login y del panel del Administrador por debajo, ya anotados); los errores de campo se
  anuncian con `aria-invalid` y `aria-describedby` y el foco va al primer campo con error; las
  animaciones respetan la preferencia de movimiento reducido (`prefers-reduced-motion`); hay un enlace
  "Saltar al contenido"; el estado leído o no leído de un aviso no depende solo del color (fondo,
  punto y texto "No leída"); un aviso sin acción disponible no se presenta como un control
  deshabilitado; los avisos se recorren con el teclado y se leen con un lector de pantalla. El color
  naranja de la marca (`#ff4700`) no alcanza el contraste AA para texto pequeño y se conserva por
  decisión de identidad (ver Alcance y Limitaciones).
- El botón "Volver" de las pantallas del comercio lleva siempre a un destino fijo y previsible, no a la
  pantalla anterior del historial.

---

## Disponibilidad y Confiabilidad

- El sistema debe garantizar una disponibilidad mínima del 99% en horarios de
  operación normales, preservando la integridad de los datos ante fallos inesperados.
- Los jobs automáticos (timeouts de pedidos, inactivación de usuarios,
  expiración de tokens, cierre de turno) deben ejecutarse de forma confiable y registrar
  cualquier fallo para su posterior revisión y reintento (ver sección "Registro de
  Eventos del Sistema").
- El sistema debe usar un único reloj y una única zona horaria configurable (por defecto
  `America/Argentina/Ushuaia`, UTC-03:00) para guardar y comparar las horas de los historiales,
  los plazos de los pedidos, las invitaciones y los horarios de atención, de modo que el orden
  y los plazos no dependan de la zona de la máquina donde corra el servidor.
- El proceso de inactivación de cuentas corre una vez por día y en una sola instancia, y procesa cada
  cuenta en su propia transacción (máximo 200 por corrida), de modo que una falla no frena a las demás.
- La base de datos debe aceptar paquetes de al menos 16 MB (`max_allowed_packet`), porque las fotos de
  reclamo y los documentos de habilitación se guardan en la base.
- Una resolución de reclamo nunca deja dos notas de crédito ni dos reembolsos aunque haya varios
  Administradores o pestañas, y el email y la llamada a MercadoPago no se hacen con una conexión de la
  base tomada.

---

## Integraciones Externas

- El sistema debe integrarse con MercadoPago bajo el modelo Marketplace con split
  de pagos, permitiendo la distribución automática de cobros entre la plataforma y
  los comercios mediante el campo `marketplace_fee` en cada transacción.
- El sistema debe procesar los webhooks de MercadoPago para confirmar pagos de forma
  asíncrona, actualizar los estados de pedido correspondientes y gestionar reembolsos
  según los estándares de seguridad de MP.
- Cada Dueño debe vincular su cuenta de MercadoPago a la plataforma mediante OAuth,
  una única vez, para habilitar la recepción de pagos vía split en todos los comercios
  que administra.
- Un reembolso que Mercado Pago no procesa queda registrado como fallido y el
  Administrador lo revisa y lo reintenta desde su pantalla de Reembolsos (el
  reintento automático está previsto pero no se construyó).
- Las llamadas a la API de MercadoPago deben tener un tiempo máximo de espera (5 segundos de conexión y de lectura); ante una falla o demora, el sistema responde con un error de servicio no disponible en lugar de asumir un estado.
- La verificación de que el split se aplicó (comparación de `fee_details` contra el `marketplace_fee` esperado) es informativa: ante una diferencia registra una alerta y nunca bloquea ni revierte el pago del cliente.
- El procesamiento de los webhooks y de la sincronización de pagos debe ser idempotente y seguro ante notificaciones simultáneas sobre el mismo pedido (bloqueo pesimista del pedido); un pago aprobado nunca se sobrescribe.
- Toda transición de estado de un pedido (acciones del comercio, acciones del cliente, confirmación del pago y procesos automáticos) debe serializarse con un bloqueo pesimista del pedido y volver a validar el estado una vez obtenido el bloqueo, de modo que ante acciones simultáneas haya una única transición ganadora y la perdedora no deje historial, avisos ni reembolsos. Los procesos automáticos resuelven un pedido por transacción.
- Las modificaciones del carrito de un cliente (agregar, cambiar una cantidad, quitar un ítem, vaciar, el vaciado por pago aprobado y la baja de un producto agotado) deben serializarse por carrito con un bloqueo pesimista y resolverse con sentencias en bloque, de modo que repetir o cruzar esas operaciones (dos pestañas, un pago que llega mientras el cliente edita su carrito, un producto que se agota) no produzca errores del servidor, no deje un pago sin confirmar ni deje un carrito inconsistente.
- La espera mínima antes de poder cerrar un pedido de retiro como No Retirado (60 minutos desde que quedó listo para retirar) es configurable (`pedido.timeout.no-retirado-espera-minutos`) y se calcula con el reloj único una vez obtenido el bloqueo del pedido; el cierre automático de un comercio suspendido no la aplica.
- La URL base de la API de MercadoPago es configurable solo para pruebas (variable de entorno `MERCADOPAGO_API_BASE_URL`); en el servidor final no debe estar definida.
- Las imágenes de un producto y la foto de perfil de un comercio solo se aceptan si pertenecen a la carpeta de almacenamiento que el sistema firmó para ese comercio o producto: la URL de otra carpeta, de otro comercio o de otra cuenta de almacenamiento se rechaza.

---

## Registro de Eventos del Sistema (Logging)

El sistema debe generar registros de log categorizados, distintos del historial de
negocio persistido en BD (`HistorialEstadoPedido`, `HistorialEstadoComercio`,
`Notificacion`). Estos logs son archivos de aplicación gestionados por el
framework de logging (SLF4J + Logback de Spring Boot), con rotación y retención
configuradas en el VPS de DonWeb, e identificados a partir de los DFD Nivel 2.

Tipos de log identificados:

- **Ejecución de jobs (INFO):** resultado de cada corrida de los procesos
  automáticos (cantidad de registros procesados, IDs afectados, fecha/hora).
  Ej.: tokens expirados, reembolsos procesados, pedidos auto-confirmados,
  comercios restaurados automáticamente, cierres por timer de suspensión.
- **Error (ERROR):** fallos durante la ejecución de jobs o el procesamiento de
  eventos externos, sujetos a reintento o revisión manual. Ej.: fallo al expirar
  un pedido, fallo al procesar un webhook, fallo al inactivar un usuario, fallo
  al restaurar un comercio.
- **Seguridad (WARN/ERROR):** eventos de validación de integraciones externas.
  Ej.: webhook de MercadoPago con firma inválida (IP, fecha, tipo de error).
- **Auditoría (WARN):** situaciones que exceden el alcance de un job individual
  y requieren seguimiento administrativo. Ej.: cantidad de reembolsos fallidos
  pendientes de revisión manual (hoy se ven en el contador de Reembolsos del panel; T27 no
  tiene emisor).
- **Idempotencia / casos borde (INFO):** eventos duplicados o de carrera
  detectados y descartados de forma controlada. Ej.: webhook de pago ya
  procesado, pago confirmado post-timeout, cobro post-cancelación.

Cada tipo se implementa mediante loggers dedicados por módulo (`jobs.*`,
`webhook.mercadopago`, `audit`), separados del registro de notificaciones
(`Notificacion`, ver diagrama Entidad-Relación), que es un dato de negocio
y no un log de infraestructura.

Estado actual: los loggers dedicados por módulo no están implementados; el sistema usa el logger estándar SLF4J de cada clase. Queda pendiente.

---

## Mantenibilidad

- El código debe seguir buenas prácticas de desarrollo, con separación clara de capas
  y responsabilidades, facilitando futuras modificaciones y extensiones del sistema.
- Los jobs automáticos deben ser monitoreables mediante los logs definidos en
  "Registro de Eventos del Sistema", con estadísticas de procesamiento por ejecución.
