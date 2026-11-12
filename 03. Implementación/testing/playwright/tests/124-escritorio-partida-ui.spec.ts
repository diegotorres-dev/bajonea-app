import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { ANCHOS_ESCRITORIO, caja, sinScrollHorizontalEnAnchos, tieneAnilloDeFoco } from './helpers/layout';

test.use({ viewport: { width: 1440, height: 900 } });

const PANTALLAS_PARTIDAS = [
  '/login.html',
  '/bienvenida.html',
  '/verificar-email.html?email=prueba@bajonea.test',
  '/recuperar-password.html',
  '/reactivar-cuenta.html',
  '/invitacion-empleado.html',
  '/soporte.html',
];

const PANTALLAS_DE_ERROR = [
  '/errores/404.html',
  '/errores/500.html',
  '/errores/acceso-denegado.html',
  '/errores/sesion-expirada.html',
  '/errores/sin-conexion.html',
  '/errores/timeout.html',
];

async function esPartida(page: Page) {
  const panel = page.getByTestId('panel-marca');
  await expect(panel).toBeVisible();
  const caja_panel = await caja(panel);
  const principal = await caja(page.locator('.app-main'));
  expect(caja_panel.x).toBe(0);
  expect(caja_panel.width).toBe(800);
  expect(principal.x).toBe(800);
  expect(principal.width).toBe(640);
  expect(caja_panel.height).toBeGreaterThanOrEqual(900);
  await expect(panel).toHaveCSS('background-color', 'rgb(255, 71, 0)');
  await expect(page.locator('.app-shell')).toHaveCSS('border-radius', '0px');
  await expect(page.getByTestId('panel-marca-titular')).toHaveCSS('color', 'rgb(255, 255, 255)');
}

test.describe('Escritorio E0b: pantalla partida (panel de marca y formulario) @escritorio', () => {
  for (const url of PANTALLAS_PARTIDAS) {
    test(`${url}: panel naranja de 800 px a la izquierda y columna de 640 px a la derecha, sin tarjeta flotante @escritorio`, async ({ page }) => {
      await page.goto(url);
      await esPartida(page);
      const titular = (await page.getByTestId('panel-marca-titular').textContent()) ?? '';
      expect(titular.trim().length).toBeGreaterThan(8);
      await expect(page.getByTestId('panel-marca').locator('img')).toHaveAttribute('src', /bajonea-logo-white/);
      expect((await caja(page.getByTestId('panel-marca').locator('img'))).height).toBe(40);
      for (const enlace of ['terminos', 'privacidad', 'faq']) {
        const vinculo = page.getByTestId(`panel-legal-${enlace}`);
        await expect(vinculo).toBeVisible();
        expect((await caja(vinculo)).height).toBeGreaterThanOrEqual(43.5);
      }
      await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
    });
  }

  test('login: titular y bajada acordados, formulario de 420 px, botón de 52 px y enlaces de 44 px @escritorio', async ({ page }) => {
    await page.goto('/login.html');
    await expect(page.getByTestId('panel-marca-titular')).toHaveText('Pedí a los comercios de tu zona.');
    await expect(page.locator('.panel-marca__bajada')).toHaveText('Elegí, pagá y retirá. Si tenés un comercio, también lo manejás desde acá.');
    await expect(page.locator('.app-header')).toBeHidden();
    const formulario = await caja(page.locator('#login-form'));
    expect(formulario.width).toBe(420);
    expect(Math.abs(formulario.x + formulario.width / 2 - 1120)).toBeLessThanOrEqual(1);
    const boton = await caja(page.getByTestId('btn-ingresar'));
    expect(boton.height).toBe(52);
    expect(boton.width).toBe(420);
    expect((await caja(page.getByTestId('input-nombre-usuario'))).height).toBeGreaterThanOrEqual(50);
    await expect(page.locator('#shell-nombre-usuario')).toHaveCSS('border-radius', '14px');
    for (const testid of ['btn-olvide-password', 'btn-ir-a-registro', 'btn-ir-a-invitacion']) {
      expect((await caja(page.getByTestId(testid))).height, testid).toBeGreaterThanOrEqual(43.5);
    }
    const olvide = await caja(page.getByTestId('btn-olvide-password'));
    expect(olvide.x + olvide.width).toBeGreaterThan(formulario.x + formulario.width - 20);
    await expect(page.getByTestId('legal-pie')).toBeHidden();
  });

  test('login: el título del formulario mide 34 px y el panel usa un titular de 48 px a 1440 px @escritorio', async ({ page }) => {
    await page.goto('/login.html');
    await expect(page.locator('.title-lg')).toHaveCSS('font-size', '34px');
    await expect(page.getByTestId('panel-marca-titular')).toHaveCSS('font-size', '48px');
    await expect(page.locator('.panel-marca__bajada')).toHaveCSS('font-size', '20px');
  });

  test('login: el orden de tabulación recorre el formulario, los enlaces y después los enlaces legales, y Enter envía @escritorio', async ({ page }) => {
    await page.goto('/login.html');
    const orden: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press('Tab');
      orden.push((await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.id ?? '')) as string);
    }
    expect(orden.slice(0, 7)).toEqual([
      'input-nombre-usuario',
      'input-password',
      'btn-mostrar-password',
      'btn-olvide-password',
      'btn-ingresar',
      'btn-ir-a-registro',
      'btn-ir-a-invitacion',
    ]);
    expect(orden.slice(7)).toEqual(['panel-legal-terminos', 'panel-legal-privacidad', 'panel-legal-faq']);
    await page.getByTestId('input-nombre-usuario').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.field__error:visible').first()).toBeVisible();
  });

  test('el foco es visible en el botón principal, en los enlaces y en los enlaces legales del panel @escritorio', async ({ page }) => {
    await page.goto('/login.html');
    await tieneAnilloDeFoco(page.getByTestId('btn-ingresar'));
    await tieneAnilloDeFoco(page.getByTestId('btn-ir-a-registro'));
    await tieneAnilloDeFoco(page.getByTestId('panel-legal-faq'));
  });

  test('el hover marca los enlaces legales del panel sin mover el diseño @escritorio', async ({ page }) => {
    await page.goto('/login.html');
    const enlace = page.getByTestId('panel-legal-terminos');
    const antes = await caja(enlace);
    await enlace.hover();
    const despues = await caja(enlace);
    expect(despues).toEqual(antes);
  });

  test('bienvenida: las tres acciones ocupan los 420 px de la columna derecha @escritorio', async ({ page }) => {
    await page.goto('/bienvenida.html');
    await expect(page.locator('.landing-hero')).toBeHidden();
    expect((await caja(page.getByTestId('btn-ingresar'))).width).toBe(420);
    expect((await caja(page.getByTestId('btn-crear-cuenta'))).width).toBe(420);
  });

  test('invitación: conserva el botón de volver dentro de la columna del formulario @escritorio', async ({ page }) => {
    await page.goto('/invitacion-empleado.html');
    const volver = page.getByTestId('btn-volver');
    await expect(volver).toBeVisible();
    expect((await caja(volver)).x).toBeGreaterThanOrEqual(800);
    await expect(page.getByTestId('input-email-invitacion')).toBeVisible();
  });

  for (const url of PANTALLAS_DE_ERROR) {
    test(`${url}: composición partida con el mensaje grande a la izquierda y las acciones a la derecha @escritorio`, async ({ page }) => {
      await page.goto(url);
      await esPartida(page);
      await expect(page.locator('.app-header')).toBeHidden();
      const accion = page.locator('.state-page__actions .btn').first();
      await expect(accion).toBeVisible();
      expect((await caja(accion)).x).toBeGreaterThanOrEqual(800);
      expect((await caja(accion)).width).toBeLessThan(420);
      await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
    });
  }

  test('splash: panel de marca a la izquierda y progreso a la derecha @escritorio', async ({ page }) => {
    await page.addInitScript(() => {
      window.setTimeout = (() => 0) as unknown as typeof window.setTimeout;
    });
    await page.goto('/splash.html');
    await expect(page.getByTestId('panel-marca')).toBeVisible();
    const panel = await caja(page.getByTestId('panel-marca'));
    const progreso = await caja(page.locator('.splash-progress'));
    expect(panel.width).toBe(800);
    expect(progreso.x).toBeGreaterThan(800);
    await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
  });

  test('a 1024 px la columna del formulario se achica a 560 px y no hay scroll horizontal @escritorio', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/login.html');
    expect((await caja(page.locator('.app-main'))).width).toBe(560);
    expect((await caja(page.locator('#login-form'))).width).toBe(420);
  });

  test('el panel de marca se queda fijo mientras se desplaza una pantalla larga @escritorio', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 500 });
    await page.goto('/soporte.html');
    await page.evaluate(() => window.scrollTo(0, 200));
    const panel = await caja(page.getByTestId('panel-marca'));
    expect(Math.abs(panel.y)).toBeLessThan(1);
  });
});

test.describe('Escritorio E0b: la versión móvil no ve el panel de marca @escritorio', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const url of ['/login.html', '/bienvenida.html', '/recuperar-password.html', '/errores/404.html']) {
    test(`${url}: a 390 px el panel de marca no se muestra y la cabecera sigue ahí @escritorio`, async ({ page }) => {
      await page.goto(url);
      await expect(page.getByTestId('panel-marca')).toBeHidden();
      await expect(page.locator('.app-header, .landing-hero').first()).toBeVisible();
      await expect(page.locator('.app-shell')).toHaveCSS('max-width', '460px');
    });
  }
});
