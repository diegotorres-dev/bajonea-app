import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { abrirComoCliente, dejarCarritoConItems } from './helpers/escritorio-cliente';
import { abrirComoDueno, prepararEscenarioComercio } from './helpers/escritorio-comercio';
import type { EscenarioComercio } from './helpers/escritorio-comercio';
import { caja } from './helpers/layout';

function hexARgb(hex: string): string {
  const limpio = hex.trim().replace('#', '');
  return `rgb(${parseInt(limpio.slice(0, 2), 16)}, ${parseInt(limpio.slice(2, 4), 16)}, ${parseInt(limpio.slice(4, 6), 16)})`;
}

async function tokenComoRgb(page: Page, token: string): Promise<string> {
  const valor = await page.evaluate((nombre) => getComputedStyle(document.documentElement).getPropertyValue(nombre), token);
  return hexARgb(valor);
}

test.describe('Tramo E6: correcciones de la crítica de diseño (móvil)', () => {
  test.describe.configure({ timeout: 240_000 });
  let e: EscenarioComercio;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(300_000);
    e = await prepararEscenarioComercio(request);
  });

  test('todo campo con error lleva borde rojo y el naranja queda para el foco (G02)', async ({ page }) => {
    await page.goto('/registro-cliente.html');
    await page.getByTestId('btn-continuar').click();
    await expect(page.locator('[aria-invalid="true"]').nth(2)).toBeVisible();
    const rojo = await tokenComoRgb(page, '--color-error');
    const naranja = await tokenComoRgb(page, '--color-primary');
    const bordes = await page.evaluate(() => {
      const enfocado = document.activeElement;
      return [...document.querySelectorAll('[aria-invalid="true"]')].map((control) => {
        const envoltorio = control.closest('.input-shell, .select-shell, .textarea-shell') as HTMLElement | null;
        const estilo = envoltorio ? getComputedStyle(envoltorio) : null;
        return { enfocado: control === enfocado, borde: estilo ? estilo.borderTopColor : null, hay: Boolean(envoltorio) };
      }).filter((dato) => dato.hay);
    });
    expect(bordes.length).toBeGreaterThanOrEqual(3);
    const sinFoco = bordes.filter((dato) => !dato.enfocado);
    expect(sinFoco.length).toBeGreaterThanOrEqual(2);
    for (const dato of sinFoco) {
      expect(dato.borde).toBe(rojo);
    }
    for (const dato of bordes.filter((d) => d.enfocado)) {
      expect(dato.borde).toBe(naranja);
    }
  });

  test('las hojas de anular y rechazar un pedido ofrecen «Volver» y no «Cancelar» (G04)', async ({ page, request }) => {
    await abrirComoDueno(page, request, e);
    await page.goto(`/comercio-pedido-detalle.html?id=${e.pedidos.pendiente}`);
    await page.getByTestId('btn-rechazar-pedido').click();
    await expect(page.getByTestId('modal-rechazar-pedido')).toBeVisible();
    await expect(page.getByTestId('btn-cancelar-rechazo')).toHaveText('Volver');
    await page.getByTestId('btn-cancelar-rechazo').click();
    await expect(page.getByTestId('modal-rechazar-pedido')).toHaveCount(0);

    await page.goto(`/comercio-pedido-detalle.html?id=${e.pedidos.preparacion}`);
    await page.getByTestId('btn-anular-pedido').click();
    await expect(page.getByTestId('modal-anular-pedido')).toBeVisible();
    await expect(page.getByTestId('btn-cancelar-anulacion')).toHaveText('Volver');
  });

  test('con cantidad 1 el «−» del carrito queda deshabilitado y quitar es solo el ícono de eliminar (G05)', async ({ page, request }) => {
    const sesion = await abrirComoCliente(page, request, e);
    await dejarCarritoConItems(request, e, sesion.token);
    await page.goto('/carrito.html');
    const filas = page.locator('.cart-item');
    await expect(filas).toHaveCount(2);
    const filaDeUno = filas.filter({ has: page.locator('.stepper__value', { hasText: /^1$/ }) }).first();
    const menos = filaDeUno.locator('[data-testid^="btn-restar-cantidad-"]');
    await expect(menos).toBeDisabled();
    await expect(menos.locator('svg line')).toHaveCount(1);
    await expect(filaDeUno.locator('[data-testid^="btn-eliminar-item-carrito-"]')).toBeEnabled();
    const filaDeDos = filas.filter({ has: page.locator('.stepper__value', { hasText: /^2$/ }) }).first();
    await expect(filaDeDos.locator('[data-testid^="btn-restar-cantidad-"]')).toBeEnabled();
  });

  test('la hoja del producto no deja restos de separador bajo la descripción (G06)', async ({ page, request }) => {
    await abrirComoCliente(page, request, e);
    await page.goto(`/comercio-detalle.html?id=${e.dueno.comercioId}`);
    await page.getByTestId(`producto-item-${e.productoIds[0]}`).click();
    const hoja = page.getByTestId('modal-detalle-producto');
    await expect(hoja).toBeVisible();
    await expect(hoja.locator('.divider')).toHaveCount(0);
  });

  test('en Mis pedidos el estado no se superpone al nombre del comercio (M01)', async ({ page, request }) => {
    await abrirComoCliente(page, request, e);
    await page.goto('/pedidos.html');
    const tarjeta = page.locator('.pedido-card').first();
    await expect(tarjeta).toBeVisible();
    const nombre = await caja(tarjeta.locator('.pedido-card__comercio'));
    const estado = await caja(tarjeta.locator('.pedido-estado'));
    expect(estado.y).toBeGreaterThanOrEqual(nombre.y + nombre.height - 1);
    const tarjetaCaja = await caja(tarjeta);
    expect(estado.x + estado.width).toBeLessThanOrEqual(tarjetaCaja.x + tarjetaCaja.width);
  });

  test('en el catálogo el estado del comercio va en su propia fila bajo el nombre (M02)', async ({ page, request }) => {
    await abrirComoCliente(page, request, e);
    await page.goto('/index.html');
    const tarjeta = page.getByTestId(`comercio-card-${e.dueno.comercioId}`);
    await expect(tarjeta).toBeVisible();
    const nombre = await caja(tarjeta.locator('h3'));
    const estado = await caja(tarjeta.locator('.comercio-estado-badge, [class*="estado"]').first());
    expect(estado.y).toBeGreaterThanOrEqual(nombre.y + nombre.height - 1);
    const lineas = await tarjeta.locator('h3').evaluate((nodo) => ({ clamp: getComputedStyle(nodo).webkitLineClamp, ws: getComputedStyle(nodo).whiteSpace }));
    expect(lineas.clamp).toBe('2');
    expect(lineas.ws).not.toBe('nowrap');
  });

  test('sin tags para mostrar, Explorar y el formulario de producto ocultan su sección de tags (M03 y N02)', async ({ page, request }) => {
    await abrirComoCliente(page, request, e);
    await page.route('**/api/v1/catalogo/filtros', async (ruta) => {
      const respuesta = await ruta.fetch();
      const json = await respuesta.json();
      json.data.tags = [];
      await ruta.fulfill({ response: respuesta, json });
    });
    await page.goto('/explorar.html');
    await expect(page.getByTestId('contador-resultados-explorar')).toHaveText(/^\d+ resultados?$/);
    await expect(page.getByText('Filtrar por tags')).toBeHidden();
    await expect(page.getByTestId('fila-chips-tags')).toBeHidden();

    const duenoPage = await page.context().newPage();
    await duenoPage.route('**/api/v1/tags', async (ruta) => {
      if (ruta.request().method() !== 'GET') return ruta.continue();
      const respuesta = await ruta.fetch();
      const json = await respuesta.json();
      json.data = [];
      return ruta.fulfill({ response: respuesta, json });
    });
    await abrirComoDueno(duenoPage, request, e);
    await duenoPage.goto('/comercio-producto-form.html');
    await expect(duenoPage.getByTestId('select-categoria-producto')).toBeVisible();
    await expect(duenoPage.getByText('Tags / Preferencias alimentarias')).toBeHidden();
    await duenoPage.close();
  });

  test('el título de Reclamos del Administrador no se duplica en móvil (M06)', async ({ page, request }) => {
    const { fijarPasswordAdminYLoguear } = await import('./helpers/backend');
    const admin = await fijarPasswordAdminYLoguear(request);
    const { abrirComoUsuario } = await import('./helpers/multicomercio');
    await abrirComoUsuario(page, admin);
    await page.goto('/admin-reclamos.html');
    await expect(page.getByTestId('filtros-reclamos')).toBeVisible();
    const visibles = await page.evaluate(() => [...document.querySelectorAll('h1')]
      .filter((h) => (h.textContent || '').trim() === 'Reclamos')
      .filter((h) => { const r = h.getBoundingClientRect(); return r.width > 2 && r.height > 2; }).length);
    expect(visibles).toBe(1);
  });

  test('las casillas del código de verificación tienen borde marcado y naranja con foco (N01)', async ({ page }) => {
    await page.goto('/verificar-email.html?email=prueba@bajonea.test');
    const casilla = page.locator('.otp-input').first();
    await expect(casilla).toBeVisible();
    const borde = await casilla.evaluate((nodo) => getComputedStyle(nodo).borderTopColor);
    expect(borde).toBe('rgb(145, 137, 128)');
    await casilla.focus();
    const bordeConFoco = await casilla.evaluate((nodo) => getComputedStyle(nodo).borderTopColor);
    expect(bordeConFoco).toBe(await tokenComoRgb(page, '--color-primary'));
  });

  test('el sonido del perfil del comercio respeta el mismo margen lateral que el resto de los bloques (N04)', async ({ page, request }) => {
    await abrirComoDueno(page, request, e);
    await page.goto('/comercio-perfil.html');
    const sonido = page.getByTestId('sonido-avisos');
    await expect(sonido).toBeVisible();
    const tarjeta = await caja(sonido);
    const lista = await caja(page.locator('.profile-link-list').first());
    expect(Math.abs(tarjeta.x - lista.x)).toBeLessThanOrEqual(1);
    expect(Math.abs((tarjeta.x + tarjeta.width) - (lista.x + lista.width))).toBeLessThanOrEqual(1);
  });

  test('en el panel el sonido es una sola tarjeta y el aviso va dentro de ella solo si el audio está bloqueado (M04 y D05)', async ({ page, request }) => {
    await abrirComoDueno(page, request, e);
    await page.goto('/comercio-dashboard.html');
    const sonido = page.getByTestId('sonido-avisos');
    await expect(sonido).toBeVisible();
    const switchSonido = page.getByTestId('switch-sonido-avisos');
    await expect(switchSonido).toBeVisible();
    const ayuda = page.getByTestId('ayuda-sonido-bloqueado');
    if (await ayuda.isVisible()) {
      const cajaSonido = await caja(sonido);
      const cajaAyuda = await caja(ayuda);
      expect(cajaAyuda.y).toBeGreaterThanOrEqual(cajaSonido.y);
      expect(cajaAyuda.y + cajaAyuda.height).toBeLessThanOrEqual(cajaSonido.y + cajaSonido.height + 1);
    }
    const cierre = await caja(page.locator('#cierre-comercio-slot .cierre-card').first());
    const cajaSwitch = await caja(page.getByTestId('sonido-avisos').locator('.sonido-avisos__tarjeta'));
    expect(Math.abs(cajaSwitch.height - cierre.height)).toBeLessThanOrEqual(30);
  });

  test('la línea del horario no repite lo que dice el rótulo del turno (M04)', async ({ page, request }) => {
    await abrirComoDueno(page, request, e);
    await page.goto('/comercio-dashboard.html');
    await expect(page.getByTestId('turno-rotulo')).toBeVisible();
    await expect(page.getByTestId('mensaje-estado-comercio')).not.toContainText('está abierto ahora');
    await expect(page.getByTestId('turno-rotulo')).toContainText('00:00 a 23:59');
  });

  test('el sonido del perfil del Cliente va debajo del menú en móvil (M07)', async ({ page, request }) => {
    await abrirComoCliente(page, request, e);
    await page.goto('/perfil.html');
    await expect(page.getByTestId('btn-cerrar-sesion')).toBeVisible();
    const menu = await caja(page.getByTestId('lista-perfil'));
    const sonido = await caja(page.getByTestId('sonido-avisos'));
    expect(sonido.y).toBeGreaterThanOrEqual(menu.y + menu.height - 1);
  });

  test('los filtros activos de Equipo usan el naranja como Pedidos y Explorar (G01)', async ({ page, request }) => {
    await abrirComoDueno(page, request, e);
    await page.goto('/comercio-perfil.html?vista=equipo');
    await expect(page.getByTestId('equipo-chips')).toBeVisible();
    const activo = page.getByTestId('equipo-chips').locator('.chip[aria-pressed="true"]').first();
    await expect(activo).toBeVisible();
    const fondo = await activo.evaluate((nodo) => getComputedStyle(nodo).backgroundColor);
    expect(fondo).toBe(await tokenComoRgb(page, '--color-primary'));
  });
});
