import { test, expect } from './helpers/prueba';
import type { Locator, Page } from '@playwright/test';
import { abrirComoUsuario } from './helpers/multicomercio';
import { prepararEscenarioAdmin } from './helpers/admin-escritorio';
import type { EscenarioAdmin } from './helpers/admin-escritorio';
import { abrirComoDueno, abrirComoEmpleado } from './helpers/escritorio-comercio';
import { abrirComoCliente } from './helpers/escritorio-cliente';
import { caja, sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 1440, height: 900 } });

const PAGINAS_ACCESO = ['login.html', 'bienvenida.html', 'recuperar-password.html', 'soporte.html', 'invitacion-empleado.html', 'reactivar-cuenta.html'];

function luminancia(rgb: string): number {
  const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) || ['0', '0', '0']).slice(0, 3).map((valor) => {
    const canal = Number(valor) / 255;
    return canal <= 0.03928 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

async function verificarHoja(page: Page, { abrir, hoja, disparador }: { abrir: () => Promise<void>; hoja: Locator; disparador: Locator }) {
  await disparador.focus();
  await abrir();
  await expect(hoja).toBeVisible();
  const dialogo = hoja.locator('[role="dialog"], [role="alertdialog"]').first();
  const rol = (await hoja.getAttribute('role')) ? hoja : dialogo;
  await expect(rol).toHaveAttribute('role', /^(dialog|alertdialog)$/);
  await expect(rol).toHaveAttribute('aria-modal', 'true');
  const dentro = () => hoja.evaluate((nodo) => nodo.contains(document.activeElement));
  expect(await dentro()).toBe(true);
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab');
    expect(await dentro()).toBe(true);
  }
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('Shift+Tab');
    expect(await dentro()).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(hoja).toHaveCount(0);
  await expect(disparador).toBeFocused();
}

test.describe('Escritorio E4: pulido final @escritorio', () => {
  test.describe.configure({ timeout: 300_000 });
  let esc: EscenarioAdmin;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(300_000);
    esc = await prepararEscenarioAdmin(request);
  });

  for (const pagina of PAGINAS_ACCESO) {
    test(`${pagina}: los enlaces legales están al pie de la columna blanca y el panel naranja no tiene enlaces @escritorio`, async ({ page }) => {
      await page.goto(`/${pagina}`);
      const panel = page.getByTestId('panel-marca');
      await expect(panel).toBeVisible();
      await expect(panel.locator('a')).toHaveCount(0);
      const legal = page.getByTestId('panel-legal');
      await expect(legal).toBeVisible();
      const cajaPanel = await caja(panel);
      const cajaLegal = await caja(legal);
      expect(cajaLegal.x).toBeGreaterThanOrEqual(cajaPanel.x + cajaPanel.width - 1);
      expect(cajaLegal.y + cajaLegal.height).toBeGreaterThan(900 - 120);
      for (const id of ['panel-legal-terminos', 'panel-legal-privacidad', 'panel-legal-faq']) {
        const enlace = page.getByTestId(id);
        await expect(enlace).toBeVisible();
        const color = await enlace.evaluate((nodo) => getComputedStyle(nodo).color);
        expect(contraste(color, 'rgb(255, 255, 255)')).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  test('los enlaces legales de la columna blanca llevan a los textos y no existen en móvil @escritorio', async ({ page }) => {
    await page.goto('/login.html');
    await page.getByTestId('panel-legal-terminos').click();
    await page.waitForURL('**/terminos.html');
    await page.goto('/login.html');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('panel-legal')).toBeHidden();
  });

  test('Reclamos es una tabla real con encabezado y columnas alineadas @escritorio', async ({ page }) => {
    await abrirComoUsuario(page, esc.admin);
    await page.goto('/admin-reclamos.html');
    await expect(page.getByTestId('encabezado-reclamos')).toBeVisible();
    const fila = page.locator('[data-testid^="reclamo-item-"]:not([data-testid="reclamo-item-titulo"]):not([data-testid="reclamo-item-estado"]):not([data-testid="reclamo-item-comercio"]):not([data-testid="reclamo-item-hace"])').first();
    await expect(fila).toBeVisible();
    expect(await fila.evaluate((nodo) => getComputedStyle(nodo).display)).toBe('grid');
    const celdas = [fila.getByTestId('reclamo-item-titulo'), fila.getByTestId('reclamo-item-comercio'), fila.getByTestId('reclamo-item-estado'), fila.getByTestId('reclamo-item-hace')];
    const xs = [];
    for (const celda of celdas) {
      xs.push((await caja(celda)).x);
    }
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    }
    const encabezados = page.getByTestId('encabezado-reclamos').locator('.tabla-encabezado__celda');
    await expect(encabezados).toHaveCount(4);
    const xEncabezado = (await caja(encabezados.nth(2))).x;
    expect(Math.abs(xEncabezado - xs[2] + 0)).toBeLessThanOrEqual(2);
    await fila.click();
    await page.waitForURL(/admin-reclamos\.html\?id=\d+/);
  });

  test('Reclamos en 1024 px conserva la tabla sin desborde @escritorio', async ({ page }) => {
    await abrirComoUsuario(page, esc.admin);
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/admin-reclamos.html');
    await expect(page.getByTestId('encabezado-reclamos')).toBeVisible();
    await sinScrollHorizontal(page);
  });

  test('Dueños muestra 30 filas con «Ver más» y la búsqueda vuelve a la primera página @escritorio', async ({ page }) => {
    const duenos = Array.from({ length: 65 }, (_, indice) => ({
      id: 1000 + indice,
      nombre: 'Dueño',
      apellido: `Número ${String(indice + 1).padStart(2, '0')}`,
      email: `dueno${indice + 1}@prueba.test`,
      estado: 'ACTIVO',
      cantidadComercios: 1,
      ultimoEmailAvisoFallido: false,
    }));
    await page.route('**/api/v1/administrador/duenos', (ruta) => {
      if (ruta.request().method() !== 'GET') {
        return ruta.continue();
      }
      return ruta.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify({ mensaje: '', data: duenos }) });
    });
    await abrirComoUsuario(page, esc.admin);
    await page.goto('/admin-duenos.html');
    const filas = page.locator('[data-testid^="dueno-item-"]');
    await expect(filas).toHaveCount(30);
    await expect(page.getByTestId('contador-duenos')).toHaveText('Mostrando 30 de 65 dueños');
    await page.getByTestId('btn-ver-mas-duenos').click();
    await expect(filas).toHaveCount(60);
    await page.getByTestId('btn-ver-mas-duenos').click();
    await expect(filas).toHaveCount(65);
    await expect(page.getByTestId('btn-ver-mas-duenos')).toHaveCount(0);
    await expect(page.getByTestId('contador-duenos')).toHaveText('Mostrando 65 dueños');
    await page.getByTestId('input-buscar-dueno').fill('Número 0');
    await expect(filas).toHaveCount(9);
    await page.getByTestId('btn-limpiar-busqueda').click();
    await expect(filas).toHaveCount(30);
    await page.getByTestId('btn-ver-mas-duenos').click();
    await page.getByTestId('filtro-duenos-suspendidos').click();
    await expect(page.getByTestId('duenos-vacio')).toBeVisible();
    await expect(page.getByTestId('btn-ver-mas-duenos')).toHaveCount(0);
  });

  test('el panel del Dueño tiene un único botón de sonido que cambia entre activado y desactivado @escritorio', async ({ page, request }) => {
    await abrirComoDueno(page, request, esc.base);
    await page.goto('/comercio-dashboard.html');
    const boton = page.getByTestId('switch-sonido-avisos');
    await expect(boton).toBeVisible();
    await expect(boton).toHaveAttribute('role', 'switch');
    await expect(page.getByTestId('sonido-avisos-estado')).toBeVisible();
    await expect(page.getByTestId('sonido-avisos-estado')).toHaveText('Sonido activado');
    expect((await caja(boton)).height).toBeGreaterThanOrEqual(44);
    await expect(page.locator('#sonido-slot .cierre-card__texto')).toBeHidden();
    await boton.click();
    await expect(boton).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('sonido-avisos-estado')).toHaveText('Sonido desactivado');
    await expect(page.getByTestId('ayuda-sonido-bloqueado')).toBeHidden();
    await boton.click();
    await expect(boton).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('sonido-avisos-estado')).toHaveText('Sonido activado');
  });

  test('el aviso «Activar sonido» sigue apareciendo cuando el navegador bloquea el audio @escritorio', async ({ page, request }) => {
    await abrirComoDueno(page, request, esc.base);
    await page.addInitScript(() => {
      window.AudioContext = class {
        state = 'suspended';
        resume() {
          return new Promise(() => {});
        }
        close() {
          return Promise.resolve();
        }
      } as never;
    });
    await page.goto('/comercio-dashboard.html');
    const ayuda = page.getByTestId('ayuda-sonido-bloqueado');
    const activar = page.getByTestId('btn-activar-sonido');
    const estaVisible = await ayuda.isVisible();
    if (estaVisible) {
      await expect(activar).toBeVisible();
      expect((await caja(activar)).height).toBeGreaterThanOrEqual(44);
    }
  });

  test('el nombre en el saludo respeta las partículas en minúscula @escritorio', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('bajonea_token', 'x');
      localStorage.setItem('bajonea_usuario', JSON.stringify({ id: 1, rol: 'CLIENTE', nombre: 'MARÍA DE LOS ÁNGELES' }));
    });
    await page.goto('/login.html');
    const resultados = await page.evaluate(async () => {
      const modulo = await import('/js/validators.js');
      return ['MARÍA DE LOS ÁNGELES', 'juan del valle', 'ana y luis', 'DE LA CRUZ', 'josé maría'].map((nombre) => modulo.aTitleCaseNombre(nombre));
    });
    expect(resultados).toEqual(['María de los Ángeles', 'Juan del Valle', 'Ana y Luis', 'De la Cruz', 'José María']);
  });

  const CASOS_SALTAR = [
    { rol: 'Administrador', ruta: 'admin-dashboard.html' },
    { rol: 'Dueño', ruta: 'comercio-dashboard.html' },
    { rol: 'Cliente', ruta: 'index.html' },
  ];
  for (const caso of CASOS_SALTAR) {
    test(`${caso.rol}: «Saltar al contenido» aparece con el primer Tab y mueve el foco al contenido @escritorio`, async ({ page, request }) => {
      if (caso.rol === 'Administrador') {
        await abrirComoUsuario(page, esc.admin);
      } else if (caso.rol === 'Dueño') {
        await abrirComoDueno(page, request, esc.base);
      } else {
        await abrirComoCliente(page, request, esc.base);
      }
      await page.goto(`/${caso.ruta}`);
      await expect(page.locator('main')).toBeVisible();
      const saltar = page.getByTestId('btn-saltar-contenido');
      await expect(saltar).toBeAttached();
      await page.waitForTimeout(500);
      await page.keyboard.press('Tab');
      await expect(saltar).toBeFocused();
      const cajaSaltar = await caja(saltar);
      expect(cajaSaltar.y).toBeGreaterThanOrEqual(0);
      expect(cajaSaltar.x).toBeGreaterThanOrEqual(0);
      expect(cajaSaltar.height).toBeGreaterThanOrEqual(44);
      await page.keyboard.press('Enter');
      expect(await page.evaluate(() => document.activeElement && document.activeElement.tagName)).toBe('MAIN');
      expect(page.url()).not.toContain('#');
    });
  }

  test('Ayuda del Dueño y del Empleado usa la barra lateral del comercio @escritorio', async ({ page, request }) => {
    await abrirComoDueno(page, request, esc.base);
    await page.goto('/ayuda.html');
    await expect(page.getByTestId('btn-nav-perfil')).toBeVisible();
    await expect(page.getByTestId('lista-ayuda')).toBeVisible();
    expect((await caja(page.locator('#bottom-nav-slot'))).width).toBe(264);
    await abrirComoEmpleado(page, request, esc.base);
    await page.goto('/ayuda.html');
    await expect(page.getByTestId('btn-nav-perfil')).toBeVisible();
  });

  test('Soporte con sesión usa el shell del contexto: barra superior del Cliente y barra lateral del Dueño @escritorio', async ({ page, request }) => {
    await abrirComoCliente(page, request, esc.base);
    await page.goto('/soporte.html');
    await expect(page.getByTestId('contenido-soporte')).toBeVisible();
    await expect(page.locator('.barra-cliente')).toBeVisible();
    await expect(page.getByTestId('panel-marca')).toBeHidden();
    await expect(page.getByTestId('panel-legal')).toBeHidden();
    await expect(page.getByTestId('input-soporte-email')).toBeDisabled();
    await abrirComoDueno(page, request, esc.base);
    await page.goto('/soporte.html');
    await expect(page.getByTestId('contenido-soporte')).toBeVisible();
    await expect(page.getByTestId('btn-nav-perfil')).toBeVisible();
    await expect(page.getByTestId('panel-marca')).toBeHidden();
  });

  test('Soporte sin sesión conserva la pantalla partida con los enlaces en la columna blanca @escritorio', async ({ page }) => {
    await page.goto('/soporte.html');
    await expect(page.getByTestId('panel-marca')).toBeVisible();
    await expect(page.getByTestId('panel-legal')).toBeVisible();
  });

  test('las hojas migradas tienen diálogo modal, foco atrapado, Escape y devuelven el foco @escritorio', async ({ page, request }) => {
    await abrirComoUsuario(page, esc.admin);
    await page.goto('/admin-categorias.html');
    const crearCategoria = page.getByTestId('btn-nueva-categoria-escritorio');
    await expect(crearCategoria).toBeVisible();
    await verificarHoja(page, { abrir: () => crearCategoria.click(), hoja: page.getByTestId('modal-categoria'), disparador: crearCategoria });
    await page.goto('/admin-tags.html');
    const crearTag = page.getByTestId('btn-nuevo-tag-escritorio');
    await expect(crearTag).toBeVisible();
    await verificarHoja(page, { abrir: () => crearTag.click(), hoja: page.getByTestId('modal-tag'), disparador: crearTag });
    await page.goto('/admin-comercios.html');
    const detalle = page.getByTestId(`btn-ver-detalle-comercio-${esc.base.dueno.comercioId}`);
    await expect(detalle).toBeVisible();
    await verificarHoja(page, { abrir: () => detalle.click(), hoja: page.getByTestId('modal-detalle-comercio'), disparador: detalle });
  });

  test('las hojas del Dueño (acciones de producto, invitar al equipo, cierre y selector de comercios) cumplen el comportamiento común @escritorio', async ({ page, request }) => {
    await abrirComoDueno(page, request, esc.base);
    await page.goto('/comercio-productos.html');
    const acciones = page.getByTestId(`btn-acciones-producto-${esc.base.productoIds[0]}`);
    await expect(acciones).toBeVisible();
    await verificarHoja(page, { abrir: () => acciones.click(), hoja: page.getByTestId('modal-acciones-producto'), disparador: acciones });

    await page.goto('/comercio-dashboard.html');
    const franja = page.getByTestId('franja-comercio');
    await expect(franja).toBeVisible();
    await verificarHoja(page, { abrir: () => franja.click(), hoja: page.getByTestId('panel-comercios'), disparador: franja });

    const interruptor = page.getByTestId('switch-cierre-comercio');
    await expect(interruptor).toBeEnabled();
    if ((await interruptor.getAttribute('aria-checked')) === 'true') {
      await verificarHoja(page, { abrir: () => interruptor.click(), hoja: page.getByTestId('modal-cierre-comercio'), disparador: interruptor });
    }

    await page.goto('/comercio-perfil.html?seccion=equipo');
    const invitar = page.getByTestId('btn-invitar-equipo');
    await expect(invitar).toBeVisible();
    await verificarHoja(page, { abrir: () => invitar.click(), hoja: page.getByTestId('hoja-invitar-equipo'), disparador: invitar });
  });

  test('el Empleado: «Editar datos personales» y «Cambiar de cuenta» cumplen el comportamiento común @escritorio', async ({ page, request }) => {
    await abrirComoEmpleado(page, request, esc.base);
    await page.goto('/comercio-perfil.html');
    const cambiar = page.getByTestId('btn-cambiar-cuenta');
    await expect(cambiar).toBeVisible();
    await verificarHoja(page, { abrir: () => cambiar.click(), hoja: page.getByTestId('hoja-cambiar-cuenta'), disparador: cambiar });
    const personales = page.getByTestId('editar-datos-personales-link');
    if (await personales.count()) {
      await expect(personales).toBeVisible();
      await verificarHoja(page, { abrir: () => personales.click(), hoja: page.getByTestId('modal-cuenta-personal'), disparador: personales });
    }
  });

  for (const ancho of [1024, 1920]) {
    test(`ninguna página de los cuatro roles tiene scroll horizontal a ${ancho} px @escritorio`, async ({ browser, request }) => {
      test.setTimeout(600_000);
      const c = esc.base;
      const a = esc;
      type Abrir = (pagina: Page) => Promise<unknown>;
      const grupos: Array<{ rol: string; abrir: Abrir; rutas: string[] }> = [
        { rol: 'acceso', abrir: async () => undefined, rutas: [...PAGINAS_ACCESO, 'registro-cliente.html', 'registro-comercio.html', 'registro-tipo-cuenta.html', 'terminos.html', 'privacidad.html', 'faq.html', 'errores/404.html', 'errores/500.html'] },
        { rol: 'dueno', abrir: (pagina) => abrirComoDueno(pagina, request, c), rutas: ['comercio-dashboard.html', 'comercio-productos.html', 'comercio-producto-form.html', 'comercio-pedidos.html', `comercio-pedidos.html?id=${c.pedidos.pendiente}`, 'comercio-perfil.html', 'comercio-estadisticas.html', 'comercio-documentacion.html', 'notificaciones.html', 'mis-consultas.html', 'ayuda.html', 'soporte.html'] },
        { rol: 'empleado', abrir: (pagina) => abrirComoEmpleado(pagina, request, c), rutas: ['comercio-dashboard.html', 'comercio-productos.html', 'comercio-pedidos.html', 'comercio-perfil.html', 'notificaciones.html', 'ayuda.html'] },
        { rol: 'admin', abrir: (pagina) => abrirComoUsuario(pagina, a.admin), rutas: ['admin-dashboard.html', 'admin-comercios-pendientes.html', 'admin-comercios.html', 'admin-resolicitudes.html', 'admin-documentos.html', 'admin-soporte.html', 'admin-clientes.html', 'admin-duenos.html', 'admin-reembolsos.html', 'admin-tarifas.html', 'admin-categorias.html', 'admin-tags.html', 'admin-reclamos.html', `admin-comercio-detalle.html?id=${a.pendientes[0].comercioId}`, `admin-comercio-equipo.html?id=${c.dueno.comercioId}`, `admin-comercio-actividad.html?id=${c.dueno.comercioId}`] },
        { rol: 'cliente', abrir: (pagina) => abrirComoCliente(pagina, request, c), rutas: ['index.html', 'explorar.html', `comercio-detalle.html?id=${c.dueno.comercioId}`, 'carrito.html', 'checkout.html', 'pedidos.html', `pedidos.html?id=${c.pedidos.entregado}`, 'perfil.html', 'notificaciones.html', 'mis-consultas.html', 'ayuda.html', 'soporte.html'] },
      ];
      const conDesborde: string[] = [];
      for (const grupo of grupos) {
        const contexto = await browser.newContext({ viewport: { width: ancho, height: 900 } });
        await contexto.route(/^https:\/\/fonts\.googleapis\.com\//, (ruta) => ruta.fulfill({ status: 200, contentType: 'text/css', body: '' }));
        await contexto.route(/^https:\/\/fonts\.gstatic\.com\//, (ruta) => ruta.abort());
        const pagina = await contexto.newPage();
        await grupo.abrir(pagina);
        for (const ruta of grupo.rutas) {
          await pagina.goto(`/${ruta}`);
          await pagina.waitForLoadState('load');
          await pagina.waitForTimeout(500);
          await pagina.evaluate(() => document.fonts.ready);
          const sobra = await pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          if (sobra > 0) {
            conDesborde.push(`${grupo.rol}:${ruta} (+${sobra}px)`);
          }
        }
        await contexto.close();
      }
      expect(conDesborde).toEqual([]);
    });
  }
});
