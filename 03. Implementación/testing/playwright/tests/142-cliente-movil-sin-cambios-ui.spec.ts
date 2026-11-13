import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { sinScrollHorizontal } from './helpers/layout';
import { abrirComoCliente, dejarCarritoConItems, prepararEscenarioCliente } from './helpers/escritorio-cliente';
import type { EscenarioCliente } from './helpers/escritorio-cliente';
import { login } from './helpers/backend';

test.use({ viewport: { width: 390, height: 844 } });

const SOLO_ESCRITORIO = [
  '.barra-cliente',
  '.product-row__agregar',
  '.checkout-titulo',
  '#checkout-resumen',
  '.checkout-volver',
  '.notification-item__estado',
  '.notification-cabecera',
  '.pedidos-escritorio',
];

test.describe('Cliente en móvil: sin cambios de aspecto y destinos explícitos de Volver (T11)', () => {
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

  async function ocultosEnMovil(page: Page) {
    const visibles = await page.evaluate((selectores) => {
      const salida: string[] = [];
      selectores.forEach((selector) => {
        document.querySelectorAll(selector).forEach((nodo) => {
          const medida = (nodo as HTMLElement).getBoundingClientRect();
          if (getComputedStyle(nodo).display !== 'none' || medida.width > 0 || medida.height > 0) {
            salida.push(selector);
          }
        });
      });
      return salida;
    }, SOLO_ESCRITORIO);
    expect(visibles).toEqual([]);
  }

  test('ninguna página del Cliente muestra elementos de escritorio ni tiene scroll horizontal a 390 px', async ({ page, request }) => {
    const rutas = [
      'index.html', 'explorar.html', `comercio-detalle.html?id=${e.dueno.comercioId}`, 'carrito.html', 'checkout.html', 'pedidos.html',
      `pedido-detalle.html?id=${e.pedidos.preparacion}`, 'perfil.html', 'perfil.html?vista=direcciones', 'notificaciones.html', 'mis-consultas.html',
      `reclamo-nuevo.html?pedido=${e.pedidoReclamable}`, 'ayuda.html', `soporte-consulta.html?id=${e.consultaId}`,
    ];
    await abrirComoCliente(page, request, e);
    for (const ruta of rutas) {
      await page.goto(`/${ruta}`);
      await page.waitForLoadState('networkidle');
      await ocultosEnMovil(page);
      await sinScrollHorizontal(page);
      await expect(page.locator('.barra-cliente')).toHaveCount(0);
    }
  });

  test('en móvil siguen la barra inferior, la franja de tarjetas en una columna y el pie del carrito', async ({ page, request }) => {
    await abrir(page, request, 'index.html');
    await expect(page.getByTestId('btn-nav-inicio')).toBeVisible();
    await expect(page.locator('.bottom-nav')).toBeVisible();
    const tarjetas = page.locator('[data-testid^="comercio-card-"]');
    await expect(tarjetas.first()).toBeVisible();
    const columnas = await tarjetas.evaluateAll((nodos) => new Set(nodos.map((nodo) => Math.round(nodo.getBoundingClientRect().x))).size);
    expect(columnas).toBe(1);
    await page.goto('/carrito.html');
    await expect(page.locator('.cart-footer')).toBeVisible();
    expect(await page.locator('.cart-footer').evaluate((nodo) => getComputedStyle(nodo).position)).toBe('sticky');
  });

  test('«Volver» del detalle del comercio lleva al inicio, y desde Explorar lleva a Explorar', async ({ page, request }) => {
    await abrir(page, request, `comercio-detalle.html?id=${e.dueno.comercioId}`);
    await page.getByTestId('btn-volver').click();
    await page.waitForURL('**/index.html');
    await page.goto(`/comercio-detalle.html?id=${e.dueno.comercioId}&producto=${e.productoIds[0]}`);
    await page.getByTestId('btn-cerrar-modal-producto').or(page.getByTestId('modal-detalle-producto')).first().waitFor();
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.getElementById('product-modal-backdrop')?.remove());
    await page.getByTestId('btn-volver').click();
    await page.waitForURL('**/explorar.html');
  });

  test('«Volver» del carrito lleva al comercio del carrito y con el carrito vacío al inicio', async ({ page, request }) => {
    await abrir(page, request, 'carrito.html');
    await expect(page.getByTestId('tarjeta-comercio-carrito')).toBeVisible();
    await page.getByTestId('btn-volver').click();
    await page.waitForURL(new RegExp(`comercio-detalle\\.html\\?id=${e.dueno.comercioId}$`));
    await page.goto('/carrito.html');
    await page.getByTestId('btn-vaciar-carrito').click();
    await page.getByTestId('btn-confirmar-vaciar-carrito').click();
    await expect(page.getByTestId('toast-exito')).toBeVisible();
    await expect(page.getByText('Tu carrito está vacío')).toBeVisible();
    await expect(page.getByTestId('btn-vaciar-carrito')).toHaveCount(0);
    await page.getByTestId('btn-volver').click();
    await page.waitForURL('**/index.html');
  });

  test('«Volver» de Mis pedidos lleva al inicio y el del detalle de un pedido a Mis pedidos', async ({ page, request }) => {
    await abrir(page, request, 'pedidos.html');
    await expect(page.getByTestId(`pedido-item-${e.pedidos.preparacion}`)).toBeVisible();
    await page.getByTestId('btn-volver').click();
    await page.waitForURL('**/index.html');
    await page.goto(`/pedido-detalle.html?id=${e.pedidos.preparacion}`);
    await expect(page.getByTestId('cabecera-estado-pedido')).toBeVisible();
    await page.getByTestId('btn-volver').click();
    await page.waitForURL('**/pedidos.html');
  });

  test('«Volver» del reclamo lleva al pedido, el de notificaciones al inicio y el de consultas al perfil', async ({ page, request }) => {
    await abrir(page, request, `reclamo-nuevo.html?pedido=${e.pedidoReclamable}`);
    await expect(page.getByTestId('formulario-reclamo')).toBeVisible();
    await page.getByTestId('btn-volver').click();
    await page.waitForURL(new RegExp(`pedido-detalle\\.html\\?id=${e.pedidoReclamable}$`));
    await page.goto('/notificaciones.html');
    await page.getByTestId('btn-volver').click();
    await page.waitForURL('**/index.html');
    await page.goto('/mis-consultas.html');
    await page.getByTestId('btn-volver').click();
    await page.waitForURL('**/perfil.html');
  });

  test('«Volver» de la conversación de soporte con sesión lleva a Mis consultas', async ({ page, request }) => {
    await abrir(page, request, `soporte-consulta.html?id=${e.consultaId}`);
    await expect(page.getByTestId('btn-volver')).toBeVisible();
    await page.getByTestId('btn-volver').click();
    await page.waitForURL('**/mis-consultas.html');
  });

  test('el avatar de la barra inferior sale de la sesión y no consulta el perfil', async ({ page, request }) => {
    await abrirComoCliente(page, request, e);
    const consultas: string[] = [];
    page.on('request', (peticion) => {
      if (peticion.url().includes('/clientes/perfil')) {
        consultas.push(peticion.url());
      }
    });
    await page.goto('/index.html');
    await expect(page.locator('.bottom-nav__item[data-testid="btn-nav-perfil"] .bottom-nav__avatar')).toBeVisible();
    await expect(page.locator('.bottom-nav__item[data-testid="btn-nav-perfil"] .avatar-inicial')).toHaveText('C');
    expect(consultas).toEqual([]);
  });

  test('con una sesión anterior sin nombre el avatar sigue resolviéndose con el perfil', async ({ page, request }) => {
    const sesion = await abrirComoCliente(page, request, e);
    await page.addInitScript((token) => {
      const usuario = JSON.parse(localStorage.getItem('bajonea_usuario') || '{}');
      delete usuario.nombre;
      delete usuario.fotoPerfilUrl;
      localStorage.setItem('bajonea_usuario', JSON.stringify(usuario));
      localStorage.setItem('bajonea_token', token);
    }, sesion.token);
    const consultas: string[] = [];
    page.on('request', (peticion) => {
      if (peticion.url().includes('/clientes/perfil')) {
        consultas.push(peticion.url());
      }
    });
    await page.goto('/index.html');
    await expect(page.locator('.bottom-nav__item[data-testid="btn-nav-perfil"] .bottom-nav__avatar')).toBeVisible();
    expect(consultas.length).toBeGreaterThan(0);
  });
});
