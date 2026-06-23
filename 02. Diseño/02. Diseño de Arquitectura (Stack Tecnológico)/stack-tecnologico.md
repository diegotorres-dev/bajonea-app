# Stack Tecnológico

## Backend

- **Java 21 (LTS)** como lenguaje principal.
- **Spring Boot 3.x** (gestionado con Maven) como framework de aplicación.
- **Spring Security + JWT (jjwt)** para autenticación y autorización por rol.
- **Spring Data JPA (Hibernate)** como capa de persistencia sobre MySQL.
- **Spring Scheduling** para los jobs periódicos (timeouts de pedidos, expiración
  de tokens, reintento de reembolsos, inactivación de usuarios, timers de suspensión).
- **Spring Mail** para el envío de emails transaccionales.
- **BCrypt** para el hashing de contraseñas.
- **Flyway** para versionado y migración del esquema de base de datos.
- **springdoc-openapi** para documentación automática de la API (Swagger UI).
- **Lombok** para reducción de código boilerplate.
- **SLF4J + Logback** (incluido en Spring Boot) para el registro de eventos del
  sistema, según la taxonomía definida en Requisitos No Funcionales.

## Base de Datos

- **MySQL** como motor relacional principal.
- Catálogo geográfico (`Provincia`, `Localidad`) precargado mediante un proceso de
  ETL inicial a partir de la **API Georef** (georef-ar-api, datos.gob.ar).

## Frontend

- **HTML, CSS y JavaScript** (vanilla), sin frameworks de frontend.
- **Figma** para prototipado y diseño de interfaces previo a la implementación.

## Integraciones Externas

- **MercadoPago** (SDK oficial Java) bajo el modelo Marketplace: vinculación de
  cuentas de comercio vía OAuth, creación de preferencias de pago con split
  (`application_fee`), y recepción de confirmaciones vía webhook.
- **Cloudinary** para almacenamiento de imágenes (productos y fotos de perfil),
  mediante subida firmada directa desde el frontend; la base de datos almacena
  únicamente la URL resultante. El backend valida el límite de 5 imágenes por
  producto antes de emitir la firma de subida; formatos, tamaños y
  transformaciones quedan a cargo de Cloudinary.
- **WhatsApp**, mediante enlaces `wa.me` con el número de teléfono del cliente o
  comercio según corresponda (sin integración por API).

## Infraestructura y Hosting

- **DonWeb**: VPS, dominio y hosting de la aplicación.
- **Nginx** como proxy inverso frente a la aplicación Spring Boot.
- **systemd** para la gestión del proceso de la aplicación (sin contenedores).
- **Cloudflare** para protección de seguridad (WAF, mitigación DDoS) frente al VPS.
- **HTTPS** obligatorio en toda comunicación (Let's Encrypt o certificado de origen
  de Cloudflare, según el modo de uso que se confirme — ver "Puntos a Confirmar").

## Email

- Proveedor de envío de emails transaccionales: **a confirmar** (verificación de
  cuenta, recuperación de contraseña, reactivación, notificaciones T11/T14-T16/
  T24/T25/T27-T29 y aviso de sesión cerrada en otro dispositivo).

## Notificaciones

- Notificaciones in-app mediante **polling REST** (sin Web Push ni service workers).

## Herramientas de Documentación

- **Mermaid** (mermaid.live) para diagramas de flujo (DFD) y diagrama
  entidad-relación.
- **PlantUML** para diagramas de casos de uso.

---

## Puntos a Confirmar

1. **Modo de uso de Cloudflare:** ¿migramos los DNS del dominio a Cloudflare
   (manteniendo el registro en DonWeb) para habilitar WAF/proxy y usar SSL
   "Full (Strict)" con certificado de origen de Cloudflare en Nginx, o se usa
   Cloudflare únicamente en modo DNS-only (sin proxy), manteniendo Let's Encrypt
   como certificado?
2. **Proveedor de email:** salvo que DonWeb ofrezca SMTP incluido en el plan de
   hosting, se recomienda **Brevo** (plan gratuito, 300 emails/día), suficiente
   para el volumen de notificaciones transaccionales previsto. ¿Confirmás Brevo
   o preferís verificar primero la oferta de DonWeb?
