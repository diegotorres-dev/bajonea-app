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
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { ClienteRegistrado, SesionApi } from './helpers/backend';
import { abrirComoUsuarioConContexto, sumarAlEquipo } from './helpers/empleado';
import { sinScrollHorizontal } from './helpers/layout';
import type { Dueno } from './helpers/multicomercio';
import { agregarComercioApto, prepararAprobado, reemplazarHorarios } from './helpers/multicomercio';
import { hoyEnZona } from './helpers/zona';

const DIA = 24 * 60 * 60_000;
const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const PRECIO = 10000;
const HEADER = 'X-Comercio-Id';
const conComercio = (comercioId: number): Record<string, string> => ({ [HEADER]: String(comercioId) });
const fechaA = (desplazamientoDias: number): string => hoyEnZona(Date.now() + desplazamientoDias * DIA);
const a = (fecha: string, hora: string): string => `${fecha}T${hora}:00`;
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
const semana = (franjas: Array<[string, string]>) =>
  DIAS.flatMap((diaSemana) => franjas.map(([horaApertura, horaCierre]) => ({ diaSemana, horaApertura, horaCierre })));
const corta = (fecha: string): string => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
const nombreDelDia = (fecha: string): string => {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const nombre = new Date(Date.UTC(anio, mes - 1, dia)).toLocaleDateString('es-AR', { weekday: 'long', timeZone: 'UTC' });
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
};

function formatearPrecio(valor: number): string {
  return `$${Math.round(valor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

interface Escena {
  comercioId: number;
  pedidos: number[];
}

test.describe('Fase 2, T5 (UI): estadísticas del Dueño', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;
  let dueno: Dueno;
  let comprador: ClienteRegistrado;
  let compradorToken: string;
  let empleado: ClienteRegistrado;
  let conDatos: Escena;
  let cruce: Escena;
  let sinPedidos: Escena;
  let soloAntiguos: Escena;

  async function escena(request: APIRequestContext, cantidad: number, horarios: Array<{ diaSemana: string; horaApertura: string; horaCierre: string }>): Promise<Escena> {
    const comercioId = await agregarComercioApto(request, dueno, `Estadisticas UI ${sufijoUnico()}`);
    const producto = await apiConHeaders(request, 'POST', '/productos', dueno.token, conComercio(comercioId), {
      nombre: `Producto Estadisticas UI ${sufijoUnico()}`,
      precio: PRECIO,
      categoriaId,
    });
    expect(producto.status, JSON.stringify(producto.body)).toBe(201);
    const pedidos: number[] = [];
    for (let i = 0; i < cantidad; i += 1) {
      await apiConHeaders(request, 'DELETE', '/carrito', compradorToken);
      await agregarItemCarrito(request, compradorToken, producto.body.data.id as number, 1);
      pedidos.push(await crearPedido(request, compradorToken, 'RETIRO', null));
    }
    reemplazarHorarios(comercioId, horarios);
    return { comercioId, pedidos };
  }

  const estado = (pedidoId: number, nuevo: string): void => {
    sql(`UPDATE pedido SET estado = '${nuevo}' WHERE id = ${pedidoId};`);
  };

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

  async function estadisticasDe(request: APIRequestContext, token: string, comercioId: number, dias: number, agrupar: string) {
    const hasta = fechaA(0);
    const desde = fechaA(-(dias - 1));
    const respuesta = await apiConHeaders(request, 'GET', `/comercios/estadisticas?desde=${desde}&hasta=${hasta}&agrupar=${agrupar}`, token, conComercio(comercioId));
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    return respuesta.body.data;
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

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat Estadisticas UI ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    comprador = await registrarYVerificarCliente(request, localidadId);
    compradorToken = (await login(request, comprador.nombreUsuario, comprador.password)).token;

    conDatos = await escena(request, 5, semana([['12:00', '15:00'], ['20:00', '23:00']]));
    const [p0, p1, p2, p3, p4] = conDatos.pedidos;
    await confirmarPagoTest(request, p0, false, a(fechaA(-3), '13:00'));
    await confirmarPagoTest(request, p1, false, a(fechaA(-3), '13:30'));
    await confirmarPagoTest(request, p2, false, a(fechaA(-3), '21:00'));
    await confirmarPagoTest(request, p3, false, a(fechaA(-1), '18:00'));
    await confirmarPagoTest(request, p4, false, a(fechaA(0), '13:00'));
    sql(`UPDATE pedido SET turno_fecha = NULL, turno_horario_id = NULL WHERE id = ${p3};`);
    estado(p0, 'ENTREGADO');
    estado(p1, 'RECHAZADO');
    estado(p2, 'ENTREGADO');
    estado(p3, 'EN_PREPARACION');
    estado(p4, 'EN_PREPARACION');

    cruce = await escena(request, 1, semana([['20:00', '02:00']]));
    await confirmarPagoTest(request, cruce.pedidos[0], false, a(fechaA(-2), '01:00'));
    estado(cruce.pedidos[0], 'ENTREGADO');

    sinPedidos = await escena(request, 0, semana([['12:00', '15:00']]));

    soloAntiguos = await escena(request, 1, semana([['12:00', '15:00']]));
    await confirmarPagoTest(request, soloAntiguos.pedidos[0], false, a(fechaA(-20), '13:00'));
    estado(soloAntiguos.pedidos[0], 'ENTREGADO');

    empleado = await registrarYVerificarCliente(request, localidadId);
    await sumarAlEquipo(request, conDatos.comercioId, empleado, dueno.token);
  });

  test('el Dueño ve "Ver estadísticas" bajo la barra de métricas del panel y entra con un clic', async ({ page, request }) => {
    const errores = erroresDeConsola(page);
    await abrirComoDueno(page, request, conDatos.comercioId);

    await page.goto('/comercio-dashboard.html');

    await expect(page.getByTestId('metrica-vendido')).toBeVisible();
    const enlace = page.getByTestId('btn-estadisticas');
    await expect(enlace).toHaveText('Ver estadísticas');
    const cajaEnlace = (await enlace.boundingBox())!;
    const cajaMetricas = (await page.getByTestId('metricas-dashboard').boundingBox())!;
    expect(cajaEnlace.y).toBeGreaterThanOrEqual(cajaMetricas.y + cajaMetricas.height - 1);
    expect(cajaEnlace.height).toBeGreaterThanOrEqual(44);

    await enlace.click();

    await expect(page).toHaveURL(/comercio-estadisticas\.html$/);
    await expect(page.getByTestId('estadisticas-vendido')).toBeVisible();
    expect(errores).toEqual([]);
  });

  test('el Empleado no ve el enlace, ni siquiera oculto en el DOM, y la pantalla lo devuelve al panel', async ({ page, request }) => {
    const sesion = await login(request, empleado.nombreUsuario, empleado.password);
    await abrirComoUsuarioConContexto(page, sesion, {
      contexto: { tipo: 'EMPLEADO', comercioId: conDatos.comercioId },
      ultimoContexto: `EMPLEADO:${conDatos.comercioId}`,
    });

    await page.goto('/comercio-dashboard.html');

    await expect(page.getByTestId('metrica-vendido')).toBeVisible();
    await expect(page.getByTestId('btn-estadisticas')).toHaveCount(0);
    expect(await page.content()).not.toContain('comercio-estadisticas.html');

    await page.goto('/comercio-estadisticas.html');

    await expect(page).toHaveURL(/comercio-dashboard\.html$/);
    await expect(page.getByTestId('estadisticas-vendido')).toHaveCount(0);
  });

  test('abre en 30 días y las cuatro cifras coinciden con la API', async ({ page, request }) => {
    const errores = erroresDeConsola(page);
    const sesion = await abrirComoDueno(page, request, conDatos.comercioId);
    const esperado = await estadisticasDe(request, sesion.token, conDatos.comercioId, 30, 'DIA');

    await page.goto('/comercio-estadisticas.html');

    await expect(page.getByTestId('estadisticas-rango-30')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('estadisticas-rango-7')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('estadisticas-vendido')).toHaveText(formatearPrecio(esperado.totales.vendido));
    await expect(page.getByTestId('estadisticas-comision')).toHaveText(formatearPrecio(esperado.totales.comision));
    await expect(page.getByTestId('estadisticas-neto')).toHaveText(formatearPrecio(esperado.totales.neto));
    await expect(page.getByTestId('estadisticas-ticket')).toHaveText(formatearPrecio(esperado.totales.ticketPromedio));
    expect(Number(esperado.totales.vendido)).toBe(PRECIO * 4);
    await expect(page.getByTestId('estadisticas-periodo')).toHaveText(`Del ${corta(fechaA(-29))} al ${corta(fechaA(0))}`);
    expect(errores).toEqual([]);
  });

  test('los resultados usan rótulos legibles y suman los pedidos del rango', async ({ page, request }) => {
    await abrirComoDueno(page, request, conDatos.comercioId);

    await page.goto('/comercio-estadisticas.html');

    const filas = page.getByTestId('estadisticas-resultado');
    await expect(filas).toHaveCount(7);
    await expect(page.getByTestId('estadisticas-resultados')).toContainText('Entregados');
    await expect(page.getByTestId('estadisticas-resultados')).toContainText('Sin respuesta');
    const cantidad = async (categoria: string) => Number((await page.locator(`[data-categoria="${categoria}"] .estadisticas-resultados__cantidad`).textContent()) ?? '0');
    expect(await cantidad('ENTREGADO')).toBe(2);
    expect(await cantidad('RECHAZADO')).toBe(1);
    expect(await cantidad('EN_CURSO')).toBe(2);
    expect(await cantidad('EXPIRADO')).toBe(0);
    const texto = (await page.getByTestId('estadisticas-resultados').textContent()) ?? '';
    expect(texto).not.toMatch(/_|PENDIENTE|CANCELADO_POR/);
  });

  test('el gráfico tiene una barra por día, con el eje en los extremos y cada barra como botón con fecha y monto', async ({ page, request }) => {
    await abrirComoDueno(page, request, conDatos.comercioId);

    await page.goto('/comercio-estadisticas.html');

    const barras = page.getByTestId('estadisticas-barra');
    await expect(barras).toHaveCount(30);
    await expect(page.getByTestId('estadisticas-eje-inicio')).toHaveText(corta(fechaA(-29)));
    await expect(page.getByTestId('estadisticas-eje-fin')).toHaveText(corta(fechaA(0)));
    const dia = page.locator(`[data-testid="estadisticas-barra"][data-fecha="${fechaA(-3)}"]`);
    await expect(dia).toHaveAttribute('aria-label', `${corta(fechaA(-3))}: ${formatearPrecio(PRECIO * 2)}`);
    await expect(dia).toHaveJSProperty('tagName', 'BUTTON');
    const vacio = page.locator(`[data-testid="estadisticas-barra"][data-fecha="${fechaA(-10)}"]`);
    await expect(vacio).toHaveAttribute('aria-label', `${corta(fechaA(-10))}: $0`);
    const alturas = await barras.evaluateAll((nodos) => nodos.map((nodo) => nodo.getBoundingClientRect().height));
    expect(Math.min(...alturas)).toBeGreaterThanOrEqual(120);
  });

  test('tocar una barra muestra el detalle del día con sus turnos, y tocarla otra vez lo oculta', async ({ page, request }) => {
    await abrirComoDueno(page, request, conDatos.comercioId);
    await page.goto('/comercio-estadisticas.html');
    await expect(page.getByTestId('estadisticas-detalle-pista')).toBeVisible();
    const dia = fechaA(-3);
    const barra = page.locator(`[data-testid="estadisticas-barra"][data-fecha="${dia}"]`);

    await barra.click();

    await expect(barra).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('estadisticas-detalle-fecha')).toHaveText(`${nombreDelDia(dia)} ${corta(dia)}`);
    await expect(page.getByTestId('estadisticas-detalle-vendido')).toHaveText(`Vendido ${formatearPrecio(PRECIO * 2)}`);
    await expect(page.getByTestId('estadisticas-detalle-pedidos')).toHaveText('3 pedidos');
    const turnos = page.getByTestId('estadisticas-turno');
    await expect(turnos).toHaveCount(2);
    await expect(turnos.nth(0)).toContainText('12:00 a 15:00');
    await expect(turnos.nth(0)).toContainText(`${formatearPrecio(PRECIO)} · 2 pedidos`);
    await expect(turnos.nth(1)).toContainText('20:00 a 23:00');
    await expect(turnos.nth(1)).toContainText(`${formatearPrecio(PRECIO)} · 1 pedido`);

    await barra.click();

    await expect(barra).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('estadisticas-detalle-pista')).toBeVisible();
  });

  test('un día con un pagado sin turno lo rotula "Sin turno asignado" y un día sin pedidos lo dice', async ({ page, request }) => {
    await abrirComoDueno(page, request, conDatos.comercioId);
    await page.goto('/comercio-estadisticas.html');

    await page.locator(`[data-testid="estadisticas-barra"][data-fecha="${fechaA(-1)}"]`).click();
    await expect(page.getByTestId('estadisticas-turno')).toHaveCount(1);
    await expect(page.getByTestId('estadisticas-turno')).toContainText('Sin turno asignado');

    await page.locator(`[data-testid="estadisticas-barra"][data-fecha="${fechaA(-10)}"]`).click();
    await expect(page.getByTestId('estadisticas-detalle-vacio')).toHaveText('No hubo pedidos este día.');
    await expect(page.getByTestId('estadisticas-turno')).toHaveCount(0);
  });

  test('un turno que cruza la medianoche se rotula "(día siguiente)" en el día en que abrió', async ({ page, request }) => {
    await abrirComoDueno(page, request, cruce.comercioId);
    await page.goto('/comercio-estadisticas.html');
    const apertura = fechaA(-3);

    await page.locator(`[data-testid="estadisticas-barra"][data-fecha="${apertura}"]`).click();

    await expect(page.getByTestId('estadisticas-detalle-fecha')).toHaveText(`${nombreDelDia(apertura)} ${corta(apertura)}`);
    await expect(page.getByTestId('estadisticas-turno')).toHaveText(/20:00 a 02:00 \(día siguiente\)/);
    await expect(page.locator(`[data-testid="estadisticas-barra"][data-fecha="${fechaA(-2)}"]`)).toHaveAttribute('aria-label', `${corta(fechaA(-2))}: $0`);
  });

  test('cambiar a 7 días dibuja siete barras y vuelve a 30 con las treinta', async ({ page, request }) => {
    await abrirComoDueno(page, request, conDatos.comercioId);
    await page.goto('/comercio-estadisticas.html');
    await expect(page.getByTestId('estadisticas-barra')).toHaveCount(30);

    await page.getByTestId('estadisticas-rango-7').click();

    await expect(page.getByTestId('estadisticas-rango-7')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('estadisticas-barra')).toHaveCount(7);
    await expect(page.getByTestId('estadisticas-eje-inicio')).toHaveText(corta(fechaA(-6)));
    await expect(page.getByTestId('estadisticas-periodo')).toHaveText(`Del ${corta(fechaA(-6))} al ${corta(fechaA(0))}`);
    await expect(page.getByTestId('estadisticas-vendido')).toHaveText(formatearPrecio(PRECIO * 4));

    await page.getByTestId('estadisticas-rango-30').click();

    await expect(page.getByTestId('estadisticas-barra')).toHaveCount(30);
  });

  test('sin pedidos en 7 días pero con pedidos en 30: cifras con guion, mensaje y botón que lleva a 30 días', async ({ page, request }) => {
    await abrirComoDueno(page, request, soloAntiguos.comercioId);
    await page.goto('/comercio-estadisticas.html');
    await expect(page.getByTestId('estadisticas-barra')).toHaveCount(30);
    await expect(page.getByTestId('estadisticas-vendido')).toHaveText(formatearPrecio(PRECIO));

    await page.getByTestId('estadisticas-rango-7').click();

    await expect(page.getByTestId('estadisticas-vacio-texto')).toHaveText('No hubo pedidos en los últimos 7 días.');
    for (const id of ['estadisticas-vendido', 'estadisticas-comision', 'estadisticas-neto', 'estadisticas-ticket']) {
      await expect(page.getByTestId(id)).toHaveText('–');
    }
    await expect(page.getByTestId('estadisticas-grafico')).toHaveCount(0);
    await expect(page.getByTestId('estadisticas-resultados')).toHaveCount(0);

    await page.getByTestId('estadisticas-ver-30').click();

    await expect(page.getByTestId('estadisticas-rango-30')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('estadisticas-barra')).toHaveCount(30);
    await expect(page.getByTestId('estadisticas-vendido')).toHaveText(formatearPrecio(PRECIO));
  });

  test('un comercio sin pedidos: solo el mensaje, sin botón, en 30 y en 7 días', async ({ page, request }) => {
    await abrirComoDueno(page, request, sinPedidos.comercioId);
    await page.goto('/comercio-estadisticas.html');

    await expect(page.getByTestId('estadisticas-vacio-texto')).toHaveText('No hubo pedidos en los últimos 30 días.');
    await expect(page.getByTestId('estadisticas-ver-30')).toHaveCount(0);
    await expect(page.getByTestId('estadisticas-vendido')).toHaveText('–');

    await page.getByTestId('estadisticas-rango-7').click();

    await expect(page.getByTestId('estadisticas-vacio-texto')).toHaveText('No hubo pedidos en los últimos 7 días.');
    await expect(page.getByTestId('estadisticas-ver-30')).toHaveCount(0);
    await expect(page.getByTestId('estadisticas-ticket')).toHaveText('–');
  });

  test('con el teclado: Tab llega a una barra, las flechas se mueven y Enter elige el día', async ({ page, request }) => {
    await abrirComoDueno(page, request, conDatos.comercioId);
    await page.goto('/comercio-estadisticas.html');
    const dia = fechaA(-3);
    const barras = page.getByTestId('estadisticas-barra');
    await expect(barras).toHaveCount(30);

    await barras.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(barras.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(barras.last()).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(barras.nth(28)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(barras.first()).toBeFocused();

    const objetivo = page.locator(`[data-testid="estadisticas-barra"][data-fecha="${dia}"]`);
    await objetivo.focus();
    await page.keyboard.press('Enter');

    await expect(objetivo).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('estadisticas-detalle-fecha')).toHaveText(`${nombreDelDia(dia)} ${corta(dia)}`);
    await page.keyboard.press('Space');
    await expect(objetivo).toHaveAttribute('aria-pressed', 'false');
  });

  test('si el servidor falla muestra el error con "Reintentar" y se recupera', async ({ page, request }) => {
    await abrirComoDueno(page, request, conDatos.comercioId);
    let fallando = true;
    await page.route('**/comercios/estadisticas**', (ruta) => {
      if (fallando) {
        return ruta.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ mensaje: 'No disponible', data: null }) });
      }
      return ruta.continue();
    });

    await page.goto('/comercio-estadisticas.html');

    await expect(page.getByTestId('estadisticas-error')).toContainText('No pudimos cargar las estadísticas');
    await expect(page.getByTestId('estadisticas-vendido')).toHaveCount(0);

    fallando = false;
    await page.getByTestId('estadisticas-reintentar').click();

    await expect(page.getByTestId('estadisticas-error')).toHaveCount(0);
    await expect(page.getByTestId('estadisticas-barra')).toHaveCount(30);
    await expect(page.getByTestId('estadisticas-vendido')).toHaveText(formatearPrecio(PRECIO * 4));
  });

  test('a 375 px con 30 días no hay scroll horizontal, no hay errores de consola y se registra el ancho de las barras', async ({ page, request }, info) => {
    const errores = erroresDeConsola(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await abrirComoDueno(page, request, conDatos.comercioId);

    await page.goto('/comercio-estadisticas.html');

    await expect(page.getByTestId('estadisticas-barra')).toHaveCount(30);
    await sinScrollHorizontal(page);
    const anchos = await page.getByTestId('estadisticas-barra').evaluateAll((nodos) => nodos.map((nodo) => nodo.getBoundingClientRect().width));
    const minimo = Math.min(...anchos);
    info.annotations.push({ type: 'ancho-barra-30-dias-375px', description: `${minimo.toFixed(2)} px` });
    expect(minimo).toBeGreaterThan(6);
    await page.getByTestId('estadisticas-rango-7').click();
    await expect(page.getByTestId('estadisticas-barra')).toHaveCount(7);
    await sinScrollHorizontal(page);
    const chips = await page.locator('.estadisticas-rango .chip').evaluateAll((nodos) => nodos.map((nodo) => nodo.getBoundingClientRect().height));
    expect(Math.min(...chips)).toBeGreaterThanOrEqual(44);
    expect(errores).toEqual([]);
  });
});
