import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import {
  agregarItemCarrito,
  apiConHeaders,
  apiPost,
  clonarComercioTest,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerCodigoTest,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { HorarioInput } from './helpers/backend';
import { abrirComoUsuario, prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';

const VIEWPORT = { width: 390, height: 844 };
const HEADER = 'X-Comercio-Id';
const MENSAJE_CERRADO = 'Este comercio está cerrado en este momento';

const todoElDia = (diaSemana: string): HorarioInput => ({ diaSemana, horaApertura: '00:00', horaCierre: '23:59' });

let adminToken: string;
let localidadId: string;
let categoriaId: number;

async function duenoApto(request: APIRequestContext): Promise<Dueno> {
  return prepararAprobado(request, adminToken, localidadId, true, [todoElDia(diaDeHoy())]);
}

async function productoEn(request: APIRequestContext, dueno: Dueno): Promise<number> {
  const respuesta = await apiConHeaders(request, 'POST', '/productos', dueno.token, { [HEADER]: String(dueno.comercioId) }, {
    nombre: `Producto Bloqueo UI ${sufijoUnico()}`,
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

async function bloquearPorApi(request: APIRequestContext, dueno: Dueno) {
  for (let intento = 1; intento <= 3; intento += 1) {
    const fallido = await apiPost(request, '/auth/login', { nombreUsuario: dueno.nombreUsuario, password: 'ClaveIncorrecta1' });
    expect(fallido.status, `intento ${intento}`).toBe(401);
  }
  expect(sql(`SELECT estado FROM comercio WHERE id = ${dueno.comercioId};`)).toBe('CERRADO_TEMPORALMENTE');
}

async function desbloquearPorApi(request: APIRequestContext, dueno: Dueno) {
  await apiPost(request, '/auth/recuperar-password', { email: dueno.email });
  const codigo = await obtenerCodigoTest(request, dueno.email, 'RECUPERACION_PASSWORD');
  const confirmar = await apiPost(request, '/auth/recuperar-password/confirmar', { email: dueno.email, codigo, nuevaPassword: 'Testing456' });
  expect(confirmar.status).toBe(200);
  expect(sql(`SELECT estado FROM comercio WHERE id = ${dueno.comercioId};`)).toBe('APTO_VENTA');
}

test.describe('Comercio bloqueado por la cuenta del Dueño (UI), tramo C2', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });
  test.use({ viewport: VIEWPORT });

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    const respuesta = await apiPost(request, '/categorias', { nombre: `Cat Bloqueo UI ${sufijoUnico()}` }, adminToken);
    expect(respuesta.status).toBe(201);
    categoriaId = respuesta.body.data.id as number;
  });

  test.describe('Catálogo y detalle', () => {
    let abierto: Dueno;
    let bloqueado: Dueno;
    let sinCobro: number;
    let productoBloqueado: number;

    test.beforeAll(async ({ request }) => {
      abierto = await duenoApto(request);
      bloqueado = await duenoApto(request);
      productoBloqueado = await productoEn(request, bloqueado);
      sinCobro = await clonarComercioTest(request, bloqueado.comercioId, `Sin cobro ${sufijoUnico()}`, 'APROBADO');
      await bloquearPorApi(request, bloqueado);
    });

    test('la tarjeta del comercio bloqueado va atenuada, con "Cerrado temporalmente" abajo de todo y después de los abiertos; el que no cobra no aparece', async ({ page }) => {
      await page.goto('/index.html');
      await expect(page.getByTestId(`comercio-card-${abierto.comercioId}`)).toBeVisible();

      const cardAbierto = page.getByTestId(`comercio-card-${abierto.comercioId}`);
      await expect(cardAbierto).not.toHaveClass(/comercio-card--cerrado/);
      await expect(cardAbierto.getByTestId('estado-comercio')).toHaveText('Abierto');

      const card = page.getByTestId(`comercio-card-${bloqueado.comercioId}`);
      await expect(card).toBeVisible();
      await expect(card).toHaveClass(/comercio-card--cerrado/);
      await expect(card).toHaveAttribute('data-apertura', 'CERRADO_TEMPORALMENTE');
      await expect(card.getByTestId('estado-comercio')).toHaveText('Cerrado temporalmente');
      await expect(card.getByTestId('estado-comercio')).toHaveCount(1);

      const orden = await card.evaluate((el) => {
        const cuerpo = el.querySelector('.comercio-card__body')!;
        const hijos = Array.from(cuerpo.children).map((hijo) => hijo.className.split(' ')[0]);
        const ultimo = cuerpo.lastElementChild!;
        return { hijos, etiquetaEsUltima: ultimo.querySelector('[data-testid="estado-comercio"]') !== null };
      });
      expect(orden.etiquetaEsUltima).toBe(true);
      expect(orden.hijos).toEqual(['comercio-card__top', 'comercio-card__meta', 'pill-row', 'comercio-card__cierre']);
      expect(await card.locator('.comercio-card__avatar').evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(1);

      const ids = await page.locator('[data-testid^="comercio-card-"]').evaluateAll((nodos) =>
        nodos.map((nodo) => Number((nodo.getAttribute('data-testid') || '').replace('comercio-card-', ''))),
      );
      expect(ids.indexOf(abierto.comercioId)).toBeLessThan(ids.indexOf(bloqueado.comercioId));
      await expect(page.getByTestId(`comercio-card-${sinCobro}`)).toHaveCount(0);
    });

    test('el filtro "Abierto ahora" oculta al comercio bloqueado y "Todos" lo vuelve a mostrar', async ({ page }) => {
      await page.goto('/index.html');
      await expect(page.getByTestId(`comercio-card-${bloqueado.comercioId}`)).toBeVisible();

      await page.getByTestId('chip-filtro-abierto').click();
      await expect(page.getByTestId(`comercio-card-${abierto.comercioId}`)).toBeVisible();
      await expect(page.getByTestId(`comercio-card-${bloqueado.comercioId}`)).toHaveCount(0);

      await page.getByTestId('chip-filtro-todos').click();
      await expect(page.getByTestId(`comercio-card-${bloqueado.comercioId}`)).toBeVisible();
    });

    test('el detalle del comercio bloqueado muestra "Cerrado temporalmente" y ningún texto de reapertura', async ({ page }) => {
      await page.goto(`/comercio-detalle.html?id=${bloqueado.comercioId}`);
      await expect(page.getByTestId('estado-comercio')).toHaveText('Cerrado temporalmente');
      await expect(page.getByTestId('texto-reapertura-comercio')).toHaveCount(0);

      await page.goto(`/comercio-detalle.html?id=${abierto.comercioId}`);
      await expect(page.getByTestId('estado-comercio')).toHaveText('Abierto');
    });

    test('el modal de producto del comercio bloqueado avisa que está cerrado y no ofrece agregar al carrito', async ({ page, request }) => {
      const sesion = await clienteLogueado(request);
      await abrirComoUsuario(page, sesion);
      await page.goto(`/comercio-detalle.html?id=${bloqueado.comercioId}`);

      await page.getByTestId(`producto-item-${productoBloqueado}`).click();
      await expect(page.getByTestId('modal-detalle-producto')).toBeVisible();
      await expect(page.getByText('Este comercio está cerrado en este momento.')).toBeVisible();
      await expect(page.getByTestId('btn-agregar-carrito')).toHaveCount(0);
    });

    test('al desbloquear la cuenta la tarjeta vuelve a mostrarse abierta y sin atenuar', async ({ page, request }) => {
      await desbloquearPorApi(request, bloqueado);

      await page.goto('/index.html');
      const card = page.getByTestId(`comercio-card-${bloqueado.comercioId}`);
      await expect(card).toBeVisible();
      await expect(card).not.toHaveClass(/comercio-card--cerrado/);
      await expect(card).toHaveAttribute('data-apertura', 'ABIERTO');
      await expect(card.getByTestId('estado-comercio')).toHaveText('Abierto');
      await expect(page.getByTestId(`comercio-card-${sinCobro}`)).toHaveCount(0);
    });
  });

  test.describe('409 por bloqueo en el flujo del Cliente', () => {
    test('al agregar al carrito: banner de error y botón "Volver al catálogo"', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      const productoId = await productoEn(request, dueno);
      const sesion = await clienteLogueado(request);
      await abrirComoUsuario(page, sesion);
      await page.goto(`/comercio-detalle.html?id=${dueno.comercioId}`);
      await page.getByTestId(`producto-item-${productoId}`).click();
      await expect(page.getByTestId('btn-agregar-carrito')).toBeVisible();

      await bloquearPorApi(request, dueno);
      await page.getByTestId('btn-agregar-carrito').click();

      const banner = page.getByTestId('banner-cierre-comercio');
      await expect(banner).toBeVisible();
      await expect(banner).toHaveAttribute('role', 'alert');
      await expect(banner).toContainText(MENSAJE_CERRADO);
      await expect(page.getByTestId('btn-agregar-carrito')).toHaveCount(0);

      await page.getByTestId('btn-volver-al-catalogo').click();
      await expect(page).toHaveURL(/index\.html$/);
    });

    test('al confirmar el pedido: banner de error y botón "Volver al catálogo", sin crear el pedido', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      const productoId = await productoEn(request, dueno);
      const sesion = await clienteLogueado(request);
      await agregarItemCarrito(request, sesion.token, productoId, 1);
      await abrirComoUsuario(page, sesion);
      await page.goto('/checkout.html');

      await page.getByTestId('btn-modalidad-retiro').click();
      await page.getByTestId('btn-continuar-modalidad').click();
      await page.getByTestId('btn-confirmar-retiro').click();
      await expect(page.getByTestId('btn-confirmar-pedido')).toBeVisible();

      await bloquearPorApi(request, dueno);
      await page.getByTestId('btn-confirmar-pedido').click();

      const banner = page.getByTestId('banner-cierre-comercio');
      await expect(banner).toBeVisible();
      await expect(banner).toHaveAttribute('role', 'alert');
      await expect(banner).toContainText(MENSAJE_CERRADO);
      await expect(page.getByTestId('btn-volver-al-catalogo')).toBeVisible();
      await expect(page.getByTestId('btn-confirmar-pedido')).toBeDisabled();
      expect(sql(`SELECT COUNT(*) FROM pedido WHERE comercio_id = ${dueno.comercioId};`)).toBe('0');

      await page.getByTestId('btn-volver-al-catalogo').click();
      await expect(page).toHaveURL(/index\.html$/);
    });

    test('al abrir el checkout con el comercio ya bloqueado se bloquea el paso con el mismo aviso', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      const productoId = await productoEn(request, dueno);
      const sesion = await clienteLogueado(request);
      await agregarItemCarrito(request, sesion.token, productoId, 1);
      await bloquearPorApi(request, dueno);
      await abrirComoUsuario(page, sesion);
      await page.goto('/checkout.html');

      await expect(page.getByTestId('banner-cierre-comercio')).toBeVisible();
      await expect(page.getByTestId('btn-continuar-modalidad')).toBeDisabled();
    });

    test('al abrir el carrito con el comercio bloqueado se ve la tarjeta del comercio y no hay aviso proactivo', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      const productoId = await productoEn(request, dueno);
      const sesion = await clienteLogueado(request);
      await agregarItemCarrito(request, sesion.token, productoId, 1);
      await bloquearPorApi(request, dueno);
      await abrirComoUsuario(page, sesion);
      await page.goto('/carrito.html');

      await expect(page.getByTestId('tarjeta-comercio-carrito')).toBeVisible();
      await expect(page.getByTestId('banner-cierre-comercio')).toHaveCount(0);
      await expect(page.getByRole('alert')).toHaveCount(0);
    });
  });
});
