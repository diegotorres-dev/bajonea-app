import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { apiConHeaders, login, resolverComercio } from './helpers/backend';
import { ANCHOS_ESCRITORIO, caja, sinScrollHorizontalEnAnchos, tieneAnilloDeFoco } from './helpers/layout';
import { abrirComoDueno, abrirComoEmpleado, prepararEscenarioComercio } from './helpers/escritorio-comercio';
import type { EscenarioComercio } from './helpers/escritorio-comercio';
import { abrirComoUsuario, prepararRechazado, registrarPendiente } from './helpers/multicomercio';

test.use({ viewport: { width: 1440, height: 900 } });

const SECCIONES_DUENO: Array<[string, string, string]> = [
  ['perfil', 'view-principal', 'Mi perfil'],
  ['legales', 'view-datos-legales', 'Datos legales'],
  ['datos', 'view-editar-perfil', 'Editar datos del comercio'],
  ['horarios', 'view-editar-horarios', 'Editar horarios'],
  ['equipo', 'view-equipo', 'Equipo'],
  ['mercadopago', 'view-mercadopago', 'Cobros con Mercado Pago'],
  ['password', 'view-cambiar-password', 'Cambiar contraseña'],
];

test.describe('Escritorio E1: productos, perfil, equipo, estadísticas, documentación, estados y asistentes @escritorio', () => {
  test.describe.configure({ timeout: 240_000 });
  let escenario: EscenarioComercio;

  test.beforeAll(async ({ request }) => {
    escenario = await prepararEscenarioComercio(request);
  });

  async function dueno(page: Page, request: Parameters<typeof abrirComoDueno>[1], url: string) {
    await abrirComoDueno(page, request, escenario);
    await page.goto(url);
  }

  test('productos: tabla con encabezado, categoría, precio, estado y acciones, y el botón Nuevo producto arriba a la derecha @escritorio', async ({ page, request }) => {
    await dueno(page, request, '/comercio-productos.html');
    const idProducto = escenario.productoIds[0];
    await expect(page.getByTestId(`producto-item-${idProducto}`)).toBeVisible();
    await expect(page.locator('.product-table__head')).toBeVisible();
    await expect(page.locator('.product-table__head')).toContainText('Categoría');
    await expect(page.getByTestId(`producto-categoria-${idProducto}`)).toContainText('Cat E1');
    await expect(page.getByTestId(`producto-estado-${idProducto}`)).toContainText('Disponible');
    await expect(page.getByTestId(`btn-editar-producto-${idProducto}`)).toBeVisible();
    await expect(page.getByTestId('crear-producto-fab')).toBeHidden().catch(() => undefined);
    await expect(page.locator('#crear-producto-fab')).toBeHidden();
    const nuevo = await caja(page.getByTestId('btn-nuevo-producto'));
    expect(nuevo.x + nuevo.width).toBeGreaterThan(1300);
    expect(nuevo.y).toBeLessThan(100);
    const fila = await caja(page.getByTestId(`producto-item-${idProducto}`));
    const kebab = await caja(page.getByTestId(`btn-acciones-producto-${idProducto}`));
    expect(kebab.height).toBeGreaterThanOrEqual(44);
    expect(fila.width).toBeGreaterThan(1000);
    await page.getByTestId(`producto-item-${idProducto}`).hover();
    await expect.poll(() => page.getByTestId(`producto-item-${idProducto}`).evaluate((nodo) => getComputedStyle(nodo).backgroundColor)).toBe('rgb(250, 247, 244)');
  });

  test('productos: el botón Nuevo producto y Editar llevan al formulario y el menú de tres puntos sigue abriendo las acciones @escritorio', async ({ page, request }) => {
    await dueno(page, request, '/comercio-productos.html');
    await page.getByTestId(`btn-acciones-producto-${escenario.productoIds[1]}`).click();
    await expect(page.getByTestId('modal-acciones-producto')).toBeVisible();
    await page.getByTestId('btn-cancelar-modal-acciones').click();
    await expect(page.getByTestId('modal-acciones-producto')).toHaveCount(0);
    await page.getByTestId(`btn-editar-producto-${escenario.productoIds[1]}`).click();
    await page.waitForURL(`**/comercio-producto-form.html?id=${escenario.productoIds[1]}`);
    await page.goto('/comercio-productos.html');
    await page.getByTestId('btn-nuevo-producto').click();
    await page.waitForURL('**/comercio-producto-form.html');
  });

  test('formulario de producto: galería en una fila a todo el ancho sobre los campos y acciones en los extremos @escritorio', async ({ page, request }) => {
    await dueno(page, request, `/comercio-producto-form.html?id=${escenario.productoIds[0]}`);
    await expect(page.getByTestId('input-nombre-producto')).toHaveValue(/Hamburguesa/);
    const galeria = await caja(page.getByTestId('galeria-fotos-producto'));
    const nombre = await caja(page.getByTestId('input-nombre-producto'));
    expect(galeria.y + galeria.height).toBeLessThanOrEqual(nombre.y);
    const precio = await caja(page.getByTestId('input-precio-producto'));
    const categoria = await caja(page.getByTestId('select-categoria-producto'));
    expect(Math.abs(precio.y - categoria.y)).toBeLessThanOrEqual(2);
    expect(categoria.x).toBeGreaterThan(precio.x + precio.width);
    const cancelar = await caja(page.getByTestId('btn-cancelar-producto'));
    const guardar = await caja(page.getByTestId('btn-guardar-producto'));
    expect(cancelar.x).toBeLessThan(500);
    expect(guardar.x + guardar.width).toBeGreaterThan(1300);
    expect(guardar.width).toBeLessThan(400);
    await expect(page.getByTestId('btn-volver')).toBeHidden();
    await page.getByTestId('btn-cancelar-producto').click();
    await page.waitForURL('**/comercio-productos.html');
  });

  test('perfil del Dueño: menú de secciones a la izquierda de 240 px y la sección activa en una tarjeta ancha @escritorio', async ({ page, request }) => {
    await dueno(page, request, '/comercio-perfil.html');
    await expect(page.getByTestId('menu-perfil-datos')).toBeVisible();
    const menu = await caja(page.getByTestId('menu-perfil'));
    expect(menu.width).toBe(240);
    for (const [clave, vista, titulo] of SECCIONES_DUENO) {
      await page.getByTestId(`menu-perfil-${clave}`).click();
      await expect(page.locator(`#${vista}`)).toBeVisible();
      await expect(page.getByTestId(`menu-perfil-${clave}`)).toHaveAttribute('aria-current', 'page');
      if (clave !== 'perfil') {
        await expect(page.locator(`#${vista}`)).toContainText(titulo);
      }
      await expect.poll(() => new URL(page.url()).searchParams.get('seccion')).toBe(clave);
      expect(page.url()).not.toContain('#');
    }
    const tarjeta = await caja(page.locator('#view-cambiar-password'));
    expect(tarjeta.width).toBeGreaterThan(700);
    await expect(page.getByTestId('menu-perfil-perfil')).not.toHaveAttribute('aria-current', 'page');
  });

  test('perfil del Dueño: ?seccion= abre la sección pedida, conserva el menú y las vistas móviles ya no se muestran juntas @escritorio', async ({ page, request }) => {
    await dueno(page, request, '/comercio-perfil.html?seccion=horarios');
    await expect(page.locator('#view-editar-horarios')).toBeVisible();
    await expect(page.getByTestId('menu-perfil-horarios')).toHaveAttribute('aria-current', 'page');
    expect(await page.locator('.perfil-view:not(.is-hidden)').count()).toBe(1);
    await page.goto('/comercio-perfil.html?seccion=equipo');
    await expect(page.locator('#view-equipo')).toBeVisible();
    await expect(page.getByTestId('equipo-tabs')).toBeVisible();
  });

  test('perfil del Dueño: datos del comercio en dos columnas, guardar muestra el aviso y la sección conserva su validación @escritorio', async ({ page, request }) => {
    await dueno(page, request, '/comercio-perfil.html?seccion=datos');
    await expect(page.getByTestId('input-nombre')).toBeVisible();
    const nombre = await caja(page.getByTestId('input-nombre'));
    const descripcion = await caja(page.getByTestId('input-descripcion'));
    expect(descripcion.width).toBeGreaterThan(nombre.width);
    const telefono = await caja(page.getByTestId('input-telefono'));
    expect(telefono.width).toBeLessThan(descripcion.width);
    await page.getByTestId('input-nombre').fill('');
    await page.getByTestId('btn-guardar-perfil-comercio').click();
    await expect(page.getByTestId('mensaje-error-nombre')).toBeVisible();
    await page.getByTestId('input-nombre').fill(escenario.dueno.nombre);
    await page.getByTestId('input-descripcion').fill('Descripción editada desde escritorio');
    await page.getByTestId('btn-guardar-perfil-comercio').click();
    await expect(page.locator('.toast').first()).toBeVisible();
    const sesion = await login(request, escenario.dueno.nombreUsuario, escenario.dueno.password);
    const perfil = await apiConHeaders(request, 'GET', '/comercios/perfil', sesion.token, { 'X-Comercio-Id': String(escenario.dueno.comercioId) });
    expect(perfil.body.data.descripcion).toBe('Descripción editada desde escritorio');
  });

  test('perfil del Dueño: "Desvincular cuenta" usa la clase btn-peligro sin estilos inline @escritorio', async ({ page, request }) => {
    await dueno(page, request, '/comercio-perfil.html?seccion=mercadopago');
    const boton = page.getByTestId('btn-desvincular-mercadopago');
    await expect(boton).toBeVisible();
    expect(await boton.getAttribute('class')).toContain('btn-peligro');
    expect(await boton.getAttribute('style')).toBeNull();
  });

  test('perfil del Empleado: menú reducido, datos operativos editables y acciones propias en Mi perfil @escritorio', async ({ page, request }) => {
    await abrirComoEmpleado(page, request, escenario);
    await page.goto('/comercio-perfil.html');
    await expect(page.getByTestId('menu-perfil-operativos')).toBeVisible();
    for (const clave of ['legales', 'equipo', 'mercadopago', 'password']) {
      await expect(page.getByTestId(`menu-perfil-${clave}`)).toHaveCount(0);
    }
    await expect(page.getByTestId('btn-editar-datos')).toBeVisible();
    await expect(page.getByTestId('btn-cambiar-cuenta')).toBeVisible();
    await page.getByTestId('menu-perfil-operativos').click();
    await expect(page.locator('#view-editar-datos-comercio')).toBeVisible();
    await page.getByTestId('menu-perfil-datos').click();
    await expect(page.locator('#view-datos-comercio')).toBeVisible();
  });

  test('equipo: pestañas horizontales y la acción de invitar con su ancho natural a la derecha @escritorio', async ({ page, request }) => {
    await dueno(page, request, '/comercio-perfil.html?seccion=equipo');
    await expect(page.getByTestId('equipo-tabs')).toBeVisible();
    const pestanas = page.getByTestId('equipo-tabs').locator('[role="tab"]');
    expect(await pestanas.count()).toBe(3);
    const invitar = await caja(page.getByTestId('btn-invitar-equipo'));
    expect(invitar.width).toBeLessThan(400);
    expect(invitar.x).toBeGreaterThan(900);
    await page.getByTestId('btn-invitar-equipo').click();
    await expect(page.getByTestId('titulo-invitar-equipo')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('estadísticas: cuatro cifras en una fila y gráfico de ancho real con barras proporcionadas @escritorio', async ({ page, request }) => {
    await dueno(page, request, '/comercio-estadisticas.html');
    await expect(page.locator('.estadisticas-cifra').first()).toBeVisible();
    const cifras = page.locator('.estadisticas-cifra');
    expect(await cifras.count()).toBe(4);
    const cajas = await Promise.all([0, 1, 2, 3].map((i) => caja(cifras.nth(i))));
    cajas.forEach((c) => expect(c.y).toBe(cajas[0].y));
    const grafico = await caja(page.locator('.estadisticas-grafico'));
    expect(grafico.width).toBeGreaterThan(900);
    const barra = await caja(page.locator('.estadisticas-barra').first());
    expect(barra.width).toBeGreaterThan(20);
    await expect(page.getByTestId('btn-nav-estadisticas')).toHaveAttribute('aria-current', 'page');
  });

  test('documentación: el botón de subir queda a la derecha y subir abre un diálogo centrado @escritorio', async ({ page, request }) => {
    await dueno(page, request, '/comercio-documentacion.html');
    const subir = page.getByTestId('btn-subir-documento');
    await expect(subir).toBeVisible();
    const cajaSubir = await caja(subir);
    expect(cajaSubir.width).toBeLessThan(400);
    expect(cajaSubir.x).toBeGreaterThan(900);
    await subir.click();
    const hoja = page.locator('.doc-hoja').first();
    await expect(hoja).toBeVisible();
    const cajaHoja = await caja(hoja);
    expect(cajaHoja.x + cajaHoja.width / 2).toBeGreaterThan(700);
    expect(cajaHoja.x + cajaHoja.width / 2).toBeLessThan(740);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('btn-nav-documentacion')).toHaveAttribute('aria-current', 'page');
  });

  test('pantallas de estado: pantalla partida con panel de marca y las acciones a la derecha @escritorio', async ({ page, request }) => {
    const pendiente = await registrarPendiente(request, escenario.adminToken, escenario.localidadId);
    const rechazado = await prepararRechazado(request, escenario.adminToken, escenario.localidadId);
    const definitivo = await registrarPendiente(request, escenario.adminToken, escenario.localidadId);
    await resolverComercio(request, escenario.adminToken, definitivo.comercioId, false, 'Rechazo definitivo de prueba', true);
    const casos: Array<[typeof pendiente, string, string]> = [
      [pendiente, `/comercio-pendiente.html?id=${pendiente.comercioId}`, 'Estamos revisando tu comercio.'],
      [rechazado, `/comercio-rechazado.html?id=${rechazado.comercioId}`, 'Tu solicitud necesita cambios.'],
      [definitivo, `/comercio-rechazo-definitivo.html?id=${definitivo.comercioId}`, 'No pudimos aprobar tu comercio.'],
    ];
    for (const [cuenta, url, titular] of casos) {
      const sesion = await login(request, cuenta.nombreUsuario, cuenta.password);
      const contexto = await page.context().browser()!.newContext({ viewport: { width: 1440, height: 900 } });
      const p = await contexto.newPage();
      await abrirComoUsuario(p, sesion);
      await p.goto(url);
      await expect(p.getByTestId('panel-marca-titular')).toHaveText(titular);
      const panel = await caja(p.getByTestId('panel-marca'));
      expect(panel.x).toBe(0);
      expect(panel.width).toBeGreaterThan(700);
      expect(panel.height).toBe(900);
      await expect(p.locator('#logout-btn')).toBeVisible();
      const cerrar = await caja(p.locator('#logout-btn'));
      expect(cerrar.x).toBeGreaterThan(panel.width);
      expect(cerrar.width).toBeLessThan(420);
      await sinScrollHorizontalEnAnchos(p, ANCHOS_ESCRITORIO);
      await contexto.close();
    }
  });

  test('agregar comercio: asistente con pasos al costado y acciones en los extremos @escritorio', async ({ page, request }) => {
    await dueno(page, request, '/agregar-comercio.html');
    await expect(page.getByTestId('paso-lateral-1')).toBeVisible();
    await expect(page.getByTestId('paso-lateral-1')).toHaveAttribute('data-estado', 'activo');
    const pasos = await caja(page.getByTestId('pasos-laterales'));
    expect(pasos.x).toBeLessThan(400);
    const campos = await caja(page.getByTestId('btn-agregar-foto-comercio'));
    expect(campos.x).toBeGreaterThan(pasos.x + pasos.width);
    const cancelar = await caja(page.getByTestId('btn-cancelar-asistente'));
    const continuar = await caja(page.getByTestId('btn-continuar'));
    expect(cancelar.x).toBeLessThan(continuar.x);
    expect(continuar.width).toBeLessThan(400);
    await expect(page.getByTestId('btn-salir-asistente')).toBeVisible();
    await expect(page.getByTestId('btn-volver')).toBeHidden();
    await page.getByTestId('btn-salir-asistente').click();
    await page.waitForURL('**/comercio-dashboard.html');
  });

  test('corregir solicitud: el mismo asistente con los pasos de la corrección y "Salir" @escritorio', async ({ page, request }) => {
    const rechazado = await prepararRechazado(request, escenario.adminToken, escenario.localidadId);
    const sesion = await login(request, rechazado.nombreUsuario, rechazado.password);
    await abrirComoUsuario(page, sesion);
    await page.goto(`/comercio-corregir.html?id=${rechazado.comercioId}`);
    await expect(page.getByTestId('pasos-laterales')).toBeVisible();
    expect(await page.getByTestId('pasos-laterales').locator('li').count()).toBeGreaterThanOrEqual(3);
    await expect(page.getByTestId('btn-cancelar-asistente')).toBeVisible();
    await expect(page.getByTestId('btn-salir-asistente')).toBeVisible();
    await expect(page.getByTestId('badge-intento')).toBeVisible();
    await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
  });

  test('avisos y consultas usan el shell lateral en el contexto del comercio @escritorio', async ({ page, request }) => {
    await dueno(page, request, '/notificaciones.html');
    await expect(page.getByTestId('btn-nav-avisos')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('btn-marcar-todas-leidas')).toBeVisible();
    await page.goto('/mis-consultas.html');
    await expect(page.getByTestId('btn-nav-perfil')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('btn-nueva-consulta')).toBeVisible();
    await tieneAnilloDeFoco(page.getByTestId('btn-nueva-consulta'));
  });
});
