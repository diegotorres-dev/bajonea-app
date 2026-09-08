import { test, expect } from '@playwright/test';
import {
  obtenerLocalidadRioGrande,
  registrarComercio,
  registrarYVerificarComercio,
  registrarYVerificarCliente,
  fijarPasswordAdminYLoguear,
  buscarComercioPendientePorEmail,
  sufijoUnico,
  diaDeHoy,
  ADMIN_EMAIL,
  ADMIN_PASSWORD_CONOCIDA,
} from './helpers/backend';

async function loginAdminUi(page: import('@playwright/test').Page) {
  await page.goto('/login.html');
  await page.getByTestId('input-email').fill(ADMIN_EMAIL);
  await page.getByTestId('input-password').fill(ADMIN_PASSWORD_CONOCIDA);
  await page.getByTestId('btn-ingresar').click();
  await page.waitForURL('**/admin-dashboard.html');
}

// admin@bajonea.ar es una cuenta compartida entre specs -- este archivo corre con --workers=1
// (ver README.md) para evitar una carrera real con el spec 07, que también resetea su
// contraseña vía el flujo real de recuperación (fijarPasswordAdminYLoguear).
test.describe('Aprobación y rechazo de Comercio (Administrador)', () => {
  test.beforeAll(async ({ request }) => {
    await fijarPasswordAdminYLoguear(request);
  });

  test('un comercio recién registrado aparece pendiente de aprobación con sus datos reales', async ({ page, request }) => {
    const localidadId = await obtenerLocalidadRioGrande(request);
    const suf = sufijoUnico();
    const comercio = await registrarComercio(request, localidadId, {
      nombre: `Comercio Pendiente E2E ${suf}`,
      horarios: [{ diaSemana: diaDeHoy(), horaApertura: '09:00', horaCierre: '20:00' }],
    });

    const adminSesion = await fijarPasswordAdminYLoguear(request);
    const pendiente = await buscarComercioPendientePorEmail(request, adminSesion.token, comercio.email);

    await loginAdminUi(page);
    await page.goto('/admin-comercios-pendientes.html');

    await expect(page.getByTestId(`comercio-pendiente-item-${pendiente.id}`)).toBeVisible();
    await expect(page.getByTestId(`comercio-pendiente-item-${pendiente.id}`)).toContainText(comercio.nombre);

    await page.getByTestId(`btn-ver-solicitud-${pendiente.id}`).click();
    await page.waitForURL(new RegExp(`admin-comercio-detalle\\.html\\?id=${pendiente.id}$`));

    await expect(page.getByTestId('detalle-comercio-pendiente')).toContainText(comercio.nombre);
    await expect(page.getByTestId('detalle-comercio-pendiente')).toContainText(comercio.email);
    await expect(page.getByTestId('btn-aprobar-comercio')).toBeVisible();
    await expect(page.getByTestId('btn-rechazar-comercio')).toBeVisible();
  });

  test('el admin aprueba un comercio: pasa a la lista de aprobados y el comercio recibe la notificación real', async ({
    page,
    request,
  }) => {
    const localidadId = await obtenerLocalidadRioGrande(request);
    const suf = sufijoUnico();
    const comercio = await registrarYVerificarComercio(request, localidadId, {
      nombre: `Comercio Aprobar E2E ${suf}`,
      horarios: [{ diaSemana: diaDeHoy(), horaApertura: '09:00', horaCierre: '20:00' }],
    });

    const adminSesion = await fijarPasswordAdminYLoguear(request);
    const pendiente = await buscarComercioPendientePorEmail(request, adminSesion.token, comercio.email);

    await loginAdminUi(page);
    await page.goto(`/admin-comercio-detalle.html?id=${pendiente.id}`);

    const resolverResponse = page.waitForResponse(
      (res) => res.url().endsWith(`/administrador/comercios/${pendiente.id}/resolver`) && res.request().method() === 'PUT',
    );
    await page.getByTestId('btn-aprobar-comercio').click();
    await expect(page.getByTestId('modal-confirmar-aprobacion')).toBeVisible();
    await page.getByTestId('btn-confirmar-aprobacion').click();
    const respuesta = await resolverResponse;
    expect(respuesta.status()).toBe(200);
    const bodyRequest = respuesta.request().postDataJSON();
    expect(bodyRequest.aprobar).toBe(true);

    // El redirect post-resolución agrega "?comercioResuelto=1" -- el patrón sin comodín final
    // no matcheaba esa query string y el waitForURL colgaba hasta el timeout.
    await page.waitForURL('**/admin-comercios-pendientes.html*');
    await expect(page.getByTestId(`comercio-pendiente-item-${pendiente.id}`)).toHaveCount(0);

    await page.goto('/admin-comercios.html');
    await expect(page.getByTestId(`comercio-admin-item-${pendiente.id}`)).toBeVisible();

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
    await expect(notificacion).toContainText('Tu comercio fue aprobado');
  });

  test('el admin rechaza un comercio con motivo: el comercio recibe la notificación con el motivo real', async ({
    page,
    request,
  }) => {
    const localidadId = await obtenerLocalidadRioGrande(request);
    const suf = sufijoUnico();
    const comercio = await registrarYVerificarComercio(request, localidadId, {
      nombre: `Comercio Rechazar E2E ${suf}`,
      horarios: [{ diaSemana: diaDeHoy(), horaApertura: '09:00', horaCierre: '20:00' }],
    });
    const motivo = `No cumple con los requisitos de zona de cobertura (motivo E2E ${suf})`;

    const adminSesion = await fijarPasswordAdminYLoguear(request);
    const pendiente = await buscarComercioPendientePorEmail(request, adminSesion.token, comercio.email);

    await loginAdminUi(page);
    await page.goto(`/admin-comercio-detalle.html?id=${pendiente.id}`);

    await page.getByTestId('btn-rechazar-comercio').click();
    await expect(page.getByTestId('modal-rechazar-comercio')).toBeVisible();
    await expect(page.getByTestId('btn-confirmar-rechazo-comercio')).toBeDisabled();
    await page.getByTestId('input-motivo-rechazo-comercio').fill(motivo);
    await expect(page.getByTestId('btn-confirmar-rechazo-comercio')).toBeEnabled();

    const resolverResponse = page.waitForResponse(
      (res) => res.url().endsWith(`/administrador/comercios/${pendiente.id}/resolver`) && res.request().method() === 'PUT',
    );
    await page.getByTestId('btn-confirmar-rechazo-comercio').click();
    const respuesta = await resolverResponse;
    expect(respuesta.status()).toBe(200);
    const bodyRequest = respuesta.request().postDataJSON();
    expect(bodyRequest.aprobar).toBe(false);
    expect(bodyRequest.motivo).toBe(motivo);

    // El redirect post-resolución agrega "?comercioResuelto=1" -- el patrón sin comodín final
    // no matcheaba esa query string y el waitForURL colgaba hasta el timeout.
    await page.waitForURL('**/admin-comercios-pendientes.html*');
    await expect(page.getByTestId(`comercio-pendiente-item-${pendiente.id}`)).toHaveCount(0);

    await page.goto('/login.html');
    await page.getByTestId('input-email').fill(comercio.email);
    await page.getByTestId('input-password').fill(comercio.password);
    await page.getByTestId('btn-ingresar').click();
    await page.waitForURL('**/comercio-rechazado.html');
    await expect(page.getByTestId('email-usuario-rechazado')).toHaveText(comercio.email);

    await page.goto('/notificaciones.html');
    const notificacion = page.locator('[data-testid^="notificacion-item-"]').first();
    await expect(notificacion).toContainText('fue rechazado');
    await expect(notificacion).toContainText(motivo);
  });

  test('acceder a las pantallas de aprobación de comercios sin rol Administrador redirige a login', async ({ page, request }) => {
    const localidadId = await obtenerLocalidadRioGrande(request);
    const cliente = await registrarYVerificarCliente(request, localidadId);

    await page.goto('/login.html');
    await page.getByTestId('input-email').fill(cliente.email);
    await page.getByTestId('input-password').fill(cliente.password);
    await page.getByTestId('btn-ingresar').click();
    await page.waitForURL('**/index.html');

    await page.goto('/admin-dashboard.html');
    await page.waitForURL('**/login.html');

    await page.goto('/admin-comercios-pendientes.html');
    await page.waitForURL('**/login.html');

    await page.goto('/admin-comercio-detalle.html?id=1');
    await page.waitForURL('**/login.html');
  });
});
