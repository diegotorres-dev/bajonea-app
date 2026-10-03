import { test, expect } from '@playwright/test';
import {
  apiGet,
  login,
  obtenerLocalidadRioGrande,
  registrarComercio,
  registrarYVerificarComercio,
  registrarYVerificarCliente,
  fijarPasswordAdminYLoguear,
  buscarComercioPendientePorEmail,
  sufijoUnico,
  diaDeHoy,
  ADMIN_EMAIL,
  ADMIN_USUARIO,
  ADMIN_PASSWORD_CONOCIDA,
} from './helpers/backend';

async function loginAdminUi(page: import('@playwright/test').Page) {
  await page.goto('/login.html');
  await page.getByTestId('input-nombre-usuario').fill(ADMIN_USUARIO);
  await page.getByTestId('input-password').fill(ADMIN_PASSWORD_CONOCIDA);
  await page.getByTestId('btn-ingresar').click();
  await page.waitForURL('**/admin-dashboard.html');
}

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

    await page.waitForURL('**/admin-comercios-pendientes.html*');
    await expect(page.getByTestId(`comercio-pendiente-item-${pendiente.id}`)).toHaveCount(0);

    await page.goto('/admin-comercios.html');
    await expect(page.getByTestId(`comercio-admin-item-${pendiente.id}`)).toBeVisible();

    await page.goto('/login.html');
    await page.getByTestId('input-nombre-usuario').fill(comercio.nombreUsuario);
    await page.getByTestId('input-password').fill(comercio.password);
    await page.getByTestId('btn-ingresar').click();
    await page.waitForURL('**/comercio-dashboard.html');

    const campana = page.getByTestId('btn-notificaciones');
    await expect(campana.getByTestId('contador-notificaciones')).toHaveText('1');
    await campana.click();
    await page.waitForURL('**/notificaciones.html');
    const notificacion = page.locator('[data-testid^="notificacion-item-"]').first();
    await expect(notificacion).toContainText(`Tu comercio ${comercio.nombre} fue aprobado`);
    await expect(notificacion).not.toContainText('ya podés vender');
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
    await expect(page.getByTestId('nombre-comercio-rechazo')).toHaveText(comercio.nombre);
    await expect(page.getByTestId('switch-rechazo-definitivo')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('aviso-ultimo-intento')).toBeHidden();
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
    expect(bodyRequest.definitivo).toBe(false);

    await page.waitForURL('**/admin-comercios-pendientes.html*');
    await expect(page.getByTestId(`comercio-pendiente-item-${pendiente.id}`)).toHaveCount(0);

    await page.goto('/login.html');
    await page.getByTestId('input-nombre-usuario').fill(comercio.nombreUsuario);
    await page.getByTestId('input-password').fill(comercio.password);
    await page.getByTestId('btn-ingresar').click();
    await page.waitForURL('**/comercio-rechazado.html?id=*');
    await expect(page.getByTestId('motivo-rechazo-comercio')).toBeVisible();
    await expect(page.getByTestId('motivo-rechazo-comercio')).toContainText(motivo);
    await expect(page.getByTestId('texto-correccion')).toHaveText('Podés corregir los datos y volver a solicitarla. Te quedan 3 intentos.');
    await expect(page.getByTestId('btn-corregir-solicitud')).toBeVisible();
    await expect(page.getByTestId('btn-cerrar-sesion')).toBeVisible();

    const sesionComercio = await login(request, comercio.nombreUsuario, comercio.password);
    const notificaciones = await apiGet(request, '/notificaciones', sesionComercio.token);
    expect(notificaciones.status).toBe(200);
    expect(notificaciones.body.data[0].mensaje).toContain('fue rechazado');
    expect(notificaciones.body.data[0].mensaje).toContain(motivo);
  });

  test('acceder a las pantallas de aprobación de comercios sin rol Administrador redirige a login', async ({ page, request }) => {
    const localidadId = await obtenerLocalidadRioGrande(request);
    const cliente = await registrarYVerificarCliente(request, localidadId);

    await page.goto('/login.html');
    await page.getByTestId('input-nombre-usuario').fill(cliente.nombreUsuario);
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
