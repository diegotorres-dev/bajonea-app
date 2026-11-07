import { test, expect } from './helpers/prueba';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

const PAGINAS = [
  { archivo: 'terminos.html', raiz: 'legal-terminos', titulo: 'titulo-terminos', texto: 'Términos y Condiciones de Uso de Bajoneá', resumen: true },
  { archivo: 'privacidad.html', raiz: 'legal-privacidad', titulo: 'titulo-privacidad', texto: 'Política de Privacidad de Bajoneá', resumen: true },
  { archivo: 'faq.html', raiz: 'legal-faq', titulo: 'titulo-faq', texto: 'Preguntas frecuentes', resumen: false },
];

const VERSION = 'Versión 1.0 · Última actualización: 6 de noviembre de 2026';

test.describe('Textos legales: Términos, Privacidad y Preguntas frecuentes', () => {
  for (const pagina of PAGINAS) {
    test(`${pagina.archivo} carga sin sesión con su título, la versión y sin scroll horizontal`, async ({ page }) => {
      await page.goto(`/${pagina.archivo}`);
      await expect(page.getByTestId(pagina.raiz)).toBeVisible();
      await expect(page.getByTestId(pagina.titulo)).toHaveText(pagina.texto);
      await expect(page.getByTestId('legal-version')).toHaveText(VERSION);
      if (pagina.resumen) {
        await expect(page.getByTestId('legal-resumen')).toContainText('En pocas palabras');
      }
      await expect(page).not.toHaveURL(/login\.html/);
      await sinScrollHorizontal(page);
    });

    test(`${pagina.archivo} no trae notas internas, aviso de texto provisorio ni el apellido del que no corresponde`, async ({ page }) => {
      await page.goto(`/${pagina.archivo}`);
      const texto = await page.getByTestId(pagina.raiz).textContent();
      expect(texto).not.toContain('Cámpora');
      expect(texto).not.toContain('Nota para Diego');
      expect(texto).not.toContain('Texto provisorio');
      await expect(page.getByTestId('aviso-texto-provisorio')).toHaveCount(0);
    });
  }

  test('el pie navega entre las tres páginas y marca la actual', async ({ page }) => {
    await page.goto('/terminos.html');
    const pie = page.getByTestId('legal-pie');
    await expect(pie.getByTestId('legal-pie-terminos')).toHaveAttribute('aria-current', 'page');
    await expect(pie.getByTestId('legal-pie-privacidad')).not.toHaveAttribute('aria-current', 'page');

    await pie.getByTestId('legal-pie-privacidad').click();
    await expect(page).toHaveURL(/privacidad\.html$/);
    await expect(page.getByTestId('titulo-privacidad')).toBeVisible();
    await expect(page.getByTestId('legal-pie-privacidad')).toHaveAttribute('aria-current', 'page');

    await page.getByTestId('legal-pie-faq').click();
    await expect(page).toHaveURL(/faq\.html$/);
    await expect(page.getByTestId('titulo-faq')).toBeVisible();
    await expect(page.getByTestId('legal-pie-faq')).toHaveAttribute('aria-current', 'page');

    await page.getByTestId('legal-pie-terminos').click();
    await expect(page).toHaveURL(/terminos\.html$/);
    await expect(page.getByTestId('titulo-terminos')).toBeVisible();
  });

  test('los enlaces del pie y los resúmenes tienen zonas táctiles de al menos 44 px', async ({ page }) => {
    await page.goto('/faq.html');
    for (const id of ['legal-pie-terminos', 'legal-pie-privacidad', 'legal-pie-faq']) {
      const caja = await page.getByTestId(id).boundingBox();
      expect(caja?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    const preguntas = page.getByTestId('faq-pregunta');
    const total = await preguntas.count();
    expect(total).toBeGreaterThan(20);
    for (const indice of [0, Math.floor(total / 2), total - 1]) {
      const caja = await preguntas.nth(indice).boundingBox();
      expect(caja?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });

  test('"Volver" regresa a la pantalla de origen', async ({ page }) => {
    await page.goto('/login.html');
    await page.getByTestId('legal-pie-terminos').click();
    await expect(page).toHaveURL(/terminos\.html$/);
    await page.getByTestId('legal-volver').click();
    await expect(page).toHaveURL(/login\.html$/);

    await page.getByTestId('legal-pie-faq').click();
    await expect(page).toHaveURL(/faq\.html$/);
    await page.getByTestId('legal-pie-privacidad').click();
    await expect(page).toHaveURL(/privacidad\.html$/);
    await page.getByTestId('legal-volver').click();
    await expect(page).toHaveURL(/faq\.html$/);
  });

  test('sin historial y sin sesión, "Volver" lleva al login', async ({ page, context }) => {
    await page.goto('/registro-cliente.html');
    const nueva = context.waitForEvent('page');
    await page.getByTestId('enlace-privacidad').click();
    const abierta = await nueva;
    await abierta.setViewportSize({ width: 375, height: 812 });
    await expect(abierta.getByTestId('titulo-privacidad')).toBeVisible();
    await abierta.getByTestId('legal-volver').click();
    await expect(abierta).toHaveURL(/login\.html$/);
    await abierta.close();
  });

  test('los acordeones de la FAQ abren y cierran con el teclado y muestran su estado', async ({ page }) => {
    await page.goto('/faq.html');
    const primera = page.getByTestId('faq-pregunta').first();
    const item = page.locator('.faq-item').first();
    await expect(item).not.toHaveAttribute('open', '');
    await primera.focus();
    await page.keyboard.press('Enter');
    await expect(item).toHaveAttribute('open', '');
    await expect(item.locator('.faq-respuesta')).toBeVisible();
    await expect(primera).toHaveCSS('color', 'rgb(255, 71, 0)');
    await page.keyboard.press('Enter');
    await expect(item).not.toHaveAttribute('open', '');
    await expect(item.locator('.faq-respuesta')).toBeHidden();
    await page.keyboard.press('Space');
    await expect(item).toHaveAttribute('open', '');
    await page.keyboard.press('Space');
    await expect(item).not.toHaveAttribute('open', '');
  });

  test('la FAQ agrupa las preguntas y cierra con el enlace a Soporte', async ({ page }) => {
    await page.goto('/faq.html');
    await expect(page.locator('.faq-grupo h2')).toHaveText(['Para Clientes', 'Mi cuenta', 'Soporte', 'Para Comercios']);
    await expect(page.getByTestId('faq-ayuda')).toHaveText('¿No encontraste tu respuesta? Escribinos a Soporte');
    await page.getByTestId('faq-enlace-soporte').click();
    await expect(page).toHaveURL(/soporte\.html$/);
    await expect(page.getByTestId('titulo-soporte')).toBeVisible();
  });

  test('Soporte enlaza a la Política de privacidad y a las Preguntas frecuentes antes del formulario', async ({ page }) => {
    await page.goto('/soporte.html');
    await expect(page.getByTestId('texto-privacidad')).toHaveText('Si tenés dudas sobre tus datos, leé nuestra Política de privacidad.');
    await expect(page.getByTestId('enlace-privacidad')).toHaveAttribute('href', 'privacidad.html');
    await expect(page.getByTestId('enlace-faq')).toHaveAttribute('href', 'faq.html');
    const posiciones = await page.evaluate(() => {
      const enlace = document.querySelector('[data-testid="enlace-faq"]')!.getBoundingClientRect().top;
      const formulario = document.querySelector('[data-testid="formulario-soporte"]')!.getBoundingClientRect().top;
      return { enlace, formulario };
    });
    expect(posiciones.enlace).toBeLessThan(posiciones.formulario);
    await page.getByTestId('enlace-privacidad').click();
    await expect(page.getByTestId('titulo-privacidad')).toBeVisible();
  });

  for (const archivo of ['login.html', 'registro-tipo-cuenta.html', 'registro-cliente.html', 'registro-comercio.html']) {
    test(`${archivo} tiene el pie con los tres enlaces legales`, async ({ page }) => {
      await page.goto(`/${archivo}`);
      const pie = page.getByTestId('legal-pie');
      await expect(pie.getByTestId('legal-pie-terminos')).toHaveAttribute('href', 'terminos.html');
      await expect(pie.getByTestId('legal-pie-privacidad')).toHaveAttribute('href', 'privacidad.html');
      await expect(pie.getByTestId('legal-pie-faq')).toHaveAttribute('href', 'faq.html');
      await pie.getByTestId('legal-pie-faq').scrollIntoViewIfNeeded();
      await expect(pie.getByTestId('legal-pie-faq')).toBeVisible();
      await sinScrollHorizontal(page);
    });
  }

  test('los enlaces de la casilla de aceptación abren pestaña nueva con noopener noreferrer y no pierden lo cargado', async ({ page, context }) => {
    await page.goto('/registro-cliente.html');
    await page.getByTestId('input-nombre').fill('Valentina');
    await page.getByTestId('input-apellido').fill('Domínguez');
    await page.getByTestId('input-acepta-terminos').check();

    for (const [testid, destino, titulo] of [
      ['enlace-terminos', 'terminos.html', 'titulo-terminos'],
      ['enlace-privacidad', 'privacidad.html', 'titulo-privacidad'],
    ]) {
      const enlace = page.getByTestId(testid);
      await expect(enlace).toHaveAttribute('href', destino);
      await expect(enlace).toHaveAttribute('target', '_blank');
      await expect(enlace).toHaveAttribute('rel', 'noopener noreferrer');
      const nueva = context.waitForEvent('page');
      await enlace.click();
      const abierta = await nueva;
      await expect(abierta.getByTestId(titulo)).toBeVisible();
      await abierta.close();
      await expect(page).toHaveURL(/registro-cliente\.html$/);
      await expect(page.getByTestId('input-nombre')).toHaveValue('Valentina');
      await expect(page.getByTestId('input-apellido')).toHaveValue('Domínguez');
      await expect(page.getByTestId('input-acepta-terminos')).toBeChecked();
    }
  });
});
