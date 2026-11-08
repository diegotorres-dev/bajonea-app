import path from 'node:path';
import { readFileSync } from 'node:fs';
import { test, expect } from './helpers/prueba';
import type { Page, Route } from '@playwright/test';
import {
  agregarItemCarrito,
  esperarImagenCargadaEnRecorte,
  nombreArchivoFixture,
  registrarYVerificarCliente,
  login,
} from './helpers/backend';
import { abrirComoUsuario, loginUi } from './helpers/multicomercio';
import { abrirComoUsuarioConComercio } from './helpers/selector';
import { nuevoCliente, prepararEscenario } from './helpers/reclamos';
import type { Escenario } from './helpers/reclamos';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

const FIXTURE_PNG = path.resolve(__dirname, '../fixtures/bajonea-e2e-producto.png');
const FIXTURE_PDF = path.resolve(__dirname, '../fixtures/documento-prueba.pdf');
const TEXTO_TITULO = 'Se cortó la conexión.';
const RESPUESTA_503 = { status: 503, contentType: 'application/json', body: JSON.stringify({ mensaje: 'caído', data: null }) };

interface Escenaria {
  nombre: string;
  destino: string;
  href: string | null;
  metodoRuta: RegExp;
  esperaMs: number;
  propioDeReintentar: boolean;
  preparar: (page: Page) => Promise<void>;
  enviar: (page: Page) => Promise<void>;
  conservado: (page: Page) => Promise<void>;
}

function bloquear(page: Page, patron: RegExp, respuesta: (ruta: Route) => Promise<void> | void) {
  return page.route(patron, async (ruta) => {
    if (ruta.request().method() === 'POST') {
      await respuesta(ruta);
      return;
    }
    await ruta.continue();
  });
}

test.describe('Pulido 2A: reintentos que no duplican', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let esc: Escenario;

  test.beforeAll(async ({ request }) => {
    esc = await prepararEscenario(request);
  });

  async function escenarioCheckout(page: Page, request: Parameters<typeof agregarItemCarrito>[0]) {
    const cliente = await nuevoCliente(request, esc.localidadId);
    await agregarItemCarrito(request, cliente.sesion.token, esc.productoId, 1);
    await abrirComoUsuario(page, cliente.sesion);
  }

  const escenarias: Escenaria[] = [
    {
      nombre: 'crear pedido',
      destino: 'Mis pedidos',
      href: 'pedidos.html',
      metodoRuta: /\/api\/v1\/pedidos\/cliente$/,
      esperaMs: 15_000,
      propioDeReintentar: true,
      preparar: async (page) => {
        await page.goto('/carrito.html');
        await page.getByTestId('btn-confirmar-pedido').click();
        await page.waitForURL('**/checkout.html');
        await page.getByTestId('btn-modalidad-retiro').click();
        await page.getByTestId('btn-continuar-modalidad').click();
        await page.getByTestId('btn-confirmar-retiro').click();
        await expect(page.getByTestId('btn-confirmar-pedido')).toBeVisible();
      },
      enviar: async (page) => {
        await page.getByTestId('btn-confirmar-pedido').click();
      },
      conservado: async (page) => {
        expect(new URL(page.url()).pathname).toContain('checkout.html');
        await expect(page.getByTestId('btn-confirmar-pedido')).toBeEnabled();
      },
    },
    {
      nombre: 'crear producto',
      destino: 'Productos',
      href: 'comercio-productos.html',
      metodoRuta: /\/api\/v1\/productos$/,
      esperaMs: 15_000,
      propioDeReintentar: true,
      preparar: async (page) => {
        await page.goto('/comercio-producto-form.html');
        await expect(page.getByTestId('select-categoria-producto').locator(`option[value="${esc.categoriaId}"]`)).toHaveCount(1);
        await page.getByTestId('input-nombre-producto').fill('Producto Sin Duplicar');
        await page.getByTestId('input-precio-producto').fill('1500');
        await page.getByTestId('select-categoria-producto').selectOption(String(esc.categoriaId));
        await page.getByTestId('input-foto-producto').setInputFiles({
          name: nombreArchivoFixture(),
          mimeType: 'image/png',
          buffer: readFileSync(FIXTURE_PNG),
        });
        await esperarImagenCargadaEnRecorte(page);
        await page.getByTestId('btn-confirmar-recorte').click();
        await expect(page.getByTestId('modal-recorte-imagen')).toHaveCount(0);
        await expect(page.getByTestId('galeria-fotos-producto').locator('img')).toHaveCount(1);
      },
      enviar: async (page) => {
        await page.getByTestId('btn-guardar-producto').click();
      },
      conservado: async (page) => {
        await expect(page.getByTestId('input-nombre-producto')).toHaveValue('Producto Sin Duplicar');
        await expect(page.getByTestId('input-precio-producto')).toHaveValue('1.500');
        await expect(page.getByTestId('galeria-fotos-producto').locator('img')).toHaveCount(1);
        await expect(page.getByTestId('btn-guardar-producto')).toBeEnabled();
      },
    },
    {
      nombre: 'cargar documento',
      destino: 'Documentación',
      href: 'comercio-documentacion.html',
      metodoRuta: /\/api\/v1\/comercios\/documentos$/,
      esperaMs: 180_000,
      propioDeReintentar: false,
      preparar: async (page) => {
        await page.goto('/comercio-documentacion.html');
        await page.getByTestId('btn-subir-documento').click();
        await page.getByTestId('select-documento-tipo').selectOption('LIBRETA_SANITARIA');
        await page.getByTestId('input-documento-archivo').setInputFiles(FIXTURE_PDF);
      },
      enviar: async (page) => {
        await page.getByTestId('btn-subir-documento-confirmar').click();
      },
      conservado: async (page) => {
        await expect(page.getByTestId('hoja-subir-documento')).toBeVisible();
        await expect(page.getByTestId('select-documento-tipo')).toHaveValue('LIBRETA_SANITARIA');
        await expect(page.getByTestId('btn-subir-documento-confirmar')).toBeEnabled();
      },
    },
  ];

  for (const escenaria of escenarias) {
    test.describe(escenaria.nombre, () => {
      async function abrir(page: Page, request: Parameters<typeof agregarItemCarrito>[0]) {
        if (escenaria.nombre === 'crear pedido') {
          await escenarioCheckout(page, request);
        } else {
          await abrirComoUsuarioConComercio(page, esc.dueno.sesion, { comercioActivoId: esc.dueno.comercioId });
        }
        await escenaria.preparar(page);
      }

      test('un timeout no ofrece "Reintentar": avisa, enlaza al destino y conserva lo escrito', async ({ page, request }) => {
        await page.clock.install();
        await abrir(page, request);
        await bloquear(page, escenaria.metodoRuta, () => undefined);
        await escenaria.enviar(page);
        await page.clock.fastForward(escenaria.esperaMs);

        const aviso = page.getByTestId('aviso-timeout');
        await expect(aviso).toBeVisible();
        await expect(aviso).toHaveAttribute('role', 'alert');
        await expect(page.getByTestId('aviso-timeout-titulo')).toHaveText(TEXTO_TITULO);
        await expect(page.getByTestId('aviso-timeout-texto')).toHaveText(`Puede que ya se haya enviado: revisá ${escenaria.destino} antes de volver a enviar.`);
        const enlace = page.getByTestId('aviso-timeout-enlace');
        await expect(enlace).toHaveAttribute('href', escenaria.href as string);
        await expect(enlace).toHaveAttribute('target', '_blank');
        await expect(enlace).toHaveAttribute('rel', 'noopener');
        await expect(page.getByTestId('aviso-red')).toHaveCount(0);
        await expect(page.getByTestId('btn-reintentar-red')).toHaveCount(0);
        const cerrar = page.getByTestId('btn-cerrar-aviso-timeout');
        expect((await cerrar.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await escenaria.conservado(page);
        await sinScrollHorizontal(page);

        await cerrar.click();
        await expect(aviso).toHaveCount(0);
        await escenaria.conservado(page);
      });

      test('un fallo inmediato de conexión no usa el aviso de timeout', async ({ page, request }) => {
        await abrir(page, request);
        await bloquear(page, escenaria.metodoRuta, (ruta) => ruta.abort('connectionfailed'));
        await escenaria.enviar(page);
        await expect(page.getByTestId('aviso-timeout')).toHaveCount(0);
        if (escenaria.propioDeReintentar) {
          await expect(page.getByTestId('aviso-red')).toBeVisible();
          await expect(page.getByTestId('btn-reintentar-red')).toBeVisible();
        } else {
          await expect(page.getByTestId('aviso-red')).toHaveCount(0);
          await escenaria.conservado(page);
        }
      });

      test('un 503 no usa el aviso de timeout', async ({ page, request }) => {
        await abrir(page, request);
        await bloquear(page, escenaria.metodoRuta, (ruta) => ruta.fulfill(RESPUESTA_503));
        await escenaria.enviar(page);
        await expect(page.getByTestId('aviso-timeout')).toHaveCount(0);
        if (escenaria.propioDeReintentar) {
          await expect(page.getByTestId('aviso-red')).toBeVisible();
          await expect(page.getByTestId('btn-reintentar-red')).toBeVisible();
        } else {
          await expect(page.getByTestId('aviso-red')).toHaveCount(0);
          await escenaria.conservado(page);
        }
      });
    });
  }

  test.describe('consulta a Soporte', () => {
    const URL_SIN_SESION = /\/api\/v1\/soporte\/publico\/consultas$/;
    const URL_CON_SESION = /\/api\/v1\/soporte\/consultas$/;

    async function completar(page: Page, conSesion: boolean) {
      await page.goto('/soporte.html');
      if (!conSesion) {
        await page.getByTestId('input-soporte-email').fill(`soporte.2a.${Date.now()}@bajonea.test`);
      }
      await page.getByTestId('select-soporte-tipo').selectOption('OTRA');
      await page.getByTestId('input-soporte-mensaje').fill('Necesito ayuda con algo que no encuentro en la app.');
    }

    async function conservadoSoporte(page: Page) {
      await expect(page.getByTestId('input-soporte-mensaje')).toHaveValue('Necesito ayuda con algo que no encuentro en la app.');
      await expect(page.getByTestId('btn-enviar-consulta')).toBeEnabled();
    }

    test('con sesión: el timeout enlaza a Mis consultas a Soporte', async ({ page, request }) => {
      const cuenta = await registrarYVerificarCliente(request, esc.localidadId);
      const sesion = await login(request, cuenta.nombreUsuario, cuenta.password);
      await page.clock.install();
      await abrirComoUsuario(page, sesion);
      await completar(page, true);
      await bloquear(page, URL_CON_SESION, () => undefined);
      await page.getByTestId('btn-enviar-consulta').click();
      await page.clock.fastForward(15_000);

      await expect(page.getByTestId('aviso-timeout-texto')).toHaveText('Puede que ya se haya enviado: revisá Mis consultas a Soporte antes de volver a enviar.');
      await expect(page.getByTestId('aviso-timeout-enlace')).toHaveAttribute('href', 'mis-consultas.html');
      await expect(page.getByTestId('btn-reintentar-red')).toHaveCount(0);
      await conservadoSoporte(page);
    });

    test('sin sesión: el timeout manda a revisar el email, sin enlace', async ({ page }) => {
      await page.clock.install();
      await completar(page, false);
      await bloquear(page, URL_SIN_SESION, () => undefined);
      await page.getByTestId('btn-enviar-consulta').click();
      await page.clock.fastForward(15_000);

      await expect(page.getByTestId('aviso-timeout-texto')).toHaveText('Puede que ya se haya enviado: revisá tu email antes de volver a enviar.');
      await expect(page.getByTestId('aviso-timeout-enlace')).toHaveCount(0);
      await expect(page.getByTestId('btn-cerrar-aviso-timeout')).toBeVisible();
      await expect(page.getByTestId('btn-reintentar-red')).toHaveCount(0);
      await conservadoSoporte(page);
    });

    test('un fallo inmediato de conexión y un 503 muestran el error del formulario, no el aviso de timeout', async ({ page }) => {
      await completar(page, false);
      await bloquear(page, URL_SIN_SESION, (ruta) => ruta.abort('connectionfailed'));
      await page.getByTestId('btn-enviar-consulta').click();
      await expect(page.getByTestId('aviso-timeout')).toHaveCount(0);
      await conservadoSoporte(page);

      await page.unroute(URL_SIN_SESION);
      await bloquear(page, URL_SIN_SESION, (ruta) => ruta.fulfill(RESPUESTA_503));
      await page.getByTestId('btn-enviar-consulta').click();
      await expect(page.getByTestId('aviso-timeout')).toHaveCount(0);
      await conservadoSoporte(page);
    });
  });

  test.describe('mutación común', () => {
    test('editar el perfil con timeout sigue ofreciendo "Reintentar" y no el aviso de timeout', async ({ page, request }) => {
      const cuenta = await registrarYVerificarCliente(request, esc.localidadId);
      await page.clock.install();
      await loginUi(page, cuenta.nombreUsuario, cuenta.password);
      await page.waitForURL('**/index.html');
      await page.goto('/perfil.html');
      await expect(page.getByTestId('nombre-cliente-perfil')).not.toHaveText('');
      await page.getByTestId('btn-editar-datos').click();
      await page.getByTestId('input-nombre').fill('Con Timeout');
      await page.route('**/clientes/perfil', async (ruta) => {
        if (ruta.request().method() !== 'PUT') {
          await ruta.continue();
        }
      });
      await page.getByTestId('btn-guardar-datos').click();
      await page.clock.fastForward(15_000);

      await expect(page.getByTestId('aviso-red')).toBeVisible();
      await expect(page.getByTestId('btn-reintentar-red')).toBeVisible();
      await expect(page.getByTestId('aviso-timeout')).toHaveCount(0);
      await expect(page.getByTestId('input-nombre')).toHaveValue('Con Timeout');
    });
  });
});
