import { test, expect } from './helpers/prueba';
import type { APIRequestContext } from '@playwright/test';
import {
  PDF_DE_PRUEBA,
  aprobarDocumentacionTest,
  apiConHeaders,
  apiGet,
  apiPut,
  descargarArchivoDocumentoTest,
  diaDeHoy,
  documentacionRequeridaTest,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  subirDocumentoTest,
  vincularMercadoPagoSimuladoTest,
} from './helpers/backend';
import type { HorarioInput } from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { prepararAprobado } from './helpers/multicomercio';

const BASE = '/comercios/documentos';
const ADMIN = '/administrador';
const HEADER = 'X-Comercio-Id';
const MB = 1024 * 1024;
const todoElDia = (): HorarioInput[] => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];

const estadoComercio = (comercioId: number): string => sql(`SELECT estado FROM comercio WHERE id = ${comercioId};`);
const contarAvisos = (duenoId: number, tipo: string): number =>
  Number(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${duenoId} AND tipo = '${tipo}';`));

function pdfDe(bytes: number): Buffer {
  const contenido = Buffer.alloc(bytes);
  PDF_DE_PRUEBA.copy(contenido);
  return contenido;
}

test.describe('Fase 4 (API): documentos del comercio y regla de apto para venta', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  let adminToken: string;
  let localidadId: string;
  let dueno: Dueno;

  const delDueno = (d: Dueno = dueno) => ({ Authorization: `Bearer ${d.token}`, [HEADER]: String(d.comercioId) });

  async function resolver(request: APIRequestContext, documentoId: number, aprobar: boolean, motivo?: string) {
    return apiPut(request, `${ADMIN}/documentos/${documentoId}/resolver`, { aprobar, motivo }, adminToken);
  }

  async function subir(request: APIRequestContext, d: Dueno = dueno, opciones: Parameters<typeof subirDocumentoTest>[3] = { tipo: 'LIBRETA_SANITARIA' }) {
    return subirDocumentoTest(request, d.token, d.comercioId, opciones);
  }

  async function subirOk(request: APIRequestContext, d: Dueno = dueno): Promise<number> {
    const respuesta = await subir(request, d);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
    return respuesta.body.data.id as number;
  }

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    await documentacionRequeridaTest(request, true);
    dueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
  });

  test.afterAll(async ({ request }) => {
    await documentacionRequeridaTest(request, false);
  });

  test('con Mercado Pago vinculado y sin documentos el comercio queda APROBADO y los requisitos dicen qué falta', async ({ request }) => {
    expect(estadoComercio(dueno.comercioId)).toBe('APROBADO');

    const lista = await apiGet(request, BASE, dueno.token);
    const requisitos = await apiGet(request, `${BASE}/requisitos`, dueno.token);

    expect(lista.status).toBe(200);
    expect(lista.body.data).toMatchObject({ documentos: [], enRevision: 0, maxEnRevision: 5, total: 0, maxTotal: 20, maxBytes: 8 * MB });
    expect(requisitos.status).toBe(200);
    expect(requisitos.body.data).toMatchObject({
      estadoComercio: 'APROBADO',
      comercioAprobado: true,
      cuentaMercadoPagoVinculada: true,
      documentacionRequerida: true,
      aptoVenta: false,
      puedeSubir: true,
      faltan: ['DOCUMENTO_APROBADO'],
    });
    expect(requisitos.body.data.tipos.map((t: any) => t.codigo)).toEqual(['LIBRETA_SANITARIA', 'CARNET_MANIPULACION_ALIMENTOS', 'HABILITACION_COMERCIAL', 'OTRO']);
  });

  test('sin token da 401 y un Cliente, un Empleado o el Administrador dan 403 en las rutas del Dueño', async ({ request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    const sesionCliente = await login(request, cliente.nombreUsuario, cliente.password);
    sql(`INSERT INTO empleado (id) VALUES (${sesionCliente.usuario.id}) ON DUPLICATE KEY UPDATE id = id;`);
    sql(`INSERT INTO empleado_comercio (empleado_id, comercio_id, estado, fecha_alta) VALUES (${sesionCliente.usuario.id}, ${dueno.comercioId}, 'ACTIVO', NOW());`);
    const conHeader = { [HEADER]: String(dueno.comercioId) };

    expect((await apiGet(request, BASE)).status).toBe(401);
    for (const ruta of [BASE, `${BASE}/requisitos`, `${BASE}/1/archivo`]) {
      expect((await apiConHeaders(request, 'GET', ruta, sesionCliente.token, conHeader)).status, `Empleado ${ruta}`).toBe(403);
      expect((await apiConHeaders(request, 'GET', ruta, adminToken, conHeader)).status, `Administrador ${ruta}`).toBe(403);
    }
    expect((await subirDocumentoTest(request, sesionCliente.token, dueno.comercioId, { tipo: 'LIBRETA_SANITARIA' })).status).toBe(403);
    expect((await apiConHeaders(request, 'DELETE', `${BASE}/1`, sesionCliente.token, conHeader)).status).toBe(403);
  });

  test('las rutas del Administrador no las usan el Dueño ni quien no tiene sesión', async ({ request }) => {
    for (const ruta of [`${ADMIN}/documentos/pendientes`, `${ADMIN}/comercios/${dueno.comercioId}/documentos`, `${ADMIN}/documentos/1/archivo`]) {
      expect((await apiGet(request, ruta)).status, ruta).toBe(401);
      expect((await apiGet(request, ruta, dueno.token)).status, ruta).toBe(403);
    }
    expect((await apiPut(request, `${ADMIN}/documentos/1/resolver`, { aprobar: true }, dueno.token)).status).toBe(403);
  });

  test('un archivo con extensión PDF pero contenido ejecutable se rechaza por su firma de bytes', async ({ request }) => {
    const falso = await subir(request, dueno, { tipo: 'LIBRETA_SANITARIA', nombre: 'libreta.pdf', mime: 'application/pdf', contenido: Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'latin1') });

    expect(falso.status).toBe(400);
    expect(falso.body.data.codigo).toBe('DOCUMENTO_FORMATO_NO_PERMITIDO');
    expect(falso.body.mensaje).toBe('Solo se aceptan archivos PDF, JPG, PNG o WebP');
  });

  test('un archivo de más de 8 MB dice cuánto pesa y cuál es el máximo', async ({ request }) => {
    const grande = await subir(request, dueno, { tipo: 'LIBRETA_SANITARIA', contenido: pdfDe(Math.round(11.4 * MB)) });

    expect(grande.status).toBe(400);
    expect(grande.body.data.codigo).toBe('DOCUMENTO_TAMANO_EXCEDIDO');
    expect(grande.body.mensaje).toBe('El archivo pesa 11,4 MB y el máximo es 8 MB');
  });

  test('"Otro" exige descripción y el tipo y el archivo son obligatorios', async ({ request }) => {
    const sinDescripcion = await subir(request, dueno, { tipo: 'OTRO' });
    const sinTipo = await subir(request, dueno, {});
    const tipoInvalido = await subir(request, dueno, { tipo: 'NO_EXISTE' });

    expect(sinDescripcion.status).toBe(400);
    expect(sinDescripcion.body.data.descripcionDeOtroCompleta).toBe('Contanos qué documento es');
    expect(sinTipo.status).toBe(400);
    expect(sinTipo.body.data.tipo).toBe('Elegí el tipo de documento');
    expect(tipoInvalido.status).toBe(400);
    expect(Number(sql(`SELECT COUNT(*) FROM documento_comercio WHERE comercio_id = ${dueno.comercioId};`))).toBe(0);
  });

  test('subir nace en revisión sin cambiar el estado; el archivo se entrega íntegro con las cabeceras de seguridad', async ({ request }) => {
    const subida = await subir(request, dueno, { tipo: 'LIBRETA_SANITARIA', nombre: 'mi libreta.pdf' });

    expect(subida.status).toBe(201);
    expect(subida.body.data).toMatchObject({ estado: 'PENDIENTE', tipo: 'LIBRETA_SANITARIA', tipoMime: 'application/pdf', nombreOriginal: 'mi libreta.pdf', tamanoBytes: PDF_DE_PRUEBA.length });
    expect(estadoComercio(dueno.comercioId)).toBe('APROBADO');
    const archivo = await descargarArchivoDocumentoTest(request, `${BASE}/${subida.body.data.id}/archivo`, dueno.token, dueno.comercioId);
    expect(archivo.status).toBe(200);
    expect(archivo.headers['content-type']).toBe('application/pdf');
    expect(archivo.headers['x-content-type-options']).toBe('nosniff');
    expect(archivo.headers['cache-control']).toBe('no-store');
    expect(archivo.headers['content-disposition']).toContain('inline');
    expect(archivo.buffer.equals(PDF_DE_PRUEBA)).toBe(true);
    const requisitos = await apiGet(request, `${BASE}/requisitos`, dueno.token);
    expect(requisitos.body.data.faltan).toEqual(['DOCUMENTO_APROBADO', 'REVISION_PENDIENTE']);
  });

  test('el Administrador ve el documento en la bandeja, lo aprueba y el comercio pasa a APTO_VENTA con sus avisos', async ({ request }) => {
    const bandeja = await apiGet(request, `${ADMIN}/documentos/pendientes`, adminToken);
    const propio = bandeja.body.data.find((d: any) => d.comercioId === dueno.comercioId);
    const metricasAntes = (await apiGet(request, `${ADMIN}/metricas`, adminToken)).body.data.documentosPendientes as number;

    expect(bandeja.status).toBe(200);
    expect(propio).toMatchObject({ nombreComercio: dueno.nombre, tipo: 'LIBRETA_SANITARIA', tipoEtiqueta: 'Libreta sanitaria', nombreOriginal: 'mi libreta.pdf', cuentaMercadoPagoVinculada: true });
    expect(metricasAntes).toBeGreaterThanOrEqual(1);

    const aprobado = await resolver(request, propio.id, true);

    expect(aprobado.status).toBe(200);
    expect(aprobado.body.data.estado).toBe('APROBADO');
    expect(estadoComercio(dueno.comercioId)).toBe('APTO_VENTA');
    expect(contarAvisos(dueno.duenoId, 'DOCUMENTO_APROBADO')).toBe(1);
    expect(contarAvisos(dueno.duenoId, 'COMERCIO_APTO_VENTA')).toBe(1);
    const avisos = await apiConHeaders(request, 'GET', '/notificaciones', dueno.token, { [HEADER]: String(dueno.comercioId) });
    expect(avisos.status).toBe(200);
    expect(avisos.body.data.map((a: any) => a.tipo)).toEqual(expect.arrayContaining(['DOCUMENTO_APROBADO', 'COMERCIO_APTO_VENTA']));
    expect((await apiGet(request, `${ADMIN}/metricas`, adminToken)).body.data.documentosPendientes).toBe(metricasAntes - 1);
    const requisitos = await apiGet(request, `${BASE}/requisitos`, dueno.token);
    expect(requisitos.body.data).toMatchObject({ aptoVenta: true, estadoComercio: 'APTO_VENTA', documentosAprobados: 1, faltan: [] });
  });

  test('una vez a la venta, subir un documento nuevo o que rechacen uno extra no corta las ventas', async ({ request }) => {
    const extra = await subirOk(request);
    expect(estadoComercio(dueno.comercioId)).toBe('APTO_VENTA');

    const rechazo = await resolver(request, extra, false, 'Está borroso');

    expect(rechazo.status).toBe(200);
    expect(rechazo.body.data).toMatchObject({ estado: 'RECHAZADO', motivoRechazo: 'Está borroso' });
    expect(estadoComercio(dueno.comercioId)).toBe('APTO_VENTA');
    const lista = await apiGet(request, BASE, dueno.token);
    const rechazado = lista.body.data.documentos.find((d: any) => d.id === extra);
    expect(rechazado).toMatchObject({ estado: 'RECHAZADO', motivoRechazo: 'Está borroso' });
    expect(contarAvisos(dueno.duenoId, 'DOCUMENTO_RECHAZADO')).toBe(1);
  });

  test('un documento resuelto no se vuelve a resolver y rechazar exige motivo', async ({ request }) => {
    const id = await subirOk(request);

    const sinMotivo = await resolver(request, id, false);
    const rechazado = await resolver(request, id, false, 'No corresponde');
    const volverAAprobar = await resolver(request, id, true);
    const volverARechazar = await resolver(request, id, false, 'Otra vez');
    const inexistente = await resolver(request, 99999999, true);

    expect(sinMotivo.status).toBe(400);
    expect(sinMotivo.body.data.motivoCompletoAlRechazar).toBe('El motivo es obligatorio al rechazar un documento');
    expect(rechazado.status).toBe(200);
    expect(volverAAprobar.status).toBe(409);
    expect(volverAAprobar.body.data.codigo).toBe('DOCUMENTO_YA_RESUELTO');
    expect(volverARechazar.status).toBe(409);
    expect(volverARechazar.body.data.codigo).toBe('DOCUMENTO_YA_RESUELTO');
    expect(inexistente.status).toBe(404);
  });

  test('el Dueño solo elimina un documento propio en revisión', async ({ request }) => {
    const pendiente = await subirOk(request);
    const aprobadoId = Number(sql(`SELECT id FROM documento_comercio WHERE comercio_id = ${dueno.comercioId} AND estado = 'APROBADO' LIMIT 1;`));

    const sobreAprobado = await apiConHeaders(request, 'DELETE', `${BASE}/${aprobadoId}`, dueno.token, delDueno());
    const sobrePendiente = await apiConHeaders(request, 'DELETE', `${BASE}/${pendiente}`, dueno.token, delDueno());
    const otraVez = await apiConHeaders(request, 'DELETE', `${BASE}/${pendiente}`, dueno.token, delDueno());

    expect(sobreAprobado.status).toBe(409);
    expect(sobreAprobado.body.data.codigo).toBe('DOCUMENTO_NO_ELIMINABLE');
    expect(sobrePendiente.status).toBe(200);
    expect(sobrePendiente.body.mensaje).toBe('Documento eliminado');
    expect(otraVez.status).toBe(404);
    expect(Number(sql(`SELECT COUNT(*) FROM documento_comercio_archivo WHERE documento_id = ${pendiente};`))).toBe(0);
  });

  test('un documento de otro comercio es un 404 igual al de uno inexistente y un comercio ajeno en el header también', async ({ request }) => {
    const otro = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    const ajeno = await subirOk(request, otro);

    const delOtro = await apiConHeaders(request, 'GET', `${BASE}/${ajeno}/archivo`, dueno.token, delDueno());
    const inexistente = await apiConHeaders(request, 'GET', `${BASE}/99999999/archivo`, dueno.token, delDueno());
    const baja = await apiConHeaders(request, 'DELETE', `${BASE}/${ajeno}`, dueno.token, delDueno());
    const comercioAjeno = await apiConHeaders(request, 'GET', BASE, dueno.token, { [HEADER]: String(otro.comercioId) });

    expect(delOtro.status).toBe(404);
    expect(delOtro.body).toEqual(inexistente.body);
    expect(baja.status).toBe(404);
    expect(comercioAjeno.status).toBe(404);
    expect(comercioAjeno.body.data.codigo).toBe('COMERCIO_NO_DISPONIBLE');
    expect(Number(sql(`SELECT COUNT(*) FROM documento_comercio WHERE id = ${ajeno};`))).toBe(1);
  });

  test('el cupo de documentos en revisión es de 5 y se libera al resolver uno', async ({ request }) => {
    const otro = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    const ids: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      ids.push(await subirOk(request, otro));
    }

    const sexto = await subir(request, otro);
    await resolver(request, ids[0], false, 'Ilegible');
    const tras = await subir(request, otro);

    expect(sexto.status).toBe(409);
    expect(sexto.body.data.codigo).toBe('DOCUMENTO_CUPO_REVISION');
    expect(tras.status).toBe(201);
  });

  test('solo se puede subir con el comercio aprobado, apto para vender o cerrado temporalmente', async ({ request }) => {
    const otro = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    sql(`UPDATE comercio SET estado = 'SUSPENDIDO' WHERE id = ${otro.comercioId};`);

    const suspendido = await subir(request, otro);
    sql(`UPDATE comercio SET estado = 'CERRADO_TEMPORALMENTE' WHERE id = ${otro.comercioId};`);
    const cerrado = await subir(request, otro);

    expect(suspendido.status).toBe(409);
    expect(suspendido.body.data.codigo).toBe('COMERCIO_ESTADO_NO_PERMITE_DOCUMENTOS');
    expect(cerrado.status).toBe(201);
  });

  test('revocar el único documento aprobado saca al comercio de la venta, avisa y se puede volver a aprobar con otro', async ({ request }) => {
    const otro = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    const primero = await subirOk(request, otro);
    await resolver(request, primero, true);
    expect(estadoComercio(otro.comercioId)).toBe('APTO_VENTA');

    const revocado = await resolver(request, primero, false, 'Venció');

    expect(revocado.status).toBe(200);
    expect(estadoComercio(otro.comercioId)).toBe('APROBADO');
    expect(contarAvisos(otro.duenoId, 'COMERCIO_SIN_APTITUD')).toBe(1);
    const aviso = sql(`SELECT mensaje FROM notificacion WHERE usuario_id = ${otro.duenoId} AND tipo = 'DOCUMENTO_RECHAZADO';`);
    expect(aviso).toContain('Se revocó la aprobación');
    expect(aviso).toContain('Venció');

    const segundo = await subirOk(request, otro);
    await resolver(request, segundo, true);
    expect(estadoComercio(otro.comercioId)).toBe('APTO_VENTA');
  });

  test('desvincular Mercado Pago saca al comercio de la venta aunque tenga documentos aprobados', async ({ request }) => {
    const otro = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    await resolver(request, await subirOk(request, otro), true);
    expect(estadoComercio(otro.comercioId)).toBe('APTO_VENTA');

    const desvinculacion = await apiConHeaders(request, 'DELETE', '/oauth/mercadopago/desvincular', otro.token);

    expect(desvinculacion.status).toBe(200);
    expect(estadoComercio(otro.comercioId)).toBe('APROBADO');
    await vincularMercadoPagoSimuladoTest(request, otro.duenoId);
    expect(estadoComercio(otro.comercioId)).toBe('APTO_VENTA');
  });

  test('el atajo de test que aprueba la documentación deja al comercio a la venta por el mismo camino', async ({ request }) => {
    const otro = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    expect(estadoComercio(otro.comercioId)).toBe('APROBADO');

    await aprobarDocumentacionTest(request, otro.comercioId);

    expect(estadoComercio(otro.comercioId)).toBe('APTO_VENTA');
  });

  test('el Administrador ve todos los documentos de un comercio y el archivo de cualquiera', async ({ request }) => {
    const lista = await apiGet(request, `${ADMIN}/comercios/${dueno.comercioId}/documentos`, adminToken);
    const primero = lista.body.data.find((d: any) => d.estado === 'APROBADO');
    const archivo = await descargarArchivoDocumentoTest(request, `${ADMIN}/documentos/${primero.id}/archivo`, adminToken);

    expect(lista.status).toBe(200);
    expect(lista.body.data.map((d: any) => d.estado)).toEqual(expect.arrayContaining(['APROBADO', 'RECHAZADO']));
    expect(archivo.status).toBe(200);
    expect(archivo.buffer.equals(PDF_DE_PRUEBA)).toBe(true);
    expect((await apiGet(request, `${ADMIN}/comercios/99999999/documentos`, adminToken)).status).toBe(404);
  });

  test('con la exigencia apagada solo cuenta Mercado Pago, como antes', async ({ request }) => {
    await documentacionRequeridaTest(request, false);
    try {
      const otro = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
      expect(estadoComercio(otro.comercioId)).toBe('APTO_VENTA');
      const requisitos = await apiGet(request, `${BASE}/requisitos`, otro.token);
      expect(requisitos.body.data).toMatchObject({ documentacionRequerida: false, aptoVenta: true, faltan: [] });
    } finally {
      await documentacionRequeridaTest(request, true);
    }
  });
});
