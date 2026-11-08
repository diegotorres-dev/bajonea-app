import { test, expect } from './helpers/prueba';
import { sqlTest as sql } from './helpers/backend';
import { abrirComoUsuario } from './helpers/multicomercio';
import { sinScrollHorizontal } from './helpers/layout';
import { borrarAvisos, prepararClienteDeAvisos, sembrarAvisos } from './helpers/avisos-cliente';
import type { ClienteDeAvisos } from './helpers/avisos-cliente';

test.use({ viewport: { width: 375, height: 812 } });

const COMERCIO_AJENO = 987654;

test.describe('Tramo 2C: "Marcar todas" del Cliente y aviso leído sin destino', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  let cliente: ClienteDeAvisos;

  test.beforeAll(async ({ request }) => {
    cliente = await prepararClienteDeAvisos(request);
  });

  test.beforeEach(() => {
    borrarAvisos(cliente.usuarioId);
  });

  async function abrir(page: import('@playwright/test').Page) {
    await abrirComoUsuario(page, cliente.sesion);
    await page.goto('/notificaciones.html');
    await expect(page.locator('[data-testid^="notificacion-item-"], [data-testid="estado-vacio"]').first()).toBeVisible();
  }

  test('el botón no se ve si no hay avisos sin leer ni cuando la lista está vacía', async ({ page }) => {
    await abrir(page);
    await expect(page.getByTestId('estado-vacio')).toBeVisible();
    await expect(page.getByTestId('btn-marcar-todas-leidas')).toBeHidden();

    sembrarAvisos(cliente.usuarioId, 3, { leida: true });
    await page.reload();
    await expect(page.locator('[data-testid^="notificacion-item-"]')).toHaveCount(3);
    await expect(page.getByTestId('btn-marcar-todas-leidas')).toBeHidden();
  });

  test('con avisos sin leer el botón se ve, marca todo, muestra el toast y se esconde', async ({ page }) => {
    const personales = sembrarAvisos(cliente.usuarioId, 4);
    await abrir(page);
    const boton = page.getByTestId('btn-marcar-todas-leidas');
    await expect(boton).toBeVisible();
    await expect(boton).toBeEnabled();
    await expect(boton).toHaveText('Marcar todas');
    await expect(page.locator('.notification-item:not(.notification-item--leida)')).toHaveCount(4);

    const peticion = page.waitForRequest((req) => req.method() === 'PUT' && req.url().endsWith('/api/v1/notificaciones/personales/leidas'));
    await boton.click();
    expect((await peticion).headers()['x-comercio-id']).toBeUndefined();

    await expect(page.getByTestId('toast-exito')).toContainText('Marcaste todos los avisos como leídos');
    await expect(page.locator('.notification-item:not(.notification-item--leida)')).toHaveCount(0);
    await expect(boton).toBeHidden();
    expect(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${cliente.usuarioId} AND leida = 0;`)).toBe('0');
    for (const id of personales) {
      await expect(page.getByTestId(`notificacion-estado-${id}`)).toHaveText('');
    }
    await sinScrollHorizontal(page);
  });

  test('no toca los avisos de un comercio ni las filas de email', async ({ page }) => {
    sembrarAvisos(cliente.usuarioId, 2);
    const delComercio = sembrarAvisos(cliente.usuarioId, 1, { comercioId: COMERCIO_AJENO, prefijo: 'Del comercio' });
    const email = sembrarAvisos(cliente.usuarioId, 1, { canal: 'EMAIL', prefijo: 'Email' });
    await abrir(page);

    await page.getByTestId('btn-marcar-todas-leidas').click();
    await expect(page.getByTestId('toast-exito')).toBeVisible();

    expect(sql(`SELECT leida FROM notificacion WHERE id = ${delComercio[0]};`)).toBe('0');
    expect(sql(`SELECT leida FROM notificacion WHERE id = ${email[0]};`)).toBe('0');
    expect(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${cliente.usuarioId} AND comercio_id IS NULL AND canal = 'PUSH' AND leida = 0;`)).toBe('0');
  });

  test('un segundo clic queda sin efecto porque el botón ya no está', async ({ page }) => {
    sembrarAvisos(cliente.usuarioId, 2);
    await abrir(page);
    let llamadas = 0;
    await page.route('**/api/v1/notificaciones/personales/leidas', (ruta) => {
      llamadas += 1;
      return ruta.continue();
    });
    const boton = page.getByTestId('btn-marcar-todas-leidas');
    await boton.dblclick();
    await expect(page.getByTestId('toast-exito')).toBeVisible();
    await expect(boton).toBeHidden();
    expect(llamadas).toBe(1);
  });

  test('si falla muestra el toast de error y el botón sigue disponible', async ({ page }) => {
    sembrarAvisos(cliente.usuarioId, 2);
    await abrir(page);
    await page.route('**/api/v1/notificaciones/personales/leidas', (ruta) => ruta.fulfill({ status: 400, contentType: 'application/json', body: '{"mensaje":"No se pudo","data":null}' }));
    await page.getByTestId('btn-marcar-todas-leidas').click();
    await expect(page.getByTestId('toast-error')).toBeVisible();
    await expect(page.getByTestId('btn-marcar-todas-leidas')).toBeVisible();
    await expect(page.getByTestId('btn-marcar-todas-leidas')).toBeEnabled();
    expect(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${cliente.usuarioId} AND leida = 0;`)).toBe('2');
  });

  test('con todo lo cargado leído pero otros sin leer más atrás, el botón se ve igual', async ({ page }) => {
    sembrarAvisos(cliente.usuarioId, 5, { desfaseSegundos: 100 });
    sembrarAvisos(cliente.usuarioId, 21, { leida: true, prefijo: 'Leído' });
    await abrir(page);
    await expect(page.locator('[data-testid^="notificacion-item-"]')).toHaveCount(20);
    await expect(page.locator('.notification-item:not(.notification-item--leida)')).toHaveCount(0);
    await expect(page.getByTestId('btn-marcar-todas-leidas')).toBeVisible();

    await page.getByTestId('btn-marcar-todas-leidas').click();
    await expect(page.getByTestId('toast-exito')).toBeVisible();
    await expect(page.getByTestId('btn-marcar-todas-leidas')).toBeHidden();
    expect(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${cliente.usuarioId} AND leida = 0;`)).toBe('0');
  });

  test('la campana del catálogo deja de mostrar el punto tras marcar todas', async ({ page }) => {
    sembrarAvisos(cliente.usuarioId, 3);
    await abrirComoUsuario(page, cliente.sesion);
    await page.goto('/index.html');
    await expect(page.getByTestId('contador-notificaciones')).toHaveText('3');
    await page.getByTestId('btn-notificaciones').click();
    await page.waitForURL('**/notificaciones.html');
    await page.getByTestId('btn-marcar-todas-leidas').click();
    await expect(page.getByTestId('toast-exito')).toBeVisible();
    await page.getByTestId('btn-volver').click();
    await page.waitForURL('**/index.html');
    await expect(page.getByTestId('contador-notificaciones')).toHaveCount(0);
  });

  test.describe('aviso leído sin destino', () => {
    test('un aviso informativo ya leído es un elemento que se lee, no un botón deshabilitado', async ({ page }) => {
      const [leido] = sembrarAvisos(cliente.usuarioId, 1, { tipo: 'CUENTA_INACTIVADA', leida: true, prefijo: 'Cuenta inactiva de prueba' });
      await abrir(page);
      const tarjeta = page.getByTestId(`notificacion-item-${leido}`);
      expect(await tarjeta.evaluate((nodo) => nodo.tagName)).toBe('DIV');
      await expect(tarjeta).not.toBeDisabled();
      await expect(tarjeta).not.toHaveAttribute('disabled', /.*/);
      await expect(tarjeta).toContainText('Cuenta inactiva de prueba 1');
      await expect(page.getByRole('button', { name: /Cuenta inactiva de prueba/ })).toHaveCount(0);
      await expect(page.getByText('Cuenta inactiva de prueba 1')).toBeVisible();
    });

    test('un aviso informativo sin leer sigue siendo un botón que solo lo marca leído, y después se lee como elemento', async ({ page }) => {
      const [sinLeer] = sembrarAvisos(cliente.usuarioId, 1, { tipo: 'CUENTA_INACTIVADA', prefijo: 'Informativo' });
      await abrir(page);
      const tarjeta = page.getByTestId(`notificacion-item-${sinLeer}`);
      expect(await tarjeta.evaluate((nodo) => nodo.tagName)).toBe('BUTTON');
      await tarjeta.click();
      await expect(page.getByTestId(`notificacion-estado-${sinLeer}`)).toHaveText('');
      const despues = page.getByTestId(`notificacion-item-${sinLeer}`);
      await expect(despues).toHaveClass(/notification-item--leida/);
      expect(await despues.evaluate((nodo) => nodo.tagName)).toBe('DIV');
      expect(page.url()).toContain('/notificaciones.html');
      expect(sql(`SELECT leida FROM notificacion WHERE id = ${sinLeer};`)).toBe('1');
    });

    test('al marcar leída con el teclado el foco no se pierde en el documento', async ({ page }) => {
      const [sinLeer] = sembrarAvisos(cliente.usuarioId, 1, { tipo: 'CUENTA_INACTIVADA', prefijo: 'Con teclado' });
      await abrir(page);
      const tarjeta = page.getByTestId(`notificacion-item-${sinLeer}`);
      await tarjeta.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByTestId(`notificacion-item-${sinLeer}`)).toHaveClass(/notification-item--leida/);
      await expect(page.getByTestId(`notificacion-item-${sinLeer}`)).toBeFocused();
    });
  });
});
