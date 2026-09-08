# Fase 16 — Frontend HTML/CSS/JS — Plan de tramos y prompts para Claude Code

## 0. Punto de partida

Fase 15 cerrada: catálogo definitivo de **87 pantallas IN** (agrupadas por módulo, con nombre
exacto de capa Figma) y 66 OUT, documentado en `docs/PANTALLAS-MVP-FASE15.md`, con `CLAUDE.md`
y `docs/DECISIONES.md` actualizados. Se detectaron y corrigieron 3 pantallas copiadas por error
a la página MVP de Figma (`AD18`, `AD22` — modales de bloqueo de borrado de categoría/tag que no
existen en el service real —, y `RC03` — horarios granulares de comercio, fuera de alcance).

Pendiente explícito para esta fase (Fase 16), heredado de Fase 14:

> Cuando se retome Fase 10 (SMTP/Brevo, en pausa por activación de bajonea.ar): correr una
> regresión sobre Fase 14 (Postman) probando el flujo real de verificación por email (no el
> endpoint de bypass de test) de punta a punta, y validar también ese endpoint desde Swagger UI
> (Fase 13).

Esto no bloquea Fase 16 — el frontend de verificación de email (`R03`, `R04`, `R05`) se construye
igual, consumiendo el endpoint real tal como existe hoy.

Archivo de referencia para nombres de pantallas: `docs/PANTALLAS-MVP-FASE15.md` (no está en este
proyecto de Claude.ai — Claude Code debe leerlo del repo real antes de generar nada, ver prompt
del Tramo 1).

Link de Figma (prototipo MVP, 87 pantallas):
`https://www.figma.com/design/C4MQqdvDqGL45sbEcmOozB/Bajone%C3%A1?node-id=140-2&p=f&t=mCtXIz4YZH6YWrPQ-0`

## 1. Regla no negociable para todos los tramos

**Ningún archivo `.html`, `.css` o `.js` generado en Fase 16 debe contener comentarios**, bajo
ninguna circunstancia — ni de encabezado, ni explicativos, ni TODO, ni comentados-para-referencia.
Esto se agrega como regla dura en `CLAUDE.md` (no como sugerencia puntual en cada prompt), para
que persista en todas las sesiones de Claude Code de esta fase sin tener que repetirla.

Motivo de que vaya en `CLAUDE.md` y no solo en el prompt: si se repite manualmente en cada prompt,
alguna sesión se olvida; si vive en `CLAUDE.md`, Claude Code la lee siempre al arrancar.

## 2. Por qué dividir en tramos

87 pantallas de una sola vez generan HTML/CSS/JS inconsistente entre sí (nombres de funciones
distintos para lo mismo, wrappers de fetch duplicados, criterios de validación que se contradicen)
y hacen imposible validar en el navegador antes de seguir. La guía de implementación ya sugiere un
orden pantalla-por-pantalla en su sección 16.5; lo que se hace acá es agrupar ese orden en tramos
cerrados, cada uno con su propio checklist de cierre, siguiendo la misma disciplina de
"100% del checklist antes de avanzar" que ya se exige para el resto de las fases.

Cada tramo debe cerrar HTML + CSS + JS de punta a punta contra el backend real (nunca datos
mockeados), antes de pasar al siguiente.

## 3. Tramos propuestos

### Tramo 16.1 — Fundacional: base de proyecto + auth + registro

Todo lo demás depende de esto (token JWT, selector de dirección, verificación de email).

**Archivos base (una sola vez, no se repiten en tramos siguientes):**
- `js/api.js` — wrapper fetch centralizado, base URL, header `Authorization: Bearer <token>` desde
  `localStorage`, manejo centralizado de errores HTTP (401 → redirige a login), parseo del
  `ApiResponse` estándar del backend.
- `js/geografia.js` — selector dependiente Provincia → Localidad.
- `css/styles.css` (o base compartida) — fundamentos visuales del proyecto (tipografía, paleta,
  espaciado), usando la skill `frontend-design` para que no salga con cara de plantilla genérica.

**Pantallas (nombres a confirmar 1:1 contra `PANTALLAS-MVP-FASE15.md`, según lo visto en capturas):**
- `G01` Splash Screen
- `G05` Modal Sesión Cerrada
- `G06` Loading Skeleton
- `G09` Sin Conexión a Internet
- `G10` Sesión Expirada
- `G11` Acceso Denegado
- `G12` Error 404
- `G13` Error 500
- `G17` Timeout de Red
- `A01` Bienvenida / Landing
- `A02` Inicio de Sesión
- `A03` Login — Error de Credenciales
- `A04` Login — Cuenta Bloqueada
- `A06` Login — Cuenta Inactiva
- `A07` Login — Email Sin Verificar
- `A08` Login — Comercio Pendiente de Aprobación
- `A09` Login — Comercio Rechazado
- `A10`–`A14` Recuperar Contraseña (pasos 1 a éxito) + Token Expirado/Inválido
- `A15`–`A16` Reactivación de Cuenta (solicitar token, éxito)
- `R01`–`R02` Registro Cliente (datos personales, dirección)
- `R03` Registro Cliente — Email de Verificación Enviado
- `R04`–`R05` Verificación de Email (éxito, token inválido/expirado)
- `RC01`–`RC02` Registro Comercio (datos del negocio, datos legales) — **sin** `RC03` (excluida)
- `RC04` Registro Comercio — Registro Exitoso (Pendiente de Aprobación)

**Checklist de cierre del tramo:**
- [ ] Los 3 archivos base (`api.js`, `geografia.js`, `styles.css`) existen y son reutilizados sin
      duplicación por las pantallas de este tramo.
- [ ] Login real contra el backend, con los 5 casos de error (credenciales, bloqueada, inactiva,
      email sin verificar, comercio pendiente/rechazado) todos disparando la pantalla correcta.
- [ ] Selector Provincia → Localidad funcional en ambos formularios de registro (cliente y comercio).
- [ ] Recuperación de contraseña de punta a punta (solicitar → email → token → nueva contraseña).
- [ ] Registro de cliente y de comercio ambos terminan en la pantalla de verificación/pendiente
      correcta según el flujo real del backend.
- [ ] Ningún archivo de este tramo tiene comentarios.
- [ ] Recorrido manual en navegador: landing → login fallido → login correcto → logout → registro
      cliente completo → registro comercio completo, sin errores de consola.

### Tramo 16.2 — Cliente: catálogo, exploración y perfil

**Pantallas:**
- `C01`–`C03` Home (comercios disponibles, visitante no autenticado, sin comercios disponibles)
- `C04` Detalle de Comercio / Menú
- `C06` Modal: Detalle de Producto
- `C37` Perfil (Vista Principal)
- `C38` Editar Datos Personales
- `C41` (renombrada singular) Editar mi dirección
- `C43` Cambiar Contraseña: Error Contraseña Incorrecta
- `C46` Confirmar Cierre de Sesión (Modal)

**Nota de riesgo conocida:** `C37`, `C38` y `C41` dependen de `ClienteController`, que en la
auditoría de código de Fase 15 se confirmó que **no existe todavía**. Antes de generar estas
pantallas hay que confirmar con Claude Code si ese controller ya se construyó entre sesiones; si
no, este sub-grupo se pospone y el tramo cierra solo con `C01`–`C04`, `C06`, `C43`, `C46`.

**Checklist de cierre del tramo:**
- [ ] Catálogo público carga sin JWT (visitante no autenticado ve `C02` correctamente).
- [ ] Filtrado real por categoría/tag contra el backend en el detalle de comercio.
- [ ] Modal de detalle de producto consume datos reales (incluida galería de imágenes si el
      producto tiene más de una).
- [ ] Si `ClienteController` existe: perfil, edición de datos y edición de dirección funcionan de
      punta a punta. Si no existe: documentado como bloqueado, no simulado con mocks.
- [ ] Ningún archivo de este tramo tiene comentarios.

### Tramo 16.3 — Cliente: carrito y checkout

**Pantallas:**
- `C09` Carrito: Vacío
- `C10` Carrito: Con Productos
- `C10b` Modal: Vaciar Carrito
- `C12` Modal: Conflicto de Comercio
- `C13` Checkout Paso 1: Modalidad de Entrega
- `C14` Checkout Paso 2A: Confirmar Dirección (Delivery)
- `C15` Checkout Paso 2B: Confirmar Retiro (Pickup)
- `C16` Checkout Paso 3: Resumen y Confirmación Final

**Checklist de cierre del tramo:**
- [ ] Agregar/quitar/ver ítems de carrito funcional, limitado a un comercio a la vez (conflicto
      dispara `C12` real, no solo visual).
- [ ] Checkout completo (delivery y pickup) termina en creación real de `Pedido` en estado
      `PENDIENTE`, sin ningún paso de MercadoPago.
- [ ] Ningún archivo de este tramo tiene comentarios.
- [ ] Recorrido manual: catálogo → agregar productos → carrito → checkout delivery → pedido creado;
      repetir variante pickup.

### Tramo 16.4 — Cliente: pedidos y notificaciones

**Pantallas:**
- `C22` Detalle de Pedido: Estado PENDIENTE
- `C23` Detalle de Pedido: Estado EN_PREPARACION
- `C28` Detalle de Pedido: Estado RECHAZADO
- `C33` Historial de Pedidos (Con Pedidos)
- `C34` Historial de Pedidos: Empty State
- `C44` Centro de Notificaciones (Con Notificaciones)
- `C45` Centro de Notificaciones: Empty State

**Checklist de cierre del tramo:**
- [ ] Historial de pedidos lista pedidos reales del cliente autenticado, con estados correctos.
- [ ] Detalle de pedido refleja el estado real desde el backend (no hardcodeado).
- [ ] Notificaciones consumen polling REST real (no simulado), siguiendo `16.5.12` de la guía.
- [ ] Ningún archivo de este tramo tiene comentarios.

### Tramo 16.5 — Comercio: dashboard y perfil

**Pantallas:**
- `CO01` Dashboard: Pendiente de Aprobación
- `CO28` Perfil (Vista Principal)
- `CO29` Editar Perfil del Comercio
- `CO33` **(a diseñar de cero en Figma antes de codear — no existe todavía)** Dashboard de comercio
  aprobado y operando, sin ningún lenguaje de MercadoPago.

**Checklist de cierre del tramo:**
- [ ] `CO33` diseñada en Figma y validada visualmente antes de escribir su HTML/CSS/JS.
- [ ] Dashboard distingue correctamente estado pendiente vs. aprobado/operando contra el backend
      real.
- [ ] Ningún archivo de este tramo tiene comentarios.

### Tramo 16.6 — Comercio: CRUD de productos

**Archivo base nuevo de este tramo:**
- `js/cloudinary.js` — firma vía backend + subida directa a Cloudinary, hasta 5 imágenes por
  producto, con manejo del 409 cuando ya se llegó al límite.

**Pantallas:**
- `CO13` Lista de Productos (Con Productos)
- `CO14` Crear Producto
- `CO15` Editar Producto
- `CO16` Modal: Acción sobre Producto (Bottom Sheet Kebab)
- `CO17` Modal: Confirmar Descontinuar Producto

**Checklist de cierre del tramo:**
- [ ] Alta, edición y baja lógica (agotado/descontinuado) de producto funcionan contra el backend
      real.
- [ ] Subida de imágenes a Cloudinary de punta a punta (hasta 5), con una marcada como principal,
      URLs persistidas correctamente.
- [ ] Ningún archivo de este tramo tiene comentarios.

### Tramo 16.7 — Comercio: pedidos recibidos

**Pantallas:**
- `CO18` Lista de Pedidos: Con Pedidos Activos
- `CO19` Detalle de Pedido: PENDIENTE
- `CO20` Modal: Rechazar Pedido (con Motivo)
- `CO21` Detalle de Pedido: EN_PREPARACIÓN

**Checklist de cierre del tramo:**
- [ ] Aceptar/rechazar pedido con motivo funcional contra el backend real.
- [ ] Cambios de estado del pedido visibles también desde el lado cliente (Tramo 16.4) sin
      recargar manualmente ambas sesiones para confirmar.
- [ ] Ningún archivo de este tramo tiene comentarios.

### Tramo 16.8 — Administrador: aprobación de comercios

**Pantallas:**
- `AD01` Dashboard Principal
- `AD02` Listado Comercios Pendientes
- `AD03` Detalle Comercio Pendiente (Primera Solicitud)
- `AD05` Modal Confirmar Aprobación de Comercio
- `AD06` Modal Rechazar Comercio (con Motivo)

**Checklist de cierre del tramo:**
- [ ] Aprobar/rechazar comercio con motivo funcional, refleja correctamente en el login de comercio
      (dispara `A08`/`A09` en Tramo 16.1 si se reintenta login).
- [ ] Ningún archivo de este tramo tiene comentarios.

### Tramo 16.9 — Administrador: categorías y tags

**Pantallas:**
- `AD15` Listado de Categorías
- `AD16` Modal Crear Categoría
- `AD17` Modal Editar Categoría
- `AD15` (tres puntitos) — acciones sobre categoría
- `AD19` Modal Eliminar Categoría Confirmación
- `AD20` Listado de Tags / (tres puntitos) — acciones sobre tag
- `AD21` Modal Crear Tag
- `AD22` Modal Editar Tag
- `AD23` Modal Eliminar Tag Confirmación

**Nota de riesgo conocida:** la Fase 15 confirmó que la lógica de bloqueo de borrado
(categoría/tag en uso por productos) **no está implementada** en el service real. Los modales de
confirmación de borrado deben reflejar el comportamiento real del backend (borrado directo o error
genérico), no simular una validación de bloqueo que no existe. Si se decide implementar esa
validación, es una tarea de backend previa a este tramo, no un ajuste cosmético del frontend.

**Checklist de cierre del tramo:**
- [ ] CRUD completo de categorías y tags contra el backend real.
- [ ] El comportamiento de borrado en el frontend coincide exactamente con lo que el backend hace
      hoy (confirmado contra código, no asumido).
- [ ] Ningún archivo de este tramo tiene comentarios.

## 4. Checklist de cierre global de Fase 16

- [ ] Las 87 pantallas del catálogo MVP (menos las que Fase 15 marcó como no accionables sin
      trabajo de backend previo, documentado caso por caso) tienen su HTML/CSS/JS funcional.
- [ ] Cada pantalla consume el backend real, nunca datos mockeados, en su versión final.
- [ ] El selector Provincia → Localidad funciona en ambos formularios de registro.
- [ ] La subida de imágenes a Cloudinary funciona de punta a punta y persiste correctamente.
- [ ] El flujo completo (registro → verificación → login → catálogo → carrito → pedido →
      aceptación/rechazo → notificación) se recorre manualmente de punta a punta en el navegador,
      sin errores de consola.
- [ ] Ningún archivo `.html`, `.css` o `.js` de todo `frontend/` contiene comentarios.
- [ ] `CLAUDE.md` y `docs/DECISIONES.md` actualizados reflejando el cierre de Fase 16 y cualquier
      pantalla pospuesta con su motivo documentado.

---

## 5. Primer prompt para Claude Code — Tramo 16.1

```
Iniciamos la Fase 16 del proyecto Bajoneá: pasar el prototipo de Figma a frontend real en
HTML/CSS/JS vanilla, consumiendo el backend Spring Boot real (nunca datos mockeados).

Antes de generar nada:
1. Leé `CLAUDE.md` completo, en particular la sección de convenciones de Fase 16 y el checklist
   de cierre de Fase 15.
2. Leé `docs/PANTALLAS-MVP-FASE15.md` para confirmar los nombres exactos de capa de las 87
   pantallas del catálogo MVP y las decisiones de exclusión ya tomadas (recordá: AD18, AD22 y
   RC03 fueron copiadas por error a la página de Figma del MVP y NO deben generarse).
3. Conectate al MCP de Figma y explorá el archivo del prototipo:
   https://www.figma.com/design/C4MQqdvDqGL45sbEcmOozB/Bajone%C3%A1?node-id=140-2&p=f&t=mCtXIz4YZH6YWrPQ-0
   Ubicá específicamente las pantallas listadas en la sección "Tramo 16.1" más abajo.

Agregá ahora mismo a `CLAUDE.md` (no como nota puntual, como regla permanente de Fase 16 en
adelante) lo siguiente, textual:

> Ningún archivo `.html`, `.css` o `.js` generado en `frontend/` debe contener comentarios de
> ningún tipo (ni de encabezado, ni explicativos, ni TODO, ni código comentado), bajo ninguna
> circunstancia. Esto aplica a todos los tramos de Fase 16 sin excepción.

Este es el Tramo 1 de 9 de la Fase 16 (ver plan completo en el archivo adjunto
`FASE16-PLAN-Y-PROMPTS.md` si querés el detalle de los tramos siguientes; por ahora trabajamos
solo el Tramo 1).

## Alcance de este tramo

Construir la base de todo el frontend más las pantallas de autenticación y registro:

### Archivos base (compartidos por todos los tramos siguientes, no se repiten después):
- `frontend/js/api.js`: wrapper fetch centralizado. Base URL configurable (constante al inicio del
  archivo). Agrega header `Authorization: Bearer <token>` leyendo el token de `localStorage` en
  cada request autenticado. Manejo centralizado de errores HTTP: un 401 debe limpiar el token y
  redirigir a `login.html`. Parsea siempre el `ApiResponse` estándar del backend (revisá su forma
  real en el código, no asumas estructura).
- `frontend/js/geografia.js`: selector dependiente Provincia → Localidad. Al cargar un formulario
  de registro, popula el primer `<select>` con `GET /api/v1/geografia/provincias`. Al elegir
  provincia, popula el segundo `<select>` (deshabilitado hasta ese momento) con
  `GET /api/v1/geografia/localidades?provinciaId=X`.
- `frontend/css/styles.css`: fundamentos visuales compartidos (tipografía, paleta de colores,
  espaciado base, componentes reutilizables como botones e inputs). Antes de escribir este
  archivo, leé y aplicá la skill `frontend-design` — el resultado no debe verse como una plantilla
  genérica de Bootstrap; tiene que tener identidad propia coherente con la marca "Bajoneá".

### Pantallas de este tramo (nombre de capa Figma → archivo HTML sugerido):
- G01 Splash Screen
- G05 Modal Sesión Cerrada
- G06 Loading Skeleton
- G09 Sin Conexión a Internet
- G10 Sesión Expirada
- G11 Acceso Denegado
- G12 Error 404
- G13 Error 500
- G17 Timeout de Red
- A01 Bienvenida / Landing
- A02 Inicio de Sesión
- A03 Login — Error de Credenciales
- A04 Login — Cuenta Bloqueada
- A06 Login — Cuenta Inactiva
- A07 Login — Email Sin Verificar
- A08 Login — Comercio Pendiente de Aprobación
- A09 Login — Comercio Rechazado
- A10, A11, A12, A13, A14 Recuperar Contraseña (los 4 pasos + token inválido/expirado)
- A15, A16 Reactivación de Cuenta (solicitar token, éxito)
- R01 Registro Cliente Paso 1: Datos Personales
- R02 Registro Cliente Paso 2: Dirección de Entrega
- R03 Registro Cliente — Email de Verificación Enviado
- R04 Verificación de Email: Éxito
- R05 Verificación de Email: Token Inválido o Expirado
- RC01 Registro Comercio Paso 1: Datos del Negocio
- RC02 Registro Comercio Paso 2: Datos Legales
- RC04 Registro Comercio — Registro Exitoso (Pendiente de Aprobación)

Nota: RC03 (Paso 3: Horarios de Atención) está excluida — no la generes, aunque aparezca en la
capa de Figma.

## Cómo trabajar

1. Antes de tocar código, listá con qué endpoints reales del backend vas a conectar cada pantalla
   (login, registro cliente, registro comercio, recuperación de contraseña, reactivación de
   cuenta, verificación de email, geografía). Si algún endpoint que necesitás no existe en el
   backend actual, decilo explícitamente antes de seguir — no generes la pantalla contra un
   endpoint inventado.
2. Generá pantalla por pantalla, no todo de una vez. Para cada una: HTML + su lógica en el/los
   `.js` correspondiente(s), reutilizando `api.js` y `geografia.js`. Andá agrupando en los mismos
   archivos `.js` las pantallas que compartan lógica (ej. todas las variantes de error de login
   pueden vivir en un único `auth.js`), en vez de crear un archivo por pantalla.
3. Seguridad mínima no negociable: nunca loguear el token JWT en consola, nunca poner tokens ni
   datos sensibles en la URL, validar en el cliente antes de enviar pero sin confiar solo en esa
   validación (el backend es la fuente de verdad), sanitizar cualquier valor que se inserte en el
   DOM para evitar XSS (usar `textContent`, no `innerHTML`, salvo que sea estrictamente necesario
   y esté sanitizado).
4. Al terminar cada pantalla, verificá que su archivo (o los archivos que tocaste) no tenga ningún
   comentario, sin excepciones.
5. Cuando termines el tramo completo, corré el recorrido manual: landing → intento de login
   fallido (credenciales, cuenta bloqueada, cuenta inactiva, email sin verificar) → login correcto
   → logout → registro de cliente completo (incluyendo selector de dirección) → registro de
   comercio completo → verificación de email. Reportá cualquier error de consola o de red que
   encuentres en el camino, y no lo des por cerrado si algo falla silenciosamente.

Al cerrar el tramo, actualizá el checklist correspondiente en `CLAUDE.md` y agregá una entrada en
`docs/DECISIONES.md` con lo que se decidió o encontró (endpoints faltantes, ajustes de UI respecto
al diseño de Figma, etc.).
```
