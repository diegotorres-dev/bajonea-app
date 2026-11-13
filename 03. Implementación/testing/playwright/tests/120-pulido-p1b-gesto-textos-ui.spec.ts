import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  agregarItemCarrito,
  confirmarPagoTest,
  crearCategoria,
  crearPedido,
  crearProducto,
  fijarPasswordAdminYLoguear,
  login,
  marcarAptoVenta,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sufijoUnico,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { abrirComoUsuario, agregarComercioApto, prepararAprobado, registrarPendiente } from './helpers/multicomercio';
import { mantenerApretado } from './helpers/selector';

test.use({ viewport: { width: 375, height: 812 } });

async function interseca(page: Page, testidA: string, testidB: string): Promise<boolean> {
  const a = (await page.getByTestId(testidA).boundingBox())!;
  const b = (await page.getByTestId(testidB).boundingBox())!;
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

test.describe('Pulido P1b: gesto de "Tus comercios", textos del Cliente, saludo y botones de peligro (T15, T16, K05)', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  let adminSesion: SesionApi;
  let localidadId: string;
  let categoriaId: number;
  let dueno: Dueno;
  let duenoDoble: Dueno;
  let productoId: number;
  let clienteCredenciales: { nombreUsuario: string; password: string };

  test.beforeAll(async ({ request }) => {
    adminSesion = await fijarPasswordAdminYLoguear(request);
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminSesion.token, `Cat Gesto ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminSesion.token, localidadId, false);
    await marcarAptoVenta(request, dueno.comercioId);
    productoId = await crearProducto(request, dueno.token, { nombre: `Producto Gesto ${sufijoUnico()}`, precio: 10000, categoriaId });
    duenoDoble = await prepararAprobado(request, adminSesion.token, localidadId, false);
    await marcarAptoVenta(request, duenoDoble.comercioId);
    await agregarComercioApto(request, duenoDoble, `Segundo Gesto ${sufijoUnico().slice(-6)}`);
    const cliente = await registrarYVerificarCliente(request, localidadId);
    clienteCredenciales = { nombreUsuario: cliente.nombreUsuario, password: cliente.password };
  });

  async function sesionDelCliente(request: APIRequestContext): Promise<SesionApi> {
    return login(request, clienteCredenciales.nombreUsuario, clienteCredenciales.password);
  }

  async function pedidoDe(request: APIRequestContext, sesion: SesionApi, pagado: boolean): Promise<number> {
    await agregarItemCarrito(request, sesion.token, productoId, 1);
    const pedidoId = await crearPedido(request, sesion.token, 'RETIRO');
    if (pagado) {
      await confirmarPagoTest(request, pedidoId, true);
    }
    return pedidoId;
  }

  test.describe('pista del gesto de "Tus comercios" (T15)', () => {
    test('con 2 o más comercios aparece una vez, con "Entendido" de 44 px, sin tapar los botones de la barra', async ({ page }) => {
      await abrirComoUsuario(page, duenoDoble.sesion);
      await page.goto('/comercio-dashboard.html');
      const pista = page.getByTestId('pista-selector-comercios');
      await expect(pista).toBeVisible();
      await expect(pista).toHaveText(/Mantené apretado para ver tus comercios/);
      const entendido = page.getByTestId('btn-pista-selector-entendido');
      expect((await entendido.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      for (const boton of ['btn-nav-panel', 'btn-nav-productos', 'btn-nav-pedidos', 'btn-nav-perfil']) {
        expect(await interseca(page, 'pista-selector-comercios', boton)).toBe(false);
      }
      await entendido.click();
      await expect(pista).toHaveCount(0);
      await page.reload();
      await expect(page.getByTestId('btn-nav-perfil')).toBeVisible();
      await page.waitForTimeout(800);
      await expect(page.getByTestId('pista-selector-comercios')).toHaveCount(0);
    });

    test('no vuelve a aparecer en el segundo ingreso aunque no se haya tocado "Entendido"', async ({ page }) => {
      await abrirComoUsuario(page, duenoDoble.sesion);
      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId('pista-selector-comercios')).toBeVisible();
      await page.goto('/comercio-pedidos.html');
      await expect(page.getByTestId('btn-nav-perfil')).toBeVisible();
      await page.waitForTimeout(800);
      await expect(page.getByTestId('pista-selector-comercios')).toHaveCount(0);
    });

    test('con un solo comercio no aparece', async ({ page }) => {
      await abrirComoUsuario(page, dueno.sesion);
      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId('btn-nav-perfil')).toBeVisible();
      await expect(page.getByTestId('mensaje-saludo')).toHaveText(`Hola, ${dueno.sesion.usuario.nombre} 👋`);
      await page.waitForTimeout(800);
      await expect(page.getByTestId('pista-selector-comercios')).toHaveCount(0);
    });

    test('el menú contextual solo se bloquea con un puntero táctil, no con el mouse', async ({ page }) => {
      await abrirComoUsuario(page, duenoDoble.sesion);
      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId('btn-nav-perfil')).toBeVisible();
      const resultado = await page.getByTestId('btn-nav-perfil').evaluate(async (elemento) => {
        const disparar = () => {
          const evento = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
          elemento.dispatchEvent(evento);
          return evento.defaultPrevented;
        };
        const base = { bubbles: true, cancelable: true, pointerId: 3, isPrimary: true };
        elemento.dispatchEvent(new PointerEvent('pointerdown', { ...base, pointerType: 'mouse', buttons: 2 }));
        const conMouse = disparar();
        elemento.dispatchEvent(new PointerEvent('pointerup', { ...base, pointerType: 'mouse', buttons: 0 }));
        elemento.dispatchEvent(new PointerEvent('pointerdown', { ...base, pointerType: 'touch', buttons: 1 }));
        const conToque = disparar();
        elemento.dispatchEvent(new PointerEvent('pointerup', { ...base, pointerType: 'touch', buttons: 0 }));
        return { conMouse, conToque };
      });
      expect(resultado.conMouse).toBe(false);
      expect(resultado.conToque).toBe(true);
    });

    test('mantener apretado con un toque sigue abriendo "Tus comercios"', async ({ page }) => {
      await abrirComoUsuario(page, duenoDoble.sesion);
      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId('btn-nav-perfil')).toBeVisible();
      await mantenerApretado(page, 'btn-nav-perfil', 650);
      await expect(page.getByTestId('panel-comercios')).toBeVisible();
    });
  });

  test.describe('textos del estado del pedido para el Cliente (T16)', () => {
    test('un pedido esperando al comercio dice "Esperando al comercio" en la lista y en el detalle del Cliente, y "Pendiente" para el Dueño', async ({ page, request }) => {
      const sesion = await sesionDelCliente(request);
      const pedidoId = await pedidoDe(request, sesion, true);
      await abrirComoUsuario(page, sesion);
      await page.goto('/pedidos.html');
      await expect(page.getByTestId(`pedido-item-${pedidoId}`).getByTestId('estado-pedido')).toHaveText('Esperando al comercio');
      await page.goto(`/pedido-detalle.html?id=${pedidoId}`);
      await expect(page.getByTestId('cabecera-estado-pedido').locator('h1')).toHaveText('Esperando al comercio');

      const paginaDueno = await page.context().newPage();
      await abrirComoUsuario(paginaDueno, dueno.sesion);
      await paginaDueno.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
      await expect(paginaDueno.getByTestId('cabecera-estado-pedido').locator('h1')).toHaveText('Pendiente');
    });

    test('un pedido sin pagar dice que todavía no se pagó y ya no manda a actualizar la pantalla', async ({ page, request }) => {
      const sesion = await sesionDelCliente(request);
      const pedidoId = await pedidoDe(request, sesion, false);
      await abrirComoUsuario(page, sesion);
      await page.goto(`/pedido-detalle.html?id=${pedidoId}`);
      const texto = page.getByTestId('estado-pedido');
      await expect(texto).toHaveText('Todavía no pagaste este pedido.');
      await expect(page.locator('body')).not.toContainText('actualizá esta pantalla');
    });

    test('al volver de Mercado Pago con el pago en confirmación avisa que se actualiza sola', async ({ page, request }) => {
      const sesion = await sesionDelCliente(request);
      const pedidoId = await pedidoDe(request, sesion, false);
      await abrirComoUsuario(page, sesion);
      const lista = await request.get(`${process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1'}/pedidos/cliente`, {
        headers: { Authorization: `Bearer ${sesion.token}` },
      });
      const cuerpo = await lista.json();
      const pedido = (cuerpo.data as Array<{ id: number }>).find((p) => p.id === pedidoId);
      const respuestaSincronizada = JSON.stringify({ mensaje: 'ok', data: { ...pedido, estado: 'PENDIENTE_PAGO', pagoEstado: 'PENDIENTE' } });
      await page.route('**/pago/sincronizar', (ruta) => ruta.fulfill({ status: 200, contentType: 'application/json', body: respuestaSincronizada }));
      await page.goto(`/pedido-detalle.html?id=${pedidoId}&pago=pendiente`);
      await expect(page.getByTestId('estado-pedido')).toHaveText('Estamos confirmando tu pago. Esta pantalla se actualiza sola.');
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    });

    test('un pago rechazado dice que no se pudo procesar y que se puede intentar de nuevo', async ({ page, request }) => {
      const sesion = await sesionDelCliente(request);
      const pedidoId = await pedidoDe(request, sesion, false);
      await abrirComoUsuario(page, sesion);
      await page.route('**/api/v1/pedidos/cliente', async (ruta) => {
        const respuesta = await ruta.fetch();
        const cuerpo = await respuesta.json();
        cuerpo.data = (cuerpo.data as Array<{ id: number; pagoEstado: string }>).map((p) => (p.id === pedidoId ? { ...p, pagoEstado: 'RECHAZADO' } : p));
        await ruta.fulfill({ response: respuesta, body: JSON.stringify(cuerpo) });
      });
      await page.goto(`/pedido-detalle.html?id=${pedidoId}`);
      await expect(page.getByTestId('estado-pedido')).toHaveText('No pudimos procesar tu pago. Podés intentar de nuevo.');
    });
  });

  test('el panel del comercio saluda con el nombre de la persona y nunca con el del comercio (K05)', async ({ page }) => {
    await abrirComoUsuario(page, dueno.sesion);
    await page.goto('/comercio-dashboard.html');
    const saludo = page.getByTestId('mensaje-saludo');
    await expect(saludo).toHaveText(`Hola, ${dueno.sesion.usuario.nombre} 👋`);
    await expect(saludo).not.toContainText(dueno.nombre);
  });

  test.describe('botones secundarios de peligro sin estilos inline', () => {
    async function verificarContorno(page: Page, testid: string) {
      const boton = page.getByTestId(testid);
      await expect(boton).toBeVisible();
      await expect(boton).toHaveClass(/btn-peligro-contorno/);
      await expect(boton).not.toHaveAttribute('style', /color|border/);
      const estilo = await boton.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { color: cs.color, borde: cs.borderTopColor, fondo: cs.backgroundColor, alto: el.getBoundingClientRect().height };
      });
      expect(estilo.color).toBe(estilo.borde);
      expect(estilo.fondo).toBe('rgba(0, 0, 0, 0)');
      expect(estilo.alto).toBeGreaterThanOrEqual(44);
    }

    test('Rechazar pedido del Dueño', async ({ page, request }) => {
      const sesion = await sesionDelCliente(request);
      const pedidoId = await pedidoDe(request, sesion, true);
      await abrirComoUsuario(page, dueno.sesion);
      await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
      await verificarContorno(page, 'btn-rechazar-pedido');
    });

    test('Cancelar pedido del Cliente', async ({ page, request }) => {
      const sesion = await sesionDelCliente(request);
      const pedidoId = await pedidoDe(request, sesion, true);
      await abrirComoUsuario(page, sesion);
      await page.goto(`/pedido-detalle.html?id=${pedidoId}`);
      await verificarContorno(page, 'btn-cancelar-pedido');
    });

    test('Rechazar comercio del Administrador', async ({ page, request }) => {
      const pendiente = await registrarPendiente(request, adminSesion.token, localidadId);
      await abrirComoUsuario(page, adminSesion);
      await page.goto(`/admin-comercio-detalle.html?id=${pendiente.comercioId}`);
      await verificarContorno(page, 'btn-rechazar-comercio');
    });
  });
});
