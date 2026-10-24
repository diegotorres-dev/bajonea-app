import { test, expect } from './helpers/prueba';
import type { APIRequestContext } from '@playwright/test';
import {
  agregarItemCarrito,
  apiConHeaders,
  apiGet,
  cierresDeTurnoTest,
  confirmarPagoTest,
  conFallasDelEmailDeResumen,
  crearCategoria,
  crearPedido,
  diaDeHoy,
  ejecutarCierreTurnosTest,
  fallasDelEmailDeResumenTest,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { ClienteRegistrado, ResultadoCorridaCierre } from './helpers/backend';
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
const hoyA = (hora: string): string => `${hoyEnZona()}T${hora.length === 5 ? `${hora}:00` : hora}`;
const minutosDespues = (iso: string, minutos: number): string => {
  const [fecha, hora] = iso.split('T');
  const [h, m, s] = hora.split(':').map(Number);
  const total = h * 60 + m + minutos;
  const dia = Math.floor(total / 1440);
  const resto = ((total % 1440) + 1440) % 1440;
  const fechaFinal = dia === 0 ? fecha : hoyEnZona(Date.parse(`${fecha}T12:00:00Z`) + dia * DIA);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${fechaFinal}T${pad(Math.floor(resto / 60))}:${pad(resto % 60)}:${pad(s || 0)}`;
};
const hastaElMinuto = (iso: string): string => iso.slice(0, 16);
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
const almuerzo = () => [{ diaSemana: diaDeHoy(), horaApertura: '12:00', horaCierre: '15:00' }];
const AHORA = hoyA('15:30');

interface Cuenta {
  registro: ClienteRegistrado;
  id: number;
  token: string;
}

interface Escena {
  comercioId: number;
  pedidos: number[];
}

test.describe('Fase 2, T4 (API): cierre de turno, foto de cifras y email al Dueño', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;
  let dueno: Dueno;
  let comprador: Cuenta;

  const correr = (request: APIRequestContext, ahora: string): Promise<ResultadoCorridaCierre> => ejecutarCierreTurnosTest(request, ahora);
  const unico = async (request: APIRequestContext, comercioId: number) => {
    const filas = await cierresDeTurnoTest(request, comercioId);
    expect(filas, `cierres del comercio ${comercioId}`).toHaveLength(1);
    return filas[0];
  };

  async function barrer(request: APIRequestContext, ahora: string): Promise<void> {
    for (let vuelta = 0; vuelta < 5; vuelta += 1) {
      const resultado = await correr(request, ahora);
      if (resultado.cierresCreados === 0 && resultado.mailsEnviados === 0 && resultado.cierresConFalla === 0) {
        return;
      }
    }
  }

  async function nuevaCuenta(request: APIRequestContext): Promise<Cuenta> {
    const registro = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, registro.nombreUsuario, registro.password);
    return { registro, id: sesion.usuario.id, token: sesion.token };
  }

  async function escena(
    request: APIRequestContext,
    propietario: Dueno,
    cantidad: number,
    horarios: Array<{ diaSemana: string; horaApertura: string; horaCierre: string }>,
  ): Promise<Escena> {
    const comercioId = await agregarComercioApto(request, propietario, `Cierre T4 ${sufijoUnico()}`);
    const producto = await apiConHeaders(request, 'POST', '/productos', propietario.token, conComercio(comercioId), {
      nombre: `Producto T4 ${sufijoUnico()}`,
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
    if (pedidos.length > 0) {
      sql(`UPDATE pedido SET fecha_creacion = '${hoyEnZona()} 23:30:00' WHERE id IN (${pedidos.join(',')});`);
    }
    reemplazarHorarios(comercioId, horarios);
    return { comercioId, pedidos };
  }

  const pagar = async (request: APIRequestContext, pedidos: number[], ahora: string) => {
    for (const pedidoId of pedidos) {
      await confirmarPagoTest(request, pedidoId, false, ahora);
    }
  };

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat Cierre T4 ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    comprador = await nuevaCuenta(request);
    await fallasDelEmailDeResumenTest(request, 0);
  });

  test.afterAll(async ({ request }) => {
    await fallasDelEmailDeResumenTest(request, 0);
  });

  test('no cierra antes de fin más gracia, cierra justo al cumplirse y una corrida posterior no repite nada', async ({ request }) => {
    await barrer(request, AHORA);
    const { comercioId, pedidos } = await escena(request, dueno, 2, almuerzo());
    await pagar(request, pedidos, hoyA('13:00'));

    const antes = await correr(request, hoyA('15:29:59'));
    expect(antes.cierresCreados).toBe(0);
    expect(await cierresDeTurnoTest(request, comercioId)).toHaveLength(0);

    const despues = await correr(request, AHORA);
    expect(despues.cierresCreados).toBe(1);
    expect(despues.mailsEnviados).toBe(1);
    expect(despues.cierresEnviados).toBe(1);
    const fila = await unico(request, comercioId);
    expect(fila.emailEstado).toBe('ENVIADO');
    expect(fila.cantidadPedidos).toBe(2);
    expect(fila.turnoFecha).toBe(hoyEnZona());
    expect(hastaElMinuto(fila.fin)).toBe(hastaElMinuto(hoyA('15:00')));

    const repetida = await correr(request, AHORA);
    const tarde = await correr(request, hoyA('18:00'));
    expect(repetida.cierresCreados).toBe(0);
    expect(repetida.mailsEnviados).toBe(0);
    expect(tarde.cierresCreados).toBe(0);
    expect(tarde.mailsEnviados).toBe(0);
    expect(await cierresDeTurnoTest(request, comercioId)).toHaveLength(1);
  });

  test('las cifras de la foto son las mismas que el resumen del turno mostraba antes de cerrar', async ({ request }) => {
    const ahora = instante(0);
    await barrer(request, ahora);
    const franja = { diaSemana: diaEn(-120), horaApertura: horaEn(-120), horaCierre: horaEn(-40) };
    const { comercioId, pedidos } = await escena(request, dueno, 4, [franja]);
    await pagar(request, pedidos, instante(-100));
    sql(`UPDATE pedido SET estado = 'ENTREGADO' WHERE id = ${pedidos[0]};`);
    sql(`UPDATE pedido SET estado = 'EN_PREPARACION' WHERE id = ${pedidos[1]};`);
    sql(`UPDATE pedido SET estado = 'RECHAZADO' WHERE id = ${pedidos[2]};`);
    const resumen = await apiConHeaders(request, 'GET', '/pedidos/comercio/resumen-turno', dueno.token, conComercio(comercioId));
    expect(resumen.status, JSON.stringify(resumen.body)).toBe(200);
    const panel = resumen.body.data;
    expect(panel.estado).toBe('TERMINADO');
    expect(panel.vendido).toBe(PRECIO * 2);

    const resultado = await correr(request, ahora);

    expect(resultado.cierresCreados).toBeGreaterThanOrEqual(1);
    const fila = await unico(request, comercioId);
    expect(fila.cantidadPedidos).toBe(panel.cantidadPedidos);
    expect(fila.vendido).toBeCloseTo(panel.vendido, 2);
    expect(fila.comision).toBeCloseTo(panel.comision, 2);
    expect(fila.neto).toBeCloseTo(panel.neto, 2);
    expect(fila.pendientesAlCierre).toBe(panel.cantidadPendientes);
    expect(fila.pendientesAlCierre).toBe(1);
    expect(fila.emailEstado).toBe('ENVIADO');
  });

  test('un turno sin pedidos también se cierra y se avisa con total cero', async ({ request }) => {
    await barrer(request, AHORA);
    const { comercioId } = await escena(request, dueno, 0, almuerzo());

    const resultado = await correr(request, AHORA);

    expect(resultado.cierresCreados).toBe(1);
    expect(resultado.mailsEnviados).toBe(1);
    const fila = await unico(request, comercioId);
    expect(fila.cantidadPedidos).toBe(0);
    expect(fila.vendido).toBe(0);
    expect(fila.neto).toBe(0);
    expect(fila.emailEstado).toBe('ENVIADO');
  });

  test('un Dueño con dos comercios que cierran juntos recibe un solo mail con los dos cierres', async ({ request }) => {
    await barrer(request, AHORA);
    const primero = await escena(request, dueno, 1, almuerzo());
    const segundo = await escena(request, dueno, 1, almuerzo());
    await pagar(request, primero.pedidos, hoyA('13:00'));
    await pagar(request, segundo.pedidos, hoyA('13:30'));

    const resultado = await correr(request, AHORA);

    expect(resultado.cierresCreados).toBe(2);
    expect(resultado.mailsEnviados).toBe(1);
    expect(resultado.cierresEnviados).toBe(2);
    const a = await unico(request, primero.comercioId);
    const b = await unico(request, segundo.comercioId);
    expect(a.emailEstado).toBe('ENVIADO');
    expect(b.emailEstado).toBe('ENVIADO');
    expect(a.emailFechaEnvio).toBe(b.emailFechaEnvio);
  });

  test('con la cuenta del Dueño bloqueada el cierre queda omitido y no se envía ni al reactivar la cuenta', async ({ request }) => {
    await barrer(request, AHORA);
    const otro = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    const { comercioId, pedidos } = await escena(request, otro, 1, almuerzo());
    await pagar(request, pedidos, hoyA('13:00'));
    sql(`UPDATE usuario SET estado = 'BLOQUEADO' WHERE id = ${otro.duenoId};`);

    const bloqueada = await correr(request, AHORA);
    sql(`UPDATE usuario SET estado = 'ACTIVO' WHERE id = ${otro.duenoId};`);
    const reactivada = await correr(request, minutosDespues(AHORA, 15));

    const fila = await unico(request, comercioId);
    expect(fila.emailEstado).toBe('OMITIDO');
    expect(fila.emailUltimoError).toBe('La cuenta del Dueño no está activa');
    expect(bloqueada.mailsEnviados).toBe(0);
    expect(reactivada.mailsEnviados).toBe(0);
  });

  test('una falla del envío reintenta a los 10 minutos y, al recuperarse el servicio, queda enviado', async ({ request }) => {
    await barrer(request, AHORA);
    const { comercioId } = await escena(request, dueno, 1, almuerzo());

    await conFallasDelEmailDeResumen(request, 1, async () => {
      const primera = await correr(request, AHORA);
      expect(primera.cierresCreados).toBe(1);
      expect(primera.cierresConFalla).toBe(1);
      const pendiente = await unico(request, comercioId);
      expect(pendiente.emailEstado).toBe('PENDIENTE');
      expect(pendiente.emailIntentos).toBe(1);
      expect(hastaElMinuto(pendiente.emailProximoIntento)).toBe(hastaElMinuto(minutosDespues(AHORA, 10)));
      expect(pendiente.emailUltimoError).toContain('Falla simulada');

      const temprano = await correr(request, minutosDespues(AHORA, 9));
      expect(temprano.mailsEnviados).toBe(0);
      expect((await unico(request, comercioId)).emailIntentos).toBe(1);

      const reintento = await correr(request, minutosDespues(AHORA, 10));
      expect(reintento.mailsEnviados).toBe(1);
    });

    const final = await unico(request, comercioId);
    expect(final.emailEstado).toBe('ENVIADO');
    expect(final.emailIntentos).toBe(1);
  });

  test('tras cinco intentos fallidos con el retroceso de 10, 30, 60 y 60 minutos el cierre queda fallido y no se reintenta más', async ({ request }) => {
    await barrer(request, AHORA);
    const { comercioId } = await escena(request, dueno, 1, almuerzo());
    const momentos = [AHORA, minutosDespues(AHORA, 10), minutosDespues(AHORA, 40), minutosDespues(AHORA, 100), minutosDespues(AHORA, 160)];
    const proximos = [10, 30, 60, 60].map((retroceso, i) => minutosDespues(momentos[i], retroceso));

    await conFallasDelEmailDeResumen(request, 1000, async () => {
      for (let i = 0; i < momentos.length; i += 1) {
        await correr(request, momentos[i]);
        const fila = await unico(request, comercioId);
        expect(fila.emailIntentos).toBe(i + 1);
        if (i < proximos.length) {
          expect(fila.emailEstado).toBe('PENDIENTE');
          expect(hastaElMinuto(fila.emailProximoIntento)).toBe(hastaElMinuto(proximos[i]));
        }
      }
      await correr(request, minutosDespues(AHORA, 600));
    });

    const fila = await unico(request, comercioId);
    expect(fila.emailEstado).toBe('FALLIDO');
    expect(fila.emailIntentos).toBe(5);
    expect(fila.emailProximoIntento).toBeNull();
  });

  test('un turno que cruza la medianoche se cierra con la fecha de su apertura al terminar el día siguiente más la gracia', async ({ request }) => {
    const ahora = hoyA('02:30');
    await barrer(request, ahora);
    const ayer = DIAS[diaDeLaSemanaEnZona(Date.now() - DIA)];
    const { comercioId, pedidos } = await escena(request, dueno, 1, [{ diaSemana: ayer, horaApertura: '20:00', horaCierre: '02:00' }]);
    await pagar(request, pedidos, hoyA('01:30'));

    const antes = await correr(request, hoyA('02:29:59'));
    expect(antes.cierresCreados).toBe(0);
    const despues = await correr(request, ahora);

    expect(despues.cierresCreados).toBe(1);
    const fila = await unico(request, comercioId);
    expect(fila.turnoFecha).toBe(hoyEnZona(Date.now() - DIA));
    expect(hastaElMinuto(fila.fin)).toBe(hastaElMinuto(hoyA('02:00')));
    expect(fila.cantidadPedidos).toBe(1);
  });

  test('un pedido sin pagar creado antes del fin demora el cierre hasta resolverse y, colgado, hasta el tope de espera', async ({ request }) => {
    await barrer(request, hoyA('17:00'));
    const demorado = await escena(request, dueno, 2, almuerzo());
    await pagar(request, [demorado.pedidos[0]], hoyA('13:00'));
    sql(`UPDATE pedido SET fecha_creacion = '${hoyEnZona()} 14:50:00' WHERE id = ${demorado.pedidos[1]};`);
    const colgado = await escena(request, dueno, 1, almuerzo());
    sql(`UPDATE pedido SET fecha_creacion = '${hoyEnZona()} 14:50:00' WHERE id = ${colgado.pedidos[0]};`);

    const primera = await correr(request, AHORA);
    expect(primera.cierresDiferidos).toBeGreaterThanOrEqual(2);
    expect(await cierresDeTurnoTest(request, demorado.comercioId)).toHaveLength(0);

    sql(`UPDATE pedido SET estado = 'EXPIRADO' WHERE id = ${demorado.pedidos[1]};`);
    const segunda = await correr(request, hoyA('15:31'));
    expect(segunda.cierresCreados).toBe(1);
    expect((await unico(request, demorado.comercioId)).cantidadPedidos).toBe(1);

    await correr(request, hoyA('16:59:59'));
    expect(await cierresDeTurnoTest(request, colgado.comercioId)).toHaveLength(0);
    await correr(request, hoyA('17:00'));
    expect(await cierresDeTurnoTest(request, colgado.comercioId)).toHaveLength(1);
  });

  test('un pago confirmado después del cierre no cambia la foto', async ({ request }) => {
    await barrer(request, AHORA);
    const { comercioId, pedidos } = await escena(request, dueno, 2, almuerzo());
    await pagar(request, [pedidos[0]], hoyA('13:00'));
    await correr(request, AHORA);
    const antes = await unico(request, comercioId);

    await pagar(request, [pedidos[1]], hoyA('15:40'));
    await correr(request, hoyA('15:50'));

    const despues = await unico(request, comercioId);
    expect(despues.cantidadPedidos).toBe(antes.cantidadPedidos);
    expect(despues.cantidadPedidos).toBe(1);
    expect(despues.pendientesAlCierre).toBe(antes.pendientesAlCierre);
    expect(despues.vendido).toBe(antes.vendido);
  });

  test('suspendido o cerrado temporalmente solo avisa si hubo pedidos; aprobado sin cuenta de cobro y sin franjas nunca cierra', async ({ request }) => {
    await barrer(request, AHORA);
    const suspendidoSinPedidos = await escena(request, dueno, 0, almuerzo());
    const suspendidoConPedidos = await escena(request, dueno, 1, almuerzo());
    const cerradoTemporalmente = await escena(request, dueno, 1, almuerzo());
    const aprobado = await escena(request, dueno, 0, almuerzo());
    const sinFranjas = await escena(request, dueno, 0, []);
    await pagar(request, suspendidoConPedidos.pedidos, hoyA('13:00'));
    await pagar(request, cerradoTemporalmente.pedidos, hoyA('13:00'));
    sql(`UPDATE comercio SET estado = 'SUSPENDIDO' WHERE id IN (${suspendidoSinPedidos.comercioId}, ${suspendidoConPedidos.comercioId});`);
    sql(`UPDATE comercio SET estado = 'CERRADO_TEMPORALMENTE' WHERE id = ${cerradoTemporalmente.comercioId};`);
    sql(`UPDATE comercio SET estado = 'APROBADO' WHERE id = ${aprobado.comercioId};`);

    await correr(request, AHORA);

    expect((await unico(request, suspendidoSinPedidos.comercioId)).emailEstado).toBe('OMITIDO');
    expect((await unico(request, suspendidoConPedidos.comercioId)).emailEstado).toBe('ENVIADO');
    expect((await unico(request, cerradoTemporalmente.comercioId)).emailEstado).toBe('ENVIADO');
    expect(await cierresDeTurnoTest(request, aprobado.comercioId)).toHaveLength(0);
    expect(await cierresDeTurnoTest(request, sinFranjas.comercioId)).toHaveLength(0);
  });

  test('un comercio que nunca cerró un turno cierra solo el último aunque tenga franjas todos los días', async ({ request }) => {
    await barrer(request, AHORA);
    const todos = DIAS.map((diaSemana) => ({ diaSemana, horaApertura: '12:00', horaCierre: '15:00' }));
    const { comercioId } = await escena(request, dueno, 0, todos);

    await correr(request, AHORA);
    await correr(request, minutosDespues(AHORA, 1));

    expect(await cierresDeTurnoTest(request, comercioId)).toHaveLength(1);
  });

  test('el atajo de los cierres exige el comercio', async ({ request }) => {
    const sinComercio = await apiGet(request, '/test/cierres-turno');
    expect(sinComercio.status).toBe(400);
  });
});
