import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import {
  apiGet,
  apiPost,
  clonarComercioTest,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  obtenerCodigoTest,
  obtenerLocalidadRioGrande,
  resolverComercio,
  sqlTest as sql,
  vincularMercadoPagoSimuladoTest,
} from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { prepararAprobado } from './helpers/multicomercio';

const MOTIVO_AL_APROBAR = 'Bloqueo de cuenta vigente al aprobar';
const MOTIVO_AL_VINCULAR = 'Bloqueo de cuenta vigente al vincular Mercado Pago';
const MOTIVO_RESTAURACION = 'Restauración por recuperación de contraseña';
const MOTIVO_REACTIVACION = 'Restauración por reactivación de cuenta';
const MOTIVO_VINCULACION_NORMAL = 'Vinculación automática de cuenta de Mercado Pago';

const todoElDia = (diaSemana: string) => ({ diaSemana, horaApertura: '00:00', horaCierre: '23:59' });

const estadoDe = (comercioId: number): string => sql(`SELECT estado FROM comercio WHERE id = ${comercioId};`);
const historialDe = (comercioId: number): string[] => {
  const salida = sql(
    `SELECT CONCAT(estado_origen, '>', estado_destino, '|', IF(administrador_id IS NULL, 'sin-admin', 'con-admin'), '|', COALESCE(motivo, '')) ` +
      `FROM historial_estado_comercio WHERE comercio_id = ${comercioId} ORDER BY id;`,
  );
  return salida === '' ? [] : salida.split(/\r?\n/);
};
const nuncaPasoPorAptoVenta = (comercioId: number): boolean => !historialDe(comercioId).some((fila) => fila.includes('>APTO_VENTA|'));

async function bloquear(request: APIRequestContext, dueno: Dueno) {
  for (let intento = 1; intento <= 3; intento += 1) {
    const fallido = await apiPost(request, '/auth/login', { nombreUsuario: dueno.nombreUsuario, password: 'ClaveIncorrecta1' });
    expect(fallido.status, `intento ${intento}`).toBe(401);
  }
  expect(sql(`SELECT estado FROM usuario WHERE id = ${dueno.duenoId};`)).toBe('BLOQUEADO');
}

async function desbloquear(request: APIRequestContext, dueno: Dueno, nuevaPassword = 'Testing456') {
  const solicitud = await apiPost(request, '/auth/recuperar-password', { email: dueno.email });
  expect(solicitud.status).toBe(200);
  const codigo = await obtenerCodigoTest(request, dueno.email, 'RECUPERACION_PASSWORD');
  const confirmar = await apiPost(request, '/auth/recuperar-password/confirmar', { email: dueno.email, codigo, nuevaPassword });
  expect(confirmar.status).toBe(200);
  expect(sql(`SELECT estado FROM usuario WHERE id = ${dueno.duenoId};`)).toBe('ACTIVO');
  dueno.password = nuevaPassword;
}

async function publicoDe(request: APIRequestContext, comercioId: number) {
  const listado = await apiGet(request, '/catalogo/comercios');
  expect(listado.status).toBe(200);
  return (listado.body.data as any[]).find((c) => c.id === comercioId);
}

test.describe('Bloqueo vigente al aprobar, vincular y reactivar (API), tramo C3', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminToken: string;
  let localidadId: string;

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
  });

  const duenoApto = (request: APIRequestContext, conMercadoPago: boolean) =>
    prepararAprobado(request, adminToken, localidadId, conMercadoPago, [todoElDia(diaDeHoy())]);

  test.describe('Dueño con Mercado Pago activo y un comercio pendiente adicional', () => {
    let dueno: Dueno;
    let pendiente: number;

    test.beforeAll(async ({ request }) => {
      dueno = await duenoApto(request, true);
      pendiente = await clonarComercioTest(request, dueno.comercioId, `Pendiente ${Date.now()}`, 'PENDIENTE');
      expect(estadoDe(dueno.comercioId)).toBe('APTO_VENTA');
    });

    test('el bloqueo cierra el comercio que vende y no toca al pendiente', async ({ request }) => {
      await bloquear(request, dueno);

      expect(estadoDe(dueno.comercioId)).toBe('CERRADO_TEMPORALMENTE');
      expect(estadoDe(pendiente)).toBe('PENDIENTE');
    });

    test('el Administrador aprueba al pendiente: queda CERRADO_TEMPORALMENTE y nunca pasa por APTO_VENTA', async ({ request }) => {
      await resolverComercio(request, adminToken, pendiente, true);

      expect(estadoDe(pendiente)).toBe('CERRADO_TEMPORALMENTE');
      expect(historialDe(pendiente)).toEqual([
        'PENDIENTE>APROBADO|con-admin|',
        `APROBADO>CERRADO_TEMPORALMENTE|sin-admin|${MOTIVO_AL_APROBAR}`,
      ]);
      expect(nuncaPasoPorAptoVenta(pendiente)).toBe(true);
    });

    test('el catálogo lo muestra con estadoApertura CERRADO_TEMPORALMENTE y sin textoReapertura', async ({ request }) => {
      const publico = await publicoDe(request, pendiente);

      expect(publico).toBeTruthy();
      expect(publico.estado).toBe('APTO_VENTA');
      expect(publico.estadoApertura).toBe('CERRADO_TEMPORALMENTE');
      expect(publico.textoReapertura).toBeNull();
    });

    test('el desbloqueo lo deja en APTO_VENTA, abierto en el catálogo, con la fila de restauración', async ({ request }) => {
      await desbloquear(request, dueno);

      expect(estadoDe(dueno.comercioId)).toBe('APTO_VENTA');
      expect(estadoDe(pendiente)).toBe('APTO_VENTA');
      expect(historialDe(pendiente)).toEqual([
        'PENDIENTE>APROBADO|con-admin|',
        `APROBADO>CERRADO_TEMPORALMENTE|sin-admin|${MOTIVO_AL_APROBAR}`,
        `CERRADO_TEMPORALMENTE>APTO_VENTA|sin-admin|${MOTIVO_RESTAURACION}`,
      ]);
      const publico = await publicoDe(request, pendiente);
      expect(publico.estadoApertura).toBe('ABIERTO');
    });

    test('con el Dueño activo la aprobación sigue dejando el comercio a la venta, con las dos filas de siempre', async ({ request }) => {
      const otro = await clonarComercioTest(request, dueno.comercioId, `Otro pendiente ${Date.now()}`, 'PENDIENTE');

      await resolverComercio(request, adminToken, otro, true);

      expect(estadoDe(otro)).toBe('APTO_VENTA');
      expect(historialDe(otro)).toEqual([
        'PENDIENTE>APROBADO|con-admin|',
        `APROBADO>APTO_VENTA|sin-admin|${MOTIVO_VINCULACION_NORMAL}`,
      ]);
      expect((await publicoDe(request, otro)).estadoApertura).toBe('ABIERTO');
    });
  });

  test.describe('Dueño sin cuenta de cobro', () => {
    let dueno: Dueno;
    let aprobadoSinCobro: number;
    let pendiente: number;

    test.beforeAll(async ({ request }) => {
      dueno = await duenoApto(request, false);
      aprobadoSinCobro = dueno.comercioId;
      pendiente = await clonarComercioTest(request, dueno.comercioId, `Pendiente sin cobro ${Date.now()}`, 'PENDIENTE');
      expect(estadoDe(aprobadoSinCobro)).toBe('APROBADO');
    });

    test('con la cuenta bloqueada, aprobar un pendiente lo deja APROBADO: no llega a APTO_VENTA, así que no cambia', async ({ request }) => {
      const historialPrevio = historialDe(aprobadoSinCobro);
      await bloquear(request, dueno);

      await resolverComercio(request, adminToken, pendiente, true);

      expect(estadoDe(pendiente)).toBe('APROBADO');
      expect(estadoDe(aprobadoSinCobro)).toBe('APROBADO');
      expect(historialDe(pendiente)).toEqual(['PENDIENTE>APROBADO|con-admin|']);
      expect(historialDe(aprobadoSinCobro)).toEqual(historialPrevio);
      expect(await publicoDe(request, pendiente)).toBeUndefined();
    });

    test('vincular Mercado Pago con la cuenta bloqueada deja los comercios CERRADO_TEMPORALMENTE, no a la venta', async ({ request }) => {
      await vincularMercadoPagoSimuladoTest(request, dueno.duenoId);

      expect(estadoDe(aprobadoSinCobro)).toBe('CERRADO_TEMPORALMENTE');
      expect(estadoDe(pendiente)).toBe('CERRADO_TEMPORALMENTE');
      expect(historialDe(pendiente)).toEqual([
        'PENDIENTE>APROBADO|con-admin|',
        `APROBADO>CERRADO_TEMPORALMENTE|sin-admin|${MOTIVO_AL_VINCULAR}`,
      ]);
      expect(nuncaPasoPorAptoVenta(pendiente)).toBe(true);
      expect((await publicoDe(request, pendiente)).estadoApertura).toBe('CERRADO_TEMPORALMENTE');
      expect((await publicoDe(request, aprobadoSinCobro)).textoReapertura).toBeNull();
    });

    test('el desbloqueo los restaura a APTO_VENTA porque la cuenta de cobro quedó vinculada', async ({ request }) => {
      await desbloquear(request, dueno);

      expect(estadoDe(aprobadoSinCobro)).toBe('APTO_VENTA');
      expect(estadoDe(pendiente)).toBe('APTO_VENTA');
      expect(historialDe(pendiente).at(-1)).toBe(`CERRADO_TEMPORALMENTE>APTO_VENTA|sin-admin|${MOTIVO_RESTAURACION}`);
      expect((await publicoDe(request, pendiente)).estadoApertura).toBe('ABIERTO');
    });
  });

  test('un comercio rechazado no se ve afectado por el bloqueo del Dueño', async ({ request }) => {
    const dueno = await duenoApto(request, true);
    const pendiente = await clonarComercioTest(request, dueno.comercioId, `Por rechazar ${Date.now()}`, 'PENDIENTE');
    await bloquear(request, dueno);

    await resolverComercio(request, adminToken, pendiente, false, 'Falta información del local');

    expect(estadoDe(pendiente)).toBe('RECHAZADO');
    expect(historialDe(pendiente)).toEqual(['PENDIENTE>RECHAZADO|con-admin|Falta información del local']);
  });

  test('la reactivación de cuenta restaura una sola vez: la segunda confirmación del mismo código da 401 y no duplica el historial', async ({ request }) => {
    const dueno = await duenoApto(request, true);
    const inactivo = await clonarComercioTest(request, dueno.comercioId, `Inactivo ${Date.now()}`, 'INACTIVO');
    sql(`UPDATE usuario SET estado = 'INACTIVO' WHERE id = ${dueno.duenoId};`);

    const solicitud = await apiPost(request, '/auth/reactivar-cuenta', { email: dueno.email });
    expect(solicitud.status).toBe(200);
    const codigo = await obtenerCodigoTest(request, dueno.email, 'REACTIVACION_CUENTA');

    const primera = await apiPost(request, '/auth/reactivar-cuenta/confirmar', { email: dueno.email, codigo });
    expect(primera.status).toBe(200);
    expect(sql(`SELECT estado FROM usuario WHERE id = ${dueno.duenoId};`)).toBe('ACTIVO');
    expect(estadoDe(inactivo)).toBe('APTO_VENTA');

    const segunda = await apiPost(request, '/auth/reactivar-cuenta/confirmar', { email: dueno.email, codigo });
    expect(segunda.status).toBe(401);

    expect(historialDe(inactivo)).toEqual([`INACTIVO>APTO_VENTA|sin-admin|${MOTIVO_REACTIVACION}`]);
  });
});
