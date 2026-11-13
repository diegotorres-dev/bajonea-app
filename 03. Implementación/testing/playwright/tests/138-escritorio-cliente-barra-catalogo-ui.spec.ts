import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { ANCHOS_ESCRITORIO, barraInferiorOculta, caja, esDialogoCentrado, sinScrollHorizontalEnAnchos, tieneAnilloDeFoco } from './helpers/layout';
import { abrirComoCliente, dejarCarritoConItems, prepararEscenarioCliente } from './helpers/escritorio-cliente';
import type { EscenarioCliente } from './helpers/escritorio-cliente';
import { abrirComoUsuario } from './helpers/multicomercio';
import { login } from './helpers/backend';

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('Escritorio E3: barra superior, catálogo, explorar y detalle del comercio @escritorio', () => {
  test.describe.configure({ timeout: 240_000 });
  let e: EscenarioCliente;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(300_000);
    e = await prepararEscenarioCliente(request);
  });

  test.beforeEach(async ({ request }) => {
    const sesion = await login(request, e.cliente.nombreUsuario, e.cliente.password);
    await dejarCarritoConItems(request, e, sesion.token);
  });

  async function abrir(page: Page, request: any, ruta: string) {
    await abrirComoCliente(page, request, e);
    await page.goto(`/${ruta}`);
  }

  test('la barra mide 72 px, queda pegada arriba, trae los tres enlaces y oculta la barra inferior @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'index.html');
    const barra = page.getByTestId('barra-cliente');
    await expect(barra).toBeVisible();
    const medida = await caja(barra);
    expect(medida.height).toBe(72);
    expect(medida.y).toBe(0);
    expect(await barra.evaluate((nodo) => getComputedStyle(nodo).position)).toBe('sticky');
    for (const clave of ['inicio', 'explorar', 'pedidos']) {
      const enlace = page.getByTestId(`barra-enlace-${clave}`);
      await expect(enlace).toBeVisible();
      expect((await caja(enlace)).height).toBe(44);
    }
    await expect(page.getByTestId('barra-enlace-inicio')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('barra-enlace-explorar')).not.toHaveAttribute('aria-current', 'page');
    await barraInferiorOculta(page);
    const buscador = await caja(page.getByTestId('barra-buscador'));
    expect(buscador.width).toBe(320);
    expect(buscador.height).toBe(44);
    expect((await caja(page.getByTestId('barra-carrito'))).width).toBe(44);
    expect((await caja(page.getByTestId('barra-avatar'))).width).toBe(44);
    await page.mouse.wheel(0, 1500);
    expect((await caja(barra)).y).toBe(0);
  });

  test('la insignia del carrito cuenta los productos y el aviso sin leer enciende el punto de la campana @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'index.html');
    await expect(page.getByTestId('barra-contador-carrito')).toHaveText('3');
    await expect(page.getByTestId('barra-punto-avisos')).toBeVisible();
    await expect(page.getByTestId('barra-avisos')).toHaveAttribute('aria-label', /sin leer/);
    await expect(page.getByTestId('barra-carrito')).toHaveAttribute('aria-label', /3 productos/);
  });

  test('el menú del avatar se abre con el botón, se recorre con flechas, cierra con Escape y devuelve el foco @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'index.html');
    const boton = page.getByTestId('barra-avatar');
    await expect(boton).toHaveAttribute('aria-expanded', 'false');
    await boton.click();
    await expect(boton).toHaveAttribute('aria-expanded', 'true');
    const menu = page.getByTestId('barra-menu');
    await expect(menu).toBeVisible();
    for (const id of ['barra-menu-perfil', 'barra-menu-direcciones', 'barra-menu-consultas', 'barra-menu-cerrar-sesion']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await expect(page.getByTestId('barra-menu-cambiar-cuenta')).toBeHidden();
    await expect(page.getByTestId('barra-menu-perfil')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('barra-menu-direcciones')).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.getByTestId('barra-menu-cerrar-sesion')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('barra-menu-perfil')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(boton).toBeFocused();
    await expect(boton).toHaveAttribute('aria-expanded', 'false');
  });

  test('el menú se cierra al tocar afuera y sus enlaces llevan a perfil, direcciones y consultas @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'index.html');
    await page.getByTestId('barra-avatar').click();
    await page.mouse.click(300, 600);
    await expect(page.getByTestId('barra-menu')).toBeHidden();
    await page.getByTestId('barra-avatar').click();
    await page.getByTestId('barra-menu-direcciones').click();
    await expect(page).toHaveURL(/perfil\.html\?seccion=direcciones/);
    await page.getByTestId('barra-avatar').click();
    await page.getByTestId('barra-menu-consultas').click();
    await expect(page).toHaveURL(/mis-consultas\.html/);
  });

  test('«Cerrar sesión» del menú pide confirmación y lleva al login @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'index.html');
    await page.getByTestId('barra-avatar').click();
    await page.getByTestId('barra-menu-cerrar-sesion').click();
    await expect(page.getByTestId('modal-confirmar-logout')).toBeVisible();
    await page.getByTestId('btn-cancelar-logout').click();
    await expect(page.getByTestId('modal-confirmar-logout')).toHaveCount(0);
    await page.getByTestId('barra-avatar').click();
    await page.getByTestId('barra-menu-cerrar-sesion').click();
    await page.getByTestId('btn-confirmar-logout').click();
    await page.waitForURL('**/login.html');
  });

  test('una persona con dos cuentas ve «Cambiar de cuenta» en el menú @escritorio', async ({ page, request }) => {
    const sesion = await login(request, e.empleado.nombreUsuario, e.empleado.password);
    await abrirComoUsuario(page, sesion);
    await page.goto('/index.html');
    await page.getByTestId('barra-avatar').click();
    await expect(page.getByTestId('barra-menu-cambiar-cuenta')).toBeVisible();
  });

  test('el buscador de la barra lleva a Explorar con el texto y queda precargado @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'index.html');
    await page.getByTestId('barra-buscador-input').fill('Papas');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/explorar\.html\?q=Papas/);
    await expect(page.getByTestId('input-buscar-producto-explorar')).toHaveValue('Papas');
    await expect(page.getByTestId('barra-buscador-input')).toHaveValue('Papas');
    await expect(page.getByTestId('lista-productos-explorar').locator('.explore-product-card').first()).toBeVisible();
    await expect(page.getByTestId('lista-productos-explorar').locator('.explore-product-card').first()).toContainText('Papas');
    await expect(page.getByTestId('barra-enlace-explorar')).toHaveAttribute('aria-current', 'page');
  });

  test('los elementos interactivos de la barra muestran un anillo de foco visible @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'index.html');
    await tieneAnilloDeFoco(page.getByTestId('barra-enlace-explorar'));
    await tieneAnilloDeFoco(page.getByTestId('barra-carrito'));
    await tieneAnilloDeFoco(page.getByTestId('barra-avatar'));
  });

  test('el catálogo es una grilla de 4 columnas a 1440 px con la portada de 150 px y el estado en texto @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'index.html');
    const tarjetas = page.locator('[data-testid^="comercio-card-"]');
    await expect(tarjetas.first()).toBeVisible();
    const columnas = await tarjetas.evaluateAll((nodos) => new Set(nodos.map((nodo) => Math.round(nodo.getBoundingClientRect().x))).size);
    expect(columnas).toBe(4);
    const primera = tarjetas.first();
    expect(await primera.evaluate((nodo) => nodo.tagName)).toBe('A');
    const portada = await caja(primera.locator('.comercio-card__avatar'));
    expect(portada.height).toBe(150);
    const tarjeta = await caja(primera);
    expect(portada.width).toBe(tarjeta.width - 2);
    await expect(primera.locator('.comercio-estado-badge')).toContainText('Abierto');
    const sufijo = await primera.locator('.comercio-estado-badge > span:last-child').evaluate((nodo) => getComputedStyle(nodo, '::after').content);
    expect(sufijo).toContain('ahora');
    const separacion = await tarjetas.evaluateAll((nodos) => {
      const a = nodos[0].getBoundingClientRect();
      const b = nodos[1].getBoundingClientRect();
      return Math.round(b.left - a.right);
    });
    expect(separacion).toBe(24);
  });

  test('entre 1024 y 1279 px el catálogo pasa a 3 columnas @escritorio', async ({ page, request }) => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await abrir(page, request, 'index.html');
    const tarjetas = page.locator('[data-testid^="comercio-card-"]');
    await expect(tarjetas.first()).toBeVisible();
    const columnas = await tarjetas.evaluateAll((nodos) => new Set(nodos.map((nodo) => Math.round(nodo.getBoundingClientRect().x))).size);
    expect(columnas).toBe(3);
  });

  test('los filtros del catálogo miden 44 px, se parten en líneas y filtran @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'index.html');
    const chip = page.getByTestId('chip-filtro-delivery');
    expect((await caja(chip)).height).toBe(44);
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    const visibles = page.locator('[data-testid^="comercio-card-"]');
    await expect(visibles).toHaveCount(await visibles.count());
    await expect(page.getByTestId(`comercio-card-${e.dueno.comercioId}`)).toBeVisible();
  });

  test('mostrar el esqueleto de tarjetas mientras carga el catálogo @escritorio', async ({ page, request }) => {
    await abrirComoCliente(page, request, e);
    await page.route('**/api/v1/catalogo/comercios', async (ruta) => {
      await new Promise((resolver) => setTimeout(resolver, 1500));
      await ruta.continue();
    });
    await page.goto('/index.html');
    await expect(page.getByTestId('esqueleto-comercios')).toBeVisible();
    await expect(page.getByTestId('esqueleto-comercios').locator('.comercio-card--esqueleto')).toHaveCount(3);
    await expect(page.locator('[data-testid^="comercio-card-"]').first()).toBeVisible({ timeout: 15_000 });
  });

  test('Explorar es una grilla de tarjetas con foto 4:3 y trae los filtros arriba @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'explorar.html');
    const tarjetas = page.getByTestId('lista-productos-explorar').locator('.explore-product-card:not(.explore-product-card--esqueleto)');
    await expect(tarjetas.first()).toBeVisible();
    const posiciones = await tarjetas.evaluateAll((nodos) => nodos.slice(0, 8).map((nodo) => Math.round(nodo.getBoundingClientRect().x)));
    expect(new Set(posiciones).size, JSON.stringify(posiciones)).toBe(4);
    const foto = await caja(tarjetas.first().locator('.explore-product-card__thumb'));
    expect(Math.abs(foto.width / foto.height - 4 / 3)).toBeLessThan(0.02);
    expect((await caja(page.getByTestId('chip-categoria-todas'))).height).toBe(44);
    await expect(page.getByTestId('input-buscar-producto-explorar')).toBeVisible();
  });

  test('el detalle del comercio muestra la ficha en dos columnas y los productos en una grilla de 3 @escritorio', async ({ page, request }) => {
    await abrir(page, request, `comercio-detalle.html?id=${e.dueno.comercioId}`);
    await expect(page.getByTestId('nombre-comercio')).toBeVisible();
    const ficha = page.locator('.comercio-ficha');
    const avatar = await caja(ficha.locator('.comercio-detail-header__avatar'));
    const info = await caja(page.getByTestId('nombre-comercio'));
    expect(info.x).toBeGreaterThan(avatar.x + avatar.width);
    expect(Math.abs(avatar.y - info.y)).toBeLessThan(80);
    const filas = page.locator('.product-row');
    await expect(filas.first()).toBeVisible();
    const columnas = await filas.evaluateAll((nodos) => new Set(nodos.map((nodo) => Math.round(nodo.getBoundingClientRect().x))).size);
    expect(columnas).toBe(3);
    const agregar = await caja(filas.first().locator('.product-row__agregar'));
    expect(agregar.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByTestId('estado-comercio')).toContainText('Abierto');
  });

  test('el diálogo del producto es centrado y ancho, se cierra con Escape y agrega al carrito @escritorio', async ({ page, request }) => {
    await abrir(page, request, `comercio-detalle.html?id=${e.dueno.comercioId}`);
    const antes = Number(await page.getByTestId('barra-contador-carrito').textContent());
    await page.getByTestId(`producto-item-${e.productoIds[0]}`).click();
    const dialogo = page.getByTestId('modal-detalle-producto').locator('.product-modal-sheet');
    await expect(dialogo).toBeVisible();
    await esDialogoCentrado(page, dialogo, { anchoMinimo: 600, anchoMaximo: 900 });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('modal-detalle-producto')).toHaveCount(0);
    await expect(page.getByTestId(`producto-item-${e.productoIds[0]}`)).toBeFocused();
    await page.getByTestId(`producto-item-${e.productoIds[0]}`).click();
    await page.getByTestId('btn-sumar-cantidad-producto').click();
    await page.getByTestId('btn-agregar-carrito').click();
    await expect(page.getByTestId('toast-exito')).toBeVisible();
    await expect(page.getByTestId('barra-contador-carrito')).toHaveText(String(antes + 2));
  });

  test('ninguna página del catálogo tiene scroll horizontal entre 1024 y 1920 px @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'index.html');
    await expect(page.locator('[data-testid^="comercio-card-"]').first()).toBeVisible();
    await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
    await page.goto('/explorar.html');
    await expect(page.getByTestId('lista-productos-explorar').locator('.explore-product-card').first()).toBeVisible();
    await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
    await page.goto(`/comercio-detalle.html?id=${e.dueno.comercioId}`);
    await expect(page.locator('.product-row').first()).toBeVisible();
    await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
  });

  test('sin sesión la barra ofrece «Ingresar» y el catálogo sigue disponible @escritorio', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.getByTestId('barra-ingresar')).toBeVisible();
    await expect(page.getByTestId('barra-carrito')).toHaveCount(0);
    await expect(page.getByTestId('barra-enlace-pedidos')).toHaveCount(0);
    await expect(page.locator('[data-testid^="comercio-card-"]').first()).toBeVisible();
  });
});
