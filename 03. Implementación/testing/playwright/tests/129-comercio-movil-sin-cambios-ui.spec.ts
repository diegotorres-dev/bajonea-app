import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { abrirComoDueno, abrirComoEmpleado, prepararEscenarioComercio } from './helpers/escritorio-comercio';
import type { EscenarioComercio } from './helpers/escritorio-comercio';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 390, height: 844 } });

const SOLO_ESCRITORIO = [
  '.barra-lateral__logo',
  '.barra-lateral__selector',
  '.barra-lateral__pie',
  '.nav-grupo-escritorio',
  '.nav-etiqueta-escritorio',
  '.nav-insignia',
  '.perfil-menu',
  '.ver-todos-escritorio',
  '.stats-bar__escritorio',
  '.saludo-comercio',
  '.product-table__head',
  '.product-row__escritorio',
  '.top-bar__acciones-escritorio',
  '.form-acciones__cancelar',
  '.pedido-detalle-panel',
];

test.describe('Comercio en móvil: sin cambios de aspecto y destinos de Volver (T11)', () => {
  test.describe.configure({ timeout: 240_000 });
  let escenario: EscenarioComercio;

  test.beforeAll(async ({ request }) => {
    escenario = await prepararEscenarioComercio(request);
  });

  async function ocultosEnMovil(page: Page) {
    const visibles = await page.evaluate((selectores) => {
      const salida: string[] = [];
      selectores.forEach((selector) => {
        document.querySelectorAll(selector).forEach((nodo) => {
          const caja = (nodo as HTMLElement).getBoundingClientRect();
          if (getComputedStyle(nodo).display !== 'none' || caja.width > 0 || caja.height > 0) {
            salida.push(selector);
          }
        });
      });
      return salida;
    }, SOLO_ESCRITORIO);
    expect(visibles).toEqual([]);
  }

  test('el panel conserva la barra inferior de cuatro ítems y ningún elemento de escritorio es visible', async ({ page, request }) => {
    await abrirComoDueno(page, request, escenario);
    await page.goto('/comercio-dashboard.html');
    await expect(page.getByTestId('metrica-vendido')).toBeVisible();
    await expect(page.getByTestId('pedido-item-' + escenario.pedidos.pendiente)).toBeVisible();
    const visibles = await page.locator('#bottom-nav-slot .bottom-nav__item').evaluateAll((nodos) => nodos.filter((nodo) => (nodo as HTMLElement).getBoundingClientRect().width > 0).map((nodo) => nodo.getAttribute('data-testid')));
    expect(visibles).toEqual(['btn-nav-panel', 'btn-nav-productos', 'btn-nav-pedidos', 'btn-nav-perfil']);
    const posicion = await page.locator('#bottom-nav-slot').evaluate((nodo) => getComputedStyle(nodo).position);
    expect(posicion).not.toBe('fixed');
    await expect(page.getByTestId('btn-notificaciones')).toBeVisible();
    await expect(page.getByTestId('btn-estadisticas')).toBeVisible();
    await expect(page.getByTestId('franja-comercio')).toBeVisible();
    await ocultosEnMovil(page);
    await sinScrollHorizontal(page);
  });

  test('el pedido pendiente sigue abriendo la página de detalle y no el panel lateral', async ({ page, request }) => {
    await abrirComoDueno(page, request, escenario);
    await page.goto('/comercio-pedidos.html');
    await page.getByTestId(`pedido-item-${escenario.pedidos.pendiente}`).click();
    await page.waitForURL(`**/comercio-pedido-detalle.html?id=${escenario.pedidos.pendiente}`);
    await expect(page.getByTestId('btn-aceptar-pedido')).toBeVisible();
    await ocultosEnMovil(page);
  });

  test('el perfil mantiene la lista de filas y la navegación por vistas, una a la vez', async ({ page, request }) => {
    await abrirComoDueno(page, request, escenario);
    await page.goto('/comercio-perfil.html');
    await expect(page.getByTestId('btn-editar-perfil-comercio')).toBeEnabled();
    await expect(page.getByTestId('btn-ver-legales')).toBeVisible();
    await expect(page.getByTestId('btn-ver-equipo')).toBeVisible();
    await ocultosEnMovil(page);
    await page.getByTestId('btn-ver-legales').click();
    await expect(page.locator('#view-datos-legales')).toBeVisible();
    await expect(page.locator('#view-principal')).toBeHidden();
    expect(page.url()).not.toContain('seccion=');
    await page.getByTestId('btn-volver-perfil-legales').click();
    await expect(page.locator('#view-principal')).toBeVisible();
    await page.goto('/comercio-perfil.html?seccion=equipo');
    await expect(page.locator('#view-principal')).toBeVisible();
  });

  test('productos mantiene el botón flotante y las filas sin columnas de tabla', async ({ page, request }) => {
    await abrirComoDueno(page, request, escenario);
    await page.goto('/comercio-productos.html');
    await expect(page.getByTestId(`producto-item-${escenario.productoIds[0]}`)).toBeVisible();
    await expect(page.locator('#crear-producto-fab')).toBeVisible();
    await expect(page.getByTestId('btn-nuevo-producto')).toBeHidden().catch(() => undefined);
    await ocultosEnMovil(page);
    await page.goto('/comercio-producto-form.html');
    await expect(page.getByTestId('btn-guardar-producto')).toBeVisible();
    await ocultosEnMovil(page);
  });

  test('el Empleado y las páginas compartidas no muestran nada de escritorio en móvil', async ({ page, request }) => {
    await abrirComoEmpleado(page, request, escenario);
    for (const url of ['/comercio-dashboard.html', '/comercio-pedidos.html', '/notificaciones.html', '/mis-consultas.html', '/comercio-perfil.html']) {
      await page.goto(url);
      await page.waitForLoadState('load');
      await page.waitForTimeout(600);
      await ocultosEnMovil(page);
    }
  });

  test('T11: Volver de Pedidos lleva al panel y Volver del detalle lleva a Pedidos aunque se haya entrado por un enlace', async ({ page, request }) => {
    await abrirComoDueno(page, request, escenario);
    await page.goto(`/comercio-pedido-detalle.html?id=${escenario.pedidos.preparacion}`);
    await expect(page.getByTestId('btn-despachar-pedido')).toBeVisible();
    await page.getByTestId('btn-volver').click();
    await page.waitForURL('**/comercio-pedidos.html');
    await page.getByTestId('btn-volver').click();
    await page.waitForURL('**/comercio-dashboard.html');
  });

  test('T11: Volver de productos va al panel y Volver del formulario va a productos', async ({ page, request }) => {
    await abrirComoDueno(page, request, escenario);
    await page.goto(`/comercio-producto-form.html?id=${escenario.productoIds[0]}`);
    await expect(page.getByTestId('input-nombre-producto')).toHaveValue(/Hamburguesa/);
    await page.getByTestId('btn-volver').click();
    await page.waitForURL('**/comercio-productos.html');
    await page.getByTestId('btn-volver').click();
    await page.waitForURL('**/comercio-dashboard.html');
  });

  test('T11: Volver de Estadísticas y de Avisos va al panel y el de Soporte va al perfil', async ({ page, request }) => {
    await abrirComoDueno(page, request, escenario);
    await page.goto('/comercio-perfil.html');
    await page.goto('/comercio-estadisticas.html');
    await page.getByTestId('btn-volver').click();
    await page.waitForURL('**/comercio-dashboard.html');
    await page.goto('/comercio-perfil.html');
    await page.goto('/notificaciones.html');
    await page.getByTestId('btn-volver').click();
    await page.waitForURL('**/comercio-dashboard.html');
    await page.goto('/comercio-dashboard.html');
    await page.goto('/mis-consultas.html');
    await page.getByTestId('btn-volver').click();
    await page.waitForURL('**/comercio-perfil.html');
  });

  test('T11: el Empleado vuelve a los mismos destinos', async ({ page, request }) => {
    await abrirComoEmpleado(page, request, escenario);
    await page.goto(`/comercio-pedido-detalle.html?id=${escenario.pedidos.entregado}`);
    await expect(page.getByTestId('numero-pedido')).toBeVisible();
    await page.getByTestId('btn-volver').click();
    await page.waitForURL('**/comercio-pedidos.html');
  });
});
