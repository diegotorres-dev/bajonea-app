import { test, expect } from './helpers/prueba';
import type { Locator, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  crearCategoria,
  crearProducto,
  crearTag,
  fijarPasswordAdminYLoguear,
  login,
  marcarAptoVenta,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sufijoUnico,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { abrirComoUsuario, prepararAprobado } from './helpers/multicomercio';

test.use({ viewport: { width: 375, height: 812 } });

interface MedidaTactil {
  ancho: number;
  alto: number;
  areaAlta: boolean;
  areaAncha: boolean;
}

async function medirArea(elemento: Locator): Promise<MedidaTactil> {
  await elemento.scrollIntoViewIfNeeded();
  return elemento.evaluate((el) => {
    const caja = el.getBoundingClientRect();
    const cx = caja.left + caja.width / 2;
    const cy = caja.top + caja.height / 2;
    const dentro = (x: number, y: number) => document.elementsFromPoint(x, y).some((nodo) => nodo === el || el.contains(nodo));
    return {
      ancho: caja.width,
      alto: caja.height,
      areaAlta: caja.height >= 43.5 || (dentro(cx, cy - 21.5) && dentro(cx, cy + 21.5)),
      areaAncha: caja.width >= 43.5 || (dentro(cx - 21.5, cy) && dentro(cx + 21.5, cy)),
    };
  });
}

async function esperarAreaDe44(elemento: Locator) {
  await expect(elemento).toBeVisible();
  const medida = await medirArea(elemento);
  expect(medida.areaAlta, `alto ${medida.alto}`).toBe(true);
  expect(medida.areaAncha, `ancho ${medida.ancho}`).toBe(true);
}

const SELECTOR_INTERACTIVOS = 'button, a[href], select, input:not([type="hidden"]):not([type="file"]), [role="button"], [role="switch"]';
const FAMILIAS_CLAVE = ['app-header__back', 'input-shell__toggle', 'top-bar__action', 'chip'];

interface Incumplimiento {
  pagina: string;
  testid: string | null;
  clase: string;
  texto: string;
  ancho: number;
  alto: number;
}

async function barrer(page: Page, nombrePagina: string): Promise<Incumplimiento[]> {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(
    ([selector, pagina]) => {
      const resultado: Array<{ pagina: string; testid: string | null; clase: string; texto: string; ancho: number; alto: number }> = [];
      document.querySelectorAll(selector).forEach((el) => {
        let caja = el.getBoundingClientRect();
        if (caja.width === 0 || caja.height === 0) return;
        const estilo = window.getComputedStyle(el);
        if (estilo.visibility === 'hidden' || estilo.display === 'none') return;
        const envoltura = el.closest('.input-shell, .search-shell, .select-shell, .textarea-shell');
        if (el.tagName !== 'BUTTON' && el.tagName !== 'A' && envoltura && envoltura.getBoundingClientRect().height >= 43.5) return;
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        caja = el.getBoundingClientRect();
        if ((el as HTMLInputElement).type === 'checkbox' || (el as HTMLInputElement).type === 'radio') {
          const etiqueta = el.closest('label');
          if (etiqueta) return;
        }
        const cx = caja.left + caja.width / 2;
        const cy = caja.top + caja.height / 2;
        const dentro = (x: number, y: number) => document.elementsFromPoint(x, y).some((nodo) => nodo === el || el.contains(nodo));
        const alto = caja.height >= 43.5 || (dentro(cx, cy - 21.5) && dentro(cx, cy + 21.5));
        const ancho = caja.width >= 43.5 || (dentro(cx - 21.5, cy) && dentro(cx + 21.5, cy));
        if (alto && ancho) return;
        resultado.push({
          pagina: pagina as string,
          testid: el.getAttribute('data-testid'),
          clase: typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className : '',
          texto: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40),
          ancho: Math.round(caja.width * 10) / 10,
          alto: Math.round(caja.height * 10) / 10,
        });
      });
      return resultado;
    },
    [SELECTOR_INTERACTIVOS, nombrePagina] as const,
  );
}

test.describe('Pulido P1b: zonas táctiles de 44 px (T09)', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  let cliente: SesionApi;
  let dueno: Dueno;
  let adminSesion: SesionApi;
  let tagId: number;

  test.beforeAll(async ({ request }) => {
    adminSesion = await fijarPasswordAdminYLoguear(request);
    const localidadId = await obtenerLocalidadRioGrande(request);
    const categoriaId = await crearCategoria(request, adminSesion.token, `Cat Tactil ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminSesion.token, localidadId, false);
    await marcarAptoVenta(request, dueno.comercioId);
    await crearProducto(request, dueno.token, { nombre: `Producto Tactil ${sufijoUnico()}`, precio: 10000, categoriaId });
    tagId = await crearTag(request, adminSesion.token, `Tag Tactil ${sufijoUnico().slice(-6)}`);
    const datos = await registrarYVerificarCliente(request, localidadId);
    cliente = await login(request, datos.nombreUsuario, datos.password);
  });

  test('el ojo de la contraseña del login tiene un área de 44 × 44 px', async ({ page }) => {
    await page.goto('/login.html');
    await esperarAreaDe44(page.getByTestId('btn-mostrar-password'));
  });

  test('el ojo no deforma la caja de la contraseña ni mueve el texto', async ({ page }) => {
    await page.goto('/login.html');
    const caja = await page.locator('#shell-password').boundingBox();
    expect(caja!.height).toBeLessThanOrEqual(52.5);
    const toggle = await page.getByTestId('btn-mostrar-password').boundingBox();
    expect(toggle!.x + toggle!.width).toBeLessThanOrEqual(caja!.x + caja!.width + 0.5);
  });

  test('los chips del catálogo tienen un área de 44 px de alto', async ({ page }) => {
    await abrirComoUsuario(page, cliente);
    await page.goto('/index.html');
    for (const chip of ['chip-filtro-todos', 'chip-filtro-delivery', 'chip-filtro-retiro', 'chip-filtro-abierto']) {
      await esperarAreaDe44(page.getByTestId(chip));
    }
  });

  test('la campana de la cabecera tiene un área de 44 × 44 px', async ({ page }) => {
    await abrirComoUsuario(page, cliente);
    await page.goto('/index.html');
    await esperarAreaDe44(page.getByTestId('btn-notificaciones'));
  });

  test('el botón volver de la cabecera de Mis pedidos tiene un área de 44 × 44 px', async ({ page }) => {
    await abrirComoUsuario(page, cliente);
    await page.goto('/pedidos.html');
    await esperarAreaDe44(page.getByTestId('btn-volver'));
  });

  test('el botón volver de las pantallas del Administrador tiene un área de 44 × 44 px', async ({ page }) => {
    await abrirComoUsuario(page, adminSesion);
    await page.goto('/admin-clientes.html');
    await esperarAreaDe44(page.getByTestId('btn-volver'));
  });

  test('los chips de etiquetas del formulario de producto (filas con salto de línea) tienen un área de 44 px de alto', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit no soporta overflow-clip-margin: ahí el área de estos chips queda en su alto visual');
    await abrirComoUsuario(page, dueno.sesion);
    await page.goto('/comercio-producto-form.html');
    await esperarAreaDe44(page.getByTestId(`chip-tag-producto-${tagId}`));
  });

  test('barrido: ningún elemento de las familias clave queda por debajo de 44 px en las pantallas principales', async ({ page }) => {
    const incumplimientos: Incumplimiento[] = [];
    const paginasPublicas = ['/login.html', '/registro-tipo-cuenta.html', '/recuperar-password.html'];
    for (const ruta of paginasPublicas) {
      await page.goto(ruta);
      await page.waitForLoadState('networkidle');
      incumplimientos.push(...(await barrer(page, ruta)));
    }

    const comoCliente = ['/index.html', '/explorar.html', '/carrito.html', '/pedidos.html', '/perfil.html', '/notificaciones.html'];
    await abrirComoUsuario(page, cliente);
    for (const ruta of comoCliente) {
      await page.goto(ruta);
      await page.waitForLoadState('networkidle');
      incumplimientos.push(...(await barrer(page, `cliente ${ruta}`)));
    }

    const comoDueno = ['/comercio-dashboard.html', '/comercio-productos.html', '/comercio-pedidos.html', '/comercio-perfil.html'];
    const paginaDueno = await page.context().newPage();
    await abrirComoUsuario(paginaDueno, dueno.sesion);
    for (const ruta of comoDueno) {
      await paginaDueno.goto(ruta);
      await paginaDueno.waitForLoadState('networkidle');
      incumplimientos.push(...(await barrer(paginaDueno, `dueño ${ruta}`)));
    }

    const comoAdmin = ['/admin-dashboard.html', '/admin-comercios.html', '/admin-clientes.html'];
    const paginaAdmin = await page.context().newPage();
    await abrirComoUsuario(paginaAdmin, adminSesion);
    for (const ruta of comoAdmin) {
      await paginaAdmin.goto(ruta);
      await paginaAdmin.waitForLoadState('networkidle');
      incumplimientos.push(...(await barrer(paginaAdmin, `admin ${ruta}`)));
    }

    const carpeta = path.resolve(__dirname, '../reportes');
    fs.mkdirSync(carpeta, { recursive: true });
    fs.writeFileSync(path.join(carpeta, 'barrido-tactil-p1b.json'), JSON.stringify(incumplimientos, null, 2));

    const enFamiliasClave = incumplimientos.filter((item) => FAMILIAS_CLAVE.some((familia) => item.clase.split(/\s+/).includes(familia)));
    expect(enFamiliasClave, JSON.stringify(enFamiliasClave, null, 2)).toEqual([]);
  });
});
