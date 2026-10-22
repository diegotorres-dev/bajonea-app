import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  agregarItemCarrito,
  apiConHeaders,
  bloqueoDePrecioTest,
  conBloqueoDePrecio,
  crearCategoria,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { ClienteRegistrado, SesionApi } from './helpers/backend';
import { abrirComoUsuarioConContexto, sumarAlEquipo } from './helpers/empleado';
import { sinScrollHorizontal } from './helpers/layout';
import type { Dueno } from './helpers/multicomercio';
import { agregarComercioApto, prepararAprobado } from './helpers/multicomercio';
import { abrirComoUsuarioConComercio } from './helpers/selector';
import { diaDeLaSemanaEnZona, fechaHoraSqlEnZona } from './helpers/zona';

const MINUTO = 60_000;
const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const PRECIO = 10000;
const MENSAJE_BLOQUEADO = 'No podés cambiar precios mientras tu comercio está en horario de atención. Hacelo fuera de ese horario.';
const LEYENDA = 'Se puede cambiar fuera de tu horario de atención';
const MENSAJE_CAMBIO = 'Los montos de tu pedido cambiaron. Revisá el nuevo total antes de pagar.';
const MENSAJE_TARIFA = 'El cargo por servicio cambió. Revisá el nuevo total antes de pagar.';
const horaEn = (desplazamientoMin: number): string => fechaHoraSqlEnZona(Date.now() + desplazamientoMin * MINUTO).slice(11, 16);
const diaEn = (desplazamientoMin: number): string => DIAS[diaDeLaSemanaEnZona(Date.now() + desplazamientoMin * MINUTO)];
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
const franjaQueContieneAhora = () => [{ diaSemana: diaEn(-30), horaApertura: horaEn(-30), horaCierre: horaEn(30) }];
const franjaQueNoContieneAhora = () => [{ diaSemana: diaEn(120), horaApertura: horaEn(120), horaCierre: horaEn(180) }];
const pesos = (valor: number): string => `$${Math.round(valor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

interface Escena {
  comercioId: number;
  productoId: number;
}

test.use({ viewport: { width: 375, height: 812 } });

test.describe('Fase 2, T3 (UI): precio bloqueado en el formulario, aviso en el carrito y reconfirmación en el checkout', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;
  let dueno: Dueno;
  let registroEmpleado: ClienteRegistrado;
  let empleado: SesionApi;
  let cliente: SesionApi;

  const precioEnLaBase = (productoId: number): number => Number(sql(`SELECT precio FROM producto WHERE id = ${productoId};`));
  const pedidosDelCliente = (): number => Number(sql(`SELECT COUNT(*) FROM pedido WHERE cliente_id = ${cliente.usuario.id};`));
  const totalDelUltimoPedido = (): number => Number(sql(`SELECT total FROM pedido WHERE cliente_id = ${cliente.usuario.id} ORDER BY id DESC LIMIT 1;`));
  const cambiarPrecio = (productoId: number, precio: number): void => {
    sql(`UPDATE producto SET precio = ${precio} WHERE id = ${productoId};`);
  };

  function erroresDeConsola(page: Page): string[] {
    const errores: string[] = [];
    page.on('pageerror', (error) => errores.push(error.message));
    page.on('console', (mensaje) => {
      if (mensaje.type() === 'error' && !/Failed to load resource/.test(mensaje.text())) {
        errores.push(mensaje.text());
      }
    });
    return errores;
  }

  async function crearEscena(
    request: APIRequestContext,
    horarios?: Array<{ diaSemana: string; horaApertura: string; horaCierre: string }>,
    conImagen = true,
  ): Promise<Escena> {
    const comercioId = await agregarComercioApto(request, dueno, `Precio UI T3 ${sufijoUnico()}`, horarios);
    const producto = await apiConHeaders(request, 'POST', '/productos', dueno.token, { 'X-Comercio-Id': String(comercioId) }, {
      nombre: `Producto UI T3 ${sufijoUnico()}`,
      precio: PRECIO,
      categoriaId,
    });
    expect(producto.status, JSON.stringify(producto.body)).toBe(201);
    const productoId = producto.body.data.id as number;
    if (conImagen) {
      sql(
        `INSERT INTO imagen_producto (producto_id, url, orden, es_principal) VALUES ` +
          `(${productoId}, 'https://res.cloudinary.com/demo/image/upload/productos/${comercioId}/${productoId}/foto.png', 0, 1);`,
      );
    }
    return { comercioId, productoId };
  }

  async function escenaConCarrito(request: APIRequestContext): Promise<Escena> {
    const escena = await crearEscena(request, undefined, false);
    await apiConHeaders(request, 'DELETE', '/carrito', cliente.token);
    await agregarItemCarrito(request, cliente.token, escena.productoId, 1);
    return escena;
  }

  const carritoActual = async (request: APIRequestContext) =>
    (await apiConHeaders(request, 'GET', '/carrito', cliente.token)).body.data;

  async function abrirComoDueno(page: Page, comercioId: number) {
    await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: comercioId, ultimoComercioId: comercioId });
  }

  async function abrirComoEmpleado(page: Page, comercioId: number) {
    await abrirComoUsuarioConContexto(page, empleado, {
      contexto: { tipo: 'EMPLEADO', comercioId },
      ultimoContexto: `EMPLEADO:${comercioId}`,
    });
  }

  async function abrirComoCliente(page: Page) {
    await abrirComoUsuarioConContexto(page, cliente, { contexto: { tipo: 'CLIENTE' } });
  }

  async function abrirFormulario(page: Page, productoId: number) {
    await page.goto(`/comercio-producto-form.html?id=${productoId}`);
    await expect(page.getByTestId('input-nombre-producto')).not.toHaveValue('');
    await expect(page.getByTestId('btn-guardar-producto')).toBeEnabled();
  }

  function capturarPuts(page: Page): Array<Record<string, unknown>> {
    const puts: Array<Record<string, unknown>> = [];
    page.on('request', (peticion) => {
      if (peticion.method() === 'PUT' && /\/productos\/\d+$/.test(peticion.url())) {
        puts.push(peticion.postDataJSON());
      }
    });
    return puts;
  }

  async function simularListaDeProductos(page: Page, modificar: (producto: Record<string, unknown>) => void) {
    await page.route(/\/api\/v1\/productos$/, async (ruta) => {
      if (ruta.request().method() !== 'GET') {
        await ruta.continue();
        return;
      }
      const respuesta = await ruta.fetch();
      const json = await respuesta.json();
      json.data.forEach(modificar);
      await ruta.fulfill({ response: respuesta, json });
    });
  }

  async function llegarAlPaso3(page: Page) {
    await page.goto('/carrito.html');
    await page.getByTestId('btn-confirmar-pedido').click();
    await page.waitForURL('**/checkout.html');
    await page.getByTestId('btn-modalidad-retiro').click();
    await page.getByTestId('btn-continuar-modalidad').click();
    await page.getByTestId('btn-confirmar-retiro').click();
    await expect(page.getByTestId('btn-confirmar-pedido')).toBeVisible();
  }

  function capturarPedidos(page: Page): Array<Record<string, unknown>> {
    const cuerpos: Array<Record<string, unknown>> = [];
    page.on('request', (peticion) => {
      if (peticion.method() === 'POST' && /\/pedidos\/cliente$/.test(peticion.url())) {
        cuerpos.push(peticion.postDataJSON());
      }
    });
    return cuerpos;
  }

  test.beforeAll(async ({ request }) => {
    await bloqueoDePrecioTest(request, false);
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat Precio UI T3 ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    registroEmpleado = await registrarYVerificarCliente(request, localidadId);
    empleado = await login(request, registroEmpleado.nombreUsuario, registroEmpleado.password);
    const registroCliente = await registrarYVerificarCliente(request, localidadId);
    cliente = await login(request, registroCliente.nombreUsuario, registroCliente.password);
  });

  test.afterEach(async ({ request }) => {
    await bloqueoDePrecioTest(request, false);
    sql(`DELETE FROM configuracion_tarifa WHERE fecha_vigencia > NOW() + INTERVAL 1 DAY;`);
  });

  test.describe('Formulario de producto', () => {
    test('el Dueño dentro de la franja ve el precio deshabilitado con candado y leyenda, y guarda nombre y descripción sin cambiar el precio', async ({ page, request }) => {
      const escena = await crearEscena(request, franjaQueContieneAhora());
      const errores = erroresDeConsola(page);
      const puts = capturarPuts(page);
      await conBloqueoDePrecio(request, async () => {
        await abrirComoDueno(page, escena.comercioId);
        await abrirFormulario(page, escena.productoId);

        await expect(page.getByTestId('input-precio-producto')).toBeDisabled();
        await expect(page.getByTestId('input-precio-producto')).toHaveValue('10.000');
        await expect(page.getByTestId('icono-precio-bloqueado')).toBeVisible();
        await expect(page.getByTestId('leyenda-precio-bloqueado')).toHaveText(LEYENDA);
        await sinScrollHorizontal(page);

        const nombre = `Producto UI T3 Editado ${sufijoUnico()}`;
        await page.getByTestId('input-nombre-producto').fill(nombre);
        await page.getByTestId('input-descripcion-producto').fill('Descripción nueva del producto');
        await page.getByTestId('btn-guardar-producto').click();
        await page.waitForURL('**/comercio-productos.html**');

        expect(puts).toHaveLength(1);
        expect(Number(puts[0].precio)).toBe(PRECIO);
        expect(sql(`SELECT descripcion FROM producto WHERE id = ${escena.productoId};`)).toBe('Descripción nueva del producto');
      });
      expect(precioEnLaBase(escena.productoId)).toBe(PRECIO);
      expect(errores).toEqual([]);
    });

    test('el Empleado dentro de la franja ve el mismo candado y la misma leyenda', async ({ page, request }) => {
      const escena = await crearEscena(request, franjaQueContieneAhora());
      await sumarAlEquipo(request, escena.comercioId, registroEmpleado, dueno.token);
      await conBloqueoDePrecio(request, async () => {
        await abrirComoEmpleado(page, escena.comercioId);
        await abrirFormulario(page, escena.productoId);

        await expect(page.getByTestId('input-precio-producto')).toBeDisabled();
        await expect(page.getByTestId('icono-precio-bloqueado')).toBeVisible();
        await expect(page.getByTestId('leyenda-precio-bloqueado')).toHaveText(LEYENDA);
        await sinScrollHorizontal(page);
      });
    });

    test('fuera de la franja el campo está habilitado, sin candado ni leyenda, y el precio nuevo se guarda', async ({ page, request }) => {
      const escena = await crearEscena(request, franjaQueNoContieneAhora());
      const puts = capturarPuts(page);
      await conBloqueoDePrecio(request, async () => {
        await abrirComoDueno(page, escena.comercioId);
        await abrirFormulario(page, escena.productoId);

        await expect(page.getByTestId('input-precio-producto')).toBeEnabled();
        await expect(page.getByTestId('icono-precio-bloqueado')).toBeHidden();
        await expect(page.getByTestId('leyenda-precio-bloqueado')).toBeHidden();

        await page.getByTestId('input-precio-producto').fill('12500');
        await page.getByTestId('btn-guardar-producto').click();
        await page.waitForURL('**/comercio-productos.html**');
        expect(Number(puts[0].precio)).toBe(12500);
      });
      expect(precioEnLaBase(escena.productoId)).toBe(12500);
    });

    test('si el servidor responde 409 PRECIO_BLOQUEADO_EN_FRANJA se muestra el aviso fijo, el campo vuelve a su valor y queda con candado y leyenda', async ({ page, request }) => {
      const escena = await crearEscena(request, franjaQueContieneAhora());
      await conBloqueoDePrecio(request, async () => {
        await simularListaDeProductos(page, (producto) => {
          producto.precioBloqueado = false;
          producto.precioBloqueadoHasta = null;
        });
        await abrirComoDueno(page, escena.comercioId);
        await abrirFormulario(page, escena.productoId);
        await expect(page.getByTestId('input-precio-producto')).toBeEnabled();

        await page.getByTestId('input-precio-producto').fill('12000');
        await page.getByTestId('btn-guardar-producto').click();

        await expect(page.getByTestId('aviso-fijo-texto')).toHaveText(MENSAJE_BLOQUEADO);
        await expect(page.getByTestId('input-precio-producto')).toBeDisabled();
        await expect(page.getByTestId('input-precio-producto')).toHaveValue('10.000');
        await expect(page.getByTestId('icono-precio-bloqueado')).toBeVisible();
        await expect(page.getByTestId('leyenda-precio-bloqueado')).toHaveText(LEYENDA);
        await sinScrollHorizontal(page);
      });
      expect(precioEnLaBase(escena.productoId)).toBe(PRECIO);
      expect(sql(`SELECT COUNT(*) FROM historial_edicion_comercio WHERE entidad_tipo = 'PRODUCTO' AND accion = 'EDITAR' AND entidad_id = ${escena.productoId};`)).toBe('0');
    });

    test('cuando llega la hora de liberación el campo se habilita solo, sin recargar', async ({ page, request }) => {
      const escena = await crearEscena(request, franjaQueContieneAhora());
      const liberacion = fechaHoraSqlEnZona(Date.now() + 4000).replace(' ', 'T');
      await simularListaDeProductos(page, (producto) => {
        producto.precioBloqueado = true;
        producto.precioBloqueadoHasta = liberacion;
      });
      await abrirComoDueno(page, escena.comercioId);
      await abrirFormulario(page, escena.productoId);
      await expect(page.getByTestId('input-precio-producto')).toBeDisabled();

      await expect(page.getByTestId('input-precio-producto')).toBeEnabled({ timeout: 15_000 });
      await expect(page.getByTestId('icono-precio-bloqueado')).toBeHidden();
      await expect(page.getByTestId('leyenda-precio-bloqueado')).toBeHidden();
    });
  });

  test.describe('Carrito', () => {
    test('una línea con el precio cambiado muestra el precio viejo tachado, el nuevo, el aviso y los totales nuevos', async ({ page, request }) => {
      const escena = await escenaConCarrito(request);
      cambiarPrecio(escena.productoId, 12000);
      const carrito = await carritoActual(request);
      const itemId = carrito.items[0].id as number;
      const errores = erroresDeConsola(page);

      await abrirComoCliente(page);
      await page.goto('/carrito.html');

      await expect(page.getByTestId(`item-precio-anterior-${itemId}`)).toHaveText(pesos(PRECIO));
      await expect(page.getByTestId(`item-precio-anterior-${itemId}`)).toHaveCSS('text-decoration-line', 'line-through');
      await expect(page.getByTestId(`item-precio-unitario-${itemId}`)).toContainText(`${pesos(12000)} c/u`);
      await expect(page.getByTestId(`item-precio-cambio-${itemId}`)).toHaveText('Cambió el precio');
      await expect(page.getByTestId('subtotal-carrito')).toHaveText(pesos(12000));
      await expect(page.getByTestId('total-carrito')).toHaveText(pesos(Number(carrito.total)));
      await expect(page.getByTestId('btn-confirmar-pedido')).toContainText(pesos(Number(carrito.total)));
      await expect(page.locator('[data-testid^="aviso-precios"]')).toHaveCount(0);
      await sinScrollHorizontal(page);
      expect(errores).toEqual([]);
    });

    test('el Cliente sin cambios no ve ningún aviso de precio en el carrito', async ({ page, request }) => {
      await escenaConCarrito(request);
      await abrirComoCliente(page);
      await page.goto('/carrito.html');

      await expect(page.getByTestId('btn-confirmar-pedido')).toBeVisible();
      await expect(page.locator('[data-testid^="item-precio-cambio-"], [data-testid^="item-precio-anterior-"]')).toHaveCount(0);
    });
  });

  test.describe('Checkout', () => {
    test('un 409 PRECIO_CAMBIO repinta el paso 3, avisa arriba y el segundo toque envía el total nuevo', async ({ page, request }) => {
      const escena = await escenaConCarrito(request);
      const errores = erroresDeConsola(page);
      const cuerpos = capturarPedidos(page);
      const totalViejo = Number((await carritoActual(request)).total);
      await abrirComoCliente(page);
      await llegarAlPaso3(page);
      const pedidosAntes = pedidosDelCliente();

      cambiarPrecio(escena.productoId, 12000);
      const totalNuevo = Number((await carritoActual(request)).total);
      await page.getByTestId('btn-confirmar-pedido').click();

      await expect(page.getByTestId('aviso-total-cambio')).toContainText(MENSAJE_CAMBIO);
      const itemId = (await carritoActual(request)).items[0].id as number;
      await expect(page.getByTestId(`item-precio-anterior-${itemId}`)).toHaveText(pesos(PRECIO));
      await expect(page.getByTestId(`item-precio-cambio-${itemId}`)).toHaveText('Cambió el precio');
      await expect(page.getByTestId('total-carrito')).toHaveText(pesos(totalNuevo));
      await expect(page.getByTestId('btn-confirmar-nuevo-total')).toHaveText(`Confirmar con el nuevo total - ${pesos(totalNuevo)}`);
      await expect(page.getByTestId('btn-confirmar-pedido')).toHaveCount(0);
      expect(pedidosDelCliente()).toBe(pedidosAntes);
      expect(cuerpos).toHaveLength(1);
      expect(Number(cuerpos[0].totalEsperado)).toBe(totalViejo);
      await sinScrollHorizontal(page);

      await page.getByTestId('btn-confirmar-nuevo-total').click();

      await expect(page.getByTestId('btn-ir-a-pagar')).toBeVisible();
      expect(cuerpos).toHaveLength(2);
      expect(Number(cuerpos[1].totalEsperado)).toBe(totalNuevo);
      expect(pedidosDelCliente()).toBe(pedidosAntes + 1);
      expect(totalDelUltimoPedido()).toBe(totalNuevo);
      expect(errores).toEqual([]);
    });

    test('si solo cambió el cargo por servicio el aviso lo dice y no habla de precio', async ({ page, request }) => {
      await escenaConCarrito(request);
      const cuerpos = capturarPedidos(page);
      await abrirComoCliente(page);
      await llegarAlPaso3(page);
      const pedidosAntes = pedidosDelCliente();

      sql(
        `INSERT INTO configuracion_tarifa (administrador_id, cargo_cliente, tipo_cargo_cliente, cargo_comercio, tipo_cargo_comercio, fecha_vigencia) ` +
          `SELECT administrador_id, 350, 'FIJO', cargo_comercio, tipo_cargo_comercio, NOW() + INTERVAL 2 DAY FROM configuracion_tarifa ORDER BY fecha_vigencia DESC LIMIT 1;`,
      );
      await page.getByTestId('btn-confirmar-pedido').click();

      await expect(page.getByTestId('aviso-total-cambio')).toContainText(MENSAJE_TARIFA);
      await expect(page.getByTestId('aviso-total-cambio')).not.toContainText('precio');
      await expect(page.locator('[data-testid^="item-precio-cambio-"]')).toHaveCount(0);
      await expect(page.getByTestId('cargo-servicio-carrito')).toHaveText(pesos(350));
      await expect(page.getByTestId('total-carrito')).toHaveText(pesos(PRECIO + 350));
      await expect(page.getByTestId('btn-confirmar-nuevo-total')).toHaveText(`Confirmar con el nuevo total - ${pesos(PRECIO + 350)}`);
      expect(pedidosDelCliente()).toBe(pedidosAntes);
      await sinScrollHorizontal(page);

      await page.getByTestId('btn-confirmar-nuevo-total').click();
      await expect(page.getByTestId('btn-ir-a-pagar')).toBeVisible();
      expect(Number(cuerpos[1].totalEsperado)).toBe(PRECIO + 350);
      expect(totalDelUltimoPedido()).toBe(PRECIO + 350);
    });

    test('el Cliente sin cambios no ve ningún aviso, el pedido se envía con el total que muestra el paso 3 y se crea', async ({ page, request }) => {
      await escenaConCarrito(request);
      const cuerpos = capturarPedidos(page);
      const total = Number((await carritoActual(request)).total);
      await abrirComoCliente(page);
      await llegarAlPaso3(page);

      await expect(page.getByTestId('aviso-total-cambio')).toHaveCount(0);
      await expect(page.locator('[data-testid^="item-precio-cambio-"]')).toHaveCount(0);
      await page.getByTestId('btn-confirmar-pedido').click();

      await expect(page.getByTestId('btn-ir-a-pagar')).toBeVisible();
      expect(cuerpos).toHaveLength(1);
      expect(Number(cuerpos[0].totalEsperado)).toBe(total);
      expect(totalDelUltimoPedido()).toBe(total);
    });
  });
});
