import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  apiPut,
  diaDeHoy,
  documentacionRequeridaTest,
  fijarPasswordAdminYLoguear,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  subirDocumentoTest,
  suspenderComercio,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import { sumarAlEquipo } from './helpers/empleado';
import { loginUi, prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { abrirComoUsuarioConComercio } from './helpers/selector';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

const CARPETA_CAPTURAS = path.resolve(__dirname, '../../../docs/capturas-suspension-comercio-b2');
const FIXTURE_PDF = path.resolve(__dirname, '../fixtures/documento-prueba.pdf');
const MOTIVO = 'Documentación vencida y reiteradas quejas de clientes';
const TEXTO_AVISO = 'El comercio está suspendido. Podés subir documentos, pero no vuelve a vender hasta que se levante la suspensión.';
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
const estadoComercio = (comercioId: number): string => sql(`SELECT estado FROM comercio WHERE id = ${comercioId};`);

async function captura(page: Page, nombre: string) {
  fs.mkdirSync(CARPETA_CAPTURAS, { recursive: true });
  await page.screenshot({ path: path.join(CARPETA_CAPTURAS, `${nombre}.png`) });
}

test.describe('Fase 5, S2 (cierre): documentos con el comercio suspendido', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminSesion: SesionApi;
  let localidadId: string;

  const resolverDocumento = async (request: APIRequestContext, documentoId: number, aprobar: boolean, motivo?: string) => {
    const { status } = await apiPut(request, `/administrador/documentos/${documentoId}/resolver`, { aprobar, motivo }, adminSesion.token);
    expect(status).toBe(200);
  };
  const levantar = async (request: APIRequestContext, comercioId: number) => {
    const { status } = await apiPut(request, `/administrador/comercios/${comercioId}/levantar-suspension`, {}, adminSesion.token);
    expect(status).toBe(200);
  };
  const subirPorApi = async (request: APIRequestContext, dueno: Dueno): Promise<number> => {
    const respuesta = await subirDocumentoTest(request, dueno.token, dueno.comercioId, { tipo: 'LIBRETA_SANITARIA' });
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
    return respuesta.body.data.id as number;
  };
  const abrirDocumentacion = async (page: Page, dueno: Dueno) => {
    await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: dueno.comercioId, ultimoComercioId: dueno.comercioId });
    await page.goto('/comercio-documentacion.html');
  };
  const subirPorPantalla = async (page: Page) => {
    await page.getByTestId('btn-subir-documento').click();
    await page.getByTestId('select-documento-tipo').selectOption('HABILITACION_COMERCIAL');
    await page.getByTestId('input-documento-archivo').setInputFiles(FIXTURE_PDF);
    await page.getByTestId('btn-subir-documento-confirmar').click();
    await expect(page.locator('.toast')).toContainText('Documento enviado. Lo estamos revisando.');
  };

  test.beforeAll(async ({ request }) => {
    adminSesion = await fijarPasswordAdminYLoguear(request);
    localidadId = await obtenerLocalidadRioGrande(request);
    await documentacionRequeridaTest(request, true);
  });

  test.afterAll(async ({ request }) => {
    await documentacionRequeridaTest(request, false);
  });

  test('el Dueño sube un documento con el comercio suspendido: ve el aviso y el toast, y el comercio sigue suspendido aunque se apruebe', async ({ page, request }) => {
    const dueno = await prepararAprobado(request, adminSesion.token, localidadId, true, todoElDia());
    const primero = await subirPorApi(request, dueno);
    await resolverDocumento(request, primero, true);
    expect(estadoComercio(dueno.comercioId)).toBe('APTO_VENTA');
    await suspenderComercio(request, adminSesion.token, dueno.comercioId, MOTIVO);
    expect(estadoComercio(dueno.comercioId)).toBe('SUSPENDIDO');

    await abrirDocumentacion(page, dueno);
    await expect(page.getByTestId('aviso-comercio-suspendido')).toHaveText(TEXTO_AVISO);
    await expect(page.getByTestId('btn-subir-documento')).toBeEnabled();
    await expect(page.getByTestId('explicacion-subida-deshabilitada')).toHaveCount(0);
    await expect(page.getByText(/soporte/i)).toHaveCount(0);
    await sinScrollHorizontal(page);
    await captura(page, '13-documentacion-suspendido-aviso');

    await subirPorPantalla(page);
    await expect(page.getByTestId('titulo-seccion-en-revision')).toHaveText('En revisión · 1');
    await expect(page.getByTestId('aviso-comercio-suspendido')).toBeVisible();
    expect(estadoComercio(dueno.comercioId)).toBe('SUSPENDIDO');
    await captura(page, '14-documentacion-suspendido-subido');

    const nuevo = Number(sql(`SELECT id FROM documento_comercio WHERE comercio_id = ${dueno.comercioId} AND estado = 'PENDIENTE';`));
    await resolverDocumento(request, nuevo, true);
    expect(estadoComercio(dueno.comercioId)).toBe('SUSPENDIDO');
    await page.reload();
    await expect(page.getByTestId('titulo-seccion-aprobados')).toHaveText('Aprobados · 2');
    await expect(page.getByTestId('aviso-comercio-suspendido')).toBeVisible();
    expect(estadoComercio(dueno.comercioId)).toBe('SUSPENDIDO');

    await levantar(request, dueno.comercioId);
    expect(estadoComercio(dueno.comercioId)).toBe('APTO_VENTA');
    await page.reload();
    await expect(page.getByTestId('aviso-comercio-suspendido')).toHaveCount(0);
    await expect(page.getByTestId('btn-subir-documento')).toBeEnabled();
  });

  test('al levantar la suspensión el comercio queda según los documentos vigentes: sin ninguno aprobado vuelve a Aprobado', async ({ page, request }) => {
    const dueno = await prepararAprobado(request, adminSesion.token, localidadId, true, todoElDia());
    await suspenderComercio(request, adminSesion.token, dueno.comercioId, MOTIVO);

    await abrirDocumentacion(page, dueno);
    await expect(page.getByTestId('aviso-comercio-suspendido')).toHaveText(TEXTO_AVISO);
    await subirPorPantalla(page);
    expect(estadoComercio(dueno.comercioId)).toBe('SUSPENDIDO');
    await levantar(request, dueno.comercioId);
    expect(estadoComercio(dueno.comercioId)).toBe('APROBADO');

    const nuevo = Number(sql(`SELECT id FROM documento_comercio WHERE comercio_id = ${dueno.comercioId} AND estado = 'PENDIENTE';`));
    await resolverDocumento(request, nuevo, true);
    expect(estadoComercio(dueno.comercioId)).toBe('APTO_VENTA');
  });

  test('el rechazo de un documento con el comercio suspendido tampoco mueve el estado y deja el motivo a la vista', async ({ page, request }) => {
    const dueno = await prepararAprobado(request, adminSesion.token, localidadId, true, todoElDia());
    const id = await subirPorApi(request, dueno);
    await suspenderComercio(request, adminSesion.token, dueno.comercioId, MOTIVO);

    await resolverDocumento(request, id, false, 'La libreta está vencida');
    expect(estadoComercio(dueno.comercioId)).toBe('SUSPENDIDO');
    await abrirDocumentacion(page, dueno);
    await expect(page.getByTestId('titulo-seccion-rechazados')).toHaveText('Rechazados · 1');
    await expect(page.getByTestId(`doc-motivo-${id}`)).toHaveText('Motivo: La libreta está vencida');
    await expect(page.getByTestId(`btn-subir-nuevo-${id}`)).toBeEnabled();
    await captura(page, '15-documentacion-suspendido-rechazado');
  });

  test('el Empleado ve en el selector que el comercio suspendido solo permite resolver pedidos en curso', async ({ page, request }) => {
    const dueno = await prepararAprobado(request, adminSesion.token, localidadId, true, todoElDia());
    const registro = await registrarYVerificarCliente(request, localidadId);
    await sumarAlEquipo(request, dueno.comercioId, registro, dueno.token);
    await suspenderComercio(request, adminSesion.token, dueno.comercioId, MOTIVO);

    await loginUi(page, registro.nombreUsuario, registro.password);
    await page.waitForURL('**/seleccionar-contexto.html');
    const subtitulo = page.getByTestId(`fila-contexto-comercio-${dueno.comercioId}-subtitulo`);
    await expect(subtitulo).toContainText('Comercio suspendido. Solo podés resolver pedidos en curso.');
    await expect(subtitulo).not.toContainText('consultarlo');
    await sinScrollHorizontal(page);
    await captura(page, '16-selector-empleado-suspendido');
  });
});
