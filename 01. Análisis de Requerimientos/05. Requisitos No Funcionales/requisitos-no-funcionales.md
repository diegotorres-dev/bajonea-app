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
  cuenta deben tener tiempo de expiración definido e invalidarse tras su primer uso.
- Las sesiones activas de un usuario deben invalidarse de forma inmediata cuando su
  cuenta pase a estado Suspendido (por acción del Administrador) o Inactivo (por
  inactivación automática del sistema).
- El endpoint receptor de webhooks de MercadoPago debe validar la autenticidad de
  cada notificación mediante la firma provista por MP, rechazando cualquier solicitud
  que no supere esta verificación.
- El acceso a cada funcionalidad debe estar restringido según el rol del usuario
  autenticado, impidiendo el acceso a recursos no autorizados.

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
  sin pérdida de funcionalidad.

---

## Usabilidad

- La interfaz debe ser intuitiva y consistente en todos los roles, minimizando la
  curva de aprendizaje para usuarios sin experiencia técnica.
- Los mensajes de error deben ser claros, descriptivos y orientados al usuario,
  evitando tecnicismos innecesarios.

---

## Disponibilidad y Confiabilidad

- El sistema debe garantizar una disponibilidad mínima del 99% en horarios de
  operación normales, preservando la integridad de los datos ante fallos inesperados.
- Los jobs automáticos (timeouts de pedidos, inactivación de usuarios, reintento de
  reembolsos, expiración de tokens) deben ejecutarse de forma confiable y registrar
  cualquier fallo para su posterior revisión y reintento (ver sección "Registro de
  Eventos del Sistema").

---

## Integraciones Externas

- El sistema debe integrarse con MercadoPago bajo el modelo Marketplace con split
  de pagos, permitiendo la distribución automática de cobros entre la plataforma y
  los comercios mediante el campo `application_fee` en cada transacción.
- El sistema debe procesar los webhooks de MercadoPago para confirmar pagos de forma
  asíncrona, actualizar los estados de pedido correspondientes y gestionar reembolsos
  según los estándares de seguridad de MP.
- Cada comercio debe vincular su cuenta de MercadoPago a la plataforma mediante
  OAuth para habilitar la recepción de pagos via split.
- El sistema debe reintentar automáticamente los reembolsos fallidos hasta su
  procesamiento exitoso.

---

## Registro de Eventos del Sistema (Logging)

El sistema debe generar registros de log categorizados, distintos del historial de
negocio persistido en BD (`HistorialEstadoPedido`, `HistorialAccionComercio`,
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
  y requieren seguimiento administrativo. Ej.: cantidad de reembolsos con fallo
  definitivo (5 intentos) pendientes de revisión manual — asociado a T27.
- **Idempotencia / casos borde (INFO):** eventos duplicados o de carrera
  detectados y descartados de forma controlada. Ej.: webhook de pago ya
  procesado, pago confirmado post-timeout, cobro post-cancelación.

Cada tipo se implementa mediante loggers dedicados por módulo (`jobs.*`,
`webhook.mercadopago`, `audit`), separados del registro de notificaciones
(`Notificacion`, ver diagrama Entidad-Relación), que es un dato de negocio
y no un log de infraestructura.

---

## Mantenibilidad

- El código debe seguir buenas prácticas de desarrollo, con separación clara de capas
  y responsabilidades, facilitando futuras modificaciones y extensiones del sistema.
- Los jobs automáticos deben ser monitoreables mediante los logs definidos en
  "Registro de Eventos del Sistema", con estadísticas de procesamiento por ejecución.
