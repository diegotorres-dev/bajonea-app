import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  agregarItemCarrito,
  apiPut,
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
import { abrirComoUsuario, loginUi, prepararAprobado } from './helpers/multicomercio';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

const MENSAJE_FALLA = 'Falla simulada de la prueba';

interface Caso {
  nombre: string;
  disparador: string;
  hoja: string;
  confirmar: string;
  seguro: string;
  variante: 'peligro' | 'primaria';
  patron: string;
  metodo: string;
  toastExito: string | null;
  conError: boolean;
  abrir: (page: Page, request: APIRequestContext) => Promise<void>;
  completar?: (page: Page) => Promise<void>;
  valoresEscritos?: (page: Page) => Promise<void>;
}

test.describe('Pulido P1a: comportamiento común de las hojas de decisión (T02, T03, T05, T07)', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  let dueno: Dueno;
  let productoId: number;
  let clienteSesion: SesionApi;
  let clienteCredenciales: { nombreUsuario: string; password: string };

  test.beforeAll(async ({ request }) => {
    const adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    const localidadId = await obtenerLocalidadRioGrande(request);
    const categoriaId = await crearCategoria(request, adminToken, `Cat Hojas ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminToken, localidadId, false);
    await marcarAptoVenta(request, dueno.comercioId);
    productoId = await crearProducto(request, dueno.token, { nombre: `Producto Hojas ${sufijoUnico()}`, precio: 10000, categoriaId });
    const cliente = await registrarYVerificarCliente(request, localidadId);
    clienteCredenciales = { nombreUsuario: cliente.nombreUsuario, password: cliente.password };
    clienteSesion = await login(request, cliente.nombreUsuario, cliente.password);
  });

  async function renovarSesionDelCliente(request: APIRequestContext) {
    clienteSesion = await login(request, clienteCredenciales.nombreUsuario, clienteCredenciales.password);
  }

  async function pedidoPagado(request: APIRequestContext): Promise<number> {
    await renovarSesionDelCliente(request);
    await agregarItemCarrito(request, clienteSesion.token, productoId, 1);
    const pedidoId = await crearPedido(request, clienteSesion.token, 'RETIRO');
    await confirmarPagoTest(request, pedidoId, true);
    return pedidoId;
  }

  async function entrarComoDueno(page: Page, pedidoId: number) {
    await loginUi(page, dueno.nombreUsuario, dueno.password);
    await page.waitForURL('**/comercio-dashboard.html');
    await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
  }

  const casos: Caso[] = [
    {
      nombre: 'vaciar el carrito (Cliente)',
      disparador: 'btn-vaciar-carrito',
      hoja: 'modal-vaciar-carrito',
      confirmar: 'btn-confirmar-vaciar-carrito',
      seguro: 'btn-cancelar-vaciar-carrito',
      variante: 'peligro',
      patron: '**/api/v1/carrito',
      metodo: 'DELETE',
      toastExito: 'Vaciaste el carrito',
      conError: true,
      abrir: async (page, request) => {
        await renovarSesionDelCliente(request);
        await agregarItemCarrito(request, clienteSesion.token, productoId, 1);
        await abrirComoUsuario(page, clienteSesion);
        await page.goto('/carrito.html');
      },
    },
    {
      nombre: 'cerrar sesión (Cliente)',
      disparador: 'btn-cerrar-sesion',
      hoja: 'modal-confirmar-logout',
      confirmar: 'btn-confirmar-logout',
      seguro: 'btn-cancelar-logout',
      variante: 'primaria',
      patron: '**/api/v1/auth/logout',
      metodo: 'POST',
      toastExito: null,
      conError: false,
      abrir: async (page, request) => {
        await renovarSesionDelCliente(request);
        await abrirComoUsuario(page, clienteSesion);
        await page.goto('/perfil.html');
        await expect(page.getByTestId('btn-cerrar-sesion')).toBeEnabled();
      },
    },
    {
      nombre: 'rechazar un pedido (Dueño)',
      disparador: 'btn-rechazar-pedido',
      hoja: 'modal-rechazar-pedido',
      confirmar: 'btn-confirmar-rechazo',
      seguro: 'btn-cancelar-rechazo',
      variante: 'peligro',
      patron: '**/api/v1/pedidos/comercio/*/rechazar',
      metodo: 'PUT',
      toastExito: 'Pedido rechazado',
      conError: true,
      abrir: async (page, request) => {
        await entrarComoDueno(page, await pedidoPagado(request));
      },
      completar: async (page) => {
        await page.getByTestId('select-motivo-rechazo').selectOption('SIN_STOCK');
        await page.getByTestId('input-comentario-rechazo').fill('Comentario escrito para el cliente');
      },
      valoresEscritos: async (page) => {
        await expect(page.getByTestId('select-motivo-rechazo')).toHaveValue('SIN_STOCK');
        await expect(page.getByTestId('input-comentario-rechazo')).toHaveValue('Comentario escrito para el cliente');
      },
    },
    {
      nombre: 'anular un pedido (Dueño)',
      disparador: 'btn-anular-pedido',
      hoja: 'modal-anular-pedido',
      confirmar: 'btn-confirmar-anulacion',
      seguro: 'btn-cancelar-anulacion',
      variante: 'peligro',
      patron: '**/api/v1/pedidos/comercio/*/anular',
      metodo: 'PUT',
      toastExito: 'Pedido anulado',
      conError: true,
      abrir: async (page, request) => {
        const pedidoId = await pedidoPagado(request);
        dueno.token = (await login(request, dueno.nombreUsuario, dueno.password)).token;
        expect((await apiPut(request, `/pedidos/comercio/${pedidoId}/aceptar`, {}, dueno.token)).status).toBe(200);
        await entrarComoDueno(page, pedidoId);
      },
      completar: async (page) => {
        await page.getByTestId('select-motivo-anulacion').selectOption('SIN_STOCK');
        await page.getByTestId('input-comentario-anulacion').fill('Se agotó un ingrediente');
      },
      valoresEscritos: async (page) => {
        await expect(page.getByTestId('select-motivo-anulacion')).toHaveValue('SIN_STOCK');
        await expect(page.getByTestId('input-comentario-anulacion')).toHaveValue('Se agotó un ingrediente');
      },
    },
  ];

  for (const caso of casos) {
    test.describe(caso.nombre, () => {
      async function abrirHoja(page: Page, request: APIRequestContext) {
        await caso.abrir(page, request);
        await page.getByTestId(caso.disparador).click();
        await expect(page.getByTestId(caso.hoja)).toBeVisible();
      }

      test('es un diálogo modal, con el foco en la acción segura, la acción con su clase y 12 px entre botones', async ({ page, request }) => {
        await abrirHoja(page, request);
        const dialogo = page.getByTestId(caso.hoja).getByRole('dialog');
        await expect(dialogo).toHaveAttribute('aria-modal', 'true');
        await expect(dialogo).toHaveAttribute('aria-labelledby', /.+/);
        await expect(page.getByTestId(caso.seguro)).toBeFocused();
        await expect(page.getByTestId(caso.confirmar)).toHaveClass(caso.variante === 'peligro' ? /btn-peligro/ : /btn-primary/);
        if (caso.variante === 'peligro') {
          await expect(page.getByTestId(caso.confirmar)).not.toHaveClass(/btn-primary/);
          const fondo = await page.getByTestId(caso.confirmar).evaluate((boton) => getComputedStyle(boton).backgroundColor);
          expect(fondo).toBe('rgb(217, 48, 37)');
        }
        const estilo = await page.getByTestId(caso.confirmar).evaluate((boton) => boton.getAttribute('style'));
        expect(estilo).toBeNull();
        const cajaConfirmar = (await page.getByTestId(caso.confirmar).boundingBox())!;
        const cajaSeguro = (await page.getByTestId(caso.seguro).boundingBox())!;
        expect(Math.round(cajaSeguro.y - (cajaConfirmar.y + cajaConfirmar.height))).toBe(12);
        await sinScrollHorizontal(page);
      });

      test('Escape, el fondo y el botón seguro cierran la hoja y el foco vuelve al botón que la abrió', async ({ page, request }) => {
        await abrirHoja(page, request);
        const disparador = page.getByTestId(caso.disparador);

        await page.keyboard.press('Escape');
        await expect(page.getByTestId(caso.hoja)).toHaveCount(0);
        await expect(disparador).toBeFocused();

        await disparador.click();
        await page.getByTestId(caso.hoja).click({ position: { x: 5, y: 5 } });
        await expect(page.getByTestId(caso.hoja)).toHaveCount(0);

        await disparador.click();
        await page.getByTestId(caso.seguro).click();
        await expect(page.getByTestId(caso.hoja)).toHaveCount(0);
        await expect(disparador).toBeFocused();
      });

      test('el foco queda atrapado dentro de la hoja con Tab y Shift+Tab', async ({ page, request }) => {
        await abrirHoja(page, request);
        const dentro = () => page.evaluate(() => Boolean(document.activeElement && document.activeElement.closest('[role="dialog"]')));
        for (let i = 0; i < 8; i += 1) {
          await page.keyboard.press('Tab');
          expect(await dentro()).toBe(true);
        }
        for (let i = 0; i < 8; i += 1) {
          await page.keyboard.press('Shift+Tab');
          expect(await dentro()).toBe(true);
        }
      });

      if (caso.conError) {
        test('mientras envía no se cierra; si falla, sigue abierta con el error adentro y lo escrito intacto', async ({ page, request }) => {
          await abrirHoja(page, request);
          if (caso.completar) {
            await caso.completar(page);
          }
          let liberar!: () => void;
          const puerta = new Promise<void>((resolver) => {
            liberar = resolver;
          });
          await page.route(caso.patron, async (ruta) => {
            if (ruta.request().method() !== caso.metodo) {
              await ruta.fallback();
              return;
            }
            await puerta;
            await ruta.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ mensaje: MENSAJE_FALLA, data: null }) });
          });

          await page.getByTestId(caso.confirmar).click();
          await expect(page.getByTestId(caso.confirmar)).toBeDisabled();
          await expect(page.getByTestId(caso.confirmar)).toHaveText(/…$/);
          await expect(page.getByTestId(caso.seguro)).toBeDisabled();
          await page.keyboard.press('Escape');
          await expect(page.getByTestId(caso.hoja)).toBeVisible();
          await page.getByTestId(caso.hoja).click({ position: { x: 5, y: 5 } });
          await expect(page.getByTestId(caso.hoja)).toBeVisible();

          liberar();
          await expect(page.getByTestId(caso.hoja)).toBeVisible();
          await expect(page.getByTestId(caso.hoja).getByRole('alert').filter({ hasText: MENSAJE_FALLA })).toBeVisible();
          await expect(page.getByTestId(caso.confirmar)).toBeEnabled();
          await expect(page.getByTestId(caso.seguro)).toBeEnabled();
          if (caso.valoresEscritos) {
            await caso.valoresEscritos(page);
          }
          await page.getByTestId(caso.seguro).click();
          await expect(page.getByTestId(caso.hoja)).toHaveCount(0);
        });
      }

      test('se cierra solo al terminar bien, con su aviso', async ({ page, request }) => {
        await abrirHoja(page, request);
        if (caso.completar) {
          await caso.completar(page);
        }
        await page.getByTestId(caso.confirmar).click();
        if (caso.toastExito) {
          await expect(page.getByRole('status').filter({ hasText: caso.toastExito })).toBeVisible();
          await expect(page.getByTestId(caso.hoja)).toHaveCount(0);
        } else {
          await page.waitForURL('**/login.html');
        }
      });
    });
  }
});
