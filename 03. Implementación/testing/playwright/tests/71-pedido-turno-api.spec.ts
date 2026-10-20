import { test, expect } from './helpers/prueba';
import type { APIRequestContext } from '@playwright/test';
import {
  agregarItemCarrito,
  apiConHeaders,
  confirmarPagoTest,
  crearCategoria,
  crearPedido,
  diaDeHoy,
  diaDistintoDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { ClienteRegistrado } from './helpers/backend';
import { sumarAlEquipo } from './helpers/empleado';
import type { Dueno } from './helpers/multicomercio';
import { agregarComercioApto, prepararAprobado, reemplazarHorarios } from './helpers/multicomercio';
import { diaDeLaSemanaEnZona, fechaHoraSqlEnZona, hoyEnZona } from './helpers/zona';

const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;
const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const PRECIO = 10000;
const HEADER = 'X-Comercio-Id';
const conComercio = (comercioId: number): Record<string, string> => ({ [HEADER]: String(comercioId) });
const horaEn = (desplazamientoMin: number): string => fechaHoraSqlEnZona(Date.now() + desplazamientoMin * MINUTO).slice(11, 16);
const diaEn = (desplazamientoMin: number): string => DIAS[diaDeLaSemanaEnZona(Date.now() + desplazamientoMin * MINUTO)];
const instante = (desplazamientoMin: number): string => fechaHoraSqlEnZona(Date.now() + desplazamientoMin * MINUTO).replace(' ', 'T');
const hoyA = (hora: string): string => `${hoyEnZona()}T${hora}:00`;
const mananaA = (hora: string): string => `${hoyEnZona(Date.now() + DIA)}T${hora}:00`;
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];

interface Cuenta {
  registro: ClienteRegistrado;
  id: number;
  token: string;
}

interface Escena {
  comercioId: number;
  productoId: number;
  pedidos: number[];
}

test.describe('Fase 2, T2 (API): el turno del pedido al confirmarse el pago y el resumen del turno', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;
  let dueno: Dueno;
  let comprador: Cuenta;
  let ajeno: Cuenta;

  const estadoDe = (pedidoId: number): string => sql(`SELECT estado FROM pedido WHERE id = ${pedidoId};`);
  const turnoDe = (pedidoId: number) => {
    const [fecha, horarioId, pago] = sql(
      `SELECT IFNULL(turno_fecha,'NULL'), IFNULL(turno_horario_id,'NULL'), IFNULL(fecha_pago_confirmado,'NULL') FROM pedido WHERE id = ${pedidoId};`,
    ).split('\t');
    return { fecha, horarioId, pago };
  };
  const pagoDelHistorial = (pedidoId: number): string =>
    sql(`SELECT MIN(fecha_hora) FROM historial_estado_pedido WHERE pedido_id = ${pedidoId} AND estado = 'PENDIENTE_CONFIRMACION_COMERCIO';`);
  const horarioDe = (comercioId: number, dia: string, apertura: string): string =>
    sql(`SELECT id FROM horario WHERE comercio_id = ${comercioId} AND dia_semana = '${dia}' AND hora_apertura = '${apertura}:00';`);
  const resumen = (request: APIRequestContext, token: string, comercioId: number) =>
    apiConHeaders(request, 'GET', '/pedidos/comercio/resumen-turno', token, conComercio(comercioId));

  async function nuevaCuenta(request: APIRequestContext): Promise<Cuenta> {
    const registro = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, registro.nombreUsuario, registro.password);
    return { registro, id: sesion.usuario.id, token: sesion.token };
  }

  async function escena(request: APIRequestContext, cantidad: number, horarios?: Array<{ diaSemana: string; horaApertura: string; horaCierre: string }>): Promise<Escena> {
    const comercioId = await agregarComercioApto(request, dueno, `Turno T2 ${sufijoUnico()}`);
    const producto = await apiConHeaders(request, 'POST', '/productos', dueno.token, conComercio(comercioId), {
      nombre: `Producto T2 ${sufijoUnico()}`,
      precio: PRECIO,
      categoriaId,
    });
    expect(producto.status, JSON.stringify(producto.body)).toBe(201);
    const productoId = producto.body.data.id as number;
    const pedidos: number[] = [];
    for (let i = 0; i < cantidad; i += 1) {
      await apiConHeaders(request, 'DELETE', '/carrito', comprador.token);
      await agregarItemCarrito(request, comprador.token, productoId, 1);
      pedidos.push(await crearPedido(request, comprador.token, 'RETIRO', null));
    }
    if (horarios) {
      reemplazarHorarios(comercioId, horarios);
    }
    return { comercioId, productoId, pedidos };
  }

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat Turno T2 ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    comprador = await nuevaCuenta(request);
    ajeno = await nuevaCuenta(request);
  });

  test('un pago real con una franja de todo el día queda estampado con el turno de hoy y la misma hora en el historial', async ({ request }) => {
    const { comercioId, pedidos } = await escena(request, 1);

    await confirmarPagoTest(request, pedidos[0], true);

    const turno = turnoDe(pedidos[0]);
    expect(estadoDe(pedidos[0])).toBe('PENDIENTE_CONFIRMACION_COMERCIO');
    expect(turno.fecha).toBe(hoyEnZona());
    expect(turno.horarioId).toBe(horarioDe(comercioId, diaDeHoy(), '00:00'));
    expect(turno.pago).toBe(pagoDelHistorial(pedidos[0]));
  });

  test('con la hora elegida: dentro de un turno, fuera de toda franja y de madrugada en un turno que cruza', async ({ request }) => {
    const partido = await escena(request, 2, [
      { diaSemana: diaDeHoy(), horaApertura: '12:00', horaCierre: '15:00' },
      { diaSemana: diaDeHoy(), horaApertura: '20:00', horaCierre: '23:00' },
    ]);
    const cruce = await escena(request, 1, [{ diaSemana: diaDeHoy(), horaApertura: '20:00', horaCierre: '02:00' }]);

    await confirmarPagoTest(request, partido.pedidos[0], false, hoyA('13:00'));
    await confirmarPagoTest(request, partido.pedidos[1], false, hoyA('18:00'));
    await confirmarPagoTest(request, cruce.pedidos[0], false, mananaA('01:30'));

    const almuerzo = horarioDe(partido.comercioId, diaDeHoy(), '12:00');
    expect(turnoDe(partido.pedidos[0])).toMatchObject({ fecha: hoyEnZona(), horarioId: almuerzo });
    expect(turnoDe(partido.pedidos[1])).toMatchObject({ fecha: hoyEnZona(), horarioId: almuerzo });
    expect(turnoDe(partido.pedidos[0]).pago).toBe(`${hoyEnZona()} 13:00:00`);
    expect(turnoDe(cruce.pedidos[0])).toMatchObject({ fecha: hoyEnZona(), horarioId: horarioDe(cruce.comercioId, diaDeHoy(), '20:00') });
    expect(turnoDe(cruce.pedidos[0]).pago).toBe(pagoDelHistorial(cruce.pedidos[0]));
  });

  test('un comercio sin franjas deja el pedido pagado sin turno pero con la fecha del pago', async ({ request }) => {
    const { pedidos } = await escena(request, 1, []);

    await confirmarPagoTest(request, pedidos[0], false, hoyA('13:00'));

    expect(estadoDe(pedidos[0])).toBe('PENDIENTE_CONFIRMACION_COMERCIO');
    expect(turnoDe(pedidos[0])).toEqual({ fecha: 'NULL', horarioId: 'NULL', pago: `${hoyEnZona()} 13:00:00` });
  });

  test('confirmar de nuevo el mismo pago no cambia el turno ni duplica el historial', async ({ request }) => {
    const { pedidos } = await escena(request, 1);
    await confirmarPagoTest(request, pedidos[0], true);
    const antes = turnoDe(pedidos[0]);

    await confirmarPagoTest(request, pedidos[0], false, hoyA('03:00'));

    expect(turnoDe(pedidos[0])).toEqual(antes);
    expect(sql(`SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ${pedidos[0]} AND estado = 'PENDIENTE_CONFIRMACION_COMERCIO';`)).toBe('1');
  });

  test('editar los horarios después no cambia el turno de un pedido ya pagado', async ({ request }) => {
    const { comercioId, pedidos } = await escena(request, 1);
    await confirmarPagoTest(request, pedidos[0], true);
    const antes = turnoDe(pedidos[0]);

    const edicion = await apiConHeaders(request, 'PUT', '/comercios/perfil/horarios', dueno.token, conComercio(comercioId), {
      horarios: [{ diaSemana: diaDistintoDeHoy(), horaApertura: '10:00', horaCierre: '18:00' }],
    });

    expect(edicion.status, JSON.stringify(edicion.body)).toBe(200);
    expect(turnoDe(pedidos[0])).toEqual(antes);
    expect(sql(`SELECT COUNT(*) FROM horario WHERE id = ${antes.horarioId};`)).toBe('1');
  });

  test.describe('El resumen del turno', () => {
    let enCurso: Escena;
    let empleado: Cuenta;

    test('en curso: el vendido es el subtotal bruto de los facturables, la comisión y el neto son del Dueño y los pendientes cuentan los de otro turno', async ({ request }) => {
      enCurso = await escena(request, 3, [{ diaSemana: diaEn(-30), horaApertura: horaEn(-30), horaCierre: horaEn(30) }]);
      const [aceptado, pendienteDelTurno, pendienteDeOtroTurno] = enCurso.pedidos;
      await confirmarPagoTest(request, aceptado, true);
      await confirmarPagoTest(request, pendienteDelTurno, true);
      await confirmarPagoTest(request, pendienteDeOtroTurno, true, instante(-1440));
      const accion = await apiConHeaders(request, 'PUT', `/pedidos/comercio/${aceptado}/aceptar`, dueno.token, conComercio(enCurso.comercioId), {});
      expect(accion.status, JSON.stringify(accion.body)).toBe(200);
      const lista = await apiConHeaders(request, 'GET', '/pedidos/comercio', dueno.token, conComercio(enCurso.comercioId));
      const delAceptado = (lista.body.data as any[]).find((p) => p.id === aceptado);

      const respuesta = await resumen(request, dueno.token, enCurso.comercioId);

      expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
      const data = respuesta.body.data;
      expect(data.estado).toBe('EN_CURSO');
      expect(data.turno.cruzaMedianoche).toBe(horaEn(30) < horaEn(-30));
      expect(data.vendido).toBe(PRECIO);
      expect(data.comision).toBeCloseTo(delAceptado.cargoServicioComercio, 2);
      expect(data.neto).toBeCloseTo(PRECIO - delAceptado.cargoServicioComercio, 2);
      expect(data.cantidadPedidos).toBe(2);
      expect(data.cantidadPendientes).toBe(2);
      expect(Object.keys(data).sort()).toEqual(['cantidadPedidos', 'cantidadPendientes', 'comision', 'estado', 'neto', 'turno', 'vendido']);
    });

    test('el Empleado ve el mismo vendido y los mismos contadores, sin comisión ni neto', async ({ request }) => {
      empleado = await nuevaCuenta(request);
      await sumarAlEquipo(request, enCurso.comercioId, empleado.registro, dueno.token);
      empleado.token = (await login(request, empleado.registro.nombreUsuario, empleado.registro.password)).token;

      const delDueno = (await resumen(request, dueno.token, enCurso.comercioId)).body.data;
      const delEmpleado = await resumen(request, empleado.token, enCurso.comercioId);

      expect(delEmpleado.status, JSON.stringify(delEmpleado.body)).toBe(200);
      expect(Object.keys(delEmpleado.body.data).sort()).toEqual(['cantidadPedidos', 'cantidadPendientes', 'estado', 'turno', 'vendido']);
      expect(delEmpleado.body.data.vendido).toBe(delDueno.vendido);
      expect(delEmpleado.body.data.cantidadPedidos).toBe(delDueno.cantidadPedidos);
      expect(delEmpleado.body.data.cantidadPendientes).toBe(delDueno.cantidadPendientes);
    });

    test('entre turnos muestra el último turno terminado, rotulado como terminado', async ({ request }) => {
      const terminado = await escena(request, 2, [{ diaSemana: diaEn(-180), horaApertura: horaEn(-180), horaCierre: horaEn(-120) }]);
      await confirmarPagoTest(request, terminado.pedidos[0], true, instante(-150));
      await confirmarPagoTest(request, terminado.pedidos[1], true, instante(-140));
      expect((await apiConHeaders(request, 'PUT', `/pedidos/comercio/${terminado.pedidos[0]}/aceptar`, dueno.token, conComercio(terminado.comercioId), {})).status).toBe(200);

      const data = (await resumen(request, dueno.token, terminado.comercioId)).body.data;

      expect(data.estado).toBe('TERMINADO');
      expect(data.vendido).toBe(PRECIO);
      expect(data.cantidadPedidos).toBe(2);
      expect(data.cantidadPendientes).toBe(1);
      expect(data.turno.fin < instante(0).slice(0, 19)).toBe(true);
    });

    test('sin ningún turno los montos van en cero y se informan solo los pendientes', async ({ request }) => {
      const sinTurno = await escena(request, 1, []);
      await confirmarPagoTest(request, sinTurno.pedidos[0], true, hoyA('13:00'));

      const data = (await resumen(request, dueno.token, sinTurno.comercioId)).body.data;

      expect(data.estado).toBe('SIN_TURNO');
      expect(data.turno).toBeNull();
      expect(data.vendido).toBe(0);
      expect(data.comision).toBe(0);
      expect(data.neto).toBe(0);
      expect(data.cantidadPedidos).toBe(0);
      expect(data.cantidadPendientes).toBe(1);
    });

    test('quién no puede entrar: sin token, Administrador, Cliente sin relación; y la ruta vieja ya no existe', async ({ request }) => {
      const sinToken = await resumen(request, undefined as unknown as string, enCurso.comercioId);
      const admin = await resumen(request, adminToken, enCurso.comercioId);
      const clienteConHeader = await resumen(request, ajeno.token, enCurso.comercioId);
      const clienteSinHeader = await apiConHeaders(request, 'GET', '/pedidos/comercio/resumen-turno', ajeno.token);
      const duenoSinHeader = await apiConHeaders(request, 'GET', '/pedidos/comercio/resumen-turno', dueno.token);
      const vieja = await apiConHeaders(request, 'GET', '/pedidos/comercio/resumen-hoy', dueno.token, conComercio(enCurso.comercioId));

      expect(sinToken.status).toBe(401);
      expect(admin.status).toBe(403);
      expect(clienteConHeader.status).toBe(404);
      expect(clienteSinHeader.status).toBe(400);
      expect(duenoSinHeader.status).toBe(400);
      expect(vieja.status).toBeGreaterThanOrEqual(400);
      expect(vieja.status).toBeLessThan(500);
    });
  });
});
