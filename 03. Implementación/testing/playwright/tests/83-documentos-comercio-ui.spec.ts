import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  PDF_DE_PRUEBA,
  apiPut,
  documentacionRequeridaTest,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  subirDocumentoTest,
} from './helpers/backend';
import type { HorarioInput, SesionApi } from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { abrirComoUsuario, prepararAprobado } from './helpers/multicomercio';
import { abrirComoUsuarioConComercio } from './helpers/selector';
import { abrirComoUsuarioConContexto, sumarAlEquipo } from './helpers/empleado';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

const MB = 1024 * 1024;
const CARPETA_CAPTURAS = path.resolve(__dirname, '../../../docs/capturas-documentos');
const FIXTURE_PDF = path.resolve(__dirname, '../fixtures/documento-prueba.pdf');
const FIXTURE_PNG = path.resolve(__dirname, '../fixtures/bajonea-e2e-producto.png');
const FIXTURE_EXE = path.resolve(__dirname, '../fixtures/ejecutable-renombrado.pdf');
const todoElDia = (): HorarioInput[] => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
const estadoComercio = (comercioId: number): string => sql(`SELECT estado FROM comercio WHERE id = ${comercioId};`);

async function captura(page: Page, nombre: string, paginaCompleta = false) {
  fs.mkdirSync(CARPETA_CAPTURAS, { recursive: true });
  await page.screenshot({ path: path.join(CARPETA_CAPTURAS, `${nombre}.png`), fullPage: paginaCompleta });
}

function pdfDe(bytes: number): Buffer {
  const contenido = Buffer.alloc(bytes);
  PDF_DE_PRUEBA.copy(contenido);
  return contenido;
}

async function objetivosTactilesValidos(page: Page, selector: string) {
  const cajas = await page.locator(selector).evaluateAll((nodos) =>
    nodos.map((nodo) => {
      const caja = nodo.getBoundingClientRect();
      return { nombre: nodo.getAttribute('data-testid') || nodo.textContent || '', ancho: caja.width, alto: caja.height };
    }),
  );
  for (const caja of cajas) {
    expect(Math.min(caja.ancho, caja.alto), `objetivo táctil de ${caja.nombre}`).toBeGreaterThanOrEqual(43.5);
  }
}

test.describe('Fase 4 (UI): documentos del comercio, entrega B', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  let adminSesion: SesionApi;
  let adminToken: string;
  let localidadId: string;

  async function relogAdmin(request: APIRequestContext) {
    adminSesion = await fijarPasswordAdminYLoguear(request);
    adminToken = adminSesion.token;
  }

  async function nuevoDueno(request: APIRequestContext, conMercadoPago: boolean): Promise<Dueno> {
    return prepararAprobado(request, adminToken, localidadId, conMercadoPago, todoElDia());
  }

  async function subirPorApi(request: APIRequestContext, dueno: Dueno, opciones: Parameters<typeof subirDocumentoTest>[3] = { tipo: 'LIBRETA_SANITARIA' }): Promise<number> {
    const respuesta = await subirDocumentoTest(request, dueno.token, dueno.comercioId, opciones);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
    return respuesta.body.data.id as number;
  }

  async function resolverPorApi(request: APIRequestContext, documentoId: number, aprobar: boolean, motivo?: string) {
    const respuesta = await apiPut(request, `/administrador/documentos/${documentoId}/resolver`, { aprobar, motivo }, adminToken);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
  }

  async function abrirDueno(page: Page, dueno: Dueno, ruta: string) {
    await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: dueno.comercioId });
    await page.goto(ruta);
  }

  test.beforeAll(async ({ request }) => {
    await relogAdmin(request);
    localidadId = await obtenerLocalidadRioGrande(request);
    await documentacionRequeridaTest(request, true);
  });

  test.afterAll(async ({ request }) => {
    await documentacionRequeridaTest(request, false);
  });

  test.describe('Panel del Dueño: bloque "Para empezar a vender"', () => {
    test('momento 1: recién aprobado, con los tres pasos y sin el aviso viejo de Mercado Pago', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, false);
      await abrirDueno(page, dueno, '/comercio-dashboard.html');

      const bloque = page.getByTestId('pasos-vender');
      await expect(bloque).toBeVisible();
      await expect(page.getByTestId('titulo-pasos-vender')).toHaveText('Para empezar a vender');
      await expect(page.getByTestId('paso-aprobado')).toHaveAttribute('data-estado', 'hecho');
      await expect(page.getByTestId('titulo-paso-aprobado')).toHaveText('Comercio aprobado');
      await expect(page.getByTestId('paso-mercadopago')).toHaveAttribute('data-estado', 'pendiente');
      await expect(page.getByTestId('paso-mercadopago')).toHaveAttribute('aria-current', 'step');
      await expect(page.getByTestId('titulo-paso-mercadopago')).toHaveText('Vincular Mercado Pago');
      await expect(page.getByTestId('texto-paso-mercadopago')).toHaveText('Es la cuenta donde vas a cobrar tus ventas.');
      await expect(page.getByTestId('btn-pasos-vincular-mp')).toHaveText('Vincular ahora');
      await expect(page.getByTestId('titulo-paso-documentacion')).toHaveText('Subir documentación');
      await expect(page.getByTestId('texto-paso-documentacion')).toHaveText('Habilitación comercial, carnet de manipulación o libreta sanitaria. La revisamos y te avisamos.');
      await expect(page.getByTestId('btn-pasos-subir-documentacion')).toHaveText('Subir documentación');
      await expect(page.getByTestId('btn-pasos-subir-documentacion')).toHaveClass(/btn-secondary/);
      await expect(page.getByText('Vinculá Mercado Pago para empezar a vender')).toHaveCount(0);

      await sinScrollHorizontal(page);
      await objetivosTactilesValidos(page, '[data-testid="btn-pasos-vincular-mp"], [data-testid="btn-pasos-subir-documentacion"]');
      await captura(page, '01-panel-momento-1');
    });

    test('"Vincular ahora" usa el flujo de vinculación existente', async ({ page, request, baseURL }) => {
      const dueno = await nuevoDueno(request, false);
      await page.route('**/oauth/mercadopago/iniciar', (ruta) =>
        ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mensaje: 'ok', data: { url: `${baseURL}/comercio-perfil.html?vista=mercadopago` } }) }),
      );
      await abrirDueno(page, dueno, '/comercio-dashboard.html');
      await page.getByTestId('btn-pasos-vincular-mp').click();
      await page.waitForURL('**/comercio-perfil.html**');
      await expect(page.getByTestId('mp-estado-pendiente')).toBeVisible();
    });

    test('momento 2: con Mercado Pago y un documento en revisión, el paso de documentación espera la aprobación', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, true);
      await subirPorApi(request, dueno);
      await abrirDueno(page, dueno, '/comercio-dashboard.html');

      await expect(page.getByTestId('paso-mercadopago')).toHaveAttribute('data-estado', 'hecho');
      await expect(page.getByTestId('titulo-paso-mercadopago')).toHaveText('Mercado Pago vinculado');
      await expect(page.getByTestId('paso-documentacion')).toHaveAttribute('data-estado', 'revision');
      await expect(page.getByTestId('titulo-paso-documentacion')).toHaveText('Documentación en revisión');
      await expect(page.getByTestId('texto-paso-documentacion')).toHaveText('Tenés 1 documento esperando la aprobación. Te avisamos cuando esté.');
      await expect(page.getByTestId('btn-pasos-ver-documentacion')).toHaveText('Ver documentación');
      await captura(page, '02-panel-momento-2');

      await subirPorApi(request, dueno, { tipo: 'HABILITACION_COMERCIAL' });
      await page.reload();
      await expect(page.getByTestId('texto-paso-documentacion')).toHaveText('Tenés 2 documentos esperando la aprobación. Te avisamos cuando esté.');

      await page.getByTestId('btn-pasos-ver-documentacion').click();
      await page.waitForURL('**/comercio-documentacion.html**');
      await expect(page.getByTestId('titulo-seccion-en-revision')).toHaveText('En revisión · 2');
    });

    test('con un documento rechazado y ninguno aprobado, el paso pide atención', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, true);
      const id = await subirPorApi(request, dueno);
      await resolverPorApi(request, id, false, 'La foto está borrosa');
      await abrirDueno(page, dueno, '/comercio-dashboard.html');

      await expect(page.getByTestId('paso-documentacion')).toHaveAttribute('data-estado', 'atencion');
      await expect(page.getByTestId('titulo-paso-documentacion')).toHaveText('Tenés un documento rechazado');
      await expect(page.getByTestId('btn-pasos-ver-documentacion')).toBeVisible();
      await captura(page, '03-panel-documento-rechazado');
    });

    test('momento 3: al aprobarse el último paso se muestra una vez el aviso de éxito y después el bloque desaparece', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, true);
      const id = await subirPorApi(request, dueno);
      await abrirDueno(page, dueno, '/comercio-dashboard.html');
      await expect(page.getByTestId('pasos-vender')).toBeVisible();

      await resolverPorApi(request, id, true);
      expect(estadoComercio(dueno.comercioId)).toBe('APTO_VENTA');
      await page.reload();

      await expect(page.getByTestId('titulo-pasos-vender')).toHaveText('Todo listo');
      for (const paso of ['aprobado', 'mercadopago', 'documentacion']) {
        await expect(page.getByTestId(`paso-${paso}`)).toHaveAttribute('data-estado', 'hecho');
      }
      await expect(page.getByTestId('titulo-paso-documentacion')).toHaveText('Documentación aprobada');
      await expect(page.getByTestId('btn-pasos-ver-documentacion')).toHaveText('Ver documentación');
      await expect(page.getByTestId('aviso-pasos-completos')).toHaveText('Tu comercio ya puede recibir pedidos.');
      await captura(page, '04-panel-momento-3');

      await page.getByTestId('btn-pasos-entendido').click();
      await expect(page.getByTestId('pasos-vender')).toHaveCount(0);
      await page.reload();
      await expect(page.getByTestId('pasos-vender')).toHaveCount(0);
    });

    test('un comercio ya apto para vender no muestra el bloque, y si pierde la aptitud reaparece con lo que falta', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, true);
      const id = await subirPorApi(request, dueno);
      await resolverPorApi(request, id, true);
      await abrirDueno(page, dueno, '/comercio-dashboard.html');
      await expect(page.getByTestId('metricas-dashboard')).toBeVisible();
      await expect(page.getByTestId('pasos-vender')).toHaveCount(0);

      await resolverPorApi(request, id, false, 'Se venció el documento');
      expect(estadoComercio(dueno.comercioId)).toBe('APROBADO');
      await page.reload();
      await expect(page.getByTestId('pasos-vender')).toBeVisible();
      await expect(page.getByTestId('titulo-paso-documentacion')).toHaveText('Tenés un documento rechazado');
    });

    test('el aviso del panel "Tus comercios" lleva a los pasos del panel', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, false);
      await abrirDueno(page, dueno, '/comercio-dashboard.html');
      await page.getByTestId('franja-comercio').click();
      const aviso = page.getByTestId('aviso-pasos-vender');
      await expect(aviso).toContainText('Te faltan pasos para empezar a vender');
      await captura(page, '05-panel-comercios-aviso');
      await page.getByTestId('btn-aviso-pasos-vender').click();
      await page.waitForURL('**/comercio-dashboard.html');
      await expect(page.getByTestId('pasos-vender')).toBeVisible();
    });

    test('el Empleado no ve el bloque ni el acceso a la documentación', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, false);
      const cuenta = await registrarYVerificarCliente(request, localidadId);
      const sesion = await login(request, cuenta.nombreUsuario, cuenta.password);
      await sumarAlEquipo(request, dueno.comercioId, cuenta, dueno.token);
      await abrirComoUsuarioConContexto(page, sesion, { contexto: { tipo: 'EMPLEADO', comercioId: dueno.comercioId } });
      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId('metricas-dashboard')).toBeVisible();
      await expect(page.getByTestId('pasos-vender')).toHaveCount(0);
      await page.goto('/comercio-perfil.html');
      await expect(page.getByTestId('btn-ver-datos-comercio')).toBeVisible();
      await expect(page.getByTestId('btn-ir-documentacion')).toHaveCount(0);
      await page.goto('/comercio-documentacion.html');
      await page.waitForURL('**/comercio-dashboard.html');
    });
  });

  test.describe('Pantalla "Documentación" del Dueño', () => {
    test('el perfil del Dueño tiene el acceso y la pantalla vacía explica qué subir', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, true);
      await abrirDueno(page, dueno, '/comercio-perfil.html');
      await page.getByTestId('btn-ir-documentacion').click();
      await page.waitForURL('**/comercio-documentacion.html');

      await expect(page.getByTestId('titulo-documentacion')).toHaveText('Documentación');
      await expect(page.getByTestId('aviso-sin-documentos')).toHaveText('Para vender necesitás al menos un documento aprobado. Lo revisamos y te avisamos por acá.');
      await expect(page.getByTestId('tarjeta-que-podes-subir')).toContainText('Qué podés subir');
      await expect(page.getByTestId('tipo-documento-LIBRETA_SANITARIA')).toHaveText('Libreta sanitaria');
      await expect(page.getByTestId('tipo-documento-CARNET_MANIPULACION_ALIMENTOS')).toHaveText('Carnet de manipulación de alimentos');
      await expect(page.getByTestId('tipo-documento-HABILITACION_COMERCIAL')).toHaveText('Habilitación comercial');
      await expect(page.getByTestId('tipo-documento-OTRO')).toHaveText('Otro documento (con una descripción)');
      await expect(page.getByTestId('btn-subir-documento')).toBeEnabled();
      await expect(page.getByTestId('leyenda-formatos')).toHaveText('Aceptamos PDF, JPG, PNG o WebP de hasta 8 MB.');
      await sinScrollHorizontal(page);
      await captura(page, '06-documentacion-vacia', true);

      await page.getByTestId('btn-volver-documentacion').click();
      await page.waitForURL('**/comercio-perfil.html');
    });

    test('subir un documento: la hoja pide los datos, muestra "Subiendo…" una sola vez y deja la lista actualizada', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, true);
      await abrirDueno(page, dueno, '/comercio-documentacion.html');
      const boton = page.getByTestId('btn-subir-documento');
      await boton.click();

      const hoja = page.getByTestId('hoja-subir-documento');
      await expect(hoja).toBeVisible();
      await expect(hoja).toHaveAttribute('role', 'dialog');
      await expect(page.getByTestId('titulo-hoja-subir')).toHaveText('Subir documento');
      await expect(page.getByTestId('select-documento-tipo')).toBeFocused();
      await expect(page.getByTestId('campo-documento-descripcion')).toBeHidden();
      await expect(page.getByTestId('ayuda-documento-archivo')).toHaveText('PDF, JPG, PNG o WebP de hasta 8 MB.');
      await captura(page, '07-hoja-subir-vacia');

      await page.getByTestId('btn-subir-documento-confirmar').click();
      await expect(page.getByTestId('error-documento-tipo')).toHaveText('Elegí el tipo de documento');
      await expect(page.getByTestId('error-documento-archivo')).toHaveText('Elegí el archivo que vas a subir');
      await captura(page, '08-hoja-subir-errores');

      await page.getByTestId('select-documento-tipo').selectOption('LIBRETA_SANITARIA');
      await page.getByTestId('input-documento-archivo').setInputFiles(FIXTURE_PDF);
      await expect(page.getByTestId('archivo-elegido-nombre')).toHaveText('documento-prueba.pdf');
      await expect(page.getByTestId('btn-quitar-archivo')).toBeVisible();
      await captura(page, '09-hoja-subir-archivo-elegido');

      let subidas = 0;
      await page.route('**/comercios/documentos', async (ruta) => {
        if (ruta.request().method() === 'POST') {
          subidas += 1;
          await new Promise((resolver) => setTimeout(resolver, 900));
        }
        await ruta.continue();
      });
      const confirmar = page.getByTestId('btn-subir-documento-confirmar');
      await confirmar.dblclick();
      await expect(confirmar).toHaveText('Subiendo…');
      await expect(confirmar).toBeDisabled();
      await captura(page, '10-hoja-subiendo');

      await expect(page.locator('.toast')).toContainText('Documento enviado. Lo estamos revisando.');
      await expect(hoja).toHaveCount(0);
      expect(subidas).toBe(1);
      await expect(boton).toBeFocused();
      await expect(page.getByTestId('titulo-seccion-en-revision')).toHaveText('En revisión · 1');
      const fila = page.locator('[data-testid^="doc-fila-"]').first();
      await expect(fila).toContainText('Libreta sanitaria');
      await expect(fila).toContainText('documento-prueba.pdf');
      expect(Number(sql(`SELECT COUNT(*) FROM documento_comercio WHERE comercio_id = ${dueno.comercioId};`))).toBe(1);
    });

    test('"Otro documento" pide una descripción, que aparece con su ayuda', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, true);
      await abrirDueno(page, dueno, '/comercio-documentacion.html');
      await page.getByTestId('btn-subir-documento').click();
      await page.getByTestId('select-documento-tipo').selectOption('OTRO');
      await expect(page.getByTestId('campo-documento-descripcion')).toBeVisible();
      await expect(page.getByText('Contanos qué documento es, así lo revisamos más rápido.')).toBeVisible();
      await page.getByTestId('input-documento-archivo').setInputFiles(FIXTURE_PNG);
      await page.getByTestId('btn-subir-documento-confirmar').click();
      await expect(page.getByTestId('error-documento-descripcion')).toHaveText('Contanos qué documento es');
      await captura(page, '11-hoja-otro-descripcion');

      await page.getByTestId('input-documento-descripcion').fill('Certificado de bromatología');
      await page.getByTestId('btn-subir-documento-confirmar').click();
      await expect(page.locator('.toast')).toContainText('Documento enviado');
      await expect(page.locator('[data-testid^="doc-nombre-"]').first()).toHaveText('Certificado de bromatología');
    });

    test('un archivo demasiado grande se frena en el cliente con el mensaje claro y sin enviar nada', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, true);
      await abrirDueno(page, dueno, '/comercio-documentacion.html');
      let envios = 0;
      page.on('request', (r) => {
        if (r.method() === 'POST' && r.url().includes('/comercios/documentos')) envios += 1;
      });
      await page.getByTestId('btn-subir-documento').click();
      await page.getByTestId('select-documento-tipo').selectOption('LIBRETA_SANITARIA');
      await page.getByTestId('input-documento-archivo').setInputFiles({ name: 'grande.pdf', mimeType: 'application/pdf', buffer: pdfDe(Math.round(11.4 * MB)) });

      const error = page.getByTestId('error-documento-archivo');
      await expect(error).toHaveText('El archivo pesa 11,4 MB y el máximo es 8 MB. Probá sacando la foto con menos calidad o subí un PDF más liviano.');
      await expect(error).toHaveAttribute('role', 'alert');
      await expect(page.getByTestId('btn-subir-documento-confirmar')).toBeDisabled();
      await captura(page, '12-hoja-error-tamano');

      await page.getByTestId('btn-quitar-archivo').click();
      await expect(error).toBeHidden();
      await expect(page.getByTestId('btn-subir-documento-confirmar')).toBeEnabled();
      expect(envios).toBe(0);
    });

    test('un formato no permitido se frena en el cliente y un ejecutable disfrazado de PDF lo rechaza el servidor con un mensaje claro', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, true);
      await abrirDueno(page, dueno, '/comercio-documentacion.html');
      await page.getByTestId('btn-subir-documento').click();
      await page.getByTestId('select-documento-tipo').selectOption('LIBRETA_SANITARIA');
      await page.getByTestId('input-documento-archivo').setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') });
      await expect(page.getByTestId('error-documento-archivo')).toHaveText('Ese formato no está permitido. Subí un archivo PDF, JPG, PNG o WebP.');
      await expect(page.getByTestId('btn-subir-documento-confirmar')).toBeDisabled();

      await page.getByTestId('btn-quitar-archivo').click();
      await page.getByTestId('input-documento-archivo').setInputFiles(FIXTURE_EXE);
      await page.getByTestId('btn-subir-documento-confirmar').click();
      const error = page.getByTestId('error-subida-documento');
      await expect(error).toContainText('Solo se aceptan archivos PDF, JPG, PNG o WebP');
      await expect(error).toContainText('Si es una foto, guardala como JPG o PNG.');
      await expect(error).toHaveAttribute('role', 'alert');
      await expect(page.getByTestId('btn-subir-documento-confirmar')).toBeEnabled();
      await captura(page, '13-hoja-error-formato-servidor');
    });

    test('si un archivo de más de 16 MB llega al servidor, la pantalla muestra el mismo mensaje claro de tamaño', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, true);
      await page.route('**/comercios/documentos/requisitos', async (ruta) => {
        const respuesta = await ruta.fetch();
        const cuerpo = await respuesta.json();
        cuerpo.data.maxBytes = 40 * MB;
        await ruta.fulfill({ response: respuesta, json: cuerpo });
      });
      await abrirDueno(page, dueno, '/comercio-documentacion.html');
      await page.getByTestId('btn-subir-documento').click();
      await page.getByTestId('select-documento-tipo').selectOption('LIBRETA_SANITARIA');
      await page.getByTestId('input-documento-archivo').setInputFiles({ name: 'enorme.pdf', mimeType: 'application/pdf', buffer: pdfDe(Math.round(17.5 * MB)) });
      await expect(page.getByTestId('error-documento-archivo')).toBeHidden();
      await page.getByTestId('btn-subir-documento-confirmar').click();

      const error = page.getByTestId('error-subida-documento');
      await expect(error).toContainText(/El archivo pesa 17,\d MB y el máximo es 8 MB/, { timeout: 60_000 });
      await expect(error).toContainText('Probá sacando la foto con menos calidad o subí un PDF más liviano.');
      await captura(page, '14-hoja-error-tamano-servidor');
      expect(Number(sql(`SELECT COUNT(*) FROM documento_comercio WHERE comercio_id = ${dueno.comercioId};`))).toBe(0);
    });

    test('las secciones se agrupan por estado, con el motivo del rechazo y las acciones que corresponden a cada una', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, true);
      const rechazado = await subirPorApi(request, dueno, { tipo: 'CARNET_MANIPULACION_ALIMENTOS' });
      const aprobado = await subirPorApi(request, dueno, { tipo: 'HABILITACION_COMERCIAL' });
      await subirPorApi(request, dueno, { tipo: 'LIBRETA_SANITARIA' });
      await resolverPorApi(request, rechazado, false, 'Falta la firma del titular');
      await resolverPorApi(request, aprobado, true);
      await abrirDueno(page, dueno, '/comercio-documentacion.html');

      await expect(page.locator('[data-testid^="titulo-seccion-"]')).toHaveText(['Rechazados · 1', 'En revisión · 1', 'Aprobados · 1']);
      await expect(page.getByTestId('titulo-seccion-rechazados')).toHaveCSS('color', 'rgb(217, 48, 37)');

      const tarjeta = page.getByTestId(`doc-fila-${rechazado}`);
      await expect(tarjeta).toContainText('Carnet de manipulación de alimentos');
      await expect(page.getByTestId(`doc-motivo-${rechazado}`)).toHaveText('Motivo: Falta la firma del titular');
      await expect(page.getByTestId(`btn-subir-nuevo-${rechazado}`)).toHaveText('Subir uno nuevo');
      await expect(tarjeta.locator('[data-testid^="btn-eliminar-documento-"]')).toHaveCount(0);

      await expect(page.getByTestId(`btn-ver-documento-${aprobado}`)).toHaveAttribute('aria-label', 'Ver habilitación comercial');
      await expect(page.getByTestId(`doc-fila-${aprobado}`).locator('[data-testid^="btn-eliminar-documento-"]')).toHaveCount(0);

      const enRevision = page.locator('[data-testid="lista-documentos-en-revision"] [data-testid^="doc-fila-"]');
      await expect(enRevision).toHaveCount(1);
      await expect(enRevision.locator('button').nth(0)).toHaveAttribute('aria-label', 'Ver libreta sanitaria');
      await expect(enRevision.locator('button').nth(1)).toHaveAttribute('aria-label', 'Eliminar libreta sanitaria');

      await expect(page.getByTestId('ayuda-documentos')).toHaveText('Aceptamos PDF, JPG, PNG o WebP de hasta 8 MB. Podés tener hasta 5 documentos en revisión. Usaste 3 de 20.');
      await sinScrollHorizontal(page);
      await objetivosTactilesValidos(page, '.doc-icono-btn, [data-testid^="btn-subir-nuevo-"], [data-testid="btn-subir-documento"]');
      await captura(page, '15-documentacion-por-estado', true);

      await page.getByTestId(`btn-subir-nuevo-${rechazado}`).click();
      await expect(page.getByTestId('select-documento-tipo')).toHaveValue('CARNET_MANIPULACION_ALIMENTOS');
      await captura(page, '16-hoja-subir-uno-nuevo');
    });

    test('eliminar un documento en revisión pide confirmación, avisa y devuelve el foco', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, true);
      const id = await subirPorApi(request, dueno);
      await abrirDueno(page, dueno, '/comercio-documentacion.html');
      const eliminar = page.getByTestId(`btn-eliminar-documento-${id}`);
      await eliminar.click();

      const modal = page.getByTestId('modal-eliminar-documento');
      await expect(modal.getByRole('alertdialog')).toBeVisible();
      await expect(page.getByTestId('titulo-eliminar-documento')).toHaveText('¿Eliminar este documento?');
      await expect(page.getByTestId('btn-cancelar-eliminar-documento')).toBeFocused();
      await captura(page, '17-modal-eliminar');

      await page.getByTestId('btn-cancelar-eliminar-documento').click();
      await expect(modal).toHaveCount(0);
      await expect(eliminar).toBeFocused();
      expect(Number(sql(`SELECT COUNT(*) FROM documento_comercio WHERE id = ${id};`))).toBe(1);

      await eliminar.click();
      await page.getByTestId('btn-confirmar-eliminar-documento').click();
      await expect(page.locator('.toast')).toContainText('Documento eliminado');
      await expect(page.getByTestId(`doc-fila-${id}`)).toHaveCount(0);
      await expect(page.getByTestId('aviso-sin-documentos')).toBeVisible();
      expect(Number(sql(`SELECT COUNT(*) FROM documento_comercio WHERE id = ${id};`))).toBe(0);
    });

    test('si el Administrador resolvió el documento mientras tanto, eliminar explica qué pasó y refresca la lista', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, true);
      const id = await subirPorApi(request, dueno);
      await abrirDueno(page, dueno, '/comercio-documentacion.html');
      await expect(page.getByTestId(`btn-eliminar-documento-${id}`)).toBeVisible();
      await resolverPorApi(request, id, true);

      await page.getByTestId(`btn-eliminar-documento-${id}`).click();
      await page.getByTestId('btn-confirmar-eliminar-documento').click();
      await expect(page.getByTestId('aviso-fijo-texto')).toHaveText('Solo podés eliminar documentos que todavía están en revisión');
      await expect(page.getByTestId('titulo-seccion-aprobados')).toHaveText('Aprobados · 1');
      await expect(page.getByTestId('titulo-seccion-en-revision')).toHaveCount(0);
      await captura(page, '18-eliminar-documento-ya-resuelto');
    });

    test('con 5 documentos en revisión el botón se deshabilita y explica por qué', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, true);
      for (let i = 0; i < 5; i += 1) {
        await subirPorApi(request, dueno);
      }
      await abrirDueno(page, dueno, '/comercio-documentacion.html');
      await expect(page.getByTestId('btn-subir-documento')).toBeDisabled();
      await expect(page.getByTestId('explicacion-subida-deshabilitada')).toHaveText('Ya tenés 5 documentos en revisión. Esperá a que los revisemos para subir otro.');
      await expect(page.getByTestId('btn-subir-documento')).toHaveAttribute('aria-describedby', 'doc-explicacion-subida');
      await captura(page, '19-cupo-de-revision');
    });

    test('cerrar la hoja con datos cargados pide confirmación de descarte y cuida el foco', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, true);
      await abrirDueno(page, dueno, '/comercio-documentacion.html');
      const abrir = page.getByTestId('btn-subir-documento');
      await abrir.click();
      await page.getByTestId('btn-cancelar-subida').click();
      await expect(page.getByTestId('hoja-subir-documento')).toHaveCount(0);
      await expect(abrir).toBeFocused();

      await abrir.click();
      await page.getByTestId('select-documento-tipo').selectOption('LIBRETA_SANITARIA');
      await page.getByTestId('input-documento-archivo').setInputFiles(FIXTURE_PDF);
      await page.getByTestId('btn-cerrar-hoja-subir').click();
      const modal = page.getByTestId('modal-descartar-documento');
      await expect(modal.getByRole('alertdialog')).toBeVisible();
      await expect(page.getByTestId('titulo-descartar-documento')).toHaveText('¿Descartar los cambios?');
      await captura(page, '20-modal-descartar');

      await page.getByTestId('btn-seguir-editando-documento').click();
      await expect(modal).toHaveCount(0);
      await expect(page.getByTestId('hoja-subir-documento')).toBeVisible();
      await expect(page.getByTestId('btn-cerrar-hoja-subir')).toBeFocused();

      await page.keyboard.press('Escape');
      await page.getByTestId('btn-descartar-documento').click();
      await expect(page.getByTestId('hoja-subir-documento')).toHaveCount(0);
      await expect(abrir).toBeFocused();
    });

    test('el visor muestra una imagen sin token en la URL, permite abrirla en otra pestaña y devuelve el foco al cerrar', async ({ page, request, context }) => {
      const dueno = await nuevoDueno(request, true);
      const id = await subirPorApi(request, dueno, { tipo: 'HABILITACION_COMERCIAL', nombre: 'habilitacion.png', mime: 'image/png', contenido: fs.readFileSync(FIXTURE_PNG) });
      await abrirDueno(page, dueno, '/comercio-documentacion.html');
      const ver = page.getByTestId(`btn-ver-documento-${id}`);
      await ver.click();

      const visor = page.getByTestId('visor-documento');
      await expect(visor).toBeVisible();
      await expect(visor).toHaveAttribute('role', 'dialog');
      await expect(page.getByTestId('visor-titulo')).toHaveText('Habilitación comercial');
      await expect(page.getByTestId('visor-archivo')).toContainText('habilitacion.png');
      await expect(page.getByTestId('visor-estado')).toHaveText('En revisión');
      const imagen = page.getByTestId('visor-imagen');
      await expect(imagen).toBeVisible();
      expect(await imagen.getAttribute('src')).toMatch(/^blob:/);
      await expect.poll(() => imagen.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
      expect(page.url()).not.toMatch(/token|jwt|bearer/i);
      await captura(page, '21-visor-imagen');

      const nueva = context.waitForEvent('page');
      await page.getByTestId('btn-abrir-pestana-nueva').click();
      expect((await nueva).url()).toMatch(/^blob:/);

      await page.getByTestId('btn-cerrar-visor').click();
      await expect(visor).toHaveCount(0);
      await expect(ver).toBeFocused();
    });

    test('el visor de un PDF usa un marco con la ayuda para el celular, y el de un rechazado muestra el motivo y "Subir uno nuevo"', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, true);
      const id = await subirPorApi(request, dueno, { tipo: 'CARNET_MANIPULACION_ALIMENTOS' });
      await abrirDueno(page, dueno, '/comercio-documentacion.html');
      await page.getByTestId(`btn-ver-documento-${id}`).click();
      const marco = page.getByTestId('visor-pdf');
      await expect(marco).toBeAttached();
      expect(await marco.getAttribute('src')).toMatch(/^blob:/);
      await expect(page.getByTestId('visor-ayuda-pdf')).toHaveText('Si el PDF no se ve bien en tu celular, abrilo en una pestaña nueva.');
      await expect(page.getByTestId('btn-visor-subir-nuevo')).toHaveCount(0);
      await captura(page, '22-visor-pdf');
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('visor-documento')).toHaveCount(0);

      await resolverPorApi(request, id, false, 'El carnet está vencido');
      await page.reload();
      await page.getByTestId(`btn-ver-documento-${id}`).click();
      await expect(page.getByTestId('visor-estado')).toHaveText('Rechazado');
      await expect(page.getByTestId('visor-motivo')).toHaveText('Motivo: El carnet está vencido');
      await captura(page, '23-visor-rechazado');
      await page.getByTestId('btn-visor-subir-nuevo').click();
      await expect(page.getByTestId('visor-documento')).toHaveCount(0);
      await expect(page.getByTestId('select-documento-tipo')).toHaveValue('CARNET_MANIPULACION_ALIMENTOS');
    });

    test('las notificaciones de documentos y de aptitud para vender se leen claras y llevan a donde corresponde', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, true);
      const id = await subirPorApi(request, dueno);
      await resolverPorApi(request, id, true);
      await resolverPorApi(request, id, false, 'Documento vencido');
      await abrirDueno(page, dueno, '/notificaciones.html');

      const tipos = ['DOCUMENTO_APROBADO', 'DOCUMENTO_RECHAZADO', 'COMERCIO_APTO_VENTA', 'COMERCIO_SIN_APTITUD'];
      for (const tipo of tipos) {
        expect(Number(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${dueno.duenoId} AND tipo = '${tipo}';`)), tipo).toBeGreaterThan(0);
      }
      const lista = page.locator('[data-testid^="notificacion-item-"]');
      await expect(lista).toHaveCount(5);
      await expect(page.getByText(/Tu documento «Libreta sanitaria» de .* fue aprobado\./)).toBeVisible();
      await expect(page.getByText(/Se revocó la aprobación de tu documento «Libreta sanitaria» de .*Motivo: Documento vencido/)).toBeVisible();
      await expect(page.getByText(/ya puede recibir pedidos\./)).toBeVisible();
      await expect(page.getByText(/dejó de recibir pedidos/)).toBeVisible();
      await expect(page.locator('[data-testid^="btn-ver-destino-notificacion-"]')).toHaveCount(4);
      await expect(page.getByText('Ver documentación')).toHaveCount(2);
      await expect(page.getByText('Ir al panel')).toHaveCount(1);
      await expect(page.getByText('Ver qué falta')).toHaveCount(1);
      await sinScrollHorizontal(page);
      await captura(page, '24-notificaciones-documentos', true);

      await page.getByText('Ver qué falta').click();
      await page.waitForURL('**/comercio-dashboard.html');
      await expect(page.getByTestId('pasos-vender')).toBeVisible();
      await page.goto('/notificaciones.html');
      await page.getByText('Ver documentación').first().click();
      await page.waitForURL('**/comercio-documentacion.html');
    });
  });

  test.describe('Administrador', () => {
    async function abrirAdmin(page: Page, request: APIRequestContext, ruta: string) {
      await relogAdmin(request);
      await abrirComoUsuario(page, adminSesion);
      await page.goto(ruta);
    }

    function envejecer(documentoId: number, dias: number) {
      sql(`UPDATE documento_comercio SET fecha_subida = DATE_SUB(NOW(), INTERVAL ${dias} DAY) WHERE id = ${documentoId};`);
    }

    test('el panel muestra la tarjeta con el contador y la antigüedad del más viejo, y lleva a la bandeja', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, true);
      const id = await subirPorApi(request, dueno);
      envejecer(id, 400);
      const pendientes = Number(sql('SELECT COUNT(*) FROM documento_comercio WHERE estado = \'PENDIENTE\';'));
      await abrirAdmin(page, request, '/admin-dashboard.html');

      const tarjeta = page.getByTestId('btn-documentos-por-revisar');
      await expect(tarjeta).toContainText('Documentos por revisar');
      await expect(page.getByTestId('contador-documentos-por-revisar')).toHaveText(String(pendientes));
      const diasDelMasViejo = Number(sql("SELECT TIMESTAMPDIFF(DAY, MIN(fecha_subida), NOW()) FROM documento_comercio WHERE estado = 'PENDIENTE';"));
      expect(diasDelMasViejo).toBeGreaterThanOrEqual(400);
      await expect(page.getByTestId('subtitulo-documentos-por-revisar')).toHaveText(`El más antiguo lleva ${diasDelMasViejo} días`);
      await expect(tarjeta).toHaveClass(/alert-card--acento/);
      await expect(page.getByTestId('btn-comercios-pendientes')).toBeVisible();
      await sinScrollHorizontal(page);
      await captura(page, '25-admin-panel');
      await tarjeta.click();
      await page.waitForURL('**/admin-documentos.html');
    });

    test('la bandeja ordena del más antiguo al más nuevo, con la antigüedad y el botón Revisar', async ({ page, request }) => {
      const duenoViejo = await nuevoDueno(request, true);
      const duenoNuevo = await nuevoDueno(request, true);
      const nuevo = await subirPorApi(request, duenoNuevo, { tipo: 'OTRO', descripcion: 'Certificado municipal' });
      const viejo = await subirPorApi(request, duenoViejo);
      envejecer(viejo, 500);
      envejecer(nuevo, 499);
      sql(`UPDATE documento_comercio SET fecha_subida = DATE_SUB(NOW(), INTERVAL 3 HOUR) WHERE id = ${nuevo};`);
      await abrirAdmin(page, request, '/admin-documentos.html');

      await expect(page.getByTestId('titulo-documentos-revisar')).toHaveText('Documentos por revisar');
      await expect(page.getByTestId('resumen-documentos')).toHaveText(/\d+ documentos? esperando revisión/);
      const ids = await page.locator('[data-testid^="bandeja-documento-"]').evaluateAll((n) => n.map((x) => Number(x.getAttribute('data-testid')?.replace('bandeja-documento-', ''))));
      expect(ids.indexOf(viejo)).toBeLessThan(ids.indexOf(nuevo));
      await expect(page.getByTestId(`bandeja-comercio-${viejo}`)).toHaveText(duenoViejo.nombre);
      await expect(page.getByTestId(`bandeja-tipo-${viejo}`)).toHaveText('Libreta sanitaria');
      await expect(page.getByTestId(`bandeja-tipo-${nuevo}`)).toHaveText('Certificado municipal');
      await expect(page.getByTestId(`bandeja-antiguedad-${viejo}`)).toHaveText('Hace 500 días');
      await expect(page.getByTestId(`bandeja-antiguedad-${nuevo}`)).toHaveText('Hace 3 horas');
      await expect(page.getByTestId(`btn-revisar-documento-${viejo}`)).toHaveText(/Revisar/);
      await sinScrollHorizontal(page);
      await objetivosTactilesValidos(page, '[data-testid^="btn-revisar-documento-"]');
      await captura(page, '26-admin-bandeja');
    });

    test('la bandeja vacía y la bandeja con error se explican y se pueden reintentar', async ({ page, request }) => {
      await relogAdmin(request);
      await abrirComoUsuario(page, adminSesion);
      await page.route('**/administrador/documentos/pendientes', (ruta) => ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mensaje: 'ok', data: [] }) }));
      await page.goto('/admin-documentos.html');
      await expect(page.getByTestId('estado-vacio-titulo')).toHaveText('No hay documentos por revisar.');
      await expect(page.getByTestId('resumen-documentos')).toHaveText('0 documentos esperando revisión');
      await captura(page, '27-admin-bandeja-vacia');

      await page.unroute('**/administrador/documentos/pendientes');
      await page.route('**/administrador/documentos/pendientes', (ruta) => ruta.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Error', data: null }) }));
      await page.goto('/admin-documentos.html');
      await expect(page.getByTestId('error-documentos')).toBeVisible();
      await page.unroute('**/administrador/documentos/pendientes');
      await page.getByTestId('btn-reintentar-documentos').click();
      await expect(page.getByTestId('error-documentos')).toHaveCount(0);
    });

    test('la revisión muestra el comercio, la vista previa y los otros documentos, y aprobar pide confirmación', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, true);
      const principal = await subirPorApi(request, dueno, { tipo: 'LIBRETA_SANITARIA', nombre: 'libreta.png', mime: 'image/png', contenido: fs.readFileSync(FIXTURE_PNG) });
      const otro = await subirPorApi(request, dueno, { tipo: 'HABILITACION_COMERCIAL' });
      await resolverPorApi(request, otro, false, 'Ilegible');
      await abrirAdmin(page, request, `/admin-documento-revision.html?id=${principal}&comercioId=${dueno.comercioId}`);

      await expect(page.getByTestId('revision-comercio-nombre')).toHaveText(dueno.nombre);
      await expect(page.getByTestId('revision-mercadopago')).toHaveText('Mercado Pago: vinculado');
      await expect(page.getByTestId('revision-conteo')).toHaveText('Documentos: 0 aprobados · 1 en revisión · 1 rechazados');
      await expect(page.getByTestId('revision-doc-nombre')).toHaveText('Libreta sanitaria');
      await expect(page.getByTestId('revision-doc-estado')).toHaveText('En revisión');
      await expect(page.getByTestId('vista-previa-imagen')).toBeVisible();
      await expect(page.getByTestId('revision-otros-titulo')).toHaveText('Otros documentos de este comercio');
      await expect(page.getByTestId(`revision-otro-estado-${otro}`)).toHaveText('Rechazado');
      await sinScrollHorizontal(page);
      await captura(page, '28-admin-revision', true);

      await page.getByTestId('btn-ver-pantalla-completa').click();
      await expect(page.getByTestId('visor-imagen')).toBeVisible();
      await page.getByTestId('btn-cerrar-visor').click();
      await expect(page.getByTestId('btn-ver-pantalla-completa')).toBeFocused();

      await page.getByTestId('btn-aprobar-documento').click();
      await expect(page.getByTestId('modal-aprobar-documento').getByRole('alertdialog')).toBeVisible();
      await captura(page, '29-admin-modal-aprobar');
      await page.getByTestId('btn-cancelar-aprobar-documento').click();
      await expect(page.getByTestId('btn-aprobar-documento')).toBeFocused();
      expect(sql(`SELECT estado FROM documento_comercio WHERE id = ${principal};`)).toBe('PENDIENTE');

      await page.getByTestId('btn-aprobar-documento').click();
      await page.getByTestId('btn-confirmar-aprobar-documento').click();
      await page.waitForURL('**/admin-documentos.html?resuelto=aprobado');
      await expect(page.locator('.toast')).toContainText('Documento aprobado');
      expect(sql(`SELECT estado FROM documento_comercio WHERE id = ${principal};`)).toBe('APROBADO');
      expect(estadoComercio(dueno.comercioId)).toBe('APTO_VENTA');
    });

    test('rechazar exige el motivo, muestra el contador y avisa lo que va a ver el Dueño', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, true);
      const id = await subirPorApi(request, dueno);
      await abrirAdmin(page, request, `/admin-documento-revision.html?id=${id}&comercioId=${dueno.comercioId}`);
      await page.getByTestId('btn-rechazar-documento').click();

      const modal = page.getByTestId('modal-motivo-documento');
      await expect(modal).toHaveAttribute('role', 'alertdialog');
      await expect(page.getByTestId('titulo-motivo-documento')).toHaveText('Rechazar documento');
      await expect(page.getByTestId('mensaje-motivo-documento')).toHaveText('El Dueño va a ver este motivo y podrá subir un documento nuevo.');
      await expect(page.getByTestId('contador-motivo-documento')).toHaveText('0 / 255');
      await expect(page.getByTestId('input-motivo-documento')).toBeFocused();

      await page.getByTestId('btn-confirmar-motivo-documento').click();
      await expect(page.getByTestId('error-motivo-documento')).toBeVisible();
      expect(sql(`SELECT estado FROM documento_comercio WHERE id = ${id};`)).toBe('PENDIENTE');

      await page.getByTestId('input-motivo-documento').fill('La foto está cortada');
      await expect(page.getByTestId('contador-motivo-documento')).toHaveText('20 / 255');
      await captura(page, '30-admin-modal-rechazar');
      await page.getByTestId('btn-confirmar-motivo-documento').click();
      await page.waitForURL('**/admin-documentos.html?resuelto=rechazado');
      await expect(page.locator('.toast')).toContainText('Documento rechazado');
      expect(sql(`SELECT estado FROM documento_comercio WHERE id = ${id};`)).toBe('RECHAZADO');
      expect(sql(`SELECT motivo_rechazo FROM documento_comercio WHERE id = ${id};`)).toBe('La foto está cortada');
    });

    test('revocar una aprobación usa el mismo modal y el comercio deja de estar a la venta', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, true);
      const id = await subirPorApi(request, dueno);
      await resolverPorApi(request, id, true);
      expect(estadoComercio(dueno.comercioId)).toBe('APTO_VENTA');
      await abrirAdmin(page, request, '/admin-comercios.html');
      await page.getByTestId(`btn-ver-detalle-comercio-${dueno.comercioId}`).click();
      await page.getByTestId('btn-ver-documentos-comercio').click();
      await page.waitForURL('**/admin-documento-revision.html**');

      await expect(page.getByTestId('revision-doc-estado')).toHaveText('Aprobado');
      await expect(page.getByTestId('btn-aprobar-documento')).toHaveCount(0);
      await page.getByTestId('btn-revocar-documento').click();
      await expect(page.getByTestId('titulo-motivo-documento')).toHaveText('Revocar aprobación');
      await captura(page, '31-admin-modal-revocar');
      await page.getByTestId('input-motivo-documento').fill('Documento vencido');
      await page.getByTestId('btn-confirmar-motivo-documento').click();
      await expect(page.locator('.toast')).toContainText('Aprobación revocada');
      await expect(page.getByTestId('revision-doc-estado')).toHaveText('Rechazado');
      await expect(page.getByTestId('revision-doc-motivo')).toHaveText('Motivo: Documento vencido');
      expect(estadoComercio(dueno.comercioId)).toBe('APROBADO');
    });

    test('si el Dueño eliminó el documento mientras tanto, la revisión muestra el mensaje del servidor y se refresca', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, true);
      const id = await subirPorApi(request, dueno);
      const otro = await subirPorApi(request, dueno, { tipo: 'HABILITACION_COMERCIAL' });
      await abrirAdmin(page, request, `/admin-documento-revision.html?id=${id}&comercioId=${dueno.comercioId}`);
      await expect(page.getByTestId('btn-aprobar-documento')).toBeVisible();
      const respuesta = await request.delete(`${process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1'}/comercios/documentos/${id}`, {
        headers: { Authorization: `Bearer ${dueno.token}`, 'X-Comercio-Id': String(dueno.comercioId) },
      });
      expect(respuesta.status()).toBe(200);

      await page.getByTestId('btn-aprobar-documento').click();
      await page.getByTestId('btn-confirmar-aprobar-documento').click();
      await expect(page.getByTestId('aviso-fijo-texto')).toHaveText('Documento no encontrado');
      await expect(page.getByTestId('modal-aprobar-documento')).toHaveCount(0);
      await expect(page.getByTestId('revision-doc-nombre')).toHaveText('Habilitación comercial');
      await expect(page.getByTestId(`revision-otro-${id}`)).toHaveCount(0);
      expect(otro).toBeGreaterThan(0);
      await captura(page, '32-admin-documento-ya-no-existe');
    });

    test('un comercio sin documentos y un enlace inválido se explican', async ({ page, request }) => {
      const dueno = await nuevoDueno(request, true);
      await abrirAdmin(page, request, `/admin-documento-revision.html?comercioId=${dueno.comercioId}`);
      await expect(page.getByTestId('estado-vacio-titulo')).toHaveText('Todavía no subió documentos');
      await page.goto('/admin-documento-revision.html?comercioId=abc');
      await expect(page.getByTestId('estado-vacio-titulo')).toHaveText('No encontramos este documento');
    });
  });
});


