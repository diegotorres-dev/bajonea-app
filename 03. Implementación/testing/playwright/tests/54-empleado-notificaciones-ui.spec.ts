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
import { abrirComoUsuarioConContexto, atajoEstadoRelacion, MENSAJE_ACCESO_PERDIDO, sumarAlEquipo } from './helpers/empleado';
import { abrirComoUsuarioConComercio } from './helpers/selector';
import { prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { sinScrollHorizontal } from './helpers/layout';

const HEADER = 'X-Comercio-Id';
const TEXTO_VACIO_COMERCIO = 'Te vamos a avisar acá cuando haya novedades en este comercio.';
const TEXTO_VACIO_CLIENTE = 'Te vamos a avisar acá cuando haya novedades sobre tus pedidos.';

interface Persona {
  sesion: SesionApi;
  usuarioId: number;
}

interface Aviso {
  id: number;
  leida: boolean;
  entidadTipo: string | null;
  entidadId: number | null;
}

test.use({ viewport: { width: 375, height: 812 } });

test.describe('Campana y notificaciones del Empleado en pantalla, E3 entrega B etapa 3', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;
  let dueno: Dueno;
  let productoId: number;
  let comprador: Persona;
  let elena: Persona;
  let marco: Persona;
  let vacia: Persona;
  let perdida: Persona;

  const conComercio = (): Record<string, string> => ({ [HEADER]: String(dueno.comercioId) });

  async function avisos(request: APIRequestContext, token: string, comercio: boolean): Promise<Aviso[]> {
    const respuesta = await apiConHeaders(request, 'GET', '/notificaciones', token, comercio ? conComercio() : {});
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    return respuesta.body.data as Aviso[];
  }

  async function contador(request: APIRequestContext, token: string, comercio: boolean): Promise<number> {
    const respuesta = await apiConHeaders(request, 'GET', '/notificaciones/no-leidas/contador', token, comercio ? conComercio() : {});
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    return respuesta.body.data as number;
  }

  const delPedido = (items: Aviso[], pedidoId: number): Aviso | undefined =>
    items.find((aviso) => aviso.entidadTipo === 'PEDIDO' && aviso.entidadId === pedidoId);

  async function nuevaPersona(request: APIRequestContext, alEquipo: boolean): Promise<Persona> {
    const registro = await registrarYVerificarCliente(request, localidadId);
    if (alEquipo) {
      await sumarAlEquipo(request, dueno.comercioId, registro, dueno.token);
    }
    const sesion = await login(request, registro.nombreUsuario, registro.password);
    return { sesion, usuarioId: sesion.usuario.id };
  }

  async function pedidoPagado(request: APIRequestContext, quien: Persona): Promise<number> {
    await apiConHeaders(request, 'DELETE', '/carrito', quien.sesion.token);
    await agregarItemCarrito(request, quien.sesion.token, productoId, 1);
    const pedidoId = await crearPedido(request, quien.sesion.token, 'RETIRO', null);
    await confirmarPagoTest(request, pedidoId, true);
    return pedidoId;
  }

  async function abrirComoEmpleado(page: Page, persona: Persona) {
    await abrirComoUsuarioConContexto(page, persona.sesion, {
      contexto: { tipo: 'EMPLEADO', comercioId: dueno.comercioId },
      ultimoContexto: `EMPLEADO:${dueno.comercioId}`,
    });
  }

  async function abrirComoCliente(page: Page, persona: Persona) {
    await abrirComoUsuarioConContexto(page, persona.sesion, { contexto: { tipo: 'CLIENTE' }, ultimoContexto: 'CLIENTE' });
  }

  async function abrirComoDueno(page: Page) {
    await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: dueno.comercioId, ultimoComercioId: dueno.comercioId });
  }

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat E3B3 ${sufijoUnico()}`);
    const horarios = [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
    dueno = await prepararAprobado(request, adminToken, localidadId, true, horarios);
    productoId = await crearProducto(request, dueno.token, { nombre: `Producto E3B3 ${sufijoUnico()}`, precio: 3900, categoriaId });
    comprador = await nuevaPersona(request, false);
    vacia = await nuevaPersona(request, true);
    elena = await nuevaPersona(request, true);
    marco = await nuevaPersona(request, true);
    perdida = await nuevaPersona(request, true);
  });

  test.describe('Estado vacío', () => {
    test('sin avisos, el Empleado ve el texto del comercio y el Cliente el de sus pedidos; "Marcar todas" solo existe dentro de un comercio y está apagado', async ({ page, browser }) => {
      await abrirComoEmpleado(page, vacia);
      await page.goto('/notificaciones.html');

      await expect(page.getByTestId('estado-vacio')).toContainText(TEXTO_VACIO_COMERCIO);
      await expect(page.getByTestId('btn-marcar-todas-leidas')).toBeVisible();
      await expect(page.getByTestId('btn-marcar-todas-leidas')).toBeDisabled();
      await expect(page.getByTestId('btn-marcar-todas-leidas')).toHaveText('Marcar todas');
      expect(page.url()).toContain('notificaciones.html');
      await sinScrollHorizontal(page);

      const otra = await browser.newContext({ viewport: { width: 375, height: 812 }, baseURL: process.env.E2E_FRONTEND_URL || 'http://localhost:5501' });
      const paginaCliente = await otra.newPage();
      await abrirComoCliente(paginaCliente, vacia);
      await paginaCliente.goto('/notificaciones.html');
      await expect(paginaCliente.getByTestId('estado-vacio')).toContainText(TEXTO_VACIO_CLIENTE);
      await expect(paginaCliente.getByTestId('btn-marcar-todas-leidas')).toHaveCount(0);
      await otra.close();
    });
  });

  test.describe('Campana y contador', () => {
    test('la campana aparece en el panel del Empleado y su contador es el del comercio abierto, igual que el del servidor y el de su lista de comercios', async ({ page, request }) => {
      const antes = await contador(request, elena.sesion.token, true);
      await pedidoPagado(request, comprador);
      const esperado = await contador(request, elena.sesion.token, true);
      expect(esperado).toBe(antes + 1);
      const lista = await apiConHeaders(request, 'GET', '/empleados/mis-comercios', elena.sesion.token, {});
      const fila = (lista.body.data as any[]).find((comercio) => comercio.id === dueno.comercioId);
      expect(fila.cantidadNotificacionesNoLeidas).toBe(esperado);

      await abrirComoEmpleado(page, elena);
      await page.goto('/comercio-dashboard.html');

      await expect(page.getByTestId('btn-notificaciones')).toBeVisible();
      await expect(page.getByTestId('contador-notificaciones')).toHaveText(esperado > 9 ? '9+' : String(esperado));
      await sinScrollHorizontal(page);
    });

    test('el contador del Cliente que también es Empleado cuenta solo sus avisos personales', async ({ page, request }) => {
      await pedidoPagado(request, comprador);
      await pedidoPagado(request, comprador);
      const propio = await pedidoPagado(request, elena);
      const aceptado = await apiConHeaders(request, 'PUT', `/pedidos/comercio/${propio}/aceptar`, dueno.token, conComercio(), {});
      expect(aceptado.status).toBe(200);
      const personales = await contador(request, elena.sesion.token, false);
      expect(personales).toBeGreaterThanOrEqual(1);
      const delComercio = await contador(request, elena.sesion.token, true);
      expect(delComercio).not.toBe(personales);

      await abrirComoCliente(page, elena);
      await page.goto('/index.html');

      await expect(page.getByTestId('btn-notificaciones')).toBeVisible();
      await expect(page.getByTestId('contador-notificaciones')).toHaveText(personales > 9 ? '9+' : String(personales));
    });
  });

  test.describe('Pantalla de notificaciones', () => {
    test('cada contexto muestra solo lo suyo: el comercio los avisos del equipo y el Cliente los de sus compras', async ({ page, request, browser }) => {
      const delEquipo = await pedidoPagado(request, comprador);
      const propio = await pedidoPagado(request, elena);
      expect((await apiConHeaders(request, 'PUT', `/pedidos/comercio/${propio}/aceptar`, dueno.token, conComercio(), {})).status).toBe(200);
      const avisoEquipo = delPedido(await avisos(request, elena.sesion.token, true), delEquipo)!;
      const avisoPersonal = delPedido(await avisos(request, elena.sesion.token, false), propio)!;
      expect(avisoEquipo).toBeTruthy();
      expect(avisoPersonal).toBeTruthy();
      expect(delPedido(await avisos(request, elena.sesion.token, true), propio)).toBeUndefined();
      expect(delPedido(await avisos(request, elena.sesion.token, false), delEquipo)).toBeUndefined();

      await abrirComoEmpleado(page, elena);
      await page.goto('/notificaciones.html');
      await expect(page.getByTestId(`notificacion-item-${avisoEquipo.id}`)).toBeVisible();
      await expect(page.getByTestId(`notificacion-item-${avisoPersonal.id}`)).toHaveCount(0);
      expect(page.url()).toContain('notificaciones.html');
      await sinScrollHorizontal(page);

      const otra = await browser.newContext({ viewport: { width: 375, height: 812 }, baseURL: process.env.E2E_FRONTEND_URL || 'http://localhost:5501' });
      const paginaCliente = await otra.newPage();
      await abrirComoCliente(paginaCliente, elena);
      await paginaCliente.goto('/notificaciones.html');
      await expect(paginaCliente.getByTestId(`notificacion-item-${avisoPersonal.id}`)).toBeVisible();
      await expect(paginaCliente.getByTestId(`notificacion-item-${avisoEquipo.id}`)).toHaveCount(0);
      await expect(paginaCliente.getByTestId(`btn-ver-pedido-notificacion-${avisoPersonal.id}`)).toHaveAttribute('href', `pedido-detalle.html?id=${propio}`);
      await otra.close();
    });

    test('"Ver pedido" lleva al detalle del pedido del comercio, marca el aviso como leído y no depende de ser Dueño', async ({ page, request }) => {
      const pedidoId = await pedidoPagado(request, comprador);
      const aviso = delPedido(await avisos(request, elena.sesion.token, true), pedidoId)!;
      expect(aviso.leida).toBe(false);
      await abrirComoEmpleado(page, elena);
      await page.goto('/notificaciones.html');
      const enlace = page.getByTestId(`btn-ver-pedido-notificacion-${aviso.id}`);
      await expect(enlace).toHaveAttribute('href', `comercio-pedido-detalle.html?id=${pedidoId}`);

      await enlace.click();

      await page.waitForURL(`**/comercio-pedido-detalle.html?id=${pedidoId}`);
      await expect(page.getByTestId('btn-aceptar-pedido')).toBeVisible();
      expect(delPedido(await avisos(request, elena.sesion.token, true), pedidoId)!.leida).toBe(true);
    });

    test('tocar el aviso entero también marca como leído y abre el pedido', async ({ page, request }) => {
      const pedidoId = await pedidoPagado(request, comprador);
      const aviso = delPedido(await avisos(request, elena.sesion.token, true), pedidoId)!;
      await abrirComoEmpleado(page, elena);
      await page.goto('/notificaciones.html');

      await page.getByTestId(`notificacion-item-${aviso.id}`).locator('.notification-item__texto').click();

      await page.waitForURL(`**/comercio-pedido-detalle.html?id=${pedidoId}`);
      expect(delPedido(await avisos(request, elena.sesion.token, true), pedidoId)!.leida).toBe(true);
    });

    test('"Marcar todas" deja todo leído, apaga el botón y la campana, y no toca los avisos del Dueño ni de otros compañeros', async ({ page, request }) => {
      await pedidoPagado(request, comprador);
      await pedidoPagado(request, comprador);
      const delDuenoAntes = await contador(request, dueno.token, true);
      const deElenaAntes = await contador(request, elena.sesion.token, true);
      expect(await contador(request, marco.sesion.token, true)).toBeGreaterThanOrEqual(2);
      expect(delDuenoAntes).toBeGreaterThanOrEqual(2);
      await abrirComoEmpleado(page, marco);
      await page.goto('/notificaciones.html');
      await expect(page.locator('.notification-item').first()).toBeVisible();
      await expect(page.getByTestId('btn-marcar-todas-leidas')).toBeEnabled();
      await sinScrollHorizontal(page);

      await page.getByTestId('btn-marcar-todas-leidas').click();

      await expect(page.locator('.notification-item:not(.notification-item--leida)')).toHaveCount(0);
      await expect(page.getByTestId('btn-marcar-todas-leidas')).toBeDisabled();
      expect(await contador(request, marco.sesion.token, true)).toBe(0);
      expect(await contador(request, dueno.token, true)).toBe(delDuenoAntes);
      expect(await contador(request, elena.sesion.token, true)).toBe(deElenaAntes);

      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId('btn-notificaciones')).toBeVisible();
      await expect(page.getByTestId('contador-notificaciones')).toHaveCount(0);
    });

    test('un error al marcar todas muestra un aviso y deja el botón disponible', async ({ page, request }) => {
      await pedidoPagado(request, comprador);
      await page.route('**/notificaciones/leidas', (ruta) =>
        ruta.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Solicitud inválida', data: null }) }),
      );
      await abrirComoEmpleado(page, elena);
      await page.goto('/notificaciones.html');
      await expect(page.getByTestId('btn-marcar-todas-leidas')).toBeEnabled();

      await page.getByTestId('btn-marcar-todas-leidas').click();

      await expect(page.locator('.toast')).toContainText('No pudimos marcar las notificaciones como leídas');
      await expect(page.getByTestId('btn-marcar-todas-leidas')).toBeEnabled();
      await expect(page.locator('.notification-item:not(.notification-item--leida)').first()).toBeVisible();
    });
  });

  test.describe('Pérdida de acceso', () => {
    test('si la relación se desactiva, la pantalla de notificaciones muestra la hoja de pérdida de acceso y no los avisos', async ({ page, request }) => {
      await abrirComoEmpleado(page, perdida);
      await page.goto('/notificaciones.html');
      await expect(page.locator('.notification-item').first()).toBeVisible();
      expect((await atajoEstadoRelacion(request, dueno.comercioId, perdida.usuarioId, 'INACTIVO')).status).toBe(200);

      await page.reload();

      await expect(page.getByTestId('aviso-acceso-perdido')).toBeVisible();
      await expect(page.getByTestId('aviso-acceso-perdido')).toContainText(MENSAJE_ACCESO_PERDIDO);
      await expect(page.locator('.notification-item')).toHaveCount(0);
      await sinScrollHorizontal(page);
    });
  });

  test.describe('Dueño y Cliente sin cambios', () => {
    test('el Dueño conserva su campana, "Ver pedido" al detalle del comercio y ahora también "Marcar todas"', async ({ page, request }) => {
      const pedidoId = await pedidoPagado(request, comprador);
      const aviso = delPedido(await avisos(request, dueno.token, true), pedidoId)!;
      await abrirComoDueno(page);
      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId('contador-notificaciones')).toBeVisible();
      await page.getByTestId('btn-notificaciones').click();
      await page.waitForURL('**/notificaciones.html');

      await expect(page.getByTestId(`btn-ver-pedido-notificacion-${aviso.id}`)).toHaveAttribute('href', `comercio-pedido-detalle.html?id=${pedidoId}`);
      await expect(page.getByTestId('btn-marcar-todas-leidas')).toBeEnabled();
      await page.getByTestId('btn-marcar-todas-leidas').click();

      await expect(page.locator('.notification-item:not(.notification-item--leida)')).toHaveCount(0);
      expect(await contador(request, dueno.token, true)).toBe(0);
    });

    test('un Cliente sin comercios ve sus avisos como siempre y sin "Marcar todas"', async ({ page, request }) => {
      const pedidoId = await pedidoPagado(request, comprador);
      expect((await apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoId}/aceptar`, dueno.token, conComercio(), {})).status).toBe(200);
      const aviso = delPedido(await avisos(request, comprador.sesion.token, false), pedidoId)!;
      await abrirComoCliente(page, comprador);
      await page.goto('/notificaciones.html');

      await expect(page.getByTestId(`notificacion-item-${aviso.id}`)).toBeVisible();
      await expect(page.getByTestId(`btn-ver-pedido-notificacion-${aviso.id}`)).toHaveAttribute('href', `pedido-detalle.html?id=${pedidoId}`);
      await expect(page.getByTestId('btn-marcar-todas-leidas')).toHaveCount(0);
      await sinScrollHorizontal(page);
    });
  });
});
