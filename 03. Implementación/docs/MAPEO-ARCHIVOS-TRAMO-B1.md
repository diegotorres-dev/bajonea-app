# Mapeo de archivos — Tramo B1: el login devuelve el nombre de pila

Fecha: 2026-11-12. Toca backend (un campo aditivo, sin migraciones) y frontend. Pendiente de la confirmación de Diego (sin commit).

## Alcance

El objeto `usuario` de la respuesta del login suma `nombre` (nombre de pila, opcional). El frontend lo guarda con el resto de la sesión, lo mantiene al día cuando la persona cambia su nombre, y lo usa en el saludo del Cliente y del panel del comercio y en el pie de la barra lateral de escritorio, que dejó de hacer dos consultas extra para conseguirlo.

## De dónde sale el nombre

`persona_fisica.nombre` con `persona_fisica.id = usuario.id`. En los cuatro roles la persona física de la cuenta comparte el id del usuario (Cliente, Empleado y Administrador cuelgan de ella por `@MapsId`; en el Dueño la `PersonaFisica` es el representante, creada sobre la misma `Persona` que la `PersonaJuridica`). Una lectura de una sola columna (`PersonaFisicaRepository.findNombreByUsuarioId`), sin joins ni N+1. Si no hay fila, el campo se omite.

## Endpoints de sesión tocados

| Endpoint | Cambio |
|---|---|
| `POST /api/v1/auth/login` | `data.usuario.nombre` |
| `POST /api/v1/auth/reactivar-cuenta/con-credenciales` | idem (comparte `iniciarSesion`) |
| `PATCH` y `DELETE /api/v1/usuarios/{id}/foto-perfil` (`UsuarioService`) | devuelven la misma forma de usuario, ahora con `nombre` |
| `POST /api/v1/auth/registro/*` | sin cambios (no emiten sesión; el campo no viaja) |

El cambio de contexto (selector de cuenta del Empleado) es solo frontend: no emite una sesión nueva.

## Archivos de backend

| Archivo | Cambio |
|---|---|
| `dto/response/UsuarioResponseDTO.java` | campo `nombre` con `@JsonInclude(NON_NULL)`; constructor de seis argumentos (el de cinco queda) |
| `repositories/PersonaFisicaRepository.java` | `findNombreByUsuarioId` |
| `services/AuthService.java` | inyecta `PersonaFisicaRepository` (último argumento del constructor); `aResponseDTO` resuelve el nombre |
| `services/UsuarioService.java` | idem para las respuestas de foto |
| `src/test/.../AuthServiceBloqueoComercioTest`, `AuthServiceColisionCodigoTest` | un argumento más en el constructor |
| `src/test/.../LoginNombreDePilaHttpIntegrationTest` (nuevo, 9 tests) | cada rol, nombre ausente, solo el propio, errores sin nombre, reactivación y foto |

## Archivos de frontend

| Archivo | Cambio |
|---|---|
| `js/api.js` | `getNombre()` (normaliza a Title Case) y `actualizarNombreSesion(nombre)` |
| `js/saludo.js` (nuevo) | `pintarSaludo(elemento)`: «Hola, {nombre} 👋» o «Hola 👋»; el nombre va en un `span` (`saludo-nombre`) con `title` y `textContent` |
| `css/styles.css` | `.saludo` y `.saludo__nombre` (corte con puntos suspensivos; sin `@media`) |
| `js/comercio.js` | el saludo del panel usa `pintarSaludo` |
| `js/catalogo.js` | el saludo del Cliente usa `pintarSaludo`; **sin** `GET /clientes/perfil` |
| `js/comercio-escritorio.js` | el pie de la barra lateral usa `getNombre()`; se eliminó `resolverNombrePersona` y con ella `GET /clientes/perfil` (Empleado) y `GET /comercios/perfil` (Dueño) |
| `js/perfil-cuenta.js` | al guardar los datos personales actualiza el nombre de la sesión |
| `js/cliente.js` | al abrir el perfil sincroniza el nombre de la sesión (completa las sesiones iniciadas antes del cambio) |
| `js/comercio-corregir.js` | al reenviar la solicitud actualiza el nombre con el del representante |

## Consultas extra eliminadas

1. `GET /clientes/perfil` en el pie de la barra lateral del Empleado (escritorio).
2. `GET /comercios/perfil` en el pie de la barra lateral del Dueño (escritorio).
3. `GET /clientes/perfil` solo para el saludo del catálogo del Cliente (móvil y escritorio).

## Pruebas

| Archivo | Qué cubre |
|---|---|
| `LoginNombreDePilaHttpIntegrationTest` | contrato del login por rol, ausencia, errores, reactivación y foto |
| `testing/playwright/tests/136-saludo-nombre-de-pila-ui.spec.ts` (móvil, 390 px) | respuesta del login, login por pantalla, saludo del Dueño, del Empleado y del Cliente, sin nombre, nombre largo, HTML, sincronización al editar el perfil |
| `testing/playwright/tests/137-escritorio-pie-lateral-nombre-ui.spec.ts` (`@escritorio`, 1440 px) | pie con nombre, sin consultas extra (red interceptada), sin nombre, nombre largo, HTML |
| `120`, `27` (actualizados) | el saludo ahora lleva el nombre de la sesión |
| `postman` carpeta `94` (`scripts/build-login-nombre-tramoB1-postman.mjs`) | el login de Cliente y Dueño, campos exactos, sin nombre en el token ni en errores, nombre actualizado tras editar el perfil |
