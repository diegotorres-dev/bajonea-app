import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
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
  sufijoUnico,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import { abrirComoUsuarioConContexto, sumarAlEquipo } from './helpers/empleado';
import { abrirComoUsuarioConComercio } from './helpers/selector';
import { prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { sinScrollHorizontal } from './helpers/layout';

const HEADER = 'X-Comercio-Id';
const ETIQUETA = 'Cargo por servicio del cliente';

const importe = (texto: string): number => Number(texto.replace(/[^0-9]/g, ''));

test.use({ viewport: { width: 375, height: 812 } });

test.describe('Cargo por servicio del cliente en el detalle del pedido del Empleado', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;
  let dueno: Dueno;
  let productoId: number;
  let comprador: SesionApi;
  let elena: SesionApi;

  const conComercio = (): Record<string, string> => ({ [HEADER]: String(dueno.comercioId) });

  async function nuevoPedido(request: APIRequestContext): Promise<number> {
    await apiConHeaders(request, 'DELETE', '/carrito', comprador.token);
    await agregarItemCarrito(request, comprador.token, productoId, 2);
    const pedidoId = await crearPedido(request, comprador.token, 'RETIRO', null);
    await confirmarPagoTest(request, pedidoId, true);
    return pedidoId;
  }

  async function datosDelDueno(request: APIRequestContext, pedidoId: number) {
    const lista = await apiConHeaders(request, 'GET', '/pedidos/comercio', dueno.token, conComercio());
    return (lista.body.data as Array<Record<string, any>>).find((p) => p.id === pedidoId)!;
  }

  async function abrirComoEmpleado(page: Page) {
    await abrirComoUsuarioConContexto(page, elena, {
      contexto: { tipo: 'EMPLEADO', comercioId: dueno.comercioId },
      ultimoContexto: `EMPLEADO:${dueno.comercioId}`,
    });
  }

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat Cargo ${sufijoUnico()}`);
    const horarios = [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
    dueno = await prepararAprobado(request, adminToken, localidadId, true, horarios);
    productoId = await crearProducto(request, dueno.token, { nombre: `Producto Cargo ${sufijoUnico()}`, precio: 3700, categoriaId });
    const cliente = await registrarYVerificarCliente(request, localidadId);
    comprador = await login(request, cliente.nombreUsuario, cliente.password);
    const empleada = await registrarYVerificarCliente(request, localidadId);
    await sumarAlEquipo(request, dueno.comercioId, empleada, dueno.token);
    elena = await login(request, empleada.nombreUsuario, empleada.password);
  });

  test('el detalle muestra Subtotal, "Cargo por servicio del cliente" y Total pagado, en ese orden y con la suma cerrada', async ({ page, request }) => {
    const pedidoId = await nuevoPedido(request);
    const delDueno = await datosDelDueno(request, pedidoId);
    await abrirComoEmpleado(page);

    await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);

    const subtotal = page.getByTestId('subtotal-pedido');
    const cargo = page.getByTestId('cargo-servicio-cliente-pedido');
    const total = page.getByTestId('total-pagado-pedido');
    await expect(cargo).toBeVisible();
    await expect(cargo).toContainText(ETIQUETA);
    await expect(subtotal).toContainText('Subtotal');
    await expect(total).toContainText('Total pagado');

    const orden = await page.evaluate(() => {
      const ids = ['subtotal-pedido', 'cargo-servicio-cliente-pedido', 'total-pagado-pedido'];
      const nodos = ids.map((id) => document.querySelector(`[data-testid="${id}"]`)!);
      return nodos.every((nodo, i) => i === 0 || (nodos[i - 1].compareDocumentPosition(nodo) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
        && nodos[1].previousElementSibling === nodos[0];
    });
    expect(orden).toBe(true);

    const montos = {
      subtotal: importe(await subtotal.innerText()),
      cargo: importe(await cargo.innerText()),
      total: importe(await total.innerText()),
    };
    expect(montos.cargo).toBeGreaterThan(0);
    expect(montos.cargo).toBe(Math.round(Number(delDueno.cargoServicioCliente)));
    expect(montos.subtotal + montos.cargo).toBe(montos.total);
    await sinScrollHorizontal(page);
  });

  test('no aparecen el cargo del comercio, la comisión ni el neto, y la respuesta del servidor tampoco los trae', async ({ page, request }) => {
    const pedidoId = await nuevoPedido(request);
    const cuerpos: string[] = [];
    page.on('response', async (respuesta) => {
      if (respuesta.url().includes('/pedidos/comercio') && respuesta.status() === 200) {
        cuerpos.push(await respuesta.text());
      }
    });
    await abrirComoEmpleado(page);

    await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
    await expect(page.getByTestId('cargo-servicio-cliente-pedido')).toBeVisible();

    const texto = (await page.locator('main').innerText()).toLowerCase();
    expect(texto).not.toContain('(1%)');
    expect(texto).not.toContain('comisión');
    expect(texto).not.toContain('neto');
    const crudo = cuerpos.join('').toLowerCase();
    expect(crudo).toContain('cargoserviciocliente');
    for (const prohibido of ['cargoserviciocomercio', 'pagoestado', 'clienteid', 'mp_']) {
      expect(crudo, prohibido).not.toContain(prohibido);
    }
  });

  test('la línea sigue visible después de aceptar el pedido desde la pantalla', async ({ page, request }) => {
    const pedidoId = await nuevoPedido(request);
    await abrirComoEmpleado(page);
    await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
    await expect(page.getByTestId('btn-aceptar-pedido')).toBeEnabled();

    await page.getByTestId('btn-aceptar-pedido').click();

    await expect(page.getByTestId('cabecera-estado-pedido')).toContainText('En preparación');
    await expect(page.getByTestId('cargo-servicio-cliente-pedido')).toContainText(ETIQUETA);
    await expect(page.getByTestId('subtotal-pedido')).toBeVisible();
    await expect(page.getByTestId('total-pagado-pedido')).toBeVisible();
  });

  test('el Dueño no cambia: ve "Cargo por servicio (1%)" y su total neto, sin la línea del cliente', async ({ page, request }) => {
    const pedidoId = await nuevoPedido(request);
    await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: dueno.comercioId, ultimoComercioId: dueno.comercioId });

    await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);

    await expect(page.getByText('Cargo por servicio (1%)')).toBeVisible();
    await expect(page.getByTestId('cargo-servicio-cliente-pedido')).toHaveCount(0);
    await expect(page.getByTestId('subtotal-pedido')).toHaveCount(0);
  });
});
