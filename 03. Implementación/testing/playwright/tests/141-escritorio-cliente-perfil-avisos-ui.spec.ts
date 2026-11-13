import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { ANCHOS_ESCRITORIO, caja, sinScrollHorizontalEnAnchos } from './helpers/layout';
import { abrirComoCliente, prepararEscenarioCliente } from './helpers/escritorio-cliente';
import type { EscenarioCliente } from './helpers/escritorio-cliente';
import { abrirComoDueno } from './helpers/escritorio-comercio';

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('Escritorio E3: perfil, direcciones y avisos @escritorio', () => {
  test.describe.configure({ timeout: 240_000 });
  let e: EscenarioCliente;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(300_000);
    e = await prepararEscenarioCliente(request);
  });

  async function abrir(page: Page, request: any, ruta: string) {
    await abrirComoCliente(page, request, e);
    await page.goto(`/${ruta}`);
  }

  test('el perfil tiene el menú de secciones de 240 px a la izquierda y la sección activa a la derecha @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'perfil.html');
    const menu = page.locator('#view-principal');
    const seccion = page.locator('#view-editar-datos');
    await expect(seccion).toBeVisible();
    await expect(menu).toBeVisible();
    const medidaMenu = await caja(menu);
    const medidaSeccion = await caja(seccion);
    expect(Math.round(medidaMenu.width)).toBe(240);
    expect(medidaSeccion.x).toBeGreaterThan(medidaMenu.x + medidaMenu.width);
    await expect(page.getByTestId('btn-editar-datos')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('btn-mis-direcciones')).not.toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('btn-mis-consultas')).toBeVisible();
    await expect(page.getByTestId('btn-cerrar-sesion')).toBeVisible();
    await expect(page.locator('.bottom-nav')).toBeHidden();
  });

  test('los datos personales se distribuyen en dos columnas y guardar muestra el toast @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'perfil.html');
    await expect(page.getByTestId('input-nombre')).toBeVisible();
    const nombre = await caja(page.getByTestId('input-nombre'));
    const apellido = await caja(page.getByTestId('input-apellido'));
    expect(apellido.x).toBeGreaterThan(nombre.x + nombre.width);
    expect(Math.abs(apellido.y - nombre.y)).toBeLessThan(4);
    await page.getByTestId('input-nombre').fill('Lucía');
    await page.getByTestId('btn-guardar-datos').click();
    await expect(page.getByTestId('toast-exito')).toBeVisible();
    await expect(page.getByTestId('nombre-cliente-perfil')).toContainText('Lucía');
  });

  test('cambiar de sección con el menú refleja ?seccion= sin # y volver a entrar la restaura @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'perfil.html');
    await page.getByTestId('btn-cambiar-password').click();
    await expect(page.locator('#view-cambiar-password')).toBeVisible();
    await expect(page.locator('#view-editar-datos')).toBeHidden();
    await expect(page).toHaveURL(/perfil\.html\?seccion=password$/);
    expect(page.url()).not.toContain('#');
    await expect(page.getByTestId('btn-cambiar-password')).toHaveAttribute('aria-current', 'true');
    await page.getByTestId('btn-mis-direcciones').click();
    await expect(page).toHaveURL(/seccion=direcciones/);
    await page.goto('/perfil.html?seccion=direcciones');
    await expect(page.locator('#view-direcciones')).toBeVisible();
    await expect(page.getByTestId('btn-mis-direcciones')).toHaveAttribute('aria-current', 'true');
  });

  test('«Mis consultas» del menú lleva a la página de consultas @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'perfil.html');
    await page.getByTestId('btn-mis-consultas').click();
    await expect(page).toHaveURL(/mis-consultas\.html/);
  });

  test('las direcciones son una grilla de dos columnas con la predeterminada marcada con texto @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'perfil.html?seccion=direcciones');
    const radios = page.getByTestId('lista-direcciones').getByRole('radio');
    await expect(radios).toHaveCount(3);
    const posiciones = await page.locator('.direccion-item').evaluateAll((nodos) => nodos.map((nodo) => Math.round(nodo.getBoundingClientRect().x)));
    expect(new Set(posiciones).size).toBe(2);
    await expect(page.locator('.chip-predeterminada')).toHaveCount(1);
    await expect(page.locator('.chip-predeterminada')).toHaveText('Predeterminada');
    const agregar = await caja(page.getByTestId('btn-agregar-direccion'));
    const titulo = await caja(page.locator('#view-direcciones .app-header__title'));
    expect(Math.abs(agregar.y + agregar.height / 2 - (titulo.y + titulo.height / 2))).toBeLessThan(30);
    expect(agregar.x).toBeGreaterThan(titulo.x + titulo.width);
  });

  test('«Agregar dirección» abre el panel lateral derecho de unos 520 px y guardar suma una tarjeta @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'perfil.html?seccion=direcciones');
    await page.getByTestId('btn-agregar-direccion').click();
    const panel = page.getByTestId('pantalla-direccion-form');
    await expect(panel).toBeVisible();
    const medida = await caja(panel);
    expect(medida.width).toBeLessThanOrEqual(520);
    expect(medida.width).toBeGreaterThanOrEqual(480);
    expect(Math.round(medida.x + medida.width)).toBe(1440);
    expect(medida.height).toBe(900);
    await page.getByTestId('input-direccion-calle').fill('Belgrano');
    await page.getByTestId('input-direccion-numero').fill('321');
    await page.getByTestId('input-direccion-codigo-postal').fill('9420');
    await page.getByTestId('select-direccion-localidad').selectOption(e.localidadId);
    await page.getByTestId('input-direccion-nombre').fill('Oficina');
    await page.getByTestId('btn-guardar-direccion').click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId('toast-exito')).toBeVisible();
    await expect(page.getByTestId('lista-direcciones').getByRole('radio')).toHaveCount(4);
    await expect(page.getByTestId('btn-mis-direcciones')).toContainText('(4)');
  });

  test('eliminar una dirección usa el diálogo centrado y el panel se cierra con Escape @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'perfil.html?seccion=direcciones');
    await page.getByTestId('btn-agregar-direccion').click();
    await expect(page.getByTestId('pantalla-direccion-form')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pantalla-direccion-form')).toHaveCount(0);
    const menus = page.locator('[data-testid^="btn-menu-direccion-"]');
    await menus.last().click();
    await page.getByTestId('btn-eliminar-direccion').click();
    const hoja = page.getByTestId('modal-eliminar-direccion');
    await expect(hoja).toBeVisible();
    const medida = await caja(hoja.locator('.hoja, .modal-sheet').first());
    expect(medida.y).toBeGreaterThan(0);
    await page.getByTestId('btn-confirmar-eliminar-direccion').click();
    await expect(page.getByTestId('toast-exito')).toBeVisible();
  });

  test('los avisos del Cliente son una tabla con Aviso, Fecha y estado y las filas con destino son clicables @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'notificaciones.html');
    const lista = page.locator('.notification-list--tabla');
    await expect(lista).toBeVisible();
    const cabecera = await caja(lista.locator('.notification-cabecera'));
    expect(cabecera.height).toBeGreaterThan(20);
    await expect(lista.locator('.notification-cabecera')).toContainText('Aviso');
    await expect(lista.locator('.notification-cabecera')).toContainText('Fecha');
    await expect(lista.locator('.notification-cabecera')).toContainText('Estado');
    const fila = lista.locator('a.notification-item').first();
    await expect(fila).toBeVisible();
    await expect(fila.locator('.notification-item__estado')).toHaveText('Sin leer');
    const columnas = await Promise.all([caja(fila.locator('.notification-item__texto')), caja(fila.locator('.notification-item__fecha')), caja(fila.locator('.notification-item__estado'))]);
    expect(columnas[1].x).toBeGreaterThan(columnas[0].x + columnas[0].width);
    expect(columnas[2].x).toBeGreaterThan(columnas[1].x + columnas[1].width);
    await fila.hover();
    const fondo = await fila.evaluate((nodo) => getComputedStyle(nodo).backgroundColor);
    expect(fondo).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('«Marcar todas» deja todos los avisos como leídos y muestra el toast @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'notificaciones.html');
    await expect(page.locator('.notification-list--tabla a.notification-item').first()).toBeVisible();
    await page.getByTestId('btn-marcar-todas-leidas').click();
    await expect(page.getByTestId('toast-exito')).toBeVisible();
    await expect(page.locator('.notification-item__estado', { hasText: 'Sin leer' })).toHaveCount(0);
    await expect(page.locator('.notification-item__estado', { hasText: 'Leído' }).first()).toBeVisible();
    await expect(page.getByTestId('barra-punto-avisos')).toBeHidden();
  });

  test('el Dueño ve la misma tabla de avisos con su barra lateral @escritorio', async ({ page, request }) => {
    await abrirComoDueno(page, request, e);
    await page.goto('/notificaciones.html');
    const lista = page.locator('.notification-list--tabla');
    await expect(lista).toBeVisible();
    await expect(lista.locator('.notification-cabecera')).toContainText('Estado');
    await expect(lista.locator('.notification-item').first()).toBeVisible();
    await expect(page.getByTestId('btn-nav-avisos')).toBeVisible();
    await expect(page.getByTestId('barra-cliente')).toHaveCount(0);
  });

  test('mis consultas, la conversación de soporte y ayuda usan la barra superior y tarjetas propias @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'mis-consultas.html');
    await expect(page.getByTestId('barra-cliente')).toBeVisible();
    await expect(page.getByTestId('lista-consultas')).toBeVisible();
    const titulo = await caja(page.getByTestId('titulo-mis-consultas'));
    const nueva = await caja(page.getByTestId('btn-nueva-consulta'));
    expect(nueva.x).toBeGreaterThan(titulo.x + titulo.width);
    expect(Math.abs(nueva.y - titulo.y)).toBeLessThan(40);
    await page.goto(`/soporte-consulta.html?id=${e.consultaId}`);
    await expect(page.getByTestId('barra-cliente')).toBeVisible();
    await expect(page.locator('.app-shell--consulta')).toHaveCount(0);
    await page.goto('/ayuda.html');
    await expect(page.getByTestId('barra-cliente')).toBeVisible();
    await expect(page.getByTestId('lista-ayuda')).toBeVisible();
  });

  test('el formulario de reclamo se arma en dos columnas con los botones al pie @escritorio', async ({ page, request }) => {
    await abrir(page, request, `reclamo-nuevo.html?pedido=${e.pedidoReclamable}`);
    const formulario = page.getByTestId('formulario-reclamo');
    await expect(formulario).toBeVisible();
    const motivo = await caja(page.locator('#reclamo-motivo'));
    const descripcion = await caja(page.locator('#reclamo-descripcion'));
    expect(descripcion.y).toBeGreaterThan(motivo.y);
    const enviar = await caja(page.getByTestId('btn-enviar-reclamo'));
    const cancelar = await caja(page.getByTestId('btn-cancelar-reclamo'));
    expect(enviar.x).toBeGreaterThan(cancelar.x + cancelar.width);
    expect(Math.abs(enviar.y - cancelar.y)).toBeLessThan(6);
    expect(enviar.width).toBeLessThan(400);
  });

  test('perfil, avisos y las demás páginas del Cliente no tienen scroll horizontal entre 1024 y 1920 px @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'perfil.html?seccion=direcciones');
    await expect(page.getByTestId('lista-direcciones')).toBeVisible();
    await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
    for (const ruta of ['notificaciones.html', 'mis-consultas.html', 'ayuda.html', `soporte-consulta.html?id=${e.consultaId}`, `reclamo-nuevo.html?pedido=${e.pedidoReclamable}`]) {
      await page.goto(`/${ruta}`);
      await page.waitForLoadState('networkidle');
      await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
    }
  });

  test('cerrar sesión desde el perfil sigue pidiendo confirmación @escritorio', async ({ page, request }) => {
    await abrir(page, request, 'perfil.html');
    await page.getByTestId('btn-cerrar-sesion').click();
    await expect(page.getByTestId('modal-confirmar-logout')).toBeVisible();
    await page.getByTestId('btn-confirmar-logout').click();
    await page.waitForURL('**/login.html');
  });
});
