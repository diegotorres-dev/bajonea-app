import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { fijarPasswordAdminYLoguear, login, registrarYVerificarCliente } from './helpers/backend';
import { abrirComoUsuario } from './helpers/multicomercio';
import { abrirComoUsuarioConContexto, sumarAlEquipo } from './helpers/empleado';
import { accionDelComercio, nuevoCliente, pedidoEnEstado, prepararEscenario } from './helpers/reclamos';
import type { Escenario } from './helpers/reclamos';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

async function mostrarToast(page: Page, mensaje: string, tipo: 'success' | 'error' = 'success') {
  await page.evaluate(async ([texto, clase]) => {
    const modulo = await import('/js/catalogo.js');
    modulo.showToast(texto, clase);
  }, [mensaje, tipo]);
}

test.describe('Pulido 1, T06: el toast', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
    await page.goto('/login.html');
    await page.waitForLoadState('networkidle');
    await page.clock.pauseAt(new Date(Date.now() + 1000));
  });

  test('un toast de éxito dura 2,5 s y avisa como estado', async ({ page }) => {
    await mostrarToast(page, 'Guardado');
    const toast = page.locator('.toast');
    await expect(toast).toHaveAttribute('role', 'status');
    await expect(page.getByTestId('toast-exito')).toBeVisible();
    await page.clock.fastForward(2400);
    await expect(toast).toHaveCount(1);
    await page.clock.fastForward(200);
    await expect(toast).toHaveCount(0);
  });

  test('un toast de error es una alerta, dura 7 s y trae un botón de cierre de 44 px', async ({ page }) => {
    await mostrarToast(page, 'No pudimos guardar los cambios', 'error');
    const toast = page.locator('.toast');
    await expect(toast).toHaveAttribute('role', 'alert');
    await expect(page.getByTestId('toast-error')).toBeVisible();
    const caja = (await page.getByTestId('btn-cerrar-toast').boundingBox())!;
    expect(caja.width).toBeGreaterThanOrEqual(44);
    expect(caja.height).toBeGreaterThanOrEqual(44);
    await sinScrollHorizontal(page);
    await page.clock.fastForward(6500);
    await expect(toast).toHaveCount(1);
    await page.clock.fastForward(600);
    await expect(toast).toHaveCount(0);
  });

  test('el botón de cierre saca el toast de error', async ({ page }) => {
    await mostrarToast(page, 'Algo salió mal', 'error');
    await page.getByTestId('btn-cerrar-toast').click();
    await expect(page.locator('.toast')).toHaveCount(0);
  });

  test('pasar el mouse por encima pausa el toast y al salir sigue contando', async ({ page }) => {
    await mostrarToast(page, 'Algo salió mal', 'error');
    await page.locator('.toast').hover();
    await page.clock.fastForward(20_000);
    await expect(page.locator('.toast')).toHaveCount(1);
    await page.mouse.move(2, 2);
    await page.clock.fastForward(7100);
    await expect(page.locator('.toast')).toHaveCount(0);
  });

  test('enfocar el botón de cierre también pausa el toast', async ({ page }) => {
    await mostrarToast(page, 'Algo salió mal', 'error');
    await page.getByTestId('btn-cerrar-toast').focus();
    await page.clock.fastForward(20_000);
    await expect(page.locator('.toast')).toHaveCount(1);
  });

  test('hay un toast por vez: el nuevo reemplaza al anterior', async ({ page }) => {
    await mostrarToast(page, 'Primero');
    await mostrarToast(page, 'Segundo', 'error');
    await expect(page.locator('.toast')).toHaveCount(1);
    await expect(page.locator('.toast')).toContainText('Segundo');
  });
});

test.describe('Pulido 1, T17: sesión terminada', () => {
  test('un 401 con token muestra un texto que no culpa a otro dispositivo, con foco y Escape', async ({ page, request }) => {
    const esc = await prepararEscenario(request);
    const cliente = await nuevoCliente(request, esc.localidadId);
    await abrirComoUsuario(page, cliente.sesion);
    await page.route('**/api/v1/clientes/perfil', (ruta) => ruta.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ mensaje: 'No autenticado: token ausente, inválido, expirado o sesión cerrada', data: null }),
    }));
    await page.goto('/perfil.html');

    const modal = page.locator('#sesion-cerrada-modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    await expect(modal.locator('.modal-sheet__text')).toHaveText('Tu sesión terminó. Iniciá sesión de nuevo.');
    await expect(modal).not.toContainText('otro dispositivo');
    await expect(page.locator('#sesion-cerrada-modal-cta')).toBeFocused();
    await page.keyboard.press('Escape');
    await page.waitForURL('**/login.html');
  });
});

test.describe('Pulido 1, T14: Ayuda en los perfiles', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let esc: Escenario;

  test.beforeAll(async ({ request }) => {
    esc = await prepararEscenario(request);
  });

  async function verificarPantallaAyuda(page: Page, perfil: string) {
    await page.waitForURL('**/ayuda.html');
    const lista = page.getByTestId('lista-ayuda');
    await expect(lista).toBeVisible();
    await expect(page.getByTestId('btn-ayuda-faq')).toHaveAttribute('href', 'faq.html');
    await expect(page.getByTestId('btn-ayuda-escribir-soporte')).toHaveAttribute('href', 'soporte.html');
    await expect(page.getByTestId('btn-ayuda-mis-consultas')).toContainText('Mis consultas a Soporte');
    await expect(page.getByTestId('btn-ayuda-terminos')).toHaveAttribute('href', 'terminos.html');
    await expect(page.getByTestId('btn-ayuda-privacidad')).toHaveAttribute('href', 'privacidad.html');
    await sinScrollHorizontal(page);

    await page.getByTestId('btn-ayuda-mis-consultas').click();
    await page.waitForURL('**/mis-consultas.html');
    await page.goBack();
    await page.waitForURL('**/ayuda.html');

    await page.getByTestId('btn-volver').click();
    await page.waitForURL(`**/${perfil}`);
  }

  async function filaAyudaEnElPerfil(page: Page) {
    const fila = page.getByTestId('btn-ayuda');
    await expect(fila).toBeVisible();
    await expect(fila).toContainText('Ayuda');
    await expect(fila).toContainText('Preguntas frecuentes, consultas y términos');
    await expect(page.getByTestId('btn-mis-consultas')).toBeVisible();
    await sinScrollHorizontal(page);
    await fila.click();
  }

  test('el Cliente tiene la fila Ayuda sin perder "Mis consultas a Soporte"', async ({ page, request }) => {
    const cliente = await nuevoCliente(request, esc.localidadId);
    await abrirComoUsuario(page, cliente.sesion);
    await page.goto('/perfil.html');
    await filaAyudaEnElPerfil(page);
    await verificarPantallaAyuda(page, 'perfil.html');
  });

  test('el Dueño tiene la fila Ayuda sin perder "Mis consultas a Soporte"', async ({ page }) => {
    await abrirComoUsuario(page, esc.dueno.sesion);
    await page.goto('/comercio-perfil.html');
    await filaAyudaEnElPerfil(page);
    await verificarPantallaAyuda(page, 'comercio-perfil.html');
  });

  test('el Empleado tiene la fila Ayuda dentro del comercio', async ({ page, request }) => {
    const cuenta = await registrarYVerificarCliente(request, esc.localidadId);
    await sumarAlEquipo(request, esc.dueno.comercioId, cuenta, esc.dueno.token);
    const sesion = await login(request, cuenta.nombreUsuario, cuenta.password);
    await abrirComoUsuarioConContexto(page, sesion, {
      contexto: { tipo: 'EMPLEADO', comercioId: esc.dueno.comercioId },
      ultimoContexto: `EMPLEADO:${esc.dueno.comercioId}`,
    });
    await page.goto('/comercio-perfil.html');
    await filaAyudaEnElPerfil(page);
    await verificarPantallaAyuda(page, 'comercio-perfil.html');
  });

  test('las páginas a las que lleva Ayuda abren', async ({ page, request }) => {
    const cliente = await nuevoCliente(request, esc.localidadId);
    await abrirComoUsuario(page, cliente.sesion);
    for (const [testid, destino] of [
      ['btn-ayuda-faq', 'faq.html'],
      ['btn-ayuda-escribir-soporte', 'soporte.html'],
      ['btn-ayuda-terminos', 'terminos.html'],
      ['btn-ayuda-privacidad', 'privacidad.html'],
    ]) {
      await page.goto('/ayuda.html');
      await page.getByTestId(testid).click();
      await page.waitForURL(`**/${destino}`);
    }
  });

  test('el Administrador no tiene Ayuda: la pantalla lo manda a su panel', async ({ page, request }) => {
    const admin = await fijarPasswordAdminYLoguear(request);
    await abrirComoUsuario(page, admin);
    await page.goto('/ayuda.html');
    await page.waitForURL('**/admin-dashboard.html');
    await expect(page.getByTestId('btn-ayuda')).toHaveCount(0);
  });
});

test.describe('Pulido 1, C03: el detalle del pedido se actualiza solo', () => {
  test.describe.configure({ timeout: 180_000 });

  test('un pedido en preparación pasa a listo para retirar sin recargar y deja de ofrecer cancelar', async ({ page, request }) => {
    const esc = await prepararEscenario(request);
    const cliente = await nuevoCliente(request, esc.localidadId);
    const pedidoId = await pedidoEnEstado(request, esc, cliente, 'EN_PREPARACION');

    await page.clock.install();
    await abrirComoUsuario(page, cliente.sesion);
    await page.goto(`/pedido-detalle.html?id=${pedidoId}`);
    await expect(page.getByTestId('btn-cancelar-pedido')).toBeVisible();
    await page.waitForLoadState('networkidle');

    expect((await accionDelComercio(request, esc, pedidoId, 'despachar')).status).toBe(200);
    await page.clock.fastForward(15_000);
    await expect(page.getByTestId('btn-cancelar-pedido')).toHaveCount(0);
  });
});
