# Mapeo de archivos — Login por nombre de usuario, split real de MercadoPago y cierre de testing (documentación, 2026-09-25)

Sin commitear. Este archivo mapea los archivos que tocaron los tramos ya implementados (según `git status` al 2026-09-25) y los documentos que se actualizaron a posteriori. Decisiones en `docs/DECISIONES.md`, entradas del 2026-09-25.

## Backend

| Archivo | Cambio | Tramo |
|---|---|---|
| `db/migration/V19__usuario_nombre_usuario.sql` (nuevo) | `usuario.nombre_usuario` (`utf8mb4_bin`, `UNIQUE`, `CHECK` de minúsculas), asignación a las 17 cuentas existentes, cierre de sesiones activas | Login |
| `db/migration/V20__agregar_hamburgueseria_a_tipo_comercio.sql` (nuevo) | `HAMBURGUESERIA` en `comercio.tipo_comercio` | Ajuste |
| `db/migration/V21__crear_historial_cambio_nombre_usuario.sql` (nuevo) | Tabla `historial_cambio_nombre_usuario` | Usuario editable |
| `db/migration/V22__alerta_webhook_mp_split_no_aplicado.sql` (nuevo) | `SPLIT_NO_APLICADO`, `monto_esperado`, `monto_capturado` en `alerta_webhook_mp` | Split |
| `validation/NombreUsuarioPolicy.java`, `validation/annotations/ValidarNombreUsuario.java`, `validation/validators/NombreUsuarioValidator.java` (nuevos) | Política única del nombre de usuario y su anotación | Login |
| `entities/Usuario.java`, `repositories/UsuarioRepository.java` | Campo `nombreUsuario`, búsquedas por nombre de usuario | Login |
| `entities/HistorialCambioNombreUsuario.java`, `repositories/HistorialCambioNombreUsuarioRepository.java` (nuevos) | Auditoría de cambios de nombre de usuario | Usuario editable |
| `dto/request/LoginRequestDTO.java`, `RegistroClienteRequestDTO.java`, `RegistroComercioRequestDTO.java`, `CambiarNombreUsuarioRequestDTO.java` (nuevo) | Login y registro por nombre de usuario; cambio con contraseña actual | Login / Usuario editable |
| `dto/response/DisponibilidadNombreUsuarioResponseDTO.java` (nuevo), `ClienteResponseDTO.java` | Respuesta del endpoint de disponibilidad; el perfil del Cliente expone el nombre de usuario | Login |
| `services/AuthService.java`, `RegistroService.java`, `ClienteService.java` | Login por nombre de usuario, mensaje genérico, disponibilidad, `cambiarNombreUsuario` (3 cambios / 30 días, bloqueo por 3 intentos) | Login / Usuario editable |
| `config/security/JwtService.java`, `JwtAuthenticationFilter.java`, `AuthenticatedUser.java`, `SecurityConfig.java` | `sub` del JWT = id de usuario; `/auth/nombre-usuario/disponibilidad` pública | Login |
| `controllers/AuthController.java`, `ClienteController.java` | `GET /auth/nombre-usuario/disponibilidad`, `PUT /clientes/perfil/nombre-usuario` | Login / Usuario editable |
| `services/MercadoPagoPagoService.java`, `AlertaWebhookMpService.java`, `entities/AlertaWebhookMp.java`, `enums/MotivoAlertaWebhookMp.java` | `marketplace_fee` en la preferencia; verificación por `fee_details`; alerta `SPLIT_NO_APLICADO` | Split |
| `config/MercadoPagoConfig.java` | WARN al arrancar sin `MERCADOPAGO_TEST_TOKEN` | es_cuenta_prueba |
| `services/PedidoService.java`, `CarritoService.java`, `dto/response/PedidoResponseDTO.java`, `CarritoResponseDTO.java` | Cargo de servicio expuesto; "Facturado hoy" neto (`subtotal - cargoServicioComercio`) | Split / UI |
| `controllers/TestController.java`, `services/TestSupportService.java` | `PUT /test/pedidos/{id}/pago-aprobado` (`@Profile("test")`) | Testing |
| `enums/TipoComercio.java`, `exceptions/GlobalExceptionHandler.java`, `backend/run-local.ps1` (nuevo) | `HAMBURGUESERIA`; modificaciones menores del manejo de excepciones; script de arranque local | Varios |

## Frontend

| Archivo | Cambio |
|---|---|
| `login.html`, `js/auth.js` | Campo "Usuario" (placeholder "Usuario"); aviso "Cuidado: si fallás una vez más…" |
| `registro-cliente.html`, `registro-comercio.html`, `js/validators.js` | Campo de nombre de usuario con ícono de disponibilidad en vivo (spinner / verde / rojo) |
| `verificar-email.html` | Dos modos: con `?email=` o sin él (pide el email como paso previo) |
| `perfil.html`, `js/cliente.js` | Edición del nombre de usuario con modal de confirmación de contraseña; texto de ayuda del límite de cambios |
| `js/carrito.js`, `js/checkout.js`, `js/pedidos.js` | Línea "Cargo por servicio" (carrito, paso 3 del checkout, detalle de pedido; no en el paso 4) |
| `js/comercio.js` | "Cargo por servicio (1%)" y total neto en el detalle de pedido; aviso de bloqueo en el cambio de contraseña |
| `css/styles.css` | Modificado en los tramos (estilos de los formularios y avisos nuevos) |

## Testing

| Archivo | Cambio |
|---|---|
| `testing/playwright/tests/19-nombre-usuario.spec.ts` (nuevo) | 38 tests del login por nombre de usuario, disponibilidad, registro y perfil |
| `testing/playwright/tests/01`-`18` | Login por nombre de usuario; specs 05 y 16 con confirmación de pago vía `pago-aprobado` |
| `testing/playwright/tests/helpers/backend.ts`, `scripts/reset-db.mjs`, `scripts/build-matriz-*.mjs`, `scripts/matriz-comercio-runner.mjs` | Helpers y seeds adaptados al login por nombre de usuario (`adminbajonea`) |
| `testing/playwright/playwright.config.ts`, `README.md` | `workers: 1` permanente; 137 tests en 19 specs; precondición de Newman; endpoints de test (esta tarea) |
| `postman/Bajonea-MVP.postman_collection.json`, `Bajonea-Local.postman_environment.json` | Colección adaptada; requests desbloqueados con `pago-aprobado` (793 definidos / 799 ejecutados) |

## Documentación (esta tarea)

Backups en `docs/_backups/2026-09-25-antes-de-actualizacion/` (nombre = ruta con `__`).

| Archivo | Cambio |
|---|---|
| `CLAUDE.md` | JWT `sub`, endpoints públicos, entidad 24, párrafo del tramo, fila 17, pendientes |
| `docs/DECISIONES.md` | 6 entradas nuevas (2026-09-25) |
| `docs/diccionario-de-datos.md` y su copia en `02. Diseño/…/03. Diccionario de Datos/` | v1.6 → v1.7 |
| `docs/MERCADOPAGO-BAJONEA-FINAL.md` | Sección "Split implementado y verificado" |
| `docs/APRENDIZAJES-TECNICOS.md` (nuevo) | `es_cuenta_prueba`, `fee_details`, Newman, `workers: 1`, `node --check` |
| `docs/recorrido-trabajo-final.md`, `docs/mvp-terminado.md` | Notas de estado |
| `01. Análisis de Requerimientos/` | Requisitos generales, cliente, dueño, comercio, sistema, no funcionales; HU-C01, HU-C17 (nueva) y HU-D01; `alcance-y-limitaciones.md` |
| `02. Diseño/` Mermaid ER y relacional | `nombre_usuario`, `HistorialCambioNombreUsuario`, columnas de `AlertaWebhookMp` |

## Pendiente para Diego

- Regenerar el PNG del DFD Nivel 2 "Inicio de Sesión" (`02. Diseño/01. Diagramas de Flujo/…/Autenticación y Seguridad/05. Inicio de Sesión - DFD - Nivel 2.png`) y los PNG de ER y relacional.
- Confirmar el cierre de los tramos (nada se marcó ✅ en `CLAUDE.md`).
- Commitear: `docs/` está en `.gitignore`, por lo que los cambios de `docs/` no aparecen en `git status` (los backups sí sirven de respaldo).
