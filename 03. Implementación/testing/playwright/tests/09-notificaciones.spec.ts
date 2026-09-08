import { test, expect } from '@playwright/test';
import {
  obtenerLocalidadRioGrande,
  registrarYVerificarComercio,
  fijarPasswordAdminYLoguear,
  buscarComercioPendientePorEmail,
  resolverComercio,
  diaDeHoy,
} from './helpers/backend';

// Camino más corto real (sin mockear filas) para tener una notificación in-app sin correr el
// flujo completo de pedido (spec 05, todavía no escrito): AdministradorService.resolverAprobacion
// dispara notificacionService.crear(...) directo sobre el usuario del Comercio al aprobar o
// rechazar -- 2 llamadas API (registro de comercio + resolución de Administrador) contra
// 1 notificación real, sin pasar por carrito/producto/pedido. Ver PedidoService para la otra
// fuente de notificaciones (nuevo pedido / aceptado / rechazado), que sí depende de ese flujo
// completo y queda para el spec 05.
test.describe('Notificaciones in-app', () => {
  test('el comercio ve la notificación real de aprobación en la campana y puede marcarla como leída', async ({
    page,
    request,
  }) => {
    const localidadId = await obtenerLocalidadRioGrande(request);
    const comercio = await registrarYVerificarComercio(request, localidadId, {
      nombre: 'Comercio Notificaciones E2E',
      horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
    });

    const adminSesion = await fijarPasswordAdminYLoguear(request);
    const pendiente = await buscarComercioPendientePorEmail(request, adminSesion.token, comercio.email);
    await resolverComercio(request, adminSesion.token, pendiente.id, true);

    await page.goto('/login.html');
    await page.getByTestId('input-email').fill(comercio.email);
    await page.getByTestId('input-password').fill(comercio.password);
    await page.getByTestId('btn-ingresar').click();
    await page.waitForURL('**/comercio-dashboard.html');

    const campana = page.getByTestId('btn-notificaciones');
    await expect(campana.getByTestId('contador-notificaciones')).toHaveText('1');

    await campana.click();
    await page.waitForURL('**/notificaciones.html');

    const notificacion = page.locator('[data-testid^="notificacion-item-"]').first();
    await expect(notificacion).toBeVisible();
    await expect(notificacion).toContainText('Tu comercio fue aprobado');
    await expect(notificacion).not.toHaveClass(/notification-item--leida/);

    const marcarLeidaResponse = page.waitForResponse(
      (res) => /\/notificaciones\/\d+\/leida$/.test(res.url()) && res.request().method() === 'PUT',
    );
    await notificacion.click();
    await marcarLeidaResponse;

    await expect(notificacion).toHaveClass(/notification-item--leida/);
  });
});
