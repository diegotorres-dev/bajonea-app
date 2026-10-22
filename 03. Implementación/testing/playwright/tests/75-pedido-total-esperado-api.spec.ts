import { test, expect } from './helpers/prueba';
import type { APIRequestContext } from '@playwright/test';
import {
  agregarItemCarrito,
  apiConHeaders,
  crearCategoria,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { agregarComercioApto, prepararAprobado } from './helpers/multicomercio';

const PRECIO = 10000;
const CODIGO = 'PRECIO_CAMBIO';
const MENSAJE = 'Los montos de tu pedido cambiaron. Revisá el nuevo total antes de pagar.';
const conComercio = (comercioId: number): Record<string, string> => ({ 'X-Comercio-Id': String(comercioId) });
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];

interface Escena {
  comercioId: number;
  productoId: number;
}

test.describe('Fase 2, T3 (API): el aviso de precio cambiado en el carrito y el total esperado del pedido', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let dueno: Dueno;
  let categoriaId: number;
  let clienteId: number;
  let clienteToken: string;

  const pedidosDelCliente = (): number => Number(sql(`SELECT COUNT(*) FROM pedido WHERE cliente_id = ${clienteId};`));
  const detallesDelCliente = (): number =>
    Number(sql(`SELECT COUNT(*) FROM detalle_pedido d JOIN pedido p ON p.id = d.pedido_id WHERE p.cliente_id = ${clienteId};`));
  const cambiarPrecio = (productoId: number, precio: number): void => {
    sql(`UPDATE producto SET precio = ${precio} WHERE id = ${productoId};`);
  };
  const verCarrito = async (request: APIRequestContext) => {
    const respuesta = await apiConHeaders(request, 'GET', '/carrito', clienteToken);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    return respuesta.body.data;
  };
  const pedir = (request: APIRequestContext, totalEsperado?: unknown) =>
    apiConHeaders(request, 'POST', '/pedidos/cliente', clienteToken, {}, { tipoEntrega: 'RETIRO', direccionId: null, ...(totalEsperado === undefined ? {} : { totalEsperado }) });

  async function escena(request: APIRequestContext): Promise<Escena> {
    const comercioId = await agregarComercioApto(request, dueno, `Total T3 ${sufijoUnico()}`);
    const producto = await apiConHeaders(request, 'POST', '/productos', dueno.token, conComercio(comercioId), {
      nombre: `Producto Total T3 ${sufijoUnico()}`,
      precio: PRECIO,
      categoriaId,
    });
    expect(producto.status, JSON.stringify(producto.body)).toBe(201);
    const productoId = producto.body.data.id as number;
    await apiConHeaders(request, 'DELETE', '/carrito', clienteToken);
    await agregarItemCarrito(request, clienteToken, productoId, 1);
    return { comercioId, productoId };
  }

  test.beforeAll(async ({ request }) => {
    const admin = await fijarPasswordAdminYLoguear(request);
    const localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, admin.token, `Cat Total T3 ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, admin.token, localidadId, true, todoElDia());
    const registro = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, registro.nombreUsuario, registro.password);
    clienteId = sesion.usuario.id;
    clienteToken = sesion.token;
  });

  test('sin total esperado el pedido se crea como siempre y el carrito informa el total y que no hay cambios', async ({ request }) => {
    await escena(request);
    const carrito = await verCarrito(request);
    expect(carrito.hayCambioDePrecio).toBe(false);
    expect(Number(carrito.total)).toBe(Number(carrito.subtotal) + Number(carrito.cargoServicioCliente));
    expect(carrito.items[0].precioCambio).toBe(false);
    expect(Number(carrito.items[0].precioVisto)).toBe(PRECIO);

    const antes = pedidosDelCliente();
    const creado = await pedir(request);

    expect(creado.status, JSON.stringify(creado.body)).toBe(201);
    expect(pedidosDelCliente()).toBe(antes + 1);
  });

  test('con el total exacto el pedido se crea y su total coincide con el esperado', async ({ request }) => {
    await escena(request);
    const total = Number((await verCarrito(request)).total);

    const creado = await pedir(request, total);

    expect(creado.status, JSON.stringify(creado.body)).toBe(201);
    expect(Number(creado.body.data.total)).toBe(total);
  });

  test('tras una edición de precio el carrito marca el cambio y el pedido con el total viejo es 409 PRECIO_CAMBIO con los montos nuevos y sin crear nada', async ({ request }) => {
    const { productoId } = await escena(request);
    const totalViejo = Number((await verCarrito(request)).total);
    cambiarPrecio(productoId, 12000);

    const carrito = await verCarrito(request);
    expect(carrito.hayCambioDePrecio).toBe(true);
    expect(carrito.items[0].precioCambio).toBe(true);
    expect(Number(carrito.items[0].precioVisto)).toBe(PRECIO);
    expect(Number(carrito.items[0].precioUnitario)).toBe(12000);
    expect(Number(carrito.subtotal)).toBe(12000);

    const pedidosAntes = pedidosDelCliente();
    const detallesAntes = detallesDelCliente();
    const rechazado = await pedir(request, totalViejo);

    expect(rechazado.status, JSON.stringify(rechazado.body)).toBe(409);
    expect(rechazado.body.mensaje).toBe(MENSAJE);
    const data = rechazado.body.data;
    expect(data.codigo).toBe(CODIGO);
    expect(Number(data.subtotal)).toBe(12000);
    expect(Number(data.cargoServicioCliente)).toBe(Number(carrito.cargoServicioCliente));
    expect(Number(data.total)).toBe(Number(carrito.total));
    expect(data.items).toHaveLength(1);
    expect(data.items[0].precioCambio).toBe(true);
    expect(Number(data.items[0].precioVisto)).toBe(PRECIO);
    expect(Number(data.items[0].precioUnitario)).toBe(12000);
    expect(data.items[0].cantidad).toBe(1);
    expect(pedidosDelCliente()).toBe(pedidosAntes);
    expect(detallesDelCliente()).toBe(detallesAntes);
    expect((await verCarrito(request)).items).toHaveLength(1);

    const reintento = await pedir(request, Number(carrito.total));
    expect(reintento.status, JSON.stringify(reintento.body)).toBe(201);
    expect(Number(reintento.body.data.total)).toBe(Number(carrito.total));
    expect(pedidosDelCliente()).toBe(pedidosAntes + 1);
  });

  test('un ítem agregado después de la edición no avisa, y sumar o cambiar la cantidad no apaga el aviso del ítem que sí cambió', async ({ request }) => {
    const primera = await escena(request);
    const otroProducto = await apiConHeaders(request, 'POST', '/productos', dueno.token, conComercio(primera.comercioId), {
      nombre: `Otro Producto T3 ${sufijoUnico()}`,
      precio: 5000,
      categoriaId,
    });
    expect(otroProducto.status, JSON.stringify(otroProducto.body)).toBe(201);
    const otroId = otroProducto.body.data.id as number;
    cambiarPrecio(primera.productoId, 11000);
    cambiarPrecio(otroId, 6000);

    await agregarItemCarrito(request, clienteToken, otroId, 1);
    await agregarItemCarrito(request, clienteToken, primera.productoId, 1);
    let carrito = await verCarrito(request);
    const delPrimero = carrito.items.find((i: { productoId: number }) => i.productoId === primera.productoId);
    const delOtro = carrito.items.find((i: { productoId: number }) => i.productoId === otroId);
    expect(delPrimero.precioCambio).toBe(true);
    expect(delPrimero.cantidad).toBe(2);
    expect(Number(delPrimero.precioVisto)).toBe(PRECIO);
    expect(delOtro.precioCambio).toBe(false);
    expect(Number(delOtro.precioVisto)).toBe(6000);

    const cambio = await apiConHeaders(request, 'PUT', `/carrito/items/${delPrimero.id}`, clienteToken, {}, { cantidad: 4 });
    expect(cambio.status, JSON.stringify(cambio.body)).toBe(200);
    carrito = await verCarrito(request);
    expect(carrito.items.find((i: { productoId: number }) => i.productoId === primera.productoId).precioCambio).toBe(true);
    expect(carrito.hayCambioDePrecio).toBe(true);
  });

  test('un cambio de la tarifa de servicio también da 409 PRECIO_CAMBIO aunque ningún ítem haya cambiado de precio', async ({ request }) => {
    await escena(request);
    const totalViejo = Number((await verCarrito(request)).total);
    sql(
      `INSERT INTO configuracion_tarifa (administrador_id, cargo_cliente, tipo_cargo_cliente, cargo_comercio, tipo_cargo_comercio, fecha_vigencia) ` +
        `SELECT administrador_id, 350, 'FIJO', cargo_comercio, tipo_cargo_comercio, NOW() + INTERVAL 2 DAY FROM configuracion_tarifa ORDER BY fecha_vigencia DESC LIMIT 1;`,
    );
    try {
      const rechazado = await pedir(request, totalViejo);

      expect(rechazado.status, JSON.stringify(rechazado.body)).toBe(409);
      expect(rechazado.body.data.codigo).toBe(CODIGO);
      expect(Number(rechazado.body.data.cargoServicioCliente)).toBe(350);
      expect(Number(rechazado.body.data.total)).toBe(PRECIO + 350);
      expect(rechazado.body.data.items[0].precioCambio).toBe(false);
    } finally {
      sql(`DELETE FROM configuracion_tarifa WHERE fecha_vigencia > NOW() + INTERVAL 1 DAY;`);
    }
  });

  test('un total esperado negativo o que no es un número es 400 y no crea nada', async ({ request }) => {
    await escena(request);
    const antes = pedidosDelCliente();

    const negativo = await pedir(request, -5);
    const texto = await pedir(request, 'mucho');

    expect(negativo.status, JSON.stringify(negativo.body)).toBe(400);
    expect(texto.status, JSON.stringify(texto.body)).toBe(400);
    expect(pedidosDelCliente()).toBe(antes);
  });

  test('los topes de monto máximo van antes que el aviso de cambio', async ({ request }) => {
    const { productoId } = await escena(request);
    cambiarPrecio(productoId, 99999999);

    const rechazado = await pedir(request, 1700);

    expect(rechazado.status, JSON.stringify(rechazado.body)).toBe(400);
    expect(rechazado.body.data?.codigo).toBeUndefined();
  });
});
