import { test, expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  agregarItemCarrito,
  apiConHeaders,
  clonarComercioTest,
  confirmarPagoTest,
  crearCategoria,
  crearPedido,
  crearProducto,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { ClienteRegistrado, SesionApi } from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { loginUi, prepararAprobado } from './helpers/multicomercio';
import {
  abrirComoUsuarioConContexto,
  atajoEstadoRelacion,
  contextoEnSesion,
  limpiarNotasCredito,
  MENSAJE_ACCESO_PERDIDO,
  ponerEstadoComercio,
  sembrarNotaCredito,
  sumarAlEquipo,
  ultimoContextoGuardado,
} from './helpers/empleado';

const HEADER = 'X-Comercio-Id';
const PRECIO = 2750;

interface Empleado {
  cuenta: ClienteRegistrado;
  usuarioId: number;
}

function formatearPrecio(valor: number): string {
  return `$${Math.round(valor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

async function sinScrollHorizontal(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

async function capturar(page: Page, nombre: string): Promise<void> {
  if (process.env.CAPTURAS) {
    await page.waitForFunction(() => Array.from(document.images).every((imagen) => imagen.complete));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `tmp-capturas/e2b-${process.env.CAPTURAS}-${nombre}.png`, fullPage: true });
  }
}

test.describe('Rol Empleado, tramo E2 (UI): acceso del Empleado', () => {
  test.describe.configure({ timeout: 240_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;
  let duenoA: Dueno;
  let comercioB: number;
  let productoA: number;
  let empleadoDos: Empleado;
  let clienteSolo: ClienteRegistrado;
  const idsPedido: Record<string, number> = {};
  const pedidosConNota: number[] = [];

  async function crearEmpleado(request: APIRequestContext, comercios: number[]): Promise<Empleado> {
    const cuenta = await registrarYVerificarCliente(request, localidadId);
    const tokenDelDueno = (await login(request, duenoA.nombreUsuario, duenoA.password)).token;
    for (const comercioId of comercios) {
      await sumarAlEquipo(request, comercioId, cuenta, tokenDelDueno);
    }
    const sesion = await login(request, cuenta.nombreUsuario, cuenta.password);
    return { cuenta, usuarioId: sesion.usuario.id };
  }

  async function comerciosNuevos(request: APIRequestContext, cantidad: number): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 0; i < cantidad; i += 1) {
      ids.push(await clonarComercioTest(request, duenoA.comercioId, `Comercio E2 ${sufijoUnico()}`, 'APROBADO'));
    }
    return ids;
  }

  async function sesionDe(request: APIRequestContext, cuenta: ClienteRegistrado): Promise<SesionApi> {
    return login(request, cuenta.nombreUsuario, cuenta.password);
  }

  async function abrirComoEmpleado(page: Page, request: APIRequestContext, empleado: Empleado, comercioId: number) {
    const sesion = await sesionDe(request, empleado.cuenta);
    await abrirComoUsuarioConContexto(page, sesion, {
      contexto: { tipo: 'EMPLEADO', comercioId },
      ultimoContexto: `EMPLEADO:${comercioId}`,
    });
    return sesion;
  }

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    const horarios = [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
    duenoA = await prepararAprobado(request, adminToken, localidadId, true, horarios);
    comercioB = await clonarComercioTest(request, duenoA.comercioId, `Comercio B E2 ${sufijoUnico()}`, 'APROBADO');
    categoriaId = await crearCategoria(request, adminToken, `Cat E2 UI ${sufijoUnico()}`);
    productoA = await crearProducto(request, duenoA.token, { nombre: `Producto E2 UI ${sufijoUnico()}`, precio: PRECIO, categoriaId });

    const cliente = await registrarYVerificarCliente(request, localidadId);
    const sesionCliente = await login(request, cliente.nombreUsuario, cliente.password);
    for (const clave of ['pendiente', 'aceptado', 'procesado', 'reintento', 'fallido']) {
      await agregarItemCarrito(request, sesionCliente.token, productoA, 1);
      const pedidoId = await crearPedido(request, sesionCliente.token, 'RETIRO');
      await confirmarPagoTest(request, pedidoId);
      idsPedido[clave] = pedidoId;
    }
    const aceptar = await apiConHeaders(request, 'PUT', `/pedidos/comercio/${idsPedido.aceptado}/aceptar`, duenoA.token, { [HEADER]: String(duenoA.comercioId) });
    expect(aceptar.status, JSON.stringify(aceptar.body)).toBe(200);
    sembrarNotaCredito(idsPedido.procesado, 'PROCESADO');
    sembrarNotaCredito(idsPedido.reintento, 'PENDIENTE_REINTENTO');
    sembrarNotaCredito(idsPedido.fallido, 'FALLIDO');
    pedidosConNota.push(idsPedido.procesado, idsPedido.reintento, idsPedido.fallido);

    empleadoDos = await crearEmpleado(request, [duenoA.comercioId, comercioB]);
    clienteSolo = await registrarYVerificarCliente(request, localidadId);
  });

  test.afterAll(() => {
    limpiarNotasCredito(pedidosConNota);
  });

  test.describe('Selector de contexto después del login', () => {
    test('un Cliente sin comercios como Empleado entra directo como Cliente, sin selector', async ({ page }) => {
      await loginUi(page, clienteSolo.nombreUsuario, clienteSolo.password);

      await page.waitForURL('**/index.html');
      expect(await contextoEnSesion(page)).toMatchObject({ tipo: 'CLIENTE', comercioId: null });
      await expect(page.getByTestId('selector-contexto')).toHaveCount(0);
    });

    test('con comercios como Empleado el login lleva al selector con "Cliente" y cada comercio', async ({ page }) => {
      await loginUi(page, empleadoDos.cuenta.nombreUsuario, empleadoDos.cuenta.password);

      await page.waitForURL('**/seleccionar-contexto.html');
      await expect(page.getByTestId('titulo-selector-contexto')).toHaveText('¿Cómo querés ingresar?');
      await expect(page.getByTestId('fila-contexto-cliente')).toBeVisible();
      await expect(page.getByTestId(`fila-contexto-comercio-${duenoA.comercioId}`)).toContainText(duenoA.nombre);
      await expect(page.getByTestId(`fila-contexto-comercio-${comercioB}`)).toBeVisible();
      await expect(page.getByTestId('lista-contextos').locator('button')).toHaveCount(3);
      await expect(page.getByTestId(`fila-contexto-comercio-${duenoA.comercioId}-subtitulo`)).toContainText('Empleado');
    });

    test('elegir "Cliente" entra a index.html con contexto Cliente y lo recuerda como último', async ({ page }) => {
      await loginUi(page, empleadoDos.cuenta.nombreUsuario, empleadoDos.cuenta.password);
      await page.waitForURL('**/seleccionar-contexto.html');

      await page.getByTestId('fila-contexto-cliente').click();

      await page.waitForURL('**/index.html');
      expect(await contextoEnSesion(page)).toMatchObject({ tipo: 'CLIENTE', comercioId: null });
      expect(await ultimoContextoGuardado(page, empleadoDos.usuarioId)).toBe('CLIENTE');
    });

    test('elegir un comercio entra al panel con contexto Empleado y lo recuerda como último', async ({ page }) => {
      await loginUi(page, empleadoDos.cuenta.nombreUsuario, empleadoDos.cuenta.password);
      await page.waitForURL('**/seleccionar-contexto.html');

      await page.getByTestId(`fila-contexto-comercio-${comercioB}`).click();

      await page.waitForURL('**/comercio-dashboard.html');
      expect(await contextoEnSesion(page)).toMatchObject({ tipo: 'EMPLEADO', comercioId: comercioB });
      expect(await ultimoContextoGuardado(page, empleadoDos.usuarioId)).toBe(`EMPLEADO:${comercioB}`);
      await expect(page.getByTestId('franja-comercio-nombre')).not.toBeEmpty();
    });

    test('el último contexto usado queda resaltado en el selector del próximo login', async ({ page }) => {
      await loginUi(page, empleadoDos.cuenta.nombreUsuario, empleadoDos.cuenta.password);
      await page.waitForURL('**/seleccionar-contexto.html');
      await page.getByTestId(`fila-contexto-comercio-${comercioB}`).click();
      await page.waitForURL('**/comercio-dashboard.html');
      await page.evaluate(() => {
        localStorage.removeItem('bajonea_token');
        localStorage.removeItem('bajonea_usuario');
        sessionStorage.clear();
      });

      await loginUi(page, empleadoDos.cuenta.nombreUsuario, empleadoDos.cuenta.password);
      await page.waitForURL('**/seleccionar-contexto.html');

      await expect(page.getByTestId(`fila-contexto-comercio-${comercioB}`)).toHaveAttribute('data-resaltada', 'true');
      await expect(page.getByTestId(`fila-contexto-comercio-${duenoA.comercioId}`)).not.toHaveAttribute('data-resaltada', 'true');
      await expect(page.getByTestId('fila-contexto-cliente')).not.toHaveAttribute('data-resaltada', 'true');
      await expect(page.getByTestId(`fila-contexto-comercio-${comercioB}-subtitulo`)).toContainText('Último que usaste');
    });

    test('si la consulta de comercios del Empleado falla en el login, entra como Cliente', async ({ page }) => {
      await page.route('**/empleados/mis-comercios', (ruta) => ruta.fulfill({ status: 500, contentType: 'application/json', body: '{"mensaje":"Error","data":null}' }));

      await loginUi(page, empleadoDos.cuenta.nombreUsuario, empleadoDos.cuenta.password);

      await page.waitForURL('**/index.html');
      expect(await contextoEnSesion(page)).toMatchObject({ tipo: 'CLIENTE' });
    });

    test('un comercio suspendido o cerrado temporalmente se puede elegir y se muestra con su estado y un aviso corto', async ({ page, request }) => {
      const suspendido = await clonarComercioTest(request, duenoA.comercioId, `Suspendido E2 ${sufijoUnico()}`, 'APROBADO');
      const cerrado = await clonarComercioTest(request, duenoA.comercioId, `Cerrado E2 ${sufijoUnico()}`, 'APROBADO');
      const empleado = await crearEmpleado(request, [suspendido, cerrado]);
      ponerEstadoComercio(suspendido, 'SUSPENDIDO');
      ponerEstadoComercio(cerrado, 'CERRADO_TEMPORALMENTE');

      await loginUi(page, empleado.cuenta.nombreUsuario, empleado.cuenta.password);
      await page.waitForURL('**/seleccionar-contexto.html');

      await expect(page.getByTestId(`etiqueta-estado-contexto-${suspendido}`)).toHaveText('Suspendido');
      await expect(page.getByTestId(`etiqueta-estado-contexto-${cerrado}`)).toHaveText('Cerrado temporalmente');
      await expect(page.getByTestId(`fila-contexto-comercio-${suspendido}-subtitulo`)).toContainText('Solo podés consultarlo');
      await expect(page.getByTestId(`etiqueta-estado-contexto-${duenoA.comercioId}`)).toHaveCount(0);
      await page.getByTestId(`fila-contexto-comercio-${suspendido}`).click();
      await page.waitForURL('**/comercio-dashboard.html');
      await expect(page.getByTestId('mensaje-estado-comercio')).toContainText('suspendido');
      await expect(page.getByTestId('franja-comercio-nombre')).toContainText('Suspendido E2');
    });
  });

  test.describe('Pestaña nueva con la sesión ya iniciada', () => {
    test('con el último contexto Empleado, una pestaña nueva abre directo el panel de ese comercio', async ({ page, request }) => {
      const sesion = await sesionDe(request, empleadoDos.cuenta);
      await abrirComoUsuarioConContexto(page, sesion, { ultimoContexto: `EMPLEADO:${comercioB}` });

      await page.goto('/index.html');

      await page.waitForURL('**/comercio-dashboard.html');
      expect(await contextoEnSesion(page)).toMatchObject({ tipo: 'EMPLEADO', comercioId: comercioB });
      await expect(page.getByTestId('franja-comercio-nombre')).not.toBeEmpty();
    });

    test('con el último contexto Cliente, una pestaña nueva se queda en el inicio de Cliente', async ({ page, request }) => {
      const sesion = await sesionDe(request, empleadoDos.cuenta);
      await abrirComoUsuarioConContexto(page, sesion, { ultimoContexto: 'CLIENTE' });

      await page.goto('/index.html');

      await expect(page.getByTestId('btn-nav-inicio')).toBeVisible();
      expect(page.url()).toContain('index.html');
      expect(await contextoEnSesion(page)).toMatchObject({ tipo: 'CLIENTE' });
    });

    test('si el comercio del último contexto ya no existe pero quedan otros, va al selector', async ({ page, request }) => {
      const [conservado, perdido] = await comerciosNuevos(request, 2);
      const empleado = await crearEmpleado(request, [conservado, perdido]);
      const sesion = await sesionDe(request, empleado.cuenta);
      await atajoEstadoRelacion(request, perdido, empleado.usuarioId, 'INACTIVO');
      await abrirComoUsuarioConContexto(page, sesion, { ultimoContexto: `EMPLEADO:${perdido}` });

      await page.goto('/index.html');

      await page.waitForURL('**/seleccionar-contexto.html');
      await expect(page.getByTestId(`fila-contexto-comercio-${conservado}`)).toBeVisible();
      await expect(page.getByTestId(`fila-contexto-comercio-${perdido}`)).toHaveCount(0);
      expect(await ultimoContextoGuardado(page, empleado.usuarioId)).toBeNull();
    });

    test('si el comercio del último contexto ya no existe y no queda ninguno, entra como Cliente', async ({ page, request }) => {
      const [perdido] = await comerciosNuevos(request, 1);
      const empleado = await crearEmpleado(request, [perdido]);
      const sesion = await sesionDe(request, empleado.cuenta);
      await atajoEstadoRelacion(request, perdido, empleado.usuarioId, 'INACTIVO');
      await abrirComoUsuarioConContexto(page, sesion, { ultimoContexto: `EMPLEADO:${perdido}` });

      await page.goto('/index.html');

      await expect(page.getByTestId('btn-nav-inicio')).toBeVisible();
      expect(page.url()).toContain('index.html');
      expect(await contextoEnSesion(page)).toMatchObject({ tipo: 'CLIENTE' });
    });

    test('una pestaña nueva que abre una pantalla del comercio con último contexto Empleado la muestra sin pasar por el inicio', async ({ page, request }) => {
      const sesion = await sesionDe(request, empleadoDos.cuenta);
      await abrirComoUsuarioConContexto(page, sesion, { ultimoContexto: `EMPLEADO:${duenoA.comercioId}` });

      await page.goto('/comercio-pedidos.html');

      await expect(page.getByTestId(`pedido-item-${idsPedido.aceptado}`)).toBeVisible();
      expect(page.url()).toContain('comercio-pedidos.html');
    });
  });

  test.describe('Cambiar de cuenta', () => {
    test('en perfil.html un Cliente con comercios como Empleado ve la fila y la hoja con "Cliente" y los comercios, sin línea de ayuda', async ({ page, request }) => {
      const sesion = await sesionDe(request, empleadoDos.cuenta);
      await abrirComoUsuarioConContexto(page, sesion, { contexto: { tipo: 'CLIENTE' }, ultimoContexto: 'CLIENTE' });

      await page.goto('/perfil.html');
      await expect(page.getByTestId('btn-cambiar-cuenta')).toBeEnabled();
      await page.getByTestId('btn-cambiar-cuenta').click();

      await expect(page.getByTestId('titulo-cambiar-cuenta')).toHaveText('Cambiar de cuenta');
      await expect(page.getByTestId('fila-contexto-cliente')).toBeVisible();
      await expect(page.getByTestId(`fila-contexto-comercio-${duenoA.comercioId}`)).toBeVisible();
      await expect(page.getByTestId(`fila-contexto-comercio-${comercioB}`)).toBeVisible();
      await expect(page.getByTestId('hoja-cambiar-cuenta').locator('.field__hint')).toHaveCount(0);
      await expect(page.getByTestId('tilde-contexto-actual')).toHaveCount(1);
      await expect(page.getByTestId('fila-contexto-cliente').getByTestId('tilde-contexto-actual')).toBeVisible();
    });

    test('desde perfil.html, elegir un comercio cambia el contexto y va al panel de ese comercio', async ({ page, request }) => {
      const sesion = await sesionDe(request, empleadoDos.cuenta);
      await abrirComoUsuarioConContexto(page, sesion, { contexto: { tipo: 'CLIENTE' } });
      await page.goto('/perfil.html');
      await page.getByTestId('btn-cambiar-cuenta').click();

      await page.getByTestId(`fila-contexto-comercio-${duenoA.comercioId}`).click();

      await page.waitForURL('**/comercio-dashboard.html');
      expect(await contextoEnSesion(page)).toMatchObject({ tipo: 'EMPLEADO', comercioId: duenoA.comercioId });
    });

    test('en perfil.html un Cliente sin comercios como Empleado no ve la fila "Cambiar de cuenta"', async ({ page, request }) => {
      const sesion = await sesionDe(request, clienteSolo);
      await abrirComoUsuarioConContexto(page, sesion, { contexto: { tipo: 'CLIENTE' } });

      await page.goto('/perfil.html');
      await expect(page.getByTestId('nombre-cliente-perfil')).not.toBeEmpty();

      await expect(page.getByTestId('btn-cambiar-cuenta')).toBeHidden();
    });

    test('en comercio-perfil.html, en contexto Empleado, la hoja marca el comercio actual y permite pasar a "Cliente"', async ({ page, request }) => {
      await abrirComoEmpleado(page, request, empleadoDos, duenoA.comercioId);
      await page.goto('/comercio-perfil.html');
      await page.getByTestId('btn-cambiar-cuenta').click();

      await expect(page.getByTestId(`fila-contexto-comercio-${duenoA.comercioId}`).getByTestId('tilde-contexto-actual')).toBeVisible();
      await page.getByTestId('fila-contexto-cliente').click();

      await page.waitForURL('**/index.html');
      expect(await contextoEnSesion(page)).toMatchObject({ tipo: 'CLIENTE', comercioId: null });
      expect(await ultimoContextoGuardado(page, empleadoDos.usuarioId)).toBe('CLIENTE');
    });

    test('desde un comercio, elegir el otro comercio cambia el contexto al nuevo y no mezcla los datos', async ({ page, request }) => {
      await abrirComoEmpleado(page, request, empleadoDos, duenoA.comercioId);
      await page.goto('/comercio-perfil.html');
      await page.getByTestId('btn-cambiar-cuenta').click();

      await page.getByTestId(`fila-contexto-comercio-${comercioB}`).click();

      await page.waitForURL('**/comercio-dashboard.html');
      expect(await contextoEnSesion(page)).toMatchObject({ tipo: 'EMPLEADO', comercioId: comercioB });
      await expect(page.getByTestId('lista-pedidos-activos')).toContainText('No tenés pedidos activos');
    });

    test('"Mi cuenta" lleva al perfil personal sin redirigir al panel, con "Cambiar de cuenta" disponible', async ({ page, request }) => {
      await abrirComoEmpleado(page, request, empleadoDos, duenoA.comercioId);
      await page.goto('/comercio-perfil.html');

      await page.getByTestId('btn-mi-cuenta').click();

      await page.waitForURL('**/perfil.html');
      await expect(page.getByTestId('nombre-cliente-perfil')).not.toBeEmpty();
      await expect(page.getByTestId('btn-cambiar-cuenta')).toBeVisible();
      await expect(page.getByTestId('btn-nav-perfil')).toBeVisible();
      expect(await contextoEnSesion(page)).toMatchObject({ tipo: 'EMPLEADO', comercioId: duenoA.comercioId });
    });

    test('el Dueño no ve "Cambiar de cuenta" en su perfil', async ({ page, request }) => {
      const sesion = await login(request, duenoA.nombreUsuario, duenoA.password);
      await abrirComoUsuarioConContexto(page, sesion);
      await page.addInitScript(([id, usuarioId]) => {
        sessionStorage.setItem('bajonea_comercio_activo', JSON.stringify({ usuarioId, comercioId: id }));
      }, [duenoA.comercioId, sesion.usuario.id] as const);

      await page.goto('/comercio-perfil.html');
      await expect(page.getByTestId('nombre-comercio-perfil')).not.toBeEmpty();

      await expect(page.getByTestId('btn-cambiar-cuenta')).toBeHidden();
      await expect(page.getByTestId('btn-editar-perfil-comercio')).toBeVisible();
    });
  });

  test.describe('Panel del Empleado: solo lectura', () => {
    test('el panel muestra el distintivo "Empleado", "Ventas de hoy", los contadores y los pedidos activos, sin campana ni interruptor de cierre', async ({ page, request }) => {
      await abrirComoEmpleado(page, request, empleadoDos, duenoA.comercioId);

      await page.goto('/comercio-dashboard.html');

      await expect(page.getByTestId('franja-comercio-nombre')).toHaveText(duenoA.nombre);
      await expect(page.getByTestId('franja-comercio-insignia-empleado')).toHaveText('Empleado');
      const metricas = page.getByTestId('metricas-dashboard');
      await expect(metricas).toContainText('Ventas de hoy');
      await expect(metricas).toContainText('Pedidos hoy');
      await expect(metricas).toContainText('Pendientes');
      await expect(metricas).not.toContainText('Facturado hoy');
      await expect(page.getByTestId('btn-notificaciones')).toHaveCount(0);
      await expect(page.getByTestId('tarjeta-cierre-comercio')).toHaveCount(0);
      await expect(page.getByTestId('tarjeta-cierre-comercio-cargando')).toHaveCount(0);
      await expect(page.getByTestId(`pedido-item-${idsPedido.aceptado}`)).toBeVisible();
      await expect(page.getByTestId('btn-nav-panel')).toBeVisible();
      await expect(page.getByTestId('btn-nav-productos')).toBeVisible();
      await expect(page.getByTestId('btn-nav-pedidos')).toBeVisible();
      await expect(page.getByTestId('btn-nav-perfil')).toBeVisible();
    });

    test('"Ventas de hoy" muestra el subtotal bruto de los pedidos facturados hoy, igual que el resumen del servidor', async ({ page, request }) => {
      const sesion = await abrirComoEmpleado(page, request, empleadoDos, duenoA.comercioId);
      const resumen = await apiConHeaders(request, 'GET', '/pedidos/comercio/resumen-hoy', sesion.token, { [HEADER]: String(duenoA.comercioId) });
      expect(resumen.status).toBe(200);

      await page.goto('/comercio-dashboard.html');

      await expect(page.getByTestId('metricas-dashboard')).toContainText(formatearPrecio(resumen.body.data.totalFacturadoHoy));
      await expect(page.getByTestId('metricas-dashboard')).toContainText(String(resumen.body.data.cantidadPedidosHoy));
    });

    test('el Dueño sigue viendo "Facturado hoy", la campana y el interruptor de cierre', async ({ page, request }) => {
      const sesion = await login(request, duenoA.nombreUsuario, duenoA.password);
      await abrirComoUsuarioConContexto(page, sesion);
      await page.addInitScript(([id, usuarioId]) => {
        sessionStorage.setItem('bajonea_comercio_activo', JSON.stringify({ usuarioId, comercioId: id }));
      }, [duenoA.comercioId, sesion.usuario.id] as const);

      await page.goto('/comercio-dashboard.html');

      await expect(page.getByTestId('metricas-dashboard')).toContainText('Facturado hoy');
      await expect(page.getByTestId('metricas-dashboard')).not.toContainText('Ventas de hoy');
      await expect(page.getByTestId('btn-notificaciones')).toBeVisible();
      await expect(page.getByTestId('tarjeta-cierre-comercio')).toBeVisible();
      await expect(page.getByTestId('franja-comercio-insignia-empleado')).toHaveCount(0);
      await expect(page.getByTestId('franja-comercio')).toContainText('Cambiar');
    });

    test('la lista de productos se ve en solo lectura: sin botón para crear ni menú de acciones', async ({ page, request }) => {
      await abrirComoEmpleado(page, request, empleadoDos, duenoA.comercioId);

      await page.goto('/comercio-productos.html');

      await expect(page.getByTestId(`producto-item-${productoA}`)).toBeVisible();
      await expect(page.getByTestId('btn-crear-producto')).toBeHidden();
      await expect(page.getByTestId(`btn-acciones-producto-${productoA}`)).toHaveCount(0);
    });

    test('el formulario de producto y las pantallas exclusivas del Dueño redirigen al panel', async ({ page, request }) => {
      await abrirComoEmpleado(page, request, empleadoDos, duenoA.comercioId);

      for (const ruta of ['comercio-producto-form.html', 'agregar-comercio.html', 'comercio-pendiente.html', 'comercio-rechazado.html', 'comercio-corregir.html?id=1']) {
        await page.goto(`/${ruta}`);
        await page.waitForURL('**/comercio-dashboard.html');
        await expect(page.getByTestId('franja-comercio-insignia-empleado')).toBeVisible();
      }
    });

    test('en el detalle de un pedido pendiente el Empleado no ve ninguna acción ni la línea de cargo de servicio', async ({ page, request }) => {
      await abrirComoEmpleado(page, request, empleadoDos, duenoA.comercioId);

      await page.goto(`/comercio-pedido-detalle.html?id=${idsPedido.pendiente}`);

      await expect(page.getByTestId('nombre-cliente-pedido')).toBeVisible();
      await expect(page.getByText('Este pedido está esperando la confirmación del comercio.')).toBeVisible();
      for (const boton of ['btn-aceptar-pedido', 'btn-rechazar-pedido', 'btn-despachar-pedido', 'btn-anular-pedido']) {
        await expect(page.getByTestId(boton)).toHaveCount(0);
      }
      await expect(page.getByText('Cargo por servicio')).toHaveCount(0);
      await expect(page.getByTestId('subtotal-pedido')).toContainText('Subtotal');
      await expect(page.getByTestId('subtotal-pedido')).toContainText(formatearPrecio(PRECIO));
      await expect(page.getByTestId('total-pagado-pedido')).toContainText('Total pagado');
    });

    test('la tarjeta y el detalle del pedido muestran el mismo "Total pagado", distinto del subtotal', async ({ page, request }) => {
      const sesion = await sesionDe(request, empleadoDos.cuenta);
      const lista = await apiConHeaders(request, 'GET', '/pedidos/comercio', sesion.token, { [HEADER]: String(duenoA.comercioId) });
      const pedido = (lista.body.data as Array<Record<string, any>>).find((p) => p.id === idsPedido.pendiente)!;
      const total = formatearPrecio(pedido.total);
      const subtotal = formatearPrecio(pedido.subtotal);
      expect(total).not.toBe(subtotal);
      await abrirComoEmpleado(page, request, empleadoDos, duenoA.comercioId);

      await page.goto('/comercio-pedidos.html');
      await expect(page.getByTestId(`pedido-item-${idsPedido.pendiente}`).getByTestId('total-pedido')).toHaveText(total);

      await page.goto(`/comercio-pedido-detalle.html?id=${idsPedido.pendiente}`);
      await expect(page.getByTestId('total-pagado-pedido')).toContainText(total);
      await expect(page.getByTestId('subtotal-pedido')).toContainText(subtotal);
      await expect(page.getByTestId('total-pagado-pedido')).not.toContainText(subtotal);
    });

    test('el Dueño ve en el mismo pedido los botones de aceptar y rechazar y la línea de cargo de servicio', async ({ page, request }) => {
      const sesion = await login(request, duenoA.nombreUsuario, duenoA.password);
      await abrirComoUsuarioConContexto(page, sesion);
      await page.addInitScript(([id, usuarioId]) => {
        sessionStorage.setItem('bajonea_comercio_activo', JSON.stringify({ usuarioId, comercioId: id }));
      }, [duenoA.comercioId, sesion.usuario.id] as const);

      await page.goto(`/comercio-pedido-detalle.html?id=${idsPedido.pendiente}`);

      await expect(page.getByTestId('btn-aceptar-pedido')).toBeVisible();
      await expect(page.getByTestId('btn-rechazar-pedido')).toBeVisible();
      await expect(page.getByText('Cargo por servicio (1%)')).toBeVisible();
    });

    test('el perfil del Empleado muestra los datos operativos, "Mi cuenta", "Cambiar de cuenta" y "Cerrar sesión", y oculta lo exclusivo o futuro', async ({ page, request }) => {
      await abrirComoEmpleado(page, request, empleadoDos, duenoA.comercioId);

      await page.goto('/comercio-perfil.html');

      await expect(page.getByTestId('nombre-comercio-perfil')).toHaveText(duenoA.nombre);
      await expect(page.getByTestId('insignia-empleado-perfil')).toBeVisible();
      await expect(page.getByTestId('email-comercio-perfil')).toBeHidden();
      await expect(page.getByTestId('empleado-direccion')).not.toBeEmpty();
      await expect(page.getByTestId('empleado-telefono')).toContainText('+549');
      await expect(page.getByTestId('empleado-horarios')).toContainText('Cerrado');
      await expect(page.getByTestId('empleado-estado')).toHaveText(/Abierto ahora|Cerrado en este momento/);
      await expect(page.getByTestId('btn-mi-cuenta')).toHaveAttribute('href', 'perfil.html');
      await expect(page.getByTestId('btn-cambiar-cuenta')).toBeEnabled();
      await expect(page.getByTestId('btn-cerrar-sesion')).toBeVisible();
      for (const oculto of ['btn-editar-perfil-comercio', 'btn-ver-legales', 'btn-ver-equipo', 'btn-ir-mercadopago', 'btn-cambiar-password']) {
        await expect(page.getByTestId(oculto), oculto).toBeHidden();
      }
      await expect(page.getByText('Renunciar')).toHaveCount(0);
    });

    test('el perfil del Empleado no muestra los datos fiscales ni el email de contacto del comercio', async ({ page, request }) => {
      await abrirComoEmpleado(page, request, empleadoDos, duenoA.comercioId);

      await page.goto('/comercio-perfil.html');
      await expect(page.getByTestId('empleado-direccion')).not.toBeEmpty();

      const texto = (await page.locator('main').innerText()).toLowerCase();
      for (const prohibido of ['cuit', 'razón social', 'domicilio fiscal', 'mercado pago', 'condición ante el iva']) {
        expect(texto, prohibido).not.toContain(prohibido);
      }
    });

    test('el Dueño conserva todas las filas de su perfil, sin la sección del Empleado', async ({ page, request }) => {
      const sesion = await login(request, duenoA.nombreUsuario, duenoA.password);
      await abrirComoUsuarioConContexto(page, sesion);
      await page.addInitScript(([id, usuarioId]) => {
        sessionStorage.setItem('bajonea_comercio_activo', JSON.stringify({ usuarioId, comercioId: id }));
      }, [duenoA.comercioId, sesion.usuario.id] as const);

      await page.goto('/comercio-perfil.html');
      await expect(page.getByTestId('btn-editar-perfil-comercio')).toBeEnabled();

      for (const visible of ['btn-editar-perfil-comercio', 'btn-ver-legales', 'btn-ver-equipo', 'btn-ir-mercadopago', 'btn-cambiar-password']) {
        await expect(page.getByTestId(visible), visible).toBeVisible();
      }
      await expect(page.getByTestId('seccion-datos-comercio-empleado')).toBeHidden();
      await expect(page.getByTestId('insignia-empleado-perfil')).toBeHidden();
    });

    test('un comercio suspendido o cerrado temporalmente entra en solo lectura con un aviso en el panel y su estado en el perfil', async ({ page, request }) => {
      const suspendido = await clonarComercioTest(request, duenoA.comercioId, `Susp E2 ${sufijoUnico()}`, 'APROBADO');
      const cerrado = await clonarComercioTest(request, duenoA.comercioId, `Cerr E2 ${sufijoUnico()}`, 'APROBADO');
      const empleado = await crearEmpleado(request, [suspendido, cerrado]);
      ponerEstadoComercio(suspendido, 'SUSPENDIDO');
      ponerEstadoComercio(cerrado, 'CERRADO_TEMPORALMENTE');

      await abrirComoEmpleado(page, request, empleado, suspendido);
      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId('mensaje-estado-comercio')).toContainText('Este comercio está suspendido');
      await page.goto('/comercio-perfil.html');
      await expect(page.getByTestId('empleado-estado')).toHaveText('Suspendido');

      await page.evaluate(([clave, usuarioId, comercioId]) => {
        sessionStorage.setItem(clave as string, JSON.stringify({ usuarioId, tipo: 'EMPLEADO', comercioId }));
      }, ['bajonea_contexto', empleado.usuarioId, cerrado] as const);
      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId('mensaje-estado-comercio')).toContainText('cerrado temporalmente');
      await page.goto('/comercio-perfil.html');
      await expect(page.getByTestId('empleado-estado')).toHaveText('Cerrado temporalmente');
    });
  });

  test.describe('Reembolso en solo lectura', () => {
    const textoMonto = async (request: APIRequestContext, pedidoId: number): Promise<string> => {
      const sesion = await sesionDe(request, empleadoDos.cuenta);
      const lista = await apiConHeaders(request, 'GET', '/pedidos/comercio', sesion.token, { [HEADER]: String(duenoA.comercioId) });
      const pedido = (lista.body.data as Array<Record<string, any>>).find((p) => p.id === pedidoId)!;
      return formatearPrecio(pedido.reembolsoMonto);
    };

    test('la lista muestra "Reembolso en proceso", "Reembolsado" y "Reembolso en revisión" con el monto, cada uno en su pedido', async ({ page, request }) => {
      const esperados: Array<[string, string]> = [
        ['reintento', 'Reembolso en proceso'],
        ['procesado', 'Reembolsado'],
        ['fallido', 'Reembolso en revisión'],
      ];
      const montos: Record<string, string> = {};
      for (const [clave] of esperados) {
        montos[clave] = await textoMonto(request, idsPedido[clave]);
      }
      await abrirComoEmpleado(page, request, empleadoDos, duenoA.comercioId);

      await page.goto('/comercio-pedidos.html');

      for (const [clave, texto] of esperados) {
        const chip = page.getByTestId(`pedido-item-${idsPedido[clave]}`).getByTestId('chip-reembolso-pedido');
        await expect(chip, clave).toHaveText(`${texto} · ${montos[clave]}`);
      }
    });

    test('los pedidos sin reembolso no muestran ningún chip', async ({ page, request }) => {
      await abrirComoEmpleado(page, request, empleadoDos, duenoA.comercioId);

      await page.goto('/comercio-pedidos.html');
      await expect(page.getByTestId(`pedido-item-${idsPedido.pendiente}`)).toBeVisible();

      await expect(page.getByTestId(`pedido-item-${idsPedido.pendiente}`).getByTestId('chip-reembolso-pedido')).toHaveCount(0);
      await expect(page.getByTestId(`pedido-item-${idsPedido.aceptado}`).getByTestId('chip-reembolso-pedido')).toHaveCount(0);
      await expect(page.getByTestId('chip-reembolso-pedido')).toHaveCount(3);
    });

    test('"en proceso" y "en revisión" nunca se muestran como "reembolsado", en la lista ni en el detalle', async ({ page, request }) => {
      await abrirComoEmpleado(page, request, empleadoDos, duenoA.comercioId);

      await page.goto('/comercio-pedidos.html');
      await expect(page.getByTestId(`pedido-item-${idsPedido.reintento}`)).toBeVisible();
      await expect(page.getByTestId(`pedido-item-${idsPedido.reintento}`)).not.toContainText('Reembolsado');
      await expect(page.getByTestId(`pedido-item-${idsPedido.fallido}`)).not.toContainText('Reembolsado');

      for (const [clave, texto] of [['reintento', 'Reembolso en proceso'], ['fallido', 'Reembolso en revisión'], ['procesado', 'Reembolsado']]) {
        await page.goto(`/comercio-pedido-detalle.html?id=${idsPedido[clave]}`);
        const chip = page.getByTestId('chip-reembolso-detalle');
        await expect(chip, clave).toContainText(texto);
        if (clave !== 'procesado') {
          await expect(chip, clave).not.toContainText(/^Reembolsado/);
        }
      }
    });

    test('el chip no muestra comisión ni cargo al comercio, y la respuesta no trae datos técnicos del reembolso', async ({ page, request }) => {
      await abrirComoEmpleado(page, request, empleadoDos, duenoA.comercioId);
      const cuerpos: string[] = [];
      page.on('response', async (respuesta) => {
        if (respuesta.url().includes('/pedidos/comercio') && respuesta.status() === 200) {
          cuerpos.push(await respuesta.text());
        }
      });

      await page.goto('/comercio-pedidos.html');
      await expect(page.getByTestId('chip-reembolso-pedido').first()).toBeVisible();

      const texto = (await page.locator('main').innerText()).toLowerCase();
      expect(texto).not.toContain('comisión');
      expect(texto).not.toContain('cargo por servicio');
      const crudo = cuerpos.join('').toLowerCase();
      for (const prohibido of ['cargoservicio', 'ultimoerror', 'intentos', 'sintetico', 'mp_']) {
        expect(crudo, prohibido).not.toContain(prohibido);
      }
    });

    test('el Dueño no ve el chip de reembolso (cambio exclusivo del Empleado)', async ({ page, request }) => {
      const sesion = await login(request, duenoA.nombreUsuario, duenoA.password);
      await abrirComoUsuarioConContexto(page, sesion);
      await page.addInitScript(([id, usuarioId]) => {
        sessionStorage.setItem('bajonea_comercio_activo', JSON.stringify({ usuarioId, comercioId: id }));
      }, [duenoA.comercioId, sesion.usuario.id] as const);

      await page.goto('/comercio-pedidos.html');
      await expect(page.getByTestId(`pedido-item-${idsPedido.reintento}`)).toBeVisible();

      await expect(page.getByTestId('chip-reembolso-pedido')).toHaveCount(0);
    });
  });

  test.describe('Pérdida de acceso en medio del uso', () => {
    test('por un 404 de comercio no disponible: limpia el contexto, avisa y va al selector si quedan otros comercios', async ({ page, request }) => {
      const [conservado, perdido] = await comerciosNuevos(request, 2);
      const empleado = await crearEmpleado(request, [conservado, perdido]);
      const sesion = await abrirComoEmpleado(page, request, empleado, perdido);
      const lista = await apiConHeaders(request, 'GET', '/empleados/mis-comercios', sesion.token, {});
      await page.route('**/empleados/mis-comercios', (ruta) => {
        if (ruta.request().frame().url().includes('/comercio-')) {
          return ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(lista.body) });
        }
        return ruta.continue();
      });
      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId('franja-comercio-insignia-empleado')).toBeVisible();

      await atajoEstadoRelacion(request, perdido, empleado.usuarioId, 'INACTIVO');
      const respuesta404 = page.waitForResponse((r) => r.status() === 404 && r.url().includes('/pedidos/comercio'));
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await respuesta404;

      await page.waitForURL('**/seleccionar-contexto.html');
      await expect(page.getByText(MENSAJE_ACCESO_PERDIDO)).toBeVisible();
      await expect(page.getByTestId(`fila-contexto-comercio-${conservado}`)).toBeVisible();
      await expect(page.getByTestId(`fila-contexto-comercio-${perdido}`)).toHaveCount(0);
      expect(await contextoEnSesion(page)).toBeNull();
      expect(await ultimoContextoGuardado(page, empleado.usuarioId)).toBeNull();
      expect(page.url()).not.toContain('acceso-denegado');
    });

    test('por un 404 de comercio no disponible sin otros comercios: va al inicio de Cliente con el aviso', async ({ page, request }) => {
      const [perdido] = await comerciosNuevos(request, 1);
      const empleado = await crearEmpleado(request, [perdido]);
      const sesion = await abrirComoEmpleado(page, request, empleado, perdido);
      const lista = await apiConHeaders(request, 'GET', '/empleados/mis-comercios', sesion.token, {});
      await page.route('**/empleados/mis-comercios', (ruta) => {
        if (ruta.request().frame().url().includes('/comercio-')) {
          return ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(lista.body) });
        }
        return ruta.continue();
      });
      await page.goto('/comercio-pedidos.html');
      await expect(page.getByTestId('franja-comercio-insignia-empleado')).toBeVisible();

      await atajoEstadoRelacion(request, perdido, empleado.usuarioId, 'INACTIVO');
      const respuesta404 = page.waitForResponse((r) => r.status() === 404 && r.url().includes('/productos'));
      await page.evaluate(async () => {
        const { apiFetch } = await import('./js/api.js');
        apiFetch('/productos').catch(() => {});
      });
      await respuesta404;

      await page.waitForURL('**/index.html');
      await expect(page.getByText(MENSAJE_ACCESO_PERDIDO)).toBeVisible();
      expect(await contextoEnSesion(page)).toMatchObject({ tipo: 'CLIENTE' });
      expect(await ultimoContextoGuardado(page, empleado.usuarioId)).not.toBe(`EMPLEADO:${perdido}`);
    });

    test('por el sondeo de cada 15 segundos: detecta que el comercio desapareció de la lista y va al selector', async ({ page, request }) => {
      test.setTimeout(120_000);
      const [conservado, perdido] = await comerciosNuevos(request, 2);
      const empleado = await crearEmpleado(request, [conservado, perdido]);
      await abrirComoEmpleado(page, request, empleado, perdido);
      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId('franja-comercio-insignia-empleado')).toBeVisible();

      await atajoEstadoRelacion(request, perdido, empleado.usuarioId, 'INACTIVO');

      await page.waitForURL('**/seleccionar-contexto.html', { timeout: 30_000 });
      await expect(page.getByText(MENSAJE_ACCESO_PERDIDO)).toBeVisible();
      await expect(page.getByTestId(`fila-contexto-comercio-${perdido}`)).toHaveCount(0);
      expect(await contextoEnSesion(page)).toBeNull();
    });

    test('por el sondeo sin otros comercios: va al inicio de Cliente con el aviso', async ({ page, request }) => {
      test.setTimeout(120_000);
      const [perdido] = await comerciosNuevos(request, 1);
      const empleado = await crearEmpleado(request, [perdido]);
      await abrirComoEmpleado(page, request, empleado, perdido);
      await page.goto('/comercio-productos.html');
      await expect(page.getByTestId('franja-comercio-insignia-empleado')).toBeVisible();

      await atajoEstadoRelacion(request, perdido, empleado.usuarioId, 'INACTIVO');

      await page.waitForURL('**/index.html', { timeout: 30_000 });
      await expect(page.getByText(MENSAJE_ACCESO_PERDIDO)).toBeVisible();
      expect(await contextoEnSesion(page)).toMatchObject({ tipo: 'CLIENTE' });
    });

    test('el sondeo del Empleado consulta solo la lista de sus comercios y nunca la del Dueño', async ({ page, request }) => {
      test.setTimeout(90_000);
      await abrirComoEmpleado(page, request, empleadoDos, duenoA.comercioId);
      const consultas: string[] = [];
      page.on('request', (r) => {
        if (r.url().includes('mis-comercios')) {
          consultas.push(new URL(r.url()).pathname);
        }
      });

      await page.goto('/comercio-dashboard.html');
      await expect.poll(() => consultas.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);

      expect(new Set(consultas)).toEqual(new Set(['/api/v1/empleados/mis-comercios']));
      expect(page.url()).toContain('comercio-dashboard.html');
    });

    test('un comercio que pasa a suspendido no saca al Empleado: sigue adentro en solo lectura', async ({ page, request }) => {
      test.setTimeout(120_000);
      const comercio = await clonarComercioTest(request, duenoA.comercioId, `Susp sondeo ${sufijoUnico()}`, 'APROBADO');
      const empleado = await crearEmpleado(request, [comercio]);
      await abrirComoEmpleado(page, request, empleado, comercio);
      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId('franja-comercio-insignia-empleado')).toBeVisible();

      ponerEstadoComercio(comercio, 'SUSPENDIDO');
      const consulta = page.waitForResponse((r) => r.url().includes('/empleados/mis-comercios') && r.status() === 200, { timeout: 30_000 });
      await consulta;

      await expect(page.getByTestId('mensaje-estado-comercio')).toContainText('suspendido');
      expect(page.url()).toContain('comercio-dashboard.html');
    });
  });

  test.describe('Pantallas compartidas y de Cliente en contexto Empleado', () => {
    test('ninguna pantalla compartida llama a un endpoint exclusivo del Dueño ni cae en acceso-denegado', async ({ page, request }) => {
      await abrirComoEmpleado(page, request, empleadoDos, duenoA.comercioId);
      const llamadas: string[] = [];
      const rechazadas: string[] = [];
      page.on('request', (r) => {
        if (r.url().includes('/api/v1/')) {
          llamadas.push(`${r.method()} ${new URL(r.url()).pathname}`);
        }
      });
      page.on('response', (r) => {
        if (r.url().includes('/api/v1/') && (r.status() === 403 || r.status() >= 400)) {
          rechazadas.push(`${r.status()} ${new URL(r.url()).pathname}`);
        }
      });

      for (const ruta of [
        'comercio-dashboard.html',
        'comercio-productos.html',
        'comercio-pedidos.html',
        `comercio-pedido-detalle.html?id=${idsPedido.aceptado}`,
        'comercio-perfil.html',
        'perfil.html',
      ]) {
        await page.goto(`/${ruta}`);
        await page.waitForLoadState('networkidle');
        expect(page.url(), ruta).not.toContain('acceso-denegado');
        expect(page.url(), ruta).toContain(ruta.split('?')[0]);
      }

      const exclusivas = /\/comercios\/(mis-comercios|equipo|redes-sociales|cerrar|abrir|alta-adicional|nuevo)|\/oauth\/|\/notificaciones|\/administrador\//;
      expect(llamadas.filter((llamada) => exclusivas.test(llamada))).toEqual([]);
      expect(rechazadas).toEqual([]);
      expect(llamadas.some((llamada) => llamada.endsWith('/empleados/mis-comercios'))).toBe(true);
    });

    test('el Empleado manda el comercio en las rutas de operación y no en la lista de sus comercios ni en el perfil personal', async ({ page, request }) => {
      await abrirComoEmpleado(page, request, empleadoDos, duenoA.comercioId);
      const cabeceras: Record<string, string | undefined> = {};
      page.on('request', (r) => {
        if (r.url().includes('/api/v1/')) {
          cabeceras[new URL(r.url()).pathname] = r.headers()['x-comercio-id'];
        }
      });

      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId(`pedido-item-${idsPedido.aceptado}`)).toBeVisible();
      await page.goto('/perfil.html');
      await expect(page.getByTestId('nombre-cliente-perfil')).not.toBeEmpty();

      expect(cabeceras['/api/v1/pedidos/comercio']).toBe(String(duenoA.comercioId));
      expect(cabeceras['/api/v1/pedidos/comercio/resumen-hoy']).toBe(String(duenoA.comercioId));
      expect(cabeceras['/api/v1/comercios/perfil']).toBe(String(duenoA.comercioId));
      expect(cabeceras['/api/v1/empleados/mis-comercios']).toBeUndefined();
      expect(cabeceras['/api/v1/clientes/perfil']).toBeUndefined();
    });

    test('las pantallas de Cliente redirigen al panel del comercio cuando la pestaña está en contexto Empleado', async ({ page, request }) => {
      await abrirComoEmpleado(page, request, empleadoDos, duenoA.comercioId);

      for (const ruta of ['index.html', 'explorar.html', 'carrito.html', 'checkout.html', 'pedidos.html', 'pedido-detalle.html?id=1', 'notificaciones.html', `comercio-detalle.html?id=${duenoA.comercioId}`]) {
        await page.goto(`/${ruta}`);
        await page.waitForURL('**/comercio-dashboard.html');
        await expect(page.getByTestId('franja-comercio-insignia-empleado'), ruta).toBeVisible();
      }
    });

    test('desde el panel del Empleado, el avatar del perfil lleva al perfil del comercio y no abre el selector del Dueño', async ({ page, request }) => {
      await abrirComoEmpleado(page, request, empleadoDos, duenoA.comercioId);
      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId('franja-comercio-insignia-empleado')).toBeVisible();

      await page.getByTestId('franja-comercio').click();

      await expect(page.getByTestId('panel-comercios')).toHaveCount(0);
      await page.getByTestId('btn-nav-perfil').click();
      await page.waitForURL('**/comercio-perfil.html');
    });
  });

  test.describe('Regresión: Dueño y Cliente sin cambios', () => {
    test('el Dueño inicia sesión y entra directo al panel, sin selector ni contexto de Empleado', async ({ page }) => {
      const cabeceras: Array<string | undefined> = [];
      page.on('request', (r) => {
        if (r.url().includes('/api/v1/pedidos/comercio')) {
          cabeceras.push(r.headers()['x-comercio-id']);
        }
      });

      await loginUi(page, duenoA.nombreUsuario, duenoA.password);

      await page.waitForURL('**/comercio-dashboard.html');
      await expect(page.getByTestId('franja-comercio')).toContainText('Cambiar');
      await expect(page.getByTestId('metricas-dashboard')).toContainText('Facturado hoy');
      expect(await contextoEnSesion(page)).toBeNull();
      expect(cabeceras.length).toBeGreaterThan(0);
      expect(new Set(cabeceras)).toEqual(new Set([String(duenoA.comercioId)]));
    });

    test('un Cliente sin comercios no manda el comercio en ninguna llamada y conserva campana, carrito y pedidos', async ({ page }) => {
      const conCabecera: string[] = [];
      const llamadas: string[] = [];
      page.on('request', (r) => {
        if (r.url().includes('/api/v1/')) {
          llamadas.push(new URL(r.url()).pathname);
          if (r.headers()['x-comercio-id'] !== undefined) {
            conCabecera.push(new URL(r.url()).pathname);
          }
        }
      });

      await loginUi(page, clienteSolo.nombreUsuario, clienteSolo.password);
      await page.waitForURL('**/index.html');
      await expect(page.getByTestId('btn-notificaciones')).toBeVisible();
      await page.goto('/pedidos.html');
      await expect(page.getByTestId('btn-nav-pedidos')).toBeVisible();
      await page.goto('/carrito.html');
      await expect(page.getByTestId('btn-nav-carrito')).toBeVisible();
      await page.goto('/perfil.html');
      await expect(page.getByTestId('nombre-cliente-perfil')).not.toBeEmpty();

      expect(conCabecera).toEqual([]);
      expect(llamadas).toContain('/api/v1/notificaciones/no-leidas/contador');
      await expect(page.getByTestId('btn-cambiar-cuenta')).toBeHidden();
    });

    test('un Cliente con comercios que eligió "Cliente" tampoco manda el comercio y ve su campana', async ({ page, request }) => {
      const sesion = await sesionDe(request, empleadoDos.cuenta);
      await abrirComoUsuarioConContexto(page, sesion, { contexto: { tipo: 'CLIENTE' }, ultimoContexto: 'CLIENTE' });
      const conCabecera: string[] = [];
      page.on('request', (r) => {
        if (r.url().includes('/api/v1/') && r.headers()['x-comercio-id'] !== undefined) {
          conCabecera.push(new URL(r.url()).pathname);
        }
      });

      await page.goto('/index.html');
      await expect(page.getByTestId('btn-notificaciones')).toBeVisible();
      await page.goto('/pedidos.html');
      await expect(page.getByTestId('btn-nav-pedidos')).toBeVisible();

      expect(conCabecera).toEqual([]);
      expect(page.url()).toContain('pedidos.html');
    });
  });

  test.describe('Viewport 375 px', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('selector, hoja de cambio de cuenta, panel, pedidos con reembolso y perfil del Empleado entran sin scroll horizontal', async ({ page, request }) => {
      await loginUi(page, empleadoDos.cuenta.nombreUsuario, empleadoDos.cuenta.password);
      await page.waitForURL('**/seleccionar-contexto.html');
      await expect(page.getByTestId('lista-contextos').locator('button')).toHaveCount(3);
      await sinScrollHorizontal(page);
      await capturar(page, 'a-selector');

      await page.getByTestId(`fila-contexto-comercio-${duenoA.comercioId}`).click();
      await page.waitForURL('**/comercio-dashboard.html');
      await expect(page.getByTestId('franja-comercio-insignia-empleado')).toBeVisible();
      await expect(page.getByTestId(`pedido-item-${idsPedido.aceptado}`)).toBeVisible();
      await sinScrollHorizontal(page);
      await capturar(page, 'c-panel');

      await page.goto('/comercio-pedidos.html');
      await expect(page.getByTestId('chip-reembolso-pedido')).toHaveCount(3);
      await sinScrollHorizontal(page);
      await capturar(page, 'd-pedidos-reembolso');

      await page.goto('/comercio-productos.html');
      await expect(page.getByTestId(`producto-item-${productoA}`)).toBeVisible();
      await sinScrollHorizontal(page);

      await page.goto('/comercio-perfil.html');
      await expect(page.getByTestId('empleado-estado')).not.toBeEmpty();
      await sinScrollHorizontal(page);
      await capturar(page, 'e-perfil');

      await page.getByTestId('btn-cambiar-cuenta').click();
      await expect(page.getByTestId('fila-contexto-cliente')).toBeVisible();
      await expect(page.getByTestId('lista-contextos').locator('button')).toHaveCount(3);
      await sinScrollHorizontal(page);
      await capturar(page, 'b-hoja-cambiar-cuenta');
    });
  });
});
