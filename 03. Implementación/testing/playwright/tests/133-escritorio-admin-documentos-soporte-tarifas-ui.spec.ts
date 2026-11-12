import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { abrirComoUsuario } from './helpers/multicomercio';
import { apiConHeaders, sqlTest } from './helpers/backend';
import { prepararEscenarioAdmin } from './helpers/admin-escritorio';
import type { EscenarioAdmin } from './helpers/admin-escritorio';
import { caja, esDialogoCentrado } from './helpers/layout';
import { crearConsultaPublica, responderComoSoporte } from './helpers/soporte';

const tarifasCreadas: number[] = [];

test.describe('Escritorio E2: documentos, Soporte y Tarifas del Administrador @escritorio', () => {
  test.describe.configure({ timeout: 240_000 });
  let esc: EscenarioAdmin;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(300_000);
    esc = await prepararEscenarioAdmin(request);
  });

  test.afterAll(() => {
    if (tarifasCreadas.length > 0) {
      sqlTest(`DELETE FROM configuracion_tarifa WHERE id IN (${tarifasCreadas.join(',')});`);
    }
  });

  async function abrir(page: Page, ruta: string) {
    await abrirComoUsuario(page, esc.admin);
    await page.goto(`/${ruta}`);
    await expect(page.getByTestId('barra-admin')).toBeVisible();
  }

  const rutaRevision = (documentoId: number) => `admin-documento-revision.html?comercioId=${esc.base.dueno.comercioId}&id=${documentoId}`;

  test('la bandeja de documentos es una tabla con encabezado y Revisar lleva a la revisión', async ({ page }) => {
    await abrir(page, 'admin-documentos.html');
    const encabezado = page.getByTestId('encabezado-documentos');
    await expect(encabezado.locator('.tabla-encabezado__celda')).toHaveText(['Comercio', 'Documento', 'Archivo', 'Subido', '']);
    const fila = page.locator('[data-testid^="bandeja-documento-"]').first();
    await expect(fila).toBeVisible();
    expect((await caja(fila)).height).toBeGreaterThanOrEqual(56);
    const celdaEncabezado = await caja(encabezado.locator('.tabla-encabezado__celda').nth(1));
    const celdaFila = await caja(fila.locator('[data-testid^="bandeja-tipo-"]'));
    expect(Math.abs(celdaEncabezado.x - celdaFila.x)).toBeLessThanOrEqual(2);
    const revisar = fila.locator('.doc-revisar');
    expect((await caja(revisar)).height).toBeGreaterThanOrEqual(44);
    await revisar.click();
    await page.waitForURL(/admin-documento-revision\.html\?(?=.*comercioId=\d+)(?=.*id=\d+)/);
  });

  test('la revisión va en dos paneles: visor flexible a la izquierda y una columna de 420 px con los datos, la decisión y los otros documentos', async ({ page }) => {
    await abrir(page, rutaRevision(esc.documentoIds[2]));
    const visor = page.getByTestId('revision-documento');
    const comercio = page.getByTestId('revision-comercio');
    await expect(visor).toBeVisible();
    const cajaVisor = await caja(visor);
    const cajaComercio = await caja(comercio);
    expect(Math.abs(cajaComercio.width - 420)).toBeLessThanOrEqual(2);
    expect(cajaComercio.x).toBeGreaterThan(cajaVisor.x + cajaVisor.width);
    expect(cajaVisor.width).toBeGreaterThan(560);
    await expect(page.getByTestId('titulo-datos-comercio')).toHaveText('Datos del comercio');
    await expect(page.getByTestId('titulo-tu-decision')).toHaveText('Tu decisión');
    const rechazar = await caja(page.getByTestId('btn-rechazar-documento'));
    const aprobar = await caja(page.getByTestId('btn-aprobar-documento'));
    expect(rechazar.height).toBe(48);
    expect(aprobar.height).toBe(48);
    expect(Math.abs(rechazar.y - aprobar.y)).toBeLessThanOrEqual(1);
    expect(aprobar.x).toBeGreaterThan(rechazar.x + rechazar.width);
    const colorAprobar = await page.getByTestId('btn-aprobar-documento').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(colorAprobar).toBe('rgb(30, 142, 62)');
    const alternar = page.getByTestId('btn-alternar-otros-documentos');
    await expect(alternar).toHaveText('Otros documentos del comercio (2)');
    await expect(alternar).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('revision-otros-lista')).toBeHidden();
    await alternar.click();
    await expect(alternar).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('revision-otros-lista')).toBeVisible();
    await alternar.click();
    await expect(page.getByTestId('revision-otros-lista')).toBeHidden();
  });

  test('Abrir en pestaña nueva abre el archivo con el visor del navegador, sin token en la dirección', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __abiertas: string[][] }).__abiertas = [];
      window.open = (...argumentos: unknown[]) => {
        (window as unknown as { __abiertas: string[][] }).__abiertas.push(argumentos.map(String));
        return null;
      };
    });
    await abrir(page, rutaRevision(esc.documentoIds[2]));
    const abrirPestana = page.getByTestId('btn-abrir-pestana-nueva');
    await expect(abrirPestana).toBeEnabled();
    await abrirPestana.click();
    const abiertas = await page.evaluate(() => (window as unknown as { __abiertas: string[][] }).__abiertas);
    expect(abiertas).toHaveLength(1);
    expect(abiertas[0][0]).toMatch(/^blob:/);
    expect(abiertas[0][0]).not.toMatch(/token|Bearer/i);
    expect(abiertas[0][1]).toBe('_blank');
  });

  test('aprobar un documento desde el panel: diálogo centrado, vuelve a la bandeja con el aviso', async ({ page }) => {
    await abrir(page, rutaRevision(esc.documentoIds[0]));
    await page.getByTestId('btn-aprobar-documento').click();
    const modal = page.getByTestId('modal-aprobar-documento');
    await expect(modal).toBeVisible();
    await esDialogoCentrado(page, modal.locator('.modal-sheet'));
    await page.getByTestId('btn-confirmar-aprobar-documento').click();
    await page.waitForURL('**/admin-documentos.html?resuelto=aprobado');
    await expect(page.locator('.toast')).toContainText('Documento aprobado');
  });

  test('rechazar un documento pide el motivo en un diálogo y lo guarda', async ({ page, request }) => {
    await abrir(page, rutaRevision(esc.documentoIds[1]));
    await page.getByTestId('btn-rechazar-documento').click();
    const hoja = page.locator('.doc-hoja');
    await expect(hoja).toBeVisible();
    await esDialogoCentrado(page, hoja);
    await expect(page.getByTestId('btn-confirmar-motivo-documento')).toBeVisible();
    await page.getByTestId('input-motivo-documento').fill('El documento está vencido, subí uno vigente.');
    await page.getByTestId('btn-confirmar-motivo-documento').click();
    await page.waitForURL('**/admin-documentos.html?resuelto=rechazado');
    await expect(page.locator('.toast')).toContainText('Documento rechazado');
    const { body } = await apiConHeaders(request, 'GET', `/administrador/comercios/${esc.base.dueno.comercioId}/documentos`, esc.admin.token);
    const rechazado = (body.data as Array<{ id: number; estado: string; motivoRechazo: string }>).find((d) => d.id === esc.documentoIds[1]);
    expect(rechazado?.estado).toBe('RECHAZADO');
    expect(rechazado?.motivoRechazo).toContain('vencido');
  });

  test('Soporte: bandeja de 440 px a la izquierda, "Elegí una consulta" a la derecha y la URL sigue la selección sin #', async ({ page }) => {
    await abrir(page, 'admin-soporte.html');
    const maestro = page.locator('.soporte-maestro');
    await expect(maestro).toBeVisible();
    expect(Math.abs((await caja(maestro)).width - 440)).toBeLessThanOrEqual(2);
    await expect(page.getByTestId('consulta-vacia')).toContainText('Elegí una consulta');
    await expect(page.getByTestId('filtros-soporte').getByRole('button')).toHaveText([/Esperan/, /Respondidas/, /Cerradas/]);
    const primera = page.locator('[data-testid^="soporte-item-"]:not([data-testid="soporte-item-tipo"]):not([data-testid="soporte-item-hace"]):not([data-testid="soporte-item-estado"])').first();
    await expect(primera).toBeVisible();
    const id = Number((await primera.getAttribute('data-testid'))!.replace('soporte-item-', ''));
    await primera.click();
    await expect(page).toHaveURL(new RegExp(`admin-soporte\\.html\\?id=${id}$`));
    expect(page.url()).not.toContain('#');
    await expect(page.getByTestId('consulta-email')).toBeVisible();
    await expect(page.getByTestId('consulta-vacia')).toHaveCount(0);
    await expect(primera).toHaveAttribute('aria-current', 'true');
    const borde = await primera.evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(borde).toBe('rgb(255, 71, 0)');
    const panel = await caja(page.getByTestId('panel-consulta'));
    expect(panel.x).toBeGreaterThan((await caja(maestro)).x + 440);
    await page.goBack();
    await expect(page.getByTestId('consulta-vacia')).toBeVisible();
    await expect(primera).not.toHaveAttribute('aria-current', 'true');
  });

  test('Soporte: abrir con ?id= carga la bandeja y el detalle juntos, y con el teclado se mueve con flechas y Enter', async ({ page }) => {
    await abrir(page, `admin-soporte.html?id=${esc.consultas.esperando[0]}`);
    await expect(page.getByTestId(`soporte-item-${esc.consultas.esperando[0]}`)).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('consulta-email')).toBeVisible();
    const filas = page.locator('a.soporte-fila');
    await filas.first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(filas.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(filas.first()).toBeFocused();
    await page.keyboard.press('End');
    await expect(filas.last()).toBeFocused();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    const destino = filas.nth(1);
    const idDestino = (await destino.getAttribute('data-testid'))!.replace('soporte-item-', '');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`admin-soporte\\.html\\?id=${idDestino}$`));
    await expect(destino).toHaveAttribute('aria-current', 'true');
  });

  test('Soporte: responder y cerrar desde el panel actualizan la lista sin navegar y conservan la selección', async ({ page, request }) => {
    const consulta = await crearConsultaPublica(request, { mensaje: 'Necesito ayuda con un pedido que no llegó nunca.' });
    await abrir(page, `admin-soporte.html?id=${consulta.id}`);
    const fila = page.getByTestId(`soporte-item-${consulta.id}`);
    await expect(fila).toHaveAttribute('aria-current', 'true');
    await page.getByTestId('input-respuesta-admin').fill('Hola, ya estamos mirando tu pedido.');
    await page.getByTestId('btn-respuesta-admin').click();
    await expect(page.locator('.toast')).toContainText('Respuesta enviada');
    await expect(page).toHaveURL(new RegExp(`admin-soporte\\.html\\?id=${consulta.id}$`));
    await expect(page.getByTestId('filtro-soporte-respondidas')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId(`soporte-item-${consulta.id}`)).toHaveAttribute('aria-current', 'true');
    await page.getByTestId('btn-cerrar-consulta').click();
    await page.getByTestId('btn-confirmar-cerrar').click();
    await expect(page.locator('.toast').last()).toContainText('Consulta cerrada');
    await expect(page.getByTestId('filtro-soporte-cerradas')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId(`soporte-item-${consulta.id}`)).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('consulta-cerrada')).toBeVisible();
  });

  test('Soporte: el sondeo de 15 s suma consultas nuevas, conserva la selección y no pisa lo que se está escribiendo', async ({ page, request }) => {
    const consulta = await crearConsultaPublica(request, { mensaje: 'Quiero consultar por el cierre de mi comercio.' });
    await abrirComoUsuario(page, esc.admin);
    await page.clock.install();
    await page.goto(`/admin-soporte.html?id=${consulta.id}`);
    await expect(page.getByTestId('input-respuesta-admin')).toBeVisible();
    await page.getByTestId('input-respuesta-admin').fill('Borrador que no se tiene que perder');
    const textoChip = async () => (await page.getByTestId('filtro-soporte-esperan').innerText()).replace(/\D/g, '');
    const antes = Number(await textoChip());
    await crearConsultaPublica(request, { mensaje: 'Otra consulta que llega mientras escribo.' });
    await responderComoSoporte(request, esc.admin.token, consulta.id, 'Respuesta enviada desde otra pestaña.');
    await page.clock.runFor(16_000);
    await expect.poll(async () => Number(await textoChip())).toBe(antes);
    await expect(page.getByTestId(`soporte-item-${consulta.id}`)).toHaveCount(0);
    await expect(page.getByTestId('input-respuesta-admin')).toHaveValue('Borrador que no se tiene que perder');
    await expect(page.getByTestId('panel-consulta')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`admin-soporte\\.html\\?id=${consulta.id}$`));
    await page.getByTestId('input-respuesta-admin').fill('');
    await page.getByTestId('input-respuesta-admin').blur();
    await page.clock.runFor(16_000);
    await expect(page.getByTestId('input-respuesta-admin')).toBeDisabled();
  });

  test('Tarifas: formulario a la izquierda, tarifa vigente e historial a la derecha y confirmación con el antes y el ahora', async ({ page }) => {
    await abrir(page, 'admin-tarifas.html');
    const formulario = page.getByTestId('tarifa-formulario');
    await expect(formulario).toBeVisible();
    await expect(page.getByTestId('btn-nueva-tarifa')).toBeHidden();
    const cajaFormulario = await caja(formulario);
    const cajaVigente = await caja(page.locator('.stats-bar').first());
    expect(cajaVigente.x).toBeGreaterThan(cajaFormulario.x + cajaFormulario.width - 1);
    const textoVigente = (await page.locator('.stats-bar').first().innerText()).replace(/\s+/g, ' ');
    const vigenteCliente = textoVigente.match(/\$[\d.]+|\d+(?:,\d+)?%/)![0];
    await page.getByTestId('input-valor-cargo-cliente').fill('250');
    await page.getByTestId('input-valor-cargo-comercio').fill('3');
    await page.getByTestId('btn-guardar-nueva-tarifa').click();
    const hoja = page.getByTestId('modal-confirmar-tarifa');
    await expect(hoja).toBeVisible();
    await esDialogoCentrado(page, hoja.locator('.modal-sheet'));
    await expect(hoja.getByRole('heading')).toHaveText('¿Aplicar la nueva tarifa?');
    const comparacion = page.getByTestId('comparacion-tarifa');
    await expect(comparacion).toContainText(vigenteCliente);
    await expect(comparacion).toContainText('$250');
    await expect(comparacion).toContainText('3%');
    await expect(comparacion).toContainText('→');
    await expect(hoja).toContainText('Los pedidos ya creados conservan la tarifa con la que se confirmaron');
    await expect(hoja).toContainText('va a ver el total actualizado antes de pagar');
    await expect(page.getByTestId('btn-cancelar-confirmar-tarifa')).toBeFocused();
    await page.getByTestId('btn-cancelar-confirmar-tarifa').click();
    await expect(page.getByTestId('input-valor-cargo-cliente')).toHaveValue('250');
    const creada = page.waitForResponse((r) => r.url().endsWith('/administrador/tarifas') && r.request().method() === 'POST');
    await page.getByTestId('btn-guardar-nueva-tarifa').click();
    await page.getByTestId('btn-confirmar-nueva-tarifa').click();
    const respuesta = await creada;
    expect(respuesta.status()).toBe(201);
    tarifasCreadas.push((await respuesta.json()).data.id as number);
    await expect(page.locator('.toast')).toContainText('Tarifa creada correctamente');
    await expect(page.locator('.stats-bar').first()).toContainText('$250');
    await expect(page.getByTestId('input-valor-cargo-cliente')).toHaveValue('');
  });
});
