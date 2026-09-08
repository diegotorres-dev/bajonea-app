import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  obtenerLocalidadRioGrande,
  registrarComercio,
  registrarYVerificarComercio,
  registrarYVerificarCliente,
  fijarPasswordAdminYLoguear,
  buscarComercioPendientePorEmail,
  buscarClienteAdminPorEmail,
  resolverComercio,
  crearCategoria,
  crearTag,
  login,
  eliminarTodasLasRedesSociales,
  sufijoUnico,
  diaDeHoy,
  ADMIN_EMAIL,
  ADMIN_PASSWORD_CONOCIDA,
} from './helpers/backend';

async function loginAdminUi(page: Page) {
  await page.goto('/login.html');
  await page.getByTestId('input-email').fill(ADMIN_EMAIL);
  await page.getByTestId('input-password').fill(ADMIN_PASSWORD_CONOCIDA);
  await page.getByTestId('btn-ingresar').click();
  await page.waitForURL('**/admin-dashboard.html');
}

function horarioAbierto24hs() {
  return [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
}

test.describe('Validaciones exhaustivas de Administrador (Fase 4, Playwright)', () => {
  test.beforeAll(async ({ request }) => {
    await fijarPasswordAdminYLoguear(request);
  });

  test.describe('Aprobación / rechazo de Comercio', () => {
    test('el motivo de rechazo respeta el límite de 500 caracteres, el contador se actualiza en vivo y el botón de confirmar se habilita/deshabilita según el contenido', async ({
      page,
      request,
    }) => {
      const localidadId = await obtenerLocalidadRioGrande(request);
      const comercio = await registrarComercio(request, localidadId, {
        nombre: `Comercio Motivo Boundary E2E ${sufijoUnico()}`,
        horarios: horarioAbierto24hs(),
      });
      const adminSesion = await fijarPasswordAdminYLoguear(request);
      const pendiente = await buscarComercioPendientePorEmail(request, adminSesion.token, comercio.email);

      await loginAdminUi(page);
      await page.goto(`/admin-comercio-detalle.html?id=${pendiente.id}`);
      await page.getByTestId('btn-rechazar-comercio').click();
      await expect(page.getByTestId('modal-rechazar-comercio')).toBeVisible();

      const textarea = page.getByTestId('input-motivo-rechazo-comercio');
      const confirmarBtn = page.getByTestId('btn-confirmar-rechazo-comercio');
      const contador = page.locator('#rechazo-contador');

      await expect(confirmarBtn).toBeDisabled();
      await expect(contador).toHaveText('0/500');

      const texto495 = 'a'.repeat(495);
      await textarea.fill(texto495);
      await expect(contador).toHaveText('495/500');
      await expect(confirmarBtn).toBeEnabled();

      await textarea.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('1234567890');
      await expect(textarea).toHaveValue(`${texto495}12345`);
      await expect(contador).toHaveText('500/500');
      await expect(confirmarBtn).toBeEnabled();

      await textarea.fill('');
      await expect(contador).toHaveText('0/500');
      await expect(confirmarBtn).toBeDisabled();
    });

    test('el detalle de un comercio pendiente muestra sus redes sociales reales; si dio de baja todas, muestra el estado vacío', async ({
      page,
      request,
    }) => {
      const localidadId = await obtenerLocalidadRioGrande(request);

      const conRedes = await registrarComercio(request, localidadId, {
        nombre: `Comercio Con Redes E2E ${sufijoUnico()}`,
        horarios: horarioAbierto24hs(),
      });
      const adminSesion1 = await fijarPasswordAdminYLoguear(request);
      const pendienteConRedes = await buscarComercioPendientePorEmail(request, adminSesion1.token, conRedes.email);

      await loginAdminUi(page);
      await page.goto(`/admin-comercio-detalle.html?id=${pendienteConRedes.id}`);
      const detalle = page.getByTestId('detalle-comercio-pendiente');
      await expect(detalle).toContainText('Redes Sociales');
      await expect(detalle).toContainText('Instagram');

      const sinRedes = await registrarYVerificarComercio(request, localidadId, {
        nombre: `Comercio Sin Redes E2E ${sufijoUnico()}`,
        horarios: horarioAbierto24hs(),
      });
      const comercioSesion = await login(request, sinRedes.email, sinRedes.password);
      await eliminarTodasLasRedesSociales(request, comercioSesion.token);

      const adminSesion2 = await fijarPasswordAdminYLoguear(request);
      const pendienteSinRedes = await buscarComercioPendientePorEmail(request, adminSesion2.token, sinRedes.email);

      await loginAdminUi(page);
      await page.goto(`/admin-comercio-detalle.html?id=${pendienteSinRedes.id}`);
      await expect(detalle).toContainText('Redes Sociales');
      await expect(detalle).toContainText('Sin redes sociales cargadas');
    });

    test('el detalle de un comercio ya resuelto o inexistente muestra "No encontramos esta solicitud"', async ({ page, request }) => {
      const localidadId = await obtenerLocalidadRioGrande(request);
      const comercio = await registrarComercio(request, localidadId, {
        nombre: `Comercio Ya Resuelto E2E ${sufijoUnico()}`,
        horarios: horarioAbierto24hs(),
      });
      const adminSesion = await fijarPasswordAdminYLoguear(request);
      const pendiente = await buscarComercioPendientePorEmail(request, adminSesion.token, comercio.email);
      await resolverComercio(request, adminSesion.token, pendiente.id, true);

      await loginAdminUi(page);
      await page.goto(`/admin-comercio-detalle.html?id=${pendiente.id}`);
      await expect(page.getByTestId('detalle-comercio-pendiente')).toContainText('No encontramos esta solicitud');
      await expect(page.getByTestId('btn-ver-pendientes')).toBeVisible();

      await page.goto('/admin-comercio-detalle.html?id=999999999');
      await expect(page.getByTestId('detalle-comercio-pendiente')).toContainText('No encontramos esta solicitud');

      await page.getByTestId('btn-ver-pendientes').click();
      await page.waitForURL('**/admin-comercios-pendientes.html');
    });

    test('el admin aprueba un comercio mientras el Dueño ya tiene la pantalla de espera abierta: al recargar ve el nuevo estado y la notificación real, sin un nuevo login', async ({
      browser,
      request,
    }) => {
      test.setTimeout(45000);
      const localidadId = await obtenerLocalidadRioGrande(request);
      const comercio = await registrarYVerificarComercio(request, localidadId, {
        nombre: `Comercio Cascada E2E ${sufijoUnico()}`,
        horarios: horarioAbierto24hs(),
      });

      const comercioContext = await browser.newContext();
      const adminContext = await browser.newContext();
      try {
        const comercioPage = await comercioContext.newPage();
        const adminPage = await adminContext.newPage();

        await comercioPage.goto('/login.html');
        await comercioPage.getByTestId('input-email').fill(comercio.email);
        await comercioPage.getByTestId('input-password').fill(comercio.password);
        await comercioPage.getByTestId('btn-ingresar').click();
        await comercioPage.waitForURL('**/comercio-pendiente.html');
        await expect(comercioPage.getByTestId('btn-ir-a-inicio')).toBeVisible();

        const adminSesion = await fijarPasswordAdminYLoguear(request);
        const pendiente = await buscarComercioPendientePorEmail(request, adminSesion.token, comercio.email);

        await loginAdminUi(adminPage);
        await adminPage.goto(`/admin-comercio-detalle.html?id=${pendiente.id}`);

        const resolverResponse = adminPage.waitForResponse(
          (res) => res.url().endsWith(`/administrador/comercios/${pendiente.id}/resolver`) && res.request().method() === 'PUT',
        );
        await adminPage.getByTestId('btn-aprobar-comercio').click();
        await adminPage.getByTestId('btn-confirmar-aprobacion').click();
        expect((await resolverResponse).status()).toBe(200);

        await comercioPage.reload();
        await comercioPage.waitForURL('**/comercio-dashboard.html');

        const campana = comercioPage.getByTestId('btn-notificaciones');
        await expect(campana.getByTestId('contador-notificaciones')).toHaveText('1');
      } finally {
        await comercioContext.close();
        await adminContext.close();
      }
    });
  });

  test.describe('Listado de comercios aprobados (admin-comercios.html)', () => {
    test('lista un comercio aprobado real y su modal de detalle muestra sus datos, incluidas las redes sociales', async ({
      page,
      request,
    }) => {
      const localidadId = await obtenerLocalidadRioGrande(request);
      const comercio = await registrarYVerificarComercio(request, localidadId, {
        nombre: `Comercio Listado Aprobados E2E ${sufijoUnico()}`,
        horarios: horarioAbierto24hs(),
      });
      const adminSesion = await fijarPasswordAdminYLoguear(request);
      const pendiente = await buscarComercioPendientePorEmail(request, adminSesion.token, comercio.email);
      await resolverComercio(request, adminSesion.token, pendiente.id, true);

      await loginAdminUi(page);
      await page.goto('/admin-comercios.html');
      const item = page.getByTestId(`comercio-admin-item-${pendiente.id}`);
      await expect(item).toBeVisible();
      await expect(item).toContainText(comercio.nombre);

      await page.getByTestId(`btn-ver-detalle-comercio-${pendiente.id}`).click();
      const modal = page.getByTestId('modal-detalle-comercio');
      await expect(modal).toBeVisible();
      await expect(modal).toContainText(comercio.nombre);
      await expect(modal).toContainText('Redes Sociales');
      await expect(modal).toContainText('Instagram');

      await page.getByTestId('btn-cerrar-modal-detalle-comercio').click();
      await expect(modal).toHaveCount(0);
    });
  });

  test.describe('Listado de Clientes (admin-clientes.html)', () => {
    test('lista un cliente real con su estado y sus datos correctos', async ({ page, request }) => {
      const localidadId = await obtenerLocalidadRioGrande(request);
      const cliente = await registrarYVerificarCliente(request, localidadId);
      const adminSesion = await fijarPasswordAdminYLoguear(request);
      const clienteAdmin = await buscarClienteAdminPorEmail(request, adminSesion.token, cliente.email);

      await loginAdminUi(page);
      await page.goto('/admin-clientes.html');
      const item = page.getByTestId(`cliente-item-${clienteAdmin.id}`);
      await expect(item).toBeVisible();
      await expect(item).toContainText(`${cliente.nombre} ${cliente.apellido}`);
      await expect(item).toContainText(cliente.email);
      await expect(item.getByTestId('estado-cliente')).toContainText('Activo');
    });
  });

  test.describe('Dashboard y logout de Administrador', () => {
    test('el dashboard muestra el conteo real de comercios pendientes con el texto singular/plural correcto', async ({
      page,
      request,
    }) => {
      const localidadId = await obtenerLocalidadRioGrande(request);
      await registrarComercio(request, localidadId, {
        nombre: `Comercio Dashboard Contador E2E ${sufijoUnico()}`,
        horarios: horarioAbierto24hs(),
      });

      await loginAdminUi(page);
      const metricasResponse = page.waitForResponse((res) => res.url().endsWith('/administrador/metricas'));
      await page.goto('/admin-dashboard.html');
      const metricas = (await (await metricasResponse).json()).data;
      const pendientesReales = metricas.comerciosPendientes as number;
      expect(pendientesReales).toBeGreaterThan(0);

      const textoEsperado =
        pendientesReales === 1 ? '1 solicitud de aprobación' : `${pendientesReales} solicitudes de aprobación`;
      await expect(page.locator('#alert-comercios-pendientes [data-subtitulo]')).toHaveText(textoEsperado);
      await expect(page.getByTestId('contador-comercios-pendientes')).toBeVisible();
    });

    test('cerrar sesión desde el dashboard de Administrador cierra la sesión real y redirige a login', async ({ page }) => {
      await loginAdminUi(page);
      await page.getByTestId('btn-cerrar-sesion').click();
      await expect(page.getByTestId('modal-confirmar-logout')).toBeVisible();
      await page.getByTestId('btn-confirmar-logout').click();
      await page.waitForURL('**/login.html');

      await page.goto('/admin-dashboard.html');
      await page.waitForURL('**/login.html');
    });
  });

  test.describe('Gestión de Categorías', () => {
    test('el nombre de categoría respeta el límite de 100 caracteres a nivel de input', async ({ page }) => {
      await loginAdminUi(page);
      await page.goto('/admin-categorias.html');
      await page.getByTestId('btn-crear-categoria').click();
      await expect(page.getByTestId('modal-categoria')).toBeVisible();

      const input = page.getByTestId('input-nombre-categoria');
      const texto95 = 'a'.repeat(95);
      await input.fill(texto95);
      await input.click();
      await page.keyboard.press('End');
      await page.keyboard.type('1234567890');
      await expect(input).toHaveValue(`${texto95}12345`);
    });

    test('crear una categoría con nombre vacío muestra el error sin llamar al backend; completarlo permite crearla', async ({
      page,
    }) => {
      const nombre = `Categoría Vacío E2E ${sufijoUnico()}`;

      await loginAdminUi(page);
      await page.goto('/admin-categorias.html');
      await page.getByTestId('btn-crear-categoria').click();
      await expect(page.getByTestId('modal-categoria')).toBeVisible();

      let seEnvioAlgo = false;
      const detectarEnvio = (req: import('@playwright/test').Request) => {
        if (req.url().endsWith('/categorias') && req.method() === 'POST') {
          seEnvioAlgo = true;
        }
      };
      page.on('request', detectarEnvio);
      await page.getByTestId('btn-guardar-categoria').click();
      await expect(page.getByTestId('mensaje-error-nombre-categoria')).toBeVisible();
      await expect(page.getByTestId('mensaje-error-nombre-categoria')).toContainText(
        'El nombre de la categoría es obligatorio.',
      );
      expect(seEnvioAlgo).toBe(false);
      page.off('request', detectarEnvio);

      const crearResponse = page.waitForResponse(
        (res) => res.url().endsWith('/categorias') && res.request().method() === 'POST',
      );
      await page.getByTestId('input-nombre-categoria').fill(nombre);
      await page.getByTestId('btn-guardar-categoria').click();
      const creada = await crearResponse;
      expect(creada.status()).toBe(201);
      const categoriaId = (await creada.json()).data.id as number;
      await expect(page.getByTestId(`categoria-item-${categoriaId}`)).toBeVisible();
    });

    test('editar el nombre y desactivar una categoría en el mismo guardado dispara los 2 requests (PUT + DELETE) y el resultado se refleja en el listado', async ({
      page,
      request,
    }) => {
      const adminSesion = await fijarPasswordAdminYLoguear(request);
      const nombreOriginal = `Categoría Combo E2E ${sufijoUnico()}`;
      const nombreEditado = `${nombreOriginal} Editada`;
      const categoriaId = await crearCategoria(request, adminSesion.token, nombreOriginal);

      await loginAdminUi(page);
      await page.goto('/admin-categorias.html');
      await page.getByTestId(`btn-editar-categoria-${categoriaId}`).click();
      await expect(page.getByTestId('modal-categoria')).toBeVisible();

      await page.getByTestId('input-nombre-categoria').fill(nombreEditado);
      await page.getByTestId('btn-switch-categoria-activa').click();

      const putResponse = page.waitForResponse(
        (res) => res.url().endsWith(`/categorias/${categoriaId}`) && res.request().method() === 'PUT',
      );
      const deleteResponse = page.waitForResponse(
        (res) => res.url().endsWith(`/categorias/${categoriaId}`) && res.request().method() === 'DELETE',
      );
      await page.getByTestId('btn-guardar-categoria').click();
      expect((await putResponse).status()).toBe(200);
      expect((await deleteResponse).status()).toBe(200);

      await page.getByTestId('chip-filtro-categoria-inactivas').click();
      const item = page.getByTestId(`categoria-item-${categoriaId}`);
      await expect(item).toBeVisible();
      await expect(item).toContainText(nombreEditado);
      await page.getByTestId('chip-filtro-categoria-activas').click();
      await expect(item).toHaveCount(0);
    });
  });

  test.describe('Gestión de Tags', () => {
    test('el nombre de tag respeta el límite de 100 caracteres a nivel de input', async ({ page }) => {
      await loginAdminUi(page);
      await page.goto('/admin-tags.html');
      await page.getByTestId('btn-crear-tag').click();
      await expect(page.getByTestId('modal-tag')).toBeVisible();

      const input = page.getByTestId('input-nombre-tag');
      const texto95 = 'a'.repeat(95);
      await input.fill(texto95);
      await input.click();
      await page.keyboard.press('End');
      await page.keyboard.type('1234567890');
      await expect(input).toHaveValue(`${texto95}12345`);
    });

    test('crear un tag con nombre vacío muestra el error sin llamar al backend; completarlo permite crearlo', async ({ page }) => {
      const nombre = `Tag Vacío E2E ${sufijoUnico()}`;

      await loginAdminUi(page);
      await page.goto('/admin-tags.html');
      await page.getByTestId('btn-crear-tag').click();
      await expect(page.getByTestId('modal-tag')).toBeVisible();

      let seEnvioAlgo = false;
      const detectarEnvio = (req: import('@playwright/test').Request) => {
        if (req.url().endsWith('/tags') && req.method() === 'POST') {
          seEnvioAlgo = true;
        }
      };
      page.on('request', detectarEnvio);
      await page.getByTestId('btn-guardar-tag').click();
      await expect(page.getByTestId('mensaje-error-nombre-tag')).toBeVisible();
      await expect(page.getByTestId('mensaje-error-nombre-tag')).toContainText('El nombre del tag es obligatorio.');
      expect(seEnvioAlgo).toBe(false);
      page.off('request', detectarEnvio);

      const crearResponse = page.waitForResponse((res) => res.url().endsWith('/tags') && res.request().method() === 'POST');
      await page.getByTestId('input-nombre-tag').fill(nombre);
      await page.getByTestId('btn-guardar-tag').click();
      const creado = await crearResponse;
      expect(creado.status()).toBe(201);
      const tagId = (await creado.json()).data.id as number;
      await expect(page.getByTestId(`tag-item-${tagId}`)).toBeVisible();
    });

    test('editar el nombre y desactivar un tag en el mismo guardado dispara los 2 requests (PUT + DELETE) y el resultado se refleja en el listado', async ({
      page,
      request,
    }) => {
      const adminSesion = await fijarPasswordAdminYLoguear(request);
      const nombreOriginal = `Tag Combo E2E ${sufijoUnico()}`;
      const nombreEditado = `${nombreOriginal} Editado`;
      const tagId = await crearTag(request, adminSesion.token, nombreOriginal);

      await loginAdminUi(page);
      await page.goto('/admin-tags.html');
      await page.getByTestId(`btn-editar-tag-${tagId}`).click();
      await expect(page.getByTestId('modal-tag')).toBeVisible();

      await page.getByTestId('input-nombre-tag').fill(nombreEditado);
      await page.getByTestId('btn-switch-tag-activo').click();

      const putResponse = page.waitForResponse(
        (res) => res.url().endsWith(`/tags/${tagId}`) && res.request().method() === 'PUT',
      );
      const deleteResponse = page.waitForResponse(
        (res) => res.url().endsWith(`/tags/${tagId}`) && res.request().method() === 'DELETE',
      );
      await page.getByTestId('btn-guardar-tag').click();
      expect((await putResponse).status()).toBe(200);
      expect((await deleteResponse).status()).toBe(200);

      await page.getByTestId('chip-filtro-tag-inactivos').click();
      const item = page.getByTestId(`tag-item-${tagId}`);
      await expect(item).toBeVisible();
      await expect(item).toContainText(nombreEditado);
      await page.getByTestId('chip-filtro-tag-activos').click();
      await expect(item).toHaveCount(0);
    });
  });
});
