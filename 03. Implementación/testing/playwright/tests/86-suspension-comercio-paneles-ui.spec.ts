import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  agregarItemCarrito,
  apiConHeaders,
  apiGet,
  apiPut,
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
  suspenderComercio,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import { abrirComoUsuarioConContexto, ponerEstadoComercio, sumarAlEquipo } from './helpers/empleado';
import { abrirComoUsuario, prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { abrirComoUsuarioConComercio } from './helpers/selector';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

const CARPETA_CAPTURAS = path.resolve(__dirname, '../../../docs/capturas-suspension-comercio-b2');
const MOTIVO = 'Reiteradas quejas de clientes por demoras y pedidos incompletos';
const HEADER = 'X-Comercio-Id';
const TEXTO_SIN_PEDIDOS = 'Este comercio no está recibiendo pedidos por ahora.';
const TEXTO_SUSPENDIDO_DEVOLUCION = 'El comercio fue suspendido. Te devolvemos el dinero.';
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];

type EstadoDeseado = 'PENDIENTE' | 'PREPARACION' | 'LISTO' | 'EN_CAMINO';

interface Persona {
  sesion: SesionApi;
}

async function captura(page: Page, nombre: string) {
  fs.mkdirSync(CARPETA_CAPTURAS, { recursive: true });
  await page.screenshot({ path: path.join(CARPETA_CAPTURAS, `${nombre}.png`) });
}

test.describe('Fase 5, S2 (UI B2): Dueño, Empleado y Cliente con el comercio suspendido', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminSesion: SesionApi;
  let localidadId: string;
  let categoriaId: number;
  let dueno: Dueno;
  let productoId: number;
  let comprador: Persona;
  let empleada: Persona;

  const conComercio = (): Record<string, string> => ({ [HEADER]: String(dueno.comercioId) });
  const estadoDe = (pedidoId: number): string => sql(`SELECT estado FROM pedido WHERE id = ${pedidoId};`);
  const accion = (request: APIRequestContext, token: string, pedidoId: number, ruta: string, cuerpo: unknown = {}) =>
    apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoId}/${ruta}`, token, conComercio(), cuerpo);
  const suspender = (request: APIRequestContext) => suspenderComercio(request, adminSesion.token, dueno.comercioId, MOTIVO);
  const suspenderConPendientesSinProcesar = (): void =>
    void sql(`UPDATE comercio SET estado = 'SUSPENDIDO', suspension_origen = 'INDIVIDUAL', suspendido_desde = NOW(), motivo_suspension = '${MOTIVO}' WHERE id = ${dueno.comercioId};`);
  const levantar = async (request: APIRequestContext) => {
    const { status } = await apiPut(request, `/administrador/comercios/${dueno.comercioId}/levantar-suspension`, {}, adminSesion.token);
    expect(status).toBe(200);
  };
  const horaLimite = (minutos: number): string =>
    sql(`SELECT DATE_FORMAT(DATE_ADD(suspendido_desde, INTERVAL ${minutos} MINUTE), '%H:%i') FROM comercio WHERE id = ${dueno.comercioId};`);

  async function nuevaPersona(request: APIRequestContext, alEquipo: boolean): Promise<Persona> {
    const registro = await registrarYVerificarCliente(request, localidadId);
    if (alEquipo) {
      await sumarAlEquipo(request, dueno.comercioId, registro, dueno.token);
    }
    return { sesion: await login(request, registro.nombreUsuario, registro.password) };
  }

  async function nuevoPedido(request: APIRequestContext, hasta: EstadoDeseado, quien: Persona = comprador): Promise<number> {
    await apiConHeaders(request, 'DELETE', '/carrito', quien.sesion.token);
    await agregarItemCarrito(request, quien.sesion.token, productoId, 1);
    const pedidoId = await crearPedido(request, quien.sesion.token, 'RETIRO', null);
    await confirmarPagoTest(request, pedidoId, true);
    if (hasta !== 'PENDIENTE') {
      expect((await accion(request, dueno.token, pedidoId, 'aceptar')).status).toBe(200);
    }
    if (hasta === 'LISTO' || hasta === 'EN_CAMINO') {
      expect((await accion(request, dueno.token, pedidoId, 'despachar')).status).toBe(200);
    }
    if (hasta === 'EN_CAMINO') {
      sql(`UPDATE pedido SET estado = 'EN_CAMINO', modalidad_entrega = 'DOMICILIO' WHERE id = ${pedidoId};`);
    }
    return pedidoId;
  }

  async function pedidoSinPagar(request: APIRequestContext, quien: Persona = comprador): Promise<number> {
    await apiConHeaders(request, 'DELETE', '/carrito', quien.sesion.token);
    await agregarItemCarrito(request, quien.sesion.token, productoId, 1);
    return crearPedido(request, quien.sesion.token, 'RETIRO', null);
  }

  async function abrirComoDueno(page: Page) {
    await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: dueno.comercioId, ultimoComercioId: dueno.comercioId });
  }

  async function abrirComoEmpleada(page: Page) {
    await abrirComoUsuarioConContexto(page, empleada.sesion, {
      contexto: { tipo: 'EMPLEADO', comercioId: dueno.comercioId },
      ultimoContexto: `EMPLEADO:${dueno.comercioId}`,
    });
  }

  test.beforeAll(async ({ request }) => {
    adminSesion = await fijarPasswordAdminYLoguear(request);
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminSesion.token, `Cat Suspension B2 ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminSesion.token, localidadId, true, todoElDia());
    productoId = await crearProducto(request, dueno.token, { nombre: `Producto B2 ${sufijoUnico()}`, precio: 4200, categoriaId });
    comprador = await nuevaPersona(request, false);
    empleada = await nuevaPersona(request, true);
  });

  test.afterEach(async () => {
    ponerEstadoComercio(dueno.comercioId, 'APTO_VENTA');
  });

  test.describe('Dueño', () => {
    test('el panel muestra la tarjeta con la fecha y el motivo, el chip en la franja y el selector, sin cierre ni Soporte, y vuelve a la normalidad al levantar', async ({ page, request }) => {
      await suspender(request);
      await abrirComoDueno(page);
      await page.goto('/comercio-dashboard.html');

      const tarjeta = page.getByTestId('tarjeta-comercio-suspendido');
      await expect(tarjeta).toBeVisible();
      await expect(page.getByTestId('titulo-comercio-suspendido')).toHaveText('Comercio suspendido');
      await expect(page.getByTestId('desde-comercio-suspendido')).toContainText('Desde el ');
      await expect(page.getByTestId('motivo-comercio-suspendido')).toHaveText(`Motivo: ${MOTIVO}`);
      await expect(page.getByTestId('franja-comercio-chip-suspendido')).toBeVisible();
      await expect(page.getByTestId('tarjeta-cierre-comercio')).toHaveCount(0);
      await expect(page.getByTestId('pasos-vender')).toHaveCount(0);
      await expect(page.getByText(/soporte/i)).toHaveCount(0);
      await sinScrollHorizontal(page);
      await captura(page, '01-panel-dueno-suspendido');

      await page.getByTestId('franja-comercio').click();
      const fila = page.getByTestId(`fila-comercio-${dueno.comercioId}`);
      await expect(fila).toBeVisible();
      await expect(page.getByTestId(`etiqueta-estado-comercio-${dueno.comercioId}`)).toHaveText('Suspendido');
      await expect(fila).toHaveAttribute('aria-current', 'true');
      await captura(page, '02-selector-con-chip-suspendido');
      await fila.click();
      await expect(page).toHaveURL(/comercio-dashboard\.html/);
      await expect(tarjeta).toBeVisible();

      await levantar(request);
      await expect(tarjeta).toHaveCount(0, { timeout: 40_000 });
      await expect(page.getByTestId('franja-comercio-chip-suspendido')).toBeHidden();
      await expect(page.getByTestId('tarjeta-cierre-comercio')).toBeVisible();
    });

    test('el perfil bloquea la edición con una explicación y deja subir documentos y usar Mercado Pago, sin desvincular', async ({ page, request }) => {
      await suspender(request);
      await abrirComoDueno(page);
      await page.goto('/comercio-perfil.html');

      await expect(page.getByTestId('btn-ir-documentacion')).toBeEnabled();
      await expect(page.getByTestId('btn-ir-mercadopago')).toBeEnabled();
      for (const id of ['btn-editar-perfil-comercio', 'btn-editar-horarios', 'btn-foto-perfil-comercio']) {
        await expect(page.getByTestId(id)).toBeDisabled();
      }
      await expect(page.getByTestId('bloqueo-suspension-editar-perfil-link')).toHaveText('El comercio está suspendido');
      await expect(page.getByTestId('bloqueo-suspension-editar-horarios-link')).toHaveText('El comercio está suspendido');
      await sinScrollHorizontal(page);
      await captura(page, '03-perfil-dueno-suspendido');

      await page.getByTestId('btn-ir-mercadopago').click();
      await expect(page.getByTestId('btn-desvincular-mercadopago')).toBeDisabled();
      await expect(page.getByTestId('bloqueo-suspension-btn-desvincular-mp')).toContainText('No se puede desvincular');

      await page.goto('/comercio-documentacion.html');
      await expect(page.getByTestId('btn-subir-documento')).toBeVisible();
      await expect(page.getByTestId('btn-subir-documento')).toBeEnabled();
      await expect(page.getByTestId('aviso-comercio-suspendido')).toBeVisible();

      await levantar(request);
      await page.goto('/comercio-perfil.html');
      await expect(page.getByTestId('btn-editar-perfil-comercio')).toBeEnabled();
      await expect(page.getByTestId('bloqueo-suspension-editar-perfil-link')).toHaveCount(0);
    });

    test('desde una pestaña vieja, guardar un cambio del comercio suspendido muestra el error claro del servidor', async ({ page, request }) => {
      await abrirComoDueno(page);
      await page.goto('/comercio-perfil.html');
      await expect(page.getByTestId('btn-editar-perfil-comercio')).toBeEnabled();
      await page.getByTestId('btn-editar-perfil-comercio').click();
      await page.getByTestId('input-descripcion').fill('Descripción nueva desde la pestaña vieja');

      await suspender(request);
      await page.getByTestId('btn-guardar-perfil-comercio').click();

      await expect(page.getByTestId('mensaje-banner')).toContainText('El comercio está suspendido');
      await expect(page.getByTestId('btn-guardar-perfil-comercio')).toBeEnabled();
      expect(sql(`SELECT COALESCE(descripcion, '') FROM comercio WHERE id = ${dueno.comercioId};`)).not.toContain('pestaña vieja');
    });

    test('los productos quedan en solo lectura: sin crear, sin menú por producto y con el aviso', async ({ page, request }) => {
      await suspender(request);
      await abrirComoDueno(page);
      await page.goto('/comercio-productos.html');

      await expect(page.getByTestId('aviso-productos-suspendido')).toBeVisible();
      await expect(page.getByTestId(`producto-item-${productoId}`)).toBeVisible();
      await expect(page.getByTestId('btn-crear-producto')).toBeHidden();
      await expect(page.getByTestId(`btn-acciones-producto-${productoId}`)).toHaveCount(0);
      await sinScrollHorizontal(page);
      await captura(page, '04-productos-solo-lectura');

      const intento = await apiConHeaders(request, 'POST', '/productos', dueno.token, conComercio(), {
        nombre: `Bloqueado ${sufijoUnico()}`, descripcion: 'x', precio: 1000, categoriaId, tagIds: [],
      });
      expect(intento.status).toBe(409);
      expect(intento.body.mensaje).toBe('El comercio está suspendido: por ahora no se puede modificar.');

      await levantar(request);
      await expect(page.getByTestId('aviso-productos-suspendido')).toHaveCount(0, { timeout: 40_000 });
      await expect(page.getByTestId('btn-crear-producto')).toBeVisible();
    });

    test('el equipo se ve pero no se toca: sin invitar y sin menús', async ({ page, request }) => {
      await suspender(request);
      await abrirComoDueno(page);
      await page.goto('/comercio-perfil.html');
      await page.getByTestId('btn-ver-equipo').click();

      await expect(page.getByTestId('aviso-equipo-solo-lectura')).toBeVisible();
      await expect(page.getByTestId('equipo-footer')).toBeHidden();
      await expect(page.getByTestId('equipo-filas')).toBeVisible();
      await expect(page.locator('[data-testid^="btn-menu-miembro-"]')).toHaveCount(0);
      await sinScrollHorizontal(page);
      await captura(page, '05-equipo-solo-lectura');

      await levantar(request);
      await expect(page.getByTestId('aviso-equipo-solo-lectura')).toHaveCount(0, { timeout: 40_000 });
      await expect(page.getByTestId('equipo-footer')).toBeVisible();
    });
  });

  test.describe('Empleado', () => {
    test('ve el aviso sin motivo ni Soporte, con la edición bloqueada, y puede rechazar un pedido que quedó pendiente', async ({ page, request }) => {
      const pendiente = await nuevoPedido(request, 'PENDIENTE');
      suspenderConPendientesSinProcesar();
      await abrirComoEmpleada(page);
      await page.goto('/comercio-dashboard.html');

      await expect(page.getByTestId('tarjeta-comercio-suspendido')).toBeVisible();
      await expect(page.getByTestId('titulo-comercio-suspendido')).toHaveText('Este comercio está suspendido');
      await expect(page.getByTestId('motivo-comercio-suspendido')).toHaveCount(0);
      await expect(page.getByTestId('desde-comercio-suspendido')).toHaveCount(0);
      await expect(page.getByText(MOTIVO)).toHaveCount(0);
      await expect(page.getByText(/soporte/i)).toHaveCount(0);
      await expect(page.getByTestId('franja-comercio-chip-suspendido')).toBeVisible();
      await sinScrollHorizontal(page);
      await captura(page, '06-panel-empleado-suspendido');

      await page.goto('/comercio-perfil.html');
      await expect(page.getByTestId('btn-editar-datos-comercio')).toBeDisabled();
      await expect(page.getByTestId('btn-editar-horarios')).toBeDisabled();
      await expect(page.getByTestId('btn-ver-datos-comercio')).toBeEnabled();

      await page.goto('/comercio-pedidos.html');
      await expect(page.getByTestId('franja-pedidos-suspendido')).toBeVisible();
      await page.getByTestId(`pedido-item-${pendiente}`).click();
      await expect(page.getByTestId('btn-aceptar-pedido')).toHaveCount(0);
      await expect(page.getByTestId('texto-pedido-suspendido')).toHaveText('Se va a rechazar y reembolsar solo.');
      await page.getByTestId('btn-rechazar-pedido').click();
      await page.getByTestId('select-motivo-rechazo').selectOption('CERRADO');
      await page.getByTestId('btn-confirmar-rechazo').click();
      await expect(page.locator('.toast')).toContainText('Pedido rechazado');
      expect(estadoDe(pendiente)).toBe('RECHAZADO');
    });
  });

  test.describe('Pedidos del comercio suspendido', () => {
    test('la franja marca la hora límite y cada pedido dice qué se puede hacer', async ({ page, request }) => {
      const pendiente = await nuevoPedido(request, 'PENDIENTE');
      const preparacion = await nuevoPedido(request, 'PREPARACION');
      const listo = await nuevoPedido(request, 'LISTO');
      const enCamino = await nuevoPedido(request, 'EN_CAMINO');
      suspenderConPendientesSinProcesar();
      const hora = horaLimite(90);
      await abrirComoDueno(page);
      await page.goto('/comercio-pedidos.html');

      const franja = page.getByTestId('franja-pedidos-suspendido-texto');
      await expect(franja).toContainText(`Comercio suspendido. Tenés hasta las `);
      await expect(franja).toContainText(`${hora} para resolver los pedidos en curso.`);
      const texto = (id: number) => page.getByTestId(`pedido-item-${id}`).getByTestId('texto-pedido-suspendido');
      await expect(texto(pendiente)).toHaveText('Se va a rechazar y reembolsar solo.');
      await expect(texto(preparacion)).toContainText('Despachalo o anulalo antes de las ');
      await expect(texto(preparacion)).toContainText(hora);
      await expect(texto(listo)).toContainText('Entregalo o marcalo como no retirado antes de las ');
      await expect(texto(enCamino)).toHaveText('Sigue su curso.');
      await sinScrollHorizontal(page);
      await captura(page, '07-pedidos-con-franja-y-textos');

      await page.getByTestId(`pedido-item-${enCamino}`).click();
      await expect(page.getByTestId('btn-aceptar-pedido')).toHaveCount(0);
      await expect(page.getByTestId('btn-rechazar-pedido')).toHaveCount(0);
      await expect(page.getByTestId('btn-despachar-pedido')).toHaveCount(0);
    });

    test('un pedido pendiente solo se rechaza y los demás se resuelven con un toast y sin doble envío', async ({ page, request }) => {
      const pendiente = await nuevoPedido(request, 'PENDIENTE');
      const preparacion = await nuevoPedido(request, 'PREPARACION');
      const listo = await nuevoPedido(request, 'LISTO');
      suspenderConPendientesSinProcesar();
      await abrirComoDueno(page);

      await page.goto(`/comercio-pedido-detalle.html?id=${pendiente}`);
      await expect(page.getByTestId('btn-aceptar-pedido')).toHaveCount(0);
      await expect(page.getByTestId('texto-pedido-suspendido')).toHaveText('Se va a rechazar y reembolsar solo.');
      await captura(page, '08-detalle-pendiente-solo-rechazar');
      await page.getByTestId('btn-rechazar-pedido').click();
      await page.getByTestId('select-motivo-rechazo').selectOption('CERRADO');
      await page.getByTestId('btn-confirmar-rechazo').click();
      await expect(page.locator('.toast')).toContainText('Pedido rechazado');
      expect(estadoDe(pendiente)).toBe('RECHAZADO');

      await page.goto(`/comercio-pedido-detalle.html?id=${preparacion}`);
      await expect(page.getByTestId('texto-pedido-suspendido')).toContainText('Despachalo o anulalo antes de las ');
      await expect(page.getByTestId('btn-anular-pedido')).toBeVisible();
      const despachar = page.getByTestId('btn-despachar-pedido');
      await despachar.dblclick();
      await expect(despachar).toBeDisabled();
      await expect(page.locator('.toast')).toContainText('Pedido actualizado');
      await expect.poll(() => estadoDe(preparacion)).toBe('LISTO_PARA_RETIRAR');
      expect(Number(sql(`SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ${preparacion} AND estado = 'LISTO_PARA_RETIRAR';`))).toBe(1);

      await page.goto(`/comercio-pedido-detalle.html?id=${listo}`);
      await expect(page.getByTestId('texto-pedido-suspendido')).toContainText('Entregalo o marcalo como no retirado antes de las ');
      await expect(page.getByTestId('btn-cerrar-no-retirado')).toBeVisible();
      const entregar = page.getByTestId('btn-confirmar-retiro');
      await entregar.dblclick();
      await expect(page.locator('.toast')).toContainText('Pedido entregado');
      await expect.poll(() => estadoDe(listo)).toBe('ENTREGADO');
    });

    test('si el proceso de los 90 minutos cierra el pedido con la pantalla abierta, aparece con su estado final y sin error', async ({ page, request }) => {
      const preparacion = await nuevoPedido(request, 'PREPARACION');
      await suspender(request);
      await abrirComoDueno(page);
      await page.goto(`/comercio-pedido-detalle.html?id=${preparacion}`);
      await expect(page.getByTestId('btn-despachar-pedido')).toBeVisible();

      expect((await apiConHeaders(request, 'PUT', `/test/comercios/${dueno.comercioId}/envejecer-suspension?minutos=120`, undefined, {}, {})).status).toBe(200);
      expect((await apiConHeaders(request, 'POST', '/test/jobs/pedidos/cancelar-preparacion-suspension', undefined, {}, {})).status).toBe(200);
      expect(estadoDe(preparacion)).toBe('CANCELADO_POR_SISTEMA');

      await expect(page.getByTestId('btn-despachar-pedido')).toHaveCount(0, { timeout: 40_000 });
      await expect(page.getByText('Cancelado').first()).toBeVisible();
      await expect(page.getByTestId('aviso-fijo')).toHaveCount(0);

      await page.goto(`/comercio-pedido-detalle.html?id=${preparacion}`);
      await expect(page.getByText('Este pedido se canceló automáticamente.')).toBeVisible();
    });

    test('si despacha con el pedido ya cerrado por el proceso, ve el error del servidor y el pedido con su estado final', async ({ page, request }) => {
      const preparacion = await nuevoPedido(request, 'PREPARACION');
      await suspender(request);
      await abrirComoDueno(page);
      await page.goto(`/comercio-pedido-detalle.html?id=${preparacion}`);
      await expect(page.getByTestId('btn-despachar-pedido')).toBeVisible();

      await apiConHeaders(request, 'PUT', `/test/comercios/${dueno.comercioId}/envejecer-suspension?minutos=120`, undefined, {}, {});
      await apiConHeaders(request, 'POST', '/test/jobs/pedidos/cancelar-preparacion-suspension', undefined, {}, {});
      await page.getByTestId('btn-despachar-pedido').click();

      await expect(page.getByTestId('aviso-fijo')).toBeVisible();
      await expect(page.getByTestId('aviso-fijo-texto')).not.toContainText('EN_PREPARACION');
      await expect(page.getByTestId('btn-despachar-pedido')).toHaveCount(0);
      expect(estadoDe(preparacion)).toBe('CANCELADO_POR_SISTEMA');
    });

    test('si se levanta la suspensión con la lista abierta, la franja y los textos desaparecen sin recargar', async ({ page, request }) => {
      const preparacion = await nuevoPedido(request, 'PREPARACION');
      await suspender(request);
      await abrirComoDueno(page);
      await page.goto('/comercio-pedidos.html');
      await expect(page.getByTestId('franja-pedidos-suspendido')).toBeVisible();
      await expect(page.getByTestId(`pedido-item-${preparacion}`).getByTestId('texto-pedido-suspendido')).toBeVisible();

      await levantar(request);

      await expect(page.getByTestId('franja-pedidos-suspendido')).toHaveCount(0, { timeout: 40_000 });
      await expect(page.getByTestId('texto-pedido-suspendido')).toHaveCount(0);
    });
  });

  test.describe('Cliente', () => {
    test('la lista y el detalle del pedido sin pagar explican que el comercio no recibe pedidos, no dejan pagar y dejan cancelar', async ({ page, request }) => {
      const sinPagar = await pedidoSinPagar(request);
      await suspender(request);
      await abrirComoUsuario(page, comprador.sesion);
      await page.goto('/pedidos.html');

      const tarjeta = page.getByTestId(`pedido-item-${sinPagar}`);
      await expect(tarjeta).toBeVisible();
      await expect(tarjeta).toContainText(dueno.nombre);
      await expect(tarjeta.getByTestId('estado-pedido')).toHaveText('Sin pagar');
      await expect(tarjeta.getByTestId('aviso-comercio-no-disponible-pedido')).toHaveText(TEXTO_SIN_PEDIDOS);
      await expect(tarjeta.locator('button')).toHaveCount(0);
      await sinScrollHorizontal(page);
      await captura(page, '09-cliente-lista-sin-pagar');

      await tarjeta.click();
      await expect(page.getByTestId('franja-comercio-no-disponible')).toHaveText(TEXTO_SIN_PEDIDOS);
      await expect(page.getByTestId('btn-ir-a-pagar')).toBeDisabled();
      await expect(page.getByTestId('ayuda-pago-comercio-no-disponible')).toHaveText(
        'Vas a poder pagar cuando el comercio vuelva a estar disponible, si el pedido no venció.',
      );
      await expect(page.getByText(`Pedido #${sinPagar}`).first()).toBeVisible();
      await expect(page.getByTestId('btn-ver-comercio')).toHaveCount(0);
      await sinScrollHorizontal(page);
      await captura(page, '10-cliente-detalle-sin-pagar');

      await page.getByTestId('btn-cancelar-pedido').click();
      await expect(page.locator('.toast')).toContainText('Pedido cancelado');
      expect(estadoDe(sinPagar)).toBe('CANCELADO');
      expect(Number(sql(`SELECT COUNT(*) FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id = ${sinPagar};`))).toBe(0);
    });

    test('al levantar la suspensión, "Ir a pagar" vuelve a funcionar con la pantalla abierta', async ({ page, request }) => {
      const sinPagar = await pedidoSinPagar(request);
      await suspender(request);
      await abrirComoUsuario(page, comprador.sesion);
      await page.goto(`/pedido-detalle.html?id=${sinPagar}`);
      await expect(page.getByTestId('btn-ir-a-pagar')).toBeDisabled();

      await levantar(request);

      await expect(page.getByTestId('btn-ir-a-pagar')).toBeEnabled({ timeout: 40_000 });
      await expect(page.getByTestId('franja-comercio-no-disponible')).toHaveCount(0);
    });

    test('un pedido pagado y cancelado por la suspensión se ve como Cancelado, con el motivo y el dinero devuelto, y conserva nombre y foto del comercio', async ({ page, request }) => {
      const preparacion = await nuevoPedido(request, 'PREPARACION');
      await suspender(request);
      await apiConHeaders(request, 'PUT', `/test/comercios/${dueno.comercioId}/envejecer-suspension?minutos=120`, undefined, {}, {});
      await apiConHeaders(request, 'POST', '/test/jobs/pedidos/cancelar-preparacion-suspension', undefined, {}, {});
      expect(estadoDe(preparacion)).toBe('CANCELADO_POR_SISTEMA');

      await abrirComoUsuario(page, comprador.sesion);
      await page.goto('/pedidos.html');
      const tarjeta = page.getByTestId(`pedido-item-${preparacion}`);
      await expect(tarjeta).toContainText(dueno.nombre);
      await expect(tarjeta.getByTestId('estado-pedido')).toHaveText('Cancelado');
      await expect(tarjeta.getByTestId('aviso-cancelado-por-suspension-pedido')).toHaveText(TEXTO_SUSPENDIDO_DEVOLUCION);
      await expect(tarjeta.locator('.pedido-card__avatar')).toBeVisible();
      await captura(page, '11-cliente-cancelado-por-suspension');

      await tarjeta.click();
      await expect(page.getByText(TEXTO_SUSPENDIDO_DEVOLUCION).first()).toBeVisible();
      await expect(page.getByText(/CANCELADO_POR_SISTEMA|SUSPENSION_COMERCIO/)).toHaveCount(0);
    });

    test('el catálogo no muestra el comercio suspendido', async ({ page, request }) => {
      await suspender(request);
      await abrirComoUsuario(page, comprador.sesion);
      await page.goto('/index.html');
      await expect(page.getByTestId('lista-comercios')).toBeVisible();
      await expect(page.getByText(dueno.nombre)).toHaveCount(0);
      const publico = await apiGet(request, '/catalogo/comercios');
      expect((publico.body.data as Array<{ id: number }>).some((c) => c.id === dueno.comercioId)).toBe(false);

      await levantar(request);
      await page.reload();
      await expect(page.getByText(dueno.nombre).first()).toBeVisible();
    });

    test('si el comercio se suspende mientras arma el pedido, confirmar muestra el error con la salida y el carrito se conserva', async ({ page, request }) => {
      await apiConHeaders(request, 'DELETE', '/carrito', comprador.sesion.token);
      await agregarItemCarrito(request, comprador.sesion.token, productoId, 1);
      await abrirComoUsuario(page, comprador.sesion);
      await page.goto('/carrito.html');
      await page.getByTestId('btn-confirmar-pedido').click();
      await page.waitForURL('**/checkout.html');
      await page.getByTestId('btn-modalidad-retiro').click();
      await page.getByTestId('btn-continuar-modalidad').click();
      await page.getByTestId('btn-confirmar-retiro').click();
      await expect(page.getByTestId('btn-confirmar-pedido')).toBeVisible();

      await suspender(request);
      await page.getByTestId('btn-confirmar-pedido').click();

      await expect(page.getByTestId('banner-cierre-comercio')).toHaveText('Este comercio no está recibiendo pedidos por ahora. Probá con otro comercio.');
      await expect(page.getByTestId('btn-volver-al-catalogo')).toBeVisible();
      await expect(page.getByTestId('btn-confirmar-pedido')).toBeHidden();
      await captura(page, '12-checkout-comercio-suspendido');

      const carrito = await apiGet(request, '/carrito', comprador.sesion.token);
      expect((carrito.body.data.items as unknown[]).length).toBe(1);
      await page.getByTestId('btn-volver-al-catalogo').click();
      await expect(page).toHaveURL(/index\.html/);
    });
  });
});
