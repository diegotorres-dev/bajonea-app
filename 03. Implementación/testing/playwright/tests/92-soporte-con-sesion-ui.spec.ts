import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  apiPost,
  apiPut,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sentenciaEstadoComercio,
  sqlTest as sql,
  suspenderComercio,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import { abrirComoUsuario, loginUi, prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { abrirComoUsuarioConContexto, sumarAlEquipo } from './helpers/empleado';
import { abrirComoUsuarioConComercio } from './helpers/selector';
import { sinScrollHorizontal } from './helpers/layout';
import {
  MENSAJE_INICIAL, TEXTO_CERRADA, capturarSoporte, cerrarComoSoporte, conIp, crearConsultaConSesion, ipNueva,
  responderComoPersonaConSesion, responderComoSoporte,
} from './helpers/soporte';

test.use({ viewport: { width: 375, height: 812 } });

const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
const MOTIVO_SUSPENSION = 'Reiteradas quejas de comercios por pedidos falsos';

interface Persona {
  sesion: SesionApi;
  email: string;
  nombreUsuario: string;
  password: string;
}

test.describe('Fase 5, S4 (UI B): Soporte con sesión', () => {
  test.describe.configure({ timeout: 180_000 });

  let adminSesion: SesionApi;
  let localidadId: string;

  test.beforeAll(async ({ request }) => {
    adminSesion = await fijarPasswordAdminYLoguear(request);
    localidadId = await obtenerLocalidadRioGrande(request);
  });

  async function nuevaPersona(request: APIRequestContext): Promise<Persona> {
    const registro = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, registro.nombreUsuario, registro.password);
    return { sesion, email: registro.email, nombreUsuario: registro.nombreUsuario, password: registro.password };
  }

  const nuevoDueno = (request: APIRequestContext): Promise<Dueno> =>
    prepararAprobado(request, adminSesion.token, localidadId, true, todoElDia());

  async function suspenderCuenta(request: APIRequestContext, usuarioId: number) {
    const { status, body } = await apiPut(request, `/administrador/clientes/${usuarioId}/suspender`, { motivo: MOTIVO_SUSPENSION }, adminSesion.token);
    expect(status, JSON.stringify(body)).toBe(200);
  }

  async function completarYEnviar(page: Page, tipo: string, mensaje: string) {
    await page.getByTestId('select-soporte-tipo').selectOption(tipo);
    await page.getByTestId('input-soporte-mensaje').fill(mensaje);
    await page.getByTestId('btn-enviar-consulta').click();
  }

  test.describe('Entrada en el Perfil', () => {
    test('el Cliente ve la fila sin contador y, con una consulta que le toca responder, el contador en 1', async ({ page, request }) => {
      const persona = await nuevaPersona(request);
      await abrirComoUsuario(page, persona.sesion);
      await page.goto('/perfil.html');

      const fila = page.getByTestId('btn-mis-consultas');
      await expect(fila).toBeVisible();
      await expect(fila).toContainText('Mis consultas a Soporte');
      await expect(fila).toBeEnabled();
      await expect(page.getByTestId('contador-mis-consultas')).toBeHidden();
      await capturarSoporte(page, '12-perfil-cliente-sin-contador');

      const consulta = await crearConsultaConSesion(request, persona.sesion.token);
      await responderComoSoporte(request, adminSesion.token, consulta.id);
      await page.reload();
      await expect(page.getByTestId('contador-mis-consultas')).toHaveText('1');
      await expect(fila).toHaveAttribute('aria-label', 'Mis consultas a Soporte, 1 espera tu respuesta');
      await capturarSoporte(page, '13-perfil-cliente-con-contador');
      await sinScrollHorizontal(page);

      await fila.click();
      await page.waitForURL('**/mis-consultas.html');
    });

    test('el Dueño ve la fila en su perfil, con el contador de las consultas que le toca responder', async ({ page, request }) => {
      const dueno = await nuevoDueno(request);
      const consulta = await crearConsultaConSesion(request, dueno.token);
      await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: dueno.comercioId, ultimoComercioId: dueno.comercioId });
      await page.goto('/comercio-perfil.html');
      await expect(page.getByTestId('btn-mis-consultas')).toBeVisible();
      await expect(page.getByTestId('contador-mis-consultas')).toBeHidden();

      await responderComoSoporte(request, adminSesion.token, consulta.id);
      await page.reload();
      await expect(page.getByTestId('contador-mis-consultas')).toHaveText('1');
      await capturarSoporte(page, '14-perfil-dueno-con-contador');
      await sinScrollHorizontal(page);
      await page.getByTestId('btn-mis-consultas').click();
      await page.waitForURL('**/mis-consultas.html');
      await expect(page.getByTestId(`consulta-item-${consulta.id}`)).toBeVisible();
    });

    test('el Empleado ve la fila en su perfil, entre las demás, y llega a sus consultas', async ({ page, request }) => {
      const dueno = await nuevoDueno(request);
      const persona = await nuevaPersona(request);
      await sumarAlEquipo(request, dueno.comercioId, { nombreUsuario: persona.nombreUsuario, email: persona.email, password: persona.password, nombre: '', apellido: '' }, dueno.token);
      const empleado = await login(request, persona.nombreUsuario, persona.password);
      await abrirComoUsuarioConContexto(page, empleado, {
        contexto: { tipo: 'EMPLEADO', comercioId: dueno.comercioId },
        ultimoContexto: `EMPLEADO:${dueno.comercioId}`,
      });
      await page.goto('/comercio-perfil.html');

      const fila = page.getByTestId('btn-mis-consultas');
      await expect(fila).toBeVisible();
      await expect(page.getByTestId('lista-perfil').getByTestId('btn-mis-consultas')).toHaveCount(1);
      await expect(page.getByTestId('btn-cerrar-sesion')).toBeVisible();
      const consulta = await crearConsultaConSesion(request, empleado.token);
      await responderComoSoporte(request, adminSesion.token, consulta.id);
      await page.reload();
      await expect(page.getByTestId('contador-mis-consultas')).toHaveText('1');
      await capturarSoporte(page, '15-perfil-empleado-con-contador');
      await sinScrollHorizontal(page);
      await fila.click();
      await page.waitForURL('**/mis-consultas.html');
    });
  });

  test.describe('Mis consultas y conversación', () => {
    test('sin consultas muestra el texto y "Nueva consulta" lleva al formulario con el email bloqueado', async ({ page, request }) => {
      const persona = await nuevaPersona(request);
      await abrirComoUsuario(page, persona.sesion);
      await page.goto('/mis-consultas.html');

      await expect(page.getByTestId('titulo-mis-consultas')).toHaveText('Mis consultas a Soporte');
      await expect(page.getByTestId('consultas-vacio')).toContainText('Todavía no hiciste ninguna consulta');
      await capturarSoporte(page, '16-mis-consultas-vacio');
      await sinScrollHorizontal(page);

      await page.getByTestId('btn-nueva-consulta').click();
      await page.waitForURL('**/soporte.html');
      await expect(page.getByTestId('input-soporte-email')).toBeDisabled();
      await expect(page.getByTestId('input-soporte-email')).toHaveValue(persona.email);
      await expect(page.getByTestId('ayuda-email-cuenta')).toHaveText('Es el email de tu cuenta.');
      await capturarSoporte(page, '17-formulario-con-email-bloqueado');
      await sinScrollHorizontal(page);
    });

    test('lista las consultas con las que le tocan primero, cada una con su estado', async ({ page, request }) => {
      const persona = await nuevaPersona(request);
      const cerrada = await crearConsultaConSesion(request, persona.sesion.token, { tipo: 'NO_PUEDO_ENTRAR' });
      await cerrarComoSoporte(request, adminSesion.token, cerrada.id);
      const espera = await crearConsultaConSesion(request, persona.sesion.token, { tipo: 'APELACION_CUENTA' });
      const toca = await crearConsultaConSesion(request, persona.sesion.token, { tipo: 'OTRA' });
      await responderComoSoporte(request, adminSesion.token, toca.id);
      await abrirComoUsuario(page, persona.sesion);
      await page.goto('/mis-consultas.html');

      const filas = page.locator('a[data-testid^="consulta-item-"]');
      await expect(filas).toHaveCount(3);
      await expect(filas.nth(0)).toHaveAttribute('data-testid', `consulta-item-${toca.id}`);
      await expect(filas.nth(1)).toHaveAttribute('data-testid', `consulta-item-${espera.id}`);
      await expect(filas.nth(2)).toHaveAttribute('data-testid', `consulta-item-${cerrada.id}`);
      await expect(filas.nth(0).getByTestId('consulta-item-estado')).toHaveText('Te toca responder');
      await expect(filas.nth(1).getByTestId('consulta-item-estado')).toHaveText('Esperando a Soporte');
      await expect(filas.nth(2).getByTestId('consulta-item-estado')).toHaveText('Cerrada');
      await expect(filas.nth(0).getByTestId('consulta-item-tipo')).toHaveText('Otra consulta');
      await expect(filas.nth(0).getByTestId('consulta-item-fecha')).toContainText('Enviada el ');
      await capturarSoporte(page, '18-mis-consultas-con-lista');
      await sinScrollHorizontal(page);

      await filas.nth(0).click();
      await page.waitForURL(`**/soporte-consulta.html?id=${toca.id}`);
      await expect(page.getByTestId('cabecera-consulta')).toBeVisible();
    });

    test('envía una consulta con sesión, abre la conversación sin pedir código y responde', async ({ page, request }) => {
      const persona = await nuevaPersona(request);
      await abrirComoUsuario(page, persona.sesion);
      await conIp(page, ipNueva());
      await page.goto('/soporte.html');
      await completarYEnviar(page, 'COMERCIO_RECHAZADO_DOCUMENTOS_COBROS', 'Mi comercio fue rechazado y no entiendo el motivo');

      await expect(page.getByTestId('consulta-recibida')).toBeVisible();
      const codigo = (await page.getByTestId('codigo-consulta').textContent()) ?? '';
      expect(codigo).toMatch(/^[A-Z2-9]{8}$/);
      const id = Number(sql(`SELECT id FROM ticket_soporte WHERE codigo = '${codigo}';`));
      expect(sql(`SELECT usuario_id FROM ticket_soporte WHERE id = ${id};`)).toBe(String(persona.sesion.usuario.id));
      await expect(page.getByTestId('texto-email-enviado')).toHaveText(`También te lo mandamos a ${persona.email}.`);
      await expect(page.getByTestId('btn-ver-mi-consulta')).toHaveAttribute('href', `soporte-consulta.html?id=${id}`);

      await page.getByTestId('btn-ver-mi-consulta').click();
      await expect(page.getByTestId('cabecera-consulta')).toBeVisible();
      await expect(page.getByTestId('formulario-acceso')).toHaveCount(0);
      await expect(page.getByTestId('consulta-tipo')).toHaveText('Mi comercio fue rechazado o tengo problemas con documentos o cobros');

      await responderComoSoporte(request, adminSesion.token, id, '¿Podés mandarnos el número de CUIT del comercio?');
      await page.reload();
      await expect(page.getByTestId('estado-consulta')).toHaveText('Te toca responder');
      await page.getByTestId('input-respuesta').fill('El CUIT es 20-12345678-9');
      await page.getByTestId('btn-respuesta').click();
      await expect(page.locator('.toast')).toContainText('Respuesta enviada');
      await expect(page.getByTestId('mensaje-texto').last()).toHaveText('El CUIT es 20-12345678-9');
      await expect(page.getByTestId('estado-consulta')).toHaveText('Esperando a Soporte');
    });

    test('una consulta ajena o inexistente muestra "No encontramos esa consulta." y lleva a Mis consultas', async ({ page, request }) => {
      const dueña = await nuevaPersona(request);
      const ajena = await nuevaPersona(request);
      const consulta = await crearConsultaConSesion(request, dueña.sesion.token);
      await abrirComoUsuario(page, ajena.sesion);
      await page.goto(`/soporte-consulta.html?id=${consulta.id}`);

      await expect(page.getByTestId('texto-no-encontrada')).toHaveText('No encontramos esa consulta.');
      await capturarSoporte(page, '19-consulta-ajena-no-encontrada');
      await page.getByTestId('btn-ir-mis-consultas').click();
      await page.waitForURL('**/mis-consultas.html');

      await page.goto('/soporte-consulta.html?id=99999999');
      await expect(page.getByTestId('texto-no-encontrada')).toHaveText('No encontramos esa consulta.');
    });

    test('cerrada por Soporte, la conversación con sesión muestra el texto y el botón para una consulta nueva', async ({ page, request }) => {
      const persona = await nuevaPersona(request);
      const consulta = await crearConsultaConSesion(request, persona.sesion.token);
      await cerrarComoSoporte(request, adminSesion.token, consulta.id);
      await abrirComoUsuario(page, persona.sesion);
      await page.goto(`/soporte-consulta.html?id=${consulta.id}`);

      await expect(page.getByTestId('texto-consulta-cerrada')).toHaveText(TEXTO_CERRADA);
      await expect(page.getByTestId('btn-consulta-nueva')).toHaveAttribute('href', 'soporte.html');
    });

    test('el estado de la consulta se entiende en la conversación con sesión: espera, te toca y responder desde el servidor', async ({ page, request }) => {
      const persona = await nuevaPersona(request);
      const consulta = await crearConsultaConSesion(request, persona.sesion.token, { mensaje: MENSAJE_INICIAL });
      await abrirComoUsuario(page, persona.sesion);
      await page.goto(`/soporte-consulta.html?id=${consulta.id}`);
      await expect(page.getByTestId('estado-consulta')).toHaveText('Esperando a Soporte');
      await expect(page.getByTestId('turno-respuesta')).toHaveText('Esperando la respuesta de Soporte.');

      await responderComoSoporte(request, adminSesion.token, consulta.id);
      await responderComoPersonaConSesion(request, persona.sesion.token, consulta.id, 'Respuesta desde la API de la persona');
      await page.reload();
      await expect(page.getByTestId('mensaje-consulta')).toHaveCount(3);
    });
  });

  test.describe('Cuenta suspendida', () => {
    test('un Cliente suspendido con la sesión abierta entra a Soporte, envía y responde; en el resto de la app ve la pantalla de suspensión', async ({ page, request }) => {
      const persona = await nuevaPersona(request);
      const previa = await crearConsultaConSesion(request, persona.sesion.token, { tipo: 'APELACION_CUENTA' });
      await responderComoSoporte(request, adminSesion.token, previa.id, 'Contanos tu versión de lo que pasó');
      await suspenderCuenta(request, persona.sesion.usuario.id);
      await abrirComoUsuario(page, persona.sesion);
      await conIp(page, ipNueva());

      await page.goto('/mis-consultas.html');
      await expect(page.getByTestId(`consulta-item-${previa.id}`)).toBeVisible();
      await expect(page.getByTestId('pantalla-sesion-suspendida')).toHaveCount(0);

      await page.goto(`/soporte-consulta.html?id=${previa.id}`);
      await expect(page.getByTestId('estado-consulta')).toHaveText('Te toca responder');
      await page.getByTestId('input-respuesta').fill('No hice nada de lo que dicen, pido que revisen mi caso');
      await page.getByTestId('btn-respuesta').click();
      await expect(page.locator('.toast')).toContainText('Respuesta enviada');
      await expect(page.getByTestId('pantalla-sesion-suspendida')).toHaveCount(0);

      await page.goto('/soporte.html?tipo=APELACION_CUENTA');
      await expect(page.getByTestId('input-soporte-email')).toHaveValue(persona.email);
      await page.getByTestId('input-soporte-mensaje').fill('Quiero apelar la suspensión de mi cuenta');
      await page.getByTestId('btn-enviar-consulta').click();
      await expect(page.getByTestId('consulta-recibida')).toBeVisible();
      await expect(page.getByTestId('pantalla-sesion-suspendida')).toHaveCount(0);

      await page.goto('/pedidos.html');
      await expect(page.getByTestId('pantalla-sesion-suspendida')).toBeVisible();
    });

    test('en la pantalla de sesión suspendida los botones llevan a Soporte y a Mis consultas sin perder la sesión, y Cerrar sesión la borra', async ({ page, request }) => {
      const persona = await nuevaPersona(request);
      await crearConsultaConSesion(request, persona.sesion.token);
      await suspenderCuenta(request, persona.sesion.usuario.id);
      await abrirComoUsuario(page, persona.sesion);
      await page.goto('/pedidos.html');
      await expect(page.getByTestId('pantalla-sesion-suspendida')).toBeVisible();
      await expect(page.getByTestId('btn-contactar-soporte-sesion-suspendida')).toHaveText('Contactar a Soporte');
      await expect(page.getByTestId('btn-mis-consultas-sesion-suspendida')).toHaveText('Mis consultas');
      await expect(page.getByTestId('btn-cerrar-sesion-suspendida')).toHaveText('Cerrar sesión');
      await capturarSoporte(page, '20-sesion-suspendida-con-soporte');
      await sinScrollHorizontal(page);

      await page.getByTestId('btn-mis-consultas-sesion-suspendida').click();
      await page.waitForURL('**/mis-consultas.html');
      await expect(page.locator('a[data-testid^="consulta-item-"]')).toHaveCount(1);
      expect(await page.evaluate(() => localStorage.getItem('bajonea_token'))).not.toBeNull();

      await page.goto('/pedidos.html');
      await page.getByTestId('btn-contactar-soporte-sesion-suspendida').click();
      await page.waitForURL('**/soporte.html?tipo=APELACION_CUENTA');
      await expect(page.getByTestId('select-soporte-tipo')).toHaveValue('APELACION_CUENTA');
      await expect(page.getByTestId('input-soporte-email')).toBeDisabled();

      await page.goto('/pedidos.html');
      await page.evaluate(() => window.addEventListener('pagehide', () => {
        sessionStorage.setItem('sesionAlSalir', `${localStorage.getItem('bajonea_token')}|${localStorage.getItem('bajonea_usuario')}`);
      }));
      await page.getByTestId('btn-cerrar-sesion-suspendida').click();
      await page.waitForURL('**/login.html');
      expect(await page.evaluate(() => sessionStorage.getItem('sesionAlSalir'))).toBe('null|null');
    });
  });

  test.describe('Botones desde los avisos', () => {
    test('el aviso de cuenta suspendida del login trae "Contactar a Soporte" con el tipo de apelación y el formulario es público', async ({ page, request }) => {
      const persona = await nuevaPersona(request);
      await suspenderCuenta(request, persona.sesion.usuario.id);
      await loginUi(page, persona.nombreUsuario, persona.password);

      await expect(page.getByTestId('hoja-cuenta-suspendida')).toBeVisible();
      await capturarSoporte(page, '21-login-cuenta-suspendida-con-soporte');
      await sinScrollHorizontal(page);
      await page.getByTestId('btn-contactar-soporte-cuenta-suspendida').click();
      await page.waitForURL('**/soporte.html?tipo=APELACION_CUENTA');
      await expect(page.getByTestId('select-soporte-tipo')).toHaveValue('APELACION_CUENTA');
      await expect(page.getByTestId('input-soporte-email')).toBeEnabled();
      await expect(page.getByTestId('input-soporte-email')).toHaveValue('');
    });

    test('el aviso de cuenta bloqueada por intentos del login trae el enlace a Soporte con "No puedo entrar"', async ({ page, request }) => {
      const persona = await nuevaPersona(request);
      for (let i = 0; i < 3; i += 1) {
        const { status } = await apiPost(request, '/auth/login', { nombreUsuario: persona.nombreUsuario, password: 'Incorrecta1x' });
        expect(status).toBe(401);
      }
      await loginUi(page, persona.nombreUsuario, persona.password);

      const enlace = page.getByTestId('enlace-soporte-cuenta-bloqueada');
      await expect(enlace).toBeVisible();
      await expect(enlace).toHaveAttribute('href', 'soporte.html?tipo=NO_PUEDO_ENTRAR');
      await capturarSoporte(page, '22-login-cuenta-bloqueada-con-soporte');
      await sinScrollHorizontal(page);
      await enlace.click();
      await page.waitForURL('**/soporte.html?tipo=NO_PUEDO_ENTRAR');
      await expect(page.getByTestId('select-soporte-tipo')).toHaveValue('NO_PUEDO_ENTRAR');
    });

    test('el aviso de comercio no operativo del login trae el enlace a Soporte', async ({ page, request }) => {
      const dueno = await nuevoDueno(request);
      sql(sentenciaEstadoComercio(dueno.comercioId, 'INACTIVO'));
      await loginUi(page, dueno.nombreUsuario, dueno.password);

      const enlace = page.getByTestId('enlace-soporte-comercio-no-operativo');
      await expect(enlace).toBeVisible();
      await expect(enlace).toHaveAttribute('href', 'soporte.html?tipo=APELACION_COMERCIO');
    });

    test('el aviso de comercio suspendido del panel del Dueño trae el enlace y el formulario sale con el tipo y el email de la cuenta', async ({ page, request }) => {
      const dueno = await nuevoDueno(request);
      await suspenderComercio(request, adminSesion.token, dueno.comercioId, MOTIVO_SUSPENSION);
      await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: dueno.comercioId, ultimoComercioId: dueno.comercioId });
      await page.goto('/comercio-dashboard.html');

      await expect(page.getByTestId('tarjeta-comercio-suspendido')).toBeVisible();
      await capturarSoporte(page, '23-panel-comercio-suspendido-con-soporte');
      await sinScrollHorizontal(page);
      await page.getByTestId('enlace-soporte-comercio-suspendido').click();
      await page.waitForURL('**/soporte.html?tipo=APELACION_COMERCIO');
      await expect(page.getByTestId('select-soporte-tipo')).toHaveValue('APELACION_COMERCIO');
      await expect(page.getByTestId('input-soporte-email')).toHaveValue(dueno.email);
      await expect(page.getByTestId('input-soporte-email')).toBeDisabled();
    });

    test('el Empleado de un comercio suspendido también ve el enlace a Soporte', async ({ page, request }) => {
      const dueno = await nuevoDueno(request);
      const persona = await nuevaPersona(request);
      await sumarAlEquipo(request, dueno.comercioId, { nombreUsuario: persona.nombreUsuario, email: persona.email, password: persona.password, nombre: '', apellido: '' }, dueno.token);
      const empleado = await login(request, persona.nombreUsuario, persona.password);
      await suspenderComercio(request, adminSesion.token, dueno.comercioId, MOTIVO_SUSPENSION);
      await abrirComoUsuarioConContexto(page, empleado, {
        contexto: { tipo: 'EMPLEADO', comercioId: dueno.comercioId },
        ultimoContexto: `EMPLEADO:${dueno.comercioId}`,
      });
      await page.goto('/comercio-dashboard.html');

      await expect(page.getByTestId('tarjeta-comercio-suspendido')).toBeVisible();
      await expect(page.getByTestId('enlace-soporte-comercio-suspendido')).toHaveAttribute('href', 'soporte.html?tipo=APELACION_COMERCIO');
      await page.getByTestId('enlace-soporte-comercio-suspendido').click();
      await page.waitForURL('**/soporte.html?tipo=APELACION_COMERCIO');
      await expect(page.getByTestId('input-soporte-email')).toHaveValue(persona.email);
    });
  });

  test('sin sesión, Mis consultas lleva al login', async ({ page }) => {
    await page.goto('/mis-consultas.html');
    await page.waitForURL('**/login.html');
  });
});
