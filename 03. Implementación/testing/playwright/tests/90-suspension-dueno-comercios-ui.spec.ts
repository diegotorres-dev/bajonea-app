import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  agregarItemCarrito,
  apiConHeaders,
  apiPut,
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
  suspenderComercio,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import { abrirComoUsuario, agregarComercioApto, prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { abrirComoUsuarioConContexto, ponerEstadoComercio, sumarAlEquipo } from './helpers/empleado';
import { abrirComoUsuarioConComercio } from './helpers/selector';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

const CARPETA_CAPTURAS = path.resolve(__dirname, '../../../docs/capturas-suspension-dueno');
const MOTIVO_DUENO = 'Se suspende la cuenta por reiteradas quejas de clientes';
const MOTIVO_APARTE = 'Pedidos sin entregar durante dos semanas seguidas';
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];

async function captura(page: Page, nombre: string) {
  fs.mkdirSync(CARPETA_CAPTURAS, { recursive: true });
  await page.screenshot({ path: path.join(CARPETA_CAPTURAS, `${nombre}.png`) });
}

test.describe('Fase 5, S3 (UI B): comercios suspendidos con su Dueño, equipo y textos', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminSesion: SesionApi;
  let localidadId: string;
  let categoriaId: number;
  let comprador: SesionApi;

  const estadoUsuario = (id: number): string => sql(`SELECT estado FROM usuario WHERE id = ${id};`);
  const estadoComercio = (id: number): string => sql(`SELECT estado FROM comercio WHERE id = ${id};`);
  const origenComercio = (id: number): string => sql(`SELECT IFNULL(suspension_origen, 'NULL') FROM comercio WHERE id = ${id};`);

  const nuevoDueno = (request: APIRequestContext): Promise<Dueno> =>
    prepararAprobado(request, adminSesion.token, localidadId, true, todoElDia());

  async function suspenderDuenoPorApi(request: APIRequestContext, dueno: Dueno) {
    const { status, body } = await apiPut(request, `/administrador/duenos/${dueno.duenoId}/suspender`, { motivo: MOTIVO_DUENO }, adminSesion.token);
    expect(status, JSON.stringify(body)).toBe(200);
  }

  async function levantarDuenoPorApi(request: APIRequestContext, dueno: Dueno) {
    const { status, body } = await apiPut(request, `/administrador/duenos/${dueno.duenoId}/levantar-suspension`, {}, adminSesion.token);
    expect(status, JSON.stringify(body)).toBe(200);
  }

  async function abrirDetalle(page: Page, comercioId: number) {
    await abrirComoUsuario(page, adminSesion);
    await page.goto('/admin-comercios.html');
    const verDetalle = page.getByTestId(`btn-ver-detalle-comercio-${comercioId}`);
    await expect(verDetalle).toBeVisible();
    await verDetalle.click();
    await expect(page.getByTestId('modal-detalle-comercio')).toBeVisible();
  }

  async function pedidoPreparacion(request: APIRequestContext, dueno: Dueno, productoId: number): Promise<number> {
    await apiConHeaders(request, 'DELETE', '/carrito', comprador.token);
    await agregarItemCarrito(request, comprador.token, productoId, 1);
    const pedidoId = await crearPedido(request, comprador.token, 'RETIRO', null);
    await confirmarPagoTest(request, pedidoId, true);
    const aceptado = await apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoId}/aceptar`, dueno.token, { 'X-Comercio-Id': String(dueno.comercioId) }, {});
    expect(aceptado.status).toBe(200);
    return pedidoId;
  }

  test.beforeAll(async ({ request }) => {
    adminSesion = await fijarPasswordAdminYLoguear(request);
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminSesion.token, `Cat Suspension Dueno Comercios ${sufijoUnico()}`);
    const registro = await registrarYVerificarCliente(request, localidadId);
    comprador = await login(request, registro.nombreUsuario, registro.password);
  });

  test.describe('Un Dueño con tres comercios, uno suspendido aparte', () => {
    let dueno: Dueno;
    let comercioA: number;
    let comercioB: number;
    let comercioC: number;

    test.beforeAll(async ({ request }) => {
      dueno = await nuevoDueno(request);
      comercioA = dueno.comercioId;
      comercioB = await agregarComercioApto(request, dueno, `Segundo ${sufijoUnico()}`);
      comercioC = await agregarComercioApto(request, dueno, `Tercero ${sufijoUnico()}`);
      await suspenderComercio(request, adminSesion.token, comercioB, MOTIVO_APARTE);
      await suspenderDuenoPorApi(request, dueno);
    });

    test('el comercio suspendido por el Dueño no se levanta solo: explica por qué, lleva al Dueño y ofrece suspenderlo por separado', async ({ page }) => {
      expect(origenComercio(comercioA)).toBe('DUENO');
      expect(origenComercio(comercioB)).toBe('INDIVIDUAL');
      await abrirDetalle(page, comercioA);

      await expect(page.getByTestId('suspension-comercio-estado')).toHaveText('Suspendido');
      await expect(page.getByTestId('suspension-comercio-junto-dueno')).toHaveText('Suspendido junto con el Dueño');
      await expect(page.getByTestId('suspension-comercio-motivo')).toHaveText(MOTIVO_DUENO);
      await expect(page.getByTestId('suspension-comercio-explicacion')).toHaveText(
        'No se puede levantar solo este comercio. Para reactivarlo hay que levantar la suspensión del Dueño.',
      );
      await expect(page.getByTestId('btn-levantar-suspension-comercio')).toBeDisabled();
      await expect(page.getByTestId('aviso-dueno-suspendido')).toHaveCount(0);
      const aparte = page.getByTestId('btn-suspender-solo-comercio');
      await expect(aparte).toHaveText('Suspender solo este comercio');
      await expect(page.getByTestId('suspension-comercio-aparte-ayuda')).toHaveText(
        'Va a seguir suspendido aunque levanten la suspensión del Dueño. Después lo vas a poder levantar desde acá.',
      );
      await captura(page, '05-comercio-suspendido-por-el-dueno');
      await sinScrollHorizontal(page);

      await page.getByTestId('enlace-ir-al-dueno').click();
      await page.waitForURL(`**/admin-duenos.html?id=${dueno.duenoId}`);
      await expect(page.getByTestId('dueno-destacado-aviso')).toContainText('Mostrando a ');
      await expect(page.getByTestId(`dueno-item-${dueno.duenoId}`)).toHaveClass(/cliente-admin-row--destacada/);
      await expect(page.locator('[data-testid^="dueno-item-"]')).toHaveCount(1);
      await expect(page.getByTestId(`dueno-item-${dueno.duenoId}`).getByTestId('estado-dueno')).toHaveText('Suspendido');
      await page.getByTestId('btn-ver-todos-duenos').click();
      await expect(page.getByTestId('dueno-destacado-aviso')).toHaveCount(0);
      expect(page.url()).not.toContain('id=');
      expect(await page.locator('[data-testid^="dueno-item-"]').count()).toBeGreaterThan(1);
    });

    test('un comercio suspendido por separado, con el Dueño suspendido, no se puede levantar hasta levantar al Dueño', async ({ page }) => {
      await abrirDetalle(page, comercioB);

      await expect(page.getByTestId('suspension-comercio-motivo')).toHaveText(MOTIVO_APARTE);
      await expect(page.getByTestId('suspension-comercio-desde')).toContainText('desde ');
      await expect(page.getByTestId('suspension-comercio-junto-dueno')).toHaveCount(0);
      await expect(page.getByTestId('aviso-dueno-suspendido')).toContainText(
        'El Dueño tiene la cuenta suspendida. Primero levantá la suspensión del Dueño; después podés levantar este comercio.',
      );
      await expect(page.getByTestId('enlace-ir-al-dueno')).toHaveAttribute('href', `admin-duenos.html?id=${dueno.duenoId}`);
      await expect(page.getByTestId('btn-levantar-suspension-comercio')).toBeDisabled();
      await expect(page.getByTestId('btn-suspender-solo-comercio')).toHaveCount(0);
      await captura(page, '06-comercio-suspendido-aparte-con-el-dueno-suspendido');
      await sinScrollHorizontal(page);
    });

    test('"Suspender solo este comercio" convierte la suspensión en propia y el comercio sigue suspendido aunque levanten al Dueño', async ({ page }) => {
      const desdeAntes = sql(`SELECT suspendido_desde FROM comercio WHERE id = ${comercioA};`);
      await abrirDetalle(page, comercioA);
      await page.getByTestId('btn-suspender-solo-comercio').click();
      const hoja = page.getByTestId('modal-suspender-comercio');
      await expect(hoja).toBeVisible();
      await expect(page.getByTestId('modal-suspender-comercio-titulo')).toHaveText('Suspender solo este comercio');
      await expect(page.getByTestId('suspender-comercio-que-va-a-pasar')).toContainText('Va a seguir suspendido aunque levanten la suspensión del Dueño.');
      await expect(page.getByTestId('suspender-comercio-previa-cargando')).toHaveCount(0);
      await expect(page.getByTestId('btn-confirmar-suspender-comercio')).toBeDisabled();
      await page.getByTestId('btn-cancelar-suspender-comercio').click();
      await expect(hoja).toHaveCount(0);
      await expect(page.getByTestId('btn-suspender-solo-comercio')).toBeFocused();
      expect(origenComercio(comercioA)).toBe('DUENO');

      await page.getByTestId('btn-suspender-solo-comercio').click();
      await page.getByTestId('input-suspender-comercio-motivo').fill(MOTIVO_APARTE);
      await page.getByTestId('btn-confirmar-suspender-comercio').dblclick();
      await expect(page.locator('.toast')).toContainText('Comercio suspendido');
      await expect(page.getByTestId(`estado-comercio-${comercioA}`)).toHaveText('Suspendido');
      expect(origenComercio(comercioA)).toBe('INDIVIDUAL');
      expect(sql(`SELECT motivo_suspension FROM comercio WHERE id = ${comercioA};`)).toBe(MOTIVO_APARTE);
      expect(sql(`SELECT suspendido_desde FROM comercio WHERE id = ${comercioA};`)).toBe(desdeAntes);
      expect(Number(sql(`SELECT COUNT(*) FROM historial_estado_comercio WHERE comercio_id = ${comercioA} AND estado_destino = 'SUSPENDIDO';`))).toBe(2);

      await reabrirDetalle(page, comercioA);
      await expect(page.getByTestId('aviso-dueno-suspendido')).toBeVisible();
      await expect(page.getByTestId('btn-levantar-suspension-comercio')).toBeDisabled();
    });

    test('al levantar al Dueño, la hoja lista qué comercio vuelve y cuáles siguen suspendidos por separado, y el resultado coincide', async ({ page }) => {
      await abrirComoUsuario(page, adminSesion);
      await page.goto('/admin-duenos.html');
      await page.getByTestId('input-buscar-dueno').fill(dueno.email);
      await page.getByTestId(`btn-acciones-dueno-${dueno.duenoId}`).click();
      await page.getByTestId('accion-levantar-dueno').click();
      await expect(page.getByTestId('modal-levantar-dueno')).toBeVisible();

      await expect(page.getByTestId('levantar-dueno-vuelven')).toContainText('Se restablecen 1 de 3 comercios');
      await expect(page.getByTestId(`vuelve-comercio-${comercioC}`)).toContainText('Vuelve');
      for (const id of [comercioA, comercioB]) {
        const caja = page.getByTestId(`sigue-comercio-${id}`);
        await expect(caja).toContainText('Sigue suspendido');
        await expect(caja).toContainText('Se suspendió aparte. Después de levantar al Dueño, lo levantás desde su ficha.');
      }
      await captura(page, '10-hoja-levantar-con-comercios-que-siguen');
      await sinScrollHorizontal(page);

      await page.getByTestId('btn-confirmar-levantar-dueno').click();
      await expect(page.locator('.toast').last()).toContainText('Suspensión levantada');
      expect(estadoUsuario(dueno.duenoId)).toBe('ACTIVO');
      expect(estadoComercio(comercioC)).toBe('APTO_VENTA');
      expect(estadoComercio(comercioA)).toBe('SUSPENDIDO');
      expect(estadoComercio(comercioB)).toBe('SUSPENDIDO');
    });

    test('con el Dueño activo, el comercio suspendido por separado ya se puede levantar desde su ficha', async ({ page }) => {
      await abrirDetalle(page, comercioA);
      await expect(page.getByTestId('aviso-dueno-suspendido')).toHaveCount(0);
      await expect(page.getByTestId('btn-levantar-suspension-comercio')).toBeEnabled();
      await page.getByTestId('btn-levantar-suspension-comercio').click();
      await page.getByTestId('btn-confirmar-levantar-comercio').click();
      await expect(page.locator('.toast').last()).toContainText('Suspensión levantada');
      expect(estadoComercio(comercioA)).toBe('APTO_VENTA');
    });

    async function reabrirDetalle(page: Page, comercioId: number) {
      await page.getByTestId(`btn-ver-detalle-comercio-${comercioId}`).click();
      await expect(page.getByTestId('modal-detalle-comercio')).toBeVisible();
    }
  });

  test.describe('Cruce de roles', () => {
    test('con Empleados activos, el Empleado ve el aviso sin motivo y resuelve los pedidos; el Dueño suspendido no puede ingresar', async ({ page, request }) => {
      const dueno = await nuevoDueno(request);
      const producto = await crearProducto(request, dueno.token, { nombre: `Producto cruce ${sufijoUnico()}`, precio: 4200, categoriaId });
      const registro = await registrarYVerificarCliente(request, localidadId);
      await sumarAlEquipo(request, dueno.comercioId, registro, dueno.token);
      const empleado = await login(request, registro.nombreUsuario, registro.password);
      const enPreparacion = await pedidoPreparacion(request, dueno, producto);
      const aDespachar = await pedidoPreparacion(request, dueno, producto);

      await suspenderDuenoPorApi(request, dueno);
      expect(estadoComercio(dueno.comercioId)).toBe('SUSPENDIDO');
      expect(sql(`SELECT estado FROM pedido WHERE id = ${enPreparacion};`)).toBe('EN_PREPARACION');

      await abrirComoUsuarioConContexto(page, empleado, {
        contexto: { tipo: 'EMPLEADO', comercioId: dueno.comercioId },
        ultimoContexto: `EMPLEADO:${dueno.comercioId}`,
      });
      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId('tarjeta-comercio-suspendido')).toBeVisible();
      await expect(page.getByTestId('titulo-comercio-suspendido')).toHaveText('Este comercio está suspendido');
      await expect(page.getByTestId('motivo-comercio-suspendido')).toHaveCount(0);
      await expect(page.getByText(MOTIVO_DUENO)).toHaveCount(0);
      await expect(page.getByText(/soporte/i)).toHaveCount(0);

      const cabecera = { 'X-Comercio-Id': String(dueno.comercioId) };
      expect((await apiConHeaders(request, 'PUT', `/pedidos/comercio/${aDespachar}/despachar`, empleado.token, cabecera, {})).status).toBe(200);
      expect((await apiConHeaders(request, 'PUT', `/pedidos/comercio/${aDespachar}/entregar`, empleado.token, cabecera, {})).status).toBe(200);
      expect(sql(`SELECT estado FROM pedido WHERE id = ${aDespachar};`)).toBe('ENTREGADO');

      const intento = await apiConHeaders(request, 'POST', '/auth/login', undefined, {}, { nombreUsuario: dueno.nombreUsuario, password: dueno.password });
      expect(intento.status).toBe(409);
      expect(intento.body.data.codigo).toBe('CUENTA_SUSPENDIDA');
    });

    test('un pedido anulado por falta de atención se ve claro para el Dueño y para el Empleado, sin nombres internos', async ({ page, request }) => {
      const dueno = await nuevoDueno(request);
      const producto = await crearProducto(request, dueno.token, { nombre: `Producto anulado ${sufijoUnico()}`, precio: 4200, categoriaId });
      const pedidoId = await pedidoPreparacion(request, dueno, producto);
      await suspenderDuenoPorApi(request, dueno);
      expect(sql(`SELECT estado FROM pedido WHERE id = ${pedidoId};`)).toBe('ANULADO');
      expect(sql(`SELECT cancelado_por FROM pedido WHERE id = ${pedidoId};`)).toBe('SISTEMA');
      await levantarDuenoPorApi(request, dueno);

      const sesionDueno = await login(request, dueno.nombreUsuario, dueno.password);
      const registro = await registrarYVerificarCliente(request, localidadId);
      await sumarAlEquipo(request, dueno.comercioId, registro, sesionDueno.token);
      const empleado = await login(request, registro.nombreUsuario, registro.password);

      await abrirComoUsuarioConComercio(page, sesionDueno, { comercioActivoId: dueno.comercioId, ultimoComercioId: dueno.comercioId });
      await page.goto('/comercio-pedidos.html');
      const fila = page.getByTestId(`pedido-item-${pedidoId}`);
      await expect(fila).toBeVisible();
      await expect(fila.getByTestId('estado-pedido')).toHaveText('Anulado');
      await fila.click();
      await expect(page.getByText('Este pedido se anuló automáticamente.')).toBeVisible();
      await expect(page.getByText('Anulaste este pedido.')).toHaveCount(0);
      await expect(page.getByText(/ANULADO|SISTEMA|SUSPENSION_COMERCIO|CANCELADO_POR_SISTEMA/)).toHaveCount(0);
      await captura(page, '11-dueno-detalle-pedido-anulado-por-el-sistema');
      await sinScrollHorizontal(page);

      const paginaEmpleado = await page.context().newPage();
      await abrirComoUsuarioConContexto(paginaEmpleado, empleado, {
        contexto: { tipo: 'EMPLEADO', comercioId: dueno.comercioId },
        ultimoContexto: `EMPLEADO:${dueno.comercioId}`,
      });
      await paginaEmpleado.goto('/comercio-pedidos.html');
      await paginaEmpleado.getByTestId(`pedido-item-${pedidoId}`).click();
      await expect(paginaEmpleado.getByText('Este pedido se anuló automáticamente.')).toBeVisible();
      await expect(paginaEmpleado.getByText('El comercio anuló este pedido.')).toHaveCount(0);
      await expect(paginaEmpleado.getByText(/ANULADO|SISTEMA|SUSPENSION_COMERCIO/)).toHaveCount(0);
      await paginaEmpleado.close();
    });
  });

  test.describe('Equipo y selector del Empleado', () => {
    test('en el equipo, el Empleado con la cuenta suspendida lleva la etiqueta y la fila atenuada, sin mostrar el motivo', async ({ page, request }) => {
      const dueno = await nuevoDueno(request);
      const activo = await registrarYVerificarCliente(request, localidadId);
      const suspendida = await registrarYVerificarCliente(request, localidadId);
      await sumarAlEquipo(request, dueno.comercioId, activo, dueno.token);
      await sumarAlEquipo(request, dueno.comercioId, suspendida, dueno.token);
      const idSuspendida = Number(sql(`SELECT id FROM usuario WHERE email = '${suspendida.email}';`));
      const idActivo = Number(sql(`SELECT id FROM usuario WHERE email = '${activo.email}';`));
      const { status } = await apiPut(request, `/administrador/clientes/${idSuspendida}/suspender`, { motivo: 'Uso indebido de la cuenta del comercio' }, adminSesion.token);
      expect(status).toBe(200);

      await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: dueno.comercioId, ultimoComercioId: dueno.comercioId });
      await page.goto('/comercio-perfil.html');
      await page.getByTestId('btn-ver-equipo').click();
      const fila = page.getByTestId(`equipo-miembro-${idSuspendida}`);
      await expect(fila).toBeVisible();
      await expect(fila.getByTestId('equipo-cuenta-suspendida')).toHaveText('Cuenta suspendida');
      await expect(fila).toHaveClass(/equipo-fila--suspendida/);
      await expect(page.getByTestId(`equipo-miembro-${idActivo}`).getByTestId('equipo-cuenta-suspendida')).toHaveCount(0);
      await expect(page.getByText('Uso indebido de la cuenta del comercio')).toHaveCount(0);
      await captura(page, '12-equipo-cuenta-suspendida');
      await sinScrollHorizontal(page);
    });

    test('con el comercio cerrado temporalmente, el selector del Empleado dice lo que realmente puede hacer', async ({ page, request }) => {
      const dueno = await nuevoDueno(request);
      const registro = await registrarYVerificarCliente(request, localidadId);
      await sumarAlEquipo(request, dueno.comercioId, registro, dueno.token);
      const empleado = await login(request, registro.nombreUsuario, registro.password);
      ponerEstadoComercio(dueno.comercioId, 'CERRADO_TEMPORALMENTE');

      await abrirComoUsuario(page, empleado);
      await page.goto('/seleccionar-contexto.html');
      await expect(page.getByText('Cerrado temporalmente').first()).toBeVisible();
      await expect(page.getByText('No se aceptan pedidos nuevos.')).toBeVisible();
      await expect(page.getByText('Solo podés consultarlo')).toHaveCount(0);
      await captura(page, '13-selector-empleado-comercio-cerrado');
      await sinScrollHorizontal(page);

      ponerEstadoComercio(dueno.comercioId, 'SUSPENDIDO');
      await page.reload();
      await expect(page.getByText('Comercio suspendido. Solo podés resolver pedidos en curso.')).toBeVisible();
    });
  });
});
