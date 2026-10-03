import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import {
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  registrarYVerificarComercio,
  fijarPasswordAdminYLoguear,
  buscarComercioPendientePorEmail,
  resolverComercio,
  crearCategoria,
  crearProducto,
  aTitleCase,
  agregarItemCarrito,
  crearPedido,
  login,
  marcarAptoVenta,
  confirmarPagoTest,
  sufijoUnico,
  diaDeHoy,
  ADMIN_USUARIO,
  ADMIN_PASSWORD_CONOCIDA,
} from './helpers/backend';

const MYSQL_EXE = 'C:/xampp/mysql/bin/mysql.exe';

const ERROR_FALLIDO = 'Mercado Pago respondio 400: insufficient funds (dato sintetico del spec 20)';

function sql(consulta: string): string {
  return execFileSync(MYSQL_EXE, ['-u', 'root', '--default-character-set=utf8mb4', '-N', '-B', 'bajonea_test', '-e', consulta]).toString().trim();
}

function sembrarPagoYNota(pedidoId: number, estado: 'PENDIENTE_REVISION_MANUAL' | 'FALLIDO', ultimoError: string, intentos: number) {
  sql(
    `INSERT INTO pago (pedido_id, monto, mp_estado, id_transaccion_mp, fecha_confirmacion) ` +
      `SELECT id, total, 'approved', 'sintetico-${pedidoId}', NOW() FROM pedido WHERE id = ${pedidoId};`,
  );
  const salida = sql(
    `INSERT INTO nota_credito (pago_id, monto, motivo, estado, intentos, mp_payment_id, ultimo_error, fecha_emision) ` +
      `SELECT p.id, p.monto, 'RECHAZO_COMERCIO', '${estado}', ${intentos}, p.id_transaccion_mp, '${ultimoError}', NOW() ` +
      `FROM pago p WHERE p.pedido_id = ${pedidoId}; SELECT LAST_INSERT_ID();`,
  );
  return Number(salida.split('\n').pop());
}

function codigoDe(notaId: number): RegExp {
  return new RegExp(`^NC-\\d{4}-${String(notaId).padStart(5, '0')}$`);
}

async function loginAdminUi(page: Page) {
  await page.goto('/login.html');
  await page.getByTestId('input-nombre-usuario').fill(ADMIN_USUARIO);
  await page.getByTestId('input-password').fill(ADMIN_PASSWORD_CONOCIDA);
  await page.getByTestId('btn-ingresar').click();
  await page.waitForURL('**/admin-dashboard.html');
}

test.describe('Revisión manual de reembolsos (Administrador)', () => {
  const pedidoIds: number[] = [];
  const notaIds: number[] = [];
  let notaRevisionManualId: number;
  let notaFallidaId: number;
  let nombreComercio: string;
  let nombreCliente: string;
  let montoPedido: number;

  test.beforeAll(async ({ request }) => {
    const localidadId = await obtenerLocalidadRioGrande(request);
    const adminSesion = await fijarPasswordAdminYLoguear(request);
    const categoriaId = await crearCategoria(request, adminSesion.token, `Categoría Reembolsos E2E ${sufijoUnico()}`);

    nombreComercio = `Comercio Reembolsos E2E ${sufijoUnico()}`;
    const comercio = await registrarYVerificarComercio(request, localidadId, {
      nombre: nombreComercio,
      horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
      aceptaDelivery: false,
      aceptaRetiro: true,
    });
    const pendiente = await buscarComercioPendientePorEmail(request, adminSesion.token, comercio.email);
    await resolverComercio(request, adminSesion.token, pendiente.id, true);
    await marcarAptoVenta(request, pendiente.id);
    const comercioSesion = await login(request, comercio.nombreUsuario, comercio.password);
    const precio = 3300;
    const productoId = await crearProducto(request, comercioSesion.token, {
      nombre: `Producto Reembolsos E2E ${sufijoUnico()}`,
      precio,
      categoriaId,
    });

    const cliente = await registrarYVerificarCliente(request, localidadId);
    nombreCliente = `${cliente.nombre} ${cliente.apellido}`;
    const clienteSesion = await login(request, cliente.nombreUsuario, cliente.password);

    for (let i = 0; i < 2; i += 1) {
      await agregarItemCarrito(request, clienteSesion.token, productoId, 1);
      const pedidoId = await crearPedido(request, clienteSesion.token, 'RETIRO');
      await confirmarPagoTest(request, pedidoId);
      pedidoIds.push(pedidoId);
    }
    montoPedido = Number(sql(`SELECT total FROM pedido WHERE id = ${pedidoIds[0]};`));

    notaRevisionManualId = sembrarPagoYNota(
      pedidoIds[0],
      'PENDIENTE_REVISION_MANUAL',
      'La cuenta de Mercado Pago del comercio esta desvinculada: el reembolso no se intento automaticamente (dato sintetico)',
      0,
    );
    notaFallidaId = sembrarPagoYNota(pedidoIds[1], 'FALLIDO', ERROR_FALLIDO, 1);
    notaIds.push(notaRevisionManualId, notaFallidaId);
  });

  test.afterAll(() => {
    if (notaIds.length > 0) {
      sql(`DELETE FROM nota_credito WHERE id IN (${notaIds.join(',')});`);
    }
    if (pedidoIds.length > 0) {
      sql(`DELETE FROM pago WHERE pedido_id IN (${pedidoIds.join(',')}) AND id_transaccion_mp LIKE 'sintetico-%';`);
    }
  });

  test('listado: se llega desde el dashboard, cada fila muestra lo necesario para decidir y los chips filtran por estado', async ({ page }) => {
    await loginAdminUi(page);
    await page.getByTestId('tile-gestion-reembolsos').click();
    await page.waitForURL('**/admin-reembolsos.html');

    const filaManual = page.getByTestId(`reembolso-item-${notaRevisionManualId}`);
    const filaFallida = page.getByTestId(`reembolso-item-${notaFallidaId}`);
    await expect(filaManual).toBeVisible();
    await expect(filaFallida).toBeVisible();

    await expect(filaManual.getByTestId('codigo-reembolso')).toHaveText(codigoDe(notaRevisionManualId));
    await expect(filaManual.getByTestId('estado-reembolso')).toHaveText('Revisión manual');
    await expect(filaManual).toContainText(`#${pedidoIds[0]}`);
    await expect(filaManual).toContainText(nombreCliente);
    await expect(filaManual).toContainText(aTitleCase(nombreComercio));
    await expect(filaManual).toContainText(`$${montoPedido.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`);
    await expect(filaManual).toContainText('Rechazo del comercio');
    await expect(filaManual.getByTestId('error-reembolso')).toContainText('desvinculada');

    await expect(filaFallida.getByTestId('estado-reembolso')).toHaveText('Fallido');
    await expect(filaFallida.getByTestId('error-reembolso')).toHaveText(ERROR_FALLIDO);

    await page.getByTestId('chip-filtro-fallido').click();
    await expect(filaFallida).toBeVisible();
    await expect(filaManual).toHaveCount(0);

    await page.getByTestId('chip-filtro-pendiente_revision_manual').click();
    await expect(filaManual).toBeVisible();
    await expect(filaFallida).toHaveCount(0);

    await page.getByTestId('chip-filtro-todos').click();
    await expect(filaManual).toBeVisible();
    await expect(filaFallida).toBeVisible();
  });

  test('reintento con la cuenta del comercio todavía desvinculada: lo informa en la fila y no toca la nota', async ({ page }) => {
    await loginAdminUi(page);
    await page.goto('/admin-reembolsos.html');

    const fila = page.getByTestId(`reembolso-item-${notaRevisionManualId}`);
    const respuesta = page.waitForResponse(
      (res) => res.url().endsWith(`/administrador/reembolsos/${notaRevisionManualId}/reintentar`) && res.request().method() === 'POST',
    );
    await fila.getByTestId('btn-reintentar-reembolso').click();
    expect((await respuesta).status()).toBe(409);

    await expect(fila.getByTestId('aviso-reembolso')).toBeVisible();
    await expect(fila.getByTestId('aviso-reembolso')).toContainText('sigue desvinculada');
    await expect(fila.getByTestId('btn-reintentar-reembolso')).toBeEnabled();
    await expect(fila.getByTestId('estado-reembolso')).toHaveText('Revisión manual');

    expect(sql(`SELECT estado, intentos FROM nota_credito WHERE id = ${notaRevisionManualId};`)).toBe('PENDIENTE_REVISION_MANUAL\t0');
  });

  test('reintento exitoso (respuesta de Mercado Pago simulada): la fila sale del listado', async ({ page }) => {
    let procesadaId: number | null = null;

    await page.route(`**/administrador/reembolsos/${notaFallidaId}/reintentar`, async (route) => {
      procesadaId = notaFallidaId;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          mensaje: 'Reembolso procesado correctamente',
          data: {
            id: notaFallidaId,
            codigo: `NC-2026-${String(notaFallidaId).padStart(5, '0')}`,
            pedidoId: pedidoIds[1],
            nombreCliente,
            nombreComercio,
            monto: montoPedido,
            fechaEmision: new Date().toISOString(),
            motivo: 'RECHAZO_COMERCIO',
            estado: 'PROCESADO',
            ultimoError: null,
            intentos: 2,
          },
        }),
      });
    });
    await page.route('**/administrador/reembolsos', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      const real = await route.fetch();
      const cuerpo = await real.json();
      if (procesadaId !== null) {
        cuerpo.data = cuerpo.data.filter((nota: { id: number }) => nota.id !== procesadaId);
      }
      await route.fulfill({ response: real, json: cuerpo });
    });

    await loginAdminUi(page);
    await page.goto('/admin-reembolsos.html');

    const fila = page.getByTestId(`reembolso-item-${notaFallidaId}`);
    await expect(fila).toBeVisible();
    await fila.getByTestId('btn-reintentar-reembolso').click();

    await expect(page.locator('.toast')).toContainText('Reembolso procesado correctamente');
    await expect(fila).toHaveCount(0);
    await expect(page.getByTestId(`reembolso-item-${notaRevisionManualId}`)).toBeVisible();
  });
});
