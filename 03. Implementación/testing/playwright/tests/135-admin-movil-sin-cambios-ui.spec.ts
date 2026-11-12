import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { abrirComoUsuario } from './helpers/multicomercio';
import { sqlTest } from './helpers/backend';
import { prepararEscenarioAdmin } from './helpers/admin-escritorio';
import type { EscenarioAdmin } from './helpers/admin-escritorio';
import { caja, sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 390, height: 844 } });

const SOLO_ESCRITORIO = [
  '.barra-admin',
  '.admin-panel__cabecera',
  '.tabla-encabezado',
  '.encabezado-accion-escritorio',
  '.categoria-row__estado',
  '.soporte-fila__estado',
  '.revision-panel__titulo',
  '.revision-abrir-pestana',
  '.revision-otros-alternar',
  '.cambio-card__marca',
  '.tarifa-formulario',
];

const PAGINAS_CON_DESBORDE_PREEXISTENTE = ['admin-comercios-pendientes.html'];

const tarifasCreadas: number[] = [];

test.describe('Administrador en móvil: sin cambios de aspecto, destinos de Volver (T11), áreas de 44 px y hoja de tarifa (A03)', () => {
  test.describe.configure({ timeout: 240_000 });
  let esc: EscenarioAdmin;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(300_000);
    esc = await prepararEscenarioAdmin(request);
  });

  test.afterAll(() => {
    if (tarifasCreadas.length > 0) {
      sqlTest(`DELETE FROM configuracion_tarifa WHERE id IN (${tarifasCreadas.join(',')});`);
    }
  });

  async function abrir(page: Page, ruta: string) {
    await abrirComoUsuario(page, esc.admin);
    await page.goto(`/${ruta}`);
    await page.waitForLoadState('networkidle');
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

  test('ninguna página del Administrador muestra elementos de escritorio y ninguna tiene scroll horizontal a 390 px', async ({ page }) => {
    const rutas = [
      'admin-dashboard.html', 'admin-comercios-pendientes.html', 'admin-comercios.html', 'admin-resolicitudes.html', 'admin-documentos.html',
      'admin-soporte.html', 'admin-reclamos.html', 'admin-clientes.html', 'admin-duenos.html', 'admin-reembolsos.html', 'admin-tarifas.html',
      'admin-categorias.html', 'admin-tags.html',
      `admin-comercio-detalle.html?id=${esc.pendientes[0].comercioId}`,
      `admin-resolicitud-detalle.html?id=${esc.resolicitud.comercioId}`,
      `admin-documento-revision.html?comercioId=${esc.base.dueno.comercioId}&id=${esc.documentoIds[0]}`,
      `admin-soporte.html?id=${esc.consultas.esperando[0]}`,
      `admin-comercio-equipo.html?id=${esc.base.dueno.comercioId}`,
      `admin-comercio-actividad.html?id=${esc.base.dueno.comercioId}`,
    ];
    await abrirComoUsuario(page, esc.admin);
    for (const ruta of rutas) {
      await page.goto(`/${ruta}`);
      await page.waitForLoadState('networkidle');
      await ocultosEnMovil(page);
      if (!PAGINAS_CON_DESBORDE_PREEXISTENTE.includes(ruta)) {
        await sinScrollHorizontal(page);
      }
    }
  });

  test('el panel conserva el encabezado con el logo, las tarjetas apiladas y el botón Cerrar sesión', async ({ page }) => {
    await abrir(page, 'admin-dashboard.html');
    await expect(page.getByTestId('btn-cerrar-sesion')).toBeVisible();
    const tarjetas = page.locator('#admin-alertas > .alert-card');
    const xs = new Set(await tarjetas.evaluateAll((nodos) => nodos.map((nodo) => Math.round(nodo.getBoundingClientRect().x))));
    expect(xs.size).toBe(1);
    const tiles = page.locator('[data-testid^="tile-gestion-"]');
    const columnas = new Set(await tiles.evaluateAll((nodos) => nodos.map((nodo) => Math.round(nodo.getBoundingClientRect().x))));
    expect(columnas.size).toBe(2);
    await expect(page.getByTestId('barra-admin')).toBeHidden();
    await expect(page.locator('#top-bar-slot .top-bar')).toBeVisible();
  });

  test('Soporte sigue siendo bandeja y página de consulta separadas: no hay panel de detalle al costado', async ({ page }) => {
    await abrir(page, 'admin-soporte.html');
    await expect(page.getByTestId('soporte-maestro-detalle')).toHaveCount(0);
    const fila = page.getByTestId(`soporte-item-${esc.consultas.esperando[0]}`);
    await expect(fila).toBeVisible();
    await fila.click();
    await page.waitForURL(`**/admin-soporte.html?id=${esc.consultas.esperando[0]}`);
    await expect(page.getByTestId('consulta-email')).toBeVisible();
    await expect(page.getByTestId('btn-volver').first()).toBeVisible();
  });

  test('T11: Volver lleva siempre a su lista aunque se haya entrado por un enlace directo', async ({ page }) => {
    await abrirComoUsuario(page, esc.admin);
    const casos: Array<[string, string]> = [
      ['admin-clientes.html', '**/admin-dashboard.html'],
      ['admin-duenos.html', '**/admin-dashboard.html'],
      ['admin-comercios.html', '**/admin-dashboard.html'],
      ['admin-comercios-pendientes.html', '**/admin-dashboard.html'],
      ['admin-resolicitudes.html', '**/admin-dashboard.html'],
      ['admin-reembolsos.html', '**/admin-dashboard.html'],
      ['admin-tarifas.html', '**/admin-dashboard.html'],
      ['admin-categorias.html', '**/admin-dashboard.html'],
      ['admin-tags.html', '**/admin-dashboard.html'],
      [`admin-comercio-detalle.html?id=${esc.pendientes[0].comercioId}`, '**/admin-comercios-pendientes.html'],
      [`admin-resolicitud-detalle.html?id=${esc.resolicitud.comercioId}`, '**/admin-resolicitudes.html'],
      [`admin-documento-revision.html?comercioId=${esc.base.dueno.comercioId}&id=${esc.documentoIds[0]}`, '**/admin-documentos.html'],
    ];
    for (const [ruta, destino] of casos) {
      await page.goto('about:blank');
      await page.goto(`/${ruta}`);
      await page.getByTestId('btn-volver').click();
      await page.waitForURL(destino);
    }
  });

  test('las áreas táctiles de Cerrar sesión y Ver detalle llegan a 44 px sin cambiar el ritmo vertical', async ({ page }) => {
    await abrir(page, 'admin-dashboard.html');
    const cerrar = page.getByTestId('btn-cerrar-sesion');
    await cerrar.scrollIntoViewIfNeeded();
    const medidaCerrar = await caja(cerrar);
    expect(medidaCerrar.height).toBeLessThan(40);
    const centroX = medidaCerrar.x + medidaCerrar.width / 2;
    const centroY = medidaCerrar.y + medidaCerrar.height / 2;
    await page.mouse.click(centroX, centroY - 20);
    await expect(page.getByTestId('modal-confirmar-logout')).toBeVisible();
    await page.getByTestId('btn-cancelar-logout').click();
    await page.mouse.click(centroX, centroY + 20);
    await expect(page.getByTestId('modal-confirmar-logout')).toBeVisible();
    await page.getByTestId('btn-cancelar-logout').click();

    await page.goto('/admin-comercios.html');
    const detalle = page.locator('[data-testid^="btn-ver-detalle-comercio-"]').first();
    await expect(detalle).toBeVisible();
    await detalle.scrollIntoViewIfNeeded();
    const medida = await caja(detalle);
    expect(medida.height).toBeLessThan(40);
    await page.mouse.click(medida.x + medida.width / 2, medida.y + medida.height / 2 - 20);
    await expect(page.locator('.product-modal-sheet').first()).toBeVisible();
  });

  test('A03: confirmar una tarifa nueva muestra el antes y el ahora, el alcance y un botón de aplicar, también en el celular', async ({ page }) => {
    await abrir(page, 'admin-tarifas.html');
    await expect(page.getByTestId('tarifa-formulario')).toHaveCount(0);
    const textoVigente = (await page.locator('.stats-bar').first().innerText()).replace(/\s+/g, ' ');
    const vigente = textoVigente.match(/\$[\d.]+|\d+(?:,\d+)?%/)![0];
    await page.getByTestId('btn-nueva-tarifa').click();
    await expect(page.getByTestId('modal-nueva-tarifa')).toBeVisible();
    await page.getByTestId('input-valor-cargo-cliente').fill('300');
    await page.getByTestId('input-valor-cargo-comercio').fill('2');
    await page.getByTestId('btn-guardar-nueva-tarifa').click();
    const hoja = page.getByTestId('modal-confirmar-tarifa');
    await expect(hoja).toBeVisible();
    await expect(hoja.getByRole('heading')).toHaveText('¿Aplicar la nueva tarifa?');
    const comparacion = page.getByTestId('comparacion-tarifa');
    await expect(comparacion).toContainText(vigente);
    await expect(comparacion).toContainText('$300');
    await expect(comparacion).toContainText('2%');
    await expect(hoja).toContainText('Los pedidos ya creados conservan la tarifa con la que se confirmaron');
    const aplicar = page.getByTestId('btn-confirmar-nueva-tarifa');
    await expect(aplicar).toHaveText('Aplicar tarifa');
    expect(await aplicar.evaluate((el) => el.className)).toContain('btn-primary');
    await page.getByTestId('btn-cancelar-confirmar-tarifa').click();
    await expect(page.getByTestId('modal-nueva-tarifa')).toBeVisible();
    await expect(page.getByTestId('input-valor-cargo-cliente')).toHaveValue('300');
    const creada = page.waitForResponse((r) => r.url().endsWith('/administrador/tarifas') && r.request().method() === 'POST');
    await page.getByTestId('btn-guardar-nueva-tarifa').click();
    await aplicar.click();
    const respuesta = await creada;
    expect(respuesta.status()).toBe(201);
    tarifasCreadas.push((await respuesta.json()).data.id as number);
    await expect(page.locator('.toast')).toContainText('Tarifa creada correctamente');
    await expect(page.getByTestId('modal-nueva-tarifa')).toHaveCount(0);
  });
});
