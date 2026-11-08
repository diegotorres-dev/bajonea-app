import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { apiConHeaders, login, registrarYVerificarCliente } from './helpers/backend';
import { abrirComoUsuario } from './helpers/multicomercio';
import { abrirComoUsuarioConContexto, sumarAlEquipo } from './helpers/empleado';
import { nuevoCliente, pedidoEnEstado, prepararEscenario } from './helpers/reclamos';
import type { Cliente, Escenario } from './helpers/reclamos';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

const PLAZO_MINUTOS = 30;

async function mostrarToast(page: Page, mensaje: string, tipo: 'success' | 'error') {
  await page.evaluate(async ([texto, clase]) => {
    const modulo = await import('/js/catalogo.js');
    modulo.showToast(texto, clase);
  }, [mensaje, tipo]);
}

function enMilisegundos(fechaSinZona: string): number {
  return Date.parse(`${String(fechaSinZona).slice(0, 19)}Z`);
}

test.describe('Pulido 1b, K01: el límite de respuesta del comercio lo manda la API', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let esc: Escenario;
  let cliente: Cliente;

  test.beforeAll(async ({ request }) => {
    esc = await prepararEscenario(request);
    cliente = await nuevoCliente(request, esc.localidadId);
  });

  async function listaDelComercio(request: Parameters<typeof apiConHeaders>[0], token: string) {
    const { status, body } = await apiConHeaders(request, 'GET', '/pedidos/comercio', token, { 'X-Comercio-Id': String(esc.dueno.comercioId) });
    expect(status).toBe(200);
    return body.data as any[];
  }

  test('el Dueño recibe el límite solo en un pedido pendiente de confirmación: pago más el plazo configurado', async ({ request }) => {
    const pendiente = await pedidoEnEstado(request, esc, cliente, 'PENDIENTE');
    const aceptado = await pedidoEnEstado(request, esc, cliente, 'EN_PREPARACION');
    const rechazado = await pedidoEnEstado(request, esc, cliente, 'RECHAZADO');

    const lista = await listaDelComercio(request, esc.dueno.token);
    const delPendiente = lista.find((pedido) => pedido.id === pendiente);
    expect(delPendiente.estado).toBe('PENDIENTE_CONFIRMACION_COMERCIO');
    expect(typeof delPendiente.limiteRespuestaComercio).toBe('string');
    expect(enMilisegundos(delPendiente.limiteRespuestaComercio) - enMilisegundos(delPendiente.fechaPagoAprobado)).toBe(PLAZO_MINUTOS * 60000);
    expect(lista.find((pedido) => pedido.id === aceptado).limiteRespuestaComercio).toBeNull();
    expect(lista.find((pedido) => pedido.id === rechazado).limiteRespuestaComercio).toBeNull();
  });

  test('el Empleado también lo recibe, con el mismo valor y sin los datos reservados del Dueño', async ({ request }) => {
    const pendiente = await pedidoEnEstado(request, esc, cliente, 'PENDIENTE');
    const cuenta = await registrarYVerificarCliente(request, esc.localidadId);
    await sumarAlEquipo(request, esc.dueno.comercioId, cuenta, esc.dueno.token);
    const sesion = await login(request, cuenta.nombreUsuario, cuenta.password);

    const delDueno = (await listaDelComercio(request, esc.dueno.token)).find((pedido) => pedido.id === pendiente);
    const delEmpleado = (await listaDelComercio(request, sesion.token)).find((pedido) => pedido.id === pendiente);
    expect(delEmpleado.limiteRespuestaComercio).toBe(delDueno.limiteRespuestaComercio);
    expect(delEmpleado).not.toHaveProperty('cargoServicioComercio');
    expect(delEmpleado).not.toHaveProperty('pagoEstado');
  });

  test('el Cliente no recibe el límite en sus propios pedidos', async ({ request }) => {
    await pedidoEnEstado(request, esc, cliente, 'PENDIENTE');
    const { status, body } = await apiConHeaders(request, 'GET', '/pedidos/cliente', cliente.sesion.token);
    expect(status).toBe(200);
    for (const pedido of body.data as any[]) {
      expect(pedido.limiteRespuestaComercio ?? null).toBeNull();
    }
  });

  test('el panel y la lista muestran "Vence en N minutos" con el límite real y la lista no repite la etiqueta en un pedido ya aceptado', async ({ page, request }) => {
    const pendiente = await pedidoEnEstado(request, esc, cliente, 'PENDIENTE');
    const aceptado = await pedidoEnEstado(request, esc, cliente, 'EN_PREPARACION');
    await abrirComoUsuario(page, esc.dueno.sesion);

    await page.goto('/comercio-dashboard.html');
    await expect(page.getByTestId(`pedido-item-${pendiente}`).getByTestId('vencimiento-pedido')).toHaveText(/^Vence en \d+ minutos?$/);
    await sinScrollHorizontal(page);

    await page.goto('/comercio-pedidos.html');
    await expect(page.getByTestId(`pedido-item-${pendiente}`).getByTestId('vencimiento-pedido')).toHaveText(/^Vence en \d+ minutos?$/);
    await expect(page.getByTestId(`pedido-item-${aceptado}`)).toBeVisible();
    await expect(page.getByTestId(`pedido-item-${aceptado}`).getByTestId('vencimiento-pedido')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('null');
    await expect(page.locator('body')).not.toContainText('NaN');
  });
});

test.describe('Pulido 1b, T06: el toast según su tipo', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
    await page.goto('/login.html');
    await page.waitForLoadState('networkidle');
    await page.clock.pauseAt(Date.now() + 5000);
  });

  test('un toast de éxito se va a los 2,5 s aunque el mouse esté encima', async ({ page }) => {
    await mostrarToast(page, 'Guardado', 'success');
    const toast = page.locator('.toast');
    await expect(toast).toHaveCount(1);
    await toast.hover();
    await page.clock.fastForward(2400);
    await expect(toast).toHaveCount(1);
    await page.clock.fastForward(200);
    await expect(toast).toHaveCount(0);
  });

  test('un toast de error sí se pausa con el mouse encima y sigue al salir', async ({ page }) => {
    await mostrarToast(page, 'No pudimos guardar los cambios', 'error');
    const toast = page.locator('.toast');
    await toast.hover();
    await page.clock.fastForward(20_000);
    await expect(toast).toHaveCount(1);
    await page.mouse.move(2, 2);
    await page.clock.fastForward(7100);
    await expect(toast).toHaveCount(0);
  });

  test('un toast de éxito no se pausa al enfocar ni al tocar', async ({ page }) => {
    await mostrarToast(page, 'Guardado', 'success');
    const toast = page.locator('.toast');
    await toast.dispatchEvent('pointerdown', { pointerType: 'touch' });
    await page.clock.fastForward(2700);
    await expect(toast).toHaveCount(0);
  });
});

test.describe('Pulido 1b: el perfil no repite el título "Ayuda"', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let esc: Escenario;

  test.beforeAll(async ({ request }) => {
    esc = await prepararEscenario(request);
  });

  test('el perfil del Dueño junta "Ayuda" y "Mis consultas a Soporte" sin un título que repita la palabra', async ({ page }) => {
    await abrirComoUsuario(page, esc.dueno.sesion);
    await page.goto('/comercio-perfil.html');
    await expect(page.getByTestId('btn-editar-perfil-comercio')).toBeEnabled();

    await expect(page.locator('.profile-section__title')).toHaveText(['Mi comercio', 'Sesión']);
    await expect(page.locator('.profile-section__title', { hasText: 'Ayuda' })).toHaveCount(0);
    const seccion = page.locator('#seccion-soporte');
    await expect(seccion.getByTestId('btn-ayuda')).toBeVisible();
    await expect(seccion.getByTestId('btn-mis-consultas')).toBeVisible();
    await sinScrollHorizontal(page);

    const ayuda = await page.getByTestId('btn-ayuda').boundingBox();
    const consultas = await page.getByTestId('btn-mis-consultas').boundingBox();
    expect(consultas!.y).toBeGreaterThan(ayuda!.y);
    expect(consultas!.y - (ayuda!.y + ayuda!.height)).toBeLessThan(16);
  });

  test('el perfil del Empleado tampoco tiene un título "Ayuda"', async ({ page, request }) => {
    const cuenta = await registrarYVerificarCliente(request, esc.localidadId);
    await sumarAlEquipo(request, esc.dueno.comercioId, cuenta, esc.dueno.token);
    const sesion = await login(request, cuenta.nombreUsuario, cuenta.password);
    await abrirComoUsuarioConContexto(page, sesion, {
      contexto: { tipo: 'EMPLEADO', comercioId: esc.dueno.comercioId },
      ultimoContexto: `EMPLEADO:${esc.dueno.comercioId}`,
    });
    await page.goto('/comercio-perfil.html');
    await expect(page.getByTestId('btn-ayuda')).toBeVisible();
    await expect(page.locator('.profile-section__title', { hasText: 'Ayuda' })).toHaveCount(0);
  });
});
