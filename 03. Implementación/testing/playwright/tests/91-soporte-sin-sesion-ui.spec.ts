import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { apiConHeaders, fijarPasswordAdminYLoguear, sqlTest as sql } from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import { sinScrollHorizontal } from './helpers/layout';
import {
  MENSAJE_INICIAL, TEXTO_ABIERTAS, TEXTO_CERRADA, TEXTO_DIARIO, TEXTO_INTENTOS, TEXTO_NO_ENCONTRADA, TEXTO_POR_IP, TEXTO_REENVIO,
  capturarSoporte, cerrarComoSoporte, conIp, crearConsultaPublica, emailUnico, formatearCodigoConSeparadores, ipNueva,
  responderComoPersonaPublica, responderComoSoporte,
} from './helpers/soporte';
import type { ConsultaCreada } from './helpers/soporte';

test.use({ viewport: { width: 375, height: 812 } });

const TIPOS_ESPERADOS = [
  'Quiero apelar la suspensión de mi cuenta',
  'Quiero apelar la suspensión de mi comercio',
  'No puedo entrar',
  'Mi comercio fue rechazado o tengo problemas con documentos o cobros',
  'Otra consulta',
];

test.describe('Fase 5, S4 (UI B): Soporte sin sesión', () => {
  test.describe.configure({ timeout: 120_000 });

  let adminSesion: SesionApi;

  test.beforeAll(async ({ request }) => {
    adminSesion = await fijarPasswordAdminYLoguear(request);
  });

  async function completarFormulario(page: Page, email: string, tipoValor: string, mensaje: string) {
    await page.getByTestId('input-soporte-email').fill(email);
    await page.getByTestId('select-soporte-tipo').selectOption(tipoValor);
    await page.getByTestId('input-soporte-mensaje').fill(mensaje);
  }

  async function abrirConsultaPublica(page: Page, consulta: ConsultaCreada) {
    await page.goto('about:blank');
    await page.goto(`/soporte-consulta.html#codigo=${consulta.codigo}&email=${encodeURIComponent(consulta.email)}`);
    await expect(page.getByTestId('cabecera-consulta')).toBeVisible();
  }

  const estadoDeLaConsulta = (id: number): string => sql(`SELECT estado FROM ticket_soporte WHERE id = ${id};`);

  test.describe('Formulario', () => {
    test('muestra el título, el texto, los cinco tipos, el contador y el enlace a la Política de privacidad', async ({ page }) => {
      await conIp(page, ipNueva());
      await page.goto('/soporte.html');

      await expect(page.getByTestId('titulo-soporte')).toHaveText('Contactar a Soporte');
      await expect(page.getByTestId('texto-soporte-intro')).toHaveText('Te respondemos por email.');
      await expect(page.getByLabel('Tu email')).toBeEnabled();
      await expect(page.getByLabel('Tipo de consulta')).toHaveValue('');
      const opciones = await page.getByTestId('select-soporte-tipo').locator('option').allTextContents();
      expect(opciones).toEqual(['Elegí una opción', ...TIPOS_ESPERADOS]);
      await expect(page.getByLabel('Contanos qué pasó')).toBeVisible();
      await expect(page.getByTestId('contador-soporte-mensaje')).toHaveText('0 / 1000 · mínimo 10');
      await page.getByTestId('input-soporte-mensaje').fill('Hola equipo');
      await expect(page.getByTestId('contador-soporte-mensaje')).toHaveText('11 / 1000 · mínimo 10');
      await expect(page.getByTestId('texto-privacidad')).toHaveText('Si tenés dudas sobre tus datos, leé nuestra Política de privacidad.');
      await expect(page.getByTestId('enlace-privacidad')).toHaveAttribute('href', 'privacidad.html');
      await expect(page.getByTestId('btn-enviar-consulta')).toBeEnabled();
      await sinScrollHorizontal(page);
      await capturarSoporte(page, '01-formulario-vacio');
    });

    test('?tipo= preselecciona el tipo y cualquier otro valor se ignora', async ({ page }) => {
      await page.goto('/soporte.html?tipo=NO_PUEDO_ENTRAR');
      await expect(page.getByTestId('select-soporte-tipo')).toHaveValue('NO_PUEDO_ENTRAR');
      await page.goto('/soporte.html?tipo=APELACION_COMERCIO');
      await expect(page.getByTestId('select-soporte-tipo')).toHaveValue('APELACION_COMERCIO');
      await page.goto('/soporte.html?tipo=cualquier-cosa');
      await expect(page.getByTestId('select-soporte-tipo')).toHaveValue('');
      await page.goto('/soporte.html?tipo=otra');
      await expect(page.getByTestId('select-soporte-tipo')).toHaveValue('');
    });

    test('enviado vacío muestra los errores que devuelve la API, campo por campo, y deja el foco en el primero', async ({ page }) => {
      await conIp(page, ipNueva());
      await page.goto('/soporte.html');
      await page.getByTestId('btn-enviar-consulta').click();

      await expect(page.getByTestId('error-soporte-tipo')).toHaveText('Elegí el motivo de tu consulta');
      await expect(page.getByTestId('error-soporte-mensaje')).toHaveText('Escribí tu mensaje');
      await expect(page.getByTestId('error-soporte-email')).not.toHaveText('');
      await expect(page.getByTestId('input-soporte-email')).toBeFocused();
      await expect(page.getByTestId('btn-enviar-consulta')).toBeEnabled();
      await capturarSoporte(page, '02-formulario-con-error');
      await sinScrollHorizontal(page);

      await page.getByTestId('input-soporte-email').fill(emailUnico());
      await page.getByTestId('select-soporte-tipo').selectOption('OTRA');
      await page.getByTestId('input-soporte-mensaje').fill('corto');
      await page.getByTestId('btn-enviar-consulta').click();
      await expect(page.getByTestId('error-soporte-mensaje')).toHaveText('El mensaje debe tener entre 10 y 1000 caracteres');
      await expect(page.getByTestId('error-soporte-email')).toBeHidden();
      await expect(page.getByTestId('error-soporte-tipo')).toBeHidden();
      await expect(page.getByTestId('input-soporte-mensaje')).toBeFocused();
    });

    test('al enviar muestra "Enviando…", deshabilita el botón y un doble clic crea una sola consulta', async ({ page }) => {
      const email = emailUnico();
      const ip = ipNueva();
      let pedidos = 0;
      await page.route('**/api/v1/soporte/publico/consultas', async (ruta) => {
        pedidos += 1;
        await new Promise((resolver) => setTimeout(resolver, 700));
        await ruta.continue({ headers: { ...ruta.request().headers(), 'x-forwarded-for': ip } });
      });
      await page.goto('/soporte.html');
      await completarFormulario(page, email, 'OTRA', MENSAJE_INICIAL);
      await page.getByTestId('btn-enviar-consulta').dblclick();

      await expect(page.getByTestId('btn-enviar-consulta')).toHaveText('Enviando…');
      await expect(page.getByTestId('btn-enviar-consulta')).toBeDisabled();
      await expect(page.getByTestId('consulta-recibida')).toBeVisible();
      expect(pedidos).toBe(1);
      expect(Number(sql(`SELECT COUNT(*) FROM ticket_soporte WHERE email = '${email}';`))).toBe(1);
    });
  });

  test.describe('Consulta enviada', () => {
    test('muestra el código, copia con un toast, y "Ver mi consulta" abre la conversación sin pedir nada y limpia la URL', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      const email = emailUnico();
      await conIp(page, ipNueva());
      await page.goto('/soporte.html?tipo=NO_PUEDO_ENTRAR');
      await page.getByTestId('input-soporte-email').fill(email);
      await page.getByTestId('input-soporte-mensaje').fill('No puedo entrar desde ayer a la tarde');
      await page.getByTestId('btn-enviar-consulta').click();

      await expect(page.getByTestId('consulta-recibida')).toBeVisible();
      await expect(page.getByTestId('titulo-consulta-recibida')).toHaveText('Recibimos tu consulta');
      await expect(page.getByTestId('titulo-consulta-recibida')).toBeFocused();
      const codigo = (await page.getByTestId('codigo-consulta').textContent()) ?? '';
      expect(codigo).toMatch(/^[A-Z2-9]{8}$/);
      expect(codigo).not.toMatch(/[01OIL]/);
      await expect(page.getByTestId('texto-email-enviado')).toHaveText(`También te lo mandamos a ${email}.`);
      expect(sql(`SELECT codigo FROM ticket_soporte WHERE email = '${email}';`)).toBe(codigo);
      expect(sql(`SELECT tipo FROM ticket_soporte WHERE email = '${email}';`)).toBe('NO_PUEDO_ENTRAR');
      await capturarSoporte(page, '03-consulta-recibida-con-codigo');
      await sinScrollHorizontal(page);

      await page.getByTestId('btn-copiar-codigo').click();
      await expect(page.locator('.toast')).toContainText('Código copiado');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(codigo);

      await page.getByTestId('btn-ver-mi-consulta').click();
      await expect(page.getByTestId('cabecera-consulta')).toBeVisible();
      await expect(page.getByTestId('consulta-tipo')).toHaveText('No puedo entrar');
      await expect(page.getByTestId('mensaje-texto')).toHaveText('No puedo entrar desde ayer a la tarde');
      expect(page.url()).not.toContain('codigo');
      expect(page.url()).not.toContain(email);
      expect(await page.evaluate(() => window.location.hash)).toBe('');
    });

    test('si el navegador no deja copiar, el código queda seleccionado y se avisa', async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('sin permiso')) }, configurable: true });
      });
      await conIp(page, ipNueva());
      await page.goto('/soporte.html');
      await completarFormulario(page, emailUnico(), 'OTRA', MENSAJE_INICIAL);
      await page.getByTestId('btn-enviar-consulta').click();
      const codigo = (await page.getByTestId('codigo-consulta').textContent()) ?? '';

      await page.getByTestId('btn-copiar-codigo').click();
      await expect(page.locator('.toast')).toContainText('Quedó seleccionado');
      expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(codigo);
    });
  });

  test.describe('Ver la consulta', () => {
    test('un enlace con #codigo y #email carga la conversación solo y borra el fragmento de la URL', async ({ page, request }) => {
      const consulta = await crearConsultaPublica(request, { tipo: 'APELACION_CUENTA', mensaje: 'Quiero apelar la suspensión de mi cuenta, por favor' });
      await conIp(page, consulta.ip);
      await abrirConsultaPublica(page, consulta);

      await expect(page.getByTestId('consulta-tipo')).toHaveText('Quiero apelar la suspensión de mi cuenta');
      await expect(page.getByTestId('mensaje-texto')).toHaveText('Quiero apelar la suspensión de mi cuenta, por favor');
      await expect(page.getByTestId('mensaje-autor')).toHaveText('Vos');
      expect(page.url()).not.toContain('#');
      expect(page.url()).not.toContain(consulta.codigo);
      expect(await page.evaluate(() => window.location.hash)).toBe('');
      await sinScrollHorizontal(page);
    });

    test('con un enlace de datos incorrectos cae al formulario con el mensaje y el email cargado', async ({ page, request }) => {
      const consulta = await crearConsultaPublica(request);
      await conIp(page, ipNueva());
      await page.goto(`/soporte-consulta.html#codigo=ZZZZZZZZ&email=${encodeURIComponent(consulta.email)}`);

      await expect(page.getByTestId('formulario-acceso')).toBeVisible();
      await expect(page.getByTestId('aviso-acceso-mensaje')).toHaveText(TEXTO_NO_ENCONTRADA);
      await expect(page.getByTestId('input-acceso-email')).toHaveValue(consulta.email);
      expect(page.url()).not.toContain('#');
    });

    test('el acceso manual acepta el código en minúsculas, con espacios y guiones', async ({ page, request }) => {
      const consulta = await crearConsultaPublica(request);
      await conIp(page, consulta.ip);
      await page.goto('/soporte-consulta.html');

      await expect(page.getByTestId('titulo-acceso')).toHaveText('Ver mi consulta');
      await expect(page.getByLabel('Tu email')).toBeVisible();
      await expect(page.getByLabel('Código')).toBeVisible();
      await capturarSoporte(page, '04-ver-consulta-formulario');
      await sinScrollHorizontal(page);
      await page.getByTestId('input-acceso-email').fill(`  ${consulta.email.toUpperCase()} `);
      await page.getByTestId('input-acceso-codigo').fill(formatearCodigoConSeparadores(consulta.codigo));
      await page.getByTestId('btn-acceder-consulta').click();

      await expect(page.getByTestId('cabecera-consulta')).toBeVisible();
      await expect(page.getByTestId('mensaje-texto')).toHaveText(MENSAJE_INICIAL);
    });

    test('un dato incorrecto da siempre el mismo mensaje, sin decir cuál falló', async ({ page, request }) => {
      const consulta = await crearConsultaPublica(request);
      const ajena = await crearConsultaPublica(request);
      await conIp(page, ipNueva());
      await page.goto('/soporte-consulta.html');

      const combinaciones: Array<[string, string]> = [
        [consulta.email, 'ZZZZZZZZ'],
        [emailUnico(), consulta.codigo],
        [consulta.email, ajena.codigo],
      ];
      for (const [email, codigo] of combinaciones) {
        await page.getByTestId('input-acceso-email').fill(email);
        await page.getByTestId('input-acceso-codigo').fill(codigo);
        await page.getByTestId('btn-acceder-consulta').click();
        await expect(page.getByTestId('aviso-acceso-mensaje')).toHaveText(TEXTO_NO_ENCONTRADA);
        await expect(page.getByTestId('aviso-acceso-mensaje')).toBeFocused();
        await expect(page.getByTestId('btn-acceder-consulta')).toBeEnabled();
      }
      await capturarSoporte(page, '05-ver-consulta-dato-incorrecto');
    });

    test('tras demasiados intentos fallidos desde una conexión muestra el mensaje de límite', async ({ page, request }) => {
      const consulta = await crearConsultaPublica(request);
      const ip = ipNueva();
      for (let i = 0; i < 10; i += 1) {
        const { status } = await apiConHeaders(request, 'POST', '/soporte/publico/consultas/ver', undefined, { 'X-Forwarded-For': ip }, { email: emailUnico(), codigo: 'ZZZZZZZZ' });
        expect(status).toBe(404);
      }
      await conIp(page, ip);
      await page.goto('/soporte-consulta.html');
      await page.getByTestId('input-acceso-email').fill(consulta.email);
      await page.getByTestId('input-acceso-codigo').fill(consulta.codigo);
      await page.getByTestId('btn-acceder-consulta').click();

      await expect(page.getByTestId('aviso-acceso-mensaje')).toHaveText(TEXTO_INTENTOS);
    });

    test('"¿Perdiste el código?" lleva al reenvío y responde lo mismo haya o no consultas con ese email', async ({ page, request }) => {
      const consulta = await crearConsultaPublica(request);
      await conIp(page, ipNueva());
      await page.goto('/soporte-consulta.html');
      await page.getByTestId('input-acceso-email').fill(consulta.email);
      await page.getByTestId('btn-perdi-codigo').click();

      await expect(page.getByTestId('titulo-reenvio')).toHaveText('¿Perdiste el código?');
      await expect(page.getByTestId('input-reenvio-email')).toHaveValue(consulta.email);
      await page.getByTestId('btn-reenviar-codigo').click();
      await expect(page.getByTestId('mensaje-reenvio')).toHaveText(TEXTO_REENVIO);
      await capturarSoporte(page, '06-reenvio-de-codigo');
      await sinScrollHorizontal(page);

      await page.getByTestId('input-reenvio-email').fill(emailUnico('sinconsultas'));
      await page.getByTestId('btn-reenviar-codigo').click();
      await expect(page.getByTestId('mensaje-reenvio')).toHaveText(TEXTO_REENVIO);

      await page.getByTestId('btn-volver-a-ver').click();
      await expect(page.getByTestId('titulo-acceso')).toBeVisible();
    });

    test('el cuarto pedido de reenvío en una hora muestra el límite', async ({ page, request }) => {
      const consulta = await crearConsultaPublica(request);
      for (let i = 0; i < 3; i += 1) {
        const { status } = await apiConHeaders(request, 'POST', '/soporte/publico/codigos/reenviar', undefined, { 'X-Forwarded-For': ipNueva() }, { email: consulta.email });
        expect(status).toBe(200);
      }
      await conIp(page, ipNueva());
      await page.goto('/soporte-consulta.html');
      await page.getByTestId('btn-perdi-codigo').click();
      await page.getByTestId('input-reenvio-email').fill(consulta.email);
      await page.getByTestId('btn-reenviar-codigo').click();

      await expect(page.getByTestId('aviso-reenvio-mensaje')).toHaveText(TEXTO_INTENTOS);
    });
  });

  test.describe('Conversación y turnos', () => {
    test('espera a Soporte: la caja queda deshabilitada y al responder Soporte le toca a la persona', async ({ page, request }) => {
      const consulta = await crearConsultaPublica(request);
      await conIp(page, consulta.ip);
      await abrirConsultaPublica(page, consulta);

      await expect(page.getByTestId('estado-consulta')).toHaveText('Esperando a Soporte');
      await expect(page.getByTestId('input-respuesta')).toBeDisabled();
      await expect(page.getByTestId('turno-respuesta')).toHaveText('Esperando la respuesta de Soporte.');
      await expect(page.getByTestId('btn-respuesta')).toBeDisabled();
      await capturarSoporte(page, '07-conversacion-espera-a-soporte');
      await sinScrollHorizontal(page);

      await responderComoSoporte(request, adminSesion.token, consulta.id, 'Hola, ¿podés darnos tu nombre de usuario?');
      await abrirConsultaPublica(page, consulta);
      await expect(page.getByTestId('estado-consulta')).toHaveText('Te toca responder');
      await expect(page.getByTestId('mensaje-autor').nth(1)).toHaveText('Soporte');
      await expect(page.getByTestId('input-respuesta')).toBeEnabled();
      await expect(page.getByTestId('contador-respuesta')).toHaveText('0 / 1000 · quedan 18 mensajes');
      await capturarSoporte(page, '08-conversacion-te-toca-responder');
    });

    test('la persona responde: botón "Enviando…", toast, la burbuja aparece y vuelve a esperar a Soporte', async ({ page, request }) => {
      const consulta = await crearConsultaPublica(request);
      await responderComoSoporte(request, adminSesion.token, consulta.id);
      let pedidos = 0;
      await page.route('**/api/v1/soporte/publico/consultas/responder', async (ruta) => {
        pedidos += 1;
        await new Promise((resolver) => setTimeout(resolver, 600));
        await ruta.continue({ headers: { ...ruta.request().headers(), 'x-forwarded-for': consulta.ip } });
      });
      await page.route('**/api/v1/soporte/publico/consultas/ver', (ruta) => ruta.continue({ headers: { ...ruta.request().headers(), 'x-forwarded-for': consulta.ip } }));
      await abrirConsultaPublica(page, consulta);

      await page.getByTestId('input-respuesta').fill('Mi usuario es pepe12345');
      await expect(page.getByTestId('contador-respuesta')).toHaveText('23 / 1000 · quedan 18 mensajes');
      await page.getByTestId('btn-respuesta').dblclick();
      await expect(page.getByTestId('btn-respuesta')).toHaveText('Enviando…');
      await expect(page.getByTestId('btn-respuesta')).toBeDisabled();

      await expect(page.locator('.toast')).toContainText('Respuesta enviada');
      await expect(page.getByTestId('mensaje-consulta')).toHaveCount(3);
      await expect(page.getByTestId('mensaje-texto').last()).toHaveText('Mi usuario es pepe12345');
      await expect(page.getByTestId('mensaje-autor').last()).toHaveText('Vos');
      await expect(page.getByTestId('estado-consulta')).toHaveText('Esperando a Soporte');
      await expect(page.getByTestId('turno-respuesta')).toHaveText('Esperando la respuesta de Soporte.');
      expect(pedidos).toBe(1);
      expect(estadoDeLaConsulta(consulta.id)).toBe('ESPERA_SOPORTE');
    });

    test('un mensaje con HTML se muestra literal y no se ejecuta', async ({ page, request }) => {
      const peligroso = '<b>negrita</b> <img src=x onerror="window.__xss=1"> <script>window.__xss=2</script>';
      const consulta = await crearConsultaPublica(request, { mensaje: peligroso });
      await responderComoSoporte(request, adminSesion.token, consulta.id, '<i>cursiva</i> de Soporte');
      await conIp(page, consulta.ip);
      await abrirConsultaPublica(page, consulta);

      await expect(page.getByTestId('mensaje-texto').first()).toHaveText(peligroso);
      await expect(page.getByTestId('mensaje-texto').nth(1)).toHaveText('<i>cursiva</i> de Soporte');
      await expect(page.getByTestId('hilo-consulta').locator('b, i, img, script')).toHaveCount(0);
      expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    });

    test('cerrada: muestra el texto y el botón para enviar una consulta nueva', async ({ page, request }) => {
      const consulta = await crearConsultaPublica(request);
      await cerrarComoSoporte(request, adminSesion.token, consulta.id);
      await conIp(page, consulta.ip);
      await abrirConsultaPublica(page, consulta);

      await expect(page.getByTestId('estado-consulta')).toHaveText('Cerrada');
      await expect(page.getByTestId('texto-consulta-cerrada')).toHaveText(TEXTO_CERRADA);
      await expect(page.getByTestId('input-respuesta')).toHaveCount(0);
      await expect(page.getByTestId('btn-consulta-nueva')).toHaveAttribute('href', 'soporte.html');
      await capturarSoporte(page, '09-conversacion-cerrada');
      await sinScrollHorizontal(page);
    });

    test('si Soporte cierra mientras la persona escribe, al enviar ve el aviso y la conversación se actualiza', async ({ page, request }) => {
      const consulta = await crearConsultaPublica(request);
      await responderComoSoporte(request, adminSesion.token, consulta.id);
      await conIp(page, consulta.ip);
      await abrirConsultaPublica(page, consulta);
      await page.getByTestId('input-respuesta').fill('Ya lo resolví, gracias');
      await cerrarComoSoporte(request, adminSesion.token, consulta.id);

      await page.getByTestId('btn-respuesta').click();
      await expect(page.getByTestId('texto-consulta-cerrada')).toHaveText(TEXTO_CERRADA);
      await expect(page.getByTestId('estado-consulta')).toHaveText('Cerrada');
    });

    test('al llegar al tope de 20 mensajes la consulta cierra sola y muestra el aviso de la API', async ({ page, request }) => {
      const consulta = await crearConsultaPublica(request);
      for (let i = 0; i < 8; i += 1) {
        await responderComoSoporte(request, adminSesion.token, consulta.id, `Respuesta de Soporte número ${i + 1}`);
        await responderComoPersonaPublica(request, consulta, `Respuesta de la persona número ${i + 1}`);
      }
      await responderComoSoporte(request, adminSesion.token, consulta.id, 'Respuesta de Soporte número 9');
      await conIp(page, consulta.ip);
      await abrirConsultaPublica(page, consulta);
      await expect(page.getByTestId('contador-respuesta')).toHaveText('0 / 1000 · quedan 2 mensajes');

      await page.getByTestId('input-respuesta').fill('Último mensaje de la persona');
      await page.getByTestId('btn-respuesta').click();
      await expect(page.locator('.toast')).toContainText('Respuesta enviada');
      await expect(page.getByTestId('mensaje-consulta')).toHaveCount(19);
      await expect(page.getByTestId('turno-respuesta')).toHaveText('Esperando la respuesta de Soporte.');

      await responderComoSoporte(request, adminSesion.token, consulta.id, 'Cerramos la consulta con este mensaje');
      expect(estadoDeLaConsulta(consulta.id)).toBe('CERRADO');
      await abrirConsultaPublica(page, consulta);
      await expect(page.getByTestId('mensaje-consulta')).toHaveCount(20);
      await expect(page.getByTestId('texto-consulta-cerrada')).toHaveText('Llegamos al máximo de mensajes de esta consulta. Si necesitás algo más, enviá una consulta nueva.');
      await capturarSoporte(page, '10-conversacion-tope-de-mensajes', true);
    });
  });

  test.describe('Límites al enviar', () => {
    async function enviarDesdeElFormulario(page: Page, email: string) {
      await page.goto('/soporte.html');
      await completarFormulario(page, email, 'OTRA', MENSAJE_INICIAL);
      await page.getByTestId('btn-enviar-consulta').click();
    }

    test('la cuarta consulta del día de un mismo email muestra el límite diario', async ({ page, request }) => {
      const email = emailUnico();
      for (let i = 0; i < 3; i += 1) await crearConsultaPublica(request, { email });
      await conIp(page, ipNueva());
      await enviarDesdeElFormulario(page, email);

      await expect(page.getByTestId('aviso-soporte-mensaje')).toHaveText(TEXTO_DIARIO);
      await expect(page.getByTestId('aviso-soporte-mensaje')).toBeFocused();
      await expect(page.getByTestId('btn-enviar-consulta')).toBeEnabled();
      await capturarSoporte(page, '11-formulario-limite-diario');
      expect(Number(sql(`SELECT COUNT(*) FROM ticket_soporte WHERE email = '${email}';`))).toBe(3);
    });

    test('con tres consultas abiertas de días anteriores muestra el límite de abiertas', async ({ page, request }) => {
      const email = emailUnico();
      for (let i = 0; i < 3; i += 1) await crearConsultaPublica(request, { email });
      sql(`UPDATE ticket_soporte SET creado_en = DATE_SUB(creado_en, INTERVAL 2 DAY) WHERE email = '${email}';`);
      await conIp(page, ipNueva());
      await enviarDesdeElFormulario(page, email);

      await expect(page.getByTestId('aviso-soporte-mensaje')).toHaveText(TEXTO_ABIERTAS);
    });

    test('la consulta once desde una misma conexión muestra el límite por conexión', async ({ page, request }) => {
      const ip = ipNueva();
      for (let i = 0; i < 10; i += 1) await crearConsultaPublica(request, { ip });
      await conIp(page, ip);
      await enviarDesdeElFormulario(page, emailUnico());

      await expect(page.getByTestId('aviso-soporte-mensaje')).toHaveText(TEXTO_POR_IP);
    });
  });

  test('no hay JWT ni datos personales en ninguna URL del recorrido', async ({ page, request }) => {
    const consulta = await crearConsultaPublica(request);
    const urls: string[] = [];
    page.on('request', (peticion) => urls.push(peticion.url()));
    await conIp(page, consulta.ip);
    await abrirConsultaPublica(page, consulta);

    expect(urls.filter((url) => url.includes(consulta.codigo) || url.includes(encodeURIComponent(consulta.email)) || url.includes('token'))).toEqual([]);
  });
});
