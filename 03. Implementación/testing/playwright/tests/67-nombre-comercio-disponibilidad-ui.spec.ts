import path from 'node:path';
import { readFileSync } from 'node:fs';
import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  diaDeHoy,
  esperarImagenCargadaEnRecorte,
  fijarPasswordAdminYLoguear,
  generarCuit,
  generarDni,
  generarTelefono,
  nombreArchivoFixture,
  nombreUsuarioUnico,
  obtenerLocalidadRioGrande,
  registrarYVerificarComercio,
  sufijoUnico,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import { abrirComoUsuario, prepararAprobado, prepararRechazado } from './helpers/multicomercio';
import { sinScrollHorizontal } from './helpers/layout';

const FIXTURE_BUFFER = readFileSync(path.resolve(__dirname, '../fixtures/bajonea-e2e-producto.png'));

const TEXTO_VERIFICANDO = 'Verificando…';
const TEXTO_DISPONIBLE = 'Nombre disponible';
const TEXTO_OCUPADO = 'Ya existe un comercio con ese nombre. Elegí otro.';
const PATRON_PUBLICO = '**/auth/comercio-nombre/disponibilidad**';
const PATRON_DUENO = '**/comercios/nombre/disponibilidad**';
const HORARIOS = [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];

let adminToken: string;
let localidadId: string;
let nombreOcupado: string;

async function contarConsultas(page: Page, patron: RegExp): Promise<() => number> {
  let cantidad = 0;
  page.on('request', (r) => {
    if (patron.test(r.url())) cantidad += 1;
  });
  return () => cantidad;
}

async function subirFotoUi(page: Page) {
  await page.getByTestId('input-foto-comercio').setInputFiles({ name: nombreArchivoFixture(), mimeType: 'image/png', buffer: FIXTURE_BUFFER });
  await expect(page.getByTestId('modal-recorte-imagen')).toBeVisible();
  await esperarImagenCargadaEnRecorte(page);
  await page.getByTestId('btn-confirmar-recorte').click();
  await expect(page.getByTestId('modal-recorte-imagen')).toHaveCount(0);
}

async function completarPaso1(page: Page, nombre: string) {
  await page.getByTestId('input-nombre').fill(nombre);
  await page.getByTestId('select-tipo-comercio').selectOption('RESTAURANTE');
  await page.getByTestId('input-telefono').fill(generarTelefono());
  await expect(page.getByTestId('select-localidad')).toBeEnabled();
  await page.getByTestId('select-localidad').selectOption(localidadId);
  await page.getByTestId('input-calle').fill('Av. San Martín');
  await page.getByTestId('input-numero').fill('100');
  await page.getByTestId('input-codigo-postal').fill('9420');
  await subirFotoUi(page);
}

async function completarHorario(page: Page, botonAgregar = true) {
  await page.getByTestId('tab-horario-personalizado').click();
  if (botonAgregar) await page.getByTestId('btn-agregar-horario').click();
  const fila = page.getByTestId('fila-horario').nth(0);
  await fila.getByTestId('select-dia-horario').selectOption(diaDeHoy());
  await fila.getByTestId('input-apertura-horario').fill('09:00');
  await fila.getByTestId('input-cierre-horario').fill('18:00');
}

async function completarPaso2Registro(page: Page) {
  await page.getByTestId('input-cuit').fill(generarCuit());
  await page.getByTestId('input-domicilio-fiscal').fill('Av. San Martín 100');
  await page.getByTestId('input-nombre-representante').fill('Rodrigo');
  await page.getByTestId('input-apellido-representante').fill('Fernández');
  await page.getByTestId('input-dni-representante').fill(generarDni());
  await page.getByTestId('input-fecha-nacimiento-representante').fill('1985-03-15');
  await page.getByTestId('input-telefono-representante').fill(generarTelefono());
  await page.getByTestId('input-nombre-usuario').fill(nombreUsuarioUnico('nom'));
  await page.getByTestId('input-email').fill(`nombre.ui.${sufijoUnico()}@bajonea.test`);
  await page.getByTestId('input-password').fill('Testing123');
  await page.getByTestId('input-confirmar-password').fill('Testing123');
  await page.getByTestId('btn-continuar-2').click();
}

async function dispararBlur(page: Page, testid = 'input-nombre') {
  await page.getByTestId(testid).blur();
}

async function esperarEstado(page: Page, estado: 'disponible' | 'ocupado') {
  if (estado === 'disponible') {
    await expect(page.getByTestId('estado-nombre-comercio')).toHaveText(TEXTO_DISPONIBLE);
  } else {
    await expect(page.getByTestId('mensaje-error-nombre')).toHaveText(TEXTO_OCUPADO);
  }
  await expect(page.getByTestId('icono-estado-nombre-comercio')).toHaveClass(new RegExp(`input-shell__status-icon--${estado}`));
}

async function simularDisponible(page: Page, patron: string) {
  await page.route(patron, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mensaje: 'ok', data: { disponible: true } }) });
  });
}

test.describe('Nombre único de comercio: disponibilidad en vivo en las cuatro pantallas (UI)', () => {
  test.describe.configure({ timeout: 300_000 });

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
    const admin: SesionApi = await fijarPasswordAdminYLoguear(request);
    adminToken = admin.token;
    nombreOcupado = `Nombre Ocupado UI ${sufijoUnico()}`;
    await registrarYVerificarComercio(request, localidadId, { nombre: nombreOcupado, horarios: HORARIOS });
  });

  async function dueñoAprobado(request: APIRequestContext) {
    return prepararAprobado(request, adminToken, localidadId);
  }

  test.describe('registro de Comercio (paso 1)', () => {
    test('muestra "Verificando…" mientras responde el servidor y después "Nombre disponible" con el ícono de disponible', async ({ page }) => {
      let liberar: () => void = () => {};
      const compuerta = new Promise<void>((resolver) => {
        liberar = resolver;
      });
      await page.route(PATRON_PUBLICO, async (route) => {
        await compuerta;
        await route.continue();
      });
      await page.goto('/registro-comercio.html');
      await page.getByTestId('input-nombre').fill(`Nombre Libre UI ${sufijoUnico()}`);
      await dispararBlur(page);
      await expect(page.getByTestId('estado-nombre-comercio')).toHaveText(TEXTO_VERIFICANDO);
      await expect(page.getByTestId('icono-estado-nombre-comercio')).toHaveClass(/input-shell__status-icon--verificando/);
      liberar();
      await esperarEstado(page, 'disponible');
    });

    test('un nombre ocupado, aun con otras mayúsculas, muestra el error con el ícono de ocupado y vuelve a limpiarse al escribir', async ({ page }) => {
      await page.goto('/registro-comercio.html');
      await page.getByTestId('input-nombre').fill(nombreOcupado.toLowerCase());
      await dispararBlur(page);
      await esperarEstado(page, 'ocupado');
      await page.getByTestId('input-nombre').fill(`${nombreOcupado} Otro`);
      await expect(page.getByTestId('mensaje-error-nombre')).toBeHidden();
      await expect(page.getByTestId('icono-estado-nombre-comercio')).toBeHidden();
    });

    test('con el nombre ocupado el paso 1 no avanza aunque todos los demás campos estén bien', async ({ page }) => {
      await page.goto('/registro-comercio.html');
      await completarPaso1(page, nombreOcupado);
      await page.getByTestId('btn-continuar').click();
      await expect(page.getByTestId('mensaje-error-nombre')).toHaveText(TEXTO_OCUPADO);
      await expect(page.getByTestId('btn-continuar-2')).toBeHidden();
      await expect(page.getByTestId('input-nombre')).toBeVisible();
    });

    test('un nombre libre deja avanzar al paso 2 sin esperar un segundo blur', async ({ page }) => {
      await page.goto('/registro-comercio.html');
      await completarPaso1(page, `Nombre Avanza UI ${sufijoUnico()}`);
      await page.getByTestId('btn-continuar').click();
      await expect(page.getByTestId('btn-continuar-2')).toBeVisible();
    });

    test('si el aviso en vivo dice "disponible" pero otro lo tomó antes del envío, el 409 vuelve al campo con el mensaje', async ({ page, request }) => {
      const suf = sufijoUnico();
      const nombre = `Nombre Carrera Reg UI ${suf}`;
      await simularDisponible(page, PATRON_PUBLICO);
      await page.goto('/registro-comercio.html');
      await completarPaso1(page, nombre);
      await page.getByTestId('btn-continuar').click();
      await expect(page.getByTestId('btn-continuar-2')).toBeVisible();
      await completarPaso2Registro(page);
      await completarHorario(page);
      await page.getByTestId('btn-continuar-3').click();
      await expect(page.getByTestId('lista-redes-sociales')).toBeVisible();
      await page.getByTestId('select-tipo-red-social').selectOption('INSTAGRAM');
      await page.getByTestId('input-url-red-social').fill(`instagram.com/carrera.${suf}`);
      await page.getByTestId('input-acepta-terminos').check();
      await registrarYVerificarComercio(request, localidadId, { nombre, horarios: HORARIOS });
      await page.getByTestId('btn-registrar-comercio').click();
      await expect(page.getByTestId('mensaje-error-nombre')).toHaveText(TEXTO_OCUPADO);
      await expect(page.getByTestId('input-nombre')).toBeVisible();
      await expect(page.getByTestId('lista-redes-sociales')).toBeHidden();
    });

    test('sin scroll horizontal a 375 px con el aviso de ocupado visible', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto('/registro-comercio.html');
      await page.getByTestId('input-nombre').fill(nombreOcupado);
      await dispararBlur(page);
      await esperarEstado(page, 'ocupado');
      await sinScrollHorizontal(page);
    });
  });

  test.describe('alta adicional', () => {
    test('un nombre ocupado muestra el error en vivo y bloquea el avance del paso 1', async ({ page, request }) => {
      const dueno = await dueñoAprobado(request);
      await abrirComoUsuario(page, dueno.sesion);
      await page.goto('/agregar-comercio.html');
      await completarPaso1(page, nombreOcupado);
      await expect(page.getByTestId('mensaje-error-nombre')).toHaveText(TEXTO_OCUPADO);
      await page.getByTestId('btn-continuar').click();
      await expect(page.getByTestId('btn-continuar-2')).toBeHidden();
    });

    test('un nombre libre muestra "Nombre disponible" y deja avanzar', async ({ page, request }) => {
      const dueno = await dueñoAprobado(request);
      await abrirComoUsuario(page, dueno.sesion);
      await page.goto('/agregar-comercio.html');
      await completarPaso1(page, `Nombre Adicional Libre ${sufijoUnico()}`);
      await esperarEstado(page, 'disponible');
      await page.getByTestId('btn-continuar').click();
      await expect(page.getByTestId('btn-continuar-2')).toBeVisible();
    });

    test('el 409 del envío por una carrera vuelve al paso 1 con el mensaje bajo el campo', async ({ page, request }) => {
      const suf = sufijoUnico();
      const nombre = `Nombre Carrera Adic UI ${suf}`;
      const dueno = await dueñoAprobado(request);
      await abrirComoUsuario(page, dueno.sesion);
      await simularDisponible(page, PATRON_DUENO);
      await page.goto('/agregar-comercio.html');
      await completarPaso1(page, nombre);
      await page.getByTestId('btn-continuar').click();
      await expect(page.getByTestId('btn-continuar-2')).toBeVisible();
      await completarHorario(page);
      await page.getByTestId('btn-continuar-2').click();
      await expect(page.getByTestId('lista-redes-sociales')).toBeVisible();
      await page.getByTestId('select-tipo-red-social').selectOption('INSTAGRAM');
      await page.getByTestId('input-url-red-social').fill(`instagram.com/adic.carrera.${suf}`);
      await page.getByTestId('input-acepta-terminos').check();
      await registrarYVerificarComercio(request, localidadId, { nombre, horarios: HORARIOS });
      await page.getByTestId('btn-enviar-solicitud').click();
      await expect(page.getByTestId('mensaje-error-nombre')).toHaveText(TEXTO_OCUPADO);
      await expect(page.getByTestId('btn-continuar')).toBeVisible();
    });
  });

  test.describe('corrección de un comercio rechazado', () => {
    test('el nombre propio no dispara ninguna consulta y uno ocupado muestra el error', async ({ page, request }) => {
      const dueno = await prepararRechazado(request, adminToken, localidadId);
      await abrirComoUsuario(page, dueno.sesion);
      const consultas = await contarConsultas(page, /\/comercios\/nombre\/disponibilidad/);
      await page.goto(`/comercio-corregir.html?id=${dueno.comercioId}`);
      await expect(page.getByTestId('select-localidad')).toBeEnabled();
      await expect(page.getByTestId('input-nombre')).toHaveValue(/.+/);
      await dispararBlur(page);
      await page.getByTestId('input-nombre').fill(dueno.nombre.toUpperCase());
      await dispararBlur(page);
      await expect(page.getByTestId('estado-nombre-comercio')).toBeHidden();
      expect(consultas()).toBe(0);
      await page.getByTestId('input-nombre').fill(nombreOcupado);
      await dispararBlur(page);
      await esperarEstado(page, 'ocupado');
      expect(consultas()).toBe(1);
      await page.getByTestId('btn-continuar').click();
      await expect(page.getByTestId('mensaje-error-nombre')).toHaveText(TEXTO_OCUPADO);
      await expect(page.getByTestId('btn-continuar-legales')).toBeHidden();
    });

    test('el 409 del envío por una carrera vuelve al paso del negocio con el mensaje', async ({ page, request }) => {
      const suf = sufijoUnico();
      const nombre = `Nombre Carrera Corr UI ${suf}`;
      const dueno = await prepararRechazado(request, adminToken, localidadId);
      await abrirComoUsuario(page, dueno.sesion);
      await simularDisponible(page, PATRON_DUENO);
      await page.goto(`/comercio-corregir.html?id=${dueno.comercioId}`);
      await expect(page.getByTestId('select-localidad')).toBeEnabled();
      await page.getByTestId('input-nombre').fill(nombre);
      await dispararBlur(page);
      await esperarEstado(page, 'disponible');
      await registrarYVerificarComercio(request, localidadId, { nombre, horarios: HORARIOS });
      await page.getByTestId('btn-continuar').click();
      await expect(page.getByTestId('btn-continuar-legales')).toBeVisible();
      await page.getByTestId('btn-continuar-legales').click();
      await expect(page.getByTestId('btn-continuar-horarios')).toBeVisible();
      await page.getByTestId('btn-continuar-horarios').click();
      await page.getByTestId('btn-enviar-solicitud').click();
      await expect(page.getByTestId('mensaje-error-nombre')).toHaveText(TEXTO_OCUPADO);
      await expect(page.getByTestId('btn-continuar')).toBeVisible();
    });
  });

  test.describe('perfil del Dueño', () => {
    async function abrirEdicion(page: Page, request: APIRequestContext) {
      const dueno = await dueñoAprobado(request);
      await abrirComoUsuario(page, dueno.sesion);
      await page.goto('/comercio-perfil.html');
      await expect(page.getByTestId('nombre-comercio-perfil')).not.toHaveText('');
      await page.getByTestId('btn-editar-perfil-comercio').click();
      await expect(page.getByTestId('input-nombre')).toBeVisible();
      return dueno;
    }

    test('el nombre propio no consulta; uno ocupado muestra el error y el guardado no envía el PUT', async ({ page, request }) => {
      const dueno = await abrirEdicion(page, request);
      const consultas = await contarConsultas(page, /\/comercios\/nombre\/disponibilidad/);
      let puts = 0;
      page.on('request', (r) => {
        if (r.method() === 'PUT' && r.url().endsWith('/comercios/perfil')) puts += 1;
      });
      await page.getByTestId('input-nombre').fill(dueno.nombre.toUpperCase());
      await dispararBlur(page);
      await expect(page.getByTestId('estado-nombre-comercio')).toBeHidden();
      expect(consultas()).toBe(0);
      await page.getByTestId('input-nombre').fill(nombreOcupado);
      await dispararBlur(page);
      await esperarEstado(page, 'ocupado');
      await page.getByTestId('btn-guardar-perfil-comercio').click();
      await expect(page.getByTestId('mensaje-error-nombre')).toHaveText(TEXTO_OCUPADO);
      expect(puts).toBe(0);
    });

    test('un nombre libre muestra "Nombre disponible" y se guarda', async ({ page, request }) => {
      await abrirEdicion(page, request);
      const suf = sufijoUnico();
      const nuevo = `Nombre Perfil Libre ${suf}`;
      await page.getByTestId('input-nombre').fill(nuevo);
      await esperarEstadoTrasBlur(page);
      await page.getByTestId('btn-guardar-perfil-comercio').click();
      await expect(page.getByTestId('nombre-comercio-perfil')).toContainText(suf);
    });

    test('el 409 del guardado por una carrera queda bajo el campo y no cierra la edición', async ({ page, request }) => {
      await abrirEdicion(page, request);
      await simularDisponible(page, PATRON_DUENO);
      await page.getByTestId('input-nombre').fill(nombreOcupado);
      await dispararBlur(page);
      await esperarEstado(page, 'disponible');
      await page.getByTestId('btn-guardar-perfil-comercio').click();
      await expect(page.getByTestId('mensaje-error-nombre')).toHaveText(TEXTO_OCUPADO);
      await expect(page.getByTestId('btn-guardar-perfil-comercio')).toBeVisible();
    });

    test('sin scroll horizontal a 375 px con el aviso de ocupado visible', async ({ page, request }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await abrirEdicion(page, request);
      await page.getByTestId('input-nombre').fill(nombreOcupado);
      await dispararBlur(page);
      await esperarEstado(page, 'ocupado');
      await sinScrollHorizontal(page);
    });
  });
});

async function esperarEstadoTrasBlur(page: Page) {
  await dispararBlur(page);
  await esperarEstado(page, 'disponible');
}
