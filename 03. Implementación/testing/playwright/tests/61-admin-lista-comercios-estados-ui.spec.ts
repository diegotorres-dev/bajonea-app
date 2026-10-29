import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  apiConHeaders,
  clonarComercioTest,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import { sumarAlEquipo } from './helpers/empleado';
import { abrirComoUsuario, prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { sinScrollHorizontal } from './helpers/layout';

const ESPERA_LISTA = 120_000;

interface EstadoEsperado {
  estado: string;
  etiqueta: string;
  clase: RegExp;
  permiteSuspender: boolean;
}

const ESTADOS: EstadoEsperado[] = [
  { estado: 'PENDIENTE', etiqueta: 'Pendiente', clase: /status-badge--pendiente/, permiteSuspender: false },
  { estado: 'APROBADO', etiqueta: 'Aprobado', clase: /status-badge--exito/, permiteSuspender: true },
  { estado: 'APTO_VENTA', etiqueta: 'Listo para vender', clase: /status-badge--exito/, permiteSuspender: true },
  { estado: 'RECHAZADO', etiqueta: 'Rechazado', clase: /status-badge--error/, permiteSuspender: false },
  { estado: 'RECHAZO_DEFINITIVO', etiqueta: 'Rechazo definitivo', clase: /status-badge--error/, permiteSuspender: false },
  { estado: 'SUSPENDIDO', etiqueta: 'Suspendido', clase: /status-badge--pendiente/, permiteSuspender: false },
  { estado: 'CERRADO_TEMPORALMENTE', etiqueta: 'Cerrado temporalmente', clase: /status-badge--neutro/, permiteSuspender: true },
  { estado: 'INACTIVO', etiqueta: 'Inactivo', clase: /status-badge--neutro/, permiteSuspender: false },
];

test.use({ viewport: { width: 375, height: 812 } });

test.describe('El Administrador ve todos los comercios sin importar el estado (admin-comercios.html)', () => {
  test.describe.configure({ timeout: 300_000 });

  let admin: SesionApi;
  let localidadId: string;
  let dueno: Dueno;

  async function comercioEnEstado(request: APIRequestContext, estado: string): Promise<{ id: number; nombre: string }> {
    const nombre = `Lista Estados ${ESTADOS.findIndex((e) => e.estado === estado) + 1} ${sufijoUnico()}`;
    const id = await clonarComercioTest(request, dueno.comercioId, nombre, estado);
    return { id, nombre };
  }

  async function abrirLista(page: Page) {
    await abrirComoUsuario(page, admin);
    await page.goto('/admin-comercios.html');
  }

  async function agregarMiembro(request: APIRequestContext, comercioId: number): Promise<string> {
    const cuenta = await registrarYVerificarCliente(request, localidadId);
    sql(
      `UPDATE invitacion_empleado SET fecha_creacion = DATE_SUB(fecha_creacion, INTERVAL 2 HOUR) ` +
        `WHERE comercio_id = ${comercioId} AND fecha_creacion > DATE_SUB(NOW(), INTERVAL 1 HOUR);`,
    );
    await sumarAlEquipo(request, comercioId, cuenta, dueno.token);
    const sesion = await login(request, cuenta.nombreUsuario, cuenta.password);
    return String(sesion.usuario.id);
  }

  test.beforeAll(async ({ request }) => {
    admin = await fijarPasswordAdminYLoguear(request);
    localidadId = await obtenerLocalidadRioGrande(request);
    dueno = await prepararAprobado(request, admin.token, localidadId);
  });

  for (const esperado of ESTADOS) {
    test(`un comercio ${esperado.estado} aparece con su etiqueta, tiene Ver equipo y ${esperado.permiteSuspender ? 'permite' : 'no ofrece'} Suspender`, async ({ page, request }) => {
      const comercio = await comercioEnEstado(request, esperado.estado);
      await abrirLista(page);

      const fila = page.getByTestId(`comercio-admin-item-${comercio.id}`);
      await expect(fila).toBeVisible({ timeout: ESPERA_LISTA });
      await expect(fila).toContainText(comercio.nombre);
      const etiqueta = page.getByTestId(`estado-comercio-${comercio.id}`);
      await expect(etiqueta).toHaveText(esperado.etiqueta);
      await expect(etiqueta).toHaveAttribute('data-estado', esperado.estado);
      await expect(etiqueta).toHaveClass(esperado.clase);

      await page.getByTestId(`btn-ver-detalle-comercio-${comercio.id}`).click();
      await expect(page.getByTestId('modal-detalle-comercio')).toBeVisible();
      await expect(page.getByTestId('btn-ver-equipo-comercio')).toBeVisible();
      await expect(page.getByTestId('btn-cerrar-modal-detalle-comercio')).toBeVisible();
      await expect(page.getByTestId('btn-suspender-comercio')).toHaveCount(esperado.permiteSuspender ? 1 : 0);

      await page.getByTestId('btn-ver-equipo-comercio').click();
      await page.waitForURL(`**/admin-comercio-equipo.html?id=${comercio.id}`);
      await expect(page.getByTestId('titulo-equipo')).toBeVisible();
      await expect(page.getByTestId('equipo-comercio-nombre')).toHaveText(comercio.nombre);
    });
  }

  test('un comercio con cierre manual (sigue APTO_VENTA) aparece y su equipo se abre con sus miembros', async ({ page, request }) => {
    const comercio = await comercioEnEstado(request, 'APTO_VENTA');
    sql(`UPDATE comercio SET cerrado_manualmente = 1 WHERE id = ${comercio.id};`);
    const miembroId = await agregarMiembro(request, comercio.id);
    await abrirLista(page);

    await expect(page.getByTestId(`estado-comercio-${comercio.id}`)).toHaveText('Listo para vender', { timeout: ESPERA_LISTA });
    await page.getByTestId(`btn-ver-detalle-comercio-${comercio.id}`).click();
    await expect(page.getByTestId('resumen-equipo-comercio')).toContainText('1 activo · 0 inactivos');
    await page.getByTestId('btn-ver-equipo-comercio').click();
    await page.waitForURL(`**/admin-comercio-equipo.html?id=${comercio.id}`);
    await expect(page.getByTestId(`equipo-miembro-${miembroId}`)).toBeVisible();
  });

  test('un comercio cerrado temporalmente (cuenta del Dueño bloqueada) aparece y su equipo se abre con sus miembros', async ({ page, request }) => {
    const comercio = await comercioEnEstado(request, 'APTO_VENTA');
    const miembroId = await agregarMiembro(request, comercio.id);
    sql(`UPDATE comercio SET estado = 'CERRADO_TEMPORALMENTE' WHERE id = ${comercio.id};`);
    await abrirLista(page);

    await expect(page.getByTestId(`estado-comercio-${comercio.id}`)).toHaveText('Cerrado temporalmente', { timeout: ESPERA_LISTA });
    await page.getByTestId(`btn-ver-detalle-comercio-${comercio.id}`).click();
    await expect(page.getByTestId('resumen-equipo-comercio')).toContainText('1 activo · 0 inactivos');
    await page.getByTestId('btn-ver-equipo-comercio').click();
    await page.waitForURL(`**/admin-comercio-equipo.html?id=${comercio.id}`);
    await expect(page.getByTestId(`equipo-miembro-${miembroId}`)).toBeVisible();
    await expect(page.getByTestId('chip-miembros-activos')).toHaveText('Activos 1');
  });

  test('la lista trae los ocho estados a la vez, la cuenta coincide con la base y entra en 375 px', async ({ page, request }) => {
    const creados = [];
    for (const esperado of ESTADOS) {
      creados.push({ ...(await comercioEnEstado(request, esperado.estado)), estado: esperado.estado });
    }
    const { status, body } = await apiConHeaders(request, 'GET', '/administrador/comercios', admin.token);
    expect(status).toBe(200);
    const lista = body.data as any[];
    for (const creado of creados) {
      expect(lista.find((c) => c.id === creado.id)?.estado, creado.estado).toBe(creado.estado);
    }
    const enLaBase = Number(sql('SELECT COUNT(*) FROM comercio;'));
    expect(lista.length).toBeGreaterThanOrEqual(enLaBase);

    await abrirLista(page);
    for (const creado of creados) {
      await expect(page.getByTestId(`comercio-admin-item-${creado.id}`)).toBeVisible({ timeout: ESPERA_LISTA });
    }
    await sinScrollHorizontal(page);
  });

  test('las pantallas de solicitudes siguen mostrando solo los pendientes', async ({ request }) => {
    const pendiente = await comercioEnEstado(request, 'PENDIENTE');
    const rechazado = await comercioEnEstado(request, 'RECHAZADO');
    const aprobado = await comercioEnEstado(request, 'APROBADO');

    const { status, body } = await apiConHeaders(request, 'GET', '/administrador/comercios/pendientes', admin.token);
    expect(status).toBe(200);
    const ids = (body.data as any[]).map((c) => c.id);
    expect(ids).toContain(pendiente.id);
    expect(ids).not.toContain(rechazado.id);
    expect(ids).not.toContain(aprobado.id);
    for (const c of body.data as any[]) {
      expect(c.estado).toBe('PENDIENTE');
    }
  });
});
