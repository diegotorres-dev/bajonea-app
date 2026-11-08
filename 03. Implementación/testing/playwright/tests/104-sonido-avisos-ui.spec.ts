import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { abrirComoUsuario } from './helpers/multicomercio';
import { nuevoCliente, pedidoEnEstado, prepararEscenario } from './helpers/reclamos';
import type { Cliente, Escenario } from './helpers/reclamos';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

const CLAVE_PREFERENCIA = 'bajonea_sonido_avisos';

async function instalarAudioFalso(page: Page, { bloqueado = false } = {}) {
  await page.addInitScript((arrancaBloqueado) => {
    (window as any).__dings = 0;
    (window as any).__permitir = !arrancaBloqueado;
    class ContextoFalso {
      state = arrancaBloqueado ? 'suspended' : 'running';
      currentTime = 0;
      destination = {};
      addEventListener() {}
      resume() {
        if ((window as any).__permitir) {
          this.state = 'running';
        }
        return Promise.resolve();
      }
      createOscillator() {
        return {
          type: '',
          frequency: { setValueAtTime() {} },
          connect() {},
          start() {
            (window as any).__dings += 1;
          },
          stop() {},
        };
      }
      createGain() {
        return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
      }
    }
    (window as any).AudioContext = ContextoFalso;
  }, bloqueado);
}

const dings = (page: Page): Promise<number> => page.evaluate(() => (window as any).__dings);

test.describe('Pulido 1: sonido de avisos', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let esc: Escenario;

  test.beforeAll(async ({ request }) => {
    esc = await prepararEscenario(request);
  });

  test('el Cliente oye un aviso nuevo, pero no los que ya estaban al cargar la pantalla', async ({ page, request }) => {
    const cliente: Cliente = await nuevoCliente(request, esc.localidadId);
    await pedidoEnEstado(request, esc, cliente, 'EN_PREPARACION');

    await instalarAudioFalso(page);
    await page.clock.install();
    await abrirComoUsuario(page, cliente.sesion);
    await page.goto('/index.html');
    await expect(page.getByTestId('contador-notificaciones')).toHaveText('1');
    await page.waitForLoadState('networkidle');
    expect(await dings(page)).toBe(0);

    await page.clock.fastForward(15_000);
    await page.waitForTimeout(300);
    expect(await dings(page)).toBe(0);

    await pedidoEnEstado(request, esc, cliente, 'EN_PREPARACION');
    await page.clock.fastForward(15_000);
    await expect(page.getByTestId('contador-notificaciones')).toHaveText('2');
    await expect.poll(() => dings(page)).toBe(1);

    await page.clock.fastForward(15_000);
    await page.waitForTimeout(300);
    expect(await dings(page)).toBe(1);
  });

  test('el Dueño oye el pedido que entra mientras mira el panel, y no oye los que ya estaban', async ({ page, request }) => {
    const comprador = await nuevoCliente(request, esc.localidadId);
    await pedidoEnEstado(request, esc, comprador, 'PENDIENTE');

    await instalarAudioFalso(page);
    await page.clock.install();
    await abrirComoUsuario(page, esc.dueno.sesion);
    await page.goto('/comercio-dashboard.html');
    await expect(page.getByTestId('lista-pedidos-activos')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);
    expect(await dings(page)).toBe(0);

    await pedidoEnEstado(request, esc, comprador, 'PENDIENTE');
    await page.clock.fastForward(15_000);
    await expect.poll(() => dings(page)).toBe(1);
  });

  test('el interruptor nace encendido, se guarda y lo comparten el panel y el perfil del comercio', async ({ page, request }) => {
    await instalarAudioFalso(page);
    await abrirComoUsuario(page, esc.dueno.sesion);
    await page.goto('/comercio-dashboard.html');
    const interruptor = page.getByTestId('switch-sonido-avisos');
    await expect(interruptor).toHaveAttribute('aria-checked', 'true');
    await expect(interruptor).toHaveAttribute('role', 'switch');
    await sinScrollHorizontal(page);

    await interruptor.click();
    await expect(interruptor).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('.toast')).toContainText('Sonido de avisos desactivado');
    expect(await page.evaluate((clave) => localStorage.getItem(clave), CLAVE_PREFERENCIA)).toBe('0');

    await page.goto('/comercio-perfil.html');
    await expect(page.getByTestId('switch-sonido-avisos')).toHaveAttribute('aria-checked', 'false');
    await sinScrollHorizontal(page);
    await page.getByTestId('switch-sonido-avisos').click();
    await expect(page.getByTestId('switch-sonido-avisos')).toHaveAttribute('aria-checked', 'true');
    expect(await dings(page)).toBe(1);

    await page.goto('/comercio-dashboard.html');
    await expect(page.getByTestId('switch-sonido-avisos')).toHaveAttribute('aria-checked', 'true');
  });

  test('con el sonido apagado, un aviso nuevo no suena', async ({ page, request }) => {
    const cliente = await nuevoCliente(request, esc.localidadId);
    await pedidoEnEstado(request, esc, cliente, 'EN_PREPARACION');
    await instalarAudioFalso(page);
    await page.addInitScript((clave) => localStorage.setItem(clave, '0'), CLAVE_PREFERENCIA);
    await page.clock.install();
    await abrirComoUsuario(page, cliente.sesion);
    await page.goto('/perfil.html');
    await expect(page.getByTestId('switch-sonido-avisos')).toHaveAttribute('aria-checked', 'false');

    await page.goto('/index.html');
    await expect(page.getByTestId('contador-notificaciones')).toHaveText('1');
    await page.waitForLoadState('networkidle');
    await pedidoEnEstado(request, esc, cliente, 'EN_PREPARACION');
    await page.clock.fastForward(15_000);
    await expect(page.getByTestId('contador-notificaciones')).toHaveText('2');
    await page.waitForTimeout(300);
    expect(await dings(page)).toBe(0);
  });

  test('el perfil del Cliente tiene el interruptor y arranca encendido', async ({ page, request }) => {
    const cliente = await nuevoCliente(request, esc.localidadId);
    await instalarAudioFalso(page);
    await abrirComoUsuario(page, cliente.sesion);
    await page.goto('/perfil.html');
    await expect(page.getByTestId('switch-sonido-avisos')).toHaveAttribute('aria-checked', 'true');
    await sinScrollHorizontal(page);
  });

  test('si el navegador tiene el audio bloqueado se explica y "Activar sonido" lo habilita', async ({ page }) => {
    await instalarAudioFalso(page, { bloqueado: true });
    await abrirComoUsuario(page, esc.dueno.sesion);
    await page.goto('/comercio-dashboard.html');

    const ayuda = page.getByTestId('ayuda-sonido-bloqueado');
    await expect(ayuda).toBeVisible();
    await expect(ayuda).toContainText('Para que suene, tocá una vez en esta pantalla.');
    const activar = page.getByTestId('btn-activar-sonido');
    const caja = (await activar.boundingBox())!;
    expect(caja.height).toBeGreaterThanOrEqual(44);
    await sinScrollHorizontal(page);

    await page.evaluate(() => {
      (window as any).__permitir = true;
    });
    await activar.click();
    await expect(ayuda).toBeHidden();
    await expect.poll(() => dings(page)).toBe(1);
  });

  test('con el sonido apagado no se muestra la ayuda del audio bloqueado', async ({ page }) => {
    await instalarAudioFalso(page, { bloqueado: true });
    await page.addInitScript((clave) => localStorage.setItem(clave, '0'), CLAVE_PREFERENCIA);
    await abrirComoUsuario(page, esc.dueno.sesion);
    await page.goto('/comercio-dashboard.html');
    await expect(page.getByTestId('switch-sonido-avisos')).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('ayuda-sonido-bloqueado')).toBeHidden();
  });
});
