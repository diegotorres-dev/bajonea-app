import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import { apiConHeaders, apiGet, login, registrarYVerificarCliente, sqlTest as sql } from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import { abrirComoUsuario } from './helpers/multicomercio';
import { abrirComoUsuarioConComercio } from './helpers/selector';
import { sumarAlEquipo } from './helpers/empleado';
import { sinScrollHorizontal } from './helpers/layout';
import {
  DESCRIPCION_VALIDA,
  capturarReclamos,
  fotoHeicFalsa,
  fotoJpegFalsa,
  fotoPdfFalsa,
  fotoPng,
  nuevoCliente,
  pedidoEntregado,
  prepararEscenario,
  reclamarConFotosPorApi,
  reclamarPorApi,
  reclamoIdDe,
} from './helpers/reclamos';
import type { Cliente, Escenario } from './helpers/reclamos';

test.use({ viewport: { width: 375, height: 812 } });

const SEIS_MB = 6 * 1024 * 1024;

test.describe('Fase 5, S5 (fotos): fotos adjuntas a un reclamo', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let esc: Escenario;
  let cliente: Cliente;
  let empleada: SesionApi;

  test.beforeAll(async ({ request }) => {
    esc = await prepararEscenario(request);
    cliente = await nuevoCliente(request, esc.localidadId);
    const cuenta = await registrarYVerificarCliente(request, esc.localidadId);
    await sumarAlEquipo(request, esc.dueno.comercioId, cuenta, esc.dueno.token);
    empleada = await login(request, cuenta.nombreUsuario, cuenta.password);
  });

  async function abrirFormulario(page: Page, pedidoId: number) {
    await abrirComoUsuario(page, cliente.sesion);
    await page.goto(`/reclamo-nuevo.html?pedido=${pedidoId}`);
    await expect(page.getByTestId('formulario-reclamo')).toBeVisible();
  }

  async function completarYElegir(page: Page, ...fotos: Array<{ name: string; mimeType: string; buffer: Buffer }>) {
    await page.getByTestId('select-reclamo-motivo').selectOption('FALTAN_PRODUCTOS');
    await page.getByTestId('input-reclamo-descripcion').fill(DESCRIPCION_VALIDA);
    for (const foto of fotos) {
      await page.getByTestId('input-reclamo-foto').setInputFiles(foto);
    }
  }

  const fotosGuardadas = (pedidoId: number): number => Number(sql(`SELECT COUNT(*) FROM reclamo_foto f JOIN reclamo r ON r.id = f.reclamo_id WHERE r.pedido_id = ${pedidoId};`));
  const reclamosDe = (pedidoId: number): number => Number(sql(`SELECT COUNT(*) FROM reclamo WHERE pedido_id = ${pedidoId};`));

  test('el formulario ofrece hasta tres espacios para fotos, con miniaturas, quitar y el texto de ayuda', async ({ page, request }) => {
    const pedidoId = await pedidoEntregado(request, esc, cliente);
    await abrirFormulario(page, pedidoId);

    await expect(page.getByTestId('campo-reclamo-fotos')).toBeVisible();
    await expect(page.getByText('Fotos (opcional)')).toBeVisible();
    await expect(page.getByTestId('ayuda-reclamo-fotos')).toHaveText('Hasta 3 fotos de 5 MB. Solo las ve nuestro equipo.');
    await expect(page.getByTestId('btn-agregar-reclamo-foto')).toBeVisible();
    await expect(page.getByTestId('btn-agregar-reclamo-foto')).toHaveAttribute('aria-label', 'Agregar una foto');
    await expect(page.getByTestId('input-reclamo-foto')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    await sinScrollHorizontal(page);
    await capturarReclamos(page, '33-cliente-fotos-vacio');

    const selector = page.waitForEvent('filechooser');
    await page.getByTestId('btn-agregar-reclamo-foto').click();
    await (await selector).setFiles(fotoPng('primera.png'));
    await expect(page.getByTestId('miniatura-reclamo-foto-1')).toBeVisible();
    await expect(page.getByTestId('nombre-reclamo-foto-1')).toHaveText('primera.png');
    await expect.poll(() => page.getByTestId('miniatura-reclamo-foto-1').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByTestId('btn-agregar-reclamo-foto')).toHaveAttribute('aria-label', 'Agregar otra foto');
    await expect(page.getByTestId('btn-agregar-reclamo-foto')).toBeFocused();

    await page.getByTestId('input-reclamo-foto').setInputFiles(fotoPng('segunda.png'));
    await page.getByTestId('input-reclamo-foto').setInputFiles(fotoPng('tercera.png'));
    await expect(page.getByTestId('reclamo-foto-3')).toBeVisible();
    await expect(page.getByTestId('btn-agregar-reclamo-foto')).toHaveCount(0);
    await expect(page.getByTestId('anuncio-reclamo-fotos')).toHaveText('Foto agregada. Tenés 3 de 3.');
    await sinScrollHorizontal(page);
    await capturarReclamos(page, '34-cliente-fotos-tres-miniaturas');

    await page.getByTestId('btn-quitar-reclamo-foto-2').click();
    await expect(page.getByTestId('reclamo-foto-3')).toHaveCount(0);
    await expect(page.getByTestId('nombre-reclamo-foto-2')).toHaveText('tercera.png');
    await expect(page.getByTestId('btn-agregar-reclamo-foto')).toBeVisible();
    await expect(page.getByTestId('anuncio-reclamo-fotos')).toHaveText('Foto quitada. Tenés 2 de 3.');
    await expect(page.getByTestId('btn-quitar-reclamo-foto-2')).toBeFocused();
    expect(reclamosDe(pedidoId)).toBe(0);
  });

  test('envía el reclamo con sus fotos, muestra "Enviando…" con todo bloqueado y después "Adjuntaste 2 fotos."', async ({ page, request }) => {
    const pedidoId = await pedidoEntregado(request, esc, cliente);
    await abrirFormulario(page, pedidoId);
    await page.route(`**/api/v1/pedidos/cliente/${pedidoId}/reclamo`, async (ruta) => {
      await new Promise((resolver) => setTimeout(resolver, 700));
      await ruta.continue();
    });
    await completarYElegir(page, fotoPng('uno.png'), fotoPng('dos.png'));

    await page.getByTestId('btn-enviar-reclamo').click();
    await expect(page.getByTestId('btn-enviar-reclamo')).toHaveText('Enviando…');
    await expect(page.getByTestId('btn-enviar-reclamo')).toBeDisabled();
    await expect(page.getByTestId('btn-quitar-reclamo-foto-1')).toBeDisabled();
    await expect(page.getByTestId('btn-agregar-reclamo-foto')).toBeDisabled();
    await capturarReclamos(page, '35-cliente-fotos-enviando');

    await expect(page.getByTestId('reclamo-recibido')).toBeVisible();
    expect(fotosGuardadas(pedidoId)).toBe(2);
    expect(reclamosDe(pedidoId)).toBe(1);

    await page.getByTestId('btn-volver-pedido').click();
    await expect(page.getByTestId('bloque-reclamo')).toBeVisible();
    await expect(page.getByTestId('texto-fotos-reclamo')).toHaveText('Adjuntaste 2 fotos.');
    await expect(page.getByTestId('bloque-reclamo').locator('img')).toHaveCount(0);
    await sinScrollHorizontal(page);
    await capturarReclamos(page, '36-cliente-reclamo-con-fotos');
  });

  test('con una sola foto dice "Adjuntaste 1 foto." y sin fotos la línea no aparece', async ({ page, request }) => {
    const conUna = await pedidoEntregado(request, esc, cliente);
    const sinFotos = await pedidoEntregado(request, esc, cliente);
    await abrirFormulario(page, conUna);
    await completarYElegir(page, fotoPng('unica.png'));
    await page.getByTestId('btn-enviar-reclamo').click();
    await expect(page.getByTestId('reclamo-recibido')).toBeVisible();
    await page.goto(`/pedido-detalle.html?id=${conUna}`);
    await expect(page.getByTestId('texto-fotos-reclamo')).toHaveText('Adjuntaste 1 foto.');

    await abrirFormulario(page, sinFotos);
    await completarYElegir(page);
    await page.getByTestId('btn-enviar-reclamo').click();
    await expect(page.getByTestId('reclamo-recibido')).toBeVisible();
    await page.goto(`/pedido-detalle.html?id=${sinFotos}`);
    await expect(page.getByTestId('bloque-reclamo')).toBeVisible();
    await expect(page.getByTestId('texto-fotos-reclamo')).toHaveCount(0);
    expect(fotosGuardadas(sinFotos)).toBe(0);
  });

  test('un formato no admitido (HEIC, PDF) o una foto de más de 5 MB muestra el error del servidor y no crea nada', async ({ page, request }) => {
    const pedidoId = await pedidoEntregado(request, esc, cliente);
    await abrirFormulario(page, pedidoId);

    await completarYElegir(page, fotoHeicFalsa('iphone.heic'));
    await page.getByTestId('btn-enviar-reclamo').click();
    const aviso = page.getByTestId('aviso-reclamo-mensaje');
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText('Las fotos HEIC de iPhone no se pueden adjuntar. Usá una foto en formato JPG, PNG o WebP');
    await expect(aviso).toBeFocused();
    await expect(page.getByTestId('btn-enviar-reclamo')).toBeEnabled();
    await expect(page.getByTestId('btn-enviar-reclamo')).toHaveText('Enviar reclamo');
    await expect(page.getByTestId('reclamo-foto-1')).toBeVisible();
    expect(reclamosDe(pedidoId)).toBe(0);
    await sinScrollHorizontal(page);
    await capturarReclamos(page, '37-cliente-fotos-error-formato');

    await page.getByTestId('btn-quitar-reclamo-foto-1').click();
    await page.getByTestId('input-reclamo-foto').setInputFiles(fotoPdfFalsa('escaneo.pdf'));
    await page.getByTestId('btn-enviar-reclamo').click();
    await expect(page.getByTestId('aviso-reclamo-mensaje')).toContainText('Solo se aceptan fotos en formato JPG, PNG o WebP');
    expect(reclamosDe(pedidoId)).toBe(0);

    await page.getByTestId('btn-quitar-reclamo-foto-1').click();
    await page.getByTestId('input-reclamo-foto').setInputFiles(fotoJpegFalsa('enorme.jpg', SEIS_MB));
    await page.getByTestId('btn-enviar-reclamo').click();
    await expect(page.getByTestId('aviso-reclamo-mensaje')).toContainText('Una foto pesa 6 MB y el máximo es 5 MB');
    expect(reclamosDe(pedidoId)).toBe(0);
    await capturarReclamos(page, '38-cliente-fotos-error-tamano');

    await page.getByTestId('btn-quitar-reclamo-foto-1').click();
    await page.getByTestId('input-reclamo-foto').setInputFiles(fotoPng('buena.png'));
    await page.getByTestId('btn-enviar-reclamo').click();
    await expect(page.getByTestId('reclamo-recibido')).toBeVisible();
    expect(fotosGuardadas(pedidoId)).toBe(1);
  });

  test('una foto que el navegador no puede mostrar queda con "Sin vista previa" y igual se envía', async ({ page, request }) => {
    const pedidoId = await pedidoEntregado(request, esc, cliente);
    await abrirFormulario(page, pedidoId);
    await completarYElegir(page, fotoJpegFalsa('rara.jpg', 2000));

    await expect(page.getByTestId('sin-vista-reclamo-foto-1')).toHaveText('Sin vista previa');
    await expect(page.getByTestId('nombre-reclamo-foto-1')).toHaveText('rara.jpg');
    await page.getByTestId('btn-enviar-reclamo').click();
    await expect(page.getByTestId('reclamo-recibido')).toBeVisible();
    expect(fotosGuardadas(pedidoId)).toBe(1);
  });

  test('por la API, más de tres fotos o un reclamo ajeno no guardan nada', async ({ request }) => {
    const pedidoId = await pedidoEntregado(request, esc, cliente);
    const cuatro = await reclamarConFotosPorApi(request, cliente, pedidoId, [fotoPng('1.png'), fotoPng('2.png'), fotoPng('3.png'), fotoPng('4.png')]);
    expect(cuatro.status).toBe(400);
    expect(cuatro.body.data.codigo).toBe('RECLAMO_FOTO_CANTIDAD_EXCEDIDA');
    expect(cuatro.body.mensaje).toBe('Podés adjuntar hasta 3 fotos');
    expect(reclamosDe(pedidoId)).toBe(0);

    const otro = await nuevoCliente(request, esc.localidadId);
    const ajeno = await reclamarConFotosPorApi(request, otro, pedidoId, [fotoPng()]);
    expect(ajeno.status).toBe(404);
    expect(reclamosDe(pedidoId)).toBe(0);

    const bien = await reclamarConFotosPorApi(request, cliente, pedidoId, [fotoPng('a.png'), fotoPng('b.png'), fotoPng('c.png')]);
    expect(bien.status).toBe(201);
    expect(bien.body.data.cantidadFotos).toBe(3);

    const repetido = await reclamarConFotosPorApi(request, cliente, pedidoId, [fotoPng('d.png'), fotoPng('e.png')]);
    expect(repetido.status).toBe(409);
    expect(fotosGuardadas(pedidoId)).toBe(3);
  });

  test('el Administrador ve las miniaturas, las amplía en un visor y lo cierra con el botón o con Escape', async ({ page, request }) => {
    const pedidoId = await pedidoEntregado(request, esc, cliente, { domicilio: true });
    const creado = await reclamarConFotosPorApi(request, cliente, pedidoId, [fotoPng('remera.png'), fotoPng('caja.png'), fotoPng('bolsa.png')]);
    expect(creado.status).toBe(201);
    const reclamoId = reclamoIdDe(pedidoId);
    await abrirComoUsuario(page, esc.adminSesion);
    await page.goto(`/admin-reclamos.html?id=${reclamoId}`);
    await expect(page.getByTestId('cabecera-reclamo')).toBeVisible();

    await expect(page.getByTestId('fotos-del-reclamo')).toBeVisible();
    await expect(page.getByTestId('fotos-del-reclamo').getByRole('heading', { name: 'Fotos del Cliente' })).toBeVisible();
    for (const numero of [1, 2, 3]) {
      const imagen = page.getByTestId(`imagen-foto-reclamo-${numero}`);
      await expect(imagen).toBeVisible();
      await expect.poll(() => imagen.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    }
    await sinScrollHorizontal(page);
    await capturarReclamos(page, '39-admin-detalle-con-fotos');

    const primera = page.getByTestId('miniatura-foto-reclamo-1');
    await primera.click();
    await expect(page.getByTestId('visor-foto-reclamo')).toBeVisible();
    await expect(page.getByTestId('visor-foto-reclamo')).toHaveAttribute('role', 'dialog');
    await expect(page.getByTestId('btn-cerrar-visor-foto')).toBeFocused();
    await expect.poll(() => page.getByTestId('imagen-visor-foto').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await capturarReclamos(page, '40-admin-visor-de-foto', false);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('visor-foto-reclamo')).toHaveCount(0);
    await expect(primera).toBeFocused();

    await page.getByTestId('miniatura-foto-reclamo-2').click();
    await expect(page.getByTestId('visor-foto-reclamo')).toBeVisible();
    await page.getByTestId('btn-cerrar-visor-foto').click();
    await expect(page.getByTestId('visor-foto-reclamo')).toHaveCount(0);
    await expect(page.getByTestId('miniatura-foto-reclamo-2')).toBeFocused();
  });

  test('un reclamo sin fotos no muestra la sección y una foto que no carga lo dice sin romper el detalle', async ({ page, request }) => {
    const sinFotos = await pedidoEntregado(request, esc, cliente);
    const sinFotosId = await reclamarPorApi(request, cliente, sinFotos);
    await abrirComoUsuario(page, esc.adminSesion);
    await page.goto(`/admin-reclamos.html?id=${sinFotosId}`);
    await expect(page.getByTestId('cabecera-reclamo')).toBeVisible();
    await expect(page.getByTestId('fotos-del-reclamo')).toHaveCount(0);

    const conFotos = await pedidoEntregado(request, esc, cliente);
    await reclamarConFotosPorApi(request, cliente, conFotos, [fotoPng('a.png'), fotoPng('b.png')]);
    const conFotosId = reclamoIdDe(conFotos);
    await page.route('**/api/v1/administrador/reclamos/*/fotos/*', (ruta) => ruta.abort());
    await page.goto(`/admin-reclamos.html?id=${conFotosId}`);
    await expect(page.getByTestId('cabecera-reclamo')).toBeVisible();
    await expect(page.getByTestId('error-foto-reclamo-1')).toHaveText('No pudimos cargar esta foto');
    await expect(page.getByTestId('error-foto-reclamo-2')).toBeVisible();
    await expect(page.getByTestId('mensaje-del-cliente')).toBeVisible();
    await expect(page.getByTestId('formulario-resolucion')).toBeVisible();
    await sinScrollHorizontal(page);
    await capturarReclamos(page, '41-admin-foto-no-carga');
  });

  test('resolver el reclamo deja las fotos a la vista del Administrador', async ({ page, request }) => {
    const pedidoId = await pedidoEntregado(request, esc, cliente, { domicilio: true });
    await reclamarConFotosPorApi(request, cliente, pedidoId, [fotoPng('a.png')]);
    const reclamoId = reclamoIdDe(pedidoId);
    await abrirComoUsuario(page, esc.adminSesion);
    await page.goto(`/admin-reclamos.html?id=${reclamoId}`);
    await page.getByTestId('opcion-rechazo').check();
    await page.getByTestId('input-reclamo-motivo-rechazo').fill('Revisamos las fotos y el pedido salió completo');
    await page.getByTestId('btn-resolver-reclamo').click();
    await page.getByTestId('btn-confirmar-resolucion').click();
    await expect(page.getByTestId('resolucion-reclamo')).toBeVisible();
    await expect(page.getByTestId('fotos-del-reclamo')).toBeVisible();
    expect(fotosGuardadas(pedidoId)).toBe(1);
  });

  test('solo el Administrador accede a las fotos: el Cliente, el Dueño y el Empleado reciben 403 y no ven rastro en sus pantallas', async ({ page, request }) => {
    const pedidoId = await pedidoEntregado(request, esc, cliente);
    await reclamarConFotosPorApi(request, cliente, pedidoId, [fotoPng('a.png'), fotoPng('b.png')]);
    const reclamoId = reclamoIdDe(pedidoId);
    const fotoId = Number(sql(`SELECT id FROM reclamo_foto WHERE reclamo_id = ${reclamoId} ORDER BY orden LIMIT 1;`));
    const ruta = `/administrador/reclamos/${reclamoId}/fotos/${fotoId}`;

    expect((await apiGet(request, ruta, esc.adminToken)).status).toBe(200);
    expect((await apiGet(request, ruta, cliente.sesion.token)).status).toBe(403);
    expect((await apiGet(request, ruta, esc.dueno.token)).status).toBe(403);
    expect((await apiGet(request, ruta, empleada.token)).status).toBe(403);
    expect((await apiGet(request, ruta)).status).toBe(401);
    expect((await apiGet(request, `/administrador/reclamos/${reclamoId}/fotos/999999999`, esc.adminToken)).status).toBe(404);

    const header = { 'X-Comercio-Id': String(esc.dueno.comercioId) };
    const delDueno = await apiConHeaders(request, 'GET', '/pedidos/comercio', esc.dueno.token, header);
    const delEmpleado = await apiConHeaders(request, 'GET', '/pedidos/comercio', empleada.token, header);
    expect(JSON.stringify(delDueno.body)).not.toMatch(/cantidadFotos|"fotos"/);
    expect(JSON.stringify(delEmpleado.body)).not.toMatch(/cantidadFotos|"fotos"|reclamo/);

    await abrirComoUsuarioConComercio(page, esc.dueno.sesion, { comercioActivoId: esc.dueno.comercioId, ultimoComercioId: esc.dueno.comercioId });
    await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
    await expect(page.getByTestId('bloque-reclamo-dueno')).toBeVisible();
    await expect(page.getByTestId('bloque-reclamo-dueno')).not.toContainText(/foto/i);
    await expect(page.getByTestId('bloque-reclamo-dueno').locator('img')).toHaveCount(0);
  });
});
