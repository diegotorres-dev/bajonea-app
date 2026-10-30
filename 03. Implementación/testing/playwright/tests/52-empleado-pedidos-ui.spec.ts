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
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import { abrirComoUsuarioConContexto, ponerEstadoComercio, sumarAlEquipo } from './helpers/empleado';
import { abrirComoUsuarioConComercio } from './helpers/selector';
import { prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { sinScrollHorizontal } from './helpers/layout';

const HEADER = 'X-Comercio-Id';
const TEXTO_PROPIO = 'Hiciste este pedido como cliente. No podés gestionarlo desde acá.';
const AVISO_CERRADO = 'Comercio cerrado temporalmente. No se aceptan pedidos nuevos.';
const TEXTO_MODAL_NO_RETIRADO = 'El cliente no pasó a buscarlo y no se le devuelve el pago, porque el pedido ya estaba preparado.';

type EstadoDeseado = 'PENDIENTE' | 'PREPARACION' | 'LISTO';

interface Persona {
  sesion: SesionApi;
}

test.use({ viewport: { width: 375, height: 812 } });

test.describe('Pedidos del comercio en pantalla para el Dueño y el Empleado, E3 entrega B etapa 1', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;
  let dueno: Dueno;
  let productoId: number;
  let comprador: Persona;
  let elena: Persona;
  let ajena: Persona;

  const conComercio = (): Record<string, string> => ({ [HEADER]: String(dueno.comercioId) });
  const accion = (request: APIRequestContext, token: string, pedidoId: number, ruta: string, cuerpo: unknown = {}) =>
    apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoId}/${ruta}`, token, conComercio(), cuerpo);
  const envejecer = (request: APIRequestContext, pedidoId: number, minutos: number) =>
    apiConHeaders(request, 'PUT', `/test/pedidos/${pedidoId}/envejecer-listo?minutos=${minutos}`, undefined, {}, {});
  const estadoDe = (pedidoId: number): string => sql(`SELECT estado FROM pedido WHERE id = ${pedidoId};`);
  const trazabilidad = (request: APIRequestContext, token: string, pedidoId: number) =>
    apiConHeaders(request, 'GET', `/pedidos/comercio/${pedidoId}/trazabilidad`, token, conComercio());

  async function nuevaPersona(request: APIRequestContext, alEquipo: boolean): Promise<Persona> {
    const registro = await registrarYVerificarCliente(request, localidadId);
    if (alEquipo) {
      await sumarAlEquipo(request, dueno.comercioId, registro, dueno.token);
    }
    return { sesion: await login(request, registro.nombreUsuario, registro.password) };
  }

  async function nuevoPedido(request: APIRequestContext, quien: Persona, hasta: EstadoDeseado, minutosListo = 0): Promise<number> {
    await apiConHeaders(request, 'DELETE', '/carrito', quien.sesion.token);
    await agregarItemCarrito(request, quien.sesion.token, productoId, 1);
    const pedidoId = await crearPedido(request, quien.sesion.token, 'RETIRO', null);
    await confirmarPagoTest(request, pedidoId, true);
    if (hasta !== 'PENDIENTE') {
      expect((await accion(request, dueno.token, pedidoId, 'aceptar')).status).toBe(200);
    }
    if (hasta === 'LISTO') {
      expect((await accion(request, dueno.token, pedidoId, 'despachar')).status).toBe(200);
      if (minutosListo > 0) {
        expect((await envejecer(request, pedidoId, minutosListo)).status).toBe(200);
      }
    }
    return pedidoId;
  }

  async function abrirComoEmpleado(page: Page, persona: Persona) {
    await abrirComoUsuarioConContexto(page, persona.sesion, {
      contexto: { tipo: 'EMPLEADO', comercioId: dueno.comercioId },
      ultimoContexto: `EMPLEADO:${dueno.comercioId}`,
    });
  }

  async function abrirComoDueno(page: Page) {
    await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: dueno.comercioId, ultimoComercioId: dueno.comercioId });
  }

  async function restaurarComercio() {
    ponerEstadoComercio(dueno.comercioId, 'APTO_VENTA');
  }

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat E3B1 ${sufijoUnico()}`);
    const horarios = [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
    dueno = await prepararAprobado(request, adminToken, localidadId, true, horarios);
    productoId = await crearProducto(request, dueno.token, { nombre: `Producto E3B1 ${sufijoUnico()}`, precio: 4200, categoriaId });
    comprador = await nuevaPersona(request, false);
    elena = await nuevaPersona(request, true);
    ajena = await nuevaPersona(request, false);
  });

  test.afterEach(async () => {
    await restaurarComercio();
  });

  test.describe('Lista de pedidos', () => {
    test('el Empleado ve "Tu pedido" solo en su pedido, con chevron en lugar de "Ver pedido" y sin botones en las filas', async ({ page, request }) => {
      const propio = await nuevoPedido(request, elena, 'PENDIENTE');
      const ajeno = await nuevoPedido(request, comprador, 'PENDIENTE');
      await abrirComoEmpleado(page, elena);
      await page.goto('/comercio-pedidos.html');

      const filaPropia = page.getByTestId(`pedido-item-${propio}`);
      const filaAjena = page.getByTestId(`pedido-item-${ajeno}`);
      await expect(filaPropia).toBeVisible();
      await expect(filaAjena).toBeVisible();
      await expect(filaPropia.getByTestId('chip-tu-pedido')).toHaveText('Tu pedido');
      await expect(filaPropia).toContainText(`Pedido #${propio}`);
      await expect(filaAjena.getByTestId('chip-tu-pedido')).toHaveCount(0);
      for (const fila of [filaPropia, filaAjena]) {
        await expect(fila).not.toContainText('Ver pedido');
        await expect(fila.locator('button')).toHaveCount(0);
        await expect(fila.locator('.pedido-card__chevron svg')).toHaveCount(1);
        await expect(fila.getByTestId('total-pedido')).toBeVisible();
        await expect(fila.getByTestId('estado-pedido')).toBeVisible();
      }
      await sinScrollHorizontal(page);
    });

    test('el Dueño no ve la marca "Tu pedido" en ninguna fila y las filas también llevan chevron', async ({ page, request }) => {
      const propioDeElena = await nuevoPedido(request, elena, 'PENDIENTE');
      await abrirComoDueno(page);
      await page.goto('/comercio-pedidos.html');

      await expect(page.getByTestId(`pedido-item-${propioDeElena}`)).toBeVisible();
      await expect(page.getByTestId('chip-tu-pedido')).toHaveCount(0);
      await expect(page.getByTestId(`pedido-item-${propioDeElena}`).locator('.pedido-card__chevron svg')).toHaveCount(1);
      await sinScrollHorizontal(page);
    });

    test('el panel del Empleado también marca su pedido con "Tu pedido"', async ({ page, request }) => {
      const propio = await nuevoPedido(request, elena, 'PENDIENTE');
      await abrirComoEmpleado(page, elena);
      await page.goto('/comercio-dashboard.html');

      await expect(page.getByTestId(`pedido-item-${propio}`).getByTestId('chip-tu-pedido')).toBeVisible();
      await sinScrollHorizontal(page);
    });

    test('con el comercio suspendido o cerrado temporalmente el Empleado ve el aviso arriba de la lista; con el comercio operativo no', async ({ page, request }) => {
      await nuevoPedido(request, comprador, 'PENDIENTE');
      await abrirComoEmpleado(page, elena);
      await page.goto('/comercio-pedidos.html');
      await expect(page.getByTestId('lista-pedidos')).toBeVisible();
      await expect(page.getByTestId('aviso-comercio-no-operativo')).toHaveCount(0);

      ponerEstadoComercio(dueno.comercioId, 'SUSPENDIDO');
      await page.goto('/comercio-pedidos.html');
      await expect(page.getByTestId('franja-pedidos-suspendido-texto')).toContainText('Comercio suspendido.');
      await expect(page.getByTestId('aviso-comercio-no-operativo')).toHaveCount(0);
      await sinScrollHorizontal(page);

      ponerEstadoComercio(dueno.comercioId, 'CERRADO_TEMPORALMENTE');
      await page.goto('/comercio-pedidos.html');
      await expect(page.getByTestId('aviso-comercio-no-operativo')).toHaveText(AVISO_CERRADO);
      await sinScrollHorizontal(page);
    });

    test('el panel del Empleado muestra el mismo texto de aviso con el comercio suspendido', async ({ page }) => {
      ponerEstadoComercio(dueno.comercioId, 'SUSPENDIDO');
      await abrirComoEmpleado(page, elena);
      await page.goto('/comercio-dashboard.html');

      await expect(page.getByTestId('tarjeta-comercio-suspendido')).toContainText('Este comercio está suspendido');
    });
  });

  test.describe('Detalle de un pedido propio', () => {
    test('muestra la nota, sin botones y sin recorrido, y no pide la trazabilidad', async ({ page, request }) => {
      const propio = await nuevoPedido(request, elena, 'PENDIENTE');
      const pedidosAlServidor: string[] = [];
      page.on('request', (peticion) => pedidosAlServidor.push(peticion.url()));
      await abrirComoEmpleado(page, elena);
      await page.goto(`/comercio-pedido-detalle.html?id=${propio}`);

      await expect(page.getByTestId('nota-pedido-propio')).toHaveText(TEXTO_PROPIO);
      for (const boton of ['btn-aceptar-pedido', 'btn-rechazar-pedido', 'btn-despachar-pedido', 'btn-anular-pedido', 'btn-confirmar-retiro', 'btn-cerrar-no-retirado']) {
        await expect(page.getByTestId(boton)).toHaveCount(0);
      }
      await expect(page.getByTestId('recorrido-pedido')).toHaveCount(0);
      expect(pedidosAlServidor.filter((url) => url.includes('/trazabilidad'))).toHaveLength(0);
      await sinScrollHorizontal(page);
    });

    test('un pedido propio listo para retirar tampoco muestra "Entregar" ni "Cerrar como no retirado"', async ({ page, request }) => {
      const propioListo = await nuevoPedido(request, elena, 'LISTO', 90);
      await abrirComoEmpleado(page, elena);
      await page.goto(`/comercio-pedido-detalle.html?id=${propioListo}`);

      await expect(page.getByTestId('nota-pedido-propio')).toBeVisible();
      await expect(page.getByTestId('btn-confirmar-retiro')).toHaveCount(0);
      await expect(page.getByTestId('btn-cerrar-no-retirado')).toHaveCount(0);
    });

    test('el Dueño ve ese mismo pedido con sus botones y su recorrido', async ({ page, request }) => {
      const propioDeElena = await nuevoPedido(request, elena, 'PENDIENTE');
      await abrirComoDueno(page);
      await page.goto(`/comercio-pedido-detalle.html?id=${propioDeElena}`);

      await expect(page.getByTestId('btn-aceptar-pedido')).toBeVisible();
      await expect(page.getByTestId('nota-pedido-propio')).toHaveCount(0);
      await expect(page.getByTestId('recorrido-pedido')).toBeVisible();
    });
  });

  test.describe('Recorrido del pedido', () => {
    async function verificarRecorrido(page: Page, pedidoId: number, esperado: any[]) {
      await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
      const pasos = page.getByTestId('recorrido-paso');
      await expect(pasos).toHaveCount(esperado.length);
      for (let i = 0; i < esperado.length; i += 1) {
        const paso = esperado[i];
        await expect(pasos.nth(i).getByTestId('recorrido-texto')).toHaveText(paso.accionTexto);
        const quien = paso.actorRol === 'SISTEMA' ? 'Sistema' : `${paso.actorNombre}, ${paso.actorRolTexto}`;
        await expect(pasos.nth(i).getByTestId('recorrido-meta')).toHaveText(`${String(paso.fechaHora).slice(11, 16)} · ${quien}`);
      }
      await expect(pasos.nth(0).getByTestId('recorrido-meta')).toHaveText(/^\d\d:\d\d · Sistema$/);
      await sinScrollHorizontal(page);
    }

    test('el Empleado ve los pasos en orden, con texto, hora y "nombre, rol"; el sistema aparece solo como "Sistema"', async ({ page, request }) => {
      const pedidoId = await nuevoPedido(request, comprador, 'LISTO');
      const esperado = (await trazabilidad(request, dueno.token, pedidoId)).body.data.pasos as any[];
      expect(esperado.length).toBeGreaterThanOrEqual(3);
      await abrirComoEmpleado(page, elena);
      await verificarRecorrido(page, pedidoId, esperado);
    });

    test('el Dueño ve el mismo recorrido', async ({ page, request }) => {
      const pedidoId = await nuevoPedido(request, comprador, 'LISTO');
      const esperado = (await trazabilidad(request, dueno.token, pedidoId)).body.data.pasos as any[];
      await abrirComoDueno(page);
      await verificarRecorrido(page, pedidoId, esperado);
    });

    test('un pedido rechazado muestra el motivo en su último paso', async ({ page, request }) => {
      const pedidoId = await nuevoPedido(request, comprador, 'PENDIENTE');
      const rechazo = await accion(request, dueno.token, pedidoId, 'rechazar', { motivo: 'SIN_STOCK', comentario: null });
      expect(rechazo.status).toBe(200);
      const esperado = (await trazabilidad(request, dueno.token, pedidoId)).body.data.pasos as any[];
      const ultimo = esperado[esperado.length - 1];
      expect(ultimo.motivo).toBeTruthy();
      await abrirComoEmpleado(page, elena);
      await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);

      await expect(page.getByTestId('recorrido-paso').last().getByTestId('recorrido-motivo')).toHaveText(`Motivo: ${ultimo.motivo}`);
    });

    test('el Cliente no ve el recorrido en el detalle de su pedido', async ({ page, request }) => {
      const pedidoId = await nuevoPedido(request, comprador, 'PREPARACION');
      await abrirComoUsuarioConContexto(page, comprador.sesion);
      await page.goto(`/pedido-detalle.html?id=${pedidoId}`);

      await expect(page.getByTestId('cabecera-estado-pedido')).toBeVisible();
      await expect(page.getByTestId('recorrido-pedido')).toHaveCount(0);
      const respuesta = await trazabilidad(request, comprador.sesion.token, pedidoId);
      expect([400, 404]).toContain(respuesta.status);
    });
  });

  test.describe('Acciones del Empleado sobre pedidos ajenos', () => {
    test('acepta, despacha y entrega un pedido de retiro desde el detalle', async ({ page, request }) => {
      const pedidoId = await nuevoPedido(request, comprador, 'PENDIENTE');
      await abrirComoEmpleado(page, elena);
      await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);

      await page.getByTestId('btn-aceptar-pedido').click();
      await expect(page.getByTestId('cabecera-estado-pedido')).toContainText('En preparación');
      await page.getByTestId('btn-despachar-pedido').click();
      await expect(page.getByTestId('cabecera-estado-pedido')).toContainText('Listo para retirar');
      await expect(page.getByTestId('btn-confirmar-retiro')).toHaveText('Entregar');
      await expect(page.getByTestId('btn-confirmar-retiro')).toBeEnabled();
      await page.getByTestId('btn-confirmar-retiro').click();

      await expect(page.getByTestId('cabecera-estado-pedido')).toContainText('Entregado');
      expect(estadoDe(pedidoId)).toBe('ENTREGADO');
      await expect(page.getByTestId('recorrido-paso')).toHaveCount(4);
      await expect(page.getByTestId('recorrido-paso').last().getByTestId('recorrido-meta')).toContainText(', Empleado');
    });

    test('rechaza con motivo y anula desde el detalle', async ({ page, request }) => {
      const aRechazar = await nuevoPedido(request, comprador, 'PENDIENTE');
      const aAnular = await nuevoPedido(request, comprador, 'PREPARACION');
      await abrirComoEmpleado(page, elena);

      await page.goto(`/comercio-pedido-detalle.html?id=${aRechazar}`);
      await page.getByTestId('btn-rechazar-pedido').click();
      await page.getByTestId('select-motivo-rechazo').selectOption('SIN_STOCK');
      await page.getByTestId('btn-confirmar-rechazo').click();
      await expect(page.getByTestId('cabecera-estado-pedido')).toContainText('Rechazado');

      await page.goto(`/comercio-pedido-detalle.html?id=${aAnular}`);
      await page.getByTestId('btn-anular-pedido').click();
      await page.getByTestId('select-motivo-anulacion').selectOption('PROBLEMA_TECNICO');
      await page.getByTestId('btn-confirmar-anulacion').click();
      await expect(page.getByTestId('cabecera-estado-pedido')).toContainText('Anulado');
      expect(estadoDe(aRechazar)).toBe('RECHAZADO');
      expect(estadoDe(aAnular)).toBe('ANULADO');
    });
  });

  test.describe('Cerrar como no retirado', () => {
    test('antes de la espera el botón está apagado con la ayuda "Disponible en N min (desde las HH:mm)"; "Entregar" sigue habilitado', async ({ page, request }) => {
      const pedidoId = await nuevoPedido(request, comprador, 'LISTO', 30);
      const desde = (await apiConHeaders(request, 'GET', '/pedidos/comercio', dueno.token, conComercio())).body.data.find((p: any) => p.id === pedidoId);
      expect(desde.noRetiradoMinutosRestantes).toBeGreaterThanOrEqual(29);
      expect(desde.noRetiradoMinutosRestantes).toBeLessThanOrEqual(30);
      const hora = String(desde.noRetiradoDisponibleDesde).slice(11, 16);
      await abrirComoEmpleado(page, elena);
      await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);

      await expect(page.getByTestId('btn-cerrar-no-retirado')).toBeDisabled();
      await expect(page.getByTestId('btn-cerrar-no-retirado')).toHaveText('Cerrar como no retirado');
      await expect(page.getByTestId('ayuda-no-retirado')).toHaveText(new RegExp(`^Disponible en (29|30) min \\(desde las ${hora}\\)$`));
      await expect(page.getByTestId('btn-confirmar-retiro')).toBeEnabled();
      await sinScrollHorizontal(page);
    });

    test('al cumplirse la espera la cuenta regresiva habilita el botón y oculta la ayuda', async ({ page, request }) => {
      const pedidoId = await nuevoPedido(request, comprador, 'LISTO', 59);
      await page.clock.install();
      await abrirComoEmpleado(page, elena);
      await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);

      await expect(page.getByTestId('recorrido-paso').first()).toBeVisible();
      await expect(page.getByTestId('ayuda-no-retirado')).toHaveText(/^Disponible en 1 min \(desde las \d\d:\d\d\)$/);
      await expect(page.getByTestId('btn-cerrar-no-retirado')).toBeDisabled();

      await page.clock.fastForward(61_000);

      await expect(page.getByTestId('btn-cerrar-no-retirado')).toBeEnabled();
      await expect(page.getByTestId('ayuda-no-retirado')).toBeHidden();
    });

    test('cumplida la espera: confirmar pide confirmación que avisa que no hay devolución, Cancelar no cambia nada y Cerrar lo deja como no retirado', async ({ page, request }) => {
      const pedidoId = await nuevoPedido(request, comprador, 'LISTO', 90);
      await abrirComoEmpleado(page, elena);
      await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
      await expect(page.getByTestId('btn-cerrar-no-retirado')).toBeEnabled();
      await expect(page.getByTestId('ayuda-no-retirado')).toBeHidden();

      await page.getByTestId('btn-cerrar-no-retirado').click();
      await expect(page.getByTestId('modal-no-retirado')).toBeVisible();
      await expect(page.getByTestId('texto-modal-no-retirado')).toHaveText(TEXTO_MODAL_NO_RETIRADO);
      await sinScrollHorizontal(page);
      await page.getByTestId('btn-cancelar-no-retirado').click();
      await expect(page.getByTestId('modal-no-retirado')).toHaveCount(0);
      expect(estadoDe(pedidoId)).toBe('LISTO_PARA_RETIRAR');

      await page.getByTestId('btn-cerrar-no-retirado').click();
      await page.getByTestId('btn-confirmar-no-retirado').click();

      await expect(page.getByTestId('cabecera-estado-pedido')).toContainText('No retirado');
      await expect(page.getByTestId('btn-cerrar-no-retirado')).toHaveCount(0);
      expect(estadoDe(pedidoId)).toBe('NO_RETIRADO');
      await expect(page.getByTestId('recorrido-paso').last().getByTestId('recorrido-texto')).toContainText('no retirado');
    });

    test('el Dueño también cierra un retiro como no retirado', async ({ page, request }) => {
      const pedidoId = await nuevoPedido(request, comprador, 'LISTO', 75);
      await abrirComoDueno(page);
      await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);

      await page.getByTestId('btn-cerrar-no-retirado').click();
      await page.getByTestId('btn-confirmar-no-retirado').click();

      await expect(page.getByTestId('cabecera-estado-pedido')).toContainText('No retirado');
      expect(estadoDe(pedidoId)).toBe('NO_RETIRADO');
    });

    test('con el comercio suspendido el Empleado cierra como no retirado y entrega', async ({ page, request }) => {
      const paraCerrar = await nuevoPedido(request, comprador, 'LISTO', 90);
      const paraEntregar = await nuevoPedido(request, comprador, 'LISTO', 0);
      ponerEstadoComercio(dueno.comercioId, 'SUSPENDIDO');
      await abrirComoEmpleado(page, elena);

      await page.goto(`/comercio-pedido-detalle.html?id=${paraCerrar}`);
      await page.getByTestId('btn-cerrar-no-retirado').click();
      await page.getByTestId('btn-confirmar-no-retirado').click();
      await expect(page.getByTestId('cabecera-estado-pedido')).toContainText('No retirado');

      await page.goto(`/comercio-pedido-detalle.html?id=${paraEntregar}`);
      await page.getByTestId('btn-confirmar-retiro').click();
      await expect(page.getByTestId('cabecera-estado-pedido')).toContainText('Entregado');
    });
  });

  test.describe('Errores de reglas de negocio en un aviso fijo', () => {
    test('aceptar con el comercio suspendido muestra el mensaje del servidor en un aviso fijo que no desaparece solo y se limpia al hacer otra acción', async ({ page, request }) => {
      const pedidoId = await nuevoPedido(request, comprador, 'PENDIENTE');
      ponerEstadoComercio(dueno.comercioId, 'SUSPENDIDO');
      const mensaje = (await accion(request, elena.sesion.token, pedidoId, 'aceptar')).body.mensaje as string;
      expect(mensaje.length).toBeGreaterThan(10);
      ponerEstadoComercio(dueno.comercioId, 'APTO_VENTA');
      await page.clock.install();
      await abrirComoEmpleado(page, elena);
      await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);

      await expect(page.getByTestId('btn-aceptar-pedido')).toBeEnabled();
      await expect(page.getByTestId('recorrido-paso').first()).toBeVisible();
      ponerEstadoComercio(dueno.comercioId, 'SUSPENDIDO');
      await page.getByTestId('btn-aceptar-pedido').click();

      const aviso = page.getByTestId('aviso-fijo');
      await expect(aviso).toBeVisible();
      await expect(aviso.getByTestId('aviso-fijo-texto')).toHaveText(mensaje);
      await expect(aviso).toHaveAttribute('role', 'alert');
      await expect(aviso.locator('svg')).toHaveCount(1);
      await expect(page.locator('.toast')).toHaveCount(0);
      await page.clock.runFor(10_000);
      await expect(aviso).toBeVisible();
      await expect(page.getByTestId('btn-aceptar-pedido')).toBeEnabled();
      expect(estadoDe(pedidoId)).toBe('PENDIENTE_CONFIRMACION_COMERCIO');
      await sinScrollHorizontal(page);

      await page.getByTestId('btn-rechazar-pedido').click();
      await expect(page.getByTestId('aviso-fijo')).toHaveCount(0);
    });

    test('si el servidor todavía no habilita el cierre como no retirado, el 409 RETIRO_EN_ESPERA se muestra en el aviso fijo', async ({ page, request }) => {
      const pedidoId = await nuevoPedido(request, comprador, 'LISTO', 90);
      await abrirComoEmpleado(page, elena);
      await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
      await expect(page.getByTestId('btn-cerrar-no-retirado')).toBeEnabled();
      expect((await envejecer(request, pedidoId, -85)).status).toBe(200);

      await page.getByTestId('btn-cerrar-no-retirado').click();
      await page.getByTestId('btn-confirmar-no-retirado').click();

      await expect(page.getByTestId('aviso-fijo-texto')).toContainText('Todavía no podés cerrar este pedido como no retirado');
      await expect(page.getByTestId('btn-cerrar-no-retirado')).toBeEnabled();
      expect(estadoDe(pedidoId)).toBe('LISTO_PARA_RETIRAR');
      await sinScrollHorizontal(page);
    });

    test('si otro del equipo ya aceptó el pedido, el 409 muestra el aviso fijo y el detalle se refresca con el estado y los botones nuevos sin borrar el aviso', async ({ page, request }) => {
      const pedidoId = await nuevoPedido(request, comprador, 'PENDIENTE');
      await abrirComoEmpleado(page, elena);
      await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
      await expect(page.getByTestId('btn-aceptar-pedido')).toBeEnabled();
      await expect(page.getByTestId('recorrido-paso').first()).toBeVisible();
      expect((await accion(request, dueno.token, pedidoId, 'aceptar')).status).toBe(200);

      await page.getByTestId('btn-aceptar-pedido').click();

      const aviso = page.getByTestId('aviso-fijo');
      await expect(aviso).toBeVisible();
      await expect(aviso.getByTestId('aviso-fijo-texto')).not.toBeEmpty();
      await expect(page.getByTestId('cabecera-estado-pedido')).toContainText('En preparación');
      await expect(page.getByTestId('btn-despachar-pedido')).toBeVisible();
      await expect(page.getByTestId('btn-anular-pedido')).toBeVisible();
      await expect(page.getByTestId('btn-aceptar-pedido')).toHaveCount(0);
      await expect(page.getByTestId('btn-rechazar-pedido')).toHaveCount(0);
      await expect(aviso).toBeVisible();
      await expect(page.locator('.toast')).toHaveCount(0);
      expect(estadoDe(pedidoId)).toBe('EN_PREPARACION');
      await sinScrollHorizontal(page);
    });

    test('si el pedido ya llegó a un estado final el 409 refresca el detalle, deja el aviso y no queda ningún botón', async ({ page, request }) => {
      const pedidoId = await nuevoPedido(request, comprador, 'PENDIENTE');
      await abrirComoEmpleado(page, elena);
      await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
      await expect(page.getByTestId('btn-aceptar-pedido')).toBeEnabled();
      await expect(page.getByTestId('recorrido-paso').first()).toBeVisible();
      expect((await accion(request, dueno.token, pedidoId, 'rechazar', { motivo: 'SIN_STOCK', comentario: null })).status).toBe(200);

      await page.getByTestId('btn-aceptar-pedido').click();

      await expect(page.getByTestId('aviso-fijo')).toBeVisible();
      await expect(page.getByTestId('cabecera-estado-pedido')).toContainText('Rechazado');
      for (const boton of ['btn-aceptar-pedido', 'btn-rechazar-pedido', 'btn-despachar-pedido', 'btn-anular-pedido']) {
        await expect(page.getByTestId(boton)).toHaveCount(0);
      }
      await expect(page.getByTestId('aviso-fijo')).toBeVisible();
    });

    test('un error que no es de reglas de negocio sigue saliendo como aviso temporal', async ({ page, request }) => {
      const pedidoId = await nuevoPedido(request, comprador, 'PENDIENTE');
      await page.route('**/pedidos/comercio/*/aceptar', (ruta) =>
        ruta.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Solicitud inválida', data: null }) }),
      );
      await abrirComoEmpleado(page, elena);
      await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);

      await page.getByTestId('btn-aceptar-pedido').click();

      await expect(page.locator('.toast')).toContainText('Solicitud inválida');
      await expect(page.getByTestId('aviso-fijo')).toHaveCount(0);
    });
  });

  test.describe('Lo que no cambia ni se ve según el rol', () => {
    test('un Cliente sin relación con el comercio no llega al detalle del comercio', async ({ page, request }) => {
      const pedidoId = await nuevoPedido(request, comprador, 'PENDIENTE');
      await abrirComoUsuarioConContexto(page, ajena.sesion);
      await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);

      await expect(page).not.toHaveURL(/comercio-pedido-detalle/);
    });

    test('el detalle del pedido a 375 px entra sin desborde con recorrido, acciones y aviso', async ({ page, request }) => {
      const pedidoId = await nuevoPedido(request, comprador, 'LISTO', 90);
      await abrirComoEmpleado(page, elena);
      await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);

      await expect(page.getByTestId('recorrido-paso').first()).toBeVisible();
      await expect(page.getByTestId('btn-cerrar-no-retirado')).toBeVisible();
      await sinScrollHorizontal(page);
    });
  });
});
