import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';

type Rol = 'ADMINISTRADOR' | 'DUENO' | 'CLIENTE';

async function conSesionSimulada(page: Page, rol: Rol, empleadoDe: number | null = null) {
  await page.addInitScript(
    ([rolSesion, comercioId]) => {
      localStorage.setItem('bajonea_token', 'token-de-prueba');
      localStorage.setItem('bajonea_usuario', JSON.stringify({ id: 7, rol: rolSesion, nombre: 'Prueba' }));
      if (comercioId) {
        sessionStorage.setItem('bajonea_contexto', JSON.stringify({ tipo: 'EMPLEADO', comercioId, usuarioId: 7 }));
      }
    },
    [rol, empleadoDe] as [string, number | null],
  );
}

async function huboBeforeUnloadPrevenido(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const evento = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(evento);
    return evento.defaultPrevented;
  });
}

test.describe('Acceso: descartar un registro a medias (P01)', () => {
  async function abrirRegistroCliente(page: Page) {
    await page.goto('/registro-tipo-cuenta.html');
    await page.goto('/registro-cliente.html');
    await expect(page.getByTestId('input-nombre')).toBeVisible();
  }

  test('sin datos cargados, «Volver» del primer paso sale sin preguntar y la pestaña no avisa', async ({ page }) => {
    await abrirRegistroCliente(page);
    expect(await huboBeforeUnloadPrevenido(page)).toBe(false);
    await page.getByTestId('btn-volver').click();
    await page.waitForURL('**/registro-tipo-cuenta.html');
    await expect(page.getByTestId('modal-descartar-registro')).toHaveCount(0);
  });

  test('con datos cargados, «Volver» pregunta; «Seguir editando» conserva lo escrito y «Descartar» sale', async ({ page }) => {
    await abrirRegistroCliente(page);
    await page.getByTestId('input-nombre').fill('Julieta');
    await page.getByTestId('btn-volver').click();

    const hoja = page.getByTestId('modal-descartar-registro');
    await expect(hoja).toBeVisible();
    await expect(hoja.getByRole('heading', { name: '¿Descartar los cambios?' })).toBeVisible();
    await expect(page.getByTestId('btn-seguir-editando-registro')).toBeFocused();

    await page.getByTestId('btn-seguir-editando-registro').click();
    await expect(hoja).toHaveCount(0);
    await expect(page.getByTestId('input-nombre')).toHaveValue('Julieta');
    expect(page.url()).toContain('registro-cliente.html');

    await page.getByTestId('btn-volver').click();
    await page.getByTestId('btn-descartar-registro').click();
    await page.waitForURL('**/registro-tipo-cuenta.html');
  });

  test('«Cancelar» del registro de Cliente también pregunta cuando hay datos @escritorio', async ({ page }) => {
    await abrirRegistroCliente(page);
    await page.getByTestId('input-apellido').fill('Pérez');
    await page.getByTestId('btn-cancelar-registro').click();
    await expect(page.getByTestId('modal-descartar-registro')).toBeVisible();
    await page.getByTestId('btn-seguir-editando-registro').click();
    await page.getByTestId('btn-cancelar-registro').click();
    await page.getByTestId('btn-descartar-registro').click();
    await page.waitForURL('**/registro-tipo-cuenta.html');
  });

  test('con datos cargados, cerrar o recargar la pestaña dispara el aviso del navegador', async ({ page }) => {
    await abrirRegistroCliente(page);
    expect(await huboBeforeUnloadPrevenido(page)).toBe(false);
    await page.getByTestId('input-nombre').fill('Julieta');
    expect(await huboBeforeUnloadPrevenido(page)).toBe(true);
  });

  test('un enlace del pie que saca de la pantalla también pregunta cuando hay datos', async ({ page }) => {
    await abrirRegistroCliente(page);
    await page.getByTestId('legal-pie-terminos').click();
    await page.waitForURL('**/terminos.html');
    await page.goBack();
    await expect(page.getByTestId('input-nombre')).toBeVisible();
    await page.getByTestId('input-nombre').fill('Julieta');
    await page.getByTestId('legal-pie-terminos').click();
    await expect(page.getByTestId('modal-descartar-registro')).toBeVisible();
    expect(page.url()).toContain('registro-cliente.html');
  });

  test('registro de Comercio: con datos en el primer paso, «Volver» pregunta; sin datos no', async ({ page }) => {
    await page.goto('/registro-tipo-cuenta.html');
    await page.goto('/registro-comercio.html');
    await expect(page.getByTestId('input-nombre')).toBeVisible();
    expect(await huboBeforeUnloadPrevenido(page)).toBe(false);

    await page.getByTestId('input-nombre').fill('Pizzería de prueba');
    expect(await huboBeforeUnloadPrevenido(page)).toBe(true);
    await page.getByTestId('btn-volver').click();
    await expect(page.getByTestId('modal-descartar-registro')).toBeVisible();
    await page.getByTestId('btn-seguir-editando-registro').click();
    await expect(page.getByTestId('input-nombre')).toHaveValue('Pizzería de prueba');
    await page.getByTestId('btn-volver').click();
    await page.getByTestId('btn-descartar-registro').click();
    await page.waitForURL('**/registro-tipo-cuenta.html');
  });

  test('registro de Comercio: «Cancelar» del primer paso pregunta cuando hay datos @escritorio', async ({ page }) => {
    await page.goto('/registro-tipo-cuenta.html');
    await page.goto('/registro-comercio.html');
    await page.getByTestId('input-nombre').fill('Pizzería de prueba');
    await page.getByTestId('btn-cancelar-registro').click();
    await expect(page.getByTestId('modal-descartar-registro')).toBeVisible();
    await page.getByTestId('btn-descartar-registro').click();
    await page.waitForURL('**/registro-tipo-cuenta.html');
  });

  test('en escritorio, «Salir del registro» pregunta cuando hay datos @escritorio', async ({ page }) => {
    await page.goto('/registro-tipo-cuenta.html');
    await page.goto('/registro-cliente.html');
    await expect(page.getByTestId('btn-salir-registro')).toBeVisible();
    await page.getByTestId('btn-salir-registro').click();
    await page.waitForURL('**/registro-tipo-cuenta.html');

    await page.goto('/registro-cliente.html');
    await page.getByTestId('input-nombre').fill('Julieta');
    await page.getByTestId('btn-salir-registro').click();
    const hoja = page.getByTestId('modal-descartar-registro');
    await expect(hoja).toBeVisible();
    const caja = await hoja.locator('.modal-sheet').boundingBox();
    expect(caja).not.toBeNull();
    expect(caja!.x).toBeGreaterThan(200);
    await page.keyboard.press('Escape');
    await expect(hoja).toHaveCount(0);
    expect(page.url()).toContain('registro-cliente.html');
    await page.getByTestId('btn-salir-registro').click();
    await page.getByTestId('btn-descartar-registro').click();
    await page.waitForURL('**/registro-tipo-cuenta.html');
  });
});

test.describe('Acceso: el splash no hace esperar a quien ya inició sesión (P02)', () => {
  async function medirSalto(page: Page, destino: string) {
    let inicio = 0;
    let fin = 0;
    await page.route('**/splash.html', async (ruta) => {
      inicio = Date.now();
      await ruta.continue();
    });
    await page.route(`**/${destino}`, async (ruta) => {
      fin = Date.now();
      await ruta.abort();
    });
    page.goto('/splash.html').catch(() => undefined);
    await expect.poll(() => fin, { timeout: 5000 }).toBeGreaterThan(0);
    return fin - inicio;
  }

  test('con sesión de Cliente redirige de inmediato', async ({ page }) => {
    await conSesionSimulada(page, 'CLIENTE');
    const espera = await medirSalto(page, 'index.html');
    expect(espera).toBeLessThan(700);
  });

  test('con sesión de Administrador redirige de inmediato a su panel', async ({ page }) => {
    await conSesionSimulada(page, 'ADMINISTRADOR');
    const espera = await medirSalto(page, 'admin-dashboard.html');
    expect(espera).toBeLessThan(700);
  });

  test('sin sesión (primera visita) conserva la pantalla de carga y va a la bienvenida', async ({ page }) => {
    const espera = await medirSalto(page, 'bienvenida.html');
    expect(espera).toBeGreaterThanOrEqual(850);
  });
});

test.describe('Acceso: verificar email dice que el código vence y espera entre reenvíos (P03)', () => {
  test('con el email en la URL el texto avisa que el código vence', async ({ page }) => {
    await page.goto('/verificar-email.html?email=prueba%40bajonea.test');
    const texto = page.locator('#verificar-texto');
    await expect(texto).toContainText('prueba@bajonea.test');
    await expect(texto).toContainText('vence');
    await expect(texto).toContainText('pedí uno nuevo');
    await expect(texto).not.toContainText(/\d+ (minutos|horas)/);
  });

  test('sin el email en la URL el texto también avisa que el código vence', async ({ page }) => {
    await page.goto('/verificar-email.html');
    await expect(page.locator('#verificar-texto')).toContainText('vence');
  });

  test('«Reenviar código» queda en espera con cuenta regresiva y se habilita solo', async ({ page }) => {
    let llamadas = 0;
    await page.route('**/api/v1/auth/reenviar-verificacion', async (ruta) => {
      llamadas += 1;
      await ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mensaje: 'ok', data: null }) });
    });
    await page.clock.install();
    await page.goto('/verificar-email.html?email=prueba%40bajonea.test');
    const boton = page.getByTestId('btn-reenviar-codigo');
    await expect(boton).toHaveText('Reenviar código');
    await expect(boton).toBeEnabled();

    await boton.click();
    await expect(page.getByTestId('mensaje-banner')).toContainText('Te enviamos un nuevo código.');
    await expect(boton).toBeDisabled();
    await expect(boton).toHaveText(/^Reenviar código \(\d+ s\)$/);
    expect(llamadas).toBe(1);

    await page.clock.runFor(10_000);
    await expect(boton).toHaveText(/^Reenviar código \((1[5-9]|2[01]) s\)$/);
    await boton.click({ force: true });
    expect(llamadas).toBe(1);

    await page.clock.runFor(21_000);
    await expect(boton).toBeEnabled();
    await expect(boton).toHaveText('Reenviar código');
  });

  test('si el reenvío falla no se bloquea el botón', async ({ page }) => {
    await page.route('**/api/v1/auth/reenviar-verificacion', async (ruta) => {
      await ruta.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ mensaje: 'No se pudo reenviar', data: null }) });
    });
    await page.goto('/verificar-email.html?email=prueba%40bajonea.test');
    await page.getByTestId('btn-reenviar-codigo').click();
    await expect(page.getByTestId('mensaje-banner')).toContainText('No se pudo reenviar');
    await expect(page.getByTestId('btn-reenviar-codigo')).toBeEnabled();
    await expect(page.getByTestId('btn-reenviar-codigo')).toHaveText('Reenviar código');
  });
});

test.describe('Acceso: «Volver al inicio» de las páginas de error resuelve el destino por rol (P04)', () => {
  const paginas = ['404', '500', 'acceso-denegado', 'sin-conexion', 'timeout'];

  for (const pagina of paginas) {
    test(`${pagina}: sin sesión vuelve al inicio`, async ({ page }) => {
      await page.goto(`/errores/${pagina}.html`);
      const enlace = page.getByTestId('btn-volver-inicio');
      await expect(enlace).toHaveText('Volver al inicio');
      await expect(enlace).toHaveAttribute('href', '../index.html');
    });
  }

  for (const pagina of paginas) {
    test(`${pagina}: el Dueño vuelve a su panel`, async ({ page }) => {
      await conSesionSimulada(page, 'DUENO');
      await page.goto(`/errores/${pagina}.html`);
      const enlace = page.getByTestId('btn-volver-inicio');
      await expect(enlace).toHaveText('Volver al panel');
      await expect(enlace).toHaveAttribute('href', '../comercio-dashboard.html');
    });
  }

  test('el Administrador vuelve a su panel', async ({ page }) => {
    await conSesionSimulada(page, 'ADMINISTRADOR');
    await page.goto('/errores/acceso-denegado.html');
    const enlace = page.getByTestId('btn-volver-inicio');
    await expect(enlace).toHaveText('Volver al panel');
    await expect(enlace).toHaveAttribute('href', '../admin-dashboard.html');
    await enlace.click();
    await page.waitForURL(/admin-dashboard\.html/);
  });

  test('un Cliente en contexto de Empleado vuelve al panel del comercio y un Cliente común al inicio', async ({ page, context }) => {
    await conSesionSimulada(page, 'CLIENTE', 12);
    await page.goto('/errores/404.html');
    await expect(page.getByTestId('btn-volver-inicio')).toHaveText('Volver al panel');
    await expect(page.getByTestId('btn-volver-inicio')).toHaveAttribute('href', '../comercio-dashboard.html');

    const otra = await context.newPage();
    await conSesionSimulada(otra, 'CLIENTE');
    await otra.goto('/errores/404.html');
    await expect(otra.getByTestId('btn-volver-inicio')).toHaveText('Volver al inicio');
    await expect(otra.getByTestId('btn-volver-inicio')).toHaveAttribute('href', '../index.html');
  });

  test('«Reintentar» sin página de retorno lleva al inicio del rol', async ({ page }) => {
    await conSesionSimulada(page, 'DUENO');
    await page.route('**/comercio-dashboard.html', (ruta) => ruta.abort());
    await page.goto('/errores/500.html');
    const solicitud = page.waitForRequest('**/comercio-dashboard.html');
    await page.getByTestId('btn-reintentar').click();
    await solicitud;
  });

  test('«Reintentar» con retorno explícito conserva ese retorno', async ({ page }) => {
    await conSesionSimulada(page, 'DUENO');
    await page.route('**/comercio-productos.html', (ruta) => ruta.abort());
    await page.goto('/errores/500.html?retorno=comercio-productos.html');
    const solicitud = page.waitForRequest('**/comercio-productos.html');
    await page.getByTestId('btn-reintentar').click();
    await solicitud;
  });
});
