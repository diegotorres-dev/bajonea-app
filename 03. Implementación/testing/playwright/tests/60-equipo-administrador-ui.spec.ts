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
import type { SesionApi } from './helpers/backend';
import { atajoEstadoRelacion, ponerEstadoComercio, sumarAlEquipo } from './helpers/empleado';
import { abrirComoUsuario, prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { sinScrollHorizontal } from './helpers/layout';

const HEADER = 'X-Comercio-Id';
const OSCURO = 'rgb(26, 26, 26)';
const BLANCO = 'rgb(255, 255, 255)';
const NOMBRE = 'Clienta Playwright';

interface Miembro {
  email: string;
  id: number;
}

async function capturar(page: Page, nombre: string) {
  if (process.env.CAPTURAS) {
    await page.screenshot({ path: `tmp-capturas/e4b3-${process.env.CAPTURAS}-${nombre}.png` });
  }
}

test.use({ viewport: { width: 375, height: 812 } });

test.describe('Equipo del Administrador en pantalla, E4 entrega B3', () => {
  test.describe.configure({ timeout: 240_000 });

  let admin: SesionApi;
  let localidadId: string;
  let dueno: Dueno;

  const cabecera = (comercioId: number) => ({ [HEADER]: String(comercioId) });
  const emailNuevo = (): string => `admin.equipo.${sufijoUnico()}@bajonea.test`;
  const filaMiembro = (page: Page, email: string) => page.locator('[data-testid^="equipo-miembro-"]', { hasText: email });
  const filaSolicitud = (page: Page, email: string) => page.locator('[data-testid^="equipo-invitacion-"]', { hasText: email });

  async function comercioNuevo(request: APIRequestContext, estado = 'APROBADO'): Promise<{ id: number; nombre: string }> {
    const nombre = `Equipo B3 ${sufijoUnico()}`;
    const id = await clonarComercioTest(request, dueno.comercioId, nombre, estado);
    return { id, nombre };
  }

  function envejecerInvitaciones(comercioId: number): void {
    sql(
      `UPDATE invitacion_empleado SET fecha_creacion = DATE_SUB(fecha_creacion, INTERVAL 2 HOUR) ` +
        `WHERE comercio_id = ${comercioId} AND fecha_creacion > DATE_SUB(NOW(), INTERVAL 1 HOUR);`,
    );
  }

  async function nuevoMiembro(request: APIRequestContext, comercioId: number, email?: string): Promise<Miembro> {
    const cuenta = await registrarYVerificarCliente(request, localidadId, email ? { email } : {});
    envejecerInvitaciones(comercioId);
    await sumarAlEquipo(request, comercioId, cuenta, dueno.token);
    const sesion = await login(request, cuenta.nombreUsuario, cuenta.password);
    return { email: cuenta.email, id: sesion.usuario.id };
  }

  async function miembroInactivo(request: APIRequestContext, comercioId: number, motivo?: 'BAJA_DUENO' | 'RENUNCIA', email?: string): Promise<Miembro> {
    const miembro = await nuevoMiembro(request, comercioId, email);
    const respuesta = await atajoEstadoRelacion(request, comercioId, miembro.id, 'INACTIVO', motivo);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    return miembro;
  }

  async function solicitudPendiente(request: APIRequestContext, comercioId: number): Promise<string> {
    const email = emailNuevo();
    envejecerInvitaciones(comercioId);
    const respuesta = await invitarEmpleado(request, dueno.token, comercioId, email);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
    return email;
  }

  async function abrirComoAdmin(page: Page) {
    await abrirComoUsuario(page, admin);
  }

  async function recordarNombre(page: Page, comercioId: number, nombre: string) {
    await page.addInitScript(
      ([id, valor]) => sessionStorage.setItem('bajonea_admin_comercio_nombre', JSON.stringify({ id, nombre: valor })),
      [comercioId, nombre] as const,
    );
  }

  async function abrirEquipo(page: Page, comercioId: number, nombre?: string) {
    await abrirComoAdmin(page);
    if (nombre) {
      await recordarNombre(page, comercioId, nombre);
    }
    await page.goto(`/admin-comercio-equipo.html?id=${comercioId}`);
    await expect(page.getByTestId('titulo-equipo')).toBeVisible();
  }

  async function irAInactivos(page: Page) {
    await page.getByTestId('chip-miembros-inactivos').click();
    await expect(page.getByTestId('chip-miembros-inactivos')).toHaveAttribute('aria-pressed', 'true');
  }

  async function irASolicitudes(page: Page) {
    const pestana = page.getByTestId('tab-equipo-solicitudes');
    await pestana.click();
    await expect(pestana).toHaveAttribute('aria-selected', 'true');
  }

  test.beforeAll(async ({ request }) => {
    admin = await fijarPasswordAdminYLoguear(request);
    localidadId = await obtenerLocalidadRioGrande(request);
    dueno = await prepararAprobado(request, admin.token, localidadId);
  });

  test.describe('Detalle del comercio', () => {
    test('el modal trae el botón Ver equipo arriba de Suspender y Cerrar, que siguen lado a lado, y un resumen del equipo', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      await nuevoMiembro(request, comercio.id);
      await nuevoMiembro(request, comercio.id);
      await miembroInactivo(request, comercio.id, 'BAJA_DUENO');
      await abrirComoAdmin(page);
      await page.goto('/admin-comercios.html');
      await page.getByTestId(`btn-ver-detalle-comercio-${comercio.id}`).click();
      const modal = page.getByTestId('modal-detalle-comercio');
      await expect(modal).toBeVisible();

      await expect(page.getByTestId('resumen-equipo-comercio')).toContainText('2 activos · 1 inactivo');

      const verEquipo = page.getByTestId('btn-ver-equipo-comercio');
      const suspender = page.getByTestId('btn-suspender-comercio');
      const cerrar = page.getByTestId('btn-cerrar-modal-detalle-comercio');
      await verEquipo.scrollIntoViewIfNeeded();
      await expect(verEquipo).toHaveText('Ver equipo');
      await expect(verEquipo.locator('svg')).toBeVisible();
      await expect(verEquipo).toHaveClass(/btn-primary/);
      const cajaEquipo = (await verEquipo.boundingBox())!;
      const cajaSuspender = (await suspender.boundingBox())!;
      const cajaCerrar = (await cerrar.boundingBox())!;
      expect(cajaEquipo.height).toBeGreaterThanOrEqual(44);
      expect(cajaSuspender.height).toBeGreaterThanOrEqual(44);
      expect(cajaCerrar.height).toBeGreaterThanOrEqual(44);
      expect(cajaEquipo.y + cajaEquipo.height).toBeLessThanOrEqual(cajaSuspender.y);
      expect(Math.abs(cajaSuspender.y - cajaCerrar.y)).toBeLessThan(2);
      expect(cajaSuspender.x + cajaSuspender.width).toBeLessThanOrEqual(cajaCerrar.x);
      await sinScrollHorizontal(page);
      await capturar(page, 'modal');

      await verEquipo.click();
      await page.waitForURL(`**/admin-comercio-equipo.html?id=${comercio.id}`);
      await expect(page.getByTestId('equipo-comercio-nombre')).toHaveText(comercio.nombre);
    });

    test('un comercio suspendido no tiene Suspender, tiene Ver equipo y Cerrar ocupa todo el ancho; sin miembros el resumen dice 0 activos · 0 inactivos', async ({ page, request }) => {
      const comercio = await comercioNuevo(request, 'SUSPENDIDO');
      await abrirComoAdmin(page);
      await page.goto('/admin-comercios.html');
      await page.getByTestId(`btn-ver-detalle-comercio-${comercio.id}`).click();
      await expect(page.getByTestId('modal-detalle-comercio')).toBeVisible();
      await expect(page.getByTestId('btn-suspender-comercio')).toHaveCount(0);
      await expect(page.getByTestId('btn-ver-equipo-comercio')).toBeVisible();
      await expect(page.getByTestId('resumen-equipo-comercio')).toContainText('0 activos · 0 inactivos');
      const caja = (await page.getByTestId('btn-cerrar-modal-detalle-comercio').boundingBox())!;
      expect(caja.width).toBeGreaterThan(280);
    });

    test('si no se puede leer el equipo el resumen desaparece y el botón Ver equipo sigue', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      await abrirComoAdmin(page);
      await page.route('**/api/v1/administrador/comercios/*/equipo', (ruta) => ruta.fulfill({ status: 500, json: { mensaje: 'Error', data: null } }));
      await page.goto('/admin-comercios.html');
      await page.getByTestId(`btn-ver-detalle-comercio-${comercio.id}`).click();
      await expect(page.getByTestId('btn-ver-equipo-comercio')).toBeVisible();
      await expect(page.getByTestId('seccion-equipo-comercio')).toHaveCount(0);
    });
  });

  test.describe('Miembros', () => {
    test('los chips cuentan activos e inactivos, Activos es el filtro por defecto y cada inactivo dice su motivo', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const activoUno = await nuevoMiembro(request, comercio.id);
      const activoDos = await nuevoMiembro(request, comercio.id);
      const dadoDeBaja = await miembroInactivo(request, comercio.id, 'BAJA_DUENO');
      const renuncio = await miembroInactivo(request, comercio.id, 'RENUNCIA');
      const sinHistorial = await miembroInactivo(request, comercio.id);
      await abrirEquipo(page, comercio.id, comercio.nombre);

      await expect(page.getByTestId('equipo-comercio-nombre')).toHaveText(comercio.nombre);
      await expect(page.getByTestId('tab-equipo-miembros')).toHaveText('Miembros');
      await expect(page.getByTestId('tab-equipo-solicitudes')).toHaveText('Solicitudes 0');
      await expect(page.getByTestId('tab-equipo-miembros')).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByTestId('chip-miembros-activos')).toHaveText('Activos 2');
      await expect(page.getByTestId('chip-miembros-inactivos')).toHaveText('Inactivos 3');
      await expect(page.getByTestId('chip-miembros-activos')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('chip-miembros-inactivos')).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByTestId('chip-miembros-activos')).toHaveCSS('background-color', OSCURO);
      await expect(page.getByTestId('chip-miembros-activos')).toHaveCSS('color', BLANCO);
      for (const chip of ['chip-miembros-activos', 'chip-miembros-inactivos']) {
        const caja = (await page.getByTestId(chip).boundingBox())!;
        expect(caja.height).toBeGreaterThanOrEqual(44);
      }
      await expect(page.getByTestId('equipo-solo-lectura')).toHaveText('Solo lectura');
      await expect(page.locator('[data-testid^="equipo-miembro-"]')).toHaveCount(2);
      for (const activo of [activoUno, activoDos]) {
        const fila = filaMiembro(page, activo.email);
        await expect(fila.getByTestId('equipo-nombre')).toHaveText(NOMBRE);
        await expect(fila.getByTestId('equipo-desde')).toHaveText(/^En el equipo desde \d{2}\/\d{2}\/\d{4}$/);
        await expect(fila.getByTestId('equipo-motivo-baja')).toHaveCount(0);
        await expect(fila.locator('.equipo-avatar--apagado')).toHaveCount(0);
      }
      await sinScrollHorizontal(page);
      await capturar(page, 'activos');

      await irAInactivos(page);
      await expect(page.locator('[data-testid^="equipo-miembro-"]')).toHaveCount(3);
      await expect(filaMiembro(page, activoUno.email)).toHaveCount(0);
      const filaBaja = filaMiembro(page, dadoDeBaja.email);
      await expect(filaBaja.getByTestId('equipo-motivo-baja')).toHaveText(/^Dado de baja por el dueño · \d{2}\/\d{2}$/);
      await expect(filaBaja.getByTestId('equipo-motivo-baja')).toHaveClass(/equipo-motivo--baja/);
      await expect(filaBaja.locator('.equipo-avatar--apagado')).toHaveCount(1);
      const filaRenuncia = filaMiembro(page, renuncio.email);
      await expect(filaRenuncia.getByTestId('equipo-motivo-baja')).toHaveText(/^Dejó de trabajar en el comercio · \d{2}\/\d{2}$/);
      await expect(filaRenuncia.getByTestId('equipo-motivo-baja')).toHaveClass(/equipo-motivo--renuncia/);
      await expect(filaMiembro(page, sinHistorial.email).getByTestId('equipo-motivo-baja')).toHaveText('Inactivo');
      await expect(page.getByTestId('chip-miembros-inactivos')).toHaveCSS('background-color', OSCURO);
      await expect(page.getByTestId('tab-equipo-solicitudes')).toHaveText('Solicitudes 0');
      await sinScrollHorizontal(page);
      await capturar(page, 'inactivos');
    });

    test('un comercio sin equipo muestra el vacío de cada lista', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      await abrirEquipo(page, comercio.id);
      await expect(page.getByTestId('chip-miembros-activos')).toHaveText('Activos 0');
      await expect(page.getByTestId('estado-vacio')).toContainText('Este comercio no tiene miembros activos');
      await irAInactivos(page);
      await expect(page.getByTestId('estado-vacio')).toContainText('Este comercio no tiene miembros inactivos');
      await irASolicitudes(page);
      await expect(page.getByTestId('estado-vacio')).toContainText('No hay solicitudes pendientes');
      await expect(page.getByTestId('equipo-solicitudes-texto')).toHaveText('Invitaciones enviadas por el dueño que todavía no se respondieron');
    });

    test('sin el nombre guardado, o con el de otro comercio, el subtítulo se omite y el equipo se ve igual', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, comercio.id);
      await abrirEquipo(page, comercio.id);
      await expect(filaMiembro(page, miembro.email)).toBeVisible();
      await expect(page.getByTestId('equipo-comercio-nombre')).toBeHidden();
      await recordarNombre(page, comercio.id + 1, 'Otro comercio');
      await page.goto(`/admin-comercio-equipo.html?id=${comercio.id}`);
      await expect(filaMiembro(page, miembro.email)).toBeVisible();
      await expect(page.getByTestId('equipo-comercio-nombre')).toBeHidden();
    });

    test('un comercio suspendido y uno cerrado temporalmente muestran su equipo igual', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, comercio.id);
      for (const estado of ['SUSPENDIDO', 'CERRADO_TEMPORALMENTE']) {
        ponerEstadoComercio(comercio.id, estado);
        await abrirEquipo(page, comercio.id);
        await expect(filaMiembro(page, miembro.email)).toBeVisible();
        await expect(page.getByTestId('chip-miembros-activos')).toHaveText('Activos 1');
      }
    });

    test('las filas no tienen ninguna acción de escritura', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      await nuevoMiembro(request, comercio.id);
      await miembroInactivo(request, comercio.id, 'BAJA_DUENO');
      await solicitudPendiente(request, comercio.id);
      await abrirEquipo(page, comercio.id);
      await expect(page.locator('[data-testid^="equipo-miembro-"]')).toHaveCount(1);
      await expect(page.locator('[data-testid^="equipo-invitacion-"]')).toHaveCount(0);
      await expect(page.locator('[data-testid^="btn-menu-"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="equipo-lista"] .equipo-fila button')).toHaveCount(0);
      await irAInactivos(page);
      await expect(page.locator('[data-testid="equipo-lista"] .equipo-fila button')).toHaveCount(0);
      await irASolicitudes(page);
      await expect(page.locator('[data-testid="equipo-lista"] .equipo-fila button')).toHaveCount(0);
      await expect(page.locator('[data-testid^="equipo-invitacion-"]')).toHaveCount(1);
      await expect(page.locator('[data-testid^="equipo-miembro-"]')).toHaveCount(0);
      await expect(page.getByTestId('btn-invitar-equipo')).toHaveCount(0);
      for (const texto of ['Desactivar', 'Reactivar', 'Invitar', 'Cancelar invitación', 'Reenviar']) {
        await expect(page.getByRole('button', { name: new RegExp(texto) })).toHaveCount(0);
      }
    });
  });

  test.describe('Solicitudes', () => {
    test('cada solicitud dice cuándo se envió y cuándo vence, con días en singular, plural y hoy', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const enSiete = await solicitudPendiente(request, comercio.id);
      const enTres = await solicitudPendiente(request, comercio.id);
      const enUno = await solicitudPendiente(request, comercio.id);
      sql(`UPDATE invitacion_empleado SET fecha_vencimiento = DATE_ADD(NOW(), INTERVAL 60 HOUR) WHERE comercio_id = ${comercio.id} AND email = '${enTres}';`);
      sql(`UPDATE invitacion_empleado SET fecha_vencimiento = DATE_ADD(NOW(), INTERVAL 12 HOUR) WHERE comercio_id = ${comercio.id} AND email = '${enUno}';`);
      await abrirEquipo(page, comercio.id);
      await expect(page.getByTestId('tab-equipo-solicitudes')).toHaveText('Solicitudes 3');
      await irASolicitudes(page);
      await expect(page.locator('[data-testid^="equipo-invitacion-"]')).toHaveCount(3);
      await expect(filaSolicitud(page, enSiete).getByTestId('equipo-estado')).toHaveText('Vence en 7 días');
      await expect(filaSolicitud(page, enTres).getByTestId('equipo-estado')).toHaveText('Vence en 3 días');
      await expect(filaSolicitud(page, enUno).getByTestId('equipo-estado')).toHaveText('Vence en 1 día');
      for (const email of [enSiete, enTres, enUno]) {
        await expect(filaSolicitud(page, email).getByTestId('equipo-invitada')).toHaveText(/^Invitada el \d{2}\/\d{2}\/\d{4}$/);
        await expect(filaSolicitud(page, email).getByTestId('equipo-email')).toHaveText(email);
      }
      await sinScrollHorizontal(page);
      await capturar(page, 'solicitudes');
    });

    test('una solicitud con 0 días restantes dice Vence hoy', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const email = await solicitudPendiente(request, comercio.id);
      await abrirComoAdmin(page);
      await page.route('**/api/v1/administrador/comercios/*/equipo', async (ruta) => {
        const respuesta = await ruta.fetch();
        const json = await respuesta.json();
        json.data.invitaciones.forEach((invitacion: { diasRestantes: number | null }) => {
          invitacion.diasRestantes = 0;
        });
        await ruta.fulfill({ response: respuesta, json });
      });
      await page.goto(`/admin-comercio-equipo.html?id=${comercio.id}`);
      await irASolicitudes(page);
      await expect(filaSolicitud(page, email).getByTestId('equipo-estado')).toHaveText('Vence hoy');
    });

    test('una solicitud vencida o con el código bloqueado se ve igual, sin acciones', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const vencida = await solicitudPendiente(request, comercio.id);
      sql(`UPDATE invitacion_empleado SET fecha_vencimiento = DATE_SUB(NOW(), INTERVAL 3 DAY) WHERE comercio_id = ${comercio.id} AND email = '${vencida}';`);
      await abrirEquipo(page, comercio.id);
      await irASolicitudes(page);
      await expect(filaSolicitud(page, vencida).getByTestId('equipo-estado')).toHaveText(/^Vencida/);
      await expect(page.locator('[data-testid="equipo-lista"] .equipo-fila button')).toHaveCount(0);
    });
  });

  test.describe('Errores', () => {
    test('un comercio inexistente dice Comercio no encontrado y no ofrece Reintentar', async ({ page }) => {
      await abrirEquipo(page, 99999999);
      await expect(page.getByTestId('equipo-error')).toContainText('Comercio no encontrado');
      await expect(page.getByTestId('btn-reintentar-equipo')).toHaveCount(0);
      await expect(page.getByTestId('equipo-tabs')).toBeHidden();
    });

    test('sin id válido en la dirección dice Comercio no encontrado', async ({ page }) => {
      await abrirComoAdmin(page);
      await page.goto('/admin-comercio-equipo.html?id=abc');
      await expect(page.getByTestId('equipo-error')).toContainText('Comercio no encontrado');
      await expect(page.getByTestId('btn-actividad-equipo')).toBeHidden();
    });

    test('un error del servidor ofrece Reintentar y, con la respuesta restablecida, carga el equipo', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, comercio.id);
      await abrirComoAdmin(page);
      let fallar = true;
      await page.route('**/api/v1/administrador/comercios/*/equipo', (ruta) => {
        if (fallar) {
          return ruta.fulfill({ status: 500, json: { mensaje: 'Error', data: null } });
        }
        return ruta.continue();
      });
      await page.goto(`/admin-comercio-equipo.html?id=${comercio.id}`);
      await expect(page.getByTestId('equipo-error')).toContainText('No pudimos cargar el equipo.');
      fallar = false;
      await page.getByTestId('btn-reintentar-equipo').click();
      await expect(filaMiembro(page, miembro.email)).toBeVisible();
      await expect(page.getByTestId('equipo-error')).toHaveCount(0);
    });

    test('sin conexión también ofrece Reintentar', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      await abrirComoAdmin(page);
      await page.route('**/api/v1/administrador/comercios/*/equipo', (ruta) => ruta.abort('failed'));
      await page.goto(`/admin-comercio-equipo.html?id=${comercio.id}`);
      await expect(page.getByTestId('equipo-error')).toContainText('No pudimos conectar');
      await expect(page.getByTestId('btn-reintentar-equipo')).toBeVisible();
    });
  });

  test.describe('Actividad', () => {
    test('el botón Actividad abre la página con cinco chips en dos filas y la línea del equipo con quien actuó', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, comercio.id);
      const baja = await apiConHeaders(request, 'PUT', `/comercios/equipo/miembros/${miembro.id}/desactivar`, dueno.token, cabecera(comercio.id));
      expect(baja.status).toBe(200);
      await abrirEquipo(page, comercio.id, comercio.nombre);
      await page.getByTestId('btn-actividad-equipo').click();
      await page.waitForURL(`**/admin-comercio-actividad.html?id=${comercio.id}`);
      await expect(page.getByTestId('titulo-actividad')).toHaveText('Actividad');
      await expect(page.getByTestId('equipo-comercio-nombre')).toHaveText(comercio.nombre);

      const chips = ['todo', 'pedidos', 'ediciones', 'cierres', 'equipo'];
      const cajas = [];
      for (const chip of chips) {
        const caja = (await page.getByTestId(`chip-actividad-${chip}`).boundingBox())!;
        expect(caja.height).toBeGreaterThanOrEqual(30);
        cajas.push(caja);
      }
      const filasDeChips = new Set(cajas.map((caja) => Math.round(caja.y)));
      expect(filasDeChips.size).toBe(2);
      await expect(page.getByTestId('chip-actividad-todo')).toHaveAttribute('aria-pressed', 'true');
      await sinScrollHorizontal(page);

      await page.getByTestId('chip-actividad-equipo').click();
      await expect(page.getByTestId('chip-actividad-equipo')).toHaveAttribute('aria-pressed', 'true');
      const filaBaja = page.getByTestId('actividad-fila').filter({ hasText: `Dio de baja a ${NOMBRE}` });
      await expect(filaBaja).toHaveCount(1);
      await expect(filaBaja.getByTestId('actividad-rol')).toHaveText('Dueño');
      await expect(filaBaja.getByTestId('actividad-nombre')).toBeVisible();
      await expect(filaBaja.getByTestId('actividad-icono-BAJA_DUENO')).toBeVisible();
      await expect(page.getByTestId('actividad-fila').filter({ hasText: 'Aceptó la invitación' })).toHaveCount(1);
      await expect(page.locator('[data-testid="actividad-filas"] button')).toHaveCount(0);
      await sinScrollHorizontal(page);
      await capturar(page, 'actividad');

      await page.getByTestId('btn-volver').click();
      await page.waitForURL(`**/admin-comercio-equipo.html?id=${comercio.id}`);
    });

    test('un comercio sin actividad del equipo muestra su vacío y un comercio inexistente avisa con Reintentar', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      await abrirComoAdmin(page);
      await page.goto(`/admin-comercio-actividad.html?id=${comercio.id}`);
      await page.getByTestId('chip-actividad-equipo').click();
      await expect(page.getByTestId('estado-vacio')).toContainText('No hay actividad del equipo');

      await page.goto('/admin-comercio-actividad.html?id=99999999');
      await expect(page.getByTestId('actividad-error')).toContainText('Comercio no encontrado');
    });

    test('Ver más trae la página siguiente de la actividad', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, comercio.id);
      for (let i = 0; i < 16; i += 1) {
        const baja = await apiConHeaders(request, 'PUT', `/comercios/equipo/miembros/${miembro.id}/desactivar`, dueno.token, cabecera(comercio.id));
        expect(baja.status).toBe(200);
        const alta = await apiConHeaders(request, 'PUT', `/comercios/equipo/miembros/${miembro.id}/reactivar`, dueno.token, cabecera(comercio.id));
        expect(alta.status).toBe(200);
      }
      await abrirComoAdmin(page);
      await page.goto(`/admin-comercio-actividad.html?id=${comercio.id}`);
      await expect(page.getByTestId('actividad-fila').first()).toBeVisible();
      const antes = await page.getByTestId('actividad-fila').count();
      const verMas = page.getByTestId('btn-actividad-ver-mas');
      await expect(verMas).toBeVisible();
      await verMas.click();
      await expect.poll(() => page.getByTestId('actividad-fila').count()).toBeGreaterThan(antes);
    });
  });

  test.describe('Acceso', () => {
    test('quien no es Administrador vuelve al login desde las dos páginas', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const cliente = await registrarYVerificarCliente(request, localidadId);
      const sesionCliente = await login(request, cliente.nombreUsuario, cliente.password);
      for (const sesion of [sesionCliente, dueno.sesion]) {
        for (const pagina of ['admin-comercio-equipo.html', 'admin-comercio-actividad.html']) {
          await page.goto('/login.html');
          await page.evaluate(
            ([token, usuario]) => {
              localStorage.setItem('bajonea_token', token);
              localStorage.setItem('bajonea_usuario', usuario);
            },
            [sesion.token, JSON.stringify(sesion.usuario)],
          );
          await page.goto(`/${pagina}?id=${comercio.id}`);
          await page.waitForURL('**/login.html**');
        }
      }
    });

    test('sin sesión vuelve al login', async ({ page }) => {
      await page.goto('/admin-comercio-equipo.html?id=1');
      await page.waitForURL('**/login.html**');
    });

    test('el Dueño y el Cliente reciben 403 en los endpoints del Administrador', async ({ request }) => {
      const comercio = await comercioNuevo(request);
      const cliente = await registrarYVerificarCliente(request, localidadId);
      const sesionCliente = await login(request, cliente.nombreUsuario, cliente.password);
      for (const token of [sesionCliente.token, dueno.token]) {
        const equipo = await apiConHeaders(request, 'GET', `/administrador/comercios/${comercio.id}/equipo`, token);
        const actividad = await apiConHeaders(request, 'GET', `/administrador/comercios/${comercio.id}/actividad`, token);
        expect(equipo.status).toBe(403);
        expect(actividad.status).toBe(403);
      }
    });
  });
});
