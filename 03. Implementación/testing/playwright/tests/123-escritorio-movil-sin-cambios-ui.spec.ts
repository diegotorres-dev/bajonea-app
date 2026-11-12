import { test, expect } from './helpers/prueba';
import type { Locator, Page } from '@playwright/test';
import { caja, sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

const PAGINAS_ACCESO = [
  '/bienvenida.html',
  '/login.html',
  '/registro-tipo-cuenta.html',
  '/registro-cliente.html',
  '/registro-comercio.html',
  '/verificar-email.html',
  '/recuperar-password.html',
  '/reactivar-cuenta.html',
  '/invitacion-empleado.html',
  '/terminos.html',
  '/privacidad.html',
  '/faq.html',
  '/soporte.html',
  '/errores/404.html',
  '/errores/sin-conexion.html',
];

async function areaDe44(elemento: Locator): Promise<boolean> {
  await elemento.scrollIntoViewIfNeeded();
  return elemento.evaluate((el) => {
    const c = el.getBoundingClientRect();
    const cx = c.left + c.width / 2;
    const cy = c.top + c.height / 2;
    const dentro = (x: number, y: number) => document.elementsFromPoint(x, y).some((nodo) => nodo === el || el.contains(nodo));
    return c.height >= 43.5 || (dentro(cx, cy - 21.5) && dentro(cx, cy + 21.5));
  });
}

async function abrirHojaDePrueba(page: Page) {
  await page.evaluate(async () => {
    const { abrirHoja } = await import('/js/hoja.js');
    abrirHoja({
      titulo: 'Hoja de prueba',
      texto: 'Texto de prueba.',
      acciones: [{ etiqueta: 'Aceptar', variante: 'primaria', testid: 'btn-aceptar-prueba', inicial: true }],
      testid: 'hoja-prueba',
    });
  });
}

test.describe('Escritorio E0: la versión móvil no cambia', () => {
  for (const ruta of PAGINAS_ACCESO) {
    test(`${ruta}: ocupa los 375 px de la ventana, sin tarjeta ni scroll horizontal`, async ({ page }) => {
      await page.goto(ruta);
      await page.waitForLoadState('load');
      await sinScrollHorizontal(page);
      const shell = await caja(page.locator('.app-shell, .splash-shell').first());
      expect(shell.width).toBe(375);
      expect(shell.x).toBe(0);
    });
  }

  test('medidas del login a 375 px: cabecera de 56 px, cuerpo con 28/20 px, botón de 52 px y sin borde en el contenido', async ({ page }) => {
    await page.goto('/login.html');
    expect((await caja(page.locator('.app-header'))).height).toBe(56);
    await expect(page.locator('.screen-body')).toHaveCSS('padding', '28px 20px 40px');
    expect((await caja(page.getByTestId('btn-ingresar'))).height).toBe(52);
    await expect(page.locator('.app-main')).toHaveCSS('border-top-width', '0px');
    await expect(page.locator('.app-main')).toHaveCSS('border-radius', '0px');
    await expect(page.locator('.app-shell')).toHaveCSS('border-radius', '0px');
  });

  test('a 700 px sigue la tarjeta de 460 px con esquinas redondeadas', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    await page.goto('/login.html');
    const shell = await caja(page.locator('.app-shell'));
    expect(shell.width).toBe(460);
    expect(shell.y).toBe(24);
    await expect(page.locator('.app-shell')).toHaveCSS('border-radius', '24px');
  });

  test('la hoja sigue siendo una hoja inferior pegada al borde, con esquinas redondeadas solo arriba', async ({ page }) => {
    await page.goto('/login.html');
    await abrirHojaDePrueba(page);
    const hoja = page.locator('[data-testid="hoja-prueba"] .modal-sheet');
    await expect(hoja).toBeVisible();
    const medida = await caja(hoja);
    expect(medida.x).toBe(0);
    expect(medida.width).toBe(375);
    expect(Math.round(medida.y + medida.height)).toBe(812);
    await expect(hoja).toHaveCSS('border-top-left-radius', '24px');
    await expect(hoja).toHaveCSS('border-bottom-left-radius', '0px');
  });

  test('el toast sigue centrado a 90 px del borde inferior', async ({ page }) => {
    await page.goto('/login.html');
    await page.evaluate(async () => {
      const { showToast } = await import('/js/catalogo.js');
      showToast('Cambios guardados', 'success');
    });
    const toast = await caja(page.locator('.toast'));
    expect(Math.abs(toast.x + toast.width / 2 - 187.5)).toBeLessThanOrEqual(1);
    expect(Math.round(812 - (toast.y + toast.height))).toBe(90);
    expect(toast.width).toBe(335);
  });

  test('la pantalla completa y el visor siguen ocupando todo el alto con 460 px como máximo', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    await page.goto('/login.html');
    await page.evaluate(() => {
      const panel = document.createElement('div');
      panel.className = 'pantalla-completa';
      panel.setAttribute('data-testid', 'panel-prueba');
      document.body.appendChild(panel);
    });
    const panel = await caja(page.getByTestId('panel-prueba'));
    expect(panel.width).toBe(460);
    expect(panel.height).toBe(900);
    expect(panel.x).toBe(120);
  });

  for (const ancho of [375, 700]) {
    test(`un pie sticky queda pegado al borde inferior de la ventana a ${ancho} px`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 800 });
      await page.goto('/login.html');
      await page.evaluate(() => {
        const relleno = document.createElement('div');
        relleno.style.height = '2400px';
        const pie = document.createElement('div');
        pie.className = 'cart-footer';
        pie.id = 'pie-sonda';
        pie.textContent = 'pie';
        document.querySelector('.app-main')!.append(relleno, pie);
        window.scrollTo(0, 800);
      });
      const pie = await caja(page.locator('#pie-sonda'));
      expect(Math.round(pie.y + pie.height)).toBe(800);
    });
  }

  test('los enlaces de texto del login tienen un área táctil de 44 px', async ({ page }) => {
    await page.goto('/login.html');
    for (const testid of ['btn-olvide-password', 'btn-ir-a-registro', 'btn-ir-a-invitacion']) {
      expect(await areaDe44(page.getByTestId(testid)), testid).toBe(true);
    }
  });

  test('el ritmo vertical del login no cambia por el área táctil de los enlaces', async ({ page }) => {
    await page.goto('/login.html');
    const posiciones = {
      olvide: (await caja(page.getByTestId('btn-olvide-password'))).y,
      ingresar: (await caja(page.getByTestId('btn-ingresar'))).y,
      registro: (await caja(page.getByTestId('btn-ir-a-registro'))).y,
      invitacion: (await caja(page.getByTestId('btn-ir-a-invitacion'))).y,
    };
    expect(posiciones.ingresar - posiciones.olvide).toBeGreaterThan(20);
    expect(posiciones.invitacion - posiciones.registro).toBeGreaterThan(20);
    expect(posiciones.invitacion - posiciones.registro).toBeLessThan(40);
  });

  test('las páginas de acceso ya no tienen estilos inline de layout en el HTML: solo display:none de estado', async ({ request }) => {
    for (const ruta of PAGINAS_ACCESO) {
      const html = await (await request.get(ruta)).text();
      const estilos = [...html.matchAll(/\sstyle="([^"]*)"/g)].map((m) => m[1].replace(/\s+/g, ''));
      const intrusos = estilos.filter((estilo) => estilo !== 'display:none;' && estilo !== 'display:none');
      expect(intrusos, ruta).toEqual([]);
      expect(html, ruta).not.toContain('<style');
    }
  });

  test('la barra superior con "volver" mantiene el título de 17 px y el espaciador de 24 px', async ({ page }) => {
    await page.goto('/login.html');
    await page.evaluate(async () => {
      const { renderTopBar } = await import('/js/catalogo.js');
      const contenedor = document.createElement('div');
      contenedor.id = 'barra-prueba';
      document.querySelector('.app-main')!.prepend(contenedor);
      renderTopBar(contenedor, { mostrarVolver: true, titulo: 'Título de prueba' });
    });
    const titulo = page.locator('#barra-prueba .app-header__title');
    await expect(titulo).toHaveCSS('position', 'static');
    await expect(titulo).toHaveCSS('font-size', '17px');
    await expect(titulo).toHaveCSS('transform', 'none');
    expect((await caja(page.locator('#barra-prueba .top-bar__espaciador'))).width).toBe(24);
  });

  test('las hojas de desktop no se cargan en móvil: los asistentes siguen en flex, no en dos columnas', async ({ page }) => {
    await page.goto('/registro-cliente.html');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.form')!).display)).toBe('flex');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.app-header')!).height)).toBe('56px');
  });
});
