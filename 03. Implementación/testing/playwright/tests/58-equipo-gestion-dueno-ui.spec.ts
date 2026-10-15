import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  apiConHeaders,
  clonarComercioTest,
  fijarPasswordAdminYLoguear,
  invitarEmpleado,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { ClienteRegistrado, SesionApi } from './helpers/backend';
import { abrirComoUsuarioConContexto, atajoEstadoRelacion, ponerEstadoComercio, sumarAlEquipo } from './helpers/empleado';
import { abrirComoUsuarioConComercio } from './helpers/selector';
import { prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { sinScrollHorizontal } from './helpers/layout';

const HEADER = 'X-Comercio-Id';
const ROJO = 'rgb(217, 48, 37)';
const BLANCO = 'rgb(255, 255, 255)';
const OSCURO = 'rgb(26, 26, 26)';
const NOMBRE = 'Clienta Playwright';

interface Miembro {
  cuenta: ClienteRegistrado;
  id: number;
  sesion: SesionApi;
}

async function capturar(page: Page, nombre: string) {
  if (process.env.CAPTURAS) {
    await page.screenshot({ path: `tmp-capturas/e4b1-${process.env.CAPTURAS}-${nombre}.png` });
  }
}

test.use({ viewport: { width: 375, height: 812 } });

test.describe('Equipo del Dueño en pantalla, E4 entrega B1', () => {
  test.describe.configure({ timeout: 240_000 });

  let adminToken: string;
  let localidadId: string;
  let dueno: Dueno;

  const cabecera = (comercioId: number) => ({ [HEADER]: String(comercioId) });
  const putEquipo = (request: APIRequestContext, comercioId: number, miembroId: number, accion: 'desactivar' | 'reactivar') =>
    apiConHeaders(request, 'PUT', `/comercios/equipo/miembros/${miembroId}/${accion}`, dueno.token, cabecera(comercioId));
  const estadoRelacion = (miembroId: number, comercioId: number): string =>
    sql(`SELECT estado FROM empleado_comercio WHERE empleado_id = ${miembroId} AND comercio_id = ${comercioId};`);
  const motivos = (miembroId: number, comercioId: number): string[] =>
    sql(
      `SELECT h.motivo FROM historial_empleado_comercio h JOIN empleado_comercio r ON r.id = h.empleado_comercio_id ` +
        `WHERE r.empleado_id = ${miembroId} AND r.comercio_id = ${comercioId} ORDER BY h.id;`,
    )
      .split(/\r?\n/)
      .filter(Boolean);

  const filaMiembro = (page: Page, email: string) => page.locator('[data-testid^="equipo-miembro-"]', { hasText: email });
  const menuDe = (page: Page, miembro: Miembro) => page.getByTestId(`btn-menu-miembro-${miembro.id}`);
  const toast = (page: Page) => page.locator('.toast');

  async function comercioNuevo(request: APIRequestContext): Promise<{ id: number; nombre: string }> {
    const nombre = `Equipo B1 ${sufijoUnico()}`;
    const id = await clonarComercioTest(request, dueno.comercioId, nombre, 'APROBADO');
    return { id, nombre };
  }

  async function nuevoMiembro(request: APIRequestContext, comercioId: number, email?: string): Promise<Miembro> {
    const cuenta = await registrarYVerificarCliente(request, localidadId, email ? { email } : {});
    sql(
      `UPDATE invitacion_empleado SET fecha_creacion = DATE_SUB(fecha_creacion, INTERVAL 2 HOUR) ` +
        `WHERE comercio_id = ${comercioId} AND fecha_creacion > DATE_SUB(NOW(), INTERVAL 1 HOUR);`,
    );
    await sumarAlEquipo(request, comercioId, cuenta, dueno.token);
    const sesion = await login(request, cuenta.nombreUsuario, cuenta.password);
    return { cuenta, id: sesion.usuario.id, sesion };
  }

  async function miembroInactivo(request: APIRequestContext, comercioId: number, motivo?: 'BAJA_DUENO' | 'RENUNCIA', email?: string): Promise<Miembro> {
    const miembro = await nuevoMiembro(request, comercioId, email);
    const respuesta = await atajoEstadoRelacion(request, comercioId, miembro.id, 'INACTIVO', motivo);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    return miembro;
  }

  async function abrirEquipo(page: Page, comercioId: number) {
    await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: comercioId, ultimoComercioId: comercioId });
    await page.goto('/comercio-perfil.html');
    const entrada = page.getByTestId('btn-ver-equipo');
    await expect(entrada).toBeEnabled();
    await entrada.click();
    await expect(page.getByTestId('titulo-equipo')).toBeVisible();
  }

  async function irAInactivos(page: Page) {
    await page.getByTestId('chip-miembros-inactivos').click();
    await expect(page.getByTestId('chip-miembros-inactivos')).toHaveAttribute('aria-pressed', 'true');
  }

  async function irAActividad(page: Page) {
    const pestana = page.getByTestId('tab-equipo-actividad');
    await pestana.click();
    await expect(pestana).toHaveAttribute('aria-selected', 'true');
  }

  const colorDe = (locator: ReturnType<Page['getByTestId']>, propiedad: 'backgroundColor' | 'color') =>
    locator.evaluate((nodo, p) => getComputedStyle(nodo)[p as 'backgroundColor' | 'color'], propiedad);

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    dueno = await prepararAprobado(request, adminToken, localidadId);
  });

  test.describe('Activos e Inactivos', () => {
    test('los chips cuentan activos e inactivos, Activos es el filtro por defecto y cada inactivo dice su motivo con la fecha', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const activoUno = await nuevoMiembro(request, comercio.id);
      const activoDos = await nuevoMiembro(request, comercio.id);
      const dadoDeBaja = await miembroInactivo(request, comercio.id, 'BAJA_DUENO');
      const renuncio = await miembroInactivo(request, comercio.id, 'RENUNCIA');
      const sinHistorial = await miembroInactivo(request, comercio.id);
      await abrirEquipo(page, comercio.id);

      await expect(page.getByTestId('tab-equipo-equipo')).toHaveText('Mi equipo · 2');
      await expect(page.getByTestId('chip-miembros-activos')).toHaveText('Activos · 2');
      await expect(page.getByTestId('chip-miembros-inactivos')).toHaveText('Inactivos · 3');
      await expect(page.getByTestId('chip-miembros-activos')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('chip-miembros-inactivos')).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('[data-testid^="equipo-miembro-"]')).toHaveCount(2);
      for (const activo of [activoUno, activoDos]) {
        const fila = filaMiembro(page, activo.cuenta.email);
        await expect(fila.getByTestId('equipo-estado')).toHaveText('Activo');
        await expect(fila.locator('.pedido-estado__dot')).toHaveClass(/pedido-estado__dot--positivo/);
        await expect(menuDe(page, activo)).toHaveAttribute('aria-label', `Más acciones de ${NOMBRE}`);
      }
      await expect(page.getByTestId('chip-miembros-activos')).toHaveCSS('background-color', OSCURO);
      await expect(page.getByTestId('chip-miembros-activos')).toHaveCSS('color', BLANCO);
      for (const chip of ['chip-miembros-activos', 'chip-miembros-inactivos']) {
        const caja = await page.getByTestId(chip).boundingBox();
        expect(caja!.height).toBeGreaterThanOrEqual(44);
      }
      await sinScrollHorizontal(page);
      await capturar(page, 'activos');

      await irAInactivos(page);
      await expect(page.locator('[data-testid^="equipo-miembro-"]')).toHaveCount(3);
      await expect(filaMiembro(page, activoUno.cuenta.email)).toHaveCount(0);
      await expect(filaMiembro(page, dadoDeBaja.cuenta.email).getByTestId('equipo-estado')).toHaveText(/^Dado de baja el \d{2}\/\d{2}$/);
      await expect(filaMiembro(page, renuncio.cuenta.email).getByTestId('equipo-estado')).toHaveText(/^Renunció el \d{2}\/\d{2}$/);
      await expect(filaMiembro(page, sinHistorial.cuenta.email).getByTestId('equipo-estado')).toHaveText(/^Inactivo desde el \d{2}\/\d{2}$/);
      await expect(page.getByTestId('chip-miembros-inactivos')).toHaveCSS('background-color', OSCURO);
      await expect(page.getByTestId('tab-equipo-equipo')).toHaveText('Mi equipo · 2');
      await sinScrollHorizontal(page);
      await capturar(page, 'inactivos');
    });

    test('sin inactivos el filtro Inactivos muestra su vacío', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      await nuevoMiembro(request, comercio.id);
      await abrirEquipo(page, comercio.id);
      await expect(page.getByTestId('chip-miembros-inactivos')).toHaveText('Inactivos · 0');
      await irAInactivos(page);
      await expect(page.getByTestId('estado-vacio')).toContainText('No hay miembros inactivos');
      await expect(page.getByTestId('equipo-chips')).toBeVisible();
    });

    test('sin ningún miembro el filtro Activos muestra su vacío y los chips siguen a la vista', async ({ page, request }) => {
      const otro = await comercioNuevo(request);
      await abrirEquipo(page, otro.id);
      await expect(page.getByTestId('chip-miembros-activos')).toHaveText('Activos · 0');
      await expect(page.getByTestId('estado-vacio')).toContainText('Todavía no tenés equipo');
      await expect(page.getByTestId('equipo-chips')).toBeVisible();
    });

    test('con emails largos y en 375 px la lista no tiene scroll horizontal', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const largo = `e.${sufijoUnico()}.${'x'.repeat(34)}@bajonea.test`;
      await nuevoMiembro(request, comercio.id, largo);
      const largoInactivo = `e.${sufijoUnico()}.${'y'.repeat(34)}@bajonea.test`;
      await miembroInactivo(request, comercio.id, 'RENUNCIA', largoInactivo);
      await abrirEquipo(page, comercio.id);
      await expect(filaMiembro(page, largo)).toBeVisible();
      await sinScrollHorizontal(page);
      await irAInactivos(page);
      await expect(filaMiembro(page, largoInactivo)).toBeVisible();
      await sinScrollHorizontal(page);
    });

    test('si el Dueño da de baja a alguien desde otro lado, la lista y los contadores se actualizan sola', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, comercio.id);
      await nuevoMiembro(request, comercio.id);
      await abrirEquipo(page, comercio.id);
      await expect(page.getByTestId('chip-miembros-activos')).toHaveText('Activos · 2');

      const respuesta = await putEquipo(request, comercio.id, miembro.id, 'desactivar');
      expect(respuesta.status).toBe(200);

      await expect(page.getByTestId('chip-miembros-activos')).toHaveText('Activos · 1', { timeout: 40_000 });
      await expect(page.getByTestId('chip-miembros-inactivos')).toHaveText('Inactivos · 1');
      await expect(filaMiembro(page, miembro.cuenta.email)).toHaveCount(0);
    });
  });

  test.describe('Desactivar', () => {
    test('el menú de un activo ofrece solo "Desactivar", en rojo sólido con ícono y texto blancos', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, comercio.id);
      await abrirEquipo(page, comercio.id);

      await menuDe(page, miembro).click();
      await expect(page.getByTestId('menu-miembro-equipo')).toBeVisible();
      await expect(page.getByTestId('menu-miembro-titulo')).toHaveText(NOMBRE);
      const menu = page.getByTestId('menu-miembro-equipo');
      await expect(menu.locator('.profile-link-list button')).toHaveCount(1);
      const desactivar = page.getByTestId('btn-desactivar-miembro');
      await expect(desactivar).toHaveText('Desactivar');
      expect(await colorDe(desactivar, 'backgroundColor')).toBe(ROJO);
      expect(await colorDe(desactivar, 'color')).toBe(BLANCO);
      expect(await desactivar.locator('svg').first().evaluate((nodo) => getComputedStyle(nodo).color)).toBe(BLANCO);
      await capturar(page, 'menu-activo');
      await page.getByTestId('btn-cerrar-menu-miembro').click();
      await expect(menu).toHaveCount(0);
    });

    test('la confirmación es una sola hoja; usa el mismo rojo que el menú; "Volver" no cambia nada', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, comercio.id);
      await abrirEquipo(page, comercio.id);
      const peticiones: string[] = [];
      page.on('request', (peticion) => {
        if (peticion.method() === 'PUT' && peticion.url().includes('/desactivar')) {
          peticiones.push(peticion.url());
        }
      });

      await menuDe(page, miembro).click();
      const colorMenu = await colorDe(page.getByTestId('btn-desactivar-miembro'), 'backgroundColor');
      await page.getByTestId('btn-desactivar-miembro').click();

      const hoja = page.getByTestId('hoja-desactivar-miembro');
      await expect(hoja).toBeVisible();
      await expect(page.getByTestId('menu-miembro-equipo')).toHaveCount(0);
      await expect(page.getByTestId('titulo-desactivar-miembro')).toHaveText(`¿Desactivar a ${NOMBRE}?`);
      await expect(page.getByTestId('texto-desactivar-miembro')).toHaveText(
        `${NOMBRE} va a dejar de tener acceso a ${comercio.nombre} y se le avisa. Si cambiás de idea, la podés reactivar desde Inactivos.`,
      );
      const confirmar = page.getByTestId('btn-confirmar-desactivar-miembro');
      expect(await colorDe(confirmar, 'backgroundColor')).toBe(colorMenu);
      expect(colorMenu).toBe(ROJO);
      await expect(confirmar).toHaveText('Desactivar');
      await expect(page.getByTestId('btn-volver-desactivar-miembro')).toHaveText('Volver');
      expect(peticiones).toHaveLength(0);
      await capturar(page, 'confirmar-desactivar');

      await page.getByTestId('btn-volver-desactivar-miembro').click();
      await expect(hoja).toHaveCount(0);
      expect(peticiones).toHaveLength(0);
      await expect(filaMiembro(page, miembro.cuenta.email)).toBeVisible();
      expect(estadoRelacion(miembro.id, comercio.id)).toBe('ACTIVO');
    });

    test('confirmar da de baja con una sola petición: la hoja se cierra, el miembro sale de Activos, cambian los contadores y hay toast de éxito', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, comercio.id);
      const otro = await nuevoMiembro(request, comercio.id);
      await abrirEquipo(page, comercio.id);
      await expect(page.getByTestId('chip-miembros-activos')).toHaveText('Activos · 2');

      await menuDe(page, miembro).click();
      await page.getByTestId('btn-desactivar-miembro').click();
      const respuesta = page.waitForResponse((r) => r.url().includes(`/miembros/${miembro.id}/desactivar`) && r.request().method() === 'PUT');
      await page.getByTestId('btn-confirmar-desactivar-miembro').click();
      expect((await respuesta).status()).toBe(200);

      await expect(page.getByTestId('hoja-desactivar-miembro')).toHaveCount(0);
      await expect(filaMiembro(page, miembro.cuenta.email)).toHaveCount(0);
      await expect(filaMiembro(page, otro.cuenta.email)).toBeVisible();
      await expect(page.getByTestId('chip-miembros-activos')).toHaveText('Activos · 1');
      await expect(page.getByTestId('chip-miembros-inactivos')).toHaveText('Inactivos · 1');
      await expect(page.getByTestId('tab-equipo-equipo')).toHaveText('Mi equipo · 1');
      await expect(toast(page)).toContainText('Miembro dado de baja');
      expect(estadoRelacion(miembro.id, comercio.id)).toBe('INACTIVO');
      expect(motivos(miembro.id, comercio.id)).toEqual(['ACEPTACION', 'BAJA_DUENO']);

      await irAInactivos(page);
      await expect(filaMiembro(page, miembro.cuenta.email).getByTestId('equipo-estado')).toHaveText(/^Dado de baja el/);
    });

    test('si el servidor falla al desactivar, se cierra la hoja, se avisa con un toast de error y el miembro sigue activo', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, comercio.id);
      await abrirEquipo(page, comercio.id);
      await page.route('**/comercios/equipo/miembros/*/desactivar', (ruta) =>
        ruta.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Error interno', data: null }) }),
      );

      await menuDe(page, miembro).click();
      await page.getByTestId('btn-desactivar-miembro').click();
      await page.getByTestId('btn-confirmar-desactivar-miembro').click();

      await expect(page.getByTestId('hoja-desactivar-miembro')).toHaveCount(0);
      await expect(toast(page)).toContainText('No pudimos desactivar a esta persona. Probá de nuevo.');
      await expect(filaMiembro(page, miembro.cuenta.email)).toBeVisible();
      expect(estadoRelacion(miembro.id, comercio.id)).toBe('ACTIVO');
    });
  });

  test.describe('Menú de un inactivo', () => {
    test('dado de baja por el Dueño: subtítulo con la fecha y "Reactivar" con su leyenda, sin "Invitar de nuevo"', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await miembroInactivo(request, comercio.id, 'BAJA_DUENO');
      await abrirEquipo(page, comercio.id);
      await irAInactivos(page);

      await menuDe(page, miembro).click();
      await expect(page.getByTestId('menu-miembro-titulo')).toHaveText(NOMBRE);
      await expect(page.getByTestId('menu-miembro-subtitulo')).toHaveText(/^Dado de baja el \d{2}\/\d{2}$/);
      await expect(page.getByTestId('menu-miembro-nota')).toHaveCount(0);
      const reactivar = page.getByTestId('btn-reactivar-miembro');
      await expect(reactivar).toContainText('Reactivar');
      await expect(reactivar).toContainText('Vuelve al equipo ahora, sin invitación');
      await expect(page.getByTestId('btn-invitar-de-nuevo')).toHaveCount(0);
      await capturar(page, 'menu-baja');
    });

    test('reactivar vuelve a ACTIVO sin pedir confirmación, con toast de éxito y contadores actualizados', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await miembroInactivo(request, comercio.id, 'BAJA_DUENO');
      await abrirEquipo(page, comercio.id);
      await irAInactivos(page);
      await expect(page.getByTestId('chip-miembros-inactivos')).toHaveText('Inactivos · 1');

      await menuDe(page, miembro).click();
      const respuesta = page.waitForResponse((r) => r.url().includes(`/miembros/${miembro.id}/reactivar`) && r.request().method() === 'PUT');
      await page.getByTestId('btn-reactivar-miembro').click();
      expect((await respuesta).status()).toBe(200);

      await expect(page.getByTestId('menu-miembro-equipo')).toHaveCount(0);
      await expect(page.locator('[data-testid^="hoja-"]')).toHaveCount(0);
      await expect(filaMiembro(page, miembro.cuenta.email)).toHaveCount(0);
      await expect(page.getByTestId('chip-miembros-activos')).toHaveText('Activos · 1');
      await expect(page.getByTestId('chip-miembros-inactivos')).toHaveText('Inactivos · 0');
      await expect(page.getByTestId('tab-equipo-equipo')).toHaveText('Mi equipo · 1');
      await expect(toast(page)).toContainText('Miembro reactivado');
      expect(estadoRelacion(miembro.id, comercio.id)).toBe('ACTIVO');
      expect(motivos(miembro.id, comercio.id)).toEqual(['ACEPTACION', 'BAJA_DUENO', 'REACTIVACION']);

      await page.getByTestId('chip-miembros-activos').click();
      await expect(filaMiembro(page, miembro.cuenta.email).getByTestId('equipo-estado')).toHaveText('Activo');
    });

    test('renunció: nota, "Invitar de nuevo" con su leyenda y ningún "Reactivar"; la acción abre la hoja de invitar con el email precargado', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await miembroInactivo(request, comercio.id, 'RENUNCIA');
      await abrirEquipo(page, comercio.id);
      await irAInactivos(page);

      await menuDe(page, miembro).click();
      await expect(page.getByTestId('menu-miembro-subtitulo')).toHaveText(/^Renunció el \d{2}\/\d{2}$/);
      await expect(page.getByTestId('menu-miembro-nota')).toHaveText(
        'Dejó el equipo por su cuenta. Para que vuelva, tiene que aceptar una invitación nueva.',
      );
      await expect(page.getByTestId('btn-reactivar-miembro')).toHaveCount(0);
      const invitar = page.getByTestId('btn-invitar-de-nuevo');
      await expect(invitar).toContainText('Invitar de nuevo');
      await expect(invitar).toContainText('Le llega un código por email y tiene que aceptar');
      await capturar(page, 'menu-renuncia');

      await invitar.click();
      await expect(page.getByTestId('menu-miembro-equipo')).toHaveCount(0);
      await expect(page.getByTestId('hoja-invitar-equipo')).toBeVisible();
      await expect(page.getByTestId('input-email-invitar')).toHaveValue(miembro.cuenta.email);

      await page.getByTestId('btn-enviar-invitacion').click();
      await expect(page.getByTestId('hoja-invitar-equipo')).toHaveCount(0);
      await expect(page.getByTestId('tab-equipo-solicitudes')).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('[data-testid^="equipo-invitacion-"]', { hasText: miembro.cuenta.email })).toBeVisible();
    });

    test('relación inactiva sin historial: solo "Invitar de nuevo", sin "Reactivar" y sin la nota de renuncia', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await miembroInactivo(request, comercio.id);
      await abrirEquipo(page, comercio.id);
      await irAInactivos(page);

      await menuDe(page, miembro).click();
      await expect(page.getByTestId('menu-miembro-subtitulo')).toHaveText(/^Inactivo desde el \d{2}\/\d{2}$/);
      await expect(page.getByTestId('menu-miembro-nota')).toHaveCount(0);
      await expect(page.getByTestId('btn-reactivar-miembro')).toHaveCount(0);
      await expect(page.getByTestId('btn-invitar-de-nuevo')).toBeVisible();
    });
  });

  test.describe('Errores al reactivar', () => {
    async function abrirReactivar(page: Page, comercioId: number, miembro: Miembro) {
      await abrirEquipo(page, comercioId);
      await irAInactivos(page);
      await menuDe(page, miembro).click();
      await expect(page.getByTestId('btn-reactivar-miembro')).toBeVisible();
    }

    async function reactivarYEsperar409(page: Page, miembro: Miembro) {
      const respuesta = page.waitForResponse((r) => r.url().includes(`/miembros/${miembro.id}/reactivar`) && r.request().method() === 'PUT');
      await page.getByTestId('btn-reactivar-miembro').click();
      expect((await respuesta).status()).toBe(409);
    }

    async function verificarAvisoDentroDeLaHoja(page: Page, texto: string, miembro: Miembro, comercioId: number) {
      await expect(page.getByTestId('aviso-reactivar')).toContainText(texto);
      await expect(page.getByTestId('menu-miembro-equipo')).toBeVisible();
      await expect(page.getByTestId('btn-reactivar-miembro')).toBeEnabled();
      expect(estadoRelacion(miembro.id, comercioId)).toBe('INACTIVO');
      await capturar(page, 'error-reactivar');
    }

    test('INVITACION_PENDIENTE: avisa que hay una invitación pendiente y cancela', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await miembroInactivo(request, comercio.id, 'BAJA_DUENO');
      const invitacion = await invitarEmpleado(request, dueno.token, comercio.id, miembro.cuenta.email);
      expect(invitacion.status, JSON.stringify(invitacion.body)).toBe(201);
      await abrirReactivar(page, comercio.id, miembro);

      await reactivarYEsperar409(page, miembro);

      await verificarAvisoDentroDeLaHoja(page, 'Hay una invitación pendiente para esta persona. Cancelala primero.', miembro, comercio.id);
    });

    test('EMPLEADO_NO_REACTIVABLE: si en el medio resultó que renunció, avisa que hay que invitarla de nuevo', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await miembroInactivo(request, comercio.id, 'BAJA_DUENO');
      await abrirReactivar(page, comercio.id, miembro);
      sql(
        `UPDATE historial_empleado_comercio h JOIN empleado_comercio r ON r.id = h.empleado_comercio_id ` +
          `SET h.motivo = 'RENUNCIA' WHERE r.empleado_id = ${miembro.id} AND r.comercio_id = ${comercio.id} AND h.motivo = 'BAJA_DUENO';`,
      );

      await reactivarYEsperar409(page, miembro);

      await verificarAvisoDentroDeLaHoja(page, 'Esta persona dejó el equipo por su cuenta. Para que vuelva, invitala de nuevo.', miembro, comercio.id);
    });

    test('COMERCIO_NO_OPERATIVO: con el comercio fuera de servicio avisa que no se puede reactivar ahora', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await miembroInactivo(request, comercio.id, 'BAJA_DUENO');
      await abrirReactivar(page, comercio.id, miembro);
      ponerEstadoComercio(comercio.id, 'SUSPENDIDO');

      await reactivarYEsperar409(page, miembro);

      await verificarAvisoDentroDeLaHoja(page, 'Este comercio no puede reactivar empleados en este momento', miembro, comercio.id);
    });

    test('409 genérico: con la cuenta de la persona no apta no se revela el motivo', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await miembroInactivo(request, comercio.id, 'BAJA_DUENO');
      await abrirReactivar(page, comercio.id, miembro);
      sql(`UPDATE usuario SET estado = 'BLOQUEADO' WHERE id = ${miembro.id};`);

      await reactivarYEsperar409(page, miembro);

      await verificarAvisoDentroDeLaHoja(page, 'No se puede reactivar a esta persona', miembro, comercio.id);
      await expect(page.getByTestId('aviso-reactivar')).not.toContainText(/bloquead/i);
    });

    test('tras un error se puede cerrar la hoja y la pantalla sigue en su lugar', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await miembroInactivo(request, comercio.id, 'BAJA_DUENO');
      const invitacion = await invitarEmpleado(request, dueno.token, comercio.id, miembro.cuenta.email);
      expect(invitacion.status).toBe(201);
      await abrirReactivar(page, comercio.id, miembro);
      await reactivarYEsperar409(page, miembro);
      await expect(page.getByTestId('aviso-reactivar')).toBeVisible();

      await page.getByTestId('btn-cerrar-menu-miembro').click();
      await expect(page.getByTestId('menu-miembro-equipo')).toHaveCount(0);
      await expect(page.getByTestId('titulo-equipo')).toBeVisible();
      await expect(filaMiembro(page, miembro.cuenta.email)).toBeVisible();
    });
  });

  test.describe('Actividad: fuente Equipo', () => {
    test('el chip Equipo existe, los chips se acomodan en dos filas a 375 px y no hay scroll horizontal', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      await abrirEquipo(page, comercio.id);
      await irAActividad(page);

      await expect(page.getByTestId('actividad-filtros').getByRole('button')).toHaveText(['Todo', 'Pedidos', 'Ediciones', 'Cierres', 'Equipo']);
      const tops = await page
        .getByTestId('actividad-filtros')
        .getByRole('button')
        .evaluateAll((nodos) => nodos.map((nodo) => Math.round(nodo.getBoundingClientRect().top)));
      expect(new Set(tops).size).toBe(2);
      const derecha = await page
        .getByTestId('actividad-filtros')
        .getByRole('button')
        .evaluateAll((nodos) => Math.max(...nodos.map((nodo) => nodo.getBoundingClientRect().right)));
      expect(derecha).toBeLessThanOrEqual(375);
      await sinScrollHorizontal(page);
      await capturar(page, 'chips-actividad');

      await page.getByTestId('chip-actividad-equipo').click();
      await expect(page.getByTestId('chip-actividad-equipo')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('estado-vacio')).toContainText('No hay actividad del equipo');
    });

    test('el chip Equipo pide fuente=EQUIPO y dibuja cada línea con su ícono y el texto del servidor', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const email = `equipo.act.${sufijoUnico()}@bajonea.test`;
      const miembro = await nuevoMiembro(request, comercio.id, email);
      expect((await putEquipo(request, comercio.id, miembro.id, 'desactivar')).status).toBe(200);
      expect((await putEquipo(request, comercio.id, miembro.id, 'reactivar')).status).toBe(200);
      const renuncia = await apiConHeaders(request, 'PUT', `/empleados/comercios/${comercio.id}/renunciar`, miembro.sesion.token);
      expect(renuncia.status, JSON.stringify(renuncia.body)).toBe(200);
      await abrirEquipo(page, comercio.id);
      await irAActividad(page);
      await expect(page.getByTestId('actividad-fila').first()).toBeVisible();

      const peticion = page.waitForRequest((r) => r.url().includes('/comercios/equipo/actividad') && new URL(r.url()).searchParams.get('fuente') === 'EQUIPO');
      await page.getByTestId('chip-actividad-equipo').click();
      await peticion;

      const filas = page.getByTestId('actividad-fila');
      await expect(filas).toHaveCount(5);
      const fuentes = await filas.evaluateAll((nodos) => nodos.map((nodo) => nodo.getAttribute('data-fuente')));
      expect(new Set(fuentes)).toEqual(new Set(['EQUIPO']));
      const acciones = await page.getByTestId('actividad-accion').allTextContents();
      expect(acciones).toEqual([
        'Dejó de trabajar en el comercio',
        `Reactivó a ${NOMBRE}`,
        `Dio de baja a ${NOMBRE}`,
        'Aceptó la invitación',
        `Invitó a ${email}`,
      ]);
      for (const motivo of ['RENUNCIA', 'REACTIVACION', 'BAJA_DUENO', 'ACEPTACION', 'INVITACION']) {
        await expect(page.getByTestId(`actividad-icono-${motivo}`)).toBeVisible();
      }
      await expect(page.getByTestId('actividad-referencia')).toHaveCount(0);
      const roles = await page.getByTestId('actividad-rol').allTextContents();
      expect(roles).toEqual(['Empleado', 'Dueño', 'Dueño', 'Empleado', 'Dueño']);
      await sinScrollHorizontal(page);
      await capturar(page, 'actividad-equipo');

      await page.getByTestId('chip-actividad-todo').click();
      await expect(page.getByTestId('chip-actividad-todo')).toHaveAttribute('aria-pressed', 'true');
      await expect(filas.first()).toBeVisible();
    });
  });

  test.describe('Avisos', () => {
    test('el aviso de renuncia se ve completo en la campana del Dueño, sin enlace, y T32 y T37 en la del Empleado', async ({ page, request, browser }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, comercio.id);
      expect((await putEquipo(request, comercio.id, miembro.id, 'desactivar')).status).toBe(200);
      expect((await putEquipo(request, comercio.id, miembro.id, 'reactivar')).status).toBe(200);
      const renuncia = await apiConHeaders(request, 'PUT', `/empleados/comercios/${comercio.id}/renunciar`, miembro.sesion.token);
      expect(renuncia.status).toBe(200);

      await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: comercio.id, ultimoComercioId: comercio.id });
      await page.goto('/notificaciones.html');
      const aviso = page.locator('.notification-item', { hasText: `${NOMBRE} dejó de trabajar en ${comercio.nombre}.` });
      await expect(aviso).toHaveCount(1);
      await expect(aviso.locator('a')).toHaveCount(0);
      await sinScrollHorizontal(page);
      await capturar(page, 'campana-dueno');

      const contextoEmpleado = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const pagina = await contextoEmpleado.newPage();
      await abrirComoUsuarioConContexto(pagina, miembro.sesion, { contexto: { tipo: 'CLIENTE' } });
      await pagina.goto('/notificaciones.html');
      await expect(pagina.locator('.notification-item', { hasText: `${comercio.nombre} te dio de baja del equipo. Ya no tenés acceso a ese comercio.` })).toHaveCount(1);
      await expect(pagina.locator('.notification-item', { hasText: `${comercio.nombre} te reactivó en el equipo. Ya podés volver a trabajar ahí.` })).toHaveCount(1);
      await expect(pagina.locator('.notification-item a')).toHaveCount(0);
      await contextoEmpleado.close();
    });
  });
});
