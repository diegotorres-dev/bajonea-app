import { test, expect } from './helpers/prueba';
import type { APIRequestContext } from '@playwright/test';
import {
  apiConHeaders,
  apiGet,
  apiPost,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  obtenerLocalidadRioGrande,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { agregarComercioApto, prepararAprobado, reemplazarHorarios } from './helpers/multicomercio';
import { diaDeLaSemanaEnZona, fechaHoraSqlEnZona } from './helpers/zona';

const MINUTO = 60_000;
const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const conComercio = (comercioId: number): Record<string, string> => ({ 'X-Comercio-Id': String(comercioId) });
const horaEn = (desplazamientoMin: number): string => fechaHoraSqlEnZona(Date.now() + desplazamientoMin * MINUTO).slice(11, 16);
const diaEn = (desplazamientoMin: number): string => DIAS[diaDeLaSemanaEnZona(Date.now() + desplazamientoMin * MINUTO)];
const instante = (desplazamientoMin: number): string => fechaHoraSqlEnZona(Date.now() + desplazamientoMin * MINUTO).replace(' ', 'T');
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];

test.describe('Fase 2, T1 (API): turnos que cruzan la medianoche en el catálogo y el cierre manual', () => {
  test.describe.configure({ timeout: 300_000 });

  let dueno: Dueno;

  test.beforeAll(async ({ request }) => {
    const adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    const localidadId = await obtenerLocalidadRioGrande(request);
    dueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
  });

  async function comercioConTurno(request: APIRequestContext, dia: string, apertura: string, cierre: string): Promise<number> {
    const comercioId = await agregarComercioApto(request, dueno, `Cruce T1 ${sufijoUnico()}`);
    reemplazarHorarios(comercioId, [{ diaSemana: dia, horaApertura: apertura, horaCierre: cierre }]);
    return comercioId;
  }

  async function publicoDe(request: APIRequestContext, comercioId: number) {
    const listado = await apiGet(request, '/catalogo/comercios');
    expect(listado.status).toBe(200);
    const fila = listado.body.data.find((c: any) => c.id === comercioId);
    expect(fila).toBeTruthy();
    return fila;
  }

  const cerrar = (request: APIRequestContext, comercioId: number) =>
    apiConHeaders(request, 'PUT', '/comercios/cerrar', dueno.token, conComercio(comercioId));
  const abrir = (request: APIRequestContext, comercioId: number) =>
    apiConHeaders(request, 'PUT', '/comercios/abrir', dueno.token, conComercio(comercioId));
  const perfil = (request: APIRequestContext, comercioId: number) =>
    apiConHeaders(request, 'GET', '/comercios/perfil', dueno.token, conComercio(comercioId));

  test('un turno armado alrededor de ahora (cruce o no) abre el catálogo, permite cerrar y abrir a mano', async ({ request }) => {
    const comercioId = await comercioConTurno(request, diaEn(-30), horaEn(-30), horaEn(30));

    expect((await publicoDe(request, comercioId)).estadoApertura).toBe('ABIERTO');
    const vista = await perfil(request, comercioId);
    expect(vista.body.data.abiertoAhora).toBe(true);
    expect(vista.body.data.puedeCambiarCierre).toBe(true);

    const cerrado = await cerrar(request, comercioId);
    expect(cerrado.status, JSON.stringify(cerrado.body)).toBe(200);
    expect(cerrado.body.data.cerradoManualmente).toBe(true);
    expect((await publicoDe(request, comercioId)).estadoApertura).toBe('CERRADO_MANUAL');

    const abierto = await abrir(request, comercioId);
    expect(abierto.status).toBe(200);
    expect((await publicoDe(request, comercioId)).estadoApertura).toBe('ABIERTO');
  });

  test('la cola de ayer: un turno de ayer que cierra dentro de unos minutos mantiene abierto el comercio hoy y se puede cerrar a mano', async ({ request }) => {
    const salto = horaEn(30) === '23:59' ? 40 : 30;
    const comercioId = await comercioConTurno(request, diaEn(-1440), horaEn(salto + 1), horaEn(salto));

    const publico = await publicoDe(request, comercioId);
    expect(publico.estadoApertura).toBe('ABIERTO');
    expect(publico.horarios[0].cruzaMedianoche).toBe(true);

    const cerrado = await cerrar(request, comercioId);
    expect(cerrado.status, JSON.stringify(cerrado.body)).toBe(200);
    expect(cerrado.body.data.textoReapertura).toMatch(/^Reabre el /);
  });

  test('la reapertura automática con ?ahora= explícito espera al inicio del turno siguiente y no a la medianoche', async ({ request }) => {
    const salto = horaEn(30) === '23:59' ? 40 : 30;
    const comercioId = await comercioConTurno(request, diaEn(-1440), horaEn(salto + 1), horaEn(salto));
    await cerrar(request, comercioId);

    const temprano = await apiPost(request, `/test/jobs/reapertura-comercios?ahora=${encodeURIComponent(instante(120))}`, {});
    expect(temprano.status).toBe(200);
    expect((await publicoDe(request, comercioId)).estadoApertura).toBe('CERRADO_MANUAL');

    const tarde = await apiPost(request, `/test/jobs/reapertura-comercios?ahora=${encodeURIComponent(instante(60 * 24 * 8))}`, {});
    expect(tarde.status).toBe(200);
    expect((await publicoDe(request, comercioId)).estadoApertura).toBe('ABIERTO');
    expect(sql(`SELECT COUNT(*) FROM historial_cierre_comercio WHERE comercio_id = ${comercioId} AND accion = 'REABIERTO' AND actor_rol = 'SISTEMA';`)).toBe('1');
  });

  test('un turno que ya terminó deja el comercio cerrado por horario y no deja cerrar a mano', async ({ request }) => {
    const comercioId = await comercioConTurno(request, diaEn(-180), horaEn(-180), horaEn(-120));

    expect((await publicoDe(request, comercioId)).estadoApertura).toBe('CERRADO_HORARIO');
    const intento = await cerrar(request, comercioId);
    expect(intento.status).toBe(409);
    expect(intento.body.data.codigo).toBe('FUERA_DE_HORARIO');
  });

  test('un turno que empieza en una hora informa cuándo reabre', async ({ request }) => {
    const comercioId = await comercioConTurno(request, diaEn(60), horaEn(60), horaEn(120));

    const publico = await publicoDe(request, comercioId);

    expect(publico.estadoApertura).toBe('CERRADO_HORARIO');
    expect(publico.textoReapertura).toContain(horaEn(60));
  });

  test('un cambio de horarios programado no cambia el estado de hoy: sigue abierto con la versión vigente', async ({ request }) => {
    const comercioId = await comercioConTurno(request, diaEn(-30), horaEn(-30), horaEn(30));
    const programado = await apiConHeaders(request, 'PUT', '/comercios/perfil/horarios', dueno.token, conComercio(comercioId), {
      horarios: [{ diaSemana: diaEn(-30), horaApertura: '03:00', horaCierre: '04:00' }],
    });
    expect(programado.status, JSON.stringify(programado.body)).toBe(200);

    const publico = await publicoDe(request, comercioId);

    expect(publico.estadoApertura).toBe('ABIERTO');
    expect(publico.textoReapertura).toBeNull();
    expect(publico.horarios).toHaveLength(1);
  });
});
