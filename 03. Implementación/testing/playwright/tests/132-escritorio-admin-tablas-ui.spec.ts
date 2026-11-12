import { test, expect } from './helpers/prueba';
import type { Locator, Page } from '@playwright/test';
import { abrirComoUsuario } from './helpers/multicomercio';
import { prepararEscenarioAdmin } from './helpers/admin-escritorio';
import type { EscenarioAdmin } from './helpers/admin-escritorio';
import { caja, esDialogoCentrado } from './helpers/layout';
import { sufijoUnico } from './helpers/backend';

async function fondoDe(nodo: Locator): Promise<string> {
  return nodo.evaluate((el) => getComputedStyle(el).backgroundColor);
}

async function alineadas(encabezado: Locator, fila: Locator, selectorCeldaFila: string, indiceEncabezado: number) {
  const celdaEncabezado = await caja(encabezado.locator('.tabla-encabezado__celda').nth(indiceEncabezado));
  const celdaFila = await caja(fila.locator(selectorCeldaFila).first());
  expect(Math.abs(celdaEncabezado.x - celdaFila.x)).toBeLessThanOrEqual(2);
}

test.describe('Escritorio E2: tablas y detalles del Administrador @escritorio', () => {
  test.describe.configure({ timeout: 240_000 });
  let esc: EscenarioAdmin;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(300_000);
    esc = await prepararEscenarioAdmin(request);
  });

  async function abrir(page: Page, ruta: string) {
    await abrirComoUsuario(page, esc.admin);
    await page.goto(`/${ruta}`);
    await expect(page.getByTestId('barra-admin')).toBeVisible();
  }

  test('Clientes es una tabla: encabezado fijo, filas de 56 px o más con hover, buscador y filtros en una fila y acciones de 44 px', async ({ page }) => {
    await abrir(page, 'admin-clientes.html');
    const encabezado = page.getByTestId('encabezado-clientes');
    await expect(encabezado).toBeVisible();
    await expect(encabezado.locator('.tabla-encabezado__celda')).toHaveText(['Nombre', 'Email', 'Estado', 'Novedades', '']);
    expect(await encabezado.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
    const fila = page.locator('[data-testid^="cliente-item-"]').first();
    await expect(fila).toBeVisible();
    expect((await caja(fila)).height).toBeGreaterThanOrEqual(56);
    await alineadas(encabezado, fila, 'h3', 0);
    await alineadas(encabezado, fila, '.cliente-admin-row__email', 1);
    const antes = await fondoDe(fila);
    await fila.hover();
    await expect.poll(() => fondoDe(fila)).not.toBe(antes);
    const boton = fila.locator('.cliente-admin-row__acciones');
    const medida = await caja(boton);
    expect(medida.width).toBeGreaterThanOrEqual(44);
    expect(medida.height).toBeGreaterThanOrEqual(44);
    const buscador = await caja(page.getByTestId('input-buscar-cliente'));
    const chips = await caja(page.getByTestId('filtro-clientes-todos'));
    expect(Math.abs(buscador.y + buscador.height / 2 - (chips.y + chips.height / 2))).toBeLessThanOrEqual(40);
    expect(chips.x).toBeGreaterThan(buscador.x + buscador.width);
    await boton.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-testid^="menu-acciones-cliente-"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid^="menu-acciones-cliente-"]')).toHaveCount(0);
  });

  test('Dueños y Comercios usan la misma tabla: encabezado, filas alineadas y sus acciones siguen abriendo sus hojas', async ({ page }) => {
    await abrir(page, 'admin-duenos.html');
    const encabezado = page.getByTestId('encabezado-duenos');
    await expect(encabezado.locator('.tabla-encabezado__celda')).toHaveText(['Nombre', 'Contacto', 'Estado', 'Novedades', '']);
    const fila = page.locator('[data-testid^="dueno-item-"]').first();
    expect((await caja(fila)).height).toBeGreaterThanOrEqual(56);
    await alineadas(encabezado, fila, 'h3', 0);
    await fila.locator('.cliente-admin-row__acciones').click();
    const hoja = page.getByTestId('hoja-acciones-dueno');
    await expect(hoja).toBeVisible();
    await esDialogoCentrado(page, hoja.locator('xpath=ancestor-or-self::*[contains(@class,"modal-sheet")][1]'));
    await page.getByTestId('btn-cancelar-acciones-dueno').click();

    await page.goto('/admin-comercios.html');
    const encabezadoComercios = page.getByTestId('encabezado-comercios');
    await expect(encabezadoComercios.locator('.tabla-encabezado__celda')).toHaveText(['', 'Comercio', 'Tipo', 'Estado', '']);
    const filaComercio = page.locator('[data-testid^="comercio-admin-item-"]').first();
    expect((await caja(filaComercio)).height).toBeGreaterThanOrEqual(56);
    await alineadas(encabezadoComercios, filaComercio, 'h3', 1);
    const detalle = filaComercio.locator('.comercio-admin-row__detalle');
    expect((await caja(detalle)).height).toBeGreaterThanOrEqual(44);
    await detalle.click();
    await expect(page.locator('.product-modal-sheet').first()).toBeVisible();
    await esDialogoCentrado(page, page.locator('.product-modal-sheet').first(), { anchoMinimo: 400, anchoMaximo: 640 });
  });

  test('Reembolsos es una tabla de columnas con el botón Reintentar de 44 px que responde en la fila', async ({ page }) => {
    await abrir(page, 'admin-reembolsos.html');
    const encabezado = page.getByTestId('encabezado-reembolsos');
    await expect(encabezado.locator('.tabla-encabezado__celda')).toHaveText(['Reembolso', 'Pedido', 'Cliente', 'Comercio', 'Monto', 'Fecha', 'Motivo', '']);
    const fila = page.locator('[data-testid^="reembolso-item-"]').first();
    await expect(fila).toBeVisible();
    await alineadas(encabezado, fila, '[data-testid="codigo-reembolso"]', 0);
    const boton = fila.getByTestId('btn-reintentar-reembolso');
    expect((await caja(boton)).height).toBeGreaterThanOrEqual(44);
    const derecha = (await caja(boton)).x + (await caja(boton)).width;
    expect(derecha).toBeLessThanOrEqual((await caja(fila)).x + (await caja(fila)).width + 1);
    const respuesta = page.waitForResponse((r) => r.url().includes('/administrador/reembolsos/') && r.url().endsWith('/reintentar'));
    await boton.click();
    expect((await respuesta).status()).toBeLessThan(500);
    await expect(page.locator('.toast').first()).toBeVisible();
  });

  test('Categorías y Tags: el botón flotante desaparece, Nueva categoría y Nuevo tag están en la cabecera y editan en un diálogo centrado', async ({ page }) => {
    await abrir(page, 'admin-categorias.html');
    await expect(page.getByTestId('btn-crear-categoria')).toBeHidden();
    const encabezado = page.getByTestId('encabezado-categorias');
    await expect(encabezado.locator('.tabla-encabezado__celda')).toHaveText(['', 'Nombre', 'Productos', 'Estado', '']);
    const nueva = page.getByTestId('btn-nueva-categoria-escritorio');
    await expect(nueva).toBeVisible();
    await expect(nueva).toBeEnabled();
    const nombre = `Cat E2 ${sufijoUnico()}`;
    await nueva.click();
    await expect(page.getByTestId('modal-categoria')).toBeVisible();
    await esDialogoCentrado(page, page.locator('.product-modal-sheet'), { anchoMinimo: 400, anchoMaximo: 640 });
    await page.getByTestId('input-nombre-categoria').fill(nombre);
    await page.getByTestId('btn-guardar-categoria').click();
    await expect(page.locator('.toast')).toContainText('Categoría creada correctamente');
    const fila = page.locator('.categoria-row', { hasText: nombre });
    await expect(fila).toBeVisible();
    await expect(fila.getByTestId('estado-fila')).toHaveText('Activa');
    expect((await caja(fila)).height).toBeGreaterThanOrEqual(56);
    await fila.locator('.categoria-row__edit-btn').click();
    await expect(page.getByTestId('input-nombre-categoria')).toHaveValue(nombre);
    await esDialogoCentrado(page, page.locator('.product-modal-sheet'), { anchoMinimo: 400, anchoMaximo: 640 });
    await page.getByTestId('btn-cancelar-categoria').click();

    await page.goto('/admin-tags.html');
    await expect(page.getByTestId('btn-crear-tag')).toBeHidden();
    const nuevoTag = page.getByTestId('btn-nuevo-tag-escritorio');
    await expect(nuevoTag).toBeVisible();
    const nombreTag = `Tag E2 ${sufijoUnico()}`.slice(0, 30);
    await nuevoTag.click();
    await expect(page.getByTestId('modal-tag')).toBeVisible();
    await page.getByTestId('input-nombre-tag').fill(nombreTag);
    await page.getByTestId('btn-guardar-tag').click();
    await expect(page.locator('.toast')).toContainText('Tag creado correctamente');
    await expect(page.locator('.categoria-row', { hasText: nombreTag })).toBeVisible();
  });

  test('Equipo y Actividad del comercio son tablas de solo lectura con encabezado', async ({ page }) => {
    await abrir(page, `admin-comercio-equipo.html?id=${esc.base.dueno.comercioId}`);
    const encabezado = page.getByTestId('encabezado-equipo');
    await expect(encabezado).toBeVisible();
    await expect(encabezado.locator('.tabla-encabezado__celda')).toHaveText(['', 'Integrante', 'Email', 'En el equipo desde', 'Estado']);
    const fila = page.locator('[data-testid^="equipo-miembro-"]').first();
    expect((await caja(fila)).height).toBeGreaterThanOrEqual(56);
    await alineadas(encabezado, fila, '[data-testid="equipo-nombre"]', 1);
    await expect(fila.locator('button')).toHaveCount(0);

    await page.goto(`/admin-comercio-actividad.html?id=${esc.base.dueno.comercioId}`);
    const encabezadoActividad = page.getByTestId('encabezado-actividad');
    await expect(encabezadoActividad.locator('.tabla-encabezado__celda')).toHaveText(['', 'Quién', 'Acción', 'Sobre', 'Hora']);
    const filaActividad = page.getByTestId('actividad-fila').first();
    expect((await caja(filaActividad)).height).toBeGreaterThanOrEqual(56);
    await alineadas(encabezadoActividad, filaActividad, '[data-testid="actividad-accion"]', 2);
    await expect(filaActividad.locator('button')).toHaveCount(0);
  });

  test('Comercios pendientes y Re-solicitudes son grillas de tarjetas: dos columnas y tres desde 1600 px', async ({ page }) => {
    await abrir(page, 'admin-comercios-pendientes.html');
    const tarjetas = page.locator('[data-testid^="comercio-pendiente-item-"]');
    await expect(tarjetas.first()).toBeVisible();
    const columnas = async () => new Set(await tarjetas.evaluateAll((nodos) => nodos.map((nodo) => Math.round(nodo.getBoundingClientRect().x)))).size;
    expect(await columnas()).toBe(2);
    await page.setViewportSize({ width: 1700, height: 900 });
    await expect.poll(columnas).toBe(3);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId(`btn-ver-solicitud-${esc.pendientes[0].comercioId}`).click();
    await page.waitForURL(`**/admin-comercio-detalle.html?id=${esc.pendientes[0].comercioId}`);

    await page.goto('/admin-resolicitudes.html');
    const tarjetasResolicitud = page.locator('[data-testid^="resolicitud-item-"]');
    await expect(tarjetasResolicitud.first()).toBeVisible();
    const cuentas = await tarjetasResolicitud.evaluateAll((nodos) => new Set(nodos.map((nodo) => Math.round(nodo.getBoundingClientRect().x))).size);
    expect(cuentas).toBeLessThanOrEqual(2);
    expect(cuentas).toBeGreaterThanOrEqual(1);
  });

  test('el detalle de una solicitud va en dos columnas: datos a la izquierda y las acciones a la derecha', async ({ page }) => {
    await abrir(page, `admin-comercio-detalle.html?id=${esc.pendientes[0].comercioId}`);
    const contenido = page.getByTestId('detalle-comercio-pendiente');
    await expect(contenido).toContainText(esc.pendientes[0].nombre.split(' ')[0]);
    const secciones = contenido.locator('.detail-section');
    expect(await secciones.count()).toBeGreaterThanOrEqual(6);
    const xs = new Set(await secciones.evaluateAll((nodos) => nodos.map((nodo) => Math.round(nodo.getBoundingClientRect().x))));
    expect(xs.size).toBe(2);
    const aprobar = await caja(page.getByTestId('btn-aprobar-comercio'));
    const ultima = await caja(secciones.last());
    expect(aprobar.x).toBeGreaterThan(ultima.x + ultima.width);
    expect(aprobar.height).toBeGreaterThanOrEqual(44);
  });

  test('la re-solicitud compara en una tabla de tres columnas, marca lo que cambió con texto y deja las acciones a la derecha', async ({ page }) => {
    await abrir(page, `admin-resolicitud-detalle.html?id=${esc.resolicitud.comercioId}`);
    const encabezado = page.getByTestId('encabezado-cambios');
    await expect(encabezado.locator('.tabla-encabezado__celda')).toHaveText(['Campo', 'Antes', 'Ahora', '']);
    const tarjeta = page.locator('.cambio-card').first();
    await expect(tarjeta).toBeVisible();
    await alineadas(encabezado, tarjeta, '.detail-section__title', 0);
    await alineadas(encabezado, tarjeta, '[data-testid^="cambio-antes-"]', 1);
    await alineadas(encabezado, tarjeta, '[data-testid^="cambio-ahora-"]', 2);
    await expect(tarjeta.locator('.cambio-card__marca')).toHaveText('Cambió');
    await expect(tarjeta.locator('[data-testid^="cambio-ahora-"]')).toContainText('Descripción corregida');
    const aprobar = await caja(page.getByTestId('btn-aprobar-comercio'));
    const cabeza = await caja(tarjeta);
    expect(aprobar.x).toBeGreaterThan(cabeza.x + cabeza.width);
  });
});
