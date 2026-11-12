import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { ANCHOS_ESCRITORIO, barraInferiorOculta, caja, esDialogoCentrado, sinScrollHorizontalEnAnchos, tieneAnilloDeFoco, toastAbajoADerecha } from './helpers/layout';

test.use({ viewport: { width: 1440, height: 900 } });

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
  '/soporte-consulta.html',
  '/errores/404.html',
  '/errores/500.html',
  '/errores/acceso-denegado.html',
  '/errores/sesion-expirada.html',
  '/errores/sin-conexion.html',
  '/errores/timeout.html',
];

const HTML_SHELL = (clases: string, extra = '') => `<!doctype html><html lang="es"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="stylesheet" href="/css/styles.css" /><link rel="stylesheet" href="/css/escritorio.css" media="(min-width: 1024px)" /></head><body>
<div class="app-shell ${clases}" id="shell">
<div id="top-bar-slot"><header class="top-bar"><h1 class="app-header__title app-header__title--en-barra">Panel</h1></header></div>
<main class="app-main"><div class="screen-body" id="relleno">Contenido</div></main>
<div id="bottom-nav-slot"><nav class="bottom-nav" aria-label="Principal">
<a class="bottom-nav__item" aria-current="page" href="/p1" data-testid="nav-1">Panel</a>
<a class="bottom-nav__item" href="/p2" data-testid="nav-2">Productos</a>
<a class="bottom-nav__item" href="/p3" data-testid="nav-3">Pedidos</a>
<a class="bottom-nav__item" href="/p4" data-testid="nav-4">Perfil</a>
</nav></div>${extra}</div></body></html>`;

async function servirShell(page: Page, clases: string) {
  await page.route('**/prueba-shell.html', (ruta) => ruta.fulfill({ status: 200, contentType: 'text/html', body: HTML_SHELL(clases) }));
  await page.goto('/prueba-shell.html');
  await page.evaluate(() => {
    document.getElementById('relleno')!.style.height = '2400px';
  });
}

test.describe('Escritorio E0: base (CSS, capas, foco y hover) @escritorio', () => {
  for (const ruta of PAGINAS_ACCESO) {
    test(`${ruta}: sin scroll horizontal a 1024, 1280, 1440 y 1920 px @escritorio`, async ({ page }) => {
      await page.goto(ruta);
      await page.waitForLoadState('load');
      await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
    });
  }

  test('registro de comercio: los cuatro pasos no producen scroll horizontal a ningún ancho @escritorio', async ({ page }) => {
    await page.goto('/registro-comercio.html');
    for (let paso = 1; paso <= 4; paso += 1) {
      await page.evaluate((actual) => {
        for (let i = 1; i <= 4; i += 1) document.getElementById(`step-${i}`)!.classList.toggle('is-hidden', i !== actual);
      }, paso);
      await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
    }
  });

  test('el login ya no es una tarjeta de celular: ocupa la ventana, sin cabecera de celular y con el formulario en la mitad derecha @escritorio', async ({ page }) => {
    await page.goto('/login.html');
    const shell = await caja(page.locator('.app-shell'));
    expect(shell.width).toBe(1440);
    expect(shell.x).toBe(0);
    await expect(page.locator('.app-header')).toBeHidden();
    const principal = await caja(page.locator('.app-main'));
    expect(principal.width).toBe(640);
    expect(principal.x + principal.width).toBe(1440);
    await expect(page.locator('.app-shell')).toHaveCSS('border-radius', '0px');
  });

  test('los asistentes de registro usan pasos al costado y una tarjeta con campos en dos columnas @escritorio', async ({ page }) => {
    await page.goto('/registro-cliente.html');
    const tarjeta = await caja(page.locator('#wizard-container'));
    expect(tarjeta.width).toBeGreaterThan(900);
    const nombre = await caja(page.getByTestId('input-nombre'));
    const apellido = await caja(page.getByTestId('input-apellido'));
    expect(Math.abs(nombre.y - apellido.y)).toBeLessThanOrEqual(1);
    expect(apellido.x).toBeGreaterThan(nombre.x + nombre.width);
  });

  test('registro de comercio: los datos legales se reparten en dos columnas y la dirección usa el ancho @escritorio', async ({ page }) => {
    await page.goto('/registro-comercio.html');
    await page.evaluate(() => {
      for (let i = 1; i <= 4; i += 1) document.getElementById(`step-${i}`)!.classList.toggle('is-hidden', i !== 2);
    });
    const cuit = await caja(page.getByTestId('input-cuit'));
    const domicilio = await caja(page.getByTestId('input-domicilio-fiscal'));
    expect(Math.abs(cuit.y - domicilio.y)).toBeLessThanOrEqual(1);
    expect(domicilio.x).toBeGreaterThan(cuit.x + cuit.width);
    await page.evaluate(() => {
      for (let i = 1; i <= 4; i += 1) document.getElementById(`step-${i}`)!.classList.toggle('is-hidden', i !== 1);
    });
    const calle = await caja(page.getByTestId('input-calle'));
    const tarjeta = await caja(page.locator('#wizard-container'));
    expect(calle.width).toBeGreaterThan(tarjeta.width * 0.8);
  });

  test('registro-tipo-cuenta: las dos tarjetas quedan lado a lado @escritorio', async ({ page }) => {
    await page.goto('/registro-tipo-cuenta.html');
    const cliente = await caja(page.getByTestId('btn-elegir-cliente'));
    const comercio = await caja(page.getByTestId('btn-elegir-comercio'));
    expect(Math.abs(cliente.y - comercio.y)).toBeLessThanOrEqual(1);
    expect(comercio.x).toBeGreaterThan(cliente.x + cliente.width);
  });

  test('bienvenida: composición partida con el logo a la izquierda y las acciones a la derecha @escritorio', async ({ page }) => {
    await page.goto('/bienvenida.html');
    const panel = await caja(page.getByTestId('panel-marca'));
    const ingresar = await caja(page.getByTestId('btn-ingresar'));
    expect(ingresar.x).toBeGreaterThan(panel.x + panel.width - 1);
    expect(panel.height).toBeGreaterThan(500);
  });

  test('los enlaces de texto de login miden 44 px de alto @escritorio', async ({ page }) => {
    await page.goto('/login.html');
    for (const testid of ['btn-olvide-password', 'btn-ir-a-registro', 'btn-ir-a-invitacion']) {
      const enlace = await caja(page.getByTestId(testid));
      expect(enlace.height, testid).toBeGreaterThanOrEqual(43.5);
    }
  });

  test('una hoja se abre como diálogo centrado con fondo oscuro, y al cerrar con Escape devuelve el foco @escritorio', async ({ page }) => {
    await page.goto('/login.html');
    const disparador = page.getByTestId('btn-olvide-password');
    await disparador.focus();
    await page.evaluate(async () => {
      const { abrirHoja } = await import('/js/hoja.js');
      abrirHoja({
        titulo: 'Confirmación de prueba',
        texto: 'Texto de la hoja de prueba.',
        acciones: [
          { etiqueta: 'Aceptar', variante: 'primaria', testid: 'btn-aceptar-prueba', inicial: true },
          { etiqueta: 'Cancelar', variante: 'segura', testid: 'btn-cancelar-prueba' },
        ],
        testid: 'hoja-prueba',
      });
    });
    const hoja = page.locator('[data-testid="hoja-prueba"] .modal-sheet');
    await expect(hoja).toBeVisible();
    await esDialogoCentrado(page, hoja);
    await expect(hoja).toHaveCSS('border-bottom-left-radius', '24px');
    await expect(hoja).toHaveCSS('border-top-left-radius', '24px');
    const fondo = await caja(page.getByTestId('hoja-prueba'));
    expect(fondo.width).toBe(1440);
    expect(fondo.height).toBe(900);
    await expect(page.getByTestId('btn-aceptar-prueba')).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('hoja-prueba').locator('button:focus')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('hoja-prueba')).toHaveCount(0);
    await expect(disparador).toBeFocused();
  });

  test('el toast aparece abajo a la derecha @escritorio', async ({ page }) => {
    await page.goto('/login.html');
    await page.evaluate(async () => {
      const { showToast } = await import('/js/catalogo.js');
      showToast('Cambios guardados', 'success');
    });
    const toast = page.locator('.toast');
    await expect(toast).toBeVisible();
    await toastAbajoADerecha(page, toast);
  });

  test('pantalla completa pasa a panel lateral derecho de 520 px y el visor a diálogo ancho @escritorio', async ({ page }) => {
    await page.goto('/login.html');
    await page.evaluate(() => {
      const panel = document.createElement('div');
      panel.className = 'pantalla-completa';
      panel.setAttribute('data-testid', 'panel-prueba');
      panel.innerHTML = '<header class="app-header"><span class="app-header__title">Panel</span></header>';
      document.body.appendChild(panel);
      const visor = document.createElement('div');
      visor.className = 'visor-documento';
      visor.setAttribute('data-testid', 'visor-prueba');
      visor.innerHTML = '<div class="visor-documento__encabezado">Documento</div>';
      document.body.appendChild(visor);
    });
    const panel = await caja(page.getByTestId('panel-prueba'));
    expect(panel.x + panel.width).toBe(1440);
    expect(panel.width).toBeLessThanOrEqual(520);
    expect(panel.height).toBe(900);
    const visor = await caja(page.getByTestId('visor-prueba'));
    expect(visor.width).toBeGreaterThan(900);
    expect(visor.width).toBeLessThanOrEqual(1040);
    expect(visor.y).toBe(24);
    expect(Math.abs(visor.x + visor.width / 2 - 720)).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('visor-prueba')).toHaveCSS('border-radius', '24px');
  });

  test('el foco por teclado se ve en botones, enlaces y campos @escritorio', async ({ page }) => {
    await page.goto('/login.html');
    await page.keyboard.press('Tab');
    await tieneAnilloDeFoco(page.getByTestId('btn-ingresar'));
    await tieneAnilloDeFoco(page.getByTestId('btn-olvide-password'));
    await tieneAnilloDeFoco(page.getByTestId('btn-ir-a-registro'));
    await page.getByTestId('input-nombre-usuario').focus();
    const sombra = await page.locator('#shell-nombre-usuario').evaluate((nodo) => getComputedStyle(nodo).boxShadow);
    expect(sombra).not.toBe('none');
  });

  test('el hover cambia el fondo de los botones secundarios @escritorio', async ({ page }) => {
    await page.goto('/bienvenida.html');
    const boton = page.getByTestId('btn-crear-cuenta');
    const antes = await boton.evaluate((nodo) => getComputedStyle(nodo).backgroundColor);
    await boton.hover();
    await expect.poll(() => boton.evaluate((nodo) => getComputedStyle(nodo).backgroundColor)).not.toBe(antes);
  });

  test('chip-row pasa a varias líneas sin scroll horizontal @escritorio', async ({ page }) => {
    await page.goto('/login.html');
    await page.evaluate(() => {
      const fila = document.createElement('div');
      fila.className = 'chip-row';
      fila.setAttribute('data-testid', 'fila-chips-prueba');
      for (let i = 0; i < 14; i += 1) {
        const chip = document.createElement('button');
        chip.className = 'chip';
        chip.type = 'button';
        chip.textContent = `Categoría ${i + 1}`;
        fila.appendChild(chip);
      }
      document.querySelector('.screen-body')!.appendChild(fila);
    });
    const fila = page.getByTestId('fila-chips-prueba');
    await expect(fila).toHaveCSS('flex-wrap', 'wrap');
    const lineas = await fila.locator('.chip').evaluateAll((chips) => new Set(chips.map((chip) => Math.round(chip.getBoundingClientRect().top))).size);
    expect(lineas).toBeGreaterThan(1);
    expect(await fila.evaluate((nodo) => nodo.scrollWidth <= nodo.clientWidth)).toBe(true);
  });

  test('shell lateral preparado: barra de 264 px fija a la izquierda, ítem activo resaltado y contenido a la derecha @escritorio', async ({ page }) => {
    await servirShell(page, 'app-shell--lateral');
    const nav = await caja(page.locator('#bottom-nav-slot'));
    expect(nav.x).toBe(0);
    expect(nav.width).toBe(264);
    expect(nav.height).toBe(900);
    const contenido = await caja(page.locator('.app-main'));
    expect(contenido.x).toBeGreaterThanOrEqual(264);
    const tops = await page.locator('.bottom-nav__item').evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(4);
    await expect(page.getByTestId('nav-1')).toHaveCSS('background-color', 'rgb(255, 241, 234)');
    await page.evaluate(() => window.scrollTo(0, 800));
    expect((await caja(page.locator('#bottom-nav-slot'))).y).toBe(0);
  });

  test('shell lateral del Administrador usa la barra oscura y el ancho de 1440 px @escritorio', async ({ page }) => {
    await servirShell(page, 'app-shell--lateral app-shell--lateral-admin');
    await expect(page.locator('#bottom-nav-slot')).toHaveCSS('background-color', 'rgb(31, 26, 23)');
    await expect(page.getByTestId('nav-1')).toHaveCSS('color', 'rgb(255, 255, 255)');
  });

  test('shell del Cliente preparado: barra superior de 72 px y sin barra inferior @escritorio', async ({ page }) => {
    await servirShell(page, 'app-shell--cliente');
    await barraInferiorOculta(page);
    expect((await caja(page.locator('.top-bar'))).height).toBe(72);
    expect((await caja(page.locator('.app-shell'))).width).toBe(1440);
  });

  test('la barra lateral vuelve a ser una barra inferior debajo de 1024 px @escritorio', async ({ page }) => {
    await servirShell(page, 'app-shell--lateral');
    await page.setViewportSize({ width: 1000, height: 800 });
    const nav = await caja(page.locator('.bottom-nav'));
    expect(nav.width).toBeGreaterThan(300);
    const items = await page.locator('.bottom-nav__item').evaluateAll((nodos) => new Set(nodos.map((n) => Math.round(n.getBoundingClientRect().top))).size);
    expect(items).toBe(1);
  });

  test('imágenes: Cloudinary recibe tamaño, formato y calidad según el uso, y el resto de las URLs no cambia @escritorio', async ({ page }) => {
    await page.goto('/login.html');
    const resultado = await page.evaluate(async () => {
      const { urlImagen, pintarImagen } = await import('/js/imagenes.js');
      const original = 'https://res.cloudinary.com/demo/image/upload/v1700000000/carpeta/foto.png';
      const img = document.createElement('img');
      pintarImagen(img, original, { uso: 'miniatura', diferida: true });
      const sinDiferir = document.createElement('img');
      pintarImagen(sinDiferir, original, { uso: 'avatar' });
      return {
        avatar: urlImagen(original, 'avatar'),
        miniatura: urlImagen(original, 'miniatura'),
        galeria: urlImagen(original, 'galeria'),
        zoom: urlImagen(original, 'zoom'),
        blob: urlImagen('blob:http://localhost:5501/abc', 'avatar'),
        ajena: urlImagen('https://ejemplo.com/foto.png', 'avatar'),
        yTransformada: urlImagen('https://res.cloudinary.com/demo/image/upload/c_fill,w_100/foto.png', 'avatar'),
        nula: urlImagen(null, 'avatar'),
        lazy: img.loading,
        decodificacion: img.decoding,
        srcLazy: img.src,
        loadingSinDiferir: sinDiferir.loading,
      };
    });
    expect(resultado.avatar).toBe('https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_160/v1700000000/carpeta/foto.png');
    expect(resultado.miniatura).toContain('f_auto,q_auto,c_limit,w_240/');
    expect(resultado.galeria).toContain('w_960/');
    expect(resultado.zoom).toContain('w_1600/');
    expect(resultado.blob).toBe('blob:http://localhost:5501/abc');
    expect(resultado.ajena).toBe('https://ejemplo.com/foto.png');
    expect(resultado.yTransformada).toBe('https://res.cloudinary.com/demo/image/upload/c_fill,w_100/foto.png');
    expect(resultado.nula).toBeNull();
    expect(resultado.lazy).toBe('lazy');
    expect(resultado.decodificacion).toBe('async');
    expect(resultado.srcLazy).toContain('w_240');
    expect(resultado.loadingSinDiferir).not.toBe('lazy');
  });
});
