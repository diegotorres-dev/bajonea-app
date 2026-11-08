import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { sqlTest as sql } from './helpers/backend';
import { abrirComoUsuario } from './helpers/multicomercio';
import { nuevoCliente, pedidoEnCamino, pedidoEnEstado, TOTAL_PEDIDO, prepararEscenario } from './helpers/reclamos';
import type { Cliente, Escenario } from './helpers/reclamos';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

const estadoDe = (pedidoId: number): string => sql(`SELECT estado FROM pedido WHERE id = ${pedidoId};`);

test.describe('Pulido 1, C01 y C02: hoja de confirmación del Cliente', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  let esc: Escenario;
  let cliente: Cliente;

  test.beforeAll(async ({ request }) => {
    esc = await prepararEscenario(request);
    cliente = await nuevoCliente(request, esc.localidadId);
  });

  async function abrirDetalle(page: Page, pedidoId: number) {
    await abrirComoUsuario(page, cliente.sesion);
    await page.goto(`/pedido-detalle.html?id=${pedidoId}`);
  }

  test('cancelar un pedido pagado pide confirmación con el total real y el foco en "Volver"', async ({ page, request }) => {
    const pedidoId = await pedidoEnEstado(request, esc, cliente, 'EN_PREPARACION');
    await abrirDetalle(page, pedidoId);
    await page.getByTestId('btn-cancelar-pedido').click();

    const hoja = page.getByRole('dialog');
    await expect(hoja).toBeVisible();
    await expect(hoja).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByTestId('hoja-cancelar-pedido-titulo')).toHaveText(`¿Cancelar el pedido #${pedidoId}?`);
    const importe = `$${Math.round(TOTAL_PEDIDO).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
    await expect(page.getByTestId('hoja-cancelar-pedido-texto-1')).toHaveText(
      `Ya lo pagaste. Si lo cancelás, te devolvemos los ${importe} a Mercado Pago. Puede demorar en verse en tu cuenta.`,
    );
    await expect(page.getByTestId('btn-volver-hoja')).toBeFocused();
    await expect(page.getByTestId('btn-confirmar-cancelar-pedido')).toHaveText('Sí, cancelar pedido');
    await sinScrollHorizontal(page);

    const rojo = await page.getByTestId('btn-confirmar-cancelar-pedido').evaluate((boton) => getComputedStyle(boton).backgroundColor);
    expect(rojo).toBe('rgb(217, 48, 37)');
    const cajaConfirmar = (await page.getByTestId('btn-confirmar-cancelar-pedido').boundingBox())!;
    const cajaVolver = (await page.getByTestId('btn-volver-hoja').boundingBox())!;
    expect(Math.round(cajaVolver.y - (cajaConfirmar.y + cajaConfirmar.height))).toBe(12);

    expect(estadoDe(pedidoId)).toBe('EN_PREPARACION');
  });

  test('Escape, tocar el fondo y "Volver" cierran la hoja sin cancelar; el foco vuelve al botón', async ({ page, request }) => {
    const pedidoId = await pedidoEnEstado(request, esc, cliente, 'EN_PREPARACION');
    await abrirDetalle(page, pedidoId);
    const disparador = page.getByTestId('btn-cancelar-pedido');

    await disparador.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(disparador).toBeFocused();

    await disparador.click();
    await page.getByTestId('hoja-cancelar-pedido').click({ position: { x: 5, y: 5 } });
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await disparador.click();
    await page.getByTestId('btn-volver-hoja').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(estadoDe(pedidoId)).toBe('EN_PREPARACION');
  });

  test('el foco queda atrapado dentro de la hoja con Tab y Shift+Tab', async ({ page, request }) => {
    const pedidoId = await pedidoEnEstado(request, esc, cliente, 'EN_PREPARACION');
    await abrirDetalle(page, pedidoId);
    await page.getByTestId('btn-cancelar-pedido').click();
    const dentro = () => page.evaluate(() => Boolean(document.activeElement && document.activeElement.closest('[role="dialog"]')));
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press('Tab');
      expect(await dentro()).toBe(true);
    }
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press('Shift+Tab');
      expect(await dentro()).toBe(true);
    }
  });

  test('un pedido sin pagar explica que no se cobra nada', async ({ page, request }) => {
    const pedidoId = await pedidoEnEstado(request, esc, cliente, 'EN_PREPARACION');
    await page.route('**/api/v1/pedidos/cliente', async (ruta) => {
      if (ruta.request().method() !== 'GET') {
        await ruta.continue();
        return;
      }
      const respuesta = await ruta.fetch();
      const cuerpo = await respuesta.json();
      cuerpo.data.forEach((pedido: any) => {
        if (pedido.id === pedidoId) {
          pedido.estado = 'PENDIENTE_PAGO';
          pedido.pagoEstado = 'PENDIENTE';
          pedido.comercioNoDisponible = true;
        }
      });
      await ruta.fulfill({ response: respuesta, json: cuerpo });
    });
    await abrirDetalle(page, pedidoId);
    await page.getByTestId('btn-cancelar-pedido').click();
    await expect(page.getByTestId('hoja-cancelar-pedido-texto-1')).toHaveText('Todavía no lo pagaste, así que no se te cobra nada.');
    await expect(page.getByTestId('hoja-cancelar-pedido-titulo')).toHaveText(`¿Cancelar el pedido #${pedidoId}?`);
  });

  test('si el servidor rechaza la cancelación, el error se ve dentro de la hoja, que sigue abierta', async ({ page, request }) => {
    const pedidoId = await pedidoEnEstado(request, esc, cliente, 'EN_PREPARACION');
    await abrirDetalle(page, pedidoId);
    await page.getByTestId('btn-cancelar-pedido').click();

    await page.route('**/cancelar', (ruta) => ruta.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ mensaje: 'El pedido ya no se puede cancelar', data: null }),
    }));
    await page.getByTestId('btn-confirmar-cancelar-pedido').click();

    await expect(page.getByTestId('hoja-cancelar-pedido-error')).toHaveText('El pedido ya no se puede cancelar');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByTestId('btn-confirmar-cancelar-pedido')).toBeEnabled();
    await expect(page.getByTestId('btn-confirmar-cancelar-pedido')).toHaveText('Sí, cancelar pedido');
    expect(estadoDe(pedidoId)).toBe('EN_PREPARACION');
  });

  test('mientras se envía la hoja sigue abierta con "Cancelando…" y se cierra sola con el toast al terminar', async ({ page, request }) => {
    const pedidoId = await pedidoEnEstado(request, esc, cliente, 'EN_PREPARACION');
    await abrirDetalle(page, pedidoId);
    await page.getByTestId('btn-cancelar-pedido').click();

    await page.route('**/cancelar', async (ruta) => {
      await new Promise((resolver) => setTimeout(resolver, 1200));
      await ruta.continue();
    });
    await page.getByTestId('btn-confirmar-cancelar-pedido').click();
    await expect(page.getByTestId('btn-confirmar-cancelar-pedido')).toHaveText('Cancelando…');
    await expect(page.getByTestId('btn-confirmar-cancelar-pedido')).toBeDisabled();
    await expect(page.getByTestId('btn-volver-hoja')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeVisible();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.toast')).toContainText('Pedido cancelado');
    expect(estadoDe(pedidoId)).toBe('CANCELADO');
  });

  test('confirmar la recepción pide confirmación con botón de marca y no marca nada si se vuelve', async ({ page, request }) => {
    const pedidoId = await pedidoEnCamino(request, esc, cliente);
    await abrirDetalle(page, pedidoId);
    await page.getByTestId('btn-confirmar-entrega').click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByTestId('hoja-confirmar-recepcion-titulo')).toHaveText('¿Ya tenés tu pedido?');
    await expect(page.getByTestId('hoja-confirmar-recepcion-texto-1')).toHaveText('Si no lo recibiste, no lo confirmes todavía.');
    await expect(page.getByTestId('btn-volver-hoja')).toBeFocused();
    const color = await page.getByTestId('btn-confirmar-confirmar-recepcion').evaluate((boton) => getComputedStyle(boton).backgroundColor);
    expect(color).toBe('rgb(255, 71, 0)');
    await sinScrollHorizontal(page);

    await page.getByTestId('btn-volver-hoja').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(estadoDe(pedidoId)).toBe('EN_CAMINO');

    await page.getByTestId('btn-confirmar-entrega').click();
    await page.getByTestId('btn-confirmar-confirmar-recepcion').click();
    await expect(page.locator('.toast')).toContainText('Entrega confirmada');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(estadoDe(pedidoId)).toBe('ENTREGADO');
  });
});
