import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  agregarItemCarrito,
  apiConHeaders,
  confirmarPagoTest,
  crearCategoria,
  crearPedido,
  crearProducto,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import { abrirComoUsuario, prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { abrirComoUsuarioConComercio } from './helpers/selector';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

const CARPETA_CAPTURAS = path.resolve(__dirname, '../../../docs/capturas-suspension-comercio-b2');
const MOTIVO = 'Reiteradas quejas de clientes por demoras y pedidos incompletos';
const TEXTO_CLIENTE = 'El comercio no estaba disponible. Te devolvemos el dinero.';
const TEXTO_AVISO = 'Tu pedido se canceló porque el comercio no está disponible. Te devolvemos el dinero.';
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];

async function captura(page: Page, nombre: string) {
  fs.mkdirSync(CARPETA_CAPTURAS, { recursive: true });
  await page.screenshot({ path: path.join(CARPETA_CAPTURAS, `${nombre}.png`) });
}

test.describe('Fase 5, S2.1 (UI): los pedidos pendientes se rechazan solos al suspender el comercio', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminSesion: SesionApi;
  let localidadId: string;
  let categoriaId: number;
  let dueno: Dueno;
  let productoId: number;
  let compradorToken: string;
  let comprador: SesionApi;
  let pendiente1: number;
  let pendiente2: number;
  let enPreparacion: number;

  const estadoDe = (pedidoId: number): string => sql(`SELECT estado FROM pedido WHERE id = ${pedidoId};`);
  const notasDe = (pedidoId: number): number =>
    Number(sql(`SELECT COUNT(*) FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id = ${pedidoId};`));

  async function pedidoPagado(request: APIRequestContext, productoDe: number, token: string): Promise<number> {
    await apiConHeaders(request, 'DELETE', '/carrito', token);
    await agregarItemCarrito(request, token, productoDe, 1);
    const pedidoId = await crearPedido(request, token, 'RETIRO');
    await confirmarPagoTest(request, pedidoId, true);
    return pedidoId;
  }

  async function abrirDetalle(page: Page, comercioId: number) {
    await abrirComoUsuario(page, adminSesion);
    await page.goto('/admin-comercios.html');
    const verDetalle = page.getByTestId(`btn-ver-detalle-comercio-${comercioId}`);
    await expect(verDetalle).toBeVisible();
    await verDetalle.click();
    await expect(page.getByTestId('modal-detalle-comercio')).toBeVisible();
  }

  test.beforeAll(async ({ request }) => {
    adminSesion = await fijarPasswordAdminYLoguear(request);
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminSesion.token, `Cat Suspension Pendientes ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminSesion.token, localidadId, true, todoElDia());
    productoId = await crearProducto(request, dueno.token, { nombre: `Producto pendientes ${sufijoUnico()}`, precio: 4200, categoriaId });
    const registro = await registrarYVerificarCliente(request, localidadId);
    comprador = await login(request, registro.nombreUsuario, registro.password);
    compradorToken = comprador.token;
    pendiente1 = await pedidoPagado(request, productoId, compradorToken);
    pendiente2 = await pedidoPagado(request, productoId, compradorToken);
    enPreparacion = await pedidoPagado(request, productoId, compradorToken);
    const aceptado = await apiConHeaders(request, 'PUT', `/pedidos/comercio/${enPreparacion}/aceptar`, dueno.token, { 'X-Comercio-Id': String(dueno.comercioId) }, {});
    expect(aceptado.status).toBe(200);
  });

  test('la hoja avisa que los pendientes se rechazan y reembolsan ahora; al confirmar, quedan rechazados con su nota y el de preparación sigue igual', async ({ page }) => {
    await abrirDetalle(page, dueno.comercioId);
    await page.getByTestId('btn-suspender-comercio').click();
    await expect(page.getByTestId('suspender-comercio-que-va-a-pasar').locator('li')).toHaveText([
      'Deja de aparecer en el catálogo.',
      '2 pedidos pendientes: se rechazan ahora y se reembolsan. No se puede deshacer.',
      '1 pedido en preparación: tiene 90 minutos para despacharlo o se cancela con reembolso.',
    ]);
    await captura(page, '17-hoja-suspender-pendientes-se-rechazan');
    await sinScrollHorizontal(page);

    await page.getByTestId('input-suspender-comercio-motivo').fill(MOTIVO);
    await page.getByTestId('btn-confirmar-suspender-comercio').click();
    await expect(page.locator('.toast')).toContainText('Comercio suspendido');
    await expect(page.getByTestId(`estado-comercio-${dueno.comercioId}`)).toHaveText('Suspendido');

    for (const id of [pendiente1, pendiente2]) {
      expect(estadoDe(id)).toBe('RECHAZADO');
      expect(notasDe(id)).toBe(1);
    }
    expect(estadoDe(enPreparacion)).toBe('EN_PREPARACION');
    expect(notasDe(enPreparacion)).toBe(0);
  });

  test('con un solo pendiente la hoja usa el singular', async ({ page, request }) => {
    const otro = await prepararAprobado(request, adminSesion.token, localidadId, true, todoElDia());
    const productoOtro = await crearProducto(request, otro.token, { nombre: `Producto singular ${sufijoUnico()}`, precio: 4200, categoriaId });
    await pedidoPagado(request, productoOtro, compradorToken);

    await abrirDetalle(page, otro.comercioId);
    await page.getByTestId('btn-suspender-comercio').click();
    await expect(page.getByTestId('suspender-comercio-que-va-a-pasar').locator('li')).toHaveText([
      'Deja de aparecer en el catálogo.',
      '1 pedido pendiente: se rechaza ahora y se reembolsa. No se puede deshacer.',
    ]);
    await page.getByTestId('btn-cancelar-suspender-comercio').click();
    await expect(page.getByTestId('modal-suspender-comercio')).toHaveCount(0);
    expect(sql(`SELECT estado FROM comercio WHERE id = ${otro.comercioId};`)).toBe('APTO_VENTA');
  });

  test('el Dueño ve los pedidos rechazados sin acciones y el que sigue en preparación con su hora límite', async ({ page }) => {
    await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: dueno.comercioId, ultimoComercioId: dueno.comercioId });
    await page.goto('/comercio-pedidos.html');

    for (const id of [pendiente1, pendiente2]) {
      const tarjeta = page.getByTestId(`pedido-item-${id}`);
      await expect(tarjeta).toBeVisible();
      await expect(tarjeta.getByTestId('estado-pedido')).toHaveText('Rechazado');
      await expect(tarjeta.getByTestId('texto-pedido-suspendido')).toHaveCount(0);
    }
    await expect(page.getByTestId(`pedido-item-${enPreparacion}`).getByTestId('texto-pedido-suspendido')).toContainText('Despachalo o anulalo antes de las ');
    await sinScrollHorizontal(page);
    await captura(page, '18-dueno-pedidos-rechazados-por-suspension');

    await page.goto(`/comercio-pedido-detalle.html?id=${pendiente1}`);
    await expect(page.getByTestId('btn-aceptar-pedido')).toHaveCount(0);
    await expect(page.getByTestId('btn-rechazar-pedido')).toHaveCount(0);
  });

  test('el Cliente ve el pedido rechazado con el texto claro, el reembolso y el aviso, sin nombres internos', async ({ page }) => {
    await abrirComoUsuario(page, comprador);
    await page.goto('/pedidos.html');
    const tarjeta = page.getByTestId(`pedido-item-${pendiente1}`);
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta.getByTestId('estado-pedido')).toHaveText('Rechazado');
    await sinScrollHorizontal(page);

    await tarjeta.click();
    await expect(page.getByTestId('estado-pedido')).toHaveText(TEXTO_CLIENTE);
    await expect(page.getByTestId('estado-reembolso')).toBeVisible();
    await expect(page.getByTestId('motivo-rechazo-pedido')).toHaveCount(0);
    await expect(page.getByText(/SUSPEN|PENDIENTE_|RECHAZADO/)).toHaveCount(0);
    await sinScrollHorizontal(page);
    await captura(page, '19-cliente-detalle-rechazado-por-suspension');

    await page.goto('/notificaciones.html');
    await expect(page.getByText(TEXTO_AVISO).first()).toBeVisible();
    await sinScrollHorizontal(page);
    await captura(page, '20-cliente-aviso-rechazo-por-suspension');
  });
});
