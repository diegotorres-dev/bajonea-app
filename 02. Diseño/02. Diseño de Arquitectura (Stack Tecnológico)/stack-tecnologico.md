# Stack Tecnológico

## Backend

- **Java 21 (LTS)** como lenguaje principal.
- **Spring Boot 3.x** (gestionado con Maven) como framework de aplicación.
- **Spring Security + JWT (jjwt)** para autenticación y autorización por rol.
- **Spring Data JPA (Hibernate)** como capa de persistencia sobre MySQL (con JDBC directo
  en los puntos que necesitan bloqueos finos, como los contadores de límites de Soporte).
- **Spring Scheduling** para los procesos automáticos periódicos: vencimiento de pedidos
  (pago, respuesta del comercio y autoconfirmación de entrega), expiración de tokens y
  códigos, inactivación diaria de cuentas sin uso, cierre de
  turno con su email de resumen, y los plazos que siguen a la suspensión de un comercio.
- **Reloj único de la aplicación** (`Clock`) con zona horaria
  `America/Argentina/Ushuaia`: todos los procesos y las fechas que se muestran usan la
  misma hora.
- **Resend** (API REST, `resend-java`) para el envío de emails transaccionales.
- **BCrypt** para el hashing de contraseñas.
- **Flyway** para versionado y migración del esquema de base de datos.
- **springdoc-openapi** para documentación automática de la API (Swagger UI).
- **Lombok** para reducción de código boilerplate.
- **SLF4J + Logback** (incluido en Spring Boot) para el registro de eventos del
  sistema, según la taxonomía definida en Requisitos No Funcionales.

## Base de Datos

- **MySQL** (InnoDB) como motor relacional principal. El desarrollo y las pruebas locales
  corren sobre **MariaDB 10.4**, que es compatible con el esquema.
- El servidor de base de datos necesita `max_allowed_packet` de al menos **16 MB**: los
  documentos de habilitación de los comercios (hasta 8 MB) y las fotos de los reclamos
  (hasta 5 MB) se guardan dentro de la base, en columnas `LONGBLOB`, y no en un servicio
  externo. El servidor comprueba el tipo real de cada archivo por su firma de bytes.
- Catálogo geográfico (`Provincia`, `Localidad`) precargado mediante un proceso de
  ETL inicial a partir de la **API Georef** (georef-ar-api, datos.gob.ar). La plataforma
  opera únicamente en Tierra del Fuego (Río Grande, Ushuaia y Tolhuin).
- Esquema versionado con Flyway (migraciones hasta la `V52`) y descripto en el Diccionario
  de Datos (56 tablas).

## Frontend

- **HTML, CSS y JavaScript** (vanilla), sin frameworks de frontend.
- Interfaz de **escritorio**, pensada desde 1024 px de ancho, con un único punto de
  corte; no hay un diseño propio para tablet.
- **Google Fonts** para las tipografías de la interfaz.
- **Figma** para prototipado y diseño de interfaces previo a la implementación.

## Integraciones Externas

- **MercadoPago** (API REST vía `RestClient` de Spring, sin SDK) bajo el modelo Marketplace: vinculación de
  cuenta vía OAuth (authorization_code con PKCE) a nivel Dueño (una única vez, compartida entre todos los comercios
  que administra), creación de preferencias de Checkout Pro con split (`marketplace_fee`) y
  recepción de confirmaciones vía webhook, verificadas contra la API de MercadoPago.
  Los tokens OAuth se almacenan cifrados (AES-GCM).
- **Cloudinary** para almacenamiento de imágenes (productos y fotos de perfil),
  mediante subida firmada directa desde el frontend; la base de datos almacena
  únicamente la URL resultante. El backend valida el límite de 5 imágenes por
  producto antes de emitir la firma de subida; formatos, tamaños y
  transformaciones quedan a cargo de Cloudinary. Los documentos de habilitación y las
  fotos de reclamos no pasan por Cloudinary (ver "Base de Datos").
- **WhatsApp**, mediante enlaces `wa.me` con el número de teléfono del cliente o
  comercio según corresponda (sin integración por API).

## Infraestructura y Hosting

- **DonWeb**: VPS, dominio y hosting de la aplicación (hosting definitivo).
- **Railway**: usado únicamente de forma temporal para presentar el final de la materia; no forma parte de la infraestructura definitiva.
- **Nginx** como proxy inverso frente a la aplicación Spring Boot. Detrás del proxy hay que
  activar el reenvío de cabeceras (`server.forward-headers-strategy`) para que el sistema
  vea la IP real de cada persona (la usan los límites de Soporte).
- **systemd** para la gestión del proceso de la aplicación (sin contenedores).
- **Cloudflare** para protección de seguridad (WAF, mitigación DDoS) frente al VPS.
- **HTTPS** obligatorio en toda comunicación (Let's Encrypt o certificado de origen
  de Cloudflare, según el modo de uso que se confirme — ver "Puntos a Confirmar").

## Email

- Proveedor de envío de emails transaccionales: **Resend** (API REST, remitente
  `info@bajonea.ar`), que reemplaza a Brevo/SMTP, descartado por un bloqueo de
  activación de cuenta sin resolución posible. Cubre la verificación de cuenta, la
  recuperación de contraseña y la reactivación (códigos de 6 dígitos, sin enlaces),
  las invitaciones a Empleados, los avisos de suspensión, levantamiento e inactivación,
  el resultado de un reclamo, las respuestas de Soporte, la cancelación de pedidos por
  suspensión de un comercio, el resumen de cierre de turno y el aviso de sesión cerrada
  en otro dispositivo.

## Notificaciones

- Notificaciones in-app mediante **polling REST** cada 15 segundos (sin Web Push ni
  service workers), más el email para los avisos que lo requieren.

## Pruebas

- **JUnit y Spring Boot Test** para las pruebas del backend (unitarias y de integración
  contra la base de pruebas).
- **Playwright** (Chromium) para las pruebas de extremo a extremo de la interfaz. Las
  pantallas llevan atributos `data-testid` para ubicar los elementos.
- **Postman + Newman** para la colección de pruebas de la API.
- Perfil de Spring **`test`**: permite verificar cuentas sin email real y apaga la
  exigencia de documentación de los comercios (`comercio.documentacion.requerida`);
  en producción esa exigencia queda activa.

## Herramientas de Documentación

- **Mermaid** (mermaid.live) para diagramas de flujo (DFD), diagrama
  entidad-relación y modelo relacional.
- **PlantUML** para diagramas de casos de uso.

---

## Puntos a Confirmar

1. **Modo de uso de Cloudflare:** ¿migramos los DNS del dominio a Cloudflare
   (manteniendo el registro en DonWeb) para habilitar WAF/proxy y usar SSL
   "Full (Strict)" con certificado de origen de Cloudflare en Nginx, o se usa
   Cloudflare únicamente en modo DNS-only (sin proxy), manteniendo Let's Encrypt
   como certificado?
2. **Proveedor de email:** resuelto — se usa **Resend** (ver sección Email).
