import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  apiConHeaders,
  diaDeHoy,
  diaDistintoDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import { abrirComoUsuarioConContexto, ponerEstadoComercio, sumarAlEquipo } from './helpers/empleado';
import { abrirComoUsuarioConComercio } from './helpers/selector';
import { abrirComoUsuario, prepararAprobado, prepararRechazado, reemplazarHorarios } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { sinScrollHorizontal } from './helpers/layout';
import { diaDeLaSemanaEnZona } from './helpers/zona';

const HEADER = 'X-Comercio-Id';
const TEXTO_VIGENTE = '00:00 a 23:59';
const DIAS_DE_LA_SEMANA = [
  { codigo: 'DOMINGO', nombre: 'Domingo' },
  { codigo: 'LUNES', nombre: 'Lunes' },
  { codigo: 'MARTES', nombre: 'Martes' },
  { codigo: 'MIERCOLES', nombre: 'Miércoles' },
  { codigo: 'JUEVES', nombre: 'Jueves' },
  { codigo: 'VIERNES', nombre: 'Viernes' },
  { codigo: 'SABADO', nombre: 'Sábado' },
];

test.use({ viewport: { width: 375, height: 812 } });

test.describe('Edición de horarios del comercio, Fase 2 T1 entrega B', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminToken: string;
  let localidadId: string;
  let dueno: Dueno;
  let elena: SesionApi;
  let rechazado: Dueno;
  const erroresDeConsola: string[] = [];

  const conComercio = (): Record<string, string> => ({ [HEADER]: String(dueno.comercioId) });
  const perfilDelComercio = async (request: APIRequestContext) =>
    (await apiConHeaders(request, 'GET', '/comercios/perfil', dueno.token, conComercio())).body.data;

  function vigilarConsola(page: Page) {
    page.on('pageerror', (error) => erroresDeConsola.push(error.message));
    page.on('console', (mensaje) => {
      if (mensaje.type() === 'error' && !mensaje.text().includes('Failed to load resource')) erroresDeConsola.push(mensaje.text());
    });
  }

  async function abrirComoDueno(page: Page) {
    vigilarConsola(page);
    await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: dueno.comercioId, ultimoComercioId: dueno.comercioId });
  }

  async function abrirComoEmpleado(page: Page) {
    vigilarConsola(page);
    await abrirComoUsuarioConContexto(page, elena, {
      contexto: { tipo: 'EMPLEADO', comercioId: dueno.comercioId },
      ultimoContexto: `EMPLEADO:${dueno.comercioId}`,
    });
  }

  async function abrirEdicion(page: Page, testId = 'btn-editar-horarios') {
    await page.goto('/comercio-perfil.html');
    await expect(page.getByTestId(testId)).toBeEnabled();
    await page.getByTestId(testId).click();
    await expect(page.getByTestId('tarjeta-vigencia-horarios')).toBeVisible();
  }

  async function cargarFranjas(page: Page, franjas: Array<{ dia: string; desde: string; hasta: string }>) {
    await page.getByTestId('tab-horario-personalizado').click();
    while ((await page.getByTestId('btn-eliminar-horario').count()) > 0) {
      await page.getByTestId('btn-eliminar-horario').first().click();
    }
    for (const franja of franjas) {
      await page.getByTestId('btn-agregar-horario').click();
      const fila = page.getByTestId('fila-horario').last();
      await fila.getByTestId('select-dia-horario').selectOption(franja.dia);
      await fila.getByTestId('input-apertura-horario').fill(franja.desde);
      await fila.getByTestId('input-cierre-horario').fill(franja.hasta);
    }
  }

  function restaurarHorarios() {
    reemplazarHorarios(dueno.comercioId, [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }]);
    ponerEstadoComercio(dueno.comercioId, 'APTO_VENTA');
  }

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    dueno = await prepararAprobado(request, adminToken, localidadId, true, [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }]);
    rechazado = await prepararRechazado(request, adminToken, localidadId);
    const registro = await registrarYVerificarCliente(request, localidadId);
    await sumarAlEquipo(request, dueno.comercioId, registro, dueno.token);
    elena = await login(request, registro.nombreUsuario, registro.password);
  });

  test.afterEach(() => {
    restaurarHorarios();
  });

  test('el Dueño tiene su fila "Editar horarios" aparte y la tarjeta muestra lo que rige hoy', async ({ page }) => {
    await abrirComoDueno(page);
    await page.goto('/comercio-perfil.html');
    await expect(page.getByTestId('btn-editar-perfil-comercio')).toContainText('Editar datos del comercio');
    await expect(page.getByTestId('btn-editar-horarios')).toContainText('Editar horarios');
    await abrirEdicion(page);
    await expect(page.getByTestId('horarios-rige-hoy')).toContainText(TEXTO_VIGENTE);
    await expect(page.getByTestId('horarios-desde-manana-bloque')).toBeHidden();
    await expect(page.getByTestId('aviso-rigen-manana')).toHaveText('Los cambios rigen desde mañana');
    await expect(page.getByTestId('btn-guardar-horarios')).toBeEnabled();
    await sinScrollHorizontal(page);
  });

  test('un turno que cruza muestra la leyenda con el día real y el resumen dice "día siguiente"', async ({ page }) => {
    await abrirComoDueno(page);
    await abrirEdicion(page);
    await cargarFranjas(page, [{ dia: 'VIERNES', desde: '20:00', hasta: '02:00' }]);
    const fila = page.getByTestId('fila-horario').first();
    await expect(fila.getByTestId('leyenda-cruce-horario')).toHaveText('Termina el sábado a las 02:00');
    await fila.getByTestId('input-cierre-horario').fill('23:00');
    await expect(fila.getByTestId('leyenda-cruce-horario')).toBeHidden();
    await fila.getByTestId('input-cierre-horario').fill('02:00');
    await fila.getByTestId('select-dia-horario').selectOption('DOMINGO');
    await expect(fila.getByTestId('leyenda-cruce-horario')).toHaveText('Termina el lunes a las 02:00');
    await page.getByTestId('tab-horario-fijo').click();
    await expect(page.getByTestId('resumen-horarios-cargados')).toContainText('Domingo: 20:00 a 02:00 (día siguiente)');
    await expect(page.getByTestId('resumen-horarios-cargados')).not.toContainText('+1');
    await sinScrollHorizontal(page);
  });

  test('el horario fijo avisa si el turno cruza la medianoche', async ({ page }) => {
    await abrirComoDueno(page);
    await abrirEdicion(page);
    const dia = DIAS_DE_LA_SEMANA[(diaDeLaSemanaEnZona() + 2) % 7];
    await page.getByTestId(`chip-dia-franja-rapida-${dia.codigo}`).click();
    await page.getByTestId('input-franja-rapida-desde').fill('21:00');
    await page.getByTestId('input-franja-rapida-hasta').fill('03:00');
    await expect(page.getByTestId('leyenda-cruce-franja-rapida')).toHaveText('Cada turno termina al día siguiente a las 03:00');
    await page.getByTestId('btn-aplicar-franja-rapida').click();
    await expect(page.getByTestId('resumen-horarios-cargados')).toContainText(`${dia.nombre}: 21:00 a 03:00 (día siguiente)`);
  });

  test('cierre igual a apertura y superposición circular se rechazan cerca del campo', async ({ page }) => {
    await abrirComoDueno(page);
    await abrirEdicion(page);
    await cargarFranjas(page, [{ dia: 'LUNES', desde: '09:00', hasta: '09:00' }]);
    await expect(page.getByTestId('mensaje-error-horarios')).toContainText('no puede ser igual a la de apertura');
    await cargarFranjas(page, [
      { dia: 'DOMINGO', desde: '22:00', hasta: '03:00' },
      { dia: 'LUNES', desde: '01:00', hasta: '05:00' },
    ]);
    await expect(page.getByTestId('mensaje-error-horarios')).toContainText('El turno del domingo de 22:00 a 03:00 se superpone con el del lunes de 01:00 a 05:00');
    await page.getByTestId('btn-guardar-horarios').click();
    await expect(page.getByTestId('mensaje-error-horarios')).toBeVisible();
    await expect(page.locator('.toast')).toHaveCount(0);
  });

  test('el Dueño programa un cambio, ve "Desde mañana" y lo cancela', async ({ page, request }) => {
    await abrirComoDueno(page);
    await abrirEdicion(page);
    await cargarFranjas(page, [{ dia: 'VIERNES', desde: '20:00', hasta: '02:00' }]);
    await page.getByTestId('btn-guardar-horarios').click();
    await expect(page.locator('.toast')).toContainText('Horarios guardados. Rigen desde mañana.');

    const perfil = await perfilDelComercio(request);
    expect(perfil.horarios).toHaveLength(1);
    expect(perfil.horariosPendientes).toHaveLength(1);
    expect(perfil.horariosPendientes[0].cruzaMedianoche).toBe(true);

    await abrirEdicion(page);
    await expect(page.getByTestId('horarios-rige-hoy')).toContainText(TEXTO_VIGENTE);
    await expect(page.getByTestId('horarios-desde-manana-bloque')).toBeVisible();
    await expect(page.getByTestId('horarios-desde-manana')).toContainText('Viernes: 20:00 a 02:00 (día siguiente)');
    await sinScrollHorizontal(page);

    await page.getByTestId('btn-cancelar-cambio-horarios').click();
    await expect(page.locator('.toast')).toContainText('Cambio de horarios cancelado');
    await expect(page.getByTestId('horarios-desde-manana-bloque')).toBeHidden();
    const despues = await perfilDelComercio(request);
    expect(despues.horariosPendientes).toHaveLength(0);
    expect(despues.horarios).toHaveLength(1);
  });

  test('si la cola del turno de hoy se pisa con la franja de mañana, el mensaje del servidor sale en el campo', async ({ page }) => {
    reemplazarHorarios(dueno.comercioId, [{ diaSemana: diaDeHoy(), horaApertura: '20:00', horaCierre: '02:00' }]);
    await abrirComoDueno(page);
    await abrirEdicion(page);
    await cargarFranjas(page, [{ dia: diaDistintoDeHoy(), desde: '01:00', hasta: '05:00' }]);
    await expect(page.getByTestId('mensaje-error-horarios')).toBeHidden();
    await page.getByTestId('btn-guardar-horarios').click();
    await expect(page.getByTestId('mensaje-error-horarios')).toContainText('Tu turno de hoy');
    await expect(page.getByTestId('mensaje-error-horarios')).toContainText('Movela para que empiece después de las 02:00');
    await expect(page.locator('.toast')).toHaveCount(0);
  });

  test('el Empleado tiene "Editar horarios" como fila propia y edita igual que el Dueño', async ({ page, request }) => {
    await abrirComoEmpleado(page);
    await page.goto('/comercio-perfil.html');
    await expect(page.getByTestId('btn-editar-datos-comercio')).toContainText('Editar datos del comercio');
    await expect(page.getByTestId('btn-editar-horarios')).toContainText('Editar horarios');
    await abrirEdicion(page);
    await cargarFranjas(page, [{ dia: 'SABADO', desde: '19:00', hasta: '01:00' }]);
    await expect(page.getByTestId('fila-horario').first().getByTestId('leyenda-cruce-horario')).toHaveText('Termina el domingo a las 01:00');
    await page.getByTestId('btn-guardar-horarios').click();
    await expect(page.locator('.toast')).toContainText('Horarios guardados. Rigen desde mañana.');
    await page.getByTestId('btn-ver-datos-comercio').click();
    await expect(page.getByTestId('empleado-horarios')).toContainText('Desde mañana');
    await expect(page.getByTestId('empleado-horario-pendiente')).toContainText('Sábado: 19:00 a 01:00 (día siguiente)');
    const perfil = await perfilDelComercio(request);
    expect(perfil.horariosPendientes).toHaveLength(1);
    await sinScrollHorizontal(page);
  });

  test('con el comercio suspendido el Empleado recibe el aviso fijo y no se guarda nada', async ({ page, request }) => {
    await abrirComoEmpleado(page);
    await abrirEdicion(page);
    ponerEstadoComercio(dueno.comercioId, 'SUSPENDIDO');
    await cargarFranjas(page, [{ dia: 'MARTES', desde: '10:00', hasta: '18:00' }]);
    await page.getByTestId('btn-guardar-horarios').click();
    await expect(page.getByTestId('mensaje-banner-editar-horarios').getByTestId('aviso-fijo')).toBeVisible();
    await expect(page.locator('.toast')).toHaveCount(0);
    ponerEstadoComercio(dueno.comercioId, 'APTO_VENTA');
    const perfil = await perfilDelComercio(request);
    expect(perfil.horariosPendientes).toHaveLength(0);
  });

  test('las pantallas con el asistente de horarios cargan sin errores de consola y sin scroll horizontal a 375 px', async ({ page }) => {
    const errores: string[] = [];
    page.on('pageerror', (error) => errores.push(error.message));
    page.on('console', (mensaje) => {
      if (mensaje.type() === 'error' && !mensaje.text().includes('Failed to load resource')) errores.push(mensaje.text());
    });
    async function revelar(selector: string) {
      await page.evaluate((paso) => {
        document.querySelectorAll('section[id^="step-"]').forEach((seccion) => seccion.classList.add('is-hidden'));
        document.querySelector(paso)!.classList.remove('is-hidden');
      }, selector);
      await expect(page.getByTestId('tab-horario-personalizado')).toBeVisible();
      await page.getByTestId('tab-horario-personalizado').click();
      await page.getByTestId('btn-agregar-horario').click();
      const fila = page.getByTestId('fila-horario').last();
      await fila.getByTestId('select-dia-horario').selectOption('JUEVES');
      await fila.getByTestId('input-apertura-horario').fill('21:00');
      await fila.getByTestId('input-cierre-horario').fill('03:00');
      await expect(fila.getByTestId('leyenda-cruce-horario')).toHaveText('Termina el viernes a las 03:00');
      await sinScrollHorizontal(page);
    }

    await page.goto('/registro-comercio.html');
    await revelar('#step-3');

    await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: dueno.comercioId, ultimoComercioId: dueno.comercioId });
    await page.goto('/agregar-comercio.html');
    await revelar('#step-2');

    await abrirComoUsuario(page, rechazado.sesion);
    await page.goto(`/comercio-corregir.html?id=${rechazado.comercioId}`);
    await expect(page.locator('#step-progress-container')).toBeVisible();
    await expect(page.getByTestId('input-nombre')).not.toHaveValue('');
    await revelar('#step-horarios');

    expect(errores).toEqual([]);
  });

  test('sin errores de consola en toda la edición', async () => {
    expect(erroresDeConsola).toEqual([]);
  });
});
