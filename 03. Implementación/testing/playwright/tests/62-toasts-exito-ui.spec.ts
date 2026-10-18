import path from 'node:path';
import { readFileSync } from 'node:fs';
import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  agregarItemCarrito,
  apiPost,
  crearCategoria,
  crearProducto,
  diaDeHoy,
  esperarImagenCargadaEnRecorte,
  fijarPasswordAdminYLoguear,
  login,
  nombreArchivoFixture,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  subirImagenProductoDirecto,
  sufijoUnico,
} from './helpers/backend';
import type { HorarioInput } from './helpers/backend';
import { abrirComoUsuario, prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { abrirComoUsuarioConComercio } from './helpers/selector';

const FIXTURE_BUFFER = readFileSync(path.resolve(__dirname, '../fixtures/bajonea-e2e-producto.png'));
const VIEWPORT = { width: 375, height: 812 };
const todoElDia: HorarioInput[] = [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];

let adminToken: string;
let localidadId: string;
let categoriaId: number;

const toast = (page: Page) => page.locator('.toast');

async function duenoApto(request: APIRequestContext): Promise<Dueno> {
  return prepararAprobado(request, adminToken, localidadId, true, todoElDia);
}

async function abrirPanelDe(page: Page, dueno: Dueno, ruta: string) {
  await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: dueno.comercioId });
  await page.goto(ruta);
}

async function productoConFotos(request: APIRequestContext, dueno: Dueno, cantidadFotos: number): Promise<number> {
  const productoId = await crearProducto(request, dueno.token, {
    nombre: `Producto Toast ${sufijoUnico()}`,
    precio: 1500,
    categoriaId,
  });
  for (let i = 0; i < cantidadFotos; i += 1) {
    await subirImagenProductoDirecto(request, dueno.token, productoId, FIXTURE_BUFFER, { orden: i, esPrincipal: i === 0 });
  }
  return productoId;
}

async function arrastrarFoto(page: Page, origen: number, destino: number) {
  const transferencia = await page.evaluateHandle(() => new DataTransfer());
  const tiles = page.getByTestId('galeria-fotos-producto').locator('.photo-gallery__item');
  await tiles.nth(origen).dispatchEvent('dragstart', { dataTransfer: transferencia });
  await tiles.nth(destino).dispatchEvent('dragover', { dataTransfer: transferencia });
  await tiles.nth(destino).dispatchEvent('drop', { dataTransfer: transferencia });
}

async function subirFotoPorRecorte(page: Page) {
  await page.getByTestId('input-foto-producto').setInputFiles({ name: nombreArchivoFixture(), mimeType: 'image/png', buffer: FIXTURE_BUFFER });
  await esperarImagenCargadaEnRecorte(page);
  await page.getByTestId('btn-confirmar-recorte').click();
}

test.describe('Toasts de éxito en las acciones que modifican datos (UI)', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });
  test.use({ viewport: VIEWPORT });

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat Toast UI ${sufijoUnico()}`);
  });

  test('el toast es una región de estado accesible y se mantiene el componente de siempre', async ({ page, request }) => {
    const dueno = await duenoApto(request);
    await abrirPanelDe(page, dueno, '/comercio-dashboard.html');
    await page.getByTestId('switch-cierre-comercio').click();
    await page.getByTestId('btn-confirmar-cierre-comercio').click();

    await expect(toast(page)).toHaveCount(1);
    await expect(toast(page)).toHaveAttribute('role', 'status');
    await expect(toast(page)).toHaveAttribute('aria-live', 'polite');
    await expect(toast(page).locator('.banner-success')).toBeVisible();
  });

  test.describe('Dueño: cierre del comercio', () => {
    test('cerrar y abrir con el interruptor muestran "Comercio cerrado" y "Comercio abierto"', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      await abrirPanelDe(page, dueno, '/comercio-dashboard.html');
      const interruptor = page.getByTestId('switch-cierre-comercio');

      await interruptor.click();
      await page.getByTestId('btn-confirmar-cierre-comercio').click();
      await expect(toast(page)).toHaveText('Comercio cerrado');
      await expect(interruptor).toHaveAttribute('aria-checked', 'false');

      await interruptor.click();
      await expect(toast(page)).toHaveText('Comercio abierto');
      await expect(interruptor).toHaveAttribute('aria-checked', 'true');
    });

    test('si el servidor rechaza el cierre no hay toast de éxito', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      await page.route('**/comercios/cerrar', (ruta) =>
        ruta.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Este comercio no está operativo', data: null }) }),
      );
      await abrirPanelDe(page, dueno, '/comercio-dashboard.html');

      await page.getByTestId('switch-cierre-comercio').click();
      await page.getByTestId('btn-confirmar-cierre-comercio').click();

      await expect(page.getByTestId('aviso-fijo')).toBeVisible();
      await expect(toast(page)).toHaveCount(0);
    });
  });

  test.describe('Dueño: notificaciones', () => {
    test('"Marcar todas" avisa que los avisos quedaron leídos', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      for (let i = 1; i <= 2; i += 1) {
        sql(
          `INSERT INTO notificacion (usuario_id, tipo, mensaje, leida, fecha_creacion, canal, estado, entidad_tipo, entidad_id, comercio_id) ` +
            `VALUES (${dueno.duenoId}, 'COMERCIO_APROBADO', 'Aviso toast ${i}', 0, NOW(), 'PUSH', 'PENDIENTE', 'COMERCIO', ${dueno.comercioId}, ${dueno.comercioId});`,
        );
      }
      await abrirPanelDe(page, dueno, '/notificaciones.html');
      await expect(page.getByTestId('btn-marcar-todas-leidas')).toBeEnabled();

      await page.getByTestId('btn-marcar-todas-leidas').click();

      await expect(toast(page)).toHaveText('Marcaste todos los avisos como leídos');
      await expect(page.getByTestId('btn-marcar-todas-leidas')).toBeDisabled();
    });

    test('si "Marcar todas" falla, solo hay toast de error', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      sql(
        `INSERT INTO notificacion (usuario_id, tipo, mensaje, leida, fecha_creacion, canal, estado, entidad_tipo, entidad_id, comercio_id) ` +
          `VALUES (${dueno.duenoId}, 'COMERCIO_APROBADO', 'Aviso toast error', 0, NOW(), 'PUSH', 'PENDIENTE', 'COMERCIO', ${dueno.comercioId}, ${dueno.comercioId});`,
      );
      await page.route('**/notificaciones/leidas', (ruta) =>
        ruta.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Solicitud inválida', data: null }) }),
      );
      await abrirPanelDe(page, dueno, '/notificaciones.html');

      await page.getByTestId('btn-marcar-todas-leidas').click();

      await expect(toast(page)).toHaveText('No pudimos marcar las notificaciones como leídas');
      await expect(toast(page).locator('.banner-error')).toBeVisible();
    });
  });

  test.describe('Cliente: carrito', () => {
    async function carritoConDosProductos(request: APIRequestContext) {
      const dueno = await duenoApto(request);
      const primero = await crearProducto(request, dueno.token, { nombre: `Milanesa Toast ${sufijoUnico().slice(-6)}`, precio: 1200, categoriaId });
      const segundo = await crearProducto(request, dueno.token, { nombre: `Papas Toast ${sufijoUnico().slice(-6)}`, precio: 800, categoriaId });
      const cliente = await registrarYVerificarCliente(request, localidadId);
      const sesion = await login(request, cliente.nombreUsuario, cliente.password);
      await agregarItemCarrito(request, sesion.token, primero, 1);
      await agregarItemCarrito(request, sesion.token, segundo, 3);
      return { sesion };
    }

    test('quitar un producto con el tacho avisa cuál quitó', async ({ page, request }) => {
      const { sesion } = await carritoConDosProductos(request);
      await abrirComoUsuario(page, sesion);
      await page.goto('/carrito.html');
      const tacho = page.locator('[data-testid^="btn-eliminar-item-carrito-"]').first();
      const nombre = (await page.locator('.cart-item h3').first().textContent()) ?? '';

      await tacho.click();

      await expect(toast(page)).toHaveText(`Quitaste ${nombre} del carrito`);
      await expect(page.locator('.cart-item')).toHaveCount(1);
    });

    test('bajar la cantidad a cero con el "−" también avisa; cambiar la cantidad sin llegar a cero no avisa', async ({ page, request }) => {
      const { sesion } = await carritoConDosProductos(request);
      await abrirComoUsuario(page, sesion);
      await page.goto('/carrito.html');
      const filas = page.locator('.cart-item');
      await expect(filas).toHaveCount(2);
      const filaDeTres = filas.filter({ hasText: 'Papas Toast' });
      const filaDeUno = filas.filter({ hasText: 'Milanesa Toast' });

      await filaDeTres.locator('[data-testid^="btn-restar-cantidad-"]').click();
      await expect(filaDeTres.locator('[data-testid^="btn-restar-cantidad-"]')).toBeEnabled();
      await expect(toast(page)).toHaveCount(0);

      await filaDeUno.locator('[data-testid^="btn-restar-cantidad-"]').click();
      await expect(toast(page)).toContainText('Quitaste Milanesa Toast');
      await expect(filas).toHaveCount(1);
    });

    test('vaciar el carrito avisa después de confirmar', async ({ page, request }) => {
      const { sesion } = await carritoConDosProductos(request);
      await abrirComoUsuario(page, sesion);
      await page.goto('/carrito.html');

      await page.getByTestId('btn-vaciar-carrito').click();
      await page.getByTestId('btn-confirmar-vaciar-carrito').click();

      await expect(toast(page)).toHaveText('Vaciaste el carrito');
    });
  });

  test.describe('Dueño: producto', () => {
    test('eliminar una foto de un producto ya guardado avisa "Imagen eliminada"', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      const productoId = await productoConFotos(request, dueno, 2);
      await abrirPanelDe(page, dueno, `/comercio-producto-form.html?id=${productoId}`);
      await expect(page.getByTestId('galeria-fotos-producto').locator('img')).toHaveCount(2);

      await page.getByTestId('btn-eliminar-foto-producto-1').click();

      await expect(toast(page)).toHaveText('Imagen eliminada');
      await expect(page.getByTestId('galeria-fotos-producto').locator('img')).toHaveCount(1);
    });

    test('reordenar fotos arrastrando avisa una sola vez "Orden de las fotos actualizado"', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      const productoId = await productoConFotos(request, dueno, 2);
      await abrirPanelDe(page, dueno, `/comercio-producto-form.html?id=${productoId}`);
      const tiles = page.getByTestId('galeria-fotos-producto').locator('.photo-gallery__item');
      await expect(tiles).toHaveCount(2);

      await arrastrarFoto(page, 0, 1);

      await expect(toast(page)).toHaveText('Orden de las fotos actualizado');
    });

    test('si el servidor falla al reordenar no hay toast de éxito', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      const productoId = await productoConFotos(request, dueno, 2);
      await page.route('**/imagenes/*/orden', (ruta) =>
        ruta.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Solicitud inválida', data: null }) }),
      );
      await abrirPanelDe(page, dueno, `/comercio-producto-form.html?id=${productoId}`);
      const tiles = page.getByTestId('galeria-fotos-producto').locator('.photo-gallery__item');
      await expect(tiles).toHaveCount(2);

      await arrastrarFoto(page, 0, 1);

      await expect(toast(page).locator('.banner-success')).toHaveCount(0);
    });

    test('agregar una foto por el editor de recorte avisa "Imagen agregada"', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      const productoId = await productoConFotos(request, dueno, 1);
      await abrirPanelDe(page, dueno, `/comercio-producto-form.html?id=${productoId}`);
      await expect(page.getByTestId('galeria-fotos-producto').locator('img')).toHaveCount(1);

      await subirFotoPorRecorte(page);

      await expect(toast(page)).toHaveText('Imagen agregada', { timeout: 20_000 });
      await expect(page.getByTestId('galeria-fotos-producto').locator('img')).toHaveCount(2);
    });

    test('recortar una foto ya guardada avisa "Imagen actualizada"', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      const productoId = await productoConFotos(request, dueno, 1);
      await abrirPanelDe(page, dueno, `/comercio-producto-form.html?id=${productoId}`);
      await expect(page.getByTestId('galeria-fotos-producto').locator('img')).toHaveCount(1);

      await page.getByLabel('Recortar imagen').click();
      await esperarImagenCargadaEnRecorte(page);
      await page.getByTestId('btn-confirmar-recorte').click();

      await expect(toast(page)).toHaveText('Imagen actualizada', { timeout: 20_000 });
    });

    test('descontinuar desde el formulario vuelve a la lista con el toast "Producto descontinuado"', async ({ page, request }) => {
      const dueno = await duenoApto(request);
      const productoId = await productoConFotos(request, dueno, 0);
      await abrirPanelDe(page, dueno, `/comercio-producto-form.html?id=${productoId}`);

      await page.getByTestId('btn-descontinuar-producto').click();
      await page.getByTestId('input-confirmar-irreversible').check();
      await page.getByTestId('btn-confirmar-descontinuar').click();

      await page.waitForURL('**/comercio-productos.html*');
      await expect(toast(page)).toHaveText('Producto descontinuado');
    });
  });
});
