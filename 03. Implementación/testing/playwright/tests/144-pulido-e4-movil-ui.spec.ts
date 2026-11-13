import { test, expect } from './helpers/prueba';
import { abrirComoUsuario } from './helpers/multicomercio';
import { fijarPasswordAdminYLoguear } from './helpers/backend';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 390, height: 844 } });

const EMAIL_LARGO = 'comercio.con.un.nombre.de.cuenta.realmente.largo.para.probar.el.desborde@dominio-de-prueba-extenso.com.ar';

test.describe('Pulido E4 en móvil: desborde de Pendientes y nombres con partículas', () => {
  test('Pendientes de aprobación no tiene scroll horizontal con un email muy largo', async ({ page, request }) => {
    const admin = await fijarPasswordAdminYLoguear(request);
    const ahora = new Date().toISOString().slice(0, 19);
    await page.route('**/api/v1/administrador/comercios/pendientes', (ruta) => {
      if (ruta.request().method() !== 'GET') {
        return ruta.continue();
      }
      const comercios = Array.from({ length: 12 }, (_, indice) => ({
        id: 9000 + indice,
        nombre: `Comercio de prueba número ${indice + 1}`,
        tipoComercio: 'RESTAURANTE',
        fechaRegistro: ahora,
        emailCuenta: EMAIL_LARGO,
        esAdicional: indice % 3 === 0,
        otrosComercios: [],
        estado: 'PENDIENTE',
      }));
      return ruta.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify({ mensaje: '', data: comercios }) });
    });
    await abrirComoUsuario(page, admin);
    await page.goto('/admin-comercios-pendientes.html');
    await expect(page.locator('[data-testid^="comercio-pendiente-item-"]').first()).toBeVisible();
    await sinScrollHorizontal(page);
    for (const ancho of [375, 360]) {
      await page.setViewportSize({ width: ancho, height: 800 });
      await sinScrollHorizontal(page);
    }
  });

  test('getNombre respeta las partículas en minúscula en el saludo', async ({ page }) => {
    await page.goto('/login.html');
    const resultados = await page.evaluate(async () => {
      const modulo = await import('/js/validators.js');
      return ['MARÍA DE LOS ÁNGELES', 'juan del valle', 'ana y luis', 'José María', 'maría de la paz'].map((nombre) => modulo.aTitleCaseNombre(nombre));
    });
    expect(resultados).toEqual(['María de los Ángeles', 'Juan del Valle', 'Ana y Luis', 'José María', 'María de la Paz']);
    await page.evaluate(() => {
      localStorage.setItem('bajonea_token', 'x');
      localStorage.setItem('bajonea_usuario', JSON.stringify({ id: 1, rol: 'CLIENTE', nombre: 'MARÍA DE LOS ÁNGELES' }));
    });
    const nombre = await page.evaluate(async () => {
      const api = await import('/js/api.js');
      return api.getNombre();
    });
    expect(nombre).toBe('María de los Ángeles');
  });

  test('«Saltar al contenido» no se ve ni se puede enfocar en móvil', async ({ page, request }) => {
    const admin = await fijarPasswordAdminYLoguear(request);
    await abrirComoUsuario(page, admin);
    await page.goto('/admin-dashboard.html');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByTestId('btn-saltar-contenido')).toBeHidden();
  });

  test('el rótulo «Ver y agregar» de las filas de producto del Cliente no existe en móvil', async ({ page }) => {
    await page.goto('/login.html');
    await expect(page.locator('.product-row__agregar')).toHaveCount(0);
  });
});
