import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import { apiConHeaders, login, registrarYVerificarCliente, sqlTest as sql } from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import { abrirComoUsuarioConContexto, ponerEstadoComercio, sumarAlEquipo } from './helpers/empleado';
import { abrirComoUsuarioConComercio } from './helpers/selector';
import { sinScrollHorizontal } from './helpers/layout';
import {
  capturarReclamos,
  nuevoCliente,
  pedidoEntregado,
  prepararEscenario,
  reclamarPorApi,
  resolverPorApi,
} from './helpers/reclamos';
import type { Cliente, Escenario } from './helpers/reclamos';

test.use({ viewport: { width: 375, height: 812 } });

const MENSAJE_DEL_CLIENTE = 'Me llegó todo desordenado y faltaba la bebida que pedí';
const MOTIVO_DEL_RECHAZO = 'Revisamos el pedido y salió completo desde el local';
const HEADER = 'X-Comercio-Id';

test.describe('Fase 5, S5 (entrega B): reclamos del Dueño y del Empleado', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let esc: Escenario;
  let cliente: Cliente;
  let empleada: SesionApi;

  test.beforeAll(async ({ request }) => {
    esc = await prepararEscenario(request);
    cliente = await nuevoCliente(request, esc.localidadId);
    const cuenta = await registrarYVerificarCliente(request, esc.localidadId);
    await sumarAlEquipo(request, esc.dueno.comercioId, cuenta, esc.dueno.token);
    empleada = await login(request, cuenta.nombreUsuario, cuenta.password);
  });

  test.afterEach(() => {
    ponerEstadoComercio(esc.dueno.comercioId, 'APTO_VENTA');
  });

  async function reclamoEn(request: APIRequestContext, estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO') {
    const pedidoId = await pedidoEntregado(request, esc, cliente);
    const reclamoId = await reclamarPorApi(request, cliente, pedidoId, 'FALTAN_PRODUCTOS', MENSAJE_DEL_CLIENTE);
    if (estado === 'APROBADO') {
      expect((await resolverPorApi(request, esc.adminToken, reclamoId, { tipo: 'REEMBOLSO_TOTAL' })).status).toBe(200);
    } else if (estado === 'RECHAZADO') {
      expect((await resolverPorApi(request, esc.adminToken, reclamoId, { tipo: 'RECHAZO', motivo: MOTIVO_DEL_RECHAZO })).status).toBe(200);
    }
    return { pedidoId, reclamoId };
  }

  async function abrirComoDueno(page: Page) {
    await abrirComoUsuarioConComercio(page, esc.dueno.sesion, { comercioActivoId: esc.dueno.comercioId, ultimoComercioId: esc.dueno.comercioId });
  }

  async function abrirComoEmpleada(page: Page) {
    await abrirComoUsuarioConContexto(page, empleada, {
      contexto: { tipo: 'EMPLEADO', comercioId: esc.dueno.comercioId },
      ultimoContexto: `EMPLEADO:${esc.dueno.comercioId}`,
    });
  }

  async function detalleDelDueno(page: Page, pedidoId: number) {
    await abrirComoDueno(page);
    await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
    await expect(page.getByTestId('total-pagado-pedido')).toBeVisible();
  }

  test('el Dueño ve el reclamo en revisión en solo lectura, sin el mensaje del Cliente', async ({ page, request }) => {
    const { pedidoId } = await reclamoEn(request, 'PENDIENTE');
    await detalleDelDueno(page, pedidoId);

    const bloque = page.getByTestId('bloque-reclamo-dueno');
    await expect(bloque).toBeVisible();
    await expect(bloque).toContainText('Reclamo del Cliente');
    await expect(page.getByTestId('estado-reclamo-dueno')).toContainText('En revisión');
    await expect(page.getByTestId('motivo-reclamo-dueno')).toHaveText('Motivo: Faltan productos');
    await expect(page.getByTestId('texto-reembolso-dueno')).toHaveCount(0);
    await expect(bloque.locator('button, a, input, textarea')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(MENSAJE_DEL_CLIENTE);
    await sinScrollHorizontal(page);
    await capturarReclamos(page, '28-dueno-reclamo-en-revision');
  });

  test('el Dueño ve cuánto se reembolsó cuando el reclamo se aprobó', async ({ page, request }) => {
    const { pedidoId } = await reclamoEn(request, 'APROBADO');
    await detalleDelDueno(page, pedidoId);

    await expect(page.getByTestId('estado-reclamo-dueno')).toContainText('Aprobado');
    await expect(page.getByTestId('texto-reembolso-dueno')).toHaveText('Se reembolsaron $5.000 al Cliente.');
    await expect(page.locator('body')).not.toContainText(MENSAJE_DEL_CLIENTE);
    await sinScrollHorizontal(page);
    await capturarReclamos(page, '29-dueno-reclamo-aprobado');
  });

  test('el Dueño ve el reclamo rechazado sin el motivo que le dio Soporte', async ({ page, request }) => {
    const { pedidoId } = await reclamoEn(request, 'RECHAZADO');
    await detalleDelDueno(page, pedidoId);

    await expect(page.getByTestId('estado-reclamo-dueno')).toContainText('Rechazado');
    await expect(page.getByTestId('texto-reembolso-dueno')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(MOTIVO_DEL_RECHAZO);
    await expect(page.locator('body')).not.toContainText(MENSAJE_DEL_CLIENTE);
    await sinScrollHorizontal(page);
    await capturarReclamos(page, '30-dueno-reclamo-rechazado');
  });

  test('un pedido sin reclamo no muestra ningún bloque al Dueño', async ({ page, request }) => {
    const pedidoId = await pedidoEntregado(request, esc, cliente);
    await detalleDelDueno(page, pedidoId);
    await expect(page.getByTestId('bloque-reclamo-dueno')).toHaveCount(0);
    await expect(page.getByTestId('bloque-reclamo')).toHaveCount(0);
  });

  test('el aviso del reembolso aparece en la campana del Dueño y lleva al pedido', async ({ page, request }) => {
    const { pedidoId } = await reclamoEn(request, 'APROBADO');
    await abrirComoDueno(page);
    await page.goto('/notificaciones.html');

    const aviso = page.locator('[data-testid^="notificacion-item-"]').filter({ hasText: `reclamo del pedido #${pedidoId}` });
    await expect(aviso).toHaveCount(1);
    await expect(aviso).toContainText('Reembolsamos $5.000 al Cliente por un reclamo del pedido');
    await expect(aviso).not.toContainText(MENSAJE_DEL_CLIENTE);
    await sinScrollHorizontal(page);
    await capturarReclamos(page, '31-dueno-aviso-de-reembolso');

    await aviso.getByRole('link', { name: 'Ver pedido' }).click();
    await expect(page).toHaveURL(new RegExp(`comercio-pedido-detalle\\.html\\?id=${pedidoId}$`));
    await expect(page.getByTestId('bloque-reclamo-dueno')).toBeVisible();
  });

  test('un reclamo rechazado no le genera ningún aviso al Dueño', async ({ page, request }) => {
    const { pedidoId } = await reclamoEn(request, 'RECHAZADO');
    expect(Number(sql(`SELECT COUNT(*) FROM notificacion WHERE entidad_tipo = 'PEDIDO' AND entidad_id = ${pedidoId} AND tipo = 'RECLAMO_REEMBOLSO_DUENO';`))).toBe(0);
    await abrirComoDueno(page);
    await page.goto('/notificaciones.html');
    await expect(page.getByText(`reclamo del pedido #${pedidoId}`)).toHaveCount(0);
  });

  test('el Empleado no ve nada de reclamos: ni en el detalle del pedido ni en los avisos ni en la respuesta del servidor', async ({ page, request }) => {
    const { pedidoId } = await reclamoEn(request, 'APROBADO');
    const lista = await apiConHeaders(request, 'GET', '/pedidos/comercio', empleada.token, { [HEADER]: String(esc.dueno.comercioId) });
    expect(lista.status).toBe(200);
    const delPedido = lista.body.data.find((p: { id: number }) => p.id === pedidoId);
    expect(delPedido).toBeTruthy();
    expect(Object.keys(delPedido)).not.toContain('reclamo');

    await abrirComoEmpleada(page);
    await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
    await expect(page.getByTestId('nombre-cliente-pedido')).toBeVisible();
    await expect(page.getByTestId('bloque-reclamo-dueno')).toHaveCount(0);
    await expect(page.getByTestId('bloque-reclamo')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Reclamo del Cliente');
    await sinScrollHorizontal(page);
    await capturarReclamos(page, '32-empleado-sin-reclamos');

    await page.goto('/notificaciones.html');
    await expect(page.getByText(`reclamo del pedido #${pedidoId}`)).toHaveCount(0);
    await expect(page.getByText('Reembolsamos')).toHaveCount(0);
  });

  test('con el comercio suspendido el Dueño sigue viendo el bloque del reclamo, sin acciones', async ({ page, request }) => {
    const { pedidoId } = await reclamoEn(request, 'APROBADO');
    ponerEstadoComercio(esc.dueno.comercioId, 'SUSPENDIDO');
    await detalleDelDueno(page, pedidoId);

    const bloque = page.getByTestId('bloque-reclamo-dueno');
    await expect(bloque).toBeVisible();
    await expect(page.getByTestId('texto-reembolso-dueno')).toHaveText('Se reembolsaron $5.000 al Cliente.');
    await expect(bloque.locator('button, a, input, textarea')).toHaveCount(0);
    await sinScrollHorizontal(page);
  });
});
