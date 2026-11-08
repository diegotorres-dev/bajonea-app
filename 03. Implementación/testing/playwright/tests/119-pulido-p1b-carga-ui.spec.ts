import { test, expect } from './helpers/prueba';
import type { Page, Route } from '@playwright/test';
import {
  crearCategoria,
  crearProducto,
  fijarPasswordAdminYLoguear,
  login,
  marcarAptoVenta,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sufijoUnico,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { abrirComoUsuario, prepararAprobado } from './helpers/multicomercio';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

const DEMORA_MS = 2500;

async function demorar(page: Page, patron: string | RegExp, metodo = 'GET') {
  await page.route(patron, async (ruta: Route) => {
    if (ruta.request().method() !== metodo) {
      await ruta.fallback();
      return;
    }
    await new Promise((resolver) => setTimeout(resolver, DEMORA_MS));
    await ruta.fallback();
  });
}

test.describe('Pulido P1b: estados de carga (T13, A05)', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  let cliente: SesionApi;
  let dueno: Dueno;
  let adminSesion: SesionApi;

  test.beforeAll(async ({ request }) => {
    adminSesion = await fijarPasswordAdminYLoguear(request);
    const localidadId = await obtenerLocalidadRioGrande(request);
    const categoriaId = await crearCategoria(request, adminSesion.token, `Cat Carga ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminSesion.token, localidadId, false);
    await marcarAptoVenta(request, dueno.comercioId);
    await crearProducto(request, dueno.token, { nombre: `Producto Carga ${sufijoUnico()}`, precio: 10000, categoriaId });
    const datos = await registrarYVerificarCliente(request, localidadId);
    cliente = await login(request, datos.nombreUsuario, datos.password);
  });

  test('el catálogo muestra tarjetas esqueleto mientras llegan los comercios y las reemplaza', async ({ page }) => {
    await abrirComoUsuario(page, cliente);
    await demorar(page, '**/api/v1/catalogo/comercios');
    await page.goto('/index.html');
    const esqueleto = page.getByTestId('esqueleto-comercios');
    await expect(esqueleto).toBeVisible();
    await expect(esqueleto.locator('.comercio-card--esqueleto')).toHaveCount(3);
    await expect(page.getByTestId(`comercio-card-${dueno.comercioId}`)).toBeVisible({ timeout: 15_000 });
    await expect(esqueleto).toHaveCount(0);
    await sinScrollHorizontal(page);
  });

  test('Mis pedidos muestra esqueletos de pedido y los reemplaza por el estado vacío', async ({ page }) => {
    await abrirComoUsuario(page, cliente);
    await demorar(page, '**/api/v1/pedidos/cliente');
    await page.goto('/pedidos.html');
    const esqueleto = page.getByTestId('esqueleto-pedidos');
    await expect(esqueleto).toBeVisible();
    await expect(esqueleto.locator('.pedido-card--esqueleto')).toHaveCount(3);
    await expect(page.getByTestId('estado-vacio')).toBeVisible({ timeout: 15_000 });
    await expect(esqueleto).toHaveCount(0);
  });

  test('el carrito muestra esqueleto de cabecera y filas y lo reemplaza por el carrito vacío', async ({ page }) => {
    await abrirComoUsuario(page, cliente);
    await demorar(page, /\/api\/v1\/carrito$/);
    await page.goto('/carrito.html');
    const esqueleto = page.getByTestId('esqueleto-carrito');
    await expect(esqueleto).toBeVisible();
    await expect(esqueleto.locator('.cart-item--esqueleto')).toHaveCount(2);
    await expect(page.getByTestId('btn-explorar-comercios')).toBeVisible({ timeout: 15_000 });
    await expect(esqueleto).toHaveCount(0);
  });

  test('las notificaciones muestran esqueleto de avisos y lo reemplazan por el estado vacío', async ({ page }) => {
    await abrirComoUsuario(page, cliente);
    await demorar(page, /\/api\/v1\/notificaciones$/);
    await page.goto('/notificaciones.html');
    const esqueleto = page.getByTestId('esqueleto-avisos');
    await expect(esqueleto).toBeVisible();
    await expect(esqueleto.locator('.notification-item--esqueleto')).toHaveCount(4);
    await expect(page.getByTestId('estado-vacio')).toBeVisible({ timeout: 15_000 });
    await expect(esqueleto).toHaveCount(0);
  });

  test('Explorar muestra esqueleto de productos y lo reemplaza por los resultados', async ({ page }) => {
    await abrirComoUsuario(page, cliente);
    await demorar(page, /\/api\/v1\/catalogo\/productos\?/);
    await page.goto('/explorar.html');
    const esqueleto = page.getByTestId('esqueleto-productos');
    await expect(esqueleto).toBeVisible();
    await expect(esqueleto.locator('.explore-product-card--esqueleto')).toHaveCount(3);
    await expect(page.getByTestId('lista-productos-explorar').locator('.explore-product-card').first()).toBeVisible({ timeout: 15_000 });
    await expect(esqueleto).toHaveCount(0);
  });

  test('si falla la carga de Mis pedidos aparece el error con "Reintentar" en lugar de quedar el esqueleto', async ({ page }) => {
    await abrirComoUsuario(page, cliente);
    await page.route('**/api/v1/pedidos/cliente', (ruta) => ruta.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Falla simulada' }) }));
    await page.goto('/pedidos.html');
    await expect(page.getByTestId('error-de-carga')).toBeVisible();
    await expect(page.getByTestId('btn-reintentar-carga')).toBeVisible();
    await expect(page.getByTestId('esqueleto-pedidos')).toHaveCount(0);
    const caja = await page.getByTestId('btn-reintentar-carga').boundingBox();
    expect(caja!.height).toBeGreaterThanOrEqual(44);
  });

  test('el perfil del Cliente muestra esqueleto de nombre y avatar y los botones en espera hasta cargar', async ({ page }) => {
    await abrirComoUsuario(page, cliente);
    await demorar(page, '**/api/v1/clientes/perfil');
    await page.goto('/perfil.html');
    const lista = page.getByTestId('lista-perfil');
    await expect(lista).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByTestId('nombre-cliente-perfil').locator('.skeleton')).toBeVisible();
    await expect(page.getByTestId('btn-foto-perfil')).toHaveClass(/skeleton/);
    await expect(page.getByTestId('btn-editar-datos')).toBeDisabled();
    expect(await page.getByTestId('btn-editar-datos').evaluate((el) => getComputedStyle(el).cursor)).toBe('progress');
    await expect(page.getByTestId('btn-editar-datos')).toBeEnabled({ timeout: 15_000 });
    await expect(lista).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.getByTestId('nombre-cliente-perfil').locator('.skeleton')).toHaveCount(0);
    await expect(page.getByTestId('btn-foto-perfil')).not.toHaveClass(/skeleton/);
  });

  test('el perfil del comercio mantiene los botones en espera y los libera al cargar', async ({ page }) => {
    await abrirComoUsuario(page, dueno.sesion);
    await demorar(page, '**/api/v1/comercios/perfil');
    await page.goto('/comercio-perfil.html');
    await expect(page.locator('.profile-link-list[aria-busy="true"]').first()).toBeAttached();
    await expect(page.getByTestId('btn-editar-perfil-comercio')).toBeDisabled();
    await expect(page.getByTestId('btn-editar-perfil-comercio')).toBeEnabled({ timeout: 15_000 });
    await expect(page.locator('.profile-link-list[aria-busy="true"]')).toHaveCount(0);
  });

  test('el panel del Administrador muestra líneas de esqueleto en lugar de "Cargando..."', async ({ page }) => {
    await abrirComoUsuario(page, adminSesion);
    await demorar(page, '**/api/v1/administrador/perfil');
    await page.goto('/admin-dashboard.html');
    await expect(page.getByTestId('nombre-admin').locator('.skeleton')).toBeVisible();
    await expect(page.getByTestId('subtitulo-documentos-por-revisar').locator('.skeleton')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Cargando');
    await expect(page.getByTestId('nombre-admin').locator('.skeleton')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId('nombre-admin')).not.toHaveText('');
  });

  test('con movimiento reducido los esqueletos no se animan', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await abrirComoUsuario(page, cliente);
    await demorar(page, '**/api/v1/catalogo/comercios');
    await page.goto('/index.html');
    const bloque = page.getByTestId('esqueleto-comercios').locator('.skeleton').first();
    await expect(bloque).toBeVisible();
    expect(await bloque.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });
});
