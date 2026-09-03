# Mapeo de archivos — Fix: mensaje incorrecto al ingresar una contraseña nueva corta (Cliente y Comercio)

## Contexto

Bug confirmado en dos tramos separados de Playwright (`docs/MAPEO-ARCHIVOS-TRAMO-PLAYWRIGHT-MATRIZ-COMERCIO.md`
y el spec `testing/playwright/tests/14-perfil-comercio.spec.ts`, líneas 122-127): al cambiar la
contraseña en el perfil (tanto Cliente como Comercio) con un valor de menos de 8 caracteres, el
mecanismo genérico de validación silenciosa (`validarCamposSilencioso`, `frontend/js/validators.js`
líneas 218-232) usa `input.checkValidity()` como *fallback* cuando el campo no tiene un `validador`
custom explícito — que es el caso de `password-nueva` en ambos formularios (`js/cliente.js` línea
297, `js/comercio.js` línea 1032, ambos con solo `{ inputId, errorId, mensaje }`, sin `validador`).

`checkValidity()` evalúa **todas** las restricciones nativas del `<input>`, incluido el atributo
HTML `minlength="8"` que ambos inputs de contraseña nueva tenían. El resultado práctico: con una
contraseña corta (ej. `"abc"`), `checkValidity()` da `false` por el `minlength`, y
`validarCamposSilencioso` corta ahí — muestra el `mensaje` genérico pasado explícitamente
(`"Ingresá una nueva contraseña."`), el mismo mensaje que se ve con el campo **vacío**, en vez de
llegar nunca al chequeo real de complejidad (`esPasswordSegura()`, mayúscula + minúscula + número)
que sí corre unas líneas más abajo en el handler de `submit`. El usuario que escribe una contraseña
corta y débil nunca ve el mensaje que realmente le dice qué le falta.

Confirmado que el `<form>` de ambas pantallas ya tiene `novalidate` (`perfil.html` línea 102,
`comercio-perfil.html` línea 165), así que no es el navegador mostrando su propio tooltip nativo en
el submit — es el propio código de la app, vía `checkValidity()`, disparando por el `minlength` antes
de que el validador de complejidad tenga oportunidad de correr. Mismo patrón, mismo bug, en los dos
archivos — confirmado por auditoría antes de tocar nada.

## Archivos modificados

- [frontend/perfil.html](../frontend/perfil.html) — línea 116: se quitó `minlength="8"` del input
  `#password-nueva` (Cliente). Queda `required` (el campo sigue sin poder estar vacío), sin
  `minlength` — la longitud mínima pasa a evaluarla únicamente `esPasswordSegura()` (JS), que ya
  corre después de `validarCamposSilencioso` en el handler de `submit` (`js/cliente.js` líneas
  304-308).
- [frontend/comercio-perfil.html](../frontend/comercio-perfil.html) — línea 179: mismo cambio, mismo
  input, mismo criterio (Comercio).

Ningún otro atributo ni ningún otro campo de ninguno de los dos formularios fue tocado. No se tocó
`validarCamposSilencioso` (mecanismo genérico, compartido por muchos otros campos del proyecto — el
prompt de la sesión pedía explícitamente no tocarlo de forma amplia por este caso puntual) ni
`js/cliente.js`/`js/comercio.js` (la lógica de `esPasswordSegura()` ya era correcta, el problema era
exclusivamente que nunca llegaba a ejecutarse para un valor no vacío pero corto).

## Por qué esta opción y no la otra

El prompt de la sesión ofrecía dos caminos: quitar `minlength` del HTML, o reordenar la validación
para que el validador custom corra antes que `checkValidity()`. Se eligió la primera — es la que no
requiere tocar `validarCamposSilencioso` (compartido por decenas de otros campos en `cliente.js`,
`comercio.js` y otros archivos del proyecto), y el campo ya tenía su propia fuente de verdad de
longitud/complejidad en `esPasswordSegura()`, que no depende en nada del atributo HTML que se quitó.

## Verificación (navegador real, backend real, perfil `test` contra `bajonea_test`)

**Preparación:** `bajonea_test` reseteada a estado limpio (`npm run test:reset` en
`testing/playwright/`), backend levantado a mano con `./mvnw spring-boot:run
-Dspring-boot.run.profiles=test` (puerto 8080). No hicieron falta variables de entorno explícitas —
`DB_USER`/`DB_PASSWORD` caen a los defaults de `application-test.properties` (`root`/vacío, MySQL de
XAMPP sin password) y `jwt.secret` cae al default hardcodeado en `application.properties`.

**Cuentas de prueba:** un Cliente (`cliente.fixpw.1788475931@bajonea.test`) y un Comercio
(`comercio.fixpw.1788476007@bajonea.test`, aprobado vía `admin@bajonea.ar` con la contraseña
conocida fijada por el flujo real de recuperación — mismo mecanismo que ya usa
`testing/playwright/tests/helpers/backend.ts::fijarPasswordAdminYLoguear`), registrados vía API real
(`POST /auth/registro/cliente` y `/auth/registro/comercio`, foto de perfil de Comercio subida de
verdad a Cloudinary con la firma de pre-registro) y verificados con el bypass real de
`GET /api/v1/test/token` (perfil `test`).

**Cliente (`perfil.html`), los 3 casos pedidos:**

1. Contraseña nueva `"abc"` (< 8 caracteres) → mensaje visible: *"Debe tener mínimo 8 caracteres,
   una mayúscula, una minúscula y un número."* (el mensaje real de complejidad de la app, no el
   genérico de campo vacío ni ningún cartel nativo del navegador).
2. Contraseña nueva `"password"` (8 caracteres, todo minúsculas) → mismo mensaje de complejidad,
   sin regresión.
3. Contraseña nueva `"NuevaPass123"` (válida) → formulario aceptado, redirige a
   `login.html?passwordActualizada=1`, login posterior con la contraseña nueva confirmado exitoso
   (200, token real emitido).

**Comercio (`comercio-perfil.html`), los mismos 3 casos, mismo resultado:**

1. `"abc"` → mensaje de complejidad correcto.
2. `"password"` → mismo mensaje, sin regresión.
3. `"NuevaPassComercio123"` → aceptada, redirige a login, login posterior con la contraseña nueva
   confirmado exitoso.

**Regresión sobre otro campo de la misma pantalla:** en `comercio-perfil.html`, formulario "Editar
datos del comercio", se vació el campo `nombre` y se envió — el backend no persistió el cambio
(`GET /comercios/perfil` posterior siguió devolviendo `"Comercio Fixpw"`, el nombre original), sin
relación con el fix de esta sesión (no se tocó ningún atributo de ese campo). El formulario de
contraseña (único tocado) no comparte código con el de datos del comercio salvo la función genérica
`validarCamposSilencioso`, que tampoco fue modificada.

## Limpieza de datos de prueba

Los 2 usuarios de prueba (`id=3` Cliente, `id=4` Comercio/Dueño) y todas sus filas relacionadas
(`persona`, `persona_fisica`, `cliente`, `dueno`, `comercio`, `direccion`, `horario`, `red_social`,
`sesion`, `token`) eliminados directo por SQL contra `bajonea_test` al cerrar la verificación.
Confirmado con `SELECT COUNT(*) FROM usuario WHERE email LIKE '%fixpw%'` → `0`, y los mismos conteos
en `cliente`/`comercio` → `0`. Backend de test (perfil `test`, proceso Java iniciado por esta sesión)
detenido al finalizar — comparte el puerto 8080 con el backend de desarrollo (`bajonea_final`), solo
uno de los dos puede estar levantado a la vez.

## Pendiente

Commit de este fix **no incluido** en esta sesión — autorizado explícitamente solo para la Parte A
del prompt (Playwright). Queda pendiente de que Diego lo autorice en una sesión posterior.
