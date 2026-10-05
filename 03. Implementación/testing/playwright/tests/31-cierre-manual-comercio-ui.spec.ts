import { test, expect } from '@playwright/test';
import type { APIRequestContext, Locator, Page, Request } from '@playwright/test';
import {
  agregarItemCarrito,
  apiConHeaders,
  apiPost,
  crearPedido,
  diaDeHoy,
  diaDistintoDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
  aTitleCase,
} from './helpers/backend';
import type { HorarioInput } from './helpers/backend';
import { abrirComoUsuario, agregarComercioApto, prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { abrirComoUsuarioConComercio, abrirPanel } from './helpers/selector';

const VIEWPORT = { width: 390, height: 844 };
const HEADER = 'X-Comercio-Id';
const MENSAJE_FUERA_DE_HORARIO = 'Solo podés abrir o cerrar dentro de tu horario';
const NOMBRE_DIA: Record<string, string> = {
  LUNES: 'lunes',
  MARTES: 'martes',
  MIERCOLES: 'miércoles',
  JUEVES: 'jueves',
  VIERNES: 'viernes',
  SABADO: 'sábado',
  DOMINGO: 'domingo',
};

const todoElDia = (diaSemana: string): HorarioInput => ({ diaSemana, horaApertura: '00:00', horaCierre: '23:59' });
const franjaDeManana = (): HorarioInput => ({ diaSemana: diaDistintoDeHoy(), horaApertura: '09:00', horaCierre: '18:00' });
const cabecera = (comercioId: number) => ({ [HEADER]: String(comercioId) });

let adminToken: string;
let localidadId: string;
let categoriaId: number;

async function cerrarPorApi(request: APIRequestContext, dueno: Dueno, comercioId: number) {
  const respuesta = await apiConHeaders(request, 'PUT', '/comercios/cerrar', dueno.token, cabecera(comercioId));
  expect(respuesta.status).toBe(200);
}

async function abrirPorApi(request: APIRequestContext, dueno: Dueno, comercioId: number) {
  const respuesta = await apiConHeaders(request, 'PUT', '/comercios/abrir', dueno.token, cabecera(comercioId));
  expect(respuesta.status).toBe(200);
}

async function miComercio(request: APIRequestContext, dueno: Dueno, comercioId: number) {
  const { body } = await apiConHeaders(request, 'GET', '/comercios/mis-comercios', dueno.token);
  return (body.data as any[]).find((comercio) => comercio.id === comercioId);
}

async function nombreDe(request: APIRequestContext, dueno: Dueno, comercioId: number): Promise<string> {
  return (await miComercio(request, dueno, comercioId)).nombre as string;
}

async function productoEn(request: APIRequestContext, dueno: Dueno, comercioId: number): Promise<number> {
  const respuesta = await apiConHeaders(request, 'POST', '/productos', dueno.token, cabecera(comercioId), {
    nombre: `Producto Cierre UI ${sufijoUnico()}`,
    precio: 1500,
    categoriaId,
  });
  expect(respuesta.status).toBe(201);
  return respuesta.body.data.id as number;
}

async function clienteLogueado(request: APIRequestContext) {
  const cliente = await registrarYVerificarCliente(request, localidadId);
  return login(request, cliente.nombreUsuario, cliente.password);
}

async function pedidoSinPagar(request: APIRequestContext, clienteToken: string, productoId: number): Promise<number> {
  await agregarItemCarrito(request, clienteToken, productoId, 1);
  return crearPedido(request, clienteToken, 'RETIRO');
}

async function duenoApto(request: APIRequestContext, horarios: HorarioInput[] = [todoElDia(diaDeHoy())]): Promise<Dueno> {
  return prepararAprobado(request, adminToken, localidadId, true, horarios);
}

async function abrirDashboard(page: Page, dueno: Dueno, comercioId = dueno.comercioId) {
  await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: comercioId });
  await page.goto('/comercio-dashboard.html');
  await expect(page.getByTestId('franja-comercio')).toBeVisible();
}

function registrarPeticiones(page: Page, metodo: string, finalDeUrl: string): Request[] {
  const peticiones: Request[] = [];
  page.on('request', (peticion) => {
    if (peticion.method() === metodo && peticion.url().endsWith(finalDeUrl)) {
      peticiones.push(peticion);
    }
  });
  return peticiones;
}

async function retrasar(page: Page, patron: string, milisegundos: number) {
  await page.route(patron, async (ruta) => {
    await new Promise((resolver) => setTimeout(resolver, milisegundos));
    await ruta.continue();
  });
}

const topAbsoluto = (locator: Locator): Promise<number> =>
  locator.evaluate((elemento) => elemento.getBoundingClientRect().top + window.scrollY);

const tarjeta = (page: Page) => page.getByTestId('tarjeta-cierre-comercio');
const interruptor = (page: Page) => page.getByTestId('switch-cierre-comercio');

test.describe('Cierre manual del comercio (UI), tramo C1', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });
  test.use({ viewport: VIEWPORT });

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    const respuesta = await apiPost(request, '/categorias', { nombre: `Cat Cierre UI ${sufijoUnico()}` }, adminToken);
    expect(respuesta.status).toBe(201);
    categoriaId = respuesta.body.data.id as number;
  });

  test.describe('Switch del dashboard', () => {
    test('abierto: "Recibiendo pedidos", switch encendido y habilitado', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      await abrirDashboard(page, dueno);

      await expect(tarjeta(page)).toHaveAttribute('data-estado', 'ABIERTO');
      await expect(page.getByTestId('titulo-cierre-comercio')).toHaveText('Recibiendo pedidos');
      await expect(page.getByTestId('subtitulo-cierre-comercio')).toHaveText('Pausalo cuando quieras dentro de tu horario');
      await expect(interruptor(page)).toHaveAttribute('role', 'switch');
      await expect(interruptor(page)).toHaveAttribute('aria-checked', 'true');
      await expect(interruptor(page)).toBeEnabled();
    });

    test('cerrado a mano: "Pedidos pausados" con el texto de reapertura y switch apagado', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      await cerrarPorApi(request, dueno, dueno.comercioId);
      await abrirDashboard(page, dueno);

      await expect(tarjeta(page)).toHaveAttribute('data-estado', 'PAUSADO');
      await expect(page.getByTestId('titulo-cierre-comercio')).toHaveText('Pedidos pausados');
      await expect(page.getByTestId('subtitulo-cierre-comercio')).toHaveText(`Reabre el ${NOMBRE_DIA[diaDeHoy()]} a las 00:00`);
      await expect(interruptor(page)).toHaveAttribute('aria-checked', 'false');
      await expect(interruptor(page)).toBeEnabled();
    });

    test('fuera de horario: "Fuera de horario", switch apagado y bloqueado, tarjeta atenuada, un clic no llama al backend', async ({ page, request }) => {
      const dueno = await duenoApto(request, [franjaDeManana()]);
      const llamadas: string[] = [];
      page.on('request', (peticion) => {
        if (/\/comercios\/(cerrar|abrir)$/.test(peticion.url())) {
          llamadas.push(peticion.url());
        }
      });
      await abrirDashboard(page, dueno);

      await expect(tarjeta(page)).toHaveAttribute('data-estado', 'FUERA_DE_HORARIO');
      await expect(page.getByTestId('titulo-cierre-comercio')).toHaveText('Fuera de horario');
      await expect(page.getByTestId('subtitulo-cierre-comercio')).toHaveText('Podés pausar dentro de tu horario');
      await expect(interruptor(page)).toHaveAttribute('aria-checked', 'false');
      await expect(interruptor(page)).toBeDisabled();
      await expect(tarjeta(page)).toHaveClass(/cierre-card--bloqueado/);
      expect(await tarjeta(page).evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(1);

      await interruptor(page).click({ force: true });
      await expect(page.getByTestId('modal-cierre-comercio')).toHaveCount(0);
      expect(llamadas).toHaveLength(0);
    });

    test('mientras cargan los datos se ve un skeleton y nunca el valor "abierto" por defecto', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      await retrasar(page, '**/comercios/mis-comercios', 1500);
      await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: dueno.comercioId });
      await page.goto('/comercio-dashboard.html');

      await expect(page.getByTestId('tarjeta-cierre-comercio-cargando')).toBeVisible();
      await expect(page.getByTestId('franja-comercio-cargando')).toBeVisible();
      await expect(page.getByTestId('titulo-cierre-comercio')).toHaveCount(0);
      await expect(page.getByText('Recibiendo pedidos')).toHaveCount(0);

      await expect(tarjeta(page)).toHaveAttribute('data-estado', 'ABIERTO');
      await expect(page.getByTestId('tarjeta-cierre-comercio-cargando')).toHaveCount(0);
    });

    test('cerrar pide confirmación: Cancelar no llama al backend; Cerrar sí, y el estado persiste al recargar', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      const cierres = registrarPeticiones(page, 'PUT', '/comercios/cerrar');
      await abrirDashboard(page, dueno);

      await interruptor(page).click();
      const modal = page.getByTestId('modal-cierre-comercio');
      await expect(modal).toBeVisible();
      await expect(modal.getByRole('heading')).toHaveText('¿Dejar de recibir pedidos?');
      await expect(modal).toContainText('Los pedidos en curso siguen su camino.');
      await expect(page.getByTestId('btn-cancelar-cierre-comercio')).toHaveText('Cancelar');
      await expect(page.getByTestId('btn-confirmar-cierre-comercio')).toHaveText('Cerrar');

      await page.getByTestId('btn-cancelar-cierre-comercio').click();
      await expect(modal).toHaveCount(0);
      await expect(interruptor(page)).toHaveAttribute('aria-checked', 'true');
      await expect(interruptor(page)).toBeFocused();
      expect(cierres).toHaveLength(0);

      await interruptor(page).click();
      await page.getByTestId('btn-confirmar-cierre-comercio').click();
      await expect(modal).toHaveCount(0);
      await expect(interruptor(page)).toHaveAttribute('aria-checked', 'false');
      await expect(page.getByTestId('titulo-cierre-comercio')).toHaveText('Pedidos pausados');
      expect(cierres).toHaveLength(1);
      expect(await cierres[0].headerValue(HEADER)).toBe(String(dueno.comercioId));
      expect((await miComercio(request, dueno, dueno.comercioId)).cerradoManualmente).toBe(true);

      await page.reload();
      await expect(interruptor(page)).toHaveAttribute('aria-checked', 'false');
      await expect(page.getByTestId('titulo-cierre-comercio')).toHaveText('Pedidos pausados');
    });

    test('Escape y el fondo del modal también cancelan', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      const cierres = registrarPeticiones(page, 'PUT', '/comercios/cerrar');
      await abrirDashboard(page, dueno);

      await interruptor(page).click();
      await expect(page.getByTestId('modal-cierre-comercio')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('modal-cierre-comercio')).toHaveCount(0);

      await interruptor(page).click();
      await page.getByTestId('modal-cierre-comercio').click({ position: { x: 5, y: 5 } });
      await expect(page.getByTestId('modal-cierre-comercio')).toHaveCount(0);
      expect(cierres).toHaveLength(0);
      await expect(interruptor(page)).toHaveAttribute('aria-checked', 'true');
    });

    test('mientras se procesa el cierre el switch no admite doble clic', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      const cierres = registrarPeticiones(page, 'PUT', '/comercios/cerrar');
      await retrasar(page, '**/comercios/cerrar', 1200);
      await abrirDashboard(page, dueno);

      await interruptor(page).click();
      await page.getByTestId('btn-confirmar-cierre-comercio').click();
      await interruptor(page).click({ force: true });
      await interruptor(page).click({ force: true });
      await expect(page.getByTestId('modal-cierre-comercio')).toHaveCount(0);

      await expect(interruptor(page)).toHaveAttribute('aria-checked', 'false');
      expect(cierres).toHaveLength(1);
    });

    test('abrir es directo, sin confirmación', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      await cerrarPorApi(request, dueno, dueno.comercioId);
      const aperturas = registrarPeticiones(page, 'PUT', '/comercios/abrir');
      await abrirDashboard(page, dueno);
      await expect(interruptor(page)).toHaveAttribute('aria-checked', 'false');

      await interruptor(page).click();
      await expect(page.getByTestId('modal-cierre-comercio')).toHaveCount(0);

      await expect(interruptor(page)).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('titulo-cierre-comercio')).toHaveText('Recibiendo pedidos');
      expect(aperturas).toHaveLength(1);
      expect((await miComercio(request, dueno, dueno.comercioId)).cerradoManualmente).toBe(false);
    });

    test('un 409 del backend se informa con un mensaje corto y el switch queda como estaba', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      await cerrarPorApi(request, dueno, dueno.comercioId);
      await page.route('**/comercios/abrir', (ruta) =>
        ruta.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ mensaje: MENSAJE_FUERA_DE_HORARIO, data: null }) }),
      );
      await abrirDashboard(page, dueno);

      await interruptor(page).click();

      await expect(page.locator('.toast')).toContainText(MENSAJE_FUERA_DE_HORARIO);
      await expect(interruptor(page)).toHaveAttribute('aria-checked', 'false');
      await expect(interruptor(page)).toBeEnabled();
    });

    test('un error de red al cerrar muestra el mensaje genérico y no redirige a la pantalla de error', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      await page.route('**/comercios/cerrar', (ruta) => ruta.abort('failed'));
      await abrirDashboard(page, dueno);

      await interruptor(page).click();
      await page.getByTestId('btn-confirmar-cierre-comercio').click();

      await expect(page.locator('.toast')).toContainText('No pudimos actualizar el estado. Probá de nuevo.');
      await expect(page).toHaveURL(/comercio-dashboard\.html/);
      await expect(interruptor(page)).toHaveAttribute('aria-checked', 'true');
    });
  });

  test.describe('Chip "Cerrado" en la franja y en el panel', () => {
    test('solo el comercio APTO_VENTA cerrado muestra chip y subtítulo; el abierto y el APROBADO sin Mercado Pago no', async ({ page, request }) => {
      const dueno = await prepararAprobado(request, adminToken, localidadId, false);
      const abierto = await agregarComercioApto(request, dueno, aTitleCase(`Abierto Chip ${sufijoUnico().slice(-6)}`));
      const cerrado = await agregarComercioApto(request, dueno, aTitleCase(`Cerrado Chip ${sufijoUnico().slice(-6)}`));
      await cerrarPorApi(request, dueno, cerrado);
      await cerrarPorApi(request, dueno, dueno.comercioId);

      await abrirDashboard(page, dueno, abierto);
      await expect(page.getByTestId('franja-comercio-chip-cerrado')).toBeHidden();
      await abrirPanel(page);

      await expect(page.getByTestId(`chip-cerrado-comercio-${abierto}`)).toHaveCount(0);
      await expect(page.getByTestId(`fila-comercio-${abierto}`)).not.toContainText('Reabre');
      await expect(page.getByTestId(`chip-cerrado-comercio-${cerrado}`)).toHaveText('Cerrado');
      await expect(page.getByTestId(`subtitulo-comercio-${cerrado}`)).toHaveText(`Reabre el ${NOMBRE_DIA[diaDeHoy()]} a las 00:00`);
      await expect(page.getByTestId(`chip-cerrado-comercio-${dueno.comercioId}`)).toHaveCount(0);
      await expect(page.getByTestId(`fila-comercio-${dueno.comercioId}`)).not.toContainText('Reabre');
    });

    test('con el comercio activo cerrado la franja muestra solo el chip, sin subtítulo', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      await cerrarPorApi(request, dueno, dueno.comercioId);
      await abrirDashboard(page, dueno);

      await expect(page.getByTestId('franja-comercio-chip-cerrado')).toBeVisible();
      await expect(page.getByTestId('franja-comercio-chip-cerrado')).toHaveText('Cerrado');
      await expect(page.getByTestId('franja-comercio')).not.toContainText('Reabre');
    });

    test('un comercio APROBADO sin Mercado Pago no muestra switch ni chip, aunque el backend lo tenga cerrado', async ({ page, request }) => {
      const dueno = await prepararAprobado(request, adminToken, localidadId, false);
      await cerrarPorApi(request, dueno, dueno.comercioId);
      await abrirDashboard(page, dueno);

      await expect(page.getByTestId('mensaje-estado-comercio')).toContainText('cerrado');
      await expect(tarjeta(page)).toHaveCount(0);
      await expect(page.getByTestId('tarjeta-cierre-comercio-cargando')).toHaveCount(0);
      await expect(page.getByTestId('franja-comercio-chip-cerrado')).toBeHidden();
      await abrirPanel(page);
      await expect(page.getByTestId(`chip-cerrado-comercio-${dueno.comercioId}`)).toHaveCount(0);
    });

    test('la reapertura automática se refleja en la franja y el switch sin recargar la página', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      await cerrarPorApi(request, dueno, dueno.comercioId);
      await abrirDashboard(page, dueno);
      await expect(page.getByTestId('franja-comercio-chip-cerrado')).toBeVisible();
      await expect(interruptor(page)).toHaveAttribute('aria-checked', 'false');
      const marca = await page.evaluate(() => {
        (window as any).__sinRecargar = true;
        return true;
      });
      expect(marca).toBe(true);

      const cierre = sql(
        `SELECT DATE_FORMAT(fecha_hora, '%Y-%m-%d %H:%i:%s') FROM historial_cierre_comercio WHERE comercio_id = ${dueno.comercioId} AND accion = 'CERRADO' ORDER BY id DESC LIMIT 1;`,
      );
      const corrida = sql(`SELECT DATE_FORMAT(DATE_ADD('${cierre}', INTERVAL 9 DAY), '%Y-%m-%dT%H:%i:%s');`);
      const job = await apiPost(request, `/test/jobs/reapertura-comercios?ahora=${encodeURIComponent(corrida)}`, {});
      expect(job.status).toBe(200);
      expect((await miComercio(request, dueno, dueno.comercioId)).cerradoManualmente).toBe(false);

      await expect(page.getByTestId('titulo-cierre-comercio')).toHaveText('Recibiendo pedidos', { timeout: 30_000 });
      await expect(interruptor(page)).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('franja-comercio-chip-cerrado')).toBeHidden();
      expect(await page.evaluate(() => (window as any).__sinRecargar)).toBe(true);
    });
  });

  test.describe('Catálogo del Cliente', () => {
    let abierto: Dueno;
    let cerradoHorario: Dueno;
    let cerradoTemporal: Dueno;

    test.beforeAll(async ({ request }) => {
      abierto = await duenoApto(request);
      cerradoHorario = await duenoApto(request, [franjaDeManana()]);
      cerradoTemporal = await duenoApto(request);
      await cerrarPorApi(request, cerradoTemporal, cerradoTemporal.comercioId);
    });

    test('los comercios cerrados se ven atenuados con la etiqueta abajo de todo; el abierto, sin atenuar y con "Abierto"', async ({ page }) => {
      await page.goto('/index.html');
      await expect(page.getByTestId(`comercio-card-${abierto.comercioId}`)).toBeVisible();

      const cardAbierto = page.getByTestId(`comercio-card-${abierto.comercioId}`);
      await expect(cardAbierto).not.toHaveClass(/comercio-card--cerrado/);
      await expect(cardAbierto.getByTestId('estado-comercio')).toHaveText('Abierto');

      const casos = [
        { dueno: cerradoHorario, etiqueta: 'Cerrado', apertura: 'CERRADO_HORARIO' },
        { dueno: cerradoTemporal, etiqueta: 'Cerrado temporalmente', apertura: 'CERRADO_TEMPORALMENTE' },
      ];
      const opacidades: number[] = [];
      for (const caso of casos) {
        const card = page.getByTestId(`comercio-card-${caso.dueno.comercioId}`);
        await expect(card).toHaveClass(/comercio-card--cerrado/);
        await expect(card).toHaveAttribute('data-apertura', caso.apertura);
        await expect(card.getByTestId('estado-comercio')).toHaveText(caso.etiqueta);
        await expect(card.getByTestId('estado-comercio')).toHaveCount(1);

        const orden = await card.evaluate((el) => {
          const cuerpo = el.querySelector('.comercio-card__body')!;
          const hijos = Array.from(cuerpo.children).map((hijo) => hijo.className.split(' ')[0]);
          const ultimo = cuerpo.lastElementChild!;
          return { hijos, etiquetaEsUltima: ultimo.querySelector('[data-testid="estado-comercio"]') !== null };
        });
        expect(orden.etiquetaEsUltima).toBe(true);
        expect(orden.hijos).toEqual(['comercio-card__top', 'comercio-card__meta', 'pill-row', 'comercio-card__cierre']);
        opacidades.push(await card.locator('.comercio-card__avatar').evaluate((el) => Number(getComputedStyle(el).opacity)));
      }
      expect(opacidades[0]).toBeLessThan(1);
      expect(opacidades[0]).toBe(opacidades[1]);
      expect(await cardAbierto.locator('.comercio-card__avatar').evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);
    });

    test('los abiertos van antes que los cerrados, y el filtro "Abierto ahora" deja solo los abiertos', async ({ page }) => {
      await page.goto('/index.html');
      await expect(page.getByTestId(`comercio-card-${abierto.comercioId}`)).toBeVisible();

      const ids = await page.locator('[data-testid^="comercio-card-"]').evaluateAll((nodos) =>
        nodos.map((nodo) => Number((nodo.getAttribute('data-testid') || '').replace('comercio-card-', ''))),
      );
      const posicion = (id: number) => ids.indexOf(id);
      expect(posicion(abierto.comercioId)).toBeGreaterThanOrEqual(0);
      expect(posicion(abierto.comercioId)).toBeLessThan(posicion(cerradoHorario.comercioId));
      expect(posicion(abierto.comercioId)).toBeLessThan(posicion(cerradoTemporal.comercioId));

      await page.getByTestId('chip-filtro-abierto').click();
      await expect(page.getByTestId(`comercio-card-${abierto.comercioId}`)).toBeVisible();
      await expect(page.getByTestId(`comercio-card-${cerradoHorario.comercioId}`)).toHaveCount(0);
      await expect(page.getByTestId(`comercio-card-${cerradoTemporal.comercioId}`)).toHaveCount(0);

      await page.getByTestId('chip-filtro-todos').click();
      await expect(page.getByTestId(`comercio-card-${cerradoTemporal.comercioId}`)).toBeVisible();
    });

    test('el detalle muestra la misma etiqueta y el texto de reapertura', async ({ page }) => {
      await page.goto(`/comercio-detalle.html?id=${cerradoTemporal.comercioId}`);
      await expect(page.getByTestId('estado-comercio')).toHaveText('Cerrado temporalmente');
      await expect(page.getByTestId('texto-reapertura-comercio')).toHaveText(`Reabre el ${NOMBRE_DIA[diaDeHoy()]} a las 00:00`);

      await page.goto(`/comercio-detalle.html?id=${cerradoHorario.comercioId}`);
      await expect(page.getByTestId('estado-comercio')).toHaveText('Cerrado');
      await expect(page.getByTestId('texto-reapertura-comercio')).toHaveText('Reabre mañana a las 09:00');

      await page.goto(`/comercio-detalle.html?id=${abierto.comercioId}`);
      await expect(page.getByTestId('estado-comercio')).toHaveText('Abierto');
      await expect(page.getByTestId('texto-reapertura-comercio')).toHaveCount(0);
    });

    test('el modal de producto de un comercio cerrado temporalmente no ofrece agregar al carrito', async ({ page, request }) => {
      const productoId = await productoEn(request, cerradoTemporal, cerradoTemporal.comercioId);
      const sesion = await clienteLogueado(request);
      await abrirComoUsuario(page, sesion);
      await page.goto(`/comercio-detalle.html?id=${cerradoTemporal.comercioId}`);

      await page.getByTestId(`producto-item-${productoId}`).click();
      await expect(page.getByTestId('modal-detalle-producto')).toBeVisible();
      await expect(page.getByText('Este comercio está cerrado en este momento.')).toBeVisible();
      await expect(page.getByTestId('btn-agregar-carrito')).toHaveCount(0);
    });
  });

  test.describe('409 por cierre en el flujo del Cliente', () => {
    test('al agregar al carrito: banner de error y botón "Volver al catálogo"', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      const productoId = await productoEn(request, dueno, dueno.comercioId);
      const sesion = await clienteLogueado(request);
      await abrirComoUsuario(page, sesion);
      await page.goto(`/comercio-detalle.html?id=${dueno.comercioId}`);
      await page.getByTestId(`producto-item-${productoId}`).click();
      await expect(page.getByTestId('btn-agregar-carrito')).toBeVisible();

      await cerrarPorApi(request, dueno, dueno.comercioId);
      await page.getByTestId('btn-agregar-carrito').click();

      const banner = page.getByTestId('banner-cierre-comercio');
      await expect(banner).toBeVisible();
      await expect(banner).toHaveAttribute('role', 'alert');
      await expect(banner).toContainText('Este comercio está cerrado en este momento');
      await expect(page.getByTestId('btn-agregar-carrito')).toHaveCount(0);

      await page.getByTestId('btn-volver-al-catalogo').click();
      await expect(page).toHaveURL(/index\.html$/);
    });

    test('al confirmar el pedido: banner de error y botón "Volver al catálogo", sin crear el pedido', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      const productoId = await productoEn(request, dueno, dueno.comercioId);
      const sesion = await clienteLogueado(request);
      await agregarItemCarrito(request, sesion.token, productoId, 1);
      await abrirComoUsuario(page, sesion);
      await page.goto('/checkout.html');

      await page.getByTestId('btn-modalidad-retiro').click();
      await page.getByTestId('btn-continuar-modalidad').click();
      await page.getByTestId('btn-confirmar-retiro').click();
      await expect(page.getByTestId('btn-confirmar-pedido')).toBeVisible();

      await cerrarPorApi(request, dueno, dueno.comercioId);
      await page.getByTestId('btn-confirmar-pedido').click();

      const banner = page.getByTestId('banner-cierre-comercio');
      await expect(banner).toBeVisible();
      await expect(banner).toHaveAttribute('role', 'alert');
      await expect(banner).toContainText('Este comercio está cerrado en este momento');
      await expect(page.getByTestId('btn-volver-al-catalogo')).toBeVisible();
      await expect(page.getByTestId('btn-confirmar-pedido')).toBeDisabled();
      expect(sql(`SELECT COUNT(*) FROM pedido WHERE comercio_id = ${dueno.comercioId};`)).toBe('0');

      await page.getByTestId('btn-volver-al-catalogo').click();
      await expect(page).toHaveURL(/index\.html$/);
    });

    test('al abrir el checkout con el comercio ya cerrado se bloquea el paso con el mismo aviso', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      const productoId = await productoEn(request, dueno, dueno.comercioId);
      const sesion = await clienteLogueado(request);
      await agregarItemCarrito(request, sesion.token, productoId, 1);
      await cerrarPorApi(request, dueno, dueno.comercioId);
      await abrirComoUsuario(page, sesion);
      await page.goto('/checkout.html');

      await expect(page.getByTestId('banner-cierre-comercio')).toBeVisible();
      await expect(page.getByTestId('btn-continuar-modalidad')).toBeDisabled();
    });

    test('al abrir el checkout con el comercio cerrado el botón "Volver al catálogo" queda abajo, en el lugar de "Continuar", y "Continuar" no se ve', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      const productoId = await productoEn(request, dueno, dueno.comercioId);
      const sesion = await clienteLogueado(request);
      await agregarItemCarrito(request, sesion.token, productoId, 1);
      await cerrarPorApi(request, dueno, dueno.comercioId);
      await abrirComoUsuario(page, sesion);
      await page.goto('/checkout.html');

      const banner = page.getByTestId('banner-cierre-comercio');
      const volver = page.getByTestId('btn-volver-al-catalogo');
      await expect(banner).toBeVisible();
      await expect(volver).toBeVisible();
      await expect(page.getByTestId('btn-continuar-modalidad')).not.toBeVisible();
      await expect(page.locator('#step-1 h1')).toBeVisible();

      const topBanner = await topAbsoluto(banner);
      const topTitulo = await topAbsoluto(page.locator('#step-1 h1'));
      const topVolver = await topAbsoluto(volver);
      expect(topVolver).toBeGreaterThan(topBanner + (await banner.boundingBox())!.height);
      expect(topVolver).toBeGreaterThan(topTitulo + (await page.locator('#step-1 h1').boundingBox())!.height);
      expect(await page.locator('#step-1 > a').count()).toBe(1);
    });

    test('al confirmar con el comercio cerrado el botón "Volver al catálogo" reemplaza a "Ir a pagar" abajo del resumen', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      const productoId = await productoEn(request, dueno, dueno.comercioId);
      const sesion = await clienteLogueado(request);
      await agregarItemCarrito(request, sesion.token, productoId, 1);
      await abrirComoUsuario(page, sesion);
      await page.goto('/checkout.html');
      await page.getByTestId('btn-modalidad-retiro').click();
      await page.getByTestId('btn-continuar-modalidad').click();
      await page.getByTestId('btn-confirmar-retiro').click();
      await expect(page.getByTestId('btn-confirmar-pedido')).toBeVisible();

      await cerrarPorApi(request, dueno, dueno.comercioId);
      await page.getByTestId('btn-confirmar-pedido').click();

      const banner = page.getByTestId('banner-cierre-comercio');
      const volver = page.getByTestId('btn-volver-al-catalogo');
      await expect(banner).toBeVisible();
      await expect(volver).toBeVisible();
      await expect(page.getByTestId('btn-confirmar-pedido')).not.toBeVisible();
      await expect(page.getByTestId('total-carrito')).toBeVisible();

      const topBanner = await topAbsoluto(banner);
      const topTotal = await topAbsoluto(page.getByTestId('total-carrito'));
      const topVolver = await topAbsoluto(volver);
      expect(topVolver).toBeGreaterThan(topBanner + (await banner.boundingBox())!.height);
      expect(topVolver).toBeGreaterThan(topTotal);
    });

    test('en el modal de producto el aviso y "Volver al catálogo" quedan al pie, después del campo de nota', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      const productoId = await productoEn(request, dueno, dueno.comercioId);
      const sesion = await clienteLogueado(request);
      await abrirComoUsuario(page, sesion);
      await page.goto(`/comercio-detalle.html?id=${dueno.comercioId}`);
      await page.getByTestId(`producto-item-${productoId}`).click();
      await expect(page.getByTestId('btn-agregar-carrito')).toBeVisible();

      await cerrarPorApi(request, dueno, dueno.comercioId);
      await page.getByTestId('btn-agregar-carrito').click();

      const banner = page.getByTestId('banner-cierre-comercio');
      const volver = page.getByTestId('btn-volver-al-catalogo');
      await expect(banner).toBeVisible();
      await expect(volver).toBeVisible();
      const topNota = await topAbsoluto(page.getByTestId('input-nota-producto'));
      const topBanner = await topAbsoluto(banner);
      const topVolver = await topAbsoluto(volver);
      expect(topBanner).toBeGreaterThan(topNota);
      expect(topVolver).toBeGreaterThan(topBanner + (await banner.boundingBox())!.height);
      expect(await volver.evaluate((elemento) => elemento.classList.contains('btn-primary'))).toBe(true);
    });

    test('al abrir el carrito con el comercio cerrado no hay aviso proactivo', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      const productoId = await productoEn(request, dueno, dueno.comercioId);
      const sesion = await clienteLogueado(request);
      await agregarItemCarrito(request, sesion.token, productoId, 1);
      await cerrarPorApi(request, dueno, dueno.comercioId);
      await abrirComoUsuario(page, sesion);
      await page.goto('/carrito.html');

      await expect(page.getByTestId('tarjeta-comercio-carrito')).toBeVisible();
      await expect(page.getByTestId('banner-cierre-comercio')).toHaveCount(0);
      await expect(page.getByRole('alert')).toHaveCount(0);
    });
  });

  test.describe('Modal de bloqueo de la desvinculación de Mercado Pago', () => {
    async function conPedidoSinPagar(request: APIRequestContext, dueno: Dueno, comercioId: number) {
      const productoId = await productoEn(request, dueno, comercioId);
      const sesion = await clienteLogueado(request);
      return pedidoSinPagar(request, sesion.token, productoId);
    }

    async function abrirModalDesvincular(page: Page, dueno: Dueno) {
      await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: dueno.comercioId });
      await page.goto('/comercio-perfil.html');
      await expect(page.getByTestId('franja-comercio')).toBeVisible();
      await page.getByTestId('btn-ir-mercadopago').click();
      await page.getByTestId('btn-desvincular-mercadopago').click();
      await expect(page.getByTestId('modal-desvincular-mp')).toBeVisible();
      await expect(page.getByTestId('titulo-desvincular-mp')).toHaveText('No podés desvincular ahora');
    }

    const cierres = (page: Page) => registrarPeticiones(page, 'PUT', '/comercios/cerrar');

    test('variante 1 con un solo comercio abierto: línea de cierre en singular, "Cerrar comercio" y "Entendido"', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      await conPedidoSinPagar(request, dueno, dueno.comercioId);
      await abrirModalDesvincular(page, dueno);

      await expect(page.getByTestId('texto-cierre-desvincular-mp')).toHaveText('Cerrá el comercio para que no entren más pedidos mientras esperás.');
      await expect(page.getByTestId('btn-cerrar-comercios-desvincular-mp')).toHaveText('Cerrar comercio');
      await expect(page.getByTestId('btn-entendido-desvincular-mp')).toHaveText('Entendido');
      await expect(page.getByTestId('pie-bloqueo-desvincular-mp')).toContainText('Probá de nuevo alrededor de las');
    });

    test('variante 1 con varios comercios abiertos: "Cerrar comercios" cierra todos, sin confirmación, y el modal pasa a la variante 2', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      const segundo = await agregarComercioApto(request, dueno, aTitleCase(`Segundo Cierre ${sufijoUnico().slice(-6)}`));
      const tercero = await agregarComercioApto(request, dueno, aTitleCase(`Tercero Cierre ${sufijoUnico().slice(-6)}`));
      await conPedidoSinPagar(request, dueno, dueno.comercioId);
      const enviados = cierres(page);
      await abrirModalDesvincular(page, dueno);

      await expect(page.getByTestId('texto-cierre-desvincular-mp')).toHaveText('Cerrá los comercios para que no entren más pedidos mientras esperás.');
      await expect(page.getByTestId('btn-cerrar-comercios-desvincular-mp')).toHaveText('Cerrar comercios');
      await page.getByTestId('btn-cerrar-comercios-desvincular-mp').click();

      await expect(page.getByTestId('btn-cerrar-comercios-desvincular-mp')).toHaveCount(0);
      await expect(page.getByTestId('texto-cierre-desvincular-mp')).toHaveCount(0);
      await expect(page.getByTestId('error-cierre-desvincular-mp')).toHaveCount(0);
      await expect(page.getByTestId('btn-entendido-desvincular-mp')).toBeVisible();
      await expect(page.getByTestId('texto-bloqueo-desvincular-mp')).toBeVisible();
      await expect(page.getByTestId('modal-desvincular-mp')).toBeVisible();
      expect(enviados).toHaveLength(3);
      const ids = await Promise.all(enviados.map((peticion) => peticion.headerValue(HEADER)));
      expect(ids.sort()).toEqual([String(dueno.comercioId), String(segundo), String(tercero)].sort());

      for (const id of [dueno.comercioId, segundo, tercero]) {
        expect((await miComercio(request, dueno, id)).cerradoManualmente).toBe(true);
      }
    });

    test('variante 2 con todo cerrado (por horario o a mano): solo el texto de espera y "Entendido"', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      const fueraDeHorario = await agregarComercioApto(request, dueno, aTitleCase(`Fuera Horario ${sufijoUnico().slice(-6)}`), [franjaDeManana()]);
      await conPedidoSinPagar(request, dueno, dueno.comercioId);
      await cerrarPorApi(request, dueno, dueno.comercioId);
      await abrirModalDesvincular(page, dueno);

      await expect(page.getByTestId('texto-bloqueo-desvincular-mp')).toBeVisible();
      await expect(page.getByTestId('pie-bloqueo-desvincular-mp')).toBeVisible();
      await expect(page.getByTestId('texto-cierre-desvincular-mp')).toHaveCount(0);
      await expect(page.getByTestId('btn-cerrar-comercios-desvincular-mp')).toHaveCount(0);
      await expect(page.getByTestId('btn-entendido-desvincular-mp')).toBeVisible();
      expect((await miComercio(request, dueno, fueraDeHorario)).puedeCambiarCierre).toBe(false);

      await page.getByTestId('btn-entendido-desvincular-mp').click();
      await expect(page.getByTestId('modal-desvincular-mp')).toHaveCount(0);
    });

    test('un 409 de "fuera de horario" cuenta como éxito; una falla real informa "No se pudo cerrar: <nombre>"', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      const fuera = await agregarComercioApto(request, dueno, aTitleCase(`Fuera 409 ${sufijoUnico().slice(-6)}`));
      const roto = await agregarComercioApto(request, dueno, aTitleCase(`Roto 500 ${sufijoUnico().slice(-6)}`));
      await conPedidoSinPagar(request, dueno, dueno.comercioId);
      const nombreFuera = await nombreDe(request, dueno, fuera);
      const nombreRoto = await nombreDe(request, dueno, roto);

      await page.route('**/comercios/cerrar', async (ruta) => {
        const id = await ruta.request().headerValue(HEADER);
        if (id === String(fuera)) {
          await ruta.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ mensaje: MENSAJE_FUERA_DE_HORARIO, data: null }) });
        } else if (id === String(roto)) {
          await ruta.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Error interno', data: null }) });
        } else {
          await ruta.continue();
        }
      });
      await abrirModalDesvincular(page, dueno);
      await page.getByTestId('btn-cerrar-comercios-desvincular-mp').click();

      const error = page.getByTestId('error-cierre-desvincular-mp');
      await expect(error).toHaveText(`No se pudo cerrar: ${nombreRoto}`);
      await expect(error).not.toContainText(nombreFuera);
      await expect(page).toHaveURL(/comercio-perfil\.html/);
      await expect(page.getByTestId('btn-cerrar-comercios-desvincular-mp')).toBeVisible();
      expect((await miComercio(request, dueno, dueno.comercioId)).cerradoManualmente).toBe(true);
      expect((await miComercio(request, dueno, roto)).cerradoManualmente).toBe(false);
    });

    test('un error de red al cerrar se informa en el modal y se puede reintentar', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      await conPedidoSinPagar(request, dueno, dueno.comercioId);
      const nombre = await nombreDe(request, dueno, dueno.comercioId);
      let abortar = true;
      await page.route('**/comercios/cerrar', async (ruta) => {
        if (abortar) {
          await ruta.abort('failed');
        } else {
          await ruta.continue();
        }
      });
      await abrirModalDesvincular(page, dueno);
      await page.getByTestId('btn-cerrar-comercios-desvincular-mp').click();

      await expect(page.getByTestId('error-cierre-desvincular-mp')).toHaveText(`No se pudo cerrar: ${nombre}`);
      await expect(page).toHaveURL(/comercio-perfil\.html/);

      abortar = false;
      await page.getByTestId('btn-cerrar-comercios-desvincular-mp').click();
      await expect(page.getByTestId('btn-cerrar-comercios-desvincular-mp')).toHaveCount(0);
      await expect(page.getByTestId('error-cierre-desvincular-mp')).toHaveCount(0);
      expect((await miComercio(request, dueno, dueno.comercioId)).cerradoManualmente).toBe(true);
    });
  });
});
