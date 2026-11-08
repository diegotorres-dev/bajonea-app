import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { fijarPasswordAdminYLoguear, obtenerLocalidadRioGrande, resolverComercio } from './helpers/backend';
import { abrirComoUsuario, loginUi, prepararRechazado, registrarPendiente } from './helpers/multicomercio';
import { clonarConRedes } from './helpers/multicomercio';
import { abrirComoUsuarioConComercio, abrirPanel } from './helpers/selector';
import { prepararEscenario } from './helpers/reclamos';
import type { Escenario } from './helpers/reclamos';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

const CLAVE_PREFERENCIA = 'bajonea_sonido_avisos';

async function instalarAudioFalso(page: Page) {
  await page.addInitScript(() => {
    (window as any).__dings = 0;
    class ContextoFalso {
      state = 'running';
      currentTime = 0;
      destination = {};
      addEventListener() {}
      resume() {
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
  });
}

const dings = (page: Page): Promise<number> => page.evaluate(() => (window as any).__dings);

test.describe('Tramo 2B, bloque 3: las pantallas de espera del Dueño reaccionan solas', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminToken: string;
  let localidadId: string;

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
  });

  test('un Dueño con su único comercio pendiente inicia sesión y ve la pantalla de espera', async ({ page, request }) => {
    const dueno = await registrarPendiente(request, adminToken, localidadId);
    await loginUi(page, dueno.nombreUsuario, dueno.password);
    await page.waitForURL(`**/comercio-pendiente.html?id=${dueno.comercioId}`);
    await expect(page.getByTestId('btn-volver-a-mis-comercios')).toBeVisible();
    await sinScrollHorizontal(page);
  });

  test('cuando el Administrador aprueba, la pantalla lleva sola al panel, con el toast y el sonido', async ({ page, request }) => {
    const dueno = await registrarPendiente(request, adminToken, localidadId);
    await instalarAudioFalso(page);
    await page.clock.install();
    await abrirComoUsuario(page, dueno.sesion);
    await page.goto(`/comercio-pendiente.html?id=${dueno.comercioId}`);
    await expect(page.getByTestId('btn-volver-a-mis-comercios')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await dings(page)).toBe(0);

    await page.clock.fastForward(15_000);
    await page.waitForTimeout(300);
    expect(page.url()).toContain('comercio-pendiente.html');
    expect(await dings(page)).toBe(0);

    await resolverComercio(request, adminToken, dueno.comercioId, true);
    await page.clock.fastForward(15_000);
    await expect.poll(() => dings(page)).toBe(1);
    await page.clock.fastForward(1000);
    await page.waitForURL('**/comercio-dashboard.html');
    await expect(page.locator('.toast')).toContainText('Tu comercio fue aprobado');
  });

  test('con el sonido apagado en el interruptor, el cambio lleva al panel pero no suena', async ({ page, request }) => {
    const dueno = await registrarPendiente(request, adminToken, localidadId);
    await instalarAudioFalso(page);
    await page.addInitScript((clave) => localStorage.setItem(clave, '0'), CLAVE_PREFERENCIA);
    await page.clock.install();
    await abrirComoUsuario(page, dueno.sesion);
    await page.goto(`/comercio-pendiente.html?id=${dueno.comercioId}`);
    await expect(page.getByTestId('btn-volver-a-mis-comercios')).toBeVisible();
    await page.waitForLoadState('networkidle');

    await resolverComercio(request, adminToken, dueno.comercioId, true);
    await page.clock.fastForward(15_000);
    await page.waitForURL('**/comercio-dashboard.html');
    expect(await dings(page)).toBe(0);
  });

  test('cuando el Administrador rechaza, la pantalla lleva sola a la de rechazo con su motivo', async ({ page, request }) => {
    const dueno = await registrarPendiente(request, adminToken, localidadId);
    await page.clock.install();
    await abrirComoUsuario(page, dueno.sesion);
    await page.goto(`/comercio-pendiente.html?id=${dueno.comercioId}`);
    await expect(page.getByTestId('btn-volver-a-mis-comercios')).toBeVisible();
    await page.waitForLoadState('networkidle');

    await resolverComercio(request, adminToken, dueno.comercioId, false, 'Falta informacion del local');
    await page.clock.fastForward(15_000);
    await page.waitForURL(`**/comercio-rechazado.html?id=${dueno.comercioId}`);
    await expect(page.getByTestId('motivo-rechazo-comercio')).toContainText('Falta informacion del local');
  });

  test('la pantalla de rechazo también reacciona: si el comercio vuelve a quedar pendiente la lleva a la espera', async ({ page, request }) => {
    const dueno = await prepararRechazado(request, adminToken, localidadId);
    await page.clock.install();
    await abrirComoUsuario(page, dueno.sesion);
    await page.goto(`/comercio-rechazado.html?id=${dueno.comercioId}`);
    await expect(page.getByTestId('btn-corregir-solicitud')).toBeVisible();
    await page.waitForLoadState('networkidle');

    const { sqlTest } = await import('./helpers/backend');
    sqlTest(`UPDATE comercio SET estado = 'PENDIENTE' WHERE id = ${dueno.comercioId};`);
    await page.clock.fastForward(15_000);
    await page.waitForURL(`**/comercio-pendiente.html?id=${dueno.comercioId}`);
  });

  test('con la pestaña oculta la espera no consulta y al volver a verse revisa enseguida', async ({ page, request }) => {
    const dueno = await registrarPendiente(request, adminToken, localidadId);
    await page.clock.install();
    await abrirComoUsuario(page, dueno.sesion);
    await page.goto(`/comercio-pendiente.html?id=${dueno.comercioId}`);
    await expect(page.getByTestId('btn-volver-a-mis-comercios')).toBeVisible();
    await page.waitForLoadState('networkidle');

    let consultas = 0;
    page.on('request', (peticion) => {
      if (peticion.method() === 'GET' && /\/api\/v1\/comercios\/perfil$/.test(peticion.url())) {
        consultas += 1;
      }
    });
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.fastForward(45_000);
    await page.waitForTimeout(300);
    expect(consultas).toBe(0);

    await resolverComercio(request, adminToken, dueno.comercioId, true);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.fastForward(1000);
    await page.waitForURL('**/comercio-dashboard.html');
    expect(consultas).toBeGreaterThanOrEqual(1);
  });

  test('un Dueño con un comercio aprobado y otro pendiente trabaja en el aprobado y el cambio del otro solo se ve en el panel, sin sonido ni salto', async ({ page, request }) => {
    const esc: Escenario = await prepararEscenario(request);
    const pendienteId = await clonarConRedes(request, esc.dueno.comercioId, `Segundo pendiente ${Date.now()}`, 'PENDIENTE');
    await instalarAudioFalso(page);
    await page.clock.install();
    await abrirComoUsuarioConComercio(page, esc.dueno.sesion, { comercioActivoId: esc.dueno.comercioId });
    await page.goto('/comercio-dashboard.html');
    await page.waitForLoadState('networkidle');
    await abrirPanel(page);
    await expect(page.getByTestId(`etiqueta-estado-comercio-${pendienteId}`)).toBeVisible();

    await resolverComercio(request, esc.adminToken, pendienteId, true);
    await page.clock.fastForward(15_000);
    await page.waitForTimeout(500);
    expect(page.url()).toContain('comercio-dashboard.html');
    expect(await dings(page)).toBe(0);
    await expect(page.getByTestId(`etiqueta-estado-comercio-${pendienteId}`)).toHaveCount(0);
    await expect(page.getByTestId(`subtitulo-comercio-${pendienteId}`)).toContainText('1 notificación');
  });
});
