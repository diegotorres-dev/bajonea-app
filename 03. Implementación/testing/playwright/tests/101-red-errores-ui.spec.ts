import { test, expect } from './helpers/prueba';
import {
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
} from './helpers/backend';
import { abrirComoUsuario, loginUi } from './helpers/multicomercio';
import { prepararEscenario } from './helpers/reclamos';
import type { Escenario } from './helpers/reclamos';

test.use({ viewport: { width: 375, height: 812 } });

const TEXTO_AVISO = 'Sin conexión. No perdiste nada: tus datos siguen acá.';
const TEXTO_FRANJA = 'Sin conexión · reintentando…';

async function fueraDeLasPaginasDeError(page: import('@playwright/test').Page) {
  await expect.poll(() => new URL(page.url()).pathname).not.toMatch(/\/errores\//);
}

test.describe('Pulido 1, T01: la red caída nunca expulsa a una página de error', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  let esc: Escenario;
  let localidadId: string;

  test.beforeAll(async ({ request }) => {
    esc = await prepararEscenario(request);
    localidadId = await obtenerLocalidadRioGrande(request);
  });

  test('una acción de guardado sin red no navega: muestra el aviso y "Reintentar" la repite', async ({ page, request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    await loginUi(page, cliente.nombreUsuario, cliente.password);
    await page.waitForURL('**/index.html');
    await page.goto('/perfil.html');
    await expect(page.getByTestId('nombre-cliente-perfil')).not.toHaveText('');
    await page.getByTestId('btn-editar-datos').click();
    await page.getByTestId('input-nombre').fill('Sin Red');

    await page.route('**/clientes/perfil', (ruta) => (ruta.request().method() === 'PUT' ? ruta.abort('connectionfailed') : ruta.continue()));
    await page.getByTestId('btn-guardar-datos').click();

    const aviso = page.getByTestId('aviso-red');
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText(TEXTO_AVISO);
    await expect(aviso).toHaveAttribute('role', 'alert');
    await fueraDeLasPaginasDeError(page);
    expect(new URL(page.url()).pathname).toContain('perfil.html');
    await expect(page.getByTestId('input-nombre')).toHaveValue('Sin Red');

    const reintentar = page.getByTestId('btn-reintentar-red');
    const caja = await reintentar.boundingBox();
    expect(caja!.height).toBeGreaterThanOrEqual(44);

    await page.unroute('**/clientes/perfil');
    await reintentar.click();
    await expect(aviso).toHaveCount(0);
    await expect(page.getByTestId('nombre-cliente-perfil')).toContainText('Sin Red');

    const sesion = await login(request, cliente.nombreUsuario, cliente.password);
    expect(sesion.usuario.id).toBeGreaterThan(0);
  });

  test('un 5xx en una acción de guardado tampoco navega', async ({ page, request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    await loginUi(page, cliente.nombreUsuario, cliente.password);
    await page.waitForURL('**/index.html');
    await page.goto('/perfil.html');
    await expect(page.getByTestId('nombre-cliente-perfil')).not.toHaveText('');
    await page.getByTestId('btn-editar-datos').click();
    await page.getByTestId('input-nombre').fill('Error Cinco');

    await page.route('**/clientes/perfil', (ruta) => (
      ruta.request().method() === 'PUT'
        ? ruta.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ mensaje: 'caído', data: null }) })
        : ruta.continue()));
    await page.getByTestId('btn-guardar-datos').click();

    await expect(page.getByTestId('aviso-red')).toBeVisible();
    await fueraDeLasPaginasDeError(page);
    await page.unroute('**/clientes/perfil');
    await page.getByTestId('btn-reintentar-red').click();
    await expect(page.getByTestId('aviso-red')).toHaveCount(0);
  });

  test('el sondeo de fondo sin red no navega y a la segunda falla muestra la franja fina, que se va sola', async ({ page }) => {
    await page.clock.install();
    await abrirComoUsuario(page, esc.dueno.sesion);
    await page.goto('/comercio-dashboard.html');
    await expect(page.getByTestId('metricas-turno')).toBeVisible().catch(() => undefined);
    await page.waitForLoadState('networkidle');

    await page.route('**/comercios/mis-comercios', (ruta) => ruta.abort('connectionfailed'));
    await page.clock.fastForward(15_000);
    await page.waitForTimeout(300);
    await fueraDeLasPaginasDeError(page);
    await expect(page.getByTestId('franja-sin-conexion')).toHaveCount(0);

    await page.clock.fastForward(15_000);
    await page.waitForTimeout(300);
    await fueraDeLasPaginasDeError(page);
    await expect(page.getByTestId('franja-sin-conexion')).toBeVisible();
    await expect(page.getByTestId('franja-sin-conexion')).toContainText(TEXTO_FRANJA);

    await page.unroute('**/comercios/mis-comercios');
    await page.clock.fastForward(15_000);
    await expect(page.getByTestId('franja-sin-conexion')).toHaveCount(0);
  });

  test('un 5xx en el sondeo de la campana del Cliente no navega', async ({ page, request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    await page.clock.install();
    await loginUi(page, cliente.nombreUsuario, cliente.password);
    await page.waitForURL('**/index.html');
    await page.goto('/notificaciones.html');
    await page.waitForLoadState('networkidle');
    await page.route('**/api/v1/notificaciones', (ruta) => ruta.fulfill({ status: 503, contentType: 'application/json', body: '{"mensaje":"caído","data":null}' }));
    await page.clock.fastForward(15_000);
    await page.waitForTimeout(300);
    await fueraDeLasPaginasDeError(page);
    expect(new URL(page.url()).pathname).toContain('notificaciones.html');
  });
});
