import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { sqlTest as sql } from './helpers/backend';
import { abrirComoUsuario } from './helpers/multicomercio';
import { prepararEscenario } from './helpers/reclamos';
import type { Escenario } from './helpers/reclamos';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

function sembrarAviso(esc: Escenario, tipo: string, mensaje: string, leida = false, entidad: 'COMERCIO' | 'PEDIDO' = 'COMERCIO', entidadId?: number): number {
  const id = entidadId ?? esc.dueno.comercioId;
  sql(
    `INSERT INTO notificacion (usuario_id, tipo, mensaje, leida, fecha_creacion, canal, estado, entidad_tipo, entidad_id, comercio_id) ` +
      `VALUES (${esc.dueno.duenoId}, '${tipo}', '${mensaje}', ${leida ? 1 : 0}, NOW(), 'PUSH', 'PENDIENTE', '${entidad}', ${id}, ${esc.dueno.comercioId});`,
  );
  return Number(sql(`SELECT MAX(id) FROM notificacion WHERE usuario_id = ${esc.dueno.duenoId};`));
}

async function abrirNotificaciones(page: Page, esc: Escenario) {
  await abrirComoUsuario(page, esc.dueno.sesion);
  await page.goto('/notificaciones.html');
  await expect(page.locator('[data-testid^="notificacion-item-"]').first()).toBeVisible();
}

test.describe('Tramo 2B, bloque 1: la tarjeta de aviso', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let esc: Escenario;

  test.beforeAll(async ({ request }) => {
    esc = await prepararEscenario(request);
  });

  test.beforeEach(() => {
    sql(`DELETE FROM notificacion WHERE usuario_id = ${esc.dueno.duenoId};`);
  });

  test('con destino es un enlace con chevron y sin destino es un botón sin chevron, nunca un div', async ({ page }) => {
    const conDestino = sembrarAviso(esc, 'COMERCIO_APTO_VENTA', 'Tu comercio ya puede recibir pedidos');
    const sinDestino = sembrarAviso(esc, 'COMERCIO_INACTIVADO', 'Tu comercio dejó de estar disponible');
    await abrirNotificaciones(page, esc);

    const enlace = page.getByTestId(`notificacion-item-${conDestino}`);
    const boton = page.getByTestId(`notificacion-item-${sinDestino}`);
    expect(await enlace.evaluate((nodo) => nodo.tagName)).toBe('A');
    await expect(enlace).toHaveAttribute('href', 'comercio-dashboard.html');
    await expect(enlace.locator('.notification-item__chevron')).toHaveCount(1);
    await expect(page.getByTestId(`btn-ver-destino-notificacion-${conDestino}`)).toHaveText('Ir al panel');

    expect(await boton.evaluate((nodo) => nodo.tagName)).toBe('BUTTON');
    await expect(boton).toHaveAttribute('type', 'button');
    await expect(boton.locator('.notification-item__chevron')).toHaveCount(0);
    await expect(boton.locator('.notification-item__destino')).toHaveCount(0);

    expect(await page.locator('div.notification-item').count()).toBe(0);
    await sinScrollHorizontal(page);
  });

  test('la zona táctil de cada tarjeta mide al menos 44 px de alto', async ({ page }) => {
    const a = sembrarAviso(esc, 'COMERCIO_APTO_VENTA', 'Corto');
    const b = sembrarAviso(esc, 'COMERCIO_INACTIVADO', 'Otro corto');
    await abrirNotificaciones(page, esc);
    for (const id of [a, b]) {
      const caja = (await page.getByTestId(`notificacion-item-${id}`).boundingBox())!;
      expect(caja.height).toBeGreaterThanOrEqual(44);
      expect(caja.width).toBeGreaterThan(300);
    }
  });

  test('por teclado la tarjeta recibe el foco con un contorno visible y Enter la abre', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit no pasa por los enlaces con Tab (hace falta Opción+Tab): se verifica solo en Chromium');
    const id = sembrarAviso(esc, 'COMERCIO_APTO_VENTA', 'Entrar con teclado');
    await abrirNotificaciones(page, esc);
    const tarjeta = page.getByTestId(`notificacion-item-${id}`);
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      if (await tarjeta.evaluate((nodo) => nodo === document.activeElement)) {
        break;
      }
    }
    await expect(tarjeta).toBeFocused();
    const contorno = await tarjeta.evaluate((nodo) => {
      const estilo = getComputedStyle(nodo);
      return { estilo: estilo.outlineStyle, ancho: parseFloat(estilo.outlineWidth) };
    });
    expect(contorno.estilo).not.toBe('none');
    expect(contorno.ancho).toBeGreaterThanOrEqual(2);
    await page.keyboard.press('Enter');
    await page.waitForURL('**/comercio-dashboard.html');
  });

  test('"No leída" no depende del color: está en el nombre accesible y el fondo suave solo acompaña', async ({ page }) => {
    const sinLeer = sembrarAviso(esc, 'COMERCIO_APTO_VENTA', 'Aviso sin leer');
    const leido = sembrarAviso(esc, 'COMERCIO_SIN_APTITUD', 'Aviso ya leído', true);
    await abrirNotificaciones(page, esc);

    await expect(page.getByTestId(`notificacion-item-${sinLeer}`)).toHaveAccessibleName(/^No leída\./);
    expect(await page.getByTestId(`notificacion-item-${leido}`).getAttribute('aria-label')).toBeNull();
    await expect(page.getByTestId(`notificacion-item-${leido}`)).not.toHaveAccessibleName(/No leída/);

    const fondos = await page.evaluate(([a, b]) => {
      const color = (id: number) => getComputedStyle(document.querySelector(`[data-testid="notificacion-item-${id}"]`)!).backgroundColor;
      return { sinLeer: color(a as number), leido: color(b as number), suave: getComputedStyle(document.documentElement).getPropertyValue('--color-primary-soft').trim() };
    }, [sinLeer, leido]);
    expect(fondos.sinLeer).not.toBe(fondos.leido);
    expect(fondos.suave).toBe('#fff0eb');
    expect(fondos.sinLeer).toBe('rgb(255, 240, 235)');

    const pesos = await page.evaluate(([a, b]) => {
      const peso = (id: number) => getComputedStyle(document.querySelector(`[data-testid="notificacion-item-${id}"] .notification-item__texto`)!).fontWeight;
      return [peso(a as number), peso(b as number)];
    }, [sinLeer, leido]);
    expect(pesos[0]).toBe(pesos[1]);
  });

  test('tocar una tarjeta con destino marca la lectura antes de navegar', async ({ page }) => {
    const id = sembrarAviso(esc, 'COMERCIO_APTO_VENTA', 'Marcar y abrir');
    await abrirNotificaciones(page, esc);
    const marca = page.waitForResponse((res) => res.url().endsWith(`/notificaciones/${id}/leida`) && res.request().method() === 'PUT');
    await page.getByTestId(`notificacion-item-${id}`).click();
    expect((await marca).status()).toBe(200);
    await page.waitForURL('**/comercio-dashboard.html');
    expect(sql(`SELECT leida FROM notificacion WHERE id = ${id};`)).toBe('1');
  });

  test('si la marca de lectura falla se ignora el error y se navega igual', async ({ page }) => {
    const id = sembrarAviso(esc, 'COMERCIO_APTO_VENTA', 'La marca falla');
    await abrirNotificaciones(page, esc);
    await page.route(`**/notificaciones/${id}/leida`, (ruta) => ruta.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ mensaje: 'caído', data: null }) }));
    await page.getByTestId(`notificacion-item-${id}`).click();
    await page.waitForURL('**/comercio-dashboard.html', { timeout: 5000 });
    expect(sql(`SELECT leida FROM notificacion WHERE id = ${id};`)).toBe('0');
  });

  test('una marca que no responde no retiene la navegación más de un par de segundos', async ({ page }) => {
    const id = sembrarAviso(esc, 'COMERCIO_APTO_VENTA', 'La marca no responde');
    await abrirNotificaciones(page, esc);
    await page.route(`**/notificaciones/${id}/leida`, () => undefined);
    const inicio = Date.now();
    await page.getByTestId(`notificacion-item-${id}`).click();
    await page.waitForURL('**/comercio-dashboard.html', { timeout: 6000 });
    expect(Date.now() - inicio).toBeLessThan(5000);
  });

  test('tocar una tarjeta sin destino la marca leída, no navega y queda sin acción', async ({ page }) => {
    const id = sembrarAviso(esc, 'COMERCIO_INACTIVADO', 'Solo informativo');
    await abrirNotificaciones(page, esc);
    const tarjeta = page.getByTestId(`notificacion-item-${id}`);
    await expect(tarjeta).toBeEnabled();
    const marca = page.waitForResponse((res) => res.url().endsWith(`/notificaciones/${id}/leida`) && res.request().method() === 'PUT');
    await tarjeta.click();
    expect((await marca).status()).toBe(200);
    await expect(tarjeta).toHaveClass(/notification-item--leida/);
    expect(await tarjeta.evaluate((nodo) => nodo.tagName)).toBe('DIV');
    await expect(tarjeta).not.toBeDisabled();
    expect(page.url()).toContain('/notificaciones.html');
    expect(sql(`SELECT leida FROM notificacion WHERE id = ${id};`)).toBe('1');
    await expect(tarjeta).not.toHaveAccessibleName(/No leída/);
  });

  test('un clic con la tecla Ctrl no navega esta pestaña', async ({ page }) => {
    const id = sembrarAviso(esc, 'COMERCIO_APTO_VENTA', 'Abrir aparte');
    await abrirNotificaciones(page, esc);
    await page.getByTestId(`notificacion-item-${id}`).click({ modifiers: ['Control'] });
    await page.waitForTimeout(600);
    expect(page.url()).toContain('/notificaciones.html');
  });

  test('la lista deja de sondear con la pestaña oculta y refresca apenas vuelve a verse', async ({ page }) => {
    sembrarAviso(esc, 'COMERCIO_APTO_VENTA', 'Primero');
    await page.clock.install();
    await abrirComoUsuario(page, esc.dueno.sesion);
    await page.goto('/notificaciones.html');
    await expect(page.locator('[data-testid^="notificacion-item-"]').first()).toBeVisible();
    await page.waitForLoadState('networkidle');

    let pedidos = 0;
    page.on('request', (peticion) => {
      if (peticion.method() === 'GET' && /\/api\/v1\/notificaciones$/.test(peticion.url())) {
        pedidos += 1;
      }
    });
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.fastForward(45_000);
    await page.waitForTimeout(300);
    expect(pedidos).toBe(0);

    sembrarAviso(esc, 'COMERCIO_SIN_APTITUD', 'Llego mientras estaba oculta');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByText('Llego mientras estaba oculta')).toBeVisible();
    expect(pedidos).toBeGreaterThanOrEqual(1);
  });
});
