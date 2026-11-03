import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  apiGet,
  apiPut,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import { abrirComoUsuario, prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { sinScrollHorizontal } from './helpers/layout';
import {
  capturarSoporte, crearConsultaConSesion, crearConsultaPublica, emailUnico, fallarEmailDeSoporte, responderComoSoporte,
} from './helpers/soporte';

test.use({ viewport: { width: 375, height: 812 } });

const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

test.describe('Fase 5, S4 (UI B): Soporte del Administrador', () => {
  test.describe.configure({ timeout: 180_000 });

  let adminSesion: SesionApi;
  let localidadId: string;

  test.beforeAll(async ({ request }) => {
    adminSesion = await fijarPasswordAdminYLoguear(request);
    localidadId = await obtenerLocalidadRioGrande(request);
  });

  async function abrirComoAdmin(page: Page) {
    await abrirComoUsuario(page, adminSesion);
  }

  async function abrirDetalle(page: Page, id: number) {
    await abrirComoAdmin(page);
    await page.goto(`/admin-soporte.html?id=${id}`);
    await expect(page.getByTestId('cabecera-consulta')).toBeVisible();
  }

  async function envejecer(id: number, dias: number) {
    sql(`UPDATE ticket_soporte SET actualizado_en = DATE_SUB(NOW(), INTERVAL ${dias} DAY), creado_en = DATE_SUB(NOW(), INTERVAL ${dias} DAY) WHERE id = ${id};`);
  }

  async function personaConCuenta(request: APIRequestContext) {
    const registro = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, registro.nombreUsuario, registro.password);
    return { registro, sesion };
  }

  async function metricas(request: APIRequestContext) {
    const { status, body } = await apiGet(request, '/administrador/metricas', adminSesion.token);
    expect(status).toBe(200);
    return body.data;
  }

  async function lista(request: APIRequestContext, estado: string): Promise<Array<{ id: number }>> {
    const { status, body } = await apiGet(request, `/administrador/soporte?estado=${estado}&limite=200`, adminSesion.token);
    expect(status).toBe(200);
    return body.data;
  }

  const estadoDeLaConsulta = (id: number): string => sql(`SELECT estado FROM ticket_soporte WHERE id = ${id};`);

  test('el panel muestra la entrada Soporte con el contador de consultas que esperan', async ({ page, request }) => {
    await crearConsultaPublica(request);
    const { consultasSoporteEsperando } = await metricas(request);
    expect(consultasSoporteEsperando).toBeGreaterThan(0);
    await abrirComoAdmin(page);
    await page.goto('/admin-dashboard.html');

    const tile = page.getByTestId('tile-gestion-soporte');
    await expect(tile).toBeVisible();
    await expect(tile).toContainText('Soporte');
    await expect(page.getByTestId('contador-soporte-esperando')).toHaveText(
      consultasSoporteEsperando === 1 ? '1 espera tu respuesta' : `${consultasSoporteEsperando} esperan tu respuesta`,
    );
    await capturarSoporte(page, '24-panel-admin-con-soporte', true);
    await sinScrollHorizontal(page);
    await tile.click();
    await page.waitForURL('**/admin-soporte.html');
  });

  test.describe('Bandeja', () => {
    test('los filtros muestran la cantidad, las que esperan van con las más viejas arriba y cada ítem trae tipo, email y hace cuánto', async ({ page, request }) => {
      const reciente = await crearConsultaPublica(request, { tipo: 'NO_PUEDO_ENTRAR' });
      const masVieja = await crearConsultaPublica(request, { tipo: 'APELACION_CUENTA' });
      await envejecer(masVieja.id, 45);
      await envejecer(reciente.id, 44);
      const respondida = await crearConsultaPublica(request);
      await responderComoSoporte(request, adminSesion.token, respondida.id);
      const cerrada = await crearConsultaPublica(request);
      await responderComoSoporte(request, adminSesion.token, cerrada.id);
      await apiPut(request, `/administrador/soporte/${cerrada.id}/cerrar`, {}, adminSesion.token);
      await abrirComoAdmin(page);
      await page.goto('/admin-soporte.html');

      await expect(page.getByTestId('titulo-admin-soporte')).toHaveText('Soporte');
      const esperan = await lista(request, 'ESPERAN');
      const respondidas = await lista(request, 'RESPONDIDAS');
      const cerradas = await lista(request, 'CERRADAS');
      const rotulo = (cantidad: number) => (cantidad >= 200 ? '200+' : String(cantidad));
      await expect(page.getByTestId('filtro-soporte-esperan')).toHaveText(`Esperan ${rotulo(esperan.length)}`);
      await expect(page.getByTestId('filtro-soporte-respondidas')).toHaveText(`Respondidas ${rotulo(respondidas.length)}`);
      await expect(page.getByTestId('filtro-soporte-cerradas')).toHaveText(`Cerradas ${rotulo(cerradas.length)}`);
      await expect(page.getByTestId('filtro-soporte-esperan')).toHaveAttribute('aria-pressed', 'true');

      const ids = await page.locator('a[data-testid^="soporte-item-"]').evaluateAll((nodos) => nodos.map((nodo) => nodo.getAttribute('data-testid')));
      expect(ids.indexOf(`soporte-item-${masVieja.id}`)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(`soporte-item-${masVieja.id}`)).toBeLessThan(ids.indexOf(`soporte-item-${reciente.id}`));
      const fila = page.getByTestId(`soporte-item-${masVieja.id}`);
      await expect(fila.getByTestId('soporte-item-tipo')).toHaveText('Quiero apelar la suspensión de mi cuenta');
      await expect(fila).toContainText(masVieja.email);
      await expect(fila.getByTestId('soporte-item-hace')).toHaveText(/^Hace (44|45|46) días$/);
      await capturarSoporte(page, '25-bandeja-con-consultas');
      await sinScrollHorizontal(page);

      await page.getByTestId('filtro-soporte-respondidas').click();
      await expect(page.getByTestId('filtro-soporte-respondidas')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId(`soporte-item-${respondida.id}`)).toBeVisible();
      await expect(page.getByTestId(`soporte-item-${cerrada.id}`)).toHaveCount(0);
      await page.getByTestId('filtro-soporte-cerradas').click();
      await expect(page.getByTestId(`soporte-item-${cerrada.id}`)).toBeVisible();
      await expect(page.getByTestId(`soporte-item-${respondida.id}`)).toHaveCount(0);
    });

    test('una consulta de una cuenta suspendida lleva la marca "Cuenta suspendida"', async ({ page, request }) => {
      const { registro, sesion } = await personaConCuenta(request);
      const { status } = await apiPut(request, `/administrador/clientes/${sesion.usuario.id}/suspender`, { motivo: 'Reiteradas quejas de comercios por pedidos falsos' }, adminSesion.token);
      expect(status).toBe(200);
      const consulta = await crearConsultaPublica(request, { email: registro.email, tipo: 'APELACION_CUENTA' });
      const comun = await crearConsultaPublica(request);
      await envejecer(consulta.id, 43);
      await envejecer(comun.id, 42);
      await abrirComoAdmin(page);
      await page.goto('/admin-soporte.html');

      await expect(page.getByTestId(`soporte-item-${consulta.id}`).getByTestId('marca-cuenta-suspendida')).toHaveText('Cuenta suspendida');
      await expect(page.getByTestId(`soporte-item-${comun.id}`).getByTestId('marca-cuenta-suspendida')).toHaveCount(0);
    });

    test('sin consultas en el filtro muestra el texto vacío', async ({ page }) => {
      await page.route(/\/administrador\/soporte\?estado=CERRADAS/, (ruta) => ruta.fulfill({
        status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ mensaje: 'ok', data: [] }),
      }));
      await abrirComoAdmin(page);
      await page.goto('/admin-soporte.html');
      await page.getByTestId('filtro-soporte-cerradas').click();

      await expect(page.getByTestId('bandeja-vacia')).toHaveText('Todavía no cerraste ninguna consulta.');
      await expect(page.getByTestId('filtro-soporte-cerradas')).toHaveText('Cerradas 0');
      await capturarSoporte(page, '26-bandeja-vacia');
    });

    test('un error al cargar muestra el aviso con "Reintentar"', async ({ page }) => {
      await page.route(/\/administrador\/soporte\?estado=ESPERAN/, (ruta) => ruta.fulfill({
        status: 503, headers: CORS, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Servicio no disponible por ahora', data: null }),
      }));
      await abrirComoAdmin(page);
      await page.goto('/admin-soporte.html');

      await expect(page.getByTestId('aviso-bandeja-mensaje')).toHaveText('Servicio no disponible por ahora');
      await expect(page.getByTestId('btn-reintentar-bandeja')).toBeVisible();
    });
  });

  test.describe('Detalle', () => {
    test('una consulta con cuenta de Cliente muestra la cuenta asociada y "Ver cuenta" abre esa cuenta en Clientes', async ({ page, request }) => {
      const { registro, sesion } = await personaConCuenta(request);
      const consulta = await crearConsultaConSesion(request, sesion.token, { tipo: 'NO_PUEDO_ENTRAR', mensaje: 'No puedo entrar a mi cuenta desde ayer' });
      const nombreCompleto = sql(`SELECT CONCAT(nombre, ' ', apellido) FROM persona_fisica WHERE id = ${sesion.usuario.id};`);
      await abrirDetalle(page, consulta.id);

      await expect(page.getByTestId('consulta-tipo')).toHaveText('No puedo entrar');
      await expect(page.getByTestId('consulta-email')).toHaveText(registro.email);
      await expect(page.getByTestId('estado-consulta')).toHaveText('Espera tu respuesta');
      await expect(page.getByTestId('cuenta-nombre')).toHaveText(nombreCompleto);
      await expect(page.getByTestId('cuenta-estado')).toHaveText('Cliente · Activo');
      await expect(page.getByTestId('enlace-ver-cuenta')).toHaveAttribute('href', `admin-clientes.html?id=${sesion.usuario.id}`);
      await capturarSoporte(page, '27-detalle-con-cuenta-asociada');
      await sinScrollHorizontal(page);

      await page.getByTestId('enlace-ver-cuenta').click();
      await page.waitForURL(`**/admin-clientes.html?id=${sesion.usuario.id}`);
      await expect(page.getByTestId('cliente-destacado-aviso')).toContainText('Mostrando a ');
      await expect(page.getByTestId(`cliente-item-${sesion.usuario.id}`)).toHaveClass(/cliente-admin-row--destacada/);
      await expect(page.locator('[data-testid^="cliente-item-"]')).toHaveCount(1);
      await page.getByTestId('btn-ver-todos-clientes').click();
      await expect(page.getByTestId('cliente-destacado-aviso')).toHaveCount(0);
    });

    test('una consulta de un Dueño lleva a su cuenta en Dueños', async ({ page, request }) => {
      const dueno: Dueno = await prepararAprobado(request, adminSesion.token, localidadId, true, todoElDia());
      const consulta = await crearConsultaConSesion(request, dueno.token, { tipo: 'APELACION_COMERCIO' });
      await abrirDetalle(page, consulta.id);

      await expect(page.getByTestId('cuenta-estado')).toHaveText('Dueño · Activo');
      await expect(page.getByTestId('enlace-ver-cuenta')).toHaveAttribute('href', `admin-duenos.html?id=${dueno.duenoId}`);
      await page.getByTestId('enlace-ver-cuenta').click();
      await page.waitForURL(`**/admin-duenos.html?id=${dueno.duenoId}`);
      await expect(page.getByTestId('dueno-destacado-aviso')).toContainText('Mostrando a ');
      await expect(page.getByTestId(`dueno-item-${dueno.duenoId}`)).toHaveClass(/cliente-admin-row--destacada/);
    });

    test('una consulta sin cuenta asociada no muestra ese bloque', async ({ page, request }) => {
      const consulta = await crearConsultaPublica(request, { email: emailUnico('sincuenta'), tipo: 'OTRA' });
      await abrirDetalle(page, consulta.id);

      await expect(page.getByTestId('cuenta-asociada')).toHaveCount(0);
      await expect(page.getByTestId('enlace-ver-cuenta')).toHaveCount(0);
      await expect(page.getByTestId('consulta-email')).toHaveText(consulta.email);
      await capturarSoporte(page, '28-detalle-sin-cuenta-asociada');
      await sinScrollHorizontal(page);
    });

    test('una consulta que no existe muestra el aviso y vuelve a la bandeja', async ({ page }) => {
      await abrirComoAdmin(page);
      await page.goto('/admin-soporte.html?id=99999999');

      await expect(page.getByTestId('aviso-detalle-soporte-mensaje')).toHaveText('No encontramos esa consulta.');
      await page.getByTestId('btn-volver-bandeja').click();
      await page.waitForURL('**/admin-soporte.html');
    });
  });

  test.describe('Responder y cerrar', () => {
    test('responde: "Enviando…", toast, la burbuja aparece y la caja pasa a esperar a la persona', async ({ page, request }) => {
      const consulta = await crearConsultaPublica(request, { mensaje: '<b>Hola</b>, necesito ayuda con mi comercio' });
      let pedidos = 0;
      await page.route(/\/administrador\/soporte\/\d+\/mensajes/, async (ruta) => {
        pedidos += 1;
        await new Promise((resolver) => setTimeout(resolver, 600));
        await ruta.continue();
      });
      await abrirDetalle(page, consulta.id);

      await expect(page.getByTestId('contador-respuesta-admin')).toHaveText('0 / 1000 · quedan 19 mensajes');
      await expect(page.getByTestId('mensaje-texto').first()).toHaveText('<b>Hola</b>, necesito ayuda con mi comercio');
      await expect(page.getByTestId('hilo-consulta').locator('b')).toHaveCount(0);
      const respuesta = 'Hola, ya estamos revisando tu caso';
      await page.getByTestId('input-respuesta-admin').fill(respuesta);
      await expect(page.getByTestId('contador-respuesta-admin')).toHaveText(`${respuesta.length} / 1000 · quedan 19 mensajes`);
      await page.getByTestId('btn-respuesta-admin').dblclick();
      await expect(page.getByTestId('btn-respuesta-admin')).toHaveText('Enviando…');
      await expect(page.getByTestId('btn-respuesta-admin')).toBeDisabled();

      await expect(page.locator('.toast')).toContainText('Respuesta enviada');
      await expect(page.getByTestId('mensaje-consulta')).toHaveCount(2);
      await expect(page.getByTestId('mensaje-autor').last()).toHaveText('Soporte');
      await expect(page.getByTestId('mensaje-texto').last()).toHaveText('Hola, ya estamos revisando tu caso');
      await expect(page.getByTestId('estado-consulta')).toHaveText('Esperando a la persona');
      await expect(page.getByTestId('turno-respuesta-admin')).toHaveText('Esperando la respuesta de la persona.');
      await expect(page.getByTestId('input-respuesta-admin')).toBeDisabled();
      expect(pedidos).toBe(1);
      expect(estadoDeLaConsulta(consulta.id)).toBe('ESPERA_PERSONA');
      await capturarSoporte(page, '29-detalle-fuera-de-turno');
      await sinScrollHorizontal(page);
    });

    test('cerrar pide confirmación: "Cancelar" no cierra y devuelve el foco; confirmar cierra y avisa', async ({ page, request }) => {
      const consulta = await crearConsultaPublica(request);
      await abrirDetalle(page, consulta.id);
      await page.getByTestId('btn-cerrar-consulta').click();

      await expect(page.getByTestId('modal-cerrar-consulta')).toBeVisible();
      await expect(page.getByTestId('modal-cerrar-consulta-titulo')).toHaveText('Cerrar consulta');
      await expect(page.getByTestId('texto-cerrar-consulta')).toContainText('La persona no va a poder escribir más');
      await expect(page.getByTestId('btn-cancelar-cerrar')).toBeFocused();
      await capturarSoporte(page, '30-cerrar-consulta-confirmacion');
      await page.getByTestId('btn-cancelar-cerrar').click();
      await expect(page.getByTestId('modal-cerrar-consulta')).toHaveCount(0);
      await expect(page.getByTestId('btn-cerrar-consulta')).toBeFocused();
      expect(estadoDeLaConsulta(consulta.id)).toBe('ESPERA_SOPORTE');

      await page.getByTestId('btn-cerrar-consulta').click();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('modal-cerrar-consulta')).toHaveCount(0);
      expect(estadoDeLaConsulta(consulta.id)).toBe('ESPERA_SOPORTE');

      await page.getByTestId('btn-cerrar-consulta').click();
      await page.getByTestId('btn-confirmar-cerrar').click();
      await expect(page.locator('.toast')).toContainText('Consulta cerrada');
      await expect(page.getByTestId('estado-consulta')).toHaveText('Cerrada');
      await expect(page.getByTestId('texto-consulta-cerrada')).toHaveText('Consulta cerrada.');
      await expect(page.getByTestId('input-respuesta-admin')).toHaveCount(0);
      await expect(page.getByTestId('btn-cerrar-consulta')).toHaveCount(0);
      expect(estadoDeLaConsulta(consulta.id)).toBe('CERRADO');
    });
  });

  test.describe('Email que no salió', () => {
    test('muestra el bloque, "Reenviar" avisa si vuelve a fallar y, cuando sale, el bloque desaparece', async ({ page, request }) => {
      const consulta = await crearConsultaPublica(request);
      await fallarEmailDeSoporte(request, 2);
      await responderComoSoporte(request, adminSesion.token, consulta.id, 'Respuesta cuyo email no sale');
      await envejecer(consulta.id, 41);

      await abrirComoAdmin(page);
      await page.goto('/admin-soporte.html');
      await page.getByTestId('filtro-soporte-respondidas').click();
      await expect(page.getByTestId(`soporte-item-${consulta.id}`).getByTestId('marca-email-fallido')).toHaveText('No se envió el email');

      await page.goto(`/admin-soporte.html?id=${consulta.id}`);
      await expect(page.getByTestId('bloque-email-fallido')).toBeVisible();
      await expect(page.getByTestId('bloque-email-fallido')).toContainText('No se envió el email');
      await capturarSoporte(page, '31-detalle-email-fallido');
      await sinScrollHorizontal(page);

      let pedidos = 0;
      await page.route(/\/reenviar-email/, async (ruta) => {
        pedidos += 1;
        await new Promise((resolver) => setTimeout(resolver, 500));
        await ruta.continue();
      });
      await page.getByTestId('btn-reenviar-email').dblclick();
      await expect(page.getByTestId('btn-reenviar-email')).toHaveText('Reenviando…');
      await expect(page.getByTestId('btn-reenviar-email')).toBeDisabled();
      await expect(page.getByTestId('aviso-reenvio-email-mensaje')).toHaveText('No se pudo enviar el email. Probá de nuevo.');
      await expect(page.getByTestId('btn-reenviar-email')).toBeEnabled();

      await page.getByTestId('btn-reenviar-email').click();
      await expect(page.locator('.toast')).toContainText('Email reenviado');
      await expect(page.getByTestId('bloque-email-fallido')).toHaveCount(0);
      expect(pedidos).toBe(2);
    });
  });

  test('un Cliente que abre la pantalla es llevado al login', async ({ page, request }) => {
    const { sesion } = await personaConCuenta(request);
    await abrirComoUsuario(page, sesion);
    await page.goto('/admin-soporte.html');
    await page.waitForURL('**/login.html');
  });
});
