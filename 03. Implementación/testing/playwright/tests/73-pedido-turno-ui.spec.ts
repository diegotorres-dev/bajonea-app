import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  agregarItemCarrito,
  apiConHeaders,
  confirmarPagoTest,
  crearCategoria,
  crearPedido,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sufijoUnico,
} from './helpers/backend';
import type { ClienteRegistrado, SesionApi } from './helpers/backend';
import { abrirComoUsuarioConContexto, sumarAlEquipo } from './helpers/empleado';
import { sinScrollHorizontal } from './helpers/layout';
import type { Dueno } from './helpers/multicomercio';
import { agregarComercioApto, prepararAprobado, reemplazarHorarios } from './helpers/multicomercio';
import { diaDeLaSemanaEnZona, fechaHoraSqlEnZona, hoyEnZona } from './helpers/zona';

const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;
const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const PRECIO = 10000;
const HEADER = 'X-Comercio-Id';
const conComercio = (comercioId: number): Record<string, string> => ({ [HEADER]: String(comercioId) });
const horaEn = (desplazamientoMin: number): string => fechaHoraSqlEnZona(Date.now() + desplazamientoMin * MINUTO).slice(11, 16);
const diaEn = (desplazamientoMin: number): string => DIAS[diaDeLaSemanaEnZona(Date.now() + desplazamientoMin * MINUTO)];
const instante = (desplazamientoMin: number): string => fechaHoraSqlEnZona(Date.now() + desplazamientoMin * MINUTO).replace(' ', 'T');
const fechaA = (desplazamientoDias: number): string => hoyEnZona(Date.now() + desplazamientoDias * DIA);
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];

function formatearPrecio(valor: number): string {
  return `$${Math.round(valor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

interface Escena {
  comercioId: number;
  pedidos: number[];
}

interface Turno {
  fecha: string;
  inicio: string;
  fin: string;
  cruzaMedianoche: boolean;
}

function respuestaDelDueno(estado: string, turno: Turno | null, extra: Record<string, unknown> = {}) {
  return {
    mensaje: 'Resumen del turno',
    data: { estado, turno, vendido: 25000, comision: 250, neto: 24750, cantidadPedidos: 3, cantidadPendientes: 2, ...extra },
  };
}

test.describe('Fase 2, T2 (UI): el panel con "Vendido en el turno", el rótulo del turno y el desglose del Dueño', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;
  let dueno: Dueno;
  let comprador: ClienteRegistrado;
  let compradorToken: string;
  let empleado: ClienteRegistrado;
  let enCurso: Escena;
  let franjaEnCurso: { apertura: string; cierre: string };
  let terminado: Escena;
  let sinTurno: Escena;

  async function escena(request: APIRequestContext, cantidad: number, horarios: Array<{ diaSemana: string; horaApertura: string; horaCierre: string }>): Promise<Escena> {
    const comercioId = await agregarComercioApto(request, dueno, `Panel T2 ${sufijoUnico()}`);
    const producto = await apiConHeaders(request, 'POST', '/productos', dueno.token, conComercio(comercioId), {
      nombre: `Producto Panel T2 ${sufijoUnico()}`,
      precio: PRECIO,
      categoriaId,
    });
    expect(producto.status, JSON.stringify(producto.body)).toBe(201);
    const productoId = producto.body.data.id as number;
    const pedidos: number[] = [];
    for (let i = 0; i < cantidad; i += 1) {
      await apiConHeaders(request, 'DELETE', '/carrito', compradorToken);
      await agregarItemCarrito(request, compradorToken, productoId, 1);
      pedidos.push(await crearPedido(request, compradorToken, 'RETIRO', null));
    }
    reemplazarHorarios(comercioId, horarios);
    return { comercioId, pedidos };
  }

  async function aceptar(request: APIRequestContext, comercioId: number, pedidoId: number): Promise<void> {
    const respuesta = await apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoId}/aceptar`, dueno.token, conComercio(comercioId), {});
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
  }

  async function resumenDe(request: APIRequestContext, token: string, comercioId: number) {
    const respuesta = await apiConHeaders(request, 'GET', '/pedidos/comercio/resumen-turno', token, conComercio(comercioId));
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    return respuesta.body.data;
  }

  async function abrirComoDueno(page: Page, request: APIRequestContext, comercioId: number): Promise<SesionApi> {
    const sesion = await login(request, dueno.nombreUsuario, dueno.password);
    await abrirComoUsuarioConContexto(page, sesion);
    await page.addInitScript(
      ([id, usuarioId]) => {
        sessionStorage.setItem('bajonea_comercio_activo', JSON.stringify({ usuarioId, comercioId: id }));
      },
      [comercioId, sesion.usuario.id] as const,
    );
    return sesion;
  }

  async function abrirComoEmpleado(page: Page, request: APIRequestContext, comercioId: number): Promise<SesionApi> {
    const sesion = await login(request, empleado.nombreUsuario, empleado.password);
    await abrirComoUsuarioConContexto(page, sesion, {
      contexto: { tipo: 'EMPLEADO', comercioId },
      ultimoContexto: `EMPLEADO:${comercioId}`,
    });
    return sesion;
  }

  function erroresDeConsola(page: Page): string[] {
    const errores: string[] = [];
    page.on('pageerror', (error) => errores.push(error.message));
    page.on('console', (mensaje) => {
      if (mensaje.type() === 'error') {
        errores.push(mensaje.text());
      }
    });
    return errores;
  }

  async function simularResumen(page: Page, cuerpo: unknown): Promise<void> {
    await page.route('**/pedidos/comercio/resumen-turno', (ruta) => ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cuerpo) }));
  }

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat Panel T2 ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    comprador = await registrarYVerificarCliente(request, localidadId);
    compradorToken = (await login(request, comprador.nombreUsuario, comprador.password)).token;

    franjaEnCurso = { apertura: horaEn(-30), cierre: horaEn(30) };
    enCurso = await escena(request, 3, [{ diaSemana: diaEn(-30), horaApertura: franjaEnCurso.apertura, horaCierre: franjaEnCurso.cierre }]);
    await confirmarPagoTest(request, enCurso.pedidos[0], true);
    await confirmarPagoTest(request, enCurso.pedidos[1], true);
    await confirmarPagoTest(request, enCurso.pedidos[2], true, instante(-1440));
    await aceptar(request, enCurso.comercioId, enCurso.pedidos[0]);

    terminado = await escena(request, 2, [{ diaSemana: diaEn(-180), horaApertura: horaEn(-180), horaCierre: horaEn(-120) }]);
    await confirmarPagoTest(request, terminado.pedidos[0], true, instante(-150));
    await confirmarPagoTest(request, terminado.pedidos[1], true, instante(-140));
    await aceptar(request, terminado.comercioId, terminado.pedidos[0]);

    sinTurno = await escena(request, 1, []);
    await confirmarPagoTest(request, sinTurno.pedidos[0], true, `${hoyEnZona()}T13:00:00`);

    empleado = await registrarYVerificarCliente(request, localidadId);
    await sumarAlEquipo(request, enCurso.comercioId, empleado, dueno.token);
    await sumarAlEquipo(request, sinTurno.comercioId, empleado, dueno.token);
  });

  test.describe('Dueño con el turno en curso', () => {
    test('muestra el rótulo "En curso", las tres métricas del servidor y el desglose cerrado', async ({ page, request }) => {
      const errores = erroresDeConsola(page);
      const sesion = await abrirComoDueno(page, request, enCurso.comercioId);
      const esperado = await resumenDe(request, sesion.token, enCurso.comercioId);

      await page.goto('/comercio-dashboard.html');

      const rotulo = page.getByTestId('turno-rotulo');
      await expect(rotulo).toHaveAttribute('data-estado', 'EN_CURSO');
      await expect(page.getByTestId('turno-estado')).toContainText('En curso');
      await expect(page.getByTestId('turno-estado')).toContainText(`${franjaEnCurso.apertura} a ${franjaEnCurso.cierre}`);
      await expect(page.getByTestId('metrica-vendido')).toContainText(formatearPrecio(esperado.vendido));
      await expect(page.getByTestId('metrica-vendido')).toContainText('Vendido en el turno');
      await expect(page.getByTestId('metrica-pedidos')).toContainText(String(esperado.cantidadPedidos));
      await expect(page.getByTestId('metrica-pedidos')).toContainText('Pedidos del turno');
      await expect(page.getByTestId('metrica-pendientes')).toContainText(String(esperado.cantidadPendientes));
      await expect(page.getByTestId('metrica-pendientes')).toContainText('Pendientes');
      await expect(page.getByTestId('desglose-turno-toggle')).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByTestId('desglose-turno-panel')).toBeHidden();
      expect(errores).toEqual([]);
    });

    test('"Vendido" es el subtotal bruto y los pendientes de un turno anterior siguen contando', async ({ page, request }) => {
      const sesion = await abrirComoDueno(page, request, enCurso.comercioId);
      const esperado = await resumenDe(request, sesion.token, enCurso.comercioId);
      expect(esperado.vendido).toBe(PRECIO);
      expect(esperado.cantidadPedidos).toBe(2);
      expect(esperado.cantidadPendientes).toBe(2);

      await page.goto('/comercio-dashboard.html');

      await expect(page.getByTestId('metrica-vendido')).toContainText(formatearPrecio(PRECIO));
      await expect(page.getByTestId('metrica-pedidos')).toContainText('2');
      await expect(page.getByTestId('metrica-pendientes')).toContainText('2');
    });

    test('"Ver comisión y neto" despliega en el mismo lugar la comisión y el neto del servidor, y se vuelve a plegar', async ({ page, request }) => {
      const sesion = await abrirComoDueno(page, request, enCurso.comercioId);
      const esperado = await resumenDe(request, sesion.token, enCurso.comercioId);
      await page.goto('/comercio-dashboard.html');
      const boton = page.getByTestId('desglose-turno-toggle');
      await expect(boton).toContainText('Ver comisión y neto');

      await boton.click();

      await expect(boton).toHaveAttribute('aria-expanded', 'true');
      await expect(boton).toContainText('Ocultar comisión y neto');
      const panel = page.getByTestId('desglose-turno-panel');
      await expect(panel).toBeVisible();
      await expect(panel).toContainText('Comisión');
      await expect(panel).toContainText('Neto del turno');
      await expect(page.getByTestId('metrica-comision')).toHaveText(formatearPrecio(esperado.comision));
      await expect(page.getByTestId('metrica-neto')).toHaveText(formatearPrecio(esperado.neto));
      expect(esperado.vendido - esperado.comision).toBeCloseTo(esperado.neto, 2);

      await boton.click();

      await expect(boton).toHaveAttribute('aria-expanded', 'false');
      await expect(panel).toBeHidden();
    });

    test('el botón del desglose mide al menos 44 px de alto y se opera con el teclado', async ({ page, request }) => {
      await abrirComoDueno(page, request, enCurso.comercioId);
      await page.goto('/comercio-dashboard.html');
      const boton = page.getByTestId('desglose-turno-toggle');

      const caja = await boton.boundingBox();
      expect(caja?.height ?? 0).toBeGreaterThanOrEqual(44);
      await boton.focus();
      await page.keyboard.press('Enter');

      await expect(boton).toHaveAttribute('aria-expanded', 'true');
      await expect(boton).toHaveAttribute('aria-controls', 'desglose-turno-panel');
      await page.keyboard.press('Space');
      await expect(boton).toHaveAttribute('aria-expanded', 'false');
    });

    test('el desglose abierto sobrevive a la recarga automática de los datos', async ({ page, request }) => {
      await abrirComoDueno(page, request, enCurso.comercioId);
      await page.goto('/comercio-dashboard.html');
      await page.getByTestId('desglose-turno-toggle').click();
      await expect(page.getByTestId('desglose-turno-panel')).toBeVisible();
      const llamadasAlResumen: string[] = [];
      page.on('request', (r) => {
        if (r.url().includes('/pedidos/comercio/resumen-turno')) {
          llamadasAlResumen.push(r.url());
        }
      });

      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
      });

      await expect.poll(() => llamadasAlResumen.length).toBeGreaterThan(0);
      await expect(page.getByTestId('desglose-turno-panel')).toBeVisible();
      await expect(page.getByTestId('desglose-turno-toggle')).toHaveAttribute('aria-expanded', 'true');
    });
  });

  test.describe('Empleado', () => {
    test('ve el vendido bruto y los contadores del servidor, sin comisión ni neto en el DOM', async ({ page, request }) => {
      const errores = erroresDeConsola(page);
      const sesion = await abrirComoEmpleado(page, request, enCurso.comercioId);
      const esperado = await resumenDe(request, sesion.token, enCurso.comercioId);
      expect(Object.keys(esperado).sort()).toEqual(['cantidadPedidos', 'cantidadPendientes', 'estado', 'turno', 'vendido']);

      await page.goto('/comercio-dashboard.html');

      await expect(page.getByTestId('turno-rotulo')).toHaveAttribute('data-estado', 'EN_CURSO');
      await expect(page.getByTestId('metrica-vendido')).toContainText(formatearPrecio(esperado.vendido));
      await expect(page.getByTestId('metrica-vendido')).toContainText('Vendido en el turno');
      await expect(page.getByTestId('metrica-pedidos')).toContainText(String(esperado.cantidadPedidos));
      await expect(page.getByTestId('metrica-pendientes')).toContainText(String(esperado.cantidadPendientes));
      await expect(page.getByTestId('desglose-turno-toggle')).toHaveCount(0);
      await expect(page.getByTestId('desglose-turno-panel')).toHaveCount(0);
      await expect(page.getByTestId('metrica-comision')).toHaveCount(0);
      await expect(page.getByTestId('metrica-neto')).toHaveCount(0);
      expect(await page.locator('.resumen-turno').count()).toBe(1);
      const html = (await page.locator('main').innerHTML()).toLowerCase();
      expect(html).not.toContain('comisión');
      expect(html).not.toContain('neto del turno');
      expect(html).not.toContain('desglose');
      expect(errores).toEqual([]);
    });

    test('la decisión es por la presencia de los datos y no por el rol: una respuesta del Dueño sin comisión ni neto no dibuja el desglose', async ({ page, request }) => {
      const cuerpo = respuestaDelDueno('EN_CURSO', { fecha: hoyEnZona(), inicio: `${hoyEnZona()}T00:00:00`, fin: `${fechaA(1)}T00:00:00`, cruzaMedianoche: false });
      delete (cuerpo.data as Record<string, unknown>).comision;
      delete (cuerpo.data as Record<string, unknown>).neto;
      await abrirComoDueno(page, request, enCurso.comercioId);
      await simularResumen(page, cuerpo);

      await page.goto('/comercio-dashboard.html');

      await expect(page.getByTestId('metrica-vendido')).toContainText(formatearPrecio(25000));
      await expect(page.getByTestId('desglose-turno-toggle')).toHaveCount(0);
      await expect(page.getByTestId('metrica-comision')).toHaveCount(0);
    });
  });

  test.describe('Turno terminado', () => {
    test('el último turno terminado se rotula "Terminó" con punto gris y sus cifras', async ({ page, request }) => {
      const sesion = await abrirComoDueno(page, request, terminado.comercioId);
      const esperado = await resumenDe(request, sesion.token, terminado.comercioId);
      expect(esperado.estado).toBe('TERMINADO');

      await page.goto('/comercio-dashboard.html');

      await expect(page.getByTestId('turno-rotulo')).toHaveAttribute('data-estado', 'TERMINADO');
      await expect(page.getByTestId('turno-estado')).toContainText('Terminó');
      await expect(page.getByTestId('turno-estado')).not.toContainText('En curso');
      await expect(page.getByTestId('turno-rotulo').locator('.turno-rotulo__punto--inactivo')).toHaveCount(1);
      await expect(page.getByTestId('turno-rotulo').locator('.turno-rotulo__punto--en-curso')).toHaveCount(0);
      await expect(page.getByTestId('metrica-vendido')).toContainText(formatearPrecio(esperado.vendido));
      await expect(page.getByTestId('metrica-pedidos')).toContainText(String(esperado.cantidadPedidos));
      await expect(page.getByTestId('metrica-pendientes')).toContainText(String(esperado.cantidadPendientes));
    });
  });

  test.describe('Sin turno', () => {
    test('el Dueño ve "Sin turno por ahora", guiones en Vendido y Pedidos y la cifra de Pendientes, sin desglose', async ({ page, request }) => {
      await abrirComoDueno(page, request, sinTurno.comercioId);

      await page.goto('/comercio-dashboard.html');

      await expect(page.getByTestId('turno-rotulo')).toHaveAttribute('data-estado', 'SIN_TURNO');
      await expect(page.getByTestId('turno-estado')).toHaveText('Sin turno por ahora');
      await expect(page.getByTestId('metrica-vendido').locator('.stats-bar__value')).toHaveText('–');
      await expect(page.getByTestId('metrica-pedidos').locator('.stats-bar__value')).toHaveText('–');
      await expect(page.getByTestId('metrica-pendientes').locator('.stats-bar__value')).toHaveText('1');
      await expect(page.getByTestId('desglose-turno-toggle')).toHaveCount(0);
    });

    test('el Empleado ve lo mismo', async ({ page, request }) => {
      await abrirComoEmpleado(page, request, sinTurno.comercioId);

      await page.goto('/comercio-dashboard.html');

      await expect(page.getByTestId('turno-estado')).toHaveText('Sin turno por ahora');
      await expect(page.getByTestId('metrica-vendido').locator('.stats-bar__value')).toHaveText('–');
      await expect(page.getByTestId('metrica-pendientes').locator('.stats-bar__value')).toHaveText('1');
      await expect(page.getByTestId('desglose-turno-toggle')).toHaveCount(0);
    });
  });

  test.describe('Rótulo del turno (respuestas controladas)', () => {
    test('un turno que cruza la medianoche dice "(día siguiente)" y nunca "+1"', async ({ page, request }) => {
      await abrirComoDueno(page, request, dueno.comercioId);
      await simularResumen(page, respuestaDelDueno('EN_CURSO', {
        fecha: hoyEnZona(),
        inicio: `${hoyEnZona()}T20:00:00`,
        fin: `${fechaA(1)}T02:00:00`,
        cruzaMedianoche: true,
      }));

      await page.goto('/comercio-dashboard.html');

      await expect(page.getByTestId('turno-estado')).toHaveText('En curso · 20:00 a 02:00 (día siguiente)');
      expect((await page.getByTestId('turno-rotulo').innerText()).includes('+1')).toBe(false);
    });

    test('un turno de hoy ya terminado dice "Terminó · 12:00 a 15:00"', async ({ page, request }) => {
      await abrirComoDueno(page, request, dueno.comercioId);
      await simularResumen(page, respuestaDelDueno('TERMINADO', {
        fecha: hoyEnZona(),
        inicio: `${hoyEnZona()}T12:00:00`,
        fin: `${hoyEnZona()}T15:00:00`,
        cruzaMedianoche: false,
      }));

      await page.goto('/comercio-dashboard.html');

      await expect(page.getByTestId('turno-estado')).toHaveText('Terminó · 12:00 a 15:00');
    });

    test('un turno que empezó ayer y ya terminó dice "Terminó ayer · 20:00 a 02:00 (día siguiente)"', async ({ page, request }) => {
      await abrirComoDueno(page, request, dueno.comercioId);
      await simularResumen(page, respuestaDelDueno('TERMINADO', {
        fecha: fechaA(-1),
        inicio: `${fechaA(-1)}T20:00:00`,
        fin: `${hoyEnZona()}T02:00:00`,
        cruzaMedianoche: true,
      }));

      await page.goto('/comercio-dashboard.html');

      await expect(page.getByTestId('turno-estado')).toHaveText('Terminó ayer · 20:00 a 02:00 (día siguiente)');
    });

    test('un turno de hace varios días indica la fecha, y uno en curso que empezó ayer lo aclara', async ({ page, request }) => {
      await abrirComoDueno(page, request, dueno.comercioId);
      const hace3 = fechaA(-3);
      await simularResumen(page, respuestaDelDueno('TERMINADO', {
        fecha: hace3,
        inicio: `${hace3}T12:00:00`,
        fin: `${hace3}T15:00:00`,
        cruzaMedianoche: false,
      }));

      await page.goto('/comercio-dashboard.html');

      const [, mes, dia] = hace3.split('-');
      await expect(page.getByTestId('turno-estado')).toHaveText(`Terminó el ${dia}/${mes} · 12:00 a 15:00`);

      await page.unroute('**/pedidos/comercio/resumen-turno');
      await simularResumen(page, respuestaDelDueno('EN_CURSO', {
        fecha: fechaA(-1),
        inicio: `${fechaA(-1)}T20:00:00`,
        fin: `${hoyEnZona()}T23:30:00`,
        cruzaMedianoche: true,
      }));
      await page.reload();

      await expect(page.getByTestId('turno-estado')).toHaveText('En curso desde ayer · 20:00 a 23:30 (día siguiente)');
    });

    test('una franja de todo el día muestra 23:59 como cierre', async ({ page, request }) => {
      await abrirComoDueno(page, request, dueno.comercioId);
      await simularResumen(page, respuestaDelDueno('EN_CURSO', {
        fecha: hoyEnZona(),
        inicio: `${hoyEnZona()}T00:00:00`,
        fin: `${fechaA(1)}T00:00:00`,
        cruzaMedianoche: false,
      }));

      await page.goto('/comercio-dashboard.html');

      await expect(page.getByTestId('turno-estado')).toHaveText('En curso · 00:00 a 23:59');
    });
  });

  test.describe('Recarga al fin del turno', () => {
    test('cuando termina el turno mostrado el panel se actualiza solo y pasa a "Terminó"', async ({ page, request }) => {
      let llamadas = 0;
      const turno: Turno = {
        fecha: hoyEnZona(),
        inicio: `${hoyEnZona()}T00:00:00`,
        fin: instante(0.07).slice(0, 19),
        cruzaMedianoche: false,
      };
      await abrirComoDueno(page, request, dueno.comercioId);
      await page.route('**/pedidos/comercio/resumen-turno', (ruta) => {
        llamadas += 1;
        const cuerpo = llamadas === 1
          ? respuestaDelDueno('EN_CURSO', turno)
          : respuestaDelDueno('TERMINADO', turno, { vendido: 31000 });
        return ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cuerpo) });
      });

      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId('turno-rotulo')).toHaveAttribute('data-estado', 'EN_CURSO');
      await expect(page.getByTestId('metrica-vendido')).toContainText(formatearPrecio(25000));

      await expect(page.getByTestId('turno-rotulo')).toHaveAttribute('data-estado', 'TERMINADO', { timeout: 20_000 });
      await expect(page.getByTestId('metrica-vendido')).toContainText(formatearPrecio(31000));
      expect(llamadas).toBeGreaterThanOrEqual(2);
    });

    test('un turno que ya terminó no programa ninguna recarga', async ({ page, request }) => {
      let llamadas = 0;
      await abrirComoDueno(page, request, dueno.comercioId);
      await page.route('**/pedidos/comercio/resumen-turno', (ruta) => {
        llamadas += 1;
        return ruta.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(respuestaDelDueno('TERMINADO', { fecha: hoyEnZona(), inicio: `${hoyEnZona()}T00:00:00`, fin: instante(-5).slice(0, 19), cruzaMedianoche: false })),
        });
      });

      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId('turno-rotulo')).toHaveAttribute('data-estado', 'TERMINADO');
      await page.waitForTimeout(4000);

      expect(llamadas).toBe(1);
    });
  });

  test.describe('Pantalla chica y consola', () => {
    test('a 375 px no hay scroll horizontal con el rótulo más largo y el desglose abierto', async ({ page, request }) => {
      const errores = erroresDeConsola(page);
      await page.setViewportSize({ width: 375, height: 812 });
      await abrirComoDueno(page, request, dueno.comercioId);
      await simularResumen(page, respuestaDelDueno('EN_CURSO', {
        fecha: fechaA(-1),
        inicio: `${fechaA(-1)}T20:00:00`,
        fin: `${hoyEnZona()}T23:30:00`,
        cruzaMedianoche: true,
      }, { vendido: 1234567, comision: 12345, neto: 1222222 }));

      await page.goto('/comercio-dashboard.html');
      await page.getByTestId('desglose-turno-toggle').click();

      await expect(page.getByTestId('metrica-comision')).toHaveText(formatearPrecio(12345));
      await sinScrollHorizontal(page);
      expect(errores).toEqual([]);
    });

    test('a 375 px el Empleado y el estado sin turno tampoco desbordan', async ({ page, request }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await abrirComoEmpleado(page, request, sinTurno.comercioId);

      await page.goto('/comercio-dashboard.html');

      await expect(page.getByTestId('turno-estado')).toHaveText('Sin turno por ahora');
      await sinScrollHorizontal(page);
    });
  });
});
