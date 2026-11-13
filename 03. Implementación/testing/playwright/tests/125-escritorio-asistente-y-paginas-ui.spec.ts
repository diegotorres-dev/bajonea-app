import path from 'node:path';
import { readFileSync } from 'node:fs';
import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import {
  clonarComercioTest,
  diaDeHoy,
  esperarImagenCargadaEnRecorte,
  fijarPasswordAdminYLoguear,
  generarCuit,
  generarDni,
  generarTelefono,
  nombreArchivoFixture,
  nombreUsuarioUnico,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sufijoUnico,
} from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { prepararAprobado } from './helpers/multicomercio';
import { sumarAlEquipo } from './helpers/empleado';
import { ANCHOS_ESCRITORIO, caja, sinScrollHorizontalEnAnchos, tieneAnilloDeFoco } from './helpers/layout';
import { abrirDatosAdicionales } from './helpers/datos-adicionales';

test.use({ viewport: { width: 1440, height: 900 } });

const FIXTURE = readFileSync(path.resolve(__dirname, '../fixtures/bajonea-e2e-producto.png'));

async function estadosDePasos(page: Page): Promise<string[]> {
  return page.getByTestId('pasos-laterales').locator('li').evaluateAll((items) => items.map((item) => item.getAttribute('data-estado') ?? ''));
}

test.describe('Escritorio E0b: asistente de registro con pasos al costado @escritorio', () => {
  test.describe.configure({ timeout: 180_000 });

  let localidadId: string;
  let adminToken: string;
  let dueno: Dueno;

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    const horarios = [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
    dueno = await prepararAprobado(request, adminToken, localidadId, false, horarios);
  });

  test('cabecera de 72 px con logo, separador, título y enlace "Salir del registro" de 44 px a la derecha @escritorio', async ({ page }) => {
    await page.goto('/registro-comercio.html');
    const cabecera = await caja(page.locator('.app-header'));
    expect(cabecera.height).toBe(72);
    await expect(page.getByTestId('btn-volver')).toBeHidden();
    await expect(page.locator('.app-header__title')).toHaveText('Registrar comercio');
    await expect(page.locator('.app-header__title')).toHaveCSS('border-left-style', 'solid');
    const salir = page.getByTestId('btn-salir-registro');
    await expect(salir).toBeVisible();
    const cajaSalir = await caja(salir);
    expect(cajaSalir.height).toBeGreaterThanOrEqual(43.5);
    expect(cajaSalir.x).toBeGreaterThan(1100);
    const titulo = await caja(page.locator('.app-header__title'));
    expect(titulo.x).toBeLessThan(cajaSalir.x);
    await expect(salir).toHaveAttribute('href', 'registro-tipo-cuenta.html');
  });

  test('columna de pasos de 300 px, fija al desplazarse, con el paso activo marcado y la nota de avance @escritorio', async ({ page }) => {
    await page.goto('/registro-comercio.html');
    const lateral = page.locator('#step-progress-container');
    const cajaLateral = await caja(lateral);
    expect(cajaLateral.width).toBe(300);
    await expect(lateral).toHaveCSS('position', 'sticky');
    await expect(lateral).toHaveCSS('border-radius', '20px');
    await expect(page.getByTestId('pasos-laterales').locator('li')).toHaveCount(4);
    expect(await estadosDePasos(page)).toEqual(['activo', 'pendiente', 'pendiente', 'pendiente']);
    await expect(page.getByTestId('paso-lateral-1')).toHaveCSS('background-color', 'rgb(255, 241, 234)');
    await expect(page.getByTestId('paso-lateral-1')).toHaveAttribute('aria-current', 'step');
    await expect(lateral).toContainText('Tu avance');
    await expect(lateral).toContainText('Podés volver a un paso anterior sin perder lo que cargaste.');
    const tarjeta = await caja(page.locator('#wizard-container'));
    expect(tarjeta.x).toBeGreaterThan(cajaLateral.x + cajaLateral.width);
    expect(tarjeta.x + tarjeta.width).toBeCloseTo(1360, -1);
    expect((await caja(page.locator('.app-main'))).width).toBe(1280);
  });

  test('el primer paso agrupa la foto en fila, dos interruptores lado a lado y la descripción a todo el ancho @escritorio', async ({ page }) => {
    await page.goto('/registro-comercio.html');
    const avatar = await caja(page.getByTestId('btn-agregar-foto-comercio'));
    expect(avatar.width).toBe(96);
    expect(avatar.height).toBe(96);
    const rotulo = await caja(page.locator('.field--centrado .field__label'));
    expect(rotulo.x).toBeGreaterThan(avatar.x + avatar.width);
    const delivery = await caja(page.getByTestId('btn-switch-delivery'));
    const retiro = await caja(page.getByTestId('btn-switch-retiro'));
    expect(Math.abs(delivery.y - retiro.y)).toBeLessThanOrEqual(1);
    expect(retiro.x).toBeGreaterThan(delivery.x + delivery.width);
    const tarjeta = await caja(page.locator('#wizard-container'));
    expect((await caja(page.getByTestId('input-descripcion'))).width).toBeGreaterThan(tarjeta.width * 0.8);
    const telefono = await caja(page.getByTestId('input-telefono'));
    const tipo = await caja(page.getByTestId('select-tipo-comercio'));
    expect(Math.abs(telefono.y - tipo.y)).toBeLessThanOrEqual(1);
    expect(tipo.x).toBeGreaterThan(telefono.x + telefono.width);
  });

  test('"Cancelar" a la izquierda y "Continuar" de ancho natural a la derecha, separados por una línea @escritorio', async ({ page }) => {
    await page.goto('/registro-comercio.html');
    const cancelar = await caja(page.getByTestId('btn-cancelar-registro'));
    const continuar = await caja(page.getByTestId('btn-continuar'));
    const tarjeta = await caja(page.locator('#wizard-container'));
    expect(cancelar.x).toBeLessThan(tarjeta.x + 60);
    expect(continuar.x + continuar.width).toBeGreaterThan(tarjeta.x + tarjeta.width - 60);
    expect(continuar.width).toBeLessThan(260);
    expect(continuar.height).toBe(52);
    expect(Math.abs((cancelar.y + cancelar.height / 2) - (continuar.y + continuar.height / 2))).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('btn-cancelar-registro')).toHaveAttribute('href', 'registro-tipo-cuenta.html');
    await expect(page.locator('.acciones-paso').first()).toHaveCSS('border-top-style', 'solid');
  });

  test('registro de comercio: los pasos completados y el activo avanzan con el recorrido real, y Atrás vuelve sin perder lo cargado @escritorio', async ({ page }) => {
    const suf = sufijoUnico();
    await page.goto('/registro-comercio.html');
    await page.getByTestId('input-nombre').fill(`Comercio Asistente ${suf}`);
    await page.getByTestId('input-telefono').fill(generarTelefono());
    await page.getByTestId('select-tipo-comercio').selectOption('RESTAURANTE');
    await page.getByTestId('input-calle').fill('Av. San Martín');
    await page.getByTestId('input-numero').fill('100');
    await page.getByTestId('input-codigo-postal').fill('9420');
    await expect(page.getByTestId('select-localidad')).toBeEnabled();
    await page.getByTestId('select-localidad').selectOption(localidadId);
    await page.getByTestId('input-foto-comercio').setInputFiles({ name: nombreArchivoFixture(), mimeType: 'image/png', buffer: FIXTURE });
    await expect(page.getByTestId('modal-recorte-imagen')).toBeVisible();
    await esperarImagenCargadaEnRecorte(page);
    await page.getByTestId('btn-confirmar-recorte').click();
    await expect(page.getByTestId('modal-recorte-imagen')).toHaveCount(0);
    await page.getByTestId('btn-continuar').click();
    await expect(page.getByTestId('input-cuit')).toBeVisible();
    expect(await estadosDePasos(page)).toEqual(['completado', 'activo', 'pendiente', 'pendiente']);
    await expect(page.getByTestId('btn-atras-paso-2')).toBeVisible();
    await expect(page.getByTestId('btn-cancelar-registro')).toBeHidden();
    const [cuit, domicilio] = await page.evaluate(() =>
      ['input-cuit', 'input-domicilio-fiscal'].map((id) => {
        const r = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width };
      }),
    );
    expect(Math.abs(cuit.y - domicilio.y)).toBeLessThanOrEqual(1);
    expect(domicilio.x).toBeGreaterThan(cuit.x + cuit.width);
    await page.getByTestId('btn-atras-paso-2').click();
    await expect(page.getByTestId('input-nombre')).toHaveValue(`Comercio Asistente ${suf}`);
    expect(await estadosDePasos(page)).toEqual(['activo', 'pendiente', 'pendiente', 'pendiente']);
    await page.getByTestId('btn-continuar').click();
    await abrirDatosAdicionales(page);
    await page.getByTestId('input-cuit').fill(generarCuit());
    await page.getByTestId('input-domicilio-fiscal').fill('Av. San Martín 100');
    await page.getByTestId('input-nombre-representante').fill('Rodrigo');
    await page.getByTestId('input-apellido-representante').fill('Fernández');
    await page.getByTestId('input-dni-representante').fill(generarDni());
    await page.getByTestId('input-fecha-nacimiento-representante').fill('1985-03-15');
    await page.getByTestId('input-telefono-representante').fill(generarTelefono());
    await page.getByTestId('input-nombre-usuario').fill(nombreUsuarioUnico('asi'));
    await page.getByTestId('input-email').fill(`asistente.${suf}@bajonea.test`);
    await page.getByTestId('input-password').fill('Testing123');
    await page.getByTestId('input-confirmar-password').fill('Testing123');
    await page.getByTestId('btn-continuar-2').click();
    await expect(page.getByTestId('tab-horario-personalizado')).toBeVisible();
    expect(await estadosDePasos(page)).toEqual(['completado', 'completado', 'activo', 'pendiente']);
    await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
  });

  test('registro de cliente: dos pasos con "Cancelar" que sale del registro y "Atrás" que vuelve al primer paso @escritorio', async ({ page }) => {
    await page.goto('/registro-cliente.html');
    await expect(page.getByTestId('pasos-laterales').locator('li')).toHaveCount(2);
    expect(await estadosDePasos(page)).toEqual(['activo', 'pendiente']);
    await expect(page.getByTestId('btn-cancelar-registro')).toHaveAttribute('href', 'registro-tipo-cuenta.html');
    const avatar = await caja(page.getByTestId('btn-agregar-foto-cliente'));
    expect(avatar.width).toBe(96);
    await page.getByTestId('input-nombre').fill('Valentina');
    await page.getByTestId('input-apellido').fill('Domínguez');
    await page.getByTestId('input-dni').fill(generarDni());
    await page.getByTestId('input-fecha-nacimiento').fill('1995-05-20');
    await page.getByTestId('input-telefono').fill(generarTelefono());
    await page.getByTestId('input-nombre-usuario').fill(nombreUsuarioUnico('cli'));
    await page.getByTestId('input-email').fill(`cliente.asistente.${sufijoUnico()}@bajonea.test`);
    await page.getByTestId('input-password').fill('Testing123');
    await page.getByTestId('input-confirmar-password').fill('Testing123');
    await page.getByTestId('input-acepta-terminos').check();
    await page.getByTestId('btn-continuar').click();
    await expect(page.getByTestId('input-calle')).toBeVisible();
    expect(await estadosDePasos(page)).toEqual(['completado', 'activo']);
    await page.getByTestId('btn-atras-paso').click();
    await expect(page.getByTestId('input-nombre')).toHaveValue('Valentina');
    expect(await estadosDePasos(page)).toEqual(['activo', 'pendiente']);
    await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
  });

  test('el asistente se completa solo con teclado: Tab llega a los botones del pie y el foco es visible @escritorio', async ({ page }) => {
    await page.goto('/registro-comercio.html');
    await tieneAnilloDeFoco(page.getByTestId('btn-salir-registro'));
    await tieneAnilloDeFoco(page.getByTestId('btn-cancelar-registro'));
    await tieneAnilloDeFoco(page.getByTestId('btn-continuar'));
    await page.getByTestId('btn-continuar').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.field__error:visible').first()).toBeVisible();
  });

  test('el invitado de la invitación ve el panel de marca y, en la cuenta nueva, el asistente sin pasos laterales @escritorio', async ({ page }) => {
    await page.goto('/invitacion-empleado.html');
    await expect(page.getByTestId('panel-marca')).toBeVisible();
    await expect(page.getByTestId('pasos-laterales')).toHaveCount(0);
  });

  test('registro-tipo-cuenta: dos tarjetas grandes lado a lado con su botón @escritorio', async ({ page }) => {
    await page.goto('/registro-tipo-cuenta.html');
    const cliente = await caja(page.getByTestId('btn-elegir-cliente'));
    const comercio = await caja(page.getByTestId('btn-elegir-comercio'));
    expect(Math.abs(cliente.y - comercio.y)).toBeLessThanOrEqual(1);
    expect(comercio.x).toBeGreaterThan(cliente.x + cliente.width);
    expect(cliente.width).toBeGreaterThanOrEqual(420);
    expect(comercio.width).toBeGreaterThanOrEqual(420);
    expect(cliente.height).toBeGreaterThanOrEqual(260);
    await expect(page.getByTestId('btn-elegir-cliente').locator('.btn')).toBeVisible();
    await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
  });

  test('selector de contexto: grilla de tarjetas con avatar, nombre y rol @escritorio', async ({ page, request }) => {
    const cuenta = await registrarYVerificarCliente(request, localidadId);
    const comercioId = await clonarComercioTest(request, dueno.comercioId, `Grilla Contexto ${sufijoUnico()}`, 'APROBADO');
    await sumarAlEquipo(request, comercioId, cuenta, dueno.token);
    await page.goto('/login.html');
    await page.getByTestId('input-nombre-usuario').fill(cuenta.nombreUsuario);
    await page.getByTestId('input-password').fill(cuenta.password);
    await page.getByTestId('btn-ingresar').click();
    await page.waitForURL('**/seleccionar-contexto.html');
    const filas = page.locator('[data-testid="lista-contextos"] > *');
    await expect(filas).toHaveCount(2);
    const primera = await caja(filas.nth(0));
    const segunda = await caja(filas.nth(1));
    expect(Math.abs(primera.y - segunda.y)).toBeLessThanOrEqual(1);
    expect(segunda.x).toBeGreaterThan(primera.x + primera.width);
    expect(primera.width).toBeGreaterThanOrEqual(300);
    expect((await caja(page.locator('.selector-contexto__marca'))).height).toBe(72);
    await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
  });
});

for (const [url, titulo] of [
  ['/terminos.html', 'titulo-terminos'],
  ['/privacidad.html', null],
  ['/faq.html', 'titulo-faq'],
] as const) {
  test.describe(`Escritorio E0b: ${url} con índice lateral @escritorio`, () => {
    test('índice fijo de 280 px a la izquierda, columna de texto de 720 px y sin tarjeta flotante @escritorio', async ({ page }) => {
      await page.goto(url);
      const indice = page.getByTestId('legal-indice');
      await expect(indice).toBeVisible();
      const cajaIndice = await caja(indice);
      expect(cajaIndice.width).toBe(280);
      await expect(indice).toHaveCSS('position', 'sticky');
      const texto = await caja(page.locator('.legal-pagina'));
      expect(texto.width).toBe(720);
      expect(texto.x).toBeGreaterThan(cajaIndice.x + cajaIndice.width);
      await expect(page.locator('.app-main')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(page.locator('.app-main')).toHaveCSS('border-top-width', '0px');
      if (titulo) {
        await expect(page.getByTestId(titulo)).toBeVisible();
      }
      await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
    });

    test('tocar un ítem del índice lleva a su sección y lo marca como actual, sin # en la URL @escritorio', async ({ page }) => {
      await page.goto(url);
      const botones = page.locator('.legal-indice__boton');
      const cantidad = await botones.count();
      expect(cantidad).toBeGreaterThan(3);
      await botones.nth(cantidad - 1).click();
      await expect(botones.nth(cantidad - 1)).toHaveAttribute('aria-current', 'true');
      expect(page.url()).not.toContain('#');
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
    });

    test('los ítems del índice se alcanzan con el teclado y muestran el foco @escritorio', async ({ page }) => {
      await page.goto(url);
      await tieneAnilloDeFoco(page.locator('.legal-indice__boton').nth(1));
      await page.locator('.legal-indice__boton').nth(2).focus();
      await page.keyboard.press('Enter');
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    });
  });
}

test.describe('Escritorio E0b: soporte-consulta con conversación y datos de la consulta @escritorio', () => {
  test('la conversación ocupa la columna flexible y los datos de la consulta quedan a la derecha en 320 px @escritorio', async ({ page }) => {
    await page.route('**/api/v1/soporte/publico/consultas/ver', (ruta) =>
      ruta.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          mensaje: 'Consulta',
          data: {
            codigo: 'ABCD2345',
            tipo: 'OTRA',
            estado: 'ESPERA_PERSONA',
            creadoEn: '2026-11-01T10:00:00',
            cantidadMensajes: 2,
            maxMensajes: 20,
            puedeResponder: true,
            mensajes: [
              { autor: 'PERSONA', texto: 'Hola, tengo una duda con mi cuenta.', creadoEn: '2026-11-01T10:00:00' },
              { autor: 'SOPORTE', texto: 'Hola, contanos qué pasó.', creadoEn: '2026-11-01T11:00:00' },
            ],
          },
        }),
      }),
    );
    await page.goto('/soporte-consulta.html#codigo=ABCD-2345&email=prueba@bajonea.test');
    await expect(page.getByTestId('cabecera-consulta')).toBeVisible();
    const datos = await caja(page.getByTestId('cabecera-consulta'));
    const hilo = await caja(page.getByTestId('hilo-consulta'));
    expect(datos.width).toBe(320);
    expect(datos.x).toBeGreaterThan(hilo.x + hilo.width);
    expect(hilo.width).toBeGreaterThan(600);
    await expect(page.getByTestId('cabecera-consulta')).toHaveCSS('position', 'sticky');
    await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
  });

  test('el formulario de acceso a la consulta no ocupa todo el ancho @escritorio', async ({ page }) => {
    await page.goto('/soporte-consulta.html');
    const contenido = await caja(page.getByTestId('contenido-consulta'));
    expect(contenido.width).toBeLessThanOrEqual(520);
  });
});

test.describe('Escritorio E0b: la versión móvil no usa los pasos laterales ni el índice @escritorio', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a 390 px los pasos conservan la barra de progreso y no aparece la lista lateral @escritorio', async ({ page }) => {
    await page.goto('/registro-comercio.html');
    await expect(page.getByTestId('pasos-laterales')).toBeHidden();
    await expect(page.locator('.step-progress__bars')).toBeVisible();
    await expect(page.getByTestId('btn-cancelar-registro')).toBeHidden();
    await expect(page.getByTestId('btn-salir-registro')).toBeHidden();
    await expect(page.getByTestId('btn-volver')).toBeVisible();
  });

  test('a 390 px los textos legales no muestran el índice lateral ni los botones de tarjeta @escritorio', async ({ page }) => {
    await page.goto('/terminos.html');
    await expect(page.getByTestId('legal-indice')).toBeHidden();
    await page.goto('/registro-tipo-cuenta.html');
    await expect(page.locator('.delivery-option__accion').first()).toBeHidden();
  });
});
