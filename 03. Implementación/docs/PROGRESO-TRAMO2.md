# Progreso del Tramo 2 (entrega A)

Plan: `docs/PLAN-FASE1-REGISTRO-TRAMO2.md`. Una linea por bloque.

| Bloque | Estado | Verificado |
|---|---|---|
| A1 Migracion V37 | hecho | V37 aplicada por reset de bajonea_test: columna STORED y UNIQUE presentes, flyway 37 success |
| A2 Validacion global del nombre | hecho | NombreComercioService en registro, alta adicional (via crearComercio), correccion y perfil; ValidadorComercioDuplicado borrado |
| A3 Handler del indice y flush | hecho | handler mapea uq_comercio_nombre_unico a 409; saveAndFlush en perfil y edicion; carrera 2..12 simultaneos en Java sin Deadlock |
| A4 Endpoints de disponibilidad y rate limit | hecho | 2 endpoints, grupo disponibilidad (30/min, 1000 en test) compartido con nombre de usuario; 429 probado en Java |
| A5 Tests Java | hecho | 899 tests en la pasada 1 y 6 en la 2 (ver corrida 1) |
| A6 Barrido de nombres de prueba | hecho (confirmado con Newman, Playwright y estreses) | colección regenerada con los builders matriz, 2a y 3a (solo cambiaron las carpetas 33-39, 41, 50 y 51); literales de specs 09, 21, 22 y 24 y estrés 2a con marca de corrida |
| A7 Pruebas nuevas (Playwright API y Newman) | hecho | specs 65 y 66 en verde; carpetas 71 (55 requests) y 72 (62 requests) en verde en Newman completo |
| A8 Estres nuevo | hecho | stress-locks-tramoNombreUnico.mjs (5 escenarios) registrado en correr-estreses.mjs como 'nombre'; OK en el runner completo y con 15 rondas del escenario 1 |
| A9 Verificacion final y mutaciones | hecho | corridas pesadas en este orden, una sola vez cada una: (1) mvnw test en dos pasadas, (2) Newman completo desde base reseteada, (3) Playwright de API, (4) estreses completos, (5) mutaciones. Cada resultado se anota abajo |

## Corridas de A9 (se completa a medida que terminan)

| Corrida | Estado | Resultado |
|---|---|---|
| 1. mvnw test, pasada 1 y 2 | hecho | pasada 1: 899 tests, 1 error (PedidoAutoconfirmadoEquipoIntegrationTest, DNI aleatorio repetido del propio generador del test; pasa 11/11 al repetirlo solo); pasada 2: 6/6; 0 Deadlock found |
| 2. Newman completo | hecho | 2da corrida desde base reseteada: 3394 requests, 5307 assertions, 0 fallas (la 1ra tuvo 140 fallas por una URL de foto con espacios en mis builders 71/72, corregido) |
| 3. Playwright de API | hecho | 27 specs (470 tests): 468 pasaron en la corrida; 2 fallos: 51:151 (intermitente, subida real a Cloudinary; pasa al repetirlo) y 66:46 (mi test: el nombre con Ñ se sembraba por SQL con mala codificacion; corregido a registro por API); repetidos 51+65+66: 32/32 |
| 4. Estreses completos | hecho | 18 de 19 OK en el runner (149 min), incluido el nuevo 'nombre'; 'carrito' falla en el runner por requisito de entorno (backend con MERCADOPAGO_API_BASE_URL al stub y una categoria sembrada) y OK (88 s) al repetirlo con ese entorno; 0 Deadlock found y 0 Lock wait timeout |
| 5. Mutaciones | hecho | M1 a M9 hacen fallar su test (ver el informe); M4 no mordia y se agrego un test; M8 se rehizo porque la primera version fallaba por NPE |

Para retomar: el entorno de pruebas se prepara con `bash testing/playwright/scripts/preparar-entorno-test.sh` (resetea bajonea_test, levanta backend y frontend). Las contraseñas de prueba no se anotan aca.
