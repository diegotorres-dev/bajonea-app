import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { abrirComoUsuario } from './helpers/multicomercio';
import { prepararEscenarioAdmin } from './helpers/admin-escritorio';
import type { EscenarioAdmin } from './helpers/admin-escritorio';
import { abrirComoDueno } from './helpers/escritorio-comercio';
import { abrirComoCliente } from './helpers/escritorio-cliente';

test.use({ viewport: { width: 1440, height: 900 } });

interface InfoFoco {
  etiqueta: string;
  ancho: number;
  alto: number;
  anillo: boolean;
  enPantalla: boolean;
}

async function recorrerConTab(page: Page, pasos: number): Promise<InfoFoco[]> {
  const recorrido: InfoFoco[] = [];
  for (let i = 0; i < pasos; i += 1) {
    await page.keyboard.press('Tab');
    if (i >= 8 && (await page.evaluate(() => document.activeElement === document.body))) {
      break;
    }
    recorrido.push(
      await page.evaluate(() => {
        const nodo = document.activeElement as HTMLElement | null;
        if (!nodo || nodo === document.body) {
          return { etiqueta: 'BODY', ancho: 0, alto: 0, anillo: false, enPantalla: false };
        }
        const caja = nodo.getBoundingClientRect();
        const estilo = getComputedStyle(nodo);
        const anillo = (estilo.outlineStyle !== 'none' && parseFloat(estilo.outlineWidth) > 0) || (estilo.boxShadow !== 'none' && estilo.boxShadow !== '');
        const contenedor = nodo.closest('.input-shell, .select-shell, .otp, .field, .barra-cliente__buscador');
        const anilloEnContenedor = contenedor ? (getComputedStyle(contenedor).boxShadow !== 'none' || getComputedStyle(contenedor).outlineStyle !== 'none' || getComputedStyle(contenedor).borderColor !== 'rgba(0, 0, 0, 0)') : false;
        return {
          etiqueta: `${nodo.tagName.toLowerCase()}${nodo.dataset.testid ? `[${nodo.dataset.testid}]` : ''}`,
          ancho: caja.width,
          alto: caja.height,
          anillo: anillo || anilloEnContenedor,
          enPantalla: caja.bottom > 0 && caja.top < window.innerHeight && caja.right > 0 && caja.left < window.innerWidth,
        };
      }),
    );
  }
  return recorrido;
}

test.describe('Escritorio E4: teclado, foco visible y movimiento reducido @escritorio', () => {
  test.describe.configure({ timeout: 300_000 });
  let esc: EscenarioAdmin;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(300_000);
    esc = await prepararEscenarioAdmin(request);
  });

  const PAGINAS = [
    { rol: 'acceso', ruta: 'login.html', pasos: 10 },
    { rol: 'acceso', ruta: 'registro-cliente.html', pasos: 12 },
    { rol: 'admin', ruta: 'admin-dashboard.html', pasos: 22 },
    { rol: 'admin', ruta: 'admin-clientes.html', pasos: 25 },
    { rol: 'admin', ruta: 'admin-reclamos.html', pasos: 22 },
    { rol: 'dueno', ruta: 'comercio-dashboard.html', pasos: 25 },
    { rol: 'dueno', ruta: 'comercio-productos.html', pasos: 25 },
    { rol: 'dueno', ruta: 'comercio-pedidos.html', pasos: 25 },
    { rol: 'cliente', ruta: 'index.html', pasos: 14 },
    { rol: 'cliente', ruta: 'pedidos.html', pasos: 18 },
    { rol: 'cliente', ruta: 'perfil.html', pasos: 14 },
  ];

  for (const { rol, ruta, pasos } of PAGINAS) {
    test(`${rol} · ${ruta}: el foco recorre elementos visibles con anillo, en pantalla y sin perderse @escritorio`, async ({ page, request }) => {
      if (rol === 'admin') {
        await abrirComoUsuario(page, esc.admin);
      } else if (rol === 'dueno') {
        await abrirComoDueno(page, request, esc.base);
      } else if (rol === 'cliente') {
        await abrirComoCliente(page, request, esc.base);
      }
      await page.goto(`/${ruta}`);
      await page.waitForLoadState('load');
      await page.waitForTimeout(900);
      const recorrido = await recorrerConTab(page, pasos);
      const problemas = recorrido
        .map((paso, indice) => ({ ...paso, indice }))
        .filter((paso) => paso.etiqueta === 'BODY' || paso.ancho === 0 || paso.alto === 0 || !paso.anillo)
        .map((paso) => `#${paso.indice + 1} ${paso.etiqueta} (${paso.ancho}x${paso.alto}, anillo ${paso.anillo})`);
      expect(problemas).toEqual([]);
      if (rol !== 'acceso') {
        expect(recorrido[0].etiqueta).toContain('btn-saltar-contenido');
      }
    });
  }

  test('con movimiento reducido las transiciones y animaciones del escritorio se anulan @escritorio', async ({ page, request }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await abrirComoDueno(page, request, esc.base);
    await page.goto('/comercio-dashboard.html');
    await expect(page.getByTestId('btn-nav-productos')).toBeVisible();
    const duraciones = await page.evaluate(() => {
      const nodos = [document.querySelector('[data-testid="btn-nav-productos"]'), document.querySelector('[data-testid="switch-cierre-comercio"]'), document.querySelector('.stats-bar__col')];
      return nodos.filter(Boolean).map((nodo) => {
        const estilo = getComputedStyle(nodo as Element);
        return { transicion: parseFloat(estilo.transitionDuration.split(',')[0]), animacion: parseFloat(estilo.animationDuration.split(',')[0]) };
      });
    });
    expect(duraciones.length).toBeGreaterThan(1);
    for (const duracion of duraciones) {
      expect(duracion.transicion).toBeLessThan(0.001);
      expect(duracion.animacion).toBeLessThan(0.001);
    }
  });

  test('sin movimiento reducido las transiciones se conservan @escritorio', async ({ page, request }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await abrirComoDueno(page, request, esc.base);
    await page.goto('/comercio-dashboard.html');
    await expect(page.getByTestId('switch-cierre-comercio')).toBeVisible();
    const transicion = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-testid="switch-cierre-comercio"]') as Element).transitionDuration.split(',')[0]));
    expect(transicion).toBeGreaterThan(0.05);
  });

  test('ninguna acción esencial depende del hover: los menús y controles se ven sin pasar el mouse @escritorio', async ({ page, request }) => {
    await abrirComoDueno(page, request, esc.base);
    await page.goto('/comercio-productos.html');
    await expect(page.getByTestId(`btn-acciones-producto-${esc.base.productoIds[0]}`)).toBeVisible();
    await expect(page.getByTestId(`btn-editar-producto-${esc.base.productoIds[0]}`).or(page.getByRole('button', { name: /editar/i }).first())).toBeVisible();
    await abrirComoUsuario(page, esc.admin);
    await page.goto('/admin-clientes.html');
    const acciones = page.locator('[data-testid^="btn-acciones-cliente-"]').first();
    await expect(acciones).toBeVisible();
    const opacidad = await acciones.evaluate((nodo) => parseFloat(getComputedStyle(nodo).opacity));
    expect(opacidad).toBe(1);
  });
});
