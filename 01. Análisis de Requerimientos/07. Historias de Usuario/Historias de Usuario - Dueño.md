# Historias de Usuario — Dueño

Identidad de cuenta, datos fiscales, medio de cobro y administración de la relación
con Empleados y con los distintos comercios que un mismo Dueño puede operar. Las
historias operativas del negocio (productos, pedidos, horarios) están en Historias de
Usuario — Comercio.

## HU-D01: Registrarme como Dueño

Como Dueño, quiero registrarme eligiendo un nombre de usuario para mi cuenta, con mis datos de persona jurídica (razón social, CUIT,
domicilio fiscal, condición frente al IVA, tipo de sociedad e inicio de actividades)
junto con los datos de mi primer comercio (tipo de comercio, modalidades de entrega,
horarios de atención), para solicitar mi habilitación con información completa desde
un único flujo.

## HU-D02: Verificar mi Cuenta

Como Dueño, quiero verificar mi dirección de email tras el registro, para activar mi
cuenta y quedar en espera de aprobación administrativa de mi primer comercio.

## HU-D03: Cargar mi Foto de Perfil Personal

Como Dueño, quiero cargar y editar mi foto de perfil personal (opcional), como dato de
mi identidad como persona, independiente de la foto de perfil de cada comercio que
administro.

## HU-D04: Vincular mi Cuenta de Mercado Pago

Como Dueño, quiero vincular mi cuenta de MercadoPago a la plataforma mediante el
proceso de autorización OAuth una única vez, para habilitar la recepción de pagos y que
todos mis comercios aprobados comiencen a aparecer en el catálogo y a recibir pedidos.

**Criterios de aceptación adicionales (multi-comercio, tramo 5):**
- Tengo una sola cuenta de MercadoPago para todos mis comercios: si ya tengo una activa, el
  sistema no me deja iniciar otra vinculación ni vincular otra distinta sin desvincular antes.
- Una cuenta de MercadoPago no puede estar activa en dos Dueños a la vez; si la que quiero
  usar ya está en uso, el sistema me lo dice (sin decirme quién la tiene) y puedo usar otra.
- En la pantalla de mi cuenta de cobro veo la lista de mis comercios operativos y un texto
  que aclara que la cuenta cobra (o, si todavía no la vinculé, va a cobrar) por todos ellos.
- Mientras alguno de mis comercios operativos no esté listo para vender por falta de una
  cuenta vinculada, el panel "Tus comercios" me muestra el aviso "Vinculá Mercado Pago para
  empezar a vender" con un acceso directo a la pantalla de la cuenta de cobro; el aviso no se
  puede cerrar y desaparece apenas vinculo la cuenta.
- Antes de desvincular veo un resumen de mis comercios con sus pedidos en curso (por estado)
  y los clientes que todavía están pagando; si hay clientes pagando, en lugar de la
  confirmación veo un mensaje que me indica a qué hora aproximada puedo volver a intentarlo.
- No puedo desvincular mientras algún cliente esté pagando un pedido de cualquiera de mis
  comercios: el sistema me indica a qué hora aproximada puedo volver a intentarlo.
- Al desvincular, todos mis comercios vuelven a Aprobado (dejan de aparecer en el catálogo y
  de recibir pedidos nuevos), mis pedidos en curso siguen su flujo, y los reembolsos que
  hagan falta después quedan para revisión manual del Administrador.

## HU-D05: Administrar Múltiples Comercios

Como Dueño, quiero dar de alta comercios adicionales bajo mi cuenta sin volver a cargar
mis datos fiscales, y elegir desde un selector sobre cuál de mis comercios estoy
operando en cada momento, para gestionar varios negocios desde una única cuenta.

## HU-D06: Dar de Baja un Comercio

Como Dueño, quiero poder dar de baja o cerrar definitivamente uno de mis comercios sin
que esto afecte a mis demás comercios ni a mi cuenta de MercadoPago vinculada, para
discontinuar un local puntual cuando lo necesite.

## HU-D07: Invitar a un Empleado

Como Dueño, quiero invitar a una persona por email a operar uno de mis comercios como
Empleado, para delegar la gestión diaria de productos y pedidos sin compartir mi
contraseña.

## HU-D08: Gestionar mi Equipo de Empleados

Como Dueño, quiero ver el listado de empleados de cada uno de mis comercios con su
estado (pendiente, activo, desactivado), y poder desactivar a un empleado en un
comercio puntual en cualquier momento, para mantener el control de quién opera cada uno
de mis negocios.

## HU-D09: Solicitar Revisión de Solicitud Rechazada

Como Dueño con un comercio rechazado, quiero poder corregir sus datos (y, si todavía no
tuve ningún comercio aprobado, también los fiscales y los del representante) y reenviar
la solicitud de habilitación del mismo comercio, para tener la oportunidad de corregir
los motivos del rechazo y volver a ser evaluado por el administrador. Tengo hasta 3
intentos por comercio, y veo cuántos me quedan; después de eso, o si el administrador lo
rechaza de forma definitiva, el comercio ya no se puede corregir y solo veo una pantalla
informativa.

## HU-D10: Contactar Soporte ante Suspensión

Como Dueño con un comercio suspendido, quiero poder enviar un mensaje al administrador
explicando mi situación, para solicitar la revisión de la suspensión de ese comercio.
