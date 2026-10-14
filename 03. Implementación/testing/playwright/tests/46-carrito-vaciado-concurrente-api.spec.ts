import { test, expect } from './helpers/prueba';
import type { APIRequestContext } from '@playwright/test';
import {
  agregarItemCarrito,
  apiConHeaders,
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  crearCategoria,
  crearPedido,
  crearProducto,
  fijarPasswordAdminYLoguear,
  login,
  marcarAptoVenta,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { agregarComercioApto, prepararAprobado } from './helpers/multicomercio';

interface Comprador {
  token: string;
  id: number;
}

const items = (clienteId: number): number =>
  Number(sql(`SELECT COUNT(*) FROM item_carrito ic JOIN carrito c ON c.id = ic.carrito_id WHERE c.cliente_id = ${clienteId};`));
const comercioDelCarrito = (clienteId: number): string => sql(`SELECT IFNULL(comercio_id, 'NULL') FROM carrito WHERE cliente_id = ${clienteId};`);
const estadoDelPedido = (pedidoId: number): string => sql(`SELECT estado FROM pedido WHERE id = ${pedidoId};`);
const carritosDelCliente = (clienteId: number): number => Number(sql(`SELECT COUNT(*) FROM carrito WHERE cliente_id = ${clienteId};`));

function carritoConsistente(clienteId: number): void {
  const cantidad = items(clienteId);
  const comercio = comercioDelCarrito(clienteId);
  if (comercio === '') {
    expect(cantidad).toBe(0);
    return;
  }
  if (cantidad === 0) {
    expect(comercio).toBe('NULL');
  } else {
    expect(comercio).not.toBe('NULL');
  }
}

test.describe('Carrito: pagos, bajas y cambios simultáneos (API), mini-tramo del carrito de E3', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;
  let dueno: Dueno;

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat Carrito ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminToken, localidadId, false);
    await marcarAptoVenta(request, dueno.comercioId);
  });

  const nuevoProducto = (request: APIRequestContext) =>
    crearProducto(request, dueno.token, { nombre: `Producto carrito ${sufijoUnico()}`, precio: 1500, categoriaId });

  async function nuevoComprador(request: APIRequestContext): Promise<Comprador> {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, cliente.nombreUsuario, cliente.password);
    return { token: sesion.token, id: sesion.usuario.id };
  }

  async function compradorConPedidos(request: APIRequestContext, productos: number[], pedidos: number) {
    const comprador = await nuevoComprador(request);
    for (const productoId of productos) {
      await agregarItemCarrito(request, comprador.token, productoId, 1);
    }
    const ids: number[] = [];
    for (let i = 0; i < pedidos; i++) {
      ids.push(await crearPedido(request, comprador.token, 'RETIRO'));
    }
    return { comprador, pedidos: ids };
  }

  const pagar = (request: APIRequestContext, pedidoId: number) => apiPut(request, `/test/pedidos/${pedidoId}/pago-aprobado?registrarPago=true`, {});

  test('varios pagos aprobados del mismo Cliente a la vez confirman todos los pedidos y dejan el carrito vacío y sin comercio', async ({ request }) => {
    for (let ronda = 0; ronda < 4; ronda++) {
      const productos = [await nuevoProducto(request), await nuevoProducto(request), await nuevoProducto(request)];
      const { comprador, pedidos } = await compradorConPedidos(request, productos, 3);
      expect(items(comprador.id), 'el carrito no se vacía al confirmar el pedido').toBe(3);

      const respuestas = await Promise.all(pedidos.map((id) => pagar(request, id)));

      expect(respuestas.map((r) => r.status), `ronda ${ronda}`).toEqual([200, 200, 200]);
      for (const id of pedidos) {
        expect(estadoDelPedido(id)).toBe('PENDIENTE_CONFIRMACION_COMERCIO');
      }
      expect(items(comprador.id)).toBe(0);
      expect(comercioDelCarrito(comprador.id)).toBe('NULL');
    }
  });

  test('un pago contra vaciar, quitar un ítem, cambiar una cantidad y agregar otro producto no falla y deja el carrito consistente', async ({ request }) => {
    for (let ronda = 0; ronda < 4; ronda++) {
      const productos = [await nuevoProducto(request), await nuevoProducto(request), await nuevoProducto(request)];
      const extra = await nuevoProducto(request);
      const { comprador, pedidos } = await compradorConPedidos(request, productos, 2);
      const carrito = await apiGet(request, '/carrito', comprador.token);
      const itemId = carrito.body.data.items[0].id as number;

      const respuestas = await Promise.all([
        pagar(request, pedidos[0]),
        pagar(request, pedidos[1]),
        apiDelete(request, '/carrito', comprador.token),
        apiDelete(request, `/carrito/items/${itemId}`, comprador.token),
        apiPut(request, `/carrito/items/${itemId}`, { cantidad: 4 }, comprador.token),
        apiPost(request, '/carrito/items', { productoId: extra, cantidad: 1 }, comprador.token),
      ]);

      const [pago1, pago2, vaciar, quitar, cantidad, agregar] = respuestas.map((r) => r.status);
      expect([pago1, pago2, vaciar], `ronda ${ronda}`).toEqual([200, 200, 200]);
      expect([200, 404]).toContain(quitar);
      expect([200, 404]).toContain(cantidad);
      expect(agregar).toBe(201);
      for (const id of pedidos) {
        expect(estadoDelPedido(id)).toBe('PENDIENTE_CONFIRMACION_COMERCIO');
      }
      carritoConsistente(comprador.id);
    }
  });

  test('el Dueño marca un producto agotado mientras llegan pagos y otros Clientes lo agregan: el producto no queda en ningún carrito', async ({ request }) => {
    for (let ronda = 0; ronda < 3; ronda++) {
      const agotable = await nuevoProducto(request);
      const otro = await nuevoProducto(request);
      const { comprador, pedidos } = await compradorConPedidos(request, [agotable, otro], 2);
      const curiosos = [await nuevoComprador(request), await nuevoComprador(request), await nuevoComprador(request)];

      const respuestas = await Promise.all([
        pagar(request, pedidos[0]),
        pagar(request, pedidos[1]),
        apiConHeaders(request, 'PATCH', `/productos/${agotable}/estado`, dueno.token, { 'X-Comercio-Id': String(dueno.comercioId) }, { estado: 'AGOTADO' }),
        ...curiosos.map((c) => apiPost(request, '/carrito/items', { productoId: agotable, cantidad: 1 }, c.token)),
      ]);

      expect(respuestas[0].status, `ronda ${ronda}`).toBe(200);
      expect(respuestas[1].status).toBe(200);
      expect(respuestas[2].status).toBe(200);
      for (const r of respuestas.slice(3)) {
        expect([201, 409]).toContain(r.status);
      }
      expect(Number(sql(`SELECT COUNT(*) FROM item_carrito WHERE producto_id = ${agotable};`))).toBe(0);
      for (const id of pedidos) {
        expect(estadoDelPedido(id)).toBe('PENDIENTE_CONFIRMACION_COMERCIO');
      }
      for (const c of [comprador, ...curiosos]) {
        carritoConsistente(c.id);
      }
    }
  });

  test('tres bajas simultáneas del mismo ítem dan un 200 y dos 404 con su texto', async ({ request }) => {
    const producto = await nuevoProducto(request);
    const comprador = await nuevoComprador(request);
    await agregarItemCarrito(request, comprador.token, producto, 1);
    const itemId = (await apiGet(request, '/carrito', comprador.token)).body.data.items[0].id as number;

    const respuestas = await Promise.all([1, 2, 3].map(() => apiDelete(request, `/carrito/items/${itemId}`, comprador.token)));

    expect(respuestas.filter((r) => r.status === 200)).toHaveLength(1);
    const noEncontradas = respuestas.filter((r) => r.status === 404);
    expect(noEncontradas).toHaveLength(2);
    for (const r of noEncontradas) {
      expect(r.body.mensaje).toBe('Ítem no encontrado');
    }
    expect(items(comprador.id)).toBe(0);
    expect(comercioDelCarrito(comprador.id)).toBe('NULL');
  });

  test('vaciar el carrito varias veces a la vez responde 200 siempre', async ({ request }) => {
    const comprador = await nuevoComprador(request);
    await agregarItemCarrito(request, comprador.token, await nuevoProducto(request), 1);
    await agregarItemCarrito(request, comprador.token, await nuevoProducto(request), 1);

    const respuestas = await Promise.all([1, 2, 3, 4].map(() => apiDelete(request, '/carrito', comprador.token)));

    expect(respuestas.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(items(comprador.id)).toBe(0);
    expect(comercioDelCarrito(comprador.id)).toBe('NULL');
  });

  test('el primer acceso simultáneo de un Cliente al carrito crea un solo carrito sin fallar', async ({ request }) => {
    const producto = await nuevoProducto(request);
    const comprador = await nuevoComprador(request);
    expect(carritosDelCliente(comprador.id)).toBe(0);

    const respuestas = await Promise.all([
      apiGet(request, '/carrito', comprador.token),
      apiGet(request, '/carrito', comprador.token),
      apiPost(request, '/carrito/items', { productoId: producto, cantidad: 1 }, comprador.token),
      apiPost(request, '/carrito/items', { productoId: producto, cantidad: 1 }, comprador.token),
      apiDelete(request, '/carrito', comprador.token),
    ]);

    for (const r of respuestas) {
      expect(r.status).toBeLessThan(500);
      expect([200, 201]).toContain(r.status);
    }
    expect(carritosDelCliente(comprador.id)).toBe(1);
    carritoConsistente(comprador.id);
  });

  test('un pago no vacía el carrito si el Cliente lo cambió a otro comercio, y quitar ítems de a uno deja el carrito sin comercio al quedar vacío', async ({ request }) => {
    const comercioB = await agregarComercioApto(request, dueno, `Comercio B carrito ${sufijoUnico()}`);
    const productoDeB = (
      await apiConHeaders(request, 'POST', '/productos', dueno.token, { 'X-Comercio-Id': String(comercioB) }, {
        nombre: `Producto B ${sufijoUnico()}`,
        precio: 1500,
        categoriaId,
      })
    ).body.data.id as number;
    const productoDeA = await nuevoProducto(request);
    const { comprador, pedidos } = await compradorConPedidos(request, [productoDeA], 1);

    expect((await apiDelete(request, '/carrito', comprador.token)).status).toBe(200);
    expect(comercioDelCarrito(comprador.id)).toBe('NULL');
    await agregarItemCarrito(request, comprador.token, productoDeB, 1);
    expect(comercioDelCarrito(comprador.id)).toBe(String(comercioB));

    expect((await pagar(request, pedidos[0])).status).toBe(200);

    expect(estadoDelPedido(pedidos[0])).toBe('PENDIENTE_CONFIRMACION_COMERCIO');
    expect(items(comprador.id), 'el carrito del otro comercio sigue intacto').toBe(1);
    expect(comercioDelCarrito(comprador.id)).toBe(String(comercioB));

    const itemId = (await apiGet(request, '/carrito', comprador.token)).body.data.items[0].id as number;
    expect((await apiDelete(request, `/carrito/items/${itemId}`, comprador.token)).status).toBe(200);
    expect(comercioDelCarrito(comprador.id)).toBe('NULL');
  });
});
