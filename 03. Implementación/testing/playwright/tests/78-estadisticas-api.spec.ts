import { test, expect } from './helpers/prueba';
import type { APIRequestContext } from '@playwright/test';
import {
  agregarItemCarrito,
  apiConHeaders,
  confirmarPagoTest,
  crearCategoria,
  crearPedido,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { ClienteRegistrado, HorarioInput } from './helpers/backend';
import { sumarAlEquipo } from './helpers/empleado';
import type { Dueno } from './helpers/multicomercio';
import { agregarComercioApto, prepararAprobado, reemplazarHorarios } from './helpers/multicomercio';
import { hoyEnZona } from './helpers/zona';

const DIA = 24 * 60 * 60_000;
const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const PRECIO = 10000;
const HEADER = 'X-Comercio-Id';
const CATEGORIAS = ['ENTREGADO', 'NO_RETIRADO', 'RECHAZADO', 'CANCELADO', 'ANULADO', 'EXPIRADO', 'EN_CURSO'];
const FACTURABLES = ['EN_PREPARACION', 'EN_CAMINO', 'LISTO_PARA_RETIRAR', 'ENTREGADO', 'NO_RETIRADO'];
const conComercio = (comercioId: number): Record<string, string> => ({ [HEADER]: String(comercioId) });
const fechaA = (desplazamientoDias: number): string => hoyEnZona(Date.now() + desplazamientoDias * DIA);
const a = (fecha: string, hora: string): string => `${fecha}T${hora}:00`;
const todoElDia = (): HorarioInput[] => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
const semana = (franjas: Array<[string, string]>): HorarioInput[] =>
  DIAS.flatMap((diaSemana) => franjas.map(([horaApertura, horaCierre]) => ({ diaSemana, horaApertura, horaCierre })));

interface Cuenta {
  registro: ClienteRegistrado;
  id: number;
  token: string;
}

interface Esperado {
  pedidos: number;
  facturados: number;
  vendido: number;
  comision: number;
}

test.describe('Fase 2, T5 (API): estadísticas del Dueño', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;
  let dueno: Dueno;
  let otroDueno: Dueno;
  let comprador: Cuenta;
  let empleado: Cuenta;
  let clienteSinRelacion: Cuenta;

  async function nuevaCuenta(request: APIRequestContext): Promise<Cuenta> {
    const registro = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, registro.nombreUsuario, registro.password);
    return { registro, id: sesion.usuario.id, token: sesion.token };
  }

  async function comercioConPedidos(request: APIRequestContext, propietario: Dueno, cantidad: number): Promise<{ comercioId: number; pedidos: number[] }> {
    const comercioId = await agregarComercioApto(request, propietario, `Estadisticas T5 ${sufijoUnico()}`);
    const producto = await apiConHeaders(request, 'POST', '/productos', propietario.token, conComercio(comercioId), {
      nombre: `Producto T5 ${sufijoUnico()}`,
      precio: PRECIO,
      categoriaId,
    });
    expect(producto.status, JSON.stringify(producto.body)).toBe(201);
    const pedidos: number[] = [];
    for (let i = 0; i < cantidad; i += 1) {
      await apiConHeaders(request, 'DELETE', '/carrito', comprador.token);
      await agregarItemCarrito(request, comprador.token, producto.body.data.id as number, 1);
      pedidos.push(await crearPedido(request, comprador.token, 'RETIRO', null));
    }
    return { comercioId, pedidos };
  }

  const estado = (pedidoId: number, nuevo: string): void => {
    sql(`UPDATE pedido SET estado = '${nuevo}' WHERE id = ${pedidoId};`);
  };

  function esperado(pedidos: number[]): Esperado {
    if (pedidos.length === 0) {
      return { pedidos: 0, facturados: 0, vendido: 0, comision: 0 };
    }
    const filas = sql(`SELECT estado, subtotal, cargo_servicio_comercio FROM pedido WHERE id IN (${pedidos.join(',')});`)
      .split('\n')
      .filter(Boolean)
      .map((linea) => linea.split('\t'));
    const facturables = filas.filter(([estadoPedido]) => FACTURABLES.includes(estadoPedido));
    return {
      pedidos: filas.length,
      facturados: facturables.length,
      vendido: facturables.reduce((suma, fila) => suma + Number(fila[1]), 0),
      comision: facturables.reduce((suma, fila) => suma + Number(fila[2]), 0),
    };
  }

  const estadisticas = (
    request: APIRequestContext,
    token: string | undefined,
    comercioId: number | null,
    desde: string | null,
    hasta: string | null,
    agrupar: string | null,
  ) => {
    const parametros = [desde && `desde=${desde}`, hasta && `hasta=${hasta}`, agrupar && `agrupar=${agrupar}`].filter(Boolean).join('&');
    return apiConHeaders(request, 'GET', `/comercios/estadisticas${parametros ? `?${parametros}` : ''}`, token,
      comercioId === null ? {} : conComercio(comercioId));
  };

  const datos = async (request: APIRequestContext, comercioId: number, desde: string, hasta: string, agrupar: string) => {
    const { status, body } = await estadisticas(request, dueno.token, comercioId, desde, hasta, agrupar);
    expect(status, JSON.stringify(body)).toBe(200);
    return body.data;
  };

  const cifras = (nodo: any): Esperado => ({
    pedidos: nodo.pedidos,
    facturados: nodo.facturados,
    vendido: Number(nodo.vendido),
    comision: Number(nodo.comision),
  });

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat Estadisticas T5 ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    otroDueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    comprador = await nuevaCuenta(request);
    empleado = await nuevaCuenta(request);
    clienteSinRelacion = await nuevaCuenta(request);
    await sumarAlEquipo(request, dueno.comercioId, empleado.registro, dueno.token);
  });

  test('por día: cada día trae sus cifras, los días vacíos van en cero y los totales suman los períodos', async ({ request }) => {
    const { comercioId, pedidos } = await comercioConPedidos(request, dueno, 7);
    reemplazarHorarios(comercioId, semana([['12:00', '15:00']]));
    const dias = [fechaA(-3), fechaA(-3), fechaA(-3), fechaA(-2), fechaA(-2), fechaA(-2), fechaA(0)];
    for (let i = 0; i < pedidos.length; i += 1) {
      await confirmarPagoTest(request, pedidos[i], false, a(dias[i], '13:00'));
    }
    estado(pedidos[0], 'ENTREGADO');
    estado(pedidos[1], 'ENTREGADO');
    estado(pedidos[2], 'RECHAZADO');
    estado(pedidos[3], 'EN_PREPARACION');
    estado(pedidos[4], 'ANULADO');
    estado(pedidos[5], 'NO_RETIRADO');

    const respuesta = await datos(request, comercioId, fechaA(-4), fechaA(0), 'DIA');

    expect(respuesta.agrupar).toBe('DIA');
    expect(respuesta.periodos.map((p: any) => p.fecha)).toEqual([fechaA(-4), fechaA(-3), fechaA(-2), fechaA(-1), fechaA(0)]);
    expect(cifras(respuesta.periodos[0])).toEqual(esperado([]));
    expect(cifras(respuesta.periodos[1])).toEqual(esperado(pedidos.slice(0, 3)));
    expect(cifras(respuesta.periodos[2])).toEqual(esperado(pedidos.slice(3, 6)));
    expect(cifras(respuesta.periodos[3])).toEqual(esperado([]));
    expect(cifras(respuesta.periodos[4])).toEqual(esperado(pedidos.slice(6)));
    expect(respuesta.periodos[1].turno).toBeNull();
    expect(respuesta.periodos[0].ticketPromedio).toBeNull();
    expect(Number(respuesta.periodos[1].ticketPromedio)).toBeCloseTo(PRECIO, 2);
    expect(cifras(respuesta.totales)).toEqual(esperado(pedidos));
    expect(Number(respuesta.totales.neto)).toBeCloseTo(esperado(pedidos).vendido - esperado(pedidos).comision, 2);
    const sumaPeriodos = respuesta.periodos.reduce((suma: number, p: any) => suma + p.pedidos, 0);
    expect(sumaPeriodos).toBe(respuesta.totales.pedidos);
  });

  test('por turno: dos turnos el mismo día son dos períodos y un pagado sin turno va al final del día', async ({ request }) => {
    const { comercioId, pedidos } = await comercioConPedidos(request, dueno, 4);
    reemplazarHorarios(comercioId, semana([['12:00', '15:00'], ['20:00', '23:00']]));
    const dia = fechaA(-2);
    await confirmarPagoTest(request, pedidos[0], false, a(dia, '13:00'));
    await confirmarPagoTest(request, pedidos[1], false, a(dia, '21:00'));
    await confirmarPagoTest(request, pedidos[2], false, a(dia, '21:30'));
    await confirmarPagoTest(request, pedidos[3], false, a(dia, '18:00'));
    sql(`UPDATE pedido SET turno_fecha = NULL, turno_horario_id = NULL WHERE id = ${pedidos[3]};`);
    pedidos.slice(0, 4).forEach((id) => estado(id, 'ENTREGADO'));

    const respuesta = await datos(request, comercioId, dia, dia, 'TURNO');

    const periodos = respuesta.periodos;
    expect(periodos).toHaveLength(3);
    expect(periodos[0].turno.inicio).toBe(a(dia, '12:00'));
    expect(periodos[0].turno.fin).toBe(a(dia, '15:00'));
    expect(periodos[0].turno.cruzaMedianoche).toBe(false);
    expect(periodos[0].pedidos).toBe(1);
    expect(periodos[1].turno.inicio).toBe(a(dia, '20:00'));
    expect(periodos[1].pedidos).toBe(2);
    expect(periodos[2].turno).toBeNull();
    expect(periodos[2].fecha).toBe(dia);
    expect(periodos[2].pedidos).toBe(1);
    expect(cifras(respuesta.totales)).toEqual(esperado(pedidos));
    const porDia = await datos(request, comercioId, dia, dia, 'DIA');
    expect(porDia.periodos).toHaveLength(1);
    expect(porDia.periodos[0].pedidos).toBe(4);
  });

  test('un turno que cruza la medianoche cuenta en el día de apertura y trae su fin al día siguiente', async ({ request }) => {
    const { comercioId, pedidos } = await comercioConPedidos(request, dueno, 1);
    reemplazarHorarios(comercioId, semana([['20:00', '02:00']]));
    const apertura = fechaA(-3);
    await confirmarPagoTest(request, pedidos[0], false, a(fechaA(-2), '01:00'));
    estado(pedidos[0], 'ENTREGADO');

    const porDia = await datos(request, comercioId, apertura, fechaA(-2), 'DIA');
    const porTurno = await datos(request, comercioId, apertura, fechaA(-2), 'TURNO');

    expect(porDia.periodos[0].pedidos).toBe(1);
    expect(porDia.periodos[1].pedidos).toBe(0);
    expect(porTurno.periodos).toHaveLength(1);
    expect(porTurno.periodos[0].fecha).toBe(apertura);
    expect(porTurno.periodos[0].turno.cruzaMedianoche).toBe(true);
    expect(porTurno.periodos[0].turno.inicio).toBe(a(apertura, '20:00'));
    expect(porTurno.periodos[0].turno.fin).toBe(a(fechaA(-2), '02:00'));
  });

  test('las siete categorías: cancelado por sistema junto con cancelado, en curso agrupa los estados abiertos y lo nunca pagado no entra', async ({ request }) => {
    const { comercioId, pedidos } = await comercioConPedidos(request, dueno, 11);
    reemplazarHorarios(comercioId, semana([['12:00', '15:00']]));
    const dia = fechaA(-1);
    const pagados = pedidos.slice(0, 10);
    for (const id of pagados) {
      await confirmarPagoTest(request, id, false, a(dia, '13:00'));
    }
    const finales = ['ENTREGADO', 'NO_RETIRADO', 'RECHAZADO', 'CANCELADO', 'CANCELADO_POR_SISTEMA', 'ANULADO', 'EXPIRADO', 'EN_PREPARACION', 'EN_CAMINO', 'LISTO_PARA_RETIRAR'];
    finales.forEach((final, i) => estado(pagados[i], final));
    const sinPagar = pedidos[10];

    const respuesta = await datos(request, comercioId, dia, dia, 'DIA');

    const resultados = respuesta.totales.resultados;
    expect(Object.keys(resultados).sort()).toEqual([...CATEGORIAS].sort());
    expect(resultados).toEqual({ ENTREGADO: 1, NO_RETIRADO: 1, RECHAZADO: 1, CANCELADO: 2, ANULADO: 1, EXPIRADO: 1, EN_CURSO: 3 });
    expect(respuesta.totales.pedidos).toBe(10);
    expect(respuesta.totales.facturados).toBe(5);
    expect(sql(`SELECT estado FROM pedido WHERE id = ${sinPagar};`)).toBe('PENDIENTE_PAGO');
  });

  test('las estadísticas son vivas: anular un pedido en preparación baja lo vendido', async ({ request }) => {
    const { comercioId, pedidos } = await comercioConPedidos(request, dueno, 2);
    reemplazarHorarios(comercioId, semana([['12:00', '15:00']]));
    const dia = fechaA(-1);
    for (const id of pedidos) {
      await confirmarPagoTest(request, id, false, a(dia, '13:00'));
      estado(id, 'EN_PREPARACION');
    }
    const antes = await datos(request, comercioId, dia, dia, 'DIA');
    estado(pedidos[0], 'ANULADO');
    const despues = await datos(request, comercioId, dia, dia, 'DIA');

    expect(Number(antes.totales.vendido)).toBe(PRECIO * 2);
    expect(Number(despues.totales.vendido)).toBe(PRECIO);
    expect(despues.totales.resultados.ANULADO).toBe(1);
    expect(despues.totales.pedidos).toBe(2);
  });

  test('las cifras de hoy coinciden con las del panel (resumen-turno) para el mismo turno', async ({ request }) => {
    const { comercioId, pedidos } = await comercioConPedidos(request, dueno, 3);
    reemplazarHorarios(comercioId, [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }]);
    for (const id of pedidos) {
      await confirmarPagoTest(request, id, false);
    }
    estado(pedidos[0], 'ENTREGADO');
    estado(pedidos[1], 'EN_PREPARACION');

    const resumen = await apiConHeaders(request, 'GET', '/pedidos/comercio/resumen-turno', dueno.token, conComercio(comercioId));
    const respuesta = await datos(request, comercioId, fechaA(0), fechaA(0), 'TURNO');

    expect(resumen.status).toBe(200);
    expect(respuesta.periodos).toHaveLength(1);
    expect(Number(respuesta.periodos[0].vendido)).toBe(Number(resumen.body.data.vendido));
    expect(Number(respuesta.periodos[0].comision)).toBe(Number(resumen.body.data.comision));
    expect(Number(respuesta.periodos[0].neto)).toBe(Number(resumen.body.data.neto));
    expect(respuesta.periodos[0].pedidos).toBe(resumen.body.data.cantidadPedidos);
  });

  test('un comercio sin pedidos devuelve todo en cero con el ticket nulo, y el rango máximo es de 92 días', async ({ request }) => {
    const comercioId = await agregarComercioApto(request, dueno, `Estadisticas T5 vacio ${sufijoUnico()}`);

    const semanaVacia = await datos(request, comercioId, fechaA(-6), fechaA(0), 'DIA');
    expect(semanaVacia.periodos).toHaveLength(7);
    expect(semanaVacia.totales.pedidos).toBe(0);
    expect(semanaVacia.totales.ticketPromedio).toBeNull();
    expect(Number(semanaVacia.totales.neto)).toBe(0);
    expect(Object.keys(semanaVacia.totales.resultados)).toHaveLength(7);

    const treinta = await datos(request, comercioId, fechaA(-29), fechaA(0), 'DIA');
    expect(treinta.periodos).toHaveLength(30);
    const tope = await datos(request, comercioId, fechaA(-91), fechaA(0), 'TURNO');
    expect(tope.periodos).toHaveLength(0);
    const excedido = await estadisticas(request, dueno.token, comercioId, fechaA(-92), fechaA(0), 'DIA');
    expect(excedido.status).toBe(400);
    expect(excedido.body.mensaje).toBe('El rango no puede superar los 92 días');
  });

  test('parámetros inválidos responden 400 con su mensaje', async ({ request }) => {
    const c = dueno.comercioId;
    const casos: Array<[string | null, string | null, string | null, string]> = [
      [null, fechaA(0), 'DIA', 'Indicá las fechas desde y hasta'],
      [fechaA(0), null, 'DIA', 'Indicá las fechas desde y hasta'],
      ['05-10-2026', fechaA(0), 'DIA', 'La fecha desde tiene que tener el formato AAAA-MM-DD'],
      [fechaA(0), 'ayer', 'DIA', 'La fecha hasta tiene que tener el formato AAAA-MM-DD'],
      [fechaA(0), fechaA(-1), 'DIA', 'La fecha desde no puede ser posterior a la fecha hasta'],
      [fechaA(-1), fechaA(0), 'MES', 'La agrupación tiene que ser DIA o TURNO'],
    ];
    for (const [desde, hasta, agrupar, mensaje] of casos) {
      const { status, body } = await estadisticas(request, dueno.token, c, desde, hasta, agrupar);
      expect(status, `${desde} ${hasta} ${agrupar}`).toBe(400);
      expect(body.mensaje).toBe(mensaje);
    }
  });

  test('un Dueño con dos comercios ve en cada uno solo lo suyo, según X-Comercio-Id', async ({ request }) => {
    const uno = await comercioConPedidos(request, dueno, 1);
    const otro = await comercioConPedidos(request, dueno, 2);
    for (const escena of [uno, otro]) {
      reemplazarHorarios(escena.comercioId, semana([['12:00', '15:00']]));
    }
    const dia = fechaA(-1);
    for (const id of [...uno.pedidos, ...otro.pedidos]) {
      await confirmarPagoTest(request, id, false, a(dia, '13:00'));
      estado(id, 'ENTREGADO');
    }

    const delUno = await datos(request, uno.comercioId, dia, dia, 'DIA');
    const delOtro = await datos(request, otro.comercioId, dia, dia, 'DIA');

    expect(delUno.totales.pedidos).toBe(1);
    expect(delOtro.totales.pedidos).toBe(2);
  });

  test('seguridad: Empleado, Cliente y Administrador 403, sin token 401, sin header 400, header no numérico 400 y comercio ajeno 404', async ({ request }) => {
    const c = dueno.comercioId;
    const hoy = fechaA(0);

    for (const [token, header] of [[empleado.token, c], [empleado.token, null], [clienteSinRelacion.token, c], [adminToken, c], [adminToken, null]] as Array<[string, number | null]>) {
      const { status } = await estadisticas(request, token, header, hoy, hoy, 'DIA');
      expect(status).toBe(403);
    }
    expect((await estadisticas(request, undefined, c, hoy, hoy, 'DIA')).status).toBe(401);
    expect((await estadisticas(request, dueno.token, null, hoy, hoy, 'DIA')).status).toBe(400);
    const noNumerico = await apiConHeaders(request, 'GET', `/comercios/estadisticas?desde=${hoy}&hasta=${hoy}`, dueno.token, { [HEADER]: 'abc' });
    expect(noNumerico.status).toBe(400);
    expect((await estadisticas(request, otroDueno.token, c, hoy, hoy, 'DIA')).status).toBe(404);
    expect((await estadisticas(request, dueno.token, c, hoy, hoy, 'DIA')).status).toBe(200);
  });
});
